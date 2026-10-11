// vibe-math-vmu —— 教学面（kernel/course.js）独立测试。
// 运行：`node tests/vmu-course.test.mjs`（末行 `=== VMU COURSE: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createCourse, COURSE_KEYS, WIRED_COURSE_KEYS, PLANNED_COURSE_KEYS } from '../vibe-math-vmu/kernel/course.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const mk = (over) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const co = (over, clock) => createCourse({ settings: mk(over).settings, clock: clock || (() => 0), log: () => {}, bus: { emit: () => {} } })

// ③ 恰好划分 24 ＋ 交集为空 ＋ 未接逐个点名
test('wired ∪ planned is an exact partition of the 24 keys with reasons for the unwired', () => {
  const c = co()
  const p = c.partition()
  assert.equal(p.all, 24)
  assert.equal(p.wired + p.planned, 24)
  assert.equal(p.disjoint, true)
  assert.equal(p.exact, true)
  for (const [k, why] of PLANNED_COURSE_KEYS) assert.ok(why && why.length > 6, '未接键必须给原因：' + k)
  const missing = COURSE_KEYS.filter((k) => WIRED_COURSE_KEYS.indexOf(k) === -1 && !PLANNED_COURSE_KEYS.some((x) => x[0] === k))
  assert.deepEqual(missing, [], '不得有既不接也不点名的键')
  passed += 1
})

// ① enabled / visibility / allowAuditors
test('enabled gates the course面; auditors need allowAuditors', () => {
  const off = co({ 'vmu.course.enabled': false }).open({ title: 'T' })
  assert.equal(off.code, 'VMU_NOT_PERMITTED')
  assert.ok(Array.isArray(off.enforced) && off.enforced.indexOf('vmu.course.enabled') !== -1, '拒绝必须点名 enabled')
  const c = co()
  const o = c.open({ title: 'T' })
  assert.equal(o.ok, true)
  const aud = c.enroll({ courseId: o.courseId, who: 'x', auditor: true })
  assert.equal(aud.code, 'VMU_NOT_PERMITTED')
  assert.ok(aud.enforced.indexOf('vmu.course.allowAuditors') !== -1)
  const c2 = co({ 'vmu.course.allowAuditors': true })
  const o2 = c2.open({ title: 'T' })
  assert.equal(c2.enroll({ courseId: o2.courseId, who: 'x', auditor: true }).ok, true)
  passed += 1
})

// ① cohortMax / enrollmentNeedsApproval
test('cohortMax caps enrollment; approval keeps the enrolment pending', () => {
  const c = co({ 'vmu.course.cohortMax': 1, 'vmu.course.enrollmentNeedsApproval': false })
  const o = c.open({ title: 'T' })
  assert.equal(c.enroll({ courseId: o.courseId, who: 'a' }).kind, 'enrolled')
  const full = c.enroll({ courseId: o.courseId, who: 'b' })
  assert.equal(full.code, 'VMU_RESOURCE_BUDGET')
  assert.ok(full.enforced.indexOf('vmu.course.cohortMax') !== -1, '必须点名 cohortMax')
  const appr = co({ 'vmu.course.enrollmentNeedsApproval': true })
  const o2 = appr.open({ title: 'T' })
  assert.equal(appr.enroll({ courseId: o2.courseId, who: 'a' }).kind, 'pending')
  assert.equal(appr.enroll({ courseId: o2.courseId, who: 'a', approved: true }).kind, 'enrolled')
  passed += 1
})

// 成果↔产物对齐：缺证据 ⇒ 具名拒并**点名哪个 outcome**
test('an outcome without evidence is a NAMED refusal naming that outcome', () => {
  const c = co()
  const o = c.open({ title: 'T' })
  const r = c.align({ courseId: o.courseId, outcomes: ['O1', 'O2'], artifacts: { O1: ['a1'] } })
  assert.equal(r.code, 'VMU_META_VALIDATION_FAILED')
  assert.ok(r.message.indexOf('O2') !== -1, '必须点名缺证据的 outcome：' + r.message)
  assert.ok(r.enforced.indexOf('vmu.course.requireEvidence') !== -1)
  assert.equal(c.align({ courseId: o.courseId, outcomes: ['O1'], artifacts: { O1: ['a1'] } }).ok, true)
  // requireEvidence=false ⇒ 放行（正反例）
  const lax = co({ 'vmu.course.requireEvidence': false })
  const o2 = lax.open({ title: 'T' })
  assert.equal(lax.align({ courseId: o2.courseId, outcomes: ['O1'], artifacts: {} }).ok, true)
  passed += 1
})

// maxAttempts / rubricRequired＋requireRubricRef
test('attempt cap and rubric reference are enforced', () => {
  const c = co({ 'vmu.course.maxAttempts': 1 })
  const o = c.open({ title: 'T' })
  assert.equal(c.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x', rubric: 'r0' }).ok, true)
  const over = c.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x' })
  assert.equal(over.code, 'VMU_NOT_PERMITTED')
  assert.ok(over.enforced.indexOf('vmu.course.maxAttempts') !== -1)
  const noRub = c.submit({ courseId: o.courseId, who: 'b', artifact: 'lib/x' })
  assert.equal(noRub.code, 'VMU_META_VALIDATION_FAILED')
  assert.ok(noRub.enforced.indexOf('vmu.course.requireRubricRef') !== -1)
  assert.equal(c.submit({ courseId: o.courseId, who: 'b', artifact: 'lib/x', rubric: 'r1' }).ok, true)
  passed += 1
})

// allowLate / latePenaltyRatio：显式处置并**自曝所选**
test('late submission is handled explicitly and the rule used is SELF-REPORTED', () => {
  const strict = co({ 'vmu.course.allowLate': false })
  const o = strict.open({ title: 'T' })
  const r = strict.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x', rubric: 'r', late: true })
  assert.equal(r.code, 'VMU_NOT_PERMITTED')
  assert.ok(r.enforced.indexOf('vmu.course.allowLate') !== -1)
  const lax = co({ 'vmu.course.allowLate': true, 'vmu.course.latePenaltyRatio': 0.25 })
  const o2 = lax.open({ title: 'T' })
  const r2 = lax.submit({ courseId: o2.courseId, who: 'a', artifact: 'lib/x', rubric: 'r', late: true })
  assert.equal(r2.ok, true)
  assert.deepEqual(r2.latePolicy, { applied: true, rule: 'latePenaltyRatio', ratio: 0.25, additive: false })
  const onTime = lax.submit({ courseId: o2.courseId, who: 'b', artifact: 'lib/x', rubric: 'r' })
  assert.deepEqual(onTime.latePolicy, { applied: false, rule: 'none' })
  passed += 1
})

// selfReviewAllowed / blindReview / reviewersPerSubmission（当前/门槛）
test('self-review and the reviewer threshold are enforced with current/needed', () => {
  const c = co({ 'vmu.course.selfReviewAllowed': false, 'vmu.course.reviewersPerSubmission': 2, 'vmu.course.blindReview': true })
  const o = c.open({ title: 'T' })
  const s = c.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x', rubric: 'r' })
  const self = c.review({ submissionId: s.submissionId, by: 'a', score: 1 })
  assert.equal(self.code, 'VMU_NOT_PERMITTED')
  assert.ok(self.enforced.indexOf('vmu.course.selfReviewAllowed') !== -1)
  const first = c.review({ submissionId: s.submissionId, by: 'b', score: 1 })
  assert.equal(first.complete, false)
  assert.equal(first.needed, 2, '必须给门槛')
  assert.equal(first.reviews, 1, '必须给当前')
  assert.equal(first.blind, true)
  const second = c.review({ submissionId: s.submissionId, by: 'c', score: 1 })
  assert.equal(second.complete, true)
  passed += 1
})

// gradeScale / passMark 越界 ⇒ 拒
test('a score outside the scale or below passMark is refused', () => {
  const c = co({ 'vmu.course.gradeScaleMax': 10, 'vmu.course.passMark': 6 })
  const o = c.open({ title: 'T' })
  const s = c.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x', rubric: 'r' })
  assert.equal(c.grade({ submissionId: s.submissionId, score: 11 }).code, 'VMU_META_VALIDATION_FAILED')
  const below = c.grade({ submissionId: s.submissionId, score: 5 })
  assert.equal(below.passed, false)
  assert.equal(below.passMark, 6)
  assert.equal(c.grade({ submissionId: s.submissionId, score: 9 }).passed, true)
  passed += 1
})

// 认证证据包缺引用 ⇒ 拒并点名
test('an accreditation evidence pack without references is refused and names them', () => {
  const c = co()
  const r = c.evidencePack({ claims: [{ claim: 'C1', refs: ['e1'] }, { claim: 'C2', refs: [] }] })
  assert.equal(r.code, 'VMU_META_VALIDATION_FAILED')
  assert.ok(r.message.indexOf('C2') !== -1, '必须点名缺引用的主张：' + r.message)
  assert.equal(c.evidencePack({ claims: [{ claim: 'C1', refs: ['e1'] }] }).ok, true)
  passed += 1
})

// 拒绝按码计数 ＋ 每条拒绝都带数组型 enforced（可空、不得 undefined）
test('refusals are counted by code and every refusal carries an array enforced', () => {
  const c = co({ 'vmu.course.cohortMax': 1, 'vmu.course.enrollmentNeedsApproval': false })
  const o = c.open({ title: 'T' })
  c.enroll({ courseId: o.courseId, who: 'a' })
  const r1 = c.enroll({ courseId: o.courseId, who: 'b' })
  const r2 = c.enroll({ courseId: o.courseId, who: 'c' })
  assert.ok(Array.isArray(r1.enforced) && Array.isArray(r2.enforced))
  assert.equal(c.refusals()['VMU_RESOURCE_BUDGET'], 2, '拒绝必须按码计数')
  const nf = c.enroll({ courseId: 'co-404', who: 'z' })
  assert.ok(Array.isArray(nf.enforced), '找错课程也必须带数组（不得 undefined）')
  const bad = c.status({ courseId: 'co-404' })
  assert.ok(Array.isArray(bad.enforced))
  passed += 1
})

// ⑤ 注入时钟 ⇒ 确定性；⑦ 只读面纯净；⑥ 零机制不崩
test('determinism (injected clock), pure read paths, and zero-config', () => {
  const zero = createCourse({ clock: () => 0 })
  const z = zero.open({ title: 'T' })
  assert.equal(z.ok, true)
  const a = JSON.stringify({ s: zero.status(), s2: zero.status({ courseId: z.courseId }), k: zero.keysUsed() })
  const b = JSON.stringify({ s: zero.status(), s2: zero.status({ courseId: z.courseId }), k: zero.keysUsed() })
  assert.equal(a, b, 'status() 不得改状态')
  const run = () => {
    const c = co({}, () => 7)
    const o = c.open({ title: 'T' })
    return JSON.stringify(c.submit({ courseId: o.courseId, who: 'a', artifact: 'lib/x', rubric: 'r' }))
  }
  assert.equal(run(), run())
  passed += 1
})

// keysUsed() ＝ 已接键，且每个都被真读；enforced 里不得出现非登记键
test('keysUsed() equals the wired set, each is really read, and enforced only lists real keys', () => {
  const o = mk({})
  const c = createCourse({ settings: o.settings, clock: () => 0 })
  const open0 = c.open({ title: 'T' })
  c.enroll({ courseId: open0.courseId, who: 'a' })
  c.align({ courseId: open0.courseId, outcomes: ['O1'], artifacts: { O1: ['x'] } })
  const s = c.submit({ courseId: open0.courseId, who: 'a', artifact: 'lib/x', rubric: 'r', late: true })
  c.review({ submissionId: s.submissionId, by: 'b', score: 1 })
  c.grade({ submissionId: s.submissionId, score: 1 })
  c.evidencePack({ claims: [{ claim: 'C', refs: ['e'] }] })
  c.status()
  const used = c.keysUsed()
  assert.equal(used.length, WIRED_COURSE_KEYS.length)
  for (const k of WIRED_COURSE_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  const notRead = used.filter((k) => o.reads.indexOf(k) === -1)
  assert.deepEqual(notRead, [], 'keysUsed 里的键必须真被读过：' + notRead.join('、'))
  for (const list of [s.enforced, c.status().partition ? [] : []]) {
    for (const k of (list || [])) assert.ok(COURSE_KEYS.indexOf(k) !== -1, 'enforced 不得出现非登记键：' + k)
  }
  passed += 1
})

// ⑤ D3（回执级口径）：每个成功回执与每个拒绝都带 enforcedScope；完整场景无重复；fired ⊆ enforced
test('D3: every receipt and every refusal carries enforcedScope, with no duplicate entries', () => {
  const c = co()
  const course = c.open({ title: 'C' })
  assert.equal(course.enforcedScope, 'evaluated-so-far')
  const enr = c.enroll({ courseId: course.courseId, who: 's1', approved: true })
  assert.equal(enr.enforcedScope, 'evaluated-so-far')
  const al = c.align({ courseId: course.courseId, outcomes: ['o1'], artifacts: { o1: ['a'] } })
  assert.equal(al.enforcedScope, 'evaluated-so-far')
  const sub = c.submit({ courseId: course.courseId, who: 's1', artifact: 'lib/x', rubric: 'r' })
  assert.equal(sub.enforcedScope, 'evaluated-so-far')
  const rev = c.review({ submissionId: sub.submissionId, by: 'p1', score: 9 })
  assert.equal(rev.enforcedScope, 'evaluated-so-far')
  const gr = c.grade({ submissionId: sub.submissionId, score: 90 })
  assert.equal(gr.enforcedScope, 'evaluated-so-far')
  const ep = c.evidencePack({ claims: [{ claim: 'c1', refs: ['r1'] }] })
  assert.equal(ep.enforcedScope, 'evaluated-so-far')
  // 该面用 `return deny(...)`（**返回**具名拒绝对象，不抛）⇒ 直接取返回值断言口径 ✓
  const refusal = c.open({})
  assert.ok(refusal && refusal.ok === false && typeof refusal.code === 'string', 'a refused call returns the named refusal value')
  assert.equal(refusal.enforcedScope, 'evaluated-so-far')
  assert.ok(Array.isArray(refusal.enforced))
  const receipts = [course, enr, al, sub, rev, gr, ep].filter((r) => Array.isArray(r.enforced))
  assert.ok(receipts.length >= 6, 'the scenario produced receipts to check')
  assert.ok(c.status({ courseId: course.courseId }).ok === true, 'the status report still answers')
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

// ROUND 122: the two keys that were read into the configuration and changed nothing now change outcomes.
// NOTE: this module RETURNS refusals rather than throwing them (see the assertion above that a refused call returns
// the named refusal value), so these cases check the returned value - `assert.throws` was my mistake, not the
// module's. The passing cases carry a `rubric` because `vmu.course.rubricRequired` defaults to true.
test('visibility=public without auditors is REFUSED by name, and the other two values are not', () => {
  const bad = co({ 'vmu.course.visibility': 'public', 'vmu.course.allowAuditors': false }).open({ title: 'T' })
  assert.ok(bad && bad.ok === false && bad.code === 'VMU_NOT_PERMITTED', 'public 且禁止旁听必须具名拒：' + JSON.stringify(bad).slice(0, 120))
  assert.ok(co({ 'vmu.course.visibility': 'institution' }).open({ title: 'T' }).ok === true, 'institution 不受该守卫影响')
  assert.ok(co({ 'vmu.course.visibility': 'public', 'vmu.course.allowAuditors': true }).open({ title: 'T' }).ok === true, 'public 且允许旁听可以通过')
  passed += 1
})

test('submitMode refuses a submission in the wrong form, by name, and admits the right one', () => {
  const a = co({ 'vmu.course.submitMode': 'artifact' })
  const oa = a.open({ title: 'T' })
  const noArt = a.submit({ courseId: oa.courseId, who: 'r-1', inline: 'text' })
  assert.ok(noArt && noArt.ok === false && noArt.code === 'VMU_META_VALIDATION_FAILED', 'artifact 形式缺产出引用必须具名拒：' + JSON.stringify(noArt).slice(0, 120))
  assert.ok(a.submit({ courseId: oa.courseId, who: 'r-1', artifact: 'lib/x', rubric: 'r' }).ok === true, '给了产出引用则通过')

  const i = co({ 'vmu.course.submitMode': 'inline' })
  const oi = i.open({ title: 'T' })
  const noInline = i.submit({ courseId: oi.courseId, who: 'r-1', artifact: 'lib/x' })
  assert.ok(noInline && noInline.ok === false && noInline.code === 'VMU_META_VALIDATION_FAILED', 'inline 形式缺正文必须具名拒')
  assert.ok(i.submit({ courseId: oi.courseId, who: 'r-1', inline: 'text', rubric: 'r' }).ok === true, '给了正文则通过')

  const b = co({ 'vmu.course.submitMode': 'both' })
  const ob = b.open({ title: 'T' })
  const onlyArt = b.submit({ courseId: ob.courseId, who: 'r-1', artifact: 'lib/x' })
  assert.ok(onlyArt && onlyArt.ok === false && onlyArt.code === 'VMU_META_VALIDATION_FAILED', 'both 形式缺正文必须具名拒')
  assert.ok(b.submit({ courseId: ob.courseId, who: 'r-1', artifact: 'lib/x', inline: 'text', rubric: 'r' }).ok === true, 'both 形式两者齐备则通过')
  passed += 1
})

// ROUND 124: the ontology version is a real migration gate - stamped when the course opens, and checked when a
// caller names a version. Naming none is allowed on purpose: the check is opt-in, so it cannot break a caller that
// never knew about versions.
test('ontologyVersion is stamped at open and a MISMATCHED enrol is refused by name', () => {
  const c = co({ 'vmu.course.ontologyVersion': '2' })
  const o = c.open({ title: 'T' })
  assert.ok(o.ok === true, 'open 通过')
  const bad = c.enroll({ courseId: o.courseId, who: 'r-1', ontologyVersion: '1' })
  assert.ok(bad && bad.ok === false && bad.code === 'VMU_CONFLICT', '版本不符必须具名拒：' + JSON.stringify(bad).slice(0, 140))
  assert.ok(c.enroll({ courseId: o.courseId, who: 'r-2', ontologyVersion: '2' }).ok === true, '版本相符则通过')
  assert.ok(c.enroll({ courseId: o.courseId, who: 'r-3' }).ok === true, '不声明版本则不受检查（opt-in）')
  const d = co({ 'vmu.course.ontologyVersion': '9' })
  const o2 = d.open({ title: 'T' })
  assert.ok(d.enroll({ courseId: o2.courseId, who: 'r-1', ontologyVersion: '2' }).ok === false, '另一个版本号同样被拒（不是硬编码 1）')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU COURSE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
