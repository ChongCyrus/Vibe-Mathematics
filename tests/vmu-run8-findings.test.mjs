// tests/vmu-run8-findings.test.mjs — live run 8's four READ-FACE findings, pinned at the seam each one lived at.
//
// Why a separate suite: all four defects are the same species — a read face that told the reader something different
// from what the system had decided (or refused to say what its own status() knew). None of them is a missing rule, so
// none of them is visible from the rule table; each needs a REAL assembly to be seen:
//
//   B  `vibe_v5_overview.meetings[].state` reported the MARKER's lifecycle ("open" as soon as a meeting is convened)
//      instead of the MEETING's schedule-aware state ⇒ one read face contradicted another for the same id in the same
//      window (`vibe_v5_meeting {action:"status"}` said "scheduled", the overview said "open").
//   C  `faces.enabledGap[].kind` tested `face === 'pack'`, but pack tools carry `face: 'pack:<name>'` ⇒ the
//      "pack-tool" label was UNREACHABLE and every pack tool was mislabelled `route-not-recorded`.
//   D  `quorum.met` answers the FLOOR question; with the deployment default floor of 0 it is true while nobody has
//      attended, so `met:true` could be read as "the institution's rule is satisfied". `floorMet`/`metIs` now say which
//      question the boolean answers.
//   F  the `VMU_REPORT_NO_TRANSPORT` refusal carried only code/message/hint, so the two facts the acceptance check reads
//      (`drives`, `transportInjected`) existed only on `status()`/`declarations()` — a refusal is a read face too.
//
// WHAT THIS SUITE DOES NOT PROVE: it does not exercise the host's published-tool wire (`vmu-host.test.mjs` does) nor a
// real model session (the live SLV does). C is pinned on the same `status()` builder the live run read.
//
// RULE E (this repo): every loop/every() below is preceded by an explicit NON-EMPTY assertion, so "zero offenders"
// cannot be vacuous.

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
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => Date.now() }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) throw new Error('no such tool: ' + name)
  try { return JSON.parse(await spec.execute(args, {})) } catch (e) { return { ok: false, code: codeOf(e), message: e.message, hint: e.hint } }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run8-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  ok(kernel !== null && kernel !== undefined, 'boot produced a kernel (a green without one would be vacuous)')
  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  // ── B ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== B. the overview reports the MEETING state, not the marker lifecycle ===')
  const future = Date.now() + 3_600_000
  const scheduled = await receipt(b, 'vibe_v5_meeting', { member: 'acad', agenda: '预约一场会后读总览', at: future })
  ok(scheduled && scheduled.ok === true && scheduled.state === 'scheduled',
    'setup: a future `at` really opens a SCHEDULED meeting (guard: otherwise this measures nothing)', scheduled && (scheduled.state || scheduled.code))
  const overview = await receipt(b, 'vibe_v5_overview', { member: 'acad' })
  ok(overview && overview.ok === true && Array.isArray(overview.meetings), 'overview returns meetings[]', overview && (overview.code || overview.meetings))
  const row = (overview.meetings || []).filter((m) => m.id === scheduled.meeting)[0]
  ok(row !== undefined, 'the scheduled meeting appears in the overview', overview.meetings)
  ok(row && row.state === 'scheduled', '★★★ B: overview state === the meeting\'s schedule-aware state', row && row.state)
  ok(row && row.stateSource === 'meeting service view', '★ and it NAMES its source (not the marker)', row && row.stateSource)
  ok(row && row.markerState !== 'scheduled',
    '★★ the marker can never be the SOURCE of a schedule state: its own lifecycle is kept under markerState and is not scheduled',
    row && { state: row.state, markerState: row.markerState })
  ok(row && row.scheduledFor === future, 'the schedule time rides along on the overview row', row && row.scheduledFor)

  // ── C ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== C. a pack tool\'s enabledGap row is labelled pack-tool ===')
  // `detail:'full'` is the shape that carries `faces.enabledGap`; the brief receipt omits it (measured).
  const status = await receipt(b, 'vibe_vmu_status', { detail: 'full' })
  ok(status && status.ok === true && status.faces && Array.isArray(status.faces.enabledGap),
    'status publishes faces.enabledGap', status && (status.code || (status.faces && status.faces.enabledGap)))
  const gap = (status.faces && status.faces.enabledGap) || []
  ok(gap.length > 0, '★ guard: there ARE gap rows to label (an empty list would make the assertion vacuous)', gap.length)
  const packRows = gap.filter((d) => String(d.face || '').startsWith('pack:'))
  ok(packRows.length > 0, '★ guard: at least one of them is a pack:<name> row', packRows.length)
  const mislabelled = packRows.filter((d) => !String(d.kind || '').startsWith('pack-tool'))
  ok(mislabelled.length === 0,
    '★★★ C: every pack:<name> gap is labelled pack-tool (the old `face === "pack"` test could never match)', mislabelled.slice(0, 3))
  const nonPack = gap.filter((d) => !String(d.face || '').startsWith('pack'))
  ok(nonPack.length > 0, '★ guard: there are non-pack gaps too (else "the others kept their label" is vacuous)', nonPack.length)
  ok(nonPack.every((d) => String(d.kind || '').startsWith('route-not-recorded')),
    '★ the non-pack gaps keep their own label — the fix did not relabel everything', nonPack.slice(0, 3))

  // ── D ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== D. quorum.met is the FLOOR question, and says so ===')
  const met = await receipt(b, 'vibe_v5_meeting', { member: 'acad', agenda: '读法定数回执', roster: ['acad', 'r-1'] })
  ok(met && met.ok === true, 'setup: an ordinary meeting convenes', met && (met.code || met.meeting))
  const st = await receipt(b, 'vibe_vmu_meeting', { action: 'status', id: met.meeting })
  const q = (st && st.quorum) || (met && met.quorum) || null
  ok(q !== null, 'the meeting status receipt carries quorum', st && (st.quorum || st.code))
  ok(q && q.floorMet === q.met,
    '★★ D: floorMet is the SAME boolean as met (one fact, two names — not two computations that can drift)', q && { met: q.met, floorMet: q.floorMet })
  ok(q && typeof q.metIs === 'string' && /FLOOR/.test(q.metIs) && /NOT the institution rule/.test(q.metIs),
    '★★★ and `metIs` names which question the boolean answers (FLOOR only, not the institution rule)', q && q.metIs)
  ok(q && q.floorMet === true && q.unanimity && q.unanimity.met === false,
    '★★ with the default zero floor: the floor is met while unanimity is NOT — the exact reading that used to be ambiguous',
    q && { floor: q.floorMet, unanimity: q.unanimity && q.unanimity.met })

  // ── F ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== F. the no-transport REFUSAL carries drives / transportInjected ===')
  ok(kernel.report && typeof kernel.report.emit === 'function', 'the report service exposes emit (guard)', typeof (kernel.report || {}).emit)
  const declared = kernel.report.declarations()
  const names = ((declared && declared.items) || []).map((r) => r && r.name).filter((n) => typeof n === 'string' && n !== '')
  ok(names.length > 0, '★ guard: the pack really DECLARES reports (else the refusal below would be about a bad name)', declared && declared.items)
  let emitted = null
  try { emitted = kernel.report.emit({ name: names[0], payload: { note: 'run-8 finding F' } }) } catch (e) { emitted = { refused: { code: e.code, message: e.message, hint: e.hint, drives: e.drives, neverDrives: e.neverDrives, transportInjected: e.transportInjected } } }
  ok(emitted && emitted.refused && emitted.refused.code === 'VMU_REPORT_NO_TRANSPORT',
    'setup: with no transport injected the emit is REFUSED by name (guard)', emitted && emitted.refused && emitted.refused.code)
  const ref = (emitted && emitted.refused) || {}
  ok(ref.drives === false, '★★★ F: the refusal itself carries drives:false (it used to live only on status())', ref.drives)
  ok(ref.neverDrives === true, '★ and neverDrives:true', ref.neverDrives)
  ok(ref.transportInjected === false, '★ and transportInjected:false, so "nothing was sent" is readable from the refusal', ref.transportInjected)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('')
if (failures.length === 0) console.log('=== VMU RUN 8 FINDINGS: ' + passed + ' passed, 0 failed ===')
else {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  console.log('=== VMU RUN 8 FINDINGS: ' + passed + ' passed, ' + failures.length + ' failed ===')
  process.exitCode = 1
}
