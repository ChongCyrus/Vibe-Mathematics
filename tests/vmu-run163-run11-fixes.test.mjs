#!/usr/bin/env node
// tests/vmu-run163-run11-fixes.test.mjs — ★ RUN 163：第十一次真机跑（tarball `6461fb16`，jsonl
// `full-1031-125611.jsonl`，代理没交报告文件，反馈在记录库 `kind:'feedback'` 卡 rec-297..rec-300 里）
//
// 四张卡各是一条真缺陷，本轮逐条修：
//   rec-297（机制·规则 47）人数闸的分母曾是「本场名册 ∩ 可投票席位」⇒ 主席少邀人就能把门槛从 2 降到 1，
//     `VMU_MEETING_QUORUM_LOST` 在 3 席所里按算术不可达。修法：`quorumFloorSource:"universe"` 时分母是
//     **在册可投票席位**（`universeSource:"institute"`），另报 `invitedEligible`（旧口径）以便对照。
//   rec-298（机制）`vmu.records.head.maxItems` 曾在构造期只读一次 ⇒ `vibe_v5_set` 回执说 appliesAt:"next turn"
//     而 put 照样拒 200/200，论文子系统整轮不可用。修法：**写时热读**（`headMaxItemsNow()`），并把构造期快照
//     单独报成 `headMaxItemsAtStart`，拒绝语的 hint 明说「写时读、下一次 put 就生效」。
//   rec-299（提示词/工具面）`order` 是只读的，却接受 `member`/`members` 并**静默丢弃**；`VMU_FLOOR_OUT_OF_ORDER`
//     的 hint 还把主席指向 `action:"order"`（做不到重排）。修法：`order` 见 member/members 具名拒并给出可达路径
//     （`invite {members:[…]}` 写队列 / `flow`·`overrideorder` 改模式，需部署声明 `vmu.meetings.orderMode`）；
//     kernel 的 hint 同步改口径。
//   rec-300（同一事实两个面）`procedureProgress.queued` 被读成「还在等的人数」。修法：`queued` 明说它是**队列原始
//     长度**（含未在场者），新增 `waitingNow`（在场且能轮到的人数）、`queuedAbsent`/`queuedAbsentList`。
//
// Run: node tests/vmu-run163-run11-fixes.test.mjs
// Last line: === RUN 163 RUN-11 FIXES: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const RECORDS = join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')
const MEETING_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js')
const PACK_TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const MEETINGS_SRC = readFileSync(MEETINGS, 'utf8')
const RECORDS_SRC = readFileSync(RECORDS, 'utf8')
const MEETING_TOOL_SRC = readFileSync(MEETING_TOOL, 'utf8')
const PACK_TOOLS_SRC = readFileSync(PACK_TOOLS, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const entry = await import(ENTRY)
const roots = []
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null }
  }
}
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run163-'))
  roots.push(root)
  process.chdir(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get() { return undefined },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  return { handle, specs: state.specs, kernel: handle.kernel }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：四条修法各在自己该在的位置上（不是文档承诺）')
{
  ok(/universeSource: capUniverse\.instituteSeats == null \? capUniverse\.universeSource : 'institute'/.test(MEETINGS_SRC)
    && /const institute = list\.filter\(Boolean\)\.filter/.test(MEETINGS_SRC)
    && /const voteNeed = K\.quorumCap > 0/.test(MEETINGS_SRC),
    '(0) rec-297：`quorumFloorSource:"universe"` 的分母是**在册可投票席位**（`universeSource:"institute"`）', null)
  ok(/invitedEligible/.test(MEETINGS_SRC) && /invitedEligible: capUniverse\.invitedEligible/.test(MEETINGS_SRC)
    && /effective: voteNeed/.test(MEETINGS_SRC),
    '(0) rec-297：旧口径（本场名册 ∩ 可投票席位）改名 `invitedEligible` 仍可读，两个数可对照', null)
  ok(/const headMaxItemsNow = \(\) => nat\(sget\(K\.headMaxItems\)/.test(RECORDS_SRC) &&
     /const headMaxItemsAtStart = headMaxItemsNow\(\)/.test(RECORDS_SRC),
    '(0) rec-298：`vmu.records.head.maxItems` 是**写时热读**（`headMaxItemsNow()`），构造期快照另报 `headMaxItemsAtStart`', null)
  ok(/read at WRITE time/.test(RECORDS_SRC), '(0) rec-298：拒绝语 hint 明说这条上限在写时读、下一次 put 就生效', null)
  ok(/action order only READS the floor queue/.test(MEETING_TOOL_SRC) &&
     /action=invite \{ id, by:"<chair>", why:"…", members:\["r-1","r-2"\] \}/.test(MEETING_TOOL_SRC),
    '(0) rec-299：`order` 见 member/members 具名拒，并给出可达路径（invite 写队列 / flow·overrideorder 改模式）', null)
  ok(/the queue is WRITTEN by invitations/.test(MEETINGS_SRC) && /action "order" only READS it back/.test(MEETINGS_SRC),
    '(0) rec-299：`VMU_FLOOR_OUT_OF_ORDER` 的 hint 不再指向做不到的重排', null)
  ok(/const waitingNow = presentSet \? queueIds\.filter/.test(MEETINGS_SRC) && /queuedAbsentList/.test(MEETINGS_SRC),
    '(0) rec-300：`procedureProgress` 增 `waitingNow` / `queuedAbsent(List)`（在场与否分开数）', null)
  ok(/RAW length of the floor queue/.test(MEETINGS_SRC), '(0) rec-300：`means` 明说 `queued` 是队列**原始长度**（不是人数）', null)
  ok(/INSTITUTE\\'s voter seats/.test(PACK_TOOLS_SRC) && /does NOT lower it/.test(PACK_TOOLS_SRC),
    '(0) rec-297：`voteFloorGate.bitesWhen` 说清分母是全院席位、少邀人不能降门槛', null)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 rec-298：把上限抬起来就真的能再写（写时热读，不需要重启）')
{
  const { kernel, specs } = await boot({ 'vmu.records.head.maxItems': 2 })
  const putOnce = (title) => {
    try { const row = kernel.records.put({ track: 'state', kind: 'decision', title, body: 'b-' + title }); return { ok: true, id: row.id } } catch (e) { return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null } }
  }
  const p1 = putOnce('q163-a')
  const p2 = putOnce('q163-b')
  ok(p1.ok === true && p2.ok === true, '(1) 上限 2 时前两条写成功（前置）', { p1, p2 })
  const p3 = putOnce('q163-c')
  ok(p3.ok === false && String(p3.code) === 'VMU_QUOTA_EXCEEDED' && /2\/2 live records/.test(String(p3.message || '')),
    '(1) 第三条被 `VMU_QUOTA_EXCEEDED` 拒（2/2）', { code: p3.code, message: p3.message })
  ok(/read at WRITE time/.test(String(p3.hint || '')) && /NEXT put/.test(String(p3.hint || '')),
    '(1) 拒绝语自己说「这条上限是写时读的，改大以后**下一次 put** 就生效」', p3.hint)
  const stBefore = kernel.records.status()
  ok(stBefore && stBefore.caps && Number(stBefore.caps.headMaxItems) === 2 && Number(stBefore.caps.headMaxItemsAtStart) === 2,
    '(1) status.caps 报 headMaxItems 与 headMaxItemsAtStart 两个数', stBefore && stBefore.caps && { now: stBefore.caps.headMaxItems, atStart: stBefore.caps.headMaxItemsAtStart })
  const raised = await call(specs, 'vibe_v5_set', { key: 'vmu.records.head.maxItems', value: 4, why: 'paper 轨满了，抬上限继续写' })
  ok(raised.ok === true, '(1) `vibe_v5_set` 抬上限成功（前置）', raised.ok === false ? raised : undefined)
  const p4 = putOnce('q163-c')
  ok(p4.ok === true, '(1) ★★ 抬上限后**同一次会话**里下一条写成功（rec-298 的整轮死锁消失）', p4)
  const stAfter = kernel.records.status()
  ok(stAfter && Number(stAfter.caps.headMaxItems) === 4 && Number(stAfter.caps.headMaxItemsAtStart) === 2,
    '(1) status 同时报「现在是 4」与「启动时是 2」——两个数分得清', stAfter && stAfter.caps && { now: stAfter.caps.headMaxItems, atStart: stAfter.caps.headMaxItemsAtStart })
  ok(/read at WRITE time/.test(String(stAfter && stAfter.caps && stAfter.caps.headMaxItemsMeans || '')),
    '(1) caps.headMaxItemsMeans 说清「写时读，下一次 put 见新数，不重启」', stAfter && stAfter.caps && stAfter.caps.headMaxItemsMeans)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 rec-299：`order` 只读 —— 传 member/members 会被具名拒，而不是静默丢弃')
{
  const { kernel, specs } = await boot({})
  for (const [id, slot] of [['r-chair', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kernel.members.hire({ id, slot })
  const conv = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: 'floor order probe', members: ['r-1', 'r-2'] })
  const meetId = String(conv.meeting || '')
  ok(conv.ok === true && meetId !== '', '(2) 会议开起来了（前置）', conv.ok === false ? conv : undefined)
  const silent = await call(specs, 'vibe_vmu_meeting', { action: 'order', id: meetId, members: ['r-2', 'r-1'] })
  ok(silent.ok === false && String(silent.code) === 'VMU_INVALID_ARGUMENT' && /only READS the floor queue/.test(String(silent.message || '')),
    '(2) ★★ 传 `members` 给 `order` ⇒ 具名拒「只读」（旧行为是 ok:true + 静默丢弃）', { code: silent.code, message: silent.message })
  ok(/action=invite/.test(String(silent.hint || '')) && /EXACTLY the given order/.test(String(silent.hint || '')),
    '(2) 拒绝语给可达路径：主席用 `invite { members:[…] }` 按给定顺序写队列', silent.hint)
  const silentSingle = await call(specs, 'vibe_vmu_meeting', { action: 'order', id: meetId, member: 'r-2' })
  ok(silentSingle.ok === false && String(silentSingle.code) === 'VMU_INVALID_ARGUMENT', '(2) 传单个 `member` 同样被拒（不是只拦数组）', silentSingle.code)
  const readOnly = await call(specs, 'vibe_vmu_meeting', { action: 'order', id: meetId })
  ok(readOnly.ok === true && Array.isArray(readOnly.order), '(2) 只读的 `order` 仍然可用（读回真实队列）', readOnly.ok === false ? readOnly : { order: readOnly.order })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 rec-300：`queued` 是队列原始长度，`waitingNow` 才是在场能轮到的人数')
{
  const { kernel, specs } = await boot({})
  for (const [id, slot] of [['r-chair', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kernel.members.hire({ id, slot })
  const conv = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: 'progress probe', members: ['r-1', 'r-2'] })
  const meetId = String(conv.meeting || '')
  const inv = await call(specs, 'vibe_vmu_meeting', { action: 'invite', id: meetId, by: 'r-chair', why: '按顺序发言', members: ['r-2', 'r-1'] })
  ok(inv.ok === true, '(3) 批量邀请成功（前置：两人进队列）', inv.ok === false ? inv : undefined)
  await call(specs, 'vibe_vmu_meeting', { action: 'attend', id: meetId, member: 'r-2' })
  const st = await call(specs, 'vibe_vmu_meeting', { action: 'status', id: meetId })
  const pp = (st && st.procedureProgress) || null
  ok(pp !== null && typeof pp === 'object', '(3) status 报 procedureProgress', st && st.code)
  ok(Number(pp.queued) === 2, '(3) `queued` = 队列原始长度 2（两人都被邀）', pp && { queued: pp.queued })
  ok(Number(pp.waitingNow) === 1, '(3) ★★ `waitingNow` = 1（只有 r-2 在场，r-1 在队列里但没到场）', pp && { waitingNow: pp.waitingNow })
  ok(Number(pp.queuedAbsent) === 1 && Array.isArray(pp.queuedAbsentList) && pp.queuedAbsentList.length === 1 && pp.queuedAbsentList[0] === 'r-1',
    '(3) `queuedAbsent`/`queuedAbsentList` 点名「在队列里但不在场」的人 = r-1', pp && { queuedAbsent: pp.queuedAbsent, list: pp.queuedAbsentList })
  ok(/RAW length of the floor queue/.test(String(pp.means || '')) && /read waitingNow/.test(String(pp.means || '')),
    '(3) `means` 说清 `queued` 不是人数、要读 `waitingNow`（同一事实不再两个面说两种话）', pp && pp.means)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 rec-297：门槛的分母是院的席位，不是本场邀请列表（负向因此可达）')
{
  const { kernel, specs } = await boot({})
  for (const [id, slot] of [['r-chair', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kernel.members.hire({ id, slot })
  const conv = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: 'narrow floor probe', members: ['r-1'] })
  const meetId = String(conv.meeting || '')
  ok(conv.ok === true && meetId !== '', '(4) 只邀 1 人的辩论会开得起来（收窄允许）', conv.ok === false ? conv : undefined)
  const q = kernel.meetings.quorum({ meeting: meetId })
  ok(String(q.voteFloor.universeSource) === 'institute' && Number(q.voteFloor.eligibleUniverse) === 3 && Number(q.voteFloor.effective) === 3,
    '(4) ★★ voteFloor（规则 L47 的表决闸）：universeSource "institute" / eligibleUniverse 3（院士+两位常驻）/ effective 3',
    { universeSource: q.voteFloor.universeSource, eligibleUniverse: q.voteFloor.eligibleUniverse, effective: q.voteFloor.effective })
  // ★ 两个数必须分开报：`required` 是**出勤闸**（受本场名册限制，2），`voteFloor.effective` 是**表决闸**（院席位，3）。
  // 合在一起的那一版会让「两席的会」在「三席的院」里永远开不了票（kernel 自己的 vmu-motion-box 套件当场红）。
  ok(Number(q.required) === Number(q.roster) && Number(q.voteFloor.effective) === 3 && Number(q.required) < 3,
    '(4) ★★ 出勤闸 required 跟着本场名册（1）与表决闸 voteFloor.effective 是院席位（3）分开报、各司其职',
    { required: q.required, voteFloor: q.voteFloor.effective, roster: q.roster })
  ok(Number(q.voteFloor.invitedEligible) === 1 && Number(q.roster) === 1,
    '(4) 同一读数里 `voteFloor.invitedEligible` 1 / `roster` 1 与 eligibleUniverse 3 并排 —— 门槛没被邀请列表拉低',
    { invitedEligible: q.voteFloor.invitedEligible, roster: q.roster })
  ok(/the INSTITUTE's voter seats \(3\)/.test(String(q.voteFloor.universeMeans || '')),
    '(4) voteFloor.universeMeans 说清分母是全院的 3 个投票席位，并指出本场只邀了 1 人', q.voteFloor.universeMeans)
  await call(specs, 'vibe_v5_record_proposition', { id: 'rec-q-163', statement: 'narrow floor probe', value: 'claim', member: 'r-1', motive: 'negative floor evidence', p: 0.6 })
  const lost = await call(specs, 'vibe_v5_verdict_final', { meeting: meetId, proposition_id: 'rec-q-163', owner: 'r-1', verdicts: [{ member: 'r-1', p: 1, reason: 'only voice' }] })
  ok(lost.ok === false && String(lost.code) === 'VMU_MEETING_QUORUM_LOST',
    '(4) ★★ 负向可达：签 2 / 需 3 ⇒ `VMU_MEETING_QUORUM_LOST`（rec-297 的核心判据）', { code: lost.code, message: String(lost.message || '').slice(0, 160) })
}

console.log('')
console.log('=== RUN 163 RUN-11 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('FAILED :: ' + f); process.exit(1) }
