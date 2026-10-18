/**
 * packs/v3/middleware/gates.js — PHASE 6 / **P0-8：人工门（manual mode）**。
 *
 * v3 的 manual 语义（`vibe-math-v3/vibe-math-v3.js:1940-1963` 的 `maybeGate`／`:4973-4992` 的
 * `autoResolvePending`）：**计划审批 / 裁决 / 方法晋升**这三类动作在 manual 下**排队但不执行**，
 * `list` 看得见 pending，人 approve 之后才生效，切回 auto 时把所有 pending 一次放行（放行失败也要
 * 逐条落终态，不能留悬空 pending）。
 *
 * 本文件把它拆成两半，**判定与记账分离**：
 *
 *  ① **判定 = 纯函数 `gateDecision({kind, mode, approval})`**。planner / verify **只调它**，不各自
 *     再写一套"该不该放行"。纯函数不碰 records、不抛异常，未知输入一律 **fail-closed**（不自动放行）。
 *
 *  ② **台账 = `vmu.records` 的 `journal` 轨、kind `decision`**。为什么是这条轨这个 kind：
 *     - 轨与 kind 都已在值层声明（`packs/v3/settings/defaults.json` 的轨清单里有 `journal`，
 *       `allowedKinds` 里有 `decision`）⇒ **不新增轨、不新增 kind、不改任何值层/清单**；
 *     - 为什么不放 `plans` 轨：`planner.js` 的 `latestPlanRecord()` 会取该轨**最新一条记录**当"上一条
 *       计划"去排空队列 —— 把审批记录写进去会让它读到一条不是计划的记录（`readPlanRecord` 返回 null，
 *       排空被延后一整轮）。审批台账不能挡住调度队列，所以不共用那条轨；
 *     - 跨 tick 存活：记录在内核 records 投影里，tick 之间不丢；每条门一条记录，放行/拒绝/失败都
 *       用 `supersede` 写回**同一条**记录（id 不变、rev 递增），所以"这条门最后怎么了"永远可查。
 *       跨进程重启的持久化属于 records→store 投影（P0-9/resume 卡），本卡只承诺"跨 tick"。
 *
 *  ③ **"manual 下不执行"必须可见**：`evaluateGate` 在 manual 且未放行时**写一条 pending 记录**
 *     并返回 `{ allow:false, outcome:'pending', gate }`；模块的 tick 处理器每拍把 pending 条数写进
 *     回执（`pendingBefore`／`pendingAfter`），模块级计数在 `v3GatesStatus()` 里可读。**没有静默跳过**。
 *
 *  ④ **切回 auto 的批量放行**：`releaseAllGates()` 对每条 pending 调执行器；执行器可以是调用方传入的
 *     `execute(gate)`，也可以由消费者用 `registerGateExecutor` 注册。执行成功 ⇒ 终态 `released`
 *     （`executed:true`）；抛错 ⇒ 终态 `failed`（带 `error.code/message`）；**批准了但没有执行器** ⇒ 也是
 *     终态 `failed`（`error.code=VMU_ENGINE_UNAVAILABLE`）——放行失败必须看得见，**绝不留悬空 pending**。
 *
 * ★ 不发新错误码：本仓的错误码是单一登记源（docs/03 由扫描生成），一个未登记的码要么让文档门禁变红、
 *   要么就得改 docs/** —— 两者都不是本卡能做的。所以对外用 `outcome` 字符串 + `note`，抛错只用已登记
 *   的内核码（VMU_INVALID_ARGUMENT / VMU_NO_SUCH_OBJECT / VMU_STATE / VMU_ENGINE_UNAVAILABLE）。
 *
 * ★ 不复制 `packs/v3-core` 的 manual-gate（`packs/v3-core/index.js:111-133`）：那个只挡 `vibe_vmu_script`
 *   一个工具，是近似物；本卡按 v3 的三类动作做真正的"排队-放行"。
 */
import { V3_TICK_TOPIC } from './tick.js'
import { writeBody, supersedeBody } from './dataplane.js'

/** 审批台账的落点：`journal` 轨（已声明）＋ `decision` kind（allowedKinds 里已声明）。 */
export const GATE_TRACK = 'journal'
export const GATE_RECORD_KIND = 'decision'

/** v3 的三类人工门。`method-promote` 是「方法晋升到全局库」（不是规划里的命题 promote——那个是自动的）。 */
export const GATE_KINDS = Object.freeze(['plan', 'verdict', 'method-promote'])
/** 两种模式；未知值一律按 manual 处理（fail-closed）。 */
export const GATE_MODES = Object.freeze(['auto', 'manual'])

/** 记录 tags 的三个前缀：门类 / 门 id / 门状态。列表按它们过滤。 */
export const GATE_TAG_PREFIX = 'gate:'
export const GATE_ID_TAG_PREFIX = 'gate-id:'
export const GATE_STATUS_TAG_PREFIX = 'gate-status:'

/** 门的终态（pending 之外的都算结束，不再被 releaseAllGates 触碰）。cancelled＝作废（不是决定）。 */
export const GATE_TERMINAL_STATUSES = Object.freeze(['released', 'rejected', 'failed', 'cancelled'])

const str = (v) => (v === undefined || v === null ? '' : String(v))
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** 具名拒绝：调用者的词汇 + 已登记的内核码 + hint（AGENTS 红线 3）。 */
function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

// ── ① 判定：纯函数（planner / verify 的唯一切入点） ──────────────────────────────────────────────────────
/**
 * 把"这条动作该不该放行"变成一个可复用判定。**纯**：不读设置、不写记录、不抛错、无时钟。
 *
 * 输入：
 *   - `kind`：三条门类之一（plan / verdict / method-promote）；
 *   - `mode`：**当前模式**（原始值，允许脏值；本函数负责归一化）；
 *   - `approval`：该门已有的放行结果，形状宽容：`{ decision:'allowed'|'denied' }`、
 *     `{ state:'allowed' }`、或 `{ approved:true|false }`。**没传 = 还没人放行**。
 *
 * 输出（稳定形状，调用方按它分支）：
 *   `{ allow, outcome, code, gateKind, mode, reason }`
 *   outcome ∈ auto-pass｜pending｜approved｜rejected｜unknown-mode｜unknown-kind
 *   code 为 null 或**已登记**的内核码（VMU_INVALID_ARGUMENT 等），不引入新码。
 *
 * 三条纪律：
 *   1. **auto ⇒ 直通**（v3：auto 下关键节点自动放行，零延迟）；
 *   2. **未知 mode ⇒ 按 manual**（一个拼错的模式绝不能变成"自动放行"）；
 *   3. **未知 kind ⇒ 不放行**（门类拼错同样不能静默通过）。
 */
export function gateDecision({ kind, mode, approval = null } = {}) {
  const gateKind = str(kind).trim()
  const nm = normaliseGateMode(mode)
  const base = { gateKind: gateKind || null, mode: nm.mode }
  if (!GATE_KINDS.includes(gateKind)) {
    return Object.assign(base, {
      allow: false,
      outcome: 'unknown-kind',
      code: 'VMU_INVALID_ARGUMENT',
      reason: 'unknown gate kind "' + gateKind + '": the three v3 manual gates are ' + GATE_KINDS.join(' / '),
    })
  }
  if (nm.known === false) {
    return Object.assign(base, {
      allow: false,
      outcome: 'unknown-mode',
      code: 'VMU_INVALID_ARGUMENT',
      reason: 'unknown mode "' + str(nm.declared) + '": treated as manual (never auto-allowed); allowed modes are ' + GATE_MODES.join(' / '),
    })
  }
  if (nm.mode === 'auto') {
    return Object.assign(base, { allow: true, outcome: 'auto-pass', code: null, reason: 'mode=auto: the gate passes without waiting' })
  }
  const a = isObject(approval) ? approval : null
  if (a === null) {
    return Object.assign(base, { allow: false, outcome: 'pending', code: null, reason: 'mode=manual: queued, waiting for a human decision' })
  }
  const decision = str(a.decision).toLowerCase()
  const state = str(a.state).toLowerCase()
  const approved = a.approved === true || decision === 'allowed' || decision === 'approved' || state === 'allowed'
  const denied = a.approved === false || decision === 'denied' || decision === 'rejected' || state === 'denied'
  if (approved && !denied) {
    return Object.assign(base, { allow: true, outcome: 'approved', code: null, reason: 'mode=manual: a human approved this gate' })
  }
  if (denied) {
    return Object.assign(base, { allow: false, outcome: 'rejected', code: null, reason: 'mode=manual: a human rejected this gate' })
  }
  return Object.assign(base, {
    allow: false,
    outcome: 'pending',
    code: null,
    reason: 'mode=manual: the approval object carries no usable decision, so it is still pending',
  })
}

/** 模式归一化：返回 { mode, declared, known }。未知值 ⇒ mode='manual'、known=false（fail-closed）。
 * ★ **缺省也按 manual**：调用方必须把设置面读到的模式显式传进来（内核 schema 的默认 auto 由设置读取面
 *   给出），"忘了传"绝不能变成"自动放行"。 */
export function normaliseGateMode(raw) {
  const declared = str(raw).trim().toLowerCase()
  if (GATE_MODES.includes(declared)) return { mode: declared, declared, known: true }
  if (raw === undefined || raw === null || declared === '') return { mode: 'manual', declared: raw, known: false, missing: true }
  return { mode: 'manual', declared: raw, known: false }
}

// ── ② 台账：records 上的一条记录 = 一扇门 ────────────────────────────────────────────────────────────────
/** 模块级计数（诊断用；持久事实在 records 里）。按 records 句柄隔离，避免多内核互相污染。 */
const GATE_STATES = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = GATE_STATES.get(records)
  if (!s) {
    s = { created: 0, approved: 0, rejected: 0, released: 0, failed: 0, cancelled: 0, unexecuted: 0, ticks: 0, lastTick: null, lastError: null }
    GATE_STATES.set(records, s)
  }
  lastState = s
  return s
}

/** 只读自报（诊断用；重启归零，不当作持久计数——持久事实用 listGates 读记录）。 */
export function v3GatesStatus() {
  const s = lastState
  if (!s) {
    return { track: GATE_TRACK, kinds: GATE_KINDS.slice(), counts: { created: 0, approved: 0, rejected: 0, released: 0, failed: 0, cancelled: 0, unexecuted: 0, ticks: 0 }, lastTick: null, lastError: null, note: 'no gate has been evaluated in this process yet' }
  }
  return {
    track: GATE_TRACK,
    kinds: GATE_KINDS.slice(),
    counts: { created: s.created, approved: s.approved, rejected: s.rejected, released: s.released, failed: s.failed, cancelled: s.cancelled || 0, unexecuted: s.unexecuted, ticks: s.ticks },
    lastTick: s.lastTick === null ? null : Object.assign({}, s.lastTick),
    lastError: s.lastError === null ? null : Object.assign({}, s.lastError),
  }
}

/** 记录 tags：门类 / id / 状态（三者都是**已存在**的 tag 约定，不新增记录字段）。 */
export function gateTags(gateId, kind, status) {
  return [GATE_TAG_PREFIX + str(kind), GATE_ID_TAG_PREFIX + str(gateId), GATE_STATUS_TAG_PREFIX + str(status)]
}

/** 门的规范视图（body JSON 的稳定形状；读不到/坏记录 ⇒ null 由调用方点名）。 */
function gateBodyOf(rec) {
  const text = str(rec && rec.body)
  if (!text.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(text)
    if (isObject(parsed) && parsed.gate === 1) return parsed
  } catch { /* 坏记录由调用方按 null 处理并点名 */ }
  return null
}

function requireRecords(records, who) {
  if (!records || typeof records.put !== 'function' || typeof records.list !== 'function' || typeof records.get !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', who + ' needs a vmu.records handle', 'pass { records: kernel.records }')
  }
  return records
}

/** 可选的人性面镜像：拿不到就不镜像（不影响台账）。 */
function humanOf(human) { return human && typeof human.openApproval === 'function' && typeof human.decide === 'function' ? human : null }

/**
 * 开一扇 pending 门（写记录 + 尽力镜像到 vmu.human 的审批面）。
 * **pending 是事实**，所以记录一开始就是 settled（不依赖"未定稿可写"那把值层开关）。
 * 写入次数固定为 **1 put + 1 supersede**：id 是 put 之后才有的，所以正文里带 id 的那一版只能写回一次。
 */
export function createGate({ records, human = null, at = null, kind, subject = '', payload = null, why = '', by = null } = {}) {
  const recs = requireRecords(records, 'createGate')
  const gateKind = str(kind).trim()
  if (!GATE_KINDS.includes(gateKind)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown gate kind "' + gateKind + '"', 'the v3 manual gates are ' + GATE_KINDS.join(' / '))
  }
  const atMs = Number.isFinite(at) ? at : null
  // 记录 id 就是门 id：一条记录的一生（pending → 终态）只有一个 id，查证不需要第二张映射表。
  const body0 = {
    gate: 1,
    kind: gateKind,
    subject: str(subject),
    why: str(why),
    payload: payload === undefined ? null : payload,
    at: atMs,
    status: 'pending',
    approvalId: null,
    decidedAt: null,
    decidedBy: null,
    reason: null,
    executed: false,
    error: null,
    mirrorError: null,
    note: 'mode=manual: this action is QUEUED and was NOT executed',
  }
  const written = writeBody({
    records: recs,
    track: GATE_TRACK,
    kind: GATE_RECORD_KIND,
    title: 'v3 人工门｜' + gateKind + '｜' + (str(subject) || '(no subject)'),
    body: JSON.stringify(body0, null, 2),
    tags: [GATE_TAG_PREFIX + gateKind, GATE_STATUS_TAG_PREFIX + 'pending'],
    settled: true,
    by: by || 'v3-gates',
  })
  const gateId = str(written && written.id)
  if (!gateId) throw refuse('VMU_ENGINE_UNAVAILABLE', 'the records face returned no id for the gate record, so the pending gate cannot be named', 'check the put receipt returned by the records face')
  // 镜像到人性面（尽力而为；失败写进 mirrorError，绝不假装成功）。
  let approvalId = null
  let mirrorError = null
  const h = humanOf(human)
  if (h) {
    try {
      const ap = h.openApproval({ subject: 'v3 ' + gateKind + ': ' + (str(subject) || '(no subject)'), requestId: gateId })
      approvalId = str(ap && ap.id) || gateId
    } catch (e) {
      mirrorError = str((e && e.code) || (e && e.message))
    }
  }
  const finalBody = Object.assign({}, body0, { gateId, approvalId: approvalId || gateId, mirrorError })
  let rev = (written && written.rev) || 1
  try {
    const res = supersedeBody({
      records: recs,
      id: gateId,
      body: JSON.stringify(finalBody, null, 2),
      tags: gateTags(gateId, gateKind, 'pending'),
      reason: 'v3 gate: name the pending gate and record its mirrored approval id',
      by: by || 'v3-gates',
    })
    rev = res && res.rev
  } catch (e) {
    const s0 = stateFor(recs)
    s0.lastError = { phase: 'gate-naming', code: str((e && e.code) || (e && e.message)), at: atMs }
  }
  const s = stateFor(recs)
  s.created += 1
  const view = Object.assign({}, finalBody, { gateId, recordId: gateId, rev })
  return { ok: true, gateId, recordId: gateId, approvalId: view.approvalId, status: 'pending', decision: gateDecision({ kind: gateKind, mode: 'manual' }), gate: view }
}

/**
 * **判定 + 记账**（消费方的统一入口）：auto ⇒ 直接放行且**一条记录都不写**（零开销、零延迟）；
 * manual 且未放行 ⇒ 开一扇 pending 门并返回 allow:false（这就是"具名跳过"：调用方拿到 outcome 与 gate）。
 * `approval` 由调用方按门 id 查到后传进来（或直接传 `{ approved:true }`）。
 */
export function evaluateGate({ records, human = null, at = null, mode, kind, subject = '', payload = null, why = '', approval = null, by = null } = {}) {
  const d = gateDecision({ kind, mode, approval })
  if (d.allow) return { ok: true, allow: true, decision: d, gate: null }
  if (d.outcome !== 'pending') return { ok: true, allow: false, decision: d, gate: null }
  const created = createGate({ records, human, at, kind, subject, payload, why, by })
  return { ok: true, allow: false, decision: d, gate: created.gate, gateId: created.gateId }
}

/** 读一扇门（不存在 ⇒ null，不抛；调用方负责具名）。 */
export function getGate({ records, gateId } = {}) {
  const recs = requireRecords(records, 'getGate')
  const id = str(gateId)
  if (!id) return null
  let rec = null
  try { rec = recs.get({ id }) } catch (e) { if (str(e && e.code) === 'VMU_NO_SUCH_OBJECT') return null; throw e }
  const body = gateBodyOf(rec)
  if (!body) return null
  return Object.assign({}, body, { gateId: str(body.gateId) || id, recordId: id, rev: rec.rev, updatedAt: rec.updatedAt })
}

/**
 * 列台账：pending 与已终结分开，坏记录点名（计入 `bad`，不静默跳过）。
 * 只按记录 body 的 `gate===1` 认门——journal 轨上还有 tick/规划失败的 state 记录，不能被当成门。
 */
export function listGates({ records, status = null } = {}) {
  const recs = requireRecords(records, 'listGates')
  const list = recs.list({ track: GATE_TRACK, limit: 0 })
  const pending = []
  const resolved = []
  const bad = []
  const wanted = status === null ? null : str(status)
  for (const head of list.items) {
    if (head.kind !== GATE_RECORD_KIND) continue
    let rec = null
    try { rec = recs.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, reason: str((e && e.code) || (e && e.message)) }); continue }
    const body = gateBodyOf(rec)
    if (!body) { bad.push({ recordId: head.id, reason: 'not-a-gate-record' }); continue }
    const view = Object.assign({}, body, { gateId: str(body.gateId) || head.id, recordId: head.id, rev: rec.rev, updatedAt: rec.updatedAt })
    if (view.status === 'pending') { if (wanted === null || wanted === 'pending') pending.push(view) }
    else { if (wanted === null || wanted === view.status) resolved.push(view) }
  }
  const byStatus = { pending: pending.length }
  for (const st of GATE_TERMINAL_STATUSES) byStatus[st] = 0
  for (const v of resolved) byStatus[GATE_TERMINAL_STATUSES.includes(v.status) ? v.status : 'failed'] += 1
  return { ok: true, pending, resolved, bad, counts: { pending: pending.length, resolved: resolved.length, total: pending.length + resolved.length, byStatus } }
}

// ── ③ 放行 / 拒绝 / 批量放行（终态一律写回同一条记录） ──────────────────────────────────────────────────
/** 执行器注册表：按 records 句柄隔离（一个进程里可以同时存在多个内核）。 */
const EXECUTORS = new WeakMap()
/** 消费者（planner/verify）在装配时注册自己的执行器：kind → async (gateView) => any。 */
export function registerGateExecutor(records, kind, fn) {
  const recs = requireRecords(records, 'registerGateExecutor')
  const k = str(kind).trim()
  if (!GATE_KINDS.includes(k)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown gate kind "' + k + '"', 'the v3 manual gates are ' + GATE_KINDS.join(' / '))
  if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'a gate executor must be a function', 'pass (gateView) => Promise')
  let map = EXECUTORS.get(recs)
  if (!map) { map = new Map(); EXECUTORS.set(recs, map) }
  map.set(k, fn)
  return { ok: true, kind: k }
}
/** 注销执行器（pack unload / 测试收尾；不注销也不泄漏，因为 WeakMap 随 records 一起回收）。 */
export function clearGateExecutors(records) {
  const recs = requireRecords(records, 'clearGateExecutors')
  EXECUTORS.delete(recs)
  return { ok: true }
}
function executorFor(records, kind) {
  const map = EXECUTORS.get(records)
  if (!map) return null
  const fn = map.get(str(kind))
  return typeof fn === 'function' ? fn : null
}

/** 门的正文只保留稳定字段：视图字段（recordId/rev/updatedAt/bounded）不写回 JSON。 */
const GATE_BODY_FIELDS = Object.freeze(['gate', 'gateId', 'kind', 'subject', 'why', 'payload', 'at', 'status', 'approvalId',
  'decidedAt', 'decidedBy', 'reason', 'executed', 'error', 'mirrorError', 'note'])
function canonicalGateBody(gate) {
  const out = {}
  for (const k of GATE_BODY_FIELDS) if (Object.prototype.hasOwnProperty.call(gate || {}, k)) out[k] = gate[k]
  return out
}

/** 终态写回：同一 id、rev+1，正文与 tags 一起更新（tags 里的 gate-status 是列表的第一层可读面）。 */
function settleGate({ records, gateId, current, patch, reason, by }) {
  const next = canonicalGateBody(Object.assign({}, current, patch))
  const res = supersedeBody({
    records,
    id: gateId,
    body: JSON.stringify(next, null, 2),
    tags: gateTags(gateId, next.kind, next.status),
    reason: reason || ('v3 gate ' + gateId + ' → ' + next.status),
    by: by || 'v3-gates',
  })
  return Object.assign({}, next, { gateId, recordId: gateId, rev: res && res.rev, bounded: res && res.bounded })
}

/** 人性面镜像（尽力而为；失败写进 mirrorError，台账才是事实源）。 */
function mirrorHuman(human, gateId, allow, by, reason) {
  const h = humanOf(human)
  if (!h) return null
  try {
    const r = h.decide({ requestId: str(gateId), allow: allow === true, reason: reason === undefined ? null : reason, by: by === undefined ? null : by })
    return r && r.decision ? str(r.decision) : null
  } catch (e) {
    return { mirrorError: str((e && e.code) || (e && e.message)) }
  }
}

/**
 * 放行一扇门：**先执行、再落终态**（执行失败也落终态，绝不回到 pending）。
 * `execute` 可选：不传就用 `registerGateExecutor` 注册的那个；都没有 ⇒ 终态 released 但
 * `executed:false` + `error.code='VMU_ENGINE_UNAVAILABLE'`（**可见的未执行**，不是悬空 pending）。
 */
export async function approveGate({ records, human = null, at = null, gateId, by = null, reason = null, execute = null } = {}) {
  const recs = requireRecords(records, 'approveGate')
  const gate = getGate({ records: recs, gateId })
  if (!gate) return { ok: false, code: 'VMU_NO_SUCH_OBJECT', message: 'unknown gate: ' + str(gateId), hint: 'listGates returns the pending gate ids' }
  if (gate.status !== 'pending') return { ok: false, code: 'VMU_STATE', message: 'gate ' + gate.gateId + ' is already ' + gate.status + ' (a terminal gate is not re-decided)', hint: 'open a new gate if the action must be re-approved' }
  const atMs = Number.isFinite(at) ? at : null
  const fn = typeof execute === 'function' ? execute : executorFor(recs, gate.kind)
  const s = stateFor(recs)
  s.approved += 1
  const decided = { decidedAt: atMs, decidedBy: by === null ? null : str(by), reason: reason === null ? null : str(reason) }
  if (!fn) {
    // 批准了但**没有执行器**：这是"放行失败"，落终态 failed（不是 released）——绝不让一条没执行的动作
    // 看起来像"已放行"，也绝不留在 pending 里假装还在等。
    s.failed += 1
    s.unexecuted += 1
    const mirror = mirrorHuman(human, gate.gateId, true, by, reason)
    const out = settleGate({
      records: recs, gateId: gate.gateId, current: gate,
      patch: Object.assign({}, decided, {
        status: 'failed', executed: false,
        error: { code: 'VMU_ENGINE_UNAVAILABLE', message: 'no executor is registered for gate kind "' + gate.kind + '", so NO action was executed (the gate is a terminal FAILURE, not a release)' },
        mirrorError: isObject(mirror) ? mirror.mirrorError : null,
        note: 'released decision could not be executed: register an executor with registerGateExecutor (planner/verify) or pass execute()',
      }),
      reason: 'v3 gate approved but has no executor → failed', by,
    })
    return { ok: false, gate: out, executed: false, error: out.error, decision: gateDecision({ kind: gate.kind, mode: 'manual', approval: { approved: true } }) }
  }
  let executed = false
  let error = null
  try {
    await fn(Object.assign({}, gate))
    executed = true
  } catch (e) {
    error = { code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
    s.lastError = { phase: 'execute', gateId: gate.gateId, kind: gate.kind, code: error.code, message: error.message, at: atMs }
  }
  const mirror = mirrorHuman(human, gate.gateId, true, by, reason)
  const status = executed ? 'released' : 'failed'
  if (executed) s.released += 1; else s.failed += 1
  const out = settleGate({
    records: recs, gateId: gate.gateId, current: gate,
    patch: Object.assign({}, decided, { status, executed, error, mirrorError: isObject(mirror) ? mirror.mirrorError : null, note: executed ? 'approved and executed' : 'approved but the action FAILED: this is a terminal failure, not a pending gate' }),
    reason: 'v3 gate approved → ' + status, by,
  })
  return { ok: executed, gate: out, executed, error, decision: gateDecision({ kind: gate.kind, mode: 'manual', approval: { approved: true } }) }
}

/** 拒绝一扇门：终态 rejected，**不执行**执行器。 */
export function rejectGate({ records, human = null, at = null, gateId, by = null, reason = null } = {}) {
  const recs = requireRecords(records, 'rejectGate')
  const gate = getGate({ records: recs, gateId })
  if (!gate) return { ok: false, code: 'VMU_NO_SUCH_OBJECT', message: 'unknown gate: ' + str(gateId), hint: 'listGates returns the pending gate ids' }
  if (gate.status !== 'pending') return { ok: false, code: 'VMU_STATE', message: 'gate ' + gate.gateId + ' is already ' + gate.status, hint: 'a terminal gate is not re-decided' }
  const s = stateFor(recs)
  s.rejected += 1
  const mirror = mirrorHuman(human, gate.gateId, false, by, reason)
  const out = settleGate({
    records: recs, gateId: gate.gateId, current: gate,
    patch: { decidedAt: Number.isFinite(at) ? at : null, decidedBy: by === null ? null : str(by), reason: reason === null ? null : str(reason), status: 'rejected', executed: false, error: null, mirrorError: isObject(mirror) ? mirror.mirrorError : null, note: 'rejected by a human: the action was NOT executed' },
    reason: 'v3 gate rejected', by,
  })
  return { ok: true, gate: out, executed: false }
}

/**
 * PHASE 6（目标 3 审计，半成品对）：取消一扇**未决**门。与 reject 的区别是语义，不是状态字：
 * reject 是"人做了否定的决定"（动作不执行，记录一个决定）；cancel 是"这个请求作废了"（主体没了／被取代／
 * 误开），没有决定可记。终态 `cancelled` 进台账后不再出现在 pending 里，因此不再阻塞消费方；
 * 已终结的门不可再取消（具名 VMU_STATE），取消必须带理由（具名 VMU_INVALID_ARGUMENT）。
 */
export function cancelGate({ records, human = null, at = null, gateId, by = null, reason = null } = {}) {
  const recs = requireRecords(records, 'cancelGate')
  if (reason === null || str(reason).trim() === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'cancelGate needs a reason (why is this gate being withdrawn?)', 'pass reason: "superseded by a new plan", "opened by mistake", …')
  }
  const gate = getGate({ records: recs, gateId })
  if (!gate) return { ok: false, code: 'VMU_NO_SUCH_OBJECT', message: 'unknown gate: ' + str(gateId), hint: 'listGates returns the pending gate ids' }
  if (gate.status !== 'pending') return { ok: false, code: 'VMU_STATE', message: 'gate ' + gate.gateId + ' is already ' + gate.status, hint: 'only a pending gate can be cancelled (a terminal gate is not re-decided)' }
  const s = stateFor(recs)
  s.cancelled = (s.cancelled || 0) + 1
  // The human approval MIRROR must not be left pending after the gate is withdrawn (a stayed-pending mirror would
  // make a cancelled request look actionable in the human face). PHASE 6: the human face now has the SAME vocabulary
  // (`withdrawApproval`), so the mirror uses it when present and falls back to `decide({allow:false})` on an older face.
  // A mirror failure is recorded in mirrorError rather than swallowed (the ledger stays the source of truth).
  let mirror = null
  const h = humanOf(human)
  if (h) {
    try {
      mirror = typeof h.withdrawApproval === 'function'
        ? h.withdrawApproval({ requestId: gate.gateId, by, reason: str(reason).trim() })
        : mirrorHuman(human, gate.gateId, false, by, 'cancelled: ' + str(reason).trim())
    } catch (e) {
      mirror = { mirrorError: str((e && e.code) || (e && e.message)) }
    }
  }
  const out = settleGate({
    records: recs, gateId: gate.gateId, current: gate,
    patch: {
      status: 'cancelled', executed: false, error: null,
      decidedAt: Number.isFinite(at) ? at : null,
      decidedBy: by === null ? null : str(by),
      reason: str(reason).trim(),
      mirrorError: isObject(mirror) ? mirror.mirrorError : null,
      note: 'cancelled (withdrawn, not decided): the action was NOT executed and the gate no longer blocks',
    },
    reason: 'v3 gate cancelled', by,
  })
  return { ok: true, gate: out, executed: false, cancelled: true }
}

/**
 * ★ 切回 auto 时的批量放行：对**每一条** pending 调执行器并落终态。
 * 执行器顺序：显式 `execute`（对所有门类）→ 按 kind 注册的执行器 → 都没有 ⇒ released-unexecuted。
 * 任何一条执行失败只影响它自己（终态 failed），**不中断其余门**；返回逐条 outcomes，绝不把失败吞掉。
 */
export async function releaseAllGates({ records, human = null, at = null, by = null, execute = null } = {}) {
  const recs = requireRecords(records, 'releaseAllGates')
  const before = listGates({ records: recs, status: 'pending' })
  const outcomes = []
  for (const gate of before.pending) {
    try {
      const r = await approveGate({ records: recs, human, at, gateId: gate.gateId, by: by === null ? 'auto-release' : by, reason: 'mode switched to auto: pending gates are released in order', execute })
      outcomes.push({ gateId: gate.gateId, kind: gate.kind, ok: r.ok === true, status: r.gate ? r.gate.status : null, executed: r.executed === true, error: r.error || null })
    } catch (e) {
      // approveGate 自己不该抛；真抛了也要把这条门落终态，否则它就成了悬空 pending。
      const out = settleGate({
        records: recs, gateId: gate.gateId, current: gate,
        patch: { status: 'failed', executed: false, error: { code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }, note: 'auto-release threw while releasing: terminal failure' },
        reason: 'v3 gate auto-release failed', by: by === null ? 'auto-release' : by,
      })
      outcomes.push({ gateId: gate.gateId, kind: gate.kind, ok: false, status: out.status, executed: false, error: out.error })
    }
  }
  const after = listGates({ records: recs, status: 'pending' })
  const failed = outcomes.filter((o) => o.status === 'failed').length
  const released = outcomes.filter((o) => o.status === 'released').length
  const unexecuted = outcomes.filter((o) => o.executed === false && o.error && o.error.code === 'VMU_ENGINE_UNAVAILABLE').length
  return { ok: true, mode: 'auto', pendingBefore: before.pending.length, released, failed, unexecuted, outcomes, pendingAfter: after.pending.length }
}

// ── ④ 模块：每个 tick 检查模式；manual→auto 时批量放行 ────────────────────────────────────────────────────
function requireApi(flat) {
  const api = flat && flat.api
  if (!api || !api.services) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'v3 gates received no api facade, so vmu.records/vmu.human cannot be reached',
      'a middleware entry must go through kernel/loader.js (module shape), not the raw bus path')
  }
  return api
}

/**
 * tick 处理器：只做两件事——
 *   ① 把"现在什么模式、还有多少门在等"写进回执（**可见**，不是静默）；
 *   ② 模式已经是 auto 且还有 pending ⇒ 调 `releaseAllGates()` 全部放行（终态写回，失败也落终态）。
 * 不放行 manual 下的任何东西；也不在 manual 下反复写无意义的记录（台账由 evaluateGate 写）。
 */
async function onTick(flat) {
  const api = requireApi(flat)
  const at = Number.isFinite(flat && flat.at) ? flat.at : null
  const records = api.services.get('vmu.records')
  let human = null
  try { human = api.services.get('vmu.human') } catch { human = null }
  const s = stateFor(records)
  s.ticks += 1
  const mode = normaliseGateMode(api.setting('vmu.v3.mode'))
  const before = listGates({ records, status: 'pending' })
  let released = null
  if (mode.mode === 'auto' && before.pending.length > 0) {
    released = await releaseAllGates({ records, human, at, by: 'v3-gates tick' })
  }
  const after = listGates({ records, status: 'pending' })
  const out = {
    ok: true, at,
    mode: mode.mode,
    declaredMode: mode.declared,
    modeKnown: mode.known !== false,
    pendingBefore: before.pending.length,
    pendingAfter: after.pending.length,
    released,
    note: mode.mode === 'manual'
      ? 'mode=manual: pending gates wait for a human; this tick released nothing'
      : (released === null ? 'mode=auto: no pending gate to release' : 'mode=auto: every pending gate was resolved (released or failed, never left pending)'),
  }
  s.lastTick = out
  return out
}

export const V3_GATES_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-gates', apiVersion: 1 }),
  // trigger-workflow：解锁 api.services（读 vmu.records / vmu.human）。本模块不发任何 bus decision。
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({ [V3_TICK_TOPIC]: onTick }),
})

export default V3_GATES_MODULE
