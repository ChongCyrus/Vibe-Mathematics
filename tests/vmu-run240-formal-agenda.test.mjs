#!/usr/bin/env node
/**
 * tests/vmu-run240-formal-agenda.test.mjs — RUN 240-I / FEEDBACK63 ①6: the formal agenda was a name, not a record.
 *
 * WHAT THIS PINS:
 *  §A A BOOLEAN DECLARATION IS A FACT, NOT A DEAD END: `open({formalAgenda:true})` records the declaration
 *     (`formalAgendaDeclared/By/At`) and the read faces say, in words, why the item list is null and what to
 *     do about it (`formalAgendaItemsWhy` / `formalAgendaItemsHint`). A bare null is the bug this suite kills:
 *     whenever `formalAgendaItems === null`, the why AND the hint must be non-empty strings on both faces.
 *  §B AN ARRAY OF ITEMS IS STORED AND READ BACK: `open({formalAgenda:[...]})` keeps each entry as
 *     `{index,id,title,text,kind,addedBy,at}` — order preserved, index is the position in the record,
 *     blank titles dropped, ids default to `fa-<n>`. `summary` and `meetingView` return the SAME rows, and the
 *     open receipt already carries them (no second read needed).
 *  §C SOURCE PINS: the write path lives in `openSeq` (kernel), both read faces spread the same block, and the
 *     pack parameter still exists (the pack-side pass-through is the Lead's line, reported separately).
 *
 * Run: node tests/vmu-run240-formal-agenda.test.mjs   (targeted only)
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 200) : text)

/* ── kernel harness ─────────────────────────────────────────────────────────────────────────────── */
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const mk = (settings = {}) => createMeetings({
  clock: () => 1000,
  settings: rec(Object.assign({}, { 'vmu.meetings.quorumCap': 0 }, settings)),
  log: () => {},
})
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2'], actor: 'acad' }
const open = (t, extra) => t.open(Object.assign({}, MEET, extra))

/* ── §A: a boolean declaration is recorded and explained, never a bare null ─────────────────────── */
console.log('\n§A a boolean declaration is a recorded fact with a named why')
{
  const t = mk()
  const a = open(t, { materials: 'item one; item two', formalAgenda: true })

  ok(a.formalAgendaDeclared === true, 'A1 open({formalAgenda:true}) records the declaration', a.formalAgendaDeclared)
  ok(a.formalAgendaDeclaredBy === 'acad', 'A1b ...and who declared it (actor ?? chair)', a.formalAgendaDeclaredBy)
  ok(a.formalAgendaDeclaredAt === 1000, 'A1c ...and when (the kernel clock)', a.formalAgendaDeclaredAt)
  ok(a.formalAgendaItems === null, 'A2 a boolean carries no items, so the list is null', a.formalAgendaItems)
  has(a.formalAgendaItemsWhy, 'BOOLEAN', 'A3 the null has a named why that says BOOLEAN')
  has(a.formalAgendaItemsWhy, 'cannot carry items', 'A3b ...and says a boolean cannot carry items')
  has(a.formalAgendaItemsHint, 'formalAgenda', 'A4 the null points at the array shape to use')
  ok(typeof a.formalAgendaItemsMeans === 'string' && a.formalAgendaItemsMeans.length > 0, 'A5 the means explains what the list is', a.formalAgendaItemsMeans)

  const s = t.summary({ meeting: a.meeting })
  const v = t.meetingView({ meeting: a.meeting })
  ok(s.formalAgendaDeclared === true && s.formalAgendaDeclaredBy === 'acad', 'A6 summary reports the same declaration', { d: s.formalAgendaDeclared, by: s.formalAgendaDeclaredBy })
  ok(s.formalAgendaItems === null && typeof s.formalAgendaItemsWhy === 'string' && s.formalAgendaItemsWhy.length > 0, 'A7 summary null is never bare: it carries the why', s.formalAgendaItemsWhy)
  ok(typeof s.formalAgendaItemsHint === 'string' && s.formalAgendaItemsHint.length > 0, 'A8 ...and the hint')
  ok(v.formalAgendaItems === s.formalAgendaItems && v.formalAgendaItemsWhy === s.formalAgendaItemsWhy && v.formalAgendaItemsHint === s.formalAgendaItemsHint,
    'A9 status (meetingView) and summary speak with one voice about the declaration', { s: s.formalAgendaItemsWhy, v: v.formalAgendaItemsWhy })
  ok(a.receipt !== null && typeof a.receipt === 'object', 'A10 the open call carries a receipt object', !!a.receipt)
  const r = a.receipt || {}
  ok(r.formalAgendaDeclared === true && r.formalAgendaItems === null && typeof r.formalAgendaItemsWhy === 'string' && r.formalAgendaItemsWhy.length > 0,
    'A11 the open receipt already carries the declaration + why (no second read needed)', { declared: r.formalAgendaDeclared, why: typeof r.formalAgendaItemsWhy })
}

/* ── §B: items are stored as rows and read back identically on both faces ───────────────────────── */
console.log('\n§B an array of items becomes rows, in order, on every face')
{
  const t = mk()
  const input = ['确认命题', { title: '分配复核', kind: 'review', addedBy: 'r-1' }, { text: '   ' }]
  const b = open(t, { materials: '确认命题; 分配复核', formalAgenda: input })

  ok(b.formalAgendaDeclared === true, 'B1 the array also records the declaration flag', b.formalAgendaDeclared)
  ok(Array.isArray(b.formalAgendaItems) && b.formalAgendaItems.length === 2, 'B2 blank titles are dropped (3 in, 2 rows)', b.formalAgendaItems && b.formalAgendaItems.length)
  const rows = b.formalAgendaItems || []
  ok(rows[0] && rows[0].id === 'fa-1' && rows[0].title === '确认命题' && rows[0].kind === 'item', 'B3 a plain string entry becomes {id:fa-1,title,kind:item}', rows[0])
  ok(rows[1] && rows[1].id === 'fa-2' && rows[1].title === '分配复核' && rows[1].kind === 'review' && rows[1].addedBy === 'r-1',
    'B4 an object entry keeps its own title/kind/addedBy', rows[1])
  ok(rows[0] && rows[0].index === 0 && rows[1] && rows[1].index === 1, 'B5 index is the position in the record', rows.map((x) => x && x.index))
  ok(rows[0] && rows[0].at === 1000 && rows[1] && rows[1].at === 1000, 'B6 at defaults to the kernel clock', rows.map((x) => x && x.at))
  ok(b.formalAgendaItemsWhy === null && b.formalAgendaItemsHint === null, 'B7 rows present => no why/hint (nothing is missing)', { why: b.formalAgendaItemsWhy, hint: b.formalAgendaItemsHint })
  ok(b.formalAgendaItemsCount === 2, 'B8 the count matches the rows', b.formalAgendaItemsCount)

  const s = t.summary({ meeting: b.meeting })
  const v = t.meetingView({ meeting: b.meeting })
  ok(JSON.stringify(s.formalAgendaItems) === JSON.stringify(rows), 'B9 summary reads the same rows', s.formalAgendaItems)
  ok(JSON.stringify(v.formalAgendaItems) === JSON.stringify(rows), 'B10 meetingView reads the same rows', v.formalAgendaItems)
  ok(s.formalAgendaItemsMeans !== null && typeof s.formalAgendaItemsMeans === 'string', 'B11 the means survives with rows present', s.formalAgendaItemsMeans)
  has(s.formalAgendaItemsMeans, 'by id', 'B12 ...and tells the reader items can be pointed at by id')
}

/* ── §B2: spellings and plain meetings ─────────────────────────────────────────────────────────── */
console.log('\n§B2 the two spellings agree, and a plain meeting still explains its null')
{
  const t = mk()
  const c = open(t, { materials: 'one; two', formal_agenda: ['甲', '乙'] })
  ok(Array.isArray(c.formalAgendaItems) && c.formalAgendaItems.length === 2, 'B13 formal_agenda (snake case) is the same shape as formalAgenda', c.formalAgendaItems && c.formalAgendaItems.length)
  const s = t.summary({ meeting: c.meeting })
  ok(Array.isArray(s.formalAgendaItems) && s.formalAgendaItems[0].title === '甲', 'B14 ...and it is read back through summary', s.formalAgendaItems)

  const p = open(t, { materials: 'only text' })
  const ps = t.summary({ meeting: p.meeting })
  ok(ps.formalAgendaDeclared === false, 'B15 a plain meeting is not declared formal', ps.formalAgendaDeclared)
  ok(ps.formalAgendaItems === null, 'B16 its item list is null', ps.formalAgendaItems)
  ok(typeof ps.formalAgendaItemsWhy === 'string' && ps.formalAgendaItemsWhy.length > 0, 'B17 ...but the null is explained', ps.formalAgendaItemsWhy)
  has(ps.formalAgendaItemsMeans, 'BOOLEAN', 'B18 the means still says formal_agenda is a BOOLEAN (run239 pin)')
  has(ps.formalAgendaItemsMeans, 'NOT an empty agenda', 'B19 ...and that null is not an empty agenda (run239 pin)')

  let refused = null
  try { open(t, { formalAgenda: 'yes' }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_INVALID_ARGUMENT', 'B20 a shape that is neither boolean nor array is refused by name', refused && refused.code)
  has(refused && String(refused.hint || ''), 'formalAgenda', 'B21 ...and the hint names the two accepted shapes')
}

/* ── §C: source pins — the write is in openSeq and both faces spread one block ─────────────────── */
console.log('\n§C source pins')
{
  const meetingsSrc = await readFile(join(ROOT, 'vibe-math-vmu/kernel/meetings.js'), 'utf8')
  const toolsSrc = await readFile(join(ROOT, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')

  has(meetingsSrc, 'formalAgendaDeclared: formalAgendaDecl', 'C1 openSeq writes the declaration onto the meeting row')
  has(meetingsSrc, 'formalAgenda: formalAgendaRef', 'C2 openSeq writes the normalized item array')
  has(meetingsSrc, '...formalAgendaOf(m)', 'C3 the formal-agenda projection is a function, not an inline literal')
  ok((meetingsSrc.match(/\.\.\.agendaBlockOf\(m\)/g) || []).length === 2, 'C4 both read faces spread the SAME agenda block (summary + meetingView)', (meetingsSrc.match(/\.\.\.agendaBlockOf\(m\)/g) || []).length)
  has(meetingsSrc, 'const agendaBlockOf = (m)', 'C5 the block keeps its single definition (run239 source pin)')
  ok(meetingsSrc.includes('formalAgenda = undefined') && meetingsSrc.includes('formal_agenda = undefined'), 'C6 openSeq accepts both spellings as input', true)
  // RUN 240-I wiring (Lead, packs/v5r/tools.js): the face must PASS THE ARGUMENT INTO the kernel. The old line asserted
  // the boolean echo (`args.formal_agenda === true`) — that echo was the defect, not the contract: it told the caller a
  // boolean the stored meeting never carried.
  has(toolsSrc, 'const formalAgendaParam = args.formal_agenda === undefined ? null : args.formal_agenda', 'C7a the face reads the argument as a passthrough (boolean or list), not as a boolean echo')
  has(toolsSrc, '...(formalAgendaParam === null ? {} : { formalAgenda: formalAgendaParam })', 'C7b the passthrough reaches kernel.meetings.open')
  has(toolsSrc, 'formalAgendaItemsWhy: opened.formalAgendaItemsWhy', 'C7c the convening receipt returns the READ faces fields (items + why + hint)')
  has(toolsSrc, "formal_agenda: { type: ['boolean', 'array'], items: { type: ['string', 'object'] }", 'C7d the schema can SAY a list (a boolean-only parameter cannot carry the agenda it claims)')
}

console.log('\n' + '─'.repeat(62))
console.log('RUN 240 formal agenda: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('RESULT: PASS')
}
