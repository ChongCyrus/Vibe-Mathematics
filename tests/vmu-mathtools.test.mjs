#!/usr/bin/env node
// vmu MATHTOOLS — the guard for kernel/mathtools.js (the `vmu.math.*` knob batch).
//
// WHAT THIS PROVES — for EVERY wired key, at least one POSITIVE and one NEGATIVE assertion, i.e. the key
// changes an observable result (no "read the key, change nothing" ✗):
//   sandbox: network/memoryMb/cpuMs/wallMs/threads · jobs: maxParallel/dir/logMax/persist ·
//   repro: requireSeed/seed/deterministic/packOnSuccess · cache: enabled/maxEntries/onCorrupt/crossProject ·
//   precision: digits/mode/rounding/tolerance · optim: timeLimitMs/tolerance/backend/certificates ·
//   formal: sorryPolicy/coqTimeoutMs/axiomAudit/requireAll · units: enabled/strictDimensions/constantsSource ·
//   linalg: backend/requireResidual/sparse · convergence.policy · numeric: warnings/stability ·
//   artifacts: maxFileMb/maxRuns/maxAttemptsPerRun · report: language/includeRepro/style · interval.enabled
// Plus: WIRED ↔ plannedKeys are COMPLEMENTARY (no overlap, union = the declared universe), determinism under
// the injected clock, zero mechanism (plan works, run refuses by name), and refusal counters by code.
import { createMathTools, WIRED_KEYS, UNWIRED_REASONS } from '../vibe-math-vmu/kernel/mathtools.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

/** Build a runtime: settings overrides + optional spawn/library seams + optional clock. */
const mk = ({ settings = {}, seam = null, library = null, clock = () => 1000 } = {}) => {
  const calls = { spawn: 0, appends: 0 }
  const spawn = (req) => {
    calls.spawn += 1
    if (typeof seam === 'function') return seam(req, calls)
    return { ok: true, result: { value: 42 }, logLines: [], warnings: [], durationMs: 1 }
  }
  const lib = library === null ? { append: () => { calls.appends += 1; return { ok: true, id: 'r-' + calls.appends } } } : library
  const t = createMathTools({ clock, settings, spawn, library: lib })
  return { t, calls }
}
const opt = { 'vmu.math.optim.backend': 'ipopt' }

// ---- sandbox: network / memoryMb / cpuMs / wallMs / threads ---------------------------------------
{
  const deny = mk({ settings: { 'vmu.math.sandbox.network': 'deny' } })
  ok(codeOf(() => deny.t.plan({ op: 'stats/mean', needsNetwork: true })) === 'VMU_NETWORK_DENIED',
    'sandbox.network[-]: needsNetwork is refused with VMU_NETWORK_DENIED')
  const allow = mk({ settings: { 'vmu.math.sandbox.network': 'allow' } })
  ok(allow.t.plan({ op: 'stats/mean', needsNetwork: true }).ok === true, 'sandbox.network[+]: "allow" permits egress')
  for (const [key, field] of [['vmu.math.sandbox.memoryMb', 'memoryMb'], ['vmu.math.sandbox.cpuMs', 'cpuMs'], ['vmu.math.sandbox.wallMs', 'wallMs'], ['vmu.math.sandbox.threads', 'threads']]) {
    const over = mk({ settings: { [key]: 10 } })
    ok(codeOf(() => over.t.plan({ op: 'stats/mean', [field]: 20 })) === 'VMU_RESOURCE_BUDGET', key + '[-]: over the cap is refused')
    ok(over.t.plan({ op: 'stats/mean', [field]: 5 }).ok === true, key + '[+]: under the cap passes')
    const e = errOf(() => over.t.plan({ op: 'stats/mean', [field]: 20 }))
    ok(/现值=20/.test(String(e.hint)) && /上限=10/.test(String(e.hint)), key + '[]: the refusal gives 现值/上限', e.hint)
  }
}

// ---- jobs: maxParallel / dir / logMax / persist ---------------------------------------------------
{
  // maxParallel: a nested plan during an active run sees `active >= cap`
  const nested = []
  const one = mk({ settings: { 'vmu.math.jobs.maxParallel': 1 }, seam: () => { try { nested.push(one.t.plan({ op: 'x' }).ok) } catch (e) { nested.push(e.code) }; return { ok: true, result: { value: 1 } } } })
  one.t.run({ op: 'stats/mean' })
  ok(nested[0] === 'VMU_RESOURCE_BUDGET', 'jobs.maxParallel[-]: a nested run at cap 1 is refused', JSON.stringify(nested))
  const three = mk({ settings: { 'vmu.math.jobs.maxParallel': 3 }, seam: () => { try { nested.push(three.t.plan({ op: 'x' }).ok) } catch (e) { nested.push(e.code) }; return { ok: true, result: { value: 1 } } } })
  three.t.run({ op: 'stats/mean' })
  ok(nested[1] === true, 'jobs.maxParallel[+]: at cap 3 the nested plan passes')
  // dir
  const root = process.cwd()
  const dirs = mk({ settings: { 'vmu.math.jobs.dir': root } })
  ok(codeOf(() => dirs.t.plan({ op: 'stats/mean', jobDir: root + '/../outside' })) === 'VMU_PATH_ESCAPE_REFUSED',
    'jobs.dir[-]: a jobDir escaping the configured root is refused')
  ok(dirs.t.plan({ op: 'stats/mean', jobDir: root + '/inside' }).ok === true, 'jobs.dir[+]: an inside jobDir passes')
  // logMax (detail kept only when persist=true)
  const logs = mk({ settings: { 'vmu.math.jobs.logMax': 2, 'vmu.math.jobs.persist': true }, seam: () => ({ ok: true, result: { value: 1 }, logLines: ['a', 'b', 'c', 'd', 'e'] }) })
  const lr = logs.t.run({ op: 'stats/mean' })
  ok(lr.receipt.log.length === 2 && lr.receipt.logLines === 2 && logs.t.status().counters.droppedLogLines === 3,
    'jobs.logMax[+]: the log is capped AND the drops are counted', JSON.stringify({ kept: lr.receipt.log.length, dropped: logs.t.status().counters.droppedLogLines }))
  ok(lr.enforced.includes('vmu.math.jobs.logMax'), 'jobs.logMax[]: the key appears in `enforced` (auditable wiring)')
  const bigLog = mk({ settings: { 'vmu.math.jobs.logMax': 10, 'vmu.math.jobs.persist': true }, seam: () => ({ ok: true, result: { value: 1 }, logLines: ['a', 'b'] }) })
  ok(bigLog.t.run({ op: 'stats/mean' }).receipt.log.length === 2, 'jobs.logMax[-]: under the cap nothing is dropped')
  // persist
  const keep = mk({ settings: { 'vmu.math.jobs.persist': true } })
  keep.t.run({ op: 'stats/mean' })
  ok(keep.calls.appends === 1 && keep.t.receiptsView().receipts[0].keptDetail === true,
    'jobs.persist[+]: the receipt is persisted through the library seam and keeps detail')
  const skip = mk({ settings: { 'vmu.math.jobs.persist': false } })
  const sr = skip.t.run({ op: 'stats/mean' })
  ok(skip.calls.appends === 0 && sr.receipt.keptDetail === false && sr.receipt.log === undefined && skip.t.status().counters.persistSkipped >= 1,
    'jobs.persist[-]: with persist=false the library is NOT written and the detail is not kept (only counts)')
}

// ---- repro: requireSeed / seed / deterministic / packOnSuccess ------------------------------------
{
  const req = mk({ settings: { 'vmu.math.repro.requireSeed': true } })
  const e = errOf(() => req.t.plan({ op: 'stats/mean' }))
  ok(e && e.code === 'VMU_MATH_INVALID_INPUT' && /requireSeed/.test(String(e.hint)),
    'repro.requireSeed[-]: an unseeded run is refused and the hint names the key', e && e.hint)
  ok(req.t.plan({ op: 'stats/mean', seed: 7 }).ok === true, 'repro.requireSeed[+]: with a seed the plan passes')
  const configured = mk({ settings: { 'vmu.math.repro.seed': 12345 } })
  ok(configured.t.plan({ op: 'stats/mean' }).plan.seed === 12345, 'repro.seed[+]: the configured seed is applied to the plan')
  ok(configured.t.run({ op: 'stats/mean' }).receipt.seed === 12345, 'repro.seed[]: the receipt carries the applied seed')
  const none = mk({})
  ok(none.t.plan({ op: 'stats/mean' }).plan.seed === null, 'repro.seed[-]: with no key and no request seed the plan seed is null')
  const det = mk({ settings: { 'vmu.math.repro.deterministic': true } })
  ok(codeOf(() => det.t.plan({ op: 'stats/mean', seed: 1, randomized: true })) === 'VMU_MATH_INVALID_INPUT',
    'repro.deterministic[-]: a randomized request is refused when determinism is on')
  ok(det.t.plan({ op: 'stats/mean', seed: 1 }).ok === true, 'repro.deterministic[+]: a seeded deterministic run passes')
  ok(codeOf(() => det.t.plan({ op: 'stats/mean' })) === 'VMU_MATH_INVALID_INPUT', 'repro.deterministic[]: an unseeded run is refused too')
  const pack = mk({ settings: { 'vmu.math.repro.packOnSuccess': true } })
  ok(!!pack.t.run({ op: 'stats/mean', seed: 3 }).receipt.reproPack, 'repro.packOnSuccess[+]: the receipt carries a repro pack')
  ok(mk({}).t.run({ op: 'stats/mean', seed: 3 }).receipt.reproPack === undefined, 'repro.packOnSuccess[-]: without the key there is no pack')
}

// ---- cache: enabled / maxEntries / onCorrupt / crossProject ---------------------------------------
{
  const on = mk({ settings: { 'vmu.math.cache.enabled': true } })
  on.t.run({ op: 'stats/mean', args: { a: 1 } })
  const second = on.t.run({ op: 'stats/mean', args: { a: 1 } })
  ok(second.cached === true && on.calls.spawn === 1 && on.t.status().cache.hits === 1,
    'cache.enabled[+]: an identical request hits the cache and the seam is NOT called twice', JSON.stringify({ cached: second.cached, spawn: on.calls.spawn }))
  const off = mk({ settings: { 'vmu.math.cache.enabled': false } })
  off.t.run({ op: 'stats/mean', args: { a: 1 } })
  ok(off.t.run({ op: 'stats/mean', args: { a: 1 } }).cached === false && off.calls.spawn === 2,
    'cache.enabled[-]: with the cache off the seam runs every time')
  const cap = mk({ settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.maxEntries': 1 } })
  cap.t.run({ op: 'stats/mean', args: { a: 1 } })
  cap.t.run({ op: 'stats/mean', args: { a: 2 } })
  ok(cap.t.status().cache.evictions === 1 && cap.t.cacheView().available <= 1,
    'cache.maxEntries[+]: exceeding the cap EVICTS and the eviction is counted')
  const roomy = mk({ settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.maxEntries': 100 } })
  roomy.t.run({ op: 'stats/mean', args: { a: 1 } })
  roomy.t.run({ op: 'stats/mean', args: { a: 2 } })
  ok(roomy.t.status().cache.evictions === 0, 'cache.maxEntries[-]: under the cap nothing is evicted')
  // onCorrupt: mark an entry corrupt, then compare 'refuse' vs 'recompute'
  const mkCorrupt = (onCorrupt) => {
    const r = mk({ settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.onCorrupt': onCorrupt } })
    const run = r.t.run({ op: 'stats/mean', args: { q: 1 } })
    r.t.cacheMarkCorrupt({ cacheKey: run.receipt.cacheKey, why: 'test' })
    return r
  }
  const refuse = mkCorrupt('refuse')
  ok(codeOf(() => refuse.t.plan({ op: 'stats/mean', args: { q: 1 } })) === 'VMU_STATE',
    'cache.onCorrupt[-]: a corrupt entry is refused by name when onCorrupt="refuse"')
  const recompute = mkCorrupt('recompute')
  ok(recompute.t.plan({ op: 'stats/mean', args: { q: 1 } }).plan.cached === false && recompute.t.status().cache.corrupt === 1,
    'cache.onCorrupt[+]: with "recompute" the corrupt entry is skipped and the corruption is counted')
  const local = mk({ settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.crossProject': false } })
  const keyA = local.t.plan({ op: 'stats/mean', workspace: 'proj-a' }).plan.cacheKey
  const keyB = local.t.plan({ op: 'stats/mean', workspace: 'proj-b' }).plan.cacheKey
  ok(keyA !== keyB, 'cache.crossProject[-]: with crossProject=false the key depends on the workspace')
  const cross = mk({ settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.crossProject': true } })
  ok(cross.t.plan({ op: 'stats/mean', workspace: 'proj-a' }).plan.cacheKey === cross.t.plan({ op: 'stats/mean', workspace: 'proj-b' }).plan.cacheKey,
    'cache.crossProject[+]: with crossProject=true the key is shared across workspaces')
}

// ---- precision: digits / mode / rounding / tolerance ----------------------------------------------
{
  const d3 = mk({ settings: { 'vmu.math.precision.digits': 3, 'vmu.math.precision.mode': 'significant' }, seam: () => ({ ok: true, result: { value: 1234.5678 } }) })
  ok(d3.t.run({ op: 'stats/mean' }).result.value === 1230, 'precision.digits[+]: 3 significant digits round 1234.5678 → 1230', String(d3.t.run({ op: 'stats/mean' }).result.value))
  const d0 = mk({ seam: () => ({ ok: true, result: { value: 1234.5678 } }) })
  ok(d0.t.run({ op: 'stats/mean' }).result.value === 1234.5678, 'precision.digits[-]: digits=0 leaves the value untouched')
  const fixed = mk({ settings: { 'vmu.math.precision.digits': 2, 'vmu.math.precision.mode': 'fixed' }, seam: () => ({ ok: true, result: { value: 12345.6789 } }) })
  ok(fixed.t.run({ op: 'stats/mean' }).result.value === 12345.68, 'precision.mode[+]: "fixed" keeps 2 decimal places', String(fixed.t.run({ op: 'stats/mean' }).result.value))
  const sig = mk({ settings: { 'vmu.math.precision.digits': 2, 'vmu.math.precision.mode': 'significant' }, seam: () => ({ ok: true, result: { value: 12345.6789 } }) })
  ok(sig.t.run({ op: 'stats/mean' }).result.value === 12000, 'precision.mode[-]: "significant" rounds to 2 significant digits', String(sig.t.run({ op: 'stats/mean' }).result.value))
  // `fixed` counts digits AFTER the decimal point, so digits=0 rounds to an integer (the mode removes the
  // ambiguity with `significant`, where 0 means "leave the value untouched" — see the d0 case above).
  const round = (rounding, value) => mk({ settings: { 'vmu.math.precision.digits': 0, 'vmu.math.precision.mode': 'fixed', 'vmu.math.precision.rounding': rounding }, seam: () => ({ ok: true, result: { value } }) }).t.run({ op: 'stats/mean' }).result.value
  ok(round('floor', 2.5) === 2 && round('half-up', 2.5) === 3 && round('half-even', 2.5) === 2 && round('half-even', 3.5) === 4,
    'precision.rounding[+]: floor/half-up/half-even give observably different results',
    JSON.stringify([round('floor', 2.5), round('half-up', 2.5), round('half-even', 2.5), round('half-even', 3.5)]))
  ok(round('floor', 2.5) !== round('half-up', 2.5) && round('ceil', 2.1) === 3,
    'precision.rounding[-]: floor and half-up are NOT the same function (and ceil works)', JSON.stringify([round('floor', 2.5), round('half-up', 2.5), round('ceil', 2.1)]))
  const tol = mk({ settings: { 'vmu.math.precision.tolerance': 1e-9 }, seam: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) })
  ok(tol.t.run({ op: 'stats/mean' }).receipt.converged === false, 'precision.tolerance[-]: delta above the tolerance ⇒ not converged')
  const loose = mk({ settings: { 'vmu.math.precision.tolerance': 1 }, seam: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) })
  ok(loose.t.run({ op: 'stats/mean' }).receipt.converged === true, 'precision.tolerance[+]: a loose tolerance makes the same delta converge')
}

// ---- optim: timeLimitMs / tolerance / backend / certificates --------------------------------------
{
  const lim = mk({ settings: { 'vmu.math.optim.timeLimitMs': 100 } })
  const e = errOf(() => lim.t.plan({ op: 'optim/minimize', timeoutMs: 200 }))
  ok(e && e.code === 'VMU_TIMEOUT' && /现值=200ms/.test(String(e.hint)) && /上限=100ms/.test(String(e.hint)),
    'optim.timeLimitMs[-]: over the limit is refused with 现值/上限', e && e.hint)
  ok(lim.t.plan({ op: 'optim/minimize', timeoutMs: 50 }).ok === true, 'optim.timeLimitMs[+]: under the limit passes')
  const ot = mk({ settings: { 'vmu.math.optim.tolerance': 1e-6 }, seam: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) })
  ok(ot.t.run({ op: 'optim/minimize' }).receipt.converged === false && ot.t.run({ op: 'optim/minimize' }).receipt.tolerance === 1e-6,
    'optim.tolerance[-]: the optim tolerance is the one applied to optim ops')
  const otLoose = mk({ settings: { 'vmu.math.optim.tolerance': 1 }, seam: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) })
  ok(otLoose.t.run({ op: 'optim/minimize' }).receipt.converged === true, 'optim.tolerance[+]: a loose optim tolerance converges')
  const be = mk({ settings: opt })
  ok(codeOf(() => be.t.plan({ op: 'optim/minimize', backend: 'scipy' })) === 'VMU_MATH_UNSUPPORTED_OP',
    'optim.backend[-]: a different backend is refused by name')
  ok(be.t.plan({ op: 'optim/minimize', backend: 'ipopt' }).ok === true, 'optim.backend[+]: the declared backend passes')
  const cert = mk({ settings: { 'vmu.math.optim.certificates': true } })
  ok(codeOf(() => cert.t.run({ op: 'optim/minimize' })) === 'VMU_STATE', 'optim.certificates[-]: a run without a certificate is refused')
  const cert2 = mk({ settings: { 'vmu.math.optim.certificates': true }, seam: () => ({ ok: true, result: { value: 1 }, certificate: { kind: 'kkt' } }) })
  ok(cert2.t.run({ op: 'optim/minimize' }).ok === true, 'optim.certificates[+]: with a certificate the run is accepted')
}

// ---- formal: sorryPolicy / coqTimeoutMs / axiomAudit / requireAll ---------------------------------
{
  const deny = mk({ settings: { 'vmu.math.formal.sorryPolicy': 'deny' }, seam: () => ({ ok: true, result: { value: 1 }, sorry: true }) })
  ok(codeOf(() => deny.t.run({ op: 'formal/prove' })) === 'VMU_FORMAL_SORRY_FOUND', 'formal.sorryPolicy[-]: sorry is refused under "deny"')
  const warn = mk({ settings: { 'vmu.math.formal.sorryPolicy': 'warn' }, seam: () => ({ ok: true, result: { value: 1 }, sorry: true }) })
  ok(warn.t.run({ op: 'formal/prove' }).ok === true, 'formal.sorryPolicy[+]: "warn" accepts it (and the run is recorded)')
  const coq = mk({ settings: { 'vmu.math.formal.coqTimeoutMs': 50 } })
  ok(codeOf(() => coq.t.plan({ op: 'formal/prove', timeoutMs: 100 })) === 'VMU_TIMEOUT', 'formal.coqTimeoutMs[-]: the formal limit is used for formal ops')
  ok(coq.t.plan({ op: 'formal/prove', timeoutMs: 10 }).ok === true, 'formal.coqTimeoutMs[+]: under the formal limit passes')
  const ax = mk({ settings: { 'vmu.math.formal.axiomAudit': true }, seam: () => ({ ok: true, result: { value: 1 }, axioms: ['funext'] }) })
  ok(codeOf(() => ax.t.run({ op: 'formal/prove' })) === 'VMU_FORMAL_AXIOM_UNTRUSTED', 'formal.axiomAudit[-]: an untrusted axiom is refused')
  const ax2 = mk({ settings: { 'vmu.math.formal.axiomAudit': true }, seam: () => ({ ok: true, result: { value: 1 }, axioms: [] }) })
  ok(ax2.t.run({ op: 'formal/prove' }).ok === true, 'formal.axiomAudit[+]: no untrusted axioms ⇒ accepted')
  const all = mk({ settings: { 'vmu.math.formal.requireAll': true }, seam: () => ({ ok: true, result: { value: 1 }, assistants: ['lean'], expectedAssistants: ['lean', 'coq'] }) })
  ok(codeOf(() => all.t.run({ op: 'formal/prove' })) === 'VMU_FORMAL_ADAPTER_UNSUPPORTED', 'formal.requireAll[-]: a missing assistant is refused (named)')
  const all2 = mk({ settings: { 'vmu.math.formal.requireAll': true }, seam: () => ({ ok: true, result: { value: 1 }, assistants: ['lean', 'coq'], expectedAssistants: ['lean', 'coq'] }) })
  ok(all2.t.run({ op: 'formal/prove' }).ok === true, 'formal.requireAll[+]: all assistants ran ⇒ accepted')
}

// ---- units: enabled / strictDimensions / constantsSource ------------------------------------------
{
  const off = mk({ settings: { 'vmu.math.units.enabled': false } })
  ok(codeOf(() => off.t.plan({ op: 'units/convert', units: 'm' })) === 'VMU_MATH_INVALID_INPUT', 'units.enabled[-]: units are refused when disabled')
  ok(mk({ settings: { 'vmu.math.units.enabled': true } }).t.plan({ op: 'units/convert', units: 'm' }).ok === true, 'units.enabled[+]: units pass when enabled')
  const strict = mk({ settings: { 'vmu.math.units.strictDimensions': true }, seam: () => ({ ok: true, result: { value: 1 }, dimensionMismatch: true, dimensionDetail: 'm vs s' }) })
  ok(codeOf(() => strict.t.run({ op: 'units/convert' })) === 'VMU_MATH_DIMENSION_MISMATCH', 'units.strictDimensions[-]: a mismatch is refused')
  const loose = mk({ settings: { 'vmu.math.units.strictDimensions': false }, seam: () => ({ ok: true, result: { value: 1 }, dimensionMismatch: true }) })
  ok(loose.t.run({ op: 'units/convert' }).ok === true, 'units.strictDimensions[+]: with the check off the run passes')
  const cs = mk({ settings: { 'vmu.math.units.constantsSource': 'CODATA-2018' } })
  ok(codeOf(() => cs.t.plan({ op: 'units/convert', constantsSource: 'NIST-1998' })) === 'VMU_MATH_INVALID_INPUT',
    'units.constantsSource[-]: a different source is refused')
  ok(cs.t.plan({ op: 'units/convert', constantsSource: 'CODATA-2018' }).ok === true, 'units.constantsSource[+]: the declared source passes')
}

// ---- linalg: backend / requireResidual / sparse ---------------------------------------------------
{
  const be = mk({ settings: { 'vmu.math.linalg.backend': 'lapack' } })
  ok(codeOf(() => be.t.plan({ op: 'linalg/solve', backend: 'mkl' })) === 'VMU_MATH_UNSUPPORTED_OP', 'linalg.backend[-]: a different backend is refused')
  ok(be.t.plan({ op: 'linalg/solve', backend: 'lapack' }).ok === true, 'linalg.backend[+]: the declared backend passes')
  const res = mk({ settings: { 'vmu.math.linalg.requireResidual': true }, seam: () => ({ ok: true, result: { value: 1 } }) })
  ok(codeOf(() => res.t.run({ op: 'linalg/solve' })) === 'VMU_STATE', 'linalg.requireResidual[-]: a solve without a residual is refused')
  const res2 = mk({ settings: { 'vmu.math.linalg.requireResidual': true }, seam: () => ({ ok: true, result: { value: 1 }, residual: 1e-12 }) })
  ok(res2.t.run({ op: 'linalg/solve' }).ok === true, 'linalg.requireResidual[+]: with a residual the solve passes')
  const sp = mk({ settings: { 'vmu.math.linalg.sparse': true } })
  ok(codeOf(() => sp.t.plan({ op: 'linalg/solve', dense: true, size: 5000 })) === 'VMU_RESOURCE_BUDGET', 'linalg.sparse[-]: a large dense-only request is refused')
  ok(sp.t.plan({ op: 'linalg/solve', dense: true, size: 10 }).ok === true, 'linalg.sparse[+]: a small dense request passes')
}

// ---- convergence / numeric / artifacts ------------------------------------------------------------
{
  const conv = mk({ settings: { 'vmu.math.convergence.policy': 'require' }, seam: () => ({ ok: true, result: { value: 1 }, converged: false }) })
  ok(codeOf(() => conv.t.run({ op: 'stats/mean' })) === 'VMU_STATE', 'convergence.policy[-]: a non-converged run is refused under "require"')
  const rep = mk({ settings: { 'vmu.math.convergence.policy': 'report' }, seam: () => ({ ok: true, result: { value: 1 }, converged: false }) })
  ok(rep.t.run({ op: 'stats/mean' }).ok === true, 'convergence.policy[+]: "report" accepts it (the receipt says converged:false)')
  const quiet = mk({ settings: { 'vmu.math.numeric.warnings': false }, seam: () => ({ ok: true, result: { value: 1 }, warnings: ['ill-conditioned', 'loss of precision'] }) })
  const qr = quiet.t.run({ op: 'stats/mean' })
  ok(qr.receipt.warnings.length === 0 && qr.receipt.warningsDropped === 2 && quiet.t.status().counters.droppedWarnings === 2,
    'numeric.warnings[-]: suppression is observable AND counted', JSON.stringify({ w: qr.receipt.warnings.length, dropped: qr.receipt.warningsDropped }))
  const loud = mk({ seam: () => ({ ok: true, result: { value: 1 }, warnings: ['x'] }) })
  ok(loud.t.run({ op: 'stats/mean' }).receipt.warnings.length === 1, 'numeric.warnings[+]: with warnings on they are kept')
  const st = mk({ settings: { 'vmu.math.numeric.stability': 'require' }, seam: () => ({ ok: true, result: { value: 1 }, unstable: true }) })
  ok(codeOf(() => st.t.run({ op: 'stats/mean' })) === 'VMU_STATE', 'numeric.stability[-]: an unstable result is refused under "require"')
  const st2 = mk({ settings: { 'vmu.math.numeric.stability': 'report' }, seam: () => ({ ok: true, result: { value: 1 }, unstable: true }) })
  ok(st2.t.run({ op: 'stats/mean' }).ok === true, 'numeric.stability[+]: "report" accepts it')
  const mb = mk({ settings: { 'vmu.math.artifacts.maxFileMb': 1 }, seam: () => ({ ok: true, result: { value: 1 }, artifactMb: 5 }) })
  ok(codeOf(() => mb.t.run({ op: 'stats/mean' })) === 'VMU_RESOURCE_BUDGET', 'artifacts.maxFileMb[-]: a big artifact is refused')
  const mb2 = mk({ settings: { 'vmu.math.artifacts.maxFileMb': 1 }, seam: () => ({ ok: true, result: { value: 1 }, artifactMb: 0.5 }) })
  ok(mb2.t.run({ op: 'stats/mean' }).ok === true, 'artifacts.maxFileMb[+]: a small artifact passes')
  const runs = mk({ settings: { 'vmu.math.artifacts.maxRuns': 1 } })
  runs.t.run({ op: 'stats/mean' })
  const e2 = errOf(() => runs.t.run({ op: 'stats/mean' }))
  ok(e2 && e2.code === 'VMU_QUOTA_EXCEEDED' && /现值=1/.test(String(e2.hint)) && /上限=1/.test(String(e2.hint)),
    'artifacts.maxRuns[-]: the run quota is enforced with 现值/上限', e2 && e2.hint)
  const runs2 = mk({ settings: { 'vmu.math.artifacts.maxRuns': 5 } })
  runs2.t.run({ op: 'stats/mean' })
  ok(runs2.t.run({ op: 'stats/mean' }).ok === true, 'artifacts.maxRuns[+]: under the quota runs pass')
  const att = mk({ settings: { 'vmu.math.artifacts.maxAttemptsPerRun': 1 } })
  ok(codeOf(() => att.t.plan({ op: 'stats/mean', retries: 3 })) === 'VMU_RESOURCE_BUDGET', 'artifacts.maxAttemptsPerRun[-]: too many retries are refused')
  ok(att.t.plan({ op: 'stats/mean', retries: 1 }).ok === true, 'artifacts.maxAttemptsPerRun[+]: retries within the cap pass')
}

// ---- report: language / includeRepro / style ------------------------------------------------------
{
  const zh = mk({ settings: { 'vmu.math.report.language': 'zh-Hans' }, seam: () => ({ ok: true, result: { value: 7 } }) })
  ok(/^结果=/.test(zh.t.run({ op: 'stats/mean' }).receipt.rendered), 'report.language[-]: zh-Hans renders the Chinese label')
  const en = mk({ settings: { 'vmu.math.report.language': 'en' }, seam: () => ({ ok: true, result: { value: 7 } }) })
  ok(/^value=/.test(en.t.run({ op: 'stats/mean' }).receipt.rendered), 'report.language[+]: en renders the English label')
  const inc = mk({ settings: { 'vmu.math.report.includeRepro': true, 'vmu.math.repro.packOnSuccess': true } })
  ok(inc.t.run({ op: 'stats/mean' }).receipt.reproInReport === true, 'report.includeRepro[+]: the repro block is reported')
  const exc = mk({ settings: { 'vmu.math.report.includeRepro': false, 'vmu.math.repro.packOnSuccess': true } })
  ok(exc.t.run({ op: 'stats/mean' }).receipt.reproInReport === false, 'report.includeRepro[-]: with the key off the repro block is not reported')
  const js = mk({ settings: { 'vmu.math.report.style': 'json' }, seam: () => ({ ok: true, result: { value: 7 } }) })
  const parsed = (() => { try { return JSON.parse(js.t.run({ op: 'stats/mean' }).receipt.rendered) } catch (e) { return null } })()
  ok(parsed && parsed['结果'] === 7, 'report.style[+]: "json" renders valid JSON', JSON.stringify(parsed))
  const md = mk({ settings: { 'vmu.math.report.style': 'markdown' }, seam: () => ({ ok: true, result: { value: 7 } }) })
  ok(/\*\*/.test(md.t.run({ op: 'stats/mean' }).receipt.rendered), 'report.style[-]: "markdown" renders bold markup instead')
}

// ---- interval.enabled -----------------------------------------------------------------------------
{
  const on = mk({ settings: { 'vmu.math.interval.enabled': true } })
  ok(on.t.plan({ op: 'interval/sum', interval: true }).ok === true, 'interval.enabled[+]: interval requests pass when enabled')
  const off = mk({ settings: { 'vmu.math.interval.enabled': false } })
  ok(codeOf(() => off.t.plan({ op: 'interval/sum', interval: true })) === 'VMU_MATH_INVALID_INPUT', 'interval.enabled[-]: interval requests are refused when disabled')
}

// ---- the honesty rails: complement, determinism, zero mechanism, counters -------------------------
{
  const t = mk({})
  const st = t.t.status()
  ok(WIRED_KEYS.length >= 40, 'the batch wires at least 40 keys', String(WIRED_KEYS.length))
  ok(st.wired.length === WIRED_KEYS.length && st.wiredCount === WIRED_KEYS.length, 'status().wired lists every wired key', String(st.wiredCount))
  ok(st.overlap.length === 0, 'WIRED and plannedKeys are COMPLEMENTARY (no key is in both)', JSON.stringify(st.overlap))
  ok(st.complementOk === true && st.plannedCount + st.wiredCount === st.declaredMathKeys && st.declaredMathKeys === 171,
    'the two lists partition the DECLARED universe (171 vmu.math.* keys)', JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredMathKeys }))
  ok(st.plannedKeys.every((k) => typeof st.unwiredReasons[k] === 'string' && st.unwiredReasons[k].length > 8),
    'every unwired key carries a concrete reason', JSON.stringify(st.plannedKeys.slice(0, 3)))
  ok(Object.keys(st.keys).length === WIRED_KEYS.length && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for every wired key (no silent nulls)', JSON.stringify(Object.entries(st.keys).filter(([, v]) => v === undefined)))
  ok(UNWIRED_REASONS['vmu.math.optim'].includes('后端'), 'the reason table explains the biggest unwired cluster (optim backends)')
  // determinism: two instances, same settings, same clock ⇒ identical status
  const a = mk({ clock: () => 777 }); const b = mk({ clock: () => 777 })
  a.t.run({ op: 'stats/mean', seed: 1 }); b.t.run({ op: 'stats/mean', seed: 1 })
  ok(JSON.stringify(a.t.status()) === JSON.stringify(b.t.status()), 'two instances with the same inputs produce identical status()')
  // zero mechanism: plan() answers, run() refuses by name
  const zero = createMathTools({ clock: () => 0 })
  ok(zero.plan({ op: 'stats/mean' }).ok === true, 'zero mechanism[+]: plan() answers with the documented defaults')
  ok(codeOf(() => zero.run({ op: 'stats/mean' })) === 'VMU_ENGINE_UNAVAILABLE', 'zero mechanism[-]: run() without a seam refuses by name')
  ok(codeOf(() => zero.plan({})) === 'VMU_MATH_INVALID_INPUT', 'an op-less request is a named refusal')
  ok(zero.status().plannedKeys.length > 100 && zero.status().plannedSource === 'settings/planned.js',
    'the planned list is read from the generated registry', zero.status().plannedSource)
  // refusal counters by code
  const counted = mk({ settings: { 'vmu.math.sandbox.network': 'deny' } })
  codeOf(() => counted.t.plan({ op: 'x', needsNetwork: true })); codeOf(() => counted.t.plan({ op: 'x', needsNetwork: true }))
  ok(counted.t.status().refusals.VMU_NETWORK_DENIED === 2 && counted.t.status().refusalsTotal === 2,
    'refusals are COUNTED BY CODE', JSON.stringify(counted.t.status().refusals))
}

// ---- M. enforced[] honesty (round-11 fixes) --------------------------------------------------------
{
  const ring = []
  const mkRing = (settings = {}, seam = null) => createMathTools({
    clock: () => 1000, settings, log: { append: (r) => ring.push(r) },
    spawn: seam || (() => ({ ok: true, result: { value: 1 } })),
  })
  // M1–M7: the keys the reviewer found missing are now listed on the SUCCESS path
  const reqKey = (settings, req, key, label) => {
    const p = mkRing(settings).plan(req)
    ok(p.enforced.includes(key), label + '[+]: the key is listed on the SUCCESS path', JSON.stringify(p.enforced))
  }
  reqKey({ 'vmu.math.repro.requireSeed': true }, { op: 'stats/mean', seed: 7 }, 'vmu.math.repro.requireSeed', 'repro.requireSeed')
  reqKey({ 'vmu.math.repro.deterministic': true }, { op: 'stats/mean', seed: 7 }, 'vmu.math.repro.deterministic', 'repro.deterministic')
  reqKey({ 'vmu.math.sandbox.memoryMb': 128 }, { op: 'stats/mean', memoryMb: 64 }, 'vmu.math.sandbox.memoryMb', 'sandbox.memoryMb')
  reqKey({ 'vmu.math.sandbox.wallMs': 5000 }, { op: 'stats/mean', wallMs: 100 }, 'vmu.math.sandbox.wallMs', 'sandbox.wallMs')
  reqKey({ 'vmu.math.sandbox.cpuMs': 5000 }, { op: 'stats/mean', cpuMs: 100 }, 'vmu.math.sandbox.cpuMs', 'sandbox.cpuMs')
  ok(mkRing({ 'vmu.math.jobs.maxParallel': 3 }).plan({ op: 'stats/mean' }).enforced.includes('vmu.math.jobs.maxParallel'),
    'jobs.maxParallel[+]: the concurrency rail runs on every plan and says so')
  ok(mkRing({ 'vmu.math.repro.seed': 99 }).plan({ op: 'stats/mean' }).enforced.includes('vmu.math.repro.seed'),
    'repro.seed[+]: a configured seed that fills in the request seed is listed')
  // M8: the REFUSAL path carries the same proof (the reviewer saw `enforced: null`)
  const refusalOf = (settings, req) => { const t = mkRing(settings); try { t.plan(req); return null } catch (e) { return e } }
  const seedErr = refusalOf({ 'vmu.math.repro.requireSeed': true }, { op: 'stats/mean' })
  ok(seedErr && Array.isArray(seedErr.enforced) && seedErr.enforced.includes('vmu.math.repro.requireSeed'),
    'repro.requireSeed[-]: the REFUSAL carries `enforced` naming the key', seedErr && JSON.stringify(seedErr.enforced))
  const netErr = refusalOf({ 'vmu.math.sandbox.network': 'deny' }, { op: 'stats/mean', needsNetwork: true })
  ok(netErr && Array.isArray(netErr.enforced) && netErr.enforced.includes('vmu.math.sandbox.network'),
    'network[-]: VMU_NETWORK_DENIED carries `enforced` (the reviewer saw null here)', netErr && JSON.stringify(netErr.enforced))
  const opErr = refusalOf({}, {})
  ok(opErr && Array.isArray(opErr.enforced) && opErr.enforced.length === 0,
    'op[-]: VMU_MATH_INVALID_INPUT carries an EXPLICITLY EMPTY (not null) enforced list', opErr && JSON.stringify(opErr.enforced))
  // M9: EVERY refusal path carries a non-null enforced array (table-driven over the rails)
  const triggers = [
    ['no op', {}, {}],
    ['network', { 'vmu.math.sandbox.network': 'deny' }, { op: 'x', needsNetwork: true }],
    ['jobDir', { 'vmu.math.jobs.dir': process.cwd() }, { op: 'x', jobDir: process.cwd() + '/../escape' }],
    ['memoryMb', { 'vmu.math.sandbox.memoryMb': 1 }, { op: 'x', memoryMb: 9 }],
    ['cpuMs', { 'vmu.math.sandbox.cpuMs': 1 }, { op: 'x', cpuMs: 9 }],
    ['wallMs', { 'vmu.math.sandbox.wallMs': 1 }, { op: 'x', wallMs: 9 }],
    ['threads', { 'vmu.math.sandbox.threads': 1 }, { op: 'x', threads: 9 }],
    ['timeLimit', { 'vmu.math.optim.timeLimitMs': 1 }, { op: 'optim/x', timeoutMs: 9 }],
    ['seed', { 'vmu.math.repro.requireSeed': true }, { op: 'x' }],
    ['deterministic', { 'vmu.math.repro.deterministic': true }, { op: 'x', randomized: true }],
    ['backend', { 'vmu.math.optim.backend': 'ipopt' }, { op: 'optim/x', backend: 'scipy' }],
    ['units off', { 'vmu.math.units.enabled': false }, { op: 'x', units: 'm' }],
    ['constants', { 'vmu.math.units.constantsSource': 'CODATA' }, { op: 'x', constantsSource: 'NIST' }],
    ['interval', { 'vmu.math.interval.enabled': false }, { op: 'x', interval: true }],
    ['retries', { 'vmu.math.artifacts.maxAttemptsPerRun': 1 }, { op: 'x', retries: 9 }],
    ['sparse', { 'vmu.math.linalg.sparse': true }, { op: 'linalg/x', dense: true, size: 5000 }],
  ]
  const bad = []
  for (const [label, settings, req] of triggers) {
    const e = refusalOf(settings, req)
    if (!e) { bad.push(label + ':NO-THROW'); continue }
    if (!Array.isArray(e.enforced)) bad.push(label + ':NOT-ARRAY(' + String(e.enforced) + ')')
  }
  ok(bad.length === 0, 'EVERY refusal path carries an array `enforced` (never null/undefined)', JSON.stringify(bad))
  // M10: the refusal error and the audit row agree (the two channels must match)
  ring.length = 0
  const t = mkRing({ 'vmu.math.sandbox.network': 'deny' })
  let caught = null
  try { t.plan({ op: 'x', needsNetwork: true }) } catch (e) { caught = e }
  const row = ring.filter((r) => r.type === 'mathtools/refused').slice(-1)[0]
  ok(row && caught && JSON.stringify(row.enforced) === JSON.stringify(caught.enforced),
    'the audit row and the thrown refusal carry the SAME enforced list (two channels agree)',
    JSON.stringify({ row: row && row.enforced, err: caught && caught.enforced }))
  // M11: reverse direction — keys NOT evaluated must not appear
  const quiet = mkRing({}).plan({ op: 'stats/mean' })
  const forbidden = ['vmu.math.units.enabled', 'vmu.math.units.strictDimensions', 'vmu.math.interval.enabled',
    'vmu.math.optim.timeLimitMs', 'vmu.math.artifacts.maxAttemptsPerRun'].filter((k) => quiet.enforced.includes(k))
  ok(forbidden.length === 0, 'keys that were NOT evaluated do not appear in enforced[]', JSON.stringify(forbidden))
  ok(quiet.enforced.includes('vmu.math.jobs.maxParallel'),
    'the concurrency rail (always evaluated) IS present, so the reverse check is meaningful')
  // M12: the SHAPING rails are listed too (self-audit: the same defect class existed here)
  const sig = (over = {}) => {
    const t = createMathTools({ clock: () => 1000, settings: Object.assign({}, over), spawn: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) })
    return t.run({ op: 'stats/mean', seed: 1 })
  }
  const shaping = sig({ 'vmu.math.precision.digits': 3, 'vmu.math.jobs.persist': true, 'vmu.math.report.style': 'json', 'vmu.math.repro.packOnSuccess': true, 'vmu.math.cache.enabled': true, 'vmu.math.cache.crossProject': true })
  for (const k of ['vmu.math.precision.digits', 'vmu.math.precision.mode', 'vmu.math.precision.rounding', 'vmu.math.precision.tolerance',
    'vmu.math.jobs.persist', 'vmu.math.repro.packOnSuccess', 'vmu.math.cache.crossProject',
    'vmu.math.report.language', 'vmu.math.report.style', 'vmu.math.report.includeRepro']) {
    ok(shaping.enforced.includes(k), 'shaping[]: ' + k + ' is listed when its read shaped this result', JSON.stringify(shaping.enforced))
  }
  const optimRun = (over) => createMathTools({ clock: () => 1000, settings: over, spawn: () => ({ ok: true, result: { value: 1 }, delta: 0.5 }) }).run({ op: 'optim/minimize', seed: 1 })
  ok(optimRun({ 'vmu.math.optim.tolerance': 1e-6 }).enforced.includes('vmu.math.optim.tolerance'),
    'shaping[]: optim ops list optim.tolerance (not precision.tolerance)', JSON.stringify(optimRun({ 'vmu.math.optim.tolerance': 1e-6 }).enforced))
  ok(!optimRun({ 'vmu.math.optim.tolerance': 1e-6 }).enforced.includes('vmu.math.precision.tolerance'),
    'shaping[-]: an optim op does NOT claim precision.tolerance')
  ok(!sig({}).enforced.includes('vmu.math.precision.digits'),
    'shaping[-]: with digits=0 the rounding keys are NOT claimed (their read changes nothing)')
  const cap2 = createMathTools({ clock: () => 1000, settings: { 'vmu.math.cache.enabled': true, 'vmu.math.cache.maxEntries': 1 }, spawn: () => ({ ok: true, result: { value: 1 } }) })
  cap2.run({ op: 'stats/mean', args: { a: 1 } })
  const evicted = cap2.run({ op: 'stats/mean', args: { a: 2 } })
  ok(evicted.enforced.includes('vmu.math.cache.maxEntries'), 'shaping[]: an eviction lists cache.maxEntries', JSON.stringify(evicted.enforced))
}

if (failed === 0) {
  console.log('=== VMU MATHTOOLS: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU MATHTOOLS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
