// RUN 211 — run 48 / FEEDBACK47: a name that said the opposite of the fact it carried, two equal estimates
// reported as a disagreement, and five receipts that left a reader to guess which of two questions was answered.
//
// 1.1  `p1RulingReading.sources.typedRulings` counts the durable ruling CARDS the members filed (the tally's
//      `submitted`), not numbers the chair typed; read next to `p1CannotBackMeans` it said the opposite of the truth.
// 1.2  two members both estimated 0.6 and the notice said "the final rulings were NOT all unanimous" and "no member
//      asserted the proposition at that probability" — both false. What is true: the numbers AGREE, and 0.6 is not a
//      boolean 0/1, so nothing is decided.
// 1.3  the same agenda ARRAY was accepted in one meeting (via `formal_agenda`) and refused in the next, because the
//      schema declares `agenda` as a string. A serialized ARRAY of strings now reads as agenda lines through either door.
// 1.4  `pointerCheck.ok:true` sat beside `exists:false`: `ok` means WELL FORMED, not RESOLVED, so both facts are named.
// 1.5  motion ids are unique only inside their meeting (`mo1` twice); the receipt now prints the qualified pair.
// 2.1  a card's `value` is TEXT; it reads back as a string even when it prints as a bare number.
// 2.2  the paper body's citation gate fires on ANY occurrence, including a parenthesis — the fix is deletion, not renaming.
// 2.3  `institution` is never written on the hire face, first hire included.
// 2.4  `counted:false` on a close read as "the close failed"; the same fact now also prints as `closureVoteHadVotes`.
// 2.5  the office-consult gate fires at `final`, the last step: `advance` now predicts it while the paper is still writable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs' // fs-purpose: guard — the tests below materialise one real proof file and read the sources they pin
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const PAPER_KIT = read('vibe-math-vmu/kit/paper.js')
const MEETING_TOOL = read('vibe-math-vmu/tools/meeting.js')
const LIBRARY = read('vibe-math-vmu/kernel/library.js')
const VERDICT = read('vibe-math-vmu/kernel/meetingverdict.js')

// The aggregator is a PURE calculator, so the two sentences it produces are read directly instead of through a receipt.
const { aggregateVerdicts, rulePropositionProbability } = await import(
  pathToFileURL(join(ROOT, 'vibe-math-vmu', 'kernel', 'meetingverdict.js')).href)

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run211-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464776000, packs: ['v5r'], root: dir })
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

test('RUN 211 §0 — the repairs live on the source they belong to (pins)', () => {
  // 1.1 — the count is named after what it counts
  has(PACK, 'submittedRulings', '§0a ★★★ the reading counts submitted ruling CARDS by an honest name')
  has(PACK, 'sourcesMeans:', '§0b ★★ and says which count is which')
  // ★ RUN 214 DELETED the alias this pin named: `typedRulings` held the SUBMITTED count beside a `typed` number that meant
  // chair-typed, and run 51 read it backwards. The descriptor is now `rulingCards`, and the receipt also says the old key is gone.
  has(PACK, 'rulingCardsMeans:', '§0c ★ the card count is explained under its honest name')
  has(PACK, 'typedRulingsDeprecated:', '§0c2 ★★ and the deleted key is announced instead of silently vanishing')
  // 1.2 — two facts, two sentences
  has(VERDICT, 'const agreed = ps.length > 0 && ps.every((p) => p === ps[0])', '§0d ★★★ an agreeing set is a fact of its own')
  has(VERDICT, 'anyAsserted: asserted', '§0e ★ and "did anyone name that value" is a different fact')
  has(VERDICT, 'the numbers agree', '§0f ★★ the note names the agreement instead of denying it')
  has(VERDICT, '数值没有分歧', '§0g ★★ the caveat says where the gap really is (0 or 1)')
  has(VERDICT, '依次为 {list}（没有一致为 0 或 1）', '§0h ★★ the default template stops claiming disagreement')
  // 1.3 — the shape means the same thing through either door
  has(PACK, 'const keptBlob = parsedBlob.filter((x) => typeof x === \'string\' && x.trim() !== \'\')', '§0i ★★ a serialized ARRAY of strings is read as agenda lines')
  has(PACK, 'a serialized ARRAY of strings IS read as a list of lines', '§0j ★ and the refusal for a serialized OBJECT says so')
  // 1.4 — well formed is not resolved
  // RUN 211 follow-up: the shape helper stayed, but it must NOT be a key of the exposed object — the docs audit reads the
  // biggest object block of this file as the module's public surface, so a private helper there reads as an undocumented
  // method. It is a file-local function now; what is pinned is that the shape question still has its own implementation
  // and that the public method is what wraps it.
  has(LIBRARY, 'function resolvePointerShape(pointer) {', '§0k ★★ the shape question has its own implementation')
  has(LIBRARY, 'const out = resolvePointerShape(pointer)', '§0k2 ★ and the public method is a thin wrapper over it')
  has(LIBRARY, 'fieldMeans:', '§0l ★ and the two answers are spelled out')
  has(PACK, 'pointerCheckWellFormed:', '§0m ★★ the card receipt prints both')
  has(PACK, 'pointerCheckResolved:', '§0n ★ …under their own names')
  // 1.5 / 2.4 — ids and booleans that say what they mean
  has(PACK, 'motionQualified: str(args.meeting) + \'/\' + String(motionId)', '§0o ★★ a motion id is unique only inside its meeting')
  has(MEETING_TOOL, 'closureVoteHadVotes:', '§0p ★★ "did the closure reading hold votes" has a name that is not "counted"')
  // 2.1 / 2.2 / 2.3 / 2.5 — the docs a caller reads BEFORE the mistake
  has(PACK, 'value is stored as the card body', '§0q ★★ `value` is text, and says so where it is declared')
  has(PACK, '出现即命', '§0r ★★ the body gate fires on any occurrence — delete it, do not rename it')
  has(PACK, '`institution` is NEVER written on this face', '§0s ★ the hire description says "never" before the call')
  has(PAPER_KIT, 'officeConsultPending', '§0t ★★★ the consult gate is predicted before `final`')
  has(PAPER_KIT, 'finalization will NOT wait for an office answer', '§0u ★ and the prediction says which way it went')
})

test('RUN 211 §1 — two members who agree on 0.6 are not a disagreement', () => {
  const agree = aggregateVerdicts({
    verdicts: [
      { member: 'r-1', p: 0.6, reason: '归纳法给出 0.6' },
      { member: 'r-2', p: 0.6, reason: '按可证幅度估 0.6' },
    ],
    propositionId: 'rec-26',
  })
  ok(agree.ok === true, '§1a premise: the set aggregates', agree)
  ok(agree.agreed === true, '§1b ★★★ the members AGREE (this used to be reported as "not unanimous", full stop)', agree)
  ok(agree.anyAsserted === true, '§1c ★★ and one of them did name that value', agree)
  ok(agree.decided === false, '§1d ★★ but 0.6 is not a boolean 0/1, so nothing is DECIDED', agree)
  has(agree.note, 'the numbers agree', '§1e ★★ the note says the agreement, not a denial of it')

  const notice = rulePropositionProbability({
    verdicts: [
      { member: 'r-1', p: 0.6, reason: '归纳法给出 0.6' },
      { member: 'r-2', p: 0.6, reason: '按可证幅度估 0.6' },
    ],
    propositionId: 'rec-26', owner: 'r-1',
  })
  ok(notice.ok === true, '§1f premise: a ruling is assembled', notice)
  has(notice.notice.text, '数值没有分歧', '§1g ★★★ the notice says the numbers agree and the gap is 0/1')
  has(notice.notice.text, '不是布尔概率 0/1', '§1h ★ and names what is missing')
  ok(!String(notice.notice.text).includes('未全部一致'), '§1i ★★ the old "not all unanimous" sentence is gone from the mean template', notice.notice.text)

  const split = aggregateVerdicts({
    verdicts: [
      { member: 'r-1', p: 0.2, reason: '证据偏弱' },
      { member: 'r-2', p: 0.8, reason: '结构清晰' },
    ],
    propositionId: 'rec-26',
  })
  ok(split.agreed === false, '§1j ★ the split case still reports disagreement', split)
  ok(split.anyAsserted === false, '§1k ★ and nobody named the mean', split)
  const splitNotice = rulePropositionProbability({
    verdicts: [
      { member: 'r-1', p: 0.2, reason: '证据偏弱' },
      { member: 'r-2', p: 0.8, reason: '结构清晰' },
    ],
    propositionId: 'rec-26', owner: 'r-1',
  })
  has(splitNotice.notice.text, '没有任何成员主张这个数值', '§1l ★ the disagreement case keeps its honest sentence')
  ok(!String(splitNotice.notice.text).includes('数值没有分歧'), '§1m ★★ and never borrows the agreement sentence', splitNotice.notice.text)
})


test('RUN 211 §2 — a well formed pointer is not a resolved one', async () => {
  const dir = tmp()
  try {
    const { handle } = await assemble(dir)
    const missing = handle.kernel.library.resolvePointer('Members/r-1/Propos/nope.md')
    ok(missing.ok === true, '§2a ★★ the pointer is WELL FORMED (`ok` was never "resolved")', missing)
    ok(missing.wellFormed === true, '§2b ★★★ …and that question now has its own name', missing)
    ok(missing.resolved === false, '§2c ★★★ resolution is a different answer', missing)
    ok(missing.exists === false, '§2d ★ and `exists` keeps its old meaning', missing)
    has(missing.fieldMeans, 'different questions', '§2e ★ the receipt explains why both are printed')

    const rel = 'Members/r-1/Propos/real-211.md'
    const abs = join(handle.kernel.library.root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '# 证明\n\n前 n 个奇数之和为 n²。\n', 'utf8')
    const real = handle.kernel.library.resolvePointer(rel)
    ok(real.wellFormed === true && real.resolved === true, '§2f ★★ a real file answers YES to both', real)
  } finally { /* hygiene */ }
})

test('RUN 211 §3 — an agenda array is agenda lines through either door', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 211 的议程', researcherCount: 2 })).ok === true, 'premise: founded')

    const arr = await call('vibe_v5_meeting', { member: 'r-acad', agenda: JSON.stringify(['确认命题', '分配辩论']), title: 'm-arr' })
    ok(arr.ok === true, '§3a ★★★ a serialized ARRAY of strings is accepted (the door no longer decides)', arr)
    const agendaText = String(arr.agenda === undefined ? '' : arr.agenda)
    has(agendaText, '确认命题; 分配辩论', '§3b ★★ and read as two agenda LINES, not as a blob')

    const obj = await call('vibe_v5_meeting', { member: 'r-acad', agenda: JSON.stringify({ a: 1 }), title: 'm-obj' })
    ok(obj.ok === false, '§3c ★★ a serialized OBJECT is still refused', obj)
    ok(obj.code === 'VMU_INVALID_ARGUMENT', '§3d named code', obj.code)
    has(obj.hint, 'serialized ARRAY of strings IS read as a list of lines', '§3e ★ the hint teaches the legal shape')
  } finally { /* hygiene */ }
})

test('RUN 211 §4 — the card receipt prints both pointer answers', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 211 的指针', researcherCount: 2 })).ok === true, 'premise: founded')
    const w = blockOf(await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论',
      p: 0.9, member: 'r-1', proof_ref: 'Members/r-1/Propos/oddsum-211.md', proof_state: 'complete',
    }), 'proposition')
    ok(w.ok === true, '§4a premise: the card is written', w)
    const ev = w.proofStateEvidence
    ok(ev.pointerCheckWellFormed === true, '§4b ★★★ the pointer is well formed (it was always true)', ev.pointerCheckWellFormed)
    ok(ev.pointerCheckResolved === false, '§4c ★★★ and NOT resolved — the two facts are separate fields now', ev.pointerCheckResolved)
    has(ev.pointerCheckFieldsMeans, 'different questions', '§4d ★ the receipt says why both are printed')
  } finally { /* hygiene */ }
})

test('RUN 211 §5 — the consult gate is predicted while the paper is still writable', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 211 的定稿闸', researcherCount: 2 })).ok === true, 'premise: founded')
    ok((await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'paper-211' })).ok === true, 'premise: paper started')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-211', member: 'r-1', part: '第一节', body: '归纳法证明：前 n 个奇数之和为 n²。' })).ok === true, 'premise: r-1 wrote')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-211', member: 'r-2', part: '第二节', body: '逐项核验：n=1..5 逐一相加与平方相符。' })).ok === true, 'premise: r-2 wrote')
    const armed = await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'required', why: 'RUN 211 §5 要把定稿闸打开，看 advance 是否预告' })
    ok(armed.ok === true, 'premise: the gate is armed', armed)

    const moved = blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-211' }), 'advance')
    ok(moved.moved === true, '§5a premise: the paper moved to reviewing', moved)
    ok(moved.officeConsultPending === true, '§5b ★★★ the receipt PREDICTS the refusal at final', moved.officeConsultPending)
    has(moved.officeConsultMeans, 'WILL open a consult question', '§5c ★★ and says the refusal will happen')
    has(moved.officeConsultMeans, 'action:"consult"', '§5d ★★★ and names the call that answers it')
    has(moved.officeConsultMeans, 'do NOT flip the setting', '§5e ★ and refuses the shortcut by name')
  } finally { /* hygiene */ }
})

test('RUN 211 §6 — a motion id is only unique inside its meeting', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 211 的动议', researcherCount: 2 })).ok === true, 'premise: founded')
    const m = await call('vibe_v5_meeting', { member: 'r-acad', agenda: 'm1', title: 'm-1' })
    const mid = String(m.meeting)
    const mo = await call('vibe_v5_motion', { meeting: mid, member: 'r-acad', kind: 'topic', text: '各位是否同意把 p 定为 1？' })
    ok(mo.ok === true, '§6a premise: a motion is recorded', mo)
    ok(mo.motionQualified === mid + '/' + String(mo.motion), '§6b ★★★ the receipt prints meeting/motion together', mo.motionQualified)
    has(mo.motionIdMeans, 'unique INSIDE its meeting', '§6c ★ and says why the pair is needed')
  } finally { /* hygiene */ }
})

test('RUN 211 §7 — "counted" is a reading, not a verdict on the close', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 211 的关会', researcherCount: 2 })).ok === true, 'premise: founded')
    const m = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '关会', title: 'm-close' })
    const closed = await call('vibe_vmu_meeting', { action: 'close', id: String(m.meeting), actor: 'r-acad' })
    ok(closed.ok === true, '§7a premise: the meeting closes with no closure votes on record', closed)
    ok(closed.closureVoteHadVotes === false, '§7b ★★★ the same fact prints under a name that reads as a question', closed.closureVoteHadVotes)
    ok(closed.counted === closed.closureVoteHadVotes, '§7c ★ the two names never disagree (one is an alias of the other)')
  } finally { /* hygiene */ }
})
