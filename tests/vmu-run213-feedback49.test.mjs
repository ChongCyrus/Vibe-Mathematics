// RUN 213 — run 50 / FEEDBACK49: four facts that were one layer down, and one sentence that repeated itself.
//
// 1.1 the kernel computed `notice.provenance` (who typed the verdicts) but the receipt reduced the notice to its text.
// 1.2 one receipt carried two different `note`s (delivery vs verdict) with no way to tell which question each answers.
// 1.4 the tool writes `## 共同设计补充｜<member>` itself, and a member repeating that heading produced it twice, silently.
// 1.3 `executed:0` on a turn receipt was read as "the member did nothing"; the receipt now says where its work IS readable.
// 1.5 a member kernel cannot inherit `vmu.turn.leaderId`; the ceiling is named on the seeding receipt.
// 2.2 `correction.call` printed `at: "<ISO time>"` — a placeholder in the one call the reader is told to copy verbatim.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const BP = read('vibe-math-vmu/packs/v5r/blueprint.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run213-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464779000, packs: ['v5r'], root: dir })
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
const blockOf = (r, key) => (r && r[key]) || r

test('RUN 213 §0 — the source carries the five readings (pins)', async () => {
  has(TOOLS, 'noticeProvenance: ruled.notice && ruled.notice.provenance', '§0a ★★★ the notice provenance is printed, not only spoken')
  has(TOOLS, 'noticeProvenanceMeans:', '§0b ★ and explained')
  has(TOOLS, 'this top-level `note` is the DELIVERY note', '§0c ★★★ the two `note`s are told apart')
  has(TOOLS, 'noteMeans:', '§0d ★')
  has(TOOLS, 'const leaderIdMeans =', '§0e ★★ the leaderId ceiling has a sentence')
  has(TOOLS, 'PER-KERNEL setting', '§0f ★ and names the scope')
  has(BP, 'export function stripRepeatedCodesignHeading(text) {', '§0g ★★★ a repeated co-design heading has its own implementation')
  has(BP, 'stripRepeatedCodesignHeading(txt(section && section.text)).text', '§0h ★ and the composer calls it')
  has(BP, 'headingDroppedMeans', '§0i ★★ the drop is REPORTED, not silent')
  has(TURN, 'memberActsMeans:', '§0j ★★★ the turn receipt says where a member\'s work is readable')
  has(TURN, 'vibe_vmu_chat', '§0k ★ naming the faces')
  has(TOOLS, 'at: "\' + new Date().toISOString() + \'"', '§0l ★★★ the printed call carries a REAL timestamp')
  ok(!TOOLS.includes('at: \\"<ISO time>\\"') && !TOOLS.includes('at: "<ISO time>"'), '§0m ★★ the placeholder is gone from the printed call')
  has(TOOLS, 'is optional: omit it and the write uses the current time', '§0n ★ and callMeans says it is optional')
})

test('RUN 213 §1 — the verdict receipt carries WHO TYPED the numbers, and says which note is which', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    const started = await call('vibe_v5_start', { problem: 'RUN 213 复验', researcherCount: 2 })
    ok(started.ok === true, '§1a premise: founded', started)
    has(started.leaderIdMeans, 'PER-KERNEL', '§1b ★★ the seeding receipt names the leaderId ceiling')
    has(started.leaderIdMeans, 'chair SEAT', '§1c ★ and the fallback that makes it harmless')
    const card = await call('vibe_v5_record_proposition', {
      statement: '形如 n²+1 的素数有无穷多个', value: '对 n≥1 成立', motive: 'RUN 213 §1', p: 0.5, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/run213.md', proof_state: 'complete',
    })
    ok(card.ok === true, '§1d premise: the card', card)
    const mid = String(card.recordId)
    const met = await call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题', '分配复核'], title: 'RUN 213 会', type: 'debate', subject: mid, formal_agenda: true })
    ok(met.ok === true, '§1e premise: the meeting', met)
    const meetingId = String(met.meeting)
    for (const seat of ['r-acad', 'r-1', 'r-2']) {
      const att = await call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: seat })
      ok(att.ok === true, '§1f premise: attendance by ' + seat, att)
    }
    // two verdicts with the SAME estimate, both typed by the chair: the provenance question is the whole point
    const vf = await call('vibe_v5_verdict_final', {
      meeting: meetingId, proposition_id: mid,
      verdicts: [{ member: 'r-1', p: 0.6, reason: '归纳法估计' }, { member: 'r-2', p: 0.6, reason: '按可证幅度估计' }],
    })
    ok(vf.ok === true, '§1g premise: the ruling', vf)
    ok(vf.noticeProvenance && vf.noticeProvenance.typed === 2 && vf.noticeProvenance.submitted === 0,
      '§1h ★★★ the receipt counts the chair-typed verdicts (it used to only say it in prose)', vf.noticeProvenance)
    has(vf.noticeProvenanceMeans, 'typed', '§1i ★ the counts are explained')
    ok(vf.noticeProvenanceMeans.indexOf('submitted') !== -1, '§1j ★ both halves of the pair are named', vf.noticeProvenanceMeans)
    has(vf.notice, '主席代为记录', '§1k ★★ and the sentence (still) says so')
    has(vf.noteMeans, 'DELIVERY note', '§1l ★★★ the top-level note is named as the delivery note')
    has(vf.noteMeans, 'tally.note', '§1m ★★ and points at where the verdict\'s own note lives')
    const tally = blockOf(vf, 'tally')
    ok(tally && typeof tally.note === 'string' && tally.note.indexOf('SAME value') !== -1,
      '§1n ★ the verdict note still explains the agreement (one word, two questions)', tally && tally.note)
    ok(tally && tally.agreed === true, '§1o the agreement reading is unchanged (RUN 212)', tally && tally.agreed)
    // §5 (2.2): the printed correction call carries a REAL ISO timestamp, not a placeholder
    const correction = blockOf(vf, 'correction')
    const printed = String((correction && correction.call) || '')
    ok(/at: "\d{4}-\d\d-\d\dT/.test(printed), '§1p ★★★ the call the reader is told to copy carries a real ISO time', printed)
    ok(printed.indexOf('<ISO time>') === -1, '§1q ★★ the placeholder is gone', printed)
    has(correction && correction.callMeans, 'omit it', '§1r ★ and the receipt says `at` may be omitted')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 213 §2 — a repeated co-design heading is dropped, and the receipt says it happened', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: '蓝图标题复验', researcherCount: 2 })).ok === true, 'premise: founded')
    // the member repeats the heading the tool owns
    const prop = await call('vibe_v5_blueprint', {
      action: 'propose', path: 'p-213', member: 'r-1',
      text: '## 共同设计补充｜r-1\n- 节点 1：把命题拆成归纳基与归纳步\n- 节点 2：核验可证幅度',
    })
    ok(prop.ok === true, '§2a premise: the draft is written', prop)
    ok(prop.headingDropped === 1, '§2b ★★★ the repeated heading is counted, not silently stored', prop.headingDropped)
    has(prop.headingDroppedMeans, 'THIS TOOL writes that heading itself', '§2c ★★ and the receipt says who owns the heading')
    const readBack = await call('vibe_v5_blueprint', { action: 'read', id: String(prop.id) })
    const baseText = String((readBack && readBack.text) || '')
    ok(baseText.split('## 共同设计补充｜').length - 1 === 0,
      '§2d ★★ the first proposer edits the BASE, so no heading is written for it: the one it passed was dropped, not stored', baseText)
    has(baseText, '节点 1', '§2e ★ the member\'s own prose survived the normalization')
    // a CO-DESIGNER that repeats the heading: the tool writes one, so the stored body must carry exactly one
    const second = await call('vibe_v5_blueprint', {
      action: 'propose', path: 'p-213', member: 'r-2',
      text: '## 共同设计补充｜r-2\n- 节点 3：把归纳步写成可核验的等式链',
    })
    ok(second.ok === true, '§2f premise: the second author continues the draft', second)
    ok(second.headingDropped === 1, '§2g ★★ the co-designer\'s repeated heading is counted', second.headingDropped)
    const after = await call('vibe_v5_blueprint', { action: 'read', id: String(prop.id) })
    const body = String((after && after.text) || '')
    ok(body.split('## 共同设计补充｜r-2').length - 1 === 1,
      '§2h ★★★ the stored body carries the co-design heading ONCE (run 50 stored it twice)', body)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 213 §3 — a turn receipt says where the member\'s real work is readable', async () => {
  const root = tmp()
  try {
    const host = { deliverTurn: async () => 'this reply has no fence at all' }
    const kernel = createKernel({ settings: {}, root, host })
    const out = await kernel.turn.drive({ members: ['r-1'], rounds: 1 })
    const r = (out.receipts || [])[0]
    ok(r && r.failed === true, '§3a premise: the round failed (unknown reply shape)', r)
    has(out.memberActsMeans, 'executed:0', '§3b ★★★ the batch receipt says what executed:0 does NOT mean')
    has(out.memberActsMeans, 'vibe_vmu_chat', '§3c ★ and names one face where the work IS')
    has(out.memberActsMeans, 'vibe_v5_read_library', '§3d ★ and another')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
