// tests/check-task-brief-names.test.mjs — TB-2721 / task-204: a brief may not teach a name that does not exist.
//
// WHY THIS SUITE EXISTS. The task brief is the only instruction a live run's seats actually read, and the
// checker used to police its SHAPE (ten sections, self-test table, length) while saying nothing about its
// VOCABULARY. RUN 76 measured the gap: a seat followed the brief and wrote `set_solved` — a field the product
// has never had — and every receipt from that turn was refused as an unknown field. The prompt layer had
// already been narrowed to `vote_solved` as the single entrance; the brief layer had no gate at all, so
// "prompt right, brief wrong" was invisible.
//
// WHAT IS ASSERTED HERE, AND WHY IT IS NOT A NAME LIST. The known-name universe is DERIVED at run time:
// tools/parameters come from `buildCatalog()` (the same declarations the call checker uses), action values
// are the declared enums PLUS the literals the dispatch itself compares against (`op === 'step'`, `case
// 'drive':`), and field names are the object-literal keys in the product source. Nothing is transcribed.
// The suite therefore fails if the derivation silently stops working — e.g. if `step` (a real op value with
// no enum) drops out, or if `set_solved` ever appears as a real key.
//
// THE THREE HEADLINE CASES (raw CLI output is printed, per the taskbook):
//   1. the current live brief  D:/_tmp/slv-phase5/task-sim77.txt  exits 0 — its line 31 says
//      "`set_solved` 不是合法字段", a sentence ABOUT a retired name, and the same-line negation must let it pass;
//   2. changing that line into a teaching sentence ("投 `set_solved`") exits 1 and names `set_solved at line 31`;
//   3. a brief that teaches `vibe_v5_does_not_exist` exits 1 and names it.
//
// Run: node tests/check-task-brief-names.test.mjs      Last line: === CHECK TASK BRIEF NAMES: N passed, M failed ===
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NAME_CODES, buildCatalog, buildKnownNames, checkBriefNames, extractBacktickedNames,
} from '../scripts/check-task-brief.mjs'
import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'check-task-brief.mjs')
// The run brief lives OUTSIDE the repo (it is a run artifact, not a fixture). It is opt-in:
// set TASK_BRIEF_77=<path> to point at any brief; when it is set but missing this suite FAILS
// (a measurement that did not happen must not pass). When it is unset, sections 4-5 print a
// NOTE and add no assertion -- the rule itself is covered by the synthetic cases in 1-3 and 6-7.
const LIVE_BRIEF = process.env.TASK_BRIEF_77 || __tmpRoot() + '/slv-phase5/task-sim77.txt'  // PORTABLE-ALLOW: opt-in run artifact outside the repo; override with TASK_BRIEF_77=<path>, and when the env var is set but the file is missing this suite FAILS instead of skipping
const TMP_ROOT = process.env.BRIEF_NAMES_TMP_ROOT || (existsSync(__tmpRoot()) ? __tmpRoot() : tmpdir())
mkdirSync(TMP_ROOT, { recursive: true })
const WORK = mkdtempSync(join(TMP_ROOT, 'briefnames-'))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; return true }
  failed++
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
  return false
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' })
let seq = 0
const write = (name, text) => {
  const path = join(WORK, String(++seq) + '-' + name)
  writeFileSync(path, text, 'utf8')
  return path
}
const tail = (s, n = 700) => String(s).trim().split('\n').slice(-n).join('\n')

const catalog = await buildCatalog({ repo: REPO })
const known = buildKnownNames(catalog)

console.log('=== 1. THE KNOWN-NAME UNIVERSE IS DERIVED, NOT COPIED ===')
{
  ok(known.tools.size >= 100, 'tools come from the declarations (>=100)', { tools: known.tools.size })
  ok(known.params.size >= 200, 'parameters come from the declarations', { params: known.params.size })
  ok(known.fields.size >= 5000, 'field names come from the product source', { fields: known.fields.size })
  ok(known.sourceFiles >= 200, 'the source scan really walked the product', { sourceFiles: known.sourceFiles })
  // The live-brief proof depends on this specific derivation: `step` is a REAL op value carried by a
  // free-string parameter (no enum), so it can only be known if the dispatch literals were scanned.
  ok(known.actions.has('step'), 'a real op value with no enum is known (dispatch literal)', { sample: [...known.actions].filter((a) => a === 'step') })
  ok(known.actions.has('reopen-closure'), 'another dispatch-only op value is known', {})
  // …and the retired name the RUN 76 seat wrote is NOT in any set, which is the whole point.
  ok(!known.fields.has('set_solved'), 'set_solved is not a field of the product', {})
  ok(!known.params.has('set_solved'), 'set_solved is not a parameter', {})
  ok(!known.actions.has('set_solved'), 'set_solved is not an action value', {})
}

console.log('=== 2. THE EXTRACTOR IS NARROW: only backticks, only the three shapes ===')
{
  const prose = '成员照着散文写 set_solved 就会被拒；这不是名字表。'
  ok(extractBacktickedNames(prose).length === 0, 'narration outside backticks is never scanned', { found: extractBacktickedNames(prose) })
  const mixed = '调用 `vibe_v5_start`，动作 `vibe_vmu_turn { op:"step" }`，字段 `set_solved`，不是 `null`。'
  const found = extractBacktickedNames(mixed)
  ok(found.some((f) => f.kind === 'tool' && f.name === 'vibe_v5_start'), 'a tool name is recognised', { found })
  ok(found.some((f) => f.kind === 'action' && f.name === 'step'), 'an action value inside a backticked call is recognised', { found })
  ok(found.some((f) => f.kind === 'field' && f.name === 'set_solved'), 'a field-shaped name is recognised', { found })
  ok(!found.some((f) => f.kind === 'field' && f.name === 'null'), 'JSON literals are not names', { found })
}

console.log('=== 3. THE RULE: unknown names are refused unless the SAME line says so ===')
{
  const negated = '结题票写 `set_solved` 不是合法字段。\n'
  const p1 = checkBriefNames('<negated>', negated, known)
  ok(p1.length === 0, 'the same-line negation lets the sentence through', { problems: p1 })
  const taught = '结题票由全员投 `set_solved`。\n'
  const p2 = checkBriefNames('<taught>', taught, known)
  ok(p2.length === 1 && p2[0].code === NAME_CODES.unknownName, 'teaching the same name is a problem', { problems: p2 })
  ok(p2[0].message === 'set_solved at line 1 — a brief may not teach a name that does not exist (unless it says so in the same line)',
    'the message names the name, the line and the rule', { message: p2[0] && p2[0].message })
  const fakeTool = '调用 `vibe_v5_does_not_exist` 看看。\n'
  const p3 = checkBriefNames('<tool>', fakeTool, known)
  ok(p3.length === 1 && p3[0].code === NAME_CODES.unknownName && p3[0].tool === 'vibe_v5_does_not_exist',
    'an unknown tool is refused and named in the tool slot', { problems: p3 })
}

console.log('=== 4. THE LIVE BRIEF STILL PASSES (line 31 is a sentence ABOUT the retired name) ===')
if (process.env.TASK_BRIEF_77 || existsSync(LIVE_BRIEF)) {
  if (!existsSync(LIVE_BRIEF)) {
    ok(false, 'TASK_BRIEF_77 was set but the file does not exist (a measurement that did not happen must not pass)', { LIVE_BRIEF })
  }
  const live = run(LIVE_BRIEF)
  console.log(tail(live.stdout))
  ok(live.status === 0, 'the current 77 brief exits 0', { status: live.status })
  ok(String(live.stdout).includes('OK — 1 file(s), 0 problem(s)'), 'the CLI verdict is OK / 0 problems', { stdout: tail(live.stdout, 12) })
  ok(String(live.stdout).includes('naming gate knows'), 'the derived universe is reported', { stdout: tail(live.stdout, 12) })
} else {
  console.log('  NOTE (not a pass): ' + LIVE_BRIEF + ' is not present — set TASK_BRIEF_77=<path> to measure a real brief; the rule is covered by sections 1-3 and 6-7')
}

console.log('=== 5. THE SAME LIVE BRIEF, TAUGHT INSTEAD OF MENTIONED, EXITS 1 AND NAMES set_solved ===')
if (process.env.TASK_BRIEF_77 || existsSync(LIVE_BRIEF)) {
  if (!existsSync(LIVE_BRIEF)) {
    ok(false, 'TASK_BRIEF_77 was set but the file does not exist (cannot mutate a brief that is not there)', { LIVE_BRIEF })
  }
  // A missing file is already reported as a FAIL above; here we only run the mutation when it is really there
  // (an unreadable brief must not be silently turned into an empty string -- that is the degraded-read shape).
  const lines = []
  if (existsSync(LIVE_BRIEF)) lines.push(...readFileSync(LIVE_BRIEF, 'utf8').split('\n'))
  const at = lines.findIndex((line) => line.includes('`set_solved`'))
  ok(at >= 0, 'the live brief really mentions set_solved (otherwise case 4 proves nothing)', { at })
  if (at >= 0) {
    const taught = lines.slice()
    taught[at] = '- 结题票由全员 `vibe_vmu_vote` 投 `set_solved`（**唯一入口**）。'
    const path = write('brief-teaches-setsolved.txt', taught.join('\n'))
    const res = run(path)
    console.log(tail(res.stdout))
    ok(res.status === 1, 'a brief that TEACHES set_solved exits 1', { status: res.status })
    ok(String(res.stdout).includes(NAME_CODES.unknownName), 'the CLI prints UNKNOWN_NAME', { stdout: tail(res.stdout, 12) })
    ok(String(res.stdout).includes('set_solved at line ' + (at + 1)), 'the CLI names set_solved at its real line', { line: at + 1, stdout: tail(res.stdout, 12) })
  }
} else {
  console.log('  NOTE (not a pass): no live brief to mutate — set TASK_BRIEF_77=<path> to run this section')
}

console.log('=== 6. AN INVENTED TOOL NAME EXITS 1 AND IS NAMED ===')
{
  const text = '### 2.1 主席（r-acad）\n\n- 另外调用 `vibe_v5_does_not_exist` 看看。\n'
  const path = write('brief-invented-tool.txt', text)
  const res = run(path)
  console.log(tail(res.stdout))
  ok(res.status === 1, 'a brief teaching an invented tool exits 1', { status: res.status })
  ok(String(res.stdout).includes('vibe_v5_does_not_exist'), 'the CLI names the invented tool', { stdout: tail(res.stdout, 12) })
}

rmSync(WORK, { recursive: true, force: true })

console.log('')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  FAIL ' + f)
}
console.log('=== CHECK TASK BRIEF NAMES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed > 0 ? 1 : 0
