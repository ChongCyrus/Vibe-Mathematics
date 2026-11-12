// RUN 195 — run 37 / FEEDBACK36: five readings that were true of a different moment, party or question than the one the
// reader had.
//
// 1.1  MEASURED on run 37: `final` compiled the paper to 91 156 bytes, a member's own kernel later recompiled the same
//      source to 91 198 bytes ON DISK, and `status.pdfCompiled.pdfBytes` still answered 91 156 (rec-19). Two facts had
//      been merged into one number: the compile ledger read returned the OLDEST `paper-pdf` row (each `compile` writes a
//      new row with the same title) and nothing said which row the finalisation used.
// 1.3  `closureVote.meetingId` is null BY DESIGN (one institute-wide durable tally), but the close receipt printed it
//      beside `archived:true` with nothing saying so — run 37's office asked twice which meeting the tally belonged to.
// 2.1  `step` carried `executedMeans` and `drive` did not; run 37's batch receipt therefore showed `executed: 0` with no
//      sentence saying it counts REPLY FIELDS (not the work members did in their own sessions).
// 2.2  `advance` carried `refusers` on the disagreement branches and omitted it on the unanimous one — an absent field
//      read as an unknown instead of "nobody objected".
// 2.3  The evidence gate answered `missing: []` beside `emptyParts: [...]`: two lists, two questions, no label.
// 2.5  The first meeting act of every fresh institute failed with VMU_CHAIR_ACT_NOT_DELEGATED and nothing on the seeding
//      receipt said a chair needs a turn of its own first.
// 2.4/2.7  The paper prompt taught `evidence: ["Members/<id>/Propos/p-x.md"]` (a FILE CARD, refused by name at `part`)
//      and said nothing about which reading is authoritative once a paper has been recompiled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PAPER = read('vibe-math-vmu/kit/paper.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')
const MEETING = read('vibe-math-vmu/tools/meeting.js')
const QUALITY = read('vibe-math-vmu/packs/v5r/paper-quality.js')
const PROMPTS = read('vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — still present: ' + needle)

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 195 §0 — the seven repairs are in place (source pins)', () => {
  // 1.1 — the compile ledger read is the NEWEST row, and the finalisation names its own
  has(PAPER, 'THE LEDGER READ ANSWERED WITH THE OLDEST COMPILE', '§0a the defect is named where it is fixed')
  has(PAPER, 'let best = null', '§0b the read scans every candidate instead of returning the first')
  has(PAPER, 'const better = bestKey === null', '§0c and keeps the newest by (updatedAt, rev)')
  has(PAPER, 'finalPdfRecordId', '§0d the finalisation records which compile it used')
  has(TOOLS, 'compiledAfterFinal', '§0e the status face says whether the file was re-typeset afterwards')
  has(TOOLS, 'NOT the compile the paper was finalised with', '§0f ★ and says it in words, with both byte counts')
  // 1.3 — the close says whose close the tally was read for
  has(MEETING, 'readForMeeting: pid', '§0g the close names the meeting it read the tally for')
  has(MEETING, 'is null BY DESIGN', '§0h and that the tally carries no meeting id on purpose')
  // 2.1 — the batch receipt states what `executed` counts
  has(TURN, 'executedMeans: EXECUTED_MEANS', '§0i drive attaches the same sentence step carries')
  // 2.2 — the unanimous branch states an empty refusers list
  has(PAPER, 'empty ON PURPOSE: every participant who owes a verdict', '§0j advance says "nobody objected" as a value')
  // 2.3 — the evidence gate is labelled
  has(QUALITY, "gate: 'evidence'", '§0k the evidence refusal names its gate')
  has(QUALITY, "nextGate: 'required-line'", '§0l and the gate after it')
  has(QUALITY, 'this refusal is about parts that filed no evidence at all', '§0m ★ and why `missing` is empty')
  // 2.5 — the seeding receipt names the chair-turn rail
  has(TOOLS, 'chairTurnNote', '§0n start answers the chair-turn note')
  has(TOOLS, 'VMU_CHAIR_ACT_NOT_DELEGATED', '§0o naming the refusal a fresh institute hits first')
  // 2.4/2.7 — the prompt teaches record ids, not file cards, and how to read a recompiled PDF
  hasNot(PROMPTS, 'Propos/p-x.md"] }', '§0p ★ the part example no longer teaches a file card')
  // ★ TB-2752 review: the blanket "a file card is not evidence" is FALSE — the gate resolves a member-file path whose
  // FILENAME IS the record id (checkEvidencePointers' MEMBER_FILE branch). What replaced it: the two legal spellings,
  // and the ban on SELF-CHOSEN file cards. The pin now asserts the accurate rule and carries its own anti-lamp.
  has(PROMPTS, '收两种写法', '§0q the writing guide states the TWO legal spellings of an evidence pointer')
  has(PROMPTS, '自起的文件名不是证据', '§0q2 and says a SELF-CHOSEN file card is not evidence (never "every path")')
  hasNot(PROMPTS, '文件路径、文件名、摘要都不收', '§0q3 the false absolute is gone')
  {
    const accurate = (t) => t.includes('收两种写法') && t.includes('自起的文件名不是证据') && !t.includes('文件路径、文件名、摘要都不收')
    ok(accurate(PROMPTS), '§0q4 the accurate predicate holds on the shipped prompts')
    const relapsed = PROMPTS.split('自起的文件名不是证据').join('文件路径都不收') + ' 文件路径、文件名、摘要都不收'
    ok(!accurate(relapsed), '§0q-lamp ★ re-inserting the false absolute turns the SAME predicate red (the pin can fail)')
  }
  has(PROMPTS, 'compiledAfterFinal', '§0r the writing prompt says which PDF reading is authoritative')
})

test('RUN 195 §1 — the compile ledger reads the NEWEST compile, and the finalisation says which one it used', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run195-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'run195-paper' })
    ok(started.ok !== false, '§1a the paper opens', started)
    const target = String(started.target || 'run195-paper')
    // the two postulates a paper must quote verbatim are not this test's subject; go straight at the ledger seam.
    const { createPaperSubsystem } = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
    const paper = createPaperSubsystem({ kernel: handle.kernel })
    ok(!!paper && typeof paper.compiledPdfRow === 'function', '§1b the ledger read exists on the paper face')
    const read0 = paper.state ? paper.state(target) : null
    const state = read0 && read0.state ? read0.state : read0
    ok(!!state, '§1c with the paper state', read0)
    // two compile rows for the SAME paper, the newer one claiming different bytes — exactly run 37's shape
    const put = (title, bytes, at) => {
      const rec = handle.kernel.records.put({
        track: 'paper', kind: 'paper-pdf', title,
        body: JSON.stringify({ pdfPath: 'Paper/' + target + '/' + title + '.pdf', pdfBytes: bytes, engine: 'xelatex', tried: [] }),
      })
      return rec && rec.id ? rec.id : (rec && rec.record ? rec.record.id : null)
    }
    const older = put('paper|' + target + '|pdf', 91156, 1000)
    const newer = put('paper|' + target + '|pdf', 91198, 2000)
    ok(!!older && !!newer, '§1d two compile rows are on the ledger', { older, newer })
    const row = paper.compiledPdfRow(state)
    ok(!!row, '§1e the ledger read answers', row)
    ok(row.pdfBytes === 91198, '§1f ★ it answers with the NEWEST compile, not the oldest', row)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 195 §2 — the receipts say which moment / question their numbers belong to', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run195b-'))
  try {
    const { call } = await assemble(dir)
    const started = await call('vibe_v5_start', { researcherCount: 2 })
    ok(started.ok !== false, '§2a the institute is seeded', started)
    // 2.5 — the seeding receipt names the chair-turn rail before the first convening fails on it
    has(String(started.chairTurnNote || ''), 'VMU_CHAIR_ACT_NOT_DELEGATED', '§2b ★ start warns about the chair-turn rail')
    has(String(started.chairTurnNote || ''), 'vibe_vmu_turn', '§2c and names the one remedy')
    // 1.3 — a close names the meeting it read the institute-wide tally for
    const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: 'close receipt probe', title: 'close probe' })
    ok(opened.ok !== false, '§2d a meeting opens', opened)
    const mid = String(opened.meeting || opened.id)
    const closed = await call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad' })
    ok(closed.ok !== false, '§2e it closes', closed)
    ok(String(closed.readForMeeting || '') === mid, '§2f ★ the receipt names the meeting the tally was read FOR', closed)
    has(String(closed.readForMeetingMeans || ''), 'INSTITUTE-WIDE', '§2g and says the tally itself has no meeting of its own')
    ok(closed.closureVote && closed.closureVote.meetingId === null, '§2h while closureVote.meetingId stays null by design', closed.closureVote)
    // 2.3 — the evidence gate labels itself when it refuses
    const q = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
    const view = { records: { get: () => null }, verified: () => ({ items: [] }) }
    const refused = q.checkQuality({ md: '## 正文\n\n没有证据的一段。', state: { participants: ['r-1'], parts: { 'r-1': { recordId: 'rec-x', round: 1 } }, round: 1, target: 't' }, view })
    ok(refused.ok === false, '§2i an evidenced part with no evidence is refused', refused)
    ok(refused.gate === 'evidence', '§2j ★ and the refusal names the gate that ran', refused)
    ok(Array.isArray(refused.missing) && refused.missing.length === 0, '§2k missing stays the (empty) unresolved-id list', refused)
    has(String(refused.missingMeans || ''), 'empty ON PURPOSE', '§2l ★ with the sentence that says so')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
