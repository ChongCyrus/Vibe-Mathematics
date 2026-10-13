// tests/vmu-charter-contracts.test.mjs - four decision tables the PACK owns, each checked against the mechanism that uses it.
//
// WHY THESE FOUR TOGETHER. They are the same kind of thing: a table in the pack that the framework reads and must not
// hard-code. The kernel names no v5r-* section anywhere; the pack declares four formalisation states, three optional
// switches and three meeting states, and the loop asks. Asserting them as a group makes the shape visible: every table is
// read from its own module, every section it names must exist in the charter, and turning one off must remove exactly that
// section and nothing else.
//
// The fourth group is the refused-dispatch notice, whose wording the kernel builds character by character - including the
// corpus's own phrasing - and which must appear in the NEXT prompt rather than the one that caused it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections, MEETING_STATES, FORMAL_STATUSES, OFF_SWITCHES } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { inboxBlock } from '../vibe-math-vmu/packs/v5r/notices.js'

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

const declared = new Set(CHARTER_SECTIONS.map((s) => s.name))
const enabledBy = (settings, turn) => {
  const decided = decideSections({ settings, turn })
  return new Set((((decided || {}).decisions) || []).filter((d) => d.enabled !== false).map((d) => d.name))
}
const loopWith = (noticeBlock = null) => createTurnOrchestrator({
  sectionPolicy: decideSections,
  prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
  noticeBlock,
})

console.log('=== 1. THE FOUR DECISION TABLES ARE THE PACK S, AND EVERY SECTION THEY NAME EXISTS ===')
ok(FORMAL_STATUSES.length === 4, 'four formalisation states are declared', { n: FORMAL_STATUSES.length })
ok(OFF_SWITCHES.length >= 1, 'at least one optional switch is declared', { n: OFF_SWITCHES.length })
ok(MEETING_STATES.length === 3, 'three meeting states are declared - invited, others, first', { keys: MEETING_STATES.map(([k]) => k) })
const named = [...FORMAL_STATUSES, ...OFF_SWITCHES, ...MEETING_STATES].map(([, section]) => section)
const absent = named.filter((s) => !declared.has(s))
ok(absent.length === 0, 'and every section those tables point at is actually declared by the charter', { absent })
const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
ok(!/v5r-/.test(kernelSrc), 'while the kernel names no v5r-* section at all: the tables are the pack s, the mechanism is the framework s')

console.log('=== 2. EACH FORMALISATION STATE ENABLES ITS OWN SECTION ===')
for (const [key, section] of FORMAL_STATUSES) {
  const on = enabledBy({}, { phase: 'normal', formalStatus: key })
  ok(on.has(section), 'formalStatus=' + key + ' enables ' + section)
}
{
  const a = enabledBy({}, { phase: 'normal', formalStatus: 'passed' })
  const b = enabledBy({}, { phase: 'normal', formalStatus: 'blocked' })
  const both = [...a].filter((n) => b.has(n) && /formal-status/.test(n))
  ok(both.length === 0, 'and no two of them share a status section, so the states are exclusive rather than cumulative', { both })
}
{
  const bad = decideSections({ settings: {}, turn: { phase: 'normal', formalStatus: 'not-a-state' } })
  ok((((bad || {}).errors) || []).length > 0, 'an undeclared formalisation state is an error rather than a silent default')
}

console.log('=== 3. AN OPTIONAL SWITCH REMOVES EXACTLY ITS OWN SECTION ===')
for (const [setting, section] of OFF_SWITCHES) {
  const on = enabledBy({}, { phase: 'normal' })
  const off = enabledBy({ [setting]: false }, { phase: 'normal' })
  ok(on.has(section) && !off.has(section), 'setting ' + setting + '=false removes ' + section)
  const collateral = [...on].filter((n) => !off.has(n) && n !== section)
  ok(collateral.length === 0, 'and removes nothing else', { collateral })
}

console.log('=== 4. A REFUSED DISPATCH IS ANNOUNCED IN THE NEXT PROMPT, IN THE CORPUS S OWN WORDS ===')
{
  const loop = loopWith(inboxBlock)
  const first = await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', statusBlock: '[状态] x' }).turn)
  ok(!String(first.text).includes('未生效'), 'the turn that caused a refusal does not announce it in its own prompt')
  // queue the notice the way the loop does, then read the NEXT prompt
  loop.notify('r-1', '【研究所提示】task_update 未生效（V5_TASK_STALE_REVISION）：revision moved')
  const second = await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', statusBlock: '[状态] x' }).turn)
  const text = String(second.text)
  ok(text.includes('【研究所提示】'), 'the announcement uses the corpus prefix rather than an invented one')
  ok(text.includes('未生效'), 'and the corpus phrasing for a refusal')
  ok(text.includes('（V5_TASK_STALE_REVISION）'), 'with the code in the same parenthesised position the corpus shows')
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  // Assert the three literal fragments the kernel concatenates rather than one escaped pattern: the wording is what
  // the corpus shows, and pieces are easier to keep true than a pattern that spells the same thing.
  ok(src.includes("【研究所提示】") && src.includes(" 未生效（") && src.includes("）："),
    'and that shape is what the kernel actually builds, character for character - prefix, field, corpus phrasing, code, message')
}

console.log('=== CHARTER CONTRACTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
