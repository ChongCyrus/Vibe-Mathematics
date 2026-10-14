// tests/vmu-doc-invariant-falsify.test.mjs — FAMILY 10 / the DOCUMENT-INVARIANT form (round 8, task C):
// a promise written in a VOLUME becomes a guard, because the implementation behind it is falsified by the same
// library. Run: node tests/vmu-doc-invariant-falsify.test.mjs
//
// THE PROMISE (docs/07-durability-library.md:502, verbatim):
//   "…计数进 `status().inflight.unackedMail`（＋`unackedMailSource`），`steps.mailbox.source='durable-mailbox-key'`，
//    无端口无键 ⇒ 仍具名 `VMU_RESUME_MAILBOX_UNAVAILABLE`（**null，不是假 0**）。"
// i.e. UNKNOWN IS NOT ZERO: when no mailbox port and no durable mailbox key exist, the count is `null`, never a
// comfortable-looking 0. The probe reads the DOC (so the citation is machine-checked, not a comment that can rot) and
// the IMPLEMENTATION, and the mutation below proves the implementation side is load-bearing.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESUME = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'resume.js')
const DOC = join(HERE, '..', 'vibe-math-vmu', 'docs', '07-durability-library.md')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** A minimal durable store: `export()` feeds read(), `read(key)` feeds the mailbox step, `patch()` accepts writes. */
function storeSeam(keys = {}) {
  return { keys, export: () => ({ keys }), read: (k) => keys[k], patch: async (k, fn) => { keys[k] = typeof fn === 'function' ? fn(keys[k]) : fn } }
}

async function docInvariantProbe(mod) {
  // (a) THE PROMISE: no mailbox port AND no durable mailbox key ⇒ the count is UNKNOWN (null), never a fake 0.
  const s1 = storeSeam()
  const r1 = mod.createResume({ store: s1, clock: () => 1000 })
  await r1.recover({ reason: 'doc-invariant-probe' })
  const st1 = r1.status()
  // (b) CONTROL: a mailbox port that answers ⇒ the count is real and the source is named.
  const r2 = mod.createResume({ store: storeSeam(), clock: () => 1000,
    mailbox: { pending: () => [{ id: 'ml-1' }, { id: 'ml-2' }, { id: 'ml-3' }] } })
  await r2.recover({ reason: 'doc-invariant-probe' })
  const st2 = r2.status()
  // (c) CONTROL: the durable mailbox key answers when there is no port.
  const r3 = mod.createResume({ store: storeSeam({ mailbox: { face: 'mailbox', data: { boxes: { m1: [{ id: 'ml-9' }] } } } }), clock: () => 1000 })
  await r3.recover({ reason: 'doc-invariant-probe' })
  const st3 = r3.status()
  // (d) THE CITATION: the volume still states the promise (a doc edit that drops it reddens this family).
  const docText = readFileSync(DOC, 'utf8')
  return {
    unknownIsNull: st1.inflight && st1.inflight.unackedMail === null,
    unknownNotZero: st1.inflight && st1.inflight.unackedMail !== 0,
    unknownSource: st1.inflight ? st1.inflight.unackedMailSource : null,
    portCount: st2.inflight ? st2.inflight.unackedMail : null, portSource: st2.inflight ? st2.inflight.unackedMailSource : null,
    keyCount: st3.inflight ? st3.inflight.unackedMail : null, keySource: st3.inflight ? st3.inflight.unackedMailSource : null,
    docSaysNullNotZero: /unackedMail[\s\S]{0,400}?null，不是假 0/.test(docText),
  }
}

const family = await falsifyFamily({
  name: 'docs/07:502 — "unackedMail is null, not a fake 0" (a documented promise, falsified)',
  cases: [{
    name: 'resume.js',
    module: RESUME,
    probe: docInvariantProbe,
    // `docSaysNullNotZero` is a CONTROL FIELD: the family cannot pass if the volume stops stating the promise.
    controlFields: ['portCount', 'keyCount', 'docSaysNullNotZero'],
    mutations: [
      { label: 'the unknown count becomes a comfortable zero', name: 'resume-unacked-zero',
        find: 'state.inflight.unackedMail = mb.attached ? mb.pending : null',
        replace: 'state.inflight.unackedMail = mb.attached ? mb.pending : 0   // MUTANT: "unknown" is reported as 0' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the implementation keeps the documented promise ===')
ok(family.cases[0].real.unknownIsNull === true && family.cases[0].real.unknownNotZero === true,
  '★ no port and no durable key ⇒ `status().inflight.unackedMail` is null (never a fake 0)', family.cases[0].real)
ok(family.cases[0].real.portCount === 3 && family.cases[0].real.portSource === 'port',
  'and a mailbox port gives the REAL count with its source named (control direction)', family.cases[0].real)
ok(family.cases[0].real.keyCount === 1 && family.cases[0].real.keySource === 'durable-mailbox-key',
  'and the durable mailbox key gives the real count when there is no port', family.cases[0].real)
ok(family.cases[0].real.docSaysNullNotZero === true,
  '★ and the VOLUME still states the promise (the citation is machine-checked, not a rotting comment)', family.cases[0].real)

console.log('=== FALSIFICATION: change the implementation and the DOCUMENTED promise goes red ===')
ok(family.ok, '★ the documented promise is falsified by a single-point implementation change', formatFamilyReport(family))
const red = family.results[0] && family.results[0].red
ok(!!red && red.unknownIsNull === false && red.unknownNotZero === false,
  '★ "unknown becomes 0": the doc says null-not-zero and the implementation now says 0 — the guard is what makes the promise checkable', red)
ok(!!red && red.portCount === 3 && red.keyCount === 1,
  'and the two real counts are untouched (the mutation is narrow: only the UNKNOWN case lies)', red)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and the mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copy was written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU DOC-INVARIANT FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
