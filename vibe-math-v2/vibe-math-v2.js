// Vibe Math V2 — host plugin implementing the NEW architecture spec
// ("新架构-vibe-math-实现方案.md"): probability-driven scheduling over a
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
    verdictMode: 'flat',          // flat = 均衡机制(0.5) | forced = 强制裁决(weighted)
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
    activityLogCap: 100,          // 活动日志保留条数（report.recentActivity 最多显示 30 条）
    maxExplorerRetries: 3,        // explorer 重派生上限（拆方向失败重试次数）
    // ---- Lean 形式化验证（契约：docs/formal-verification.md §1，四架构同名同语义）----
    formalVerify: 'off',          // off = 无任何额外要求（真无操作）| encourage = 鼓励但不强制 | require = 强制 + 定论门禁
    leanCommand: 'lean',          // 要执行的 Lean 可执行文件（例：'lake'）
    leanArgs: [],                 // 插在文件名之前的附加参数（例：['env','lean'] 配合 leanCommand='lake'）
    leanTimeoutMs: 120000,        // 单次 Lean 运行的超时上限（毫秒）
  }
  let params = Object.assign({}, DEFAULT_PARAMS)
  let scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null } // activeCount 由 activeCount() 从 agentRegistry 推导，不再作为字段
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

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function now() { return Date.now() }
  function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }
  function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }
  function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} const sp = sandboxPolicyOf(); if (sp && sp.workspaceRoot) return sp.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }
  function safeId(s) { return String(s == null ? 'anon' : s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon' }
  let warnedNoPolicy = false
  function warnNoPolicyOnce() { if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v2: sandboxPolicy unavailable; writes go out with no explicit policy') } }
  // Sandbox fence for our own writes. The `resolve({})` fallback is a last resort and is
  // deliberately reported (once): with no session it resolves the policy's CONFIGURED root
  // (dsh-sandbox-policy: resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())),
  // which is not necessarily this session's workspace — a silently different fence.
  function getPolicy() { const sp = sandboxPolicyOf(); if (!sp) { warnNoPolicyOnce(); return undefined } try { if (rootAgent && rootAgent.session) return sp.resolve({ session: rootAgent.session }) } catch (e) { warnNoPolicyOnce() } try { const p = sp.resolve({}); if (!warnedNoPolicy) { warnedNoPolicy = true; console.error('vibe-math-v2: falling back to sandboxPolicy.resolve({}) — the fence root is the host-configured workspace, not necessarily this session cwd') } return p } catch (e) { warnNoPolicyOnce() } return undefined }
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
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数（agent_self_iteration 上限）', suggestion: 3 },
    { name: 'directionsPerSolver', type: 'integer', description: '每个 solver 提示词附带的其他活跃方向摘要数量：1 = 只看自己方向（互不干扰）；N>1 = 额外附带最多 N 个其他活跃方向摘要用于协调', suggestion: 1 },
    { name: 'verifierCount', type: 'integer', description: '每个验证对象的独立验证器数量', suggestion: 3 },
    { name: 'debateMaxRounds', type: 'integer', description: '验证辩论（交流群）最大轮数', suggestion: 5 },
    { name: 'verdictMode', type: 'enum', options: ['flat', 'forced'], description: 'flat = 均衡机制（不一致直接判 0.5）；forced = 强制裁决（按历史准确率+严谨性加权）', suggestion: 'flat' },
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
    { name: 'solverAllowNetwork', type: 'boolean', description: '求解器网络工具开关：空=继承全部；true=允许（在已有 allow 列表时补入网络工具）；false=禁止 web_search/web/fetch', suggestion: '' },
    { name: 'verifierAllowNetwork', type: 'boolean', description: '验证器网络工具开关（同 solverAllowNetwork）', suggestion: '' },
    { name: 'solverAllowScripts', type: 'boolean', description: '求解器脚本工具开关：空=继承全部；true=允许（在已有 allow 列表时补入）；false=禁止 bash/pwsh', suggestion: '' },
    { name: 'verifierAllowScripts', type: 'boolean', description: '验证器脚本工具开关（同 solverAllowScripts）', suggestion: '' },
    { name: 'solverMaxToolCalls', type: 'integer', description: '求解器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'verifierMaxToolCalls', type: 'integer', description: '验证器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'reportIntervalMs', type: 'integer', description: '进度汇报间隔（毫秒）：0 = 仅事件驱动（有代理状态更新等事件才写/推报告）；>0 = 同时按该间隔定时自动汇报', suggestion: 0 },
    { name: 'reportMode', type: 'enum', options: ['file', 'push', 'both'], description: 'file = 写报告文件；push = 推送消息让主代理主动汇报；both = 两者都做', suggestion: 'file' },
    { name: 'promoteValueThreshold', type: 'number', description: 'Propos 中「价值/关键性」≥ 该值且未决(0,1) 的命题自动加入 qs.json', suggestion: 0.7 },
    { name: 'priorityAdjust', type: 'enum', options: ['none', 'deadend-deprioritize', 'survival-map'], description: '优先级动态调整策略：none=不自动调；deadend-deprioritize=方向全死路时降优先级；survival-map=按最高方向存活率重算（存活率高越优先）', suggestion: 'none' },
    { name: 'proposPriorityAdjust', type: 'enum', options: ['none', 'progress-graded'], description: '命题优先级动态调整：none=不自动调；progress-graded=按「定论接近度（|布尔估计-0.5|）+ 证明/证伪材料量」重算，越接近定论越优先验证', suggestion: 'none' },
    { name: 'tickIntervalMs', type: 'integer', description: '调度器心跳间隔（毫秒）：多久扫描一次子代理状态并推进（越小越灵敏、越大越省资源）', suggestion: 2000 },
    { name: 'activityLogCap', type: 'integer', description: '活动日志保留条数（影响 report.recentActivity 的细节量，报告最多显示 30 条）', suggestion: 100 },
    { name: 'maxExplorerRetries', type: 'integer', description: 'explorer 拆方向失败的重派生上限（达到后该问题标记为方向耗尽）', suggestion: 3 },
    { name: 'formalVerify', type: 'enum', options: ['off', 'encourage', 'require'], description: 'Lean 形式化验证档位：off=不额外要求（默认，提示词里不出现 Lean）；encourage=鼓励按实现难度自行形式化，一旦 Lean 通过则验证重点转为「忠实性审查」；require=同 encourage 且加门禁——对象的 formal.status 未达到 passed/blocked 前，真/假裁定记为未定论（原因 formal-required）并写入 Formal/TODO.md', suggestion: 'off' },
    { name: 'leanCommand', type: 'string', description: '要执行的 Lean 可执行文件（默认 lean；用 lake 时配合 leanArgs=["env","lean"]）', suggestion: 'lean' },
    { name: 'leanArgs', type: 'string[]', description: '插在 .lean 文件名之前的附加命令行参数（默认空）', suggestion: [] },
    { name: 'leanTimeoutMs', type: 'integer', description: '单次 Lean 运行的超时上限（毫秒，默认 120000，最小 1000）', suggestion: 120000 },
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
  // 目录布局（docs/formal-verification.md §3）：
  //   项目内：Formal/（对象形式化工作文件 + Index.md + TODO.md）、Verified/Lean/（归档证明）
  //   全局（**不在项目内**，跨项目复用）：<VibeMath 根>/Formal/Lib/（可复用定义）、Formal/Proved/（已证引理）
  async function ensureDirs() {
    const base = frameworkRoot()
    const dirs = ['qs', 'Propos', 'Reliable', 'Verified', 'Verified/Lean', 'Verification_logs', 'Progress_Logs', 'VibeMath_State', 'Formal']
    const paths = [vibeRoot() + '/Projects', vibeRoot() + '/Formal/Lib', vibeRoot() + '/Formal/Proved'].concat(dirs.map(function (d) { return base + '/' + d }))
    return await runShell(mkdirCmd(paths))
  }
  async function removeFile(rel) { const base = frameworkRoot(); return await runShell(rmCmd(base + '/' + rel)) }

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
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
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
      else { out[k] = v }
    }
    // 非正的 leanTimeoutMs 会让每次 Lean 运行立即"超时"，而超时被记成"未通过"——静默失效。
    // 删除该键（回退默认），而不是抬到最小值，与 v5/v4 的既有处理一致。
    if (out.leanTimeoutMs !== undefined && !(out.leanTimeoutMs > 0)) delete out.leanTimeoutMs
    if (out.leanTimeoutMs !== undefined) out.leanTimeoutMs = Math.max(1000, out.leanTimeoutMs)
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
  async function loadState() {
    const s = await readJson('VibeMath_State/scheduler_state.json')
    // 丢弃历史持久化的 activeCount：旧值可能已经漂移，绝不能覆盖推导值（见 activeCount()）。
    if (s) { const restored = Object.assign({}, s); delete restored.activeCount; scheduler = Object.assign({}, scheduler, restored) }
    const r = await readJson('VibeMath_State/agent_registry.json'); if (r) agentRegistry = r
    const dq = await readJson('VibeMath_State/decision_queue.json'); if (dq) decisionQueue = dq
    const va = await readJson('VibeMath_State/verifier_accuracy.json'); if (va) verifierAccuracy = va
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
    const started = now()
    const rel = String(relPath || '').trim()
    if (!rel) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'file is required' }
    // 路径守卫：只允许执行 VibeMath 树内的文件，构造出来的路径不能让我们跑工作区之外的东西。
    const abs = leanAbsPath(rel)
    if (abs === null) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: 'Lean 文件必须位于 ' + vibeRoot() + '/ 之内（收到 ' + rel + '）' }
    if (!/\.lean$/.test(abs)) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '只有 .lean 文件可以执行' }
    if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V2_NOT_FOUND', message: 'no such file: ' + rel }
    const sub = subprocessOf()
    if (sub === undefined || typeof sub.spawn !== 'function') {
      return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel, ms: 0 }
    }
    const cap = Math.max(1000, Number(timeoutMs) || Number(params.leanTimeoutMs) || 120000)
    let exe
    try {
      exe = await sub.resolveExecutable(String(params.leanCommand || 'lean'))
    } catch (e) {
      return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + String(params.leanCommand || 'lean') + '": ' + String((e && e.message) || e) + ' —— 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
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
      command: argv.join(' '), file: rel,
      stdout: tailText(out, 4000), stderr: tailText(err, 4000),
      timedOut: isTimeout,
      code: ok ? undefined : (isTimeout ? 'LEAN_TIMEOUT' : 'LEAN_FAILED'),
    }
  }
  // 把一次运行结果写进对象的形式化记录（不提升 status，状态迁移见契约 §4）。
  async function formalSetRun(target, run) {
    const t = safeId(String(target || ''))
    if (!t) return
    const prev = formalOf(t)
    await putFormal(t, Object.assign({}, prev, {
      status: prev.status === 'passed' ? 'passed' : (prev.status === 'blocked' ? 'blocked' : 'attempted'),
      file: run.file || prev.file || '',
      run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: tailText(run.stdout, 800), stderrTail: tailText(run.stderr, 800) },
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
        objectId: objectId,
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
   *   ② 记录里记着的 `objectId`（写记录时由**拿到对象 id 的那条路径**写上，见 `syncVerificationTarget`）。
   * 只靠字符串后缀解析会有歧义：**对象 id 本身以 `-s1`/`-pf1`/`-rf1` 结尾**时（例如命题 `pAmb-s1` 的
   * 验证 id 是 `r-pAmb-s1`），后缀剥离会把对象截成 `pAmb` —— 另一个对象。后果不是"少一条记录"而是
   * **张冠李戴**：忠实性提示词会打印邻居的证明路径、`defect` 回执会降级邻居的记录并**撤回邻居的归档
   * 证明**，而真正的对象仍然 `passed`（实测复现，见 `formal-verify-v2` 的 ambiguity 用例）。
   * 字符串解析只是前两者都不可用时的兜底。
   */
  function formalObjectIdOf(id) {
    const t = safeId(String(id == null ? '' : id))
    const task = tasks['verify:' + t]
    if (task && task.r) {
      const owner = String(task.r.pId || task.r.qid || '')
      if (owner) return safeId(owner)
    }
    const rec = formalRecords()[t]
    if (rec && rec.objectId) return safeId(rec.objectId)
    const m = /^r-(.+?)(?:-(?:s\d+|pf\d+|rf\d+))?$/.exec(t)
    return m ? m[1] : t
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
    // （对象 id 本身可能以 -sN/-pfN/-rfN 结尾，后缀剥离会指向另一个对象）。
    const withOwner = (t === objectId) ? patch : Object.assign({ objectId: objectId }, patch)
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
      L.push('  · 工具：vibe_math_lean_run（执行）· vibe_math_lean_archive（归档）· vibe_math_lean_lib（查已有可复用库）')
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
      L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或宿主不提供 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明'
        + '"宿主无 Lean 工具链"——这算显式阻塞原因，定论门禁可以据此放行。')
    }
    return L.join('\n')
  }
  function formalWorkLine() {
    if (!formalOn()) return ''
    // `Formal/Proved/` 在项目根下**并不存在**（可复用库故意在项目树之外），只写相对路径会让代理
    // 去项目里找一个永远找不到的目录；这里与验证段落一样给出 VibeMath 根的绝对路径（契约 §6.2）。
    return '【顺手形式化（' + (formalMode() === 'require' ? '强制' : '鼓励') + '）】把你工作中常用或可能复用的对象、假设、'
      + '新定义用 Lean 形式化定义并归档到全局可复用库（vibe_math_lean_archive kind=\'def\'），已成立的引理归到 '
      + vibeRoot().replace(/\\/g, '/') + '/Formal/Proved/（kind=\'lemma\'）；写之前先 vibe_math_lean_lib 查重，避免重复定义。'
      + '归档前先跑通（vibe_math_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
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
  function fmtTime(ms) { try { return new Date(Number(ms) || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return '' } }
  async function rebuildLeanLibIndexes() {
    // 扫描**不执行**工具链：每次问"有什么可复用"就跑一遍 lean 既慢又出人意料。
    // 每个对象的运行结果存在对象记录里，显示在 Formal/Index.md。
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
          rows.push('| ' + name + ' | ' + rel + ' | ' + kindLabel + ' | ' + first.replace(/\|/g, '/') + ' |')
        }
      } catch (e) { /* 列表尽力而为 */ }
      return rows
    }
    const libRows = await scan(vibeRoot() + '/Formal/Lib', 'Formal/Lib', 'def')
    await writeTextAbs(vibeRoot() + '/Formal/Lib/Index.md', ['# 可复用 Lean 定义库（跨项目）｜' + currentProject, '',
      '> 写新定义之前先查这里：能复用就不要重新定义。', '',
      '| 名称 | 文件 | 类别 | 摘要 |', '|---|---|---|---|']
      .concat(libRows.length ? libRows : ['| （暂无） | | | |']).join('\n') + '\n')
    const provedRows = await scan(vibeRoot() + '/Formal/Proved', 'Formal/Proved', 'lemma')
    await writeTextAbs(vibeRoot() + '/Formal/Proved/Index.md', ['# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）｜' + currentProject, '',
      '> 这些文件是通过内核检查的引理，可直接 import 复用。', '',
      '| 名称 | 文件 | 类别 | 陈述 |', '|---|---|---|---|']
      .concat(provedRows.length ? provedRows : ['| （暂无） | | | |']).join('\n') + '\n')
    await writeFormalIndex()
    await writeFormalTodo()
    return { lib: libRows.length, proved: provedRows.length, objects: Object.keys(formalRecords()).length }
  }

  // 执行一个 Lean 文件，记录运行结果（可按 target 归属到对象），刷新索引，并**原样**回报结果。
  // 刻意在 `off` 档也照常工作：人要调试自己的工具链时仍然可用。
  async function leanRunTool(memberId, o) {
    const args = o || {}
    const run = await leanRunFile(String(args.file || ''), args.timeout_ms)
    if (run.ok || run.file) {
      if (String(args.target || '').trim()) await formalSetRun(String(args.target), run)
      await writeFormalIndex()
    }
    if (run.ok) logActivity('formal', (memberId || 'office') + ' 运行 Lean 通过：' + run.file + '（' + (run.ms / 1000).toFixed(1) + 's）' + (args.target ? '｜对象 ' + args.target : ''))
    return Object.assign({ ok: !!run.ok }, run, {
      hint: run.ok
        ? '通过。若是某个对象的证明，请用 vibe_math_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库（归档时会先跑一次，跑不通不要入库）。'
        : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_math_lean_archive kind=\'blocked\' 记录原因。',
    })
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
  async function getQs() { const a = await readJson('qs/qs.json'); return Array.isArray(a) ? a : [] }
  async function writeQs(list) { await writeJson('qs/qs.json', list) }
  async function findQ(qid) { const qs = await getQs(); return qs.find(function (q) { return q.id === qid }) }

  // progress：结构化 JSON 对象（旧数据可能是 JSON 字符串，两者兼容解析）。
  // 注意：必须保证返回对象含 directions 数组（晋升/判断/子问题等 progress 可能只有来源/说明等字段）。
  function parseProgress(q) {
    const raw = (q && q.progress) || null
    let p = null
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) p = raw
    else p = safeJson(raw, null)
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { directions: [], experience: '' }
    if (!Array.isArray(p.directions)) p.directions = []
    return p
  }
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
      for (let j = 0; j < list.length; j++) { list[j]._category = cat; out.push(list[j]) }
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
      recentActivity: activityLog.slice(-Math.min(30, Number(params.activityLogCap) || 100)),
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
      rootAgent.followup({ id: uuid(), role: 'user', content: [textBlock(text)], source: { kind: 'plugin', plugin: 'vibe-math-v2' } })
      lastPushReport = now()
    } catch (e) {
      console.error('vibe-math-v2: push report failed: ' + String((e && e.message) || e))
    }
  }

  // ================= child spawn / followup =================
  function pickProvider() { try { const names = subagents.list ? subagents.list() : []; if (names.indexOf('spawn') !== -1) return 'spawn'; if (names.indexOf('fork') !== -1) return 'fork' } catch (e) {} return 'spawn' }
  function childAgentOptions() { const o = {}; try { if (rootAgent && rootAgent.options) { if (rootAgent.options.provider) o.provider = rootAgent.options.provider; if (rootAgent.options.model) o.model = rootAgent.options.model } } catch (e) {} if (params.provider) o.provider = params.provider; if (params.model) o.model = params.model; return o }
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
  function buildToolFilter(role) { const allow = role === 'solver' ? params.solverToolAllow : role === 'verifier' ? params.verifierToolAllow : undefined; const deny = role === 'solver' ? params.solverToolDeny : role === 'verifier' ? params.verifierToolDeny : undefined; const net = role === 'solver' ? params.solverAllowNetwork : role === 'verifier' ? params.verifierAllowNetwork : undefined; const scr = role === 'solver' ? params.solverAllowScripts : role === 'verifier' ? params.verifierAllowScripts : undefined; let a = Array.isArray(allow) ? allow.slice() : []; let d = Array.isArray(deny) ? deny.slice() : []; if (net === false) d = d.concat(NETWORK_TOOLS); else if (net === true && a.length > 0) a = a.concat(NETWORK_TOOLS); if (scr === false) d = d.concat(SCRIPT_TOOLS); else if (scr === true && a.length > 0) a = a.concat(SCRIPT_TOOLS); const f = {}; if (a.length > 0) f.allow = a; if (d.length > 0) f.deny = d; return (f.allow || f.deny) ? f : undefined }
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
    agentRegistry[started.childId] = Object.assign({ createdAt: now() }, meta || {})
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
    if (!t) return ''
    // 回执契约（契约 §6.3）：工作轮也必须被告知 formal 字段，否则"顺手形式化"里做出的难度判断
    // 无处可写，代理只能沉默——那正是 v2 首版死通道的成因。
    return '\n' + t + formalReplyNote() + '\n'
  }
  function capabilitiesText(role) {
    const maxCalls = role === 'solver' ? params.solverMaxToolCalls : params.verifierMaxToolCalls
    const netOn = role === 'solver' ? params.solverAllowNetwork : params.verifierAllowNetwork
    const scrOn = role === 'solver' ? params.solverAllowScripts : params.verifierAllowScripts
    const toolParts = []
    if (netOn !== false) toolParts.push('web search / literature lookup')
    if (scrOn !== false) toolParts.push('symbolic/numeric computation (running scripts)')
    let t = '\nYOUR PERMISSIONS / CAPABILITIES:\n'
    t += '- Network tools (web search / fetch): ' + (netOn === false ? 'DISABLED for you' : 'available') + '; Script/shell tools (bash/pwsh): ' + (scrOn === false ? 'DISABLED for you' : 'available') + ' (your actual tool list is enforced by the framework).\n'
    t += toolParts.length > 0
      ? ('- You may use external tools (' + toolParts.join(', ') + ') to assist; ' + ((maxCalls && Number(maxCalls) > 0) ? ('call such external tools AT MOST ' + maxCalls + ' times this round.\n') : 'no per-round limit by default.\n'))
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
  function verifierReviewPrompt(r) {
    let target = ''
    if (r.kind === 'proposition') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    else if (r.kind === 'prop-proof') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    else target = 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
    return verifierPersonaText() + 'You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.\n\nTARGET (r: ' + r.kind + '):\n' + target + '\n' +
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
    if (node === 'verdict') { const overridden = resolution.action === 'override' && (resolution.verdict === 1 || resolution.verdict === 0); const v = overridden ? Number(resolution.verdict) : data.verdict; await settleVerdict(data.task, v); delete tasks[data.task.id]; return { verdict: v, overridden: overridden } }
    return {}
  }
  async function resolveDecision(id, resolution) { const d = decisionQueue.find(function (x) { return x.id === id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; d.status = 'resolved'; d.resolution = resolution; if (scheduler.gate && scheduler.gate.decisionId === id) scheduler.gate = null; logActivity('decide', id + ' resolved: ' + resolution.action + (resolution.verdict !== undefined ? ' ' + resolution.verdict : '')); await saveAll(); scheduleTick(); return { ok: true, message: 'decision resolved' } }

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
      if (unsolved.length === 0 && Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0) {
        scheduler.running = false
        logActivity('stop', 'all active problems solved (never-priority problems excluded) and no active agents/tasks — scheduler stopped (strict termination)')
        await saveAll(); await maybeWriteReport(true); await maybePushReport(true)
      } else if (Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0 && unsolved.length > 0) {
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
  async function processVerify() {
    const candidates = await buildVerifyCandidates()
    for (let i = 0; i < candidates.length; i++) {
      if (activeCount() >= params.maxParallelThreshold) break
      const c = candidates[i]
      const rId = c.rId
      if (tasks['verify:' + rId]) continue
      const inflight = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'verifier' && m.rId === rId })
      if (inflight) continue
      tasks['verify:' + rId] = { id: 'verify:' + rId, type: 'verify', r: c, rId: rId, status: 'spawning', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(2, params.verifierCount), createdAt: now() }
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
        if (s.正确概率 === 1 || s.正确概率 === 0 || s.已验) continue
        if (!String(s.完整解法 || '').trim()) continue
        out.push({ rId: 'r-' + q.id + '-s' + j, kind: 'problem-solution', qid: q.id, 概述: q.概述, process: s.完整解法 || '', idx: j, prob: Number(s.正确概率) || 0, priority: q.优先级 === 'never' ? 999 : Number(q.优先级) })
      }
    }
    const propos = await getPropos()
    for (let i = 0; i < propos.length; i++) {
      const p = propos[i]
      if (p.布尔估计 === 1 || p.布尔估计 === 0 || p.优先级 === 'never') continue
      if (p.已验证) continue // 收敛闸门：该命题已由「判断命题」解法裁决过（见 settleVerdict 点5 联动），不再重复入选
      if (p.在问题清单) continue // 已晋升：其证明/证伪经晋升问题的解法验证，避免同一内容双重验证
      const proofs = p.证明列表 || []; const refutes = p.证伪列表 || []
      if (proofs.length === 0 && refutes.length === 0) {
        if (String(p.id).indexOf('p-tmp-') === 0) continue // 临时假设由「判断下述命题是否成立：p_{q-tmp}」问题统一验证，避免裸命题验证双重路径
        out.push({ rId: 'r-' + p.id, kind: 'proposition', pId: p.id, 概述: p.概述, prob: Number(p.布尔估计) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) })
      } else {
        for (let j = 0; j < proofs.length; j++) { if (proofs[j].正确概率 === 1 || proofs[j].正确概率 === 0 || proofs[j].已验) continue; if (!String(proofs[j].完整过程 || '').trim()) continue; out.push({ rId: 'r-' + p.id + '-pf' + j, kind: 'prop-proof', pId: p.id, 概述: p.概述, side: '证明', process: proofs[j].完整过程 || '', idx: j, prob: Number(proofs[j].正确概率) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }) }
        for (let j = 0; j < refutes.length; j++) { if (refutes[j].正确概率 === 1 || refutes[j].正确概率 === 0 || refutes[j].已验) continue; if (!String(refutes[j].完整过程 || '').trim()) continue; out.push({ rId: 'r-' + p.id + '-rf' + j, kind: 'prop-proof', pId: p.id, 概述: p.概述, side: '证伪', process: refutes[j].完整过程 || '', idx: j, prob: Number(refutes[j].正确概率) || 0, priority: p.优先级 === 'never' ? 999 : Number(p.优先级) }) }
      }
    }
    out.sort(function (a, b) { if (a.priority !== b.priority) return a.priority - b.priority; return (b.prob || 0) - (a.prob || 0) })
    return out
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
    if (parsed) {
      if (parsed.routes) dir.routes = (dir.routes || []).concat(parsed.routes)
      if (parsed.lessons) dir.lessons = (dir.lessons || []).concat(parsed.lessons)
      if (parsed.dead_end_reason) dir.dead_end_reason = parsed.dead_end_reason
      if (typeof parsed.survival_probability === 'number') dir.survival = clamp01(parsed.survival_probability)
      if (parsed.lemmas && parsed.lemmas.length) { for (let i = 0; i < parsed.lemmas.length; i++) { const lid = await addLemmaAsProposition(qid, parsed.lemmas[i]); if (lid) { dir.lemmas = dir.lemmas || []; dir.lemmas.push({ id: lid, title: parsed.lemmas[i].title || '' }) } } }
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
  async function addLemmaAsProposition(qid, lemma) {
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
    await upsertProposition(p)
    logActivity('proposition', 'lemma「' + lemma.title + '」→ ' + p.id)
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
    qs.push({ id: judgeId, 概述: '判断下述命题是否成立：' + assumeStatement, 已解决: false, 解法列表: [], 优先级: 1, 判断命题: assumeId, progress: { 类型: 'judge', 假设命题: assumeId, 说明: '由临时假设 p_{q-tmp}（' + assumeId + '）生成；它是对子问题 ' + subId + ' 的一种回答的命题化。' } })
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
  function consensus(t) { const vs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid].Result }); if (vs.length === 0) return false; return vs.every(function (v) { return v === 1 }) || vs.every(function (v) { return v === 0 }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; parts.push('Reviewer ' + i + ': Result=' + r.Result + ' Reason=' + r.Reason) } return parts.join('\n') }
  function verifierWeight(cid, rigor) { const acc = verifierAccuracy[cid] || { correct: 0, total: 0 }; const base = acc.total > 0 ? (acc.correct / acc.total) : 0.5; const bonus = (typeof rigor === 'number' && Number.isFinite(rigor)) ? Math.max(-0.2, Math.min(0.2, rigor)) : 0; return Math.max(0.05, Math.min(0.95, base + bonus)) }
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
    if (!t) { t = { id: 'verify:' + rId, type: 'verify', r: { kind: 'proposition', pId: rId, 概述: rId }, rId: rId, status: 'debating', children: [], childResults: {}, history: [], round: 1, expectedCount: Math.max(2, params.verifierCount), createdAt: now() }; tasks[t.id] = t }
    if (!parsed && !scheduler.running) {
      // abort：被中断的验证器没有产出，丢弃该子代理并清理任务簿记（任务在 resume 时由 processVerify 重建）
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
  function finalVerdict(t) {
    const rs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid] })
    if (rs.length === 0) return 0.5
    if (rs.every(function (r) { return r.Result === 1 })) return 1
    if (rs.every(function (r) { return r.Result === 0 })) return 0
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
    return 0.5 // flat = 均衡机制
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
  async function settleVerdict(t, verdict) {
    const v = clamp01(verdict)
    const r = t.r
    const cids = Object.keys(t.childResults)
    // update verifier historical accuracy (forced mode audit)
    for (let i = 0; i < cids.length; i++) {
      const acc = verifierAccuracy[cids[i]] || { correct: 0, total: 0 }
      acc.total += 1
      if (t.childResults[cids[i]].Result === v) acc.correct += 1
      verifierAccuracy[cids[i]] = acc
    }
    await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy)
    // debate transcript log
    await writeJson('Verification_logs/' + t.rId + '_' + Date.now() + '.json', { r: r, verdict: v, results: t.childResults, transcript: buildTranscript(t), history: t.history || [], at: now() })

    if (r.kind === 'proposition') {
      const p = await findProposition(r.pId)
      if (p) {
        // require 门禁：裸命题的 1/0 裁定不生效（对象留在原库、布尔估计不变、无卡片）
        if (await formalVerdictDeferred(t, v, v === 1 || v === 0)) return
        p.布尔估计 = v
        if (v === 1) { p.证明列表 = p.证明列表 || []; p.证明列表.push({ 完整过程: strongestReason(t, 1), 正确概率: 1, '支持信息/依据': '', 已验: true }); p.优先级 = 'never' }
        else if (v === 0) { p.证伪列表 = p.证伪列表 || []; p.证伪列表.push({ 完整过程: strongestReason(t, 0), 正确概率: 1, '支持信息/依据': '', 已验: true }); p.优先级 = 'never' }
        else {
          p.证明列表 = p.证明列表 || []; p.证伪列表 = p.证伪列表 || []
          p.证明列表.push({ 完整过程: strongestReason(t, 1) || '根据辩论得到的支持性论证', 正确概率: v, '支持信息/依据': '', 已验: true })
          p.证伪列表.push({ 完整过程: strongestReason(t, 0) || '根据辩论得到的反驳性论证', 正确概率: 1 - v, '支持信息/依据': '', 已验: true })
        }
        await upsertProposition(p)
        await writeVerifiedCardIfNeeded(p)
      }
    } else if (r.kind === 'prop-proof') {
      const p = await findProposition(r.pId)
      if (p) {
        // require 门禁：一条证明/证伪被判定为 1（严格成立）时同样受门禁约束
        if (await formalVerdictDeferred(t, v, v === 1)) return
        const list = r.side === '证明' ? (p.证明列表 = p.证明列表 || []) : (p.证伪列表 = p.证伪列表 || [])
        const item = list[r.idx]
        if (item) {
          item.正确概率 = v
          item.已验 = true
          if (v === 1) { item['支持信息/依据'] = strongestReason(t, 1) || item['支持信息/依据'] }
          else if (v === 0) {
            const other = r.side === '证明' ? (p.证伪列表 = p.证伪列表 || []) : (p.证明列表 = p.证明列表 || [])
            other.push({ 完整过程: strongestReason(t, 0) || '', 正确概率: 1, '支持信息/依据': '判定 ' + r.side + ' 错误后的反证', 已验: true })
          } else {
            const other = r.side === '证明' ? (p.证伪列表 = p.证伪列表 || []) : (p.证明列表 = p.证明列表 || [])
            other.push({ 完整过程: strongestReason(t, v >= 0.5 ? 0 : 1) || '辩论得出的相反方向论证', 正确概率: 1 - v, '支持信息/依据': '', 已验: true })
            item['支持信息/依据'] = strongestReason(t, v >= 0.5 ? 1 : 0) || item['支持信息/依据']
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
          if (await formalVerdictDeferred(t, v, v === 1)) return
          sol.正确概率 = v
          sol.已验 = true
          sol.验证记录 = sol.验证记录 || []
          sol.验证记录.push({ 结果: v, 时间: now(), 依据: strongestReason(t, v >= 0.5 ? 1 : 0) })
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
                // 收敛闸门：本条路径只在 v=1/0 时才写入证明/证伪条目，中间裁决（flat 默认给出
                // 0.5，forced 给出加权浮点）会让 ap 停留在"中间布尔估计 + 两个列表皆空"的状态——
                // 而这正是 buildVerifyCandidates 认定"裸命题需要验证"的条件。若不在此标记，该命题
                // 会在每个 tick 重新入选、重开一轮完整辩论；又因 processVerify 每 tick 只跑一个验证，
                // 其它对象被无限饿死，终止条件（所有问题已解决）永不可达。标记后不再重复消耗验证配额，
                // 裁决值仍保留在 布尔估计 中。
                ap.已验证 = true
                if (v === 1) { ap.证明列表 = ap.证明列表 || []; ap.证明列表.push({ 完整过程: strongestReason(t, 1) || '判断问题解法验证通过', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true }); ap.优先级 = 'never' }
                else if (v === 0) { ap.证伪列表 = ap.证伪列表 || []; ap.证伪列表.push({ 完整过程: strongestReason(t, 0) || '判断问题解法判定不成立', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true }); ap.优先级 = 'never' }
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

  // ================= child result dispatch =================
  async function onChildEnd(info) {
    const meta = agentRegistry[info.id]
    if (meta === undefined) return
    const output = blocksToText(info.lastAssistantMessage)
    try {
      if (meta.role === 'explorer') await handleExplorer(info.id, meta, output)
      else if (meta.role === 'solver') await handleSolver(info.id, meta, output, info.stopReason)
      else if (meta.role === 'verifier') await handleVerifier(info.id, meta, output, info.stopReason)
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
      }
      // 并发计数由 agentRegistry 推导：清空 registry 后自然归零，无需显式赋值。
    }
    await writeJson('VibeMath_State/process_epoch.json', processEpoch)
    await saveAll()
    return { ok: true }
  }
  async function startScheduler() { const r = await init(true); if (!r.ok) return r; scheduler.running = true; scheduler.startedAt = now(); scheduler.gate = null; logActivity('start', 'scheduler started for project ' + currentProject); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler() { const r = await init(false); if (!r.ok) return r; scheduler.running = true; scheduler.gate = null; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); agentRegistry = {}; logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  // auto 模式语义 = 无人值守自动通过关键节点：切回 auto 时把仍挂起的人工决策按自动策略放行
  async function autoResolvePending() {
    const pending = decisionQueue.filter(function (d) { return d.status === 'pending' })
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]
      try {
        if (d.node === 'spawn') { await spawnChild(d.data.label, d.data.promptText, d.data.meta); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'verdict') { await settleVerdict(d.data.task, d.data.verdict); delete tasks[d.data.task.id]; d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
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
      recentActivity: activityLog.slice(-Math.min(10, Number(params.activityLogCap) || 100)), params: params,
      formal: {
        mode: formalMode(), required: formalRequired(),
        leanCommand: params.leanCommand, leanArgs: params.leanArgs, leanTimeoutMs: params.leanTimeoutMs,
        objects: Object.keys(formalRecords()).map(function (k) { const r = formalRecords()[k] || {}; return { target: k, status: r.status, file: r.file, proof: r.proof, note: r.note } }),
        todo: formalTodo(),
        paths: { project: 'Formal/', lib: vibeRoot() + '/Formal/Lib/', proved: vibeRoot() + '/Formal/Proved/', proofs: 'Verified/Lean/' },
      },
    }
  }

  // ================= projects =================
  async function setProject(slug, create) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    const exists = (await listDirsAt(vibeRoot(), 'Projects')).indexOf(slug) !== -1
    if (!create && !exists) return { ok: false, message: 'project not found: ' + slug }
    if (scheduler.running) await abortScheduler()
    currentProject = slug; await writeCurrentProject(); await ensureDirs()
    if ((await readJson('qs/qs.json')) === undefined) await writeJson('qs/qs.json', [])
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; lastReportWrite = 0; lastPushReport = 0; reportDirty = false
    formalState = { records: {}, todo: [] } // 形式化记录随项目切换（loadState 会读新项目的 formal.json）
    await loadSettings(); await migrateLegacyParams(); await loadState(); await saveAll()
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
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象的 formal.status 未达到 passed/blocked 之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), async function () { await refreshParams(); const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs/qs.json.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), async function (args) { const qs = await getQs(); if (qs.some(function (q) { return q.id === args.id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: args.id, 概述: args.description, 已解决: false, 解法列表: [], 优先级: args.priority || 0, progress: { directions: [] } }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } })
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (with 概述, 布尔估计, 细类型, 优先级, 价值/关键性).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 布尔估计: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 细类型: { type: 'object' } }, ['id', '概述']), async function (args) {
    const p = { id: args.id, 概述: args.概述, 布尔估计: clamp01(args.布尔估计 != null ? args.布尔估计 : 0.5), 细类型: (args.细类型 && typeof args.细类型 === 'object') ? args.细类型 : { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: (args.优先级 != null) ? args.优先级 : 1, '价值/关键性': clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), progress: { 来源: 'user', 说明: '用户手动添加。' } }
    await upsertProposition(p); scheduleTick(); return { ok: true, proposition: p, file: proposFile(categoryOf(p)) }
  })
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index: id, 概述, 布尔估计, 优先级, 价值/关键性, category).', objParams({}), async function () { const all = await getPropos(); return { ok: true, count: all.length, propositions: all.map(function (p) { return { id: p.id, 概述: p.概述, 布尔估计: p.布尔估计, 优先级: p.优先级, '价值/关键性': p['价值/关键性'], category: p._category } }) } })
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, true) })
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, false) })
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), async function () { return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') } })
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), async function () { return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) } })
  registerTool('vibe_math_decide', 'Resolve a pending manual decision (verdict override uses verdict: 1|0).', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'number' } }, ['id', 'action']), async function (args) { const d = decisionQueue.find(function (x) { return x.id === args.id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; const resolution = { action: args.action, verdict: args.verdict }; const applied = await applyDecision(d.node, d.data, resolution); const r = await resolveDecision(args.id, resolution); return Object.assign({ ok: true, applied: applied }, r) })
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), async function () { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round, rId: m.rId }) } return { ok: true, agents: out, count: out.length } })
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), async function (args) { if (!agentRegistry[args.childId]) return { ok: false, message: 'unknown childId' }; await followupChild(args.childId, args.message); return { ok: true, message: 'message delivered' } })
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), async function (args) { await interruptChild(args.childId); return { ok: true, message: 'interrupt requested' } })
  // ---- Lean 形式化验证（契约 §5）----
  registerTool('vibe_math_lean_run', 'Execute the Lean toolchain on one .lean file inside the VibeMath root and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), async function (args, agent) { return await leanRunTool(memberIdOf(agent), args) })
  registerTool('vibe_math_lean_archive', 'Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind="lemma": a machine-checked lemma → Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), async function (args, agent) { return await leanArchive(memberIdOf(agent), args) })
  registerTool('vibe_math_lean_lib', 'List (and by default rebuild) the Lean reuse library: this project\'s Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining.', objParams({ refresh: { type: 'boolean' } }), async function (args) {
    const noRefresh = !!(args && args.refresh === false)
    const r = noRefresh ? { lib: null, proved: null, objects: Object.keys(formalRecords()).length } : await rebuildLeanLibIndexes()
    return {
      ok: true, mode: formalMode(), rebuilt: !noRefresh,
      counts: r, todo: formalTodo(),
      objects: Object.keys(formalRecords()).map(function (k) { const rec = formalRecords()[k] || {}; return { target: k, status: rec.status, file: rec.file, proof: rec.proof, note: rec.note } }),
      paths: { project: 'Formal/（相对项目根）', lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/', proofs: 'Verified/Lean/' },
      hint: '复用优先：先在 Lib/ 里找现成定义；新定义用 vibe_math_lean_archive kind=\'def\' 归档，已证引理用 kind=\'lemma\'（归档前先跑通，跑不通不要入库）。',
    }
  })

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
    return { ok: false, usage: 'start | resume | pause | abort | status | report | mode <auto|manual> | setup | save | template [global|project] | add <id> <desc> | add-proposition <id> <概述> | list-propositions | project [list|new <name>|<name>] | decisions | agents', message: 'unknown /vibe subcommand: ' + (cmd || '(empty)') }
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
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial). Lean 形式化验证：formalVerify = off（默认，不额外要求）| encourage（按实现难度自行决定是否形式化；一旦 Lean 通过，验证转为对 Lean 陈述的「忠实性审查」）| require（同上，且加门禁：对象的 formal.status 未达到 passed/blocked 之前，真/假裁定记为未定论、原因 formal-required，并进入 Formal/TODO.md）；leanCommand/leanArgs/leanTimeoutMs 控制 Lean 工具链的调用方式。', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' }, formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] }, leanCommand: { type: 'string' }, leanArgs: { type: 'array', items: { type: 'string' } }, leanTimeoutMs: { type: 'integer' } }), 'vibe_math_set_params')
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), 'vibe_math_setup')
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), 'vibe_math_save_settings')
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), 'vibe_math_template')
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs/qs.json.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), 'vibe_math_add_problem')
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (with 概述, 布尔估计, 细类型, 优先级, 价值/关键性).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 布尔估计: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 细类型: { type: 'object' } }, ['id', '概述']), 'vibe_math_add_proposition')
  registerTool('vibe_math_list_propositions', 'List propositions from Propos/ (summary index: id, 概述, 布尔估计, 优先级, 价值/关键性, category).', objParams({}), 'vibe_math_list_propositions')
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
  registerTool('vibe_math_lean_run', 'Execute the Lean toolchain on one .lean file inside the VibeMath root and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output. Pass target=<object id> to also record the run against that object.', objParams({ file: { type: 'string' }, target: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['file']), 'vibe_math_lean_run')
  registerTool('vibe_math_lean_archive', 'Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind="lemma": a machine-checked lemma → Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: { type: 'string' }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } }, ['kind']), 'vibe_math_lean_archive')
  registerTool('vibe_math_lean_lib', 'List (and by default rebuild) the Lean reuse library: this project\'s Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining.', objParams({ refresh: { type: 'boolean' } }), 'vibe_math_lean_lib')

  // /vibe slash command (registered once; routed per session)
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math V2 solver (start/pause/projects/setup/save/decisions/agents/propositions)',
    input: { hint: '[start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|project [list|new <name>|<name>]|decisions|agents]' },
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
    if (s) s.onChildEnd(info).catch(function (e) { console.error('vibe-math-v2 onChildEnd reject: ' + String((e && e.stack) || e)) })
    // 注意：这里**不要**回收 childOwner 条目。这条映射在子代理 end 之后仍会被后续事件路由
    // 用到：曾试过在此处回收、也试过在 onChildEnd 末尾回收，两次都导致 e2e-regression 的
    // verdict 收口失效（"problem solved after verdict 1"）。代价是每个历史子代理留下一条
    // 小记录（有界增长，实测不影响功能），远小于"验证无法收口"的代价。
  })

  // tick timer (registered once; ticks every running session at its own pace)
  ctx.effect(() => { const t = setInterval(function () { for (const s of sessions.values()) { if (s.getRunning() && !s.tickInFlight && s.tickDue() && s.scheduler.gate === null) s.scheduleTick() } }, 1000); return () => clearInterval(t) })
}
