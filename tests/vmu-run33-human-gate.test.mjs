#!/usr/bin/env node
// tests/vmu-run33-human-gate.test.mjs — ROUND 33: THE HUMAN FACE HAD NO SEAT GATE.
//
// WHY THIS FILE EXISTS. `vibe-math-vmu/tools/human.js` is the human's operational surface: it approves requests,
// withdraws them, vetoes the institute and injects the human's voice into a running round. Until this round it had
// **no caller check at all** — the only role concept anywhere near it was `vmu.human.vetoLiftRoles`, which governs
// `liftVeto`'s `by` argument and nothing else. Measured on the real entry (probe-human-gate.mjs, before the fix):
//     office openApproval            → ok
//     chair  decide (allow:true)     → {"ok":true,"decision":"allowed","decidedBy":"chair"}   ← a SEAT approved
//     member veto                    → {"ok":true,"veto":{"id":"veto-2","by":"member"}}       ← a SEAT vetoed
// So run 33's "所办替院士做裁决" was not a prompt problem: the face itself let any seat act as the human.
//
// THE RED LINE ORDER THIS TEST PINS (task-22):
//   ① the CAPABILITY stays in the kernel; ② the POLICY is a DECLARATION (`vmu.human.deciderRoles` /
//   `vmu.human.injectRoles`), never a literal in the tool body; ③ the most conservative default, out of the box, is
//   "only the office decides" — NO seat may approve, which is exactly the direction an authority mistake must fail;
//   ④ a refusal is NAMED (code + message + hint in the caller's own vocabulary: the seat, the member id, the key).
//
// ★ WHAT "UNCHANGED STATE" MEANS HERE. A refusal that still flipped the approval to `allowed`, or still queued a
// veto, or still delivered a message, would pass a "did it return an error?" test and be useless. Every refused
// verb below is therefore bracketed by an OBSERVED state (approval state, queue pending count, active-veto count,
// mailbox unread count) taken before and after.
//
// ★ AND THE MIRROR QUESTION — "did the gate also break the human's own surface?" — is section ③: the office must
// still be able to do all four verbs. A gate that refuses everyone is not a gate, it is an outage.
//
// Run:  node tests/vmu-run33-human-gate.test.mjs          (exit 1 = the face is not gated / not conservative)
//       node tests/vmu-run33-human-gate.test.mjs --prove-live   (same checks; prints the live settings view)
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const PROVE_LIVE = process.argv.includes('--prove-live')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

// ── THE DECLARATION THIS TEST HOLDS THE FACE TO ───────────────────────────────────────────────────────────────
// Two keys, not one: deciding an approval and speaking as the human are different authorities (task-22 says
// "inject 另列"). Both default to the office alone — the most conservative answer that still leaves a human path.
const DECIDER_KEY = 'vmu.human.deciderRoles'
const INJECT_KEY = 'vmu.human.injectRoles'
const DECIDER_CODE = 'VMU_HUMAN_DECIDER_ROLE'
const INJECT_CODE = 'VMU_HUMAN_INJECT_ROLE'
const CONSERVATIVE_ROLES = ['office']

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const schemaMod = await import(pathToFileURL(join(VMU, 'settings', 'schema.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, kernel: handle.kernel, spec: state.specs.find((s) => s.name === 'vibe_vmu_human') }
}

const roots = []
const freshRoot = async () => {
  const r = await mkdtemp(join(tmpdir(), 'vmu-run33-human-gate-'))
  roots.push(r)
  return r
}

try {
  // ── ① THE DECLARATION: two keys, declared, and their DEFAULT is the conservative one ────────────────────────
  console.log('=== 1. THE DECLARATION (vmu.human.deciderRoles / vmu.human.injectRoles) ===')
  {
    const row = (key) => (schemaMod.SETTING_DEFS || []).find((d) => d && d.key === key)
    const dec = row(DECIDER_KEY)
    const inj = row(INJECT_KEY)
    ok(!!dec, '★ ' + DECIDER_KEY + ' is DECLARED in settings/schema.js (a policy that lives in a literal is not declared at all)', dec)
    ok(!!inj, '★ ' + INJECT_KEY + ' is DECLARED in settings/schema.js (inject is its own authority, so it is its own key)', inj)
    if (dec && inj) {
      ok(dec.type === 'stringList' && inj.type === 'stringList', 'both keys are stringList (a list of roles, not a boolean switch)', { dec: dec.type, inj: inj.type })
      ok(J(dec.def) === J(CONSERVATIVE_ROLES), '★ the DEFAULT decider set is EXACTLY ' + J(CONSERVATIVE_ROLES) + ' (out of the box NO seat may approve — the authority mistake must fail closed)', dec.def)
      ok(J(inj.def) === J(CONSERVATIVE_ROLES), '★ the DEFAULT inject set is EXACTLY ' + J(CONSERVATIVE_ROLES) + ' (a seat may not speak as the human unless a deployment says so)', inj.def)
      ok(typeof dec.doc === 'string' && dec.doc.length > 8, 'the decider key explains itself in its own doc (a key with no words is an undeclared policy)', dec.doc)
      ok(typeof inj.doc === 'string' && inj.doc.length > 8, 'the inject key explains itself in its own doc', inj.doc)
      ok(dec.who === 'office' && inj.who === 'office', 'both keys are owned by the office (the human side owns the human side)', { dec: dec.who, inj: inj.who })
    }
    // ★ BELT AND BRACES: the conservative default must live in the DECLARATION, never in the tool body. If
    // `tools/human.js` carried its own `['office']`, section ⑥ below could still pass while the deployment's key was
    // ignored — so the source is checked for the literal it must not contain.
    const faceSrc = readFileSync(join(VMU, 'tools', 'human.js'), 'utf8')
    const codeOnly = faceSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    ok(!/\['office'\]/.test(codeOnly), 'the tool body does NOT hardcode the office role list (policy belongs in the declaration)', { hit: (codeOnly.match(/\[\s*'office'\s*\]/) || [])[0] })
    ok(codeOnly.includes(DECIDER_KEY) && codeOnly.includes(INJECT_KEY), 'the tool body READS both declared keys by name (the refusal and the grant come from the same declaration)', { decider: codeOnly.includes(DECIDER_KEY), inject: codeOnly.includes(INJECT_KEY) })
    // ★ A NAMED CODE THAT IS NOT REGISTERED IS A PRIVATE DIALECT. Both codes are REGISTERED in the contract's
    // error-code table (03-§8), which is what gate D14 enforces; pinning it here means a later edit cannot delete
    // the semantics row and still keep the code — the refusal a caller receives must be documented where they look.
    const contract = readFileSync(join(VMU, 'docs', '03-interface-contract.md'), 'utf8')
    const registryRow = (code) => new RegExp('^\\| [^|]*`' + code + '`[^|]*\\|', 'm').test(contract)
    ok(registryRow(DECIDER_CODE), '★ ' + DECIDER_CODE + ' is REGISTERED in 03-§8 (a named refusal must be documented where the caller looks — gate D14)', registryRow(DECIDER_CODE))
    ok(registryRow(INJECT_CODE), '★ ' + INJECT_CODE + ' is REGISTERED in 03-§8 (same reason: the inject authority is its own row)', registryRow(INJECT_CODE))
  }

  // ── ② EVERY SEAT IS REFUSED, BY NAME, WITH THE STATE LEFT ALONE ───────────────────────────────────────────
  console.log('=== 2. A SEAT MAY NOT DECIDE, WITHDRAW, VETO OR INJECT — and a refusal changes nothing ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const spec = b.spec
    ok(!!spec, 'the human face is registered by the real entry', !!spec)
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member'], ['r-tmp', 'temp']]) await k.members.hire({ id, slot })
    const call = async (args, exec) => JSON.parse(await spec.execute(args, exec || {}))
    const asSeat = (id) => ({ agent: { id } })
    const seatOf = { 'r-acad': 'chair', 'r-res': 'member', 'r-tmp': 'temp' }
    const snapshot = () => {
      const st = k.human.status()
      const q = k.human.queue()
      return { vetoes: st.vetoes, activeVetoes: st.activeVetoes, liftedVetoes: st.liftedVetoes, queuePending: q.pending, queueTotal: q.total }
    }

    for (const [id, slot] of [['r-res', 'member'], ['r-tmp', 'temp']]) {
      // — decide —
      const opened = await call({ action: 'openApproval', subject: 'members[2].hire' })
      const before = snapshot()
      const decided = await call({ action: 'decide', request_id: opened.id, allow: true, reason: 'seat self-service', by: slot }, asSeat(id))
      const afterDecide = snapshot()
      const stateAfter = await call({ action: 'approvalState', request_id: opened.id })
      ok(decided.ok === false, slot + ' may NOT decide an approval (a seat approving is the run-33 defect)', decided)
      ok(decided.code === DECIDER_CODE, slot + ' refusal is NAMED ' + DECIDER_CODE + ' (not a generic state error)', decided.code)
      ok(typeof decided.message === 'string' && decided.message.includes(slot) && decided.message.includes(id),
        slot + ' refusal speaks the CALLER\'s vocabulary (the role and the member id both appear in the message)', decided.message)
      ok(typeof decided.hint === 'string' && decided.hint.includes(DECIDER_KEY),
        slot + ' refusal hint names the DECLARED key ' + DECIDER_KEY + ' (so the reader knows what to change, and that it is not code)', decided.hint)
      ok(J(afterDecide) === J(before), slot + ' decide left the human table UNCHANGED (queue/veto counts identical)', { before, afterDecide })
      ok(stateAfter.state === 'pending', slot + ' decide did NOT flip the approval (state is still pending)', stateAfter)

      // — withdraw —
      const wdraw = await call({ action: 'withdraw', request_id: opened.id, reason: 'seat withdrawal', by: slot }, asSeat(id))
      const stateAfterW = await call({ action: 'approvalState', request_id: opened.id })
      ok(wdraw.ok === false && wdraw.code === DECIDER_CODE, slot + ' may NOT withdraw a request (same authority as deciding it)', wdraw)
      ok(stateAfterW.state === 'pending', slot + ' withdraw left the request pending', stateAfterW)

      // — veto —
      const beforeV = snapshot()
      const vetoed = await call({ action: 'veto', scope: 'institution', reason: 'seat veto' }, asSeat(id))
      const afterV = snapshot()
      ok(vetoed.ok === false && vetoed.code === DECIDER_CODE, slot + ' may NOT veto the institute (vetoing IS a human decision)', vetoed)
      ok(afterV.activeVetoes === beforeV.activeVetoes && afterV.vetoes === beforeV.vetoes,
        slot + ' veto was NOT queued (a refused veto that still lands is worse than no gate)', { before: beforeV, after: afterV })

      // — inject —
      const beforeU = k.mailbox.unread('r-acad').unread
      const injected = await call({ action: 'inject', text: 'seat speaking as the institute', to: 'r-acad', from: slot, via: 'mailbox' }, asSeat(id))
      const afterU = k.mailbox.unread('r-acad').unread
      ok(injected.ok === false && injected.code === INJECT_CODE, slot + ' may NOT inject into the running institute (the human voice is not a seat capability)', injected)
      ok(afterU === beforeU, slot + ' inject delivered NOTHING (mailbox unread count unchanged)', { before: beforeU, after: afterU })

      // — the spoof test: the seat fills `by` with the office's own name —
      const spoof = await call({ action: 'decide', request_id: opened.id, allow: true, reason: 'by=office', by: 'office' }, asSeat(id))
      ok(spoof.ok === false && spoof.code === DECIDER_CODE,
        slot + ' cannot dodge the gate by writing by:"office" (the CALLER is judged, not the argument it names)', spoof)

      // — and the reads must stay open: a gate that blinds the seats is an outage, not a policy —
      const status = await call({ action: 'status' }, asSeat(id))
      const queue = await call({ action: 'queue' }, asSeat(id))
      const state = await call({ action: 'approvalState', request_id: opened.id }, asSeat(id))
      ok(status.ok === true && queue.ok === true && state.ok === true,
        slot + ' can still READ the human surface (status/queue/approvalState stay open — reading is not deciding)', { status: status.ok, queue: queue.ok, state: state.ok })

      // tidy: let the office close the request it opened, so the next seat starts from a clean table
      await call({ action: 'withdraw', request_id: opened.id, reason: 'office cleanup', by: 'office' })
    }
    ok(seatOf['r-acad'] === 'chair', 'the chair is exercised in section 5 (its verb is self-approval, the sharpest case)', seatOf)
    await rm(roots[0], { recursive: true, force: true }).catch(() => {})
  }

  // ── ③ THE OFFICE STILL WORKS — the mirror question ────────────────────────────────────────────────────────
  console.log('=== 3. THE OFFICE (the human\'s own surface) may still do all four verbs ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || {}))
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member']]) await k.members.hire({ id, slot })

    const a1 = await call({ action: 'openApproval', subject: 'members[2].hire' })
    const decided = await call({ action: 'decide', request_id: a1.id, allow: true, reason: 'the human said yes', by: 'office' })
    const stateA1 = await call({ action: 'approvalState', request_id: a1.id })
    ok(decided.ok === true && decided.decision === 'allowed', 'office may DECIDE (the capability is still reachable from the caller that owns it)', decided)
    ok(stateA1.state === 'allowed', 'office decide really landed (state is allowed)', stateA1)

    const a2 = await call({ action: 'openApproval', subject: 'budget.increase' })
    const wd = await call({ action: 'withdraw', request_id: a2.id, reason: 'no longer needed', by: 'office' })
    const stateA2 = await call({ action: 'approvalState', request_id: a2.id })
    ok(wd.ok === true, 'office may WITHDRAW', wd)
    ok(stateA2.state === 'withdrawn', 'office withdraw really landed', stateA2)

    const before = k.human.status().activeVetoes
    const vetoed = await call({ action: 'veto', scope: 'institution', reason: 'the human objects', by: 'office' })
    ok(vetoed.ok === true && !!vetoed.veto && vetoed.veto.by === 'office', 'office may VETO', vetoed)
    ok(k.human.status().activeVetoes === before + 1, 'office veto really landed (active vetoes +1)', k.human.status().activeVetoes)

    const beforeU = k.mailbox.unread('r-res').unread
    const injected = await call({ action: 'inject', text: 'the human asks for a status', to: 'r-res', from: 'office' })
    ok(injected.ok === true, 'office may INJECT (the human\'s voice still reaches a running round)', injected)
    ok(k.mailbox.unread('r-res').unread === beforeU + 1, 'office inject really delivered one message', { before: beforeU, after: k.mailbox.unread('r-res').unread })
    await rm(roots[1], { recursive: true, force: true }).catch(() => {})
  }

  // ── ④ THE PRE-EXISTING ROLE GATE IS NOT REPLACED, IT IS KEPT ──────────────────────────────────────────────
  console.log('=== 4. vmu.human.vetoLiftRoles still governs liftVeto (the new gate must not swallow the old one) ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || {}))
    for (const [id, slot] of [['r-acad', 'chair']]) await k.members.hire({ id, slot })
    const vetoed = await call({ action: 'veto', scope: 'institution', reason: 'objection', by: 'office' })
    const vetoId = vetoed.veto.id
    const chairLift = await call({ action: 'liftVeto', veto_id: vetoId, reason: 'chair tries', by: 'chair' }, { agent: { id: 'r-acad' } })
    ok(chairLift.ok === false && chairLift.code === 'VMU_HUMAN_LIFT_ROLE',
      'chair may NOT lift a veto (the declared vmu.human.vetoLiftRoles still refuses, with its own code)', chairLift)
    ok(typeof chairLift.hint === 'string' && chairLift.hint.includes('vmu.human.vetoLiftRoles'),
      'the lift refusal still names its own key (two gates, two names — not one merged code)', chairLift.hint)
    const officeLift = await call({ action: 'liftVeto', veto_id: vetoId, reason: 'the human reconsiders', by: 'office' })
    ok(officeLift.ok === true && officeLift.liftedBy === 'office', 'office may lift a veto', officeLift)
    await rm(roots[2], { recursive: true, force: true }).catch(() => {})
  }

  // ── ⑤ THE SHARPEST CASE: THE CHAIR OPENS A REQUEST AND APPROVES IT ITSELF ────────────────────────────────
  console.log('=== 5. The chair cannot self-approve (asks, then decides its own request) ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || {}))
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member']]) await k.members.hire({ id, slot })
    const chair = { agent: { id: 'r-acad' } }
    const asked = await call({ action: 'openApproval', subject: 'meeting.debate on P-3' }, chair)
    ok(asked.ok === true, 'the chair MAY ASK (raising a request is the member-side of the approval flow — the office must be able to hear it)', asked)
    const selfApprove = await call({ action: 'decide', request_id: asked.id, allow: true, reason: 'I approve my own request', by: 'chair' }, chair)
    ok(selfApprove.ok === false && selfApprove.code === DECIDER_CODE,
      '★ the chair may NOT approve its own request (this IS the run-33 shape: 所办替院士做裁决)', selfApprove)
    const stillPending = await call({ action: 'approvalState', request_id: asked.id })
    ok(stillPending.state === 'pending', 'the self-approval attempt left the request pending (nothing was granted)', stillPending)
    const officeSays = await call({ action: 'decide', request_id: asked.id, allow: true, reason: 'the human agreed', by: 'office' })
    ok(officeSays.ok === true, 'the office can still approve the chair\'s request (the flow is slowed, not broken)', officeSays)
    await rm(roots[3], { recursive: true, force: true }).catch(() => {})
  }

  // ── ⑥ THE DECLARATION IS THE MECHANISM: change the key, change the gate ──────────────────────────────────
  console.log('=== 6. Re-pointing the declared keys moves the gate (policy is data, not code) ===')
  {
    const b = await boot({
      root: await freshRoot(),
      packs: ['v5r'],
      [DECIDER_KEY]: ['chair'],
      [INJECT_KEY]: ['member'],
    })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || {}))
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member'], ['r-tmp', 'temp']]) await k.members.hire({ id, slot })
    if (PROVE_LIVE) {
      const sv = k.settingsView()
      console.log('  live ' + DECIDER_KEY + ' = ' + J(sv.get(DECIDER_KEY)) + ' | ' + INJECT_KEY + ' = ' + J(sv.get(INJECT_KEY)))
    }
    ok(J(k.settingsView().get(DECIDER_KEY)) === J(['chair']), 'the deployed key really reaches the kernel view (a setting that never arrives is not a declaration)', k.settingsView().get(DECIDER_KEY))

    const a1 = await call({ action: 'openApproval', subject: 'gated.action' })
    const chairDecide = await call({ action: 'decide', request_id: a1.id, allow: true, reason: 'declared decider', by: 'chair' }, { agent: { id: 'r-acad' } })
    ok(chairDecide.ok === true,
      '★ with ' + DECIDER_KEY + '=["chair"] the CHAIR may decide (the same face, the same code: only the declaration changed)', chairDecide)
    const a2 = await call({ action: 'openApproval', subject: 'gated.action.2' })
    const memberDecide = await call({ action: 'decide', request_id: a2.id, allow: true, reason: 'not declared', by: 'member' }, { agent: { id: 'r-res' } })
    ok(memberDecide.ok === false && memberDecide.code === DECIDER_CODE,
      '…and the MEMBER is still refused under the same boot (the key is a list, not a switch that opens everything)', memberDecide)

    const memberInject = await call({ action: 'inject', text: 'a member relaying for the human', to: 'r-acad', from: 'office', via: 'mailbox' }, { agent: { id: 'r-res' } })
    ok(memberInject.ok === true, '★ with ' + INJECT_KEY + '=["member"] the MEMBER may inject (the two keys are independent authorities, as declared)', memberInject)
    const chairInject = await call({ action: 'inject', text: 'not declared for inject', to: 'r-acad', from: 'office', via: 'mailbox' }, { agent: { id: 'r-acad' } })
    ok(chairInject.ok === false && chairInject.code === INJECT_CODE,
      '…and the CHAIR is refused for inject because that key does not list it (decider and injector are not the same role)', chairInject)
    await rm(roots[4], { recursive: true, force: true }).catch(() => {})
  }
} finally {
  for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log('')
if (failures.length) {
  console.error('failures:')
  for (const f of failures) console.error('  - ' + f)
}
console.log('=== VMU RUN33 HUMAN GATE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
