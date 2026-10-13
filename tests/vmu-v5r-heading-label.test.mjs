// tests/vmu-v5r-heading-label.test.mjs — round 594. The corpus is verbatim from the capture, so it keeps `{{ role }}`; the bridge is
// where a recording becomes a runtime artifact, and there the HEADING must interpolate the reader-facing label. The framework already
// documents the distinction: `role` is the kind KEY that bindings select on, `roleLabel` is what a reader sees. Mixing them renders a
// heading as "—— researcher r-1", which is what the audit flagged across every captured prompt.
import { PROMPTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { VARIABLE_WHITELIST } from '../vibe-math-vmu/kernel/prompt/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. THE CORPUS IS UNTOUCHED EVIDENCE ===')
{
  const all = PROMPTS.map((p) => p.text).join('\n')
  const bare = (all.match(/\{\{\s*role\s*\}\}/g) || []).length
  ok(PROMPTS.length > 0, 'the corpus is non-empty, so what follows is not measured on nothing', { n: PROMPTS.length })
  ok(bare > 0, 'the corpus still carries the bare kind key, because it is a verbatim recording and must not be edited', { bare })
  ok(!/\{\{\s*roleLabel\s*\}\}/.test(all), 'and it carries no label, which is precisely the gap the bridge fills', {})
}

console.log('=== 2. THE BRIDGE PUTS THE LABEL IN THE HEADING ===')
{
  ok(v5rPromptSections.length > 0 && v5rPromptSections.length === PROMPTS.length,
    'every corpus entry becomes one section', { sections: v5rPromptSections.length, corpus: PROMPTS.length })
  const all = v5rPromptSections.map((s) => s.text).join('\n')
  const labelled = (all.match(/——\s*\{\{\s*roleLabel\s*\}\}/g) || []).length
  const bareInHeading = (all.match(/——\s*\{\{\s*role\s*\}\}/g) || []).length
  ok(labelled > 0, 'headings now interpolate the reader-facing label', { labelled })
  ok(bareInHeading === 0, 'and no heading interpolates the bare kind key any more', { bareInHeading })
}

console.log('=== 3. THE VARIABLE THE BRIDGE EMITS IS ONE THE PIPELINE ACCEPTS ===')
{
  ok(Array.isArray(VARIABLE_WHITELIST) && VARIABLE_WHITELIST.length > 0, 'the whitelist is a non-empty list', { n: VARIABLE_WHITELIST.length })
  ok(VARIABLE_WHITELIST.includes('roleLabel'), 'roleLabel is whitelisted, so the fix cannot produce an unrenderable section', { list: VARIABLE_WHITELIST })
  ok(VARIABLE_WHITELIST.includes('role'), 'and role stays whitelisted too, because bindings still select on the kind key', {})
}

console.log('=== 4. THE PREDICATE WOULD BITE ===')
{
  // The rewrite must be specific to the heading: a `{{ role }}` used as a kind key elsewhere must survive.
  const sample = '——{{ role }} x and {{ role }}'
  const rewritten = sample.replace(/(——\s*)\{\{\s*role\s*\}\}/g, '$1{{ roleLabel }}')
  ok(rewritten === '——{{ roleLabel }} x and {{ role }}',
    'only the heading occurrence is rewritten, so a legitimate kind-key use is left alone', { rewritten })
}

console.log('=== V5R HEADING LABEL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
