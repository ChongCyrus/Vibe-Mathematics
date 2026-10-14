// tests/vmu-storepolicy-falsify.test.mjs — FAMILY 9: `kernel/storepolicy.js`, the LOCK RELEASE discipline
// (the F18-adjacent claim: a lock must be freed on the way out, so the next writer is not blocked forever).
// Run: node tests/vmu-storepolicy-falsify.test.mjs
//
// The probe reads the whole lifecycle, each direction with a control:
//   · ACQUIRE      — the first acquire takes the lock (locked:true, holder named);
//   · EXCLUSION    — a second acquire while held is refused BY NAME (`VMU_CONFLICT`), so the lock is not decorative;
//   · RELEASE      — release reports `released:true` AND the next acquire then SUCCEEDS (this is the discipline);
//   · HONESTY      — releasing a name that was never held reports `released:false` (no pretended release);
//   · STATUS       — while held, `status().locks` counts it.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const STOREPOLICY = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'storepolicy.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

function storepolicyProbe(mod) {
  const mk = () => mod.createStorePolicy({ clock: () => 0, log: () => {}, settings: { 'vmu.store.backend': 'memory' } })
  const s = mk()
  const first = s.acquire({ name: 'db', by: 'm1' })
  const second = s.acquire({ name: 'db', by: 'm2' })          // must be refused while held
  const heldStatus = s.status().locks
  const released = s.release({ name: 'db' })
  const afterRelease = s.acquire({ name: 'db', by: 'm2' })    // must succeed: the release really freed it
  const neverHeld = mk().release({ name: 'never-held' })
  return {
    firstLocked: first.ok === true && first.locked === true && first.holder === 'm1',
    secondCode: second.ok === false ? second.code : 'allowed',
    statusLocks: heldStatus,
    releasedFlag: released.released === true,
    afterReleaseOk: afterRelease.ok === true && afterRelease.locked === true,
    unknownReleased: neverHeld.released === false,
  }
}

const family = await falsifyFamily({
  name: 'storepolicy — the lock is exclusive, and a release really frees it',
  cases: [{
    name: 'storepolicy.js',
    module: STOREPOLICY,
    probe: storepolicyProbe,
    controlFields: ['firstLocked', 'releasedFlag', 'afterReleaseOk', 'unknownReleased'],
    mutations: [
      { label: 'release reports the lock but keeps it', name: 'storepolicy-release-keeps',
        find: '    const had = locks.delete(name)\n', replace: '    const had = locks.has(name)   // MUTANT: the lock is reported as released and kept\n' },
      { label: 'acquire never records the holder', name: 'storepolicy-acquire-noop',
        find: 'locks.set(name, { by: String(args.by || \'anon\'), at: clock() })',
        replace: 'locks.set(\'mutant-noop\', { by: String(args.by || \'anon\'), at: clock() })   // MUTANT: the lock is never taken under its name' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated lock is exclusive and a release frees it ===')
ok(family.cases[0].real.firstLocked === true && family.cases[0].real.statusLocks === 1,
  '★ the first acquire takes the lock and status() counts it', family.cases[0].real)
ok(family.cases[0].real.secondCode === 'VMU_CONFLICT',
  '★ a second acquire while held is refused BY NAME (the lock is not decorative)', family.cases[0].real)
ok(family.cases[0].real.releasedFlag === true && family.cases[0].real.afterReleaseOk === true,
  '★ release reports released:true AND the next acquire succeeds (the lock was really freed)', family.cases[0].real)
ok(family.cases[0].real.unknownReleased === true,
  'and releasing a name that was never held reports released:false (control direction: no pretended release)', family.cases[0].real)

console.log('=== FALSIFICATION: keep the lock on release, or never take it ===')
ok(family.ok, '★ both storepolicy mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const keepRed = byLabel('release reports the lock') && byLabel('release reports the lock').red
const noopRed = byLabel('never records the holder') && byLabel('never records the holder').red
ok(!!keepRed && keepRed.releasedFlag === true && keepRed.afterReleaseOk === false && keepRed.secondCode === 'VMU_CONFLICT',
  '★ "release keeps it": the receipt says released while the next writer is still blocked — the classic "lock leak"', keepRed)
ok(!!noopRed && noopRed.secondCode === 'allowed' && noopRed.firstLocked === true,
  '★ "never records the holder": two writers hold the same lock at once (exclusion is gone) while the receipt still says locked', noopRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU STOREPOLICY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
