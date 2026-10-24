// tests/vmu-run9-findings.test.mjs — live run 9's findings. ONLY the ones whose assertion is reachable in a minimal boot
// are asserted here; the rest are DEFERRED WITH A NAMED REASON, and the named reasons are the point (a quiet "not tested"
// reads like "no problem", which this repo's rule forbids).
//
// WHAT IS ASSERTED: F — a WAITING/scheduled meeting's deadline used to be evaluated only when something else happened to
// TOUCH that meeting, so "the wait expired" was a fact nobody learned on time. The kernel now publishes ONE pass
// (`sweepDue`) that settles every scheduled/waiting meeting through the SAME `syncMeeting` the touch path uses, and the
// pack's idle edge is its real consumer.
//
// WHAT IS DEFERRED, and why each needs a seam this suite does not build:
//   A  `selectionIgnored{requested,reason,pending}` is now emitted by `vibe-math-vmu/kernel/turn/index.js`, but reaching
//      that branch needs a turn that really AWAITS a report. Measured: a minimal boot has no subagents service, and the
//      caller-played mode is not reachable from the entry config alone (`deliverMode:'caller'` and `{vmu:{deliverMode}}`
//      both still take the subagents branch and refuse VMU_ENGINE_UNAVAILABLE). The DEFECT CLASS (a document naming a
//      field the code never emits) is what actually mattered, and it is guarded by `tests/audit-ledger-field-claims.test.mjs`
//      instead of by an end-to-end call — a gate on the class beats one more instance.
//   B  the self-addressed notification (`delivery.selfAddressed`) needs a debate meeting with a signed ruling whose card
//      owner IS the chair; `vibe_v5_verdict_final` requires `meeting` (measured: VMU_INVALID_ARGUMENT "the final ruling
//      needs the meeting it was taken in") and the debate-subject gate then needs a `proofState:"complete"` card. That is
//      `tests/vmu-debate-subject-proof.test.mjs`'s setup, not this file's.
//   C  the report refusal's read-face facts are reachable only AFTER a report name is DECLARED for this boot (measured:
//      `vibe_vmu_report {action:'emit'}` first refuses `VMU_REPORT_UNKNOWN_NAME`). The kernel record itself carries the
//      three booleans (`vibe-math-vmu/kernel/report.js` `rec.refused = {…, drives:false, neverDrives:true,
//      transportInjected:false}`), and the tool face now also relays them when the face throws.
//   E  `overrodeQuorum` needs a meeting sitting in `waiting`; this boot would not produce that state (measured: every
//      config shape tried — `vmu:{meetings:{quorumMin}}`, `settings:{'vmu.meetings.quorumMin'}`, flat — still opened the
//      meeting immediately, so `proceed()` correctly refused VMU_STATE). The rail is asserted where that state is
//      reachable: `tests/vmu-meeting-types.test.mjs` §7.
//
// RULE E (this repo): the lists below are measured, not assumed — the "nothing happened" assertions are preceded by an
// assertion that there was something that COULD have happened.

import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return }
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
}

const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const root = await mkdtemp(join('D:/_tmp', 'vmu-run9-'))
try {
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'] })
  await handle.ready()
  const kernel = handle.kernel
  ok(kernel && kernel.meetings, 'boot produced a kernel with a meetings face (a green without one would be vacuous)')
  const meetings = kernel.meetings

  console.log('=== F. the wait deadline is observable WITHOUT an unrelated call touching the meeting ===')
  ok(typeof meetings.sweepDue === 'function', 'the kernel publishes `sweepDue` (one pass, no second transition rule)', typeof meetings.sweepDue)
  const first = meetings.sweepDue({ at: Date.now() })
  ok(first && first.swept === 0, 'with no meeting in a pending state the pass reports swept:0', first && first.swept)
  ok(first && Array.isArray(first.transitions) && first.transitions.length === 0, 'the transition list is empty (the guard that makes swept:0 meaningful)', first && first.transitions)
  ok(first && typeof first.note === 'string' && first.note.length > 0, 'the pass always says what it did — silence would BE the defect', first && first.note)
  ok(first && typeof first.at === 'number' && Number.isFinite(first.at), 'the pass reports the instant it settled at', first && first.at)

  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  const tool = specs.find((s) => s.name === 'vibe_v5_meeting')
  ok(tool !== undefined, 'the pack declares `vibe_v5_meeting` (otherwise nothing below can be set up)', tool && tool.name)
  const opened = JSON.parse(await tool.execute({ member: 'acad', agenda: 'F：预约一场会以验证 sweepDue', at: Date.now() + 3_600_000 }, {}))
  const mid = opened && (opened.meeting || opened.id)
  ok(opened && opened.ok === true && typeof mid === 'string', 'setup: a future `at` really opens a SCHEDULED meeting', opened && (opened.code || opened.state))
  // the meeting's own schedule-aware state is what the sweep reads; the receipt already reported it, so it is asserted
  // here rather than re-read through a status() call (that face is a capability descriptor, not a per-meeting row)
  ok(opened.state === 'scheduled', 'setup: the meeting is in `scheduled`, i.e. a state the sweep must look at', opened.state)
  const early = meetings.sweepDue({ at: Date.now() })
  ok(early && early.swept === 0, 'before its start time the pass changes NOTHING (moving it would be inventing a decision)', early && early.swept)
  const earlyAgain = meetings.sweepDue({ at: Date.now() + 1_000 })
  ok(earlyAgain && earlyAgain.swept === 0, 'and it stays untouched while the start time is still ahead', earlyAgain && earlyAgain.swept)
  const stillThere = meetings.sweepDue({ at: Date.now() + 1_500 })
  ok(stillThere && stillThere.transitions.length === 0, 'no transition is reported for a meeting that has not reached its time', stillThere && stillThere.transitions)
  const later = meetings.sweepDue({ at: Date.now() + 3_600_000 + 1_000 })
  ok(later && later.swept >= 1, 'once the start time has passed the SAME pass settles it (no touch was needed)', later && later.swept)
  ok(later && later.transitions.some((t) => t.meeting === mid), 'the transition NAMES the meeting it settled', later && later.transitions)
  ok(later && later.transitions.some((t) => t.meeting === mid && t.from === 'scheduled' && t.to === 'open'),
    'the moved meeting goes scheduled -> open (the very transition the touch path would have made)', later && later.transitions)
  ok(later && later.transitions.length > 0 && later.transitions.every((t) => typeof t.from === 'string' && typeof t.to === 'string' && t.from !== t.to),
    'every transition carries a real from/to (the length guard keeps every() from being true on an empty set)', later && later.transitions)
  ok(later && typeof later.note === 'string' && later.note.includes('chair'),
    'the note says a due WAIT still needs the CHAIR to decide — the sweep must not read as an automatic decision', later && later.note)

  // ★★ FINDING (a) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12): "到点自决" had no real sweep.
  // The report was RIGHT that the deadline was never observed on time and WRONG about the cause: the pass existed
  // (section F above proves it settles a due meeting) but NOTHING CALLED IT, so the only moment a deadline was
  // noticed was the moment somebody touched that meeting. The caller is the beat — the framework's one polling
  // point, because there is no timer by design (docs/03 §2). These assertions are about the CALLER, which is the
  // half a pass-only suite cannot see: a mechanism without a consumer is exactly the defect class this repo names.
  console.log('')
  console.log('=== G(a). the BEAT is the caller of the pass ===')
  ok(typeof kernel.beat === 'function', 'the kernel exposes a beat (otherwise the caller under test does not exist)', typeof kernel.beat)
  const soon = Date.now() + 1_000
  const opened2 = JSON.parse(await tool.execute({ member: 'acad', agenda: 'G(a)：预约一场会，让 BEAT 去结算它', at: soon }, {}))
  const mid2 = opened2 && (opened2.meeting || opened2.id)
  ok(opened2 && opened2.ok === true && opened2.state === 'scheduled', 'setup: a second meeting really is SCHEDULED', opened2 && opened2.state)
  const beatEarly = await kernel.beat('G(a): before the start time')
  const sweepEarly = beatEarly && beatEarly.meetings && beatEarly.meetings.sweep
  ok(sweepEarly !== undefined && sweepEarly !== null, 'a beat REPORTS a sweep (null would mean the meetings service was never constructed — the two are not the same)', beatEarly && beatEarly.meetings)
  ok(sweepEarly && sweepEarly.swept === 0, 'before the start time the beat-run pass settles nothing (moving it early would invent a decision)', sweepEarly && sweepEarly.swept)
  const beforeMemory = meetings.status({}).sweep
  await new Promise((r) => setTimeout(r, 1_150))
  const beatLate = await kernel.beat('G(a): after the start time')
  const sweepLate = beatLate && beatLate.meetings && beatLate.meetings.sweep
  ok(sweepLate && sweepLate.swept >= 1, 'AFTER the start time the BEAT settles it — no unrelated call was needed', sweepLate && sweepLate.swept)
  ok(sweepLate && Array.isArray(sweepLate.transitions) && sweepLate.transitions.some((t) => t.meeting === mid2 && t.from === 'scheduled' && t.to === 'open'),
    'the beat receipt NAMES the meeting and the transition it made', sweepLate && sweepLate.transitions)
  const afterMemory = meetings.status({}).sweep
  ok(beforeMemory && beforeMemory.ran === true && afterMemory && afterMemory.ran === true,
    'meetings.status() reports that a pass has RUN (the "article of faith" half of the finding)', { before: beforeMemory, after: afterMemory })
  ok(afterMemory && typeof afterMemory.at === 'number' && afterMemory.at >= beforeMemory.at,
    'the memory carries the instant of the BEAT that ran the pass, not a stale earlier one', { before: beforeMemory && beforeMemory.at, after: afterMemory && afterMemory.at })

  console.log('')
  console.log('=== VMU RUN9 FINDINGS: ' + passed + ' passed, ' + failures.length + ' failed ===')
  for (const f of failures) console.log('  FAIL ' + f)
} finally {
  try { await rm(root, { recursive: true, force: true, maxRetries: 3 }) } catch { /* the assertion result matters, not the temp cleanup */ }
}
process.exit(failures.length ? 1 : 0)
