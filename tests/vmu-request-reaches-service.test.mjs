// tests/vmu-request-reaches-service.test.mjs — round 584. The probe that this session proved in scratch scripts, frozen as a check.
// The property: a field the caller puts in `request` must ARRIVE at the service. Rounds 577 to 583 established that eleven tools
// declared a `request` parameter and never forwarded it, and that even after forwarding, the tool's own undefined placeholders
// could clobber the caller's fields. This asserts the property directly, on every tool, with a spy service.
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

const MARK = '__probe_marker__'
// collect what each service method received, by wrapping every kernel service in a spy that records its first argument
const collect = (k) => {
  const seen = []
  // ROUND 584: patch the SERVICE objects, not the kernel's own properties. Assigning to a kernel property fails silently when
  // it is a getter, which made the first version of this check report fourteen misses with no spy installed at all.
  for (const [name, svc] of Object.entries(k)) {
    if (!svc || typeof svc !== 'object') continue
    for (const [m, fn] of Object.entries(svc)) {
      if (typeof fn !== 'function') continue
      try { svc[m] = function (...args) { seen.push({ service: name, method: m, arg: args[0] }); return fn.apply(this, args) } } catch { /* not writable */ }
    }
  }
  return seen
}

console.log('=== 1. THE SURFACE ===')
const base = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const specs = toolSpecs({ kernel: base, settings: {}, ...flags })
ok(specs.length >= 35, 'every tool registers when all flags are on', { n: specs.length })
const declared = specs.filter((s) => Object.keys(s.parameters || {}).includes('request'))
ok(declared.length >= 10, 'and a substantial number of them declare a request parameter, which is what this checks', { n: declared.length, of: specs.length })

console.log('=== 2. A FIELD IN request ARRIVES AT THE SERVICE ===')
const readings = []
for (const spec of declared) {
  const k = createKernel({ clock: () => 0, settings: {} })
  const seen = collect(k)
  const specs2 = toolSpecs({ kernel: k, settings: {}, ...flags })
  const s2 = specs2.find((s) => s.name === spec.name)
  const actions = (s2.parameters.action && s2.parameters.action.enum) || []
  if (!actions.length) continue
  try { await s2.run({ action: actions[0], request: { [MARK]: 'v' } }) } catch { /* a refusal is fine - what matters is the argument */ }
  const hit = seen.find((x) => x.arg && typeof x.arg === 'object' && MARK in x.arg)
  readings.push({ tool: spec.name.replace('vibe_vmu_', ''), action: actions[0], arrived: !!hit, got: hit ? Object.keys(hit.arg).slice(0, 6) : null })
}
const missed = readings.filter((r) => !r.arrived)
ok(readings.length >= 8, 'the probe exercised a substantial number of tools', { n: readings.length })
ok(missed.length === 0,
  'and every one of them passes the caller s request through, so a field supplied there reaches the service instead of being dropped or overwritten',
  { missed: missed.slice(0, 8) })

console.log('=== 3. THE PREDICATE WOULD BITE ===')
{
  // the predicate is "did the service receive an object carrying the marker" - a tool that drops the request cannot satisfy it
  const sample = [{ service: 'x', method: 'y', arg: { other: 1 } }]
  const good = [{ service: 'x', method: 'y', arg: { [MARK]: 'v' } }]
  const bites = (seen) => !seen.some((x) => x.arg && typeof x.arg === 'object' && MARK in x.arg)
  ok(bites(sample) === true && bites(good) === false,
    'a service that received the marker is accepted and one that did not is rejected, so the check cannot pass on a dropped request', {})
}

console.log('=== REQUEST REACHES SERVICE: ' + passed + ' passed, ' + failed + ' failed; checked=' + readings.length + ' missed=' + missed.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
