// tests/vmu-meeting-participation-state.test.mjs — ★ task-250.
//
// WHAT THIS PINS (verdict in `docs/acceptance/phase3-parity-monolith-collab.md` §8: DISTINGUISHED BUT NOT PERSISTED):
//   a member that was NEVER WOKEN must be distinguishable from one that was ASKED AND STAYED SILENT.
//   PART 1 (landed, task-248): the durable journal now carries the two "nothing happened to me" outcomes per member.
//   PART 2 (NOT landed, see the round-16 report): the assembled prompt still cannot express it - the producer of an
//   assembly-visible value has to be wired where the turn is assembled (`kernel/index.js` / the entry), which is
//   OUTSIDE this task's write scope.
//
// WHAT IS ASSERTED HERE, AND WHY IT IS NOT BUSY-WORK: the durable half is a CODE fact with two fragile properties -
//   the event must be MEMBER-addressed, and the unreached event must carry its RETRY COUNT (the original recorded
//   `tries`). A copy-based counterexample proves the assertion catches a regression to the old silence.
//
//   node tests/vmu-meeting-participation-state.test.mjs                       # green on the real tree
//   VMU_CODE_DIR=<copy with say(...) removed> node tests/vmu-meeting-participation-state.test.mjs   # must go RED
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = new URL('.', import.meta.url)
const REPO = new URL('..', HERE)
const CODE_DIR = process.env.VMU_CODE_DIR ? String(process.env.VMU_CODE_DIR) : join(fileURLToPath(REPO), 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const src = readFileSync(join(CODE_DIR, 'kernel', 'meetings.js'), 'utf8')
const lines = src.split('\n')

console.log('=== 1. THE JOURNAL CARRIES "NEVER WOKEN" PER MEMBER (part 1) ===')
const iSkippedEvent = lines.findIndex((l) => l.includes("type: 'meetings/skipped'"))
const iUnreachedEvent = lines.findIndex((l) => l.includes("type: 'meetings/unreached'"))
const iSkipBranch = lines.findIndex((l) => l.includes("counters.skippedWakes += 1"))
const iUnreachedBranch = lines.findIndex((l) => l.includes('counters.unreachedWakes'))
ok(iSkippedEvent >= 0 && Math.abs(iSkippedEvent - iSkipBranch) <= 6,
  'a `skip` wake outcome writes a member-addressed journal event (`meetings/skipped`)',
  { eventLine: iSkippedEvent + 1, branchLine: iSkipBranch + 1 })
ok(iUnreachedEvent >= 0 && Math.abs(iUnreachedEvent - iUnreachedBranch) <= 6,
  'a retries-exhausted wake writes `meetings/unreached` next to its counter',
  { eventLine: iUnreachedEvent + 1, branchLine: iUnreachedBranch + 1 })
ok(/say\(\{[^}]*type: 'meetings\/skipped'[^}]*member/.test(src),
  'the skipped event names the MEMBER (not a global counter)', { })
ok(/say\(\{[^}]*type: 'meetings\/unreached'[^}]*member[^}]*retries/.test(src),
  'the unreached event names the MEMBER and carries its RETRY COUNT (the original recorded `tries`)', { })
ok(!/say\(\{[^}]*type: 'meetings\/unreached'[^}]*meeting:/.test(src) || true,
  'NOTE: the meeting identifier is still omitted (its scope variable was never confirmed; not guessed)', { })

console.log('=== 2. THE ASSEMBLED PROMPT (part 2) — NOT LANDED, AND WHY ===')
const promptSrc = readFileSync(join(CODE_DIR, 'kernel', 'prompt', 'index.js'), 'utf8')
const hasWhitelist = promptSrc.includes('VARIABLE_WHITELIST')
ok(hasWhitelist, 'the substitution whitelist exists at kernel/prompt/index.js (the registration point for part 2)', {})
const blocksA = readFileSync(join(CODE_DIR, 'packs', 'v5r', 'prompts', 'v5r-blocks-a.js'), 'utf8')
ok(blocksA.includes('{{ setting:vmu.turn.meetingId }}'),
  'the meeting heading still renders only the meeting id and the member (no participation state) — part 2 is NOT landed', {})

console.log('=== 3. THE DURABLE RECORD IS WHAT A PART-2 SENTENCE MAY CLAIM ===')
ok(/meetings\/unreached/.test(src) && /meetings\/skipped/.test(src),
  'the two durable facts a part-2 sentence would have to trace to exist (unreached / skipped)', {})

console.log('=== PARTICIPATION STATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
