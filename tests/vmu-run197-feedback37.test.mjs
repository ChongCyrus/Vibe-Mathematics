// RUN 197 — run 38 / FEEDBACK37: the record body that could not carry words, and three receipts that described
// a different moment than the one they answered.
//
// 1.1  `minutes()` said "this is the RECORD BODY (what was said, voted and refused)" and its speech entries had NO
//      `text` — the one thing a minutes entry exists to carry. `speak()` had the words in hand and dropped them unless
//      `verbatim:true` routed them to the OTHER record (the transcript).
// 1.2  `minutes` on a PRIMITIVE meeting was refused with `VMU_INVALID_ARGUMENT` — an argument error — although the call
//      was well formed: the boundary is between two REGISTRIES.
// 1.3  `advance`'s two DISAGREEMENT branches carried `refusers` with no `refusersMeans`/`unanimous`, while the
//      unanimous branch's own note claimed they did.
// 1.4  `part` accepted an empty `evidence` list while `evidence.means` claimed the gate "also requires >=1 per part".
// 1.5  The `part` refusals carried code+message+hint only — `gate`/`nextGate`/`missing`/`missingMeans` existed on the
//      SAME gate at render. (A thrown error cannot carry them: the host keeps only the four keys.)
// 1.6  Writing a `part` on a FINALIZED paper answered "the paper is in REVIEW … advance", advice with no reachable move.
// 1.7  An ARCHIVED meeting answered `archivable:false` beside `archived:true`.
// 2.2  `verbatim` with capture ENABLED and zero lines carried no `note`, so `count:0` read as "capture is broken".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const MEETINGS = read('vibe-math-vmu/kernel/meetings.js')
const MEETING_TOOL = read('vibe-math-vmu/tools/meeting.js')
const PAPER = read('vibe-math-vmu/kit/paper.js')
const QUALITY = read('vibe-math-vmu/packs/v5r/paper-quality.js')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const HELPERS = read('vibe-math-vmu/kit/handlers.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

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

test('RUN 197 §0 — every repair is on the source it belongs to (source pins)', () => {
  // 1.1 the words are recorded on the entry
  has(MEETINGS, 'text: said, textBytes: byteLen(said)', '§0a ★ a speech entry carries the words it was given')
  has(MEETINGS, 'textDroppedBytes', '§0b ★ and the truncation is COUNTED, not silent')
  has(MEETINGS, "vmu.minutes.verbatimCapBytes", '§0c the bound is the DECLARED setting, not a new number')
  has(MEETINGS, 'RUN 197 (run 38 / FEEDBACK37 1.1', '§0d the repair names the measurement it answers')
  // 1.7 archived vs archivable
  has(MEETINGS, 'archived: isArchived', '§0e ★ an archived meeting says it is archived')
  has(MEETINGS, 'archivedMeans', '§0f and says why the candidate flag is not printed beside it')
  // 2.2 the transcript's note exists in BOTH branches
  has(MEETINGS, 'capture is ENABLED (vmu.meetings.verbatimEnabled) but this meeting recorded NO verbatim line',
    '§0g ★ enabled + zero lines is explained, not left as a bare count')
  // 1.2 boundary, not argument
  has(MEETING_TOOL, 'refused(\'VMU_REGISTRY_BOUNDARY\',', '§0h ★ a registry boundary is named as one')
  has(MEETING_TOOL, 'reads the MEETINGS SERVICE record body; ', '§0i and answers the same request as before')
  // 1.3 both disagreement branches
  // ★ RUN 199 rewrote this sentence (the list now names ONLY real refusals, with stale/notYetReviewed beside it), so this
  // pin follows the sentence that carries the claim — the claim is "a non-empty refusers list says what it means".
  has(PAPER, "refusersMeans: refusers.length === 0",
    '§0j ★ the writing branch picks its sentence by what the list actually holds (RUN 199 split the three facts)')
  has(PAPER, "so this round did NOT reach unanimity and the paper goes back to writing",
    '§0j2 ★ and the non-empty refusers sentence says what a dissent does to the paper')
  has(PAPER, "refusersMeans: 'NOT empty: the reviews did not reach deliverable",
    '§0k ★ the capped branch says it too (same field, same shape)')
  ok((PAPER.split('unanimous: false, refusers').length - 1) === 2, '§0l both disagreement branches state unanimous:false', PAPER.split('unanimous: false, refusers').length - 1)
  // 1.6 finalized is not "in review"
  has(PAPER, 'the paper is FINALIZED: no part can be written into it any more',
    '§0m ★ a delivered paper is not told to "advance"')
  // 1.4 the sentence stops claiming a requirement this face does not enforce
  has(QUALITY, 'requires NOTHING', '§0n ★ the pointer check says it requires nothing')
  // 1.5 same vocabulary on the same gate, both places
  has(QUALITY, "gate: 'citation',", '§0o the render citation verdict names its gate')
  has(QUALITY, "nextGate: 'evidence',", '§0p and the gate after it')
  has(PACK, "refusalReceipt('VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING'", '§0q ★ the part refusal is returned as DATA')
  has(PACK, "refusalReceipt('VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN'", '§0r and so is the citation one')
  has(PACK, "gate: 'evidence',", '§0s the part evidence refusal names its gate')
  has(PACK, "nextGate: 'required-line',", '§0t and the next one')
  has(PACK, 'evidenceGate: {', '§0u ★ the SUCCESS receipt says which face requires what')
  has(HELPERS, 'refuse, refusalReceipt, settingsOf', '§0v the data-shaped refusal builder is exported (a thrown error loses extras)')
})

test('RUN 197 §1 — minutes carry what was SAID, and the transcript explains an empty capture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run197a-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '记录正文要能读出原话', title: 'run197 body' })
    ok(opened.ok !== false, '§1a the meeting opens', opened)
    const mid = String(opened.meeting || opened.id)
    await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-1' })
    const WORDS = '本席认为该命题的归纳步需要单独引理，且第二步不可交换'
    const said = await call('vibe_v5_say', { meeting: mid, member: 'r-1', text: WORDS })
    ok(said.ok !== false, '§1b a member speaks', said)
    const minutes = await call('vibe_vmu_meeting', { action: 'minutes', id: mid })
    const speech = (minutes.entries || []).filter((e) => e && e.kind === 'speech' && e.member === 'r-1')[0]
    ok(!!speech, '§1c the speech entry is on the record body', minutes.entries)
    ok(speech.text === WORDS, '§1d ★ the entry carries the WORDS (RUN 197 1.1)', { text: speech.text })
    ok(speech.textBytes > 0 && speech.textDroppedBytes === 0, '§1e with a byte count and nothing dropped at this size', speech)
    ok(speech.textCapBytes > 0, '§1f the bound it was measured against is on the entry', speech)
    ok(minutes.archived === false, '§1g a live meeting is NOT archived', minutes.archived)
    ok(minutes.archivable !== undefined && typeof minutes.archivableMeans === 'string',
      '§1h and a live one does answer the candidate flag, with its meaning', { archivable: minutes.archivable })
    const verbatim = await call('vibe_vmu_meeting', { action: 'verbatim', id: mid })
    ok(verbatim.ok !== false, '§1i the transcript face answers', verbatim)
    ok(typeof verbatim.note === 'string' && verbatim.note.length > 0,
      '§1j ★ the transcript ALWAYS says what it holds or why it is empty (RUN 197 2.2)', verbatim)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 197 §2 — a CLOSED meeting says archived, and stops answering a live-only flag', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run197b-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '关会后读数要自洽', title: 'run197 closed' })
    const mid = String(opened.meeting || opened.id)
    await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-1' })
    await call('vibe_v5_say', { meeting: mid, member: 'r-1', text: '关会前的原话要留下来' })
    const closed = await call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'probe' })
    ok(closed.ok !== false, '§2a the meeting closes', closed)
    const after = await call('vibe_vmu_meeting', { action: 'minutes', id: mid })
    ok(after.ok !== false, '§2b ★ an archived meeting still answers its minutes', after)
    ok(after.archived === true, '§2c and says it is ARCHIVED (RUN 197 1.7)', after.archived)
    ok(!('archivable' in after), '§2d ★ the live-only candidate flag is NOT printed beside the fact (the contradiction run 38 read)', 'archivable' in after)
    ok(typeof after.archivedMeans === 'string' && after.archivedMeans.includes('FROZEN'),
      '§2e and says what that means for the record', after.archivedMeans)
    const speech = (after.entries || []).filter((e) => e && e.kind === 'speech')[0]
    ok(speech && speech.text === '关会前的原话要留下来', '§2f ★ the words survive the close', speech)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 197 §3 — a PRIMITIVE meeting\'s record body is a REGISTRY BOUNDARY, not an argument error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run197c-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    await call('vibe_vmu_meeting', { action: 'open', id: 'prim-197', roster: ['r-acad', 'r-1', 'r-2'] })
    const got = await call('vibe_vmu_meeting', { action: 'minutes', id: 'prim-197' })
    ok(got.ok === false, '§3a the read is still a NAMED refusal', got)
    ok(got.code === 'VMU_REGISTRY_BOUNDARY', '§3b ★ the code names the boundary (RUN 197 1.2), not a typo in the call', got.code)
    ok(String(got.hint || '').includes('action: "summary"'), '§3c and points at the face that does hold the record', got.hint)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 197 §4 — the `part` refusal carries the gate fields, and the success receipt says when the gate runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run197d-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-acad', 'r-1'], target: 'run197-paper', title: '门禁字段' })
    ok(started.ok !== false, '§4a the paper starts', started)
    const TARGET = 'run197-paper'
    // a pointer that names no record ⇒ the EVIDENCE gate (1.5)
    const refusedPart = await call('vibe_v5_paper', {
      action: 'part', target: TARGET, member: 'r-1', part: '第一节', body: '正文',
      evidence: ['Members/r-1/Propos/p-run197-nosuch.md'],
    })
    ok(refusedPart.ok === false, '§4b an unresolvable pointer is refused', refusedPart)
    ok(refusedPart.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', '§4c with the evidence code', refusedPart.code)
    ok(refusedPart.gate === 'evidence', '§4d ★ the refusal says WHICH gate ran (RUN 197 1.5)', refusedPart.gate)
    ok(refusedPart.nextGate === 'required-line', '§4e and which one follows', refusedPart.nextGate)
    ok(Array.isArray(refusedPart.missing) && refusedPart.missing.length === 1,
      '§4f with the machine-readable list of the pointers that did not resolve', refusedPart.missing)
    ok(typeof refusedPart.missingMeans === 'string' && refusedPart.missingMeans.includes('EVIDENCE pointer'),
      '§4g and a sentence saying what that list means', refusedPart.missingMeans)
    // a REAL record, cited by its file-card path ⇒ the same gate passes, and the success receipt states the deferral
    const card = await call('vibe_v5_record_proposition', { id: 'p-run197', title: '引理', statement: 'A 成立', value: 1, motive: 'run197', p: 0.5 })
    ok(card.ok !== false, '§4h the proposition is recorded', card)
    const part = await call('vibe_v5_paper', {
      action: 'part', target: TARGET, member: 'r-1', part: '第一节', body: '正文',
      evidence: ['Members/r-1/Propos/p-run197.md'],
    })
    ok(part.ok !== false, '§4i ★ a resolvable pointer is accepted', part)
    ok(part.evidenceGate && part.evidenceGate.gate === 'evidence', '§4j the receipt names the gate that owns the requirement', part.evidenceGate)
    ok(part.evidenceGate.requiredAt === 'render/final', '§4k ★ and WHEN it runs (RUN 197 1.4: this face requires nothing)', part.evidenceGate)
    ok(part.evidenceGate.satisfiedNow === true, '§4l and that this part is already covered', part.evidenceGate)
    ok(part.evidence && part.evidence.provided === 1, '§4m the pointer count is unchanged', part.evidence)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
