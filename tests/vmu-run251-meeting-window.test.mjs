// tests/vmu-run251-meeting-window.test.mjs — RUN 251-C (live run 71, build 0a9e9783): the READINGS on the
// 「预约 → 到点 → 起会」 chain disagreed with what the framework actually does.
//
// THE THREE DEFECTS THIS PINS (all MEASURED in the run, not inferred):
//   · F71-11: the meeting was `waiting` with `quorum.met:true` while `stateMeans` said "the quorum rule is not met
//     yet". Both readings were true of different meetings: `waiting` is reached either because the legal quorum is
//     short OR because `vmu.meetings.waitForAll` (default true) wants the whole roster while the quorum is already
//     met. One sentence described only the first case. Now the receipt names WHICH (`waitingFor`) and the general
//     sentence is ASSEMBLED FROM the same table (`WAITING_FOR_MEANS`), so the two cannot drift apart.
//   · F71-12: the scheduled-start refusal promised "it starts by itself when the clock reaches that time", and the
//     run waited 13,967 ms past its start while the meeting stayed `waiting`: the sweep only moves the state, and
//     from `waiting` only the chair's `proceed()` opens it (the state machine says so in its own comment). The
//     refusal, the receipts and `nextActions` now say that out loud (`requiresChairProceed`).
//   · F71-13: `elapsedMs` meant "how long until the start" on a scheduled meeting (NEGATIVE — a broken clock to a
//     reader) and "how long it has been running" on an open one. Split into `startsInMs` (only while not started,
//     positive = still in the future) and `elapsedSinceMs` (only once started, never negative); `elapsedMs` rides
//     along as an alias of `elapsedSinceMs` so an old reader gets `null`, never a negative number.
//   · (附帶) `at:"+180s"` was echoed back VERBATIM; the receipt now also carries the RESOLVED instant
//     (`scheduledForIso`) and the spelling the caller used (`atSource:"relative"|"absolute"`).
//
// WHAT IT DOES NOT PROVE (named so nobody reads more into it): it does not drive a live model, so it says nothing
// about whether a model reads `nextActions`; it proves the readings are truthful and same-sourced.
//
// RULE E: every `.every(...)` / loop below is preceded by an explicit NON-EMPTY assertion.
//
// Run: node tests/vmu-run251-meeting-window.test.mjs   (last line: === VMU RUN 251 MEETING WINDOW: N passed, M failed ===)
import { mkdtemp, rm } from 'node:fs/promises'

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { MEETING_STATE_MEANING, WAITING_FOR_MEANS } from '../vibe-math-vmu/kernel/meeting.js'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const NOW = 1777777777000
const HOUR = 3600000
const rec = (over) => {
  const vals = Object.assign({}, over || {})
  return { get: (k) => vals[k], has: (k) => Object.prototype.hasOwnProperty.call(vals, k), all: () => Object.assign({}, vals), vals }
}
const mk = (clock, over) => createMeetings({ clock, settings: rec(over), log: () => {}, bus: { emit: () => {} } })
const nonEmptyString = (v) => typeof v === 'string' && v.length > 0

// ── §1: a SCHEDULED meeting reports the start window with two NAMED fields, never a negative elapsed ───────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: '预约的会', at: NOW + HOUR })

  ok(sched.state === 'scheduled' && sched.scheduledFor === NOW + HOUR,
    '§1a. a future `at` creates a SCHEDULED meeting (the schedule is a STATE, not a decorative field)', { state: sched.state, at: sched.scheduledFor })
  ok(sched.startsInMs === HOUR,
    '§1b. ★ startsInMs says how far away the start is (positive = still in the future) — the reading elapsedMs could never give without a negative number', sched.startsInMs)
  ok(sched.elapsedSinceMs === null && sched.elapsedMs === null,
    '§1c. ★ elapsedSinceMs / elapsedMs are NULL while the meeting has not started (NOT negative: "not started" is a state, not minus thirteen seconds)', { elapsedSinceMs: sched.elapsedSinceMs, elapsedMs: sched.elapsedMs })
  ok(sched.atSource === 'absolute' && sched.scheduledForIso === new Date(NOW + HOUR).toISOString(),
    '§1d. the receipt carries the RESOLVED instant as ISO beside the raw `at`, and names the spelling the caller used', { atSource: sched.atSource, iso: sched.scheduledForIso })
  ok(sched.requiresChairProceed === true,
    '§1e. ★★ requiresChairProceed is TRUE on the schedule receipt: the framework never opens a meeting on the chair\'s behalf (F71-12)', sched.requiresChairProceed)
  ok(nonEmptyString(sched.requiresChairProceedMeans) && sched.requiresChairProceedMeans.includes('NEVER'),
    '§1f. and the boolean comes with the sentence that explains the one exception instead of hiding it', String(sched.requiresChairProceedMeans).slice(0, 120))
  ok(Array.isArray(sched.nextActions) && sched.nextActions.length === 3,
    '§1g. nextActions is an ARRAY of the calls that actually move a scheduled meeting (before this run the word did not exist anywhere in the repo)', sched.nextActions)
  ok(sched.nextActions.length > 0 && sched.nextActions.some((a) => a && a.action === 'beat'),
    '§1h. ★ and `beat` is one of them: the due time is only evaluated on a touch, because the framework keeps no timer', sched.nextActions)
  ok(sched.waitingFor === null,
    '§1i. waitingFor is null while the meeting is not waiting (the reason exists only where it applies)', sched.waitingFor)

  const view = svc.meetingView({ meeting: sched.meeting })
  ok(view.state === 'scheduled' && view.startsInMs > 0 && view.elapsedSinceMs === null,
    '§1j. the READ face publishes the same window (one wording, not a second copy)', { startsInMs: view.startsInMs, elapsedSinceMs: view.elapsedSinceMs })
  ok(view.stateMeans === MEETING_STATE_MEANING.scheduled,
    '§1k. and the state still comes with its sentence (run 31 pin: a state without stateMeans is a reading nobody can read)', view.stateMeans)

  const st = svc.status()
  ok(Array.isArray(st.scheduledMeetings) && st.scheduledMeetings.length === 1,
    '§1l. the operator list has the scheduled meeting (RULE E: the row assertions below are not vacuous)', st.scheduledMeetings)
  const srow = st.scheduledMeetings.find((x) => x && x.meeting === sched.meeting)
  ok(!!srow && srow.startsInMs > 0 && srow.requiresChairProceed === true,
    '§1m. and the row carries the same window + the same "who has to act" reading', srow)
}

// ── §2: attending BEFORE the start is allowed, and its late-readings are null — not negative ───────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + HOUR })
  const att = svc.attend({ meeting: sched.meeting, member: 'r-1' })

  ok(att.ok === true && att.state === 'scheduled',
    '§2a. attending before the start time is allowed and does not open the meeting (the wait must be able to fill up)', { state: att.state })
  // TB-2694 / F75-05: the RETURN VALUE's `receipt` is now a pointer (the full copy of the readings is what made one
  // attend answer 16 163 B); the same readings are on the top level of this answer, and the RECORDED receipt below
  // still carries them in full — so both places are checked, not one.
  const rec2 = ((svc.receiptsView({ limit: 10 }).receipts) || []).filter((r) => r && r.action === 'attend').slice(-1)[0] || null
  ok(att.elapsedMs === null && att.receipt && att.receipt.see && rec2 && rec2.lateReads && rec2.lateReads.elapsedMs === null,
    '§2b. ★★ the attend receipt no longer carries a NEGATIVE elapsedMs on a scheduled meeting (F71-13: the run read one and saw a broken clock)', { elapsedMs: att.elapsedMs, lateReads: rec2 && rec2.lateReads && rec2.lateReads.elapsedMs, receipt: att.receipt })
  ok(att.startsInMs > 0,
    '§2c. instead it carries startsInMs > 0 — the honest reading for a meeting that has not started', att.startsInMs)
  ok(nonEmptyString(att.lateMeans) && att.lateMeans.includes('NOT JUDGED YET'),
    '§2d. and the lateness verdict says WHY it is not judged (the meeting has not started), instead of a silent late:false', String(att.lateMeans).slice(0, 120))
  ok(!(Number.isFinite(att.elapsedMs) && att.elapsedMs < 0),
    '§2e. explicit negative-value guard: nothing named elapsed* is below zero before the meeting starts', att.elapsedMs)
}

// ── §3: the due-time SWEEP with the quorum MET parks the meeting in `waiting` and NAMES the chair as the way out ───
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + HOUR })
  svc.attend({ meeting: sched.meeting, member: 'r-1' })
  now.t = NOW + HOUR + 13967
  svc.sweepDue()
  const after = svc.meetingView({ meeting: sched.meeting })
  const afterQ = svc.quorum({ meeting: sched.meeting })

  ok(after.state === 'waiting',
    '§3a. ★★ at the due time, with the roster incomplete, the sweep moves scheduled→waiting — it does NOT open the meeting by itself (F71-12)', after.state)
  ok(afterQ && afterQ.met === true,
    '§3b. ★★★ and the legal quorum IS met — this is exactly the run-71 contradiction: met:true beside a sentence about the quorum', afterQ && { met: afterQ.met, required: afterQ.required, present: afterQ.present })
  ok(after.waitingFor === 'chair-proceed',
    '§3c. ★★★ waitingFor names the REAL reason: the quorum is met, so what is missing is the chair\'s proceed() (F71-11)', after.waitingFor)
  ok(after.waitingForMeans === WAITING_FOR_MEANS['chair-proceed'],
    '§3d. ★★★ waitingForMeans IS the table entry (same source: the receipt cannot say one thing while the table says another)', after.waitingForMeans)
  ok(after.stateMeans === MEETING_STATE_MEANING.waiting,
    '§3e. the general sentence is the map entry for the state (one wording)', after.stateMeans)
  ok(nonEmptyString(MEETING_STATE_MEANING.waiting) && MEETING_STATE_MEANING.waiting.includes(WAITING_FOR_MEANS['chair-proceed']),
    '§3f. ★★★ and that sentence is ASSEMBLED FROM the table: it contains the chair-proceed reason verbatim (F71-11 同源)', String(MEETING_STATE_MEANING.waiting).slice(0, 160))
  ok(nonEmptyString(MEETING_STATE_MEANING.waiting) && MEETING_STATE_MEANING.waiting.includes(WAITING_FOR_MEANS.quorum),
    '§3g. ★ it also contains the quorum-short reason, because BOTH cases reach `waiting` and one sentence must own both', String(MEETING_STATE_MEANING.waiting).slice(0, 160))
  ok(after.elapsedSinceMs === null && after.startsInMs !== null,
    '§3h. a waiting meeting still reports a start window (startsInMs is negative = overdue), and no elapsed since it has not opened', { startsInMs: after.startsInMs, elapsedSinceMs: after.elapsedSinceMs })
  ok(after.requiresChairProceed === true,
    '§3i. requiresChairProceed stays true while the meeting is not open', after.requiresChairProceed)
  ok(Array.isArray(after.nextActions) && after.nextActions.length > 0,
    '§3j. RULE E guard + the waiting meeting lists its ways out', after.nextActions)
  ok(after.nextActions.some((a) => a && a.action === 'proceed'),
    '§3k. ★ and the FIRST named way out is the chair\'s proceed() (lapse/recess are the other two)', after.nextActions)
  ok(after.nextActions.some((a) => a && a.action === 'lapse') && after.nextActions.some((a) => a && a.action === 'recess'),
    '§3l. the other two named exits are listed too, so "the chair decides" is actionable', after.nextActions)

  const st = svc.status()
  ok(Array.isArray(st.waitingMeetings) && st.waitingMeetings.length === 1,
    '§3m. the operator list has the waiting meeting (RULE E: the row assertion below is not vacuous)', st.waitingMeetings)
  const wrow = st.waitingMeetings.find((x) => x && x.meeting === sched.meeting)
  ok(!!wrow && wrow.waitingFor === 'chair-proceed' && wrow.requiresChairProceed === true,
    '§3n. and the row carries the same reason and the same "who has to act"', wrow && { waitingFor: wrow.waitingFor, requiresChairProceed: wrow.requiresChairProceed })
}

// ── §4: the OTHER reason — quorum short — is named `quorum`, from the same table ──────────────────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, { 'vmu.meetings.quorumMin': 2 })
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + HOUR })
  now.t = NOW + HOUR + 1
  svc.sweepDue()
  const v = svc.meetingView({ meeting: sched.meeting })
  const q = svc.quorum({ meeting: sched.meeting })

  ok(v.state === 'waiting' && q && q.met === false,
    '§4a. with a declared floor the due-time sweep parks it in waiting with the floor NOT met (the other branch)', { state: v.state, met: q && q.met })
  ok(v.waitingFor === 'quorum',
    '§4b. ★★★ waitingFor names the OTHER reason: the quorum itself is short (F71-11 的另一半)', v.waitingFor)
  ok(v.waitingForMeans === WAITING_FOR_MEANS.quorum,
    '§4c. and its sentence is the table entry, not a second copy', v.waitingForMeans)
  ok(nonEmptyString(MEETING_STATE_MEANING.waiting) && MEETING_STATE_MEANING.waiting.includes(WAITING_FOR_MEANS.quorum),
    '§4d. the general sentence owns this case too — one table, two states of one word', String(MEETING_STATE_MEANING.waiting).slice(0, 120))
  ok(Array.isArray(v.nextActions) && v.nextActions.length > 0 && v.nextActions.some((a) => a && a.action === 'attend'),
    '§4e. here the first named action is attend (more people can still open it), not proceed — the advice follows the reason', v.nextActions)
}

// ── §5: proceed() is the way out, and afterwards the two readings flip without ambiguity ──────────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + HOUR })
  svc.attend({ meeting: sched.meeting, member: 'r-1' })
  now.t = NOW + HOUR + 13967
  svc.sweepDue()
  const pr = svc.proceed({ meeting: sched.meeting, actor: 'acad' })

  ok(pr.ok === true && pr.state === 'open' && pr.startedLate === true,
    '§5a. ★★ the chair\'s proceed() opens it and records that it started late (the only way out of waiting)', { state: pr.state, startedLate: pr.startedLate })
  ok(pr.elapsedSinceMs === 0 && pr.startsInMs === null,
    '§5b. ★★ immediately after proceed: elapsedSinceMs is 0 (never negative) and startsInMs is null — the two fields switched roles with the state, instead of one field changing meaning', { elapsedSinceMs: pr.elapsedSinceMs, startsInMs: pr.startsInMs })
  ok(pr.requiresChairProceed === false,
    '§5c. requiresChairProceed flips to false once the meeting runs (nobody has to open it any more)', pr.requiresChairProceed)
  ok(pr.receipt && pr.receipt.elapsedSinceMs === 0 && pr.receipt.startsInMs === null,
    '§5d. the receipt envelope carries the same window (the return value spreads it, so the two cannot disagree)', pr.receipt && { elapsedSinceMs: pr.receipt.elapsedSinceMs, startsInMs: pr.receipt.startsInMs })

  now.t = NOW + HOUR + 13967 + 5000
  const openView = svc.meetingView({ meeting: sched.meeting })
  ok(openView.started === true && openView.elapsedSinceMs === 5000,
    '§5e. ★ once running, elapsedSinceMs grows from the moment it ACTUALLY opened (activatedAt), not from scheduledFor', { elapsedSinceMs: openView.elapsedSinceMs })
  ok(openView.elapsedMs === openView.elapsedSinceMs,
    '§5f. elapsedMs is now an alias of elapsedSinceMs (an old reader gets the running time, and null while not started)', { elapsedMs: openView.elapsedMs, elapsedSinceMs: openView.elapsedSinceMs })
  ok(openView.waitingFor === null && openView.requiresChairProceed === false,
    '§5g. a running meeting names no waiting reason and requires nobody to open it', { waitingFor: openView.waitingFor })
}

// ── §6: a RELATIVE `at` comes back resolved, with its spelling named ───────────────────────────────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const rel = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'x', at: '+180s' })

  ok(rel.state === 'scheduled' && rel.scheduledFor === NOW + 180000,
    '§6a. "+180s" is resolved against the KERNEL clock (not the wall clock) into an epoch instant', { state: rel.state, scheduledFor: rel.scheduledFor })
  ok(rel.atSource === 'relative',
    '§6b. ★ atSource names the spelling the caller used: "relative" (before this run the raw string was echoed and nothing else)', rel.atSource)
  ok(rel.scheduledForIso === new Date(NOW + 180000).toISOString(),
    '§6c. ★ and scheduledForIso gives the resolved instant as ISO — a reader does not have to re-parse "+180s" with a clock it does not have', rel.scheduledForIso)
  ok(rel.startsInMs === 180000,
    '§6d. startsInMs measures the same instant from now (180000 ms), consistent with scheduledForIso', rel.startsInMs)
  ok(nonEmptyString(rel.atSourceMeans) && rel.atSourceMeans.includes('RELATIVE'),
    '§6e. and the receipt says what atSource means (relative offsets are resolved by the kernel clock)', String(rel.atSourceMeans).slice(0, 120))

  const abs = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'y', at: NOW + 2 * HOUR })
  ok(abs.atSource === 'absolute',
    '§6f. the same field names an absolute `at` as "absolute" (two spellings, one field, no guessing)', abs.atSource)
}

// ── §7: the same-source invariant, stated as a property of the two tables ─────────────────────────────────────────
{
  const keys = Object.keys(WAITING_FOR_MEANS)
  ok(keys.length === 2 && keys.includes('quorum') && keys.includes('chair-proceed'),
    '§7a. WAITING_FOR_MEANS declares exactly the two reachable reasons (a third would need a third branch in the state machine)', keys)
  ok(keys.length > 0 && keys.every((k) => nonEmptyString(WAITING_FOR_MEANS[k]) && WAITING_FOR_MEANS[k].length > 60),
    '§7b. each reason is a real sentence, not a label (a reader gets prose, the same prose the state sentence quotes)', keys)
  ok(keys.length > 0 && keys.every((k) => MEETING_STATE_MEANING.waiting.includes(WAITING_FOR_MEANS[k])),
    '§7c. ★★★ EVERY reason in the table appears in MEETING_STATE_MEANING.waiting: the general sentence is assembled from the table, so adding a reason cannot leave the general sentence behind', keys)
  ok(keys.length > 0 && keys.every((k) => WAITING_FOR_MEANS[k] !== MEETING_STATE_MEANING.waiting),
    '§7d. and no reason is the general sentence itself (the specific reason must be MORE than the state\'s sentence)', keys)
}

// ── §8: END-TO-END through the framework face the office actually calls ─────────────────────────────────────────────
// The kernel-level sections above prove the SERVICE is truthful; this one proves the receipt a CALLER reads (the
// framework tool spec in tools/meeting.js) carries the same fields — echoed by name, never recomputed.
{
  const root = await mkdtemp(join(__tmpRoot(), 'vmu-run251-meeting-'))
  try {
    const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
    const state = { specs: [] }
    const ctx = {
      effect: (fn) => fn(),
      on: () => () => {},
      tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    }
    const handle = entry.apply(ctx, { root, clock: () => NOW, packs: ['v5r'] })
    await handle.ready()
    const kernel = handle.kernel
    await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    const spec = state.specs.find((s) => s.name === 'vibe_vmu_meeting')
    ok(!!spec, '§8a. the framework meeting face is really registered (non-vacuous precondition for everything below)', state.specs.map((s) => s.name).filter((n) => /meeting/.test(n)))
    const raw = await spec.execute({ action: 'schedule', id: 'm-run251-sched', member: 'r-chair', members: ['r-chair', 'r-1'], title: '预约 +180s', at: '+180s' }, {})
    const out = JSON.parse(raw)
    ok(out.ok === true && out.state === 'scheduled' && out.scheduledFor === NOW + 180000,
      '§8b. `action:"schedule"` at "+180s" really creates a SCHEDULED meeting at clock+180s', { ok: out.ok, state: out.state, scheduledFor: out.scheduledFor })
    ok(out.atSource === 'relative' && out.atSourceMeans && String(out.atSourceMeans).includes('RELATIVE'),
      '§8c. ★★ the TOOL receipt names the spelling ("relative") — before this run the face echoed the raw string and nothing else', { atSource: out.atSource, means: String(out.atSourceMeans).slice(0, 80) })
    ok(out.scheduledForIso === new Date(NOW + 180000).toISOString(),
      '§8d. ★★ and gives the RESOLVED instant as ISO, so a reader does not have to re-parse "+180s" with a clock it does not have', out.scheduledForIso)
    ok(out.requiresChairProceed === true && Array.isArray(out.nextActions) && out.nextActions.length === 3 && out.nextActions.some((a) => a && a.action === 'beat'),
      '§8e. ★★★ the schedule receipt PRE-ANNOUNCES that the chair must proceed (nextActions starts with beat): nobody can read this receipt and believe the meeting opens by itself', { requiresChairProceed: out.requiresChairProceed, nextActions: out.nextActions && out.nextActions.map((a) => a && a.action) })
    ok(out.startsInMs === 180000 && out.elapsedSinceMs === null && out.elapsedMs === null,
      '§8f. the tool receipt carries the same start window (startsInMs positive, elapsed* null — never a negative elapsed)', { startsInMs: out.startsInMs, elapsedSinceMs: out.elapsedSinceMs, elapsedMs: out.elapsedMs })
  } finally {
    // the kernel may still be flushing its store when the block ends; a leftover temp root is not a test failure
    try { await rm(root, { recursive: true, force: true }) } catch { /* Windows may hold a handle for a moment */ }
  }
}

console.log('')
console.log('=== VMU RUN 251 MEETING WINDOW: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
}
