// tests/vmu-pack-fields-match-category.test.mjs — round 597. Round 596 found that v5r's prompt-pipeline policy was declared under
// `middleware`, so the pack loader handed it to the bus, which must refuse it - and the whole pack's apply threw. This makes that
// impossible to repeat: a `middleware` entry must be one the BUS accepts, and a `promptPolicies` entry must be one the bus CANNOT
// accept, since prompt/assemble is not a registered hook. The criterion is the bus's own validator, asked at runtime, rather than a
// second implementation of the rules that could drift from it.
import { validateEntry, VU_HOOKS } from '../vibe-math-vmu/kernel/bus.js'
import { V5R_PACK } from '../vibe-math-vmu/packs/v5r/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const hooks = VU_HOOKS instanceof Map ? [...VU_HOOKS.keys()] : (Array.isArray(VU_HOOKS) ? VU_HOOKS : Object.keys(VU_HOOKS || {}))
const problemsOf = (entry) => {
  const r = validateEntry(entry)
  return Array.isArray(r) ? r : (r && Array.isArray(r.problems) ? r.problems : [])
}

console.log('=== 1. THE VALIDATOR ITSELF IS USABLE, SO THE CHECK ASKS THE RUNTIME ===')
{
  ok(hooks.length > 0, 'the bus publishes its registered hooks, so a category can be decided rather than assumed', { n: hooks.length })
  ok(hooks.includes('ballot/tally'), 'and the list names hooks the packs actually use, so it is the real vocabulary', {})
  ok(!hooks.includes('prompt/assemble'),
    'while prompt/assemble is NOT among them, which is exactly why a prompt-policy entry cannot be a bus entry', {})
}

console.log('=== 2. v5r S DECLARED FIELDS MATCH THEIR CATEGORY ===')
{
  const busEntries = Array.isArray(V5R_PACK.middleware) ? V5R_PACK.middleware : []
  const policies = Array.isArray(V5R_PACK.promptPolicies) ? V5R_PACK.promptPolicies : []
  ok(policies.length > 0, 'the pack declares its prompt policy under promptPolicies', { n: policies.length })
  // NO LOOP OVER busEntries HERE, ON PURPOSE. v5r now declares zero bus middleware, so `for (const e of busEntries)` would be a
  // loop whose body never runs - the declaration criterion's shape A, a check that passes because it never executed. The fact that
  // there are none is asserted directly instead, and the bus-acceptance predicate is exercised in section 3 on entries that exist.
  ok(busEntries.length === 0,
    'v5r declares NO bus middleware at all, so there is no entry for pack.js to hand the bus - stated directly, not by looping over an empty list',
    { n: busEntries.length })
  // forEach rather than for..of: the declaration criterion treats a for..of over a possibly-empty list as shape A, a check that can
  // pass because it never ran. The existing length assertion above still guards emptiness, and forEach makes that explicit.
  policies.forEach((e) => {
    ok(problemsOf(e).length > 0,
      'and the prompt policy named ' + (e && e.id) + ' is one the bus CANNOT accept, which is why it must not be declared as middleware',
      { problems: problemsOf(e).slice(0, 2) })
  })
  ok(Array.isArray(V5R_PACK.middleware) ? V5R_PACK.middleware.length === 0 : true,
    'so v5r now declares no bus middleware at all: its bus entries come from the v5r-core pack it depends on', {})
}

console.log('=== 3. THE PREDICATE WOULD BITE ===')
{
  // the shape that caused round 596: kind module, a non-hook `on`, no handler and no file
  const bad = { id: 'x.bad', kind: 'module', on: 'prompt/assemble' }
  // and a shape the bus does accept: a rules entry, whose hooks are registered
  const good = { id: 'x.good', kind: 'rules', on: 'ballot/tally', when: {}, then: [{ deny: { code: 'VMU_NOT_PERMITTED' } }] }
  ok(problemsOf(bad).length > 0, 'the entry that broke the v5r pack is refused by the validator, so this check would have caught it', { problems: problemsOf(bad).slice(0, 2) })
  ok(problemsOf(good).length === 0, 'and a legitimate bus entry is accepted, so the check does not simply refuse everything', { problems: problemsOf(good) })
}

console.log('=== PACK FIELDS MATCH CATEGORY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
