// tests/vmu-v3-planner.test.mjs — PHASE 6 / **P0-2（规划-调度闭环）＋ P0-3（规划学习闭环）**。
//
// 这张卡要证明的不是"写了一个 planner 模块"，而是下面这些【都会失败】的事实：
//
//   ① 规划器真的**从 tick 里**派出一个回合（`vmu.turn.run({member:'planner'})`），且**无工作时不派**
//      （`plannerCalls === 0`）。派发点在 `v3/tick`（tick 不是 turn ⇒ 不撞 K2 的 `VMU_TURN_REENTRANT`）；
//      `turn/reply-parsed` 处理器只落盘 + 改写，**绝不**在那里再开回合。
//   ② 回执归一化/校验的每一条都有计数：6 动作白名单、逐角色硬校验、horizon 截断、去重。
//   ③ 学习环：第 n 次简报的 `last_plan.outcomes` 长度 ＝ 第 n-1 次**实际执行**的动作数（第 1 次简报里
//      `last_plan === null`）。断言不是"看起来带上了"，而是**长度相等**且每一项带布尔 `ok`。
//   ④ 冷却对每一次规划调用生效（两次 tick 间隔 < `planMinIntervalMs` ⇒ 只规划一次）。
//   ⑤ 计划记录落在 `plans` 轨、是**可回读的 JSON**；执行结果逐条写回；问题卡的 `- 计划:` 锚点经
//      `dataplane.updateCard` 回写；`promote` 真的晋升出一个"判断命题"问题卡。
//   ⑥ K10（`turn/reply-parsed` 可改写回执）被真的用了：规划器回执经钩子**归一化 + 落盘**，且返回
//      `{rewriteResult}`；非规划器成员与畸形回执**什么都不做**（不改写、不写入）。
//
// RULE E（本仓的"不可能失败"守卫）：本文件不用 `.every(` 判可能为空的集合、不用 `filter(...).length===0`
// 的随形写法、不把断言塞进条件分支；集合类断言一律先钉住**具体条数**（`=== N`），再用逐项 for 循环。
// 每一条断言都已知"怎样会让它红"（在注释里点名）。
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createPackLoader } from '../vibe-math-vmu/kernel/pack.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import { V3_TICK_TOPIC } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import { writeCard } from '../vibe-math-vmu/packs/v3/middleware/dataplane.js'
import { registerSubQuestions, subQuestionIds, V3_SUBQUESTIONS_MODULE } from '../vibe-math-vmu/packs/v3/middleware/subquestions.js'
import { REPORTS_TRACK, v3ReportsStatus, pushReport, buildReport } from '../vibe-math-vmu/packs/v3/middleware/reports.js'
import {
  V3_PLANNER_MODULE, PLANNER_MEMBER, PLAN_TRACK, PLAN_KIND, PLAN_VERBS, SPAWN_ROLES,
  v3PlannerStatus, readPlanRecord, readRawPlan, loadCardIndex, validatePlan, promotedProblemId,
  advanceableProblems, verifiedIds,
} from '../vibe-math-vmu/packs/v3/middleware/planner.js'
import { listGates, approveGate, createGate } from '../vibe-math-vmu/packs/v3/middleware/gates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const DEFAULTS_FILE = join(VMU, 'packs', 'v3', 'settings', 'defaults.json')
const ENTRY = join(VMU, 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** The declared settings the pack folds in BEFORE the kernel exists — the real file, not a copy. */
const PACK_DEFAULTS = (() => {
  const parsed = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'))
  return parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
})()
const clone = (o) => JSON.parse(JSON.stringify(o))

/** 一份"内核能派的回复"：只有内核已登记的字段（`prioritize` 是 RECORDED_FIELD，无面副作用）。 */
const ACK = JSON.stringify({ prioritize: 'ack' })

/** 把动作列表变成规划器回执：一个动作一条 `act:` tag（格式就是提示段里写给模型的那个）。 */
const tagOf = (a = {}) => 'act:' + [a.action, a.role, a.target, a.direction, a.childId, a.reason]
  .map((x) => (x === undefined || x === null ? '' : String(x))).join('｜')
const planReply = (summary, actions) => JSON.stringify({
  progress: { track: PLAN_TRACK, kind: PLAN_KIND, title: 'v3 计划 ' + summary, body: '- summary: ' + summary, tags: actions.map(tagOf) },
})

/** Boot a real kernel with the pack applied; `replier` decides what a member turn answers. */
function boot({ replier = null, overrides = {} } = {}) {
  const delivered = []
  const clockRef = { at: 1000 }
  const kernel = createKernel({
    clock: () => clockRef.at,
    settings: Object.assign(clone(PACK_DEFAULTS), overrides),
    // 规划器提示段走清单 sections 通道（带 scope.role='planner'），真实装配由插件晚注册；
    // 测试里直接把它交给 createKernel —— 同一个段声明，不复制文本。
    sections: PACK.sections,
    deliverTurn: async ({ turn, text }) => {
      delivered.push({ member: turn.member, role: turn.role, phase: turn.phase, text })
      return replier ? replier({ turn, text }) : ACK
    },
  })
  const loader = createPackLoader({ kernel, registry: kernel.registry, onPromptPolicy: () => () => {} })
  return { kernel, loader, delivered, clockRef }
}

/** 一个 tick：注入时钟推到 `at`，然后**从总线发** `v3/tick`（模块形状的 api 由 loader 附上）。 */
async function tick(h, at, runs = 1) {
  // ★ SLV / TWO-PHASE: tick 1 DISPATCHES the planner turn; the reply lands through turn/reply-parsed; tick 2 settles
  // the persisted plan. whenIdle() is the DETERMINISTIC barrier - no sleeping. The helper returns the SECOND receipt
  // because that is the one carrying the settled outcome most assertions describe.
  h.clockRef.at = at
  const first = await h.kernel.bus.emit(V3_TICK_TOPIC, { at, runs }, {})
  // Only a tick that DISPATCHED a planner turn needs the second (settle) tick; otherwise a second pass would double
  // unrelated per-tick work (promotion) and the interaction would test something else.
  if (!v3PlannerStatus().lastDispatched) { await new Promise((resolve) => setImmediate(resolve)); return first }
  await h.kernel.turn.whenIdle()
  const second = await h.kernel.bus.emit(V3_TICK_TOPIC, { at, runs }, {})
  await new Promise((resolve) => setImmediate(resolve))
  return { first, second, ...second }
}

/** 计划记录（最新一条）与其规范化视图。 */
function latestPlan(kernel) {
  const list = kernel.records.list({ track: PLAN_TRACK, limit: 0 })
  if (list.items.length === 0) return null
  let best = null
  for (const h of list.items) if (best === null || (h.updatedAt || 0) >= (best.updatedAt || 0)) best = h
  const rec = kernel.records.get({ id: best.id })
  return { id: best.id, rev: rec.rev, body: rec.body, tags: rec.tags, canonical: readPlanRecord({ body: rec.body }) }
}

/** 写一张问题卡（经 dataplane，不走第二份 md 写手）。 */
const problemCard = (kernel, id, extra = {}) => writeCard({
  records: kernel.records,
  kind: 'problem',
  card: Object.assign({ id, 标题: '问题 ' + id, 状态: '求解中', 陈述: '陈述 ' + id + '。' }, extra),
})
/** 写一张命题卡。 */
const propositionCard = (kernel, id, 概率 = 0.5) => writeCard({
  records: kernel.records,
  kind: 'proposition',
  card: { id, 标题: '命题 ' + id, 概率, 陈述: '陈述 ' + id + '。' },
})

console.log('=== 1. 清单/提示段形状：规划器是一个 module 条目，提示段只对 role=planner 生效 ===')
{
  ok(PACK && PACK.id === 'v3', 'PACK.id 是 v3', PACK && PACK.id)
  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  const tickEntry = entries.find((e) => e && e.id === 'v3-tick')
  const plannerEntry = entries.find((e) => e && e.id === 'v3-planner')
  const planeEntry = entries.find((e) => e && e.id === 'v3-dataplane')
  ok(plannerEntry !== undefined, '清单携带 v3-planner 模块条目', entries.map((e) => e && e.id))
  ok(plannerEntry && plannerEntry.module === V3_PLANNER_MODULE, '条目携带 module 对象（loader 才会附上 api；file: 不可用）', plannerEntry && typeof plannerEntry.module)
  ok(plannerEntry && plannerEntry.kind === undefined, '条目故意省略 kind：pack.js 按 module 归一化（带 kind 无 handler 会被 bus 静态拒）', plannerEntry && plannerEntry.kind)
  ok(plannerEntry && tickEntry && plannerEntry.order > tickEntry.order, '规划器排在 tick 之后（tick 先写 journal）', { tick: tickEntry && tickEntry.order, planner: plannerEntry && plannerEntry.order })
  ok(plannerEntry && planeEntry && plannerEntry.order < planeEntry.order, '规划器排在 dataplane 之前（同一 tick 里计划先落盘，索引后重建）', { planner: plannerEntry && plannerEntry.order, plane: planeEntry && planeEntry.order })
  ok(plannerEntry && Array.isArray(plannerEntry.on) && plannerEntry.on.includes(V3_TICK_TOPIC),
    '条目订阅 v3/tick —— 派发点只能是 tick（tick 不是 turn，不撞 VMU_TURN_REENTRANT）', plannerEntry && plannerEntry.on)
  ok(plannerEntry && Array.isArray(plannerEntry.on) && plannerEntry.on.includes('turn/reply-parsed'),
    '条目也订阅 turn/reply-parsed —— K10 的归一化点，只落盘+改写，不在这里开回合', plannerEntry && plannerEntry.on)
  ok(plannerEntry && Array.isArray(plannerEntry.capabilities) && plannerEntry.capabilities.includes('trigger-workflow'),
    '条目声明 trigger-workflow（解锁 api.services，才能读 vmu.records / 调 vmu.turn）', plannerEntry && plannerEntry.capabilities)
  ok(plannerEntry && Array.isArray(plannerEntry.capabilities) && plannerEntry.capabilities.includes('rewrite-result'),
    '条目声明 rewrite-result（K10：return { rewriteResult } 需要的能力）', plannerEntry && plannerEntry.capabilities)
  ok(V3_PLANNER_MODULE && V3_PLANNER_MODULE.meta && V3_PLANNER_MODULE.meta.id === 'v3-planner' && Number.isInteger(V3_PLANNER_MODULE.meta.apiVersion),
    '模块带 meta.id/meta.apiVersion（loader 的硬门槛）', V3_PLANNER_MODULE && V3_PLANNER_MODULE.meta)
  const hooks = (V3_PLANNER_MODULE && V3_PLANNER_MODULE.hooks) || {}
  ok(typeof hooks[V3_TICK_TOPIC] === 'function' && typeof hooks['turn/reply-parsed'] === 'function',
    '模块的 hooks 里真的有 tick 与 reply-parsed 两个处理器', Object.keys(hooks))

  const requires = Array.isArray(PACK.requires) ? PACK.requires.map((r) => r && r.service) : []
  ok(requires.includes('vmu.records') && requires.includes('vmu.turn'),
    '清单声明了 vmu.records 与 vmu.turn（K2 之后回合循环在 M2 服务目录里）', requires)
  ok(Object.keys(PACK.settings || {}).length === 0,
    '清单 settings 仍为空：调用期读取的 v3 规划键已有 schema 默认，不需要（也不该）在清单里重复', PACK.settings)

  const sections = Array.isArray(PACK.sections) ? PACK.sections : []
  const plannerSection = sections.find((s) => s && s.name === 'v3-planner')
  ok(plannerSection !== undefined, '清单声明了规划器提示段 v3-planner', sections.map((s) => s && s.name))
  ok(plannerSection && plannerSection.order >= 600 && plannerSection.order <= 899,
    '段 order 落在 pack 区间 [600,899]（kernel/prompt/index.js 的 ORDER_RANGES）', plannerSection && plannerSection.order)
  ok(plannerSection && plannerSection.scope && plannerSection.scope.role === 'planner',
    '★ 段带 scope.role=planner：规划词表只进规划器回合（否则求解器/验证器也读到调度词表）', plannerSection && plannerSection.scope)
  const text = (plannerSection && plannerSection.text) || ''
  ok(text.includes('{{ statusBlock }}'), '段里有 {{ statusBlock }}（简报 JSON 的注入点，模板变量在白名单里）', {})
  ok(text.includes('{{ setting:vmu.v3.planningHorizon }}'), '段里有 {{ setting:vmu.v3.planningHorizon }}（horizon 从设置读，不手抄）', {})
  let verbHits = 0
  for (const v of PLAN_VERBS) if (text.includes('`' + v + '`')) verbHits += 1
  ok(verbHits === PLAN_VERBS.length, '段里逐条列出 6 个动作词（缺一个 ⇒ 模型读到的词表不完整）', verbHits)
  ok(text.includes('act:') && text.includes('"track":"plans"'), '段里写明回执契约：progress→plans 轨 + act: tag 编码', {})
  ok(!text.includes('{{ role }}') && !text.includes('{{ unknown'), '段里没有未登记的模板变量（否则装配会具名拒）', {})

  const declared = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  const expected = {
    'vmu.v3.planningHorizon': 3,
    'vmu.v3.plannerEnabled': true,
    'vmu.v3.planMinIntervalMs': 30000,
    'vmu.v3.plannerMaxFails': 3,
  }
  for (const [key, def] of Object.entries(expected)) {
    const d = declared.get(key)
    ok(d !== undefined && d.def === def, '设置键已登记且默认值就是 P0-2 需要的：' + key + '=' + JSON.stringify(def), d && d.def)
  }
  ok(PLAN_VERBS.length === 6 && SPAWN_ROLES.length === 4, '动作词表 6 条、可 spawn 角色 4 个（v3 的同一组）', { verbs: PLAN_VERBS.length, roles: SPAWN_ROLES.length })
}

console.log('=== 2. 无工作不规划：problems 轨为空 ⇒ tick 一次，规划回合 0 次 ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner' ? planReply('不该发生', [{ action: 'wait', target: 'q-1' }]) : ACK) })
  const applied = await h.loader.apply(PACK)
  ok(applied && applied.ok === true, 'v3 包装载干净（planner 模块经 loader 成功装载）', applied && { applied: applied.applied, problems: applied.problems })
  const before = h.delivered.length
  const r = await tick(h, 3000)
  ok(r && r.ok === true, 'tick 本身成功（没有工作不是错误）', r && r.ok)
  const st = v3PlannerStatus()
  ok(st.plannerCalls === 0, '★ 无工作不规划：planner 回合 0 次', st.plannerCalls)
  ok(h.delivered.length === before, '没有任何成员回合被投递（连规划器都没被叫醒）', h.delivered.length - before)
  ok(st.lastSkip && st.lastSkip.reason === 'no-schedulable-work', '跳过理由是具名的 no-schedulable-work（不是静默什么都不做）', st.lastSkip)
  ok(h.kernel.records.list({ track: PLAN_TRACK, limit: 0 }).items.length === 0, 'plans 轨上没有任何计划记录', {})

  // 没有注入时钟 ⇒ 不规划（时间只来自注入时钟，绝不编一个"现在"）。
  const r2 = await h.kernel.bus.emit(V3_TICK_TOPIC, { runs: 2 }, {})
  ok(r2 && r2.ok === true, '没有 at 的 tick 不失败', r2 && r2.ok)
  ok(v3PlannerStatus().plannerCalls === 0, '没有注入时钟时不规划（不编时间）', v3PlannerStatus().plannerCalls)
  ok(v3PlannerStatus().lastSkip && v3PlannerStatus().lastSkip.reason === 'no-injected-clock', '跳过理由是具名的 no-injected-clock', v3PlannerStatus().lastSkip)
}

console.log('=== 3. 有工作则规划：一条"求解中"问题 ⇒ 恰好一次 planner 回合，且简报进了它的提示 ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner'
    ? planReply('先观察 q-1', [{ action: 'wait', target: 'q-1', reason: '等依赖' }])
    : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  const r = await tick(h, 3000)
  ok(r && r.ok === true, 'tick 成功', r && r.ok)
  const st = v3PlannerStatus()
  ok(st.plannerCalls === 1, '★ 有工作则规划：planner 回合恰好 1 次', st.plannerCalls)
  const plannerTurns = h.delivered.filter((d) => d.member === PLANNER_MEMBER)
  ok(plannerTurns.length === 1, '★ 被投递的规划器回合恰好 1 次', plannerTurns.length)
  ok(plannerTurns.length === 1 && plannerTurns[0].role === PLANNER_MEMBER, '规划器回合的 role 是 planner（scope 绑定靠它选中段）', plannerTurns[0] && plannerTurns[0].role)
  const text = plannerTurns.length === 1 ? plannerTurns[0].text : ''
  ok(text.includes('v3 规划器'), '★ 规划器提示里真的有规划器段（scope.role=planner 生效）', text.slice(0, 80))
  ok(text.includes('CURRENT STATE BRIEF'), '规划器提示里有简报标题', {})
  ok(text.includes('"problems"') && text.includes('q-1'), '简报 JSON 里真的带上了 problems/q-1', {})
  ok(!text.includes('{{'), '提示里没有未渲染的模板占位符', {})
  ok(st.lastBrief && Array.isArray(st.lastBrief.problems) && st.lastBrief.problems.length === 1, '状态里能回读到这次用的简报（1 条问题）', st.lastBrief && st.lastBrief.problems)
  ok(st.lastBrief && st.lastBrief.last_plan === null, '第 1 次简报的 last_plan 是 null（还没有上一次计划可学）', st.lastBrief && st.lastBrief.last_plan)
  const plan = latestPlan(h.kernel)
  ok(plan && plan.canonical, 'plans 轨上有一条可解析的计划记录（JSON，不是 md 猜出来的）', plan && plan.body && plan.body.slice(0, 60))
  ok(plan && plan.canonical && Array.isArray(plan.canonical.validated) && plan.canonical.validated.length === 1, '1 个合法动作被保留', plan && plan.canonical && plan.canonical.validated.length)
  ok(plan && plan.canonical && Array.isArray(plan.canonical.outcomes) && plan.canonical.outcomes.length === 1, '1 个动作被执行并写下 outcome', plan && plan.canonical && plan.canonical.outcomes.length)
}

console.log('=== 3b. 两把调用期设置的读者是真的：planningHorizon / plannerEnabled ===')
{
  // horizon=1（设置层覆盖 schema 默认 3）⇒ 2 个合法动作只留 1 个，另一个计 truncated。
  const h = boot({
    overrides: { 'vmu.v3.planningHorizon': 1 },
    replier: ({ turn }) => (turn.member === 'planner'
      ? planReply('只排一个', [{ action: 'wait', target: 'q-1' }, { action: 'continue', target: 'q-1' }])
      : ACK),
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 3000)
  const st = v3PlannerStatus()
  ok(st.lastPlan && st.lastPlan.validated === 1, '★ planningHorizon=1 真的被读到：只留 1 个动作', st.lastPlan && st.lastPlan.validated)
  ok(st.lastPlan && st.lastPlan.truncated === 1, '另一个合法动作计 truncated=1', st.lastPlan && st.lastPlan.truncated)
  const text = h.delivered.length > 0 ? h.delivered[0].text : ''
  ok(text.includes('最多 1 个'), '提示段里的 horizon 也按设置渲染成 1（{{ setting:… }} 生效）', {})
  ok(text.includes('"horizon": 1'), '简报里的 horizon 也是 1（同一个值，不是第二份）', {})

  // plannerEnabled=false ⇒ 有工作也不派回合。
  const h2 = boot({
    overrides: { 'vmu.v3.plannerEnabled': false },
    replier: ({ turn }) => (turn.member === 'planner' ? planReply('不该发生', [{ action: 'wait', target: 'q-1' }]) : ACK),
  })
  await h2.loader.apply(PACK)
  problemCard(h2.kernel, 'q-1')
  await tick(h2, 3000)
  ok(v3PlannerStatus().plannerCalls === 0, '★ plannerEnabled=false ⇒ 有工作也不规划（0 次回合）', v3PlannerStatus().plannerCalls)
  ok(v3PlannerStatus().lastSkip && v3PlannerStatus().lastSkip.reason === 'planner-disabled', '跳过理由是具名的 planner-disabled', v3PlannerStatus().lastSkip)
  ok(h2.delivered.length === 0, '一个成员回合都没被投递', h2.delivered.length)
}

console.log('=== 4. horizon 截断 + 非法动作剔除并计数 + 去重（5 合法 + 2 非法：3/2/2） ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner'
    ? planReply('排 3 个', [
      { action: 'teleport', target: 'q-1' },                                  // 非法：不在 6 动作词表
      { action: 'spawn', role: 'wizard', target: 'q-1' },                     // 非法：角色不在可 spawn 角色
      { action: 'spawn', role: 'explorer', target: 'q-1', reason: '方向未开' },
      { action: 'spawn', role: 'solver', target: 'q-1', direction: 'd-1', reason: '补一轮' },
      { action: 'interrupt', childId: 's-1', reason: '死路' },
      { action: 'promote', target: 'p-1' },
      { action: 'continue', target: 'q-1' },
      { action: 'continue', target: 'q-1' },                                 // 重复：与上一行同键
    ])
    : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  propositionCard(h.kernel, 'p-1', 0.5)
  await tick(h, 3000)
  const st = v3PlannerStatus()
  ok(st.plannerCalls === 1, '这一次 tick 派了一个规划回合', st.plannerCalls)
  ok(st.lastPlan && st.lastPlan.validated === 3, '★ horizon 截断：合法动作只留 3 个（horizon=3）', st.lastPlan && st.lastPlan.validated)
  ok(st.lastPlan && st.lastPlan.rejected === 2, '★ 非法动作被剔且计数：rejected=2', st.lastPlan && st.lastPlan.rejected)
  ok(st.lastPlan && st.lastPlan.truncated === 2, '合法但超出 horizon 的动作被计为 truncated=2（不是被拒）', st.lastPlan && st.lastPlan.truncated)
  const plan = latestPlan(h.kernel)
  ok(plan && plan.canonical, '计划记录可回读', plan && plan.body && plan.body.length)
  const c = plan.canonical || {}
  ok(c.validated.length === 3 && c.rejected === 2 && c.truncated === 2 && c.duplicates === 1,
    '★ 记录里四个计数都在且各就各位（validated 3 / rejected 2 / truncated 2 / duplicates 1）',
    { validated: c.validated && c.validated.length, rejected: c.rejected, truncated: c.truncated, duplicates: c.duplicates })
  ok(Array.isArray(c.rejectReasons) && c.rejectReasons.length === 2, '两个被拒动作各有点名的原因', c.rejectReasons)
  ok(Array.isArray(c.rejectReasons) && c.rejectReasons[0] && /unknown-action/.test(c.rejectReasons[0].why), '第一个拒绝原因点名 unknown-action（不是"不合法"三个字）', c.rejectReasons && c.rejectReasons[0])
  ok(Array.isArray(c.rejectReasons) && c.rejectReasons[1] && /unknown-spawn-role/.test(c.rejectReasons[1].why), '第二个拒绝原因点名 unknown-spawn-role', c.rejectReasons && c.rejectReasons[1])
  ok(Array.isArray(c.raw) && c.raw.length === 8, 'raw 保留了模型给的全部 8 条动作（可审计「它本来想干什么」）', c.raw && c.raw.length)
  ok(Array.isArray(c.outcomes) && c.outcomes.length === 3, '被保留的 3 个动作逐条执行并写回 outcome', c.outcomes && c.outcomes.length)
  let boolOk = 0
  for (const o of c.outcomes || []) if (typeof o.ok === 'boolean') boolOk += 1
  ok(boolOk === 3, '每条 outcome 都带布尔 ok（学习环要读它，不能是"成功了吗"的字符串）', boolOk)
  const failOutcome = (c.outcomes || []).find((o) => o.ok === false)
  ok(failOutcome !== undefined, '3 条里恰好有 1 条失败（interrupt 没有 host 句柄 ⇒ 具名失败，不是静默跳过）', c.outcomes && c.outcomes.map((o) => o.ok))
  ok(failOutcome && failOutcome.error === 'VMU_ENGINE_UNAVAILABLE', '失败 outcome 带具名错误码 VMU_ENGINE_UNAVAILABLE', failOutcome && failOutcome.error)
  // 问题卡的 - 计划: 锚点经 dataplane.updateCard 回写。
  const pIdx = loadCardIndex(h.kernel.records, 'problems', 'problem')
  const q1 = pIdx.items.find((x) => x.id === 'q-1')
  ok(q1 !== undefined, '问题卡仍在 problems 轨上', pIdx.items.map((x) => x.id))
  ok(q1 && String(q1.card.计划) === '补一轮', '★ 问题卡的 `- 计划:` 锚点被回写成最后一个动作的理由（v3 applyPlanToProblemCards）', q1 && q1.card.计划)
}

console.log('=== 5. promote：命题晋升成"判断命题"问题卡（经 dataplane.writeCard），且幂等 ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner'
    ? planReply('晋升 p-1', [{ action: 'promote', target: 'p-1', reason: '价值高' }])
    : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')          // 有可推进工作，规划器才会被叫醒（promote 不是"工作"本身）
  propositionCard(h.kernel, 'p-1', 0.5)
  await tick(h, 3000)
  const qid = promotedProblemId('p-1')
  const idx = loadCardIndex(h.kernel.records, 'problems', 'problem')
  const promoted = idx.items.find((x) => x.id === qid)
  ok(promoted !== undefined, '★ promote 真的在 problems 轨上建了一个问题卡：' + qid, idx.items.map((x) => x.id))
  ok(promoted && String(promoted.card.来源) === 'promote', '晋升问题的 - 来源: 是 promote', promoted && promoted.card.来源)
  ok(promoted && String(promoted.card.陈述).includes('判断下述命题是否成立'), '晋升问题的陈述是"判断下述命题是否成立：…"（v3 :2529）', promoted && String(promoted.card.陈述).slice(0, 40))
  const plan = latestPlan(h.kernel)
  ok(plan && plan.canonical && plan.canonical.outcomes.length === 1 && plan.canonical.outcomes[0].ok === true,
    'promote 的 outcome 是 ok:true 且带新问题 id', plan && plan.canonical && plan.canonical.outcomes)
  ok(plan && plan.canonical && plan.canonical.outcomes[0].problemId === qid, 'outcome 里点名晋升出的 problemId', plan && plan.canonical && plan.canonical.outcomes[0])
}

console.log('=== 6. 冷却：两次 tick 间隔 < planMinIntervalMs ⇒ 只规划一次 ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner'
    ? planReply('观察', [{ action: 'wait', target: 'q-1' }])
    : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 3000)
  ok(v3PlannerStatus().plannerCalls === 1, '第 1 次 tick 规划了 1 次', v3PlannerStatus().plannerCalls)
  await tick(h, 4000)   // 与上一次间隔 1000 < 30000
  ok(v3PlannerStatus().plannerCalls === 1, '★ 冷却生效：间隔 1000ms < 30000ms ⇒ 仍然只规划 1 次', v3PlannerStatus().plannerCalls)
  ok(v3PlannerStatus().lastSkip && v3PlannerStatus().lastSkip.reason === 'cooldown', '跳过理由是具名的 cooldown', v3PlannerStatus().lastSkip)
  ok(v3PlannerStatus().lastSkip && v3PlannerStatus().lastSkip.elapsedMs === 1000, '回执报出真实间隔（1000ms）', v3PlannerStatus().lastSkip)
  await tick(h, 33001) // 与上一次间隔 30001 >= 30000
  ok(v3PlannerStatus().plannerCalls === 2, '冷却过去后重新规划（第 2 次）', v3PlannerStatus().plannerCalls)
}

console.log('=== 7. 学习环：第 2 次简报的 last_plan.outcomes 长度 ＝ 第 1 次计划实际执行的动作数 ===')
{
  // 这一节的意义：若 outcome 没写回、或简报没读 plans 轨，brief2.last_plan.outcomes 会是 undefined/0，
  // 断言立刻红。三个动作全是建议动作（wait/continue/stop），所以"实际执行数"就是 3，且都能成功。
  const h = boot({ replier: ({ turn }) => (turn.member === 'planner'
    ? planReply('三个建议动作', [
      { action: 'wait', target: 'q-1', reason: '等依赖' },
      { action: 'continue', target: 'q-1', reason: '续跑由代码决定' },
      { action: 'stop', target: 'q-1', reason: '先停' },
    ])
    : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const st1 = v3PlannerStatus()
  ok(st1.plannerCalls === 1, '第 1 次 tick 规划了一次', st1.plannerCalls)
  const plan1 = latestPlan(h.kernel)
  const plan1Id = plan1 && plan1.id
  const plan1Validated = plan1 && plan1.canonical ? plan1.canonical.validated.length : 0
  ok(plan1Validated === 3, '第 1 次计划的 validated 是 3（horizon=3 以内全部执行）', plan1Validated)
  const plan1Outcomes = plan1 && plan1.canonical ? plan1.canonical.outcomes.length : 0
  ok(plan1Outcomes === 3, '★ 第 1 次计划实际执行了 3 个动作并逐条写回 outcome', plan1Outcomes)
  ok(st1.lastBrief && st1.lastBrief.last_plan === null, '第 1 次简报的 last_plan 为 null（没有可学的上一次）', st1.lastBrief && st1.lastBrief.last_plan)

  await tick(h, 31001)   // 超过 planMinIntervalMs，规划器被再次叫醒
  const st2 = v3PlannerStatus()
  ok(st2.plannerCalls === 2, '第 2 次 planner 回合被派出（简报是第 2 次）', st2.plannerCalls)
  const brief2 = st2.lastBrief
  ok(brief2 && brief2.last_plan !== null, '★ 第 2 次简报里 last_plan 不是 null（学习环接上了）', brief2 && brief2.last_plan)
  const outcomes2 = brief2 && brief2.last_plan && Array.isArray(brief2.last_plan.outcomes) ? brief2.last_plan.outcomes : null
  ok(outcomes2 !== null && outcomes2.length === plan1Validated,
    '★ 学习环：第 2 次简报的 last_plan.outcomes.length === 第 1 次计划 validated 的动作数',
    { got: outcomes2 && outcomes2.length, want: plan1Validated })
  ok(outcomes2 !== null && outcomes2.length === 3, '长度就是 3（不是 >=0 的恒真断言）', outcomes2 && outcomes2.length)
  let outcomesBool = 0
  for (const o of outcomes2 || []) if (typeof o.ok === 'boolean') outcomesBool += 1
  ok(outcomesBool === 3, '每个 outcome 都带布尔 ok', outcomesBool)
  ok(brief2 && brief2.last_plan && brief2.last_plan.planId === plan1Id, '简报里的 last_plan.planId 指回第 1 条计划记录', { got: brief2 && brief2.last_plan && brief2.last_plan.planId, want: plan1Id })
  // 简报真的进了第 2 个规划回合的提示。
  const plannerPrompts = h.delivered.filter((d) => d.member === PLANNER_MEMBER)
  ok(plannerPrompts.length === 2, '第 2 个规划器回合确实被投递（提示文本可检查）', plannerPrompts.length)
  const secondText = plannerPrompts.length === 2 ? plannerPrompts[1].text : ''
  ok(secondText.includes('"last_plan"'), '第 2 个规划回合的提示里有 last_plan 段', {})
  ok(secondText.includes('"outcomes"') && secondText.includes('"planId": "' + plan1Id + '"'), '提示里的 last_plan 带 outcomes 与第 1 条计划的 id', {})
}

console.log('=== 8. 容量与队列：maxLiveMembers=2 ⇒ 第 1 tick 执行 2 个、第 3 个排队；下一 tick 排空 ===')
{
  const h = boot({
    overrides: { 'vmu.limits.maxLiveMembers': 2 },
    replier: ({ turn }) => (turn.member === 'planner'
      ? planReply('三个动作', [
        { action: 'wait', target: 'q-1', reason: 'a' },
        { action: 'continue', target: 'q-1', reason: 'b' },
        { action: 'stop', target: 'q-1', reason: 'c' },
      ])
      : ACK),
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const plan1 = latestPlan(h.kernel)
  const c1 = plan1 && plan1.canonical ? plan1.canonical : {}
  ok(c1.validated && c1.validated.length === 3, '队列测试：3 个合法动作全部通过校验', c1.validated && c1.validated.length)
  ok(c1.outcomes && c1.outcomes.length === 2, '★ 按容量执行：本 tick 只执行 2 个（maxLiveMembers=2）', c1.outcomes && c1.outcomes.length)
  ok(c1.queued && c1.queued.length === 1, '★ 剩下的 1 个进队列（不是被丢）', c1.queued && c1.queued.length)
  ok(c1.status === 'partial', '计划状态是 partial（部分执行）', c1.status)
  await tick(h, 2000)   // 冷却期内不规划，但队列要排空
  const plan2 = latestPlan(h.kernel)
  const c2 = plan2 && plan2.canonical ? plan2.canonical : {}
  ok(plan2 && plan2.id === plan1.id, '排空发生在同一条计划记录上（不是新计划）', { before: plan1 && plan1.id, after: plan2 && plan2.id })
  ok(c2.outcomes && c2.outcomes.length === 3, '★ 下一 tick 把队列里的 1 个也执行了：outcomes 变 3', c2.outcomes && c2.outcomes.length)
  ok(Array.isArray(c2.queued) && c2.queued.length === 0, '队列已空', c2.queued && c2.queued.length)
  ok(c2.status === 'executed', '计划状态变为 executed', c2.status)
  ok(plan2 && plan2.rev >= 2, '计划记录被 supersede 过（历史可审计）', plan2 && plan2.rev)
}

console.log('=== 9. K10：turn/reply-parsed 上的归一化钩子（落盘 + rewriteResult），且非规划器/畸形回执不动 ===')
{
  const h = boot({ replier: () => ACK })
  await h.loader.apply(PACK)
  const reply = {
    progress: {
      track: PLAN_TRACK,
      kind: PLAN_KIND,
      title: 'v3 计划 hook',
      body: '- summary: 钩子归一化',
      tags: [tagOf({ action: 'wait', target: 'q-1', reason: '等' }), tagOf({ action: 'promote', target: 'p-1' })],
    },
  }
  const seen = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-hook', member: PLANNER_MEMBER, fields: ['progress'], reply }, { member: PLANNER_MEMBER, role: PLANNER_MEMBER, phase: 'normal' })
  ok(seen && seen.ok === true, '钩子没有让这次 emit 失败', seen && seen.ok)
  const decisions = (seen && Array.isArray(seen.decisions) ? seen.decisions : []).filter((d) => d && /v3-planner/.test(String(d.id)))
  ok(decisions.length === 1, '恰好一个 planner 条目给出了 decision', decisions.map((d) => d && d.id))
  const rewritten = h.kernel.bus.rewriteOf('turn/reply-parsed', seen)
  ok(typeof rewritten === 'string', '★ K10：rewriteOf 拿到了规划器改写的回执（字符串）', typeof rewritten)
  let normalized = null
  try { normalized = JSON.parse(String(rewritten)) } catch { normalized = null }
  ok(normalized !== null && normalized.summary === '钩子归一化', '改写后的回执是归一化 JSON：summary 来自 `- summary:` 行', normalized && normalized.summary)
  ok(normalized !== null && Array.isArray(normalized.plan) && normalized.plan.length === 2, '改写后的回执里 plan 是 2 个动作（tag 解码，不是原样搬运）', normalized && normalized.plan && normalized.plan.length)
  const plans = h.kernel.records.list({ track: PLAN_TRACK, limit: 0 })
  ok(plans.items.length === 1, '★ 钩子替原始载荷把计划记录落到了 plans 轨（有 bus 时原始载荷不会走到派发器）', plans.items.length)
  if (plans.items.length === 1) {
    const rec = h.kernel.records.get({ id: plans.items[0].id })
    const raw = readRawPlan(rec)
    ok(raw.actions.length === 2 && raw.summary === '钩子归一化', '落盘的原始记录可被 tick 侧的统一读取器读出（两条路同一形状）', raw)
  }
  // 非规划器成员：什么都不做。
  const seenOther = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-x', member: 'solver', reply: { prioritize: 'x' } }, { member: 'solver' })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', seenOther) === null, '非规划器成员的回执不被改写（null）', {})
  ok(h.kernel.records.list({ track: PLAN_TRACK, limit: 0 }).items.length === 1, '非规划器成员的 emit 不写 plans 轨', h.kernel.records.list({ track: PLAN_TRACK, limit: 0 }).items.length)
  // 规划器但畸形回执（没有 progress）：不改写、不写入 —— 由 tick 侧计为一次具名失败。
  const seenBad = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-y', member: PLANNER_MEMBER, reply: { prioritize: 'x' } }, { member: PLANNER_MEMBER })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', seenBad) === null, '畸形规划器回执不被改写（不假装归一化成功）', {})
  ok(h.kernel.records.list({ track: PLAN_TRACK, limit: 0 }).items.length === 1, '畸形回执不写 plans 轨', h.kernel.records.list({ track: PLAN_TRACK, limit: 0 }).items.length)
}

console.log('=== 10. 规划器失败：不可解析的回执 ⇒ 具名失败计数 + journal 记录；到 plannerMaxFails 自禁用 ===')
{
  const h = boot({
    overrides: { 'vmu.v3.plannerMaxFails': 1 },
    replier: ({ turn }) => (turn.member === 'planner' ? '这不是 JSON，也不是围栏——规划器没按契约回答。' : ACK),
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  const r = await tick(h, 3000)
  ok(r && r.ok === true, '规划器回合失败不会让 tick 失败（failure:open，失败以回执/审计具名）', r && r.ok)
  const st = v3PlannerStatus()
  ok(st.plannerCalls === 0, '没有产出计划 ⇒ 不计成功调用', st.plannerCalls)
  ok(st.fails === 1, '★ 连续失败计数 = 1', st.fails)
  ok(st.lastError && st.lastError.code === 'VMU_TURN_NO_FENCE', '失败回执带具名码 VMU_TURN_NO_FENCE（不是"parse 失败"四个字）', st.lastError && st.lastError.code)
  ok(st.disabled === true, '★ 达到 plannerMaxFails=1 ⇒ 规划器自禁用（不静默地一直重试）', st.disabled)
  const journal = h.kernel.records.list({ track: 'journal', limit: 0 }).items
    .map((x) => h.kernel.records.get({ id: x.id }))
    .filter((rec) => /v3 planner attempt failed/.test(String(rec.title)))
  ok(journal.length === 1, 'journal 轨上有一条具名的失败记录', journal.length)
  ok(journal.length === 1 && /VMU_TURN_NO_FENCE/.test(String(journal[0].body)), '失败记录正文里带错误码', journal[0] && String(journal[0].body).slice(0, 120))
  // ★ SLV DIAGNOSTIC: after NO_FENCE the next question is "what did the reply ACTUALLY contain?" - the record must be
  // answerable without re-running. Bounded excerpt + length + hadBrace (this replier writes prose with no brace).
  const failureBody = journal.length === 1 ? String(journal[0].body) : ''
  ok(/replyExcerpt: "/.test(failureBody) && /这不是 JSON/.test(failureBody),
    '★ 失败记录带截断的 reply 原文（可直接回答"空文本？prose？工具对象？"）', failureBody.slice(0, 200))
  ok(/replyLength: \d+/.test(failureBody) && /hadBrace: false/.test(failureBody),
    '★ 并且带 replyLength 与 hadBrace（本回复是 prose、没有花括号）', failureBody.slice(0, 200))
  ok(st.lastError && st.lastError.replyExcerpt && st.lastError.replyLength > 0 && st.lastError.hadBrace === false,
    '★ 状态回执 lastError 也带同一份诊断（不只在 journal 正文里）', st.lastError && { code: st.lastError.code, len: st.lastError.replyLength, brace: st.lastError.hadBrace })
  await tick(h, 40000)
  ok(v3PlannerStatus().plannerCalls === 0, '自禁用后不再派出规划回合', v3PlannerStatus().plannerCalls)
  ok(v3PlannerStatus().lastSkip && v3PlannerStatus().lastSkip.reason === 'planner-self-disabled', '跳过理由是具名的 planner-self-disabled', v3PlannerStatus().lastSkip)
}

console.log('=== 11. 纯函数面：validatePlan 的计数可独立复现（RULE E：先钉条数再逐项） ===')
{
  const problems = { items: [{ id: 'q-1', recordId: 'r-1', card: { id: 'q-1', 状态: '求解中', 优先级: 1 } }, { id: 'q-2', recordId: 'r-2', card: { id: 'q-2', 状态: '已解决', 优先级: 1 } }] }
  const propos = { items: [{ id: 'p-1', recordId: 'r-3', card: { id: 'p-1', 概率: 0.5 } }, { id: 'p-2', recordId: 'r-4', card: { id: 'p-2', 概率: 1 } }] }
  const res = validatePlan([
    { action: 'spawn', role: 'explorer', target: 'q-1' },
    { action: 'spawn', role: 'explorer', target: 'q-2' },       // 已解决 ⇒ 拒
    { action: 'spawn', role: 'solver', target: 'q-1' },         // 缺 direction ⇒ 拒
    { action: 'promote', target: 'p-1' },
    { action: 'promote', target: 'p-2' },                       // 已定论 ⇒ 拒
    { action: 'interrupt' },                                    // 缺 childId ⇒ 拒
    { action: 'wait', target: 'q-1' },
    { action: 'wait', target: 'q-1' },                          // 重复
    { action: 'nope' },                                         // 未知动作
  ], { horizon: 2, problems, propos })
  ok(res.validated.length === 2, 'horizon=2 ⇒ 只保留 2 个合法动作', res.validated.length)
  ok(res.rejected === 5, '被拒 5 个（已解决/缺 direction/已定论/缺 childId/未知动作）', res.rejected)
  ok(res.duplicates === 1, '重复 1 个（同键去重，独立计数）', res.duplicates)
  ok(res.truncated === 1, '合法但超出 horizon 的 1 个被截断', res.truncated)
  ok(res.rejectReasons.length === 5, '5 条拒绝原因都点名了', res.rejectReasons.length)
  ok(res.validated[0].action === 'spawn' && res.validated[0].role === 'explorer', '保留下来的第一条是 explorer spawn q-1', res.validated[0])
}

console.log('=== 11b. P0-8 人工门（plan）：manual 下计划排队且**真的没执行**；approve 只放行那一条 ===')
{
  const plan = [
    { action: 'spawn', role: 'solver', target: 'q-1', direction: 'd1' },
    { action: 'spawn', role: 'solver', target: 'q-1', direction: 'd2' },
  ]
  const h = boot({ overrides: { 'vmu.v3.mode': 'manual', 'vmu.v3.planMinIntervalMs': 0 }, replier: ({ turn }) => (turn.member === PLANNER_MEMBER ? planReply('两个 solver', plan) : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 3000)
  const canonical = latestPlan(h.kernel)
  ok(canonical && canonical.canonical && canonical.canonical.status === 'awaiting-approval',
    '★ manual：计划记录的 status 是 awaiting-approval（不是 executed/queued）', canonical && canonical.canonical && canonical.canonical.status)
  ok(canonical && canonical.canonical && typeof canonical.canonical.gateId === 'string' && canonical.canonical.gateId.length > 0,
    '★ 计划记录带 gateId（门与计划互相可追）', canonical && canonical.canonical && canonical.canonical.gateId)
  ok(canonical && canonical.canonical && canonical.canonical.outcomes.length === 0 && canonical.canonical.queued.length === 2,
    '★ 0 条 outcome、2 条 queued（一条都没执行）', canonical && canonical.canonical && { outcomes: canonical.canonical.outcomes.length, queued: canonical.canonical.queued.length })
  const solverTurns = h.delivered.filter((d) => d.member === 'solver')
  ok(solverTurns.length === 0, '★★ manual 下**真的没执行**：solver 回合投递 0 次（不是"记录了但还在跑"）', solverTurns.length)
  ok(v3PlannerStatus().lastExecuted === 0, '★★ 规划器自报 lastExecuted=0（执行计数为 0，不是被记录成执行过）', v3PlannerStatus().lastExecuted)
  const gatesNow = listGates({ records: h.kernel.records })
  ok(gatesNow.counts.pending === 1 && gatesNow.pending[0].kind === 'plan',
    '★ 台账里恰好 1 扇 pending 的 plan 门（门类正确）', gatesNow.pending.map((g) => g.kind))
  ok(gatesNow.pending[0].subject === canonical.id, '门的 subject 指向那条计划记录', gatesNow.pending[0].subject)

  // 第二个 tick：仍在等同一扇门 ⇒ **不重复开门**（否则 manual 下每 tick 刷一扇，台账就成噪声）。
  await tick(h, 4000)
  const gatesAgain = listGates({ records: h.kernel.records })
  ok(gatesAgain.counts.total === 1 && gatesAgain.counts.pending === 1, '★ 第二次 tick 不重复开门（台账仍只有 1 条）', gatesAgain.counts)
  const solverTurns2 = h.delivered.filter((d) => d.member === 'solver')
  ok(solverTurns2.length === 0, '★ 第二次 tick 之后仍然 0 次 solver 回合（门没放行就绝不执行）', solverTurns2.length)

  // 另开一扇"别的计划"的门：批准第一扇时它必须**仍 pending**（"只那一条执行"）。
  const other = createGate({ records: h.kernel.records, at: 4500, kind: 'plan', subject: 'other-plan', payload: { planId: 'other-plan', actions: [] }, why: 'second plan waiting' })
  const gateId = gatesAgain.pending[0].gateId
  const approved = await approveGate({ records: h.kernel.records, gateId, by: 'human', at: 5000, reason: 'looks fine' })
  ok(approved.ok === true && approved.executed === true && approved.gate.status === 'released',
    '★ approve 之后执行器真的跑了（executed:true、终态 released）', approved.gate && approved.gate.status)
  await h.kernel.turn.whenIdle()   // ★ two-phase: the approved plan's solver turns are DISPATCHED; wait for the queue deterministically
  const solverTurns3 = h.delivered.filter((d) => d.member === 'solver')
  ok(solverTurns3.length === 2, '★★ 只那一条计划被执行：恰好 2 个 solver 回合（就是被批准计划的两条动作）', solverTurns3.length)
  const releasedPlan = latestPlan(h.kernel)
  ok(releasedPlan && releasedPlan.canonical && releasedPlan.canonical.status === 'executed' && releasedPlan.canonical.outcomes.length === 2,
    '★ 放行后计划记录落终态 executed、outcomes=2', releasedPlan && releasedPlan.canonical && { status: releasedPlan.canonical.status, outcomes: releasedPlan.canonical.outcomes.length })
  const gatesAfter = listGates({ records: h.kernel.records })
  ok(gatesAfter.counts.pending === 1 && gatesAfter.pending[0].gateId === other.gateId,
    '★★ 另一扇门（未被批准）仍然 pending —— "只那一条"不是"全都放行"', gatesAfter.pending.map((g) => g.gateId))
  ok(gatesAfter.counts.byStatus.released === 1, '台账：恰好 1 条 released', gatesAfter.counts.byStatus)
}

console.log('=== 11c. P0-8 人工门：auto 零延迟直通；manual 排队后切 auto ⇒ 一拍 tick 全部放行 ===')
{
  // auto：计划直接执行，**一条门记录都不写**（零延迟、零台账）。
  const plan = [{ action: 'spawn', role: 'solver', target: 'q-1', direction: 'd1' }]
  const hAuto = boot({ replier: ({ turn }) => (turn.member === PLANNER_MEMBER ? planReply('一个 solver', plan) : ACK) })
  await hAuto.loader.apply(PACK)
  problemCard(hAuto.kernel, 'q-1')
  await tick(hAuto, 3000)
  const autoCanonical = latestPlan(hAuto.kernel)
  ok(autoCanonical && autoCanonical.canonical && autoCanonical.canonical.status === 'executed',
    '★ auto：计划直接 executed（零延迟，没有停在 awaiting）', autoCanonical && autoCanonical.canonical && autoCanonical.canonical.status)
  const autoGates = listGates({ records: hAuto.kernel.records })
  ok(autoGates.counts.total === 0, '★ auto：台账 0 条（auto 直通不写门记录）', autoGates.counts)
  const autoSolver = hAuto.delivered.filter((d) => d.member === 'solver')
  ok(autoSolver.length === 1, '★ auto：动作真的执行了（1 个 solver 回合）', autoSolver.length)

  // manual → auto：同一内核切模式后**一拍 tick** 把 pending 全部放行。
  const h = boot({ overrides: { 'vmu.v3.mode': 'manual', 'vmu.v3.planMinIntervalMs': 0 }, replier: ({ turn }) => (turn.member === PLANNER_MEMBER ? planReply('一个 solver', plan) : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 3000)
  const pendingBefore = listGates({ records: h.kernel.records }).counts.pending
  const solverBefore = h.delivered.filter((d) => d.member === 'solver')
  ok(pendingBefore === 1 && solverBefore.length === 0, '切换前：1 扇 pending、0 次执行', { pending: pendingBefore, solver: solverBefore.length })
  h.kernel.setSettingsValue('vmu.v3.mode', 'auto')
  await tick(h, 5000) // ★ 只跑这一拍
  const pendingAfter = listGates({ records: h.kernel.records }).counts.pending
  const solverAfter = h.delivered.filter((d) => d.member === 'solver')
  ok(pendingAfter === 0, '★★ 切 auto 后一拍 tick：pending 清零（不是等下一次规划）', pendingAfter)
  ok(solverAfter.length === 1, '★★ 同一拍里动作被放行执行（solver 回合 1 次）', solverAfter.length)
  const switched = latestPlan(h.kernel)
  ok(switched && switched.canonical && switched.canonical.status === 'executed', '切 auto 放行后计划记录落 executed', switched && switched.canonical && switched.canonical.status)
}

console.log('=== 12. 真机装配路径：packs:[v3] ⇒ 规划段被晚注册（带 scope），规划器条目上总线 ===')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const hostState = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { hostState.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { hostState.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v3'] })
  await handle.ready()
  ok(handle.packErrors().length === 0, '真实入口装载 packs=[v3] 无错', handle.packErrors())
  const sections = handle.kernel.prompt.status().sections
  const plannerSection = sections.find((s) => s.name === 'v3-planner')
  ok(plannerSection !== undefined, '★ 规划器提示段经清单 sections 通道在真实装配里注册了', sections.map((s) => s.name))
  ok(plannerSection && plannerSection.scope && plannerSection.scope.role === 'planner', '真实装配里的段仍带 scope.role=planner（不串味到别的角色）', plannerSection && plannerSection.scope)
  const busEntries = handle.kernel.bus.entries().map((e) => e.id + ':' + (e.on || []).join('|'))
  ok(busEntries.some((x) => x.startsWith('v3-planner:') && x.includes('v3/tick')), '规划器经真实 pack 路径挂上了 v3/tick', busEntries)
  ok(busEntries.some((x) => x.startsWith('v3-planner:') && x.includes('turn/reply-parsed')), '规划器的 turn/reply-parsed 归一化钩子也挂上了总线', busEntries)
  ok(handle.appliedPacks().some((p) => p.id === 'v3'), 'pack v3 被记为已应用', handle.appliedPacks().map((p) => p.id))
  for (const cleanup of handle.cleanups || []) { try { cleanup() } catch { /* unwind is the host's job */ } }
}

// ── 11. P1-1 幂等：同一个 rId 的第二次派发是【具名跳过】 ─────────────────────────────────────────────────
{
  const h = boot({
    replier: ({ turn }) => (turn.role === PLANNER_MEMBER
      ? planReply('派 verifier 验证 r-1', [{ action: 'spawn', role: 'verifier', target: 'r-1', reason: '验证候选 r-1' }])
      : ACK),
    overrides: { 'vmu.v3.planMinIntervalMs': 0 },
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const f0 = latestPlan(h.kernel).canonical.outcomes[0]
  ok(f0 && f0.ok === true && f0.skipped === undefined && f0.turn !== undefined,
    '第一次派发真的建了回合（outcome 带 turn id，而不是跳过）', f0)
  // ★ SLV / RED LINE: "accepted/dispatched" must NOT be reported as executed. The spawned outcome says exactly that.
  ok(f0 && f0.dispatched === true && f0.executed === false && f0.status === 'dispatched',
    '★ 计划 outcome 区分 dispatched 与 executed：派发成功 = dispatched:true / executed:false', f0 && { d: f0.dispatched, e: f0.executed, s: f0.status })
  const afterFirst = h.delivered.filter((d) => d.role === 'verifier').length
  ok(afterFirst === 1, '第一次派发投递了恰好 1 个 verifier 回合', afterFirst)
  await tick(h, 2000)
  const f1 = latestPlan(h.kernel).canonical.outcomes[0]
  ok(f1 && f1.ok === true && f1.skipped === 'already-dispatched',
    '★ 第二次派发自报 skipped=already-dispatched（不是静默）', f1)
  ok(f1 && f1.code === 'VMU_PACK_V3_DUPLICATE_DISPATCH',
    '★ 跳过带已登记具名码 VMU_PACK_V3_DUPLICATE_DISPATCH', f1 && f1.code)
  ok(f1 && f1.previousTurn !== null && f1.previousTurn !== undefined,
    '跳过回执带前一次 turn id（能追到“已经建过的是哪一个”）', f1 && f1.previousTurn)
  const afterSecond = h.delivered.filter((d) => d.role === 'verifier').length
  ok(afterSecond === 1, '★ 第二次没有建第二个回合（投递数仍是 1）——这是“具名跳过”与“恰好没动”的区别', afterSecond)
  ok(v3PlannerStatus().dispatched === 1, '派发幂等账只登记 1 个键', v3PlannerStatus().dispatched)
}

// ── 12. P1-1 依赖：未就绪目标被拒并点名 ────────────────────────────────────────────────────────────────
{
  const h = boot({
    replier: ({ turn }) => (turn.role === PLANNER_MEMBER
      ? planReply('派 q-dep', [{ action: 'spawn', role: 'solver', target: 'q-dep', direction: 'd-1', reason: '推进' }])
      : ACK),
    overrides: { 'vmu.v3.planMinIntervalMs': 0 },
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-dep', { 依赖: ['q-missing'] })
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const c = latestPlan(h.kernel).canonical
  ok(c && c.validated.length === 0 && c.outcomes.length === 0,
    '★ 依赖未就绪的动作既未 validated 也未执行', c && { validated: c.validated.length, outcomes: c.outcomes.length })
  ok(c && Array.isArray(c.rejectReasons) && c.rejectReasons.some((r) => /dependency-not-ready:q-dep/.test(String(r.why))),
    '★ 拒绝原因点名 dependency-not-ready:q-dep（不丢）', c && c.rejectReasons)
  ok(h.delivered.filter((d) => d.role === 'solver').length === 0, '没有 solver 回合被投递', h.delivered.filter((d) => d.role === 'solver').length)
  problemCard(h.kernel, 'q-wait', { 状态: '等待依赖' })
  const adv = advanceableProblems(loadCardIndex(h.kernel.records, 'problems', 'problem'), verifiedIds(h.kernel.records)).map((p) => p.id)
  ok(adv.includes('q-1') && !adv.includes('q-wait') && !adv.includes('q-dep'),
    '★ 可推进集合排除「等待依赖」与依赖未就绪', { adv })
}

// ── 13. P1-1 已验不再调度：verified 轨上的对象不进入候选 ───────────────────────────────────────────────
{
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-ver', { 状态: '求解中' })
  writeCard({
    records: h.kernel.records, kind: 'verified',
    card: { id: 'q-ver', 标题: '已验证 q-ver', 类型: '问题', 结论: true, 概率: 1, 分类: '未分类', 来源: 'q-ver', 时间: '2026-10-19 00:00', 陈述: '陈述 q-ver。', 内容: '结论' },
  })
  const vids = verifiedIds(h.kernel.records)
  ok(vids.has('q-ver'), 'verifiedIds 读到 verified 轨上的逻辑 id', [...vids])
  ok(advanceableProblems(loadCardIndex(h.kernel.records, 'problems', 'problem'), vids).some((p) => p.id === 'q-ver') === false,
    '★ 已验对象被排除出可推进候选（依据是 verified 轨，不是“状态恰好已解决”）')
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-ver', 标题: '命题 p-ver', 概率: 0.5, 陈述: '陈述 p-ver。', 价值关键性: 0.9 } })
  writeCard({
    records: h.kernel.records, kind: 'verified',
    card: { id: 'p-ver', 标题: '已验证 p-ver', 类型: '命题', 结论: true, 概率: 1, 分类: '未分类', 来源: 'p-ver', 时间: '2026-10-19 00:00', 陈述: '陈述 p-ver。', 内容: '结论' },
  })
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const ids = loadCardIndex(h.kernel.records, 'problems', 'problem').items.map((p) => p.id)
  ok(!ids.includes(promotedProblemId('p-ver')), '★ 已验命题不会被自动晋升（候选集合里没有它）', ids)
}

// ── 14. P1-1 容量：超 maxParallel 的动作进队列（不丢），下一 tick 排空 ──────────────────────────────────
{
  const h = boot({
    replier: ({ turn }) => (turn.role === PLANNER_MEMBER
      ? planReply('派两个 solver', [
        { action: 'spawn', role: 'solver', target: 'q-a', direction: 'd-1', reason: '推进 a' },
        { action: 'spawn', role: 'solver', target: 'q-b', direction: 'd-1', reason: '推进 b' },
      ])
      : ACK),
    overrides: { 'vmu.v3.planMinIntervalMs': 0, 'vmu.limits.maxParallel': 1 },
  })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-a'); problemCard(h.kernel, 'q-b')
  await tick(h, 1000)
  const c1 = latestPlan(h.kernel).canonical
  ok(c1 && c1.outcomes.length === 1 && c1.queued.length === 1,
    '★ maxParallel=1 ⇒ 本 tick 执行 1 个、另一个进 queued（不丢）', c1 && { executed: c1.outcomes.length, queued: c1.queued.length })
  ok(c1 && c1.queued.length === 1 && c1.queued[0] && c1.queued[0].target !== undefined,
    '排队动作保留完整字段，下一 tick 能原样执行', c1 && c1.queued[0])
  await tick(h, 2000)
  ok(h.delivered.filter((d) => d.role === 'solver').length === 2,
    '★ 下一 tick 排空队列：两个 solver 回合最终都投递了（队列不丢）', h.delivered.filter((d) => d.role === 'solver').length)
}

// ── 15. P1-3 阈值边界：0.699 不晋升 ／ 0.7 晋升 ／ 0.701 晋升 ────────────────────────────────────────────
const promoteOnce = async (value) => {
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-edge', 标题: '命题 p-edge', 概率: 0.5, 陈述: '陈述 p-edge。', 价值关键性: value } })
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const ids = loadCardIndex(h.kernel.records, 'problems', 'problem').items.map((p) => p.id)
  return { promoted: ids.includes(promotedProblemId('p-edge')), status: v3PlannerStatus() }
}
{
  const below = await promoteOnce(0.699)
  ok(below.promoted === false, '★ 0.699 < 0.7 ⇒ 不晋升（边界下方不误触）', below.status.lastPromotion)
  const atEdge = await promoteOnce(0.7)
  ok(atEdge.promoted === true, '★ 0.7 == 阈值 ⇒ 晋升（v3 是 >=，边界包含）', atEdge.status.lastPromotion)
  ok(atEdge.status.lastPromotion && atEdge.status.lastPromotion.value === 0.7,
    '晋升回执记下触发值 0.7（数字可核对）', atEdge.status.lastPromotion)
  const above = await promoteOnce(0.701)
  ok(above.promoted === true, '★ 0.701 > 0.7 ⇒ 晋升（边界上方也触发）', above.status.lastPromotion)
}

// ── 16. P1-3 每 tick 至多一个晋升 ＋ 双向可追 ──────────────────────────────────────────────────────────
{
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  for (const [id, value] of [['p-a', 0.9], ['p-b', 0.8], ['p-c', 0.75]]) {
    writeCard({ records: h.kernel.records, kind: 'proposition', card: { id, 标题: '命题 ' + id, 概率: 0.5, 陈述: '陈述 ' + id + '。', 价值关键性: value } })
  }
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const afterOne = loadCardIndex(h.kernel.records, 'problems', 'problem').items.map((p) => p.id).filter((id) => id.startsWith('q-promoted-'))
  ok(afterOne.length === 1, '★ 三个都过阈值，第 1 个 tick 只晋升 1 个', afterOne)
  ok(v3PlannerStatus().promotions === 1, '晋升计数 = 1', v3PlannerStatus().promotions)
  const first = v3PlannerStatus().lastPromotion
  await tick(h, 2000)
  const afterTwo = loadCardIndex(h.kernel.records, 'problems', 'problem').items.map((p) => p.id).filter((id) => id.startsWith('q-promoted-'))
  ok(afterTwo.length === 2 && v3PlannerStatus().promotions === 2,
    '★ 第 2 个 tick 再晋升 1 个（两 tick 共 2 个，不是一次全推）', { afterTwo, promotions: v3PlannerStatus().promotions })
  ok(v3PlannerStatus().lastPromotion.propositionId !== first.propositionId,
    '第 2 个 tick 晋升的是另一个命题（不是重复晋升第 1 个）', v3PlannerStatus().lastPromotion)
  const pIdx = loadCardIndex(h.kernel.records, 'propos', 'proposition')
  const qid = promotedProblemId(first.propositionId)
  const qCard = loadCardIndex(h.kernel.records, 'problems', 'problem').items.find((p) => p.id === qid)
  const pCard = pIdx.items.find((p) => p.id === first.propositionId)
  ok(qCard && String(qCard.card.来源命题) === first.propositionId,
    '★ 问题侧可追：判断命题问题的 `来源命题` 指回原命题', qCard && qCard.card.来源命题)
  ok(pCard && String(pCard.card.晋升问题) === qid,
    '★ 命题侧可追：原命题的 `晋升问题` 指回晋升出的问题（双向互指）', pCard && pCard.card.晋升问题)
  const check = validatePlan([{ action: 'promote', target: first.propositionId }], {
    horizon: 3, problems: loadCardIndex(h.kernel.records, 'problems', 'problem'), propos: pIdx,
  })
  ok(check.validated.length === 0 && check.rejectReasons.some((r) => /already-promoted/.test(String(r.why))),
    '对已晋升命题再次 promote：被拒且点名 already-promoted（幂等第二道门）', check.rejectReasons)
}

// ── 17. P1-4 子问题三对象：一次 q_sub **恰 3 个**、重复去重、来源/动机逐字段非空 ─────────────────────────
{
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  writeCard({ records: h.kernel.records, kind: 'problem', card: { id: 'q-parent', 标题: '父问题', 状态: '求解中', 陈述: '父问题陈述。' } })
  const sq = { q_sub_statement: '辅助猜想 A：对任意 n，P(n) 成立。', q_sub_title: '辅助猜想 A', assumption_statement: '假设辅助猜想 A 成立。' }
  const first = registerSubQuestions({ records: h.kernel.records, qid: 'q-parent', dirId: 'd-1', subQuestions: [sq], at: 1000 })
  ok(first.ok === true && first.created === 3, '★ 一次 q_sub 恰好创建 3 个对象（不是 >=3）', first)
  const ids = subQuestionIds({ qid: 'q-parent', dirId: 'd-1', statement: sq.q_sub_statement })
  const newProblems = loadCardIndex(h.kernel.records, 'problems', 'problem').items.filter((p) => p.id === ids.subId || p.id === ids.judgeId)
  const newPropos = loadCardIndex(h.kernel.records, 'propos', 'proposition').items.filter((p) => p.id === ids.assumeId)
  ok(newProblems.length === 2 && newPropos.length === 1, '★ 三个对象：2 个问题 ＋ 1 个命题', { problems: newProblems.length, propos: newPropos.length })
  const second = registerSubQuestions({ records: h.kernel.records, qid: 'q-parent', dirId: 'd-1', subQuestions: [sq], at: 1100 })
  ok(second.created === 0 && second.duplicate === 1, '★ 重复 q_sub 被去重：created=0、duplicate=1', second)
  const stillThree = loadCardIndex(h.kernel.records, 'problems', 'problem').items.filter((p) => p.id === ids.subId || p.id === ids.judgeId).length
    + loadCardIndex(h.kernel.records, 'propos', 'proposition').items.filter((p) => p.id === ids.assumeId).length
  ok(stillThree === 3, '★ 二次入队后仍是 3 个对象（不是 3+3）', stillThree)
  ok(newProblems.length === 2 && newProblems.every((p) => String(p.card.来源 || '').trim() !== ''),
    '★ 两个子问题对象的来源都非空（逐字段，空串算空）', newProblems.map((p) => p.card.来源))
  ok(newProblems.length === 2 && newProblems.every((p) => String(p.card.动机 || '').trim() !== ''),
    '★ 两个子问题对象的动机都非空', newProblems.map((p) => p.card.动机))
  ok(newProblems.length === 2 && newProblems.every((p) => String(p.card.来源与动机 || '').trim() !== ''),
    '★ 两个子问题对象的来源与动机段都非空', newProblems.map((p) => p.card.来源与动机))
  const prop = newPropos[0]
  ok(prop && String(prop.card.来源 || '').trim() !== '' && String(prop.card.动机 || '').trim() !== '',
    '临时假设命题：来源与动机都非空', prop && { 来源: prop.card.来源, 动机: prop.card.动机 })
  ok(prop && String(prop.card.来源问题 || '') === 'q-parent' && String(prop.card.来源方向 || '') === 'd-1',
    '临时假设命题指回父问题与方向', prop && { 来源问题: prop.card.来源问题, 来源方向: prop.card.来源方向 })
  const api = { services: { names: () => ['vmu.records'], get: (n) => (n === 'vmu.records' ? h.kernel.records : null) } }
  const sq2 = { q_sub_statement: '辅助猜想 B：对任意 n，Q(n) 成立。', q_sub_title: '辅助猜想 B' }
  await V3_SUBQUESTIONS_MODULE.hooks['turn/reply-parsed']({ api, reply: { meta: { qid: 'q-parent', dirId: 'd-1' }, sub_questions: [sq2] }, at: 1200 })
  const bIds = subQuestionIds({ qid: 'q-parent', dirId: 'd-1', statement: sq2.q_sub_statement })
  ok(loadCardIndex(h.kernel.records, 'problems', 'problem').items.filter((p) => p.id === bIds.subId || p.id === bIds.judgeId).length === 2,
    '钩子路径（turn/reply-parsed）也注册了 2 个问题对象（不是只有直调函数能用）')
}

// ── 18. P1-5 汇报三路：file 段可解析、push 仅在 mode 允许时、报告计数与 status 同源 ─────────────────────
{
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  writeCard({ records: h.kernel.records, kind: 'problem', card: { id: 'q-r', 标题: '报告问题', 状态: '求解中', 陈述: 'x' } })
  await tick(h, 1000)
  const reports = h.kernel.records.list({ track: REPORTS_TRACK, limit: 0 }).items
  ok(reports.length === 1, '★ file 路真的落了一条 reports 记录（不是只在内存计数）', reports.length)
  const rec = h.kernel.records.get({ id: reports[0].id })
  let parsed = null
  try { parsed = JSON.parse(rec.body) } catch { parsed = null }
  ok(parsed && parsed.kind === 'v3-report' && parsed.counts && Number.isInteger(parsed.counts.problems),
    '★ 落盘正文可解析为 JSON 且带 counts', parsed && parsed.kind)
  const st = v3ReportsStatus()
  ok(st.writes >= 1 && st.lastReport && st.lastReport.recordId === reports[0].id,
    'status 报出写入次数与最近一条报告 id', { writes: st.writes, last: st.lastReport })
  ok(parsed && st.lastReport && parsed.counts.problems === st.lastReport.counts.problems,
    '★ 报告计数与 status 是同一个数字（同一份快照）', { report: parsed && parsed.counts.problems, status: st.lastReport && st.lastReport.counts.problems })
  ok(st.pushSkips >= 1 && ((st.lastSkip && st.lastSkip.reason === 'push-not-allowed-by-mode') || (st.lastPushSkip && st.lastPushSkip.reason === 'push-not-allowed-by-mode')),
    '★ 默认 mode=file ⇒ push 不推，并自报 push-not-allowed-by-mode', st.lastSkip)
  const calls = []
  const fake = { emit: (args) => { calls.push(args); return { ok: true, delivered: true } } }
  const pushed = pushReport({ reportService: fake, report: buildReport({ records: h.kernel.records, at: 2000 }), at: 2000, mode: 'push' })
  ok(pushed.ok === true && pushed.pushed === true && pushed.delivered === true && calls.length === 1,
    '★ mode=push ⇒ 真的调用 report 服务 emit', pushed)
  const notAllowed = pushReport({ reportService: fake, report: buildReport({ records: h.kernel.records, at: 3000 }), at: 3000, mode: 'file' })
  ok(notAllowed.pushed === false && notAllowed.skipped === 'push-not-allowed-by-mode' && calls.length === 1,
    '★ mode=file ⇒ 不调用服务（调用数不增），并具名跳过', notAllowed)
}

// ── 19. P1-8 Lean 三档：off 零策略／encourage 不阻断／require fail-closed 且留档 ─────────────────────────
{
  const { leanPromptPolicy, leanGateDecision, leanEvidence, recordLeanEvidence, LEAN_SECTION, LEAN_GATE_CODE,
    leanBearingSections, V3_LEAN_GATE_MODULE } = await import('../vibe-math-vmu/packs/v3/middleware/lean-gate.js')
  const settingsOf = (mode) => ({ 'vmu.math.formalVerify': mode })
  // ① 段文本：Lean 字样只存在于唯一一段（v3-verifier-lean），off 档该段被策略关闭
  const bearing = leanBearingSections(PACK.sections)
  ok(bearing.length === 1 && bearing[0] === LEAN_SECTION,
    '★ 三档测试的可扫描前提：Lean 字样只出现在一段（' + LEAN_SECTION + '）', bearing)
  const enabledText = (mode) => {
    const decisions = leanPromptPolicy({ settings: settingsOf(mode) }).decisions
    const byName = new Map(decisions.map((d) => [d.name, d.enabled]))
    return PACK.sections.filter((s) => byName.get(s.name) !== false).map((s) => s.text).join('\n')
  }
  ok(!/Lean|形式化/.test(enabledText('off')),
    '★ off ⇒ 提示词零 Lean 字样（把被策略关闭的段去掉后，全文扫描 /Lean|形式化/ 不命中）')
  ok(/Lean/.test(enabledText('encourage')) && /Lean/.test(enabledText('require')),
    '★ encourage / require ⇒ Lean 段是启用的（提示词里有 Lean 字样）')
  ok(leanPromptPolicy({ settings: settingsOf('off') }).decisions[0].enabled === false
    && leanPromptPolicy({ settings: settingsOf('encourage') }).decisions[0].enabled === true,
    '策略按档位开关同一段（不是两套提示词）')
  // ② 纯判定：off/encourage 不阻断；require 只有 passed 放行
  ok(leanGateDecision({ mode: 'off' }).allow === true && leanGateDecision({ mode: 'encourage' }).allow === true,
    '★ off / encourage ⇒ 无证据也不阻断裁定')
  const noEv = leanGateDecision({ mode: 'require', target: 'p-1', evidence: null })
  ok(noEv.allow === false && noEv.code === LEAN_GATE_CODE, '★ require + 无证据 ⇒ fail-closed（带 code）', noEv)
  ok(leanGateDecision({ mode: 'require', target: 'p-1', evidence: { status: 'blocked' } }).allow === false,
    '★ require + blocked ⇒ 也不放行（blocked 不是 passed）')
  ok(leanGateDecision({ mode: 'require', target: 'p-1', evidence: { status: 'passed' } }).allow === true,
    '★ require + passed ⇒ 放行')
  // ③ 钩子路径：require 档 deny，对象**留在原轨**（状态不变、不进 verified），不是消失
  const h = boot({ overrides: { 'vmu.math.formalVerify': 'require', 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-lean', 标题: '命题 p-lean', 概率: 0.5, 陈述: '陈述 p-lean。' } })
  const callGate = (target) => V3_LEAN_GATE_MODULE.hooks['ballot/tally']({
    api: { services: { names: () => ['vmu.records'], get: (n) => (n === 'vmu.records' ? h.kernel.records : null) }, setting: (k) => (k === 'vmu.math.formalVerify' ? 'require' : undefined) },
    at: 1000, payload: { target },
  })
  const deny = await callGate('p-lean')
  ok(deny && deny.deny && deny.deny.code === LEAN_GATE_CODE,
    '★ 钩子（ballot/tally）在 require 档无证据 ⇒ 返回具名 deny（带 code/hint）', deny)
  const still = loadCardIndex(h.kernel.records, 'propos', 'proposition').items.find((p) => p.id === 'p-lean')
  ok(still !== undefined && String(still.card.状态) === '未定论',
    '★ 对象没消失：仍在 propos 轨、状态仍是未定论（留档，不是被删）', still && still.card.状态)
  ok(loadCardIndex(h.kernel.records, 'verified', 'verified').items.length === 0,
    '★ 也没有偷偷落进 verified 轨（裁定确实没生数）')
  recordLeanEvidence({ records: h.kernel.records, target: 'p-lean', status: 'blocked', at: 1100, reason: 'lean 编译失败' })
  const blockedDeny = await callGate('p-lean')
  ok(blockedDeny && blockedDeny.deny && blockedDeny.deny.code === LEAN_GATE_CODE, 'blocked 证据也 deny', blockedDeny)
  ok(loadCardIndex(h.kernel.records, 'propos', 'proposition').items.some((p) => p.id === 'p-lean'), 'blocked 被拒后对象仍在原轨')
  recordLeanEvidence({ records: h.kernel.records, target: 'p-lean', status: 'passed', at: 1200 })
  const ev = leanEvidence({ records: h.kernel.records, target: 'p-lean' })
  ok(ev.status === 'passed' && ev.evidence && ev.evidence.recordId, 'leanEvidence 读回最近一条 passed 证据', ev)
  ok((await callGate('p-lean')) === undefined, '★ require + passed ⇒ 钩子不 deny（放行）')
  // ④ off 档：不阻断，且 formal 投影为空（没有证据可投影）
  const off = boot({ overrides: { 'vmu.math.formalVerify': 'off', 'vmu.v3.planMinIntervalMs': 0 } })
  await off.loader.apply(PACK)
  const offEvidence = leanEvidence({ records: off.kernel.records, target: 'p-lean' })
  ok(offEvidence.evidence === null && offEvidence.status === null, '★ off 档 formal 投影为空（没有证据可投影）', offEvidence)
  const offGate = await V3_LEAN_GATE_MODULE.hooks['ballot/tally']({
    api: { services: { names: () => ['vmu.records'], get: (n) => (n === 'vmu.records' ? off.kernel.records : null) }, setting: () => 'off' },
    at: 1000, payload: { target: 'p-lean' },
  })
  ok(offGate === undefined, '★ off 档不阻断裁定（零策略）')
  // ⑤ 三档必须分别构造内核（H2：运行期改档不生效）；两个独立 boot 证明不同装配不同档
  ok(leanPromptPolicy({ settings: settingsOf('require') }).mode === 'require' && leanPromptPolicy({ settings: settingsOf('off') }).mode === 'off',
    '档位是构造期装配事实（同一进程里两个内核各读自己的设置）')
}

// ── 20. P1-9 defect 撤回：共同真源让所有读点都读不到 passed ─────────────────────────────────────────────
{
  const defects = await import('../vibe-math-vmu/packs/v3/middleware/defects.js')
  const dp = await import('../vibe-math-vmu/packs/v3/middleware/dataplane.js')
  const vf = await import('../vibe-math-vmu/packs/v3/middleware/verify.js')
  const lg = await import('../vibe-math-vmu/packs/v3/middleware/lean-gate.js')
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  const fid = h.kernel.fidelity
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-def', 标题: '命题 p-def', 概率: 1, 状态: '已验证·真', 陈述: '陈述 p-def。' } })
  const rec = loadCardIndex(h.kernel.records, 'propos', 'proposition').items.find((p) => p.id === 'p-def')
  dp.promoteVerified({ records: h.kernel.records, sourceId: rec.recordId, at: 1000 })
  ok(defects.proofVerdict({ records: h.kernel.records, target: 'p-def', fidelity: fid }).state === 'passed', '基线：归档后读点读到 passed')
  const emptyNote = await defects.recordDefect({ records: h.kernel.records, target: 'p-def', note: '   ', fidelity: fid })
  ok(emptyNote.ok === false && emptyNote.code === defects.DEFECT_CODE.noteRequired,
    '★ note 为空 ⇒ 具名拒，不写 defect', emptyNote)
  ok(defects.proofVerdict({ records: h.kernel.records, target: 'p-def', fidelity: fid }).state === 'passed',
    '★ 被拒后证明保持不变（没有被“空理由”悄悄撤回）')
  const written = await defects.recordDefect({ records: h.kernel.records, target: 'p-def', note: 'failed independent replication', at: 1100, fidelity: fid })
  ok(written.ok === true && written.status === 'withdrawn' && written.source === 'fidelity', 'defect 写入成功且唯一写者是 fidelity', written)
  ok(h.kernel.records.list({ track: 'journal', limit: 0 }).items.filter((x) => String(x.title).startsWith(defects.DEFECT_PREFIX)).length === 0,
    '★ pack 不再新增 journal 标记（只有一处写标记）')
  const verdict = defects.proofVerdict({ records: h.kernel.records, target: 'p-def', fidelity: fid })
  ok(verdict.state === 'withdrawn' && verdict.readableAsPassed === false, '★ 共同真源：proofVerdict 读不到 passed', verdict)
  ok(dp.findVerified(h.kernel.records, 'p-def', { fidelity: fid }) === null, '★ 读点 1（dataplane.findVerified）读不到归档证明')
  ok(lg.leanEvidence({ records: h.kernel.records, target: 'p-def', fidelity: fid }).status === 'withdrawn', '★ 读点 2（leanEvidence）读不到 passed')
  ok(vf.listCandidates(h.kernel.records).items.some((c) => c.id === 'p-def') === false,
    '★ 读点 3（verify.listCandidates）不再把该对象列为可验证候选')
  const settleTry = vf.settleProposition({ records: h.kernel.records, target: 'p-def', recordId: rec.recordId, verdict: 1, rule: 'test', fidelity: fid })
  ok(settleTry.ok === false && settleTry.code === 'VMU_PACK_V3_DEFECT_WITHDRAWN',
    '★ 读点 4（verify.settleProposition）拒绝把它再结算成通过', settleTry && settleTry.code)
  let promoteErr = null
  try { dp.promoteVerified({ records: h.kernel.records, sourceId: rec.recordId, at: 1200, fidelity: fid }) } catch (e) { promoteErr = e }
  ok(promoteErr && promoteErr.code === 'VMU_PACK_V3_DEFECT_WITHDRAWN', '★ 读点 5（promoteVerified）不能再写回 verified', promoteErr && promoteErr.code)
  const unenforced = await defects.retractArchivedProof({ records: h.kernel.records, target: 'p-def', note: 'delete it', mode: 'delete', fidelity: fid })
  ok(unenforced.ok === false && unenforced.unenforced === true && unenforced.code === defects.DEFECT_CODE.unenforced,
    '★ 缺 fs 接缝 ⇒ 具名 unenforced（不假装删除/覆盖成功）', unenforced)
  ok(defects.proofVerdict({ records: h.kernel.records, target: 'p-def', fidelity: fid }).state === 'withdrawn', 'fidelity 标记仍生效')
  // 向后兼容：旧 journal 标记仍被认（只读）
  h.kernel.records.put({ track: 'journal', kind: 'state', title: defects.DEFECT_PREFIX + 'p-legacy', body: '- target: p-legacy\n- status: withdrawn\n- note: old marker', settled: true, by: 'legacy' })
  ok(defects.proofVerdict({ records: h.kernel.records, target: 'p-legacy' }).state === 'withdrawn' &&
    defects.proofVerdict({ records: h.kernel.records, target: 'p-legacy' }).source === 'legacy-journal',
    '★ 旧 journal 标记仍被识别（只读兼容，不静默丢弃）')
}

// ── 21. P1-10 论文收口：先产论文再停机；四件缺一 ⇒ 具名不宣称完成 ─────────────────────────────────────
{
  const pc = await import('../vibe-math-vmu/packs/v3/middleware/paper-close.js')
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  const finalTitles = (target) => h.kernel.records.list({ track: 'journal', limit: 0 }).items.filter((x) => String(x.title).startsWith(pc.PAPER_FINAL_PREFIX + target)).length
  const empty = pc.finalizePaper({ records: h.kernel.records, target: 'proj-a' })
  ok(empty.ok === false && empty.completed === false && empty.code === pc.PAPER_INCOMPLETE && empty.missing.length === 4,
    '★ 四件全缺 ⇒ 具名 incomplete，completed:false（不宣称完成）', empty)
  ok(finalTitles('proj-a') === 0, '没有写任何“完成”记录')
  ok(pc.PAPER_ARTIFACTS.length === 4, '产物定义恰为四件', pc.PAPER_ARTIFACTS)
  for (const a of ['md', 'tex', 'pdf']) pc.recordPaperArtifact({ records: h.kernel.records, target: 'proj-b', artifact: a })
  const three = pc.finalizePaper({ records: h.kernel.records, target: 'proj-b' })
  ok(three.ok === false && three.missing.length === 1 && three.missing[0] === 'meta',
    '★ 三件齐、缺 meta ⇒ incomplete 且 missing 精确点名 meta', three.missing)
  const calls = []
  const idleTurn = { run: async () => { calls.push(1); return { ok: true, turn: { id: 't-idle' } } } }
  const held = await pc.closeout({ records: h.kernel.records, turn: idleTurn, target: 'proj-b' })
  ok(held.completed === false && held.dispatched === true && held.stopped === false && held.turn === 't-idle' && calls.length === 1,
    '★ 缺件 ⇒ 先派论文回合（1 次），仍缺 ⇒ completed:false、stopped:false', held)
  const produceTurn = { run: async () => { for (const a of pc.PAPER_ARTIFACTS) pc.recordPaperArtifact({ records: h.kernel.records, target: 'proj-c', artifact: a }); return { ok: true, turn: { id: 't-produce' } } } }
  const closed = await pc.closeout({ records: h.kernel.records, turn: produceTurn, target: 'proj-c' })
  ok(closed.completed === true && closed.stopped === true && closed.dispatched === true,
    '★ 产物补齐后才 completed:true（先产论文、再允许停机）', closed)
  ok(finalTitles('proj-c') === 1, '完成记录恰好一条')
}

// ── 22. P1-9（内核侧）：真实 fidelity `passedWithdrawn` 标记必须让 verified 读点读不到 passed ─────────────
{
  const dp = await import('../vibe-math-vmu/packs/v3/middleware/dataplane.js')
  const vf = await import('../vibe-math-vmu/packs/v3/middleware/verify.js')
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  const fid = h.kernel.fidelity
  ok(fid && typeof fid.passedWithdrawnFor === 'function', '内核 fidelity 暴露 passedWithdrawnFor（标记不再只写不读）')
  for (const id of ['p-bad', 'p-ok']) {
    writeCard({ records: h.kernel.records, kind: 'proposition', card: { id, 标题: '命题 ' + id, 概率: 1, 状态: '已验证·真', 陈述: '陈述 ' + id + '。' } })
    const rec = loadCardIndex(h.kernel.records, 'propos', 'proposition').items.find((p) => p.id === id)
    dp.promoteVerified({ records: h.kernel.records, sourceId: rec.recordId, at: 1000 })
  }
  ok(dp.findVerified(h.kernel.records, 'p-ok', { fidelity: fid }) !== null, '反向：无 defect 的 verified 仍读得到 passed')
  const declared = await fid.declareDefect({ target: 'p-bad', by: 'office', note: 'the formalisation drops one hypothesis' })
  ok(declared && declared.ok === true && declared.marker && declared.marker.passedWithdrawn === true,
    '★ 用真实 fidelity 标记（不是 fake）：declareDefect 写入 passedWithdrawn', declared && declared.marker)
  ok(declared.durable === false, '没有 fs 接缝时如实报 durable:false（不假装已持久化）', declared.durable)
  const predicate = fid.passedWithdrawnFor('p-bad')
  ok(predicate && predicate.withdrawn === true && predicate.markerId === declared.marker.markerId,
    'passedWithdrawnFor 读回同一条标记', predicate)
  ok(dp.findVerified(h.kernel.records, 'p-bad', { fidelity: fid }) === null,
    '★ 真实标记后：findVerified（带 fidelity）读不到“通过”')
  let refused = null
  try { dp.promoteVerified({ records: h.kernel.records, sourceId: loadCardIndex(h.kernel.records, 'propos', 'proposition').items.find((p) => p.id === 'p-bad').recordId, fidelity: fid }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_PACK_V3_DEFECT_WITHDRAWN', '★ 真实标记后：promoteVerified 拒绝重新归档', refused && refused.code)
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-cand-bad', 标题: '命题 c', 概率: 0.5, 陈述: 'x' } })
  writeCard({ records: h.kernel.records, kind: 'proposition', card: { id: 'p-cand-ok', 标题: '命题 d', 概率: 0.5, 陈述: 'y' } })
  await fid.declareDefect({ target: 'p-cand-bad', by: 'office', note: 'unfaithful statement' })
  const ids = vf.listCandidates(h.kernel.records, { fidelity: fid }).items.map((c) => c.id)
  ok(ids.includes('p-cand-ok') && !ids.includes('p-cand-bad'),
    '★ 真实标记后：listCandidates 排除该对象、不误伤正常对象', ids)
}


// ── 23. P1-9（接线）：loadDefects 重启重载 ＋ library currentDefect 端到端 ─────────────────────────────────
{
  const fsp = await import('node:fs/promises')
  const os = await import('node:os')
  const pathMod = await import('node:path')
  const { createFidelityRegistry } = await import('../vibe-math-vmu/kernel/fidelity.js')
  const { createLibrary } = await import('../vibe-math-vmu/kernel/library.js')
  const files = new Map()
  const fakeFs = {
    writeText: async (rel, text) => { files.set(rel, String(text)); return true },
    readText: async (rel) => (files.has(rel) ? files.get(rel) : null),
    listDir: async (rel) => [...files.keys()].filter((k) => k.startsWith(rel + '/')).map((k) => ({ name: k.slice(rel.length + 1), type: 'file' })),
  }
  const mkKernel = () => createKernel({ clock: () => 1000, settings: clone(PACK_DEFAULTS), sections: PACK.sections, host: fakeFs })
  const k1 = mkKernel()
  const load1 = await k1.fidelityReady()
  ok(load1.status === 'loaded' && load1.loaded === 0, '有 fs：装配期 loadDefects 真的跑了（0 条，具名状态 loaded）', load1)
  await k1.fidelity.declareDefect({ target: 'p-durable', by: 'office', note: 'durable marker' })
  ok([...files.keys()].some((k) => k.includes('Defects')), 'declareDefect 落盘到 Defects/（有 fs 时 persisted）', [...files.keys()])
  const k2 = mkKernel()
  const load2 = await k2.fidelityReady()
  ok(load2.status === 'loaded' && load2.loaded === 1, '★ 新内核装配期重载了 1 条耐久标记（fidelityReady 可 await）', load2)
  ok(k2.fidelity.passedWithdrawnFor('p-durable') && k2.fidelity.passedWithdrawnFor('p-durable').withdrawn === true,
    '★ 重启后 passedWithdrawnFor 仍读得到（机制真的接线了）')
  const kNoFs = createKernel({ clock: () => 1000, settings: clone(PACK_DEFAULTS), sections: PACK.sections })
  const loadNo = await kNoFs.fidelityReady()
  ok(loadNo.status === 'unavailable' && loadNo.code === 'VMU_MATH_JOBS_MIRROR_UNWIRED',
    '★ 无 fs ⇒ 具名 unavailable（不假装加载了；fidelityReady 立即返回该回执）', loadNo)
  // library currentDefect 端到端（带 root）
  const dir = await fsp.mkdtemp(pathMod.join(os.tmpdir(), 'vmu-lib-def-'))
  try {
    const fidL = createFidelityRegistry({ clock: () => 1000 })
    await fidL.declareDefect({ target: 'proof-1', by: 'office', note: 'unfaithful' })
    const lib = createLibrary({ root: dir, tracks: ['verified'], defectLookup: (t) => fidL.passedWithdrawnFor(t) })
    const body = '# 已验证｜proof-1\n- ID: proof-1\n- 类型: 命题\n- 结论: 真\n- 概率: 1\n- 陈述: s\n- 内容: c\n'
    const r1 = await lib.append({ kind: 'proposition', track: 'verified', title: '已验证｜proof-1', statement: '- ID: proof-1\n- 类型: 命题\n- 结论: 真\n- 概率: 1', body })
    const json1 = await lib.exportRecord(r1.id, { format: 'json', allowInternal: true, includeHistory: true })
    ok(json1.currentDefect && json1.currentDefect.withdrawn === true, '★ library 有缺陷 ⇒ currentDefect.withdrawn===true', json1.currentDefect)
    const md1 = await lib.exportRecord(r1.id, { format: 'md', allowInternal: true })
    ok(String(md1.text).startsWith('---'), '★ md 第一个字符必须是 -（YAML frontmatter 必须第一行，defect 不得 prepend）')
    ok(/^current_defect: withdrawn/m.test(String(md1.text)) || String(md1.text).includes('current_defect: withdrawn'),
      '★ currentDefect 信息仍可读（在 frontmatter 字段里，不是正文 prepend）')
    const body2 = '# 已验证｜proof-2\n- ID: proof-2\n- 类型: 命题\n- 结论: 真\n- 概率: 1\n'
    const r2 = await lib.append({ kind: 'proposition', track: 'verified', title: '已验证｜proof-2', statement: '- ID: proof-2\n- 类型: 命题\n- 结论: 真\n- 概率: 1', body: body2 })
    const json2 = await lib.exportRecord(r2.id, { format: 'json', allowInternal: true })
    ok(json2.currentDefect === null, '★ 无缺陷 ⇒ currentDefect 为空（不误报）', json2.currentDefect)
    const body3 = '# 已验证｜no-anchor\n- 结论: 真\n- 概率: 1\n'
    const r3 = await lib.append({ kind: 'proposition', track: 'verified', title: '无锚点', statement: '- 结论: 真\n- 概率: 1', body: body3 })
    const json3 = await lib.exportRecord(r3.id, { format: 'json', allowInternal: true })
    ok(json3.currentDefect && json3.currentDefect.code === 'VMU_PACK_V3_DEFECT_TARGET_UNRESOLVED',
      '★ 缺 - ID: 锚点 ⇒ 具名 unresolved（不静默猜记录 id）', json3.currentDefect)
  } finally { await fsp.rm(dir, { recursive: true, force: true }) }
}

// ── 20. directions 轨：方向卡必须进入简报（否则 planner 盲派 explorer，方向卡再多也看不见） ──────────────
console.log('=== 20. directions 轨进入规划简报：无卡时为空、有卡时可见（一正一反） ===')
{
  const h = boot({ overrides: { 'vmu.v3.planMinIntervalMs': 0 } })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-dir')
  await tick(h, 1000)
  const before = v3PlannerStatus().lastBrief
  ok(before && Array.isArray(before.directions) && before.directions.length === 0,
    '反：没有方向卡时 brief.directions 为空数组（不是缺字段）', before && before.directions)
  h.kernel.records.put({ track: 'directions', kind: 'direction', title: 'v3 direction｜d-1', body: '- ID: d-1\n- 标题: 归纳法\n- 问题: q-dir\n- 状态: 活跃' })
  await tick(h, 2000)
  const after = v3PlannerStatus().lastBrief
  ok(after && Array.isArray(after.directions) && after.directions.length === 1 && after.directions[0].id === 'd-1',
    '正：方向卡真的进入简报（planner 能看见 d-1，不再盲派 explorer）', after && after.directions)
}
// ── 21. planner 回合的【实际拼装提示词】必须含角色段、不含根会话人格 ───────────────────────────────
console.log('=== 21. planner 提示词装配：含“调度规划器”角色段、不含“根会话”人格（直接拿 delivered.text） ===')
{
  const h = boot({ replier: ({ turn }) => (turn.member === PLANNER_MEMBER ? planReply('装配检查', [{ action: 'wait', target: 'q-1' }]) : ACK) })
  await h.loader.apply(PACK)
  problemCard(h.kernel, 'q-1')
  await tick(h, 1000)
  const plannerTurns = h.delivered.filter((d) => d.member === PLANNER_MEMBER)
  ok(plannerTurns.length === 1, '恰好一次 planner 回合被投递', plannerTurns.length)
  const text = plannerTurns.length > 0 ? String(plannerTurns[0].text) : ''
  ok(text.includes('调度规划器') && text.includes('# v3-planner'),
    '★ 正：planner 的实际提示词里含规划器角色段（不是只有简报）', text.slice(0, 120))
  ok(!text.includes('根会话'),
    '★ 反：planner 的实际提示词【不含】“根会话”人格（真机 t-7 的自称根会话不能再出现）', text.includes('根会话'))
}
console.log('')
console.log('=== V3 PLANNER (P0-2 + P0-3): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
