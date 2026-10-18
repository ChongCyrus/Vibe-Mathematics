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
import {
  V3_PLANNER_MODULE, PLANNER_MEMBER, PLAN_TRACK, PLAN_KIND, PLAN_VERBS, SPAWN_ROLES,
  v3PlannerStatus, readPlanRecord, readRawPlan, loadCardIndex, validatePlan, promotedProblemId,
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
  const loader = createPackLoader({ kernel, registry: kernel.registry })
  return { kernel, loader, delivered, clockRef }
}

/** 一个 tick：注入时钟推到 `at`，然后**从总线发** `v3/tick`（模块形状的 api 由 loader 附上）。 */
async function tick(h, at, runs = 1) {
  h.clockRef.at = at
  const receipt = await h.kernel.bus.emit(V3_TICK_TOPIC, { at, runs }, {})
  // 所有模块钩子都被 bus.emit await 过，这里再让一个宏任务过去，纯粹是为了不依赖 await 的实现细节。
  await new Promise((resolve) => setImmediate(resolve))
  return receipt
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

console.log('')
console.log('=== V3 PLANNER (P0-2 + P0-3): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
