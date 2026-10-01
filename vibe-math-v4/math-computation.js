// math-computation.js — the `math_computation` tool for the Vibe Math presets (P1).
//
// CANONICAL COPY. Must stay BYTE-IDENTICAL in:
//   vibe-math-v2/math-computation.js, vibe-math-v3/…, vibe-math-v4/…, vibe-math-v5/…
// Interface freeze: _oneoff/mc-P1-ready/INTERFACE-FREEZE.md
// Contract: _oneoff/math-computation-spec-v3.md (rev-3) + _oneoff/mc-P1-ready/{tool-schema.json,receipt.md,prompts.md,guards.md}
//
// Imports only node:crypto and its sibling ./math-engines.js (no repo imports), so the four
// byte-identical copies work from any preset directory and from an installed .agent-presets dir.
import { createHash } from 'node:crypto'
import { MATH_ENGINES, MATH_ENGINE_ORDER, mathEngineCandidates, mathEngineArgErrorHints } from './math-engines.js'

export const MATH_TOOL_NAME = 'math_computation'

export const MATH_PARAM_NAMES = Object.freeze([
  'mathComputation', 'mathMode', 'mathEngines', 'mathTimeoutMs', 'mathPackages', 'mathInstallScope',
])

export const MATH_PARAM_DEFAULTS = Object.freeze({
  mathComputation: 'auto',
  mathMode: 'typed+shell',
  mathEngines: MATH_ENGINE_ORDER.slice(),
  mathTimeoutMs: 60000,
  mathPackages: [],
  mathInstallScope: 'user',
})

export const MATH_FAILURE_CODES = Object.freeze([
  'MATH_NOT_AVAILABLE',
  'MATH_ENGINE_NOT_FOUND',
  'MATH_ENGINE_LICENSE_REQUIRED',
  'MATH_ENGINE_UNUSABLE',
  'MATH_MISSING_PACKAGES',
  'MATH_TIMEOUT',
  'MATH_NONZERO_EXIT',
  'MATH_ENGINE_BAD_ARGV',
  'MATH_REFUSED',
  'MATH_INVALID_ARGUMENT',
  'MATH_NO_SUBPROCESS',
])

export const MATH_CAPS = Object.freeze({ stdout: 64 * 1024, stderr: 64 * 1024, file: 4 * 1024 * 1024 })

export const MATH_SHELL_FALLBACK_MARK = '未经工具归档'
export const MATH_SHELL_FALLBACK_MARK_EN = 'not tool-archived'
export const MATH_BAD_ARGV_HINT = 'mathEngineOverride'

// ── prompt text (verbatim source: _oneoff/mc-P1-ready/prompts.md) ───────────────────────────────
export const MATH_TOOL_DESCRIPTION = '数学计算：先用 op:\'probe\' 预检本机可用引擎与许可，再用 op:\'run\' 计算（mode=code|file|expr；'
  + 'P1 引擎=python|r|octave|julia + matlab|maple|wolfram（仅探测/许可，永不安装）+ cli（默认开启：用你指定的命令执行，'
  + '仍受本工具的超时/输出上限/cwd 约束并留回执；它与宿主 shell 的区别就是有回执与上限——要用宿主 shell 兜底由 mathMode 控制，'
  + '且结论必须标注未经工具归档））。每次执行都会归档成可复核回执（Computation/<id>/），回执里含实际 argv；'
  + '缺引擎/缺包只报告并给"用户自装指引"或"代理代装计划"（先计划、再确认）；商业引擎只给厂商指引；'
  + '引擎选项报错时会回显 argv 并提示用 mathEngineOverride。计算结果是经验证据，不是证明。'

export const MATH_PERSONA_TOOL_LINE = '- math_computation {op: probe|run|receipt|install, engine, mode: code|file|expr, …} — '
  + '先 probe 预检引擎/包/许可，再调引擎计算并把脚本与输出归档成可复核回执；缺引擎/缺包只报告与给安装指引/计划；shell 兜底不算归档。'

export const MATH_RULE_LINES = Object.freeze([
  '- 需要精确数值、符号化简、反例搜索、统计或线性代数时调用 math_computation：先 probe，再 run。',
  '- 复核他人的数值结论时用 op:\'receipt\'（或 op:\'run\', mode:\'file\' 指向同一脚本）重跑，并把回执路径写进报告。',
  '- 归档即引用：报告里带 Computation/<id>/receipt.json；这是"支撑材料"的用法。',
  '- 判断标准：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）——没把握的先别入库。',
  '- 不得把计算结果当成"已证明"：对象是否已验证仍只由本预设既有的验证/共识路径给出。',
])

// The shell-fallback sentence is deliberately NOT part of MATH_RULE_LINES: it is only advertised
// when mathMode === 'typed+shell'. Owners either use mathAvailabilityLine(probe, lang, mathMode)
// (which appends it conditionally) or append MATH_SHELL_RULE_LINE themselves under the same
// condition. A 'typed' preset must contain no shell-fallback sentence at all.
export const MATH_SHELL_RULE_LINE = '- shell 兜底标注：工具不可用而改用宿主 shell 时，结论必须写"未经工具归档（shell 路径）"，且不得与工具回执混同（shell 无回执、无超时/输出上限保证）。'

export const MATH_RULE_LINES_EN = Object.freeze([
  '- Call math_computation for exact numerics, symbolic simplification, counter-example search, statistics or linear algebra: probe first, then run.',
  '- To re-check someone else\'s numeric conclusion, re-run the same script (op:\'receipt\' or op:\'run\', mode:\'file\') and cite the receipt path.',
  '- Archive means cite: put Computation/<id>/receipt.json in your report - that is what "supporting material" means.',
  '- Criteria: (1) valuable or likely reusable; (2) important or necessary; (3) you are confident in it - do not archive what you are unsure about.',
  '- Never treat a computation result as "proved": whether an object is verified is still decided only by this preset\'s existing verification/consensus path.',
])

export const MATH_SHELL_RULE_LINE_EN = '- Shell fallback: if the tool cannot run you may use the host shell, but mark the conclusion "not tool-archived (shell path)" - shell runs have no receipt and no timeout/output guarantees; only tool-routed computations count as reproducible supporting material.'

export const MATH_TOOL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['probe', 'run', 'receipt', 'install'] },
    engine: { type: 'string' },
    mode: { type: 'string', enum: ['code', 'file', 'expr'] },
    code: { type: 'string' },
    file: { type: 'string' },
    expr: { type: 'string' },
    packages: { type: 'array', items: { type: 'string' } },
    timeoutMs: { type: 'integer' },
    captureFiles: { type: 'array', items: { type: 'string' } },
    record: { type: 'boolean' },
    cli: {
      type: 'object',
      properties: { command: { type: 'string' }, argv: { type: 'array', items: { type: 'string' } }, stdin: { type: 'string' } },
      required: ['command'],
      additionalProperties: false,
    },
    scope: { type: 'string', enum: ['user', 'system'] },
    dryRun: { type: 'boolean' },
    confirm: { type: 'string' },
  },
  required: ['op'],
  additionalProperties: false,
})

// ── small helpers ───────────────────────────────────────────────────────────────────────────────
function sha256(s) { return createHash('sha256').update(String(s)).digest('hex') }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v) }
function canonical(s) { return String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '') + '\n' }
function slug(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'default' }
function absJoin(root, rel) { return String(root).replace(/[\\/]+$/, '') + '/' + String(rel).replace(/^[\\/]+/, '') }
function projectRel(root, rel) {
  const raw = String(rel == null ? '' : rel).trim()
  if (!raw) return null
  const norm = raw.replace(/\\/g, '/')
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return null
  const parts = []
  for (const seg of norm.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') { if (!parts.length) return null; parts.pop(); continue }
    parts.push(seg)
  }
  return parts.join('/')
}

// ── params ──────────────────────────────────────────────────────────────────────────────────────
export function normalizeMathParams(raw) {
  const r = isObj(raw) ? raw : {}
  const out = {}
  if ('mathComputation' in r) out.mathComputation = (r.mathComputation === 'off' || r.mathComputation === 'auto' || r.mathComputation === 'on') ? r.mathComputation : MATH_PARAM_DEFAULTS.mathComputation
  if ('mathMode' in r) out.mathMode = (r.mathMode === 'typed' || r.mathMode === 'typed+shell') ? r.mathMode : MATH_PARAM_DEFAULTS.mathMode
  if ('mathEngines' in r) {
    const list = Array.isArray(r.mathEngines) ? r.mathEngines.filter((x) => typeof x === 'string' && !!MATH_ENGINES[x]) : []
    const seen = []
    for (const n of list) if (seen.indexOf(n) === -1) seen.push(n)
    out.mathEngines = seen.length ? seen : MATH_PARAM_DEFAULTS.mathEngines.slice()
  }
  if ('mathTimeoutMs' in r) {
    const n = Number(r.mathTimeoutMs)
    out.mathTimeoutMs = Number.isFinite(n) && n > 0 ? Math.max(1000, Math.floor(n)) : MATH_PARAM_DEFAULTS.mathTimeoutMs
  }
  if ('mathPackages' in r) {
    const list = Array.isArray(r.mathPackages) ? r.mathPackages.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
    const seen = []
    for (const n of list) if (seen.indexOf(n) === -1) seen.push(n)
    out.mathPackages = seen
  }
  if ('mathInstallScope' in r) out.mathInstallScope = (r.mathInstallScope === 'user' || r.mathInstallScope === 'system') ? r.mathInstallScope : MATH_PARAM_DEFAULTS.mathInstallScope
  return out
}

export function effectiveMathParams(raw) {
  return Object.assign({}, MATH_PARAM_DEFAULTS, normalizeMathParams(raw))
}

// ── closed-schema validation ────────────────────────────────────────────────────────────────────
const ALLOWED_ARGS = ['op', 'engine', 'mode', 'code', 'file', 'expr', 'packages', 'timeoutMs', 'captureFiles', 'record', 'cli', 'scope', 'dryRun', 'confirm']
function bad(reason, code, nextHint) { const out = { ok: false, code: code || 'MATH_INVALID_ARGUMENT', reason: reason }; if (nextHint) out.next = nextHint; return out }

export function validateMathArgs(args, params) {
  if (!isObj(args)) return bad('args must be an object')
  for (const k of Object.keys(args)) if (ALLOWED_ARGS.indexOf(k) === -1) return bad('unknown argument: ' + k)
  const op = args.op
  if (op !== 'probe' && op !== 'run' && op !== 'receipt' && op !== 'install') return bad('op must be probe|run|receipt|install')
  const p = effectiveMathParams(params)
  if (args.engine !== undefined) {
    if (typeof args.engine !== 'string') return bad('engine must be a string')
    if (args.engine !== 'auto' && !MATH_ENGINES[args.engine]) return bad('unknown engine: ' + args.engine)
  }
  if (args.packages !== undefined && (!Array.isArray(args.packages) || args.packages.some((x) => typeof x !== 'string'))) return bad('packages must be a string[]')
  if (args.captureFiles !== undefined && (!Array.isArray(args.captureFiles) || args.captureFiles.some((x) => typeof x !== 'string'))) return bad('captureFiles must be a string[]')
  if (args.timeoutMs !== undefined) {
    const n = Number(args.timeoutMs)
    if (!Number.isFinite(n) || n < 1000) return bad('timeoutMs must be an integer >= 1000')
  }
  if (args.record !== undefined && typeof args.record !== 'boolean') return bad('record must be a boolean')
  if (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') return bad('dryRun must be a boolean')
  if (args.confirm !== undefined && typeof args.confirm !== 'string') return bad('confirm must be a string')
  if (args.scope !== undefined && args.scope !== 'user' && args.scope !== 'system') return bad('scope must be user|system')
  if (args.cli !== undefined) {
    if (!isObj(args.cli)) return bad('cli must be an object')
    for (const k of Object.keys(args.cli)) if (['command', 'argv', 'stdin'].indexOf(k) === -1) return bad('unknown cli key: ' + k)
    if (typeof args.cli.command !== 'string' || !args.cli.command.trim()) return bad('cli.command is required')
    if (args.cli.argv !== undefined && (!Array.isArray(args.cli.argv) || args.cli.argv.some((x) => typeof x !== 'string'))) return bad('cli.argv must be a string[]')
  }
  if (op === 'run') {
    const mode = args.mode
    if (mode !== 'code' && mode !== 'file' && mode !== 'expr') return bad('mode must be code|file|expr for op=run')
    const engine = args.engine || 'auto'
    if (engine === 'cli') {
      if (p.mathMode !== 'typed+shell') return bad('engine=cli is disabled while mathMode=' + p.mathMode, 'MATH_REFUSED', next('reason', { reason: 'policy' }))
      if (p.mathEngines.indexOf('cli') === -1) return bad('engine=cli is not in mathEngines', 'MATH_REFUSED', next('reason', { reason: 'engine-not-allowed' }))
      if (!isObj(args.cli)) return bad('engine=cli requires cli:{command,argv}', 'MATH_REFUSED', next('reason', { reason: 'missing-cli-command' }))
      if (mode === 'expr') return bad('cli does not support mode=expr', 'MATH_REFUSED', next('reason', { reason: 'expr-not-supported' }))
    }
    if (mode === 'code' && typeof args.code !== 'string') return bad('mode=code requires code')
    if (mode === 'file') {
      if (typeof args.file !== 'string') return bad('mode=file requires file')
      if (projectRel('', args.file) === null) return bad('file must be a project-relative path inside the project', 'MATH_REFUSED', next('reason', { reason: 'path-outside-project' }))
    }
    if (mode === 'expr' && typeof args.expr !== 'string') return bad('mode=expr requires expr')
    if (engine !== 'cli' && !MATH_ENGINES[engine] && engine !== 'auto') return bad('unknown engine: ' + engine)
  }
  if (op === 'receipt' && typeof args.file !== 'string') return bad('op=receipt requires file (a receipt id or script path)')
  if (op === 'install') {
    if (!Array.isArray(args.packages) || !args.packages.length) return bad('op=install requires packages[]')
  }
  return { ok: true, args: args, params: p }
}

// ── failure / return shells ─────────────────────────────────────────────────────────────────────
function next(kind, extra) { return Object.assign({ kind: kind }, extra || {}) }
function fail(code, engine, message, extra) {
  const out = { ok: false, op: null, engine: engine || null, code: code, message: message }
  if (extra && extra.next) out.next = extra.next
  if (extra && extra.argv) out.argv = extra.argv
  if (extra && extra.receipt) out.receipt = extra.receipt
  if (extra && extra.missing) out.missing = extra.missing
  if (extra && extra.engines) out.engines = extra.engines
  if (extra && extra.available !== undefined) out.available = extra.available
  if (extra && extra.packages) out.packages = extra.packages
  return out
}

function userInstallNext(engine) {
  const d = MATH_ENGINES[engine] || {}
  const per = d.userInstall || {}
  const platform = process && process.platform === 'win32' ? 'windows' : (process && process.platform === 'darwin' ? 'macos' : 'linux')
  return next('user-install', { engine: engine, perOs: per, command: per[platform] || '', platform: platform })
}

// ── host adaptation ─────────────────────────────────────────────────────────────────────────────
function adaptHost(host) {
  const h = host || {}
  if (h.__mathAdapted) return h.__mathAdapted
  const need = ['register', 'projectRoot', 'writeText', 'readText', 'exists', 'resolveExecutable', 'spawn']
  for (const k of need) if (typeof h[k] !== 'function') throw new Error('math_computation: host.' + k + ' is required')
  const adapted = {
    register: h.register,
    params: typeof h.params === 'function' ? h.params : function () { return h.params || {} },
    projectRoot: h.projectRoot,
    designator: typeof h.designator === 'string' && h.designator ? h.designator : 'vibe-math',
    writeText: h.writeText,
    readText: h.readText,
    exists: h.exists,
    resolveExecutable: h.resolveExecutable,
    spawn: h.spawn,
    hasSubprocess: typeof h.hasSubprocess === 'function' ? h.hasSubprocess : null,
    log: typeof h.log === 'function' ? h.log : function () {},
  }
  adapted.__mathHost = true
  try { h.__mathAdapted = adapted } catch (e) { /* frozen host object: the caller can still pass the adapted one */ }
  return adapted
}

const PROBE_CACHE = new WeakMap()

export async function probeMathEngines(host, opts) {
  const H = adaptHost(host)
  const params = effectiveMathParams(typeof H.params === 'function' ? H.params() : H.params)
  const refresh = !!(opts && opts.refresh)
  const cached = PROBE_CACHE.get(H)
  if (cached && !refresh) return cached
  const engines = []
  for (const name of params.mathEngines) {
    const d = MATH_ENGINES[name]
    if (!d) continue
    if (name === 'cli') continue // cli needs a caller-supplied command, so it is not auto-detected
    const hit = await resolveCandidate(H, d)
    if (!hit) continue
    const v = await probeVersion(H, d, hit)
    if (!v.ok) {
      if (d.license === 'commercial') continue // installed but not usable: reported by op=run as LICENSE_REQUIRED
      continue
    }
    engines.push({ name: name, version: v.version, path: hit, license: d.license })
  }
  const result = { ok: true, engines: engines, available: engines.length > 0 }
  PROBE_CACHE.set(H, result)
  return result
}

async function resolveCandidate(H, d) {
  const cands = mathEngineCandidates(d.name)
  if (!cands) return null
  for (const c of cands) {
    try {
      const p = await H.resolveExecutable(c)
      if (typeof p === 'string' && p) return p
    } catch (e) { /* not this one */ }
  }
  return null
}

async function probeVersion(H, d, exe) {
  const r = await H.spawn({ argv: [exe].concat(d.versionArgv || []), cwd: await H.projectRoot(), timeoutMs: 5000, stdoutCap: 8192, stderrCap: 8192 })
  if (!r || r.timedOut) return { ok: false }
  const m = new RegExp(d.versionRe).exec(String(r.stdout || '') + '\n' + String(r.stderr || ''))
  return { ok: r.exit === 0 && !!m, version: m ? m[1] : 'unknown' }
}

async function checkLicence(H, d, exe) {
  if (d.license !== 'commercial') return { ok: true }
  if (!d.licenseProbe) return { ok: false }
  const r = await H.spawn({ argv: [exe].concat(d.licenseProbe.argv), cwd: await H.projectRoot(), timeoutMs: 10000, stdoutCap: 8192, stderrCap: 8192 })
  if (!r || r.timedOut || r.exit !== 0) return { ok: false }
  if (d.licenseProbe.okWhen === 'trim-1') return { ok: String(r.stdout || '').trim() === '1' }
  if (d.licenseProbe.okWhen === 'not-unlicensed') return { ok: !/Unlicensed/i.test(String(r.stdout || '')) }
  return { ok: true }
}

async function resolveEngine(H, requested, params, args) {
  const names = requested === 'auto' ? params.mathEngines.slice() : [requested]
  for (const name of names) {
    const d = MATH_ENGINES[name]
    if (!d) continue
    if (params.mathEngines.indexOf(name) === -1) return fail('MATH_REFUSED', name, '引擎 ' + name + ' 不在 mathEngines 允许列表内', { next: next('reason', { reason: 'engine-not-allowed' }) })
    if (name === 'cli') {
      if (params.mathMode !== 'typed+shell') return fail('MATH_REFUSED', name, 'cli 被策略禁用（mathMode=' + params.mathMode + '）', { next: next('reason', { reason: 'policy' }) })
      let exe = null
      try { exe = await H.resolveExecutable(args.cli.command) } catch (e) { exe = null }
      if (!exe) return fail('MATH_ENGINE_NOT_FOUND', name, 'cli 命令无法解析：' + args.cli.command, { next: userInstallNext('cli') })
      return { ok: true, name: name, desc: d, exe: exe, version: 'unknown' }
    }
    const hit = await resolveCandidate(H, d)
    if (!hit) continue
    const v = await probeVersion(H, d, hit)
    if (!v.ok) {
      if (d.license === 'commercial' || d.versionOptional) {
        const lic = await checkLicence(H, d, hit)
        if (!lic.ok) return fail('MATH_ENGINE_LICENSE_REQUIRED', name, name + ' 已安装但许可不可用（仅厂商可激活）', { next: next('vendor', { engine: name, url: d.vendor || '' }) })
        return { ok: true, name: name, desc: d, exe: hit, version: 'unknown' }
      }
      return fail('MATH_ENGINE_UNUSABLE', name, name + ' 存在但不可用（版本探针失败）', { next: userInstallNext(name) })
    }
    const lic = await checkLicence(H, d, hit)
    if (!lic.ok) return fail('MATH_ENGINE_LICENSE_REQUIRED', name, name + ' 已安装但许可不可用（仅厂商可激活）', { next: next('vendor', { engine: name, url: d.vendor || '' }) })
    return { ok: true, name: name, desc: d, exe: hit, version: v.version }
  }
  const first = requested === 'auto' ? (params.mathEngines[0] || 'python') : requested
  return fail('MATH_ENGINE_NOT_FOUND', first, '本机没有可用的计算引擎（试过：' + names.join(', ') + '）', { next: userInstallNext(first) })
}

// ── package probe ───────────────────────────────────────────────────────────────────────────────
function buildProbeArgv(d, pkgs) {
  const quoted = pkgs.map((p) => '"' + String(p).replace(/"/g, '') + '"').join(',')
  const plain = pkgs.join(',')
  const code = String(d.probeCode || '').replace(/__QPKGS__/g, quoted).replace(/__PKGS__/g, plain)
  return (d.packageProbe.argv || []).map((a) => a === '<probeCode>' ? code : a === '<pkgs>' ? plain : a)
}

async function probePackages(H, det, pkgs) {
  const found = {}
  for (const p of pkgs) found[p] = null
  if (!pkgs.length || !det.desc.packageProbe) return { requested: pkgs.slice(), found: found }
  const r = await H.spawn({ argv: [det.exe].concat(buildProbeArgv(det.desc, pkgs)), cwd: await H.projectRoot(), timeoutMs: 15000, stdoutCap: 16384, stderrCap: 16384 })
  if (r && !r.timedOut) {
    if (det.desc.packageProbe.parse === 'lines') {
      const text = String(r.stdout || '')
      for (const p of pkgs) if (new RegExp('(^|\\s)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm').test(text)) found[p] = 'present'
    } else {
      for (const tok of String(r.stdout || '').split('|')) {
        const idx = tok.indexOf(':')
        if (idx <= 0) continue
        const name = tok.slice(0, idx).trim()
        const state = tok.slice(idx + 1).trim()
        if (Object.prototype.hasOwnProperty.call(found, name)) found[name] = (state === 'ok' || state === '1' || state === 'TRUE' || state === 'True') ? 'present' : null
      }
    }
  }
  return { requested: pkgs.slice(), found: found }
}

// ── argv assembly ───────────────────────────────────────────────────────────────────────────────
function assembleArgv(det, mode, payload) {
  const d = det.desc
  if (det.name === 'cli') {
    const cliArgv = (payload.cli && Array.isArray(payload.cli.argv)) ? payload.cli.argv : []
    return { argv: [det.exe].concat(cliArgv), cli: { command: payload.cli.command, argv: cliArgv } }
  }
  if (mode === 'code' || mode === 'file') {
    return { argv: [det.exe].concat((d.scriptArgv || []).map((a) => a === '<script>' ? payload.scriptAbs : a)) }
  }
  if (mode === 'expr') {
    if (!d.evalArgv) return { refused: 'engine does not support mode=expr' }
    return { argv: [det.exe].concat(d.evalArgv.map((a) => a === '<expr>' ? payload.expr : a)) }
  }
  return { refused: 'unknown mode' }
}

function applyOverride(det, params) {
  const d = det.desc
  const ov = params && params.mathEngineOverride
  const o = ov && isObj(ov) ? ov[det.name] : null
  if (!o) return d
  return Object.assign({}, d, {
    versionArgv: Array.isArray(o.versionArgv) ? o.versionArgv.slice() : d.versionArgv,
    scriptArgv: Array.isArray(o.scriptArgv) ? o.scriptArgv.slice() : d.scriptArgv,
    evalArgv: Array.isArray(o.evalArgv) ? o.evalArgv.slice() : d.evalArgv,
    packageProbe: isObj(o.packageProbe) ? o.packageProbe : d.packageProbe,
  })
}

// ── receipt ────────────────────────────────────────────────────────────────────────────────────
function runIdOf(designator, projectSlug, engine, mode, scriptText, packages) {
  const input = sha256([engine, mode, canonical(scriptText), packages.slice().sort().join(',')].join('\n'))
  return { runId: designator + '-' + projectSlug + '-' + input.slice(0, 12), input: input }
}

function renderReceiptMd(r, fullOut, fullErr) {
  const lines = []
  lines.push('# 计算回执｜' + r.preset + ' · ' + r.project + '｜' + r.runId)
  lines.push('')
  lines.push('- 引擎：' + r.engine.name + ' ' + r.engine.version + '（source=' + r.engine.source + '，path=' + r.engine.path + '）')
  lines.push('- 模式：' + r.mode + '｜cwd：' + r.cwd)
  lines.push('- 命令（照抄可复跑）：' + r.argv.join(' '))
  lines.push('- 结果：exit=' + r.exit + '｜耗时 ' + r.ms + 'ms｜超时=' + r.timedOut + '｜输出截断 ' + r.truncated.stdout + '/' + r.truncated.stderr)
  lines.push('- 脚本：' + r.script.path + '（sha256=' + String(r.script.sha256).slice(0, 16) + '…，' + r.script.bytes + ' bytes）')
  const missing = Object.keys(r.packages.found).filter((k) => !r.packages.found[k])
  lines.push('- 包：' + (Object.keys(r.packages.found).length ? Object.keys(r.packages.found).map((k) => k + '=' + (r.packages.found[k] || '未找到')).join('、') : '（未请求）') + (missing.length ? '｜缺失：' + missing.join(',') : ''))
  lines.push('- 网络：**未由插件强制**（subprocess.spawn 无 policy 槽）')
  lines.push('- 复现：math_computation { op:\'run\', engine:\'' + r.engine.name + '\', mode:\'file\', file:\'' + r.script.path + '\' }')
  lines.push('')
  lines.push('## 输出摘要（stdout，共 ' + String(fullOut || '').split('\n').length + ' 行）')
  lines.push(String(fullOut || '').split('\n').slice(0, 20).join('\n'))
  if (fullErr) { lines.push(''); lines.push('## stderr（前 10 行）'); lines.push(String(fullErr).split('\n').slice(0, 10).join('\n')) }
  lines.push('')
  lines.push('> 本回执是**经验证据**，不是数学证明；对象是否"已验证"仍由该预设既有的验证/共识路径给出。')
  return lines.join('\n') + '\n'
}

// ── op: probe ──────────────────────────────────────────────────────────────────────────────────
async function opProbe(H, args, params) {
  const probe = await probeMathEngines(H, { refresh: !!(args.packages && args.packages.indexOf('refresh') !== -1) })
  const pkgs = (args.packages || []).filter((p) => p !== 'refresh')
  const want = pkgs.length ? pkgs : params.mathPackages
  let packages = { requested: want.slice(), found: {} }
  if (want.length && probe.engines.length) {
    const det = await resolveEngine(H, args.engine && args.engine !== 'auto' ? args.engine : probe.engines[0].name, params, args)
    if (det.ok) packages = await probePackages(H, det, want)
  }
  if (!probe.available) {
    const first = params.mathEngines[0] || 'python'
    const out = fail('MATH_ENGINE_NOT_FOUND', first, '本机没有可用的计算引擎', { next: userInstallNext(first), engines: [], available: false, packages: packages })
    out.op = 'probe'
    return out
  }
  return { ok: true, op: 'probe', engine: null, engines: probe.engines, available: true, packages: packages, message: '可用引擎：' + probe.engines.map((e) => e.name + ' ' + e.version).join('、') }
}

// ── op: run ─────────────────────────────────────────────────────────────────────────────────────
async function opRun(H, args, params) {
  const mode = args.mode
  const det = await resolveEngine(H, args.engine || 'auto', params, args)
  if (!det.ok) return det
  const desc = applyOverride(det, params)
  const det2 = { ok: true, name: det.name, desc: desc, exe: det.exe, version: det.version }
  // The generic escape hatch is recorded as `cli:<command>` (spec §4.3 / guards §18): the model and
  // the receipt must be able to tell WHICH command was run, not just that it was "cli".
  const cliCommand = args.cli && typeof args.cli.command === 'string' ? args.cli.command : ''
  const engineLabel = det.name === 'cli' ? ('cli:' + cliCommand) : det.name

  const want = (args.packages && args.packages.length) ? args.packages : params.mathPackages
  const pk = await probePackages(H, det2, want)
  const missing = want.filter((p) => Object.prototype.hasOwnProperty.call(pk.found, p) && !pk.found[p])
  if (missing.length) {
    return fail('MATH_MISSING_PACKAGES', det.name, '需要的包未安装：' + missing.join(', '), {
      missing: missing,
      next: next('agent-install', { engine: det.name, packages: missing, dryRun: true }),
      packages: pk,
    })
  }

  const root = await H.projectRoot()
  let scriptText = ''
  let fileRel = null
  if (mode === 'code') scriptText = args.code
  else if (mode === 'file') {
    fileRel = projectRel('', args.file)
    if (fileRel === null) return fail('MATH_REFUSED', det.name, 'file 必须位于项目内：' + args.file, { next: next('reason', { reason: 'path-outside-project' }) })
    const txt = await H.readText(fileRel)
    if (txt === undefined) return fail('MATH_REFUSED', det.name, '找不到文件：' + args.file, { next: next('reason', { reason: 'file-not-found' }) })
    scriptText = txt
  } else scriptText = (args.expr || '') + '\n'

  const { runId, input } = runIdOf(H.designator, slug(await H.projectRoot()), det.name, mode, scriptText, want)
  const dir = 'Computation/' + runId
  const scriptRel = dir + '/script' + (det.name === 'cli' ? '.txt' : desc.ext)
  const scriptAbs = absJoin(root, scriptRel)
  const wrote = await H.writeText(scriptRel, scriptText)
  if (wrote === false) return fail('MATH_INVALID_ARGUMENT', det.name, '无法写入 ' + scriptRel)

  const assembled = assembleArgv(det2, mode, {
    scriptAbs: scriptAbs,
    expr: args.expr,
    cli: args.cli,
  })
  if (assembled.refused) return fail('MATH_REFUSED', det.name, assembled.refused, { next: next('reason', { reason: 'mode-not-supported' }) })

  const timeoutMs = args.timeoutMs || params.mathTimeoutMs
  const r = await H.spawn({ argv: assembled.argv, cwd: root, timeoutMs: timeoutMs, stdoutCap: MATH_CAPS.file, stderrCap: MATH_CAPS.file })
  if (!r) return fail('MATH_NO_SUBPROCESS', det.name, '宿主不提供 subprocess 服务，无法执行计算', { next: next('note', { reason: 'no-subprocess' }) })

  const fullOut = String(r.stdout || '')
  const fullErr = String(r.stderr || '')
  await H.writeText(dir + '/stdout.txt', fullOut)
  await H.writeText(dir + '/stderr.txt', fullErr)

  const captured = []
  for (const cf of (args.captureFiles || [])) {
    const rel = projectRel('', cf)
    if (rel === null) continue
    const txt = await H.readText(rel)
    if (txt === undefined) continue
    const dest = dir + '/captured/' + rel
    if (await H.writeText(dest, txt) !== false) captured.push(rel)
  }

  const receipt = {
    schema: 'vibe-math/math-computation-receipt@1',
    runId: runId, preset: H.designator, project: slug(root), op: 'run', mode: mode,
    engine: { name: engineLabel, path: det.exe, version: det.version, source: det.name === 'cli' ? 'cli' : 'path' },
    script: { path: scriptRel, sha256: sha256(scriptText), bytes: Buffer.byteLength(scriptText, 'utf8') },
    argv: assembled.argv.slice(),
    cwd: root,
    packages: { requested: want.slice(), found: pk.found },
    exit: r.timedOut ? null : (r.exit === undefined ? null : r.exit),
    timedOut: !!r.timedOut,
    ms: Number(r.ms || 0),
    truncated: { stdout: fullOut.length > MATH_CAPS.stdout, stderr: fullErr.length > MATH_CAPS.stderr },
    artifacts: [{ path: 'stdout.txt', sha256: sha256(fullOut), bytes: Buffer.byteLength(fullOut, 'utf8') }],
    captured: captured,
    network: 'not-enforced-by-plugin',
    determinism: { inputSha256: input, packagesSorted: true, noWallClockInId: true },
  }
  if (assembled.cli) receipt.cli = { command: assembled.cli.command, argv: assembled.cli.argv, stdinUsed: false }
  const receiptJson = JSON.stringify(receipt, null, 2)
  await H.writeText(dir + '/receipt.json', receiptJson)
  await H.writeText(dir + '/receipt.md', renderReceiptMd(receipt, fullOut, fullErr))
  const receiptRef = { dir: dir, json: dir + '/receipt.json', md: dir + '/receipt.md', sha256: sha256(receiptJson) }
  H.log('math_computation', det.name + ' ' + (det.name === 'cli' ? 'cli' : mode) + ' exit=' + receipt.exit + ' argv=' + assembled.argv.join(' '))

  const shell = {
    ok: true, op: 'run', engine: engineLabel, mode: mode,
    engineInfo: receipt.engine,
    argv: assembled.argv.slice(),
    packages: pk.found,
    exit: receipt.exit, timedOut: receipt.timedOut, ms: receipt.ms,
    stdout: fullOut.slice(0, MATH_CAPS.stdout), stderr: fullErr.slice(0, MATH_CAPS.stderr),
    truncated: receipt.truncated, artifacts: receipt.artifacts, receipt: receiptRef,
    warnings: receipt.truncated.stdout ? [{ code: 'OUTPUT_TRUNCATED', message: 'stdout 超过 64KB，完整版见 ' + receiptRef.dir + '/stdout.txt' }] : [],
  }
  if (receipt.timedOut) {
    return Object.assign(fail('MATH_TIMEOUT', engineLabel, '执行超时（' + timeoutMs + 'ms）已被终止', { argv: assembled.argv.slice(), receipt: receiptRef }), { ms: receipt.ms, timedOut: true })
  }
  if (r.exit !== 0) {
    const blob = fullErr + '\n' + fullOut
    const hints = mathEngineArgErrorHints(det.name)
    const looksLikeArgError = hints.some((h) => blob.toLowerCase().indexOf(String(h).toLowerCase()) !== -1)
    if (looksLikeArgError) {
      const out = fail('MATH_ENGINE_BAD_ARGV', engineLabel, engineLabel + ' 以选项/用法错误退出（argv=' + assembled.argv.join(' ') + '）。模板可能与本机版本不符：请用 mathEngineOverride 覆盖 versionArgv/scriptArgv/evalArgv。', {
        argv: assembled.argv.slice(),
        receipt: receiptRef,
        next: next('engine-override', { engine: det.name, argv: assembled.argv.slice(), hint: MATH_BAD_ARGV_HINT }),
      })
      out.exit = r.exit
      out.stderr = fullErr.slice(0, MATH_CAPS.stderr)
      return out
    }
    const out = fail('MATH_NONZERO_EXIT', engineLabel, '引擎以非零退出码结束：' + r.exit, { argv: assembled.argv.slice(), receipt: receiptRef })
    out.exit = r.exit
    out.stderr = fullErr.slice(0, MATH_CAPS.stderr)
    return out
  }
  return shell
}

// ── op: receipt ────────────────────────────────────────────────────────────────────────────────
async function opReceipt(H, args) {
  const raw = String(args.file || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const segs = raw.split('/').filter(Boolean)
  const runId = (segs[0] === 'Computation' ? segs[1] : segs[0]) || ''
  if (!runId) return fail('MATH_INVALID_ARGUMENT', null, 'op=receipt requires a receipt id or path')
  const dir = 'Computation/' + runId
  const json = await H.readText(dir + '/receipt.json')
  if (json === undefined) return fail('MATH_INVALID_ARGUMENT', null, '没有找到回执：' + dir, { next: next('reason', { reason: 'no-such-receipt' }) })
  let parsed
  try { parsed = JSON.parse(json) } catch (e) { return fail('MATH_INVALID_ARGUMENT', null, '回执无法解析：' + dir) }
  const out = await H.readText(dir + '/stdout.txt')
  const err = await H.readText(dir + '/stderr.txt')
  await H.writeText(dir + '/receipt.md', renderReceiptMd(parsed, out || '', err || ''))
  return { ok: true, op: 'receipt', engine: parsed.engine ? parsed.engine.name : null, receipt: { dir: dir, json: dir + '/receipt.json', md: dir + '/receipt.md' }, message: '回执已重渲染（幂等，未重跑）' }
}

// ── op: install ────────────────────────────────────────────────────────────────────────────────
function substInstall(tmpl, engineName, exe, pkg) {
  return tmpl.map((a) => String(a).replace(/<exe>/g, exe).replace(/<pkg>/g, pkg).replace(/__PKG__/g, pkg))
}

async function opInstall(H, args, params) {
  const engineName = (args.engine && args.engine !== 'auto') ? args.engine : (params.mathEngines[0] || 'python')
  const d = MATH_ENGINES[engineName]
  if (!d) return fail('MATH_INVALID_ARGUMENT', engineName, 'unknown engine: ' + engineName)
  if (d.license === 'commercial' || !d.install) {
    return fail('MATH_REFUSED', engineName, engineName + ' 永不代装（商业引擎只给厂商指引）', {
      next: next('vendor', { engine: engineName, url: d.vendor || '' }),
    })
  }
  const scope = args.scope || params.mathInstallScope || 'user' // per-call only; never persisted anywhere
  const tmpl = scope === 'system' ? d.install.systemArgv : d.install.userArgv
  if (!tmpl) return fail('MATH_REFUSED', engineName, engineName + ' 不支持 system 作用域（只提供用户级安装）', { next: next('reason', { reason: 'system-scope-unsupported' }) })
  let exe = engineName
  try { exe = (await H.resolveExecutable(engineName === 'r' ? 'Rscript' : engineName)) || engineName } catch (e) { exe = engineName }
  const commands = args.packages.map((p) => ({ argv: substInstall(tmpl, engineName, exe, p), why: '缺少 ' + p }))
  const plan = { engine: engineName, scope: scope, manager: d.install.manager, commands: commands, note: scope === 'user' ? '将安装到用户级目录' : '仅本次系统作用域（不会被记住）' }
  const planToken = sha256(JSON.stringify({ engine: engineName, packages: args.packages, scope: scope, commands: commands }) + '|planVersion=1').slice(0, 32)
  if (!args.confirm) {
    return { ok: true, op: 'install', engine: engineName, plan: plan, planToken: planToken, next: next('agent-install', { dryRun: true }), message: '安装计划（尚未执行）：' + commands.map((c) => c.argv.join(' ')).join(' ; ') }
  }
  if (args.confirm !== planToken) {
    return fail('MATH_REFUSED', engineName, 'planToken 不匹配（计划可能已变），请重新出计划', { next: next('reason', { reason: 'plan-token-mismatch' }) })
  }
  const timeoutMs = args.timeoutMs || params.mathTimeoutMs
  const results = []
  for (const c of commands) {
    const r = await H.spawn({ argv: c.argv, cwd: await H.projectRoot(), timeoutMs: timeoutMs, stdoutCap: MATH_CAPS.file, stderrCap: MATH_CAPS.file })
    results.push({ argv: c.argv, exit: r ? r.exit : null, timedOut: !!(r && r.timedOut), ms: r ? r.ms : 0, stdoutTail: String((r && r.stdout) || '').slice(-2000), stderrTail: String((r && r.stderr) || '').slice(-2000) })
    if (!r || r.timedOut || r.exit !== 0) {
      const audit0 = { schema: 'vibe-math/math-computation-install@1', planToken: planToken, scope: scope, manager: d.install.manager, commands: commands, results: results, exit: r ? r.exit : null, timedOut: !!(r && r.timedOut), installed: args.packages, rollback: rollbackFor(d, exe, args.packages), network: 'not-enforced-by-plugin' }
      await H.writeText('Computation/installs/' + planToken + '.json', JSON.stringify(audit0, null, 2))
      const code = (r && r.timedOut) ? 'MATH_TIMEOUT' : 'MATH_NONZERO_EXIT'
      const out = fail(code, engineName, '安装失败（' + c.argv.join(' ') + '）：' + (r ? ('exit=' + r.exit) : 'no subprocess'), { next: next('note', { audit: 'Computation/installs/' + planToken + '.json' }) })
      out.audit = 'Computation/installs/' + planToken + '.json'
      return out
    }
  }
  const audit = { schema: 'vibe-math/math-computation-install@1', planToken: planToken, scope: scope, manager: d.install.manager, commands: commands, results: results, exit: 0, timedOut: false, installed: args.packages, before: {}, after: {}, rollback: rollbackFor(d, exe, args.packages), network: 'not-enforced-by-plugin' }
  await H.writeText('Computation/installs/' + planToken + '.json', JSON.stringify(audit, null, 2))
  return { ok: true, op: 'install', engine: engineName, executed: true, scope: scope, audit: 'Computation/installs/' + planToken + '.json', message: '已安装：' + args.packages.join(', ') + '（审计：Computation/installs/' + planToken + '.json）' }
}

function rollbackFor(d, exe, packages) {
  const tmpl = d.install && d.install.uninstallArgv
  if (!tmpl) return { supported: 'partial', commands: [], note: '该管理器未提供卸载模板；本工具不做自动回滚' }
  return { supported: 'partial', commands: packages.map((p) => substInstall(tmpl, d.name, exe, p)), note: '包管理器各自支持卸载；本工具不做自动回滚' }
}

// ── dispatch + registration ────────────────────────────────────────────────────────────────────
async function dispatch(H, rawArgs) {
  const params = effectiveMathParams(typeof H.params === 'function' ? H.params() : H.params)
  if (params.mathComputation === 'off') {
    return fail('MATH_NOT_AVAILABLE', null, '该预设已关闭数学计算（mathComputation=off）', { next: next('enable', { param: 'mathComputation', value: 'auto' }) })
  }
  // Optional host capability flag: a host that KNOWS it has no subprocess service can say so, and
  // then "no engine resolvable" is reported as MATH_NO_SUBPROCESS instead of a misleading
  // ENGINE_NOT_FOUND + "install python" guide. Hosts that do not provide the flag keep the
  // resolve-throw => ENGINE_NOT_FOUND / spawn-null => MATH_NO_SUBPROCESS mapping.
  if (typeof H.hasSubprocess === 'function' && H.hasSubprocess() === false) {
    const out = fail('MATH_NO_SUBPROCESS', null, '宿主不提供 subprocess 服务，无法执行计算', { next: next('note', { reason: 'no-subprocess' }) })
    out.op = isObj(rawArgs) ? (rawArgs.op || null) : null
    return out
  }
  const v = validateMathArgs(rawArgs, params)
  if (!v.ok) {
    const out = fail(v.code, null, v.reason)
    if (v.next) out.next = v.next
    out.op = isObj(rawArgs) ? (rawArgs.op || null) : null
    return out
  }
  const args = v.args
  if (args.op === 'probe') { const out = await opProbe(H, args, params); out.op = 'probe'; return out }
  if (args.op === 'run') { const out = await opRun(H, args, params); if (out && out.op === null) out.op = 'run'; return out }
  if (args.op === 'receipt') { const out = await opReceipt(H, args); out.op = 'receipt'; return out }
  const out = await opInstall(H, args, params)
  if (out && out.op === null) out.op = 'install'
  return out
}

export function registerMathComputation(host) {
  const H = adaptHost(host)
  H.__mathHost = true
  const handler = async function (args) {
    try {
      return await dispatch(H, args)
    } catch (e) {
      return fail('MATH_INVALID_ARGUMENT', null, 'math_computation 内部错误：' + String((e && e.message) || e))
    }
  }
  H.register(MATH_TOOL_NAME, MATH_TOOL_DESCRIPTION, MATH_TOOL_SCHEMA, handler)
  const probe = async function (opts) {
    const h = await probeMathEngines(H, opts)
    return h
  }
  return { toolName: MATH_TOOL_NAME, description: MATH_TOOL_DESCRIPTION, parameters: MATH_TOOL_SCHEMA, handler: handler, probe: probe, host: H }
}

export function mathAvailabilityLine(probe, lang, mathMode) {
  const mode = mathMode || MATH_PARAM_DEFAULTS.mathMode
  const list = (probe && probe.engines ? probe.engines : []).map((e) => e.name + ' ' + (e.version || '?')).join('、')
  if (lang === 'en') {
    const head = '- math_computation: available ' + (list || '(none)') + '. Probe first, then run'
      + ' (the tool path leaves a re-runnable receipt - cite it). If a package is missing, say so and offer a fallback or an install plan;'
      + ' installing requires a plan plus confirmation.'
    const shell = mode === 'typed+shell' ? '\n' + MATH_SHELL_RULE_LINE_EN : ''
    return head + shell + '\n' + MATH_RULE_LINES_EN.join('\n')
  }
  const head = '- math_computation：本机可用 ' + (list || '（无）') + '。需要数值/符号/统计计算时先 probe 再 run'
    + '（工具路径会留下可复核回执，结论请引用回执路径）；缺包时如实说明并给替代方案或安装计划（不要假装），安装需先出计划并征得确认。'
  const shell = mode === 'typed+shell' ? '\n' + MATH_SHELL_RULE_LINE : ''
  return head + shell + '\n' + MATH_RULE_LINES.join('\n')
}
