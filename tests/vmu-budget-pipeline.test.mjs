// tests/vmu-budget-pipeline.test.mjs — round 575. Budget is a pipeline face, and its own refusal hint teaches
// `open({scope:"meeting:mt-1"})`. That call could NOT be made through the tool, whose parameters were scattered at the top level,
// so the documented example failed with "open needs a string scope". The tool now accepts a request object as well, additively, and
// this drives the whole pipeline through BOTH shapes to prove neither is broken.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const spec = toolSpecs({ kernel: k, settings: {}, ...flags }).find((s) => s.name === TOOL_NAMES.budget)
ok(!!spec, 'the budget tool registers', {})

console.log('=== 1. THE TOOL ADVERTISES A request PARAMETER, LIKE THE OTHERS ===')
const props = Object.keys((spec.parameters && spec.parameters) || {})
ok(props.includes('request'), 'the tool declares request, so the call its own service documents can be expressed', { props })

console.log('=== 2. THE DOCUMENTED CALL WORKS (it did not before) ===')
{
  const r = await spec.run({ action: 'open', request: { scope: 'math:doc' } })
  ok(r && r.ok === true, 'open({scope}) via request SUCCEEDS, which is exactly what the service hint teaches', { r: r && (r.code || r.scope) })
}
console.log('=== 3. AND THE OLD SHAPE STILL WORKS, ADDITIVELY ===')
{
  const r = await spec.run({ action: 'open', scope: 'math:legacy' })
  ok(r && r.ok === true, 'open with a top-level scope still succeeds, so nothing that worked before is broken', { r: r && (r.code || r.scope) })
}

console.log('=== 4. THE PIPELINE RUNS ===')
{
  const opened = await spec.run({ action: 'open', request: { scope: 'math:pipe', limits: { tokens: 100 } } })
  ok(opened && opened.ok === true, 'open succeeds', { r: opened && (opened.code || opened.scope) })
  const charged = await spec.run({ action: 'charge', request: { scope: 'math:pipe', kind: 'tokens', amount: 7 } })
  ok(charged && charged.ok === true, 'charge succeeds against the opened scope', { r: charged && (charged.code || (charged.used && charged.used.tokens)) })
  ok(charged && charged.used && charged.used.tokens === 7, 'and the charge is reflected in used tokens, so the change is observable rather than merely acknowledged', { used: charged && charged.used })
  const remaining = await spec.run({ action: 'remaining', request: { scope: 'math:pipe' } })
  ok(remaining && remaining.ok === true, 'remaining succeeds', { r: remaining && (remaining.code || Object.keys(remaining).slice(0, 4)) })
  const list = await spec.run({ action: 'list' })
  ok(list && list.ok === true && Array.isArray(list.items), 'and the scope is enumerable afterwards', { items: list && list.items && list.items.length })
}

console.log('=== 5. IT STILL REFUSES WITHOUT A SCOPE, AND THE REFUSAL STILL GUIDES ===')
{
  const r = await spec.run({ action: 'charge', request: {} })
  ok(r && r.ok !== true && r.code === 'VMU_BUDGET_SCOPE_UNKNOWN', 'charge without a scope refuses by name', { r })
  ok(r && /open/i.test(String(r.hint || '')), 'and the refusal still names open as the step that must come first', { hint: r && r.hint })
}

console.log('=== BUDGET PIPELINE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
