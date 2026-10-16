// tests/vmu-reviewers.test.mjs — the reviewer market (volume 16 §L297-§L305).
//
// ROUND 279. The volume states the schema, three field-level rules and the defaults; each rule is pinned to the key that declares it.
import { createReviewers } from '../vibe-math-vmu/kernel/reviewers.js'

let pass = 0
let fail = 0
const ok = (cond, label, detail) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' -- ' + JSON.stringify(detail))) } }
// ★ P2-01（Round 10）：内核【不再替你选】评审方式。未声明时 config 的 mode 是 `null`，而真正需要它的 assign()
// 会【具名拒绝】`VMU_REVIEW_MODE_UNDECLARED` —— 因为"单盲"是一种机构选择，不该由内核从沉默里替人选出来。
// v5r 在自己的 pack 里声明它（`packs/v5r/settings/defaults.json` 的 `"vmu.review.mode": "single-blind"`），
// 所以下面这个构造器【显式声明】它：这正是真实部署经 pack 折叠拿到的形状。
const mk = (settings = {}) => createReviewers({ clock: () => 1000, settings: { 'vmu.review.mode': 'single-blind', ...settings } })
const INV = { taxIdRef: 'x' }
void INV

// zero mechanism ── ★ 以及本轮新增的"未声明"真相：静默不得代表某个机构的选择
{
  const bare = createReviewers({ clock: () => 1000, settings: {} })
  ok(bare.status().config.mode === '',
    '★ 未声明 vmu.review.mode 时 config.mode 是中性空串（不再静默回落成 single-blind）', bare.status().config)
  bare.register({ id: 'r1' })
  const refused = bare.assign({ reviewerId: 'r1', submissionId: 's1' })
  // ★ 本模块的惯例是【具名的 code 回执】（见上面 VMU_COI_VIOLATION 那条），不是抛异常 ⇒ 断言 code 即可。
  ok(refused && refused.code === 'VMU_REVIEW_MODE_UNDECLARED',
    '★ 并且真要它干活时【具名拒绝】，而不是替机构挑一种评审方式', refused)
}

// zero mechanism
{
  const z = mk({})
  const s = z.status()
  ok(s.ok === true && s.zeroMechanism === true && s.reviewers === 0 && s.assignments === 0, 'zero-mechanism: an empty market reports itself as empty', s)
  ok(s.config.mode === 'single-blind' && s.config.conflictPolicy === 'recuse' && s.config.maxLoad === 3, 'the defaults are the volume defaults', s.config)
  ok(s.config.coiPolicy === 'deny' && s.config.blindUnbindRequiresReason === true && s.config.quorum === 0, 'and the rest of them too')
  ok(z.status().keysUsed.length === 0, 'nothing is read before anything is asked of it')
}

// rule 1: a declared conflict with the subject must recuse
{
  const f = mk({})
  f.register({ id: 'r1', expertise: ['stats'] })
  f.register({ id: 'r2', conflicts: ['sub-9'] })
  ok(f.assign({ reviewerId: 'r1', submissionId: 'sub-1' }).ok === true, 'an unconflicted reviewer is assigned')
  ok(f.assign({ reviewerId: 'r2', submissionId: 'sub-9' }).code === 'VMU_COI_VIOLATION', 'a declared conflict with the SUBJECT is refused by name')
  ok(f.assign({ reviewerId: 'r2', submissionId: 'sub-1' }).ok === true, 'the same reviewer on another subject is fine')
  ok(f.assign({ reviewerId: 'nobody', submissionId: 'sub-1' }).code === 'VMU_INVALID_ARGUMENT', 'an unregistered reviewer is refused')
  ok(f.assign({ reviewerId: 'r1' }).code === 'VMU_INVALID_ARGUMENT', 'an assignment without a submission is refused')
}

// rule 3: the concurrent cap
{
  const g = mk({ 'vmu.reviewers.maxLoad': 1 })
  g.register({ id: 'r' })
  ok(g.assign({ reviewerId: 'r', submissionId: 's1' }).ok === true, 'the first assignment is within the cap')
  const over = g.assign({ reviewerId: 'r', submissionId: 's2' })
  ok(over.code === 'VMU_REVIEWER_OVERLOADED' && over.cap === 1, 'a reviewer at the cap is refused by name, with the cap reported', over)
  const wide = mk({ 'vmu.reviewers.maxLoad': 5 })
  wide.register({ id: 'r' })
  wide.assign({ reviewerId: 'r', submissionId: 's1' })
  ok(wide.assign({ reviewerId: 'r', submissionId: 's2' }).ok === true, 'the cap is a declaration, not a constant')
}

// rule 2: the mode is recorded, and unbinding the blind is traced
{
  const f = mk({})
  f.register({ id: 'r' })
  const a = f.assign({ reviewerId: 'r', submissionId: 's1' })
  ok(a.mode === 'single-blind' && a.blind === true, 'the assignment records the mode it was made under')
  ok(f.unbind({ assignmentId: a.id }).code === 'VMU_BLIND_UNBIND_DENIED', 'unbinding a blind assignment without a reason is refused')
  const done = f.unbind({ assignmentId: a.id, reason: 'author requested', by: 'chair' })
  ok(done.ok === true && done.unbindReason === 'author requested' && done.unboundBy === 'chair', 'with a reason it succeeds and records WHO', done)
  ok(f.status().blindTraced === true, 'the face states that every blind unbinding carries its reason')
  const rows = f.trace()
  ok(rows.some((r) => r.type === 'reviewers/unbound' && r.wasBlind === true && r.reason !== null), 'the trace names the blind unbinding and its reason', rows)
  const open = mk({ 'vmu.review.mode': 'open' })
  open.register({ id: 'r' })
  const oa = open.assign({ reviewerId: 'r', submissionId: 's1' })
  ok(oa.blind === false && open.unbind({ assignmentId: oa.id }).ok === true, 'mode=open blinds nothing, so no reason is demanded')
}

// quorum
{
  const q = mk({ 'vmu.review.quorum': 2 })
  ok(q.quorumMet({ submissionId: 's1', completed: 1 }).met === false, 'one completed review is short of a quorum of two')
  ok(q.quorumMet({ submissionId: 's1', completed: 2 }).met === true, 'two meet it')
  ok(mk({}).quorumMet({ submissionId: 's1', completed: 0 }).met === true, 'the zero default demands no quorum')
}

// every declaration is accounted for as read
{
  const f = mk({})
  f.register({ id: 'r', conflicts: ['x'] })
  f.assign({ reviewerId: 'r', submissionId: 's1' })
  f.unbind({ assignmentId: 'ra-1', reason: 'r' })
  f.quorumMet({ submissionId: 's1', completed: 1 })
  // the optional register: with the declaration off it is refused, so declare it on to exercise the read
  ok(f.acknowledge({ reviewerId: 'r' }).code === 'VMU_NOT_PERMITTED', 'acknowledgement[off]: the optional register refuses by name')
  const on = mk({ 'vmu.reviewers.acknowledgement': true })
  on.register({ id: 'r2' })
  ok(on.acknowledge({ reviewerId: 'r2', kind: 'remuneration' }).ok === true, 'acknowledgement[on]: the register accepts an entry')
  ok(mk({ 'vmu.reviewers.acknowledgement': true }).acknowledge({}).code === 'VMU_INVALID_ARGUMENT', 'an acknowledgement without a reviewer is refused')
  // span BOTH faces: `f` exercised the first six declarations and `on` the acknowledgement
  const used = [...new Set([...f.status().keysUsed, ...on.status().keysUsed])].sort()
  ok(used.length === 7, 'all seven declarations are accounted for as read', used)
}

console.log('=== VMU REVIEWERS: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail > 0) process.exit(1)
