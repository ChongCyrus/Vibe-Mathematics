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
    // ROUND 16 (docs/11 §4.2 第九条): this used to be `if (Array.isArray(r.fired)) { … }` - when the field was absent
    // BOTH claims below were skipped, and measured on this face (kernel/ballotbox.js contains `fired` 0 times) the
    // branch NEVER ran: the checks were dead code in the shape of a check. They are now unconditional over a
    // normalised list, and `fired`'s own shape is asserted so a malformed value cannot be normalised into "nothing to
    // check". EMPTY_ALLOWED (RULE E): a receipt that does not declare fired[] has nothing to be a subset OF - the
    // SELF-PROBE below carries the teeth instead of a branch that never runs.
    assert.ok(r.fired === undefined || Array.isArray(r.fired), 'fired[] 若存在必须是数组：' + JSON.stringify(r.fired))
    const fired = Array.isArray(r.fired) ? r.fired : []
    assert.equal(new Set(fired).size, fired.length)
    for (const k of fired) assert.ok(r.enforced.includes(k), 'fired ⊆ enforced')
  }
  {
    // EMPTY_ALLOWED (RULE E): the normalised list may legitimately be empty; the try/catch around it is the evidence.
    const subsetOf = (rec) => { for (const x of (Array.isArray(rec.fired) ? rec.fired : [])) assert.ok(rec.enforced.includes(x), 'fired ⊆ enforced') }
    let caught = false
    try { subsetOf({ enforced: ['a'], fired: ['b'] }) } catch (e) { caught = true }
    assert.ok(caught, '★ SELF-PROBE：fired ⊄ enforced 的回执必须被抓到（本面实测不声明 fired[] ⇒ 规则不能只活在从不执行的分支里）')
    let quiet = false
    try { subsetOf({ enforced: ['a'], fired: ['a'] }); quiet = true } catch (e) { quiet = false }
    assert.ok(quiet, '★ SELF-PROBE：合规回执必须安静（否则上一条会因为"任何输入都抛"而永远为真）')
    // the SHAPE claim lives in the same never-taken branch, so it gets the same treatment (synthetic input).
    const shapeOk = (rec) => rec.fired === undefined || Array.isArray(rec.fired)
    assert.ok(!shapeOk({ enforced: [], fired: 'not-an-array' }) && shapeOk({ enforced: [] }) && shapeOk({ enforced: [], fired: [] }),
      '★ SELF-PROBE：形状判据把"非数组 fired[]"判红、把"缺省 fired"与"空数组 fired"判过')
  }
  passed += 1
})

// ROUND 157: the irv branch - refused by name without the key, resolved in ONE ruling with it, every round returned.
test('irv is resolved in one ruling, and refused by name when the key is off', () => {
  const base = { 'vmu.ballot.minVotes': 0, 'vmu.ballot.minVotesRatio': 0, 'vmu.ballot.method': 'irv' }
  const face = (over) => createBallotBox({ settings: { get: (k) => Object.assign({}, base, over || {})[k] }, clock: () => 0, log: () => {} })
  const ballots = [['v1', ['a', 'b', 'c']], ['v2', ['a', 'c', 'b']], ['v3', ['b', 'c', 'a']], ['v4', ['c', 'b', 'a']]]
  const drive = (f) => {
    const o = f.open({ question: 'q', options: ['a', 'b', 'c'] })
    for (const [by, ch] of ballots) f.cast({ boxId: o.boxId, by, choices: ch })
    return f.close({ boxId: o.boxId })
  }

  const off = drive(face({ 'vmu.ballot.irvInstantSingleCount': false }))
  assert.equal(off.ok, false, 'irv WITHOUT the key is refused (the round model cannot express it)')
  assert.equal(off.code, 'VMU_BALLOT_METHOD_UNSUPPORTED')
  assert.equal(off.method, 'irv', 'the refusal names the method')

  const on = drive(face({ 'vmu.ballot.irvInstantSingleCount': true }))
  assert.equal(on.ok, true, 'irv WITH the key resolves inside one ruling')
  assert.equal(on.outcome, 'undecided', 'MEASURED: b and c tie for last place, so the counter refuses to invent an elimination')
  /**
   * ROUND 158: these were withdrawn in round 157 while the box returned nothing, and they come back ONLY because the
   * fix was measured first: the ranked path had been refused (indexOf with an array is always -1) so the box votes
   * were empty. With the reply checked by printing, every value below is a measured one, not a hoped-for one.
   */
  assert.equal(on.rounds.length, 1, 'the reply carries the elimination rounds (measured: one round, because b and c tie)')
  assert.deepEqual(on.rounds[0].counts, { a: 2, b: 1, c: 1 }, 'and the first-preference counts of that round')
  assert.equal(on.exhausted, 0, 'the exhausted count is reported')
  assert.ok(Array.isArray(on.tie) && on.tie.indexOf('b') !== -1 && on.tie.indexOf('c') !== -1,
    '★ the tied options are NAMED: ' + JSON.stringify(on.tie))
  assert.ok(on.enforced.indexOf('vmu.ballot.irvInstantSingleCount') !== -1, 'and the key that made it work is named in enforced')

  // ROUND 158: the ranked path through the BOX with a real transfer, and the new guard for an option that is not on
  // the ballot. Both exercise code this round changed.
  {
    const five = [['v1', ['p', 'q']], ['v2', ['p', 'q']], ['v3', ['r', 'q']], ['v4', ['r', 'q']], ['v5', ['s', 'p']]]
    const fx = face({ 'vmu.ballot.irvInstantSingleCount': true })
    const ox = fx.open({ question: 'q', options: ['p', 'q', 'r', 's'] })
    for (const [by, ch] of five) fx.cast({ boxId: ox.boxId, by, choices: ch })
    const rx = fx.close({ boxId: ox.boxId })
    assert.equal(rx.outcome, 'p', 'MEASURED: transfers elect p through the box')
    assert.ok(Array.isArray(rx.rounds) && rx.rounds.length >= 2, 'and more than one round was needed: ' + (rx.rounds || []).length)
    const bad = fx.cast({ boxId: ox.boxId, by: 'v9', choices: ['p', 'not-an-option'] })
    assert.equal(bad.ok, false, '★ a ranked entry that is NOT on the ballot is refused (the new guard)')
    assert.equal(bad.code, 'VMU_CONFLICT')
  }

  const f2 = face({ 'vmu.ballot.irvInstantSingleCount': true })
  const o2 = f2.open({ question: 'q', options: ['x', 'y'] })
  f2.cast({ boxId: o2.boxId, by: 'v1', choices: ['x'] })
  f2.cast({ boxId: o2.boxId, by: 'v2', choices: ['y'] })
  const tied = f2.close({ boxId: o2.boxId })
  assert.equal(tied.outcome, 'undecided', 'a last-place tie is undecided, never an implicit sort order')
  assert.deepEqual(tied.tie, ['x', 'y'], 'MEASURED: both tied options are named')
  passed += 1
})

// ★ PHASE 7: PER-BOX rules. Two boxes in the SAME assembly, different minVotes, each judged by its own rule.
test('per-box minVotes: the same assembly has two boxes with different floors, each judge by its own', () => {
  const b = box({ 'vmu.ballot.minVotes': 0 })
  const b2 = b.open(Object.assign({}, OPEN, { rules: { minVotes: 2 }, eligible: ['r-1', 'r-2', 'r-3'] }))
  const b1 = b.open(Object.assign({}, OPEN, { rules: { minVotes: 1 }, eligible: ['r-1', 'r-2', 'r-3'] }))
  assert.equal(b2.rules.minVotes, 2, 'the box receipt exposes its own rules')
  b.cast({ boxId: b1.boxId, by: 'r-1', choice: 'a' })
  b.cast({ boxId: b2.boxId, by: 'r-1', choice: 'a' })
  const c1 = b.close({ boxId: b1.boxId })
  assert.equal(c1.ok, true, 'minVotes=1 box closes with 1 vote')
  const c2 = b.close({ boxId: b2.boxId })
  assert.equal(c2.ok, false, 'minVotes=2 box does NOT close with 1 vote')
  assert.equal(c2.code, 'VMU_BALLOT_MIN_VOTES_NOT_MET')
  assert.equal(c2.tally.floor, 2, 'the failing box reports ITS floor, not the global one')
  passed += 1
})
test('per-box rules: unknown name and illegal value are NAMED refusals', () => {
  const b = box({})
  const unk = b.open(Object.assign({}, OPEN, { rules: { min_votes: 2 } }))
  assert.equal(unk.code, 'VMU_BALLOT_RULE_UNKNOWN')
  const big = b.open(Object.assign({}, OPEN, { rules: { minVotes: 9 }, eligible: ['r-1', 'r-2'] }))
  assert.equal(big.code, 'VMU_BALLOT_RULE_INVALID')
  const bad = b.open(Object.assign({}, OPEN, { rules: { minChoices: 2, maxChoices: 1 } }))
  assert.equal(bad.code, 'VMU_BALLOT_RULE_INVALID')
  passed += 1
})
test('per-box rules: mode/maxChoices enforced, and zero rules changes nothing', () => {
  const b = box({})
  const plain = b.open(OPEN)
  assert.equal(plain.rulesDeclared, false, 'no rules ⇒ zero mechanism, rulesDeclared=false')
  const single = b.open(Object.assign({}, OPEN, { rules: { mode: 'single', maxChoices: 2 } }))
  assert.equal(single.rules.maxChoices, 1, 'mode=single forces maxChoices=1')
  const over = b.cast({ boxId: single.boxId, by: 'r-1', approvals: ['a', 'b'] })
  assert.equal(over.ok, false)
  assert.equal(over.code, 'VMU_BALLOT_CHOICE_COUNT')
  const rev = b.open(Object.assign({}, OPEN, { rules: { allowRevote: true } }))
  b.cast({ boxId: rev.boxId, by: 'r-1', choice: 'a' })
  const again = b.cast({ boxId: rev.boxId, by: 'r-1', choice: 'b' })
  assert.equal(again.ok, true, 'allowRevote=true allows replacing the vote')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}

console.log('=== VMU BALLOTBOX: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
