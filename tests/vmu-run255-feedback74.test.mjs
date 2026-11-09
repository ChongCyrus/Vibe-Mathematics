// tests/vmu-run255-feedback74.test.mjs — RUN 255 / task-82 (TB-2606-A kernel half + TB-2610 policy decision).
//
// WHY THIS FILE EXISTS: run 74 (build 67fb601a) handed the kernel five readings that were TRUE but UNREADABLE, and the
// fixes for them shipped without a single assertion that would go red if they were reverted. Every section below drives
// the REAL kernel (the harness for whole turns, the meeting service for the meeting faces) and reads the answer from an
// INDEPENDENT source where one exists (the durable records store, the library rows, the settings registry) instead of
// only re-reading the sentence the fix just wrote.
//
//   · §1 FEEDBACK74 #1 — a receipt that says `executed:2, skipped:1` and nothing else reduces the reply to two numbers.
//     `appliedFieldCount` / `failedFieldCount` / `skippedFields` are now ALWAYS present (0 / [] when there is nothing),
//     with the SAME element shape the failed-turn error carries. §1a pins a fully successful round, §1b a partial one
//     (two good fields really land, read back from the durable store), §1c the failed ROW of a drive batch.
//   · §2 FEEDBACK74 #2 — "no meeting bound" and "the text names a meeting that does not exist" were the same skip. The
//     rule pinned here: a skip of reason `no-meeting-bound` whose text names an `m-<id>` token is re-coded
//     `VMU_MEETING_NOT_FOUND` (with the id and a REACHABLE INSTEAD hint) ONLY when the meeting face refuses that id
//     with `VMU_NO_SUCH_OBJECT`; a REAL id still reads `no-meeting-bound`, and text with no id stays there too.
//   · §3 FEEDBACK74 #4 — the delivery budget. Default is 1800000 ms, a setting overrides it, and the SAME number is read
//     by `turnLoop()` (what the seam times out on) and by the receipt (`attribution().deliveryBudgetMs`). A harvested
//     late turn says WHY it was allowed, and a thrown delivery keeps `waitedMs` / `partial` / `stillRunning`.
//   · §4 FEEDBACK74 #3 — two codes, two boundaries. Member prose without a fence is `VMU_TURN_NO_FENCE` (correct
//     refusal); a delivery adapter returning a shape the kernel cannot read is `VMU_TURN_DELIVERY_SHAPE`. Each names
//     the other so a reader cannot apply the wrong one.
//   · §5 FEEDBACK74 #7 — `excluded` mixed a count and two id lists. The three old keys are kept for compatibility and
//     each one now has its symmetric partner (`shapeMismatchIds` / `noWriterCount` / `timeUnknownCount`), with the
//     identities recomputed HERE from the library rows.
//   · §6 FEEDBACK74 #9/#10 + TB-2610 — the appointment receipt names the seats it had to skip with the SAME list as
//     `nonAttending`, `startReadsMeans` separates the attendance baseline (`openedAt`) from the real opening
//     (`activatedAt`), and the late-admission DEFAULT is now `chair` while a meeting that RECORDED `open` keeps it.
//
// WHAT IT DOES NOT PROVE (named so nobody reads more into it than there is): it does not drive a live model and it does
// not measure how long a real delivery takes. The delivered-late receipt is produced from a SEAM that reports the late
// facts, which is exactly the contract `host-deliver.js` satisfies; the real wall-clock path is the T1 run's job.
//
// RULE E: every `.every(...)` / loop below is preceded by an explicit NON-EMPTY assertion, and deep comparisons live in
// helpers that never call `ok(`.
//
// Run: node tests/vmu-run255-feedback74.test.mjs   (last line: === VMU RUN 255 FEEDBACK74: N passed, M failed ===)
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href
const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const [, , ...only] = process.argv
const pick = (name) => only.length === 0 || only.some((s) => name.startsWith(s))

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
const section = (name) => console.log('\n' + name)
const j = (x) => JSON.stringify(x)

// ── helpers: the independent criteria live here, and NONE of them call `ok(` (RULE E) ────────────────────────────────
const fenceOf = (payload) => '```json\n' + j(payload) + '\n```'
const bootHarness = async (deliver) => {
  const { boot } = await import(HARNESS)
  const root = mkdtempSync(join(tmpdir(), 'vmu255-'))
  const h = await boot({ root, clock: () => NOW, withPrompt: true, deliver })
  h.root = root
  return h
}
const asMember = (id) => ({ as: { agent: { id } } })
const hasKey = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)
const idsOf = (rows) => (Array.isArray(rows) ? rows.map((r) => String(r && r.id)) : [])
const sortedSame = (a, b) => {
  const x = (Array.isArray(a) ? a : []).map(String).sort()
  const y = (Array.isArray(b) ? b : []).map(String).sort()
  return j(x) === j(y)
}
/** The element shape the failed-turn ERROR face promises: the same eight names, no more and no fewer. */
const SKIPPED_FIELD_KEYS = ['cause', 'code', 'face', 'field', 'hint', 'message', 'op', 'why']
const skippedFieldKeys = (row) => Object.keys(row || {}).sort()
const sameSkippedShape = (row) => j(skippedFieldKeys(row)) === j(SKIPPED_FIELD_KEYS)
/** Counts, recomputed from the receipt the way a reader would: the arrays must AGREE with the numbers beside them. */
const countsAgree = (receipt) => receipt.appliedFieldCount === (Array.isArray(receipt.executed) ? receipt.executed.length : receipt.executed)
  && receipt.failedFieldCount === (Array.isArray(receipt.skippedFields) ? receipt.skippedFields.length : -1)
/** Independent time audit over library rows: null / unparsable timestamps are the rows a window cannot judge. */
const unjudgeableTimeIds = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r && (r.updatedAt === null || r.updatedAt === undefined || r.updatedAt === ''
    ? true
    : !(typeof r.updatedAt === 'number' ? Number.isFinite(r.updatedAt) : Number.isFinite(Number(r.updatedAt)))))
  .map((r) => String(r.id))
const writerlessIds = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((r) => {
    if (!r) return true
    for (const f of ['writer', 'by', 'owner']) {
      if (typeof r[f] === 'string' && r[f].trim() !== '') return false
    }
    return true
  })
  .map((r) => String(r.id))
const mkKernel = (opts) => {
  const kernel = createKernel(Object.assign({
    clock: () => 1000,
    settings: {},
    slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  }, opts || {}))
  const specs = toolSpecs({ kernel, settings: (opts && opts.settings) || {}, turnTool: true, meetingTool: true, controlTool: true })
  return { kernel, spec: (n) => specs.find((s) => s.name === n) }
}
/** Drive ONE kernel-seam round: hire a member, then step. The seam decides the reply envelope. */
const driveOnce = async (mk) => {
  const hire = await mk.spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  if (!hire || hire.ok !== true) throw new Error('the probe could not hire a member: ' + j(hire))
  return mk.spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
}
const rec = (over) => {
  const box = new Map(Object.entries(over || {}))
  return { get: (k) => (box.has(k) ? box.get(k) : null), has: (k) => box.has(k), all: () => Object.fromEntries(box), vals: () => [...box.values()] }
}
const ROSTER = [{ id: 'acad', slot: 'chair' }, { id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }, { id: 'r-temp', slot: 'temp' }]
const seats = () => ROSTER.map((r) => ({ id: r.id, slot: r.slot }))
const mkMeetings = (over) => createMeetings({
  clock: () => NOW,
  settings: rec(Object.assign({ 'vmu.meetings.attendDeniedSeats': ['temp'], 'vmu.meetings.quorumMin': 1 }, over || {})),
  log: () => {},
  bus: { emit: () => {} },
  members: { roster: seats },
  mail: { send: () => ({ ok: true, ids: ['mail-x'] }) },
})

// ── 1. FEEDBACK74 #1: THE THREE COUNTS ARE ALWAYS THERE, AND THEY ARE THE SAME THREE NAMES ──────────────────────────
if (pick('1')) {
  section('=== 1. field counts: always present, same element shape as the failed-turn error ===')
  {
    const h = await bootHarness(async () => fenceOf({ progress: { track: 'progress', title: 'only-good', body: 'b' } }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const receipt = (s && s.receipt) || {}
    ok(s.ok === true, '§1a a fully successful round still returns ok:true', s && s.code)
    ok(hasKey(receipt, 'appliedFieldCount') && hasKey(receipt, 'failedFieldCount') && hasKey(receipt, 'skippedFields'),
      '§1a the three names are PRESENT even when nothing was skipped (absent and zero must not look the same)',
      Object.keys(receipt).slice(0, 12))
    ok(receipt.appliedFieldCount === 1, '§1a appliedFieldCount counts the one field that landed', receipt.appliedFieldCount)
    ok(receipt.failedFieldCount === 0, '§1a failedFieldCount is 0 - a number, not a missing key', receipt.failedFieldCount)
    ok(Array.isArray(receipt.skippedFields) && receipt.skippedFields.length === 0,
      '§1a skippedFields is [] - and an EMPTY list means nothing was refused, not that the reply carried nothing',
      receipt.skippedFields)
    ok(typeof receipt.skippedFieldsMeans === 'string' && receipt.skippedFieldsMeans.length > 60,
      '§1a the means travels with the empty list so [] is readable at all', receipt.skippedFieldsMeans)
    ok(countsAgree(receipt) === true, '§1a the counts agree with the arrays beside them (no second arithmetic)')
    ok(receipt.skipped === 0 && receipt.executed === 1, '§1a the old count-only names still answer the same thing',
      { executed: receipt.executed, skipped: receipt.skipped })
  }
  {
    const h = await bootHarness(async () => fenceOf({
      progress: { track: 'progress', title: 'good-1', body: 'b' },
      task_create: { title: 'good-2' },
      record: { track: 'no-such-track', text: 'x' },
    }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const receipt = (s && s.receipt) || {}
    ok(s.ok === true, '§1b ONE bad field does not abort the round (the defect: it used to)', s && s.code)
    ok(receipt.appliedFieldCount === 2 && receipt.executed === 2,
      '§1b appliedFieldCount names both fields that landed', { applied: receipt.appliedFieldCount, executed: receipt.executed })
    ok(receipt.failedFieldCount === 1 && receipt.skippedFields.length === 1,
      '§1b failedFieldCount names the one that refused', { failed: receipt.failedFieldCount, rows: receipt.skippedFields.length })
    const row = receipt.skippedFields[0] || {}
    ok(row.field === 'record' && row.face === 'vmu.library' && row.op === 'record',
      '§1b the skipped row names WHICH field and WHICH face refused it', row)
    ok(row.code === 'VMU_INVALID_ARGUMENT', '§1b and the refusal code is the real one', row.code)
    ok(typeof row.hint === 'string' && row.hint.indexOf('declared tracks') >= 0,
      '§1b the row carries the fix, not just the verdict', row.hint)
    ok(sameSkippedShape(row) === true,
      '§1b the element shape is EXACTLY the eight names the failed-turn error carries', skippedFieldKeys(row))
    // EXTERNAL: the two good fields must really be in the stores, not only counted in the receipt.
    const recs = await h.call('vibe_vmu_records', { action: 'list', limit: 0 })
    const tasks = await h.call('vibe_v5_task_list', {})
    const recIds = idsOf(recs.records || [])
    const taskIds = idsOf(tasks.tasks || tasks.items || [])
    ok(recIds.length === 1 && recIds.indexOf('rec-1') >= 0,
      '§1b INDEPENDENT: the progress field really landed in the durable records store', recIds)
    ok(taskIds.length === 1 && taskIds.indexOf('t-1') >= 0,
      '§1b INDEPENDENT: the task field really landed in the task ledger', taskIds)
  }
  {
    const h = await bootHarness(async () => fenceOf({ record: { track: 'no-such-track', text: 'x' } }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h.call('vibe_vmu_turn', { op: 'drive', members: ['r-1'], rounds: 1 })
    const rows = Array.isArray(s && s.receipts) ? s.receipts : []
    ok(rows.length === 1, '§1c the driven batch produced one round row', { rows: rows.length, code: s && s.code })
    const row = rows[0] || {}
    ok(row.failed === true, '§1c that single round failed (every dispatchable field refused)', row.code)
    ok(hasKey(row, 'appliedFieldCount') && hasKey(row, 'failedFieldCount') && hasKey(row, 'skippedFields'),
      '§1c a FAILED round row carries the same three names as a successful one', Object.keys(row).slice(0, 12))
    ok(row.appliedFieldCount === 0 && row.failedFieldCount === 1,
      '§1c and the counts say nothing landed / one refused', { applied: row.appliedFieldCount, failed: row.failedFieldCount })
    ok(row.skippedFields.length === 1 && row.skippedFields[0].code === 'VMU_INVALID_ARGUMENT',
      '§1c with the same element shape', row.skippedFields)
  }
}

// ── 2. FEEDBACK74 #2: A GHOST MEETING ID IS A NAMED SKIP, AND A REAL ID IS NOT ──────────────────────────────────────
if (pick('2')) {
  section('=== 2. ghost meeting: one predicate, two answers (no id / ghost id / real-but-unbound id) ===')
  {
    const h = await bootHarness(async () => fenceOf({
      say: 'm-ghost-74 we should decide this now',
      progress: { track: 'progress', title: 'p1', body: 'b' },
    }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const receipt = (s && s.receipt) || {}
    const row = (Array.isArray(receipt.skippedDetail) ? receipt.skippedDetail : [])[0] || {}
    ok(s.ok === true, '§2a a ghost id in free text does not abort the turn', s && s.code)
    ok(receipt.skipped === 1, '§2a the line is skipped, not dispatched', receipt.skipped)
    ok(row.reason === 'ghost-meeting', '§2a the skip reason names the GHOST case', row.reason)
    ok(row.code === 'VMU_MEETING_NOT_FOUND',
      '§2a the code is the named one, so it cannot be confused with having no meeting', row.code)
    ok(row.meetingId === 'm-ghost-74', '§2a and the receipt carries the id that was not found', row.meetingId)
    ok(typeof row.hint === 'string' && row.hint.indexOf('REACHABLE INSTEAD') >= 0,
      '§2a the hint says what to call instead (REACHABLE INSTEAD)', row.hint)
    ok(Array.isArray(row.missingMeetings) && row.missingMeetings.length === 1 && row.missingMeetings[0] === 'm-ghost-74',
      '§2a and the missing list is a list, not a sentence to parse', row.missingMeetings)
    ok(receipt.failedFieldCount === 0 && receipt.skippedFields.length === 0,
      '§2a a ghost SKIP is not a dispatch REFUSAL (the two counts stay honest)', { failed: receipt.failedFieldCount })
    const recs = await h.call('vibe_vmu_records', { action: 'list', limit: 0 })
    ok(idsOf(recs.records || []).length === 1, '§2a INDEPENDENT: the other field still landed in the durable store',
      idsOf(recs.records || []))
  }
  {
    const h = await bootHarness(async () => fenceOf({ say: 'we should decide this now' }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const row = (((s && s.receipt) || {}).skippedDetail || [])[0] || {}
    ok(row.reason === 'no-meeting-bound', '§2b text with NO id keeps the old reason', row.reason)
    ok(row.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§2b and the old code - nothing was probed because nothing was named',
      row.code)
    ok(!hasKey(row, 'meetingId'), '§2b there is no ghost id to report, and none is invented', Object.keys(row))
  }
  {
    const h = await bootHarness(async () => fenceOf({ say: 'placeholder' }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const convened = await h.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'REAL one', type: 'ordinary' })
    const realId = String((convened && (convened.meeting || convened.id)) || '')
    ok(realId !== '', '§2c the probe really convened a meeting, so the next assertion has a live id to name', convened)
    const h2 = await bootHarness(async () => fenceOf({ say: realId + ' we should decide this now' }))
    await h2.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const s = await h2.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const row = (((s && s.receipt) || {}).skippedDetail || [])[0] || {}
    ok(row.reason === 'no-meeting-bound', '§2c a REAL id that is simply not bound keeps the old reason (the probe is a probe, not a guess)',
      row.reason)
    ok(row.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§2c and the old code', row.code)
    ok(!hasKey(row, 'meetingId'), '§2c no ghost is manufactured for a meeting the kernel really has', Object.keys(row))
  }
}

// ── 3. FEEDBACK74 #4: ONE BUDGET, TWO READERS, AND A LATE TURN THAT SAYS WHY ─────────────────────────────────────────
if (pick('3')) {
  section('=== 3. delivery budget: default 1800000, set by a setting, and read by both the loop and the receipt ===')
  {
    // ★ TB-2629: the default is NOT a literal in this test and NOT a literal in the kernel - both faces read the ONE
    // declaration in settings/schema.js, which is exactly what the one-shot seam (host-deliver.js) reads too. Asserting
    // `loop.deliveryTimeoutMs === 1800000` from a naked settings object measured the kernel literal against itself and
    // passed while the seam was still killing turns at 180000 ms (prereview, P0-1). The declaration is the subject now.
    const def = SETTING_DEFS.find((d) => d && d.key === 'vmu.turn.deliveryTimeoutMs')
    ok(def && typeof def.def === 'number' && def.def > 0,
      '§3a the delivery budget is a DECLARED setting (one truth, read by both the seam and the loop)', def && def.def)
    const declared = def && typeof def.def === 'number' ? def.def : null
    ok(declared !== null && declared > 900000,
      '§3a the declared default is above the old 900000 ms budget (run 74 measured a legal turn at 982572 ms)', declared)
    const mk = mkKernel({})
    const loop = mk.kernel.turn.turnLoop()
    ok(loop.deliveryTimeoutMs === declared,
      '§3a the KERNEL default EQUALS the declared default - one table, no second literal', { loop: loop.deliveryTimeoutMs, declared })
    ok(loop.deliveryTimeoutMs !== 180000,
      '§3a and it is NOT the seam side literal 180000 that prereview measured (the 10x split)', loop.deliveryTimeoutMs)
    ok(loop.deliveryGraceMs === Math.floor(loop.deliveryTimeoutMs / 4),
      '§3a the grace window follows the budget (a quarter), not a second constant', loop.deliveryGraceMs)
    ok(loop.deliverySeamBudgetMs === loop.deliveryTimeoutMs + loop.deliveryGraceMs,
      '§3a and the seam budget is DERIVED from the same two numbers', loop.deliverySeamBudgetMs)
    ok(typeof loop.deliveryBudgetSource === 'string' && loop.deliveryBudgetSource.indexOf('schema.js') >= 0,
      '§3a the loop names WHERE the default came from (the declaration, not a kernel literal)', loop.deliveryBudgetSource)
    ok(loop.abandonAfterMs > loop.deliverySeamBudgetMs && loop.timeoutOrder === 'backstop-after-seam',
      '§3a the backstop sits ABOVE the seam budget and the order is named (prereview: the 10x split made the order lie)',
      { abandon: loop.abandonAfterMs, seam: loop.deliverySeamBudgetMs, order: loop.timeoutOrder })
    ok(loop.abandonAfterMs === Math.max(600000, loop.deliveryTimeoutMs + 600000),
      '§3a the backstop is DERIVED from the same resolved budget, not from a second read of the setting', loop.abandonAfterMs)
  }
  {
    const mk = mkKernel({
      settings: { 'vmu.turn.deliveryTimeoutMs': 2000 },
      deliverTurn: async () => ({
        reply: fenceOf({ task_create: { title: 'late-1' } }),
        deliveredLate: true, deliveryWaitedMs: 5000, deliveryDeadlineMs: 2000, deliveryGraceMs: 500,
      }),
    })
    const loop = mk.kernel.turn.turnLoop()
    ok(loop.deliveryTimeoutMs === 2000, '§3b the setting wins over the kernel default', loop.deliveryTimeoutMs)
    const res = await driveOnce(mk)
    ok(res.ok === true, '§3b the late (harvested) turn still applies', res && res.code)
    const att = mk.kernel.turn.attribution()
    ok(att.deliveryBudgetMs === loop.deliveryTimeoutMs,
      '§3b the receipt budget EQUALS the loop budget - a timeout and its receipt cannot name two numbers',
      { receipt: att.deliveryBudgetMs, loop: loop.deliveryTimeoutMs })
    ok(typeof att.deliveryBudgetSource === 'string' && att.deliveryBudgetSource.indexOf('vmu.turn.deliveryTimeoutMs') >= 0,
      '§3b and the source says WHERE the number came from', att.deliveryBudgetSource)
    ok(att.deliveredLate === true, '§3b the late fact stays true (a slow turn is not silently called on time)', att.deliveredLate)
    ok(att.deliveryWaitedMs === 5000 && att.deliveryDeadlineMs === 2000,
      '§3b the milliseconds travel as numbers', { waited: att.deliveryWaitedMs, deadline: att.deliveryDeadlineMs })
    ok(typeof att.deliveredLateMeans === 'string' && att.deliveredLateMeans.indexOf('HARVESTED') >= 0
      && att.deliveredLateMeans.indexOf('not whether the work counts') >= 0,
      '§3b a late turn says WHY it was allowed instead of leaving a bare boolean', att.deliveredLateMeans)
    ok(att.deliveryBudgetMs === loop.deliveryTimeoutMs,
      '§3b ONE computation, two readers: the receipt and turnLoop report the same budget',
      { receipt: att.deliveryBudgetMs, loop: loop.deliveryTimeoutMs })
  }
  {
    const threw = new Error('the delivery seam timed out after 5000 ms')
    threw.code = 'VMU_TURN_DELIVERY_TIMEOUT'
    threw.waitedMs = 5000
    threw.deliveryTimeoutMs = 2000
    threw.stillRunning = true
    threw.partial = { text: 'half a transcript', blocks: 3 }
    const mk = mkKernel({ settings: { 'vmu.turn.deliveryTimeoutMs': 2000 }, deliverTurn: async () => { throw threw } })
    const res = await driveOnce(mk)
    ok(res.ok === false && res.code === 'VMU_TURN_DELIVERY_TIMEOUT', '§3c a thrown delivery is still a named failure',
      { code: res && res.code })
    ok(res.waitedMs === 5000 && res.deliveryTimeoutMs === 2000,
      '§3c the failure receipt keeps the wait it measured (it used to live only in status)', { waited: res.waitedMs })
    ok(res.partial && res.partial.text === 'half a transcript' && res.partial.blocks === 3,
      '§3c and the partial transcript that DID arrive, so a timeout is not read as nothing happened', res.partial)
    const fail = ((mk.kernel.turn.status() || {}).counts || {}).deliveryLastFail || {}
    ok(fail.stillRunning === true, '§3c the status row still says the seam was STILL RUNNING when the loop gave up', fail.stillRunning)
    ok(fail.waitedMs === null || fail.waitedMs === undefined || Number.isFinite(fail.waitedMs),
      '§3c the status row is readable, not a second shape', fail.waitedMs)
  }
}

// ── 4. FEEDBACK74 #3: TWO CODES, TWO BOUNDARIES, AND EACH ONE NAMES THE OTHER ────────────────────────────────────────
if (pick('4')) {
  section('=== 4. prose without a fence is NO_FENCE; an unreadable ADAPTER envelope is DELIVERY_SHAPE ===')
  {
    const mk = mkKernel({ deliverTurn: async () => 'just some prose with no fenced object' })
    const res = await driveOnce(mk)
    ok(res.ok === false && res.code === 'VMU_TURN_NO_FENCE',
      '§4a a member reply that is prose and nothing else is refused as NO_FENCE (correct, not a bug)', res && res.code)
    ok(String(res.message || '').indexOf('DELIVERY ADAPTER') < 0,
      '§4a the member-side code does NOT describe the adapter boundary', res.message)
    ok(String(res.hint || '').indexOf('VMU_TURN_DELIVERY_SHAPE') >= 0,
      '§4a and its hint POINTS AT the other code so the two cannot be applied to each other', res.hint)
  }
  {
    const mk = mkKernel({ deliverTurn: async () => ({ output: [{ type: 'text', text: 'x' }] }) })
    const res = await driveOnce(mk)
    ok(res.ok === false && res.code === 'VMU_TURN_DELIVERY_SHAPE',
      '§4b an adapter that returns a shape the kernel cannot read is DELIVERY_SHAPE', res && res.code)
    ok(String(res.message || '').indexOf('DELIVERY ADAPTER') >= 0 && String(res.message || '').indexOf('[output]') >= 0,
      '§4b the message says it is the ADAPTER boundary and names the keys it actually received', res.message)
    ok(String(res.message || '').indexOf('VMU_TURN_NO_FENCE') >= 0,
      '§4b and it POINTS AT the member-side code instead of swallowing that case', res.message)
    ok(String(res.hint || '').indexOf('three accepted shapes') >= 0 && String(res.hint || '').indexOf('docs/26') >= 0,
      '§4b the hint names the three accepted shapes and where they are written down', res.hint)
  }
  {
    const mk = mkKernel({ deliverTurn: async () => [1, 2, 3] })
    const res = await driveOnce(mk)
    ok(res.ok === false && res.code === 'VMU_TURN_DELIVERY_SHAPE' && String(res.message || '').indexOf('an array') >= 0,
      '§4c an ARRAY gets the same code and is described as an array (no shape is guessed into meaning)', res.message)
  }
}

// ── 5. FEEDBACK74 #7: excluded KEEPS ITS OLD KEYS AND GAINS A SYMMETRIC PARTNER FOR EACH ─────────────────────────────
if (pick('5')) {
  section('=== 5. excluded: three old keys kept, each count has its ids and each ids list has its count ===')
  {
    const h = await bootHarness(async () => fenceOf({ progress: { track: 'progress', title: 'p1', body: 'b' } }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    await h.call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'the sky is blue' }, asMember('r-1'))
    const root = h.root
    mkdirSync(join(root, 'Members', 'r-2', 'Propos'), { recursive: true })
    writeFileSync(join(root, 'Members', 'r-2', 'Propos', 'legacy-card.md'),
      '---\nid: legacy-card\nkind: proposition\ntitle: legacy card\nstatus: open\nowner: r-2\nupdatedAt: not-a-date\n---\n\nbody\n')
    const listed = await h.call('vibe_vmu_records', { action: 'list', since: '2027-01-01T00:00:00.000Z', limit: 0 })
    const ex = (listed && listed.excluded) || {}
    ok(listed.ok === true, '§5a the merged, windowed list answers', listed && listed.code)
    ok(Array.isArray(ex.noWriter) && Array.isArray(ex.timeUnknown) && Number.isInteger(ex.shapeMismatch),
      '§5a the MERGED receipt keeps the three OLD keys with their old types (compatibility is not a rewrite)', ex)
    ok(ex.timeUnknown.indexOf('legacy-card') >= 0,
      '§5a INDEPENDENT: the on-disk card with an unreadable updatedAt is named by id in timeUnknown',
      { timeUnknown: ex.timeUnknown, rows: idsOf(h.kernel.library.list({ withWriter: true })) })
    ok(typeof (listed && listed.excludedMeans) === 'string' && listed.excludedMeans.length > 40,
      '§5a the means still explains which rows were dropped and why', listed && listed.excludedMeans)
  }
  {
    // The kernel side is where the SYMMETRIC keys live (the merged host receipt is TB-2617's file this round). A row
    // written with NO writer is the reachable subject for `noWriter`; the identity below is recomputed from the rows.
    const h = await bootHarness(async () => fenceOf({ progress: { track: 'progress', title: 'p1', body: 'b' } }))
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const put = h.kernel.records.put({ track: 'state', kind: 'state', title: 'no-writer-row', body: 'x' })
    ok(put && put.ok === true, '§5b the probe wrote one row with NO writer (the subject exists)', put && put.code)
    const allRows = h.kernel.records.list({ limit: 0 })
    const rows = Array.isArray(allRows.items) ? allRows.items : []
    const auditWriterless = rows.filter((r) => {
      for (const f of ['writer', 'by', 'owner']) if (typeof r[f] === 'string' && r[f].trim() !== '') return false
      return true
    }).map((r) => String(r.id))
    ok(rows.length >= 1, '§5b the records store really has a row to judge', rows.length)
    const filtered = h.kernel.records.list({ by: 'r-1', limit: 0 })
    const kex = (filtered && filtered.excluded) || {}
    ok(filtered.ok === true, '§5b the kernel records list answers a by-filter', filtered && filtered.code)
    ok(Array.isArray(kex.noWriter) && Array.isArray(kex.timeUnknown) && Number.isInteger(kex.shapeMismatch),
      '§5b the three old keys are still there on the kernel surface too', kex)
    ok(Number.isInteger(kex.noWriterCount) && Number.isInteger(kex.timeUnknownCount) && Array.isArray(kex.shapeMismatchIds),
      '§5b each old key now has a symmetric partner (shapeMismatchIds / noWriterCount / timeUnknownCount)',
      { noWriterCount: kex.noWriterCount, timeUnknownCount: kex.timeUnknownCount, shapeMismatchIds: kex.shapeMismatchIds })
    ok(sortedSame(kex.noWriter, auditWriterless) === true,
      '§5b INDEPENDENT: noWriter equals the rows that carry no writer, read from the unfiltered listing',
      { receipt: kex.noWriter, audit: auditWriterless })
    ok(kex.noWriterCount === kex.noWriter.length, '§5b IDENTITY: noWriterCount equals noWriter.length', kex.noWriter.length)
    ok(kex.shapeMismatch === kex.shapeMismatchIds.length,
      '§5b IDENTITY: shapeMismatch (the count) equals shapeMismatchIds (the list)',
      { count: kex.shapeMismatch, ids: kex.shapeMismatchIds.length })
    ok(kex.timeUnknownCount === kex.timeUnknown.length, '§5b IDENTITY: timeUnknownCount equals timeUnknown.length',
      kex.timeUnknown.length)
    ok(typeof (filtered && filtered.excludedMeans) === 'string'
      && filtered.excludedMeans.indexOf('SYMMETRIC') >= 0
      && filtered.excludedMeans.indexOf('COUNT') >= 0 && filtered.excludedMeans.indexOf('ID LIST') >= 0
      && filtered.excludedMeans.indexOf('noWriterCount') >= 0 && filtered.excludedMeans.indexOf('shapeMismatchIds') >= 0,
      '§5b the means spells out WHICH half is a count and which is a list (the defect: a reader could not tell)',
      filtered && filtered.excludedMeans)
  }
}

// ── 6. FEEDBACK74 #9/#10 + TB-2610: ONE LIST, TWO INSTANTS, AND THE CHAIR DEFAULTS THE DOOR ──────────────────────────
if (pick('6')) {
  section('=== 6. meeting faces: nonAttending is the same list as skipped.attendDenied, and lateAdmission defaults to chair ===')
  {
    const svc = mkMeetings()
    const opened = svc.open({ chair: 'acad', actor: 'acad', roster: ROSTER.map((r) => r.id), materials: 'x', at: NOW + HOUR })
    const receipt = (opened && opened.receipt) || opened || {}
    ok(receipt.ok === true || opened.ok === true, '§6a the appointment opens', receipt && receipt.code)
    const skipped = receipt.skipped || {}
    ok(Array.isArray(skipped.attendDenied) && skipped.attendDenied.length === 1 && skipped.attendDenied[0] === 'r-temp',
      '§6a the receipt names the seat it could not invite', skipped.attendDenied)
    ok(Array.isArray(receipt.nonAttending) && sortedSame(receipt.nonAttending, skipped.attendDenied) === true,
      '§6a nonAttending is the SAME list as skipped.attendDenied (one derivation, two names)', receipt.nonAttending)
    ok(Number.isInteger(skipped.count) && skipped.count === skipped.attendDenied.length,
      '§6a and the count is that list length', skipped.count)
    ok(typeof receipt.nonAttendingMeans === 'string' && receipt.nonAttendingMeans.indexOf('SAME list') >= 0,
      '§6a the means says the two names are one list, so a reader does not add them up', receipt.nonAttendingMeans)
    const view = svc.meetingView({ meeting: receipt.meeting || opened.meeting })
    ok(view && view.lateAdmission === 'chair', '§6b the DEFAULT late admission policy is chair (TB-2610 decision)',
      view && view.lateAdmission)
    ok(typeof (view && view.lateAdmissionMeans) === 'string' && view.lateAdmissionMeans.indexOf('THE DEFAULT IS "chair"') >= 0,
      '§6b the means states the default AND the reason (institutionally, a late arrival is a request to the chair)',
      view && view.lateAdmissionMeans)
    ok(typeof (view && view.startReadsMeans) === 'string'
      && view.startReadsMeans.indexOf('openedAt') >= 0 && view.startReadsMeans.indexOf('activatedAt') >= 0
      && view.startReadsMeans.indexOf('ATTENDANCE BASELINE') >= 0,
      '§6b startReadsMeans separates the attendance baseline (openedAt) from the real opening (activatedAt)',
      view && view.startReadsMeans)
  }
  {
    const svc = mkMeetings()
    const opened = svc.open({ chair: 'acad', actor: 'acad', roster: ROSTER.map((r) => r.id), materials: 'x', at: NOW + HOUR, lateAdmission: 'open' })
    const id = String((opened && (opened.meeting || (opened.receipt && opened.receipt.meeting))) || '')
    const view = svc.meetingView({ meeting: id })
    ok(view && view.lateAdmission === 'open', '§6c an EXPLICIT open is still open (the decision changed the default, not the option)',
      view && view.lateAdmission)
    ok(view && view.lateAdmissionMeans && view.lateAdmissionMeans.indexOf('open') >= 0,
      '§6c and the means still explains the open policy', view && view.lateAdmissionMeans)
  }
  {
    // MIGRATION: a meeting row written BEFORE the decision (no `lateAdmission` key) must read as the new default; a row
    // that RECORDED `open` must keep it. The row is rebuilt through the service own snapshot/restore, so the migration is
    // exercised on the durable shape, not on a settable field.
    const svc = mkMeetings()
    const opened = svc.open({ chair: 'acad', actor: 'acad', roster: ROSTER.map((r) => r.id), materials: 'x', at: NOW + HOUR })
    const id = String((opened && (opened.meeting || (opened.receipt && opened.receipt.meeting))) || '')
    const snap = svc.snapshot()
    const live = JSON.parse(snap.data.live)
    const rows = Array.isArray(live.__map) ? live.__map : []
    ok(rows.length === 1, '§6d the snapshot really carries the one meeting row (the migration has a subject)', rows.length)
    ok(rows[0] && rows[0][1] && typeof rows[0][1].lateAdmission === 'string',
      '§6d the row RECORDS the policy it was created with (that is what makes old meetings readable)', rows[0] && rows[0][1] && rows[0][1].lateAdmission)
    delete rows[0][1].lateAdmission
    snap.data.live = j(live)
    const migrated = mkMeetings()
    const restored = migrated.restore(snap)
    ok(restored === false || (restored && restored.ok !== false), '§6d the legacy row restores', restored)
    const legacyView = migrated.meetingView({ meeting: id })
    ok(legacyView && legacyView.lateAdmission === 'chair',
      '§6d a row with NO recorded policy reads as the NEW default (chair)', legacyView && legacyView.lateAdmission)
    const svc2 = mkMeetings()
    const opened2 = svc2.open({ chair: 'acad', actor: 'acad', roster: ROSTER.map((r) => r.id), materials: 'x', at: NOW + HOUR, lateAdmission: 'open' })
    const id2 = String((opened2 && (opened2.meeting || (opened2.receipt && opened2.receipt.meeting))) || '')
    const snap2 = svc2.snapshot()
    const live2 = JSON.parse(snap2.data.live)
    const rows2 = Array.isArray(live2.__map) ? live2.__map : []
    ok(rows2.length === 1, '§6e the second snapshot carries its row', rows2.length)
    const target = mkMeetings()
    target.restore(snap2)
    const keptView = target.meetingView({ meeting: id2 })
    ok(keptView && keptView.lateAdmission === 'open',
      '§6e a row that RECORDED open keeps open after the default changed (old meetings do not change behaviour overnight)',
      keptView && keptView.lateAdmission)
  }
}

console.log('')
console.log('=== VMU RUN 255 FEEDBACK74: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
