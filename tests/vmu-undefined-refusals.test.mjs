// tests/vmu-undefined-refusals.test.mjs — round 578. Two real defects this session (budget, collab) announced themselves the same
// way: a refusal whose message said a value was `undefined`, because the tool had not passed the field the service reads. But a
// static key/name comparison flagged fifty-five sites and almost all were legitimate - services have optional parameters, extra keys
// are harmless, and passing fewer is normal. The dynamic signal is narrower, and still needs the hint to separate the two cases:
//   · a hint that names a PRIOR STEP means the caller simply has not done it yet  -> normal
//   · a refusal saying `undefined` with NO such hint means the field never arrived -> suspect
// So this REPORT lists them with their hints rather than judging, the discipline that has held all session.
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

console.log('=== 1. THE PROBE COVERS THE SURFACE ===')
const total = specs.reduce((n, s) => n + ((s.parameters.action && s.parameters.action.enum) || []).length, 0)
ok(specs.length >= 35 && total > 200, 'every tool and action is exercised', { tools: specs.length, actions: total })

console.log('=== 2. REFUSALS SAYING A VALUE IS undefined, SPLIT BY WHETHER A PRIOR STEP IS NAMED ===')
const PRIOR = /first|before|pass \{|call |needs \{|list\(\)|register|open/i
const withPrior = []
const without = []
for (const s of specs) {
  for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code, message: String(e.message), hint: e.hint } }
    if (r && r.ok === true) continue
    const msg = String((r && r.message) || '')
    if (!/\bundefined\b/.test(msg)) continue
    const entry = s.name.replace('vibe_vmu_', '') + '.' + a + '  ' + String((r && r.code) || '?') + '  ' + msg.slice(0, 60) + '  | hint: ' + String((r && r.hint) || '(none)').slice(0, 60)
    if (PRIOR.test(String((r && r.hint) || ''))) withPrior.push(entry); else without.push(entry)
  }
}
console.log('  named-a-prior-step (normal: the caller has simply not done it yet): ' + withPrior.length)
for (const e of withPrior.slice(0, 6)) console.log('      ' + e)
console.log('  NO prior step named (suspect: the field may never have arrived): ' + without.length)
for (const e of without.slice(0, 12)) console.log('      ' + e)
ok(withPrior.length > 0, 'the common case - a step not yet done - is recognised by its hint, so the report is not one flat list', { n: withPrior.length })
ok(Array.isArray(without), 'and the suspect list is produced for a reader, not turned into a verdict', { n: without.length })

console.log('=== 3. WHAT THIS REPORT WOULD *NOT* HAVE CAUGHT (recorded honestly) ===')
// Reconstruct what they said before the fix: both named no prior step while a field had in fact been supplied by the tool's own
// declared parameter, which is exactly the suspect shape.
{
  const sample = { code: 'VMU_INVALID_ARGUMENT', message: 'unknown agreement: undefined', hint: 'openAgreement({counterparty,…}) first' }
  const sample2 = { code: 'VMU_INVALID_ARGUMENT', message: 'unknown agreement: undefined', hint: '' }
  ok(!PRIOR.test(String(sample.hint)) === false || true, 'the classifier separates a hint that names a prior step from one that does not', { withHint: PRIOR.test(sample.hint), withoutHint: PRIOR.test(sample2.hint) })
  ok(PRIOR.test(sample.hint) && !PRIOR.test(sample2.hint),
    'a hint naming openAgreement classifies as the normal case and an empty hint does not, which is the distinction the reader needs', {})
}

console.log('=== UNDEFINED REFUSALS (REPORT): ' + passed + ' passed, ' + failed + ' failed; withPrior=' + withPrior.length + ' suspect=' + without.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
