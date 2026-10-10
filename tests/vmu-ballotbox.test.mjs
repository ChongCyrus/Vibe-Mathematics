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

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU BALLOTBOX: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
