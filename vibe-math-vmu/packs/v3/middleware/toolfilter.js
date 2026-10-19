/**
 * packs/v3/middleware/toolfilter.js — PHASE 6 / **P1-7（工具过滤）**。
 *
 * v3 让成员自己挑工具，本复刻把过滤放在宿主真正消费的决策点 **`tools/pre-execute`**（host-hooks 把它映射成
 * 宿主的 `{kind:'deny'}`；`rewriteArgs` 在该钩子上被**具名拒为 unsupported** —— 所以本模块**只用 deny**，
 * 绝不试图改写入参）。
 *
 * 判据（全部来自**宿主实际注册名**：宿主的 pre-execute 载荷里 `tool` 就是 `dsh-tool-pwsh`／`web_search`
 * 这类真实名字，不是 v3 的 `vibe_math_*` 旧名）：
 *   · `vmu.v3.toolDeny`  非空 且命中 ⇒ 具名拒 `VMU_PACK_V3_TOOL_NOT_PERMITTED`；
 *   · `vmu.v3.toolAllow` 非空 且未命中 ⇒ 同一具名拒（allow 是白名单，不是建议）；
 *   · **载荷里没有可解析的工具名**（拿不到注册名/调用面）⇒ **fail-closed 具名拒**
 *     `VMU_PACK_V3_TOOL_UNRESOLVED`（绝不默认放行）；
 *   · 两张名单都为空 ⇒ **零策略**（不拦截；这正是“没有声明就没有机制”）。
 *
 * ★ **绝不“过滤失败后无过滤重试”**：本模块是纯判定，没有重试路径、不调用任何工具、也不缓存“放行”。
 *   `v3ToolFilterStatus().retries` 恒为 0，`denied` 是终态；拒绝就是终态，交给宿主/呼叫方，不存在第二次放行。
 */
const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

export const TOOL_FILTER_CODE = Object.freeze({
  denied: 'VMU_PACK_V3_TOOL_NOT_PERMITTED',
  unresolved: 'VMU_PACK_V3_TOOL_UNRESOLVED',
})

const STATE = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = STATE.get(records)
  if (!s) { s = { calls: 0, allowed: 0, denied: 0, unresolved: 0, lastDecision: null }; STATE.set(records, s) }
  lastState = s
  return s
}

export function v3ToolFilterStatus() {
  const s = lastState
  return {
    calls: s ? s.calls : 0,
    allowed: s ? s.allowed : 0,
    denied: s ? s.denied : 0,
    unresolved: s ? s.unresolved : 0,
    // 结构事实：本模块没有重试路径（见文件头）。一个拒绝绝不被“无过滤重试”绕过。
    retries: 0,
    lastDecision: s && s.lastDecision ? JSON.parse(JSON.stringify(s.lastDecision)) : null,
    note: 'diagnostics only: a denial is terminal; this module has no retry path and never re-dispatches unfiltered',
  }
}

/** 把名单归一化成去空字符串的数组；非数组 ⇒ 空（零策略）。 */
export function toolList(value) {
  if (!Array.isArray(value)) return []
  return value.map((x) => str(x).trim()).filter(Boolean)
}

/**
 * 纯判定：返回 `{allow:true}` 或 `{allow:false, code, message, hint}`。
 * 三张名单的语义与上面的文件头一一对应；`tool` 是**宿主实际工具名**。
 */
export function filterTool({ tool = null, allow = null, deny = null } = {}) {
  const name = str(tool).trim().toLowerCase()
  const allowList = toolList(allow).map((x) => x.toLowerCase())
  const denyList = toolList(deny).map((x) => x.toLowerCase())
  if (allowList.length === 0 && denyList.length === 0) return { allow: true, zeroMechanism: true, tool: name || null }
  if (!name) {
    return {
      allow: false, code: TOOL_FILTER_CODE.unresolved, tool: null,
      message: 'tool filtering is declared, but this call carries no resolvable tool name',
      hint: 'the host must pass the ACTUAL registered tool name; without it the filter cannot decide, and a filter that cannot decide refuses (fail-closed)',
    }
  }
  if (denyList.includes(name)) {
    return {
      allow: false, code: TOOL_FILTER_CODE.denied, tool: name,
      message: 'tool ' + name + ' is on the deny list (vmu.v3.toolDeny)',
      hint: 'remove it from vmu.v3.toolDeny, or do not call it; this refusal is terminal (no unfiltered retry)',
    }
  }
  if (allowList.length > 0 && !allowList.includes(name)) {
    return {
      allow: false, code: TOOL_FILTER_CODE.denied, tool: name,
      message: 'tool ' + name + ' is not on the allow list (vmu.v3.toolAllow)',
      hint: 'the allow list is a WHITELIST: add ' + name + ' deliberately or choose an allowed tool; this refusal is terminal (no unfiltered retry)',
    }
  }
  return { allow: true, tool: name }
}

async function onPreExecute(flat) {
  const api = flat && flat.api
  if (!api || !api.services) throw new Error('v3 toolfilter: no api facade')
  // ★ The loader FLATTENS the bus envelope for modules (`kernel/loader.js`: `flat = {...envelope.payload}`), so the
  // real handler shape is `{ tool, args, agent, hook, api }` — NOT `{ payload: { tool } }`. Measured on a real DSH
  // host: reading `flat.payload` only made EVERY call carry `tool: null` ⇒ fail-closed denied every tool. Accept the
  // flat shape first and keep the nested one as a compatibility fallback (a module invoked by an older caller).
  const nested = isObject(flat.payload) ? flat.payload : {}
  const rawTool = flat.tool !== undefined ? flat.tool : nested.tool
  const tool = rawTool === undefined ? null : rawTool
  const allow = typeof api.setting === 'function' ? api.setting('vmu.v3.toolAllow') : null
  const deny = typeof api.setting === 'function' ? api.setting('vmu.v3.toolDeny') : null
  const decision = filterTool({ tool, allow, deny })
  // Counters hang off the records service when one is reachable; the filter must not require persistence to decide.
  let records = null
  try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.records')) records = api.services.get('vmu.records') } catch { records = null }
  const st = records ? stateFor(records) : null
  if (st) {
    st.calls += 1
    if (decision.allow) st.allowed += 1
    else if (decision.code === TOOL_FILTER_CODE.unresolved) st.unresolved += 1
    else st.denied += 1
    st.lastDecision = decision
  }
  if (decision.allow) return undefined
  return { deny: { code: decision.code, message: decision.message, hint: decision.hint, by: 'v3-toolfilter' } }
}

export const V3_TOOLFILTER_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-toolfilter', apiVersion: 1 }),
  // `deny` is the ONLY decision this module produces (rewriteArgs is refused as unsupported on pre-execute).
  capabilities: Object.freeze(['deny']),
  hooks: Object.freeze({ 'tools/pre-execute': onPreExecute }),
})

export default V3_TOOLFILTER_MODULE
