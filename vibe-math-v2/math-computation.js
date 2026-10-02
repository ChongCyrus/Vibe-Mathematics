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

// Sweep ruling: the cli policy is declared ONCE, in the descriptor (math-engines.js `cli.policy`).
// These two readers are the only place the rule is applied, so descriptor and behaviour cannot drift.
const CLI_POLICY = (MATH_ENGINES.cli && MATH_ENGINES.cli.policy) || {}

// Item-2 ruling: a commercial template's "VERIFY" provenance must REACH the user, and it is declared
// ONCE (descriptor `verify` + `verifyReason`). Assemble the fields ONLY when a reason exists, so an
// engine that declares nothing prints no empty slot.
function verifyFields(engine) {
  const d = MATH_ENGINES[engine] || {}
  if (!d.verify) return {}
  const out = { verify: true }
  if (typeof d.verifyReason === 'string' && d.verifyReason) out.verifyReason = d.verifyReason
  return out
}

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

// Archive retention (P2a item 5): a documented CAP that only ever WARNS - the tool never deletes.
// Per-run: the attempt number that may be created for one archive id (attempt 1 lives in
// Computation/<id>/, later attempts in Computation/<id>/attempts/<n>/). Per-project: only checked
// when the host exposes the optional listDir(); absent that, the per-run cap still applies.
export const MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN = 20
export const MATH_ARCHIVE_MAX_RUNS = 200
export const MATH_ARCHIVE_WARNING = 'ARCHIVE_RETENTION_EXCEEDED'
export const MATH_SCRIPT_CHANGED_WARNING = 'SCRIPT_CHANGED_SINCE_LAST_RECEIPT'
export const MATH_SCRIPT_CHANGED_DURING_RUN_WARNING = 'SCRIPT_CHANGED_DURING_RUN'

export const MATH_SHELL_FALLBACK_MARK = '未经工具归档'
export const MATH_SHELL_FALLBACK_MARK_EN = 'not tool-archived'
export const MATH_BAD_ARGV_HINT = 'mathEngineOverride'

// ── prompt text (verbatim source: _oneoff/mc-P1-ready/prompts.md) ───────────────────────────────
export const MATH_TOOL_DESCRIPTION = '数学计算：先用 op:\'probe\' 预检本机可用引擎与许可，再用 op:\'run\' 计算（mode=code|file|expr；'
  + 'P1 引擎=python|r|octave|julia + matlab|maple|wolfram（仅探测/许可，永不安装）+ cli（默认开启：用你指定的命令执行，'
  + '仍受本工具的超时/输出上限/cwd 约束并留回执；它与宿主 shell 的区别就是有回执与上限——要用宿主 shell 兜底由 mathMode 控制，'
  + '且结论必须标注未经工具归档））。每次执行都会归档成可复核回执（Computation/<id>/），回执里含 scriptPath/scriptHash 与**实际 argv**；'
  + '脚本原件就在那个归档目录里，你可以用普通文件工具打开/编辑它，编辑后用 mode:\'file\' 重跑会得到一份**新回执**——'
  + '**不得**拿旧回执当作修改后代码的证据。缺引擎/缺包只报告并给"用户自装指引"或"代理代装计划"（先计划、再确认）；'
  + '商业引擎只给厂商指引；引擎选项报错时会回显 argv 并提示用 mathEngineOverride。'
  + '替代方案若改变精确性或结论强度（精确解→数值近似、闭式解→采样/求积、改精度/容差/假设、换算法类）**必须在结论里声明**，不得读起来像得到了原本的结果。'
  + '计算结果是经验证据，不是证明。'

export const MATH_PERSONA_TOOL_LINE = '- math_computation {op: probe|run|receipt|install, engine, mode: code|file|expr, …} — '
  + '先 probe 预检引擎/包/许可，再调引擎计算并把脚本与输出归档成可复核回执；缺引擎/缺包只报告与给安装指引/计划；shell 兜底不算归档。'

// P2a: the archive -> edit -> re-run workflow. Injected into every preset's rule block (and appended
// to both persona blocks) so an agent cannot miss that (a) the script is archived, (b) it may edit
// it, and (c) re-running is what produces evidence for the edited code.
export const MATH_ARCHIVE_WORKFLOW_LINE = '- 归档→编辑→重跑：mode:\'code\' 的脚本原件在回执的 scriptPath（Computation/<id>/script.<ext>，**相对项目根**）；'
  + '**成员的文件工具是按会话 cwd 解析的**，所以读它要用**绝对路径** `receipt.scriptAbs`，或把 `receipt.cwd` 与 `receipt.scriptPath` 拼起来（回执两个字段都有）。'
  + '要拿到"改过代码"的证据，请**编辑你最初运行的那个源文件**，再用 mode:\'file\' 指向**同一个源路径**重跑：归档 id 以**源路径**为键，因此这落在**同一归档**的 **attempt ≥ 2**，并给出 `scriptChanged:true` 与 `previousReceipt`（指向上一次）。'
  + '**指向归档副本本身**（`receipt.scriptAbs` 那个路径）按设计是**另一份新归档**：新 id、attempt 1、没有 `previousReceipt`、`scriptChanged:false`；旧 attempt 绝不会被覆盖，但它**不是**"同一归档的新 attempt"——工具会用 `fileIsArchivedScript` 与 `ARCHIVED_SCRIPT_RERUN` 警告明确说明。'
  + '**旧回执对修改后的代码无效**——报告里必须引用与当前代码哈希一致的那份回执；工具会在 scriptChanged / scriptChangedDuringRun 为 true 时显式告警。'

export const MATH_ARCHIVE_WORKFLOW_LINE_EN = '- Archive -> edit -> re-run: for mode:\'code\' the script original is at the receipt\'s scriptPath (Computation/<id>/script.<ext>, **relative to the project root**); member file tools resolve paths against the SESSION CWD, so READ it via the ABSOLUTE `receipt.scriptAbs`, or join `receipt.cwd` with `receipt.scriptPath` (both are in the receipt). To produce evidence for EDITED code, edit the SOURCE FILE you originally ran and re-run mode:\'file\' pointing at THAT SAME PATH: the archive id is keyed by the SOURCE PATH, so this lands on the SAME archive as attempt >= 2, with `scriptChanged:true` and `previousReceipt` pointing at the previous attempt. Pointing mode:\'file\' at the ARCHIVED COPY itself (the `receipt.scriptAbs` path) is a DIFFERENT archive BY DESIGN - a new id, attempt 1, no `previousReceipt`, `scriptChanged:false`: the earlier attempt is never overwritten, but it is NOT "a new attempt of the same archive", and the tool says so via `fileIsArchivedScript` and the `ARCHIVED_SCRIPT_RERUN` warning. **An old receipt is NOT evidence for edited code** - cite the receipt whose scriptHash matches the current code; the tool warns explicitly via scriptChanged / scriptChangedDuringRun.'

// Round-6 (A): honesty about SUBSTITUTIONS. An alternative that weakens exactness or conclusion
// strength must be declared, and the conclusion must never read as if the requested (exact) result
// had been obtained. Injected through mathAvailabilityLine (rule block) AND appended to both persona
// blocks by the presets - same mechanism as the archive-workflow line.
export const MATH_SUBSTITUTION_RULE_LINE = '- 替代必须声明（诚实性）：当替代方案改变了**精确性或结论强度**时（精确符号解 → 数值近似、闭式解 → 采样/求积、改了精度/容差/假设、换了算法类），结论里**必须写明**，不得读起来像得到了原本（精确/所要求的）结果；拿不到精确结果就直说。'

export const MATH_SUBSTITUTION_RULE_LINE_EN = '- Declare substitutions (honesty): when an alternative changes EXACTNESS or conclusion strength (exact symbolic solution -> numerical approximation, closed form -> sampling/quadrature, changed precision/tolerances/assumptions, a different algorithm class), the conclusion MUST say so explicitly and must not read as if the original (exact/requested) result had been obtained; if the exact result is unavailable, say so plainly.'

export const MATH_RULE_LINES = Object.freeze([
  '- 需要精确数值、符号化简、反例搜索、统计或线性代数时调用 math_computation：先 probe，再 run。',
  '- 复核他人的数值结论时用 op:\'receipt\'（或 op:\'run\', mode:\'file\' 指向同一脚本）重跑，并把回执路径写进报告。',
  '- 归档即引用：报告里带 Computation/<id>/receipt.json；这是"支撑材料"的用法。',
  '- 判断标准：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）——没把握的先别入库。',
  '- 不得把计算结果当成"已证明"：对象是否已验证仍只由本预设既有的验证/共识路径给出。',
  MATH_SUBSTITUTION_RULE_LINE,
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
  MATH_SUBSTITUTION_RULE_LINE_EN,
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
    // AUDIT-B FIX (HIGH): the escape hatch the BAD_ARGV message advertises must be a real, accepted
    // argument. Shape: { <engine>: { versionArgv?, scriptArgv?, evalArgv?, packageProbe? } }.
    mathEngineOverride: { type: 'object' },
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
const ALLOWED_ARGS = ['op', 'engine', 'mode', 'code', 'file', 'expr', 'packages', 'timeoutMs', 'captureFiles', 'record', 'cli', 'scope', 'dryRun', 'confirm', 'mathEngineOverride']
// AUDIT-B FIX (HIGH): validate the override shape in the same closed-argument spirit as everything
// else, so the escape hatch is usable but cannot smuggle arbitrary junk into argv assembly.
const OVERRIDE_ARGV_KEYS = ['versionArgv', 'scriptArgv', 'evalArgv']
function validateEngineOverride(ov) {
  if (!isObj(ov)) return bad('mathEngineOverride must be an object keyed by engine name')
  for (const name of Object.keys(ov)) {
    if (!MATH_ENGINES[name]) return bad('mathEngineOverride: unknown engine ' + name + '（可用：' + MATH_ENGINE_ORDER.join(', ') + '）')
    const o = ov[name]
    if (!isObj(o)) return bad('mathEngineOverride.' + name + ' must be an object')
    for (const k of Object.keys(o)) {
      if (OVERRIDE_ARGV_KEYS.indexOf(k) === -1 && k !== 'packageProbe') return bad('mathEngineOverride.' + name + ': unknown key ' + k)
      if (OVERRIDE_ARGV_KEYS.indexOf(k) !== -1 && (!Array.isArray(o[k]) || o[k].some((a) => typeof a !== 'string'))) return bad('mathEngineOverride.' + name + '.' + k + ' must be a string[]')
    }
  }
  return null
}
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
  if (args.packages !== undefined) {
    if (!Array.isArray(args.packages) || args.packages.some((x) => typeof x !== 'string')) return bad('packages must be a string[]')
    // round-6 (D): accept the manager-understood pass-through forms; refuse anything else explicitly.
    for (const spec of args.packages) {
      const parsed = parsePackageSpec(spec)
      if (!parsed.ok) return bad(parsed.problem, 'MATH_INVALID_ARGUMENT', next('reason', { reason: 'unsupported-version-syntax' }))
    }
  }
  if (args.captureFiles !== undefined && (!Array.isArray(args.captureFiles) || args.captureFiles.some((x) => typeof x !== 'string'))) return bad('captureFiles must be a string[]')
  if (args.timeoutMs !== undefined) {
    const n = Number(args.timeoutMs)
    if (!Number.isFinite(n) || n < 1000) return bad('timeoutMs must be an integer >= 1000')
  }
  if (args.record !== undefined && typeof args.record !== 'boolean') return bad('record must be a boolean')
  if (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') return bad('dryRun must be a boolean')
  if (args.confirm !== undefined && typeof args.confirm !== 'string') return bad('confirm must be a string')
  if (args.mathEngineOverride !== undefined) {
    const badOv = validateEngineOverride(args.mathEngineOverride)
    if (badOv) return badOv
  }
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
      // Sweep ruling (single source): the cli policy lives in the DESCRIPTOR; the code reads it here
      // rather than hard-coding 'typed+shell', so the two can no longer drift apart.
      if (CLI_POLICY.requiresMathMode && p.mathMode !== CLI_POLICY.requiresMathMode) return bad('engine=cli is disabled while mathMode=' + p.mathMode + ' (requires ' + CLI_POLICY.requiresMathMode + ')', 'MATH_REFUSED', next('reason', { reason: 'policy', requiresMathMode: CLI_POLICY.requiresMathMode }))
      if (CLI_POLICY.requiresEngineInList && p.mathEngines.indexOf('cli') === -1) return bad('engine=cli is not in mathEngines', 'MATH_REFUSED', next('reason', { reason: 'engine-not-allowed', requiresEngineInList: true }))
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
  if (extra && extra.configured) out.configured = extra.configured
  if (extra && Array.isArray(extra.absent)) out.absent = extra.absent
  if (extra && extra.packages) out.packages = extra.packages
  // round-7 (live-session fix): the probe diagnostic must survive into the response, otherwise
  // "存在但不可用" is opaque (a real session showed exactly that).
  if (extra && extra.probe) out.probe = jsonSafeDiag(extra.probe)
  // round-9 (F7): the version-constraint policy travels with failures too (no silent drop).
  if (extra && extra.versionPolicy) out.versionPolicy = extra.versionPolicy
  if (extra && extra.constraintsNotEnforced) out.constraintsNotEnforced = extra.constraintsNotEnforced
  return out
}

// round-9 (real-engine finding): the suggested install command may not be runnable on this machine
// (e.g. `winget` is absent), and handing a user a command that cannot run is misleading. So the
// command is emitted ONLY when its package manager is actually resolvable; otherwise we return the
// official vendor/download pointer plus an explicit note. Async because resolution goes through the host.
async function userInstallNext(H, engine) {
  const d = MATH_ENGINES[engine] || {}
  const per = d.userInstall || {}
  const platform = process && process.platform === 'win32' ? 'windows' : (process && process.platform === 'darwin' ? 'macos' : 'linux')
  const raw = per[platform] || ''
  const mgr = (function () { const m = /^\s*(winget|brew|apt-get|apt|choco|scoop|dnf|pacman|zypper)\b/.exec(String(raw)); return m ? m[1] : null })()
  let available = true
  if (mgr) {
    try { available = !!(await H.resolveExecutable(mgr)) } catch (e) { available = false }
  }
  return next('user-install', {
    engine: engine,
    perOs: per,
    command: (mgr && !available) ? '' : raw,
    suggestedCommand: raw,
    platform: platform,
    packageManager: mgr,
    packageManagerAvailable: mgr ? available : null,
    vendorUrl: d.vendor || null,
    // Item-2: the not-found guidance carries the same provenance when the descriptor declares it.
    ...verifyFields(engine),
    note: (mgr && !available)
      ? ('本机没有检测到包管理器 ' + mgr + '：建议命令无法运行，请按上面的官方地址手动安装（或先自行安装一个包管理器）。')
      : null,
  })
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
    listDir: typeof h.listDir === 'function' ? h.listDir : null,
    // round-7 (fix 2): optional bundled-runtime discovery (absolute roots + absolute listing).
    runtimeRoots: typeof h.runtimeRoots === 'function' ? h.runtimeRoots : null,
    listDirAbs: typeof h.listDirAbs === 'function' ? h.listDirAbs : null,
    // round-B (F4): an OPTIONAL host field - a host (or a test) that knows its own install layout can
    // supply the per-engine candidate roots, so discovery never has to trust this process's environment.
    installRoots: typeof h.installRoots === 'function' ? h.installRoots : null,
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
    engines.push(Object.assign({ name: name, version: v.version, path: hit, license: d.license }, verifyFields(name)))
  }
  const result = { ok: true, engines: engines, available: engines.length > 0 }
  PROBE_CACHE.set(H, result)
  return result
}

// round-9 (real-engine finding): an engine can be INSTALLED yet invisible, because discovery only
// looked at the server process's PATH (R 4.6.1 landed in C:\Program Files\R\R-4.6.1\bin and was NOT
// added to PATH). Add the known per-OS INSTALL locations, globbed by version, still AFTER PATH and
// after the bundled runtime; existence is always proven by LISTING, never assumed.
// round-B (F4/F3): the candidate roots come from the HOST when it can supply them (`H.installRoots`),
// and only otherwise from this process's environment - so a test (or a host with its own layout) never
// depends on the ambient machine. ONE generic walker serves every engine: adding an engine is a table
// entry (roots + descriptor candidates), never a new code path. Existence is always proven by LISTING.
export function mathInstallRoots(engineName, env, win) {
  const pf = String(env.ProgramFiles || 'C:/Program Files')
  const pf86 = String(env['ProgramFiles(x86)'] || 'C:/Program Files (x86)')
  const local = env.LOCALAPPDATA ? String(env.LOCALAPPDATA) : null
  const home = env.USERPROFILE || env.HOME || null
  const table = {
    r: win
      ? [pf + '/R', pf86 + '/R', local ? local + '/Programs/R' : null]
      : ['/usr/lib/R', '/usr/lib64/R', '/Library/Frameworks/R.framework/Resources', '/usr/local/lib/R', '/opt/R'],
    python: win
      ? [local ? local + '/Programs/Python' : null, pf]
      : ['/usr/local', '/usr', '/opt/python', '/opt/homebrew'],
    octave: win
      ? [pf + '/GNU Octave', local ? local + '/Programs/GNU Octave' : null]
      : ['/usr/lib/octave', '/usr/local/octave', '/opt/octave', '/usr/share/octave'],
    julia: win
      ? [local ? local + '/Programs' : null, pf, home ? home + '/.juliaup/bin' : null]
      : ['/opt', '/usr/local', home ? home + '/.juliaup/bin' : null],
    matlab: win ? [pf + '/MATLAB'] : ['/usr/local/MATLAB', '/Applications'],
  }
  return (table[engineName] || []).filter((x) => typeof x === 'string' && x)
}

async function knownInstallCandidates(H, engineName) {
  if (typeof H.listDirAbs !== 'function') return []
  const cands = mathEngineCandidates(engineName)
  if (!cands) return []
  const env = (typeof process !== 'undefined' && process.env) || {}
  const win = !!(typeof process !== 'undefined' && process.platform === 'win32')
  let injected = null
  if (typeof H.installRoots === 'function') {
    try {
      const r = await H.installRoots(engineName)
      if (Array.isArray(r)) injected = r.filter((x) => typeof x === 'string' && x)
    } catch (e) { injected = null }
  }
  const roots = injected || mathInstallRoots(engineName, env, win)
  const exts = win ? ['', '.exe', '.cmd'] : ['']
  const out = []
  const listNames = async (dir, kind) => {
    try { return ((await H.listDirAbs(dir)) || []).filter((e) => e && e.type === kind).map((e) => e.name) } catch (e) { return [] }
  }
  const match = async (dir) => {
    const files = await listNames(dir, 'file')
    for (const c of cands) for (const x of exts) if (files.indexOf(c + x) !== -1) out.push(dir + '/' + c + x)
  }
  for (const root of roots) {
    await match(root)                                                      // flat layout (juliaup, /usr/local)
    await match(root + '/bin')                                             // unix / framework layout
    for (const d of await listNames(root, 'directory')) {
      await match(root + '/' + d)                                          // versioned flat (Python312, Julia-1.10)
      await match(root + '/' + d + '/bin')                                 // versioned install (R-4.6.1/bin)
      for (const s of await listNames(root + '/' + d, 'directory')) {
        await match(root + '/' + d + '/' + s + '/bin')                     // nested layout (Octave-9.2.0/mingw64/bin)
      }
    }
  }
  return Array.from(new Set(out))
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
  // round-7 (fix 2): DSH ships its own runtimes; PATH always wins, so this is a LAST resort. The
  // tree name is globbed (never hard-coded) and executable names come from the descriptor candidates.
  for (const p of await dshRuntimeCandidates(H, d.name)) {
    if (typeof p === 'string' && p) return p
  }
  // round-9: then the known per-OS install locations (an engine installed without touching PATH).
  for (const p of await knownInstallCandidates(H, d.name)) {
    if (typeof p === 'string' && p) return p
  }
  return null
}

// Generic discovery of a DSH-bundled runtime for one engine:
//   <root>/dsh-runtimes/<tree>/dependencies/<engine>/<candidate><ext>
// `runtimeRoots` and `listDirAbs` are OPTIONAL host fields (each preset knows its own home and fs);
// when the host does not provide them this returns [] and behaviour is exactly as before.
async function dshRuntimeCandidates(H, engineName) {
  if (typeof H.listDirAbs !== 'function' || typeof H.runtimeRoots !== 'function') return []
  const cands = mathEngineCandidates(engineName)
  if (!cands) return []
  let roots = []
  try { roots = (await H.runtimeRoots()) || [] } catch (e) { return [] }
  if (!Array.isArray(roots) || !roots.length) return []
  const win = !!(typeof process !== 'undefined' && process.platform === 'win32')
  const exts = win ? ['.exe', '.cmd', ''] : ['']
  const dirAliases = engineName === 'r' ? ['r', 'R'] : [engineName]
  const out = []
  for (const root of roots) {
    if (!root) continue
    const base = String(root).replace(/[\\/]+$/, '') + '/dsh-runtimes'
    let trees = []
    try { trees = (await H.listDirAbs(base)) || [] } catch (e) { continue }
    for (const tree of trees) {
      if (!tree || tree.type !== 'directory' || !tree.name) continue
      for (const dirName of dirAliases) {
        const depDir = base + '/' + tree.name + '/dependencies/' + dirName
        let entries = []
        try { entries = (await H.listDirAbs(depDir)) || [] } catch (e) { continue }
        // Only names the descriptor itself would look for (python3/python/py, …), so a bundled
        // runtime cannot smuggle in an unrelated binary.
        for (const c of cands) {
          for (const ext of exts) {
            const hit = entries.find((e) => e && e.type === 'file' && String(e.name) === c + ext)
            if (hit) out.push(depDir + '/' + hit.name)
          }
        }
      }
    }
  }
  return Array.from(new Set(out))
}

// round-7 (live root cause): probe-ish spawns used `projectRoot()` as cwd, but on a BRAND-NEW session
// that directory does not exist yet, and the host answers such a spawn with `spawned:true, exit:null`
// (retries cannot help - same cwd, same result). Runs are unaffected because they write the receipt
// (creating the tree) before spawning. So probes use a cwd that is guaranteed to exist: an explicit
// host `probeCwd`, else the OS temp dir, else the project root.
async function probeCwd(H) {
  if (typeof H.probeCwd === 'function') {
    try { const p = await H.probeCwd(); if (typeof p === 'string' && p) return p } catch (e) { /* fall through */ }
  }
  const env = (typeof process !== 'undefined' && process.env) || {}
  const tmp = env.TEMP || env.TMPDIR || env.TMP
  if (typeof tmp === 'string' && tmp) return tmp
  return await H.projectRoot()
}

async function probeVersion(H, d, exe, opts) {
  const o = opts || {}
  const argv = [exe].concat(d.versionArgv || [])
  const timeoutMs = Number(o.timeoutMs) || 20000 // a COLD host runner can take seconds; 5s was too tight
  const r = await H.spawn({ argv: argv, cwd: await probeCwd(H), timeoutMs: timeoutMs, stdoutCap: 8192, stderrCap: 8192 })
  const diag = {
    argv: argv.slice(0, 3),
    exit: r ? (r.exit === undefined ? null : r.exit) : null,
    timedOut: !!(r && r.timedOut),
    ms: r ? r.ms : null,
    spawned: !!r,
    stderrTail: String((r && r.stderr) || '').slice(-300),
  }
  if (!r) return { ok: false, version: 'unknown', diag: diag }
  if (r.timedOut) return { ok: false, version: 'unknown', diag: diag }
  const m = new RegExp(d.versionRe).exec(String(r.stdout || '') + '\n' + String(r.stderr || ''))
  return { ok: r.exit === 0 && !!m, version: m ? m[1] : 'unknown', diag: diag }
}

// round-7 (live-session fix): an engine that RESOLVED but whose version probe failed is retried once
// with a longer budget WHEN the failure looks like a cold-start/timeout (timedOut, or a spawn that
// produced no exit code). A deterministic failure (non-zero exit, unparsable output) is NOT retried -
// retrying every failure would double every probe spawn. The diagnostic travels with the result
// either way, so "存在但不可用" is never opaque.
// round-7 (live regression): diagnostics must be JSON-SAFE. An earlier version stored a retry diag
// that was the SAME object as its parent, so `JSON.stringify(response)` threw ("circular structure")
// and the caller saw no probe result at all. Project plain fields only, never keep back-references.
function jsonSafeDiag(d) {
  if (!d || typeof d !== 'object') return null
  const out = { argv: Array.isArray(d.argv) ? d.argv.map(String).slice(0, 4) : [] }
  for (const k of ['exit', 'timedOut', 'ms', 'spawned', 'stderrTail', 'attempts', 'retried']) {
    const v = d[k]
    if (v === undefined) continue
    out[k] = (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') ? v : (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object') ? jsonSafeDiag(x) : x) : null)
  }
  if (d.retryDiag) out.retryDiag = jsonSafeDiag(d.retryDiag)
  return out
}

async function probeVersionWithRetry(H, d, exe) {
  const attempts = []
  let last = null
  for (let i = 0; i < 3; i++) {
    last = await probeVersion(H, d, exe, { timeoutMs: i === 0 ? 20000 : 45000 })
    attempts.push(jsonSafeDiag(last.diag))
    if (last.ok) break
    // A NULL spawn (host returned nothing usable) and a timeout both look like the session-early
    // flakiness the live test hit; a deterministic failure (non-zero exit, unparsable output) is not
    // retried, so a genuinely broken engine is reported immediately instead of three times slower.
    const looksCold = !!(last.diag && (last.diag.timedOut || last.diag.exit === null || !last.diag.spawned))
    if (!looksCold) break
    await new Promise((resolve) => setTimeout(resolve, 250 + i * 400))
  }
  if (last && last.diag) {
    last.diag = jsonSafeDiag(last.diag)
    last.diag.attempts = attempts.length
    if (attempts.length > 1) {
      last.diag.retried = true
      // COPIES, never a reference to this same object (that produced the circular payload).
      last.diag.retryDiag = attempts[attempts.length - 1]
    }
  }
  return last
}

async function checkLicence(H, d, exe) {
  if (d.license !== 'commercial') return { ok: true }
  if (!d.licenseProbe) return { ok: false }
  const r = await H.spawn({ argv: [exe].concat(d.licenseProbe.argv), cwd: await probeCwd(H), timeoutMs: 10000, stdoutCap: 8192, stderrCap: 8192 })
  if (!r || r.timedOut || r.exit !== 0) return { ok: false }
  if (d.licenseProbe.okWhen === 'trim-1') return { ok: String(r.stdout || '').trim() === '1' }
  if (d.licenseProbe.okWhen === 'not-unlicensed') return { ok: !/Unlicensed/i.test(String(r.stdout || '')) }
  return { ok: true }
}

async function resolveEngine(H, requested, params, args) {
  const names = requested === 'auto' ? params.mathEngines.slice() : [requested]
  for (const name of names) {
    const d0 = MATH_ENGINES[name]
    if (!d0) continue
    // AUDIT-B FIX (HIGH): the override must also reach the VERSION probe and the licence probe, not
    // just the script/eval argv - the BAD_ARGV hint advertises versionArgv explicitly.
    const d = applyOverride({ name: name, desc: d0 }, params, args)
    if (params.mathEngines.indexOf(name) === -1) return fail('MATH_REFUSED', name, '引擎 ' + name + ' 不在 mathEngines 允许列表内', { next: next('reason', { reason: 'engine-not-allowed' }) })
    if (name === 'cli') {
      if (CLI_POLICY.requiresMathMode && params.mathMode !== CLI_POLICY.requiresMathMode) return fail('MATH_REFUSED', name, 'cli 被策略禁用（需要 mathMode=' + CLI_POLICY.requiresMathMode + '，当前 ' + params.mathMode + '）', { next: next('reason', { reason: 'policy', requiresMathMode: CLI_POLICY.requiresMathMode }) })
      let exe = null
      try { exe = await H.resolveExecutable(args.cli.command) } catch (e) { exe = null }
      if (!exe) return fail('MATH_ENGINE_NOT_FOUND', name, 'cli 命令无法解析：' + args.cli.command, { next: await userInstallNext(H, 'cli') })
      // round-7 (finding 5): report the REAL version when the command's family is recognisable (the
      // descriptor for that family carries the version probe); unknown commands stay 'unknown'.
      let cliVersion = 'unknown'
      let cliProbe = null
      const fam = engineFamilyForExe(exe)
      if (fam && MATH_ENGINES[fam]) {
        const fv = await probeVersionWithRetry(H, MATH_ENGINES[fam], exe)
        cliProbe = fv.diag || null
        if (fv.ok) cliVersion = fv.version
      }
      return { ok: true, name: name, desc: d, exe: exe, version: cliVersion, family: fam || null, probe: cliProbe }
    }
    const hit = await resolveCandidate(H, d)
    if (!hit) continue
    const v = await probeVersionWithRetry(H, d, hit)
    if (!v.ok) {
      if (d.license === 'commercial' || d.versionOptional) {
        const lic = await checkLicence(H, d, hit)
        if (!lic.ok) return fail('MATH_ENGINE_LICENSE_REQUIRED', name, name + ' 已安装但许可不可用（仅厂商可激活）', { next: next('vendor', Object.assign({ engine: name, url: d.vendor || '' }, verifyFields(name))) })
        return { ok: true, name: name, desc: d, exe: hit, version: 'unknown' }
      }
      // round-7 (live-session fix): the engine WAS found - so an install guide would be misleading
      // (the user does not need to install anything; the host path is what failed). Report the probe
      // diagnostic instead and keep the escape hatch advisory.
      return fail('MATH_ENGINE_UNUSABLE', name, name + ' 存在但不可用（版本探针失败：exit=' + String(v.diag.exit) + (v.diag.timedOut ? '，超时' : '') + '，argv=' + JSON.stringify(v.diag.argv) + '）', {
        probe: v.diag,
        next: next('note', { guidance: '引擎已找到但探测失败：请检查宿主 subprocess 通路（冷启动/超时/权限），或用 mathEngineOverride 调整 versionArgv 模板；已装的引擎不需要重装。' }),
      })
    }
    const lic = await checkLicence(H, d, hit)
    if (!lic.ok) return fail('MATH_ENGINE_LICENSE_REQUIRED', name, name + ' 已安装但许可不可用（仅厂商可激活）', { next: next('vendor', Object.assign({ engine: name, url: d.vendor || '' }, verifyFields(name))) })
    return { ok: true, name: name, desc: d, exe: hit, version: v.version }
  }
  const first = requested === 'auto' ? (params.mathEngines[0] || 'python') : requested
  return fail('MATH_ENGINE_NOT_FOUND', first, '本机没有可用的计算引擎（试过：' + names.join(', ') + '）', { next: await userInstallNext(H, first) })
}

// ── package probe ───────────────────────────────────────────────────────────────────────────────
function buildProbeArgv(d, pkgs) {
  const quoted = pkgs.map((p) => '"' + String(p).replace(/"/g, '') + '"').join(',')
  const plain = pkgs.join(',')
  const code = String(d.probeCode || '').replace(/__QPKGS__/g, quoted).replace(/__PKGS__/g, plain)
  const out = []
  for (const a of (d.packageProbe.argv || [])) {
    // `<pkgs...>` expands to ONE argv item per package (probes that read `sys.argv`); `<pkgs>` stays
    // the comma-joined string for templates that interpolate it into code (R/Julia/Octave).
    if (a === '<probeCode>') out.push(code)
    else if (a === '<pkgs>') out.push(plain)
    else if (a === '<pkgs...>') for (const p of pkgs) out.push(String(p))
    else out.push(a)
  }
  return out
}

async function probePackages(H, det, pkgs) {
  // round-6 (D): presence is probed by BASE NAME (a version constraint is the manager's business);
  // the full spec is what the install plan passes through.
  const names = []
  for (const s of pkgs) { const n = parsePackageSpec(s).name || String(s); if (names.indexOf(n) === -1) names.push(n) }
  const found = {}
  for (const p of names) found[p] = null
  if (!names.length || !det.desc.packageProbe) return { requested: names, found: found }
  const argv = [det.exe].concat(buildProbeArgv(det.desc, names))
  // round-7 (live-session fix): a NULL spawn (the host's subprocess seam returned nothing - seen in
  // real sessions right after session start) or a timeout must NOT be reported as "package missing".
  // Retry a couple of times, and if the precheck still cannot run, say so explicitly (fail-open).
  let r = null
  const attempts = []
  for (let i = 0; i < 3; i++) {
    r = await H.spawn({ argv: argv, cwd: await probeCwd(H), timeoutMs: 15000 + i * 15000, stdoutCap: 16384, stderrCap: 16384 })
    attempts.push(r ? { exit: r.exit === undefined ? null : r.exit, timedOut: !!r.timedOut } : null)
    const usable = !!(r && !r.timedOut && r.exit !== null && r.exit !== undefined)
    if (usable) break
    await new Promise((resolve) => setTimeout(resolve, 250 + i * 400))
  }
  const ran = !!(r && !r.timedOut && r.exit !== null && r.exit !== undefined)
  if (!ran) return { requested: names, found: found, probeFailed: true, attempts: attempts, argv: argv.slice(0, 3) }
  if (det.desc.packageProbe.parse === 'lines') {
    const text = String(r.stdout || '')
    for (const p of pkgs) if (new RegExp('(^|\\s)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm').test(text)) found[p] = 'present'
  } else {
    // Accept BOTH shapes: `name:ok|name:missing` (historical) and one-per-line `name ok` (round-7:
    // the probe codes avoid shell metacharacters such as `|`, which a real host's spawn rejected).
    for (const rawTok of String(r.stdout || '').split(/[|\n]/)) {
      const tok = rawTok.trim()
      if (!tok) continue
      let name = ''
      let state = ''
      const idx = tok.indexOf(':')
      if (idx > 0) {
        name = tok.slice(0, idx).trim()
        state = tok.slice(idx + 1).trim()
      } else {
        const m = /^(\S+)\s+(\S+)$/.exec(tok)
        if (!m) continue
        name = m[1]
        state = m[2]
      }
      if (Object.prototype.hasOwnProperty.call(found, name)) found[name] = (state === 'ok' || state === '1' || state === 'TRUE' || state === 'True') ? 'present' : null
    }
  }
  return { requested: pkgs.slice(), found: found }
}

// ── argv assembly ───────────────────────────────────────────────────────────────────────────────
function assembleArgv(det, mode, payload) {
  const d = det.desc
  if (det.name === 'cli') {
    const cliArgv = (payload.cli && Array.isArray(payload.cli.argv)) ? payload.cli.argv : []
    const argv = [det.exe].concat(cliArgv)
    // round-7 (finding 4): with mode:'code' the script is archived as `script.txt`, but the caller
    // cannot know the runId in advance - so the archived script path is appended automatically and
    // the documented "run this code" flow actually RUNS it (instead of dropping into a REPL, exit 0,
    // empty stdout).
    // round-7 (live nuance): ONLY when the caller's argv does not already provide a program slot.
    // `python -c 'print(1)'` runs the caller's code, and appending the archived file would silently
    // feed it as `sys.argv[1]` - the caller's argv must win there.
    const runsOwnCode = cliArgv.some((a) => a === '-c' || a === '-m' || a === '-e' || a === '--eval' || a === '--command')
    const appendScript = !!payload.scriptAbs && (mode === 'code' || mode === 'file') && !runsOwnCode
    if (appendScript) argv.push(payload.scriptAbs)
    return {
      argv: argv,
      cli: {
        command: payload.cli.command, argv: cliArgv, scriptAppended: appendScript,
        scriptSkipped: (!!payload.scriptAbs && (mode === 'code' || mode === 'file') && runsOwnCode) ? 'caller argv already provides a program slot (-c/-m/-e/--eval)' : null,
      },
    }
  }
  if (mode === 'code' || mode === 'file') {
    // Sweep finding (HIGH): substitution must be STRING-level, not exact-element equality - matlab's
    // descriptor embeds the placeholder (`run('<script>')`), so an exact match let the literal
    // `run('<script>')` reach the engine and the archived script never ran.
    return { argv: [det.exe].concat((d.scriptArgv || []).map((a) => String(a).split('<script>').join(payload.scriptAbs))) }
  }
  if (mode === 'expr') {
    if (!d.evalArgv) return { refused: 'engine does not support mode=expr' }
    return { argv: [det.exe].concat(d.evalArgv.map((a) => String(a).split('<expr>').join(payload.expr))) }
  }
  return { refused: 'unknown mode' }
}

// round-7 (findings 3/5): for `engine:'cli'` the descriptor is generic, so the FAMILY of the resolved
// command has to be inferred from its basename to (a) run the right package precheck and (b) report a
// real version. Unknown commands are reported as unknown and their package precheck is SKIPPED (a
// false "missing" must never block the escape hatch).
function engineFamilyForExe(exe) {
  const base = String(exe || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|sh)$/, '')
  if (/^python[0-9.]*$/.test(base) || base === 'py') return 'python'
  if (base === 'rscript' || base === 'r') return 'r'
  if (base === 'octave' || base === 'octave-cli') return 'octave'
  if (base === 'julia') return 'julia'
  return null
}

// AUDIT-B FIX (HIGH): `applyOverride` used to read only `params.mathEngineOverride`, which no preset
// can ever set (the six frozen params are copied verbatim by effectiveMathParams), while the tool
// description, MATH_BAD_ARGV_HINT and the BAD_ARGV message all advertised it. The per-call ARGUMENT
// now wins and is the documented route; the param route stays as a fallback for hosts that inject it.
function applyOverride(det, params, args) {
  const d = det.desc
  const fromArgs = args && isObj(args.mathEngineOverride) ? args.mathEngineOverride : null
  const ov = fromArgs || (params && params.mathEngineOverride)
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
function runIdOf(designator, projectSlug, engine, mode, scriptText, packages, fileRel) {
  // P2a: mode:'file' is keyed by the SOURCE PATH, not by its content, so that editing the file and
  // re-running lands in the same archive id - which is what makes the hash reconciliation below
  // meaningful. mode:'code'/'expr' have no path, so their content stays the key.
  const key = (mode === 'file' && fileRel) ? ('file:' + fileRel) : canonical(scriptText)
  const input = sha256([engine, mode, key, packages.slice().sort().join(',')].join('\n'))
  return { runId: designator + '-' + projectSlug + '-' + input.slice(0, 12), input: input }
}

// P2a item 3: append-only archives. Attempt 1 lives in Computation/<id>/ and is never rewritten;
// later runs of the same id go to Computation/<id>/attempts/<n>/ (first free n >= 2).
//
// AUDIT-C FIX (HIGH): `exists`-then-write is a read-modify-write race. Two concurrent runs of the
// SAME archive id both observed "no receipt.json yet", both took attempt 1, and the second silently
// overwrote the first receipt/script - so the append-only guarantee did not hold exactly when two
// members ran the same computation at once. Allocation (and the receipt write that claims the slot)
// now runs under a per-archive-id in-process mutex, so two calls through one plugin instance can
// never share an attempt dir. Cross-process concurrency still needs an exclusive-create primitive
// from the host (documented in docs/math-computation.md §6).
const mathArchiveChains = new Map()
function withArchiveLock(key, fn) {
  const prev = mathArchiveChains.get(key) || Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.then(() => {}, () => {})
  mathArchiveChains.set(key, tail)
  tail.then(() => { if (mathArchiveChains.get(key) === tail) mathArchiveChains.delete(key) })
  return run
}

async function nextAttempt(H, baseDir) {
  const hasFirst = await H.exists(baseDir + '/receipt.json')
  if (!hasFirst) return { attempt: 1, dir: baseDir }
  let n = 2
  while (n < 10000) {
    const d = baseDir + '/attempts/' + n
    if (!(await H.exists(d + '/receipt.json'))) return { attempt: n, dir: d }
    n++
  }
  return { attempt: n, dir: baseDir + '/attempts/' + n }
}

async function previousReceiptOf(H, baseDir, attempt) {
  if (attempt > 2) {
    const prev = await H.readText(baseDir + '/attempts/' + (attempt - 1) + '/receipt.json')
    if (prev !== undefined) { try { return JSON.parse(prev) } catch (e) { /* fall through */ } }
  }
  const first = await H.readText(baseDir + '/receipt.json')
  if (first !== undefined) { try { return JSON.parse(first) } catch (e) { /* ignore */ } }
  return null
}

function warning(code, message) { return { code: code, message: message } }

async function retentionWarnings(H, baseDir, attempt) {
  const out = []
  if (attempt > MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN) {
    out.push(warning(MATH_ARCHIVE_WARNING, 'Computation/ 归档的 attempt 数已超过上限 ' + MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN + '（本次为第 ' + attempt + ' 次）；工具只告警、绝不自动删除，请人工整理旧 attempt。'))
  }
  if (typeof H.listDir === 'function' && H.listDir) {
    try {
      const entries = await H.listDir('Computation')
      const runs = (entries || []).filter((e) => e && e.type === 'directory').length
      if (runs > MATH_ARCHIVE_MAX_RUNS) out.push(warning(MATH_ARCHIVE_WARNING, 'Computation/ 下的 run 目录数（' + runs + '）已超过上限 ' + MATH_ARCHIVE_MAX_RUNS + '；工具只告警、绝不自动删除。'))
    } catch (e) { /* best effort */ }
  }
  return out
}

function renderReceiptMd(r, fullOut, fullErr) {
  const lines = []
  lines.push('# 计算回执｜' + r.preset + ' · ' + r.project + '｜' + r.runId + (r.attempt && r.attempt > 1 ? '（attempt ' + r.attempt + '）' : ''))
  lines.push('')
  lines.push('- 引擎：' + r.engine.name + ' ' + r.engine.version + '（source=' + r.engine.source + '，path=' + r.engine.path + '）')
  lines.push('- 模式：' + r.mode + '｜cwd：' + r.cwd + '｜attempt：' + (r.attempt || 1) + '（归档目录 ' + (r.attemptDir || '') + '，同 id 的首次归档 ' + (r.baseRunDir || '') + '）')
  lines.push('- 命令（照抄可复跑）：' + r.argv.join(' '))
  lines.push('- 结果：exit=' + r.exit + '｜耗时 ' + r.ms + 'ms｜超时=' + r.timedOut + '｜输出截断 ' + r.truncated.stdout + '/' + r.truncated.stderr)
  lines.push('- 脚本：' + (r.scriptPath || r.script.path) + '｜scriptHash=sha256:' + String(r.scriptHash || r.script.sha256) + '（' + r.script.bytes + ' bytes）')
  if (r.sourceFile) {
    lines.push('- 源文件：' + r.sourceFile + '（运行前 sha256:' + String(r.sourceHashBefore || '').slice(0, 16) + '…，运行后 sha256:' + String(r.sourceHashAfter || '').slice(0, 16) + '…）')
    lines.push('- 哈希核对：scriptChanged=' + !!r.scriptChanged + '｜scriptChangedDuringRun=' + !!r.scriptChangedDuringRun
      + (r.previousReceipt ? '（上一份回执 attempt ' + (r.previousReceipt.attempt || 1) + ' 记的 scriptHash 为 ' + String(r.previousReceipt.scriptHash || '').slice(0, 16) + '…）' : '（没有更早的回执）'))
    if (r.scriptChanged) lines.push('  ▸ **旧回执不代表当前代码**：引用证据时必须用 scriptHash 与当前文件一致的那份回执。')
    if (r.scriptChangedDuringRun) lines.push('  ▸ **本次运行期间文件被改动**：请重跑并引用重跑后的回执。')
  }
  const missing = Object.keys(r.packages.found).filter((k) => !r.packages.found[k])
  lines.push('- 包：' + (Object.keys(r.packages.found).length ? Object.keys(r.packages.found).map((k) => k + '=' + (r.packages.found[k] || '未找到')).join('、') : '（未请求）') + (missing.length ? '｜缺失：' + missing.join(',') : ''))
  lines.push('- 网络：**未由插件强制**（subprocess.spawn 无 policy 槽）')
  lines.push('- 复现：math_computation { op:\'run\', engine:\'' + r.engine.name + '\', mode:\'file\', file:\'' + (r.scriptPath || r.script.path) + '\' }')
  for (const w of (r.warnings || [])) lines.push('- ⚠ [' + w.code + '] ' + w.message)
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
  // round-7 (fix 1): a probe that NAMES an engine must describe THAT engine. Previously the response
  // carried `engine: null` (or the first ALLOWED engine) and the failure path always blamed
  // `params.mathEngines[0]` (python) - so `probe {engine:'r'}` echoed python and told the user to
  // install python. Resolve the requested engine up front instead.
  const requested = (args.engine && args.engine !== 'auto') ? String(args.engine) : null
  const chosen = requested
    ? await resolveEngine(H, requested, params, args)
    : (probe.engines.length ? await resolveEngine(H, probe.engines[0].name, params, args) : null)
  let packages = { requested: want.slice(), found: {} }
  const probeDet = familyProbeDet(chosen)
  if (want.length && probeDet) packages = await probePackages(H, probeDet, want)
  else if (want.length && chosen && chosen.ok && chosen.name === 'cli') packages = { requested: want.map((s) => parsePackageSpec(s).name || s), found: {}, precheckSkipped: 'engine=cli：无法从命令名判断引擎族（不阻塞）' }
  // S2 + round-9 F3: the absence list must exist BEFORE the early failure return, because the
  // failure a user actually hits must carry the same evidence as the success shape.
  const absentFor = (names) => params.mathEngines
    .filter((e) => names.indexOf(e) === -1)
    .map((e) => ((MATH_ENGINES[e] && MATH_ENGINES[e].resolveFrom === 'cli.command')
      ? { engine: e, why: 'needs-a-caller-supplied-command' }
      : { engine: e, why: 'not-found-on-this-machine' }))

  if (requested && chosen && !chosen.ok) {
    // Policy/absence refusal for the REQUESTED engine, with its own guidance.
    const out = Object.assign({}, chosen)
    out.op = 'probe'
    out.engines = probe.engines
    out.available = !!probe.available
    out.packages = packages
    return out
  }
  if (!probe.available && !(chosen && chosen.ok)) {
    const first = requested || params.mathEngines[0] || 'python'
    const out = fail('MATH_ENGINE_NOT_FOUND', first, '本机没有可用的计算引擎（请求：' + first + '）', { next: await userInstallNext(H, first), engines: [], available: false, configured: params.mathEngines.slice(), absent: absentFor(probe.engines.map((e) => e.name)), packages: packages })
    out.op = 'probe'
    return out
  }
  // A REQUESTED engine that resolved (e.g. `cli`, or a runtime-discovered interpreter) counts as
  // available even when auto-detection found nothing - otherwise probe denied what run would do.
  const engines = probe.engines.slice()
  if (chosen && chosen.ok && !engines.some((e) => e.name === chosen.name)) {
    engines.push(Object.assign({ name: chosen.name, path: chosen.exe, version: chosen.version, license: (MATH_ENGINES[chosen.name] || {}).license }, verifyFields(chosen.name)))
  }
  const engineInfo = (chosen && chosen.ok) ? Object.assign({ name: chosen.name, path: chosen.exe, version: chosen.version }, verifyFields(chosen.name)) : null
  // round-9 (F3): the availability line must never be silently partial - name the CONFIGURED engines
  // that were not found (and why), instead of just listing the ones that happened to resolve.
  const foundNames = engines.map((e) => e.name)
  // Per-engine absence explanation. The key is `why` (NOT the reserved machine-readable vocabulary
  // key), so the parity guard's exhaustive `next.reason` set stays exactly the refusal vocabulary.
  const absent = absentFor(foundNames)
  return {
    ok: true, op: 'probe', engine: engineInfo ? engineInfo.name : null, engineInfo: engineInfo,
    engines: engines, available: true, packages: packages,
    configured: params.mathEngines.slice(), absent: absent,
    message: '可用引擎：' + engines.map((e) => e.name + ' ' + e.version).join('、')
      + (engineInfo ? '（请求 ' + engineInfo.name + '：' + engineInfo.version + '）' : '')
      + (absent.length ? '；已配置但本机未发现：' + absent.map((a) => a.engine).join('、') : '；已配置的引擎都在'),
  }
}

// round-7 (finding 3): a cli command has no package probe of its own, so the FAMILY descriptor of
// the resolved executable must provide one. Returns null when the family is unknown - the caller then
// SKIPS the precheck (never a false "missing", which blocked the escape hatch).
function familyProbeDet(det) {
  if (!det || det.name !== 'cli') return det
  const fam = det.family || engineFamilyForExe(det.exe)
  const fd = fam ? MATH_ENGINES[fam] : null
  return (fd && fd.packageProbe) ? { ok: true, name: fam, desc: fd, exe: det.exe, version: det.version } : null
}

// ── op: run ─────────────────────────────────────────────────────────────────────────────────────
async function opRun(H, args, params) {
  const mode = args.mode
  const det = await resolveEngine(H, args.engine || 'auto', params, args)
  if (!det.ok) return det
  const desc = applyOverride(det, params, args)
  const det2 = { ok: true, name: det.name, desc: desc, exe: det.exe, version: det.version }
  // The generic escape hatch is recorded as `cli:<command>` (spec §4.3 / guards §18): the model and
  // the receipt must be able to tell WHICH command was run, not just that it was "cli".
  const cliCommand = args.cli && typeof args.cli.command === 'string' ? args.cli.command : ''
  const engineLabel = det.name === 'cli' ? ('cli:' + cliCommand) : det.name

  const want = (args.packages && args.packages.length) ? args.packages : params.mathPackages
  // round-9 (F7): version constraints are NOT enforced - we only check existence by base name.
  const pinnedSpecs = want.filter((sp) => parsePackageSpec(sp).pinned)
  const versionPolicy = 'version-constraints-are-existence-only: 只按 base name 检查是否存在，约束本身从不校验（版本求解交给包管理器）' + (pinnedSpecs.length ? '；本次未校验的约束：' + pinnedSpecs.join(', ') : '；本次没有版本约束')
  // round-7 (finding 3): for cli the precheck runs against the FAMILY of `cli.command` (same
  // discovery-shaped logic); an unrecognisable command SKIPS the precheck instead of reporting a
  // false "missing" that would block the escape hatch.
  const probeDet = familyProbeDet(det2)
  const pk = probeDet ? await probePackages(H, probeDet, want) : { requested: want.map((s) => parsePackageSpec(s).name || s), found: {} }
  // Presence is keyed by BASE NAME (round-6 D); the plan keeps the original specs so the manager
  // receives the version constraint verbatim. round-7: a precheck that could not RUN (null spawn /
  // timeout) must not be read as "missing" - that misled a real session.
  const missing = (probeDet && !pk.probeFailed) ? want.map((s) => parsePackageSpec(s).name || s).filter((p) => Object.prototype.hasOwnProperty.call(pk.found, p) && !pk.found[p]) : []
  if (missing.length) {
    return fail('MATH_MISSING_PACKAGES', det.name, '需要的包未安装：' + missing.join(', ') + '（只检查是否存在；版本求解交给包管理器）', {
      missing: missing,
      next: next('agent-install', { engine: det.name, packages: missing, specs: want.slice(), dryRun: true }),
      packages: pk,
      versionPolicy: versionPolicy, constraintsNotEnforced: pinnedSpecs.slice(),
    })
  }

  const root = await H.projectRoot()
  let scriptText = ''
  let fileRel = null
  let sourceHashBefore = null
  // round-9 (N1): `mode:'file'` is keyed by the SOURCE PATH, so re-running an ORIGINAL source lands on
  // the same archive id (attempt>=2, scriptChanged). Pointing it at an ARCHIVED script instead targets
  // a different path and therefore a NEW archive id by design - the prior attempt is never touched, but
  // there is no previous receipt FOR THAT ID, so scriptChanged/previousReceipt are necessarily empty.
  // That is not a bug, but it must be SAID rather than looking like broken change detection.
  let archivedScriptSource = false
  if (mode === 'code') scriptText = args.code
  else if (mode === 'file') {
    fileRel = projectRel('', args.file)
    if (fileRel === null) return fail('MATH_REFUSED', det.name, 'file 必须位于项目内：' + args.file, { next: next('reason', { reason: 'path-outside-project' }) })
    archivedScriptSource = /^Computation\//.test(String(fileRel))
    const txt = await H.readText(fileRel)
    if (txt === undefined) return fail('MATH_REFUSED', det.name, '找不到文件：' + args.file, { next: next('reason', { reason: 'file-not-found' }) })
    scriptText = txt
    sourceHashBefore = sha256(txt)
  } else scriptText = (args.expr || '') + '\n'

  const { runId, input } = runIdOf(H.designator, slug(root), det.name, mode, scriptText, want, fileRel)
  const baseDir = 'Computation/' + runId
  // P2a item 3 + AUDIT-C FIX (HIGH): the whole claim-and-archive section for one archive id is
  // serialised. Allocation, the script/stdout/stderr writes and receipt.json (which claims the slot)
  // must not interleave with another run of the same id, or both take attempt 1 and one is lost.
  return await withArchiveLock(baseDir, async () => {
  const slot = await nextAttempt(H, baseDir)
  const dir = slot.dir
  const attempt = slot.attempt
  const prevReceipt = await previousReceiptOf(H, baseDir, attempt)
  const scriptRel = dir + '/script' + (det.name === 'cli' ? '.txt' : desc.ext)
  const scriptAbs = absJoin(root, scriptRel)
  const scriptHash = sha256(scriptText)
  // P2a item 2: reconciliation against the previous receipt for the same archive id (mode:'file' is
  // path-keyed, so this is exactly "the file changed since that receipt").
  const scriptChanged = !!(mode === 'file' && prevReceipt && prevReceipt.scriptHash && prevReceipt.scriptHash !== scriptHash)
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
  // P2a item 2/4: hash the SOURCE again after the run. A member editing the file while this run was
  // in flight shows up here (and never silently).
  let sourceHashAfter = null
  let scriptChangedDuringRun = false
  if (mode === 'file' && fileRel) {
    const after = await H.readText(fileRel)
    sourceHashAfter = after === undefined ? null : sha256(after)
    // AUDIT-A FIX: a null post-run hash means the source DISAPPEARED during the run - that is a
    // change, not "no change". Comparing null-safe (null !== beforeHash) keeps it fail-closed.
    scriptChangedDuringRun = sourceHashAfter !== sourceHashBefore
  }
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

  const warnings = []
  if (archivedScriptSource) warnings.push(warning('ARCHIVED_SCRIPT_RERUN', 'mode:\'file\' 指向的是**归档脚本**（Computation/…）：按设计归档 id 以**源路径**为键，所以这是一次**新归档**（新目录、attempt 1），没有该 id 的历史回执 ⇒ scriptChanged/previousReceipt 为空是**预期**，且**旧 attempt 绝不会被覆盖**。要做"编辑→重跑→attempt≥2 + scriptChanged"的核对，请把 mode:\'file\' 指向**原始源文件**并编辑它，而不是指向归档副本。'))
  if (!probeDet && want.length) warnings.push(warning('PACKAGE_PRECHECK_SKIPPED', 'engine=cli：无法从命令名判断引擎族，已跳过包预检（不阻塞执行，也不会误报缺包）；如需预检请直接用 python/r/octave/julia 或改用可识别的解释器路径。'))
  if (pk && pk.probeFailed && want.length) warnings.push(warning('PACKAGE_PRECHECK_UNKNOWN', '包预检未能执行（宿主 subprocess 在这几次尝试里返回空/超时，会话早期常见）：本次不判定缺包、不阻塞执行；如需确定性结论请重试或直接用对应引擎。probe=' + JSON.stringify(pk.argv) + ' attempts=' + JSON.stringify(pk.attempts)))
  if (fullOut.length > MATH_CAPS.stdout) warnings.push(warning('OUTPUT_TRUNCATED', 'stdout 超过 64KB，完整版见 ' + dir + '/stdout.txt'))
  if (scriptChanged) warnings.push(warning(MATH_SCRIPT_CHANGED_WARNING, 'scriptChanged：文件 ' + fileRel + ' 自上一次回执以来已改变（旧回执不再代表当前代码），本次已写出新 attempt ' + attempt + '。'))
  if (scriptChangedDuringRun) warnings.push(warning(MATH_SCRIPT_CHANGED_DURING_RUN_WARNING, 'scriptChangedDuringRun：文件 ' + fileRel + ' 在本次运行期间被改动（可能有另一个成员在编辑）；本次回执的 scriptHash 是运行前版本 ' + String(sourceHashBefore).slice(0, 12) + '…，请重跑后再引用。'))
  for (const w of await retentionWarnings(H, baseDir, attempt)) warnings.push(w)

  const receipt = {
    schema: 'vibe-math/math-computation-receipt@1',
    runId: runId, preset: H.designator, project: slug(root), op: 'run', mode: mode,
    attempt: attempt, attemptDir: dir, baseRunDir: baseDir,
    engine: { name: engineLabel, path: det.exe, version: det.version, source: det.name === 'cli' ? 'cli' : 'path' },
    script: { path: scriptRel, sha256: scriptHash, bytes: Buffer.byteLength(scriptText, 'utf8') },
    scriptPath: scriptRel, scriptHash: scriptHash,
    // round-8 (P0/D3): member file tools are session-cwd relative, so the ABSOLUTE locations must be
    // in the receipt: `scriptAbs` is directly openable, `cwd` is the project root to join with.
    scriptAbs: scriptAbs, cwd: root,
    sourceFile: fileRel || null,
    fileIsArchivedScript: archivedScriptSource,
    // round-9 (N2): a TIMEOUT must still carry the evidence it produced - the capped partial output
    // lives in the receipt as well as in stdout.txt/stderr.txt on disk.
    partialStdout: String(fullOut).slice(-2000),
    partialStderr: String(fullErr).slice(-2000),
    sourceHashBefore: sourceHashBefore, sourceHashAfter: sourceHashAfter,
    scriptChanged: scriptChanged, scriptChangedDuringRun: scriptChangedDuringRun,
    previousReceipt: prevReceipt ? { runId: prevReceipt.runId, attempt: prevReceipt.attempt || 1, scriptHash: prevReceipt.scriptHash || (prevReceipt.script && prevReceipt.script.sha256) || null } : null,
    argv: assembled.argv.slice(),
    cwd: root,
    packages: { requested: want.slice(), found: pk.found },
    // round-B (F6): the constraint policy is durable evidence too - a receipt read months later must
    // show that constraints were existence-only and WHICH ones were not checked.
    versionPolicy: versionPolicy, constraintsNotEnforced: pinnedSpecs.slice(),
    exit: r.timedOut ? null : (r.exit === undefined ? null : r.exit),
    timedOut: !!r.timedOut,
    ms: Number(r.ms || 0),
    truncated: { stdout: fullOut.length > MATH_CAPS.stdout, stderr: fullErr.length > MATH_CAPS.stderr },
    artifacts: [{ path: 'stdout.txt', sha256: sha256(fullOut), bytes: Buffer.byteLength(fullOut, 'utf8') }],
    captured: captured,
    network: 'not-enforced-by-plugin',
    warnings: warnings,
    determinism: { inputSha256: input, packagesSorted: true, noWallClockInId: true },
  }
  if (assembled.cli) receipt.cli = { command: assembled.cli.command, argv: assembled.cli.argv, stdinUsed: false, scriptAppended: !!assembled.cli.scriptAppended, scriptSkipped: assembled.cli.scriptSkipped || null }
  const receiptJson = JSON.stringify(receipt, null, 2)
  await H.writeText(dir + '/receipt.json', receiptJson)
  await H.writeText(dir + '/receipt.md', renderReceiptMd(receipt, fullOut, fullErr))
  const receiptRef = { dir: dir, json: dir + '/receipt.json', md: dir + '/receipt.md', sha256: sha256(receiptJson) }
  H.log('math_computation', det.name + ' ' + (det.name === 'cli' ? 'cli' : mode) + ' attempt=' + attempt + ' exit=' + receipt.exit + ' argv=' + assembled.argv.join(' '))

  const shell = {
    ok: true, op: 'run', engine: engineLabel, mode: mode,
    runId: runId, attempt: attempt,
    versionPolicy: versionPolicy, constraintsNotEnforced: pinnedSpecs.slice(),
    engineInfo: receipt.engine,
    argv: assembled.argv.slice(),
    scriptPath: scriptRel, scriptHash: scriptHash,
    scriptAbs: scriptAbs, cwd: root,
    attempt: attempt, attemptDir: dir, baseRunDir: baseDir,
    scriptChanged: scriptChanged, scriptChangedDuringRun: scriptChangedDuringRun,
    sourceFile: fileRel || null,
    fileIsArchivedScript: archivedScriptSource,
    // round-9 (N2): a TIMEOUT must still carry the evidence it produced - the capped partial output
    // lives in the receipt as well as in stdout.txt/stderr.txt on disk.
    partialStdout: String(fullOut).slice(-2000),
    partialStderr: String(fullErr).slice(-2000),
    previousReceipt: receipt.previousReceipt,
    cliScriptAppended: !!(receipt.cli && receipt.cli.scriptAppended),
    packages: pk.found,
    exit: receipt.exit, timedOut: receipt.timedOut, ms: receipt.ms,
    stdout: fullOut.slice(0, MATH_CAPS.stdout), stderr: fullErr.slice(0, MATH_CAPS.stderr),
    truncated: receipt.truncated, artifacts: receipt.artifacts, receipt: receiptRef,
    warnings: warnings,
  }
  if (receipt.timedOut) {
    // round-9 (F5): failure EVIDENCE must be uniform - a timeout carries the SAME fields a non-zero
    // exit does (exit + stderr), plus timedOut:true.
    const out = fail('MATH_TIMEOUT', engineLabel, '执行超时（' + timeoutMs + 'ms）已被终止', { argv: assembled.argv.slice(), receipt: receiptRef })
    out.exit = null
    out.stdout = String(fullOut).slice(0, MATH_CAPS.stdout)
    out.stderr = String(fullErr).slice(0, MATH_CAPS.stderr)
    return Object.assign(out, archiveFields(), { ms: receipt.ms, timedOut: true })
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
      out.stdout = fullOut.slice(0, MATH_CAPS.stdout)
      out.stderr = fullErr.slice(0, MATH_CAPS.stderr)
      return Object.assign(out, archiveFields())
    }
    const out = fail('MATH_NONZERO_EXIT', engineLabel, '引擎以非零退出码结束：' + r.exit, { argv: assembled.argv.slice(), receipt: receiptRef })
    out.exit = r.exit
    out.stdout = fullOut.slice(0, MATH_CAPS.stdout)
    out.stderr = fullErr.slice(0, MATH_CAPS.stderr)
    return Object.assign(out, archiveFields())
  }
  return shell

  function archiveFields() {
    return {
      scriptPath: scriptRel, scriptHash: scriptHash,
      attempt: attempt, attemptDir: dir, baseRunDir: baseDir,
      scriptChanged: scriptChanged, scriptChangedDuringRun: scriptChangedDuringRun,
      sourceFile: fileRel || null, previousReceipt: receipt.previousReceipt, warnings: warnings,
    }
  }
  }) // end withArchiveLock(baseDir) — see the AUDIT-C HIGH fix above
}

// ── op: receipt ────────────────────────────────────────────────────────────────────────────────
// P2a item 2: reconciliation. Read the receipt, re-hash the script it points at, and report
// scriptChanged. P2a item 3: receipt files are NEVER rewritten - only a MISSING receipt.md is
// filled in (that is the one documented exception, and it is not a rewrite of existing data).
async function opReceipt(H, args) {
  const raw = String(args.file || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const segs = raw.split('/').filter(Boolean)
  let runId = ''
  let attemptDir = null
  if (segs[0] === 'Computation') {
    runId = segs[1] || ''
    if (segs[2] === 'attempts' && segs[3]) attemptDir = 'Computation/' + runId + '/attempts/' + segs[3]
  } else {
    runId = segs[0] || ''
  }
  if (!runId) return fail('MATH_INVALID_ARGUMENT', null, 'op=receipt requires a receipt id or path')
  const tried = attemptDir ? [attemptDir, 'Computation/' + runId] : ['Computation/' + runId]
  let dir = null
  let json
  for (const d of tried) {
    json = await H.readText(d + '/receipt.json')
    if (json !== undefined) { dir = d; break }
  }
  // Round-2 lens-1 fix: a MISSING archive directory is a refusal with an explicit reason (a
  // fail-closed state, not a malformed call). A receipt whose JSON cannot be parsed stays
  // MATH_INVALID_ARGUMENT (that IS a malformed artifact).
  if (json === undefined) return fail('MATH_REFUSED', null, '没有找到回执归档：Computation/' + runId + '（目录或 receipt.json 不存在）', { next: next('reason', { reason: 'archive-missing' }) })
  let parsed
  try { parsed = JSON.parse(json) } catch (e) { return fail('MATH_INVALID_ARGUMENT', null, '回执无法解析：' + dir, { next: next('reason', { reason: 'receipt-unparsable' }) }) }
  const recordedHash = parsed.scriptHash || (parsed.script && parsed.script.sha256) || null
  const scriptRel = parsed.scriptPath || (parsed.script && parsed.script.path) || (dir + '/script')
  const currentText = await H.readText(scriptRel)
  const currentHash = currentText === undefined ? null : sha256(currentText)
  // AUDIT-A FIX: a missing archive script is not "unchanged". Reconciliation is fail-closed: if the
  // script cannot be read, the receipt cannot be trusted for any code, so report scriptChanged.
  const scriptMissing = currentText === undefined
  const scriptChanged = scriptMissing || (currentHash !== null && recordedHash !== null && currentHash !== recordedHash)
  const warnings = []
  if (scriptMissing) {
    warnings.push(warning(MATH_SCRIPT_CHANGED_WARNING, 'scriptChanged：归档脚本 ' + scriptRel + ' 已不存在（被删除或移动）——**该回执不能作为任何代码的证据**，请重跑。'))
  } else if (scriptChanged) {
    warnings.push(warning(MATH_SCRIPT_CHANGED_WARNING, 'scriptChanged：归档脚本 ' + scriptRel + ' 的当前哈希与回执记录不一致——**这份回执不再代表当前代码**，请用 mode:\'file\' 重跑并引用新回执。'))
  }
  const mdRel = dir + '/receipt.md'
  let rendered = false
  if (!(await H.exists(mdRel))) {
    const out = await H.readText(dir + '/stdout.txt')
    const err = await H.readText(dir + '/stderr.txt')
    await H.writeText(mdRel, renderReceiptMd(parsed, out || '', err || ''))
    rendered = true
  }
  return {
    ok: true, op: 'receipt', engine: parsed.engine ? parsed.engine.name : null,
    scriptPath: scriptRel, scriptHash: recordedHash, currentScriptHash: currentHash,
    scriptChanged: scriptChanged, attempt: parsed.attempt || 1, attemptDir: dir,
    receipt: { dir: dir, json: dir + '/receipt.json', md: mdRel },
    warnings: warnings,
    message: (scriptChanged ? '⚠ 归档脚本已改变：旧回执不再代表当前代码；' : '') + (rendered ? '缺失的 receipt.md 已补写（未改写既有数据）' : '回执只读返回（既有文件未改写）'),
  }
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
      next: next('vendor', Object.assign({ engine: engineName, url: d.vendor || '' }, verifyFields(engineName))),
    })
  }
  const scope = args.scope || params.mathInstallScope || 'user' // per-call only; never persisted anywhere
  // round-6 (B): resolve the interpreter the SAME way the run path does (the descriptor's candidate
  // list, in order) so the plan targets the interpreter that will actually run - and so the manager
  // detection sees that interpreter's REAL path (a conda `python3` is not a bare `python`).
  let exe = engineName
  {
    const cands = mathEngineCandidates(engineName) || [engineName === 'r' ? 'Rscript' : engineName]
    for (const c of cands) {
      try { const hit = await H.resolveExecutable(c); if (hit) { exe = hit; break } } catch (e) { /* try the next candidate */ }
    }
  }
  // round-6 (B): python dispatches on the DETECTED environment; every other engine keeps its own
  // single template. The chosen manager (and whether it is only an assumption) is part of the plan.
  let managerInfo = null
  let mgrTmpl = null
  if (d.install.managers) {
    managerInfo = await detectPythonManager(H, exe)
    mgrTmpl = d.install.managers[managerInfo.manager] || null
  }
  const activeManager = managerInfo ? managerInfo.manager : d.install.manager
  const userTmpl = (mgrTmpl && mgrTmpl.userArgv) || d.install.userArgv
  const systemTmpl = (mgrTmpl && mgrTmpl.systemArgv) || (mgrTmpl ? null : d.install.systemArgv)
  const tmpl = scope === 'system' ? systemTmpl : userTmpl
  if (!tmpl) {
    // round-6 (C): the refusal says WHY per engine (or per detected manager) instead of a generic line.
    const why = (mgrTmpl && mgrTmpl.systemUnsupportedReason) || d.install.systemUnsupportedReason || '该引擎只提供用户级安装'
    return fail('MATH_REFUSED', engineName, engineName + ' 不支持 system 作用域：' + why, { next: next('reason', { reason: 'system-scope-unsupported' }) })
  }
  const uninstallTmpl = (mgrTmpl && mgrTmpl.uninstallArgv) || d.install.uninstallArgv
  const commands = args.packages.map((p) => ({ argv: substInstall(tmpl, engineName, exe, p), why: '缺少 ' + p }))
  const plan = {
    engine: engineName, scope: scope, manager: activeManager, commands: commands,
    managerAssumed: !!(managerInfo && managerInfo.assumed), managerWhy: managerInfo ? managerInfo.why : '',
    versionPolicy: '版本求解交给包管理器（本工具只检查是否已安装，并把 pkg<op>version 原样透传）',
    note: scope === 'user' ? '将安装到用户级目录' : '仅本次系统作用域（不会被记住）',
  }
  const planToken = sha256(JSON.stringify({ engine: engineName, packages: args.packages, scope: scope, commands: commands }) + '|planVersion=1').slice(0, 32)
  if (!args.confirm) {
    return { ok: true, op: 'install', engine: engineName, plan: plan, planToken: planToken, next: next('agent-install', { dryRun: true, manager: activeManager, managerAssumed: !!plan.managerAssumed }), message: '安装计划（尚未执行，管理器=' + activeManager + (plan.managerAssumed ? '（假设：' + plan.managerWhy + '）' : '') + '）：' + commands.map((c) => c.argv.join(' ')).join(' ; ') }
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
      const audit0 = { schema: 'vibe-math/math-computation-install@1', planToken: planToken, scope: scope, manager: activeManager, commands: commands, results: results, exit: r ? r.exit : null, timedOut: !!(r && r.timedOut), installed: args.packages, rollback: rollbackFor(d, exe, args.packages, uninstallTmpl), network: 'not-enforced-by-plugin' }
      await H.writeText('Computation/installs/' + planToken + '.json', JSON.stringify(audit0, null, 2))
      const code = (r && r.timedOut) ? 'MATH_TIMEOUT' : 'MATH_NONZERO_EXIT'
      const out = fail(code, engineName, '安装失败（' + c.argv.join(' ') + '）：' + (r ? ('exit=' + r.exit) : 'no subprocess'), { next: next('note', { audit: 'Computation/installs/' + planToken + '.json' }) })
      out.audit = 'Computation/installs/' + planToken + '.json'
      return out
    }
  }
  const audit = { schema: 'vibe-math/math-computation-install@1', planToken: planToken, scope: scope, manager: activeManager, commands: commands, results: results, exit: 0, timedOut: false, installed: args.packages, before: {}, after: {}, rollback: rollbackFor(d, exe, args.packages, uninstallTmpl), network: 'not-enforced-by-plugin' }
  await H.writeText('Computation/installs/' + planToken + '.json', JSON.stringify(audit, null, 2))
  return { ok: true, op: 'install', engine: engineName, executed: true, scope: scope, audit: 'Computation/installs/' + planToken + '.json', message: '已安装：' + args.packages.join(', ') + '（审计：Computation/installs/' + planToken + '.json）' }
}

// ── round-6 (B/D): package specs + Python package-manager dispatch ──────────────────────────────
// Version SOLVING is delegated to the package manager: the tool only checks presence (by base name)
// and passes the spec through. The accepted grammar is small and manager-understood; anything else
// (spaces, `;`, `|`, `&`, `$`, backticks, `@`, parentheses, empty) is refused with an explicit
// reason instead of being handed to a shell.
const PKG_SPEC_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9._,-]+\])?(?:(?:==|>=|<=|~=|!=|>|<|=)[A-Za-z0-9._*+!-]+)?$/
export function parsePackageSpec(spec) {
  const raw = String(spec == null ? '' : spec).trim()
  if (!raw) return { ok: false, problem: 'empty package spec' }
  if (!PKG_SPEC_RE.test(raw)) {
    return { ok: false, problem: 'unsupported version syntax: "' + raw + '"（版本求解交给包管理器：请用它能理解的形式，例如 pip 的 pkg==1.2 或 conda 的 pkg=1.2；本工具只检查是否已安装）' }
  }
  const name = raw.replace(/(?:==|>=|<=|~=|!=|>|<|=).*$/, '').replace(/\[.*$/, '')
  return { ok: true, name: name, spec: raw, pinned: raw !== name }
}

// Detect WHICH python package manager the interpreter's own environment implies - detect, don't
// guess. conda/mamba markers live in the interpreter path (…/envs/<name>/… or …/miniconda3/…) and
// must be confirmed by resolving the manager; uv counts only when it sits NEXT TO the interpreter
// (a uv-managed venv). Anything ambiguous falls back to pip, and `assumed: true` travels into the
// plan/message so the operator is told which manager the plan assumes.
async function detectPythonManager(H, exe) {
  const p = String(exe || '').replace(/\\/g, '/').toLowerCase()
  if (/\/envs\/|\/conda|\/miniconda|\/anaconda|\/mambaforge|\/miniforge/.test(p)) {
    for (const mgr of ['conda', 'mamba']) {
      try {
        const found = await H.resolveExecutable(mgr)
        if (found) return { manager: mgr, assumed: false, why: '解释器路径看起来像 ' + mgr + ' 环境（' + p.split('/').slice(-3).join('/') + '）' }
      } catch (e) { /* try the next candidate */ }
    }
  }
  try {
    const uv = await H.resolveExecutable('uv')
    if (uv) {
      const dirOf = (x) => String(x).replace(/\\/g, '/').replace(/\/[^/]*$/, '')
      if (dirOf(uv) === dirOf(exe)) return { manager: 'uv', assumed: false, why: 'uv 与解释器同目录（uv 管理的虚拟环境）' }
    }
  } catch (e) { /* fall through to pip */ }
  return { manager: 'pip', assumed: true, why: '未检测到 conda/mamba 标记，也没有与解释器同目录的 uv ⇒ 按文档回退到 pip（计划中的管理器是**假设**）' }
}

function rollbackFor(d, exe, packages, uninstallTmpl) {
  const tmpl = uninstallTmpl || (d.install && d.install.uninstallArgv)
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
    return head + shell + '\n' + MATH_ARCHIVE_WORKFLOW_LINE_EN + '\n' + MATH_RULE_LINES_EN.join('\n')
  }
  const head = '- math_computation：本机可用 ' + (list || '（无）') + '。需要数值/符号/统计计算时先 probe 再 run'
    + '（工具路径会留下可复核回执，结论请引用回执路径）；缺包时如实说明并给替代方案或安装计划（不要假装），安装需先出计划并征得确认。'
  const shell = mode === 'typed+shell' ? '\n' + MATH_SHELL_RULE_LINE : ''
  return head + shell + '\n' + MATH_ARCHIVE_WORKFLOW_LINE + '\n' + MATH_RULE_LINES.join('\n')
}
