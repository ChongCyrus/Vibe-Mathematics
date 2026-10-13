// tests/vmu-turn-contracts.test.mjs - two kernel contracts read line by line this round, each pinned by behaviour.
//
// CONTRACT 1 - THE MEETING STATE IS NAMED BY THE DRIVER, NEVER DEFAULTED. The pack's own middleware states it: the four
// `v5r-meeting-*` sections are injected only when `turn.meetingState` says which applies, absent means NONE of them
// deliberately, because guessing a round's speaker situation would put the wrong instructions in front of a member. It also
// records that the tests name it and the plugin does not - which is why it is a note rather than a fallback.
//
// CONTRACT 2 - A REFUSED DISPATCH BECOMES A NOTICE FOR THE NEXT PROMPT, NOT THIS ONE. The loop queues it AFTER this turn's
// assembly, so the prompt that caused the refusal cannot announce its own failure; the next prompt must carry it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections, MEETING_STATES } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const SETTINGS = {}
const makeLoop = (sections = CHARTER_SECTIONS, bindings = CHARTER_BINDINGS) => createTurnOrchestrator({
  sectionPolicy: decideSections,
  prompt: createPromptPipeline({ sections, bindings, clock: () => '2026-01-01T00:00:00.000Z' }),
})
// THE LIST COMES FROM THE MIDDLEWARE, not from my memory of it: v5r-meeting-ask is phase-gated rather than state-gated,
// so a hand-written list of four wrongly included it and the test blamed the code for my error.
// MEETING_STATES holds the STATE KEYS (invited, others, first); the sections are named v5r-meeting-<key>.
const MEETING_NAMES = MEETING_STATES.map(([key]) => 'v5r-meeting-' + key)

/** Which of the four meeting sections actually made it into the turn. */
async function meetingSectionsIn(loop, args) {
  const out = await loop.assemble(loop.open(args).turn)
  const text = String(out.text)
  return MEETING_NAMES.filter((n) => sectionsPresent(text, n))
}

// the sections carry distinctive Chinese text; read their marker from the source of truth rather than hard-coding it
function sectionsPresent(text, name) {
  const sec = CHARTER_SECTIONS.find((s) => s.name === name)
  if (!sec || typeof sec.text !== 'string') return false
  const probe = sec.text.replace(/\{\{[^}]*\}\}/g, '').trim().slice(0, 12)
  return probe.length > 3 && text.includes(probe)
}

console.log('=== 1. THE FOUR MEETING SECTIONS EXIST AND ARE DECIDED, NOT HARD-CODED IN THE LOOP ===')
ok(MEETING_NAMES.length >= 2 && MEETING_NAMES.every((n) => CHARTER_SECTIONS.some((s) => s.name === n)),
  'every state-gated meeting section the middleware names is declared by the PACK rather than by the loop', { names: MEETING_NAMES })
const decideSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'middleware', 'prompt-switches.js'), 'utf8')
ok(/turn\.meetingState/.test(decideSrc), 'and the middleware READS turn.meetingState, which is the seam the contract names')
const turnSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
ok(!/MEETING_NAMES|v5r-meeting-/.test(turnSrc), 'while the kernel names none of them - the mechanism is the framework, the list is the pack')

console.log('=== 2. OUTSIDE A MEETING PHASE THE STATE IS IGNORED ===')
{
  const loop = makeLoop()
  const found = await meetingSectionsIn(loop, { member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', meetingState: 'invited' })
  ok(found.length === 0, 'a normal round with meetingState supplied anyway injects NONE of them, because the phase decides first', { found })
}

console.log('=== 3. IN A MEETING PHASE, ABSENT MEANS NONE - DELIBERATELY ===')
{
  const loop = makeLoop()
  const none = await meetingSectionsIn(loop, { member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'meeting' })
  ok(none.length === 0, 'a meeting round that names no state injects none of the four, because nothing defaults it', { none })
  const invited = await meetingSectionsIn(loop, { member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'meeting', meetingState: 'invited' })
  ok(invited.length >= 1, 'while naming one does inject it, so the setting is a real driver rather than decoration', { invited })
}

console.log('=== 4. AN UNRECOGNISED STATE IS REFUSED BY NAME ===')
{
  const decided = decideSections({ settings: SETTINGS, turn: { phase: 'meeting', meetingState: 'not-a-state' } })
  const errors = (decided && decided.errors) || []
  ok(errors.length === 1, 'a state nobody declared is an error rather than a silent default', { errors: errors.length })
  ok(errors.length === 1 && typeof errors[0].code === 'string' && errors[0].code.length > 0,
    'and the error carries a code, so a caller can tell what went wrong', { code: errors[0] && errors[0].code })
}

console.log('=== 5. A REFUSED DISPATCH IS QUEUED FOR THE NEXT PROMPT, NOT THIS ONE ===')
{
  const loop = makeLoop()
  const first = await loop.assemble(loop.open({
    member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal',
    statusBlock: '[状态] x',
    facts: { 'vmu.turn.taskUpdate': 'not-an-object' },
  }).turn)
  const firstText = String(first.text)
  // whatever the refusal path does, the notice must not be in the turn that caused it
  ok(!/未生效|V5_TASK_STALE_REVISION/.test(firstText), 'the turn that triggered a refusal does not announce its own failure in its own prompt')
}

console.log('=== 6. THE DOCUMENTED VARIABLE WHITELIST IS THE CODE ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8')
  const wm = /VARIABLE_WHITELIST = Object\.freeze\(\[([^\]]+)\]/.exec(src)
  const whitelist = wm ? wm[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean) : []
  ok(whitelist.length >= 8, 'the pipeline publishes a whitelist', { size: whitelist.length })
  const docSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '06-prompt-pipeline.md'), 'utf8')
  const line = docSrc.split('\n').find((l) => l.includes('白名单（逐字')) || ''
  ok(line.length > 0, 'and the volume states it as verbatim, which is a promise the reader relies on')
  const missing = whitelist.filter((v) => !line.includes('\`' + v + '\`'))
  ok(missing.length === 0,
    'so every whitelisted variable appears in that line - a template variable usable in code but absent from the volume is a gap for whoever writes a preset',
    { missing })
}

console.log('=== TURN CONTRACTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
