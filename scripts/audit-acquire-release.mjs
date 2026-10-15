// scripts/audit-acquire-release.mjs — ACQUISITION ↔ RELEASE GATE (round 13 / task-102; paradigm criteria C6 + D7).
//
// WHY THIS EXISTS (the class, measured in rounds 11–12). A `finally` is owed exactly where a function ACQUIRES
// something that must be returned even when the body throws — a lock, a timer, a listener. Three instances of the
// class were found by hand before this gate existed:
//   · `kernel/index.js:1953` — the exit-flush single-flight flag; the THROWING exit leaked it (narrow mutant only).
//   · `kernel/mathjobs.js:587` — the concurrency slot; its `finally` turned out to be DEFENSIVE (executeInner
//     returns failures as receipts), so the load-bearing line is `releaseSlot` — named, not silently dropped.
//   · `records`/`store` — NO `finally` at all, because those faces hold nothing across a call (0 acquisition sites);
//     the honest form is a TRIPWIRE: the moment one appears, this gate goes red.
//
// SEPARATION OF INSTRUMENTS (ruling): `tests/audit-enforced-consistency.test.mjs` judges DECLARATION ↔ IMPLEMENTATION.
// THIS gate judges ACQUISITION ↔ RELEASE. They must not share one counter — two facts in one number mask each other.
//
// WHAT IT CHECKS (exit non-zero on any):
//   §0 THE FOUR PREDICATE SELF-PROOFS, before any real file is judged (so "any `acquire` is red" is impossible):
//      acquisition without `finally` ⇒ FIRES; the SAME acquisition with `finally` ⇒ QUIET; a timer/listener ⇒
//      FIRES; a comment/string ⇒ QUIET (D7: a mention is not a site).
//   §1 THE INJECTION + THE POSITIVE CONTROL: one line injected into the REAL `write()` body (text-only, via the
//      falsify library's `mutateOnce`) must redden BOTH granularities; `kernel/resume.js` (which really acquires
//      across calls) must be seen with its acquisition AND its `finally`, so "clean" cannot mean "blind".
//   §2 FILE LEVEL: every file with an acquisition site must carry a ruling row; the file-level rule is
//      "sites > 0 and no `finally`" ⇒ red, unless an exemption word VERIFIES (see §4).
//   §3 CALL LEVEL: a closed list of (file, marker) contracts whose FUNCTION BODY must contain no acquisition site
//      (brace-matched extraction — "若 `write()` 体内出现 `acquire()`").
//   §4 THE CLOSED RULING VOCABULARY (a word outside it is red, and each word is mechanically verified):
//        `成对-finally`  — verified: the code contains a `finally`.
//        `不涉及`        — verified: ZERO acquisition sites (the records/store TRIPWIRE lives on this word).
//        `睡式-无柄`     — verified: EVERY timer site is a promise-wrapped sleep ⇒ no handle exists to release.
//        `他门已守`      — verified: the row names ≥1 existing `tests/*.mjs`／`scripts/*.mjs` that really MENTIONS
//                          the module (no dead pointer, no pointer that never guards it).
//
//   node scripts/audit-acquire-release.mjs            # normal run (self-proofs first, then the real tree)
//   node scripts/audit-acquire-release.mjs --selftest # only the vacuity self-probes (the execution point RULE A runs)
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { stripComments } from '../tests/_lib/strip-comments.mjs'
import { mutateOnce } from '../tests/_lib/falsify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const onlySelftest = process.argv.includes('--selftest')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const violation = (label, detail) => ok(false, label, detail)

// ── the acquisition vocabulary (closed: a site is one of these, nothing else counts) ────────────────────────
const ACQUISITIONS = Object.freeze([
  { kind: 'lock', re: /\.acquire\s*\(|\bacquireLock\s*\(/g },
  // A BARE `acquire(` is a call only when it is not a definition (`function acquire(`, `const acquire = (`).
  { kind: 'bare-lock', re: /(?<![\w$.])acquire\s*\(/g, skip: (code, m) => /(?:function|const|let|var)\s+$/.test(code.slice(Math.max(0, m.index - 16), m.index)) },
  { kind: 'timer', re: /(?<![\w$.])setTimeout\s*\(|(?<![\w$.])setInterval\s*\(/g },
  { kind: 'listener', re: /addEventListener\s*\(/g },
])
/** A promise-wrapped sleep (`await new Promise((r) => setTimeout(r, ms))`) binds NO handle: nothing to release. */
const isSleepSite = (code, index) => /new\s+Promise\s*\(/.test(code.slice(Math.max(0, index - 120), index))
/** Every acquisition site in CODE (comments and string/regex contents blanked — D7: a mention is not a site). */
function sitesOf(code) {
  const out = []
  for (const { kind, re, skip } of ACQUISITIONS) {
    for (const m of code.matchAll(re)) {
      if (skip && skip(code, m)) continue
      out.push({ kind, index: m.index, at: m[0].trim() })
    }
  }
  return out.sort((a, b) => a.index - b.index)
}
/** The brace-matched BODY of a function, so "inside `write()`" means inside it (not "somewhere in the file"). */
function bodyOf(code, marker) {
  const at = code.indexOf(marker)
  if (at === -1) return null
  const open = code.indexOf('{', at)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') { depth -= 1; if (depth === 0) return code.slice(open, i + 1) }
  }
  return null
}
/** The whole judgement of one source text: sites + whether a `finally` exists. Pure, so §0 can self-prove it. */
function auditSource(source) {
  const code = stripComments(String(source), { strings: true })
  const sites = sitesOf(code)
  return { code, sites, hasFinally: /\bfinally\b/.test(code), needsFinally: sites.length > 0 && !/\bfinally\b/.test(code) }
}

// ── the CLOSED ruling vocabulary ───────────────────────────────────────────────────────────────────────────
const RULING_WORDS = Object.freeze(['成对-finally', '不涉及', '睡式-无柄', '他门已守'])
/**
 * One row per file that HAS acquisition sites. The row is a decision, not a formality: each word is verified below,
 * so the row cannot be used to silence the gate. (A new file with a site and no row is red by construction.)
 */
const RULINGS = {
  'host-spawn.js': { word: '成对-finally', why: 'the child budget timer has its own handle, is `unref`ed and is cleared in a `finally` with a NAMED failure (VMU_SPAWN_TIMER_CLEANUP)' },
  'kernel/bus.js': { word: '成对-finally', why: 'the hook budget is cleared in `finally`, so a fast hook and a timed-out hook both release it' },
  'kernel/mathjobs.js': { word: '成对-finally', why: 'the child-budget race disposes its timer in a `finally` (:224) and a cleanup failure is NAMED (timer-cleanup-failed)' },
  'kernel/resume.js': { word: '成对-finally', why: 'F18: the recovery lock is taken around `recover()` and released in `finally` on EVERY path (throw/early-return included), proven by tests/vmu-resume-falsify.test.mjs' },
  'kernel/activity.js': { word: '他门已守', gates: ['tests/vmu-activity-timers.test.mjs', 'tests/vmu-activity-kernel.test.mjs'],
    why: 'the platform fallback timer and the abort listener are released through ONE idempotent `cleanup()` funnel on every settle path (no `finally` because the funnel is the single exit); the F15 table classifies this file `cleanup-on-every-branch` and the kernel probes drive all four branches' },
  'math-computation.js': { word: '睡式-无柄', why: 'both timer sites are `await new Promise((r) => setTimeout(r, ms))` sleeps: no handle is bound, so there is nothing to release. They are UNCANCELLABLE — a different defect, already a NAMED finding in tests/vmu-activity-timers.test.mjs §5' },
}
/** §3: a close list of function bodies that must acquire NOTHING (the criterion, applied where it was written). */
const CALL_CONTRACTS = Object.freeze([
  { file: 'kernel/storepolicy.js', marker: 'const write = (a) => {', why: 'the write path is a pure policy decision today; if it ever TAKES the lock, it must release it in a `finally` — and a falsify family belongs here' },
])
/**
 * §2's TRIPWIRE rows: files that must stay "acquires nothing" — the moment one grows a site the row stops
 * verifying and the gate names it. (These are the faces the round-11 criterion measured as 0/0/0/0/0.)
 */
const TRIPWIRE_FILES = Object.freeze(['kernel/records.js', 'kernel/storepolicy.js', 'kernel/store.js'])
for (const f of TRIPWIRE_FILES) RULINGS[f] = { word: '不涉及', why: 'holds only in-memory state: no lock taken inside a call, no timer, no listener (the round-11 five-column measurement)' }
Object.freeze(RULINGS)

/**
 * §4's verifier, at module scope so the SELFTEST can prove it bites. `info` is one audited file
 * (`{ file, sites, code, hasFinally }`). Returns a NAMED problem string, or null when the row verifies.
 */
function verifyRuling(row, info) {
  if (!row || !RULING_WORDS.includes(row.word)) return 'UNKNOWN-RULING: `' + (row && row.word) + '` is outside the closed vocabulary ' + JSON.stringify(RULING_WORDS)
  if (row.word === '不涉及') return info.sites.length === 0 ? null : 'TRIPWIRE: declared `不涉及` but now carries ' + info.sites.length + ' acquisition site(s): ' + info.sites.map((s) => s.kind + '@' + s.at).join(', ')
  if (row.word === '成对-finally') return info.hasFinally ? null : 'declared `成对-finally` but the code has no `finally`'
  if (row.word === '睡式-无柄') {
    const bad = info.sites.filter((s) => s.kind !== 'timer' || !isSleepSite(info.code, s.index))
    return bad.length === 0 ? null : 'declared `睡式-无柄` but ' + bad.length + ' site(s) are not promise-wrapped sleeps: ' + bad.map((s) => s.kind + '@' + s.at).join(', ')
  }
  if (row.word === '他门已守') {
    const gates = Array.isArray(row.gates) ? row.gates.filter(Boolean) : []
    if (gates.length === 0) return 'declared `他门已守` without naming a gate'
    for (const g of gates) {
      if (!/^(?:tests|scripts)\/[^\s]+\.mjs$/.test(g)) return 'gate pointer `' + g + '` is outside the closed shape tests/*.mjs|scripts/*.mjs'
      const gp = join(REPO, g)
      if (!existsSync(gp)) return 'DEAD-POINTER: gate `' + g + '` does not exist'
      if (!readFileSync(gp, 'utf8').includes(basename(info.file))) return 'POINTER-DOES-NOT-GUARD: `' + g + '` never mentions ' + basename(info.file)
    }
    return null
  }
  return 'UNHANDLED-RULING-WORD: ' + row.word
}

// ── §0 the four predicate self-proofs (BEFORE any real file is judged) ─────────────────────────────────────
console.log('=== §0 SELF-PROOF: the predicate bites, and only where it should (four cases) ===')
const SYNTH = Object.freeze({
  acquiredNoFinally: 'function f(s) { const l = s.acquire({ name: "x" }); return l }',
  acquiredWithFinally: 'function f(s) { const l = s.acquire({ name: "x" }); try { return l } finally { s.release({ name: "x" }) } }',
  timerNoFinally: 'function f() { setTimeout(() => {}, 10) }',
  listenerNoFinally: 'function f(sig) { sig.addEventListener("abort", () => {}) }',
  commentOnly: '// example: s.acquire({name:"x"}) and setTimeout(f, 10)\nfunction f() { return 1 }',
  stringOnly: 'function f() { return "setTimeout(" + "s.acquire(" }',
  definitionOnly: 'const acquire = (a) => a\nfunction use() { return acquire({ name: "x" }) }',
})
const scan = (k) => auditSource(SYNTH[k])
ok(scan('acquiredNoFinally').needsFinally === true && scan('timerNoFinally').needsFinally === true && scan('listenerNoFinally').needsFinally === true,
  '★ (1)+(3) an acquisition — lock, timer OR listener — with NO `finally` FIRES the predicate',
  { lock: scan('acquiredNoFinally'), timer: scan('timerNoFinally'), listener: scan('listenerNoFinally') })
ok(scan('acquiredWithFinally').needsFinally === false && scan('acquiredWithFinally').sites.length === 1,
  '★ (2) the SAME acquisition WITH a `finally` is QUIET (the site is still SEEN — so the rule is not "any acquire is red")', scan('acquiredWithFinally'))
ok(scan('commentOnly').needsFinally === false && scan('stringOnly').needsFinally === false && scan('definitionOnly').sites.length !== 0 && scan('definitionOnly').needsFinally === true,
  '★ (4) a comment and a string are NOT sites (D7), while a real bare `acquire(` CALL still is (a definition is not a call)', { comment: scan('commentOnly'), string: scan('stringOnly'), def: scan('definitionOnly') })

// ── §0b the RULING vocabulary is a closed set AND every word is verified (a row cannot silence the gate) ───
console.log('=== §0b SELF-PROOF: the ruling vocabulary bites in all five directions ===')
{
  const withSites = Object.assign({ file: 'kernel/records.js' }, auditSource(SYNTH.acquiredNoFinally))
  const noSites = Object.assign({ file: 'kernel/records.js' }, auditSource('function f() { return 1 }'))
  const sleeping = Object.assign({ file: 'math-computation.js' }, auditSource('async function f() { await new Promise((r) => setTimeout(r, 5)) }'))
  const guarded = { word: '他门已守', gates: ['tests/vmu-activity-timers.test.mjs'] }
  const activityInfo = Object.assign({ file: 'kernel/activity.js' }, auditSource(SYNTH.timerNoFinally))
  const probes = [
    ['a non-sleep site cannot be declared `睡式-无柄`', verifyRuling({ word: '睡式-无柄' }, withSites)],
    ['a declared `不涉及` stops verifying the moment a site appears (the TRIPWIRE)', verifyRuling({ word: '不涉及' }, withSites)],
    ['a declared `成对-finally` without a `finally` is refused', verifyRuling({ word: '成对-finally' }, withSites)],
    ['a word outside the closed vocabulary is refused', verifyRuling({ word: '看起来没问题' }, noSites)],
    ['`他门已守` without a gate, with a DEAD gate, or with a gate that never mentions the module is refused',
      [verifyRuling({ word: '他门已守' }, activityInfo), verifyRuling({ word: '他门已守', gates: ['tests/does-not-exist.test.mjs'] }, activityInfo),
        verifyRuling({ word: '他门已守', gates: ['tests/vmu-chat-falsify.test.mjs'] }, activityInfo), verifyRuling(guarded, activityInfo)]],
    ['the VERIFIED directions stay green (a real sleep, a real gate pointer, a real `finally`)',
      [verifyRuling({ word: '睡式-无柄' }, sleeping), verifyRuling({ word: '不涉及' }, noSites), verifyRuling({ word: '成对-finally' }, Object.assign({}, withSites, { hasFinally: true }))]],
  ]
  const refused = probes.slice(0, 5).every(([, r]) => (Array.isArray(r) ? r.slice(0, 3).every((x) => typeof x === 'string' && x.length > 0) : typeof r === 'string' && r.length > 0))
  const accepted = probes[5][1].every((x) => x === null)
  ok(refused && accepted,
    '★ five directions refused BY NAME (unknown word / tripwire / unbacked `成对-finally` / unbacked `睡式-无柄` / dead or non-guarding pointer) and three verified directions stay green',
    { refused, accepted, detail: probes })
}

// ── §1 the injection into a REAL file + the positive control ───────────────────────────────────────────────
console.log('=== §1 INJECTION + POSITIVE CONTROL (both on real sources) ===')
const storepolicySrc = readFileSync(join(VMU, CALL_CONTRACTS[0].file), 'utf8')
const injected = mutateOnce(storepolicySrc, {
  find: CALL_CONTRACTS[0].marker,
  replace: CALL_CONTRACTS[0].marker + "\n    if (locks) locks.set('probe', { by: 'probe' }); if (typeof lockSeam !== 'undefined') lockSeam.acquire({ name: 'w' })",
})
const injectedFile = auditSource(injected.text)
const injectedBody = bodyOf(injectedFile.code, CALL_CONTRACTS[0].marker)
ok(injectedFile.needsFinally === true && !!injectedBody && sitesOf(injectedBody).length > 0,
  '★ one injected line in the REAL `write()` body reddens BOTH granularities (file level `needsFinally` AND call level inside the body) — so the green below is aimed, not blind',
  { fileLevelNeedsFinally: injectedFile.needsFinally, callLevelSites: injectedBody ? sitesOf(injectedBody).map((s) => s.at) : null })
const resumeSrc = readFileSync(join(VMU, 'kernel/resume.js'), 'utf8')
const resumeAudit = auditSource(resumeSrc)
ok(resumeAudit.sites.length > 0 && resumeAudit.hasFinally === true && resumeAudit.needsFinally === false,
  'control: `kernel/resume.js` really acquires across calls and carries a `finally` — the scanner sees BOTH halves', { sites: resumeAudit.sites.map((s) => s.at), hasFinally: resumeAudit.hasFinally })

if (!onlySelftest) {
  // ── §2/§3/§4 judge the real tree ─────────────────────────────────────────────────────────────────────────
  console.log('=== §2 FILE LEVEL + §4 RULINGS (every file with a site must carry a VERIFIED ruling) ===')
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js')) files.push(p)
    }
  }
  walk(VMU)
  const rel = (p) => p.slice(VMU.length + 1).split('\\').join('/')
  const judged = files.map((p) => Object.assign({ rel: rel(p) }, auditSource(readFileSync(p, 'utf8')))).filter((r) => r.sites.length > 0)
  ok(files.length > 0 && judged.length > 0, 'the scan found the acquisition-carrying modules (non-vacuous: ' + files.length + ' files walked, ' + judged.length + ' with sites)', judged.map((j) => j.rel))

  const unregistered = judged.filter((j) => !RULINGS[j.rel]).map((j) => j.rel)
  ok(unregistered.length === 0, '★ every file with an acquisition site carries a ruling row (a new module cannot appear silently)', unregistered)
  const rulingProblems = []
  for (const j of judged) {
    const row = RULINGS[j.rel]
    if (!row) continue
    const problem = verifyRuling(row, Object.assign({}, j, { file: j.rel }))
    if (problem) rulingProblems.push(j.rel + ': ' + problem)
  }
  ok(rulingProblems.length === 0, '★ every ruling row VERIFIES against the code (the closed vocabulary is a decision, not a silencing device)', rulingProblems)
  const noFinallyNoRow = judged.filter((j) => j.needsFinally && (!RULINGS[j.rel] || RULINGS[j.rel].word === '不涉及')).map((j) => j.rel)
  ok(noFinallyNoRow.length === 0, '★ FILE LEVEL: no file acquires without a `finally` except under a VERIFIED exemption word', noFinallyNoRow)
  ok(RULING_WORDS.length >= 4 && judged.length >= 4, 'the vocabulary and the judged set are both substantive (non-vacuous)', { words: RULING_WORDS.length, judged: judged.length })

  console.log('=== §3 CALL LEVEL (a declared function body must acquire nothing) ===')
  const contractProblems = []
  for (const c of CALL_CONTRACTS) {
    const src = readFileSync(join(VMU, c.file), 'utf8')
    const code = stripComments(src, { strings: true })
    const body = bodyOf(code, c.marker)
    if (!body) { contractProblems.push(c.file + ': the marker `' + c.marker + '` was not found (a contract that cannot be located is not a check)'); continue }
    if (body.length === 0) { contractProblems.push(c.file + ': an EMPTY body would make this contract vacuous'); continue }
    const hits = sitesOf(body)
    if (hits.length > 0) contractProblems.push(c.file + ' `' + c.marker + '`: ' + hits.map((s) => s.at).join(', '))
  }
  ok(contractProblems.length === 0, '★ every call-level contract holds (extracted by brace matching, so "inside the body" is real)', contractProblems)

  console.log('=== §5 TRIPWIRE: the records/store faces still acquire nothing ===')
  const tripwireProblems = TRIPWIRE_FILES.filter((f) => {
    const src = readFileSync(join(VMU, f), 'utf8')
    return sitesOf(stripComments(src, { strings: true })).length > 0
  })
  ok(TRIPWIRE_FILES.length > 0 && tripwireProblems.length === 0,
    '★ `records.js`／`storepolicy.js`／`store.js` still hold no acquisition (the day one does, this line AND the §4 ruling both go red — the condition appearing is the red)', tripwireProblems)

  console.log('  judged=' + judged.length + ' files with sites, rulings=' + Object.keys(RULINGS).length + ', tripwire=' + TRIPWIRE_FILES.length + ', call-contracts=' + CALL_CONTRACTS.length)
}

console.log('')
console.log('=== ACQUIRE↔RELEASE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
process.exit(failed === 0 ? 0 : 1)
