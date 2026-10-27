// tests/brief-check.test.mjs — the gate for `scripts/check-task-brief.mjs`.
//
// WHY THIS SUITE EXISTS. Round 29's run brief hand-copied three names (`vibe_v5_job`, `settlement`, a wrong
// `vibe_v5_tool_help` parameter) and the agent executed them literally, then reported the failure as a product
// defect. The fix is a checker that DERIVES every legal name from the declarations, so a brief can be validated
// before it is handed to anyone. This suite proves the checker (a) really derives the catalogue from the code,
// (b) bites on each of the three problem codes, (c) stays silent on a legal call — including a genuinely nested
// parameter value — and (d) can prove its own sensitivity via `--self-probe`.
//
// ★ NOTHING HERE HARD-CODES A TOOL NAME OR A PARAMETER NAME. Every subject is picked out of the catalogue the
// checker derives (`buildCatalog()`), so a rename in `host.js` / the v5r pack cannot turn this suite red — and a
// rename that the checker misses cannot turn it green (the derivation assertions come first).
//
// Run: node tests/brief-check.test.mjs        Last line: === BRIEF CHECK: N passed, M failed ===
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog, checkBriefText, CODES } from '../scripts/check-task-brief.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'check-task-brief.mjs')
const TMP_ROOT = process.env.BRIEF_CHECK_TMP_ROOT || (existsSync('D:/_tmp') ? 'D:/_tmp' : tmpdir())
mkdirSync(TMP_ROOT, { recursive: true })
const WORK = mkdtempSync(join(TMP_ROOT, 'briefcheck-'))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; return true }
  failed++
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
  return false
}

/** Run the CLI as a USER would (black box): no imports, real argv, real exit code. */
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' })

/** Write a brief into the scratch dir and return its absolute path. */
let seq = 0
const brief = (name, text) => {
  const path = join(WORK, String(++seq) + '-' + name + '.txt')
  writeFileSync(path, text, 'utf8')
  return path
}

const requiredOf = (tool) => Object.entries(tool.parameters).filter(([, decl]) => decl && decl.required === true).map(([key]) => key)
const optionalOf = (tool) => Object.entries(tool.parameters).filter(([, decl]) => !decl || decl.required !== true).map(([key]) => key)

function dummyValue(decl) {
  const type = decl && decl.type
  if (type === 'number' || type === 'integer') return '1'
  if (type === 'boolean') return 'true'
  if (type === 'array') return '[]'
  if (type === 'object') return '{}'
  return '"x"'
}

/** Render a call whose parameter names are ALL legal for `tool`. */
function renderCall(tool, keys) {
  const parts = []
  for (const key of keys) parts.push(key + ': ' + dummyValue(tool.parameters[key]))
  return tool.name + ' { ' + parts.join(', ') + ' }'
}

console.log('=== 1. THE CATALOGUE IS DERIVED FROM THE DECLARATIONS (not copied) ===')
const catalog = await buildCatalog()
ok(catalog.tools.size > 50, 'the derivation produced a real catalogue (host faces + pack tools)', { size: catalog.tools.size })
ok(catalog.host > 0, 'host.js#toolSpecs() returned specs', { host: catalog.host })
ok(catalog.pack > 0, 'V5R_PACK_TOOLS contributed pack tools', { pack: catalog.pack })
const shapeViolations = []
for (const name of catalog.tools.keys()) {
  if (!/^vibe_[a-z0-9_]+$/.test(name)) shapeViolations.push(name)
}
ok(shapeViolations.length === 0, 'every derived tool name matches /^vibe_[a-z0-9_]+$/', { shapeViolations })
const paramShapeViolations = []
for (const tool of catalog.tools.values()) {
  if (!tool.parameters || typeof tool.parameters !== 'object') paramShapeViolations.push(tool.name)
}
ok(paramShapeViolations.length === 0, 'every derived tool carries a parameters object (the thing this gate reads)', { paramShapeViolations })
ok(catalog.tools.size === catalog.host + catalog.pack, 'host and pack sets are disjoint (no silent duplicate shadowing a declaration)', { size: catalog.tools.size, host: catalog.host, pack: catalog.pack })

// The three subjects the rest of the suite needs, chosen from the catalogue rather than typed.
let mixed = null
let clean = null
for (const tool of catalog.tools.values()) {
  if (mixed === null && requiredOf(tool).length > 0 && optionalOf(tool).length > 0) mixed = tool
  if (clean === null && requiredOf(tool).length === 0) clean = tool
}
ok(mixed !== null, 'the catalogue has a tool with BOTH a required and an optional parameter', { mixed: mixed && mixed.name })
ok(clean !== null, 'the catalogue has a tool with no required parameter', { clean: clean && clean.name })

console.log('=== 2. A CORRECT BRIEF PASSES, AND THE EMPTY-OBJECT RULE IS THE TASK\'S ONE ===')
if (mixed && clean) {
  const validText = renderCall(clean, optionalOf(clean).slice(0, 1)) + '\n' + renderCall(mixed, requiredOf(mixed).concat(optionalOf(mixed).slice(0, 1))) + '\n'
  const validPath = brief('valid', validText)
  const validRun = run(validPath)
  ok(validRun.status === 0, 'a brief built from the DECLARED names exits 0', { status: validRun.status, stderr: validRun.stderr, stdout: validRun.stdout })
  ok(String(validRun.stdout).includes('check-task-brief: OK'), 'the human report says OK', { stdout: validRun.stdout })
  const emptyRun = run(brief('name-only', mixed.name + ' {}\n'))
  ok(emptyRun.status === 0, 'item 3: `{}` checks the TOOL NAME only, so a required parameter is NOT reported missing', { status: emptyRun.status, stdout: emptyRun.stdout })
  const api = checkBriefText('<api>', validText, catalog)
  ok(api.calls === 2, 'the parser sees both calls of a two-line brief', { calls: api.calls })
  const nestedText = mixed.name + ' { ' + requiredOf(mixed).map((k) => k + ': ' + dummyValue(mixed.parameters[k])).join(', ') + ', ' + optionalOf(mixed)[0] + ': { zzz_nested_probe: 1 } }\n'
  const nestedRun = run(brief('nested', nestedText), '--json')
  let nestedJson = null
  try { nestedJson = JSON.parse(String(nestedRun.stdout)) } catch { nestedJson = null }
  ok(nestedJson !== null && nestedJson.problems.length === 0, 'a nested VALUE inside a legal parameter raises no BRIEF_UNKNOWN_PARAM (depth-1 only)', nestedJson && nestedJson.problems)
}

console.log('=== 3. BRIEF_UNKNOWN_TOOL: the round-29 defect, with a hint that names a LEGAL tool ===')
const absent = 'vibe_zzz_brief_check_absent'
ok(!catalog.tools.has(absent), 'the planted name is genuinely absent from the derived catalogue (control)', { absent })
const unknownToolPath = brief('unknown-tool', 'send it: ' + absent + ' { member: "res-01" }\n')
const unknownToolRun = run(unknownToolPath, '--json')
let unknownToolJson = null
try { unknownToolJson = JSON.parse(String(unknownToolRun.stdout)) } catch { unknownToolJson = null }
ok(unknownToolRun.status === 1, 'an unknown tool name exits 1', { status: unknownToolRun.status })
ok(unknownToolJson !== null, '--json emitted parseable JSON', { stdout: String(unknownToolRun.stdout).slice(0, 400) })
if (unknownToolJson && unknownToolJson.problems.length > 0) {
  const hit = unknownToolJson.problems[0]
  ok(hit.code === CODES.unknownTool, 'the problem code is BRIEF_UNKNOWN_TOOL', { code: hit.code })
  ok(hit.tool === absent, 'the problem names the offending tool', { tool: hit.tool })
  const legalNamed = []
  for (const name of catalog.tools.keys()) {
    if (String(hit.hint).includes(name)) legalNamed.push(name)
  }
  ok(legalNamed.length > 0, 'the hint names the NEAREST LEGAL TOOL (the task requires a usable hint)', { hint: hit.hint })
}
const humanUnknown = run(brief('unknown-tool-human', absent + ' { member: "x" }\n'))
ok(String(humanUnknown.stdout).includes('line 1:') && String(humanUnknown.stdout).includes(absent), 'the human report prints the OFFENDING LINE and the offending name', { stdout: String(humanUnknown.stdout).slice(0, 400) })

console.log('=== 4. BRIEF_UNKNOWN_PARAM: a real tool, an undeclared parameter ===')
if (mixed) {
  const bogus = 'zzz_brief_check_param'
  const body = requiredOf(mixed).map((k) => k + ': ' + dummyValue(mixed.parameters[k])).concat([bogus + ': true']).join(', ')
  const paramPath = brief('unknown-param', mixed.name + ' { ' + body + ' }\n')
  const paramRun = run(paramPath, '--json')
  let paramJson = null
  try { paramJson = JSON.parse(String(paramRun.stdout)) } catch { paramJson = null }
  ok(paramRun.status === 1, 'an undeclared parameter exits 1', { status: paramRun.status })
  const paramHit = paramJson ? paramJson.problems.find((p) => p.code === CODES.unknownParam) : null
  ok(paramHit !== undefined && paramHit !== null, 'the problem code is BRIEF_UNKNOWN_PARAM', { problems: paramJson && paramJson.problems })
  if (paramHit) {
    ok(paramHit.param === bogus, 'the problem names the offending parameter', { param: paramHit.param })
    const legalNamed = []
    for (const key of Object.keys(mixed.parameters)) {
      if (String(paramHit.hint).includes(key) || String(paramHit.message).includes(key)) legalNamed.push(key)
    }
    ok(legalNamed.length > 0, 'the hint names a nearest LEGAL parameter', { hint: paramHit.hint })
  }
  const humanParam = run(brief('unknown-param-human', mixed.name + ' { ' + body + ' }\n'))
  ok(String(humanParam.stdout).includes('legal parameters of `' + mixed.name + '`'), 'the human report prints the LEGAL PARAMETER SET of the offending tool (task item)', { stdout: String(humanParam.stdout).slice(0, 500) })
}

console.log('=== 5. BRIEF_MISSING_REQUIRED: a required parameter the non-empty call does not give ===')
if (mixed) {
  const required = requiredOf(mixed)
  const call = renderCall(mixed, optionalOf(mixed).slice(0, 1))
  const missPath = brief('missing-required', call + '\n')
  const missRun = run(missPath, '--json')
  let missJson = null
  try { missJson = JSON.parse(String(missRun.stdout)) } catch { missJson = null }
  ok(missRun.status === 1, 'a call missing a required parameter exits 1', { status: missRun.status })
  const missingCodes = []
  const reportedProblems = missJson ? missJson.problems : []
  for (const problem of reportedProblems) {
    if (problem.code === CODES.missingRequired) missingCodes.push(problem.param)
  }
  // ★ Compare the two NAME SETS as sorted strings rather than lengths: a missing report and a phantom report
  // can cancel out under a length comparison, and two empty sets must not compare equal.
  const missingSorted = missingCodes.slice().sort().join(',')
  const requiredSorted = required.slice().sort().join(',')
  ok(missingSorted === requiredSorted && requiredSorted.length > 0, 'exactly the absent required parameters are named, one BRIEF_MISSING_REQUIRED each', { missingCodes, required })
}

console.log('=== 6. --json SHAPE, LINE NUMBERS, AND MULTIPLE CALLS PER LINE ===')
if (clean) {
  const linePath = brief('lines', 'nothing here\n' + absent + ' {}\n' + renderCall(clean, optionalOf(clean).slice(0, 1)) + '\n')
  const lineRun = run(linePath, '--json')
  let lineJson = null
  try { lineJson = JSON.parse(String(lineRun.stdout)) } catch { lineJson = null }
  ok(lineJson !== null, 'the JSON report parses', { stdout: String(lineRun.stdout).slice(0, 400) })
  if (lineJson) {
    const missingKeys = []
    for (const key of ['ok', 'files', 'toolsChecked', 'problems']) if (!(key in lineJson)) missingKeys.push(key)
    ok(missingKeys.length === 0, 'the JSON carries the four keys the task fixes (ok/files/toolsChecked/problems)', { missingKeys })
    ok(lineJson.ok === false, 'ok is false when a problem was found', { ok: lineJson.ok })
    const problemKeys = ['code', 'hint', 'line', 'message', 'param', 'tool'].sort().join(',')
    const gotKeys = lineJson.problems.length > 0 ? Object.keys(lineJson.problems[0]).sort().join(',') : ''
    ok(gotKeys === problemKeys, 'each problem carries exactly line/tool/param/code/message/hint', { gotKeys })
    ok(lineJson.problems.length > 0 && lineJson.problems[0].line === 2, 'the reported line number is the offending line (not the file start)', lineJson.problems.map((p) => p.line))
    ok(lineJson.toolsChecked.includes(absent) && lineJson.toolsChecked.includes(clean.name), 'toolsChecked lists the tool names the brief mentions', lineJson.toolsChecked)
  }
  const twoUpText = renderCall(clean, optionalOf(clean).slice(0, 1)) + ' and ' + renderCall(clean, []) + '\n'
  const twoUp = checkBriefText('<two>', twoUpText, catalog)
  ok(twoUp.calls === 2 && twoUp.problems.length === 0, 'two calls on one line are both seen, and both are legal', { calls: twoUp.calls, problems: twoUp.problems.length })
}

console.log('=== 6b. THE BULLET FORM (ROUND 70 / F-67): a brief that names a call this way is checked too ===')
// Run 70's brief wrote step 5 as ``调用 `vibe_v5_turn`，参数：`` + bullet lines. That name does not exist (the face is
// `vibe_vmu_turn`) and the checker reported "0 problems", because parseCalls only ever looked for `name {`. A validator
// that silently skips the lines it is meant to check reports a green it did not earn - this section pins both branches.
if (mixed && clean) {
  const bulletKeys = requiredOf(mixed).concat(optionalOf(mixed).slice(0, 1))
  const bulletText = '1) 调用 `' + mixed.name + '`，参数：\n'
    + bulletKeys.map((k) => '   - ' + k + ': ' + dummyValue(mixed.parameters[k])).join('\n') + '\n'
  const bulletReport = checkBriefText('<bullets>', bulletText, catalog)
  ok(bulletReport.calls === 1, 'a bullet-form call is parsed as a call', { calls: bulletReport.calls })
  ok(bulletReport.problems.length === 0, 'and a legal bullet-form call raises nothing', bulletReport.problems)
  const mixedBullet = checkBriefText('<bullets-param>', '1) 调用 `' + mixed.name + '`，参数：\n   - zzz_brief_bullet_absent: 1\n', catalog)
  ok(mixedBullet.problems.some((p) => p.code === CODES.unknownParam && p.param === 'zzz_brief_bullet_absent'),
    'an undeclared bullet parameter is reported (the form is not a free pass)', mixedBullet.problems)
  const bulletAbsent = checkBriefText('<bullets-tool>', '1) 调用 `' + absent + '`，参数：\n   - member: "res-01"\n', catalog)
  ok(bulletAbsent.problems.some((p) => p.code === CODES.unknownTool && p.tool === absent),
    'an undeclared tool name in bullet form is reported too', bulletAbsent.problems)
  const nextCallText = '1) 调用 `' + mixed.name + '`，参数：\n'
    + bulletKeys.map((k) => '   - ' + k + ': ' + dummyValue(mixed.parameters[k])).join('\n')
    + '\n\n2) 然后调用 `' + absent + '`，参数：\n   - member: "res-01"\n'
  const twoCalls = checkBriefText('<two-bullet-calls>', nextCallText, catalog)
  ok(twoCalls.calls === 2, 'two bullet-form calls in one brief are both seen (the first does not swallow the second)', { calls: twoCalls.calls })
  ok(twoCalls.problems.some((p) => p.code === CODES.unknownTool), 'and the second call is judged on its own name', twoCalls.problems)
}

console.log('=== 7. --self-probe: the checker proves it BITES (the task item 5 path) ===')
const probeRun = run('--self-probe')
ok(probeRun.status === 0, '--self-probe exits 0 when every planted defect was caught', { status: probeRun.status, stdout: String(probeRun.stdout).slice(0, 600) })
const probeOut = String(probeRun.stdout)
ok(probeOut.includes('SELF-PROBE OK'), 'the self-probe prints its own verdict', { stdout: probeOut.slice(0, 600) })
const codedInProbe = []
for (const code of [CODES.unknownTool, CODES.unknownParam, CODES.missingRequired]) {
  if (probeOut.includes(code)) codedInProbe.push(code)
}
ok(codedInProbe.length === 3, 'all three planted defect codes were reported by the checker itself', { codedInProbe })

console.log('=== 8. USAGE FAILURES ARE NAMED, NOT SILENT ===')
const noArgs = run()
ok(noArgs.status === 1, 'no brief file exits 1', { status: noArgs.status })
ok(String(noArgs.stderr).includes('usage:'), 'the usage line is printed on stderr', { stderr: String(noArgs.stderr).slice(0, 300) })
const missingFile = run(join(WORK, 'does-not-exist.txt'))
ok(missingFile.status === 1, 'an unreadable brief exits 1', { status: missingFile.status })
ok(String(missingFile.stderr).includes('cannot read'), 'the failure names the unreadable path instead of crashing', { stderr: String(missingFile.stderr).slice(0, 300) })

rmSync(WORK, { recursive: true, force: true })

console.log('')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  FAIL ' + f)
}
console.log('=== BRIEF CHECK: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed > 0 ? 1 : 0
