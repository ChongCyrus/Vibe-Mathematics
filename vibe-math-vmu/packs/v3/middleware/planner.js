/**
 * packs/v3/middleware/planner.js — PHASE 6 / **P0-2（规划-调度闭环）＋ P0-3（规划学习闭环）＋
 * P1-1（硬约束：幂等／已验不再调度／依赖／容量）＋ P1-3（自动晋升阈值）**。
 *
 * 一次性把 v3 的 planner 链条落成一个 M2 模块：**tick → 判可推进 → 组简报 → 调 planner 回合 →
 * 归一化/校验 → 按容量执行 → 逐条 outcome 写回计划记录 → 下一次简报带 last_plan**。
 *
 * 三条硬约束（施工前实测过，违反任何一条都会在真机上静默或炸）：
 *
 * ① **派发只能从 `v3/tick` 处理器里做。** `vmu.turn` 已进 M2 服务目录（K2），而回合内再开回合会被
 *    `VMU_TURN_REENTRANT` 具名拒（`kernel/turn/index.js:1055-1064`）。tick 是**总线钩子、不是 turn**，
 *    所以从 tick 里 `await run()` 是合法的；**绝不能**在 `turn/reply-parsed` 处理器里同步再开一个 turn。
 *    本模块的 `turn/reply-parsed` 处理器只做「归一化并把回执写进 plans 轨」，绝不调用 `run()`。
 *
 * ② **卡的读写一律走 `dataplane.js` 的导出。** 读问题/命题卡是 `parseCard`（不是第二份 md 解析器），
 *    回写问题卡的 `- 计划:` 锚点是 `updateCard`，写/改计划记录是 `writeBody`/`supersedeBody`（同一份
 *    截断实现与同一个 `vmu.records.bodyCapBytes` 快照）。`plans` 轨的记录是 **JSON**（不是 md 卡），
 *    所以它不走 `composeCard`；但它的写入点仍然只有 dataplane 的那两个函数。
 *
 * ③ **构造期快照的键只能进 `settings/defaults.json`；调用期读的键在 `settings/schema.js` 里已登记。**
 *    本模块调用期读 `vmu.v3.planningHorizon/plannerEnabled/planMinIntervalMs/plannerMaxFails`、
 *    `vmu.limits.maxLiveMembers` 与 `vmu.limits.maxParallel`（后四把都已登记）；P1-3 的
 *    `vmu.v3.promoteValueThreshold`（默认 0.7）的 schema 登记待 Lead 加入 —— 代码在未登记时**回落 0.7**
 *    （与声明默认同值，不是 0：0 会让每条命题都晋升），登记后无需改代码。
 *
 * ★★ **K10（`turn/reply-parsed` 可改写回执）是回执归一化的正规手段**（`kernel/bus.js:752-773`，
 *    消费者 `kernel/turn/index.js:1012-1021`）。本模块在 `turn/reply-parsed` 上做两件事：
 *    (a) 把规划器回执里的 `progress` 载荷**归一化**成「计划记录」并**替它落盘**（写 `plans` 轨）；
 *    (b) 返回 `{ rewriteResult: <归一化后的回执 JSON> }`，于是**原始载荷不会再走到派发器**（K10 的语义：
 *        被改写的回执在 `apply` 之前替换 `parsed.reply`）。
 *    为什么会话里仍然有一条「直接派发」路线：装配层的 `createTurnOrchestrator({...})` 目前**没有收到 `bus`**
 *    （`kernel/index.js:1312-1339` 的调用没有 `bus` 键，全仓 `turn/reply-parsed` 的发射点只有
 *    `kernel/turn/index.js:1010`）⇒ 在今天的真实装配上这条钩子**不会被回合循环发射**。这不影响功能：
 *    规划器回执的顶层字段是内核认识的 `progress`（→ `records.put()`，`kernel/turn/index.js:32`），
 *    没有 bus 时由内核**照常派发**、计划记录照常落盘；有 bus 时由本钩子落盘并抑制那次派发。
 *    两条路写出的记录**同一形状**（tick 侧的统一读取器 `readRawPlan`），所以纪律上不存在「两份实现」。
 *    ★ 这个装配缺口不属于本卡的写域（`kernel/**`），已作为发现上报；修好后本模块无需改动。
 *
 * ★ 时间只来自注入的时钟（tick 事件的 `at`）：没有 `at` 就**不规划**、不执行，并在回执里写明理由。
 */
import { V3_TICK_TOPIC } from './tick.js'
import { parseCard, writeBody, writeCard, supersedeBody, updateCard, escField, unescField } from './dataplane.js'
// P0-8：人工门的判定/台账由 gates.js 提供；planner 只**调**它，不自己写一套"该不该放行"。
import { evaluateGate, registerGateExecutor, getGate } from './gates.js'

/** 规划器是 bus 主题 `v3/tick` 的消费者；这个别名只是让调用方不必 import 两个模块。 */
export const V3_PLANNER_TOPIC = V3_TICK_TOPIC
/** 规划器成员的 id/角色（v3 的 `spawnChild('planner:'+planId, {role:'planner'})`）。 */
export const PLANNER_MEMBER = 'planner'
/** 计划记录的轨与 kind（`vmu.records.tracks` 与 `allowedKinds` 都在 packs/v3/settings/defaults.json 声明）。 */
export const PLAN_TRACK = 'plans'
export const PLAN_KIND = 'plan'
/** 计划动作在记录 tags 上的前缀。 */
export const PLAN_ACTION_TAG = 'act:'
/** v3 的 6 个动作词（`:2395-2454` 的 `allowed` 表）；前 3 个硬校验，后 3 个只是建议。 */
export const PLAN_VERBS = Object.freeze(['spawn', 'interrupt', 'promote', 'wait', 'continue', 'stop'])
export const ADVISORY_VERBS = Object.freeze(['wait', 'continue', 'stop'])
/** 能 `spawn` 的角色（v3 `:2407-2438`）。 */
export const SPAWN_ROLES = Object.freeze(['explorer', 'solver', 'verifier', 'method-keeper'])
/** K10 的改写点（被改写的回执在派发之前替换，见文件头）。 */
const REPLY_PARSED_HOOK = 'turn/reply-parsed'
/** 每个问题/命题卡上会被规划器回写的锚点（v3 `:2456-2465` 的 applyPlanToProblemCards）。 */
const PLAN_ANCHOR = '计划'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (v === undefined || v === null ? '' : String(v))

/** 具名拒绝：调用者的词汇 + code + hint（AGENTS 红线 3）；码只用已登记的内核码，理由见 dataplane 文件头。 */
function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

// ── 状态：按 records 句柄隔离（WeakMap） ────────────────────────────────────────────────────────────────
// 为什么不是模块级计数器：一个进程里可以同时存在多个内核（测试、多个 profile 行），规划器的「在飞/冷却/
// 连续失败」是**每次装配**的事实。tick.js 的 `tickCalls` 是模块级的，因为它只是自报计数；这里的状态
// 会影响行为，所以必须按装配隔离。WeakMap 也保证内核被回收时状态随之消失。
const PLANNER_STATES = new WeakMap()
let lastState = null

function stateFor(records) {
  let s = PLANNER_STATES.get(records)
  if (!s) {
    s = {
      ticks: 0,
      plannerCalls: 0,
      plans: 0,
      fails: 0,
      disabled: false,
      inFlight: false,
      lastPlanAt: null,
      lastPlan: null,
      lastBrief: null,
      lastSkip: null,
      lastError: null,
      lastPersistedPlanId: null,
      lastExecuted: 0,
      calls: 0,
      turns: [],
      // P1-1：派发幂等账（进程内；键＝角色:目标:方向，verifier 的“目标”就是 rId）。派发成功才登记，
      // 失败留待下一 tick 重试；重启后归零是**如实**的进程内诊断，不冒充持久事实。
      dispatched: new Map(),
      // P1-3：自动晋升计数与最近一次晋升（每个 tick 至多一个）。
      promotions: 0,
      lastPromotion: null,
    }
    PLANNER_STATES.set(records, s)
  }
  lastState = s
  return s
}

/**
 * 只读自报（诊断用）。返回**最近一次被 tick 触碰的装配**的状态：计数是进程内累计的，重启归零 —— 与
 * tick.js 的 `v3TickStatus()` 同一口径（只用于诊断，不当作持久计数）。计划本身的持久事实在 `plans` 轨。
 */
export function v3PlannerStatus() {
  const s = lastState
  if (!s) {
    return { topic: V3_TICK_TOPIC, plannerCalls: 0, plans: 0, fails: 0, disabled: false, inFlight: false,
      lastPlanAt: null, lastPlan: null, lastBrief: null, lastSkip: null, lastError: null, lastExecuted: 0, turns: [], note: 'no tick has touched this module yet' }
  }
  return {
    topic: V3_TICK_TOPIC,
    plannerCalls: s.plannerCalls,
    plans: s.plans,
    fails: s.fails,
    disabled: s.disabled,
    inFlight: s.inFlight,
    lastPlanAt: s.lastPlanAt,
    lastPlan: s.lastPlan ? Object.assign({}, s.lastPlan) : null,
    lastBrief: s.lastBrief ? JSON.parse(JSON.stringify(s.lastBrief)) : null,
    lastSkip: s.lastSkip,
    lastError: s.lastError,
    lastDispatched: s.lastDispatched || null,
    lastExecuted: s.lastExecuted,
    turns: s.turns.slice(),
    // P1-1/P1-3 的**进程内**账本：派发幂等键数、自动晋升次数与最近一次晋升（持久事实仍在 plans/problems 轨）。
    dispatched: s.dispatched.size,
    promotions: s.promotions,
    lastPromotion: s.lastPromotion ? Object.assign({}, s.lastPromotion) : null,
    note: 'diagnostics only: counters are per-process; the durable facts are records on the plans track',
  }
}

// ── 动作 tag 的编解码（plans 轨的回执载体，不是 md 解析器） ─────────────────────────────────────────────
// 格式：`act:<动作>｜<角色>｜<目标>｜<方向>｜<子会话>｜<理由>`（六段，全角竖线分隔；字段本身用
// dataplane 的 escField/unescField 转义，所以理由里出现反斜杠/全角竖线/换行也不会破格）。
const ACTION_FIELDS = Object.freeze(['action', 'role', 'target', 'direction', 'childId', 'reason'])
const ACTION_SEP = '｜'

/** 切分**尊重反斜杠转义**的分隔符（escField 会把 `｜` 写成 `\｜`）。 */
function splitEscaped(text, sep) {
  const out = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) { cur += c + text[i + 1]; i += 1; continue }
    if (c === sep) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}

/** 一条动作 → 一个 tag。 */
export function encodeActionTag(action = {}) {
  return PLAN_ACTION_TAG + ACTION_FIELDS.map((k) => escField(action[k])).join(ACTION_SEP)
}

/** 一个 tag → 一条动作；不是 `act:` 开头的 ⇒ null（不猜）。 */
export function decodeActionTag(tag) {
  const s = str(tag)
  if (!s.startsWith(PLAN_ACTION_TAG)) return null
  const parts = splitEscaped(s.slice(PLAN_ACTION_TAG.length), ACTION_SEP)
  const action = { action: str(parts[0]).trim(), role: '', target: '', direction: '', childId: '', reason: '' }
  for (let i = 1; i < ACTION_FIELDS.length; i++) action[ACTION_FIELDS[i]] = unescField(str(parts[i])).trim()
  return action
}

/** 一条动作的规范化（六个字段都是字符串；`action` 小写）。读 tag / JSON / 纯函数测试共用这一个。 */
export function normaliseAction(raw) {
  const a = isObject(raw) ? raw : {}
  return {
    action: str(a.action).trim().toLowerCase(),
    role: str(a.role).trim(),
    target: str(a.target).trim(),
    direction: str(a.direction).trim(),
    childId: str(a.childId).trim(),
    reason: str(a.reason).trim(),
  }
}

/** 从一条计划记录读出 {summary, actions}，**两种形状都认**（tick 侧只有一个读取器）：
 * · **原始形状**：规划器回执落的那一版（`body` 是 `- summary:` 一行，`tags` 是 `act:` 动作）—— 无 bus 的
 *   真实装配上，内核按 `progress` 字段把它派发进 `plans` 轨，就是这一版；
 * · **正规形状**：本模块 settle 后的 JSON（`body` 是 `{summary, raw, validated, outcomes…}`），此时动作取 `raw`。
 * 认两种形状不是为了容忍漂移，而是因为同一个记录在“落盘后 / 执行前”确实会经历这两态；写成两个读取器才是漂移。
 */
export function readRawPlan(record) {
  const rec = record || {}
  const text = str(rec.body)
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (isObject(parsed)) {
        const actions = Array.isArray(parsed.raw) ? parsed.raw : (Array.isArray(parsed.plan) ? parsed.plan : null)
        if (actions !== null) return { summary: str(parsed.summary), actions: actions.map((a) => normaliseAction(a)) }
      }
    } catch { /* fall through to the raw shape */ }
  }
  const tags = Array.isArray(rec.tags) ? rec.tags : []
  const actions = []
  for (const t of tags) {
    const a = decodeActionTag(t)
    if (a) actions.push(a)
  }
  const m = /^-\s*summary\s*:\s*(.*)$/m.exec(text)
  return { summary: m ? m[1].trim() : '', actions }
}

// ── 读卡（一律经 dataplane.parseCard；坏卡点名、不炸整条 tick） ─────────────────────────────────────────
/** 某轨上的卡片索引：{ items: [{recordId, id, card}], bad: [{recordId, reason}] }。 */
export function loadCardIndex(records, track, kind) {
  const list = records.list({ track, limit: 0 })
  const items = []
  const bad = []
  for (const head of list.items) {
    if (head.kind !== kind) continue
    let rec
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, reason: str((e && e.message) || e) }); continue }
    const parsed = parseCard(rec.body)
    if (!parsed.ok) { bad.push({ recordId: head.id, reason: parsed.reason }); continue }
    if (parsed.kind !== kind) { bad.push({ recordId: head.id, reason: 'kind-mismatch:' + parsed.kind }); continue }
    items.push({ recordId: head.id, id: str(parsed.card.id), card: parsed.card })
  }
  return { items, bad }
}

/**
 * P1-1：`verified` 轨上的对象 id 集合（按卡片的逻辑 `ID` 锚点，不是记录 id）。定论一旦进 verified 轨，
 * 就不再进入任何候选/派发面 —— v3 的 HARD RULE“never re-schedule verified objects”。坏卡不进集合（`loadCardIndex`
 * 已把它们点名）；读轨失败 ⇒ 抛具名拒，**不静默当成空集**（空集会让已验对象重新被调度）。
 */
export function verifiedIds(records) {
  const idx = loadCardIndex(records, 'verified', 'verified')
  return new Set(idx.items.map((x) => x.id))
}

/** 可推进的问题：不是已解决 / 不是 never / 不是等待依赖 / 不在 verified 轨（v3 `:2274-2287` 的判定面）。 */
export function advanceableProblems(index, verified = null) {
  const byId = new Map(((index && index.items) || []).map((p) => [p.id, p]))
  const done = verified instanceof Set ? verified : new Set()
  const out = []
  for (const p of (index && index.items) || []) {
    const c = p.card
    if (!c) continue
    if (str(c.状态) === '已解决') continue
    if (c.优先级 === 'never') continue
    if (str(c.状态) === '等待依赖') continue
    // P1-1：依赖未就绪同样不算“可推进”（v3 的 autoDependencyStates 会把它标成等待依赖；这里两条都挡，
    // 因为一个刚写入依赖、还没被状态机回写的卡不能靠“状态字符串恰好对”才不被派）。
    if (!depReady(c, byId)) continue
    if (done.has(p.id)) continue
    out.push(p)
  }
  return out
}

/** v3 `problemDepReady` 的等价物：依赖全为 `已解决`（缺卡 ⇒ 不就绪，绝不乐观默认）。 */
function depReady(card, byId) {
  const deps = Array.isArray(card.依赖) ? card.依赖.map(String) : []
  for (const d of deps) {
    const hit = byId.get(d)
    if (!hit || str(hit.card.状态) !== '已解决') return false
  }
  return true
}

// ── 简报（v3 `:2288-2315` buildBrief 的等价面；缺的族如实写明，不假装有） ───────────────────────────────
/** 最近一条计划记录（按内核 `records.headSort` 的 updatedAt 升序，取最后一条）。 */
export function latestPlanRecord(records) {
  const list = records.list({ track: PLAN_TRACK, limit: 0 })
  const items = list.items.slice()
  if (items.length === 0) return null
  let best = null
  for (const h of items) if (best === null || (h.updatedAt || 0) >= (best.updatedAt || 0)) best = h
  if (!best) return null
  const rec = records.get({ id: best.id })
  return { recordId: best.id, body: rec.body, tags: rec.tags, updatedAt: rec.updatedAt, rev: rec.rev }
}

/** 读一条计划记录的正规形状（P0-2 落盘后是 JSON；落盘前是规划器回执的原始形状）。 */
export function readPlanRecord(record) {
  const rec = record || {}
  const text = str(rec.body)
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (isObject(parsed) && Array.isArray(parsed.validated) && Array.isArray(parsed.outcomes)) return parsed
    } catch { /* fall through: the raw shape below is the pre-settlement record */ }
  }
  return null
}

/** 组简报。`last_plan` 是学习环的入口：上一次计划的逐条 outcome 在这里进入下一次简报。 */
export function buildBrief({ records, at, horizon, maxLiveMembers, problems, state, queuedRemaining = 0 }) {
  const problemsById = new Map(problems.items.map((p) => [p.id, p]))
  const problemsOut = []
  for (const p of problems.items) {
    const c = p.card
    if (!c) continue
    if (str(c.状态) === '已解决') continue
    if (c.优先级 === 'never') continue
    problemsOut.push({
      id: p.id,
      状态: str(c.状态),
      优先级: c.优先级,
      依赖: Array.isArray(c.依赖) ? c.依赖.slice() : [],
      依赖就绪: depReady(c, problemsById),
      计划: str(c.计划),
      解法数: Array.isArray(c.solutions) ? c.solutions.length : 0,
      记录: p.recordId,
    })
  }
  let methods = []
  try {
    const mIdx = loadCardIndex(records, 'methods', 'method')
    methods = mIdx.items.slice(0, 20).map((m) => ({ id: m.id, 标题: str(m.card.标题), 状态: str(m.card.状态) }))
  } catch { methods = [] }
  let pendingInventions = 0
  try { pendingInventions = records.list({ track: 'inventions', limit: 0 }).items.length } catch { pendingInventions = 0 }
  let recentEvents = []
  try {
    const j = records.list({ track: 'journal', limit: 0 }).items
    recentEvents = j.slice(-8).map((h) => ({ at: h.updatedAt, kind: h.kind, title: h.title }))
  } catch { recentEvents = [] }
  let lastPlan = null
  const latest = latestPlanRecord(records)
  if (latest) {
    const canonical = readPlanRecord(latest)
    if (canonical) {
      lastPlan = {
        planId: latest.recordId,
        at: canonical.at === undefined ? null : canonical.at,
        summary: str(canonical.summary),
        status: str(canonical.status),
        validated: Array.isArray(canonical.validated) ? canonical.validated.length : 0,
        outcomes: Array.isArray(canonical.outcomes) ? canonical.outcomes.map((o) => Object.assign({}, o)) : [],
      }
    } else {
      const raw = readRawPlan(latest)
      lastPlan = { planId: latest.recordId, at: null, summary: raw.summary, status: 'raw', validated: raw.actions.length, outcomes: [] }
    }
  }
  // free_slots：v3 是 `maxParallelThreshold - activeCount()`。本包**没有**活成员登记表（P0-10 的派发面才
  // 会有），而 P0-2 的派发是同步 `turn.run()`（调用返回即该回合结束），所以这里如实报「没有在飞子会话」，
  // 并把这条限制写进 notes —— 不编一个 activeCount。
  const maxLive = Number.isFinite(maxLiveMembers) && maxLiveMembers > 0 ? maxLiveMembers : 0
  const brief = {
    at,
    horizon,
    free_slots: maxLive > 0 ? maxLive : horizon,
    maxLiveMembers: maxLive > 0 ? maxLive : null,
    problems: problemsOut,
    verify_candidates: [],
    methods,
    pending_inventions: pendingInventions,
    plan_queue: queuedRemaining,
    last_plan: lastPlan,
    recent_events: recentEvents,
    notes: {
      active_agents: 'this pack has no live-agent registry yet: P0-2 dispatches through a synchronous turn.run(), so an agent is never "in flight" between ticks',
      verify_candidates: 'P0-7 (verification loop) builds the candidate list; until then it is empty by construction, not by omission',
      directions: 'the directions track has no card composer/parser in dataplane yet (P0-9 covers problem/proposition/method/verified), so 方向数/活跃方向 are not claimed here',
    },
  }
  if (state) state.lastBrief = JSON.parse(JSON.stringify(brief))
  return brief
}

// ── 校验（v3 `:2395-2454` validatePlan 的等价面） ───────────────────────────────────────────────────────
/** 动作的去重键（v3 的 `act:role:target:direction:childId`）。 */
const dedupeKey = (a) => [a.action, a.role, a.target, a.direction, a.childId].join('\u0000')

/**
 * 校验 + horizon 截断 + 去重 + 逐角色硬校验。**每一步都计数**：
 * · `rejected`   非法动作（不在词表 / 角色不合法 / 目标不存在或已定论 / 缺必填字段）；
 * · `truncated`  合法但超出 `horizon` 的动作（被截断，不是被拒绝）；
 * · `duplicates` 同键重复；
 * · `rejectReasons` 逐条点名（索引 + 原因），不静默。
 */
export function validatePlan(actions, { horizon, problems, propos, verified = null } = {}) {
  const limit = Number.isInteger(horizon) && horizon >= 0 ? horizon : 0
  const problemById = new Map((problems.items || []).map((p) => [p.id, p]))
  const proposById = new Map((propos.items || []).map((p) => [p.id, p]))
  const done = verified instanceof Set ? verified : new Set()
  const validated = []
  const rejectReasons = []
  const seen = new Set()
  let rejected = 0
  let truncated = 0
  let duplicates = 0
  const list = Array.isArray(actions) ? actions : []
  for (let i = 0; i < list.length; i++) {
    const raw = list[i]
    const why = (reason) => { rejected += 1; rejectReasons.push({ index: i, action: str(raw && raw.action), why: reason }) }
    if (!isObject(raw)) { why('not-an-object'); continue }
    const a = normaliseAction(raw)
    if (!PLAN_VERBS.includes(a.action)) { why('unknown-action:' + (a.action || '(empty)')); continue }
    const key = dedupeKey(a)
    if (seen.has(key)) { duplicates += 1; continue }
    let ok = true
    if (a.action === 'spawn') {
      if (!SPAWN_ROLES.includes(a.role)) { why('unknown-spawn-role:' + (a.role || '(empty)')); ok = false }
      else if (a.role === 'explorer' || a.role === 'solver') {
        const p = problemById.get(a.target)
        if (!p) { why('unknown-problem:' + (a.target || '(empty)')); ok = false }
        else if (str(p.card.状态) === '已解决' || p.card.优先级 === 'never') { why('problem-not-advanceable:' + a.target); ok = false }
        // P1-1：① 已在 verified 轨的对象不再调度；② 依赖未就绪 ⇒ 拒绝并点名（不是“悄悄不派”）。
        else if (done.has(a.target)) { why('already-verified:' + a.target); ok = false }
        else if (!depReady(p.card, problemById)) { why('dependency-not-ready:' + a.target); ok = false }
        else if (a.role === 'solver' && a.direction === '') { why('solver-needs-direction:' + a.target); ok = false }
      } else if (a.role === 'verifier') {
        // v3 还要求 target 出现在 buildVerifyCandidates() 里；候选面属于 P0-7，本轮只做结构校验并把这条
        // 限制写进文件头/README —— 不假装「已验证它不是候选」。
        if (a.target === '') { why('verifier-needs-target'); ok = false }
        else if (done.has(a.target)) { why('already-verified:' + a.target); ok = false }
      }
    } else if (a.action === 'interrupt') {
      if (a.childId === '') { why('interrupt-needs-childId'); ok = false }
    } else if (a.action === 'promote') {
      const p = proposById.get(a.target)
      if (!p) { why('unknown-proposition:' + (a.target || '(empty)')); ok = false }
      else if (p.card.概率 === 1 || p.card.概率 === 0) { why('proposition-already-settled:' + a.target); ok = false }
      else if (done.has(a.target)) { why('already-verified:' + a.target); ok = false }
      else if (str(p.card.晋升问题) !== '') { why('already-promoted:' + a.target); ok = false }
    }
    if (!ok) continue
    seen.add(key)
    if (validated.length >= limit) { truncated += 1; continue }
    validated.push(a)
  }
  return { validated, rejected, truncated, duplicates, rejectReasons, horizon: limit }
}

// ── 执行（v3 `:2466-2517`；每个动作产出 {action, role, target, ok, error?}） ─────────────────────────────
/** 把执行失败折成一条具名 outcome（不抛：一条动作失败不该让整个 tick 丢掉其它动作的结果）。 */
function outcomeOf(a, ok, extra = {}) {
  const o = { action: a.action, role: a.role, target: a.target }
  if (a.direction) o.direction = a.direction
  if (a.childId) o.childId = a.childId
  o.ok = ok
  return Object.assign(o, extra)
}

/** P1-1 的派发身份：verifier 的 target 就是 rId（候选解法/命题），其余角色带方向。 */
export function dispatchKey(a = {}) {
  return [str(a.role), str(a.target), str(a.direction)].join('\u0000')
}

async function executeOne(a, ctx) {
  const { turn, records, problems, propos, at, api } = ctx
  if (ADVISORY_VERBS.includes(a.action)) {
    // v3 明确：wait/continue/stop 只写日志、没有调度效果（`:2449-2451`、`:2510-2516`）。
    return outcomeOf(a, true, { advisory: true, note: 'advisory only: logged, no scheduling effect' })
  }
  if (a.action === 'spawn') {
    // P1-1 幂等：同一个 rId（verifier）/同一个 (role,target,direction) 只建一次任务。第二次不是“恰好没动”，
    // 而是一条**具名跳过**的 outcome（ok:true + skipped + code），调用方与学习环都能看见它被跳过而不是被丢弃。
    const key = dispatchKey(a)
    const prior = ctx.state && ctx.state.dispatched ? ctx.state.dispatched.get(key) : null
    if (prior) {
      return outcomeOf(a, true, {
        skipped: 'already-dispatched',
        code: 'VMU_PACK_V3_DUPLICATE_DISPATCH',
        message: 'this target was already dispatched by the v3 planner; a second task was NOT created',
        previousTurn: prior.turn || null,
      })
    }
    const phase = a.role === 'verifier' ? 'verify' : 'normal'
    // ★ SLV: the explorer role sections are scoped by TASK (explore / rederive). Sending 'v3-plan:spawn:…' meant the
    // explorer prompt was assembled WITHOUT its role section and without a status block (a blind delegation).
    const task = a.role === 'explorer'
      ? (a.action === 'spawn' ? 'explore' : 'rederive')
      : ('v3-plan:' + a.action + ':' + (a.target || a.direction || a.role))
    // ★ SLV / TWO-PHASE: plan actions are DISPATCHED, never awaited. The reply lands through turn/reply-parsed.
    let receipt = null
    try {
      if (typeof turn.dispatch !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this turn loop exposes no dispatch(spec)')
      receipt = turn.dispatch({
        member: a.role,
        role: a.role,
        phase,
        task,
        why: 'v3 planner plan (' + a.action + ' ' + a.role + ')',
        round: 1,
      })
    } catch (e) {
      receipt = { ok: false, code: str((e && e.code) || 'VMU_ENGINE_UNAVAILABLE'), message: str((e && e.message) || e) }
    }
    const plannerState = ctx.state
    if (receipt && receipt.ok === true) {
      const turnId = receipt.turn && receipt.turn.id ? receipt.turn.id : null
      if (turnId && plannerState) plannerState.turns.push({ member: a.role, turn: turnId, from: 'plan' })
      // 成功派发才登记幂等键：失败的派发留待下一 tick 重试（“同 rId 不重复建任务”只针对**已建成**的任务）。
      if (plannerState && plannerState.dispatched) plannerState.dispatched.set(key, { at, turn: turnId, role: a.role, target: a.target, direction: a.direction })
      return outcomeOf(a, true, { turn: turnId, fields: Array.isArray(receipt.fields) ? receipt.fields.slice() : [] })
    }
    return outcomeOf(a, false, { error: 'VMU_ENGINE_UNAVAILABLE', message: 'the spawned turn returned ok !== true' })
  }
  if (a.action === 'interrupt') {
    // ★ 诚实缺口（不是静默跳过）：`turn.interruptMember` 需要 host 权威
    // `{kind:'ancestor',agent}` 或 `{kind:'user',parentSessionId}`（`kernel/turn/index.js:561-575`），
    // 而 pack 模块手里没有 host 的 agent 句柄，也没有在飞子会话登记表（v3 的 agentRegistry 属装配层）。
    // 所以本卡**不伪造**一个 authority：如实记一条具名失败，等 P0-10（工具面/派发面）接上 host 句柄后
    // 改成 `turn.interruptMember({ targetSessionId: a.childId, authority })`。
    return outcomeOf(a, false, {
      error: 'VMU_ENGINE_UNAVAILABLE',
      message: 'v3 planner cannot interrupt: a pack module holds no host agent handle (authority {kind:"ancestor",agent}) and no live-child registry; vmu.turn.interruptMember refuses an unnamed authority rather than interrupting on a guess',
    })
  }
  if (a.action === 'promote') {
    const p = new Map(propos.items.map((x) => [x.id, x])).get(a.target)
    if (!p) return outcomeOf(a, false, { error: 'VMU_NO_SUCH_OBJECT', message: 'unknown proposition: ' + a.target })
    const qid = promotedProblemId(a.target)
    const existing = new Map(problems.items.map((x) => [x.id, x])).get(qid)
    if (existing) return outcomeOf(a, true, { problemId: qid, note: 'already promoted (idempotent: the judge-problem exists)' })
    const c = p.card
    const sols = []
    for (const it of (Array.isArray(c.proofs) ? c.proofs : [])) {
      sols.push({ title: '【证明】' + str(it.title || '证明'), prob: Number.isFinite(it.prob) ? it.prob : 0.5, status: '未定论', text: '【证明】' + str(it.text) })
    }
    for (const it of (Array.isArray(c.refutes) ? c.refutes : [])) {
      sols.push({ title: '【证伪】' + str(it.title || '证伪'), prob: Number.isFinite(it.prob) ? it.prob : 0.5, status: '未定论', text: '【证伪】' + str(it.text) })
    }
    // 与 v3 `:2519-2534` 同一形状：晋升出一个「判断命题」问题，验证结果回写源命题。
    const card = {
      id: qid,
      标题: '判断命题：' + str(c.标题 || p.id),
      状态: '求解中',
      优先级: 1,
      依赖: [],
      来源: 'promote',
      计划: '证明或证伪源命题 ' + p.id + '（验证结果回写源命题）。',
      陈述: '判断下述命题是否成立：' + str(c.陈述),
      来源与动机: '由命题 ' + p.id + ' 晋升，验证结果回写源命题。',
      solutions: sols,
    }
    const written = writeCard({ records, kind: 'problem', card, settled: false, by: PLANNER_MEMBER })
    return outcomeOf(a, true, { problemId: qid, recordId: written.id })
  }
  return outcomeOf(a, false, { error: 'VMU_INVALID_ARGUMENT', message: 'unreachable: ' + a.action })
}

/**
 * P1-3 自动晋升（v3 `:2173-2201 processPromote` 的等价面，**每 tick 至多一个**）。
 * 条件：命题未定论、优先级不是 never、`价值关键性 >= vmu.v3.promoteValueThreshold`、尚未晋升。
 * 晋升出的“判断命题”问题卡带 `来源命题`，源命题带 `晋升问题` —— **双向指针**，任一侧都能追到另一侧；
 * 幂等依据是这两个字段＋问题 id 派生（同一命题不会重复建卡）。
 */
function processPromote({ records, problems, propos, threshold, at, state, verified = null }) {
  const problemIds = new Set(problems.items.map((p) => p.id))
  const done = verified instanceof Set ? verified : new Set()
  for (const p of propos.items) {
    const c = p.card
    if (!c) continue
    if (c.概率 === 1 || c.概率 === 0) continue
    if (c.优先级 === 'never') continue
    // P1-1：verified 轨上的命题不是候选（已验对象不再调度）。
    if (done.has(p.id)) continue
    const value = Number(c.价值关键性)
    if (c.价值关键性 === null || c.价值关键性 === undefined) continue
    if (!Number.isFinite(value) || value < threshold) continue
    const qid = promotedProblemId(p.id)
    if (problemIds.has(qid)) continue
    if (str(c.晋升问题) !== '') continue
    const sols = []
    for (const it of (Array.isArray(c.proofs) ? c.proofs : [])) {
      sols.push({ title: '【证明】' + str(it.title || '证明'), prob: Number.isFinite(it.prob) ? it.prob : 0.5, status: '未定论', text: '【证明】' + str(it.text) })
    }
    for (const it of (Array.isArray(c.refutes) ? c.refutes : [])) {
      sols.push({ title: '【证伪】' + str(it.title || '证伪'), prob: Number.isFinite(it.prob) ? it.prob : 0.5, status: '未定论', text: '【证伪】' + str(it.text) })
    }
    const card = {
      id: qid,
      标题: '判断命题：' + str(c.标题 || p.id),
      状态: '求解中',
      优先级: 1,
      依赖: [],
      来源: 'promote',
      来源命题: p.id,
      计划: '证明或证伪源命题 ' + p.id + '（验证结果回写源命题）。',
      陈述: '判断下述命题是否成立：' + str(c.陈述),
      来源与动机: '由命题 ' + p.id + '（价值/关键性=' + value + '）自动晋升，目标：证明或证伪该命题；验证结果回写源命题。',
      solutions: sols,
    }
    const written = writeCard({ records, kind: 'problem', card, settled: false, by: PLANNER_MEMBER })
    updateCard({ records, id: p.recordId, patch: { anchors: { 晋升问题: qid } }, reason: 'v3 planner: proposition ' + p.id + ' promoted to problem ' + qid })
    if (state) {
      state.promotions += 1
      state.lastPromotion = { propositionId: p.id, problemId: qid, recordId: written.id, at, value, threshold }
    }
    return { ok: true, promoted: 1, propositionId: p.id, problemId: qid, recordId: written.id, value, threshold }
  }
  return { ok: true, promoted: 0, threshold }
}

/** v3 `:2522` 的 qid 派生（同一公式，保持两侧可对照）。 */
export function promotedProblemId(propositionId) {
  return 'q-promoted-' + str(propositionId).replace(/[^a-z0-9-]/gi, '').slice(-12)
}

/** 把计划里的下一步安排回写到问题卡的 `- 计划:` 锚点（v3 `:2456-2465`），一律经 dataplane.updateCard。 */
function applyPlanToProblemCards(actions, { records, problems }) {
  const byId = new Map(problems.items.map((p) => [p.id, p]))
  const updated = []
  for (const a of actions) {
    if (!a.target) continue
    const p = byId.get(a.target)
    if (!p) continue
    const desc = a.reason ? a.reason : ('下一步：' + (a.role ? a.role : a.action) + (a.direction ? ' ' + a.direction : ''))
    if (str(p.card.计划) === desc) continue
    try {
      const res = updateCard({ records, id: p.recordId, patch: { anchors: { [PLAN_ANCHOR]: desc } }, reason: 'v3 planner: next-step note on ' + p.id })
      p.card.计划 = desc
      updated.push({ id: p.id, recordId: p.recordId, rev: res.rev })
    } catch (e) {
      updated.push({ id: p.id, recordId: p.recordId, failed: str((e && e.code) || (e && e.message)) })
    }
  }
  return updated
}

// ── 计划记录：归一化落盘 / 队列排空 ───────────────────────────────────────────────────────────────────
/** 执行一段已校验的动作（容量之内），逐条产出 outcome —— settlePlan 与"人工门放行后的执行器"共用**同一段**。 */
async function executeValidatedActions({ records, turn, at, capacity, problems, propos, state, actions }) {
  const outcomes = []
  const queued = []
  let executedThisTick = 0
  const list = Array.isArray(actions) ? actions : []
  for (const a of list) {
    if (executedThisTick >= capacity) { queued.push(a); continue }
    let o
    try { o = await executeOne(a, { turn, records, problems, propos, at, state }) } catch (e) {
      o = outcomeOf(a, false, { error: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) })
    }
    outcomes.push(o)
    executedThisTick += 1
  }
  return { outcomes, queued }
}

/**
 * 计划门放行后的执行器（注册给 gates.js；批准/切回 auto 的放行会调到它）。
 * ★ **复用** `executeValidatedActions` 与 `applyPlanToProblemCards`，不复制执行逻辑；批准时按"整条计划"执行
 *   （计划在校验阶段已按 horizon 截断，所以这里容量 = 该计划的动作数）。
 */
function planGateExecutorFor({ records, turn, state }) {
  return async (gate) => {
    const payload = isObject(gate && gate.payload) ? gate.payload : {}
    const planId = str(payload.planId || (gate && gate.subject))
    const at = Number.isFinite(gate && gate.at) ? gate.at : null
    const rec = records.get({ id: planId })
    const canonical = readPlanRecord({ body: rec.body })
    if (!canonical) {
      throw refuse('VMU_STATE', 'gate points at a plan record that is not the canonical JSON shape: ' + planId,
        'the plan must be settled (canonical JSON) before it can be released')
    }
    const actions = Array.isArray(canonical.validated) ? canonical.validated : []
    const problems = loadCardIndex(records, 'problems', 'problem')
    const propos = loadCardIndex(records, 'propos', 'proposition')
    const executed = await executeValidatedActions({ records, turn, at, capacity: Math.max(1, actions.length), problems, propos, state, actions })
    canonical.outcomes = executed.outcomes
    canonical.queued = executed.queued
    canonical.status = executed.queued.length > 0 ? (executed.outcomes.length > 0 ? 'partial' : 'queued') : 'executed'
    canonical.releasedAt = at
    canonical.gateStatus = 'released'
    canonical.gateId = str(gate && gate.gateId)
    supersedeBody({
      records, id: planId, body: JSON.stringify(canonical, null, 2),
      reason: 'v3 plan released by a human gate: ' + executed.outcomes.length + ' executed / ' + executed.queued.length + ' left',
      by: PLANNER_MEMBER,
    })
    applyPlanToProblemCards(actions, { records, problems })
    state.lastPlan = { planId, at, summary: str(canonical.summary), validated: actions.length, rejected: canonical.rejected || 0, truncated: canonical.truncated || 0, outcomes: executed.outcomes.length, queued: executed.queued.length, status: canonical.status, rev: null, released: true }
    state.lastExecuted = executed.outcomes.length
    state.gateReleased = (state.gateReleased || 0) + 1
    return { ok: true, planId, outcomes: executed.outcomes.length, queued: executed.queued.length, status: canonical.status }
  }
}

/** 最新一条"正在等人放行"的计划（没有 ⇒ null）。planner 靠它在 manual 下**不重复规划**。 */
export function awaitingPlan(records) {
  const list = records.list({ track: PLAN_TRACK, limit: 0 })
  let best = null
  for (const head of list.items) {
    let rec = null
    try { rec = records.get({ id: head.id }) } catch (e) { continue }
    const canonical = readPlanRecord({ body: rec.body })
    if (!canonical || canonical.status !== 'awaiting-approval') continue
    if (best === null || (head.updatedAt || 0) >= (best.updatedAt || 0)) {
      best = { recordId: head.id, planId: str(canonical.planId) || head.id, gateId: str(canonical.gateId) || null, canonical, updatedAt: head.updatedAt }
    }
  }
  return best
}

/** 把一条 awaiting 计划收成终态（**只有**"被拒绝 / 放行失败"走这里；批准由执行器写 executed）。 */
function closeAwaitingPlan({ records, planId, status, gate, at }) {
  const rec = records.get({ id: planId })
  const canonical = readPlanRecord({ body: rec.body })
  if (!canonical) return { ok: false, code: 'VMU_STATE' }
  canonical.status = status
  canonical.gateStatus = str(gate && gate.status)
  canonical.queued = []
  canonical.closedAt = at
  canonical.note = 'mode=manual: the human gate ended as ' + str(gate && gate.status) + '; the queued actions were NOT executed (a terminal plan status, not a pending one)'
  supersedeBody({ records, id: planId, body: JSON.stringify(canonical, null, 2), reason: 'v3 plan closed without execution: gate ' + str(gate && gate.status), by: PLANNER_MEMBER })
  return { ok: true, planId, status }
}

/**
 * 把一个规划回执的**原始**计划记录就地归一化：校验 → **人工门判定** → 按容量执行 → 逐条 outcome 写回。
 * manual 且未放行 ⇒ 计划记录写 `status:'awaiting-approval'` ＋ `gateId`，**一条动作都不执行**（P0-8）。
 */
async function settlePlan({ records, turn, rawPlan, planRecordId, at, horizon, capacity, problems, propos, verified = null, state, human = null, mode = 'auto' }) {
  const check = validatePlan(rawPlan.actions, { horizon, problems, propos, verified })
  // ★ P0-8：执行前先过人工门。auto ⇒ 直通且**零记录**；manual ⇒ 开一扇 pending 门并停在这里。
  const gate = evaluateGate({
    records, human, at, mode, kind: 'plan',
    subject: planRecordId,
    payload: { planId: planRecordId, actions: check.validated, summary: rawPlan.summary, horizon },
    why: 'v3 plan awaiting human approval (' + check.validated.length + ' validated actions)',
    by: PLANNER_MEMBER,
  })
  const baseBody = {
    version: 1, kind: 'v3-plan', at, horizon,
    summary: rawPlan.summary, raw: rawPlan.actions,
    validated: check.validated, rejected: check.rejected, truncated: check.truncated,
    duplicates: check.duplicates, rejectReasons: check.rejectReasons,
  }
  if (!gate.allow) {
    // 登记执行器：批准后 gates.js 调它；不注册的话批准会落 failed（gates.js 的终态语义：没执行绝不伪装成放行）。
    registerGateExecutor(records, 'plan', planGateExecutorFor({ records, turn, state }))
    const body = Object.assign({}, baseBody, {
      outcomes: [], queued: check.validated,
      status: 'awaiting-approval',
      gateId: gate.gateId || null,
      gateOutcome: gate.decision ? gate.decision.outcome : 'pending',
      note: 'mode=manual: this plan is QUEUED behind a human gate and was NOT executed; approve it (or switch to auto) to release',
    })
    const written = supersedeBody({ records, id: planRecordId, body: JSON.stringify(body, null, 2), reason: 'v3 plan awaiting human approval: ' + check.validated.length + ' actions queued', by: PLANNER_MEMBER })
    state.lastPlan = { planId: planRecordId, at, summary: rawPlan.summary, validated: check.validated.length, rejected: check.rejected, truncated: check.truncated, outcomes: 0, queued: check.validated.length, status: 'awaiting-approval', rev: written && written.rev }
    state.awaiting = (state.awaiting || 0) + 1
    state.lastExecuted = 0
    return Object.assign({ ok: true, recordId: planRecordId, awaitingApproval: true, gateId: gate.gateId || null, decision: gate.decision }, body)
  }
  const executed = await executeValidatedActions({ records, turn, at, capacity, problems, propos, state, actions: check.validated })
  const body = Object.assign({}, baseBody, {
    outcomes: executed.outcomes, queued: executed.queued,
    status: executed.queued.length > 0 ? (executed.outcomes.length > 0 ? 'partial' : 'queued') : 'executed',
    gateOutcome: gate.decision ? gate.decision.outcome : 'auto-pass',
    note: 'validated/rejected/truncated are counted; an action that could not be dispatched keeps a named ok:false outcome instead of disappearing',
  })
  const written = supersedeBody({ records, id: planRecordId, body: JSON.stringify(body, null, 2), reason: 'v3 plan settled: ' + check.validated.length + ' kept / ' + check.rejected + ' rejected / ' + check.truncated + ' truncated', by: PLANNER_MEMBER })
  const planUpdated = applyPlanToProblemCards(check.validated, { records, problems })
  state.lastPlan = { planId: planRecordId, at, summary: rawPlan.summary, validated: check.validated.length, rejected: check.rejected, truncated: check.truncated, outcomes: executed.outcomes.length, queued: executed.queued.length, status: body.status, rev: written && written.rev }
  state.lastExecuted = executed.outcomes.length
  return Object.assign({ ok: true, recordId: planRecordId, planUpdated, gate: { allow: true, outcome: gate.decision ? gate.decision.outcome : 'auto-pass' } }, body)
}

/** 排空上一条计划的 `queued` 动作（容量之内），把新的 outcome 追加回同一条记录。 */
async function drainPlanQueue({ records, turn, at, capacity, problems, propos, state }) {
  const latest = latestPlanRecord(records)
  if (!latest) return { ok: true, executed: 0, remaining: 0, reason: 'no-plan-record' }
  const canonical = readPlanRecord(latest)
  if (!canonical) return { ok: true, executed: 0, remaining: 0, reason: 'latest-plan-not-settled-yet' }
  // ★ P0-8：在等人工放行的计划**不能**被排空 —— 否则"manual 下不执行"会被下一个 tick 自己绕过。
  if (canonical.status === 'awaiting-approval') {
    const waiting = Array.isArray(canonical.queued) ? canonical.queued.length : 0
    return { ok: true, executed: 0, remaining: waiting, reason: 'awaiting-approval', gateId: str(canonical.gateId) || null }
  }
  const queued = Array.isArray(canonical.queued) ? canonical.queued.slice() : []
  if (queued.length === 0) return { ok: true, executed: 0, remaining: 0, reason: 'queue-empty' }
  const outcomes = Array.isArray(canonical.outcomes) ? canonical.outcomes.slice() : []
  let executed = 0
  while (queued.length > 0 && executed < capacity) {
    const a = queued.shift()
    let o
    try { o = await executeOne(a, { turn, records, problems, propos, at, state }) } catch (e) {
      o = outcomeOf(a, false, { error: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) })
    }
    outcomes.push(o)
    executed += 1
  }
  canonical.outcomes = outcomes
  canonical.queued = queued
  canonical.status = queued.length > 0 ? 'partial' : 'executed'
  canonical.drainedAt = at
  supersedeBody({ records, id: latest.recordId, body: JSON.stringify(canonical, null, 2), reason: 'v3 plan queue drained: ' + executed + ' executed / ' + queued.length + ' left', by: PLANNER_MEMBER })
  state.lastExecuted = executed
  return { ok: true, executed, remaining: queued.length, recordId: latest.recordId }
}

/** 从回合回执里找这次规划落下的计划记录（K10 路线由钩子直接写，记在 state 上）。 */
function planIdFromReceipt(receipt, state) {
  const executed = Array.isArray(receipt && receipt.executed) ? receipt.executed : []
  for (const e of executed) {
    const r = e && e.result
    // `records.put` 的回执不带 `track`（它带 id/ok/deduplicated…），所以这里只认「progress 字段 + ok + id」，
    // 轨由本模块自己从回执形状推出来（回执是本模块刚要求模型吐的 plans 载荷）。
    if (e.field === 'progress' && r && r.ok === true && typeof r.id === 'string') return r.id
  }
  if (typeof state.lastPersistedPlanId === 'string') {
    const id = state.lastPersistedPlanId
    state.lastPersistedPlanId = null
    return id
  }
  return null
}

/** 规划器不可用/回执不可解析 ⇒ 计一次失败 + 写一条具名 journal（绝不静默）。 */
function recordFailure({ records, at, state, api, error, phase }) {
  state.fails += 1
  // ★ SLV DIAGNOSTIC: the refusal says "no usable object"; the NEXT question is always "what did it actually contain?"
  // (empty / prose / a tool object). Keep a BOUNDED excerpt + length + hadBrace on failures only (a success must never
  // carry 500 characters of reply into the ledger).
  const replyText = error && typeof error.replyText === 'string' ? error.replyText : null
  state.lastError = {
    phase,
    code: str((error && error.code) || 'VMU_MIDDLEWARE_FAILED'),
    message: str((error && error.message) || error),
    at,
    ...(replyText === null ? {} : {
      replyLength: Number.isInteger(error.replyLength) ? error.replyLength : replyText.length,
      hadBrace: error.hadBrace === true,
      replyExcerpt: replyText.slice(0, 500),
    }),
  }
  const maxFails = Number(api.setting('vmu.v3.plannerMaxFails'))
  if (Number.isInteger(maxFails) && maxFails > 0 && state.fails >= maxFails && state.disabled === false) {
    state.disabled = true
    state.lastError.disabledPlannerAfterFails = state.fails
  }
  const failureLines = ['- phase: ' + phase, '- at: ' + (Number.isFinite(at) ? at : 'unknown'), '- code: ' + state.lastError.code, '- message: ' + state.lastError.message, '- consecutiveFails: ' + state.fails, '- plannerDisabled: ' + state.disabled]
  if (replyText !== null) {
    failureLines.push('- replyLength: ' + state.lastError.replyLength)
    failureLines.push('- hadBrace: ' + state.lastError.hadBrace)
    failureLines.push('- replyExcerpt: ' + JSON.stringify(state.lastError.replyExcerpt))
  }
  try {
    writeBody({
      records,
      track: 'journal',
      kind: 'state',
      title: 'v3 planner attempt failed',
      body: failureLines.join('\n'),
      settled: true,
      by: 'v3-planner',
    })
  } catch { /* a journal write must not break the tick; the receipt still carries lastError */ }
  if (state.disabled) {
    try {
      writeBody({
        records, track: 'journal', kind: 'state', title: 'v3 planner disabled after consecutive failures',
        body: '- consecutiveFails: ' + state.fails + '\n- at: ' + (Number.isFinite(at) ? at : 'unknown') + '\n- note: vmu.v3.plannerEnabled is an office-owned H1 setting, so the pack does not flip it; this module self-disables and says so',
        settled: true, by: 'v3-planner',
      })
    } catch { /* same */ }
  }
}

// ── tick 处理器 ─────────────────────────────────────────────────────────────────────────────────────
/** 只有在 `api` 存在时才能 rech 服务；缺失就是装配错误，绝不假装成功。 */
function requireApi(flat, who) {
  const api = flat && flat.api
  if (!api || !api.services) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', who + ' received no api facade, so vmu.records/vmu.turn cannot be reached',
      'a middleware entry must go through kernel/loader.js (module shape), not the raw bus path')
  }
  return api
}

/** 读调用期设置（除 promoteValueThreshold 的 schema 登记待加外均已登记；缺值 ⇒ 声明默认）。 */
function readSettings(api) {
  const horizonRaw = Number(api.setting('vmu.v3.planningHorizon'))
  const minRaw = Number(api.setting('vmu.v3.planMinIntervalMs'))
  const maxLiveRaw = Number(api.setting('vmu.limits.maxLiveMembers'))
  const maxParRaw = Number(api.setting('vmu.limits.maxParallel'))
  // P1-3：晋升阈值（声明默认 0.7；键登记由 Lead 加进 schema）。未登记时缺省回落 0.7，**不是** 0
  // ——0 会让每条命题都晋升；缺省必须等于声明的默认值。
  const promoteRaw = Number(api.setting('vmu.v3.promoteValueThreshold'))
  return {
    plannerEnabled: api.setting('vmu.v3.plannerEnabled') !== false,
    horizon: Number.isInteger(horizonRaw) && horizonRaw >= 0 ? horizonRaw : 3,
    planMinIntervalMs: Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : 30000,
    plannerMaxFails: Number(api.setting('vmu.v3.plannerMaxFails')),
    maxLiveMembers: Number.isFinite(maxLiveRaw) && maxLiveRaw > 0 ? maxLiveRaw : 0,
    // P1-1 容量：内核已声明的并发上限（vmu.limits.maxParallel，机器强制）；0/缺省 ⇒ 不用它。
    maxParallel: Number.isInteger(maxParRaw) && maxParRaw > 0 ? maxParRaw : 0,
    promoteValueThreshold: Number.isFinite(promoteRaw) && promoteRaw >= 0 && promoteRaw <= 1 ? promoteRaw : 0.7,
    // P0-8：人工门读**原始值**（gates.js 的 normaliseGateMode 负责归一化；**脏值**按 manual，fail-closed）。
    // ★ 但"键不存在"不是脏值：内核不把 schema 默认值物化进设置对象，而 `vmu.v3.mode` 的声明默认是 auto
    //   ⇒ 缺省必须回落成 auto（否则每个没显式写 mode 的部署都会静默变成 manual）。只对"缺省"回落，
    //   拼错的字符串仍然 fail-closed（normaliseGateMode 的 unknown-mode 分支）。
    mode: (() => { const v = api.setting('vmu.v3.mode'); return v === undefined || v === null || String(v).trim() === '' ? 'auto' : v })(),
  }
}

/**
 * 本 tick 的执行容量：P1-1 把三处上限合起来取**最小**的正值 —— `vmu.limits.maxLiveMembers`（>0 时）与
 * `vmu.limits.maxParallel`（内核声明的并发上限，>0 时）；都没有 ⇒ 一个计划最多 horizon 个动作。
 * 超出的动作进 `queued`（不丢），下一 tick 由 `drainPlanQueue` 继续。
 */
const capacityOf = (settings) => {
  const caps = [settings.maxLiveMembers, settings.maxParallel].filter((n) => Number.isFinite(n) && n > 0)
  if (caps.length === 0) return Math.max(1, settings.horizon)
  return Math.max(1, Math.floor(Math.min(...caps)))
}

async function onTick(flat) {
  const api = requireApi(flat, 'v3 planner')
  const at = Number.isFinite(flat.at) ? flat.at : null
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  state.ticks += 1
  if (at === null) {
    // 时间只来自注入时钟：没有它就不规划、不执行（与 dataplane 的索引同一纪律）。
    state.lastSkip = { reason: 'no-injected-clock', tick: state.ticks }
    return { ok: true, skipped: 'no-injected-clock', ticks: state.ticks }
  }
  const settings = readSettings(api)
  if (!settings.plannerEnabled) {
    state.lastSkip = { reason: 'planner-disabled', tick: state.ticks }
    return { ok: true, skipped: 'planner-disabled', at, ticks: state.ticks }
  }
  if (state.disabled) {
    state.lastSkip = { reason: 'planner-self-disabled', fails: state.fails, tick: state.ticks }
    return { ok: true, skipped: 'planner-self-disabled', at, fails: state.fails, ticks: state.ticks }
  }
  if (state.inFlight) {
    state.lastSkip = { reason: 'planner-in-flight', tick: state.ticks }
    return { ok: true, skipped: 'planner-in-flight', at, ticks: state.ticks }
  }
  const turn = api.services.get('vmu.turn')
  const capacity = capacityOf(settings)
  // ① 先排空上一次计划的 queued 动作（v3 的 executePlanQueue 在 tick 的第一步）。它可能**造出新问题**
  //    （promote），所以排空之后重新读一次两张卡索引，再组简报/做校验 —— 否则简报会漏掉本 tick 刚晋升的问题。
  state.inFlight = true
  let drained = null
  try {
    const before = loadCardIndex(records, 'problems', 'problem')
    const proposBefore = loadCardIndex(records, 'propos', 'proposition')
    drained = await drainPlanQueue({ records, turn, at, capacity, problems: before, propos: proposBefore, state })
  } catch (e) {
    drained = { ok: false, code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
  } finally {
    state.inFlight = false
  }
  const problems = loadCardIndex(records, 'problems', 'problem')
  const propos = loadCardIndex(records, 'propos', 'proposition')
  const verified = verifiedIds(records)
  // ★ SLV / TWO-PHASE SETTLEMENT (the second tick): the reply landed and turn/reply-parsed persisted the plan
  // record. Settling here - not inside the dispatch hook - is what keeps the hook under its 2000ms budget.
  // ★ SLV CROSS-INSTANCE: the reply hook may run in ANOTHER kernel assembly (a subagent session), so a process-local
  // `lastPersistedPlanId` is not enough. The PLANS TRACK is the shared durable fact: settle the latest plan record that is
  // still raw/unsettled even if this process never saw its reply.
  let deferredPlanId = state.lastPersistedPlanId
  if (!deferredPlanId) {
    try {
      const latest = latestPlanRecord(records)
      if (latest) {
        const canon = readPlanRecord(latest)
        const status = str(canon && canon.status)
        const terminal = status === 'executed' || status === 'partial' || status === 'rejected' || status === 'gate-failed' || status === 'awaiting-approval'
        if (!canon || !terminal) deferredPlanId = latest.id || latest.recordId || null
      }
    } catch { deferredPlanId = null }
  }
  if (deferredPlanId) {
    state.lastPersistedPlanId = null
    let human = null
    try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.human')) human = api.services.get('vmu.human') } catch (e) { human = null }
    try {
      const rec = records.get({ id: deferredPlanId })
      // IDEMPOTENT: a plan record already in a terminal state is never settled twice (no second card, no double advance).
      const status = str((rec && rec.status) || '')
      if (status === 'executed' || status === 'partial' || status === 'rejected' || status === 'gate-failed') {
        state.lastDispatched = null
        return { ok: true, settledDeferredPlan: false, alreadyTerminal: true, at, planId: deferredPlanId, status, drained }
      }
      const plan = await settlePlan({ records, turn, rawPlan: readRawPlan(rec), planRecordId: deferredPlanId, at, horizon: settings.horizon, capacity, problems, propos, verified, state, human, mode: settings.mode })
      state.plans += 1
      state.plannerCalls += 1
      state.lastDispatched = null
      return { ok: true, settledDeferredPlan: true, at, planId: deferredPlanId,
        validated: plan.validated.length, rejected: plan.rejected, truncated: plan.truncated, duplicates: plan.duplicates,
        outcomes: plan.outcomes.length, queued: plan.queued.length, status: plan.status,
        awaitingApproval: plan.awaitingApproval === true, gateId: plan.gateId || null,
        plannerTurn: state.lastDispatched ? null : (plan.plannerTurn || null), drained }
    } catch (e) {
      recordFailure({ records, at, state, api, error: e, phase: 'plan-settle' })
      state.lastDispatched = null
      return { ok: true, planned: true, settled: false, at, planId: deferredPlanId, code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e), drained }
    }
  }
  // ★ A DISPATCHED PLANNER TURN THAT FAILED REPORTS ITSELF BACK TO THE PLANNER: the failure lives in
  // turn.dispatchStatus().lastError (with the reply excerpt), so it becomes a named planner failure on the next tick -
  // instead of a fire-and-forget error nobody counts.
  if (state.lastDispatched) {
    const ds = typeof turn.dispatchStatus === 'function' ? turn.dispatchStatus() : null
    const failedTurn = ds && ds.lastError && ds.lastError.turn === state.lastDispatched.turnId ? ds.lastError : null
    if (failedTurn) {
      const missingTurn = state.lastDispatched.turnId
      state.lastDispatched = null
      const err = Object.assign(new Error(str(failedTurn.message)), {
        code: str(failedTurn.code || 'VMU_MIDDLEWARE_FAILED'),
        ...(typeof failedTurn.replyExcerpt === 'string' ? { replyText: failedTurn.replyExcerpt, replyLength: failedTurn.replyLength, hadBrace: failedTurn.hadBrace === true } : {}),
      })
      recordFailure({ records, at, state, api, error: err, phase: 'planner-turn' })
      return { ok: true, planned: false, dispatched: false, at, code: err.code, message: err.message, plannerTurn: missingTurn, drained }
    }
    const age = state.ticks - state.lastDispatched.tick
    if (ds && ds.active === false && ds.queued === 0 && age >= 1 && !state.lastPersistedPlanId) {
      const noPlanTurn = state.lastDispatched.turnId
      state.lastDispatched = null
      recordFailure({ records, at, state, api,
        error: refuse('VMU_INVALID_ARGUMENT', 'the dispatched planner turn ' + str(noPlanTurn) + ' completed without persisting a plan record',
          'the turn id is retained here; a reply that is not a plan envelope must be visible as a planner failure, not silently ignored'),
        phase: 'planner-no-plan' })
      return { ok: true, planned: false, dispatched: false, at, code: 'VMU_INVALID_ARGUMENT', message: 'planner turn completed without a plan record', plannerTurn: noPlanTurn, drained }
    }
  }
  // ★ BOUNDED NO-REPLY EXIT: a dispatched planner turn that never answers must not be able to stall the institute
  // forever. After PLANNER_REPLY_TICKS ticks the pending turn is reported BY NAME with its turn id (not silently lost).
  if (state.lastDispatched) {
    const pending = typeof turn.dispatchStatus === 'function' ? turn.dispatchStatus() : null
    const stillPending = pending && pending.oldestPending && pending.oldestPending.turn === state.lastDispatched.turnId
    const age = state.ticks - state.lastDispatched.tick
    if (stillPending && age >= 5) {
      const missingTurn = state.lastDispatched.turnId
      state.lastDispatched = null
      recordFailure({ records, at, state, api,
        error: refuse('VMU_PACK_V3_PLANNER_REPLY_MISSING', 'the dispatched planner turn ' + str(missingTurn) + ' produced no reply within ' + age + ' ticks',
          'the turn id is retained in this failure record; dispatch status names the oldest pending turn (no reply is NOT treated as no work)'),
        phase: 'planner-reply-missing' })
      return { ok: true, skipped: 'planner-reply-missing', at, turnId: missingTurn, ageTicks: age, drained }
    }
  }
  // P1-3：自动晋升放在重读索引之前 —— 本 tick 晋升出的“判断命题”问题必须出现在同一 tick 的简报里，
  // 否则模型要等到下一 tick 才看得见它（v3 的流程也是 promote 在 buildBrief 之前）。
  let promotion = { ok: true, promoted: 0, threshold: settings.promoteValueThreshold }
  try {
    promotion = processPromote({ records, problems, propos, threshold: settings.promoteValueThreshold, at, state, verified })
  } catch (e) {
    promotion = { ok: false, promoted: 0, code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
  }
  // 晋升可能刚写了一张问题卡：重新读一次，后续候选/简报/校验都看同一份最新索引。
  const problemsNow = promotion.promoted > 0 ? loadCardIndex(records, 'problems', 'problem') : problems
  // ★ P0-8：上一条计划还在等人放行时**不重复规划**（否则 manual 下每 tick 都会再开一扇门）。
  //   门的终态由 gates.js 写；这里只负责把计划记录的终态跟上，并在"被拒绝/放行失败"时收口。
  const awaiting = awaitingPlan(records)
  if (awaiting) {
    const gate = awaiting.gateId ? getGate({ records, gateId: awaiting.gateId }) : null
    const gateStatus = gate ? str(gate.status) : 'missing'
    if (gateStatus === 'pending' || gateStatus === 'missing') {
      state.lastSkip = { reason: 'plan-awaiting-approval', gateId: awaiting.gateId, gateStatus, tick: state.ticks }
      return { ok: true, skipped: 'plan-awaiting-approval', at, gateId: awaiting.gateId, planId: awaiting.recordId, drained }
    }
    if (gateStatus === 'rejected' || gateStatus === 'failed') {
      const closed = closeAwaitingPlan({ records, planId: awaiting.recordId, status: gateStatus === 'rejected' ? 'rejected' : 'gate-failed', gate, at })
      state.lastSkip = { reason: 'plan-gate-' + gateStatus, gateId: awaiting.gateId, planId: awaiting.recordId, closed: closed.ok, tick: state.ticks }
      return { ok: true, skipped: 'plan-gate-' + gateStatus, at, gateId: awaiting.gateId, planId: awaiting.recordId, status: closed.status || null, drained }
    }
    // released：执行器已把计划写成终态（executed/partial）；继续用最新状态往下走。
  }
  // ② 判可推进 + 组简报。
  const advanceable = advanceableProblems(problemsNow, verified)
  const queuedRemaining = drained && Number.isInteger(drained.remaining) ? drained.remaining : 0
  const brief = buildBrief({ records, at, horizon: settings.horizon, maxLiveMembers: settings.maxLiveMembers, problems: problemsNow, state, queuedRemaining })
  if (advanceable.length === 0 && queuedRemaining === 0) {
    state.lastSkip = { reason: 'no-schedulable-work', tick: state.ticks }
    return { ok: true, skipped: 'no-schedulable-work', at, bytes: { problems: problems.items.length, badProblems: problems.bad.length }, drained }
  }
  // ③ 冷却（对**每一次**规划调用生效，含空计划：空计划同样是一次真实的模型调用）。
  if (state.lastPlanAt !== null && at - state.lastPlanAt < settings.planMinIntervalMs) {
    state.lastSkip = { reason: 'cooldown', elapsedMs: at - state.lastPlanAt, minIntervalMs: settings.planMinIntervalMs, tick: state.ticks }
    return { ok: true, skipped: 'cooldown', at, elapsedMs: at - state.lastPlanAt, minIntervalMs: settings.planMinIntervalMs, drained }
  }
  // ④ 调 planner 回合（**只从 tick 里做**；tick 不是 turn，所以不会撞 VMU_TURN_REENTRANT）。
  state.inFlight = true
  state.lastPlanAt = at
  state.lastPersistedPlanId = null
  // ★ SLV / TWO-PHASE: tick DISPATCHES and returns. Settlement happens on a LATER tick, after turn/reply-parsed has
  // persisted the plan record. A tick hook must never await a model turn (its budget is 2000ms).
  let dispatchReceipt = null
  try {
    if (typeof turn.dispatch !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel turn loop exposes no dispatch(spec), so a tick cannot dispatch without blocking',
        'assemble the kernel with the current kernel/turn/index.js (dispatch + whenIdle); keeping a synchronous turn.run in a tick hook is the structural defect this change removes')
    }
    dispatchReceipt = turn.dispatch({
      member: PLANNER_MEMBER,
      role: PLANNER_MEMBER,
      phase: 'normal',
      task: 'v3-plan',
      why: 'v3 tick: schedulable work=' + advanceable.length + ', queued=' + queuedRemaining,
      statusBlock: JSON.stringify(brief, null, 2),
      round: 1,
    })
  } catch (e) {
    state.inFlight = false
    const code = str((e && e.code) || 'VMU_MIDDLEWARE_FAILED')
    recordFailure({ records, at, state, api, error: e, phase: 'planner-dispatch' })
    return { ok: true, planned: false, dispatched: false, at, code, message: str((e && e.message) || e), drained }
  }
  state.inFlight = false
  if (!dispatchReceipt || dispatchReceipt.dispatched !== true) {
    recordFailure({ records, at, state, api, error: refuse('VMU_MIDDLEWARE_FAILED', 'the planner turn could not be dispatched'), phase: 'planner-dispatch' })
    return { ok: true, planned: false, dispatched: false, at, code: 'VMU_MIDDLEWARE_FAILED', message: 'planner turn could not be dispatched', drained }
  }
  state.lastDispatched = { turnId: dispatchReceipt.turn && dispatchReceipt.turn.id ? dispatchReceipt.turn.id : null, tick: state.ticks, at }
  return { ok: true, dispatched: true, planned: false, settled: false, at, plannerTurn: state.lastDispatched.turnId,
    queued: dispatchReceipt.queued, drained, promoted: 0,
    note: 'planner turn dispatched; the reply lands through turn/reply-parsed and the plan is settled on a later tick' }
}

// ── K10：turn/reply-parsed 上的回执归一化 ───────────────────────────────────────────────────────────────
/**
 * 回合回执被解析之后、**派发之前**：把规划器的 `progress` 载荷归一化成计划记录并替它落盘，然后返回
 * `{ rewriteResult: <归一化回执> }`。K10 的语义是「原始回执不再走到派发器」，所以这里必须**同时**完成
 * 落盘 —— 否则有 bus 的装配会丢掉计划（而那正是被删掉的 defect：声明了能改，实际什么也没发生）。
 *
 * ★ 绝不在这里 `turn.run()`：那正是 K2 的 `VMU_TURN_REENTRANT` 要拒的重入。这里只写一条记录。
 */
async function onReplyParsed(flat) {
  const api = flat && flat.api
  if (!api || !api.services) return undefined
  if (str(flat.member) !== PLANNER_MEMBER) return undefined
  const reply = flat.reply
  if (!isObject(reply)) return undefined
  const payload = reply.progress
  if (!isObject(payload)) return undefined
  if (str(payload.track) !== PLAN_TRACK || str(payload.kind) !== PLAN_KIND) return undefined
  if (typeof payload.body !== 'string') return undefined
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((t) => typeof t === 'string' && t.trim() !== '') : []
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  const raw = readRawPlan({ body: payload.body, tags })
  try {
    const rec = writeBody({
      records,
      track: PLAN_TRACK,
      kind: PLAN_KIND,
      title: typeof payload.title === 'string' && payload.title.trim() !== '' ? payload.title : 'v3 计划',
      body: payload.body,
      tags,
      by: PLANNER_MEMBER,
    })
    state.lastPersistedPlanId = rec && rec.id ? rec.id : null
    return {
      rewriteResult: JSON.stringify({
        summary: raw.summary,
        plan: raw.actions,
        normalizedBy: 'v3-planner',
        note: 'the raw progress payload was persisted as a plan record and replaced before dispatch (K10)',
      }),
    }
  } catch (e) {
    // 落盘失败 ⇒ **不改写**：让内核按原载荷派发，它的拒绝会以具名回执/通知到达（绝不静默丢掉计划）。
    return undefined
  }
}

export const V3_PLANNER_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-planner', apiVersion: 1 }),
  // trigger-workflow：解锁 api.services（读 vmu.records / 调 vmu.turn）。
  // rewrite-result：K10 的 decision 能力（return { rewriteResult } 需要它，kernel/bus.js:30-41,556-567）。
  capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
  hooks: Object.freeze({
    [V3_TICK_TOPIC]: onTick,
    [REPLY_PARSED_HOOK]: onReplyParsed,
  }),
})

export default V3_PLANNER_MODULE
