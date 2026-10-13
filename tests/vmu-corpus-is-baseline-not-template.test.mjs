// tests/vmu-corpus-is-baseline-not-template.test.mjs — round 595. The v5r prompt corpus is the A/B CONTRAST BASELINE: a verbatim
// recording whose snapshot values (round numbers, voter counts, absolute paths) are evidence of what the original printed, which is
// why variableising them would make the baseline less faithful. The audit's own ruling is that the corpus is a contrast baseline and
// must NOT be a runtime template. This makes that boundary explicit and checks it, instead of leaving it to a reader's inference.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { PROMPTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const HERE = dirname(fileURLToPath(import.meta.url))
const V = join(HERE, '..', 'vibe-math-vmu')

console.log('=== 1. THE PLUGIN S ASSEMBLY PATH DOES NOT READ THE CORPUS ===')
{
  const plug = readFileSync(join(V, 'vibe-math-vmu.js'), 'utf8')
  // The plugin builds pack sections from a pack DATA file; if that is the only pack-section source, the corpus cannot arrive that way.
  const readsSectionsJson = /packs',\s*name,\s*'prompts',\s*'sections\.json'/.test(plug)
  ok(readsSectionsJson, 'package sections come from a pack DATA file named prompts/sections.json', {})
  ok(!/from '\.\/packs\/v5r\/prompts\/v5r-core\.js'/.test(plug) && !/v5rPromptSections/.test(plug),
    'and the plugin never imports the corpus-to-section bridge, so the corpus is not a runtime section source', {})
}

console.log('=== 2. v5r HAS NO DATA SECTIONS FILE, SO THAT PATH CONTRIBUTES NOTHING ===')
{
  const dataFile = join(V, 'packs', 'v5r', 'prompts', 'sections.json')
  ok(!existsSync(dataFile),
    'v5r ships no prompts/sections.json, so the pack-data path adds zero sections for this pack - that is the boundary, stated as a fact', { path: dataFile })
}

console.log('=== 3. THE BRIDGE IS THE CONTRAST BASELINE, AND IT IS NON-EMPTY ===')
{
  ok(v5rPromptSections.length > 0 && v5rPromptSections.length === PROMPTS.length,
    'the bridge covers exactly the corpus, one section per recorded prompt', { sections: v5rPromptSections.length, corpus: PROMPTS.length })
  const all = v5rPromptSections.map((s) => s.text).join('\n')
  // A baseline keeps the original's snapshots; that is the point. Assert they are still there, so a later "cleanup" cannot silently
  // turn the baseline into something that no longer matches what was captured.
  ok(/轮次\s*\d+/.test(all) && /有表决权者\s*\d+\s*人/.test(all) && /VibeMath\//.test(all),
    'and it still carries the recorded snapshots (round numbers, voter counts, the captured absolute path), because those ARE the evidence', {})
}

console.log('=== 4. THE ONE SANCTIONED DEVIATION IS THE HEADING LABEL ===')
{
  const all = v5rPromptSections.map((s) => s.text).join('\n')
  const corpus = PROMPTS.map((p) => p.text).join('\n')
  const headingLabels = (all.match(/——\s*\{\{\s*roleLabel\s*\}\}/g) || []).length
  ok(headingLabels > 0, 'the bridge substitutes the reader-facing role label in headings, which is a rendering fix rather than a content change', { headingLabels })
  ok(/\{\{\s*role\s*\}\}/.test(corpus) && !/——\s*\{\{\s*role\s*\}\}/.test(all),
    'while the corpus keeps the bare kind key, so the deviation is visible in one direction only', {})
}

console.log('=== CORPUS IS BASELINE NOT TEMPLATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
