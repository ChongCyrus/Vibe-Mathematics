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

export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')

  let rootAgent = undefined
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
  let explorerRetries = {}
  // Process epoch: written to state at init; a DIFFERENT persisted epoch means a
  // previous DSH process wrote this state (in-flight children are gone), while an
  // equal epoch means same-process pause→resume (children may still be alive).
  const processEpoch = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function now() { return Date.now() }
  function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }
  function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }
  function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }
  function workspaceRoot() { try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) {} if (sandboxPolicy && sandboxPolicy.workspaceRoot) return sandboxPolicy.workspaceRoot; return '.' }
  function vibeRoot() { return (workspaceRoot() + '/VibeMath').replace(/\\/g, '/') }
  function projectRoot(slug) { return vibeRoot() + '/Projects/' + slug }
  function frameworkRoot() { return projectRoot(currentProject) }
  function slugify(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, ''); return t || 'project' }
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
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数（agent_self_iteration 上限）', suggestion: 3 },
    { name: 'directionsPerSolver', type: 'integer', description: '每个 solver 提示词附带的方向数量：1 = 只看自己方向（互不干扰）；>1 = 额外附带其他活跃方向摘要用于协调', suggestion: 1 },
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
  ]

  // ================= fs =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeText(rel, content) { const t = await fsTarget(rel); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true }
  async function readJson(rel) { const t = await readText(rel); if (t === undefined || t === '') return undefined; try { return JSON.parse(t) } catch (e) { return undefined } }
  async function writeJson(rel, obj) { return await writeText(rel, JSON.stringify(obj, null, 2)) }
  async function listFiles(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'file' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function listDirsAt(base, rel) { try { const t = await fs.resolve(rel, { cwd: base }); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'directory' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function readTextAbs(path) { try { const t = await fs.resolve(path); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeTextAbs(path, content) { try { const t = await fs.resolve(path); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true } catch (e) { return false } }
  async function readCurrentProject() { try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s === undefined) return 'default'; const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } catch (e) { return 'default' } }
  async function writeCurrentProject() { try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); await fs.writeText(t, JSON.stringify({ project: currentProject }), undefined, undefined, getPolicy()) } catch (e) {} }

  // ================= subprocess =================
  function psQuote(p) { return "'" + String(p).replace(/'/g, "''") + "'" }
  async function runShell(script, cwd) { if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }; try { const handle = subprocess.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script], cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 }); const outcome = await handle.done; return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode } } catch (e) { return { ok: false, error: String((e && e.message) || e) } } }
  async function ensureDirs() { const base = frameworkRoot(); const dirs = ['qs', 'Propos', 'Reliable', 'Verified', 'Verification_logs', 'Progress_Logs', 'VibeMath_State']; const paths = [vibeRoot() + '/Projects'].concat(dirs.map(function (d) { return base + '/' + d })); const list = paths.map(psQuote).join(','); return await runShell('New-Item -Force -ItemType Directory -Path ' + list + ' | Out-Null') }
  async function removeFile(rel) { const base = frameworkRoot(); return await runShell('Remove-Item -Force -LiteralPath ' + psQuote(base + '/' + rel) + ' -ErrorAction SilentlyContinue') }

  // ================= settings =================
  function sanitizeParams(obj) {
    const out = {}
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'directionsPerSolver', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs', 'tickIntervalMs', 'activityLogCap', 'maxExplorerRetries']
    const numFields = ['promoteValueThreshold']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny']
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
      if (intFields.indexOf(k) !== -1) { const n = Number(v); out[k] = Number.isFinite(n) ? Math.floor(n) : DEFAULT_PARAMS[k] }
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

  // ================= persistence =================
  async function loadState() {
    const s = await readJson('VibeMath_State/scheduler_state.json'); if (s) scheduler = Object.assign({}, scheduler, s)
    const r = await readJson('VibeMath_State/agent_registry.json'); if (r) agentRegistry = r
    const dq = await readJson('VibeMath_State/decision_queue.json'); if (dq) decisionQueue = dq
    const va = await readJson('VibeMath_State/verifier_accuracy.json'); if (va) verifierAccuracy = va
    const tk = await readJson('VibeMath_State/tasks.json'); if (tk) tasks = tk
    const er = await readJson('VibeMath_State/explorer_retries.json'); if (er) explorerRetries = er
  }
  async function saveAll() {
    await writeJson('VibeMath_State/scheduler_state.json', scheduler)
    await writeJson('VibeMath_State/agent_registry.json', agentRegistry)
    await writeJson('VibeMath_State/decision_queue.json', decisionQueue)
    await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy)
    await writeJson('VibeMath_State/tasks.json', tasks)
    await writeJson('VibeMath_State/explorer_retries.json', explorerRetries)
    scheduler.lastCheckpoint = now()
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

  // ================= data layer: qs.json =================
  async function getQs() { const a = await readJson('qs/qs.json'); return Array.isArray(a) ? a : [] }
  async function writeQs(list) { await writeJson('qs/qs.json', list) }
  async function findQ(qid) { const qs = await getQs(); return qs.find(function (q) { return q.id === qid }) }

  // progress is a JSON string inside the problem object
  function parseProgress(q) { const p = safeJson((q && q.progress) || '', null); if (p && typeof p === 'object') return p; return { directions: [], experience: '' } }
  async function saveProgress(qid, progObj) { const qs = await getQs(); const q = qs.find(function (x) { return x.id === qid }); if (!q) return; q.progress = JSON.stringify(progObj); await writeQs(qs) }

  // ================= data layer: Propos =================
  function categoryOf(p) { const t = (p && p.细类型) || {}; const keys = Object.keys(t); return (keys.length > 0 && typeof t[keys[0]] === 'object') ? keys[0] : '未分类' }
  function proposFile(cat) { return 'Propos/' + String(cat) + '_Propos.json' }
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
      activeCount: scheduler.activeCount, maxParallelThreshold: params.maxParallelThreshold,
      problems: { total: qs.length, solved: qs.filter(function (q) { return q.已解决 }).length },
      propositions: { total: propos.length, resolved: propos.filter(function (p) { return p.布尔估计 === 1 || p.布尔估计 === 0 }).length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      registeredAgents: Object.keys(agentRegistry).length,
      recentActivity: activityLog.slice(-Math.min(30, Number(params.activityLogCap) || 100)),
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
  const NETWORK_TOOLS = ['web_search', 'web', 'fetch']
  const SCRIPT_TOOLS = ['bash', 'pwsh']
  function buildToolFilter(role) { const allow = role === 'solver' ? params.solverToolAllow : role === 'verifier' ? params.verifierToolAllow : undefined; const deny = role === 'solver' ? params.solverToolDeny : role === 'verifier' ? params.verifierToolDeny : undefined; const net = role === 'solver' ? params.solverAllowNetwork : role === 'verifier' ? params.verifierAllowNetwork : undefined; const scr = role === 'solver' ? params.solverAllowScripts : role === 'verifier' ? params.verifierAllowScripts : undefined; let a = Array.isArray(allow) ? allow.slice() : []; let d = Array.isArray(deny) ? deny.slice() : []; if (net === false) d = d.concat(NETWORK_TOOLS); else if (net === true && a.length > 0) a = a.concat(NETWORK_TOOLS); if (scr === false) d = d.concat(SCRIPT_TOOLS); else if (scr === true && a.length > 0) a = a.concat(SCRIPT_TOOLS); const f = {}; if (a.length > 0) f.allow = a; if (d.length > 0) f.deny = d; return (f.allow || f.deny) ? f : undefined }
  async function spawnChild(label, promptText, meta) {
    const request = { prompt: [textBlock(promptText)], parent: rootAgent, agentOptions: childAgentOptions() }
    const tf = buildToolFilter(meta && meta.role); if (tf) request.toolFilter = tf
    let started
    try { started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) }
    catch (e) {
      if (request.toolFilter) { delete request.toolFilter; console.error('vibe-math-v2: startContinuable with toolFilter failed, retrying without it: ' + String((e && e.message) || e)); started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) } else { throw e }
    }
    agentRegistry[started.childId] = Object.assign({ createdAt: now() }, meta || {})
    scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1
    await saveAll(); return started.childId
  }
  async function followupChild(childId, promptText) { await subagents.followup(rootAgent, childId, [textBlock(promptText)], { source: { kind: 'user' }, signal: makeSignal(30000) }); scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1; await saveAll() }
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
      '- 若结论依赖某个临时假设 p，必须显式写成「若 <p 的完整陈述> 成立，则：...」（同样要定义完整）。\n' +
      '- 只输出规定的 JSON（放在 ```json 代码围栏内），JSON 之外不写任何内容。\n' +
      '- 示例（完整问题 概述）："设 {a_n} 为非负实数序列（n≥1），满足：对任意正整数 n 都存在 i,j 使 |a_i − a_j| = 1/n^p（p>0 为实参数）。判断：p 在什么范围内保证级数 ∑_{n=1}^∞ a_n 发散？" —— 每个记号（序列、参数、级数）都在句内定义完整，读它的人无需再查背景。\n' +
      '- 示例（完整命题 概述）："设函数 f:[0,1]→R 连续，则 f 在 [0,1] 上有界（连续性按 ε-δ 定义，有界性按标准实数分析定义）。" —— 概念与对象定义完整，不引用未定义的记号。\n'
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
      (d.routes && d.routes.length ? ' | routes: ' + d.routes.map(function (r) { return r.title + '[' + (r.feasibility_signal || '') + ']' }).join('; ') : '') +
      (d.lessons && d.lessons.length ? ' | lessons: ' + d.lessons.join('; ') : '') +
      (d.blockers && d.blockers.length ? ' | blockers: ' + d.blockers.join('; ') : '')
  }
  // 每个 solver 默认只看自己方向（互不干扰）：round>1 时带上自己的历史进度，
  // directionsPerSolver>1 时再附带其他活跃方向摘要用于协调（总数不超过该参数）。
  function buildSolverContext(all, own, round, perSolver) {
    const out = []
    const n = Math.max(1, Number(perSolver) || 1)
    if (round > 1) out.push(own)
    const others = all.filter(function (d) { return d.id !== own.id && d.status === 'active' })
    for (let i = 0; i < others.length && out.length < n; i++) out.push(others[i])
    return out.map(directionSummary).join('\n')
  }
  function solverPrompt(q, dir, round, progressText) {
    let head = solverPersonaText() + 'You are a dedicated solver agent working ONE solution direction of a math problem (agent_self_iteration).\n\n'
    head += 'PROBLEM (id: ' + q.id + '): ' + q.概述 + '\nDIRECTION: ' + dir.title + ' (method: ' + dir.method + '; core assumption: ' + dir.core_assumption + ')\nROUND: ' + round + ' of ' + params.solverMaxRounds + '\n'
    if (round > 1 || (progressText && progressText.length)) head += '\nYOUR PRIOR PROGRESS / OTHER DIRECTIONS:\n' + progressText + '\n'
    head += knowledgeContextText()
    head += capabilitiesText('solver')
    head += '\nStart from the last recorded node of direction ' + dir.id + ' (inherit progress, or branch a sub-route under it). Each round you MUST produce, even if incomplete:\n' +
      '- new lemmas / intermediate conclusions WITH full proofs (these go to the Propos/ knowledge base);\n' +
      '- each concrete sub-route tried, its progress overview, an EXPLICIT feasibility signal (e.g. "unremovable singularity", "conflicts with known theorem X"), and any blocker;\n' +
      '- lessons learned from failed attempts (what to avoid, what did not work and why);\n' +
      '- an updated survival probability for this direction.\n'
    head += '\nIf you encounter an EXTREMELY complex auxiliary conjecture/sub-problem q_sub: list it in "sub_questions" as a PROBLEM-class object with its COMPLETE statement (every object/definition/notation it mentions must be fully defined — never quote partially, 不断章取义), together with p_{q-tmp}: a PROPOSITION-class TEMPORARY ASSUMPTION that is one possible answer to q_sub. TEMPORARILY ASSUME p_{q-tmp} holds and continue the main line — every later proposition/conclusion that depends on this assumption MUST be stated as "若 <p_{q-tmp} 的完整陈述> 成立，则：..." (with complete definitions). The scheduler registers q_sub and the problem "判断下述命题是否成立：p_{q-tmp}" in the problem list, and p_{q-tmp} in the proposition base.\n'
    head += '\nIMPORTANT — PROBABILITY RULES FOR NEW RESULTS: any 布尔估计 / solution_probability / survival_probability you output for NEW results must be strictly BETWEEN 0 and 1 (they await independent verifier confirmation). NEVER mark your own fresh lemma or solution as 1 or 0 — that is the verifiers\' job. Only facts already recorded in Verified/ (or 正确概率=1 entries you READ from files) count as certain.\n'
    head += '- Each lemma you output must carry a COMPLETE statement ("statement") and a COMPLETE proof ("proof"): define every object/notation it uses — no 断章取义, no undefined symbols.\n'
    head += '\nIf you obtain a COMPLETE solution: adversarially self-check (construct counterexamples, test boundary conditions) BEFORE declaring success; put the full solution text in "solution".\n'
    head += '\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n' +
      '{"status":"continue|success|dead-end","solution":"complete solution text, or null","solution_probability":0.85,"lemmas":[{"title":"...","statement":"...","proof":"...","细类型":{"分类名":{}},"布尔估计":0.6,"价值/关键性":0.5,"优先级":1}],"routes":[{"title":"...","progress":"...","feasibility_signal":"...","blocker":"..."}],"lessons":["..."],"survival_probability":0.5,"dead_end_reason":"... or null","sub_questions":[{"q_sub_title":"...","q_sub_statement":"完整问题陈述(含所有对象/定义)","assumption_title":"p_{q-tmp} 标题","assumption_statement":"完整假设陈述(含所有定义)"}]}'
    return head
  }
  function verifierReviewPrompt(r) {
    let target = ''
    if (r.kind === 'proposition') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    else if (r.kind === 'prop-proof') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    else target = 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
    return verifierPersonaText() + 'You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.\n\nTARGET (r: ' + r.kind + '):\n' + target + '\n' +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      '\nResult ∈ [0,1] = your probability that the TARGET is CORRECT: 1 ONLY when you are fully certain (for a bare proposition: Reason must be a complete proof; for a proof/refutation/solution: you verified every step and Reason confirms the whole chain); 0 ONLY when you are certain it is wrong (Reason must be a rigorous complete refutation / pinpoint the fatal flaw); otherwise a value strictly between 0 and 1.\n' +
      '\nIndependently output your initial review. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"detailed logic chain, potential counterexample, or supporting evidence"}'
  }
  function verifierDebatePrompt(r, transcript) {
    let target = ''
    if (r.kind === 'proposition') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述
    else if (r.kind === 'prop-proof') target = 'PROPOSITION (id: ' + r.pId + '): ' + r.概述 + '\n' + r.side + ' PROCESS TO CHECK:\n' + r.process
    else target = 'PROBLEM (id: ' + r.qid + '): ' + r.概述 + '\nSOLUTION TO CHECK:\n' + r.process
    return verifierPersonaText() + 'You are one reviewer in a DEBATE ("交流群") about this object.\n\nTARGET:\n' + target + '\n' +
      knowledgeContextText() +
      capabilitiesText('verifier') +
      '\nFULL DEBATE HISTORY SO FAR (每轮所有评审轮流发言的记录):\n' + transcript + '\n' +
      '\nRespond to the others (agree / rebut / add new evidence, referencing earlier rounds if needed). If you changed your Result because of them, state the reason explicitly.\n' +
      'Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n' +
      '{"Result":0.5,"Reason":"updated logic chain / counterexample / proof / refutation","changed":"brief reason if you changed your Result, else null"}'
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
  async function tick() {
    if (tickInFlight) return; if (!rootAgent) return; if (!scheduler.running) return; if (scheduler.gate) return
    tickInFlight = true
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
  async function processStatusUpdates() {
    const qs = await getQs()
    let qsChanged = false
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      if (q.解法列表 && q.解法列表.some(function (s) { return s.正确概率 === 1 })) { if (!q.已解决) { qsChanged = true; await writeVerifiedProblemCardIfNeeded(q) } q.已解决 = true; q.优先级 = 'never' }
    }
    if (qsChanged) { await writeQs(qs); logActivity('update', 'problems marked solved by probability-1 solutions') }
    const propos = await getPropos()
    let closedPromoted = false
    for (let i = 0; i < propos.length; i++) {
      const p = propos[i]
      let pChanged = false
      const proofOne = (p.证明列表 || []).some(function (x) { return x.正确概率 === 1 })
      const refuteOne = (p.证伪列表 || []).some(function (x) { return x.正确概率 === 1 })
      if (proofOne && p.布尔估计 !== 1) { p.布尔估计 = 1; pChanged = true }
      else if (refuteOne && p.布尔估计 !== 0) { p.布尔估计 = 0; pChanged = true }
      if ((p.布尔估计 === 1 || p.布尔估计 === 0) && p.优先级 !== 'never') { p.优先级 = 'never'; pChanged = true }
      if (p.布尔估计 === 1 || p.布尔估计 === 0) {
        if (await writeVerifiedCardIfNeeded(p)) pChanged = true
        // 源命题已定论 → 关闭其晋升出的"僵尸"问题（避免永远未解决）
        const srcMarker = '由命题 ' + p.id + '（'
        for (let j = 0; j < qs.length; j++) {
          const qj = qs[j]
          if (!qj.已解决 && String(qj.progress || '').indexOf(srcMarker) !== -1) { qj.已解决 = true; qj.优先级 = 'never'; closedPromoted = true }
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
    if (scheduler.activeCount >= params.maxParallelThreshold) return
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
      qs.push({ id: qid, 概述: '判断下述命题是否成立：' + p.概述, 已解决: false, 解法列表: sols, 优先级: 1, 判断命题: p.id, 细类型: (p.细类型 && typeof p.细类型 === 'object') ? p.细类型 : {}, '价值/关键性': p['价值/关键性'], progress: '由命题 ' + p.id + '（价值/关键性=' + p['价值/关键性'] + '）自动晋升；目标：证明或证伪该命题（解法列表中的【证明】/【证伪】条目即原命题的证明/证伪材料，验证结果会回写源命题）。' })
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
      if (scheduler.activeCount >= params.maxParallelThreshold) break
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
    }
  }
  async function processSolve() {
    if (scheduler.activeCount >= params.maxParallelThreshold) return
    const qs = await getQs()
    const unsolved = qs.filter(function (q) { return !q.已解决 && q.优先级 !== 'never' }).sort(function (a, b) { return (a.优先级 === 'never' ? 999 : Number(a.优先级)) - (b.优先级 === 'never' ? 999 : Number(b.优先级)) })
    for (let i = 0; i < unsolved.length; i++) {
      if (scheduler.activeCount >= params.maxParallelThreshold) break
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
          if (scheduler.activeCount >= params.maxParallelThreshold) break
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
    const dirs = (parsed && parsed.directions) || []
    if (dirs.length === 0) { logActivity('explorer', 'problem ' + meta.qid + ' returned no directions'); await saveAll(); return }
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
      if (parsed.lemmas && parsed.lemmas.length) { for (let i = 0; i < parsed.lemmas.length; i++) await addLemmaAsProposition(qid, parsed.lemmas[i]) }
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
      progress: '由求解器针对问题 ' + qid + ' 的方向迭代产出。', 来源问题: qid,
    }
    await upsertProposition(p)
    logActivity('proposition', 'lemma「' + lemma.title + '」→ ' + p.id)
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
    qs.push({ id: subId, 概述: sq.q_sub_statement, 已解决: false, 解法列表: [], 优先级: 1, progress: '临时子问题：由问题 ' + qid + ' 方向 ' + dirId + ' 分支产生；求解主线在 p_{q-tmp}（' + assumeId + '）假设下推进。' })
    qs.push({ id: judgeId, 概述: '判断下述命题是否成立：' + assumeStatement, 已解决: false, 解法列表: [], 优先级: 1, 判断命题: assumeId, progress: '由临时假设 p_{q-tmp}（' + assumeId + '）生成；它是对子问题 ' + subId + ' 的一种回答的命题化。' })
    await writeQs(qs)
    const p = {
      id: assumeId, 概述: assumeStatement, 布尔估计: 0.5,
      细类型: { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: 1,
      '价值/关键性': 0.5,
      progress: '临时假设 p_{q-tmp}：由问题 ' + qid + ' 方向 ' + dirId + ' 在求解中临时假设其成立以推进主线；依赖子问题 ' + subId + '；若该假设被证伪，则依赖它的主线结论需重新审视。',
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
      if (scheduler.activeCount >= params.maxParallelThreshold) { t.status = 'paused'; return } // 并发门：等有空闲槽位再辩论（reconcileVerify 会重推进）
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
              ap.布尔估计 = v
              if (v === 1) { ap.证明列表 = ap.证明列表 || []; ap.证明列表.push({ 完整过程: strongestReason(t, 1) || '判断问题解法验证通过', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true }); ap.优先级 = 'never' }
              else if (v === 0) { ap.证伪列表 = ap.证伪列表 || []; ap.证伪列表.push({ 完整过程: strongestReason(t, 0) || '判断问题解法判定不成立', 正确概率: 1, '支持信息/依据': '经「判断下述命题是否成立」问题解法验证', 已验: true }); ap.优先级 = 'never' }
              await upsertProposition(ap)
              await writeVerifiedCardIfNeeded(ap)
              logActivity('judge-sync', 'judge problem verdict ' + v + ' synced to proposition ' + ap.id)
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
  async function writeVerifiedCardIfNeeded(p) {
    if (p.布尔估计 !== 1 && p.布尔估计 !== 0) return false
    const cat = categoryOf(p)
    const list = await readVerifiedCategory(cat)
    const idx = list.findIndex(function (c) { return c.id === p.id })
    const proofs1 = (p.证明列表 || []).filter(function (x) { return x.正确概率 === 1 })
    const refutes1 = (p.证伪列表 || []).filter(function (x) { return x.正确概率 === 1 })
    const parts = []
    for (let i = 0; i < proofs1.length; i++) parts.push('【证明 #' + (i + 1) + '】' + (proofs1[i].完整过程 || ''))
    for (let i = 0; i < refutes1.length; i++) parts.push('【证伪 #' + (i + 1) + '】' + (refutes1[i].完整过程 || ''))
    const card = {
      id: p.id, 概述: p.概述, 类型: '命题', 结论: p.布尔估计 === 1, 概率: p.布尔估计,
      内容: parts.join('\n'), 证明条数: proofs1.length, 证伪条数: refutes1.length,
      来源: p.来源问题 || '', 时间: now(), 分类: cat,
    }
    if (idx === -1) list.push(card)
    else { if (list[idx].内容 === card.内容 && list[idx].概率 === card.概率) return false; list[idx] = card }
    await writeJson('Verified/' + cat + '_Verified.json', list)
    return idx === -1
  }
  async function writeVerifiedProblemCardIfNeeded(q) {
    if (!q || !q.已解决) return false
    const cat = '问题'
    const list = await readVerifiedCategory(cat)
    const idx = list.findIndex(function (c) { return c.id === q.id })
    const sols1 = (q.解法列表 || []).filter(function (s) { return s.正确概率 === 1 })
    const parts = []
    for (let i = 0; i < sols1.length; i++) parts.push('【解法 #' + (i + 1) + '】' + (sols1[i].完整解法 || ''))
    const card = { id: q.id, 概述: q.概述, 类型: '问题', 结论: true, 概率: 1, 内容: parts.join('\n'), 解法条数: sols1.length, 来源: q.id, 时间: now(), 分类: cat }
    if (idx === -1) list.push(card)
    else { if (list[idx].内容 === card.内容) return false; list[idx] = card }
    await writeJson('Verified/' + cat + '_Verified.json', list)
    return idx === -1
  }

  // ================= child result dispatch =================
  async function onChildEnd(info) {
    const meta = agentRegistry[info.id]
    if (meta === undefined) return
    scheduler.activeCount = Math.max(0, scheduler.activeCount - 1)
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
  async function resolveRootAgent(agent) { if (rootAgent) return rootAgent; if (agent) { rootAgent = agent; return rootAgent } try { const roots = agents.roots ? agents.roots() : []; if (roots && roots.length > 0) { rootAgent = roots[0]; return rootAgent } } catch (e) {} return rootAgent }
  async function init(agent, fresh) {
    await resolveRootAgent(agent); if (!rootAgent) return { ok: false, message: 'no root agent available' }
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
      scheduler.activeCount = 0 // 仅清空 registry/tasks 时归零；同进程 resume 保留存活计数（并发门才准确）
    }
    await writeJson('VibeMath_State/process_epoch.json', processEpoch)
    await saveAll()
    return { ok: true }
  }
  async function startScheduler(agent) { const r = await init(agent, true); if (!r.ok) return r; scheduler.running = true; scheduler.startedAt = now(); scheduler.gate = null; logActivity('start', 'scheduler started for project ' + currentProject); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler(agent) { const r = await init(agent, false); if (!r.ok) return r; scheduler.running = true; scheduler.gate = null; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); scheduler.activeCount = 0; logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  // auto 模式语义 = 无人值守自动通过关键节点：切回 auto 时把仍挂起的人工决策按自动策略放行
  async function autoResolvePending() {
    const pending = decisionQueue.filter(function (d) { return d.status === 'pending' })
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]
      try {
        if (d.node === 'spawn') { await spawnChild(d.data.label, d.data.promptText, d.data.meta); d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
        else if (d.node === 'verdict') { await settleVerdict(d.data.task, d.data.verdict); delete tasks[d.data.task.id]; d.status = 'resolved'; d.resolution = { action: 'approve', auto: true } }
      } catch (e) { console.error('vibe-math-v2: auto-resolve decision failed: ' + String((e && e.message) || e)) }
    }
    if (pending.length > 0) { scheduler.gate = null; logActivity('mode', 'switched to auto — auto-resolved ' + pending.length + ' pending decision(s)'); await saveAll(); scheduleTick() }
  }
  async function getStatus() {
    const qs = await getQs(); const propos = await getPropos()
    return {
      ok: true, initialized: rootAgent !== undefined, running: scheduler.running,
      project: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects'),
      mode: params.mode, activeCount: scheduler.activeCount, maxParallelThreshold: params.maxParallelThreshold,
      frameworkRoot: frameworkRoot(),
      problems: { total: qs.length, solved: qs.filter(function (q) { return q.已解决 }).length },
      propositions: { total: propos.length, resolved: propos.filter(function (p) { return p.布尔估计 === 1 || p.布尔估计 === 0 }).length },
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,
      registeredAgents: Object.keys(agentRegistry).length,
      recentActivity: activityLog.slice(-Math.min(10, Number(params.activityLogCap) || 100)), params: params,
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
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, activeCount: 0, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; decisionQueue = []; verifierAccuracy = {}; tasks = {}; explorerRetries = {}; activityLog = []; lastReportWrite = 0; lastPushReport = 0; reportDirty = false
    await loadSettings(); await migrateLegacyParams(); await loadState(); await saveAll()
    return { ok: true, project: slug, frameworkRoot: frameworkRoot() }
  }

  // ================= events / timer =================
  ctx.on('subagent/end', function (info) { onChildEnd(info).catch(function (e) { console.error('vibe-math-v2 onChildEnd reject: ' + String((e && e.stack) || e)) }) })
  ctx.effect(() => { const t = setInterval(function () { scheduleTick() }, Math.max(200, Number(params.tickIntervalMs) || 2000)); return () => clearInterval(t) })

  // ================= tools =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  function registerTool(name, description, parameters, executeFn) {
    ctx.effect(() => tools.register({
      name: name, description: description, parameters: parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async function (args, exec) { try { const agent = (exec && exec.agent) || undefined; await resolveRootAgent(agent); if (rootAgent) currentProject = await readCurrentProject(); return JSON.stringify(await executeFn(args || {}, agent)) } catch (e) { return JSON.stringify({ ok: false, error: String((e && e.message) || e) }) } },
    }))
  }
  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math V2 scheduler for the current project.', objParams({}), async function (args, agent) { return await startScheduler(agent) })
  registerTool('vibe_math_resume', 'Resume the Vibe Math V2 scheduler after a checkpoint/restart.', objParams({}), async function (args, agent) { return await resumeScheduler(agent) })
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), async function () { return await pauseScheduler() })
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), async function () { return await abortScheduler() })
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), async function () { return await getStatus() })
  registerTool('vibe_math_report', 'Return the full progress report and write it to Progress_Logs/report.json.', objParams({}), async function () { await maybeWriteReport(true); return await buildReport() })
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode. Switching to auto auto-resolves any pending manual decisions.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), async function (args) { params.mode = args.mode; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } })
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial).', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['flat', 'forced'] }, reportMode: { type: 'string', enum: ['file', 'push', 'both'] }, promoteValueThreshold: { type: 'number' }, priorityAdjust: { type: 'string', enum: ['none', 'deadend-deprioritize', 'survival-map'] }, proposPriorityAdjust: { type: 'string', enum: ['none', 'progress-graded'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, explorerPersona: { type: 'string' }, knowledgeContext: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverAllowNetwork: { type: 'boolean' }, verifierAllowNetwork: { type: 'boolean' }, solverAllowScripts: { type: 'boolean' }, verifierAllowScripts: { type: 'boolean' }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' }, tickIntervalMs: { type: 'integer' }, activityLogCap: { type: 'integer' }, maxExplorerRetries: { type: 'integer' }, directionsPerSolver: { type: 'integer' } }), async function (args) { params = Object.assign({}, params, sanitizeParams(args)); await saveAll(); await saveSettings(); return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema for guided configuration.', objParams({}), async function () { const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs/qs.json.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), async function (args) { const qs = await getQs(); if (qs.some(function (q) { return q.id === args.id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: args.id, 概述: args.description, 已解决: false, 解法列表: [], 优先级: args.priority || 0, progress: '' }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } })
  registerTool('vibe_math_add_proposition', 'Add a proposition to Propos/ (with 概述, 布尔估计, 细类型, 优先级, 价值/关键性).', objParams({ id: { type: 'string' }, 概述: { type: 'string' }, 布尔估计: { type: 'number' }, 优先级: { type: 'integer' }, '价值/关键性': { type: 'number' }, 细类型: { type: 'object' } }, ['id', '概述']), async function (args) {
    const p = { id: args.id, 概述: args.概述, 布尔估计: clamp01(args.布尔估计 != null ? args.布尔估计 : 0.5), 细类型: (args.细类型 && typeof args.细类型 === 'object') ? args.细类型 : { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: (args.优先级 != null) ? args.优先级 : 1, '价值/关键性': clamp01(args['价值/关键性'] != null ? args['价值/关键性'] : 0.5), progress: '用户手动添加。' }
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

  // ================= slash command /vibe =================
  async function dispatchVibeCommand(cmd, args, agent) {
    if (cmd === 'start') return await startScheduler(agent)
    if (cmd === 'resume') return await resumeScheduler(agent)
    if (cmd === 'pause') return await pauseScheduler()
    if (cmd === 'abort') return await abortScheduler()
    if (cmd === 'status') return await getStatus()
    if (cmd === 'report') { await maybeWriteReport(true); return await buildReport() }
    if (cmd === 'mode') { params.mode = (args[0] === 'manual') ? 'manual' : 'auto'; await saveAll(); await saveSettings(); if (params.mode === 'auto') await autoResolvePending(); return { ok: true, mode: params.mode } }
    if (cmd === 'setup') { const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } }
    if (cmd === 'save') return await saveSettings()
    if (cmd === 'template') return await createTemplate(args[0] === 'project' ? 'project' : 'global')
    if (cmd === 'add') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; const qs = await getQs(); if (qs.some(function (q) { return q.id === id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: id, 概述: desc, 已解决: false, 解法列表: [], 优先级: 0, progress: '' }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } }
    if (cmd === 'add-proposition') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add-proposition <id> <概述>' }; const p = { id: id, 概述: desc, 布尔估计: 0.5, 细类型: { 未分类: {} }, 证明列表: [], 证伪列表: [], 优先级: 1, '价值/关键性': 0.5, progress: '用户通过 /vibe 添加。' }; await upsertProposition(p); scheduleTick(); return { ok: true, proposition: p, file: proposFile(categoryOf(p)) } }
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
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math V2 solver (start/pause/projects/setup/save/decisions/agents/propositions)',
    input: { hint: '[start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|project [list|new <name>|<name>]|decisions|agents]' },
    handler: async function (invocation) {
      const line = String(invocation && invocation.rawInput ? invocation.rawInput : '').trim()
      const parts = line.length > 0 ? line.split(/\s+/) : []
      const cmd = parts[0] || ''
      const rest = parts.slice(1)
      const result = await dispatchVibeCommand(cmd, rest, invocation.agent)
      return { kind: 'success', text: JSON.stringify(result, null, 2) }
    },
  }))
}
