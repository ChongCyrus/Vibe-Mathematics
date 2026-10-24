// tests/vmu-receipt-shapes.test.mjs — THE RECEIPT SHAPES THE LEDGER PROMISES, ASSERTED ON REAL CALLS.
//
// Why this file exists: phase-12's §35 ledger table said five run-9 findings were "fixed", and live run 10 showed that
// THREE of them were not, in the only sense a reader cares about:
//   · B promised `delivery{addressed, selfAddressed, recipient, reason}` — the receipt carried only
//     `{attempted, via, ok, result, error, code, note}`;
//   · E promised `overrodeQuorum{by, rule, floor, present}` — the receipt carried a BOOLEAN of that name and a prose note;
//   · F promised the due-clock pass would be visible — the pass existed but no read face carried `swept/transitions/note`.
// All three were "fixed" in the sense that the code changed. None were fixed in the sense that a caller can READ it. The
// ledger's own field-claims gate cannot catch this (it checks that identifiers EXIST), so the shapes need assertions on
// real receipts — which is what this file is.
//
// WHAT IS ASSERTED: B (delivery), E (the quorum override record), F (the sweep trace on both read faces), C (the report
// refusal's three delivery facts).
// WHAT IS NOT: A (`selectionIgnored`). The branch needs a turn that really AWAITS a report; a minimal boot has no
// subagents service, so it is unreachable here — recorded as a named deferral instead of a quiet omission.

import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return }
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
}
const has = (obj, keys, label) => {
  const missing = keys.filter((k) => obj === null || obj === undefined || !(k in obj))
  ok(missing.length === 0, label, missing)
}

const { createMeetingVerdict } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'meetingverdict.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const root = await mkdtemp(join('D:/_tmp', 'vmu-shapes-'))
try {
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], vmu: { meetings: { quorumMin: 2, quorumCap: 0 } } })
  await handle.ready()
  const kernel = handle.kernel
  const tool = (name) => specs.find((s) => s.name === name)
  const call = async (name, args) => JSON.parse(await tool(name).execute(args, {}))
  ok(tool('vibe_v5_meeting') !== undefined && tool('vibe_vmu_meeting') !== undefined, 'setup: both meeting faces are registered', specs.length)

  await kernel.members.hire({ id: 'chair', slot: 'chair' })
  await kernel.members.hire({ id: 'm2', slot: 'member' })

  console.log('=== B. the ruling DELIVERY states what it addressed, not only whether it tried ===')
  const vRow = (member, p) => ({ member, p, reason: 'reason from ' + member })
  let selfPortCalled = false
  const selfRec = createMeetingVerdict({ clock: () => 901, send: () => { selfPortCalled = true; return { ok: true } } }).rulePropositionProbability({ verdicts: [vRow('chair', 1), vRow('m2', 1)], propositionId: 'p-self', owner: 'chair', member: 'chair' })
  has(selfRec.delivery, ['addressed', 'selfAddressed', 'recipient', 'reason'], 'the SELF case carries addressed/selfAddressed/recipient/reason')
  ok(selfRec.delivery.selfAddressed === true && selfRec.delivery.addressed === false, 'the signer owning the card is `selfAddressed:true, addressed:false` (nobody else to tell)', selfRec.delivery)
  ok(selfRec.delivery.attempted === false && selfPortCalled === false, 'no send was attempted in the self case (the mailbox refuses a self-addressed message by name), so the port was never called', { attempted: selfRec.delivery.attempted, portCalled: selfPortCalled })
  const seen = []
  const bound = createMeetingVerdict({ clock: () => 902, send: (n) => { seen.push(n); return { ok: true, id: 'm-9' } } })
  const awayRec = bound.rulePropositionProbability({ verdicts: [vRow('chair', 0), vRow('m2', 0)], propositionId: 'p-away', owner: 'm2', from: 'chair' })
  has(awayRec.delivery, ['addressed', 'selfAddressed', 'recipient', 'reason'], 'the OTHER case carries the same four fields')
  ok(awayRec.delivery.addressed === true && awayRec.delivery.selfAddressed === false && awayRec.delivery.recipient === 'm2', 'a ruling for someone else says WHO it was addressed to', awayRec.delivery)
  ok(seen.length === 1 && seen[0].to === 'm2', 'the port really received it (a field that says sent without sending would be the defect this file exists for)', seen)
  const refusedRec = createMeetingVerdict({ clock: () => 903, send: () => ({ ok: false, code: 'VMU_MAILBOX_NO_SUCH_RECIPIENT' }) }).rulePropositionProbability({ verdicts: [vRow('chair', 0)], propositionId: 'p-ref', owner: 'ghost', from: 'chair' })
  ok(refusedRec.delivery.addressed === true && refusedRec.delivery.ok === false, 'a port refusal is `addressed:true, ok:false` — an attempt happened and failed', refusedRec.delivery)
  ok(typeof refusedRec.delivery.reason === 'string' && /NOT told/.test(refusedRec.delivery.reason), 'the reason says the holder was NOT told (prose is allowed only as a supplement)', refusedRec.delivery.reason)
  ok(refusedRec.delivery.code === 'VMU_MAILBOX_NO_SUCH_RECIPIENT', 'the refusal code is carried through, not flattened to a boolean', refusedRec.delivery.code)
  const unboundRec = createMeetingVerdict({ clock: () => 904 }).rulePropositionProbability({ verdicts: [vRow('chair', 0)], propositionId: 'p-un', owner: 'm2', from: 'chair' })
  ok(unboundRec.delivery.attempted === false && unboundRec.delivery.via === null && unboundRec.delivery.ok === null, 'with NO port: nothing attempted, nothing via, and ok is null (not true) — an unbound port is not a success', unboundRec.delivery)
  ok(typeof unboundRec.delivery.note === 'string' && /NOTHING was sent/.test(unboundRec.delivery.note), 'the note says plainly that nothing was sent (the payload is complete, the channel is not ours)', unboundRec.delivery.note)
  ok(unboundRec.notice && unboundRec.notice.to === 'm2', 'the recipient is still named — on `notice.to`, so the reader learns who SHOULD have been told', unboundRec.notice && unboundRec.notice.to)

  console.log('=== E. the chair\'s override of an unmet floor is a RECORD, not a boolean ===')
  const DUE = Date.now() + 60000
  const opened = await call('vibe_v5_meeting', { member: 'chair', agenda: 'E：验证 proceed 的 overrode 记录', at: DUE })
  ok(opened && opened.ok === true, 'setup: the meeting opened', opened && (opened.code || opened.message))
  const mid = opened.meeting
  await kernel.meetings.attend({ meeting: mid, member: 'chair' })
  const st1 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st1 && st1.quorum && Number(st1.quorum.required) >= 2, 'setup: the floor really is above what is present (otherwise nothing is overridden)', st1 && st1.quorum)
  const swept = kernel.meetings.sweepDue({ at: DUE + 1000 })
  ok(swept && Array.isArray(swept.transitions) && swept.transitions.length > 0, 'setup: the due-clock pass moved the meeting off scheduled', swept)
  const st2 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st2 && st2.state === 'waiting', 'setup: the meeting is now waiting (proceed is only legal there)', st2 && st2.state)
  const proceeded = await call('vibe_vmu_meeting', { action: 'proceed', id: mid, actor: 'chair', why: 'E：验证越权记录', at: DUE + 2000 })
  ok(proceeded && proceeded.ok === true, 'setup: proceed succeeded (proceeding IS the chair\'s authority act)', proceeded && (proceeded.code || proceeded.message))
  ok(proceeded.overrodeQuorum === true, 'the boolean still says the floor was not met', proceeded.overrodeQuorum)
  has(proceeded.overrode, ['by', 'rule', 'floor', 'present', 'waitedMs'], 'the receipt carries `overrode{by, rule, floor, present, waitedMs}` — WHICH rule and WHO')
  ok(proceeded.overrode && proceeded.overrode.by === 'chair', 'the override names the actor', proceeded.overrode)
  ok(proceeded.overrode && typeof proceeded.overrode.rule === 'string' && /proceed/i.test(proceeded.overrode.rule), 'the override names the rule that authorised it', proceeded.overrode && proceeded.overrode.rule)

  console.log('')
  console.log('=== F. the due-clock pass is READABLE on both faces ===')
  const svcStatus = kernel.meetings.status()
  has(svcStatus.sweep, ['ran', 'at', 'swept', 'transitions', 'note'], 'meetings.status() reports `sweep{ran, at, swept, transitions, note}`')
  ok(svcStatus.sweep.ran === false || typeof svcStatus.sweep.at === 'number', 'before any pass `ran:false` and no instant is invented', svcStatus.sweep)
  const pass = kernel.meetings.sweepDue({ at: Date.now() })
  ok(pass && typeof pass.swept === 'number' && Array.isArray(pass.transitions) && typeof pass.note === 'string', 'the pass itself answers swept/transitions/note', pass)
  const svcAfter = kernel.meetings.status()
  ok(svcAfter.sweep.ran === true, 'after a pass the service says `ran:true` (the memory is real, not a stub)', svcAfter.sweep)
  ok(svcAfter.sweep.at === pass.at && svcAfter.sweep.swept === pass.swept, 'the remembered pass is the one that just ran', svcAfter.sweep)
  const meetStatus = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  has(meetStatus.sweep, ['ran', 'at', 'swept', 'transitions', 'note'], 'the meeting FACE relays the same `sweep` object')
  const overview = await call('vibe_v5_overview', { member: 'chair' })
  has(overview.sweep, ['ran', 'at', 'swept', 'transitions', 'note'], 'the pack overview relays it too (a caller must not have to guess which face answers)')
  ok(overview.sweep.at === pass.at, 'both faces report the SAME pass (one memory, two readers)', { overview: overview.sweep.at, pass: pass.at })

  console.log('')
  console.log('=== B2. the PACK face reads the kernel delivery instead of rewriting it ===')
  const w = (member, label) => call('vibe_v5_record_proposition', { member, statement: '占位命题 ' + label, value: 'v', motive: 'm', p: 0.5 })
  const cardSelf = await w('chair', 'b2-self')
  const cardOther = await w('m2', 'b2-other')
  ok(cardSelf && cardSelf.ok === true && cardSelf.recordId !== undefined, 'setup: a card owned by the chair exists', cardSelf && (cardSelf.code || cardSelf.recordId))
  ok(cardOther && cardOther.ok === true && cardOther.recordId !== undefined && cardOther.recordId !== cardSelf.recordId, 'setup: a SECOND card owned by someone else exists (p=1 is gated, 0.5 is writable)', cardOther && (cardOther.code || cardOther.recordId))
  const mo = await call('vibe_v5_meeting', { member: 'chair', agenda: 'B2 投递形状' })
  for (const m of ['chair', 'm2']) await kernel.meetings.attend({ meeting: mo.meeting, member: m })
  const vote = (id, p, who) => [{ member: 'chair', p, reason: 'a' }, { member: 'm2', p, reason: 'b' }].map((r) => (r.member === who ? { ...r, p } : r))
  const finSelf = await call('vibe_v5_verdict_final', { member: 'chair', meeting: mo.meeting, proposition_id: cardSelf.recordId, verdicts: vote(cardSelf.recordId, 1, 'm2') })
  ok(finSelf && finSelf.ok === true, 'the chair can sign a ruling on a card he owns', finSelf && (finSelf.code || finSelf.message))
  ok(finSelf.delivery && finSelf.delivery.selfAddressed === true && finSelf.delivery.attempted === false, 'the SELF ruling is short-circuited: selfAddressed true, nothing attempted', finSelf.delivery)
  ok(finSelf.delivery.ok === true, 'a self ruling is NOT a delivery failure (the pre-fix receipt said ok:false, code VMU_INVALID_ARGUMENT)', finSelf.delivery && { ok: finSelf.delivery.ok, code: finSelf.delivery.code })
  ok(finSelf.deliveryContradiction === false, 'the pack reports no contradiction (it may not paper over one either)', finSelf.deliveryContradiction)
  ok(Array.isArray(finSelf.notified) && finSelf.notified.includes('chair'), 'the owner counts as told — the receipt IS the notice', finSelf.notified)
  const finOther = await call('vibe_v5_verdict_final', { member: 'chair', meeting: mo.meeting, proposition_id: cardOther.recordId, verdicts: vote(cardOther.recordId, 1, 'm2') })
  ok(finOther && finOther.ok === true, 'the chair can sign a ruling on somebody else\'s card', finOther && (finOther.code || finOther.message))
  ok(finOther.delivery && finOther.delivery.addressed === true && finOther.delivery.selfAddressed === false && finOther.delivery.recipient === 'm2', 'a ruling for ANOTHER owner is addressed to that owner', finOther.delivery)
  ok(finOther.delivery.attempted === true && finOther.delivery.ok === true, 'the mailbox face really took it (ok:true, attempted:true)', finOther.delivery && { attempted: finOther.delivery.attempted, ok: finOther.delivery.ok })
  ok(Array.isArray(finOther.notified) && finOther.notified.includes('m2'), 'the other owner is named as told', finOther.notified)

  console.log('=== C. the report refusal states its three delivery facts ===')
  const decl = await call('vibe_vmu_report', { action: 'declarations' })
  ok(decl && decl.ok === true, 'setup: the report face answers declarations', decl && (decl.code || decl.message))
  const names = Array.isArray(decl.items) ? decl.items.map((d) => d && d.name).filter((n) => typeof n === 'string') : []
  ok(names.length > 0, 'setup: at least one report name is declared for this boot (otherwise there is nothing to emit)', decl && Object.keys(decl))
  const emitted = await call('vibe_vmu_report', { action: 'emit', name: String(names[0]) })
  const refusal = emitted && emitted.ok === false ? emitted : null
  if (refusal) {
    has(refusal, ['drives', 'neverDrives', 'transportInjected'], 'a REFUSED emit states drives / neverDrives / transportInjected')
    ok(refusal.drives === false, '`drives` is false: the report never drives the conversation', refusal.drives)
    ok(refusal.neverDrives === true, '`neverDrives` is true (the same fact, named positively)', refusal.neverDrives)
    ok(typeof refusal.transportInjected === 'boolean', '`transportInjected` is a boolean, not prose', refusal.transportInjected)
  } else {
    ok(emitted && emitted.ok === true && emitted.delivery !== undefined, 'a DELIVERED emit reports `delivery` instead (one of the two outcomes must be machine-visible)', emitted && Object.keys(emitted))
  }

  console.log('')
  console.log('=== VMU RECEIPT SHAPES: ' + passed + ' passed, ' + failures.length + ' failed ===')
  for (const f of failures) console.log('  FAIL ' + f)
} finally {
  try { await rm(root, { recursive: true, force: true, maxRetries: 3 }) } catch { /* the assertion result matters, not the temp cleanup */ }
}
process.exit(failures.length ? 1 : 0)
