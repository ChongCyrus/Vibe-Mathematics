// vibe-math-vmu —— 表决票箱（kernel/ballotbox.js）独立测试。
// 运行：`node tests/vmu-ballotbox.test.mjs`（末行 `=== VMU BALLOTBOX: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createBallotBox, ALL_BALLOT_KEYS, WIRED_BALLOT_KEYS, PLANNED_BALLOT_KEYS } from '../vibe-math-vmu/kernel/ballotbox.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const box = (over, clock) => createBallotBox({ settings: mk(over).settings, clock: clock || (() => 0), log: () => {}, bus: { emit: () => {} } })
const OPEN = { question: 'Q?', options: ['a', 'b'] }

// ③ 恰好划分 27 ＋ 交集为空（**未接逐条点名** ✓）
test('wired ∪ planned is an exact partition of the 27 keys, and they are disjoint', () => {
  const b = box()
  const p = b.partition()
  assert.equal(p.all, 27)
  assert.equal(p.wired + p.planned, 27)
  assert.equal(p.disjoint, true)
  assert.equal(p.exact, true)
  for (const [k, why] of PLANNED_BALLOT_KEYS) assert.ok(why && why.length > 5, '未接键必须给原因：' + k)
  const missing = ALL_BALLOT_KEYS.filter((k) => WIRED_BALLOT_KEYS.indexOf(k) === -1 && !PLANNED_BALLOT_KEYS.some((x) => x[0] === k))
  assert.deepEqual(missing, [], '不得有既不接也不点名的键')
  passed += 1
})

// ①② 已接键改变行为 ＋ enforced[] 只列真求值的键
test('a wired key changes behaviour and enforced[] lists only what was evaluated', () => {
  const off = box({ 'vmu.ballot.secrecy': false, 'vmu.ballot.rollCallOrder': 'roster' })
  const o1 = off.open(OPEN)
  off.cast({ boxId: o1.boxId, by: 'r-1', choice: 'a' })
  const c1 = off.close({ boxId: o1.boxId })
  assert.equal(c1.detail.length, 1, '非秘密 ⇒ 明细可回收')
  const on = box({ 'vmu.ballot.secrecy': true })
  const o2 = on.open(OPEN)
  on.cast({ boxId: o2.boxId, by: 'r-1', choice: 'a' })
  const c2 = on.close({ boxId: o2.boxId })
  assert.equal(c2.detail, null, '秘密 ⇒ 明细不可回收')
  assert.equal(c2.tally.votes, 1, '但计数保留')
  assert.ok(c2.enforced.indexOf('vmu.ballot.secrecyRecordFact') !== -1, 'secrecyRecordFact 被求值 ⇒ 必须出现在 enforced')
  assert.ok(c2.enforced.indexOf('vmu.ballot.rollCallOrder') === -1, '未求值的键**不得**出现在 enforced')
  passed += 1
})

// 法定人数不足 ⇒ **具名拒**（不是"未通过"）；不足时也不得给 outcome
test('an unmet floor is a NAMED refusal, not a "rejected" outcome', () => {
  const b = box({ 'vmu.ballot.minVotes': 3 })
  const o = b.open(OPEN)
  b.cast({ boxId: o.boxId, by: 'r-1', choice: 'a' })
  const r = b.close({ boxId: o.boxId })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VMU_BALLOT_MIN_VOTES_NOT_MET')
  assert.equal(r.outcome, undefined, '不足法定人数**不得**给出 outcome')
  assert.ok(/未成立/.test(r.message), '必须说清是"未成立"：' + r.message)
  assert.equal(b.refusals()['VMU_BALLOT_MIN_VOTES_NOT_MET'], 1, '拒绝必须按码计数')
  passed += 1
})

// 弃权与缺席**分开计数**；abstainAllowed=false ⇒ 具名拒
test('abstain and absent are counted separately; a disallowed abstain is refused', () => {
  const b = box({ 'vmu.ballot.abstainAllowed': true })
  const o = b.open(OPEN)
  b.cast({ boxId: o.boxId, by: 'r-1', choice: 'a' })
  b.cast({ boxId: o.boxId, by: 'r-2', choice: 'abstain' })
  b.markAbsent({ boxId: o.boxId, by: 'r-3' })
  const c = b.close({ boxId: o.boxId })
  assert.equal(c.tally.votes, 1)
  assert.equal(c.tally.abstain, 1)
  assert.equal(c.tally.absent, 1)
  const off = box({ 'vmu.ballot.abstainAllowed': false })
  const o2 = off.open(OPEN)
  assert.equal(off.cast({ boxId: o2.boxId, by: 'r-1', choice: 'abstain' }).code, 'VMU_BALLOT_ABSTAIN_NOT_ALLOWED')
  passed += 1
})

// 平票 ⇒ 自曝规则；unresolved ⇒ 具名拒
test('a tie is resolved by tieRule and the rule used is SELF-REPORTED', () => {
  const unresolved = box({ 'vmu.ballot.tieRule': 'unresolved' })
  const o1 = unresolved.open(OPEN)
  unresolved.cast({ boxId: o1.boxId, by: 'r-1', choice: 'a' })
  unresolved.cast({ boxId: o1.boxId, by: 'r-2', choice: 'b' })
  const r1 = unresolved.close({ boxId: o1.boxId })
  assert.equal(r1.code, 'VMU_BALLOT_TIE_UNRESOLVED')
  assert.equal(r1.tieUsed, 'unresolved')
  const chair = box({ 'vmu.ballot.tieRule': 'chair' })
  const o2 = chair.open(OPEN)
  chair.cast({ boxId: o2.boxId, by: 'r-1', choice: 'a' })
  chair.cast({ boxId: o2.boxId, by: 'r-2', choice: 'b' })
  const r2 = chair.close({ boxId: o2.boxId, chairChoice: 'b' })
  assert.equal(r2.ok, true)
  assert.equal(r2.tieUsed, 'chair', '必须自曝用了哪条规则')
  assert.equal(r2.outcome, 'b')
  passed += 1
})

// runoffTopN ⇒ 第二轮并标 round:2
test('runoffTopN starts round 2 and the receipt says round:2', () => {
  const b = box({ 'vmu.ballot.method': 'runoff', 'vmu.ballot.runoffTopN': 2, 'vmu.ballot.roundsMax': 2 })
  const o = b.open(OPEN)
  b.cast({ boxId: o.boxId, by: 'r-1', choice: 'a' })
  b.cast({ boxId: o.boxId, by: 'r-2', choice: 'b' })
  const r = b.close({ boxId: o.boxId })
  assert.equal(r.ok, true)
  assert.equal(r.round, 2)
  assert.deepEqual(r.runoff, ['a', 'b'])
  assert.ok(r.enforced.indexOf('vmu.ballot.runoffTopN') !== -1)
  passed += 1
})

// 重复投票 ⇒ 具名拒；method 不支持 ⇒ 具名拒
test('duplicate votes and unsupported methods are named refusals (and counted)', () => {
  const b = box()
  const o = b.open(OPEN)
  b.cast({ boxId: o.boxId, by: 'r-1', choice: 'a' })
  assert.equal(b.cast({ boxId: o.boxId, by: 'r-1', choice: 'b' }).code, 'VMU_CONFLICT')
  const bad = box({ 'vmu.ballot.method': 'quadratic-irv' })
  assert.equal(bad.open(OPEN).code, 'VMU_BALLOT_METHOD_UNSUPPORTED')
  assert.equal(bad.refusals()['VMU_BALLOT_METHOD_UNSUPPORTED'], 1)
  passed += 1
})

// ⑦ 只读面不改状态；零机制不崩；注入时钟确定性
test('read paths are pure, zero-config works, and results are clock-deterministic', () => {
  const zero = createBallotBox({ clock: () => 0 })
  const o = zero.open(OPEN)
  assert.equal(o.ok, true)
  const a = JSON.stringify({ s: zero.status(), s2: zero.status({ boxId: o.boxId }), k: zero.keysUsed() })
  const b = JSON.stringify({ s: zero.status(), s2: zero.status({ boxId: o.boxId }), k: zero.keysUsed() })
  assert.equal(a, b, 'status() 不得改状态')
  const run = () => {
    const x = box({}, () => 9)
    const open0 = x.open(OPEN)
    x.cast({ boxId: open0.boxId, by: 'r-1', choice: 'a' })
    return JSON.stringify(x.close({ boxId: open0.boxId }))
  }
  assert.equal(run(), run())
  passed += 1
})

// keysUsed() ＝ 已接键，且每个都被真读（读了 ≠ 起作用：由 enforced[] 区分 ✓）
test('keysUsed() equals the wired set and each is really read', () => {
  const o = mk({})
  const b = createBallotBox({ settings: o.settings, clock: () => 0 })
  const open0 = b.open(OPEN)
  b.cast({ boxId: open0.boxId, by: 'r-1', choice: 'a' })
  b.close({ boxId: open0.boxId })
  b.status()
  const used = b.keysUsed()
  assert.equal(used.length, WIRED_BALLOT_KEYS.length)
  for (const k of WIRED_BALLOT_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  const notRead = used.filter((k) => o.reads.indexOf(k) === -1)
  assert.deepEqual(notRead, [], 'keysUsed 里的键必须真的被读过：' + notRead.join('、'))
  passed += 1
})

// ⑪ enforced 语义：open() 是**真实求值列表**（不是静态清单 ✓）——"行为变了必须在列"
test('open() enforced is the REAL evaluation list: it changes when behaviour changes', () => {
  const off = box({ 'vmu.ballot.secrecy': false }).open(OPEN)
  const on = box({ 'vmu.ballot.secrecy': true }).open(OPEN)
  assert.notDeepEqual(on.enforced, off.enforced, 'secrecy 开/关 ⇒ open 的 enforced **必须不同** ✓')
  assert.ok(on.enforced.indexOf('vmu.ballot.secrecy') !== -1, '开了 secrecy（改变了 sealed）⇒ 必须在列 ✓')
  assert.ok(off.enforced.indexOf('vmu.ballot.secrecy') === -1, '关了 secrecy（未改变行为）⇒ **不得**在列 ✓')
  assert.ok(off.enforced.indexOf('vmu.ballot.method') !== -1, 'method 真参与校验 ⇒ 在列 ✓')
  for (const k of ['vmu.ballot.minVotes', 'vmu.ballot.tieRule', 'vmu.ballot.runoffTopN', 'vmu.ballot.rollCallOrder']) {
    assert.ok(off.enforced.indexOf(k) === -1, 'open() 未求值 ⇒ 不得出现：' + k)
  }
  assert.equal(new Set(off.enforced).size, off.enforced.length, 'enforced 不得有重复项')
  passed += 1
})

// ⑫ 每一条拒绝都必须带数组型 `enforced`（可空，**不得 undefined** ✗✓）＋"行为变了必须在列"正反例
test('every refusal carries an array enforced (never undefined) and names the key that caused it', () => {
  const b = box({ 'vmu.ballot.abstainAllowed': false })
  const o = b.open(OPEN)
  const r = b.cast({ boxId: o.boxId, by: 'r-1', choice: 'abstain' })
  assert.equal(r.code, 'VMU_BALLOT_ABSTAIN_NOT_ALLOWED')
  assert.ok(Array.isArray(r.enforced), 'enforced 必须是数组（不得 undefined）')
  assert.ok(r.enforced.indexOf('vmu.ballot.abstainAllowed') !== -1, '导致拒绝的键**必须在列**：' + JSON.stringify(r.enforced))
  const okBox = box({ 'vmu.ballot.abstainAllowed': true })
  const o2 = okBox.open(OPEN)
  assert.equal(okBox.cast({ boxId: o2.boxId, by: 'r-1', choice: 'abstain' }).ok, true)
  const bad = box({ 'vmu.ballot.method': 'nope' })
  const m = bad.open(OPEN)
  assert.ok(Array.isArray(m.enforced) && m.enforced.indexOf('vmu.ballot.method') !== -1, 'method 拒绝必须点名 method：' + JSON.stringify(m.enforced))
  const noBox = b.cast({ boxId: 'bx-404', by: 'r-1', choice: 'a' })
  assert.ok(Array.isArray(noBox.enforced), '找错票箱也必须带数组')
  const dupBox = box({})
  const o3 = dupBox.open(OPEN)
  dupBox.cast({ boxId: o3.boxId, by: 'r-1', choice: 'a' })
  assert.ok(Array.isArray(dupBox.cast({ boxId: o3.boxId, by: 'r-1', choice: 'b' }).enforced), '重复投票也必须带数组')
  const floor = box({ 'vmu.ballot.minVotes': 5 })
  const o4 = floor.open(OPEN)
  const fr = floor.close({ boxId: o4.boxId })
  assert.ok(Array.isArray(fr.enforced), '法定人数不足也必须带数组')
  assert.ok(fr.enforced.indexOf('vmu.ballot.minVotes') !== -1, '必须点名**哪把尺子**不够（minVotes ✓）：' + JSON.stringify(fr.enforced))
  assert.ok(/受限键/.test(fr.message), 'message 也要点名：' + fr.message)
  const cred = box({ 'vmu.ballot.quadraticCreditCap': 1 })
  const o5 = cred.open(OPEN)
  const cr = cred.cast({ boxId: o5.boxId, by: 'r-1', choice: 'a', credits: 5 })
  assert.equal(cr.code, 'VMU_CONFLICT')
  assert.ok(cr.enforced.indexOf('vmu.ballot.quadraticCreditCap') !== -1, 'credits 拒必须点名该键：' + JSON.stringify(cr.enforced))
  passed += 1
})

// ⑤ D3（回执级口径）：每个成功回执与每个拒绝都带 enforcedScope；完整场景无重复；fired ⊆ enforced
test('D3: every receipt and every refusal carries enforcedScope, with no duplicate entries', () => {
  const b = box({})
  const o = b.open(OPEN)
  assert.equal(o.enforcedScope, 'evaluated-so-far')
  const v1 = b.cast({ boxId: o.boxId, by: 'm1', choice: 'a' })
  assert.equal(v1.enforcedScope, 'evaluated-so-far')
  const abs = b.cast({ boxId: o.boxId, by: 'm2', choice: 'abstain' })
  assert.equal(abs.enforcedScope, 'evaluated-so-far')
  // 该面用 `return deny(...)`（**返回**具名拒绝对象，不抛）⇒ 直接取返回值断言口径 ✓
  const refusal = b.cast({ boxId: o.boxId, by: 'm3', choice: 'zzz' })
  assert.ok(refusal && refusal.ok === false && typeof refusal.code === 'string', 'a refused call returns the named refusal value')
  assert.equal(refusal.enforcedScope, 'evaluated-so-far')
  assert.ok(Array.isArray(refusal.enforced))
  const closed = b.close({ boxId: o.boxId })
  assert.equal(closed.enforcedScope, 'evaluated-so-far')
  const receipts = [o, v1, abs, closed].filter((r) => Array.isArray(r.enforced))
  assert.ok(receipts.length === 4, 'the scenario produced receipts to check')
  for (const r of receipts) {
    assert.equal(r.enforcedScope, 'evaluated-so-far')
    assert.equal(new Set(r.enforced).size, r.enforced.length)
    if (Array.isArray(r.fired)) {
      assert.equal(new Set(r.fired).size, r.fired.length)
      for (const k of r.fired) assert.ok(r.enforced.includes(k), 'fired ⊆ enforced')
    }
  }
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU BALLOTBOX: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
