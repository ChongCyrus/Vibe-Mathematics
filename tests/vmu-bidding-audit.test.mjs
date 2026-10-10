// vibe-math-vmu —— **只读审计**：既有的 `kernel/bidding.js`（**无 `vmu.bidding.*` 登记键** ✗ ⇒ 只审计不造键 ✗✓）。
// 运行：`node tests/vmu-bidding-audit.test.mjs`（末行 `=== VMU BIDDING AUDIT: N passed, M failed ===`）。
//
// 纪律（Lead 裁决 ✓）：① **拒绝具名** ✓；② **实测缺失的口径**（`enforcedScope`／`fired`／`wouldEvaluate`）
//   **如实断言"未实现"** ✓✓（**不假装** ✗）；③ 导出常量真实可用 ✓（`CLOSE_RULES`／`TIE_BREAKS` ✓）；
//   ④ 纯函数**确定性** ✓（`fingerprintOf`／`normalizePlan` ✓）；⑤ 零机制不崩 ＋ 只读面可重复 ✓；
//   ⑥ **不为它自造任何键** ✗✓（`vmu.bidding.*` 在设置表里 0 命中 ⇒ 本套件**断言这一点** ✓✓）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBidding, CLOSE_RULES, TIE_BREAKS, fingerprintOf, normalizePlan } from '../vibe-math-vmu/kernel/bidding.js'

const SRC = readFileSync(new URL('../vibe-math-vmu/kernel/bidding.js', import.meta.url), 'utf8')
const SCHEMA = readFileSync(new URL('../vibe-math-vmu/settings/schema.js', import.meta.url), 'utf8')
const PLANNED = readFileSync(new URL('../vibe-math-vmu/settings/planned.js', import.meta.url), 'utf8')
const CAP = ['enforcedScope', 'fired', 'wouldEvaluate']

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (vals) => createBidding({ clock: () => 0, log: () => {}, settings: Object.assign({ get(k) { return vals[k] }, ...vals }), bus: { emit: () => {} } })
const probe = (inst) => {
  const out = {}
  for (const k of Object.keys(inst)) {
    if (typeof inst[k] !== 'function') continue
    try {
      const r = inst[k]({})
      out[k] = { shape: JSON.stringify(r), refusal: (r && r.ok === false) ? String(r.code || '（无名）✗') : null }
    } catch (e) { out[k] = { threw: String((e && e.message) || e) } }
  }
  return out
}

// ⑥ **无登记键** ⇒ 断言"两处设置表都 0 命中"（**不为它自造键** ✗✓）
test('bidding has ZERO declared keys in both settings tables (so no keys are invented here)', () => {
  const inSchema = (SCHEMA.match(/vmu\.bidding\./g) || []).length
  const inPlanned = (PLANNED.match(/vmu\.bidding\./g) || []).length
  assert.equal(inSchema, 0, 'schema.js 里不应有 vmu.bidding.*（实测 0 ✓）')
  assert.equal(inPlanned, 0, 'planned.js 里不应有 vmu.bidding.*（实测 0 ✓）')
  passed += 1
})

// ② 实测缺失的口径 ⇒ **如实断言"未实现"** ✓✓
test('the three口径 tokens are NOT implemented in bidding.js (asserted as measured facts)', () => {
  const missing = CAP.filter((t) => SRC.indexOf(t) === -1)
  assert.deepEqual(missing.slice().sort(), CAP.slice().sort(), 'bidding.js 实测应**没有**这三个口径记号；实际缺失=' + JSON.stringify(missing))
  console.log('  · bidding.js 口径实测：' + CAP.map((t) => t + '=' + (SRC.indexOf(t) === -1 ? '缺 ✗' : '有 ✓')).join('  '))
  passed += 1
})

// ③ 导出常量真实可用（**语料真实** ✓；不重定义语义 ✗）
test('CLOSE_RULES / TIE_BREAKS are non-empty and contain the documented members', () => {
  assert.ok(Array.isArray(CLOSE_RULES) && CLOSE_RULES.length >= 1)
  assert.ok(CLOSE_RULES.indexOf('best-score') !== -1, 'CLOSE_RULES 应含 best-score：' + JSON.stringify(CLOSE_RULES))
  assert.ok(Array.isArray(TIE_BREAKS) && TIE_BREAKS.length >= 1)
  assert.ok(TIE_BREAKS.indexOf('earliest') !== -1, 'TIE_BREAKS 应含 earliest：' + JSON.stringify(TIE_BREAKS))
  passed += 1
})

// ④ 纯函数确定性（同输入两次同输出 ✓；不读真实时间/随机 ✗）
test('fingerprintOf / normalizePlan are deterministic pure functions', () => {
  assert.equal(fingerprintOf('alpha'), fingerprintOf('alpha'))
  assert.notEqual(fingerprintOf('alpha'), fingerprintOf('beta'))
  const plan = { steps: ['a', 'b'], budget: 3, note: 'x' }
  // **只断言"确定性"**（同输入两次同输出 ✓）—— **不断言返回值真值** ✗（未知形状的入参可能被规范化成 null ✓，这是**该面的设计** ✓）
  assert.equal(JSON.stringify(normalizePlan(plan)), JSON.stringify(normalizePlan(plan)))
  assert.equal(JSON.stringify(normalizePlan({})), JSON.stringify(normalizePlan({})))
  assert.equal(JSON.stringify(normalizePlan(null)), JSON.stringify(normalizePlan(null)))
  passed += 1
})

// ⑤ 拒绝**具名**（逐操作多种 args 探测 ✓）＋ 零机制不崩 ＋ 只读面可重复 ✓
test('refusals are named; zero-mechanism works; repeated probing is identical', () => {
  const inst = mk({})
  let refusals = 0
  let enforcedReceipts = 0
  for (const k of Object.keys(inst)) {
    if (typeof inst[k] !== 'function') continue
    for (const args of [{}, { id: 'nope' }, { auctionId: 'nope', by: 'x' }, { auctionId: 'nope', by: 'x', amount: 1 }, { plan: {} }]) {
      let r
      try { r = inst[k](args) } catch (e) { continue }
      if (r && r.ok === false) { refusals += 1; assert.ok(r.code, '拒绝必须具名（无 code）：' + k + '(' + JSON.stringify(args) + ')') }
      if (r && Array.isArray(r.enforced)) {
        enforcedReceipts += 1
        if (Array.isArray(r.fired)) for (const x of r.fired) assert.ok(r.enforced.indexOf(x) !== -1, '**fired ⊆ enforced** 违约：' + x)
      }
    }
  }
  console.log('  · 具名拒计数=' + refusals + '；带 enforced 的回执=' + enforcedReceipts + '（0 ⇒ 该面未实现口径 ✗，已如实记录 ✓）')
  const zero = createBidding({ clock: () => 0 })
  assert.ok(zero && typeof zero === 'object')
  assert.equal(JSON.stringify(probe(mk({}))), JSON.stringify(probe(mk({}))), '两次探测必须逐字相同')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU BIDDING AUDIT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
