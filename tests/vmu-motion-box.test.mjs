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
const cleanup = async (dir) => { try { await rm(dir, { recursive: true, force: true }) } catch { /* the temp dir stays */ } }
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

const meeting = k.meetings.open({ chair: 'c1', roster: ['c1', 'm1', 'm2'] }).meeting
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
const m2 = k.meetings.open({ chair: 'c1', roster: ['c1', 'm1'] }).meeting
const mo2 = k.meetings.motion({ meeting: m2, member: 'm1', kind: 'ordinary', text: 'bound first' }).motion
await new Promise((r) => setTimeout(r, 40))
ok(k.meetings.status().boxBinding.bound === true, 'R1. the policy bound again on the new meeting motion (idempotent lazy bind)', k.meetings.status().boxBinding)
k.meetings.bindBox(null)
ok(k.meetings.status().boxBinding.bound === false, 'R2. an explicit unbind really unbinds (the seam is the kernel\'s, not the pack\'s)', k.meetings.status().boxBinding)
const v2 = k.meetings.vote({ meeting: m2, member: 'm1', motion: mo2, value: 1 })
ok(v2.receipt.ballot.code === 'VMU_MEETING_BOX_UNWIRED' && v2.receipt.ballot.reason === 'no-binding',
  'R3. so the vote on the EXISTING motion is NAMED-unwired (no box invented, no silent success)', v2.receipt.ballot)
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
const nm = nk.meetings.open({ chair: 'c1', roster: ['c1', 'm1'] }).meeting
const nmo = nk.meetings.motion({ meeting: nm, member: 'm1', kind: 'ordinary', text: 'no pack at all' }).motion
await new Promise((r) => setTimeout(r, 40))
ok(nk.ballotbox.status().boxes === 0, 'R2. an assembly with NO policy opens NO box (nothing pretends)', nk.ballotbox.status().boxes)
const nv = nk.meetings.vote({ meeting: nm, member: 'm1', motion: nmo, value: 1 })
ok(nv.receipt.ballot.mirrored === false && nv.receipt.ballot.reason === 'no-binding',
  'R3. and its vote is reported as unbound BY NAME (no silent success)', nv.receipt.ballot)
await cleanup(bare)

console.log('=== VMU MOTION BOX: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
