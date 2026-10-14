// tests/vmu-resume-falsify.test.mjs — FAMILY 4: `kernel/resume.js`, in TWO cases.
// Run: node tests/vmu-resume-falsify.test.mjs
//
// CASE 1 — the READ-BEFORE-WRITE gate (v5r's `V5_STATE_NOT_LOADED` rule). The invariant: "an unread snapshot must
// never be overwritten". Two ways to break it, and the probe reads both:
//   · NEVER READ     — a write before any successful read is refused BY NAME and NOTHING lands in the store;
//   · READ FAILED    — a read that threw does NOT unlock writes (the latch stays closed);
//   · CONTROL        — after a successful read the very same write succeeds (so "nothing landed" is not vacuous).
//
// CASE 2 — F18's EXCLUSIVE SECTION: `recover()` takes a lock and the release sits in a `finally` that covers EVERY
// exit. `tests/vmu-resume-lock-and-marks.test.mjs` ASSERTS the behaviour; this case shows the assertion can FAIL —
// the release is cut and the SAME probe goes red on the exit that matters (the throw), while the happy path stays
// green (a narrow mutation, so the reading is not "everything broke"). Four exits are read, each with a control:
//   · HAPPY        — acquires once, releases once, holds nothing afterwards;
//   · THROW        — a store that cannot be folded refuses NAMED and STILL releases (this is the branch a
//                    happy-path-only release would leak);
//   · EARLY RETURN — no store at all ⇒ a report (not a throw) and the lock is released too;
//   · EXCLUSIVITY  — somebody else holds it ⇒ named `VMU_RESUME_BUSY`, our side acquires nothing, and the holder's
//                    lock is untouched.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createStorePolicy } from '../vibe-math-vmu/kernel/storepolicy.js'
import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESUME = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'resume.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** A minimal durable-store seam: `export()` is what `read()` consumes, `patch()` is what `write()` lands in. */
function storeSeam({ readFails = false } = {}) {
  const keys = {}
  return {
    keys,
    export: () => { if (readFails) throw new Error('the durable fold could not be opened'); return { keys } },
    read: () => keys,
    patch: async (key, fn) => { keys[key] = typeof fn === 'function' ? fn(keys[key]) : fn },
  }
}

async function resumeProbe(mod) {
  const attempt = async (fn) => { try { return { value: await fn() } } catch (e) { return { code: (e && e.code) || String((e && e.message) || e) } } }
  // (a) never read
  const s1 = storeSeam()
  const r1 = mod.createResume({ store: s1, clock: () => 1000 })
  const beforeRead = await attempt(() => r1.write('institute', { v: 1 }))
  // (b) the read itself failed
  const s2 = storeSeam({ readFails: true })
  const r2 = mod.createResume({ store: s2, clock: () => 1000 })
  const readFailed = await attempt(() => r2.read())
  const afterFailedRead = await attempt(() => r2.write('institute', { v: 1 }))
  // (c) CONTROL: a successful read unlocks exactly the same write
  const s3 = storeSeam()
  const r3 = mod.createResume({ store: s3, clock: () => 1000 })
  const readOk = await attempt(() => r3.read())
  const controlWrite = await attempt(() => r3.write('institute', { v: 1 }))
  return {
    beforeReadCode: beforeRead.code || null, landedBeforeRead: Object.keys(s1.keys).length,
    readFailedCode: readFailed.code || null,
    afterFailedReadCode: afterFailedRead.code || null, landedAfterFailedRead: Object.keys(s2.keys).length,
    controlReadOk: readOk.value && readOk.value.ok === true, controlWriteOk: !!(controlWrite.value && controlWrite.value.ok), controlLanded: Object.keys(s3.keys).length,
    writeRefusals: r1.status().writeRefusals,
  }
}

/** The F18 probe: four exits of `recover()`, each read through `status().lock` AND the lock service itself. */
async function resumeLockProbe(mod) {
  const mkLock = (over) => createStorePolicy({ settings: Object.assign({ 'vmu.store.lock': true }, over || {}), clock: () => 0, log: () => {} })
  const attempt = async (fn) => { try { return { value: await fn() } } catch (e) { return { code: (e && e.code) || String((e && e.message) || e) } } }
  // (a) HAPPY: the lock is taken and released by the finally. The work ledger is wired because an unwired one makes
  //     the `inflight` step report `ok:false` — the recovery would then "succeed" at nothing, which is not the exit
  //     under test here.
  const sA = storeSeam()
  const lockA = mkLock()
  const rA = mod.createResume({ store: sA, work: createWorkLedger({ store: sA, clock: () => 0 }), lock: lockA, clock: () => 0 })
  const happy = await attempt(() => rA.recover({ reason: 'happy' }))
  // (b) THROW: the durable fold cannot be opened ⇒ a NAMED refusal inside recoverUnlocked ⇒ the finally must still run.
  const lockB = mkLock()
  const rB = mod.createResume({ store: storeSeam({ readFails: true }), lock: lockB, clock: () => 0 })
  const threw = await attempt(() => rB.recover({ reason: 'throws' }))
  // (c) EARLY RETURN: no store ⇒ a REPORT (not a throw) from inside the section ⇒ released as well.
  const lockC = mkLock()
  const rC = mod.createResume({ lock: lockC, clock: () => 0 })
  const early = await attempt(() => rC.recover({ reason: 'no-store' }))
  // (d) EXCLUSIVITY: somebody else holds the lock; our side must refuse BY NAME and acquire nothing.
  const lockD = mkLock()
  lockD.acquire({ name: 'recovery', by: 'operator' })
  const rD = mod.createResume({ store: storeSeam(), lock: lockD, clock: () => 0 })
  const busy = await attempt(() => rD.recover({ reason: 'busy' }))
  return {
    happyOk: !!(happy.value && happy.value.ok === true),
    happyDiag: happy.code || (happy.value && happy.value.steps ? happy.value.steps.filter((s) => s.ok !== true).map((s) => s.step + ':' + (s.code || 'not-ok')).join(',') : 'no-report'),
    happyReleases: rA.status().lock.releases, happyHeld: rA.status().lock.held, happyLocks: lockA.status().locks,
    throwCode: threw.code || null,
    throwReleases: rB.status().lock.releases, throwHeld: rB.status().lock.held, throwLocks: lockB.status().locks,
    earlyCode: (early.value && early.value.code) || null,
    earlyReleases: rC.status().lock.releases, earlyLocks: lockC.status().locks,
    busyCode: busy.code || null, busyAcquisitions: rD.status().lock.acquisitions,
    busyRefusals: rD.status().lock.busyRefusals, holderIntact: lockD.status().locks,
  }
}

const family = await falsifyFamily({
  name: 'resume — an unread snapshot is never overwritten, and the recovery lock is released on every exit',
  cases: [{
    name: 'resume.js — the read-before-write gate',
    module: RESUME,
    probe: resumeProbe,
    mutations: [
      { label: 'the write path skips the gate', name: 'resume-skip-gate',
        find: "    requireRead('write durable key ' + String(key))\n", replace: '' },
      { label: 'a FAILED read still unlocks the gate', name: 'resume-failed-read-unlocks',
        find: '    if (!readOk) {\n      writeRefusals += 1\n', replace: '    if (false) {   // MUTANT: the latch is ignored\n      writeRefusals += 1\n' },
    ],
  }, {
    name: 'resume.js — the F18 exclusive section',
    module: RESUME,
    probe: resumeLockProbe,
    controlFields: ['happyOk', 'happyReleases', 'throwReleases', 'earlyReleases', 'busyRefusals'],
    mutations: [
      // The narrow one: the happy path still releases, so ONLY the exits that do not fall through the tail leak.
      { label: 'the release is happy-path-only (no finally)', name: 'resume-release-no-finally',
        find: '    const acquired = acquireRecoveryLock()\n    try {\n      return await recoverUnlocked(args)\n    } finally {\n      if (acquired !== null) releaseRecoveryLock()\n    }',
        replace: '    const acquired = acquireRecoveryLock()\n    const out = await recoverUnlocked(args)   // MUTANT: no `finally` — a throw skips the release\n    if (acquired !== null) releaseRecoveryLock()\n    return out' },
      { label: 'the release never runs at all', name: 'resume-release-never',
        find: '      if (acquired !== null) releaseRecoveryLock()',
        replace: '      if (false) releaseRecoveryLock()   // MUTANT: the lock is kept' },
      { label: 'a refused lock is ignored (exclusivity not enforced)', name: 'resume-busy-ignored',
        find: '    if (!r || r.ok === false) {',
        replace: '    if (false) {   // MUTANT: somebody else may hold the lock and we proceed anyway' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module keeps the latch ===')
ok(family.cases[0].real.beforeReadCode === 'VMU_RESUME_WRITE_BEFORE_READ' && family.cases[0].real.landedBeforeRead === 0,
  '★ a write before any read is refused BY NAME and lands NOTHING', family.cases[0].real)
ok(family.cases[0].real.readFailedCode === 'VMU_RESUME_UNAVAILABLE' && family.cases[0].real.afterFailedReadCode === 'VMU_RESUME_WRITE_BEFORE_READ' && family.cases[0].real.landedAfterFailedRead === 0,
  '★ a FAILED read does not unlock writes (a read that could not prove the snapshot does not count)', family.cases[0].real)
ok(family.cases[0].real.controlReadOk === true && family.cases[0].real.controlWriteOk === true && family.cases[0].real.controlLanded === 1,
  'and after a SUCCESSFUL read the same write lands (control direction)', family.cases[0].real)
ok(family.cases[0].real.writeRefusals === 1, 'the refusal is COUNTED on the face (status().writeRefusals)', family.cases[0].real.writeRefusals)

console.log('=== CONTROL GROUP: the unmutated module releases the lock on EVERY exit ===')
const L = family.cases[1].real
ok(L.happyOk === true && L.happyReleases === 1 && L.happyHeld === false && L.happyLocks === 0,
  '★ the happy path acquires once, releases once, and the lock service reports nothing held', L)
ok(L.throwCode === 'VMU_RESUME_UNAVAILABLE' && L.throwReleases === 1 && L.throwHeld === false && L.throwLocks === 0,
  '★ the THROW path refuses by name AND still releases (this is the exit a happy-path-only release would leak)', L)
ok(L.earlyCode === 'VMU_RESUME_UNAVAILABLE' && L.earlyReleases === 1 && L.earlyLocks === 0,
  '★ the EARLY-RETURN path (no store ⇒ a report, not a throw) releases as well', L)
ok(L.busyCode === 'VMU_RESUME_BUSY' && L.busyAcquisitions === 0 && L.busyRefusals === 1 && L.holderIntact === 1,
  '★ a second recovery is refused BY NAME, acquires nothing, and does NOT touch the holder\'s lock', L)

console.log('=== FALSIFICATION: open the latch or cut the release, and the SAME probe goes red ===')
ok(family.ok, '★ all five resume mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const skipRed = byLabel('skips the gate') && byLabel('skips the gate').red
const failedReadRed = byLabel('FAILED read') && byLabel('FAILED read').red
ok(!!skipRed && skipRed.beforeReadCode === null && skipRed.landedBeforeRead === 1,
  '★ "write path skips the gate": the unread snapshot IS overwritten (no refusal, one key landed)', skipRed)
ok(!!failedReadRed && failedReadRed.afterFailedReadCode === null && failedReadRed.landedAfterFailedRead === 1,
  '★ "a failed read still unlocks": a read that threw lets the write through (the v5r V5_STATE_NOT_LOADED rule is gone)', failedReadRed)
const noFinallyRed = byLabel('happy-path-only') && byLabel('happy-path-only').red
const neverRed = byLabel('release never runs') && byLabel('release never runs').red
const busyRed = byLabel('refused lock is ignored') && byLabel('refused lock is ignored').red
ok(!!noFinallyRed && noFinallyRed.happyReleases === 1 && noFinallyRed.throwReleases === 0 && noFinallyRed.throwLocks === 1 && noFinallyRed.throwCode === 'VMU_RESUME_UNAVAILABLE',
  '★ "no finally": the refusal still happens, but the LOCK IS LEAKED on the throwing exit while the happy path is untouched (the mutation is narrow)', noFinallyRed)
ok(!!neverRed && neverRed.happyReleases === 0 && neverRed.throwReleases === 0 && neverRed.earlyReleases === 0 && neverRed.happyLocks === 1,
  '★ "the release never runs": every exit keeps the lock — including the one that returned a report', neverRed)
ok(!!busyRed && busyRed.busyCode === null && busyRed.busyAcquisitions === 1 && busyRed.busyRefusals === 0 && busyRed.holderIntact === 0,
  '★ "a refused lock is ignored": the recovery RUNS while somebody else holds the lock — and its own release then FREES the holder\'s lock (the declared exclusivity is gone in both directions)', busyRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases.length > 0 && family.cases.every((c) => c.leftovers.length === 0),
  'the mutated copies were written to D:\\_tmp and deleted again', family.cases.map((c) => c.leftovers))

console.log('')
console.log('=== VMU RESUME FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
