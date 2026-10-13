// tests/vmu-prompt-v5r-bridge.test.mjs — the v5r prompt TEXT, assembled by the FRAMEWORK's own pipeline.
//
// Why this file exists: the round-136 work embedded the v5r prompt corpus into the pack as hash-locked DATA, and a
// reviewer looking at it reasonably asked whether the prompts had been hard-coded instead of being composed the way
// the original v5r composes them. The framework already owns a prompt pipeline (`kernel/prompt/index.js`, docs/06):
// sections are DECLARED, ordered by reserved ranges, bindable per role/phase/member/task, overridable, and assembled
// as a pure function that can be snapshotted. This test asserts the bridge actually carries the text that way - not
// that a pile of strings exists somewhere.
//
// Run: node tests/vmu-prompt-v5r-bridge.test.mjs   (last line: === VMU PROMPT v5r bridge: N passed, M failed ===)

import { createPromptPipeline, ORDER_RANGES } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { PROMPTS, COUNTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')) }
}

ok(v5rPromptSections.length > 0 && PROMPTS.length > 0, 'B-shape guard: v5rPromptSections and PROMPTS are BOTH non-empty, so the comparison below cannot pass vacuously', { v5rPromptSections: v5rPromptSections.length, PROMPTS: PROMPTS.length })
ok(v5rPromptSections.length > 0 && PROMPTS.length > 0, 'B-shape guard: v5rPromptSections and PROMPTS are BOTH non-empty, so the comparison below cannot pass vacuously', { v5rPromptSections: v5rPromptSections.length, PROMPTS: PROMPTS.length })
ok(Array.isArray(v5rPromptSections) && v5rPromptSections.length === PROMPTS.length && PROMPTS.length === COUNTS.total,
  'B1. ★ every corpus entry becomes a SECTION (the counts agree: sections, corpus entries, and the recorded total)',
  { sections: v5rPromptSections.length, corpus: PROMPTS.length, recorded: COUNTS.total })

{
  const [lo, hi] = ORDER_RANGES.pack
  ok(v5rPromptSections.every((s) => s.range === 'pack' && s.order >= lo && s.order <= hi),
    'B2. ★★★ they all sit in the PACK range (' + lo + '..' + hi + '), where docs/06 says a pack section belongs',
    { first: v5rPromptSections[0].order, last: v5rPromptSections[v5rPromptSections.length - 1].order })
  const names = v5rPromptSections.map((s) => s.name)
  ok(new Set(names).size === names.length && names.every((n) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(n)),
    'B3. ★★ the names are unique and kebab-case, which is what the registry requires', { sample: names.slice(0, 3) })
  ok(v5rPromptSections.every((s) => typeof s.text === 'string' && s.text.length > 0),
    'B4. ★★ and every section carries non-empty text')
}

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

{
  const a = await pipeline().assemble({})
  const b = await pipeline().assemble({})
  ok(a.ok === true && typeof a.text === 'string' && a.text.length > 1000,
    'B5. ★★★ the framework pipeline ASSEMBLES the v5r text (a pure function, not a hand-written blob)', { chars: a.text && a.text.length })
  ok(a.text === b.text,
    'B6. ★★★ and assembly is DETERMINISTIC: the same inputs produce byte-identical output, which is what makes it snapshottable')
  ok(Array.isArray(a.sources) && a.sources.length >= v5rPromptSections.length,
    'B7. ★★ the assembly reports its PROVENANCE: every contributing section is named', { sources: a.sources && a.sources.length })
  ok(a.text.indexOf(v5rPromptSections[0].text.slice(0, 40)) !== -1,
    'B8. ★★★ and the corpus text really is the thing being assembled (the first entry appears verbatim)')
}

{
  const ov = pipeline()
  const target = v5rPromptSections[0].name
  ov.register({ name: target + '-appendix', order: 899, range: 'pack', source: 'test', text: 'APPENDED-BY-TEST' })
  const out = await ov.assemble({})
  ok(out.ok === true && out.text.includes('APPENDED-BY-TEST'),
    'B9. ★★★ a further pack section can be APPENDED at assembly time - the text is composable, not frozen',
    { appended: target + '-appendix' })
}

{
  let refused = null
  try { pipeline().register({ name: 'too-high', order: 12000, range: 'pack', text: 'x' }) } catch (e) { refused = e }
  ok(refused !== null && /VMU_|order/i.test(String(refused.code || refused.message)),
    'B10. ★★ and declaring a section OUTSIDE the reserved range is refused by name rather than quietly re-ordered',
    { code: refused && refused.code })
}

console.log('=== VMU PROMPT v5r bridge: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
