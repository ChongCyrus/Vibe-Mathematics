// tests/vmu-refusals-guide.test.mjs — round 570. Last round found that one service's refusals name the step that must come first,
// and the honest test of that is to follow each hint and see whether the outcome changes. Measuring across the framework shows it
// is not one service's trait: of 157 refusals, 141 carry a hint and 69 name ANOTHER ACTION of the same tool. So this checks the
// property framework-wide, and it is deliberately SHAPE-AGNOSTIC - it never guesses a field name, it follows what the refusal says.
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

console.log('=== 1. THE SURFACE IS REAL ===')
ok(specs.length >= 35, 'a substantial number of tools register when every flag is on', { n: specs.length })
const total = specs.reduce((n, s) => n + ((s.parameters.action && s.parameters.action.enum) || []).length, 0)
ok(total > 200, 'and they advertise a substantial number of actions between them', { actions: total })

console.log('=== 2. A REFUSAL USUALLY GUIDES THE CALLER ===')
// ★ PERFORMANCE (round speed-1, measured 30.3 s): a bare sweep of EVERY action calls the two waiters' DEFAULT
// path, and that path blocks for tens of seconds by design (`vmu.activity.timeoutMs` defaults to 30000 and its
// domain starts at 10000). This suite judges REFUSAL SHAPE, not the waiter's hold, so it reads the waiters' own
// fast action instead — the same guard `vmu-undefined-refusals.test.mjs` already uses for the same reason; the
// waiters' timeout path stays covered by the activity/math suites. No other face has a slow default.
const actionsOf = (s) => (s.name === 'vibe_vmu_wait' || s.name === 'vibe_v5_wait')
  ? ['status'] : ((s.parameters.action && s.parameters.action.enum) || [])
const refusals = []
for (const s of specs) {
  const en = actionsOf(s)
  for (const a of en) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code || 'THREW', hint: e.hint } }
    if (r && r.ok === true) continue
    if (r && typeof r.code === 'string') refusals.push({ tool: s.name, action: a, code: r.code, hint: r.hint ? String(r.hint) : '', message: r.message ? String(r.message) : '' })
  }
}
ok(refusals.length > 100, 'the probe produced enough refusals to judge the property rather than one lucky case', { refusals: refusals.length })
const hinted = refusals.filter((r) => r.hint.length > 0)
const ratio = hinted.length / refusals.length
ok(ratio >= 0.8,
  'at least four fifths of refusals carry a hint (' + Math.round(ratio * 100) + '%), so a caller who does the wrong thing is usually told what to do instead',
  { hinted: hinted.length, of: refusals.length, lacking: refusals.filter((r) => !r.hint.length).slice(0, 8).map((r) => r.tool + '.' + r.action) })

console.log('=== 3. FOLLOWING A HINT CHANGES THE OUTCOME ===')
// SHAPE-AGNOSTIC: for each refusal whose hint names another action of the same tool, call that action and require a DIFFERENT
// refusal code. If the hint were a lie, the named step would fail the same way. No field name is ever guessed.
let checked = 0
const lies = []
for (const r of refusals) {
  const spec = specs.find((s) => s.name === r.tool)
  if (!spec) continue
  const en = (spec.parameters.action && spec.parameters.action.enum) || []
  const named = en.filter((x) => x !== r.action && r.hint.includes(x))
  if (!named.length) continue
  checked += 1
  let follow
  try { follow = await spec.run({ action: named[0] }) } catch (e) { follow = { code: e.code || 'THREW' } }
  // THE CRITERION IS ADVICE ADVANCING, NOT THE CODE CHANGING. Two different actions can legitimately refuse with the same code -
  // budget.charge names open({scope}), and open then refuses with the SAME code but a MORE SPECIFIC hint, e.g. open({scope:"meeting:mt-1"}).
  // That is guidance converging in two steps, not a lie, and judging it by the code alone would report a healthy service as broken.
  const stillStuck = follow && follow.ok !== true && String(follow.code) === String(r.code) && String(follow.hint || '') === r.hint
  if (stillStuck) lies.push({ tool: r.tool, from: r.action, to: named[0], code: r.code, hint: r.hint.slice(0, 60) })
}
ok(checked >= 20, 'enough hint-following cases were exercised for the check to mean something', { checked })
ok(lies.length === 0,
  'and no hint is a dead end: following the action a refusal names always yields DIFFERENT guidance, so the advice advances even when the code repeats',
  { lies: lies.slice(0, 8) })

console.log('=== 4. THE PIPELINE FACES ARE IDENTIFIABLE FROM THEIR OWN HINTS ===')
const pipeline = specs
  .map((s) => ({ name: s.name, n: ((s.parameters.action && s.parameters.action.enum) || []).length, refs: refusals.filter((r) => r.tool === s.name && /first|before/i.test(r.hint)).length }))
  .filter((p) => p.n >= 8 && p.refs > 0)
ok(pipeline.length >= 3, 'the tools whose refusals say "first" are identifiable without a hand-written list', { pipeline: pipeline.map((p) => p.name + ':' + p.refs) })

console.log('=== REFUSALS GUIDE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
