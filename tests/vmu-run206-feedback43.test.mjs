// RUN 206 — run 44 / FEEDBACK43: nine readings where the refusal named the wrong reason, or named nothing at all.
//
// 1.1  `vibe_vmu_meeting {action:"ballot", meeting:"m5", target:"rec-41"}` ACCEPTED a card id as a motion and then the
//      box could never count a single vote (`no such motion: rec-41`, `motions: none`) — the bind was accepted and the
//      ballot was stillborn.
// 1.2  a meeting's box id (`b-3-mvzt20vz`) sent to `vibe_v5_poll_vote` answered 「找不到票箱 / 先 open() 取 id」 — the box
//      exists, it belongs to the OTHER face, and the advice could not work.
// 1.3  `agenda` carrying a JSON blob was stored verbatim and reported ok (a purpose became a serialized object).
// 1.4  an OBJECT of verdicts was silently read as "no verdicts passed" instead of being refused as the wrong shape.
// 1.5  the p=1 gate only read MOTIONS: a debate that settled with TYPED RULING CARDS could not be cited back into a
//      card, so `verdict_final`'s own printed correction call was refused by `P1_RULING_UNVOTED`.
// 1.6  `p:2`'s refusal carried no `REACHABLE INSTEAD`, against the standing rule that the actor matters.
// 1.7  the mainline block gave the three seats three DIFFERENT bodies, so a quote-back could not be compared.
// 1.8  `countedMeans` said BOTH authorities accepted the vote while `receipt.ballot.mirrored` was false.
// 1.9  the pack's `vibe_v5_hire` REFUSED `institution` although the control face requires it; two faces, two spellings.
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
const HANDLERS = read('vibe-math-vmu/kit/handlers.js')
const BLOCKS = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run206-'))

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
  return { call, handle }
}

test('RUN 206 — nine readings that named the wrong reason, or named nothing', async () => {
  console.log('\nRUN 206 (run 44 / FEEDBACK43): the meeting face, the poll face, the p=1 gate and the hire spelling')
  // ── §0 the repairs are on the source they belong to ────────────────────────────────────────────────────────
  {
    has(PACK, 'it ALSO holds', '§0a ★★ the p=1 gate now reads TYPED RULING CARDS, not only motions (1.5)')
    has(PACK, 'typedRulings', '§0b the reading it returns is named, not implied (1.5)')
    has(PACK, 'MEETING ballot', '§0c ★★ a meeting box sent to the poll face is named as the OTHER face\'s box (1.2)')
    has(PACK, 'SEPARATE box registries', '§0d and the reason the advice could not work is stated (1.2)')
    has(PACK, 'ARRAY of {member, p, reason}', '§0e ★★ an object of verdicts is refused as a SHAPE, not read as "none" (1.4)')
    has(PACK, 'an object is NOT read as a tally', '§0f and the refusal says which spelling does work (1.4)')
    has(PACK, 'JSON TEXT', '§0g ★ a serialized blob is refused as an agenda, by name (1.3)')
    has(PACK, 'institutionIgnored', '§0h ★ the pack hire face accepts `institution` and DISCLOSES that it did not use it (1.9)')
    has(HANDLERS, 'REACHABLE INSTEAD', '§0i the p-range refusal carries the standing REACHABLE INSTEAD section (1.6)')
    has(MEETING, 'vibe_v5_motion { meeting:', '§0j a meeting-bound ballot refusal names the face that MAKES a motion (1.1)')
    has(MEETING, 'vibe_v5_second', '§0k …and the one that seconds it, because an unseconded motion cannot be voted (1.1)')
    has(MEETING, 'mirrored', '§0l `countedMeans` branches on what the OTHER authority actually did (1.8)')
    has(BLOCKS, "const MAINLINE_CORE", '§0m ★★ the mainline is ONE shared body (1.7: three bodies cannot be compared)')
    has(BLOCKS, "const MAINLINE_SEAT", '§0n each seat appends only its own duty')
    has(BLOCKS, 'mainline-v2', '§0o the shared body carries a VERSION, so a paraphrase is detectable (1.7)')
  }

  // ── §1 the p=1 gate reads a debate that settled with TYPED RULINGS (1.5) ───────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run206 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/rec-1.md#形式证明', proof_state: 'complete',
    })
    ok(card.ok === true, '§1 premise: the card exists and carries a finished proof', card)
    const conv = await call('vibe_v5_meeting', { agenda: '决定 ' + card.recordId + ' 是否为 1', type: 'debate', subject: card.recordId, member: 'r-acad' })
    ok(conv.ok === true && typeof conv.meeting === 'string', '§1a premise: a debate meeting exists', conv)
    const mid = conv.meeting
    // the CHAIR may not file a member ruling — it signs the tally instead (measured on this build)
    const chairFiling = await call('vibe_v5_verdict', { meeting: mid, proposition_id: card.recordId, verdict: 1, reason: '主席不代填', member: 'r-acad' })
    ok(chairFiling.ok === false && chairFiling.code === 'VMU_RULING_CHAIR_SIGNS', '§1b premise: the chair SIGNS, it does not type the members\' numbers', chairFiling)
    for (const m of ['r-1', 'r-2']) {
      const f = await call('vibe_v5_verdict', { meeting: mid, proposition_id: card.recordId, verdict: 1, reason: '由归纳可证 ' + m, member: m })
      ok(f.ok === true, '§1c premise: ' + m + ' files its own typed ruling', f)
    }
    const fin = await call('vibe_v5_verdict_final', { meeting: mid, proposition_id: card.recordId, member: 'r-acad' })
    ok(fin.ok === true, '§1d premise: the chair signs the tally', fin)
    const tallyId = (fin.tally && (fin.tally.id || fin.tally.tallyId)) || fin.tallyId || null
    ok(typeof tallyId === 'string' && tallyId.indexOf('tally-') === 0, '§1e the tally id is printed (a name a member can copy back)', { tallyId })
    has(String(fin.correction && fin.correction.call), 'ballotId: "' + tallyId + '"', '§1f and the printed correction call cites that very name')

    // the replay: the SAME card, p=1, citing the decision that just happened — this is what run 44 was refused for
    const replay = await call('vibe_v5_record_proposition', {
      id: card.recordId, statement: 'run206 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 1, member: 'r-acad',
      debate_ruling: { mode: 'unanimous', value: 1, subject: card.recordId, n: 2, decided: true, meeting: mid, ballotId: tallyId, by: 'r-acad' },
    })
    ok(replay.ok === true, '§1g ★★★ the p=1 write that cites the debate\'s OWN tally is ACCEPTED (run 44 was refused with UNVOTED)', replay)
    const reading = replay.p1RulingReading || {}
    ok(reading.ok === true, '§1h the receipt hands back the reading it decided on', reading)
    ok(reading.sources && reading.sources.typedRulings === 2, '§1i ★★★ and that reading counted the TYPED RULINGS (2), not motions (0)', reading.sources)
    ok(reading.typedRulings && reading.typedRulings.count === 2, '§1j the count is stated separately, so "no motions" and "no decision" stop looking alike', reading.typedRulings)
    has(String(reading.means), 'TYPED RULING CARD', '§1k the means names what it read — a debate can settle two ways now')
  }

  // ── §2 a meeting-bound ballot votes a MOTION (1.1) ────────────────────────────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const conv = await call('vibe_v5_meeting', { agenda: '临时议程：票箱绑定', member: 'r-acad' })
    const mid = conv.meeting
    const bad = await call('vibe_vmu_meeting', { action: 'ballot', meeting: mid, target: 'rec-1-not-a-motion', member: 'r-acad' })
    ok(bad.ok === false && bad.code === 'VMU_NO_SUCH_OBJECT', '§2a ★★ a ballot bound to a name that is not a motion is REFUSED (it used to be accepted and never countable)', bad)
    has(String(bad.message), 'has no motion', '§2b the refusal says the meeting holds no such motion')
    has(String(bad.hint), 'vibe_v5_motion { meeting:', '§2c ★★ …and names the face that RAISES one')
    has(String(bad.hint), 'vibe_v5_second', '§2d …and the SECOND it needs before a vote can count')
    ok(String(bad.hint).indexOf('action: "motion"') === -1, '§2e the old advice (a meeting action that does not exist) is gone', bad.hint)
    // the working path stays working: motion → second → ballot → counted vote
    const mo = await call('vibe_v5_motion', { meeting: mid, kind: 'topic', text: '把 rec-1 定为 1', member: 'r-acad' })
    ok(mo.ok === true, '§2f premise: a motion can be raised', mo)
    const sec = await call('vibe_v5_second', { meeting: mid, motion_id: mo.motion, member: 'r-1' })
    ok(sec.ok === true, '§2g premise: and seconded', sec)
    const box = await call('vibe_vmu_meeting', { action: 'ballot', meeting: mid, target: mo.motion, member: 'r-acad' })
    ok(box.ok === true && typeof box.ballotId === 'string', '§2h premise: the box opens on the motion', box)
    // ── §3 that box, sent to the POLL face, is named as elsewhere (1.2) ─────────────────────────────────────
    const wrongFace = await call('vibe_v5_poll_vote', { ballot_id: box.ballotId, member: 'r-2', choice: '1' })
    ok(wrongFace.ok === false && wrongFace.code === 'VMU_NOT_FOUND', '§3a the poll face still refuses the id it does not hold', wrongFace)
    has(String(wrongFace.hint), 'MEETING ballot', '§3b ★★★ …but now it says WHOSE box it is')
    has(String(wrongFace.hint), 'vibe_vmu_meeting { action:"vote"', '§3c ★★★ and which call actually votes it')
    has(String(wrongFace.hint), 'SEPARATE box registries', '§3d ★★★ and why the old advice (「先 open()」) could not work')
  }

  // ── §4 an agenda is a PURPOSE, not a serialized object (1.3) ──────────────────────────────────────────────
  {
    const { call, handle } = await assemble(tmp())
    await handle.kernel.members.hire({ id: 'r-acad', slot: 'chair', institution: 'sim' })
    const blob = await call('vibe_v5_meeting', { agenda: JSON.stringify({ 议题: '偶数' }), member: 'r-acad' })
    ok(blob.ok === false && blob.code === 'VMU_INVALID_ARGUMENT', '§4a ★★ a JSON blob as an agenda is REFUSED (it used to be stored and reported ok)', blob)
    has(String(blob.message), 'JSON TEXT', '§4b the refusal names what arrived')
    // RUN 211 changed the SECOND half of this sentence on purpose: an array of strings is now read as agenda LINES
    // (the door no longer decides the shape). The object half — "a blob is not a purpose" — is unchanged.
    has(String(blob.hint), 'a serialized object is not a purpose', '§4c and says what an agenda is')
    const obj = await call('vibe_v5_meeting', { agenda: { 议题: '偶数' }, member: 'r-acad' })
    ok(obj.ok === false, '§4d an OBJECT agenda is still refused (RUN 204 behaviour kept)', obj)
    const list = await call('vibe_v5_meeting', { agenda: ['议题一', '议题二'], member: 'r-acad' })
    ok(list.ok === true, '§4e a LIST of non-empty strings is still accepted (RUN 204 behaviour kept)', list)
    has(String(JSON.stringify(list)), '议题一', '§4f and it is stored as text, not as a blob')
  }

  // ── §5 `verdicts` is an ARRAY; an object is a shape error, not an empty tally (1.4) ──────────────────────
  {
    const { call, handle } = await assemble(tmp())
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run206 §5 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/rec-1.md#形式证明', proof_state: 'complete',
    })
    ok(card.ok === true, '§5 premise: a card with a finished proof exists', card)
    const conv = await call('vibe_v5_meeting', { agenda: '临时议程：票面形状', type: 'debate', subject: card.recordId, member: 'r-acad' })
    ok(conv.ok === true && typeof conv.meeting === 'string', '§5 premise: a debate meeting exists', conv)
    const mid = conv.meeting
    const obj = await call('vibe_v5_verdict_final', { meeting: mid, proposition_id: card.recordId, verdicts: { 'r-acad': 1, 'r-1': 1, 'r-2': 1 }, member: 'r-acad' })
    ok(obj.ok === false && obj.code === 'VMU_INVALID_ARGUMENT', '§5a ★★ an OBJECT of verdicts is REFUSED as a shape', obj)
    has(String(obj.message), 'ARRAY of {member, p, reason}', '§5b ★★ …and the refusal prints the shape it needs')
    has(String(obj.hint), 'an object is NOT read as a tally', '§5c ★★ …instead of letting an object look like an empty tally')
  }

  // ── §6 the pack hire face accepts `institution` and says it did not use it (1.9) ─────────────────────────
  {
    const { call } = await assemble(tmp())
    const hired = await call('vibe_v5_hire', { to: 'r-t1', purpose: '临时任务', initial_task: '量一下', institution: 'sim-inst' })
    ok(hired.ok === true, '§6a ★ `institution` is ACCEPTED by the pack hire face (two faces may not spell one act differently)', hired)
    ok(hired.institution === 'sim-inst', '§6b the value is echoed back')
    ok(hired.institutionIgnored === true, '§6c ★★ and the receipt states it was NOT used, with the reason')
    has(String(hired.institutionMeans), 'control face', '§6d naming the face where `institution` is actually required')
  }
})
