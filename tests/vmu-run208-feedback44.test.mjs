// RUN 208 — run 45 / FEEDBACK44: seven habits where the receipt answered a question nobody asked, or dropped a word
// the caller did give.
//
// 1.1  `review { decision:false }` was DROPPED silently (the guard only fired for a STRING), so "send this part back"
//      was accepted and the next advance read the paper as unanimous.
// 1.2  `verdict_final` printed `correction.call` (a p=1 write) but not the READING that write will make.
// 1.3  a debate's MEETING-ballot id in `debate_ruling.ballotId` was refused as "no such ballot" — it exists, elsewhere.
// 1.4  the `close` receipt carried closureVote but nothing answering "was any vote counted".
// 1.5  a SUCCESSFUL final answered `moved:false` with from/to null and no stage reading.
// 1.6  a second `vibe_v5_hire` did not say that `institution` is only read on the first hire.
// 2.1  `verdicts` sent as serialized text said "you passed a string" instead of naming the shape that arrived.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const MEETING = read('vibe-math-vmu/tools/meeting.js')
const PAPER = read('vibe-math-vmu/kit/paper.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run208-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464773000, packs: ['v5r'], root: dir })
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

test('RUN 208 — a word the caller gave must be refused or used, never dropped', async () => {
  console.log('\nRUN 208 (run 45 / FEEDBACK44): review/verdicts/close/final/ballot-id/hire')
  // ── §0 the repairs live on the source they belong to ───────────────────────────────────────────────────────
  {
    has(PACK, 'this face does NOT read it', '§0a ★★ `review` refuses `decision` at ANY type now (1.1)')
    has(PACK, '`decision` belongs to `final`', '§0b …and the refusal says where that word does belong')
    has(PACK, 'SERIALIZED', '§0c ★★ a serialized verdicts value is named as such (2.1)')
    has(PACK, 'the tool schema turns an object into text', '§0d …with the reason the string arrived (2.1)')
    has(PACK, 'stageMoved: finalized.moved === true || finalized.finalized === true', '§0e ★★ `final` reports the STAGE, not only the advance (1.5)')
    has(PACK, "STAGE moved to finalized", '§0f …and says in words which stage it moved to (1.5)')
    has(PACK, 'is a MEETING ballot', '§0g ★★ a meeting box id is named as the OTHER face\'s box, not "no such ballot" (1.3)')
    has(PACK, 'const p1RulingReading = await (async () => {', '§0h ★★ `verdict_final` carries the reading the p=1 write will take (1.2)')
    has(PACK, '`institution` is NEVER written on this face', '§0i ★★ a second hire says `institution` is never written here (1.6; RUN 210 corrected the wording)')
    has(MEETING, 'counted answers ONE question', '§0j ★★ `close` answers "was any vote counted" (1.4)')
    has(PAPER, 'review({ deliverable: false })', '§0k ★ the locked-parts repair path names a call that actually works (2.5)')
  }

  // ── §1 `review` takes deliverable, and refuses `decision` at any type (1.1) ────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', { statement: 'run208 命题：n + n = 2n', value: 1, motive: '算术', p: 0.9, member: 'r-acad' })
    ok(card.ok === true, '§1 premise: an evidence card exists', card)
    const started = await call('vibe_v5_paper', { action: 'start', target: 'paper-208', participants: ['r-1', 'r-2'] })
    ok(started.ok === true, '§1 premise: the paper starts with two participants', started)
    const part = await call('vibe_v5_paper', { action: 'part', target: 'paper-208', member: 'r-1', part: 'r-1 的节', body: 'r-1 的解法', evidence: [card.recordId] })
    ok(part.ok === true, '§1 premise: r-1 writes a part', part)
    const adv = await call('vibe_v5_paper', { action: 'advance', target: 'paper-208' })
    ok(adv.ok === true && adv.advance && adv.advance.to === 'reviewing', '§1 premise: the paper is in reviewing', adv)
    const dropped = await call('vibe_v5_paper', { action: 'review', target: 'paper-208', member: 'r-2', of: 'r-1', decision: false })
    ok(dropped.ok === false && dropped.code === 'VMU_INVALID_ARGUMENT', '§1a ★★★ `decision:false` on a REVIEW is REFUSED (it used to be dropped and read as delivered)', dropped)
    has(String(dropped.message), 'this face does NOT read it', '§1b ★★★ …and the refusal says the word was not read')
    has(String(dropped.message), '`decision` belongs to `final`', '§1c …naming the face that does read it')
    const real = await call('vibe_v5_paper', { action: 'review', target: 'paper-208', member: 'r-2', of: 'r-1', deliverable: false, comments: '需要修订' })
    ok(real.ok === true && real.review && real.review.deliverable === false, '§1d the same review with `deliverable:false` is accepted as a REFUSAL', real)
    const back = await call('vibe_v5_paper', { action: 'advance', target: 'paper-208' })
    ok(back.ok === true && back.advance && back.advance.to === 'writing' && Array.isArray(back.advance.refusers) && back.advance.refusers.includes('r-2'),
      '§1e ★★ the send-back actually happened: advance returns to writing with r-2 named as a refuser', back)
  }

  // ── §2 `verdicts` arriving as serialized text is named as that shape (2.1) ────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run208 §2 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/rec-1.md#形式证明', proof_state: 'complete',
    })
    const conv = await call('vibe_v5_meeting', { agenda: '临时议程：票面形状', type: 'debate', subject: card.recordId, member: 'r-acad' })
    ok(conv.ok === true && typeof conv.meeting === 'string', '§2 premise: a debate meeting exists', conv)
    const shaped = await call('vibe_v5_verdict_final', {
      meeting: conv.meeting, proposition_id: card.recordId, member: 'r-acad',
      verdicts: JSON.stringify({ 'r-acad': 1, 'r-1': 1, 'r-2': 1 }),
    })
    ok(shaped.ok === false && shaped.code === 'VMU_INVALID_ARGUMENT', '§2a ★★ serialized verdicts are refused as a SHAPE', shaped)
    has(String(shaped.message), 'SERIALIZED', '§2b ★★★ …and the message names what actually arrived, not "a string" alone')
    has(String(shaped.message), 'an object is NOT read as a tally', '§2c …keeping the standing sentence about tabs vs tallies')
  }

  // ── §3 a debate's MEETING ballot cannot be cited as its own box (1.3) ─────────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run208 §3 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/rec-1.md#形式证明', proof_state: 'complete',
    })
    const conv = await call('vibe_v5_meeting', { agenda: '临时议程：辩论', type: 'debate', subject: card.recordId, member: 'r-acad' })
    const mid = conv.meeting
    const mo = await call('vibe_v5_motion', { meeting: mid, kind: 'topic', text: '结题', member: 'r-acad' })
    const sec = await call('vibe_v5_second', { meeting: mid, motion_id: mo.motion, member: 'r-1' })
    ok(mo.ok === true && sec.ok === true, '§3 premise: a motion is raised and seconded', { mo, sec })
    const box = await call('vibe_vmu_meeting', { action: 'ballot', meeting: mid, target: mo.motion, member: 'r-acad' })
    ok(box.ok === true && typeof box.ballotId === 'string', '§3 premise: the meeting opens a box on that motion', box)
    const cite = await call('vibe_v5_record_proposition', {
      id: card.recordId, statement: 'run208 §3 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 1, member: 'r-acad',
      debate_ruling: { mode: 'unanimous', value: 1, subject: card.recordId, n: 2, decided: true, meeting: mid, ballotId: box.ballotId, by: 'r-acad' },
    })
    ok(cite.ok === false && cite.code === 'VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED', '§3a ★★ a meeting box id is still NOT readable by this gate', cite)
    has(String(cite.hint), 'MEETING ballot', '§3b ★★★ …but the hint now names which face holds it')
    has(String(cite.hint), 'meeting:"<meeting id>"', '§3c ★★★ and the shape that reads it')
  }

  // ── §4 `final` reports the STAGE (1.5) ────────────────────────────────────────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', { statement: 'run208 §4 命题：n + n = 2n', value: 1, motive: '算术', p: 0.9, member: 'r-acad' })
    await call('vibe_v5_paper', { action: 'start', target: 'paper-208b', participants: ['r-1', 'r-2'] })
    for (const m of ['r-1', 'r-2']) {
      const p = await call('vibe_v5_paper', { action: 'part', target: 'paper-208b', member: m, part: m + ' 的节', body: m + ' 的解法', evidence: [card.recordId] })
      ok(p.ok === true, '§4 premise: ' + m + ' writes a part', p)
    }
    const a1 = await call('vibe_v5_paper', { action: 'advance', target: 'paper-208b' })
    ok(a1.ok === true && a1.advance.to === 'reviewing', '§4 premise: the paper is in reviewing', a1)
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'review', target: 'paper-208b', member: m, deliverable: true, comments: '可交付' })
    const a2 = await call('vibe_v5_paper', { action: 'advance', target: 'paper-208b' })
    ok(a2.ok === true && a2.advance.to === 'awaiting-editor', '§4 premise: both reviews are deliverable', a2)
    // the consult gate defaults to "required" (kernel/paper.js:139 reads only an explicit "off" as off), so this paper
    // answers the office first — the same process reads the durable consult row the kit tests.
    const armed = await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'off' })
    ok(armed.ok === true, '§4 premise: the consult gate is switched off for this kernel', armed)
    const fin = await call('vibe_v5_paper', { action: 'final', target: 'paper-208b', member: 'r-acad', decision: 'deliverable' })
    const f = (fin && fin.final) || {}
    ok(typeof f.stageMoved === 'boolean', '§4a ★★★ the final receipt carries a STAGE reading (it used to say moved:false alone)', f)
    ok(f.stageMoved === (f.moved === true || f.finalized === true), '§4b stageMoved answers the stage question on both branches', f)
    ok(/stage/i.test(String(f.stageMovedMeans)), '§4c …and the sentence beside it says what it answers', f.stageMovedMeans)
    has(String(f.stageMovedMeans), 'finalized', '§4d ★ naming the stage it moved to, not just "moved"')
  }

  // ── §5 a second hire says where `institution` is read (1.6) ───────────────────────────────────────────────
  {
    const { call } = await assemble(tmp())
    const first = await call('vibe_v5_hire', { to: 'r-t208', purpose: '临时任务', initial_task: '量一下', institution: 'sim-inst' })
    ok(first.ok === true, '§5 premise: the first hire succeeds', first)
    const again = await call('vibe_v5_hire', { to: 'r-t208', purpose: '临时任务', initial_task: '量一下', institution: 'sim-other' })
    ok(again.ok === false && again.code === 'VMU_INVALID_ARGUMENT', '§5a a second hire of the same seat is refused', again)
    has(String(again.hint), 'institution', '§5b ★★ …and the refusal says when `institution` is read')
    has(String(again.hint), 'FIRST hire', '§5c …namely on the first one')
  }

  // ── §6 `verdict_final` hands back the reading the p=1 write will take (1.2) ───────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run208 §6 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/rec-1.md#形式证明', proof_state: 'complete',
    })
    const conv = await call('vibe_v5_meeting', { agenda: '临时议程：裁决抄回', type: 'debate', subject: card.recordId, member: 'r-acad' })
    const mid = conv.meeting
    for (const m of ['r-1', 'r-2']) {
      const f = await call('vibe_v5_verdict', { meeting: mid, proposition_id: card.recordId, verdict: 1, reason: '由归纳可证 ' + m, member: m })
      ok(f.ok === true, '§6 premise: ' + m + ' files its own typed ruling', f)
    }
    const fin = await call('vibe_v5_verdict_final', { meeting: mid, proposition_id: card.recordId, member: 'r-acad' })
    ok(fin.ok === true, '§6 premise: the chair signs the tally', fin)
    const reading = fin.p1RulingReading || {}
    ok(reading.ok === true, '§6a ★★★ the final receipt carries the reading the p=1 write will make', reading)
    ok(reading.sources && reading.sources.typedRulings === 2, '§6b ★★★ …and that reading counted the TYPED RULINGS (2)', reading.sources)
    ok(reading.voted === true, '§6c …so "will my write be refused for having no counted votes" is answerable BEFORE the write', reading)
    has(String(fin.p1RulingReadingMeans), 'PREDICT', '§6d …and the receipt says a prediction is what this is')
  }
})
