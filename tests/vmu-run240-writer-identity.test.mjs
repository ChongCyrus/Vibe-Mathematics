// tests/vmu-run240-writer-identity.test.mjs — RUN 240 H: the records face carried ONE name for TWO facts.
//
// MEASURED in live run 63 (`FEEDBACK63.md` ①1 + ①10): r-acad corrected a proposition card that r-1 had authored
// (`bodyMode:"merge"`). The write receipt came back with `fieldsReplaced:["body","by"]` and NO `writer` at all — the
// only trace that authorship had moved was the word "by" inside a field list. The follow-up `vibe_vmu_records
// {action:"expand"}` then read the card back as `owner:"r-1", writer:"r-1"`: the correction was reported, the corrector
// was not. And nowhere in the library did one sentence say what `owner`, `writer` and `by` each mean.
//
// This suite pins the three repairs, at the three layers the defect lived in:
//   §0 the SOURCE (a silent revert is red here, not only in behaviour);
//   §1 the WRITE receipt: owner / writer / by, each with its own definition (also on create);
//   §2 the READ faces: `expand` (get) and `list` — the writer is a word on both;
//   §3 the CARD face (vibe_v5_record_proposition), which is the face run 63 actually read;
//   §4 the DURABLE fold, where the two facts used to be flattened into one on the way to disk: a SECOND kernel over the
//      same workspace must still read r-acad as the writer (this is the exact ①10 path);
//   §5 `supersede`, which moved the revision but never the writer.
//
// RULE E: every loop / every() is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const REC_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
const IDX_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
const HAND_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const has = (text, needle, label) => ok(typeof text === 'string' && text.indexOf(needle) !== -1, label, { needle })
const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const allDefined = (obj, keys) => ok(keys.length > 0, 'the key list is not empty (otherwise every() checks nothing)', keys) && ok(keys.every((k) => str(obj && obj[k]) !== null), '…and each of them is ONE sentence, not null',
  { missing: keys.filter((k) => str(obj && obj[k]) === null) })

const entry = await import(pathToFileURL(ENTRY).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join('D:/_tmp', 'vmu-run240-')); roots.push(d); return d }

const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.find((s) => s && s.name === name) || null
  const call = async (name, args = {}, exec = undefined) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
    try {
      const raw = await spec.execute(args, { kernel: handle.kernel, exec })
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
  }
  return { handle, kernel: handle.kernel, records: handle.kernel.records, specs, specOf, call }
}

// The durable snapshot is written asynchronously (tmp + rename), so wait for the FACT to land instead of guessing a sleep.
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}

// ── §0 the source of each fix exists (three layers, and the ONE-NAME fold line is gone) ──────────────────────────
{
  console.log('=== §0 the repair is in the source, at each layer the defect lived in ===')
  has(REC_SRC, 'THREE_NAMES_MEANS', 'the three names have ONE definition table (not three scattered sentences)')
  has(REC_SRC, 'threeNames:', '…and the table states the RELATION between the three, not only each alone')
  has(REC_SRC, "'owner', 'writer', 'updatedAt'", '★ the HEAD list names the writer by default — a list row cannot hide who wrote it')
  ok(/identityEcho\(mergedOwner, mergedBy\)/.test(REC_SRC), '★ the WRITE receipt names both facts (create and update)')
  has(REC_SRC, 'writerMeans: THREE_NAMES_MEANS.writer', '★ expand/get carries the same glossary the receipt does')
  has(REC_SRC, 'rec.by = String(by)', 'supersede moves the writer, not only the version row')
  has(IDX_SRC, 'by: r.writer !== undefined && r.writer !== null', '★★ the durable fold stores the WRITER under `by` (it used to store the owner)')
  has(IDX_SRC, 'owner: r.owner !== undefined && r.owner !== null ? r.owner', '★★ …and the OWNER under its own name: ONE fold row, TWO facts')
  ok(!/by: r\.owner !== undefined && r\.owner !== null \? r\.owner : r\.by/.test(IDX_SRC), '★★ the one-name fold line is gone (a silent revert is red here)')
  has(HAND_SRC, "writer: g('writer')", '★★ the CARD face (vibe_v5_record_proposition) re-states the writer — run 63 read this face')
  has(HAND_SRC, 'identity: {', '…and keeps the definitions under `identity`, where a later re-wording cannot drop them')
}

// ── §1 THE WRITE RECEIPT: three words, three definitions, and the writer MOVES ────────────────────────────────
{
  console.log('=== §1 the write receipt names owner / writer / `by`, and defines each of them ===')
  const b = await boot(await mkRoot())
  const created = b.records.put({ track: 'propositions', kind: 'proposition', title: 'odd squares', body: '- value：对 n≥1 成立', by: 'r-1' })
  ok(created && created.ok === true, '§1a a proposition card is created by r-1', created)
  ok(created.owner === 'r-1' && created.writer === 'r-1' && created.by === 'r-1',
    '§1b ★ a CREATE receipt names all three words (a v1 has one author, so all three agree)',
    { owner: created.owner, writer: created.writer, by: created.by })
  ok(str(created.threeNames) !== null, '§1c ★ the receipt defines the relation between the three words', created.threeNames)
  allDefined(created, ['ownerMeans', 'writerMeans', 'byMeans'])

  const cardId = created.id
  const merged = b.records.put({ id: cardId, track: 'propositions', bodyMode: 'merge', body: '- value：对 n≥1 成立（补一句）', by: 'r-acad', title: cardId })
  ok(merged && merged.ok === true && merged.updated === true, '§1d r-acad MERGES into r-1\'s card (the run-63 write)', merged && merged.code)
  ok(merged.owner === 'r-1', '§1e ★ the OWNER does not move when another member corrects the card', merged.owner)
  ok(merged.writer === 'r-acad' && merged.by === 'r-acad',
    '§1f ★★ FEEDBACK63 ①1: the WRITER moves to the member who wrote this revision (the run-63 receipt had no such word)',
    { writer: merged.writer, by: merged.by })
  ok(Array.isArray(merged.fieldsReplaced) && merged.fieldsReplaced.indexOf('body') !== -1 && merged.fieldsReplaced.indexOf('by') !== -1,
    '§1g …the receipt still says which fields changed (including `by`)', merged.fieldsReplaced)
  allDefined(merged, ['ownerMeans', 'writerMeans', 'byMeans'])
}

// ── §2 THE READ FACES: expand and list both name the writer ─────────────────────────────────────────────────
{
  console.log('=== §2 expand and list read the same two facts back ===')
  const b = await boot(await mkRoot())
  const created = b.records.put({ track: 'propositions', kind: 'proposition', title: 'odd squares', body: '- value：对 n≥1 成立', by: 'r-1' })
  const cardId = created.id
  b.records.put({ id: cardId, track: 'propositions', bodyMode: 'merge', body: '- value：对 n≥1 成立（补一句）', by: 'r-acad', title: cardId })

  const expanded = b.records.get({ id: cardId })
  ok(expanded && expanded.ok === true, '§2a expand returns the row', expanded && expanded.code)
  ok(expanded.owner === 'r-1' && expanded.writer === 'r-acad' && expanded.by === 'r-acad',
    '§2b ★★ FEEDBACK63 ①10: expand reads owner r-1 AND writer r-acad (run 63 read r-1/r-1)', { owner: expanded.owner, writer: expanded.writer })
  ok(str(expanded.threeNames) !== null, '§2c expand teaches the vocabulary instead of leaving the reader to guess', expanded.threeNames)
  allDefined(expanded, ['ownerMeans', 'writerMeans', 'byMeans'])

  const listed = b.records.list({ track: 'propositions' })
  ok(Array.isArray(listed.items) && listed.items.length > 0, '§2d precondition: the track has a head row to read')
  ok(listed.fields.indexOf('writer') !== -1, '§2e ★ `writer` is a default HEAD field now (a list row cannot be silent about it)', listed.fields)
  const row = listed.items[0]
  ok(row.owner === 'r-1' && row.writer === 'r-acad', '§2f ★ the HEAD ROW names owner r-1 AND writer r-acad', { owner: row.owner, writer: row.writer })
  ok(str(listed.threeNames) !== null, '§2g …and the list result carries the same glossary as expand')
}

// ── §3 THE CARD FACE: this is the receipt run 63 actually read ───────────────────────────────────────────────
{
  console.log('=== §3 the seat card face (vibe_v5_record_proposition) re-states all three words ===')
  const b = await boot(await mkRoot())
  const created = await b.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'run 240 create', p: 0.9, member: 'r-1',
  })
  ok(created && created.ok === true, '§3a a card is filed by r-1 through the card face', created && created.code)
  const cardId = created.recordId || created.id
  ok(typeof cardId === 'string' && cardId !== '', '§3b the receipt names the card', cardId)
  ok(created.writer === 'r-1', '§3c ★ the CREATE receipt from the card face names its writer', created.writer)

  const merged = await b.call('vibe_v5_record_proposition', {
    id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.95', motive: 'run 240 merge', p: 0.95, member: 'r-acad', bodyMode: 'merge',
  })
  ok(merged && merged.ok === true, '§3d r-acad merges into the card through the same face run 63 used', merged && merged.code)
  ok(merged.owner === 'r-1', '§3e ★ the card receipt names the owner', merged.owner)
  ok(merged.writer === 'r-acad' && merged.by === 'r-acad', '§3f ★★ FEEDBACK63 ①1: the card receipt NAMES the writer r-acad',
    { writer: merged.writer, by: merged.by })
  ok(merged.identity && str(merged.identity.threeNames) !== null,
    '§3g …and carries the definitions under `identity` (a layer re-worded ownerMeans to null for a known author)', merged.identity)
  allDefined(merged.identity, ['ownerMeans', 'writerMeans', 'byMeans'])

  const read = await b.call('vibe_vmu_records', { action: 'expand', id: cardId })
  ok(read && read.ok === true, '§3h the seat can expand the card back', read && read.code)
  ok(read.owner === 'r-1' && read.writer === 'r-acad', '§3i ★★ FEEDBACK63 ①10: the seat\'s expand reads the writer back', { owner: read.owner, writer: read.writer })
}

// ── §4 THE DURABLE FOLD: one row, two facts — the exact ①10 path (a SECOND kernel over the same workspace) ───
{
  console.log('=== §4 the durable fold keeps both facts, so the NEXT kernel reads the writer too ===')
  const root = await mkRoot()
  const A = await boot(root)
  const created = A.records.put({ track: 'propositions', kind: 'proposition', title: 'odd squares', body: '- value：对 n≥1 成立', by: 'r-1' })
  const cardId = created.id
  A.records.put({ id: cardId, track: 'propositions', bodyMode: 'merge', body: '- value：对 n≥1 成立（补一句）', by: 'r-acad', title: cardId })
  const landed = await until(() => {
    const rows = A.kernel.store.read('records')
    if (!Array.isArray(rows)) return null
    const hit = rows.filter((r) => r && String(r.id) === String(cardId))[0]
    return hit && hit.owner !== undefined && hit.by !== undefined ? hit : null
  })
  ok(!!landed, '§4a precondition: the row reached the DURABLE fold (state.json), not only A\'s memory')
  ok(landed && landed.by === 'r-acad', '§4b ★★ the fold row stores the WRITER under `by` (this line used to store the owner)', landed && landed.by)
  ok(landed && landed.owner === 'r-1', '§4c ★★ …and the OWNER under its own name: the row no longer flattens two facts into one', landed && landed.owner)

  const B = await boot(root)
  ok(B.kernel !== A.kernel, '§4d B is a SECOND kernel instance over the same workspace (as in run 63\'s next session)', { same: B.kernel === A.kernel })
  const reExpanded = B.records.get({ id: cardId })
  ok(reExpanded.owner === 'r-1' && reExpanded.writer === 'r-acad' && reExpanded.by === 'r-acad',
    '§4e ★★ FEEDBACK63 ①10: a SECOND kernel still reads r-acad as the writer (run 63 read r-1 here)',
    { owner: reExpanded.owner, writer: reExpanded.writer })
  const reListed = B.records.list({ track: 'propositions' })
  ok(Array.isArray(reListed.items) && reListed.items.length > 0, '§4f precondition: B\'s head list has the row')
  ok(reListed.items[0].owner === 'r-1' && reListed.items[0].writer === 'r-acad', '§4g ★ B\'s HEAD ROW names both facts too',
    { owner: reListed.items[0].owner, writer: reListed.items[0].writer })

  // ── §5 supersede moves the writer, and says so ──
  console.log('=== §5 a supersede that names its writer moves the writer ===')
  const sup = B.records.supersede({ id: cardId, reason: 'run 240 second correction', by: 'r-acad-2' })
  ok(sup && sup.ok === true, '§5a supersede succeeds', sup && sup.code)
  ok(sup.owner === 'r-1', '§5b the owner stays where it was', sup.owner)
  ok(sup.writer === 'r-acad-2' && sup.by === 'r-acad-2', '§5c ★ the supersede receipt names the new writer', { writer: sup.writer, by: sup.by })
  const after = B.records.get({ id: cardId })
  ok(after.writer === 'r-acad-2' && after.by === 'r-acad-2', '§5d ★★ …and the writer really moved (a version row alone left the card saying r-acad)',
    { writer: after.writer, by: after.by })
  ok(after.owner === 'r-1', '§5e …while the owner is untouched: a correction is not a transfer')
}

for (const dir of roots) await rm(dir, { recursive: true, force: true })

console.log('')
console.log('==============================================')
console.log('writer identity: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' checks')
if (failed > 0) {
  console.error('failures:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
