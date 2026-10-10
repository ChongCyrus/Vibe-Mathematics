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
      const isRefusal = !!(r && r.ok === false)
      if (isRefusal) refusals += 1
      assert.ok(!isRefusal || r.code, '拒绝必须具名（无 code）：' + k + '(' + JSON.stringify(args) + ')')
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

// ⑥ **真驱动**（读 `bidding.js` 正文取得真键与真操作 ✓）：键在 **`vmu.auction.*`** ✗✓（**不是** `vmu.bidding.*` ✓）
//    `post()` 需要 `deadlineMs` **或**正的 `vmu.auction.bidWindowMs` ✓；`bid()` 的具名拒**是抛出的**（读 `e.code` ✓）。
//    三条：**窗口外** `VMU_AUCTION_CLOSED` ✓／**超 `maxBids`** `VMU_RESOURCE_BUDGET`（带**现值/上限** ✓）／
//    **超 `maxBidCost`** `VMU_AUCTION_INVALID_BID`（带**现值/上限** ✓）⇒ 驱动不到 ⇒ **如实写"未能证明＋试过的参数"** ✓✓（不猜 ✗）
test('REAL driving: window / maxBids / maxBidCost produce NAMED refusals (or recorded as 未能证明)', () => {
  const codes = []
  const drive = (label, vals, argsList, script) => {
    for (const args of argsList) {
      let t = 0
      const b = createBidding({ clock: () => t, log: () => {}, settings: Object.assign({ get(k) { return vals[k] }, ...vals }), bus: { emit: () => {} } })
      let p
      try { p = b.post(args) } catch (e) { continue }                 // 该参数形状不可用 ⇒ 试下一个 ✓
      if (!p || p.ok !== true) continue
      const postId = p.postId || (p.post && p.post.id) || 'p1'
      try {
        const out = script(b, (ms) => { t += ms }, postId)
        console.log('    - ' + label + ' ⇒ **ok**（' + JSON.stringify(out).slice(0, 100) + '）· post() 可用参数=' + JSON.stringify(args))
      } catch (e) {
        const code = String((e && e.code) || '（无名）✗')
        codes.push(code)
        console.log('    - ' + label + ' ⇒ **throw ' + code + '** :: ' + String((e && e.message) || '').slice(0, 110) + ' | hint=' + String((e && e.hint) || '').slice(0, 80))
      }
      return true
    }
    console.log('    - ' + label + ' ⇒ **未能证明** ✗（post() 参数都驱动不到：' + JSON.stringify(argsList) + '）')
    return false
  }
  // **真参数**（读正文 L239–252 取得 ✓）：`post({taskId, budget, deadlineMs?, at?})` 必填 `taskId`＋`budget` ✓；
  //   **零机制下 `vmu.auction.enabled=false` ⇒ `post` 直接 `VMU_STATE`（"market is inert"）** ✗✓ ⇒ 必须显式 `enabled:true` ✓
  const EN = { 'vmu.auction.enabled': true, 'vmu.auction.maxOpenAuctions': 1 }
  const OK_POST = [{ taskId: 't-1', budget: 100 }]
  // ① 窗口外：不传 deadlineMs ⇒ 截止＝现在＋bidWindowMs(1000) ✓，时钟推 2000 ⇒ 已关 ✓
  drive('① 窗口外（bidWindowMs=1000，时钟推 +2000）', Object.assign({ 'vmu.auction.bidWindowMs': 1000 }, EN), OK_POST, (b, adv, id) => { adv(2000); return b.bid({ postId: id, by: 'a', price: 1 }) })
  // ② 超 maxBids：首个投标 ok ⇒ 第二人触发上限 ✓
  drive('② 超 maxBids=1（第二人投标）', Object.assign({ 'vmu.auction.bidWindowMs': 600000, 'vmu.auction.maxBids': 1 }, EN), OK_POST, (b, adv, id) => { b.bid({ postId: id, by: 'a', price: 1, plan: 'plan-a' }); return b.bid({ postId: id, by: 'b', price: 2, plan: 'plan-b' }) })
  // ③ 超 maxBidCost：报价 11 > 上限 10 ✓（hint 必须带现值/上限 ✓）
  drive('③ 超 maxBidCost=10（报价 11）', Object.assign({ 'vmu.auction.bidWindowMs': 600000, 'vmu.auction.maxBidCost': 10 }, EN), OK_POST, (b, adv, id) => b.bid({ postId: id, by: 'a', price: 11 }))
  // **消灭"空过"** ✗✓✓：**先断言非空** ⇒ 三条都驱不到时**必须红** ✓；再断言具名 ✓
  assert.ok(codes.length > 0, '真驱动必须**至少**复现一条具名拒（否则本断言为空过 ✗）；试过的参数见上；`post()` 需 taskId＋budget 且 `vmu.auction.enabled=true` ✓')
  for (const c of codes) assert.ok(/^VMU_/.test(c), '真驱动下的拒绝必须具名（无名 ⇒ ✗）：' + c)
  console.log('  · 真驱动实测到的码：' + codes.join('、'))
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU BIDDING AUDIT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
