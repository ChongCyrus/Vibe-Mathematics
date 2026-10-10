// vibe-math-vmu —— 复现包（kernel/repropack.js）独立测试。
// 运行：`node tests/vmu-repropack.test.mjs`（末行 `=== VMU REPROPACK: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createReproPack, REPRO_KEYS } from '../vibe-math-vmu/kernel/repropack.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

const mk = (over) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const full = { scriptId: 'job-1', entry: 'lean Proof.lean', env: { node: '22' }, seed: '42', dataRefs: ['data/a.csv'], deps: ['lean@4'] }

// ① 缺必填成员 ⇒ 具名拒**并点名**（逐个成员各一条）
test('every missing required member is a NAMED refusal that names the member', () => {
  const gov = createReproPack({ settings: mk({}).settings, clock: () => 0 })
  const cases2 = [
    ['script', { ...full, scriptId: '', entry: '' }],
    ['entry', { ...full, entry: '' }],
    ['envLock', { ...full, env: {} }],
    ['seed', { ...full, seed: '' }],
    ['dataFingerprint', { ...full, dataRefs: [] }],
    ['deps', { ...full, deps: [] }],
  ]
  for (const [member, args] of cases2) {
    const r = gov.build(args)
    assert.equal(r.ok, false, member + ' 缺 ⇒ 应拒')
    assert.ok(r.code && r.code.startsWith('VMU_'), member + ' ⇒ 码具名：' + r.code)
    assert.ok(r.message.indexOf(member) !== -1, member + ' ⇒ **必须点名**，got ' + r.message)
    assert.ok(r.hint, '拒绝必须带 hint')
  }
  passed += 1
})

// ② 有随机性 ⇒ 必须有种子（默认 allowMissingSeed=false）
test('a random job without a seed is refused (no "should be reproducible")', () => {
  const off = createReproPack({ settings: mk({}).settings, clock: () => 0 })
  const r = off.build({ ...full, seed: '', random: true })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_MATH_SEED_REQUIRED')
  // 显式允许缺种子 ⇒ 才放行（且这是**显式**选择）
  const on = createReproPack({ settings: mk({ 'vmu.repro.allowMissingSeed': true }).settings, clock: () => 0 })
  assert.equal(on.build({ ...full, seed: '', random: true }).ok, true)
  passed += 1
})

// ③ 验证失败 ⇒ 差异定位（逐成员 expected/actual）
test('a mismatch reports WHICH member differs (not just "not equal")', () => {
  const gov = createReproPack({ settings: mk({}).settings, clock: () => 0 })
  const p = gov.build(full)
  const v = gov.verify({ packId: p.pack.id, actual: { ...full, seed: '43' } })
  assert.equal(v.ok, false)
  assert.equal(v.code, 'VMU_MATH_REPRO_MISMATCH')
  assert.equal(v.diffs.length, 1)
  assert.equal(v.diffs[0].member, 'seed')
  assert.equal(v.diffs[0].expected, '42')
  assert.equal(v.diffs[0].actual, '43')
  const okv = gov.verify({ packId: p.pack.id, actual: full })
  assert.equal(okv.matched, true)
  passed += 1
})

// ④ 打包不得静默截断：超 maxPackBytes ⇒ 计数 dropped
test('hitting maxPackBytes reports dropped (never silent)', () => {
  const gov = createReproPack({ settings: mk({ 'vmu.repro.maxPackBytes': 1 }).settings, clock: () => 0 })
  const p = gov.build(full)
  assert.equal(p.ok, true)
  assert.ok(p.pack.dropped > 0, '触界必须报 dropped：got ' + p.pack.dropped)
  assert.ok(p.pack.bytes <= 1, '保留体必须在上限内')
  passed += 1
})

// ⑤ 数据默认只存指针；显式复制被拒（pointerOnly=true）且复制时**留痕**
test('data is pointer-only by default; copying needs an explicit switch and leaves a trail', () => {
  const gov = createReproPack({ settings: mk({}).settings, clock: () => 0 })
  const p = gov.build(full)
  assert.equal(p.pack.pointerOnly, true)
  assert.deepEqual(p.pack.copied, [])
  const denied = gov.build({ ...full, copyData: true })
  assert.equal(denied.code, 'VMU_REPRO_COPY_DENIED')
  const copiedGov = createReproPack({ settings: mk({ 'vmu.repro.dataPointerOnly': false }).settings, clock: () => 0 })
  const c = copiedGov.build({ ...full, copyData: true })
  assert.equal(c.pack.pointerOnly, false)
  assert.ok(c.pack.copied.length === 1, '复制必须留痕')
  assert.ok(copiedGov.trail().some((t) => t.what === 'repro.copy'), 'trail 里必须有复制事件')
  passed += 1
})

// ⑥ 零机制：不配 settings 不崩（requiredMembers 用缺省表；envLockMode=full）
test('zero configuration does not crash', () => {
  const gov = createReproPack({ clock: () => 0 })
  const p = gov.build(full)
  assert.equal(p.ok, true)
  assert.equal(gov.status().requiredMembers.length, 6)
  assert.equal(gov.status().pointerMode, true)
  passed += 1
})

// ⑦ 确定性：注入时钟 + 同输入 ⇒ 同 pack 指纹／同 id 序列
test('determinism: same inputs give the same fingerprint (injected clock)', () => {
  const run = () => {
    const gov = createReproPack({ settings: mk({}).settings, clock: () => 7 })
    const p = gov.build(full)
    return JSON.stringify({ fp: p.pack.fingerprint, bytes: p.pack.bytes, members: p.pack.members })
  }
  assert.equal(run(), run())
  passed += 1
})

// ⑧ 只读面不改状态
test('list()/status() never mutate state', () => {
  const gov = createReproPack({ settings: mk({}).settings, clock: () => 0 })
  gov.build(full)
  const a = JSON.stringify({ l: gov.list(), s: gov.status(), t: gov.trail() })
  const b = JSON.stringify({ l: gov.list(), s: gov.status(), t: gov.trail() })
  assert.equal(a, b)
  passed += 1
})

// ⑨ keysUsed()：7 键全列，且都真被读过
test('keysUsed() lists every repro key and each is really read', () => {
  const o = mk({})
  const gov = createReproPack({ settings: o.settings, clock: () => 0 })
  gov.build(full)
  const used = gov.keysUsed()
  assert.equal(used.length, REPRO_KEYS.length)
  for (const k of REPRO_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU REPROPACK: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
