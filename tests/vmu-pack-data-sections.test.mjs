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
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

console.log('=== 4. EVERY PACK RESOLVES THROUGH THE FOLDER PATH THE LOADER PREFERS ===')
{
  // A PACK IS A FOLDER, and this is the machine proof rather than the claim. The loader prefers packs/<id>/index.js and
  // only falls back to packs/<id>.js when that import fails - so a loose pack file was using the compatibility path, and
  // the philosophy held only for the packs that happened to be folders. Every directory under packs/ must resolve
  // through the preferred path and expose a manifest with an id.
  const packsDir = join(here, '..', 'vibe-math-vmu', 'packs')
  const entries = readdirSync(packsDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const loose = entries.filter((e) => e.isFile()).map((e) => e.name)
  ok(loose.length === 0, 'packs/ holds NO loose files, so no pack uses the loaders compatibility fallback', { loose })
  const bad = []
  const ids = []
  const dataOnly = []
  const twoRecords = []
  for (const id of dirs) {
    // TWO LEGITIMATE SHAPES. A pack with behaviour carries an `index.js` manifest; a pack that only contributes TEXT or
    // DEFAULTS needs no manifest at all, because the plugin reads its data by name from the active packs list. A folder
    // that is neither is the thing worth failing on.
    let manifest = null
    let mod = null
    try {
      mod = await import(pathToFileURL(join(packsDir, id, 'index.js')).href)
      // THE LOADED MANIFEST IS `PACK`, and the plugin says so at its own load site (`loaded.PACK`). Reading it by that
      // name is the difference between checking the manifest that RUNS and checking one that merely exists - my first
      // version searched every export for an object with an id, so it found the folder record and never noticed that
      // the two are different objects with different ids.
      manifest = (mod.PACK && typeof mod.PACK.id === 'string') ? mod.PACK : null
    } catch (e) {
      if (!(e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND'))) { bad.push(id + ': ' + String(e.message).slice(0, 60)); continue }
    }
    if (manifest) {
      ids.push(manifest.id)
      if (mod.V5R_PACK) twoRecords.push(id + ': loaded=' + manifest.id + ' folder-record=' + mod.V5R_PACK.id)
      continue
    }
    const hasPromptData = existsSync(join(packsDir, id, 'prompts', 'sections.json'))
    const hasDefaults = existsSync(join(packsDir, id, 'settings', 'defaults.json'))
    if (hasPromptData || hasDefaults) dataOnly.push(id + (hasPromptData ? ' (prompt data)' : '') + (hasDefaults ? ' (defaults)' : ''))
    else bad.push(id + ': neither a manifest nor data the plugin reads by name')
  }
  ok(bad.length === 0 && dirs.length >= 4,
    'every folder under packs/ is one of the TWO legitimate shapes - a manifest at <id>/index.js, or data the plugin reads by name - which is what makes "a pack is a folder" true for ALL of them rather than most',
    { folders: dirs, manifests: ids, dataOnly, bad })
  // THE LOADED MANIFEST AND THE FOLDER RECORD ARE DIFFERENT OBJECTS. v5r's loaded id is `v5r-core` while its folder
  // record says `v5r`, and the four fields the folder record carries - the prompt sections, the policy, the notices and
  // the phases - are invisible to the loader, because validatePack ignores unknown keys by design. A field on a loaded
  // manifest that nothing reads fails SILENTLY, which is the hazard docs/10 names, so the ids are asserted to differ
  // rather than to coincide, and the description is asserted to surface what the folder carries.
  const v5rMod = await import(pathToFileURL(join(packsDir, 'v5r', 'index.js')).href)
  const carried = v5rMod.describeV5rPack().carried
  ok(v5rMod.PACK.id !== v5rMod.V5R_PACK.id,
    'the loaded manifest and the folder-level record are two objects with two ids, which is exactly why those contribution fields need a consumer rather than a place to sit',
    { loaded: v5rMod.PACK.id, folderRecord: v5rMod.V5R_PACK.id, twoRecords })
  ok(carried && typeof carried.promptSections === 'string' && Array.isArray(carried.phases) && carried.phases.length >= 1,
    'and describeV5rPack() SURFACES what the folder carries - prompt sections, policy, notices, phases - so those fields have a reader instead of looking consumed while doing nothing',
    { carried })
}

console.log('=== PACK DATA SECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
