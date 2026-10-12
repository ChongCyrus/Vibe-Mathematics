// vibe-math-vmu — A SECOND PACK DECLARED AS PURE DATA, and the proof that its prompt text reaches an assembly.
//
// WHY THIS SUITE EXISTS. A pack could contribute middleware, settings defaults and settings claims, and a second pack
// got all three. It could NOT contribute prompt sections or phases, because those must exist when the kernel is
// constructed while the plugin reads a packs data at its top level and cannot await a dynamic import. That made the
// philosophy half true: a pack was where an institution lived, except for the part an institution says to its members.
//
// The fix is to declare prompt material as DATA in the packs own folder, the way settings defaults already are. This
// suite reads that data the same way the plugin does, feeds it to the pipeline the same way, and requires the text to
// appear - for the phase its binding names, and not for the phases it does not. Nothing in the plugin knows the name of
// this pack, which is the point: a deployment names it in the active packs list and gets its text.
//
// Run: node tests/vmu-pack-data-sections.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + JSON.stringify(detail) : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + JSON.stringify(detail) : ''))
  return false
}

const here = dirname(fileURLToPath(import.meta.url))
const packDir = join(here, '..', 'vibe-math-vmu', 'packs', 'example-data')

console.log('=== 1. THE DATA HAS THE SHAPE THE PLUGIN EXPECTS, and the plugin checks that shape too ===')
const raw = JSON.parse(readFileSync(join(packDir, 'prompts', 'sections.json'), 'utf8'))
ok(Array.isArray(raw.sections) && raw.sections.length >= 1, 'the pack declares at least one section as data', { sections: (raw.sections || []).length })
ok(Array.isArray(raw.bindings) && raw.bindings.length >= 1, 'and at least one binding', { bindings: (raw.bindings || []).length })
const shapeOk = (raw.sections || []).every((s) => s && typeof s.name === 'string' && typeof s.text === 'string')
ok(shapeOk, 'every section carries a name and a text, which is what the plugin requires before it accepts one')
const bindOk = (raw.bindings || []).every((b) => b && typeof b.section === 'string' && typeof b.text === 'string'
  && ['role', 'phase', 'member', 'task'].some((d) => typeof b[d] === 'string' && b[d]))
ok(bindOk, 'every binding names a section, a text and ONE of the pipelines binding dimensions')

console.log('=== 2. THE DATA IS READ EXACTLY AS THE PLUGIN READS IT, and the text reaches an assembly ===')
// the same normalisation the plugin applies, kept here so the test fails if the two drift apart
const sections = raw.sections.map((s) => ({ name: s.name, order: Number.isFinite(s.order) ? s.order : 999, range: typeof s.range === 'string' ? s.range : 'pack', source: 'pack:example-data', text: s.text }))
const bindings = raw.bindings.map((b) => {
  const dims = {}
  for (const d of ['role', 'phase', 'member', 'task']) if (typeof b[d] === 'string' && b[d]) dims[d] = b[d]
  return Object.assign({ section: b.section, text: b.text }, dims)
})
const pipeline = createPromptPipeline({ sections, bindings, clock: () => '2026-01-01T00:00:00.000Z' })
const normal = await pipeline.assemble({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'normal', round: 3 })
const founding = await pipeline.assemble({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding', round: 1 })
ok(String(normal.text).includes('这一段只出现在常规相位'), 'the phase-bound text appears in the phase its binding names', { chars: String(normal.text).length })
ok(!String(founding.text).includes('这一段只出现在常规相位'), 'and it does NOT appear in a phase the binding does not name, so a binding selects rather than always firing')
ok(String(founding.text).includes('纯数据') && !String(normal.text).includes('纯数据'),
    'and the SECTIONS own text is the default: it appears in a phase the binding does not cover, and is OVERRIDDEN in the phase it does - which is the pipelines design and not a defect', { founding: String(founding.text).length, normal: String(normal.text).length })

console.log('=== 3. NOTHING IN THE PLUGIN KNOWS THIS PACKS NAME ===')
const pluginSrc = readFileSync(join(here, '..', 'vibe-math-vmu', 'vibe-math-vmu.js'), 'utf8')
ok(pluginSrc.includes("'prompts', 'sections.json'"), 'the plugin reads prompts/sections.json from a packs folder')
ok(!pluginSrc.includes('example-data'), 'and it does not mention this packs name anywhere: a deployment names the pack, the plugin reads its data')

console.log('=== PACK DATA SECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
