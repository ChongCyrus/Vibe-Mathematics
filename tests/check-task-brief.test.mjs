// tests/check-task-brief.test.mjs — TB-2612 / task-91: the STRUCTURE half of the run-brief checker.
//
// WHY THIS SUITE EXISTS. `tests/brief-check.test.mjs` proves the checker derives every tool/parameter name
// from the declarations (a brief is an executed interface). This suite proves the OTHER direction: a brief is
// also an ORGANISATION interface — four seats must each be told their own work in their own section, the
// placeholder-problem sentence must be quoted verbatim (so a live run does not mistake it for a real task),
// the four-column self-test table must exist, the prompt-critique section must exist, and NO sentence may hand
// a seat's own writing to the office (the TB-2611 defect, said again in a brief).
//
// ★ The subject of every check is derived from the checker's exported constants (STRUCTURE_CODES / PLACEHOLDER /
// SEATS / RULE_TABLE / TEMPLATE_MAX_LINES), never retyped — so a rename in the checker cannot silently pass.
// ★ Each "must FAIL" case deletes exactly ONE required part and requires (a) a non-zero problem list, (b) the
// expected code, and (c) for a seat, that the message NAMES the missing seat. A checker that only counted
// problems would pass (a) while telling nobody what to fix.
//
// Run: node tests/check-task-brief.test.mjs        Last line: === CHECK TASK BRIEF: N passed, M failed ===
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLACEHOLDER, RULE_TABLE, SEAT_MAX_LINES, SEATS, STRUCTURE_CODES, TEMPLATE_MAX_LINES,
  checkBriefStructure, structureFixture,
} from '../scripts/check-task-brief.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'check-task-brief.mjs')
const TMP_ROOT = process.env.BRIEF_STRUCT_TMP_ROOT || (existsSync('D:/_tmp') ? 'D:/_tmp' : tmpdir())
mkdirSync(TMP_ROOT, { recursive: true })
const WORK = mkdtempSync(join(TMP_ROOT, 'briefstruct-'))

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
const codes = (path, text, opts) => checkBriefStructure(path, text, opts).map((p) => p.code)
const fixture = () => structureFixture()
const withoutLine = (text, needle) => text.split('\n').filter((line) => !line.includes(needle)).join('\n')

console.log('=== 1. THE CONTROL: a complete brief is silent, and the fixture really is complete ===')
{
  const text = fixture()
  ok(checkBriefStructure('<fixture>', text, { force: 'on' }).length === 0, 'a complete brief reports NO structure problem',
    { problems: checkBriefStructure('<fixture>', text, { force: 'on' }) })
  for (const seat of SEATS) ok(text.includes(seat.label.split('（')[0]), 'the fixture carries the ' + seat.label + ' section', { seat: seat.key })
  ok(text.includes(PLACEHOLDER), 'the fixture quotes the placeholder sentence verbatim')
  ok(RULE_TABLE.test(text), 'the fixture carries the four-column table header')
  ok(/^#{1,6}[^\n]*提示词/m.test(text), 'the fixture carries a prompt-critique heading')
}

console.log('=== 2. AUTO MODE IS SELF-SELECTING: a bare call snippet is not judged as a brief ===')
{
  ok(codes('<snippet>', 'vibe_v5_start {}\nvibe_v5_hire {}\n').length === 0,
    'a file with no `## ` headings is not treated as a run brief (the declaration fixtures stay silent)')
  ok(codes('<snippet>', 'vibe_v5_start {}\n', { force: 'on' }).some((c) => c === STRUCTURE_CODES.seat),
    '--structure forces the checks on a heading-less file, so the auto rule cannot be used to hide a bad brief',
    { got: codes('<snippet>', 'vibe_v5_start {}\n', { force: 'on' }) })
  ok(codes('<brief>', fixture(), { force: 'off' }).length === 0,
    '--no-structure turns the structure checks off explicitly (a call-only pass is still available)')
}

console.log('=== 3. EACH OF THE FOUR SEATS IS REQUIRED, AND THE PROBLEM NAMES THE MISSING ONE ===')
{
  ok(SEATS.length === 4, 'the checker declares exactly four seats (so the loop below is not vacuous)', { count: SEATS.length })
  for (const key of ['office', 'chair', 'member', 'temp']) {
    const seat = SEATS.find((s) => s.key === key)
    if (seat === undefined) { ok(false, 'the checker declares the seat ' + key); continue }
    const text = withoutLine(fixture(), seat.label.split('（')[0] + '（')
    const problems = checkBriefStructure('<fixture>', text, { force: 'on' })
    const own = problems.filter((p) => p.code === STRUCTURE_CODES.seat)
    ok(own.length >= 1, 'deleting the ' + seat.label + ' section is caught', { problems })
    ok(own.some((p) => p.message.includes(seat.label)), 'the problem NAMES the missing seat ' + seat.label,
      { messages: own.map((p) => p.message) })
  }
}

console.log('=== 4. THE PLACEHOLDER SENTENCE IS EXACT: reworded ⇒ caught ===')
{
  const text = fixture().split(PLACEHOLDER).join('这是模拟用的数学题，随便做做')
  const got = codes('<fixture>', text, { force: 'on' })
  ok(got.includes(STRUCTURE_CODES.placeholder), 'a reworded placeholder declaration is caught', { got })
  ok(!codes('<fixture>', fixture(), { force: 'on' }).includes(STRUCTURE_CODES.placeholder),
    'the verbatim sentence is NOT flagged (the check is exact, not "any mention of 数学题")')
}

console.log('=== 5. THE FOUR-COLUMN TABLE AND THE PROMPT-CRITIQUE SECTION ARE REQUIRED ===')
{
  const noTable = fixture().split('| 规则条号 | 期望 | 实测 | 判定 | 建议 |').join('| 结果表 |')
  ok(codes('<fixture>', noTable, { force: 'on' }).includes(STRUCTURE_CODES.ruleTable),
    'removing the 「规则条号 | 期望 | 实测 | 判定 | 建议」 header is caught')
  ok(!RULE_TABLE.test(noTable), 'the control text really no longer carries the header')
  const noCritique = fixture().split('## 5 提示词批评专章').join('## 5 意见')
  ok(codes('<fixture>', noCritique, { force: 'on' }).includes(STRUCTURE_CODES.critique),
    'removing the prompt-critique section is caught')
}

console.log('=== 6. NO BRIEF MAY HAND A SEAT OWN ITS OWN WRITING TO THE OFFICE ===')
{
  for (const phrase of ['所办替成员', '所办代写', 'office 代写']) {
    const got = codes('<fixture>', fixture() + '\n- ' + phrase + '填好这张表。\n', { force: 'on' })
    ok(got.includes(STRUCTURE_CODES.forbidden), 'the forbidden wording 「' + phrase + '」 is caught', { got })
  }
  const problems = checkBriefStructure('<fixture>', fixture() + '\n- 所办替成员填表\n', { force: 'on' })
  const forbidden = problems.filter((p) => p.code === STRUCTURE_CODES.forbidden)
  ok(forbidden.length === 1 && forbidden[0].line > 1 && forbidden[0].message.includes('所办替成员'),
    'the forbidden-wording problem carries the LINE and the phrase', { forbidden })
  ok(codes('<fixture>', fixture() + '\n- 所办把成员的表格转达出去（只转达）。\n', { force: 'on' }).length === 0,
    'wording that says the office RELAYS is silent — the check bites on 代写, not on every mention of 所办')
}

console.log('=== 7. THE TEMPLATE CAPS: 180 lines total, 15 body lines per seat section ===')
{
  const long = fixture() + '\n' + Array.from({ length: TEMPLATE_MAX_LINES + 10 }, (_, i) => '- filler ' + i).join('\n')
  ok(codes('<tpl>/RUN-BRIEF-TEMPLATE.md', long, { template: true }).includes(STRUCTURE_CODES.tooLong),
    'a template over ' + TEMPLATE_MAX_LINES + ' lines is caught')
  ok(!codes('<tpl>/RUN-BRIEF-TEMPLATE.md', fixture(), { template: true }).includes(STRUCTURE_CODES.tooLong),
    'a template under the cap is not flagged')
  const memberHeading = SEATS.find((s) => s.key === 'member').label.split('（')[0]
  const fat = fixture().split('### 2.2 ' + memberHeading + '（member）\n- 你写自己的卡')
    .join('### 2.2 ' + memberHeading + '（member）\n' +
      Array.from({ length: SEAT_MAX_LINES + 5 }, (_, i) => '- seat filler ' + i).join('\n'))
  const got = checkBriefStructure('<tpl>/RUN-BRIEF-TEMPLATE.md', fat, { template: true })
  ok(got.some((p) => p.code === STRUCTURE_CODES.seatTooLong), 'a seat section over ' + SEAT_MAX_LINES + ' body lines is caught', { got: got.map((p) => p.code) })
  ok(got.some((p) => p.code === STRUCTURE_CODES.seatTooLong && p.message.includes(memberHeading)),
    'the over-length problem NAMES the seat', { messages: got.map((p) => p.message) })
  ok(!checkBriefStructure('<tpl>/run-brief.md', fat, {}).some((p) => p.code === STRUCTURE_CODES.seatTooLong),
    'the 15-line cap applies to the TEMPLATE only (a generated brief may expand, its template may not)')
  ok(checkBriefStructure('<tpl>/RUN-BRIEF-TEMPLATE.md', fat, {}).some((p) => p.code === STRUCTURE_CODES.seatTooLong),
    'a file NAMED RUN-BRIEF-TEMPLATE.md is treated as the template even without --template (the cap cannot be dodged by renaming the flag)')
}

console.log('=== 8. THE REAL TEMPLATE (when the workspace has one) PASSES THE CHECKER ===')
{
  // The caps, the seat sections and the verbatim sentence are already proven by the fixture cases in §1–§7; this
  // block only cross-checks the REAL template when the workspace has one (it lives outside the repo, so a bare
  // checkout has no such file and the skip note below is the honest outcome).
  const tpl = resolve(REPO, '..', 'taskbooks', 'RUN-BRIEF-TEMPLATE.md')
  if (existsSync(tpl)) { // non-vacuous: guarded by the fixture coverage above, not by this file being present
    const text = readFileSync(tpl, 'utf8')
    const problems = checkBriefStructure(tpl, text, { template: true })
    ok(problems.length === 0, 'taskbooks/RUN-BRIEF-TEMPLATE.md has no structure problem', { problems })
    const lines = text.replace(/\r\n/g, '\n').split('\n').length - 1
    ok(lines <= TEMPLATE_MAX_LINES, 'the real template stays within ' + TEMPLATE_MAX_LINES + ' lines', { lines })
    const cli = run(tpl)
    ok(cli.status === 0, 'the checker exits 0 on the real template (tool names and parameters included)', {
      status: cli.status, stdout: String(cli.stdout).slice(0, 800),
    })
  } else {
    console.log('  (skip: ' + tpl + ' is not in this checkout — the fixture cases above cover the checks)')
  }
}

console.log('=== 9. THE CLI BITES AND NAMES, ON A FILE IT READS FROM DISK ===')
{
  const goodPath = write('RUN-BRIEF-TEMPLATE.md', fixture())
  const goodRun = run(goodPath)
  ok(goodRun.status === 0, 'a complete brief file exits 0', { status: goodRun.status, stdout: String(goodRun.stdout).slice(0, 500) })
  const missingSeatPath = write('brief-temp-missing.md', withoutLine(fixture(), '2.3 临时工'))
  const badRun = run(missingSeatPath)
  ok(badRun.status === 1, 'a brief missing one seat exits 1', { status: badRun.status })
  ok(String(badRun.stdout).includes(STRUCTURE_CODES.seat), 'the CLI prints the seat problem code', { stdout: String(badRun.stdout).slice(0, 800) })
  ok(String(badRun.stdout).includes('临时工'), 'the CLI names the missing seat in words', { stdout: String(badRun.stdout).slice(0, 800) })
  const jsonRun = run(missingSeatPath, '--json')
  ok(jsonRun.status === 1, '--json still exits 1 on a structure defect', { status: jsonRun.status })
  let parsed = null
  try { parsed = JSON.parse(String(jsonRun.stdout)) } catch (e) { parsed = null }
  ok(parsed !== null && parsed.ok === false && Array.isArray(parsed.problems) &&
    parsed.problems.some((p) => p.code === STRUCTURE_CODES.seat),
    'the JSON report carries the structure problem (ok:false)', { parsed: parsed && parsed.problems })
}

console.log('=== 10. THE SELF-PROBE PROVES THE STRUCTURE CHECKS ARE NOT VACUOUS ===')
{
  const probe = run('--self-probe')
  ok(probe.status === 0, '--self-probe exits 0', { status: probe.status })
  const out = String(probe.stdout)
  ok(out.includes('SELF-PROBE OK'), 'the self-probe prints its verdict', { stdout: out.slice(0, 400) })
  for (const code of [STRUCTURE_CODES.placeholder, STRUCTURE_CODES.seat, STRUCTURE_CODES.ruleTable,
    STRUCTURE_CODES.critique, STRUCTURE_CODES.forbidden, STRUCTURE_CODES.tooLong, STRUCTURE_CODES.seatTooLong]) {
    ok(out.includes(code), 'the self-probe reports the planted ' + code, { code })
  }
}

rmSync(WORK, { recursive: true, force: true })

console.log('')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  FAIL ' + f)
}
console.log('=== CHECK TASK BRIEF: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed > 0 ? 1 : 0
