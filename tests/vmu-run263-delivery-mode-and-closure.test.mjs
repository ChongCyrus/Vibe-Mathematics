#!/usr/bin/env node
/**
 * ★★★ TASK-173 / TB-2690 — TWO RECEIPTS THAT DID NOT SAY WHAT THEY READ.
 *
 * A. F75-12 `deliveryPath:"caller"` WAS UNREACHABLE IN THIS DEPLOYMENT. `createTurnDeliver` resolved the delivery mode
 *    ONCE, at construction, from config/setting; a deployment configured `subagents` could therefore never produce the
 *    caller seam, so `vibe_vmu_turn` had no way to let the CALLING session play a member turn. The 75th real run showed
 *    the consequence: 14 of 14 turns were activation/continuation and `memberWorkShare.officeRelayedActs` stayed 0.
 *    The fix is a PER-CALL argument: `deliver_mode` (op:"step"/"drive") -> `turn.deliverMode` -> the seam dispatcher,
 *    which picks the caller seam or the host bridge FOR THAT CALL only. It rewrites no construction-time config and is
 *    not persisted. The receipt names the route (`deliveryPath`) and where the mode came from
 *    (`deliverModeSource`: arg|config|setting) plus `deliverModeReason`.
 *
 * B. F75-08 THE CLOSURE BOARD DIVIDED BY THE WRONG SET. The office board printed「已投 2/5（同意 2）」while the kernel
 *    held `votesCast:4, votesTotal:4, eligible:["r-acad","r-1","r-2","r-3"]`: the denominator was `turn.rosterIds`
 *    (temp seats included) and the numerator was the local map, which a per-member-session deployment never fills.
 *    `[结题]` now reads the kernel's own `closureVote` reading (`votesCast`/`votesTotal`; the denominator is the
 *    ELIGIBLE set, `notEligible` is named and never added), and echoes `asOf`/`asOfSource` — the newest vote row's
 *    `at`, a CONTENT time, so two assemblies of the same state stay byte-identical.
 *
 * THE SEVEN REVERSE LAMPS (four for A, three for B) are the numbered sections below; each one would go RED if the
 * mechanism were reverted.
 *
 * Run: node tests/vmu-run263-delivery-mode-and-closure.test.mjs
 * Last line: === VMU RUN263 DELIVERY MODE AND CLOSURE: N passed, M failed ===
 */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const HOST_DELIVER = pathToFileURL(join(REPO, 'vibe-math-vmu', 'host-deliver.js')).href
const KERNEL_INDEX = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href
const TURN_TOOL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const has = (hay, needle, label) => ok(String(hay).includes(needle), label, { missing: needle })

const entry = await import(ENTRY)
const turnModule = await import(TURN_MODULE)
const hostDeliverModule = await import(HOST_DELIVER)
const kernelModule = await import(KERNEL_INDEX)
const turnToolSource = await readFile(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
const turnSource = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
const hostDeliverSource = await readFile(join(REPO, 'vibe-math-vmu', 'host-deliver.js'), 'utf8')

const { deliverByReturning, deliverViaSubagents, createTurnOrchestrator, closureVoteOf } = turnModule
const { createTurnDeliver } = hostDeliverModule
const { createKernel } = kernelModule

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const ROOTS = []
const bootWithEntry = async (opts = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run263-'))
  ROOTS.push(root)
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => 1000, ...opts })
  await handle.ready()
  return { kernel: handle.kernel, root, specs }
}
const memberArgs = (id) => ({ members: [{ id, role: 'member' }], phase: 'normal', why: 'run263 reverse lamp' })
const fakePrompt = { assemble: async () => ({ ok: true, text: '', sources: [], instructionDelivered: false }) }
const closureLineOf = (asm) => String((asm && asm.text) || '').split(NL).filter((l) => l.includes('[结题]'))
const statusClosureOf = (orch) => {
  const live = orch.status().liveReadings
  return live && typeof live === 'object' ? live.closure : null
}
const openFor = (orch, rosterIds) => orch.open({
  member: 'r-acad', phase: 'normal', role: 'chair', roleLabel: '院士', rosterIds, round: 1,
})

try {
  console.log('=== 0. 机制落点（源码 pin：改回旧写法会让下面每一节都失去依据） ===')
  has(hostDeliverSource, 'const modeOfTurn = ', '§0a host-deliver 有逐次路由读取（modeOfTurn）')
  has(hostDeliverSource, 'deliverModeSource: source', '§0b dispatcher 在回执上写 deliverModeSource（arg|config|setting）')
  has(hostDeliverSource, 'const seam = mode === \'caller\' ? callerSeam : turnDeliver', '§0c dispatcher 按逐次 mode 选接缝，而不是按构造期')
  has(turnSource, 'const awaitingPath = (delivered && typeof delivered.deliveryPath === \'string\'', '§0d awaiting 的 deliveryPath 由接缝报告，不再硬编码 caller')
  has(turnSource, 'deliveryModeReadingOf(turn, delivered)', '§0e 回执的 mode 读数来自接缝 + turn（deliveryModeReadingOf）')
  has(turnSource, 'notEligible 永不进分母', '§0f [结题] 的 detail 说明 notEligible 不进分母')
  has(turnSource, '具备结题表决权的成员数', '§0g [结题] 分母是 eligible 集合')
  has(turnToolSource, 'unknown deliver_mode: ', '§0h 工具面非法 deliver_mode 具名拒')
  has(turnToolSource, 'deliver_mode applies to op:"step" and op:"drive" only', '§0i 工具面只允许 step/drive 使用 deliver_mode')

  console.log('=== 1. ★ A 灯①④ 部署 config=subagents，逐次 arg=caller 真生效：成员在自己的回合里干活 ===')
  {
    const { kernel } = await bootWithEntry({ deliverMode: 'subagents' })
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await kernel.turn.step({ ...memberArgs('r-1'), deliverMode: 'caller' })
    ok(opened && opened.ok === true && opened.awaiting === true,
      '§1a 逐次 arg=caller ⇒ 回合被 park 交回调用方（构造期是 subagents，arg 仍覆盖）', opened && { awaiting: opened.awaiting, deliveryPath: opened.deliveryPath })
    ok(opened && opened.deliveryPath === 'caller',
      '§1b awaiting 回执 deliveryPath:"caller"（不是假设，是接缝报告的）', opened && opened.deliveryPath)
    ok(opened && opened.deliverMode === 'caller' && opened.deliverModeSource === 'arg',
      '§1c 回执写明 mode:"caller" 且 source:"arg"（逐次覆盖，不是 config）', opened && { mode: opened.deliverMode, source: opened.deliverModeSource })
    const supplied = kernel.turn.supplyMemberReply(fence({ record: { track: 'progress', text: 'run263 caller 回合的写入' } }), 'r-1')
    ok(supplied && supplied.ok === true && supplied.supplied === true, '§1d 调用方交回的回复被 caller 接缝接收', supplied && supplied.ok)
    const settled = await kernel.turn.step({ ...memberArgs('r-1'), deliverMode: 'caller' })
    ok(settled && settled.ok === true && settled.deliveryPath === 'caller',
      '§1e settled 回执仍写 deliveryPath:"caller"', settled && settled.deliveryPath)
    ok(settled && settled.deliverMode === 'caller' && settled.deliverModeSource === 'arg',
      '§1f settled 回执顶层同样带 deliverMode/deliverModeSource', settled && { mode: settled.deliverMode, source: settled.deliverModeSource })
    const executed = settled && settled.receipt && Array.isArray(settled.receipt.executedDetail) ? settled.receipt.executedDetail : []
    ok(executed.some((d) => d && d.field === 'record'), '§1g 该回合的回复真的被派发（executedDetail 有 record 行）', executed.map((d) => d && d.field))
    const share = kernel.turn.status().memberWorkShare
    ok(share && share.officeRelayedActs > 0 && share.officeRelayedTurns > 0,
      '§1h ★ memberWorkShare.officeRelayedActs>0（这一回合被记成所办代跑，正是真机里恒 0 的那个数）', share && { officeRelayedActs: share.officeRelayedActs, officeRelayedTurns: share.officeRelayedTurns })
    ok(share && share.memberActs === 0, '§1i 同一行不会被同时记成成员自跑（两个栏位互斥）', share && { memberActs: share.memberActs })
  }

  console.log('=== 2. ★ A 灯② 不带该形参时行为不变：仍走部署默认（subagents），不 park、deliveryPath 不是 caller ===')
  {
    const seen = []
    const subagents = { list: () => ['fake-provider'], start: async () => { seen.push(1); return { reply: ['```json', JSON.stringify({ say: 'ok' }), '```'].join(NL) } } }
    const ctx = { get: (name) => (name === 'subagents' ? subagents : null) }
    const rootAgent = { options: {}, session: { id: 'sess-263' } }
    const seam = createTurnDeliver({ ctx, config: { vmu: { deliverMode: 'subagents' } }, settings: {}, deliverViaSubagents, deliverByReturning, getRootAgent: () => rootAgent })
    const kernel = createKernel({ clock: () => 1000, settings: {}, deliverTurn: seam, slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }] })
    const receipt = await kernel.turn.step(memberArgs('m1'))
    ok(receipt && receipt.ok === true && receipt.awaiting !== true, '§2a 省略 deliver_mode ⇒ 回合不被 park（宿主桥真的跑了）', receipt && { awaiting: receipt.awaiting, ok: receipt.ok })
    ok(seen.length === 1, '§2b 宿主 subagents.start 被调用一次（默认路由没被改掉）', seen.length)
    ok(receipt && receipt.deliverMode === 'subagents', '§2c 回执写 mode:"subagents"（部署默认）', receipt && receipt.deliverMode)
    ok(receipt && receipt.deliverModeSource === 'config', '§2d source:"config"（构造期读到的是 config.deliverMode）', receipt && receipt.deliverModeSource)
    ok(receipt && receipt.deliveryPath !== 'caller', '§2e deliveryPath 不是 "caller"（没有逐次覆盖时语义与本轮一致）', receipt && receipt.deliveryPath)
  }

  console.log('=== 3. ★ A 灯③ 非法值具名拒，绝不静默回落 ===')
  {
    const { kernel, specs } = await bootWithEntry({})
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    let thrown = null
    try { await kernel.turn.step({ ...memberArgs('r-1'), deliverMode: 'bogus' }) } catch (e) { thrown = e }
    ok(thrown !== null && thrown.code === 'VMU_INVALID_ARGUMENT' && /unknown deliverMode/.test(String(thrown.message || '')),
      '§3a 内核层对未知 deliverMode 具名拒（VMU_INVALID_ARGUMENT，消息点名），不是回落到默认', thrown && { code: thrown.code, message: String(thrown.message || '').slice(0, 80) })
    const turnSpec = specs.find((s) => s && s.name === 'vibe_vmu_turn')
    ok(Boolean(turnSpec) && typeof turnSpec.execute === 'function', '§3b vibe_vmu_turn 面已注册（灯③看的是成员真正拿到的回执）')
    let body = null
    if (turnSpec) {
      const raw = await turnSpec.execute({ op: 'step', deliver_mode: 'bogus', members: ['r-1'] }, {})
      try { body = JSON.parse(String(raw)) } catch { body = null }
    }
    ok(body && body.ok === false && body.code === 'VMU_INVALID_ARGUMENT' && /unknown deliver_mode/.test(String(body.message || '')),
      '§3c 工具回执 ok:false + code:VMU_INVALID_ARGUMENT + message 点名 deliver_mode（成员看得到为什么）', body && { code: body.code, message: String(body.message || '').slice(0, 80) })
    ok(body && /Known values: caller \| subagents/.test(String(body.hint || '')),
      '§3d hint 列出合法值，a typo 不会被当成一次默认路由', body && String(body.hint || '').slice(0, 120))
  }

  console.log('=== 4. ★ A 灯②补充：deliverModeSource 的第三种来源 setting；以及 arg 覆盖 setting ===')
  {
    const settingSeam = createTurnDeliver({
      ctx: { get: () => null },
      config: {},
      settings: { 'vmu.turn.deliverMode': 'caller' },
      deliverViaSubagents,
      deliverByReturning,
    })
    const parked = await settingSeam({ turn: { id: 't-s', member: 'm1' }, text: 'prompt' })
    ok(parked && parked.awaiting === true && parked.deliveryPath === 'caller',
      '§4a setting 声明 caller ⇒ 接缝 park（无 arg 时读构造期设置）', parked && { awaiting: parked.awaiting, path: parked.deliveryPath })
    ok(parked && parked.deliverMode === 'caller' && parked.deliverModeSource === 'setting',
      '§4b 回执 source:"setting"（第三个来源，区分 arg/config/setting）', parked && { mode: parked.deliverMode, source: parked.deliverModeSource })
    const seen = []
    const subagents = { list: () => ['fake-provider'], start: async () => { seen.push(1); return { reply: 'host-reply' } } }
    const overrideSeam = createTurnDeliver({
      ctx: { get: (name) => (name === 'subagents' ? subagents : null) },
      config: {},
      settings: { 'vmu.turn.deliverMode': 'caller' },
      deliverViaSubagents,
      deliverByReturning,
      getRootAgent: () => ({ options: {}, session: { id: 'sess-263b' } }),
    })
    const overridden = await overrideSeam({ turn: { id: 't-o', member: 'm1', deliverMode: 'subagents' }, text: 'prompt' })
    ok(overridden && overridden.awaiting !== true && overridden.reply === 'host-reply',
      '§4c turn.deliverMode="subagents" 覆盖 setting=caller（同一接缝两条路都能走）', overridden && { awaiting: overridden.awaiting, reply: overridden.reply })
    ok(seen.length === 1, '§4d 覆盖走的是宿主桥（subagents.start 被调用）', seen.length)
    ok(overridden && overridden.deliverMode === 'subagents' && overridden.deliverModeSource === 'arg',
      '§4e 覆盖时 source:"arg"（逐次的证明）', overridden && { mode: overridden.deliverMode, source: overridden.deliverModeSource })
  }

  console.log('=== 5. ★ B 灯① 分母是 eligible：temp 席位投票进 notEligible，永不进分母 ===')
  {
    const T1 = Date.UTC(2027, 0, 15, 8, 0, 0)
    const roster = ['r-acad', 'r-1', 'r-2', 'r-3', 'r-temp']
    const votes = new Map([['r-acad', true], ['r-1', true], ['r-2', true], ['r-3', true], ['r-temp', false]])
    const rows = [['r-acad', T1], ['r-1', T1], ['r-2', T1], ['r-3', T1], ['r-temp', T1]].map(([member, at]) => ({ member, at }))
    const reading = closureVoteOf({ votes, roster, may: (id) => id !== 'r-temp', rows })
    const orch = createTurnOrchestrator({ prompt: fakePrompt, deliver: async () => '', faces: {}, settings: {}, clock: () => 1000, closureVote: () => reading })
    const asm = await orch.assemble(openFor(orch, roster).turn)
    const lines = closureLineOf(asm)
    ok(lines.length === 1, '§5a 装配文本里有且只有一行 [结题]', lines)
    const line = lines[0] || ''
    ok(line.includes('已投 4/4（同意 4、反对 0）'),
      '§5b ★ 状态板读 4/4（分母=eligible 4），不再是真机那个 2/5', line)
    ok(!line.includes('/5'), '§5c 分母里没有 temp（5 不出现）', line)
    const closure = statusClosureOf(orch)
    const detail = closure && closure.detail
    ok(detail && Array.isArray(detail.eligible) && detail.eligible.length === 4 && detail.eligible.indexOf('r-temp') < 0,
      '§5d detail.eligible 恰好是四位有表决权成员（temp 不在其中）', detail && detail.eligible)
    ok(detail && Array.isArray(detail.notEligible) && detail.notEligible.indexOf('r-temp') !== -1,
      '§5e temp 被具名记进 notEligible（记录了，但既不计票也不算缺票）', detail && detail.notEligible)
    ok(detail && detail.denominator === '具备结题表决权的成员数（closureVote.eligible，may-vote）；notEligible 永不进分母',
      '§5f detail.denominator 把分母口径写成一句话', detail && detail.denominator)
  }

  console.log('=== 6. ★ B 灯② r-3 投票后分子跟随，且 asOf 换成新投票的内容时间 ===')
  {
    const T1 = Date.UTC(2027, 0, 15, 8, 0, 0)
    const T2 = Date.UTC(2027, 0, 16, 9, 30, 0)
    const roster = ['r-acad', 'r-1', 'r-2', 'r-3']
    const votes = new Map([['r-acad', true], ['r-1', true]])
    const rows = [{ member: 'r-acad', at: T1 }, { member: 'r-1', at: T1 }]
    const read = () => closureVoteOf({ votes, roster, may: () => true, rows })
    const orch = createTurnOrchestrator({ prompt: fakePrompt, deliver: async () => '', faces: {}, settings: {}, clock: () => 1000, closureVote: read })
    const opened = openFor(orch, roster)
    const before = (await orch.assemble(opened.turn)).text
    const beforeLine = closureLineOf({ text: before })[0] || ''
    ok(beforeLine.includes('已投 2/4（同意 2、反对 0）'), '§6a 投票前：已投 2/4（本地图只有两票，分母仍是 eligible 4）', beforeLine)
    ok(beforeLine.includes('（读于 ' + new Date(T1).toISOString() + '）'), '§6b 读数带内容时间 asOf = 最新投票行 at（T1）', beforeLine)
    votes.set('r-3', true)
    rows.push({ member: 'r-3', at: T2 })
    const after = (await orch.assemble(openFor(orch, roster).turn)).text
    const afterLine = closureLineOf({ text: after })[0] || ''
    ok(afterLine.includes('已投 3/4（同意 3、反对 0）'), '§6c ★ r-3 投票后分子跟随（3/4），分母不变（4）', afterLine)
    ok(afterLine.includes('（读于 ' + new Date(T2).toISOString() + '）'), '§6d asOf 跟随到新投票的 at（T2），不是读时时钟', afterLine)
    ok(!afterLine.includes(new Date(T1).toISOString()), '§6e 旧 asOf 不再出现在这行（快照不是糊在一起）', afterLine)
    const detail = statusClosureOf(orch) && statusClosureOf(orch).detail
    ok(detail && detail.asOfSource === 'closure_votes 行：最新一条投票的 at（closureVote.votersAsOf）',
      '§6f detail.asOfSource 说明 asOf 的来源（可核对，不是黑箱）', detail && detail.asOfSource)
  }

  console.log('=== 7. ★ B 灯③ 删掉 asOf 必须可观测：行里不再有「读于」，而是具名「时间未提供」 ===')
  {
    const roster = ['r-acad', 'r-1', 'r-2', 'r-3']
    const votes = new Map([['r-acad', true], ['r-1', true], ['r-2', true], ['r-3', true]])
    // positive control: with rows the line dates itself
    const dated = closureVoteOf({ votes, roster, may: () => true, rows: [{ member: 'r-1', at: Date.UTC(2027, 0, 15, 8, 0, 0) }] })
    // the lamp: a reading whose votersAsOf is gone (no vote rows visible) must NOT silently look dated
    const undated = closureVoteOf({ votes, roster, may: () => true, rows: [] })
    const orchDated = createTurnOrchestrator({ prompt: fakePrompt, deliver: async () => '', faces: {}, settings: {}, clock: () => 1000, closureVote: () => dated })
    const orchUndated = createTurnOrchestrator({ prompt: fakePrompt, deliver: async () => '', faces: {}, settings: {}, clock: () => 1000, closureVote: () => undated })
    const datedLine = closureLineOf(await orchDated.assemble(openFor(orchDated, roster).turn))[0] || ''
    const undatedLine = closureLineOf(await orchUndated.assemble(openFor(orchUndated, roster).turn))[0] || ''
    ok(undated.votersAsOf === null, '§7a 构造出来的反例读数 votersAsOf 为 null（asOf 真的没了）', undated.votersAsOf)
    ok(datedLine.includes('（读于 '), '§7b 正控：正常读数带「（读于 …）」', datedLine)
    ok(!undatedLine.includes('（读于 '), '§7c ★ 删掉 asOf ⇒ 行里不出现假的读时时间', undatedLine)
    ok(undatedLine.includes('（时间未提供：'), '§7d ★ 而是具名「时间未提供」（可观测，不是静默省略）', undatedLine)
    const detail = statusClosureOf(orchUndated) && statusClosureOf(orchUndated).detail
    ok(detail && detail.asOfSource === null, '§7e detail.asOfSource 置 null（读数自己承认没有内容时间）', detail && detail.asOfSource)
    ok(undatedLine.includes('已投 4/4'), '§7f 计数仍正确（asOf 缺失不影响分子/分母）', undatedLine)
  }
} catch (e) {
  failed++
  failures.push('suite threw: ' + String((e && e.stack) || e))
  console.error('  FAIL suite threw: ' + String((e && e.stack) || e))
} finally {
  console.log('')
  if (failures.length > 0) console.error('failures:' + NL + failures.map((f) => '  - ' + f).join(NL))
  console.log('=== VMU RUN263 DELIVERY MODE AND CLOSURE: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exitCode = failed === 0 ? 0 : 1
}
