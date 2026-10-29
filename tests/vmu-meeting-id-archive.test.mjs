// tests/vmu-meeting-id-archive.test.mjs — ROUND 19 (live run 26, the institute's OWN acceptance report, item 4):
// ONE NAME, TWO OBJECTS.
//
// THE DEFECT CLASS THIS PINS. In live run 26 the office closed `m1` and the receipt said
// `ok:true, closeSemantics:"service-archives"`; the very next `list` / `status` / `summary` / `overview` calls still
// reported the meeting `open`. Six independent probe reconstructions (faithful call order, a second kernel, a fresh
// kernel over the same store, beat+due sweep) produced the CORRECT behaviour, so the resurrection itself is not
// reproduced here — but the hole that let the reading survive is real and is closed here:
//   `close()` moves the object into the archive, and `open({ id })` happily handed the SAME id to a brand new
//   meeting. So "m1 is open" and "m1 was closed" could both be true about ONE name, and no receipt said which object
//   answered. An archived id is now refused by name unless the caller reuses it deliberately, and both read faces
//   (`summary()` and `meetingView()`) NAME a live/archive twin instead of silently letting the live one win.
//
// WHAT IS ASSERTED (both directions, every state READ BACK — "set" is not "in force"):
//   ① setup: the pack convenes a SERVICE meeting and the chair really closes it (the closure is a fact with an instant);
//   ② after that closure the id answers as an ARCHIVED record (state `closed`, `archived:true`), not as a live one and
//      not as "no such meeting" — so the resurrection cannot be explained by "close only renamed it";
//   ③ opening the SAME id is refused by name `VMU_MEETING_ID_ARCHIVED`, and the refusal quotes the ARCHIVE's instant
//      (not "unrecorded"), so "when was it closed" needs no second lookup;
//   ④ the refusal names the deliberate way out (`reuseArchivedId:true`), i.e. it is a rail with a door, not a wall;
//   ⑤ with `reuseArchivedId:true` the name IS reusable, and `summary()` then reports `liveWhileArchived:true` with
//      `archivedView.closedAt` equal to the closure it actually recorded — the two objects are distinguishable;
//   ⑥ `meetingView()` (the face `vibe_vmu_meeting {action:"status"}` really returns) carries the same disclosure;
//   ⑦ a fresh id reports `liveWhileArchived:false` and says so — the field is not always-on noise;
//   ⑧ the guard leaves the archive untouched when it refuses (a refusal must not mutate).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)

let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  let parsed
  try { parsed = JSON.parse(await spec.execute(args, {})) } catch { parsed = undefined }
  return { parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-id-archive-'))
const b = await boot({ root, packs: ['v5r'] })
const kernel = b.handle.kernel
const svc = kernel.meetings
await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })

// ── ① THE PACK CONVENES, THE CHAIR CLOSES ────────────────────────────────────────────────────────────────────
console.log('=== 1. THE CLOSURE IS A FACT WITH AN INSTANT ===')
const convened = await call(b, 'vibe_v5_meeting', { agenda: 'R19 关会之后的同名会', kind: 'sync', member: 'r-chair' })
const mid = convened.parsed && convened.parsed.meeting
ok(convened.parsed && convened.parsed.ok === true && typeof mid === 'string' && mid !== '',
  'setup: the pack convened a SERVICE meeting (id read from the pack receipt, not from a kernel call)',
  convened.parsed && { meeting: mid, code: convened.parsed.code })
for (const m of ['r-chair', 'r-1']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
const closed = await call(b, 'vibe_vmu_meeting', { action: 'close', id: mid, member: 'r-chair', actor: 'r-chair', reason: 'R19 收会' })
ok(closed.parsed && closed.parsed.ok === true && closed.parsed.closeSemantics === 'service-archives',
  '① the chair closes it and the receipt claims the ARCHIVE (the claim this round is about)',
  closed.parsed && { ok: closed.parsed.ok, closeSemantics: closed.parsed.closeSemantics, code: closed.parsed.code })
const archived = svc.summary({ meeting: mid })
const closedAt = archived.closedAt
ok(archived.state === 'closed' && Number.isFinite(Number(closedAt)) && Number(closedAt) > 0,
  '① the archive holds ONE record for that id, state closed, with a real instant (RULE E: the record exists and carries a number)',
  { state: archived.state, closedAt })
const archiveBefore = svc.status().archived
ok(archiveBefore >= 1, '① the service counts at least that one archived meeting (RULE E: non-empty archive)', { archived: archiveBefore })

// ── ② AFTER THE CLOSURE THE ID IS UNADDRESSABLE IN THIS KERNEL ────────────────────────────────────────────────
console.log('=== 2. AFTER THE CLOSURE THIS KERNEL CANNOT ADDRESS THE ID ===')
const statusAfter = await call(b, 'vibe_vmu_meeting', { action: 'status', id: mid })
// ★ ROUND 37 (live run 37): the face used to answer `VMU_NO_SUCH_OBJECT` here, which said "never existed" about a
// meeting that was closed and archived a line earlier. An archived record is addressable; what must NOT happen is an
// answer that describes a LIVE meeting. So the assertion now pins the archived shape (closed + archived:true).
ok(statusAfter.parsed && statusAfter.parsed.ok === true && statusAfter.parsed.state === 'closed' && statusAfter.parsed.archived === true,
  '② `status` answers as the ARCHIVED record after the close (closed/archived, never live) — "close only renamed it" is ruled out in ONE kernel',
  statusAfter.parsed && { ok: statusAfter.parsed.ok, code: statusAfter.parsed.code, state: statusAfter.parsed.state, archived: statusAfter.parsed.archived })

// ── ③ REUSING THE NAME IS REFUSED, AND THE REFUSAL QUOTES THE ARCHIVE ─────────────────────────────────────────
console.log('=== 3. AN ARCHIVED NAME IS NOT SILENTLY REUSABLE ===')
// ★ WAVE 2 (E6 + debateSubjectGate): an unlabelled debate is refused BEFORE the id rail and a free-text debate
// subject is refused too, so this probe convenes the same TYPE the first call used — the point here is the ID.
const reuse = await call(b, 'vibe_v5_meeting', { agenda: 'R19 试图用回同一个 id', kind: 'sync', member: 'r-chair', id: mid })
const refused = reuse.parsed && reuse.parsed.ok === false ? reuse.parsed : null
ok(refused !== null && refused.code === 'VMU_MEETING_ID_ARCHIVED',
  '③ the pack face refuses the archived id by name (`VMU_MEETING_ID_ARCHIVED`)', reuse.parsed && { ok: reuse.parsed.ok, code: reuse.parsed.code })
ok(refused !== null && String(refused.message || '').includes(String(closedAt)),
  '③ the refusal QUOTES the archived instant, so "when was it closed" needs no second lookup',
  refused && { message: String(refused.message || '').slice(0, 240), closedAt })
ok(refused !== null && String(refused.hint || '').includes('reuseArchivedId'),
  '④ the refusal names the deliberate way out (`reuseArchivedId:true`) — a rail with a door',
  refused && { hint: String(refused.hint || '').slice(0, 240) })
const archiveAfterRefusal = svc.status().archived
ok(archiveAfterRefusal === archiveBefore,
  '⑧ a refusal does not mutate the archive (a refused open must leave no record)', { before: archiveBefore, after: archiveAfterRefusal })

// ── ⑤ THE DELIBERATE REUSE IS ALLOWED AND BOTH OBJECTS STAY DISTINGUISHABLE ──────────────────────────────────
console.log('=== 5. DELIBERATE REUSE: THE LIVE OBJECT AND THE ARCHIVED ONE ARE NAMED ===')
const reopened = svc.open({ id: mid, reuseArchivedId: true, chair: 'r-chair', roster: ['r-chair', 'r-1'], actor: 'r-chair' })
const reopenedId = reopened && reopened.meeting ? (reopened.meeting.id ? reopened.meeting.id : reopened.meeting) : null
ok(reopened && reopenedId !== null && String(reopenedId) === String(mid),
  '⑤ with `reuseArchivedId:true` the name is reusable and the receipt names the new object',
  reopened && { id: reopenedId })
const twinSummary = svc.summary({ meeting: mid })
ok(twinSummary.state !== 'closed' && twinSummary.liveWhileArchived === true,
  '⑤ `summary()` reports the LIVE state and NAMES the twin (`liveWhileArchived:true`)',
  { state: twinSummary.state, liveWhileArchived: twinSummary.liveWhileArchived })
ok(twinSummary.archivedView && Number(twinSummary.archivedView.closedAt) === Number(closedAt),
  '⑤ `archivedView` carries the REAL closure instant of the other object (not a copy of the live one)',
  { archivedView: twinSummary.archivedView, closedAt })
ok(typeof twinSummary.liveWhileArchivedMeans === 'string' && twinSummary.liveWhileArchivedMeans.includes('ARCHIVE'),
  '⑤ the means sentence explains the situation instead of leaving two objects to be inferred',
  { means: String(twinSummary.liveWhileArchivedMeans || '').slice(0, 200) })

// ── ⑥ THE FACE `status` REALLY RETURNS CARRIES THE SAME DISCLOSURE ───────────────────────────────────────────
console.log('=== 6. meetingView (what action=status returns) CARRIES IT TOO ===')
const viewTwin = svc.meetingView({ meeting: mid })
ok(viewTwin && viewTwin.liveWhileArchived === true && typeof viewTwin.liveWhileArchivedMeans === 'string',
  '⑥ `meetingView` names the twin as well — the face the live run actually read cannot stay silent',
  { liveWhileArchived: viewTwin && viewTwin.liveWhileArchived })

// ── ⑦ A FRESH ID IS NOT NOISE ────────────────────────────────────────────────────────────────────────────────
console.log('=== 7. A FRESH ID REPORTS "ONE OBJECT" ===')
const fresh = svc.open({ type: 'ordinary', chair: 'r-chair', roster: ['r-chair', 'r-1'], actor: 'r-chair' })
const freshId = (fresh.meeting && fresh.meeting.id) ? fresh.meeting.id : fresh.meeting
const freshView = svc.meetingView({ meeting: freshId })
const freshSummary = svc.summary({ meeting: freshId })
ok(freshView.liveWhileArchived === false && freshSummary.liveWhileArchived === false,
  '⑦ a fresh id reports `liveWhileArchived:false` on BOTH faces (the field is a fact, not always-on alarm)',
  { view: freshView.liveWhileArchived, summary: freshSummary.liveWhileArchived })
ok(String(freshView.liveWhileArchivedMeans || '').includes('only one object'),
  '⑦ and says why it is false (a false field without its meaning is a riddle)', { means: String(freshView.liveWhileArchivedMeans || '').slice(0, 160) })

console.log('\n=== VMU MEETING ID ARCHIVE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
