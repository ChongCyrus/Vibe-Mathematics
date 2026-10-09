// vmu settings — the SINGLE SOURCE of every tunable (docs/04).
//
// Design contract (docs/04 §2, §3):
//   · one declaration per key, here and nowhere else; everything else is DERIVED:
//     the Schemastery `Config`, the outward JSON Schema (docs, gates, domain checks),
//     the layering/override resolver, the hot-reload class table and the "who may change it" map;
//   · reading an UNDECLARED key is a defect, not a default (R4): `assertDeclared` throws and
//     `readSetting` refuses by name;
//   · every default is HARMLESS: the default path is zero mechanism (R1, 04-§3);
//   · "time" and "randomness" are never user-supplied values (I-3 in docs/01 §3.1): only the
//     framework sets them, so any `...At`/`...Ms` a user sends is refused.
//
// Carrier decision (D10 as corrected by the official-guideline recon): DSH documents no carrier;
// real packages use Schemastery and zod. vmu standardises on Schemastery for the plugin `Config`,
// and DERIVES a JSON Schema from the same table for documentation, gates and domain checks.
//
// NO STATIC HOST IMPORT, ON PURPOSE: this file must be importable by plain Node in this repository
// (the repository is a bundle, not a host, so `@deepseek-ai/schemastery` does not resolve here) and
// by the host at activation. The carrier is therefore INJECTED into `buildSchemastery(carrier)`; the
// data table, the validators, the resolver and the JSON Schema derivation need no carrier at all. A
// missing carrier is refused by name (`VMU_ENGINE_UNAVAILABLE`), never faked.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

// The shared math module owns its own defaults, and v5r's discipline was to TAKE them from there and
// COPY the arrays, so that every preset stays byte-comparable (its own comment says the module defaults
// are frozen and must never be mutated). A1/A2 of the P3 containment report apply exactly that here:
// `vmu.math.*` defaults are the module's, not a second hand-written opinion.
import { MATH_PARAM_DEFAULTS as MATH_DEFAULTS } from '../math-computation.js'

const mathDefaults = () => ({
  mathComputation: MATH_DEFAULTS.mathComputation,
  mathMode: MATH_DEFAULTS.mathMode,
  mathEngines: MATH_DEFAULTS.mathEngines.slice(),
  mathTimeoutMs: MATH_DEFAULTS.mathTimeoutMs,
  mathPackages: MATH_DEFAULTS.mathPackages.slice(),
  mathInstallScope: MATH_DEFAULTS.mathInstallScope,
})

/**
 * Hot-reload classes (docs/04 §5). A key without one may not ship (the gate is D13/D15 in the
 * docs linter and the E-class scenario in tests/vmu-settings.test.mjs).
 *   H0 immediate · H1 next turn · H2 next session · H3 read-only
 */
export const HOT = Object.freeze({ H0: 'H0', H1: 'H1', H2: 'H2', H3: 'H3' })

/**
 * The declarations. `key` is the canonical dotted identifier used by settings files, reports and
 * refusals; `type`/`domain` drive both derivations; `hot` and `who` are the operational contract.
 * `doc` is the one-line human description that lands in the generated parameter table (04-§11).
 */
export const SETTING_DEFS = Object.freeze([
  // ---- core ---------------------------------------------------------------------------------
  { key: 'vmu.core.enabled', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '内核总开关（关闭＝完全不介入）' },
  { key: 'vmu.core.storeBackend', type: 'enum', domain: ['json-fold', 'storage-domain'], def: 'json-fold', hot: HOT.H3, who: 'office', doc: '耐久后端（O1：默认 fold；换后端须过同一套门禁）' },
  { key: 'vmu.core.logLevel', type: 'enum', domain: ['debug', 'info', 'warn', 'error'], def: 'info', hot: HOT.H0, who: 'office', doc: '日志级别（不进模型上下文）' },

  // ---- limits (machine-enforced; refusals must name the current value and the cap) ----------
  { key: 'vmu.limits.toolCallsPerTurnCap', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '单回合工具调用上限；0＝不限' },
  { key: 'vmu.limits.maxLiveMembers', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '在活成员上限；0＝不设（机器强制）' },
  { key: 'vmu.limits.memoryCeilingMb', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '内存上限（超限拒绝新建成员）；0＝不设' },
  { key: 'vmu.limits.wallClockMs', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '阶段墙钟硬上限（框架侧上限，不是用户可设的截止时刻）' },
  { key: 'vmu.limits.maxParallel', type: 'positiveInteger', def: 3, hot: HOT.H0, who: 'office', doc: '并发上限（P3：吸收 v5r 的 maxParallel；机器强制）' },

  // ---- records ------------------------------------------------------------------------------
  { key: 'vmu.records.tracks', type: 'stringList', def: ['progress', 'routes', 'obstacles', 'rejected', 'state'], hot: HOT.H1, who: 'office', doc: '记录分轨（负向知识有独立档）' },
  { key: 'vmu.records.headListAt', type: 'natural', def: 7, hot: HOT.H1, who: 'office', doc: '头部列表最多返回多少行（0＝全部）；被截断时按 docs/07 §4.4 计数' },
  { key: 'vmu.records.truncateMode', type: 'enum', domain: ['keepChars', 'keepHeadTail', 'dropMiddle'], def: 'keepChars', hot: HOT.H1, who: 'office', doc: '截断策略（必须计数，禁静默）' },
  { key: 'vmu.records.fingerprintPolicy', type: 'enum', domain: ['content-only', 'content+display'], def: 'content-only', hot: HOT.H2, who: 'office', doc: '内容指纹口径（默认排除展示头）' },
  { key: 'vmu.records.pointerPropagation', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'P3/S21：头部列表为默认信息通道；关＝零注入且提示词逐字回退' },
  { key: 'vmu.records.meetingKeepEvery', type: 'positiveInteger', def: 5, hot: HOT.H1, who: 'office', doc: 'P3：每 N 场会议保留一次归档（v5r 的 meetingKeepEvery）' },

  // ---- prompts ------------------------------------------------------------------------------
  { key: 'vmu.prompts.overridesDir', type: 'path', def: 'prompts/overrides', hot: HOT.H0, who: 'office', doc: '提示词覆盖目录（仓内相对路径）' },
  { key: 'vmu.prompts.bindings', type: 'objectList', def: [], hot: HOT.H0, who: 'office', doc: '四维绑定（优先级 角色<阶段<成员<任务）' },
  { key: 'vmu.prompts.whoMayOverride', type: 'stringList', def: ['office'], hot: HOT.H1, who: 'office', doc: '允许覆盖提示词者' },
  { key: 'vmu.prompts.resourceSection', type: 'boolean', def: false, hot: HOT.H0, who: 'office', doc: 'P3/S25-A：默认 false＝提示词一字不改；true 才注入【资源】段' },

  // ---- meetings (rules and mechanism only; "when to meet" and "what counts as stalled" are middleware)
  { key: 'vmu.meetings.quorumRule', type: 'enum', domain: ['m-unanimous', 'all-unanimous'], def: 'm-unanimous', hot: HOT.H1, who: 'role:chair', doc: '法定数规则（仅规则，不含"何时开会"）' },
  { key: 'vmu.meetings.quorumCap', type: 'natural', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：法定数上限 m = min(cap, 参与人数)；0＝不设上限' },
  { key: 'vmu.meetings.reconsiderFloor', type: 'natural', def: 0, hot: HOT.H1, who: 'role:chair', doc: 'P3：复议门槛下限（生效门槛 = max(对象标准, 它, 上限)）；0＝只保证"不降"' },
  { key: 'vmu.meetings.verdictMaxRounds', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：同一对象的复算轮次上限（不得无限复算）' },
  { key: 'vmu.meetings.hardLimitMs', type: 'natural', def: 1800000, hot: HOT.H1, who: 'office', doc: 'P3：会议墙钟硬界（唯一兜底）＝1800000；钳制 [300000, 7200000]；**不存在"无界"**' },
  { key: 'vmu.meetings.wakeRetries', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: 'P3：同一成员同阶段的唤醒重试上限（钳制 [0,10]）；耗尽记 unreached 并视为"已获机会"' },
  { key: 'vmu.meetings.roundTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单轮超时；0＝不限' },
  { key: 'vmu.meetings.quotesPerMessageMax', type: 'natural', def: 2, hot: HOT.H1, who: 'role:chair', doc: 'P3：每条发言最多引用几条；超限 ⇒ 具名拒' },
  { key: 'vmu.meetings.quoteDepthMax', type: 'natural', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：引用链深度上限；超深 ⇒ 折叠标注（不拒）' },

  // ---- tasks and stages ---------------------------------------------------------------------
  { key: 'vmu.tasks.maxOpenTasks', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '未完成任务上限；0＝不限' },
  { key: 'vmu.tasks.stages', type: 'stringList', def: [], hot: HOT.H2, who: 'office', doc: '阶段列表；默认空＝不假装有流程' },

  // ---- math and formalisation ---------------------------------------------------------------
  // A1/A2 (P3): the DEFAULTS come from the shared module, so v2–v5r and vmu stay byte-comparable.
  { key: 'vmu.math.computation', type: 'enum', domain: ['off', 'auto', 'on'], def: mathDefaults().mathComputation, hot: HOT.H2, who: 'office', doc: 'P3：数学工具可用性（共享模块默认 auto）' },
  { key: 'vmu.math.mode', type: 'enum', domain: ['typed', 'typed+shell'], def: mathDefaults().mathMode, hot: HOT.H2, who: 'office', doc: 'P3：typed＝绝不提 shell 且拒绝 engine=cli' },
  { key: 'vmu.math.engines', type: 'stringList', def: mathDefaults().mathEngines, hot: HOT.H2, who: 'office', doc: '引擎优先级（默认取自共享模块并拷贝；空＝具名降级）' },
  { key: 'vmu.math.timeoutMs', type: 'natural', def: mathDefaults().mathTimeoutMs, hot: HOT.H0, who: 'office', doc: 'P3：单次计算预算（共享模块默认）' },
  { key: 'vmu.math.packages', type: 'stringList', def: mathDefaults().mathPackages, hot: HOT.H1, who: 'office', doc: 'P3：计算可要求的包/工具箱（共享模块默认）' },
  { key: 'vmu.math.installScope', type: 'enum', domain: ['user', 'system'], def: mathDefaults().mathInstallScope, hot: HOT.H1, who: 'office', doc: 'P3：安装作用域；system 仅当次、绝不记忆' },
  { key: 'vmu.math.compileTimeoutMs', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '编译超时；0＝作业级默认' },
  { key: 'vmu.math.formalVerify', type: 'enum', domain: ['off', 'encourage', 'require'], def: 'off', hot: HOT.H2, who: 'office', doc: 'P3：判定时的形式化要求；默认 off＝零策略' },
  { key: 'vmu.math.leanCommand', type: 'string', def: 'lean', hot: HOT.H1, who: 'office', doc: 'P3：Lean 命令名（命令模板可覆盖）' },
  { key: 'vmu.math.leanArgs', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'P3：Lean 附加参数（显式 -R/--root 优先于 searchPaths）' },
  { key: 'vmu.math.leanTimeoutMs', type: 'natural', def: 120000, hot: HOT.H0, who: 'office', doc: 'P3：单次 Lean 编译预算' },
  { key: 'vmu.math.leanAsync', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: 'P3：后台队列编译；只有"退出 0 且文件内容哈希未变"才可标 passed' },
  { key: 'vmu.math.leanInitiative', type: 'enum', domain: ['off', 'normal', 'eager'], def: 'normal', hot: HOT.H2, who: 'office', doc: 'P3：日常形式化积极性（与 formalVerify 判定时要求正交）' },
  { key: 'vmu.math.leanSearchPaths', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'P3：额外 -R 根（去重后注入，自动 VibMath 根之前）' },
  { key: 'vmu.math.leanJobsMaxParallel', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: 'P3：后台编译并发（1＝串行）' },

  // ---- safety -------------------------------------------------------------------------------
  { key: 'vmu.safety.pathPolicy', type: 'enum', domain: ['workspace-only', 'workspace+shared'], def: 'workspace-only', hot: HOT.H3, who: 'office', doc: '写保护范围' },
  { key: 'vmu.safety.approvalRequired', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '需审批的动作（走宿主审批面）' },
  { key: 'vmu.safety.delegableKeys', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '可下放给角色槽位的键' },

  // ---- middleware ---------------------------------------------------------------------------
  { key: 'vmu.middleware.entries', type: 'objectList', def: [], hot: HOT.H0, who: 'office', doc: '中间件清单（默认空＝零机制）' },
  { key: 'vmu.middleware.hookTimeoutMs', type: 'positiveInteger', def: 2000, hot: HOT.H0, who: 'office', doc: '单钩子预算' },
  { key: 'vmu.middleware.breakerThreshold', type: 'positiveInteger', def: 3, hot: HOT.H0, who: 'office', doc: '连续失败熔断阈值' },
  { key: 'vmu.middleware.dryRun', type: 'boolean', def: false, hot: HOT.H0, who: 'office', doc: '干跑（只报不做）' },

  // ---- packs --------------------------------------------------------------------------------
  { key: 'vmu.packs.active', type: 'stringList', def: [], hot: HOT.H2, who: 'office', doc: '生效整合包（冲突按 O4 报错）' },
  { key: 'vmu.packs.allowOverride', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许 pack 间显式覆盖' },
  { key: 'vmu.packs.activeOverrides', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '显式覆盖声明（不声明即报错）' },
])

const BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]))

/** Named refusals. Codes are registered in docs/03 §8 (gate D14 forbids unregistered ones). */
export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** R4: a key that is not declared is a defect. Never invent a default for it. */
export function assertDeclared(key) {
  if (!BY_KEY.has(key)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'undeclared setting key: ' + key,
      'declare it in vibe-math-vmu/settings/schema.js first (docs/04 R4)')
  }
  return BY_KEY.get(key)
}

/** I-3: the framework owns time; a user may not hand us an absolute deadline. Budgets (`...Ms`) and
 *  timeouts are legitimate settings, and every DECLARED key is framework-owned by construction, so
 *  the refusal is for undeclared, user-supplied instants only. */
export function assertNoUserTime(key) {
  if (BY_KEY.has(key)) return
  if (/(?:At|Deadline)$/.test(key)) {
    throw refuse('VMU_NOT_PERMITTED', 'user-supplied time is not accepted: ' + key,
      'time is set by the framework (docs/01 I-3); budgets live in vmu.limits.*')
  }
}

/** Domain/shape check for one value, derived from the declaration. */
export function validateValue(key, value) {
  const d = assertDeclared(key)
  const bad = (why) => refuse('VMU_INVALID_ARGUMENT', d.key + ': ' + why, 'declared as ' + d.type)
  switch (d.type) {
    case 'boolean':
      if (typeof value !== 'boolean') throw bad('expected a boolean')
      break
    case 'enum':
      if (!d.domain.includes(value)) throw bad('expected one of ' + d.domain.join(' | '))
      break
    case 'natural':
      if (!Number.isInteger(value) || value < 0) throw bad('expected an integer >= 0')
      break
    case 'positiveInteger':
      if (!Number.isInteger(value) || value < 1) throw bad('expected an integer >= 1')
      break
    case 'path':
      if (typeof value !== 'string' || value.length === 0) throw bad('expected a non-empty relative path')
      if (/^([A-Za-z]:|[\\/])/.test(value)) throw bad('expected a workspace-relative path')
      break
    case 'stringList':
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw bad('expected a list of strings')
      break
    case 'objectList':
      if (!Array.isArray(value) || value.some((v) => v === null || typeof v !== 'object')) throw bad('expected a list of objects')
      break
    default:
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown declaration type for ' + d.key + ': ' + d.type)
  }
  return value
}

/**
 * Nested Schemastery object for the plugin `Config` (dots become nesting, per docs/03 conventions).
 * `carrier` is the Schemastery namespace injected by the host (default import or named `z`); when it
 * is absent or incomplete we refuse by name instead of silently returning a schema that does not
 * validate. The carriers actually used by first-party packages expose exactly these members.
 */
export function buildSchemastery(carrier, defs = SETTING_DEFS) {
  const need = ['object', 'boolean', 'number', 'string', 'array', 'any', 'union', 'const']
  const missing = !carrier ? need : need.filter((m) => typeof carrier[m] !== 'function')
  if (missing.length > 0) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'schemastery carrier is unavailable or incomplete',
      'pass the host carrier (@deepseek-ai/schemastery) to buildSchemastery; missing: ' + missing.join(','))
  }
  const root = {}
  for (const d of defs) {
    const parts = d.key.split('.')
    let node = root
    for (const p of parts.slice(0, -1)) node = node[p] || (node[p] = {})
    let leaf
    switch (d.type) {
      case 'boolean': leaf = carrier.boolean().default(d.def); break
      case 'natural': leaf = carrier.number().min(0).step(1).default(d.def); break
      case 'positiveInteger': leaf = carrier.number().min(1).step(1).default(d.def); break
      case 'enum': leaf = carrier.union(d.domain.map((v) => carrier.const(v))).default(d.def); break
      case 'stringList': leaf = carrier.array(carrier.string()).default(d.def); break
      case 'objectList': leaf = carrier.array(carrier.any()).default(d.def); break
      default: leaf = carrier.string().default(d.def); break
    }
    node[parts[parts.length - 1]] = leaf
  }
  return carrier.object(root)
}

/** Outward JSON Schema (dotted flat map) derived from the SAME table — never hand-written twice. */
export function toJsonSchema(defs = SETTING_DEFS) {
  const properties = {}
  for (const d of defs) {
    const p = { default: d.def, description: d.doc, 'x-vmu-hot': d.hot, 'x-vmu-who': d.who }
    switch (d.type) {
      case 'boolean': p.type = 'boolean'; break
      case 'enum': p.enum = d.domain.slice(); break
      case 'natural': p.type = 'integer'; p.minimum = 0; break
      case 'positiveInteger': p.type = 'integer'; p.minimum = 1; break
      case 'stringList': p.type = 'array'; p.items = { type: 'string' }; break
      case 'objectList': p.type = 'array'; p.items = { type: 'object' }; break
      default: p.type = 'string'; break
    }
    properties[d.key] = p
  }
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, additionalProperties: false }
}

/**
 * Layering (docs/04 §4): pack defaults < preset Config < session settings < runtime set.
 * Input is an ordered list of flat maps; later layers win. Undeclared keys are refused, never
 * merged (so a typo cannot silently become a phantom setting).
 */
export function resolveSettings(layers = []) {
  const out = {}
  const provenance = {}
  for (const d of SETTING_DEFS) out[d.key] = d.def
  layers.forEach((layer, i) => {
    if (!layer) return
    for (const [k, v] of Object.entries(layer)) {
      assertNoUserTime(k)
      validateValue(k, v)
      out[k] = v
      provenance[k] = provenance[k] || []
      provenance[k].push(i)
    }
  })
  return { values: out, provenance }
}
