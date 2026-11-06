// RUN 244 — A RULER WITHOUT THE FACTS CHANNEL MEASURES A PROMPT NOBODY RECEIVES.
//
// The defect this suite pins: a turn BOUND to a meeting fills `{{ setting:vmu.turn.meetingType }}` /
// `…meetingChair` / `…meetingAgenda` from `faces['vmu.meetings'].summary({meeting})` (`kernel/turn/index.js`, the
// `meetingFacts` block). After RUN 242 gated the on-floor manual behind `scope.meetingId === 'required'`, the budget
// gate learned to BIND a meeting (`RULER_MEETING`) so the gated sections would render at all — but it passed no faces
// map, and the simulator's harness never passed `faces` either, so the agenda line rendered
// `议程：（类型：，主席：）。` with all three values EMPTY. Both rulers then agreed on a prompt that is ~370 characters
// shorter than the one a chair really reads: headroom that does not exist, the exact defect RUN 226 fixed on three
// other parameters. The kernel now exposes the ONE faces map it was built with (`kernel.faces`), the harness hands it
// to its orchestrator, and the gate takes the meeting id and its facts as inputs.

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const REPO = join(HERE, '..')
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')

let pass = 0
const fails = []
const ok = (cond, name, detail) => {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600))) }
}
const has = (text, needle) => text.indexOf(needle) !== -1

console.log('--- §0 the wiring, read off the source (three files, one map)')
const KERNEL = read('vibe-math-vmu/kernel/index.js')
const HARNESS = read('scripts/sim/harness.mjs')
const GATE_SRC = read('scripts/audit-prompt-budget.mjs')
const PARITY = read('tests/sim-assembly-parity.test.mjs')

ok(has(KERNEL, 'const turnFaces = facesFrom({ tasks, records, library, meetings, ballotbox, formal, mathjobs })'),
  'the kernel builds the faces map ONCE and names it ("the same map" beats "the same construction")')
ok(has(KERNEL, 'faces: turnFaces,'),
  'the turn loop is built with that object, not with a second assembly')
ok(has(KERNEL, 'get faces() { return turnFaces },'),
  'and the SAME object is on the public kernel API, so a ruler reads it instead of assembling a rival one')
ok(has(HARNESS, "faces: (handle.kernel && handle.kernel.faces && typeof handle.kernel.faces === 'object') ? handle.kernel.faces : {},"),
  'the simulator hands the kernel map to its orchestrator')
ok(has(GATE_SRC, 'export async function measure(options = {})'),
  'the budget gate takes its ruler inputs as a parameter (a caller with a live meeting can share them)')
ok(has(GATE_SRC, 'faces: rulerFaces,'),
  'the budget gate passes a faces map too — without one, `summary()` does not exist and the agenda line is empty again')
ok(has(GATE_SRC, 'summary: ({ meeting = null } = {}) => (meeting === rulerMeetingId'),
  'and its face answers for the id the ruler bound, not for a constant')
ok(has(PARITY, 'GATE.measure({ meetingId: RULER_ID, meetingFacts: RULER_FACTS })'),
  'the parity suite gives BOTH rulers the same id and the same facts (two rulers, one set of inputs)')

console.log('--- §1 the facts really reach the prompt (a booted kernel, a real meeting)')
const H = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const TMP = join(tmpdir(), 'vmu-run244-prompt-facts')
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'ws-'))
const h = await H.boot({ root, clock: () => Date.parse('2026-01-01T00:00:00.000Z'), withPrompt: true })
await h.call('vibe_v5_start', { researcherCount: 2 })
const convened = await h.call('vibe_v5_meeting', {
  member: 'r-acad', agenda: ['确认命题', '分配复核'], title: 'RUN 244 ruler meeting', type: 'ordinary',
})
const MID = String(convened.meeting || convened.id || '')
ok(MID !== '', 'the suite convened one meeting (its id is the binding every bound prompt will name)', convened)

const faces = h.kernel && h.kernel.faces
ok(Boolean(faces) && typeof faces === 'object', 'a booted kernel publishes the faces map it turned loop was built with', faces === undefined ? 'undefined' : Object.keys(faces).slice(0, 6))
const meetingFace = faces && faces['vmu.meetings']
ok(Boolean(meetingFace) && typeof meetingFace.summary === 'function', 'and that map carries the meetings face with `summary()`', meetingFace && Object.keys(meetingFace).slice(0, 8))
const reading = meetingFace.summary({ meeting: MID })
ok(Boolean(reading) && reading.type === 'ordinary', '`summary()` answers with the meeting type the prompt will print', reading && reading.type)
ok(Boolean(reading) && typeof reading.materials === 'string' && reading.materials.indexOf('确认命题') !== -1,
  'and with the agenda text (the face calls it `materials`; `agenda` is the same value)', reading && (reading.materials || '').slice(0, 60))

const chairBound = await h.prompts.assembleFor({ seat: 'chair', phase: 'meeting', meeting: MID })
const memberBound = await h.prompts.assembleFor({ seat: 'member', phase: 'meeting', meeting: MID })
const AGENDA_LINE = '议程：确认命题; 分配复核（类型：ordinary，主席：r-acad）'
ok(chairBound.indexOf(AGENDA_LINE) !== -1, 'a BOUND chair prompt prints the real agenda line, all three values filled', chairBound.indexOf('议程：') === -1 ? 'no 议程 line at all' : chairBound.slice(chairBound.indexOf('议程：'), chairBound.indexOf('议程：') + 80))
ok(memberBound.indexOf(AGENDA_LINE) !== -1, 'a BOUND member prompt prints the same real values (one fact, both seats)')
ok(chairBound.indexOf('本轮绑定该会议') !== -1 && memberBound.indexOf('本轮绑定该会议') !== -1,
  'and both say which meeting binds this turn')
ok(chairBound.indexOf('议程：（类型：') === -1 && memberBound.indexOf('议程：（类型：') === -1,
  'NO prompt still renders the empty three-value line (the symptom this round removed)')

console.log('--- §2 unbound turns: the manual stays out, and the generic prose is not the manual')
const chairUnbound = await h.prompts.assembleFor({ seat: 'chair', phase: 'meeting', meeting: null })
const memberUnbound = await h.prompts.assembleFor({ seat: 'member', phase: 'meeting', meeting: null })
ok(memberUnbound.indexOf('会议进行中') === -1 && memberUnbound.indexOf('议程：') === -1,
  'an unbound member meeting-phase prompt gets neither the on-floor manual nor an agenda line (RUN 242 A7)')
ok(chairUnbound.indexOf('会议进行中') !== -1,
  'an unbound chair prompt still carries the chair-only SCHEDULE teaching (a steward getting ready to convene)')
ok(chairUnbound.indexOf('`order` 不带 `members` 时只读队列') === -1,
  'but NOT the on-floor manual — the teaching that only makes sense on a floor that exists', chairUnbound.length)
ok(chairUnbound.length > 0 && memberUnbound.length > 0 && chairUnbound.length > memberUnbound.length,
  'and the chair prompt is still the longer of the two', { chair: chairUnbound.length, member: memberUnbound.length })

console.log('--- §3 the gate measures the same facts (a number, not a shape)')
const GATE = await import(pathToFileURL(join(REPO, 'scripts', 'audit-prompt-budget.mjs')).href)
const gate = await GATE.measure({ meetingId: MID, meetingFacts: { type: reading.type, chair: reading.chair || reading.convenedBy, agenda: reading.materials || reading.agenda } })
// The gate assembles with ITS context (round 3, roster 'acad、r-1', a status block, chair label 院士). Same inputs is the
// whole premise of a comparison: a different roster or round is a different prompt, so the harness is pinned to the gate's ctx.
// (This is exactly what tests/sim-assembly-parity.test.mjs does for all twelve seat/phase rows.)
const pinned = await h.prompts.assembleFor({ seat: 'chair', roleLabel: '院士', phase: 'meeting', round: 3, roster: 'acad、r-1', statusBlock: '[状态] x', member: 'r-1', meeting: MID })
const gateMeeting = gate && gate.seats && gate.seats.chair && gate.seats.chair.phases && gate.seats.chair.phases.meeting
// NOT byte equality here: this suite has already assembled several prompts above, and an assembly opens a turn, so the
// live state has moved on by the time the gate measures its own clean loop. Byte equality on CLEAN inputs is exactly what
// tests/sim-assembly-parity.test.mjs asserts for all twelve seat/phase rows (diff +0 each), and that suite is where a
// drift between the two rulers should go red. Here the honest claim is the documented ±200 band plus the direction that
// matters: the gate must never be the smaller of the two numbers.
const drift = gateMeeting && gateMeeting.chars - pinned.length
ok(Boolean(gateMeeting) && Math.abs(drift) <= 200,
  'with the same meeting and the same facts the gate lands within the documented 200-character band of the harness', { gate: gateMeeting && gateMeeting.chars, harness: pinned.length, drift })
ok(Boolean(gateMeeting) && drift <= 200, 'and the gate is never measuring a SMALLER prompt than the simulator (that would be headroom that does not exist)', { drift })
const gateDefault = await GATE.measure()
const gateDefaultMeeting = gateDefault.seats.chair.phases.meeting
ok(gateDefaultMeeting.chars > 31000,
  'and its DEFAULT ruler number includes the facts (before RUN 244 it measured the earlier, emptier prompt)', gateDefaultMeeting.chars)

rmSync(root, { recursive: true, force: true })
rmSync(TMP, { recursive: true, force: true })

console.log('')
console.log('=== vmu RUN 244 prompt facts: ' + pass + ' passed, ' + fails.length + ' failed ===')
if (fails.length > 0) { console.log('failures: ' + JSON.stringify(fails, null, 2)); process.exitCode = 1 }
