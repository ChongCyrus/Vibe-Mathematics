// RUN 212 — run 49 / FEEDBACK48: three facts that existed one layer below the receipt, and two sentences that
// contradicted the code that produced them.
//
// 1.1  the kernel has computed `agreed` and `anyAsserted` since RUN 211 and says which case a ruling is in (`note`),
//      but the pack's `tally` object is a WHITELIST — so two members who both estimated 0.6 were readable only as prose.
// 1.2  a complete card whose own pointer does not resolve is NOT locked (rule L14 is deferred), yet `lockNote` said
//      "the pointer cannot be corrected afterwards" beside `proofLockDeferredMeans` saying "correct it freely".
// 1.3  the consult prediction was printed only by advances that MOVED, so the one stage where the question matters
//      (awaiting-editor) could not be asked; `final` printed the same fact under a different name.
// 2.1  the hire description claimed the FIRST hire answers `institutionIgnored:true`; it is `has(args.institution)`.
// 2.2  the notice said "参与辩论的 N 名成员给出的最终裁决" even when the chair had TYPED every number.
// 2.3  the run-49 material taught `advance(to:"writing")`; the face does not declare `to`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs' // fs-purpose: guard — the tests below materialise real proof files and read the sources they pin
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const PAPER_KIT = read('vibe-math-vmu/kit/paper.js')
const VERDICT = read('vibe-math-vmu/kernel/meetingverdict.js')

// The aggregator is a PURE calculator, so the sentence it renders is read directly instead of through a mailbox.
const { aggregateVerdicts, rulePropositionProbability, DEFAULT_RULING_TEMPLATE } = await import(
  pathToFileURL(join(ROOT, 'vibe-math-vmu', 'kernel', 'meetingverdict.js')).href)

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run212-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464777000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle, specs }
}
const blockOf = (r, key) => (r && r[key]) || r

test('RUN 212 §0 — the repairs live on the source they belong to (pins)', () => {
  // 1.1 — the two facts are printed, not just computed
  has(PACK, 'agreed: ruled.agreed === true,', '§0a ★★★ `agreed` survives the whitelist')
  has(PACK, 'anyAsserted: ruled.anyAsserted === true,', '§0b ★★ and so does `anyAsserted`')
  has(PACK, 'note: ruled.note === undefined || ruled.note === null ? null : str(ruled.note),', '§0c ★★ and the kernel\'s own sentence')
  has(PACK, 'agreeMeans:', '§0d ★ the receipt says what the two booleans mean')
  // 1.2 — the lock note follows the same fact the lock does
  has(PACK, 'this card is NOT locked', '§0e ★★★ a deferred lock is not described as locked')
  has(PACK, 'the rule-L14 lock is DEFERRED', '§0f ★ and says the pointer is still correctable')
  has(PACK, 'pointerCheck !== null && pointerCheck.resolved !== true', '§0g ★★★ the note reads the SAME fact the lock reads')
  // 1.3 — the prediction travels with the state, not with the move
  has(PAPER_KIT, "...consultPrediction(state),\n      stageMovedMeans:", '§0h ★★★ a non-moving advance still predicts the consult gate')
  has(PAPER_KIT, 'officeConsultPending: false,', '§0i ★★ `final` prints the same name the advance prints')
  has(PAPER_KIT, 'officeConsultPendingMeans:', '§0j ★ and says the name is aliased on purpose')
  // 2.1 — the description matches `has(args.institution)`
  has(PACK, 'institutionIgnored:false, not true', '§0k ★★★ the hint stops claiming the first hire answers true')
  has(PACK, 'a caller that sends nothing gets `institutionIgnored:false`', '§0l ★ and the description says the same')
  // 2.2 — the notice stops claiming a debate, and carries provenance when the caller knows it
  has(VERDICT, 'provenance = null', '§0m ★★ the ruling accepts the provenance of its numbers')
  has(VERDICT, '不是辩论记录', '§0n ★★★ the notice says when numbers were transcribed, not filed')
  has(VERDICT, 'provenance !== null && provenance !== undefined && (Number(provenance.typed) || 0) > 0', '§0o ★ and appends it only when the caller states it')
  has(PACK, 'const provenance = {', '§0p ★★ the pack reads filed-vs-typed rows into the notice')
  ok(!DEFAULT_RULING_TEMPLATE.unanimous.includes('参与辩论的'), '§0q ★★★ the default sentence no longer claims a debate', DEFAULT_RULING_TEMPLATE.unanimous)
  ok(!DEFAULT_RULING_TEMPLATE.mean.includes('参与辩论的'), '§0r ★ and neither does the mean template', DEFAULT_RULING_TEMPLATE.mean)
  // 2.3 — the vocabulary says the stage machine decides
  has(PACK, '`advance` 不接受 `to`', '§0s ★★ the paper description says what the run-49 material got wrong')
})

test('RUN 212 §1 — the notice can say that the numbers were TYPED, not filed', () => {
  const typed = rulePropositionProbability({
    verdicts: [
      { member: 'r-1', p: 0.6, reason: '归纳法估计' },
      { member: 'r-2', p: 0.6, reason: '按可证幅度估计' },
    ],
    propositionId: 'rec-21', owner: 'r-1', provenance: { submitted: 0, typed: 2 },
  })
  ok(typed.ok === true, '§1a premise: the ruling is assembled', typed)
  has(typed.notice.text, '主席代为记录', '§1b ★★★ the notice names who really wrote the numbers')
  has(typed.notice.text, '不是辩论记录', '§1c ★★ and refuses the word "debate" for them')
  ok(typed.notice.provenance && typed.notice.provenance.typed === 2 && typed.notice.provenance.submitted === 0,
    '§1d ★★ the provenance travels as fields, not only as a sentence', typed.notice.provenance)
  ok(!String(typed.notice.text).includes('参与辩论的'), '§1e ★★★ the sentence never claims a debate happened', typed.notice.text)

  const filed = rulePropositionProbability({
    verdicts: [
      { member: 'r-1', p: 1, reason: '归纳法' },
      { member: 'r-2', p: 1, reason: '逐项核验' },
    ],
    propositionId: 'rec-3', owner: 'r-1', provenance: { submitted: 2, typed: 0 },
  })
  ok(filed.ok === true, '§1f premise: a filed ruling is assembled', filed)
  ok(!String(filed.notice.text).includes('主席代为记录'), '§1g ★★ filed numbers carry no transcription clause', filed.notice.text)
  ok(filed.notice.provenance && filed.notice.provenance.submitted === 2, '§1h ★ and still report their provenance', filed.notice.provenance)
})

test('RUN 212 §2 — the ruling receipt prints agreement, assertion and the sentence that names the case', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 212 的聚合读数', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '形如 n²+1 的素数有无穷多个', value: '未定论（估计值）', motive: '估计阶段', p: 0.5, member: 'r-1',
    })
    ok(card.ok === true, 'premise: card', card)
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就估计值交换意见', title: 'm-est' })).ok === true, 'premise: meeting')
    ok((await call('vibe_vmu_meeting', { action: 'attend', id: 'm1', member: 'r-acad' })).ok === true, 'premise: attend')

    const fin = await call('vibe_v5_verdict_final', {
      meeting: 'm1', member: 'r-acad', proposition_id: String(card.recordId),
      verdicts: [
        { member: 'r-1', p: 0.6, reason: '归纳法估计' },
        { member: 'r-2', p: 0.6, reason: '按可证幅度估计' },
      ],
    })
    ok(fin.ok === true, '§2a premise: the chair-typed ruling is accepted', fin)
    ok(fin.tally && fin.tally.agreed === true, '§2b ★★★ the two 0.6s are readable as AGREEMENT from a field', fin.tally)
    ok(fin.tally.anyAsserted === true, '§2c ★★ and that one of them did name that value', fin.tally)
    has(fin.tally.note, 'the numbers agree', '§2d ★★ the kernel\'s sentence survives to the receipt')
    ok(fin.agreed === true, '§2e ★★★ the same fact is at the top level, where a scanner looks first', fin.agreed)
    ok(fin.anyAsserted === true, '§2f ★ and `anyAsserted` with it', fin.anyAsserted)
    ok(String(fin.agreeMeans).includes('Both are false only when the members really differed'),
      '§2g ★ the booleans are explained (true agreement vs a real difference)', fin.agreeMeans)
    ok(String(fin.agreeMeans).includes('every member gave the SAME number'), '§2h ★★ the explanation names the agreement rule', fin.agreeMeans)
    ok(fin.decided === false, '§2i ★ the ruling is still an ESTIMATE (0.6 is not 0/1)', fin.decided)
  } finally { /* hygiene */ }
})

test('RUN 212 §3 — a deferred lock is not described as a lock that cannot be corrected', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 212 的锁门说明', researcherCount: 2 })).ok === true, 'premise: founded')
    const w = blockOf(await call('vibe_v5_record_proposition', {
      statement: '前 n 个偶数之和等于 n(n+1)', value: '对 n≥1 成立', motive: '初等结论', p: 0.7, member: 'r-1',
      proof_ref: 'Members/r-1/Propos/missing-212.md', proof_state: 'complete',
    }), 'proposition')
    ok(w.ok === true, '§3a premise: the card is written', w)
    const ev = w.proofStateEvidence || {}
    // the deferral flag is printed on the CARD receipt (top level); the note that explains it rides in proofStateEvidence
    ok(w.proofLockDeferred === true, '§3b premise: the lock is deferred (the pointer does not resolve)', w.proofLockDeferred)
    has(ev.lockNote, 'this card is NOT locked', '§3c ★★★ the lock note follows the DEFERRED fact')
    has(ev.lockNote, 'DEFERRED', '§3d ★ and names it')
    has(ev.lockNote, 'correct the pointer freely', '§3e ★★ the reader is told the pointer can still be corrected')
    ok(!String(ev.lockNote).includes('cannot be corrected afterwards'),
      '§3f ★★★ the contradictory sentence is gone from the deferred case', ev.lockNote)

    // write the file the pointer names, then re-register: the lock becomes real and the note must say so
    const abs = join(handle.kernel.library.root, 'Members/r-1/Propos/missing-212.md')
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '# 证明\n\n2+4+…+2n = n(n+1) 归纳法。\n', 'utf8')
    const again = blockOf(await call('vibe_v5_record_proposition', {
      id: String(w.recordId), statement: '前 n 个偶数之和等于 n(n+1)', value: '对 n≥1 成立',
      motive: '补上证明文件后重登记', p: 0.8, member: 'r-1',
      proof_ref: 'Members/r-1/Propos/missing-212.md', proof_state: 'complete',
    }), 'proposition')
    ok(again.ok === true, '§3g premise: the card is re-registered', again)
    const ev2 = again.proofStateEvidence || {}
    ok(again.proofLockDeferred === undefined || again.proofLockDeferred === false,
      '§3h ★★ this time the lock is NOT deferred (the pointer resolves)', again.proofLockDeferred)
    has(ev2.lockNote, 'is LOCKED', '§3i ★★★ and the note says the lock is real')
  } finally { /* hygiene */ }
})

test('RUN 212 §4 — the consult prediction is readable on a paper that is NOT moving, and at final', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 212 的定稿闸读数', researcherCount: 2 })).ok === true, 'premise: founded')
    ok((await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'off', why: 'RUN 212 §4 要读 awaiting-editor 上的预测，不必真开闸' })).ok === true, 'premise: gate off')
    // ★ a paper's parts are indexed by EVIDENCE rows: the evidence/引用 gate refuses a part with none (run 34+), so the
    //   proof of this run's own claim is written first and cited by record id — the file card is NOT a record row.
    const card = await call('vibe_v5_record_proposition', {
      statement: '前 n 个偶数之和等于 n(n+1)', value: '对 n≥1 成立', motive: 'RUN 212 §4 的论文证据', p: 0.9, member: 'r-1',
    })
    ok(card.ok === true, 'premise: evidence card', card)
    const ev = [String(card.recordId)]
    ok((await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'paper-212' })).ok === true, 'premise: paper')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-212', member: 'r-1', part: '第一节', body: '归纳法：前 n 个偶数之和等于 n(n+1)。', evidence: ev })).ok === true, 'premise: r-1 part')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-212', member: 'r-2', part: '第二节', body: '逐项核验：n=1..5 成立。', evidence: ev })).ok === true, 'premise: r-2 part')
    ok(blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-212' }), 'advance').moved === true, 'premise: writing → reviewing')
    ok((await call('vibe_v5_paper', { action: 'review', target: 'paper-212', member: 'r-1', of: 'r-2', deliverable: true })).ok === true, 'premise: r-1 review')
    ok((await call('vibe_v5_paper', { action: 'review', target: 'paper-212', member: 'r-2', of: 'r-1', deliverable: true })).ok === true, 'premise: r-2 review')
    const toEditor = blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-212' }), 'advance')
    ok(toEditor.to === 'awaiting-editor', 'premise: the paper is awaiting the editor', toEditor.to)
    ok(toEditor.officeConsultPending === false, '§4a ★ premise: the moving advance predicts the gate', toEditor.officeConsultPending)

    const still = blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-212' }), 'advance')
    ok(still.moved === false, '§4b premise: this advance does NOT move the stage', still)
    ok(still.officeConsultPending === false, '§4c ★★★ the non-moving advance still answers the consult question', still.officeConsultPending)
    has(still.officeConsultMeans, 'finalization will NOT wait', '§4d ★★ and says which way the gate went')

    const fin = blockOf(await call('vibe_v5_paper', { action: 'final', target: 'paper-212', member: 'r-acad', decision: 'deliverable', conclusion: '偶数之和公式已证明' }), 'final')
    ok(fin.ok === true, '§4e premise: the paper finalises', fin)
    ok(fin.officeConsultPending === false, '§4f ★★★ `final` prints the SAME name (it used to be only consult.armed)', fin.officeConsultPending)
    has(fin.officeConsultPendingMeans, 'BY CONSTRUCTION', '§4g ★ and says why it is false here')
    ok(fin.consult && fin.consult.armed === false, '§4h ★ the authoritative reading is still there', fin.consult)
  } finally { /* hygiene */ }
})

test('RUN 212 §5 — the hire receipt and its description agree about `institutionIgnored`', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 212 的 institution 措辞', researcherCount: 2 })).ok === true, 'premise: founded')
    const plain = await call('vibe_v5_hire', { purpose: '复验措辞', initial_task: '读一遍提示词', to: 'r-temp' })
    ok(plain.ok === true, '§5a premise: the first hire succeeds', plain)
    ok(plain.institutionIgnored === false, '§5b ★★★ no institution was sent, so nothing was ignored', plain.institutionIgnored)
    ok(plain.institution === null, '§5c ★ and the field is null, not empty text', plain.institution)

    const withInst = await call('vibe_v5_hire', {
      purpose: '复验措辞', initial_task: '读一遍提示词', to: 'r-temp2', institution: '本所', slot: 'temp',
    })
    ok(withInst.ok === true, '§5d premise: a hire carrying institution is accepted on this face', withInst)
    ok(withInst.institutionIgnored === true, '§5e ★★ sending it is what makes it ignored', withInst.institutionIgnored)
    has(withInst.institutionMeans, 'accepted and NOT used', '§5f ★ and the receipt says so')
  } finally { /* hygiene */ }
})
