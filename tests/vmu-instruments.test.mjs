// vibe-math-vmu —— 仪器面（kernel/instruments.js）独立测试。
// 运行：`node tests/vmu-instruments.test.mjs`（末行 `=== VMU INSTRUMENTS: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createInstruments, INSTRUMENT_KEYS, WIRED_INSTRUMENT_KEYS, PLANNED_INSTRUMENT_KEYS } from '../vibe-math-vmu/kernel/instruments.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const ins = (over, clock) => createInstruments({ settings: mk(over).settings, clock: clock || (() => 0), log: () => {}, bus: { emit: () => {} } })
const DAY = 86400000

// ③ 恰好划分 17 ＋ 交集为空 ＋ 未接逐个点名
test('wired ∪ planned is an exact partition of the 17 keys, with reasons', () => {
  const i = ins()
  const p = i.partition()
  assert.equal(p.all, 17)
  assert.equal(p.wired + p.planned, 17)
  assert.equal(p.disjoint, true)
  assert.equal(p.exact, true)
  for (const [k, why] of PLANNED_INSTRUMENT_KEYS) assert.ok(why && why.length > 6, '未接键必须给原因：' + k)
  const missing = INSTRUMENT_KEYS.filter((k) => WIRED_INSTRUMENT_KEYS.indexOf(k) === -1 && !PLANNED_INSTRUMENT_KEYS.some((x) => x[0] === k))
  assert.deepEqual(missing, [], '不得有既不接也不点名的键')
  passed += 1
})

// 校准过期 ⇒ 具名拒并给到期日（正反例）
test('an overdue calibration is refused WITH the due date; a fresh one passes', () => {
  const i = ins({ 'vmu.instruments.calibrationDueDays': 30 }, () => 40 * DAY)
  const u = i.register({ id: 'scope', owner: 'lab', calibratedAt: 0 })
  assert.equal(u.ok, true)
  const r = i.use({ id: 'scope', by: 'a', purpose: 'measure' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_NOT_PERMITTED')
  assert.ok(r.dueDate, '必须给到期日')
  assert.equal(r.dueDate, new Date(30 * DAY).toISOString().slice(0, 10))
  assert.ok(r.enforced.indexOf('vmu.instruments.blockOnOverdue') !== -1)
  // 正例：重新校准 ⇒ 放行
  i.calibrate({ id: 'scope', at: 41 * DAY })
  assert.equal(i.use({ id: 'scope', by: 'a', purpose: 'measure' }).ok, true)
  passed += 1
})

// 未培训 ⇒ 拒（正反例）
test('an untrained operator is refused, and training fixes it', () => {
  const i = ins()
  i.register({ id: 'sem', owner: 'lab', tags: ['sem'] })
  const r = i.use({ id: 'sem', by: 'newbie', purpose: 'image' })
  assert.equal(r.code, 'VMU_NOT_PERMITTED')
  assert.ok(/未培训/.test(r.message), '必须说明未培训：' + r.message)
  i.train({ by: 'newbie', tags: ['sem'] })
  assert.equal(i.use({ id: 'sem', by: 'newbie', purpose: 'image' }).ok, true)
  passed += 1
})

// 使用记录缺目的 ⇒ 拒
test('a usage record without a purpose is refused', () => {
  const i = ins()
  i.register({ id: 'x', owner: 'lab' })
  const r = i.use({ id: 'x', by: 'a' })
  assert.equal(r.code, 'VMU_META_VALIDATION_FAILED')
  assert.ok(/缺目的/.test(r.message), '必须点名缺目的：' + r.message)
  assert.ok(Array.isArray(r.enforced) && r.enforcedScope === 'evaluated-so-far', '拒绝必带 enforced ＋ enforcedScope')
  passed += 1
})

// 维护窗口内预约 ⇒ 拒
test('a reservation inside a maintenance window is refused', () => {
  const i = ins({}, () => 0)
  i.register({ id: 'mri', owner: 'lab' })
  i.openWindow({ id: 'mri', from: 3600000, to: 7200000 })
  const r = i.reserve({ id: 'mri', by: 'a', from: 3600000, hours: 1 })
  assert.equal(r.code, 'VMU_CONFLICT')
  assert.equal(r.conflict[0].kind, 'maintenance')
  assert.equal(i.reserve({ id: 'mri', by: 'a', from: 7200000, hours: 1 }).ok, true)
  passed += 1
})

// 借用冲突 ⇒ 拒并**点名冲突时段**；overbookRatio 放行有限超额
test('a borrow conflict is refused and the conflicting window is named', () => {
  const i = ins({ 'vmu.instruments.reserve': true })
  i.register({ id: 'hpl', owner: 'lab' })
  const first = i.reserve({ id: 'hpl', by: 'a', from: 0, hours: 2 })
  assert.equal(first.ok, true)
  const clash = i.reserve({ id: 'hpl', by: 'b', from: 3600000, hours: 1 })
  assert.equal(clash.code, 'VMU_CONFLICT')
  assert.equal(clash.conflict.length, 1)
  assert.ok(clash.conflict[0].from === 0, '必须点名冲突时段的起点')
  // 正例：错开时段 ⇒ 放行
  assert.equal(i.reserve({ id: 'hpl', by: 'b', from: 2 * 3600000, hours: 1 }).ok, true)
  // overbookRatio=1 ⇒ 允许 1 个冲突（并计数排队）
  const ob = ins({ 'vmu.instruments.overbookRatio': 1, 'vmu.instruments.waitlistPolicy': 'queue' })
  ob.register({ id: 'hpl', owner: 'lab' })
  ob.reserve({ id: 'hpl', by: 'a', from: 0, hours: 2 })
  const over = ob.reserve({ id: 'hpl', by: 'b', from: 3600000, hours: 1 })
  assert.equal(over.ok, true, 'overbookRatio 允许有限超额')
  assert.equal(over.waitlist, 'queued')
  passed += 1
})

// 超时长上限 ⇒ **给当前/上限**；超视野 ⇒ 拒
test('the hold limit reports current/limit, and the horizon is enforced', () => {
  const i = ins({ 'vmu.instruments.maxHoldHours': 4, 'vmu.instruments.reservationHorizonDays': 1 })
  i.register({ id: 'cnc', owner: 'lab' })
  const r = i.reserve({ id: 'cnc', by: 'a', from: 0, hours: 9 })
  assert.equal(r.code, 'VMU_RESOURCE_BUDGET')
  assert.ok(/当前 9 h \/ 上限 4 h/.test(r.message), '必须给当前/上限：' + r.message)
  const far = i.reserve({ id: 'cnc', by: 'a', from: 5 * DAY, hours: 1 })
  assert.equal(far.code, 'VMU_RESOURCE_BUDGET')
  passed += 1
})

// requireOwner / reserve / scheduleMaintenance 的开关（正反例）
test('requireOwner, reserve and scheduleMaintenance switches change behaviour', () => {
  const i = ins({ 'vmu.instruments.requireOwner': true })
  assert.equal(i.register({ id: 'n1' }).code, 'VMU_NOT_PERMITTED')
  const lax = ins({ 'vmu.instruments.requireOwner': false })
  assert.equal(lax.register({ id: 'n1' }).ok, true)
  const noRes = ins({ 'vmu.instruments.reserve': false })
  noRes.register({ id: 'n2', owner: 'l' })
  assert.equal(noRes.reserve({ id: 'n2', by: 'a', from: 0, hours: 1 }).code, 'VMU_NOT_PERMITTED')
  const noMaint = ins({ 'vmu.instruments.scheduleMaintenance': false })
  noMaint.register({ id: 'n3', owner: 'l' })
  assert.equal(noMaint.openWindow({ id: 'n3', from: 0, to: 1 }).code, 'VMU_NOT_PERMITTED')
  passed += 1
})

// hashAlgo 改变指纹；attachCapture 参与 enforced
test('hashAlgo changes the fingerprint prefix and attachCapture is evaluated', () => {
  const a = ins({ 'vmu.instruments.hashAlgo': 'sha256' })
  a.register({ id: 'u1', owner: 'l' })
  const ra = a.use({ id: 'u1', by: 'p', purpose: 'x' })
  const b = ins({ 'vmu.instruments.hashAlgo': 'blake3' })
  b.register({ id: 'u1', owner: 'l' })
  const rb = b.use({ id: 'u1', by: 'p', purpose: 'x' })
  assert.ok(ra.fingerprint.startsWith('sha256:') && rb.fingerprint.startsWith('blake3:'), 'hashAlgo 必须改变可观测结果')
  assert.ok(ra.enforced.indexOf('vmu.instruments.attachCapture') !== -1)
  passed += 1
})

// 拒绝按码计数 ＋ 每条拒绝带数组 enforced ＋ enforcedScope
test('refusals are counted by code and always carry enforced + enforcedScope', () => {
  const i = ins()
  i.register({ id: 'z', owner: 'l' })
  const r1 = i.use({ id: 'z', by: 'a' })
  const r2 = i.use({ id: 'z', by: 'b' })
  assert.equal(i.refusals()['VMU_META_VALIDATION_FAILED'], 2, '拒绝必须按码计数')
  for (const r of [r1, r2]) {
    assert.ok(Array.isArray(r.enforced), 'enforced 必须是数组')
    assert.equal(r.enforcedScope, 'evaluated-so-far', '拒绝必带 enforcedScope')
  }
  const nf = i.use({ id: 'nope', by: 'a', purpose: 'x' })
  assert.ok(Array.isArray(nf.enforced) && nf.enforcedScope === 'evaluated-so-far')
  passed += 1
})

// 确定性（注入时钟）＋ 只读面纯净 ＋ 零机制不崩
test('determinism (injected clock), pure read paths, zero-config', () => {
  const zero = createInstruments({ clock: () => 0 })
  assert.equal(zero.status().ok, true)
  const run = () => {
    const i = ins({}, () => 5)
    i.register({ id: 'd', owner: 'l' })
    return JSON.stringify({ u: i.use({ id: 'd', by: 'p', purpose: 'x' }), r: i.reserve({ id: 'd', by: 'p', from: 0, hours: 1 }) })
  }
  assert.equal(run(), run())
  const i = ins({}, () => 5)
  i.register({ id: 'd', owner: 'l' })
  const a = JSON.stringify({ s: i.status(), s2: i.status({ id: 'd' }), k: i.keysUsed() })
  const b = JSON.stringify({ s: i.status(), s2: i.status({ id: 'd' }), k: i.keysUsed() })
  assert.equal(a, b, 'status() 不得改状态')
  passed += 1
})

// keysUsed() ＝ 已接键，且每个都被真读
test('keysUsed() equals the wired set and each key is really read', () => {
  const o = mk({})
  const i = createInstruments({ settings: o.settings, clock: () => 0 })
  i.register({ id: 'k', owner: 'l' })
  i.train({ by: 'p', tags: [] })
  i.use({ id: 'k', by: 'p', purpose: 'x' })
  i.openWindow({ id: 'k', from: 0, to: 1000 })
  i.reserve({ id: 'k', by: 'p', from: 1000, hours: 1 })
  i.calibrate({ id: 'k' })
  i.status()
  const used = i.keysUsed()
  assert.equal(used.length, WIRED_INSTRUMENT_KEYS.length)
  for (const k of WIRED_INSTRUMENT_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  const notRead = used.filter((k) => o.reads.indexOf(k) === -1)
  assert.deepEqual(notRead, [], 'keysUsed 里的键必须真被读过：' + notRead.join('、'))
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU INSTRUMENTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
