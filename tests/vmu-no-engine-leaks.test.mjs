// tests/vmu-no-engine-leaks.test.mjs — round 571. A refusal is the framework talking to an operator, so it must never be a V8
// message: minutes.actions once answered a missing id with "Cannot destructure property 'id' of '(intermediate value)..." because
// a default parameter does not protect against null. This is the general property, checked across every action of every tool.
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
const specs = toolSpecs({ kernel: k, settings: {}, ...flags })

console.log('=== 1. THE SURFACE ===')
const total = specs.reduce((n, s) => n + ((s.parameters.action && s.parameters.action.enum) || []).length, 0)
ok(specs.length >= 35 && total > 200, 'every tool and every action is exercised', { tools: specs.length, actions: total })

console.log('=== 2. NO REFUSAL QUOTES THE ENGINE ===')
// V8 wording that must never reach an operator: these appear only when an internal error escapes as a message.
const ENGINE = /Cannot destructure|intermediate value|is not a function|is not iterable|Cannot read propert|undefined is not|Unexpected token|TypeError|ReferenceError/i
const leaks = []
for (const s of specs) {
  for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code || 'THREW', message: String(e.message), hint: e.hint } }
    if (r && r.ok === true) continue
    const text = String((r && r.message) || '') + ' ' + String((r && r.hint) || '')
    if (ENGINE.test(text)) leaks.push({ tool: s.name, action: a, code: r && r.code, message: text.slice(0, 90) })
  }
}
ok(leaks.length === 0,
  'and none of them answers with a JavaScript engine message, because a refusal is the framework speaking to an operator and an engine message is not a refusal',
  { leaks: leaks.slice(0, 6) })

console.log('=== 3. THE PREDICATE WOULD BITE ===')
{
  const sample = "Cannot destructure property 'id' of '(intermediate value)' as it is null."
  const clean = 'actions needs { id }'
  ok(ENGINE.test(sample) && !ENGINE.test(clean),
    'the predicate recognises an engine message and leaves a proper refusal alone, so the check is not vacuous', {})
}

console.log('=== NO ENGINE LEAKS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
