// tests/audit-declaration-publishes-face.test.mjs — Round 6 / task-42 A: "a DECLARATION really PUBLISHES the face".
//
// WHY THIS FILE EXISTS. Round 5 proved the overlay's registration-time merge (21/0) and still shipped a host where
// only `vibe_vmu_status` reached the model: the declaration merged into the inner row but the ENTRY never turned it
// into a published tool. Nothing asserted that last step. This file drives the REAL entry `apply(ctx, config)` and
// reads exactly what the entry hands to the host (`ctx.tools.register`), which is the same list the host later puts
// into `request/header.tools` (the cross-check a live run can make).
//
// It also pins the two shapes a YAML author actually writes - the dotted settings form and the nested tree the
// overlay recipe uses - as EQUIVALENT, and requires an unresolvable key to be NAMED rather than silently dropped
// (silent-drop is the failure class this repository's `docs/11 §4.2` rule targets).
//
// Run: node tests/audit-declaration-publishes-face.test.mjs
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as entry from '../vibe-math-vmu/vibe-math-vmu.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

/** The minimum a real host gives this entry: a tool registry, an effect scope, an event bus and a logger. */
function fakeCtx() {
  const state = { specs: [], warnings: [], errors: [], effects: [], listeners: {} }
  const ctx = {
    logger: {
      warn: (s) => state.warnings.push(String(s)),
      error: (s) => state.errors.push(String(s)),
    },
    get: () => undefined,
    effect: (fn, label) => { state.effects.push(label); return fn() },
    on: (event, handler) => { (state.listeners[event] = state.listeners[event] || []).push(handler); return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  return { ctx, state }
}

/** Boot the real entry with a row config and report what it PUBLISHED. */
async function boot(config) {
  const host = fakeCtx()
  const handle = entry.apply(host.ctx, config)
  // ⚠️ The adapter's install chain is ASYNC and `handle.ready()` does NOT await it (measured by vmu-core), so the
  // registry is read after a short settle - reading too early would misreport "the face was not published".
  await new Promise((r) => setTimeout(r, 60))
  return { names: host.state.specs.map((s) => s.name), warnings: host.state.warnings, handle, state: host.state }
}

const vmuFaces = (names) => names.filter((n) => n.startsWith('vibe_vmu_')).sort()

// ── 1. D-01 red line: no declaration ⇒ exactly ONE tool
console.log('=== 1. no declaration (D-01: the inert default must stay one tool) ===')
{
  const r = await boot({ clock: () => 0 })
  ok(r.names.length === 1 && r.names[0] === 'vibe_vmu_status',
    '★ with NO declaration exactly one tool is published (vibe_vmu_status) - the zero-mechanism red line', r.names)
  ok(r.warnings.length === 0, 'and nothing is warned about (a bare row is legitimate)', r.warnings)
  ok(Array.isArray(r.handle.settingsUnparsed()) && r.handle.settingsUnparsed().length === 0,
    'the handle self-discloses an EMPTY settingsUnparsed()', r.handle.settingsUnparsed())
}

// ── 1b. an EMPTY namespace is still the red line: one tool, zero warnings
console.log('=== 1b. an empty namespace declares nothing (still one tool, still no warning) ===')
{
  const empty = await boot({ clock: () => 0, vmu: {} })
  ok(empty.names.length === 1 && empty.names[0] === 'vibe_vmu_status',
    '★ `{ vmu: {} }` publishes exactly the status tool (an empty namespace is a legitimate, inert row)', empty.names)
  ok(empty.warnings.length === 0, 'and it is NOT warned about', empty.warnings)
}

// ── 2. the DOTTED settings form ⇒ the faces are really published
console.log('=== 2. dotted declaration (vmu.tools.faces) ===')
let dotted = null
{
  dotted = await boot({ clock: () => 0, vmu: { 'vmu.tools.faces': ['*'] } })
  ok(dotted.names.includes('vibe_vmu_chat') && dotted.names.includes('vibe_vmu_panel') && dotted.names.includes('vibe_vmu_report'),
    '★ a DOTTED declaration publishes the faces: chat + panel + report appear in ctx.tools', vmuFaces(dotted.names))
  ok(dotted.names.length > 3, 'and more than the status face is published', dotted.names.length)
  ok(dotted.warnings.length === 0, 'with no warning (a well-formed key is not a finding)', dotted.warnings)
}

// ── 3. the NESTED tree (what the overlay recipe writes) ⇒ THE SAME faces
console.log('=== 3. nested declaration (vmu: { tools: { faces: [...] } }) ===')
{
  const nested = await boot({ clock: () => 0, vmu: { tools: { faces: ['*'] } } })
  ok(JSON.stringify(vmuFaces(nested.names)) === JSON.stringify(vmuFaces(dotted.names)),
    '★ the NESTED shape publishes EXACTLY the same vmu faces as the dotted shape (one contract, two spellings)',
    { nested: vmuFaces(nested.names), dotted: vmuFaces(dotted.names) })
  ok(nested.warnings.length === 0, 'and the nested shape is not warned about either', nested.warnings)
}

// ── 2b/3b. a FAMILY key (not the universal `faces` list) must also reach a face, in BOTH spellings
console.log('=== 2b/3b. a family declaration (vmu.report.*) publishes that face in both spellings ===')
{
  const dottedFamily = await boot({ clock: () => 0, vmu: { 'vmu.report.enabled': true } })
  ok(dottedFamily.names.includes('vibe_vmu_report'),
    '★ a DOTTED family key publishes its own face (vibe_vmu_report), not just the universal faces list', vmuFaces(dottedFamily.names))
  const nestedFamily = await boot({ clock: () => 0, vmu: { report: { enabled: true } } })
  ok(nestedFamily.names.includes('vibe_vmu_report'),
    '★ and the NESTED family key publishes the same face (the overlay recipe\'s spelling)', vmuFaces(nestedFamily.names))
  ok(JSON.stringify(vmuFaces(dottedFamily.names)) === JSON.stringify(vmuFaces(nestedFamily.names)),
    'the two spellings agree for a family key too', { dotted: vmuFaces(dottedFamily.names), nested: vmuFaces(nestedFamily.names) })
}

// ── 4. an UNPARSABLE key (fails the dotted-key shape) ⇒ NAMED (logger + handle) and NOT published
console.log('=== 4. an unresolvable key is NAMED, never silently dropped ===')
{
  // `vmu.tools..faces` cannot become a setting: the parser's key shape is /^vmu\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/.
  const bad = await boot({ clock: () => 0, vmu: { 'vmu.tools..faces': ['*'] } })
  ok(vmuFaces(bad.names).join(',') === 'vibe_vmu_status',
    '★ a key nobody can resolve publishes NOTHING extra (no face leaks through a malformed key)', vmuFaces(bad.names))
  ok(bad.warnings.some((w) => w.includes('vmu.tools..faces')),
    '★ and it is NAMED on the host logger (the line carries the offending key)', bad.warnings)
  ok(bad.handle.settingsUnparsed().some((u) => String(u.path).includes('vmu.tools..faces')),
    '★ and self-disclosed through the handle (settingsUnparsed()), so the drop is answerable', bad.handle.settingsUnparsed())
}
// ── 4b. a WELL-FORMED but unknown key: the parser's job is the SHAPE, not the schema (no false warning)
console.log('=== 4b. a well-formed key that no face consumes ===')
{
  const unknown = await boot({ clock: () => 0, vmu: { 'vmu.tools.facez': ['*'] } })
  const faces = vmuFaces(unknown.names).filter((n) => n !== 'vibe_vmu_set')
  ok(faces.join(',') === 'vibe_vmu_status',
    'a well-formed unknown key declares no FACE (status only; `vibe_vmu_set` appears because a settings key was declared at all)', vmuFaces(unknown.names))
  ok(unknown.warnings.length === 0,
    'and it is NOT warned about: the parser cannot know the schema, so it must not cry wolf (schema-level unknown-key checks are a different gate)',
    unknown.warnings)
}

// ── 4c. ALL THREE unparsable kinds at once: an empty object leaf, a function, and a bad-shape dotted key
console.log('=== 4c. three unparsable kinds ⇒ three named entries, counts agree with status() ===')
{
  const mixed = await boot({ clock: () => 0, vmu: { tools: {}, broken: { fn: () => 1 }, 'vmu.bad-key!': 1 } })
  const unparsed = mixed.handle.settingsUnparsed()
  ok(unparsed.length === 3,
    '★ an empty object leaf, a function value and a bad-shape dotted key each produce EXACTLY one named entry', unparsed)
  ok(unparsed.some((u) => String(u.path) === 'vmu.tools' || String(u.path).includes('tools')),
    'the empty object leaf is named', unparsed)
  ok(unparsed.some((u) => String(u.why || '').includes('function')),
    'the function value is named AS a function (not silently dropped)', unparsed)
  ok(unparsed.some((u) => String(u.path).includes('bad-key')),
    'the bad-shape dotted key is named', unparsed)
  ok(mixed.warnings.length === 3, 'and the host logger received one warning per entry', mixed.warnings)
  const st = mixed.handle.status()
  ok(Array.isArray(st.settingsUnparsed) && st.settingsUnparsed.length === unparsed.length,
    '★ status().settingsUnparsed agrees with the handle accessor (the count is self-disclosed)', st.settingsUnparsed)
  ok(vmuFaces(mixed.names).filter((n) => n !== 'vibe_vmu_set').join(',') === 'vibe_vmu_status',
    'and none of them published a face', vmuFaces(mixed.names))
}

// ── 5. the same key in BOTH shapes ⇒ dotted wins, and the conflict is disclosed
console.log('=== 5. one key declared twice in two shapes ===')
{
  const both = await boot({ clock: () => 0, vmu: { 'vmu.tools.faces': ['*'], tools: { faces: [] } } })
  ok(vmuFaces(both.names).includes('vibe_vmu_chat'),
    '★ the DOTTED key wins, so the faces declared by it are still published', vmuFaces(both.names))
  ok(both.handle.settingsConflicts().some((c) => String(c.key) === 'vmu.tools.faces'),
    '★ and the conflict is disclosed through the handle', both.handle.settingsConflicts())
}

// ── 6. the published list is stable across two boots (no order/caching artefact in the assertion itself)
console.log('=== 6. determinism ===')
{
  const a = await boot({ clock: () => 0, vmu: { tools: { faces: ['*'] } } })
  const b = await boot({ clock: () => 0, vmu: { tools: { faces: ['*'] } } })
  ok(JSON.stringify(a.names) === JSON.stringify(b.names), 'two identical boots publish identical tool lists', { a: a.names, b: b.names })
}

console.log('')
console.log('=== DECLARATION PUBLISHES FACE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
