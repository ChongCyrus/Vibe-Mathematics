// vibe-math-vmu —— v5r 的"动议 ⇒ 开箱"政策（packs/v5r/middleware/motion-box.js）常驻断言。
// 运行：`node tests/vmu-motion-box.test.mjs`（末行 `=== VMU MOTION BOX: N passed, M failed ===`）。
//
// 为什么这套测试存在（轮 13 / task-97 收尾）：R12 的"开火探针"是**仓库外**跑的（`D:\_tmp`）——按本仓纪律
// "**能跑** ≠ **被守住**"，它必须在仓内被常驻守住。四段：
//   ① 纯函数（选项词表／问题文案／绑定查表）；
//   ② 真 pack 装载 ⇒ 会议里提出动议 ⇒ 中间件**真被调**、**箱子真的存在**、绑定**真被设上**（source='method'）；
//   ③ 投票 ⇒ **真的镜像进那个箱**（`receipt.receipt.ballot.mirrored === true`，boxId 是政策选的那个）；
//   ④ 反向：解绑 ⇒ 具名 `VMU_MEETING_BOX_UNWIRED`；**未装该政策的装配** ⇒ 不开箱、也不假装。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as entryMod from '../vibe-math-vmu/vibe-math-vmu.js'
import { MOTION_BOX_OPTIONS, motionBoxQuestion, boxForMeetingMotion, V5R_MOTION_BOX } from '../vibe-math-vmu/packs/v5r/middleware/motion-box.js'
import * as meetingsMod from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}
const fakeCtx = () => ({ effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } })
// Windows keeps the store's handle open, so cleanup is BEST EFFORT: a locked temp dir must not turn a green suite red.
const cleanup = async (dir) => { try { await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* the temp dir stays */ } }
const loadPack = async (root, extra = {}) => {
  const handle = entryMod.apply(fakeCtx(), Object.assign({ clock: () => 1000, root, packs: ['v5r'], 'vmu.packs.active': ['v5r'] }, extra))
  await handle.ready()
  return handle
}

// ---- 1. the declared shape and the pure policy ---------------------------------------------------
ok(V5R_MOTION_BOX.meta && V5R_MOTION_BOX.meta.id === 'v5r.motion-box' && Number.isInteger(V5R_MOTION_BOX.meta.apiVersion),
  'M1. the module declares meta { id, apiVersion } (the loader validates it)', V5R_MOTION_BOX.meta)
ok(Array.isArray(V5R_MOTION_BOX.capabilities) && V5R_MOTION_BOX.capabilities.includes('trigger-workflow'),
  'M2. and it declares the capability that unlocks the service seam', V5R_MOTION_BOX.capabilities)
ok(Object.keys(V5R_MOTION_BOX.hooks).length === 1 && typeof V5R_MOTION_BOX.hooks['meeting/motion'] === 'function',
  'M3. its one hook is `meeting/motion` (the MEETING motion - the id the mirror asks about), not `motion/propose`',
  Object.keys(V5R_MOTION_BOX.hooks))
ok(MOTION_BOX_OPTIONS.length === 2 && MOTION_BOX_OPTIONS.every((o) => typeof o === 'string'),
  'M4. the option pair is this pack\'s own POLICY (not a v5r constant) and is a 2-option ballot', MOTION_BOX_OPTIONS)
ok(motionBoxQuestion({ motion: 'mo1' }) === 'Motion mo1?', 'M5. without a text the question names the motion id (never `undefined`)', motionBoxQuestion({ motion: 'mo1' }))
ok(motionBoxQuestion({ motion: 'mo1', text: '  adopt the thing  ' }) === 'adopt the thing',
  'M6. and once the text reaches this hook (reader-a R13) the question is the motion\'s own words', motionBoxQuestion({ motion: 'mo1', text: '  adopt the thing  ' }))
ok(boxForMeetingMotion({ meeting: 'm1', motion: 'mo1', value: 1 }) === null,
  'M7. an unmapped motion returns null - the NAMED VMU_MEETING_BOX_UNMAPPED case, not a guess', boxForMeetingMotion({ meeting: 'm1', motion: 'mo1' }))

// ---- 2/3. through the REAL pack load -------------------------------------------------------------
const root = await mkdtemp(join(tmpdir(), 'vmu-motion-box-'))
const handle = await loadPack(root)
const k = handle.kernel

const meeting = k.meetings.open({ chair: 'c1', actor: 'c1', roster: ['c1', 'm1', 'm2'] }).meeting
// ★★ ROUND 13 (A1 aftermath): SEAT THE FIXTURE - AND SAY WHY. This suite used to pass with ids that were NEVER on
// the roster, because the meetings face had no `members` seam at all: `isMember()` was vacuously true (no seam ⇒
// accepts everyone), so `motion({member:'m1'})` "worked". A1 wired the seam into the assembly (kernel/index.js) and
// the same call now refuses `VMU_NOT_MEMBER` - the guard got teeth and the fixture was the thing that was wrong.
// The fix is to hire the ids the fixture talks about, never to relax the guard (that would re-create the false green).
ok(k.members !== null, 'B0. the v5r pack declared role slots (a roster service exists - the fixture must seat into it)')
await k.members.hire({ id: 'c1', slot: 'chair' })
await k.members.hire({ id: 'm1', slot: 'member' })
await k.members.hire({ id: 'm2', slot: 'member' })
ok(k.members.roster().filter((m) => m.state === 'live').length === 3,
  'B0b. and every id this suite addresses is really LIVE on that roster (c1 chair, m1/m2 members)', k.members.roster().map((m) => m.id + ':' + m.slot))
// ★★ ROUND 17 (the pack now declares quorumFloorSource="universe"): the vote floor is min(用户设置数, 院士+常驻) = 3 in a
// three-seat institute, and 「未到齐则法定人数不成立」 means ONE voice cannot open a vote at all. This suite is about the
// 动议⇒开箱 policy, not about the floor, so the fixture SEATS EVERYONE before it votes - the same correction (and the same
// reason) as the v5r-tools fixture: never relax the guard, make the fixture a real house.
for (const id of ['c1', 'm1', 'm2']) k.meetings.attend({ meeting, member: id })
ok(k.meetings.quorum({ meeting }).met === true, 'B0c. the fixture house really has its quorum (floor = 院士+常驻)', k.meetings.quorum({ meeting }).required)
const moved = k.meetings.motion({ meeting, member: 'm1', kind: 'ordinary', text: 'convene a vote' })
const motion = moved.motion
await new Promise((r) => setTimeout(r, 60))

ok(motion !== undefined, 'B1. a motion was moved on the real meetings face', moved)
ok(k.ballotbox.status().boxes === 1, 'B2. STEP 2 - the middleware really OPENED A BOX for it (boxes === 1)', k.ballotbox.status().boxes)
const binding = k.meetings.status().boxBinding
ok(binding && binding.bound === true && binding.source === 'method',
  'B3. and it BOUND the boxFor seam itself (source="method": the module set it, the kernel did not)', binding)
const mapped = boxForMeetingMotion({ meeting, motion, value: 1, member: 'm2' })
ok(mapped && typeof mapped.boxId === 'string' && mapped.value === 1 && mapped.by === 'm2',
  'B4. the bound lookup answers with {boxId, value, by} for THIS meeting+motion', mapped)

const vote = k.meetings.vote({ meeting, member: 'm2', motion, value: 1 })
const mirror = vote.receipt && vote.receipt.ballot
ok(mirror && mirror.mirrored === true && mirror.reason === 'cast',
  'B5. STEP 3 - the vote really MIRRORED into the policy\'s box (end to end)', mirror)
ok(mirror && mapped && mirror.boxId === mapped.boxId,
  'B6. and into THAT box (the policy\'s boxId, not a guess)', { got: mirror && mirror.boxId, want: mapped && mapped.boxId })
// B5b (round 14 / task-107): SEPARATE THE RECEIPT FROM THE FACT. B5/B6 read only the receipt the vote returned, and a
// receipt that says `mirrored:true` is evidence of a CLAIM, not of a vote. Read the BOX itself, through its own ruling,
// and require the ballot to be there - the reading `vmu-core2` measured on the real machine (its probe, 18/0).
const boxId = (mirror && mirror.boxId) || (mapped && mapped.boxId)
const sealed = k.ballotbox.close({ boxId })
const seats = (sealed.detail || []).filter((d) => d.by === 'm2' && String(d.choice) === '1').length
ok(seats === 1 && sealed.tally && sealed.tally.cast === 1,
  'B5b. the BOX ITSELF holds that vote - read from the box ruling, independently of the receipt that claimed it',
  { boxId, detail: sealed.detail, tally: sealed.tally, code: sealed.code })

// the hook must NOT be the institute-wide governance motion (that was the round-12 mismatch)
const govSeen = []
k.bus.on({ id: 'probe-gov', kind: 'module', on: ['motion/propose'], failure: 'open', capabilities: ['record'] },
  async (ev) => { govSeen.push(ev) })
k.governance.motion.propose({ kind: 'ordinary', text: 'institute-wide', by: 'm1' })
await new Promise((r) => setTimeout(r, 40))
ok(govSeen.length === 1, 'B7. the governance motion DOES fire `motion/propose` (so the two faces are genuinely distinct)', govSeen.length)
ok(k.ballotbox.status().boxes === 1, 'B8. and it opened NO extra box (the policy is scoped to MEETING motions)', k.ballotbox.status().boxes)

// ---- 4. the reverse: unbinding is named, re-arming is the policy's own doing, and a policy-less
//         assembly invents nothing -----------------------------------------------------------------
// Move a motion FIRST (the policy binds), THEN unbind: a vote on that existing motion must be named-unwired -
// nothing re-binds behind our back, because no new `meeting/motion` fires.
const m2 = k.meetings.open({ chair: 'c1', actor: 'c1', roster: ['c1', 'm1'] }).meeting
for (const id of ['c1', 'm1']) k.meetings.attend({ meeting: m2, member: id })
const mo2 = k.meetings.motion({ meeting: m2, member: 'm1', kind: 'ordinary', text: 'bound first' }).motion
await new Promise((r) => setTimeout(r, 40))
ok(k.meetings.status().boxBinding.bound === true, 'R1. the policy bound again on the new meeting motion (idempotent lazy bind)', k.meetings.status().boxBinding)
k.meetings.bindBox(null)
ok(k.meetings.status().boxBinding.bound === false, 'R2. an explicit unbind really unbinds (the seam is the kernel\'s, not the pack\'s)', k.meetings.status().boxBinding)
const v2 = k.meetings.vote({ meeting: m2, member: 'm1', motion: mo2, value: 1 })
ok(v2.receipt.ballot.code === 'VMU_MEETING_BOX_UNWIRED' && v2.receipt.ballot.reason === 'no-binding',
  'R3. so the vote on the EXISTING motion is NAMED-unwired (no box invented, no silent success)', v2.receipt.ballot)
// ★★★ THE TALLY MUST NAME ITS SOURCE, INCLUDING WHEN IT FALLS BACK (#29). Measured while auditing the ballot vote-right
// enforcement: meetings.js tallyOf() returned the meeting's own mo.votes count with NO `source` whenever the box was missing,
// unusable or empty, while the box path carried source:'box'. So a reader could not tell "the box was consulted and had nothing"
// from "there is no box" - and when the vote-right test REFUSES a ballot the vote never reaches the box, so that silent fallback is
// exactly where an enforcement bypass would hide. RIGHT HERE the seam is unbound (R2) and v2 was still recorded in mo.votes, so the
// tally MUST name the fallback instead of reporting a bare {for, against, abstain}.
// WHAT THIS DOES NOT COVER, named rather than implied: the 'box-empty' and 'box-status-unreadable' branches are still UNTESTED.
{
  const s = k.meetings.summary({ meeting: m2 })
  // ★ THE TALLY LIVES ON THE MOTION ROW, NOT ON THE SUMMARY ROOT (measured: summary keys are
  // ok,id,meeting,kind,state,reason,chair,secretary,motions,votes,closedAt - there is no summary.tally).
  // My first version of this assertion read summary.tally and went red for the RIGHT reason: the reader-facing path was wrong.
  const row = ((s && s.motions) || []).filter((x) => x && x.id === mo2)[0]
  const tally = row && row.tally
  ok(tally && tally.source === 'meeting',
    '★★ the tally NAMES its source when it falls back (source:"meeting", not absent) - a silent fallback is where an enforcement bypass hides',
    tally)
  ok(tally && tally.fallback === 'no-box-binding',
    '★★ and it names WHY (fallback:"no-box-binding") - the reader is told which branch was taken, not just that a number exists',
    tally)
  ok(tally && tally.for === 1,
    '★ the fallback still carries the real count (the one vote in mo.votes), so naming the source did not lose the data',
    tally)
}
// and the pack's own policy re-arms on the NEXT motion - that is the lazy bind doing its job, stated as such
const mo3 = k.meetings.motion({ meeting: m2, member: 'm1', kind: 'ordinary', text: 're-armed' }).motion
await new Promise((r) => setTimeout(r, 40))
ok(k.meetings.status().boxBinding.bound === true, 'R4. the next motion RE-ARMS the policy (lazy bind, by design - not a hidden rebind)', k.meetings.status().boxBinding)
const v3 = k.meetings.vote({ meeting: m2, member: 'm1', motion: mo3, value: 1 })
ok(v3.receipt.ballot.mirrored === true, 'R5. and that new motion\'s vote mirrors again', v3.receipt.ballot)
await cleanup(root)

const bare = await mkdtemp(join(tmpdir(), 'vmu-motion-box-bare-'))
const noPolicy = entryMod.apply(fakeCtx(), { clock: () => 1000, root: bare, packs: [] })
await noPolicy.ready()
const nk = noPolicy.kernel
const nm = nk.meetings.open({ chair: 'c1', actor: 'c1', roster: ['c1', 'm1'] }).meeting
for (const id of ['c1', 'm1']) nk.meetings.attend({ meeting: nm, member: id })
const nmo = nk.meetings.motion({ meeting: nm, member: 'm1', kind: 'ordinary', text: 'no pack at all' }).motion
await new Promise((r) => setTimeout(r, 40))
ok(nk.ballotbox.status().boxes === 0, 'R2. an assembly with NO policy opens NO box (nothing pretends)', nk.ballotbox.status().boxes)
const nv = nk.meetings.vote({ meeting: nm, member: 'm1', motion: nmo, value: 1 })
ok(nv.receipt.ballot.mirrored === false && nv.receipt.ballot.reason === 'no-binding',
  'R3. and its vote is reported as unbound BY NAME (no silent success)', nv.receipt.ballot)
await cleanup(bare)

// ★★★ THE FOUR FALLBACK BRANCHES OF THE MOTION TALLY, UNIT-LEVEL (docs §7.11). Through the PUBLIC face these are unreachable:
// the pack's motion-box middleware lazily rebinds on every motion, so a hand-set binding to a bogus box id was overwritten before the
// tally ran (measured). So the logic was exported as `tallyOfMotion` and is driven here with fakes - one case per branch, and the happy
// path too, so "always falls back" cannot pass either.
{
  const mo = { id: 'mo-x', votes: new Map([['m1', 1]]), abstain: new Set() }
  const noBallot = null
  const unreadable = { status: () => ({ ok: false }) }
  const emptyBox = { status: () => ({ ok: true, byChoice: { '1': 0, '0': 0 }, abstain: 0 }) }
  const fullBox = { status: () => ({ ok: true, byChoice: { '1': 2, '0': 1 }, abstain: 3 }) }
  const cases = [
    ['no box seam at all', { meetingId: 'm', mo, boxFor: null, ballot: noBallot }, 'no-box-binding'],
    ['the seam answers no box id', { meetingId: 'm', mo, boxFor: () => null, ballot: unreadable }, 'motion-has-no-box'],
    ['the box id is unreadable', { meetingId: 'm', mo, boxFor: () => 'bx-gone', ballot: unreadable }, 'box-status-unreadable'],
    ['the box is readable but holds no votes', { meetingId: 'm', mo, boxFor: () => 'bx-empty', ballot: emptyBox }, 'box-empty'],
  ]
  for (const [label, args, want] of cases) {
    const r = meetingsMod.tallyOfMotion(args)
    ok(r && r.source === 'meeting' && r.fallback === want,
      '★★ ' + label + ' ⇒ source:"meeting" + fallback:"' + want + '" (named, never a bare tally)', r)
    ok(r && r.for === 1,
      '★ ' + label + ' ⇒ the fallback still carries the meeting\'s own count (for:1), so naming did not lose the vote', r)
  }
  // ★ THE HAPPY PATH: a readable box with votes must be USED, not fallen back to. Without this, "always report a fallback" would pass.
  const used = meetingsMod.tallyOfMotion({ meetingId: 'm', mo, boxFor: () => 'bx-full', ballot: fullBox })
  ok(used && used.source === 'box' && used.boxId === 'bx-full' && used.for === 2 && used.against === 1 && used.abstain === 3,
    '★★ a READABLE box with votes is used (source:"box", the box\'s own counts) - the fallbacks are a last resort, not the default', used)
}
console.log('=== VMU MOTION BOX: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
