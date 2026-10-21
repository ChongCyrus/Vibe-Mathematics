// tests/audit-declaration-publishes-face.mutants.mjs — Round 6 / task-42 A: the "declaration really publishes the
// face" assertion must be FALSIFIABLE. Round 5 taught that a mechanism can merge correctly and still publish
// nothing, so a green publication test proves nothing unless losing the declaration turns it red.
//
// The probe boots the REAL entry through `apply(ctx, config)` and records, for each spelling, exactly which
// `vibe_vmu_*` tools reached `ctx.tools.register` - plus whether a malformed key was warned about. Each mutation
// below must destroy ONE named field:
//   M1 the dotted-key pass stops accepting keys            ⇒ `dotted` loses its faces
//   M2 the nested-tree flattening is disabled              ⇒ `nested` loses its faces
//   M3 the warning call is silenced                        ⇒ `malformedWarned` goes false
// Runs through the shared library (`tests/_lib/falsify.mjs`), so it inherits MUTATION-NOT-APPLIED /
// MUTANT-UNIMPORTABLE / REAL-MODULE-NOT-GREEN / PROBE-DOES-NOT-DISCRIMINATE / temp-dir safety.
// NOTE: the entry has relative imports; the library rewrites them to absolute file:// URLs, so a copied mutant
// still imports the ORIGINAL sibling modules - only the mutated file differs.
//
// Run: node tests/audit-declaration-publishes-face.mutants.mjs
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { falsify, formatReport } from './_lib/falsify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SOURCE = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

/** Boot the entry with one row config and report what it PUBLISHED (and warned about). */
async function boot(mod, config) {
  const state = { specs: [], warnings: [] }
  const ctx = {
    logger: { warn: (s) => state.warnings.push(String(s)), error: () => {} },
    get: () => undefined,
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  mod.apply(ctx, config)
  await new Promise((r) => setTimeout(r, 0))
  const faces = state.specs.map((s) => s.name)
  return { faces, warnings: state.warnings }
}
const facesOnly = (r) => r.faces.filter((n) => n !== 'vibe_vmu_set').sort()

/** The observable reading: four boots, four facts. */
async function probe(mod) {
  const clean = await boot(mod, { clock: () => 0 })
  const dotted = await boot(mod, { clock: () => 0, vmu: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true } })
  const nested = await boot(mod, { clock: () => 0, vmu: { tools: { faces: ['*'], allowAll: true } } })
  const malformed = await boot(mod, { clock: () => 0, vmu: { 'vmu.tools..faces': ['*'] } })
  return {
    cleanFaces: facesOnly(clean),
    dottedFaces: facesOnly(dotted),
    nestedFaces: facesOnly(nested),
    malformedWarned: malformed.warnings.some((w) => w.includes('vmu.tools..faces')),
    malformedFaces: facesOnly(malformed),
  }
}

const MUTATIONS = [
  { label: 'the dotted-key pass stops accepting keys (a dotted declaration is silently dropped)',
    find: "if (typeof k !== 'string' || !k.startsWith('vmu.')) continue",
    replace: 'if (true) continue' },
  { label: 'the nested-tree flattening is disabled (the overlay recipe\'s spelling is silently dropped)',
    find: 'if (namespaced) {', replace: 'if (false) {' },
  { label: 'the warning call is silenced (an unresolvable key stops being named)',
    find: 'try { ctx.logger?.warn?.(line) } catch', replace: 'try { void line } catch' },
]

const report = await falsify({ name: 'declaration ⇒ published face (vibe-math-vmu entry)', module: SOURCE, mutations: MUTATIONS, probe })
console.log(formatReport(report))

let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const byLabel = new Map(report.results.map((r) => [r.label, r]))

// CONTROL: on the REAL entry all four facts hold - otherwise "every mutant differs" would prove nothing.
{
  const r = report.real
  ok(!!r && r.cleanFaces.join(',') === 'vibe_vmu_status',
    'CONTROL: no declaration ⇒ exactly the status face (the D-01 red line)', r && r.cleanFaces)
  ok(!!r && r.dottedFaces.join(',') === r.nestedFaces.join(',') && r.dottedFaces.length > 3,
    'CONTROL: the dotted and nested spellings publish the SAME, non-trivial face set', r && { dotted: r.dottedFaces, nested: r.nestedFaces })
  ok(!!r && r.malformedWarned === true && r.malformedFaces.join(',') === 'vibe_vmu_status',
    'CONTROL: a malformed key is warned about AND publishes nothing', r && { warned: r.malformedWarned, faces: r.malformedFaces })
}

// Each mutation must break the ONE field its label names.
{
  const m1 = byLabel.get(MUTATIONS[0].label)
  ok(!!m1 && m1.falsified && JSON.stringify(m1.red.dottedFaces) !== JSON.stringify(report.real.dottedFaces),
    '★ M1 (dotted pass broken) is falsified: the dotted declaration no longer publishes its faces',
    m1 && { dotted: m1.red.dottedFaces })
  const m2 = byLabel.get(MUTATIONS[1].label)
  ok(!!m2 && m2.falsified && JSON.stringify(m2.red.nestedFaces) !== JSON.stringify(report.real.nestedFaces),
    '★ M2 (nested flattening broken) is falsified: the nested spelling - what the overlay recipe writes - no longer publishes',
    m2 && { nested: m2.red.nestedFaces })
  const m3 = byLabel.get(MUTATIONS[2].label)
  ok(!!m3 && m3.falsified && m3.red.malformedWarned === false,
    '★ M3 (warning silenced) is falsified: an unresolvable key stops being NAMED',
    m3 && { warned: m3.red.malformedWarned })
}
ok(report.ok,
  'every declared mutation applied, imported, produced a DIFFERENT reading, and its copy was cleaned up (library verdict)',
  report.problems)

console.log('')
console.log('=== DECLARATION→PUBLICATION MUTANTS: ' + (failed === 0 ? 'GREEN' : 'RED (' + failed + ' failed)') + ' ===')
process.exit(failed === 0 ? 0 : 1)
