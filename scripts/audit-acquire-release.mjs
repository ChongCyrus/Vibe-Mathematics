// scripts/audit-acquire-release.mjs — ACQUISITION ↔ RELEASE GATE (round 13 / task-102; round 14 / task-110 收口).
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
// (Measured R14: the two files mention each other nowhere; the only other mention of this gate is the RULE A
// execution point in `tests/audit-declaration-criterion.test.mjs`. No shared tally exists.)
//
// ROUND 14 / task-110 — WHAT WAS FALSE IN THIS GATE, AND WHAT IS NOW MEASURED RATHER THAN ASSERTED.
// The predecessor filed `kernel/storepolicy.js` inside the records/store tripwire as `不涉及`, with the reason
// "no lock taken inside a call". THAT REASON IS FALSE, and the gate could not see it: storepolicy's lock is taken by
// the module's OWN `acquire()` — a DEFINITION, which the acquisition vocabulary deliberately skips — and held in a
// `locks` Map ACROSS calls. Measured on the live module (R14, see the report):
//   acquire({name:'a',by:'m1'}) ⇒ {ok:true, locked:true} ; status().locks === 1 ;
//   acquire({name:'a',by:'m2'}) ⇒ refused BY NAME VMU_CONFLICT ; release({name:'a'}) ⇒ released:true ; locks === 0.
// So "acquires nothing" is the wrong word for that file. The honest word is a FIFTH one — `自持-取释面` ("this file
// IS the acquire/release authority") — and it is verified MECHANICALLY (really holds a lock store; really names a
// gate; carries no timer/listener; acquires nothing else). A `不涉及` row on a file that hands out locks is now
// refused BY NAME. Two lessons are applied rather than repeated:
//   · §4.2-第四/九条 — the real-tree rule is a PURE function (`judgeTree`) driven by a planted-violation self-proof,
//     so the rule has teeth even in `--selftest` mode (where the live walk is skipped), and the skip has an opposite
//     switch (`--require-tree`);
//   · §4.2-第七条 (D7) — every static read goes through `stripComments(…, { strings: true })`, so a comment or a
//     string cannot fake a site; and a DEFINITION is not a CALL, with both directions self-proven.
//
// WHAT IT CHECKS (exit non-zero on any):
//   §0 THE FOUR PREDICATE SELF-PROOFS, before any real file is judged (so "any `acquire` is red" is impossible):
//      acquisition without `finally` ⇒ FIRES; the SAME acquisition with `finally` ⇒ QUIET; a timer/listener ⇒
//      FIRES; a comment/string ⇒ QUIET (D7: a mention is not a site). Each case prints its raw reading.
//   §0b THE RULING VOCABULARY is a CLOSED set AND every word is mechanically verified (a row cannot silence the gate).
//   §0c THE AUTHORITY WORD — the R14 fix — bites in five directions, including "the authority GREW a timer/listener".
//   §0d THE REAL-TREE RULE has teeth: five planted violations each redden the list they name, and the honest fixture
//      leaves all five lists EMPTY (so the planted direction is not "everything is always red").
//   §1 THE INJECTION + THE POSITIVE CONTROL: one line injected into the REAL `write()` body (text-only, via the
//      falsify library's `mutateOnce`) must redden BOTH granularities; `kernel/resume.js` (which really acquires
//      across calls) must be seen with its acquisition AND its `finally`, so "clean" cannot mean "blind".
//   §2 FILE LEVEL: every file with an acquisition site must carry a ruling row; the file-level rule is
//      "sites > 0 and no `finally`" ⇒ red, unless an exemption word VERIFIES (see §4).
//   §3 CALL LEVEL: a closed list of (file, marker) contracts whose FUNCTION BODY must contain no acquisition site
//      (brace-matched extraction — "若 `write()` 体内出现 `acquire()`").
//   §4 THE CLOSED RULING VOCABULARY (a word outside it is red, and each word is mechanically verified):
//        `成对-finally`  — verified: the code contains a `finally`.
//        `不涉及`        — verified: ZERO acquisition sites AND **not an authority** (no lock store: R14 fix).
//        `睡式-无柄`     — verified: EVERY timer site is a promise-wrapped sleep ⇒ no handle exists to release.
//        `他门已守`      — verified: the row names ≥1 existing `tests/*.mjs`／`scripts/*.mjs` that really MENTIONS
//                          the module (no dead pointer, no pointer that never guards it).
//        `自持-取释面`   — verified: the file really holds a lock store (`locks.set/delete`), acquires nothing else,
//                          carries NO timer/listener (the day one appears ⇒ red BY NAME: a lock held across a
//                          timer/listener must be released in a `finally`), and names a real gate.
//   §5  TRIPWIRE: `records.js`／`store.js` must stay "acquires nothing" (the round-11 five-column measurement).
//   §5b AUTHORITY TRIPWIRE: the lock authorities are a CLOSED list — a new file with a lock store is red, and the
//       named authority must still carry no timer/listener.
//
//   node scripts/audit-acquire-release.mjs               # normal run (self-proofs first, then the real tree)
//   node scripts/audit-acquire-release.mjs --selftest    # only the vacuity self-probes (§0–§0d; what RULE A runs)
//   node scripts/audit-acquire-release.mjs --require-tree # force the LIVE tree walk even together with --selftest
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { stripComments } from '../tests/_lib/strip-comments.mjs'
import { mutateOnce } from '../tests/_lib/falsify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const onlySelftest = process.argv.includes('--selftest')
const requireTree = process.argv.includes('--require-tree')
const walkTree = !onlySelftest || requireTree

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const reading = (label, value) => console.log('  reading ' + label + ': ' + JSON.stringify(value))

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
/**
 * NOT an acquisition site — the opposite evidence: a file that really HANDS OUT locks. The R14 finding is exactly
 * that the acquisition vocabulary cannot see this shape (the lock is taken inside the authority's own `acquire()`,
 * whose DEFINITION the vocabulary skips on purpose), so it needs its own detector and its own ruling word.
 */
const LOCK_STORE_RE = /\blocks\s*\.\s*(?:set|delete)\s*\(/g
const lockStoreSites = (code) => [...String(code).matchAll(LOCK_STORE_RE)].map((m) => m[0].replace(/\s+/g, ''))
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
const RULING_WORDS = Object.freeze(['成对-finally', '不涉及', '睡式-无柄', '他门已守', '自持-取释面'])
/** The gate-pointer checker shared by `他门已守` and `自持-取释面`: a pointer must exist AND really guard the module. */
function verifyGatePointers(gates, file) {
  const list = Array.isArray(gates) ? gates.filter(Boolean) : []
  if (list.length === 0) return 'without naming a gate'
  for (const g of list) {
    if (!/^(?:tests|scripts)\/[^\s]+\.mjs$/.test(g)) return 'gate pointer `' + g + '` is outside the closed shape tests/*.mjs|scripts/*.mjs'
    const gp = join(REPO, g)
    if (!existsSync(gp)) return 'DEAD-POINTER: gate `' + g + '` does not exist'
    if (!readFileSync(gp, 'utf8').includes(basename(file))) return 'POINTER-DOES-NOT-GUARD: `' + g + '` never mentions ' + basename(file)
  }
  return null
}
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
 * ROUND 14: `storepolicy.js` is REMOVED from this list — it is not "acquires nothing", it is the authority
 * (see the `自持-取释面` row below). Leaving it here is what the false `不涉及` was made of.
 */
const TRIPWIRE_FILES = Object.freeze(['kernel/records.js', 'kernel/store.js'])
for (const f of TRIPWIRE_FILES) RULINGS[f] = { word: '不涉及', why: 'holds only in-memory state: no lock taken inside a call, no timer, no listener, and NO lock store to hand out (the round-11 five-column measurement, re-measured R14 with the lock-store detector)' }
/**
 * ROUND 14 / task-110 — THE AUTHORITY ROW. `kernel/storepolicy.js` is the ONLY file in the kernel that holds a lock
 * store (`locks.set`／`locks.delete`) and it really takes a lock inside a call (measured: status().locks === 1 after
 * `acquire`, VMU_CONFLICT on a second acquire, 0 after `release`). No `finally` is owed — and the reason is a
 * DERIVATION, not a preference: the release is a SEPARATE API CALL (a `finally` cannot span two calls), and the
 * bounded retry is a VIRTUAL-CLOCK step (waitedMs = backoffMs × attempts), so no timer handle exists to leak. The
 * word is verified mechanically; the day the authority grows a timer/listener, this row reds BY NAME.
 */
RULINGS['kernel/storepolicy.js'] = {
  word: '自持-取释面',
  gates: ['tests/vmu-storepolicy-falsify.test.mjs'],
  why: 'the module IS the lock authority: `acquire()` sets `locks` (status().locks counts it; a second acquire is refused VMU_CONFLICT) and `release()` is a SEPARATE call that deletes it. A caller-scoped lock cannot be expressed by a single-call `finally`; the retry wait is virtual-clock arithmetic, not a sleep. tests/vmu-storepolicy-falsify.test.mjs falsifies the release discipline in both directions (release keeps it / never records the holder).',
}
Object.freeze(RULINGS)

/**
 * §4's verifier, at module scope so the SELFTEST can prove it bites. `info` is one audited file
 * (`{ file, sites, code, hasFinally }`). Returns a NAMED problem string, or null when the row verifies.
 */
function verifyRuling(row, info) {
  if (!row || !RULING_WORDS.includes(row.word)) return 'UNKNOWN-RULING: `' + (row && row.word) + '` is outside the closed vocabulary ' + JSON.stringify(RULING_WORDS)
  if (row.word === '不涉及') {
    if (info.sites.length > 0) return 'TRIPWIRE: declared `不涉及` but now carries ' + info.sites.length + ' acquisition site(s): ' + info.sites.map((s) => s.kind + '@' + s.at).join(', ')
    // R14: "acquires nothing" is a two-part claim — no acquisition site AND no lock store to hand out.
    const store = lockStoreSites(info.code)
    if (store.length > 0) return 'FALSE-不涉及: the file HANDS OUT locks (' + store.join(', ') + ') while declaring `不涉及` — "acquires nothing" is false for a lock authority; the honest word is `自持-取释面`'
    return null
  }
  if (row.word === '成对-finally') return info.hasFinally ? null : 'declared `成对-finally` but the code has no `finally`'
  if (row.word === '睡式-无柄') {
    const bad = info.sites.filter((s) => s.kind !== 'timer' || !isSleepSite(info.code, s.index))
    return bad.length === 0 ? null : 'declared `睡式-无柄` but ' + bad.length + ' site(s) are not promise-wrapped sleeps: ' + bad.map((s) => s.kind + '@' + s.at).join(', ')
  }
  if (row.word === '他门已守') {
    const problem = verifyGatePointers(row.gates, info.file)
    return problem === null ? null : 'declared `他门已守` ' + problem
  }
  if (row.word === '自持-取释面') {
    const store = lockStoreSites(info.code)
    if (store.length === 0) return 'declared `自持-取释面` but the code holds NO lock store (' + String(LOCK_STORE_RE.source) + ') — this word is for files that really hand out locks, not a blanket exemption'
    const timed = info.sites.filter((s) => s.kind === 'timer' || s.kind === 'listener')
    if (timed.length > 0) return 'OWES-FINALLY: the lock authority GREW ' + timed.length + ' timer/listener site(s) ' + timed.map((s) => s.kind + '@' + s.at).join(', ') + ' — a lock held across a timer/listener can leak on the throwing exit, so a `finally` is owed NOW (this is the "条件出现即红" of the criterion, not a new preference)'
    if (info.sites.length > 0) return 'declared `自持-取释面` but the file ALSO acquires elsewhere: ' + info.sites.map((s) => s.kind + '@' + s.at).join(', ') + ' (the authority shape is "hands out locks and takes none of its own")'
    const problem = verifyGatePointers(row.gates, info.file)
    return problem === null ? null : 'declared `自持-取释面` ' + problem
  }
  return 'UNHANDLED-RULING-WORD: ' + row.word
}

/**
 * §2／§3／§5 AS A PURE RULE over a file list. The LIVE run feeds THIS function the real tree; §0d feeds it the same
 * function with planted violations. (A proof against a re-implementation of the rule would prove nothing — §4.2-第四/九条.)
 */
function judgeTree({ files, rulings, contracts, tripwires }) {
  const judged = files.filter((f) => f.sites.length > 0)
  const unregistered = judged.filter((j) => !rulings[j.rel]).map((j) => j.rel)
  const rulingProblems = []
  // R14: EVERY row is a CLAIM, so EVERY row is verified against the file it names — not only the rows of files that
  // happen to carry a site. This is the second half of the R13 defect: `storepolicy.js` had 0 sites, so it was never
  // in `judged`, so its false `不涉及` was never even handed to `verifyRuling`.
  const staleRows = Object.keys(rulings).filter((r) => !files.some((f) => f.rel === r))
  for (const r of staleRows) rulingProblems.push(r + ': STALE-ROW — the ruling names a file that is not in the scanned set (an exemption for a file nobody reads is not an exemption)')
  for (const f of files) {
    const row = rulings[f.rel]
    if (!row) continue
    const problem = verifyRuling(row, Object.assign({}, f, { file: f.rel }))
    if (problem) rulingProblems.push(f.rel + ': ' + problem)
  }
  const fileLevel = judged.filter((j) => j.needsFinally && (!rulings[j.rel] || rulings[j.rel].word === '不涉及')).map((j) => j.rel)
  const callLevel = []
  for (const c of contracts) {
    const f = files.find((x) => x.rel === c.file)
    if (!f) { callLevel.push(c.file + ': the contracted file is not in the scanned set'); continue }
    const body = bodyOf(f.code, c.marker)
    if (!body) { callLevel.push(c.file + ': the marker `' + c.marker + '` was not found (a contract that cannot be located is not a check)'); continue }
    if (body.length === 0) { callLevel.push(c.file + ': an EMPTY body would make this contract vacuous'); continue }
    const hits = sitesOf(body)
    if (hits.length > 0) callLevel.push(c.file + ' `' + c.marker + '`: ' + hits.map((s) => s.at).join(', '))
  }
  const tripwire = tripwires.filter((f) => {
    const x = files.find((v) => v.rel === f)
    return !x ? true : sitesOf(x.code).length > 0
  })
  const authorities = files.filter((f) => lockStoreSites(f.code).length > 0).map((f) => f.rel)
  return { judged, unregistered, rulingProblems, fileLevel, callLevel, tripwire, authorities }
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
const shape = (r) => ({ sites: r.sites.length, kinds: r.sites.map((s) => s.kind), hasFinally: r.hasFinally, needsFinally: r.needsFinally })
reading('(1) lock, no `finally`       ', shape(scan('acquiredNoFinally')))
reading('(2) same lock, with `finally`', shape(scan('acquiredWithFinally')))
reading('(3a) timer, no `finally`     ', shape(scan('timerNoFinally')))
reading('(3b) listener, no `finally`  ', shape(scan('listenerNoFinally')))
reading('(4a) comment only            ', shape(scan('commentOnly')))
reading('(4b) string only             ', shape(scan('stringOnly')))
reading('(4c) definition + real call  ', shape(scan('definitionOnly')))
ok(scan('acquiredNoFinally').needsFinally === true && scan('timerNoFinally').needsFinally === true && scan('listenerNoFinally').needsFinally === true,
  '★ (1)+(3) an acquisition — lock, timer OR listener — with NO `finally` FIRES the predicate',
  { lock: scan('acquiredNoFinally'), timer: scan('timerNoFinally'), listener: scan('listenerNoFinally') })
ok(scan('acquiredWithFinally').needsFinally === false && scan('acquiredWithFinally').sites.length === 1,
  '★ (2) the SAME acquisition WITH a `finally` is QUIET (the site is still SEEN — so the rule is not "any acquire is red")', scan('acquiredWithFinally'))
ok(scan('commentOnly').needsFinally === false && scan('stringOnly').needsFinally === false && scan('definitionOnly').sites.length !== 0 && scan('definitionOnly').needsFinally === true,
  '★ (4) a comment and a string are NOT sites (D7), while a real bare `acquire(` CALL still is (a definition is not a call)', { comment: scan('commentOnly'), string: scan('stringOnly'), def: scan('definitionOnly') })

// ── §0b the RULING vocabulary is a closed set AND every word is verified (a row cannot silence the gate) ───
console.log('=== §0b SELF-PROOF: the ruling vocabulary bites in all its directions ===')
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
  // The `他门已守` row carries FOUR probes: three must be refused, and the fourth (a real gate that does mention
  // the module) must be ACCEPTED. R14 closed a latent vacuity here: the positive direction used to be sliced off
  // (`slice(0,3)`), so `verifyRuling(guarded, …)` could have returned a problem string and nothing would have said so.
  const refused = probes.slice(0, 4).every(([, r]) => (Array.isArray(r) ? r.slice(0, 3).every((x) => typeof x === 'string' && x.length > 0) : typeof r === 'string' && r.length > 0))
  const accepted = probes[5][1].every((x) => x === null) && probes[4][1][3] === null
  // R15: the COUNTS are printed AND asserted, so the numbers a comment quotes are a reading instead of a memory.
  // Adding a probe without updating the declared count reddens here (the "declaration ↔ implementation" drift class).
  const strCount = (r) => (Array.isArray(r) ? r.filter((x) => typeof x === 'string' && x.length > 0).length : (typeof r === 'string' && r.length > 0 ? 1 : 0))
  const nullCount = (r) => (Array.isArray(r) ? r.filter((x) => x === null).length : (r === null ? 1 : 0))
  const directionCounts = { words: RULING_WORDS.length, refused: probes.reduce((n, [, r]) => n + strCount(r), 0), accepted: probes.reduce((n, [, r]) => n + nullCount(r), 0) }
  reading('§0b refused/accepted directions', directionCounts)
  ok(refused && accepted,
    '★ five directions refused BY NAME (unknown word / tripwire / unbacked `成对-finally` / unbacked `睡式-无柄` / dead or non-guarding pointer) and four verified directions stay green (a real sleep / no-site `不涉及` / a real `finally` / a gate pointer that really guards)',
    { refused, accepted, detail: probes })
  ok(directionCounts.words === 5 && directionCounts.refused === 7 && directionCounts.accepted === 4,
    '★ the DECLARED counts ARE the measured ones: 5 words in the closed vocabulary, 7 refused directions, 4 accepted (the RULE A comment quotes exactly these numbers, so the declaration cannot drift from the implementation unnoticed)',
    directionCounts)
}

// ── §0c ROUND 14: the AUTHORITY word, and the `不涉及` claim it retires ────────────────────────────────────
console.log('=== §0c SELF-PROOF (R14): the lock-authority word bites, and `不涉及` can no longer hide an authority ===')
const AUTHORITY_SRC = 'function make(){ const locks = new Map()\n'
  + '  const acquire = (a) => { locks.set(String(a.name), { by: a.by }); return { ok: true, locked: true } }\n'
  + '  const release = (a) => locks.delete(String(a.name))\n'
  + '  return { acquire, release, locks } }'
const AUTH_TIMER_SRC = AUTHORITY_SRC.replace('return { acquire, release, locks }', 'setTimeout(() => {}, 5)\n  return { acquire, release, locks }')
const AUTH_LISTENER_SRC = AUTHORITY_SRC.replace('return { acquire, release, locks }', 'sig.addEventListener("abort", () => {})\n  return { acquire, release, locks }')
{
  const authority = Object.assign({ file: 'kernel/storepolicy.js' }, auditSource(AUTHORITY_SRC))
  const withTimer = Object.assign({ file: 'kernel/storepolicy.js' }, auditSource(AUTH_TIMER_SRC))
  const withListener = Object.assign({ file: 'kernel/storepolicy.js' }, auditSource(AUTH_LISTENER_SRC))
  const notAuthority = Object.assign({ file: 'kernel/records.js' }, auditSource('function f() { return 1 }'))
  const honest = { word: '自持-取释面', gates: ['tests/vmu-storepolicy-falsify.test.mjs'] }
  reading('§0c honest authority           ', { lockStore: lockStoreSites(authority.code), sites: authority.sites.length, verdict: verifyRuling(honest, authority) })
  reading('§0c authority + timer          ', { sites: withTimer.sites.map((s) => s.kind), verdict: verifyRuling(honest, withTimer) })
  reading('§0c authority + listener       ', { sites: withListener.sites.map((s) => s.kind), verdict: verifyRuling(honest, withListener) })
  reading('§0c `不涉及` claimed by authority', { verdict: verifyRuling({ word: '不涉及' }, authority) })
  ok(verifyRuling(honest, authority) === null,
    '★ (1) a file that really holds a lock store, acquires nothing else, carries no timer/listener AND names a real gate VERIFIES as `自持-取释面`', verifyRuling(honest, authority))
  const t = String(verifyRuling(honest, withTimer))
  const l = String(verifyRuling(honest, withListener))
  ok(/OWES-FINALLY/.test(t) && /OWES-FINALLY/.test(l),
    '★ (2) the SAME authority that GREW a timer OR a listener is refused BY NAME (`OWES-FINALLY`) — the criterion\'s "条件出现即红", not a preference',
    { timer: t, listener: l })
  const n = String(verifyRuling(honest, notAuthority))
  ok(typeof verifyRuling(honest, notAuthority) === 'string' && /holds NO lock store/.test(n),
    '★ (3) a file with NO lock store cannot claim the authority word (so it cannot become a blanket exemption)', n)
  const f = String(verifyRuling({ word: '不涉及' }, authority))
  ok(/FALSE-不涉及/.test(f),
    '★ (4) THE R14 DEFECT, PINNED: an authority can no longer be filed under `不涉及` — the false word this gate shipped in R13 is refused BY NAME', f)
  const p = String(verifyRuling({ word: '自持-取释面' }, authority))
  ok(/without naming a gate/.test(p),
    '★ (5) the authority word without a gate pointer is refused (an exemption must name what guards it)', p)
  const realSrc = readFileSync(join(VMU, 'kernel/storepolicy.js'), 'utf8')
  const realInfo = Object.assign({ file: 'kernel/storepolicy.js' }, auditSource(realSrc))
  const liveVerdict = verifyRuling(RULINGS['kernel/storepolicy.js'], realInfo)
  reading('§0c LIVE storepolicy.js        ', { lockStore: lockStoreSites(realInfo.code), acquisitionSites: realInfo.sites.map((s) => s.kind + '@' + s.at), verdict: liveVerdict })
  ok(lockStoreSites(realInfo.code).length > 0 && liveVerdict === null,
    '★ (6) LIVE: the real `kernel/storepolicy.js` really holds the lock store AND the real row verifies — so the word is a reading about this file, not a fixture', { lockStore: lockStoreSites(realInfo.code) })
  // R15: same discipline as §0b — the counts a comment quotes are printed and asserted here.
  const authorityCounts = {
    refused: [t, l, n, f, p].filter((x) => typeof x === 'string' && x.length > 0).length,
    accepted: [verifyRuling(honest, authority), liveVerdict].filter((x) => x === null).length,
  }
  reading('§0c refused/accepted directions', authorityCounts)
  ok(authorityCounts.refused === 5 && authorityCounts.accepted === 2,
    '★ the DECLARED counts ARE the measured ones: the authority word refuses 5 directions (no lock store / grew a timer / grew a listener / an authority filed `不涉及` / no gate pointer) and accepts 2 (the fixture, and the LIVE file)',
    authorityCounts)
}

// ── §0d ROUND 14: the REAL-TREE rule has teeth, proven with planted violations on the SAME function ────────
console.log('=== §0d SELF-PROOF (R14): the real-tree rule (§2/§3/§5) reddens on planted violations, and is green on the honest fixture ===')
{
  const HONEST_FILES = [
    Object.assign({ rel: 'kernel/guarded.js' }, auditSource(SYNTH.acquiredWithFinally)),
    Object.assign({ rel: 'kernel/records.js' }, auditSource('function f() { return 1 }')),
    Object.assign({ rel: 'kernel/storepolicy.js' }, auditSource(AUTHORITY_SRC)),
    Object.assign({ rel: 'kernel/writer.js' }, auditSource('const write = (a) => { return { ok: true } }')),
  ]
  const base = {
    files: HONEST_FILES,
    rulings: { 'kernel/guarded.js': { word: '成对-finally' }, 'kernel/records.js': { word: '不涉及' }, 'kernel/storepolicy.js': { word: '自持-取释面', gates: ['tests/vmu-storepolicy-falsify.test.mjs'] } },
    contracts: [{ file: 'kernel/writer.js', marker: 'const write = (a) => {' }],
    tripwires: ['kernel/records.js'],
  }
  const clean = judgeTree(base)
  // ONE condition, three named lines (the tripwire's own promise: "the day one does, this line AND the §4 ruling
  // both go red"): `records.js` grows a timer while its row still says `不涉及`.
  const recordsGoesTimer = { files: base.files.map((f) => (f.rel === 'kernel/records.js' ? Object.assign({ rel: f.rel }, auditSource(SYNTH.timerNoFinally)) : f)) }
  const planted = [
    ['a NEW file with a site and no ruling row', { files: base.files.concat([Object.assign({ rel: 'kernel/newface.js' }, auditSource(SYNTH.acquiredNoFinally))]) }, 'unregistered'],
    ['a LYING `成对-finally` row (sites but no `finally`)', { files: base.files.concat([Object.assign({ rel: 'kernel/lying.js' }, auditSource(SYNTH.acquiredNoFinally))]), rulings: Object.assign({}, base.rulings, { 'kernel/lying.js': { word: '成对-finally' } }) }, 'rulingProblems'],
    ['`records.js` GROWS a timer ⇒ its own §4 row stops verifying', recordsGoesTimer, 'rulingProblems'],
    ['`records.js` GROWS a timer ⇒ the FILE-LEVEL rule reds', recordsGoesTimer, 'fileLevel'],
    ['`records.js` GROWS a timer ⇒ the §5 TRIPWIRE reds', recordsGoesTimer, 'tripwire'],
    ['a `write()` body that GREW an acquisition', { files: base.files.map((f) => (f.rel === 'kernel/writer.js' ? Object.assign({ rel: f.rel }, auditSource('const write = (a) => { a.lock.acquire({ name: "w" }); return { ok: true } }')) : f)) }, 'callLevel'],
    ['the AUTHORITY that GREW a listener', { files: base.files.map((f) => (f.rel === 'kernel/storepolicy.js' ? Object.assign({ rel: f.rel }, auditSource(AUTH_LISTENER_SRC)) : f)) }, 'rulingProblems'],
    ['an AUTHORITY filed under `不涉及`', { rulings: Object.assign({}, base.rulings, { 'kernel/storepolicy.js': { word: '不涉及' } }) }, 'rulingProblems'],
    ['a STALE row for a file that does not exist', { rulings: Object.assign({}, base.rulings, { 'kernel/ghost.js': { word: '不涉及' } }) }, 'rulingProblems'],
  ]
  const empty = (t) => t.unregistered.length === 0 && t.rulingProblems.length === 0 && t.fileLevel.length === 0 && t.callLevel.length === 0 && t.tripwire.length === 0
  reading('§0d honest fixture             ', { judged: clean.judged.map((j) => j.rel), unregistered: clean.unregistered, rulingProblems: clean.rulingProblems, fileLevel: clean.fileLevel, callLevel: clean.callLevel, tripwire: clean.tripwire, authorities: clean.authorities })
  const plantedReadings = planted.map(([label, over, key]) => ({ planted: label, list: key, hits: judgeTree(Object.assign({}, base, over))[key] }))
  for (const r of plantedReadings) reading('§0d planted ' + r.list.padEnd(16) + ' ', { planted: r.planted, hits: r.hits })
  reading('§0d counts                     ', { planted: planted.length, honestListsEmpty: empty(clean), judged: clean.judged.length, lists: ['unregistered', 'rulingProblems', 'fileLevel', 'callLevel', 'tripwire'] })
  ok(clean.judged.length > 0 && empty(clean),
    '★ the honest fixture is GREEN in all five lists (so the planted direction below is not "everything is always red")', { judged: clean.judged.length, unregistered: clean.unregistered, rulingProblems: clean.rulingProblems, fileLevel: clean.fileLevel, callLevel: clean.callLevel, tripwire: clean.tripwire })
  const plantedOk = planted.length > 0 && planted.every(([label, over, key]) => judgeTree(Object.assign({}, base, over))[key].length > 0)
  ok(plantedOk && planted.length === 9,
    '★ the DECLARED count IS the measured one: ' + planted.length + ' planted violations each REDDEN THE LIST THEY NAME on the SAME `judgeTree()` the live run calls (a new module / a lying ruling / a tripped tripwire — three named lines from ONE condition / an acquisition inside `write()` / the authority growing a listener / an authority filed `不涉及` / a stale row)',
    plantedReadings)
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
reading('§1 injected write() body       ', { fileLevelNeedsFinally: injectedFile.needsFinally, callLevelSites: injectedBody ? sitesOf(injectedBody).map((s) => s.at) : null })
ok(injectedFile.needsFinally === true && !!injectedBody && sitesOf(injectedBody).length > 0,
  '★ one injected line in the REAL `write()` body reddens BOTH granularities (file level `needsFinally` AND call level inside the body) — so the green below is aimed, not blind',
  { fileLevelNeedsFinally: injectedFile.needsFinally, callLevelSites: injectedBody ? sitesOf(injectedBody).map((s) => s.at) : null })
const resumeSrc = readFileSync(join(VMU, 'kernel/resume.js'), 'utf8')
const resumeAudit = auditSource(resumeSrc)
reading('§1 positive control resume.js  ', { sites: resumeAudit.sites.map((s) => s.at), hasFinally: resumeAudit.hasFinally, needsFinally: resumeAudit.needsFinally })
ok(resumeAudit.sites.length > 0 && resumeAudit.hasFinally === true && resumeAudit.needsFinally === false,
  'control: `kernel/resume.js` really acquires across calls and carries a `finally` — the scanner sees BOTH halves', { sites: resumeAudit.sites.map((s) => s.at), hasFinally: resumeAudit.hasFinally })

if (!walkTree) {
  console.log('  NOTE: `--selftest` did NOT walk the live tree; its §2/§3/§5 rule is the SAME `judgeTree()` §0d drives with '
    + 'planted violations, and `--require-tree` forces the live walk (the skip has an opposite switch).')
}

if (walkTree) {
  // ── §2/§3/§4/§5 judge the real tree through THE SAME judgeTree() proven in §0d ───────────────────────────
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
  const walked = files.map((p) => Object.assign({ rel: rel(p) }, auditSource(readFileSync(p, 'utf8'))))
  const tree = judgeTree({ files: walked, rulings: RULINGS, contracts: CALL_CONTRACTS, tripwires: TRIPWIRE_FILES })
  reading('§2 walked/judged              ', { walked: walked.length, judged: tree.judged.map((j) => j.rel), authorities: tree.authorities })
  ok(walked.length > 0 && tree.judged.length > 0, 'the scan found the acquisition-carrying modules (non-vacuous: ' + walked.length + ' files walked, ' + tree.judged.length + ' with sites)', tree.judged.map((j) => j.rel))

  ok(tree.unregistered.length === 0, '★ every file with an acquisition site carries a ruling row (a new module cannot appear silently)', tree.unregistered)
  ok(tree.rulingProblems.length === 0, '★ every ruling row VERIFIES against the code (the closed vocabulary is a decision, not a silencing device)', tree.rulingProblems)
  ok(tree.fileLevel.length === 0, '★ FILE LEVEL: no file acquires without a `finally` except under a VERIFIED exemption word', tree.fileLevel)
  ok(RULING_WORDS.length >= 5 && tree.judged.length >= 4, 'the vocabulary and the judged set are both substantive (non-vacuous)', { words: RULING_WORDS.length, judged: tree.judged.length })

  console.log('=== §3 CALL LEVEL (a declared function body must acquire nothing) ===')
  ok(tree.callLevel.length === 0, '★ every call-level contract holds (extracted by brace matching, so "inside the body" is real)', tree.callLevel)

  console.log('=== §5 TRIPWIRE: the records/store faces still acquire nothing ===')
  reading('§5 tripwire files             ', { files: TRIPWIRE_FILES, sites: TRIPWIRE_FILES.map((f) => ({ file: f, sites: sitesOf((walked.find((w) => w.rel === f) || { code: '' }).code).length })) })
  ok(TRIPWIRE_FILES.length > 0 && tree.tripwire.length === 0,
    '★ `records.js`／`store.js` still hold no acquisition (the day one does, this line AND the §4 ruling both go red — the condition appearing is the red)', tree.tripwire)

  console.log('=== §5b AUTHORITY TRIPWIRE: the lock authorities are a CLOSED list (R14) ===')
  const DECLARED_AUTHORITIES = Object.freeze(['kernel/storepolicy.js'])
  const undeclared = tree.authorities.filter((a) => !DECLARED_AUTHORITIES.includes(a))
  const stale = DECLARED_AUTHORITIES.filter((a) => !tree.authorities.includes(a))
  const authorityRows = DECLARED_AUTHORITIES.map((a) => ({ file: a, word: (RULINGS[a] || {}).word }))
  reading('§5b authorities               ', { found: tree.authorities, declared: DECLARED_AUTHORITIES, rows: authorityRows })
  ok(tree.authorities.length > 0 && undeclared.length === 0 && stale.length === 0,
    '★ the set of files that hand out locks EQUALS the declared list (a new authority is red; a vanished one is red) — so "the authority" is a reading, not a memory',
    { found: tree.authorities, undeclared, stale })
  ok(authorityRows.length > 0 && authorityRows.every((r) => r.word === '自持-取释面'),
    '★ every declared authority carries the authority word (not `不涉及`, not a silence)', authorityRows)

  console.log('  judged=' + tree.judged.length + ' files with sites, rulings=' + Object.keys(RULINGS).length + ', tripwire=' + TRIPWIRE_FILES.length
    + ', call-contracts=' + CALL_CONTRACTS.length + ', authorities=' + tree.authorities.length + ', ruling-words=' + RULING_WORDS.length)
} else {
  console.log('  tree walk SKIPPED (--selftest): §0d is the standing proof that the rule §2/§3/§5 apply can go red.')
}

console.log('')
console.log('=== ACQUIRE↔RELEASE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
process.exit(failed === 0 ? 0 : 1)
