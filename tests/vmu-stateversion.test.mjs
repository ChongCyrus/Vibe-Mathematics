// vibe-math-vmu —— 状态版本与迁移（kernel/stateversion.js）独立测试。
// 运行：`node tests/vmu-stateversion.test.mjs`（末行 `=== VMU STATEVERSION: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createStateVersion, STATEVERSION_KEYS } from '../vibe-math-vmu/kernel/stateversion.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const MIG = [
  { from: '1', to: '2', run: (s) => Object.assign({}, s, { b: 2 }) },
  { from: '2', to: '3', run: (s) => Object.assign({}, s, { c: 3 }) },
]
const boot = (over, clock) => {
  const o = mk(over)
  const sv = createStateVersion({ settings: o.settings, clock: clock || (() => 0), log: () => {}, bus: { emit: () => {} } })
  sv.declare({ version: '3', migrations: MIG })
  return { sv, o }
}

// ① 无版本标签 ⇒ 默认具名拒（绝不当成当前版本）
test('a state without a version tag is refused by default', () => {
  const { sv } = boot()
  const r = sv.check({ state: { a: 1 } })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_COMPAT_UNKNOWN_COMBO')
  assert.ok(/绝不当成当前版本/.test(r.message), '必须说明不假定：' + r.message)
  // 打标签后才可读
  const w = sv.wrap({ state: { a: 1 } })
  assert.equal(w.state.schemaVersion, '3')
  assert.equal(sv.check({ state: w.state }).ok, true)
  passed += 1
})

// ①' warn 策略 ⇒ 放行但**自曝 assumed**
test('under onUnknown=warn an unknown version is ASSUMED and self-reported', () => {
  const { sv } = boot({ 'vmu.state.onUnknown': 'warn' })
  const r = sv.check({ state: { a: 1 } })
  assert.equal(r.ok, true)
  assert.equal(r.assumed, true)
  assert.ok(/假定/.test(r.warning), '必须自曝假定：' + r.warning)
  passed += 1
})

// ② 显式迁移成功且逐步留痕（from→to ＋ 谁/何时/为何）
test('an explicit migration succeeds with a per-step audit trail', () => {
  const { sv } = boot({}, () => 42)
  const r = sv.migrate({ state: { a: 1, schemaVersion: '1' }, to: '3', by: 'acad', why: 'N4 升级' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.audit, ['1→2', '2→3'])
  assert.equal(r.state.schemaVersion, '3')
  assert.equal(r.steps.length, 2)
  for (const s of r.steps) { assert.equal(s.at, 42); assert.equal(s.by, 'acad'); assert.equal(s.why, 'N4 升级') }
  assert.equal(sv.history().length, 1)
  passed += 1
})

// ③ 迁移失败 ⇒ 原状态**一字不变**（不留半迁移态）
test('a failing migration leaves the original state untouched', () => {
  const o = mk({})
  const sv = createStateVersion({ settings: o.settings, clock: () => 0 })
  sv.declare({ version: '2', migrations: [
    { from: '1', to: '2', run: (s) => Object.assign({}, s, { b: 2 }) },
    { from: '2', to: '3', run: () => { throw new Error('boom') } },
  ] })
  const original = { a: 1, schemaVersion: '1' }
  const snapshot = JSON.stringify(original)
  const r = sv.migrate({ state: original, to: '3' })
  assert.equal(r.code, 'VMU_MIGRATE_DRYRUN_FAILED')
  assert.equal(JSON.stringify(original), snapshot, '原状态必须一字不变')
  assert.ok(/原状态未改动/.test(r.hint), '必须说明原子性：' + r.hint)
  passed += 1
})

// ④ 降级默认拒（显式放行才通）
test('downgrade is refused by default', () => {
  const { sv } = boot({})
  const r = sv.migrate({ state: { schemaVersion: '3' }, to: '1' })
  assert.equal(r.code, 'VMU_INDEX_STALE')
  assert.ok(/降级/.test(r.message), r.message)
  passed += 1
})

// ⑤ 幂等：已目标版本 ⇒ noop:true 且不重复迁移
test('migrating to the same version is a no-op', () => {
  const { sv } = boot({})
  const r = sv.migrate({ state: { a: 1, schemaVersion: '3' }, to: '3' })
  assert.equal(r.ok, true)
  assert.equal(r.noop, true)
  assert.deepEqual(r.steps, [])
  passed += 1
})

// ⑥ 环 ⇒ 拒（不走回头路）
test('a cyclic migration graph is refused', () => {
  const o = mk({})
  const sv = createStateVersion({ settings: o.settings, clock: () => 0 })
  sv.declare({ version: '9', migrations: [
    { from: '1', to: '2', run: (s) => s }, { from: '2', to: '1', run: (s) => s },
  ] })
  const r = sv.migrate({ state: { schemaVersion: '1' }, to: '9' })
  assert.equal(r.ok, false)
  assert.ok(r.code === 'VMU_NOT_FOUND' || r.code === 'VMU_RESOURCE_BUDGET', '环中不可达 ⇒ 具名拒：' + r.code)
  passed += 1
})

// ⑦ 步数上限 ⇒ 具名拒 ＋ 当前/上限
test('the step cap is a named refusal that reports current and limit', () => {
  const o = mk({ 'vmu.state.maxMigrationSteps': 1 })
  const sv = createStateVersion({ settings: o.settings, clock: () => 0 })
  sv.declare({ version: '5', migrations: [
    { from: '1', to: '2', run: (s) => s }, { from: '2', to: '3', run: (s) => s }, { from: '3', to: '4', run: (s) => s }, { from: '4', to: '5', run: (s) => s },
  ] })
  const r = sv.migrate({ state: { schemaVersion: '1' }, to: '5' })
  assert.equal(r.code, 'VMU_RESOURCE_BUDGET')
  assert.ok(/上限/.test(r.message) && /1/.test(r.message), '必须给当前/上限：' + r.message)
  passed += 1
})

// ⑧ 零机制不崩；只读面不改状态
test('zero-configuration works; read paths are pure', () => {
  const sv = createStateVersion({ clock: () => 0 })
  assert.equal(sv.status().ok, true)
  assert.equal(sv.check({ state: { schemaVersion: '1' } }).code, 'VMU_COMPAT_UNKNOWN_COMBO') // 未 declare ⇒ 拒
  const { sv: sv2 } = boot({}, () => 5)
  const before = JSON.stringify({ c: sv2.check({ state: { schemaVersion: '1' } }), s: sv2.status(), h: sv2.history() })
  const after = JSON.stringify({ c: sv2.check({ state: { schemaVersion: '1' } }), s: sv2.status(), h: sv2.history() })
  assert.equal(before, after)
  passed += 1
})

// 确定性（注入时钟）＋ keysUsed 真读
test('determinism and keysUsed() honesty', () => {
  const run = () => {
    const { sv } = boot({}, () => 7)
    return JSON.stringify(sv.migrate({ state: { schemaVersion: '1' }, to: '3' }))
  }
  assert.equal(run(), run())
  const o = mk({})
  const sv = createStateVersion({ settings: o.settings, clock: () => 0 })
  sv.declare({ version: '3', migrations: MIG })
  sv.status(); sv.check({ state: { schemaVersion: '3' } }); sv.migrate({ state: { schemaVersion: '1' }, to: '3' })
  const used = sv.keysUsed()
  assert.equal(used.length, STATEVERSION_KEYS.length)
  for (const k of STATEVERSION_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU STATEVERSION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
