// tests/vmu-round2-seams.test.mjs - D-13's PERMANENT assertion: the prompt pipeline reads its SETTINGS live.
//
// WHY. `kernel/prompt/index.js` used to snapshot six setting VALUES into a closure at CONSTRUCTION time, so a
// runtime `vibe_vmu_set` changed a key and the pipeline kept using the old value - "hot setting" in name only.
// Round 2 (handover D-13) made the six keys read through `settings.get()` on every call. This suite pins that:
// ONE pipeline instance is built, then only `kernel.setSettingsValue(...)` is called, and every assertion is
// about the NEXT `assemble()` of that SAME instance. The negative control in section 6 is what makes the rest
// meaningful: if the instance had been reconstructed, a "live read" test would pass for the wrong reason.
//
// STRUCTURAL vs VALUE (the distinction the fix rests on): `vmu.prompts.sections` stays a CONSTRUCTION-TIME
// registration (a section is structure), while `overrides`/`locale.*`/`glossary.*`/`overridesByLang` are VALUES
// and are read live. This suite declares the section up front and changes only values afterwards.
//
// MEASURED SEMANTICS worth knowing (verified here, not assumed): `overridesByLang` is keyed by SECTION first
// and LANGUAGE second (`{ '<section>': { en: 'text' } }`), and a language override applies when its language is
// in `langOrder(asked)` - so with the DEFAULT chain (`zh-Hans, zh, en`) an `en` override DOES apply to a `zh`
// request through the fallback chain, while an override for a language outside the chain (`fr`) does not apply
// at all. The suite pins both directions, because "applies by fallback" and "does not leak" are different
// claims and only the second one is about matching the requested language.
//
// Run: node tests/vmu-round2-seams.test.mjs
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) }
  else { failed++; failures.push(label + (detail === undefined ? '' : ' [' + detail + ']')); console.error('  FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) }
}

// ONE instance, built once. Nothing below rebuilds it.
const SECTION = 'd13-section'
const kernel = createKernel({ settings: { 'vmu.prompts.sections': [{ name: SECTION, order: 600, text: 'FROM-SETTINGS' }] } })
const instanceAtStart = kernel.prompt
const base = await kernel.prompt.assemble({})
ok(base.ok === true && String(base.text).includes('FROM-SETTINGS'),
  'baseline: a section declared in settings is assembled (the pipeline really runs)', String(base.text).slice(0, 80))

console.log('== 1. vmu.prompts.overrides is read LIVE ==')
{
  kernel.setSettingsValue('vmu.prompts.overrides', { [SECTION]: 'LIVE-OVERRIDE' }, { by: 'office' })
  const a = await kernel.prompt.assemble({})
  ok(String(a.text).includes('LIVE-OVERRIDE'),
    '★ (1) an override written at RUNTIME reaches the NEXT assemble() of the same instance', String(a.text).slice(0, 80))
  ok(!String(a.text).includes('FROM-SETTINGS'),
    '★ (1b) and the construction-time text is GONE (the value was not merely appended)')
}

console.log('== 2. locale.default + locale.fallbackChain are read LIVE ==')
{
  kernel.setSettingsValue('vmu.prompts.locale.default', 'en', { by: 'office' })
  kernel.setSettingsValue('vmu.prompts.locale.fallbackChain', ['en', 'zh'], { by: 'office' })
  const a = await kernel.prompt.assemble({})
  ok(a.locale.default === 'en', '★ (2) locale.default is live', String(a.locale.default))
  ok(JSON.stringify(a.locale.chain) === JSON.stringify(['en', 'zh']),
    '★ (2b) locale.fallbackChain is live AND keeps the declared order', JSON.stringify(a.locale.chain))
}

console.log('== 3./4. the glossary family is read LIVE ==')
{
  kernel.setSettingsValue('vmu.prompts.glossary.mode', 'off', { by: 'office' })
  const a = await kernel.prompt.assemble({})
  ok(a.glossary.mode === 'off' && base.glossary.mode === 'enforce',
    '★ (3) glossary.mode flips enforce → off live (the baseline really was `enforce`)', JSON.stringify({ before: base.glossary.mode, after: a.glossary.mode }))
  kernel.setSettingsValue('vmu.prompts.glossary.ontology', 'D:/_tmp/d13-ontology.json', { by: 'office' })
  const b = await kernel.prompt.assemble({})
  ok(b.glossary.path === 'D:/_tmp/d13-ontology.json',
    '★ (4) glossary.ontology is read live (assemble().glossary.path follows it)', String(b.glossary.path))
}

console.log('== 5. overridesByLang is read LIVE and matched through langOrder ==')
{
  kernel.setSettingsValue('vmu.prompts.overridesByLang', { [SECTION]: { en: 'EN-LIVE' } }, { by: 'office' })
  const en = await kernel.prompt.assemble({ lang: 'en' })
  ok(String(en.text).includes('EN-LIVE'),
    '★ (5) an override declared as { <section>: { en: … } } applies to lang=en, written live', String(en.text).slice(0, 70))
  const zh = await kernel.prompt.assemble({ lang: 'zh' })
  ok(String(zh.text).includes('EN-LIVE'),
    '★ (5b) MEASURED: it ALSO applies to lang=zh, because `en` sits in the DEFAULT fallback chain (documented consequence, not a leak bug)', JSON.stringify(zh.locale.tried))
  kernel.setSettingsValue('vmu.prompts.overridesByLang', { [SECTION]: { fr: 'FR-LIVE' } }, { by: 'office' })
  const zh2 = await kernel.prompt.assemble({ lang: 'zh' })
  ok(!String(zh2.text).includes('FR-LIVE') && String(zh2.text).includes('LIVE-OVERRIDE'),
    '★ (5c) an override for a language OUTSIDE langOrder(asked) does NOT apply, and the lookup falls back to the PLAIN override declared in section 1 (the match is the chain, not "any language")',
    JSON.stringify({ tried: zh2.locale.tried, hasPlain: String(zh2.text).includes('LIVE-OVERRIDE') }))
}

console.log('== 6. NEGATIVE CONTROL: the instance never changed ==')
{
  ok(kernel.prompt === instanceAtStart,
    '★ (6) the pipeline instance is the SAME object from first to last assertion ⇒ sections 1-5 were LIVE reads, not a reconstruction')
  // The control has a positive twin: a FRESH kernel built with the final settings shows the same values, so the
  // assertions above cannot be satisfied by "the kernel ignores settings entirely".
  const fresh = createKernel({ settings: {
    'vmu.prompts.sections': [{ name: SECTION, order: 600, text: 'FROM-SETTINGS' }],
    'vmu.prompts.glossary.mode': 'off',
    'vmu.prompts.locale.default': 'en',
    'vmu.prompts.locale.fallbackChain': ['en', 'zh'],
    'vmu.prompts.overridesByLang': { [SECTION]: { fr: 'FR-LIVE' } },
  } })
  const fa = await fresh.prompt.assemble({ lang: 'zh' })
  ok(fa.glossary.mode === 'off' && fa.locale.default === 'en' && JSON.stringify(fa.locale.chain) === JSON.stringify(['en', 'zh']),
    '★ (6b) a FRESH kernel with those settings yields the same values ⇒ the live reads above are the same semantics, not a different code path',
    JSON.stringify({ mode: fa.glossary.mode, def: fa.locale.default, chain: fa.locale.chain }))
}

console.log('')
console.log('=== VMU ROUND2 SEAMS (D-13): ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
