// Vibe Math V3 — host plugin implementing the THIRD-generation architecture
// ("vibe-math-v3/实现方案.md"): paper-style Markdown knowledge base + agent
// self-organizing scheduling + universal theory/method invention library.
//
// What changed vs V2:
//   1. DATA LAYER IS MARKDOWN. Problems/ (问题清单 with 依赖/来源与动机/计划),
//      Progress/ (研究日志, per-direction round narratives), Propos/ (结论/命题,
//      category subfolders), Methods/ (通用理论发明库), Verified/ (absolute
//      trust, scheduler-generated read-only copies), Notes/, Logs/, State/.
//      Each object is ONE md file with a tiny "soft spec" anchor header
//      (ID/类型/状态/概率/优先级/依赖/...) + free-form narrative body. The
//      scheduler parses ONLY the anchor header + entry headings (### 解法 N｜...)
//      and never parses prose. ONLY Verified/ is absolutely trusted; everything
//      else (incl. unverified method claims) is experiential reference.
//   2. SCHEDULING VIA PLANNER AGENT. Before new spawns the scheduler builds a
//      state brief and calls a planner agent which returns up to
//      `planningHorizon` actions (spawn solver/verifier/explorer/method-keeper,
//      interrupt, promote, wait). The code validates every action against hard
//      invariants and executes them in order; beyond-capacity actions queue
//      across ticks. Planner failure falls back to the V2-style heuristic.
//   3. METHOD LIBRARY. Solvers/explorers report methods_used + new_inventions;
//      the scheduler appends application records and queues inventions for the
//      Method Keeper agent, which distills new method cards / improves existing
//      ones into a reusable theory system (project-level + global Methods/).
//
// Data layout (per project, under <workspace>/VibeMath/Projects/<project>/):
//   Problems/<id>.md           — one problem per file (软规范锚点 + 陈述/来源与动机/解法候选)
//   Progress/<id>.md           — research journal per problem (directions & rounds, narrative)
//   Propos/<分类>/<id>.md      — one proposition per file (陈述/证明尝试/证伪尝试)
//   Methods/<id>.md            — method/theory cards (project level)
//   Verified/命题/<id>.md      — verified-true/false copies (scheduler generated, read-only)
//   Verified/问题/<id>.md      — solved problems with full verified solutions
//   Reliable/                  — user-provided trusted references (read-only)
//   Notes/                     — free notes (not scheduled)
//   Logs/Verification/         — debate transcripts per verification run
//   Logs/Plans/                — every planner plan + per-action outcomes (planning loop)
//   State/                     — scheduler private state (JSON, scheduler-only)
// Workspace level: VibeMath/Methods/ = GLOBAL theory library (cross-project),
//   VibeMath/current.<sessionId>.json = per-session current project.
export const name = 'vibe-math-v3'
export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands']
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
  MATH_SUBSTITUTION_RULE_LINE,
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
  // childOwner 的**有界化**（审计 L1）。这条映射只在"这个 child 还可能再发 subagent/end"时有价值，
  // 但（与 v2 同一结论）不能在事件回调里立即回收：辩论/续轮会在同一个 child 上再次 end，丢了映射这次
  // 事件就没人路由，verdict 收口随之失效。所以改为**引用 + 宽限期**：仍被任务或 agentRegistry 引用的
  // 一律保留，没有引用且距最近一次 end 已超过宽限期才回收。
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
  const fileOwner = {} // 进程级写锁：fileKey -> { childId, sessionId, at } —— 防任何代理（跨会话）并发写同一 md 文件
  // Process epoch: PROCESS-level (one per apply, shared by every session), written to
  // State/process_epoch.json at init; a DIFFERENT persisted epoch means a previous DSH
  // process wrote this state (in-flight children are gone), while an equal epoch means
  // same-process pause→resume (children may still be alive). Kept at apply level so two
  // sessions in one process never treat each other as a stale previous process.
  const processEpoch = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)
  // 项目锁 LEASE 的续租轮询间隔（apply 级定时器用，见 apply() 末尾）：它必须**明显快于**续租判据
  // （projectLockTimeoutMs/4），否则"多久检查一次"会成为租约年龄的下界——实测 2500ms 轮询配 625ms
  // 判据时最坏年龄仍有 2467ms，几乎顶到 2500ms 的租约上限。250ms 轮询下最坏租约年龄 ≈
  // max(250ms, projectLockTimeoutMs/4)，即上限的 1/4 再加一次轮询的抖动。
  const LOCK_POLL_MS = 250
const ACTIVITY_PERSIST_MAX = 200 // P5：活动日志落盘上限（恢复时保留更多线索）

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
    solverMaxRounds: 3,           // per-direction iteration cap
    directionsPerSolver: 1,       // directions shown per solver prompt (1 = own only)
    verifierCount: 3,             // independent reviewers per verification
    debateMaxRounds: 5,           // debate round cap
    verdictMode: 'forced',        // flat = 均衡(0.5) | forced = 对每票**等权**取均值（每票按自己报出的概率贡献；严格 1/0 是绝对投票，其影响通过数值本身拉向端点）。**不再**按"历史准确率"加权：那个统计量统计的是"与本批裁决的一致度"，没有后续真值可纠正它。两者都先做近共识判定（同侧且均值≥0.85/≤0.15取均值）
    provider: '',
    model: '',
    solverPersona: '',
    verifierPersona: '',
    explorerPersona: '',
    plannerPersona: '',           // 注入规划代理提示词开头的人格/要求
    methodKeeperPersona: '',      // 注入方法整理代理提示词开头的人格/要求
    knowledgeContext: '',         // 共享知识/数据模型说明（空 = 内置完整版；非空 = 覆盖）
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
    reportIntervalMs: 0,          // 0 = 仅事件驱动；>0 = 定时自动汇报（毫秒）
    reportMode: 'file',           // file | push | both
    promoteValueThreshold: 0.7,   // Propos → Problems auto-promotion threshold (价值/关键性)
    priorityAdjust: 'none',       // none | deadend-deprioritize | survival-map
    proposPriorityAdjust: 'none', // none | progress-graded
    tickIntervalMs: 2000,         // 调度器心跳间隔（毫秒）
    activityLogCap: 100,
    maxExplorerRetries: 3,        // explorer 重派生上限
    // ---- V3 new params ----
    planningHorizon: 3,           // 规划代理一次计划的最多动作数（"接下来 n 次"）
    plannerEnabled: true,         // false = 完全走内置启发式（规划代理禁用）
    plannerProvider: '',          // 规划代理模型 provider（空 = 继承）
    plannerModel: '',             // 规划代理模型 id（空 = 继承）
    planMinIntervalMs: 30000,     // 每一次规划调用的最小间隔（含空计划与「空闲但有工作」）
    plannerMaxFails: 3,           // 规划代理连续失败达此值 → 自动降级启发式
    methodKeepIntervalMs: 0,      // Method Keeper 定时整理间隔（0 = 事件驱动）
    methodKeepEvery: 5,           // 每积累 N 个待沉淀发明/新命题触发一次整理
    methodAutoPromote: false,     // 项目级方法自动晋升全局库（false = 人工门）
    indexAutoRebuild: true,       // 每次写盘后自动重建索引（false = 手动 vibe_math_index）
    projectLockTimeoutMs: 60000,  // 项目锁等待超时
    fileLockTimeoutMs: 60000,     // 文件写锁租约时长（审计 D2；持有者活着则每 LOCK_POLL_MS 续租）
    // ---- Lean 形式化验证（契约：docs/formal-verification.md，四架构同名同语义）----
    formalVerify: 'off',          // off | encourage | require（三档开关，见 实现方案.md §10.1）
    leanCommand: 'lean',          // 要执行的 Lean 可执行文件（例：'lake'）
    leanArgs: [],                 // 插在文件名之前的附加参数（例：['env','lean'] 配 leanCommand='lake'）
    leanTimeoutMs: 120000,        // 单次 Lean 运行超时上限（毫秒，正整数）
    leanAsync: true,              // true = Lean 编译走后台队列（入队即返回）| false = 同步 await（旧语义）
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
  let scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null } // activeCount 由 activeCount() 从 agentRegistry 推导（防漂移，同 v2）
  let agentRegistry = {}
  let decisionQueue = []
  let verifierAccuracy = {}
  // 验证者票数统计的保留上限（审计 L1）：它按**一次性的 childId** 记，每次验证都新增键，
  // 长跑进程里无界增长并整表落盘。它已经不再参与任何加权（见 finalVerdict 的 M8 说明），
  // 只是审计轨迹，所以按插入顺序保留最近 N 条即可。
  const VERIFIER_ACC_KEEP = 200
// F2（对照 v2:221）：status 与 report 的 recentActivity **共用**这一上限；参数 activityLogCap
// 只能把它调小、不能调大（旧实现 status 硬编码 10、report 硬编码 30，读者无从知道）。
const ACTIVITY_REPORT_MAX = 30
  function pruneVerifierAccuracy() {
    const keys = Object.keys(verifierAccuracy)
    for (let i = 0; i < keys.length - VERIFIER_ACC_KEEP; i++) delete verifierAccuracy[keys[i]]
  }
  let tasks = {}                  // verify tasks keyed by 'verify:<rId>'
  let activityLog = []
  let lastReportWrite = 0
  let lastPushReport = 0
  let reportDirty = false
  let tickInFlight = false
  let lastTickAt = 0
  let explorerRetries = {}

  // ---- V3: md knowledge base (in-memory machine view; persisted as md) ----
  let problems = new Map()        // id -> Problem
  let propos = new Map()          // id -> Proposition
  let methods = new Map()         // id -> Method (project-level)
  let globalMethods = new Map()   // id -> Method (workspace global VibeMath/Methods/)
  let dirState = new Map()        // qid -> [Direction] (machine view of Progress journal)
  let methodLog = { pendingInventions: [], keepCount: 0, lastKeepAt: 0 }
  let planQueue = []              // queued plan actions (beyond-capacity, cross-tick)
  let plannerFails = 0
  let lastPlanAt = 0
  let lastPlanSummary = null      // { at, summary, actions, outcomes } for the next brief
  let projectLock = { sessionId: '', at: 0 }
  let lastIndexWrite = 0          // State/index.json 写入节流（每 5s 至多一次；工具/init 强制时立即）
  let archivedJ = {}              // qid -> [md 段]：重派生时被替换方向的 journal 归档（论文式历史保留）
  /**
   * Lean 形式化记录（契约 docs/formal-verification.md §4/§9）。
   *
   * v3 没有会话投影，所以每个对象的形式化记录落在**自己的持久状态** `State/formal.json`
   * （与其它 State/*.json 同样的 readJson/writeJson 通道），按对象 id 索引，跨 resume 存活：
   *   records: { <对象id>: {status, file, proof, decision, note, run, updatedAt} }
   *   todo:    [{id, at, why, verdict, project}] —— require 模式下被搁置的定论
   *   libRuns: { 'Lib/<名>.lean' | 'Proved/<名>.lean': {ok, exitCode, ms, at} } —— 索引的「最近运行」列
   */
  let formalState = { records: {}, todo: [], libRuns: {} }

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} const sp = sandboxPolicyOf(); if (sp && sp.workspaceRoot) return sp.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  /**
   * 把模型/用户提供的对象 id 消毒成**单个安全文件名**。v4 已有等价的 idSafe（见
   * vibe-math-v4.js），v3 此前缺这一步：saveProblem/saveProposition/saveVerified 直接
   * 拼接原始 id，模型给出 `../../x` 之类就能把文件写出项目树（categoryOf 只删 `/`，不删 `..`）。
   * 这里替换路径分隔符与控制字符、折叠连续连字符，并剥掉首尾的点/连字符，
   * 保证结果永不为 `.` / `..`、也不含分隔符。
   */
  let warnedNoPolicy = false
  function warnNoPolicyOnce() { if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v3: sandboxPolicy unavailable; writes go out with no explicit policy') } }
  // Sandbox fence for our own writes. The `resolve({})` fallback is a last resort and is
  // deliberately reported (once): with no session it resolves the policy's CONFIGURED root
  // (dsh-sandbox-policy: resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())),
  // which is not necessarily this session's workspace — a silently different fence.
  function getPolicy() { const sp = sandboxPolicyOf(); if (!sp) { warnNoPolicyOnce(); return undefined } try { if (rootAgent && rootAgent.session) return sp.resolve({ session: rootAgent.session }) } catch (e) { warnNoPolicyOnce() } try { const p = sp.resolve({}); if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v3: falling back to sandboxPolicy.resolve({}) — the fence root is the host-configured workspace, not necessarily this session cwd') } return p } catch (e) { warnNoPolicyOnce() } return undefined }
  function makeSignal(ms) { return AbortSignal.timeout(ms || 30000) }

  // ================= parameter schema =================
  const PARAM_SCHEMA = [
    { name: 'mode', type: 'enum', options: ['auto', 'manual'], description: 'auto = 无人值守自动通过关键节点；manual = 关键节点挂起人工决策', suggestion: 'auto' },
    { name: 'maxParallelThreshold', type: 'integer', description: '全局最大并发子代理轮数（新派发前须满足 active < 阈值）', suggestion: 4 },
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数', suggestion: 3 },
    { name: 'directionsPerSolver', type: 'integer', description: '每个 solver 提示词附带的其他活跃方向摘要数量：1 = 只看自己方向', suggestion: 1 },
    { name: 'verifierCount', type: 'integer', description: '每个验证对象的独立验证器数量（实际下界为 2：少于 2 份独立评审一律不定论，见 minVotes）', suggestion: 3 },
    { name: 'debateMaxRounds', type: 'integer', description: '验证辩论（交流群）最大轮数', suggestion: 5 },
    { name: 'verdictMode', type: 'enum', options: ['flat', 'forced'], description: '裁决模式：flat = 均衡机制（分歧时 0.5）；forced = 强制裁决（对每票等权取均值；严格 1/0 是绝对投票，其影响通过数值本身拉向端点。**不按"历史准确率"加权**——该统计量统计的是与本批裁决的一致度，没有后续真值可纠正）；两者都先做近共识判定（同侧且均值≥0.85/≤0.15取均值，修复 v2 flat 误判）', suggestion: 'forced' },
    { name: 'provider', type: 'string', description: '子代理模型 provider（空 = 继承根代理）', suggestion: '' },
    { name: 'model', type: 'string', description: '子代理模型 id（空 = 继承根代理）', suggestion: '' },
    { name: 'solverPersona', type: 'string', description: '注入每个求解器提示词开头的人格/要求', suggestion: '' },
    { name: 'verifierPersona', type: 'string', description: '注入每个验证器提示词开头的人格/要求', suggestion: '' },
    { name: 'explorerPersona', type: 'string', description: '注入每个 explorer/重派生提示词开头的人格/要求', suggestion: '' },
    { name: 'plannerPersona', type: 'string', description: '注入规划代理提示词开头的人格/要求', suggestion: '' },
    { name: 'methodKeeperPersona', type: 'string', description: '注入方法整理代理提示词开头的人格/要求', suggestion: '' },
    { name: 'knowledgeContext', type: 'string', description: '共享知识/数据模型说明（空 = 内置完整版；非空 = 覆盖）', suggestion: '' },
    { name: 'solverToolAllow', type: 'string[]', description: '求解器允许的工具名列表（空 = 继承全部工具）', suggestion: [] },
    { name: 'solverToolDeny', type: 'string[]', description: '求解器禁止的工具名列表', suggestion: [] },
    { name: 'verifierToolAllow', type: 'string[]', description: '验证器允许的工具名列表', suggestion: [] },
    { name: 'verifierToolDeny', type: 'string[]', description: '验证器禁止的工具名列表', suggestion: [] },
    { name: 'solverAllowNetwork', type: 'boolean', description: '求解器网络工具开关：空=继承；true=允许；false=禁止', suggestion: '' },
    { name: 'verifierAllowNetwork', type: 'boolean', description: '验证器网络工具开关', suggestion: '' },
    { name: 'solverAllowScripts', type: 'boolean', description: '求解器脚本工具开关', suggestion: '' },
    { name: 'verifierAllowScripts', type: 'boolean', description: '验证器脚本工具开关', suggestion: '' },
    { name: 'solverMaxToolCalls', type: 'integer', description: '求解器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'verifierMaxToolCalls', type: 'integer', description: '验证器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'reportIntervalMs', type: 'integer', description: '进度汇报间隔（毫秒）：0 = 仅事件驱动', suggestion: 0 },
    { name: 'reportMode', type: 'enum', options: ['file', 'push', 'both'], description: 'file = 写报告文件；push = 推送消息；both = 两者', suggestion: 'file' },
    { name: 'promoteValueThreshold', type: 'number', description: '命题「价值/关键性」≥ 该值且未决(0,1) 时自动晋升为问题', suggestion: 0.7 },
    { name: 'priorityAdjust', type: 'enum', options: ['none', 'deadend-deprioritize', 'survival-map'], description: '问题优先级动态调整策略', suggestion: 'none' },
    { name: 'proposPriorityAdjust', type: 'enum', options: ['none', 'progress-graded'], description: '命题优先级动态调整策略', suggestion: 'none' },
    { name: 'tickIntervalMs', type: 'integer', description: '调度器心跳间隔（毫秒）', suggestion: 2000 },
    { name: 'activityLogCap', type: 'integer', description: '活动日志保留条数（影响 status/report 里 recentActivity 的细节量，两者最多显示 ' + ACTIVITY_REPORT_MAX + ' 条）', suggestion: 100 },
    { name: 'maxExplorerRetries', type: 'integer', description: 'explorer 拆方向失败的重派生上限', suggestion: 3 },
    { name: 'planningHorizon', type: 'integer', description: '规划代理一次计划的最多动作数（"接下来 n 次"）', suggestion: 3 },
    { name: 'plannerEnabled', type: 'boolean', description: 'false = 完全走内置启发式调度（规划代理禁用）', suggestion: true },
    { name: 'plannerProvider', type: 'string', description: '规划代理模型 provider（空 = 继承根代理）', suggestion: '' },
    { name: 'plannerModel', type: 'string', description: '规划代理模型 id（空 = 继承根代理）', suggestion: '' },
    { name: 'planMinIntervalMs', type: 'integer', description: '每一次规划调用的最小间隔（毫秒）；对**每一次**规划调用都生效（含空计划、含「空闲但仍有工作」，不再有空闲绕过）', suggestion: 30000 },
    { name: 'plannerMaxFails', type: 'integer', description: '规划代理连续失败达此值 → 自动降级启发式', suggestion: 3 },
    { name: 'methodKeepIntervalMs', type: 'integer', description: 'Method Keeper 定时整理间隔（0 = 事件驱动）', suggestion: 0 },
    { name: 'methodKeepEvery', type: 'integer', description: '每积累 N 个待沉淀发明/新命题触发一次整理', suggestion: 5 },
    { name: 'methodAutoPromote', type: 'boolean', description: '项目级方法自动晋升全局库（false = 人工门）', suggestion: false },
    { name: 'indexAutoRebuild', type: 'boolean', description: '每次写盘后自动重建索引（false = 手动 vibe_math_index）', suggestion: true },
    { name: 'projectLockTimeoutMs', type: 'integer', description: '项目锁等待超时（毫秒）', suggestion: 60000 },
    { name: 'fileLockTimeoutMs', type: 'integer', description: '文件写锁租约时长（毫秒，默认 60000，最小 1000）：持有代理存活期间自动续租，持有者消失后最多这么久失效，避免长文写入被别人抢锁（审计 D2）', suggestion: 60000 },
    { name: 'formalVerify', type: 'enum', options: ['off', 'encourage', 'require'], description: 'Lean 形式化验证：off = 不额外要求（默认，提示词里不出现任何 Lean 内容）；encourage = 鼓励按实现难度形式化，Lean 通过后验证转为忠实性审查；require = 同上并加门禁：真/假定论必须先达到 Lean 已通过 或 已记录显式阻塞原因，否则记为未定论（formal-required）并进「形式化待办」', suggestion: 'off' },
    { name: 'leanCommand', type: 'string', description: 'Lean 可执行文件（例：lean / lake；配合 leanArgs=[env,lean] 用 lake）', suggestion: 'lean' },
    { name: 'leanArgs', type: 'string[]', description: '插在 .lean 文件名之前的附加参数', suggestion: [] },
    { name: 'leanTimeoutMs', type: 'integer', description: '单次 Lean 运行的超时上限（毫秒，非正数回退默认）；异步档下它同时是**每个后台作业**的预算（到时主动 terminate，作业记 timeout，对象留在 attempted）', suggestion: 120000 },
    { name: 'leanAsync', type: 'boolean', description: 'Lean 编译模式：true（默认）= 后台队列，vibe_math_lean_run / vibe_math_lean_archive{run:true} 立即返回 async.jobId 入队，成员不阻塞，结果由下一轮提示的【形式化结果】行与 vibe_math_lean_job 公告（**只有作业落地为 ok 才会置 passed 并写归档证明**）；false = 完全同步 await（与旧行为逐字一致）', suggestion: true },
    { name: 'leanJobsMaxParallel', type: 'integer', description: '后台 Lean 编译的并发上限（默认 1 = 串行，保持可预测的资源占用；调大可并行编译多个作业）', suggestion: 1 },
    { name: 'leanInitiative', type: 'enum', options: ['off', 'normal', 'eager'], description: '日常流程中的形式化主动性：off（不主动，只在验证提示词按 formalVerify 的要求做）| normal（默认：顺手把有价值且可能复用的东西形式化）| eager（更主动：日常就主动把有价值的小引理/命题/定义形式化）。注意它与 formalVerify（验证时的要求强度：off|encourage|require）是**两件事**', suggestion: 'normal' },
    { name: 'leanSearchPaths', type: 'string[]', description: '额外 Lean 搜索路径（默认空数组 = 只用框架自动注入的 VibeMath 根）。非空时按顺序先注入这里给的路径、再注入自动根（去重）；若 leanArgs 里已显式给了 --search-path/-R/--root，则完全尊重用户配置、不注入任何东西', suggestion: [] },
    { name: 'finalPaper', type: 'boolean', description: '收口（checkTermination 的完整收口分支：无未解决问题、无待验证对象、无任务/计划/门）时自动撰写最终论文：派遣一名专职「论文撰写」子代理，把已定论命题/解法/方法整理成 Paper/<项目>/{paper.md,paper.tex,paper.meta.json,paper.log.md}。false = 只关自动触发，/vibe paper 手动命令仍可用', suggestion: true },
    { name: 'paperFormat', type: 'enum', options: ['both', 'md', 'tex'], description: '论文产出格式：both = markdown + latex；md = 只写 paper.md（跳过编译）；tex = 只写 paper.tex（tex 才会尝试编译 pdf）', suggestion: 'both' },
    { name: 'paperLanguage', type: 'enum', options: ['zh', 'en'], description: '论文语言：zh = 中文（LaTeX 用 ctexart，引擎优先 xelatex）；en = 英文（article，引擎优先 pdflatex/latexmk）', suggestion: 'zh' },
    { name: 'paperCompilePdf', type: 'boolean', description: '检测到 LaTeX 时是否编译 paper.pdf（-interaction=nonstopmode 跑两遍；失败先尝试修复：换引擎/去不支持宏包/最小模板）。false 或无 LaTeX 时只保留 tex+md 并记日志（不阻塞定稿）', suggestion: true },
    { name: 'paperLatexCommand', type: 'string', description: '指定 LaTeX 引擎可执行文件（空 = 按语言探测：中文 xelatex > latexmk > pdflatex > lualatex > tectonic；英文 pdflatex 优先）。解析不到时按"未检测到"降级', suggestion: '' },
    // ---- 数学计算 math_computation（六参数冻结；描述与 prompts.md §1/§6 口径一致）----
    { name: 'mathComputation', type: 'enum', options: ['off', 'auto', 'on'], description: '数学计算总开关：off = 真无操作（提示词零提及）；auto = 探测到 mathEngines 里任一允许引擎才工作；on = 同上（探测失败时工具仍返回可执行的安装指引，而不是假装可用）', suggestion: 'auto' },
    { name: 'mathMode', type: 'enum', options: ['typed', 'typed+shell'], description: '计算策略：typed+shell（默认）= 工具不可用时允许宿主 shell 兜底，但结论必须标注"未经工具归档（shell 路径）"；typed = 只用工具路径（提示词里不出现 shell 兜底段，engine:"cli" 返回 REFUSED{reason:policy}）', suggestion: 'typed+shell' },
    { name: 'mathEngines', type: 'string[]', description: '允许的引擎列表（默认 python|r|octave|julia|matlab|maple|wolfram|cli）。cli 默认开启且走同一套超时/输出上限/回执；从列表里移除某引擎即禁用（商业引擎只探测+许可，永不安装）', suggestion: MATH_PARAM_DEFAULTS.mathEngines.slice() },
    { name: 'mathTimeoutMs', type: 'integer', description: '单次数学计算的超时上限（毫秒，默认 60000，最小 1000）；到时主动 terminate 并把回执标为 MATH_TIMEOUT', suggestion: 60000 },
    { name: 'mathPackages', type: 'string[]', description: '需要预检的包（默认空）。缺包只报告 + 给"用户自装指引"或"代理代装计划"，不会执行脚本，也永不自动安装', suggestion: [] },
    { name: 'mathInstallScope', type: 'enum', options: ['user', 'system'], description: '安装作用域：user（默认，用户级目录）；system 只对当次显式调用生效、永不记忆（不会写进状态文件）', suggestion: 'user' },
  ]

  // ================= fs (adapted to DSH 0.1.1: resolve returns {targetKey, displayPath}) =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeText(rel, content) {
    const t = await fsTarget(rel)
    const r = await fs.writeText(t, content, undefined, undefined, getPolicy())
    // P4：宿主若用返回值（而非抛异常）报告写失败，也要留痕——旧实现无条件 return true 会把它吞掉。
    if (r && r.ok === false) noteStateWriteFailure(rel, 'host reported write failure' + (r.error ? (': ' + r.error) : ''))
    return true
  }
  async function writeJson(rel, obj) {
    if (!assertWritable(rel)) {
      // P4：损坏守卫拒绝写入过去是**完全静默**的（返回 false 没人看）⇒ 会话以为已提交、磁盘还是旧内容。
      noteStateWriteFailure(rel, 'corruption guard refused write')
      logActivity('state', '拒绝写入（该 JSON 已存在但无法解析，先修/删它）：' + rel)
      return false
    }
    return await writeText(rel, JSON.stringify(obj, null, 2))
  }
  async function readJson(rel) { const t = await readText(rel); if (t === undefined || t === '') return undefined; try { return JSON.parse(t) } catch (e) { noteSuspect(rel); return undefined } }
  /**
   * Corruption guard. `readJson` cannot tell "no file yet" from "file present but
   * unparseable", yet callers treat both as "no data" and then write that emptiness
   * back — so one externally damaged state file silently reset the user's run.
   * Any read that hits a present-but-unparseable JSON file records it; `writeJson`
   * then REFUSES to write that path until the file is fixed or deleted. A missing
   * file is still created normally, so first-run behaviour is unchanged.
   */
  const suspectFiles = new Set()
  const warnedSuspect = {}
  function noteSuspect(rel) {
    suspectFiles.add(rel)
    if (warnedSuspect[rel]) return
    warnedSuspect[rel] = true
    console.error('vibe-math-v3: ' + rel + ' exists but is not parseable JSON — REFUSING to overwrite it so a corrupted file cannot silently erase your data. Fix or delete the file, then retry.')
  }
  function assertWritable(rel) {
    if (!suspectFiles.has(rel)) return true
    console.error('vibe-math-v3: write to ' + rel + ' blocked (file is unparseable; see the earlier warning)')
    return false
  }
  async function listFiles(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'file' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function listDirs(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'directory' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function listDirsAt(base, rel) { try { const t = await fs.resolve(rel, { cwd: base }); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'directory' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function readTextAbs(path) { try { const t = await fs.resolve(path); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeTextAbs(path, content) { try { const t = await fs.resolve(path); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true } catch (e) { return false } }
  async function readCurrentProject() {
try { const t = await fs.resolve('current.' + safeId(sessionId) + '.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s !== undefined) { const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } } catch (e) { noteStateWriteFailure('current.' + safeId(sessionId) + '.json', 'read failed: ' + ((e && e.message) || e)) }
try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s === undefined) return 'default'; const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } catch (e) { noteStateWriteFailure('current.json', 'read failed: ' + ((e && e.message) || e)); return 'default' }
  }
  async function writeCurrentProject() {
try { const t = await fs.resolve('current.' + safeId(sessionId) + '.json', { cwd: vibeRoot() }); await fs.writeText(t, JSON.stringify({ project: currentProject }), undefined, undefined, getPolicy()) } catch (e) { noteStateWriteFailure('current.' + safeId(sessionId) + '.json', (e && e.message) || e) }   // F-6c: 同上
  }

  // ================= subprocess =================
  function psQuote(p) { return "'" + String(p).replace(/'/g, "''") + "'" }
  /** POSIX 单引号引用：把 ' 换成 '\'' 以安全嵌入任意路径。 */
  function shQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'" }
  /**
   * 执行一段 shell 脚本。**按平台选择解释器**：此前硬编码 powershell，而预设用
   * `disabled: !!js process.platform !== 'win32'` 在非 Windows 上关掉了 tool-pwsh 行——
   * 也就是说插件会去调用一个自己声明不提供的二进制，且返回值无人检查，表现为静默失效。
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
   * ——返回的是 Promise，`handle.done` 是 undefined，`await handle.done` 得到 undefined，随后
   * `outcome.exitCode` 抛 "Cannot read properties of undefined (reading 'exitCode')"，被 catch 成一条
   * 误导性的目录创建失败。这里统一兼容一次：Promise 就先 await，句柄缺 `done` 才如实报错。
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
   * 目录骨架。Lean 形式化（契约 §3）要求项目内 `Formal/`（形式化工作文件 + Index.md/TODO.md）
   * 与 `Verified/Lean/`（归档证明，与定论卡片同处 Verified/，一眼可见"这条结论的证明在哪"），
   * 以及**项目树之外**的全局可复用库 `<VibeMath 根>/Formal/{Lib,Proved}`（跨项目复用是核心收益）。
   */
  // Progress_Logs/ 必须和别的骨架目录**一起**建出来（审计 L8）：vibe_math_report 会写
  // `Progress_Logs/report.json`，README 也把它列为布局的一部分，但此前它只靠 writeText 的隐式
  // mkdir 兜底——在宿主不支持删除/创建的路径上（runShell 失败）报告目录就时有时无。
  // F-4c：shell 兜底失败不能沉默（v2 有 warnShellOnce，v3 此前丢了 ⇒ mkdir/rm 失败无人知晓）。
  const shellWarned = {}
  function warnShellOnce(where, r) {
    const why = (r && (r.error || (r.exitCode === undefined ? undefined : ('exit code ' + r.exitCode)))) || 'unknown failure'
    const key = String(where) + '|' + why
    if (shellWarned[key]) return
    shellWarned[key] = true
    console.error('vibe-math-v3: ' + where + ' failed (' + why + ')')
  }
  async function ensureDirs() {
    const base = frameworkRoot(); const dirs = ['Problems', 'Progress', 'Progress_Logs', 'Propos', 'Methods', 'Verified/命题', 'Verified/问题', 'Verified/Lean', 'Formal', 'Formal/Jobs', 'Reliable', 'Notes', 'Logs/Verification', 'Logs/Plans', 'State', 'Computation']; const paths = [vibeRoot() + '/Projects', vibeRoot() + '/Methods', vibeRoot() + '/Formal/Lib', vibeRoot() + '/Formal/Proved'].concat(dirs.map(function (d) { return base + '/' + d })); return await runShell(mkdirCmd(paths))
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
  // 探测量（是否装了 python/r/…）是异步的，而提示词是同步构造的 ⇒ 会话级缓存 + TTL 刷新，
  // 提示词侧只读缓存现算（与 formalVerify / Lean 的动态纪律一致）。
  const MATH_PROBE_TTL_MS = 15 * 60 * 1000
  let mathProbe = null
  let mathProbeAt = 0
  /**
   * `host.spawn` 适配：模块只给 `{argv, cwd, timeoutMs, stdoutCap, stderrCap}`，超时/终止由**接线方**负责
   * （契约：超时必须 handle.terminate()）。返回**完整** stdout/stderr——模块自己落盘完整版、只在返回体裁 64KB，
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
  /**
   * host.listDir（**可选**，FREEZE §4）：模块用它数 `Computation/` 下的 run 目录数（>200 只告警、永不删除）。
   * 必须原样返回 DSH `fs.listDir` 的条目（{name,type}）——模块按 `type === 'directory'` 计数。
   * 宿主 fs 没有该能力时整个回调都不声明（见 mathHost 的条件字段）。
   */
  async function mathListDir(rel) {
    try { const t = await fsTarget(rel); const ents = await fs.listDir(t); return Array.isArray(ents) ? ents : [] } catch (e) { return [] }
  }
  /** 会话级 host：参数是**活引用**（函数），回执里写 designator='vibe-math-v3'。 */
  const mathHost = {
    // 模块注册时只**交回** handler/description/parameters；真正的挂载是下面两条**字面量** registerTool
    // 调用（会话层 + apply 层）。原因：tests/audit-v3-registration-parity.mjs 的静态扫描器按
    // `registerTool('<名字字面量>', TOOL_DESC.<同名>, …)` 收集两条路径，动态回调形态它看不见，
    // 会让 `tableKeys.size === byName.size` 不成立。回调保持为空以实现"只注册一次"的显式化。
    register: function (name, description, parameters, handler) { /* 挂载见 mathTool 之后的字面量两行 */ },
    params: function () { return params },
    projectRoot: function () { return frameworkRoot() },
    designator: 'vibe-math-v3',
    // 宿主明知没有 subprocess 服务时可以直接说 false ⇒ 模块立即返回 MATH_NO_SUBPROCESS（不再逐个探引擎）。
    hasSubprocess: function () { const sub = subprocessOf(); return !!(sub && typeof sub.spawn === 'function') },
    // **可选能力，按宿主实际情况声明**：宿主 fs 没有 listDir 就不给这个回调（模块据此跳过
    // "每项目 run 目录数 >200" 的保留检查，而不是每次运行都白问一次）。
    listDir: (typeof fs.listDir === 'function') ? mathListDir : undefined,
    // round-7 (fix 2): DSH's own bundled runtimes (`<home>/.dsh/dsh-runtimes/*/dependencies/<engine>/`)
    // as a LAST resort after PATH. Only generic roots are supplied here; the module globs the tree
    // name (never `dsh-primary-runtime`) and only accepts the descriptor's own candidate names.
    runtimeRoots: () => { const env = process.env.DSH_HOME; if (env) return [String(env)]; const home = String(process.env.HOME || process.env.USERPROFILE || ''); return home ? [home.replace(/[\\/]+$/, '') + '/.dsh'] : [] },
    listDirAbs: async function (abs) { try { const t = await fsTarget(abs); const st = await fs.stat(t); if (!st) return []; return (await fs.listDir(t)) || [] } catch (e) { return [] } },
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
  // 真实注册必须等到 `const handlers = {}` 与 `function registerTool(...)` 就绪（handlers 是 const，
  // 提前调用会撞 TDZ）⇒ 这里只留槽位，注册放在会话工具表旁。
  let mathTool = null
  /** 刷新探测缓存。`mathComputation:'off'` ⇒ 不探测、不缓存、不注入（真 no-op）。 */
  async function refreshMathProbe(force) {
    if (params.mathComputation === 'off') { mathProbe = null; mathProbeAt = 0; return null }
    if (!mathTool) return null
    try {
      mathProbe = await mathTool.probe(force ? { refresh: true } : undefined)
      mathProbeAt = now()
      // 规则漂移自检（A 项）：可用性行必须带"替代必须声明（诚实性）"。引用**常量**而非比对文本：
      // 模块改措辞不会误报，只有整条规则消失才会响。
      if (mathProbe && mathAvailabilityLine(mathProbe, 'zh', params.mathMode).indexOf(MATH_SUBSTITUTION_RULE_LINE) === -1) {
        console.error('vibe-math-v3: 可用性行缺少替代声明规则（MATH_SUBSTITUTION_RULE_LINE）')
      }
    } catch (e) { mathProbe = null }
    return mathProbe
  }
  /** 心跳里的 TTL 刷新（每拍一次布尔判断）。 */
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
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'directionsPerSolver', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs', 'tickIntervalMs', 'activityLogCap', 'maxExplorerRetries', 'planningHorizon', 'planMinIntervalMs', 'plannerMaxFails', 'methodKeepIntervalMs', 'methodKeepEvery', 'projectLockTimeoutMs', 'fileLockTimeoutMs']
    const numFields = ['promoteValueThreshold']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny', 'leanArgs']
    const boolFields = ['plannerEnabled', 'methodAutoPromote', 'indexAutoRebuild', 'finalPaper', 'paperCompilePdf', 'leanAsync']
    // 数学计算六参数的显式强制（FREEZE §5.3）：交给共享模块的 normalizeMathParams 逐键判型
    // （enum/array/integer）——`'false'`/错类型/错枚举一律回退默认，**绝不**落到末尾的
    // `else { out[k] = v }`（那条尾巴会把任意字符串当合法值放行）。
    const mathNorm = normalizeMathParams(obj)
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
      if (MATH_PARAM_NAMES.indexOf(k) !== -1) { out[k] = Object.prototype.hasOwnProperty.call(mathNorm, k) ? mathNorm[k] : DEFAULT_PARAMS[k]; continue }
      if (intFields.indexOf(k) !== -1) { const n = Number(v); out[k] = Number.isFinite(n) ? Math.floor(n) : DEFAULT_PARAMS[k] }
      else if (numFields.indexOf(k) !== -1) { const n = Number(v); out[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_PARAMS[k] }
      else if (arrayFields.indexOf(k) !== -1) { out[k] = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' }) : DEFAULT_PARAMS[k] }
      else if (boolFields.indexOf(k) !== -1) { out[k] = (v === true || v === false) ? v : DEFAULT_PARAMS[k] }
      else if (k === 'mode') { out[k] = (v === 'manual' || v === 'auto') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'verdictMode') { out[k] = (v === 'flat' || v === 'forced') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'reportMode') { out[k] = (v === 'file' || v === 'push' || v === 'both') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'priorityAdjust') { out[k] = (v === 'none' || v === 'deadend-deprioritize' || v === 'survival-map') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'proposPriorityAdjust') { out[k] = (v === 'none' || v === 'progress-graded') ? v : DEFAULT_PARAMS[k] }
      // Lean 形式化（契约 §1）：非法值一律回退默认，且**绝不**回退到更强的档位——
      // 一个拼错的值若被当成 encourage/require，会让每个对象都被形式化要求卡住。
      else if (k === 'formalVerify') { out[k] = (v === 'off' || v === 'encourage' || v === 'require') ? v : 'off' }
      else if (k === 'leanCommand') { const s = String(v == null ? '' : v).trim(); out[k] = s || 'lean' }
      else if (k === 'leanTimeoutMs') { const n = Number(v); out[k] = (Number.isFinite(n) && n > 0) ? Math.floor(n) : DEFAULT_PARAMS[k] }
      // Lean 增量/异步（spec §1.1 + 修订 §5）：并行度必须有下界（0 会让队列永不推进，静默失效）。
      else if (k === 'leanJobsMaxParallel') { const n = Number(v); out[k] = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : DEFAULT_PARAMS[k] }
      else if (k === 'leanInitiative') { out[k] = (v === 'off' || v === 'normal' || v === 'eager') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'leanSearchPaths') {
        if (!Array.isArray(v)) { out[k] = DEFAULT_PARAMS[k] } else {
          const seen = {}
          out[k] = v.map(function (x) { return String(x == null ? '' : x).trim() }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true })
        }
      }
      else if (k === 'solverAllowNetwork' || k === 'verifierAllowNetwork' || k === 'solverAllowScripts' || k === 'verifierAllowScripts') { out[k] = (v === true || v === false || v === '') ? v : DEFAULT_PARAMS[k] }
      // 最终论文（spec v2 §B）：布尔/枚举必须**显式归一化**，不允许未知键直通（'false' 会保持真值）。
      else if (k === 'paperFormat') { out[k] = (v === 'both' || v === 'md' || v === 'tex') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'paperLanguage') { out[k] = (v === 'zh' || v === 'en') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'paperLatexCommand') { const s = String(v == null ? '' : v).trim(); out[k] = s }
      else { out[k] = v }
    }
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
      console.error('vibe-math-v3: invalid vibe_math_setting.json ignored: ' + String((e && e.message) || e))
    }
  }
  function settingsTemplateFrom(src) {
    const lines = []
    lines.push('{')
    lines.push('  // Vibe Math V3 默认参数配置（JSON with Comments，可加 // 注释）。')
    lines.push('  // 位置：<项目>/vibe_math_setting.json（全局回退：<工作区>/VibeMath/vibe_math_setting.json）。')
    lines.push('  // 本文件是参数的唯一持久化来源：vibe_math_set_params / set_mode 会立即写回此文件；全局文件仅作项目文件不存在时的回退默认。')
    const keys = Object.keys(src).sort()
    // 只输出有值的键（同 v2）：JSON.stringify(undefined) 返回 undefined，直接拼接会写出
    // `"k": undefined` 这种非法 JSON，本插件自己的 loadSettings() 随后会整份忽略，用户的
    // 参数设置静默丢失。逗号按实际写出的条目计算，避免跳过键后留下尾随逗号。
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

  // ================= md soft-spec helpers =================
  // 软规范：对象 md 头部锚点行（唯一强制部分）+ 正文自由叙述。调度器只解析
  // 头部锚点与条目标题行（### 解法/证明/证伪 N｜标题｜概率X｜状态Y），从不解析正文散文。
  function anchorLine(k, v) {
    // 锚点行是**逐行**格式，parseAnchors 的 `.*$` 不跨行（无 `s` 标志）：值里含换行会让这一行被
    // 劈成两行，第二行既不是锚点也会污染下一个锚点/段落的解析。compose 侧统一折成空格（审计 L6）。
    return '- ' + k + ': ' + String(v == null ? '' : v).replace(/[\r\n]+/g, ' ')
  }
  // 解析条目标题行 + 其后正文，直到下一个 ### / ## 标题。返回 [{heading, text}]
  /**
   * 按顺序切出正文里的所有 `## ` 顶层段。用于"无损往返"：compose 只重新生成自己管理的
   * 那几段，其余段（例如 经验与教训、或代理自加的任何段）必须原样保留，否则每次调度器
   * 回写都会把代理写进卡片的内容抹掉（违反 实现方案.md「正文只追加，不覆盖」）。
   */
  /** 未被 compose 接管的段：原样保留，避免回写时丢失。 */
  /** 把保留段追加到 compose 输出末尾（无则原样返回），保证正文只增不减。 */
  function withExtraSections(lines, extras) {
    if (!Array.isArray(extras) || extras.length === 0) return lines
    for (let i = 0; i < extras.length; i++) {
      const s = extras[i]
      if (!s || !s.name) continue
      lines.push('## ' + s.name)
      if (s.text) lines.push(s.text)
      lines.push('')
    }
    return lines
  }

  // ---- compose / parse: Problem ----
  function composeProblemMd(p) {
    const lines = []
    lines.push('# 问题｜' + (p.标题 || p.id))
    lines.push(anchorLine('标题', p.标题 || p.id))
    lines.push(anchorLine('ID', p.id))
    lines.push(anchorLine('类型', '问题'))
    lines.push(anchorLine('状态', p.状态 || '求解中'))
    // 形式化锚点（契约 §6/§9.1）：与「状态」同行区，让读者一眼看到这条结论的形式化强度。
    // off 模式或尚无形式化记录时**不写这一行**（off 必须是真正的无操作）。
    if (formalAnchorLine(p.id)) lines.push(anchorLine('形式化', formalAnchorLine(p.id)))
    lines.push(anchorLine('优先级', p.优先级 == null ? 1 : p.优先级))
    lines.push(anchorLine('依赖', JSON.stringify(p.依赖 || [])))
    lines.push(anchorLine('被依赖', JSON.stringify(p.被依赖 || [])))
    lines.push(anchorLine('来源', p.来源 || '原始'))
    // 关联锚点（H4）：这两行此前**只读不写** ⇒ 任何一次重载（resume / vibe_math_index /
    // set_project / 进程重启都会按文件名重新解析卡片）之后，判断问题与它的临时假设命题
    // 全部失联：processStatusUpdates 的"收口僵尸判断问题"分支、settleVerdict 的"回写源命题"
    // 分支、Verified 卡的来源字段都只在同进程内有效。写出来才是真正的持久关联。
    if (p.判断命题) lines.push(anchorLine('判断命题', p.判断命题))
    if (p.来源命题) lines.push(anchorLine('来源命题', p.来源命题))
    lines.push(anchorLine('计划', p.计划 || ''))
    lines.push('')
    lines.push('## 陈述')
    lines.push(p.陈述 || '')
    lines.push('')
    if (p.来源与动机) { lines.push('## 来源与动机'); lines.push(p.来源与动机); lines.push('') }
    lines.push('## 解法候选')
    const sols = p.solutions || []
    if (sols.length === 0) lines.push('（暂无解法候选）')
    else for (let i = 0; i < sols.length; i++) {
      const s = sols[i]
      lines.push('### 解法 ' + (i + 1) + '｜' + escField(s.title || '解法' + (i + 1)) + '｜概率' + probText(s.prob != null ? s.prob : 0.5) + '｜状态' + escField(s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    return withExtraSections(lines, p.extraSections).join('\n').trimEnd() + '\n'
  }
  function parseProblemMd(id, text) {
    const { head, body } = splitHeader(text)
    const a = parseAnchors(head)
    const sols = parseEntries(body, entryRe('解法')).map(function (e) { return { title: unescField(e.title), prob: clamp01(e.prob), status: unescField(e.status), text: e.text } })
    return {
      id: id, 标题: a['标题'] || id, 状态: a['状态'] || '求解中',
      优先级: (a['优先级'] === 'never' ? 'never' : (Number(a['优先级']) || 1)),
      依赖: safeJson(a['依赖'], []), 被依赖: safeJson(a['被依赖'], []),
      来源: a['来源'] || '原始', 计划: a['计划'] || '',
      陈述: section(body, '陈述'), 来源与动机: section(body, '来源与动机'),
      solutions: sols, 判断命题: a['判断命题'] || '', 来源命题: a['来源命题'] || '',
      extraSections: extraBodySections(body, ['陈述', '来源与动机', '解法候选']),
    }
  }

  // ---- compose / parse: Proposition ----
  function composePropositionMd(p) {
    const lines = []
    lines.push('# 命题｜' + (p.标题 || p.id))
    lines.push(anchorLine('标题', p.标题 || p.id))
    lines.push(anchorLine('ID', p.id))
    lines.push(anchorLine('类型', '命题'))
    lines.push(anchorLine('状态', p.状态 || '未定论'))
    lines.push(anchorLine('概率', p.概率 == null ? 0.5 : p.概率))
    // 形式化锚点（契约 §6/§9.1）：紧邻 状态/概率，off 模式或状态为 none 时不写（无操作）。
    if (formalAnchorLine(p.id)) lines.push(anchorLine('形式化', formalAnchorLine(p.id)))
    lines.push(anchorLine('优先级', p.优先级 == null ? 1 : p.优先级))
    lines.push(anchorLine('依赖', JSON.stringify(p.依赖 || [])))
    // 来源锚点（H4）：与问题卡的 判断命题/来源命题 对称——不写盘的话，重载后
    // 「引理来自哪个问题/方向」丢失，Verified 命题卡的 `- 来源:` 也会永久为空。
    if (p.来源问题) lines.push(anchorLine('来源问题', p.来源问题))
    if (p.来源方向) lines.push(anchorLine('来源方向', p.来源方向))
    if (p.价值关键性 != null) lines.push(anchorLine('价值/关键性', p.价值关键性))
    lines.push('')
    lines.push('## 陈述')
    lines.push(p.陈述 || '')
    lines.push('')
    lines.push('## 证明尝试')
    const proofs = p.proofs || []
    if (proofs.length === 0) lines.push('（暂无证明尝试）')
    else for (let i = 0; i < proofs.length; i++) {
      const s = proofs[i]
      lines.push('### 证明 ' + (i + 1) + '｜' + escField(s.title || '证明' + (i + 1)) + '｜概率' + probText(s.prob != null ? s.prob : 0.5) + '｜状态' + escField(s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    lines.push('## 证伪尝试')
    const refutes = p.refutes || []
    if (refutes.length === 0) lines.push('（暂无证伪尝试）')
    else for (let i = 0; i < refutes.length; i++) {
      const s = refutes[i]
      lines.push('### 证伪 ' + (i + 1) + '｜' + escField(s.title || '证伪' + (i + 1)) + '｜概率' + probText(s.prob != null ? s.prob : 0.5) + '｜状态' + escField(s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    return withExtraSections(lines, p.extraSections).join('\n').trimEnd() + '\n'
  }
  function parsePropositionMd(id, text) {
    const { head, body } = splitHeader(text)
    const a = parseAnchors(head)
    const proofs = parseEntries(body, entryRe('证明')).map(function (e) { return { title: unescField(e.title), prob: clamp01(e.prob), status: unescField(e.status), text: e.text } })
    const refutes = parseEntries(body, entryRe('证伪')).map(function (e) { return { title: unescField(e.title), prob: clamp01(e.prob), status: unescField(e.status), text: e.text } })
    return {
      id: id, 标题: a['标题'] || id, 状态: a['状态'] || '未定论',
      概率: clamp01(a['概率'] != null ? Number(a['概率']) : 0.5),
      优先级: (a['优先级'] === 'never' ? 'never' : (Number(a['优先级']) || 1)),
      依赖: safeJson(a['依赖'], []),
      价值关键性: a['价值/关键性'] != null ? clamp01(Number(a['价值/关键性'])) : 0.5,
      陈述: section(body, '陈述'), proofs: proofs, refutes: refutes,
      来源问题: a['来源问题'] || '', 来源方向: a['来源方向'] || '',
      extraSections: extraBodySections(body, ['陈述', '证明尝试', '证伪尝试']),
    }
  }

  // ---- compose / parse: Method ----
  function composeMethodMd(m) {
    const lines = []
    lines.push('# 方法｜' + (m.标题 || m.id))
    lines.push(anchorLine('标题', m.标题 || m.id))
    lines.push(anchorLine('ID', m.id))
    lines.push(anchorLine('类型', m.类型 || '方法'))
    lines.push(anchorLine('状态', m.状态 || '经验'))
    lines.push(anchorLine('可信断言', JSON.stringify(m.可信断言 || [])))
    lines.push(anchorLine('上级体系', JSON.stringify(m.上级体系 || [])))
    lines.push(anchorLine('子方法', JSON.stringify(m.子方法 || [])))
    lines.push(anchorLine('相关', JSON.stringify(m.相关 || [])))
    lines.push(anchorLine('适用场景', m.适用场景 || ''))
    lines.push('')
    lines.push('## 核心内容')
    lines.push(m.核心内容 || '')
    lines.push('')
    if (m.定义与记号) { lines.push('## 定义与记号'); lines.push(m.定义与记号); lines.push('') }
    lines.push('## 应用记录')
    const apps = m.applications || []
    if (apps.length === 0) lines.push('（暂无应用记录）')
    else for (let i = 0; i < apps.length; i++) {
      lines.push('### 应用 ' + (i + 1) + '｜' + (apps[i].at || fmtTime()) + '｜问题 ' + (apps[i].问题 || '') + (apps[i].方向 ? ' 方向 ' + apps[i].方向 : ''))
      lines.push(apps[i].text || '')
      lines.push('')
    }
    lines.push('## 改进历史')
    const imps = m.improvements || []
    if (imps.length === 0) lines.push('（暂无改进记录）')
    else for (let i = 0; i < imps.length; i++) {
      lines.push('### v' + (imps[i].v || (i + 1)) + '（' + (imps[i].原因 || '') + '）')
      lines.push(imps[i].text || '')
      lines.push('')
    }
    return withExtraSections(lines, m.extraSections).join('\n').trimEnd() + '\n'
  }
  /**
   * 解析应用记录标题行 `### 应用 N｜<时间>｜问题 <qid> 方向 <dirId>`。
   * 必须把 问题/方向 取回来：compose 会按本对象的字段重写该标题行，若解析时丢成空串，
   * 每次回写都会把"用在哪"永久抹掉（实现方案.md 要求记录 问题/方向）。
   */

  // ---- compose: Verified card ----
  function composeVerifiedMd(card) {
    const lines = []
    lines.push('# 已验证｜' + (card.标题 || card.id))
    lines.push(anchorLine('ID', card.id))
    lines.push(anchorLine('类型', card.类型 || '命题'))
    lines.push(anchorLine('结论', card.结论 === true ? '真' : (card.结论 === false ? '假' : '')))
    lines.push(anchorLine('概率', card.概率))
    // 结论卡片必须随信带上形式化强度：读者要能分辨"内核已核对"与"仅共识"（契约 §8）。
    if (formalAnchorLine(card.id)) lines.push(anchorLine('形式化', formalAnchorLine(card.id)))
    lines.push(anchorLine('分类', card.分类 || '未分类'))
    lines.push(anchorLine('来源', card.来源 || ''))
    lines.push(anchorLine('时间', fmtTime(card.时间)))
    lines.push('')
    lines.push('## 陈述')
    lines.push(card.陈述 || '')
    lines.push('')
    lines.push('## 可信内容')
    lines.push(card.内容 || '')
    lines.push('')
    return lines.join('\n').trimEnd() + '\n'
  }

  // ================= data layer =================
  function categoryOf(p) { const cat = p.分类 || '未分类'; return String(cat).replace(/[\\/:*?"<>|]/g, '_') || '未分类' }
  // 路径构造只走这三个 helper：读写两侧必须用同一把"文件名"，否则会出现
  // "写进 A、又从 B 判断是否存在"的不一致（例如 idSafe 改了文件名而读侧仍用原始 id）。
  function problemRel(p) { return 'Problems/' + idSafe(p.id) + '.md' }
  function propositionRel(p) { return 'Propos/' + categoryOf(p) + '/' + idSafe(p.id) + '.md' }
  function methodRel(m, global) { return global ? (vibeRoot() + '/Methods/' + idSafe(m.id) + '.md') : ('Methods/' + idSafe(m.id) + '.md') }
  function verifiedRel(card) { return 'Verified/' + (card.类型 === '问题' ? '问题' : '命题') + '/' + idSafe(card.id) + '.md' }
  async function saveProblem(p) { await writeText(problemRel(p), composeProblemMd(p)) }
  async function saveProposition(p) { await writeText(propositionRel(p), composePropositionMd(p)) }
  async function saveMethod(m, global) { if (global) { await writeTextAbs(methodRel(m, true), composeMethodMd(m)) } else { await writeText(methodRel(m, false), composeMethodMd(m)) } }
  async function saveVerified(card) { await writeText(verifiedRel(card), composeVerifiedMd(card)) }
  async function ensureProgressDir(qid) { const base = frameworkRoot(); return await runShell(mkdirCmd([base + '/Progress/' + qid])) }
  // 单个方向的完整日志文本（供"每方向一个文件"与聚合复用）
  function directionMdText(qid, d, standalone) {
    const lines = []
    if (standalone) { lines.push('# 研究方向日志｜' + qid + ' / ' + d.id); lines.push('') }
    lines.push('- 方向: ' + d.title)
    lines.push('- 存活率: ' + (d.survival != null ? d.survival : '?') + '；状态: ' + d.status + (d.round ? '；轮次: ' + d.round : ''))
    if (d.method) lines.push('- 方法: ' + d.method)
    if (d.core_assumption) lines.push('- 核心假设: ' + d.core_assumption)
    if (d.dead_end_reason) lines.push('- 死路原因: ' + d.dead_end_reason)
    if (d.lemmas && d.lemmas.length) lines.push('- 引理索引: ' + d.lemmas.map(function (l) { return '「' + l.title + '」(' + l.id + ')' }).join('；'))
    lines.push('')
    for (const j of (d.journal || [])) {
      lines.push('### 第 ' + j.round + ' 轮｜' + (j.agent || '') + '｜' + (j.at || ''))
      lines.push(j.prose || '')
      lines.push('')
    }
    return lines.join('\n').trimEnd() + '\n'
  }
  // 研究日志 = 每方向一个独立文件（由代理直接写：Progress/<qid>/<dirId>.md，方向间无并发冲突）
  //            + 聚合索引（Progress/<qid>.md，由调度器从 dirState 汇总，不覆盖各方向文件）
  async function writeJournal(qid) {
    const dirs = dirState.get(qid) || []
    const lines = []
    lines.push('# 研究日志｜' + qid)
    lines.push('')
    const arch = archivedJ[qid] || []
    for (const seg of arch) { lines.push(seg); lines.push('') }
    for (const d of dirs) {
      lines.push('## 方向 ' + d.id + '｜' + d.title + '｜存活率' + (d.survival != null ? d.survival : '?') + '｜状态' + d.status)
      if (d.core_assumption) { lines.push(''); lines.push('**核心假设**：' + d.core_assumption) }
      if (d.method) { lines.push('**方法**：' + d.method) }
      if (d.dead_end_reason) { lines.push('**死路原因**：' + d.dead_end_reason) }
      // 引理只在摘要给"索引"（id+标题），完整叙述在各方向文件 Progress/<qid>/<dirId>.md（由代理或调度器写入）
      if (d.lemmas && d.lemmas.length) { lines.push('**引理索引**：' + d.lemmas.map(function (l) { return '「' + l.title + '」(' + l.id + ')' }).join('；')) }
      lines.push('**完整叙述**：见 `Progress/' + qid + '/' + d.id + '.md`')
    lines.push(PAPER_PATH_NOTE)
      for (const j of (d.journal || [])) {
        lines.push('')
        lines.push('### 第 ' + j.round + ' 轮｜' + (j.agent || '') + '｜' + (j.at || ''))
        lines.push(j.prose || '')
      }
      lines.push('')
    }
    await writeText('Progress/' + qid + '.md', lines.join('\n').trimEnd() + '\n')
    // 兜底（审计 F1）：聚合索引在上面用 `**完整叙述**：见 Progress/<qid>/<d.id>.md` 指向**逐方向**
    // 研究日志。设计上这些文件由**代理**写（见 applyAgentWrites 的 Progress/<qid>/ 分支），但代理没写
    // 时索引就会指向不存在的文件。这里补一份**调度器维护**的版本：`ensureProgressDir` 建目录、
    // `directionMdText` 生成内容；带 scheduler-managed 标记的文件每轮刷新，**代理写的文件绝不动**。
    // D6：只在**确实要写**时建目录（旧实现在每轮 writeJournal 开头无条件跑一次 shell mkdir，
    // 即使所有方向文件都已存在且归代理所有）；宿主没有 subprocess 时直接跳过（writeText 仍会落盘），
    // 这样无 shell 宿主的每一轮日志也不会留下一条 mkdir 失败记录。
    let journalDirReady = false
    for (const d of dirs) {
      const rel = 'Progress/' + qid + '/' + d.id + '.md'
      // 归属判定：带 `<!-- scheduler-managed -->` 首行的文件由**调度器**维护（每轮刷新）；
      // 其它文件视为**代理**所有、绝不触碰（契约：聚合索引不覆盖各方向文件）。
      let exists = false, owned = false
      try {
        const txt = await readText(rel)
        exists = txt !== undefined
        owned = exists && String(txt).indexOf('<!-- scheduler-managed -->') === 0
      } catch (e) { exists = false; owned = false }
      if (exists && !owned) continue
      if (!journalDirReady) {
        journalDirReady = true
        try { if (subprocessOf()) await ensureProgressDir(qid) } catch (e) { /* 无 shell：不打扰这一轮 */ }
      }
      await writeText(rel, '<!-- scheduler-managed -->\n' + directionMdText(qid, d, true))
    }
  }
  // 代理直接写内容：模拟/落盘代理声称写的文件（__writes），真实环境代理用 write 工具自己写，此处为调度器兜底落盘
  async function applyAgentWrites(writes) {
    if (!Array.isArray(writes)) return { ok: true, applied: 0 }
    let applied = 0
    for (const w of writes) {
      if (!w || !w.path) continue
      const safe = String(w.path).replace(/\\/g, '/').replace(/\.\./g, '')
      if (!/^(Problems|Progress|Propos|Methods|Notes)\//.test(safe)) continue // 只允许知识库路径，防越界
      const content = (w.content != null) ? String(w.content) : ''
      // Progress/<qid>/<dir>.md 需要 Progress/<qid>/ 子目录
      const m = /^Progress\/([^/]+)\//.exec(safe)
      if (m) { const base = frameworkRoot(); await runShell(mkdirCmd([base + '/Progress/' + m[1]])) }
      const t = await fs.resolve(safe, { cwd: frameworkRoot() })
      if (await fs.stat(t) !== undefined) { await fs.writeText(t, content, undefined, undefined, getPolicy()); applied += 1 }
      else { await writeText(safe, content); applied += 1 }
    }
    return { ok: true, applied: applied }
  }
  // 把将被替换的旧方向归档为"已归档方向"段（保留论文式历史，重派生不丢记录）
  async function archiveDirections(qid, oldDirs) {
    const withJournal = oldDirs.filter(function (d) { return d.journal && d.journal.length > 0 })
    if (withJournal.length === 0) return
    const segs = []
    for (const d of withJournal) {
      const lines = []
      lines.push('## 已归档方向 ' + d.id + '｜' + d.title + '｜状态' + (d.status || '') + '（共 ' + d.round + ' 轮）')
      if (d.lessons && d.lessons.length) lines.push('**教训**：' + d.lessons.join('；'))
      if (d.dead_end_reason) lines.push('**归档原因**：' + d.dead_end_reason)
      for (const j of (d.journal || [])) {
        lines.push('')
        lines.push('### 第 ' + j.round + ' 轮｜' + (j.agent || '') + '｜' + (j.at || ''))
        lines.push(j.prose || '')
      }
      segs.push(lines.join('\n'))
    }
    archivedJ[qid] = (archivedJ[qid] || []).concat(segs)
    await writeJson('State/archived_journals.json', archivedJ)
  }
  function getDirState(qid) { if (!dirState.has(qid)) dirState.set(qid, []); return dirState.get(qid) }
  async function saveDirState() { await writeJson('State/directions.json', Object.fromEntries(dirState)) }
  async function rebuildIndex() {
    const idx = {
      at: now(), project: currentProject,
      problems: Object.fromEntries(problems), propos: Object.fromEntries(propos),
      methods: Object.fromEntries(methods), dirs: Object.fromEntries(dirState),
    }
    await writeJson('State/index.json', idx)
    lastIndexWrite = now()
    return { ok: true, problems: problems.size, propos: propos.size, methods: methods.size }
  }
  async function loadKnowledgeBase() {
    problems = new Map(); propos = new Map(); methods = new Map(); globalMethods = new Map(); dirState = new Map()
    try {
      const pf = await listFiles('Problems')
      for (const f of pf) {
        if (!/\.md$/i.test(f)) continue
        const id = f.replace(/\.md$/i, '')
        const text = await readText('Problems/' + f)
        if (text === undefined) continue
        try { problems.set(id, parseProblemMd(id, text)) } catch (e) { console.error('vibe-math-v3: parse problem ' + id + ' failed: ' + String((e && e.message) || e)) }
      }
      const cats = await listDirs('Propos')
      for (const cat of cats) {
        const files = await listFiles('Propos/' + cat)
        for (const f of files) {
          if (!/\.md$/i.test(f)) continue
          const id = f.replace(/\.md$/i, '')
          const text = await readText('Propos/' + cat + '/' + f)
          if (text === undefined) continue
          try { const p = parsePropositionMd(id, text); p.分类 = cat; propos.set(id, p) } catch (e) { console.error('vibe-math-v3: parse proposition ' + id + ' failed: ' + String((e && e.message) || e)) }
        }
      }
      const mf = await listFiles('Methods')
      for (const f of mf) {
        if (!/\.md$/i.test(f)) continue
        const id = f.replace(/\.md$/i, '')
        const text = await readText('Methods/' + f)
        if (text === undefined) continue
        try { methods.set(id, parseMethodMd(id, text)) } catch (e) { console.error('vibe-math-v3: parse method ' + id + ' failed: ' + String((e && e.message) || e)) }
      }
      // global methods (read-only visibility; writes go through promote)
      try {
        const gFiles = await listFilesAbs(vibeRoot() + '/Methods')
        for (const f of gFiles) {
          if (!/\.md$/i.test(f)) continue
          const id = f.replace(/\.md$/i, '')
          const text = await readTextAbs(vibeRoot() + '/Methods/' + f)
          if (text === undefined) continue
          try { globalMethods.set(id, parseMethodMd(id, text)) } catch (e) {}
        }
      } catch (e) {}
      const dj = await readJson('State/directions.json')
      if (dj && typeof dj === 'object') dirState = new Map(Object.entries(dj))
    } catch (e) { console.error('vibe-math-v3: loadKnowledgeBase failed: ' + String((e && e.message) || e)) }
  }
  async function listFilesAbs(path) { try { const t = await fs.resolve(path); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'file' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  function allProblems() { return Array.from(problems.values()) }
  function allPropos() { return Array.from(propos.values()) }
  function depResolved(id) {
    // M9：对象键一律是 idSafe(id)（见各写入点），依赖是模型写的原始 id ⇒ 查表前必须走同一把归一化。
    id = idSafe(id)
    if (problems.has(id)) { const q = problems.get(id); return q.状态 === '已解决' || q.优先级 === 'never' }
    if (propos.has(id)) { const p = propos.get(id); return p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never' } // never = 主动弃权，视为依赖已满足，避免等待依赖死锁
    return true // unknown dependency: treat as resolved (conservative)
  }
  function problemDepReady(q) { return (q.依赖 || []).every(function (d) { return depResolved(d) }) }
  // 被依赖自动回填：X 依赖 Y → Y.被依赖 加入 X
  async function syncDependencies() {
    for (const q of allProblems()) { if (q.被依赖 && q.被依赖.length) q.被依赖 = [] }
    for (const q of allProblems()) {
      for (const d of (q.依赖 || [])) {
        const t = problems.get(d)
        if (t) { if (!t.被依赖) t.被依赖 = []; if (t.被依赖.indexOf(q.id) === -1) t.被依赖.push(q.id) }
      }
    }
  }

  // ================= persistence (scheduler state) =================
  /**
   * 并发计数**从 registry 推导**，不再独立维护/持久化（与 v2 同一处修复）。
   *
   * 此前 `scheduler.activeCount` 手工累加：spawn +1、每次 followup 也 +1，只在 onChildEnd
   * 里 -1，而 onChildEnd 开头 `if (meta === undefined) return` 会跳过那次减法。任何一次
   * `subagent/end` 丢失、或 end 到达时 child 已不在 `agentRegistry`，都会让 +1 永远没人抵消；
   * 计数单调增长至 ≥ maxParallelThreshold 后所有派发闸门恒真，系统再也不派代理，而 running
   * 仍为 true、status 照常响应。计数还会写进 scheduler_state.json 一路带下去。
   */
  function activeCount() { return Object.keys(agentRegistry).length }
  /** P2：状态提交的原子性 + 完整性标记。
   *
   *  可用能力只有 fs.resolve/stat/readText/writeText（**宿主没有 rename**）。所以提交协议是
   *  「**暂存 → 回读校验 → 提交 → 标记**」：
   *    1) 每个状态文件先写 `<rel>.tmp`，再回读确认**非空**（截断/失败写在这里就被抓住）；
   *    2) 暂存成功才把它写进最终路径（`writeText(rel, …)`），失败则记入 `stateWriteFailures`；
   *    3) 全部落地后**最后**写 `State/commit.json`：`{seq, at, checkpoint, files, missing, mode}`
   *       —— 它是"这次提交完整"的唯一标记，恢复时用它判断上一次提交是否撕裂。
   *
   *  **不用 shell move**：宿主可能只提供受控/模拟的 subprocess（本轮实测：假 subprocess 返回 exit 0
   *  但不会真的移动文件 ⇒ "搬"成功、文件却不存在，状态直接丢失）。有鉴于此，这里坚持只走宿主 fs API；
   *  代价是没有 rename 级原子性，收益是任何宿主上都不会静默丢文件。
   */
  let stateCommitSeq = 0
  let stateCommit = { seq: 0, at: 0, complete: false, mode: '', files: [], missing: [] }
  const stateWriteFailures = []   // P4：被拒绝/失败的落盘（status/report 可见）
  function noteStateWriteFailure(rel, error) {
    stateWriteFailures.push({ rel: String(rel), error: String(error || 'unknown'), at: now() })
    if (stateWriteFailures.length > 32) stateWriteFailures.shift()
  }
  async function relNonEmpty(rel) {
    try { const t = await fsTarget(rel); const st = await fs.stat(t); return !!(st && (st.size === undefined || st.size > 0)) } catch (e) { return false }
  }
  async function writeJsonAtomic(rel, obj) {
    // P4：原子路径也必须过损坏守卫（否则「存在但解析失败」的状态文件会被静默覆写）
    if (!assertWritable(rel)) {
      noteStateWriteFailure(rel, 'corruption guard refused write')
      logActivity('state', '拒绝写入（该 JSON 已存在但无法解析，先修/删它）：' + rel)
      return 'refused'
    }
    const text = JSON.stringify(obj, null, 2)
    // 没有 shell 就没法清理暂存文件（宿主 fs 无 delete/rename）⇒ 直接写，避免留下 .tmp 垃圾与告警
    if (!subprocessOf()) {
      try { await writeText(rel, text) } catch (e) { noteStateWriteFailure(rel, (e && e.message) || e) }
      if (!(await relNonEmpty(rel))) noteStateWriteFailure(rel, 'written but empty/missing')
      return 'direct'
    }
    const tmp = rel + '.tmp'
    let staged = false
    try { await writeText(tmp, text); staged = await relNonEmpty(tmp) } catch (e) { staged = false }
    let mode = 'direct'
    if (staged) {
      try { await writeText(rel, text); mode = 'stage-commit' } catch (e) { noteStateWriteFailure(rel, (e && e.message) || e) }
      try { await removeFile(tmp) } catch (e) { /* 清理暂存文件失败不影响提交内容 */ }
    } else {
      try { await writeText(rel, text) } catch (e) { noteStateWriteFailure(rel, (e && e.message) || e) }
    }
    if (!(await relNonEmpty(rel))) noteStateWriteFailure(rel, 'written but empty/missing')
    return mode
  }
  async function commitState(files) {
    stateCommitSeq += 1
    const modes = []
    const missing = []
    for (let i = 0; i < files.length; i++) {
      const mode = await writeJsonAtomic(files[i].rel, files[i].obj)
      modes.push(mode)
      if (!(await relNonEmpty(files[i].rel))) missing.push(files[i].rel)
    }
    const commit = {
      seq: stateCommitSeq, at: now(), epoch: processEpoch,
      checkpoint: Number(scheduler.lastCheckpoint) || now(),
      files: files.map(function (x) { return x.rel }), missing: missing,
      mode: modes.indexOf('stage-commit') === -1 ? 'direct' : 'stage-commit',
    }
    await writeJsonAtomic('State/commit.json', commit)
    stateCommit = Object.assign({ complete: missing.length === 0 }, commit)
    return commit
  }
  async function loadState() {
    const s = await readJson('State/scheduler_state.json')
    // 丢弃历史持久化的 activeCount：旧值可能已漂移，绝不能覆盖推导值。
    if (s) { const restored = Object.assign({}, s); delete restored.activeCount; scheduler = Object.assign({}, scheduler, restored) }
    await loadCommitMarker()
    // P5：活动日志回读（旧实现只落 report 快照且从不回读）
    const al = await readJson('State/activity_log.json')
    if (Array.isArray(al) && al.length) { const seen = {}; const merged = []; for (const e of al.concat(activityLog)) { const k = String(e && e.at) + '|' + String(e && e.detail); if (seen[k]) continue; seen[k] = true; merged.push(e) } activityLog = merged.slice(-ACTIVITY_PERSIST_MAX) }
    // P6：论文排队/回收计数恢复；在途撰写者跨进程不可恢复 ⇒ 清掉留痕
    const pj = await readJson('State/paper.json')
    if (pj && typeof pj === 'object') { if (pj.pending) paperPending = pj.pending; paperReaps = Number(pj.reaps) || 0 }
    if (paperInFlight) { logActivity('paper', '上一进程的在途撰写者 ' + paperInFlight + ' 不可恢复 ⇒ 交由 paper 锁/回收逻辑重新触发'); paperInFlight = ''; paperInFlightAt = 0 }
    const r = await readJson('State/agents.json'); if (r) agentRegistry = r
    const dq = await readJson('State/decision_queue.json'); if (dq) decisionQueue = dq
    const va = await readJson('State/verifier_accuracy.json'); if (va) verifierAccuracy = va
    const tk = await readJson('State/tasks.json'); if (tk) tasks = tk
    const er = await readJson('State/explorer_retries.json'); if (er) explorerRetries = er
    const pq = await readJson('State/plans.json')
    // 计划队列的**跨进程**语义（审计 L9）：planQueue 是"本进程内跨 tick"的队列，里面的动作指的是
    // 当时那个进程/那次运行的对象与状态。上一进程留下的队列在恢复时重放，轻则对已不存在的 target
    // 空转，重则把过期计划的动作施加到新状态上。进程 epoch 是权威判据：只有本进程写下的队列才恢复。
    if (pq && Array.isArray(pq.queued)) {
      if (pq.epoch === processEpoch) planQueue = pq.queued
      else if (pq.queued.length > 0) { planQueue = []; logActivity('plan', '丢弃上一进程留下的 ' + pq.queued.length + ' 条计划动作（跨进程重放会施加过期计划）') }
    }
    const ml = await readJson('State/method_log.json'); if (ml) methodLog = Object.assign({ pendingInventions: [], keepCount: 0, lastKeepAt: 0 }, ml)
    const pl = await readJson('State/project_lock.json'); if (pl) projectLock = Object.assign({ sessionId: '', at: 0 }, pl)
    const lp = await readJson('State/last_plan.json'); if (lp) lastPlanSummary = lp
    const aj = await readJson('State/archived_journals.json'); if (aj && typeof aj === 'object') archivedJ = aj
    const fm = await readJson('State/formal.json')
    if (fm && typeof fm === 'object') {
      const rec = (fm.records && typeof fm.records === 'object') ? fm.records : {}
      // 只接受形状正确的记录：单个坏条目不该让整份形式化状态失效（与 loadKnowledgeBase 的容错一致）。
      const clean = {}
      for (const k of Object.keys(rec)) { const r = rec[k]; if (r && typeof r === 'object' && typeof r.status === 'string') clean[k] = r }
      formalState = { records: clean, todo: Array.isArray(fm.todo) ? fm.todo.filter(function (t) { return t && t.id }) : [], libRuns: (fm.libRuns && typeof fm.libRuns === 'object') ? fm.libRuns : {} }
    }
  }
  /** P2：恢复时校验上一次提交的完整性（标记列出但缺失/为空的状态文件 = 撕裂提交）。 */
  async function loadCommitMarker() {
    const cm = await readJson('State/commit.json')
    if (!cm || typeof cm !== 'object') { stateCommit = { seq: 0, at: 0, complete: false, mode: '', files: [], missing: [] }; return stateCommit }
    const missing = []
    const files = Array.isArray(cm.files) ? cm.files : []
    for (let i = 0; i < files.length; i++) { if (!(await relNonEmpty(files[i]))) missing.push(files[i]) }
    stateCommitSeq = Number(cm.seq) || 0
    stateCommit = Object.assign({}, cm, { complete: missing.length === 0, missing: missing })
    if (missing.length && files.length) logActivity('state', '上一次状态提交不完整（缺失/为空：' + missing.join(', ') + '）⇒ 按逐文件容错读取，最后一次提交的部分字段可能丢失')
    return stateCommit
  }
  async function saveAll() {
    // P2：checkpoint 先落内存再提交（旧顺序 ⇒ 磁盘 checkpoint 永远滞后一次）
    scheduler.lastCheckpoint = now()
    const files = [
      // P5：活动日志（有界）落盘；P6：论文排队/回收计数落盘
      // 注：这里**没有** v2 的 pending_review_scores.json——v3 的"历史准确率"按稳定身份键直接累计、
      // 没有"等对象后来取得布尔定论再回溯计分"的待计分表，因此它的缺席是**设计如此**，不是漏掉的产物。
      { rel: 'State/activity_log.json', obj: activityLog.slice(-ACTIVITY_PERSIST_MAX) },
      { rel: 'State/paper.json', obj: { pending: paperPending, reaps: paperReaps } },
      { rel: 'State/scheduler_state.json', obj: scheduler },
      { rel: 'State/agents.json', obj: agentRegistry },
      { rel: 'State/decision_queue.json', obj: decisionQueue },
      { rel: 'State/verifier_accuracy.json', obj: verifierAccuracy },
      { rel: 'State/tasks.json', obj: tasks },
      { rel: 'State/explorer_retries.json', obj: explorerRetries },
      { rel: 'State/plans.json', obj: { queued: planQueue, epoch: processEpoch } },
      { rel: 'State/method_log.json', obj: methodLog },
      { rel: 'State/project_lock.json', obj: projectLock },
      { rel: 'State/archived_journals.json', obj: archivedJ },
    ]
    if (formalOn() || Object.keys(formalState.records).length || formalState.todo.length || Object.keys(formalState.libRuns).length) files.push({ rel: 'State/formal.json', obj: formalState })
    if (lastPlanSummary) files.push({ rel: 'State/last_plan.json', obj: lastPlanSummary })
    await commitState(files)
  }
  // 未启用且从未产生任何形式化记录时不落这份状态文件（off 保持真正的无操作）。
  async function refreshParams() {
    params = Object.assign({}, DEFAULT_PARAMS)
    await loadSettings()
    await migrateLegacyParams()
  }
  async function migrateLegacyParams() {
    const legacy = await readJson('State/params.json')
    if (!legacy || Object.keys(legacy).length === 0) return
    try {
      params = Object.assign({}, params, sanitizeParams(legacy))
      await saveSettings()
      await writeJson('State/params.json', {})
      await removeFile('State/params.json')
      logActivity('params', 'legacy State/params.json merged into vibe_math_setting.json and removed')
    } catch (e) { console.error('vibe-math-v3: params migration failed: ' + String((e && e.message) || e)) }
  }

  // ================= reporting =================
  function logActivity(event, detail) { activityLog.push({ at: now(), event: event, detail: String(detail || '') }); const cap = Number(params.activityLogCap) || 100; if (activityLog.length > cap) activityLog.shift(); reportDirty = true }
  async function buildReport() {
    return {
      ok: true, at: now(), project: currentProject, projectExists: await projectExistsOnDisk(), frameworkRoot: frameworkRoot(),
      running: scheduler.running, mode: params.mode,
      activeCount: activeCount(), maxParallelThreshold: params.maxParallelThreshold,
      problems: { total: problems.size, solved: allProblems().filter(function (q) { return q.状态 === '已解决' }).length },
      propositions: { total: propos.size, resolved: allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length },
      verifyPending: (await buildVerifyCandidates()).length,
      methods: { project: methods.size, global: globalMethods.size, pendingInventions: methodLog.pendingInventions.length },
      // F1：与 status() 同形（数字）；明细挪到独立键名 pendingDecisionItems。
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,
      pendingDecisionItems: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      registeredAgents: Object.keys(agentRegistry).length,
      queuedPlanActions: planQueue.length,
      recentActivity: activityLog.slice(-Math.min(ACTIVITY_REPORT_MAX, Number(params.activityLogCap) || 100)),
      // Lean 形式化：模式 + 每个对象的状态 + 形式化待办（可读参数表在 params 里）。
      formal: formalSummary(),
      params: params,
      // F5：与 status 对齐，周期快照也能看到论文/编译状态。
      paper: await paperStatusView(),
    }
  }
  async function maybeWriteReport(force) {
    const interval = Number(params.reportIntervalMs) || 0
    if (!force && interval > 0 && (now() - lastReportWrite) < interval) return
    if (!force && interval <= 0 && !reportDirty) return
    await writeJson('Progress_Logs/report.json', await buildReport())
    await writeNarrativeReport()
    lastReportWrite = now(); reportDirty = false
  }
  async function writeNarrativeReport() {
    // 论文式人读摘要（调度器编译，无需额外代理）
    const lines = []
    lines.push('# 项目进展报告｜' + currentProject + '｜' + fmtTime())
    lines.push('')
    lines.push('## 总览')
    lines.push('- 运行中：' + (scheduler.running ? '是' : '否') + '；活跃子代理：' + activeCount() + '/' + params.maxParallelThreshold)
    lines.push('- 问题：' + allProblems().filter(function (q) { return q.状态 === '已解决' }).length + '/' + problems.size + ' 已解决；命题：' + allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length + '/' + propos.size + ' 已定论')
    lines.push('- 方法库：项目 ' + methods.size + ' 条，全局 ' + globalMethods.size + ' 条，待沉淀发明 ' + methodLog.pendingInventions.length + ' 条')
    lines.push('- 待执行计划动作：' + planQueue.length + ' 条；待人工决策：' + decisionQueue.filter(function (d) { return d.status === 'pending' }).length + ' 条')
    lines.push('')
    lines.push('## 问题状态')
    for (const q of allProblems()) {
      const dirs = getDirState(q.id)
      // F7：人读报告不把裸代码状态拼进中文；中文化后把代码放括号里备查。
    const DIR_STATUS_ZH = { active: '进行中', 'dead-end': '死路', success: '已成功', queued: '排队中' }
    const dirInfo = dirs.length ? '（方向：' + dirs.map(function (d) { return d.id + ':' + (DIR_STATUS_ZH[d.status] || d.status) + '(' + d.status + ')' }).join(', ') + '）' : ''
      lines.push('- **' + q.id + '**：' + q.状态 + '，优先级 ' + q.优先级 + '，解法 ' + (q.solutions || []).length + ' 条' + dirInfo)
    }
    lines.push('')
    lines.push('## Lean 形式化')
    if (!formalOn()) {
      lines.push('- 未启用（`formalVerify` = off；可用 vibe_math_set_params 切到 encourage / require）')
    } else {
      const fs2 = formalSummary()
      lines.push('- 模式：' + fs2.mode + '（' + (fs2.mode === 'require' ? '强制：定论前必须有 Lean 通过或显式阻塞记录' : '鼓励：按实现难度自行决定') + '）')
      lines.push('- 已通过：' + (fs2.passed.join('、') || '（无）'))
      lines.push('- 已记录阻塞：' + (fs2.blocked.join('、') || '（无）'))
      lines.push('- 形式化待办：' + (fs2.todo.map(function (t) { return t.id }).join('、') || '（无）'))
      lines.push('- 可复用库：VibeMath/Formal/{Lib,Proved}/（跨项目）｜本项目形式化：Formal/｜归档证明：Verified/Lean/')
    }
    lines.push('')
    lines.push('## 最近活动')
    for (const e of activityLog.slice(-10)) lines.push('- ' + fmtTime(e.at) + ' [' + e.event + '] ' + e.detail)
    lines.push('')
    await writeText('Logs/报告.md', lines.join('\n'))
  }
  async function maybePushReport(force) {
    const mode = params.reportMode || 'file'
    if (mode !== 'push' && mode !== 'both') return
    const interval = Number(params.reportIntervalMs) || 0
    if (interval > 0) { if (!force && (now() - lastPushReport) < interval) return }
    else if (!force && !reportDirty) return
    if (!rootAgent || typeof rootAgent.followup !== 'function') return
    try {
      const report = await buildReport()
      const text = '[Vibe Math V3] 进度更新：项目 "' + currentProject + '" 运行中=' + (report.running ? '是' : '否') +
        '，问题 ' + report.problems.solved + '/' + report.problems.total + ' 已解决，命题 ' + report.propositions.resolved + '/' + report.propositions.total + ' 已定论，' +
        '活跃代理轮数=' + report.activeCount + '，待人工决策=' + report.pendingDecisions + '，待执行计划=' + report.queuedPlanActions + '。' +
        '请调用 vibe_math_report 汇总当前进展，并用 vibe_math_list_agents 取各代理（id/角色/目标）状态，再用人话简要汇报（不打断用户，简短即可）。'
      // 来源 kind 必须是**已声明**的：`MessageSourceMap` 是 merge-extensible 联合，但没有共享的
      // catch-all `plugin` kind（审计 L5/dsh-llm message.d.ts），{kind:'plugin'} 是契约外形状。
      // role 本来就是 'user'，正文自带 "[Vibe Math V3] 进度更新" 的真署名，故用核心声明的 {kind:'user'}。
      rootAgent.followup({ id: uuid(), role: 'user', content: [textBlock(text)], source: { kind: 'user' } })
      lastPushReport = now()
    } catch (e) {
      console.error('vibe-math-v3: push report failed: ' + String((e && e.message) || e))
    }
  }

  // ================= child spawn / followup =================
  // F-6a：宿主 list() 失败（或既无 spawn 也无 fork）时回退到假定值必须**留痕**，不能静默猜。
  let providerFallbackWarned = false
  function warnProviderFallback(why) {
    if (providerFallbackWarned) return
    providerFallbackWarned = true
    console.error('vibe-math-v3: pickProvider() falling back to \'spawn\': ' + why)
  }
  function pickProvider() { let names = []; let listed = false; try { names = subagents.list ? subagents.list() : []; listed = true } catch (e) { warnProviderFallback('subagents.list() failed: ' + ((e && e.message) || e)) } if (names.indexOf('spawn') !== -1) return 'spawn'; if (names.indexOf('fork') !== -1) return 'fork'; if (listed) warnProviderFallback('host exposes neither spawn nor fork (list=' + JSON.stringify(names) + ')'); return 'spawn' }
  function childAgentOptions(role) {
    const o = {}
    try { if (rootAgent && rootAgent.options) { if (rootAgent.options.provider) o.provider = rootAgent.options.provider; if (rootAgent.options.model) o.model = rootAgent.options.model } } catch (e) {}
    const pv = role === 'planner' ? params.plannerProvider : params.provider
    const md = role === 'planner' ? params.plannerModel : params.model
    if (pv) o.provider = pv
    if (md) o.model = md
    return o
  }
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
  // 'web_fetch' is only registered when the composition enables fetch (the v4
  // preset sets `fetch: false`), so it is a candidate that sanitizeToolFilter drops.
  const NETWORK_TOOLS = ['web_search', 'web_fetch']
  /**
   * Drop filter names this host does not register. `known` comes from the host's
   * own rejection message, which lists every registered global tool, so this
   * never guesses. Returns undefined when nothing usable remains.
   */
  /** The host names the offending tools and then lists the registered ones. */
  function buildToolFilter(role) {
    const allow = role === 'solver' ? params.solverToolAllow : role === 'verifier' ? params.verifierToolAllow : undefined
    const deny = role === 'solver' ? params.solverToolDeny : role === 'verifier' ? params.verifierToolDeny : undefined
    const net = role === 'solver' ? params.solverAllowNetwork : role === 'verifier' ? params.verifierAllowNetwork : undefined
    const scr = role === 'solver' ? params.solverAllowScripts : role === 'verifier' ? params.verifierAllowScripts : undefined
    let a = Array.isArray(allow) ? allow.slice() : []
    let d = Array.isArray(deny) ? deny.slice() : []
    if (net === false) d = d.concat(NETWORK_TOOLS); else if (net === true && a.length > 0) a = a.concat(NETWORK_TOOLS)
    if (scr === false) d = d.concat(SCRIPT_TOOLS); else if (scr === true && a.length > 0) a = a.concat(SCRIPT_TOOLS)
    const f = {}
    if (a.length > 0) f.allow = a
    if (d.length > 0) f.deny = d
    return (f.allow || f.deny) ? f : undefined
  }
  async function spawnChild(label, promptText, meta) {
    const role = meta && meta.role
    const request = { prompt: [textBlock(promptText)], parent: rootAgent, agentOptions: childAgentOptions(role) }
    const tf = buildToolFilter(role)
    if (tf) request.toolFilter = tf
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
        console.error('vibe-math-v3: the configured tool permission filter names ONLY tools this host does not register, so it cannot be honored; refusing to spawn WITHOUT a filter (that would grant the very access the operator denied). filter=' + JSON.stringify(request.toolFilter) + ' host said: ' + message)
        throw e
      }
      if (!changed) {
        if (request.toolFilter) console.error('vibe-math-v3: startContinuable with toolFilter failed (NOT retrying without the permission filter, to avoid silently granting unrestricted tools): ' + message)
        throw e
      }
      console.error('vibe-math-v3: tool permission filter named tools this host does not register; retrying with only registered names (denied-tool intent preserved). dropped=' + JSON.stringify(request.toolFilter) + ' kept=' + JSON.stringify(retryFilter))
      const retryRequest = Object.assign({}, request)
      retryRequest.toolFilter = retryFilter
      try { started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: retryRequest, signal: makeSignal(30000) }) }
      catch (e2) {
        console.error('vibe-math-v3: startContinuable retry with sanitized toolFilter also failed: ' + String((e2 && e2.message) || e2))
        throw e2
      }
    }
    agentRegistry[started.childId] = Object.assign({ createdAt: now() }, meta || {})
    childOwner.set(started.childId, sessionId)
    // 并发计数由 agentRegistry 推导，无需手工 +1。
    await saveAll()
    return started.childId
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
    } catch (e) { console.error('vibe-math-v3: wake ' + childId + ' failed: ' + String((e && e.message) || e)); throw e }
    // 并发计数由 agentRegistry 推导，无需手工 +1。
    await saveAll()
  }
  /**
   * 中断一个**在册**子代理。审计 D1：旧实现 `try{…}catch(e){}` 把"没有这个 child / 宿主拒绝中断"
   * 都吞成静默成功（调用方拿到 undefined，还以为已经中断）。现在：空/未知 id ⇒ `code` +
   * `next{tool,hint}`，宿主抛错 ⇒ 保留错误文本并给替代出口；只有真的发出中断才 `ok:true`。
   */
  /** F-6b：中断失败必须留痕（调用点此前丢掉 {ok:false}，界面看起来一切正常）。 */
  async function interruptTraced(cid, why) {
    const r = await interruptChild(cid)
    if (r && r.ok === false) logActivity('interrupt', '中断失败（' + why + '）：' + String(cid) + ' — ' + String(r.message || r.code || ''))
    return r
  }
  async function interruptChild(childId) {
    const id = String(childId == null ? '' : childId).trim()
    if (!id) return { ok: false, code: 'VIBE_MATH_INVALID_ARGUMENT', message: 'interruptChild 失败：childId 为空——无法确定要中断哪个子代理。', next: { kind: 'reason', tool: 'vibe_math_list_agents', hint: '用 vibe_math_list_agents 列出本会话在册子代理的 id，再带 childId 调用。' } }
    if (!Object.prototype.hasOwnProperty.call(agentRegistry, id)) return { ok: false, code: 'VIBE_MATH_CHILD_NOT_FOUND', message: 'interruptChild 失败：' + id + ' 不在本会话的在册子代理里（在册 ' + Object.keys(agentRegistry).length + ' 个）——可能已经结束，或不是本会话的子代理。', next: { kind: 'reason', tool: 'vibe_math_list_agents', hint: '用 vibe_math_list_agents 取当前在册 id；要停整个会话用 vibe_math_abort。' } }
    try {
      await subagents.interrupt(id, { kind: 'ancestor', agent: rootAgent })
      return { ok: true, childId: id }
    } catch (e) {
      return { ok: false, code: 'VIBE_MATH_INTERRUPT_FAILED', message: 'interruptChild 失败：宿主拒绝中断 ' + id + '（' + String((e && e.message) || e) + '）。', next: { kind: 'reason', tool: 'vibe_math_abort', hint: '宿主不接受单点中断时，用 vibe_math_abort 终止整个会话的子代理。' } }
    }
  }

  // ================= prompts =================
  function personaText(key) { return params[key] ? (String(params[key]) + '\n\n') : '' }
  function kcTrustLayers() {
    return '\n1) TRUST LAYERS — the single most important rule:\n' +
      '- Verified/ 中的内容 = 绝对可信（已被验证器判定为真/假并生成只读副本）：可直接引用。\n' +
      '- Propos/ 中 状态: 已验证·真/假 的命题 = 可信（以 Verified/ 副本为准）。\n' +
      '- 其余一切（未定论命题、Progress/ 研究日志、Methods/ 中未验证断言、Notes/）= 经验性记录/参考，绝不能当作已成立事实引用。\n' +
      '- 概率语义：1 = 绝对正确（可当已知事实）；0 = 绝对错误；0 与 1 之间 = 未定论/待验证。\n'
  }
  function kcObjectModels() {
    return '\n2) OBJECT MODELS（md 卡片，软规范：头部锚点行 + 正文自由叙述）：\n' +
      '- 问题卡 Problems/<id>.md：{ 标题, ID, 类型:问题, 状态:原始|求解中|等待依赖|已解决|死路, 优先级, 依赖:[], 被依赖:[], 来源:原始|后生, 计划（由调度器按规划代理的计划自动更新：一句话说明下一轮安排）, ## 陈述（完整问题陈述，每个记号/对象都要完整定义）, ## 来源与动机（后生问题：产生流程/动机/如何回填主线）, ## 解法候选（### 解法 N｜标题｜概率X｜状态Y + 叙述式完整解法）}。\n' +
      '- 命题卡 Propos/<分类>/<id>.md：{ 标题, ID, 类型:命题, 状态:未定论|已验证·真|已验证·假, 概率, 优先级, 依赖:[], 价值/关键性, 来源问题, 来源方向, ## 陈述（完整）, ## 证明尝试（### 证明 N｜…｜概率X｜状态Y）, ## 证伪尝试（### 证伪 N｜…｜概率X｜状态Y）}。\n' +
      '- `价值/关键性 ∈ [0,1]`（M1）：这条命题对**整个项目主线**有多关键——若它成立/被证伪，能改变多少后续方向。≥ promoteValueThreshold（默认 0.7）且仍未定论(概率∈(0,1))的命题会被自动晋升成「判断下述命题是否成立：…」问题，由求解器专门证明/证伪并把结果回写源命题。你不填就默认 0.5（永不晋升）。**只有你（写卡的代理）能设这个值**——请在你认为"这条引理/猜想值得单独立项"时显式写上。\n' +
      '- 证明/证伪尝试语义：`## 证明尝试`=为证实而写的论证；`## 证伪尝试`=专门反驳/反例的论证。**失败的"找反例未果"/sanity check 是支持性证据，不属于证伪尝试**；不要写入 `## 证伪尝试`（否则系统会当作待验证的反驳去验证）。对仍未完成的证明/证伪，明确标注缺口而非伪装完成。\n' +
      '- 方法卡 Methods/<id>.md：{ 标题, ID, 类型:方法, 状态:经验|应用验证|含已验证断言, 可信断言:[]（只允许已进 Verified/ 的 ID）, 上级体系/子方法/相关, 适用场景, ## 核心内容, ## 定义与记号, ## 应用记录, ## 改进历史 }。\n' +
      '- 收口规则：某个解法/证明/证伪 概率=1 → 问题已解决 / 命题已验证（状态/概率锚点由调度器改写）。\n'
  }
  function kcFolders() {
    return '\n3) FOLDERS：Problems/ 问题清单；Progress/ 研究日志（每问题一个聚合索引 <qid>.md + 每方向一个文件 <qid>/<dirId>.md，按方向按轮续写）；Propos/ 命题库；Methods/ 理论发明库；Verified/ 绝对可信（只读）；Reliable/ 可信参考文献（只读）；Notes/ 自由笔记；Logs/ 审计；State/ 调度器私有——不要读也不要改。\n'
  }
  function kcMethodLibrary() {
    return '\n5) METHOD LIBRARY RULES：开工前先查 Methods/（含全局 VibeMath/Methods/），有可复用方法/体系则引用其 ID；用后必须在 methods_used 上报（含效果与改进建议）；本轮新发明/经验性总结必须在 new_inventions 上报（类型：理论体系|框架|工具|方法|思想|范式|技巧）——若与某张已有方法卡同类，在内容描述里注明"可并入 m-xxx"以便 Method Keeper 合并而非重复建卡。**重要区分**：methods_used 只能填**已存在方法卡的 ID**（形如 m-abc12345，来自 AVAILABLE METHODS 列表）；你自己刚想出的新方法/新技巧不属于 methods_used，请如实填入 new_inventions（由 Method Keeper 蒸馏建卡）；千万不要把方法名/标题文字当 id 填进 methods_used。\n'
  }
  function kcOutputQuality() {
    return '\n4) OUTPUT QUALITY RULES：完整性、不断章取义——任何输出的问题/命题/结论都要给出完整陈述并补全所依赖的对象/环境/背景定义；引用必须给出处（文件路径 + ID + 锚点/节），事实只引 Verified/；若结论依赖临时假设 p，必须显式写「若 <p 完整陈述> 成立，则：…」。你的机器回复是一个 JSON 对象（```json 围栏内），JSON 之外不要再输出其他文本——任何要写进 md 的内容都通过文件工具写入，不要当作聊天气泡输出。'
  }
  // 写文件共用规则（仅供真正写 md 的代理：solver / method-keeper）：写锁、上报、回退；不含具体归属文件（按角色注入）
  function kcWriteRules() {
    return '\nWRITE-INTO-MD WORKFLOW（优先推荐）：把研究内容直接写进你的归属 Markdown 文件，而不是塞进回复 JSON。\n' +
      '- **并发写安全**：写任何文件前先 `vibe_math_claim_write({target:"<相对项目根的路径>"})` 申请写锁（同一文件同一时刻只允许一个代理写；返回 busy 请稍后重试），写完 `vibe_math_release_write({target})`。不同方向是不同文件，天然不冲突。\n' +
      '- **写完必须上报**：用 `vibe_math_sync_meta({meta:{kind:"solver|methods", ...}})` 上报轻量元数据（方向状态/存活率/引理 id+证明/方法卡 id/新发明/解法），让调度器更新索引与调度——内容留在 md，只有调度元数据与**待验证的证明**才进机读接口。\n' +
      '- **分类一致性**：你写引理卡到 `Propos/<分类>/`，sync_meta 里该引理的 `分类` 字段必须严格等于那个目录名（否则调度器会按别处去查，找不到你写的卡）。\n' +
      '- 若你的环境无法真正写文件（文件工具不可用/被拒），回退：把要写的内容放进回复 JSON 的 `__writes` 数组（`[{"path":"<目标>","content":"<全文>"}]`）并同样配 `meta`，由调度器落盘。两种方式二选一，不要重复。\n'
  }
  // 求解器专属：方向叙述 + 引理命题卡（带有完整证明）
  function kcSolverFiles() {
    return '你的归属文件：\n' +
      '- 求解器：把该方向的完整叙述（本轮进展/子路线/可行性信号/教训/完整解法文本）写进 `Progress/<问题id>/<方向id>.md`；聚合索引 `Progress/<问题id>.md` 由调度器维护，不要动它。\n' +
      '- 新引理：写一张完整命题卡到 `Propos/<分类>/<p-id>.md`，含锚点 `- 标题:`、`- ID/类型/状态/概率/优先级/价值关键性` 与 `## 陈述`；证明写进 `### 证明 1｜标题｜概率X｜状态Y` 段落（完整证明文本是验证必需，否则验证器只能验裸命题）。`- 价值/关键性: <0..1>` 表示这条引理对项目主线的关键程度（≥ 阈值会被自动晋升为独立问题），别省。\n'
  }
  // 方法整理代理专属：方法卡
  function kcKeeperFiles() {
    return '你的归属文件：\n' +
      '- 方法整理代理：写 `Methods/<m-id>.md`，含 `- 标题/ID/类型/状态/可信断言/适用场景` 与 `## 核心内容`/`## 应用记录`/`## 改进历史`。\n'
  }
  // 基础核心（所有代理都需：可信层级 / 对象模型 / 文件夹 / 输出质量）
  function coreKnowledgeContext() {
    return 'KNOWLEDGE BASE & DATA MODEL (definition contract you MUST follow):\n' +
      kcTrustLayers() + kcObjectModels() + kcFolders() + kcOutputQuality()
  }
  // 研究类角色（explorer / solver / method-keeper）：再加方法库规则；explorer 不写文件所以不带写-文件段
  function researchKnowledgeContext() { return coreKnowledgeContext() + kcMethodLibrary() }
  // 验证器：只返回 Result/Reason，不需要写文件与方法上报规则
  function verifierKnowledgeContext() { return coreKnowledgeContext() }
  function solverKnowledgeContext() { return researchKnowledgeContext() + kcWriteRules() + kcSolverFiles() }
  function methodKeeperKnowledgeContext() { return researchKnowledgeContext() + kcWriteRules() + kcKeeperFiles() }
  function knowledgeContextText(role) {
    const k = params.knowledgeContext ? String(params.knowledgeContext)
      : (role === 'verifier' ? verifierKnowledgeContext()
        : role === 'explorer' ? researchKnowledgeContext()
          : role === 'method-keeper' ? methodKeeperKnowledgeContext()
            : solverKnowledgeContext())
    return k ? ('\n' + k + '\n') : ''
  }
  function capabilitiesText(role) {
    // explorer 是研究/探索角色，工具预算与 solver 一致（网络/脚本/调用次数），仅 verifier 使用 verifier 配置
    const isSolver = role === 'solver' || role === 'explorer'
    const maxCalls = isSolver ? params.solverMaxToolCalls : params.verifierMaxToolCalls
    const netOn = isSolver ? params.solverAllowNetwork : params.verifierAllowNetwork
    const scrOn = isSolver ? params.solverAllowScripts : params.verifierAllowScripts
    const toolParts = []
    if (netOn !== false) toolParts.push('web search / literature lookup')
    if (scrOn !== false) toolParts.push('symbolic/numeric computation (running scripts)')
    let t = '\nYOUR PERMISSIONS / CAPABILITIES:\n'
    t += '- Network tools: ' + (netOn === false ? 'DISABLED for you' : 'available') + '; Script/shell tools: ' + (scrOn === false ? 'DISABLED for you' : 'available') + ' (your actual tool list is enforced by the framework).\n'
    t += toolParts.length > 0
      ? ('- You may use external tools (' + toolParts.join(', ') + ') to assist; ' + ((maxCalls && Number(maxCalls) > 0) ? ('call such external tools AT MOST ' + maxCalls + ' times this round.\n') : 'no per-round limit by default.\n'))
      : '- External tools: none enabled for you this round.\n'
    t += '- You may READ any file under Verified/ as a known, trusted dependency.\n'
    t += (role === 'verifier'
      ? '- You should BASE your verification on Verified/ and on Propos/ objects already marked 已验证·真/假; verify the TARGET against the rigorous standard, not against Methods/ or unproven claims.\n'
      : '- You should BASE your reasoning on Propos/ (propositions with proofs/refutations and probabilities), Methods/ (reusable theories/tools), Reliable/ (trusted references), and Verified/.\n')
    t += (role === 'verifier'
      ? '- You ONLY return Result/Reason JSON — you do not write files and you do not use the WRITE-INTO-MD workflow.\n'
      : (role === 'explorer'
        ? '- Your output is the direction set (structural metadata): report it via the metadata form (meta.kind=directions); the scheduler writes it into the research log. You do NOT write per-direction files.\n'
        : '- Write your research content directly into your assigned Markdown file (see WRITE-INTO-MD WORKFLOW) and return ONLY lightweight scheduling metadata; if your file tools are unavailable, fall back to the __writes + meta JSON described in the OUTPUT CONTRACT.\n'))
    t += '\nHOW TO READ EXISTING KNOWLEDGE: these are Markdown files. COARSE SCAN first: use read/grep on the anchor header lines (- 标题/- ID/- 状态/- 概率/- 优先级/- 依赖) to locate relevant objects — do NOT load full prose yet. FINE READ after: read the full card for 陈述/证明/证伪/解法/核心内容 sections.\n'
    return t
  }
  function methodsIndexText() {
    const list = []
    for (const m of methods.values()) list.push('- ' + m.id + '「' + m.标题 + '」(' + m.类型 + ', 状态=' + m.状态 + (m.可信断言 && m.可信断言.length ? ', 可信断言=' + m.可信断言.join(',') : '') + ')')
    for (const m of globalMethods.values()) list.push('- ' + m.id + '「' + m.标题 + '」(全局, ' + m.类型 + ', 状态=' + m.状态 + ')')
    // 方法库可能很大：只注入前 20 条索引，防止提示词膨胀（完整索引可读 Methods/ 目录）
    const shown = list.slice(0, 20)
    return shown.length ? ('\nAVAILABLE METHODS (Methods/, 含全局, 前 ' + shown.length + ' 条; 完整列表见 Methods/ 目录):\n' + shown.join('\n') + '\n') : ''
  }
  function explorerPrompt(q) {
    return personaText('explorerPersona') + 'You are a research mathematician orchestrating strategy for one problem.\n\nPROBLEM (id: ' + q.id + '): ' + q.陈述 + '\n' +
      knowledgeContextText('explorer') +
      methodsIndexText() +
      capabilitiesText('explorer') +
      '\nDo a first-stage METACOGNITIVE BRAINSTORM: decompose constraints, test boundary/extreme cases, map to similar known problems. First check the AVAILABLE METHODS list — if a listed method/system underlies a direction you will propose, reference its id in methods_used (the method card will log this direction as building on it; you are planning to leverage it, not claiming you already applied it). ' +
      'Then propose 3-6 DIVERSE, mutually distinct solution directions (e.g. analytic method, constructive proof, contradiction, numeric approximation + limit passage, categorical abstraction, ...). ' +
      'Record each direction with its core assumption and an initial feasibility estimate. Every direction must be self-contained: title / method / core_assumption written completely, defining every object they mention — no 断章取义.\n\n' +
      'feasibility ∈ [0,1] = your estimate of the probability this direction leads to a full solution. Respond with ONLY a single JSON object in a ```json code fence (no prose outside it). Register the directions as metadata; the scheduler writes them into the research log:\n' +
      '{"meta":{"kind":"directions","qid":"<qid>","directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5}],"methods_used":[{"id":"m-...","效果":"<为何该方向借鉴它>","建议":"..."}],"new_inventions":[{"类型":"方法|工具|...","标题":"...","内容描述":"...","是否已入库":false}]}}' +
      // 顺手形式化（契约 §6.2）+ 回执字段（契约 §6.3）
      mathWorkLine() + formalDailySection()
  }
  function rederivePrompt(q, prog) {
    const prior = prog.map(function (d) {
      return '- ' + d.id + '「' + d.title + '」status=' + d.status + ' round=' + d.round + ' survival=' + d.survival + (d.dead_end_reason ? ' [blocker: ' + d.dead_end_reason + ']' : '') +
        (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '')
    }).join('\n')
    return personaText('explorerPersona') + 'You are a research mathematician re-deriving strategy for a problem whose prior directions stalled or failed.\n\nPROBLEM (id: ' + q.id + '): ' + q.陈述 + '\n\nPRIOR DIRECTIONS (with blockers):\n' + prior + '\n' +
      knowledgeContextText('explorer') +
      methodsIndexText() +
      capabilitiesText('explorer') +
      '\nQuantitatively analyze the historical progress, blocker causes, and feasibility decay of each prior direction. Discard directions already proven dead ends (unless a new tool/idea changes that). ' +
      'Then deeply DERIVE 1-3 BRAND-NEW directions never tried before, each with a one-line motivation. Return the UNION of high-potential leftover directions and the brand-new directions (drop dead ends).\n\n' +
      'feasibility ∈ [0,1]. Respond with ONLY a single JSON object in a ```json code fence (no prose outside it). Register the directions as metadata; the scheduler writes them into the research log:\n' +
      '{"meta":{"kind":"directions","qid":"<qid>","directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5}],"methods_used":[{"id":"m-...","效果":"...","建议":"..."}],"new_inventions":[{"类型":"方法|工具|...","标题":"...","内容描述":"...","是否已入库":false}]}}' +
      mathWorkLine() + formalDailySection()
  }
  function directionSummary(d) {
    return 'id ' + d.id + '「' + d.title + '」method=' + d.method + ' | round=' + d.round + ' status=' + d.status +
      ' survival=' + d.survival +
      (d.lemmas && d.lemmas.length ? ' | lemmas: ' + d.lemmas.map(function (l) { return '「' + l.title + '」(' + l.id + ')' }).join('; ') : '') +
      (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '') +
      (d.lessons && d.lessons.length ? ' | lessons: ' + d.lessons.join('; ') : '') +
      (d.blockers && d.blockers.length ? ' | blockers: ' + d.blockers.join('; ') : '')
  }
  function buildSolverContext(all, own, round, perSolver) {
    const out = []
    const n = Math.max(1, Number(perSolver) || 1)
    let slots = n
    if (round > 1) { out.push(own); slots -= 1 }
    else slots -= 1
    const others = all.filter(function (d) { return d.id !== own.id && d.status === 'active' })
    for (let i = 0; i < others.length && slots > 0; i++) { out.push(others[i]); slots -= 1 }
    return out.map(directionSummary).join('\n')
  }
  function solverPrompt(q, dir, round, progressText) {
    let head = personaText('solverPersona') + 'You are a dedicated solver agent working ONE solution direction of a math problem (agent_self_iteration).\n\n'
    head += 'PROBLEM (id: ' + q.id + '): ' + q.陈述 + '\nDIRECTION: ' + dir.title + ' (method: ' + dir.method + '; core assumption: ' + dir.core_assumption + ')\nROUND: ' + round + ' of ' + params.solverMaxRounds + '\n'
    if (round > 1 || (progressText && progressText.length)) head += '\nYOUR PRIOR PROGRESS / OTHER DIRECTIONS:\n' + progressText + '\n'
    head += knowledgeContextText('solver')
    head += methodsIndexText()
    head += capabilitiesText('solver')
    head += '\nStart from the last recorded node of direction ' + dir.id + ' (inherit progress, or branch a sub-route under it). Consult AVAILABLE METHODS first — reuse a listed method/system when it fits (report it in methods_used).\n' +
      'PRIMARY GOAL: drive toward a COMPLETE solution of the problem along this direction. The single most valuable thing you can deliver is the full proof/solution; intermediate lemmas, sub-routes, lessons and inventions are by-products to record as you go, NOT the main deliverable — do not spread your effort across them at the expense of the proof itself. If the complete solution is not attainable this round, report honestly and still push as far as the core argument as you can.\n' +
      'Each round you should report (whenever produced):\n' +
      '- new lemmas / intermediate conclusions WITH full proofs (they become Propos/ proposition cards);\n' +
      '- each concrete sub-route tried, its progress overview, an EXPLICIT feasibility signal (e.g. "unremovable singularity", "conflicts with known theorem X"), and any blocker;\n' +
      '- lessons learned from failed attempts;\n' +
      '- survival ∈ (0,1) = your updated confidence that this direction can still be pushed to a full proof (not the confidence the current partial work is right);\n' +
      '- ANY new theory/tool/method/idea you invented or summarized this round in new_inventions (类型：理论体系|框架|工具|方法|思想|范式|技巧) — the Method Keeper will distill it into the theory library.'
    head += '\nIf you encounter an EXTREMELY complex auxiliary conjecture/sub-problem q_sub: list it in "sub_questions" as a PROBLEM-class object with its COMPLETE statement (every object/definition/notation fully defined — 不断章取义), together with p_{q-tmp}: a PROPOSITION-class TEMPORARY ASSUMPTION answering q_sub. TEMPORARILY ASSUME p_{q-tmp} holds and continue the main line — every later proposition/conclusion depending on it MUST be stated as "若 <p_{q-tmp} 的完整陈述> 成立，则：..." (complete definitions).\n'
    head += '\nIMPORTANT — PROBABILITY RULES FOR NEW RESULTS: any 概率 / prob / solution_prob / survival you output for NEW results must be strictly BETWEEN 0 and 1 (they await independent verifier confirmation). NEVER mark your own fresh lemma or solution as 1 or 0 — that is the verifiers\' job. Only facts already recorded in Verified/ count as certain.\n'
    head += '\nIf you obtain a COMPLETE solution: adversarially self-check (construct counterexamples, test boundary conditions) BEFORE declaring success; write the full solution prose into your direction Progress file and put the solution into the `solution_text` field of the meta.\n'
    head += '\nSTATUS SEMANTICS — report the truth, do not hedge: `success` = you produced a complete, self-consistent solution; `dead-end` = the direction is MATHEMATICALLY dead (a decisive blocker / a core sub-assumption refuted / a step proven impossible); `continue` = still viable and you made real progress this round. Do NOT use `dead-end` merely because you ran out of time — capping rounds is the controller\'s decision (solverMaxRounds), not yours; if you progressed but didn\'t finish, report `continue` with the new survival.\n'
    head += '\nLEMMA RULES: every lemma you register MUST carry a complete proof in `lemmas[].proof` (and in the card\'s `## 证明尝试`). If a claim is only partly argued, do NOT register it as a finished lemma — either prove it fully or record it as an explicit gap/conjecture stating the missing step, so the verifier knows exactly what is (and is not) being claimed. Incomplete "lemmas" waste verification and can mislead.\n'
    head += '\nOUTPUT CONTRACT — pick ONE channel. Write content into Markdown; only lightweight scheduling metadata (and verification-required proofs) cross the machine reply.\n' +
      'CHANNEL A (recommended, you can write files): write the full round narrative into `Progress/' + q.id + '/' + dir.id + '.md` and each new lemma card into `Propos/<分类>/<id>.md`, then reply ONLY this metadata object:\n' +
      '{"meta":{"kind":"solver","qid":"' + q.id + '","dirId":"' + dir.id + '","round":' + round + ',"survival":0.5,"status":"continue|success|dead-end","dead_end_reason":"... or null","lemmas":[{"id":"p-...","title":"...","statement":"...","proof":"<完整证明文本，供验证器核验>","prob":0.6,"价值/关键性":0.5,"分类":"<引理卡目录名，必须与你要写入的 Propos/<分类>/ 目录严格一致>","优先级":1}],"methods_used":[{"id":"m-...","效果":"...","建议":"..."}],"new_inventions":[{"类型":"...","标题":"...","内容描述":"...","是否已入库":false}],"solution_prob":0.85,"solution_text":"<完整解法文本，或 null>","sub_questions":[{"q_sub_title":"...","q_sub_statement":"完整问题陈述(含所有对象/定义)","assumption_title":"p_{q-tmp} 标题","assumption_statement":"完整假设陈述(含所有定义)"}]}}\n' +
      'CHANNEL B (your file tools are unavailable): put the content you would have written into __writes and carry the same meta:\n' +
      '{"__writes":[{"path":"Progress/' + q.id + '/' + dir.id + '.md","content":"<完整本轮叙述>"}],"meta":{"kind":"solver","qid":"' + q.id + '","dirId":"' + dir.id + '",...同上 meta 字段...}}\n' +
      '区分规则：methods_used 只能填**已存在的方法卡 ID**（m-…，来自 AVAILABLE METHODS 列表）——引用你自己刚想出的新方法/新技巧不属于 methods_used，请如实填入 new_inventions（它会由 Method Keeper 蒸馏建卡）；不要把方法名/标题当 id 填进 methods_used。'
    // 顺手形式化（契约 §6.2）：把常用/可复用的对象、假设、新定义沉淀到全局 Lean 库；
    // 回执里同样要带上 formal 难度判断字段（契约 §6.3）。
    head += mathWorkLine() + formalDailySection()
    return head
  }
  function verifierTargetText(r) {
    if (r.kind === 'proposition') return 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    if (r.kind === 'prop-proof') return 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    return 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
  }
  function verifierReviewPrompt(r) {
    const target = verifyTargetId(r)
    return personaText('verifierPersona') + 'You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.\n\nTARGET (r: ' + r.kind + '):\n' + verifierTargetText(r) + '\n' +
      knowledgeContextText('verifier') +
      capabilitiesText('verifier') +
      '\nResult ∈ [0,1] = your probability that the TARGET is CORRECT: 1 ONLY when you are fully certain (for a bare proposition: Reason must be a complete proof; for a proof/refutation/solution: you verified every step and Reason confirms the whole chain); 0 ONLY when you are certain it is wrong (Reason must be a rigorous complete refutation / pinpoint the fatal flaw); otherwise a value strictly between 0 and 1.\n' +
      '\nCalibration: 0.5 means "genuinely undecided — there is a real unresolved gap"; it is NOT a safe hedge, so do not default to 0.5. Give the number your honest confidence from the evidence actually supports.\n' +
      '\n**Reason is MANDATORY and MUST be non-empty**: name the exact step you verified, or the potential counterexample / fatal flaw, or (for 0.5) the precise gap that blocks a decision. A Result with an empty Reason is non-contributory and will be ignored; never return {"Result":0.5} with no justification.\n' +
      '\nCitations: facts may only be cited from Verified/ (or Propos/ 状态: 已验证·真/假). Never cite an unverified or refuted object as a fact — if you need a sub-claim of a refuted card, re-derive it yourself.\n' +
      // 形式化注入：模式与对象状态都在**构造提示词的这一刻**现算（运行中切档立刻生效）。
      // 若该对象已有通过的 Lean 证明，这一段把审查对象换成"忠实性"，而不是让评审重做推导（契约 §6.1）。
      (formalOn() ? '\n' + formalPromptBlock(target) + '\n' : '') +
      '\nIndependently output your initial review — ONLY a single JSON object in a ```json code fence, no prose outside it:\n' +
      '{"Result":0.5,"Reason":"<MANDATORY, non-empty: your detailed logic chain / potential counterexample / supporting evidence>"' + formalJsonField(target) + '}'
  }
  function verifierDebatePrompt(r, transcript) {
    const target = verifyTargetId(r)
    return personaText('verifierPersona') + 'You are one reviewer in a DEBATE ("交流群") about this object.\n\nTARGET:\n' + verifierTargetText(r) + '\n' +
      knowledgeContextText('verifier') +
      capabilitiesText('verifier') +
      '\nFULL DEBATE HISTORY SO FAR (每轮所有评审轮流发言的记录):\n' + transcript + '\n' +
      '\nRespond to the others (agree / rebut / add new evidence, referencing earlier rounds if needed). If you changed your Result because of them, state the reason explicitly. ' +
      'Remember: formal/notation-level flaws in an otherwise correct proof should lower confidence only slightly — a mathematically correct argument is not "uncertain" because of typos; near-consensus is not a deadlock. Undue swing to 0.5 is discouraged: a bare review merits 0.5 ONLY if there is a genuine undecidable gap, never as a hedge.\n' +
      '\nReason is MANDATORY and MUST be non-empty; an empty-Reason result (esp. a bare 0.5) is ignored as non-contributory, so always justify your number.\n' +
      // 辩论轮同样现算：对象已 Lean 通过时，辩论的题目是**忠实性**，不是重新推导。
      (formalOn() ? '\n' + formalPromptBlock(target) + '\n' : '') +
      '\nReply with ONLY a single JSON object in a ```json code fence, no prose outside it:\n' +
      '{"Result":0.5,"Reason":"<MANDATORY, non-empty: updated logic chain / counterexample / proof / refutation>","changed":"brief reason if you changed your Result, else null"' + formalJsonField(target) + '}'
  }
  function plannerPrompt(brief) {
    return personaText('plannerPersona') + 'You are the SCHEDULING PLANNER of a multi-agent mathematical research system. Your job: autonomously choose the OPTIMAL schedule — you may lay out the NEXT ' + params.planningHorizon + ' agent-task calls in one plan (they will be executed in order, beyond-capacity ones queued for later ticks).\n\n' +
      'CURRENT STATE BRIEF (JSON):\n' + JSON.stringify(brief, null, 2) + '\n\n' +
      'ACTION VOCABULARY — the code ACCEPTS exactly these 6 actions: spawn / interrupt / promote are HARD-VALIDATED (invalid ones are dropped), while wait / continue / stop are ADVISORY ONLY (they are logged and have NO scheduling effect):\n' +
      '- {"action":"spawn","role":"explorer","target":"<qid>","reason":"..."} — problem has no directions yet or all dead (re-derive).\n' +
      '- {"action":"spawn","role":"solver","target":"<qid>","direction":"<dirId>","reason":"..."} — active direction, needs a solving round.\n' +
      '- {"action":"spawn","role":"verifier","target":"<rId>","reason":"..."} — verify candidate (from verify_candidates); keep solving AND verifying balanced.\n' +
      '- {"action":"spawn","role":"method-keeper","reason":"..."} — distill pending inventions / maintain the theory library.\n' +
      '- {"action":"interrupt","childId":"<childId>","reason":"..."} — stop a running child (direction dead, superseded...).\n' +
      '- {"action":"promote","target":"<pId>","reason":"..."} — high-value unresolved proposition → judge problem.\n' +
      '- {"action":"wait","target":"<id>","reason":"..."} — advisory only (logged; no scheduling effect): you are waiting for a dependency.\n' +
      '- {"action":"continue","childId":"<childId>","reason":"..."} — advisory only (logged): continuation of an in-flight child is code-driven; this never re-dispatches anything.\n' +
      '- {"action":"stop","childId":"<childId>","reason":"..."} — advisory only (logged; it does NOT stop anyone). To actually stop a child use `interrupt` with a live childId.\n' +
      '\nHARD RULES: never re-schedule verified objects; problems with 依赖未就绪 (依赖就绪=false) should wait unless you explicitly accept a temporary assumption; respect capacity (brief.free_slots); PREFER problems whose dependencies are ready and whose directions have the highest survival; DO NOT forget verification — unresolved solutions/proofs/refutations (verify_candidates) will never be checked unless you schedule a verifier; DO NOT assume a direction is already being worked just because it is shown "active" in a problem — check brief.problems[].running_solver_dirs and brief.active_agents: schedule a solver for a direction ONLY if that direction is NOT in running_solver_dirs (an "active" direction absent from running_solver_dirs is WAITING to be dispatched, not being worked); schedule at most ' + params.planningHorizon + ' actions.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"summary":"one-line plan rationale","plan":[{"action":"...","role":"...","target":"...","direction":"...","childId":"...","reason":"..."}]}'
  }
  function methodKeeperPrompt(digest) {
    return personaText('methodKeeperPersona') + 'You are the METHOD KEEPER of a mathematical research system. Your job: distill reusable THEORIES, FRAMEWORKS, TOOLS, METHODS, IDEAS (including experiential ones) invented during solving into the theory library, so future work can apply and extend them — like inventing group theory while solving an equation, or functional analysis while studying variational problems.\n\n' +
      knowledgeContextText('method-keeper') +
      '\nRECENT WORK DIGEST:\n' + digest + '\n\n' +
      'For each pending invention decide: create a NEW method card, or fold it into an EXISTING method (as an improvement). Only list 可信断言 for claims already verified (ids from Verified/) — everything else stays 经验 (experiential). You may propose 上级体系/子方法 links to organize methods into systems.\n' +
      // Method Keeper 的职责正是「沉淀可复用方法」，所以形式化的沉淀也归它：可复用的定义/假设
      // 进全局 Lib/，已成立的引理进 Proved/，让后续项目的证明直接 import 复用（契约 §6.2）。
      mathWorkLine() +
      (formalWorkLine() + (formalOn() ? '\n【方法沉淀 × Lean 形式化】除了方法卡，你沉淀的每个可复用对象 / 定义 / 假设都应当归档到全局 Lean 库（vibe_math_lean_archive kind=\'def\'），已成立的引理归档到 Proved/（kind=\'lemma\'）；归档时**连同定义与陈述一起写清**，方便后续直接 import。\n' : '')) +
      'OUTPUT CONTRACT — pick ONE channel. Write method cards into Markdown; only the created IDs, which cards were used, and improvements cross the machine reply.\n' +
      'CHANNEL A (recommended, you can write files): write each method card into `Methods/<m-id>.md` — the `<m-id>` in the FILE NAME must be EXACTLY the id you list in `created`（调度器按 `created` 里的 id 去 `Methods/<id>.md` 找卡；不一致会被当成"已沉淀"而实际没有卡）(`# 方法｜标题` + `- 标题/ID/类型/状态/可信断言/适用场景` + `## 核心内容`/`## 应用记录`/`## 改进历史`), then reply ONLY this metadata:\n' +
      '{"meta":{"kind":"methods","used":[{"id":"m-...","效果":"...","建议":"..."}],"created":["m-xxx"],"improvements":[{"id":"m-...","改进内容":"...","原因":"..."}]}}\n' +
      'CHANNEL B (your file tools are unavailable): put the method-card content into __writes and carry the same meta:\n' +
      '{"__writes":[{"path":"Methods/<m-id>.md","content":"<# 方法｜标题 + 锚点 + ## 核心内容... 完整卡面>"}],"meta":{"kind":"methods","used":[...],"created":["m-xxx"],"improvements":[...]}}'
  }

  // ================= decisions (manual/auto) =================
  // 已结清决策的保留条数（审计 L1）：decisionQueue 以前只把 status 置 resolved、永不裁剪，
  // 且整表落盘到 State/decision_queue.json，长跑进程里它是第二处无界增长。保留最近 N 条已结清记录
  // 作为审计轨迹（list_decisions 只列 pending，所以裁剪不影响任何读取路径），pending 一律不裁。
  const RESOLVED_DECISION_KEEP = 50
  function pruneDecisionQueue() {
    let resolved = 0
    for (let i = 0; i < decisionQueue.length; i++) if (decisionQueue[i] && decisionQueue[i].status !== 'pending') resolved++
    let drop = resolved - RESOLVED_DECISION_KEEP
    if (drop <= 0) return
    const kept = []
    for (let i = 0; i < decisionQueue.length; i++) {
      const d = decisionQueue[i]
      if (d && d.status !== 'pending' && drop > 0) { drop--; continue }
      kept.push(d)
    }
    decisionQueue = kept
  }
  function enqueueDecision(node, contextText, data) { const d = { id: uuid(), node: node, context: contextText, data: data, status: 'pending', resolution: null, createdAt: now() }; decisionQueue.push(d); pruneDecisionQueue(); return d }
  async function maybeGate(node, contextText, data, autoFn) { if (params.mode === 'auto') return await autoFn(data); const d = enqueueDecision(node, contextText, data); setGate(d, node); logActivity('gate', node + ': ' + contextText); await saveAll(); return { gated: true, decisionId: d.id } }
  /**
   * 设置唯一闸门，并把被它取代的旧决策**立即结清**。
   *
   * gate 是单槽位，而设置点有三处（plan / verdict / method-promote）。若直接覆盖，旧决策会永远
   * 停留在 `pending`：它既不再有闸门指路（用户看不到该处理它），又会被后续 `set_mode auto` 的
   * autoResolvePending 扫到并**再次执行其副作用**（例如重放一份计划）。这里在覆盖前把旧决策
   * 标成 `resolved(superseded)`：不动它的副作用（当时的执行时机已过，安全默认是不执行），
   * 但保证它不会变成"幽灵待决"。
   */
  function setGate(d, node) {
    try {
      const prev = scheduler.gate
      if (prev && prev.decisionId && prev.decisionId !== d.id) {
        const old = decisionQueue.find(function (x) { return x.id === prev.decisionId })
        if (old && old.status === 'pending') {
          old.status = 'resolved'
          old.resolution = { action: 'superseded', node: prev.node }
          logActivity('gate', 'superseded pending decision ' + prev.decisionId + ' (' + prev.node + ') by ' + node)
        }
      }
    } catch (e) { /* 结清旧决策失败不应阻止新闸门生效 */ }
    scheduler.gate = { decisionId: d.id, node: node }
  }
  async function applyDecision(node, data, resolution) {
    if (node === 'spawn') {
      if (resolution.action === 'approve') { await spawnChild(data.label, data.promptText, data.meta); return { spawned: true } }
      try {
        const meta = data.meta || {}
        if (meta.role === 'explorer' && meta.qid) {
          const q = problems.get(meta.qid)
          if (q) { const dirs = getDirState(meta.qid); dirs.push({ id: 'd_' + shortId(), title: '用户拒绝派发', method: '', core_assumption: '', feasibility: 0, status: 'dead-end', round: 0, survival: 0, routes: [], lessons: [], blockers: [], lemmas: [], journal: [], dead_end_reason: 'explorer 派发被用户拒绝' }); await saveDirState(); await writeJournal(meta.qid) }
        } else if (meta.role === 'solver' && meta.qid && meta.direction) {
          const dirs = getDirState(meta.qid); const d = dirs.find(function (x) { return x.id === meta.direction })
          if (d) { d.status = 'dead-end'; d.dead_end_reason = '求解器派发被用户拒绝' }
          await saveDirState(); await writeJournal(meta.qid)
        }
      } catch (e) { console.error('vibe-math-v3: spawn reject mark failed: ' + String((e && e.message) || e)) }
      return { spawned: false, rejected: true }
    }
    if (node === 'verdict') { const overridden = resolution.action === 'override' && (resolution.verdict === 1 || resolution.verdict === 0); const v = overridden ? Number(resolution.verdict) : data.verdict; await settleVerdict(data.task, v); delete tasks[data.task.id]; return { verdict: v, overridden: overridden } }
    if (node === 'plan') {
      if (resolution.action === 'approve') { planQueue = (data.plan || []).slice(); await applyPlanToProblemCards(planQueue); logActivity('plan', 'plan ' + data.planId + ' approved: ' + planQueue.length + ' action(s) queued') }
      else { planQueue = []; logActivity('plan', 'plan ' + data.planId + ' rejected by user') }
      return { planApproved: resolution.action === 'approve', queued: planQueue.length }
    }
    if (node === 'method-promote') {
      const m = methods.get(data.methodId)
      if (m && resolution.action === 'approve') { await promoteMethodToGlobal(m); logActivity('method', 'method ' + m.id + ' promoted to global library (user approved)') }
      else logActivity('method', 'method ' + data.methodId + ' promotion ' + (resolution.action === 'approve' ? '' : 'rejected'))
      return { promoted: resolution.action === 'approve' }
    }
    return {}
  }
  async function resolveDecision(id, resolution) {
    const d = decisionQueue.find(function (x) { return x.id === id })
    if (!d) return { ok: false, code: 'VIBE_MATH_DECISION_NOT_FOUND', message: 'decision not found：' + String(id == null ? '' : id) + ' 不在人工决策队列里（队列现有 ' + decisionQueue.length + ' 个' + (decisionQueue.length ? ('：' + decisionQueue.map(function (x) { return x.id }).join(', ')) : '') + '）——可能已被 vibe_math_decide 结清，或被 start/resume/abort/换项目作废（作废是终态，不会回到 pending）。', next: { kind: 'reason', tool: 'vibe_math_list_decisions', hint: '先用 vibe_math_list_decisions 取当前 pending 的 id；若期望它还在，检查是否发生过 start/resume/abort/换项目。' } }
    if (d.status !== 'pending') return { ok: false, code: 'VIBE_MATH_DECISION_ALREADY_RESOLVED', message: 'decision already resolved：' + String(id) + ' 当前状态是 ' + String(d.status) + '——每次决策只生效一次。', next: { kind: 'reason', tool: 'vibe_math_list_decisions', hint: '用 vibe_math_list_decisions 看还有哪些 pending；要重新决策请等框架发起新的决策项。' } }; d.status = 'resolved'; d.resolution = resolution; if (scheduler.gate && scheduler.gate.decisionId === id) scheduler.gate = null; logActivity('decide', id + ' resolved: ' + resolution.action + (resolution.verdict !== undefined ? ' ' + resolution.verdict : '')); await saveAll(); scheduleTick(); return { ok: true, message: 'decision resolved' } }

  // ================= scheduler core =================
  function scheduleTick() { tick().catch(function (e) { console.error('vibe-math-v3 tick error: ' + String((e && e.stack) || e)) }) }
  /**
   * 自愈：gate 指向的决策若已不存在或已 resolved，就清掉再继续，而不是永久早退。
   *
   * gate 被持久化在 scheduler_state.json 里，且设置点不止一处（plan / verdict / method-promote），
   * 而 resolveDecision 只在 `gate.decisionId === id` 时清除。任何一次"决策已终态但 gate 还指着它"
   * 的组合（例如另一处 gate 覆盖了它、或副作用抛错后状态只落了一半）都会让 tick 永久早退：
   * running 仍为 true、status 一切正常，却永不推进。这里每次 tick 先校验一次 gate 的有效性。
   */
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
    dropStaleGate()
    if (scheduler.gate) return
    tickInFlight = true
    lastTickAt = now()
    try {
      await syncDependencies()
      await processStatusUpdates()
      await processPriorityAdjust()
      await autoDependencyStates()
      await processPromote()
      await reconcileVerify()
      await executePlanQueue()
      await maybePlan()
      // 方法整理排在终止判定之前：到期的方法整理是**真实工作**，先把它派出去，
      // 再让 checkTermination 看到"有在途的 method-keeper"从而不误判停机（H1 修复的配套）。
      await maybeMethodKeepFallback()
      await maybePushReport(false)
      await maybeWriteReport(false)
      // index 节流：每 5s 至多重写一次（工具调用/init/setProject 仍即时重建）
      if (params.indexAutoRebuild && (now() - lastIndexWrite) > 5000) await rebuildIndex()
      await checkTermination()
    } finally { tickInFlight = false }
  }
  // note: probability-1 rules (same semantics as v2, over md anchors)
  async function processStatusUpdates() {
    let changed = false
    for (const q of allProblems()) {
      if ((q.solutions || []).some(function (s) { return s.prob === 1 })) {
        const wasSolved = q.状态 === '已解决'
        // require 门禁（契约 §8）：自报概率 1 是另一条"宣告定论"的入口，同样必须过门。
        // 不改变对象的既有权重/概率字段，只把结果记为未定论 + 形式化待办。
        if (!wasSolved && formalBlocksConclusion(q.id)) await deferForFormal(q.id, formalRequiredWhy(q.id), true)
        else {
          q.状态 = '已解决'; q.优先级 = 'never'
          // 先置状态再写卡（writeVerifiedProblemCardIfNeeded 依赖 状态=已解决 才能生成卡）
          if (!wasSolved) { changed = true; await writeVerifiedProblemCardIfNeeded(q) }
        }
      }
    }
    for (const p of allPropos()) {
      let pChanged = false
      const proofOne = (p.proofs || []).some(function (x) { return x.prob === 1 })
      const refuteOne = (p.refutes || []).some(function (x) { return x.prob === 1 })
      const wouldConclude = (proofOne && p.概率 !== 1) || (refuteOne && p.概率 !== 0)
      if (wouldConclude && formalBlocksConclusion(p.id)) {
        // 门禁不通过：不写 概率/状态，不写 Verified/ 卡片，只记未定论 + 待办（幂等，不刷屏）。
        await deferForFormal(p.id, formalRequiredWhy(p.id), proofOne)
      } else {
        if (proofOne && p.概率 !== 1) { p.概率 = 1; p.状态 = '已验证·真'; pChanged = true }
        else if (refuteOne && p.概率 !== 0) { p.概率 = 0; p.状态 = '已验证·假'; pChanged = true }
        if ((p.概率 === 1 || p.概率 === 0) && p.优先级 !== 'never') { p.优先级 = 'never'; pChanged = true }
        if (p.概率 === 1 || p.概率 === 0) {
          if (await writeVerifiedPropositionCardIfNeeded(p)) pChanged = true
          // 关闭晋升/判断出的"僵尸"问题
          for (const q of allProblems()) {
            if (q.状态 === '已解决') continue
            if (q.判断命题 === p.id || (q.来源命题 === p.id) || ((q.来源 === 'promote' || q.来源 === 'judge') && q.来源与动机 && q.来源与动机.indexOf(p.id) !== -1)) { q.状态 = '已解决'; q.优先级 = 'never'; changed = true }
          }
        }
      }
      if (pChanged) { await saveProposition(p); changed = true }
    }
    if (changed) { for (const q of allProblems()) await saveProblem(q); logActivity('update', 'status updates applied (probability-1 closures / verified cards)') }
  }
  /** require 门禁的机器可读原因（写进 Formal/TODO.md 与 Formal/Index.md）。 */
  function formalRequiredWhy(target) {
    const rec = formalOf(target)
    return 'formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 ' + (rec.status || 'none') + '）'
  }
  async function writeVerifiedPropositionCardIfNeeded(p) {
    if (p.概率 !== 1 && p.概率 !== 0) return false
    // 门禁只在**唯一的收口点**（writeVerifiedCardIfChanged）判定：那里的语义是"新卡要过门、
    // 已存在的卡只做刷新（可能要把被 defect 撤回的形式化状态如实改掉）"。在这里提前 return false
    // 会把两种情形一起挡掉，于是 require 档下一张已存在的卡片会永久宣称「形式化: Lean 通过」。
    const proofs1 = (p.proofs || []).filter(function (x) { return x.prob === 1 })
    const refutes1 = (p.refutes || []).filter(function (x) { return x.prob === 1 })
    const parts = []
    for (let i = 0; i < proofs1.length; i++) parts.push('【证明 #' + (i + 1) + '】' + (proofs1[i].text || ''))
    for (let i = 0; i < refutes1.length; i++) parts.push('【证伪 #' + (i + 1) + '】' + (refutes1[i].text || ''))
    const card = { id: p.id, 标题: p.标题, 类型: '命题', 结论: p.概率 === 1, 概率: p.概率, 陈述: p.陈述, 内容: parts.join('\n\n'), 分类: categoryOf(p), 来源: p.来源问题 || '', 时间: now() }
    return await writeVerifiedCardIfChanged(card)
  }
  async function writeVerifiedProblemCardIfNeeded(q) {
    if (q.状态 !== '已解决') return false
    // 同 writeVerifiedPropositionCardIfNeeded：门禁统一在 writeVerifiedCardIfChanged 里判定。
    const sols1 = (q.solutions || []).filter(function (s) { return s.prob === 1 })
    const parts = []
    for (let i = 0; i < sols1.length; i++) parts.push('【解法 #' + (i + 1) + '】' + (sols1[i].text || ''))
    const card = { id: q.id, 标题: q.标题, 类型: '问题', 结论: true, 概率: 1, 陈述: q.陈述, 内容: parts.join('\n\n'), 分类: '问题', 来源: q.id, 时间: now() }
    return await writeVerifiedCardIfChanged(card)
  }
  // 幂等写卡：内容未变化则不重写（时间戳行不参与比较，避免每 tick 重写与日志刷屏）
  async function writeVerifiedCardIfChanged(card) {
    const rel = verifiedRel(card) // 必须与 saveVerified 用同一路径，否则读侧永远读不到已写出的卡
    const existing = await readText(rel)
    // 最后一道闸门：require 模式下没有 passed/blocked 记录就不允许**新写** Verified 卡片。
    // 卡片已经存在（切到 require 之前就已定论）只做刷新，不算"新的定论"，因此不记待办。
    //
    // 但"只做刷新"必须**真的刷新**：`defect` 会撤回形式化（降级 attempted、proof 清空、归档证明
    // 删除/覆盖），若在这里连刷新也一起 return false，那张已存在的卡片会永久宣称
    // 「形式化: Lean 通过（Verified/Lean/<id>.lean）」——指向一份已经不存在的证明。门禁管的是
    // "能不能宣告新结论"，不是"能不能说实话"。所以：不存在 → 记待办并拒绝新写；已存在 → 照常刷新。
    if (formalBlocksConclusion(card.id) && existing === undefined) {
      await deferForFormal(card.id, formalRequiredWhy(card.id), card.结论 === true)
      return false
    }
    const md = composeVerifiedMd(card)
    const strip = function (s) { return String(s).split('\n').filter(function (l) { return l.indexOf('- 时间:') !== 0 }).join('\n').trim() }
    if (existing !== undefined && strip(existing) === strip(md)) return false
    await saveVerified(card)
    return true
  }
  async function processPriorityAdjust() {
    const mode = params.priorityAdjust || 'none'
    if (mode !== 'none') {
      let changed = false
      for (const q of allProblems()) {
        if (q.状态 === '已解决' || q.优先级 === 'never') continue
        const dirs = getDirState(q.id)
        if (mode === 'deadend-deprioritize') {
          if (dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' })) { const cur = Number(q.优先级); if (Number.isFinite(cur) && cur < 10) { q.优先级 = 10; changed = true } }
        } else if (mode === 'survival-map') {
          if (dirs.length > 0) { const maxSurv = Math.max.apply(null, dirs.map(function (d) { return Number(d.survival) || 0 })); const target = Math.round(Math.max(0, Math.min(10, 10 - 10 * maxSurv))); if (q.优先级 !== target) { q.优先级 = target; changed = true } }
        }
      }
      if (changed) { for (const q of allProblems()) await saveProblem(q); logActivity('priority', 'problem priorities auto-adjusted (' + mode + ')') }
    }
    const pMode = params.proposPriorityAdjust || 'none'
    if (pMode === 'progress-graded') {
      const changedProps = []
      for (const p of allPropos()) {
        if (p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never') continue
        const closeness = Math.abs(Number(p.概率) - 0.5)
        const material = Math.min(5, (p.proofs || []).length + (p.refutes || []).length)
        const score = closeness * 1.2 + material * 0.08
        const target = Math.round(Math.max(0, Math.min(10, 10 - 10 * score)))
        const cur = Number(p.优先级)
        if (Number.isFinite(cur) && cur !== target) { p.优先级 = target; changedProps.push(p) }
      }
      if (changedProps.length > 0) { for (const p of changedProps) await saveProposition(p); logActivity('priority', 'proposition priorities auto-adjusted (progress-graded)') }
    }
  }
  // 自动依赖状态：依赖未就绪 → 等待依赖；依赖就绪 → 回到求解中
  async function autoDependencyStates() {
    let changed = false
    for (const q of allProblems()) {
      if (q.状态 === '已解决' || q.优先级 === 'never') continue
      const ready = problemDepReady(q)
      if (!ready && q.状态 !== '等待依赖') { q.状态 = '等待依赖'; changed = true }
      else if (ready && q.状态 === '等待依赖') { q.状态 = '求解中'; changed = true }
    }
    if (changed) { for (const q of allProblems()) await saveProblem(q) }
  }
  // note 3 + value: promote high-value unresolved propositions into Problems (judge problem)
  async function processPromote() {
    if (activeCount() >= params.maxParallelThreshold) return
    for (const p of allPropos()) {
      if (p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never') continue
      if (Number(p.价值关键性) < Number(params.promoteValueThreshold)) continue
      if (p.在问题清单) continue
      const qDescs = allProblems().map(function (q) { return q.陈述 })
      if (qDescs.indexOf('判断下述命题是否成立：' + p.陈述) !== -1) continue
      const qid = 'q-promoted-' + String(p.id).replace(/[^a-z0-9\-]/gi, '').slice(-12)
      const sols = []
      const proofs = p.proofs || []; const refutes = p.refutes || []
      for (let j = 0; j < proofs.length; j++) { const it = proofs[j]; sols.push({ title: '【证明】' + (it.title || ('证明' + (j + 1))), prob: clamp01(it.prob != null ? it.prob : 0.5), status: '未定论', text: '【证明】' + (it.text || '') }) }
      for (let j = 0; j < refutes.length; j++) { const it = refutes[j]; sols.push({ title: '【证伪】' + (it.title || ('证伪' + (j + 1))), prob: clamp01(it.prob != null ? it.prob : 0.5), status: '未定论', text: '【证伪】' + (it.text || '') }) }
      problems.set(qid, {
        id: qid, 标题: '判断命题：' + p.标题, 状态: '求解中', 优先级: 1,
        依赖: [], 被依赖: [], 来源: 'promote',
        计划: '证明或证伪源命题 ' + p.id + '（解法列表中的【证明】/【证伪】条目即原命题的证明/证伪材料，验证结果会回写源命题）。',
        陈述: '判断下述命题是否成立：' + p.陈述,
        来源与动机: '由命题 ' + p.id + '（价值/关键性=' + p.价值关键性 + '）自动晋升，目标：证明或证伪该命题；验证结果回写源命题。',
        solutions: sols, 判断命题: p.id, 来源命题: p.id,
      })
      p.在问题清单 = true
      await saveProblem(problems.get(qid))
      await saveProposition(p)
      logActivity('promote', 'proposition ' + p.id + ' promoted to problem ' + qid + '（' + sols.length + ' 条证明/证伪转为解法）')
      return // one per tick
    }
  }

  // ================= verify candidates (like v2) =================
  async function buildVerifyCandidates() {
    const out = []
    for (const q of allProblems()) {
      if (q.状态 === '已解决' || q.优先级 === 'never') continue
      const sols = q.solutions || []
      for (let j = 0; j < sols.length; j++) {
        const s = sols[j]
        if (s.prob === 1 || s.prob === 0 || s.status === '已验') continue
        if (!String(s.text || '').trim()) continue
        out.push({ rId: 'r-' + q.id + '-s' + j, kind: 'problem-solution', qid: q.id, 概述: q.陈述, process: s.text || '', idx: j, prob: Number(s.prob) || 0, priority: q.优先级 === 'never' ? 999 : Number(q.优先级) })
      }
    }
    for (const p of allPropos()) {
      if (p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never') continue
      if (p.在问题清单) continue
      const proofs = p.proofs || []; const refutes = p.refutes || []
      if (proofs.length === 0 && refutes.length === 0) {
        if (String(p.id).indexOf('p-tmp-') === 0) continue
        out.push({ rId: 'r-' + p.id, kind: 'proposition', pId: p.id, 概述: p.陈述, prob: Number(p.概率) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) })
      } else {
        for (let j = 0; j < proofs.length; j++) { if (proofs[j].prob === 1 || proofs[j].prob === 0 || proofs[j].status === '已验') continue; if (!String(proofs[j].text || '').trim()) continue; out.push({ rId: 'r-' + p.id + '-pf' + j, kind: 'prop-proof', pId: p.id, 概述: p.陈述, side: '证明', process: proofs[j].text || '', idx: j, prob: Number(proofs[j].prob) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }) }
        for (let j = 0; j < refutes.length; j++) { if (refutes[j].prob === 1 || refutes[j].prob === 0 || refutes[j].status === '已验') continue; if (!String(refutes[j].text || '').trim()) continue; out.push({ rId: 'r-' + p.id + '-rf' + j, kind: 'prop-proof', pId: p.id, 概述: p.陈述, side: '证伪', process: refutes[j].text || '', idx: j, prob: Number(refutes[j].prob) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }) }
      }
    }
    out.sort(function (a, b) { if (a.priority !== b.priority) return a.priority - b.priority; return (b.prob || 0) - (a.prob || 0) })
    return out
  }
  function verifyTaskBusy(rId) { if (tasks['verify:' + rId]) return true; return Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'verifier' && m.rId === rId }) }
  async function createVerifyTask(c) {
    // M9：验证 id 由对象 id 派生（`r-<对象id>[-sN]`），对象键已归一化 ⇒ rId 也归一化，
    // 否则原始 id 里的路径分隔符会被拼进 Logs/Verification/<rId>_<ts>.json 造出子目录。
    const rId = idSafe(c.rId)
    if (verifyTaskBusy(rId)) return false
    // require 门禁的**防空转**（契约 §2「对象留在原库，可形式化后再次提议」）：已经被记为
    // 「形式化待办」、而形式化又还没补齐的对象不再重复表决——重复表决只会一次又一次被同一道
    // 门拦下（同一 rId 每 tick 重建任务、每轮再派验证器），白白耗尽验证预算。一旦 passed /
    // blocked 落库，门禁条件满足，候选自然重新出现并继续验证（无需人工干预）。
    const gateTarget = String(c.pId || c.qid || '')
    if (formalBlocksConclusion(gateTarget) && formalTodo().some(function (t) { return t && t.id === gateTarget })) return false
    tasks['verify:' + rId] = { id: 'verify:' + rId, type: 'verify', r: c, rId: rId, status: 'spawning', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(2, params.verifierCount), createdAt: now() }
    logActivity('verify', 'verification task created for ' + rId)
    await saveAll()
    return true
  }
  async function backfillVerifiers(t) {
    while (t.children.length < voteCount(t).expected) {
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
      if (t.status === 'paused') {
        const allReported = voteCount(t, t.round).quorum
        if (allReported) { t.status = 'debating'; await advanceVerification(t, t.round); continue }
      }
      if (t.status !== 'spawning') continue
      if (activeCount() >= params.maxParallelThreshold) break
      await backfillVerifiers(t)
      await saveAll() // 持久化 children（resume 时任务簿记更准确）
    }
  }

  // ================= planner (需求 3) =================
  function hasSchedulableWork() {
    if (activeCount() >= params.maxParallelThreshold) return false
    for (const q of allProblems()) {
      if (q.状态 === '已解决' || q.优先级 === 'never') continue
      if (q.状态 === '等待依赖') continue
      const dirs = getDirState(q.id)
      const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && (m.role === 'explorer' || m.role === 'solver') })
      if (busy) continue
      const allExhausted = dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
      if (dirs.length === 0 || allExhausted) { if ((explorerRetries[q.id] || 0) < (Number(params.maxExplorerRetries) || 3)) return true }
      else if (dirs.some(function (d) { return d.status === 'active' && !Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === d.id && m.role === 'solver' }) })) return true
    }
    return false
  }
  async function buildBrief() {
    const qsList = []
    for (const q of allProblems()) {
      if (q.状态 === '已解决' || q.优先级 === 'never') continue
      const dirs = getDirState(q.id)
      qsList.push({
        id: q.id, 状态: q.状态, 优先级: q.优先级, 依赖: q.依赖, 依赖就绪: problemDepReady(q),
        方向数: dirs.length,
        活跃方向: dirs.filter(function (d) { return d.status === 'active' }).map(function (d) { return d.id }),
        running_solver_dirs: dirs.filter(function (d) { return d.status === 'active' && Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === d.id && m.role === 'solver' }) }).map(function (d) { return d.id }),
        最高存活率: dirs.length ? Math.max.apply(null, dirs.map(function (d) { return Number(d.survival) || 0 })) : null,
        解法数: (q.solutions || []).length,
      })
    }
    const cands = (await buildVerifyCandidates()).slice(0, 10).map(function (c) { return { rId: c.rId, kind: c.kind, target: c.pId || c.qid, prob: c.prob, priority: c.priority } })
    return {
      at: now(), horizon: params.planningHorizon,
      free_slots: Math.max(0, params.maxParallelThreshold - activeCount()),
      maxParallelThreshold: params.maxParallelThreshold,
      problems: qsList,
      verify_candidates: cands,
      active_agents: Object.keys(agentRegistry).map(function (cid) { const m = agentRegistry[cid]; return { childId: cid, role: m.role, target: m.qid || m.rId || '', direction: m.direction || '', round: m.round || '' } }),
      methods: Array.from(methods.values()).map(function (m) { return { id: m.id, 标题: m.标题, 状态: m.状态 } }).slice(0, 20),
      pending_inventions: methodLog.pendingInventions.length,
      last_plan: lastPlanSummary ? { at: lastPlanSummary.at, summary: lastPlanSummary.summary, outcomes: lastPlanSummary.outcomes } : null,
      recent_events: activityLog.slice(-8),
    }
  }
  async function maybePlan() {
    if (!params.plannerEnabled) { await fallbackScheduler(); return }
    if (activeCount() >= params.maxParallelThreshold) return
    // 规划代理在途时不再重复调用
    const plannerInFlight = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'planner' })
    if (plannerInFlight) return
    // 有"可调度工作"= 有待解问题方向可推进 或 有验证候选 或 有**到期**的方法整理 或 有待执行计划。
    // H1 修复：这里必须用真正的到期判定 methodKeepDue()，而不是"待沉淀发明非空"。
    // 旧条件在 pendingInventions ∈ [1, methodKeepEvery-1] 时恒真，于是**没有任何工作**的每一
    // 个 tick 都派生一个 planner：空计划不留痕（lastPlanSummary 不写）、冷却又被"无在途工作"
    // 绕过、终止判定又被刚派出的 planner 挡掉 ⇒ 按 tick 计费的 planner 热循环永不终止。
    // 待沉淀发明到期时由 maybeMethodKeepFallback() 处理，不需要（也不应该）叫 planner。
    const verifyWork = (await buildVerifyCandidates()).length > 0
    if (!hasSchedulableWork() && !verifyWork && !methodKeepDue() && planQueue.length === 0) return
    // 冷却对**每一次**规划调用生效（含空计划）：空计划同样是一次真实的模型调用，必须退避。
    // 旧代码用 hasInflight 跳过冷却，本意是"空闲且有工作时不空转"，但那恰好是 H1 的放大器。
    const cooldown = Number(params.planMinIntervalMs) || 0
    if (cooldown > 0 && (now() - lastPlanAt) < cooldown) return
    await callPlanner()
  }
  async function callPlanner() {
    const brief = await buildBrief()
    lastPlanAt = now()
    const planId = 'plan-' + shortId()
    const promptText = plannerPrompt(brief)
    try {
      await spawnChild('planner:' + planId, promptText, { role: 'planner', planId: planId, brief: brief })
      logActivity('plan', 'planner ' + planId + ' called with ' + brief.problems.length + ' problem(s), ' + brief.verify_candidates.length + ' verify candidate(s)')
      return { spawned: true }
    } catch (e) {
      console.error('vibe-math-v3: planner spawn failed: ' + String((e && e.message) || e))
      plannerFails = Math.min(999, plannerFails + 1)
      if (plannerFails >= (Number(params.plannerMaxFails) || 3)) { params.plannerEnabled = false; logActivity('plan', 'planner disabled after ' + plannerFails + ' consecutive failures — heuristic mode') }
      await fallbackScheduler()
      return { spawned: false, error: String((e && e.message) || e) }
    }
  }
  async function handlePlanner(childId, meta, output) {
    delete agentRegistry[childId]
    const parsed = parseJson(output)
    const actions = (parsed && Array.isArray(parsed.plan)) ? parsed.plan : []
    const summary = (parsed && parsed.summary) ? String(parsed.summary) : ''
    const planId = meta.planId || ('plan-' + shortId())
    if (!parsed) {
      // 输出不可解析 = 真正的规划器失败 → 计失败，3 次禁用（退回启发式）
      plannerFails += 1
      logActivity('plan', 'planner ' + planId + ' returned UNPARSEABLE output (' + String(output || '').slice(0, 200) + ')')
      if (plannerFails >= (Number(params.plannerMaxFails) || 3)) { params.plannerEnabled = false; logActivity('plan', 'planner disabled after ' + plannerFails + ' consecutive failures — heuristic mode') }
      await fallbackScheduler()
      return
    }
    if (actions.length === 0) {
      // 空计划：多为"规划到处理之间工作已被完成/解决"的状态竞争，不是规划器失败——不累计、不禁用
      logActivity('plan', 'planner ' + planId + ' returned empty plan (no actionable work)')
      await fallbackScheduler()
      return
    }
    plannerFails = 0
    const validated = await validatePlan(actions)
    lastPlanSummary = { at: now(), planId: planId, summary: summary, actions: validated.length, outcomes: [] }
    await writeJson('Logs/Plans/' + planId + '.json', { at: now(), planId: planId, summary: summary, raw: actions, validated: validated, project: currentProject })
    logActivity('plan', 'planner ' + planId + ' → ' + validated.length + '/' + actions.length + ' valid action(s): ' + validated.map(function (a) { return a.action + (a.role ? ':' + a.role : '') + (a.target ? ':' + a.target : '') }).join(', '))
    if (validated.length === 0) {
      // 计划被校验全部剔除（多为规划后状态已变/动作冗余，属状态竞争）——不累计 plannerFails、不禁用规划器
      logActivity('plan', 'planner ' + planId + ' plan all filtered by validation (state changed) — no op')
      await fallbackScheduler()
      return
    }
    // manual: 计划审批门在 planner 结果到达后挂起（审批的是真实计划）；auto: 直接入队
    if (params.mode === 'manual') {
      const d = enqueueDecision('plan', 'planner ' + planId + ' 计划 ' + validated.length + ' 个动作，是否放行？', { planId: planId, plan: validated, brief: meta.brief })
      setGate(d, 'plan')
      await saveAll()
      return
    }
    planQueue = validated
    await applyPlanToProblemCards(validated)
    await saveAll()
  }
  async function validatePlan(actions) {
    const out = []
    const seen = {}
    const allowed = { spawn: 1, interrupt: 1, promote: 1, wait: 1, continue: 1, stop: 1 }
    for (let i = 0; i < actions.length && out.length < (Number(params.planningHorizon) || 3); i++) {
      const a = actions[i]
      if (!a || typeof a !== 'object') continue
      const act = String(a.action || '')
      if (!allowed[act]) continue
      const key = act + ':' + (a.role || '') + ':' + (a.target || '') + ':' + (a.direction || '') + ':' + (a.childId || '')
      if (seen[key]) continue
      seen[key] = true
      if (act === 'spawn') {
        const role = String(a.role || '')
        if (role === 'explorer') {
          const q = problems.get(idSafe(String(a.target || ''))) // M9：问题键已归一化
          if (!q || q.状态 === '已解决' || q.优先级 === 'never') continue
          const dirs = getDirState(q.id)
          const allExhausted = dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
          if (!(dirs.length === 0 || allExhausted)) continue
          const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'explorer' && m.qid === q.id })
          if (busy) continue
          if ((explorerRetries[q.id] || 0) >= (Number(params.maxExplorerRetries) || 3)) continue
        } else if (role === 'solver') {
          const q = problems.get(idSafe(String(a.target || ''))) // M9：问题键已归一化
          if (!q || q.状态 === '已解决' || q.优先级 === 'never' || q.状态 === '等待依赖') continue
          const dir = (getDirState(q.id) || []).find(function (d) { return d.id === String(a.direction || '') })
          if (!dir || dir.status !== 'active') continue
          if ((dir.round || 0) >= (Number(params.solverMaxRounds) || 3)) continue // 已到轮次上限，不再调度（由后续 re-derive/stall 处理）
          const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.id && m.role === 'solver' })
          if (running) continue
        } else if (role === 'verifier') {
          const rId = idSafe(String(a.target || '')) // M9：与 createVerifyTask 同一把归一化
          if (!rId) continue
          if (verifyTaskBusy(rId)) continue
          const cands = await buildVerifyCandidates()
          if (!cands.some(function (c) { return idSafe(c.rId) === rId })) continue
          out.push({ action: 'spawn', role: role, target: rId, direction: a.direction || '', reason: String(a.reason || '') })
          continue
        } else if (role === 'method-keeper') {
          // 无目标；允许（由代码兜底去重：一次只允许一个 method-keeper）
          const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'method-keeper' })
          if (running) continue
        } else continue
        out.push({ action: 'spawn', role: role, target: String(a.target || ''), direction: a.direction || '', reason: String(a.reason || '') })
      } else if (act === 'interrupt') {
        const cid = String(a.childId || '')
        if (!agentRegistry[cid]) continue
        out.push({ action: 'interrupt', childId: cid, reason: String(a.reason || '') })
      } else if (act === 'promote') {
        const p = propos.get(idSafe(String(a.target || ''))) // M9：命题键已归一化
        if (!p || p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never' || p.在问题清单) continue
        if (Number(p.价值关键性) < Number(params.promoteValueThreshold)) continue
        out.push({ action: 'promote', target: p.id, reason: String(a.reason || '') })
      } else if (act === 'wait' || act === 'continue' || act === 'stop') {
        out.push(Object.assign({ action: act }, a.childId ? { childId: String(a.childId) } : {}, a.target ? { target: String(a.target) } : {}, { reason: String(a.reason || '') }))
      }
    }
    return out
  }
  // 计划审批/入队后：把 planner 的下一步安排回写到问题卡的「计划」锚点（软规范：- 计划: 一句话说明下一轮安排）
  async function applyPlanToProblemCards(actions) {
    for (let i = 0; i < (actions || []).length; i++) {
      const a = actions[i]
      const tid = a.target || ''
      if (!tid || !problems.has(tid)) continue
      const q = problems.get(tid)
      const desc = a.reason ? String(a.reason) : ('下一步：' + (a.role ? a.role : a.action) + (a.direction ? ' ' + a.direction : ''))
      if (q.计划 !== desc) { q.计划 = desc; await saveProblem(q) }
    }
  }
  async function executePlanQueue() {
    while (planQueue.length > 0 && activeCount() < params.maxParallelThreshold) {
      const a = planQueue.shift()
      try {
        await executePlanAction(a)
        if (lastPlanSummary) lastPlanSummary.outcomes.push({ action: a.action, role: a.role || '', target: a.target || '', ok: true })
      } catch (e) {
        console.error('vibe-math-v3: plan action failed: ' + String((e && e.message) || e))
        if (lastPlanSummary) lastPlanSummary.outcomes.push({ action: a.action, role: a.role || '', target: a.target || '', ok: false, error: String((e && e.message) || e) })
      }
    }
  }
  async function executePlanAction(a) {
    if (a.action === 'spawn') {
      if (a.role === 'explorer') {
        const q = problems.get(a.target)
        if (!q) return
        const dirs = getDirState(q.id)
        const promptText = dirs.length > 0 ? rederivePrompt(q, dirs) : explorerPrompt(q)
        explorerRetries[q.id] = (explorerRetries[q.id] || 0) + 1
        await spawnChild('explorer:' + q.id, promptText, { role: 'explorer', qid: q.id })
        logActivity('explorer', 'problem ' + q.id + ' explorer spawned (plan)')
      } else if (a.role === 'solver') {
        const q = problems.get(a.target)
        if (!q) return
        const dir = (getDirState(q.id) || []).find(function (d) { return d.id === a.direction })
        if (!dir) return
        const nextRound = (dir.round || 0) + 1   // 续轮上限由 syncMeta 的 solver 分支约束（见下）
        const progressText = buildSolverContext(getDirState(q.id), dir, nextRound, params.directionsPerSolver)
        await spawnChild('solver:' + q.id + ':' + dir.id, solverPrompt(q, dir, nextRound, progressText), { role: 'solver', qid: q.id, direction: dir.id, round: nextRound, description: q.陈述 })
        logActivity('solver', 'problem ' + q.id + ' direction ' + dir.id + ' solver spawned (plan, round ' + nextRound + ')')
      } else if (a.role === 'verifier') {
        const cands = await buildVerifyCandidates()
        const c = cands.find(function (x) { return x.rId === a.target })
        if (c) await createVerifyTask(c)
      } else if (a.role === 'method-keeper') {
        await spawnMethodKeeper('plan')
      }
    } else if (a.action === 'interrupt') {
      await interruptChild(a.childId)
      logActivity('interrupt', 'plan: interrupted ' + a.childId + ' (' + a.reason + ')')
    } else if (a.action === 'promote') {
      const p = propos.get(a.target)
      if (p) { p.在问题清单 = true; await saveProposition(p); await promoteProposition(a.target); logActivity('promote', 'plan: proposition ' + a.target + ' promoted') }
    } else if (a.action === 'wait') {
      logActivity('plan', 'wait advisory: ' + a.target + ' (' + a.reason + ')')
    } else if (a.action === 'continue') {
      logActivity('plan', 'continue advisory: ' + (a.childId || a.target) + ' (in-flight continuation is code-driven)')
    } else if (a.action === 'stop') {
      logActivity('plan', 'stop advisory: ' + (a.reason || ''))
    }
  }
  // 晋升（供计划/回退共用；processPromote 已有单步逻辑，这里拆出可复用函数）
  async function promoteProposition(pId) {
    const p = propos.get(pId)
    if (!p) return
    const qid = 'q-promoted-' + String(p.id).replace(/[^a-z0-9\-]/gi, '').slice(-12)
    if (problems.has(qid)) return
    const sols = []
    for (let j = 0; j < (p.proofs || []).length; j++) { const it = p.proofs[j]; sols.push({ title: '【证明】' + (it.title || ('证明' + (j + 1))), prob: clamp01(it.prob != null ? it.prob : 0.5), status: '未定论', text: '【证明】' + (it.text || '') }) }
    for (let j = 0; j < (p.refutes || []).length; j++) { const it = p.refutes[j]; sols.push({ title: '【证伪】' + (it.title || ('证伪' + (j + 1))), prob: clamp01(it.prob != null ? it.prob : 0.5), status: '未定论', text: '【证伪】' + (it.text || '') }) }
    problems.set(qid, {
      id: qid, 标题: '判断命题：' + p.标题, 状态: '求解中', 优先级: 1, 依赖: [], 被依赖: [], 来源: 'promote',
      计划: '证明或证伪源命题 ' + p.id + '（验证结果回写源命题）。', 陈述: '判断下述命题是否成立：' + p.陈述,
      来源与动机: '由命题 ' + p.id + '（价值/关键性=' + p.价值关键性 + '）晋升，验证结果回写源命题。',
      solutions: sols, 判断命题: p.id, 来源命题: p.id,
    })
    await saveProblem(problems.get(qid))
  }

  // ================= fallback heuristic (planner disabled/failed) =================
  async function fallbackScheduler() {
    // 1) promote one
    await processPromote()
    // 2) verify candidates
    if (activeCount() < params.maxParallelThreshold) {
      const cands = await buildVerifyCandidates()
      for (let i = 0; i < cands.length; i++) {
        if (activeCount() >= params.maxParallelThreshold) break
        const c = cands[i]
        if (verifyTaskBusy(c.rId)) continue
        // 只有**真的建了任务**才吃掉本轮的名额：require 门禁的防空转会跳过待办对象，
        // 若照旧 `return`，排在这些对象后面的候选会被永久饿死（每次都轮到同一个被跳过的对象）。
        const created = await createVerifyTask(c)
        if (created) return // one per tick keeps scheduling simple
      }
    }
    // 3) solve: explorer / solver spawns (manual → gate)
    if (activeCount() >= params.maxParallelThreshold) return
    const unsolved = allProblems().filter(function (q) { return !(q.状态 === '已解决' || q.优先级 === 'never' || q.状态 === '等待依赖') }).sort(function (a, b) { return (a.优先级 === 'never' ? 999 : Number(a.优先级)) - (b.优先级 === 'never' ? 999 : Number(b.优先级)) })
    for (let i = 0; i < unsolved.length; i++) {
      if (activeCount() >= params.maxParallelThreshold) break
      const q = unsolved[i]
      const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && (m.role === 'explorer' || m.role === 'solver') })
      if (busy) continue
      const dirs = getDirState(q.id)
      const allExhausted = dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
      if (dirs.length === 0 || allExhausted) {
        const explorerCap = Number(params.maxExplorerRetries) || 3
        if ((explorerRetries[q.id] || 0) >= explorerCap) {
          if (dirs.length === 0) dirs.push({ id: 'd_' + shortId(), title: 'explorer 失败', method: '', core_assumption: '', feasibility: 0, status: 'dead-end', round: 0, survival: 0, routes: [], lessons: [], blockers: [], lemmas: [], journal: [], dead_end_reason: 'explorer 连续 ' + explorerCap + ' 次未产出方向' })
          await saveDirState(); await writeJournal(q.id)
          logActivity('explorer', 'problem ' + q.id + ' explorer exhausted (' + explorerCap + ' failed attempts)')
          continue
        }
        explorerRetries[q.id] = (explorerRetries[q.id] || 0) + 1
        const promptText = dirs.length > 0 ? rederivePrompt(q, dirs) : explorerPrompt(q)
        const r = await maybeGate('spawn', 'explorer for problem ' + q.id, { label: 'explorer:' + q.id, promptText: promptText, meta: { role: 'explorer', qid: q.id } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } })
        if (r && r.gated) return
        continue
      }
      for (let j = 0; j < dirs.length; j++) {
        if (activeCount() >= params.maxParallelThreshold) break
        const dir = dirs[j]
        if (dir.status === 'success' || dir.status === 'dead-end') continue
        const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.id && m.role === 'solver' })
        if (running) continue
        if ((dir.round || 0) >= (Number(params.solverMaxRounds) || 3)) { dir.status = 'dead-end'; dir.dead_end_reason = dir.dead_end_reason || '迭代轮限到达（solverMaxRounds=' + params.solverMaxRounds + '）'; await saveDirState(); await writeJournal(q.id); logActivity('solver', 'problem ' + q.id + ' direction ' + dir.id + ' dead-end (round cap reached in heuristic)'); continue }
        const nextRound = (dir.round || 0) + 1
        const progressText = buildSolverContext(dirs, dir, nextRound, params.directionsPerSolver)
        const promptText = solverPrompt(q, dir, nextRound, progressText)
        const r = await maybeGate('spawn', 'solver for problem ' + q.id + ' direction ' + dir.id, { label: 'solver:' + q.id + ':' + dir.id, promptText: promptText, meta: { role: 'solver', qid: q.id, direction: dir.id, round: nextRound, description: q.陈述 } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } })
        if (r && r.gated) return
      }
    }
  }

  // ================= solver / explorer handling =================
  async function handleExplorer(childId, meta, output) {
    delete agentRegistry[childId]
    const parsed = parseJson(output)
    // 回执里的 formal 字段（契约 §6.3）：即使一次 Lean 工具都没调用，代理也必须能留下显式的
    // 形式化难度判断；meta.formal 与顶层 formal 两种写法都接受。
    if (parsed) await absorbFormalFromReply(parsed, childId)
    // 新协议（代理直接写 md + sync_meta）：__writes 落盘，meta.kind==='directions' 走元数据同步
    if (parsed && ((Array.isArray(parsed.__writes) && parsed.__writes.length) || (parsed.meta && parsed.meta.kind === 'directions'))) {
      await applyAgentWrites(parsed.__writes)
      if (parsed.meta && parsed.meta.kind === 'directions') await syncMeta(parsed.meta, { id: childId })
      await saveAll(); return
    }
    const dirs = (parsed && parsed.directions) || []
    await consumeMethodFeedback(parsed, { qid: meta.qid })
    if (dirs.length === 0) { logActivity('explorer', 'problem ' + meta.qid + ' returned no directions (output head: ' + String(output || '').slice(0, 200) + ')'); await saveAll(); return }
    explorerRetries[meta.qid] = 0
    const q = problems.get(meta.qid); if (!q) return
    const list = dirs.map(function (d) {
      return { id: d.id || ('d_' + shortId()), title: d.title || '', method: d.method || '', core_assumption: d.core_assumption || '', feasibility: clamp01(d.feasibility), status: 'active', round: 0, survival: clamp01(d.feasibility), routes: [], lessons: [], blockers: [], lemmas: [], journal: [], dead_end_reason: '' }
    })
    // 重派生替换方向前：把旧方向的 journal 归档到日志（论文式历史保留）
    const oldDirs = dirState.get(meta.qid)
    if (oldDirs && oldDirs.length > 0) await archiveDirections(meta.qid, oldDirs)
    dirState.set(meta.qid, list)
    await saveDirState(); await writeJournal(meta.qid)
    logActivity('explorer', 'problem ' + meta.qid + ' → ' + list.length + ' directions')
  }
  async function handleSolver(childId, meta, output, stopReason) {
    const qid = meta.qid; const dirId = meta.direction
    const parsed = parseJson(output)
    if (parsed) await absorbFormalFromReply(parsed, childId)
    // 新协议（代理直接写 md + sync_meta）：__writes 落盘，meta.kind==='solver' 走元数据同步
    if (parsed && ((Array.isArray(parsed.__writes) && parsed.__writes.length) || (parsed.meta && parsed.meta.kind === 'solver'))) {
      delete agentRegistry[childId]
      await applyAgentWrites(parsed.__writes)
      if (parsed.meta && parsed.meta.kind === 'solver') await syncMeta(parsed.meta, { id: childId })
      await saveAll(); return
    }
    const q = problems.get(qid); if (!q) { delete agentRegistry[childId]; return }
    const dirs = getDirState(qid)
    const dir = dirs.find(function (d) { return d.id === dirId })
    if (!dir) { delete agentRegistry[childId]; return }
    if (!parsed && !scheduler.running) { delete agentRegistry[childId]; return }
    const status = (parsed && parsed.status) || statusFromStop(stopReason)
    dir.round = meta.round
    if (parsed) {
      if (parsed.routes) dir.routes = (dir.routes || []).concat(parsed.routes)
      if (parsed.lessons) dir.lessons = (dir.lessons || []).concat(parsed.lessons)
      if (parsed.blockers) dir.blockers = (dir.blockers || []).concat(parsed.blockers)
      if (parsed.dead_end_reason) dir.dead_end_reason = parsed.dead_end_reason
      // M11：`survival_probability`（遗留扁平名）与 `survival`（提示词名）都接受。
      if (typeof parsed.survival_probability === 'number') dir.survival = clamp01(parsed.survival_probability)
      else if (typeof parsed.survival === 'number') dir.survival = clamp01(parsed.survival)
      if (parsed.lemmas && parsed.lemmas.length) { for (let i = 0; i < parsed.lemmas.length; i++) { const lid = await addLemmaAsProposition(qid, parsed.lemmas[i]); if (lid) { dir.lemmas = dir.lemmas || []; dir.lemmas.push({ id: lid, title: parsed.lemmas[i].title || '' }) } } }
      if (parsed.sub_questions && parsed.sub_questions.length) { for (let i = 0; i < parsed.sub_questions.length; i++) { const sq = parsed.sub_questions[i]; if (sq && sq.q_sub_statement && dir.sub_questions && dir.sub_questions.some(function (x) { return x.statement === sq.q_sub_statement })) continue; const rec = await addSubQuestion(qid, dirId, sq); if (rec) { dir.sub_questions = dir.sub_questions || []; dir.sub_questions.push(rec) } } }
      // journal narrative (论文式续写：把本轮叙述追加进研究日志)
      const prose = []
      if (parsed.routes && parsed.routes.length) prose.push('**本轮子路线**：' + parsed.routes.map(function (r) { return r.title + '（' + (r.progress || '') + '；可行性信号：' + (r.feasibility_signal || '—') + (r.blocker ? '；阻碍：' + r.blocker : '') + '）' }).join('；'))
      if (parsed.lessons && parsed.lessons.length) prose.push('**教训**：' + parsed.lessons.join('；'))
      if (parsed.lemmas && parsed.lemmas.length) prose.push('**新引理**：' + parsed.lemmas.map(function (l) { return l.title + '：' + (l.statement || '') + '（证明：' + (l.proof || '') + '）' }).join('；'))
      if (parsed.dead_end_reason) prose.push('**死路原因**：' + parsed.dead_end_reason)
      if (parsed.solution) prose.push('**完整解法**：' + parsed.solution)
      if (prose.length) { dir.journal = dir.journal || []; dir.journal.push({ round: meta.round, at: fmtTime(), agent: 'solver:' + qid + ':' + dirId, prose: prose.join('\n') }) }
      await consumeMethodFeedback(parsed, { qid: qid, dirId: dirId })
    }
    if (status === 'success') {
      // M11：遗留扁平通道的字段名（solution / solution_probability）与提示词教的名字
      // （solution_text / solution_prob）不一致 ⇒ 严格按提示词回写的 solver 会掉进 else 分支，
      // 在轮次上限处被判成"claimed success without solution"并把方向写死。两套名字都接受。
      const flatSolution = (parsed && parsed.solution != null) ? parsed.solution : (parsed ? parsed.solution_text : undefined)
      const flatSolutionProb = (parsed && parsed.solution_probability != null) ? parsed.solution_probability : (parsed ? parsed.solution_prob : undefined)
      if (parsed && flatSolution) {
        dir.status = 'success'
        delete agentRegistry[childId]
        logActivity('solver', qid + '/' + dirId + ' success at round ' + meta.round)
        await addSolution(qid, flatSolution, flatSolutionProb)
      } else {
        if (meta.round >= params.solverMaxRounds) {
          dir.status = 'dead-end'; dir.dead_end_reason = dir.dead_end_reason || 'claimed success without solution at iteration cap'
          delete agentRegistry[childId]
          logActivity('solver', qid + '/' + dirId + ' dead-end (success without solution)')
        } else {
          const progressText = buildSolverContext(dirs, dir, meta.round + 1, params.directionsPerSolver)
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
      const progressText = buildSolverContext(dirs, dir, meta.round + 1, params.directionsPerSolver)
      if (!scheduler.running) {
        delete agentRegistry[childId]
      } else {
        try {
          await followupChild(childId, solverPrompt(q, dir, meta.round + 1, progressText))
          agentRegistry[childId].round = meta.round + 1
          dir.round = meta.round + 1
        } catch (e) {
          console.error('vibe-math-v3: solver followup failed: ' + String((e && e.message) || e))
          dir.status = 'dead-end'; dir.dead_end_reason = dir.dead_end_reason || '求解器续轮失败（followup 异常）'
          delete agentRegistry[childId]
        }
      }
    }
    await saveDirState(); await writeJournal(qid)
  }
  function statusFromStop(stopReason) { return (stopReason === 'completed' || stopReason === 'max-tokens') ? 'continue' : 'dead-end' }
  /**
   * P1：`add_proposition`/`/vibe add-proposition` 只用于**新建**。id 已存在时**拒绝**，绝不覆盖——
   * 旧实现 `propos.set(id, p)` + `saveProposition(p)` 会把已有卡的 陈述/证明列表/证伪列表 整条换掉
   * （静默丢数据）。自动路径（sync_meta 的引理）本来就有 `propos.has` + 文件存在双守卫，这里拉齐语义。
   */
  function propositionIdConflict(id) {
    const hit = propos.get(id)
    if (!hit) return null
    return {
      code: 'PROPOSITION_ID_EXISTS',
      message: '命题 id "' + id + '" 已存在：add_proposition 只用于**新建**，不会覆盖已有卡（其 陈述/证明尝试/证伪尝试 一律保留）。',
      next: '换一个新 id 新建（例如 p-' + shortId() + '）；要修改已有卡请写进它自己的 Propos/<分类>/<id>.md（代理直接写卡是允许的）。',
      existing: { id: hit.id, 标题: hit.标题, 概率: hit.概率, 状态: hit.状态 },
    }
  }
  async function addLemmaAsProposition(qid, lemma) {
    if (!lemma || !lemma.title) return
    // M11：`prob`（提示词名）与 `布尔估计`（遗留扁平名）都接受；`分类` 与 `细类型` 同理。
    const rawProb = lemmaProb(lemma)
    let be = clamp01(rawProb != null ? rawProb : 0.6)
    if (be >= 1) be = 0.99; else if (be <= 0) be = 0.01
    const p = {
      id: 'p-' + shortIdUnique(function (x) { return propos.has(x) }), 标题: lemma.title, 状态: '未定论', 概率: be,
      优先级: (lemma.优先级 != null) ? lemma.优先级 : 1, 依赖: [], 价值关键性: clamp01(lemma['价值/关键性'] != null ? lemma['价值/关键性'] : 0.5),
      分类: categoryOf({ 分类: lemmaCategory(lemma) || '未分类' }),
      陈述: lemma.statement || lemma.title,
      proofs: [{ title: lemma.title + '（证明）', prob: clamp01(0.7), status: '未定论', text: lemma.proof || '' }],
      refutes: [], 来源问题: qid, 在问题清单: false,
    }
    propos.set(p.id, p)
    await saveProposition(p)
    logActivity('proposition', 'lemma「' + lemma.title + '」→ ' + p.id)
    return p.id
  }
  // 点5 严格化：solver 报告子问题 q_sub 时注册三个对象（q_sub / 判断问题 / p-tmp 假设）
  async function addSubQuestion(qid, dirId, sq) {
    if (!sq || !sq.q_sub_statement) return undefined
    const dirs = getDirState(qid)
    const d = dirs.find(function (x) { return x.id === dirId })
    if (d && d.sub_questions && d.sub_questions.some(function (x) { return x.statement === sq.q_sub_statement })) { logActivity('subquestion', 'duplicate q_sub skipped for ' + qid + '/' + dirId); return undefined }
    const subId = qid + '-sub-' + shortId()
    const assumeId = 'p-tmp-' + shortId()
    const judgeId = qid + '-judge-' + shortId()
    const assumeStatement = sq.assumption_statement || sq.assumption_title || ('对子问题「' + (sq.q_sub_title || sq.q_sub_statement) + '」的一种回答（临时假设）')
    const parentQ = problems.get(qid)
    const parentTitle = parentQ ? parentQ.标题 : qid
    problems.set(subId, {
      id: subId, 标题: (sq.q_sub_title || '子问题') + '（' + parentTitle + ' 分支）', 状态: '求解中', 优先级: 1, 依赖: [], 被依赖: [], 来源: '后生',
      计划: '独立求解后回填主线 ' + qid + ' 方向 ' + dirId + '；若 p_{q-tmp}（' + assumeId + '）被证伪，需重新审视依赖它的主线结论。',
      陈述: sq.q_sub_statement,
      来源与动机: '由问题 ' + qid + '（' + parentTitle + '）方向 ' + dirId + ' 在求解第 ' + ((d && d.round) || 1) + ' 轮分支产生；动机：想利用该子问题的结果来推进主线问题的求解；拟在解决后将结果回填到 ' + qid + ' 的 ' + dirId + ' 方向。',
      solutions: [], 判断命题: '', 来源命题: '',
    })
    problems.set(judgeId, {
      id: judgeId, 标题: '判断命题：' + (sq.assumption_title || assumeId), 状态: '求解中', 优先级: 1, 依赖: [], 被依赖: [], 来源: '后生',
      计划: '判定 p_{q-tmp}（' + assumeId + '）是否成立；结果回写该命题。',
      陈述: '判断下述命题是否成立：' + assumeStatement,
      来源与动机: '由临时假设 p_{q-tmp}（' + assumeId + '）生成，它是对子问题 ' + subId + ' 的一种回答的命题化；判定结果回写命题 ' + assumeId + '。',
      solutions: [], 判断命题: assumeId, 来源命题: '',
    })
    const p = {
      id: assumeId, 标题: sq.assumption_title || '临时假设 ' + assumeId, 状态: '未定论', 概率: 0.5, 优先级: 1, 依赖: [],
      价值关键性: 0.5, 分类: '未分类', 陈述: assumeStatement, proofs: [], refutes: [],
      来源问题: qid, 来源方向: dirId, 在问题清单: false,
    }
    propos.set(p.id, p)
    for (const id of [subId, judgeId]) await saveProblem(problems.get(id))
    await saveProposition(p)
    logActivity('subquestion', qid + ' → q_sub ' + subId + ' + 判断问题 ' + judgeId + ' + 临时假设 ' + assumeId)
    return { subId: subId, judgeId: judgeId, assumeId: assumeId, statement: sq.q_sub_statement }
  }
  async function addSolution(qid, solutionText, prob) {
    const q = problems.get(qid); if (!q) return
    const p = clamp01(prob != null ? prob : 0.8)
    const finalProb = p >= 1 ? 0.99 : (p <= 0 ? 0.01 : p)
    q.solutions = q.solutions || []
    q.solutions.push({ title: '解法 ' + (q.solutions.length + 1), prob: finalProb, status: '未定论', text: String(solutionText) })
    await saveProblem(q)
    logActivity('solution', 'problem ' + qid + ' got a candidate solution (probability ' + finalProb + ', awaiting verification)')
  }

  // ================= method library (需求 2) =================
  // ctx = { qid, dirId }：应用记录带上"用在哪"（问题/方向），方法卡的可追溯性更好
  async function consumeMethodFeedback(parsed, ctx) {
    if (!parsed) return
    ctx = ctx || {}
    if (Array.isArray(parsed.methods_used)) {
      for (const mu of parsed.methods_used) {
        if (!mu || !mu.id) continue
        // M9：方法键一律是 idSafe(id)，代理给的是原始 id ⇒ 查表前归一化。
        const muId = idSafe(mu.id)
        const m = methods.get(muId) || globalMethods.get(muId)
        if (!m) {
          // 未知 id：solver 引用了一个尚未入卡的方法/技巧 → 作为待沉淀发明记录，防引用丢失（Method Keeper 将据此建卡）
          methodLog.pendingInventions.push({ at: now(), 来源: ctx.qid ? ('问题 ' + ctx.qid + (ctx.dirId ? ' 方向 ' + ctx.dirId : '')) : '', 类型: '方法', 标题: String(muId), 内容描述: (mu.效果 || '') + (mu.建议 ? '；建议：' + mu.建议 : '') })
          logActivity('method', 'methods_used referenced unknown method ' + muId + ' → queued as pending invention')
          continue
        }
        if (methods.has(muId)) {
          // 只记录"有实际问题/方向上下文"的引用；method-keeper 纯整理时的引用（qid/dirId 皆空）不当作应用，
          // 避免把"整理时引用该方法"误记为"实际应用"，从而污染应用计数并触发错误的全局晋升。
          if (ctx.dirId || ctx.qid) {
            m.applications = m.applications || []
            m.applications.push({ at: fmtTime(), 问题: ctx.qid || '', 方向: ctx.dirId || '', text: (mu.效果 || '') + (mu.建议 ? '；建议：' + mu.建议 : '') })
            await saveMethod(m, false)
            logActivity('method', 'application record appended to ' + muId + ' (问题 ' + ctx.qid + ' 方向 ' + ctx.dirId + ')')
          }
        }
      }
    }
    if (Array.isArray(parsed.new_inventions)) {
      for (const inv of parsed.new_inventions) {
        if (!inv || !inv.标题) continue
        methodLog.pendingInventions.push(Object.assign({ at: now(), 来源: parsed.__source || (ctx.qid ? ('问题 ' + ctx.qid + (ctx.dirId ? ' 方向 ' + ctx.dirId : '')) : '') }, inv))
        logActivity('method', 'new invention queued: ' + inv.类型 + '「' + inv.标题 + '」')
      }
    }
  }
  function methodKeepDue() {
    if (Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'method-keeper' })) return false
    if (methodLog.pendingInventions.length === 0) return false
    const interval = Number(params.methodKeepIntervalMs) || 0
    if (interval > 0 && (now() - methodLog.lastKeepAt) >= interval) return true
    const every = Number(params.methodKeepEvery) || 0
    if (every > 0 && methodLog.pendingInventions.length >= every) return true
    return false
  }
  async function maybeMethodKeepFallback() {
    if (!methodKeepDue()) return
    if (activeCount() >= params.maxParallelThreshold) return
    await spawnMethodKeeper('fallback')
  }
  async function spawnMethodKeeper(why) {
    const digest = await buildMethodDigest()
    const promptText = methodKeeperPrompt(digest)
    await spawnChild('method-keeper', promptText, { role: 'method-keeper', why: why })
    logActivity('method', 'method keeper spawned (' + why + '), pending inventions: ' + methodLog.pendingInventions.length)
  }
  async function buildMethodDigest() {
    // 精简摘要：只给标题/类型/来源 + 一句摘要，避免 pending 全文压垮 Method Keeper
    const lines = []
    lines.push('- 待沉淀发明 ' + methodLog.pendingInventions.length + ' 条（仅列标题/类型/来源）：')
    for (const inv of methodLog.pendingInventions.slice(-16)) {
      const desc = String(inv.内容描述 || '').slice(0, 60)
      lines.push('  * [' + (inv.类型 || '') + '] ' + (inv.标题 || '') + (inv.来源 ? '（' + inv.来源 + '）' : '') + (desc ? '：' + desc + '…' : ''))
    }
    const recentProps = allPropos().slice(-6).map(function (p) { return p.id + '「' + p.标题 + '」概率=' + p.概率 })
    if (recentProps.length) lines.push('- 最近命题：' + recentProps.join('；'))
    const recentDirs = []
    for (const [qid, dirs] of dirState) {
      for (const d of dirs.slice(-1)) if (d.lessons && d.lessons.length) recentDirs.push(qid + '/' + d.id + '「' + d.title + '」教训摘要：' + d.lessons.join('；').slice(0, 80))
    }
    if (recentDirs.length) { lines.push('- 最近方向教训（摘要）：'); lines.push.apply(lines, recentDirs) }
    return lines.join('\n')
  }
  async function handleMethodKeeper(childId, meta, output) {
    delete agentRegistry[childId]
    const parsed = parseJson(output)
    // 新协议（Method Keeper 直接写方法卡 md + sync_meta）：__writes 落盘，meta.kind==='methods' 登记
    if (parsed && ((Array.isArray(parsed.__writes) && parsed.__writes.length) || (parsed.meta && parsed.meta.kind === 'methods'))) {
      await applyAgentWrites(parsed.__writes)
      if (parsed.meta && parsed.meta.kind === 'methods') await syncMeta(parsed.meta, { id: childId })
      // 消费已沉淀的发明：新建方法卡或对已有方法的改进都视为已处理本轮 pending（与旧 JSON 路径一致，防 improvements-only 反复触发）
      if (parsed.meta && ((Array.isArray(parsed.meta.created) && parsed.meta.created.length > 0) || (Array.isArray(parsed.meta.improvements) && parsed.meta.improvements.length > 0))) methodLog.pendingInventions = []
      await saveAll(); return
    }
    if (!parsed) { logActivity('method', 'method keeper returned nothing usable'); await saveAll(); return }
    let created = 0
    if (Array.isArray(parsed.new_methods)) {
      for (const nm of parsed.new_methods) {
        if (!nm || !nm.标题) continue
        const id = 'm-' + shortId()
        const m = {
          id: id, 标题: nm.标题, 类型: nm.类型 || '方法', 状态: '经验',
          可信断言: Array.isArray(nm.可信断言) ? nm.可信断言.filter(function (x) { return propos.get(x) && (propos.get(x).概率 === 1 || propos.get(x).概率 === 0) }) : [],
          上级体系: Array.isArray(nm.上级体系) ? nm.上级体系 : [], 子方法: Array.isArray(nm.子方法) ? nm.子方法 : [], 相关: [],
          适用场景: nm.适用场景 || '', 核心内容: nm.核心内容 || '', 定义与记号: nm.定义与记号 || '',
          applications: [], improvements: [{ v: 1, 原因: '初始沉淀', text: '由 Method Keeper 从近期工作提炼' }], 来源: nm.来源 || '',
        }
        methods.set(id, m)
        await saveMethod(m, false)
        created += 1
        logActivity('method', 'new method card ' + id + '「' + nm.标题 + '」(' + m.类型 + ') created')
      }
    }
    if (Array.isArray(parsed.improvements)) {
      for (const imp of parsed.improvements) {
        if (!imp || !imp.id) continue
        const m = methods.get(imp.id)
        if (!m) { logActivity('method', 'improvement referenced unknown method ' + imp.id); continue }
        m.improvements = m.improvements || []
        m.improvements.push({ v: m.improvements.length + 1, 原因: imp.原因 || '', text: imp.改进内容 || '' })
        await saveMethod(m, false)
        logActivity('method', 'method ' + imp.id + ' improved (v' + m.improvements.length + ')')
      }
    }
    // 消费已沉淀的发明：Method Keeper 有有效输出（新建或改进）即视为已处理本轮 pending。
    // 修复：仅返回 improvements 而无可新建方法时也必须清空，否则 pending 永不归零导致反复整理。
    const hasOutput = (Array.isArray(parsed.new_methods) && parsed.new_methods.length > 0) || (Array.isArray(parsed.improvements) && parsed.improvements.length > 0)
    // 兜底建卡：Method Keeper 未产出（输出不合规/空对象/模型未能蒸馏）时，把 pending 发明直接建成草稿方法卡，
    // 保证"发明不因一次梳理失败而永久滞留"；草稿卡状态=经验、来源=草稿沉淀，后续可被 Method Keeper 再整理。
    let fallback = 0
    if (!hasOutput && methodLog.pendingInventions.length > 0) {
      for (const inv of methodLog.pendingInventions.slice(-20)) {
        if (!inv || !inv.标题) continue
        const id = 'm-' + shortId()
        const m = {
          id: id, 标题: String(inv.标题), 类型: inv.类型 || '方法', 状态: '经验',
          可信断言: [], 上级体系: [], 子方法: [], 相关: [],
          适用场景: '', 核心内容: String(inv.内容描述 || ''), 定义与记号: '',
          applications: [], improvements: [{ v: 1, 原因: '草稿沉淀', text: 'Method Keeper 未产出，按发明清单兜底建卡（来源：' + (inv.来源 || '') + '）' }], 来源: '草稿沉淀(' + (inv.来源 || '') + ')',
        }
        if (!methods.has(id)) { methods.set(id, m); await saveMethod(m, false); fallback += 1 }
      }
      if (fallback > 0) logActivity('method', 'method keeper 未产出，兜底建 ' + fallback + ' 张草稿方法卡（防发明滞留）')
    }
    if (hasOutput || fallback > 0) methodLog.pendingInventions = []
    methodLog.keepCount += 1
    methodLog.lastKeepAt = now()
    await saveAll()
    logActivity('method', 'method keeper round done: ' + created + ' new, ' + (parsed.improvements || []).length + ' improved')
  }
  async function promoteMethodToGlobal(m) {
    const gm = Object.assign({}, m, { 来源: (m.来源 || '') + (m.来源 ? '；' : '') + 'promoted from project ' + currentProject })
    globalMethods.set(m.id, gm)
    await saveMethod(gm, true)
    m.状态 = m.状态 || '经验'
    await saveMethod(m, false)
  }
  async function maybePromoteMethods() {
    // 方法晋升：应用记录 ≥ 3 且尚未入全局库时触发。
    // methodAutoPromote=true → 自动晋升；否则 manual 模式下挂「方法晋升门」（method-promote 决策）。
    for (const m of methods.values()) {
      if ((m.applications || []).length < 3 || globalMethods.has(m.id)) continue
      if (params.methodAutoPromote) {
        await promoteMethodToGlobal(m)
        logActivity('method', 'method ' + m.id + ' auto-promoted to global library (3+ applications)')
      } else if (params.mode === 'manual') {
        const alreadyPending = decisionQueue.some(function (d) { return d.status === 'pending' && d.node === 'method-promote' && d.data.methodId === m.id })
        if (alreadyPending) continue
        const d = enqueueDecision('method-promote', '方法 ' + m.id + '「' + m.标题 + '」已有 ' + (m.applications || []).length + ' 次应用，是否晋升到全局方法库（VibeMath/Methods/）供跨项目复用？', { methodId: m.id })
        if (!scheduler.gate) scheduler.gate = { decisionId: d.id, node: 'method-promote' }
        logActivity('method', 'method-promote gate: ' + m.id + ' awaiting user decision')
        await saveAll()
      }
    }
  }

  // ================= Lean 形式化验证 =================
  // 契约：docs/formal-verification.md（v2/v3/v4/v5 共用；实现方案.md §10.1/§11.1）。
  //
  // 这套机制要换掉的是**审查对象**，不是给代理加一道苦役：多代理交叉验证的本质是**共识**——
  // m 个人一致认为"这是对的"既排除不了共同误解，也排除不了共同漏掉的情形；Lean 把"我认为"
  // 换成"机器已核对"，于是剩下的唯一不确定项收缩成一个人和代理都能有效审查的问题：
  //
  //     Lean 代码里的定义 / 对象 / 条件 / 假设 / 结论，是否与命题原文完全一致？
  //
  // 因此一旦 Lean 运行通过，验证提示词就不再要求重做推导，而是要求**忠实性审查**；
  // require 模式把这句话变成门禁：一个对象要被判定为真（严格证明）或假（严格反驳），必须
  // 先达到 `passed`（有 Lean 产物且最近一次运行 exit 0）或 `blocked`（代理给出显式、可审计的
  // 阻塞原因）。门禁只是兜底：它把裁定记为未定论 + 形式化待办，绝不把系统卡死。
  const FORMAL_MODES = ['off', 'encourage', 'require']
  function formalMode() { const m = String(params.formalVerify); return FORMAL_MODES.indexOf(m) !== -1 ? m : 'off' }
  function formalOn() { return formalMode() !== 'off' }
  function formalRecords() { return formalState.records }
  function formalTodo() { return formalState.todo }
  /**
   * 对象 id → 形式化记录的键。**空 id 必须是空串**：`idSafe('')` 会回退成 'id'，那样一个没写
   * target 的回执（或空参数）就能在对象表里凭空造出一条名为 `id` 的记录。
   */
  function formalId(raw) { const s = String(raw == null ? '' : raw).trim(); return s ? idSafe(s) : '' }
  function formalOf(target) {
    const id = formalId(target)
    if (!id) return { status: 'none' }
    const r = formalState.records[id]
    return r || { status: 'none' }
  }
  /**
   * 落一条形式化记录。达到 passed / blocked 时**同时清掉待办**：待办的含义就是"还不满足
   * require 门禁"，留着已形式化完成的对象会让 Formal/TODO.md 永久说谎。
   */
  async function putFormal(target, record) {
    const id = formalId(target)
    if (!id) return false
    let todoChanged = false
    if (record === null) delete formalState.records[id]
    else {
      formalState.records[id] = record
      if (record.status === 'passed' || record.status === 'blocked') {
        const i = formalState.todo.findIndex(function (x) { return x && x.id === id })
        if (i !== -1) { formalState.todo.splice(i, 1); todoChanged = true }
      }
    }
    await saveAll()
    return todoChanged
  }
  // `passed` 需要的是**绿过的运行**，不是"归档了一个文件"：从未执行过的证明文件什么也没证明。
  function formalGateOk(rec) { return !!rec && (rec.status === 'passed' || rec.status === 'blocked') }
  function formalBlocksConclusion(target) { return formalMode() === 'require' && !formalGateOk(formalOf(target)) }
  function formalStatusLine(target) {
    const r = formalOf(target)
    if (r.status === 'passed') return 'Lean 通过（' + (r.proof || r.file || '') + '）'
    if (r.status === 'blocked') return '阻塞（' + (r.note || '未说明') + '）'
    if (r.status === 'attempted') return '已尝试未通过'
    return '未尝试'
  }
  /** md 卡片锚点行内容（off 模式或状态 none 时为空 = 不写这一行）。 */
  function formalAnchorLine(target) {
    if (!formalOn()) return ''
    const r = formalOf(target)
    if (!r || r.status === 'none') return ''
    return formalStatusLine(target)
  }
  const formalTail = function (s, n) { const t = String(s == null ? '' : s); return t.length > n ? t.slice(-n) : t }

  // ---- 路径守卫 ----------------------------------------------------------
  /**
   * 纯**词法**归一化绝对路径（折叠 '.', '..' 与重复斜杠），完全不碰文件系统。
   * 只做 `startsWith(root)` 是不够的：`…/VibeMath/Projects/../../../../etc/evil.lean`
   * 作为字符串仍然以根开头，解析后却在根外。
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
   * 把 Lean 路径解析成"可证明位于 <VibeMath 根> 之内"的归一化绝对路径，否则 null。
   * 边界是 **VibeMath 根**而不是项目根：全局可复用库 <VibeMath 根>/Formal/{Lib,Proved}
   * 按契约 §3 就故意放在项目树之外。越界（爬到 VibeMath 根之上、或无关绝对路径）一律拒绝。
   */
  function leanAbsPathFrom(baseAbs, rel) {
    const raw = String(rel == null ? '' : rel).trim()
    if (!raw) return null
    const abs = (raw.charAt(0) === '/' || /^[a-z]:/i.test(raw)) ? raw : baseAbs + '/' + raw.replace(/^\.\//, '')
    const norm = normalizeAbsPath(abs)
    const root = normalizeAbsPath(vibeRoot())
    if (norm !== root && norm.indexOf(root + '/') !== 0) return null
    return norm
  }
  function leanAbsPath(rel) { return leanAbsPathFrom(frameworkRoot(), rel) }
  function leanAbsPathVibe(rel) { return leanAbsPathFrom(vibeRoot(), rel) }
  /** 契约 §5.1：`file` 可相对**项目根**或 **<VibeMath 根>**——两处都过同一守卫，先项目后全局。 */
  async function leanResolveRun(rel) {
    const cand = leanAbsPath(rel)
    if (cand !== null && await readTextAbs(cand) !== undefined) return cand
    const alt = leanAbsPathVibe(rel)
    if (alt !== null && await readTextAbs(alt) !== undefined) return alt
    if (cand !== null) return cand
    return alt
  }

  // ---- 执行（绝不抛进调度循环）------------------------------------------
  /**
   * 在一个 .lean 文件上跑工具链。**任何**失败模式（无 subprocess 服务、工具链不存在、
   * spawn 失败、超时、非零退出）都变成可读结果：调度循环永远不会因为 Lean 而崩。
   */
  /**
   * 路径/存在性守卫（同步档与异步档共用同一套错误码）。
   */
  async function leanRunFile(relPath, timeoutMs) {
    const rel = String(relPath == null ? '' : relPath).trim()
    if (!rel) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'file is required' }
    const abs = await leanResolveRun(rel)
    if (abs === null) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot().replace(/\\/g, '/') + '/ 之内（收到 ' + rel + '）' }
    if (!/\.lean$/i.test(abs)) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'only .lean files can be executed' }
    if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V3_NOT_FOUND', message: 'no such file: ' + rel }
    return await leanExecFile(rel, abs, timeoutMs)
  }
  /**
   * 已解析路径的**实际执行**（同步档与后台作业共用）：搜索路径注入（spec §3 + 修订 §2）
   * 在**用户 leanArgs 之后、文件名之前**；作业用入队时冻结的 plan（修订 §4）。
   */
  async function leanExecFile(rel, abs, timeoutMs, plan, onHandle) {
    const started = now()
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') {
      return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel, ms: 0 }
    }
    const p = plan || leanBuildPlan()
    const cmd = String(p.engine || 'lean')
    const cap = Math.max(1000, Number(timeoutMs) || Number(params.leanTimeoutMs) || 120000)
    if (typeof sub.resolveExecutable !== 'function') {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'the host subprocess service exposes no resolveExecutable(); cannot resolve "' + cmd + '" —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
    }
    let exe
    try { exe = await sub.resolveExecutable(cmd) } catch (e) {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + cmd + '": ' + String((e && e.message) || e) + ' —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
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
    let timedOut = false
    let timer = null
    let outcome
    try {
      outcome = await Promise.race([
        handle.done,
        new Promise(function (resolve) {
          timer = setTimeout(function () {
            timedOut = true
            try { if (typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* best effort */ }
            resolve({ exitCode: null, signal: 'SIGTERM' })
          }, cap)
        }),
      ])
    } catch (e) {
      if (timer) clearTimeout(timer)
      return { ok: false, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
    }
    if (timer) clearTimeout(timer)
    leanSyncHandle = null
    if (typeof onHandle === 'function') { try { onHandle(null) } catch (e) { /* best effort */ } }
    let out = '', err = ''
    try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
    try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
    const exitCode = outcome ? outcome.exitCode : null
    const ms = now() - started
    const ok = exitCode === 0
    const isTimeout = timedOut || ms >= cap
    return {
      ok: ok, exitCode: exitCode, signal: (outcome && outcome.signal) || null, ms: ms,
      command: argv.join(' '), file: rel, searchPath: searchPath,
      stdout: formalTail(out, 4000), stderr: formalTail(err, 4000),
      timedOut: isTimeout,
      code: ok ? undefined : (isTimeout ? 'LEAN_TIMEOUT' : 'LEAN_FAILED'),
    }
  }
  async function formalSetRun(target, run, asyncInfo) {
    const t = formalId(target)
    if (!t) return
    const prev = formalOf(t)
    const status = (prev.status === 'passed' || prev.status === 'blocked') ? prev.status : 'attempted'
    await putFormal(t, Object.assign({}, prev, {
      status: status,
      file: (run && run.file) || prev.file || '',
      run: { at: now(), ok: !!(run && run.ok), exitCode: (run && run.exitCode !== undefined) ? run.exitCode : null, ms: (run && run.ms) || 0, stdoutTail: formalTail(run && run.stdout, 800), stderrTail: formalTail(run && run.stderr, 800) },
      async: asyncInfo || prev.async || null,
      updatedAt: now(),
    }))
  }
  // ---- 提示词注入（都在**构造提示词的那一刻**现算，故运行中切模式立刻生效）--------
  function formalPromptBlock(target) {
    if (!formalOn()) return ''
    const mode = formalMode()
    const rec = target ? formalOf(target) : { status: 'none' }
    const L = []
    L.push('【Lean 形式化验证（' + (mode === 'require' ? '强制' : '鼓励') + '模式）】')
    if (rec.status === 'passed') {
      // 整套机制的要害：审查对象**变了**——不是"推导对不对"，而是"这段代码说的是不是这个命题"。
      // §4.1：忠实性缺陷**不是**"命题为假"，所以这一支必须同时给出 defect 出口（不得把偏差记成 0）。
      L.push('  · 该对象已有**通过的 Lean 形式化证明**（' + (rec.proof || rec.file || '') + '，最近一次运行 exit 0）。')
      L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')
      L.push('    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。')
      L.push('  ▸ 一致 → Result = 1。')
      L.push('  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：')
      L.push('      ① Result 给一个严格介于 0 与 1 之间的值（记为弃权），并在 Reason 里写清偏差；')
      L.push("      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的")
      // §4.1 第 3 条：只有 `require` 真的有门禁。`encourage` 档框架**仍然**撤回证明并记入待办，
      // 但**不得**承诺一个它无法强制的"不定论"——那里靠表决者自己的弃权票使表决无法得出一致结论。
      L.push('         「已通过」状态（降级为 attempted、删除或就地覆盖归档证明、写入形式化待办）'
        + (mode === 'require'
          ? '，本次裁定**不定论**；'
          : '。**本档没有门禁**：请务必给弃权值，以保证本轮无法得出一致结论；'))
      L.push('         修正形式化并重新跑通后再投票。')
      L.push('  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 Reason 里写清独立理由。')
    } else if (rec.status === 'blocked') {
      L.push('  · 该对象已被记录为**形式化阻塞**：' + (rec.note || '未说明') + '。')
      L.push('    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。')
    } else {
      L.push('  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。')
      L.push('  · 工具：vibe_math_lean_run（执行）· vibe_math_lean_archive（归档）· vibe_math_lean_lib（查已有可复用库/jobs）· vibe_math_lean_read（取回归档原文）')
      L.push('  · 工作目录：Formal/（相对项目根）；可复用定义放 ' + (vibeRoot() + '/Formal/Lib/').replace(/\\/g, '/')
        + '，已证引理放 ' + (vibeRoot() + '/Formal/Proved/').replace(/\\/g, '/') + '；写之前先 vibe_math_lean_lib 查重。')
      L.push('  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。')
      // 把"这么做的收益"说出来：本轮通过，下一轮的审查对象就整体换掉了（不是再加一道苦役）。
      L.push('  ▸ 若你在本轮把它形式化并跑通（vibe_math_lean_archive kind=\'proof\'），后续轮次的审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。')
      if (mode === 'require') {
        L.push('  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因（vibe_math_lean_archive kind=\'blocked\' note=… 或回执 formal.note）。若两者都没有，本次裁定不会生效，会被记为未定论（原因 formal-required）并进入「形式化待办」。')
      } else {
        L.push('  · 若你判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断（decision=\'blocked\' 时必须写明 note）。')
      }
      L.push('  · 归档可复用定义/引理前先跑通（vibe_math_lean_archive run=true 或先 vibe_math_lean_run）；跑不通不要入库。')
      // —— §5 B（逐字）：三条筛选判据 + 先查再写 + 异步"落地前不得当成已通过" ——
      L.push('  · 三条筛选判据：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。')
      L.push('  · 写新定义/证明前**先 vibe_math_lean_lib 查已有库**（vibe_math_lean_read 可取回归档原文逐字复用），查不到再写；复用已归档内容用 `import Formal.Lib.<name>` / `import Formal.Proved.<name>`。')
      L.push('  · **没把握就记 blocked** 并写清难点，别用形式化掩盖不确定。')
      L.push('  · 该对象若已有后台编译在队列中（leanAsync 默认开启），**不得**在作业落地为通过之前声称已通过或转忠实性审查；等 vibe_math_lean_lib 的 jobs 显示 settled 再审。')
      L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或宿主不提供 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这算显式阻塞原因，定论门禁可以据此放行。')
    }
    // 数学计算可用性行（prompts.md §2）：验证轮同样告知"先 probe 再 run / 回执即引用"。
    return L.join('\n') + leanNoticeSection() + mathWorkLine()
  }
  /** 日常提示词里的"顺手形式化"一行（off 模式返回空串 = 一个字都不多）。 */
  function formalWorkLine() {
    // v5 统一口径：**日常主动性（leanInitiative）与验证要求强度（formalVerify）是两根独立的轴**。
    // 不能用 `!formalOn()` 一票否决——那会让 `leanInitiative:'eager'` 在 `formalVerify:'off'` 下静默
    // 失效。`formalVerify:'off'` 只关掉**验证阶段**的 Lean 文本（formalPromptBlock 仍 `!formalOn() ⇒ ''`）；
    // `leanInitiative:'off'` 连日线都不注入（真无操作）。
    const initiative = LEAN_INITIATIVE_MODES.indexOf(params.leanInitiative) !== -1 ? params.leanInitiative : 'normal'
    // 后台作业的一次性公告（spec §2.4）：注入到本轮提示里，取走即清空。
    const notice = leanNoticeSection()
    if (initiative === 'off' || !(formalOn() || initiative === 'eager')) return ''
    return '【顺手形式化（' + (formalOn() ? (formalMode() === 'require' ? '强制' : '鼓励') : '仅主动性') + '）】把你工作中常用或可能复用的对象、假设、'
      + '新定义用 Lean 形式化定义并归档到全局可复用库（vibe_math_lean_archive kind=\'def\'），已成立的引理归到 '
      + (vibeRoot() + '/Formal/Proved/').replace(/\\/g, '/') + '（kind=\'lemma\'）；写之前先 vibe_math_lean_lib 查重，避免重复定义。'
      + (formalMode() === 'require'
        ? '本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。'
        : '这会让后续的验证与证明省掉大量重复工作。')
      // 硬要求 3（契约 §6 顶部）：可复用库只收**跑通过**的代码，否则它会被不编译的定义污染。
      + '归档前先跑通（vibe_math_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
      + (initiative === 'eager'
        ? '\n  · **主动档（leanInitiative=eager）**：日常就主动把有价值的小引理/命题/定义形式化——每轮工作结束时审视一次"这轮有什么值得进库"，值得就顺手归档。'
        : '\n  · 主动性 normal：顺手把明显有价值且可能复用的东西形式化；不必刻意扩大范围。')
      // —— §5 A（逐字）：三条筛选判据 + 先查再写 + 「没把握就记 blocked」 + 异步"落地前不得当成已通过" ——
      + '\n  · 三条筛选判据：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。'
      + '\n  · **先 vibe_math_lean_lib 查再决定是否重写**：vibe_math_lean_lib 列出现成定义/引理，vibe_math_lean_read 可取回归档原文逐字复用；'
      + '复用已归档内容用 `import Formal.Lib.<name>` / `import Formal.Proved.<name>`（模块根 = ' + vibeRoot().replace(/\\/g, '/') + '，框架已把它加进编译搜索路径）。'
      + '\n  · **没把握就记 blocked**（vibe_math_lean_archive kind=\'blocked\' note=…，或回执 formal 的 blocked）：把难点写清楚，别用形式化掩盖不确定。'
      + '\n  · 编译默认走后台队列（leanAsync=true）：入队后你可以继续工作；用 vibe_math_lean_job（可 waitMs 等结果）或下一轮提示里的'
      + '【形式化结果】行看结果。**在作业落地为通过之前，不得把该对象当成已通过。**'
      + notice
  }
  /**
   * 平时工作提示词里的「顺手形式化」日线段 + 回执 note。**两根轴独立**（v5 统一口径）：
   * 日线由 `leanInitiative` 决定（`eager` 在 `formalVerify:'off'` 下也要注入），
   * `formalReplyNote()` 只属于**验证阶段**（`formalOn()` 门控）。
   * 用一个 `formalOn()` 把两者一起关掉，正是 audit-B #2 的成因。
   */
  function formalDailySection() {
    const line = formalWorkLine()
    const note = formalOn() ? formalReplyNote() : ''
    if (!line && !note) return ''
    return (line ? '\n' + line : '') + note
  }
  /** 回执契约里的 formal 字段（契约 §6.3）：非 off 模式必须出现在回执契约里，否则这条通道不可发现。 */
  function formalJsonField(target) {
    if (!formalOn()) return ''
    const id = String(target == null ? '' : target) || '<对象id>'
    return ',"formal":{"target":"' + id + '","decision":"used|blocked|defect","file":"Formal/' + id + '.lean","note":"难度判断/阻塞原因/具体偏差"}'
  }
  /**
   * 工作轮（solver / explorer）回执契约里的 formal 字段。这些角色的回执本身就是一段 JSON 模板，
   * 直接改模板尾部容易把示例改成非法 JSON，所以在**契约说明**里给出同样的字段（契约 §6.3），
   * 框架侧 `absorbFormalFromReply` 同时接受顶层 `formal` 与 `meta.formal`。
   */
  function formalReplyNote() {
    if (!formalOn()) return ''
    return '\n形式化回执（本模式）：若你本轮对某个对象做了形式化难度判断，请在回执里加上 '
      + '"formal":{"target":"<对象id>","decision":"used|blocked|defect","file":"Formal/<对象id>.lean","note":"难度判断/阻塞原因/具体偏差"}'
      + '（decision=\'blocked\' 与 decision=\'defect\' 时必须写明 note，否则拒绝记录；'
      + 'decision=\'defect\' 表示你认定这条已通过的 Lean 形式化**不忠实于命题原文**——'
      + '那不是"命题为假"，框架会撤回其已通过状态并把对象放回形式化待办）。'
  }
  /** 从一条代理回执里取出 formal 判断并落库（顶层 formal 或 meta.formal 都接受）。 */
  async function absorbFormalFromReply(parsed, memberId) {
    if (!formalOn() || !parsed || typeof parsed !== 'object') return
    const f = (parsed.formal && typeof parsed.formal === 'object') ? parsed.formal
      : ((parsed.meta && typeof parsed.meta.formal === 'object') ? parsed.meta.formal : null)
    if (f) return await absorbFormalReply(f, memberId)
  }
  /** 对象 id → 关联可验证对象（命题/问题）。用于把表决对象映射到形式化记录。 */
  function verifyTargetId(r) { return String((r && (r.pId || r.qid)) || '') }
  /**
   * 这次裁决会不会**宣告某个对象定论**？返回被宣告对象的 id，否则空串。
   *
   * 门禁只管 boolean 裁定（真=严格证明 / 假=严格反驳）：近共识的小数（例如 0.95）本来就仍留
   * 原库为未定论，不受门禁约束（契约 §2）。`prop-proof` 判 0 时并不会立刻把命题定论，它往反
   * 方向推入一条 prob=1 的证伪；下一次 processStatusUpdates 会在那里被同一道门拦住。
   */
  function formalConclusionTarget(r, v) {
    if (!r) return ''
    if (r.kind === 'proposition') return (v === 1 || v === 0) ? String(r.pId || '') : ''
    if (r.kind === 'prop-proof') return v === 1 ? String(r.pId || '') : ''
    if (r.kind === 'problem-solution') return v === 1 ? String(r.qid || '') : ''
    return ''
  }

  // ---- 公告 / 索引 --------------------------------------------------------
  /**
   * v3 没有 v5 的群聊通道，对应的"群聊公告"落点是：①活动日志（vibe_math_status.recentActivity /
   * 报告里可见）②Logs/形式化.md 的追加式公告（人可复核、可 diff）。公告失败绝不影响调度。
   */
  async function formalAnnounce(text) {
    logActivity('formal', text)
    try {
      const rel = 'Logs/形式化.md'
      const prev = await readText(rel)
      const head = '# 形式化公告｜' + currentProject + '\n\n> 由框架维护的追加式公告（形式化定论、归档、require 门禁搁置）。\n\n'
      await writeText(rel, ((prev === undefined || !String(prev).trim()) ? head : prev) + '- ' + fmtTime() + ' ' + text + '\n')
    } catch (e) { /* 公告失败不应影响调度 */ }
  }
  /** require 模式：本轮裁定**不生效**——记未定论 + 形式化待办 + 公告，而不写 Verified/ 卡片。 */
  async function deferForFormal(target, why, isTrue) {
    const t = formalId(target)
    if (!t) return { deferred: false }
    const list = formalTodo()
    const already = list.some(function (x) { return x && x.id === t })
    if (!already) {
      // 幂等：processStatusUpdates 每个 tick 都会再试一次同一对象，只有**首次**才写盘 + 公告，
      // 否则每秒都会往 Formal/TODO.md 和人读公告里追加一遍（日志刷屏）。
      list.push({ id: t, at: now(), why: why, verdict: isTrue ? 1 : 0, project: currentProject })
      await writeFormalTodo()
      await writeFormalIndex()
      await formalAnnounce('【形式化】' + t + ' 的表决结果为 ' + (isTrue ? '真' : '假') + '，但 **require 模式**要求'
        + '先有 Lean 通过或显式阻塞记录，因此本轮**不定论**（已记入 Formal/TODO.md）。请完成形式化'
        + '（vibe_math_lean_archive kind=\'proof\'）或记录阻塞原因（kind=\'blocked\'）后重新提议验证。')
      await saveAll()
    }
    return { deferred: true, already: already, why: why }
  }
  /** status/report 里的形式化摘要：让所办/人能审计"到底拿到了严格证明，还是只有共识"。 */
  function formalSummary() {
    const recs = formalRecords()
    const keys = Object.keys(recs)
    return {
      mode: formalMode(),
      objects: keys.map(function (k) {
        const r = recs[k] || {}
        return { target: k, status: r.status || 'none', file: r.file || '', proof: r.proof || '', note: r.note || '', run: r.run ? { ok: r.run.ok, exitCode: r.run.exitCode, ms: r.run.ms } : null }
      }),
      passed: keys.filter(function (k) { return (recs[k] || {}).status === 'passed' }),
      blocked: keys.filter(function (k) { return (recs[k] || {}).status === 'blocked' }),
      todo: formalTodo().map(function (t) { return { id: t.id, why: t.why || 'formal-required', at: t.at } }),
      paths: { project: 'Formal/（相对项目根）', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/', proofs: 'Verified/Lean/' },
      note: formalOn() ? '' : '未启用（formalVerify = off；可用 vibe_math_set_params 切到 encourage / require）',
    }
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
  /** VibeMath 根相对 → 绝对（全局库不在项目树内）。 */
  function vibeAbs(rel) { return vibeRoot() + '/' + String(rel).replace(/^\.\//, '') }
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
    formalAnnounce('Lean 作业入队 ' + job.jobId + '（' + job.kind + (job.target ? '｜对象 ' + job.target : (job.name ? '｜' + job.name : '')) + '，state=queued）')
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
      runLeanJob(job).catch(function (e) { console.error('vibe-math-v3: lean job failed: ' + String((e && e.message) || e)) })
    }
  }
  async function runLeanJob(job) {
    if (job.state !== 'queued') return
    job.state = 'running'; job.startedAt = now(); job.interrupted = false
    await writeLeanJobFile(job)
    let run
    try { run = await leanExecFile(job.rel, leanJobAbs(job), job.timeoutMs, job.plan, function (h) { if (h) leanRunningHandles.set(job.jobId, h); else leanRunningHandles.delete(job.jobId) }) }
    catch (e) { run = { ok: false, exitCode: null, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), ms: 0 } }
    try { await settleLeanJob(job, run) } catch (e) { console.error('vibe-math-v3: lean job settle failed: ' + String((e && e.stack) || e)) }
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
    job.run = { at: now(), ok: settledOk, exitCode: job.exitCode, ms: run.ms || 0, timedOut: !!job.timedOut, interrupted: !!job.interrupted, stdoutTail: formalTail(run.stdout, 800), stderrTail: formalTail(run.stderr, 800), searchPath: run.searchPath || vibeRoot(), buildContext: job.buildCtx || '' }
    if (job.hashMismatch && !job.interrupted && !job.timedOut) job.note = 'file changed while compiling — result discarded (hash mismatch)'
    else if (job.contextMismatch && !job.interrupted && !job.timedOut) job.note = 'build context changed while compiling (engine/args/search paths) — result discarded; re-run under the new context'
    const asyncInfo = { jobId: job.jobId, state: job.state, attempts: job.attempts, enqueuedAt: job.enqueuedAt, startedAt: job.startedAt, settledAt: job.settledAt, exitCode: job.exitCode, buildSha256: job.buildSha || '' }
    if (job.kind === 'archive') await settleLeanArchiveJob(job, settledOk, asyncInfo)
    else if (job.target) await formalSetRun(job.target, Object.assign({}, run, { ok: settledOk, file: job.rel }), asyncInfo)
    if (!job.interrupted) await writeFormalIndex()
    await writeLeanJobFile(job)
    pushLeanNotice(leanSettleNotice(job, settledOk, capMs))
    formalAnnounce('Lean 作业 ' + job.jobId + ' ' + job.state + '（' + job.kind + '）' + (job.target ? '｜对象 ' + job.target : ''))
    reportDirty = true
  }
  /** 归档类作业的落地：**只有 ok 才落库/置 passed**（def/lemma 的文件在入队前已写好）。 */
  async function settleLeanArchiveJob(job, ok, asyncInfo) {
    const a = job.archive || {}
    if (a.kind !== 'proof') {
      // 与同步档同一份记账：全局库的运行结果进 formalState.libRuns（索引据此显示"跑通/未跑通"）。
      const libRel = String(job.rel || '').replace(/^Formal\//, '')
      if (libRel) formalState.libRuns[libRel] = { ok: !!ok, exitCode: job.exitCode === undefined ? null : job.exitCode, ms: (job.run && job.run.ms) || 0, at: now() }
      await rebuildLeanLibIndexes()
      formalAnnounce('归档作业 ' + job.jobId + '（' + a.kind + ' ' + job.rel + '）' + (ok ? '运行通过' : '运行未通过（见 stderr 尾部；该文件不应被当作可复用定义）'))
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
    await upsertFormalAnchor(target)
    await rebuildLeanLibIndexes()
    formalAnnounce('归档作业 ' + job.jobId + ' 为 ' + target + ' ' + (passed ? ('通过，已归档 ' + rec.proof + '，验证转为忠实性审查')
      : ('未通过：' + formalTail(job.run && job.run.stderrTail, 160) + '；已撤回上一份已通过状态与归档证明' + (withdrawn && withdrawn.outcome !== 'failed' ? '（' + withdrawn.outcome + '）' : '（⚠ 撤回失败，请不要把 ' + stalePrev + ' 当作该对象的证明）'))))
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
    if (recovered > 0) formalAnnounce('Lean 作业恢复：处理了 ' + recovered + ' 条遗留作业记录（queued 重入队 / running 标记中断 / settled 补写；绝不置 passed）')
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
    const keys = Object.keys(recs).sort()
    const L = ['# Lean 形式化索引｜' + currentProject + '｜' + fmtTime(), '',
      '> 本文件由框架维护（工具调用时增量更新；`vibe_math_lean_lib` 会重建）。权威状态在对象记录里。', '',
      '| 对象 | 状态 | 形式化文件 | 归档证明 | 最近运行 | 难度判断 / 阻塞原因 |', '|---|---|---|---|---|---|']
    if (!keys.length) L.push('| （暂无） | | | | | |')
    for (const k of keys) {
      const r = recs[k] || {}
      const run = r.run ? (r.run.ok ? 'ok（exit 0，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）' : 'fail（exit ' + r.run.exitCode + '，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）') : '—'
      L.push('| ' + k + ' | ' + (r.status || 'none') + ' | ' + (r.file || '—') + ' | ' + (r.proof || '—') + ' | ' + run + ' | ' + String(r.note || '—').replace(/\|/g, '/').slice(0, 120) + ' |')
    }
    L.push('')
    if (formalTodo().length) {
      // §4.1 第 3 条：只有 `require` 真的搁置定论；`encourage` 档的待办只是"这份形式化要重做"的记录。
      L.push(formalMode() === 'require'
        ? '## 形式化待办（require 模式：定论被搁置）'
        : '## 形式化待办（encourage 档：框架不搁置定论，靠表决者弃权）')
      for (const t of formalTodo()) L.push('- ' + t.id + ' —— ' + (t.why || 'formal-required') + '（' + fmtTime(t.at) + '）')
      L.push('')
    }
    await writeText('Formal/Index.md', L.join('\n'))
  }
  async function writeFormalTodo() {
    const list = formalTodo()
    const L = ['# 形式化待办｜' + currentProject + '｜' + fmtTime(), '',
      // 说清这一档**实际**会发生什么：只有 require 有门禁会把定论记为未定论。
      formalMode() === 'require'
        ? '> 这些对象在 `require` 模式下尚不具备「Lean 已通过」或「显式阻塞记录」，因此**定论被搁置**。'
        : '> 这些对象尚未取得「Lean 已通过」或「显式阻塞记录」。本档（encourage）**没有定论门禁**，框架不会搁置裁定——请在投票时给出严格介于 0 与 1 之间的弃权值，并尽快修正形式化。',
      '> 完成形式化（vibe_math_lean_archive kind=\'proof\'）或记录阻塞原因（kind=\'blocked\'）后，重新提议验证即可。', '']
    if (!list.length) L.push('（暂无）')
    for (const t of list) L.push('- ' + t.id + '｜' + (t.why || 'formal-required') + '｜' + fmtTime(t.at))
    L.push('')
    await writeText('Formal/TODO.md', L.join('\n'))
  }
  /**
   * 扫描并重建三处索引（项目 Formal/Index.md + 全局 Lib/Index.md + Proved/Index.md）。
   * 列举**便宜且无副作用**：不跑工具链（"我能复用哪些定义"不该触发编译）；每次运行的结果记在
   * formalState.libRuns 里（归档 kind='def'/'lemma' 时 run:true 记录的），作为"最近运行"列。
   */
  async function rebuildLeanLibIndexes() {
    const scan = async function (dirAbs, dirRel) {
      const rows = []
      const names = await listFilesAbs(dirAbs)
      for (const name of names) {
        if (!/\.lean$/i.test(String(name))) continue
        const rel = dirRel + '/' + name
        const txt = (await readTextAbs(dirAbs + '/' + name)) || ''
        const base = String(name).replace(/\.lean$/i, '')
        const first = (String(txt).split('\n').filter(function (l) { return l.trim() && !/^\s*(\/\/|--|import)/.test(l) })[0] || '').trim().slice(0, 110)
        const depend = (String(txt).split('\n').filter(function (l) { return /^\s*import\s+/.test(l) }).map(function (l) { return l.replace(/^\s*import\s+/, '').trim() }).join('、')) || '—'
        const run = formalState.libRuns[rel]
        rows.push({ base: base, rel: rel, first: first, depend: depend, run: run ? (run.ok ? 'ok' : 'fail') : '—' })
      }
      return rows
    }
    const libRows = await scan(vibeRoot() + '/Formal/Lib', 'Lib')
    await writeTextAbs(vibeRoot() + '/Formal/Lib/Index.md', ['# 可复用 Lean 定义库（跨项目）｜' + currentProject, '',
      '> 写新定义之前先查这里：能复用就不要重新定义。复用方式：`import Formal.Lib.<名称>`（模块根 = VibeMath 根）。', '',
      '| 名称 | 文件 | 类别 | 依赖（import） | 摘要 | 最近运行 |', '|---|---|---|---|---|---|']
      .concat(libRows.length ? libRows.map(function (r) { return '| ' + r.base + ' | ' + r.rel + ' | def | ' + String(r.depend || '—').replace(/\|/g, '/') + ' | ' + r.first.replace(/\|/g, '/') + ' | ' + r.run + ' |' }) : ['| （暂无） | | | | | |']).join('\n') + '\n')
    const provedRows = await scan(vibeRoot() + '/Formal/Proved', 'Proved')
    await writeTextAbs(vibeRoot() + '/Formal/Proved/Index.md', ['# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）｜' + currentProject, '',
      '> 这些文件是通过内核检查的引理，可直接 import 复用。', '',
      '| 名称 | 文件 | 陈述 | 依赖 | 最近运行 |', '|---|---|---|---|---|']
      .concat(provedRows.length ? provedRows.map(function (r) { return '| ' + r.base + ' | ' + r.rel + ' | ' + r.first.replace(/\|/g, '/') + ' | ' + r.depend.replace(/\|/g, '/') + ' | ' + r.run + ' |' }) : ['| （暂无） | | | | |']).join('\n') + '\n')
    await writeFormalIndex()
    await writeFormalTodo()
    return { lib: libRows.length, proved: provedRows.length, objects: Object.keys(formalRecords()).length }
  }
  /**
   * 形式化记录变化后，把对象 md 卡片上的 `- 形式化:` 锚点改成一致（任务要求）。
   *
   * 用**文本级插入/替换**而不是 saveProposition/saveProblem 整卡重写：v3 支持代理直接写 md，
   * 整卡重写会把代理在调度器最后一次解析之后写进卡里的内容抹掉（v3 自己已有"代理已直接写了
   * 该命题卡，保留其内容（不覆盖）"的纪律）。位置与 compose*Md 保持一致：紧随 `- 概率:`，
   * 无概率锚点时紧随 `- 状态:`。
   */
  function withFormalAnchor(text, line) {
    const s = String(text)
    const idx = s.search(/\n## /)
    const head = idx === -1 ? s.replace(/\s+$/, '') : s.slice(0, idx)
    const body = idx === -1 ? '' : s.slice(idx)
    const kept = head.split('\n').filter(function (l) { return !/^-\s*形式化\s*:/.test(l) })
    if (line) {
      let at = -1
      for (let i = 0; i < kept.length; i++) { if (/^-\s*概率\s*:/.test(kept[i])) { at = i; break } }
      if (at === -1) for (let i = 0; i < kept.length; i++) { if (/^-\s*状态\s*:/.test(kept[i])) { at = i; break } }
      if (at === -1) kept.push('- 形式化: ' + line)
      else kept.splice(at + 1, 0, '- 形式化: ' + line)
    }
    const out = kept.join('\n') + body
    if (out === s) return s
    return /\n$/.test(out) ? out : out + '\n'
  }
  async function upsertFormalAnchor(target) {
    if (!formalOn()) return false
    const id = formalId(target)
    if (!id) return false
    const p = propos.get(id)
    const q = problems.get(id)
    const rel = p ? propositionRel(p) : (q ? problemRel(q) : '')
    if (!rel) return false
    const txt = await readText(rel)
    if (txt === undefined) return false
    const next = withFormalAnchor(txt, formalAnchorLine(id))
    if (next === txt) return false
    await writeText(rel, next)
    return true
  }

  // ---- 三个工具的实现 -----------------------------------------------------
  /**
   * 在一个 .lean 文件上跑工具链、把结果记到对象上（可选）、刷新索引，并如实回报。
   * off 模式下也照常工作：人/代理主动调用时它不该失效，只是框架不主动宣传它存在。
   */
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
      return leanAsyncReturn(job, { file: guard.rel, state: job.state, hint: '已入队。**在它落地为通过之前，不得把该对象当成已通过**；结果会在下一轮提示的【形式化结果】行里公告，或用 vibe_math_lean_job（可 waitMs 等待）查看。' })
    }
    const run = await leanRunFile(rel, args.timeout_ms)
    if (run.file || run.ok) {
      if (target) { await formalSetRun(target, run); await upsertFormalAnchor(target) }
      await writeFormalIndex()
    }
    if (run.ok) await formalAnnounce('【形式化】' + (memberId || 'scheduler') + ' 运行 Lean 通过：' + run.file + '（' + ((run.ms || 0) / 1000).toFixed(1) + 's）' + (target ? '｜对象 ' + target : ''))
    const noHost = run.code === 'LEAN_NOT_FOUND' || run.code === 'NO_SUBPROCESS' || run.code === 'LEAN_SPAWN_FAILED'
    return Object.assign({ ok: !!run.ok }, run, {
      async: null,
      hint: run.ok
        ? '通过。若是某个对象的证明，请用 vibe_math_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库。'
        : (noHost
          ? '本宿主无法执行 Lean（' + run.code + '），没有编译器输出可以修：把形式化代码写下来并用 vibe_math_lean_archive 归档，并在回执的 note 里写明原因——这算显式阻塞原因，定论门禁可以据此放行。'
          : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_math_lean_archive kind=\'blocked\' 记录原因。'),
    })
  }
  /** 异步档的路径/存在性校验（与 leanRunFile 同一套守卫与错误码）。 */
  async function leanResolveRunTarget(relPath) {
    const rel = String(relPath || '').trim()
    if (!rel) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'file is required' }
    const abs = await leanResolveRun(rel)
    if (abs === null) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot().replace(/\\/g, '/') + '/ 之内（收到 ' + rel + '）' }
    if (!/\.lean$/i.test(abs)) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'only .lean files can be executed' }
    const txt = await readTextAbs(abs)
    if (txt === undefined) return { ok: false, code: 'V3_NOT_FOUND', message: 'no such file: ' + rel }
    return { ok: true, rel: rel, abs: abs, sha: leanContentSha(txt), text: txt }
  }
  /** `lean_read`：只读地取回归档的 Lean 原文（verbatim 复用；§1.2）。 */
  async function leanReadTool(o) {
    const args = o || {}
    const rawName = String(args.name || '').trim()
    if (!rawName) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'name is required' }
    if (rawName.indexOf('..') !== -1 || /[\\/]/.test(rawName) || /^[a-z]:/i.test(rawName)) {
      return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'name must be a bare library name (no path separators, no "..", no absolute path)' }
    }
    const name = idSafe(rawName)
    const kind = (args.kind === 'lib' || args.kind === 'proved') ? args.kind : 'auto'
    const order = kind === 'auto' ? ['lib', 'proved'] : [kind]
    for (let i = 0; i < order.length; i++) {
      const k = order[i]
      const rel = 'Formal/' + (k === 'lib' ? 'Lib' : 'Proved') + '/' + name + '.lean'
      const dir = normalizeAbsPath(vibeRoot() + '/Formal/' + (k === 'lib' ? 'Lib' : 'Proved'))
      const abs = normalizeAbsPath(vibeRoot() + '/' + rel)
      if (abs.indexOf(dir + '/') !== 0) continue
      const txt = await readTextAbs(abs)
      if (txt === undefined) continue
      const LIMIT = 64 * 1024
      const bytes = Buffer.byteLength(txt, 'utf8')
      const truncated = bytes > LIMIT
      return { ok: true, name: name, file: rel, kind: k, sha256: leanContentSha(txt), bytes: bytes, text: truncated ? Buffer.from(txt, 'utf8').slice(0, LIMIT).toString('utf8') : txt, truncated: truncated }
    }
    return { ok: false, code: 'V3_NOT_FOUND', message: 'no archived Lean file named ' + name + '（查过 Formal/Lib 与 Formal/Proved）；可先用 vibe_math_lean_lib 看清单' }
  }
  /**
   * `lean_job`（修订 §3，只读）：不带 jobId ⇒ 本会话作业清单；带 ⇒ 该作业 state/exitCode/回执路径/归档路径。
   * waitMs>0 最多等这么久（内部轮询；心跳是独立 timer，不会被阻塞），超时返回当前 state。
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
      if (!rec || !rec.jobId) return { ok: false, code: 'V3_NOT_FOUND', message: 'no such Lean job: ' + wantId + '（用不带 jobId 的 vibe_math_lean_job 列清单）' }
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
  async function leanArchive(memberId, o) {
    const args = o || {}
    const kind = String(args.kind || '')
    const content = typeof args.content === 'string' ? args.content : undefined
    const from = args.from ? String(args.from) : ''
    const who = memberId || 'scheduler'
    // 读来源文件：只在 <VibeMath 根> 之内，且必须存在。
    const readFrom = async function () {
      const srcAbs = await leanResolveRun(from)
      if (srcAbs === null) return { err: 'from must be a .lean file inside the VibeMath root (got ' + from + ')' }
      const body = await readTextAbs(srcAbs)
      if (body === undefined) return { err: 'no such file: ' + from }
      return { body: body }
    }
    if (kind === 'def' || kind === 'lemma') {
      const rawName = String(args.name || '').trim()
      if (!rawName) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'name is required for a reusable definition/lemma' }
      const name = idSafe(rawName)
      let body = content
      if (body === undefined && from) { const r = await readFrom(); if (r.err) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: r.err }; body = r.body }
      if (body === undefined) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
      const dirRel = kind === 'def' ? 'Lib' : 'Proved'
      const rel = 'Formal/' + dirRel + '/' + name + '.lean'
      const abs = vibeRoot() + '/' + rel
      const sha = leanContentSha(body)
      const plan = leanBuildPlan()
      const ctx = leanPlanContext(plan)
      const fp = leanJobFingerprint(body, ctx)
      const jobId = leanJobId(name, fp)
      // 去重（§4.3）：同内容 + 同构建上下文且已成功归档过 ⇒ 跳过重写与重编译。
      const dedupe = await leanDedupeLookup(jobId, abs, sha, null)
      if (dedupe) {
        await formalAnnounce('【形式化】' + who + ' 归档 ' + kind + ' `' + name + '` 命中去重（同内容与构建上下文，跳过重写与重编译）')
        return { ok: true, kind: kind, name: name, file: rel, deduped: true, sha256: sha, buildSha256: fp, note: '内容与构建上下文都与已归档并编译通过的版本一致：跳过重写与重编译（去重）。' }
      }
      if (params.leanAsync !== false && args.run !== false) {
        if (!await writeTextAbs(abs, body)) return { ok: false, code: 'V3_WRITE_FAILED', message: 'could not write ' + rel }
        const job = await enqueueLeanJob({ jobId: jobId, kind: 'archive', key: name, rel: rel, scope: 'root', name: name, target: '', sha: sha, buildSha: fp, buildCtx: ctx, plan: plan, memberId: memberId, archive: { kind: kind } })
        return leanAsyncReturn(job, { kind: kind, name: name, file: rel, sha256: sha, buildSha256: fp, deduped: false, note: '文件已写入 ' + rel + '；编译已入队（并发上限 leanJobsMaxParallel）。**落地为通过之前，请不要把它当作可复用定义**；结果会在下一轮提示的【形式化结果】行公告，也可用 vibe_math_lean_job 查/等。' })
      }
      if (!await writeTextAbs(abs, body)) return { ok: false, code: 'V3_WRITE_FAILED', message: 'could not write ' + rel }
      // 全局库在项目树之外，必须用**绝对路径**执行（相对形式会在项目根里找）。
      const run = args.run === false ? null : await leanRunFile(abs)
      if (run && run.file) formalState.libRuns[dirRel + '/' + name + '.lean'] = { ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, at: now() }
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 归档了' + (kind === 'def' ? '可复用定义' : '已证引理') + ' `' + name + '` → ' + rel + (run ? '（运行 ' + (run.ok ? '通过' : '未通过') + '）' : '（未运行）'))
      return { ok: true, kind: kind, name: name, file: rel, run: run || undefined, note: '已并入全局可复用库，后续项目可直接 import 复用' }
    }
    if (kind === 'proof') {
      const rawTarget = String(args.target || '').trim()
      if (!rawTarget) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'target is required for kind=proof' }
      const target = idSafe(rawTarget)
      let body = content
      if (body === undefined && from) { const r = await readFrom(); if (r.err) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: r.err }; body = r.body }
      if (body === undefined) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
      const workRel = 'Formal/' + target + '.lean'
      const sha = leanContentSha(body)
      const plan = leanBuildPlan()
      const ctx = leanPlanContext(plan)
      const fp = leanJobFingerprint(body, ctx)
      const jobId = leanJobId(target, fp)
      // 去重（§4.3）：对象已 passed 且归档证明与新提交内容一致 ⇒ 跳过。
      const dedupe = await leanDedupeLookup(jobId, null, sha, target)
      if (dedupe) {
        await formalAnnounce('【形式化】' + who + ' 归档证明 ' + target + ' 命中去重（已 passed 且内容一致）')
        return { ok: true, kind: kind, target: target, file: workRel, proof: dedupe.file, passed: true, deduped: true, sha256: sha, buildSha256: fp, status: 'passed', note: '该对象已是 passed，且归档证明与新提交内容一致：跳过重写与重编译（去重）。' }
      }
      if (params.leanAsync !== false) {
        if (!await writeTextAbs(frameworkRoot() + '/' + workRel, body)) return { ok: false, code: 'V3_WRITE_FAILED', message: 'could not write ' + workRel }
        const prevA = formalOf(target)
        await putFormal(target, Object.assign({}, prevA, {
          status: prevA.status === 'passed' ? 'passed' : 'attempted',
          file: workRel,
          decision: 'used',
          note: String(args.note || prevA.note || ''),
          async: { jobId: jobId, state: 'queued', attempts: 0, enqueuedAt: now(), startedAt: 0, settledAt: 0, exitCode: null, buildSha256: fp },
          updatedAt: now(),
        }))
        await upsertFormalAnchor(target)
        await writeFormalIndex()
        const job = await enqueueLeanJob({ jobId: jobId, kind: 'archive', key: target, rel: workRel, scope: 'project', target: target, sha: sha, buildSha: fp, buildCtx: ctx, plan: plan, memberId: memberId, archive: { kind: 'proof', target: target } })
        return leanAsyncReturn(job, {
          kind: kind, target: target, file: workRel, status: 'attempted', sha256: sha, buildSha256: fp,
          note: '工作文件已写入 ' + workRel + '；编译已入队。**只有该作业在同一个构建上下文下落地为通过，才会写入 Verified/Lean/' + target + '.lean 并把状态变为 passed**——在它落地之前，这个对象不是"已通过形式化"。',
        })
      }
      // 用绝对路径写：`writeText` 写失败时只会抛（由工具包装层变成通用 error），
      // 这一行的 V3_WRITE_FAILED 分支就永远不可能触发；writeTextAbs 会如实返回 false。
      if (!await writeTextAbs(frameworkRoot() + '/' + workRel, body)) return { ok: false, code: 'V3_WRITE_FAILED', message: 'could not write ' + workRel }
      const run = await leanRunFile(workRel)
      const prev = formalOf(target)
      const passed = !!run.ok
      // A RED re-archive invalidates the previous proof: the work file it proved was just
      // overwritten by code that does not compile. Keeping the pointer (or the archived file)
      // would produce "attempted + 归档证明 X.lean" in the index and let the fidelity prompt print
      // a proof path for code that no longer exists — `proof` is for `passed` only (contract §4).
      const stalePrev = passed ? '' : String(prev.proof || ('Verified/Lean/' + target + '.lean'))
      const rec = Object.assign({}, prev, {
        status: passed ? 'passed' : 'attempted',
        file: workRel,
        proof: passed ? 'Verified/Lean/' + target + '.lean' : '',
        decision: 'used',
        note: String(args.note || prev.note || ''),
        run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: formalTail(run.stdout, 800), stderrTail: formalTail(run.stderr, 800) },
        updatedAt: now(),
      })
      if (passed) await writeText('Verified/Lean/' + target + '.lean', body)
      else if (stalePrev) { try { await withdrawArchivedProof(stalePrev) } catch (e) { /* 撤回失败已在公告里如实说明 */ } }
      await putFormal(target, rec)
      await upsertFormalAnchor(target)
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 为 ' + target + ' 归档形式化证明 ' + workRel + '（运行 '
        + (passed ? '**通过**，已归档到 ' + rec.proof + '，验证转为忠实性审查' : '**未通过**：' + formalTail(run.stderr || run.message, 160)) + '）')
      return { ok: true, kind: kind, target: target, file: workRel, proof: rec.proof, passed: passed, run: run, status: rec.status }
    }
    if (kind === 'blocked') {
      const rawTarget = String(args.target || '').trim()
      if (!rawTarget) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'target is required for kind=blocked' }
      const target = idSafe(rawTarget)
      const note = String(args.note || '').trim()
      // "因难度决定不做形式化"必须**显式、可审计**：note 空就拒绝，不允许静默跳过。
      if (!note) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）——"因难度决定不做形式化"必须显式、可审计' }
      const prev = formalOf(target)
      await putFormal(target, Object.assign({}, prev, { status: 'blocked', decision: 'blocked', note: note, updatedAt: now() }))
      await upsertFormalAnchor(target)
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 记录 ' + target + ' 形式化阻塞：' + note)
      return { ok: true, kind: kind, target: target, status: 'blocked', note: note }
    }
    return { ok: false, code: 'V3_INVALID_ARGUMENT', message: "kind must be 'def' | 'lemma' | 'proof' | 'blocked'" }
  }
  /**
   * 撤回归档证明：**删除**既不是唯一手段，也不是想当然就能成功的手段。
   *
   * fs 服务没有 unlink，`subprocess` 服务是**可选**的（`runShell` 在没有它时只返回 no-subprocess），
   * 删除命令本身也可能静默失败（桩宿主、权限、宿主不提供 shell）。而归档证明就躺在
   * `Verified/Lean/<id>.lean`——所有人都去那个路径找"这条结论的证明"——所以"删掉了"必须被
   * **回读验证**：删不掉就用撤回声明**就地覆盖**，使它不可能再被读成一份通过的证明。
   * 返回：'deleted'（确认已不在）| 'overwritten'（已覆盖为撤回声明）| 'failed'（两者都没成功）。
   */
  async function withdrawArchivedProof(rel) {
    const abs = leanAbsPath(rel)
    if (abs === null) return 'failed'
    const sub = subprocessOf()
    if (sub !== undefined && typeof sub.spawn === 'function') {
      try { await removeFile(rel) } catch (e) { /* 落到覆盖兜底 */ }
      // 退出码 0 不等于文件真的没了（桩宿主 / 权限怪癖 / 删除被静默忽略）：必须回读确认。
      if (await readTextAbs(abs) === undefined) return 'deleted'
    }
    const notice = '-- 已撤回（' + fmtTime() + '）：该形式化被认定与命题原文不一致。\n'
      + '-- 原代码保留在工作文件 Formal/' + String(rel).split('/').pop() + '；修正并重新跑通后重新归档。\n'
    return (await writeTextAbs(abs, notice)) !== false ? 'overwritten' : 'failed'
  }
  /**
   * §4.1 的落地点：表决者认定这条**已通过的** Lean 形式化不忠实于命题原文。
   *
   * 偏差不是"命题为假"，而恰好是"这次形式化不合格"，因此这里的动作与 blocked 不同：
   *   ① 无论此前是 `passed` 还是 `blocked`，一律**降级**为 `attempted`（都让位于"需重做"）；
   *   ② 清空 `proof` 并**撤下** `Verified/Lean/<id>.lean`（工作文件 `Formal/<id>.lean` 保留，代码不丢）；
   *   ③ 把具体偏差写进记录与 `Formal/TODO.md`，并公告。
   * 之后 `formalGateOk` 为假：require 档本次裁定**不定论**，对象进入「形式化待办」——修正形式化
   * 并重新跑通后再投票。encourage 档没有门禁，公告里**不得**声称框架搁置了裁定（§4.1 第 3 条）。
   * 绝不把这条路径写成 `0`（那会让框架记下"命题为假"）。
   */
  async function formalRecordDefect(target, note, who) {
    const id = formalId(target)
    if (!id) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'defect 记录必须写明 target' }
    const prev = formalOf(id)
    // 撤回目标（审计 L2）：只在**确实有过归档证明**时才撤回。此前 prev.proof 为空时也会拿
    // 'Verified/Lean/<id>.lean' 去撤，而 withdrawArchivedProof 在文件删不掉/不存在时会**就地覆盖写**
    // ——于是一个从未有过证明的对象会在"所有人都来这里找证明"的目录里凭空多出一份撤回声明文件。
    let archived = String(prev.proof || '').trim()
    if (!archived) {
      const fallback = 'Verified/Lean/' + id + '.lean'
      const abs = leanAbsPath(fallback)
      if (abs !== null && (await readTextAbs(abs)) !== undefined) archived = fallback
    }
    await putFormal(id, Object.assign({}, prev, {
      status: 'attempted',
      decision: 'defect',
      note: note,
      proof: '',
      updatedAt: now(),
    }))
    // 归档证明必须消失，否则 Verified/Lean/ 里会留下一份"看起来已通过"的不忠实代码。
    const withdrawn = archived ? await withdrawArchivedProof(archived) : 'none'
    // 待办条目按 id 去重、就地刷新：note 进入 TODO.md 的 why 列（require 档据此搁置定论）。
    const list = formalTodo()
    const i = list.findIndex(function (x) { return x && x.id === id })
    const why = 'formal-defect：' + note
    if (i === -1) list.push({ id: id, at: now(), why: why, verdict: null, project: currentProject })
    else list[i] = Object.assign({}, list[i], { why: why, at: now() })
    await writeFormalTodo()
    await upsertFormalAnchor(id)
    await rebuildLeanLibIndexes()
    await saveAll()
    // 如实说出**哪一种**撤回发生了：删除成功 / 就地覆盖 / 两者都失败（后者必须让人手动处理，
    // 否则一份不忠实的代码会静静留在"证明"的路径上而无人知晓）。'none' = 本来就没有归档证明。
    await formalAnnounce('【形式化】' + who + ' 认定 ' + id + ' 的 Lean 形式化存在**忠实性缺陷**：' + note
      + '。这不是"命题为假"，而是**形式化不合格**：已撤回其「已通过」状态（降级为 attempted）、'
      + (withdrawn === 'none' ? '该对象此前没有任何归档证明，无需撤回'
        : withdrawn === 'deleted' ? '删除归档证明 ' + archived
          : withdrawn === 'overwritten' ? '归档证明 ' + archived + ' 无法删除（宿主不支持删除），已**就地覆盖为撤回声明**'
            : '归档证明 ' + archived + ' **未能撤回**（宿主删除与覆盖均失败，请手动删除，不要把它当作该对象的证明）')
      + '、写入 Formal/TODO.md；'
      + (formalMode() === 'require'
        ? '本次裁定**不定论**，修正形式化并重新跑通（vibe_math_lean_archive kind=\'proof\'）后再投票。'
        : '**本档没有门禁**：框架不会替你搁置裁定，请给弃权值以避免得出真/假一致结论；修正形式化并重新跑通（vibe_math_lean_archive kind=\'proof\'）后再投票。'))
    return { ok: true, kind: 'defect', target: id, status: 'attempted', proof: '', note: note, archived: archived }
  }
  /**
   * 回执通道（契约 §3/§6.3）：代理即使一次 Lean 工具都没调用，也必须能留下"实现难度判断"。
   * decision='blocked' 时 note 必填（否则拒绝记录并公告）；'used' 记录草稿文件 → attempted；
   * decision='defect' 时 note 必填（具体偏差），落库语义见 §4.1 与 `formalRecordDefect`。
   */
  async function absorbFormalReply(f, memberId) {
    if (!formalOn() || !f || typeof f !== 'object') return
    const who = memberId || 'member'
    const target = formalId(f.target)
    if (!target) return
    const decision = String(f.decision || '')
    if (decision === 'blocked') {
      const note = String(f.note || '').trim()
      if (!note) { await formalAnnounce('【形式化】' + who + ' 的 formal.decision=blocked 未写明 note，已**拒绝**记录（难度判断必须显式、可审计）。'); return }
      await putFormal(target, Object.assign({}, formalOf(target), { status: 'blocked', decision: 'blocked', note: note, updatedAt: now() }))
      await upsertFormalAnchor(target)
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 通过回执记录 ' + target + ' 形式化阻塞：' + note)
      return
    }
    if (decision === 'defect') {
      const note = String(f.note || '').trim()
      if (!note) {
        // 与 blocked 同样"显式、可审计"：没写出具体偏差就无法复核，整条记录拒绝（返回该架构的错误码）。
        await formalAnnounce('【形式化】' + who + ' 的 formal.decision=defect 未写明 note，已**拒绝**记录'
          + '（忠实性缺陷必须写出具体偏差，否则无从复核）。该对象的形式化记录与归档证明**保持不变**。')
        return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'defect 记录必须写明具体偏差（note）——"形式化与命题不一致"必须显式、可复核' }
      }
      return await formalRecordDefect(target, note, who)
    }
    if (decision === 'used') {
      const prev = formalOf(target)
      const file = String(f.file || ('Formal/' + target + '.lean'))
      // 契约 §4：`used` 只说"这一轮碰了形式化"，**不得**撤销已成立的证明，也不得把一条显式阻塞
      // （blocked，本身就是放行门禁的记录）打回 attempted 而重新关门。只有 `defect` 能撤销证明。
      // 只保留 `passed` 是不够的：`blocked` 同样是"门禁已放行"的状态（v2/v4/v5 两者都保留）。
      const keepStatus = (prev.status === 'passed' || prev.status === 'blocked') ? prev.status : 'attempted'
      await putFormal(target, Object.assign({}, prev, { status: keepStatus, decision: 'used', file: file, updatedAt: now() }))
      await upsertFormalAnchor(target)
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 通过回执记录 ' + target + ' 形式化草稿：' + file
        + (keepStatus === 'attempted' ? '' : '（保留已有的 ' + keepStatus + ' 状态：一次 used 回执不撤销已成立的证明/已记录的阻塞）'))
      return
    }
    await formalAnnounce('【形式化】' + who + ' 的 formal.decision 只能是 \'used\'、\'blocked\' 或 \'defect\'（收到 ' + String(f.decision) + '），已忽略。')
  }

  // ================= verification (验证器) =================
  /**
   * 一个判决对象**至少**需要几票。
   *
   * H5：此前没有任何下限——`maxParallelThreshold=1` 时 backfillVerifiers 只派出 1 个验证器，
   * 它一结束 `allReported`（只看"已存在的孩子是否都报了"）即为真，`consensus` 对单元素数组
   * 恒真，于是跳过全部辩论直接 `finalVerdict → 1 → settleVerdict`，写出 `概率:1/已验证·真`
   * 并落 `Verified/`。`Verified/` 是所有提示词的"绝对可信"层，一票定论 = 一个验证器的偏见
   * 直接变成下游全部代理的"已知事实"。
   *
   * 下限取 max(2, expectedCount)：verifierCount=1 不是"允许单票"，只是"至少 2 个独立验证器"
   * （与 createVerifyTask 的 `Math.max(2, ...)` 一致）。
   */
  /**
   * 票数/参与集的**单一来源**（审计 D4）。一个 verify 任务的参与集与"需要几票"只由**创建时的快照**
   * `t.expectedCount`（createVerifyTask 写入）与当前 round 决定——**绝不**读实时 `params.verifierCount`
   * 或实时名册：否则同一个计数会在 quorum 判据 / 裁决聚合 / 任务簿记之间给出不同答案，中途调参会让
   * 已经在进行中的表决永远凑不够票数而卡死（守卫见 formal-verify-v3 §5c）。
   */
  function voteCount(t, round) {
    const tt = t || {}
    const expected = Math.max(2, Number(tt.expectedCount) || 0)
    const r = Number((round === undefined || round === null) ? (tt.round || 1) : round) || 1
    const participants = Array.isArray(tt.children) ? tt.children.slice() : []
    const results = tt.childResults || {}
    const reportedIds = Object.keys(results)
    const thisRoundIds = participants.filter(function (cid) { const x = results[cid]; return x && Number(x.round) === r })
    return {
      round: r, expected: expected, participants: participants,
      dispatched: participants.length, reported: reportedIds.length, reportedIds: reportedIds,
      reportedThisRound: thisRoundIds.length,
      quorum: participants.length > 0 && participants.length >= expected && thisRoundIds.length === participants.length,
    }
  }
  function minVotes(t) { return voteCount(t).expected } // 快照值；**故意**不读实时 params.verifierCount
  function haveEnoughVotes(t) { const v = voteCount(t); return v.reported >= minVotes(t) } // 单一来源：minVotes 也只读快照
  /** 所有已派出的验证器都报了本轮的票，**且**票数达到下限——否则不得推进/裁决。 */
  function allReportedWithQuorum(t, round) {
    const v = voteCount(t, round)
    return v.dispatched > 0 && v.dispatched >= v.expected && v.quorum
  }
  function consensus(t) { const vs = voteCount(t).reportedIds.map(function (cid) { return t.childResults[cid].Result }); if (vs.length === 0) return false; return vs.every(function (v) { return v === 1 }) || vs.every(function (v) { return v === 0 }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; const changedNote = (r.changed != null && String(r.changed).trim()) ? (' [changed: ' + String(r.changed).trim() + ']') : ''; parts.push('Reviewer ' + i + ': Result=' + r.Result + ' Reason=' + r.Reason + changedNote) } return parts.join('\n') }
  async function handleVerifier(childId, meta, output, stopReason) {
    const rId = meta.rId
    const parsed = parseJson(output)
    const Result = clamp01((parsed && parsed.Result != null) ? parsed.Result : 0.5)
    const Reason = (parsed && parsed.Reason) || ''
    // 回执通道（契约 §4/§6.3）：验证者在回执里给出的难度判断/阻塞原因也要落成正式记录，
    // 否则提示词里承诺的 formal 字段就是一条"框架收不到"的死通道。
    if (parsed && parsed.formal && typeof parsed.formal === 'object') await absorbFormalReply(parsed.formal, childId)
    let t = tasks['verify:' + rId]
    if (!t) { t = { id: 'verify:' + rId, type: 'verify', r: { kind: 'proposition', pId: rId, 概述: rId }, rId: rId, status: 'debating', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(2, params.verifierCount), createdAt: now() }; tasks[t.id] = t }
    if (!parsed && !scheduler.running) {
      delete agentRegistry[childId]
      const ix = t.children.indexOf(childId); if (ix !== -1) t.children.splice(ix, 1)
      delete t.childResults[childId]
      if (t.children.length === 0 && t.id && tasks[t.id]) delete tasks[t.id]
      return
    }
    if (t.children.indexOf(childId) === -1) t.children.push(childId)
    t.childResults[childId] = { Result: Result, Reason: Reason, round: meta.round, changed: (parsed && parsed.changed != null && String(parsed.changed).trim()) ? String(parsed.changed).trim() : null }
    delete agentRegistry[childId]
    // H5：推进/裁决的前置条件是"已凑齐下限票数且本轮都已回报"，不是"目前存在的那几个孩子都报了"。
    // 未凑齐时保持 spawning，由 reconcileVerify 在后续 tick 里补派验证器（不裁决、不定论）。
    if (!allReportedWithQuorum(t, meta.round)) { await saveAll(); return }
    await advanceVerification(t, meta.round)
    await saveAll()
  }
  async function advanceVerification(t, round) {
    // H5 第二道闸门：票数不足下限时**不辩论、不裁决**，回到 spawning 等 reconcileVerify 补派。
    // 放在最前面：即便 handleVerifier 因为"孩子被删除"等边缘情形推进到这里，也绝不定论。
    if (!haveEnoughVotes(t)) { t.status = 'spawning'; return }
    if (round < params.debateMaxRounds && !consensus(t) && t.children.length > 0) {
      if (!scheduler.running) { t.status = 'paused'; return }
      if (activeCount() >= params.maxParallelThreshold) { t.status = 'paused'; return }
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
          console.error('vibe-math-v3: verifier followup failed: ' + String((e && e.message) || e))
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
  async function finalizeVerification(t) {
    // H5 最后一道闸门：票数不足下限时**决不**给出裁决（单票绝不结论）。
    if (!haveEnoughVotes(t)) { t.status = 'spawning'; return }
    const verdict = finalVerdict(t)
    if (params.mode === 'manual') {
      const d = enqueueDecision('verdict', 'verdict for ' + t.rId + ' (debate finished) = ' + verdict, { rId: t.rId, verdict: verdict, task: JSON.parse(JSON.stringify(t)) })
      setGate(d, 'verdict')
      t.status = 'awaiting-verdict'
    } else {
      await settleVerdict(t, verdict)
      delete tasks[t.id]
    }
  }
  // 近共识 + forced/flat 裁决（修复 v2 flat 高置信分歧误判：全部同侧且均值≥0.85/≤0.15 取均值）
  function finalVerdict(t) {
    const rs = voteCount(t).reportedIds.map(function (cid) { return t.childResults[cid] })
    if (rs.length === 0) return 0.5
    if (rs.every(function (r) { return r.Result === 1 })) return 1
    if (rs.every(function (r) { return r.Result === 0 })) return 0
    // 近共识：全部结果在同一侧（全 ≥0.5 或全 ≤0.5）且均值达到阈值 → 取均值
    const allHigh = rs.every(function (r) { return r.Result >= 0.5 })
    const allLow = rs.every(function (r) { return r.Result <= 0.5 })
    if (allHigh || allLow) {
      let sum = 0; for (let i = 0; i < rs.length; i++) sum += rs[i].Result
      const mean = sum / rs.length
      if (mean >= 0.85 || mean <= 0.15) return Math.max(0.01, Math.min(0.99, mean))
    }
    if (params.verdictMode === 'forced') {
      // M8：这里**不再**按 verifierAccuracy 加权。那份统计量统计的是"这一票与该次裁决是否一致"，
      // 而裁决本身就是同一批票的聚合——即"与自己一致"（注：v 为加权均值时 `Result === v` 几乎恒假，
      // 于是它其实把"从众度"记成 0），且没有任何后续真值（Lean 通过 / 被 defect 撤回 / 命题被反证）
      // 会纠正它。用这样一个量去加权，放大而非抑制系统性偏见，与"按历史准确率加权"的宣称相反。
      // 改为**等权**取均值：每票按自己报出的概率贡献，本身就是该验证器的贝叶斯式估计；
      // 严格的 1/0 是绝对投票，其影响已通过数值本身（拉向端点）自然体现，无需人为加权。
      let sum = 0; for (let i = 0; i < rs.length; i++) sum += rs[i].Result
      return Math.max(0.01, Math.min(0.99, sum / rs.length))
    }
    return 0.5
  }
  async function settleVerdict(t, verdict) {
    const v = clamp01(verdict)
    const r = t.r
    const cids = Object.keys(t.childResults)
    // 票数记录保留（Logs/Verification 与 State/verifier_accuracy.json 是审计轨迹），但该统计量
    // **不再**参与任何加权（见 finalVerdict 的 M8 说明）。这里记的是"该票的实际概率"而非布尔值：
    // 原来的 `Result === v` 记法在 v 为加权均值时几乎不可能相等，等于把"从众度"记成 0，
    // 与字段名 correct/total 的含义相去更远。
    for (let i = 0; i < cids.length; i++) {
      const acc = verifierAccuracy[cids[i]] || { correct: 0, total: 0 }
      acc.total += 1
      if (Number(t.childResults[cids[i]].Result) === v) acc.correct += 1
      verifierAccuracy[cids[i]] = acc
    }
    pruneVerifierAccuracy()
    await writeJson('Logs/Verification/' + t.rId + '_' + Date.now() + '_' + shortId() + '.json', { r: r, verdict: v, results: t.childResults, transcript: buildTranscript(t), history: t.history || [], at: now() })
    // ── require 门禁（契约 §8）────────────────────────────────────────────────
    // 判定为真（严格证明）或假（严格反驳）之前必须先有 `passed` 或 `blocked`。门禁放在**改
    // 对象之前**：不这样就改写不出"不改变对象的既有权重/概率字段"（一旦先把 概率 写成 1，
    // 下一 tick 的 processStatusUpdates 还会照着 prob=1 的条目再把它写回去）。
    // 记录票数（上面那份 Logs/Verification 已落盘）→ 记未定论 + 形式化待办 + 群聊公告 → 返回，
    // 对象留在原库、可形式化后再次提议，系统继续推进，绝不卡死。
    const gTarget = formalConclusionTarget(r, v)
    if (gTarget && formalBlocksConclusion(gTarget)) {
      const d = await deferForFormal(gTarget, formalRequiredWhy(gTarget), v === 1)
      logActivity('verdict', t.rId + ' = ' + v + ' 被 require 门禁搁置（formal-required；对象 ' + gTarget + ' 尚无 Lean 通过或阻塞记录）' + (d.already ? '（已在待办中）' : ''))
      return
    }
    if (r.kind === 'proposition') {
      const p = propos.get(r.pId)
      if (p) {
        p.概率 = v
        if (v === 1) { p.状态 = '已验证·真'; p.proofs = p.proofs || []; p.proofs.push({ title: '验证证明', prob: 1, status: '已验', text: strongestReason(t, 1) || '' }); p.优先级 = 'never' }
        else if (v === 0) { p.状态 = '已验证·假'; p.refutes = p.refutes || []; p.refutes.push({ title: '验证证伪', prob: 1, status: '已验', text: strongestReason(t, 0) || '' }); p.优先级 = 'never' }
        else {
          p.状态 = '未定论'
          p.proofs = p.proofs || []; p.refutes = p.refutes || []
          p.proofs.push({ title: '辩论支持论证', prob: v, status: '已验', text: strongestReason(t, 1) || '根据辩论得到的支持性论证' })
          p.refutes.push({ title: '辩论反驳论证', prob: 1 - v, status: '已验', text: strongestReason(t, 0) || '根据辩论得到的反驳性论证' })
        }
        await saveProposition(p)
        if (p.概率 === 1 || p.概率 === 0) await writeVerifiedPropositionCardIfNeeded(p)
      }
    } else if (r.kind === 'prop-proof') {
      const p = propos.get(r.pId)
      if (p) {
        const list = r.side === '证明' ? (p.proofs = p.proofs || []) : (p.refutes = p.refutes || [])
        const item = list[r.idx]
        if (item) {
          item.prob = v
          item.status = '已验'
          if (v === 1) { item.title = item.title || (r.side + '（已验证）') }
          else if (v === 0) {
            const other = r.side === '证明' ? (p.refutes = p.refutes || []) : (p.proofs = p.proofs || [])
            other.push({ title: (r.side === '证明' ? '证伪' : '证明') + '（反证）', prob: 1, status: '已验', text: strongestReason(t, 0) || '' })
          } else {
            const other = r.side === '证明' ? (p.refutes = p.refutes || []) : (p.proofs = p.proofs || [])
            other.push({ title: (r.side === '证明' ? '证伪' : '证明') + '（辩论论证）', prob: 1 - v, status: '已验', text: strongestReason(t, v >= 0.5 ? 0 : 1) || '辩论得出的相反方向论证' })
            item.title = item.title || ''
          }
        }
        await saveProposition(p)
        if (p.概率 === 1 || p.概率 === 0) await writeVerifiedPropositionCardIfNeeded(p)
      }
    } else if (r.kind === 'problem-solution') {
      const q = problems.get(r.qid)
      if (q) {
        const sol = (q.solutions || [])[r.idx]
        if (sol) {
          sol.prob = v
          sol.status = '已验'
          // 点3 回写联动：晋升问题的解法验证结果同步回源命题
          if (q.来源命题 && propos.has(q.来源命题)) {
            const sp = propos.get(q.来源命题)
            const isProof = String(sol.title || '').indexOf('【证明】') === 0
            const list = isProof ? (sp.proofs = sp.proofs || []) : (sp.refutes = sp.refutes || [])
            // 内容比对定位源条目（sol.text 去掉【证明/证伪】前缀），避免同概率条目错配
            const solText = String(sol.text || '').replace(/^【(证明|证伪)】/, '').trim()
            const srcIdx = list.findIndex(function (x) { return x.status === '未定论' && String(x.text || '').trim() === solText })
            if (srcIdx !== -1) { list[srcIdx].prob = v; list[srcIdx].status = '已验' }
            else list.push({ title: '晋升验证回写', prob: v, status: '已验', text: strongestReason(t, v >= 0.5 ? 1 : 0) || sol.text })
            await saveProposition(sp)
            if (sp.概率 === 1 || sp.概率 === 0) await writeVerifiedPropositionCardIfNeeded(sp)
          }
          // 判断问题联动：「判断下述命题是否成立：X」的解法验证 → X 命题收口
          if (q.判断命题 && propos.has(q.判断命题)) {
            const ap = propos.get(q.判断命题)
            ap.概率 = v
            if (v === 1) { ap.状态 = '已验证·真'; ap.proofs = ap.proofs || []; ap.proofs.push({ title: '判断问题验证通过', prob: 1, status: '已验', text: strongestReason(t, 1) || '经判断问题解法验证' }); ap.优先级 = 'never' }
            else if (v === 0) { ap.状态 = '已验证·假'; ap.refutes = ap.refutes || []; ap.refutes.push({ title: '判断问题判定不成立', prob: 1, status: '已验', text: strongestReason(t, 0) || '经判断问题解法验证' }); ap.优先级 = 'never' }
            await saveProposition(ap)
            if (ap.概率 === 1 || ap.概率 === 0) await writeVerifiedPropositionCardIfNeeded(ap)
          }
          if (v === 1) { q.状态 = '已解决'; q.优先级 = 'never'; await writeVerifiedProblemCardIfNeeded(q) }
        }
        await saveProblem(q)
      }
    }
    logActivity('verdict', t.rId + ' = ' + v + (v === 1 ? ' (fully verified)' : v === 0 ? ' (refuted)' : ' (uncertain)'))
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

  // ==========================================================================================
  // 最终论文（规格：docs/final-paper.md）—— 会话侧（v3 数据来源：md 知识库）。
  //
  // 时序（修订 §A2/§A3）：v3 的收口信号是 checkTermination() 的完整收口分支（无未解决问题、
  // `leftoverVerify` 为空——**这才是真实完整性判据**（§A4）、无真实在途代理、无任务/计划/挂起门）。
  // 撰写子代理必须在 `scheduler.running=false` 与 `releaseProjectLock()` **之前**派遣
  // （停止后 scheduleTick() 是空操作；提前释放项目锁后另一会话可能写同一棵树）。派不出去
  // （宿主激活上限 ACTIVATION_LIMIT_REACHED）→ 排队 + apply 级心跳重试 + 可见告警。
  // 落盘（§C/§D）：md/tex 是文本；**paper.pdf 只能由编译器子进程生成**、插件只 stat 且**永不删除/覆盖**；
  // paper.meta.json 最后写（原子提交点）；幂等 = run id + finalizedAt + 逐产物存在性（不用稳定哈希）。
  // ==========================================================================================
  let paperInFlight = ''            // 正在撰写的 childId
  let paperInFlightAt = 0           // 派遣时刻（判定卡死窗口；force 与心跳都据它降级）
  let paperReaps = 0                // 本 run 内已回收卡死撰写者的次数（自动重派上限）
  const paperAbandoned = {}         // childId -> true：已放弃的撰写者；它事后返回时输出被丢弃并留痕
  let paperPending = null           // 激活上限排队重试：{ tries, retryAt, reason, limit, trigger, opts }
  const PAPER_RETRY_MS = 5000
  const PAPER_MAX_RETRIES = 12
  const PAPER_STALE_MS = 10 * 60 * 1000 // 撰写者卡死窗口：超过它，force 与心跳都会回收并重派（10 分钟）
  const PAPER_MAX_AUTO_REAPS = 2    // 心跳自动回收+重派的次数上限，之后交给 /vibe paper force
  const PAPER_LOCK_STALE_MS = 120000
  function activationLimitFrom(message) { const m = /active child limit:\s*(\d+)/.exec(String(message == null ? '' : message)); return m ? Number(m[1]) : undefined }
  function paperId(opts) { return paperDirId((opts && opts.id) || currentProject) }
  function paperDir(id) { return 'Paper/' + paperDirId(id) }
  function paperAbsDir(id) { return frameworkRoot() + '/' + paperDir(id) }
  function paperAuthorLine() { return 'Vibe Math V3（单作者：论文撰写子代理）· 项目 ' + currentProject }
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
  /** paper 作用域锁（修订 §A3）：v3 在收口时已释放项目锁，用它防止两个会话同时写同一棵 Paper/ 树。 */
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
   * 回收卡死的撰写者（修订 §1：死掉的撰写者绝不能把论文永久卡住）。清状态 + 尽力中断 +
   * 从 agentRegistry 摘除（否则一直被算作活跃子代理）+ 记进 paperAbandoned（事后返回的输出被明确
   * 丢弃并留痕）+ 可见告警。
   */
  async function paperReapWriter(id, why) {
    const cid = paperInFlight
    paperInFlight = ''; paperInFlightAt = 0
    if (cid) {
      try { await interruptTraced(cid, 'paper writer re-dispatch') } catch (e) { /* best effort */ }
      delete agentRegistry[cid]
      paperAbandoned[cid] = true
    }
    await paperAppendLog(id, 'reap', '回收卡死的撰写者 ' + (cid || '(未知)') + '：' + why + '（论文不会被永久卡住；force/心跳会继续）')
    logActivity('paper', '回收卡死的论文撰写子代理 ' + (cid || '(未知)') + '：' + why)
    console.error('vibe-math-v3: reaped a stalled paper writer (' + (cid || 'unknown') + '): ' + why)
    reportDirty = true
    return cid
  }
  function paperWriterVerdictNow(force) {
    return paperWriterVerdict({ inFlight: !!paperInFlight, force: !!force, ageMs: now() - Number(paperInFlightAt || 0), staleMs: PAPER_STALE_MS, childInRegistry: paperInFlight ? (agentRegistry[paperInFlight] !== undefined) : true })
  }
  function paperOneLine(s, cap) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, cap || 400) }
  /** 证据索引（spec §3.9）：只列**确实存在**的文件；排除 Paper/ 自己（避免自我污染）。
   *  formalVerify=off 必须真的是无操作（formal-verify-v3 的语料守卫断言"off 的提示词里零 Lean 文本"），
   *  所以 off 档不把形式化路径写进材料。 */
  /**
   * 成员可见路径说明（跨预设审计 P0）。成员/子代理的**文件工具按会话 cwd 解析**相对路径，而下面列出的
   * 路径都是**项目根相对**的 ⇒ 必须显式说明"先拼绝对前缀"；计算产物用回执里的绝对字段。一处常量、
   * 五处材料文本各自 append（绝不替换既有行）。
   */
  const PAPER_PATH_NOTE = '（路径说明：成员/子代理的文件工具按**会话 cwd** 解析相对路径，因此上面列出的相对路径都必须先拼上**项目根的绝对前缀**再使用；计算产物请用回执里的绝对字段 `receipt.scriptAbs`，或把 `receipt.cwd` 与 `receipt.scriptPath` 拼起来。）'
  async function paperEvidenceIndex() {
    const formalNow = formalOn()
    const out = []
    if (formalNow && await paperPathExists('State/formal.json')) out.push('State/formal.json')
    if (await paperPathExists('State/index.json')) out.push('State/index.json')
    for (const p of allProblems()) out.push(problemRel(p))
    for (const p of allPropos()) out.push(propositionRel(p))
    for (const m of methods.values()) out.push(methodRel(m, false))
    // 审计 F2（v3 同型）：Reliable/ 是用户提供的可信参考层，材料证据索引必须收它，
    // 否则被引用/被要求给出处的来源进不了论文材料。
    for (const f of await listFiles('Reliable')) out.push('Reliable/' + f)
    const dirs = ['Verified/命题', 'Verified/问题', 'Logs/Verification', 'Logs/Plans', 'Progress'].concat(formalNow ? ['Verified/Lean', 'Formal'] : [])
    for (let i = 0; i < dirs.length; i++) { const files = await listFiles(dirs[i]); for (let j = 0; j < files.length; j++) out.push(dirs[i] + '/' + files[j]) }
    const seen = {}, uniq = []
    for (let i = 0; i < out.length; i++) { const x = String(out[i]); if (seen[x] || x.indexOf('Paper/') === 0) continue; seen[x] = true; uniq.push(x) }
    return uniq.sort()
  }
  /** 汇总材料（spec §4 + 修订 §A4）：只含既有证据；未决项（含 leftoverVerify 的待验证对象）显式标注。 */
  async function buildPaperDigest() {
    const L = []
    L.push('PRESET: vibe-math-v3 (single-author)')
    L.push('PROJECT: ' + currentProject)
    const qs = allProblems()
    L.push('')
    L.push('[ORIGINAL PROBLEMS] (Problems/*.md)')
    if (qs.length === 0) L.push('- (none)')
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      L.push('- id=' + q.id + ' | 状态=' + q.状态 + ' | 优先级=' + q.优先级 + ' | 依赖=' + JSON.stringify(q.依赖 || []) + ' | 来源=' + (q.来源 || '原始') + ' | 陈述=' + paperOneLine(q.陈述, 800))
      const dirs = getDirState(q.id)
      if (dirs.length) L.push('    · 方向：' + dirs.map(function (d) { return d.id + ':' + d.status }).join(', '))
      const sols = q.solutions || []
      if (sols.length === 0) L.push('    · 解法：无')
      for (let j = 0; j < sols.length; j++) L.push('    · 解法#' + j + ' 概率=' + sols[j].prob + ' 状态=' + (sols[j].status || '') + ' 证据=Verified/问题/ 与 Logs/Verification/ | ' + paperOneLine(sols[j].text, 1200))
    }
    const ps = allPropos()
    L.push('')
    L.push('[PROPOSITIONS] (Propos/<分类>/<id>.md)')
    L.push(PAPER_PATH_NOTE)
    if (ps.length === 0) L.push('- (none)')
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      const rec = formalOn() ? formalOf(p.id) : null   // off 档不把形式化字段写进材料（off 是真无操作）
      L.push('- id=' + p.id + ' | 概率=' + p.概率 + ' | 状态=' + p.状态 + ' | 优先级=' + p.优先级 + ' | 价值/关键性=' + p.价值关键性 + ' | 来源问题=' + (p.来源问题 || '') + (rec ? (' | 形式化=' + ((rec && rec.status) || 'none') + (rec && rec.proof ? ('（' + rec.proof + '）') : '')) : '') + ' | 陈述=' + paperOneLine(p.陈述, 800))
      const sides = [['证明', p.proofs || []], ['证伪', p.refutes || []]]
      for (let k = 0; k < sides.length; k++) { const arr = sides[k][1]; for (let j = 0; j < arr.length; j++) if (arr[j] && arr[j].prob === 1) L.push('    · 已检验通过：' + sides[k][0] + '#' + j + ' | ' + paperOneLine(arr[j].text, 900)) }
    }
    L.push('')
    L.push('[METHODS / ARTEFACTS] (Methods/ + 全局 VibeMath/Methods/)')
    L.push(PAPER_PATH_NOTE)
    const ms = Array.from(methods.values()).concat(Array.from(globalMethods.values()))
    if (ms.length === 0) L.push('- (none)')
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      L.push('- id=' + m.id + ' | 标题=' + m.标题 + ' | 类型=' + m.类型 + ' | 状态=' + m.状态 + ' | 可信断言=' + JSON.stringify(m.可信断言 || []) + ' | 应用次数=' + ((m.applications || []).length) + ' | 核心内容=' + paperOneLine(m.核心内容, 900))
    }
    // §A4：v3 的真实完整性判据是 leftoverVerify（buildVerifyCandidates）——把仍未验证的对象列出来。
    let cands = []
    try { cands = await buildVerifyCandidates() } catch (e) { /* 尽力而为 */ }
    L.push('')
    L.push('[STILL UNVERIFIED — v3 的完整性判据 leftoverVerify（buildVerifyCandidates）；必须标注为未决]')
    if (cands.length === 0) L.push('- (none — 没有待验证对象)')
    for (let i = 0; i < cands.length; i++) L.push('- 未决：' + cands[i].rId + '（' + cands[i].kind + '，' + paperOneLine(cands[i].概述, 200) + (cands[i].prob === undefined ? '' : ('，prob=' + cands[i].prob)) + '）')
    L.push('')
    L.push('[UNRESOLVED / REFUTED — 论文里必须显式标注，不得当成已成立的结论]')
    let any = false
    for (let i = 0; i < ps.length; i++) {
      if (!(ps[i].概率 === 1 || ps[i].概率 === 0)) { any = true; L.push('- 未定论：命题 ' + ps[i].id + '（概率=' + ps[i].概率 + '）') }
      else if (ps[i].概率 === 0) L.push('- 已被否证：命题 ' + ps[i].id)
    }
    for (let i = 0; i < qs.length; i++) {
      const sols = qs[i].solutions || []
      for (let j = 0; j < sols.length; j++) if (!(sols[j].prob === 1 || sols[j].prob === 0)) { any = true; L.push('- 未定论：问题 ' + qs[i].id + ' 的解法#' + j + '（概率=' + sols[j].prob + '）') }
    }
    if (!any && cands.length === 0) L.push('- (none — 所有对象均已定论)')
    L.push('')
    L.push('[EVIDENCE INDEX] (only files that exist)')
    const ev = await paperEvidenceIndex()
    for (let i = 0; i < ev.length; i++) L.push('- ' + ev[i])
    return L.join('\n')
  }
  /** 「论文撰写」子代理提示词（单作者；与 v2 同一形状/同一骨架）。 */
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
  /** LaTeX 检测（spec §5 + 修订 §D）：paperLatexCommand 非空时只用它；否则按语言顺序探测。 */
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
  /** 一次编译（nonstopmode），带主动超时 terminate。 */
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
   * 编译（spec §5 + 修订 §D/§E）：主引擎（nonstopmode，两遍）→ 换引擎 → 去不支持宏包 → 最小模板再试一次；
   * 然后报告并降级。**永不删除/覆盖已有 pdf**：成功判据 = 本次运行 exit 0 **且** pdf 存在。
   */
  async function paperCompile(id, o, texPrimary, bodyTex) {
    const relDir = paperDir(id), absDir = paperAbsDir(id)
    const attempts = []
    if (!o.compilePdf) return { compile: 'skipped', reason: 'paperCompilePdf=false', engine: null, attempts: attempts, pdfPreserved: await paperPathExists(relDir + '/paper.pdf') }
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
      for (let pass = 0; pass < 2; pass++) runs.push(await paperRunOnce(step.engine, absDir, cap))
      const last = runs[runs.length - 1]
      const pdf = !!last.ok && await paperPathExists(relDir + '/paper.pdf')
      attempts.push({ engine: step.engine.name, mode: step.mode, ok: pdf, exitCode: last.exitCode, timedOut: !!last.timedOut, stderr: last.stderr || '' })
      await paperAppendLog(id, 'compile', step.mode + ' engine=' + step.engine.name + ' → ' + (pdf ? 'ok（paper.pdf 已生成）' : ('failed（exit=' + String(last.exitCode) + (last.timedOut ? ', timeout' : '') + '）')))
      if (pdf) return { compile: (i === 0) ? 'ok' : 'repaired', engine: step.engine.name, mode: step.mode, attempts: attempts, pdfPreserved: false }
    }
    await writeText(relDir + '/paper.tex', texPrimary)
    const preserved = await paperPathExists(relDir + '/paper.pdf')
    await paperAppendLog(id, 'compile', '所有尝试均失败：保留 paper.tex + paper.md' + (preserved ? '（paper.pdf 是**上一次成功编译**留下的，未被覆盖）' : '，未生成 paper.pdf') + '（不阻塞定稿）')
    logActivity('paper', '论文 pdf 编译失败（已尝试换引擎/去不支持宏包/最小模板），已保留 tex+md：' + relDir)
    reportDirty = true
    return { compile: 'failed', engine: det.available[0].name, attempts: attempts, pdfPreserved: preserved }
  }
  /** 落盘 md/tex/pdf/meta（meta **最后**写 = 原子提交点；spec §2/§5）。 */
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
      id: id, dir: relDir, preset: 'vibe-math-v3', singleAuthor: true, project: currentProject,
      title: title, author: author, date: dateStr, abstract: String(info.abstract || ''),
      sectionBodies: info.sections || {}, sections: PAPER_SKELETON.map(function (s) { return s.key }), filledSections: filled,
      raw: String(info.raw == null ? '' : info.raw), notes: Array.isArray(info.notes) ? info.notes : [],
      trigger: info.trigger || 'manual', runStartedAt: Number(scheduler.startedAt) || 0,
      params: { finalPaper: params.finalPaper !== false, paperFormat: o.format, paperLanguage: o.lang, paperCompilePdf: !!o.compilePdf, paperLatexCommand: String(params.paperLatexCommand || '') },
      finalizedAt: now(), finalizedAtText: fmtTime(now()),
      artifacts: artifacts, compile: compile, compileEngine: engine, compileAttempts: attempts, pdfPreserved: pdfPreserved,
      material: info.material || null, evidence: evidence,
    }
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
  /** 派遣（内部）：激活上限拒绝 → 排队重试（修订 §A2）。 */
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
          console.error('vibe-math-v3: paper writer refused by the host activation limit ' + PAPER_MAX_RETRIES + ' times; giving up (retry later with /vibe paper force) — ' + message)
          await paperLockRelease(id)
          return { ok: false, message: 'paper writer refused by the activation limit ' + PAPER_MAX_RETRIES + ' times: ' + message, id: id, dir: relDir, limit: limit }
        }
        paperPending = { tries: tries, retryAt: now() + PAPER_RETRY_MS, reason: message, limit: limit, trigger: trigger, opts: { lang: o.lang, format: o.format, compilePdf: o.compilePdf } }
        if (tries === 1 || tries % 3 === 0) {
          await paperAppendLog(id, 'dispatch-queued', '宿主激活上限（' + (limit === undefined ? '?' : limit) + '）拒绝派遣（第 ' + tries + ' 次）：' + (PAPER_RETRY_MS / 1000) + 's 后重试')
          logActivity('paper', '论文撰写子代理被宿主激活上限拒绝（第 ' + tries + ' 次），已排队重试：' + message)
          console.error('vibe-math-v3: paper writer queued after an activation-limit refusal (try ' + tries + '): ' + message)
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
  /** 触发入口（spec §2/§3 + 修订 §A2/§A3）：自动（收口）与手动命令共用。 */
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
  /** `/vibe paper [lang=zh|en] [format=both|md|tex] [force]`（spec §2/§6）。 */
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
  /** status 里的论文视图（spec §2/§6）。 */
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
    // 子代理结束/中断：自动释放它持有的所有写锁（防锁残留导致文件被永久锁住）
    const endedId = String(info.id)
    for (const k of Object.keys(fileOwner)) { if (String(fileOwner[k].childId) === endedId) delete fileOwner[k] }
    const meta = agentRegistry[info.id]
    if (meta === undefined) {
      // 已回收的撰写者事后才返回：输出被丢弃，但必须**留痕**，不能静默消失（修订 §1）。
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
      else if (meta.role === 'planner') await handlePlanner(info.id, meta, output)
      else if (meta.role === 'method-keeper') await handleMethodKeeper(info.id, meta, output)
      // 修订 §A2：论文撰写子代理必须有**自己的分支**——未知 role 的产出会被静默丢弃。
      else if (meta.role === 'paper') await handlePaperWriter(info.id, meta, output)
      else console.error('vibe-math-v3: subagent ' + info.id + ' ended with an unknown role "' + String(meta.role) + '" — its output is dropped')
    } catch (e) { console.error('vibe-math-v3 onChildEnd error: ' + String((e && e.stack) || e)) }
    await saveAll()
    await maybePromoteMethods()
    scheduleTick()
  }

  // ================= init / control =================
  async function init(fresh) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    currentProject = await readCurrentProject(); await ensureDirs()
    params = Object.assign({}, DEFAULT_PARAMS); await loadSettings(); await migrateLegacyParams(); await loadState(); await loadKnowledgeBase()
    const prevEpoch = await readJson('State/process_epoch.json')
    const stale = typeof prevEpoch === 'string' && prevEpoch !== processEpoch
    if (fresh || stale) {
      if (fresh) { const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptTraced(ids[i], 'batch clear (start/abort)') }
      if (Object.keys(agentRegistry).length > 0 || Object.keys(tasks).length > 0) {
        logActivity(fresh ? 'start' : 'resume', 'cleared ' + Object.keys(agentRegistry).length + ' agent(s) and ' + Object.keys(tasks).length + ' task(s) (' + (fresh ? 'restart' : 'stale from previous process') + ')')
        agentRegistry = {}; tasks = {}
        // 论文派遣态是本进程内存态：子代理已被中断/丢弃，排队与在途标记必须一起清掉（修订 §A2）。
        if (paperInFlight || paperPending) logActivity('paper', '重启/跨进程恢复：清空论文撰写态（inFlight=' + (paperInFlight || '-') + (paperPending ? ', queued' : '') + '）')
        paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null
      }
    }
    await writeJson('State/process_epoch.json', processEpoch)
    // Lean 异步作业的崩溃恢复（spec §2.6）：同一进程 continue 不重驱（内存队列还在跑），
    // 只有新进程/新会话接手（fresh 或 stale epoch）才按 Formal/Jobs/*.json 恢复；恢复绝不置 passed。
    if (fresh || stale) { try { await recoverLeanJobs() } catch (e) { console.error('vibe-math-v3: lean job recovery failed: ' + String((e && e.message) || e)) } }
    // 数学计算的引擎探测（异步）在 init 时先跑一次：提示词侧只读缓存现算（mathWorkLine）。
    try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响 init：mathWorkLine 会因此为空 */ }
    await saveAll()
    if (params.indexAutoRebuild) await rebuildIndex()
    return { ok: true }
  }
  /**
   * 项目锁 = 租约（lease），不是一次性写入的时间戳。
   *
   * 旧实现只在获取时写一次 `at`，全仓没有任何续租点：运行满 projectLockTimeoutMs（默认 60s）后
   * 第二个会话就会把锁判为"过期"并直接夺锁，两个进程于是并发写同一棵 md 树——而写锁 fileOwner
   * 是**进程级**的，跨进程不共享，挡不住这一路。
   *
   * 现在：(1) 独立的续租定时器按 LOCK_POLL_MS 轮询、在租约用掉 1/4 时写盘——最坏租约年龄因此远低于
   * projectLockTimeoutMs，且与 tick 时长完全无关（Round C 修正：此前 renewProjectLock 放在 tick()
   * 顶部，单个 tick 超过 projectLockTimeoutMs 就会让租约过期）；
   * (2) 夺取**其他会话**持有的锁需要显式 override（`{override:true}` / `/vibe resume override`）。
   * 唯一保留的隐式接管是"锁租约已明确过期"（持有者进程崩溃、不再续租），以免崩溃后项目永久锁死；
   * 正常运行中的会话不会被接管。
   */
  // 节流判据取**落盘的那份租约自己的年龄**（`projectLock.at`），不再维护影子时间戳
  // `projectLockRenewedAt`：实测它连续两次轮询都读到"距上次续租约 5s"（因而每次都判定"不必写"），
  // 而文件里的 `at` 始终停在会话启动那一刻——影子时间戳与真正的租约可以分叉。
  // `projectLock.at` 正是 acquireProjectLock() 判过期、也是崩溃恢复所依据的唯一状态。
  // 因此"多久写一次"由租约年龄自己决定，二者不可能再分叉。
  async function renewProjectLock() {
    if (!scheduler.running) return
    if (projectLock.sessionId !== sessionId) return
    const timeout = Number(params.projectLockTimeoutMs) || 60000
    if ((now() - (Number(projectLock.at) || 0)) < Math.max(1000, timeout / 4)) return
    projectLock.at = now()
    await saveAll()
  }
  async function acquireProjectLock(override) {
    const timeout = Number(params.projectLockTimeoutMs) || 60000
    const held = projectLock.sessionId && projectLock.sessionId !== sessionId
    if (held) {
      const age = now() - (Number(projectLock.at) || 0)
      // 过期租约 = 持有者进程已不在续租（崩溃） → 允许接管，否则崩溃一次项目就永久锁死。
      if (age < timeout && !override) {
        return { ok: false, code: 'PROJECT_LOCKED', message: '项目 "' + currentProject + '" 正被会话 ' + projectLock.sessionId + ' 占用（租约剩余 ' + Math.max(0, timeout - age) + 'ms；确认对方已停止后可显式接管：override=true）' }
      }
      logActivity('lock', 'project lock taken over from session ' + projectLock.sessionId + (override ? ' (explicit override)' : ' (lease expired after ' + age + 'ms)'))
    }
    projectLock = { sessionId: sessionId, at: now() }
    await saveAll()
    return { ok: true }
  }
  async function releaseProjectLock() {
    if (projectLock.sessionId === sessionId) { projectLock = { sessionId: '', at: 0 }; await saveAll() }
  }
  async function startScheduler(override) { const r = await init(true); if (!r.ok) return r; const lock = await acquireProjectLock(override === true); if (!lock.ok) return lock; scheduler.running = true; scheduler.startedAt = now(); scheduler.gate = null; logActivity('start', 'scheduler started for project ' + currentProject + '（v3：md 知识库 + 规划代理调度 + 方法库）'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler(override) { const r = await init(false); if (!r.ok) return r; const lock = await acquireProjectLock(override === true); if (!lock.ok) return lock; scheduler.running = true; scheduler.gate = null; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; await releaseProjectLock(); logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptTraced(ids[i], 'batch clear (start/abort)'); agentRegistry = {}; planQueue = []; paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null; await releaseProjectLock(); logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  async function autoResolvePending() {
    const pending = decisionQueue.filter(function (d) { return d.status === 'pending' })
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]
      try {
        if (d.node === 'spawn') { await spawnChild(d.data.label, d.data.promptText, d.data.meta); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'verdict') { await settleVerdict(d.data.task, d.data.verdict); delete tasks[d.data.task.id]; d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'plan') { planQueue = (d.data.plan || []).slice(); await applyPlanToProblemCards(planQueue); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'method-promote') { const m = methods.get(d.data.methodId); if (m) await promoteMethodToGlobal(m); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
      } catch (e) {
        // 副作用失败必须把该决策落到终态（同 v2）：否则它永远保持 pending，此后每次切 auto 都在
        // 同一个决策上重新抛错，而 gate 又指向它 —— 调度永久卡死且无任何报错指向真因。
        console.error('vibe-math-v3: auto-resolve decision failed: ' + String((e && e.message) || e))
        d.status = 'resolved'
        d.resolution = { action: 'auto-failed', auto: true, error: String((e && e.message) || e) }
        logActivity('gate', 'auto-resolve failed for ' + d.id + ' (' + d.node + '), marked resolved to avoid a permanent stall: ' + String((e && e.message) || e))
      }
    }
    if (pending.length > 0) { scheduler.gate = null; logActivity('mode', 'switched to auto — auto-resolved ' + pending.length + ' pending decision(s)'); await saveAll(); scheduleTick() }
  }
  /** 审计 F7（v3 同型）：`project` 是**当前会话**的项目名，`projects` 是磁盘上已存在的 slug 列表；
   *  两者不闭合时（新会话 project='default' 而磁盘上没有该目录）语义必须显式，不能靠调用方猜。 */
  async function projectExistsOnDisk() { return (await listDirsAt(vibeRoot(), 'Projects')).indexOf(currentProject) !== -1 }
  async function getStatus() {
    return {
      at: now(),
      ok: true, initialized: rootAgent !== undefined, running: scheduler.running,
      project: currentProject, projectExists: await projectExistsOnDisk(), projects: await listDirsAt(vibeRoot(), 'Projects'),
      stateCommit: stateCommit,
      stateWriteFailures: { count: stateWriteFailures.length, last: stateWriteFailures[stateWriteFailures.length - 1] || null },
      mode: params.mode, activeCount: activeCount(), maxParallelThreshold: params.maxParallelThreshold,
      frameworkRoot: frameworkRoot(),
      problems: { total: problems.size, solved: allProblems().filter(function (q) { return q.状态 === '已解决' }).length },
      propositions: { total: propos.size, resolved: allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length },
      verifyPending: (await buildVerifyCandidates()).length,
      methods: { project: methods.size, global: globalMethods.size, pendingInventions: methodLog.pendingInventions.length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,
      registeredAgents: Object.keys(agentRegistry).length,
      queuedPlanActions: planQueue.length,
      plannerEnabled: params.plannerEnabled, plannerFails: plannerFails,
      formal: formalSummary(),
      recentActivity: activityLog.slice(-Math.min(ACTIVITY_REPORT_MAX, Number(params.activityLogCap) || 100)), params: params,
      // 最终论文的可观测面（spec §2/§6）。
      // F3（对照 v5 的 leanNoticesScope/fieldScopes）：逐组标注会话内存 vs 耐久来源。
      fieldScopes: {
        durable: ['project', 'projects', 'problems', 'propositions', 'stateCommit', 'formal', 'methods.project', 'methods.global', 'paper.finalizedAt', 'paper.artifacts', 'paper.compile'],
        session: ['stateWriteFailures', 'activeCount', 'pendingDecisions', 'registeredAgents', 'verifyPending', 'queuedPlanActions', 'plannerFails', 'methods.pendingInventions', 'recentActivity', 'paper.inFlight', 'paper.inFlightSince', 'paper.inFlightAgeMs', 'paper.reapedThisRun', 'paper.queued'],
        note: 'session = 本进程内存，重启后归零（看着永远健康是假象）；durable = 落在项目树里（State/Formal/Progress/Verified 等），重启后仍在',
      },
      paper: await paperStatusView(),
    }
  }
  async function checkTermination() {
    const unsolved = allProblems().filter(function (q) { return !(q.状态 === '已解决' || q.优先级 === 'never') })
    // "有工作待处理"的判定必须把**挂起的门**算进去。
    // manual 模式下 planner 产出的计划不是进 planQueue，而是挂成一条 pending decision 并置 scheduler.gate
    // （见 handlePlanner）；此时 agentRegistry/tasks/planQueue 三者皆空。而 tick() 开头 `if (scheduler.gate) return`
    // 会让后续 tick 根本走不到这里——也就是说门挂起的这一刻本轮就是"停摆判定"的最后机会。
    // 若不排除挂起门，停摆分支会把 scheduler.running 置 false；用户随后 approve（它只入队 planQueue）时
    // tick() 又因 !running 直接返回，被批准的计划永远不执行，直到人工再 resume。
    const hasPendingGate = scheduler.gate !== null || decisionQueue.some(function (d) { return d.status === 'pending' })
    // 终止前必须无遗留验证对象（未验证命题/证明/解法）；否则会在命题/解法仍未验证时提前停机。
    // 注意：待沉淀发明（pendingInventions）不应阻塞终止——它是"批量蒸馏"（积够 methodKeepEvery 才触发），
    // 少量残留不会再有 method-keeper 触发，若纳入会令 scheduler 永不终止（闲置空转）。
    const leftoverVerify = (await buildVerifyCandidates()).length > 0
    // H1：在途的 **planner 不算"活跃工作"**。planner 不产出知识、不持有验证任务，只是"问下一步做什么"；
    // 旧判定把刚派出的 planner 也算成活跃代理，于是本 tick 的停机判定永远被自己派出的 planner 挡掉，
    // 空闲时形成"每 tick 一个 planner"的活锁。排除它之后，空闲的那一 tick 就能正常收口停机。
    const realAgents = Object.keys(agentRegistry).filter(function (cid) { const m = agentRegistry[cid]; return m && m.role !== 'planner' && m.role !== 'paper' }).length
    if (unsolved.length === 0 && !leftoverVerify && realAgents === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0) {
      // ★ 最终论文（修订 §A2/§A3）：必须在 running=false 与 releaseProjectLock() **之前**派遣——
      //   停止之后 scheduleTick() 是空操作；提前放锁后另一会话可能开始写同一棵树（paper 锁兜底）。
      //   触发点就是这个分支本身：`leftoverVerify` 为空才是 v3 的真实完整性判据（§A4）。
      if (params.finalPaper !== false) {
        try { await maybeWritePaper('auto') } catch (e) { logActivity('paper', '自动撰写最终论文失败：' + String((e && e.message) || e)) }
      }
      scheduler.running = false
      await releaseProjectLock()
      logActivity('stop', 'all active problems solved (never-priority excluded) and no active agents/tasks/plans — scheduler stopped (strict termination)')
      await saveAll(); await maybeWriteReport(true); await maybePushReport(true)
    } else if (!hasPendingGate && realAgents === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0 && unsolved.length > 0) {
      let allBlocked = true
      for (let i = 0; i < unsolved.length; i++) {
        const q = unsolved[i]
        if (q.状态 === '等待依赖') continue
        const dirs = getDirState(q.id)
        const exhaustedAll = dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
        const hasActive = dirs.some(function (d) { return d.status === 'active' })
        const blocked = (dirs.length === 0 || exhaustedAll) && (explorerRetries[q.id] || 0) >= (Number(params.maxExplorerRetries) || 3)
        if (hasActive || !blocked) { allBlocked = false; break }
      }
      if (allBlocked) {
        scheduler.running = false
        await releaseProjectLock()
        logActivity('stall', 'no feasible direction remains for any unsolved problem — scheduler paused (stalled, NOT all solved)')
        await saveAll(); await maybeWriteReport(true)
      }
    }
  }

  // ================= projects =================
  async function setProject(slug, create) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    const exists = (await listDirsAt(vibeRoot(), 'Projects')).indexOf(slug) !== -1
    if (!create && !exists) return { ok: false, message: 'project not found: ' + slug }
    if (scheduler.running) await abortScheduler()
    currentProject = slug; await writeCurrentProject(); await ensureDirs()
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; planQueue = []; plannerFails = 0; methodLog = { pendingInventions: [], keepCount: 0, lastKeepAt: 0 }; projectLock = { sessionId: '', at: 0 }; lastReportWrite = 0; lastPushReport = 0; reportDirty = false; lastPlanSummary = null; archivedJ = {}; lastIndexWrite = 0; formalState = { records: {}, todo: [], libRuns: {} }; paperInFlight = ''; paperInFlightAt = 0; paperReaps = 0; paperPending = null
    await loadSettings(); await migrateLegacyParams(); await loadState()
    // 切到/新建项目 = 接手这棵树的遗留作业（本进程不认识的 jobId 才恢复）。
    try { await recoverLeanJobs() } catch (e) { console.error('vibe-math-v3: lean job recovery on project switch failed: ' + String((e && e.message) || e)) }; await loadKnowledgeBase()
    // 切项目后引擎探测缓存过期（mathEngines/路径可能不同）：重探一次再让提示词读它。
    try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响切换 */ }
    await saveAll()
    if (params.indexAutoRebuild) await rebuildIndex()
    return { ok: true, project: slug, frameworkRoot: frameworkRoot() }
  }

  // ================= events / timer (registered at apply level, see bottom) =================

  // ================= tools =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  const handlers = {}
  function registerTool(name, description, parameters, executeFn) { handlers[name] = executeFn }
  // math_computation 的**会话层**注册（共享模块的 host 在上面构造，绑定本会话的 params/Paths/fs）。
  // 模块调用一次 host.register(...) ⇒ handlers['math_computation'] = 该会话的 handler；
  // apply 层（工具面）在 apply 作用域单独注册一次，按名路由回这里（FREEZE §4 要求两层都在）。
  mathTool = registerMathComputation(mathHost)
  // 会话层挂载（**字面量形态**，静态扫描器可见）：handler 是模块为**本会话**构造的那一个；
  // apply 层的同名词由宿主按 handlerName 路由回这里。两层名字/描述/schema 三处完全一致。
  registerTool('math_computation', TOOL_DESC.math_computation, MATH_TOOL_SCHEMA, async function (args, agent) { return await mathTool.handler(args || {}, agent) })
  registerTool('vibe_math_start', TOOL_DESC.vibe_math_start, objParams({ override: { type: 'boolean' } }), async function (args) { return await startScheduler(args && args.override) })
  registerTool('vibe_math_resume', TOOL_DESC.vibe_math_resume, objParams({ override: { type: 'boolean' } }), async function (args) { return await resumeScheduler(args && args.override) })
  registerTool('vibe_math_pause', TOOL_DESC.vibe_math_pause, objParams({}), async function () { return await pauseScheduler() })
  registerTool('vibe_math_abort', TOOL_DESC.vibe_math_abort, objParams({}), async function () { return await abortScheduler() })
  registerTool('vibe_math_status', TOOL_DESC.vibe_math_status, objParams({}), async function () { await refreshParams(); return await getStatus() })
  registerTool('vibe_math_report', TOOL_DESC.vibe_math_report, objParams({}), async function () { await refreshParams(); await maybeWriteReport(true); return await buildReport() })
  registerTool('vibe_math_set_mode', TOOL_DESC.vibe_math_set_mode, objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), async function (args) { params.mode = args.mode; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } })
  registerTool('vibe_math_set_params', TOOL_DESC.vibe_math_set_params, objParams({ mode: { type: 'string', enum: ['manual', 'auto'] }, maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' }, leanAsync: { type: 'boolean' }, leanJobsMaxParallel: { type: 'integer' }, leanInitiative: { type: 'string', enum: ['off', 'normal', 'eager'] }, leanSearchPaths: { type: 'array', items: { type: 'string' } }, mathComputation: { type: 'string', enum: ['off', 'auto', 'on'] }, mathMode: { type: 'string', enum: ['typed', 'typed+shell'] }, mathEngines: { type: 'array', items: { type: 'string' } }, mathTimeoutMs: { type: 'integer' }, mathPackages: { type: 'array', items: { type: 'string' } }, mathInstallScope: { type: 'string', enum: ['user', 'system'] }, finalPaper: { type: 'boolean' }, paperFormat: { type: 'string', enum: ['both', 'md', 'tex'] }, paperLanguage: { type: 'string', enum: ['zh', 'en'] }, paperCompilePdf: { type: 'boolean' }, paperLatexCommand: { type: 'string' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); if (args && MATH_PARAM_NAMES.some(function (k) { return k in args })) { try { await refreshMathProbe(true) } catch (e) { /* 探测失败不影响参数保存 */ } } return { ok: true, params: params } })
  registerTool('vibe_math_setup', TOOL_DESC.vibe_math_setup, objParams({}), async function () { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', TOOL_DESC.vibe_math_save_settings, objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', TOOL_DESC.vibe_math_template, objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', TOOL_DESC.vibe_math_add_problem, objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' }, dependencies: { type: 'array', items: { type: 'string' } } }, ['id', 'description']), async function (args) { const id = idSafe(args.id); if (problems.has(id)) return { ok: false, message: 'problem id already exists' }; problems.set(id, { id: id, 标题: id, 状态: '求解中', 优先级: args.priority || 0, 依赖: Array.isArray(args.dependencies) ? args.dependencies : [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: String(args.description == null ? '' : args.description), 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(id)); await syncDependencies(); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: problemRel(problems.get(id)) } })
  registerTool('vibe_math_add_proposition', TOOL_DESC.vibe_math_add_proposition, objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 概率: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 分类: { type: 'string' }, 来源问题: { type: 'string' }, 来源方向: { type: 'string' } }, ['id', '概述']), async function (args) {
    // M9：内存键、对象 id、文件名必须是**同一个**归一化 id。此前内存键用原始 id、文件名用
    // idSafe(id)、重载键又来自文件名 ⇒ 同一个对象分裂成两个身份（`p-1/2` 与 `p-1-2`）。
    const id = idSafe(args.id)
    if (propos.has(id)) { const cf = propositionIdConflict(id); logActivity('proposition', '拒绝覆盖已有命题：' + id); return Object.assign({ ok: false }, cf) }
    const p = { id: id, 标题: id, 状态: '未定论', 概率: clamp01(args.概率 != null ? args.概率 : 0.5), 优先级: (args.优先级 != null) ? args.优先级 : 1, 依赖: [], 价值关键性: clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), 分类: args.分类 || '未分类', 陈述: String(args.概述 == null ? '' : args.概述), proofs: [], refutes: [], 来源问题: String(args.来源问题 || ''), 来源方向: String(args.来源方向 || ''), 在问题清单: false }
    propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: propositionRel(p) }
  })
  registerTool('vibe_math_list_propositions', TOOL_DESC.vibe_math_list_propositions, objParams({}), async function () { const all = allPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 标题: p.标题, 概率: p.概率, 状态: p.状态, 优先级: p.优先级, 分类: categoryOf(p) } }) } })
  registerTool('vibe_math_new_project', TOOL_DESC.vibe_math_new_project, objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, true) })
  registerTool('vibe_math_set_project', TOOL_DESC.vibe_math_set_project, objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, false) })
  registerTool('vibe_math_list_projects', TOOL_DESC.vibe_math_list_projects, objParams({}), async function () { return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') } })
  registerTool('vibe_math_list_decisions', TOOL_DESC.vibe_math_list_decisions, objParams({}), async function () { return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) } })
  registerTool('vibe_math_decide', TOOL_DESC.vibe_math_decide, objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), async function (args) { const d = decisionQueue.find(function (x) { return x.id === args.id }); const resolution = { action: args.action, verdict: args.verdict }; if (!d || d.status !== 'pending') return await resolveDecision(args.id, resolution); const applied = await applyDecision(d.node, d.data, resolution); const r = await resolveDecision(args.id, resolution); return Object.assign({ ok: true, applied: applied }, r) })
  registerTool('vibe_math_list_agents', TOOL_DESC.vibe_math_list_agents, objParams({}), async function () { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round, rId: m.rId }) } return { ok: true, agents: out, count: out.length } })
  registerTool('vibe_math_message_agent', TOOL_DESC.vibe_math_message_agent, objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), async function (args) { if (!agentRegistry[args.childId]) return { ok: false, message: 'unknown childId' }; await followupChild(args.childId, args.message); return { ok: true, message: 'message delivered' } })
  registerTool('vibe_math_interrupt_agent', TOOL_DESC.vibe_math_interrupt_agent, objParams({ childId: { type: 'string' } }, ['childId']), async function (args) { const r = await interruptChild(args.childId); return Object.assign({}, r, { ok: !!(r && r.ok) }) })
  registerTool('vibe_math_plan', TOOL_DESC.vibe_math_plan, objParams({ force: { type: 'boolean' } }), async function (args) { if (args && args.force && scheduler.running && !scheduler.gate) { await callPlanner(); return { ok: true, message: 'planning triggered', queued: planQueue.length } } return { ok: true, queued: planQueue, lastPlan: lastPlanSummary } })
  registerTool('vibe_math_index', TOOL_DESC.vibe_math_index, objParams({}), async function () { await loadKnowledgeBase(); const r = await rebuildIndex(); return { ok: true, index: r, project: currentProject } })
  registerTool('vibe_math_method_add', TOOL_DESC.vibe_math_method_add, objParams({ id: { type: 'string' }, 标题: { type: 'string' }, 类型: { type: 'string' }, 核心内容: { type: 'string' }, 适用场景: { type: 'string' } }, ['id', '标题']), async function (args) { const id = idSafe(args.id); if (methods.has(id)) return { ok: false, message: 'method id already exists' }; const m = { id: id, 标题: args.标题, 类型: args.类型 || '方法', 状态: '经验', 可信断言: [], 上级体系: [], 子方法: [], 相关: [], 适用场景: args.适用场景 || '', 核心内容: args.核心内容 || '', 定义与记号: '', applications: [], improvements: [], 来源: 'user' }; methods.set(m.id, m); await saveMethod(m, false); await rebuildIndex(); return { ok: true, method: m, file: methodRel(m, false) } })
  registerTool('vibe_math_method_list', TOOL_DESC.vibe_math_method_list, objParams({}), async function () { const all = Array.from(methods.values()); const g = Array.from(globalMethods.values()); return { ok: true, count: all.length, globalCount: g.length, methods: all.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: false } }).concat(g.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: true } })) } })
  registerTool('vibe_math_lock_status', TOOL_DESC.vibe_math_lock_status, objParams({}), async function () { return { ok: true, project: currentProject, lock: projectLock } })
  registerTool('vibe_math_claim_write', TOOL_DESC.vibe_math_claim_write, objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await claimWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_release_write', TOOL_DESC.vibe_math_release_write, objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await releaseWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_sync_meta', TOOL_DESC.vibe_math_sync_meta, objParams({ meta: { type: 'object' } }, ['meta']), async function (args, agent) { return await syncMeta(args.meta || {}, agent) })

  // ---- Lean 形式化验证工具（契约 docs/formal-verification.md §5）----
  // **无条件注册**：注册是静态的（与既有 ctx.effect 纪律一致），模式只决定框架是否主动告诉
  // 代理它们存在；off 模式下人/代理主动调用时照常工作。
  registerTool('vibe_math_lean_run', TOOL_DESC.vibe_math_lean_run, objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), async function (args, agent) { return await leanRunTool(agent && agent.id, args) })
  registerTool('vibe_math_lean_archive', TOOL_DESC.vibe_math_lean_archive, objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), async function (args, agent) { return await leanArchive(agent && agent.id, args) })
  registerTool('vibe_math_lean_lib', TOOL_DESC.vibe_math_lean_lib, objParams({ refresh: { type: 'boolean' } }), async function (args) {
    const a = args || {}
    const r = a.refresh === false
      ? { lib: null, proved: null, objects: Object.keys(formalRecords()).length }
      : await rebuildLeanLibIndexes()
    return {
      ok: true, mode: formalMode(), rebuilt: a.refresh !== false,
      counts: r, todo: formalTodo().map(function (t) { return { id: t.id, why: t.why, at: t.at } }),
      objects: Object.keys(formalRecords()).map(function (k) {
        const rec = formalRecords()[k] || {}
        return { target: k, status: rec.status, file: rec.file, proof: rec.proof, note: rec.note, async: rec.async || null }
      }),
      async: params.leanAsync !== false,
      jobs: (function () { const out = []; for (const j of leanJobs.values()) out.push(Object.assign(leanJobPublic(j), { exitCode: j.exitCode === undefined ? null : j.exitCode, paths: leanJobPaths(j), buildSha256: j.buildSha || '' })); out.sort(function (x, y) { return (y.settledAt || 0) - (x.settledAt || 0) || String(x.jobId).localeCompare(String(y.jobId)) }); return out })(),
      paths: { project: 'Formal/（相对项目根）', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/', proofs: 'Verified/Lean/', searchPath: vibeRoot(), jobs: 'Formal/Jobs/' },
      hint: "复用优先：先在 Lib/ 里找现成定义（vibe_math_lean_read 可取原文）；新定义用 vibe_math_lean_archive kind='def' 归档，已证引理用 kind='lemma'；归档前先跑通（run=true 或先 vibe_math_lean_run），跑不通不要入库。异步档用 jobs 字段查后台编译：**只有 state=settled 才算通过**。",
      verify: (Object.keys(tasks).length ? String(tasks[Object.keys(tasks)[0]].rId || '') : null),
    }
  })
  registerTool('vibe_math_lean_read', TOOL_DESC.vibe_math_lean_read, objParams({ name: { type: 'string' }, kind: { type: 'string', enum: ['auto', 'lib', 'proved'] } }, ['name']), async function (args) { return await leanReadTool(args) })
  registerTool('vibe_math_lean_job', TOOL_DESC.vibe_math_lean_job, objParams({ jobId: { type: 'string' }, waitMs: { type: 'integer' } }), async function (args) { return await leanJobTool(args) })

  // ---- 代理直接写 md 的写锁 + 轻元数据同步（任务2：代理自组织写各自对应路径的 md，避免并发写同一文件） ----
  /**
   * 写锁键 = 归一化后的项目内相对路径。
   *
   * 锁表 `fileOwner` 是**进程级**的，而写锁的目的（实现方案：写前 claim_write，防并发写同一 md）
   * 是"同一文件同一时刻只有一个写者"。因此键必须是**所有会话共享**的——若把 sessionId 掺进键，
   * 两个会话就能同时持有同一文件的锁，写锁立刻失效（这正是实测中 e2e-v3 Scenario L 抓到的回归）。
   *
   * 已知取舍：不同项目里的同名相对路径（如各自的 `Progress/q1/d1.md`）会共用一把锁，可能产生
   * 一次多余的"文件正被占用"。这是**误拒**而非误准：写锁宁可保守也不能漏。真正的跨项目并发写
   * 已由项目锁（projectLock，运行调度前获取）挡在前面；相比之下"写锁被绕过"才是必须避免的一侧。
   */
  function fileLockKey(target) {
    return String(target || '').replace(/\\/g, '/')
  }
  /** 文件写锁的租约时长（审计 D2）：与项目锁同型——**持有者活着就续租**，持有者消失后最多这么久失效。
   *  旧实现只在 claim 时写一次 `at`、判定窗口固定 60s 且全仓没有续租点：成员写一份大文件超过 60s 后，
   *  另一个成员可以合法抢锁（锁恰好在它最该起作用的场景失效）。 */
  function fileLockTtl() { return Math.max(1000, Number(params.fileLockTimeoutMs) || 60000) }
  function fileLockDue() { return Math.max(250, fileLockTtl() / 4) }
  function fileLockHolderAlive(id) {
    const cid = String(id || '')
    if (!cid || cid === 'scheduler') return true
    if (agentRegistry[cid]) return true
    try { return String((rootAgent && rootAgent.id) || '') === cid } catch (e) { return false }
  }
  /** 每次锁轮询（LOCK_POLL_MS）里与 renewProjectLock 一同执行：只续租**活着**的持有者。 */
  async function renewFileLocks() {
    const ids = Object.keys(fileOwner)
    for (let i = 0; i < ids.length; i++) {
      const o = fileOwner[ids[i]]
      if (!o) continue
      if (!fileLockHolderAlive(o.childId)) continue // 持有者已消失 ⇒ 让租约自然过期（有界接管）
      if ((now() - (Number(o.at) || 0)) >= fileLockDue()) o.at = now()
    }
  }
  async function claimWrite(target, agent) {
    const childId = (agent && agent.id) ? String(agent.id) : 'scheduler'
    const key = String(target || '').replace(/\\/g, '/')
    if (!key) return { ok: false, message: 'target required' }
    const lockKey = fileLockKey(key)
    const owner = fileOwner[lockKey]
    if (owner && owner.childId !== childId && (now() - (owner.at || 0)) < fileLockTtl()) {
      return { ok: false, busy: owner.childId, message: '文件 "' + key + '" 正被其他代理写入，请稍后（写锁）' }
    }
    // 确保目标父目录存在（如 Progress/<qid>/ 供方向文件写入）
    const pm = /^(Progress|Propos|Methods)\/([^/]+)\//.exec(key)
    if (pm) { const base = frameworkRoot(); await runShell(mkdirCmd([base + '/' + pm[1] + '/' + pm[2]])) }
    fileOwner[lockKey] = { childId: childId, sessionId: sessionId, at: now(), key: key }
    logActivity('write-lock', 'claim ' + currentProject + '/' + key + ' by ' + childId)
    return { ok: true, key: key, path: frameworkRoot() + '/' + key, hint: '现在可写入 ' + frameworkRoot() + '/' + key + '；写完请 release_write' }
  }
  async function releaseWrite(target, agent) {
    const childId = (agent && agent.id) ? String(agent.id) : 'scheduler'
    const key = String(target || '').replace(/\\/g, '/')
    const lockKey = fileLockKey(key)
    const owner = fileOwner[lockKey]
    if (owner && owner.childId !== childId) return { ok: false, message: '写锁不属于此代理，无法释放' }
    delete fileOwner[lockKey]
    logActivity('write-lock', 'release ' + key + ' by ' + childId)
    return { ok: true, key: key }
  }
  // 元数据同步：代理把内容写进 md 后，用极简字段让调度器更新索引/状态（content 不进 JSON）
  async function syncMeta(meta, agent) {
    if (!meta || typeof meta !== 'object') return { ok: false, message: 'meta object required' }
    const kind = String(meta.kind || '')
    if (kind === 'directions') {
      // explorer 写好了方向定义：更新 dirState 元数据（id/title/存活率/状态）
      const qid = String(meta.qid || '')
      if (qid && Array.isArray(meta.directions)) {
        // 重派生替换方向前：把旧方向的 journal 归档到日志（与旧 JSON handleExplorer 一致）
        const oldDirs = dirState.get(qid)
        if (oldDirs && oldDirs.length > 0) await archiveDirections(qid, oldDirs)
        const list = (meta.directions || []).map(function (d) {
          const old = (getDirState(qid) || []).find(function (x) { return x.id === d.id })
          return { id: d.id || ('d_' + shortId()), title: d.title || '', method: d.method || old?.method || '', core_assumption: d.core_assumption || old?.core_assumption || '', feasibility: clamp01(d.feasibility != null ? d.feasibility : (old ? old.survival : 0.5)), status: 'active', round: old ? old.round : 0, survival: clamp01(d.survival != null ? d.survival : (d.feasibility != null ? d.feasibility : (old ? old.survival : 0.5))), routes: old?.routes || [], lessons: old?.lessons || [], blockers: old?.blockers || [], lemmas: old?.lemmas || [], journal: old?.journal || [], dead_end_reason: '' }
        })
        dirState.set(qid, list)
        await saveDirState(); await writeJournal(qid)
        await consumeMethodFeedback(meta, { qid: qid })
        // 重置重派生计数：这是**文档规定的正常返回路径**（explorer 直接写 md + sync_meta
        // kind:'directions'），而 handleExplorer 里那处 `explorerRetries[qid]=0` 位于
        // "新协议分支"的 early return 之后，正常路径永远走不到它。若不在这里重置，计数只增不减，
        // 一旦达到 maxExplorerRetries(默认 3)，hasSchedulableWork/validatePlan 会永久拒绝该问题
        // 重派生，checkTermination 随即判为 stalled —— 实现方案里"方向耗尽后重新派生"的恢复路径
        // 就此死掉，即使后来出现了新的可行方向。
        explorerRetries[qid] = 0
        logActivity('explorer', 'problem ' + qid + ' → ' + list.length + ' directions (meta sync)')
      }
      await saveAll()
      return { ok: true }
    }
    if (kind === 'solver') {
      const qid = String(meta.qid || ''); const dirId = String(meta.dirId || '')
      const q = problems.get(qid)
      const dirs = getDirState(qid)
      const dir = dirs.find(function (d) { return d.id === dirId })
      if (q && dir) {
        if (typeof meta.survival === 'number') dir.survival = clamp01(meta.survival)
        if (meta.status) {
          // 只有 success/dead-end 是方向的调度终态；'continue' 表示方向仍可续轮，必须保持 active，
          // 否则 validatePlan / hasSchedulableWork / fallbackScheduler 只认 'active' 会漏调度 → 方向永久卡死。
          const st = String(meta.status)
          if (st === 'success' || st === 'dead-end') dir.status = st
        }
        if (meta.dead_end_reason) dir.dead_end_reason = String(meta.dead_end_reason)
        if (meta.round) dir.round = Number(meta.round)
        // 轮次上限：达到 solverMaxRounds 且仍未成功/死路 → 强制死路（新协议路径没有 followup 自迭代，必须靠此收口，与旧路径一致）
        if ((dir.round || 0) >= (Number(params.solverMaxRounds) || 3) && dir.status !== 'success' && dir.status !== 'dead-end') {
          dir.status = 'dead-end'
          dir.dead_end_reason = dir.dead_end_reason || ('迭代轮限到达（solverMaxRounds=' + params.solverMaxRounds + '）')
        }
        // 引理注册（id 由代理在命题卡里自定）
        if (Array.isArray(meta.lemmas)) {
          for (const l of meta.lemmas) {
            if (!l || (!l.id && !l.title)) continue
            // M9：代理给的 id 可能与文件名归一化结果不同（`p-1/2` → `p-1-2`）⇒ 键与 id 一并归一化。
            const pid = l.id ? idSafe(l.id) : ('p-' + shortId())
            if (!propos.has(pid)) {
              const lProb = lemmaProb(l)
              const pn = { id: pid, 标题: l.title || pid, 状态: '未定论', 概率: clamp01(lProb != null ? lProb : 0.6), 优先级: l.优先级 != null ? l.优先级 : 1, 依赖: [], 价值关键性: clamp01(l['价值/关键性'] != null ? l['价值/关键性'] : 0.5), 分类: lemmaCategory(l) || '未分类', 陈述: l.statement || l.title || '', proofs: [], refutes: [], 来源问题: qid, 在问题清单: false }
              // 引理证明文本（验证必需）由代理在 sync_meta 的 l.proof 上报（结构化，非长叙述）；无则验证器只能验裸命题
              if (l.proof) { pn.proofs = [{ title: (l.title || pid) + '（证明）', prob: clamp01(lProb != null ? lProb : 0.7), status: '未定论', text: String(l.proof) }] }
              propos.set(pid, pn)
              // 若代理已直接写了该命题卡，保留其内容（不覆盖）；否则写一张标准卡兜底（保证可被索引/验证）
              const rel = propositionRel(pn) // 与 saveProposition 同一路径
              if ((await readText(rel)) === undefined) await saveProposition(pn)
            }
            if (!(dir.lemmas || []).some(function (x) { return x.id === pid })) { dir.lemmas = dir.lemmas || []; dir.lemmas.push({ id: pid, title: l.title || pid }) }
          }
        }
        // 解法上报（prob 由代理写进 Problems/<qid>.md；这里只登记）。
        // M11：提示词教的是 `solution_text` / `solution_prob`，但遗留扁平通道用的是
        // `parsed.solution` / `parsed.solution_probability`。**两套拼写都接受**，否则一个
        // 严格按提示词回 `solution_text` 的 solver 会在这里被判成"声称成功却没有解法"，方向被写死。
        const solText = (meta.solution_text != null) ? meta.solution_text : meta.solution
        const solProb = (meta.solution_prob != null) ? meta.solution_prob : meta.solution_probability
        if (solProb != null && solText) {
          q.solutions = q.solutions || []
          const p = clamp01(solProb)
          q.solutions.push({ title: '解法 ' + (q.solutions.length + 1), prob: p >= 1 ? 0.99 : (p <= 0 ? 0.01 : p), status: '未定论', text: String(solText).slice(0, 2000) })
        }
        // 子问题/临时假设（与旧 JSON 路径一致）：注册 q_sub 问题 + 判断问题 + p-tmp 假设
        if (Array.isArray(meta.sub_questions)) {
          for (const sq of meta.sub_questions) {
            if (!sq || !sq.q_sub_statement) continue
            const rec = await addSubQuestion(qid, dirId, sq)
            if (rec) { dir.sub_questions = dir.sub_questions || []; dir.sub_questions.push(rec) }
          }
        }
        await saveProblem(q); await saveDirState(); await writeJournal(qid)
        await consumeMethodFeedback(meta, { qid: qid, dirId: dirId })
        logActivity('solver', qid + '/' + dirId + ' meta sync (status=' + (meta.status || '') + ', survival=' + dir.survival + ')')
      }
      await saveAll()
      return { ok: true }
    }
    if (kind === 'methods') {
      if (Array.isArray(meta.used)) for (const mu of meta.used) await consumeMethodFeedback({ methods_used: mu ? [mu] : [] }, { qid: '', dirId: '' })
      if (Array.isArray(meta.created)) for (const rawMid of meta.created) {
        const mid = idSafe(rawMid) // M9：键、id 与文件名同一把归一化
        if (!methods.has(mid)) {
          const mm = { id: mid, 标题: mid, 类型: '方法', 状态: '经验', 可信断言: [], 上级体系: [], 子方法: [], 相关: [], 适用场景: '', 核心内容: '', 定义与记号: '', applications: [], improvements: [], 来源: 'agent-written' }
          methods.set(mid, mm)
          // 若代理已直接写了方法卡文件则保留其内容；否则写一张标准卡兜底
          if ((await readText(methodRel(mm, false))) === undefined) await saveMethod(mm, false)
        }
      }
      // 改进：把内容写进已有方法卡的 ## 改进历史（与旧 JSON 路径一致）
      if (Array.isArray(meta.improvements)) {
        for (const imp of meta.improvements) {
          if (!imp || !imp.id) continue
          const impId = idSafe(imp.id) // M9：方法键已归一化，改进目标必须查同一把键
          const m = methods.get(impId)
          if (!m) { logActivity('method', 'improvement referenced unknown method ' + impId); continue }
          m.improvements = m.improvements || []
          m.improvements.push({ v: m.improvements.length + 1, 原因: imp.原因 || '', text: imp.改进内容 || '' })
          await saveMethod(m, false)
          logActivity('method', 'method ' + impId + ' improved (v' + m.improvements.length + ')')
        }
      }
      await saveAll()
      return { ok: true }
    }
    return { ok: false, message: 'unknown meta kind: ' + kind }
  }

  // ---- 会话级 handler 表的工具描述（唯一来源）----
  //
  // 提示词审计 M3（v3）：同一批工具在**两条注册路径**上各写了一份 description——会话 handler 表
  // （registerTool(name, description, …) 只存 handler）与文件末尾真正的 `tools.register`
  // （模型实际看到的那一份）。两边的**参数 schema 一致**（I13/I14 守），但描述会漂移：
  // `vibe_math_list_propositions` / `vibe_math_method_list` / `claim_write` / `release_write` /
  // `sync_meta` 五处曾对不上，模型看到哪一版取决于哪条路径生效。
  //
  // 现在这两条路径共用**模块级**常量 TOOL_DESC（定义在文件末尾的 shared helpers 区），
  // 任何一侧被改都会同时生效，不可能再漂移。`tests/audit-v3-registration-parity.mjs` 守这条不变式。

  // ================= slash command /vibe =================
  // 注意：签名**必须**保持 `dispatchVibeCommand(cmd, args)`——`audit-persona-surface` 的
  // `commandRegion()` 靠这个字面量把 /vibe 的分支表接进提示词面一致性检查（hint/usage/handler
  // 三处必须一致）。多一个形参会让那段源码不再被扫到，等于把这条守卫静默关掉。
  // `override` 通过 args 本身传递（见下面 commands.register 的处理）。
  async function dispatchVibeCommand(cmd, args) {
    const override = args.indexOf('override') !== -1
    if (cmd === 'start') return await startScheduler(override)
    if (cmd === 'resume') return await resumeScheduler(override)
    if (cmd === 'pause') return await pauseScheduler()
    if (cmd === 'abort') return await abortScheduler()
    if (cmd === 'status') { await refreshParams(); return await getStatus() }
    if (cmd === 'report') { await refreshParams(); await maybeWriteReport(true); return await buildReport() }
    if (cmd === 'mode') { params.mode = (args[0] === 'manual') ? 'manual' : 'auto'; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } }
    if (cmd === 'setup') { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } }
    if (cmd === 'save') return await saveSettings()
    if (cmd === 'template') return await createTemplate(args[0] === 'project' ? 'project' : 'global')
    if (cmd === 'add') { const raw = args[0]; const desc = args.slice(1).join(' '); if (!raw || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; const id = idSafe(raw); if (problems.has(id)) return { ok: false, message: 'problem id already exists' }; problems.set(id, { id: id, 标题: id, 状态: '求解中', 优先级: 0, 依赖: [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: desc, 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(id)); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: problemRel(problems.get(id)) } }
    if (cmd === 'add-proposition') { const raw = args[0]; const desc = args.slice(1).join(' '); if (!raw || !desc) return { ok: false, message: 'usage: /vibe add-proposition <id> <概述>' }; const id = idSafe(raw); const p1c = propositionIdConflict(id); if (p1c) { logActivity('proposition', '拒绝覆盖已有命题：' + id); return Object.assign({ ok: false }, p1c) } const p = { id: id, 标题: id, 状态: '未定论', 概率: 0.5, 优先级: 1, 依赖: [], 价值关键性: 0.5, 分类: '未分类', 陈述: desc, proofs: [], refutes: [], 来源问题: '', 在问题清单: false }; propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: propositionRel(p) } }
    if (cmd === 'list-propositions') { const all = allPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 标题: p.标题, 概率: p.概率, 状态: p.状态, 优先级: p.优先级, 分类: categoryOf(p) } }) } }
    if (cmd === 'methods') { const all = Array.from(methods.values()); return { ok: true, count: all.length, methods: all.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态 } }) } }
    if (cmd === 'index') { await loadKnowledgeBase(); return await rebuildIndex() }
    if (cmd === 'plan') { return { ok: true, queued: planQueue, lastPlan: lastPlanSummary } }
    if (cmd === 'lock') { return { ok: true, project: currentProject, lock: projectLock } }
    if (cmd === 'project') {
      if (args.length === 0 || args[0] === 'list') return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') }
      if (args[0] === 'new') return await setProject(slugify(args.slice(1).join(' ')), true)
      return await setProject(slugify(args[0]), false)
    }
    if (cmd === 'decisions') return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) }
    if (cmd === 'agents') { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round }) } return { ok: true, agents: out } }
    if (cmd === 'paper') return await paperCommand(args)
    return { ok: false, usage: 'start [override] | resume [override] | pause | abort | status | report | mode <auto|manual> | setup | save | template [global|project] | add <id> <desc> | add-proposition <id> <概述> | list-propositions | methods | index | plan | lock | project [list|new <name>|<name>] | decisions | agents | paper [lang=zh|en] [format=both|md|tex] [force]', message: 'unknown /vibe subcommand: ' + (cmd || '(empty)') }
  }

  // ================= session surface =================
  return {
    sessionId: sessionId,
    // 这两个必须是**取值器**而不是快照：`scheduler` 会在 loadState/setProject 里被整体重新赋值，
    // 而 `tickInFlight` 每次 tick 都会翻转。快照会让 apply 级的定时器守卫（见文件末尾
    // `!s.tickInFlight && s.scheduler.gate === null`）永远读到最初的值——那个守卫就再也拦不住
    // 任何东西（tick() 内部还有一道实时守卫，所以此前没有可观测后果，但那是巧合而非设计）。
    get scheduler() { return scheduler },
    get tickInFlight() { return tickInFlight },
    scheduleTick: scheduleTick,
    // Lease renewal for the apply-scope interval (see the ctx.effect below). Kept on the session so
    // the timer needs no per-session context, and so a mock host WITHOUT ctx.timeout still renews.
    renewLockIfDue: async function () { await renewProjectLock(); await renewFileLocks() },
    onChildEnd: onChildEnd,
    dispatchVibeCommand: dispatchVibeCommand,
    handlers: handlers,
    refreshProject: async function () { if (rootAgent) currentProject = await readCurrentProject() },
    getRunning: function () { return scheduler.running },
    // apply 级心跳用（修订 §A2）：running=false 之后 scheduleTick() 是空操作，论文的排队重试
    // （激活上限）与 paper 锁续租必须由**独立于调度器**的心跳驱动。
    paperRetryDue: paperRetryDue,
    runPaperRetry: runPaperRetry,
    // Lean 异步队列（spec §2）：心跳推进队列；dispose 由 apply 级 disposer 调用（不留孤儿进程）。
    runLeanQueue: runLeanQueue,
    disposeLeanJobs: disposeLeanJobs,
    leanQueueSize: function () { return leanQueue.length },
    leanJobsPublic: function () { const out = []; for (const j of leanJobs.values()) out.push(leanJobPublic(j)); return out },
    // 数学计算（FREEZE §4）：心跳用 TTL 刷新探测缓存；off 档不探测（真 no-op）。
    mathProbeDue: mathProbeDue,
    refreshMathProbe: refreshMathProbe,
    mathProbe: function () { return mathProbe },
    // childOwner 裁剪用（审计 L1）：这个会话当前仍"可能再发 subagent/end"的 child
    // = 在册子代理 + 任何任务正在等的那几个。
    referencedChildIds: function () {
      const out = Object.keys(agentRegistry)
      const ids = Object.keys(tasks)
      for (let i = 0; i < ids.length; i++) {
        const t = tasks[ids[i]]
        if (t && Array.isArray(t.children)) for (let j = 0; j < t.children.length; j++) out.push(t.children[j])
      }
      return out
    },
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
  registerTool('vibe_math_start', TOOL_DESC.vibe_math_start, objParams({ override: { type: 'boolean' } }), 'vibe_math_start')
  registerTool('vibe_math_resume', TOOL_DESC.vibe_math_resume, objParams({ override: { type: 'boolean' } }), 'vibe_math_resume')
  registerTool('vibe_math_pause', TOOL_DESC.vibe_math_pause, objParams({}), 'vibe_math_pause')
  registerTool('vibe_math_abort', TOOL_DESC.vibe_math_abort, objParams({}), 'vibe_math_abort')
  registerTool('vibe_math_status', TOOL_DESC.vibe_math_status, objParams({}), 'vibe_math_status')
  registerTool('vibe_math_report', TOOL_DESC.vibe_math_report, objParams({}), 'vibe_math_report')
  registerTool('vibe_math_set_mode', TOOL_DESC.vibe_math_set_mode, objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), 'vibe_math_set_mode')
  registerTool('vibe_math_set_params', TOOL_DESC.vibe_math_set_params, objParams({ mode: { type: 'string', enum: ['manual', 'auto'] }, maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' }, leanAsync: { type: 'boolean' }, leanJobsMaxParallel: { type: 'integer' }, leanInitiative: { type: 'string', enum: ['off', 'normal', 'eager'] }, leanSearchPaths: { type: 'array', items: { type: 'string' } }, mathComputation: { type: 'string', enum: ['off', 'auto', 'on'] }, mathMode: { type: 'string', enum: ['typed', 'typed+shell'] }, mathEngines: { type: 'array', items: { type: 'string' } }, mathTimeoutMs: { type: 'integer' }, mathPackages: { type: 'array', items: { type: 'string' } }, mathInstallScope: { type: 'string', enum: ['user', 'system'] }, finalPaper: { type: 'boolean' }, paperFormat: { type: 'string', enum: ['both', 'md', 'tex'] }, paperLanguage: { type: 'string', enum: ['zh', 'en'] }, paperCompilePdf: { type: 'boolean' }, paperLatexCommand: { type: 'string' } }), 'vibe_math_set_params')
  registerTool('vibe_math_setup', TOOL_DESC.vibe_math_setup, objParams({}), 'vibe_math_setup')
  registerTool('vibe_math_save_settings', TOOL_DESC.vibe_math_save_settings, objParams({}), 'vibe_math_save_settings')
  registerTool('vibe_math_template', TOOL_DESC.vibe_math_template, objParams({ where: { type: 'string', enum: ['global', 'project'] } }), 'vibe_math_template')
  registerTool('vibe_math_add_problem', TOOL_DESC.vibe_math_add_problem, objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' }, dependencies: { type: 'array', items: { type: 'string' } } }, ['id', 'description']), 'vibe_math_add_problem')
  registerTool('vibe_math_add_proposition', TOOL_DESC.vibe_math_add_proposition, objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 概率: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 分类: { type: 'string' }, 来源问题: { type: 'string' }, 来源方向: { type: 'string' } }, ['id', '概述']), 'vibe_math_add_proposition')
  registerTool('vibe_math_list_propositions', TOOL_DESC.vibe_math_list_propositions, objParams({}), 'vibe_math_list_propositions')
  registerTool('vibe_math_new_project', TOOL_DESC.vibe_math_new_project, objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_new_project')
  registerTool('vibe_math_set_project', TOOL_DESC.vibe_math_set_project, objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_set_project')
  registerTool('vibe_math_list_projects', TOOL_DESC.vibe_math_list_projects, objParams({}), 'vibe_math_list_projects')
  registerTool('vibe_math_list_decisions', TOOL_DESC.vibe_math_list_decisions, objParams({}), 'vibe_math_list_decisions')
  registerTool('vibe_math_decide', TOOL_DESC.vibe_math_decide, objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), 'vibe_math_decide')
  registerTool('vibe_math_list_agents', TOOL_DESC.vibe_math_list_agents, objParams({}), 'vibe_math_list_agents')
  registerTool('vibe_math_message_agent', TOOL_DESC.vibe_math_message_agent, objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), 'vibe_math_message_agent')
  registerTool('vibe_math_interrupt_agent', TOOL_DESC.vibe_math_interrupt_agent, objParams({ childId: { type: 'string' } }, ['childId']), 'vibe_math_interrupt_agent')
  registerTool('vibe_math_plan', TOOL_DESC.vibe_math_plan, objParams({ force: { type: 'boolean' } }), 'vibe_math_plan')
  registerTool('vibe_math_index', TOOL_DESC.vibe_math_index, objParams({}), 'vibe_math_index')
  registerTool('vibe_math_method_add', TOOL_DESC.vibe_math_method_add, objParams({ id: { type: 'string' }, 标题: { type: 'string' }, 类型: { type: 'string' }, 核心内容: { type: 'string' }, 适用场景: { type: 'string' } }, ['id', '标题']), 'vibe_math_method_add')
  registerTool('vibe_math_method_list', TOOL_DESC.vibe_math_method_list, objParams({}), 'vibe_math_method_list')
  registerTool('vibe_math_lock_status', TOOL_DESC.vibe_math_lock_status, objParams({}), 'vibe_math_lock_status')
  registerTool('vibe_math_claim_write', TOOL_DESC.vibe_math_claim_write, objParams({ target: { type: 'string' } }, ['target']), 'vibe_math_claim_write')
  registerTool('vibe_math_release_write', TOOL_DESC.vibe_math_release_write, objParams({ target: { type: 'string' } }, ['target']), 'vibe_math_release_write')
  registerTool('vibe_math_sync_meta', TOOL_DESC.vibe_math_sync_meta, objParams({ meta: { type: 'object' } }, ['meta']), 'vibe_math_sync_meta')
  // Lean 形式化验证（docs/formal-verification.md）：三个工具**无条件注册**——注册是静态的，
  // 模式只决定框架是否主动告诉代理它们存在。off 模式下人/代理主动调用时照常工作。
  registerTool('vibe_math_lean_run', TOOL_DESC.vibe_math_lean_run, objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), 'vibe_math_lean_run')
  registerTool('vibe_math_lean_archive', TOOL_DESC.vibe_math_lean_archive, objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), 'vibe_math_lean_archive')
  registerTool('vibe_math_lean_lib', TOOL_DESC.vibe_math_lean_lib, objParams({ refresh: { type: 'boolean' } }), 'vibe_math_lean_lib')
  registerTool('vibe_math_lean_read', TOOL_DESC.vibe_math_lean_read, objParams({ name: { type: 'string' }, kind: { type: 'string', enum: ['auto', 'lib', 'proved'] } }, ['name']), 'vibe_math_lean_read')
  registerTool('vibe_math_lean_job', TOOL_DESC.vibe_math_lean_job, objParams({ jobId: { type: 'string' }, waitMs: { type: 'integer' } }), 'vibe_math_lean_job')

  // ── math_computation：apply 层（工具面）────────────────────────────────────────────────────
  // 共享模块的 handler 在**会话层**构造（闭包住该会话的 params/Paths/fs）；这一层只把工具名/描述/schema
  // 挂到宿主工具面，执行时由 apply 级包装按 handlerName 路由回 s.handlers['math_computation']。
  // **字面量形态**（与 audit-v3-registration-parity.mjs 的扫描器约定一致）：名字字面量 +
  // TOOL_DESC.math_computation + MATH_TOOL_SCHEMA，两条路径的描述/schema 因此逐字相同。
  registerTool('math_computation', TOOL_DESC.math_computation, MATH_TOOL_SCHEMA, 'math_computation')

  // /vibe slash command (registered once; routed per session)
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math V3 solver (start/pause/projects/setup/save/decisions/agents/methods/index/plan/lock)',
    input: { hint: '[start [override]|resume [override]|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|methods|index|plan|lock|project [list|new <name>|<name>]|decisions|agents|paper [lang=zh|en] [format=both|md|tex] [force]]' },
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
    // 记下最近一次 end 的时间：childOwner 的宽限期从这里算（见 pruneChildOwner）。
    lastChildEndAt.set(info.id, now())
    const sid = childOwner.get(info.id)
    const s = sid !== undefined ? sessions.get(sid) : undefined
    if (s) s.onChildEnd(info).catch(function (e) { console.error('vibe-math-v3 onChildEnd reject: ' + String((e && e.stack) || e)) })
    // 注意：这里**不要**立即回收 childOwner 条目（与 v2 同一结论）。该映射在子代理 end 之后仍会
    // 被后续事件路由用到；在 v2 上实测过"事件回调里回收"与"onChildEnd 末尾回收"两种写法，
    // 都会让 verdict 收口失效。回收交给引用 + 宽限期的 pruneChildOwner（审计 L1）。
  })

  // Project-lock LEASE renewal timer (Round C, HIGH): renewal must NOT live in tick().
  //
  // Round A put `await renewProjectLock()` at the top of tick(), which left the lease starvable: a
  // single tick whose awaited work outlives projectLockTimeoutMs (one slow shell/Lean call is enough)
  // keeps the on-disk `at` stale, and the `if (tickInFlight) return` early-return (:1374) renews
  // nothing either, so a second session's acquireProjectLock() saw `age >= timeout` and took the
  // project lock WITHOUT `override` while this session was alive and mid-tick. Measured: 5803 ms of
  // stale lease against a 2500 ms timeout (probe _oneoff/rb-probe-v3-locklease.mjs).
  //
  // An independent interval cannot be delayed by tick duration, tick overlap or a held gate. It is
  // registered once per preset via ctx.effect (disposed with the plugin) — NOT per startScheduler —
  // so an `await` inside its callback cannot race plugin disposal, and the scheduler stays mockable
  // (tests/selfdrive-v3.mjs has no ctx.timeout). The poll runs many times inside one lease window,
  // so the lease can never approach expiry however long a single tick runs; renewProjectLock() itself
  // is still the throttled writer and keeps its `scheduler.running` / ownership guards, which preserves
  // the crash-recovery path exactly: a dead process stops renewing, its lease ages out, and only then
  // may a new session take it over.
  // 心跳定时器（每个宿主一次，随插件 fiber 释放）。
  //
  // L7：优先用**宿主的 timer 服务**（`ctx.interval`，随宿主暂停/记账、随 fiber 释放），
  // 只有在宿主没有该服务时（测试 mock / 旧线）才回落到裸 setInterval——回落是必需的：
  // `inject` 里没有 'timer'（加进去会让缺该服务的主机整个不激活），而 mock 宿主没有 ctx.interval。
  // 两种实现都返回 disposer，ctx.effect 的清理语义不变。
  function everyMs(ms, fn) {
    try { if (typeof ctx.interval === 'function') return ctx.interval(fn, ms) } catch (e) { /* 回落到 setInterval */ }
    const t = setInterval(fn, ms)
    return () => {
      clearInterval(t)
      // 卸载/销毁：终止在跑的编译并标记 interrupted（不留孤儿进程，spec §2.5）。
      for (const s of sessions.values()) {
        try { if (typeof s.disposeLeanJobs === 'function') s.disposeLeanJobs() } catch (e) { console.error('vibe-math-v3: lean dispose failed: ' + String((e && e.message) || e)) }
      }
    }
  }
  ctx.effect(() => everyMs(LOCK_POLL_MS, function () { for (const s of sessions.values()) { s.renewLockIfDue().catch(function (e) { console.error('vibe-math-v3 lock renew error: ' + String((e && e.message) || e)) }) } }))
  // tick timer (registered once; ticks every running session at its own pace)
  ctx.effect(() => {
    let beat = 0
    return everyMs(1000, function () {
      for (const s of sessions.values()) {
        if (s.getRunning() && !s.tickInFlight && s.tickDue() && s.scheduler.gate === null) s.scheduleTick()
        // 论文心跳（修订 §A2）：**独立于 scheduler.running** —— 收口后 running=false，但被激活上限
        // 拒绝的撰写派遣仍要重试，在途时还要续租 paper 锁。runPaperRetry() 无事可做时立即返回。
        if (typeof s.runPaperRetry === 'function') s.runPaperRetry().catch(function (e) { console.error('vibe-math-v3: paper retry failed: ' + String((e && e.message) || e)) })
        // Lean 异步队列（spec §2.2）：独立于 scheduler.running；runLeanQueue() 内部不 await 编译。
        if (typeof s.runLeanQueue === 'function') s.runLeanQueue().catch(function (e) { console.error('vibe-math-v3: lean queue failed: ' + String((e && e.message) || e)) })
        // 数学计算的探测缓存 TTL 刷新（15 分钟或从未探测过）：mathWorkLine 只读缓存，不能自己 await。
        if (typeof s.mathProbeDue === 'function' && s.mathProbeDue()) s.refreshMathProbe(false).catch(function (e) { console.error('vibe-math-v3: math probe failed: ' + String((e && e.message) || e)) })
      }
      // childOwner 裁剪（审计 L1）：每 30 拍（约 30s）一次，成本是"会话数 × 映射数"的一次扫描。
      if ((++beat % 30) === 0) {
        try { pruneChildOwner() } catch (e) { console.error('vibe-math-v3: pruneChildOwner failed: ' + String((e && e.message) || e)) }
      }
    })
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
// 最终论文（规格：docs/final-paper.md）—— **纯函数部分**（module scope；
// 与 v2 逐字同构，只有数据来源不同）。会话相关的落盘/派遣/编译在 makeSession 里。
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
/** 材料摘要（只作记录；幂等判定用 run id + finalizedAt + 逐产物存在性，修订 §C）。 */
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
/** 行内 md → tex：``code`` / **bold** / *em* 转成命令，其余按 spec §5 转义；`$...$` 原样保留。 */
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
/** 修复阶段的**最小模板**（spec §5）：只留 documentclass + 正文。 */
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
/** 把「论文撰写」子代理的回复映射到 9 节骨架上（**绝不编造**：缺的节由调用方填占位说明）。 */
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
function paperDirId(raw) { return (idSafe(String(raw == null ? '' : raw).trim()) || 'run') }
/** 从回复里抽出可能存在的标题行（md 非契约路径的兜底）。 */
function paperTitleFromMd(md) {
  const m = /^#\s+(.*?)\s*$/m.exec(String(md == null ? '' : md))
  return m ? m[1].trim() : ''
}

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
  fmtTime,
  slugify,
  safeId,
  idSafe,
  blocksToText,
  parseJson,
  safeJson,
  stripJsonComments,
  splitHeader,
  parseAnchors,
  parseEntries,
  section,
  parseBodySections,
  findSectionHeads,
  escField,
  unescField,
  entryRe,
  probText,
  extraBodySections,
  parseAppTitle,
  parseMethodMd,
  sanitizeToolFilter,
  registeredToolsFromError,
  LEAN_INITIATIVE_MODES,
  leanJobSettledOk,
  leanJobId,
  leanJobFingerprint,
  leanBuildContext,
  leanContentSha,
  normalizeLeanText,
  leanSearchPathPlan,
  hasLeanSearchFlag,
  LEAN_SEARCH_PATH_FLAG,
  // final paper（spec §6 的纯函数守卫面；与 v2 同构）
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

/**
 * 工具描述的唯一来源（提示词审计 M3）：v3 的每个工具都在**两条路径**上注册——会话 handler 表
 * （makeSession 内只存 handler）与文件末尾真正生效的 `tools.register`。两条路径必须逐字一致，
 * 否则模型看到的描述取决于哪条路径生效，任何一侧被改都会静默改变提示词面。
 * 全部 33 个工具都从此表取描述；`tests/audit-v3-registration-parity.mjs` 逐字比对两条路径。
 */
const TOOL_DESC = {
  vibe_math_start: 'Start (or restart) the Vibe Math V3 scheduler for the current project. override=true forcibly takes over the project lock held by another session (only after you verified that session is gone).',
  vibe_math_resume: 'Resume the Vibe Math V3 scheduler after a checkpoint/restart. override=true forcibly takes over the project lock held by another session (only after you verified that session is gone).',
  vibe_math_pause: 'Pause the scheduler (in-flight children finish their current turn).',
  vibe_math_abort: 'Abort the scheduler and interrupt all active children.',
  vibe_math_status: 'Show scheduler status, params, active agents, projects, and recent activity.',
  vibe_math_report: 'Return the full progress report and write it to Progress_Logs/report.json + Logs/报告.md.',
  vibe_math_set_mode: 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.',
  // set_params 的 schema 现在也收 mode（M10）：同一能力既有专用工具 vibe_math_set_mode，也可用这个键；
  // 两条注册路径共用这一份描述，`--self-probe` 会证明漂移能被抓到。
  vibe_math_set_params: 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象未达到 Lean 已通过或已记录显式阻塞原因之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式（框架会在用户 leanArgs 之后、文件名之前自动追加 --search-path <VibeMath 根>，用户已显式给出就不注入；leanSearchPaths 可附加额外搜索路径，先注入它们再注入自动根）；leanAsync = true（默认，后台队列：入队即返回，只有作业落地 ok 才置 passed 并写归档证明）| false（同步 await 的旧语义）；leanJobsMaxParallel = 后台编译并发上限（默认 1 = 串行）；leanInitiative = off|normal|eager 控制**日常的**形式化主动性（与 formalVerify 的验证要求强度是两件事）。最终论文：finalPaper（默认 true；收口时自动派遣一名「论文撰写」子代理）/ paperFormat = both|md|tex / paperLanguage = zh|en / paperCompilePdf（检测到 LaTeX 时编译 paper.pdf）/ paperLatexCommand（指定引擎，空 = 自动探测 xelatex→latexmk→pdflatex→lualatex→tectonic），产物在 Paper/<项目>/。数学计算（工具 math_computation，回执落在 Computation/<id>/）：mathComputation = off|auto|on（默认 auto；off 时提示词零提及）· mathMode = typed|typed+shell（默认 typed+shell；typed 时提示词不含 shell 兜底段且 cli 返回 REFUSED{reason:policy}）· mathEngines = 允许的引擎列表（默认含 cli，cli 默认开启）· mathTimeoutMs（默认 60000，最小 1000；到时主动 terminate）· mathPackages（需预检的包，缺包只报告+给安装计划）· mathInstallScope = user|system（默认 user；system 只对当次显式调用生效、永不记忆）。',
  vibe_math_setup: 'Return the interactive parameter schema for guided configuration.',
  vibe_math_save_settings: 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.',
  vibe_math_template: 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.',
  vibe_math_add_problem: 'Add a problem to the current project (creates Problems/<id>.md).',
  vibe_math_add_proposition: 'Add a NEW proposition to Propos/ (creates Propos/<分类>/<id>.md). The id must be NEW: an existing id is REFUSED with code PROPOSITION_ID_EXISTS (cards are never overwritten — 陈述/证明尝试/证伪尝试 are preserved); pick a fresh id (e.g. p-<8 hex>) or write into that card file directly.',
  vibe_math_list_propositions: 'List propositions from Propos/ (summary index: id, 标题, 概率, 状态, 优先级, 分类).',
  vibe_math_new_project: 'Create a new math project folder and switch to it.',
  vibe_math_set_project: 'Switch the current math project.',
  vibe_math_list_projects: 'List math projects.',
  vibe_math_list_decisions: 'List pending manual decisions.',
  vibe_math_decide: 'Resolve a pending manual decision (plan: approve|reject; verdict: override with verdict 1|0; spawn: approve|reject; method-promote: approve|reject).',
  vibe_math_list_agents: 'List tracked sub-agents (child sessions).',
  vibe_math_message_agent: 'Send a message to a tracked child agent (next turn).',
  vibe_math_interrupt_agent: 'Interrupt a tracked child agent.',
  vibe_math_plan: 'Show the queued plan / last plan result, or force a planning round.',
  vibe_math_index: 'Rebuild the machine index (State/index.json) from the Markdown knowledge base.',
  vibe_math_method_add: 'Manually add a method card to Methods/ (creates Methods/<id>.md).',
  vibe_math_method_list: 'List methods from Methods/ (+ global VibeMath/Methods/): id, 标题, 类型, 状态, 可信断言, applications count.',
  vibe_math_lock_status: 'Show the project lock occupancy.',
  vibe_math_claim_write: '(member) Acquire the write lock for one target file (relative to the project root). Call before writing a Markdown file directly; a file may only be written by ONE agent at a time. The lock is a LEASE: it is renewed automatically while you are still alive, so a long write keeps it; if your process disappears the lease expires after fileLockTimeoutMs (default 60000) and another agent may take it. Returns the display path you may write (VibeMath/Projects/<project>/<target>) and a hint.',
  vibe_math_release_write: '(member) Release the write lock for one target file (relative to the project root). Call after you finished writing it.',
  vibe_math_sync_meta: '(member) After you write content into Markdown files, report ONLY lightweight scheduling metadata to keep the scheduler state in sync (content stays in the md files). meta.kind must be one of:\n- "directions": {qid, directions:[{id,title,method,core_assumption,feasibility}], methods_used:[{id,效果,建议}], new_inventions:[{类型,标题,内容描述,是否已入库}]}\n- "solver": {qid, dirId, round, survival, status:"continue|success|dead-end", dead_end_reason, lemmas:[{id,title,statement,proof,prob,价值/关键性,分类,优先级}], methods_used, new_inventions, solution_prob, solution_text, sub_questions:[{q_sub_title,q_sub_statement,assumption_title,assumption_statement}]}\n- "methods": {used:[{id,效果,建议}], created:[ids], improvements:[{id,改进内容,原因}]}',
  vibe_math_lean_run: "(member) Execute the Lean toolchain on one .lean file inside the workspace and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.",
  vibe_math_lean_archive: '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (VibeMath/Formal/Lib). kind="lemma": a machine-checked lemma → VibeMath/Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).',
  vibe_math_lean_lib: "(member) List (and by default rebuild) the Lean reuse library: this project's Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining.",
  vibe_math_lean_read: '(member) Read back the original text of one archived Lean file (verbatim reuse). Only files under Formal/Lib and Formal/Proved are readable; name is id-sanitised and path escapes are rejected. Returns {ok,name,file,kind,sha256,bytes,text,truncated} (text capped at 64KB).',
  vibe_math_lean_job: '(member) Read-only view of the background Lean compile jobs. Without jobId: the session job list (state/rel/target/attempts/paths). With jobId: that job state/exitCode/receipt + archive paths. waitMs>0 waits up to that many ms for a queued/running job to settle (polling; it does not block the heartbeat) and returns the current state on timeout. Only state=settled with exitCode=0 (same content hash AND same build context) counts as passed.',
  // 数学计算：描述逐字来自共享模块的 MATH_TOOL_DESCRIPTION（四套一致，FREEZE §1）。
  math_computation: MATH_TOOL_DESCRIPTION,
}

function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }

/// P8：框架分配 id 时先查重（shortId 是 Math.random 的 8 位 hex，碰撞概率极低但后果是静默覆盖）。
function shortIdUnique(isTaken) {
  for (let i = 0; i < 8; i++) { const id = shortId(); if (!isTaken(id)) return id }
  return shortId()
}
function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }

function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }

/**
 * M11：同一个语义两套字段名。提示词教的是 `prob`（`lemmas[].prob`），而遗留扁平 JSON 通道
 * 用的是 `布尔估计`（`细类型` 同理）。这里统一取值顺序，两套拼写都接受，避免"按提示词回写的
 * 引理"被当成没有估计值。
 */
function lemmaProb(l) {
  if (l == null) return undefined
  if (l.prob != null) return l.prob
  if (l['布尔估计'] != null) return l['布尔估计']
  return undefined
}
function lemmaCategory(l) {
  if (l == null) return ''
  if (l['分类'] != null) return String(l['分类'])
  if (l['细类型'] != null) return String(Object.keys(l['细类型'] || { 未分类: {} })[0] || '未分类')
  return ''
}

function fmtTime(ts) { try { return new Date(ts || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return String(ts || '') } }

function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }

function safeId(s) { return String(s == null ? 'anon' : s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon' }

function idSafe(s) {
  const t = String(s == null ? '' : s).trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 80)
  return t || 'id'
}

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

function splitHeader(text) {
  const heads = findSectionHeads(text)
  const first = (heads.length > 0 && heads[0].from > 0) ? heads[0].from : -1
  const head = first === -1 ? String(text) : String(text).slice(0, first - 1)
  const body = first === -1 ? '' : String(text).slice(first)
  return { head: head, body: body }
}

/**
 * 顶层 `## ` 段落边界，**跳过围栏代码块**（审计 L4）。
 *
 * 此前 splitHeader / section / parseBodySections 都把正文里**任意** `## ` 行当段落边界。代理把
 * 引用或代码粘进「陈述」段时，围栏里的 `## ` 行会被当成新段落：那半段代码变成"额外的段"，
 * 下一次 compose 还会给它补一个 `## ` 标题（正文被改写、代码块被劈开）。围栏内的 `## ` 不是边界。
 */
function findSectionHeads(text) {
  const out = []
  const src = String(text == null ? '' : text)
  const lines = src.split('\n')
  let pos = 0, fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; pos += line.length + 1; continue }
    if (!fence) {
      const m = /^##\s+(.+?)\s*$/.exec(line)
      if (m) out.push({ name: m[1].trim(), from: pos, len: line.length })
    }
    pos += line.length + 1
  }
  return out
}

function parseAnchors(head) {
  const anchors = {}
  const re = /^-\s*([A-Za-z\u4e00-\u9fa5/]+)\s*:\s*(.*)$/gm
  let m
  while ((m = re.exec(head)) !== null) anchors[m[1].trim()] = m[2].trim()
  return anchors
}

/**
 * md 卡片是**逐行**格式：字段里出现换行会把标题行劈成两行（`parseAnchors` 的 `.*$` 与
 * `parseEntries` 的逐行扫描都不跨行），出现全角竖线 `｜` 则会让
 * `### 解法 N｜标题｜概率X｜状态Y` 的惰性匹配在**标题内部**提前切段（审计 L6）。
 * 约定：compose 侧转义 `\`、`｜` 与换行（`\n`），parse 侧还原 ⇒ 往返无损，且惰性匹配不可能切进字段。
 */
function escField(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/｜/g, '\\｜').replace(/\r?\n/g, '\\n') }
function unescField(v) {
  const s = String(v == null ? '' : v)
  if (s.indexOf('\\') === -1) return s
  return s.replace(/\\(.)/g, function (_m, c) { return c === 'n' ? '\n' : c })
}
// 字段体：接受 `\\.` 转义对，但不接受裸 `｜`/裸换行 ⇒ 惰性匹配只在真正的分隔符处停。
const ENTRY_FIELD = '(?:[^｜\\r\\n\\\\]|\\\\.)*?'
/**
 * 条目标题行正则。概率段用 `[-+0-9.eE]+` 而非 `[0-9.]+`（审计 L3）：指数记法（如 `概率5e-7`，
 * 来自 meta.solution_prob / l.prob 这类 ∈(0,1) 的数值）此前整条匹配失败，条目在重载后被静默丢弃。
 */
function entryRe(kind) { return new RegExp('^###\\s*' + kind + '\\s*\\d+｜(' + ENTRY_FIELD + ')｜概率([-+0-9.eE]+)｜状态(' + ENTRY_FIELD + ')$') }
/** 写出条目标题时的概率文本：非有限值（NaN/Infinity）绝不能写出去，否则那一行永远解析不回来。 */
function probText(v) { const n = Number(v); return Number.isFinite(n) ? String(n) : '0.5' }

function parseEntries(body, kindRe) {
  const out = []
  const lines = String(body).split('\n')
  let cur = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = kindRe.exec(line)
    if (m) {
      if (cur) out.push(cur)
      // 约定：m[1]=标题段，m[2]=概率段，m[3]=状态段（应用记录正则只有 m[1]）
      cur = { heading: line.trim(), title: (m[1] || '').trim(), prob: m[2] !== undefined ? Number(m[2]) : undefined, status: (m[3] || '').trim(), text: [] }
      continue
    }
    if (/^#{2,3}\s/.test(line)) {
      if (cur) { out.push(cur); cur = null }
      continue
    }
    if (cur) cur.text.push(line)
  }
  if (cur) out.push(cur)
  for (const e of out) e.text = e.text.join('\n').trim()
  return out
}

function section(body, name) {
  const text = String(body)
  const heads = findSectionHeads(text)
  let start = -1, end = -1
  for (let i = 0; i < heads.length; i++) {
    if (start === -1) { if (heads[i].name === name) start = heads[i].from + heads[i].len }
    else { end = heads[i].from; break }
  }
  if (start === -1) return ''
  return (end === -1 ? text.slice(start) : text.slice(start, end)).trim()
}

function parseBodySections(body) {
  const text = String(body || '')
  const heads = findSectionHeads(text)
  const found = []
  for (let i = 0; i < heads.length; i++) {
    const to = i + 1 < heads.length ? heads[i + 1].from : text.length
    found.push({ name: heads[i].name, from: heads[i].from, bodyFrom: heads[i].from + heads[i].len, text: text.slice(heads[i].from + heads[i].len, to).trim() })
  }
  return found
}

function extraBodySections(body, managedNames) {
  return parseBodySections(body)
    .filter(function (s) { return !managedNames.includes(s.name) })
    .map(function (s) { return { name: s.name, text: s.text } })
}

function parseAppTitle(title) {
  const t = String(title || '')
  // M7：字段名后**必须**有空白才取值为字段，且值里不许含分隔符 `｜`。
  // 旧写法 `/问题\s*(\S+)/` 在"问题为空、方向非空"时把分隔符也吃进去：
  // `应用 1｜<时间>｜问题 ｜方向 d1` → 问题='｜方向'（composeMethodMd 恰好会写出这种标题），
  // 下一次回写就把这个脏值固化进方法卡。
  const mQ = /(?:^|[\s｜])问题[ \t]+([^｜\s]+)/.exec(t)
  const mD = /(?:^|[\s｜])方向[ \t]+([^｜\s]+)/.exec(t)
  // `at` = 第一段（时间戳）。取第一个 '｜' 之前的部分。
  const at = t.split('｜')[0].trim()
  return { at: at, 问题: mQ ? mQ[1] : '', 方向: mD ? mD[1] : '' }
}

function parseMethodMd(id, text) {
  const { head, body } = splitHeader(text)
  const a = parseAnchors(head)
  const apps = parseEntries(body, /^###\s*应用\s*\d+｜(.*?)$/).map(function (e) {
    const t = parseAppTitle(e.title)
    return { at: t.at, 问题: t.问题, 方向: t.方向, text: e.text }
  })
  // 改进历史必须真正解析回来：此前硬编码 [] 导致每次 compose 都写成占位符，
  // 于是"下一次用到该方法"就把代理沉淀的改进历史静默销毁（违反「正文只追加，不覆盖」）。
  //
  // H3：原因必须从**标题行独立解析**，不能借道 parseEntries 的槽位。约定里 m[1]=标题段、
  // m[2]=概率段、m[3]=状态段，而改进标题 `### v3（<原因>）` 只有两个捕获组：m[2] 是原因、
  // m[3] 是 undefined ⇒ `e.status` 恒为 ''，每次回写都写成 `### v1（）`（原因永久丢失）。
  const improvements = parseEntries(body, /^###\s*v(\d+)\s*（(.*?)）\s*$/).map(function (e) {
    const m = /^###\s*v(\d+)\s*（(.*?)）\s*$/.exec(e.heading)
    return { v: m ? Number(m[1]) : 0, 原因: m ? m[2] : '', text: e.text }
  })
  return {
    id: id, 标题: a['标题'] || id, 类型: a['类型'] || '方法', 状态: a['状态'] || '经验',
    可信断言: safeJson(a['可信断言'], []), 上级体系: safeJson(a['上级体系'], []), 子方法: safeJson(a['子方法'], []), 相关: safeJson(a['相关'], []),
    适用场景: a['适用场景'] || '', 核心内容: section(body, '核心内容'), 定义与记号: section(body, '定义与记号'),
    applications: apps, improvements: improvements, 来源: a['来源'] || '',
    extraSections: extraBodySections(body, ['核心内容', '定义与记号', '应用记录', '改进历史']),
  }
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
