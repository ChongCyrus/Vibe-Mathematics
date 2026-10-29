#!/usr/bin/env node
// vmu RUN 45 — TWO MEETING REGISTRIES, ONE VISIBLE NAME SPACE: MAKE IT DISCOVERABLE, NOT FUSED.
//
// THE OBSERVED DEFECT (live run 45, the institute's own report):
//   · `vibe_vmu_meeting {action:"open", id:"m-r45", kind:"debate", member:"r-acad", roster:[…], subject:"…"}`
//     answered `{ ok:true, state:"in_session", serviceMeeting:null }` — and the receipt's `kind` was the primitive
//     default `"general"` while `subject` appeared NOWHERE. `ok:true` said nothing about either loss.
//   · the same id on the pack face (`vibe_v5_say {meeting:"m-r45"}`, `vibe_v5_verdict_final {meeting:"m-r45"}`)
//     answered `VMU_NO_OPEN_MEETING` with the hint "open() a meeting first — this layer refuses rather than inventing
//     one" — advice the agent had ALREADY carried out; the meeting was open, in the OTHER table.
//   · `vibe_vmu_meeting {action:"status", id:"m-r45"}` then answered `state:"in_session"`, so two faces of one tool
//     disagreed about one id and neither receipt named the split.
//
// THE MECHANISM: `vibe_vmu_meeting {action:"open"}` builds a PER-OBJECT PRIMITIVE meeting (`kernel/meeting.js`);
// `vibe_v5_meeting`/`vibe_v5_say`/`vibe_v5_verdict_final` address the `vmu.meetings` SERVICE (`kernel/meetings.js`).
// The host already lets the service SEE the primitive table's live ids (`foreignIds`), and `openSeq` already used it
// for one-name-one-meeting; the REFUSAL and the READ faces did not. Run 45's fix keeps the two tables separate (a
// merge would make "which object does this id denote?" unanswerable) and makes the boundary DISCOVERABLE:
//   (a) `requireMeeting` consults the other table before refusing: an id that is open THERE is refused by name as
//       "not in this registry — open in the primitive one", with the face that reads/acts on it;
//   (b) `list` discloses each list's registry and whether the union includes archived ids;
//   (c) `status`/`summary` say `registry:"primitive"`/`"service"`, so the receipt names the table that answered;
//   (d) `open` no longer swallows arguments: `kind` is refused by name (it means the BALLOT kind on this face) and
//       `subject` is disclosed in `dropped` (the primitive record has no such field).
//
// WHAT THIS SUITE PROVES: (1) an unhonourable `kind` is REFUSED, not silently replaced; (2) `subject` is named in
// `dropped` instead of vanishing, and `dropped:[]` is an assertion when nothing was lost; (3) the two read faces say
// which registry answered; (4) `list` lists the primitive meeting and says the union contains no archived id; (5) the
// pack face's refusal about a primitive id names the primitive registry AND the face that can read/act on it — the old
// un-actionable "open() a meeting first" is gone; (6) the two tables are still separate (the service does not list the
// primitive meeting as its own); (7) a genuinely unknown id still refuses with both id spaces in the hint.
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

const root = await mkdtemp(join('D:/_tmp', 'vmu-run45-registry-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  const svc = kernel.meetings
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-acad', slot: 'member' })
  await kernel.members.hire({ id: 'r-acad2', slot: 'member' })
  ok(kernel.members.roster().length === 3, 'setup: a chair and two members really exist (RULE E)', kernel.members.roster().map((m) => m.id))
  const roster = ['r-chair', 'r-acad', 'r-acad2']

  // §1 — `open` MUST NOT SWALLOW A `kind` IT CANNOT HONOUR. The live run's exact call, on this face, is refused by
  // name; the hint names the face that DOES carry a meeting kind. Nothing is created by the refused call.
  const badKind = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'm-r45-bad', kind: 'debate', member: 'r-acad', roster, subject: 'x', agenda: 'y' })
  ok(badKind.parsed && badKind.parsed.ok === false, '§1 open {kind:"debate"} is REFUSED, not answered with ok:true', badKind.parsed)
  ok(badKind.parsed && badKind.parsed.code === 'VMU_INVALID_ARGUMENT', '§1 … refused BY NAME (VMU_INVALID_ARGUMENT)', badKind.parsed && badKind.parsed.code)
  ok(!!(badKind.parsed && /ballot/i.test(String(badKind.parsed.message || '')) && /kind/i.test(String(badKind.parsed.message || ''))),
    '§1 … and the message says WHICH `kind` this face means (the ballot kind), so the ambiguity is stated, not hidden', badKind.parsed && badKind.parsed.message)
  ok(!!(badKind.parsed && /vibe_v5_meeting/.test(String(badKind.parsed.hint || '')) && /kind/.test(String(badKind.parsed.hint || ''))),
    '§1 … the hint names the face that DOES carry a meeting kind (vibe_v5_meeting {kind})', badKind.parsed && badKind.parsed.hint)
  ok(kernel.liveMeeting('m-r45-bad') === null, '§1 … and the refused open left NO record behind (no half-built meeting)', kernel.liveMeeting('m-r45-bad'))

  // §2 — the run's open WITHOUT the kind: the primitive meeting really opens (that part was never broken), and the
  // `subject` pointer it cannot store is DISCLOSED instead of vanishing.
  const opened = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'm-r45', member: 'r-chair', roster, subject: 'run 45 的议题引用', agenda: 'y' })
  ok(opened.parsed && opened.parsed.ok === true && opened.parsed.state === 'in_session', '§2 open (no kind) really opens the primitive meeting', opened.parsed && (opened.parsed.code || opened.parsed.state))
  ok(opened.parsed && Array.isArray(opened.parsed.dropped) && opened.parsed.dropped.includes('subject'),
    '§2 ★ the argument it cannot store is NAMED in `dropped` (never a silent loss on an ok:true receipt)', opened.parsed && opened.parsed.dropped)
  ok(!!(opened.parsed && opened.parsed.droppedNote && typeof opened.parsed.droppedNote.subject === 'string' && /vibe_v5_meeting/.test(opened.parsed.droppedNote.subject)),
    '§2 … with WHERE it belongs (`droppedNote.subject` names the service face that stores a subject)', opened.parsed && opened.parsed.droppedNote)
  ok(opened.parsed && opened.parsed.registry === 'primitive', '§2 the open receipt says which registry it WROTE to (registry:"primitive")', opened.parsed && opened.parsed.registry)

  const clean = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'm-r45-clean', member: 'r-chair', roster, agenda: 'nothing dropped here' })
  ok(clean.parsed && clean.parsed.ok === true && Array.isArray(clean.parsed.dropped) && clean.parsed.dropped.length === 0,
    '§2 ★ `dropped:[]` is present on every open — an EMPTY list asserts "nothing was thrown away"', clean.parsed && clean.parsed.dropped)

  // §3 — the READ faces say WHICH TABLE answered. Requirement ④ of the lane, and the missing half of the run's
  // contradiction (status said in_session while the pack face said no meeting is open).
  const status = await call(b, 'vibe_vmu_meeting', { action: 'status', id: 'm-r45' })
  ok(status.parsed && status.parsed.ok === true && status.parsed.registry === 'primitive',
    '§3 ★ status on a primitive id carries registry:"primitive"', status.parsed && status.parsed.registry)
  ok(status.parsed && status.parsed.kind === 'general' && status.parsed.state === 'in_session',
    '§3 … the primitive record is unchanged (kind stays the factory default "general", state in_session)', status.parsed && { kind: status.parsed.kind, state: status.parsed.state })
  ok(status.parsed && !('subject' in status.parsed), '§3 … and the primitive record has NO subject field (which is why open disclosed it as dropped)', status.parsed && Object.keys(status.parsed).slice(0, 8))
  ok(!!(status.parsed && /primitive/i.test(String(status.parsed.registryMeans || '')) && /vibe_v5_say|vibe_v5_verdict_final/.test(String(status.parsed.registryMeans || ''))),
    '§3 … `registryMeans` says what the split means for the next act (the pack face addresses the service)', status.parsed && status.parsed.registryMeans)
  const summary = await call(b, 'vibe_vmu_meeting', { action: 'summary', id: 'm-r45' })
  ok(summary.parsed && summary.parsed.registry === 'primitive', '§3 summary (the other read face the hint names) also says registry:"primitive"', summary.parsed && summary.parsed.registry)

  // §4 — the PACK FACE must refuse a primitive id EXPLICITLY. The old hint told the caller to "open() a meeting
  // first", which the caller had already done; a refusal that names the wrong remedy is the defect being fixed.
  const say = await call(b, 'vibe_v5_say', { meeting: 'm-r45', member: 'r-acad', text: 'hello' })
  ok(say.parsed && say.parsed.ok === false && say.parsed.code === 'VMU_NO_OPEN_MEETING', '§4 vibe_v5_say still refuses a primitive id BY NAME (no silent re-pointing)', say.parsed && say.parsed.code)
  const sayHint = String((say.parsed && say.parsed.hint) || '')
  ok(/primitive/i.test(sayHint), '§4 ★ the hint names the PRIMITIVE registry as where the id actually lives', sayHint)
  ok(/vibe_vmu_meeting/.test(sayHint) && /"status"/.test(sayHint) && /"summary"/.test(sayHint),
    '§4 ★ … and gives the executable face+actions: vibe_vmu_meeting {action:"status"|"summary", id}', sayHint)
  ok(!/open\(\) a meeting first/.test(sayHint), '§4 ★★ the old un-actionable advice ("open() a meeting first") is GONE from this refusal', sayHint)
  ok(/different table|other table/i.test(String((say.parsed && say.parsed.message) || '')), '§4 the message says the id is open in a DIFFERENT table (not "does not exist")', say.parsed && say.parsed.message)

  const verdict = await call(b, 'vibe_v5_verdict_final', { meeting: 'm-r45', proposition_id: 'p1', member: 'r-chair' })
  ok(verdict.parsed && verdict.parsed.ok === false && verdict.parsed.code === 'VMU_NO_OPEN_MEETING', '§4 vibe_v5_verdict_final refuses the same primitive id by name', verdict.parsed && verdict.parsed.code)
  ok(/primitive/i.test(String((verdict.parsed && verdict.parsed.hint) || '')) && /vibe_vmu_meeting/.test(String((verdict.parsed && verdict.parsed.hint) || '')),
    '§4 … with the same discoverable hint (one mechanism, two faces: both resolve through the service registry)', verdict.parsed && verdict.parsed.hint)
  ok(/vibe_v5_meeting/.test(String((verdict.parsed && verdict.parsed.hint) || '')),
    '§4 … and it names the way to get a SERVICE meeting (vibe_v5_meeting), so the caller has a next step', verdict.parsed && verdict.parsed.hint)

  // §5 — `list` must REPORT the primitive meeting and say whether the union contains archived ids.
  const list = await call(b, 'vibe_vmu_meeting', { action: 'list' })
  ok(list.parsed && Array.isArray(list.parsed.unionMeetings) && list.parsed.unionMeetings.includes('m-r45'),
    '§5 list unions the primitive meeting into `unionMeetings`', list.parsed && list.parsed.unionMeetings)
  ok(list.parsed && Array.isArray(list.parsed.primitiveMeetings) && list.parsed.primitiveMeetings.includes('m-r45'),
    '§5 ★ and reports it as a PRIMITIVE meeting in its own list (`primitiveMeetings`), not silently mixed in', list.parsed && list.parsed.primitiveMeetings)
  ok(list.parsed && !(Array.isArray(list.parsed.serviceMeetings) && list.parsed.serviceMeetings.includes('m-r45')),
    '§5 … the service list does NOT claim it (the two tables stay separate: no merge, only discovery)', list.parsed && list.parsed.serviceMeetings)
  ok(list.parsed && list.parsed.unionMeetingsIncludesArchived === false,
    '§5 ★ the receipt answers the question a reader had: `unionMeetingsIncludesArchived:false`', list.parsed && list.parsed.unionMeetingsIncludesArchived)
  ok(!!(list.parsed && /archived/i.test(String(list.parsed.registriesMeans || '')) && /service|primitive/i.test(String(list.parsed.registriesMeans || ''))),
    '§5 … and `registriesMeans` names both registries and where archived ids went', list.parsed && list.parsed.registriesMeans)

  // §6 — the KERNEL's own service report must not read as "nothing is open anywhere". It is the receipt a caller
  // reads to decide whether the pack face refusing is a contradiction.
  const svcStatus = svc.status()
  ok(svcStatus.registry === 'service', '§6 kernel.meetings.status() says registry:"service"', svcStatus.registry)
  ok(Array.isArray(svcStatus.liveMeetings) && !svcStatus.liveMeetings.includes('m-r45'),
    '§6 … its liveMeetings is still THIS table only (nothing merged)', svcStatus.liveMeetings)
  ok(svcStatus.otherRegistry && svcStatus.otherRegistry.name === 'primitive' && Array.isArray(svcStatus.otherRegistry.liveIds) && svcStatus.otherRegistry.liveIds.includes('m-r45'),
    '§6 ★ … and it surfaces the OTHER table\'s live ids, so "no service meeting" and "no meeting anywhere" stop looking identical', svcStatus.otherRegistry)
  ok(!!(svcStatus.otherRegistry && /vibe_vmu_meeting/.test(String(svcStatus.otherRegistry.means || ''))),
    '§6 … with the face that addresses those ids', svcStatus.otherRegistry && svcStatus.otherRegistry.means)

  // §7 — an id nobody ever opened still refuses, and the hint still lists BOTH spaces (the fix must not turn every
  // unknown id into a "wrong registry" story).
  const ghost = await call(b, 'vibe_vmu_meeting', { action: 'status', id: 'm-never-opened-45' })
  ok(ghost.parsed && ghost.parsed.ok === false && ghost.parsed.code === 'VMU_NO_SUCH_OBJECT', '§7 an unknown id still refuses by name (VMU_NO_SUCH_OBJECT)', ghost.parsed && ghost.parsed.code)
  ok(!!(ghost.parsed && /primitive registry/.test(String(ghost.parsed.hint || '')) && /service registry/.test(String(ghost.parsed.hint || ''))),
    '§7 … with both id spaces named in the hint', ghost.parsed && ghost.parsed.hint)
  const ghostSay = await call(b, 'vibe_v5_say', { meeting: 'm-never-opened-45', member: 'r-acad', text: 'hi' })
  ok(ghostSay.parsed && ghostSay.parsed.ok === false && !/primitive registry.*OPEN|is OPEN in the PRIMITIVE/.test(String(ghostSay.parsed.message || '')),
    '§7 … and the pack face does not claim an unknown id is open in the primitive table', ghostSay.parsed && ghostSay.parsed.message)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f) }
console.log('=== VMU RUN45 MEETING REGISTRY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
