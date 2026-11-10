// tests/vmu-run243-writes-window.test.mjs — RUN 243 / FEEDBACK65 1.8 (the hint that named a query no face could make).
//
// WHAT RUN 65 MEASURED: a member turn whose delivery timed out left `deliveryLastFail.writesWindow` telling the reader to
// "Read the records written by `by` between `from` and `to`" before concluding the turn produced nothing — because the
// member writes in its OWN kernel, the office cannot see those rows in its own fold. But the records face had no filter
// for a WRITER and no filter for a TIME WINDOW: `list` accepted only track/kind/limit, so the one sentence a reader in
// that situation needs pointed at a wall that did not exist (the same defect class as RUN 165's "or compact/remove
// records" and RUN 176's prune lines that named no track).
//
// RUN 243 puts the three filters where the sentence points: `vibe_vmu_records { action:"list", by, since, until }`.
// Run: node tests/vmu-run243-writes-window.test.mjs   (last line: === VMU RUN 243 WRITES WINDOW: N passed, M failed ===)

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
const RECORDS_SRC = read('vibe-math-vmu/kernel/records.js')
const HOST_SRC = read('vibe-math-vmu/host.js')
const TURN_SRC = read('vibe-math-vmu/kernel/turn/index.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
// ★ RUN 254 (P0-2 follow-up): the three pins below used to match ONE literal line of the old implementation. The
// implementation now reads a row through `writerOf`/`updatedMsOf` and NAMES every row it drops, so a single-string pin
// would either pin the old text forever or be "loosened" into a grep for a function name (which proves nothing about
// the comparison). These helpers measure a SPAN of the source and then the fragments INSIDE it: the hit must be found
// first (asserted), and every required fragment is asserted separately, so a missing `=== byArg` cannot hide behind a
// present `writerOf(r)`.
const spanOf = (src, from, to, label) => {
  const text = String(src === undefined || src === null ? '' : src)
  const i = text.indexOf(from)
  const j = i === -1 ? -1 : text.indexOf(to, i + from.length)
  ok(i !== -1 && j !== -1 && j > i, label + ' (the span exists at all)', i === -1 ? 'missing ' + JSON.stringify(from) : (j === -1 ? 'missing ' + JSON.stringify(to) : 'not after the start'))
  return i === -1 || j === -1 || j <= i ? '' : text.slice(i, j)
}
const hasAll = (hay, needles, label) => {
  ok(Array.isArray(needles) && needles.length > 0, label + ' (RULE E: the required list is not empty)', needles)
  for (const n of needles || []) has(hay, n, label + ' · ' + n)
  return hay
}
const hasNone = (hay, needles, label) => {
  ok(Array.isArray(needles) && needles.length > 0, label + ' (RULE E: the forbidden list is not empty)', needles)
  for (const n of needles || []) ok(!String(hay === undefined || hay === null ? '' : hay).includes(n), label + ' · must NOT contain ' + JSON.stringify(n), hay)
  return hay
}

const entry = await import(ENTRY)
const roots = []
const boot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-r243-ww-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const at = 1000
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => at, deliverMode: 'caller' })
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  return { root, kernel, specs: state.specs, at }
}
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
}

// ── §0 the three filters exist where the hint points ────────────────────────────────────────────────────────────
// ★ RUN 2691 / task-177 added one more defaulted parameter to the same signature (`withWriter = true`, the read face
// that answers "who wrote this row" without a second query). The pin below used to be the WHOLE parameter list, so an
// unrelated lane adding a parameter turned this into a red that said nothing about `by`/`since`/`until`. The pin is now
// SPLIT: (1) the three filters this suite exists for must still be in the signature, (2) the signature must still be a
// single `list({…} = {})` object pattern with a body, and (3) every defaulted parameter named here must still be present.
// This keeps the assertion about THE SAME QUESTION while letting the list grow.
{
  const sig = RECORDS_SRC.slice(RECORDS_SRC.indexOf('list({ track = null'))
  const head = sig.slice(0, sig.indexOf('} = {}) {'))
  const required = ['by = null', 'since = null', 'until = null']
  ok(required.every((p) => head.includes(p)) && head.includes('withWriter = true'),
    '§0a ★★★ the kernel head list accepts a WRITER and a TIME WINDOW (run 65\'s hint named a query no face could make)',
    { filters: required.filter((p) => head.includes(p)), params: head.slice(0, 200) })
}
// §0b/§0c/§0d (RUN 254): each filter must (1) read the row through the ONE reader (`writerOf`/`updatedMsOf`), (2) make
// the boundary comparison the question needs (`=== byArg`, `>=`, `<=`), and (3) NAME every row it drops for a shape
// reason (`excluded.noWriter`/`excluded.timeUnknown`) instead of returning a silent zero. A single-string pin could not
// say all three; a span pin that only repeats "writerOf appears" would pass a filter that forgot `=== byArg`. So the
// span is asserted to exist, then each fragment is asserted inside it, then the OLD read is asserted ABSENT (the
// implementation is required to stop reading `r.by` directly — that read is what dropped legal rows in silence).
const BY_SPAN = spanOf(RECORDS_SRC, 'if (byArg !== null) {', 'if (sinceMs !== null) {', '§0b ★★★ the by-filter branch exists')
hasAll(BY_SPAN, ['writerOf(r)', '=== byArg', 'excluded.noWriter.push'],
  '§0b ★★★ the writer filter reads the row through writerOf, compares STRICTLY, and names every writer-less row it drops')
hasNone(BY_SPAN, ['String(r.by', 'r.by === undefined'],
  '§0b ★★★ and the branch NO LONGER compares the raw `r.by` spelling (that read is the silent-zero defect)')
const SINCE_SPAN = spanOf(RECORDS_SRC, 'if (sinceMs !== null) {', 'if (untilMs !== null) {', '§0c ★★ the lower-bound branch exists')
hasAll(SINCE_SPAN, ['updatedMsOf(r)', 't >= sinceMs', 'excluded.timeUnknown.push'],
  '§0c ★★ the lower bound reads the row through updatedMsOf, is INCLUSIVE (`>=`), and names every time-less row it drops')
const UNTIL_SPAN = spanOf(RECORDS_SRC, 'if (untilMs !== null) {', 'const sinceIso', '§0d ★★ the upper-bound branch exists')
hasAll(UNTIL_SPAN, ['updatedMsOf(r)', 't <= untilMs', 'excluded.timeUnknown.push'],
  '§0d ★★ and the upper bound is inclusive too (`<=`) over the same reader, with the same named drops')
has(RECORDS_SRC, "'since is not a time: '", '§0e ★★ a time that does not parse is refused BY NAME, never silently ignored')
has(RECORDS_SRC, 'filter: { by: byArg, since: sinceIso, until: untilIso },',
  '§0f ★★ the answer echoes the filter it applied (so a reader can tell "none matched" from "no filter")')
has(RECORDS_SRC, 'filtered BEFORE the page cap, so available counts the set this question covers',
  '§0g ★★★ and says the cap came AFTER the filter (RUN 164b: total is the filtered set, never the page)')
has(HOST_SRC, "        since: param('string', 'list：时间窗下界",
  '§0h ★★★ the records face DECLARES the lower bound (a parameter the tool does not declare is unreachable)')
has(HOST_SRC, "        until: param('string', 'list：时间窗上界",
  '§0i ★★ and the upper bound')
has(HOST_SRC, "action = 'list', id, ids, limit, track, kind, statement, proof, keep, why, by, since, until, dryRun",
  '§0j ★★★ and FORWARDS both into the kernel (RUN 242 taught this twice: a face that drops a noun makes it unreachable)')
has(HOST_SRC, 'if (byFilterArg !== null) query.by = byFilterArg', '§0k ★★ the by filter reaches the store query')
has(HOST_SRC, 'timeFilterMeans:', '§0l ★ the face explains the window it applied')
has(TURN_SRC, "readWith: 'vibe_vmu_records { action:\"list\", by:\"<the by above>\", since:\"<the from above>\", until:\"<the to above>\", limit:0 }'",
  '§0m ★★★★ the failed-delivery window NAMES the exact invocation that answers it (run 65 named a query no face could make)')
has(TURN_SRC, 'An EMPTY answer therefore proves one of two things',
  "§0m' ★★★ and says what an EMPTY answer proves - and what it does not (the receipt cannot enumerate the ledger)")

// ── §0-runtime: the pins above measure source TEXT; this block measures the BEHAVIOUR they claim, with the REAL
// kernel. Two legacy shapes live in the same world and both used to answer a silent zero:
//   · a row whose author is stored under `owner` (no raw `by`) — the spelling the old writer filter compared;
//   · a library card whose `updatedAt` frontmatter is an ISO STRING — the shape old kernels wrote, which `Number(...)`
//     turned into NaN (both a time window and the host's whole-library exclusion used to drop it).
// Vitest-style text pins cannot see either; these can.
{
  const b = await boot()
  b.kernel.records.put({ id: 'rec-own', track: 'propositions', kind: 'proposition', title: 'owner 行',
    body: '- id：rec-own\n- note：这一行的作者写在 owner 上', by: null, owner: 'r-own' })
  const ownAll = await call(b.specs, 'vibe_vmu_records', { action: 'list', limit: 0 })
  const ownRow = (ownAll.records || []).find((r) => r.id === 'rec-own') || null
  ok(ownAll.ok === true && ownRow !== null, '§0n premise: the kernel wrote the owner-only row', show(ownAll))
  ok(ownRow !== null && (ownRow.writer === null || ownRow.writer === undefined) && ownRow.owner === 'r-own',
    '§0o ★★ its author is stored under `owner`, NOT under the raw `by` spelling the old filter compared', ownRow && { writer: ownRow.writer, owner: ownRow.owner })
  const ownBy = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-own', limit: 0 })
  const ownIds = (ownBy.records || []).map((r) => r.id)
  ok(ownIds.length === 1 && ownIds[0] === 'rec-own',
    '§0p ★★★ the WRITER filter finds it through `writerOf` (the old raw-`by` comparison answered ZERO rows: ' + JSON.stringify(ownIds) + ')', ownIds)
  ok(ownBy.excluded && ownBy.excluded.shapeMismatch === 0 && (ownBy.excluded.noWriter || []).length === 0 && (ownBy.excluded.timeUnknown || []).length === 0,
    '§0q ★★★ and nothing was dropped in silence: `excluded` is all zero, so "matched nothing" and "I could not read the row" stay different answers', ownBy.excluded)

  // the ISO-stamped library card (the P0-2 shape, written by a real kernel's own index reading a real file)
  const cardDir = join(b.root, 'Members', 'r-1', 'Propos')
  await mkdir(cardDir, { recursive: true })
  await writeFile(join(cardDir, 'legacy-card.md'),
    '---\nid: legacy-card\nkind: proposition\ntitle: 旧形状卡片\nstatus: open\nowner: r-legacy\nupdatedAt: 1970-01-01T00:00:05.000Z\n---\n\n- note：旧内核把 updatedAt 写成 ISO 串\n', 'utf8')
  const libRows = await b.kernel.library.list({ withWriter: true })
  const libRow = (libRows || []).find((r) => r.id === 'legacy-card') || null
  ok(libRow !== null, '§0r premise: the kernel indexes the hand-written legacy card', libRows && libRows.map((r) => r.id))
  ok(libRow !== null && libRow.updatedAt === 5000 && typeof libRow.updatedAt === 'number',
    '§0s ★★★ the ISO frontmatter stamp is READ as the instant it names (5000 ms), not left a string and not NaN', libRow && { updatedAt: libRow.updatedAt, type: typeof libRow.updatedAt })
  const libBy = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-legacy', limit: 0 })
  const libByIds = (libBy.records || []).map((r) => r.id)
  ok(libByIds.length === 1 && libByIds[0] === 'legacy-card',
    '§0t ★★★ the writer filter reaches the LEGACY card too (the pre-RUN-254 host excluded every library row whenever a writer/time filter was given: 0 rows)', libByIds)
  const edge = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-legacy', since: '1970-01-01T00:00:05.000Z', until: '1970-01-01T00:00:05.000Z', limit: 0 })
  const edgeIds = (edge.records || []).map((r) => r.id)
  ok(edgeIds.length === 1 && edgeIds[0] === 'legacy-card',
    '§0u ★★★ and the ISO-stamped card sits INSIDE a window whose both bounds equal its instant (inclusive at both ends)', edgeIds)
  ok(edge.excluded && edge.excluded.shapeMismatch === 0 && (edge.excluded.timeUnknown || []).length === 0,
    '§0v ★★ with `excluded` zero: the card was not "found by accident after being dropped silently"', edge.excluded)
  const over = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-legacy', since: '1970-01-01T00:00:05.001Z', limit: 0 })
  ok((over.records || []).length === 0, '§0w while one millisecond later excludes it (the boundary is a boundary, not a rubber stamp)', (over.records || []).map((r) => r.id))
}

// ── §1 the filters answer the question they were added for ─────────────────────────────────────────────────────
{
  const b = await boot()
  // ★ the record fingerprint drops a row's OWN id line, so a body differing only in the id DEDUPES into one row
  //   (measured while writing this suite: four puts became two rows). Each row carries a distinct note, so the four
  //   rows below really are four rows.
  const mk = (id, by, track) => b.kernel.records.put({ id, track, kind: 'proposition', title: id, body: '- id：' + id + '\n- note：这一行的记号是 ' + id, by })
  mk('rec-a1', 'r-1', 'propositions')
  mk('rec-a2', 'r-1', 'propositions')
  mk('rec-a3', 'r-chair', 'propositions')
  mk('rec-b1', 'r-chair', 'methods')

  const all = await call(b.specs, 'vibe_vmu_records', { action: 'list', limit: 0 })
  ok(all.ok === true && Array.isArray(all.records), '§1a premise: the face lists rows at all', show(all))
  const mine = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-1', limit: 0 })
  ok(mine.ok === true, '§1b a writer filter is accepted', show(mine))
  const mineIds = (mine.records || []).map((r) => r.id).sort()
  ok(mineIds.length === 2 && mineIds[0] === 'rec-a1' && mineIds[1] === 'rec-a2',
    '§1c ★★★ it returns EXACTLY the rows that seat wrote (non-vacuous: ' + JSON.stringify(mineIds) + ')', mineIds)
  ok(mine.byFilter === 'r-1' && /OWN writer/.test(String(mine.byFilterMeans)),
    '§1d ★★ the receipt echoes the writer filter and names the field it compared', mine.byFilter)
  ok(mine.total === 2, '§1e ★★★ total counts the FILTERED set, not the 4 live rows', mine.total)
  // the HEAD row names the writer as `writer` (RUN 240: owner / writer / by are three different questions), so the
  // filter compares the stored `by` and the page reports the same fact under the name the head uses.
  ok((mine.records || []).length === 2 && (mine.records || []).every((r) => r.writer === 'r-1'),
    '§1f every returned row reports that writer in the head field (non-vacuous: ' + (mine.records || []).length + ')', mine.records)

  const empty = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-nobody', limit: 0 })
  ok(empty.ok === true && (empty.records || []).length === 0 && empty.total === 0,
    '§1g a writer that wrote nothing answers an EMPTY set, not an error (and total:0)', empty.total)

  // the window: every row was last written at clock 1000 (1970-01-01T00:00:01.000Z)
  const insideSince = await call(b.specs, 'vibe_vmu_records', { action: 'list', since: '1970-01-01T00:00:01.000Z', limit: 0 })
  ok((insideSince.records || []).length === 4, '§1h the lower bound is INCLUSIVE (a row written exactly at `from` is in)', (insideSince.records || []).length)
  const outsideSince = await call(b.specs, 'vibe_vmu_records', { action: 'list', since: '1970-01-01T00:00:01.001Z', limit: 0 })
  ok((outsideSince.records || []).length === 0, '§1i a lower bound one millisecond later excludes every row', (outsideSince.records || []).length)
  const outsideUntil = await call(b.specs, 'vibe_vmu_records', { action: 'list', until: '1970-01-01T00:00:00.999Z', limit: 0 })
  ok((outsideUntil.records || []).length === 0, '§1j an upper bound before the writes excludes every row', (outsideUntil.records || []).length)
  ok(insideSince.sinceFilter === '1970-01-01T00:00:01.000Z' && insideSince.untilFilter === null,
    '§1k the window is echoed back as the ISO the caller gave', insideSince.sinceFilter)
  ok(/last write/.test(String(insideSince.timeFilterMeans)), '§1l and the receipt says WHICH timestamp the window compares', insideSince.timeFilterMeans)

  const combo = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: 'r-chair', since: '1970-01-01T00:00:01.000Z', limit: 0 })
  ok((combo.records || []).length === 2 && (combo.records || []).every((r) => r.writer === 'r-chair'),
    '§1m writer and window compose (the question the hint asks is two facts at once)', (combo.records || []).map((r) => r.id))

  const bad = await call(b.specs, 'vibe_vmu_records', { action: 'list', since: 'yesterday-ish' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT' && /since is not a time/.test(String(bad.message)),
    '§1n ★★ a time that does not parse is refused by name, not ignored', show(bad))
  ok(/ISO stamp/.test(String(bad.hint)), '§1o ★ and the hint says what shape it wants (the receipt flips write the ISO)', bad.hint)
}

// ── §2 the round trip the hint promises: fail a delivery, then run its own instruction ─────────────────────────
{
  const b = await boot()
  // the member wrote BEFORE its turn's delivery failed (this is exactly run 65: a draft and a progress row)
  b.kernel.records.put({ id: 'rec-w1', track: 'state', kind: 'state', title: '成员在超时前写的草案', body: '- id：rec-w1\n- note：草案', by: 'r-1' })
  const boom = async () => { const e = new Error('the seam gave up waiting'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; throw e }
  // the orchestrator owns its clock (kernel/injected clocks may answer epoch ms); pin it to the SAME instant the fixture
  // wrote its rows at, so the window the failure prints really does cover them — that is the situation run 65 was in.
  const t = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: createPromptPipeline({ sections: v5rPromptSections, clock: () => '1970-01-01T00:00:01.000Z' }),
    clock: () => '1970-01-01T00:00:01.000Z',
    deliver: boom,
  })
  let threw = null
  try { await t.run({ member: 'r-1', phase: 'normal' }) } catch (e) { threw = e }
  ok(!!threw, '§2a premise: the turn failed to deliver', threw && threw.code)
  const fail = t.status().counts ? t.status().counts.deliveryLastFail : null
  ok(fail && fail.writesWindow, '§2b the failure names a writesWindow', fail)
  const win = fail.writesWindow
  ok(typeof win.from === 'string' && typeof win.to === 'string' && win.by === 'r-1',
    '§2c the window names a from, a to and a seat', win)
  ok(win.readWith === 'vibe_vmu_records { action:"list", by:"<the by above>", since:"<the from above>", until:"<the to above>", limit:0 }',
    '§2d ★★★★ the window carries a readWith whose shape the face accepts (run 65\'s sentence named no makeable query)', win.readWith)
  ok(/filters by WRITER and by LAST-WRITE TIME/.test(String(win.readWithMeans)) && /EMPTY answer/.test(String(win.readWithMeans)),
    '§2d\' ★★★ and readWithMeans says what that call filters on and what an empty answer proves', String(win.readWithMeans).slice(0, 120))
  ok(/Follow `readWith`/.test(String(win.means)),
    '§2d\'\' ★★ the window\'s own means sends the reader to readWith, so the two cannot drift apart', String(win.means).slice(0, 100))

  // RUN THE INSTRUCTION, verbatim in shape: by + since + until, as the receipt printed them
  const followed = await call(b.specs, 'vibe_vmu_records', { action: 'list', by: win.by, since: win.from, until: win.to, limit: 0 })
  ok(followed.ok === true, '§2e ★★★★ the instruction the receipt gives is ACCEPTED by the face (this is the whole defect)', show(followed))
  const ids = (followed.records || []).map((r) => r.id)
  ok(ids.includes('rec-w1'), '§2f ★★★★ and it finds the row the member wrote before the timeout (non-vacuous: ' + JSON.stringify(ids) + ')', ids)
  ok(followed.byFilter === 'r-1' && followed.sinceFilter === win.from && followed.untilFilter === win.to,
    '§2g the answer echoes all three facts the reader passed', { by: followed.byFilter, since: followed.sinceFilter, until: followed.untilFilter })
}

function show(r) { return r && (r.code || '') + ' ' + String((r && r.message) || '').slice(0, 160) }

console.log('\n=== VMU RUN 243 WRITES WINDOW: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures: ' + JSON.stringify(failures, null, 1)) ; process.exitCode = 1 }
