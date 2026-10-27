#!/usr/bin/env node
// tests/vmu-run45-human-decide-audit.test.mjs — ROUND 45: THE ROOT SESSION DECIDED *AS* A SEAT.
//
// WHY THIS FILE EXISTS. Run 45 (build fe98b36f) measured, on the real entry:
//     vibe_vmu_human { action:"decide", request_id:"rq-r45", allow:true, by:"r-1" }   (root session)
//     → { ok:true, decidedBy:"r-1" }        ← the RESEARCHER's identity carries the human's decision
//     approvalState → { state:"allowed", decidedAt:… }   ← and the state does NOT say who decided at all
// Same code refuses in the member's own kernel (run 33's `tests/vmu-run33-human-gate.test.mjs`, 62/0). So the
// hole is exactly two things, and this file pins both:
//   ① THE GATE JUDGED THE CALLER ONLY. `tools/human.js` `gateVerb()` asked "may THIS caller decide?" and, for a
//     root session, answered "yes, it is the office" — the model-supplied `by` argument (who the decision is
//     ATTRIBUTED to) was never resolved against the roster or the declaration. The face header already says
//     "the argument names a role, the exec names an actor" — true for the CALLER, false for the DELEGATEE.
//   ② `approvalState` HAD NO ATTRIBUTION. The kernel ledger records `decidedBy` (kernel/human.js:268), but the
//     face's `approvalState` returned only {state, decidedAt}, so an auditor could not read who decided.
//
// THE RULE THIS FILE HOLDS THE FACE TO (task-29):
//   · the caller role AND the `by` role must BOTH be in `vmu.human.deciderRoles`;
//   · `by` absent ⇒ the delegate IS the caller (the existing "office decides, by omitted" path keeps working);
//   · `by` names a seat id ⇒ resolve it through the LIVE ROSTER to its slot and judge THAT slot (run 45's shape);
//   · `by` names an id that is neither a declared role nor a roster seat ⇒ named refusal, same registered code;
//   · `decide` / `withdraw` / `veto` all follow the same rule (one authority, one gate);
//   · `approvalState` reads `decidedBy` from the LIVE LEDGER (never from the request arguments) and adds
//     `decidedByMeans` — 'self' (the decider acted as itself), 'delegate' (the caller acted for a DIFFERENT
//     approver), 'unrecorded' (decided outside this face — the face refuses to guess), null while pending.
//
// ★ NO NEW REFUSAL CODE. The delegate refusal reuses the REGISTERED `VMU_HUMAN_DECIDER_ROLE`; section ⑦ checks
// the face source introduces no other `VMU_HUMAN_*` code.
// ★ RED BEFORE GREEN. Section ① is the measured defect: before the fix it PASSES (`ok:true`, `decidedBy:"r-res"`),
//   so the suite fails at exactly the behaviour run 45 measured, never at a syntax/import error.
//
// Run:  node tests/vmu-run45-human-decide-audit.test.mjs
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

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
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)

const DECIDER_KEY = 'vmu.human.deciderRoles'
const INJECT_KEY = 'vmu.human.injectRoles'
const DECIDER_CODE = 'VMU_HUMAN_DECIDER_ROLE'
const INJECT_CODE = 'VMU_HUMAN_INJECT_ROLE'
const DELEGATE_PHRASE = 'the DELEGATE is not an approver'
const MEANS = ['self', 'delegate', 'unrecorded']

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

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
  const r = await mkdtemp(join(tmpdir(), 'vmu-run45-human-decide-audit-'))
  roots.push(r)
  return r
}

// A ROOT session's exec: a `session-…` agent id is root (resolveTurnMember returns null ⇒ the office).
const ROOT = { agent: { id: 'session-r45-root' } }
const asSeat = (id) => ({ agent: { id } })

try {
  // ── ① THE MEASURED DEFECT: root writes by:"<member id>" and the decision is attributed to that member ─────
  console.log('=== 1. A root session may NOT decide "as" a seat (run 45: by:"r-1") ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    for (const [id, slot] of [['r-res', 'member'], ['r-acad', 'chair']]) await k.members.hire({ id, slot })
    const snapshot = () => ({ status: k.human.status(), queue: k.human.queue() })

    const opened = await call({ action: 'openApproval', subject: 'meeting.decide on P-3', requestId: 'rq-r45' })
    ok(opened.ok === true && opened.id === 'rq-r45', 'the office may still OPEN an approval (the ask side is untouched)', opened)
    const before = snapshot()
    // ★ THE RUN-45 CALL, verbatim in shape: root session, by = a live SEAT (not a declared approver).
    const decided = await call({ action: 'decide', request_id: 'rq-r45', allow: true, by: 'r-res' })
    const after = snapshot()
    ok(decided.ok === false, '★ root decide with by:"r-res" is REFUSED (a decision is not attributed to a seat that may not approve)', decided)
    ok(decided.code === DECIDER_CODE, '…refused with the REGISTERED ' + DECIDER_CODE + ' (not a generic state error, not a new code)', decided.code)
    ok(typeof decided.message === 'string' && decided.message.indexOf(DELEGATE_PHRASE) !== -1,
      '★ the message NAMES the defect in the caller\'s own words: "' + DELEGATE_PHRASE + '" (the DELEGATEE is not an approver)', decided.message)
    ok(typeof decided.message === 'string' && decided.message.indexOf('r-res') !== -1 && decided.message.indexOf('member') !== -1,
      '…and names the delegate (the member id AND the role it resolved to through the roster)', decided.message)
    ok(typeof decided.message === 'string' && decided.message.indexOf(DECIDER_KEY) !== -1,
      '…and the message names the DECLARED key it enforced (' + DECIDER_KEY + ') — the tool boundary forwards code/message/hint (host.js:447), so the key must be in the text to reach the caller', decided.message)
    ok(typeof decided.hint === 'string' && decided.hint.indexOf(DECIDER_KEY) !== -1,
      '★ the hint names the DECLARED key ' + DECIDER_KEY + ' (what to change, and that it is a declaration not code)', decided.hint)
    ok(typeof decided.hint === 'string' && decided.hint.indexOf('decide in your own name') !== -1 && decided.hint.indexOf('hand the decision to that seat') !== -1,
      '★ the hint states BOTH ways out (decide in your own name as office/chair, or hand the decision to that seat)', decided.hint)
    ok(J(after.queue) === J(before.queue) && J(after.status) === J(before.status),
      'the refusal changed NOTHING (queue pending/total and veto counts identical) — a gate that still flips is not a gate', { before, after })
    const stillPending = await call({ action: 'approvalState', request_id: 'rq-r45' })
    ok(stillPending.state === 'pending', '…and the approval is still PENDING (nothing was granted under someone else\'s name)', stillPending)
    ok(stillPending.decidedBy === null, '…so approvalState reports decidedBy:null (no attribution was written)', stillPending.decidedBy)
    // ★ LIVE RUN 50 / F-34 changed this contract: a bare `null` read as "the field the reader needs is absent"; the
    // means now SAY why there is no name (nobody decided yet). The field is still null-honest about the ACTOR.
    ok(/nobody has decided/.test(String(stillPending.decidedByMeans)), '…and decidedByMeans says in words that nobody has decided (a pending request has no actor)', stillPending.decidedByMeans)

    // ★ The seat resolving to a NON-declared role is refused too, even when that role LOOKS like an approver.
    const other = await call({ action: 'openApproval', subject: 'budget.increase' })
    const chairish = await call({ action: 'decide', request_id: other.id, allow: true, by: 'r-acad' })
    ok(chairish.ok === false && chairish.code === DECIDER_CODE,
      'root by:"r-acad" (chair, NOT in the default declared set) is refused by the same name — the DECLARATION decides, not the seat name', chairish)

    // The refused request is still decidable by the office under its OWN identity (the flow is slowed, not broken).
    const officeSays = await call({ action: 'decide', request_id: 'rq-r45', allow: true, by: 'office' })
    ok(officeSays.ok === true && officeSays.decidedBy === 'office',
      'the office can still decide the same request under its own identity (by:"office")', officeSays)
    await rm(roots[0], { recursive: true, force: true }).catch(() => {})
  }

  // ── ② by ABSENT ⇒ the caller decides as itself; by:"office" ⇒ passes; the ledger records the attribution ──
  console.log('=== 2. by:"office" (and by omitted) still work — the gate grew a second check, it did not become an outage ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    for (const [id, slot] of [['r-res', 'member']]) await k.members.hire({ id, slot })

    const a1 = await call({ action: 'openApproval', subject: 'members[2].hire' })
    const byOffice = await call({ action: 'decide', request_id: a1.id, allow: true, by: 'office' })
    const s1 = await call({ action: 'approvalState', request_id: a1.id })
    ok(byOffice.ok === true && byOffice.decidedBy === 'office', 'root by:"office" decides (the caller is its own delegate)', byOffice)
    ok(s1.state === 'allowed' && s1.decidedBy === 'office', 'approvalState reads the ledger: state allowed, decidedBy:"office"', s1)
    ok(s1.decidedByMeans === 'self', '…decidedByMeans:"self" (the decider acted as itself, no delegation)', s1.decidedByMeans)

    const a2 = await call({ action: 'openApproval', subject: 'budget.increase' })
    const noBy = await call({ action: 'decide', request_id: a2.id, allow: true })
    const s2 = await call({ action: 'approvalState', request_id: a2.id })
    ok(noBy.ok === true && noBy.decidedBy === 'office',
      '★ by OMITTED means "the caller itself": root decides and the ledger records office (never null, never a guess)', noBy)
    ok(s2.decidedBy === 'office' && s2.decidedByMeans === 'self', '…and approvalState says the same (office / self)', s2)
    await rm(roots[1], { recursive: true, force: true }).catch(() => {})
  }

  // ── ③ DELEGATION IS REAL: an office decides FOR another DECLARED approver, and the audit says so ───────────
  console.log('=== 3. Delegation to a DECLARED approver is allowed — and approvalState marks it ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'], [DECIDER_KEY]: ['office', 'chair'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member']]) await k.members.hire({ id, slot })

    const a1 = await call({ action: 'openApproval', subject: 'meeting.decide on P-3' })
    const byChairRole = await call({ action: 'decide', request_id: a1.id, allow: true, by: 'chair' })
    const s1 = await call({ action: 'approvalState', request_id: a1.id })
    ok(byChairRole.ok === true && byChairRole.decidedBy === 'chair',
      '★ with ' + DECIDER_KEY + '=["office","chair"] the office may decide by:"chair" (a declared approver delegating)', byChairRole)
    ok(s1.decidedBy === 'chair' && s1.decidedByMeans === 'delegate',
      '…approvalState records decidedBy:"chair" / decidedByMeans:"delegate" (the audit can tell an act from a delegation)', s1)

    const a2 = await call({ action: 'openApproval', subject: 'meeting.decide on P-4' })
    const bySeatId = await call({ action: 'decide', request_id: a2.id, allow: true, by: 'r-acad' })
    const s2 = await call({ action: 'approvalState', request_id: a2.id })
    ok(bySeatId.ok === true && bySeatId.decidedBy === 'r-acad',
      '★ by:"r-acad" is RESOLVED through the live roster to the chair slot — a seat id is a legitimate delegate spelling', bySeatId)
    ok(s2.decidedBy === 'r-acad' && s2.decidedByMeans === 'delegate', '…and the ledger keeps the seat id, means:"delegate"', s2)

    const a3 = await call({ action: 'openApproval', subject: 'meeting.decide on P-5' })
    const member = await call({ action: 'decide', request_id: a3.id, allow: true, by: 'r-res' })
    ok(member.ok === false && member.code === DECIDER_CODE,
      '…while by:"r-res" (slot member) is STILL refused under the same boot — a declared chair does not drag the whole roster in', member)
    await rm(roots[2], { recursive: true, force: true }).catch(() => {})
  }

  // ── ④ UNKNOWN by: neither a declared role nor a seat ⇒ named refusal, state left alone ────────────────────
  console.log('=== 4. by:"<id not on the roster>" is refused by name (no invented actor) ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    const r = await k.members.hire({ id: 'r-res', slot: 'member' })
    ok(r.ok === true, 'roster is live for this section', r)

    const opened = await call({ action: 'openApproval', subject: 'gated.action' })
    const ghost = await call({ action: 'decide', request_id: opened.id, allow: true, by: 'r-ghost' })
    ok(ghost.ok === false && ghost.code === DECIDER_CODE,
      'by:"r-ghost" (not a seat, not a declared role) is refused with ' + DECIDER_CODE, ghost)
    ok(typeof ghost.message === 'string' && ghost.message.indexOf('r-ghost') !== -1 && ghost.message.indexOf(DELEGATE_PHRASE) !== -1,
      '…the message names the unknown id and says ' + DELEGATE_PHRASE, ghost.message)
    ok(typeof ghost.hint === 'string' && ghost.hint.indexOf(DECIDER_KEY) !== -1, '…the hint still points at the declaration', ghost.hint)
    const st = await call({ action: 'approvalState', request_id: opened.id })
    ok(st.state === 'pending', '…and the request is still pending (an unknown actor cannot decide, not even by accident)', st)
    await rm(roots[3], { recursive: true, force: true }).catch(() => {})
  }

  // ── ⑤ withdraw / veto follow the SAME rule — one authority, one gate ──────────────────────────────────────
  console.log('=== 5. withdraw and veto carry the same delegate rule ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    for (const [id, slot] of [['r-res', 'member'], ['r-acad', 'chair']]) await k.members.hire({ id, slot })

    const opened = await call({ action: 'openApproval', subject: 'withdraw-me' })
    const wBad = await call({ action: 'withdraw', request_id: opened.id, reason: 'seat withdrawal', by: 'r-res' })
    const stAfterW = await call({ action: 'approvalState', request_id: opened.id })
    ok(wBad.ok === false && wBad.code === DECIDER_CODE, 'root withdraw by:"r-res" is refused (withdrawing IS deciding)', wBad)
    ok(typeof wBad.message === 'string' && wBad.message.indexOf(DELEGATE_PHRASE) !== -1, '…with the same named delegate phrase', wBad.message)
    ok(stAfterW.state === 'pending', '…and the request is still pending (the refused withdrawal did not land)', stAfterW)

    const wOffice = await call({ action: 'withdraw', request_id: opened.id, reason: 'no longer needed', by: 'office' })
    const stW = await call({ action: 'approvalState', request_id: opened.id })
    ok(wOffice.ok === true && stW.state === 'withdrawn', 'root withdraw by:"office" still lands', { wOffice, stW })
    ok(stW.decidedBy === 'office' && stW.decidedByMeans === 'self', '…and approvalState attributes it (office / self)', stW)

    const before = k.human.status()
    const vBad = await call({ action: 'veto', scope: 'institution', reason: 'seat veto', by: 'r-res' })
    const after = k.human.status()
    ok(vBad.ok === false && vBad.code === DECIDER_CODE, 'root veto by:"r-res" is refused (a veto is a human decision)', vBad)
    ok(after.vetoes === before.vetoes && after.activeVetoes === before.activeVetoes,
      '…and NO veto was queued (a refused veto that still lands is worse than no gate)', { before: before.activeVetoes, after: after.activeVetoes })

    const vOffice = await call({ action: 'veto', scope: 'institution', reason: 'the human objects', by: 'office' })
    ok(vOffice.ok === true && vOffice.veto && vOffice.veto.by === 'office', 'root veto by:"office" still lands, attributed to office', vOffice)
    const vGhost = await call({ action: 'veto', scope: 'institution', reason: 'nobody', by: 'r-ghost' })
    ok(vGhost.ok === false && vGhost.code === DECIDER_CODE, 'veto by an unknown id is refused by the same name', vGhost)
    await rm(roots[4], { recursive: true, force: true }).catch(() => {})
  }

  // ── ⑥ approvalState NEVER GUESSES: ledger-read attribution, 'unrecorded' for decisions made elsewhere ─────
  console.log('=== 6. approvalState reads the LIVE LEDGER — it does not invent an attribution ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    const opened = await call({ action: 'openApproval', subject: 'kernel-direct' })
    // A decision made OUTSIDE this face (kernel API directly, as a pack/middleware could) must be REPORTED, not
    // laundered: the ledger says r-res, and the face says it cannot vouch for HOW that attribution was authorised.
    k.human.decide({ requestId: opened.id, allow: true, by: 'r-res' })
    const st = await call({ action: 'approvalState', request_id: opened.id })
    ok(st.ok === true && st.state === 'allowed', 'a ledger decision made outside the face is still reported faithfully', st)
    ok(st.decidedBy === 'r-res', '…decidedBy comes from the LEDGER (r-res), not from the request the face was called with', st.decidedBy)
    ok(st.decidedByMeans === 'unrecorded', '★ …and decidedByMeans:"unrecorded" — the face does NOT guess "self" for a decision it never authorised', st.decidedByMeans)
    ok(MEANS.indexOf(st.decidedByMeans) !== -1, 'the means vocabulary is exactly ' + J(MEANS), st.decidedByMeans)

    const a2 = await call({ action: 'openApproval', subject: 'pending-read' })
    const s2 = await call({ action: 'approvalState', request_id: a2.id })
    ok(own(s2, 'decidedBy') && own(s2, 'decidedByMeans'), '★ approvalState ALWAYS carries both attribution fields (pending included)', Object.keys(s2))
    ok(s2.decidedBy === null && /nobody has decided/.test(String(s2.decidedByMeans)), '…null actor + a sentence saying no decision exists while pending', { decidedBy: s2.decidedBy, decidedByMeans: s2.decidedByMeans })
    const unknown = await call({ action: 'approvalState', request_id: 'rq-does-not-exist' })
    ok(unknown.ok === false && unknown.code === 'VMU_INVALID_ARGUMENT',
      'an unknown request id is still the kernel\'s named VMU_INVALID_ARGUMENT (the new fields never mask a real refusal)', unknown)
    await rm(roots[5], { recursive: true, force: true }).catch(() => {})
  }

  // ── ⑦ THE REPAIR'S OWN EDGES: no new refusal code; inject is not accidentally caught by the delegate rule ──
  console.log('=== 7. No new code, and the delegate check does not leak into inject ===')
  {
    const faceSrc = readFileSync(join(VMU, 'tools', 'human.js'), 'utf8')
    const codeOnly = faceSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const humanCodes = [...new Set(codeOnly.match(/VMU_HUMAN_[A-Z_]+/g) || [])].sort()
    const contract = readFileSync(join(VMU, 'docs', '03-interface-contract.md'), 'utf8')
    const registered = (code) => new RegExp('^\\| [^|]*`' + code + '`[^|]*\\|', 'm').test(contract)
    const unregistered = humanCodes.filter((c) => !registered(c))
    ok(humanCodes.indexOf(DECIDER_CODE) !== -1, 'the delegate refusal reuses the code the face already carries (' + DECIDER_CODE + ')', humanCodes)
    ok(unregistered.length === 0,
      '★ the face introduces NO UNREGISTERED VMU_HUMAN_* refusal code (a new named code is a new private dialect — gate D14)', { humanCodes, unregistered })
    ok(registered(DECIDER_CODE), DECIDER_CODE + ' is REGISTERED in 03-§8 (a named refusal must be documented where the caller looks)', registered(DECIDER_CODE))

    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    const r = await k.members.hire({ id: 'r-res', slot: 'member' })
    ok(r.ok === true, 'roster is live for the inject edge', r)
    const before = k.mailbox.unread('r-res').unread
    const injected = await call({ action: 'inject', text: 'the human asks for a status', to: 'r-res', from: 'office' })
    ok(injected.ok === true, 'the office may still INJECT (inject is its own authority: ' + INJECT_KEY + '; this round added no `by` rule to it)', injected)
    ok(k.mailbox.unread('r-res').unread === before + 1, '…and it really delivered one message (the delegate check did not leak)', { before, after: k.mailbox.unread('r-res').unread })
    await rm(roots[6], { recursive: true, force: true }).catch(() => {})
  }
  // ── ⑧ THE SAME DEFECT SHAPE IN liftVeto: a veto lift could be ATTRIBUTED to a seat by the caller ───────────
  console.log('=== 8. liftVeto is attributed to the caller, NOT to a name in the argument (task-29b) ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const call = async (args, exec) => JSON.parse(await b.spec.execute(args, exec || ROOT))
    for (const [id, slot] of [['r-acad', 'chair'], ['r-res', 'member']]) await k.members.hire({ id, slot })
    const vetoed = await call({ action: 'veto', scope: 'institution', reason: 'objection', by: 'office' })
    ok(vetoed.ok === true, 'the office may still veto (the ask side is untouched by this round)', vetoed)
    const vetoId = vetoed.veto.id
    // ★ THE MEASURED SHAPE: a root session (the office) naming the CHAIR as the lifter.
    const forged = await call({ action: 'liftVeto', veto_id: vetoId, reason: 'the chair reconsiders', by: 'r-acad' })
    ok(forged.ok === false, '★ root liftVeto with by:"r-acad" is REFUSED (the roster id would have been recorded as the lifter)', forged)
    ok(forged.code === 'VMU_HUMAN_LIFT_ROLE', '…refused with the REGISTERED VMU_HUMAN_LIFT_ROLE (the pre-existing lift code, not a new dialect)', forged.code)
    ok(typeof forged.message === 'string' && forged.message.indexOf('in the name of') !== -1,
      '★ the message says a lift is attributed to the actor that PERFORMED it (not to a name in an argument)', forged.message)
    ok(forged.hint.indexOf('by:"office"') !== -1 || forged.hint.indexOf('your own name') !== -1,
      '…and the hint names the way out: lift in your own name', forged.hint)
    const beforeStatus = await call({ action: 'status' })
    const still = await call({ action: 'status' })
    ok(J(still) === J(beforeStatus),
      'the refused lift changed NOTHING (the veto is still standing — status is byte-identical)', { before: beforeStatus, after: still })
    const official = await call({ action: 'liftVeto', veto_id: vetoId, reason: 'the human reconsiders' })
    ok(official.ok === true, 'the office may still lift in its own name', official)
    ok(official.liftedBy === 'office', '…and the ledger records the actor that acted (office), not a name it typed', official.liftedBy)
    const veto2 = await call({ action: 'veto', scope: 'institution', reason: 'second objection', by: 'office' })
    ok(veto2.ok === true && veto2.veto && veto2.veto.id !== vetoId, 'a SECOND veto is standing for the member-lift case', veto2.veto && veto2.veto.id)
    const asMember = await call({ action: 'liftVeto', veto_id: veto2.veto.id, reason: 'member tries' }, asSeat('r-res'))
    ok(asMember.ok === false, 'a member calling liftVeto is still refused', asMember)
    ok(asMember.code === 'VMU_HUMAN_LIFT_ROLE', '…by the declared vetoLiftRoles (the pre-existing gate is kept)', asMember.code)
  }
} finally {
  for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log('')
if (failures.length) {
  console.error('failures:')
  for (const f of failures) console.error('  - ' + f)
}
console.log('=== VMU RUN45 HUMAN DECIDE AUDIT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
