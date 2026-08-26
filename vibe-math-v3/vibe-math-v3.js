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
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')

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
  }
  let params = Object.assign({}, DEFAULT_PARAMS)
  let scheduler = { running: false, activeCount: 0, startedAt: 0, lastCheckpoint: 0, gate: null }
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

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function now() { return Date.now() }
  function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }
  function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }
  function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }
  function fmtTime(ts) { try { return new Date(ts || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return String(ts || '') } }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} if (sandboxPolicy && sandboxPolicy.workspaceRoot) return sandboxPolicy.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }
  function safeId(s) { return String(s == null ? 'anon' : s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon' }
  function getPolicy() { try { if (sandboxPolicy && rootAgent && rootAgent.session) return sandboxPolicy.resolve({ session: rootAgent.session }) } catch (e) {} try { if (sandboxPolicy) return sandboxPolicy.resolve({}) } catch (e) {} return undefined }
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
    { name: 'plannerPersona', type: 'string', description: '注入规划代理提示词开头的人格/要求', suggestion: '' },
    { name: 'planMinIntervalMs', type: 'integer', description: '两次规划调用的最小间隔（毫秒）；系统空闲且有工作时忽略', suggestion: 30000 },
    { name: 'plannerMaxFails', type: 'integer', description: '规划代理连续失败达此值 → 自动降级启发式', suggestion: 3 },
    { name: 'methodKeepIntervalMs', type: 'integer', description: 'Method Keeper 定时整理间隔（0 = 事件驱动）', suggestion: 0 },
    { name: 'methodKeepEvery', type: 'integer', description: '每积累 N 个待沉淀发明/新命题触发一次整理', suggestion: 5 },
    { name: 'methodAutoPromote', type: 'boolean', description: '项目级方法自动晋升全局库（false = 人工门）', suggestion: false },
    { name: 'indexAutoRebuild', type: 'boolean', description: '每次写盘后自动重建索引（false = 手动 vibe_math_index）', suggestion: true },
    { name: 'projectLockTimeoutMs', type: 'integer', description: '项目锁等待超时（毫秒）', suggestion: 60000 },
  ]

  // ================= fs (adapted to DSH 0.1.1: resolve returns {targetKey, displayPath}) =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeText(rel, content) { const t = await fsTarget(rel); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true }
  async function writeJson(rel, obj) { return await writeText(rel, JSON.stringify(obj, null, 2)) }
  async function readJson(rel) { const t = await readText(rel); if (t === undefined || t === '') return undefined; try { return JSON.parse(t) } catch (e) { return undefined } }
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
  async function runShell(script, cwd) { if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }; try { const handle = subprocess.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script], cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 }); const outcome = await handle.done; return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode } } catch (e) { return { ok: false, error: String((e && e.message) || e) } } }
  async function ensureDirs() { const base = frameworkRoot(); const dirs = ['Problems', 'Progress', 'Propos', 'Methods', 'Verified/命题', 'Verified/问题', 'Reliable', 'Notes', 'Logs/Verification', 'Logs/Plans', 'State']; const paths = [vibeRoot() + '/Projects', vibeRoot() + '/Methods'].concat(dirs.map(function (d) { return base + '/' + d })); const list = paths.map(psQuote).join(','); return await runShell('New-Item -Force -ItemType Directory -Path ' + list + ' | Out-Null') }
  async function removeFile(rel) { const base = frameworkRoot(); return await runShell('Remove-Item -Force -LiteralPath ' + psQuote(base + '/' + rel) + ' -ErrorAction SilentlyContinue') }

  // ================= settings =================
  function sanitizeParams(obj) {
    const out = {}
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'directionsPerSolver', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs', 'tickIntervalMs', 'activityLogCap', 'maxExplorerRetries', 'planningHorizon', 'planMinIntervalMs', 'plannerMaxFails', 'methodKeepIntervalMs', 'methodKeepEvery', 'projectLockTimeoutMs']
    const numFields = ['promoteValueThreshold']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny']
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
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = src[k]
      const schema = PARAM_SCHEMA.find(function (p) { return p.name === k })
      const desc = schema ? schema.description : ''
      const comma = i === keys.length - 1 ? '' : ','
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

  // ---- compose / parse: Problem ----
  function composeProblemMd(p) {
    const lines = []
    lines.push('# 问题｜' + (p.标题 || p.id))
    lines.push(anchorLine('ID', p.id))
    lines.push(anchorLine('类型', '问题'))
    lines.push(anchorLine('状态', p.状态 || '求解中'))
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
    return lines.join('\n').trimEnd() + '\n'
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
    }
  }

  // ---- compose / parse: Proposition ----
  function composePropositionMd(p) {
    const lines = []
    lines.push('# 命题｜' + (p.标题 || p.id))
    lines.push(anchorLine('ID', p.id))
    lines.push(anchorLine('类型', '命题'))
    lines.push(anchorLine('状态', p.状态 || '未定论'))
    lines.push(anchorLine('概率', p.概率 == null ? 0.5 : p.概率))
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
    return lines.join('\n').trimEnd() + '\n'
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
    }
  }

  // ---- compose / parse: Method ----
  function composeMethodMd(m) {
    const lines = []
    lines.push('# 方法｜' + (m.标题 || m.id))
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
    return lines.join('\n').trimEnd() + '\n'
  }
  function parseMethodMd(id, text) {
    const { head, body } = splitHeader(text)
    const a = parseAnchors(head)
    const apps = parseEntries(body, /^###\s*应用\s*\d+｜(.*?)$/).map(function (e) { return { at: e.title || '', 问题: '', 方向: '', text: e.text } })
    return {
      id: id, 标题: a['标题'] || id, 类型: a['类型'] || '方法', 状态: a['状态'] || '经验',
      可信断言: safeJson(a['可信断言'], []), 上级体系: safeJson(a['上级体系'], []), 子方法: safeJson(a['子方法'], []), 相关: safeJson(a['相关'], []),
      适用场景: a['适用场景'] || '', 核心内容: section(body, '核心内容'), 定义与记号: section(body, '定义与记号'),
      applications: apps, improvements: [], 来源: a['来源'] || '',
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
  async function saveProblem(p) { await writeText('Problems/' + p.id + '.md', composeProblemMd(p)) }
  async function saveProposition(p) { await writeText('Propos/' + categoryOf(p) + '/' + p.id + '.md', composePropositionMd(p)) }
  async function saveMethod(m, global) { if (global) { await writeTextAbs(vibeRoot() + '/Methods/' + m.id + '.md', composeMethodMd(m)) } else { await writeText('Methods/' + m.id + '.md', composeMethodMd(m)) } }
  async function saveVerified(card) { await writeText('Verified/' + (card.类型 === '问题' ? '问题' : '命题') + '/' + card.id + '.md', composeVerifiedMd(card)) }
  async function ensureProgressDir(qid) { const base = frameworkRoot(); return await runShell('New-Item -Force -ItemType Directory -Path ' + psQuote(base + '/Progress/' + qid) + ' | Out-Null') }
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
      if (m) { const base = frameworkRoot(); await runShell('New-Item -Force -ItemType Directory -Path ' + psQuote(base + '/Progress/' + m[1]) + ' | Out-Null') }
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
  async function loadState() {
    const s = await readJson('State/scheduler_state.json'); if (s) scheduler = Object.assign({}, scheduler, s)
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
      activeCount: scheduler.activeCount, maxParallelThreshold: params.maxParallelThreshold,
      problems: { total: problems.size, solved: allProblems().filter(function (q) { return q.状态 === '已解决' }).length },
      propositions: { total: propos.size, resolved: allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length },
      verifyPending: (await buildVerifyCandidates()).length,
      methods: { project: methods.size, global: globalMethods.size, pendingInventions: methodLog.pendingInventions.length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      registeredAgents: Object.keys(agentRegistry).length,
      queuedPlanActions: planQueue.length,
      recentActivity: activityLog.slice(-Math.min(30, Number(params.activityLogCap) || 100)),
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
    lines.push('- 运行中：' + scheduler.running + '；活跃子代理：' + scheduler.activeCount + '/' + params.maxParallelThreshold)
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
  const NETWORK_TOOLS = ['web_search', 'web', 'fetch']
  const SCRIPT_TOOLS = ['bash', 'pwsh']
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
      if (request.toolFilter) { delete request.toolFilter; console.error('vibe-math-v3: startContinuable with toolFilter failed, retrying without it: ' + String((e && e.message) || e)); started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) } else { throw e }
    }
    agentRegistry[started.childId] = Object.assign({ createdAt: now() }, meta || {})
    childOwner.set(started.childId, sessionId)
    scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1
    await saveAll()
    return started.childId
  }
  async function followupChild(childId, promptText) { await subagents.followup(rootAgent, childId, [textBlock(promptText)], { source: { kind: 'user' }, signal: makeSignal(30000) }); scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1; await saveAll() }
  async function interruptChild(childId) { try { subagents.interrupt(childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) {} }

  // ================= prompts =================
  function personaText(key) { return params[key] ? (String(params[key]) + '\n\n') : '' }
  function defaultKnowledgeContext() {
    return 'KNOWLEDGE BASE & DATA MODEL (definition contract you MUST follow):\n' +
      '\n1) TRUST LAYERS — the single most important rule:\n' +
      '- Verified/ 中的内容 = 绝对可信（已被验证器判定为真/假并生成只读副本）：可直接引用。\n' +
      '- Propos/ 中 状态: 已验证·真/假 的命题 = 可信（以 Verified/ 副本为准）。\n' +
      '- 其余一切（未定论命题、Progress/ 研究日志、Methods/ 中未验证断言、Notes/）= 经验性记录/参考，绝不能当作已成立事实引用。\n' +
      '- 概率语义：1 = 绝对正确（可当已知事实）；0 = 绝对错误；0 与 1 之间 = 未定论/待验证。\n' +
      '\n2) OBJECT MODELS（md 卡片，软规范：头部锚点行 + 正文自由叙述）：\n' +
      '- 问题卡 Problems/<id>.md：{ ID, 类型:问题, 状态:原始|求解中|等待依赖|已解决|死路, 优先级, 依赖:[], 被依赖:[], 来源:原始|后生, 计划（由调度器按规划代理的计划自动更新：一句话说明下一轮安排）, ## 陈述（完整问题陈述，每个记号/对象都要完整定义）, ## 来源与动机（后生问题：产生流程/动机/如何回填主线）, ## 解法候选（### 解法 N｜标题｜概率X｜状态Y + 叙述式完整解法）}。\n' +
      '- 命题卡 Propos/<分类>/<id>.md：{ ID, 类型:命题, 状态:未定论|已验证·真|已验证·假, 概率, 优先级, 依赖:[], ## 陈述（完整）, ## 证明尝试（### 证明 N｜…）, ## 证伪尝试（### 证伪 N｜…）}。\n' +
      '- 方法卡 Methods/<id>.md：{ ID, 类型:方法, 状态:经验|应用验证|含已验证断言, 可信断言:[]（只允许已进 Verified/ 的 ID）, 上级体系/子方法/相关, 适用场景, ## 核心内容, ## 定义与记号, ## 应用记录, ## 改进历史 }。\n' +
      '- 收口规则：某个解法/证明/证伪 概率=1 → 问题已解决 / 命题已验证（状态/概率锚点由调度器改写）。\n' +
      '\n3) FOLDERS：Problems/ 问题清单；Progress/ 研究日志（每问题一个 md，按方向按轮续写）；Propos/ 命题库；Methods/ 理论发明库；Verified/ 绝对可信（只读）；Reliable/ 可信参考文献（只读）；Notes/ 自由笔记；Logs/ 审计；State/ 调度器私有——不要读也不要改。\n' +
      '\n4) METHOD LIBRARY RULES：开工前先查 Methods/（含全局 VibeMath/Methods/），有可复用方法/体系则引用其 ID；用后必须在 methods_used 上报（含效果与改进建议）；本轮新发明/经验性总结必须在 new_inventions 上报（类型：理论体系|框架|工具|方法|思想|范式|技巧）——若与某张已有方法卡同类，在内容描述里注明"可并入 m-xxx"以便 Method Keeper 合并而非重复建卡。**重要区分**：methods_used 只能填**已存在方法卡的 ID**（形如 m-abc12345，来自 AVAILABLE METHODS 列表）；你自己刚想出的新方法/新技巧不属于 methods_used，请如实填入 new_inventions（由 Method Keeper 蒸馏建卡）；千万不要把方法名/标题文字当 id 填进 methods_used。\n' +
      '\n5) OUTPUT REQUIREMENTS：完整性、不断章取义——任何输出的问题/命题/结论都要给出完整陈述并补全所依赖的对象/环境/背景定义；引用必须给出处（文件路径 + ID + 锚点/节），事实只引 Verified/；若结论依赖临时假设 p，必须显式写「若 <p 完整陈述> 成立，则：…」；只输出规定的 JSON（```json 围栏内），JSON 之外不写任何内容。' +
      '\n\n6) WRITE-INTO-MD WORKFLOW（推荐，代理自组织直接写 md）：框架允许你**直接写 Markdown**，把研究内容落到对应路径的 md 文件里，而不是全部塞进 JSON。做法（你拥有 file 工具）：\n' +
      '- 每个角色有明确的"归属文件"：求解器写该方向的完整叙述到 `Progress/<问题id>/<方向id>.md`；新引理写一张完整命题卡到 `Propos/<分类>/<p-id>.md`（含锚点 `# 命题｜标题`、`- ID/状态/概率/优先级` 与 `## 陈述`/`## 证明尝试`）；方法整理代理写 `Methods/<m-id>.md`（锚点 `- ID/类型/状态/可信断言/适用场景` + `## 核心内容`/`## 应用记录`/`## 改进历史`）。\n' +
      '- **并发写安全**：写任何文件前先 `vibe_math_claim_write({target:"<相对项目根的路径>"})` 申请写锁（同一文件同一时刻只允许一个代理写；若返回 busy 请稍后重试），写完 `vibe_math_release_write({target})`。不同方向是不同文件，天然不冲突。\n' +
      '- 写完内容后，用 `vibe_math_sync_meta({meta:{kind:"solver|directions|methods", ...}})` 上报**轻量元数据**（方向状态/存活率/引理 id 及**证明 proof**/方法卡 id/新发明清单），让调度器更新索引与调度——内容留在 md，只有调度元数据与**待验证的证明**才进机读接口（证明是验证必需，必须随 lemmas 上报，否则验证器无法核验）。\n' +
      '- 若你所在环境无法写文件（工具不可用/被拒），再回退到"把内容放进下面的 JSON 字段"由调度器落盘。两种方式二选一即可，不要重复。'
  }
  function knowledgeContextText() { const k = params.knowledgeContext ? String(params.knowledgeContext) : defaultKnowledgeContext(); return k ? ('\n' + k + '\n') : '' }
  function capabilitiesText(role) {
    const maxCalls = role === 'solver' ? params.solverMaxToolCalls : params.verifierMaxToolCalls
    const netOn = role === 'solver' ? params.solverAllowNetwork : params.verifierAllowNetwork
    const scrOn = role === 'solver' ? params.solverAllowScripts : params.verifierAllowScripts
    const toolParts = []
    if (netOn !== false) toolParts.push('web search / literature lookup')
    if (scrOn !== false) toolParts.push('symbolic/numeric computation (running scripts)')
    let t = '\nYOUR PERMISSIONS / CAPABILITIES:\n'
    t += '- Network tools: ' + (netOn === false ? 'DISABLED for you' : 'available') + '; Script/shell tools: ' + (scrOn === false ? 'DISABLED for you' : 'available') + ' (your actual tool list is enforced by the framework).\n'
    t += toolParts.length > 0
      ? ('- You may use external tools (' + toolParts.join(', ') + ') to assist; ' + ((maxCalls && Number(maxCalls) > 0) ? ('call such external tools AT MOST ' + maxCalls + ' times this round.\n') : 'no per-round limit by default.\n'))
      : '- External tools: none enabled for you this round.\n'
    t += '- You may READ any file under Verified/ as a known, trusted dependency.\n'
    t += '- You should BASE your reasoning on Propos/ (propositions with proofs/refutations and probabilities), Methods/ (reusable theories/tools), Reliable/ (trusted references), and Verified/.\n'
    t += '- You must NOT write files directly: return structured JSON only — the scheduler is the single writer (it composes the Markdown knowledge base from your report).\n'
    t += '\nHOW TO READ EXISTING KNOWLEDGE: these are Markdown files. COARSE SCAN first: use read/grep on the anchor header lines (- ID/- 状态/- 概率/- 优先级/- 依赖) to locate relevant objects — do NOT load full prose yet. FINE READ after: read the full card for 陈述/证明/证伪/解法/核心内容 sections.\n'
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
      knowledgeContextText() +
      methodsIndexText() +
      capabilitiesText('solver') +
      '\nDo a first-stage METACOGNITIVE BRAINSTORM: decompose constraints, test boundary/extreme cases, map to similar known problems. First check the AVAILABLE METHODS list — if a listed method/system applies, plan to use it (you will reference its id in methods_used). ' +
      'Then propose 3-6 DIVERSE, mutually distinct solution directions (e.g. analytic method, constructive proof, contradiction, numeric approximation + limit passage, categorical abstraction, ...). ' +
      'Record each direction with its core assumption and an initial feasibility estimate. Every direction must be self-contained: title / method / core_assumption written completely, defining every object they mention — no 断章取义.\n\n' +
      'feasibility ∈ [0,1]. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5}],"methods_used":[{"id":"m-...","效果":"...","建议":"..."}],"new_inventions":[{"类型":"方法|工具|...","标题":"...","内容描述":"...","是否已入库":false}]}'
  }
  function rederivePrompt(q, prog) {
    const prior = prog.map(function (d) {
      return '- ' + d.id + '「' + d.title + '」status=' + d.status + ' round=' + d.round + ' survival=' + d.survival + (d.dead_end_reason ? ' [blocker: ' + d.dead_end_reason + ']' : '') +
        (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '')
    }).join('\n')
    return personaText('explorerPersona') + 'You are a research mathematician re-deriving strategy for a problem whose prior directions stalled or failed.\n\nPROBLEM (id: ' + q.id + '): ' + q.陈述 + '\n\nPRIOR DIRECTIONS (with blockers):\n' + prior + '\n' +
      knowledgeContextText() +
      methodsIndexText() +
      capabilitiesText('solver') +
      '\nQuantitatively analyze the historical progress, blocker causes, and feasibility decay of each prior direction. Discard directions already proven dead ends (unless a new tool/idea changes that). ' +
      'Then deeply DERIVE 1-3 BRAND-NEW directions never tried before, each with a one-line motivation. Return the UNION of high-potential leftover directions and the brand-new directions (drop dead ends).\n\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5,"motivation":"..."}],"methods_used":[...],"new_inventions":[...]}'
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
    head += knowledgeContextText()
    head += methodsIndexText()
    head += capabilitiesText('solver')
    head += '\nStart from the last recorded node of direction ' + dir.id + ' (inherit progress, or branch a sub-route under it). Consult AVAILABLE METHODS first — reuse a listed method/system when it fits (report it in methods_used). Each round you MUST produce, even if incomplete:\n' +
      '- new lemmas / intermediate conclusions WITH full proofs (they become Propos/ proposition cards);\n' +
      '- each concrete sub-route tried, its progress overview, an EXPLICIT feasibility signal (e.g. "unremovable singularity", "conflicts with known theorem X"), and any blocker;\n' +
      '- lessons learned from failed attempts;\n' +
      '- an updated survival probability for this direction;\n' +
      '- ANY new theory/tool/method/idea you invented or summarized this round in new_inventions (类型：理论体系|框架|工具|方法|思想|范式|技巧) — the Method Keeper will distill it into the theory library.'
    head += '\nIf you encounter an EXTREMELY complex auxiliary conjecture/sub-problem q_sub: list it in "sub_questions" as a PROBLEM-class object with its COMPLETE statement (every object/definition/notation fully defined — 不断章取义), together with p_{q-tmp}: a PROPOSITION-class TEMPORARY ASSUMPTION answering q_sub. TEMPORARILY ASSUME p_{q-tmp} holds and continue the main line — every later proposition/conclusion depending on it MUST be stated as "若 <p_{q-tmp} 的完整陈述> 成立，则：..." (complete definitions).\n'
    head += '\nIMPORTANT — PROBABILITY RULES FOR NEW RESULTS: any 概率 / solution_probability / survival_probability you output for NEW results must be strictly BETWEEN 0 and 1 (they await independent verifier confirmation). NEVER mark your own fresh lemma or solution as 1 or 0 — that is the verifiers\' job. Only facts already recorded in Verified/ count as certain.\n'
    head += '\nIf you obtain a COMPLETE solution: adversarially self-check (construct counterexamples, test boundary conditions) BEFORE declaring success; put the full solution text in "solution".\n'
    head += '\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"status":"continue|success|dead-end","solution":"complete solution text, or null","solution_probability":0.85,"lemmas":[{"title":"...","statement":"...","proof":"...","细类型":{"分析":{}},"布尔估计":0.6,"价值/关键性":0.5,"优先级":1}],"routes":[{"title":"...","progress":"...","feasibility_signal":"...","blocker":"..."}],"lessons":["..."],"survival_probability":0.5,"dead_end_reason":"... or null","sub_questions":[{"q_sub_title":"...","q_sub_statement":"完整问题陈述(含所有对象/定义)","assumption_title":"p_{q-tmp} 标题","assumption_statement":"完整假设陈述(含所有定义)"}],"methods_used":[{"id":"<已有方法卡的ID，形如 m-abc12345，必须是 AVAILABLE METHODS 中出现的 id>","效果":"...","建议":"..."}],"new_inventions":[{"类型":"...","标题":"...","内容描述":"...","是否已入库":false}]}\n' +
      '区分规则：methods_used 只能填**已存在的方法卡 ID**（m-…，来自 AVAILABLE METHODS 列表）——引用你自己刚想出的新方法/新技巧不属于 methods_used，请如实填入 new_inventions（它会由 Method Keeper 蒸馏建卡）；不要把方法名/标题当 id 填进 methods_used。'
    return head
  }
  function verifierTargetText(r) {
    if (r.kind === 'proposition') return 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    if (r.kind === 'prop-proof') return 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    return 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
  }
  function verifierReviewPrompt(r) {
    return personaText('verifierPersona') + 'You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.\n\nTARGET (r: ' + r.kind + '):\n' + verifierTargetText(r) + '\n' +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      '\nResult ∈ [0,1] = your probability that the TARGET is CORRECT: 1 ONLY when you are fully certain (for a bare proposition: Reason must be a complete proof; for a proof/refutation/solution: you verified every step and Reason confirms the whole chain); 0 ONLY when you are certain it is wrong (Reason must be a rigorous complete refutation / pinpoint the fatal flaw); otherwise a value strictly between 0 and 1.\n' +
      '\nCitations: facts may only be cited from Verified/ (or Propos/ 状态: 已验证·真/假). Never cite an unverified or refuted object as a fact — if you need a sub-claim of a refuted card, re-derive it yourself.\n' +
      '\nIndependently output your initial review. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"detailed logic chain, potential counterexample, or supporting evidence"}'
  }
  function verifierDebatePrompt(r, transcript) {
    return personaText('verifierPersona') + 'You are one reviewer in a DEBATE ("交流群") about this object.\n\nTARGET:\n' + verifierTargetText(r) + '\n' +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      '\nFULL DEBATE HISTORY SO FAR (每轮所有评审轮流发言的记录):\n' + transcript + '\n' +
      '\nRespond to the others (agree / rebut / add new evidence, referencing earlier rounds if needed). If you changed your Result because of them, state the reason explicitly. ' +
      'Remember: formal/notation-level flaws in an otherwise correct proof should lower confidence only slightly — a mathematically correct argument is not "uncertain" because of typos; near-consensus is not a deadlock.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"updated logic chain / counterexample / proof / refutation","changed":"brief reason if you changed your Result, else null"}'
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
      '\nHARD RULES: never re-schedule verified objects; problems with 依赖未就绪 (依赖就绪=false) should wait unless you explicitly accept a temporary assumption; respect capacity (brief.free_slots); PREFER problems whose dependencies are ready and whose directions have the highest survival; DO NOT forget verification — unresolved solutions/proofs/refutations (verify_candidates) will never be checked unless you schedule a verifier; schedule at most ' + params.planningHorizon + ' actions.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"summary":"one-line plan rationale","plan":[{"action":"...","role":"...","target":"...","direction":"...","childId":"...","reason":"..."}]}'
  }
  function methodKeeperPrompt(digest) {
    return personaText('methodKeeperPersona') + 'You are the METHOD KEEPER of a mathematical research system. Your job: distill reusable THEORIES, FRAMEWORKS, TOOLS, METHODS, IDEAS (including experiential ones) invented during solving into the theory library, so future work can apply and extend them — like inventing group theory while solving an equation, or functional analysis while studying variational problems.\n\n' +
      knowledgeContextText() +
      '\nRECENT WORK DIGEST:\n' + digest + '\n\n' +
      'For each pending invention decide: create a NEW method card, or fold it into an EXISTING method (as an improvement). Only list 可信断言 for claims already verified (ids from Verified/) — everything else stays 经验 (experiential). You may propose 上级体系/子方法 links to organize methods into systems.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"new_methods":[{"标题":"...","类型":"理论体系|框架|工具|方法|思想|范式|技巧","核心内容":"...","定义与记号":"...","适用场景":"...","上级体系":[],"子方法":[],"可信断言":[],"来源":"从哪些工作提炼"}],"improvements":[{"id":"m-...","改进内容":"...","原因":"..."}]}'
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
  async function tick() {
    if (tickInFlight) return; if (!rootAgent) return; if (!scheduler.running) return; if (scheduler.gate) return
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
        q.状态 = '已解决'; q.优先级 = 'never'
        // 先置状态再写卡（writeVerifiedProblemCardIfNeeded 依赖 状态=已解决 才能生成卡）
        if (!wasSolved) { changed = true; await writeVerifiedProblemCardIfNeeded(q) }
      }
    }
    for (const p of allPropos()) {
      let pChanged = false
      const proofOne = (p.proofs || []).some(function (x) { return x.prob === 1 })
      const refuteOne = (p.refutes || []).some(function (x) { return x.prob === 1 })
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
      if (pChanged) { await saveProposition(p); changed = true }
    }
    if (changed) { for (const q of allProblems()) await saveProblem(q); logActivity('update', 'status updates applied (probability-1 closures / verified cards)') }
  }
  async function writeVerifiedPropositionCardIfNeeded(p) {
    if (p.概率 !== 1 && p.概率 !== 0) return false
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
    const sols1 = (q.solutions || []).filter(function (s) { return s.prob === 1 })
    const parts = []
    for (let i = 0; i < sols1.length; i++) parts.push('【解法 #' + (i + 1) + '】' + (sols1[i].text || ''))
    const card = { id: q.id, 标题: q.标题, 类型: '问题', 结论: true, 概率: 1, 陈述: q.陈述, 内容: parts.join('\n\n'), 分类: '问题', 来源: q.id, 时间: now() }
    return await writeVerifiedCardIfChanged(card)
  }
  // 幂等写卡：内容未变化则不重写（时间戳行不参与比较，避免每 tick 重写与日志刷屏）
  async function writeVerifiedCardIfChanged(card) {
    const rel = 'Verified/' + (card.类型 === '问题' ? '问题' : '命题') + '/' + card.id + '.md'
    const existing = await readText(rel)
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
    if (scheduler.activeCount >= params.maxParallelThreshold) return
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
    tasks['verify:' + rId] = { id: 'verify:' + rId, type: 'verify', r: c, rId: rId, status: 'spawning', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(2, params.verifierCount), createdAt: now() }
    logActivity('verify', 'verification task created for ' + rId)
    await saveAll()
    return true
  }
  async function backfillVerifiers(t) {
    while (t.children.length < t.expectedCount) {
      if (scheduler.activeCount >= params.maxParallelThreshold) break
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
      if (scheduler.activeCount >= params.maxParallelThreshold) break
      await backfillVerifiers(t)
      await saveAll() // 持久化 children（resume 时任务簿记更准确）
    }
  }

  // ================= planner (需求 3) =================
  function hasSchedulableWork() {
    if (scheduler.activeCount >= params.maxParallelThreshold) return false
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
        最高存活率: dirs.length ? Math.max.apply(null, dirs.map(function (d) { return Number(d.survival) || 0 })) : null,
        解法数: (q.solutions || []).length,
      })
    }
    const cands = (await buildVerifyCandidates()).slice(0, 10).map(function (c) { return { rId: c.rId, kind: c.kind, target: c.pId || c.qid, prob: c.prob, priority: c.priority } })
    return {
      at: now(), horizon: params.planningHorizon,
      free_slots: Math.max(0, params.maxParallelThreshold - scheduler.activeCount),
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
    if (scheduler.activeCount >= params.maxParallelThreshold) return
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
    if (actions.length === 0) {
      plannerFails += 1
      logActivity('plan', 'planner ' + planId + ' returned no usable plan (' + String(output || '').slice(0, 200) + ')')
      if (plannerFails >= (Number(params.plannerMaxFails) || 3)) { params.plannerEnabled = false; logActivity('plan', 'planner disabled after ' + plannerFails + ' consecutive failures — heuristic mode') }
      await fallbackScheduler()
      return
    }
    plannerFails = 0
    const validated = await validatePlan(actions)
    lastPlanSummary = { at: now(), planId: planId, summary: summary, actions: validated.length, outcomes: [] }
    await writeJson('Logs/Plans/' + planId + '.json', { at: now(), planId: planId, summary: summary, raw: actions, validated: validated, project: currentProject })
    logActivity('plan', 'planner ' + planId + ' → ' + validated.length + '/' + actions.length + ' valid action(s): ' + validated.map(function (a) { return a.action + (a.role ? ':' + a.role : '') + (a.target ? ':' + a.target : '') }).join(', '))
    if (validated.length === 0) {
      plannerFails += 1
      await fallbackScheduler()
      return
    }
    // manual: 计划审批门在 planner 结果到达后挂起（审批的是真实计划）；auto: 直接入队
    if (params.mode === 'manual') {
      const d = enqueueDecision('plan', 'planner ' + planId + ' 计划 ' + validated.length + ' 个动作，是否放行？', { planId: planId, plan: validated, brief: meta.brief })
      scheduler.gate = { decisionId: d.id, node: 'plan' }
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
    while (planQueue.length > 0 && scheduler.activeCount < params.maxParallelThreshold) {
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
        const progressText = buildSolverContext(getDirState(q.id), dir, 1, params.directionsPerSolver)
        await spawnChild('solver:' + q.id + ':' + dir.id, solverPrompt(q, dir, 1, progressText), { role: 'solver', qid: q.id, direction: dir.id, round: 1, description: q.陈述 })
        logActivity('solver', 'problem ' + q.id + ' direction ' + dir.id + ' solver spawned (plan)')
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
    if (scheduler.activeCount < params.maxParallelThreshold) {
      const cands = await buildVerifyCandidates()
      for (let i = 0; i < cands.length; i++) {
        if (scheduler.activeCount >= params.maxParallelThreshold) break
        const c = cands[i]
        if (verifyTaskBusy(c.rId)) continue
        await createVerifyTask(c)
        return // one per tick keeps scheduling simple
      }
    }
    // 3) solve: explorer / solver spawns (manual → gate)
    if (scheduler.activeCount >= params.maxParallelThreshold) return
    const unsolved = allProblems().filter(function (q) { return !(q.状态 === '已解决' || q.优先级 === 'never' || q.状态 === '等待依赖') }).sort(function (a, b) { return (a.优先级 === 'never' ? 999 : Number(a.优先级)) - (b.优先级 === 'never' ? 999 : Number(b.优先级)) })
    for (let i = 0; i < unsolved.length; i++) {
      if (scheduler.activeCount >= params.maxParallelThreshold) break
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
        if (scheduler.activeCount >= params.maxParallelThreshold) break
        const dir = dirs[j]
        if (dir.status === 'success' || dir.status === 'dead-end') continue
        const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.id && m.role === 'solver' })
        if (running) continue
        const progressText = buildSolverContext(dirs, dir, 1, params.directionsPerSolver)
        const promptText = solverPrompt(q, dir, 1, progressText)
        const r = await maybeGate('spawn', 'solver for problem ' + q.id + ' direction ' + dir.id, { label: 'solver:' + q.id + ':' + dir.id, promptText: promptText, meta: { role: 'solver', qid: q.id, direction: dir.id, round: 1, description: q.陈述 } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } })
        if (r && r.gated) return
      }
    }
  }

  // ================= solver / explorer handling =================
  async function handleExplorer(childId, meta, output) {
    delete agentRegistry[childId]
    const parsed = parseJson(output)
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
          m.applications = m.applications || []
          m.applications.push({ at: fmtTime(), 问题: ctx.qid || '', 方向: ctx.dirId || '', text: (mu.效果 || '') + (mu.建议 ? '；建议：' + mu.建议 : '') })
          await saveMethod(m, false)
          logActivity('method', 'application record appended to ' + mu.id + (ctx.qid ? ' (问题 ' + ctx.qid + (ctx.dirId ? ' 方向 ' + ctx.dirId : '') + ')' : ''))
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
    if (scheduler.activeCount >= params.maxParallelThreshold) return
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
      if (parsed.meta && Array.isArray(parsed.meta.created) && parsed.meta.created.length > 0) methodLog.pendingInventions = []
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

  // ================= verification (验证器) =================
  function consensus(t) { const vs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid].Result }); if (vs.length === 0) return false; return vs.every(function (v) { return v === 1 }) || vs.every(function (v) { return v === 0 }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; parts.push('Reviewer ' + i + ': Result=' + r.Result + ' Reason=' + r.Reason) } return parts.join('\n') }
  async function handleVerifier(childId, meta, output, stopReason) {
    const rId = meta.rId
    const parsed = parseJson(output)
    const Result = clamp01((parsed && parsed.Result != null) ? parsed.Result : 0.5)
    const Reason = (parsed && parsed.Reason) || ''
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
      if (scheduler.activeCount >= params.maxParallelThreshold) { t.status = 'paused'; return }
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
      scheduler.gate = { decisionId: d.id, node: 'verdict' }
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
    scheduler.activeCount = Math.max(0, scheduler.activeCount - 1)
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
      scheduler.activeCount = 0
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
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); scheduler.activeCount = 0; planQueue = []; await releaseProjectLock(); logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  async function autoResolvePending() {
    const pending = decisionQueue.filter(function (d) { return d.status === 'pending' })
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]
      try {
        if (d.node === 'spawn') { await spawnChild(d.data.label, d.data.promptText, d.data.meta); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'verdict') { await settleVerdict(d.data.task, d.data.verdict); delete tasks[d.data.task.id]; d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'plan') { planQueue = (d.data.plan || []).slice(); await applyPlanToProblemCards(planQueue); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'method-promote') { const m = methods.get(d.data.methodId); if (m) await promoteMethodToGlobal(m); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
      } catch (e) { console.error('vibe-math-v3: auto-resolve decision failed: ' + String((e && e.message) || e)) }
    }
    if (pending.length > 0) { scheduler.gate = null; logActivity('mode', 'switched to auto — auto-resolved ' + pending.length + ' pending decision(s)'); await saveAll(); scheduleTick() }
  }
  async function getStatus() {
    return {
      ok: true, initialized: rootAgent !== undefined, running: scheduler.running,
      project: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects'),
      mode: params.mode, activeCount: scheduler.activeCount, maxParallelThreshold: params.maxParallelThreshold,
      frameworkRoot: frameworkRoot(),
      problems: { total: problems.size, solved: allProblems().filter(function (q) { return q.状态 === '已解决' }).length },
      propositions: { total: propos.size, resolved: allPropos().filter(function (p) { return p.概率 === 1 || p.概率 === 0 }).length },
      verifyPending: (await buildVerifyCandidates()).length,
      methods: { project: methods.size, global: globalMethods.size, pendingInventions: methodLog.pendingInventions.length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,
      registeredAgents: Object.keys(agentRegistry).length,
      queuedPlanActions: planQueue.length,
      plannerEnabled: params.plannerEnabled, plannerFails: plannerFails,
      recentActivity: activityLog.slice(-Math.min(10, Number(params.activityLogCap) || 100)), params: params,
    }
  }
  async function checkTermination() {
    const unsolved = allProblems().filter(function (q) { return !(q.状态 === '已解决' || q.优先级 === 'never') })
    if (unsolved.length === 0 && Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0) {
      scheduler.running = false
      await releaseProjectLock()
      logActivity('stop', 'all active problems solved (never-priority excluded) and no active agents/tasks/plans — scheduler stopped (strict termination)')
      await saveAll(); await maybeWriteReport(true); await maybePushReport(true)
    } else if (Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0 && planQueue.length === 0 && unsolved.length > 0) {
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
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, activeCount: 0, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; planQueue = []; plannerFails = 0; methodLog = { pendingInventions: [], keepCount: 0, lastKeepAt: 0 }; projectLock = { sessionId: '', at: 0 }; lastReportWrite = 0; lastPushReport = 0; reportDirty = false; lastPlanSummary = null; archivedJ = {}; lastIndexWrite = 0
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
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial).', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), async function () { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project (creates Problems/<id>.md).', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' }, dependencies: { type: 'array', items: { type: 'string' } } }, ['id', 'description']), async function (args) { if (problems.has(args.id)) return { ok: false, message: 'problem id already exists' }; problems.set(args.id, { id: args.id, 标题: args.id, 状态: '求解中', 优先级: args.priority || 0, 依赖: Array.isArray(args.dependencies) ? args.dependencies : [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: args.description, 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(args.id)); await syncDependencies(); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: 'Problems/' + args.id + '.md' } })
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (creates Propos/<分类>/<id>.md).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 概率: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 分类: { type: 'string' } }, ['id', '概述']), async function (args) {
    if (propos.has(args.id)) return { ok: false, message: 'proposition id already exists' }
    const p = { id: args.id, 标题: args.id, 状态: '未定论', 概率: clamp01(args.概率 != null ? args.概率 : 0.5), 优先级: (args.优先级 != null) ? args.优先级 : 1, 依赖: [], 价值关键性: clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), 分类: args.分类 || '未分类', 陈述: args.概述, proofs: [], refutes: [], 来源问题: '', 在问题清单: false }
    propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: 'Propos/' + categoryOf(p) + '/' + p.id + '.md' }
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
  registerTool('vibe_math_method_add', 'Manually add a method card to Methods/ (creates Methods/<id>.md).', objParams({ id: { type: 'string' }, 标题: { type: 'string' }, 类型: { type: 'string' }, 核心内容: { type: 'string' }, 适用场景: { type: 'string' } }, ['id', '标题']), async function (args) { if (methods.has(args.id)) return { ok: false, message: 'method id already exists' }; const m = { id: args.id, 标题: args.标题, 类型: args.类型 || '方法', 状态: '经验', 可信断言: [], 上级体系: [], 子方法: [], 相关: [], 适用场景: args.适用场景 || '', 核心内容: args.核心内容 || '', 定义与记号: '', applications: [], improvements: [], 来源: 'user' }; methods.set(m.id, m); await saveMethod(m, false); await rebuildIndex(); return { ok: true, method: m, file: 'Methods/' + m.id + '.md' } })
  registerTool('vibe_math_method_list', 'List methods from Methods/ (+ global VibeMath/Methods/): id, 标题, 类型, 状态, 可信断言, applications count.', objParams({}), async function () { const all = Array.from(methods.values()); const g = Array.from(globalMethods.values()); return { ok: true, count: all.length, globalCount: g.length, methods: all.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: false } }).concat(g.map(function (m) { return { id: m.id, 标题: m.标题, 类型: m.类型, 状态: m.状态, 可信断言: m.可信断言 || [], applications: (m.applications || []).length, global: true } })) } })
  registerTool('vibe_math_lock_status', 'Show the project lock occupancy.', objParams({}), async function () { return { ok: true, project: currentProject, lock: projectLock } })
  registerTool('vibe_math_claim_write', 'Acquire the write lock for one target file (relative to the project root). Call before writing a Markdown file directly; a file may only be written by ONE agent at a time. Returns the display path you may write (VibeMath/Projects/<project>/<target>) and a hint.', objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await claimWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_release_write', 'Release the write lock for one target file (relative to the project root). Call after you finished writing it.', objParams({ target: { type: 'string' } }, ['target']), async function (args, agent) { return await releaseWrite(String(args.target || ''), agent) })
  registerTool('vibe_math_sync_meta', 'Report lightweight scheduling metadata after you wrote content to Markdown files (direction status/survival, registered lemma ids, methods_used/new_inventions, new method cards). Content itself stays in the md files; this only keeps the scheduler index/state in sync.', objParams({ meta: { type: 'object' } }, ['meta']), async function (args, agent) { return await syncMeta(args.meta || {}, agent) })

  // ---- 代理直接写 md 的写锁 + 轻元数据同步（任务2：代理自组织写各自对应路径的 md，避免并发写同一文件） ----
  async function claimWrite(target, agent) {
    const childId = (agent && agent.id) ? String(agent.id) : 'scheduler'
    const key = String(target || '').replace(/\\/g, '/')
    if (!key) return { ok: false, message: 'target required' }
    const owner = fileOwner[key]
    if (owner && owner.childId !== childId && (now() - (owner.at || 0)) < 60000) {
      return { ok: false, busy: owner.childId, message: '文件 "' + key + '" 正被其他代理写入，请稍后（写锁）' }
    }
    // 确保目标父目录存在（如 Progress/<qid>/ 供方向文件写入）
    const pm = /^(Progress|Propos|Methods)\/([^/]+)\//.exec(key)
    if (pm) { const base = frameworkRoot(); await runShell('New-Item -Force -ItemType Directory -Path ' + psQuote(base + '/' + pm[1] + '/' + pm[2]) + ' | Out-Null') }
    fileOwner[key] = { childId: childId, sessionId: sessionId, at: now() }
    logActivity('write-lock', 'claim ' + key + ' by ' + childId)
    return { ok: true, key: key, path: frameworkRoot() + '/' + key, hint: '现在可写入 ' + frameworkRoot() + '/' + key + '；写完请 release_write' }
  }
  async function releaseWrite(target, agent) {
    const childId = (agent && agent.id) ? String(agent.id) : 'scheduler'
    const key = String(target || '').replace(/\\/g, '/')
    const owner = fileOwner[key]
    if (owner && owner.childId !== childId) return { ok: false, message: '写锁不属于此代理，无法释放' }
    delete fileOwner[key]
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
          return { id: d.id || ('d_' + shortId()), title: d.title || '', method: d.method || old?.method || '', core_assumption: d.core_assumption || old?.core_assumption || '', feasibility: clamp01(d.feasibility != null ? d.feasibility : (old ? old.survival : 0.5)), status: 'active', round: old ? old.round : 0, survival: clamp01(d.survival != null ? d.survival : (old ? old.survival : 0.5)), routes: old?.routes || [], lessons: old?.lessons || [], blockers: old?.blockers || [], lemmas: old?.lemmas || [], journal: old?.journal || [], dead_end_reason: '' }
        })
        dirState.set(qid, list)
        await saveDirState(); await writeJournal(qid)
        await consumeMethodFeedback(meta, { qid: qid })
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
        if (meta.status) dir.status = String(meta.status)
        if (meta.dead_end_reason) dir.dead_end_reason = String(meta.dead_end_reason)
        if (meta.round) dir.round = Number(meta.round)
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
              const rel = 'Propos/' + categoryOf(pn) + '/' + pid + '.md'
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
          if ((await readText('Methods/' + mid + '.md')) === undefined) await saveMethod(mm, false)
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
    if (cmd === 'add') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; if (problems.has(id)) return { ok: false, message: 'problem id already exists' }; problems.set(id, { id: id, 标题: id, 状态: '求解中', 优先级: 0, 依赖: [], 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: desc, 来源与动机: '', solutions: [], 判断命题: '', 来源命题: '' }); await saveProblem(problems.get(id)); await rebuildIndex(); scheduleTick(); return { ok: true, message: 'problem added', file: 'Problems/' + id + '.md' } }
    if (cmd === 'add-proposition') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add-proposition <id> <概述>' }; const p = { id: id, 标题: id, 状态: '未定论', 概率: 0.5, 优先级: 1, 依赖: [], 价值关键性: 0.5, 分类: '未分类', 陈述: desc, proofs: [], refutes: [], 来源问题: '', 在问题清单: false }; propos.set(p.id, p); await saveProposition(p); await rebuildIndex(); scheduleTick(); return { ok: true, proposition: p, file: 'Propos/' + categoryOf(p) + '/' + p.id + '.md' } }
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
    scheduler: scheduler,
    tickInFlight: tickInFlight,
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
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial).', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, plannerPersona: { type: 'string' }, methodKeeperPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, planningHorizon: { type: 'integer' }, plannerEnabled: { type: 'boolean' }, plannerProvider: { type: 'string' }, plannerModel: { type: 'string' }, planMinIntervalMs: { type: 'integer' }, plannerMaxFails: { type: 'integer' }, methodKeepIntervalMs: { type: 'integer' }, methodKeepEvery: { type: 'integer' }, methodAutoPromote: { type: 'boolean' }, indexAutoRebuild: { type: 'boolean' }, projectLockTimeoutMs: { type: 'integer' } }), 'vibe_math_set_params')
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
  registerTool('vibe_math_sync_meta', 'Report lightweight scheduling metadata after writing content to Markdown files.', objParams({ meta: { type: 'object' } }, ['meta']), 'vibe_math_sync_meta')

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
  })

  // tick timer (registered once; ticks every running session at its own pace)
  ctx.effect(() => { const t = setInterval(function () { for (const s of sessions.values()) { if (s.getRunning() && !s.tickInFlight && s.tickDue() && s.scheduler.gate === null) s.scheduleTick() } }, 1000); return () => clearInterval(t) })
}
