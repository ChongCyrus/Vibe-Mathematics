// tests/vmu-fidelity-falsify.test.mjs — FAMILY 5: `kernel/fidelity.js`, the C-45 ABSTENTION REWRITE — the face's
// "唯一强制点": a member registered as having declared a fidelity defect on an object cannot make a boolean (1/0)
// assertion about it; the vote is rewritten to 0.5 (abstain). Run: node tests/vmu-fidelity-falsify.test.mjs
//
// The probe reads the enforcement AND its three boundaries (each a control direction, so the enforcement reading is
// not "everything is rewritten"):
//   · registered member, declared 1 and 0  ⇒ vote 0.5, enforced true (both polarities, so it is not a clamp);
//   · another member on the same object    ⇒ passthrough (enforced false);
//   · an already-uncertain value (0.3)     ⇒ passthrough (only a BOOLEAN assertion is overridden);
//   · another object, same member          ⇒ passthrough (the defect is per-object).
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIDELITY = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'fidelity.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

async function fidelityProbe(mod) {
  const reg = mod.createFidelityRegistry({ clock: () => 1000, log: () => {}, bus: null })
  const declared = await reg.declareDefect({ target: 'p-1', by: 'm1', note: 'the proof strengthened the hypothesis it was meant to test' })
  const one = reg.applyAbstention({ target: 'p-1', by: 'm1', declared: 1 })
  const zero = reg.applyAbstention({ target: 'p-1', by: 'm1', declared: 0 })
  const other = reg.applyAbstention({ target: 'p-1', by: 'm2', declared: 1 })
  const uncertain = reg.applyAbstention({ target: 'p-1', by: 'm1', declared: 0.3 })
  const otherTarget = reg.applyAbstention({ target: 'p-2', by: 'm1', declared: 1 })
  const view = reg.view()
  return {
    markerVote: declared.enforcedAbstention && declared.enforcedAbstention.vote,
    oneVote: one.vote, oneEnforced: one.enforced === true, oneReason: one.reason || null,
    zeroVote: zero.vote, zeroEnforced: zero.enforced === true,
    otherVote: other.vote, otherEnforced: other.enforced === true,
    uncertainVote: uncertain.vote, uncertainEnforced: uncertain.enforced === true,
    otherTargetVote: otherTarget.vote,
    abstentionsEnforced: view.abstentionsEnforced, enforcedVote: view.enforcedVote, declaredCount: view.declared,
  }
}

const family = await falsifyFamily({
  name: 'fidelity — the C-45 abstention rewrite cannot be skipped or softened',
  cases: [{
    name: 'fidelity.js',
    module: FIDELITY,
    probe: fidelityProbe,
    mutations: [
      { label: 'the boolean override is skipped', name: 'fidelity-skip-override',
        find: '    if (!(declared === 0 || declared === 1)) {', replace: '    if (true) {   // MUTANT: a boolean assertion is never overridden' },
      { label: 'the abstention value drifts from 0.5', name: 'fidelity-vote-drift',
        find: 'export const FIDELITY_ABSTENTION_VOTE = 0.5', replace: 'export const FIDELITY_ABSTENTION_VOTE = 0.25   // MUTANT: abstention becomes a soft partial vote' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module enforces exactly the boolean assertion ===')
ok(family.cases[0].real.oneVote === 0.5 && family.cases[0].real.oneEnforced === true && family.cases[0].real.oneReason === 'fidelity-defect',
  '★ a registered member declaring 1 gets 0.5 / enforced:true (and the reason is named)', family.cases[0].real)
ok(family.cases[0].real.zeroVote === 0.5 && family.cases[0].real.zeroEnforced === true,
  '★ and declaring 0 is rewritten the same way (it is an abstention, not a clamp)', family.cases[0].real)
ok(family.cases[0].real.otherVote === 1 && family.cases[0].real.otherEnforced === false && family.cases[0].real.otherTargetVote === 1,
  'another member, and another object for the same member, pass through (the defect is per (object, member))', family.cases[0].real)
ok(family.cases[0].real.uncertainVote === 0.3 && family.cases[0].real.uncertainEnforced === false,
  'an already-uncertain value passes through (only a BOOLEAN assertion is overridden)', family.cases[0].real)
ok(family.cases[0].real.markerVote === 0.5 && family.cases[0].real.enforcedVote === 0.5 && family.cases[0].real.declaredCount === 1,
  'the durable marker and the view both carry the same enforced vote', family.cases[0].real)

console.log('=== FALSIFICATION: skip the rewrite or move the value, and the SAME probe goes red ===')
ok(family.ok, '★ both fidelity mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const skipRed = byLabel('boolean override is skipped') && byLabel('boolean override is skipped').red
const driftRed = byLabel('abstention value drifts') && byLabel('abstention value drifts').red
ok(!!skipRed && skipRed.oneVote === 1 && skipRed.oneEnforced === false && skipRed.zeroVote === 0 && skipRed.abstentionsEnforced === 0,
  '★ "override skipped": the defective member\'s 1 and 0 both STAND as conclusions (C-45 is gone, and nothing is counted)', skipRed)
ok(!!driftRed && driftRed.oneVote === 0.25 && driftRed.markerVote === 0.25 && driftRed.enforcedVote === 0.25,
  '★ "value drifts": an abstention silently becomes a soft 0.25 partial vote everywhere (marker and view included)', driftRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU FIDELITY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
