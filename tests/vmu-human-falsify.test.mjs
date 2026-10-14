// tests/vmu-human-falsify.test.mjs — FAMILY 6: `kernel/human.js`, the HUMAN APPROVAL GATE — a gated action does NOT
// run until a human has allowed it (`docs/17 §19`; the face's own words: "the one invariant worth stating").
// Run: node tests/vmu-human-falsify.test.mjs
//
// Three ways to break it, all read by ONE probe:
//   · NEVER ALLOWED   — a gated action queues and `gate()` throws `VMU_HUMAN_APPROVAL_PENDING`, and a WRAPPED method
//                       really does not run while pending;
//   · ALLOW DOES NOT RELEASE — after `decide({allow:true})` the very same action passes (and the wrapped method runs);
//   · SILENCE IS NOT CONSENT — an EXPIRED wait with the declared default `hold` stays pending (never `default-allow`);
//   · CONTROL         — an action NOT in `vmu.human.gatedActions` runs untouched (zero mechanism), so the gate is
//                       not "everything is refused".
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HUMAN = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'human.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

async function humanProbe(mod) {
  const mk = (settings = {}) => mod.createHuman({ clock: () => 1000, log: () => {}, settings, bus: null })
  const SET = { 'vmu.human.gatedActions': ['task.create'], 'vmu.human.approvalTimeoutMs': 5000 }
  const h = mk(SET)
  const codeOf = (fn) => { try { fn(); return null } catch (e) { return (e && e.code) || String((e && e.message) || e) } }
  const stateOf = (fn) => { try { const r = fn(); return r && r.ok === true ? (r.state || 'allowed') : ((r && r.code) || 'allowed') } catch (e) { return (e && e.code) || String((e && e.message) || e) } }

  // (a) NEVER ALLOWED: the decision object queues, gate() throws, and a WRAPPED method does not run.
  const pending = h.approvalDecision({ action: 'task.create', subject: 't-1' })
  const gateCode = codeOf(() => h.gate({ action: 'task.create', subject: 't-1' }))
  const calls = []
  const svc = { create: (x) => { calls.push(x); return { ok: true } } }
  mod.attachApprovalGate({ target: svc, methods: ['create'], gate: h.gate, subjectOf: () => 't-1', face: 'task' })
  const wrappedCode = codeOf(() => svc.create({ title: 'x' }))
  const ranWhilePending = calls.length
  const queuedOnce = h.queue().requests.filter((r) => r.subject === 't-1').length   // the same (action, subject) queues ONCE

  // (b) ALLOW RELEASES: decide it, then the same action (and the wrapped method) passes.
  codeOf(() => h.decide({ requestId: pending.requestId, allow: true, by: 'operator' }))   // a mutant may have queued nothing
  const afterAllow = stateOf(() => h.approvalDecision({ action: 'task.create', subject: 't-1' }))
  const wrappedAfterAllow = codeOf(() => svc.create({ title: 'y' }))
  const ranAfterAllow = calls.length

  // (c) SILENCE IS NOT CONSENT: a request opened at t=1000 and asked again past its timeout still HOLDS — and it
  //     still holds even when the deployment acknowledged `default-allow`, because the DECLARED action is `hold`.
  h.approvalDecision({ action: 'task.create', subject: 't-3' })
  const expired = h.approvalDecision({ action: 'task.create', subject: 't-3', at: 1000 + 60000 })
  const hAck = mk(Object.assign({}, SET, { 'vmu.human.defaultAllowAcknowledged': true }))
  hAck.approvalDecision({ action: 'task.create', subject: 't-4' })
  const expiredAck = hAck.approvalDecision({ action: 'task.create', subject: 't-4', at: 1000 + 60000 })

  // (d) CONTROL: an action that is not declared runs untouched.
  const ungated = h.approvalDecision({ action: 'task.list' })
  const status = h.status()
  return {
    pendingCode: pending.ok === false ? pending.code : 'allowed', pendingQueued: pending.queued === true,
    gateCode, wrappedCode, ranWhilePending, queuedOnce,
    afterAllowState: afterAllow,
    wrappedAfterAllow, ranAfterAllow,
    expiredCode: expired.ok === false ? expired.code : (expired.state || 'allowed'), expiredHeld: expired.heldOnTimeout === true,
    expiredAckAllowed: expiredAck.ok === true, expiredAckState: expiredAck.ok === true ? (expiredAck.state || 'allowed') : expiredAck.code,
    ungatedAllowed: ungated.ok === true && ungated.gated === false,
    gateQueued: status.gateQueued, gateAllowed: status.gateAllowed,
  }
}

const family = await falsifyFamily({
  name: 'human — a gated action waits for a human (and silence is never consent)',
  cases: [{
    name: 'human.js',
    module: HUMAN,
    probe: humanProbe,
    controlFields: ['ungatedAllowed', 'afterAllowState', 'expiredHeld'],
    mutations: [
      { label: 'the gate allows everything (ungated check inverted)', name: 'human-gate-open',
        find: '    if (c.gatedActions.indexOf(act) === -1) {', replace: '    if (true) { /* MUTANT: every action is treated as ungated */ ' },
      { label: 'an approval never releases the action', name: 'human-allow-does-not-release',
        find: "    if (rec.decidedAt !== null && rec.decision === 'allowed') {", replace: '    if (false) { /* MUTANT: an allowed request keeps queueing */ ' },
      { label: 'the timeout default drifts away from hold', name: 'human-timeout-default',
        find: "TIMEOUT_ACTIONS.includes(sget('vmu.human.onTimeout')) ? sget('vmu.human.onTimeout') : 'hold',",
        replace: "TIMEOUT_ACTIONS.includes(sget('vmu.human.onTimeout')) ? sget('vmu.human.onTimeout') : 'default-allow', /* MUTANT: silence would become consent */" },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module gates, releases and never consents by silence ===')
ok(family.cases[0].real.pendingCode === 'VMU_HUMAN_APPROVAL_PENDING' && family.cases[0].real.gateCode === 'VMU_HUMAN_APPROVAL_PENDING' && family.cases[0].real.pendingQueued === true,
  '★ an unapproved gated action queues and gate() throws BY NAME', family.cases[0].real)
ok(family.cases[0].real.wrappedCode === 'VMU_HUMAN_APPROVAL_PENDING' && family.cases[0].real.ranWhilePending === 0 && family.cases[0].real.queuedOnce === 1,
  '★ the WRAPPED method really does not run while pending, and the same (action, subject) queues once', family.cases[0].real)
ok(family.cases[0].real.afterAllowState === 'allowed' && family.cases[0].real.wrappedAfterAllow === null && family.cases[0].real.ranAfterAllow === 1,
  '★ after decide({allow:true}) the same action passes and the wrapped method RUNS (control direction)', family.cases[0].real)
ok(family.cases[0].real.expiredCode === 'VMU_HUMAN_APPROVAL_PENDING' && family.cases[0].real.expiredHeld === true,
  '★ an EXPIRED wait with the declared default hold stays pending — silence is not consent', family.cases[0].real)
ok(family.cases[0].real.expiredAckAllowed === false && family.cases[0].real.expiredAckState === 'VMU_HUMAN_APPROVAL_PENDING',
  '★ and it STILL holds when the deployment acknowledged default-allow: acknowledging the flag does not change the declared action', family.cases[0].real)
ok(family.cases[0].real.ungatedAllowed === true, 'and an action that is not declared runs untouched (zero mechanism)', family.cases[0].real)

console.log('=== FALSIFICATION: open the gate, keep it shut, or let silence consent ===')
ok(family.ok, '★ all three human mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const openRed = byLabel('allows everything') && byLabel('allows everything').red
const stuckRed = byLabel('never releases') && byLabel('never releases').red
const silenceRed = byLabel('timeout default drifts') && byLabel('timeout default drifts').red
ok(!!openRed && openRed.pendingCode === 'allowed' && openRed.ranWhilePending === 1,
  '★ "gate allows everything": the unapproved action runs immediately (nothing queues, the wrapped method executes)', openRed)
ok(!!stuckRed && stuckRed.afterAllowState !== 'allowed' && stuckRed.ranAfterAllow === 0,
  '★ "allow never releases": the human approved it and it STILL never runs — worse, the allowed request is reported as DENIED', stuckRed)
ok(!!silenceRed && silenceRed.expiredAckAllowed === true && silenceRed.expiredAckState === 'allowed-on-timeout',
  '★ "timeout default drifts": with default-allow acknowledged, an expired wait becomes ALLOWED — silence counts as consent', silenceRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU HUMAN FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
