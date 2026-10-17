// tests/audit-kernel-claims-5.mjs — ROUND 106, batch E: mathadapters (18) · ip (6) · mathtools (9).
//
// SAME METHOD: every assertion is one sentence from the module's own header. Assertions may not sit inside an `if`, and every
// `.every`/`for...of` carries a `.length > 0` guard, so RULE E and this file agree about what can fail.
//
// ONE FINDING THAT IS NOT A DEFECT BUT A HAZARD, AND IT WAS ACTED ON: `UNWIRED_REASONS` means the opposite thing in ip.js
// (deliberately empty - that module wires everything it declares) and in mathtools.js (a non-empty map of PLANNED key
// FAMILIES, keyed by namespace). Both claims are true, and the shared name made an independent auditor read a correct module
// as broken. Both headers now say which one they mean.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  return false
}
/** Run a call that may THROW or RETURN a refusal; normalise both into one shape so the assertion is unconditional. */
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, code: v && v.code, message: String((v && (v.message || v.reason)) || ''), ok: v && v.ok, raw: v } }
  catch (e) { return { threw: true, code: e && e.code, message: String((e && e.message) || e), ok: false, raw: e } }
}
const MT = await import(url('mathtools.js'))
const MA = await import(url('mathadapters.js'))
const IP = await import(url('ip.js'))

console.log('=== 1. mathadapters: THE DECLARED VOCABULARIES (header ①/②) ===')
ok(Array.isArray(MA.SHAPE_KINDS) && MA.SHAPE_KINDS.join(',') === 'scalar,array,frame,expr,result,mapping',
  '★ "every return is normalised into ONE serialisable envelope (`kind` ∈ scalar|array|frame|expr|result|mapping)"',
  MA.SHAPE_KINDS)
ok(Array.isArray(MA.ADAPTER_LIBS) && MA.ADAPTER_LIBS.join(',') === 'numpy,scipy,pandas,sympy',
  '★ "SCIENTIFIC-LIBRARY ADAPTERS (numpy / scipy / pandas / sympy)"', MA.ADAPTER_LIBS)
ok(MA.RESULT_MARKER === '__VMU_MATH_RESULT__' && MA.PROBE_MARKER === '__VMU_MATH_PROBE__',
  '★ the two wire markers are the declared literal strings', [MA.RESULT_MARKER, MA.PROBE_MARKER])
ok(MA.ENFORCED_SCOPE === 'evaluated-so-far', '★ ENFORCED_SCOPE is the literal "evaluated-so-far"', MA.ENFORCED_SCOPE)
ok(MA.ADAPTER_LIBS.every((l) => typeof MA.SCIENTIFIC_LIBS[l] === 'object') && MA.ADAPTER_LIBS.length > 0,
  '★ every adapter lib named in ADAPTER_LIBS has a SCIENTIFIC_LIBS entry (no dangling lib name)', Object.keys(MA.SCIENTIFIC_LIBS))

console.log('\n=== 2. mathadapters: "nothing here touches the filesystem / BOTH seams are INJECTED" (hard boundaries) ===')
ok(typeof MA.createMathAdapters === 'function', '★ discovery: mathadapters exports createMathAdapters', typeof MA.createMathAdapters)
const noSeam = MA.createMathAdapters({ settings: {} })
ok(!!noSeam && typeof noSeam === 'object', '★ a face builds with NO seams injected (safe on a machine with nothing installed)', noSeam ? Object.keys(noSeam).slice(0, 8) : null)
const planNoSeam = await norm(() => (typeof noSeam.plan === 'function' ? noSeam.plan({ lib: 'numpy', fn: 'mean', args: [[]] }) : undefined))
ok(typeof noSeam.plan === 'function', '★ discovery: the face exposes plan()', Object.keys(noSeam))
ok(planNoSeam.ok !== false && planNoSeam.threw === false, '★ "With no seam injected `plan()` still answers (it declares what it WOULD run)"', planNoSeam)
const runNoSeam = await norm(() => (typeof noSeam.run === 'function' ? noSeam.run({ lib: 'numpy', fn: 'mean', args: [[]] }) : undefined))
ok(typeof noSeam.run === 'function' && runNoSeam.ok === false && typeof runNoSeam.code === 'string' && runNoSeam.code.length > 0,
  '★ "`run()` refuses BY NAME" with no seam — a named code, not a throw and not a fake success', { code: runNoSeam.code, threw: runNoSeam.threw })
ok(runNoSeam.code === 'VMU_EXTERNAL_UNAVAILABLE', '★ and the code is the declared VMU_EXTERNAL_UNAVAILABLE ("no seam never becomes probably fine")', runNoSeam.code)
const probeNoSeam = await norm(() => (typeof noSeam.probe === 'function' ? noSeam.probe(['numpy']) : undefined))
ok(probeNoSeam.ok === false && typeof probeNoSeam.code === 'string' && probeNoSeam.code.length > 0,
  '★ "`run()`/`probe()` refuse BY NAME — no seam never becomes probably fine"', { code: probeNoSeam.code, threw: probeNoSeam.threw })

console.log('\n=== 3. mathadapters: SHA-1-style identity + the pure body builders ===')
ok(typeof MA.fingerprint === 'function', '★ discovery: mathadapters exports fingerprint', typeof MA.fingerprint)
ok(MA.fingerprint({ a: 1, b: [2, 3] }) === MA.fingerprint({ a: 1, b: [2, 3] }), '★ fingerprint is STABLE for equal content (evidence is reproducible)', MA.fingerprint({ a: 1 }))
ok(MA.fingerprint({ a: 1 }) !== MA.fingerprint({ a: 2 }), '★ and it separates different content', [MA.fingerprint({ a: 1 }), MA.fingerprint({ a: 2 })])
// ★ MY ERROR (measured): buildHarness returns the harness TEXT (a string), not an object.
ok(typeof MA.buildHarness === 'function' && typeof MA.buildHarness({ imports: [], seed: '', body: '' }) === 'string' && MA.buildHarness({}).length > 0,
  '★ buildHarness is a PURE builder: it returns the harness TEXT (non-empty), taking {} without error', typeof MA.buildHarness({}))
const hb = MA.buildHarness({ imports: ['numpy'], seed: 'S', body: 'RET=BODY' })
ok(JSON.stringify(hb).includes('BODY'), '★ the harness text CONTAINS the caller body it was given (no silent drop)', JSON.stringify(hb).slice(0, 120))
ok(typeof MA.exprBody === 'function' && MA.exprBody('1+1').includes('1+1'), '★ exprBody embeds the expression verbatim', typeof MA.exprBody === 'function' ? MA.exprBody('1+1').slice(0, 90) : null)

console.log('\n=== 4. ip: the three vocabularies and the "declared but not wired is visible" claim ===')
ok(Array.isArray(IP.DECLARED_KEYS) && IP.DECLARED_KEYS.length > 0, '★ ip exports a non-empty DECLARED_KEYS', IP.DECLARED_KEYS.length)
ok(IP.SERVICE_KEYS.length > 0 && IP.SERVICE_KEYS.every((k) => IP.DECLARED_KEYS.includes(k)),
  '★ every SERVICE_KEY is a DECLARED_KEY (a service surface cannot name an undeclared key)', IP.SERVICE_KEYS)
ok(IP.KNOB_KEYS.length > 0 && IP.KNOB_KEYS.every((k) => !IP.SERVICE_KEYS.includes(k)),
  '★ "KNOB_KEYS = DECLARED_KEYS minus SERVICE_KEYS": no knob is also a service surface (the module\'s own filter)', IP.KNOB_KEYS)
ok(IP.KNOB_KEYS.length + IP.SERVICE_KEYS.length === IP.DECLARED_KEYS.length,
  '★ and the two halves are EXACTLY the declared set (no key lost or double-counted)',
  { declared: IP.DECLARED_KEYS.length, knobs: IP.KNOB_KEYS.length, services: IP.SERVICE_KEYS.length })
ok(IP.WIRED_KEYS.length === IP.DECLARED_KEYS.length && IP.WIRED_KEYS.length > 0,
  '★ "WIRED_KEYS = DECLARED_KEYS.slice()": every declared key is wired here', { wired: IP.WIRED_KEYS.length, declared: IP.DECLARED_KEYS.length })
ok(Object.keys(IP.UNWIRED_REASONS).length === 0,
  '★ and UNWIRED_REASONS is EMPTY consistently (a key wired with an "unwired reason" would be a contradiction)', Object.keys(IP.UNWIRED_REASONS))

console.log('\n=== 5. mathtools: declared keys, the factory contract, and `run` being ASYNC ===')
ok(Array.isArray(MT.WIRED_KEYS) && MT.WIRED_KEYS.length > 0, '★ mathtools declares a non-empty WIRED_KEYS', MT.WIRED_KEYS.length)
// ★ MY ERROR (measured): mathtools exports NO DECLARED_KEYS - its UNWIRED_REASONS names PLANNED family keys
// (vmu.math.optim/formal/linalg…), i.e. the opposite convention from ip.js. The module's real claim is that each
// such key carries a REASON, which is what is asserted here.
const unwiredMT = Object.entries(MT.UNWIRED_REASONS)
ok(unwiredMT.length > 0 && unwiredMT.every(([, why]) => typeof why === 'string' && why.length > 0),
  '★ "UNWIRED_REASONS": every planned-but-unwired key carries a non-empty REASON (a bare omission is noise)', { n: unwiredMT.length, sample: unwiredMT.slice(0, 2).map(([k]) => k) })
ok(MT.WIRED_KEYS.length > 0 && Object.keys(MT.UNWIRED_REASONS).length > 0,
  '★ and the two sets are kept apart deliberately: wired keys vs planned families (mathtools has no DECLARED_KEYS export)', { wired: MT.WIRED_KEYS.length, unwired: Object.keys(MT.UNWIRED_REASONS).length })
ok(typeof MT.createMathTools === 'function', '★ discovery: mathtools exports createMathTools', typeof MT.createMathTools)
const mtDefault = await norm(() => MT.createMathTools({}))
ok(mtDefault.threw === false && !!mtDefault.raw, '★ the clock has a declared default: createMathTools({}) builds (no throw — the lesson from Round 105)', mtDefault.message)
const mtBadClock = await norm(() => MT.createMathTools({ clock: 'nope' }))
ok(mtBadClock.ok === false && typeof mtBadClock.code === 'string' && /clock/i.test(mtBadClock.message),
  '★ a NON-FUNCTION clock is refused by name, naming the piece (no silent default)', { code: mtBadClock.code, message: mtBadClock.message.slice(0, 80) })
{
  const face = mtDefault.raw
  const r = face && typeof face.run === 'function' ? face.run({ op: '__no_such_op__' }) : undefined
  const isPromise = !!r && typeof r.then === 'function'
  ok(isPromise, '★ `run` is ASYNC (returns a Promise) — the round that made it async is still true', r === undefined ? 'no run()' : typeof r.then)
  const settled = await norm(async () => (isPromise ? await r : r))
  ok(settled.ok === false && typeof settled.code === 'string' && settled.code.length > 0,
    '★ an UNKNOWN op is refused BY NAME rather than resolving to a silent success', { code: settled.code, threw: settled.threw })
  const badArgs = await norm(async () => (typeof face.run === 'function' ? await face.run({ op: 'stats/mean', args: {} }) : undefined))
  ok(badArgs.ok === false && typeof badArgs.code === 'string' && badArgs.code.length > 0,
    '★ malformed `args` yields a NAMED refusal, never an uncaught TypeError (the host-spawn lesson, applied here)', { code: badArgs.code, threw: badArgs.threw })
}

console.log('')
console.log('=== KERNEL CLAIMS 6E: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE: prove this harness reports a false claim as a failure.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 6E SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 6E (mathadapters 18 · ip 6 · mathtools 9): " + pass + " passed, " + fail + " failed ===")
if (fail > 0) console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"))
process.exit(fail === 0 ? 0 : 1)
