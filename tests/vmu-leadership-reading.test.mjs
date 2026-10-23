// tests/vmu-leadership-reading.test.mjs — R13: SEATING A CHAIR IS NOT THE SAME FACT AS NAMING A LEADER
//
// THE DEFECT THIS PINS (measured, not theorised). On the full live run of 2026-10-24
// (`D:\wd\vibemath开发\_oneoff\vm-slv\full-1024-033834.jsonl`) the root session installed the academician with
//
//     vibe_vmu_control {"action":"hire","slot":"chair","member_id":"member-1"}
//
// and every member prompt still opened with
//
//     · 本所当前没有在册院士：你只需向**雇主**负责（它给你派活）。
//
// — the LEADERLESS charter — while that same prompt's role block said 「角色：chair」. Both components were
// individually correct: `vmu.turn.leaderId` (settings/schema.js, default '') is the ONLY thing the charter reads,
// and the pack's leader-pair policy (`middleware/prompt-switches.js` §4) may only name a leader it can PROVE is on
// staff. Nothing connected "a chair is seated" to "a leader is named", so the safe default answered
// "no academician" — a FALSE statement about a seated one.
//
// WHAT IS TESTED HERE: the pure reading (`vibe-math-vmu/packs/v5r/leadership.js`) that names the disagreement, and
// the fact that its consumer exists (the chair-only `vibe_v5_overview` prints `leadership`, and raises a top-level
// `warning` exactly where a caller can act). The prompt side is NOT tested here: the charter's texts are the frozen
// capture layer (T71 parity), so the repair is the office's duty plus this reading — see ledger §23.
//
// ★ WHAT THIS SUITE CANNOT PROVE: that the PROMPT names the leader. That needs the setting to be written by the
// office during a live run (the live-run task file asks for it), and it is reported separately. This suite proves the
// reading cannot say "consistent" while the two facts disagree, and cannot stay silent when they do.
//
// Run: node tests/vmu-leadership-reading.test.mjs   (last line: === VMU LEADERSHIP READING: N passed, M failed ===)

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PACK_DIR = join(REPO, 'vibe-math-vmu', 'packs', 'v5r')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']'))
  return false
}

const mod = await import(pathToFileURL(join(PACK_DIR, 'leadership.js')).href)
const { leadershipReading, leadershipWarning, LEADER_SLOT, LEADERSHIP_STATES } = mod

// ★ THE ROSTER SHAPE IS THE KERNEL'S, NOT AN INVENTED ONE: `members.roster()` returns rows with {id, slot, state}.
const ROSTER_CHAIR = Object.freeze([
  Object.freeze({ id: 'member-1', slot: 'chair', state: 'live' }),
  Object.freeze({ id: 'member-2', slot: 'member', state: 'live' }),
])
const ROSTER_RESIDENT_ONLY = Object.freeze([Object.freeze({ id: 'member-2', slot: 'member', state: 'live' })])
const ROSTER_ENDED_CHAIR = Object.freeze([
  Object.freeze({ id: 'member-1', slot: 'chair', state: 'ended' }),
  Object.freeze({ id: 'member-2', slot: 'member', state: 'live' }),
])

console.log('=== 1. THE STATE NAMES ARE DECLARED, NOT IMPROVISED ===')
ok(typeof LEADER_SLOT === 'string' && LEADER_SLOT.length > 0, 'the leader slot is a declared name', LEADER_SLOT)
ok(LEADER_SLOT === 'chair', 'the leader slot is the pack\'s chair slot (the academician seat in v5r)', LEADER_SLOT)
const stateValues = Object.values(LEADERSHIP_STATES)
ok(stateValues.length > 0, 'the state table is non-empty (RULE E)', stateValues.length)
ok(new Set(stateValues).size === stateValues.length, 'state codes are unique (a reader can switch on them)', stateValues)
ok(Object.isFrozen(LEADERSHIP_STATES), 'the state table is frozen (a consumer cannot invent a sixth state)')

console.log('=== 2. THE MEASURED CASE: A SEATED CHAIR WITH NO NAMED LEADER IS NOT CONSISTENT ===')
const measured = leadershipReading({ roster: ROSTER_CHAIR, leaderId: '' })
ok(measured.code === LEADERSHIP_STATES.CHAIR_WITHOUT_ID, 'chair seated + leaderId empty ⇒ chair-seated-but-leaderId-empty', measured.code)
ok(measured.consistent === false, 'that state is NOT consistent (the live run read it as "no academician")', measured.consistent)
ok(measured.leaderOnStaff === false, 'the policy may not claim the leader is on staff', measured.leaderOnStaff)
ok(Array.isArray(measured.seatedChairs) && measured.seatedChairs.length === 1 && measured.seatedChairs[0] === 'member-1', 'the seated chair is NAMED in the reading', measured.seatedChairs)
ok(typeof measured.note === 'string' && measured.note.length > 40, 'the note explains the disagreement in words', measured.note)
ok(typeof measured.next === 'string' && measured.next.includes('vibe_v5_configure'), 'the reading names the DECLARED write path rather than writing itself', measured.next)
ok(typeof measured.next === 'string' && measured.next.includes('member-1'), 'the suggested command names the actual chair', measured.next)
const warned = leadershipWarning(measured)
ok(warned && warned.code === measured.code, 'the warning carries the same code (one reading, one verdict)', warned && warned.code)
ok(warned && warned.next === measured.next, 'the warning forwards the actionable command untouched', warned && warned.next)

console.log('=== 3. THE FOUR OTHER STATES, EACH PINNED IN BOTH DIRECTIONS ===')
const okCase = leadershipReading({ roster: ROSTER_CHAIR, leaderId: 'member-1' })
ok(okCase.code === LEADERSHIP_STATES.OK, 'chair seated + leaderId naming it ⇒ leader-named-and-seated', okCase.code)
ok(okCase.consistent === true && okCase.leaderOnStaff === true, 'that state IS consistent and may name the leader', okCase)
ok(okCase.next === null, 'no action is suggested when the facts agree', okCase.next)
ok(leadershipWarning(okCase) === null, 'no warning when the facts agree', leadershipWarning(okCase))

const noChair = leadershipReading({ roster: ROSTER_RESIDENT_ONLY, leaderId: '' })
ok(noChair.code === LEADERSHIP_STATES.NO_CHAIR, 'no chair + no leader ⇒ no-chair-seated (true, not a defect)', noChair.code)
ok(noChair.consistent === false && noChair.leaderOnStaff === false, 'it is still NOT "leader on staff" (the charter must stay leaderless)', noChair)
ok(leadershipWarning(noChair) === null, 'but it raises NO warning: a truthful "no academician" is not a defect', leadershipWarning(noChair))

const wrongId = leadershipReading({ roster: ROSTER_CHAIR, leaderId: 'member-9' })
ok(wrongId.code === LEADERSHIP_STATES.ID_NOT_ON_ROSTER, 'leaderId naming an absent member ⇒ not-on-the-roster', wrongId.code)
ok(wrongId.consistent === false && wrongId.leaderOnStaff === false, 'a leader who is not on staff is never named (charter rule 1)', wrongId)
ok(leadershipWarning(wrongId) !== null, 'that IS warned: it must be repaired, not silently tolerated', leadershipWarning(wrongId))

const wrongSlot = leadershipReading({ roster: ROSTER_CHAIR, leaderId: 'member-2' })
ok(wrongSlot.code === LEADERSHIP_STATES.ID_NOT_CHAIR, 'leaderId naming a non-leader-slot member ⇒ outside-the-chair-slot', wrongSlot.code)
ok(wrongSlot.consistent === false, 'a resident must not be presented as the leader', wrongSlot.consistent)

console.log('=== 4. A SEATED-THEN-ENDED CHAIR IS NOT SEATED (the row outlives the member) ===')
const ended = leadershipReading({ roster: ROSTER_ENDED_CHAIR, leaderId: '' })
ok(ended.code === LEADERSHIP_STATES.NO_CHAIR, 'an ENDED chair row does not count as a seated chair', ended.code)
ok(Array.isArray(ended.seatedChairs) && ended.seatedChairs.length === 0, 'the ended chair is not in seatedChairs', ended.seatedChairs)
const endedButNamed = leadershipReading({ roster: ROSTER_ENDED_CHAIR, leaderId: 'member-1' })
ok(endedButNamed.code === LEADERSHIP_STATES.ID_NOT_ON_ROSTER, 'a NAMED leader who has ended is refused rather than named', endedButNamed.code)

console.log('=== 5. DEFENSIVE SHAPES: A READING THAT THROWS IS NOT A GATE ===')
const undef = leadershipReading({})
ok(undef && undef.code === LEADERSHIP_STATES.NO_CHAIR, 'no arguments at all ⇒ no-chair-seated instead of a crash', undef && undef.code)
const junkRoster = leadershipReading({ roster: 'not-an-array', leaderId: '' })
ok(junkRoster && junkRoster.code === LEADERSHIP_STATES.NO_CHAIR, 'a non-array roster is treated as empty, not spread', junkRoster && junkRoster.code)
const junkId = leadershipReading({ roster: ROSTER_CHAIR, leaderId: 42 })
ok(junkId && junkId.code === LEADERSHIP_STATES.CHAIR_WITHOUT_ID, 'a non-string leaderId cannot name anyone ⇒ the seated-chair defect', junkId && junkId.code)
const customSlot = leadershipReading({ roster: ROSTER_CHAIR, leaderId: 'member-1', leaderSlot: 'dean' })
ok(customSlot && customSlot.code === LEADERSHIP_STATES.ID_NOT_CHAIR, 'the slot name is a parameter, not a buried literal', customSlot && customSlot.code)

console.log('=== 6. THE CONSUMER EXISTS: THE CHAIR-ONLY OVERVIEW PRINTS THIS READING ===')
const toolsSrc = readFileSync(join(PACK_DIR, 'tools.js'), 'utf8')
ok(toolsSrc.includes("from './leadership.js'"), 'tools.js IMPORTS the reading (red line 4: a module with no consumer is not a mechanism)', toolsSrc.includes("from './leadership.js'"))
ok(toolsSrc.includes('leadershipReading({'), 'tools.js CALLS it', true)
ok(/leadership\s*\}/.test(toolsSrc) || toolsSrc.includes('leadership }'), 'the overview receipt CARRIES `leadership`', true)
ok(toolsSrc.includes('leadershipWarning('), 'the overview asks for the warning through the shared helper', true)
ok(toolsSrc.includes('out.warning'), 'the warning reaches the receipt as a top-level field', true)
// The prompt-side correction exists and names both halves: the setting and the write path.
const corr = await import(pathToFileURL(join(PACK_DIR, 'prompts', 'v5r-corrections.js')).href)
const CORR_LEADER = (corr.V5R_CORRECTION_SECTIONS || []).filter((s) => s && s.name === 'v5r-fix-leader-id')[0]
ok(CORR_LEADER !== undefined, 'the pack carries a NAMED correction for the leader duty (not a silent hope)', CORR_LEADER && CORR_LEADER.name)
ok(CORR_LEADER && String(CORR_LEADER.text).includes('vmu.turn.leaderId'), 'the correction names the setting', CORR_LEADER && CORR_LEADER.text.slice(0, 80))
ok(CORR_LEADER && String(CORR_LEADER.text).includes('vibe_v5_configure'), 'the correction names the write path', true)
ok(CORR_LEADER && String(CORR_LEADER.text).includes(LEADERSHIP_STATES.CHAIR_WITHOUT_ID), 'the correction names the STATE a reader will see', LEADERSHIP_STATES.CHAIR_WITHOUT_ID)
ok(CORR_LEADER && CORR_LEADER.order > 800 && CORR_LEADER.order < 900, 'the correction sits in the pack band, after the wording it repairs', CORR_LEADER && CORR_LEADER.order)

console.log('')
if (failed > 0) { for (const f of failures) console.log('FAILED: ' + f) }
console.log('=== VMU LEADERSHIP READING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
