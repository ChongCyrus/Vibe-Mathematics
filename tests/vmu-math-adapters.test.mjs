// vibe-math-vmu —— ROUND 2 目标 5 A：科学计算库**专用适配面**（kernel/mathadapters.js）。
// 运行：`node tests/vmu-math-adapters.test.mjs`（末行 `=== VMU MATH ADAPTERS: N passed, M failed ===`）。
//
// 非空过原则：**不依赖本机装了什么**。环境探测与执行都走注入接缝，测试自己扮演宿主：
//   ① 假 resolveExecutable（可设为解析失败）② 假 spawn（按 argv 区分"环境探测"与"运行"）。
// 每个具名拒都断言 code；每个成功都断言**形状契约**的字段；每个截断都断言**计数**。

import assert from 'node:assert/strict'
import {
  createMathAdapters, SCIENTIFIC_LIBS, SHAPE_KINDS, ELEMENT_KINDS, RESULT_ENVELOPE, WIRED_KEYS,
  buildHarness, exprBody, codeBody, callBody, probeBody, fingerprint,
  RESULT_MARKER, PROBE_MARKER,
} from '../vibe-math-vmu/kernel/mathadapters.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

const probeLine = (rows) => PROBE_MARKER + ' ' + JSON.stringify(rows)
const resultLine = (obj) => RESULT_MARKER + ' ' + JSON.stringify(obj)

const mkSettings = (over = {}) => {
  const vals = Object.assign({
    'vmu.math.adapters.enabled': true,
    'vmu.math.adapters.libs': ['numpy', 'scipy', 'pandas', 'sympy'],
    'vmu.math.engines': ['python'],
    'vmu.math.computation': 'auto',
  }, over)
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const okResolve = async (cmd) => { if (String(cmd).indexOf('python') === 0) return '/fake/bin/' + cmd; throw new Error('not found: ' + cmd) }
const deadResolve = async (cmd) => { throw new Error('not found: ' + cmd) }

/** Fake spawn: classifies the call by marker, records every call. */
function fakeSpawn({ probe = probeLine([{ name: 'numpy', installed: true, version: '1.26.0' }]), result = resultLine({ ok: true, kind: 'scalar', value: 42 }), exitCode = 0, timedOut = false, stderr = '', queue = null } = {}) {
  const calls = []
  const fn = async (a) => {
    calls.push(a)
    const joined = (a.argv || []).join(' ')
    if (joined.indexOf(PROBE_MARKER) !== -1) return { exitCode: 0, stdout: probe, stderr: '' }
    if (queue) return queue.shift() || { exitCode: 0, stdout: result, stderr: '' }
    if (timedOut) return { exitCode: null, timedOut: true, stdout: 'partial-out', stderr: 'partial-err' }
    return { exitCode, stdout: result, stderr }
  }
  fn.calls = calls
  return fn
}
const ALL = probeLine([
  { name: 'numpy', installed: true, version: '1.26.0' },
  { name: 'scipy', installed: true, version: '1.11.0' },
  { name: 'pandas', installed: true, version: '2.1.0' },
  { name: 'sympy', installed: true, version: '1.12' },
])
const mkGov = (over = {}, seam = {}) => {
  const s = mkSettings(over)
  const spawn = seam.spawn || fakeSpawn({ probe: ALL })
  const gov = createMathAdapters({
    settings: s.settings, clock: seam.clock || (() => 0), spawn,
    resolveExecutable: seam.resolveExecutable || okResolve, root: '/fake/project',
  })
  return { gov, s, spawn }
}

/** Classifiers for the fake spawn's recorded calls (a probe argv carries the probe body). */
const isProbe = (a) => (a.argv || []).join(' ').indexOf(PROBE_MARKER) !== -1
const isRun = (a) => !isProbe(a) && (a.argv || []).join(' ').indexOf(RESULT_MARKER) !== -1

// ── 1. 接缝未注入 ⇒ 具名拒；plan() 仍可用（声明要跑什么，但绝不假跑）────────────────────
test('no seam: probe/run refuse by name while plan() still answers', async () => {
  const s = mkSettings()
  const gov = createMathAdapters({ settings: s.settings, clock: () => 0 })   // NO seams at all
  const p = await gov.probe({})
  assert.equal(p.ok, false)
  assert.equal(p.code, 'VMU_EXTERNAL_UNAVAILABLE')
  const pl = await gov.plan({ lib: 'numpy', expr: '1+1' })
  assert.equal(pl.ok, true)
  assert.deepEqual(pl.shapeKinds, SHAPE_KINDS.slice())
  assert.equal(pl.needs.spawn, true)
  const r = await gov.run({ lib: 'numpy', expr: '1+1' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_EXTERNAL_UNAVAILABLE')
  passed += 1
})

// ── 2. 零机制：面关闭 / 库列表被显式清空 ⇒ 具名拒（缺省＝四个库，与 vmu.math.engines 同待遇）──
test('zero-mechanism: adapters off or an explicitly emptied lib list refuses by name', async () => {
  const off = mkGov({ 'vmu.math.adapters.enabled': false }).gov
  assert.equal((await off.probe({})).code, 'VMU_MATH_UNSUPPORTED_OP')
  assert.equal((await off.plan({ lib: 'numpy' })).code, 'VMU_MATH_UNSUPPORTED_OP')
  assert.equal((await off.run({ lib: 'numpy', expr: '1' })).code, 'VMU_MATH_UNSUPPORTED_OP')
  const none = mkGov({ 'vmu.math.adapters.libs': [] }).gov
  assert.equal((await none.probe({})).code, 'VMU_MATH_UNSUPPORTED_OP')
  // ABSENT (not emptied) ⇒ the four documented libraries, exactly as the schema default says.
  const absent = createMathAdapters({ settings: { get: (k) => (k === 'vmu.math.engines' ? ['python'] : undefined) }, clock: () => 0, spawn: fakeSpawn({ probe: ALL }), resolveExecutable: okResolve })
  assert.deepEqual(absent.status().declaredLibs, ['numpy', 'scipy', 'pandas', 'sympy'])
  passed += 1
})

// ── 3. plan()：缺 lib / 未知 lib / 未声明 lib 三种具名拒 ─────────────────────────────────
test('plan() refuses a missing, unknown or undeclared library by name', async () => {
  const { gov } = mkGov()
  assert.equal((await gov.plan({})).code, 'VMU_MATH_INVALID_INPUT')
  assert.equal((await gov.plan({ lib: 'matlab' })).code, 'VMU_MATH_ADAPTER_OP_UNKNOWN')
  assert.equal((await gov.plan({ lib: 'numpy' })).ok, true)
  const only = mkGov({ 'vmu.math.adapters.libs': ['numpy'] }).gov
  assert.equal((await only.plan({ lib: 'sympy' })).code, 'VMU_MATH_LIB_NOT_DECLARED')
  passed += 1
})

// ── 4. 显式解释器解析不到 ⇒ 具名拒，**绝不回退猜测** ────────────────────────────────────
test('an unresolvable explicit interpreter is refused (no silent fallback)', async () => {
  const { gov, spawn } = mkGov({ 'vmu.math.adapters.python': '/no/such/python' }, { resolveExecutable: deadResolve })
  const p = await gov.probe({})
  assert.equal(p.ok, false)
  assert.equal(p.code, 'VMU_MATH_LIB_UNAVAILABLE')
  assert.ok(p.hint.indexOf('vmu.math.adapters.python') !== -1, 'hint 必须点名那个设置键')
  assert.equal(spawn.calls.length, 0, '显式配置失败时不得偷偷去跑别的解释器')
  passed += 1
})

// ── 5. 探测：逐个库报 installed/version，缺库带 next（agent-install + 安装命令）──────────
test('probe() reports per-library installation and a named next for missing libs', async () => {
  const probe = probeLine([
    { name: 'numpy', installed: true, version: '1.26.0' },
    { name: 'scipy', installed: false, version: '' },
  ])
  const { gov } = mkGov({}, { spawn: fakeSpawn({ probe }) })
  const p = await gov.probe({})
  assert.equal(p.ok, true)
  assert.equal(p.libs.numpy.installed, true)
  assert.equal(p.libs.numpy.version, '1.26.0')
  assert.equal(p.libs.scipy.installed, false)
  assert.deepEqual(p.missing, ['scipy'])
  assert.equal(p.next.kind, 'agent-install')
  assert.ok(p.next.command.indexOf('pip install') !== -1)
  assert.equal(p.isRefutation, false)
  passed += 1
})

// ── 6. 会话级环境绑定：session 缓存／call 重探 ───────────────────────────────────────────
test('the environment binding is cached per session, or re-probed per call', async () => {
  const a = mkGov()
  await a.gov.probe({})
  const again = await a.gov.probe({})
  assert.equal(again.cached, true)
  assert.equal(a.spawn.calls.filter((c) => c.argv.join(' ').indexOf(PROBE_MARKER) !== -1).length, 1, 'session 口径只探一次')
  const b = mkGov({ 'vmu.math.adapters.probeCache': 'call' })
  await b.gov.probe({})
  await b.gov.probe({})
  assert.equal(b.spawn.calls.filter((c) => c.argv.join(' ').indexOf(PROBE_MARKER) !== -1).length, 2, 'call 口径每次重探')
  const c = mkGov()
  await c.gov.probe({})
  await c.gov.probe({ refresh: true })
  assert.equal(c.spawn.calls.filter((x) => x.argv.join(' ').indexOf(PROBE_MARKER) !== -1).length, 2, 'refresh 强制重探')
  passed += 1
})

// ── 7. 库未安装 ⇒ 具名拒 + next（绝不假装算过）──────────────────────────────────────────
test('running a library that is not installed is refused with an install next', async () => {
  const probe = probeLine([{ name: 'numpy', installed: false, version: '' }])
  const { gov, spawn } = mkGov({ 'vmu.math.adapters.libs': ['numpy'] }, { spawn: fakeSpawn({ probe }) })
  const r = await gov.run({ lib: 'numpy', expr: '1+1' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_MATH_LIB_UNAVAILABLE')
  assert.equal(r.next.kind, 'agent-install')
  assert.ok(r.next.command.indexOf('pip install') !== -1)
  assert.equal(spawn.calls.filter(isRun).length, 0, '缺库时**不得**发起运行（只允许一次环境探测）')
  assert.equal(spawn.calls.filter(isProbe).length, 1)
  passed += 1
})

// ── 8. 形状契约：scalar / array / frame / expr / result / mapping 六型 ────────────────────
test('the six shape kinds normalise into the documented envelope', async () => {
  const rows = [
    ['scalar', resultLine({ ok: true, kind: 'scalar', value: 42, dtype: 'int64' }), (r) => { assert.equal(r.value, 42); assert.equal(r.dtype, 'int64') }],
    ['array', resultLine({ ok: true, kind: 'array', dtype: 'int64', shape: [2, 2], values: [[1, 2], [3, 4]] }), (r) => { assert.deepEqual(r.values, [[1, 2], [3, 4]]); assert.deepEqual(r.shape, [2, 2]) }],
    ['frame', resultLine({ ok: true, kind: 'frame', columns: ['a'], index: ['0'], dtypes: { a: 'int64' }, rows: [[1]] }), (r) => { assert.deepEqual(r.columns, ['a']); assert.deepEqual(r.rows, [[1]]) }],
    ['expr', resultLine({ ok: true, kind: 'expr', sympy: 'Add(Symbol("x"), Integer(1))', latex: 'x + 1', freeSymbols: ['x'] }), (r) => { assert.deepEqual(r.freeSymbols, ['x']); assert.equal(r.latex, 'x + 1') }],
    ['result', resultLine({ ok: true, kind: 'result', fields: { success: true, nit: 3 } }), (r) => { assert.equal(r.fields.nit, 3) }],
    ['mapping', resultLine({ ok: true, kind: 'mapping', value: { a: 1 } }), (r) => { assert.deepEqual(r.value, { a: 1 }) }],
  ]
  for (const [kind, line, check] of rows) {
    const { gov } = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: line }) })
    const r = await gov.run({ lib: 'numpy', expr: 'X' })
    assert.equal(r.ok, true, kind + ' 必须成功：' + JSON.stringify(r))
    assert.equal(r.kind, kind)
    assert.deepEqual(r.truncated, { droppedElements: 0, droppedBytes: 0 })
    assert.ok(r.receipt && r.receipt.jobId && r.receipt.inputFingerprint && r.receipt.outputFingerprint, kind + ' 必须带回执指纹')
    assert.ok(Array.isArray(r.enforced) && r.enforced.indexOf('vmu.math.adapters.maxArrayElements') !== -1, kind + ' 必须带 enforced[]（本所标准）')
    assert.equal(r.isRefutation, false)
    check(r)
  }  passed += 1
})

// ── 8b. ROUND 7 · A：`kind:"array"` 的第二轴 `elementKind`（符号解列表 ≠ 数值数组）────────────
test('the array second axis `elementKind` is declared, passed through, and never invented', async () => {
  // 契约面必须公布这一轴（否则调用方无从知道可分支）
  const { gov: g0 } = mkGov({}, { spawn: fakeSpawn({ probe: ALL }) })
  const sc = g0.shapeContract()
  assert.deepEqual(sc.elementKinds, ELEMENT_KINDS.slice(), 'shapeContract 必须公布 elementKinds')
  assert.ok(sc.elementKinds.indexOf('symbolic') !== -1 && sc.elementKinds.indexOf('numeric') !== -1)

  const cases = [
    ['symbolic', { ok: true, kind: 'array', elementKind: 'symbolic', shape: [2], values: ['-2', '2'] }, 'symbolic'],
    ['numeric', { ok: true, kind: 'array', elementKind: 'numeric', dtype: 'int64', shape: [2], values: [1, 2] }, 'numeric'],
    ['mapping', { ok: true, kind: 'array', elementKind: 'mapping', shape: [2], values: [{ x: '-2' }, { x: '2' }] }, 'mapping'],
    ['text', { ok: true, kind: 'array', elementKind: 'text', shape: [1], values: ['a'] }, 'text'],
    ['mixed', { ok: true, kind: 'array', elementKind: 'mixed', shape: [2], values: [1, 'text'] }, 'mixed'],
    // 未声明的词一律归 `unknown`（不许原样透传，也不许替调用方"猜"一个意思）
    ['undeclared→unknown', { ok: true, kind: 'array', elementKind: 'weird-word', shape: [1], values: [1] }, 'unknown'],
    // 缺字段 ⇒ `unknown`（默认存在，调用方不必判 undefined）
    ['absent→unknown', { ok: true, kind: 'array', shape: [1], values: [1] }, 'unknown'],
  ]
  for (const [label, raw, want] of cases) {
    const { gov } = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: resultLine(raw) }) })
    const r = await gov.run({ lib: 'numpy', expr: 'X' })
    assert.equal(r.ok, true, label + ' 必须成功：' + JSON.stringify(r))
    assert.equal(r.kind, 'array')
    assert.equal(r.elementKind, want, label + ' ⇒ elementKind 必须是 ' + want + '：' + JSON.stringify(r.elementKind))
  }
  // 稀疏矩阵的特化事实也一起过（scipy 的 csr_matrix 曾整类落到 unknown）
  const { gov: g2 } = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: resultLine({ ok: true, kind: 'array', elementKind: 'numeric', sparse: true, nnz: 7, shape: [2, 2], values: [[1, 0], [0, 2]] }) }) })
  const sp = await g2.run({ lib: 'scipy', code: 'X' })
  assert.equal(sp.ok, true)
  assert.equal(sp.sparse, true)
  assert.equal(sp.nnz, 7)
  passed += 1
})

// ── 9. 未知形状 ⇒ 具名拒（不 stringify 成"看起来像数据"）─────────────────────────────────
test('an unknown shape is refused by name instead of being stringified', async () => {
  const { gov } = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: resultLine({ ok: true, kind: 'unknown', repr: '<Foo object>' }) }) })
  const r = await gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_MATH_SHAPE_UNKNOWN')
  assert.equal(r.isRefutation, false)
  passed += 1
})

// ── 10. 被调用代码报错 ⇒ VMU_MATH_HARNESS_FAILED（缺陷 ≠ 命题为假）──────────────────────
test('a failing library call is a named defect, never a refutation', async () => {
  const { gov } = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: resultLine({ ok: false, error: 'ValueError: boom' }) }) })
  const r = await gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_MATH_HARNESS_FAILED')
  assert.equal(r.isRefutation, false)
  assert.ok(r.receipt && r.receipt.exitCode === 0, '回执仍要带上工具事实')
  passed += 1
})

// ── 11. 没有信封行：exit 0 ⇒ UNPARSEABLE；非零 ⇒ MATH_NONZERO_EXIT ──────────────────────
test('a missing envelope is unparseable at exit 0 and NONZERO_EXIT otherwise', async () => {
  const a = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: 'no marker here\n' }) })
  const ra = await a.gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(ra.code, 'VMU_MATH_RESULT_UNPARSEABLE')
  const b = mkGov({}, { spawn: fakeSpawn({ probe: ALL, result: 'boom\n', exitCode: 2, stderr: 'l1\nl2\nl3\nl4\nl5\nBOOM' }) })
  const rb = await b.gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(rb.code, 'MATH_NONZERO_EXIT')
  assert.ok(rb.stderrTail.indexOf('BOOM') !== -1, 'stderr 尾部必须保留')
  passed += 1
})

// ── 12. 超时 ⇒ MATH_TIMEOUT ＋ 部分输出 ＋ 丢弃字节计数 ──────────────────────────────────
test('a timeout keeps partial output and counts the dropped bytes', async () => {
  const { gov } = mkGov({ 'vmu.math.adapters.maxStringBytes': 4 }, { spawn: fakeSpawn({ probe: ALL, timedOut: true }) })
  const r = await gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(r.code, 'MATH_TIMEOUT')
  assert.equal(r.partial.dropped.droppedBytes > 0, true, '丢弃字节必须计数')
  assert.ok(r.partial.stdout.length > 0 || r.partial.stderr.length > 0, '部分输出必须保留')
  passed += 1
})

// ── 13. 截断：元素计数 ＋ 字节计数（都不静默）───────────────────────────────────────────
test('element and byte truncation are counted, never silent', async () => {
  const big = resultLine({ ok: true, kind: 'array', dtype: 'int64', shape: [2, 2], values: [[1, 2], [3, 4]] })
  const a = mkGov({ 'vmu.math.adapters.maxArrayElements': 2 }, { spawn: fakeSpawn({ probe: ALL, result: big }) })
  const ra = await a.gov.run({ lib: 'numpy', expr: 'X' })
  assert.equal(ra.ok, true)
  assert.equal(ra.truncated.droppedElements, 2, '掉了 2 个叶子元素：' + JSON.stringify(ra))
  assert.equal(JSON.stringify(ra.values), JSON.stringify([[1, 2]]))
  const longExpr = resultLine({ ok: true, kind: 'expr', sympy: 'x'.repeat(500), latex: 'y'.repeat(500), freeSymbols: [] })
  const b = mkGov({ 'vmu.math.adapters.maxStringBytes': 16 }, { spawn: fakeSpawn({ probe: ALL, result: longExpr }) })
  const rb = await b.gov.run({ lib: 'sympy', expr: 'X' })
  assert.equal(rb.ok, true)
  assert.ok(rb.truncated.droppedBytes > 0, '字节截断必须计数：' + JSON.stringify(rb.truncated))
  passed += 1
})

// ── 14. 随机作业必须带种子；包白名单必须被强制 ──────────────────────────────────────────
test('random jobs need a seed and the package allowlist is enforced', async () => {
  const a = mkGov()
  assert.equal((await a.gov.run({ lib: 'numpy', expr: 'X', random: true })).code, 'VMU_MATH_SEED_REQUIRED')
  const b = mkGov({ 'vmu.math.adapters.packageAllowlist': ['numpy'] })
  const rb = await b.gov.run({ lib: 'numpy', expr: 'X', packages: ['torch'] })
  assert.equal(rb.code, 'VMU_MATH_INVALID_INPUT')
  assert.ok(rb.hint.indexOf('vmu.math.adapters.packageAllowlist') !== -1, 'hint 必须点名那个设置键')
  const rc = await b.gov.run({ lib: 'numpy', expr: 'X', packages: ['numpy'] })
  assert.equal(rc.ok, true)
  passed += 1
})

// ── 15. run 需要 expr/code/fn 之一（契约明确，不猜）──────────────────────────────────────
test('run requires an executable form (expr / code / fn)', async () => {
  const { gov } = mkGov()
  const r = await gov.run({ lib: 'numpy' })
  assert.equal(r.code, 'VMU_MATH_EXPR_REQUIRED')
  const l = await gov.run({ lib: 'numpy', fn: 'array', args: [1, 2] })
  assert.equal(l.ok, true)
  passed += 1
})

// ── 16. harness/body 构建器：确定性 ＋ 关键内容 ＋ 无裸 json.loads 笔误 ────────────────────
test('harness builders are deterministic and self-consistent', async () => {
  const h1 = buildHarness({ imports: ['numpy as np'], seed: '7', body: exprBody('1+1') })
  const h2 = buildHarness({ imports: ['numpy as np'], seed: '7', body: exprBody('1+1') })
  assert.equal(h1, h2, '同一输入必须给出逐字相同的 harness（回执可复现）')
  assert.ok(h1.indexOf(RESULT_MARKER) !== -1 && h1.indexOf('_vmu_shape') !== -1)
  assert.ok(h1.indexOf('_random.seed("7")') !== -1)
  assert.ok(h1.indexOf('import numpy as np') !== -1, 'imports 必须带 import 关键字（真实机上裸模块名是 SyntaxError）')
  assert.ok(buildHarness({ imports: ['from scipy import optimize'], body: 'pass' }).indexOf('from scipy import optimize') !== -1)
  const c = callBody({ lib: 'numpy', fn: 'array', args: [1, 2] })
  assert.ok(c.indexOf('_json.loads') !== -1 && !/(^|[^_a-zA-Z])json\.loads/.test(c), 'call body 必须用 _json（裸 json 会 NameError）')
  assert.ok(codeBody('RESULT = 1').indexOf('RESULT') !== -1)
  const pb = probeBody(['numpy'])
  assert.ok(pb.indexOf(PROBE_MARKER) !== -1)
  assert.ok(!/(^|[^_a-zA-Z])json\.(loads|dumps)/.test(pb), 'probe body 也必须用 _json（真实机上次就是这里 NameError）')
  assert.ok(!/(^|[^_a-zA-Z])json\.(loads|dumps)/.test(h1), 'harness 里不得出现裸 json.*')
  passed += 1
})

// ── 17. shapeContract()：可被 docs/03 引用的冻结形状 ────────────────────────────────────
test('shapeContract() exposes the frozen kinds, libs and envelope', async () => {
  const { gov } = mkGov()
  const c = gov.shapeContract()
  assert.deepEqual(c.kinds, ['scalar', 'array', 'frame', 'expr', 'result', 'mapping'])
  assert.equal(c.envelope, RESULT_ENVELOPE)
  assert.equal(c.libs.length, 4)
  assert.deepEqual(c.libs.map((l) => l.name).sort(), ['numpy', 'pandas', 'scipy', 'sympy'])
  assert.equal(c.libs.filter((l) => l.name === 'pandas')[0].resultKind, 'frame')
  assert.equal(c.neverRefutes, true)
  assert.equal(Object.keys(SCIENTIFIC_LIBS).length, 4)
  passed += 1
})

// ── 18. status()/keysUsed()：接线可查 ＋ 每键真读 ───────────────────────────────────────
test('status() and keysUsed() expose the wiring; every wired key is really read', async () => {
  const { gov, s } = mkGov({ 'vmu.math.adapters.python': 'python3' })
  await gov.probe({})
  assert.equal(gov.keysUsed().length, WIRED_KEYS.length)
  // non-vacuous (RULE E): the loop below must really walk a NON-EMPTY declared set — print the count.
  assert.ok(WIRED_KEYS.length > 0, 'WIRED_KEYS must be non-empty, else the loop below asserts nothing (got ' + WIRED_KEYS.length + ')')
  for (const k of WIRED_KEYS) {
    assert.ok(gov.keysUsed().indexOf(k) !== -1, 'WIRED_KEYS 缺：' + k)
    assert.ok(s.reads.indexOf(k) !== -1, '必须真读：' + k)
  }
  const st = gov.status()
  assert.equal(st.ok, true)
  assert.equal(st.seam.spawn, true)
  assert.equal(st.seam.resolveExecutable, true)
  assert.equal(st.binding.interpreter, '/fake/bin/python3')
  assert.equal(st.neverRefutes, true)
  assert.equal(st.assigned.length, 4)
  const bare = createMathAdapters({ settings: mkSettings().settings, clock: () => 0 })
  assert.equal(bare.status().seam.spawn, false)
  passed += 1
})

// ── 19. 纯读：status/shapeContract 不改绑定/计数；fingerprint 确定性 ──────────────────────
test('read surfaces are pure and fingerprints are deterministic', async () => {
  const { gov } = mkGov()
  await gov.probe({})
  const before = JSON.stringify({ s: gov.status(), c: gov.shapeContract() })
  const after = JSON.stringify({ s: gov.status(), c: gov.shapeContract() })
  assert.equal(before, after)
  assert.equal(fingerprint({ a: 1, b: [2, 3] }), fingerprint({ a: 1, b: [2, 3] }))
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }))
  passed += 1
})

// ── 20. 总线事件：NAME-first（单对象形状会被总线具名拒）───────────────────────────────────
test('adapter events reach the bus NAME-first', async () => {
  const bus = { calls: [], emit(name, payload) { this.calls.push({ name, payload }); return Promise.resolve({ ok: true }) } }
  const s = mkSettings()
  const gov = createMathAdapters({ settings: s.settings, clock: () => 0, bus, spawn: fakeSpawn({ probe: ALL }), resolveExecutable: okResolve, root: '/fake/project' })
  await gov.probe({})
  await gov.run({ lib: 'numpy', expr: 'np.arange(3)' })
  const names = bus.calls.map((c) => c.name)
  assert.ok(names.indexOf('math/adapters-probed') !== -1, '缺 probed：' + names.join(','))
  assert.ok(names.indexOf('math/adapters-ran') !== -1, '缺 ran：' + names.join(','))
  for (const c of bus.calls) assert.equal(typeof c.name, 'string')
  await new Promise((r) => setTimeout(r, 0))
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU MATH ADAPTERS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
