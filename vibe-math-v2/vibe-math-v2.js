// Vibe Math V2 — host plugin implementing the classic-architecture spec
// ("vibe-math-v2/实现方案.md"): probability-driven scheduling over a
// problem list (qs/qs.json) and a proposition knowledge base (Propos/),
// multi-agent independent review → debate → consensus verification, with
// checkpoint resume, manual intervention, and file/push progress reporting.
//
// Preset-local plugin, import-free (only node builtins reachable). Registers
// vibe_math_* tools, a /vibe slash command, and a background scheduler;
// provides NO service, so it sits loose in the preset.
//
// Data layout (per project, under <workspace>/VibeMath/Projects/<project>/):
//   qs/qs.json                 — problems (概述/已解决/解法列表/优先级/progress)
//   Propos/<分类>_Propos.json   — propositions (概述/布尔估计/细类型/证明·证伪列表/优先级/价值·关键性/progress)
//   Reliable/                  — read-only trusted references (user drops files)
//   Verified/                  — resolved facts index (布尔估计=0/1 的命题、已解决问题)
//   Verification_logs/         — debate transcripts per verification run
//   Progress_Logs/report.json  — periodic progress report
//   VibeMath_State/            — scheduler private state (checkpoint/resume)
export const name = 'vibe-math-v2'
export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands']
// Lean 增量/异步（规格：docs/formal-verification.md §1）：内容哈希用于归档去重与作业幂等。
// `node:crypto` 与 v4/v5 同一写法（只读的内置模块，不执行任何动态代码）。
import { createHash } from 'node:crypto'
// 数学计算工具（共享模块，四套字节一致；由 integration owner 维护，本文件只做接线）。
// 模块内部自己 import './math-engines.js'，接线方不直接引用引擎表。
import {
  registerMathComputation,
  MATH_PARAM_NAMES,
  MATH_PARAM_DEFAULTS,
  MATH_TOOL_DESCRIPTION,
  MATH_TOOL_SCHEMA,
  MATH_ARCHIVE_WORKFLOW_LINE,
  MATH_PERSONA_TOOL_LINE,
  MATH_RULE_LINES,
  normalizeMathParams,
  mathAvailabilityLine,
  probeMathEngines,
} from './math-computation.js'

// Standing mount: DSH mounts each agent preset ONCE per preset and joins every
// session that names it to that SAME plugin instance (see @deepseek-ai/dsh-agent-presets).
// This plugin must therefore isolate ALL per-session state itself, keyed by the
// root agent (session) id — otherwise two sessions running the preset at the same
// time (e.g. project A and project B) would share one rootAgent/scheduler/registry
// and spawn children under the wrong parent session. Each session gets its own
// Session instance below via makeSession(rootAgent, sessionId).
export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  // Optional services are resolved LAZILY at call time, never snapshotted in apply().
  // A snapshot taken here is order-sensitive: if the service has not been provided yet
  // when this preset subtree mounts, it stays undefined for the whole session, so
  // `runShell` would report 'no-subprocess' forever and every mkdir would silently do
  // nothing (masked only by fs.writeText creating parents automatically).
  const subprocessOf = () => { try { return ctx.get('subprocess') } catch (e) { return undefined } }
  const sandboxPolicyOf = () => { try { return ctx.get('sandboxPolicy') } catch (e) { return undefined } }

  // ================= per-session registry =================
  const sessions = new Map() // rootAgentId -> Session
  const childOwner = new Map() // childId -> rootAgentId (route subagent/end back to its session)
  // childOwner 的**有界化**（审计 H6）。一条 childId→rootAgentId 的映射只在"这个 child 还可能再发
  // subagent/end"时有价值；子代理结束后它就是垃圾，而这里以前明确说"不要回收"（为了修 verdict 收口），
  // 代价是每个历史子代理永久留下一条记录、进程生命周期内无界增长。现在改为**引用 + 宽限期**：
  //   · 仍被某个任务（t.children）或 agentRegistry 引用的一律保留；
  //   · 没有引用、且距最近一次 subagent/end 已超过宽限期，才回收。
  // 宽限期是必需的：辩论/续轮会在**同一个 child** 上再次 end（这正是当初"结束后立即删"导致
  // 'problem solved after verdict 1' 失败的原因），所以不能只看"当前是否有引用"。
  const CHILD_OWNER_GRACE_MS = 5 * 60 * 1000
  const lastChildEndAt = new Map() // childId -> 最近一次 subagent/end 的时间
  function pruneChildOwner() {
    const keep = new Set()
    for (const s of sessions.values()) {
      try { for (const id of s.referencedChildIds()) keep.add(id) } catch (e) { /* 尽力而为 */ }
    }
    const cutoff = now() - CHILD_OWNER_GRACE_MS
    for (const cid of Array.from(childOwner.keys())) {
      if (keep.has(cid)) continue
      const ended = lastChildEndAt.get(cid)
      if (ended === undefined || ended > cutoff) continue
      childOwner.delete(cid); lastChildEndAt.delete(cid)
    }
  }
  // sessions 的**有界化**（审计 L18）。`sessions` 按 root agent id 记；正常路径下 DSH 的每个根会话
  // 各一条，但 `getSession` 对**任何** agent 都会建一条，包括 `rootOf` 向上走失败（父代理已不在注册表里）
  // 的子代理——那种会话永远没人再访问，却会带着 `running=true` 一直被 apply 级的 tick 循环唤醒。
  // `agents.roots()`（契约：全部 live 顶层 agent）是权威判据：root 不再是顶层 live agent ⇒ 该会话是僵尸。
  // 三重保守：主机没有 roots() / 它抛错 / 它返回空数组 ⇒ **一律不裁剪**（空 = 没有可用信息，而不是
  // "一个会话都没有"）；仍在册子代理的会话也保留。因此测试 mock（roots() 恒返回 []）与旧宿主行为不变。
  function pruneSessions() {
    if (sessions.size === 0) return
    if (typeof agents.roots !== 'function') return
    let roots = []
    try { roots = agents.roots() || [] } catch (e) { return }
    if (!Array.isArray(roots) || roots.length === 0) return
    const live = new Set()
    for (let i = 0; i < roots.length; i++) { const id = sessionIdOf(roots[i]); if (id !== undefined) live.add(id) }
    if (live.size === 0) return
    for (const sid of Array.from(sessions.keys())) {
      if (live.has(sid)) continue
      const s = sessions.get(sid)
      try { if (s && s.referencedChildIds().length > 0) continue } catch (e) { continue }
      sessions.delete(sid)
    }
  }
  // Process epoch: PROCESS-level (one per apply, shared by every session), written to
  // VibeMath_State/process_epoch.json at init; a DIFFERENT persisted epoch means a
  // previous DSH process wrote this state (in-flight children are gone), while an
  // equal epoch means same-process pause→resume (children may still be alive).
  // Kept at apply level (not per-session) to match the 0.3.17 semantics: two sessions
  // in the same process must never treat each other as a stale previous process.
  const processEpoch = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)

  function sessionIdOf(agent) { try { return (agent && agent.id) ? String(agent.id) : undefined } catch (e) { return undefined } }
  // Walk up the durable session lineage to the top-level (root) agent of this session,
  // so calls from a child agent (which inherits this preset) still route to its session.
  function rootOf(agent) {
    try {
      let cur = agent
      const seen = new Set()
      while (cur) {
        const id = cur.id
        if (seen.has(id)) return cur
        seen.add(id)
        const parentId = (cur.session && cur.session.header) ? cur.session.header.parentSession : undefined
        if (parentId === undefined) return cur
        const parent = agents.get(parentId)
        if (!parent) return cur
        cur = parent
      }
    } catch (e) { /* fall through */ }
    return agent
  }
  function getSession(agent) {
    const root = rootOf(agent)
    const sid = sessionIdOf(root)
    if (sid === undefined) return undefined
    let s = sessions.get(sid)
    if (!s) { s = makeSession(root, sid); sessions.set(sid, s) }
    return s
  }

  // ================= per-session plugin body =================
  function makeSession(rootAgent, sessionId) {
  let currentProject = 'default'
  const DEFAULT_PARAMS = {
    mode: 'auto',                 // auto | manual
    maxParallelThreshold: 4,      // concurrency gate: active turns < this
    solverMaxRounds: 3,           // per-direction iteration cap (spec example)
    directionsPerSolver: 1,       // 每个 solver 提示词附带的方向数量（1 = 只看自己方向）
    verifierCount: 3,             // independent reviewers per verification
    debateMaxRounds: 5,           // debate round cap (spec example)
    verdictMode: 'flat',          // flat = 均衡机制（不一致时取各评审自报概率的均值）| forced = 强制裁决（按验证者历史准确率+布尔票置信度加权）
    provider: '',
    model: '',
    solverPersona: '',
    verifierPersona: '',
    explorerPersona: '',          // 注入每个 explorer/rederive 提示词开头的人格/要求
    knowledgeContext: '',         // 共享知识/数据模型说明（空 = 使用内置完整版；非空 = 覆盖）
    solverToolAllow: [],
    solverToolDeny: [],
    verifierToolAllow: [],
    verifierToolDeny: [],
    solverAllowNetwork: '',       // '' = 继承全部；true = 允许网络工具；false = 禁止
    verifierAllowNetwork: '',
    solverAllowScripts: '',       // '' = 继承全部；true = 允许脚本工具；false = 禁止
    verifierAllowScripts: '',
    solverMaxToolCalls: 0,
    verifierMaxToolCalls: 0,
    reportIntervalMs: 0,          // 0 = 仅事件驱动（有代理状态更新等事件才写/推报告）；>0 = 定时自动汇报（毫秒）
    reportMode: 'file',           // file | push | both
    promoteValueThreshold: 0.7,   // Propos → qs auto-promotion threshold (价值/关键性)
    priorityAdjust: 'none',       // none | deadend-deprioritize | survival-map
    proposPriorityAdjust: 'none', // none | progress-graded（按定论接近度+证明/证伪材料量动态调命题优先级）
    tickIntervalMs: 2000,         // 调度器心跳间隔（毫秒）
    activityLogCap: 100,          // 活动日志保留条数（status/report 的 recentActivity 最多显示 ACTIVITY_REPORT_MAX = 30 条）
    maxExplorerRetries: 3,        // explorer 重派生上限（拆方向失败重试次数）
    // ---- Lean 形式化验证（契约：docs/formal-verification.md §1，四架构同名同语义）----
    formalVerify: 'off',          // off = 无任何额外要求（真无操作）| encourage = 鼓励但不强制 | require = 强制 + 定论门禁
    leanCommand: 'lean',          // 要执行的 Lean 可执行文件（例：'lake'）
    leanArgs: [],                 // 插在文件名之前的附加参数（例：['env','lean'] 配合 leanCommand='lake'）
    leanTimeoutMs: 120000,        // 单次 Lean 运行的超时上限（毫秒）
    leanAsync: true,              // true = Lean 编译走后台队列（入队即返回）| false = 同步 await（今天的语义）
    leanJobsMaxParallel: 1,       // 后台编译并发上限（默认 1 = 串行；可调大以并行编译）
    leanInitiative: 'normal',     // 日常流程中的形式化主动性：off | normal | eager（与 formalVerify 的"验证要求强度"是两件事）
    leanSearchPaths: [],          // 额外搜索路径（默认空 = 只用自动注入的 VibeMath 根）；非空时先注入它们、再注入自动根
    // ---- 最终论文（规格：docs/final-paper.md；v2/v3 为单作者变体）----
    finalPaper: true,             // 收口时是否自动撰写最终论文（false 只关自动触发；/vibe paper 仍可用）
    paperFormat: 'both',          // both = md + tex | md = 只写 markdown | tex = 只写 latex
    paperLanguage: 'zh',          // zh = 中文（ctexart/xelatex 优先）| en = 英文（article/pdflatex 优先）
    paperCompilePdf: true,        // 检测到 LaTeX 时是否编译 paper.pdf
    paperLatexCommand: '',        // 指定 LaTeX 引擎（空 = 按语言探测 xelatex/latexmk/pdflatex/lualatex/tectonic）
    // ---- 数学计算 math_computation（规格：docs/math-computation.md；六参数已冻结，拼写不得改）----
    // 值取共享模块的 MATH_PARAM_DEFAULTS（四套逐字一致）；数组必须**拷贝**，否则四套会共享同一个默认数组。
    mathComputation: MATH_PARAM_DEFAULTS.mathComputation,   // off | auto | on（auto = 探测到任一允许引擎才工作）
    mathMode: MATH_PARAM_DEFAULTS.mathMode,                 // typed | typed+shell（后者才允许提示词里的 shell 兜底段）
    mathEngines: MATH_PARAM_DEFAULTS.mathEngines.slice(),   // 允许的引擎（含 cli；cli 默认开启，受 mathMode/mathEngines 双闸）
    mathTimeoutMs: MATH_PARAM_DEFAULTS.mathTimeoutMs,       // 单次计算超时上限（毫秒，下界 1000）
    mathPackages: MATH_PARAM_DEFAULTS.mathPackages.slice(), // 需要预检的包（缺包只报告 + 给安装计划）
    mathInstallScope: MATH_PARAM_DEFAULTS.mathInstallScope, // user | system（system 只对当次显式调用生效，永不记忆）
  }
  let params = Object.assign({}, DEFAULT_PARAMS)
  let scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null } // activeCount 由 activeCount() 从 agentRegistry 推导，不再作为字段
  let agentRegistry = {}
  let decisionQueue = []
  let verifierAccuracy = {}       // 稳定身份键（'m:<provider>/<model>'）→ { correct, total }
  let pendingReviewScores = {}    // 对象 id → [{key,result}]：等对象**后来**取得布尔定论时才计分
  let tasks = {}                  // verify tasks keyed by 'verify:<rId>'
  let activityLog = []
  let lastReportWrite = 0
  let lastPushReport = 0
  let reportDirty = false
  let tickInFlight = false
  let lastTickAt = 0
  let explorerRetries = {}
  // 状态/报告里最近活动最多显示多少条（**一个常量**）：此前 buildReport 用 min(30, cap)、getStatus
  // 硬编码 min(10, cap)，同一个字段两个端点给出不同答案，而参数说明承诺的是 30（审计 M15）。
  const ACTIVITY_REPORT_MAX = 30
  // 至少 2 名独立评审才能出裁决（审计 M11）：一票裁决会把单个验证者的判断写成"完全验证"的布尔结论。
  const MIN_REVIEWERS = 2
  // 中段裁决（0<正确概率<1）的**重验冷却**（审计 M12）：中段值是"为真的概率"，不是定论，对象不能
  // 被永久搁置；但每个 tick 都重开一轮完整辩论会把调度器饿死（那正是当初加 `已验证` 单向闩锁的原因）。
  // 冷却期过后重新入选，所以没有任何对象会被永久停在中间概率上。
  const REVERIFY_COOLDOWN_MS = 5 * 60 * 1000
  function reverifyDue(x) { const at = Number(x && x.最近验证时间) || 0; return (now() - at) >= REVERIFY_COOLDOWN_MS }

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} const sp = sandboxPolicyOf(); if (sp && sp.workspaceRoot) return sp.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  let warnedNoPolicy = false
  function warnNoPolicyOnce() { if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v2: sandboxPolicy unavailable; writes go out with no explicit policy') } }
  // Sandbox fence for our own writes. The `resolve({})` fallback is a last resort and is
  // deliberately reported (once): with no session it resolves the policy's CONFIGURED root
  // (dsh-sandbox-policy: resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())),
  // which is not necessarily this session's workspace — a silently different fence.
  function getPolicy() { const sp = sandboxPolicyOf(); if (!sp) { warnNoPolicyOnce(); return undefined } try { if (rootAgent && rootAgent.session) return sp.resolve({ session: rootAgent.session }) } catch (e) { warnNoPolicyOnce() } try { const p = sp.resolve({}); if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v2: falling back to sandboxPolicy.resolve({}) — the fence root is the host-configured workspace, not necessarily this session cwd') } return p } catch (e) { warnNoPolicyOnce() } return undefined }
  function makeSignal(ms) { return AbortSignal.timeout(ms || 30000) }

  // ================= capability / tool-name lists =================
  // Tool names for the permission filter, taken from the names the host ACTUALLY
  // registers (dsh-tool-web registers 'web_search'/'web_fetch'; 'web'/'fetch' are
  // only presentation card/kind fields, not tool names), and split by platform
  // because each preset's composition gates them:
  //   dsh-tool-bash  disabled: process.platform === 'win32'
  //   dsh-tool-pwsh  disabled: process.platform !== 'win32'
  // dsh-tools' restrict() THROWS on any name outside its registered set, and the
  // host applies the filter when establishing a continuable child
  // (dsh-subagent: childCtx.tools.restrict(...)), so a stale name meant the child
  // was never created at all.
  const IS_WINDOWS = process.platform === 'win32'
  const SCRIPT_TOOLS = IS_WINDOWS ? ['pwsh'] : ['bash']
  // 这两个名字是否真的存在取决于**本次组合**：v2 自己的 agent.cordis.yml 把 tool-web 行设成
  // fetch:false，于是 web_search 在、web_fetch 不在，而 filter 里只要有一个宿主不注册的名字，
  // restrict() 就整条拒绝 → 子代理先失败一次再走 sanitizeToolFilter 重试，日志还会谎称"你的配置过期"
  // （审计 M8/M9）。所以能力清单**向宿主的可见工具面查询**（tools.schemas，宿主自己在
  // dsh-tools/lib/index.js 里就是这么用的），查不到/不可信时才退回静态候选表。
  const NETWORK_TOOLS = ['web_search', 'web_fetch']
  /**
   * 本会话可见的工具名集合；null = 无法可信地确定（此时一律保留候选名，行为与改动前一致）。
   * 自校验：这张表必须包含本插件自己注册的工具，否则说明这个 scope 视图不是子代理真正看到的
   * 组合面（例如只返回全局层）——据它裁剪能力清单会**静默丢掉**用户要的工具，比多一次重试更糟。
   */
  function composedToolNames() {
    try {
      if (!tools || typeof tools.schemas !== 'function' || !rootAgent) return null
      const list = tools.schemas(rootAgent)
      if (!Array.isArray(list) || list.length === 0) return null
      const names = new Set()
      for (let i = 0; i < list.length; i++) { const n = list[i] && list[i].name; if (n) names.add(String(n)) }
      if (!names.has('vibe_math_status')) return null
      return names
    } catch (e) { return null }
  }
  /** 候选工具名 ∩ 本次组合真正注册的名字（不确定时原样返回候选）。 */
  function composedToolList(candidates) {
    const names = composedToolNames()
    if (!names) return candidates.slice()
    return candidates.filter(function (n) { return names.has(n) })
  }

  // ================= parameter schema =================
  const PARAM_SCHEMA = [
    { name: 'mode', type: 'enum', options: ['auto', 'manual'], description: 'auto = 无人值守自动通过关键节点；manual = 关键节点挂起人工决策', suggestion: 'auto' },
    { name: 'maxParallelThreshold', type: 'integer', description: '全局最大并发子代理轮数（新派发前须满足 active < 阈值）', suggestion: 4 },
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数（agent_self_iteration 上限）', suggestion: 3 },
    { name: 'directionsPerSolver', type: 'integer', description: '每个 solver 提示词附带的其他活跃方向摘要数量：1 = 只看自己方向（互不干扰）；N>1 = 额外附带最多 N 个其他活跃方向摘要用于协调', suggestion: 1 },
    { name: 'verifierCount', type: 'integer', description: '每个验证对象的独立验证器数量（下限 2：一票不裁决）。并发预算紧张时单个对象同时最多占用 maxParallelThreshold-2 个槽位（至少 2），以保证另一个对象也凑得齐 2 票', suggestion: 3 },
    { name: 'debateMaxRounds', type: 'integer', description: '验证辩论（交流群）最大轮数', suggestion: 5 },
    { name: 'verdictMode', type: 'enum', options: ['flat', 'forced'], description: 'flat = 均衡机制（不一致时取各评审自报概率的**均值**，绝不折叠成固定的 0.5）；forced = 强制裁决（按验证者历史准确率+布尔票置信度加权）。准确率按 provider/model 这种稳定身份记，且只在对象**后来**取得布尔定论时才计分', suggestion: 'flat' },
    { name: 'provider', type: 'string', description: '子代理模型 provider（空 = 继承根代理）', suggestion: '' },
    { name: 'model', type: 'string', description: '子代理模型 id（空 = 继承根代理）', suggestion: '' },
    { name: 'solverPersona', type: 'string', description: '注入每个求解器提示词开头的人格/要求', suggestion: '' },
    { name: 'verifierPersona', type: 'string', description: '注入每个验证器提示词开头的人格/要求', suggestion: '' },
    { name: 'explorerPersona', type: 'string', description: '注入每个 explorer/重派生提示词开头的人格/要求', suggestion: '' },
    { name: 'knowledgeContext', type: 'string', description: '共享知识/数据模型说明（空 = 内置完整版；非空 = 覆盖，注入 explorer/solver/verifier 提示词）', suggestion: '' },
    { name: 'solverToolAllow', type: 'string[]', description: '求解器允许的工具名列表（空 = 继承全部工具）', suggestion: [] },
    { name: 'solverToolDeny', type: 'string[]', description: '求解器禁止的工具名列表', suggestion: [] },
    { name: 'verifierToolAllow', type: 'string[]', description: '验证器允许的工具名列表', suggestion: [] },
    { name: 'verifierToolDeny', type: 'string[]', description: '验证器禁止的工具名列表', suggestion: [] },
    { name: 'solverAllowNetwork', type: 'boolean', description: '求解器网络工具开关：空=继承全部；true=允许（在已有 allow 列表时补入本次组合真正注册的网络工具）；false=禁止网络工具', suggestion: '' },
    { name: 'verifierAllowNetwork', type: 'boolean', description: '验证器网络工具开关（同 solverAllowNetwork）', suggestion: '' },
    { name: 'solverAllowScripts', type: 'boolean', description: '求解器脚本工具开关：空=继承全部；true=允许（在已有 allow 列表时补入）；false=禁止 ' + SCRIPT_TOOLS.join('/'), suggestion: '' },
    { name: 'verifierAllowScripts', type: 'boolean', description: '验证器脚本工具开关（同 solverAllowScripts）', suggestion: '' },
    { name: 'solverMaxToolCalls', type: 'integer', description: '求解器每轮外部工具调用**建议**上限（0 = 不限）。框架只把它写进提示词，不计数、不强制', suggestion: 0 },
    { name: 'verifierMaxToolCalls', type: 'integer', description: '验证器每轮外部工具调用**建议**上限（0 = 不限）。框架只把它写进提示词，不计数、不强制', suggestion: 0 },
    { name: 'reportIntervalMs', type: 'integer', description: '进度汇报间隔（毫秒）：0 = 仅事件驱动（有代理状态更新等事件才写/推报告）；>0 = 同时按该间隔定时自动汇报', suggestion: 0 },
    { name: 'reportMode', type: 'enum', options: ['file', 'push', 'both'], description: 'file = 写报告文件；push = 推送消息让主代理主动汇报；both = 两者都做', suggestion: 'file' },
    { name: 'promoteValueThreshold', type: 'number', description: 'Propos 中「价值/关键性」≥ 该值且未决(0,1) 的命题自动加入 qs.json', suggestion: 0.7 },
    { name: 'priorityAdjust', type: 'enum', options: ['none', 'deadend-deprioritize', 'survival-map'], description: '优先级动态调整策略：none=不自动调；deadend-deprioritize=方向全死路时降优先级；survival-map=按最高方向存活率重算（存活率高越优先）', suggestion: 'none' },
    { name: 'proposPriorityAdjust', type: 'enum', options: ['none', 'progress-graded'], description: '命题优先级动态调整：none=不自动调；progress-graded=按「定论接近度（|布尔估计-0.5|）+ 证明/证伪材料量」重算，越接近定论越优先验证', suggestion: 'none' },
    { name: 'tickIntervalMs', type: 'integer', description: '调度器心跳间隔（毫秒）：多久扫描一次子代理状态并推进（越小越灵敏、越大越省资源）', suggestion: 2000 },
    { name: 'activityLogCap', type: 'integer', description: '活动日志保留条数（影响 status/report 里 recentActivity 的细节量，两者最多显示 ' + ACTIVITY_REPORT_MAX + ' 条）', suggestion: 100 },
    { name: 'maxExplorerRetries', type: 'integer', description: 'explorer 拆方向失败的重派生上限（达到后该问题标记为方向耗尽）', suggestion: 3 },
    { name: 'formalVerify', type: 'enum', options: ['off', 'encourage', 'require'], description: 'Lean 形式化验证档位：off=不额外要求（默认，提示词里不出现 Lean）；encourage=鼓励按实现难度自行形式化，一旦 Lean 通过则验证重点转为「忠实性审查」；require=同 encourage 且加门禁——对象的 formal.status 未达到 passed/blocked 前，真/假裁定记为未定论（原因 formal-required）并写入 Formal/TODO.md', suggestion: 'off' },
    { name: 'leanCommand', type: 'string', description: '要执行的 Lean 可执行文件（默认 lean；用 lake 时配合 leanArgs=["env","lean"]）', suggestion: 'lean' },
    { name: 'leanArgs', type: 'string[]', description: '插在 .lean 文件名之前的附加命令行参数（默认空）', suggestion: [] },
    { name: 'leanTimeoutMs', type: 'integer', description: '单次 Lean 运行的超时上限（毫秒，默认 120000，最小 1000）；异步档下它同时是**每个后台编译作业**的预算（到时主动 terminate，作业记 timeout、对象留在 attempted）', suggestion: 120000 },
    { name: 'leanAsync', type: 'boolean', description: 'Lean 编译模式：true（默认）= 后台队列，vibe_math_lean_run / vibe_math_lean_archive{run:true} 立即返回 async.jobId 入队，成员不阻塞，结果由下一轮提示的【形式化结果】行与 vibe_math_lean_lib / vibe_math_lean_job 公告（**只有作业落地为 ok 才会置 passed 并写归档证明**）；false = 完全同步 await（与旧行为逐字一致）', suggestion: true },
    { name: 'leanJobsMaxParallel', type: 'integer', description: '后台 Lean 编译的并发上限（默认 1 = 串行，保持可预测的资源占用；调大可并行编译多个作业）', suggestion: 1 },
    { name: 'leanInitiative', type: 'string', enum: LEAN_INITIATIVE_MODES.slice(), description: '日常流程中的形式化主动性：off（不主动，只在验证提示词按 formalVerify 的要求做）| normal（默认：顺手把有价值且可能复用的东西形式化）| eager（更主动：日常就主动把有价值的小引理/命题/定义形式化）。注意它与 formalVerify（验证时的要求强度：off|encourage|require）是**两件事**', suggestion: 'normal' },
    { name: 'leanSearchPaths', type: 'array', items: { type: 'string' }, description: '额外 Lean 搜索路径（默认空数组 = 只用框架自动注入的 VibeMath 根）。非空时按顺序先注入这里给的路径、再注入自动根（去重）；若 leanArgs 里已显式给了 --search-path/-R/--root，则完全尊重用户配置、不注入任何东西', suggestion: [] },
    { name: 'finalPaper', type: 'boolean', description: '收口（严格终止）时自动撰写最终论文：派遣一名专职「论文撰写」子代理，把已检验通过的命题/解法/成果整理成 Paper/<项目>/{paper.md,paper.tex,paper.meta.json,paper.log.md}。false = 只关自动触发，/vibe paper 手动命令仍可用', suggestion: true },
    { name: 'paperFormat', type: 'enum', options: ['both', 'md', 'tex'], description: '论文产出格式：both = markdown + latex；md = 只写 paper.md；tex = 只写 paper.tex（tex 才会尝试编译 pdf）', suggestion: 'both' },
    { name: 'paperLanguage', type: 'enum', options: ['zh', 'en'], description: '论文语言：zh = 中文（LaTeX 用 ctexart，引擎优先 xelatex）；en = 英文（article，引擎优先 pdflatex/latexmk）', suggestion: 'zh' },
    { name: 'paperCompilePdf', type: 'boolean', description: '检测到 LaTeX 时是否编译 paper.pdf（-interaction=nonstopmode 跑两遍；失败先尝试修复：换引擎/去不支持宏包/最小模板）。false 或无 LaTeX 时只保留 tex+md 并记日志', suggestion: true },
    { name: 'paperLatexCommand', type: 'string', description: '指定 LaTeX 引擎可执行文件（空 = 按语言探测：中文 xelatex > latexmk > pdflatex > lualatex > tectonic；英文 pdflatex 优先）。该命令解析不到时按"未检测到"降级（只留 tex+md）', suggestion: '' },
    // ---- 数学计算 math_computation（六参数冻结；描述与 prompts.md §1/§6 口径一致）----
    { name: 'mathComputation', type: 'enum', options: ['off', 'auto', 'on'], description: '数学计算总开关：off = 真无操作（提示词零提及）；auto = 探测到 mathEngines 里任一允许引擎才工作；on = 同上（探测失败时工具仍返回可执行的安装指引，而不是假装可用）', suggestion: 'auto' },
    { name: 'mathMode', type: 'enum', options: ['typed', 'typed+shell'], description: '计算策略：typed+shell（默认）= 工具不可用时允许宿主 shell 兜底，但结论必须标注"未经工具归档（shell 路径）"；typed = 只用工具路径（提示词里不出现 shell 兜底段，engine:"cli" 返回 REFUSED{reason:policy}）', suggestion: 'typed+shell' },
    { name: 'mathEngines', type: 'string[]', description: '允许的引擎列表（默认 python|r|octave|julia|matlab|maple|wolfram|cli）。cli 默认开启且走同一套超时/输出上限/回执；从列表里移除某引擎即禁用（商业引擎只探测+许可，永不安装）', suggestion: MATH_PARAM_DEFAULTS.mathEngines.slice() },
    { name: 'mathTimeoutMs', type: 'integer', description: '单次数学计算的超时上限（毫秒，默认 60000，最小 1000）；到时主动 terminate 并把回执标为 MATH_TIMEOUT', suggestion: 60000 },
    { name: 'mathPackages', type: 'string[]', description: '需要预检的包（默认空）。缺包只报告 + 给"用户自装指引"或"代理代装计划"，不会执行脚本，也永不自动安装', suggestion: [] },
    { name: 'mathInstallScope', type: 'string', enum: ['user', 'system'], description: '安装作用域：user（默认，用户级目录）；system 只对当次显式调用生效、永不记忆（不会写进状态文件）', suggestion: 'user' },
  ]

  // ================= fs =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeText(rel, content) { const t = await fsTarget(rel); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true }
  async function readJson(rel) { const t = await readText(rel); if (t === undefined || t === '') return undefined; try { return JSON.parse(t) } catch (e) { noteSuspect(rel); return undefined } }
  /**
   * Corruption guard. `readJson` cannot tell "no file yet" from "file present but
   * unparseable", yet callers treat both as "no data" and then write that emptiness
   * back — so one externally damaged file silently erased the user's whole problem
   * list (qs.json), proposition set, or verified set.
   *
   * Any read that hits a present-but-unparseable JSON file records it; `writeJson`
   * then REFUSES to write that path until the file is fixed or deleted. A missing
   * file is still created normally, so first-run and "user deleted the file"
   * behaviour is unchanged.
   */
  const suspectFiles = new Set()
  let warnedSuspect = {}
  function noteSuspect(rel) {
    suspectFiles.add(rel)
    if (warnedSuspect[rel]) return
    warnedSuspect[rel] = true
    console.error('vibe-math-v2: ' + rel + ' exists but is not parseable JSON — REFUSING to overwrite it so a corrupted file cannot silently erase your data. Fix or delete the file, then retry.')
  }
  function assertWritable(rel) {
    if (!suspectFiles.has(rel)) return true
    console.error('vibe-math-v2: write to ' + rel + ' blocked (file is unparseable; see the earlier warning)')
    return false
  }
  async function writeJson(rel, obj) { if (!assertWritable(rel)) return false; return await writeText(rel, JSON.stringify(obj, null, 2)) }
  async function listFiles(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'file' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function listDirsAt(base, rel) { try { const t = await fs.resolve(rel, { cwd: base }); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'directory' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function readTextAbs(path) { try { const t = await fs.resolve(path); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeTextAbs(path, content) { try { const t = await fs.resolve(path); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true } catch (e) { return false } }
  async function readCurrentProject() {
    // 按会话隔离的 current 文件（多会话并行时互不覆盖）；无则回退旧共享文件
    try { const t = await fs.resolve('current.' + safeId(sessionId) + '.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s !== undefined) { const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } } catch (e) {}
    try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s === undefined) return 'default'; const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } catch (e) { return 'default' }
  }
  async function writeCurrentProject() {
    try { const t = await fs.resolve('current.' + safeId(sessionId) + '.json', { cwd: vibeRoot() }); await fs.writeText(t, JSON.stringify({ project: currentProject }), undefined, undefined, getPolicy()) } catch (e) {}
  }

  // ================= subprocess =================
  function psQuote(p) { return "'" + String(p).replace(/'/g, "''") + "'" }
  /** POSIX 单引号引用：把 ' 换成 '\'' 以安全嵌入任意路径。 */
  function shQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'" }
  /**
   * 执行一段 shell 脚本。**按平台选择解释器**：此前硬编码 powershell，而预设用
   * `disabled: !!js process.platform !== 'win32'` 在非 Windows 上关掉了 tool-pwsh 行——
   * 即插件会调用一个自己声明不提供的二进制，且返回值无人检查，表现为静默失效。
   * Windows 用 powershell（保留原行为），其余平台用 /bin/sh。
   */
  function isWindows() { return process.platform === 'win32' }
  function mkdirCmd(paths) {
    if (isWindows()) return 'New-Item -Force -ItemType Directory -Path ' + paths.map(psQuote).join(',') + ' | Out-Null'
    return 'mkdir -p ' + paths.map(shQuote).join(' ')
  }
  function rmCmd(path) {
    if (isWindows()) return 'Remove-Item -Force -LiteralPath ' + psQuote(path) + ' -ErrorAction SilentlyContinue'
    return 'rm -f ' + shQuote(path)
  }
  /**
   * `subprocess.spawn` 的契约返回**句柄**（带 `done`），但桩宿主/测试替身常常写成 `async spawn(...)`
   * ——那样返回的是 Promise，`handle.done` 是 undefined，`await handle.done` 得到 undefined，随后
   * `outcome.exitCode` 抛 "Cannot read properties of undefined (reading 'exitCode')"，被 catch 成一条
   * 误导性的 "mkdir 失败"（实测：第二个会话建项目目录时刷出这条）。
   * 这里统一兼容一次：Promise 就先 await，句柄缺 `done` 才如实报错。
   */
  async function spawnHandle(subprocess, spec) {
    const raw = subprocess.spawn(spec)
    const handle = (raw && typeof raw.then === 'function') ? await raw : raw
    if (!handle || handle.done === undefined) throw new Error('subprocess.spawn returned no handle.done')
    return handle
  }
  async function runShell(script, cwd) {
    const subprocess = subprocessOf()
    if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }
    try {
      const argv = isWindows()
        ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', script]
        : ['/bin/sh', '-c', script]
      const handle = await spawnHandle(subprocess, { argv: argv, cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 })
      const outcome = await handle.done
      return { ok: !!outcome && outcome.exitCode === 0, exitCode: (outcome && outcome.exitCode !== undefined) ? outcome.exitCode : null }
    } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }
  /**
   * `runShell` 已经**明确告诉我们失败原因**（'no-subprocess' / spawn 异常 / 非零退出码），但它的
   * 返回值此前无人查看：没有 subprocess 服务的宿主上目录树根本不会建、归档证明的删除静默降级，而
   * 日志里一个字都没有——"mkdir 失败"和"mkdir 成功"完全无法区分（审计 H5）。
   * 这里把每个调用点的失败**如实记一次**（按 调用点+原因 去重，避免每 tick 刷屏）。
   */
  const shellWarned = {}
  function warnShellOnce(where, r) {
    const why = (r && (r.error || (r.exitCode === undefined ? undefined : ('exit code ' + r.exitCode)))) || 'unknown failure'
    const key = String(where) + '|' + why
    if (shellWarned[key]) return
    shellWarned[key] = true
    console.error('vibe-math-v2: ' + where + ' failed (' + why + ')')
  }
  // 目录布局（docs/formal-verification.md §3 / docs/math-computation.md §路径）：
  //   项目内：Formal/（对象形式化工作文件 + Index.md + TODO.md）、Verified/Lean/（归档证明）、
  //           Computation/（math_computation 的可复核回执：Computation/<runId>/ 与 Computation/installs/）
  //   全局（**不在项目内**，跨项目复用）：<VibeMath 根>/Formal/Lib/（可复用定义）、Formal/Proved/（已证引理）
  async function ensureDirs() {
    const base = frameworkRoot()
    const dirs = ['qs', 'Propos', 'Reliable', 'Verified', 'Verified/Lean', 'Verification_logs', 'Progress_Logs', 'VibeMath_State', 'Formal', 'Computation']
    const paths = [vibeRoot() + '/Projects', vibeRoot() + '/Formal/Lib', vibeRoot() + '/Formal/Proved'].concat(dirs.map(function (d) { return base + '/' + d }))
    const r = await runShell(mkdirCmd(paths))
    if (!r || !r.ok) warnShellOnce('ensureDirs (mkdir ' + base + ')', r)
    return r
  }
  async function removeFile(rel) {
    const base = frameworkRoot()
    const r = await runShell(rmCmd(base + '/' + rel))
    if (!r || !r.ok) warnShellOnce('removeFile(' + rel + ')', r)
    return r
  }

  // ================= 数学计算 math_computation：会话侧接线（共享模块，FREEZE §4/§5） =================
  // 探测量（是否装了 python/r/…）是异步的，而提示词是同步构造的 ⇒ 这里维护一个会话级缓存，
  // 在 init / 参数变化 / TTL 到期时刷新，提示词侧只读缓存现算（与 formalVerify 的动态纪律一致）。
  const MATH_PROBE_TTL_MS = 15 * 60 * 1000
  let mathProbe = null
  let mathProbeAt = 0
  /**
   * `host.spawn` 适配：模块只给 `{argv, cwd, timeoutMs, stdoutCap, stderrCap}`，超时/终止由**接线方**负责
   * （契约：超时必须 handle.terminate()）。返回**完整** stdout/stderr——模块自己落盘完整版，只在返回体裁 64KB，
   * 所以 stdio 上限要宽（默认 4MB），否则"超大输出"永远测不出完整落盘。
   */
  async function mathSpawn(spec) {
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') return null // 模块映射为 MATH_NO_SUBPROCESS
    const s = spec || {}
    const cap = Math.max(1000, Number(s.timeoutMs) || Number(params.mathTimeoutMs) || 60000)
    const outCap = Math.max(4096, Number(s.stdoutCap) || 4 * 1024 * 1024)
    const errCap = Math.max(4096, Number(s.stderrCap) || 4 * 1024 * 1024)
    const started = now()
    let handle
    try {
      handle = await spawnHandle(sub, {
        argv: s.argv,
        cwd: s.cwd || frameworkRoot(),
        stdio: { stdin: 'ignore', stdout: { maxBytes: outCap }, stderr: { maxBytes: errCap } },
        graceMs: cap,
      })
    } catch (e) { return null }
    let timedOut = false, killed = false, timer = null, outcome
    try {
      outcome = await Promise.race([
        handle.done,
        new Promise(function (resolve) {
          timer = setTimeout(function () {
            timedOut = true
            killed = true
            try { if (handle && typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* best effort */ }
            resolve({ exitCode: null })
          }, cap)
        }),
      ])
    } catch (e) { if (timer !== null) clearTimeout(timer); return null }
    if (timer !== null) clearTimeout(timer)
    let out = '', err = ''
    try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
    try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
    return {
      exit: (outcome && outcome.exitCode !== undefined) ? outcome.exitCode : null,
      timedOut: timedOut, killed: killed, ms: now() - started,
      stdout: String(out == null ? '' : out), stderr: String(err == null ? '' : err),
    }
  }
  /** host.exists：项目根相对路径是否存在。 */
  async function mathExists(rel) {
    try { const t = await fsTarget(rel); const s = await fs.stat(t); return s !== undefined } catch (e) { return false }
  }
  /** 会话级 host：参数是**活引用**（函数），回执里写 designator='vibe-math-v2'。 */
  const mathHost = {
    // 模块注册时只**交回** handler/description/parameters；真正的挂载是 mathTool 之后的**字面量**两行。
    // （会话层写 handlers 表、apply 层挂宿主工具面；两条路径名字/描述/schema 完全一致。）
    register: function (name, description, parameters, handler) { /* 挂载见 mathTool 之后的字面量两行 */ },
    params: function () { return params },
    projectRoot: function () { return frameworkRoot() },
    designator: 'vibe-math-v2',
    // 宿主明知没有 subprocess 服务时直接说 false ⇒ 模块立即返回 MATH_NO_SUBPROCESS（不再逐个探引擎）。
    hasSubprocess: function () { const sub = subprocessOf(); return !!(sub && typeof sub.spawn === 'function') },
    writeText: async function (rel, text) { return await writeText(rel, text) },
    readText: async function (rel) { return await readText(rel) },
    exists: mathExists,
    resolveExecutable: async function (cmd) {
      const sub = subprocessOf()
      if (sub === undefined || typeof sub.resolveExecutable !== 'function') throw new Error('no subprocess service')
      const p = await sub.resolveExecutable(String(cmd))
      if (typeof p !== 'string' || !p) throw new Error('not found: ' + String(cmd))
      return p
    },
    spawn: mathSpawn,
    log: function (kind, msg) { logActivity('math', String(kind) + ': ' + String(msg)) },
  }
  // 模块只调用一次 host.register(...)（FREEZE §4）⇒ 上面那个回调就是会话层注册。
  // 注意：真实注册必须等到 `const handlers = {}` 与 `function registerTool(...)` 就绪之后
  // （`handlers` 是 const，提前调用会撞 TDZ）⇒ 这里只留槽位，注册放在会话工具表旁。
  let mathTool = null
  /** 刷新探测缓存。`mathComputation:'off'` ⇒ 不探测、不缓存、不注入（真 no-op）。 */
  async function refreshMathProbe(force) {
    if (params.mathComputation === 'off') { mathProbe = null; mathProbeAt = 0; return null }
    if (!mathTool) return null
    try { mathProbe = await mathTool.probe(force ? { refresh: true } : undefined); mathProbeAt = now() } catch (e) { mathProbe = null }
    return mathProbe
  }
  /** 心跳里的 TTL 刷新（每拍一次布尔判断，成本可忽略）。 */
  function mathProbeDue() { return params.mathComputation !== 'off' && (!mathProbe || (now() - mathProbeAt) >= MATH_PROBE_TTL_MS) }
  /**
   * 每轮可用性行（中文）。由模块的 `mathAvailabilityLine(probe,'zh',mathMode)` 按档位拼装：
   * 只有 `typed+shell` 才含 shell 兜底句（`mathMode:'typed'` 天然不含，守卫据此断言）。
   * `off` 档返回空串——提示词零提及（对齐 formalVerify:'off' 的真 no-op 纪律）。
   */
  function mathWorkLine() {
    if (params.mathComputation === 'off') return ''
    if (!mathProbe) return '' // 还没探测过 ⇒ 不注入（不撒谎；init 会先探一次）
    return '\n' + mathAvailabilityLine(mathProbe, 'zh', params.mathMode) + '\n'
  }

  // ================= settings =================
  function sanitizeParams(obj) {
    const out = {}
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'directionsPerSolver', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs', 'tickIntervalMs', 'activityLogCap', 'maxExplorerRetries', 'leanTimeoutMs']
    const numFields = ['promoteValueThreshold']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny', 'leanArgs']
    // 整数字段的下界：0 会让对应功能**静默失效**而不是报错——例如 maxParallelThreshold=0 使所有派发
    // 闸门 (activeCount >= 0) 恒真，此后永不派发任何代理，而 status 仍显示 running:true；
    // solverMaxRounds=0 让每个方向立刻判死。这里把会让调度停滞/失能的键抬到最小可用值；
    // 未列出的键（如 activityLogCap / max*ToolCalls，取 0 表示不限）保持原样。
    const INT_FLOOR = {
      maxParallelThreshold: 1, solverMaxRounds: 1, verifierCount: 2, debateMaxRounds: 1,
      directionsPerSolver: 1, tickIntervalMs: 200, reportIntervalMs: 1000, maxExplorerRetries: 1,
    }
    // 数学计算六参数的显式强制（FREEZE §5.3）：交给共享模块的 normalizeMathParams，它按
    // enum/array/integer 逐键判型——`'false'`/字符串/错误枚举一律回退默认值，**绝不**落到
    // 下面 `else { out[k] = v }` 的尾巴（那会把任意字符串当合法值放行）。
    const mathNorm = normalizeMathParams(obj)
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
      if (MATH_PARAM_NAMES.indexOf(k) !== -1) { out[k] = Object.prototype.hasOwnProperty.call(mathNorm, k) ? mathNorm[k] : DEFAULT_PARAMS[k]; continue }
      if (intFields.indexOf(k) !== -1) {
        const n = Number(v)
        if (!Number.isFinite(n)) { out[k] = DEFAULT_PARAMS[k]; continue }
        let iv = Math.floor(n)
        const floor = INT_FLOOR[k]
        if (floor !== undefined && iv < floor) iv = floor
        out[k] = iv
      }
      else if (numFields.indexOf(k) !== -1) { const n = Number(v); out[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_PARAMS[k] }
      else if (arrayFields.indexOf(k) !== -1) { out[k] = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' }) : DEFAULT_PARAMS[k] }
      else if (k === 'mode') { out[k] = (v === 'manual' || v === 'auto') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'verdictMode') { out[k] = (v === 'flat' || v === 'forced') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'reportMode') { out[k] = (v === 'file' || v === 'push' || v === 'both') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'priorityAdjust') { out[k] = (v === 'none' || v === 'deadend-deprioritize' || v === 'survival-map') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'proposPriorityAdjust') { out[k] = (v === 'none' || v === 'progress-graded') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'solverAllowNetwork' || k === 'verifierAllowNetwork' || k === 'solverAllowScripts' || k === 'verifierAllowScripts') { out[k] = (v === true || v === false || v === '') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'finalPaper' || k === 'paperCompilePdf') { out[k] = (v === true || v === false) ? v : DEFAULT_PARAMS[k] }
      // leanAsync 必须**显式**归一化：`else { out[k] = v }` 会把字符串 'false' 当真理放行（spec §1.1）。
      else if (k === 'leanAsync') { out[k] = (v === true || v === false) ? v : DEFAULT_PARAMS[k] }
      else if (k === 'leanInitiative') { out[k] = LEAN_INITIATIVE_MODES.indexOf(v) !== -1 ? v : DEFAULT_PARAMS[k] }
      else if (k === 'leanJobsMaxParallel') {
        const n = Number(v)
        out[k] = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : DEFAULT_PARAMS[k]
      }
      // leanSearchPaths：显式数组分支（字符串/非数组一律回退默认空数组），并去掉空串与重复项。
      else if (k === 'leanSearchPaths') {
        if (!Array.isArray(v)) { out[k] = DEFAULT_PARAMS[k]; continue }
        const seen = {}
        out[k] = v.map(function (x) { return String(x == null ? '' : x).trim() }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true })
      }
      else if (k === 'paperFormat') { out[k] = (v === 'both' || v === 'md' || v === 'tex') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'paperLanguage') { out[k] = (v === 'zh' || v === 'en') ? v : DEFAULT_PARAMS[k] }
      else { out[k] = v }
    }
    // 非正的 leanTimeoutMs 会让每次 Lean 运行立即"超时"，而超时被记成"未通过"——静默失效。
    // 删除该键（回退默认），而不是抬到最小值，与 v5/v4 的既有处理一致。
    if (out.leanTimeoutMs !== undefined && !(out.leanTimeoutMs > 0)) delete out.leanTimeoutMs
    if (out.leanTimeoutMs !== undefined) out.leanTimeoutMs = Math.max(1000, out.leanTimeoutMs)
    // 空白的 paperLatexCommand 会让 resolveExecutable('') 直接失败；回退默认（自动探测）。
    if (out.paperLatexCommand !== undefined && !String(out.paperLatexCommand).trim()) out.paperLatexCommand = DEFAULT_PARAMS.paperLatexCommand
    // 未知档位一律回退 'off'（无操作），绝不回退到更强的档位：一个拼写错误若静默启用强制形式化，
    // 会让所有结论被门禁拦下。
    if (out.formalVerify !== undefined && ['off', 'encourage', 'require'].indexOf(String(out.formalVerify)) === -1) out.formalVerify = DEFAULT_PARAMS.formalVerify
    // 空白的 leanCommand 会让 resolveExecutable('') 直接失败；回退默认 'lean'。
    if (out.leanCommand !== undefined && !String(out.leanCommand).trim()) out.leanCommand = DEFAULT_PARAMS.leanCommand
    return out
  }
  async function loadSettings() {
    let text = await readText('vibe_math_setting.json')
    if (text === undefined) text = await readTextAbs(vibeRoot() + '/vibe_math_setting.json')
    if (text === undefined) return
    const clean = stripJsonComments(text)
    try {
      const obj = JSON.parse(clean)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) params = Object.assign({}, params, sanitizeParams(obj))
    } catch (e) {
      console.error('vibe-math-v2: invalid vibe_math_setting.json ignored: ' + String((e && e.message) || e))
    }
  }
  function settingsTemplateFrom(src) {
    const lines = []
    lines.push('{')
    lines.push('  // Vibe Math V2 默认参数配置（JSON with Comments，可加 // 注释）。')
    lines.push('  // 位置：<项目>/vibe_math_setting.json（全局回退：<工作区>/VibeMath/vibe_math_setting.json）。')
    lines.push('  // 本文件是参数的唯一持久化来源：vibe_math_set_params / set_mode 会立即写回此文件；全局文件仅作项目文件不存在时的回退默认。')
    const keys = Object.keys(src).sort()
    // 只输出有值的键。JSON.stringify(undefined) 返回 undefined（不是字符串），直接拼接会写出
    // `"k": undefined` —— 非法 JSON，本插件自己的 loadSettings() 随后会解析失败并整份忽略，
    // 用户的参数设置因此静默丢失。逗号也按"实际写出的条目"计算，否则跳过一个键会留下尾随逗号。
    const emitted = []
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = src[k]
      if (v === undefined) continue
      const schema = PARAM_SCHEMA.find(function (p) { return p.name === k })
      const desc = schema ? schema.description : ''
      emitted.push([k, v, desc])
    }
    for (let i = 0; i < emitted.length; i++) {
      const k = emitted[i][0], v = emitted[i][1], desc = emitted[i][2]
      const comma = i === emitted.length - 1 ? '' : ','
      lines.push('  // ' + k + (desc ? ' — ' + desc : ''))
      lines.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma)
    }
    lines.push('}')
    return lines.join('\n') + '\n'
  }
  function settingsTemplate() { return settingsTemplateFrom(params) }
  async function saveSettings() { await writeText('vibe_math_setting.json', settingsTemplate()); return { ok: true, path: frameworkRoot() + '/vibe_math_setting.json' } }
  async function createTemplate(where) { const isGlobal = where !== 'project'; const path = isGlobal ? (vibeRoot() + '/vibe_math_setting.json') : (frameworkRoot() + '/vibe_math_setting.json'); const content = settingsTemplateFrom(DEFAULT_PARAMS); const ok = isGlobal ? await writeTextAbs(path, content) : await writeText('vibe_math_setting.json', content); return { ok: ok, path: path, where: isGlobal ? 'global' : 'project' } }

  // ================= persistence =================
  /**
   * 并发计数**从 registry 推导**，不再独立维护/持久化。
   *
   * 此前 `scheduler.activeCount` 是手写的累加器：spawn +1、每次 followup 也 +1，只在
   * `onChildEnd` 里 -1，而 `onChildEnd` 开头 `if (meta === undefined) return` 会跳过那次减法。
   * 于是任何一次 `subagent/end` 丢失、或 end 到达时该 child 已不在 `agentRegistry`
   * （resume 清 registry、跨进程重启残留……）都会让 +1 永远没人抵消。计数单调增长，
   * 一旦 ≥ maxParallelThreshold，所有派发闸门（activeCount >= maxParallelThreshold）恒真，
   * 系统再也不派任何代理 —— 而 running 仍是 true、status 照常响应，故障完全静默。
   * 计数还会写进 scheduler_state.json，所以同进程 resume 会把这个坏值一路带下去。
   *
   * 从 registry 长度推导后，两者不可能不一致，"丢一次 end 就永久停摆"这一类故障从根上消失。
   */
  function activeCount() { return Object.keys(agentRegistry).length }
  /**
   * 只保留**稳定身份键**（'m:…'）的准确率记录：老版本按一次性的 childId 记的那份数据是自指的
   * （拿聚合值给同一批评审打分），既无意义又会随历史子代理数无界增长（审计 H4/M13）。
   */
  function sanitizeAccuracy(va) {
    const out = {}
    if (!va || typeof va !== 'object' || Array.isArray(va)) return out
    for (const k of Object.keys(va)) {
      if (k.indexOf('m:') !== 0) continue
      const rec = va[k]
      if (!rec || typeof rec !== 'object') continue
      const correct = Number(rec.correct); const total = Number(rec.total)
      if (!Number.isFinite(correct) || !Number.isFinite(total) || total < 0) continue
      out[k] = { correct: Math.max(0, correct), total: Math.max(0, total) }
    }
    return out
  }
  async function loadState() {
    const s = await readJson('VibeMath_State/scheduler_state.json')
    // 丢弃历史持久化的 activeCount：旧值可能已经漂移，绝不能覆盖推导值（见 activeCount()）。
    if (s) { const restored = Object.assign({}, s); delete restored.activeCount; scheduler = Object.assign({}, scheduler, restored) }
    const r = await readJson('VibeMath_State/agent_registry.json'); if (r) agentRegistry = r
    const dq = await readJson('VibeMath_State/decision_queue.json'); if (dq) decisionQueue = dq
    const va = await readJson('VibeMath_State/verifier_accuracy.json'); if (va) verifierAccuracy = sanitizeAccuracy(va)
    const tk = await readJson('VibeMath_State/tasks.json'); if (tk) tasks = tk
    const er = await readJson('VibeMath_State/explorer_retries.json'); if (er) explorerRetries = er
    // 形式化记录（docs/formal-verification.md §4）：v2 没有会话投影，这条状态必须自己持久化，
    // 否则一次 resume 就让 require 门禁失忆（已 passed 的对象被再当"未尝试"）。
    const fm = await readJson('VibeMath_State/formal.json')
    formalState = {
      records: (fm && fm.records && typeof fm.records === 'object' && !Array.isArray(fm.records)) ? fm.records : {},
      todo: (fm && Array.isArray(fm.todo)) ? fm.todo : [],
    }
  }
  async function saveAll() {
    await writeJson('VibeMath_State/scheduler_state.json', scheduler)
    await writeJson('VibeMath_State/agent_registry.json', agentRegistry)
    await writeJson('VibeMath_State/decision_queue.json', decisionQueue)
    await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy)
    await writeJson('VibeMath_State/tasks.json', tasks)
    await writeJson('VibeMath_State/explorer_retries.json', explorerRetries)
    await writeJson('VibeMath_State/formal.json', { records: formalRecords(), todo: formalTodo() })
    scheduler.lastCheckpoint = now()
  }
  // 查询类工具（status/setup/report）汇报前重读设置文件：文件是唯一持久化源，可能在会话启动后被用户手改或由本进程外编辑更新。
  async function refreshParams() {
    params = Object.assign({}, DEFAULT_PARAMS)
    await loadSettings()
    await migrateLegacyParams()
  }
  // 一次性迁移（单文件化）：旧版 VibeMath_State/params.json 中的运行时参数合并进 vibe_math_setting.json 后删除。
  async function migrateLegacyParams() {
    const legacy = await readJson('VibeMath_State/params.json')
    if (!legacy || Object.keys(legacy).length === 0) return
    try {
      params = Object.assign({}, params, sanitizeParams(legacy))
      await saveSettings()
      await writeJson('VibeMath_State/params.json', {}) // 一次性守卫：即使删除失败，空对象也不再覆盖设置文件
      await removeFile('VibeMath_State/params.json')
      logActivity('params', 'legacy params.json merged into vibe_math_setting.json and removed')
    } catch (e) { console.error('vibe-math-v2: params migration failed: ' + String((e && e.message) || e)) }
  }

  // ================= Lean 形式化验证（契约：docs/formal-verification.md）=================
  // 本节的要点不是"多一道工序"，而是**审查对象发生位移**：
  //   多代理共识回答"我们是否都相信它"，机器核对的 Lean 开发回答"它是否为真"，
  //   于是悬而未决的问题收缩为一件人（和代理）确实能审计的事：
  //     Lean 代码里的定义 / 对象 / 条件 / 假设 / 结论，是否与命题原文一致？
  // 所以一旦 Lean 通过，验证提示词不再要求重新推导，而是要求做**忠实性审查**。
  // `require` 档把这句话变成门禁：真/假裁定在对象既非 `passed` 也无显式 `blocked` 记录时
  // 不生效（记为未定论 + 形式化待办），——"按难度自行决定，但必须明说"。
  const FORMAL_MODES = ['off', 'encourage', 'require']
  // 模式是**动态**的：所有与档位相关的提示词文本都在构造提示词的那一刻现算（见 formalPromptBlock /
  // formalWorkLine），绝不写进任何"入职时冻结"的快照，否则切换档位后成员读到的仍是旧指令。
  function formalMode() { const m = String(params.formalVerify == null ? 'off' : params.formalVerify); return FORMAL_MODES.indexOf(m) !== -1 ? m : 'off' }
  function formalOn() { return formalMode() !== 'off' }
  // formal 记录：status/file/proof/decision/note/run/updatedAt（契约 §4）。
  // v2 没有会话投影，这些记录与「形式化待办」一起持久化在 v2 自己的状态文件里
  // （VibeMath_State/formal.json），以便 resume 后仍然可读——否则重启一次门禁就会失忆。
  let formalState = { records: {}, todo: [] }
  function formalRecords() { return (formalState && formalState.records) || {} }
  function formalTodo() { return (formalState && Array.isArray(formalState.todo)) ? formalState.todo : [] }
  function formalOf(target) { const r = formalRecords()[safeId(String(target || ''))]; return r || { status: 'none' } }
  async function saveFormal() { await writeJson('VibeMath_State/formal.json', { records: formalRecords(), todo: formalTodo() }) }
  // `passed` 只表示"形式化代码通过了内核检查"，而不是"命题为真"——忠实性仍需 m 票审查（契约 §11）。
  function formalGateOk(rec) { return !!rec && (rec.status === 'passed' || rec.status === 'blocked') }
  function formalRequired() { return formalMode() === 'require' }
  // 卡片/索引里的人类可读形式化状态。同样取合并后的记录（见 formalGateRecord）。
  function formalStatusLine(target) {
    const r = formalGateRecord(target)
    if (r.status === 'passed') return 'Lean 通过（' + (r.proof || r.file || '') + '）'
    if (r.status === 'blocked') return '阻塞（' + (r.note || '未说明') + '）'
    if (r.status === 'attempted') return '已尝试未通过'
    return '未尝试'
  }
  function tailText(s, n) { const t = String(s == null ? '' : s); return t.length > n ? t.slice(-n) : t }

  /**
   * 纯词法规范化绝对路径（折叠 '.'、'..' 与重复斜杠），**不访问文件系统**。
   * 单纯的 `startsWith(root)` 判断不够："…/VibeMath/Projects/../../../../etc/evil.lean"
   * 在字符串上仍以 root 开头，解析后却在 root 之外。
   */
  function normalizeAbsPath(p) {
    const parts = String(p == null ? '' : p).replace(/\\/g, '/').split('/')
    const out = []
    for (const seg of parts) {
      if (seg === '') { if (out.length === 0) out.push(''); continue }
      if (seg === '.') continue
      if (seg === '..') { if (out.length > 1) out.pop(); continue }
      out.push(seg)
    }
    return out.join('/')
  }
  /**
   * 把一个 Lean 路径解析成**可证明位于 VibeMath 根之内**的规范化绝对路径，否则 null。
   * 边界是 **VibeMath 根**而不是项目根：全局可复用库 <VibeMath>/Formal/{Lib,Proved} 有意
   * 放在项目树之外，所以"爬出项目但仍在 VibeMath 内"必须合法；而爬出 VibeMath 根之上、
   * 或一个不相干的绝对路径，一律拒绝。所有 Lean 文件访问（run / archive / read）都走这里。
   */
  function leanAbsPath(rel) {
    const raw = String(rel == null ? '' : rel).trim()
    if (!raw) return null
    const abs = (raw.charAt(0) === '/' || /^[a-z]:/i.test(raw)) ? raw : (frameworkRoot() + '/' + raw.replace(/^\.\//, ''))
    const norm = normalizeAbsPath(abs)
    const root = normalizeAbsPath(vibeRoot())
    if (norm !== root && norm.indexOf(root + '/') !== 0) return null
    return norm
  }
  // VibeMath 根相对路径 → 绝对路径。用于**全局**库（它不在当前项目树内）。
  function vibeAbs(rel) { return vibeRoot() + '/' + String(rel).replace(/^\.\//, '') }

  /**
   * 在一个 .lean 文件上执行工具链。**绝不向调度循环抛异常**：每一种失败模式
   * （无服务 / 无可执行文件 / spawn 失败 / 超时 / 非零退出）都变成可读结果。
   */
  async function leanRunFile(relPath, timeoutMs) {
    const rel = String(relPath || '').trim()
    if (!rel) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'file is required' }
    // 路径守卫：只允许执行 VibeMath 树内的文件，构造出来的路径不能让我们跑工作区之外的东西。
    const abs = leanAbsPath(rel)
    if (abs === null) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot() + '/ 之内（收到 ' + rel + '）' }
    if (!/\.lean$/.test(abs)) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '只有 .lean 文件可以执行' }
    if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V2_NOT_FOUND', message: 'no such file: ' + rel }
    return await leanExecFile(rel, abs, timeoutMs)
  }
  /**
   * 已解析路径的**实际执行**（同步档与后台作业共用同一段：argv 注入、超时 terminate、输出截断）。
   * 搜索路径注入（spec §3）：`[exe, ...用户 leanArgs, --search-path <VibeMath 根>, <file>]`；
   * 用户已显式给过 `--search-path`/`-R`/`--root` 就不再注入（显式覆盖优先）。
   */
  async function leanExecFile(rel, abs, timeoutMs, plan, onHandle) {
    const started = now()
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') {
      return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel, ms: 0 }
    }
    const cap = Math.max(1000, Number(timeoutMs) || Number(params.leanTimeoutMs) || 120000)
    // 构建计划：异步作业用**入队时冻结**的计划（修订 §4：结果只对那个上下文有效）；同步档现算。
    const p = plan || leanBuildPlan()
    let exe
    try {
      exe = await sub.resolveExecutable(String(p.engine || 'lean'))
    } catch (e) {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + String(p.engine || 'lean') + '": ' + String((e && e.message) || e) + ' —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
    }
    const inject = Array.isArray(p.inject) ? p.inject : leanSearchPathPlan(p.args, p.searchPaths, vibeRoot()).inject
    const argv = [exe].concat((Array.isArray(p.args) ? p.args : []).map(String)).concat(inject).concat([abs])
    const searchPath = (Array.isArray(p.searchPaths) && p.searchPaths.length) ? p.searchPaths.join(',') : vibeRoot()
    logActivity('formal', 'Lean 运行 ' + rel + '（search-path=' + searchPath + '）')
    let handle
    try {
      handle = await spawnHandle(sub, {
        argv: argv,
        cwd: frameworkRoot(),
        stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
        graceMs: cap,
      })
    } catch (e) {
      return { ok: false, code: 'LEAN_SPAWN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
    }
    leanSyncHandle = handle
    if (typeof onHandle === 'function') { try { onHandle(handle) } catch (e) { /* best effort */ } }
    // 超时必须有**主动**兜底：`graceMs` 只是宿主侧的宽限，契约 §7 明确要求"对超时调用
    // handle.terminate()"。此前 v2 只依赖 graceMs，从不终止进程：一个卡住的 Lean 会继续占着
    // 资源，而框架已经报了超时——它与自己的契约不一致。这里与 `handle.done` 竞速：计时器到点
    // 时尽力 terminate()，并给出一份可读的超时结果；`done` 先到就清掉计时器（不留悬挂 timer）。
    let timedOut = false
    let timer = null
    let outcome
    try {
      outcome = await Promise.race([
        handle.done,
        new Promise(function (resolve) {
          timer = setTimeout(function () {
            timedOut = true
            try { if (handle && typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* best effort：终止失败也要给出可读结果 */ }
            resolve({ exitCode: null, signal: 'SIGTERM' })
          }, cap)
        }),
      ])
    } catch (e) {
      if (timer !== null) clearTimeout(timer)
      return { ok: false, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
    }
    if (timer !== null) clearTimeout(timer)
    leanSyncHandle = null
    if (typeof onHandle === 'function') { try { onHandle(null) } catch (e) { /* best effort */ } }
    let out = '', err = ''
    try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
    try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
    const exitCode = outcome ? outcome.exitCode : null
    const ms = now() - started
    const ok = exitCode === 0
    // 两种超时都算超时：我们自己的计时器到点（timedOut），或耗时已越过 cap（宿主的 graceMs
    // 杀掉了进程时 done 会先返回一个非零 exitCode）。
    const isTimeout = timedOut || ms >= cap
    // 输出截断到 ~4KB 再入库（避免把巨大的编译器输出写进状态）。
    return {
      ok: ok, exitCode: exitCode, signal: (outcome && outcome.signal) || null, ms: ms,
      command: argv.join(' '), file: rel, searchPath: searchPath,
      stdout: tailText(out, 4000), stderr: tailText(err, 4000),
      timedOut: isTimeout,
      code: ok ? undefined : (isTimeout ? 'LEAN_TIMEOUT' : 'LEAN_FAILED'),
    }
  }
  // 把一次运行结果写进对象的形式化记录（不提升 status，状态迁移见契约 §4）。
  // `asyncInfo`（可选）：异步档把作业 id/state/attempts/落地时刻贴在记录上，供人对照（§1.4）。
  async function formalSetRun(target, run, asyncInfo) {
    const t = safeId(String(target || ''))
    if (!t) return
    const prev = formalOf(t)
    await putFormal(t, Object.assign({}, prev, {
      status: prev.status === 'passed' ? 'passed' : (prev.status === 'blocked' ? 'blocked' : 'attempted'),
      file: run.file || prev.file || '',
      run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: tailText(run.stdout, 800), stderrTail: tailText(run.stderr, 800) },
      async: asyncInfo || prev.async || null,
      updatedAt: now(),
    }))
  }
  // 写入一条 formal 记录（可选同时更新待办列表）。readJson/writeJson 走项目根，与 v2 其它状态一致。
  async function putFormal(target, record, todo) {
    const t = safeId(String(target || ''))
    const recs = Object.assign({}, formalRecords())
    if (record === null) delete recs[t]; else recs[t] = record
    formalState = { records: recs, todo: Array.isArray(todo) ? todo : formalTodo() }
    await saveFormal()
  }
  /**
   * 归档（对象 id）→ 验证对象（rId）的状态同步。
   *
   * v2 有两个 id 空间，而它们指的是同一个东西：代理用 `vibe_math_lean_archive target=<对象 id>`
   * （`r-pGate` 这种 rId 是调度器内部标识，代理在提示词里看到的是对象 id），而验证提示词
   * 与 require 门禁问的是"**这一次验证对象**"的状态。只写一个键会让两边错位：
   * 对象明明已 passed，门禁却认为 rId 仍未被形式化，裁定被反复搁置。
   * 这里把已知的验证对象记录（`r-<id>`、`r-<id>-pf<n>`、`r-<id>-rf<n>`）一并同步。
   */
  async function syncVerificationTarget(objectId, status, source) {
    const ids = Object.keys(formalRecords()).filter(function (k) { return k === ('r-' + objectId) || k.indexOf('r-' + objectId + '-') === 0 })
    for (const k of ids) {
      const prev = formalRecords()[k] || {}
      await putFormal(k, Object.assign({}, prev, {
        status: status,
        file: source.file || prev.file || '',
        proof: source.proof || prev.proof || '',
        decision: source.decision || prev.decision || '',
        note: source.note || prev.note || '',
        syncedFrom: objectId,
        // 这条路径**手里就有**权威的对象 id，把它写进记录：`formalObjectIdOf` 在任务表不在内存时
        // （resume 早期）靠它把验证 id 映射回对象，而不是去猜后缀（对象 id 可能自己以 -sN 结尾）。
        // 依旧只在它**确实是对象 id** 时写（调用方也可能把 rId 传进来，例如"归档写在 rId 上"）。
        ...(formalObjectIdOfIsOwner(objectId) ? { objectId: objectId } : {}),
        updatedAt: now(),
      }))
    }
    return ids
  }
  /**
   * 验证 id → 它对应的对象 id（`r-pGate` / `r-pGate-s0` / `r-pGate-pf1` / `r-pGate-rf2` → `pGate`）。
   * v2 有两套 id 空间，这条映射是**唯一**的一处：门禁的合并查询、提示词取记录、以及回执通道
   * （`blocked` / `defect` / `used`）都从这里得到对象 id，绝不另造第二套解析规则。
   *
   * **权威来源优先**（两级，都能跨 resume 生效）：
   *   ① 验证任务自己知道它属于哪个对象（`t.r.pId` / `t.r.qid`）；
   *   ② 记录里记着的 `objectId`（写记录时由**拿到对象 id 的那条路径**写上）。
   * 只靠字符串后缀解析会有歧义：**对象 id 本身以 `-s1`/`-pf1`/`-rf1` 结尾**时（例如命题 `pAmb-s1` 的
   * 验证 id 是 `r-pAmb-s1`），后缀剥离会把对象截成 `pAmb` —— 另一个对象。后果不是"少一条记录"而是
   * **张冠李戴**：忠实性提示词会打印邻居的证明路径、`defect` 回执会降级邻居的记录并**撤回邻居的归档
   * 证明**，而真正的对象仍然 `passed`（实测复现，见 `formal-verify-v2` 的 ambiguity 用例）。
   * 字符串解析只是前两者都不可用时的兜底。
   *
   * 记录里的 `objectId` 还要求**自洽**（它自己再映射一次还是它自己）：否则一次"归档写在 rId 上"的
   * 调用会把 `objectId: 'r-pAlias'` 写进记录，之后（任务表已不在内存时）这个错误的锚点反而会覆盖
   * 正确的后缀解析结果。
   */
  // 已加载的对象 id 集合（qs.id + propos.id），供 formalObjectIdOf 的后缀歧义消解使用（审计 L19）。
  // 只增不清：一次读库把对象记进来，即使该对象随后被删/重命名，最坏也只是多保留一个字符串。
  const knownObjectIds = new Set()
  function formalObjectIdOf(id) {
    const t = safeId(String(id == null ? '' : id))
    const task = tasks['verify:' + t]
    if (task && task.r) {
      const owner = String(task.r.pId || task.r.qid || '')
      if (owner) return safeId(owner)
    }
    const rec = formalRecords()[t]
    if (rec && rec.objectId && formalObjectIdOfIsOwner(rec.objectId)) return safeId(rec.objectId)
    const m = /^r-(.+?)(?:-(?:s\d+|pf\d+|rf\d+))?$/.exec(t)
    if (!m) return t
    // 后缀剥离是**有损**映射：`r-pAmb-s1` 既可能是"对象 pAmb 的第 1 个解法"，也可能是"对象 pAmb-s1"
    // 本身（对象 id 允许以 `-sN`/`-pfN`/`-rfN` 结尾）。惰性匹配总是剥掉后缀，于是后一种情形会被
    // 解析成同前缀的**邻居对象**——一次 defect 就会降级邻居、并撤回它自己的归档证明（审计 L19）。
    // 这里只在"完整串确实是已加载的对象 id"时才优先完整串；否则保持原有的后缀剥离（legacy 记录没有
    // objectId 时这是唯一线索）。knownObjectIds 由 getQs/getPropos 在每次读库时刷新，未读过库时为空
    // ⇒ 行为与从前完全一致。
    const full = t.slice(2)
    if (m[1] !== full && knownObjectIds.has(full)) return full
    return m[1]
  }
  /** 一个 id 能否作为"对象 id"落进记录：它不能再被解析成别的 id（对象 id 不以 `r-` 开头）。 */
  function formalObjectIdOfIsOwner(v) {
    const s = safeId(String(v == null ? '' : v))
    return !!s && s.indexOf('r-') !== 0
  }
  /**
   * 门禁/提示词看到的对象状态 = 合并后的记录，**两个方向都要认**，因为 v2 里归档与验证
   * 用的是两套 id，而代理两种写法都会用：
   *   · 归档写了对象 id（`pGate`）  → 验证对象 `r-pGate` 的查询回退到 `pGate`；
   *   · 归档写了验证 id（`r-pGate`）→ 对象 `pGate` 的查询回退到 `r-pGate`。
   * 只做单向就会产生"代理确实形式化了，门禁/提示词却仍按未尝试处理"的假阴性——那正是
   * 这条不变式最容易被写错的地方（审计清单 §3：成对关系只做一半是最常见的缺陷形态）。
   */
  function formalGateRecord(target) {
    const t = safeId(String(target || ''))
    const recs = formalRecords()
    const own = recs[t]
    if (formalGateOk(own)) return own
    // 验证 id → 其对象 id（r-<obj> / r-<obj>-s0 / r-<obj>-pf0 / r-<obj>-rf0）
    const objId = formalObjectIdOf(t)
    if (objId !== t) { const obj = recs[objId]; if (formalGateOk(obj)) return obj }
    // 对象 id → 其验证 id（本对象的第一个验证记录）
    const vr = recs['r-' + t]
    if (formalGateOk(vr)) return vr
    return own || { status: 'none' }
  }
  /**
   * 把同一条状态写进**两套 id 的全部记录**（契约 §8）。门禁、提示词、卡片三处**各读不同的一侧**，
   * 所以只写一侧会造成静默错位：例如 `defect` 只写到 `r-<id>` 上，对象记录仍是 `passed`，
   * 于是 `formalGateRecord` 从对象侧读回 `passed`、索引与卡片照旧写"Lean 通过"——
   * 这正是"成对关系只做一半"的典型缺陷形态（AUDIT-CHECKLIST §3）。
   */
  async function putFormalBothIds(target, patch) {
    const t = safeId(String(target == null ? '' : target))
    if (!t) return []
    const objectId = formalObjectIdOf(t)
    // 记录里写上权威对象 id：验证 id 的那条记录从此**自带**它属于谁，`formalObjectIdOf` 不必再猜
    // （对象 id 本身可能以 -sN/-pfN/-rfN 结尾，后缀剥离会指向另一个对象）。只有当这个 id **确实
    // 是对象 id**（不以 r- 开头）时才写，免得把 `objectId:'r-pAlias'` 这种错锚点固化进记录。
    const withOwner = (t !== objectId && formalObjectIdOfIsOwner(objectId))
      ? Object.assign({ objectId: objectId }, patch) : patch
    const written = []
    const write = async function (k) {
      if (written.indexOf(k) !== -1) return
      const prev = formalRecords()[k] || { status: 'none' }
      await putFormal(k, Object.assign({}, prev, withOwner))
      written.push(k)
    }
    await write(t)                            // 回执点名的那个 id（对象 id 或验证 id）
    if (objectId !== t) await write(objectId) // 另一侧
    // 同一对象的其它验证别名（r-<id>、r-<id>-s0、r-<id>-pf1、r-<id>-rf2）：复用既有扫描，不新造映射。
    const aliases = await syncVerificationTarget(objectId, patch.status, patch)
    for (let i = 0; i < aliases.length; i++) await write(aliases[i])
    // 实体化**规范验证别名** r-<对象id>：归档时写对象 id 是常见写法，此时验证侧可能**根本还没有**
    // 记录；只降级对象侧会让"这一次验证"看起来从未被形式化过（门禁查询优先看 rId）。显式写下这条
    // attempted/blocked 记录，两套 id 空间才真正一致（审计清单 §3：成对关系别只做一半）。
    await write('r-' + objectId)
    // syncVerificationTarget 用 `||` 合并 proof，表达不了"清空"——而 defect 恰恰必须清空 proof。
    if (patch.proof === '') {
      for (let i = 0; i < written.length; i++) await putFormal(written[i], Object.assign({}, formalRecords()[written[i]] || {}, { proof: '' }))
    }
    return written
  }

  // ---- 提示词注入（在构造提示词的那一刻现算；契约 §6）----
  function formalPromptBlock(target) {
    if (!formalOn()) return ''
    const mode = formalMode()
    // 与门禁取同一条记录：验证对象记录优先，其次它对应的对象记录，避免"归档了却仍按未尝试提示"。
    const rec = target ? formalGateRecord(target) : { status: 'none' }
    const L = []
    const vroot = vibeRoot().replace(/\\/g, '/')
    L.push('【Lean 形式化验证（' + (mode === 'require' ? '强制' : '鼓励') + '模式）】')
    if (rec.status === 'passed') {
      // 整个功能的意义所在：审查对象**变了**。证明正确性已由内核保证，剩下的唯一风险是
      // "这段 Lean 代码说的不是我们想说的"。
      // 忠实性的**判定指引**（一致怎么投、发现偏差怎么投、什么情况才能投 0）在 formalVerifySection
      // 里紧随其后给出——两段拼在同一条提示词里，合成契约 §6.1 的完整「忠实性分支」。
      L.push('  · 该对象已有**通过的 Lean 形式化证明**（' + (rec.proof || rec.file) + '，最近运行 exit 0）。')
      L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')
      L.push('    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。')
    } else if (rec.status === 'blocked') {
      L.push('  · 该对象已被记录为**形式化阻塞**：' + (rec.note || '未说明') + '。')
      L.push('    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。')
    } else {
      L.push('  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。')
      L.push('  · 工具：vibe_math_lean_run（执行）· vibe_math_lean_archive（归档）· vibe_math_lean_lib（查已有可复用库/jobs）· vibe_math_lean_read（取回归档原文）')
      L.push('  · 工作目录：Formal/（相对项目根）；可复用定义放 ' + vroot + '/Formal/Lib/，已证引理放 '
        + vroot + '/Formal/Proved/；写之前先 vibe_math_lean_lib 查重。')
      L.push('  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。'
        + '请把注意力放在这种核对上，而不是重新做一遍推导。')
      if (mode === 'require') {
        L.push('  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因（vibe_math_lean_archive '
          + 'kind=\'blocked\' note=… 或回执 formal.note）。若两者都没有，本次裁定不会生效，会被记为未定论'
          + '（原因 formal-required）并进入「形式化待办」。')
      } else {
        L.push('  · 若你判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断（decision=\'blocked\' 时必须写明 note）。')
      }
      L.push('  · 归档可复用定义/引理前先跑通（vibe_math_lean_archive run=true 或先 vibe_math_lean_run）；跑不通不要入库。')
      // —— §5 B（逐字）：三条筛选判据 + 先查再写 + 异步"落地前不得当已通过" ——
      L.push('  · 三条筛选判据：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。')
      L.push('  · 写新定义/证明前**先 vibe_math_lean_lib 查已有库**（vibe_math_lean_read 可取回归档原文逐字复用），查不到再写；'
        + '复用已归档内容用 `import Formal.Lib.<name>` / `import Formal.Proved.<name>`。')
      L.push('  · **没把握就记 blocked** 并写清难点，别用形式化掩盖不确定。')
      L.push('  · 该对象若已有后台编译在队列中（leanAsync 默认开启），**不得**在作业落地为通过之前声称已通过或转忠实性审查；'
        + '等 vibe_math_lean_lib 的 jobs 显示 settled 再审。')
      L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或宿主不提供 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明'
        + '"宿主无 Lean 工具链"——这算显式阻塞原因，定论门禁可以据此放行。')
    }
    // 后台作业的一次性公告（spec §2.4）：注入到本轮提示里，取走即清空。
    // 数学计算可用性行（prompts.md §2）：验证轮同样告知"先 probe 再 run / 回执即引用"。
    return L.join('\n') + leanNoticeSection() + mathWorkLine()
  }
  function formalWorkLine() {
    if (!formalOn()) return ''
    // 修订 §1：「日常主动性」（leanInitiative）与「验证时的要求强度」（formalVerify）是两件事。
    const initiative = LEAN_INITIATIVE_MODES.indexOf(params.leanInitiative) !== -1 ? params.leanInitiative : 'normal'
    if (initiative === 'off') {
      return '【顺手形式化（不主动：leanInitiative=off）】日常流程**不主动**做形式化；只在验证提示词按 formalVerify 的要求做'
        + '（要求里已给出判据、工具与归档方式）。'
    }
    // `Formal/Proved/` 在项目根下**并不存在**（可复用库故意在项目树之外），只写相对路径会让代理
    // 去项目里找一个永远找不到的目录；这里与验证段落一样给出 VibeMath 根的绝对路径（契约 §6.2）。
    return '【顺手形式化（' + (formalMode() === 'require' ? '强制' : '鼓励') + '·主动性 ' + initiative + '）】把你工作中常用或可能复用的对象、假设、'
      + '新定义用 Lean 形式化定义并归档到全局可复用库（vibe_math_lean_archive kind=\'def\'），已成立的引理归到 '
      + vibeRoot().replace(/\\/g, '/') + '/Formal/Proved/（kind=\'lemma\'）；写之前先 vibe_math_lean_lib 查重，避免重复定义。'
      + '归档前先跑通（vibe_math_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
      + (initiative === 'eager'
        ? '\n  · **主动档（leanInitiative=eager）**：日常就主动把有价值的小引理/命题/定义形式化——每轮工作结束时审视一次"这轮有什么值得进库"，值得就顺手归档。'
        : '\n  · 主动性 normal：顺手把明显有价值且可能复用的东西形式化；不必刻意扩大范围。')
      // —— §5 A（逐字）：三条筛选判据 + 先查再写 + 「没把握就记 blocked」 + 异步"落地前不得当已通过" ——
      + '\n  · 三条筛选判据：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。'
      + '\n  · **先 vibe_math_lean_lib 查再决定是否重写**：vibe_math_lean_lib 列出现成定义/引理，vibe_math_lean_read 可取回归档原文逐字复用；'
      + '复用已归档内容用 `import Formal.Lib.<name>` / `import Formal.Proved.<name>`（模块根 = ' + vibeRoot().replace(/\\/g, '/') + '，框架已把它加进编译搜索路径）。'
      + '\n  · **没把握就记 blocked**（vibe_math_lean_archive kind=\'blocked\' note=…，或回执 formal 的 blocked）：把难点写清楚，别用形式化掩盖不确定。'
      + '\n  · 编译默认走后台队列（leanAsync=true）：入队后你可以继续工作；用 vibe_math_lean_job（可 waitMs 等结果）或下一轮提示里的'
      + '【形式化结果】行看结果。**在作业落地为通过之前，不得把该对象当成已通过。**'
  }
  /**
   * 回执契约里的 `formal` 字段（契约 §6.3）。**必须真的出现在回执契约里**：契约写了字段而框架
   * 不解析，就是一条"框架收不到"的死通道（审计清单 §2.2）。`off` 档返回空串，verifier 的 JSON 示例
   * 因此与改动前逐字节一致。
   */
  function formalJsonField(target) {
    if (!formalOn()) return ''
    const id = String(target == null ? '' : target) || '<对象id>'
    return ',"formal":{"target":"' + id + '","decision":"used|blocked|defect","file":"Formal/' + id + '.lean","note":"难度判断/阻塞原因/具体偏差"}'
  }
  /**
   * 工作轮（solver / explorer）回执里的 formal 字段。这些角色的回执契约本身就是一段 JSON 模板，
   * 直接改模板尾部容易把示例改成非法 JSON，所以在**契约说明**里给出同样的字段（与 v3 同一形态）；
   * 框架侧 `absorbFormalFromReply` 同时接受顶层 `formal` 与 `meta.formal`。
   */
  function formalReplyNote() {
    if (!formalOn()) return ''
    return '\n形式化回执（本模式）：若你本轮对某个对象做了形式化难度判断，或发现已有 Lean 证明与命题原文不符，'
      + '请在回执里加上 "formal":{"target":"<对象id>","decision":"used|blocked|defect","file":"Formal/<对象id>.lean",'
      + '"note":"难度判断/阻塞原因/具体偏差"}（decision=\'blocked\'/\'defect\' 时必须写明 note，否则整条记录被拒绝；'
      + 'decision=\'defect\' 会撤回该证明的「已通过」状态并写入「形式化待办」）。'
  }
  /**
   * 撤回一份归档证明。删除是**尽力而为**，撤回却不是：
   * 宿主没有 `subprocess` 服务、shell 删除失败、或 shell 退出 0 却没真的删掉（stub 宿主、权限问题）时，
   * 必须把撤回通知**写进那个路径**——否则一份已被撤回的证明仍留在 `Verified/Lean/`，那是"所有人找
   * 这个对象的证明"的地方；记录里的 `proof` 已经清空，于是目录与记录脱节，谁也不会再发现它
   * （契约 §4.1 要求撤回，而不是"试过删除"）。
   * 返回**实际发生了哪一种**（deleted / overwritten / failed / unreachable），由调用方如实告知读者。
   */
  async function withdrawArchivedProof(rel) {
    const abs = leanAbsPath(rel)
    if (abs === null) return { rel: String(rel), outcome: 'unreachable' }
    const sub = subprocessOf()
    if (sub !== undefined && typeof sub.spawn === 'function') {
      try { await runShell(rmCmd(abs)) } catch (e) { /* 落到下面的覆写 */ }
      // 用 fs 复核"真的没了"：`Remove-Item -ErrorAction SilentlyContinue` / `rm -f` 都可能静默失败。
      if (await readTextAbs(abs) === undefined) return { rel: String(rel), outcome: 'deleted' }
    }
    const ok = await writeTextAbs(abs, '-- 已撤回（' + fmtTime() + '）：该形式化被认定与命题原文不一致。\n'
      + '-- 原代码保留在工作文件 Formal/' + String(rel).split('/').pop() + '；修正并重新跑通后重新归档。\n')
    return { rel: String(rel), outcome: ok ? 'overwritten' : 'failed' }
  }
  /**
   * 契约 §4.1：`defect` = **形式化不合格**，不是"命题为假"。
   *
   * 表决者逐条核对后发现 Lean 代码与命题原文不一致（写窄了/写宽了/换了对象/漏了条件…），
   * 那是这条形式化写得不对，不是命题被证伪。因此：
   *   ① 把形式化记录**降级为 `attempted`**（无论此前是 `passed` 还是 `blocked`）、清空 `proof`；
   *   ② 撤回归档证明 `Verified/Lean/<id>.lean`（工作文件 `Formal/<id>.lean` 保留，代码不丢）；
   *   ③ `note` 记入记录与 `Formal/TODO.md`，并在活动日志里公告；
   *   ④ `require` 档下 `formalGateOk` 随之为假 → 本次裁定**不定论**，修正形式化并重新跑通后再投票。
   */
  async function formalDefectDowngrade(target, note, who) {
    const t = safeId(String(target || ''))
    const objectId = formalObjectIdOf(t)
    const before = formalRecords()
    const proofs = []
    const pushProof = function (p) { const s = String(p || ''); if (s && proofs.indexOf(s) === -1) proofs.push(s) }
    // **同一对象的全部 id 别名**都要看：归档可能写在对象 id（`pX`）上，也可能写在验证 id
    // （`r-pX` / `r-pX-s0` / `r-pX-pf1`）上，而回执点名的可以是任意一侧。只扫 `t` 与 `objectId`
    // 会漏掉"归档用 rId、回执用对象 id"这一组合，于是那份被撤回的证明永远留在 `Verified/Lean/`
    // 里（记录已清空 proof，没人再指向它）——这正是"成对关系只做一半"的缺陷形态（审计清单 §3）。
    for (const k of Object.keys(before)) if (formalObjectIdOf(k) === objectId) pushProof((before[k] || {}).proof)
    // 两套 id 一起降级——只降一侧会让另一侧继续"已通过"，门禁/卡片就会照旧放行。
    await putFormalBothIds(t, { status: 'attempted', decision: 'defect', note: note, proof: '', updatedAt: now() })
    // 备选的归档证明路径 = 记录里记着的那份（一定存在过）+ 各个 id 直接对应的文件名。
    const candidates = []
    for (let i = 0; i < proofs.length; i++) if (proofs[i].indexOf('Verified/Lean/') === 0 && candidates.indexOf(proofs[i]) === -1) candidates.push(proofs[i])
    const keys = Object.keys(before).filter(function (k) { return formalObjectIdOf(k) === objectId })
    for (const id of keys.concat([t, objectId])) { const r = 'Verified/Lean/' + id + '.lean'; if (candidates.indexOf(r) === -1) candidates.push(r) }
    // 只处理**确实存在**（或在记录里被引用）的路径：宿主没有 subprocess 时撤回会退化成"覆写通知"，
    // 若把从未存在过的文件名也一并处理，就会凭空造出 `Verified/Lean/<id>.lean`。
    const rels = []
    for (let i = 0; i < candidates.length; i++) {
      if (proofs.indexOf(candidates[i]) !== -1) { rels.push(candidates[i]); continue }
      const abs = leanAbsPath(candidates[i])
      if (abs !== null && (await readTextAbs(abs)) !== undefined) rels.push(candidates[i])
    }
    const deleted = [], overwritten = [], failed = []
    for (let i = 0; i < rels.length; i++) {
      let r
      try { r = await withdrawArchivedProof(rels[i]) } catch (e) { r = { rel: rels[i], outcome: 'failed' } }
      if (r.outcome === 'deleted') deleted.push(r.rel)
      else if (r.outcome === 'overwritten') overwritten.push(r.rel)
      else failed.push(r.rel)
    }
    const list = formalTodo().filter(function (x) { return x.id !== objectId })
    list.push({ id: objectId, at: now(), why: 'defect：形式化与命题原文不一致，需修正后重新跑通（' + note + '）' })
    await putFormal(t, Object.assign({}, formalRecords()[t] || {}, { status: 'attempted', decision: 'defect', note: note, proof: '', updatedAt: now() }), list)
    await writeFormalTodo()
    await writeFormalIndex()
    // 公告必须如实说明**撤回实际怎么完成的**：删除成功、只能覆写成撤回通知、还是两者都没做到。
    // 否则读者会以为归档目录里已经干净了，而一份坏证明还躺在那里（契约 §4.1）。
    logActivity('formal', '【形式化】' + who + ' 通过回执记录 ' + objectId + ' 的忠实性缺陷（decision=defect）：' + note
      + ' —— 已撤回「已通过」状态（降级 attempted'
      + (deleted.length ? '、删除归档证明 ' + deleted.join('、') : '')
      + (overwritten.length ? '、把归档证明覆写为撤回通知 ' + overwritten.join('、') + '（宿主无法删除，但该路径已不再是一份证明）' : '')
      + (failed.length ? '、⚠ 归档证明 ' + failed.join('、') + ' 既未删除也未能覆写，记录已降级——请不要把它当作该对象的证明' : '')
      + '、写入 Formal/TODO.md）。'
      // 强度必须与档位一致（契约 §4.1 第 3 条）：encourage 没有门禁，不能声称框架会搁置裁定。
      + (formalRequired() ? '本次裁定不定论。' : '本档没有门禁：本次裁定是否定论由表决结果决定（靠表决者的弃权值阻止布尔一致结论）。'))
    return { ok: true, decision: 'defect', target: objectId, named: t, status: 'attempted', note: note, cleared: rels, deleted: deleted, overwritten: overwritten, failed: failed }
  }
  /**
   * 回执通道（契约 §4 / §6.3）：代理**即使一次 Lean 工具都没调用**，也必须能留下"实现难度判断"或
   * "忠实性缺陷"。`blocked` / `defect` 的 `note` 必填（决定必须显式、可审计，不允许静默跳过）；
   * 缺 note / 缺 target / 非法 decision 一律拒绝（`V2_INVALID_ARGUMENT`）且不留下任何记录。
   */
  async function absorbFormalReply(f, memberId) {
    try {
      if (!formalOn() || !f || typeof f !== 'object') return { ok: false, ignored: true }
      const who = memberId || 'office'
      const rawTarget = String(f.target == null ? '' : f.target).trim()
      const decision = String(f.decision || '')
      if (!rawTarget) {
        // safeId('') 会返回 'anon'：没有 target 的回执绝不能凭空造出一条 formal 记录。
        logActivity('formal', '【形式化】' + who + ' 的 formal 回执没有 target，已拒绝（V2_INVALID_ARGUMENT）。')
        return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'formal.target is required' }
      }
      const target = safeId(rawTarget)
      const note = String(f.note || '').trim()
      if (decision === 'blocked' || decision === 'defect') {
        if (!note) {
          logActivity('formal', '【形式化】' + who + ' 的 formal.decision=' + decision + ' 没有写明 note，已拒绝（V2_INVALID_ARGUMENT）——'
            + target + ' 的难度判断/忠实性缺陷必须显式、可审计。')
          return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'formal.decision=' + decision + ' requires a non-empty note (target ' + target + ')' }
        }
        if (decision === 'defect') return await formalDefectDowngrade(target, note, who)
        await putFormalBothIds(target, { status: 'blocked', decision: 'blocked', note: note, updatedAt: now() })
        await writeFormalIndex()
        logActivity('formal', '【形式化】' + who + ' 通过回执记录 ' + target + ' 形式化阻塞：' + note)
        return { ok: true, decision: 'blocked', target: target, status: 'blocked', note: note }
      }
      if (decision === 'used') {
        const file = String(f.file || ('Formal/' + target + '.lean'))
        // 契约 §4：`used` 只表示"这一轮碰了形式化/写了草稿"，它**不得**撤销已经成立的证明。
        // 无条件写 attempted 会静默抹掉 passed：投票提示词丢掉忠实性分支、require 档对一份已跑通的
        // 归档证明重新关门，而 `proof` 指针还留着（记录自相矛盾）。v3/v4/v5 都保留 passed/blocked——
        // 这是"四套同构"里最容易被漏掉的一处（AUDIT-CHECKLIST §1.8）。
        // 两套 id 空间都可能是"更强的那一侧"（对象侧 blocked、验证侧 passed 这类历史状态），
        // 所以取两者的最强状态：passed > blocked > attempted——保证 `used` 在任何一侧都不降级。
        const own = formalOf(target).status
        const merged = formalGateRecord(target).status
        const status = (own === 'passed' || merged === 'passed') ? 'passed'
          : ((own === 'blocked' || merged === 'blocked') ? 'blocked' : 'attempted')
        await putFormalBothIds(target, { status: status, decision: 'used', file: file, updatedAt: now() })
        await writeFormalIndex()
        logActivity('formal', '【形式化】' + who + ' 通过回执记录 ' + target + ' 形式化草稿：' + file
          + (status === 'attempted' ? '' : '（保留已有的 ' + status + ' 状态：一次 used 回执不撤销已成立的证明）'))
        return { ok: true, decision: 'used', target: target, status: status, file: file }
      }
      logActivity('formal', '【形式化】' + who + ' 的 formal.decision 只能是 \'used\' | \'blocked\' | \'defect\'（收到 '
        + String(f.decision) + '），已忽略（V2_INVALID_ARGUMENT）。')
      return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'formal.decision must be one of used|blocked|defect' }
    } catch (e) {
      // 回执通道**绝不**把异常抛进调度循环：一次记账失败不该吞掉一次表决。
      console.error('vibe-math-v2: absorbFormalReply failed: ' + String((e && e.message) || e))
      return { ok: false, error: String((e && e.message) || e) }
    }
  }
  /** 从一条代理回执里取出 formal 判断并落库（顶层 `formal` 或 `meta.formal` 都接受）。 */
  async function absorbFormalFromReply(parsed, memberId) {
    if (!formalOn() || !parsed || typeof parsed !== 'object') return { ok: false, ignored: true }
    const f = (parsed.formal && typeof parsed.formal === 'object') ? parsed.formal
      : ((parsed.meta && typeof parsed.meta.formal === 'object') ? parsed.meta.formal : null)
    if (!f) return { ok: false, ignored: true }
    return await absorbFormalReply(f, memberId)
  }

  // ================= Lean 增量 + 异步：作业队列（spec §2） =================
  // 并发上限 = `leanJobsMaxParallel`（默认 1 = 串行）。队列是**内存**态，作业记录镜像到
  // <项目>/Formal/Jobs/<jobId>.json —— 崩溃恢复、lean_lib.jobs 与 lean_job 都读它。
  const LEAN_QUEUE_CONCURRENCY_MAX = 8
  const leanQueue = []            // FIFO：待跑作业
  const leanJobs = new Map()      // jobId -> job（内存视图，含 state）
  const leanRunningHandles = new Map() // jobId -> 子进程 handle（dispose 时 terminate）
  let leanSyncHandle = null       // 同步档在跑的 handle（同样能被 terminate）
  const leanPendingNotices = []   // 一次性公告行（注入下一次 round prompt，spec §2.4）
  /** 当前会话的构建计划（修订 §2/§4）：冻结 engine/args/搜索路径，作业与指纹都用它。 */
  function leanBuildPlan() {
    const userArgs = (Array.isArray(params.leanArgs) ? params.leanArgs : []).map(String)
    const plan = leanSearchPathPlan(userArgs, params.leanSearchPaths, vibeRoot())
    return { engine: String(params.leanCommand || 'lean'), args: userArgs, searchPaths: plan.paths, inject: plan.inject, explicit: plan.explicit }
  }
  function leanPlanContext(plan) { return leanBuildContext(plan.engine, plan.args, plan.searchPaths) }
  /** 归档作业当前应绑定的构建计划（def/lemma 与 proof 都是本项目计划）。 */
  function leanContextNow() { return leanPlanContext(leanBuildPlan()) }
  function leanJobsMaxParallel() { return Math.max(1, Math.min(LEAN_QUEUE_CONCURRENCY_MAX, Number(params.leanJobsMaxParallel) || 1)) }
  function leanActiveCount() { let n = 0; for (const j of leanJobs.values()) if (j.state === 'running') n++ ; return n }
  function leanSleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, Number(ms) || 0)) }) }
  function leanJobAbs(job) {
    const rel = String((job && job.rel) || '')
    if (!rel) return null
    return job.scope === 'root' ? normalizeAbsPath(vibeAbs(rel)) : normalizeAbsPath(frameworkRoot() + '/' + rel)
  }
  /** 作业的回执路径与归档路径（lean_job 返回它们，修订 §3）。 */
  function leanJobPaths(job) {
    const rec = { receipt: 'Formal/Jobs/' + job.jobId + '.json' }
    if (job.kind === 'archive' && job.archive && job.archive.kind === 'proof' && job.target) {
      rec.work = job.rel
      rec.archive = job.state === 'settled' ? ('Verified/Lean/' + job.target + '.lean') : ''
    } else if (job.kind === 'archive') rec.archive = job.rel
    else rec.file = job.rel
    return rec
  }
  function leanJobRecord(job) {
    return {
      jobId: job.jobId, kind: job.kind, state: job.state, attempts: Number(job.attempts || 1),
      target: job.target || '', name: job.name || '', rel: job.rel || '', scope: job.scope || 'project',
      sha256: job.sha || '', buildSha256: job.buildSha || '', buildContext: job.buildCtx || '',
      engine: (job.plan && job.plan.engine) || '', argv: (job.plan && job.plan.args) || [], searchPaths: (job.plan && job.plan.searchPaths) || [],
      archiveKind: (job.archive && job.archive.kind) || '',
      enqueuedAt: job.enqueuedAt || 0, startedAt: job.startedAt || 0, settledAt: job.settledAt || 0,
      exitCode: job.exitCode === undefined ? null : job.exitCode,
      timedOut: !!job.timedOut, interrupted: !!job.interrupted, note: job.note || '',
      project: currentProject,
    }
  }
  async function writeLeanJobFile(job) { await writeJson('Formal/Jobs/' + job.jobId + '.json', leanJobRecord(job)) }
  function hydrateLeanJob(rec) {
    return {
      jobId: String(rec.jobId), kind: rec.kind || 'run', target: rec.target || '', name: rec.name || '',
      rel: rec.rel || '', scope: rec.scope || 'project', sha: rec.sha256 || '',
      buildSha: rec.buildSha256 || '', buildCtx: rec.buildContext || '',
      plan: rec.engine !== undefined ? { engine: rec.engine || '', args: rec.argv || [], searchPaths: rec.searchPaths || [] } : null,
      archive: rec.archiveKind ? { kind: rec.archiveKind, target: rec.target || '', name: rec.name || '' } : null,
      state: rec.state || 'queued', attempts: Number(rec.attempts || 1), enqueuedAt: Number(rec.enqueuedAt || 0),
      startedAt: Number(rec.startedAt || 0), settledAt: Number(rec.settledAt || 0),
      exitCode: rec.exitCode === undefined ? null : rec.exitCode, timedOut: !!rec.timedOut,
      interrupted: !!rec.interrupted, run: rec.run || null, note: rec.note || '',
    }
  }
  /** 入队：同 jobId 已在队列/在跑 ⇒ 复用（幂等）；返回作业对象。 */
  async function enqueueLeanJob(spec) {
    const existing = leanJobs.get(spec.jobId)
    if (existing && (existing.state === 'queued' || existing.state === 'running')) return existing
    const job = Object.assign({}, spec, {
      state: 'queued', attempts: Number(spec.attempts || ((existing && existing.attempts) || 0) + 1),
      enqueuedAt: spec.enqueuedAt || now(), startedAt: 0, settledAt: 0, exitCode: null,
      timedOut: false, interrupted: false, run: null, note: spec.note || '',
    })
    leanJobs.set(job.jobId, job)
    leanQueue.push(job)
    await writeLeanJobFile(job)
    logActivity('formal', 'Lean 作业入队 ' + job.jobId + '（' + job.kind + (job.target ? '｜对象 ' + job.target : (job.name ? '｜' + job.name : '')) + '，state=queued）')
    return job
  }
  function pushLeanNotice(line) { if (leanPendingNotices.length >= 20) leanPendingNotices.shift(); leanPendingNotices.push(String(line)) }
  /** 一次性公告（spec §2.4）：取走即清空，保证同一条结果只注入一次。 */
  function leanNoticeSection() {
    if (leanPendingNotices.length === 0) return ''
    const lines = leanPendingNotices.splice(0, leanPendingNotices.length)
    return '\n' + lines.join('\n') + '\n'
  }
  function leanJobPublic(job) { return { jobId: job.jobId, state: job.state, rel: job.rel || '', target: job.target || '', attempts: Number(job.attempts || 1), settledAt: Number(job.settledAt || 0) } }
  /**
   * 心跳里推进队列：**不 await 编译本身**（调用方不 await 本函数）。
   * 并发上限 = `leanJobsMaxParallel`（默认 1，串行）；串行时本函数等待该作业跑完再返回。
   */
  async function runLeanQueue() {
    const max = leanJobsMaxParallel()
    let started = 0
    while (leanQueue.length > 0 && leanActiveCount() + started < max) {
      const job = leanQueue.shift()
      if (!job || job.state !== 'queued') continue
      started++
      if (max <= 1) { await runLeanJob(job); return }
      runLeanJob(job).catch(function (e) { console.error('vibe-math-v2: lean job failed: ' + String((e && e.message) || e)) })
    }
  }
  async function runLeanJob(job) {
    if (job.state !== 'queued') return
    job.state = 'running'; job.startedAt = now(); job.interrupted = false
    await writeLeanJobFile(job)
    let run
    try { run = await leanExecFile(job.rel, leanJobAbs(job), job.timeoutMs, job.plan, function (h) { if (h) leanRunningHandles.set(job.jobId, h); else leanRunningHandles.delete(job.jobId) }) }
    catch (e) { run = { ok: false, exitCode: null, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), ms: 0 } }
    try { await settleLeanJob(job, run) } catch (e) { console.error('vibe-math-v2: lean job settle failed: ' + String((e && e.stack) || e)) }
  }
  /** 结果公告行（spec §2.4 的四种结局）。 */
  function leanSettleNotice(job, settledOk, capMs) {
    const ms = (job.run && job.run.ms) || 0
    if (job.interrupted) return '【形式化结果】' + job.jobId + '：中断（会话卸载或崩溃，已标记 attempted，可重跑）'
    if (job.timedOut) return '【形式化结果】' + job.jobId + '：超时（leanTimeoutMs=' + capMs + ' 已 terminate；对象留在 attempted）'
    if (settledOk) return '【形式化结果】' + job.jobId + '：通过（exit 0，' + (ms / 1000).toFixed(1) + 's' + ((job.kind === 'archive' && job.archive && job.archive.kind === 'proof') ? ('，已归档 Verified/Lean/' + job.target + '.lean') : '') + '）'
    if (job.hashMismatch) return '【形式化结果】' + job.jobId + '：失败（编译期间文件内容已变，本次结果已丢弃；请重跑）'
    if (job.contextMismatch) return '【形式化结果】' + job.jobId + '：失败（编译期间构建上下文已变：引擎/参数/搜索路径，本次结果已丢弃；请在新上下文下重跑）'
    return '【形式化结果】' + job.jobId + '：失败（exit ' + String(job.exitCode) + '，见 stderr 尾部）'
  }
  /**
   * 落地一个作业（**唯一**的 passed 入口，spec §2.1）：只有 exit 0 **且** 内容哈希仍匹配才算 ok；
   * 其余一律 attempted；中断/超时都不是 passed；内容变了只标记不贴结果。
   */
  async function settleLeanJob(job, run) {
    const capMs = Math.max(1000, Number(job.timeoutMs) || Number(params.leanTimeoutMs) || 120000)
    let currentSha = null
    try { const t = await readTextAbs(leanJobAbs(job)); if (t !== undefined) currentSha = leanContentSha(t) } catch (e) { /* 读不到 ⇒ 视为不匹配 */ }
    const hashOk = currentSha !== null && currentSha === job.sha
    // 修订 §4：结果只对**产生它的那个构建上下文**有效。参数在编译途中被改（引擎/参数/搜索路径）
    // ⇒ 这次 ok 不能贴到"现在的配置"上，宁可判为未通过并明确公告。
    const ctxNow = leanContextNow()
    const ctxOk = !job.buildCtx || job.buildCtx === ctxNow
    job.hashMismatch = !hashOk
    job.contextMismatch = !ctxOk
    job.exitCode = run.exitCode === undefined ? null : run.exitCode
    job.timedOut = !!run.timedOut
    job.settledAt = now()
    const settledOk = !job.interrupted && !job.timedOut && run.exitCode === 0 && hashOk && ctxOk
    job.state = job.interrupted ? 'interrupted' : (job.timedOut ? 'timeout' : (settledOk ? 'settled' : 'failed'))
    job.run = { at: now(), ok: settledOk, exitCode: job.exitCode, ms: run.ms || 0, timedOut: !!job.timedOut, interrupted: !!job.interrupted, stdoutTail: tailText(run.stdout, 800), stderrTail: tailText(run.stderr, 800), searchPath: run.searchPath || vibeRoot(), buildContext: job.buildCtx || '' }
    if (job.hashMismatch && !job.interrupted && !job.timedOut) job.note = 'file changed while compiling — result discarded (hash mismatch)'
    else if (job.contextMismatch && !job.interrupted && !job.timedOut) job.note = 'build context changed while compiling (engine/args/search paths) — result discarded; re-run under the new context'
    const asyncInfo = { jobId: job.jobId, state: job.state, attempts: job.attempts, enqueuedAt: job.enqueuedAt, startedAt: job.startedAt, settledAt: job.settledAt, exitCode: job.exitCode, buildSha256: job.buildSha || '' }
    if (job.kind === 'archive') await settleLeanArchiveJob(job, settledOk, asyncInfo)
    else if (job.target) await formalSetRun(job.target, Object.assign({}, run, { ok: settledOk, file: job.rel }), asyncInfo)
    if (!job.interrupted) await writeFormalIndex()
    await writeLeanJobFile(job)
    pushLeanNotice(leanSettleNotice(job, settledOk, capMs))
    logActivity('formal', 'Lean 作业 ' + job.jobId + ' ' + job.state + '（' + job.kind + '）' + (job.target ? '｜对象 ' + job.target : ''))
    reportDirty = true
  }
  /** 归档类作业的落地：**只有 ok 才落库/置 passed**（def/lemma 的文件在入队前已写好）。 */
  async function settleLeanArchiveJob(job, ok, asyncInfo) {
    const a = job.archive || {}
    if (a.kind !== 'proof') {
      await rebuildLeanLibIndexes()
      logActivity('formal', '归档作业 ' + job.jobId + '（' + a.kind + ' ' + job.rel + '）' + (ok ? '运行通过' : '运行未通过（见 stderr 尾部；该文件不应被当作可复用定义）'))
      return
    }
    const target = job.target
    const prev = formalOf(target)
    const passed = !!ok
    const stalePrev = passed ? '' : String(prev.proof || ('Verified/Lean/' + target + '.lean'))
    const rec = Object.assign({}, prev, {
      status: passed ? 'passed' : 'attempted',
      file: job.rel,
      proof: passed ? 'Verified/Lean/' + target + '.lean' : '',
      decision: 'used',
      note: String(prev.note || ''),
      run: job.run,
      async: asyncInfo,
      updatedAt: now(),
    })
    let withdrawn = null
    if (passed) {
      const body = await readTextAbs(leanJobAbs(job))
      if (body !== undefined) await writeText('Verified/Lean/' + target + '.lean', body)
    } else if (stalePrev) { try { withdrawn = await withdrawArchivedProof(stalePrev) } catch (e) { withdrawn = { rel: stalePrev, outcome: 'failed' } } }
    await putFormal(target, rec)
    await syncVerificationTarget(target, rec.status, rec)
    await rebuildLeanLibIndexes()
    logActivity('formal', '归档作业 ' + job.jobId + ' 为 ' + target + ' ' + (passed ? ('通过，已归档 ' + rec.proof + '，验证转为忠实性审查')
      : ('未通过：' + tailText(job.run && job.run.stderrTail, 160) + '；已撤回上一份已通过状态与归档证明' + (withdrawn && withdrawn.outcome !== 'failed' ? '（' + withdrawn.outcome + '）' : '（⚠ 撤回失败，请不要把 ' + stalePrev + ' 当作该对象的证明）'))))
  }
  /** 去重（spec §4.3）：同内容且已成功过 ⇒ 跳过写盘与重编译。 */
  async function leanDedupeLookup(jobId, abs, sha, proofTarget) {
    if (proofTarget) {
      const rec = formalOf(proofTarget)
      if (rec && rec.status === 'passed') {
        const cur = await readTextAbs(vibeAbs('Verified/Lean/' + proofTarget + '.lean'))
        if (cur !== undefined && leanContentSha(cur) === sha) return { deduped: true, file: 'Verified/Lean/' + proofTarget + '.lean' }
      }
      return null
    }
    const prev = await readJson('Formal/Jobs/' + jobId + '.json')
    if (leanJobSettledOk(prev)) {
      const cur = await readTextAbs(abs)
      if (cur !== undefined && leanContentSha(cur) === sha) return { deduped: true, file: String(prev.rel || '') }
    }
    return null
  }
  /** 后台作业的公共返回形状（§1.2）。 */
  function leanAsyncReturn(job, extra) {
    return Object.assign({
      ok: true, async: { jobId: job.jobId, state: job.state }, jobId: job.jobId,
      message: '已入队后台编译（并发上限 1）；你可以继续工作。结果会写入 Formal/ 与索引，并在下一轮提示里公告；也可用 vibe_math_lean_lib 的 jobs 字段随时查看。**在该作业落地为通过之前，不得把相关对象当成已通过。**',
    }, extra || {})
  }
  /** 崩溃恢复（spec §2.6）：queued 重入队；running 哈希匹配 ⇒ 标记 interrupted + 重入队（attempts+1），不匹配 ⇒ 只标记；恢复**绝不**置 passed。 */
  async function recoverLeanJobs() {
    let files = []
    try { files = (await listFiles('Formal/Jobs')) || [] } catch (e) { return { recovered: 0 } }
    let recovered = 0
    for (let i = 0; i < files.length; i++) {
      const f = String(files[i])
      if (!/\.json$/.test(f)) continue
      const rec = await readJson('Formal/Jobs/' + f)
      if (!rec || !rec.jobId) continue
      // 本进程内存里已知的作业（queued/running 或已落地）不再恢复：同一进程内切换项目时，
      // 内存队列还在正常跑，按文件状态"恢复"会把一个在跑的作业误判成崩溃（重复入队/误置 interrupted）。
      if (leanJobs.has(String(rec.jobId))) continue
      const job = hydrateLeanJob(rec)
      leanJobs.set(job.jobId, job)
      const abs = leanJobAbs(job)
      const txt = abs ? await readTextAbs(abs) : undefined
      const curSha = txt === undefined ? null : leanContentSha(txt)
      const hashMatch = curSha !== null && curSha === job.sha
      if (job.state === 'queued') {
        await enqueueLeanJob(job)
        pushLeanNotice('【形式化结果】' + job.jobId + '：上次会话未执行的排队作业已重新入队')
        recovered++
      } else if (job.state === 'running') {
        if (hashMatch) {
          if (job.target) await putFormal(job.target, Object.assign({}, formalOf(job.target), { status: 'attempted', async: { jobId: job.jobId, state: 'interrupted', attempts: job.attempts }, updatedAt: now() }))
          job.interrupted = true
          // 先落到 interrupted，再重入队：否则 enqueueLeanJob 的幂等守卫会把这条 "running" 记录
          // 当成"仍在跑"而早退，attempts 也不会 +1（恢复就静默失效了）。
          job.state = 'interrupted'
          await enqueueLeanJob(Object.assign({}, job, { attempts: job.attempts + 1 }))
          pushLeanNotice('【形式化结果】' + job.jobId + '：中断（会话崩溃，已标记 attempted，已用新 attempts 重新入队）')
        } else {
          if (job.target) await putFormal(job.target, Object.assign({}, formalOf(job.target), { status: 'attempted', async: { jobId: job.jobId, state: 'interrupted', attempts: job.attempts, note: 'file changed' }, updatedAt: now() }))
          job.state = 'interrupted'; job.interrupted = true
          job.note = 'file changed while the previous session was compiling — not auto-re-driven'
          await writeLeanJobFile(job)
          pushLeanNotice('【形式化结果】' + job.jobId + '：中断（文件已变，未自动重驱；请手动重跑）')
        }
        recovered++
      } else if (job.state === 'settled') {
        // 修订 §4：只有**同一构建上下文**下的 settled(ok) 才允许恢复成 passed。
        const ctxNow = leanContextNow()
        const ctxOk = !job.buildCtx || job.buildCtx === ctxNow
        if (leanJobSettledOk(rec) && hashMatch && ctxOk) {
          job.run = { at: now(), ok: true, exitCode: 0, ms: 0, timedOut: false, interrupted: false, stdoutTail: '', stderrTail: '', searchPath: vibeRoot(), buildContext: job.buildCtx || '' }
          if (job.kind === 'archive') await settleLeanArchiveJob(job, true, { jobId: job.jobId, state: 'settled', attempts: job.attempts, settledAt: job.settledAt, exitCode: 0, buildSha256: job.buildSha || '' })
          else if (job.target) await formalSetRun(job.target, job.run, { jobId: job.jobId, state: 'settled', buildSha256: job.buildSha || '' })
          pushLeanNotice('【形式化结果】' + job.jobId + '：已按作业记录补写归档与 passed（恢复时校验内容哈希与构建上下文一致）')
        } else if (job.target) {
          await putFormal(job.target, Object.assign({}, formalOf(job.target), { status: 'attempted', async: { jobId: job.jobId, state: 'interrupted', attempts: job.attempts, note: ctxOk ? 'recovered-incomplete' : 'build context changed' }, updatedAt: now() }))
          pushLeanNotice('【形式化结果】' + job.jobId + '：按作业记录标记为未通过/已变（恢复绝不置 passed）')
        }
        recovered++
      }
    }
    if (recovered > 0) logActivity('formal', 'Lean 作业恢复：处理了 ' + recovered + ' 条遗留作业记录（queued 重入队 / running 标记中断 / settled 补写；绝不置 passed）')
    return { recovered: recovered }
  }
  /** 会话卸载/销毁：终止在跑的编译并标记 interrupted（不留孤儿进程，spec §2.5）。 */
  function disposeLeanJobs() {
    let n = 0
    for (const job of leanJobs.values()) {
      if (job.state === 'running') { job.interrupted = true; n++ }
    }
    for (const job of leanQueue) { job.state = 'interrupted'; job.interrupted = true; n++ }
    for (const h of leanRunningHandles.values()) {
      try { if (h && typeof h.terminate === 'function') h.terminate() } catch (e) { /* best effort */ }
    }
    leanRunningHandles.clear()
    if (leanSyncHandle && typeof leanSyncHandle.terminate === 'function') { try { leanSyncHandle.terminate() } catch (e) { /* best effort */ } }
    leanSyncHandle = null
    leanQueue.length = 0
    if (n > 0) {
      pushLeanNotice('【形式化结果】干预：会话卸载，' + n + ' 个 Lean 作业已标记 interrupted（未落地为 passed）')
      // 落盘尽力而为（disposer 不能 await）：作业记录留着，供下次 init 恢复时标记。
      try {
        for (const job of leanJobs.values()) { if (job.state === 'running' || job.interrupted) writeLeanJobFile(job).catch(function () { }) }
      } catch (e) { /* best effort */ }
    }
    return n
  }

  // ---- 三份索引（框架维护；契约 §9）----
  async function writeFormalIndex() {
    const recs = formalRecords()
    const L = ['# Lean 形式化索引｜' + currentProject, '',
      '> 本文件由框架维护（工具调用时增量更新；`vibe_math_lean_lib` 会重建）。权威状态在 VibeMath_State/formal.json 与对象记录里。', '',
      '| 对象 | 状态 | 形式化文件 | 归档证明 | 最近运行 | 难度判断 / 阻塞原因 |', '|---|---|---|---|---|---|']
    const keys = Object.keys(recs)
    if (!keys.length) L.push('| （暂无） | | | | | |')
    for (const k of keys) {
      const r = recs[k] || {}
      const run = r.run ? (r.run.ok ? 'ok（exit 0，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）' : 'fail（exit ' + r.run.exitCode + '，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）') : '—'
      L.push('| ' + k + ' | ' + (r.status || 'none') + ' | ' + (r.file || '—') + ' | ' + (r.proof || '—') + ' | ' + run + ' | ' + String(r.note || '—').replace(/\|/g, '/').slice(0, 120) + ' |')
    }
    L.push('')
    if (formalTodo().length) {
      L.push('## 形式化待办（require 模式）')
      for (const t of formalTodo()) L.push('- ' + t.id + ' —— ' + (t.why || 'formal-required') + '（' + fmtTime(t.at) + '）')
      L.push('')
    }
    await writeText('Formal/Index.md', L.join('\n'))
  }
  async function writeFormalTodo() {
    const list = formalTodo()
    const L = ['# 形式化待办｜' + currentProject + '｜' + fmtTime(), '',
      '> 这些对象在 `require` 模式下尚不具备「Lean 已通过」或「显式阻塞记录」，因此**定论被搁置**。',
      '> 完成形式化（vibe_math_lean_archive kind=\'proof\'）或记录阻塞原因（kind=\'blocked\'）后，重新提议验证即可。', '']
    if (!list.length) L.push('（暂无）')
    for (const t of list) L.push('- ' + t.id + '｜' + (t.why || 'formal-required') + '｜' + fmtTime(t.at))
    L.push('')
    await writeText('Formal/TODO.md', L.join('\n'))
  }
  async function rebuildLeanLibIndexes() {
    // 扫描**不执行**工具链：每次问"有什么可复用"就跑一遍 lean 既慢又出人意料。
    // 每个对象的运行结果存在对象记录里，显示在 Formal/Index.md。
    // 依赖列（spec §4.4）：把 `import` 行扫出来写进索引，"有什么 / 叫什么 / 怎么导入"三问一次答完。
    const scan = async (dirAbs, dirRel, kindLabel) => {
      const rows = []
      try {
        const t = await fs.resolve(dirAbs)
        if (await fs.stat(t) === undefined) return rows
        const entries = await fs.listDir(t)
        for (const e of entries || []) {
          if (!e || e.type !== 'file' || !/\.lean$/.test(String(e.name))) continue
          const rel = dirRel + '/' + e.name
          const txt = (await readTextAbs(dirAbs + '/' + e.name)) || ''
          const name = String(e.name).replace(/\.lean$/, '')
          const first = (txt.split('\n').filter(function (l) { return l.trim() && !/^\s*(\/\/|--|import)/.test(l) })[0] || '').trim().slice(0, 110)
          const deps = txt.split('\n').filter(function (l) { return /^\s*import\s+/.test(l) })
            .map(function (l) { return l.trim().replace(/^import\s+/, '').trim() }).filter(Boolean).slice(0, 4)
          rows.push('| ' + name + ' | ' + rel + ' | ' + kindLabel + ' | ' + (deps.length ? deps.join(', ') : '—').replace(/\|/g, '/') + ' | ' + first.replace(/\|/g, '/') + ' |')
        }
      } catch (e) { /* 列表尽力而为 */ }
      return rows
    }
    const libRows = await scan(vibeRoot() + '/Formal/Lib', 'Formal/Lib', 'def')
    await writeTextAbs(vibeRoot() + '/Formal/Lib/Index.md', ['# 可复用 Lean 定义库（跨项目）｜' + currentProject, '',
      '> 写新定义之前先查这里：能复用就不要重新定义。复用方式：`import Formal.Lib.<名称>`（模块根 = VibeMath 根）。', '',
      '| 名称 | 文件 | 类别 | 依赖（import） | 摘要 |', '|---|---|---|---|---|']
      .concat(libRows.length ? libRows : ['| （暂无） | | | | |']).join('\n') + '\n')
    const provedRows = await scan(vibeRoot() + '/Formal/Proved', 'Formal/Proved', 'lemma')
    await writeTextAbs(vibeRoot() + '/Formal/Proved/Index.md', ['# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）｜' + currentProject, '',
      '> 这些文件是通过内核检查的引理，可直接 import 复用：`import Formal.Proved.<名称>`。', '',
      '| 名称 | 文件 | 类别 | 依赖（import） | 陈述 |', '|---|---|---|---|---|']
      .concat(provedRows.length ? provedRows : ['| （暂无） | | | | |']).join('\n') + '\n')
    await writeFormalIndex()
    await writeFormalTodo()
    return { lib: libRows.length, proved: provedRows.length, objects: Object.keys(formalRecords()).length }
  }

  // 执行一个 Lean 文件，记录运行结果（可按 target 归属到对象），刷新索引，并**原样**回报结果。
  // 刻意在 `off` 档也照常工作：人要调试自己的工具链时仍然可用。
  // leanAsync=true（默认）：入队后立即返回（成员不阻塞）；false：逐字保留今天的同步路径。
  async function leanRunTool(memberId, o) {
    const args = o || {}
    const rel = String(args.file || '').trim()
    const target = String(args.target || '').trim()
    if (params.leanAsync !== false) {
      const guard = await leanResolveRunTarget(rel)
      if (!guard.ok) return guard
      const plan = leanBuildPlan()
      const ctx = leanPlanContext(plan)
      const fp = leanJobFingerprint(guard.text, ctx)
      const jobId = leanJobId(target || guard.rel, fp)
      const job = await enqueueLeanJob({ jobId: jobId, kind: 'run', key: target || guard.rel, rel: guard.rel, scope: 'project', target: target, sha: guard.sha, buildSha: fp, buildCtx: ctx, plan: plan, memberId: memberId, timeoutMs: args.timeout_ms })
      return leanAsyncReturn(job, { file: guard.rel, state: job.state, hint: '已入队。**在它落地为通过之前，不得把该对象当成已通过**；结果会在下一轮提示的【形式化结果】行里公告，或用 vibe_math_lean_job / vibe_math_lean_lib 的 jobs 字段查看（lean_job 可 waitMs=… 等待）。' })
    }
    const run = await leanRunFile(rel, args.timeout_ms)
    if (run.ok || run.file) {
      if (target) await formalSetRun(target, run)
      await writeFormalIndex()
    }
    if (run.ok) logActivity('formal', (memberId || 'office') + ' 运行 Lean 通过：' + run.file + '（' + (run.ms / 1000).toFixed(1) + 's）' + (args.target ? '｜对象 ' + args.target : ''))
    return Object.assign({ ok: !!run.ok }, run, {
      async: null,
      hint: run.ok
        ? '通过。若是某个对象的证明，请用 vibe_math_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库（归档时会先跑一次，跑不通不要入库）。'
        : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_math_lean_archive kind=\'blocked\' 记录原因。',
    })
  }
  /** 异步档的路径/存在性校验（与 leanRunFile 同一套守卫与错误码）。 */
  async function leanResolveRunTarget(relPath) {
    const rel = String(relPath || '').trim()
    if (!rel) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'file is required' }
    const abs = leanAbsPath(rel)
    if (abs === null) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot() + '/ 之内（收到 ' + rel + '）' }
    if (!/\.lean$/.test(abs)) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '只有 .lean 文件可以执行' }
    const txt = await readTextAbs(abs)
    if (txt === undefined) return { ok: false, code: 'V2_NOT_FOUND', message: 'no such file: ' + rel }
    return { ok: true, rel: rel, abs: abs, sha: leanContentSha(txt), text: txt }
  }
  /**
   * `lean_job`（修订 §3，只读）：不带 jobId ⇒ 本会话作业清单；带 ⇒ 该作业的 state/exitCode/
   * 回执路径/归档路径。`waitMs>0` 时最多等这么久（内部轮询，**不阻塞心跳**——心跳是独立 timer），
   * 超时就返回当前 state。
   */
  async function leanJobTool(o) {
    const args = o || {}
    const wantId = String(args.jobId || '').trim()
    const waitMs = Math.max(0, Math.min(600000, Number(args.waitMs) || 0))
    if (!wantId) {
      const jobs = []
      for (const j of leanJobs.values()) jobs.push(Object.assign(leanJobPublic(j), { exitCode: j.exitCode === undefined ? null : j.exitCode, paths: leanJobPaths(j), buildSha256: j.buildSha || '' }))
      jobs.sort(function (a, b) { return (b.settledAt || 0) - (a.settledAt || 0) || String(a.jobId).localeCompare(String(b.jobId)) })
      return { ok: true, async: params.leanAsync !== false, maxParallel: leanJobsMaxParallel(), queued: leanQueue.length, running: leanActiveCount(), jobs: jobs, paths: { receipts: 'Formal/Jobs/', proofs: 'Verified/Lean/', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/' }, hint: 'state=settled 且 exitCode=0（且内容哈希/构建上下文一致）才算通过；queued/running 一律还不算。' }
    }
    let job = leanJobs.get(wantId)
    if (!job) {
      const rec = await readJson('Formal/Jobs/' + wantId + '.json')
      if (!rec || !rec.jobId) return { ok: false, code: 'V2_NOT_FOUND', message: 'no such Lean job: ' + wantId + '（用不带 jobId 的 vibe_math_lean_job 列清单）' }
      job = hydrateLeanJob(rec)
      if (!leanJobs.has(job.jobId)) leanJobs.set(job.jobId, job)
    }
    const startedAt = now()
    while (waitMs > 0 && (job.state === 'queued' || job.state === 'running') && (now() - startedAt) < waitMs) {
      await leanSleep(50)
      const cur = leanJobs.get(wantId)
      if (cur) job = cur
    }
    return {
      ok: true, jobId: job.jobId, state: job.state, exitCode: job.exitCode === undefined ? null : job.exitCode,
      attempt: Number(job.attempts || 1), timedOut: !!job.timedOut, interrupted: !!job.interrupted, note: job.note || '',
      buildSha256: job.buildSha || '', buildContext: job.buildCtx || '',
      waitedMs: now() - startedAt, stillRunning: (job.state === 'queued' || job.state === 'running'),
      passed: leanJobSettledOk(leanJobRecord(job)),
      paths: leanJobPaths(job),
      run: job.run || null,
    }
  }
  /** `lean_read`：只读地取回归档的 Lean 原文（verbatim 复用；§1.2）。 */
  async function leanReadTool(o) {
    const args = o || {}
    const rawName = String(args.name || '').trim()
    if (!rawName) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'name is required' }
    if (rawName.indexOf('..') !== -1 || /[\\/]/.test(rawName) || /^[a-z]:/i.test(rawName)) {
      return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'name must be a bare library name (no path separators, no "..", no absolute path)' }
    }
    const name = safeId(rawName)
    const kind = (args.kind === 'lib' || args.kind === 'proved') ? args.kind : 'auto'
    const order = kind === 'auto' ? ['lib', 'proved'] : [kind]
    for (let i = 0; i < order.length; i++) {
      const k = order[i]
      const rel = 'Formal/' + (k === 'lib' ? 'Lib' : 'Proved') + '/' + name + '.lean'
      const dir = normalizeAbsPath(vibeRoot() + '/Formal/' + (k === 'lib' ? 'Lib' : 'Proved'))
      const abs = normalizeAbsPath(vibeAbs(rel))
      // 双保险：规范化后必须真的落在那两个目录之内（name 已过 safeId，这里是路径守卫）
      if (abs.indexOf(dir + '/') !== 0) continue
      const txt = await readTextAbs(abs)
      if (txt === undefined) continue
      const LIMIT = 64 * 1024
      const bytes = Buffer.byteLength(txt, 'utf8')
      const truncated = bytes > LIMIT
      return { ok: true, name: name, file: rel, kind: k, sha256: leanContentSha(txt), bytes: bytes, text: truncated ? Buffer.from(txt, 'utf8').slice(0, LIMIT).toString('utf8') : txt, truncated: truncated }
    }
    return { ok: false, code: 'V2_NOT_FOUND', message: 'no archived Lean file named ' + name + '（查过 Formal/Lib 与 Formal/Proved）；可先用 vibe_math_lean_lib 看清单' }
  }
  async function leanArchive(memberId, o) {
    const args = o || {}
    const kind = String(args.kind || '')
    const content = typeof args.content === 'string' ? args.content : undefined
    const from = args.from ? String(args.from) : ''
    if (kind === 'def' || kind === 'lemma') {
      // 必填校验必须看**原始**输入：v2 的 id 安全化函数 safeId('') 返回 'anon'（非空），
      // 直接用 safeId 的结果做 `!name` 判断就永远为假，缺 name 的归档会静默写成 anon.lean。
      const rawName = String(args.name || '').trim()
      if (!rawName) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'name is required for a reusable definition/lemma' }
      const name = safeId(rawName)
      let body = content
      if (body === undefined && from) {
        const srcAbs = leanAbsPath(from)
        if (srcAbs === null) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'from must be a .lean file inside the VibeMath root (got ' + from + ')' }
        body = await readTextAbs(srcAbs)
      }
      if (body === undefined) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
      const rel = 'Formal/' + (kind === 'def' ? 'Lib' : 'Proved') + '/' + name + '.lean'
      const abs = vibeAbs(rel)
      const sha = leanContentSha(body)
      const plan = leanBuildPlan()
      const ctx = leanPlanContext(plan)
      const fp = leanJobFingerprint(body, ctx)               // 修订 §4：指纹含内容 + 构建上下文
      const jobId = leanJobId(name, fp)
      // 去重（§4.3）：同内容 + 同构建上下文且已成功归档过 ⇒ 跳过重写与重编译。
      const dedupe = await leanDedupeLookup(jobId, abs, sha, null)
      if (dedupe) {
        logActivity('formal', (memberId || 'office') + ' 归档 ' + kind + ' `' + name + '` 命中去重（同内容与构建上下文，跳过重写与重编译）')
        return { ok: true, kind: kind, name: name, file: rel, deduped: true, sha256: sha, buildSha256: fp, note: '内容与构建上下文都与已归档并编译通过的版本一致：跳过重写与重编译（去重）。' }
      }
      if (params.leanAsync !== false && args.run !== false) {
        if (!await writeTextAbs(abs, body)) return { ok: false, code: 'V2_WRITE_FAILED', message: 'could not write ' + rel }
        const job = await enqueueLeanJob({ jobId: jobId, kind: 'archive', key: name, rel: rel, scope: 'root', name: name, target: '', sha: sha, buildSha: fp, buildCtx: ctx, plan: plan, memberId: memberId, archive: { kind: kind } })
        return leanAsyncReturn(job, { kind: kind, name: name, file: rel, sha256: sha, buildSha256: fp, deduped: false, note: '文件已写入 ' + rel + '；编译已入队（并发上限 leanJobsMaxParallel）。**落地为通过之前，请不要把它当作可复用定义**；结果会在下一轮提示的【形式化结果】行公告，也可用 vibe_math_lean_job 查/等。' })
      }
      if (!await writeTextAbs(abs, body)) return { ok: false, code: 'V2_WRITE_FAILED', message: 'could not write ' + rel }
      // 全局库在项目树之外，必须用**绝对路径**执行（相对形式会被解析到项目根之内）。
      const run = args.run === false ? null : await leanRunFile(abs)
      await rebuildLeanLibIndexes()
      logActivity('formal', (memberId || 'office') + ' 归档了' + (kind === 'def' ? '可复用定义' : '已证引理') + ' `' + name + '` → ' + rel + (run ? '（运行 ' + (run.ok ? '通过' : '未通过') + '）' : ''))
      // 工具返回值同样是代理读到的文字：`run` 为红时**不能**声称"可直接 import 复用"——
      // 那份文件没有通过编译，"可复用库"里的它是有害的（契约 §6 第 3 条 / v2 实现方案 §9.4）。
      return {
        ok: true, kind: kind, name: name, file: rel, run: run || undefined,
        note: (run && !run.ok)
          ? '⚠ 该文件**运行未通过**（见 run.stderr）：它已写入 ' + rel + '，但**不合格**，请不要当作可复用定义；请修复后用 vibe_math_lean_run（或再次归档 run=true）跑通。'
          : '已并入全局可复用库，后续项目可直接 import 复用',
      }
    }
    if (kind === 'proof') {
      const rawTarget = String(args.target || '').trim()
      if (!rawTarget) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'target is required for kind=proof' }
      const target = safeId(rawTarget)
      let body = content
      if (body === undefined && from) {
        const srcAbs = leanAbsPath(from)
        if (srcAbs === null) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'from must be a .lean file inside the VibeMath root (got ' + from + ')' }
        body = await readTextAbs(srcAbs)
      }
      if (body === undefined) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
      const workRel = 'Formal/' + target + '.lean'
      const sha = leanContentSha(body)
      const plan = leanBuildPlan()
      const ctx = leanPlanContext(plan)
      const fp = leanJobFingerprint(body, ctx)
      const jobId = leanJobId(target, fp)
      // 去重（§4.3）：对象已 passed 且归档证明与新提交内容一致 ⇒ 跳过。
      const dedupe = await leanDedupeLookup(jobId, null, sha, target)
      if (dedupe) {
        logActivity('formal', (memberId || 'office') + ' 归档证明 ' + target + ' 命中去重（已 passed 且内容一致）')
        return { ok: true, kind: kind, target: target, file: workRel, proof: dedupe.file, passed: true, deduped: true, sha256: sha, buildSha256: fp, status: 'passed', note: '该对象已是 passed，且归档证明与新提交内容一致：跳过重写与重编译（去重）。' }
      }
      if (params.leanAsync !== false) {
        if (!await writeText(workRel, body)) return { ok: false, code: 'V2_WRITE_FAILED', message: 'could not write ' + workRel }
        const prevA = formalOf(target)
        await putFormal(target, Object.assign({}, prevA, {
          status: prevA.status === 'passed' ? 'passed' : 'attempted',
          file: workRel,
          decision: 'used',
          note: String(args.note || prevA.note || ''),
          async: { jobId: jobId, state: 'queued', attempts: 0, enqueuedAt: now(), startedAt: 0, settledAt: 0, exitCode: null, buildSha256: fp },
          updatedAt: now(),
        }))
        await writeFormalIndex()
        const job = await enqueueLeanJob({ jobId: jobId, kind: 'archive', key: target, rel: workRel, scope: 'project', target: target, sha: sha, buildSha: fp, buildCtx: ctx, plan: plan, memberId: memberId, archive: { kind: 'proof', target: target } })
        return leanAsyncReturn(job, {
          kind: kind, target: target, file: workRel, status: 'attempted', sha256: sha, buildSha256: fp,
          note: '工作文件已写入 ' + workRel + '；编译已入队。**只有该作业在同一个构建上下文下落地为通过，才会写入 Verified/Lean/' + target + '.lean 并把状态变为 passed**——在它落地之前，这个对象不是"已通过形式化"。',
        })
      }
      if (!await writeText(workRel, body)) return { ok: false, code: 'V2_WRITE_FAILED', message: 'could not write ' + workRel }
      const run = await leanRunFile(workRel)
      const prev = formalOf(target)
      const passed = !!run.ok
      // A RED re-archive invalidates the previous proof: the work file it proved has just been
      // overwritten by code that does not compile. Keeping the pointer (or leaving the archived
      // file) would produce "attempted + 归档证明 X.lean" in the index and let the fidelity prompt
      // print a proof path for code that no longer exists — `proof` is for `passed` only (§4).
      const stalePrev = passed ? '' : String(prev.proof || ('Verified/Lean/' + target + '.lean'))
      const rec = Object.assign({}, prev, {
        status: passed ? 'passed' : 'attempted',
        file: workRel,
        proof: passed ? 'Verified/Lean/' + target + '.lean' : '',
        decision: 'used',
        note: String(args.note || prev.note || ''),
        run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: tailText(run.stdout, 800), stderrTail: tailText(run.stderr, 800) },
        updatedAt: now(),
      })
      let withdrawn = null
      if (passed) await writeText('Verified/Lean/' + target + '.lean', body)
      else if (stalePrev) { try { withdrawn = await withdrawArchivedProof(stalePrev) } catch (e) { withdrawn = { rel: stalePrev, outcome: 'failed' } } }
      await putFormal(target, rec)
      // ★ 让"归档"与"验证对象"两套 id 对齐。
      // 验证提示词与门禁关心的是**这一次验证**（rId，例如 r-pGate），而代理用 vibe_math_lean_archive
      // 归档时给的是**对象 id**（例如 pGate）。若不在这里把验证对象也标成同一状态，就会
      // 出现"对象已 passed、门禁却仍认为 rId 未形式化"的错位：代理明明做了形式化，
      // 裁定还是被反复搁置。两套记录都写，门禁与提示词任取其一都自洽。
      await syncVerificationTarget(target, passed ? 'passed' : 'attempted', rec)
      await rebuildLeanLibIndexes()
      logActivity('formal', (memberId || 'office') + ' 为 ' + target + ' 归档形式化证明 ' + workRel + '（运行 ' + (passed
        ? '通过，已归档到 ' + rec.proof + '，验证转为忠实性审查'
        : '未通过：' + tailText(run.stderr || run.message, 160)
          + '；已撤回上一份已通过状态与归档证明' + (withdrawn && withdrawn.outcome !== 'failed' ? '（' + withdrawn.outcome + '）' : '（⚠ 撤回失败，请不要把 ' + stalePrev + ' 当作该对象的证明）')) + '）')
      return { ok: true, kind: kind, target: target, file: workRel, proof: rec.proof, passed: passed, run: run, status: rec.status }
    }
    if (kind === 'blocked') {
      const rawTarget = String(args.target || '').trim()
      if (!rawTarget) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'target is required for kind=blocked' }
      const target = safeId(rawTarget)
      const note = String(args.note || '').trim()
      if (!note) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）——"因难度决定不做形式化"必须显式、可审计' }
      const prev = formalOf(target)
      const rec = Object.assign({}, prev, { status: 'blocked', decision: 'blocked', note: note, updatedAt: now() })
      await putFormal(target, rec)
      await syncVerificationTarget(target, 'blocked', rec)
      await rebuildLeanLibIndexes()
      logActivity('formal', (memberId || 'office') + ' 记录 ' + target + ' 形式化阻塞：' + note)
      return { ok: true, kind: kind, target: target, status: 'blocked', note: note }
    }
    return { ok: false, code: 'V2_INVALID_ARGUMENT', message: "kind must be 'def' | 'lemma' | 'proof' | 'blocked'" }
  }
  /**
   * `require` 门禁的判定 + 记账（契约 §8）。返回 true 表示"本次裁定被搁置"。
   *
   * 为什么记 `未定论` 而不是"卡住不动"：卡住会让整个研究所永久停在一个对象上；记为未定论 +
   * 待办既保住"未经形式化不得称为严格结论"，又保证系统继续推进（与既有"未达门槛留库附平均
   * 概率"一致）。门禁是**兜底**：正常路径下验证提示词已经先告知表决者要么形式化要么记录阻塞。
   */
  async function deferForFormal(target, why) {
    const t = safeId(String(target || ''))
    if (!t) return false
    if (!formalRequired()) return false
    // ★ 判定必须用**合并后**的记录（`formalGateRecord`，两套 id 都认），不能只看自己那一侧。
    // 代理是用**对象 id** 归档的（提示词里给它的就是对象 id），而验证/门禁问的是 rId；
    // `syncVerificationTarget` 只更新**已存在**的别名键，所以"归档写了 pX、r-pX 还没有记录"是
    // 首次形式化后的真实状态。那时 `formalOf('r-pX')` 返回 `{status:'none'}`，门禁会把一个
    // **已经 passed 的对象**判为未形式化（假阴性）；更糟的是这次搁置本身会写下 r-pX =
    // status:'none'，于是此后**每一轮**都继续搁置、继续重开一次完整辩论——对象永远无法定论。
    // 这正是实现方案 §四写明的"门禁与提示词取记录时两个方向都认（formalGateRecord）"。
    const rec = formalGateRecord(t)
    if (formalGateOk(rec)) return false
    const own = formalOf(t)
    const reason = 'formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 ' + (rec.status || 'none') + '）' + (why ? '｜' + why : '')
    const list = formalTodo().filter(function (x) { return x.id !== t })
    list.push({ id: t, at: now(), why: reason })
    // 不改动对象的既有权重/概率字段：只补一条 formal 记录（status 保持 none/attempted）。
    await putFormal(t, own.status === 'none' ? { status: 'none', deferredAt: now() } : Object.assign({}, own, { deferredAt: now() }), list)
    await writeFormalTodo()
    await writeFormalIndex()
    // v2 没有群聊文件（没有 Shared/Chat/），所以"群聊公告"落在它的可读通道上：
    // 活动日志（report.recentActivity 会写进 Progress_Logs/report.json）+ 推送汇报给的提示语。
    logActivity('formal-gate', '【形式化】' + t + ' 的裁定被 require 模式搁置：' + reason + '（已记入 Formal/TODO.md）')
    reportDirty = true
    return true
  }

  // ================= data layer: qs.json =================
  async function getQs() { const a = await readJson('qs/qs.json'); const list = Array.isArray(a) ? a : []; for (const q of list) { if (q && q.id) knownObjectIds.add(safeId(String(q.id))) } return list }
  async function writeQs(list) { await writeJson('qs/qs.json', list) }
  async function findQ(qid) { const qs = await getQs(); return qs.find(function (q) { return q.id === qid }) }

  // progress：结构化 JSON 对象（旧数据可能是 JSON 字符串，两者兼容解析）。
  // 注意：必须保证返回对象含 directions 数组（晋升/判断/子问题等 progress 可能只有来源/说明等字段）。
  async function saveProgress(qid, progObj) { const qs = await getQs(); const q = qs.find(function (x) { return x.id === qid }); if (!q) return; q.progress = progObj; await writeQs(qs) }

  // ================= data layer: Propos =================
  // categoryOf 的结果会直接成为文件名的一部分（Propos/<分类>_Propos.json，见 proposFile）。
  // 模型提供一个含路径分隔符或 ".." 的"细类型"键就能把文件写到 Propos/ 之外，所以这里做文件名消毒
  // （只替换分隔符与控制字符、剥掉首尾点，不改动中文分类名本身）。
  function safeCatName(s) {
    const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^[.\s]+|[.\s]+$/g, '')
    return t || '未分类'
  }
  function categoryOf(p) { const t = (p && p.细类型) || {}; const keys = Object.keys(t); return (keys.length > 0 && typeof t[keys[0]] === 'object') ? safeCatName(keys[0]) : '未分类' }
  function proposFile(cat) { return 'Propos/' + safeCatName(cat) + '_Propos.json' }
  async function proposFiles() { return await listFiles('Propos') }
  async function readProposCategory(cat) { const a = await readJson(proposFile(cat)); return Array.isArray(a) ? a : [] }
  async function getPropos() {
    const out = []
    const files = await proposFiles()
    for (let i = 0; i < files.length; i++) {
      const fname = files[i]
      const cat = fname.replace(/_Propos\.json$/i, '')
      const list = await readProposCategory(cat)
      for (let j = 0; j < list.length; j++) { list[j]._category = cat; if (list[j] && list[j].id) knownObjectIds.add(safeId(String(list[j].id))); out.push(list[j]) }
    }
    return out
  }
  async function findProposition(pId) { const all = await getPropos(); return all.find(function (p) { return p.id === pId }) }
  async function upsertProposition(p) {
    const cat = p._category || categoryOf(p)
    delete p._category
    const list = await readProposCategory(cat)
    const idx = list.findIndex(function (x) { return x.id === p.id })
    if (idx !== -1) list[idx] = p; else list.push(p)
    await writeJson(proposFile(cat), list)
    return cat
  }
  async function deleteProposition(p) {
    const cat = p._category || categoryOf(p)
    const list = await readProposCategory(cat)
    const next = list.filter(function (x) { return x.id !== p.id })
    await writeJson(proposFile(cat), next)
  }

  // ================= data layer: Verified / Reliable =================
  async function readVerifiedCategory(cat) { const a = await readJson('Verified/' + String(cat) + '_Verified.json'); return Array.isArray(a) ? a : [] }
  async function reliableFiles() { return await listFiles('Reliable') }

  // ================= reporting =================
  function logActivity(event, detail) { activityLog.push({ at: now(), event: event, detail: String(detail || '') }); const cap = Number(params.activityLogCap) || 100; if (activityLog.length > cap) activityLog.shift(); reportDirty = true }
  async function buildReport() {
    const qs = await getQs()
    const propos = await getPropos()
    return {
      ok: true, at: now(), project: currentProject, frameworkRoot: frameworkRoot(),
      running: scheduler.running, mode: params.mode,
      activeCount: activeCount(), maxParallelThreshold: params.maxParallelThreshold,
      problems: { total: qs.length, solved: qs.filter(function (q) { return q.已解决 }).length },
      propositions: { total: propos.length, resolved: propos.filter(function (p) { return p.布尔估计 === 1 || p.布尔估计 === 0 }).length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      registeredAgents: Object.keys(agentRegistry).length,
      recentActivity: activityLog.slice(-Math.min(ACTIVITY_REPORT_MAX, Number(params.activityLogCap) || 100)),
      // Lean 形式化：可调档位与开关同处可读参数表（契约 §1），并附当前形式化记录概况。
      formal: {
        mode: formalMode(), required: formalRequired(),
        leanCommand: params.leanCommand, leanArgs: params.leanArgs, leanTimeoutMs: params.leanTimeoutMs,
        objects: Object.keys(formalRecords()).map(function (k) { const r = formalRecords()[k] || {}; return { target: k, status: r.status, file: r.file, proof: r.proof, note: r.note } }),
        todo: formalTodo(),
        paths: { project: 'Formal/', lib: vibeRoot() + '/Formal/Lib/', proved: vibeRoot() + '/Formal/Proved/', proofs: 'Verified/Lean/' },
      },
      params: params,
    }
  }
  async function maybeWriteReport(force) {
    const interval = Number(params.reportIntervalMs) || 0
    if (!force && interval > 0 && (now() - lastReportWrite) < interval) return
    if (!force && interval <= 0 && !reportDirty) return
    await writeJson('Progress_Logs/report.json', await buildReport())
    lastReportWrite = now(); reportDirty = false
  }
  async function maybePushReport(force) {
    const mode = params.reportMode || 'file'
    if (mode !== 'push' && mode !== 'both') return
    const interval = Number(params.reportIntervalMs) || 0
    if (interval > 0) {
      // heartbeat: push on interval (or force), independent of reportDirty so 'both' mode works
      if (!force && (now() - lastPushReport) < interval) return
    } else if (!force && !reportDirty) {
      // event-driven: only push when an event happened since the last report
      return
    }
    if (!rootAgent || typeof rootAgent.followup !== 'function') return
    try {
      const report = await buildReport()
      const text = '[Vibe Math V2] 进度更新：当前项目 "' + currentProject + '" 运行中=' + report.running +
        '，问题 ' + report.problems.solved + '/' + report.problems.total + ' 已解决，命题 ' + report.propositions.resolved + '/' + report.propositions.total + ' 已定论，' +
        '活跃代理轮数=' + report.activeCount + '，待人工决策=' + report.pendingDecisions.length + '。' +
        '请调用 vibe_math_report 汇总当前进展及各代理状态，并用人话简要汇报（不打断用户，简短即可）。'
      // 来源 kind 必须是**已声明**的：`MessageSourceMap` 是 merge-extensible 的联合，但没有共享的
      // catch-all `plugin` kind（dsh-llm message.d.ts），{kind:'plugin'} 是契约外形状。role 本来就是
      // 'user'，正文也自带 "[Vibe Math V2] 进度更新" 的真署名，所以用核心声明的 {kind:'user'}。
      rootAgent.followup({ id: uuid(), role: 'user', content: [textBlock(text)], source: { kind: 'user' } })
      lastPushReport = now()
    } catch (e) {
      console.error('vibe-math-v2: push report failed: ' + String((e && e.message) || e))
    }
  }

  // ================= child spawn / followup =================
  function pickProvider() { try { const names = subagents.list ? subagents.list() : []; if (names.indexOf('spawn') !== -1) return 'spawn'; if (names.indexOf('fork') !== -1) return 'fork' } catch (e) {} return 'spawn' }
  function childAgentOptions() { const o = {}; try { if (rootAgent && rootAgent.options) { if (rootAgent.options.provider) o.provider = rootAgent.options.provider; if (rootAgent.options.model) o.model = rootAgent.options.model } } catch (e) {} if (params.provider) o.provider = params.provider; if (params.model) o.model = params.model; return o }
  /**
   * Drop filter names this host does not register. `known` comes from the host's
   * own rejection message, which lists every registered global tool, so this
   * never guesses. Returns undefined when nothing usable remains.
   */
  /** The host names the offending tools and then lists the registered ones. */
  function buildToolFilter(role) { const allow = role === 'solver' ? params.solverToolAllow : role === 'verifier' ? params.verifierToolAllow : undefined; const deny = role === 'solver' ? params.solverToolDeny : role === 'verifier' ? params.verifierToolDeny : undefined; const net = role === 'solver' ? params.solverAllowNetwork : role === 'verifier' ? params.verifierAllowNetwork : undefined; const scr = role === 'solver' ? params.solverAllowScripts : role === 'verifier' ? params.verifierAllowScripts : undefined; let a = Array.isArray(allow) ? allow.slice() : []; let d = Array.isArray(deny) ? deny.slice() : []; const netTools = composedToolList(NETWORK_TOOLS); const scrTools = composedToolList(SCRIPT_TOOLS); if (net === false) d = d.concat(netTools); else if (net === true && a.length > 0) a = a.concat(netTools); if (scr === false) d = d.concat(scrTools); else if (scr === true && a.length > 0) a = a.concat(scrTools); const f = {}; if (a.length > 0) f.allow = a; if (d.length > 0) f.deny = d; return (f.allow || f.deny) ? f : undefined }
  async function spawnChild(label, promptText, meta) {
    const request = { prompt: [textBlock(promptText)], parent: rootAgent, agentOptions: childAgentOptions() }
    const tf = buildToolFilter(meta && meta.role); if (tf) request.toolFilter = tf
    let started
    try { started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) }
    catch (e) {
      const message = String((e && e.message) || e)
      // The host rejected the filter because it names tools this deployment does
      // not register. It tells us exactly which names are valid, so drop the
      // invalid ones and retry ONCE. This is NOT the old fail-open behaviour:
      // every name the user asked to deny that DOES exist is still denied, and a
      // deny-list can only ever shrink to names that do not exist here.
      // (The old behaviour deleted the whole filter, silently granting network
      // and script access the operator had explicitly forbidden.)
      const known = registeredToolsFromError(message)
      const retryFilter = request.toolFilter ? sanitizeToolFilter(request.toolFilter, known) : undefined
      const changed = request.toolFilter && JSON.stringify(retryFilter) !== JSON.stringify(request.toolFilter)
      // FAIL CLOSED on an unusable sanitized filter. Retrying WITHOUT a filter would
      // start the child unrestricted, which is the opposite of what the operator asked
      // for; retrying with an empty one would deny every tool. Neither is acceptable,
      // so report the stale configuration and refuse to spawn this child.
      if (request.toolFilter && retryFilter === undefined) {
        console.error('vibe-math-v2: the configured tool permission filter names ONLY tools this host does not register, so it cannot be honored; refusing to spawn WITHOUT a filter (that would grant the very access the operator denied). filter=' + JSON.stringify(request.toolFilter) + ' host said: ' + message)
        throw e
      }
      if (!changed) {
        if (request.toolFilter) console.error('vibe-math-v2: startContinuable with toolFilter failed (NOT retrying without the permission filter, to avoid silently granting unrestricted tools): ' + message)
        throw e
      }
      console.error('vibe-math-v2: tool permission filter named tools this host does not register; retrying with only registered names (denied-tool intent preserved). dropped=' + JSON.stringify(request.toolFilter) + ' kept=' + JSON.stringify(retryFilter))
      const retryRequest = Object.assign({}, request)
      retryRequest.toolFilter = retryFilter
      try { started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: retryRequest, signal: makeSignal(30000) }) }
      catch (e2) {
        console.error('vibe-math-v2: startContinuable retry with sanitized toolFilter also failed: ' + String((e2 && e2.message) || e2))
        throw e2
      }
    }
    const registered = Object.assign({ createdAt: now() }, meta || {})
    // 验证者的**稳定身份**随 meta 一起登记：forced 模式的历史准确率必须能跨 child 复用（审计 H4）。
    if (registered.role === 'verifier' && !registered.verificationKey) registered.verificationKey = verifierIdentityKey()
    agentRegistry[started.childId] = registered
    childOwner.set(started.childId, sessionId)
    // 并发计数由 agentRegistry 推导，此处无需手工 +1（见 activeCount()）。
    await saveAll(); return started.childId
  }
  // DSH continuable-wake API is subagents.sendMessage(sender, targetId, content, {signal}); subagents.followup
  // does NOT exist on the subagents service (it is only Agent.followup). Calling the missing method threw
  // TypeError and made every wake fail silently. Prefer sendMessage, fall back to a legacy followup.
  async function followupChild(childId, promptText) {
    const blocks = [textBlock(promptText)]
    try {
      if (typeof subagents.sendMessage === 'function') await subagents.sendMessage(rootAgent, childId, blocks, { signal: makeSignal(30000) })
      else if (typeof subagents.followup === 'function') await subagents.followup(rootAgent, childId, blocks, { source: { kind: 'user' }, signal: makeSignal(30000) })
      else throw new Error('no subagent continuation API')
    } catch (e) { console.error('vibe-math-v2: wake ' + childId + ' failed: ' + String((e && e.message) || e)); throw e }
    // 不再手工累加并发计数：唤醒的是 registry 里已登记的 child，计数已由 registry 长度体现。
    await saveAll()
  }
  async function interruptChild(childId) { try { subagents.interrupt(childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) {} }

  // ================= prompts =================
  function solverPersonaText() { return params.solverPersona ? (String(params.solverPersona) + '\n\n') : '' }
  function verifierPersonaText() { return params.verifierPersona ? (String(params.verifierPersona) + '\n\n') : '' }
  function explorerPersonaText() { return params.explorerPersona ? (String(params.explorerPersona) + '\n\n') : '' }
  // 共享知识/数据模型说明（点6）：完整解释各对象/属性含义、概率语义、文件夹用途、输出要求。
  // 空参数 = 使用内置完整版；非空 = 由用户覆盖（点8）。
  function defaultKnowledgeContext() {
    return 'KNOWLEDGE BASE & DATA MODEL (definition contract you MUST follow):\n' +
      '\n1) PROBABILITY SEMANTICS — the single most important rule:\n' +
      '- 正确概率 / 布尔估计 ∈ [0,1]。\n' +
      '- 1 = 绝对正确（已被证明且验证通过）：你可以把它当作已知事实/可信结论直接用于推理。\n' +
      '- 0 = 绝对错误（已被证伪且验证通过）。\n' +
      '- 0 与 1 之间的任何值 = 未定论/待验证：只能作为参考证据，绝不能当作已成立的事实引用。\n' +
      '- Verified/ 中的卡片概率恒为 1 或 0，内容可信、可直接引用。\n' +
      '\n2) OBJECT MODELS (按实现方案)：\n' +
      '- 问题 PROBLEM（qs/qs.json）：{ id, 概述（完整问题陈述，所提到的每个对象/记号都要给出完整定义）, 已解决(bool), 解法列表:[{ 完整解法（详细步骤）, 正确概率, 已验 }], 优先级（整数，越小越优先调度；"never"=永不调度）, progress（历史：已试方向、各方向路线、阻碍及原因、教训、可行性评估）}。\n' +
      '- 命题 PROPOSITION（Propos/<分类>_Propos.json）：{ id, 概述（完整陈述）, 布尔估计（该命题为真的概率）, 细类型（分类 JSON）, 证明列表:[{ 完整过程（完整证明）, 正确概率, 支持信息/依据 }], 证伪列表:[{ 完整过程（完整证伪）, 正确概率, 支持信息/依据 }], 优先级, 价值/关键性（0-1，重要性）, progress（过往尝试与教训）}。\n' +
      '- 收口规则：问题的某个解法 正确概率=1 → 问题已解决；命题的证明/证伪条目 正确概率=1 → 命题布尔估计=1/0（已定论）。\n' +
      '\n3) FOLDERS (per project, VibeMath/Projects/<project>/)：\n' +
      '- qs/qs.json：问题清单——求解与验证的唯一问题来源。\n' +
      '- Propos/<分类>_Propos.json：命题知识库（已有认知）。\n' +
      '- Reliable/：可信参考文献（只读）。\n' +
      '- Verified/<分类>_Verified.json：定论事实索引——布尔估计=0/1 的命题卡片与已解决问题卡片；内容可信、可直接使用。\n' +
      '- Verification_logs/：辩论记录。Progress_Logs/：进度与报告。VibeMath_State/：调度器私有状态——不要读也不要改。\n' +
      '\n4) OUTPUT REQUIREMENTS (你输出的每个对象必须满足)：\n' +
      '- 完整性、不断章取义：任何你写出的问题/命题/结论都要给出完整陈述，并把它所依赖的对象、环境、背景、定义全部补全（例如提到某个序列/函数/定理时给出其完整定义与假设）。\n' +
      '- 引用溯源：若你引用了 qs/qs.json、Propos/、Verified/、Reliable/ 中已有的命题/引理/结论/解法，必须给出出处——具体文件路径（相对项目根，如 Propos/数论_Propos.json 或 Verified/未分类_Verified.json）+ 对象 id 或 JSON 路径（如 .证明列表[0] 或 .directions[1]）；没有出处的引用一律不允许。你自己新提出的结论则必须自带完整定义，不得引用未定义的内容。\n' +
      '- 若结论依赖某个临时假设 p，必须显式写成「若 <p 的完整陈述> 成立，则：...」（同样要定义完整）。\n' +
      '- 只输出规定的 JSON（放在 ```json 代码围栏内），JSON 之外不写任何内容。\n' +
      '- 示例（完整问题 概述）："设 {a_n} 为非负实数序列（n≥1），满足：对任意正整数 n 都存在 i,j 使 |a_i − a_j| = 1/n^p（p>0 为实参数）。判断：p 在什么范围内保证级数 ∑_{n=1}^∞ a_n 发散？" —— 每个记号（序列、参数、级数）都在句内定义完整，读它的人无需再查背景。\n' +
      '- 示例（完整命题 概述）："设函数 f:[0,1]→R 连续，则 f 在 [0,1] 上有界（连续性按 ε-δ 定义，有界性按标准实数分析定义）。" —— 概念与对象定义完整，不引用未定义的记号。\n'
  }
  function knowledgeContextText() { const k = params.knowledgeContext ? String(params.knowledgeContext) : defaultKnowledgeContext(); return k ? ('\n' + k + '\n') : '' }
  // 平时工作提示词里的"顺手形式化"段落。**off 档必须返回空串**：off 是真正的无操作，
  // 提示词里不能出现任何 Lean 字样（contract §2 / §10.1）。
  function formalWorkSection() {
    const t = formalWorkLine()
    const notice = leanNoticeSection()
    const math = mathWorkLine()
    if (!t && !notice && !math) return ''
    // 回执契约（契约 §6.3）：工作轮也必须被告知 formal 字段，否则"顺手形式化"里做出的难度判断
    // 无处可写，代理只能沉默——那正是 v2 首版死通道的成因。
    // 数学计算可用性行（prompts.md §2+§4）：与"顺手形式化"并列注入；off 档为空串。
    return '\n' + t + formalReplyNote() + notice + math + '\n'
  }
  function capabilitiesText(role) {
    const maxCalls = role === 'solver' ? params.solverMaxToolCalls : params.verifierMaxToolCalls
    const netOn = role === 'solver' ? params.solverAllowNetwork : params.verifierAllowNetwork
    const scrOn = role === 'solver' ? params.solverAllowScripts : params.verifierAllowScripts
    const toolParts = []
    if (netOn !== false) toolParts.push('web search / literature lookup')
    if (scrOn !== false) toolParts.push('symbolic/numeric computation (running scripts)')
    let t = '\nYOUR PERMISSIONS / CAPABILITIES:\n'
    t += '- Network tools (web search / fetch): ' + (netOn === false ? 'DISABLED for you' : 'available') + '; Script/shell tools (' + SCRIPT_TOOLS.join('/') + '): ' + (scrOn === false ? 'DISABLED for you' : 'available') + ' (your actual tool list is enforced by the framework).\n'
    t += toolParts.length > 0
      ? ('- You may use external tools (' + toolParts.join(', ') + ') to assist; ' + ((maxCalls && Number(maxCalls) > 0) ? ('as a guideline, keep external tool calls to about ' + maxCalls + ' this round (advisory: the framework does not enforce a hard quota).\n') : 'no per-round limit by default.\n'))
      : '- External tools: none enabled for you this round.\n'
    t += '- You may READ any file under Verified/ as a known, trusted dependency (resolved facts).\n'
    t += '- You should BASE your reasoning on the existing knowledge under Propos/ (propositions with proofs/refutations and probabilities) and Reliable/ (trusted references).\n'
    t += '- You must NOT write files directly: return structured JSON only — the scheduler is the single writer.\n'
    t += '\nHOW TO READ EXISTING KNOWLEDGE (coarse scan → fine read):\n'
    t += '- These are JSON files. A conclusion object carries summary-index fields (概述 / 布尔估计 / 优先级) and the full detail (证明列表 / 证伪列表 / 完整过程 / progress).\n'
    t += '- COARSE SCAN first: use a read/grep tool to extract ONLY the summary index (概述, 布尔估计, 优先级, titles) to locate which files / objects look relevant — do NOT load full proofs yet.\n'
    t += '- FINE READ after: once you identify a valuable object, read that file again and extract its full JSON (完整过程 / 证明 / 证伪 / progress) via the index you found.\n'
    return t
  }
  function explorerPrompt(q) {
    return explorerPersonaText() + 'You are a research mathematician orchestrating strategy for one problem.\n\nPROBLEM (id: ' + q.id + '): ' + q.概述 + '\n\n' +
      knowledgeContextText() +
      capabilitiesText('solver') +
      formalWorkSection() +
      '\nDo a first-stage METACOGNITIVE BRAINSTORM: decompose constraints, test boundary/extreme cases, map to similar known problems. ' +
      'Then propose 3-6 DIVERSE, mutually distinct solution directions (e.g. analytic method, constructive proof, contradiction, numeric approximation + limit passage, categorical abstraction, ...). ' +
      'Record each direction with its core assumption and an initial feasibility estimate.\n\n' +
      'feasibility ∈ [0,1]: your estimate of the probability this direction leads to a full solution. Every direction must be self-contained and unambiguous: title / method / core_assumption written completely, defining every object they mention — no 断章取义, no undefined symbols.\n\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n' +
      '{"directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5}]}'
  }
  function rederivePrompt(q, prog) {
    const prior = prog.directions.map(function (d) {
      return '- ' + d.id + '「' + d.title + '」status=' + d.status + ' round=' + d.round + ' survival=' + d.survival + (d.dead_end_reason ? ' [blocker: ' + d.dead_end_reason + ']' : '') +
        (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '')
    }).join('\n')
    return explorerPersonaText() + 'You are a research mathematician re-deriving strategy for a problem whose prior directions stalled or failed.\n\nPROBLEM (id: ' + q.id + '): ' + q.概述 + '\n\nPRIOR DIRECTIONS (with blockers):\n' + prior + '\n' +
      knowledgeContextText() +
      capabilitiesText('solver') +
      formalWorkSection() +
      '\nQuantitatively analyze the historical progress, blocker causes, and feasibility decay of each prior direction. Discard directions already proven to be dead ends (unless a new tool/idea changes that). ' +
      'Then deeply DERIVE 1-3 BRAND-NEW directions never tried before, each with a one-line motivation. ' +
      'Finally return the UNION of high-potential leftover directions and the brand-new directions as the new direction set M_q (drop dead ends).\n\n' +
      'feasibility ∈ [0,1] as above. Every returned direction (kept or new) must be self-contained and unambiguous, with complete definitions — no 断章取义.\n\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n' +
      '{"directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5,"motivation":"..."}]}'
  }
  function directionSummary(d) {
    return 'id ' + d.id + '「' + d.title + '」method=' + d.method + ' | round=' + d.round + ' status=' + d.status +
      ' survival=' + d.survival +
      (d.lemmas && d.lemmas.length ? ' | lemmas: ' + d.lemmas.map(function (l) { return '「' + l.title + '」(' + l.id + ')' }).join('; ') : '') +
      (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '') +
      (d.lessons && d.lessons.length ? ' | lessons: ' + d.lessons.join('; ') : '') +
      (d.blockers && d.blockers.length ? ' | blockers: ' + d.blockers.join('; ') : '')
  }
  // 每个 solver 可见的方向总数 = directionsPerSolver（默认 1 = 只看自己方向，互不干扰）。
  // round 1 时自己的方向由 DIRECTION 行给出、占用 1 个名额；round>1 时自己的历史进度摘要占用 1 个名额；
  // 其余名额填充其他活跃方向摘要（n=3 → 自己 + 最多 2 个其他方向）。
  function buildSolverContext(all, own, round, perSolver) {
    const out = []
    const n = Math.max(1, Number(perSolver) || 1)
    let slots = n
    if (round > 1) { out.push(own); slots -= 1 }
    else slots -= 1 // round 1：自己的方向已由 DIRECTION 行给出
    const others = all.filter(function (d) { return d.id !== own.id && d.status === 'active' })
    for (let i = 0; i < others.length && slots > 0; i++) { out.push(others[i]); slots -= 1 }
    return out.map(directionSummary).join('\n')
  }
  function solverPrompt(q, dir, round, progressText) {
    let head = solverPersonaText() + 'You are a dedicated solver agent working ONE solution direction of a math problem (agent_self_iteration).\n\n'
    head += 'PROBLEM (id: ' + q.id + '): ' + q.概述 + '\nDIRECTION: ' + dir.title + ' (method: ' + dir.method + '; core assumption: ' + dir.core_assumption + ')\nROUND: ' + round + ' of ' + params.solverMaxRounds + '\n'
    if (round > 1 || (progressText && progressText.length)) head += '\nYOUR PRIOR PROGRESS / OTHER DIRECTIONS:\n' + progressText + '\n'
    head += knowledgeContextText()
    head += capabilitiesText('solver')
    head += formalWorkSection()
    head += '\nStart from the last recorded node of direction ' + dir.id + ' (inherit progress, or branch a sub-route under it). Each round you MUST produce, even if incomplete:\n' +
      '- new lemmas / intermediate conclusions WITH full proofs (these go to the Propos/ knowledge base);\n' +
      '- each concrete sub-route tried, its progress overview, an EXPLICIT feasibility signal (e.g. "unremovable singularity", "conflicts with known theorem X"), and any blocker;\n' +
      '- lessons learned from failed attempts (what to avoid, what did not work and why);\n' +
      '- an updated survival probability for this direction.\n'
    head += '\nIf you encounter an EXTREMELY complex auxiliary conjecture/sub-problem q_sub: list it in "sub_questions" as a PROBLEM-class object with its COMPLETE statement (every object/definition/notation it mentions must be fully defined — never quote partially, 不断章取义), together with p_{q-tmp}: a PROPOSITION-class TEMPORARY ASSUMPTION that is one possible answer to q_sub. TEMPORARILY ASSUME p_{q-tmp} holds and continue the main line — every later proposition/conclusion that depends on this assumption MUST be stated as "若 <p_{q-tmp} 的完整陈述> 成立，则：..." (with complete definitions). The scheduler registers q_sub and the problem "判断下述命题是否成立：p_{q-tmp}" in the problem list, and p_{q-tmp} in the proposition base.\n'
    head += '\nIMPORTANT — PROBABILITY RULES FOR NEW RESULTS: any 布尔估计 / solution_probability / survival_probability you output for NEW results must be strictly BETWEEN 0 and 1 (they await independent verifier confirmation). NEVER mark your own fresh lemma or solution as 1 or 0 — that is the verifiers\' job. Only facts already recorded in Verified/ (or 正确概率=1 entries you READ from files) count as certain.\n'
    head += '- Each lemma you output must carry a COMPLETE statement ("statement") and a COMPLETE proof ("proof"): define every object/notation it uses — no 断章取义, no undefined symbols. If a lemma/conclusion references or is derived from existing knowledge (Propos/Verified/Reliable/qs files), state the source file path + object id / JSON path inside the statement — no unsourced references.\n'
    head += '\nIf you obtain a COMPLETE solution: adversarially self-check (construct counterexamples, test boundary conditions) BEFORE declaring success; put the full solution text in "solution".\n'
    head += '\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n' +
      '{"status":"continue|success|dead-end","solution":"complete solution text, or null","solution_probability":0.85,"lemmas":[{"title":"...","statement":"...","proof":"...","细类型":{"分类名":{}},"布尔估计":0.6,"价值/关键性":0.5,"优先级":1}],"routes":[{"title":"...","progress":"...","feasibility_signal":"...","blocker":"..."}],"lessons":["..."],"survival_probability":0.5,"dead_end_reason":"... or null","sub_questions":[{"q_sub_title":"...","q_sub_statement":"完整问题陈述(含所有对象/定义)","assumption_title":"p_{q-tmp} 标题","assumption_statement":"完整假设陈述(含所有定义)"}]}'
    return head
  }
  // 验证提示词里的形式化段落（review 与 debate 两条路径都必须带）。**off 档返回空串**。
  // 形式化记录以「验证对象」为键（rId，例如 r-p1 或 r-q1-s0）——这正是 vibe_math_lean_archive 的 target，
  // 于是"归档了证明 → 下一条验证提示词自动切换成忠实性审查"这条因果链闭合。
  function formalVerifySection(r) {
    if (!formalOn()) return ''
    const block = formalPromptBlock(r && r.rId)
    if (!block) return ''
    const rec = formalGateRecord(r && r.rId)
    const L = [block]
    // 把"审查对象变了"这件事说透：手里已有机器核对过的证明时，重新推导是浪费，
    // 真正的风险是"这段代码说的不是我们想说的"。
    if (rec.status === 'passed') {
      // 忠实性审查的**判定指引**：形式化与命题原文不一致时，那是"形式化不合格"，**不是**命题为假。
      // 让它"发现偏离就投 0"会伪造出一个错误的否定结论（契约 §4.1），所以这里明确禁止投 0，
      // 并给出 `defect` 回执——框架据此撤回证明、写入待办、本次裁定不定论。
      L.push('  ▸ 一致 → Result = 1。')
      L.push('  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：')
      L.push("      ① Result 给一个严格介于 0 与 1 之间的值（记为弃权），并在 Reason 里写清偏差；")
      L.push("      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的")
      if (formalMode() === 'require') {
        // 这一档真的有门禁，所以"本次裁定**不定论**"是框架**能兑现**的承诺（契约 §6.1）。
        L.push('         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办），本次裁定**不定论**；')
      } else {
        // encourage 档没有门禁：撤回证明 ≠ 搁置裁定。承诺一个框架无法强制的"不定论"，会让表决者
        // 以为不必自己弃权——那正是"提示词承诺的强度档位必须与实现一致"这条不变式（契约 §4.1 第 3 条
        // / §6.1，审计清单 §1.7）。这里如实说明：阻止本轮定论的是**你的弃权值**。
        L.push('         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）。**本档没有门禁**：')
        L.push('         框架不会强制搁置本次裁定——请务必给出①里的弃权值，靠它阻止本轮得出布尔一致结论；')
      }
      L.push('         修正形式化并重新跑通后再投票。')
      L.push('  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 Reason 里写清独立理由。')
    } else if (rec.status === 'blocked') {
      L.push('  ▸ 因此请把 Result 用在"这个阻塞判断是否成立 / 是否仍有别的形式化路线"上，并给出理由。')
    } else {
      L.push('  ▸ 若你在本轮把它形式化并跑通（vibe_math_lean_archive kind=\'proof\'），后续轮次的审查对象')
      L.push('    就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。')
    }
    return '\n' + L.join('\n') + '\n'
  }
  /**
   * 需求 5：依赖临时假设的结论必须把假设**显式**写出来（"若 p_{q-tmp} 成立，则…"）。记录在命题上
   * （`依赖假设`）之后，还要把它**送到验证者眼前**——否则验证者会在不知道前提未定的情况下裁决它。
   */
  function assumptionNote(r) {
    if (!r || !r.依赖假设) return ''
    return '\nDEPENDENCY: this conclusion is stated UNDER the temporary assumption ' + r.依赖假设
      + '（' + (r.依赖假设已证伪 ? '该假设**已被证伪**：依赖它的结论必须重新审视' : '该假设尚未定论，0 < 布尔估计 < 1') + '）。'
      + ' The assumption is a SEPARATE object: a verdict on this conclusion is NOT a verdict on the assumption.\n'
  }
  function verifierReviewPrompt(r) {
    let target = ''
    if (r.kind === 'proposition') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    else if (r.kind === 'prop-proof') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    else target = 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
    return verifierPersonaText() + 'You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.\n\nTARGET (r: ' + r.kind + '):\n' + target + '\n' +
      assumptionNote(r) +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      formalVerifySection(r) +
      '\nResult ∈ [0,1] = your probability that the TARGET is CORRECT: 1 ONLY when you are fully certain (for a bare proposition: Reason must be a complete proof; for a proof/refutation/solution: you verified every step and Reason confirms the whole chain); 0 ONLY when you are certain it is wrong (Reason must be a rigorous complete refutation / pinpoint the fatal flaw); otherwise a value strictly between 0 and 1.\n' +
      '\nIndependently output your initial review. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"detailed logic chain, potential counterexample, or supporting evidence"' + formalJsonField(r && r.rId) + '}'
  }
  function verifierDebatePrompt(r, transcript) {
    let target = ''
    if (r.kind === 'proposition') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    else if (r.kind === 'prop-proof') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    else target = 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
    return verifierPersonaText() + 'You are one reviewer in a DEBATE ("交流群") about this object.\n\nTARGET:\n' + target + '\n' +
      assumptionNote(r) +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      formalVerifySection(r) +
      '\nFULL DEBATE HISTORY SO FAR (每轮所有评审轮流发言的记录):\n' + transcript + '\n' +
      '\nRespond to the others (agree / rebut / add new evidence, referencing earlier rounds if needed). If you changed your Result because of them, state the reason explicitly.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"updated logic chain / counterexample / proof / refutation","changed":"brief reason if you changed your Result, else null"' + formalJsonField(r && r.rId) + '}'
  }

  // ================= decisions (manual/auto) =================
  function enqueueDecision(node, contextText, data) { const d = { id: uuid(), node: node, context: contextText, data: data, status: 'pending', resolution: null, createdAt: now() }; decisionQueue.push(d); return d }
  async function maybeGate(node, contextText, data, autoFn) { if (params.mode === 'auto') return await autoFn(data); const d = enqueueDecision(node, contextText, data); scheduler.gate = { decisionId: d.id, node: node }; logActivity('gate', node + ': ' + contextText); await saveAll(); return { gated: true, decisionId: d.id } }
  async function applyDecision(node, data, resolution) {
    if (node === 'spawn') {
      if (resolution.action === 'approve') { await spawnChild(data.label, data.promptText, data.meta); return { spawned: true } }
      try {
        const meta = data.meta || {}
        if (meta.role === 'explorer' && meta.qid) {
          const q = await findQ(meta.qid)
          if (q) { const prog = parseProgress(q); prog.directions.push({ id: 'd_' + shortId(), title: '用户拒绝派发', method: '', core_assumption: '', feasibility: 0, status: 'dead-end', round: 0, survival: 0, routes: [], blockers: [], dead_end_reason: 'explorer 派发被用户拒绝' }); await saveProgress(meta.qid, prog) }
        } else if (meta.role === 'solver' && meta.qid && meta.direction) {
          const q = await findQ(meta.qid)
          if (q) { const prog = parseProgress(q); const d = prog.directions.find(function (x) { return x.id === meta.direction }); if (d) { d.status = 'dead-end'; d.dead_end_reason = '求解器派发被用户拒绝' } await saveProgress(meta.qid, prog) }
        }
      } catch (e) { console.error('vibe-math-v2: spawn reject mark failed: ' + String((e && e.message) || e)) }
      return { spawned: false, rejected: true }
    }
    if (node === 'verdict') { const overridden = resolution.action === 'override' && (resolution.verdict === 1 || resolution.verdict === 0); const v = overridden ? Number(resolution.verdict) : data.verdict; const applied = await settleVerdict(data.task, v); delete tasks[data.task.id]; return { verdict: v, overridden: overridden, applied: applied } }
    return {}
  }
  async function resolveDecision(id, resolution) { const d = decisionQueue.find(function (x) { return x.id === id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; d.status = 'resolved'; d.resolution = resolution; if (scheduler.gate && scheduler.gate.decisionId === id) scheduler.gate = null; logActivity('decide', id + ' resolved: ' + resolution.action + (resolution.verdict !== undefined ? ' ' + resolution.verdict : '')); await saveAll(); scheduleTick(); return { ok: true, message: 'decision resolved' } }
  /**
   * 清掉 gate 时**必须结清它指向的那个人工决策**（审计 M10）。start/resume/abort/切项目都会离开
   * 需要那次决策的运行，而决策若仍是 `pending`，它会永远留在 `vibe_math_list_decisions` 里反复出现——
   * 一个已经无人等待的节点看起来仍然等待人工输入。与 `dropStaleGate` 互补：那条处理"决策没了但 gate
   * 还在"，这条处理"gate 没了但决策还在"。
   * 注意 `pauseScheduler` **不**清 gate：暂停期间那次决策仍然有效（人还可以 vibe_math_decide），
   * 只有真正离开它（resume/abort/重启/换项目）才作废；作废是终态，不会再回到 pending。
   */
  function abandonGatedDecision(why) {
    const g = scheduler.gate
    scheduler.gate = null
    if (!g) return
    const d = decisionQueue.find(function (x) { return x.id === g.decisionId })
    if (d && d.status === 'pending') {
      d.status = 'resolved'
      d.resolution = { action: 'abandoned', reason: why }
      logActivity('gate', 'gated decision ' + g.node + '/' + d.id + ' 已作废（' + why + '）——不再挂起等待人工输入')
    }
  }

  // ================= scheduler core =================
  function scheduleTick() { tick().catch(function (e) { console.error('vibe-math-v2 tick error: ' + String((e && e.stack) || e)) }) }
  function dropStaleGate() {
    const g = scheduler.gate
    if (!g) return
    const d = decisionQueue.find(function (x) { return x.id === g.decisionId })
    if (d === undefined || d.status !== 'pending') {
      logActivity('gate', 'cleared stale gate (' + g.node + '/' + g.decisionId + ' is ' + (d === undefined ? 'gone' : d.status) + ')')
      scheduler.gate = null
    }
  }
  async function tick() {
    if (tickInFlight) return; if (!rootAgent) return; if (!scheduler.running) return
    // 自愈：gate 指向的决策若已不存在或已 resolved，就清掉再继续，而不是永久早退。
    dropStaleGate()
    if (scheduler.gate) return
    tickInFlight = true
    lastTickAt = now()
    try {
      await processStatusUpdates()
      await processPriorityAdjust()
      await processPromote()
      await processVerify()
      await reconcileVerify()
      await processSolve()
      await maybePushReport(false)
      await maybeWriteReport(false)
      const qs = await getQs()
      const unsolved = qs.filter(function (q) { return !q.已解决 && q.优先级 !== 'never' })
      // 收口判据（spec v2 §A2/§A3）：**排除**论文撰写子代理——它自己不能阻止收口，也不该被算作"在途工作"。
      const realAgents = Object.keys(agentRegistry).filter(function (cid) { const m = agentRegistry[cid]; return m && m.role !== 'paper' }).length
      if (unsolved.length === 0 && realAgents === 0 && Object.keys(tasks).length === 0) {
        logActivity('stop', 'all active problems solved (never-priority problems excluded) and no active agents/tasks — scheduler stopped (strict termination)')
        // ★ 最终论文（修订 §A2）：**必须在 running=false 之前**派遣——停止之后 scheduleTick() 是空操作，
        //   而且 v2 没有任何激活上限处理，被拒的撰写者会静默消失；派不出去就排队，由 apply 级心跳重试。
        if (params.finalPaper !== false) {
          try { await maybeWritePaper('auto') } catch (e) { logActivity('paper', '自动撰写最终论文失败：' + String((e && e.message) || e)) }
        }
        scheduler.running = false
        await saveAll(); await maybeWriteReport(true); await maybePushReport(true)
      } else if (realAgents === 0 && Object.keys(tasks).length === 0 && unsolved.length > 0) {
        let allBlocked = true
        for (let i = 0; i < unsolved.length; i++) {
          const prog = parseProgress(unsolved[i])
          const exhaustedAll = prog.directions.length > 0 && prog.directions.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
          const hasActive = prog.directions.some(function (d) { return d.status === 'active' })
          const blocked = (prog.directions.length === 0 || exhaustedAll) && (explorerRetries[unsolved[i].id] || 0) >= (Number(params.maxExplorerRetries) || 3)
          if (hasActive || !blocked) { allBlocked = false; break }
        }
        if (allBlocked) {
          scheduler.running = false
          logActivity('stall', 'no feasible direction remains for any unsolved problem — scheduler paused (stalled, NOT all solved)')
          await saveAll(); await maybeWriteReport(true)
        }
      }
    } finally { tickInFlight = false }
  }
  // note 4: probability-1 rules
  //
  // ★ 这里同时是 require 门禁在"自动收口"路径上的落点：一个 1/0 概率的对象要先拿到
  //   卡片写入许可（writeVerifiedCardIfNeeded / writeVerifiedProblemCardIfNeeded）才允许
  //   真的把 布尔估计 / 已解决 / 优先级 提升上去。否则"搁置"就只是没写卡片，而对象已经
  //   被标成定论了——门禁形同虚设。
  async function processStatusUpdates() {
    const qs = await getQs()
    let qsChanged = false
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      if (q.解法列表 && q.解法列表.some(function (s) { return s.正确概率 === 1 })) {
        if (!q.已解决) {
          const card = await writeVerifiedProblemCardIfNeeded(q, true)
          if (card.deferred) continue // 被门禁搁置：保持未解决、优先级不变（卡片与提升都不写）
          qsChanged = true
        }
        q.已解决 = true; q.优先级 = 'never'
      }
    }
    if (qsChanged) { await writeQs(qs); logActivity('update', 'problems marked solved by probability-1 solutions') }
    const propos = await getPropos()
    let closedPromoted = false
    for (let i = 0; i < propos.length; i++) {
      const p = propos[i]
      let pChanged = false
      const proofOne = (p.证明列表 || []).some(function (x) { return x.正确概率 === 1 })
      const refuteOne = (p.证伪列表 || []).some(function (x) { return x.正确概率 === 1 })
      const targetBE = proofOne ? 1 : (refuteOne ? 0 : null)
      const atConclusion = targetBE !== null || p.布尔估计 === 1 || p.布尔估计 === 0
      let cardWritten = false
      if (atConclusion) {
        const card = await writeVerifiedCardIfNeeded(p, targetBE === null ? p.布尔估计 : targetBE)
        if (card.deferred) continue // 被门禁搁置：布尔估计/优先级都不提升，"僵尸"问题也不关（它并未定论）
        cardWritten = cardOk(card)
      }
      if (targetBE !== null && p.布尔估计 !== targetBE) { p.布尔估计 = targetBE; pChanged = true }
      // 这个对象**现在**取得了布尔定论：用它给此前那些还没被检验过的评审回溯计分（forced 权重）。
      if (targetBE !== null) await scorePendingReviews(p.id, targetBE)
      if ((p.布尔估计 === 1 || p.布尔估计 === 0) && p.优先级 !== 'never') { p.优先级 = 'never'; pChanged = true }
      if (cardWritten) pChanged = true
      if (p.布尔估计 === 1 || p.布尔估计 === 0) {
        // 源命题已定论 → 关闭其晋升出的"僵尸"问题（优先用 判断命题 字段；兼容旧文本标记数据）
        for (let j = 0; j < qs.length; j++) {
          const qj = qs[j]
          if (qj.已解决) continue
          if (qj.判断命题 === p.id) { qj.已解决 = true; qj.优先级 = 'never'; closedPromoted = true }
          else if (String((qj.progress && typeof qj.progress === 'object' ? (qj.progress.来源命题 || '') : qj.progress) || '').indexOf(p.id) !== -1) { qj.已解决 = true; qj.优先级 = 'never'; closedPromoted = true }
        }
      }
      // 需求 5 第二半：「若该假设被证伪，则依赖它的主线结论需重新审视」。假设的布尔估计被判定为 0 时，
      // 把依赖它的结论标记出来并**重新放回验证候选**（清掉 已验 / 冷却时间戳），否则那句承诺只是一句
      // 空话——依赖关系记下了却没人据此行动（审计 M16）。
      if (p.布尔估计 === 0) {
        for (let j = 0; j < propos.length; j++) {
          const depP = propos[j]
          if (depP === p || depP.id === p.id) continue
          if (depP.依赖假设 !== p.id || depP.依赖假设已证伪) continue
          depP.依赖假设已证伪 = true
          depP.已验 = false
          depP.最近验证时间 = 0
          await upsertProposition(depP)
          logActivity('dependency', '假设 ' + p.id + ' 被证伪：依赖它的结论 ' + depP.id + ' 标记为需重新审视，已重新进入验证候选')
        }
      }
      if (pChanged) await upsertProposition(p)
    }
    if (closedPromoted) { await writeQs(qs); logActivity('update', 'promoted problems closed because their source proposition resolved') }
  }
  async function processPriorityAdjust() {
    const mode = params.priorityAdjust || 'none'
    if (mode !== 'none') {
      const qs = await getQs()
      let changed = false
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i]
        if (q.已解决 || q.优先级 === 'never') continue
        const prog = parseProgress(q)
        if (mode === 'deadend-deprioritize') {
          if (prog.directions.length > 0 && prog.directions.every(function (d) { return d.status === 'dead-end' })) {
            const cur = Number(q.优先级); if (Number.isFinite(cur) && cur < 10) { q.优先级 = 10; changed = true }
          }
        } else if (mode === 'survival-map') {
          if (prog.directions.length > 0) {
            const maxSurv = Math.max.apply(null, prog.directions.map(function (d) { return Number(d.survival) || 0 }))
            const target = Math.round(Math.max(0, Math.min(10, 10 - 10 * maxSurv)))
            if (q.优先级 !== target) { q.优先级 = target; changed = true }
          }
        }
      }
      if (changed) { await writeQs(qs); logActivity('priority', 'priorities auto-adjusted (' + mode + ')') }
    }
    const pMode = params.proposPriorityAdjust || 'none'
    if (pMode === 'progress-graded') {
      const propos = await getPropos()
      const changedProps = []
      for (let i = 0; i < propos.length; i++) {
        const p = propos[i]
        if (p.布尔估计 === 1 || p.布尔估计 === 0 || p.优先级 === 'never') continue
        const closeness = Math.abs(Number(p.布尔估计) - 0.5)
        const material = Math.min(5, (p.证明列表 || []).length + (p.证伪列表 || []).length)
        const score = closeness * 1.2 + material * 0.08
        const target = Math.round(Math.max(0, Math.min(10, 10 - 10 * score)))
        const cur = Number(p.优先级)
        if (Number.isFinite(cur) && cur !== target) { p.优先级 = target; changedProps.push(p) }
      }
      if (changedProps.length > 0) {
        for (let i = 0; i < changedProps.length; i++) await upsertProposition(changedProps[i])
        logActivity('priority', 'proposition priorities auto-adjusted (progress-graded)')
      }
    }
  }
  // note 3 + user 价值 field: promote high-value unresolved propositions into qs.json
  async function processPromote() {
    if (activeCount() >= params.maxParallelThreshold) return
    const qs = await getQs()
    const qDescriptions = qs.map(function (q) { return q.概述 })
    const propos = await getPropos()
    for (let i = 0; i < propos.length; i++) {
      const p = propos[i]
      if (p.布尔估计 === 1 || p.布尔估计 === 0 || p.优先级 === 'never') continue
      if (Number(p['价值/关键性']) < Number(params.promoteValueThreshold)) continue
      if (p.在问题清单) continue
      if (qDescriptions.indexOf(p.概述) !== -1) continue
      if (qDescriptions.indexOf('判断下述命题是否成立：' + p.概述) !== -1) continue
      const qid = 'q-promoted-' + String(p.id).replace(/[^a-z0-9\-]/gi, '').slice(-12)
      // 点3：证明/证伪列表 → 解法列表（条目前加【证明】/【证伪】前缀），保留概率/已验并记录来源以便回写联动
      const sols = []
      const proofs = p.证明列表 || []; const refutes = p.证伪列表 || []
      for (let j = 0; j < proofs.length; j++) { const it = proofs[j]; sols.push({ 完整解法: '【证明】' + (it.完整过程 || ''), 正确概率: clamp01(it.正确概率 != null ? it.正确概率 : 0.5), 已验: !!it.已验, 来源: '由命题晋升(证明#' + j + ')', 来源命题: p.id, 来源列表: '证明', 来源索引: j, 验证记录: [] }) }
      for (let j = 0; j < refutes.length; j++) { const it = refutes[j]; sols.push({ 完整解法: '【证伪】' + (it.完整过程 || ''), 正确概率: clamp01(it.正确概率 != null ? it.正确概率 : 0.5), 已验: !!it.已验, 来源: '由命题晋升(证伪#' + j + ')', 来源命题: p.id, 来源列表: '证伪', 来源索引: j, 验证记录: [] }) }
      qs.push({ id: qid, 概述: '判断下述命题是否成立：' + p.概述, 已解决: false, 解法列表: sols, 优先级: 1, 判断命题: p.id, 细类型: (p.细类型 && typeof p.细类型 === 'object') ? p.细类型 : {}, '价值/关键性': p['价值/关键性'], progress: { 来源: 'promote', 来源命题: p.id, 说明: '由命题 ' + p.id + '（价值/关键性=' + p['价值/关键性'] + '）自动晋升；目标：证明或证伪该命题（解法列表中的【证明】/【证伪】条目即原命题的证明/证伪材料，验证结果会回写源命题）。' } })
      p.在问题清单 = true
      await upsertProposition(p)
      await writeQs(qs)
      logActivity('promote', 'proposition ' + p.id + ' promoted to problem ' + qid + '（' + sols.length + ' 条证明/证伪转为解法）')
      return // one per tick is enough
    }
  }
  /**
   * 临时假设的「判断问题」是**辅助对象**（审计 C2 的种子解法让它可验证）。它的解法只在主线安静时
   * 入选验证：一个 q_sub 会新增两个问题，若它的验证与主线同时抢并发槽位，默认组合
   * （maxParallelThreshold=4 / verifierCount=3）下主线连 2 个验证器都派不出来——实测 e2e-business 的
   * "verifiers spawned for solution" 会从 3 掉到 1。辅助对象让主线先走；主线一旦没有别的可验证对象、
   * 也没有 explorer/solver 在跑，它立刻轮到（所以 p_{q-tmp} 不再永远停在 0.5）。
   */
  function busySolving() { return Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && (m.role === 'explorer' || m.role === 'solver') }) }
  async function processVerify() {
    const all = await buildVerifyCandidates()
    let candidates = all.filter(function (c) { return !c.auxAssumption })
    if (candidates.length === 0 && !busySolving()) candidates = all.filter(function (c) { return c.auxAssumption })
    for (let i = 0; i < candidates.length; i++) {
      if (activeCount() >= params.maxParallelThreshold) break
      const c = candidates[i]
      const rId = c.rId
      if (tasks['verify:' + rId]) continue
      const inflight = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'verifier' && m.rId === rId })
      if (inflight) continue
      tasks['verify:' + rId] = { id: 'verify:' + rId, type: 'verify', r: c, rId: rId, status: 'spawning', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(MIN_REVIEWERS, params.verifierCount), createdAt: now() }
      await saveAll()
      return // one verification at a time keeps scheduling simple; tick will continue next pass
    }
  }
  async function buildVerifyCandidates() {
    const out = []
    const qs = await getQs()
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      if (q.已解决 || q.优先级 === 'never') continue
      const sols = q.解法列表 || []
      for (let j = 0; j < sols.length; j++) {
        const s = sols[j]
        if (s.正确概率 === 1 || s.正确概率 === 0) continue
        // 已验的条目只在**中段值**（0<p<1）且冷却期已过时重新入选（审计 M12：中间概率不是定论，
        // 对象不能被永久搁置；`最近验证时间` 由 settleVerdict 在中段裁决时写下）。
        if (s.已验 && !reverifyDue(s)) continue
        if (!String(s.完整解法 || '').trim()) continue
        out.push({ rId: 'r-' + q.id + '-s' + j, kind: 'problem-solution', qid: q.id, 概述: q.概述, process: s.完整解法 || '', idx: j, prob: Number(s.正确概率) || 0, priority: q.优先级 === 'never' ? 999 : Number(q.优先级), 判断命题: q.判断命题, auxAssumption: s.来源 === 'sub-question-assumption' })
      }
    }
    const propos = await getPropos()
    for (let i = 0; i < propos.length; i++) {
      const p = propos[i]
      if (p.布尔估计 === 1 || p.布尔估计 === 0 || p.优先级 === 'never') continue
      if (p.已验证 && !reverifyDue(p)) continue // 收敛闸门：该命题已由「判断命题」解法裁决过；中段裁决只上锁到冷却期结束（见 settleVerdict 点5）
      if (p.在问题清单) continue // 已晋升：其证明/证伪经晋升问题的解法验证，避免同一内容双重验证
      const dep = { 依赖假设: p.依赖假设, 依赖假设已证伪: p.依赖假设已证伪 }
      const proofs = p.证明列表 || []; const refutes = p.证伪列表 || []
      if (proofs.length === 0 && refutes.length === 0) {
        if (String(p.id).indexOf('p-tmp-') === 0) continue // 临时假设由「判断下述命题是否成立：p_{q-tmp}」问题统一验证，避免裸命题验证双重路径
        out.push(Object.assign({ rId: 'r-' + p.id, kind: 'proposition', pId: p.id, 概述: p.概述, prob: Number(p.布尔估计) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }, dep))
      } else {
        for (let j = 0; j < proofs.length; j++) { if (proofs[j].正确概率 === 1 || proofs[j].正确概率 === 0 || (proofs[j].已验 && !reverifyDue(proofs[j]))) continue; if (!String(proofs[j].完整过程 || '').trim()) continue; out.push(Object.assign({ rId: 'r-' + p.id + '-pf' + j, kind: 'prop-proof', pId: p.id, 概述: p.概述, side: '证明', process: proofs[j].完整过程 || '', idx: j, prob: Number(proofs[j].正确概率) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }, dep)) }
        for (let j = 0; j < refutes.length; j++) { if (refutes[j].正确概率 === 1 || refutes[j].正确概率 === 0 || (refutes[j].已验 && !reverifyDue(refutes[j]))) continue; if (!String(refutes[j].完整过程 || '').trim()) continue; out.push(Object.assign({ rId: 'r-' + p.id + '-rf' + j, kind: 'prop-proof', pId: p.id, 概述: p.概述, side: '证伪', process: refutes[j].完整过程 || '', idx: j, prob: Number(refutes[j].正确概率) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }, dep)) }
      }
    }
    out.sort(function (a, b) { if (a.priority !== b.priority) return a.priority - b.priority; return (b.prob || 0) - (a.prob || 0) })
    return out
  }
  /**
   * 每个验证对象最多**同时**占多少评审槽位（审计 M11 的资源侧）。
   *
   * 目标仍是 verifierCount 个独立评审，但并发预算必须给别的验证对象留下至少 MIN_REVIEWERS 个槽位：
   * 否则一个对象（例如某条引理的证明）就能把 maxParallelThreshold 吃光，后出现的对象（例如主问题的
   * 解法）只剩 1 票——而一票不允许裁决 ⇒ 它会被反复补派/搁置。容量宽裕时（maxParallelThreshold ≥
   * verifierCount + MIN_REVIEWERS）这就是 verifierCount，一个都不少。
   */
  function reviewerCap() {
    const target = Math.max(MIN_REVIEWERS, Math.floor(Number(params.verifierCount) || MIN_REVIEWERS))
    const byThreshold = Math.max(MIN_REVIEWERS, (Number(params.maxParallelThreshold) || MIN_REVIEWERS) - MIN_REVIEWERS)
    return Math.max(MIN_REVIEWERS, Math.min(target, byThreshold))
  }
  async function backfillVerifiers(t) {
    const cap = reviewerCap()
    while (t.children.length < t.expectedCount && t.children.length < cap) {
      if (activeCount() >= params.maxParallelThreshold) break
      const index = t.children.length
      const childId = await spawnChild('verifier:' + t.rId + ':' + index, verifierReviewPrompt(t.r), { role: 'verifier', rId: t.rId, round: 1, index: index })
      t.children.push(childId)
    }
    if (t.children.length >= t.expectedCount) t.status = 'debating'
  }
  async function reconcileVerify() {
    const ids = Object.keys(tasks)
    for (let i = 0; i < ids.length; i++) {
      const t = tasks[ids[i]]
      if (t.type !== 'verify') continue
      if (t.status === 'stalled') {
        // 票数补不足时任务被置为 stalled（见 finalizeVerification）：冷却结束再重新派发，避免每 tick
        // 重建同一个对象、反复重试。任务本身保留，所以 processVerify 不会为同一个 rId 造出第二个任务。
        if (now() >= Number(t.retryAt || 0)) {
          t.status = 'spawning'; t.reviewerRespawn = 0; t.children = []; t.childResults = {}; t.round = 1
          logActivity('verify', t.rId + ' 冷却结束，重新派发验证器（凑齐 ≥' + MIN_REVIEWERS + ' 份独立评审）')
        } else continue
      }
      if (t.status === 'paused') {
        const allReported = t.children.length > 0 && t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === t.round })
        if (allReported) { t.status = 'debating'; await advanceVerification(t, t.round); continue }
      }
      if (t.status !== 'spawning') continue
      if (activeCount() >= params.maxParallelThreshold) break
      await backfillVerifiers(t)
    }
  }
  async function processSolve() {
    if (activeCount() >= params.maxParallelThreshold) return
    const qs = await getQs()
    const unsolved = qs.filter(function (q) { return !q.已解决 && q.优先级 !== 'never' }).sort(function (a, b) { return (a.优先级 === 'never' ? 999 : Number(a.优先级)) - (b.优先级 === 'never' ? 999 : Number(b.优先级)) })
    for (let i = 0; i < unsolved.length; i++) {
      if (activeCount() >= params.maxParallelThreshold) break
      const q = unsolved[i]
      const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && (m.role === 'explorer' || m.role === 'solver') })
      if (busy) continue
      const prog = parseProgress(q)
      const allExhausted = prog.directions.length > 0 && prog.directions.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
      if (prog.directions.length === 0 || allExhausted) {
        const explorerCap = Number(params.maxExplorerRetries) || 3
        if ((explorerRetries[q.id] || 0) >= explorerCap) {
          if (prog.directions.length === 0) prog.directions.push({ id: 'd_' + shortId(), title: 'explorer 失败', method: '', core_assumption: '', feasibility: 0, status: 'dead-end', round: 0, survival: 0, routes: [], blockers: [], dead_end_reason: 'explorer 连续 ' + explorerCap + ' 次未产出方向' })
          await saveProgress(q.id, prog)
          logActivity('explorer', 'problem ' + q.id + ' explorer exhausted (' + explorerCap + ' failed attempts)')
          continue
        }
        explorerRetries[q.id] = (explorerRetries[q.id] || 0) + 1
        const promptText = (prog.directions.length > 0) ? rederivePrompt(q, prog) : explorerPrompt(q)
        const r = await maybeGate('spawn', 'explorer for problem ' + q.id, { label: 'explorer:' + q.id, promptText: promptText, meta: { role: 'explorer', qid: q.id } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } })
        if (r && r.gated) return
      } else {
        // spawn solvers for each active direction
        for (let j = 0; j < prog.directions.length; j++) {
          if (activeCount() >= params.maxParallelThreshold) break
          const dir = prog.directions[j]
          if (dir.status === 'success' || dir.status === 'dead-end') continue
          const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.id && m.role === 'solver' })
          if (running) continue
          const progressText = buildSolverContext(prog.directions, dir, 1, params.directionsPerSolver)
          const promptText = solverPrompt(q, dir, 1, progressText)
          const r = await maybeGate('spawn', 'solver for problem ' + q.id + ' direction ' + dir.id, { label: 'solver:' + q.id + ':' + dir.id, promptText: promptText, meta: { role: 'solver', qid: q.id, direction: dir.id, round: 1, description: q.概述 } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } })
          if (r && r.gated) return
        }
      }
    }
  }

  // ================= solver (agent_self_iteration) handling =================
  async function handleExplorer(childId, meta, output) {
    delete agentRegistry[childId]
    const parsed = parseJson(output)
    // 回执通道（契约 §4 / §6.3）：工作轮里做出的形式化难度判断也要落库。
    await absorbFormalFromReply(parsed, childId)
    const dirs = (parsed && parsed.directions) || []
    if (dirs.length === 0) { logActivity('explorer', 'problem ' + meta.qid + ' returned no directions (output head: ' + String(output || '').slice(0, 200) + ')'); await saveAll(); return }
    explorerRetries[meta.qid] = 0
    const q = await findQ(meta.qid); if (!q) return
    const prog = parseProgress(q)
    prog.directions = dirs.map(function (d) {
      return { id: d.id || ('d_' + shortId()), title: d.title || '', method: d.method || '', core_assumption: d.core_assumption || '', feasibility: clamp01(d.feasibility), status: 'active', round: 0, survival: clamp01(d.feasibility), routes: [], blockers: [], dead_end_reason: '' }
    })
    await saveProgress(meta.qid, prog)
    logActivity('explorer', 'problem ' + meta.qid + ' → ' + prog.directions.length + ' directions')
  }
  async function handleSolver(childId, meta, output, stopReason) {
    const qid = meta.qid; const dirId = meta.direction
    const parsed = parseJson(output)
    // 回执通道（契约 §4 / §6.3）：求解器/探索者的"顺手形式化"产物与难度判断都要落库。
    await absorbFormalFromReply(parsed, childId)
    const q = await findQ(qid); if (!q) { delete agentRegistry[childId]; return }
    const prog = parseProgress(q)
    const dir = prog.directions.find(function (d) { return d.id === dirId })
    if (!dir) { delete agentRegistry[childId]; return }
    if (!parsed && !scheduler.running) { delete agentRegistry[childId]; return } // abort：不把方向标记为死路，保留待 resume
    const status = (parsed && parsed.status) || statusFromStop(stopReason)
    dir.round = meta.round
    // 需求 5 第二半的**记录**侧：本轮产出的引理若处在某条临时假设之下，就把假设 id 记在命题上
    // （`依赖假设`）。只用**本轮之前**已登记、且尚未被证伪的假设：本轮新报的 q_sub 不算（先有假设
    // 才有"依赖它的结论"，同一轮里 lemma 可能先于该假设产生）。此前 assumeId 只被存进
    // dir.sub_questions 而从不被读取，"若 p_{q-tmp} 成立，则…"就只是一句写在提示词里的空话（审计 M16）。
    const activeAssumptions = await activeAssumptionsOf(dir)
    if (parsed) {
      if (parsed.routes) dir.routes = (dir.routes || []).concat(parsed.routes)
      if (parsed.lessons) dir.lessons = (dir.lessons || []).concat(parsed.lessons)
      if (parsed.dead_end_reason) dir.dead_end_reason = parsed.dead_end_reason
      if (typeof parsed.survival_probability === 'number') dir.survival = clamp01(parsed.survival_probability)
      if (parsed.lemmas && parsed.lemmas.length) { for (let i = 0; i < parsed.lemmas.length; i++) { const lid = await addLemmaAsProposition(qid, parsed.lemmas[i], activeAssumptions.length ? activeAssumptions[activeAssumptions.length - 1] : undefined); if (lid) { dir.lemmas = dir.lemmas || []; dir.lemmas.push({ id: lid, title: parsed.lemmas[i].title || '' }) } } }
      if (parsed.sub_questions && parsed.sub_questions.length) { for (let i = 0; i < parsed.sub_questions.length; i++) { const sq = parsed.sub_questions[i]; if (sq && sq.q_sub_statement && dir.sub_questions && dir.sub_questions.some(function (x) { return x.statement === sq.q_sub_statement })) continue; const rec = await addSubQuestion(qid, dirId, sq); if (rec) { dir.sub_questions = dir.sub_questions || []; dir.sub_questions.push(rec) } } }
    }
    if (status === 'success') {
      if (parsed && parsed.solution) {
        dir.status = 'success'
        delete agentRegistry[childId]
        logActivity('solver', qid + '/' + dirId + ' success at round ' + meta.round)
        await addSolution(qid, parsed.solution, parsed.solution_probability)
      } else {
        // claimed success without a solution text — treat as an incomplete round
        if (meta.round >= params.solverMaxRounds) {
          dir.status = 'dead-end'; dir.dead_end_reason = dir.dead_end_reason || 'claimed success without solution at iteration cap'
          delete agentRegistry[childId]
          logActivity('solver', qid + '/' + dirId + ' dead-end (success without solution)')
        } else {
          const progressText = buildSolverContext(prog.directions, dir, meta.round + 1, params.directionsPerSolver)
          await followupChild(childId, solverPrompt(q, dir, meta.round + 1, progressText))
          agentRegistry[childId].round = meta.round + 1
          dir.round = meta.round + 1
        }
      }
    } else if (status === 'dead-end' || meta.round >= params.solverMaxRounds) {
      dir.status = 'dead-end'
      if (!dir.dead_end_reason) dir.dead_end_reason = (status === 'dead-end' && !parsed) ? 'solver ended abnormally (' + stopReason + ')' : 'iteration cap reached'
      delete agentRegistry[childId]
      logActivity('solver', qid + '/' + dirId + ' dead-end: ' + dir.dead_end_reason)
    } else {
      const progressText = buildSolverContext(prog.directions, dir, meta.round + 1, params.directionsPerSolver)
      if (!scheduler.running) {
        // paused/aborted: stop the follow-up chain; keep the direction active for resume
        delete agentRegistry[childId]
      } else {
        try {
          await followupChild(childId, solverPrompt(q, dir, meta.round + 1, progressText))
          agentRegistry[childId].round = meta.round + 1
          dir.round = meta.round + 1
        } catch (e) {
          console.error('vibe-math-v2: solver followup failed: ' + String((e && e.message) || e))
          dir.status = 'dead-end'; dir.dead_end_reason = dir.dead_end_reason || '求解器续轮失败（followup 异常）'
          delete agentRegistry[childId]
        }
      }
    }
    await saveProgress(qid, prog)
  }
  function statusFromStop(stopReason) { return (stopReason === 'completed' || stopReason === 'max-tokens') ? 'continue' : 'dead-end' }
  /**
   * 某个方向当前**在力**的临时假设（p_{q-tmp}）id 列表。已被证伪（布尔估计=0）的假设不再"在力"：
   * 依赖它的结论按需求 5 必须重新审视，而不是继续挂在它下面。
   */
  async function activeAssumptionsOf(dir) {
    const out = []
    const subs = (dir && Array.isArray(dir.sub_questions)) ? dir.sub_questions : []
    for (let i = 0; i < subs.length; i++) {
      const id = subs[i] && subs[i].assumeId
      if (!id) continue
      const p = await findProposition(id)
      if (p && p.布尔估计 !== 0) out.push(id)
    }
    return out
  }
  async function addLemmaAsProposition(qid, lemma, assumeId) {
    if (!lemma || !lemma.title) return
    let be = clamp01(lemma.布尔估计 != null ? lemma.布尔估计 : 0.6)
    if (be >= 1) be = 0.99; else if (be <= 0) be = 0.01 // 写入时概率必须 <1 且 >0（待验证器验证）
    const p = {
      id: 'p-' + shortId(), 概述: lemma.statement || lemma.title,
      布尔估计: be,
      细类型: (lemma.细类型 && typeof lemma.细类型 === 'object') ? lemma.细类型 : { 未分类: {} },
      证明列表: [{ 完整过程: lemma.proof || '', 正确概率: clamp01(0.7), '支持信息/依据': '' }],
      证伪列表: [], 优先级: (lemma.优先级 != null) ? lemma.优先级 : 1,
      '价值/关键性': clamp01(lemma['价值/关键性'] != null ? lemma['价值/关键性'] : 0.5),
      progress: { 来源: 'solver-lemma', 问题: qid, 说明: '由求解器针对问题 ' + qid + ' 的方向迭代产出。' }, 来源问题: qid,
    }
    // 需求 5：「后续所得命题/结论中凡依赖该假设的，必须把假设作为前提显式写出」——这里把依赖**落库**
    // （`依赖假设` 字段），于是它可被 list_propositions / 验证提示词 / 证伪联动读取（审计 M16）。
    if (assumeId) p.依赖假设 = String(assumeId)
    await upsertProposition(p)
    logActivity('proposition', 'lemma「' + lemma.title + '」→ ' + p.id + (assumeId ? '（依赖临时假设 ' + assumeId + '）' : ''))
    return p.id
  }
  // 点5（q_sub 严格化）：solver 报告子问题 q_sub 时，注册三个对象：
  //   1) q_sub 本身（问题类，完整陈述）入 qs.json；
  //   2) p_{q-tmp}（命题类临时假设：对 q_sub 的某种回答）入 Propos/；
  //   3) 「判断下述命题是否成立：p_{q-tmp}」（问题类）入 qs.json。
  // 返回 {subId,judgeId,assumeId}，由 handleSolver 在最终保存 progress 时记入方向（避免旧 progress 覆盖丢记录）。
  async function addSubQuestion(qid, dirId, sq) {
    if (!sq || !sq.q_sub_statement) return undefined
    const q = await findQ(qid)
    if (q) {
      const prog = parseProgress(q)
      const d = prog.directions.find(function (x) { return x.id === dirId })
      // 去重：同一方向已注册过相同陈述的 q_sub 则跳过（避免多轮重复上报产生重复问题/假设）
      if (d && d.sub_questions && d.sub_questions.some(function (x) { return x.statement === sq.q_sub_statement })) { logActivity('subquestion', 'duplicate q_sub skipped for ' + qid + '/' + dirId); return undefined }
    }
    const qs = await getQs()
    const subId = qid + '-sub-' + shortId()
    const assumeId = 'p-tmp-' + shortId()
    const judgeId = qid + '-judge-' + shortId()
    const assumeStatement = sq.assumption_statement || sq.assumption_title || ('对子问题「' + (sq.q_sub_title || sq.q_sub_statement) + '」的一种回答（临时假设）')
    qs.push({ id: subId, 概述: sq.q_sub_statement, 已解决: false, 解法列表: [], 优先级: 1, progress: { 类型: 'sub-question', 来源问题: qid, 来源方向: dirId, 说明: '临时子问题：由问题 ' + qid + ' 方向 ' + dirId + ' 分支产生；求解主线在 p_{q-tmp}（' + assumeId + '）假设下推进。' } })
    // ★ 判断问题必须**自带一条种子解法**，否则整条链是死的（审计 C2）：buildVerifyCandidates 需要至少
    //   一条非终态的解法/条目才会为它选验证对象，而裸的 p-tmp-* 命题又被显式跳过（那条路我们故意不放宽：
    //   裸临时假设不该绕过"判断命题"直接裁决）。解法列表为空 ⇒ 没有任何东西可验证 ⇒ p_{q-tmp} 永远停在
    //   0.5、判断命题永不收口、终止规则（unsolved.length === 0）不可达。
    //   种子内容 = 这条临时假设本身（"p_{q-tmp} 成立"这一候选回答），概率 0.5（>0 且 <1：它是待验证的
    //   候选，不是定论），并打上 `来源` 标记以示它是辅助对象（processVerify 据此让主线先占并发槽位）。
    qs.push({
      id: judgeId, 概述: '判断下述命题是否成立：' + assumeStatement, 已解决: false,
      解法列表: [{ 完整解法: assumeStatement, 正确概率: 0.5, 已验: false, 来源: 'sub-question-assumption', 验证记录: [] }],
      优先级: 1, 判断命题: assumeId,
      progress: { 类型: 'judge', 假设命题: assumeId, 说明: '由临时假设 p_{q-tmp}（' + assumeId + '）生成；它是对子问题 ' + subId + ' 的一种回答的命题化。解法列表里那条种子解法就是"该假设成立"这一候选回答，由验证器的裁决决定它成立（1）还是不成立（0）。' },
    })
    await writeQs(qs)
    const p = {
      id: assumeId, 概述: assumeStatement, 布尔估计: 0.5,
      细类型: { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: 1,
      '价值/关键性': 0.5,
      progress: { 类型: 'temporary-assumption', 来源问题: qid, 子问题: subId, 说明: '临时假设 p_{q-tmp}：由问题 ' + qid + ' 方向 ' + dirId + ' 在求解中临时假设其成立以推进主线；若该假设被证伪，则依赖它的主线结论需重新审视。' },
      来源问题: qid,
    }
    await upsertProposition(p)
    logActivity('subquestion', qid + ' → q_sub ' + subId + ' + 判断问题 ' + judgeId + ' + 临时假设 ' + assumeId)
    return { subId: subId, judgeId: judgeId, assumeId: assumeId, statement: sq.q_sub_statement }
  }
  async function addSolution(qid, solutionText, prob) {
    const qs = await getQs(); const q = qs.find(function (x) { return x.id === qid }); if (!q) return
    const p = clamp01(prob != null ? prob : 0.8)
    const finalProb = p >= 1 ? 0.99 : (p <= 0 ? 0.01 : p) // must be < 1 (待验证器验证)
    q.解法列表 = q.解法列表 || []
    q.解法列表.push({ 完整解法: String(solutionText), 正确概率: finalProb, 来源: 'solver', 验证记录: [] })
    await writeQs(qs)
    logActivity('solution', 'problem ' + qid + ' got a candidate solution (probability ' + finalProb + ', awaiting verification)')
  }

  // ================= verification (验证器) =================
  // 一票不算共识：≥MIN_REVIEWERS 份独立评审才可能达成/否决共识（审计 M11；与 v3 的最小票数同型）。
  function consensus(t) { const cids = Object.keys(t.childResults); if (cids.length < MIN_REVIEWERS) return false; const vs = cids.map(function (cid) { return t.childResults[cid].Result }); return vs.every(function (v) { return v === 1 }) || vs.every(function (v) { return v === 0 }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; parts.push('Reviewer ' + i + ': Result=' + r.Result + ' Reason=' + r.Reason) } return parts.join('\n') }
  // 说明（审计 L17）：这里曾有一个 `verifierWeight(cid, rigor)`，但全仓只有它的定义、没有任何调用点，
  // 且其公式（clamped ±0.2 rigor 加成、按 childId 取准确率）与 finalVerdict 里真正在用的
  // 稳定身份键 + 0.1 自信加成**并不相同**——留着它只会让人以为 forced 模式走的是那条公式。已删除。
  /**
   * 验证者的**稳定身份**（provider/model）：forced 模式的"历史准确率"必须按这种跨子代理稳定的键记，
   * 按一次性的 childId 记等于永远 0.5（审计 H4）。子代理信息里本来没有这个字段，所以在这里算出来，
   * 由 spawnChild 写进 agentRegistry 的 meta，再随每次投票进入 childResults。
   */
  function verifierIdentityKey() { const o = childAgentOptions(); return 'm:' + String(o.provider || '-') + '/' + String(o.model || '-') }
  const PENDING_SCORE_MAX_OBJECTS = 32
  /** 记下本轮各评审的投票，等**这个对象后来**取得布尔定论时再回溯计分（见 scorePendingReviews）。 */
  function recordReviewForScoring(objectId, key, result) {
    const id = String(objectId || '')
    if (!id) return
    let list = pendingReviewScores[id]
    if (!list) { list = []; pendingReviewScores[id] = list }
    list.push({ key: String(key || 'm:unknown'), result: clamp01(result) })
    if (list.length > 8) list.shift()
    const ids = Object.keys(pendingReviewScores)
    while (ids.length > PENDING_SCORE_MAX_OBJECTS) delete pendingReviewScores[ids.shift()]
  }
  /** 对象取得布尔定论（1/0）时，用它给**此前**那些还没被检验过的评审打分。绝不拿聚合值给同一批打分。 */
  async function scorePendingReviews(objectId, truth) {
    const id = String(objectId || '')
    const list = id ? pendingReviewScores[id] : undefined
    if (!list || list.length === 0) return
    delete pendingReviewScores[id]
    for (let i = 0; i < list.length; i++) {
      const acc = verifierAccuracy[list[i].key] || { correct: 0, total: 0 }
      acc.total += 1
      if (list[i].result === truth) acc.correct += 1
      verifierAccuracy[list[i].key] = acc
    }
    await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy)
  }
  async function handleVerifier(childId, meta, output, stopReason) {
    const rId = meta.rId
    const parsed = parseJson(output)
    // 回执通道（契约 §4 / §6.3）：验证者在回执里给出的难度判断 / 忠实性缺陷（`defect`）必须先于
    // 裁定落库——`defect` 会把形式化记录降级，于是紧随其后的 `settleVerdict` 会在 require 档
    // 把本次裁定正确地记为未定论。放在这里（而不是裁定之后）是有意的顺序依赖。
    await absorbFormalFromReply(parsed, childId)
    const Result = clamp01((parsed && parsed.Result != null) ? parsed.Result : 0.5)
    const Reason = (parsed && parsed.Reason) || ''
    let t = tasks['verify:' + rId]
    if (!t) { t = { id: 'verify:' + rId, type: 'verify', r: { kind: 'proposition', pId: rId, 概述: rId }, rId: rId, status: 'debating', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(MIN_REVIEWERS, params.verifierCount), createdAt: now() }; tasks[t.id] = t }
    if (!parsed && !scheduler.running) {
      // abort：被中断的验证器没有产出，丢弃该子代理并清理任务簿记（任务在 resume 时由 processVerify 重建）
      delete agentRegistry[childId]
      const ix = t.children.indexOf(childId); if (ix !== -1) t.children.splice(ix, 1)
      delete t.childResults[childId]
      if (t.children.length === 0 && t.id && tasks[t.id]) delete tasks[t.id]
      return
    }
    if (t.children.indexOf(childId) === -1) t.children.push(childId)
    t.childResults[childId] = { Result: Result, Reason: Reason, round: meta.round, key: meta.verificationKey || verifierIdentityKey() }
    delete agentRegistry[childId]
    const allReported = t.children.length > 0 && t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === meta.round })
    if (!allReported) { await saveAll(); return }
    await advanceVerification(t, meta.round)
    await saveAll()
  }
  async function advanceVerification(t, round) {
    if (round < params.debateMaxRounds && !consensus(t) && t.children.length > 0) {
      if (!scheduler.running) { t.status = 'paused'; return } // resume will re-advance this task
      if (activeCount() >= params.maxParallelThreshold) { t.status = 'paused'; return } // 并发门：等有空闲槽位再辩论（reconcileVerify 会重推进）
      t.round = round + 1
      const roundTranscript = buildTranscript(t)
      t.history = t.history || []
      t.history.push('Round ' + round + ':\n' + roundTranscript)
      const transcript = t.history.join('\n\n')
      const nextChildren = []
      for (let i = 0; i < t.children.length; i++) {
        const cid = t.children[i]
        try {
          await followupChild(cid, verifierDebatePrompt(t.r, transcript))
          agentRegistry[cid] = { role: 'verifier', rId: t.rId, round: round + 1, index: i }
          nextChildren.push(cid)
        } catch (e) {
          console.error('vibe-math-v2: verifier followup failed: ' + String((e && e.message) || e))
          delete agentRegistry[cid]
          delete t.childResults[cid]
        }
      }
      t.children = nextChildren
      if (nextChildren.length === 0) await finalizeVerification(t)
    } else {
      await finalizeVerification(t)
    }
  }
  /**
   * 裁决前的**票数下限**（审计 M11）：验证者掉线（followup 失败会把 childResults 里那一票删掉）时，
   * 只剩一票也会走 finalVerdict —— 一个"完全验证"的布尔结论就这样由单个评审写成。
   * 票数不足时**不产生任何裁决**：先补派验证器；补不足（未运行 / 并发被占满 / 已重试两次）就把任务置为
   * `stalled`，冷却期后重试（任务保留 ⇒ processVerify 不会为同一个 rId 另造任务，也不会每 tick 重试）。
   */
  async function finalizeVerification(t) {
    const reviews = Object.keys(t.childResults || {}).length
    if (reviews < MIN_REVIEWERS) {
      const tried = Number(t.reviewerRespawn || 0)
      if (scheduler.running && tried < 2 && reviewerCap() >= MIN_REVIEWERS) {
        t.reviewerRespawn = tried + 1
        logActivity('verify', t.rId + ' 只有 ' + reviews + ' 份有效评审（需要 ≥' + MIN_REVIEWERS + '），重新派发验证器补足（第 ' + t.reviewerRespawn + ' 次）')
        t.status = 'spawning'; t.children = []; t.childResults = {}; t.round = 1
        await saveAll()
        return
      }
      logActivity('verify', t.rId + ' 有效评审不足 ' + MIN_REVIEWERS + ' 份（' + reviews + '），本次**不产生裁决**；' + REVERIFY_COOLDOWN_MS / 60000 + ' 分钟后重试')
      t.status = 'stalled'; t.retryAt = now() + REVERIFY_COOLDOWN_MS
      t.children = []; t.childResults = {}
      await saveAll()
      return
    }
    const verdict = finalVerdict(t)
    if (params.mode === 'manual') {
      const d = enqueueDecision('verdict', 'verdict for ' + t.rId + ' (debate finished) = ' + verdict, { rId: t.rId, verdict: verdict, task: JSON.parse(JSON.stringify(t)) })
      scheduler.gate = { decisionId: d.id, node: 'verdict' }
      t.status = 'awaiting-verdict'
    } else {
      // 任务本条仍丢弃（见 settleVerdict 的返回契约：v2 的严格终止依赖 tasks 为空，既有用例
      // formal-verify-v2 7/12 也依赖"搁置后这一轮就此结束"），但"裁定是否真的应用"必须留痕，
      // 否则任务表与 Verification_logs 对同一次裁定的说法不一致。
      const applied = await settleVerdict(t, verdict)
      logActivity('verdict', t.rId + ' 的裁决已' + (applied ? '应用' : '搁置（未应用到对象，任务本条随之关闭；形式化通过后重新验证）'))
      delete tasks[t.id]
    }
  }
  function finalVerdict(t) {
    const rs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid] })
    if (rs.length === 0) return 0.5
    if (rs.every(function (r) { return r.Result === 1 })) return 1
    if (rs.every(function (r) { return r.Result === 0 })) return 0
    if (params.verdictMode === 'forced') {
      let num = 0; let den = 0
      const cids = Object.keys(t.childResults)
      for (let i = 0; i < rs.length; i++) {
        // 历史准确率按**稳定身份**取（见 verifierIdentityKey / settleVerdict）：新模型的第一票用 0.5
        // 先验，此后按"后来的布尔定论"累积。
        const key = (t.childResults[cids[i]] && t.childResults[cids[i]].key) || 'm:unknown'
        const acc = verifierAccuracy[key] || { correct: 0, total: 0 }
        const accRate = acc.total > 0 ? (acc.correct / acc.total) : 0.5
        const confident = (rs[i].Result === 1 || rs[i].Result === 0) ? 0.1 : 0
        const w = Math.max(0.05, Math.min(0.95, accRate + confident))
        num += w * rs[i].Result; den += w
      }
      return den > 0 ? Math.max(0.01, Math.min(0.99, num / den)) : 0.5
    }
    // flat = 均衡机制：不再"不一致就判 0.5"——各评审自报的 0<Result<1 是**它为真的概率**，
    // 取它们的均值（用户语义：只有精确的 1/0 是绝对真/假）。均值仍严格落在 (0,1)，绝不当成绝对结论；
    // 这样 0.9 vs 1 这种高置信分歧得到的是 ≈0.95 而不是被折叠成 0.5（v3 用近共识规则修的就是这一点）。
    let sum = 0
    for (let i = 0; i < rs.length; i++) sum += Number(rs[i].Result) || 0
    return Math.max(0.01, Math.min(0.99, sum / rs.length))
  }
  /**
   * `require` 门禁对**一次具体裁定**的判定（契约 §8）。
   * 返回 true 表示本次裁定被搁置：把任务记为 `未定论`（原因 formal-required）、
   * 不写 Verified 卡片、**不改变对象的任何概率/权重字段**，并把对象写入「形式化待办」。
   * 只有布尔裁定（真/假 = 1/0）受门禁约束；中间值本来就不写卡片，照旧走原路径。
   */
  async function formalVerdictDeferred(t, v, vIsBool) {
    if (!formalRequired() || !vIsBool) return false
    const gateTarget = safeId(String(t.rId || ''))
    if (await deferForFormal(gateTarget, '裁定 ' + (v === 1 ? '真' : '假'))) {
      t.formalDeferred = true
      t.outcome = 'undecided'
      t.formalDeferReason = 'formal-required'
      logActivity('gate', t.rId + ' 的裁定 ' + v + ' 被 require 模式搁置为未定论（formal-required）')
      return true
    }
    return false
  }
  /**
   * 应用一次裁定。
   *
   * 返回值（审计 L20）：`true` = 裁定**真的落到了对象上**；`false` = 被 require 门禁搁置
   * （`formalVerdictDeferred`），对象一个字段都没改。调用方必须据此决定任务簿记：以前返回值没人看，
   * `delete tasks[...]` 无条件执行，任务表就"声称"这次裁定已应用，而唯一的证据只剩 Verification_logs/
   * 与 Formal/TODO.md。注意 v2 的严格终止（`Object.keys(tasks).length === 0`）与既有用例
   * （formal-verify-v2 用例 7/12：搁置后调度器停在那里，人形式化后再 resume）都要求**任务本条仍被丢弃**，
   * 所以这里只把"未应用"这一事实显式报给调用方，不改变调度契约。
   */
  async function settleVerdict(t, verdict) {
    const v = clamp01(verdict)
    const r = t.r
    const cids = Object.keys(t.childResults)
    // 验证者历史准确率（forced 加权用）。两条不变式（审计 H4/M13）：
    //   ① 键是**稳定身份**（'m:<provider>/<model>'），不是一次性的 childId —— 按 childId 记的准确率
    //      在裁决时永远是 {0,0}（每次验证都新开一个 child，handleVerifier 又把它从 registry 删掉），
    //      于是 accRate 恒 0.5，"按历史准确率加权"根本不可能成立；
    //   ② **只按后来的布尔定论计分**。拿本轮各评审的 Result 去和"同一批 Result 的聚合值"比较是自指：
    //      non-unanimous 时没人是错的，flat 0.5 时凡 Result≠0.5 的人全被记错。所以这里先把本轮投票
    //      记进待计分表（pendingReviewScores），等这个对象**后来**真的取得 0/1 时再回溯计分。
    const scoreTarget = String(r.pId || r.判断命题 || r.qid || '')
    if ((v === 1 || v === 0) && scoreTarget) await scorePendingReviews(scoreTarget, v)
    for (let i = 0; i < cids.length; i++) {
      const res = t.childResults[cids[i]] || {}
      recordReviewForScoring(scoreTarget, res.key, res.Result)
    }
    // debate transcript log
    // 文件名来自 t.rId，而 rId 是**用户可写**的 q.id / p.id 拼出来的（buildVerifyCandidates 里
    // 'r-' + q.id + '-s' + j）。fs.resolve 只做规范化、并不拒绝 '..'，所以 q.id = 'x/../../../../pwn'
    // 会让这次写落到项目树之外（审计 C1，已用 pathdemo2.cjs 复现）。路径段一律过 safeId。
    await writeJson('Verification_logs/' + safeId(String(t.rId)) + '_' + Date.now() + '.json', { r: r, verdict: v, results: t.childResults, transcript: buildTranscript(t), history: t.history || [], at: now() })

    if (r.kind === 'proposition') {
      const p = await findProposition(r.pId)
      if (p) {
        // require 门禁：裸命题的 1/0 裁定不生效（对象留在原库、布尔估计不变、无卡片）
        if (await formalVerdictDeferred(t, v, v === 1 || v === 0)) return false
        p.布尔估计 = v
        if (v === 1) { p.证明列表 = p.证明列表 || []; p.证明列表.push({ 完整过程: strongestReason(t, 1), 正确概率: 1, '支持信息/依据': '', 已验: true }); p.优先级 = 'never' }
        else if (v === 0) { p.证伪列表 = p.证伪列表 || []; p.证伪列表.push({ 完整过程: strongestReason(t, 0), 正确概率: 1, '支持信息/依据': '', 已验: true }); p.优先级 = 'never' }
        else {
          p.证明列表 = p.证明列表 || []; p.证伪列表 = p.证伪列表 || []
          p.证明列表.push({ 完整过程: strongestReason(t, 1) || '根据辩论得到的支持性论证', 正确概率: v, '支持信息/依据': '', 已验: true })
          p.证伪列表.push({ 完整过程: strongestReason(t, 0) || '根据辩论得到的反驳性论证', 正确概率: 1 - v, '支持信息/依据': '', 已验: true })
          // 中段值 = "为真的概率"，不是定论：记下时间戳，冷却期过后这个命题可以**重新入选验证**
          // （审计 M12：以前它被永久搁置在中间概率上，没有任何回到验证的路径）。
          p.最近验证时间 = now()
        }
        await upsertProposition(p)
        await writeVerifiedCardIfNeeded(p)
      }
    } else if (r.kind === 'prop-proof') {
      const p = await findProposition(r.pId)
      if (p) {
        // require 门禁：一条证明/证伪被判定为 1（严格成立）时同样受门禁约束
        if (await formalVerdictDeferred(t, v, v === 1)) return false
        const list = r.side === '证明' ? (p.证明列表 = p.证明列表 || []) : (p.证伪列表 = p.证伪列表 || [])
        const item = list[r.idx]
        if (item) {
          item.正确概率 = v
          item.已验 = true
          if (v === 1) { item['支持信息/依据'] = strongestReason(t, 1) || item['支持信息/依据'] }
          else if (v === 0) {
            // 判 0 = "这份<证明/证伪>无效"，**不是**"命题为假"（反过来说 side=证伪 时也不是"命题为真"）。
            // 旧实现在这里往对侧列表推入一条 正确概率=1 的反条目，等于用"证明无效"伪造出一个布尔定论：
            // processStatusUpdates 随即写 布尔估计=0/1、优先级=never 和一张 结论:false/true 的 Verified
            // 卡片。这与仓库已修过的 defect 事故是同一类（机制本意是让验证更严，却伪造出假否定）。
            // 现在只把这一条记为无效（已验 / 正确概率 0），判据文字留在支持信息里，绝不伪造概率 1 的反条目。
            item['支持信息/依据'] = strongestReason(t, 0) || item['支持信息/依据']
            logActivity('verdict', t.rId + ' 判定' + r.side + '无效：' + r.pId + ' 的布尔估计保持不变（不因此认定命题为假/真）')
          } else {
            const other = r.side === '证明' ? (p.证伪列表 = p.证伪列表 || []) : (p.证明列表 = p.证明列表 || [])
            other.push({ 完整过程: strongestReason(t, v >= 0.5 ? 0 : 1) || '辩论得出的相反方向论证', 正确概率: 1 - v, '支持信息/依据': '', 已验: true })
            item['支持信息/依据'] = strongestReason(t, v >= 0.5 ? 1 : 0) || item['支持信息/依据']
            // 中段值：条目本身与新增的反向条目都是 (0,1) 的概率，冷却期过后可重新入选验证。
            item.最近验证时间 = now()
            other[other.length - 1].最近验证时间 = now()
          }
        }
        await upsertProposition(p)
        await writeVerifiedCardIfNeeded(p)
      }
    } else if (r.kind === 'problem-solution') {
      const qs = await getQs(); const q = qs.find(function (x) { return x.id === r.qid }); if (q) {
        const sol = (q.解法列表 || [])[r.idx]
        if (sol) {
          // require 门禁：v=1 意味着"这个问题的解法严格成立"（问题收口），必须被门禁拦住，
          // 否则问题会被标成已解决、优先级 never，而 formal 记录仍是 none。
          if (await formalVerdictDeferred(t, v, v === 1)) return false
          sol.正确概率 = v
          sol.已验 = true
          sol.验证记录 = sol.验证记录 || []
          sol.验证记录.push({ 结果: v, 时间: now(), 依据: strongestReason(t, v >= 0.5 ? 1 : 0) })
          // 中段值（0<v<1）= "这份解法为真的概率"，不是定论：冷却期过后可重新入选验证（审计 M12）。
          if (v !== 1 && v !== 0) sol.最近验证时间 = now()
          // 点3 回写联动：晋升问题的解法验证结果同步回源命题的证明/证伪条目（含内容比对防错位）
          if (sol.来源命题 && (sol.来源列表 === '证明' || sol.来源列表 === '证伪')) {
            const sp = await findProposition(sol.来源命题)
            if (sp) {
              const slist = sol.来源列表 === '证明' ? (sp.证明列表 || []) : (sp.证伪列表 || [])
              const item = slist[sol.来源索引]
              if (item && item.完整过程 === String(sol.完整解法 || '').replace(/^【(证明|证伪)】/, '')) {
                item.正确概率 = v; item.已验 = true
                await upsertProposition(sp)
                logActivity('promote-sync', 'promoted solution verdict ' + v + ' synced to proposition ' + sp.id + ' ' + sol.来源列表 + '#' + sol.来源索引)
              }
            }
          }
          // 点5 联动：「判断下述命题是否成立：X」问题的**新解法**验证结果 → X 命题收口
          // （转移条目走上面来源联动 + processStatusUpdates 按证明/证伪侧向收口；这里只处理无来源的新解法）
          if (q.判断命题 && !sol.来源列表) {
            const ap = await findProposition(q.判断命题)
            if (ap) {
              // ★ require 门禁：这条路径把**源命题**的 布尔估计 直接写成 0/1、置 优先级='never'、
              //   并标记 已验证（此后不再入选验证）——这就是一次对源命题的布尔裁定，必须先过门禁。
              //   原来的写法只让 writeVerifiedCardIfNeeded 去拦卡片，而它的返回值没人检查，概率字段
              //   早已落库：一个未形式化的命题会被侧面判为"假"并永久退出调度（v=1 时上面那道门禁
              //   拦得住，v=0 拦不住）。实现方案 §八把顺序写得很清楚：先拿卡片写入许可，再改
              //   布尔估计/优先级（契约 §8：门禁不通过时"不改变对象的既有权重/概率字段"）。
              const judgeBool = (v === 1 || v === 0)
              if (judgeBool && await deferForFormal(ap.id, '「判断命题」问题解法的裁定转移到源命题（' + v + '）')) {
                logActivity('gate', t.rId + ' 对源命题 ' + ap.id + ' 的裁定 ' + v + ' 被 require 模式搁置为未定论（formal-required）')
              } else {
                ap.布尔估计 = v
                // 收敛闸门：本条路径只在 v=1/0 时才写入证明/证伪条目，中间裁决（flat 现在给出各评审
                // 自报概率的均值，forced 给出加权均值）会让 ap 停留在"中间布尔估计 + 两个列表皆空"
                // 的状态——而这正是 buildVerifyCandidates 认定"裸命题需要验证"的条件。若不留时间戳，
                // 该命题会在每个 tick 重新入选、重开一轮完整辩论；又因 processVerify 每 tick 只跑一个
                // 验证，其它对象被无限饿死，终止条件（所有问题已解决）永不可达。
                // ★ 但**中段值不是定论**（用户语义：只有 1/0 是绝对真/假）：`已验证` 只对布尔裁决生效；
                //   中段裁决改记时间戳，冷却期过后重新入选——对象不会被永久停在中间概率上（审计 M12）。
                if (v === 1) {
                  ap.证明列表 = ap.证明列表 || []
                  ap.证明列表.push({ 完整过程: strongestReason(t, 1) || '判断问题解法验证通过', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true })
                  ap.优先级 = 'never'
                  ap.已验证 = true
                } else if (v === 0) {
                  ap.证伪列表 = ap.证伪列表 || []
                  ap.证伪列表.push({ 完整过程: strongestReason(t, 0) || '判断问题解法判定不成立', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true })
                  ap.优先级 = 'never'
                  ap.已验证 = true
                } else {
                  ap.最近验证时间 = now()
                }
                // 需求 5 第二半的联动：假设被**确认**（v=1）时，它就是对子问题 q_sub 的那一种回答的
                // 定论——把这份回答作为子问题的解法交回，让 processStatusUpdates 按收口规则正常关闭
                // 子问题并写问题卡片。否则 q_sub 永远未解决，终止规则（unsolved.length === 0）依然不可达。
                if (v === 1 && ap.progress && ap.progress.子问题) {
                  const subQ = qs.find(function (x) { return x.id === ap.progress.子问题 })
                  if (subQ && !subQ.已解决) {
                    subQ.解法列表 = subQ.解法列表 || []
                    if (!subQ.解法列表.some(function (s2) { return s2.正确概率 === 1 })) {
                      subQ.解法列表.push({ 完整解法: '【假设确认】' + ap.概述 + '（子问题的候选回答经「判断下述命题是否成立」问题验证为真）', 正确概率: 1, 已验: true, 来源: 'sub-question-assumption', 验证记录: [] })
                      logActivity('subquestion', '子问题 ' + subQ.id + ' 由临时假设 ' + ap.id + ' 的确认回答收口（交由收口规则关闭并写卡片）')
                    }
                  }
                }
                await upsertProposition(ap)
                await writeVerifiedCardIfNeeded(ap)
                logActivity('judge-sync', 'judge problem verdict ' + v + ' synced to proposition ' + ap.id)
              }
            }
          }
          if (v === 1) { q.已解决 = true; q.优先级 = 'never'; await writeVerifiedProblemCardIfNeeded(q) }
        }
        await writeQs(qs)
      }
    }
    logActivity('verdict', t.rId + ' = ' + v + (v === 1 ? ' (fully verified)' : v === 0 ? ' (refuted)' : ' (uncertain)'))
    return true
  }
  function strongestReason(t, wantTrue) {
    const cids = Object.keys(t.childResults)
    let best = ''; let bestDist = -1
    for (let i = 0; i < cids.length; i++) {
      const res = t.childResults[cids[i]]
      const dist = wantTrue ? res.Result : 1 - res.Result
      if (dist > bestDist && res.Reason) { bestDist = dist; best = res.Reason }
    }
    return best
  }
  // 点4：Verified 卡片 = 每对象一卡，内容 = 该对象当前所有正确概率=1 的证明/证伪完整过程；
  // 新 1-概率条目出现时自动更新（内容不变则不写）。幂等键 = 对象 id。
  //
  // ★ require 门禁的**单一收口点**（契约 §8）：一张"已验证·真/假"的卡片只在这里产生，
  //   所以门禁只加在这里（以及它的问题分支 writeVerifiedProblemCardIfNeeded）——不散落在多处。
  //   门禁不通过时**不写卡片**，把对象记为搁置（未定论 + Formal/TODO.md + 公告），
  //   并且由调用方保证"不把 1/0 提升写进概率字段"。
  //
  // 返回 { ok, deferred }：
  //   ok=true        → 卡片已写/已更新（或本来就无需写）
  //   ok=false,deferred=true → 被 require 门禁搁置（本次裁定不生效）
  async function writeVerifiedCardIfNeeded(p, promoteTo) {
    const target = (promoteTo === 0 || promoteTo === 1) ? promoteTo : p.布尔估计
    if (target !== 1 && target !== 0) return { ok: false, deferred: false }
    // ------- require 门禁 -------
    if (formalRequired() && !formalGateOk(formalGateRecord(p.id))) {
      await deferForFormal(p.id, '布尔裁定 ' + target)
      return { ok: false, deferred: true }
    }
    const cat = categoryOf(p)
    const list = await readVerifiedCategory(cat)
    const idx = list.findIndex(function (c) { return c.id === p.id })
    const proofs1 = (p.证明列表 || []).filter(function (x) { return x.正确概率 === 1 })
    const refutes1 = (p.证伪列表 || []).filter(function (x) { return x.正确概率 === 1 })
    const parts = []
    for (let i = 0; i < proofs1.length; i++) parts.push('【证明 #' + (i + 1) + '】' + (proofs1[i].完整过程 || ''))
    for (let i = 0; i < refutes1.length; i++) parts.push('【证伪 #' + (i + 1) + '】' + (refutes1[i].完整过程 || ''))
    const card = {
      id: p.id, 概述: p.概述, 类型: '命题', 结论: target === 1, 概率: target,
      内容: parts.join('\n'), 证明条数: proofs1.length, 证伪条数: refutes1.length,
      来源: p.来源问题 || '', 时间: now(), 分类: cat,
    }
    // 形式化状态随卡片一起落盘：读卡片的人必须能看出这条结论有多强（机器已核对 vs 仅共识）。
    // 仅在非 off 档写入，off 档保持卡片与改动前逐字节一致（off 是真无操作）。
    if (formalOn()) card['形式化'] = formalStatusLine(p.id)
    if (idx === -1) list.push(card)
    else { if (list[idx].内容 === card.内容 && list[idx].概率 === card.概率 && list[idx]['形式化'] === card['形式化']) return { ok: false, deferred: false }; list[idx] = card }
    await writeJson('Verified/' + cat + '_Verified.json', list)
    return { ok: true, deferred: false, created: idx === -1 }
  }
  // 问题类的对应收口点（契约 §8 的"问题收口分支"）。
  async function writeVerifiedProblemCardIfNeeded(q, promoteTo) {
    if (!q) return { ok: false, deferred: false }
    const solved = (promoteTo === true) ? true : (promoteTo === false ? false : !!q.已解决)
    if (!solved) return { ok: false, deferred: false }
    // ------- require 门禁 -------
    if (formalRequired() && !formalGateOk(formalGateRecord(q.id))) {
      await deferForFormal(q.id, '问题判定为已解决')
      return { ok: false, deferred: true }
    }
    const cat = '问题'
    const list = await readVerifiedCategory(cat)
    const idx = list.findIndex(function (c) { return c.id === q.id })
    const sols1 = (q.解法列表 || []).filter(function (s) { return s.正确概率 === 1 })
    const parts = []
    for (let i = 0; i < sols1.length; i++) parts.push('【解法 #' + (i + 1) + '】' + (sols1[i].完整解法 || ''))
    const card = { id: q.id, 概述: q.概述, 类型: '问题', 结论: true, 概率: 1, 内容: parts.join('\n'), 解法条数: sols1.length, 来源: q.id, 时间: now(), 分类: cat }
    if (formalOn()) card['形式化'] = formalStatusLine(q.id)
    if (idx === -1) list.push(card)
    else { if (list[idx].内容 === card.内容 && list[idx]['形式化'] === card['形式化']) return { ok: false, deferred: false }; list[idx] = card }
    await writeJson('Verified/' + cat + '_Verified.json', list)
    return { ok: true, deferred: false, created: idx === -1 }
  }
  // 卡片写入结果 → 布尔（向后兼容既有的 if (await writeVerifiedCardIfNeeded(p)) 语义）。
  function cardOk(r) { return !!(r && r.ok) }

  // ==========================================================================================
  // 最终论文（规格：docs/final-paper.md（含本轮修订））—— 会话侧。
  //
  // 时序（修订 §A2）：v2 的收口信号是严格终止（本文件 tick() 的 branch，见 `strict termination`）。
  // `scheduler.running=false` 之后 `scheduleTick()` 变空操作，所以**撰写子代理必须在停止翻转之前**
  // 派遣；派不出去（宿主激活上限 ACTIVATION_LIMIT_REACHED）时排队，由 apply 级心跳
  // （paperRetryDue/runPaperRetry）重试并给出可见告警。子代理的回复由 onChildEnd 的 `paper` 分支
  // 处理（未知 role 会静默丢失）。收口判据里 paper 子代理被排除（realAgents），避免它自己阻止收口。
  // 落盘（修订 §C/§D）：md/tex 是文本（走宿主 fs），**paper.pdf 只能由编译器子进程生成**，插件只 stat；
  // paper.meta.json 最后写（提交点）。幂等 = run id + finalizedAt + 逐产物存在性（不引入材料稳定哈希）。
  // ==========================================================================================
  let paperInFlight = ''            // 正在撰写的 childId（空 = 无）
  let paperInFlightAt = 0           // 派遣时刻（判定卡死窗口；force 与心跳都据它降级）
  let paperReaps = 0                // 本 run 内已回收卡死撰写者的次数（自动重派上限）
  const paperAbandoned = {}         // childId -> true：已放弃的撰写者；它事后返回时输出被丢弃并留痕
  let paperPending = null           // 激活上限排队重试：{ tries, retryAt, reason, limit, trigger, opts }
  const PAPER_RETRY_MS = 5000       // 激活上限拒绝后的重试间隔
  const PAPER_MAX_RETRIES = 12      // 连续被拒上限（超过则放弃并给可见告警）
  const PAPER_STALE_MS = 10 * 60 * 1000 // 撰写者卡死窗口：超过它，force 与心跳都会回收并重派（10 分钟）
  const PAPER_MAX_AUTO_REAPS = 2    // 心跳自动回收+重派的次数上限，之后交给 /vibe paper force
  const PAPER_LOCK_STALE_MS = 120000 // paper 作用域锁的失效时间（跨会话/跨进程尽力而为）
  /** 宿主激活上限（maxActiveSubagents）报错里的人数：v4/v5 用的同一判据。 */
  function activationLimitFrom(message) { const m = /active child limit:\s*(\d+)/.exec(String(message == null ? '' : message)); return m ? Number(m[1]) : undefined }
  function paperId(opts) { return paperDirId((opts && opts.id) || currentProject) }
  function paperDir(id) { return 'Paper/' + paperDirId(id) }
  function paperAbsDir(id) { return frameworkRoot() + '/' + paperDir(id) }
  function paperAuthorLine() { return 'Vibe Math V2（单作者：论文撰写子代理）· 项目 ' + currentProject }
  /**
   * 本次撰写的参数（spec §1/§2）：命令行的 lang=/format= 覆盖参数，参数覆盖默认值。
   * 非法值已在 paperCommand 里拒绝；这里再做一次保守回退（落到纸面上的参数永远合法）。
   */
  function paperOpts(opts) {
    const o = opts || {}
    const fmt = (o.format === 'md' || o.format === 'tex' || o.format === 'both') ? o.format : ((params.paperFormat === 'md' || params.paperFormat === 'tex') ? params.paperFormat : 'both')
    const lang = (o.lang === 'en' || o.lang === 'zh') ? o.lang : (params.paperLanguage === 'en' ? 'en' : 'zh')
    const compilePdf = (o.compilePdf === true || o.compilePdf === false) ? o.compilePdf : (params.paperCompilePdf !== false)
    return { format: fmt, lang: lang, compilePdf: compilePdf, force: o.force === true, id: o.id }
  }
  async function paperReadMeta(id) { const m = await readJson(paperDir(id) + '/paper.meta.json'); return (m && typeof m === 'object' && !Array.isArray(m)) ? m : undefined }
  async function paperPathExists(rel) { try { const t = await fsTarget(rel); return (await fs.stat(t)) !== undefined } catch (e) { return false } }
  async function paperAppendLog(id, tag, text) {
    const rel = paperDir(id) + '/paper.log.md'
    const prev = await readText(rel)
    const head = (prev === undefined || !String(prev).trim()) ? (paperLogHead(id).join('\n') + '\n') : String(prev)
    await writeText(rel, head + paperLogLine(now(), tag, text) + '\n')
  }
  /**
   * paper 作用域锁（修订 §A3；v3 在触发前已释放项目锁，两个会话可能同时写同一棵 Paper/ 树）。
   * 尽力而为：同一会话总是可重入（用于续租 at）；别的会话持有的锁未过期则拒绝。
   */
  async function paperLockAcquire(id) {
    const rel = paperDir(id) + '/paper.lock.json'
    const cur = await readJson(rel)
    if (cur && cur.sessionId && cur.sessionId !== sessionId && (now() - Number(cur.at || 0)) < PAPER_LOCK_STALE_MS) return { ok: false, holder: String(cur.sessionId), at: Number(cur.at || 0) }
    await writeJson(rel, { sessionId: sessionId, at: now(), project: currentProject })
    return { ok: true }
  }
  async function paperLockRelease(id) {
    const rel = paperDir(id) + '/paper.lock.json'
    const cur = await readJson(rel)
    if (cur && cur.sessionId === sessionId) await writeJson(rel, { sessionId: '', at: now(), released: true })
  }
  /**
   * 回收一个卡死的撰写者（修订 §1：死掉的撰写者绝不能把论文永久卡住）。
   * 做法：清状态 + 尽力中断 + 从 agentRegistry 摘除（否则它一直算"活跃子代理"，也会挡住后续派发）
   * + 记进 paperAbandoned（事后返回的输出被明确丢弃并留痕，不是静默消失）+ 可见告警。
   */
  async function paperReapWriter(id, why) {
    const cid = paperInFlight
    paperInFlight = ''; paperInFlightAt = 0
    if (cid) {
      try { await interruptChild(cid) } catch (e) { /* best effort */ }
      delete agentRegistry[cid]
      paperAbandoned[cid] = true
    }
    await paperAppendLog(id, 'reap', '回收卡死的撰写者 ' + (cid || '(未知)') + '：' + why + '（论文不会被永久卡住；force/心跳会继续）')
    logActivity('paper', '回收卡死的论文撰写子代理 ' + (cid || '(未知)') + '：' + why)
    console.error('vibe-math-v2: reaped a stalled paper writer (' + (cid || 'unknown') + '): ' + why)
    reportDirty = true
    return cid
  }
  function paperWriterVerdictNow(force) {
    return paperWriterVerdict({ inFlight: !!paperInFlight, force: !!force, ageMs: now() - Number(paperInFlightAt || 0), staleMs: PAPER_STALE_MS, childInRegistry: paperInFlight ? (agentRegistry[paperInFlight] !== undefined) : true })
  }
  function paperOneLine(s, cap) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, cap || 400) }
  /** 证据索引（spec §3.9）：只列**确实存在**的文件；绝不含 Paper/ 自己（否则输入哈希会自我污染）。
   *  off 档必须真的是无操作（formal-verify-v2 的语料守卫会断言"off 的提示词里零 Lean 文本"）：
   *  formal 未启用时，形式化相关的路径与字段一概不写进材料。 */
  async function paperEvidenceIndex() {
    const formalNow = formalOn()
    const out = ['qs/qs.json']
    if (formalNow && await paperPathExists('VibeMath_State/formal.json')) out.push('VibeMath_State/formal.json')
    for (const f of await listFiles('Propos')) out.push('Propos/' + f)
    for (const f of await listFiles('Verified')) out.push('Verified/' + f)
    if (formalNow) for (const f of await listFiles('Verified/Lean')) out.push('Verified/Lean/' + f)
    const dirs = ['Verification_logs', 'Progress_Logs'].concat(formalNow ? ['Formal'] : [])
    for (let i = 0; i < dirs.length; i++) { const files = await listFiles(dirs[i]); for (let j = 0; j < files.length; j++) out.push(dirs[i] + '/' + files[j]) }
    return out.filter(function (x) { return x.indexOf('Paper/') !== 0 }).sort()
  }
  /** 汇总材料（spec §4）：只含既有证据 + 未决/被否证的显式标注。不含时间戳 ⇒ 哈希稳定。 */
  async function buildPaperDigest() {
    const L = []
    L.push('PRESET: vibe-math-v2 (single-author)')
    L.push('PROJECT: ' + currentProject)
    const qs = await getQs()
    L.push('')
    L.push('[ORIGINAL PROBLEMS] (qs/qs.json)')
    if (qs.length === 0) L.push('- (none)')
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      L.push('- id=' + q.id + ' | 已解决=' + (q.已解决 === true) + ' | 优先级=' + q.优先级 + ' | 概述=' + paperOneLine(q.概述, 800))
      const sols = q.解法列表 || []
      if (sols.length === 0) L.push('    · 解法：无')
      for (let j = 0; j < sols.length; j++) {
        const s = sols[j]
        L.push('    · 解法#' + j + ' 正确概率=' + s.正确概率 + ' 已验=' + (s.已验 === true) + ' 证据=Verification_logs/ | ' + paperOneLine(s.完整解法, 1200))
      }
    }
    const props = await getPropos()
    L.push('')
    L.push('[PROPOSITIONS] (Propos/*.json)')
    if (props.length === 0) L.push('- (none)')
    for (let i = 0; i < props.length; i++) {
      const p = props[i]
      const rec = formalOn() ? formalOf(p.id) : null   // off 档不把形式化字段写进材料（off 是真无操作）
      L.push('- id=' + p.id + ' | 布尔估计=' + p.布尔估计 + ' | 状态=' + (p.已验证 ? '已验证' : '未定论') + ' | 优先级=' + p.优先级 + ' | 价值/关键性=' + p['价值/关键性'] + (rec ? (' | 形式化=' + ((rec && rec.status) || 'none') + (rec && rec.proof ? ('（' + rec.proof + '）') : '')) : '') + ' | 概述=' + paperOneLine(p.概述, 800))
      const sides = [['证明', p.证明列表 || []], ['证伪', p.证伪列表 || []]]
      for (let k = 0; k < sides.length; k++) {
        const arr = sides[k][1]
        for (let j = 0; j < arr.length; j++) if (arr[j] && arr[j].正确概率 === 1) L.push('    · 已检验通过：' + sides[k][0] + '#' + j + '（正确概率=1） | ' + paperOneLine(arr[j].完整过程, 900))
      }
    }
    L.push('')
    L.push('[UNRESOLVED / REFUTED — 论文里必须显式标注，不得当成已成立的结论]')
    let any = false
    for (let i = 0; i < qs.length; i++) {
      const sols = qs[i].解法列表 || []
      for (let j = 0; j < sols.length; j++) if (!(sols[j].正确概率 === 1 || sols[j].正确概率 === 0)) { any = true; L.push('- 未定论：问题 ' + qs[i].id + ' 的解法#' + j + '（正确概率=' + sols[j].正确概率 + '）') }
    }
    for (let i = 0; i < props.length; i++) {
      if (!(props[i].布尔估计 === 1 || props[i].布尔估计 === 0)) { any = true; L.push('- 未定论：命题 ' + props[i].id + '（布尔估计=' + props[i].布尔估计 + '）') }
      else if (props[i].布尔估计 === 0) L.push('- 已被否证：命题 ' + props[i].id + '（布尔估计=0）')
    }
    if (!any) L.push('- (none — 所有对象均已定论)')
    L.push('')
    L.push('[EVIDENCE INDEX] (only files that exist)')
    const ev = await paperEvidenceIndex()
    for (let i = 0; i < ev.length; i++) L.push('- ' + ev[i])
    return L.join('\n')
  }
  /** 「论文撰写」子代理提示词（单作者；v2/v3 同一形状）。 */
  function paperWriterPrompt(digest, o) {
    const langName = o.lang === 'en' ? 'English' : '中文（Chinese）'
    return 'You are the DEDICATED PAPER WRITER (single-author mode) of a math research run that has just CONVERGED.\n' +
      'Write its final paper in ' + langName + ', using ONLY the evidence in the MATERIAL section below.\n\n' +
      'HARD RULES:\n' +
      '- NEVER invent content: no new proposition, no new computation, no citation that is not in the MATERIAL.\n' +
      '- Unresolved or refuted items MUST be explicitly labelled (「未定论」/「已被否证」, or "unresolved"/"refuted" in English); never present them as established.\n' +
      '- Fixed 9-section skeleton — provide bodies for these EXACT `## ` headings (the framework writes the headings, author/date and the evidence index itself):\n' +
      PAPER_SKELETON.map(function (s, i) { return '    ' + (i + 1) + '. ' + s.key + ' — ' + s.spec }).join('\n') + '\n' +
      '- A section with no evidence must be exactly 「' + PAPER_NO_EVIDENCE + '」 (do not pad it).\n' +
      '- Markdown subset only: `#`/`##`/`###`, `- ` lists, `**bold**`, `*em*`, `` `code` ``, and inline math as `$...$`. No tables, images, footnotes or raw HTML.\n\n' +
      'OUTPUT CONTRACT — respond with ONLY one ```json code fence, no prose:\n' +
      '{"title":"<paper title>","abstract":"<original problem + main results>","sections":[{"name":"<one of the 9 headings>","body":"<markdown>"}, ...]}\n\n' +
      'MATERIAL (evidence only — do not add anything beyond it):\n' + digest
  }
  /**
   * LaTeX 检测（spec §5 + 修订 §D）：`paperLatexCommand` 非空时只用它（不猜）；
   * 否则中文优先 xelatex、英文优先 pdflatex/latexmk。缺 subprocess/resolveExecutable 一律
   * 视为"未检测到"（照 LEAN_NOT_FOUND 的降级方式，永不抛错）。
   */
  async function paperDetectLatex(lang) {
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') return { available: [], reason: 'no-subprocess' }
    if (typeof sub.resolveExecutable !== 'function') return { available: [], reason: 'no-resolveExecutable' }
    const forced = String(params.paperLatexCommand || '').trim()
    if (forced) {
      try { const p = await sub.resolveExecutable(forced); return p ? { available: [{ name: forced, path: String(p) }], reason: 'ok', forced: true } : { available: [], reason: 'paperLatexCommand not found: ' + forced, forced: true } }
      catch (e) { return { available: [], reason: 'paperLatexCommand not found: ' + forced, forced: true } }
    }
    const order = lang === 'en' ? PAPER_ENGINE_ORDER_EN : PAPER_ENGINE_ORDER_ZH
    const available = []
    for (let i = 0; i < order.length; i++) {
      try { const p = await sub.resolveExecutable(order[i]); if (p) available.push({ name: order[i], path: String(p) }) } catch (e) { /* 未安装 */ }
    }
    return { available: available, reason: available.length ? 'ok' : 'none' }
  }
  function paperArgvFor(engine) {
    if (engine.name === 'latexmk') return [engine.path, '-pdf', '-interaction=nonstopmode', '-halt-on-error', 'paper.tex']
    if (engine.name === 'tectonic') return [engine.path, '--keep-logs', 'paper.tex']
    return [engine.path, '-interaction=nonstopmode', '-halt-on-error', 'paper.tex']
  }
  /** 一次编译（nonstopmode），带主动超时 terminate（与 leanRunFile 同一模式）。 */
  async function paperRunOnce(engine, dirAbs, capMs) {
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') return { ok: false, exitCode: null, code: 'NO_SUBPROCESS' }
    let handle
    try { handle = await spawnHandle(sub, { argv: paperArgvFor(engine), cwd: dirAbs, stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } }, graceMs: capMs }) }
    catch (e) { return { ok: false, exitCode: null, code: 'SPAWN_FAILED', message: String((e && e.message) || e) } }
    let timedOut = false, timer = null, outcome
    try {
      outcome = await Promise.race([
        handle.done,
        new Promise(function (resolve) { timer = setTimeout(function () { timedOut = true; try { if (handle && typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* best effort */ } resolve({ exitCode: null }) }, capMs) }),
      ])
    } catch (e) { if (timer !== null) clearTimeout(timer); return { ok: false, exitCode: null, code: 'RUN_FAILED', message: String((e && e.message) || e) } }
    if (timer !== null) clearTimeout(timer)
    let err = ''
    try { if (handle.collected && handle.collected.stderr) err = String(handle.collected.stderr.readFrom(0).text || '') } catch (e) { /* best effort */ }
    return { ok: !timedOut && !!outcome && outcome.exitCode === 0, exitCode: outcome ? outcome.exitCode : null, timedOut: timedOut, stderr: err.slice(-1200) }
  }
  /**
   * 编译 paper.tex（spec §5 + 修订 §D/§E）：检测 → 主引擎（nonstopmode，两遍）→ 换引擎 → 去不支持
   * 宏包 → 最小模板再试一次；然后报告并降级（保留 tex+md，不改写论文内容）。
   * **永不删除/覆盖已有 pdf**（§D）：旧的 paper.pdf 原样保留，成功判据 = 本次运行 exit 0 **且** pdf 存在。
   */
  async function paperCompile(id, o, texPrimary, bodyTex) {
    const relDir = paperDir(id), absDir = paperAbsDir(id)
    const attempts = []
    if (!o.compilePdf) return { compile: 'skipped', reason: 'paperCompilePdf=false', engine: null, attempts: attempts, pdfPreserved: await paperPathExists(relDir + '/paper.pdf') }
    // §E：tex 未产出（paperFormat=md）时**跳过**编译，且不得报"缺 tex 无法编译"的警告。
    if (o.format === 'md') return { compile: 'skipped', reason: 'paperFormat=md（不产出 tex，跳过编译）', engine: null, attempts: attempts, pdfPreserved: await paperPathExists(relDir + '/paper.pdf') }
    const det = await paperDetectLatex(o.lang)
    if (det.available.length === 0) {
      await paperAppendLog(id, 'latex', '未检测到任何 LaTeX 引擎（' + det.reason + '）→ 只保留 paper.tex + paper.md，不编译 pdf（spec §5：不阻塞定稿）')
      return { compile: 'not-detected', reason: det.reason, engine: null, attempts: attempts, pdfPreserved: await paperPathExists(relDir + '/paper.pdf') }
    }
    await paperAppendLog(id, 'latex', '检测到引擎 ' + det.available.map(function (x) { return x.name }).join(', ') + (det.forced ? '（paperLatexCommand 指定）' : ('（顺序 ' + (o.lang === 'en' ? PAPER_ENGINE_ORDER_EN : PAPER_ENGINE_ORDER_ZH).join(' > ') + '）')))
    const plan = [{ engine: det.available[0], tex: texPrimary, mode: 'primary' }]
    if (det.available[1]) plan.push({ engine: det.available[1], tex: texPrimary, mode: 'engine-fallback' })
    plan.push({ engine: det.available[0], tex: paperSanitizeTex(texPrimary), mode: 'drop-unsupported-packages' })
    plan.push({ engine: det.available[0], tex: paperMinimalTexDoc({ lang: o.lang, bodyTex: bodyTex }), mode: 'minimal-template' })
    const cap = 120000
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i]
      await writeText(relDir + '/paper.tex', step.tex)
      const runs = []
      for (let pass = 0; pass < 2; pass++) runs.push(await paperRunOnce(step.engine, absDir, cap))   // spec §5：跑两遍
      const last = runs[runs.length - 1]
      const pdf = !!last.ok && await paperPathExists(relDir + '/paper.pdf')
      attempts.push({ engine: step.engine.name, mode: step.mode, ok: pdf, exitCode: last.exitCode, timedOut: !!last.timedOut, stderr: last.stderr || '' })
      await paperAppendLog(id, 'compile', step.mode + ' engine=' + step.engine.name + ' → ' + (pdf ? 'ok（paper.pdf 已生成）' : ('failed（exit=' + String(last.exitCode) + (last.timedOut ? ', timeout' : '') + '）')))
      if (pdf) return { compile: (i === 0) ? 'ok' : 'repaired', engine: step.engine.name, mode: step.mode, attempts: attempts, pdfPreserved: false }
    }
    await writeText(relDir + '/paper.tex', texPrimary)   // 失败时保留**主** tex（信息量最大；spec §5 保留 tex+md）
    const preserved = await paperPathExists(relDir + '/paper.pdf')   // §D：已有的 pdf 绝不删除
    await paperAppendLog(id, 'compile', '所有尝试均失败：保留 paper.tex + paper.md' + (preserved ? '（paper.pdf 是**上一次成功编译**留下的，未被覆盖）' : '，未生成 paper.pdf') + '（不阻塞定稿）')
    logActivity('paper', '论文 pdf 编译失败（已尝试换引擎/去不支持宏包/最小模板），已保留 tex+md：' + relDir)
    reportDirty = true
    return { compile: 'failed', engine: det.available[0].name, attempts: attempts, pdfPreserved: preserved }
  }
  /** 落盘 md/tex/pdf/meta（幂等：内容相同则不重写；spec §2/§5）。 */
  async function paperEmitArtifacts(id, o, info) {
    const relDir = paperDir(id)
    const dateStr = fmtTime(now()).slice(0, 10)
    const author = paperAuthorLine()
    const evidence = info.evidence || (await paperEvidenceIndex())
    const title = String(info.title || '').trim() || ('研究报告：' + currentProject)
    const md = paperBuildMarkdown({ title: title, author: author, date: dateStr, abstract: info.abstract, sections: info.sections, evidence: evidence })
    const artifacts = { md: false, tex: false, pdf: false }
    let compile = 'skipped', engine = null, attempts = [], pdfPreserved = false
    if (o.format === 'md' || o.format === 'both') { await writeText(relDir + '/paper.md', md); artifacts.md = true }
    if (o.format === 'tex' || o.format === 'both') {
      const bodyTex = paperMdToTexBody(md)
      const tex = paperTexDoc({ title: title, author: author, date: dateStr, lang: o.lang, bodyTex: bodyTex })
      await writeText(relDir + '/paper.tex', tex)
      artifacts.tex = true
      const c = await paperCompile(id, o, tex, bodyTex)
      compile = c.compile; engine = c.engine || null; attempts = c.attempts || []
      pdfPreserved = !!c.pdfPreserved
      if (compile === 'ok' || compile === 'repaired') artifacts.pdf = await paperPathExists(relDir + '/paper.pdf')
    }
    const filled = PAPER_SKELETON.map(function (s) { return s.key }).filter(function (k) { return !!(info.sections && String(info.sections[k] || '').trim()) })
    const meta = {
      id: id, dir: relDir, preset: 'vibe-math-v2', singleAuthor: true, project: currentProject,
      title: title, author: author, date: dateStr, abstract: String(info.abstract || ''),
      sectionBodies: info.sections || {}, sections: PAPER_SKELETON.map(function (s) { return s.key }), filledSections: filled,
      raw: String(info.raw == null ? '' : info.raw), notes: Array.isArray(info.notes) ? info.notes : [],
      trigger: info.trigger || 'manual', runStartedAt: Number(scheduler.startedAt) || 0,
      params: { finalPaper: params.finalPaper !== false, paperFormat: o.format, paperLanguage: o.lang, paperCompilePdf: !!o.compilePdf, paperLatexCommand: String(params.paperLatexCommand || '') },
      finalizedAt: now(), finalizedAtText: fmtTime(now()),
      artifacts: artifacts, compile: compile, compileEngine: engine, compileAttempts: attempts, pdfPreserved: pdfPreserved,
      material: info.material || null, evidence: evidence,
    }
    // meta **最后**写：它是"这次定稿已提交"的唯一标记（修订 §C 的原子提交点）。
    await writeJson(relDir + '/paper.meta.json', meta)
    return meta
  }
  async function paperMissingArtifacts(id, o) {
    const relDir = paperDir(id)
    const need = []
    if (o.format === 'md' || o.format === 'both') { if (!(await paperPathExists(relDir + '/paper.md'))) need.push('paper.md') }
    if (o.format === 'tex' || o.format === 'both') { if (!(await paperPathExists(relDir + '/paper.tex'))) need.push('paper.tex') }
    return need
  }
  /**
   * 派遣一次（内部）：材料摘要只作记录（修订 §C 不再用稳定哈希）；激活上限拒绝 → 排队重试（§A2）。
   */
  async function paperDispatch(trigger, o, id, prevTries) {
    const relDir = paperDir(id)
    const digest = await buildPaperDigest()
    let childId
    try {
      childId = await spawnChild('paper-writer:' + id, paperWriterPrompt(digest, o), { role: 'paper', paperId: id, trigger: trigger, lang: o.lang, format: o.format, compilePdf: o.compilePdf })
    } catch (e) {
      const message = String((e && e.message) || e)
      const limit = activationLimitFrom(message)
      if (limit !== undefined || /ACTIVATION_LIMIT_REACHED|active child limit/i.test(message)) {
        const tries = Number(prevTries || 0) + 1
        if (tries > PAPER_MAX_RETRIES) {
          paperPending = null
          await paperAppendLog(id, 'dispatch-failed', '宿主激活上限连续拒绝 ' + PAPER_MAX_RETRIES + ' 次，已放弃自动派遣：' + message)
          logActivity('paper', '论文撰写子代理被宿主激活上限连续拒绝（' + PAPER_MAX_RETRIES + ' 次），已放弃自动派遣（稍后可 /vibe paper force 重试）：' + message)
          console.error('vibe-math-v2: paper writer refused by the host activation limit ' + PAPER_MAX_RETRIES + ' times; giving up (retry later with /vibe paper force) — ' + message)
          await paperLockRelease(id)
          return { ok: false, message: 'paper writer refused by the activation limit ' + PAPER_MAX_RETRIES + ' times: ' + message, id: id, dir: relDir, limit: limit }
        }
        paperPending = { tries: tries, retryAt: now() + PAPER_RETRY_MS, reason: message, limit: limit, trigger: trigger, opts: { lang: o.lang, format: o.format, compilePdf: o.compilePdf } }
        if (tries === 1 || tries % 3 === 0) {
          await paperAppendLog(id, 'dispatch-queued', '宿主激活上限（' + (limit === undefined ? '?' : limit) + '）拒绝派遣（第 ' + tries + ' 次）：' + (PAPER_RETRY_MS / 1000) + 's 后重试')
          logActivity('paper', '论文撰写子代理被宿主激活上限拒绝（第 ' + tries + ' 次），已排队重试：' + message)
          console.error('vibe-math-v2: paper writer queued after an activation-limit refusal (try ' + tries + '): ' + message)
        }
        reportDirty = true
        return { ok: true, queued: true, reason: 'activation-limit-reached', tries: tries, retryAt: paperPending.retryAt, limit: limit, id: id, dir: relDir }
      }
      await paperAppendLog(id, 'dispatch-failed', message)
      logActivity('paper', '「论文撰写」子代理派遣失败：' + message)
      await paperLockRelease(id)
      return { ok: false, message: 'paper writer dispatch failed: ' + message, id: id, dir: relDir }
    }
    paperInFlight = childId
    paperInFlightAt = now()
    // 只有"非自动重试"的派遣才重置回收计数：auto-retry 必须保留计数，否则卡死重派会无限循环。
    if (trigger !== 'auto-retry') paperReaps = 0
    paperPending = null
    const material = paperMaterialSummary(digest)
    await paperAppendLog(id, 'dispatch', 'trigger=' + trigger + ' child=' + childId + ' format=' + o.format + ' lang=' + o.lang + ' compilePdf=' + o.compilePdf + (o.force ? ' force=true' : '') + ' run=' + (Number(scheduler.startedAt) || 0) + ' material=' + material.chars + ' chars/' + material.lines + ' lines')
    logActivity('paper', '已派遣「论文撰写」子代理（' + trigger + '，' + o.format + '/' + o.lang + '）→ ' + relDir)
    reportDirty = true
    return { ok: true, dispatched: true, childId: childId, id: id, dir: relDir, trigger: trigger, format: o.format, lang: o.lang, compilePdf: o.compilePdf }
  }
  /**
   * 触发入口（spec §2/§3 + 修订 §A2/§A3）：自动（收口）与手动命令共用。
   * 幂等 = **同一 run（scheduler.startedAt）+ finalizedAt + 逐产物存在性**（修订 §C）；force 跳过全部检查。
   * 已有定稿但缺产物 → 用已存内容补写（不重新派遣作者）。别的会话持有 paper 锁 → 跳过并留痕。
   */
  async function maybeWritePaper(trigger, opts) {
    const o = paperOpts(opts)
    const id = paperId(opts)
    const relDir = paperDir(id)
    const meta = await paperReadMeta(id)
    const sameRun = !!meta && Number(meta.runStartedAt || 0) === (Number(scheduler.startedAt) || 0)
    if (!o.force && meta && meta.finalizedAt && sameRun) {
      const missing = await paperMissingArtifacts(id, o)
      if (missing.length === 0) {
        await paperAppendLog(id, 'skip', '幂等：同一 run（' + (Number(scheduler.startedAt) || 0) + '）已有定稿且产物齐全 → 不重复撰写（/vibe paper force 可重写）')
        return { ok: true, skipped: true, reason: 'already-finalized-this-run', id: id, dir: relDir, finalizedAt: meta.finalizedAt, artifacts: meta.artifacts || {}, compile: meta.compile, note: '同一 run 只写一次；重复触发只补写缺失产物（spec §2）' }
      }
      await paperAppendLog(id, 'fill', '幂等：已有定稿但缺少 ' + missing.join(', ') + ' → 用已存的定稿内容补写（不重新派遣作者）')
      const filled = await paperEmitArtifacts(id, o, { title: meta.title, abstract: meta.abstract, sections: meta.sectionBodies || {}, evidence: meta.evidence, raw: meta.raw, notes: (meta.notes || []).concat(['补写缺失产物：' + missing.join(', ')]), trigger: meta.trigger || trigger, material: meta.material })
      return { ok: true, skipped: true, reason: 'filled-missing-artifacts', filled: missing, id: id, dir: relDir, finalizedAt: filled.finalizedAt, artifacts: filled.artifacts, compile: filled.compile }
    }
    if (paperInFlight) {
      const verdict = paperWriterVerdictNow(o.force)
      if (verdict === 'reap') {
        const gone = agentRegistry[paperInFlight] === undefined
        await paperReapWriter(id, gone ? '子代理已不在 agentRegistry（end 事件丢失 / 宿主丢弃）' : ('超过卡死窗口 ' + Math.round(PAPER_STALE_MS / 60000) + ' 分钟未返回'))
        // 回收后继续走下面的 paper 锁 + 派遣路径（force 与收口重试都是这个语义）
      } else if (verdict === 'refuse') {
        const ageMs = now() - Number(paperInFlightAt || 0)
        await paperAppendLog(id, 'force-refused', '仍有在途撰写者 ' + paperInFlight + '（' + Math.round(ageMs / 1000) + 's）：超过 ' + Math.round(PAPER_STALE_MS / 60000) + ' 分钟才会被 force 放弃')
        return { ok: false, reason: 'writer-in-flight', childId: paperInFlight, ageMs: ageMs, staleMs: PAPER_STALE_MS, id: id, dir: relDir, message: '已有在途的论文撰写子代理 ' + paperInFlight + '（已 ' + Math.round(ageMs / 1000) + 's 未返回）。等它返回，或等超过 ' + Math.round(PAPER_STALE_MS / 60000) + ' 分钟后 force 会自动回收并重派（心跳也会自动回收）。' }
      } else {
        return { ok: true, skipped: true, reason: 'writer-in-flight', childId: paperInFlight, ageMs: now() - Number(paperInFlightAt || 0), staleMs: PAPER_STALE_MS, id: id, dir: relDir }
      }
    }
    if (paperPending) return { ok: true, queued: true, reason: 'retry-queued', retryAt: paperPending.retryAt, tries: paperPending.tries, id: id, dir: relDir }
    const lock = await paperLockAcquire(id)
    if (!lock.ok) {
      await paperAppendLog(id, 'skip', 'paper 锁由会话 ' + lock.holder + ' 持有（未过期）→ 本次不派遣（修订 §A3 的 paper 作用域锁）')
      return { ok: true, skipped: true, reason: 'locked-by-another-session', holder: lock.holder, id: id, dir: relDir }
    }
    return await paperDispatch(trigger, o, id, 0)
  }
  /** apply 级心跳用：有排队的论文派遣且到点了吗（同步判断，便宜）。 */
  function paperRetryDue() { return !!(paperPending && now() >= Number(paperPending.retryAt || 0)) }
  /**
   * 心跳（修订 §1）：在途 → 续租 paper 锁；**卡死则自动回收**（child 不在注册表，或超过卡死窗口），
   * 并自动重派（上限 PAPER_MAX_AUTO_REAPS，之后给出可执行提示交给 /vibe paper force）；有排队则重试派遣。
   */
  async function runPaperRetry() {
    const id = paperId()
    if (paperInFlight) {
      if (paperWriterVerdictNow(false) === 'reap') {
        const gone = agentRegistry[paperInFlight] === undefined
        await paperReapWriter(id, gone ? '子代理已不在 agentRegistry（end 事件丢失 / 宿主丢弃）' : ('超过卡死窗口 ' + Math.round(PAPER_STALE_MS / 60000) + ' 分钟未返回'))
        const meta = await paperReadMeta(id)
        if (params.finalPaper !== false && !(meta && meta.finalizedAt) && Number(paperReaps || 0) < PAPER_MAX_AUTO_REAPS) {
          paperReaps = Number(paperReaps || 0) + 1
          await paperAppendLog(id, 'retry-after-reap', '第 ' + paperReaps + ' 次自动重派（上限 ' + PAPER_MAX_AUTO_REAPS + '）')
          await paperDispatch('auto-retry', paperOpts({}), id, 0)
        } else {
          await paperAppendLog(id, 'reap-giveup', '自动重派已达上限 ' + PAPER_MAX_AUTO_REAPS + '（或已有定稿）：不再自动派遣，请用 /vibe paper force 手动重写')
          logActivity('paper', '论文撰写子代理连续卡死/已放弃：不再自动重派，可用 /vibe paper force 手动重写')
        }
        return
      }
      try { await paperLockAcquire(id) } catch (e) { /* 续租失败不致命 */ }
      return
    }
    if (!paperRetryDue()) return
    const p = paperPending
    paperPending = null
    const o = paperOpts(p.opts)
    await paperDispatch(p.trigger || 'auto-retry', o, id, Number(p.tries || 0))
  }
  /** `/vibe paper [lang=zh|en] [format=both|md|tex] [force]`（spec §2/§6）。非法参数 → ok:false（命令层转 kind:'error'）。 */
  async function paperCommand(args) {
    const rest = Array.isArray(args) ? args : []
    const opts = {}
    for (let i = 0; i < rest.length; i++) {
      const a = String(rest[i] || '')
      if (a === 'force') { opts.force = true; continue }
      const eq = a.indexOf('=')
      const k = eq > 0 ? a.slice(0, eq).toLowerCase() : ''
      const v = eq > 0 ? a.slice(eq + 1).toLowerCase() : ''
      if (k === 'lang') { if (v !== 'zh' && v !== 'en') return { ok: false, message: '/vibe paper lang= 只接受 zh|en（收到 ' + JSON.stringify(a) + '）' }; opts.lang = v; continue }
      if (k === 'format') { if (v !== 'both' && v !== 'md' && v !== 'tex') return { ok: false, message: '/vibe paper format= 只接受 both|md|tex（收到 ' + JSON.stringify(a) + '）' }; opts.format = v; continue }
      return { ok: false, message: 'unknown /vibe paper option: ' + a + '（可用 lang=zh|en、format=both|md|tex、force）' }
    }
    const r = await maybeWritePaper('manual', opts)
    if (r.ok === false) return r
    const autoNote = params.finalPaper === false ? '（自动触发已关闭 finalPaper=false；手动命令仍可用）' : ''
    const msg = r.dispatched ? ('已派遣「论文撰写」子代理，产物将写入 ' + r.dir + '/')
      : r.queued ? ('宿主激活上限已满：论文撰写已排队，' + (PAPER_RETRY_MS / 1000) + 's 后自动重试（第 ' + r.tries + ' 次）')
        : (r.reason === 'already-finalized-this-run' ? '同一 run 已有定稿且产物齐全：不重复撰写（需要重写请用 /vibe paper force）'
          : (r.reason === 'filled-missing-artifacts' ? ('已用既有定稿补写缺失产物：' + (r.filled || []).join(', ')) : ('未重新派遣：' + (r.reason || ''))))
    return Object.assign({}, r, { message: msg + autoNote, autoDisabled: params.finalPaper === false })
  }
  /** 论文撰写子代理结束（spec §4）：解析回复 → 组装 9 节 → 落盘 → 编译 → 记日志 → 释放 paper 锁。 */
  async function handlePaperWriter(childId, meta, output) {
    const id = meta.paperId || paperId()
    paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0
    delete paperAbandoned[childId]
    const o = paperOpts({ lang: meta.lang, format: meta.format, compilePdf: meta.compilePdf })
    const parsed = parseJson(output)
    const info = paperSkeletonFromReply(parsed, output)
    if (!info.title) info.title = paperTitleFromMd(String(output || '')) || ('研究报告：' + currentProject)
    for (let i = 0; i < info.notes.length; i++) await paperAppendLog(id, 'note', info.notes[i])
    if (!String(output || '').trim()) await paperAppendLog(id, 'reply', '作者回复为空：只写骨架 + 占位说明（绝不编造内容）')
    let written
    try {
      written = await paperEmitArtifacts(id, o, { title: info.title, abstract: info.abstract, sections: info.sections, raw: String(output || ''), notes: info.notes, trigger: meta.trigger || 'auto', material: paperMaterialSummary(await buildPaperDigest()) })
    } catch (e) {
      await paperAppendLog(id, 'finalize-failed', String((e && e.message) || e))
      logActivity('paper', '论文落盘失败：' + String((e && e.message) || e))
      await paperLockRelease(id)
      return
    }
    await paperAppendLog(id, 'finalize', '产物 ' + JSON.stringify(written.artifacts) + ' compile=' + written.compile + (written.compileEngine ? (' engine=' + written.compileEngine) : '') + ' run=' + (Number(scheduler.startedAt) || 0))
    logActivity('paper', '论文（最终稿）已落盘：' + paperDir(id) + '/（' + Object.keys(written.artifacts).filter(function (k) { return written.artifacts[k] }).join('/') + '，编译=' + written.compile + '）')
    await paperLockRelease(id)
    reportDirty = true
    await saveAll()
  }
  /** status 里的论文视图（可观测性；命令与守卫都读它）。 */
  async function paperStatusView() {
    const id = paperId()
    const meta = await paperReadMeta(id)
    return {
      id: id, dir: paperDir(id), inFlight: paperInFlight || null,
      inFlightSince: paperInFlight ? Number(paperInFlightAt || 0) : null,
      inFlightAgeMs: paperInFlight ? (now() - Number(paperInFlightAt || 0)) : null,
      staleMs: PAPER_STALE_MS, reapedThisRun: Number(paperReaps || 0),
      queued: paperPending ? { tries: paperPending.tries, retryAt: paperPending.retryAt, reason: paperPending.reason, limit: paperPending.limit === undefined ? null : paperPending.limit } : null,
      autoFinalPaper: params.finalPaper !== false, format: params.paperFormat, language: params.paperLanguage, compilePdf: params.paperCompilePdf !== false,
      finalizedAt: meta ? meta.finalizedAt : null, artifacts: meta ? (meta.artifacts || {}) : {}, compile: meta ? meta.compile : null,
    }
  }

  // ================= child result dispatch =================
  async function onChildEnd(info) {
    const meta = agentRegistry[info.id]
    if (meta === undefined) {
      // 已放弃（回收）的撰写者事后才返回：输出被丢弃，但必须**留痕**，不能静默消失（修订 §1）。
      if (paperAbandoned[info.id]) {
        delete paperAbandoned[info.id]
        logActivity('paper', '已回收的论文撰写子代理 ' + info.id + ' 事后返回：其输出被丢弃（已重派新的撰写者）')
        reportDirty = true
      }
      return
    }
    const output = blocksToText(info.lastAssistantMessage)
    try {
      if (meta.role === 'explorer') await handleExplorer(info.id, meta, output)
      else if (meta.role === 'solver') await handleSolver(info.id, meta, output, info.stopReason)
      else if (meta.role === 'verifier') await handleVerifier(info.id, meta, output, info.stopReason)
      // 修订 §A2：论文撰写子代理必须有**自己的分支**——此前未知 role 会静默丢失（撰写成果永远落不了盘）。
      else if (meta.role === 'paper') await handlePaperWriter(info.id, meta, output)
      else console.error('vibe-math-v2: subagent ' + info.id + ' ended with an unknown role "' + String(meta.role) + '" — its output is dropped')
    } catch (e) { console.error('vibe-math-v2 onChildEnd error: ' + String((e && e.stack) || e)) }
    await saveAll()
    scheduleTick()
  }

  // ================= init / control =================
  async function init(fresh) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    currentProject = await readCurrentProject(); await ensureDirs()
    if ((await readJson('qs/qs.json')) === undefined) await writeJson('qs/qs.json', [])
    params = Object.assign({}, DEFAULT_PARAMS); await loadSettings(); await migrateLegacyParams(); await loadState()
    // Distinguish same-process continue from cross-process restart via processEpoch:
    // equal epoch = same process (pause→resume; children may still be alive), different
    // epoch = previous process wrote this state (in-flight children are gone).
    const prevEpoch = await readJson('VibeMath_State/process_epoch.json')
    const stale = typeof prevEpoch === 'string' && prevEpoch !== processEpoch
    if (fresh || stale) {
      if (fresh) { const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]) }
      if (Object.keys(agentRegistry).length > 0 || Object.keys(tasks).length > 0) {
        logActivity(fresh ? 'start' : 'resume', 'cleared ' + Object.keys(agentRegistry).length + ' agent(s) and ' + Object.keys(tasks).length + ' task(s) (' + (fresh ? 'restart' : 'stale from previous process') + ')')
        agentRegistry = {}; tasks = {}
        // 论文的派遣态是本进程内存态：子代理已被中断/丢弃，排队与在途标记必须一起清掉，
        // 否则 paperInFlight 会永久挡住后续 /vibe paper（修订 §A2 的"静默消失"同类问题）。
        if (paperInFlight || paperPending) logActivity('paper', '重启/跨进程恢复：清空论文撰写态（inFlight=' + (paperInFlight || '-') + (paperPending ? ', queued' : '') + '）')
        paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null
      }
      // 并发计数由 agentRegistry 推导：清空 registry 后自然归零，无需显式赋值。
    }
    await writeJson('VibeMath_State/process_epoch.json', processEpoch)
    // Lean 异步作业的崩溃恢复（spec §2.6）：**同一进程 continue 不重驱**（作业还在内存队列里正常跑），
    // 只有"新进程/新会话接手这棵树"（fresh 或 stale epoch）才按 Formal/Jobs/*.json 恢复；
    // 恢复绝不置 passed（settle 的唯一判据仍然要重新校验内容哈希与 exit code）。
    if (fresh || stale) { try { await recoverLeanJobs() } catch (e) { console.error('vibe-math-v2: lean job recovery failed: ' + String((e && e.message) || e)) } }
    // 数学计算的引擎探测（异步）在 init 时先跑一次：提示词侧只读缓存现算（mathWorkLine）。
    try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响 init：mathWorkLine 会因此为空 */ }
    await saveAll()
    return { ok: true }
  }
  async function startScheduler() { const r = await init(true); if (!r.ok) return r; abandonGatedDecision('scheduler restarted'); scheduler.running = true; scheduler.startedAt = now(); logActivity('start', 'scheduler started for project ' + currentProject); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler() { const r = await init(false); if (!r.ok) return r; abandonGatedDecision('scheduler resumed (离开那次运行，挂起的节点不再等待)'); scheduler.running = true; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; abandonGatedDecision('scheduler aborted'); const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); agentRegistry = {}; paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null; logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  // auto 模式语义 = 无人值守自动通过关键节点：切回 auto 时把仍挂起的人工决策按自动策略放行
  async function autoResolvePending() {
    const pending = decisionQueue.filter(function (d) { return d.status === 'pending' })
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]
      try {
        if (d.node === 'spawn') { await spawnChild(d.data.label, d.data.promptText, d.data.meta); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'verdict') { const applied = await settleVerdict(d.data.task, d.data.verdict); delete tasks[d.data.task.id]; d.status = 'resolved'; d.resolution = { action: 'approve', auto: true, applied: applied } }
      } catch (e) {
        // 副作用失败必须把该决策落到终态，否则它会永远保持 pending：此后每次切 auto 都在同一个
        // 决策上重新抛错，而 gate 又指向它 —— 调度永久卡死。标为 resolved(auto-failed) 并让它过去，
        // 由 activity log 留下证据；宁可这一次节点未执行，也不能让整条管线停摆。
        console.error('vibe-math-v2: auto-resolve decision failed: ' + String((e && e.message) || e))
        d.status = 'resolved'
        d.resolution = { action: 'auto-failed', auto: true, error: String((e && e.message) || e) }
        logActivity('gate', 'auto-resolve failed for ' + d.id + ' (' + d.node + '), marked resolved to avoid a permanent stall: ' + String((e && e.message) || e))
      }
    }
    if (pending.length > 0) { scheduler.gate = null; logActivity('mode', 'switched to auto — auto-resolved ' + pending.length + ' pending decision(s)'); await saveAll(); scheduleTick() }
  }
  async function getStatus() {
    const qs = await getQs(); const propos = await getPropos()
    return {
      ok: true, initialized: rootAgent !== undefined, running: scheduler.running,
      project: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects'),
      mode: params.mode, activeCount: activeCount(), maxParallelThreshold: params.maxParallelThreshold,
      frameworkRoot: frameworkRoot(),
      problems: { total: qs.length, solved: qs.filter(function (q) { return q.已解决 }).length },
      propositions: { total: propos.length, resolved: propos.filter(function (p) { return p.布尔估计 === 1 || p.布尔估计 === 0 }).length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,
      registeredAgents: Object.keys(agentRegistry).length,
      recentActivity: activityLog.slice(-Math.min(ACTIVITY_REPORT_MAX, Number(params.activityLogCap) || 100)), params: params,
      formal: {
        mode: formalMode(), required: formalRequired(),
        leanCommand: params.leanCommand, leanArgs: params.leanArgs, leanTimeoutMs: params.leanTimeoutMs,
        objects: Object.keys(formalRecords()).map(function (k) { const r = formalRecords()[k] || {}; return { target: k, status: r.status, file: r.file, proof: r.proof, note: r.note } }),
        todo: formalTodo(),
        paths: { project: 'Formal/', lib: vibeRoot() + '/Formal/Lib/', proved: vibeRoot() + '/Formal/Proved/', proofs: 'Verified/Lean/' },
      },
      // 最终论文的可观测面（spec §2/§6）：自动开关、在途/排队、定稿时间、产物与编译结果。
      paper: await paperStatusView(),
    }
  }

  // ================= projects =================
  async function setProject(slug, create) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    const exists = (await listDirsAt(vibeRoot(), 'Projects')).indexOf(slug) !== -1
    if (!create && !exists) return { ok: false, message: 'project not found: ' + slug }
    if (scheduler.running) await abortScheduler()
    else abandonGatedDecision('project switched')
    currentProject = slug; await writeCurrentProject(); await ensureDirs()
    if ((await readJson('qs/qs.json')) === undefined) await writeJson('qs/qs.json', [])
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; lastReportWrite = 0; lastPushReport = 0; reportDirty = false; paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null
    formalState = { records: {}, todo: [] } // 形式化记录随项目切换（loadState 会读新项目的 formal.json）
    await loadSettings(); await migrateLegacyParams(); await loadState()
    // 切到/新建一个项目 = "接手这棵树的遗留作业"：Formal/Jobs/*.json 里本进程不认识的记录按 §2.6 恢复
    // （queued 重入队 / running 标记 interrupted / settled 只在哈希与构建上下文都一致时补写）。
    try { await recoverLeanJobs() } catch (e) { console.error('vibe-math-v2: lean job recovery on project switch failed: ' + String((e && e.message) || e)) }
    // 切项目后引擎探测缓存过期（mathEngines/路径可能不同）：重探一次再让提示词读它。
    try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响切换 */ }
    await saveAll()
    return { ok: true, project: slug, frameworkRoot: frameworkRoot() }
  }

  // ================= events / timer =================
  // NOTE: subagent/end listener and the tick timer are registered ONCE at the
  // apply level (below), routing through childOwner/sessions — NOT here, because
  // the standing-mount plugin instance is shared by every session.

  // ================= tools =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  const handlers = {}
  function registerTool(name, description, parameters, executeFn) { handlers[name] = executeFn }
  // math_computation 的**会话层**注册（共享模块的 host 在上面构造，绑定本会话的 params/Paths/fs）。
  // 模块调用一次 host.register(...) ⇒ handlers['math_computation'] = 该会话的 handler；
  // apply 层（工具面）在 apply 作用域单独注册一次，按名路由回这里（FREEZE §4 要求两层都在）。
  mathTool = registerMathComputation(mathHost)
  // 会话层挂载（**字面量形态**）：handler 是模块为**本会话**构造的那一个（闭包住本会话的 params/Paths/fs）；
  // apply 层的同名词由宿主按 handlerName 路由回这里。两条路径的名字/描述/schema 三处逐字一致。
  registerTool('math_computation', MATH_TOOL_DESCRIPTION, MATH_TOOL_SCHEMA, async function (args, agent) { return await mathTool.handler(args || {}, agent) })
  // Lean 工具需要知道调用者是谁（记进活动日志与索引署名）。调用者身份**显式传递**，
  // 不从任何全局可变状态推断（审计清单 §1.1）。无法识别时退回 'office'。
  function memberIdOf(agent) { try { const id = agent && agent.id ? String(agent.id) : ''; return id || 'office' } catch (e) { return 'office' } }
  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math V2 scheduler for the current project.', objParams({}), async function () { return await startScheduler() })
  registerTool('vibe_math_resume', 'Resume the Vibe Math V2 scheduler after a checkpoint/restart.', objParams({}), async function () { return await resumeScheduler() })
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), async function () { return await pauseScheduler() })
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), async function () { return await abortScheduler() })
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), async function () { await refreshParams(); return await getStatus() })
  registerTool('vibe_math_report', 'Return the full progress report and write it to Progress_Logs/report.json.', objParams({}), async function () { await refreshParams(); await maybeWriteReport(true); return await buildReport() })
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), async function (args) { params.mode = args.mode; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } })
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象的 formal.status 未达到 passed/blocked 之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式（框架会在用户 leanArgs 之后、文件名之前自动追加 `--search-path <VibeMath 根>`，用户已显式给出就不注入）；leanAsync = true（默认，后台队列：入队即返回，只有作业落地 ok 才置 passed 并写归档证明）| false（同步 await 的旧语义）。最终论文：finalPaper（默认 true；收口时自动派遣一名「论文撰写」子代理）/ paperFormat = both|md|tex / paperLanguage = zh|en / paperCompilePdf（检测到 LaTeX 时编译 paper.pdf）/ paperLatexCommand（指定引擎，空 = 自动探测），产物在 Paper/<项目>/。数学计算（工具 math_computation，回执落在 Computation/<id>/）：mathComputation = off|auto|on（默认 auto；off 时提示词零提及）· mathMode = typed|typed+shell（默认 typed+shell；typed 时提示词不含 shell 兜底段且 cli 返回 REFUSED{reason:policy}）· mathEngines = 允许的引擎列表（默认含 cli，cli 默认开启）· mathTimeoutMs（默认 60000，最小 1000；到时主动 terminate）· mathPackages（需预检的包，缺包只报告+给安装计划）· mathInstallScope = user|system（默认 user；system 只对当次显式调用生效、永不记忆）。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, verifierAllowNetwork: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, solverAllowScripts: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, verifierAllowScripts: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' }, leanAsync: { type: 'boolean' }, leanJobsMaxParallel: { type: 'integer' }, leanInitiative: { type: 'string', enum: ['off', 'normal', 'eager'] }, leanSearchPaths: { type: 'array', items: { type: 'string' } }, mathComputation: { type: 'string', enum: ['off', 'auto', 'on'] }, mathMode: { type: 'string', enum: ['typed', 'typed+shell'] }, mathEngines: { type: 'array', items: { type: 'string' } }, mathTimeoutMs: { type: 'integer' }, mathPackages: { type: 'array', items: { type: 'string' } }, mathInstallScope: { type: 'string', enum: ['user', 'system'] }, finalPaper: { type: 'boolean' }, paperFormat: { type: 'string', enum: ['both', 'md', 'tex'] }, paperLanguage: { type: 'string', enum: ['zh', 'en'] }, paperCompilePdf: { type: 'boolean' }, paperLatexCommand: { type: 'string' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); if (args && MATH_PARAM_NAMES.some(function (k) { return k in args })) { try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响参数保存 */ } } return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), async function () { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs/qs.json.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), async function (args) { const qs = await getQs(); if (qs.some(function (q) { return q.id === args.id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: args.id, 概述: args.description, 已解决: false, 解法列表: [], 优先级: args.priority || 0, progress: { directions: [] } }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } })
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (with 概述, 布尔估计, 细类型, 优先级, 价值/关键性).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 布尔估计: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 细类型: { type: 'object' } }, ['id', '概述']), async function (args) {
    const p = { id: args.id, 概述: args.概述, 布尔估计: clamp01(args.布尔估计 != null ? args.布尔估计 : 0.5), 细类型: (args.细类型 && typeof args.细类型 === 'object') ? args.细类型 : { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: (args.优先级 != null) ? args.优先级 : 1, '价值/关键性': clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), progress: { 来源: 'user', 说明: '用户手动添加。' } }
    await upsertProposition(p); scheduleTick(); return { ok: true, proposition: p, file: proposFile(categoryOf(p)) }
  })
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index: id, 概述, 布尔估计, 优先级, 价值/关键性, category, 依赖假设).', objParams({}), async function () { const all = await getPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 概述: p.概述, 布尔估计: p.布尔估计, 优先级: p.优先级, '价值/关键性': p['价值/关键性'], category: p._category, 依赖假设: p.依赖假设, 依赖假设已证伪: p.依赖假设已证伪 } }) } })
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, true) })
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, false) })
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), async function () { return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') } })
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), async function () { return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) } })
  registerTool('vibe_math_decide', 'Resolve a pending manual decision (verdict override uses verdict: 1|0).', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), async function (args) { const d = decisionQueue.find(function (x) { return x.id === args.id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; const resolution = { action: args.action, verdict: args.verdict }; const applied = await applyDecision(d.node, d.data, resolution); const r = await resolveDecision(args.id, resolution); return Object.assign({ ok: true, applied: applied }, r) })
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), async function () { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round, rId: m.rId }) } return { ok: true, agents: out, count: out.length } })
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), async function (args) { if (!agentRegistry[args.childId]) return { ok: false, message: 'unknown childId' }; await followupChild(args.childId, args.message); return { ok: true, message: 'message delivered' } })
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), async function (args) { await interruptChild(args.childId); return { ok: true, message: 'interrupt requested' } })
  // ---- Lean 形式化验证（契约 §5）----
  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain on one .lean file inside the VibeMath root and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), async function (args, agent) { return await leanRunTool(memberIdOf(agent), args) })
  registerTool('vibe_math_lean_archive', '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind="lemma": a machine-checked lemma → Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), async function (args, agent) { return await leanArchive(memberIdOf(agent), args) })
  registerTool('vibe_math_lean_lib', '(member) List (and by default rebuild) the Lean reuse library: this project\'s Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining. Also reports the background compile jobs (jobs[]) when leanAsync=true.', objParams({ refresh: { type: 'boolean' } }), async function (args) {
    const noRefresh = !!(args && args.refresh === false)
    const r = noRefresh ? { lib: null, proved: null, objects: Object.keys(formalRecords()).length } : await rebuildLeanLibIndexes()
    const jobs = []
    for (const j of leanJobs.values()) jobs.push(Object.assign(leanJobPublic(j), { exitCode: j.exitCode === undefined ? null : j.exitCode, paths: leanJobPaths(j), buildSha256: j.buildSha || '' }))
    jobs.sort(function (a, b) { return (b.settledAt || 0) - (a.settledAt || 0) || String(a.jobId).localeCompare(String(b.jobId)) })
    return {
      ok: true, mode: formalMode(), rebuilt: !noRefresh,
      counts: r, todo: formalTodo(),
      async: params.leanAsync !== false,
      jobs: jobs,
      objects: Object.keys(formalRecords()).map(function (k) { const rec = formalRecords()[k] || {}; return { target: k, status: rec.status, file: rec.file, proof: rec.proof, note: rec.note, async: rec.async || null } }),
      paths: { project: 'Formal/（相对项目根）', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/', proofs: 'Verified/Lean/', searchPath: vibeRoot(), jobs: 'Formal/Jobs/' },
      hint: '复用优先：先在 Lib/ 里找现成定义（vibe_math_lean_read 可看原文）；新定义用 vibe_math_lean_archive kind=\'def\' 归档，已证引理用 kind=\'lemma\'（归档前先跑通，跑不通不要入库）。异步档用 jobs 字段查后台编译：**只有 state=settled 才是通过**。',
    }
  })
  registerTool('vibe_math_lean_read', '(member) Read back the original text of one archived Lean file (verbatim reuse). Only files under Formal/Lib and Formal/Proved are readable; name is id-sanitised and path escapes are rejected. Returns {ok,name,file,kind,sha256,bytes,text,truncated} (text capped at 64KB).', objParams({ name: { type: 'string' }, kind: { type: 'string', enum: ['auto', 'lib', 'proved'] } }, ['name']), async function (args) { return await leanReadTool(args) })
  registerTool('vibe_math_lean_job', '(member) Read-only view of the background Lean compile jobs. Without jobId: the session job list (state/rel/target/attempts/paths). With jobId: that job state/exitCode/receipt + archive paths. waitMs>0 waits up to that many ms for a queued/running job to settle (polling; it does not block the heartbeat) and returns the current state on timeout. Only state=settled with exitCode=0 (same content hash AND same build context) counts as passed.', objParams({ jobId: { type: 'string' }, waitMs: { type: 'integer' } }), async function (args) { return await leanJobTool(args) })

  // ================= slash command /vibe =================
  async function dispatchVibeCommand(cmd, args) {
    if (cmd === 'start') return await startScheduler()
    if (cmd === 'resume') return await resumeScheduler()
    if (cmd === 'pause') return await pauseScheduler()
    if (cmd === 'abort') return await abortScheduler()
    if (cmd === 'status') { await refreshParams(); return await getStatus() }
    if (cmd === 'report') { await refreshParams(); await maybeWriteReport(true); return await buildReport() }
    if (cmd === 'mode') { params.mode = (args[0] === 'manual') ? 'manual' : 'auto'; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } }
    if (cmd === 'setup') { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } }
    if (cmd === 'save') return await saveSettings()
    if (cmd === 'template') return await createTemplate(args[0] === 'project' ? 'project' : 'global')
    if (cmd === 'add') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; const qs = await getQs(); if (qs.some(function (q) { return q.id === id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: id, 概述: desc, 已解决: false, 解法列表: [], 优先级: 0, progress: { directions: [] } }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } }
    if (cmd === 'add-proposition') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add-proposition <id> <概述>' }; const p = { id: id, 概述: desc, 布尔估计: 0.5, 细类型: { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: 1, '价值/关键性': 0.5, progress: { 来源: 'user-vibe', 说明: '用户通过 /vibe 添加。' } }; await upsertProposition(p); scheduleTick(); return { ok: true, proposition: p, file: proposFile(categoryOf(p)) } }
    if (cmd === 'list-propositions') { const all = await getPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 概述: p.概述, 布尔估计: p.布尔估计, 优先级: p.优先级, '价值/关键性': p['价值/关键性'], category: p._category } }) } }
    if (cmd === 'project') {
      if (args.length === 0 || args[0] === 'list') return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') }
      if (args[0] === 'new') return await setProject(slugify(args.slice(1).join(' ')), true)
      return await setProject(slugify(args[0]), false)
    }
    if (cmd === 'decisions') return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) }
    if (cmd === 'agents') { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round }) } return { ok: true, agents: out } }
    if (cmd === 'paper') return await paperCommand(args)
    return { ok: false, usage: 'start | resume | pause | abort | status | report | mode <auto|manual> | setup | save | template [global|project] | add <id> <desc> | add-proposition <id> <概述> | list-propositions | project [list|new <name>|<name>] | decisions | agents | paper [lang=zh|en] [format=both|md|tex] [force]', message: 'unknown /vibe subcommand: ' + (cmd || '(empty)') }
  }

  // ================= session surface =================
  return {
    sessionId: sessionId,
    scheduler: scheduler,
    tickInFlight: tickInFlight,
    scheduleTick: scheduleTick,
    onChildEnd: onChildEnd,
    dispatchVibeCommand: dispatchVibeCommand,
    handlers: handlers,
    // 每次工具调用前同步当前项目（按会话读 current.json；多会话互不干扰）
    refreshProject: async function () { if (rootAgent) currentProject = await readCurrentProject() },
    getRunning: function () { return scheduler.running },
    // apply 级心跳用（修订 §A2）：running=false 之后 scheduleTick() 是空操作，论文的排队重试
    // （激活上限）与 paper 锁续租必须由**独立于调度器**的心跳驱动。
    paperRetryDue: paperRetryDue,
    runPaperRetry: runPaperRetry,
    // Lean 异步队列（spec §2）：心跳推进队列；dispose 时由 apply 级 disposer 终止在跑的编译。
    runLeanQueue: runLeanQueue,
    disposeLeanJobs: disposeLeanJobs,
    // 数学计算（FREEZE §4）：心跳用 TTL 刷新探测缓存；off 档不探测（真 no-op）。
    mathProbeDue: mathProbeDue,
    refreshMathProbe: refreshMathProbe,
    mathProbe: function () { return mathProbe },
    // P2a：persona 两个文本块必须含的「归档→编辑→重跑」规则（文本取自共享模块常量，persona 不手抄）。
    mathArchiveWorkflowLine: MATH_ARCHIVE_WORKFLOW_LINE,
    leanQueueSize: function () { return leanQueue.length },
    leanJobsPublic: function () { const out = []; for (const j of leanJobs.values()) out.push(leanJobPublic(j)); return out },
    // childOwner 裁剪用：这个会话当前仍"可能再发 subagent/end"的 child（在册的 + 任务正在等的）。
    referencedChildIds: function () {
      const out = Object.keys(agentRegistry)
      const ids = Object.keys(tasks)
      for (let i = 0; i < ids.length; i++) {
        const t = tasks[ids[i]]
        if (t && Array.isArray(t.children)) for (let j = 0; j < t.children.length; j++) out.push(t.children[j])
      }
      return out
    },
    // Lean 形式化验证（docs/formal-verification.md）：状态与工具的内部入口，
    // 供状态/报告与测试直接读取，不必绕过工具层。
    formalMode: formalMode, formalOn: formalOn, formalRequired: formalRequired, formalGateOk: formalGateOk,
    formalRecords: formalRecords, formalTodo: formalTodo, formalOf: formalOf,
    rebuildLeanLibIndexes: rebuildLeanLibIndexes, leanArchive: leanArchive, leanRunTool: leanRunTool,
    writeFormalIndex: writeFormalIndex, writeFormalTodo: writeFormalTodo,
    leanRunToolApi: async function (relPath, timeoutMs) { return await leanRunFile(relPath, timeoutMs) },
    // 会话自己的心跳节流：timer 每 1s 询问是否到点；tick 执行时刷新 lastTickAt
    tickDue: function () { const iv = Math.max(200, Number(params.tickIntervalMs) || 2000); return (now() - lastTickAt) >= iv },
  }
}

  // ================= apply-level registrations (ONCE per preset) =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  function registerTool(name, description, parameters, handlerName) {
    ctx.effect(() => tools.register({
      name: name, description: description, parameters: parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async function (args, exec) {
        try {
          const s = getSession(exec && exec.agent)
          if (!s) return JSON.stringify({ ok: false, error: 'no vibe-math session for this agent' })
          await s.refreshProject()
          return JSON.stringify(await s.handlers[handlerName](args || {}, exec && exec.agent))
        } catch (e) { return JSON.stringify({ ok: false, error: String((e && e.message) || e) }) }
      },
    }))
  }
  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math V2 scheduler for the current project.', objParams({}), 'vibe_math_start')
  registerTool('vibe_math_resume', 'Resume the Vibe Math V2 scheduler after a checkpoint/restart.', objParams({}), 'vibe_math_resume')
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), 'vibe_math_pause')
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), 'vibe_math_abort')
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), 'vibe_math_status')
  registerTool('vibe_math_report', 'Return the full progress report and write it to Progress_Logs/report.json.', objParams({}), 'vibe_math_report')
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), 'vibe_math_set_mode')
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象的 formal.status 未达到 passed/blocked 之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式（框架会在用户 leanArgs 之后、文件名之前自动追加 `--search-path <VibeMath 根>`，用户已显式给出就不注入）；leanAsync = true（默认，后台队列：入队即返回，只有作业落地 ok 才置 passed 并写归档证明）| false（同步 await 的旧语义）。最终论文：finalPaper（默认 true；收口时自动派遣一名「论文撰写」子代理）/ paperFormat = both|md|tex / paperLanguage = zh|en / paperCompilePdf（检测到 LaTeX 时编译 paper.pdf）/ paperLatexCommand（指定引擎，空 = 自动探测），产物在 Paper/<项目>/。数学计算（工具 math_computation，回执落在 Computation/<id>/）：mathComputation = off|auto|on（默认 auto；off 时提示词零提及）· mathMode = typed|typed+shell（默认 typed+shell；typed 时提示词不含 shell 兜底段且 cli 返回 REFUSED{reason:policy}）· mathEngines = 允许的引擎列表（默认含 cli，cli 默认开启）· mathTimeoutMs（默认 60000，最小 1000；到时主动 terminate）· mathPackages（需预检的包，缺包只报告+给安装计划）· mathInstallScope = user|system（默认 user；system 只对当次显式调用生效、永不记忆）。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, verifierAllowNetwork: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, solverAllowScripts: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, verifierAllowScripts: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: [''] }] }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' }, leanAsync: { type: 'boolean' }, leanJobsMaxParallel: { type: 'integer' }, leanInitiative: { type: 'string', enum: ['off', 'normal', 'eager'] }, leanSearchPaths: { type: 'array', items: { type: 'string' } }, mathComputation: { type: 'string', enum: ['off', 'auto', 'on'] }, mathMode: { type: 'string', enum: ['typed', 'typed+shell'] }, mathEngines: { type: 'array', items: { type: 'string' } }, mathTimeoutMs: { type: 'integer' }, mathPackages: { type: 'array', items: { type: 'string' } }, mathInstallScope: { type: 'string', enum: ['user', 'system'] }, finalPaper: { type: 'boolean' }, paperFormat: { type: 'string', enum: ['both', 'md', 'tex'] }, paperLanguage: { type: 'string', enum: ['zh', 'en'] }, paperCompilePdf: { type: 'boolean' }, paperLatexCommand: { type: 'string' } }), 'vibe_math_set_params')
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), 'vibe_math_setup')
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), 'vibe_math_save_settings')
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), 'vibe_math_template')
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs/qs.json.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), 'vibe_math_add_problem')
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (with 概述, 布尔估计, 细类型, 优先级, 价值/关键性).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 布尔估计: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 细类型: { type: 'object' } }, ['id', '概述']), 'vibe_math_add_proposition')
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index: id, 概述, 布尔估计, 优先级, 价值/关键性, category, 依赖假设).', objParams({}), 'vibe_math_list_propositions')
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_new_project')
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_set_project')
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), 'vibe_math_list_projects')
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), 'vibe_math_list_decisions')
  registerTool('vibe_math_decide', 'Resolve a pending manual decision (verdict override uses verdict: 1|0).', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), 'vibe_math_decide')
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), 'vibe_math_list_agents')
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), 'vibe_math_message_agent')
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), 'vibe_math_interrupt_agent')

  // ── Lean 形式化验证（docs/formal-verification.md §5）─────────────────────────
  // 三个工具**无条件注册**：工具注册是静态的（动态注册会依赖运行时开关，破坏既有
  // `ctx.effect` 纪律），而档位只决定"框架是否告诉成员它们存在"。off 档下它们照常工作，
  // 人/代理主动调用时一样可用。
  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain on one .lean file inside the VibeMath root and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), 'vibe_math_lean_run')
  registerTool('vibe_math_lean_archive', '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind="lemma": a machine-checked lemma → Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), 'vibe_math_lean_archive')
  registerTool('vibe_math_lean_lib', '(member) List (and by default rebuild) the Lean reuse library: this project\'s Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining. Also reports the background compile jobs (jobs[]) when leanAsync=true.', objParams({ refresh: { type: 'boolean' } }), 'vibe_math_lean_lib')
  registerTool('vibe_math_lean_read', '(member) Read back the original text of one archived Lean file (verbatim reuse). Only files under Formal/Lib and Formal/Proved are readable; name is id-sanitised and path escapes are rejected. Returns {ok,name,file,kind,sha256,bytes,text,truncated} (text capped at 64KB).', objParams({ name: { type: 'string' }, kind: { type: 'string', enum: ['auto', 'lib', 'proved'] } }, ['name']), 'vibe_math_lean_read')
  registerTool('vibe_math_lean_job', '(member) Read-only view of the background Lean compile jobs. Without jobId: the session job list (state/rel/target/attempts/paths). With jobId: that job state/exitCode/receipt + archive paths. waitMs>0 waits up to that many ms for a queued/running job to settle (polling; it does not block the heartbeat) and returns the current state on timeout. Only state=settled with exitCode=0 (same content hash AND same build context) counts as passed.', objParams({ jobId: { type: 'string' }, waitMs: { type: 'integer' } }), 'vibe_math_lean_job')

  // ── math_computation：apply 层（工具面）────────────────────────────────────────────────────
  // 共享模块的 handler 在**会话层**构造（它闭包住该会话的 params/Paths/fs）；这一层只把
  // 工具名/描述/schema 挂到宿主工具面，执行时由 apply 级包装按 handlerName 路由回
  // s.handlers['math_computation']（即上面那个会话级实例）。两层都注册是 v2/v3 的硬要求。
  // **字面量形态**（名字字面量 + 描述/schema 常量）：与 v3 的两层声明保持同一形状，
  // 静态扫描器/注册面审计（audit-registration、audit-v3-registration-parity）都能看见。
  registerTool('math_computation', MATH_TOOL_DESCRIPTION, MATH_TOOL_SCHEMA, 'math_computation')

  // /vibe slash command (registered once; routed per session)
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math V2 solver (start/pause/projects/setup/save/decisions/agents/propositions)',
    input: { hint: '[start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|project [list|new <name>|<name>]|decisions|agents|paper [lang=zh|en] [format=both|md|tex] [force]]' },
    handler: async function (invocation) {
      const s = getSession(invocation && invocation.agent)
      if (!s) return { kind: 'error', text: JSON.stringify({ ok: false, error: 'no vibe-math session for this agent' }) }
      const line = String(invocation && invocation.rawInput ? invocation.rawInput : '').trim()
      const parts = line.length > 0 ? line.split(/\s+/) : []
      const cmd = parts[0] || ''
      const rest = parts.slice(1)
      const result = await s.dispatchVibeCommand(cmd, rest)
      // A business failure (the dispatch result's own ok:false) is a FAILED command: the host's
      // CommandResult union distinguishes success from error, and returning 'success' made a rejected
      // invocation look identical to a successful one in the UI.
      const failed = result !== null && typeof result === 'object' && result.ok === false
      return { kind: failed ? 'error' : 'success', text: JSON.stringify(result, null, 2) }
    },
  }))

  // subagent/end (registered once; routed to the owning session via childOwner)
  ctx.on('subagent/end', function (info) {
    // 记下"这个 child 最近一次 end"的时间：裁剪 childOwner 的宽限期从这里算（见 pruneChildOwner）。
    // **不要**在这里直接回收那条映射：同一个 child 会因辩论/续轮再次 end，丢了映射这次事件就没人路由，
    // 实测后果是 verdict 收口失效（"problem solved after verdict 1"）。回收交给 pruneChildOwner 的
    // 引用 + 宽限期判断。
    lastChildEndAt.set(info.id, now())
    const sid = childOwner.get(info.id)
    const s = sid !== undefined ? sessions.get(sid) : undefined
    if (s) s.onChildEnd(info).catch(function (e) { console.error('vibe-math-v2 onChildEnd reject: ' + String((e && e.stack) || e)) })
  })

  // tick timer (registered once; ticks every running session at its own pace)
  ctx.effect(() => {
    let beat = 0
    const t = setInterval(function () {
      for (const s of sessions.values()) {
        if (s.getRunning() && !s.tickInFlight && s.tickDue() && s.scheduler.gate === null) s.scheduleTick()
        // 论文心跳（修订 §A2）：**独立于 scheduler.running** —— 收口后 running=false，但被激活上限
        // 拒绝的撰写派遣仍要重试，在途时还要续租 paper 锁（否则别的会话 2 分钟后可接管同一棵树）。
        // runPaperRetry() 在两种情形都不成立时立即返回（一次布尔判断）。
        if (typeof s.runPaperRetry === 'function') s.runPaperRetry().catch(function (e) { console.error('vibe-math-v2: paper retry failed: ' + String((e && e.message) || e)) })
        // Lean 异步队列（spec §2.2）：同样独立于 scheduler.running —— 作业在收口后仍要落地。
        // runLeanQueue() 内部**不 await 编译**，所以这条心跳不会被一个编译占住。
        if (typeof s.runLeanQueue === 'function') s.runLeanQueue().catch(function (e) { console.error('vibe-math-v2: lean queue failed: ' + String((e && e.message) || e)) })
        // 数学计算的探测缓存 TTL 刷新（15 分钟或从未探测过）：mathWorkLine 只读缓存，不能自己 await。
        if (typeof s.mathProbeDue === 'function' && s.mathProbeDue()) s.refreshMathProbe(false).catch(function (e) { console.error('vibe-math-v2: math probe failed: ' + String((e && e.message) || e)) })
      }
      // childOwner / sessions 裁剪：每 30 拍（约 30s）一次，成本是"会话数 × 映射数"的一次扫描。
      if ((++beat % 30) === 0) {
        try { pruneChildOwner() } catch (e) { console.error('vibe-math-v2: pruneChildOwner failed: ' + String((e && e.message) || e)) }
        try { pruneSessions() } catch (e) { console.error('vibe-math-v2: pruneSessions failed: ' + String((e && e.message) || e)) }
      }
    }, 1000)
    return () => {
      clearInterval(t)
      // 卸载/销毁：终止在跑的编译并标记 interrupted（不留孤儿进程，spec §2.5）。
      for (const s of sessions.values()) {
        try { if (typeof s.disposeLeanJobs === 'function') s.disposeLeanJobs() } catch (e) { console.error('vibe-math-v2: lean dispose failed: ' + String((e && e.message) || e)) }
      }
    }
  })
}

// ---- test seam: pure, stateless helpers --------------------------------
// These helpers were declared inside `apply()` and are now declared at module scope, so
// `apply()` closes over exactly the same function objects this export hands out. The audit
// suites therefore exercise the REAL implementations by importing this module, instead of
// extracting source text and compiling function bodies through the Function constructor
// (dynamic code execution, rejected by the plugin-catalog security scan as
// DANGEROUS_DYNAMIC_EXECUTION).
//
// Contract: no member may touch `ctx`, session state or mutable module state. Most are pure;
// three are deliberately non-deterministic (`uuid`/`shortId` use Math.random, `fmtTime` falls back
// to the clock) and `parseProgress` normalises the object it is handed in place (pre-existing).
// Nothing here is used by the plugin at runtime except through `apply()`, and behaviour is
// byte-identical to the previous in-`apply` declarations.
// ============================================================================================
// 最终论文（规格：docs/final-paper.md）—— **纯函数部分**（module scope，v2/v3 逐字同构；
// 只有数据来源不同）。会话相关的落盘/派遣/编译在 makeSession 里（见 paperCommand/maybeWritePaper）。
// ============================================================================================
/** 固定 9 节骨架（spec §3）。key 同时是 md 的 `## ` 标题与 tex 的 `\section{}`。 */
const PAPER_SKELETON = [
  { key: '摘要', spec: '1 标题、作者、日期、摘要（原问题 + 主要结论）' },
  { key: '引言与问题背景', spec: '2 原问题的完整陈述' },
  { key: '原问题的完整解法', spec: '3 最终答案 + 完整推理链' },
  { key: '已检验通过的命题', spec: '4 逐条列出，含判定为真的估计值与证据来源' },
  { key: '已解决的子问题与中间成果', spec: '5' },
  { key: '创造或发现的有价值之物', spec: '6 方法、理论、思想、有价值经验、数学理解' },
  { key: '规律总结', spec: '7 从上述条目归纳出的可复用规律' },
  { key: '讨论、局限与展望', spec: '8' },
  { key: '附录：证据与文件索引', spec: '9 Verified/、Logs/、关键卡片路径' },
]
const PAPER_NO_EVIDENCE = '（本节暂无证据支持的内容——不编造。）'
const PAPER_EVIDENCE_HEADING = '证据与文件索引'
/** LaTeX 引擎检测顺序（spec §5）：中文优先 xelatex，英文优先 pdflatex/latexmk。 */
const PAPER_ENGINE_ORDER_ZH = ['xelatex', 'latexmk', 'pdflatex', 'lualatex', 'tectonic']
const PAPER_ENGINE_ORDER_EN = ['pdflatex', 'latexmk', 'xelatex', 'lualatex', 'tectonic']
/** 只用常见宏包（spec §5）；修复阶段会丢弃不在这个名单里的 \usepackage。 */
const PAPER_ALLOWED_PACKAGES = ['amsmath', 'amssymb', 'amsthm', 'geometry', 'hyperref', 'longtable', 'booktabs']
/** tex 必须转义的 10 个字符（spec §5）：\ _ % & # $ { } ~ ^ ——一次替换，避免二次转义。 */
const PAPER_TEX_MAP = { '\\': '\\textbackslash{}', '_': '\\_', '%': '\\%', '&': '\\&', '#': '\\#', '$': '\\$', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }
function texEscape(s) { return String(s == null ? '' : s).replace(/[\\_%&#${}~^]/g, function (c) { return PAPER_TEX_MAP[c] }) }
/** 输入材料摘要（仅供 paper.log.md/meta 记录规模，**不**用于幂等判定：spec v2 §C 用 run id + finalizedAt + 逐产物存在性）。 */
function paperMaterialSummary(digest) {
  const t = String(digest == null ? '' : digest)
  return { chars: t.length, lines: t.split('\n').length }
}
/**
 * 撰写者卡死判定（纯函数，便于守卫覆盖两条分支）：
 *   'none'   正常在途（还没到卡死窗口，且 force 未要求放弃）
 *   'reap'   必须回收：child 已不在 agentRegistry（end 事件丢失 / 宿主丢弃，它永远不会再回来），
 *            或已超过卡死窗口——force 与心跳都据此自动降级，论文不能被一个死掉的撰写者永久卡住
 *   'refuse' force 但还没到窗口：调用方必须给出**可执行**的报错（告诉调用者还要等多久）
 */
function paperWriterVerdict(o) {
  if (!(o && o.inFlight)) return 'none'
  if (o.childInRegistry === false) return 'reap'
  const age = Number((o && o.ageMs) || 0)
  const stale = Math.max(1, Number((o && o.staleMs) || 0))
  if (age >= stale) return 'reap'
  return (o && o.force) ? 'refuse' : 'none'
}
/** 行内 md → tex：``code`` / **bold** / *em* 转成命令，其余文本按 spec §5 转义；`$...$` 原样保留（数学模式由作者书写）。 */
function paperInlineToTex(s) {
  const t = String(s == null ? '' : s)
  let out = ''
  let i = 0
  while (i < t.length) {
    const c = t[i]
    if (c === '$') { const j = t.indexOf('$', i + 1); if (j > i) { out += t.slice(i, j + 1); i = j + 1; continue } }
    if (c === '`') { const j = t.indexOf('`', i + 1); if (j > i) { out += '\\texttt{' + texEscape(t.slice(i + 1, j)) + '}'; i = j + 1; continue } }
    if (c === '*' && t[i + 1] === '*') { const j = t.indexOf('**', i + 2); if (j > i) { out += '\\textbf{' + paperInlineToTex(t.slice(i + 2, j)) + '}'; i = j + 2; continue } }
    if (c === '*') { const j = t.indexOf('*', i + 1); if (j > i) { out += '\\emph{' + paperInlineToTex(t.slice(i + 1, j)) + '}'; i = j + 1; continue } }
    // 普通字符：按 10 个字符的映射逐字转义（一次一个字符，天然不会二次转义）
    out += PAPER_TEX_MAP[c] !== undefined ? PAPER_TEX_MAP[c] : c
    i++
  }
  return out
}
/** md 正文 → tex 正文（标题/列表/段落；只认 compose 侧约定的最小语法）。 */
function paperMdToTexBody(md) {
  const out = []
  let inList = false
  let buf = []
  const flush = function () { if (buf.length) { out.push(paperInlineToTex(buf.join(' '))); buf = [] } }
  const closeList = function () { if (inList) { out.push('\\end{itemize}'); inList = false } }
  const lines = String(md == null ? '' : md).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      flush(); closeList()
      const txt = paperInlineToTex(h[2])
      const lv = h[1].length
      out.push(lv <= 1 ? ('\\section*{' + txt + '}') : lv === 2 ? ('\\section{' + txt + '}') : lv === 3 ? ('\\subsection{' + txt + '}') : ('\\subsubsection{' + txt + '}'))
      continue
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line)
    if (li) { flush(); if (!inList) { out.push('\\begin{itemize}'); inList = true } out.push('  \\item ' + paperInlineToTex(li[1])); continue }
    if (!line.trim()) { flush(); closeList(); out.push(''); continue }
    buf.push(line.trim())
  }
  flush(); closeList()
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
/** 主模板（spec §5）：中文 ctexart / 英文 article，只加常见宏包。 */
function paperTexDoc(o) {
  const lang = (o && o.lang === 'en') ? 'en' : 'zh'
  return [
    '\\documentclass[11pt]{' + (lang === 'en' ? 'article' : 'ctexart') + '}',
    '\\usepackage[margin=2.5cm]{geometry}',
    '\\usepackage{amsmath,amssymb,amsthm}',
    '\\usepackage{hyperref}',
    '\\usepackage{longtable,booktabs}',
    '\\title{' + texEscape(o && o.title) + '}',
    '\\author{' + texEscape(o && o.author) + '}',
    '\\date{' + texEscape(o && o.date) + '}',
    '\\begin{document}',
    '\\maketitle',
    String((o && o.bodyTex) || ''),
    '\\end{document}',
  ].join('\n') + '\n'
}
/** 修复阶段的**最小模板**（spec §5）：只留 documentclass + 正文（section/itemize/texttt 都在 LaTeX 核心）。 */
function paperMinimalTexDoc(o) {
  const lang = (o && o.lang === 'en') ? 'en' : 'zh'
  return [
    '\\documentclass[11pt]{' + (lang === 'en' ? 'article' : 'ctexart') + '}',
    '\\begin{document}',
    String((o && o.bodyTex) || ''),
    '\\end{document}',
  ].join('\n') + '\n'
}
/** 修复阶段：丢弃不在常见宏包名单里的 \usepackage（其余原样保留）。 */
function paperSanitizeTex(tex) {
  const keep = []
  const lines = String(tex == null ? '' : tex).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\\usepackage(\[[^\]]*\])?\{([^}]*)\}\s*$/.exec(lines[i])
    if (m) {
      const pkgs = String(m[2]).split(',').map(function (x) { return x.trim() }).filter(Boolean)
      const ok = pkgs.filter(function (p) { return PAPER_ALLOWED_PACKAGES.indexOf(p) >= 0 })
      if (ok.length === 0) continue
      keep.push('\\usepackage' + (m[1] || '') + '{' + ok.join(',') + '}')
      continue
    }
    keep.push(lines[i])
  }
  return keep.join('\n')
}
/** 骨架名匹配：允许带序号/前缀，或只写节名的一部分（例如「附录」）。 */
function paperSkeletonKey(name) {
  const n = String(name == null ? '' : name).replace(/^#+\s*/, '').trim()
  if (!n) return undefined
  for (const s of PAPER_SKELETON) if (n === s.key) return s.key
  for (const s of PAPER_SKELETON) if (n.indexOf(s.key) !== -1 || s.key.indexOf(n) !== -1) return s.key
  return undefined
}
/** 按 `## ` 把任意 markdown 切成 [{name,text}]（无标题时 name=''）。 */
function paperSplitByHeadings(md) {
  const out = []
  let cur = { name: '', text: [] }
  const lines = String(md == null ? '' : md).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const h = /^##\s+(.*?)\s*$/.exec(lines[i])
    if (h) { if (cur.name || cur.text.length) out.push({ name: cur.name, text: cur.text.join('\n').trim() }); cur = { name: h[1], text: [] }; continue }
    cur.text.push(lines[i])
  }
  if (cur.name || cur.text.length) out.push({ name: cur.name, text: cur.text.join('\n').trim() })
  return out
}
/**
 * 把「论文撰写」子代理的回复映射到 9 节骨架上（spec §3/§4）。
 * 接受契约 JSON（title/abstract/sections[]）或一整段 md（按 `## ` 切）；**绝不编造**：
 * 没写到的节由调用方填 PAPER_NO_EVIDENCE，不属于骨架的节并入第 8 节并记一条说明。
 */
function paperSkeletonFromReply(reply, fallbackText) {
  const sections = {}
  const notes = []
  let title = ''
  let abstract = ''
  const put = function (key, body) {
    const b = String(body == null ? '' : body).trim()
    if (!b) return
    sections[key] = sections[key] ? (sections[key] + '\n\n' + b) : b
  }
  const absorbUnknown = function (name, text) {
    if (!name && !String(text || '').trim()) return
    notes.push('作者写了一节「' + (name || '(无名)') + '」，不属于固定 9 节骨架，已并入「讨论、局限与展望」')
    put('讨论、局限与展望', (name ? ('**' + name + '**\n\n') : '') + text)
  }
  const obj = (reply && typeof reply === 'object' && !Array.isArray(reply)) ? reply : null
  if (obj) {
    title = String(obj.title || obj.标题 || '').trim()
    abstract = String(obj.abstract || obj.摘要 || '').trim()
    const list = Array.isArray(obj.sections) ? obj.sections : (Array.isArray(obj.章节) ? obj.章节 : [])
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (!s) continue
      const name = String(s.name || s.key || s.heading || s.标题 || '')
      const body = String(s.body != null ? s.body : (s.content != null ? s.content : (s.内容 != null ? s.内容 : '')))
      const key = paperSkeletonKey(name)
      if (key === undefined) absorbUnknown(name.trim(), body)
      else put(key, body)
    }
    const bodyField = String(obj.body || obj.content || obj.md || obj.正文 || '')
    if (bodyField.trim()) {
      const parts = paperSplitByHeadings(bodyField)
      for (let i = 0; i < parts.length; i++) {
        const key = paperSkeletonKey(parts[i].name)
        if (key === undefined) { if (!parts[i].name && !abstract && !sections['摘要']) abstract = parts[i].text; else if (parts[i].name) absorbUnknown(parts[i].name, parts[i].text) }
        else put(key, parts[i].text)
      }
    }
  } else {
    // 非契约 JSON：把模型**原样**写出的 md 当正文（不编造任何内容；识别不了就整体并入第 8 节）
    const parts = paperSplitByHeadings(String(fallbackText == null ? '' : fallbackText))
    let matched = 0
    for (let i = 0; i < parts.length; i++) {
      const key = paperSkeletonKey(parts[i].name)
      if (key === undefined) { if (parts[i].name) absorbUnknown(parts[i].name, parts[i].text) }
      else { put(key, parts[i].text); matched++ }
    }
    if (matched === 0) {
      const raw = String(fallbackText == null ? '' : fallbackText).trim()
      if (raw) { notes.push('作者回复不是契约 JSON，也没有可识别的 `## ` 节标题；其原样正文已记入「讨论、局限与展望」'); put('讨论、局限与展望', raw) }
      else notes.push('作者回复为空：没有任何内容可写（不得编造）')
    }
  }
  return { title: title, abstract: abstract, sections: sections, notes: notes }
}
/** 组装 md（spec §3）：9 节固定骨架 + 确定性证据索引；缺证据的节写占位说明。 */
function paperBuildMarkdown(o) {
  const sec = (o && o.sections) || {}
  const ev = ((o && o.evidence) || []).slice()
  const L = []
  const ttl = String((o && o.title) || '').trim() || '研究报告'
  L.push('# ' + ttl)
  L.push('')
  L.push('- 作者：' + String((o && o.author) || ''))
  L.push('- 日期：' + String((o && o.date) || ''))
  L.push('')
  for (let i = 0; i < PAPER_SKELETON.length; i++) {
    const key = PAPER_SKELETON[i].key
    L.push('## ' + key)
    L.push('')
    let body = String(sec[key] || '').trim()
    if (key === '摘要') { const ab = String((o && o.abstract) || '').trim(); if (ab) body = body ? (ab + '\n\n' + body) : ab }
    if (key === '附录：证据与文件索引' && ev.length) {
      const idx = '### ' + PAPER_EVIDENCE_HEADING + '\n\n' + ev.map(function (x) { return '- `' + String(x) + '`' }).join('\n')
      body = body ? (body + '\n\n' + idx) : idx
    }
    L.push(body || PAPER_NO_EVIDENCE)
    L.push('')
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
/** paper.log.md 的**唯一格式**（v2/v3 逐字一致，spec §4）。 */
function paperLogHead(id) {
  return ['# 论文写作日志｜' + String(id), '',
    '> 单作者流程（v2/v3 同一格式）：收口触发 → 派遣「论文撰写」子代理 → 落盘 md/tex → 编译 pdf。', '']
}
function paperLogLine(at, tag, text) { return '- ' + fmtTime(at) + ' [' + String(tag) + '] ' + String(text == null ? '' : text) }
/** 论文目录 id：只允许安全字符（同一把归一化 ⇒ 不可能写出 Paper/ 之外，spec §6 越权用例）。 */
function paperDirId(raw) { return (safeId(String(raw == null ? '' : raw).trim()) || 'run') }
/** 从回复里抽出可能存在的标题行（md 非契约路径的兜底）。 */
function paperTitleFromMd(md) {
  const m = /^#\s+(.*?)\s*$/m.exec(String(md == null ? '' : md))
  return m ? m[1].trim() : ''
}

// ============================================================================================
// Lean 增量 + 异步（规格：docs/formal-verification.md；设计：_oneoff/lean-incremental-async-spec.md）
// **纯函数部分**（module scope，v2/v3 逐字同构）。
// ============================================================================================
/** 搜索路径 flag：收敛成一个常量（不同 Lean 版本拼写可能不同，改这里即可，接口不变）。 */
const LEAN_SEARCH_PATH_FLAG = '--search-path'
/** 用户已显式给出搜索路径就不再注入（显式覆盖优先）。 */
function hasLeanSearchFlag(args) {
  return (Array.isArray(args) ? args : []).some(function (a) {
    const s = String(a)
    return s === LEAN_SEARCH_PATH_FLAG || s.indexOf(LEAN_SEARCH_PATH_FLAG + '=') === 0 || s === '-R' || s === '--root'
  })
}
/**
 * 搜索路径注入计划（修订 §2）：用户 leanArgs 已显式给过 ⇒ 什么都不注入（显式覆盖优先）；
 * 否则**先注入用户给的 leanSearchPaths，再注入自动根**，去重且保持顺序。
 */
function leanSearchPathPlan(userArgs, extraPaths, autoRoot) {
  const args = Array.isArray(userArgs) ? userArgs.map(String) : []
  if (hasLeanSearchFlag(args)) return { inject: [], paths: [], explicit: true }
  const out = []
  const seen = {}
  const add = function (p) {
    const s = String(p == null ? '' : p).trim()
    if (!s || seen[s]) return
    seen[s] = true
    out.push(s)
  }
  for (const p of (Array.isArray(extraPaths) ? extraPaths : [])) add(p)
  add(autoRoot)
  const inject = []
  for (const p of out) { inject.push(LEAN_SEARCH_PATH_FLAG, p) }
  return { inject: inject, paths: out, explicit: false }
}
/** 规范化文本：换行统一 \n、去行尾空白、去尾部空行——内容哈希只反映语义内容。 */
function normalizeLeanText(t) {
  return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '') + '\n'
}
/** 内容 sha256（归档去重与作业幂等的键）。 */
function leanContentSha(t) { return createHash('sha256').update(normalizeLeanText(t), 'utf8').digest('hex') }
/**
 * 构建上下文（修订 §4）：同一段代码在不同引擎/参数/搜索路径下结果可能不同，
 * 所以"已通过"的判定必须绑定**构建上下文**，不能只看内容。
 */
function leanBuildContext(engine, args, searchPaths) {
  return JSON.stringify({
    engine: String(engine == null ? '' : engine),
    args: (Array.isArray(args) ? args : []).map(String),
    searchPaths: (Array.isArray(searchPaths) ? searchPaths : []).map(String),
  })
}
/** 作业指纹 = sha256(内容 + 构建上下文)（修订 §4：jobId 取它的前 12 位）。 */
function leanJobFingerprint(contentText, buildCtx) {
  return createHash('sha256').update(normalizeLeanText(contentText) + '\n' + String(buildCtx || ''), 'utf8').digest('hex')
}
/** jobId = `<target|name>-<指纹[0:12]>`：同一内容 + 同一构建上下文天然只有一个作业。 */
function leanJobId(key, fingerprint) {
  const k = String(key == null ? '' : key).replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'job'
  return k + '-' + String(fingerprint == null ? '' : fingerprint).slice(0, 12)
}
/** "已落地且通过"的**唯一**判据：state=settled 且 exit 0 且未超时未中断（内容哈希由 settle 校验）。 */
function leanJobSettledOk(rec) { return !!rec && rec.state === 'settled' && rec.exitCode === 0 && !rec.timedOut && !rec.interrupted }
/** 主动性档位（修订 §1）：与"验证时的要求强度"（formalVerify）是两件事。 */
const LEAN_INITIATIVE_MODES = ['off', 'normal', 'eager']

export const __testHelpers = {
  uuid,
  shortId,
  clamp01,
  slugify,
  safeId,
  blocksToText,
  parseJson,
  safeJson,
  stripJsonComments,
  fmtTime,
  parseProgress,
  sanitizeToolFilter,
  registeredToolsFromError,
  // Lean 增量/异步（§7 的纯函数守卫面）
  LEAN_SEARCH_PATH_FLAG,
  hasLeanSearchFlag,
  leanSearchPathPlan,
  normalizeLeanText,
  leanContentSha,
  leanBuildContext,
  leanJobFingerprint,
  leanJobId,
  leanJobSettledOk,
  LEAN_INITIATIVE_MODES,
  // final paper（spec §6 的纯函数守卫面）
  PAPER_SKELETON,
  PAPER_NO_EVIDENCE,
  PAPER_ALLOWED_PACKAGES,
  PAPER_ENGINE_ORDER_ZH,
  PAPER_ENGINE_ORDER_EN,
  texEscape,
  paperMaterialSummary,
  paperWriterVerdict,
  paperInlineToTex,
  paperMdToTexBody,
  paperTexDoc,
  paperMinimalTexDoc,
  paperSanitizeTex,
  paperSkeletonKey,
  paperSkeletonFromReply,
  paperBuildMarkdown,
  paperLogHead,
  paperLogLine,
  paperDirId,
  paperTitleFromMd,
}

function now() { return Date.now() }

function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }

function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }

function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }

function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }

function safeId(s) { return String(s == null ? 'anon' : s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon' }

function blocksToText(blocks) { if (!blocks) return ''; let out = ''; for (let i = 0; i < blocks.length; i++) { const b = blocks[i]; if (b && b.type === 'text' && typeof b.text === 'string') out += b.text + '\n' } return out.trim() }

function parseJson(text) {
  if (typeof text !== 'string') return undefined
  const tryObj = function (s) { try { const v = JSON.parse(s); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : undefined } catch (e) { return undefined } }
  const fenceRe = /```(?:json)?[ \t]*([\s\S]*?)```/gi
  let m
  while ((m = fenceRe.exec(text)) !== null) { const obj = tryObj(m[1].trim()); if (obj !== undefined) return obj }
  const whole = tryObj(text.trim()); if (whole !== undefined) return whole
  let best = undefined; let bestLen = -1
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue
    let depth = 0, inStr = false, esc = false, end = -1
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) continue
    const obj = tryObj(text.slice(start, end + 1))
    if (obj !== undefined && (end - start + 1) > bestLen) { best = obj; bestLen = end - start + 1 }
  }
  return best
}

function safeJson(v, fb) { if (v == null || v === '') return fb; try { return JSON.parse(v) } catch (e) { return fb } }

function stripJsonComments(text) { let out = ''; let inStr = false; let inLine = false; let inBlock = false; let esc = false; for (let i = 0; i < text.length; i++) { const c = text[i]; const n = text[i + 1]; if (inLine) { if (c === '\n') { inLine = false; out += c } continue } if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++ } continue } if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue } if (c === '"') { inStr = true; out += c; continue } if (c === '/' && n === '/') { inLine = true; i++; continue } if (c === '/' && n === '*') { inBlock = true; i++; continue } out += c } return out }

function fmtTime(ms) { try { return new Date(Number(ms) || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return '' } }

function parseProgress(q) {
  const raw = (q && q.progress) || null
  let p = null
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) p = raw
  else p = safeJson(raw, null)
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { directions: [], experience: '' }
  if (!Array.isArray(p.directions)) p.directions = []
  return p
}

function sanitizeToolFilter(filter, known) {
  if (!filter || !(known instanceof Set) || known.size === 0) return filter
  const out = {}
  for (const key of ['allow', 'deny']) {
    const list = filter[key]
    if (!Array.isArray(list)) continue
    const kept = list.filter(function (n) { return known.has(String(n).trim()) })
    if (kept.length > 0) out[key] = kept
  }
  return (out.allow || out.deny) ? out : undefined
}

function registeredToolsFromError(message) {
  const m = /known global tools:\s*([^]*)$/.exec(String(message || ''))
  if (!m) return undefined
  const names = m[1].split(',').map(function (s) { return s.trim() }).filter(Boolean)
  return names.length > 0 ? new Set(names) : undefined
}
