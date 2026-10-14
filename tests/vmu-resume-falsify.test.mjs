// tests/vmu-resume-falsify.test.mjs — FAMILY 4: `kernel/resume.js`, the READ-BEFORE-WRITE gate (v5r's
// `V5_STATE_NOT_LOADED` rule). Run: node tests/vmu-resume-falsify.test.mjs
//
// The invariant: "an unread snapshot must never be overwritten". Two ways to break it, and the probe reads both:
//   · NEVER READ     — a write before any successful read is refused BY NAME and NOTHING lands in the store;
//   · READ FAILED    — a read that threw does NOT unlock writes (the latch stays closed);
//   · CONTROL        — after a successful read the very same write succeeds (so "nothing landed" is not vacuous).
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

const family = await falsifyFamily({
  name: 'resume — an unread snapshot is never overwritten',
  cases: [{
    name: 'resume.js',
    module: RESUME,
    probe: resumeProbe,
    mutations: [
      { label: 'the write path skips the gate', name: 'resume-skip-gate',
        find: "    requireRead('write durable key ' + String(key))\n", replace: '' },
      { label: 'a FAILED read still unlocks the gate', name: 'resume-failed-read-unlocks',
        find: '    if (!readOk) {\n      writeRefusals += 1\n', replace: '    if (false) {   // MUTANT: the latch is ignored\n      writeRefusals += 1\n' },
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

console.log('=== FALSIFICATION: open the latch and the SAME probe goes red ===')
ok(family.ok, '★ both resume mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const skipRed = byLabel('skips the gate') && byLabel('skips the gate').red
const failedReadRed = byLabel('FAILED read') && byLabel('FAILED read').red
ok(!!skipRed && skipRed.beforeReadCode === null && skipRed.landedBeforeRead === 1,
  '★ "write path skips the gate": the unread snapshot IS overwritten (no refusal, one key landed)', skipRed)
ok(!!failedReadRed && failedReadRed.afterFailedReadCode === null && failedReadRed.landedAfterFailedRead === 1,
  '★ "a failed read still unlocks": a read that threw lets the write through (the v5r V5_STATE_NOT_LOADED rule is gone)', failedReadRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU RESUME FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
