// vibe-math-vmu —— 存储后端策略面（kernel/storepolicy.js）独立测试。
// 运行：`node tests/vmu-storepolicy.test.mjs`（末行 `=== VMU STOREPOLICY: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createStorePolicy, STORE_KEYS, WIRED_STORE_KEYS, PLANNED_STORE_KEYS } from '../vibe-math-vmu/kernel/storepolicy.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({ 'vmu.store.root': 'D:\\vault' }, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const sp = (over, clock) => createStorePolicy({ settings: mk(over).settings, clock: clock || (() => 0), log: () => {}, bus: { emit: () => {} } })
/** 口径断言：每个拒绝都要有数组型 enforced ＋ 口径 ＋ wouldEvaluate ⊇ enforced ✓✓。 */
const assertRefusalShape = (r, label) => {
  assert.equal(r.ok, false, label + ' 应为拒绝')
  assert.ok(Array.isArray(r.enforced), label + '：enforced 必须是数组')
  assert.equal(r.enforcedScope, 'evaluated-so-far', label + '：必须带口径')
  assert.ok(Array.isArray(r.wouldEvaluate), label + '：必须带 wouldEvaluate')
  for (const k of r.enforced) assert.ok(r.wouldEvaluate.indexOf(k) !== -1, label + '：wouldEvaluate ⊇ enforced（缺 ' + k + '）')
  assert.ok(r.code, label + '：必须具名')
}

// ③ 恰好划分 15（未接逐个点名 ⇒ 本面 15/15 ⇒ planned 为空数组 ✓）
test('wired ∪ planned is an exact partition of the 15 keys', () => {
  const s = sp()
  const p = s.partition()
  assert.equal(p.all, 15)
  assert.equal(p.wired, 15)
  assert.equal(p.planned, 0)
  assert.deepEqual(PLANNED_STORE_KEYS, [], '未接集合为空（逐条点名＝空 ✓）')
  assert.equal(p.exact, true)
  assert.equal(p.disjoint, true)
  assert.deepEqual(WIRED_STORE_KEYS.slice().sort(), STORE_KEYS.slice().sort(), 'wired 必须就是 15 键')
  passed += 1
})

// backend 未知值 ⇒ 具名拒（正反例）
test('an unknown backend is a named refusal; file/memory pass', () => {
  const bad = sp({ 'vmu.store.backend': 's3', 'vmu.store.root': 'D:\\vault' })
  const r = bad.write({ id: 'a' })
  assertRefusalShape(r, 'unknown backend')
  assert.equal(r.code, 'VMU_NOT_PERMITTED')
  assert.ok(r.enforced.indexOf('vmu.store.backend') !== -1)
  for (const b of ['file', 'memory']) {
    const s = sp({ 'vmu.store.backend': b })
    assert.equal(s.write({ id: 'a' }).ok, true, b + ' 应放行')
  }
  passed += 1
})

// root／tmpDir：只校验不做 IO；缺 root／路径含 .. ⇒ 拒；tmpDir 必须在 root 之下
test('root and tmpDir are validated (no IO): missing root and .. are refused', () => {
  const noRoot = sp({ 'vmu.store.root': '' })
  assertRefusalShape(noRoot.write({ id: 'a' }), 'missing root')
  const raw = sp({ 'vmu.store.root': 'D:\\vault\\..\\escape' })
  assert.equal(raw.write({ id: 'a' }).code, 'VMU_NOT_PERMITTED')
  const outside = sp({ 'vmu.store.root': 'D:\\vault', 'vmu.store.tmpDir': 'C:\\tmp' })
  assert.equal(outside.write({ id: 'a' }).code, 'VMU_META_VALIDATION_FAILED')
  const inside = sp({ 'vmu.store.root': 'D:\\vault', 'vmu.store.tmpDir': 'D:\\vault\\tmp' })
  assert.equal(inside.write({ id: 'a' }).ok, true)
  passed += 1
})

// fsync ⇒ durable（可观测差异 ✓）
test('fsync changes the observable durability of a write', () => {
  assert.equal(sp({ 'vmu.store.fsync': true }).write({ id: 'a' }).durable, true)
  assert.equal(sp({ 'vmu.store.fsync': false }).write({ id: 'a' }).durable, false)
  passed += 1
})

// 锁族：抢锁失败 ⇒ 拒并给**当前/上限** ＋ 退避计数；serializeAll ⇒ 单车道
test('the lock family refuses with current/limit and counts the backoff attempts', () => {
  const s = sp({ 'vmu.store.lock.timeoutMs': 100, 'vmu.store.lock.retries': 3, 'vmu.store.lock.backoffMs': 50 })
  assert.equal(s.acquire({ name: 'x', by: 'a' }).ok, true)
  const r = s.acquire({ name: 'x', by: 'b' })
  assertRefusalShape(r, 'lock clash')
  assert.equal(r.code, 'VMU_CONFLICT')
  assert.equal(r.timeoutMs, 100)
  assert.ok(r.waitedMs >= 100, '等待必须累计到上限：' + r.waitedMs)
  assert.ok(r.attempts >= 1 && r.attempts <= 3, '退避次数必须计数且不超 retries：' + r.attempts)
  assert.equal(r.retries, 3, '回执必须给上限（retries）')
  assert.equal(s.refusals()['VMU_CONFLICT'], 1, '拒绝必须按码计数')
  s.release({ name: 'x' })
  assert.equal(s.acquire({ name: 'x', by: 'c' }).ok, true)
  // serializeAll ⇒ 全部走同一车道 '*'（拿 'a' 后再拿 'b' 也冲突 ✓）
  const ser = sp({ 'vmu.store.lock.serializeAll': true, 'vmu.store.lock.retries': 0 })
  assert.equal(ser.acquire({ name: 'a' }).serialized, true)
  assert.equal(ser.acquire({ name: 'b' }).code, 'VMU_CONFLICT')
  // lock=false ⇒ 不参与（放行 ✓）
  assert.equal(sp({ 'vmu.store.lock': false }).acquire({ name: 'a' }).locked, false)
  passed += 1
})

// autoBackup ⇒ 每次写入计数
test('autoBackup counts a backup on every write', () => {
  const off = sp({ 'vmu.store.autoBackup': false })
  off.write({ id: '1' }); off.write({ id: '2' })
  assert.equal(off.status().counters.backups, 0)
  const on = sp({ 'vmu.store.autoBackup': true })
  const w = on.write({ id: '1' })
  on.write({ id: '2' })
  assert.equal(w.backups, 1)
  assert.equal(on.status().counters.backups, 2)
  assert.ok(w.fired.indexOf('vmu.store.autoBackup') !== -1)
  passed += 1
})

// 远端：remote=on 缺 url ⇒ 拒；离线 + refuse ⇒ 拒；离线 + queue ⇒ 放行并计数
test('remote needs a url, and offlinePolicy decides refuse vs queue', () => {
  const noUrl = sp({ 'vmu.store.remote': 'on' })
  assert.equal(noUrl.write({ id: 'a' }).code, 'VMU_INVALID_ARGUMENT')
  const refuse = sp({ 'vmu.store.remote': 'on', 'vmu.store.remote.url': 'https://r', 'vmu.store.remote.offlinePolicy': 'refuse' })
  assertRefusalShape(refuse.write({ id: 'a', online: false }), 'offline refuse')
  const queue = sp({ 'vmu.store.remote': 'on', 'vmu.store.remote.url': 'https://r', 'vmu.store.remote.offlinePolicy': 'queue' })
  const q = queue.write({ id: 'a', online: false })
  assert.equal(q.ok, true)
  assert.equal(q.queued, true)
  assert.equal(queue.status().counters.queued, 1, '排队必须计数')
  passed += 1
})

// onVersionTooHigh：refuse ⇒ 拒；warn ⇒ 放行且**自曝 assumed**（与 N4 同口径 ✓）
test('onVersionTooHigh refuses or self-reports assumed', () => {
  const refuse = sp({ 'vmu.store.onVersionTooHigh': 'refuse' })
  const r = refuse.read({ foundVersion: 5, currentVersion: 3 })
  assertRefusalShape(r, 'version too high')
  assert.equal(r.code, 'VMU_COMPAT_UNKNOWN_COMBO')
  assert.ok(r.enforced.indexOf('vmu.store.onVersionTooHigh') !== -1)
  const warn = sp({ 'vmu.store.onVersionTooHigh': 'warn' })
  const w = warn.read({ foundVersion: 5, currentVersion: 3 })
  assert.equal(w.ok, true)
  assert.equal(w.assumed, true, '必须自曝 assumed')
  assert.equal(sp().read({ foundVersion: 3, currentVersion: 3 }).assumed, false)
  passed += 1
})

// fired ⊆ enforced（每个回执 ✓）＋ 只读面纯净 ＋ 零机制不崩 ＋ 注入时钟确定性
test('fired ⊆ enforced everywhere; read paths pure; zero-config; clock-deterministic', () => {
  const zero = createStorePolicy({ clock: () => 0 })
  assert.equal(zero.status().ok, true)
  assert.equal(zero.capabilities().ok, true)
  const s = sp({ 'vmu.store.autoBackup': true }, () => 7)
  const receipts = [s.capabilities(), s.acquire({ name: 'z' }), s.write({ id: 'w' }), s.read({ foundVersion: 1, currentVersion: 2 })]
  for (const r of receipts) {
    assert.ok(Array.isArray(r.enforced) && Array.isArray(r.fired), 'enforced/fired 必须是数组')
    for (const k of r.fired) assert.ok(r.enforced.indexOf(k) !== -1, '**fired ⊆ enforced**（越界：' + k + '）')
  }
  const before = JSON.stringify({ c: s.capabilities(), st: s.status(), t: s.trail() })
  const after = JSON.stringify({ c: s.capabilities(), st: s.status(), t: s.trail() })
  assert.equal(before, after, '只读面不得改状态')
  const run = () => JSON.stringify(sp({ 'vmu.store.autoBackup': true }, () => 7).write({ id: 'w' }))
  assert.equal(run(), run())
  passed += 1
})

// keysUsed() ＝ 15 键且每个都被真读
test('keysUsed() lists all 15 keys and each is really read', () => {
  const o = mk({ 'vmu.store.tmpDir': 'D:\\vault\\tmp', 'vmu.store.remote': 'on', 'vmu.store.remote.url': 'https://r', 'vmu.store.remote.offlinePolicy': 'queue' })
  const s = createStorePolicy({ settings: o.settings, clock: () => 0 })
  s.capabilities(); s.acquire({ name: 'a' }); s.release({ name: 'a' }); s.write({ id: 'w', online: false }); s.read({ foundVersion: 2, currentVersion: 1 }); s.status()
  const used = s.keysUsed()
  assert.equal(used.length, 15)
  for (const k of STORE_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  const notRead = used.filter((k) => o.reads.indexOf(k) === -1)
  assert.deepEqual(notRead, [], 'keysUsed 里的键必须真被读过：' + notRead.join('、'))
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU STOREPOLICY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
