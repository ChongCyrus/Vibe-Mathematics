#!/usr/bin/env node
// vmu RUN 37 / F-5 — A CLOSED MEETING IS ARCHIVED, NOT MISSING.
//
// THE OBSERVED DEFECT (live run 37, the institute's own report): the office convened `m1`, closed it, then asked
// `vibe_vmu_meeting { action: "status", id: "m1" }` and got the "no such meeting" refusal — while `summary` answered
// with `state:"closed"` and `read_library`/the archive held the record. Three read faces, three answers to "is this
// meeting closed?"; `action:"list"` did not mention the archived id at all.
//
// THE MECHANISM: `close()` deletes the LIVE row and pushes the record into the service ARCHIVE (that part is right —
// see the meeting-close suite). `status` resolves a meeting through `meetingView`, which only knows live rows, so an
// archived id fell through to `noSuchMeeting`. The fix consults the archive BEFORE refusing: `status` now answers
// `{ state, archived:true, summaryAvailable:true, hint:"read it with summary" }`, and `list` reports
// `archivedMeetings` next to the live ids. An id nobody ever convened still refuses by name.
//
// WHAT THIS SUITE PROVES: (a) after a real pack convene + close, `status` answers `closed`/`archived`, not a refusal;
// (b) `summary` still carries the record; (c) `list` names the archived id; (d) an unknown id still refuses by name
// with both registries in its hint; (e) the face-level `archivedIds()` is sorted and counted.
import { mkdtemp, rm } from 'node:fs/promises'
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

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run37-archive-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  const svc = kernel.meetings
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length === 3, 'setup: a chair and two members really exist (RULE E)', kernel.members.roster().map((m) => m.id))

  // §1 a real pack convene, then a real close — the same two calls the live run made.
  const convened = await call(b, 'vibe_v5_meeting', { agenda: 'run 37 归档读取', type: 'academic', member: 'r-chair' })
  const mid = convened.parsed && convened.parsed.meeting
  ok(convened.parsed && convened.parsed.ok === true && typeof mid === 'string' && mid !== '', '§1 the pack convened a service meeting', convened.parsed && convened.parsed.code)
  const closed = await call(b, 'vibe_vmu_meeting', { action: 'close', id: mid, member: 'r-chair' })
  ok(closed.parsed && closed.parsed.ok === true, '§1 the office closed it', closed.parsed && (closed.parsed.code || closed.parsed.message))
  ok(svc.archivedIds().includes(String(mid)), '§1 the archive now holds the id', svc.archivedIds())

  // §2 the defect: status used to say "no such meeting". It must now name the archive.
  const status = await call(b, 'vibe_vmu_meeting', { action: 'status', id: mid, member: 'r-chair' })
  ok(status.parsed && status.parsed.ok === true, '§2 status answers instead of refusing', status.parsed && (status.parsed.code || status.parsed.message))
  ok(status.parsed && status.parsed.state === 'closed', '§2 status says CLOSED', status.parsed && status.parsed.state)
  ok(status.parsed && status.parsed.archived === true, '§2 status says the record is archived', status.parsed && status.parsed.archived)
  ok(status.parsed && status.parsed.summaryAvailable === true, '§2 status points at the record that still exists')
  ok(status.parsed && typeof status.parsed.hint === 'string' && status.parsed.hint.includes('"summary"'),
    '§2 the hint names the face that carries the record', status.parsed && status.parsed.hint)

  // §3 summary still answers for the archived id (it always did — the point is that status no longer contradicts it).
  const summary = await call(b, 'vibe_vmu_meeting', { action: 'summary', id: mid, member: 'r-chair' })
  ok(summary.parsed && summary.parsed.ok === true && summary.parsed.state === 'closed', '§3 summary still answers with the closure', summary.parsed && summary.parsed.state)

  // §4 list names BOTH the live ids and the archived ones.
  const list = await call(b, 'vibe_vmu_meeting', { action: 'list' })
  ok(list.parsed && Array.isArray(list.parsed.archivedMeetings) && list.parsed.archivedMeetings.includes(String(mid)),
    '§4 list reports the archived id', list.parsed && list.parsed.archivedMeetings)
  ok(list.parsed && !(Array.isArray(list.parsed.serviceMeetings) && list.parsed.serviceMeetings.includes(String(mid))),
    '§4 and does NOT call the archived meeting live', list.parsed && list.parsed.serviceMeetings)

  // §5 an id nobody ever convened still refuses BY NAME, with both registries in the hint.
  const ghost = await call(b, 'vibe_vmu_meeting', { action: 'status', id: 'm-never-existed', member: 'r-chair' })
  ok(ghost.parsed && ghost.parsed.code === 'VMU_NO_SUCH_OBJECT', '§5 an unknown id still refuses by name', ghost.parsed && ghost.parsed.code)
  ok(ghost.parsed && typeof ghost.parsed.hint === 'string' && ghost.parsed.hint.includes('service registry'),
    '§5 and the refusal names both registries', ghost.parsed && ghost.parsed.hint)

  // §6 the archive read is sorted and counted, and reading it mutates nothing.
  const before = svc.archivedIds().slice()
  ok(before.length === 1 && before[0] === String(mid), '§6 archivedIds is a one-item sorted list (RULE E)', before)
  const again = await call(b, 'vibe_vmu_meeting', { action: 'status', id: mid })
  ok(again.parsed && again.parsed.state === 'closed', '§6 reading status twice is stable')
  ok(JSON.stringify(svc.archivedIds()) === JSON.stringify(before), '§6 the archive did not change by being read', svc.archivedIds())
} finally {
  // Windows keeps the store's handles briefly; a bare rm raced and threw ENOTEMPTY (measured).
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  ✗ ' + f)
}
console.log('=== VMU RUN37 MEETING ARCHIVE READS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
