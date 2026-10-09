// vmu settings — the capability scenario for settings/schema.js (docs/04).
//
// This is the first vmu test job. It proves the four-可 contract (docs/01 R3: declarable, readable,
// changeable, auditable) at the level the module can prove on its own, and it is written so that the
// guard can be shown to FAIL: `--self-probe` re-runs the whole file against a deliberately broken
// carrier and against a deliberately permissive resolver, and requires the failures to appear.
//
// What must hold (docs/04 §10):
//   · one declaration per key, and every key declares hot class / who / doc (04 §5, §11);
//   · reading an UNDECLARED key is refused by name, never defaulted (R4);
//   · domain and shape violations are refused by name (R11);
//   · user-supplied instants are refused; framework-owned budgets are not (01 §3.1 I-3);
//   · the outward JSON Schema is DERIVED from the same table and closes the surface (04 §3);
//   · the carrier is injected; a missing carrier is refused by name, never faked (03 §8);
//   · layering pack-default < config < session < runtime, with provenance (04 §4);
//   · a layer with an undeclared key is refused, never merged into a phantom setting.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SELF_PROBE = process.argv.includes('--self-probe')

const target = pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href
const m = await import(target)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = (fn, code, name) => {
  try { fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

// ---- 1. the declaration table ------------------------------------------------------------------
const defs = m.SETTING_DEFS
ok(Array.isArray(defs) && defs.length >= 28, 'the table declares the documented key set', defs.length)
const keys = defs.map((d) => d.key)
ok(new Set(keys).size === keys.length, 'every key is unique')
ok(keys.every((k) => /^vmu\.[a-z]+\.[A-Za-z]+$/.test(k)), 'every key is namespaced vmu.<area>.<name>')
ok(defs.every((d) => ['H0', 'H1', 'H2', 'H3'].includes(d.hot)), 'every key declares a hot-reload class (04 §5)')
ok(defs.every((d) => typeof d.who === 'string' && d.who.length > 0), 'every key declares who may change it')
ok(defs.every((d) => typeof d.doc === 'string' && d.doc.length > 0), 'every key carries a one-line doc (04 §11)')
ok(defs.every((d) => (d.type === 'enum' ? Array.isArray(d.domain) && d.domain.length > 0 : true)), 'every enum declares its domain')
ok(defs.filter((d) => d.hot === 'H3').length > 0, 'the read-only class is actually used (storeBackend, pathPolicy)')

// ---- 1b. the documented table and the schema must be the SAME set (04-§11 discipline ①) ---------
// The discipline used to be prose ("表内键集合 ≡ schema 键集合（无多无少）"). It is now executable: the
// parameter table in docs/04 §11 is parsed and compared BOTH ways, so neither a key without a row nor a
// row without a key can pass. This is the settings equivalent of the docs<->module guard (D16).
{
  const doc = readFileSync(resolve(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
  const tableRows = [...doc.matchAll(/^\| `(vmu\.[a-z]+\.[A-Za-z]+)`/gm)].map((x) => x[1])
  const documented = new Set(tableRows)
  const declared = new Set(keys)
  const rowsWithoutKey = [...documented].filter((k) => !declared.has(k))
  const keysWithoutRow = [...declared].filter((k) => !documented.has(k))
  ok(rowsWithoutKey.length === 0, 'every documented key exists in the schema (no phantom rows)', rowsWithoutKey.join(','))
  ok(keysWithoutRow.length === 0, 'every schema key has a documented row (no undocumented knobs)', keysWithoutRow.join(','))
  ok(tableRows.length === declared.size, 'the table and the schema declare the same NUMBER of keys',
    tableRows.length + ' vs ' + declared.size)
}

// ---- 2. undeclared keys are defects (R4) -------------------------------------------------------
expectThrow(() => m.assertDeclared('vmu.nope.x'), 'VMU_INVALID_ARGUMENT', 'undeclared key refused by name')
expectThrow(() => m.validateValue('vmu.nope.x', 1), 'VMU_INVALID_ARGUMENT', 'validating an undeclared key is refused')
ok(m.assertDeclared('vmu.limits.maxLiveMembers').def === 0, 'a declared key returns its definition')
expectThrow(() => m.resolveSettings([{ 'vmu.typo.key': 1 }]), 'VMU_INVALID_ARGUMENT',
  'a layer carrying an undeclared key is refused, never merged')

// ---- 3. shape and domain refusals (R11) --------------------------------------------------------
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', -1), 'VMU_INVALID_ARGUMENT', 'negative natural refused')
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', 1.5), 'VMU_INVALID_ARGUMENT', 'fractional natural refused')
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', '6'), 'VMU_INVALID_ARGUMENT', 'stringified natural refused')
ok(m.validateValue('vmu.limits.maxLiveMembers', 6) === 6, 'an in-range natural passes through')
expectThrow(() => m.validateValue('vmu.meetings.quorumRule', 'bogus'), 'VMU_INVALID_ARGUMENT', 'out-of-domain enum refused')
ok(m.validateValue('vmu.meetings.quorumRule', 'all-unanimous') === 'all-unanimous', 'in-domain enum passes through')
expectThrow(() => m.validateValue('vmu.prompts.overridesDir', 'D:/outside'), 'VMU_INVALID_ARGUMENT', 'absolute path refused')
expectThrow(() => m.validateValue('vmu.records.tracks', [1, 2]), 'VMU_INVALID_ARGUMENT', 'non-string list refused')
expectThrow(() => m.validateValue('vmu.middleware.entries', [null]), 'VMU_INVALID_ARGUMENT', 'non-object entry refused')

// ---- 4. time belongs to the framework (01 §3.1 I-3) --------------------------------------------
expectThrow(() => m.assertNoUserTime('vmu.custom.deadlineAt'), 'VMU_NOT_PERMITTED', 'user-supplied instant refused')
expectThrow(() => m.assertNoUserTime('vmu.custom.runDeadline'), 'VMU_NOT_PERMITTED', 'user-supplied deadline refused')
m.assertNoUserTime('vmu.limits.wallClockMs')
ok(true, 'a declared budget key is allowed (budgets are settings, instants are not)')

// ---- 5. the outward JSON Schema is derived, and closes the surface -----------------------------
const js = m.toJsonSchema()
ok(Object.keys(js.properties).length === keys.length, 'JSON Schema covers exactly the declarations')
ok(Object.keys(js.properties).every((k) => keys.includes(k)), 'JSON Schema invents no key')
ok(keys.every((k) => Object.hasOwn(js.properties, k)), 'every declaration reaches the JSON Schema')
ok(js.additionalProperties === false, 'JSON Schema closes the surface (no phantom keys)')
ok(js.properties['vmu.meetings.quorumRule'].enum.join('|') === 'm-unanimous|all-unanimous', 'enum projected to JSON Schema')
ok(js.properties['vmu.limits.maxLiveMembers'].minimum === 0, 'numeric lower bound projected')
ok(js.properties['vmu.limits.toolCallsPerTurnCap'].default === 0, 'harmless default projected (0 = unlimited)')
ok(js.properties['vmu.core.storeBackend']['x-vmu-hot'] === 'H3', 'hot class is carried outwards')
ok(js.properties['vmu.packs.active'].default.length === 0, 'defaults are "do nothing" (empty pack list)')

// ---- 6. the carrier is injected; absence is named -----------------------------------------------
expectThrow(() => m.buildSchemastery(null), 'VMU_ENGINE_UNAVAILABLE', 'a missing carrier is refused by name')
expectThrow(() => m.buildSchemastery({ object: () => ({}) }), 'VMU_ENGINE_UNAVAILABLE', 'an incomplete carrier is refused')
const fake = {
  object: (o) => ({ kind: 'object', o }),
  boolean: () => ({ default: (v) => ({ d: v }) }),
  number: () => ({ min: () => ({ step: () => ({ default: (v) => ({ d: v }) }) }) }),
  string: () => ({ default: (v) => ({ d: v }) }),
  array: (x) => ({ x, default: (v) => ({ d: v }) }),
  any: () => ({}),
  union: (xs) => ({ xs, default: (v) => ({ d: v }) }),
  const: (v) => ({ c: v }),
}
let built = null
if (SELF_PROBE) {
  try { built = m.buildSchemastery({}) } catch { built = null } // deliberately broken: must fail below
} else {
  built = m.buildSchemastery(fake)
}
ok(built && built.kind === 'object' && built.o && built.o.vmu && built.o.vmu.limits,
  'dots become nesting in the carrier build')

// ---- 7. layering, defaults and provenance (04 §4) ----------------------------------------------
const layers = SELF_PROBE
  ? [{ 'vmu.limits.maxLiveMembers': 6 }]
  : [{ 'vmu.limits.maxLiveMembers': 6 }, { 'vmu.meetings.quorumRule': 'all-unanimous' }]
const r = m.resolveSettings(layers)
ok(r.values['vmu.limits.maxLiveMembers'] === 6, 'a later layer wins')
ok(r.values['vmu.core.enabled'] === true, 'untouched keys keep their harmless default')
ok(r.values['vmu.meetings.quorumRule'] === 'all-unanimous', 'a second layer applies')
ok(Array.isArray(r.provenance['vmu.limits.maxLiveMembers']), 'provenance is recorded for changed keys')
ok(r.provenance['vmu.core.enabled'] === undefined, 'provenance is absent for untouched keys (default path)')

// ---- 8. self-probe -----------------------------------------------------------------------------
if (SELF_PROBE) {
  ok(failed > 0, 'self-probe: the deliberately broken carrier/resolver produced failures', failed)
  console.log('=== VMU SETTINGS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU SETTINGS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
