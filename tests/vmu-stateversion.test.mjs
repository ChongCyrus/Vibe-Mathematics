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

// ⑨ N4 修复：非数值版本**方向未知 ⇒ fail-closed**（批评者第 9 轮最小复现）
test('the minimal repro is refused: non-numeric versions never downgrade silently', () => {
  const s = createStateVersion({ clock: () => 0, settings: {} })
  s.declare({ version: 'v10', migrations: [{ from: 'vX', to: 'v10', run: (st) => st }, { from: 'v10', to: 'vX', run: (st) => st }] })
  const r = s.migrate({ state: { schemaVersion: 'v10' }, to: 'vX' })
  assert.equal(r.ok, false, '方向未知**不得**静默放行')
  assert.equal(r.code, 'VMU_INDEX_STALE')
  assert.ok(/方向未知/.test(r.message), '必须说明方向未知：' + r.message)
  passed += 1
})

test('non-numeric version shapes are each fail-closed (1.2.3 / 2024-01 / vX)', () => {
  for (const v of ['1.2.3', '2024-01', 'vX']) {
    const s = createStateVersion({ clock: () => 0, settings: {} })
    s.declare({ version: '2', migrations: [{ from: v, to: '2', run: (st) => st }, { from: '2', to: v, run: (st) => st }] })
    const r = s.migrate({ state: { schemaVersion: '2' }, to: v })
    assert.equal(r.ok, false, v + ' 必须 fail-closed')
    assert.equal(r.code, 'VMU_INDEX_STALE', v + ' ⇒ 码')
  }
  const s2 = createStateVersion({ clock: () => 0, settings: {} })
  s2.declare({ version: '2', migrations: [{ from: '1', to: '2', run: (st) => st }, { from: '2', to: '1', run: (st) => st }] })
  assert.equal(s2.migrate({ state: { schemaVersion: '2' }, to: '1' }).code, 'VMU_INDEX_STALE')
  passed += 1
})

test('directionUnknown is SELF-REPORTED when allowDowngrade explicitly permits it', () => {
  const s = createStateVersion({ clock: () => 0, settings: { 'vmu.state.allowDowngrade': true } })
  s.declare({ version: 'v10', migrations: [{ from: 'vX', to: 'v10', run: (st) => st }, { from: 'v10', to: 'vX', run: (st) => Object.assign({}, st, { down: true }) }] })
  const r = s.migrate({ state: { schemaVersion: 'v10' }, to: 'vX' })
  assert.equal(r.ok, true)
  assert.equal(r.directionUnknown, true, '必须自曝 directionUnknown')
  assert.equal(r.forced, true)
  passed += 1
})

test('an explicit order makes non-numeric versions decidable (and gates the downgrade)', () => {
  const mkSv = (over) => {
    const s = createStateVersion({ clock: () => 0, settings: over || {} })
    s.declare({ version: 'v10', order: ['v1', 'v2', 'v10'], migrations: [{ from: 'v1', to: 'v2', run: (st) => st }, { from: 'v2', to: 'v10', run: (st) => st }, { from: 'v10', to: 'v2', run: (st) => Object.assign({}, st, { down: true }) }] })
    return s
  }
  const f = mkSv().migrate({ state: { schemaVersion: 'v1' }, to: 'v10' })
  assert.equal(f.ok, true)
  assert.equal(f.directionUnknown, false, '显式 order ⇒ 方向已知')
  assert.equal(mkSv().migrate({ state: { schemaVersion: 'v10' }, to: 'v2' }).code, 'VMU_INDEX_STALE', 'order 里 v2 < v10 ⇒ 降级被拒')
  const allowed = mkSv({ 'vmu.state.allowDowngrade': true }).migrate({ state: { schemaVersion: 'v10' }, to: 'v2' })
  assert.equal(allowed.ok, true)
  assert.equal(allowed.directionUnknown, false, '显式 order ⇒ 非"未知"')
  assert.equal(allowed.forced, true)
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

// ⑩ A3 修复：`noop` 也走可选校验；损坏文档不得静默通过
test('the minimal repro is fixed: a corrupt doc at the target version is no longer silently ok', () => {
  const strict = createStateVersion({
    clock: () => 0, settings: {},
    validate: (st) => (st && st.junk === true) ? { ok: false, missing: ['junk 字段不允许'] } : { ok: true },
  })
  strict.declare({ version: 'v10', migrations: [{ from: 'vX', to: 'v10', run: (s) => s }] })
  const r = strict.migrate({ state: { schemaVersion: 'v10', junk: true }, to: 'v10' })
  assert.equal(r.ok, false, '损坏文档在 noop 路径上**必须被拒**')
  assert.equal(r.code, 'VMU_META_VALIDATION_FAILED')
  assert.equal(r.validated, false)
  assert.ok(r.missing.indexOf('junk 字段不允许') !== -1)
  const clean = strict.migrate({ state: { schemaVersion: 'v10' }, to: 'v10' })
  assert.equal(clean.ok, true)
  assert.equal(clean.noop, true)
  assert.equal(clean.validated, true)
  assert.ok(/不需要迁移/.test(clean.noopMeans), 'noop 语义必须写明：' + clean.noopMeans)
  passed += 1
})

test('without a validate seam the result SELF-REPORTS validated:"skipped"', () => {
  const bare = createStateVersion({ clock: () => 0, settings: {} })
  bare.declare({ version: 'v10', migrations: [] })
  const r = bare.migrate({ state: { schemaVersion: 'v10', junk: true }, to: 'v10' })
  assert.equal(r.ok, true)
  assert.equal(r.noop, true)
  assert.equal(r.validated, 'skipped', '未提供校验 ⇒ **必须自曝 skipped** ✗✓')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU STATEVERSION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
