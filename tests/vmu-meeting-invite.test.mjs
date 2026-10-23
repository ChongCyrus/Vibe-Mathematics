// tests/vmu-meeting-invite.test.mjs — PHASE 12 / D9 (lane-invite): 举手发言 / 邀请发言 / 批量指定成员按一定顺序发言 /
// 单次发言版群聊 —— on the meeting the PACK actually convenes.
//
// THE DEFECT CLASS THIS PINS (measured, not read: `docs/acceptance/conformance/lane-invite.md` §2):
//   `vibe_v5_meeting` convenes a record in the `vmu.meetings` SERVICE registry, while `tools/meeting.js` addressed the
//   PRIMITIVE registry only. So on a real boot every one of `hand` / `invite` / `invitedspeak` / `hands` answered
//   `VMU_NO_SUCH_OBJECT` for a pack-convened meeting — and the pack's own receipt note promised the opposite ("…
//   hand … use vibe_vmu_meeting { action, id } - the kernel face, which reaches the same meeting object").
//   Worse, the service starts with ONLY THE CHAIR present (`meetings.open` puts the chair in `present`) and no face
//   routed `attend`, so even `speak`/`vibe_v5_say` refused every other rostered member with `VMU_NOT_MEMBER
//   "attend() first"` — an invitation would have been pure bookkeeping with no possible speech behind it.
//
// WHAT IS ASSERTED HERE (both directions, each state READ BACK — "set" is not "in force"):
//   ① the floor of a pack-convened meeting is READABLE (`order`), and no invented state is created for it;
//   ② 举手 = a member puts ITSELF on that meeting's floor queue; a non-member is refused by the kernel's own name;
//   ③ 邀请 is a CHAIR act: the gate lives HERE because this is the only face that can see the seat (`chairs` are
//      invisible to the service's `queue()` under fifo); a member inviting on the chair's behalf is refused by name,
//      and every refusal says what a member should do instead;
//   ④ 批量按序: `members:[a,b]` puts exactly [a,b] on the queue IN THAT ORDER (a FIFO floor would otherwise hide a
//      reversed implementation) — asserted on a FRESH meeting so no earlier entry can mask the order;
//   ⑤ an invitation NEVER marks anybody present and NEVER changes the quorum (attendance is what counts);
//   ⑥ 单次发言版群聊 needs a present member: absent ⇒ the kernel's own `VMU_NOT_MEMBER "attend() first"` (text
//      untouched), then `attend` ⇒ `speak` succeeds; `invitedspeak` speaks through the service's own speech face and
//      reports `wasQueued` READ BACK from the floor, so "invited" is never faked;
//   ⑦ the PRIMITIVE registry is unchanged (hand/invite/invitedspeak/hands still work there, same codes);
//   ⑧ the pack's receipt note no longer promises a face that refuses.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = (parsed) => (parsed && parsed.code) || null
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)

// A MUTABLE clock: everything runs at t=1000 except §10, which has to move time forward to prove that a SCHEDULED
// meeting really starts (the kernel settles lazily on the next touch — there is no timer to wait for).
let NOW = 1000

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

// TEMP ROOT ON D: — this repository's rule is that scratch files never land on the C: drive (AGENTS.md §6).
const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-invite-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  const svc = kernel.meetings
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length === 3, 'setup: a chair and two members really exist (RULE E)', kernel.members.roster().map((m) => m.id))

  // The meeting the PACK convenes — this is the object every action below must really reach.
  const convened = await call(b, 'vibe_v5_meeting', { agenda: 'D9 邀请发言 / 批量按序', kind: 'sync', member: 'r-chair' })
  const mid = convened.parsed && convened.parsed.meeting
  ok(convened.parsed && convened.parsed.ok === true && typeof mid === 'string' && mid !== '',
    'setup: the pack convened a SERVICE meeting (the id comes from the pack receipt, not from a kernel call)',
    convened.parsed && { meeting: mid, code: codeOf(convened.parsed) })

  // ── ① THE FLOOR IS READABLE ─────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. THE FLOOR OF A PACK-CONVENED MEETING IS READABLE (action=order) ===')
  const order0 = await call(b, 'vibe_vmu_meeting', { action: 'order', id: mid })
  ok(order0.parsed && order0.parsed.ok === true && order0.parsed.registry === 'service',
    '★ order: 正 — the floor of a service meeting is readable through the kernel face (registry is NAMED)', order0.parsed && { registry: order0.parsed.registry, code: codeOf(order0.parsed) })
  ok(Array.isArray(order0.parsed && order0.parsed.order) && order0.parsed.order.length === 0,
    '★ the queue starts EMPTY (nobody has been ordered to speak yet)', order0.parsed && order0.parsed.order)
  ok(order0.parsed && order0.parsed.mode === 'fifo' && order0.parsed.queueOpen === true,
    '★ the floor mode/source is disclosed (fifo + open queue), not implied', order0.parsed && { mode: order0.parsed.mode, queueOpen: order0.parsed.queueOpen, source: order0.parsed.source })
  const orderUnknown = await call(b, 'vibe_vmu_meeting', { action: 'order', id: 'no-such-meeting' })
  ok(codeOf(orderUnknown.parsed) === 'VMU_NO_SUCH_OBJECT',
    '★ order: 反 — an unknown id is refused by name (and says it looked in BOTH registries)', orderUnknown.parsed && { code: codeOf(orderUnknown.parsed), message: orderUnknown.parsed.message })
  const orderNoId = await call(b, 'vibe_vmu_meeting', { action: 'order' })
  ok(codeOf(orderNoId.parsed) === 'VMU_INVALID_ARGUMENT' && /needs a meeting id/.test(String(orderNoId.parsed && orderNoId.parsed.message)),
    '★ order: 反 — no id ⇒ the refusal names the FIELD, not "undefined"', orderNoId.parsed && orderNoId.parsed.message)

  // ── ② 举手 = SELF-QUEUE ON THE SERVICE FLOOR ────────────────────────────────────────────────────────────────
  console.log('=== 2. 举手: a member puts ITSELF on the service meeting floor queue ===')
  const hand = await call(b, 'vibe_vmu_meeting', { action: 'hand', id: mid, member: 'r-1' })
  ok(hand.parsed && hand.parsed.ok === true && hand.parsed.registry === 'service',
    '★★ hand: 正 — 举手 on a PACK-CONVENED meeting succeeds (this answered VMU_NO_SUCH_OBJECT before this round)', hand.parsed && { code: codeOf(hand.parsed), registry: hand.parsed.registry })
  const order1 = await call(b, 'vibe_vmu_meeting', { action: 'order', id: mid })
  ok(Array.isArray(order1.parsed && order1.parsed.order) && order1.parsed.order.includes('r-1'),
    '★★ and the hand is REAL: the raised member now appears in the floor order (read back, not assumed)', order1.parsed && order1.parsed.order)
  ok(hand.parsed && hand.parsed.receipt && hand.parsed.receipt.by === 'r-1',
    '★ the receipt says the member queued ITSELF (by = the same member) — a hand is not an order from above', hand.parsed && hand.parsed.receipt)
  const handGhost = await call(b, 'vibe_vmu_meeting', { action: 'hand', id: mid, member: 'r-ghost' })
  ok(codeOf(handGhost.parsed) === 'VMU_NOT_MEMBER',
    '★ hand: 反 — a non-member is refused by the KERNEL\'s own code (the roster seam decides, this face adds no policy)', handGhost.parsed && { code: codeOf(handGhost.parsed), message: handGhost.parsed.message })
  const handNoId = await call(b, 'vibe_vmu_meeting', { action: 'hand', member: 'r-1' })
  ok(codeOf(handNoId.parsed) === 'VMU_INVALID_ARGUMENT',
    '★ hand: 反 — no meeting id is refused by name', handNoId.parsed && codeOf(handNoId.parsed))

  // ── ③ 邀请发言 IS A CHAIR ACT ────────────────────────────────────────────────────────────────────────────────
  console.log('=== 3. 邀请发言: only the CHAIR may invite; a member is refused by name with the way out ===')
  const inviteNoBy = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, why: '请讲一下引理 A', member: 'r-2' })
  ok(codeOf(inviteNoBy.parsed) === 'VMU_INVALID_ARGUMENT' && /needs by/.test(String(inviteNoBy.parsed && inviteNoBy.parsed.message)),
    '★★ invite: 反 — no `by` ⇒ refused by name (an invitation must be auditable: name WHO invites)', inviteNoBy.parsed && { code: codeOf(inviteNoBy.parsed), message: inviteNoBy.parsed.message })
  ok(inviteNoBy.parsed && /action=hand/.test(String(inviteNoBy.parsed.hint)),
    '★★ and the refusal tells a MEMBER what to do instead (hand oneself), not just "not allowed"', inviteNoBy.parsed && inviteNoBy.parsed.hint)
  const inviteMember = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-2', why: '我要点人', member: 'r-1' })
  ok(codeOf(inviteMember.parsed) === 'VMU_NOT_PERMITTED' && /CHAIR action/.test(String(inviteMember.parsed && inviteMember.parsed.message)),
    '★★ invite: 反 — a MEMBER may not put somebody else on the floor (the seat gate lives on this face because only it can see `chair`)', inviteMember.parsed && { code: codeOf(inviteMember.parsed), message: inviteMember.parsed.message })
  ok(inviteMember.parsed && /r-chair/.test(String(inviteMember.parsed.message)) && /r-2/.test(String(inviteMember.parsed.message)),
    '★★ the refusal NAMES both the actual chair and the actor (a caller can fix it without guessing)', inviteMember.parsed && inviteMember.parsed.message)
  const inviteNoWhy = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-chair', member: 'r-2' })
  ok(codeOf(inviteNoWhy.parsed) === 'VMU_INVALID_ARGUMENT',
    '★ invite: 反 — an invitation without a reason is refused (the v5r "must be auditable" rule)', inviteNoWhy.parsed && codeOf(inviteNoWhy.parsed))
  const inviteChair = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-chair', why: '请讲一下引理 A', member: 'r-2' })
  ok(inviteChair.parsed && inviteChair.parsed.ok === true && inviteChair.parsed.registry === 'service' &&
    Array.isArray(inviteChair.parsed.invited) && inviteChair.parsed.invited.join(',') === 'r-2',
    '★★ invite: 正 — the CHAIR invites one member and the receipt says WHO was invited (and why)', inviteChair.parsed && { invited: inviteChair.parsed.invited, why: inviteChair.parsed.why })
  ok(Array.isArray(inviteChair.parsed && inviteChair.parsed.order) && inviteChair.parsed.order.join(',') === 'r-1,r-2',
    '★★ the invited member is ON THE FLOOR QUEUE, after the self-raised hand (fifo order preserved)', inviteChair.parsed && inviteChair.parsed.order)
  ok(inviteChair.parsed && inviteChair.parsed.mode === 'fifo' && inviteChair.parsed.queueOpen === true,
    '★ and the invitation receipt discloses the floor it wrote into (mode + queueOpen)', inviteChair.parsed && { mode: inviteChair.parsed.mode, queueOpen: inviteChair.parsed.queueOpen })
  const inviteBoth = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-chair', why: 'x', member: 'r-1', members: ['r-2'] })
  ok(codeOf(inviteBoth.parsed) === 'VMU_INVALID_ARGUMENT' && /EITHER member/.test(String(inviteBoth.parsed && inviteBoth.parsed.message)),
    '★ invite: 反 — `member` and `members` are mutually exclusive (no silent preference for one)', inviteBoth.parsed && inviteBoth.parsed.message)
  const inviteEmpty = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-chair', why: 'x', members: [] })
  ok(codeOf(inviteEmpty.parsed) === 'VMU_INVALID_ARGUMENT',
    '★ invite: 反 — an EMPTY batch is refused rather than reported as a successful no-op', inviteEmpty.parsed && codeOf(inviteEmpty.parsed))
  const inviteUnknown = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: 'no-such-meeting', by: 'r-chair', why: 'x', member: 'r-1' })
  ok(codeOf(inviteUnknown.parsed) === 'VMU_NO_SUCH_OBJECT',
    '★ invite: 反 — an unknown meeting is refused by name', inviteUnknown.parsed && codeOf(inviteUnknown.parsed))

  // ── ④ 批量指定成员按一定顺序发言 ────────────────────────────────────────────────────────────────────────────
  console.log('=== 4. 批量按序: members:[b,a] must land as [b,a], asserted on a FRESH meeting ===')
  const convened2 = await call(b, 'vibe_v5_meeting', { agenda: 'D9 批量按序', kind: 'sync', member: 'r-chair' })
  const mid2 = convened2.parsed && convened2.parsed.meeting
  ok(typeof mid2 === 'string' && mid2 !== '' && mid2 !== mid, 'setup: a SECOND, fresh service meeting exists (nothing from §2/§3 can mask the order)', mid2)
  const batch = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid2, by: 'r-chair', why: '按此顺序发言', members: ['r-2', 'r-1'] })
  ok(batch.parsed && batch.parsed.ok === true && Array.isArray(batch.parsed.invited) && batch.parsed.invited.join(',') === 'r-2,r-1',
    '★★ batch: the invitation list is exactly the array given, in the order given', batch.parsed && batch.parsed.invited)
  ok(Array.isArray(batch.parsed && batch.parsed.order) && batch.parsed.order.join(',') === 'r-2,r-1',
    '★★★ 批量按序 is REAL: the FLOOR ORDER equals [r-2, r-1] — a reversed implementation could not pass this (fifo order is kept as written)', batch.parsed && batch.parsed.order)
  const order2 = await call(b, 'vibe_vmu_meeting', { action: 'order', id: mid2 })
  ok(Array.isArray(order2.parsed && order2.parsed.order) && order2.parsed.order.join(',') === 'r-2,r-1',
    '★★★ and an INDEPENDENT read of the floor agrees (the receipt was not the only witness)', order2.parsed && order2.parsed.order)
  const batchAgain = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid2, by: 'r-chair', why: '再说一次', members: ['r-2'] })
  ok(batchAgain.parsed && batchAgain.parsed.ok === true &&
    Array.isArray(batchAgain.parsed.order) && batchAgain.parsed.order.join(',') === 'r-2,r-1',
    '★ re-inviting an already queued member does not DUPLICATE the floor entry', batchAgain.parsed && batchAgain.parsed.order)
  const batchBlank = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid2, by: 'r-chair', why: 'x', members: ['r-1', ''] })
  ok(codeOf(batchBlank.parsed) === 'VMU_INVALID_ARGUMENT',
    '★ batch: 反 — a blank entry in the list is refused (never silently dropped, which would reorder the batch)', batchBlank.parsed && codeOf(batchBlank.parsed))

  // ── ⑤ AN INVITATION NEVER FORGES ATTENDANCE (and never moves the quorum) ───────────────────────────────────
  console.log('=== 5. An invitation is BOOKKEEPING: it never marks anybody present, never moves the quorum ===')
  const quorumBefore = svc.quorum({ meeting: mid2 })
  ok(quorumBefore && quorumBefore.present === 1,
    '★ precondition: the service starts with ONLY the chair present (this is the fact that made speech unreachable)', quorumBefore && { present: quorumBefore.present, roster: quorumBefore.roster })
  const invitedIds = (batch.parsed && batch.parsed.invited) || []
  ok(invitedIds.length === 2 && invitedIds.every((x) => x !== 'r-chair'),
    '★ RULE E: the batch really named two people (so the "present" count below is meaningful)', invitedIds)
  const spokenInvitedAbsent = await call(b, 'vibe_vmu_meeting', { action: 'invitedspeak', id: mid2, member: 'r-2', text: '我还没到场' })
  ok(codeOf(spokenInvitedAbsent.parsed) === 'VMU_NOT_MEMBER',
    '★★★ 正/反 pair (reversed): an INVITED but ABSENT member cannot speak — the invitation did NOT make them present', spokenInvitedAbsent.parsed && { code: codeOf(spokenInvitedAbsent.parsed), message: spokenInvitedAbsent.parsed.message })
  const quorumAfterInvite = svc.quorum({ meeting: mid2 })
  ok(quorumAfterInvite && quorumAfterInvite.present === 1,
    '★★ 反: after TWO invitations the quorum is STILL 1 (attendance is the only thing the denominator counts)', quorumAfterInvite && { present: quorumAfterInvite.present })

  // ── ⑥ 单次发言版群聊: attend ⇒ speak really works, and the invited voice reports `wasQueued` READ BACK ────
  console.log('=== 6. 单次发言版群聊: speak is refused while absent, attend makes it possible, wasQueued is read back ===')
  const speakAbsent = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid2, member: 'r-2', text: '轮到我了' })
  ok(codeOf(speakAbsent.parsed) === 'VMU_NOT_MEMBER' && /attend\(\) first/.test(String(speakAbsent.parsed && speakAbsent.parsed.hint)),
    '★★★ 反: a rostered-but-ABSENT member `speak` is refused by the kernel by name, with the kernel\'s own hint (text untouched)', speakAbsent.parsed && { code: codeOf(speakAbsent.parsed), hint: speakAbsent.parsed.hint })
  const attend = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid2, member: 'r-2' })
  ok(attend.parsed && attend.parsed.ok === true && attend.parsed.registry === 'service',
    '★★ attend: 正 — the member is marked present through the kernel face (pure delegation to `svc.attend`)', attend.parsed && { code: codeOf(attend.parsed), registry: attend.parsed.registry })
  const quorumAfterAttend = svc.quorum({ meeting: mid2 })
  ok(quorumAfterAttend && quorumAfterAttend.present === 2,
    '★★★ and the quorum REALLY changed (1 ⇒ 2): `attend` is not a label, it moves the denominator', quorumAfterAttend && { present: quorumAfterAttend.present })
  const attendGhost = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid2, member: 'r-ghost' })
  ok(codeOf(attendGhost.parsed) === 'VMU_NOT_MEMBER',
    '★ attend: 反 — a non-member is refused by the KERNEL\'s code, not by a re-worded refusal of this face', attendGhost.parsed && { code: codeOf(attendGhost.parsed), message: attendGhost.parsed.message })
  const attendUnknown = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: 'no-such-meeting', member: 'r-2' })
  ok(codeOf(attendUnknown.parsed) === 'VMU_NO_SUCH_OBJECT', '★ attend: 反 — an unknown meeting is refused by name', attendUnknown.parsed && codeOf(attendUnknown.parsed))
  const turnsBefore = (await call(b, 'vibe_vmu_meeting', { action: 'invitedspeak', id: mid2, member: 'r-1', text: '先探一下轮次' }))
  ok(turnsBefore.parsed && turnsBefore.parsed.ok === false,
    '★ 反 — r-1 is (still) absent, so the probe is refused rather than counted', turnsBefore.parsed && codeOf(turnsBefore.parsed))
  const speakNow = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid2, member: 'r-2', text: '现在我可以发言了' })
  ok(speakNow.parsed && speakNow.parsed.ok === true && typeof speakNow.parsed.turns === 'number' && speakNow.parsed.turns >= 1,
    '★★★ 正: after `attend`, the SAME member speaks successfully — the pair (refused ⇒ attend ⇒ succeeds) is pinned', speakNow.parsed && { code: codeOf(speakNow.parsed), turns: speakNow.parsed.turns })
  // A plain speech CONSUMES the floor place (the service's own rule), so the chair re-orders r-2 before the invited voice
  // check — the queue is the living floor, not a record of who was ever invited.
  const reinvite = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: mid2, by: 'r-chair', why: '请再就引理 A 讲一段', member: 'r-2' })
  ok(reinvite.parsed && reinvite.parsed.ok === true && Array.isArray(reinvite.parsed.order) && reinvite.parsed.order.includes('r-2'),
    'setup: the chair re-orders r-2 after the plain speech consumed its place', reinvite.parsed && reinvite.parsed.order)
  const invited = await call(b, 'vibe_vmu_meeting', { action: 'invitedspeak', id: mid2, member: 'r-2', text: '受邀发言：引理 A 的证明可拆两步' })
  ok(invited.parsed && invited.parsed.ok === true && invited.parsed.wasQueued === true,
    '★★ invitedspeak: 正 — the invited-and-present voice speaks, and `wasQueued` is READ BACK from the floor (true)', invited.parsed && { wasQueued: invited.parsed.wasQueued, code: codeOf(invited.parsed) })
  ok(typeof invited.parsed.turns === 'number' && invited.parsed.turns >= 2,
    '★★ and the speech really landed in the meeting (turns advanced again)', invited.parsed && { turns: invited.parsed.turns })
  const orderAfter = await call(b, 'vibe_vmu_meeting', { action: 'order', id: mid2 })
  ok(Array.isArray(orderAfter.parsed && orderAfter.parsed.order) && orderAfter.parsed.order.includes('r-2') === false,
    '★★ a speech CONSUMES the floor place: the speaker is no longer waiting in the queue (the service already does this)', orderAfter.parsed && orderAfter.parsed.order)
  // The honest read-back: a present member who was never queued gets `wasQueued:false` — the face reports the floor as it
  // is instead of inventing an invitation ledger it does not have.
  await kernel.members.hire({ id: 'r-3', slot: 'member' })
  const attend3 = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid2, member: 'r-3' })
  ok(attend3.parsed && attend3.parsed.ok === true, 'setup: a third member is present but was NEVER ordered to speak', attend3.parsed && codeOf(attend3.parsed))
  const unqueued = await call(b, 'vibe_vmu_meeting', { action: 'invitedspeak', id: mid2, member: 'r-3', text: '我没被排进队列' })
  ok(unqueued.parsed && unqueued.parsed.ok === true && unqueued.parsed.wasQueued === false,
    '★★ 反: a present member who is NOT on the floor queue speaks, and the receipt says wasQueued:false — no faked invitation ledger', unqueued.parsed && { wasQueued: unqueued.parsed.wasQueued })

  // ── ⑦ hands IS REFUSED BY NAME ON A SERVICE MEETING (nothing is faked) ─────────────────────────────────────
  console.log('=== 7. hands(grant/revoke/clear/list) on a service meeting: REFUSED BY NAME, naming the real faces ===')
  const handsSvc = await call(b, 'vibe_vmu_meeting', { action: 'hands', id: mid2, op: 'list' })
  ok(codeOf(handsSvc.parsed) === 'VMU_ENGINE_UNAVAILABLE',
    '★★ hands(service): 反 — refused by name instead of pretending the primitive queue is a hand-grant ledger', handsSvc.parsed && { code: codeOf(handsSvc.parsed), message: handsSvc.parsed.message })
  ok(handsSvc.parsed && /QUEUE/.test(String(handsSvc.parsed.message)) && /action=hand/.test(String(handsSvc.parsed.hint)) && /action=invite/.test(String(handsSvc.parsed.hint)),
    '★★ and the refusal says WHAT the service face has instead (queue; hand for self, invite for the chair)', handsSvc.parsed && { message: handsSvc.parsed.message, hint: handsSvc.parsed.hint })

  // ── ⑧ THE PRIMITIVE REGISTRY IS UNCHANGED ──────────────────────────────────────────────────────────────────
  console.log('=== 8. 回归: the PRIMITIVE meeting face still does what it did (same codes, same reads) ===')
  const primOpen = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'p-d9', agenda: '原语会议', roster: ['r-1', 'r-2'] })
  ok(primOpen.parsed && primOpen.parsed.ok === true && primOpen.parsed.id === 'p-d9',
    '★ primitive: a primitive meeting still opens (and its id is distinct from the service one)', primOpen.parsed && { code: codeOf(primOpen.parsed), id: primOpen.parsed.id })
  const primHand = await call(b, 'vibe_vmu_meeting', { action: 'hand', id: 'p-d9', member: 'r-1' })
  ok(primHand.parsed && primHand.parsed.ok === true && typeof primHand.parsed.position === 'number',
    '★ primitive hand: 正 — 举手 still returns a POSITION (the primitive face, unchanged)', primHand.parsed && { code: codeOf(primHand.parsed), position: primHand.parsed.position })
  // The primitive ledger is for somebody the ROUND does NOT ask — an already-asked member is refused by name, which is
  // exactly the semantic difference from the service queue (where the chair may order any member, asked or not).
  const primInviteAsked = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: 'p-d9', member: 'r-2', by: 'r-chair', why: 'x' })
  ok(codeOf(primInviteAsked.parsed) === 'VMU_NOT_PERMITTED',
    '★ primitive invite: 反 — a member the round ALREADY asks cannot be an "invited voice" (the ledger is for guests)', primInviteAsked.parsed && codeOf(primInviteAsked.parsed))
  const primInvite = await call(b, 'vibe_vmu_meeting', { action: 'invite', id: 'p-d9', member: 'r-3', by: 'r-chair', why: '请外部成员讲一段' })
  ok(primInvite.parsed && primInvite.parsed.ok === true && Array.isArray(primInvite.parsed.invited) && primInvite.parsed.invited.includes('r-3'),
    '★ primitive invite: 正 — the invite LEDGER still exists on the primitive face (a different mechanism, same word)', primInvite.parsed && { invited: primInvite.parsed.invited })
  const primSpeak = await call(b, 'vibe_vmu_meeting', { action: 'invitedspeak', id: 'p-d9', member: 'r-3', text: '受邀发言（原语）' })
  ok(primSpeak.parsed && primSpeak.parsed.ok === true && primSpeak.parsed.countsTowardsRound === false,
    '★★ primitive invitedspeak: 正 — recorded but does NOT count towards the round (the v5r "只记不计票" fact)', primSpeak.parsed && { countsTowardsRound: primSpeak.parsed.countsTowardsRound })
  const primHandsList = await call(b, 'vibe_vmu_meeting', { action: 'hands', id: 'p-d9', op: 'list' })
  ok(primHandsList.parsed && primHandsList.parsed.ok === true && primHandsList.parsed.registry === undefined,
    '★ primitive hands(list): 正 — readable without a chair, and it is NOT reported as a service write', primHandsList.parsed && { code: codeOf(primHandsList.parsed) })
  const primHandsGrant = await call(b, 'vibe_vmu_meeting', { action: 'hands', id: 'p-d9', op: 'grant', member: 'r-1', by: 'r-chair', why: '让他先说' })
  ok(primHandsGrant.parsed && primHandsGrant.parsed.ok === false && codeOf(primHandsGrant.parsed) === 'VMU_ENGINE_UNAVAILABLE',
    '★ primitive hands(grant): 反 — unchanged: a primitive meeting with no chair declared refuses to grant the floor', primHandsGrant.parsed && { code: codeOf(primHandsGrant.parsed) })

  // ── ⑨ THE FALSE PROMISE IS GONE (the pack note and the dispatch hint both tell the truth now) ──────────────
  console.log('=== 9. 说准: the pack\'s own receipt note and the dispatch hint describe the face that exists ===')
  const toolsSrc = await readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/hand\/invite\/invitedspeak\/order\/attend now really reach a SERVICE meeting/.test(toolsSrc),
    '★★ the pack receipt note no longer promises a face that refuses: it names the actions that really cross (D9)', null)
  ok(/silent\/end\/hands stay primitive-only/.test(toolsSrc),
    '★★ and it names the actions that do NOT cross, instead of implying "everything works through the other face"', null)
  const toolSrc = await readFile(join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
  ok(/enum: \['list', 'open', 'speak', 'silent', 'hand', 'hands', 'order'/.test(toolSrc) &&
    /'invitedspeak', 'attend', 'end'/.test(toolSrc),
    '★ the declared action enum carries the two actions that were MISSING routes (order, attend)', null)

  // ── ⑩ SCHEDULING (「院士可以预约会议的召开时间」): the pack face can now really schedule, and the state is read back ─────
  console.log('=== 10. 预约: `vibe_v5_meeting { at }` schedules; the state is READ BACK, not assumed ===')
  const iso = new Date(NOW + 600_000).toISOString()
  const sched = await call(b, 'vibe_v5_meeting', { agenda: '预约的会议（D1）', kind: 'sync', member: 'r-chair', at: iso })
  const smid = sched.parsed && sched.parsed.meeting
  ok(sched.parsed && sched.parsed.ok === true && sched.parsed.state === 'scheduled',
    '★ `at` really SCHEDULES the meeting (state comes back as scheduled, not as "opened immediately")', sched.parsed && { code: codeOf(sched.parsed), state: sched.parsed.state })
  ok(sched.parsed && typeof sched.parsed.scheduledFor === 'number' && sched.parsed.scheduledFor === Date.parse(iso),
    '★★ and `scheduledFor` is the INSTANT asked for (ISO-8601 normalised by the kernel) — the receipt is a reading, not an echo', sched.parsed && { scheduledFor: sched.parsed.scheduledFor, expected: Date.parse(iso) })
  ok(sched.parsed && typeof sched.parsed.scheduleNote === 'string' && /scheduledFor/.test(sched.parsed.scheduleNote),
    '★ and the receipt explains what a scheduled meeting can/cannot do instead of leaving it to be discovered', sched.parsed && sched.parsed.scheduleNote)
  const schedStatus = await call(b, 'vibe_vmu_meeting', { action: 'status', id: smid })
  ok(schedStatus.parsed && schedStatus.parsed.ok === true && schedStatus.parsed.state === 'scheduled' && schedStatus.parsed.registry === 'service',
    '★★ status/summary DO read a scheduled meeting (readable before it starts)', schedStatus.parsed && { code: codeOf(schedStatus.parsed), state: schedStatus.parsed.state })
  const schedSpeak = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: smid, member: 'r-chair', text: '还没到点' })
  ok(codeOf(schedSpeak.parsed) === 'VMU_STATE',
    '★★ 反: acting before the start time is refused BY NAME (the rail is the kernel\'s, this suite only proves it is reachable)', schedSpeak.parsed && codeOf(schedSpeak.parsed))
  const badAt = await call(b, 'vibe_v5_meeting', { agenda: 'x', member: 'r-chair', at: 'tomorrow morning' })
  ok(codeOf(badAt.parsed) === 'VMU_INVALID_ARGUMENT' && /tomorrow morning/.test(String(badAt.parsed.message)),
    '★★ 反: a value that is neither epoch ms nor ISO-8601 is refused by name, QUOTING the offending value (no silent "now")', badAt.parsed && { code: codeOf(badAt.parsed), message: badAt.parsed.message })
  // Time moves: the meeting that was scheduled is started BY A TOUCH (the kernel's lazy settle), and the floor opens.
  NOW = NOW + 11 * 60_000
  const afterDue = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: smid, member: 'r-1' })
  // ★ R3 (「未到齐」): the roster is three seats and only one has arrived, so the meeting that was scheduled
  // RESOLVES into `waiting`, not into `open`. This used to read `open` because the old code shared ONE number
  // (present.size) with the vote floor; the assertion now pins the rule instead of the old arithmetic.
  ok(afterDue.parsed && afterDue.parsed.ok === true && afterDue.parsed.state === 'waiting',
    '★★★ 正: after the start time a scheduled meeting RESOLVES — but only into waiting while the roster is incomplete (the rule 「未到齐则等待」)', afterDue.parsed && { code: codeOf(afterDue.parsed), state: afterDue.parsed.state, settled: afterDue.parsed.settled })
  const missing = (afterDue.parsed && afterDue.parsed.quorum && Array.isArray(afterDue.parsed.quorum.unansweredList)) ? afterDue.parsed.quorum.unansweredList : []
  ok(missing.length > 0,
    '★★ and the waiting receipt NAMES who has not arrived instead of just saying "not yet" (the missing seats are read, not assumed)', afterDue.parsed && afterDue.parsed.quorum && afterDue.parsed.quorum.unansweredList)
  let allHere = null
  for (const absent of missing) {
    allHere = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: smid, member: absent })
  }
  ok(allHere.parsed && allHere.parsed.ok === true && allHere.parsed.state === 'open',
    '★★★ 正: the last arrival completes the roster and the SAME meeting is now open — a scheduled meeting really becomes a meeting', allHere.parsed && { code: codeOf(allHere.parsed), state: allHere.parsed.state, settled: allHere.parsed.settled })
  const spoke = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: smid, member: 'r-1', text: '到点了，可以说了' })
  ok(spoke.parsed && spoke.parsed.ok === true && typeof spoke.parsed.turns === 'number' && spoke.parsed.turns >= 1,
    '★★ and the floor is genuinely open: the same act that was refused before the start time now lands in the minutes', spoke.parsed && { code: codeOf(spoke.parsed), turns: spoke.parsed.turns })

  ok(failed === 0, 'no failure was recorded', failures)
} finally {
  // The kernel keeps durable files open in some code paths; retry so cleanup never turns a green suite into a crash.
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('vmu-meeting-invite: ' + passed + ' passed, ' + failed + ' failed')
if (failures.length > 0) console.error(failures.join('\n'))
process.exitCode = failed === 0 ? 0 : 1
