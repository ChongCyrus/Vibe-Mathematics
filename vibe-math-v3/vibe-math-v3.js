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
  const fileOwner = {} // 进程级写锁：fileKey -> { childId, sessionId, at } —— 防任何代理（跨会话）并发写同一 md 文件
  // Process epoch: PROCESS-level (one per apply, shared by every session), written to
  // State/process_epoch.json at init; a DIFFERENT persisted epoch means a previous DSH
  // process wrote this state (in-flight children are gone), while an equal epoch means
  // same-process pause→resume (children may still be alive). Kept at apply level so two
  // sessions in one process never treat each other as a stale previous process.
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
    solverMaxRounds: 3,           // per-direction iteration cap
    directionsPerSolver: 1,       // directions shown per solver prompt (1 = own only)
    verifierCount: 3,             // independent reviewers per verification
    debateMaxRounds: 5,           // debate round cap
    verdictMode: 'forced',        // flat = 均衡(0.5) | forced = 按历史准确率+严谨性加权；两者都先做近共识判定（同侧且均值≥0.85/≤0.15取均值）
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
    planMinIntervalMs: 30000,     // 两次规划调用的最小间隔（系统空闲且有工作时忽略）
    plannerMaxFails: 3,           // 规划代理连续失败达此值 → 自动降级启发式
    methodKeepIntervalMs: 0,      // Method Keeper 定时整理间隔（0 = 事件驱动）
    methodKeepEvery: 5,           // 每积累 N 个待沉淀发明/新命题触发一次整理
    methodAutoPromote: false,     // 项目级方法自动晋升全局库（false = 人工门）
    indexAutoRebuild: true,       // 每次写盘后自动重建索引（false = 手动 vibe_math_index）
    projectLockTimeoutMs: 60000,  // 项目锁等待超时
    // ---- Lean 形式化验证（契约：docs/formal-verification.md，四架构同名同语义）----
    formalVerify: 'off',          // off | encourage | require（三档开关，见 实现方案.md §10.1）
    leanCommand: 'lean',          // 要执行的 Lean 可执行文件（例：'lake'）
    leanArgs: [],                 // 插在文件名之前的附加参数（例：['env','lean'] 配 leanCommand='lake'）
    leanTimeoutMs: 120000,        // 单次 Lean 运行超时上限（毫秒，正整数）
  }
  let params = Object.assign({}, DEFAULT_PARAMS)
  let scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null } // activeCount 由 activeCount() 从 agentRegistry 推导（防漂移，同 v2）
  let agentRegistry = {}
  let decisionQueue = []
  let verifierAccuracy = {}
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
  function now() { return Date.now() }
  function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }
  function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }
  function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }
  function fmtTime(ts) { try { return new Date(ts || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return String(ts || '') } }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} const sp = sandboxPolicyOf(); if (sp && sp.workspaceRoot) return sp.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }
  function safeId(s) { return String(s == null ? 'anon' : s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon' }
  /**
   * 把模型/用户提供的对象 id 消毒成**单个安全文件名**。v4 已有等价的 idSafe（见
   * vibe-math-v4.js），v3 此前缺这一步：saveProblem/saveProposition/saveVerified 直接
   * 拼接原始 id，模型给出 `../../x` 之类就能把文件写出项目树（categoryOf 只删 `/`，不删 `..`）。
   * 这里替换路径分隔符与控制字符、折叠连续连字符，并剥掉首尾的点/连字符，
   * 保证结果永不为 `.` / `..`、也不含分隔符。
   */
  function idSafe(s) {
    const t = String(s == null ? '' : s).trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '')
      .slice(0, 80)
    return t || 'id'
  }
  let warnedNoPolicy = false
  function warnNoPolicyOnce() { if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v3: sandboxPolicy unavailable; writes go out with no explicit policy') } }
  // Sandbox fence for our own writes. The `resolve({})` fallback is a last resort and is
  // deliberately reported (once): with no session it resolves the policy's CONFIGURED root
  // (dsh-sandbox-policy: resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())),
  // which is not necessarily this session's workspace — a silently different fence.
  function getPolicy() { const sp = sandboxPolicyOf(); if (!sp) { warnNoPolicyOnce(); return undefined } try { if (rootAgent && rootAgent.session) return sp.resolve({ session: rootAgent.session }) } catch (e) { warnNoPolicyOnce() } try { const p = sp.resolve({}); if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v3: falling back to sandboxPolicy.resolve({}) — the fence root is the host-configured workspace, not necessarily this session cwd') } return p } catch (e) { warnNoPolicyOnce() } return undefined }
  function makeSignal(ms) { return AbortSignal.timeout(ms || 30000) }
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

  // ================= parameter schema =================
  const PARAM_SCHEMA = [
    { name: 'mode', type: 'enum', options: ['auto', 'manual'], description: 'auto = 无人值守自动通过关键节点；manual = 关键节点挂起人工决策', suggestion: 'auto' },
    { name: 'maxParallelThreshold', type: 'integer', description: '全局最大并发子代理轮数（新派发前须满足 active < 阈值）', suggestion: 4 },
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数', suggestion: 3 },
    { name: 'directionsPerSolver', type: 'integer', description: '每个 solver 提示词附带的其他活跃方向摘要数量：1 = 只看自己方向', suggestion: 1 },
    { name: 'verifierCount', type: 'integer', description: '每个验证对象的独立验证器数量', suggestion: 3 },
    { name: 'debateMaxRounds', type: 'integer', description: '验证辩论（交流群）最大轮数', suggestion: 5 },
    { name: 'verdictMode', type: 'enum', options: ['flat', 'forced'], description: '裁决模式：flat = 均衡机制；forced = 强制裁决（按历史准确率+严谨性加权）；两者都先做近共识判定（同侧且均值≥0.85/≤0.15取均值，修复 v2 flat 误判）', suggestion: 'forced' },
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
    { name: 'activityLogCap', type: 'integer', description: '活动日志保留条数', suggestion: 100 },
    { name: 'maxExplorerRetries', type: 'integer', description: 'explorer 拆方向失败的重派生上限', suggestion: 3 },
    { name: 'planningHorizon', type: 'integer', description: '规划代理一次计划的最多动作数（"接下来 n 次"）', suggestion: 3 },
    { name: 'plannerEnabled', type: 'boolean', description: 'false = 完全走内置启发式调度（规划代理禁用）', suggestion: true },
    { name: 'plannerProvider', type: 'string', description: '规划代理模型 provider（空 = 继承根代理）', suggestion: '' },
    { name: 'plannerModel', type: 'string', description: '规划代理模型 id（空 = 继承根代理）', suggestion: '' },
    { name: 'planMinIntervalMs', type: 'integer', description: '两次规划调用的最小间隔（毫秒）；系统空闲且有工作时忽略', suggestion: 30000 },
    { name: 'plannerMaxFails', type: 'integer', description: '规划代理连续失败达此值 → 自动降级启发式', suggestion: 3 },
    { name: 'methodKeepIntervalMs', type: 'integer', description: 'Method Keeper 定时整理间隔（0 = 事件驱动）', suggestion: 0 },
    { name: 'methodKeepEvery', type: 'integer', description: '每积累 N 个待沉淀发明/新命题触发一次整理', suggestion: 5 },
    { name: 'methodAutoPromote', type: 'boolean', description: '项目级方法自动晋升全局库（false = 人工门）', suggestion: false },
    { name: 'indexAutoRebuild', type: 'boolean', description: '每次写盘后自动重建索引（false = 手动 vibe_math_index）', suggestion: true },
    { name: 'projectLockTimeoutMs', type: 'integer', description: '项目锁等待超时（毫秒）', suggestion: 60000 },
    { name: 'formalVerify', type: 'enum', options: ['off', 'encourage', 'require'], description: 'Lean 形式化验证：off = 不额外要求（默认，提示词里不出现任何 Lean 内容）；encourage = 鼓励按实现难度形式化，Lean 通过后验证转为忠实性审查；require = 同上并加门禁：真/假定论必须先达到 Lean 已通过 或 已记录显式阻塞原因，否则记为未定论（formal-required）并进「形式化待办」', suggestion: 'off' },
    { name: 'leanCommand', type: 'string', description: 'Lean 可执行文件（例：lean / lake；配合 leanArgs=[env,lean] 用 lake）', suggestion: 'lean' },
    { name: 'leanArgs', type: 'string[]', description: '插在 .lean 文件名之前的附加参数', suggestion: [] },
    { name: 'leanTimeoutMs', type: 'integer', description: '单次 Lean 运行的超时上限（毫秒，非正数回退默认）', suggestion: 120000 },
  ]

  // ================= fs (adapted to DSH 0.1.1: resolve returns {targetKey, displayPath}) =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeText(rel, content) { const t = await fsTarget(rel); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true }
  async function writeJson(rel, obj) { if (!assertWritable(rel)) return false; return await writeText(rel, JSON.stringify(obj, null, 2)) }
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
  async function runShell(script, cwd) {
    const subprocess = subprocessOf()
    if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }
    try {
      const argv = isWindows()
        ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', script]
        : ['/bin/sh', '-c', script]
      const handle = subprocess.spawn({ argv: argv, cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 })
      const outcome = await handle.done
      return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode }
    } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }
  /**
   * 目录骨架。Lean 形式化（契约 §3）要求项目内 `Formal/`（形式化工作文件 + Index.md/TODO.md）
   * 与 `Verified/Lean/`（归档证明，与定论卡片同处 Verified/，一眼可见"这条结论的证明在哪"），
   * 以及**项目树之外**的全局可复用库 `<VibeMath 根>/Formal/{Lib,Proved}`（跨项目复用是核心收益）。
   */
  async function ensureDirs() { const base = frameworkRoot(); const dirs = ['Problems', 'Progress', 'Propos', 'Methods', 'Verified/命题', 'Verified/问题', 'Verified/Lean', 'Formal', 'Reliable', 'Notes', 'Logs/Verification', 'Logs/Plans', 'State']; const paths = [vibeRoot() + '/Projects', vibeRoot() + '/Methods', vibeRoot() + '/Formal/Lib', vibeRoot() + '/Formal/Proved'].concat(dirs.map(function (d) { return base + '/' + d })); return await runShell(mkdirCmd(paths)) }
  async function removeFile(rel) { const base = frameworkRoot(); return await runShell(rmCmd(base + '/' + rel)) }

  // ================= settings =================
  function sanitizeParams(obj) {
    const out = {}
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'directionsPerSolver', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs', 'tickIntervalMs', 'activityLogCap', 'maxExplorerRetries', 'planningHorizon', 'planMinIntervalMs', 'plannerMaxFails', 'methodKeepIntervalMs', 'methodKeepEvery', 'projectLockTimeoutMs']
    const numFields = ['promoteValueThreshold']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny', 'leanArgs']
    const boolFields = ['plannerEnabled', 'methodAutoPromote', 'indexAutoRebuild']
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
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
      else if (k === 'solverAllowNetwork' || k === 'verifierAllowNetwork' || k === 'solverAllowScripts' || k === 'verifierAllowScripts') { out[k] = (v === true || v === false || v === '') ? v : DEFAULT_PARAMS[k] }
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
  function splitHeader(text) {
    const idx = String(text).search(/\n## /)
    const head = idx === -1 ? String(text) : String(text).slice(0, idx)
    const body = idx === -1 ? '' : String(text).slice(idx + 1)
    return { head: head, body: body }
  }
  function parseAnchors(head) {
    const anchors = {}
    const re = /^-\s*([A-Za-z\u4e00-\u9fa5/]+)\s*:\s*(.*)$/gm
    let m
    while ((m = re.exec(head)) !== null) anchors[m[1].trim()] = m[2].trim()
    return anchors
  }
  function anchorLine(k, v) { return '- ' + k + ': ' + String(v == null ? '' : v) }
  // 解析条目标题行 + 其后正文，直到下一个 ### / ## 标题。返回 [{heading, text}]
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
    const re = new RegExp('^##\\s+' + name + '\\s*$', 'm')
    const m = re.exec(String(body))
    if (!m) return ''
    const rest = String(body).slice(m.index + m[0].length)
    const end = rest.search(/\n##\s/)
    return (end === -1 ? rest : rest.slice(0, end)).trim()
  }
  /**
   * 按顺序切出正文里的所有 `## ` 顶层段。用于"无损往返"：compose 只重新生成自己管理的
   * 那几段，其余段（例如 经验与教训、或代理自加的任何段）必须原样保留，否则每次调度器
   * 回写都会把代理写进卡片的内容抹掉（违反 实现方案.md「正文只追加，不覆盖」）。
   */
  function parseBodySections(body) {
    const text = String(body || '')
    const re = /^##\s+(.+?)\s*$/gm
    const found = []
    let m
    while ((m = re.exec(text)) !== null) found.push({ name: m[1].trim(), from: m.index, bodyFrom: m.index + m[0].length })
    for (let i = 0; i < found.length; i++) {
      const to = i + 1 < found.length ? found[i + 1].from : text.length
      found[i].text = text.slice(found[i].bodyFrom, to).trim()
    }
    return found
  }
  /** 未被 compose 接管的段：原样保留，避免回写时丢失。 */
  function extraBodySections(body, managedNames) {
    return parseBodySections(body)
      .filter(function (s) { return !managedNames.includes(s.name) })
      .map(function (s) { return { name: s.name, text: s.text } })
  }
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
      lines.push('### 解法 ' + (i + 1) + '｜' + (s.title || '解法' + (i + 1)) + '｜概率' + (s.prob != null ? s.prob : 0.5) + '｜状态' + (s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    return withExtraSections(lines, p.extraSections).join('\n').trimEnd() + '\n'
  }
  function parseProblemMd(id, text) {
    const { head, body } = splitHeader(text)
    const a = parseAnchors(head)
    const sols = parseEntries(body, /^###\s*解法\s*\d+｜(.*?)｜概率([0-9.]+)｜状态(.+)$/).map(function (e) { return { title: e.title, prob: clamp01(e.prob), status: e.status, text: e.text } })
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
      lines.push('### 证明 ' + (i + 1) + '｜' + (s.title || '证明' + (i + 1)) + '｜概率' + (s.prob != null ? s.prob : 0.5) + '｜状态' + (s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    lines.push('## 证伪尝试')
    const refutes = p.refutes || []
    if (refutes.length === 0) lines.push('（暂无证伪尝试）')
    else for (let i = 0; i < refutes.length; i++) {
      const s = refutes[i]
      lines.push('### 证伪 ' + (i + 1) + '｜' + (s.title || '证伪' + (i + 1)) + '｜概率' + (s.prob != null ? s.prob : 0.5) + '｜状态' + (s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
    return withExtraSections(lines, p.extraSections).join('\n').trimEnd() + '\n'
  }
  function parsePropositionMd(id, text) {
    const { head, body } = splitHeader(text)
    const a = parseAnchors(head)
    const proofs = parseEntries(body, /^###\s*证明\s*\d+｜(.*?)｜概率([0-9.]+)｜状态(.+)$/).map(function (e) { return { title: e.title, prob: clamp01(e.prob), status: e.status, text: e.text } })
    const refutes = parseEntries(body, /^###\s*证伪\s*\d+｜(.*?)｜概率([0-9.]+)｜状态(.+)$/).map(function (e) { return { title: e.title, prob: clamp01(e.prob), status: e.status, text: e.text } })
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
  function parseAppTitle(title) {
    const t = String(title || '')
    const mQ = /问题\s*(\S+)/.exec(t)
    const mD = /方向\s*(\S+)/.exec(t)
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
    const improvements = parseEntries(body, /^###\s*v(\d+)\s*（(.*?)）\s*$/).map(function (e) {
      return { v: Number(e.title) || 0, 原因: e.status || '', text: e.text }
    })
    return {
      id: id, 标题: a['标题'] || id, 类型: a['类型'] || '方法', 状态: a['状态'] || '经验',
      可信断言: safeJson(a['可信断言'], []), 上级体系: safeJson(a['上级体系'], []), 子方法: safeJson(a['子方法'], []), 相关: safeJson(a['相关'], []),
      适用场景: a['适用场景'] || '', 核心内容: section(body, '核心内容'), 定义与记号: section(body, '定义与记号'),
      applications: apps, improvements: improvements, 来源: a['来源'] || '',
      extraSections: extraBodySections(body, ['核心内容', '定义与记号', '应用记录', '改进历史']),
    }
  }

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
      for (const j of (d.journal || [])) {
        lines.push('')
        lines.push('### 第 ' + j.round + ' 轮｜' + (j.agent || '') + '｜' + (j.at || ''))
        lines.push(j.prose || '')
      }
      lines.push('')
    }
    await writeText('Progress/' + qid + '.md', lines.join('\n').trimEnd() + '\n')
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
  async function loadState() {
    const s = await readJson('State/scheduler_state.json')
    // 丢弃历史持久化的 activeCount：旧值可能已漂移，绝不能覆盖推导值。
    if (s) { const restored = Object.assign({}, s); delete restored.activeCount; scheduler = Object.assign({}, scheduler, restored) }
    const r = await readJson('State/agents.json'); if (r) agentRegistry = r
    const dq = await readJson('State/decision_queue.json'); if (dq) decisionQueue = dq
    const va = await readJson('State/verifier_accuracy.json'); if (va) verifierAccuracy = va
    const tk = await readJson('State/tasks.json'); if (tk) tasks = tk
    const er = await readJson('State/explorer_retries.json'); if (er) explorerRetries = er
    const pq = await readJson('State/plans.json'); if (pq && Array.isArray(pq.queued)) planQueue = pq.queued
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
  async function saveAll() {
    await writeJson('State/scheduler_state.json', scheduler)
    await writeJson('State/agents.json', agentRegistry)
    await writeJson('State/decision_queue.json', decisionQueue)
    await writeJson('State/verifier_accuracy.json', verifierAccuracy)
    await writeJson('State/tasks.json', tasks)
    await writeJson('State/explorer_retries.json', explorerRetries)
    await writeJson('State/plans.json', { queued: planQueue })
    await writeJson('State/method_log.json', methodLog)
    await writeJson('State/project_lock.json', projectLock)
    await writeJson('State/archived_journals.json', archivedJ)
    // 未启用且从未产生任何形式化记录时不落这份状态文件（off 保持真正的无操作）。
    if (formalOn() || Object.keys(formalState.records).length || formalState.todo.length || Object.keys(formalState.libRuns).length) await writeJson('State/formal.json', formalState)
    if (lastPlanSummary) await writeJson('State/last_plan.json', lastPlanSummary)
    scheduler.lastCheckpoint = now()
  }
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
      ok: true, at: now(), project: currentProject, frameworkRoot: frameworkRoot(),
      running: scheduler.running, mode: params.mode,
      activeCount: activeCount(), maxParallelThreshold: params.maxParallelThreshold,
      problems: { total: problems.size, solved: allProblems().filter(function (q) { return q.状态 === '已解决' }).length },
      propositions: { total: propos.size, resolved: allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length },
      verifyPending: (await buildVerifyCandidates()).length,
      methods: { project: methods.size, global: globalMethods.size, pendingInventions: methodLog.pendingInventions.length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      registeredAgents: Object.keys(agentRegistry).length,
      queuedPlanActions: planQueue.length,
      recentActivity: activityLog.slice(-Math.min(30, Number(params.activityLogCap) || 100)),
      // Lean 形式化：模式 + 每个对象的状态 + 形式化待办（可读参数表在 params 里）。
      formal: formalSummary(),
      params: params,
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
    lines.push('- 运行中：' + scheduler.running + '；活跃子代理：' + activeCount() + '/' + params.maxParallelThreshold)
    lines.push('- 问题：' + allProblems().filter(function (q) { return q.状态 === '已解决' }).length + '/' + problems.size + ' 已解决；命题：' + allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length + '/' + propos.size + ' 已定论')
    lines.push('- 方法库：项目 ' + methods.size + ' 条，全局 ' + globalMethods.size + ' 条，待沉淀发明 ' + methodLog.pendingInventions.length + ' 条')
    lines.push('- 待执行计划动作：' + planQueue.length + ' 条；待人工决策：' + decisionQueue.filter(function (d) { return d.status === 'pending' }).length + ' 条')
    lines.push('')
    lines.push('## 问题状态')
    for (const q of allProblems()) {
      const dirs = getDirState(q.id)
      const dirInfo = dirs.length ? '（方向：' + dirs.map(function (d) { return d.id + ':' + d.status }).join(', ') + '）' : ''
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
      const text = '[Vibe Math V3] 进度更新：项目 "' + currentProject + '" 运行中=' + report.running +
        '，问题 ' + report.problems.solved + '/' + report.problems.total + ' 已解决，命题 ' + report.propositions.resolved + '/' + report.propositions.total + ' 已定论，' +
        '活跃代理轮数=' + report.activeCount + '，待人工决策=' + report.pendingDecisions.length + '，待执行计划=' + report.queuedPlanActions + '。' +
        '请调用 vibe_math_report 汇总当前进展及各代理状态，并用人话简要汇报（不打断用户，简短即可）。'
      rootAgent.followup({ id: uuid(), role: 'user', content: [textBlock(text)], source: { kind: 'plugin', plugin: 'vibe-math-v3' } })
      lastPushReport = now()
    } catch (e) {
      console.error('vibe-math-v3: push report failed: ' + String((e && e.message) || e))
    }
  }

  // ================= child spawn / followup =================
  function pickProvider() { try { const names = subagents.list ? subagents.list() : []; if (names.indexOf('spawn') !== -1) return 'spawn'; if (names.indexOf('fork') !== -1) return 'fork' } catch (e) {} return 'spawn' }
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
  /** The host names the offending tools and then lists the registered ones. */
  function registeredToolsFromError(message) {
    const m = /known global tools:\s*([^]*)$/.exec(String(message || ''))
    if (!m) return undefined
    const names = m[1].split(',').map(function (s) { return s.trim() }).filter(Boolean)
    return names.length > 0 ? new Set(names) : undefined
  }
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
  async function interruptChild(childId) { try { subagents.interrupt(childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) {} }

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
      '- 命题卡 Propos/<分类>/<id>.md：{ 标题, ID, 类型:命题, 状态:未定论|已验证·真|已验证·假, 概率, 优先级, 依赖:[], ## 陈述（完整）, ## 证明尝试（### 证明 N｜…｜概率X｜状态Y）, ## 证伪尝试（### 证伪 N｜…｜概率X｜状态Y）}。\n' +
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
      '- 新引理：写一张完整命题卡到 `Propos/<分类>/<p-id>.md`，含锚点 `- 标题:`、`- ID/类型/状态/概率/优先级` 与 `## 陈述`；证明写进 `### 证明 1｜标题｜概率X｜状态Y` 段落（完整证明文本是验证必需，否则验证器只能验裸命题）。\n'
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
      (formalOn() ? '\n' + formalWorkLine() + formalReplyNote() : '')
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
      (formalOn() ? '\n' + formalWorkLine() + formalReplyNote() : '')
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
      '{"meta":{"kind":"solver","qid":"' + q.id + '","dirId":"' + dir.id + '","round":' + round + ',"survival":0.5,"status":"continue|success|dead-end","dead_end_reason":"... or null","lemmas":[{"id":"p-...","title":"...","statement":"...","proof":"<完整证明文本，供验证器核验>","prob":0.6,"分类":"<引理卡目录名，必须与你要写入的 Propos/<分类>/ 目录严格一致>","优先级":1}],"methods_used":[{"id":"m-...","效果":"...","建议":"..."}],"new_inventions":[{"类型":"...","标题":"...","内容描述":"...","是否已入库":false}],"solution_prob":0.85,"solution_text":"<完整解法文本，或 null>","sub_questions":[{"q_sub_title":"...","q_sub_statement":"完整问题陈述(含所有对象/定义)","assumption_title":"p_{q-tmp} 标题","assumption_statement":"完整假设陈述(含所有定义)"}]}}\n' +
      'CHANNEL B (your file tools are unavailable): put the content you would have written into __writes and carry the same meta:\n' +
      '{"__writes":[{"path":"Progress/' + q.id + '/' + dir.id + '.md","content":"<完整本轮叙述>"}],"meta":{"kind":"solver","qid":"' + q.id + '","dirId":"' + dir.id + '",...同上 meta 字段...}}\n' +
      '区分规则：methods_used 只能填**已存在的方法卡 ID**（m-…，来自 AVAILABLE METHODS 列表）——引用你自己刚想出的新方法/新技巧不属于 methods_used，请如实填入 new_inventions（它会由 Method Keeper 蒸馏建卡）；不要把方法名/标题当 id 填进 methods_used。'
    // 顺手形式化（契约 §6.2）：把常用/可复用的对象、假设、新定义沉淀到全局 Lean 库；
    // 回执里同样要带上 formal 难度判断字段（契约 §6.3）。
    if (formalOn()) head += '\n' + formalWorkLine() + formalReplyNote()
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
      'ACTION VOCABULARY (code validates every action against hard invariants; invalid actions are dropped):\n' +
      '- {"action":"spawn","role":"explorer","target":"<qid>","reason":"..."} — problem has no directions yet or all dead (re-derive).\n' +
      '- {"action":"spawn","role":"solver","target":"<qid>","direction":"<dirId>","reason":"..."} — active direction, needs a solving round.\n' +
      '- {"action":"spawn","role":"verifier","target":"<rId>","reason":"..."} — verify candidate (from verify_candidates); keep solving AND verifying balanced.\n' +
      '- {"action":"spawn","role":"method-keeper","reason":"..."} — distill pending inventions / maintain the theory library.\n' +
      '- {"action":"interrupt","childId":"<childId>","reason":"..."} — stop a running child (direction dead, superseded...).\n' +
      '- {"action":"promote","target":"<pId>","reason":"..."} — high-value unresolved proposition → judge problem.\n' +
      '- {"action":"wait","target":"<id>","reason":"..."} — advisory: wait for a dependency.\n' +
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
      (formalOn() ? formalWorkLine() + '\n【方法沉淀 × Lean 形式化】除了方法卡，你沉淀的每个可复用对象 / 定义 / 假设都应当归档到全局 Lean 库（vibe_math_lean_archive kind=\'def\'），已成立的引理归档到 Proved/（kind=\'lemma\'）；归档时**连同定义与陈述一起写清**，方便后续直接 import。\n' : '') +
      'OUTPUT CONTRACT — pick ONE channel. Write method cards into Markdown; only the created IDs, which cards were used, and improvements cross the machine reply.\n' +
      'CHANNEL A (recommended, you can write files): write each method card into `Methods/<m-id>.md` (`# 方法｜标题` + `- 标题/ID/类型/状态/可信断言/适用场景` + `## 核心内容`/`## 应用记录`/`## 改进历史`), then reply ONLY this metadata:\n' +
      '{"meta":{"kind":"methods","used":[{"id":"m-...","效果":"...","建议":"..."}],"created":["m-xxx"],"improvements":[{"id":"m-...","改进内容":"...","原因":"..."}]}}\n' +
      'CHANNEL B (your file tools are unavailable): put the method-card content into __writes and carry the same meta:\n' +
      '{"__writes":[{"path":"Methods/<m-id>.md","content":"<# 方法｜标题 + 锚点 + ## 核心内容... 完整卡面>"}],"meta":{"kind":"methods","used":[...],"created":["m-xxx"],"improvements":[...]}}'
  }

  // ================= decisions (manual/auto) =================
  function enqueueDecision(node, contextText, data) { const d = { id: uuid(), node: node, context: contextText, data: data, status: 'pending', resolution: null, createdAt: now() }; decisionQueue.push(d); return d }
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
  async function resolveDecision(id, resolution) { const d = decisionQueue.find(function (x) { return x.id === id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; d.status = 'resolved'; d.resolution = resolution; if (scheduler.gate && scheduler.gate.decisionId === id) scheduler.gate = null; logActivity('decide', id + ' resolved: ' + resolution.action + (resolution.verdict !== undefined ? ' ' + resolution.verdict : '')); await saveAll(); scheduleTick(); return { ok: true, message: 'decision resolved' } }

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
    const rId = c.rId
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
    while (t.children.length < t.expectedCount) {
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
        const allReported = t.children.length > 0 && t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === t.round })
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
    // 有"可调度工作"= 有待解问题方向可推进 或 有验证候选 或 有待沉淀发明 或 有待执行计划。
    // 修复：仅剩验证候选（如所有问题已解决但 Propos 里仍有未验证命题/解法）时也必须触发规划，
    // 否则 planner 永远不会被调用、验证永不进行。
    const verifyWork = (await buildVerifyCandidates()).length > 0
    if (!hasSchedulableWork() && !verifyWork && methodLog.pendingInventions.length === 0 && planQueue.length === 0) { await maybeMethodKeepFallback(); return }
    // 冷却：系统空闲且有工作时忽略冷却（避免 30s 空转）
    const cooldown = Number(params.planMinIntervalMs) || 0
    const hasInflight = Object.keys(agentRegistry).length > 0 || planQueue.length > 0
    if (cooldown > 0 && hasInflight && (now() - lastPlanAt) < cooldown) return
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
          const q = problems.get(String(a.target || ''))
          if (!q || q.状态 === '已解决' || q.优先级 === 'never') continue
          const dirs = getDirState(q.id)
          const allExhausted = dirs.length > 0 && dirs.every(function (d) { return d.status === 'dead-end' || d.status === 'success' })
          if (!(dirs.length === 0 || allExhausted)) continue
          const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'explorer' && m.qid === q.id })
          if (busy) continue
          if ((explorerRetries[q.id] || 0) >= (Number(params.maxExplorerRetries) || 3)) continue
        } else if (role === 'solver') {
          const q = problems.get(String(a.target || ''))
          if (!q || q.状态 === '已解决' || q.优先级 === 'never' || q.状态 === '等待依赖') continue
          const dir = (getDirState(q.id) || []).find(function (d) { return d.id === String(a.direction || '') })
          if (!dir || dir.status !== 'active') continue
          if ((dir.round || 0) >= (Number(params.solverMaxRounds) || 3)) continue // 已到轮次上限，不再调度（由后续 re-derive/stall 处理）
          const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.id && m.role === 'solver' })
          if (running) continue
        } else if (role === 'verifier') {
          const rId = String(a.target || '')
          if (!rId) continue
          if (verifyTaskBusy(rId)) continue
          const cands = await buildVerifyCandidates()
          if (!cands.some(function (c) { return c.rId === rId })) continue
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
        const p = propos.get(String(a.target || ''))
        if (!p || p.概率 === 1 || p.概率 === 0 || p.优先级 === 'never' || p.在问题清单) continue
        if (Number(p.价值关键性) < Number(params.promoteValueThreshold)) continue
        out.push({ action: 'promote', target: String(a.target || ''), reason: String(a.reason || '') })
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
      if (typeof parsed.survival_probability === 'number') dir.survival = clamp01(parsed.survival_probability)
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
      if (parsed && parsed.solution) {
        dir.status = 'success'
        delete agentRegistry[childId]
        logActivity('solver', qid + '/' + dirId + ' success at round ' + meta.round)
        await addSolution(qid, parsed.solution, parsed.solution_probability)
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
  async function addLemmaAsProposition(qid, lemma) {
    if (!lemma || !lemma.title) return
    let be = clamp01(lemma.布尔估计 != null ? lemma.布尔估计 : 0.6)
    if (be >= 1) be = 0.99; else if (be <= 0) be = 0.01
    const p = {
      id: 'p-' + shortId(), 标题: lemma.title, 状态: '未定论', 概率: be,
      优先级: (lemma.优先级 != null) ? lemma.优先级 : 1, 依赖: [], 价值关键性: clamp01(lemma['价值/关键性'] != null ? lemma['价值/关键性'] : 0.5),
      分类: categoryOf({ 分类: Object.keys(lemma.细类型 || { 未分类: {} })[0] || '未分类' }),
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
        const m = methods.get(mu.id) || globalMethods.get(mu.id)
        if (!m) {
          // 未知 id：solver 引用了一个尚未入卡的方法/技巧 → 作为待沉淀发明记录，防引用丢失（Method Keeper 将据此建卡）
          methodLog.pendingInventions.push({ at: now(), 来源: ctx.qid ? ('问题 ' + ctx.qid + (ctx.dirId ? ' 方向 ' + ctx.dirId : '')) : '', 类型: '方法', 标题: String(mu.id), 内容描述: (mu.效果 || '') + (mu.建议 ? '；建议：' + mu.建议 : '') })
          logActivity('method', 'methods_used referenced unknown method ' + mu.id + ' → queued as pending invention')
          continue
        }
        if (methods.has(mu.id)) {
          // 只记录"有实际问题/方向上下文"的引用；method-keeper 纯整理时的引用（qid/dirId 皆空）不当作应用，
          // 避免把"整理时引用该方法"误记为"实际应用"，从而污染应用计数并触发错误的全局晋升。
          if (ctx.dirId || ctx.qid) {
            m.applications = m.applications || []
            m.applications.push({ at: fmtTime(), 问题: ctx.qid || '', 方向: ctx.dirId || '', text: (mu.效果 || '') + (mu.建议 ? '；建议：' + mu.建议 : '') })
            await saveMethod(m, false)
            logActivity('method', 'application record appended to ' + mu.id + ' (问题 ' + ctx.qid + ' 方向 ' + ctx.dirId + ')')
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
  async function leanRunFile(relPath, timeoutMs) {
    const started = now()
    const rel = String(relPath == null ? '' : relPath).trim()
    if (!rel) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'file is required' }
    const abs = await leanResolveRun(rel)
    if (abs === null) {
      return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot().replace(/\\/g, '/') + '/ 之内（收到 ' + rel + '）' }
    }
    if (!/\.lean$/i.test(abs)) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: 'only .lean files can be executed' }
    if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V3_NOT_FOUND', message: 'no such file: ' + rel }
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') {
      return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel, ms: 0 }
    }
    const cmd = String(params.leanCommand || 'lean')
    const cap = Math.max(1000, Number(timeoutMs) || Number(params.leanTimeoutMs) || 120000)
    if (typeof sub.resolveExecutable !== 'function') {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'the host subprocess service exposes no resolveExecutable(); cannot resolve "' + cmd + '" —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
    }
    let exe
    try { exe = await sub.resolveExecutable(cmd) } catch (e) {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + cmd + '": ' + String((e && e.message) || e) + ' —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
    }
    const argv = [exe].concat((Array.isArray(params.leanArgs) ? params.leanArgs : []).map(String)).concat([abs])
    let handle
    try {
      handle = sub.spawn({
        argv: argv,
        cwd: frameworkRoot(),
        stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
        graceMs: cap,
      })
    } catch (e) {
      return { ok: false, code: 'LEAN_SPAWN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
    }
    // 超时必须有**主动**兜底：graceMs 只是宿主侧的宽限，契约 §7 要求超时后调用 handle.terminate()。
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
    let out = '', err = ''
    try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
    try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
    const exitCode = outcome ? outcome.exitCode : null
    const ms = now() - started
    const ok = exitCode === 0
    return {
      ok: ok, exitCode: exitCode, signal: (outcome && outcome.signal) || null, ms: ms,
      command: argv.join(' '), file: rel,
      stdout: formalTail(out, 4000), stderr: formalTail(err, 4000),
      timedOut: timedOut,
      code: ok ? undefined : (timedOut ? 'LEAN_TIMEOUT' : 'LEAN_FAILED'),
    }
  }
  /**
   * 把一次运行记到对象上（契约 §4 状态迁移）。普通运行最多把对象推进到 `attempted`；
   * `passed` 只能由 vibe_math_lean_archive{kind:'proof'} 且该文件最近一次运行 ok 产生——否则一次
   * 顺手跑个无关文件就能把对象"洗白"成已形式化。passed/blocked 不会被普通运行降级。
   */
  async function formalSetRun(target, run) {
    const t = formalId(target)
    if (!t) return
    const prev = formalOf(t)
    const status = (prev.status === 'passed' || prev.status === 'blocked') ? prev.status : 'attempted'
    await putFormal(t, Object.assign({}, prev, {
      status: status,
      file: (run && run.file) || prev.file || '',
      run: { at: now(), ok: !!(run && run.ok), exitCode: (run && run.exitCode !== undefined) ? run.exitCode : null, ms: (run && run.ms) || 0, stdoutTail: formalTail(run && run.stdout, 800), stderrTail: formalTail(run && run.stderr, 800) },
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
      L.push('  · 工具：vibe_math_lean_run（执行）· vibe_math_lean_archive（归档）· vibe_math_lean_lib（查已有可复用库）')
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
      L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或宿主不提供 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这算显式阻塞原因，定论门禁可以据此放行。')
    }
    return L.join('\n')
  }
  /** 日常提示词里的"顺手形式化"一行（off 模式返回空串 = 一个字都不多）。 */
  function formalWorkLine() {
    if (!formalOn()) return ''
    return '【顺手形式化（' + (formalMode() === 'require' ? '强制' : '鼓励') + '）】把你工作中常用或可能复用的对象、假设、'
      + '新定义用 Lean 形式化定义并归档到全局可复用库（vibe_math_lean_archive kind=\'def\'），已成立的引理归到 '
      + (vibeRoot() + '/Formal/Proved/').replace(/\\/g, '/') + '（kind=\'lemma\'）；写之前先 vibe_math_lean_lib 查重，避免重复定义。'
      + (formalMode() === 'require'
        ? '本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。'
        : '这会让后续的验证与证明省掉大量重复工作。')
      // 硬要求 3（契约 §6 顶部）：可复用库只收**跑通过**的代码，否则它会被不编译的定义污染。
      + '归档前先跑通（vibe_math_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
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
      '> 写新定义之前先查这里：能复用就不要重新定义。', '',
      '| 名称 | 文件 | 类别 | 摘要 | 最近运行 |', '|---|---|---|---|---|']
      .concat(libRows.length ? libRows.map(function (r) { return '| ' + r.base + ' | ' + r.rel + ' | def | ' + r.first.replace(/\|/g, '/') + ' | ' + r.run + ' |' }) : ['| （暂无） | | | | |']).join('\n') + '\n')
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
    const run = await leanRunFile(String(args.file || ''), args.timeout_ms)
    const target = String(args.target || '').trim()
    if (run.file || run.ok) {
      if (target) { await formalSetRun(target, run); await upsertFormalAnchor(target) }
      await writeFormalIndex()
    }
    if (run.ok) await formalAnnounce('【形式化】' + (memberId || 'scheduler') + ' 运行 Lean 通过：' + run.file + '（' + ((run.ms || 0) / 1000).toFixed(1) + 's）' + (target ? '｜对象 ' + target : ''))
    // 失败提示必须与失败原因一致：工具链缺失 / 宿主没有 subprocess 服务时**没有任何编译器输出**
    // 可以"按它修复"，把它当成普通编译错误会让代理反复重试而不是走"写下代码 + 记录显式阻塞"
    // 这条出路（契约 §6 硬要求 4）。
    const noHost = run.code === 'LEAN_NOT_FOUND' || run.code === 'NO_SUBPROCESS' || run.code === 'LEAN_SPAWN_FAILED'
    return Object.assign({ ok: !!run.ok }, run, {
      hint: run.ok
        ? '通过。若是某个对象的证明，请用 vibe_math_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库。'
        : (noHost
          ? '本宿主无法执行 Lean（' + run.code + '），没有编译器输出可以修：把形式化代码写下来并用 vibe_math_lean_archive 归档，并在回执的 note 里写明原因——这算显式阻塞原因，定论门禁可以据此放行。'
          : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_math_lean_archive kind=\'blocked\' 记录原因。'),
    })
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
    const archived = String(prev.proof || '').trim() || ('Verified/Lean/' + id + '.lean')
    await putFormal(id, Object.assign({}, prev, {
      status: 'attempted',
      decision: 'defect',
      note: note,
      proof: '',
      updatedAt: now(),
    }))
    // 归档证明必须消失，否则 Verified/Lean/ 里会留下一份"看起来已通过"的不忠实代码。
    const withdrawn = await withdrawArchivedProof(archived)
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
    // 否则一份不忠实的代码会静静留在"证明"的路径上而无人知晓）。
    await formalAnnounce('【形式化】' + who + ' 认定 ' + id + ' 的 Lean 形式化存在**忠实性缺陷**：' + note
      + '。这不是"命题为假"，而是**形式化不合格**：已撤回其「已通过」状态（降级为 attempted）、'
      + (withdrawn === 'deleted' ? '删除归档证明 ' + archived
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
      await putFormal(target, Object.assign({}, prev, { status: prev.status === 'passed' ? 'passed' : 'attempted', decision: 'used', file: file, updatedAt: now() }))
      await upsertFormalAnchor(target)
      await rebuildLeanLibIndexes()
      await formalAnnounce('【形式化】' + who + ' 通过回执记录 ' + target + ' 形式化草稿：' + file)
      return
    }
    await formalAnnounce('【形式化】' + who + ' 的 formal.decision 只能是 \'used\'、\'blocked\' 或 \'defect\'（收到 ' + String(f.decision) + '），已忽略。')
  }

  // ================= verification (验证器) =================
  function consensus(t) { const vs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid].Result }); if (vs.length === 0) return false; return vs.every(function (v) { return v === 1 }) || vs.every(function (v) { return v === 0 }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; parts.push('Reviewer ' + i + ': Result=' + r.Result + ' Reason=' + r.Reason) } return parts.join('\n') }
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
    t.childResults[childId] = { Result: Result, Reason: Reason, round: meta.round }
    delete agentRegistry[childId]
    const allReported = t.children.length > 0 && t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === meta.round })
    if (!allReported) { await saveAll(); return }
    await advanceVerification(t, meta.round)
    await saveAll()
  }
  async function advanceVerification(t, round) {
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
    const rs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid] })
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
      let num = 0; let den = 0
      const cids = Object.keys(t.childResults)
      for (let i = 0; i < rs.length; i++) {
        const acc = verifierAccuracy[cids[i]] || { correct: 0, total: 0 }
        const accRate = acc.total > 0 ? (acc.correct / acc.total) : 0.5
        const confident = (rs[i].Result === 1 || rs[i].Result === 0) ? 0.1 : 0
        const w = Math.max(0.05, Math.min(0.95, accRate + confident))
        num += w * rs[i].Result; den += w
      }
      return den > 0 ? Math.max(0.01, Math.min(0.99, num / den)) : 0.5
    }
    return 0.5
  }
  async function settleVerdict(t, verdict) {
    const v = clamp01(verdict)
    const r = t.r
    const cids = Object.keys(t.childResults)
    for (let i = 0; i < cids.length; i++) {
      const acc = verifierAccuracy[cids[i]] || { correct: 0, total: 0 }
      acc.total += 1
      if (t.childResults[cids[i]].Result === v) acc.correct += 1
      verifierAccuracy[cids[i]] = acc
    }
    await writeJson('Logs/Verification/' + t.rId + '_' + Date.now() + '.json', { r: r, verdict: v, results: t.childResults, transcript: buildTranscript(t), history: t.history || [], at: now() })
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

  // ================= child result dispatch =================
  async function onChildEnd(info) {
    // 子代理结束/中断：自动释放它持有的所有写锁（防锁残留导致文件被永久锁住）
    const endedId = String(info.id)
    for (const k of Object.keys(fileOwner)) { if (String(fileOwner[k].childId) === endedId) delete fileOwner[k] }
    const meta = agentRegistry[info.id]
    if (meta === undefined) return
    const output = blocksToText(info.lastAssistantMessage)
    try {
      if (meta.role === 'explorer') await handleExplorer(info.id, meta, output)
      else if (meta.role === 'solver') await handleSolver(info.id, meta, output, info.stopReason)
      else if (meta.role === 'verifier') await handleVerifier(info.id, meta, output, info.stopReason)
      else if (meta.role === 'planner') await handlePlanner(info.id, meta, output)
      else if (meta.role === 'method-keeper') await handleMethodKeeper(info.id, meta, output)
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
      if (fresh) { const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]) }
      if (Object.keys(agentRegistry).length > 0 || Object.keys(tasks).length > 0) {
        logActivity(fresh ? 'start' : 'resume', 'cleared ' + Object.keys(agentRegistry).length + ' agent(s) and ' + Object.keys(tasks).length + ' task(s) (' + (fresh ? 'restart' : 'stale from previous process') + ')')
        agentRegistry = {}; tasks = {}
      }
    }
    await writeJson('State/process_epoch.json', processEpoch)
    await saveAll()
    if (params.indexAutoRebuild) await rebuildIndex()
    return { ok: true }
  }
  async function acquireProjectLock() {
    const timeout = Number(params.projectLockTimeoutMs) || 60000
    if (projectLock.sessionId && projectLock.sessionId !== sessionId && (now() - projectLock.at) < timeout) {
      return { ok: false, message: '项目 "' + currentProject + '" 正被会话 ' + projectLock.sessionId + ' 占用（锁超时 ' + timeout + 'ms）' }
    }
    projectLock = { sessionId: sessionId, at: now() }
    await saveAll()
    return { ok: true }
  }
  async function releaseProjectLock() {
    if (projectLock.sessionId === sessionId) { projectLock = { sessionId: '', at: 0 }; await saveAll() }
  }
  async function startScheduler() { const r = await init(true); if (!r.ok) return r; const lock = await acquireProjectLock(); if (!lock.ok) return lock; scheduler.running = true; scheduler.startedAt = now(); scheduler.gate = null; logActivity('start', 'scheduler started for project ' + currentProject + '（v3：md 知识库 + 规划代理调度 + 方法库）'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler() { const r = await init(false); if (!r.ok) return r; const lock = await acquireProjectLock(); if (!lock.ok) return lock; scheduler.running = true; scheduler.gate = null; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; await releaseProjectLock(); logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); agentRegistry = {}; planQueue = []; await releaseProjectLock(); logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
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
  async function getStatus() {
    return {
      ok: true, initialized: rootAgent !== undefined, running: scheduler.running,
      project: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects'),
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
      recentActivity: activityLog.slice(-Math.min(10, Number(params.activityLogCap) || 100)), params: params,
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
    if (unsolved.length === 0 && !leftoverVerify && Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0) {
      scheduler.running = false
      await releaseProjectLock()
      logActivity('stop', 'all active problems solved (never-priority excluded) and no active agents/tasks/plans — scheduler stopped (strict termination)')
      await saveAll(); await maybeWriteReport(true); await maybePushReport(true)
    } else if (!hasPendingGate && Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0 && unsolved.length > 0) {
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
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; planQueue = []; plannerFails = 0; methodLog = { pendingInventions: [], keepCount: 0, lastKeepAt: 0 }; projectLock = { sessionId: '', at: 0 }; lastReportWrite = 0; lastPushReport = 0; reportDirty = false; lastPlanSummary = null; archivedJ = {}; lastIndexWrite = 0; formalState = { records: {}, todo: [], libRuns: {} }
    await loadSettings(); await migrateLegacyParams(); await loadState(); await loadKnowledgeBase(); await saveAll()
    if (params.indexAutoRebuild) await rebuildIndex()
    return { ok: true, project: slug, frameworkRoot: frameworkRoot() }
  }

  // ================= events / timer (registered at apply level, see bottom) =================

  // ================= tools =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  const handlers = {}
  function registerTool(name, description, parameters, executeFn) { handlers[name] = executeFn }
  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math V3 scheduler for the current project.', objParams({}), async function () { return await startScheduler() })
  registerTool('vibe_math_resume', 'Resume the Vibe Math V3 scheduler after a checkpoint/restart.', objParams({}), async function () { return await resumeScheduler() })
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), async function () { return await pauseScheduler() })
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), async function () { return await abortScheduler() })
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), async function () { await refreshParams(); return await getStatus() })
  registerTool('vibe_math_report', 'Return the full progress report and write it to Progress_Logs/report.json + Logs/报告.md.', objParams({}), async function () { await refreshParams(); await maybeWriteReport(true); return await buildReport() })
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), async function (args) { params.mode = args.mode; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } })
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象未达到 Lean 已通过或已记录显式阻塞原因之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), async function () { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project (creates Problems/<id>.md).', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' }, dependencies: { type: 'array', items: { type: 'string' } } }, ['id', 'description']), async function (args) { if (problems.has(args.id)) return { ok: false, message: 'problem id already exists' }; problems.set(args.id, { id: args.id, 标题: args.id, 状态: '求解中', 优先级: args.priority || 0, 依赖: Array.isArray(args.dependencies) ? args.dependencies : [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: args.description, 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(args.id)); await syncDependencies(); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: problemRel(problems.get(args.id)) } })
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (creates Propos/<分类>/<id>.md).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 概率: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 分类: { type: 'string' } }, ['id', '概述']), async function (args) {
    if (propos.has(args.id)) return { ok: false, message: 'proposition id already exists' }
    const p = { id: args.id, 标题: args.id, 状态: '未定论', 概率: clamp01(args.概率 != null ? args.概率 : 0.5), 优先级: (args.优先级 != null) ? args.优先级 : 1, 依赖: [], 价值关键性: clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), 分类: args.分类 || '未分类', 陈述: args.概述, proofs: [], refutes: [], 来源问题: '', 在问题清单: false }
    propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: propositionRel(p) }
  })
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index: id, 标题, 概率, 状态, 优先级, 分类).', objParams({}), async function () { const all = allPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 标题: p.标题, 概率: p.概率, 状态: p.状态, 优先级: p.优先级, 分类: categoryOf(p) } }) } })
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, true) })
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, false) })
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), async function () { return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') } })
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), async function () { return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) } })
  registerTool('vibe_math_decide', 'Resolve a pending manual decision (plan: approve|reject; verdict: override with verdict 1|0; spawn: approve|reject; method-promote: approve|reject).', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), async function (args) { const d = decisionQueue.find(function (x) { return x.id === args.id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; const resolution = { action: args.action, verdict: args.verdict }; const applied = await applyDecision(d.node, d.data, resolution); const r = await resolveDecision(args.id, resolution); return Object.assign({ ok: true, applied: applied }, r) })
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), async function () { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round, rId: m.rId }) } return { ok: true, agents: out, count: out.length } })
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), async function (args) { if (!agentRegistry[args.childId]) return { ok: false, message: 'unknown childId' }; await followupChild(args.childId, args.message); return { ok: true, message: 'message delivered' } })
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), async function (args) { await interruptChild(args.childId); return { ok: true, message: 'interrupt requested' } })
  registerTool('vibe_math_plan', 'Show the queued plan / last plan result, or force a planning round.', objParams({ force: { type: 'boolean' } }), async function (args) { if (args && args.force && scheduler.running && !scheduler.gate) { await callPlanner(); return { ok: true, message: 'planning triggered', queued: planQueue.length } } return { ok: true, queued: planQueue, lastPlan: lastPlanSummary } })
  registerTool('vibe_math_index', 'Rebuild the machine index (State/index.json) from the Markdown knowledge base.', objParams({}), async function () { await loadKnowledgeBase(); const r = await rebuildIndex(); return { ok: true, index: r, project: currentProject } })
  registerTool('vibe_math_method_add', 'Manually add a method card to Methods/ (creates Methods/<id>.md).', objParams({ id: { type: 'string' }, 标题: { type: 'string' }, 类型: { type: 'string' }, 核心内容: { type: 'string' }, 适用场景: { type: 'string' } }, ['id', '标题']), async function (args) { if (methods.has(args.id)) return { ok: false, message: 'method id already exists' }; const m = { id: args.id, 标题: args.标题, 类型: args.类型 || '方法', 状态: '经验', 可信断言: [], 上级体系: [], 子方法: [], 相关: [], 适用场景: args.适用场景 || '', 核心内容: args.核心内容 || '', 定义与记号: '', applications: [], improvements: [], 来源: 'user' }; methods.set(m.id, m); await saveMethod(m, false); await rebuildIndex(); return { ok: true, method: m, file: methodRel(m, false) } })
  registerTool('vibe_math_method_list', 'List methods from Methods/ (+ global VibeMath/Methods/): id, 标题, 类型, 状态, 可信断言, applications count.', objParams({}), async function () { const all = Array.from(methods.values()); const g = Array.from(globalMethods.values()); return { ok: true, count: all.length, globalCount: g.length, methods: all.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: false } }).concat(g.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: true } })) } })
  registerTool('vibe_math_lock_status', 'Show the project lock occupancy.', objParams({}), async function () { return { ok: true, project: currentProject, lock: projectLock } })
  registerTool('vibe_math_claim_write', 'Acquire the write lock for one target file (relative to the project root). Call before writing a Markdown file directly; a file may only be written by ONE agent at a time. Returns the display path you may write (VibeMath/Projects/<project>/<target>) and a hint.', objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await claimWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_release_write', 'Release the write lock for one target file (relative to the project root). Call after you finished writing it.', objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await releaseWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_sync_meta', 'Report lightweight scheduling metadata after you wrote content to Markdown files (direction status/survival, registered lemma ids, methods_used/new_inventions, new method cards). Content itself stays in the md files; this only keeps the scheduler index/state in sync.', objParams({ meta: { type: 'object' } }, ['meta']), async function (args, agent) { return await syncMeta(args.meta || {}, agent) })

  // ---- Lean 形式化验证工具（契约 docs/formal-verification.md §5）----
  // **无条件注册**：注册是静态的（与既有 ctx.effect 纪律一致），模式只决定框架是否主动告诉
  // 代理它们存在；off 模式下人/代理主动调用时照常工作。
  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain on one .lean file inside the workspace and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), async function (args, agent) { return await leanRunTool(agent && agent.id, args) })
  registerTool('vibe_math_lean_archive', '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (VibeMath/Formal/Lib). kind="lemma": a machine-checked lemma → VibeMath/Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), async function (args, agent) { return await leanArchive(agent && agent.id, args) })
  registerTool('vibe_math_lean_lib', "(member) List (and by default rebuild) the Lean reuse library: this project's Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining.", objParams({ refresh: { type: 'boolean' } }), async function (args) {
    const a = args || {}
    const r = a.refresh === false
      ? { lib: null, proved: null, objects: Object.keys(formalRecords()).length }
      : await rebuildLeanLibIndexes()
    return {
      ok: true, mode: formalMode(), rebuilt: a.refresh !== false,
      counts: r, todo: formalTodo().map(function (t) { return { id: t.id, why: t.why, at: t.at } }),
      objects: Object.keys(formalRecords()).map(function (k) {
        const rec = formalRecords()[k] || {}
        return { target: k, status: rec.status, file: rec.file, proof: rec.proof, note: rec.note }
      }),
      paths: { project: 'Formal/（相对项目根）', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/', proofs: 'Verified/Lean/' },
      hint: "复用优先：先在 Lib/ 里找现成定义；新定义用 vibe_math_lean_archive kind='def' 归档，已证引理用 kind='lemma'；归档前先跑通（run=true 或先 vibe_math_lean_run），跑不通不要入库。",
      verify: (Object.keys(tasks).length ? String(tasks[Object.keys(tasks)[0]].rId || '') : null),
    }
  })

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
  async function claimWrite(target, agent) {
    const childId = (agent && agent.id) ? String(agent.id) : 'scheduler'
    const key = String(target || '').replace(/\\/g, '/')
    if (!key) return { ok: false, message: 'target required' }
    const lockKey = fileLockKey(key)
    const owner = fileOwner[lockKey]
    if (owner && owner.childId !== childId && (now() - (owner.at || 0)) < 60000) {
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
            const pid = l.id || ('p-' + shortId())
            if (!propos.has(pid)) {
              const pn = { id: pid, 标题: l.title || pid, 状态: '未定论', 概率: clamp01(l.prob != null ? l.prob : 0.6), 优先级: l.优先级 != null ? l.优先级 : 1, 依赖: [], 价值关键性: clamp01(l['价值/关键性'] != null ? l['价值/关键性'] : 0.5), 分类: l.分类 || '未分类', 陈述: l.statement || l.title || '', proofs: [], refutes: [], 来源问题: qid, 在问题清单: false }
              // 引理证明文本（验证必需）由代理在 sync_meta 的 l.proof 上报（结构化，非长叙述）；无则验证器只能验裸命题
              if (l.proof) { pn.proofs = [{ title: (l.title || pid) + '（证明）', prob: clamp01(l.prob != null ? l.prob : 0.7), status: '未定论', text: String(l.proof) }] }
              propos.set(pid, pn)
              // 若代理已直接写了该命题卡，保留其内容（不覆盖）；否则写一张标准卡兜底（保证可被索引/验证）
              const rel = propositionRel(pn) // 与 saveProposition 同一路径
              if ((await readText(rel)) === undefined) await saveProposition(pn)
            }
            if (!(dir.lemmas || []).some(function (x) { return x.id === pid })) { dir.lemmas = dir.lemmas || []; dir.lemmas.push({ id: pid, title: l.title || pid }) }
          }
        }
        // 解法上报（prob 由代理写进 Problems/<qid>.md；这里只登记）
        if (meta.solution_prob != null && meta.solution_text) {
          q.solutions = q.solutions || []
          const p = clamp01(meta.solution_prob)
          q.solutions.push({ title: '解法 ' + (q.solutions.length + 1), prob: p >= 1 ? 0.99 : (p <= 0 ? 0.01 : p), status: '未定论', text: String(meta.solution_text).slice(0, 2000) })
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
      if (Array.isArray(meta.created)) for (const mid of meta.created) {
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
          const m = methods.get(imp.id)
          if (!m) { logActivity('method', 'improvement referenced unknown method ' + imp.id); continue }
          m.improvements = m.improvements || []
          m.improvements.push({ v: m.improvements.length + 1, 原因: imp.原因 || '', text: imp.改进内容 || '' })
          await saveMethod(m, false)
          logActivity('method', 'method ' + imp.id + ' improved (v' + m.improvements.length + ')')
        }
      }
      await saveAll()
      return { ok: true }
    }
    return { ok: false, message: 'unknown meta kind: ' + kind }
  }

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
    if (cmd === 'add') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; if (problems.has(id)) return { ok: false, message: 'problem id already exists' }; problems.set(id, { id: id, 标题: id, 状态: '求解中', 优先级: 0, 依赖: [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: desc, 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(id)); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: problemRel(problems.get(id)) } }
    if (cmd === 'add-proposition') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add-proposition <id> <概述>' }; const p = { id: id, 标题: id, 状态: '未定论', 概率: 0.5, 优先级: 1, 依赖: [], 价值关键性: 0.5, 分类: '未分类', 陈述: desc, proofs: [], refutes: [], 来源问题: '', 在问题清单: false }; propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: propositionRel(p) } }
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
    return { ok: false, usage: 'start | resume | pause | abort | status | report | mode <auto|manual> | setup | save | template [global|project] | add <id> <desc> | add-proposition <id> <概述> | list-propositions | methods | index | plan | lock | project [list|new <name>|<name>] | decisions | agents', message: 'unknown /vibe subcommand: ' + (cmd || '(empty)') }
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
    onChildEnd: onChildEnd,
    dispatchVibeCommand: dispatchVibeCommand,
    handlers: handlers,
    refreshProject: async function () { if (rootAgent) currentProject = await readCurrentProject() },
    getRunning: function () { return scheduler.running },
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
  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math V3 scheduler for the current project.', objParams({}), 'vibe_math_start')
  registerTool('vibe_math_resume', 'Resume the Vibe Math V3 scheduler after a checkpoint/restart.', objParams({}), 'vibe_math_resume')
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), 'vibe_math_pause')
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), 'vibe_math_abort')
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), 'vibe_math_status')
  registerTool('vibe_math_report', 'Return the full progress report and write it to Progress_Logs/report.json + Logs/报告.md.', objParams({}), 'vibe_math_report')
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), 'vibe_math_set_mode')
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象未达到 Lean 已通过或已记录显式阻塞原因之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' } }), 'vibe_math_set_params')
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), 'vibe_math_setup')
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), 'vibe_math_save_settings')
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), 'vibe_math_template')
  registerTool('vibe_math_add_problem', 'Add a problem to the current project (creates Problems/<id>.md).', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' }, dependencies: { type: 'array', items: { type: 'string' } } }, ['id', 'description']), 'vibe_math_add_problem')
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (creates Propos/<分类>/<id>.md).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 概率: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 分类: { type: 'string' } }, ['id', '概述']), 'vibe_math_add_proposition')
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index).', objParams({}), 'vibe_math_list_propositions')
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_new_project')
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), 'vibe_math_set_project')
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), 'vibe_math_list_projects')
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), 'vibe_math_list_decisions')
  registerTool('vibe_math_decide', 'Resolve a pending manual decision (plan: approve|reject; verdict: override with verdict 1|0; spawn: approve|reject; method-promote: approve|reject).', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), 'vibe_math_decide')
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), 'vibe_math_list_agents')
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), 'vibe_math_message_agent')
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), 'vibe_math_interrupt_agent')
  registerTool('vibe_math_plan', 'Show the queued plan / last plan result, or force a planning round.', objParams({ force: { type: 'boolean' } }), 'vibe_math_plan')
  registerTool('vibe_math_index', 'Rebuild the machine index (State/index.json) from the Markdown knowledge base.', objParams({}), 'vibe_math_index')
  registerTool('vibe_math_method_add', 'Manually add a method card to Methods/ (creates Methods/<id>.md).', objParams({ id: { type: 'string' }, 标题: { type: 'string' }, 类型: { type: 'string' }, 核心内容: { type: 'string' }, 适用场景: { type: 'string' } }, ['id', '标题']), 'vibe_math_method_add')
  registerTool('vibe_math_method_list', 'List methods from Methods/ (+ global VibeMath/Methods/).', objParams({}), 'vibe_math_method_list')
  registerTool('vibe_math_lock_status', 'Show the project lock occupancy.', objParams({}), 'vibe_math_lock_status')
  registerTool('vibe_math_claim_write', 'Acquire the write lock for one target file (relative to the project root). Call before writing a Markdown file directly.', objParams({ target: { type: 'string' } }, ['target']), 'vibe_math_claim_write')
  registerTool('vibe_math_release_write', 'Release the write lock for one target file (relative to the project root).', objParams({ target: { type: 'string' } }, ['target']), 'vibe_math_release_write')
  registerTool('vibe_math_sync_meta', 'After you write content into Markdown files, report ONLY lightweight scheduling metadata to keep the scheduler state in sync (content stays in the md files). meta.kind must be one of:\n- "directions": {qid, directions:[{id,title,method,core_assumption,feasibility}], methods_used:[{id,效果,建议}], new_inventions:[{类型,标题,内容描述,是否已入库}]}\n- "solver": {qid, dirId, round, survival, status:"continue|success|dead-end", dead_end_reason, lemmas:[{id,title,statement,proof,prob,分类,优先级}], methods_used, new_inventions, solution_prob, solution_text, sub_questions:[{q_sub_title,q_sub_statement,assumption_title,assumption_statement}]}\n- "methods": {used:[{id,效果,建议}], created:[ids], improvements:[{id,改进内容,原因}]}', objParams({ meta: { type: 'object' } }, ['meta']), 'vibe_math_sync_meta')
  // Lean 形式化验证（docs/formal-verification.md）：三个工具**无条件注册**——注册是静态的，
  // 模式只决定框架是否主动告诉代理它们存在。off 模式下人/代理主动调用时照常工作。
  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain on one .lean file inside the workspace and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), 'vibe_math_lean_run')
  registerTool('vibe_math_lean_archive', '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (VibeMath/Formal/Lib). kind="lemma": a machine-checked lemma → VibeMath/Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), 'vibe_math_lean_archive')
  registerTool('vibe_math_lean_lib', "(member) List (and by default rebuild) the Lean reuse library: this project's Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining.", objParams({ refresh: { type: 'boolean' } }), 'vibe_math_lean_lib')

  // /vibe slash command (registered once; routed per session)
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math V3 solver (start/pause/projects/setup/save/decisions/agents/methods/index/plan/lock)',
    input: { hint: '[start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|methods|index|plan|lock|project [list|new <name>|<name>]|decisions|agents]' },
    handler: async function (invocation) {
      const s = getSession(invocation && invocation.agent)
      if (!s) return { kind: 'success', text: JSON.stringify({ ok: false, error: 'no vibe-math session for this agent' }) }
      const line = String(invocation && invocation.rawInput ? invocation.rawInput : '').trim()
      const parts = line.length > 0 ? line.split(/\s+/) : []
      const cmd = parts[0] || ''
      const rest = parts.slice(1)
      const result = await s.dispatchVibeCommand(cmd, rest)
      return { kind: 'success', text: JSON.stringify(result, null, 2) }
    },
  }))

  // subagent/end (registered once; routed to the owning session via childOwner)
  ctx.on('subagent/end', function (info) {
    const sid = childOwner.get(info.id)
    const s = sid !== undefined ? sessions.get(sid) : undefined
    if (s) s.onChildEnd(info).catch(function (e) { console.error('vibe-math-v3 onChildEnd reject: ' + String((e && e.stack) || e)) })
    // 注意：这里**不要**回收 childOwner 条目（与 v2 同一结论）。该映射在子代理 end 之后仍会
    // 被后续事件路由用到；在 v2 上实测过"事件回调里回收"与"onChildEnd 末尾回收"两种写法，
    // 都会让 verdict 收口失效。代价只是每个历史子代理一条小记录（有界、不影响功能）。
  })

  // tick timer (registered once; ticks every running session at its own pace)
  ctx.effect(() => { const t = setInterval(function () { for (const s of sessions.values()) { if (s.getRunning() && !s.tickInFlight && s.tickDue() && s.scheduler.gate === null) s.scheduleTick() } }, 1000); return () => clearInterval(t) })
}
