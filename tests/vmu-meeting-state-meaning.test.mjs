// tests/vmu-meeting-state-meaning.test.mjs — R31/F: EVERY MEETING STATE A MODULE CAN EMIT MUST CARRY A SENTENCE.
//
// THE MEASURED DEFECT (live run 31, 2026-10-26, `_oneoff/vm-slv/full-1026-191645.jsonl`): the pack's kind judgement
// read the meeting's own status and got `state: "open"` together with `stateMeans: null`. The reader was handed a state
// name and told, in the same breath, that the framework had no explanation for it — and `closurePhase` then had to fall
// back to `unknown`. Root cause: `MEETING_STATE_MEANING` (kernel/meeting.js) described only the PRIMITIVE's vocabulary
// (idle/convened/in_session/closed) plus two SERVICE words that happen to be shared, while the SERVICE
// (`kernel/meetings.js`, the one vmu actually runs) also emits `open` / `recess` / `suspended`. So the everyday case —
// an open meeting — was the one case with no sentence.
//
// WHY A DERIVED GATE AND NOT A LONGER HAND LIST: the same session wrote the lesson down twice ("a declaration that no
// mechanism derives from will drift"). This suite therefore SCANS both modules for the state literals they compare or
// assign, and fails when any of them has no entry. If someone adds a seventh state to meetings.js tomorrow, this suite
// goes red without anyone remembering to update a table.
//
// Run: node tests/vmu-meeting-state-meaning.test.mjs   (last line: === VMU MEETING STATE MEANING: N passed, M failed ===)

import { readFileSync } from 'node:fs'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { MEETING_STATE_MEANING } from '../vibe-math-vmu/kernel/meeting.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}

// ── 1. THE VOCABULARY IS DERIVED FROM THE TWO MODULES, NOT FROM A LIST HERE ─────────────────────────────────────
const MODULES = ['vibe-math-vmu/kernel/meeting.js', 'vibe-math-vmu/kernel/meetings.js']
const PATTERNS = [
  /\bm\.state === '([a-z_]+)'/g,
  /\bm\.state !== '([a-z_]+)'/g,
  /\bm\.state = '([a-z_]+)'/g,
  /\bstate: '([a-z_]+)'/g,
  /\bstate\.value === '([a-z_]+)'/g,
  /\bstate\.value = '([a-z_]+)'/g,
]
const scanned = new Set()
for (const rel of MODULES) {
  const src = readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
  for (const p of PATTERNS) for (const m of src.matchAll(p)) scanned.add(m[1])
}
{
  ok(scanned.size >= 8,
    'D1. the scan is not vacuous: both modules expose at least eight distinct state literals',
    { found: [...scanned].sort() })
  ok(scanned.has('open') && scanned.has('in_session'),
    'D2. ★★ the scan sees BOTH vocabularies (the service\'s `open` and the primitive\'s `in_session`) — that is what the defect was',
    { found: [...scanned].sort() })

  const missing = [...scanned].filter((s) => !Object.prototype.hasOwnProperty.call(MEETING_STATE_MEANING, s)).sort()
  ok(missing.length === 0,
    'D3. ★★★ every state either module can emit has a sentence in MEETING_STATE_MEANING (add the state, not just the word)',
    { missing, have: Object.keys(MEETING_STATE_MEANING).sort() })

  const empty = Object.entries(MEETING_STATE_MEANING)
    .filter(([, v]) => typeof v !== 'string' || v.trim().length < 20)
    .map(([k]) => k)
  ok(empty.length === 0,
    'D4. no meaning is a placeholder: each is a real sentence (≥20 chars), not "" or a bare state name',
    { empty })

  // The service's everyday word gets the honest reading: "open" must not be explained away as the primitive's phase.
  ok(/SERVICE/.test(String(MEETING_STATE_MEANING.open || '')) && /in_session/.test(String(MEETING_STATE_MEANING.open || '')),
    'D5. ★★ `open` says it is the SERVICE vocabulary AND names the primitive phase it corresponds to — one reading, two names, no guessing',
    { open: MEETING_STATE_MEANING.open })
}

// ── 2. THE RUNTIME READING: an OPEN meeting reports a sentence, not null (this is run 31's exact hole) ───────────
{
  const kernel = createKernel({
    clock: () => 1000,
    settings: {},
    deliverTurn: deliverByReturning(),
    slots: PACK.slots,
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  const spec = (n) => specs.find((s) => s.name === n)
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'I' })
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })

  const opened = await spec(TOOL_NAMES.meeting).run({ action: 'open', member: 'm1', agenda: 'A', roster: ['m1', 'm2'] })
  ok(opened && opened.ok === true, 'S1. the meeting opens (fixture precondition)', { opened })
  const id = opened && opened.id

  const status = await spec(TOOL_NAMES.meeting).run({ action: 'status', id })
  ok(status && status.ok === true, 'S2. its status is readable', { status: status && status.ok })
  const row = status && (status.meeting || status)
  ok(row && typeof row.state === 'string' && row.state.length > 0,
    'S3. the status names its state', { state: row && row.state })
  ok(row && typeof row.stateMeans === 'string' && row.stateMeans.trim().length > 0,
    'S4. ★★★ and the state comes WITH its sentence — `state: "open"` + `stateMeans: null` was the run 31 defect',
    { state: row && row.state, stateMeans: row && row.stateMeans })
  ok(row && MEETING_STATE_MEANING[row.state] === row.stateMeans,
    'S5. ★ the sentence the service publishes IS the one map entry for that state (one wording, not a second copy)',
    { state: row && row.state, published: row && row.stateMeans, mapped: row && MEETING_STATE_MEANING[row.state] })
}

console.log(failures.length === 0
  ? '\n=== VMU MEETING STATE MEANING: ' + passed + ' passed, 0 failed ==='
  : '\nFAILURES:\n' + failures.map((f) => '  FAIL ' + f).join('\n') + '\n=== VMU MEETING STATE MEANING: ' + passed + ' passed, ' + failed + ' failed ===')
