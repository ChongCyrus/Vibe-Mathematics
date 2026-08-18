// Vibe Math — permanent host plugin: multi-agent mathematical problem solving &
// verification framework ("广度探索 → 深度迭代 → 交叉验证 → 知识沉淀").
//
// Preset-local plugin. Only node: builtins are imported (the harness's own
// TypeScript sources are not reachable via ESM resolution). Registers 20 model
// tools, /vibe slash commands, and a background scheduler; provides NO service,
// so it sits loose in the preset.
//
// Projects: each math project lives in its own folder under
// <workspace>/VibeMath/Projects/<project>/ with its own qs/Verified/... layout.
// The current project is recorded in <workspace>/VibeMath/current.json.
// Default parameters can be overridden by an (optionally commented) JSON file:
// <project>/vibe_math_setting.json (fallback <workspace>/VibeMath/vibe_math_setting.json).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Ensure the agent-preset form is installed under the DSH preset root, so a
// market/bundle install also surfaces "Vibe Math V1" in the agent-preset picker.
// No-op when the preset already exists or when running inside the preset itself.
function ensurePresetInstalled(logger) {
  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const presetDir = join(dshHome, '.agent-presets', 'vibe-math-v1')
    const here = dirname(fileURLToPath(import.meta.url))
    const files = ['agent.cordis.yml', 'preset.yml', 'vibe-math.js']
    if (files.every((f) => existsSync(join(presetDir, f)))) return false
    if (!files.every((f) => existsSync(join(here, f)))) return false
    mkdirSync(presetDir, { recursive: true })
    for (const f of files) writeFileSync(join(presetDir, f), readFileSync(join(here, f)))
    logger?.info?.('[vibe-math] agent preset installed to %s (visible in the preset picker for new sessions)', presetDir)
    return true
  } catch (err) {
    logger?.warn?.('[vibe-math] could not install agent preset: %s', String(err?.message ?? err))
    return false
  }
}

export const name = 'vibe-math'
export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands']

export function apply(ctx) {
  ensurePresetInstalled(ctx.logger)
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
    mode: 'auto',
    maxParallelThreshold: 4,
    solverMaxRounds: 20,
    verifierCount: 3,
    debateMaxRounds: 5,
    verdictMode: 'direct-veto',
    provider: '',
    model: '',
    solverPersona: '',
    verifierPersona: '',
    solverToolAllow: [],
    solverToolDeny: [],
    verifierToolAllow: [],
    verifierToolDeny: [],
    solverMaxToolCalls: 0,
    verifierMaxToolCalls: 0,
    reportIntervalMs: 30000,
  }
  let params = Object.assign({}, DEFAULT_PARAMS)
  let scheduler = { running: false, activeCount: 0, startedAt: 0, lastCheckpoint: 0, gate: null }
  let agentRegistry = {}
  let dependencies = {}
  let decisionQueue = []
  let tasks = {}
  let tickInFlight = false
  let brainstormRetries = {}
  let deriveRetries = {}
  let solvedByVerified = {}
  let promotionQueue = {}
  let verifierAccuracy = {}
  let activityLog = []
  let lastReportWrite = 0
  let reportDirty = false

  // ================= helpers =================
  function textBlock(t) { return { type: 'text', text: String(t) } }
  function now() { return Date.now() }
  function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) { if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'; else s += h[Math.floor(Math.random() * 16)] } return s }
  function shortId() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)]; return s }
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
    // 1) prefer any ```json ... ``` code fence
    const fenceRe = /```(?:json)?[ \t]*([\s\S]*?)```/gi
    let m
    while ((m = fenceRe.exec(text)) !== null) { const obj = tryObj(m[1].trim()); if (obj !== undefined) return obj }
    // 2) whole trimmed text as pure JSON
    const whole = tryObj(text.trim()); if (whole !== undefined) return whole
    // 3) fallback: scan EVERY balanced {…} block and return the LARGEST one that parses as a JSON object
    //    (robust against prose containing braces like {2k+1}, which are not valid JSON)
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
  function csvEscape(v) { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  function csvRow(vals) { return vals.map(csvEscape).join(',') }
  function parseCsv(text) { const rows = []; let row = []; let field = ''; let q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c } else if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c !== '\r') field += c } if (field !== '' || row.length > 0) { row.push(field); rows.push(row) } return rows }
  function safeJson(v, fb) { if (v == null || v === '') return fb; try { return JSON.parse(v) } catch (e) { return fb } }
  function stripJsonComments(text) { let out = ''; let inStr = false; let inLine = false; let inBlock = false; let esc = false; for (let i = 0; i < text.length; i++) { const c = text[i]; const n = text[i + 1]; if (inLine) { if (c === '\n') { inLine = false; out += c } continue } if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++ } continue } if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue } if (c === '"') { inStr = true; out += c; continue } if (c === '/' && n === '/') { inLine = true; i++; continue } if (c === '/' && n === '*') { inBlock = true; i++; continue } out += c } return out }

  // ================= parameter schema (for setup + settings template) =================
  const PARAM_SCHEMA = [
    { name: 'mode', type: 'enum', options: ['auto', 'manual'], description: 'auto = 无人值守自动通过关键节点；manual = 关键节点挂起人工决策', suggestion: 'auto' },
    { name: 'maxParallelThreshold', type: 'integer', description: '全局最大并发子代理数（并发门阈值）', suggestion: 4 },
    { name: 'solverMaxRounds', type: 'integer', description: '每个求解方向的最大迭代轮数', suggestion: 20 },
    { name: 'verifierCount', type: 'integer', description: '每个验证单元的独立验证器数量（内部强制 ≥3）', suggestion: 3 },
    { name: 'debateMaxRounds', type: 'integer', description: '验证辩论（交流群）最大轮数', suggestion: 5 },
    { name: 'verdictMode', type: 'enum', options: ['direct-veto', 'weighted-vote'], description: 'direct-veto = 一票否决（严谨）；weighted-vote = 证伪优先加权', suggestion: 'direct-veto' },
    { name: 'provider', type: 'string', description: '子代理模型 provider（空 = 继承根代理）', suggestion: '' },
    { name: 'model', type: 'string', description: '子代理模型 id（空 = 继承根代理）', suggestion: '' },
    { name: 'solverPersona', type: 'string', description: '注入每个求解器提示词开头的人格/要求', suggestion: '' },
    { name: 'verifierPersona', type: 'string', description: '注入每个验证器提示词开头的人格/要求', suggestion: '' },
    { name: 'solverToolAllow', type: 'string[]', description: '求解器允许的工具名列表（空 = 继承全部工具）', suggestion: [] },
    { name: 'solverToolDeny', type: 'string[]', description: '求解器禁止的工具名列表（如禁用写文件/控制工具）', suggestion: [] },
    { name: 'verifierToolAllow', type: 'string[]', description: '验证器允许的工具名列表（空 = 继承全部）', suggestion: [] },
    { name: 'verifierToolDeny', type: 'string[]', description: '验证器禁止的工具名列表', suggestion: [] },
    { name: 'solverMaxToolCalls', type: 'integer', description: '求解器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'verifierMaxToolCalls', type: 'integer', description: '验证器每轮外部工具调用上限（0 = 不限）', suggestion: 0 },
    { name: 'reportIntervalMs', type: 'integer', description: '自动写进度报告 report.json 的最小间隔（毫秒）', suggestion: 30000 },
  ]

  // ================= fs =================
  async function fsTarget(rel) { return await fs.resolve(rel, { cwd: frameworkRoot() }) }
  async function readText(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function readTextAbs(path) { try { const t = await fs.resolve(path); const s = await fs.stat(t); if (s === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
  async function writeTextAbs(path, content) { try { const t = await fs.resolve(path); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true } catch (e) { return false } }
  async function writeText(rel, content) { const t = await fsTarget(rel); await fs.writeText(t, content, undefined, undefined, getPolicy()); return true }
  async function readJson(rel) { const t = await readText(rel); if (t === undefined || t === '') return undefined; try { return JSON.parse(t) } catch (e) { return undefined } }
  async function writeJson(rel, obj) { return await writeText(rel, JSON.stringify(obj, null, 2)) }
  async function listFiles(rel) { try { const t = await fsTarget(rel); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'file' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function listDirsAt(base, rel) { try { const t = await fs.resolve(rel, { cwd: base }); const s = await fs.stat(t); if (s === undefined) return []; const entries = await fs.listDir(t); return entries.filter(function (e) { return e && e.type === 'directory' }).map(function (e) { return e.name }) } catch (e) { return [] } }
  async function readCurrentProject() { try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); const s = await fs.stat(t); if (s === undefined) return 'default'; const txt = await fs.readText(t); const j = safeJson(txt, null); const p = (j && j.project) ? String(j.project) : 'default'; return slugify(p) } catch (e) { return 'default' } }
  async function writeCurrentProject() { try { const t = await fs.resolve('current.json', { cwd: vibeRoot() }); await fs.writeText(t, JSON.stringify({ project: currentProject }), undefined, undefined, getPolicy()) } catch (e) {} }

  // ================= subprocess =================
  function psQuote(p) { return "'" + String(p).replace(/'/g, "''") + "'" }
  async function runShell(script, cwd) { if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }; try { const handle = subprocess.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script], cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 }); const outcome = await handle.done; return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode } } catch (e) { return { ok: false, error: String((e && e.message) || e) } } }
  async function ensureDirs() { const base = frameworkRoot(); const dirs = ['qs', 'Verified', 'Pending_Verification', 'Under_Verification', 'Temp', 'Temp_Validated', 'Progress_Logs', 'VibeMath_State']; const paths = [vibeRoot() + '/Projects'].concat(dirs.map(function (d) { return base + '/' + d })); const list = paths.map(psQuote).join(','); return await runShell('New-Item -Force -ItemType Directory -Path ' + list + ' | Out-Null') }
  async function atomicMove(srcRel, dstRel) { const base = frameworkRoot(); return await runShell('Move-Item -Force -LiteralPath ' + psQuote(base + '/' + srcRel) + ' -Destination ' + psQuote(base + '/' + dstRel)) }
  async function removeFile(rel) { const base = frameworkRoot(); return await runShell('Remove-Item -Force -LiteralPath ' + psQuote(base + '/' + rel) + ' -ErrorAction SilentlyContinue') }

  // ================= settings file (JSONC) =================
  function sanitizeParams(obj) {
    const out = {}
    const intFields = ['maxParallelThreshold', 'solverMaxRounds', 'verifierCount', 'debateMaxRounds', 'solverMaxToolCalls', 'verifierMaxToolCalls', 'reportIntervalMs']
    const arrayFields = ['solverToolAllow', 'solverToolDeny', 'verifierToolAllow', 'verifierToolDeny']
    for (const k of Object.keys(DEFAULT_PARAMS)) {
      if (!(k in obj)) continue
      const v = obj[k]
      if (intFields.indexOf(k) !== -1) { const n = Number(v); out[k] = Number.isFinite(n) ? Math.floor(n) : DEFAULT_PARAMS[k] }
      else if (arrayFields.indexOf(k) !== -1) { out[k] = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' }) : DEFAULT_PARAMS[k] }
      else if (k === 'mode') { out[k] = (v === 'manual' || v === 'auto') ? v : DEFAULT_PARAMS[k] }
      else if (k === 'verdictMode') { out[k] = (v === 'direct-veto' || v === 'weighted-vote') ? v : DEFAULT_PARAMS[k] }
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
      console.error('vibe-math: invalid vibe_math_setting.json ignored: ' + String((e && e.message) || e))
    }
  }
  function settingsTemplateFrom(src) {
    const lines = []
    lines.push('{')
    lines.push('  // Vibe Math 默认参数配置（JSON with Comments，可加 // 注释）。')
    lines.push('  // 位置：<项目>/vibe_math_setting.json（全局回退：<工作区>/VibeMath/vibe_math_setting.json）。')
    lines.push('  // 该文件只提供“默认值”；运行期 vibe_math_set_params 改过的值会存到 VibeMath_State/params.json 并覆盖此处。')
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
  async function loadState() { const pj = await readJson('VibeMath_State/params.json'); if (pj) params = Object.assign({}, params, pj); const s = await readJson('VibeMath_State/scheduler_state.json'); if (s) scheduler = Object.assign({}, scheduler, s); const r = await readJson('VibeMath_State/agent_registry.json'); if (r) agentRegistry = r; const d = await readJson('VibeMath_State/dependencies.json'); if (d) dependencies = d; const dq = await readJson('VibeMath_State/decision_queue.json'); if (dq) decisionQueue = dq; const tk = await readJson('VibeMath_State/tasks.json'); if (tk) tasks = tk; const sv = await readJson('VibeMath_State/solved_by_verified.json'); if (sv) solvedByVerified = sv; const pq = await readJson('VibeMath_State/promotion_queue.json'); if (pq) promotionQueue = pq; const va = await readJson('VibeMath_State/verifier_accuracy.json'); if (va) verifierAccuracy = va }
  async function saveAll() { await writeJson('VibeMath_State/params.json', params); await writeJson('VibeMath_State/scheduler_state.json', scheduler); await writeJson('VibeMath_State/agent_registry.json', agentRegistry); await writeJson('VibeMath_State/dependencies.json', dependencies); await writeJson('VibeMath_State/decision_queue.json', decisionQueue); await writeJson('VibeMath_State/tasks.json', tasks); await writeJson('VibeMath_State/solved_by_verified.json', solvedByVerified); await writeJson('VibeMath_State/promotion_queue.json', promotionQueue); await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy); scheduler.lastCheckpoint = now() }

  // ================= activity log / report =================
  function logActivity(event, detail) { activityLog.push({ at: now(), event: event, detail: String(detail || '') }); if (activityLog.length > 100) activityLog.shift(); reportDirty = true }
  function buildReport() {
    const openTasks = Object.keys(tasks).filter(function (k) { const t = tasks[k]; return t.status === 'spawning' || t.status === 'debating' || t.status === 'awaiting-verdict' })
    return {
      ok: true,
      at: now(),
      project: currentProject,
      frameworkRoot: frameworkRoot(),
      running: scheduler.running,
      mode: params.mode,
      activeCount: scheduler.activeCount,
      maxParallelThreshold: params.maxParallelThreshold,
      pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),
      openTasks: openTasks.length,
      registeredAgents: Object.keys(agentRegistry).length,
      recentActivity: activityLog.slice(-30),
      params: params,
    }
  }
  async function maybeWriteReport(force) {
    if (!force && !reportDirty) return
    if (!force && (now() - lastReportWrite) < (Number(params.reportIntervalMs) || 30000)) return
    await writeJson('Progress_Logs/report.json', buildReport())
    lastReportWrite = now()
    reportDirty = false
  }

  // ================= qs & progress =================
  async function getQs() { const text = await readText('qs/qs.csv'); if (text === undefined) return []; const rows = parseCsv(text); const out = []; for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (r.length < 4) continue; out.push({ id: (r[0] || '').trim(), description: r[1] || '', priority: parseInt(r[2], 10) || 0, status: (r[3] || 'unsolved').trim(), deps: safeJson(r[4], []) }) } return out }
  async function writeQs(rows) { const lines = ['id,description,priority,status,deps']; for (let i = 0; i < rows.length; i++) { const q = rows[i]; lines.push(csvRow([q.id, q.description, q.priority, q.status, JSON.stringify(q.deps || [])])) } await writeText('qs/qs.csv', lines.join('\n') + '\n') }
  const PHEADER = ['direction_id', 'title', 'method', 'core_assumption', 'round', 'status', 'survival_probability', 'dead_end_reason', 'lemmas_json', 'sub_routes_json', 'aux_hypotheses_json', 'updated_at']
  async function readProgress(qid) { const text = await readText('Progress_Logs/' + qid + '_progress.csv'); if (text === undefined) return []; const rows = parseCsv(text); const out = []; for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (r.length < 12) continue; out.push({ direction_id: r[0], title: r[1], method: r[2], core_assumption: r[3], round: parseInt(r[4], 10) || 0, status: r[5] || 'active', survival_probability: parseFloat(r[6]) || 0, dead_end_reason: r[7] || '', lemmas: safeJson(r[8], []), sub_routes: safeJson(r[9], []), aux_hypotheses: safeJson(r[10], []), updated_at: r[11] || '' }) } return out }
  async function writeProgress(qid, dirs) { const lines = [csvRow(PHEADER)]; for (let i = 0; i < dirs.length; i++) { const d = dirs[i]; lines.push(csvRow([d.direction_id, d.title || '', d.method || '', d.core_assumption || '', d.round || 0, d.status || 'active', d.survival_probability || 0, d.dead_end_reason || '', JSON.stringify(d.lemmas || []), JSON.stringify(d.sub_routes || []), JSON.stringify(d.aux_hypotheses || []), d.updated_at || String(now())])) } await writeText('Progress_Logs/' + qid + '_progress.csv', lines.join('\n') + '\n') }

  // ================= child spawn / followup =================
  function pickProvider() { try { const names = subagents.list ? subagents.list() : []; if (names.indexOf('spawn') !== -1) return 'spawn'; if (names.indexOf('fork') !== -1) return 'fork' } catch (e) {} return 'spawn' }
  function childAgentOptions() { const o = {}; try { if (rootAgent && rootAgent.options) { if (rootAgent.options.provider) o.provider = rootAgent.options.provider; if (rootAgent.options.model) o.model = rootAgent.options.model } } catch (e) {} if (params.provider) o.provider = params.provider; if (params.model) o.model = params.model; return o }
  function buildToolFilter(role) { const allow = role === 'solver' ? params.solverToolAllow : role === 'verifier' ? params.verifierToolAllow : undefined; const deny = role === 'solver' ? params.solverToolDeny : role === 'verifier' ? params.verifierToolDeny : undefined; const f = {}; if (Array.isArray(allow) && allow.length > 0) f.allow = allow.slice(); if (Array.isArray(deny) && deny.length > 0) f.deny = deny.slice(); return (f.allow || f.deny) ? f : undefined }
  async function spawnChild(label, promptText, meta) { const request = { prompt: [textBlock(promptText)], parent: rootAgent, agentOptions: childAgentOptions() }; const tf = buildToolFilter(meta && meta.role); if (tf) request.toolFilter = tf; let started; try { started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) } catch (e) { if (request.toolFilter) { delete request.toolFilter; console.error('vibe-math: startContinuable with toolFilter failed, retrying without it: ' + String((e && e.message) || e)); started = await subagents.startContinuable({ provider: pickProvider(), label: label, request: request, signal: makeSignal(30000) }) } else { throw e } } agentRegistry[started.childId] = Object.assign({ createdAt: now() }, meta || {}); scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1; await saveAll(); return started.childId }
  async function followupChild(childId, promptText) { await subagents.followup(rootAgent, childId, [textBlock(promptText)], { source: { kind: 'user' }, signal: makeSignal(30000) }); scheduler.activeCount = Math.max(0, scheduler.activeCount) + 1; await saveAll() }
  async function interruptChild(childId) { try { subagents.interrupt(childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) {} }

  // ================= prompts =================
  function solverPersonaText() { return params.solverPersona ? (String(params.solverPersona) + '\n\n') : '' }
  function verifierPersonaText() { return params.verifierPersona ? (String(params.verifierPersona) + '\n\n') : '' }
  function capabilitiesText(role, qid) {
    const maxCalls = role === 'solver' ? params.solverMaxToolCalls : params.verifierMaxToolCalls
    let t = '\nYOUR PERMISSIONS / CAPABILITIES:\n'
    t += '- You may READ any file under Verified/ as a known, trusted dependency.\n'
    if (role === 'solver' && qid) t += '- You may READ Progress_Logs/' + qid + '_progress.csv to inspect ALL directions\' progress, blockers, and prior results for this problem.\n'
    t += '- You may use external tools (web search, symbolic/numeric computation, literature lookup) to assist; '
    t += (maxCalls && Number(maxCalls) > 0) ? ('call such external tools AT MOST ' + maxCalls + ' times this round.\n') : 'no per-round limit by default.\n'
    t += '- You must NOT write files directly: return structured JSON only — the scheduler is the single writer.\n'
    t += '\nHOW TO READ EXISTING KNOWLEDGE (coarse scan → fine read):\n'
    t += '- These files are CSV (RFC 4180); content cells are JSON-encoded strings. A conclusion/lemma object carries summary-index fields ("title", "statement") and the full detail ("proof").\n'
    t += '- COARSE SCAN first: use a read/grep tool to extract ONLY the summary index (e.g. the direction "title" column, or each object\'s "title"/"statement") to quickly locate which files / sub-objects look relevant or valuable — do NOT load full proofs yet.\n'
    t += '- FINE READ after: once you identify a valuable conclusion file or sub-object, read that file again and extract its full JSON content (e.g. "statement", "proof") via the index you just found.\n'
    return t
  }
  function brainstormPrompt(q) { return 'You are a research mathematician orchestrating strategy for one problem.\n\nPROBLEM (id: ' + q.id + '): ' + q.description + '\n\nDo a first-stage metacognitive brainstorm: decompose constraints, test boundary/extreme cases, map to similar known problems. Then propose 3-6 DIVERSE, mutually distinct solution directions.\n' + capabilitiesText('solver', q.id) + '\n\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n{"directions":[{"id":"d1","title":"...","method":"...","core_assumption":"...","feasibility":0.5}]}' }
  function deriveDirectionsPrompt(q, prog) { const summary = prog.map(function (d) { return '- ' + d.direction_id + ': ' + d.title + ' (status ' + d.status + ', round ' + d.round + ', survival ' + d.survival_probability + ')' + (d.dead_end_reason ? ' [blocker: ' + d.dead_end_reason + ']' : '') }).join('\n'); return 'You are a research mathematician re-deriving strategy for a problem whose prior directions stalled or failed.\n\nPROBLEM (id: ' + q.id + '): ' + q.description + '\n\nPRIOR DIRECTIONS (with blockers):\n' + summary + '\n' + capabilitiesText('solver', q.id) + '\n\nBased on the pain points and blockers above, deeply derive 1-3 BRAND-NEW directions never tried before, each with a one-line motivation. Avoid any direction equivalent to a failed one.\n\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n{"directions":[{"title":"...","method":"...","core_assumption":"...","motivation":"...","feasibility":0.5}]}' }
  function dirSummary(dir) { const lemmas = (dir.lemmas || []).map(function (l) { return l.title }).join('; '); const blockers = (dir.sub_routes || []).filter(function (s) { return s && s.blocker }).map(function (s) { return s.blocker }).join('; '); return 'round ' + dir.round + ', status ' + dir.status + ', survival ' + dir.survival_probability + ', lemmas: ' + lemmas + ', blockers: ' + blockers }
  function solverPrompt(q, dir, round) { let head = solverPersonaText() + 'You are a dedicated solver agent working ONE solution direction of a math problem.\n\nPROBLEM (id: ' + q.id + '): ' + q.description + '\nDIRECTION: ' + dir.title + ' (method: ' + dir.method + '; assumption: ' + dir.core_assumption + ')\nROUND: ' + round + '\n'; if (round > 1) head += '\nYOUR PRIOR PROGRESS: ' + dirSummary(dir) + '\n'; head += capabilitiesText('solver', q.id) + '\n'; head += '\nAdvance the proof/computation for this direction. You MUST produce (even if incomplete):\n- new lemmas / intermediate conclusions WITH full proofs;\n- each concrete sub-route tried, its progress, an explicit feasibility signal, and any blocker;\n- an updated survival probability for this direction.\n\nIf you obtain a COMPLETE solution, adversarially self-check (construct counterexamples, test boundary conditions) BEFORE declaring success, and put the full solution text in "solution".\n\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose and no braces { } outside the JSON:\n{"status":"continue|success|dead-end","solution":"complete solution text, or null","lemmas":[{"title":"...","statement":"...","proof":"..."}],"findings":["..."],"sub_routes":[{"title":"...","progress":"...","feasibility_signal":"...","blocker":"..."}],"survival_probability":0.5,"dead_end_reason":"... or null","aux_hypotheses":[{"title":"...","statement":"..."}]}'; return head }
  function verifierReviewPrompt(unit) { return verifierPersonaText() + 'You are a STRICT peer reviewer verifying one mathematical claim. Assume its declared dependencies hold, then check whether the claim is correct.\n\nTARGET CLAIM (id: ' + unit.obj_id + '): ' + unit.title + '\nCONTENT:\n' + unit.content + '\n' + capabilitiesText('verifier') + '\n\nIndependently output your initial review. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n{"verdict":"true|false|uncertain","reason":"detailed logic chain, potential counterexample, or challenge to a dependency","strictness":"strict|lenient"}' }
  function verifierDebatePrompt(unit, transcript) { return verifierPersonaText() + 'You are one reviewer in a debate ("交流群") about this claim.\n\nTARGET CLAIM (id: ' + unit.obj_id + '): ' + unit.title + '\nCONTENT:\n' + unit.content + '\n' + capabilitiesText('verifier') + '\n\nOTHERS HAVE SAID SO FAR:\n' + transcript + '\n\nRespond to the others (agree / rebut / add evidence). If you changed your mind, say why explicitly. Respond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n{"verdict":"true|false|uncertain","reason":"...","strictness":"strict|lenient"}' }
  function deciderPrompt(qsList, verifiedContent) { return 'You are a triage agent. Given a newly VERIFIED mathematical result, decide whether it is a COMPLETE solution to any UNSOLVED problem in the list.\n\nUNSOLVED PROBLEMS:\n' + qsList + '\n\nVERIFIED RESULT:\n' + verifiedContent + '\n\nRespond with ONLY a single JSON object wrapped in a ```json code fence — no prose:\n{"solves_qid":"<problem id> or null"}' }
  function solutionText(parsed, dir) { if (parsed && parsed.solution) return String(parsed.solution); const parts = []; if (parsed && parsed.lemmas && parsed.lemmas.length) parts.push('Lemmas: ' + JSON.stringify(parsed.lemmas)); if (parsed && parsed.findings && parsed.findings.length) parts.push('Findings: ' + JSON.stringify(parsed.findings)); if (parts.length) return parts.join('\n'); return 'Direction "' + ((dir && dir.title) || '') + '" reported success (no explicit solution text).' }
  function statusFromStop(stopReason) { return (stopReason === 'completed' || stopReason === 'max-tokens') ? 'continue' : 'dead-end' }

  // ================= init / control =================
  async function resolveRootAgent(agent) { if (rootAgent) return rootAgent; if (agent) { rootAgent = agent; return rootAgent } try { const roots = agents.roots ? agents.roots() : []; if (roots && roots.length > 0) { rootAgent = roots[0]; return rootAgent } } catch (e) {} return rootAgent }
  async function init(agent) { await resolveRootAgent(agent); if (!rootAgent) return { ok: false, message: 'no root agent available' }; currentProject = await readCurrentProject(); await ensureDirs(); if ((await readText('qs/qs.csv')) === undefined) await writeText('qs/qs.csv', 'id,description,priority,status,deps\n'); params = Object.assign({}, DEFAULT_PARAMS); await loadSettings(); await loadState(); scheduler.activeCount = 0; await saveAll(); return { ok: true } }
  async function startScheduler(agent) { const r = await init(agent); if (!r.ok) return r; scheduler.running = true; scheduler.startedAt = now(); scheduler.gate = null; logActivity('start', 'scheduler started for project ' + currentProject); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler started', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function resumeScheduler(agent) { const r = await init(agent); if (!r.ok) return r; scheduler.running = true; scheduler.gate = null; logActivity('resume', 'scheduler resumed'); await saveAll(); await maybeWriteReport(true); scheduleTick(); return { ok: true, message: 'scheduler resumed', project: currentProject, frameworkRoot: frameworkRoot() } }
  async function pauseScheduler() { scheduler.running = false; logActivity('pause', 'scheduler paused'); await saveAll(); return { ok: true, message: 'scheduler paused' } }
  async function abortScheduler() { scheduler.running = false; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) await interruptChild(ids[i]); scheduler.activeCount = 0; logActivity('abort', 'scheduler aborted, ' + ids.length + ' child(ren) interrupted'); await saveAll(); return { ok: true, message: 'scheduler aborted', interrupted: ids.length } }
  async function getStatus() { return { ok: true, initialized: rootAgent !== undefined, running: scheduler.running, project: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects'), mode: params.mode, activeCount: scheduler.activeCount, maxParallelThreshold: params.maxParallelThreshold, frameworkRoot: frameworkRoot(), pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length, openTasks: Object.keys(tasks).filter(function (k) { return tasks[k].status === 'spawning' || tasks[k].status === 'debating' || tasks[k].status === 'awaiting-verdict' }).length, registeredAgents: Object.keys(agentRegistry).length, recentActivity: activityLog.slice(-10), params: params } }

  // ================= projects =================
  async function setProject(slug, create) {
    if (!rootAgent) return { ok: false, message: 'no root agent available' }
    const exists = (await listDirsAt(vibeRoot(), 'Projects')).indexOf(slug) !== -1
    if (!create && !exists) return { ok: false, message: 'project not found: ' + slug }
    if (scheduler.running) await abortScheduler()
    currentProject = slug
    await writeCurrentProject()
    await ensureDirs()
    if ((await readText('qs/qs.csv')) === undefined) await writeText('qs/qs.csv', 'id,description,priority,status,deps\n')
    params = Object.assign({}, DEFAULT_PARAMS); scheduler = { running: false, activeCount: 0, startedAt: 0, lastCheckpoint: 0, gate: null }; agentRegistry = {}; dependencies = {}; decisionQueue = []; tasks = {}; brainstormRetries = {}; deriveRetries = {}; solvedByVerified = {}; promotionQueue = {}; verifierAccuracy = {}; activityLog = []
    await loadSettings(); await loadState(); await saveAll()
    return { ok: true, project: slug, frameworkRoot: frameworkRoot() }
  }

  // ================= decisions (manual/auto) =================
  function enqueueDecision(node, contextText, data) { const d = { id: uuid(), node: node, context: contextText, data: data, status: 'pending', resolution: null, createdAt: now() }; decisionQueue.push(d); return d }
  async function maybeGate(node, contextText, data, autoFn) { if (params.mode === 'auto') return await autoFn(data); const d = enqueueDecision(node, contextText, data); scheduler.gate = { decisionId: d.id, node: node }; logActivity('gate', node + ': ' + contextText); await saveAll(); return { gated: true, decisionId: d.id } }
  async function applyDecision(node, data, resolution) { if (node === 'spawn') { if (resolution.action === 'approve') { await spawnChild(data.label, data.promptText, data.meta); return { spawned: true } } return { spawned: false } } if (node === 'verdict') { const overridden = resolution.action === 'override' && (resolution.verdict === 'true' || resolution.verdict === 'false'); const v = overridden ? resolution.verdict : data.verdict; await settleVerdict(data.task, v); delete tasks['verify:' + data.unitId]; return { verdict: v, overridden: overridden } } if (node === 'promote') { if (resolution.action === 'approve') { await promoteUnit(data.objId); return { promoted: true } } return { promoted: false } } return {} }
  async function resolveDecision(id, resolution) { const d = decisionQueue.find(function (x) { return x.id === id }); if (!d) return { ok: false, message: 'decision not found' }; if (d.status !== 'pending') return { ok: false, message: 'decision already resolved' }; d.status = 'resolved'; d.resolution = resolution; if (scheduler.gate && scheduler.gate.decisionId === id) scheduler.gate = null; logActivity('decide', id + ' resolved: ' + resolution.action + (resolution.verdict ? ' ' + resolution.verdict : '')); await saveAll(); scheduleTick(); return { ok: true, message: 'decision resolved' } }

  // ================= scheduler =================
  function scheduleTick() { tick().catch(function (e) { console.error('vibe-math tick error: ' + String((e && e.stack) || e)) }) }
  async function tick() { if (tickInFlight) return; if (!rootAgent) return; if (!scheduler.running) return; if (scheduler.gate) return; tickInFlight = true; try { await processVerification(); await reconcileTasks(); await processPromotion(); await processDecider(); await processSolve(); await maybeWriteReport(false); const qs = await getQs(); const unsolved = qs.filter(function (q) { return q.status !== 'solved' && !solvedByVerified[q.id] }); if (unsolved.length === 0 && Object.keys(agentRegistry).length === 0 && Object.keys(tasks).length === 0) { scheduler.running = false; logActivity('stop', 'no unsolved problems, no active agents/tasks — scheduler stopped'); await saveAll(); await maybeWriteReport(true) } } finally { tickInFlight = false } }
  async function processSolve() { if (scheduler.activeCount >= params.maxParallelThreshold) return; const qs = await getQs(); const unsolved = qs.filter(function (q) { return q.status !== 'solved' && !solvedByVerified[q.id] }).sort(function (a, b) { return a.priority - b.priority }); for (let i = 0; i < unsolved.length; i++) { if (scheduler.activeCount >= params.maxParallelThreshold) break; const q = unsolved[i]; const busy = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && (m.role === 'brainstorm' || m.role === 'solver' || m.role === 'derive') }); if (busy) continue; const prog = await readProgress(q.id); if (prog.length === 0) { if ((brainstormRetries[q.id] || 0) >= 3) { await writeProgress(q.id, [{ direction_id: 'd_' + shortId(), title: 'brainstorm failed', method: '', core_assumption: '', round: 0, status: 'dead-end', survival_probability: 0, dead_end_reason: 'brainstorm produced no directions after 3 attempts', lemmas: [], sub_routes: [], aux_hypotheses: [], updated_at: String(now()) }]); continue } brainstormRetries[q.id] = (brainstormRetries[q.id] || 0) + 1; const label = 'brainstorm:' + q.id; const promptText = brainstormPrompt(q); const r = await maybeGate('spawn', 'brainstorm for problem ' + q.id, { label: label, promptText: promptText, meta: { role: 'brainstorm', qid: q.id } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } }); if (r && r.gated) return } else { for (let j = 0; j < prog.length; j++) { if (scheduler.activeCount >= params.maxParallelThreshold) break; const dir = prog[j]; if (dir.status === 'success' || dir.status === 'dead-end') continue; const running = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.qid === q.id && m.direction === dir.direction_id && m.role === 'solver' }); if (running) continue; const label = 'solver:' + q.id + ':' + dir.direction_id; const promptText = solverPrompt(q, dir, Math.max(1, dir.round + 1)); const r = await maybeGate('spawn', 'solver for problem ' + q.id + ' direction ' + dir.direction_id, { label: label, promptText: promptText, meta: { role: 'solver', qid: q.id, description: q.description, direction: dir.direction_id, round: Math.max(1, dir.round + 1) } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } }); if (r && r.gated) return } if (scheduler.activeCount < params.maxParallelThreshold) { const activeDirs = prog.filter(function (d) { return d.status !== 'success' && d.status !== 'dead-end' }); if (activeDirs.length === 0 && (deriveRetries[q.id] || 0) < 3) { deriveRetries[q.id] = (deriveRetries[q.id] || 0) + 1; const dlabel = 'derive:' + q.id; const dprompt = deriveDirectionsPrompt(q, prog); const dr = await maybeGate('spawn', 'derive new directions for problem ' + q.id, { label: dlabel, promptText: dprompt, meta: { role: 'derive', qid: q.id, description: q.description } }, async function (d) { await spawnChild(d.label, d.promptText, d.meta); return { spawned: true } }); if (dr && dr.gated) return } } } } }

  // ================= child result handling =================
  async function onChildEnd(info) { const meta = agentRegistry[info.id]; if (meta === undefined) return; scheduler.activeCount = Math.max(0, scheduler.activeCount - 1); const output = blocksToText(info.lastAssistantMessage); try { if (meta.role === 'brainstorm') await handleBrainstorm(info.id, meta, output); else if (meta.role === 'solver') await handleSolver(info.id, meta, output, info.stopReason); else if (meta.role === 'verifier') await handleVerifier(info.id, meta, output, info.stopReason); else if (meta.role === 'decider') await handleDecider(info.id, meta, output); else if (meta.role === 'derive') await handleDerive(info.id, meta, output) } catch (e) { console.error('vibe-math onChildEnd error: ' + String((e && e.stack) || e)) } await saveAll(); scheduleTick() }
  async function handleBrainstorm(childId, meta, output) { delete agentRegistry[childId]; const parsed = parseJson(output); const dirs = (parsed && parsed.directions) || []; if (dirs.length === 0) { logActivity('brainstorm', 'problem ' + meta.qid + ' brainstorm returned no directions'); await saveAll(); return } brainstormRetries[meta.qid] = 0; const prog = []; for (let i = 0; i < dirs.length; i++) { const d = dirs[i]; prog.push({ direction_id: 'd_' + shortId(), title: d.title || '', method: d.method || '', core_assumption: d.core_assumption || '', round: 0, status: 'active', survival_probability: (typeof d.feasibility === 'number') ? d.feasibility : 0.5, dead_end_reason: '', lemmas: [], sub_routes: [], aux_hypotheses: [], updated_at: String(now()) }) } logActivity('brainstorm', 'problem ' + meta.qid + ' → ' + prog.length + ' directions'); await writeProgress(meta.qid, prog) }
  async function handleDerive(childId, meta, output) { delete agentRegistry[childId]; const parsed = parseJson(output); const dirs = (parsed && parsed.directions) || []; if (dirs.length === 0) { logActivity('derive', 'problem ' + meta.qid + ' derived no new directions'); await saveAll(); return } const prog = await readProgress(meta.qid); for (let i = 0; i < dirs.length; i++) { const d = dirs[i]; prog.push({ direction_id: 'd_' + shortId(), title: d.title || '', method: d.method || '', core_assumption: d.core_assumption || (d.motivation || ''), round: 0, status: 'active', survival_probability: (typeof d.feasibility === 'number') ? d.feasibility : 0.5, dead_end_reason: '', lemmas: [], sub_routes: [], aux_hypotheses: [], updated_at: String(now()) }) } logActivity('derive', 'problem ' + meta.qid + ' derived ' + dirs.length + ' new directions'); await writeProgress(meta.qid, prog) }
  async function handleSolver(childId, meta, output, stopReason) { const qid = meta.qid; const direction = meta.direction; const parsed = parseJson(output); const prog = await readProgress(qid); const dir = prog.find(function (d) { return d.direction_id === direction }); if (!dir) { delete agentRegistry[childId]; return } const status = (parsed && parsed.status) || statusFromStop(stopReason); dir.round = meta.round; dir.status = status; if (parsed) { if (parsed.lemmas) dir.lemmas = parsed.lemmas; if (parsed.sub_routes) dir.sub_routes = parsed.sub_routes; if (parsed.aux_hypotheses) dir.aux_hypotheses = parsed.aux_hypotheses; if (typeof parsed.survival_probability === 'number') dir.survival_probability = parsed.survival_probability; if (parsed.dead_end_reason) dir.dead_end_reason = parsed.dead_end_reason } if (status === 'success') { dir.status = 'success'; delete agentRegistry[childId]; logActivity('solver', qid + '/' + direction + ' success at round ' + meta.round); await writePending(qid, dir, parsed) } else if (status === 'dead-end' || meta.round >= params.solverMaxRounds) { dir.status = 'dead-end'; if (!dir.dead_end_reason) dir.dead_end_reason = (status === 'dead-end' && !parsed) ? 'solver ended abnormally (' + stopReason + ')' : 'iteration cap reached'; delete agentRegistry[childId]; logActivity('solver', qid + '/' + direction + ' dead-end: ' + dir.dead_end_reason) } else { const q = { id: qid, description: meta.description || '' }; await followupChild(childId, solverPrompt(q, dir, meta.round + 1)); agentRegistry[childId].round = meta.round + 1; dir.round = meta.round + 1 } if (parsed && parsed.aux_hypotheses && parsed.aux_hypotheses.length > 0) await handleAuxHypotheses(qid, parsed.aux_hypotheses); dir.updated_at = String(now()); await writeProgress(qid, prog) }
  async function handleAuxHypotheses(qid, hyps) { const qs = await getQs(); for (let i = 0; i < hyps.length; i++) { const h = hyps[i]; if (!h || !h.title) continue; const subId = qid + '_sub_' + shortId(); qs.push({ id: subId, description: h.title + (h.statement ? ' - ' + h.statement : ''), priority: 1, status: 'unsolved', deps: [] }); dependencies[qid] = dependencies[qid] || []; dependencies[qid].push(subId); await writeQs(qs); logActivity('subquestion', qid + ' spawned sub-question ' + subId + ' (Aux_Hypothesis)') } }
  async function writePending(qid, dir, parsed) { const doc = { qid: qid, direction: dir.direction_id, solution: solutionText(parsed, dir), lemmas: (parsed && parsed.lemmas) || [], findings: (parsed && parsed.findings) || [], sub_routes: (parsed && parsed.sub_routes) || [], aux_hypotheses: (parsed && parsed.aux_hypotheses) || [], survival_probability: dir.survival_probability, created_at: String(now()) }; const id = uuid(); await writeText('Pending_Verification/' + id + '.csv', 'qid,direction,content_json,created_at\n' + csvRow([qid, dir.direction_id, JSON.stringify(doc), String(now())]) + '\n') }

  // ================= verification =================
  async function processVerification() {
    const files = await listFiles('Pending_Verification')
    for (let i = 0; i < files.length; i++) {
      const fname = files[i]
      const text = await readText('Pending_Verification/' + fname)
      if (text === undefined) continue
      const rows = parseCsv(text)
      const contentJson = rows.length > 1 ? safeJson(rows[1][2], null) : null
      if (!contentJson) { await removeFile('Pending_Verification/' + fname); continue }
      const units = decompose(contentJson)
      for (let j = 0; j < units.length; j++) {
        const unit = units[j]
        await writeText('Under_Verification/' + unit.obj_id + '_' + safeTitle(unit.title) + '.csv', 'obj_id,title,content_json,dependencies_json\n' + csvRow([unit.obj_id, unit.title, JSON.stringify(unit), JSON.stringify(unit.dependencies || [])]) + '\n')
        tasks['verify:' + unit.obj_id] = { id: 'verify:' + unit.obj_id, type: 'verify', unitId: unit.obj_id, unit: unit, status: 'spawning', children: [], childResults: {}, round: 1, expectedCount: Math.max(3, params.verifierCount), createdAt: now() }
      }
      await removeFile('Pending_Verification/' + fname)
    }
    const ids = Object.keys(tasks)
    for (let i = 0; i < ids.length; i++) {
      const t = tasks[ids[i]]
      if (t.type !== 'verify' || t.status !== 'spawning') continue
      if (scheduler.activeCount >= params.maxParallelThreshold) break
      await backfillVerifiers(t)
    }
  }
  function safeTitle(t) { return String(t || 'unit').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 60) }
  function decompose(doc) {
    const units = []
    const qid = doc.qid || ''
    const lemmas = doc.lemmas || []
    for (let i = 0; i < lemmas.length; i++) { const l = lemmas[i]; units.push({ obj_id: uuid(), qid: qid, isSolution: false, title: l.title || ('lemma-' + (i + 1)), content: JSON.stringify(l), dependencies: [] }) }
    const findings = doc.findings || []
    for (let i = 0; i < findings.length; i++) units.push({ obj_id: uuid(), qid: qid, isSolution: false, title: 'finding-' + (i + 1), content: String(findings[i]), dependencies: [] })
    const deps = (doc.aux_hypotheses || []).map(function (h) { return { title: h.title, assumed: true } })
    if (doc.solution) {
      units.push({ obj_id: uuid(), qid: qid, isSolution: true, title: 'solution-' + doc.direction, content: JSON.stringify({ solution: doc.solution, lemmas: lemmas, findings: findings }), dependencies: deps })
    } else if (units.length === 0) {
      units.push({ obj_id: uuid(), qid: qid, isSolution: true, title: 'solution-' + doc.direction, content: JSON.stringify({ solution: null, lemmas: lemmas, findings: findings }), dependencies: deps })
    }
    return units
  }
  async function backfillVerifiers(t) {
    while (t.children.length < t.expectedCount) {
      if (scheduler.activeCount >= params.maxParallelThreshold) break
      const index = t.children.length
      const childId = await spawnChild('verifier:' + t.unitId + ':' + index, verifierReviewPrompt(t.unit), { role: 'verifier', unitId: t.unitId, unit: t.unit, round: 1, index: index })
      t.children.push(childId)
    }
    if (t.children.length >= t.expectedCount) t.status = 'debating'
  }
  async function handleVerifier(childId, meta, output, stopReason) {
    const unitId = meta.unitId
    const parsed = parseJson(output)
    const verdict = (parsed && parsed.verdict) || 'uncertain'
    let t = tasks['verify:' + unitId]
    if (!t) { t = { id: 'verify:' + unitId, type: 'verify', unitId: unitId, unit: meta.unit || { obj_id: unitId, title: unitId, content: '' }, status: 'debating', children: [], childResults: {}, round: 1, expectedCount: Math.max(3, params.verifierCount), createdAt: now() }; tasks[t.id] = t }
    if (t.children.indexOf(childId) === -1) t.children.push(childId)
    t.childResults[childId] = { verdict: verdict, reason: (parsed && parsed.reason) || '', strictness: (parsed && parsed.strictness) || 'lenient', round: meta.round }
    delete agentRegistry[childId]
    const allReported = t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === meta.round })
    if (!allReported) { await saveAll(); return }
    await advanceVerification(t, meta.round)
    await saveAll()
  }
  function unitFromTask(t) { return t.unit || { obj_id: t.unitId, title: t.unitId, content: '' } }
  function consensus(t) { const vs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid].verdict }); if (vs.length === 0) return false; return vs.every(function (v) { return v === 'true' }) || vs.every(function (v) { return v === 'false' }) }
  function buildTranscript(t) { const parts = []; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const r = t.childResults[cids[i]]; parts.push('Reviewer ' + i + ': verdict=' + r.verdict + ' reason=' + r.reason) } return parts.join('\n') }
  function verifierWeight(cid, strictness) { const acc = verifierAccuracy[cid] || { correct: 0, total: 0 }; const base = acc.total > 0 ? (acc.correct / acc.total) : 0.5; const bonus = strictness === 'strict' ? 0.1 : strictness === 'lenient' ? -0.1 : 0; return Math.max(0, Math.min(1, base + bonus)) }
  function weightsOf(t) { const out = {}; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const cid = cids[i]; const r = t.childResults[cid]; out[cid] = { accuracy: verifierAccuracy[cid] ? (verifierAccuracy[cid].correct / verifierAccuracy[cid].total) : 0.5, strictness: r.strictness, weight: verifierWeight(cid, r.strictness) } } return out }
  function finalVerdict(t) { const rs = Object.keys(t.childResults).map(function (cid) { return t.childResults[cid] }); const falses = rs.filter(function (r) { return r.verdict === 'false' }); const trues = rs.filter(function (r) { return r.verdict === 'true' }); const uncerts = rs.filter(function (r) { return r.verdict === 'uncertain' }); if (params.verdictMode === 'weighted-vote') { if (falses.length > 0) return 'false'; if (trues.length > 0 && uncerts.length === 0) return 'true'; return 'false' } if (falses.length > 0) return 'false'; if (trues.length === rs.length && rs.length > 0) return 'true'; return 'false' }
  async function advanceVerification(t, round) {
    if (round < params.debateMaxRounds && !consensus(t)) {
      t.round = round + 1
      const transcript = buildTranscript(t)
      for (let i = 0; i < t.children.length; i++) {
        const cid = t.children[i]
        await followupChild(cid, verifierDebatePrompt(unitFromTask(t), transcript))
        agentRegistry[cid] = { role: 'verifier', unitId: t.unitId, round: round + 1, index: i }
      }
    } else {
      const verdict = finalVerdict(t)
      if (params.mode === 'manual') {
        const d = enqueueDecision('verdict', 'verdict for unit ' + t.unitId + ' = ' + verdict, { unitId: t.unitId, verdict: verdict, task: JSON.parse(JSON.stringify(t)) })
        scheduler.gate = { decisionId: d.id, node: 'verdict' }
        t.status = 'awaiting-verdict'
      } else {
        await settleVerdict(t, verdict)
        delete tasks[t.id]
      }
    }
  }
  async function reconcileTasks() {
    const ids = Object.keys(tasks)
    for (let i = 0; i < ids.length; i++) {
      const t = tasks[ids[i]]
      if (t.type !== 'verify' || t.status !== 'debating') continue
      const allReported = t.children.length > 0 && t.children.every(function (cid) { const r = t.childResults[cid]; return r && r.round === t.round })
      if (!allReported) continue
      await advanceVerification(t, t.round)
    }
  }
  async function settleVerdict(t, verdict) { const unit = unitFromTask(t); const unitId = t.unitId; const cids = Object.keys(t.childResults); for (let i = 0; i < cids.length; i++) { const cid = cids[i]; const r = t.childResults[cid]; const acc = verifierAccuracy[cid] || { correct: 0, total: 0 }; acc.total += 1; if (r.verdict === verdict) acc.correct += 1; verifierAccuracy[cid] = acc } await writeJson('VibeMath_State/verifier_accuracy.json', verifierAccuracy); await writeText('Progress_Logs/verification_' + unitId + '.log', JSON.stringify({ verdict: verdict, results: t.childResults, weights: weightsOf(t), transcript: buildTranscript(t), at: now() }, null, 2)); if (verdict === 'true') { const deps = (unit.dependencies || []).map(function (d) { return (d && d.title) || String(d) }); const body = 'Dependencies (Assumed or Verified): ' + JSON.stringify(deps) + '\n---\nTarget Content: ' + unit.content; await writeText('Temp_Validated/' + unitId + '.csv', body); promotionQueue[unitId] = { qid: unit.qid || '', isSolution: !!(unit.isSolution), deps: deps }; await writeJson('VibeMath_State/promotion_queue.json', promotionQueue) } else { await writeText('Progress_Logs/falsified_' + unitId + '.log', JSON.stringify({ unit: (unit.title || unitId), reasons: Object.keys(t.childResults).map(function (cid) { return t.childResults[cid].reason }), direct_veto: params.verdictMode === 'direct-veto', at: now() }, null, 2)) } await removeFile('Under_Verification/' + unit.obj_id + '_' + safeTitle(unit.title) + '.csv'); logActivity('verdict', 'unit ' + unitId + ' = ' + verdict) }

  // ================= promotion =================
  async function processPromotion() { const files = await listFiles('Temp_Validated'); if (files.length === 0) return; const verifiedText = await verifiedContentSnapshot(); for (let i = 0; i < files.length; i++) { const fname = files[i]; const objId = fname.replace(/\.csv$/, ''); const rec = promotionQueue[objId] || { qid: '', isSolution: false, deps: [] }; const deps = rec.deps || []; const allSatisfied = deps.every(function (title) { return title === '' || verifiedText.indexOf(title) !== -1 }); if (!allSatisfied) continue; const r = await maybeGate('promote', 'promote validated unit ' + objId + ' to Verified', { objId: objId }, async function (d) { await promoteUnit(d.objId); return { promoted: true } }); if (r && r.gated) return } }
  async function verifiedContentSnapshot() { const files = await listFiles('Verified'); let text = ''; for (let i = 0; i < files.length; i++) { const c = await readText('Verified/' + files[i]); if (c !== undefined) text += c + '\n' } return text }
  async function promoteUnit(objId) { await atomicMove('Temp_Validated/' + objId + '.csv', 'Verified/' + objId + '.csv'); const rec = promotionQueue[objId]; if (rec && rec.isSolution && rec.qid) { solvedByVerified[rec.qid] = true; await writeJson('VibeMath_State/solved_by_verified.json', solvedByVerified) } delete promotionQueue[objId]; await writeJson('VibeMath_State/promotion_queue.json', promotionQueue); logActivity('promote', 'unit ' + objId + ' promoted to Verified') }

  // ================= decider =================
  async function processDecider() { if (scheduler.activeCount >= params.maxParallelThreshold) return; const qs = await getQs(); const unsolved = qs.filter(function (q) { return q.status !== 'solved' }); if (unsolved.length === 0) return; const verified = await listFiles('Verified'); const processed = (await readJson('VibeMath_State/decided_verified.json')) || []; for (let i = 0; i < verified.length; i++) { const vf = verified[i]; if (processed.indexOf(vf) !== -1) continue; const inflight = Object.keys(agentRegistry).some(function (cid) { const m = agentRegistry[cid]; return m && m.role === 'decider' && m.verifiedFile === vf }); if (inflight) continue; if (scheduler.activeCount >= params.maxParallelThreshold) break; const content = await readText('Verified/' + vf); if (content === undefined) continue; const qsList = unsolved.map(function (q) { return q.id + ': ' + q.description }).join('\n'); await spawnChild('decider:' + vf, deciderPrompt(qsList, content.slice(0, 4000)), { role: 'decider', verifiedFile: vf }) } }
  async function handleDecider(childId, meta, output) { delete agentRegistry[childId]; const parsed = parseJson(output); const qid = parsed && parsed.solves_qid; const processed = (await readJson('VibeMath_State/decided_verified.json')) || []; if (processed.indexOf(meta.verifiedFile) === -1) processed.push(meta.verifiedFile); if (qid && qid !== 'null') { const qs = await getQs(); const q = qs.find(function (x) { return x.id === qid }); if (q && q.status !== 'solved') { q.status = 'solved'; solvedByVerified[qid] = true; await writeQs(qs); const newName = qid + '-的解法_' + shortId() + '.csv'; await atomicMove('Verified/' + meta.verifiedFile, 'Verified/' + newName); processed.push(newName); logActivity('decider', 'problem ' + qid + ' solved; Verified file renamed to ' + newName) } } await writeJson('VibeMath_State/decided_verified.json', processed) }

  // ================= events / timer =================
  ctx.on('subagent/end', function (info) { onChildEnd(info).catch(function (e) { console.error('vibe-math onChildEnd reject: ' + String((e && e.stack) || e)) }) })
  ctx.effect(() => { const t = setInterval(function () { scheduleTick() }, 2000); return () => clearInterval(t) })

  // ================= tools =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  function registerTool(name, description, parameters, executeFn) {
    ctx.effect(() => tools.register({
      name: name, description: description, parameters: parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async function (args, exec) { try { const agent = (exec && exec.agent) || undefined; await resolveRootAgent(agent); if (rootAgent) currentProject = await readCurrentProject(); return JSON.stringify(await executeFn(args || {}, agent)) } catch (e) { return JSON.stringify({ ok: false, error: String((e && e.message) || e) }) } },
    }))
  }

  registerTool('vibe_math_start', 'Start (or restart) the Vibe Math scheduler for the current project.', objParams({}), async function (args, agent) { return await startScheduler(agent) })
  registerTool('vibe_math_resume', 'Resume the scheduler after a checkpoint/restart.', objParams({}), async function (args, agent) { return await resumeScheduler(agent) })
  registerTool('vibe_math_pause', 'Pause the scheduler (in-flight children finish their current turn).', objParams({}), async function () { return await pauseScheduler() })
  registerTool('vibe_math_abort', 'Abort the scheduler and interrupt all active children.', objParams({}), async function () { return await abortScheduler() })
  registerTool('vibe_math_status', 'Show scheduler status, params, active agents, projects, and recent activity.', objParams({}), async function () { return await getStatus() })
  registerTool('vibe_math_report', 'Return the full progress report (status + recent activity + params) and write it to Progress_Logs/report.json.', objParams({}), async function () { await maybeWriteReport(true); return buildReport() })
  registerTool('vibe_math_set_mode', 'Switch between manual and auto (preset) mode.', objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }, ['mode']), async function (args) { params.mode = args.mode; await saveAll(); return { ok: true, mode: params.mode } })
  registerTool('vibe_math_set_params', 'Update scheduler parameters (partial).', objParams({ maxParallelThreshold: { type: 'integer' }, solverMaxRounds: { type: 'integer' }, verifierCount: { type: 'integer' }, debateMaxRounds: { type: 'integer' }, verdictMode: { type: 'string', enum: ['direct-veto', 'weighted-vote'] }, provider: { type: 'string' }, model: { type: 'string' }, solverPersona: { type: 'string' }, verifierPersona: { type: 'string' }, solverToolAllow: { type: 'array', items: { type: 'string' } }, solverToolDeny: { type: 'array', items: { type: 'string' } }, verifierToolAllow: { type: 'array', items: { type: 'string' } }, verifierToolDeny: { type: 'array', items: { type: 'string' } }, solverMaxToolCalls: { type: 'integer' }, verifierMaxToolCalls: { type: 'integer' }, reportIntervalMs: { type: 'integer' } }), async function (args) { params = Object.assign({}, params, args); await saveAll(); return { ok: true, params: params } })
  registerTool('vibe_math_setup', 'Return the interactive parameter schema (each param: name, type, current, default, description, options, suggestion) for guided configuration.', objParams({}), async function () { const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } })
  registerTool('vibe_math_save_settings', 'Write the current params to vibe_math_setting.json (JSON with comments) as new defaults.', objParams({}), async function () { return await saveSettings() })
  registerTool('vibe_math_template', 'Create a fresh vibe_math_setting.json template (with defaults + comments) in the workspace (global) or current project folder.', objParams({ where: { type: 'string', enum: ['global', 'project'] } }), async function (args) { return await createTemplate((args && args.where) || 'global') })
  registerTool('vibe_math_add_problem', 'Add a problem to the current project qs.csv.', objParams({ id: { type: 'string' }, description: { type: 'string' }, priority: { type: 'integer' } }, ['id', 'description']), async function (args) { const qs = await getQs(); if (qs.some(function (q) { return q.id === args.id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: args.id, description: args.description, priority: args.priority || 0, status: 'unsolved', deps: [] }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } })
  registerTool('vibe_math_new_project', 'Create a new math project folder and switch to it.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, true) })
  registerTool('vibe_math_set_project', 'Switch the current math project.', objParams({ name: { type: 'string' } }, ['name']), async function (args) { const slug = slugify(args.name); return await setProject(slug, false) })
  registerTool('vibe_math_list_projects', 'List math projects.', objParams({}), async function () { return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') } })
  registerTool('vibe_math_list_decisions', 'List pending manual decisions.', objParams({}), async function () { return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) } })
  registerTool('vibe_math_decide', 'Resolve a pending manual decision.', objParams({ id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject', 'override'] }, verdict: { type: 'string', enum: ['true', 'false'] } }, ['id', 'action']), async function (args) { const resolution = { action: args.action, verdict: args.verdict }; const d = decisionQueue.find(function (x) { return x.id === args.id }); if (!d) return { ok: false, message: 'decision not found' }; if (args.action === 'override' && args.verdict === undefined) return { ok: false, message: 'override requires a verdict (true|false)' }; const applied = await applyDecision(d.node, d.data, resolution); const r = await resolveDecision(args.id, resolution); return Object.assign({ ok: true, applied: applied }, r) })
  registerTool('vibe_math_list_agents', 'List tracked sub-agents (child sessions).', objParams({}), async function () { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round, unitId: m.unitId }) } return { ok: true, agents: out, count: out.length } })
  registerTool('vibe_math_message_agent', 'Send a message to a tracked child agent (next turn).', objParams({ childId: { type: 'string' }, message: { type: 'string' } }, ['childId', 'message']), async function (args) { if (!agentRegistry[args.childId]) return { ok: false, message: 'unknown childId' }; await followupChild(args.childId, args.message); return { ok: true, message: 'message delivered' } })
  registerTool('vibe_math_interrupt_agent', 'Interrupt a tracked child agent.', objParams({ childId: { type: 'string' } }, ['childId']), async function (args) { await interruptChild(args.childId); return { ok: true, message: 'interrupt requested' } })

  // ================= slash command /vibe =================
  async function dispatchVibeCommand(cmd, args, agent) {
    if (cmd === 'start') return await startScheduler(agent)
    if (cmd === 'resume') return await resumeScheduler(agent)
    if (cmd === 'pause') return await pauseScheduler()
    if (cmd === 'abort') return await abortScheduler()
    if (cmd === 'status') return await getStatus()
    if (cmd === 'report') { await maybeWriteReport(true); return buildReport() }
    if (cmd === 'mode') { params.mode = (args[0] === 'manual') ? 'manual' : 'auto'; await saveAll(); return { ok: true, mode: params.mode } }
    if (cmd === 'setup') { const list = PARAM_SCHEMA.map(function (p) { const out = Object.assign({}, p); out.current = params[p.name]; out.default = DEFAULT_PARAMS[p.name]; return out }); return { ok: true, parameters: list, saveTo: frameworkRoot() + '/vibe_math_setting.json' } }
    if (cmd === 'save') return await saveSettings()
    if (cmd === 'template') return await createTemplate(args[0] === 'project' ? 'project' : 'global')
    if (cmd === 'add') { const id = args[0]; const desc = args.slice(1).join(' '); if (!id || !desc) return { ok: false, message: 'usage: /vibe add <id> <description>' }; const qs = await getQs(); if (qs.some(function (q) { return q.id === id })) return { ok: false, message: 'problem id already exists' }; qs.push({ id: id, description: desc, priority: 0, status: 'unsolved', deps: [] }); await writeQs(qs); scheduleTick(); return { ok: true, message: 'problem added' } }
    if (cmd === 'project') {
      if (args.length === 0 || args[0] === 'list') return { ok: true, current: currentProject, projects: await listDirsAt(vibeRoot(), 'Projects') }
      if (args[0] === 'new') return await setProject(slugify(args.slice(1).join(' ')), true)
      return await setProject(slugify(args[0]), false)
    }
    if (cmd === 'decisions') return { ok: true, decisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }) }
    if (cmd === 'agents') { const out = []; const ids = Object.keys(agentRegistry); for (let i = 0; i < ids.length; i++) { const m = agentRegistry[ids[i]]; out.push({ childId: ids[i], role: m.role, qid: m.qid, direction: m.direction, round: m.round }) } return { ok: true, agents: out } }
    return { ok: false, usage: 'start | resume | pause | abort | status | report | mode <auto|manual> | setup | save | template [global|project] | add <id> <description> | project [list | new <name> | <name>] | decisions | agents', message: 'unknown /vibe subcommand: ' + (cmd || '(empty)') }
  }
  ctx.effect(() => commands.register({
    name: 'vibe',
    description: 'control the Vibe Math solver (start/pause/projects/setup/save/decisions/agents)',
    input: { hint: '[start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|project [list|new <name>|<name>]|decisions|agents]' },
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
