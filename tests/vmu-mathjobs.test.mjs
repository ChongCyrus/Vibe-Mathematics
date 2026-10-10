// vibe-math-vmu —— 数学作业与回执（kernel/mathjobs.js）独立测试。
// 运行：`node tests/vmu-mathjobs.test.mjs`（末行 `=== VMU MATHJOBS: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createMathJobs, MATH_KEYS } from '../vibe-math-vmu/kernel/mathjobs.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({ 'vmu.math.engines': ['sympy'], 'vmu.math.computation': 'auto' }, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const fakeSpawn = (res) => async () => res
const OK = { exitCode: 0, stdout: 'ok\n', stderr: '' }

// ① spawn 未注入 ⇒ 具名拒（绝不假装跑过）
test('missing spawn is a NAMED refusal (never fakes a run)', async () => {
  const gov = createMathJobs({ settings: mk({}).settings, clock: () => 0 })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', 'x'] })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_EXTERNAL_UNAVAILABLE')
  assert.ok(r.hint)
  passed += 1
})

// ⑧ 零机制：无引擎声明 ⇒ 提交即拒
test('zero-mechanism: no declared engine refuses at submit', async () => {
  const gov = createMathJobs({ settings: mk({ 'vmu.math.engines': [] }).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  const r = await gov.submit({ engine: 'sympy' })
  assert.equal(r.code, 'VMU_MATH_UNSUPPORTED_OP')
  const off = createMathJobs({ settings: mk({ 'vmu.math.computation': 'off' }).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  assert.equal((await off.submit({ engine: 'sympy' })).code, 'VMU_MATH_UNSUPPORTED_OP')
  passed += 1
})

// ② 超时 ⇒ MATH_TIMEOUT ＋ 部分输出 ＋ 丢弃字节计数
test('timeout keeps partial output and COUNTS dropped bytes', async () => {
  const long = 'x'.repeat(5000)
  const gov = createMathJobs({ settings: mk({ 'vmu.math.captureStdoutBytes': 100 }).settings, clock: () => 0, spawn: fakeSpawn({ timedOut: true, exitCode: null, stdout: long, stderr: 'partial' }) })
  const r = await gov.submit({ engine: 'sympy', argv: ['x'] })
  assert.equal(r.code, 'MATH_TIMEOUT')
  assert.ok(r.receipt, '超时也要带回执（保留部分输出 ✓）')
  assert.equal(r.receipt.timedOut, true)
  assert.ok(r.receipt.stdout.length > 0, '部分输出必须保留')
  assert.ok(r.receipt.droppedBytes > 0, '丢弃字节必须计数：got ' + r.receipt.droppedBytes)
  passed += 1
})

// ③ 非零退出 ⇒ 回执保留退出码与 stderr 尾部
test('non-zero exit keeps the exit code and the stderr tail', async () => {
  const gov = createMathJobs({ settings: mk({}).settings, clock: () => 0, spawn: fakeSpawn({ exitCode: 3, stdout: '', stderr: 'l1\nl2\nl3\nl4\nl5\nBOOM' }) })
  const r = await gov.submit({ engine: 'sympy', argv: ['x'] })
  assert.equal(r.code, 'MATH_NONZERO_EXIT')
  assert.equal(r.receipt.exitCode, 3)
  assert.ok(r.receipt.stderrTail.indexOf('BOOM') !== -1, 'stderr 尾部必须保留：' + r.receipt.stderrTail)
  passed += 1
})

// ④ 回执完整性：必含六字段（引擎/argv 指纹/输入指纹/退出码/时长/输出指纹）
test('a complete receipt carries all six fields', async () => {
  const gov = createMathJobs({ settings: mk({}).settings, clock: () => 5, spawn: fakeSpawn(OK) })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', '1+1'], stdin: 'in', seed: '7' })
  assert.equal(r.ok, true)
  for (const k of ['engine', 'argvFingerprint', 'inputFingerprint', 'exitCode', 'durationMs', 'outputFingerprint']) {
    assert.ok(r.receipt[k] !== undefined && r.receipt[k] !== '', '回执缺字段：' + k)
  }
  assert.equal(gov.checkReceipt(r.receipt).ok, true)
  assert.equal(gov.checkReceipt({ engine: 'x' }).code, 'VMU_FORMAL_REPRO_INCOMPLETE') // 缺字段 ⇒ 具名拒
  passed += 1
})

// ⑤ 随机作业缺种子 ⇒ 拒（默认 requireSeedForRandom=true）
test('a random job without a seed is refused', async () => {
  const gov = createMathJobs({ settings: mk({}).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  const r = await gov.submit({ engine: 'sympy', argv: ['x'], random: true })
  assert.equal(r.code, 'VMU_MATH_SEED_REQUIRED')
  const gov2 = createMathJobs({ settings: mk({ 'vmu.math.requireSeedForRandom': false }).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  assert.equal((await gov2.submit({ engine: 'sympy', argv: ['x'], random: true })).ok, true)
  passed += 1
})

// ⑥ 上限 ⇒ 计数式截断（maxJobs 拒；keepReceipts 丢最旧并计数）
test('caps are counted, never silent (maxJobs refuses; keepReceipts drops + counts)', async () => {
  const capped = createMathJobs({ settings: mk({ 'vmu.math.maxJobs': 1 }).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  await capped.submit({ engine: 'sympy', argv: ['a'] })
  assert.equal((await capped.submit({ engine: 'sympy', argv: ['b'] })).code, 'VMU_MATH_RESOURCE_LIMIT')
  const keep = createMathJobs({ settings: mk({ 'vmu.math.keepReceipts': 1, 'vmu.math.maxJobs': 0 }).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  await keep.submit({ engine: 'sympy', argv: ['a'] })
  await keep.submit({ engine: 'sympy', argv: ['b'] })
  const l = keep.list()
  assert.ok(l.dropped >= 1, '回执被丢必须计数：got ' + l.dropped)
  passed += 1
})

// ⑦ 注入时钟 ⇒ 时长确定；假 spawn ⇒ 同输入同输出
test('determinism: injected clock + fake spawn give identical results', async () => {
  const run = async () => {
    const gov = createMathJobs({ settings: mk({}).settings, clock: () => 9, spawn: fakeSpawn(OK) })
    const r = await gov.submit({ engine: 'sympy', argv: ['x'], seed: '1' })
    return JSON.stringify(r.receipt)
  }
  assert.equal(await run(), await run())
  passed += 1
})

// ⑨ 只读面不改状态；cancel 只对 running 生效
test('read paths are pure; cancel only affects a running job', async () => {
  const gov = createMathJobs({ settings: mk({}).settings, clock: () => 0, spawn: fakeSpawn(OK) })
  const r = await gov.submit({ engine: 'sympy', argv: ['x'] })
  const before = JSON.stringify({ l: gov.list(), s: gov.statusAll(), t: gov.trail(), r: gov.receipt({ jobId: r.jobId }) })
  const after = JSON.stringify({ l: gov.list(), s: gov.statusAll(), t: gov.trail(), r: gov.receipt({ jobId: r.jobId }) })
  assert.equal(before, after)
  assert.equal(gov.cancel({ jobId: r.jobId, reason: 'late' }).code, 'VMU_JOB_CANCELLED') // 已结束 ⇒ 具名拒
  assert.equal(gov.status({ jobId: 'mj-404' }).code, 'VMU_NOT_FOUND')
  passed += 1
})

// keysUsed()：11 键全列且真读
test('keysUsed() lists every math key and each is really read', async () => {
  const o = mk({})
  const gov = createMathJobs({ settings: o.settings, clock: () => 0, spawn: fakeSpawn(OK) })
  await gov.submit({ engine: 'sympy', argv: ['x'] })
  const used = gov.keysUsed()
  assert.equal(used.length, MATH_KEYS.length)
  for (const k of MATH_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU MATHJOBS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
