// RUN 204 — run 42 / FEEDBACK41: six readings that answered a narrower question than the caller asked.
//
// 1.1  a ballot vote into a meeting that was not seated was ACCEPTED and its tally grew, while `serviceVote.ok:false`
//      said the votes were not counted — two facts, one receipt, no top-level `counted`.
// 1.2  `agenda: {…}` was stringified to "[object Object]" and stored as the agenda; only the empty string was refused.
// 1.4  `vibe_v5_verdict_final` prints `ballotId: "tally-<meeting>-<card>"` and the p=1 gate looked that name up on the
//      BALLOT face, where a tally (a name derived from meeting + card, stored nowhere) cannot exist.
// 1.6  `requiredLineTruncated:false` beside a 73-character title read as "the measurement did not happen"; the 48-char
//      cap only applies to a name DERIVED from the claim, and the receipt never said so.
// 2.2  an enum refusal said "declared as enum" and withheld the legal values (off | required).
// 2.4  the acceptance criterion quotes "每回合三问", and no prompt block carried that phrase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { checkQuality, verifiedRequirements, QUALITY_CODES } from '../vibe-math-vmu/packs/v5r/paper-quality.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const MEETING = read('vibe-math-vmu/tools/meeting.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const QUAL = read('vibe-math-vmu/packs/v5r/paper-quality.js')
const SCHEMA = read('vibe-math-vmu/settings/schema.js')
const BLOCKS = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const blockOf = (r, key) => (r && r[key]) || r

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
  return { call, handle }
}
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run204-'))

test('RUN 204 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(MEETING, 'countedMeans', '§0a ★★ a ballot vote receipt says whether the vote was COUNTED')
  has(TOOLS, 'voteFloor', '§0b ★★ the p=1 refusal reads the floor before it blames the voters')
  has(TOOLS, 'quorum && resolution.quorum.met === false', '§0c ★ and only when the floor is actually short')
  has(TOOLS, 'let agendaText', '§0d ★★ a structured agenda is validated before it is stringified')
  has(TOOLS, 'agendaText,', '§0e ★ and the validated text (not the raw argument) is what the meeting stores')
  has(TOOLS, 'const tallyId = word(raw.tallyId)', '§0f ★★ a tally id is a name of its own, not a ballot box')
  has(TOOLS, 'the name can be re-derived', '§0g ★ and the refusal says how to re-derive it')
  has(QUAL, 'requiredLineCapApplies', '§0h ★★ the truncation reading says whether the cap APPLIES at all')
  has(QUAL, 'NO: the cap applies ONLY to a name DERIVED from the claim',
    '§0i ★ and the negative case says there is nothing to look for')
  has(SCHEMA, 'the LEGAL VALUES are', '§0j ★★ an enum refusal prints the legal values')
  ok((BLOCKS.match(/\*\*每回合三问\*\*/g) || []).length === 3,
    '§0k ★★ all three seats carry the acceptance criterion\'s own phrase (每回合三问)',
    (BLOCKS.match(/\*\*每回合三问\*\*/g) || []).length)
})

test('RUN 204 §1 — an enum refusal prints the values it will accept', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    const bad = await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'sometimes', why: 'run204 enum probe' })
    ok(bad.ok === false, '§1a premise: a value outside the domain is refused', bad)
    const hint = String(bad.hint || '') + ' ' + String(bad.message || '')
    has(hint, 'the LEGAL VALUES are', '§1b ★★ the refusal prints the legal values instead of naming the rule only')
    has(hint, 'off', '§1c ★ and one of them is off')
    has(hint, 'required', '§1d ★ and the other is required')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 204 §2 — a structured agenda is refused by name, and a list is stored as text', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
      await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    }
    const card1 = await call('vibe_v5_record_proposition', {
      statement: 'run204 议程命题 一', value: 1, motive: '测试', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/run204-agenda.md#证明', proof_state: 'complete',
    })
    ok(card1.ok === true, 'premise: a card exists to debate', card1)
    const bad = await call('vibe_v5_meeting', {
      member: 'r-acad', type: 'debate', subject: card1.recordId, agenda: { 议题: '一' }, title: 'run204 结构议程',
    })
    ok(bad.ok === false, '§2a ★★ an object agenda is refused (it used to be stored as "[object Object]")', bad)
    ok(String(bad.code || '') === 'VMU_INVALID_ARGUMENT', '§2b ★ by name', bad)
    has(String(bad.message || ''), 'not a purpose', '§2c ★★ and the message says what it would have become')
    has(String(bad.hint || ''), 'An ARRAY is accepted only as a list of NON-EMPTY strings', '§2d ★ the hint names the accepted shape')
    const good = await call('vibe_v5_meeting', {
      member: 'r-acad', type: 'debate', subject: card1.recordId, agenda: ['议题一', '议题二'], title: 'run204 列表议程',
    })
    ok(good.ok === true, '§2d a LIST agenda is accepted', good)
    const agendaText = String(blockOf(good, 'meeting').agenda || (good.agenda || ''))
    has(agendaText, '议题一', '§2e ★ the stored agenda carries the first item')
    has(agendaText, '议题二', '§2f ★ and the second')
    ok(!/\[object Object\]/.test(agendaText), '§2g ★★ and never the stringified object', agendaText)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 204 §3 — the truncation reading says whether the cap applies, in both readers', () => {
  // (a) a name that IS the sentence and ends with the cap marker: the cap applied, and the reader says so.
  const capped = '已验证｜' + 'a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 的和是一…'
  const rows = {
    'rec-v1': { id: 'rec-v1', track: 'verified', fingerprint: 'f1' },
    'p-long': { id: 'p-long', track: 'proposition', body: '- statement：a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 的和是一个定值。' },
    'rec-p1': { id: 'rec-p1', track: 'state', body: JSON.stringify({ evidence: ['rec-v1'] }) },
  }
  const records = { get: ({ id }) => rows[String(id)] || null }
  const viewCapped = {
    records,
    verified: () => ({ items: [{ id: 'rec-v1', cardId: 'p-long', title: capped }] }),
    subproblems: () => ({ items: [] }),
  }
  const reading = verifiedRequirements({ view: viewCapped })
  ok(reading.ok === true && reading.count === 1, '§3a premise: the read face answers', reading)
  const item = reading.items[0]
  ok(item.requiredLineTruncated === true, '§3b premise: this name is a ceiling', item)
  ok(item.requiredLineCapApplies === true, '§3c ★★ the read face says the cap APPLIED', item)
  has(item.requiredLineCapAppliesWhy, 'DERIVED from the claim', '§3d ★ and why')

  // (b) an EXPLICIT title that is long and complete: nothing was capped, and the negative case says that is the answer
  //     to a narrower question — which is exactly the reading run 42 could not get.
  const explicit = 'run42 的一个显式标题，长度超过四十八个字符，但它是人写的而不是从结论派生的整句标题，因此没有被截断'
  const viewExplicit = {
    records,
    verified: () => ({ items: [{ id: 'rec-v2', cardId: 'p-explicit', title: explicit }] }),
    subproblems: () => ({ items: [] }),
  }
  const read2 = verifiedRequirements({ view: viewExplicit })
  const item2 = read2.items[0]
  ok(item2.requiredLineTruncated === false, '§3e premise: an explicit title is not capped', item2)
  ok(item2.requiredLineCapApplies === false, '§3f ★★ and the reading says the cap did not apply — not "nothing measured"', item2)
  has(item2.requiredLineCapAppliesWhy, 'NO: the cap applies ONLY to a name DERIVED from the claim', '§3g ★★ in words')

  // (c) the AUTHOR-side reader carries the same field for the same row.
  const state = { parts: { 'r-1': { recordId: 'rec-p1' } } }
  const out = checkQuality({ md: '正文：本论文由 r-1 撰写，证据 rec-v1。', state, view: viewCapped })
  ok(out.ok === false && out.code === QUALITY_CODES.VERIFIED_MISSING, '§3h premise: the author-side gate refuses', out)
  const missing = (out.missing || [])[0] || {}
  ok(missing.requiredLineCapApplies === true, '§3i ★★ the author-side row says the cap applied', missing)
  has(missing.requiredLineCapAppliesWhy, 'DERIVED from the claim', '§3j ★ and why')
})

test('RUN 204 §4 — a tally id is re-derived, not looked up as a ballot box', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member']]) {
      await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    }
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run204 tally 命题：a+0=a', value: 1, motive: '加法单位元', p: 0.9, member: 'r-1',
    })
    ok(card.ok === true, 'premise: a pending card exists', card)
    const refused = await call('vibe_v5_record_proposition', {
      id: card.recordId, statement: 'run204 tally 命题：a+0=a', value: 1, motive: '加法单位元', p: 1, member: 'r-1',
      debate_ruling: { subject: card.recordId, value: 1, mode: 'unanimous', n: 3, decided: true, ballotId: 'tally-m9-run204-tally' },
    })
    ok(refused.ok === false, '§4a ★★ a tally id alone is refused (it cannot be re-derived without its meeting)', refused)
    const text = String(refused.message || '') + ' ' + String(refused.hint || '')
    has(text, 'tally', '§4b ★ and the refusal names the tally id as a tally id')
    ok(!/no ballot box|box id/i.test(text) || /tally/.test(text),
      '§4c ★★ the refusal does not pretend the name was a ballot box', text)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
