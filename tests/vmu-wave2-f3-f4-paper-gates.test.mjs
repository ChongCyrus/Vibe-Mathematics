#!/usr/bin/env node
// WAVE 2 — F3 / F4: the paper's 互审 rule and its DELIVERY gate, on the assembled pack (`packs/v5r/paper.js`).
//
// F3 (measured): a single member could review their own section and hand the paper to the editor as "unanimously
// cross-reviewed", because with one participant the rotation pointed at that participant. The repair is two named
// refusals: a review of one's own part is refused when it is RECORDED, and a finalisation refuses while fewer than TWO
// DISTINCT non-self reviewers are on record — the refusal says how many are required.
//
// F4 (measured): the quality gate hung on `render` only, so `recordFinal` finalised a paper that `render` itself refused
// with `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`. The finalising path must go through the SAME gate, refuse with the
// SAME code, and name the requirement and the offending section (the part's member).
//
// RULE E: the fixtures are non-empty (two participants / two distinct reviewers) and every "refused" assertion is paired
// with a happy path, so this suite cannot be green because everything refuses.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PAPER_PACK = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const thrown = async (fn) => {
  try { const out = await fn(); return { code: null, out } } catch (e) {
    return { code: e && e.code, message: String((e && e.message) || e), hint: e && e.hint, error: e }
  }
}

const entry = await import(pathToFileURL(ENTRY).href)
const { createPaperSubsystem } = await import(pathToFileURL(PAPER_PACK).href)

const state = { specs: [] }
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
}
const root = await mkdtemp(join(tmpdir(), 'vmu-wave2-f3f4-'))
// The office consult is a SEPARATE gate (E4); it is off here so this file measures the quality/cross-review gates only,
// and the happy paths cannot pass by accident through a gate that never ran.
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, 'vmu.paper.officeConsult': 'off' })
await handle.ready()
const kernel = handle.kernel
for (const [id, slot] of [['r-chair', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kernel.members.hire({ id, slot })
const paper = createPaperSubsystem({ kernel, clock: () => 1000 })

/** Walk the state machine forward until the paper is awaiting its editor (the round cap is a legitimate route). */
const toAwaitingEditor = async (target, { onReviewing = null } = {}) => {
  for (let i = 0; i < 12; i += 1) {
    const st = paper.state(target).state
    if (st.status === 'awaiting-editor') return st
    if (st.status === 'reviewing' && typeof onReviewing === 'function') await onReviewing(st)
    await paper.advance({ target })
  }
  return paper.state(target).state
}

// ── §1 F3 — a member cannot review their own section ──────────────────────────────────────────────────────────────
console.log('§1 F3 — self-review is refused BY NAME (the author is not a second pair of eyes)')
{
  const T = 'self-review'
  await paper.start({ target: T, participants: ['r-1', 'r-2'] })
  await paper.recordPart({ target: T, member: 'r-1', title: '上界', solution: '归纳法证明上界。', evidence: ['r-1 的命题卡'] })
  await paper.recordPart({ target: T, member: 'r-2', title: '下界', solution: '构造反例。', evidence: ['r-2 的命题卡'] })
  await paper.advance({ target: T })
  const self = await thrown(() => paper.recordReview({ target: T, member: 'r-1', of: 'r-1', deliverable: true }))
  ok(self.code === 'VMU_INVALID_ARGUMENT', 'the code is VMU_INVALID_ARGUMENT', self)
  ok(/互审必须由另一位成员完成/.test(self.message) && /不能评审自己写的部分/.test(self.message),
    'the message names the rule and says the part cannot be reviewed by its author', self.message)
  ok(/r-1/.test(self.message) && /another|另一位/.test(self.message + ' ' + String(self.hint)),
    'the refusal names the member and points at another reviewer', { message: self.message, hint: self.hint })
  const legal = await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
  ok(legal.ok === true && legal.of === 'r-2', 'the SAME member may review the OTHER part (the rule is about the author, not the member)', legal)
}

// ── §2 F3 — a one-participant paper cannot be finalised as "cross-reviewed" ───────────────────────────────────────
console.log('§2 F3 — a single participant reaches the editor through the round cap, and finalise still refuses')
{
  const T = 'single-member'
  await paper.start({ target: T, participants: ['r-1'] })
  await paper.recordPart({ target: T, member: 'r-1', title: '唯一的正文', solution: '一个人写的。', evidence: ['r-1 的命题卡'] })
  const st = await toAwaitingEditor(T)
  ok(st.status === 'awaiting-editor', 'the flow really reaches awaiting-editor (the cap route, not a skipped stage)', st.status)
  ok(st.forcedAfterCap === true, 'the receipt marks the forced path (capped:true is not hidden)', st.forcedAfterCap)
  const fin = await thrown(() => paper.recordFinal({ target: T, member: 'r-chair', decision: 'deliverable', note: '定稿' }))
  ok(fin.code === 'VMU_INVALID_ARGUMENT', 'finalise is refused with VMU_INVALID_ARGUMENT', fin)
  ok(/一位参与者的论文无法通过互审/.test(fin.message) && /自审/.test(fin.message),
    'the message names the one-participant self-review hole', fin.message)
  ok(fin.error && fin.error.required === 2, 'the refusal carries required:2 (how many distinct reviewers are required)',
    fin.error && fin.error.required)
  ok(fin.error && Array.isArray(fin.error.participants) && fin.error.participants.length === 1,
    'the refusal carries the participant list it judged', fin.error && fin.error.participants)
}

// ── §3 F3 — one recorded reviewer is not two: finalise says how many it needs ─────────────────────────────────────
console.log('§3 F3 — a paper with only ONE distinct cross-reviewer is refused at finalise, with the required count')
{
  const T = 'one-reviewer'
  await paper.start({ target: T, participants: ['r-1', 'r-2'] })
  await paper.recordPart({ target: T, member: 'r-1', title: 'p1', solution: '正文一。', evidence: ['r-1 的命题卡'] })
  await paper.recordPart({ target: T, member: 'r-2', title: 'p2', solution: '正文二。', evidence: ['r-2 的命题卡'] })
  await paper.advance({ target: T })
  await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
  await paper.recordReview({ target: T, member: 'r-2', of: 'r-1', deliverable: false, comments: '还缺一步' })
  // Walk to the cap; in the LAST reviewing round only r-1 files a deliverable review, so exactly ONE distinct
  // cross-reviewer is on record when the editor is asked to finalise.
  const st = await toAwaitingEditor(T, {
    onReviewing: async (inner) => {
      if (inner.round === 3) await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
    },
  })
  ok(st.status === 'awaiting-editor', 'the paper is awaiting its editor', st.status)
  const recorded = Object.keys(st.reviews || {})
  ok(recorded.length === 1 && recorded[0] === 'r-1', 'exactly ONE reviewer is on record (the fixture is the defect)', recorded)
  const fin = await thrown(() => paper.recordFinal({ target: T, member: 'r-chair', decision: 'deliverable' }))
  ok(fin.code === 'VMU_INVALID_ARGUMENT', 'finalise is refused with VMU_INVALID_ARGUMENT', fin)
  ok(/互审必须由两位不同的/.test(fin.message) && /只有 1 位审了别人的部分/.test(fin.message),
    'the message says how many distinct reviewers reviewed somebody else, and that two are required', fin.message)
  ok(fin.error && fin.error.required === 2 && String(fin.error.where) === 'final',
    'the refusal carries {where:"final", required:2}', fin.error && { where: fin.error.where, required: fin.error.required })
  ok(fin.error && JSON.stringify(fin.error.crossReviewers) === '["r-1"]',
    'the refusal names the reviewer it counted', fin.error && fin.error.crossReviewers)
}

// ── §4 F3 — the happy path: two DISTINCT reviewers, then the chair finalises ──────────────────────────────────────
console.log('§4 F3 — two distinct cross-reviewers: the paper advances and the chair really finalises')
{
  const T = 'two-reviewers'
  await paper.start({ target: T, participants: ['r-1', 'r-2'] })
  await paper.recordPart({ target: T, member: 'r-1', title: '上界', solution: '归纳法。', evidence: ['r-1 的命题卡'] })
  await paper.recordPart({ target: T, member: 'r-2', title: '下界', solution: '反例。', evidence: ['r-2 的命题卡'] })
  await paper.advance({ target: T })
  await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
  await paper.recordReview({ target: T, member: 'r-2', of: 'r-1', deliverable: true })
  const adv = await paper.advance({ target: T })
  ok(adv.ok === true && adv.to === 'awaiting-editor' && adv.unanimous === true,
    'advance: two distinct cross-reviews make the paper awaiting-editor', adv)
  const fin = await paper.recordFinal({ target: T, member: 'r-chair', decision: 'deliverable', note: '互审一致', conclusion: '两边都成立' })
  ok(fin && fin.ok === true && fin.finalized === true, 'the chair finalises a paper that really passed 互审', fin && { finalized: fin.finalized })
  ok(fin && fin.hasOwnProperty('missing') && Array.isArray(fin.missing) && fin.missing.includes('pdf'),
    'the receipt still reports the missing pdf (finalise does not claim a complete paper)', fin && fin.missing)
}

// ── §5 F4 — the delivery gate: a section with a body and NO evidence cannot be finalised ──────────────────────────
console.log('§5 F4 — finalise refuses with the SAME code the render gate uses, naming the requirement and the section')
{
  const T = 'no-evidence'
  await paper.start({ target: T, participants: ['r-1', 'r-2'] })
  await paper.recordPart({ target: T, member: 'r-1', title: '有正文没有证据的一节', solution: '这一节只有正文。' })
  await paper.recordPart({ target: T, member: 'r-2', title: '有证据的一节', solution: '这一节有证据。', evidence: ['r-2 的命题卡'] })
  const st = await toAwaitingEditor(T, {
    onReviewing: async () => {
      const cur = paper.state(T).state
      if (!cur.reviews || Object.keys(cur.reviews).length === 0) {
        await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
        await paper.recordReview({ target: T, member: 'r-2', of: 'r-1', deliverable: true })
      }
    },
  })
  ok(st.status === 'awaiting-editor', 'the paper is awaiting its editor', st.status)
  const render = await thrown(() => paper.render({ target: T }))
  ok(render.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', 'render refuses with VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', render)
  ok(/论文有 1 个部分没有任何证据条目/.test(render.message) && /r-1/.test(render.message),
    'the render refusal names the requirement (per-part evidence) and the empty section (r-1)', render.message)
  ok(/证据/.test(String(render.message)) && /证据/.test(String(render.hint)),
    'the refusal says WHICH requirement is missing (证据) in both the message and the hint', render.hint)

  // Count the consultations: the finalising path must reach the gate EXACTLY ONCE. Zero would be the old defect (the
  // kit's lexical render); two would be a second copy of the check that can drift from the first.
  const realGate = paper.qualityGate
  let gateCalls = 0
  paper.qualityGate = (args) => { gateCalls += 1; return realGate(args) }
  const fin = await thrown(() => paper.recordFinal({ target: T, member: 'r-chair', decision: 'deliverable', note: '定稿' }))
  paper.qualityGate = realGate
  ok(fin.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', 'finalise refuses with the SAME code as render', fin)
  ok(gateCalls === 1, 'the gate is consulted exactly ONCE on the finalising path (not zero: bypassed; not two: duplicated)', gateCalls)
  ok(paper.state(T).state.status === 'awaiting-editor',
    'the refused finalisation wrote NOTHING: the paper is still awaiting its editor, not durably finalized',
    paper.state(T).state.status)
  ok(fin.message === render.message, 'the finalise refusal is the SAME sentence as the render refusal (one gate, not two copies)',
    { final: fin.message, render: render.message })
  ok(fin.hint === render.hint, 'and the same hint (the repair is the same on both paths)', fin.hint)
  ok(fin.error && JSON.stringify(fin.error.emptyParts) === '["r-1"]',
    'the thrown refusal carries the machine-readable empty part list', fin.error && fin.error.emptyParts)
  const arts = paper.PaperArtifacts({ target: T })
  ok(arts.present && arts.present.md === false, 'the refused finalisation produced NO md artefact (the gate runs before the delegate)', arts.present)
}

// ── §6 F4 — the same paper WITH evidence finalises (the gate refuses the defect, not the feature) ─────────────────
console.log('§6 F4 — with evidence on every part the same flow finalises')
{
  const T = 'with-evidence'
  await paper.start({ target: T, participants: ['r-1', 'r-2'] })
  await paper.recordPart({ target: T, member: 'r-1', title: '上界', solution: '归纳法。', evidence: ['r-1 的命题卡'] })
  await paper.recordPart({ target: T, member: 'r-2', title: '下界', solution: '反例。', evidence: ['r-2 的命题卡'] })
  await paper.advance({ target: T })
  await paper.recordReview({ target: T, member: 'r-1', of: 'r-2', deliverable: true })
  await paper.recordReview({ target: T, member: 'r-2', of: 'r-1', deliverable: true })
  await paper.advance({ target: T })
  const fin = await thrown(() => paper.recordFinal({ target: T, member: 'r-chair', decision: 'deliverable', note: '定稿', conclusion: '结论' }))
  ok(fin.code === null && fin.out && fin.out.finalized === true, 'the paper with evidence on every part finalises', fin)
  ok(fin.out && fin.out.consult && fin.out.consult.satisfiedBy === 'policy:off',
    'the receipt says the consult gate was OFF (it does not claim the office was asked)', fin.out && fin.out.consult)
}

// ── §7 F3 through the TOOL FACE — the refusal must survive the receipt, not only the subsystem ────────────────────
console.log('§7 F3 — `vibe_v5_paper {action:"review"}` refuses the self-review BY NAME on the receipt too')
{
  const spec = state.specs.find((s) => s && s.name === 'vibe_v5_paper')
  ok(Boolean(spec), 'the pack declares the vibe_v5_paper tool', state.specs.map((s) => s && s.name))
  const call = async (args) => JSON.parse(await spec.execute(args, {}))
  const T = 'tool-face'
  const began = await call({ action: 'start', target: T, participants: ['r-1', 'r-2'] })
  ok(began.ok === true && began.started && began.started.status === 'writing', 'the tool starts a two-participant paper', began && began.started)
  await call({ action: 'advance', target: T })
  const self = await call({ action: 'review', target: T, member: 'r-1', of: 'r-1', deliverable: true })
  ok(self.ok === false && self.code === 'VMU_INVALID_ARGUMENT', 'the RECEIPT carries ok:false + VMU_INVALID_ARGUMENT', self)
  ok(/互审必须由另一位成员完成/.test(String(self.message)) && /不能评审自己写的部分/.test(String(self.message)),
    'the receipt message names the rule and the author-as-reviewer', self.message)
  ok(self.member === 'r-1' && self.of === 'r-1',
    'the receipt names the member and the part that were refused (machine-readable, not prose only)', { member: self.member, of: self.of })
  const legal = await call({ action: 'review', target: T, member: 'r-1', of: 'r-2', deliverable: true })
  ok(legal.ok === true && legal.review && legal.review.of === 'r-2',
    'the same tool accepts the review of the OTHER part', legal && legal.review)
}

await rm(root, { recursive: true, force: true, maxRetries: 10 })
console.log('=== VMU WAVE2 F3/F4 (paper gates): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
console.log('ALL GREEN — tests/vmu-wave2-f3-f4-paper-gates.test.mjs (' + passed + ' checks)')
