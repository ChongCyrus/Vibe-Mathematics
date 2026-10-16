// tests/fixtures/human-gate-counterexample.mjs — task-215 ②'s COPY-BASED COUNTEREXAMPLE.
//
// It is NOT a product module: it wraps the real `kernel/human.js` and re-shapes the gate's decision according to
// `VMU_HUMAN_MUTANT`, so the approval suite's red side is PROVEN rather than asserted:
//   · `byrole`      — the gate adjudicates BY THE CALLER'S ROLE (the exact thing the task-205 B ruling forbids);
//   · `droprefusal` — a rejecting decision is turned into an ALLOW (a queued action would run).
// Usage: VMU_HUMAN_MODULE=./fixtures/human-gate-counterexample.mjs VMU_HUMAN_MUTANT=byrole node tests/vmu-approval-decision.test.mjs
import * as real from '../../vibe-math-vmu/kernel/human.js'

export const CODE = real.CODE

export function createHuman(opts = {}) {
  const api = real.createHuman(opts)
  const mode = process.env.VMU_HUMAN_MUTANT || 'none'
  if (mode === 'none') return api
  const original = api.approvalDecision.bind(api)
  // `api.gate()` reaches the gate through `api.approvalDecision` on purpose (kernel/human.js:389-393), so wrapping
  // this method is enough for the mutation to reach BOTH shapes (decision object and thrown refusal).
  api.approvalDecision = (req = {}) => {
    const d = original(req)
    if (mode === 'byrole' && req && req.byRole === 'temp') {
      return Object.assign({}, d, { ok: true, allowed: true, code: undefined, gated: false, state: 'allowed', note: 'MUTANT: adjudicated by role' })
    }
    if (mode === 'droprefusal' && d && d.ok === false) {
      return Object.assign({}, d, { ok: true, allowed: true, code: undefined, state: 'allowed', note: 'MUTANT: the refusal was dropped' })
    }
    return d
  }
  return api
}

export default { createHuman, CODE }
