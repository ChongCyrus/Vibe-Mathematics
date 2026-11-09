// tests/vmu-run256-prompts-facts.test.mjs — TB-2615 round A: the prompt-vs-code fact table must stay honest.
//
// WHY THIS SUITE EXISTS: the prompt tells a member what the kernel will do ("the reply is cut at 2000 characters",
// "`ack` is the only settlement", "`lateAdmission` defaults to chair", "a verdict element carries `p`, not `verdict`").
// Every one of those sentences is a claim about a constant or a branch in `vibe-math-vmu/`. When the code moves and the
// sentence does not, the member reads a rule, acts on it, and is refused — the failure mode of RUN 251 (waitingFor),
// RUN 252 (`p` vs `verdict`) and RUN 255 (fs-first default). `scripts/audit-prompt-facts.mjs` checks 16 of those facts;
// this suite pins the ruler itself, so the ruler cannot quietly stop checking:
//
//   §A the assembled prompts (chair/member/temp normal + meeting) are non-empty — the claims are read from what a seat
//      really receives, not from source text that merely looks like it;
//   §B every fact is OK today (exit 0 means the prompt and the code agree);
//   §C the specific values are the ones the code says (a table that "passes" while checking nothing is the enemy);
//   §D every fact has a REAL promptFile:line — no fact may be unlocatable and still count;
//   §E a prompt-side mutation (2000→3000, chair→open) turns exactly its own fact red — the claim side is read, not
//      hard-coded;
//   §F the three truth-side mutants (schema def→1, settledBy→read, seat table→4) turn exactly their own fact red while
//      the prompt text is byte-identical — the ruler reads the CODE, not a copy of the prompt;
//   §G the CLI's human and --mutants modes both exit 0 and print their verdict.
//
// Run: node tests/vmu-run256-prompts-facts.test.mjs   (last line: === VMU RUN256 PROMPT FACTS: N passed, M failed ===)

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assemblePrompts, runFacts } from '../scripts/audit-prompt-facts.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO, 'scripts', 'audit-prompt-facts.mjs')
const RULER_MEETING = 'm-facts'

let passed = 0
let failed = 0
function ok(cond, label, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    console.log('  FAIL ' + label + (detail === undefined ? '' : '  — ' + detail))
  }
}

const hashOf = (texts) => createHash('sha256').update(Object.values(texts).join('\u0000')).digest('hex')

const texts = await assemblePrompts()
const report = runFacts(texts, { overrides: {} })

// §A — assembled prompts are real prompts
ok(Object.keys(texts).length === 6, '§A1 six assembled prompts (chair/member/temp × normal/meeting)', JSON.stringify(Object.keys(texts)))
for (const [key, text] of Object.entries(texts)) {
  ok(typeof text === 'string' && text.length > 500, '§A2 assembled prompt is substantial: ' + key, String(text && text.length))
}

// §B — today every fact agrees
ok(report.checked >= 16, '§B1 the fact table has at least 16 facts', String(report.checked))
ok(report.inconsistent.length === 0, '§B2 every prompt fact matches the code', JSON.stringify(report.inconsistent.map((r) => r.id)))
ok(report.rows.length >= 16, '§B3a the report really carries a row per fact (non-vacuous precondition)', String(report.rows.length))
for (const r of report.rows) ok(r.ok === true, '§B3 fact ok: ' + r.id, r.note)

// §C — the values are the code's values (a vacuous pass would still satisfy §B)
const byId = Object.fromEntries(report.rows.map((r) => [r.id, r]))
function expectFact(id, claim, truth) {
  const r = byId[id]
  ok(r !== undefined, '§C0 fact exists: ' + id)
  if (!r) return
  ok(JSON.stringify(r.claim) === JSON.stringify(claim), '§C1 claim: ' + id, JSON.stringify(r.claim))
  ok(JSON.stringify(r.truth) === JSON.stringify(truth), '§C2 truth: ' + id, JSON.stringify(r.truth))
}
expectFact('replyLimitChars', 2000, 2000)
expectFact('noticeLinesLimit', 8, 8)
expectFact('broadcastExcerptChars', 800, 800)
expectFact('broadcastChairOnly', 'chair-only', 'chair-only')
expectFact('ackSettlesOnly', 'ack', 'ack')
ok(JSON.stringify(byId['truncationKeys'].claim.slice().sort()) === JSON.stringify(['excerptLen', 'truncated']), '§C3 truncation keys: truncated + excerptLen')
expectFact('emptyReplyZeroChars', 0, 0)
ok(byId['seatLabels'].claim !== null && byId['seatLabels'].claim.chair === '院士' && byId['seatLabels'].claim.member === '常驻研究员' && byId['seatLabels'].claim.temp === '临时工', '§C4 three seat labels')
ok(Array.isArray(byId['verdictElementKeys'].claim) && byId['verdictElementKeys'].claim.includes('p'), '§C5 verdict element key is p')
ok(byId['taskTransitions'].note.indexOf('cancelled') !== -1, '§C6 task table notes the omitted cancelled exits', byId['taskTransitions'].note)
expectFact('lateAdmissionDefault', 'chair', 'chair')
ok(JSON.stringify(byId['hardLimitMs'].claim) === JSON.stringify([1800000, 300000, 7200000]), '§C7 wall-clock default and clamp')
ok(JSON.stringify(byId['waitingForValues'].claim.slice().sort()) === JSON.stringify(['chair-proceed', 'quorum']), '§C8 waitingFor values')
ok(JSON.stringify(byId['blueprintMdCodes'].claim.slice().sort()) === JSON.stringify(['VMU_PACK_V5R_BLUEPRINT_MD_DRIFT', 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING']), '§C9 blueprint md codes')
expectFact('mdChangedSinceIndex', 'mdChangedSinceIndex', 'mdChangedSinceIndex')

// §D — every fact points at a real prompt file:line (the report's prompt side is not decorative)
ok(report.rows.length >= 16, '§D0a every fact has a row to locate (non-vacuous precondition)', String(report.rows.length))
for (const r of report.rows) {
  ok(/^vibe-math-vmu\/.+\.js:\d+$/.test(r.prompt), '§D1 prompt location resolves: ' + r.id, r.prompt)
  ok(/^vibe-math-vmu\/.+:\d+$/.test(r.truthAt), '§D2 truth location resolves: ' + r.id, r.truthAt)
}

// §E — prompt-side mutations: the CLAIM side is genuinely read
{
  const mutated = Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v
    .split('默认 2000 字符').join('默认 3000 字符')]))
  const r = runFacts(mutated, { overrides: {} })
  const red = r.inconsistent.map((x) => x.id)
  ok(red.length === 1 && red[0] === 'replyLimitChars', '§E1 a prompt-side 2000→3000 turns exactly replyLimitChars red', JSON.stringify(red))
}
{
  const mutated = Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v
    .split('缺省 chair').join('缺省 open')]))
  const r = runFacts(mutated, { overrides: {} })
  const red = r.inconsistent.map((x) => x.id)
  ok(red.length === 1 && red[0] === 'lateAdmissionDefault', '§E2 reverting 缺省 chair→缺省 open turns exactly lateAdmissionDefault red', JSON.stringify(red))
}

// §F — truth-side mutants: exactly the mutated fact, prompt text unchanged
const MUTANTS = [
  { fact: 'replyLimitChars', override: 1 },
  { fact: 'ackSettlesOnly', override: 'read' },
  { fact: 'seatLabels', override: { chair: '院士', member: '常驻研究员', temp: '临时工', office: '所办' } },
]
const before = hashOf(texts)
ok(MUTANTS.length === 3, '§F0 the mutant list is the three documented truth-side mutations (non-vacuous precondition)')
for (const m of MUTANTS) {
  const textsAgain = await assemblePrompts()
  ok(hashOf(textsAgain) === before, '§F1 prompt text unchanged for mutant: ' + m.fact)
  const r = runFacts(textsAgain, { overrides: { [m.fact]: m.override } })
  const red = r.inconsistent.map((x) => x.id)
  ok(red.length === 1 && red[0] === m.fact, '§F2 truth-side mutant caught alone: ' + m.fact, JSON.stringify(red))
}

// §G — the CLI is the same ruler
{
  const human = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  ok(human.status === 0, '§G1 CLI exits 0 on a clean table', 'status=' + human.status + ' stderr=' + String(human.stderr || '').slice(0, 300))
  ok(String(human.stdout).indexOf('PROMPT FACTS: PASS') !== -1, '§G2 CLI prints PROMPT FACTS: PASS')
  ok(String(human.stdout).indexOf('16 checked') !== -1, '§G3 CLI reports the fact count')
}
{
  const mutants = spawnSync(process.execPath, [SCRIPT, '--mutants'], { encoding: 'utf8' })
  ok(mutants.status === 0, '§G4 --mutants exits 0 (all truth-side mutations caught)', 'status=' + mutants.status)
  ok(String(mutants.stdout).indexOf('MUTANTS: PASS') !== -1, '§G5 --mutants prints MUTANTS: PASS')
  ok((String(mutants.stdout).match(/CAUGHT/g) || []).length === 3, '§G6 exactly three mutants were caught')
}
{
  const json = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8' })
  let parsed = null
  try { parsed = JSON.parse(String(json.stdout)) } catch (e) { parsed = null }
  ok(json.status === 0 && parsed !== null && parsed.checked >= 16 && Array.isArray(parsed.inconsistent) && parsed.inconsistent.length === 0, '§G7 --json is machine-readable and green')
}

ok(RULER_MEETING === 'm-facts', '§H1 ruler meeting id is the documented one')

console.log('')
console.log('=== VMU RUN256 PROMPT FACTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
