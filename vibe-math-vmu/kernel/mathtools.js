// vmu kernel · mathtools — the POLICY + GUARD layer that finally READS the `vmu.math.*` knobs.
//
// WHY THIS FILE EXISTS (the honest-gap slice): `settings/planned.js` declares 171 `vmu.math.*` keys, the
// design volumes (09 formalization, 15 toolbox) explain them, and **almost none of them changed any
// behaviour** — the worst kind of wiring gap, because a reader believes the knob works. This module wires a
// FIRST BATCH (~45 keys) so that every one of them **changes an observable result**, and it NAMES every key
// it does not wire yet in `status().plannedKeys` **with the reason** — "read the key but change nothing" is
// forbidden here ✗✓.
//
// WHAT IT IS NOT: it does not compute. It is a guard/policy layer in front of a math surface that the CALLER
// injects (`spawn`), so `math-computation.js` / `math-engines.js` / `kernel/math.js` stay untouched (only
// referenced) and the layer works (planning-only, with named refusals) even with nothing injected.
//
// ENFORCEMENT ORDER (documented; `plan().enforced` lists the keys that actually fired):
//   op → network → workspace → resource caps → time limit → seed policy → backend → units → interval →
//   artifacts/quota → concurrency → cache lookup → (run) → result-conditional rails (certificates, sorry,
//   axioms, assistants, dimensions, residual, convergence, stability) → shaping (precision, log truncation,
//   warnings, receipts, repro pack, report).
//
// INVARIANTS (shared with the rest of the kernel)
//   · every refusal is NAMED (VMU_* + hint that names the KEY that governs the rule) — never a bare throw;
//   · every cap reports 现值/上限; every truncation/eviction/suppression is COUNTED (never silent);
//   · the only time source is the injected `clock`; the cache key is a deterministic hash (no randomness);
//   · READ paths (status/cache/receipts) never mutate recorded data;
//   · ZERO MECHANISM: with nothing declared, `plan()` still answers (using the documented defaults) and
//     `run()` refuses BY NAME when no `spawn` seam is injected — nothing crashes.
//
// SETTINGS: read as PLAIN LITERALS (the settings table/docs audit discover wired keys by scanning file text).
// The full wired list is exported as `WIRED_KEYS`; the complement (read from the generated
// `settings/planned.js` when present) is reported per key with a reason.
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** Every key this BATCH actually honours (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze([
  'vmu.math.sandbox.network', 'vmu.math.sandbox.memoryMb', 'vmu.math.sandbox.cpuMs', 'vmu.math.sandbox.wallMs', 'vmu.math.sandbox.threads',
  'vmu.math.jobs.maxParallel', 'vmu.math.jobs.dir', 'vmu.math.jobs.logMax', 'vmu.math.jobs.persist',
  'vmu.math.repro.requireSeed', 'vmu.math.repro.seed', 'vmu.math.repro.deterministic', 'vmu.math.repro.packOnSuccess',
  'vmu.math.cache.enabled', 'vmu.math.cache.maxEntries', 'vmu.math.cache.onCorrupt', 'vmu.math.cache.crossProject',
  'vmu.math.precision.digits', 'vmu.math.precision.mode', 'vmu.math.precision.rounding', 'vmu.math.precision.tolerance',
  'vmu.math.optim.timeLimitMs', 'vmu.math.optim.tolerance', 'vmu.math.optim.backend', 'vmu.math.optim.certificates',
  'vmu.math.formal.sorryPolicy', 'vmu.math.formal.coqTimeoutMs', 'vmu.math.formal.axiomAudit', 'vmu.math.formal.requireAll',
  'vmu.math.units.enabled', 'vmu.math.units.strictDimensions', 'vmu.math.units.constantsSource',
  'vmu.math.linalg.backend', 'vmu.math.linalg.requireResidual', 'vmu.math.linalg.sparse',
  'vmu.math.convergence.policy', 'vmu.math.numeric.warnings', 'vmu.math.numeric.stability',
  'vmu.math.artifacts.maxFileMb', 'vmu.math.artifacts.maxRuns', 'vmu.math.artifacts.maxAttemptsPerRun',
  'vmu.math.report.language', 'vmu.math.report.includeRepro', 'vmu.math.report.style',
  'vmu.math.interval.enabled',
])

/** Per-namespace reasons for the keys NOT wired yet (drift-proof: the list comes from planned.js at runtime;
 *  this table only explains WHY). The reasons are deliberately concrete — "no backend", "no consumer yet". */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.math.optim': '需要真实的求解器后端（LP/MIP/NLP/CP/全局/鲁棒/变分…）；本层只做策略与护栏，计算后端未接',
  'vmu.math.formal': '需要 Lean/Coq 适配器接缝；除 sorryPolicy/coqTimeoutMs/axiomAudit/requireAll 外的助手细节未接',
  'vmu.math.linalg': '需要数值后端与分解库；除 backend/requireResidual/sparse 外的分解/特征/预条件项未接',
  'vmu.math.units': '需要单位本体与量纲引擎；除 enabled/strictDimensions/constantsSource 外的常量/换算项未接',
  'vmu.math.stats': '需要统计后端（分布/检验/效应量/重采样）；未接',
  'vmu.math.bayes': '需要贝叶斯后端（先验/采样/收敛诊断）；未接',
  'vmu.math.discrete': '需要离散数学后端（组合/图论/整数规划）；未接',
  'vmu.math.nt': '需要数论后端（素性/分解/同余）；未接',
  'vmu.math.ode': '需要 ODE/PDE 求解器与步长控制；未接',
  'vmu.math.symbolic': '需要符号计算后端（CAS）；未接',
  'vmu.math.geom': '需要几何/计算几何后端；未接',
  'vmu.math.tensor': '需要张量后端；未接',
  'vmu.math.ad': '需要自动微分后端；未接',
  'vmu.math.interval': '区间算术后端未接（enabled 已接：关掉即拒绝区间请求）',
  'vmu.math.jobs': '除 maxParallel/dir/logMax/persist 外的作业编排项未接（需要真实作业队列）',
  'vmu.math.artifacts': '制品存储后端未接（maxFileMb/maxRuns/maxAttemptsPerRun 已接为策略上限）',
  'vmu.math.report': '除 language/includeRepro/style 外的排版/图表项未接（需要排版后端）',
  'vmu.math.cache': '除 enabled/maxEntries/onCorrupt/crossProject 外的缓存策略未接（跨项目共享需要存储层）',
  'vmu.math.repro': '除 requireSeed/seed/deterministic/packOnSuccess 外的复现打包未接（打包器属 07/22）',
  'vmu.math.precision': '除 digits/mode/rounding/tolerance 外的高精度算术未接（需要大数后端）',
  'vmu.math.convergence': '除 policy 外的收敛诊断未接',
  'vmu.math.numeric': '除 warnings/stability 外的数值特判未接',
  'vmu.math.sandbox': '除 network/memoryMb/cpuMs/wallMs/threads 外的沙箱细节未接（接缝由宿主提供）',
  'vmu.math.proof': '证明脚本生成未接（需要形式化后端）',
  'vmu.math.network': '外部知识库检索未接（见 16 卷 N11 适配层）',
})

const reasonFor = (key) => {
  const ns = key.split('.').slice(0, 3).join('.')
  return UNWIRED_REASONS[ns] || '尚未接线：本批只覆盖语义明确、可在策略层强制的一批键；该键需要一个计算后端或另一个子系统'
}

const DEFAULTS = Object.freeze({
  'vmu.math.sandbox.network': 'deny', 'vmu.math.sandbox.memoryMb': 0, 'vmu.math.sandbox.cpuMs': 0,
  'vmu.math.sandbox.wallMs': 0, 'vmu.math.sandbox.threads': 0,
  'vmu.math.jobs.maxParallel': 1, 'vmu.math.jobs.dir': '', 'vmu.math.jobs.logMax': 200, 'vmu.math.jobs.persist': false,
  'vmu.math.repro.requireSeed': false, 'vmu.math.repro.seed': null, 'vmu.math.repro.deterministic': false,
  'vmu.math.repro.packOnSuccess': false,
  'vmu.math.cache.enabled': false, 'vmu.math.cache.maxEntries': 100, 'vmu.math.cache.onCorrupt': 'recompute',
  'vmu.math.cache.crossProject': false,
  'vmu.math.precision.digits': 0, 'vmu.math.precision.mode': 'significant', 'vmu.math.precision.rounding': 'half-even',
  'vmu.math.precision.tolerance': 1e-9,
  'vmu.math.optim.timeLimitMs': 0, 'vmu.math.optim.tolerance': 1e-6, 'vmu.math.optim.backend': '',
  'vmu.math.optim.certificates': false,
  'vmu.math.formal.sorryPolicy': 'deny', 'vmu.math.formal.coqTimeoutMs': 0, 'vmu.math.formal.axiomAudit': false,
  'vmu.math.formal.requireAll': false,
  'vmu.math.units.enabled': true, 'vmu.math.units.strictDimensions': true, 'vmu.math.units.constantsSource': '',
  'vmu.math.linalg.backend': '', 'vmu.math.linalg.requireResidual': false, 'vmu.math.linalg.sparse': false,
  'vmu.math.convergence.policy': 'report', 'vmu.math.numeric.warnings': true, 'vmu.math.numeric.stability': 'report',
  'vmu.math.artifacts.maxFileMb': 0, 'vmu.math.artifacts.maxRuns': 0, 'vmu.math.artifacts.maxAttemptsPerRun': 0,
  'vmu.math.report.language': 'zh-Hans', 'vmu.math.report.includeRepro': true, 'vmu.math.report.style': 'plain',
  'vmu.math.interval.enabled': false,
})

const DENSE_SIZE_SOFT_CAP = 1000        // documented constant for `linalg.sparse=true` (dense-only refusal)

/** Append a key to an evaluation trail (mutates and returns the SAME array). It must mutate: the shaping
 *  rails call it as a statement, and a value-returning helper would silently become a no-op there (caught by
 *  the round-11 assertions — "read but not listed" is exactly the defect class being fixed). */
const evalKeyList = (list, key) => { if (!list.includes(key)) list.push(key); return list }

/** The rounding kernels (`vmu.math.precision.*`) — pure and deterministic.
 *  `fixed` counts digits AFTER the decimal point (0 ⇒ round to an integer); `significant` counts significant
 *  digits (>0 required; 0 ⇒ leave the value untouched, which is also the documented default). */
function roundTo(value, digits, mode, rounding) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  let factor
  if (mode === 'fixed') { if (!(digits >= 0)) return value; factor = Math.pow(10, digits) }
  else { if (!(digits > 0)) return value; factor = Math.pow(10, digits - 1 - Math.floor(Math.log10(Math.abs(value) || 1))) }
  const scaled = value * factor
  const floor = Math.floor(scaled)
  const frac = scaled - floor
  const eps = 1e-9
  let n
  if (rounding === 'floor') n = floor
  else if (rounding === 'ceil') n = frac > eps ? floor + 1 : floor
  else if (rounding === 'half-up') n = frac >= 0.5 - eps ? floor + 1 : floor
  else n = (frac > 0.5 + eps ? floor + 1 : frac < 0.5 - eps ? floor : (floor % 2 === 0 ? floor : floor + 1))   // half-even
  return Number((n / factor).toFixed(12))
}

/**
 * createMathTools — the knob-reading policy layer. Every dependency except `clock` is optional:
 * `spawn` (the computation seam), `library` (receipt persistence, 07), `log`/`bus` (advisory).
 */
export function createMathTools({ clock = () => 0, log = null, settings = {}, bus = null, spawn = null, library = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createMathTools needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* advisory */ } } }
  const emit = (event) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(event) } catch (e) { /* advisory */ } } }

  // ── the wired values (read as plain literals; H1 ⇒ they apply from the next turn) ────────────────────
  const K = {
    network: sget('vmu.math.sandbox.network'), memoryMb: num(sget('vmu.math.sandbox.memoryMb')), cpuMs: num(sget('vmu.math.sandbox.cpuMs')),
    wallMs: num(sget('vmu.math.sandbox.wallMs')), threads: num(sget('vmu.math.sandbox.threads')),
    maxParallel: num(sget('vmu.math.jobs.maxParallel'), 1), jobsDir: str(sget('vmu.math.jobs.dir')), logMax: num(sget('vmu.math.jobs.logMax'), 200),
    persist: sget('vmu.math.jobs.persist') === true,
    requireSeed: sget('vmu.math.repro.requireSeed') === true, seed: sget('vmu.math.repro.seed'), deterministic: sget('vmu.math.repro.deterministic') === true,
    packOnSuccess: sget('vmu.math.repro.packOnSuccess') === true,
    cacheEnabled: sget('vmu.math.cache.enabled') === true, cacheMax: num(sget('vmu.math.cache.maxEntries'), 100),
    cacheOnCorrupt: ['refuse', 'ignore', 'recompute'].includes(sget('vmu.math.cache.onCorrupt')) ? sget('vmu.math.cache.onCorrupt') : 'recompute',
    crossProject: sget('vmu.math.cache.crossProject') === true,
    digits: num(sget('vmu.math.precision.digits')), pMode: sget('vmu.math.precision.mode') === 'fixed' ? 'fixed' : 'significant',
    rounding: ['half-even', 'half-up', 'floor', 'ceil'].includes(sget('vmu.math.precision.rounding')) ? sget('vmu.math.precision.rounding') : 'half-even',
    pTolerance: numf(sget('vmu.math.precision.tolerance'), 1e-9),
    optimTimeLimitMs: num(sget('vmu.math.optim.timeLimitMs')), optimTolerance: numf(sget('vmu.math.optim.tolerance'), 1e-6),
    optimBackend: str(sget('vmu.math.optim.backend')), certificates: sget('vmu.math.optim.certificates') === true,
    sorryPolicy: sget('vmu.math.formal.sorryPolicy') === 'warn' ? 'warn' : 'deny', coqTimeoutMs: num(sget('vmu.math.formal.coqTimeoutMs')),
    axiomAudit: sget('vmu.math.formal.axiomAudit') === true, requireAll: sget('vmu.math.formal.requireAll') === true,
    unitsEnabled: sget('vmu.math.units.enabled') !== false, strictDimensions: sget('vmu.math.units.strictDimensions') !== false,
    constantsSource: str(sget('vmu.math.units.constantsSource')),
    linalgBackend: str(sget('vmu.math.linalg.backend')), requireResidual: sget('vmu.math.linalg.requireResidual') === true,
    sparse: sget('vmu.math.linalg.sparse') === true,
    convergence: sget('vmu.math.convergence.policy') === 'require' ? 'require' : 'report',
    warnings: sget('vmu.math.numeric.warnings') !== false, stability: sget('vmu.math.numeric.stability') === 'require' ? 'require' : 'report',
    maxFileMb: num(sget('vmu.math.artifacts.maxFileMb')), maxRuns: num(sget('vmu.math.artifacts.maxRuns')), maxAttempts: num(sget('vmu.math.artifacts.maxAttemptsPerRun')),
    language: str(sget('vmu.math.report.language')) || 'zh-Hans', includeRepro: sget('vmu.math.report.includeRepro') !== false,
    style: ['plain', 'markdown', 'json'].includes(sget('vmu.math.report.style')) ? sget('vmu.math.report.style') : 'plain',
    interval: sget('vmu.math.interval.enabled') === true,
  }
  function num(v, def = 0) { return Number.isFinite(v) ? v : def }
  function numf(v, def) { return typeof v === 'number' && Number.isFinite(v) ? v : def }
  function str(v) { return typeof v === 'string' ? v : '' }

  const counters = { planned: 0, ran: 0, refused: 0, cacheHits: 0, cacheStores: 0, cacheEvictions: 0, cacheCorrupt: 0, droppedLogLines: 0, droppedWarnings: 0, persisted: 0, persistSkipped: 0, refusedAtQuota: 0, rangeRuns: 0 }
  const refusals = new Map()
  const cache = new Map()
  const cacheOrder = []
  const receipts = []
  const receiptDropped = { n: 0 }
  let active = 0

  /**
   * Named refusal that ALWAYS carries the audit trail of the keys evaluated so far (round-11 reviewer: a
   * refusal with `enforced:null` is "rejected AND without proof" — the two must never coexist ✗✓).
   * `enforced` may be explicitly empty (`[]`) when no key was consulted yet, never `undefined`.
   */
  const deny = (code, message, hint, enforced) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    say({ type: 'mathtools/refused', at: clock(), code, message, enforced: keys })
    const e = refuse(code, message, hint)
    e.enforced = keys                       // ← the proof travels WITH the refusal
    e.evaluated = keys.slice()
    return e
  }
  const capRefusal = (code, label, value, cap, key, evaluated) => {
    // MUST throw: a cap helper that only counted would leave every upper-bound rail ineffective.
    const keys = (Array.isArray(evaluated) ? evaluated.slice() : [])
    if (!keys.includes(key)) keys.push(key)
    throw deny(code, label + ' exceeds ' + key + ': ' + value + ' > ' + cap,
      '现值=' + value + ', 上限=' + cap + ' (' + key + ')', keys)
  }

  const withinWorkspace = (p, root) => {
    if (!root) return true
    const a = resolve(String(p)); const b = resolve(root)
    return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep)
  }
  const cacheKeyOf = (req, plan) => createHash('sha256').update(JSON.stringify([
    req.op, req.args === undefined ? null : req.args, plan.seed, plan.backend,
    K.crossProject ? null : (req.workspace === undefined ? null : req.workspace),
  ])).digest('hex')

  /** The value record for every wired key (an EXPLICIT map — a name-derived lookup silently produced nulls). */
  const keysSnapshot = () => ({
    'vmu.math.sandbox.network': K.network, 'vmu.math.sandbox.memoryMb': K.memoryMb, 'vmu.math.sandbox.cpuMs': K.cpuMs,
    'vmu.math.sandbox.wallMs': K.wallMs, 'vmu.math.sandbox.threads': K.threads,
    'vmu.math.jobs.maxParallel': K.maxParallel, 'vmu.math.jobs.dir': K.jobsDir, 'vmu.math.jobs.logMax': K.logMax, 'vmu.math.jobs.persist': K.persist,
    'vmu.math.repro.requireSeed': K.requireSeed, 'vmu.math.repro.seed': K.seed, 'vmu.math.repro.deterministic': K.deterministic, 'vmu.math.repro.packOnSuccess': K.packOnSuccess,
    'vmu.math.cache.enabled': K.cacheEnabled, 'vmu.math.cache.maxEntries': K.cacheMax, 'vmu.math.cache.onCorrupt': K.cacheOnCorrupt, 'vmu.math.cache.crossProject': K.crossProject,
    'vmu.math.precision.digits': K.digits, 'vmu.math.precision.mode': K.pMode, 'vmu.math.precision.rounding': K.rounding, 'vmu.math.precision.tolerance': K.pTolerance,
    'vmu.math.optim.timeLimitMs': K.optimTimeLimitMs, 'vmu.math.optim.tolerance': K.optimTolerance, 'vmu.math.optim.backend': K.optimBackend, 'vmu.math.optim.certificates': K.certificates,
    'vmu.math.formal.sorryPolicy': K.sorryPolicy, 'vmu.math.formal.coqTimeoutMs': K.coqTimeoutMs, 'vmu.math.formal.axiomAudit': K.axiomAudit, 'vmu.math.formal.requireAll': K.requireAll,
    'vmu.math.units.enabled': K.unitsEnabled, 'vmu.math.units.strictDimensions': K.strictDimensions, 'vmu.math.units.constantsSource': K.constantsSource,
    'vmu.math.linalg.backend': K.linalgBackend, 'vmu.math.linalg.requireResidual': K.requireResidual, 'vmu.math.linalg.sparse': K.sparse,
    'vmu.math.convergence.policy': K.convergence, 'vmu.math.numeric.warnings': K.warnings, 'vmu.math.numeric.stability': K.stability,
    'vmu.math.artifacts.maxFileMb': K.maxFileMb, 'vmu.math.artifacts.maxRuns': K.maxRuns, 'vmu.math.artifacts.maxAttemptsPerRun': K.maxAttempts,
    'vmu.math.report.language': K.language, 'vmu.math.report.includeRepro': K.includeRepro, 'vmu.math.report.style': K.style,
    'vmu.math.interval.enabled': K.interval,
  })

  const api = {
    apiVersion,
    WIRED_KEYS, UNWIRED_REASONS,

    /**
     * READ-ONLY policy evaluation: no engine call, no state change beyond the refusal counters.
     * `enforced` lists the wired keys that actually fired for this request (auditable wiring ✗✓).
     */
    plan(req = {}) {
      counters.planned += 1
      // `enforced` is built INCREMENTALLY: every rail pushes its key(s) BEFORE its check runs, so a refusal
      // always carries the proof of exactly what had been evaluated up to that point (round-11 ruling ✗✓).
      const enforced = []
      const evalKey = (k) => { if (!enforced.includes(k)) enforced.push(k); return enforced }
      if (typeof req.op !== 'string' || !req.op) {
        throw deny('VMU_MATH_INVALID_INPUT', 'plan/run needs a non-empty `op`', 'e.g. { op: "optim/minimize", args: { … } }', enforced)
      }
      // ① NETWORK (vmu.math.sandbox.network)
      if (req.needsNetwork !== undefined) evalKey('vmu.math.sandbox.network')
      if (req.needsNetwork === true && !(K.network === true || K.network === 'allow')) {
        throw deny('VMU_NETWORK_DENIED', 'op "' + req.op + '" needs the network but vmu.math.sandbox.network denies it', 'set vmu.math.sandbox.network="allow" to permit egress (default "deny")', enforced)
      }
      // ② WORKSPACE (vmu.math.jobs.dir)
      if (K.jobsDir) {
        if (req.jobDir !== undefined) evalKey('vmu.math.jobs.dir')
        if (req.jobDir && !withinWorkspace(req.jobDir, K.jobsDir)) {
          throw deny('VMU_PATH_ESCAPE_REFUSED', 'jobDir escapes vmu.math.jobs.dir: ' + req.jobDir + ' not under ' + K.jobsDir, '现值=' + req.jobDir + ', 允许根=' + K.jobsDir, enforced)
        }
      }
      // ③ RESOURCE CAPS (sandbox.memoryMb / cpuMs / wallMs / threads) — a cap is listed when its comparison
      //    ran (the request carried the field), so "the rail was consulted" is visible on success too.
      for (const [key, field, cap] of [
        ['vmu.math.sandbox.memoryMb', 'memoryMb', K.memoryMb], ['vmu.math.sandbox.cpuMs', 'cpuMs', K.cpuMs],
        ['vmu.math.sandbox.wallMs', 'wallMs', K.wallMs], ['vmu.math.sandbox.threads', 'threads', K.threads],
      ]) {
        if (cap > 0 && req[field] !== undefined) {
          evalKey(key)
          if (num(req[field]) > cap) capRefusal('VMU_RESOURCE_BUDGET', field, num(req[field]), cap, key, enforced)
        }
      }
      // ④ TIME LIMIT (optim.timeLimitMs for optimisation ops, formal.coqTimeoutMs for formal ops)
      const formalOp = /^formal\//.test(req.op)
      const limitKey = formalOp ? 'vmu.math.formal.coqTimeoutMs' : 'vmu.math.optim.timeLimitMs'
      const limit = formalOp ? K.coqTimeoutMs : K.optimTimeLimitMs
      if (limit > 0 && req.timeoutMs !== undefined) evalKey(limitKey)
      if (limit > 0 && num(req.timeoutMs) > limit) {
        throw deny('VMU_TIMEOUT', 'timeoutMs exceeds ' + limitKey + ': ' + num(req.timeoutMs) + ' > ' + limit,
          '现值=' + num(req.timeoutMs) + 'ms, 上限=' + limit + 'ms (' + limitKey + ')', evalKey(limitKey))
      }
      // ⑤ SEED POLICY (repro.requireSeed / repro.seed / repro.deterministic)
      const seed = req.seed === undefined || req.seed === null ? K.seed : req.seed
      if (K.requireSeed) evalKey('vmu.math.repro.requireSeed')
      if (K.seed !== null && K.seed !== undefined && (req.seed === undefined || req.seed === null)) evalKey('vmu.math.repro.seed')
      if (K.deterministic) evalKey('vmu.math.repro.deterministic')
      if (K.requireSeed && (seed === undefined || seed === null)) {
        throw deny('VMU_MATH_INVALID_INPUT', 'this configuration requires a seed for every run (vmu.math.repro.requireSeed=true)',
          'vmu.math.repro.requireSeed=true: pass { seed: <int> } or set vmu.math.repro.seed — an unseeded run is not reproducible', enforced)
      }
      if (K.deterministic && (seed === undefined || seed === null || req.randomized === true)) {
        throw deny('VMU_MATH_INVALID_INPUT', 'vmu.math.repro.deterministic=true forbids nondeterministic runs',
          req.randomized === true ? 'the request asked for randomized:true — remove it' : 'no seed was given; pass { seed } or vmu.math.repro.seed', enforced)
      }
      // ⑥ BACKEND (optim.backend / linalg.backend)
      const backendKey = /^linalg\//.test(req.op) ? 'vmu.math.linalg.backend' : 'vmu.math.optim.backend'
      const declaredBackend = /^linalg\//.test(req.op) ? K.linalgBackend : K.optimBackend
      if (declaredBackend || req.backend !== undefined) evalKey(backendKey)
      if (declaredBackend && req.backend && req.backend !== declaredBackend) {
        throw deny('VMU_MATH_UNSUPPORTED_OP', 'requested backend "' + req.backend + '" is not the declared one',
          'declared=' + declaredBackend + ' (' + backendKey + '), requested=' + req.backend, enforced)
      }
      // ⑦ UNITS (units.enabled / units.constantsSource)
      const wantsUnits = req.units !== undefined || req.dimensions !== undefined
      if (wantsUnits || req.constantsSource !== undefined) evalKey('vmu.math.units.enabled')
      if (K.constantsSource && req.constantsSource !== undefined) evalKey('vmu.math.units.constantsSource')
      if (wantsUnits && !K.unitsEnabled) {
        throw deny('VMU_MATH_INVALID_INPUT', 'this configuration disables units (vmu.math.units.enabled=false)',
          'remove units/dimensions from the request, or set vmu.math.units.enabled=true', enforced)
      }
      if (K.constantsSource && req.constantsSource && req.constantsSource !== K.constantsSource) {
        throw deny('VMU_MATH_INVALID_INPUT', 'constantsSource differs from the declared one',
          'declared=' + K.constantsSource + ', requested=' + req.constantsSource + ' (vmu.math.units.constantsSource)', enforced)
      }
      // ⑧ INTERVAL (interval.enabled)
      if (req.interval !== undefined) evalKey('vmu.math.interval.enabled')
      if (req.interval === true && !K.interval) {
        throw deny('VMU_MATH_INVALID_INPUT', 'interval arithmetic is disabled (vmu.math.interval.enabled=false)',
          'set vmu.math.interval.enabled=true, or drop the interval request', enforced)
      }
      // ⑨ ARTIFACTS / QUOTA (artifacts.maxRuns / maxAttemptsPerRun)
      if (K.maxRuns > 0) {
        evalKey('vmu.math.artifacts.maxRuns')
        if (counters.rangeRuns >= K.maxRuns) {
          counters.refusedAtQuota += 1
          throw deny('VMU_QUOTA_EXCEEDED', 'artifact run quota reached: ' + counters.rangeRuns + '/' + K.maxRuns,
            '现值=' + counters.rangeRuns + ', 上限=' + K.maxRuns + ' (vmu.math.artifacts.maxRuns)', enforced)
        }
      }
      if (K.maxAttempts > 0 && req.retries !== undefined) {
        evalKey('vmu.math.artifacts.maxAttemptsPerRun')
        if (num(req.retries) > K.maxAttempts) capRefusal('VMU_RESOURCE_BUDGET', 'retries', num(req.retries), K.maxAttempts, 'vmu.math.artifacts.maxAttemptsPerRun', enforced)
      }
      // ⑩ CONCURRENCY (jobs.maxParallel) — the comparison runs on EVERY plan, so the key is always listed.
      evalKey('vmu.math.jobs.maxParallel')
      if (active >= K.maxParallel) capRefusal('VMU_RESOURCE_BUDGET', 'active runs', active, K.maxParallel, 'vmu.math.jobs.maxParallel', enforced)
      // ⑪ SPARSE POLICY (linalg.sparse)
      if (K.sparse && req.dense !== undefined) evalKey('vmu.math.linalg.sparse')
      if (K.sparse && req.dense === true && num(req.size) > DENSE_SIZE_SOFT_CAP) {
        throw deny('VMU_RESOURCE_BUDGET', 'dense-only request above the sparse policy cap: size ' + num(req.size),
          '现值=' + num(req.size) + ', 上限=' + DENSE_SIZE_SOFT_CAP + ' (vmu.math.linalg.sparse=true ⇒ sparse required)', enforced)
      }
      if (K.cacheEnabled) evalKey('vmu.math.cache.enabled')
      const plan = { op: req.op, args: req.args === undefined ? null : req.args, seed: seed === undefined ? null : seed, backend: req.backend || declaredBackend || null, workspace: req.workspace === undefined ? null : req.workspace, enforced, at: clock() }
      plan.cacheKey = cacheKeyOf(req, plan)
      const hit = K.cacheEnabled ? cache.get(plan.cacheKey) : undefined
      if (hit !== undefined && hit.corrupt) {
        counters.cacheCorrupt += 1
        evalKey('vmu.math.cache.onCorrupt')
        if (K.cacheOnCorrupt === 'refuse') {
          throw deny('VMU_STATE', 'the cached entry for this request is CORRUPT and vmu.math.cache.onCorrupt="refuse"',
            'clean the cache (or set vmu.math.cache.onCorrupt="recompute")', enforced)
        }
      }
      plan.cached = K.cacheEnabled && hit !== undefined && !hit.corrupt
      say({ type: 'mathtools/planned', at: plan.at, op: plan.op, cacheKey: plan.cacheKey, cached: plan.cached, enforced })
      return { ok: true, plan, limits: { memoryMb: K.memoryMb, cpuMs: K.cpuMs, wallMs: K.wallMs, threads: K.threads, timeLimitMs: limit, maxParallel: K.maxParallel }, enforced }
    },

    /**
     * Run through the injected `spawn` seam and apply the result-conditional rails + shaping.
     * Every refusal names the KEY that governs it; every drop (log lines, warnings, receipt ring) is counted.
     */
    run(req = {}) {
      const p = api.plan(req)
      const at = clock()
      if (p.plan.cached) {
        counters.cacheHits += 1
        const hit = cache.get(p.plan.cacheKey)
        const receipt = Object.assign({}, hit.receipt, { at, cached: true })
        pushReceipt(receipt)
        say({ type: 'mathtools/cache-hit', at, cacheKey: p.plan.cacheKey })
        return { ok: true, cached: true, result: hit.result, receipt, enforced: p.enforced.concat(['vmu.math.cache.enabled']) }
      }
      if (typeof spawn !== 'function') {
        throw deny('VMU_ENGINE_UNAVAILABLE', 'no computation seam is injected: mathtools only PLAYS POLICY',
          'inject { spawn } (the existing math surface) to execute; plan() works without it', p.enforced)
      }
      active += 1
      counters.rangeRuns += 1
      let raw
      try { raw = spawn({ op: p.plan.op, args: p.plan.args, seed: p.plan.seed, backend: p.plan.backend, limits: p.limits }) } finally { active -= 1 }
      if (!raw || typeof raw !== 'object') throw deny('VMU_ENGINE_UNAVAILABLE', 'the injected seam returned no result object', 'spawn must return { ok, result, … }', p.enforced)
      const result = raw.result === undefined ? null : raw.result
      const enforced = p.enforced.slice()
      // ⑫ RESULT-CONDITIONAL RAILS (each one belongs to a wired key)
      if (K.certificates && !(raw.certificate || (result && result.certificate))) {
        throw deny('VMU_STATE', 'vmu.math.optim.certificates=true requires a certificate for every accepted run',
          'the seam returned no certificate — a verified optimum must come with its evidence', evalKeyList(enforced, 'vmu.math.optim.certificates'))
      }
      if (K.sorryPolicy === 'deny' && (raw.sorry === true || (result && result.sorry === true))) {
        throw deny('VMU_FORMAL_SORRY_FOUND', 'the proof still contains `sorry`/`admit` and vmu.math.formal.sorryPolicy="deny"',
          'sorry is NOT a proof (it is not a compile failure either): fill it, or set sorryPolicy="warn"', evalKeyList(enforced, 'vmu.math.formal.sorryPolicy'))
      }
      if (K.axiomAudit && Array.isArray(raw.axioms) && raw.axioms.length > 0) {
        throw deny('VMU_FORMAL_AXIOM_UNTRUSTED', 'the proof uses untrusted axioms: ' + raw.axioms.join(', '),
          'vmu.math.formal.axiomAudit=true refuses proofs outside the trust boundary', evalKeyList(enforced, 'vmu.math.formal.axiomAudit'))
      }
      if (K.requireAll && Array.isArray(raw.assistants) && Array.isArray(raw.expectedAssistants)) {
        const missing = raw.expectedAssistants.filter((a) => !raw.assistants.includes(a))
        if (missing.length) {
          throw deny('VMU_FORMAL_ADAPTER_UNSUPPORTED', 'vmu.math.formal.requireAll=true but these assistants did not run: ' + missing.join(', '),
            '现值=' + raw.assistants.length + '/' + raw.expectedAssistants.length + ' (vmu.math.formal.requireAll)', evalKeyList(enforced, 'vmu.math.formal.requireAll'))
        }
      }
      if (K.strictDimensions && raw.dimensionMismatch === true) {
        throw deny('VMU_MATH_DIMENSION_MISMATCH', 'the result carries a dimension mismatch and vmu.math.units.strictDimensions=true',
          raw.dimensionDetail || '两侧量纲不一致（vmu.math.units.strictDimensions）', evalKeyList(enforced, 'vmu.math.units.strictDimensions'))
      }
      if (K.requireResidual && !(raw.residual !== undefined && raw.residual !== null)) {
        throw deny('VMU_STATE', 'vmu.math.linalg.requireResidual=true requires a residual on every solve',
          'the seam returned no residual: a solve without an error estimate is not evidence', evalKeyList(enforced, 'vmu.math.linalg.requireResidual'))
      }
      if (K.convergence === 'require' && raw.converged === false) {
        throw deny('VMU_STATE', 'vmu.math.convergence.policy="require" refuses a run that did not converge',
          'the seam reported converged=false (proposed code name: VMU_MATH_NOT_CONVERGED — not registered yet)', evalKeyList(enforced, 'vmu.math.convergence.policy'))
      }
      if (K.stability === 'require' && raw.unstable === true) {
        throw deny('VMU_STATE', 'vmu.math.numeric.stability="require" refuses an unstable result',
          'the seam flagged the result as unstable (vmu.math.numeric.stability)', evalKeyList(enforced, 'vmu.math.numeric.stability'))
      }
      if (K.maxFileMb > 0) {
        const mb = num(raw.artifactMb)
        if (mb > K.maxFileMb) capRefusal('VMU_RESOURCE_BUDGET', 'artifact size (MB)', mb, K.maxFileMb, 'vmu.math.artifacts.maxFileMb', enforced)
      }
      // ⑬ SHAPING (precision / tolerance / logs / warnings / receipts / repro / report)
      //     EVERY key whose read changes THIS result is recorded here (the round-11 criterion, applied to
      //     the whole shaping path — not only to the rails the reviewer happened to probe).
      const tolerance = /^optim\//.test(p.plan.op) ? K.optimTolerance : K.pTolerance
      evalKeyList(enforced, /^optim\//.test(p.plan.op) ? 'vmu.math.optim.tolerance' : 'vmu.math.precision.tolerance')
      const delta = numf(raw.delta, null)
      const converged = delta === null ? (raw.converged === undefined ? null : raw.converged === true) : Math.abs(delta) <= tolerance
      const rounds = K.digits > 0
      if (rounds) for (const k of ['vmu.math.precision.digits', 'vmu.math.precision.mode', 'vmu.math.precision.rounding']) evalKeyList(enforced, k)
      const value = result && typeof result.value === 'number' ? roundTo(result.value, K.digits, K.pMode, K.rounding) : (result ? result.value : null)
      const shaped = Object.assign({}, result, value === undefined ? {} : { value })
      evalKeyList(enforced, 'vmu.math.jobs.persist')          // decides detail kept + whether the library is written
      if (K.packOnSuccess) evalKeyList(enforced, 'vmu.math.repro.packOnSuccess')
      if (K.cacheEnabled) evalKeyList(enforced, 'vmu.math.cache.crossProject')   // it shaped the cache key
      for (const k of ['vmu.math.report.language', 'vmu.math.report.style', 'vmu.math.report.includeRepro']) evalKeyList(enforced, k)
      let logLines = Array.isArray(raw.logLines) ? raw.logLines.slice() : []
      if (logLines.length > K.logMax) {
        const dropped = logLines.length - K.logMax
        counters.droppedLogLines += dropped
        logLines = logLines.slice(-K.logMax)
        enforced.push('vmu.math.jobs.logMax')
      }
      let warnings = Array.isArray(raw.warnings) ? raw.warnings.slice() : []
      if (!K.warnings && warnings.length) {
        counters.droppedWarnings += warnings.length
        warnings = []
        enforced.push('vmu.math.numeric.warnings')
      }
      const receipt = {
        at, op: p.plan.op, seed: p.plan.seed, backend: p.plan.backend, cacheKey: p.plan.cacheKey,
        value: shaped ? shaped.value : null, converged, tolerance, delta,
        log: K.persist ? logLines : undefined, logLines: logLines.length,
        warnings, warningsDropped: !K.warnings && Array.isArray(raw.warnings) ? raw.warnings.length : 0,
        language: K.language, style: K.style,
      }
      if (!K.persist) { counters.persistSkipped += 1; receipt.keptDetail = false } else { counters.persist += 1; receipt.keptDetail = true }
      if (K.packOnSuccess) receipt.reproPack = { seed: p.plan.seed, cacheKey: p.plan.cacheKey, op: p.plan.op, argsHash: createHash('sha256').update(JSON.stringify(p.plan.args)).digest('hex').slice(0, 16) }
      receipt.rendered = render(receipt, K)
      if (!K.includeRepro) { delete receipt.renderedRepro; receipt.reproInReport = false } else { receipt.reproInReport = !!receipt.reproPack }
      // persist the receipt through the LIBRARY seam (07) when asked; counted either way
      if (K.persist) {
        if (library && typeof library.append === 'function') { try { library.append({ kind: 'math-run', statement: p.plan.op, proof: JSON.stringify({ cacheKey: p.plan.cacheKey, seed: p.plan.seed }) }) } catch (e) { counters.persistFailed = (counters.persistFailed || 0) + 1 } }
        else counters.persistUnwired = (counters.persistUnwired || 0) + 1
      }
      if (K.cacheEnabled) store(p.plan.cacheKey, { result: shaped, receipt })
      if (K.cacheEnabled && counters.cacheEvictions > 0) evalKeyList(enforced, 'vmu.math.cache.maxEntries')   // an eviction changed the cache
      counters.ran += 1
      pushReceipt(receipt)
      emit({ type: 'mathtools/ran', at, op: p.plan.op, cacheKey: p.plan.cacheKey })
      say({ type: 'mathtools/ran', at, op: p.plan.op, enforced })
      return { ok: true, cached: false, result: shaped, receipt, enforced }
    },

    /** Ops maintenance: mark a cache entry corrupt (a partially written entry is a real failure mode).
     *  The mark only changes behaviour through `vmu.math.cache.onCorrupt` — that is what makes the key wired. */
    cacheMarkCorrupt({ cacheKey, why = 'marked corrupt' } = {}) {
      if (typeof cacheKey !== 'string' || !cacheKey) throw deny('VMU_INVALID_ARGUMENT', 'cacheMarkCorrupt needs a cacheKey', 'take it from a receipt\'s cacheKey / plan().plan.cacheKey')
      const hit = cache.get(cacheKey)
      if (!hit) throw deny('VMU_NO_SUCH_OBJECT', 'no cache entry: ' + cacheKey, 'run the op with vmu.math.cache.enabled=true first')
      hit.corrupt = true
      say({ type: 'mathtools/cache-corrupt', at: clock(), cacheKey, why })
      return { ok: true, marked: cacheKey, why, onCorrupt: K.cacheOnCorrupt }
    },

    /** READ-ONLY: what is cached (bounded view; drops are counted). */
    cacheView({ limit = 50 } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : 50
      const all = cacheOrder.slice()
      const kept = all.slice(Math.max(0, all.length - cap))
      return { ok: true, entries: kept.map((k) => ({ cacheKey: k, corrupt: !!cache.get(k).corrupt })), count: kept.length, available: all.length, dropped: all.length - kept.length, evictions: counters.cacheEvictions, maxEntries: K.cacheMax, crossProject: K.crossProject }
    },
    /** READ-ONLY: the receipt ring (bounded; drops counted). */
    receiptsView({ limit = 50 } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : 50
      const kept = receipts.slice(Math.max(0, receipts.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, receipts: kept, count: kept.length, available: receipts.length, dropped: receipts.length - kept.length, ringDropped: receiptDropped.n, persisted: K.persist }
    },

    /** READ-ONLY self-report: the WIRED list, the UNWIRED list (per key + reason), the counters, the caps. */
    status() {
      const planned = plannedKeys()
      const wired = WIRED_KEYS.slice()
      const overlap = planned.keys.filter((k) => wired.includes(k))
      return {
        ok: true, apiVersion,
        wired, wiredCount: wired.length,
        plannedKeys: planned.keys, plannedCount: planned.keys.length, plannedSource: planned.source,
        unwiredReasons: Object.fromEntries(planned.keys.map((k) => [k, reasonFor(k)])),
        complementOk: overlap.length === 0 && planned.keys.length + wired.length === planned.declaredMathKeys,
        overlap,
        declaredMathKeys: planned.declaredMathKeys,
        limits: { memoryMb: K.memoryMb, cpuMs: K.cpuMs, wallMs: K.wallMs, threads: K.threads, maxParallel: K.maxParallel, maxRuns: K.maxRuns, maxFileMb: K.maxFileMb, maxAttemptsPerRun: K.maxAttempts },
        policy: { network: K.network, seedRequired: K.requireSeed, deterministic: K.deterministic, cacheEnabled: K.cacheEnabled, crossProject: K.crossProject, onCorrupt: K.cacheOnCorrupt, sorryPolicy: K.sorryPolicy, strictDimensions: K.strictDimensions, convergence: K.convergence, stability: K.stability, style: K.style, language: K.language },
        keys: keysSnapshot(),
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        cache: { entries: cache.size, maxEntries: K.cacheMax, evictions: counters.cacheEvictions, hits: counters.cacheHits, corrupt: counters.cacheCorrupt },
        receipts: { kept: receipts.length, ringDropped: receiptDropped.n, persist: K.persist },
        at: clock(),
        note: 'every key in `wired` changes an observable result (asserted by tests/vmu-mathtools.test.mjs); every key in `plannedKeys` is NOT wired yet and carries its reason — reading a key without changing behaviour is forbidden here',
      }
    },
  }

  // ── helpers that touch only local state ─────────────────────────────────────────────────────────────
  function pushReceipt(receipt) {
    receipts.push(receipt)
    while (receipts.length > 200) { receipts.shift(); receiptDropped.n += 1 }
  }
  function store(key, entry) {
    cache.set(key, entry); cacheOrder.push(key); counters.cacheStores += 1
    while (cacheOrder.length > K.cacheMax) { const k = cacheOrder.shift(); cache.delete(k); counters.cacheEvictions += 1 }
  }
  function render(receipt, k) {
    const label = String(k.language).startsWith('zh') ? { value: '结果', converged: '收敛', seed: '种子' } : { value: 'value', converged: 'converged', seed: 'seed' }
    if (k.style === 'json') return JSON.stringify({ [label.value]: receipt.value, [label.converged]: receipt.converged, [label.seed]: receipt.seed })
    if (k.style === 'markdown') return '**' + label.value + '**: `' + String(receipt.value) + '` · **' + label.converged + '**: ' + String(receipt.converged)
    return label.value + '=' + String(receipt.value) + ' ' + label.converged + '=' + String(receipt.converged)
  }
  /** The declared `vmu.math.*` universe, read from the generated registry (read-only); never guessed. */
  function plannedKeys() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      if (!existsSync(p)) return { keys: [], source: 'unavailable', declaredMathKeys: WIRED_KEYS.length }
      const text = readFileSync(p, 'utf8')
      const all = [...new Set([...text.matchAll(/key: "(vmu\.math\.[^"]+)"/g)].map((m) => m[1]))].sort()
      const keys = all.filter((k) => !WIRED_KEYS.includes(k))
      return { keys, source: 'settings/planned.js', declaredMathKeys: all.length }
    } catch (e) {
      return { keys: [], source: 'error:' + String((e && e.message) || e), declaredMathKeys: WIRED_KEYS.length }
    }
  }

  return api
}
