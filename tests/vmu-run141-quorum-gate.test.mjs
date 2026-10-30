#!/usr/bin/env node
/**
 * ★★★ AUDIT 10 / GAP G2 — THE DEBATE'S OWN VOTE FLOOR, ENFORCED AT THE RULING (rule L47).
 *
 * The rule says 「辩论、结题的表决人数至少要达到 min(用户设置数量, 院士+常驻研究员人数)」. Audit 9 found the DEBATE half had
 * no gate anywhere: `vibe_v5_verdict_final` PRINTED the floor (`floor.satisfiedBy`) and said in so many words that it was
 * "NOT a gate on THIS receipt", while the CLOSE rail reads no vote tally at all (it checks the chair, the previous
 * minutes and the action items). A number beside `ok:true` that the face itself disclaims is what run 30's own report
 * called "the framework skipped a check it promised".
 *
 * Two facts shape the gate, and both are measured here rather than assumed:
 *   (a) the CHAIR cannot file a ruling (vibe_v5_verdict refuses VMU_RULING_CHAIR_SIGNS) and verdict_ask does not ask it
 *       ("presides") — so a normal debate of m seats files m-1 numbers and `n >= m` was false BY CONSTRUCTION. The gate
 *       therefore counts SIGNATURES: the members whose number is in the tally PLUS the chair, who signs.
 *   (b) `partial:true` stays the declared exception (the same word the missing-member rail already uses): the chair may
 *       rule below the floor ON THE RECORD, and the receipt then says `floor.gate.escapedBy:"partial"`.
 *
 * ★ THE FLOOR IS READ FROM `kernel.meetings.quorum()`, WHOSE UNIVERSE IS THE MEETING'S OWN ROSTER (the whole live bench
 * at convene time unless narrowed). That is why each positive/negative case gets its own institute: the roster is a
 * carried fact, not a live query, so adding a seat AFTER the convene cannot change this meeting's floor (and the suite
 * pins that too — §2 前置).
 *
 * WHAT THIS SUITE PINS
 *   §0 零机制：no pack ⇒ no ruling face.
 *   §1 正：chair + one member (m = 2) ⇒ the chair's ruling SUCCEEDS and `floor.gate` says signed=2/required=2,
 *        `satisfiedBy:true` — the structural fix (the chair's signature counts) is what makes a well-run meeting pass.
 *   §2 反：a three-seat institute ⇒ m = 3; a ruling signed by only 2 is REFUSED BY NAME (`VMU_MEETING_QUORUM_LOST`),
 *        the message carries signed/required, the hint names `partial:true` and `vibe_v5_verdict_ask`, and the refusal
 *        is a refusal (no ruling receipt: no value, no notification).
 *   §3 例外：`partial:true` + `why` ⇒ the same ruling succeeds, `floor.gate.satisfied:false` + `escapedBy:"partial"`.
 *   §4 补齐：after the third seat files, the ruling succeeds on its own and the gate's `unsigned` list is empty.
 *   §5 单源：`floor.minVotes` equals `kernel.meetings.quorum({meeting}).required` (one formula, not a second copy).
 *   §6 真话：the receipt no longer claims the CLOSING rail enforces a vote floor (it reads no tally), and the meeting can
 *        still be CLOSED — closing is not the gate the rule's debate half needs.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENTRY = new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, actual)

const entry = await import(ENTRY.href)
const boot = async (root, config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (p) => (p && p.code ? p.code : null)
const textOf = (p) => (p ? String(p.message || '') + ' ' + String(p.hint || '') : '')
const card = (b, id) => receipt(b, 'vibe_v5_record_proposition', {
  id, title: '自然数加倍', statement: '对一切自然数 n，n + n = 2 * n',
  value: true, motive: '辩论对象', p: 0.6, member: 'r-chair',
  proof_ref: 'Members/r-chair/Propos/' + id + '.md#正式证明', proof_state: 'complete',
})
const convene = (b, subject) => receipt(b, 'vibe_v5_meeting', { type: 'debate', subject, member: 'r-chair', agenda: '辩论 ' + subject })

const rootA = await mkdtemp(join(tmpdir(), 'vmu-run141-a-'))
const rootB = await mkdtemp(join(tmpdir(), 'vmu-run141-b-'))
const rootC = await mkdtemp(join(tmpdir(), 'vmu-run141-c-'))
try {
  console.log('=== 0. 零机制：没有 v5r pack 就没有裁定面 ===')
  const bare = await boot(rootA)
  ok(!bare.names.includes('vibe_v5_verdict_final'), '★★ 反(零机制)：无 pack ⇒ 无 vibe_v5_verdict_final', bare.names.length)

  console.log('=== 1. 正：两席所（m=2）——主席的签署计入 floor，正常辩论的裁定必须过 ===')
  const b1 = await boot(rootA, { packs: ['v5r'] })
  const k1 = b1.handle.kernel
  const CHAIR = 'r-chair'
  const M1 = 'r-1'
  await k1.members.hire({ id: CHAIR, slot: 'chair' })
  await k1.members.hire({ id: M1, slot: 'member' })
  const card1 = await card(b1, 'p-r141')
  ok(card1.parsed && card1.parsed.ok === true, '前置：带证明引用的命题卡写成功', card1.parsed && codeOf(card1.parsed))
  const proposition1 = card1.parsed.recordId
  const conv1 = await convene(b1, proposition1)
  ok(conv1.parsed && conv1.parsed.ok === true && typeof conv1.parsed.meeting === 'string', '前置：辩论会议开起来了', conv1.parsed && codeOf(conv1.parsed))
  const meeting1 = conv1.parsed.meeting
  eq(k1.meetings.quorum({ meeting: meeting1 }).required, 2, '前置：两席名册时 m = 2（规则 L47 的 universe 分支）')

  const ruled1 = await receipt(b1, 'vibe_v5_verdict_final', {
    meeting: meeting1, proposition_id: proposition1, member: CHAIR,
    verdicts: [{ member: M1, p: 0.6, reason: '由 2*n 的定义直接可得' }],
  })
  ok(ruled1.parsed && ruled1.parsed.ok === true,
    '★★★ 正：成员交了裁决、主席签字（1+主席 = m）⇒ 裁定成功（不再是一个结构性不可能满足的读数）',
    ruled1.parsed && (codeOf(ruled1.parsed) || ruled1.parsed.ok))
  const f1 = (ruled1.parsed && ruled1.parsed.floor) || {}
  ok(f1.satisfiedBy === true, '★★ 正：floor.satisfiedBy 真的为真（不是结构性 false）', f1.satisfiedBy)
  ok(f1.gate && f1.gate.enforced === true && f1.gate.signed === 2 && f1.gate.required === 2,
    '★★ 正：floor.gate 是「被执行过的读数」：signed=2 / required=2', f1.gate && { enforced: f1.gate.enforced, signed: f1.gate.signed, required: f1.gate.required })
  ok(f1.gate && f1.gate.escapedBy === null && Array.isArray(f1.gate.signedBy) && f1.gate.signedBy.includes(CHAIR),
    '★ 正：没有走例外（escapedBy:null），签署人里点名包含签字的院士（签名计入，不是出席计入）',
    f1.gate && { escapedBy: f1.gate.escapedBy, signedBy: f1.gate.signedBy })
  ok(f1.gate && f1.gate.chairCounted === true, '★ 正：回执承认「院士的签名计入了 m」，读者能对上 1 人交裁决 == m', f1.gate && f1.gate.chairCounted)

  console.log('=== 2. 反：误把「不能交裁决的席位」声明成投票席位（m=3）——只签 2 人必须具名拒，且什么都不写 ===')
  // 默认部署里「签署人 = 交来裁决的成员 ∪ {主席}」而 missing 闸要求辩论者全交 ⇒ 拒绝分支不可达（这是好事）。
  // 可达的正确场景是「配置错误」：把永远不能交裁决的 temp 声明进 vmu.meetings.eligibleSeats ⇒ 门槛把它计入
  // m=3，可它永远不能签 ⇒ 闸必须把配置错暴露出来，而不是记成永远 false 的干净读数。
  const b3 = await boot(rootB, { packs: ['v5r'], 'vmu.meetings.eligibleSeats': ['chair', 'member', 'temp'] })
  const k3 = b3.handle.kernel
  const M2 = 'r-2'
  const T1 = 't-1'
  await k3.members.hire({ id: CHAIR, slot: 'chair' })
  await k3.members.hire({ id: M1, slot: 'member' })
  await k3.members.hire({ id: T1, slot: 'temp' })
  const card3 = await card(b3, 'p-r141b')
  ok(card3.parsed && card3.parsed.ok === true, '前置：三席所的命题卡写成功', card3.parsed && codeOf(card3.parsed))
  const proposition3 = card3.parsed.recordId
  const conv3 = await convene(b3, proposition3)
  ok(conv3.parsed && conv3.parsed.ok === true, '前置：三席所的辩论会议开起来了', conv3.parsed && codeOf(conv3.parsed))
  const meeting3 = conv3.parsed.meeting
  const q3 = k3.meetings.quorum({ meeting: meeting3 })
  eq(q3.required, 3, '前置：把 temp 声明成投票席位后 m = 3')
  eq(q3.capUniverse, 3, '前置：universe 是 3 席（含跑不了裁决的 temp）——门槛把不可签的席位也算进 m')
  // 名册是 convene 时刻的「携带事实」：会后再雇人不会改这场的 floor（这也解释了为什么前面要分所）。
  const conv3b = await convene(b3, proposition3)
  eq(k3.meetings.quorum({ meeting: conv3b.parsed.meeting }).required, 3, '前置：第二场同所会议仍是 m = 3（floor 由名册携带）')

  const refused = await receipt(b3, 'vibe_v5_verdict_final', {
    meeting: meeting3, proposition_id: proposition3, member: CHAIR,
    verdicts: [{ member: M1, p: 0.6, reason: '只交了一个成员' }],
  })
  ok(refused.parsed && refused.parsed.ok !== true && codeOf(refused.parsed) === 'VMU_MEETING_QUORUM_LOST',
    '★★★ 反：低于 m 的裁定被具名拒 VMU_MEETING_QUORUM_LOST（不再是 ok:true + satisfiedBy:false）',
    refused.parsed && (codeOf(refused.parsed) || refused.parsed.ok))
  const rt = textOf(refused.parsed)
  ok(/signed by 2 of the 3/.test(rt), '★★ 反：拒绝句说出实际签署数与法定数（2/3），可对账', rt.slice(0, 220))
  ok(/L47/.test(rt) && /quorumCap|quorumMin/.test(rt), '★ 反：拒绝句点名规则 L47 与 floor 的设置来源（不是只给一个码）', rt.slice(0, 260))
  ok(/partial:true/.test(rt) && /vibe_v5_verdict_ask/.test(rt), '★ 反：hint 给出两条真出路（先收齐裁决 / partial:true+why）', rt.slice(0, 320))
  ok(/unsigned|no ruling yet from/.test(rt) && rt.includes(T1), '★ 反：点名谁还没交（unsigned）——这里点名的正是那个交不了裁决的 temp 席', rt.slice(0, 320))
  ok(refused.parsed.value === undefined && refused.parsed.notification === undefined,
    '反：这是拒绝，不是「部分成功」——回执里没有裁决值、没有通知状态（拒绝发生在落库/发信之前）',
    refused.parsed && { value: refused.parsed.value, notification: refused.parsed.notification })

  console.log('=== 3. 例外：partial:true + why ⇒ 主席可以在记录上低于 m 裁决 ===')
  const escaped = await receipt(b3, 'vibe_v5_verdict_final', {
    meeting: meeting3, proposition_id: proposition3, member: CHAIR, partial: true, why: '第三席今日外出，主席决定先出数并留档',
    verdicts: [{ member: M1, p: 0.6, reason: '由 2*n 的定义直接可得' }],
  })
  ok(escaped.parsed && escaped.parsed.ok === true, '★★ 例外：partial:true + why 时裁定成功（例外是声明的，不是静默的）', escaped.parsed && (codeOf(escaped.parsed) || escaped.parsed.ok))
  const f3 = (escaped.parsed && escaped.parsed.floor) || {}
  ok(f3.satisfiedBy === false && f3.gate && f3.gate.escapedBy === 'partial',
    '★★ 例外：回执同时写 satisfiedBy:false 与 floor.gate.escapedBy:"partial"——例外留在记录上',
    f3.gate && { satisfiedBy: f3.satisfiedBy, escapedBy: f3.gate.escapedBy })
  const cov3 = (escaped.parsed && escaped.parsed.coverage) || {}
  ok(cov3.partial === true && String(cov3.partialWhy || '').includes('外出'), '★ 例外：coverage 仍携带 partial 与理由', cov3.partialWhy)

  console.log('=== 4. 补齐：默认部署的三席所（没有「不能签」的席位）——两人都交 ⇒ 闸放行且 unsigned 清空 ===')
  const b4 = await boot(rootC, { packs: ['v5r'] })
  const k4 = b4.handle.kernel
  await k4.members.hire({ id: CHAIR, slot: 'chair' })
  await k4.members.hire({ id: M1, slot: 'member' })
  await k4.members.hire({ id: M2, slot: 'member' })
  const card4 = await card(b4, 'p-r141c')
  ok(card4.parsed && card4.parsed.ok === true, '前置：补齐所的命题卡写成功', card4.parsed && codeOf(card4.parsed))
  const proposition4 = card4.parsed.recordId
  const conv4 = await convene(b4, proposition4)
  ok(conv4.parsed && conv4.parsed.ok === true, '前置：补齐所的辩论会议开起来了', conv4.parsed && codeOf(conv4.parsed))
  const meeting4 = conv4.parsed.meeting
  eq(k4.meetings.quorum({ meeting: meeting4 }).required, 3, '前置：默认部署三席所 m = 3')
  const ruled4 = await receipt(b4, 'vibe_v5_verdict_final', {
    meeting: meeting4, proposition_id: proposition4, member: CHAIR,
    verdicts: [{ member: M1, p: 0.6, reason: 'a' }, { member: M2, p: 0.6, reason: 'b' }],
  })
  ok(ruled4.parsed && ruled4.parsed.ok === true, '★★ 补齐：三席都交 ⇒ 裁定成功（闸不是死路）', ruled4.parsed && (codeOf(ruled4.parsed) || ruled4.parsed.ok))
  const f4 = (ruled4.parsed && ruled4.parsed.floor) || {}
  ok(f4.satisfiedBy === true && f4.gate && f4.gate.signed === 3 && Array.isArray(f4.gate.unsigned) && f4.gate.unsigned.length === 0,
    '★ 补齐：signed=3/required=3，unsigned 为空', f4.gate && { signed: f4.gate.signed, unsigned: f4.gate.unsigned })

  console.log('=== 5. 单源：floor.minVotes 来自 kernel.meetings.quorum()，不是第二次推导 ===')
  const qNow = k4.meetings.quorum({ meeting: meeting4 })
  ok(f4.minVotes === qNow.required, '★★ 单源：receipt.floor.minVotes === kernel.meetings.quorum().required', { minVotes: f4.minVotes, required: qNow.required })

  console.log('=== 6. 真话：关会不读裁决票；会议仍然关得掉 ===')
  const closeRead = String((ruled4.parsed && ruled4.parsed.closureReading) || '')
  ok(/reads NO vote tally/.test(closeRead), '★★ 真话：回执不再声称「关会也执行同一票闸」（close() 读不到票数）', closeRead.slice(-240))
  // close 走的是内核会议面 `vibe_vmu_meeting`（pack 面的 `vibe_v5_meeting` 只负责 convene，action:close 会被
  // 具名拒「only CONVENES a meeting」——这本身就是一条真话：关会的 rails 在 service/primitive 的 close 里）。
  const closed = await receipt(b4, 'vibe_vmu_meeting', { action: 'close', id: meeting4, actor: CHAIR })
  ok(closed.parsed && closed.parsed.ok === true, '★ 真话：关会照旧可做（关会的 rails 不是规则 L47 的辩论闸）', closed.parsed && (codeOf(closed.parsed) || closed.parsed.ok))

  console.log('')
  if (failed === 0) {
    console.log('ALL PASS ' + passed + '/' + passed)
  } else {
    console.log('FAILED ' + failed + ' / ' + (passed + failed))
    for (const f of failures) console.log('  - ' + f)
    process.exitCode = 1
  }
} finally {
  // Windows 上 kernel 还持有 root 下的 watcher/fd 时 rmdir 会 EBUSY/ENOTEMPTY：清理失败不许把测试结论染红
  //（断言已经跑完；这里只吞掉清理噪声，并把失败路径打印出来以免掩盖真问题）。
  const safeRm = async (p) => { try { await rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch (e) { console.error('  note: cleanup left ' + p + ' (' + (e && e.code) + ')') } }
  await safeRm(rootA)
  await safeRm(rootB)
  await safeRm(rootC)
}
