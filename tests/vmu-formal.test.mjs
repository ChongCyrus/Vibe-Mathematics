// vibe-math-vmu —— 形式化面（kernel/formal.js）独立测试。
// 运行：`node tests/vmu-formal.test.mjs`（末行 `=== VMU FORMAL: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createFormal, FORMAL_KEYS } from '../vibe-math-vmu/kernel/formal.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({ 'vmu.formal.allowSorry': false }, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const sp = (res) => () => res
const GOOD = { exitCode: 0, stdout: 'ok', stderr: '' }
const proofOk = 'theorem t : True := trivial\n'
const proofSorry = 'theorem t : True := by\n  sorry\n'

// ① spawn 未注入 ⇒ 具名拒（不假装编译过）
test('missing spawn is a NAMED refusal (never fakes a compile)', () => {
  const f = createFormal({ settings: mk({}).settings, clock: () => 0 })
  const r = f.check({ statement: 'True', proof: proofOk })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_EXTERNAL_UNAVAILABLE')
  assert.ok(r.hint)
  passed += 1
})

// ② sorry 默认拒并点名位置
test('sorry is refused by default and the POSITION is named', () => {
  const f = createFormal({ settings: mk({}).settings, clock: () => 0, spawn: sp(GOOD) })
  const r = f.check({ statement: 'True', proof: proofSorry })
  assert.equal(r.code, 'VMU_FORMAL_SORRY_FOUND')
  assert.ok(/2:3/.test(r.message), '必须点名行:列，got ' + r.message)
  // 显式放行 ⇒ 通过且**自曝**
  const ok = f.check({ statement: 'True', proof: proofSorry, allowSorry: true })
  assert.equal(ok.ok, true)
  assert.equal(ok.receipt.allowedSorry, true)
  assert.equal(ok.sorrySelfReported.length, 1)
  assert.equal(f.sorryReport({ id: ok.receipt.id }).positions[0].line, 2)
  passed += 1
})

// ③ 白名单外公理 ⇒ 拒并点名公理
test('an axiom outside the whitelist is refused and NAMED', () => {
  const f = createFormal({ settings: mk({ 'vmu.formal.axiomWhitelist': ['propext'] }).settings, clock: () => 0, spawn: sp(GOOD) })
  const r = f.check({ statement: 'True', proof: 'axiom myAxiom : True\n' + proofOk })
  assert.equal(r.code, 'VMU_FORMAL_AXIOM_UNTRUSTED')
  assert.ok(r.message.indexOf('myAxiom') !== -1, '必须点名公理：' + r.message)
  const okf = createFormal({ settings: mk({ 'vmu.formal.axiomWhitelist': ['myAxiom'] }).settings, clock: () => 0, spawn: sp(GOOD) })
  assert.equal(okf.check({ statement: 'True', proof: 'axiom myAxiom : True\n' + proofOk }).ok, true)
  passed += 1
})

// ④ 编译失败 ≠ 命题为假（回执必须明说"未判定真假"）
test('a compile failure never implies the statement is false', () => {
  const f = createFormal({ settings: mk({}).settings, clock: () => 0, spawn: sp({ exitCode: 1, stdout: '', stderr: 'error' }) })
  const r = f.check({ statement: 'True', proof: proofOk })
  assert.equal(r.code, 'VMU_LEAN_COMPILE_FAILED')
  assert.equal(r.receipt.verdict, 'undecided')
  assert.equal(r.receipt.compileOk, false)
  assert.ok(/未判定真假/.test(r.receipt.note), '回执必须明说未判定真假：' + r.receipt.note)
  assert.equal(r.receipt.verdict, 'undecided', '不得给出"假"的判定')
  assert.notEqual(r.receipt.verdict, false)
  // 超时同理
  const t = createFormal({ settings: mk({}).settings, clock: () => 0, spawn: sp({ timedOut: true, exitCode: null }) })
  const rt = t.check({ statement: 'True', proof: proofOk })
  assert.equal(rt.code, 'MATH_TIMEOUT')
  assert.equal(rt.receipt.verdict, 'undecided')
  passed += 1
})

// 编译通过 ⇒ verdict=checked（并声明"这是编译结果，不是数学真值"）
test('a successful compile yields verdict=checked with the honest caveat', () => {
  const f = createFormal({ settings: mk({}).settings, clock: () => 3, spawn: sp(GOOD) })
  const r = f.check({ statement: 'True', proof: proofOk })
  assert.equal(r.ok, true)
  assert.equal(r.receipt.verdict, 'checked')
  assert.equal(r.receipt.compileOk, true)
  assert.ok(/不是数学真值/.test(r.receipt.note), '不得把编译通过说成真值：' + r.receipt.note)
  assert.ok(r.receipt.argvFingerprint && r.receipt.inputFingerprint && r.receipt.outputFingerprint)
  assert.equal(f.axioms({ id: r.receipt.id }).ok, true)
  assert.equal(f.artifacts({ id: r.receipt.id }).count, 1)
  passed += 1
})

// ⑤ 复现不一致 ⇒ 差异
test('reproduce() reports the differing member', () => {
  let flip = false
  const f = createFormal({ settings: mk({}).settings, clock: () => 0, spawn: () => (flip ? { exitCode: 7 } : { exitCode: 0 }) })
  const r = f.check({ statement: 'True', proof: proofOk })
  assert.equal(r.ok, true)
  flip = true
  const rep = f.reproduce({ id: r.receipt.id })
  assert.equal(rep.code, 'VMU_MATH_REPRO_MISMATCH')
  assert.equal(rep.diffs.length, 1)
  assert.equal(rep.diffs[0].member, 'exitCode')
  assert.equal(rep.diffs[0].expected, 0)
  assert.equal(rep.diffs[0].actual, 7)
  passed += 1
})

// ⑥ 截断必计数
test('source truncation is counted (droppedBytes)', () => {
  const f = createFormal({ settings: mk({ 'vmu.formal.maxSourceBytes': 20 }).settings, clock: () => 0, spawn: sp(GOOD) })
  const r = f.check({ statement: 'True', proof: proofOk + 'x'.repeat(500) })
  assert.equal(r.ok, true)
  assert.ok(r.receipt.droppedBytes > 0, '丢弃字节必须计数：got ' + r.receipt.droppedBytes)
  passed += 1
})

// ⑦ 注入时钟 ⇒ 时长确定；假 spawn ⇒ 同输入同输出
test('determinism: injected clock + fake spawn give identical receipts', () => {
  const run = () => {
    const f = createFormal({ settings: mk({}).settings, clock: () => 11, spawn: sp(GOOD) })
    return JSON.stringify(f.check({ statement: 'True', proof: proofOk }).receipt)
  }
  assert.equal(run(), run())
  passed += 1
})

// ⑧ 零机制不崩；只读面不改状态
test('zero-configuration works; read paths are pure', () => {
  const f = createFormal({ clock: () => 0, spawn: sp(GOOD) })
  const r = f.check({ statement: 'True', proof: proofOk })
  assert.equal(r.ok, true)
  const a = JSON.stringify({ l: f.list(), s: f.status(), t: f.trail(), ax: f.axioms({ id: r.receipt.id }) })
  const b = JSON.stringify({ l: f.list(), s: f.status(), t: f.trail(), ax: f.axioms({ id: r.receipt.id }) })
  assert.equal(a, b)
  assert.equal(f.axioms({ id: 'fm-404' }).code, 'VMU_FORMAL_NOT_FOUND')
  passed += 1
})

// keysUsed()：10 键全列且真读
test('keysUsed() lists every formal key and each is really read', () => {
  const o = mk({})
  const f = createFormal({ settings: o.settings, clock: () => 0, spawn: sp(GOOD) })
  f.check({ statement: 'True', proof: proofOk })
  const used = f.keysUsed()
  assert.equal(used.length, FORMAL_KEYS.length)
  for (const k of FORMAL_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU FORMAL: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
