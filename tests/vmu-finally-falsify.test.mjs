// tests/vmu-finally-falsify.test.mjs — FAMILY 12: THE REAL `finally` USERS (round 11, task-85).
// Run: node tests/vmu-finally-falsify.test.mjs
//
// WHY THIS FILE EXISTS. Round 10 named the construct honestly: `records`/`store` have NO `finally` at all (a pure
// policy layer that holds nothing across a call), so the only real `finally` users in the kernel worth falsifying are
//
//   · `kernel/index.js`      :1953  `try { return await run } finally { exitFlushInFlight = null }`
//   · `kernel/mathjobs.js`   :587   `try { return await executeInner(job) } finally { releaseSlot() }`
//   · `kernel/mathjobs.js`   :224   the child-budget timer, disposed in a `finally` (its reading is the timer rail)
//
// The question this family answers is the one a `finally` exists FOR: does the resource come back on the exit that
// does NOT fall through the happy path? Both cases therefore read the THROWING exit, with a control that shows the
// happy path still works - and the narrow mutation (happy path untouched, only the throw leaks) is preferred, because
// a mutation that breaks everything proves less than one that breaks exactly the branch under test.
//
// CASE 1 · THE EXIT-FLUSH SINGLE-FLIGHT FLAG. `shutdown()` shares ONE in-flight flush with its callers and clears the
//   flag afterwards, so a LATER call RUNS AGAIN (docs/03 §2: a host may reinstall and produce a new journal tail - a
//   permanent "already flushed" flag would silently lose it). The throwing exit is REACHABLE and is reached here by
//   injecting a clock that throws (the flush stamps itself with `clock()` before anything else), so the flag's
//   clearing is measurable rather than argued: with the real `finally` the NEXT call runs again; with the release
//   moved out of `finally` it keeps returning the rejected promise forever.
// CASE 2 · THE CONCURRENCY RAIL. `executeInner` parks while `running() >= maxParallel` and is woken ONLY by
//   `releaseSlot()`, which the wrapper calls from `finally`. Two jobs with `maxParallel=1`: the second is queued, the
//   first finishes, and the second must START. Both mutations cut the release (the wake-up splice, and the `finally`
//   itself); the second is broad on purpose, the first is the rail's own load-bearing line.
// CASE 2b · THE MEASURED NON-FINDING, asserted (not hidden). `executeInner` converts its failures into RECEIPTS (its
//   own catch returns `VMU_EXTERNAL_UNAVAILABLE`), so no reachable input makes the wrapper throw: the `finally` there
//   is DEFENSIVE. Moving the release onto the success path therefore produces an IDENTICAL reading on every reachable
//   input, and the library says so by name (`PROBE-DOES-NOT-DISCRIMINATE`). That expectation is pinned: if a later
//   refactor lets a throw escape `executeInner`, this pin goes red and the honest mutation becomes available.
//
// ROUND 14 / task-110 — A CORRECTION TO THIS FILE'S OWN CLAIM (measured, not argued). Round 11 filed THREE faces under
// "acquires nothing": `records.js`, `storepolicy.js`, `store.js`. That was WRONG for `storepolicy.js` — it is the
// kernel's ONLY lock authority: `acquire()` calls `locks.set(...)`, `status().locks` counts the held lock, a second
// acquire is refused `VMU_CONFLICT`, and `release()` (a SEPARATE call) deletes it. A lock really IS taken inside a
// call; the acquire↔release gate could not see it because the `acquire` it finds there is a DEFINITION, which that
// gate's vocabulary deliberately skips. The honest three-way reading is asserted below, and the acquire↔release gate
// now files `storepolicy.js` under the fifth closed word `自持-取释面` instead of `不涉及`.
import { falsifyFamily, falsify, formatFamilyReport, mutateOnce } from './_lib/falsify.mjs'
import { stripComments } from './_lib/strip-comments.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'index.js')
const MATHJOBS = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'mathjobs.js')
const KERNEL_DIR = join(HERE, '..', 'vibe-math-vmu', 'kernel')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const attempt = async (fn) => { try { return { value: await fn() } } catch (e) { return { code: (e && e.code) || String((e && e.message) || e) } } }

/** CASE 1: shutdown() twice, then once with a clock that THROWS, then once more (the exit under test). */
async function shutdownProbe(mod) {
  const boom = { on: false }
  let ticks = 0
  const clock = () => { if (boom.on) throw new Error('clock down'); return 1000 + (ticks++) }
  const k = mod.createKernel({ clock, settings: {} })
  const first = await attempt(() => k.shutdown({ reason: 'one' }))
  const rec1 = k.exitFlush()
  const second = await attempt(() => k.shutdown({ reason: 'two' }))
  const rec2 = k.exitFlush()
  boom.on = true
  const threw = await attempt(() => k.shutdown({ reason: 'boom' }))
  boom.on = false
  const after = await attempt(() => k.shutdown({ reason: 'after' }))
  const rec3 = k.exitFlush()
  const at = (r) => (r ? r.at : -1)
  const reason = (r) => (r ? r.reason : null)
  return {
    firstOk: !!(first.value && first.value.ok === true),
    firstReason: reason(rec1),
    // the documented shape: a LATER call runs again (a permanent flag would lose a re-installed host's tail)
    secondRunsAgain: reason(rec2) === 'two' && at(rec2) > at(rec1),
    // the throwing exit was really reached: the injected clock surfaced as the rejection
    boomSurfaced: threw.code === 'clock down' && !threw.value,
    // THE EXIT UNDER TEST: after a THROW, the next call must run again (this is what clearing in `finally` buys)
    recoveredAfterThrow: reason(rec3) === 'after' && at(rec3) > at(rec2),
    afterSucceeded: !!(after.value && after.value.ok === true),
  }
}

/** CASE 2: two jobs, maxParallel=1 ⇒ the second PARKS, and only the first one's release can wake it. */
async function mathjobsRailProbe(mod) {
  const pending = []
  const spawn = () => new Promise((resolve) => { pending.push(resolve) })
  const svc = mod.createMathJobs({ clock: () => 1000, log: () => {}, spawn,
    settings: { 'vmu.math.engines': ['fake'], 'vmu.math.maxParallel': 1 } })
  const first = await svc.submit({ engine: 'fake', argv: [], async: true })
  const second = await svc.submit({ engine: 'fake', argv: [], async: true })
  await tick()
  const parkedState = svc.status({ jobId: second.jobId }).job.state
  const spawnedWhileParked = pending.length
  if (pending[0]) pending[0]({ exitCode: 0, stdout: 'a', stderr: '' })     // the FIRST job finishes here
  await tick(); await tick(); await tick()
  const afterState = svc.status({ jobId: second.jobId }).job.state
  const firstState = svc.status({ jobId: first.jobId }).job.state
  const read = {
    firstStarted: !!first && first.ok === true && firstState !== 'queued',
    parkedState, spawnedWhileParked,
    // THE READING: the released slot really handed over to the parked job
    parkedIsQueued: parkedState === 'queued' && spawnedWhileParked === 1,
    parkedJobStarted: afterState === 'running' && pending.length === 2,
  }
  // ★ CLEANUP (round speed-1, measured 120.5 s): the second job's fake spawn never settles, so its 120 s child-budget
  // timer (`kernel/mathjobs.js` `runWithBudget`) stays armed after the probe and keeps this suite's event loop alive
  // until it fires — the suite prints all 26 assertions in 0.4 s and then idles for two minutes. Finishing the job
  // HERE disarms that timer; the reading above is already taken, so the probe's assertions cannot change.
  if (pending[1]) pending[1]({ exitCode: 0, stdout: 'b', stderr: '' })
  await tick()
  return read
}

const family = await falsifyFamily({
  name: 'the real finally users — the exit-flush flag and the concurrency rail',
  cases: [{
    name: 'index.js — shutdown() clears the single-flight flag in `finally`',
    module: KERNEL,
    probe: shutdownProbe,
    controlFields: ['firstOk', 'secondRunsAgain', 'boomSurfaced', 'recoveredAfterThrow'],
    mutations: [
      // NARROW: the happy path still clears the flag (the clear runs after the await), so ONLY the throwing exit leaks.
      { label: 'the flag is cleared on the success path only (no finally)', name: 'shutdown-no-finally',
        find: '      try { return await run } finally { exitFlushInFlight = null }',
        replace: '      const out = await run   // MUTANT: no `finally` — a throwing exit leaves the flag set\n      exitFlushInFlight = null\n      return out' },
      // BROAD: the flag is never cleared at all ⇒ even the happy path stops running again.
      { label: 'the flag is never cleared at all', name: 'shutdown-flag-sticky',
        find: '      try { return await run } finally { exitFlushInFlight = null }',
        replace: '      try { return await run } finally { /* MUTANT: the flag is never cleared */ }' },
    ],
  }, {
    name: 'mathjobs.js — the slot is released on every exit of `execute`',
    module: MATHJOBS,
    probe: mathjobsRailProbe,
    controlFields: ['firstStarted', 'parkedIsQueued', 'parkedJobStarted'],
    mutations: [
      { label: 'the release wakes nobody (the rail stops handing over)', name: 'mathjobs-release-noop',
        find: 'const w = slotWaiters.splice(0)', replace: 'const w = []' },
      { label: 'the slot is never released', name: 'mathjobs-finally-noop',
        find: 'try { return await executeInner(job) } finally { releaseSlot() }',
        replace: 'try { return await executeInner(job) } finally { /* MUTANT: the slot is never released */ }' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated kernel recovers from the throwing exit ===')
const s = family.cases[0].real
ok(s.firstOk === true && s.firstReason === 'one',
  '★ a first shutdown really flushes and records itself', s)
ok(s.secondRunsAgain === true,
  '★ a LATER shutdown RUNS AGAIN (the flag is cleared after a settled run — a permanent flag would lose a reinstalled host\\\'s tail)', s)
ok(s.boomSurfaced === true,
  '★ the throwing exit is REACHABLE (the injected clock throws inside the flush, and the rejection surfaces)', s)
ok(s.recoveredAfterThrow === true && s.afterSucceeded === true,
  '★ and after that throw the NEXT shutdown runs again — this is exactly what clearing the flag in `finally` buys', s)

console.log('=== CONTROL GROUP: the unmutated rail hands the slot to the parked job ===')
const r = family.cases[1].real
ok(r.firstStarted === true && r.parkedIsQueued === true,
  '★ with maxParallel=1 the second job is genuinely PARKED (queued, no spawn) while the first runs', r)
ok(r.parkedJobStarted === true,
  '★ when the first job finishes, the released slot starts the parked job (two spawns, second state=running)', r)

console.log('=== FALSIFICATION: move the release out of `finally`, or cut it ===')
ok(family.ok, '★ all four `finally` mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((x) => x.label.includes(needle))
const noFinallyRed = byLabel('success path only') && byLabel('success path only').red
const stickyRed = byLabel('never cleared at all') && byLabel('never cleared at all').red
const releaseNoopRed = byLabel('wakes nobody') && byLabel('wakes nobody').red
const releaseGoneRed = byLabel('slot is never released') && byLabel('slot is never released').red
ok(!!noFinallyRed && noFinallyRed.recoveredAfterThrow === false && noFinallyRed.secondRunsAgain === true && noFinallyRed.boomSurfaced === true,
  '★ "no finally": the THROWING exit leaks the in-flight promise — the next shutdown returns the stale rejection — while the happy path is untouched (the mutation is narrow)', noFinallyRed)
ok(!!stickyRed && stickyRed.secondRunsAgain === false && stickyRed.recoveredAfterThrow === false && stickyRed.firstOk === true,
  '★ "sticky flag": even a settled run is never cleared, so the SECOND shutdown silently returns the first flush\\\'s promise', stickyRed)
ok(!!releaseNoopRed && releaseNoopRed.parkedIsQueued === true && releaseNoopRed.parkedJobStarted === false && releaseNoopRed.spawnedWhileParked === 1,
  '★ "the release wakes nobody": the parked job stays queued forever and is never spawned (the rail stalls silently)', releaseNoopRed)
ok(!!releaseGoneRed && releaseGoneRed.parkedJobStarted === false && releaseGoneRed.firstStarted === true,
  '★ "the slot is never released": the first job still runs to completion, and the queue behind it never moves', releaseGoneRed)
ok(family.results.length > 0 && family.results.every((x) => x.applied && x.importable && x.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((x) => ({ label: x.label, applied: x.applied, importable: x.importable })))
ok(family.cases.length > 0 && family.cases.every((c) => c.leftovers.length === 0),
  'the mutated copies were written to D:\\_tmp and deleted again', family.cases.map((c) => c.leftovers))

console.log('=== MEASURED NON-FINDING (pinned): the mathjobs wrapper `finally` is DEFENSIVE ===')
// `executeInner` swallows every internal failure into a receipt (its catch returns VMU_EXTERNAL_UNAVAILABLE) and the
// `async:true` path additionally catches a rejection, so NO reachable input makes the wrapper throw. The honest
// conclusion is therefore not "I could not falsify it" but "moving the release onto the success path is behaviourally
// identical on every reachable input" — and the library names that state. If a refactor ever lets a throw escape
// `executeInner`, this pin goes red: that is the signal that the mutation became real.
const defensive = await falsify({
  name: 'mathjobs — is the wrapper `finally` load-bearing?',
  module: MATHJOBS,
  probe: mathjobsRailProbe,
  mutations: [{ label: 'the slot is released only on the success path', name: 'mathjobs-release-success-only',
    find: 'try { return await executeInner(job) } finally { releaseSlot() }',
    replace: 'const out = await executeInner(job); releaseSlot(); return out' }],
})
ok(defensive.ok === false && defensive.problems.some((p) => p.startsWith('PROBE-DOES-NOT-DISCRIMINATE')),
  '★ measured: `executeInner` returns its failures as receipts, so the wrapper never throws on any reachable input — the success-path-only release is a NO-OP and the library reports PROBE-DOES-NOT-DISCRIMINATE (pin: if a throw becomes reachable, this goes red and the mutation becomes a real defect probe)',
  defensive.problems)
ok(defensive.real && defensive.real.parkedJobStarted === true,
  'and the probe itself is green on the real module (so the non-finding is about the mutation, not a broken probe)', defensive.real)

console.log('=== TRIPWIRE (self-proving): a resource inside records/store would owe a `finally` ===')
// THE CRITERION, AS AN ASSERTION (rounds 11/12): a `finally` is owed only where a function ACQUIRES something that
// must be returned even when the body throws — a lock, a timer, a listener. These three faces hold only in-memory
// state today, so they owe nothing; the tripwire fires the moment one of them grows an acquisition WITHOUT the
// `finally` that would have to come with it. Two granularities, because the criterion names both:
//   · FILE level  — any acquisition/timer/listener anywhere in the file requires a `finally` in that file;
//   · CALL level  — `storepolicy.write()`'s own body must acquire nothing (the Lead's exact wording: "若 write() 体内
//                  出现 acquire()"), which a file-level scan cannot see when a `finally` exists elsewhere.
const ACQUIRE = /\.acquire\s*\(|\bacquire\s*\(|\bacquireLock\s*\(|(?<![\w$.])setTimeout\s*\(|(?<![\w$.])setInterval\s*\(|addEventListener\s*\(/g
/** NOT an acquisition — the OPPOSITE evidence: a file that really HANDS OUT locks (`locks.set`／`locks.delete`). */
const LOCK_STORE = /\blocks\s*\.\s*(?:set|delete)\s*\(/g
/** CODE ONLY (comments and string/regex contents blanked): a doc line or a string cannot fake an acquisition. */
const tripwireScan = (source) => {
  const code = stripComments(String(source), { strings: true })
  const acquisitions = [...code.matchAll(ACQUIRE)].map((m) => m[0].trim())
  const lockStore = [...code.matchAll(LOCK_STORE)].map((m) => m[0].replace(/\s+/g, ''))
  const hasFinally = /\bfinally\b/.test(code)
  return { acquisitions, lockStore, hasFinally, needsFinally: acquisitions.length > 0 && !hasFinally }
}
/** The brace-matched body of a function, so "inside `write()`" means inside `write()` and not "somewhere in the file". */
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

// SELF-PROOF: the predicate must FIRE on the shape it claims to catch, and stay QUIET on the shapes it must not.
const SYNTH = {
  acquiredNoFinally: 'function f(s) { const l = s.acquire({ name: "x" }); return l }',
  acquiredWithFinally: 'function f(s) { const l = s.acquire({ name: "x" }); try { return l } finally { s.release({ name: "x" }) } }',
  timerNoFinally: 'function f() { setTimeout(() => {}, 10) }',
  commentOnly: '// an example: s.acquire({name:"x"}) with no finally\nfunction f() { return 1 }',
  stringOnly: 'function f() { return "setTimeout(" }',
}
const scan = (k) => tripwireScan(SYNTH[k])
ok(scan('acquiredNoFinally').needsFinally === true && scan('timerNoFinally').needsFinally === true,
  '★ self-proof: an acquisition (or a timer) with NO `finally` fires the tripwire', { acq: scan('acquiredNoFinally'), timer: scan('timerNoFinally') })
ok(scan('acquiredWithFinally').needsFinally === false,
  '★ self-proof: the SAME acquisition WITH a `finally` is clean — the rule is not "any acquire is red"', scan('acquiredWithFinally'))
ok(scan('commentOnly').needsFinally === false && scan('stringOnly').needsFinally === false,
  '★ self-proof (D7): a comment and a string are not code — `installer.js`-style proof that a statistic must read the text where the fact lives', { comment: scan('commentOnly'), string: scan('stringOnly') })

// POSITIVE CONTROL: on a face that DOES acquire across calls, the scanner sees BOTH halves, so a green live reading
// cannot be the scanner being blind.
const resumeScan = tripwireScan(readFileSync(join(KERNEL_DIR, 'resume.js'), 'utf8'))
ok(resumeScan.acquisitions.length > 0 && resumeScan.hasFinally === true && resumeScan.needsFinally === false,
  'control: `resume.js` really acquires across calls and carries a `finally` — the scanner sees both (so "clean" below is a finding about these faces, not about the scanner)', resumeScan)

// LIVE: the ORIGINAL criterion read three faces as one class. R14 splits the class: two of them really acquire
// nothing, and the third is the lock authority itself. All three are still read here — nothing was dropped.
const TRIPWIRE_FACES = ['records.js', 'store.js']
const AUTHORITY_FACE = 'storepolicy.js'
const live = [AUTHORITY_FACE].concat(TRIPWIRE_FACES).map((f) => {
  const src = readFileSync(join(KERNEL_DIR, f), 'utf8')
  return Object.assign({ file: f, stripped: stripComments(src, { strings: true }) }, tripwireScan(src))
})
const faceOf = (f) => live.filter((r) => r.file === f)[0]
ok(live.length > 0 && live.every((r) => r.acquisitions.length === 0),
  '★ TRIPWIRE: no lock/timer/listener site exists in `records.js`／`store.js`／`storepolicy.js` today ⇒ the ACQUISITION-side predicate owes no `finally` on any of them (a reading, not an opinion) — but "no acquisition SITE" is only HALF of "acquires nothing", see the lock-store reading below', live.map((r) => ({ file: r.file, acquisitions: r.acquisitions, lockStore: r.lockStore })))
ok(live.length > 0 && live.every((r) => r.needsFinally === false),
  '★ and none of them acquires without a `finally` ⇒ GREEN; the day one does, THIS line goes red naming the file (that is the tripwire, not a preference)',
  live.filter((r) => r.needsFinally).map((r) => r.file))
// R14 / task-110: `不涉及` claims TWO things — no acquisition site AND no lock store to hand out. The first half is
// green above; the second half is what the old claim got wrong. Each face is read on its own line, so the correction
// cannot be mistaken for a blanket "the tripwire moved".
const tripwireStores = TRIPWIRE_FACES.map((f) => ({ file: f, lockStore: faceOf(f).lockStore }))
const authorityStore = { file: AUTHORITY_FACE, lockStore: faceOf(AUTHORITY_FACE).lockStore }
ok(tripwireStores.length === 2 && tripwireStores.filter((r) => r.lockStore.length === 0).length === 2,
  '★ TRIPWIRE (`不涉及`, BOTH halves): `records.js`／`store.js` neither acquire NOR hand out locks (`locks.set`／`locks.delete` absent) ⇒ "acquires nothing" holds for exactly these two files',
  { tripwireStores, authorityStore })
ok(authorityStore.lockStore.length === 2 && faceOf(AUTHORITY_FACE).acquisitions.length === 0 && faceOf(AUTHORITY_FACE).hasFinally === false,
  '★ R14 CORRECTION (the reading that retires the round-11 wording): `storepolicy.js` HANDS OUT locks — `locks.set` + `locks.delete` — while carrying 0 acquisition sites and NO `finally`. It is the AUTHORITY, not a face that "acquires nothing": the release is a SEPARATE call (no single-call `finally` spans two calls) and its bounded retry is virtual-clock arithmetic (waitedMs = backoffMs × attempts), so no timer/listener handle exists to leak. The acquire↔release gate files it `自持-取释面` and reds it BY NAME the day a timer/listener appears',
  { authorityStore, acquisitions: faceOf(AUTHORITY_FACE).acquisitions, hasFinally: faceOf(AUTHORITY_FACE).hasFinally })
const writeBody = bodyOf(live.filter((r) => r.file === 'storepolicy.js')[0].stripped, 'const write = (a) => {')
ok(!!writeBody && writeBody.length > 0,
  'control: the `write()` body was really extracted (a failed extraction must not read as "nothing acquired")', { extracted: !!writeBody, length: writeBody ? writeBody.length : -1 })
ok(!!writeBody && tripwireScan(writeBody).acquisitions.length === 0,
  '★ TRIPWIRE (call level): `storepolicy.write()` itself acquires nothing — the exact condition the criterion names ("若 write() 体内出现 acquire()"), checked INSIDE the body rather than somewhere in the file', writeBody ? tripwireScan(writeBody) : null)
// THE DECISIVE ONE: inject the condition into the REAL file's `write()` body (TEXT only — the tripwire is a text
// scan, so this needs no import) and require BOTH granularities to fire. This is what makes the green above a
// finding about the faces rather than a finding about the scanner's aim.
const spSource = readFileSync(join(KERNEL_DIR, 'storepolicy.js'), 'utf8')
const injected = mutateOnce(spSource, { find: 'const write = (a) => {',
  replace: "const write = (a) => {\n    if (lock) lock.acquire({ name: 'w' })   // MUTANT: the write path acquires now" })
const injectedStripped = stripComments(injected.text, { strings: true })
const injectedBody = bodyOf(injectedStripped, 'const write = (a) => {')
ok(tripwireScan(injected.text).needsFinally === true && !!injectedBody && tripwireScan(injectedBody).acquisitions.length > 0,
  '★ the tripwire FIRES on the real file with ONE injected line: file level (`needsFinally`) and call level (`write()` body) both red — so the green above is aimed, not blind',
  { fileLevel: tripwireScan(injected.text), callLevel: injectedBody ? tripwireScan(injectedBody) : null })

console.log('')
console.log('=== VMU FINALLY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
