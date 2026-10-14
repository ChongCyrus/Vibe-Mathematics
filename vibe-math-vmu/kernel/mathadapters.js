// vmu kernel · mathadapters — SCIENTIFIC-LIBRARY ADAPTERS (numpy / scipy / pandas / sympy).
//
// WHY THIS FILE EXISTS (Round 2, target 5 / docs/15 + docs/09)
//   The shared `math_computation` module answers "is this package importable?" and "run this script";
//   it deliberately knows nothing about the SHAPE of what a scientific stack returns. A member that asks
//   for a `numpy` array, a `pandas` frame or a `sympy` expression therefore gets an opaque stdout blob,
//   and a machine that lacks the library gets a generic missing-package line. This module adds the two
//   things the shared module does not have:
//
//   ① a RESULT-SHAPE CONTRACT — every return is normalised into ONE serialisable envelope
//      (`kind` ∈ scalar | array | frame | expr | result | mapping), so a caller can branch on the shape
//      instead of parsing prose. An unknown return is refused BY NAME (`VMU_MATH_SHAPE_UNKNOWN`) rather
//      than stringified into something that looks like data.
//   ② a SESSION-LEVEL INTERPRETER / ENVIRONMENT BINDING — the interpreter is resolved once, the declared
//      libraries are probed once (versions included), and every run reports the binding it used. A missing
//      library is refused BY NAME (`VMU_MATH_LIB_UNAVAILABLE`) with an install `next`, never faked.
//
// HARD BOUNDARIES (the reason the module is safe to wire on a machine with nothing installed)
//   · BOTH seams are INJECTED: `resolveExecutable` and `spawn`. Neither is ever read from `process.env`,
//     and nothing here touches the filesystem. With no seam injected `plan()` still answers (it declares
//     what it WOULD run) while `run()`/`probe()` refuse BY NAME — "no seam" never becomes "probably fine".
//   · No network, no install: a missing library yields a NAMED refusal plus the command a human/agent
//     could run through the existing install-plan path (`math_computation {op:'install'}`). This module
//     never executes an installer.
//   · A computation is EVIDENCE, never a verdict: like `kernel/math.js`, nothing here can ever say a
//     proposition is false. `isRefutation` is hard-wired false on every return.
//   · Every cap counts: array/string truncation reports `dropped`, never silently shortens.
//
// SETTINGS are read as PLAIN LITERALS (the settings table / docs audit discovers wired keys by scanning
// file text): `WIRED_KEYS` below names every key this module consumes.
//
// INJECTION
//   createMathAdapters({ settings, clock, log, bus, resolveExecutable, spawn, root })
//     · settings          — `{ get(key) }` or a plain object (same convention as kernel/mathjobs.js).
//     · resolveExecutable — `(cmd) => Promise<string>` (host subprocess service).
//     · spawn             — `({ engine, argv, stdin, timeoutMs, env }) =>
//                             { exitCode, stdout, stderr, timedOut?, signal? }`.
//     · root              — cwd for the child process (defaults to '.').
//     · clock/log/bus     — injected time source, logger, event bus (all optional; clock only measures).

import { createHash } from 'node:crypto'
import { mint as mintId } from './ids.js'
import { createChildBudget } from './mathjobs.js'

/** Public-interface version of this module's surfaces. */
export const apiVersion = 1

/** The six shapes a result may normalise into. Anything else is refused by name. */
export const SHAPE_KINDS = Object.freeze(['scalar', 'array', 'frame', 'expr', 'result', 'mapping'])

/**
 * ROUND 7 · A：`kind:"array"` alone cannot tell a **符号解列表** from a **数值数组** — `sympy.solve(Eq(x**2,4),x)`
 * used to arrive as `values:["-2","2"]`, indistinguishable from `numpy.arange(2)`. `elementKind` is the
 * CALLER-VISIBLE second axis (it is additive: `kind` keeps its meaning, so nothing that already branches on
 * `kind` changes). Vocabulary check: v5r's own `next.kind` set is `agent-install|enable|engine-override|note|
 * reason|user-install|vendor` and it has **no result-shape contract at all** ⇒ these words collide with
 * nothing in the baseline (they are the vmu adapter contract's own axis, like `SHAPE_KINDS` above).
 * `text` exists because a pandas string `Index`/a numpy `<U` array is neither numeric nor symbolic, and calling
 * it `unknown` would hide a fact we DO know.
 */
export const ELEMENT_KINDS = Object.freeze(['numeric', 'symbolic', 'mapping', 'text', 'mixed', 'unknown'])

/**
 * The descriptors. `pythonImport` is what the harness imports; `probe` needs nothing but the stdlib.
 * `needs` documents which other declared library a probe depends on (scipy/pandas build on numpy).
 */
export const SCIENTIFIC_LIBS = Object.freeze({
  numpy: Object.freeze({
    name: 'numpy', pythonImport: 'numpy as np', module: 'numpy',
    provides: Object.freeze(['ndarray', 'generic']),
    installCommand: 'python -m pip install --user numpy',
    docs: 'truth-valued arrays; `kind:"array"` with dtype+shape, `kind:"scalar"` for numpy scalars',
  }),
  scipy: Object.freeze({
    name: 'scipy', pythonImport: 'scipy', module: 'scipy',
    provides: Object.freeze(['sparse', 'optimize', 'stats', 'integrate', 'linalg']),
    installCommand: 'python -m pip install --user scipy',
    docs: 'solver/statistics results; `kind:"result"` when the call returns an OptimizeResult-like object',
  }),
  pandas: Object.freeze({
    name: 'pandas', pythonImport: 'pandas as pd', module: 'pandas',
    provides: Object.freeze(['DataFrame', 'Series']),
    installCommand: 'python -m pip install --user pandas',
    docs: '`kind:"frame"` with columns/index/dtypes/rows (cell values stringified only when lossy)',
  }),
  sympy: Object.freeze({
    name: 'sympy', pythonImport: 'sympy as sp', module: 'sympy',
    provides: Object.freeze(['Basic', 'Expr', 'latex', 'srepr']),
    installCommand: 'python -m pip install --user sympy',
    docs: '`kind:"expr"` with srepr + latex + freeSymbols; NEVER compared to a float silently',
  }),
})

/** The four libraries this face knows: numpy / scipy / pandas / sympy. */
export const ADAPTER_LIBS = Object.freeze(['numpy', 'scipy', 'pandas', 'sympy'])

/** The envelope every successful adapter call returns (docs/03 · docs/18 cite this shape). */
export const RESULT_ENVELOPE = Object.freeze({
  ok: true,
  lib: 'numpy|scipy|pandas|sympy',
  version: 'string|null',
  kind: 'scalar|array|frame|expr|result|mapping',
  value: 'scalar only',
  values: 'array only (nested lists, truncated by vmu.math.adapters.maxArrayElements)',
  shape: 'array only',
  dtype: 'array/scalar when known',
  columns: 'frame only', index: 'frame only', dtypes: 'frame only', rows: 'frame only',
  sympy: 'expr only (srepr)', latex: 'expr only', freeSymbols: 'expr only',
  fields: 'result only (OptimizeResult-style keys)',
  truncated: '{ droppedElements, droppedBytes } — always present, 0 when nothing was dropped',
  receipt: '{ jobId, engine, argv, exitCode, durationMs, inputFingerprint, outputFingerprint }',
  isRefutation: false,
})

/** Marker the python harness prints exactly once; the only thing this module parses. */
export const RESULT_MARKER = '__VMU_MATH_RESULT__'
/** Marker for the environment probe. */
export const PROBE_MARKER = '__VMU_MATH_PROBE__'

/** Every settings key this module really reads (gate: read, not merely echoed). */
export const WIRED_KEYS = Object.freeze([
  'vmu.math.adapters.enabled',
  'vmu.math.adapters.libs',
  'vmu.math.adapters.python',
  'vmu.math.adapters.packageAllowlist',
  'vmu.math.adapters.probeCache',
  'vmu.math.adapters.maxArrayElements',
  'vmu.math.adapters.maxStringBytes',
  'vmu.math.engines',
])

/** The scope marker every receipt AND every refusal carries (repo D3: a result is never scope-less). */
export const ENFORCED_SCOPE = 'evaluated-so-far'

/**
 * A named refusal. `enforced` lists the SETTINGS KEYS whose value took part in this refusal — an empty
 * array when the decision came from the arguments, the injected seams or a static registry (that is the
 * honest answer, not a missing one), and `enforcedScope` says how far the evaluation got.
 */
export function refuse(code, message, hint, next, enforced) {
  const out = {
    ok: false, code, message, hint: hint || null,
    enforced: Array.isArray(enforced) ? enforced.slice() : [],
    enforcedScope: ENFORCED_SCOPE,
  }
  if (next) out.next = next
  return out
}

/** Candidate interpreter names, tried in order; the FIRST that resolves wins (never guessed past it). */
const PY_CANDIDATES = Object.freeze(['python3', 'python', 'py'])

function sha256Hex(s) { return createHash('sha256').update(String(s)).digest('hex') }

/** Deterministic JSON-ish fingerprint (stable across runs; no clock, no randomness). */
export function fingerprint(x) {
  if (typeof x === 'string') return 'fp:' + sha256Hex(x).slice(0, 24)
  return 'fp:' + sha256Hex(JSON.stringify(x === undefined ? null : x)).slice(0, 24)
}

/**
 * The python harness. `<BODY>` is replaced by the mode-specific body and `<LIBS>` by a JSON list of
 * imports. It is assembled from string literals only, so the same input always yields the same argv
 * element (a receipt must be reproducible).
 *
 * The shape normalisation lives HERE, in the child, because only the child has the objects. numpy is
 * tested before pandas (a Series is not an ndarray); sympy is tested last because `sympy.Basic` does not
 * overlap with the array/frame types.
 */
export function buildHarness({ imports = [], seed = '', body = '' } = {}) {
  const imp = imports.length
    // `pythonImport` values are module specs ("numpy as np"); a caller may also pass a full statement.
    ? imports.map((x) => (/^\s*(import|from)\b/.test(String(x)) ? String(x) : ('import ' + String(x)))).join('\n')
    : 'pass'
  const seedLine = seed === '' ? '' : (
    'import random as _random\n'
    + '_random.seed(' + JSON.stringify(String(seed)) + ')\n'
    + 'try:\n'
    + '    import numpy as _np_seed\n'
    + '    _np_seed.random.seed(0 if not str(' + JSON.stringify(String(seed)) + ').isdigit() else int(' + JSON.stringify(String(seed)) + '))\n'
    + 'except Exception:\n'
    + '    pass\n'
  )
  return [
    'import json as _json, sys as _sys',
    imp,
    seedLine,
    'def _vmu_emit(_o):',
    '    _sys.stdout.write(' + JSON.stringify(RESULT_MARKER + ' ') + ' + _json.dumps(_o, default=str) + "\\n")',
    'def _vmu_jsonable(_x, _d=0):',
    '    if _d > 8:',
    '        return str(_x)',
    '    try:',
    '        import numpy as _np',
    '        if isinstance(_x, _np.ndarray):',
    '            return _x.tolist()',
    '        if isinstance(_x, _np.generic):',
    '            return _x.item()',
    '    except Exception:',
    '        pass',
    '    if isinstance(_x, dict):',
    '        return {str(_k): _vmu_jsonable(_v, _d + 1) for _k, _v in _x.items()}',
    '    if isinstance(_x, (list, tuple)):',
    '        return [_vmu_jsonable(_v, _d + 1) for _v in _x]',
    '    if isinstance(_x, (int, float, str, bool)) or _x is None:',
    '        return _x',
    '    return str(_x)',
    // ROUND 7 (A): the CALLER-VISIBLE distinction the R6 verdict named — a list of sympy objects is NOT the same
    // thing as a numeric vector, even though both serialize to a JSON list. `elementKind` says which one it is.
    'def _vmu_element_kind(_v):',
    '    _has_sym = False',
    '    _has_num = False',
    '    _has_map = False',
    '    _has_text = False',
    '    _has_other = False',
    '    try:',
    '        import sympy as _sp',
    '    except Exception:',
    '        _sp = None',
    '    try:',
    '        import numpy as _np',
    '    except Exception:',
    '        _np = None',
    '    for _e in _v:',
    '        if _np is not None and isinstance(_e, (_np.ndarray, _np.generic)):',
    '            _has_num = True',
    '            continue',
    '        if _sp is not None and isinstance(_e, _sp.Basic):',
    '            _has_sym = True',
    '            continue',
    '        if isinstance(_e, dict):',
    '            _has_map = True',
    '            continue',
    '        if isinstance(_e, str):',
    '            _has_text = True',
    '            continue',
    '        if isinstance(_e, bool) or isinstance(_e, (int, float, complex)) or _e is None:',
    '            _has_num = True',
    '            continue',
    '        _has_other = True',
    '    _n = (1 if _has_num else 0) + (1 if _has_sym else 0) + (1 if _has_map else 0) + (1 if _has_text else 0) + (1 if _has_other else 0)',
    '    if _n == 0:',
    '        return "unknown"',
    '    if _n > 1:',
    '        return "mixed"',
    '    if _has_sym:',
    '        return "symbolic"',
    '    if _has_num:',
    '        return "numeric"',
    '    if _has_map:',
    '        return "mapping"',
    '    if _has_text:',
    '        return "text"',
    '    return "unknown"',
    'def _vmu_shape(_v):',
    '    _vn = type(_v).__name__',
    '    try:',
    '        import numpy as _np',
    '        if isinstance(_v, _np.ndarray):',
    '            _ek = "numeric" if _v.dtype.kind in "biufc" else ("text" if _v.dtype.kind in "US" else "unknown")',
    '            if _v.dtype.kind == "O":',
    '                _ek = _vmu_element_kind(_v.ravel().tolist()[:256])',
    // `_vmu_jsonable` (not the raw `.tolist()`): a dict ELEMENT may carry non-string keys, and `json.dumps(
    // default=str)` does NOT stringify keys — the sympy `solve(..., dict=True)` case crashed on exactly that.
    '            return {"kind": "array", "elementKind": _ek, "dtype": str(_v.dtype), "shape": list(_v.shape), "values": _vmu_jsonable(_v)}',
    '        if isinstance(_v, _np.generic):',
    '            return {"kind": "scalar", "value": _v.item(), "dtype": str(_v.dtype)}',
    '    except Exception:',
    '        pass',
    '    try:',
    '        import pandas as _pd',
    '        if isinstance(_v, _pd.DataFrame):',
    '            return {"kind": "frame", "columns": [str(_c) for _c in _v.columns], "index": [str(_i) for _i in _v.index],',
    '                    "dtypes": {str(_c): str(_t) for _c, _t in _v.dtypes.items()}, "rows": _v.astype(object).where(_v.notna(), None).values.tolist()}',
    '        if isinstance(_v, _pd.Series):',
    '            _n = str(_v.name) if _v.name is not None else "value"',
    '            return {"kind": "frame", "columns": [_n], "index": [str(_i) for _i in _v.index],',
    '                    "dtypes": {_n: str(_v.dtype)}, "rows": [[_x] for _x in _v.astype(object).where(_v.notna(), None).tolist()]}',
    // ROUND 7 (B): a pandas Index/columns object had NO path (it fell through to `unknown`) — an `index` is a
    // first-class pandas return value (`df.columns`, `pd.Index([...])`), so it is an array by contract.
    '        if isinstance(_v, _pd.Index):',
    '            _dk = str(_v.dtype)',
    '            _ik = _vmu_element_kind(_v.tolist()[:256])',
    '            return {"kind": "array", "elementKind": _ik, "dtype": _dk, "shape": [len(_v)], "values": _vmu_jsonable([_x for _x in _v.tolist()])}',
    '    except Exception:',
    '        pass',
    '    try:',
    '        import sympy as _sp',
        // Matrices FIRST: `sympy.Matrix` is not a scalar expression, and it used to fall through to `unknown`
        // (a matrix is THE linear-algebra return value) — it is an array whose elements are symbolic.
    '        if hasattr(_sp, "MatrixBase") and isinstance(_v, _sp.MatrixBase):',
    '            return {"kind": "array", "elementKind": "symbolic", "shape": list(_v.shape),',
    '                    "values": [[str(_v[_r, _c]) for _c in range(_v.cols)] for _r in range(_v.rows)],',
    '                    "sympy": _sp.srepr(_v), "latex": _sp.latex(_v)}',
    '        if isinstance(_v, _sp.Basic):',
    '            return {"kind": "expr", "sympy": _sp.srepr(_v), "latex": _sp.latex(_v),',
    '                    "freeSymbols": sorted([str(_s) for _s in _v.free_symbols])}',
    '    except Exception:',
    '        pass',
    // ROUND 7 (B): `scipy.sparse` matrices had no path either (they are neither ndarray nor Basic ⇒ `unknown`),
    // yet sparse linear algebra is a core scipy use case ⇒ array + numeric + the sparsity facts.
    '    try:',
    '        import scipy.sparse as _sps',
    '        if _sps.issparse(_v):',
    '            return {"kind": "array", "elementKind": "numeric", "sparse": True, "dtype": str(_v.dtype),',
    '                    "shape": list(_v.shape), "nnz": int(_v.nnz), "values": _vmu_jsonable(_v.toarray())}',
    '    except Exception:',
    '        pass',
    '    if _vn in ("OptimizeResult", "OdeResult", "RootResults", "TtestResult"):',
    '        return {"kind": "result", "fields": _vmu_jsonable(_v)}',
    '    if isinstance(_v, dict):',
    '        return {"kind": "mapping", "value": _vmu_jsonable(_v)}',
    '    if isinstance(_v, (list, tuple)):',
    '        return {"kind": "array", "elementKind": _vmu_element_kind(_v), "shape": [len(_v)], "values": _vmu_jsonable(list(_v))}',
    '    if isinstance(_v, (int, float, str, bool)) or _v is None:',
    '        return {"kind": "scalar", "value": _v}',
    '    _attrs = [ _a for _a in ("x", "fun", "success", "message", "nit", "status") if hasattr(_v, _a) ]',
    '    if _attrs:',
    '        return {"kind": "result", "fields": { _a: _vmu_jsonable(getattr(_v, _a)) for _a in _attrs }}',
    '    return {"kind": "unknown", "repr": repr(_v)[:200]}',
    'try:',
    '    ' + body.split('\n').join('\n    '),
    'except Exception as _e:',
    '    _vmu_emit({"ok": False, "error": type(_e).__name__ + ": " + str(_e)})',
    '',
  ].filter((l) => l !== '').join('\n')
}

/** Body for `mode:'expr'`: evaluate ONE expression and emit its shape. */
export function exprBody(expr) {
  return '_vmu_emit(dict({"ok": True}, **_vmu_shape(eval(compile(' + JSON.stringify(String(expr)) + ', "<vmu-expr>", "eval")))))'
}

/** Body for `mode:'code'`: run the statements; the caller's `RESULT` (or the last expression) is emitted. */
export function codeBody(code) {
  return [
    '_vmu_ns = {}',
    'exec(compile(' + JSON.stringify(String(code)) + ', "<vmu-code>", "exec"), _vmu_ns)',
    'if "RESULT" in _vmu_ns:',
    '    _vmu_emit(dict({"ok": True}, **_vmu_shape(_vmu_ns["RESULT"])))',
    'else:',
    '    _vmu_emit({"ok": False, "error": "code mode needs a RESULT variable (set RESULT = … at the end)"})',
  ].join('\n')
}

/** Body for `mode:'call'`: import the library and call `module.function(*args)` — the narrowest path. */
export function callBody({ lib, fn, args }) {
  const mod = SCIENTIFIC_LIBS[lib] ? SCIENTIFIC_LIBS[lib].module : String(lib)
  return [
    '_vmu_mod = __import__(' + JSON.stringify(mod) + ')',
    '_vmu_args = _json.loads(' + JSON.stringify(JSON.stringify(args === undefined ? [] : args)) + ')',
    '_vmu_kw = {} if not isinstance(_vmu_args, dict) else _vmu_args',
    '_vmu_pos = [] if isinstance(_vmu_args, dict) else list(_vmu_args)',
    '_vmu_emit(dict({"ok": True}, **_vmu_shape(getattr(_vmu_mod, ' + JSON.stringify(String(fn || '')) + ')(*_vmu_pos, **_vmu_kw))))',
  ].join('\n')
}

/** The stdlib-only environment probe: per library, installed + version (never imports the library). */
export function probeBody(names) {
  return [
    'import importlib.util as _ilu',
    '_vmu_out = []',
    'for _n in _json.loads(' + JSON.stringify(JSON.stringify(names)) + '):',
    '    _spec = None',
    '    try:',
    '        _spec = _ilu.find_spec(_n)',
    '    except Exception:',
    '        _spec = None',
    '    _ver = ""',
    '    if _spec is not None:',
    '        try:',
    '            _m = __import__(_n)',
    '            _ver = str(getattr(_m, "__version__", ""))',
    '        except Exception as _ie:',
    '            _ver = "import-error:" + type(_ie).__name__',
    '    _vmu_out.append({"name": _n, "installed": _spec is not None, "version": _ver})',
    'print(' + JSON.stringify(PROBE_MARKER + ' ') + ' + _json.dumps(_vmu_out))',
  ].join('\n')
}

/** Tail + COUNTED dropped bytes (never a silent cut). */
function tailCounted(s, cap) {
  const str = String(s === undefined || s === null ? '' : s)
  const bytes = Buffer.byteLength(str, 'utf8')
  if (cap <= 0 || bytes <= cap) return { text: str, droppedBytes: 0 }
  let cut = str
  while (Buffer.byteLength(cut, 'utf8') > cap && cut.length > 0) cut = cut.slice(1)
  return { text: cut, droppedBytes: bytes - Buffer.byteLength(cut, 'utf8') }
}

/** Counted truncation by LEAF ELEMENTS (depth-first, stable order); returns { values, dropped }. */
function truncateElements(values, max) {
  const leaves = (v) => {
    if (Array.isArray(v)) return v.reduce((n, x) => n + leaves(x), 0)
    if (typeof v === 'object' && v !== null) return Object.keys(v).reduce((n, k) => n + leaves(v[k]), 0)
    return 1
  }
  if (!(max > 0)) return { values, dropped: 0 }
  if (typeof values !== 'object' || values === null) return { values, dropped: 0 }
  if (leaves(values) <= max) return { values, dropped: 0 }
  let kept = 0
  let dropped = 0
  const walk = (v) => {
    if (Array.isArray(v)) {
      const out = []
      for (const item of v) {
        if (kept >= max) { dropped += leaves(item); continue }   // skip the whole item, never a half-row
        out.push(walk(item))
      }
      return out
    }
    if (typeof v === 'object' && v !== null) {
      const out = {}
      for (const k of Object.keys(v)) {
        if (kept >= max) { dropped += leaves(v[k]); continue }
        out[k] = walk(v[k])
      }
      return out
    }
    kept += 1
    return v
  }
  return { values: walk(values), dropped }
}

function shapeName(raw) {
  if (!raw || typeof raw !== 'object') return 'unknown'
  return SHAPE_KINDS.indexOf(String(raw.kind)) === -1 ? 'unknown' : String(raw.kind)
}

export function createMathAdapters(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  // bus.emit takes (NAME, payload): the single-object shape would be refused by the bus and swallowed.
  const emit = (name, payload) => {
    try {
      if (!o.bus || typeof o.bus.emit !== 'function') return
      const r = o.bus.emit(String(name), payload || {})
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* the broadcast never changes the result */ }
  }
  const spawn = typeof o.spawn === 'function' ? o.spawn : null
  const resolveExecutable = typeof o.resolveExecutable === 'function' ? o.resolveExecutable : null
  // F17: the shared child budget (local timer + real terminate) and the runtime facts it produces.
  const spawnHandle = typeof o.spawnHandle === 'function' ? o.spawnHandle : null
  const budget = createChildBudget({ timer: o.timer })
  let lastSpawnHadHandle = null
  let childrenTerminated = 0
  let childrenTimedOut = 0
  const root = String(o.root || '.')

  let binding = null            // { engine, argv0, at, libs: { name: {installed, version} } }
  let probeCalls = 0
  const calls = []

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const libsRaw = readKey('vmu.math.adapters.libs')
    const enginesRaw = readKey('vmu.math.engines')
    const allowRaw = readKey('vmu.math.adapters.packageAllowlist')
    const cache = String(readKey('vmu.math.adapters.probeCache') || 'session')
    return {
      enabled: readKey('vmu.math.adapters.enabled') !== false,
      // ABSENT ⇒ the four documented libraries (same treatment as `vmu.math.engines`, whose default is the
      // engine order); an EXPLICIT `[]` means "declare none" and is refused by name at probe/run time.
      libs: Array.isArray(libsRaw) ? libsRaw.map(String) : ADAPTER_LIBS.slice(),
      engines: Array.isArray(enginesRaw) ? enginesRaw.map(String) : [],
      explicitPython: String(readKey('vmu.math.adapters.python') || '').trim(),
      packageAllowlist: Array.isArray(allowRaw) ? allowRaw.map((x) => String(x).trim()).filter(Boolean) : [],
      probeCache: cache === 'call' ? 'call' : 'session',
      maxArrayElements: n('vmu.math.adapters.maxArrayElements', 10000),
      maxStringBytes: n('vmu.math.adapters.maxStringBytes', 65536),
    }
  }

  const keysUsed = () => WIRED_KEYS.slice()

  /** Resolve the interpreter: EXPLICIT wins and nothing else is tried; otherwise PATH candidates in order. */
  const interpreter = async () => {
    const c = cfg()
    if (!resolveExecutable) {
      return refuse('VMU_EXTERNAL_UNAVAILABLE', '适配面需要注入 resolveExecutable（本机未接真解释器）',
        '由宿主注入 resolveExecutable；本面绝不假装探测过本机 ✗', undefined, [])
    }
    const tried = []
    if (c.explicitPython) {
      tried.push(c.explicitPython)
      try {
        const p = await resolveExecutable(c.explicitPython)
        if (typeof p === 'string' && p) return { ok: true, engine: 'adapters-python', argv0: p, via: 'explicit', tried }
      } catch (e) { /* explicit failed: refuse, never guess another interpreter */ }
      return refuse('VMU_MATH_LIB_UNAVAILABLE',
        'vmu.math.adapters.python 指定的解释器解析不到：' + c.explicitPython,
        '修正 vmu.math.adapters.python，或清空它让框架按候选顺序解析（显式配置绝不静默回退 ✗）',
        { kind: 'note', key: 'vmu.math.adapters.python', tried },
        ['vmu.math.adapters.python'])
    }
    for (const cand of PY_CANDIDATES) {
      tried.push(cand)
      try {
        const p = await resolveExecutable(cand)
        if (typeof p === 'string' && p) return { ok: true, engine: 'adapters-python', argv0: p, via: 'path', tried }
      } catch (e) { /* try the next candidate */ }
    }
    return refuse('VMU_MATH_LIB_UNAVAILABLE', '本机解析不到任何 python 解释器',
      '装上 python3 或把解释器放进 PATH；也可以用 vmu.math.adapters.python 显式指定',
      { kind: 'user-install', engine: 'python', command: 'winget install --id Python.Python.3.12', tried },
      ['vmu.math.adapters.python'])
  }

  const runChild = async ({ argv, stdin, timeoutMs, cwd }) => {
    if (!spawn) {
      return refuse('VMU_EXTERNAL_UNAVAILABLE', '适配面需要注入 spawn（本机未接真引擎）',
        '由宿主注入 spawn；本面绝不假跑 ✗', undefined, [])
    }
    const started = clock()
    const env = { denyNetwork: true, workspaceOnly: true, adapter: 'python' }
    let out
    let b = { timedOut: false, terminated: false, hadHandle: false }
    try {
      // F17: the budget is LOCAL and `terminate()` is real when the seam gives us a handle (host-native
      // `spawn` returns one synchronously; `spawnHandle` is the explicit form).
      const res = await budget({
        timeoutMs,
        label: 'adapter ' + argv.join(' ').slice(0, 60),
        call: (onHandle) => {
          const spec = { engine: 'adapters-python', argv: argv.slice(), stdin: stdin === undefined ? '' : String(stdin), timeoutMs, graceMs: timeoutMs, env }
          return spawnHandle ? spawnHandle(spec, onHandle) : spawn(spec)
        },
      })
      out = res.result
      b = { timedOut: res.timedOut, terminated: res.terminated, hadHandle: res.hadHandle }
      lastSpawnHadHandle = res.hadHandle
      if (b.terminated) childrenTerminated += 1
      if (b.timedOut) childrenTimedOut += 1
    } catch (e) {
      return refuse('VMU_MATH_HARNESS_FAILED', '解释器起不来：' + String((e && e.message) || e), '检查注入的 spawn 接缝', undefined, [])
    }
    const r = out || {}
    return {
      ok: true,
      run: {
        exitCode: (r.timedOut === true || b.timedOut) ? null : Number(r.exitCode),
        timedOut: r.timedOut === true || b.timedOut,
        terminated: !!b.terminated, hadHandle: !!b.hadHandle,
        stdout: String(r.stdout || ''), stderr: String(r.stderr || ''),
        hostLossy: !!((r.stdoutLossy) || (r.stderrLossy)), spillPath: (r.stdoutSpill || r.stderrSpill) || null,
        ms: clock() - started,
      },
    }
  }

  /** Probe the environment ONCE (or per call when asked) and remember the binding. */
  const probe = async (a) => {
    const args = a || {}
    const c = cfg()
    if (!c.enabled) {
      return refuse('VMU_MATH_UNSUPPORTED_OP', '数学库适配面已关闭（vmu.math.adapters.enabled=false）',
        '打开它，或不要调用适配动作', undefined, ['vmu.math.adapters.enabled'])
    }
    if (c.libs.length === 0) {
      return refuse('VMU_MATH_UNSUPPORTED_OP', '未声明任何库（vmu.math.adapters.libs 为空）',
        '零机制不允许"猜一个库"：先在设置里声明 numpy/scipy/pandas/sympy', undefined, ['vmu.math.adapters.libs'])
    }
    if (args.refresh !== true && c.probeCache === 'session' && binding) {
      return { ok: true, cached: true, ...binding, isRefutation: false, enforced: ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs', 'vmu.math.adapters.probeCache'], enforcedScope: ENFORCED_SCOPE }
    }
    const interp = await interpreter()
    if (interp.ok !== true) return interp
    const body = probeBody(c.libs)
    const argv = [interp.argv0, '-c', buildHarness({ imports: [], body })]
    const res = await runChild({ argv, timeoutMs: 20000, cwd: root })
    if (res.ok !== true) return res
    probeCalls += 1
    if (res.run.timedOut) {
      return refuse('MATH_TIMEOUT', '环境探测超时（20000 ms）', '检查解释器是否能正常启动（注入的 spawn 决定）', undefined, [])
    }
    const line = res.run.stdout.split('\n').filter((l) => l.indexOf(PROBE_MARKER) === 0).pop()
    if (!line) {
      // Diagnosability: if the harness itself failed, it says so on the RESULT marker — surface that
      // (a bare "no marker line" would hide a NameError inside the generated harness).
      const errLine = res.run.stdout.split('\n').filter((l) => l.indexOf(RESULT_MARKER) === 0).pop()
      let harnessError = ''
      if (errLine) { try { harnessError = String((JSON.parse(errLine.slice(RESULT_MARKER.length + 1)) || {}).error || '') } catch (e) { harnessError = '' } }
      const tail = tailCounted(res.run.stderr, 2000)
      return refuse('VMU_MATH_RESULT_UNPARSEABLE', '环境探测没有输出标记行（exit=' + res.run.exitCode + '）' + (harnessError ? '；harness 报错：' + harnessError : ''),
        '看 stderr 尾部：' + tail.text.split('\n').slice(-3).join(' | '),
        { kind: 'note', droppedBytes: tail.droppedBytes, probeCalls, harnessError: harnessError || null }, [])
    }
    let parsed
    try { parsed = JSON.parse(line.slice(PROBE_MARKER.length + 1)) } catch (e) {
      return refuse('VMU_MATH_RESULT_UNPARSEABLE', '环境探测输出不是 JSON：' + String((e && e.message) || e), '这是接缝/宿主问题，不是本机是否装库的问题', undefined, [])
    }
    const libs = {}
    const missing = []
    for (const row of (Array.isArray(parsed) ? parsed : [])) {
      const name = String(row && row.name || '')
      if (!name) continue
      const installed = !!(row && row.installed)
      libs[name] = { installed, version: installed ? String(row.version || '') || null : null }
      if (!installed) missing.push(name)
    }
    binding = {
      ok: true,                       // the stored binding is itself a success value: `run()` reads it directly
      engine: interp.engine, interpreter: interp.argv0, via: interp.via,
      at: clock(), libs, missing, probeCalls,
    }
    emit('math/adapters-probed', { interpreter: interp.argv0, declared: c.libs.slice(), missing: missing.slice() })
    log('math/adapters: probed ' + c.libs.length + ' libs via ' + interp.argv0 + ' (' + missing.length + ' missing)')
    return {
      ok: true, cached: false, isRefutation: false,
      ...binding,
      enforced: ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs', 'vmu.math.adapters.probeCache'].concat(c.explicitPython ? ['vmu.math.adapters.python'] : []),
      enforcedScope: ENFORCED_SCOPE,
      next: missing.length ? { kind: 'agent-install', engine: 'python', packages: missing.slice(),
        command: missing.map((m) => (SCIENTIFIC_LIBS[m] ? SCIENTIFIC_LIBS[m].installCommand : 'python -m pip install --user ' + m)).join(' ; '),
        hint: '缺库是具名降级：可以先出安装计划（math_computation {op:\'install\'}），不要假装算过' } : null,
    }
  }

  /** Everything a caller needs to see what WOULD run — works with no seam injected at all. */
  const plan = async (a) => {
    const args = a || {}
    const c = cfg()
    const SCOPE = ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs']
    if (!c.enabled) return refuse('VMU_MATH_UNSUPPORTED_OP', '数学库适配面已关闭（vmu.math.adapters.enabled=false）', '打开它，或不要调用适配动作', undefined, ['vmu.math.adapters.enabled'])
    const lib = String(args.lib || '').trim()
    if (!lib) return refuse('VMU_MATH_INVALID_INPUT', 'plan 需要 lib', '声明 numpy|scipy|pandas|sympy（见 vmu.math.adapters.libs）', undefined, SCOPE)
    if (!SCIENTIFIC_LIBS[lib]) return refuse('VMU_MATH_ADAPTER_OP_UNKNOWN', '未知的库：' + lib, '允许：' + Object.keys(SCIENTIFIC_LIBS).join('|'), undefined, [])
    if (c.libs.indexOf(lib) === -1) {
      return refuse('VMU_MATH_LIB_NOT_DECLARED', '库未声明：' + lib, '已声明：' + (c.libs.join('、') || '（空）') + '（vmu.math.adapters.libs）', undefined, ['vmu.math.adapters.libs'])
    }
    const mode = String(args.mode || (args.expr !== undefined ? 'expr' : args.code !== undefined ? 'code' : args.fn !== undefined ? 'call' : '')).trim()
    const enforced = ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs', 'vmu.math.adapters.probeCache', 'vmu.math.adapters.maxArrayElements', 'vmu.math.adapters.maxStringBytes']
    if (c.explicitPython) enforced.push('vmu.math.adapters.python')
    if (c.packageAllowlist.length) enforced.push('vmu.math.adapters.packageAllowlist')
    return {
      ok: true, isRefutation: false, lib, mode: mode || null,
      imports: SCIENTIFIC_LIBS[lib].pythonImport,
      interpreter: c.explicitPython || ('<' + PY_CANDIDATES.join('|') + '>（按序解析，第一个命中）'),
      argvTemplate: ['<interpreter>', '-c', '<harness: ' + lib + ' + result-shape envelope>'],
      receiptShape: Object.keys(RESULT_ENVELOPE),
      shapeKinds: SHAPE_KINDS.slice(),
      elementKinds: ELEMENT_KINDS.slice(),
      caps: { maxArrayElements: c.maxArrayElements, maxStringBytes: c.maxStringBytes },
      probeCache: c.probeCache,
      needs: { resolveExecutable: true, spawn: true, network: false, install: false },
      enforced,
      enforcedScope: ENFORCED_SCOPE,
    }
  }

  /** Run one expression / code block / library call and normalise the result into the envelope. */
  const run = async (a) => {
    const args = a || {}
    const c = cfg()
    const SCOPE = ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs']
    if (!c.enabled) return refuse('VMU_MATH_UNSUPPORTED_OP', '数学库适配面已关闭（vmu.math.adapters.enabled=false）', '打开它，或不要调用适配动作', undefined, ['vmu.math.adapters.enabled'])
    const lib = String(args.lib || '').trim()
    if (!lib) return refuse('VMU_MATH_INVALID_INPUT', 'run 需要 lib', '声明 numpy|scipy|pandas|sympy', undefined, SCOPE)
    if (!SCIENTIFIC_LIBS[lib]) return refuse('VMU_MATH_ADAPTER_OP_UNKNOWN', '未知的库：' + lib, '允许：' + Object.keys(SCIENTIFIC_LIBS).join('|'), undefined, [])
    if (c.libs.indexOf(lib) === -1) {
      return refuse('VMU_MATH_LIB_NOT_DECLARED', '库未声明：' + lib, '已声明：' + (c.libs.join('、') || '（空）') + '（vmu.math.adapters.libs）', undefined, ['vmu.math.adapters.libs'])
    }
    const packages = Array.isArray(args.packages) ? args.packages.map(String).filter(Boolean) : []
    if (c.packageAllowlist.length) {
      const outside = packages.filter((p) => c.packageAllowlist.indexOf(p) === -1)
      if (outside.length) {
        return refuse('VMU_MATH_INVALID_INPUT', '包不在白名单内：' + outside.join('、'),
          'vmu.math.adapters.packageAllowlist = [' + c.packageAllowlist.join(', ') + ']（空＝不限制）', undefined, ['vmu.math.adapters.packageAllowlist'])
      }
    }
    const isRandom = args.random === true || args.seed !== undefined
    const seed = (args.seed === undefined || args.seed === null) ? '' : String(args.seed)
    if (isRandom && !seed) {
      return refuse('VMU_MATH_SEED_REQUIRED', '随机作业缺种子（requireSeedForRandom 口径一致）', '给 seed；不许写"应该能复现"', undefined, [])
    }
    const mode = args.expr !== undefined ? 'expr' : (args.code !== undefined ? 'code' : (args.fn !== undefined ? 'call' : ''))
    if (!mode) return refuse('VMU_MATH_EXPR_REQUIRED', 'run 需要 expr / code / fn 之一', 'expr＝单表达式；code＝语句块且需设 RESULT；fn＝调用 lib 的函数', undefined, [])

    // The binding is required BEFORE running: a run that did not verify the environment is not evidence.
    let b = args.refresh === true || c.probeCache === 'call' ? await probe({ refresh: true }) : (binding || await probe({}))
    if (b.ok !== true) return b
    const info = b.libs[lib] || { installed: false, version: null }
    if (!info.installed) {
      return refuse('VMU_MATH_LIB_UNAVAILABLE', '库未安装或不可导入：' + lib + '（解释器 ' + b.interpreter + '）',
        '装上它，或用 math_computation {op:\'install\'} 出安装计划；本面绝不假装算过：' + SCIENTIFIC_LIBS[lib].installCommand,
        { kind: 'agent-install', engine: 'python', packages: [lib], version: info.version, command: SCIENTIFIC_LIBS[lib].installCommand, interpreter: b.interpreter },
        ['vmu.math.adapters.libs'])
    }

    const imports = [SCIENTIFIC_LIBS[lib].pythonImport]
    const body = mode === 'expr' ? exprBody(args.expr) : mode === 'code' ? codeBody(args.code) : callBody({ lib, fn: args.fn, args: args.args })
    const harness = buildHarness({ imports, seed, body })
    const argv = [b.interpreter, '-c', harness]
    const timeoutMs = Number(args.timeoutMs) > 0 ? Math.floor(Number(args.timeoutMs)) : 120000
    const jobId = o.ids && typeof o.ids.mint === 'function' ? o.ids.mint('mathadapter', 'ad-') : mintId('mathadapter', 'ad-')
    const res = await runChild({ argv, timeoutMs, stdin: args.stdin, cwd: root })
    if (res.ok !== true) return res
    const rr = res.run
    const inputFingerprint = fingerprint({ lib, mode, expr: args.expr, code: args.code, fn: args.fn, args: args.args, seed, imports })
    const baseReceipt = {
      jobId, engine: 'adapters-python', interpreter: b.interpreter, lib, mode,
      argv: ['<interpreter>', '-c', '<harness:' + harness.length + 'B>'],
      exitCode: rr.exitCode, durationMs: rr.ms, timedOut: rr.timedOut,
      inputFingerprint, outputFingerprint: fingerprint(rr.stdout + '\u0000' + rr.stderr),
      bindingAt: b.at,
    }
    calls.push({ jobId, lib, mode, at: clock(), exitCode: rr.exitCode, timedOut: rr.timedOut })
    if (calls.length > 200) calls.shift()
    // House standard (kernel/mathtools.js): a receipt names the keys that actually fired, so a reader
    // can tell "this value came from a setting" without diffing the schema.
    const enforced = ['vmu.math.adapters.enabled', 'vmu.math.adapters.libs', 'vmu.math.adapters.probeCache',
      'vmu.math.adapters.maxArrayElements', 'vmu.math.adapters.maxStringBytes']
    if (c.explicitPython) enforced.push('vmu.math.adapters.python')
    if (c.packageAllowlist.length) enforced.push('vmu.math.adapters.packageAllowlist')
    emit('math/adapters-ran', { jobId, lib, mode, exitCode: rr.exitCode, timedOut: rr.timedOut, interpreter: b.interpreter })

    if (rr.timedOut) {
      const se = tailCounted(rr.stderr, c.maxStringBytes)
      return Object.assign(refuse('MATH_TIMEOUT', '适配运行超时（>' + timeoutMs + ' ms）', '见 partial stdout/stderr；丢弃字节已计数', undefined, []),
        { receipt: baseReceipt, partial: { stdout: tailCounted(rr.stdout, c.maxStringBytes).text, stderr: se.text, dropped: { droppedBytes: se.droppedBytes } }, isRefutation: false })
    }
    const line = rr.stdout.split('\n').filter((l) => l.indexOf(RESULT_MARKER) === 0).pop()
    const seFull = tailCounted(rr.stderr, c.maxStringBytes)
    if (!line) {
      if (rr.exitCode !== 0) {
        return Object.assign(refuse('MATH_NONZERO_EXIT', '引擎非零退出：' + rr.exitCode, 'stderr 尾部：' + seFull.text.split('\n').slice(-3).join(' | '), undefined, []),
          { receipt: baseReceipt, stderrTail: seFull.text.split('\n').slice(-5).join('\n'), dropped: { droppedBytes: seFull.droppedBytes }, isRefutation: false })
      }
      return Object.assign(refuse('VMU_MATH_RESULT_UNPARSEABLE', '适配结果没有输出信封行（exit=0）',
        'run 的 harness 必须打印 ' + RESULT_MARKER + ' 一行；这通常说明 code 模式没有设置 RESULT', undefined, []),
      { receipt: baseReceipt, stderrTail: seFull.text.split('\n').slice(-5).join('\n'), isRefutation: false })
    }
    let raw
    try { raw = JSON.parse(line.slice(RESULT_MARKER.length + 1)) } catch (e) {
      return Object.assign(refuse('VMU_MATH_RESULT_UNPARSEABLE', '结果信封不是合法 JSON：' + String((e && e.message) || e), '接缝/转义问题；不是数学结论', undefined, []),
        { receipt: baseReceipt, isRefutation: false })
    }
    if (!raw || raw.ok !== true) {
      return Object.assign(refuse('VMU_MATH_HARNESS_FAILED', '库调用失败：' + String((raw && raw.error) || 'unknown'),
        '这是被调用代码的缺陷，不是命题为假（isRefutation 恒 false）', undefined, []),
      { receipt: baseReceipt, stderrTail: seFull.text.split('\n').slice(-5).join('\n'), isRefutation: false })
    }
    const kind = shapeName(raw)
    if (kind === 'unknown') {
      return Object.assign(refuse('VMU_MATH_SHAPE_UNKNOWN', '返回值的形状不在契约内（kind=' + String(raw.kind) + '）',
        '允许的形状：' + SHAPE_KINDS.join('|') + '；把返回值包成数组/标量/DataFrame/符号表达式，或显式 JSON 化', undefined, []),
      { receipt: baseReceipt, repr: String(raw.repr || '').slice(0, 200), isRefutation: false })
    }
    const dropped = { droppedElements: 0, droppedBytes: 0 }
    let payload = {}
    if (kind === 'array') {
      const t = truncateElements(raw.values === undefined ? [] : raw.values, c.maxArrayElements)
      payload = { values: t.values, shape: Array.isArray(raw.shape) ? raw.shape.slice() : [Array.isArray(t.values) ? t.values.length : 0] }
      dropped.droppedElements = t.dropped
      if (raw.dtype !== undefined) payload.dtype = String(raw.dtype)
      // ROUND 7 · A: the second axis. An undeclared word is normalised to `unknown` — never passed through raw.
      if (raw.elementKind !== undefined) {
        const ek = String(raw.elementKind)
        payload.elementKind = ELEMENT_KINDS.indexOf(ek) === -1 ? 'unknown' : ek
      } else {
        payload.elementKind = 'unknown'
      }
      if (raw.sparse === true) { payload.sparse = true; payload.nnz = Number(raw.nnz) || 0 }
      if (raw.sympy !== undefined) payload.sympy = String(raw.sympy)
    } else if (kind === 'frame') {
      const t = truncateElements(raw.rows === undefined ? [] : raw.rows, c.maxArrayElements)
      payload = { columns: (raw.columns || []).map(String), index: (raw.index || []).map(String), dtypes: raw.dtypes || {}, rows: t.values }
      dropped.droppedElements = t.dropped
    } else if (kind === 'expr') {
      const s = tailCounted(String(raw.sympy || ''), c.maxStringBytes)
      const l = tailCounted(String(raw.latex || ''), c.maxStringBytes)
      payload = { sympy: s.text, latex: l.text, freeSymbols: (raw.freeSymbols || []).map(String) }
      dropped.droppedBytes = s.droppedBytes + l.droppedBytes
    } else if (kind === 'result') {
      const s = tailCounted(JSON.stringify(raw.fields === undefined ? {} : raw.fields), c.maxStringBytes)
      dropped.droppedBytes = s.droppedBytes
      let fields = {}
      try { fields = JSON.parse(s.text) } catch (e) { fields = {} }
      payload = { fields }
    } else if (kind === 'mapping') {
      const s = tailCounted(JSON.stringify(raw.value === undefined ? {} : raw.value), c.maxStringBytes)
      dropped.droppedBytes = s.droppedBytes
      let value = {}
      try { value = JSON.parse(s.text) } catch (e) { value = {} }
      payload = { value }
    } else {
      payload = { value: raw.value === undefined ? null : raw.value }
      if (raw.dtype !== undefined) payload.dtype = String(raw.dtype)
    }
    return Object.assign({
      ok: true, isRefutation: false, lib, version: info.version,
      kind, ...payload,
      truncated: dropped,
      enforced,
      enforcedScope: ENFORCED_SCOPE,
      receipt: baseReceipt,
    })
  }

  /** The contract as data (docs/03 · docs/18 cite it; callers can assert against it). */
  const shapeContract = () => ({
    ok: true,
    schema: 'vmu/math-adapter-result@1',
    kinds: SHAPE_KINDS.slice(),
    elementKinds: ELEMENT_KINDS.slice(),
    envelope: RESULT_ENVELOPE,
    markers: { result: RESULT_MARKER, probe: PROBE_MARKER },
    libs: Object.keys(SCIENTIFIC_LIBS).map((k) => ({
      name: k, module: SCIENTIFIC_LIBS[k].module, provides: SCIENTIFIC_LIBS[k].provides.slice(),
      installCommand: SCIENTIFIC_LIBS[k].installCommand, docs: SCIENTIFIC_LIBS[k].docs,
      resultKind: k === 'pandas' ? 'frame' : (k === 'sympy' ? 'expr' : (k === 'scipy' ? 'result' : 'array')),
    })),
    neverRefutes: true,
  })

  /** Read-only observability. */
  const status = () => {
    const c = cfg()
    return {
      ok: true,
      enabled: c.enabled,
      declaredLibs: c.libs.slice(),
      assigned: Object.keys(SCIENTIFIC_LIBS).filter((k) => c.libs.indexOf(k) !== -1),
      undeclaredKnown: Object.keys(SCIENTIFIC_LIBS).filter((k) => c.libs.indexOf(k) === -1),
      explicitPython: c.explicitPython || null,
      probeCache: c.probeCache,
      caps: { maxArrayElements: c.maxArrayElements, maxStringBytes: c.maxStringBytes },
      packageAllowlist: c.packageAllowlist.slice(),
      binding: binding ? { interpreter: binding.interpreter, via: binding.via, at: binding.at, libs: binding.libs, missing: binding.missing.slice() } : null,
      seam: { resolveExecutable: !!resolveExecutable, spawn: !!spawn, spawnHandle: !!spawnHandle },
      // F17: the budget is LOCAL (no hang); terminating needs a handle ⇒ report the declared seam AND the
      // runtime fact (a host-native spawn returns a SubprocessHandle synchronously).
      subprocess: {
        budget: 'local-timer', declaredKillableSeam: !!spawnHandle, lastSpawnHadHandle,
        canTerminateChild: !!(spawnHandle || lastSpawnHadHandle === true),
        childrenTerminated, childrenTimedOut, graceMsSent: true,
        hostContract: 'subprocess.spawn → SubprocessHandle{terminate, done, collected}',
      },
      probeCalls, calls: calls.length,
      wiredKeys: WIRED_KEYS.length,
      neverRefutes: true,
      shapeKinds: SHAPE_KINDS.slice(),
      elementKinds: ELEMENT_KINDS.slice(),
    }
  }

  return { probe, plan, run, shapeContract, status, keysUsed, config: cfg, clearBinding: () => { binding = null } }
}

export default createMathAdapters
