// tests/vmu-run254-field-isolation.test.mjs — RUN 254-A (audit13 brief, HEAD d3b695cf): the four readings that were
// WRONG about what a turn and a list actually did. Every defect below was MEASURED on the real build, not inferred.
//
//   · P0-1 (T5, highest): ONE bad reply field ABORTED THE WHOLE TURN. `apply` dispatched the reply fields in a loop and
//     the `catch` re-threw, so a single face refusal discarded every field that had already applied — MEASURED as
//     "records total = 0" for a turn whose other two fields were perfectly good. The refusal is now PER-FIELD: the bad
//     field is a named skip (`skippedFields[]`, `failedFieldCount`), the good fields land, and the turn only fails when
//     NOTHING could be applied — with a receipt that says what did land. This suite drives a REAL turn through the real
//     tool faces and then reads the DURABLE store: one bad field + two good fields ⇒ both good rows exist.
//   · P0-2 (L1): `records` rows and `library` rows disagreed about their own shape, and a `by:` filter silently threw
//     the library rows away (`updatedAt` was an ISO string and there was no `writer`), so `by:'r-acad'` answered
//     total:0 while the card sat in the store. The row shape is now uniform at the place it is WRITTEN (numeric
//     `updatedAt` ms, `writer`+`writerSource`, the old ISO string is normalised on read and never compared as NaN), the
//     merge judges each row instead of excluding a whole store, and rows a filter could not judge are NAMED in
//     `excluded` with a count. The assertion is EXTERNAL: the filtered answer is compared against an independent
//     traversal of the library, not against the receipt's own claim.
//   · P1-2: an unusable `limit` (negative / non-integer) used to fall back silently; it is now refused by name, and a
//     legal page size is echoed back as `limitUsed`/`limitSource`.
//   · P1-3: `recoverPlan().ok` was a CONSTANT `true` while `steps[].ok` was `false` — one receipt saying two things.
//     `ok` is now DERIVED from the steps, and `blocking[]` names each blocking step with the same step name.
//   · P1-6: a delivery adapter returning a shape the kernel cannot read (a host envelope, an array) used to fall all
//     the way down to "no reply text" (`VMU_ENGINE_UNAVAILABLE` / `VMU_TURN_NO_FENCE`). It is now refused at the
//     delivery boundary as `VMU_TURN_DELIVERY_SHAPE`, with the accepted shapes and the keys actually received.
//
// WHAT IT DOES NOT PROVE (named so nobody reads more into it than there is): it does not drive a live model. It proves
// the readings and the dispatch behaviour, not that a model reads them. The end-to-end simulator path for P1-6 is
// pinned at the KERNEL seam on purpose: the simulated host service wraps a reply in `{output:[…]}` and
// `host-deliver.js#textOfReplyBlocks` still accepts only string `text`, so that path answers VMU_ENGINE_UNAVAILABLE —
// a HOST-side follow-up, listed in the run report, not hidden by this suite.
//
// RULE E: every `.every(...)` / loop below is preceded by an explicit NON-EMPTY assertion, and the deep comparisons
// live in helpers that never call `ok(`.
//
// Run: node tests/vmu-run254-field-isolation.test.mjs   (last line: === VMU RUN 254 FIELD ISOLATION: N passed, M failed ===)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createResume } from '../vibe-math-vmu/kernel/resume.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href
const NOW = 1_800_000_000_000

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const j = (x) => JSON.stringify(x)

// ── helpers: the independent criteria live here, and NONE of them call `ok(` (RULE E) ────────────────────────────────
const fenceOf = (payload) => '```json\n' + j(payload) + '\n```'
const bootHarness = async (deliver, root) => {
  const { boot } = await import(HARNESS)
  return boot({ root, clock: () => NOW, withPrompt: true, deliver })
}
const asMember = (id) => ({ as: { agent: { id } } })
/** The writer a library head names, read the SAME way `records` records it: `writer`, then the write face's `by`, then `owner`. */
const writerFieldOf = (row) => {
  if (!row || typeof row !== 'object') return null
  for (const f of ['writer', 'by', 'owner']) {
    const v = row[f]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}
/** INDEPENDENT traversal: the ids whose writer equals `writer`, computed from the library rows only (no receipt). */
const idsWrittenBy = (rows, writer) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r && writerFieldOf(r) === writer)
  .map((r) => String(r.id))
/** INDEPENDENT shape audit: rows the writer/time filter cannot judge, computed from the library rows only. */
const unjudgeableByTime = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r && (r.updatedAt === null || r.updatedAt === undefined || r.updatedAt === ''
    ? true
    : !(typeof r.updatedAt === 'number' ? Number.isFinite(r.updatedAt) : (typeof r.updatedAt === 'string' && Number.isFinite(Number(r.updatedAt))) || Number.isFinite(Date.parse(String(r.updatedAt))))))
  .map((r) => String(r.id))
/** `plan.ok` DERIVED from the steps — the same conjunction the act reports, recomputed here. */
const derivedPlanOk = (steps) => (Array.isArray(steps) && steps.length > 0 ? steps.filter((s) => s && s.ok === false).length === 0 : null)
const stepNames = (steps) => (Array.isArray(steps) ? steps.map((s) => String(s && s.step)) : [])
const idsOf = (rows) => (Array.isArray(rows) ? rows.map((r) => String(r && r.id)) : [])
const sortedSame = (a, b) => {
  const x = (Array.isArray(a) ? a : []).map(String).sort()
  const y = (Array.isArray(b) ? b : []).map(String).sort()
  return j(x) === j(y)
}
/**
 * RULE E shape B: two step-name lists "agreeing" while both are EMPTY is not evidence, so the non-empty requirement
 * travels WITH the comparison instead of sitting a few statements above it (a guard that can be refactored away).
 */
const sameStepNames = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length > 0 && b.length > 0 && sortedSame(a, b)
const mkStore = () => {
  const data = new Map()
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  return {
    export: () => ({ version: 1, keys: Object.fromEntries(data) }),
    read: (k) => copy(data.get(k)),
    patch: (k, fn) => { const next = fn(copy(data.get(k))); data.set(k, next); return { ok: true, key: k } },
  }
}
const mkKernel = (seam) => {
  const kernel = createKernel({
    clock: () => 1000, settings: {}, deliverTurn: seam,
    slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  return { kernel, spec: (n) => specs.find((s) => s.name === n) }
}

// ── 1. P0-1 (T5): ONE BAD FIELD NO LONGER ABORTS THE TURN, AND THE GOOD FIELDS REALLY LAND ───────────────────────────
console.log('=== 1. P0-1: a refused reply field is a NAMED SKIP, not the end of the turn ===')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-run254-p01-'))
  try {
    // The reply carries three dispatchable fields: two that apply and one that makes its face THROW (an unknown record
    // track). On the broken build the throw aborted `apply`, the turn failed, and `records` was empty.
    const payload = {
      progress: { track: 'progress', title: 'good-1', body: 'b' },
      task_create: { title: 'good-2' },
      record: { track: 'no-such-track', text: 'x' },
    }
    const h = await bootHarness(async () => fenceOf(payload), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const st = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })

    ok(st.ok === true, '§1a. the TURN SUCCEEDS: one refused field does not abort the round', { ok: st.ok, code: st.code, message: st.message && String(st.message).slice(0, 160) })
    const receipt = st.receipt || {}
    ok(receipt.executed === 2, '§1b. two fields were dispatched (`executed` is the COUNT)', { executed: receipt.executed })
    ok(Array.isArray(receipt.executedDetail) && receipt.executedDetail.length === 2 && sortedSame(receipt.executedDetail.map((e) => e && e.field), ['progress', 'task_create']),
      '§1c. ★★ and they are the two GOOD fields, by name', { detail: (receipt.executedDetail || []).map((e) => e && e.field) })
    ok(receipt.skipped === 1, '§1d. exactly one field is a skip', { skipped: receipt.skipped })
    const skippedRow = (Array.isArray(receipt.skippedDetail) && receipt.skippedDetail[0]) || {}
    ok(skippedRow.field === 'record' && skippedRow.reason === 'dispatch-refused' && skippedRow.code === 'VMU_INVALID_ARGUMENT',
      '§1e. ★★ the bad field is NAMED with its code (`dispatch-refused`), instead of taking the turn down with it',
      { field: skippedRow.field, reason: skippedRow.reason, code: skippedRow.code })
    ok(typeof skippedRow.message === 'string' && /no-such-track/.test(skippedRow.message),
      '§1f. and its message still says WHY (the unknown track is not lost)', { message: skippedRow.message })

    // DURABLE, not the receipt's opinion: read the stores the turn wrote.
    const rows = await h.call('vibe_vmu_records', { action: 'list', limit: 0 })
    const recIds = idsOf(rows.records)
    ok(rows.ok === true && rows.total >= 1 && recIds.includes('rec-1'),
      '§1g. ★★★ the `progress` row is REALLY THERE in the durable library (rec-1) — the good field was not thrown away',
      { total: rows.total, ids: recIds })
    const tasks = await h.call('vibe_v5_task_list', {})
    const taskIds = idsOf(tasks && (tasks.tasks || tasks.items || []))
    ok(taskIds.includes('t-1'),
      '§1h. ★★★ and the task created by the OTHER good field is really there too (t-1)', { ids: taskIds })

    // The ledger row is the durable record of the turn: it must carry the same split reading.
    const ledger = h.kernel.turn.status()
    const row = (ledger.turnReceipts || []).slice(-1)[0] || {}
    ok(row.status === 'applied' && Array.isArray(row.skippedFields) && row.skippedFields.length === 1 && row.skippedFields[0].field === 'record' && row.skippedFields[0].code === 'VMU_INVALID_ARGUMENT',
      '§1i. the TURN LEDGER row names the skipped field with its code, so the refusal survives the receipt',
      { status: row.status, skippedFields: row.skippedFields })
    ok(Array.isArray(row.executed) && sortedSame(row.executed.map((e) => e && e.field), ['progress', 'task_create']),
      '§1j. and its `executed` list names the two fields that applied — "what landed" and "what did not" are both readable', { executed: (row.executed || []).map((e) => e && e.field) })

    // §1k: THE REGRESSION PROPER. Before this fix, a failing field meant the whole turn threw and the round was counted
    // as failed. The orchestrator's own counters must now say two fields dispatched and ZERO failed turns.
    const tCounts = (h.kernel.turn.status() || {}).counts || {}
    ok(tCounts.dispatched === 2 && tCounts.failed === 0 && tCounts.notExecuted === 1,
      '§1k. ★★★ the turn counters agree: 2 dispatched, 0 failed, 1 not-executed-by-refusal — the bad field no longer manufactures a failed round',
      { dispatched: tCounts.dispatched, failed: tCounts.failed, notExecuted: tCounts.notExecuted })
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* Windows may hold a handle for a moment */ }
  }
}

// ── 2. P0-2 (L1): append → list{by} MATCHES AN INDEPENDENT TRAVERSAL, AND A ROW SHAPE IS UNIFORM ─────────────────────
console.log('=== 2. P0-2: a card a member wrote is FOUND by `by`, compared against an independent traversal ===')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-run254-p02-'))
  try {
    const h = await bootHarness(async () => fenceOf({}), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const app = await h.call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'The sky is blue (RUN 254).' }, asMember('r-1'))
    ok(app.ok === true && typeof app.id === 'string' && app.id !== '',
      '§2a. `append proposition` as r-1 writes a card', { ok: app.ok, id: app.id, seatFace: app.seatFace })

    // The independent fact: the library rows, read directly, filtered by the writer field — NOT the records receipt.
    const libRows = await h.kernel.library.list({ withWriter: true })
    ok(Array.isArray(libRows) && libRows.length >= 1, '§2b. the library really has the card (non-empty guard before the shape checks)', { rows: libRows && libRows.length })
    const shapeRows = (libRows || []).filter((r) => r && r.id === app.id)
    ok(shapeRows.length === 1, '§2c. the card is in the head list exactly once', { ids: idsOf(libRows) })
    const shapeRow = shapeRows[0] || {}
    ok(typeof shapeRow.updatedAt === 'number' && Number.isFinite(shapeRow.updatedAt),
      '§2d. ★★★ the library row carries `updatedAt` as EPOCH MILLISECONDS (typeof number) — the old ISO string no longer appears',
      { updatedAt: shapeRow.updatedAt, atType: typeof shapeRow.updatedAt })
    ok(shapeRow.updatedAt === NOW, '§2e. and it is the clock the card was written with, not a re-parse of a string', { updatedAt: shapeRow.updatedAt, now: NOW })
    ok(writerFieldOf(shapeRow) === 'r-1',
      '§2f. ★★ and it names the WRITER (r-1), so a `by` question has a fact to answer', { writer: shapeRow.writer, writerSource: shapeRow.writerSource, owner: shapeRow.owner })

    // The documented head shape is unchanged: writer is OPT-IN (`withWriter:true`), so the default head list is still
    // exactly the seven documented fields. Pinned so the fix could not be "just add a field everywhere".
    const plainHeads = await h.kernel.library.list()
    const plainRow = (plainHeads || []).find((r) => r && r.id === app.id) || {}
    ok(plainHeads && plainHeads.length >= 1 && !('writer' in plainRow) && Object.keys(plainRow).length === 7,
      '§2g. the DEFAULT head list is still the documented SEVEN fields (writer is opt-in, not smuggled into the contract)',
      { keys: Object.keys(plainRow) })

    const expected = idsWrittenBy(libRows, 'r-1')
    const byQuery = await h.call('vibe_vmu_records', { action: 'list', by: 'r-1', limit: 0 })
    ok(byQuery.ok === true && byQuery.total === expected.length && sortedSame(idsOf(byQuery.records), expected),
      '§2h. ★★★ `list{by:"r-1"}` returns EXACTLY the rows an independent library traversal says r-1 wrote',
      { receiptIds: idsOf(byQuery.records), independentIds: expected, total: byQuery.total })
    ok(byQuery.rowsFrom && byQuery.rowsFrom.library >= 1,
      '§2i. ★★ and the count says those rows came from the LIBRARY (this is the store whose rows used to be excluded wholesale)',
      { rowsFrom: byQuery.rowsFrom })
    const ex = byQuery.excluded || {}
    ok(ex.shapeMismatch === 0 && Array.isArray(ex.noWriter) && ex.noWriter.length === 0 && Array.isArray(ex.timeUnknown) && ex.timeUnknown.length === 0,
      '§2j. nothing was silently dropped on this query, and the receipt says so with zeroes (not by omitting the block)',
      { excluded: ex })
    ok(typeof byQuery.excludedMeans === 'string' && byQuery.excludedMeans.length > 0,
      '§2k. the `excluded` block always arrives with its own meaning sentence', { means: byQuery.excludedMeans && String(byQuery.excludedMeans).slice(0, 80) })

    // A seat that wrote nothing must answer "no match", not "the store was excluded".
    const nobody = await h.call('vibe_vmu_records', { action: 'list', by: 'r-2', limit: 0 })
    ok(nobody.ok === true && nobody.total === 0 && (nobody.excluded || {}).shapeMismatch === 0 && nobody.rowsFrom && nobody.rowsFrom.library === 0,
      '§2l. ★★ another seat answers total:0 with `excluded` zeroes and `rowsFrom.library:0` — "no match" and "rows thrown away" are different answers',
      { total: nobody.total, excluded: nobody.excluded, rowsFrom: nobody.rowsFrom })
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── 3. P0-2 (cont.): a row a filter CANNOT JUDGE is NAMED in `excluded`, and the count matches the dataset ──────────
console.log('=== 3. P0-2: a legacy card with an unreadable last-write time is NAMED, not vanished ===')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-run254-excluded-'))
  try {
    const h = await bootHarness(async () => fenceOf({}), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    await h.call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'A readable card (RUN 254).' }, asMember('r-1'))
    // A card whose frontmatter carries a last-write time no reader can parse: the library normalises it to null, and a
    // time-window filter must then say "I could not judge this row" instead of dropping it without a word.
    mkdirSync(join(root, 'Members', 'r-2', 'Propos'), { recursive: true })
    writeFileSync(join(root, 'Members', 'r-2', 'Propos', 'legacy-card.md'),
      '---\nid: legacy-card\nkind: proposition\ntitle: legacy card\nstatus: open\nowner: r-2\nupdatedAt: not-a-date\n---\n\nbody\n', 'utf8')

    const libRows = await h.kernel.library.list({ withWriter: true })
    ok(Array.isArray(libRows) && libRows.some((r) => r && r.id === 'legacy-card'),
      '§3a. the hand-written legacy card IS in the library index (non-empty guard: the fixture really exists)', { ids: idsOf(libRows) })
    const independentlyUnjudgeable = unjudgeableByTime(libRows)
    ok(independentlyUnjudgeable.includes('legacy-card'),
      '§3b. the independent shape audit agrees the row has no readable last-write time', { ids: independentlyUnjudgeable })

    const win = await h.call('vibe_vmu_records', { action: 'list', since: '2027-01-01T00:00:00.000Z', limit: 0 })
    const ex = win.excluded || {}
    ok(win.ok === true && Array.isArray(ex.timeUnknown) && ex.timeUnknown.includes('legacy-card'),
      '§3c. ★★★ the time-windowed answer NAMES the row it could not judge (`excluded.timeUnknown`)', { excluded: ex })
    ok(ex.shapeMismatch === ex.timeUnknown.length + ex.noWriter.length,
      '§3d. ★★ the count IS the list: `shapeMismatch` equals the rows actually named (a count cannot drift from its ids)',
      { shapeMismatch: ex.shapeMismatch, noWriter: ex.noWriter, timeUnknown: ex.timeUnknown })
    ok(ex.shapeMismatch === independentlyUnjudgeable.length,
      '§3e. ★★★ and it equals the number the INDEPENDENT audit computed from the library rows — the reading is measured, not claimed',
      { receipt: ex.shapeMismatch, independent: independentlyUnjudgeable.length })
    ok(win.total === (Array.isArray(win.records) ? win.records.length : 0),
      '§3f. `total` and the returned page agree on the same window', { total: win.total, returned: (win.records || []).length })

    // The same row is NOT excluded when the question does not ask for its time: exclusion is about unjudgeable facts,
    // not about the row being in another store.
    const noWindow = await h.call('vibe_vmu_records', { action: 'list', limit: 0 })
    const nEx = noWindow.excluded || {}
    ok(noWindow.ok === true && nEx.shapeMismatch === 0 && nEx.timeUnknown.length === 0 && idsOf(noWindow.records).includes('legacy-card'),
      '§3g. with no time filter the same row is RETURNED (a row is never excluded for a fact nobody asked about)',
      { excluded: nEx, ids: idsOf(noWindow.records) })
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── 4. P1-2: an unusable `limit` is REFUSED BY NAME; a legal one is echoed back ──────────────────────────────────────
console.log('=== 4. P1-2: `limit` cannot be silently dropped ===')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-run254-limit-'))
  try {
    const h = await bootHarness(async () => fenceOf({}), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    await h.call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'Limit fixture one (RUN 254).' }, asMember('r-1'))
    await h.call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'Limit fixture two (RUN 254).' }, asMember('r-1'))

    const bad = await h.call('vibe_vmu_records', { action: 'list', limit: -3 })
    ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', '§4a. ★★★ `limit:-3` is refused by name, not answered as if it were absent',
      { ok: bad.ok, code: bad.code, message: bad.message && String(bad.message).slice(0, 120) })
    ok(typeof bad.message === 'string' && /limit is not a usable page size/.test(bad.message) && /-3/.test(bad.message),
      '§4b. the message names the argument AND the value it could not use', { message: bad.message })
    const badString = await h.call('vibe_vmu_records', { action: 'list', limit: 'two' })
    ok(badString.ok === false && badString.code === 'VMU_INVALID_ARGUMENT', '§4c. a non-numeric limit is refused the same way', { code: badString.code })

    // The kernel face itself refuses too — the host must not be the only guard.
    let kernelCode = null
    try { h.kernel.records.list({ limit: -3 }) } catch (e) { kernelCode = e && e.code }
    ok(kernelCode === 'VMU_INVALID_ARGUMENT', '§4d. ★★ `kernel.records.list({limit:-3})` refuses at the KERNEL, so no caller can bypass the host guard', { code: kernelCode })

    const two = await h.call('vibe_vmu_records', { action: 'list', limit: 2 })
    ok(two.ok === true && (two.records || []).length <= 2 && two.limitUsed === 2 && two.limitSource === 'caller',
      '§4e. ★★ a legal page size is APPLIED and echoed back (`limitUsed:2`, `limitSource:"caller"`)', { returned: (two.records || []).length, limitUsed: two.limitUsed, limitSource: two.limitSource })
    const all = await h.call('vibe_vmu_records', { action: 'list', limit: 0 })
    ok(all.ok === true && all.limitUsed === 0 && typeof all.limitMeans === 'string' && all.limitMeans.length > 0,
      '§4f. `limit:0` reads as "every row" and says so', { limitUsed: all.limitUsed, means: all.limitMeans && String(all.limitMeans).slice(0, 70) })
    const none = await h.call('vibe_vmu_records', { action: 'list' })
    ok(none.ok === true && none.limitUsed === null && typeof none.limitMeans === 'string' && /limit/.test(String(none.limitMeans)),
      '§4g. omitting `limit` says WHOSE cap applies instead of implying a page size', { limitUsed: none.limitUsed, means: none.limitMeans && String(none.limitMeans).slice(0, 90) })
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── 5. P1-3: `recoverPlan().ok` is DERIVED FROM ITS OWN STEPS ───────────────────────────────────────────────────────
console.log('=== 5. P1-3: a plan cannot say "fine" while a step says "cannot run" ===')
{
  const bare = createResume({ clock: () => 1000 })
  const plan = bare.recoverPlan({ reason: 'run254' })
  ok(Array.isArray(plan.steps) && plan.steps.length > 0, '§5a. the plan has steps (non-empty guard before deriving `ok`)', { steps: stepNames(plan.steps) })
  const failedSteps = plan.steps.filter((s) => s && s.ok === false)
  ok(failedSteps.length > 0, '§5b. this plan really has a step that cannot run (no store was injected)', { failed: failedSteps.map((s) => s.step) })
  ok(plan.ok === false, '§5c. ★★★ and `plan.ok` is FALSE — it is no longer a constant `true` beside a failing step', { ok: plan.ok })
  ok(plan.ok === derivedPlanOk(plan.steps), '§5d. ★★ `plan.ok` is the SAME conjunction recomputed from the steps (one answer, two sources agree)',
    { planOk: plan.ok, derived: derivedPlanOk(plan.steps) })
  const failedNames = failedSteps.map((s) => s.step)
  ok(sameStepNames(plan.failedSteps, failedNames),
    '§5e. `failedSteps` names exactly the steps whose `ok` is false', { failedSteps: plan.failedSteps })
  const blockingNames0 = stepNames(plan.blocking)
  ok(sameStepNames(blockingNames0, failedNames) && blockingNames0.indexOf('read') !== -1,
    '§5f. ★★ `blocking[]` names each one with the SAME step name the act reports', { blocking: plan.blocking })
  ok(typeof plan.okMeans === 'string' && /could NOT run/.test(plan.okMeans),
    '§5g. and the sentence explains the derived answer instead of repeating the flag', { means: plan.okMeans && String(plan.okMeans).slice(0, 90) })

  // A plan built over a real store: different steps fail (no roster/mailbox seam), and `ok` must still be derived.
  const withStore = createResume({ store: mkStore(), clock: () => 1000 })
  const plan2 = withStore.recoverPlan({ reason: 'run254-store' })
  ok(Array.isArray(plan2.steps) && plan2.steps.length > 0, '§5h. the store-backed plan has steps (non-empty guard)', { steps: stepNames(plan2.steps) })
  ok(plan2.ok === derivedPlanOk(plan2.steps), '§5i. ★★★ the store-backed plan obeys the same derivation (no second opinion)',
    { planOk: plan2.ok, derived: derivedPlanOk(plan2.steps) })
  ok(plan2.blocking.length === plan2.failedSteps.length && plan2.blocking.length > 0,
    '§5j. and its blocking list is exactly its failed steps', { blocking: plan2.blocking, failedSteps: plan2.failedSteps })
  const blockingNames = stepNames(plan2.blocking)
  ok(sameStepNames(blockingNames, stepNames(plan2.steps.filter((s) => s && s.ok === false))),
    '§5k. every blocking step name is a step name of this very plan (the names cannot drift)', { blocking: blockingNames })
}

// ── 6. P1-6: an unreadable DELIVERY SHAPE is refused at the boundary, by name ─────────────────────────────────────────
console.log('=== 6. P1-6: a delivery adapter returning the wrong shape is named, not read as silence ===')
{
  // A host delivery envelope (`{output:[…]}`) is the shape a delegated child RESULT has, not a reply. On the broken
  // build it flowed on as "no reply text" (VMU_TURN_NO_FENCE / VMU_ENGINE_UNAVAILABLE) and looked like a silent member.
  const bad = mkKernel(async () => ({ output: [{ type: 'text', text: 'x' }] }))
  await bad.spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  const refused = await bad.spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(refused.ok === false && refused.code === 'VMU_TURN_DELIVERY_SHAPE',
    '§6a. ★★★ the turn is refused as `VMU_TURN_DELIVERY_SHAPE` — a delivery defect, not a silent member', { ok: refused.ok, code: refused.code })
  const msg = String(refused.message || '')
  ok(/an object with keys \[output\]/.test(msg),
    '§6b. ★★ the message names the keys that actually arrived, so the adapter can be fixed', { message: msg.slice(0, 200) })
  // The actionable half of a refusal is the HINT (what to return instead); this is where the three accepted shapes and
  // the contract section live — asserting on `message` alone would pass a refusal that never told the adapter how to fix it.
  const hint6 = String(refused.hint || '')
  ok(/three accepted shapes/.test(hint6) && /docs\/26/.test(hint6),
    '§6c. and the HINT names the accepted shapes, so the refusal is actionable', { hint: hint6.slice(0, 300) })
  ok(/NOT a member that stayed silent/.test(msg) && /NOT a reply without a fence/.test(msg),
    '§6d. ★★ it explicitly separates this from the two nearby-looking readings (silence, missing fence)', { message: msg.slice(0, 300) })

  const weird = mkKernel(async () => [1, 2, 3])
  await weird.spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  const arr = await weird.spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(arr.ok === false && arr.code === 'VMU_TURN_DELIVERY_SHAPE' && /an array/.test(String(arr.message || '')),
    '§6e. an ARRAY is refused with its own wording, not read as a reply', { code: arr.code, message: String(arr.message || '').slice(0, 120) })

  // The three accepted shapes still pass: a fence string, and the awaiting envelope.
  const good = mkKernel(async () => '```json\n{"say":"hello"}\n```')
  await good.spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  const fine = await good.spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(fine.ok === true, '§6f. a normal fence reply still applies (the new gate does not refuse the good path)', { ok: fine.ok, code: fine.code })

  const awaiting = mkKernel(async () => ({ awaiting: true, memberPrompt: { member: 'm1', text: 'prompt' } }))
  await awaiting.spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  const held = await awaiting.spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(held.ok === true && held.awaiting === true && held.code === undefined,
    '§6g. ★★ the `{awaiting:true}` envelope is NOT mistaken for a shape error (one of the three accepted shapes)',
    { ok: held.ok, awaiting: held.awaiting, code: held.code })
}

console.log('')
console.log('=== VMU RUN 254 FIELD ISOLATION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
}
