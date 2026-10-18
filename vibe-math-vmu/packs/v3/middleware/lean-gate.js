/**
 * packs/v3/middleware/lean-gate.js — PHASE 6 / **P1-8（Lean 三档 off／encourage／require ＋ 裁定门）**。
 *
 * 三档来自**已登记**的 `vmu.math.formalVerify`（enum off|encourage|require，默认 off）。它是 H2（重启级热类），
 * Lean 面在**构造期**读它（`kernel/lean.js:166`）——所以本模块**不接受“同一个内核里改档”**的假设：测试必须分别
 * 构造内核。模块自己每次调用现读设置，只是为了让“当前装配是哪一档”可观测；运行期改值的语义仍以 H2 为准。
 *
 * ★ 裁定门挂在 **`ballot/tally`**（vmu 已登记的 **blockable** 钩子，`kernel/bus.js:133`），理由：
 *   v3 的 require 检查就在 `settleVerdict`（`:4269-4368`）里、发生在裁决**算出来之后、落库之前**；
 *   vmu 侧与它同层的是票箱的 tally 事件（v3-core 的 verifier-quorum 也已经挂在这里），而 `settle/before`
 *   的 producer 是 `kernel/tasks.js`（任务阶段推进），不是裁决路径。用 tally 钩子 ⇒ 阻断发生在**该轮票箱
 *   被收口**时，裁决卡不会写；对象仍在原来的轨上（留档），不是消失。
 *
 * ★ 证据（passed / blocked）落在 `journal` 轨（kind=state，标题前缀 `v3-formal｜<target>`）。不新增轨：
 *   形式化证据是“过程事实”，journal 正是它的既有归属；off 档不写任何证据 ⇒ **formal 投影为空**（本模块的
 *   `leanEvidence()` 与提示词里的 Lean 段都为“无”）。
 *
 * ★ 提示词：`v3-verifier-lean` 段唯一承载 Lean 字样；`V3_LEAN_PROMPT_POLICY` 在 off 档把它 enabled:false，
 *   于是 off 档的提示词里**没有任何 Lean 字样**（其他 v3 段不含该词，测试逐段扫描）。
 */
import { proofVerdict } from './defects.js'

export const LEAN_MODES = Object.freeze(['off', 'encourage', 'require'])
export const LEAN_SECTION = 'v3-verifier-lean'
export const LEAN_EVIDENCE_PREFIX = 'v3-formal｜'
export const LEAN_GATE_CODE = 'VMU_PACK_V3_LEAN_REQUIRED'

const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** 读档位；未知值 ⇒ off（声明默认，且是“零策略”一侧）。 */
export function leanModeOf(value) {
  const v = str(value)
  return LEAN_MODES.includes(v) ? v : 'off'
}

const LEAK = /Lean|lean|形式化/
/** v3 的提示词段里唯一允许出现 Lean 字样的段名（测试以此证明 off 档是零 Lean 字样）。 */
export function leanBearingSections(sections) {
  return (Array.isArray(sections) ? sections : []).filter((s) => LEAK.test(str(s && s.text))).map((s) => str(s && s.name))
}

const STATE = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = STATE.get(records)
  if (!s) { s = { calls: 0, denials: 0, lastDecision: null }; STATE.set(records, s) }
  lastState = s
  return s
}

export function v3LeanGateStatus() {
  const s = lastState
  return {
    section: LEAN_SECTION,
    modes: LEAN_MODES.slice(),
    calls: s ? s.calls : 0,
    denials: s ? s.denials : 0,
    lastDecision: s && s.lastDecision ? JSON.parse(JSON.stringify(s.lastDecision)) : null,
    note: 'diagnostics only: the durable facts are formal evidence rows on the journal track',
  }
}

/** 把一条形式化证据写成 journal 记录（passed / blocked）。返回 `{ok, recordId, target, status}`；非法状态具名拒。 */
export function recordLeanEvidence({ records, target, status, at = null, by = 'v3-lean-gate', reason = null } = {}) {
  const id = str(target)
  if (!id) throw new Error('recordLeanEvidence needs a target')
  const st = str(status)
  if (st !== 'passed' && st !== 'blocked') throw new Error('formal evidence status must be passed|blocked (got ' + (st || '(empty)') + ')')
  const body = [
    '- target: ' + id,
    '- status: ' + st,
    '- at: ' + (Number.isFinite(at) ? at : 'unknown'),
    '- reason: ' + str(reason),
  ].join('\n')
  const rec = records.put({ track: 'journal', kind: 'state', title: LEAN_EVIDENCE_PREFIX + id, body, settled: true, by })
  return { ok: true, recordId: rec && rec.id ? rec.id : null, target: id, status: st }
}

/** 读某对象的**最近一条**形式化证据（passed/blocked）；没有 ⇒ null。坏记录跳过并计数。 */
export function leanEvidence({ records, target = null, fidelity = null } = {}) {
  const id = str(target)
  // ★ P1-9 共同真源：fidelity 标记优先（唯一写者）；再兼容旧 journal 标记；撤回后这里**不再**返回 passed。
  const verdict = proofVerdict({ records, target: id, fidelity })
  if (verdict.state === 'withdrawn') {
    return { ok: true, target: id || null, evidence: null, status: 'withdrawn', withdrawn: true, bad: 0 }
  }
  const list = records.list({ track: 'journal', limit: 0 }).items
  let best = null
  let bad = 0
  for (const head of list) {
    const title = str(head.title)
    if (!title.startsWith(LEAN_EVIDENCE_PREFIX)) continue
    const rec = records.get({ id: head.id })
    const mTarget = /- target:\s*(.+)/.exec(rec.body)
    const mStatus = /- status:\s*(passed|blocked)/.exec(rec.body)
    if (!mTarget || !mStatus) { bad += 1; continue }
    if (mTarget[1].trim() !== id) continue
    const row = { target: id, status: mStatus[1], recordId: head.id, updatedAt: head.updatedAt || 0 }
    if (best === null || row.updatedAt >= best.updatedAt) best = row
  }
  return { ok: true, target: id || null, evidence: best, status: best ? best.status : null, bad }
}

/**
 * 纯判定：三档语义。
 * off / encourage ⇒ `{allow:true}`（**不阻断**；off 甚至不要求证据存在）；
 * require ⇒ 只有 `passed` 放行；`blocked` 或**无证据** ⇒ `{allow:false, code, message, hint}`（fail-closed）。
 */
export function leanGateDecision({ mode = 'off', target = null, evidence = null } = {}) {
  const m = leanModeOf(mode)
  if (m !== 'require') return { ok: true, allow: true, mode: m, target: str(target), code: null }
  const st = evidence && evidence.status ? str(evidence.status) : null
  if (st === 'passed') return { ok: true, allow: true, mode: m, target: str(target), code: null, evidence }
  const why = st === 'blocked' ? 'the latest formal evidence is **blocked**' : 'there is no formal evidence for this object at all'
  return {
    ok: false, allow: false, mode: m, target: str(target), code: LEAN_GATE_CODE,
    message: 'formalVerify=require: ' + why + ' ⇒ the verdict is NOT counted (the object stays on its track; nothing is settled)',
    hint: 'run Lean for ' + str(target) + ' and record passed/blocked evidence (journal track, title ' + LEAN_EVIDENCE_PREFIX + '<target>), or switch vmu.math.formalVerify back to encourage/off deliberately (H2: restart-level)',
  }
}

async function onBallotTally(flat) {
  const api = flat && flat.api
  if (!api || !api.services) throw new Error('v3 lean-gate: no api facade')
  const records = api.services.get('vmu.records')
  const st = stateFor(records)
  const mode = leanModeOf(api.setting('vmu.math.formalVerify'))
  if (mode !== 'require') return undefined
  const payload = isObject(flat.payload) ? flat.payload : {}
  const target = str(payload.target)
  if (!target) return { deny: { code: LEAN_GATE_CODE, message: 'formalVerify=require: the tally carries no target, so the gate can never find evidence', hint: 'the ballot payload must name the object being tallied' } }
  const evidence = leanEvidence({ records, target })
  const decision = leanGateDecision({ mode, target, evidence: evidence.evidence })
  st.calls += 1
  st.lastDecision = decision
  if (decision.allow) return undefined
  st.denials += 1
  return { deny: { code: decision.code, message: decision.message, hint: decision.hint } }
}

/**
 * Prompt 策略：三档里**只有 off 关闭** Lean 段；encourage / require 都打开（require 的“阻断”在裁定门，不在提示词）。
 * 返回 `{decisions:[{name,enabled}], errors:[]}`（`composePromptPolicies` 的形状）。
 */
export function leanPromptPolicy({ settings = {} } = {}) {
  const mode = leanModeOf(settings && settings['vmu.math.formalVerify'])
  return { decisions: [{ name: LEAN_SECTION, enabled: mode !== 'off' }], errors: [], mode }
}

export const V3_LEAN_PROMPT_POLICY = Object.freeze({ id: 'v3-lean-policy', apply: leanPromptPolicy })

export const V3_LEAN_GATE_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-lean-gate', apiVersion: 1 }),
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({ 'ballot/tally': onBallotTally }),
})

export default V3_LEAN_GATE_MODULE
