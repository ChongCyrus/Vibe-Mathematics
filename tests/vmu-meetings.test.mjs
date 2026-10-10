#!/usr/bin/env node
// vmu MEETINGS — the guard for kernel/meetings.js (the 47 `vmu.meetings.*` knobs).
//
// WHAT THIS PROVES: for EVERY wired key at least one POSITIVE and one NEGATIVE assertion — i.e. the key
// changes an observable result (no "read the key, change nothing" ✗). Plus: `enforced[]` names only the keys
// that actually fired, WIRED ↔ plannedKeys are complementary (47 = 47 + 0, no overlap), refusals are counted
// BY CODE, the clock is injected, zero mechanism does not crash, and read paths never mutate.
import { createMeetings, WIRED_KEYS, UNWIRED_REASONS } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

let NOW = 1000
const mk = (settings = {}, seams = {}) => {
  NOW = 1000
  const t = createMeetings(Object.assign({ clock: () => NOW, settings }, seams))
  return { t, set: (v) => { NOW = v }, at: () => NOW }
}
const roster = ['acad', 'r-1', 'r-2', 'r-3']
const opened = (settings = {}, seams = {}, opts = {}) => {
  const h = mk(settings, seams)
  const r = h.t.open(Object.assign({ type: 'ordinary', chair: 'acad', roster }, opts))
  return { h, id: r.meeting }
}
const err = (fn) => errOf(fn)

// ── 1–3 open-level keys ─────────────────────────────────────────────────────────────────────────────
{
  const cat = mk({ 'vmu.meetings.typeCatalog': ['ordinary', 'committee'] })
  ok(err(() => cat.t.open({ type: 'ordinary', roster })) === null, 'typeCatalog[+]: a catalogued type opens')
  ok(codeOf(() => cat.t.open({ type: 'secret', roster })) === 'VMU_NO_SUCH_OBJECT', 'typeCatalog[-]: an uncatalogued type is refused')
  const mode = opened({ 'vmu.meetings.attendanceMode': 'quorum-only' })
  ok(mode.h.t.quorum({ meeting: mode.id }).mode === 'quorum-only', 'attendanceMode[+]: the mode is visible in the quorum view')
  ok(mk({}).t.open({ type: 'ordinary', roster }).quorum.mode === 'roster', 'attendanceMode[-]: the default mode is roster')
  const cap1 = mk({ 'vmu.meetings.liveCap': 1 })
  cap1.t.open({ roster })
  const e1 = err(() => cap1.t.open({ roster }))
  ok(e1 && e1.code === 'VMU_QUOTA_EXCEEDED' && /现值=1/.test(String(e1.hint)) && /上限=1/.test(String(e1.hint)),
    'liveCap[-]: over the live cap is refused with 现值/上限', e1 && e1.hint)
  const cap3 = mk({ 'vmu.meetings.liveCap': 3 })
  cap3.t.open({ roster })
  ok(err(() => cap3.t.open({ roster })) === null, 'liveCap[+]: under the cap is allowed')
}

// ── 4–10 quorum / attendance ────────────────────────────────────────────────────────────────────────
{
  const min = opened({ 'vmu.meetings.quorumMin': 3 })
  const e1 = err(() => min.h.t.vote({ meeting: min.id, member: 'r-1', value: 1 }))
  ok(e1 && e1.code === 'VMU_MEETING_QUORUM_LOST' && /需要=3/.test(String(e1.hint)), 'quorumMin[-]: below the minimum is refused with 现值/需要', e1 && e1.hint)
  const min1 = opened({ 'vmu.meetings.quorumMin': 1 })
  ok(err(() => min1.h.t.vote({ meeting: min1.id, member: 'r-1', value: 1 })) === null, 'quorumMin[+]: above the minimum votes pass')
  const ratio = opened({ 'vmu.meetings.quorumRatio': 1 })
  ok(codeOf(() => ratio.h.t.vote({ meeting: ratio.id, member: 'r-1' })) === 'VMU_MEETING_QUORUM_LOST', 'quorumRatio[-]: a 100% ratio refuses an incomplete house')
  const ratio0 = opened({ 'vmu.meetings.quorumRatio': 0 })
  ok(err(() => ratio0.h.t.vote({ meeting: ratio0.id, member: 'r-1' })) === null, 'quorumRatio[+]: a 0 ratio permits the vote')
  const susp = opened({ 'vmu.meetings.quorumMin': 2, 'vmu.meetings.quorumLossPolicy': 'suspend' })
  susp.h.t.attend({ meeting: susp.id, member: 'r-1' })
  const sl = susp.h.t.leave({ meeting: susp.id, member: 'r-1' })
  ok(sl.quorumLost === true && sl.policy === 'suspend', 'quorumLossPolicy[-]: "suspend" marks the loss and names the policy on the receipt', JSON.stringify({ lost: sl.quorumLost, policy: sl.policy }))
  const e2 = err(() => susp.h.t.vote({ meeting: susp.id, member: 'acad' }))
  ok(e2 && /quorumLossPolicy/.test(String(e2.hint)), 'quorumLossPolicy[-]: the suspended vote refusal names the key', e2 && e2.hint)
  const cont = opened({ 'vmu.meetings.quorumMin': 2, 'vmu.meetings.quorumLossPolicy': 'continue' })
  cont.h.t.attend({ meeting: cont.id, member: 'r-1' })
  const cl = cont.h.t.leave({ meeting: cont.id, member: 'r-1' })
  ok(cl.quorumLost === true && cl.policy === null, 'quorumLossPolicy[+]: "continue" records the loss but changes no state', JSON.stringify({ lost: cl.quorumLost, policy: cl.policy }))
  ok(/quorumMin/.test(String(err(() => cont.h.t.vote({ meeting: cont.id, member: 'acad' })).hint)),
    'quorumLossPolicy[+]: the refusal then names the quorum keys (not the policy)')
  const recount = opened({ 'vmu.meetings.quorumMin': 3, 'vmu.meetings.quorumRecountMs': 5000 })
  const e3 = err(() => recount.h.t.vote({ meeting: recount.id, member: 'r-1' }))
  ok(/next recount is in 5000ms/.test(String(e3.message)), 'quorumRecountMs[-]: the refusal tells when the recount happens', e3 && e3.message)
  const noRecount = opened({ 'vmu.meetings.quorumMin': 3 })
  ok(!/recount/.test(String(err(() => noRecount.h.t.vote({ meeting: noRecount.id, member: 'r-1' })).message)), 'quorumRecountMs[+]: with 0 there is no recount message')
  const denom = opened({ 'vmu.meetings.unansweredInDenominator': true })
  const q = denom.h.t.quorum({ meeting: denom.id })
  ok(q.denominator === 4 && /all-roster/.test(q.denominatorPolicy), 'unansweredInDenominator[+]: unanswered members stay in the denominator', JSON.stringify({ d: q.denominator, p: q.denominatorPolicy }))
  const denomNo = opened({})
  ok(denomNo.h.t.quorum({ meeting: denomNo.id }).denominator === 1 && /present-only/.test(denomNo.h.t.quorum({ meeting: denomNo.id }).denominatorPolicy),
    'unansweredInDenominator[-]: with the key off the denominator is the present set')
  const emq = opened({ 'vmu.meetings.emergencyQuorumRatio': 1, 'vmu.meetings.emergencyKinds': ['emergency'] })
  ok(emq.h.t.motion({ meeting: emq.id, member: 'acad', kind: 'emergency' }).quorumRequired === 4,
    'emergencyQuorumRatio[+]: an emergency motion needs the emergency ratio (4/4)')
  const emq0 = opened({ 'vmu.meetings.emergencyKinds': ['emergency'] })
  ok(emq0.h.t.motion({ meeting: emq0.id, member: 'acad', kind: 'emergency' }).quorumRequired === 0,
    'emergencyQuorumRatio[-]: with ratio 0 the emergency requirement stays at the normal quorum')
  const ek = opened({ 'vmu.meetings.emergencyKinds': ['emergency'] })
  ok(err(() => ek.h.t.motion({ meeting: ek.id, member: 'acad', kind: 'emergency' })) === null, 'emergencyKinds[+]: an allowed emergency kind passes')
  const ekNo = opened({})
  ok(codeOf(() => ekNo.h.t.motion({ meeting: ekNo.id, member: 'acad', kind: 'emergency' })) === 'VMU_MEETING_EMERGENCY_NOT_ALLOWED',
    'emergencyKinds[-]: with an empty whitelist the emergency kind is refused')
}

// ── 11–14 chair / committee ─────────────────────────────────────────────────────────────────────────
{
  const neutral = opened({ 'vmu.meetings.chairNeutral': true })
  neutral.h.t.attend({ meeting: neutral.id, member: 'r-1' })
  neutral.h.t.motion({ meeting: neutral.id, member: 'r-1' })
  neutral.h.t.vote({ meeting: neutral.id, member: 'r-1', motion: 'mo1', value: 1 })
  const e1 = err(() => neutral.h.t.vote({ meeting: neutral.id, member: 'acad', motion: 'mo1', value: 1 }))
  ok(e1 && e1.code === 'VMU_NOT_PERMITTED' && /chairNeutral/.test(String(e1.hint)), 'chairNeutral[-]: the chair cannot vote when not tied', e1 && e1.hint)
  neutral.h.t.vote({ meeting: neutral.id, member: 'r-2', motion: 'mo1', value: 0 })
  ok(err(() => neutral.h.t.vote({ meeting: neutral.id, member: 'acad', motion: 'mo1', value: 1 })) === null,
    'chairNeutral[+]: the chair CAN vote to break a 1:1 tie')
  const free = opened({})
  ok(err(() => free.h.t.vote({ meeting: free.id, member: 'acad', value: 1 })) === null, 'chairNeutral default: the chair votes freely')
  const audit = opened({ 'vmu.meetings.chairTransferAudit': true })
  ok(codeOf(() => audit.h.t.transferChair({ meeting: audit.id, to: 'r-1' })) === 'VMU_REASON_REQUIRED', 'chairTransferAudit[-]: a transfer without a reason is refused')
  ok(err(() => audit.h.t.transferChair({ meeting: audit.id, to: 'r-1', reason: 'handover' })) === null, 'chairTransferAudit[+]: with a reason the transfer succeeds')
  const cmax = mk({ 'vmu.meetings.committeeMax': 5 })
  ok(codeOf(() => cmax.t.open({ type: 'committee', roster, size: 10 })) === 'VMU_QUOTA_EXCEEDED', 'committeeMax[-]: an oversized committee is refused')
  ok(err(() => cmax.t.open({ type: 'committee', roster, size: 3 })) === null, 'committeeMax[+]: a committee within the cap opens')
  const rep = opened({ 'vmu.meetings.committeeReportRequired': true }, {}, { type: 'committee' })
  ok(codeOf(() => rep.h.t.close({ meeting: rep.id })) === 'VMU_STATE', 'committeeReportRequired[-]: closing without a report is refused')
  ok(err(() => rep.h.t.close({ meeting: rep.id, report: 'acknowledgement' })) === null, 'committeeReportRequired[+]: with a report the committee closes')
}

// ── 15–18 budget ────────────────────────────────────────────────────────────────────────────────────
{
  const bt = opened({ 'vmu.meetings.budgetTurns': 1 })
  bt.h.t.speak({ meeting: bt.id, member: 'acad' })
  const e1 = err(() => bt.h.t.speak({ meeting: bt.id, member: 'acad' }))
  ok(e1 && e1.code === 'VMU_RESOURCE_BUDGET' && /现值=2/.test(String(e1.hint)) && /上限=1/.test(String(e1.hint)), 'budgetTurns[-]: over the turn budget is refused with 现值/上限', e1 && e1.hint)
  const bt5 = opened({ 'vmu.meetings.budgetTurns': 5 })
  bt5.h.t.speak({ meeting: bt5.id, member: 'acad' })
  ok(err(() => bt5.h.t.speak({ meeting: bt5.id, member: 'acad' })) === null, 'budgetTurns[+]: within the turn budget speeches pass')
  const tk = opened({ 'vmu.meetings.budgetTokens': 10 })
  ok(codeOf(() => tk.h.t.speak({ meeting: tk.id, member: 'acad', tokens: 20 })) === 'VMU_RESOURCE_BUDGET', 'budgetTokens[-]: over the token budget is refused')
  const tk100 = opened({ 'vmu.meetings.budgetTokens': 100 })
  ok(err(() => tk100.h.t.speak({ meeting: tk100.id, member: 'acad', tokens: 20 })) === null, 'budgetTokens[+]: within the token budget passes')
  const wall = opened({ 'vmu.meetings.budgetWallMs': 100 })
  wall.h.set(1500)
  ok(codeOf(() => wall.h.t.speak({ meeting: wall.id, member: 'acad' })) === 'VMU_RESOURCE_BUDGET', 'budgetWallMs[-]: over the wall budget is refused')
  const wallBig = opened({ 'vmu.meetings.budgetWallMs': 100000 })
  wallBig.h.set(1500)
  ok(err(() => wallBig.h.t.speak({ meeting: wallBig.id, member: 'acad' })) === null, 'budgetWallMs[+]: within the wall budget passes')
  const warn = opened({ 'vmu.meetings.budgetTurns': 1, 'vmu.meetings.budgetOnExceed': 'warn' })
  warn.h.t.speak({ meeting: warn.id, member: 'acad' })
  const wr = warn.h.t.speak({ meeting: warn.id, member: 'acad' })
  ok(wr.budget && wr.budget.code === 'VMU_QUOTA_SOFT_EXCEEDED' && warn.h.t.status().counters.softBudget >= 1,
    'budgetOnExceed[+]: "warn" records the soft breach instead of refusing', JSON.stringify(wr.budget))
  const ext = opened({ 'vmu.meetings.budgetTurns': 1, 'vmu.meetings.budgetOnExceed': 'extend' })
  ext.h.t.speak({ meeting: ext.id, member: 'acad' })
  ok(ext.h.t.speak({ meeting: ext.id, member: 'acad' }).budget.code === null, 'budgetOnExceed[-]: "extend" neither refuses nor warns')
}

// ── 19–23 speech ────────────────────────────────────────────────────────────────────────────────────
{
  const def = mk({ 'vmu.meetings.speechDefaultMs': 250 })
  const r = def.t.open({ roster, chair: 'acad' })
  ok(def.t.speak({ meeting: r.meeting, member: 'acad' }).ms === 250, 'speechDefaultMs[+]: the default is applied when ms is omitted')
  ok(def.t.speak({ meeting: r.meeting, member: 'acad', ms: 10 }).ms === 10, 'speechDefaultMs[-]: an explicit ms overrides the default')
  const mx = opened({ 'vmu.meetings.speechMaxMs': 100 })
  const e1 = err(() => mx.h.t.speak({ meeting: mx.id, member: 'acad', ms: 500 }))
  ok(e1 && e1.code === 'VMU_MEETING_SPEECH_TIMEBOUND' && /上限=100/.test(String(e1.hint)), 'speechMaxMs[-]: over the max is refused with 现值/上限', e1 && e1.hint)
  ok(err(() => mx.h.t.speak({ meeting: mx.id, member: 'acad', ms: 50 })) === null, 'speechMaxMs[+]: within the max passes')
  const ext = opened({ 'vmu.meetings.speechDefaultMs': 100, 'vmu.meetings.speechExtendMs': 50, 'vmu.meetings.speechExtendMax': 2 })
  const er = ext.h.t.speak({ meeting: ext.id, member: 'acad', ms: 150 })
  ok(er.enforced.includes('vmu.meetings.speechExtendMs'), 'speechExtendMs[+]: going over the default consumes an extension (named in enforced[])', JSON.stringify(er.enforced))
  ok(!ext.h.t.speak({ meeting: ext.id, member: 'acad', ms: 100 }).enforced.includes('vmu.meetings.speechExtendMs'),
    'speechExtendMs[-]: a speech at the default does not consume one')
  const emax = opened({ 'vmu.meetings.speechDefaultMs': 100, 'vmu.meetings.speechExtendMs': 50, 'vmu.meetings.speechExtendMax': 1 })
  emax.h.t.speak({ meeting: emax.id, member: 'acad', ms: 150 })
  ok(codeOf(() => emax.h.t.speak({ meeting: emax.id, member: 'acad', ms: 150 })) === 'VMU_MEETING_SPEECH_TIMEBOUND',
    'speechExtendMax[-]: exceeding the extension count is refused')
  const emax3 = opened({ 'vmu.meetings.speechDefaultMs': 100, 'vmu.meetings.speechExtendMs': 50, 'vmu.meetings.speechExtendMax': 3 })
  emax3.h.t.speak({ meeting: emax3.id, member: 'acad', ms: 150 })
  ok(err(() => emax3.h.t.speak({ meeting: emax3.id, member: 'acad', ms: 150 })) === null, 'speechExtendMax[+]: within the extension count passes')
  const quota = opened({ 'vmu.meetings.speechQuotaPerMember': 1 })
  quota.h.t.speak({ meeting: quota.id, member: 'acad' })
  ok(codeOf(() => quota.h.t.speak({ meeting: quota.id, member: 'acad' })) === 'VMU_MEETING_SPEECH_TIMEBOUND', 'speechQuotaPerMember[-]: over the per-member quota is refused')
  const quota3 = opened({ 'vmu.meetings.speechQuotaPerMember': 3 })
  quota3.h.t.speak({ meeting: quota3.id, member: 'acad' })
  ok(err(() => quota3.h.t.speak({ meeting: quota3.id, member: 'acad' })) === null, 'speechQuotaPerMember[+]: within the quota passes')
}

// ── 24–26 interrupt / order ─────────────────────────────────────────────────────────────────────────
{
  const no = opened({ 'vmu.meetings.interruptAllow': false })
  ok(codeOf(() => no.h.t.interrupt({ meeting: no.id, member: 'r-1' })) === 'VMU_MEETING_INTERRUPT_DENIED', 'interruptAllow[-]: interrupting is refused when disallowed')
  const yes = opened({ 'vmu.meetings.interruptAllow': true })
  ok(err(() => yes.h.t.interrupt({ meeting: yes.id, member: 'r-1' })) === null, 'interruptAllow[+]: interrupting is allowed by default')
  const iq = opened({ 'vmu.meetings.interruptQuota': 1 })
  iq.h.t.interrupt({ meeting: iq.id, member: 'r-1' })
  ok(codeOf(() => iq.h.t.interrupt({ meeting: iq.id, member: 'r-1' })) === 'VMU_MEETING_INTERRUPT_DENIED', 'interruptQuota[-]: over the quota is refused')
  const iq3 = opened({ 'vmu.meetings.interruptQuota': 3 })
  iq3.h.t.interrupt({ meeting: iq3.id, member: 'r-1' })
  ok(err(() => iq3.h.t.interrupt({ meeting: iq3.id, member: 'r-1' })) === null, 'interruptQuota[+]: within the quota passes')
  const rr = opened({ 'vmu.meetings.orderMode': 'round-robin' })
  rr.h.t.attend({ meeting: rr.id, member: 'r-1' })
  rr.h.t.attend({ meeting: rr.id, member: 'r-2' })
  rr.h.t.speak({ meeting: rr.id, member: 'r-2' })
  rr.h.t.queue({ meeting: rr.id, member: 'r-1' })
  const rrq = rr.h.t.queue({ meeting: rr.id, member: 'r-2' })
  ok(rrq.order[0] === 'r-1', 'orderMode[+]: round-robin puts the less-used speaker first', JSON.stringify(rrq.order))
  const fifo = opened({ 'vmu.meetings.orderMode': 'fifo' })
  fifo.h.t.attend({ meeting: fifo.id, member: 'r-1' })
  fifo.h.t.attend({ meeting: fifo.id, member: 'r-2' })
  fifo.h.t.speak({ meeting: fifo.id, member: 'r-2' })
  fifo.h.t.queue({ meeting: fifo.id, member: 'r-1' })
  fifo.h.t.queue({ meeting: fifo.id, member: 'r-2' })
  ok(fifo.h.t.queue({ meeting: fifo.id, member: 'r-3' }).order.join(',') === 'r-1,r-2,r-3', 'orderMode[-]: fifo keeps the insertion order')
}

// ── 27–29 attendance policy / materials ─────────────────────────────────────────────────────────────
{
  const late = opened({ 'vmu.meetings.lateAfterMs': 100 })
  late.h.set(1500)
  const lr = late.h.t.attend({ meeting: late.id, member: 'r-1' })
  ok(lr.late === true && lr.enforced.includes('vmu.meetings.lateAfterMs'), 'lateAfterMs[+]: a late arrival is flagged and the key is in enforced[]', JSON.stringify(lr.enforced))
  const onTime = opened({ 'vmu.meetings.lateAfterMs': 10000 })
  ok(onTime.h.t.attend({ meeting: onTime.id, member: 'r-1' }).late === false, 'lateAfterMs[-]: an on-time arrival is not flagged')
  const denyLeave = opened({ 'vmu.meetings.leaveEarlyPolicy': 'deny' })
  denyLeave.h.t.attend({ meeting: denyLeave.id, member: 'r-1' })
  ok(codeOf(() => denyLeave.h.t.leave({ meeting: denyLeave.id, member: 'r-1' })) === 'VMU_NOT_PERMITTED', 'leaveEarlyPolicy[-]: "deny" refuses leaving before close')
  const noteLeave = opened({ 'vmu.meetings.leaveEarlyPolicy': 'note' })
  noteLeave.h.t.attend({ meeting: noteLeave.id, member: 'r-1' })
  ok(err(() => noteLeave.h.t.leave({ meeting: noteLeave.id, member: 'r-1' })) === null &&
    noteLeave.h.t.minutes({ meeting: noteLeave.id }).entries.some((e) => e.kind === 'left-early'), 'leaveEarlyPolicy[+]: "note" records the early departure')
  const mat = mk({ 'vmu.meetings.materialsRequired': true })
  ok(codeOf(() => mat.t.open({ roster })) === 'VMU_STATE', 'materialsRequired[-]: opening without materials is refused')
  ok(err(() => mat.t.open({ roster, materials: 'doc-1' })) === null, 'materialsRequired[+]: with materials the meeting opens')
}

// ── 30–34 minutes ───────────────────────────────────────────────────────────────────────────────────
{
  const full = opened({ 'vmu.meetings.minutesDetail': 'full' })
  full.h.t.speak({ meeting: full.id, member: 'acad' })
  full.h.t.speak({ meeting: full.id, member: 'acad' })
  const brief = opened({ 'vmu.meetings.minutesDetail': 'brief' })
  brief.h.t.speak({ meeting: brief.id, member: 'acad' })
  brief.h.t.speak({ meeting: brief.id, member: 'acad' })
  ok(full.h.t.minutes({ meeting: full.id }).detail === 'full' && brief.h.t.minutes({ meeting: brief.id }).detail === 'brief',
    'minutesDetail[+/-]: the detail level is reported and shapes the view',
    JSON.stringify([full.h.t.minutes({ meeting: full.id }).entries.length, brief.h.t.minutes({ meeting: brief.id }).entries.length]))
  const incl = opened({ 'vmu.meetings.minutesIncludeRefused': true, 'vmu.meetings.speechMaxMs': 10 })
  err(() => incl.h.t.speak({ meeting: incl.id, member: 'acad', ms: 100 }))
  ok(incl.h.t.minutes({ meeting: incl.id }).refused.length === 1, 'minutesIncludeRefused[+]: a refused action is listed in the minutes')
  const excl = opened({ 'vmu.meetings.minutesIncludeRefused': false, 'vmu.meetings.speechMaxMs': 10 })
  err(() => excl.h.t.speak({ meeting: excl.id, member: 'acad', ms: 100 }))
  ok(excl.h.t.minutes({ meeting: excl.id }).refused.length === 0, 'minutesIncludeRefused[-]: with the key off the refused list is empty')
  const act = opened({ 'vmu.meetings.minutesActionsRequired': true })
  ok(codeOf(() => act.h.t.close({ meeting: act.id })) === 'VMU_MINUTES_ACTION_REQUIRED', 'minutesActionsRequired[-]: closing without actions is refused')
  ok(err(() => act.h.t.close({ meeting: act.id, actions: [{ who: 'r-1', what: 'draft' }] })) === null, 'minutesActionsRequired[+]: with actions the meeting closes')
  const ret = opened({ 'vmu.meetings.minutesRetentionMs': 100 })
  ret.h.set(5000)
  ret.h.t.close({ meeting: ret.id })
  ok(ret.h.t.status().counters.prunedMinutes >= 1, 'minutesRetentionMs[+]: an expired archive is pruned AND counted', JSON.stringify(ret.h.t.status().counters.prunedMinutes))
  const keep = opened({ 'vmu.meetings.minutesRetentionMs': 0 })
  keep.h.set(5000)
  keep.h.t.close({ meeting: keep.id })
  ok(keep.h.t.status().counters.prunedMinutes === 0, 'minutesRetentionMs[-]: with 0 nothing is pruned')
  const conf = opened({ 'vmu.meetings.confirmPreviousMinutes': true })
  ok(codeOf(() => conf.h.t.close({ meeting: conf.id })) === 'VMU_MINUTES_NOT_CONFIRMED', 'confirmPreviousMinutes[-]: closing before confirmation is refused')
  conf.h.t.confirmMinutes({ meeting: conf.id })
  ok(err(() => conf.h.t.close({ meeting: conf.id })) === null, 'confirmPreviousMinutes[+]: after confirmation the meeting closes')
}

// ── 35–37 appeals ───────────────────────────────────────────────────────────────────────────────────
{
  const dl = opened({ 'vmu.meetings.appealDeadlineMs': 100, 'vmu.meetings.appealReasonRequired': false })
  dl.h.set(1500)
  const e1 = err(() => dl.h.t.fileAppeal({ meeting: dl.id, member: 'r-1', kind: 'procedural' }))
  ok(e1 && e1.code === 'VMU_TRUST_APPEAL_WINDOW' && /上限=100/.test(String(e1.hint)), 'appealDeadlineMs[-]: a late appeal is refused with 现值/上限', e1 && e1.hint)
  const ok1 = opened({ 'vmu.meetings.appealDeadlineMs': 10000, 'vmu.meetings.appealReasonRequired': false })
  ok(err(() => ok1.h.t.fileAppeal({ meeting: ok1.id, member: 'r-1', kind: 'procedural' })) === null, 'appealDeadlineMs[+]: an in-time appeal passes')
  const reason = opened({ 'vmu.meetings.appealReasonRequired': true })
  ok(codeOf(() => reason.h.t.fileAppeal({ meeting: reason.id, member: 'r-1' })) === 'VMU_REASON_REQUIRED', 'appealReasonRequired[-]: a reasonless appeal is refused')
  ok(err(() => reason.h.t.fileAppeal({ meeting: reason.id, member: 'r-1', reason: 'procedure was skipped' })) === null, 'appealReasonRequired[+]: with a reason the appeal is filed')
  const scopeNone = opened({ 'vmu.meetings.appealScope': 'none', 'vmu.meetings.appealReasonRequired': false })
  ok(codeOf(() => scopeNone.h.t.fileAppeal({ meeting: scopeNone.id, member: 'r-1' })) === 'VMU_MEETING_APPEAL_OUT_OF_SCOPE', 'appealScope[-]: scope "none" refuses every appeal')
  const scopeProc = opened({ 'vmu.meetings.appealScope': 'procedural', 'vmu.meetings.appealReasonRequired': false })
  ok(err(() => scopeProc.h.t.fileAppeal({ meeting: scopeProc.id, member: 'r-1', kind: 'procedural' })) === null, 'appealScope[+]: a procedural appeal passes')
  ok(codeOf(() => scopeProc.h.t.fileAppeal({ meeting: scopeProc.id, member: 'r-1', kind: 'substantive' })) === 'VMU_MEETING_APPEAL_OUT_OF_SCOPE',
    'appealScope[-]: an out-of-scope KIND is refused')
}

// ── 38–40 discipline ────────────────────────────────────────────────────────────────────────────────
{
  const wm = opened({ 'vmu.meetings.disciplineWarnMax': 1, 'vmu.meetings.disciplineMuteMs': 1000 })
  wm.h.t.attend({ meeting: wm.id, member: 'r-1' })
  wm.h.t.warn({ meeting: wm.id, member: 'r-1', reason: 'noise' })
  const w2 = wm.h.t.warn({ meeting: wm.id, member: 'r-1', reason: 'noise again' })
  ok(w2.escalated === 'muted' && wm.h.t.status().counters.mutes === 1, 'disciplineWarnMax[+]: exceeding the warn max escalates to a mute', JSON.stringify(w2))
  const wm5 = opened({ 'vmu.meetings.disciplineWarnMax': 5, 'vmu.meetings.disciplineMuteMs': 1000 })
  ok(wm5.h.t.warn({ meeting: wm5.id, member: 'r-1' }).escalated === null, 'disciplineWarnMax[-]: within the max there is no escalation')
  const muted = wm.h.t
  const e1 = err(() => muted.speak({ meeting: wm.id, member: 'r-1' }))
  ok(e1 && e1.code === 'VMU_MEETING_DISCIPLINE_DENIED' && /disciplineMuteMs/.test(String(e1.hint)), 'disciplineMuteMs[-]: a muted member cannot speak (the hint names the key)', e1 && e1.hint)
  wm.h.set(5000)
  ok(err(() => muted.speak({ meeting: wm.id, member: 'r-1' })) === null, 'disciplineMuteMs[+]: after the mute lapses the member may speak')
  const noExpel = opened({ 'vmu.meetings.disciplineExpelAllowed': false })
  ok(codeOf(() => noExpel.h.t.expel({ meeting: noExpel.id, member: 'r-1' })) === 'VMU_MEETING_DISCIPLINE_DENIED', 'disciplineExpelAllowed[-]: expulsion is refused when disallowed')
  const expel = opened({})
  ok(err(() => expel.h.t.expel({ meeting: expel.id, member: 'r-1' })) === null, 'disciplineExpelAllowed[+]: expulsion is allowed by default')
}

// ── 41–42 recess ────────────────────────────────────────────────────────────────────────────────────
{
  const rmax = opened({ 'vmu.meetings.recessMaxMs': 100 })
  ok(codeOf(() => rmax.h.t.recess({ meeting: rmax.id, ms: 500 })) === 'VMU_MEETING_RECESS_LIMIT', 'recessMaxMs[-]: an over-long recess is refused')
  const rok = opened({ 'vmu.meetings.recessMaxMs': 1000 })
  ok(err(() => rok.h.t.recess({ meeting: rok.id, ms: 50 })) === null, 'recessMaxMs[+]: a recess within the cap passes')
  const rreq = opened({ 'vmu.meetings.recessResumeRequiresMotion': true })
  rreq.h.t.recess({ meeting: rreq.id, ms: 50 })
  ok(codeOf(() => rreq.h.t.resume({ meeting: rreq.id })) === 'VMU_STATE', 'recessResumeRequiresMotion[-]: resuming without a motion is refused')
  ok(err(() => rreq.h.t.resume({ meeting: rreq.id, motion: 'mo9' })) === null, 'recessResumeRequiresMotion[+]: with a motion the recess ends')
}

// ── 43–46 confidentiality / verbatim ────────────────────────────────────────────────────────────────
{
  const restricted = opened({ 'vmu.meetings.confidentialityDefault': 'restricted' })
  ok(restricted.h.t.quote({ meeting: restricted.id, text: 'x' }).level === 'restricted', 'confidentialityDefault[+]: the default level is applied and reported')
  const publicM = opened({ 'vmu.meetings.confidentialityDefault': 'public' })
  ok(publicM.h.t.quote({ meeting: publicM.id, text: 'x' }).level === 'public', 'confidentialityDefault[-]: a different default changes the level')
  const qdeny = opened({ 'vmu.meetings.confidentialityQuotePolicy': 'deny' })
  ok(codeOf(() => qdeny.h.t.quote({ meeting: qdeny.id, text: 'x' })) === 'VMU_MEETING_CONFIDENTIAL_DENIED', 'confidentialityQuotePolicy[-]: quoting is refused under "deny"')
  const qredact = opened({ 'vmu.meetings.confidentialityQuotePolicy': 'redact' })
  ok(qredact.h.t.quote({ meeting: qredact.id, text: 'secret words' }).quoted === '[redacted]', 'confidentialityQuotePolicy[+]: "redact" returns a redacted quote')
  const vno = opened({ 'vmu.meetings.verbatimEnabled': false })
  ok(codeOf(() => vno.h.t.speak({ meeting: vno.id, member: 'acad', verbatim: true, text: 'x' })) === 'VMU_NOT_PERMITTED', 'verbatimEnabled[-]: verbatim capture is refused when disabled')
  const vy = opened({ 'vmu.meetings.verbatimEnabled': true })
  vy.h.t.speak({ meeting: vy.id, member: 'acad', verbatim: true, text: 'line one' })
  ok(vy.h.t.verbatim({ meeting: vy.id }).lines.length === 1, 'verbatimEnabled[+]: with the key on the line is captured')
  const vret = opened({ 'vmu.meetings.verbatimEnabled': true, 'vmu.meetings.verbatimRetentionMs': 100 })
  vret.h.t.speak({ meeting: vret.id, member: 'acad', verbatim: true, text: 'old line' })
  vret.h.set(5000)
  ok(vret.h.t.verbatim({ meeting: vret.id }).lines.length === 0 && vret.h.t.status().counters.prunedVerbatim >= 1,
    'verbatimRetentionMs[+]: an expired line is pruned AND counted')
  const vkeep = opened({ 'vmu.meetings.verbatimEnabled': true, 'vmu.meetings.verbatimRetentionMs': 0 })
  vkeep.h.t.speak({ meeting: vkeep.id, member: 'acad', verbatim: true, text: 'kept line' })
  vkeep.h.set(5000)
  ok(vkeep.h.t.verbatim({ meeting: vkeep.id }).lines.length === 1, 'verbatimRetentionMs[-]: with 0 the transcript is kept')
}

// ── 47 wake ─────────────────────────────────────────────────────────────────────────────────────────
{
  const failing = () => ({ ok: false, error: 'host refused' })
  const refuse = createMeetings({ clock: () => NOW, settings: { 'vmu.meetings.wakeFailurePolicy': 'refuse' }, wake: failing })
  ok(codeOf(() => refuse.wake({ member: 'r-1' })) === 'VMU_STATE', 'wakeFailurePolicy[-]: "refuse" turns a failed wake into a named refusal')
  const skip = createMeetings({ clock: () => NOW, settings: { 'vmu.meetings.wakeFailurePolicy': 'skip' }, wake: failing })
  const r = skip.wake({ member: 'r-1' })
  ok(r.ok === true && r.skipped === true && skip.status().counters.skippedWakes === 1, 'wakeFailurePolicy[+]: "skip" continues and COUNTS the skip')
  const fine = createMeetings({ clock: () => NOW, wake: () => ({ ok: true }) })
  ok(fine.wake({ member: 'r-1' }).woken === true, 'wake[+]: a successful wake reports woken:true')
  ok(codeOf(() => createMeetings({ clock: () => NOW }).wake({ member: 'r-1' })) === 'VMU_ENGINE_UNAVAILABLE', 'wake[-]: without a seam it refuses by name')
}

// ── the honesty rails ───────────────────────────────────────────────────────────────────────────────
{
  const st = mk({}).t.status()
  ok(WIRED_KEYS.length === 47, 'the layer wires all 47 declared vmu.meetings.* keys', String(WIRED_KEYS.length))
  ok(st.declaredMeetingKeys === 47, 'the declared universe is read from settings/planned.js', String(st.declaredMeetingKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredMeetingKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 47 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredMeetingKeys, overlap: st.overlapWithWired }))
  ok(Object.keys(st.keys).length === 47 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 47 wired keys (no silent nulls)')
  ok(st.plannedKeys.every((k) => typeof st.unwiredReasons[k] === 'string'), 'any unwired key would carry a reason (mechanism present)')
  ok(typeof UNWIRED_REASONS['vmu.meetings'] === 'string', 'the reason table is exported for future keys')
  // enforced[] is precise: a call that evaluates nothing does not claim a key
  const plain = mk({})
  const o = plain.t.open({ roster })
  ok(!o.enforced.includes('vmu.meetings.liveCap') && !o.enforced.includes('vmu.meetings.typeCatalog'),
    'enforced[] does NOT claim keys that were not evaluated (read ≠ effective)', JSON.stringify(o.enforced))
  const capped = mk({ 'vmu.meetings.liveCap': 5 }).t.open({ roster })
  ok(capped.enforced.includes('vmu.meetings.liveCap'), 'enforced[] DOES name a key that actually fired', JSON.stringify(capped.enforced))
  // refusals counted by code
  const counted = mk({ 'vmu.meetings.interruptAllow': false })
  const cid = counted.t.open({ roster }).meeting
  codeOf(() => counted.t.interrupt({ meeting: cid, member: 'r-1' }))
  codeOf(() => counted.t.interrupt({ meeting: cid, member: 'r-2' }))
  ok(counted.t.status().refusals.VMU_MEETING_INTERRUPT_DENIED === 2, 'refusals are COUNTED BY CODE', JSON.stringify(counted.t.status().refusals))
  // determinism
  const run = (t) => { const id = t.open({ roster }).meeting; t.attend({ meeting: id, member: 'r-1' }); t.speak({ meeting: id, member: 'r-1' }); return JSON.stringify(t.status()) }
  const a = mk({ 'vmu.meetings.speechQuotaPerMember': 2 }); const b = mk({ 'vmu.meetings.speechQuotaPerMember': 2 })
  ok(run(a.t) === run(b.t), 'two instances with the same inputs produce identical status()')
  // zero mechanism
  const zero = createMeetings({ clock: () => 0 })
  const zid = zero.open({ roster, chair: 'acad' }).meeting
  ok(zero.speak({ meeting: zid, member: 'acad' }).ok === true, 'zero mechanism[+]: the documented defaults let a plain meeting run')
  ok(codeOf(() => zero.speak({ meeting: 'nope', member: 'acad' })) === 'VMU_NO_SUCH_OBJECT', 'zero mechanism[-]: an unknown meeting is a named refusal')
  ok(zero.status().declaredMeetingKeys === 47, 'the declared-key universe is available with no settings at all')
  // read-only faces
  const ro = mk({})
  const rid = ro.t.open({ roster }).meeting
  const before = JSON.stringify(ro.t.status().counters)
  ro.t.quorum({ meeting: rid }); ro.t.minutes({ meeting: rid }); ro.t.verbatim({ meeting: rid }); ro.t.receiptsView(); ro.t.status()
  ok(JSON.stringify(ro.t.status().counters) === before, 'READ paths (quorum/minutes/verbatim/receipts/status) do not mutate recorded data')
  ok(codeOf(() => ro.t.quorum({ meeting: 'nope' })) === 'VMU_NO_SUCH_OBJECT', 'reading an unknown meeting is a named refusal')
}

// ── enforced[] honesty on the REFUSAL path (round-12 gate audit-enforced-consistency) ───────────────
{
  const grab = (fn) => { try { fn(); return null } catch (e) { return e } }
  // 1) the two findings the gate named: the refusal must carry the key that fired
  const mat = mk({ 'vmu.meetings.materialsRequired': true })
  const e1 = grab(() => mat.t.open({ roster }))
  ok(e1 && Array.isArray(e1.enforced) && e1.enforced.includes('vmu.meetings.materialsRequired'),
    'enforced[+] meetings.open(materialsRequired): the refusal carries enforced[] naming the key (gate finding #1)', e1 && JSON.stringify(e1.enforced))
  const act = opened({ 'vmu.meetings.minutesActionsRequired': true })
  const e2 = grab(() => act.h.t.close({ meeting: act.id }))
  ok(e2 && Array.isArray(e2.enforced) && e2.enforced.includes('vmu.meetings.minutesActionsRequired'),
    'enforced[+] meetings.close(minutesActionsRequired): the refusal carries enforced[] naming the key (gate finding #2)', e2 && JSON.stringify(e2.enforced))
  // 2) EVALUATION POINT = ENUMERATION POINT: a refusal names every rail whose switch was consulted earlier
  const chain = mk({ 'vmu.meetings.confirmPreviousMinutes': true, 'vmu.meetings.committeeReportRequired': true })
  const cid = chain.t.open({ type: 'committee', roster }).meeting
  const e3a = grab(() => chain.t.close({ meeting: cid }))
  ok(e3a && e3a.enforced.includes('vmu.meetings.confirmPreviousMinutes'),
    'enforced[+] the first firing rail is named (confirmPreviousMinutes)', e3a && JSON.stringify(e3a.enforced))
  chain.t.confirmMinutes({ meeting: cid })
  const e3 = grab(() => chain.t.close({ meeting: cid }))
  ok(e3 && e3.enforced.includes('vmu.meetings.confirmPreviousMinutes') && e3.enforced.includes('vmu.meetings.committeeReportRequired'),
    'enforced[+] a later refusal lists the rail consulted EARLIER in the same call (incremental trail)', e3 && JSON.stringify(e3.enforced))
  const quit = opened({ 'vmu.meetings.speechMaxMs': 10, 'vmu.meetings.verbatimEnabled': false })
  const e4 = grab(() => quit.h.t.speak({ meeting: quit.id, member: 'acad', ms: 999, verbatim: true }))
  ok(e4 && e4.enforced.includes('vmu.meetings.speechMaxMs'),
    'enforced[+] the FIRST rail to fire is the one named (speechMaxMs fires before verbatimEnabled)', e4 && JSON.stringify(e4.enforced))
  // 3) EVERY refusal path carries an ARRAY enforced (never undefined / null)
  const notMember = { has: () => false }
  const triggers = [
    ['ctor clock', () => createMeetings({ clock: 7 }), null],
    ['no such meeting', () => mk({}).t.speak({ meeting: 'nope', member: 'acad' }), null],
    ['no open meeting', () => mk({}).t.close({ meeting: 'x' }), null],
    ['typeCatalog', () => mk({ 'vmu.meetings.typeCatalog': ['ordinary'] }).t.open({ type: 'secret', roster }), null],
    ['liveCap', () => { const h = mk({ 'vmu.meetings.liveCap': 1 }); h.t.open({ roster }); return h.t.open({ roster }) }, null],
    ['committeeMax', () => mk({ 'vmu.meetings.committeeMax': 2 }).t.open({ type: 'committee', roster, size: 9 }), null],
    ['materialsRequired', () => mk({ 'vmu.meetings.materialsRequired': true }).t.open({ roster }), null],
    ['attend bad member', () => { const o = opened({}); return o.h.t.attend({ meeting: o.id }) }, null],
    ['attend not member', () => { const o = opened({}, { members: notMember }); return o.h.t.attend({ meeting: o.id, member: 'zz' }) }, null],
    ['leave not present', () => { const o = opened({}); return o.h.t.leave({ meeting: o.id, member: 'r-9' }) }, null],
    ['leaveEarlyPolicy', () => { const o = opened({ 'vmu.meetings.leaveEarlyPolicy': 'deny' }); o.h.t.attend({ meeting: o.id, member: 'r-1' }); return o.h.t.leave({ meeting: o.id, member: 'r-1' }) }, null],
    ['speak not present', () => { const o = opened({}); return o.h.t.speak({ meeting: o.id, member: 'r-9' }) }, null],
    ['disciplineMuteMs', () => { const o = opened({ 'vmu.meetings.disciplineWarnMax': 1, 'vmu.meetings.disciplineMuteMs': 9999 }); o.h.t.attend({ meeting: o.id, member: 'r-1' }); o.h.t.warn({ meeting: o.id, member: 'r-1' }); o.h.t.warn({ meeting: o.id, member: 'r-1' }); return o.h.t.speak({ meeting: o.id, member: 'r-1' }) }, null],
    ['speechMaxMs', () => { const o = opened({ 'vmu.meetings.speechMaxMs': 1 }); return o.h.t.speak({ meeting: o.id, member: 'acad', ms: 99 }) }, null],
    ['speechExtendMax', () => { const o = opened({ 'vmu.meetings.speechDefaultMs': 10, 'vmu.meetings.speechExtendMs': 5, 'vmu.meetings.speechExtendMax': 1 }); o.h.t.speak({ meeting: o.id, member: 'acad', ms: 20 }); return o.h.t.speak({ meeting: o.id, member: 'acad', ms: 20 }) }, null],
    ['speechQuotaPerMember', () => { const o = opened({ 'vmu.meetings.speechQuotaPerMember': 1 }); o.h.t.speak({ meeting: o.id, member: 'acad' }); return o.h.t.speak({ meeting: o.id, member: 'acad' }) }, null],
    ['budgetTurns', () => { const o = opened({ 'vmu.meetings.budgetTurns': 1 }); o.h.t.speak({ meeting: o.id, member: 'acad' }); return o.h.t.speak({ meeting: o.id, member: 'acad' }) }, null],
    ['verbatimEnabled', () => { const o = opened({ 'vmu.meetings.verbatimEnabled': false }); return o.h.t.speak({ meeting: o.id, member: 'acad', verbatim: true }) }, null],
    ['interruptAllow', () => { const o = opened({ 'vmu.meetings.interruptAllow': false }); return o.h.t.interrupt({ meeting: o.id, member: 'acad' }) }, null],
    ['interruptQuota', () => { const o = opened({ 'vmu.meetings.interruptQuota': 1 }); o.h.t.interrupt({ meeting: o.id, member: 'acad' }); return o.h.t.interrupt({ meeting: o.id, member: 'acad' }) }, null],
    ['emergencyKinds', () => { const o = opened({}); return o.h.t.motion({ meeting: o.id, member: 'acad', kind: 'emergency' }) }, null],
    ['motion materials', () => { const o = opened({ 'vmu.meetings.materialsRequired': true }); return o.h.t.motion({ meeting: o.id, member: 'acad' }) }, null],
    ['quorumMin', () => { const o = opened({ 'vmu.meetings.quorumMin': 3 }); return o.h.t.vote({ meeting: o.id, member: 'acad' }) }, null],
    ['quorumLossPolicy', () => { const o = opened({ 'vmu.meetings.quorumMin': 2, 'vmu.meetings.quorumLossPolicy': 'suspend' }); o.h.t.attend({ meeting: o.id, member: 'r-1' }); o.h.t.leave({ meeting: o.id, member: 'r-1' }); return o.h.t.vote({ meeting: o.id, member: 'acad' }) }, null],
    ['quorumRecountMs', () => { const o = opened({ 'vmu.meetings.quorumMin': 3, 'vmu.meetings.quorumRecountMs': 100 }); return o.h.t.vote({ meeting: o.id, member: 'acad' }) }, null],
    ['chairNeutral', () => { const o = opened({ 'vmu.meetings.chairNeutral': true }); o.h.t.attend({ meeting: o.id, member: 'r-1' }); o.h.t.motion({ meeting: o.id, member: 'r-1' }); o.h.t.vote({ meeting: o.id, member: 'r-1', motion: 'mo1', value: 1 }); return o.h.t.vote({ meeting: o.id, member: 'acad', motion: 'mo1', value: 1 }) }, null],
    ['vote no such motion', () => { const o = opened({}); return o.h.t.vote({ meeting: o.id, member: 'acad', motion: 'mo9' }) }, null],
    ['transferChair target', () => { const o = opened({}); return o.h.t.transferChair({ meeting: o.id }) }, null],
    ['chairTransferAudit', () => { const o = opened({ 'vmu.meetings.chairTransferAudit': true }); return o.h.t.transferChair({ meeting: o.id, to: 'r-1' }) }, null],
    ['recessMaxMs', () => { const o = opened({ 'vmu.meetings.recessMaxMs': 10 }); return o.h.t.recess({ meeting: o.id, ms: 99 }) }, null],
    ['recess already', () => { const o = opened({}); o.h.t.recess({ meeting: o.id, ms: 1 }); return o.h.t.recess({ meeting: o.id, ms: 1 }) }, null],
    ['resume not recessed', () => { const o = opened({}); return o.h.t.resume({ meeting: o.id }) }, null],
    ['recessResumeRequiresMotion', () => { const o = opened({ 'vmu.meetings.recessResumeRequiresMotion': true }); o.h.t.recess({ meeting: o.id, ms: 1 }); return o.h.t.resume({ meeting: o.id }) }, null],
    ['disciplineExpelAllowed', () => { const o = opened({ 'vmu.meetings.disciplineExpelAllowed': false }); return o.h.t.expel({ meeting: o.id, member: 'acad' }) }, null],
    ['confidentialityQuotePolicy', () => { const o = opened({ 'vmu.meetings.confidentialityQuotePolicy': 'deny' }); return o.h.t.quote({ meeting: o.id, text: 'x' }) }, null],
    ['appealScope', () => { const o = opened({ 'vmu.meetings.appealScope': 'none' }); return o.h.t.fileAppeal({ meeting: o.id, member: 'acad' }) }, null],
    ['appealDeadlineMs', () => { const o = opened({ 'vmu.meetings.appealDeadlineMs': 1, 'vmu.meetings.appealReasonRequired': false }); o.h.set(9999); return o.h.t.fileAppeal({ meeting: o.id, member: 'acad' }) }, null],
    ['appealReasonRequired', () => { const o = opened({}); return o.h.t.fileAppeal({ meeting: o.id, member: 'acad' }) }, null],
    ['wake no seam', () => opened({}).h.t.wake({ member: 'acad' }), null],
    ['wakeFailurePolicy', () => createMeetings({ clock: () => 0, settings: { 'vmu.meetings.wakeFailurePolicy': 'refuse' }, wake: () => ({ ok: false, error: 'x' }) }).wake({ member: 'r-1' }), null],
    ['confirmPreviousMinutes', () => { const o = opened({ 'vmu.meetings.confirmPreviousMinutes': true }); return o.h.t.close({ meeting: o.id }) }, null],
    ['committeeReportRequired', () => { const o = opened({ 'vmu.meetings.committeeReportRequired': true }, {}, { type: 'committee' }); return o.h.t.close({ meeting: o.id }) }, null],
    ['minutesActionsRequired', () => { const o = opened({ 'vmu.meetings.minutesActionsRequired': true }); return o.h.t.close({ meeting: o.id }) }, null],
  ]
  const missingEnforced = []
  const thrown = []
  const noThrow = []
  for (const [label, fn] of triggers) {
    const e = grab(fn)
    if (!e) { noThrow.push(label); continue }
    thrown.push(label)
    if (!Array.isArray(e.enforced)) missingEnforced.push(label + '=' + String(e.enforced))
    else if (!Array.isArray(e.evaluated)) missingEnforced.push(label + ':no-evaluated')
  }
  ok(noThrow.length === 0, 'every refusal trigger really refuses (the table is meaningful)', JSON.stringify(noThrow))
  ok(missingEnforced.length === 0,
    'EVERY refusal path in meetings.js carries an ARRAY enforced[] (never undefined/null) — ' + thrown.length + ' triggers',
    JSON.stringify(missingEnforced))
  ok(thrown.length >= 35, 'the refusal table covers the whole module surface', String(thrown.length))
  // 4) reverse: a key that was NOT evaluated must not appear in a refusal
  const quiet = grab(() => mk({ 'vmu.meetings.materialsRequired': true }).t.open({ roster }))
  const absent = ['vmu.meetings.liveCap', 'vmu.meetings.typeCatalog', 'vmu.meetings.committeeMax', 'vmu.meetings.quorumMin']
    .filter((k) => quiet.enforced.includes(k))
  ok(absent.length === 0, 'a refusal does NOT claim keys that were not evaluated', JSON.stringify(absent))
  ok(quiet.enforced.length === 1, 'the materialsRequired refusal names exactly the one key consulted', JSON.stringify(quiet.enforced))
}

if (failed === 0) {
  // ── D3: the evaluation scope rides with every receipt AND every refusal; no receipt has duplicates ──
{
  const h = mk({})
  const mg = h.t
  const o = mg.open({ type: 'ordinary', chair: 'acad', roster })
  ok(o.enforcedScope === 'evaluated-so-far', 'D3: an open() receipt states enforcedScope=evaluated-so-far')
  ok(o.receipt && o.receipt.enforcedScope === 'evaluated-so-far', 'D3: the nested receipt states it too')
  const refusal = errOf(() => mg.open({ type: 'nope', chair: 'acad', roster }))
  ok(!!refusal && refusal.enforcedScope === 'evaluated-so-far', 'D3: a REFUSAL carries enforcedScope itself')
  ok(!!refusal && Array.isArray(refusal.enforced) && refusal.enforced.includes('vmu.meetings.typeCatalog'), 'D3: the refusal lists the key it consulted (and the scope)')
  const session = opened({})
  const recs = []
  const tryPush = (fn) => { try { const r = fn(); if (r && Array.isArray(r.enforced)) recs.push(r) } catch (e) { /* refusals covered elsewhere */ } }
  tryPush(() => session.h.t.attend({ meeting: session.id, member: 'acad' }))
  tryPush(() => session.h.t.speak({ meeting: session.id, member: 'acad', ms: 500 }))
  tryPush(() => session.h.t.queue({ meeting: session.id, member: 'r-1' }))
  tryPush(() => session.h.t.motion({ meeting: session.id, member: 'acad', kind: 'ordinary' }))
  tryPush(() => session.h.t.vote({ meeting: session.id, member: 'r-1' }))
  tryPush(() => session.h.t.warn({ meeting: session.id, member: 'r-2' }))
  tryPush(() => session.h.t.leave({ meeting: session.id, member: 'r-3' }))
  tryPush(() => session.h.t.quorum({ meeting: session.id }))
  tryPush(() => session.h.t.close({ meeting: session.id }))
  const dup = recs.filter((x) => !Array.isArray(x.enforced) || new Set(x.enforced).size !== x.enforced.length)
  ok(recs.length >= 3, 'no-dup: the session produced receipts to check (' + recs.length + ')')
  ok(recs.every((x) => x.enforcedScope === 'evaluated-so-far'), 'D3: every receipt in the session carries the scope')
  ok(dup.length === 0, 'no-dup: no receipt in the full session has duplicates (' + (dup.length ? JSON.stringify(dup[0]) : recs.length + ' receipts checked') + ')')
  ok(mg.status() && mg.receiptsView({}).enforcedScope === 'evaluated-so-far', 'D3: the receipts view carries the scope as well')
}

console.log('=== VMU MEETINGS: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
// ── D3: the evaluation scope rides with every receipt AND every refusal; no receipt has duplicates ──
{
  const h = mk({})
  const mg = h.t
  const o = mg.open({ type: 'ordinary', chair: 'acad', roster })
  ok(o.enforcedScope === 'evaluated-so-far', 'D3: an open() receipt states enforcedScope=evaluated-so-far')
  ok(o.receipt && o.receipt.enforcedScope === 'evaluated-so-far', 'D3: the nested receipt states it too')
  const refusal = errOf(() => mg.open({ type: 'nope', chair: 'acad', roster }))
  ok(!!refusal && refusal.enforcedScope === 'evaluated-so-far', 'D3: a REFUSAL carries enforcedScope itself')
  ok(!!refusal && Array.isArray(refusal.enforced) && refusal.enforced.includes('vmu.meetings.typeCatalog'), 'D3: the refusal lists the key it consulted (and the scope)')
  const session = opened({})
  const recs = []
  const tryPush = (fn) => { try { const r = fn(); if (r && Array.isArray(r.enforced)) recs.push(r) } catch (e) { /* refusals covered elsewhere */ } }
  tryPush(() => session.h.t.attend({ meeting: session.id, member: 'acad' }))
  tryPush(() => session.h.t.speak({ meeting: session.id, member: 'acad', ms: 500 }))
  tryPush(() => session.h.t.queue({ meeting: session.id, member: 'r-1' }))
  tryPush(() => session.h.t.motion({ meeting: session.id, member: 'acad', kind: 'ordinary' }))
  tryPush(() => session.h.t.vote({ meeting: session.id, member: 'r-1' }))
  tryPush(() => session.h.t.warn({ meeting: session.id, member: 'r-2' }))
  tryPush(() => session.h.t.leave({ meeting: session.id, member: 'r-3' }))
  tryPush(() => session.h.t.quorum({ meeting: session.id }))
  tryPush(() => session.h.t.close({ meeting: session.id }))
  const dup = recs.filter((x) => !Array.isArray(x.enforced) || new Set(x.enforced).size !== x.enforced.length)
  ok(recs.length >= 3, 'no-dup: the session produced receipts to check (' + recs.length + ')')
  ok(recs.every((x) => x.enforcedScope === 'evaluated-so-far'), 'D3: every receipt in the session carries the scope')
  ok(dup.length === 0, 'no-dup: no receipt in the full session has duplicates (' + (dup.length ? JSON.stringify(dup[0]) : recs.length + ' receipts checked') + ')')
  ok(mg.status() && mg.receiptsView({}).enforcedScope === 'evaluated-so-far', 'D3: the receipts view carries the scope as well')
}

console.log('=== VMU MEETINGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
