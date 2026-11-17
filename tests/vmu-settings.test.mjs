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
import { resolve, join } from 'node:path'
import { readFileSync, readdirSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SELF_PROBE = process.argv.includes('--self-probe')

// ★ C#3: pack-owned namespaces are declared by the PACKS now — load their declarations before reading the ONE table.
import '../vibe-math-vmu/packs/v3/settings/declarations.js'
import '../vibe-math-vmu/packs/v3-core/settings/declarations.js'
import '../vibe-math-vmu/packs/v5r/settings/declarations.js'
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
ok(keys.every((k) => /^vmu\.[a-z][a-z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(k)),
  'every key is namespaced vmu.<area>.<name>[.<name>…] (any depth: the design set declares deep keys)')
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
  // ANY DEPTH, and the SAME pattern the docs audit uses. The old `[a-z]+\.[A-Za-z]+` matched three-letter-only
  // third segments, so the 4+ segment planned keys (`vmu.math.precision.digits`) were invisible to this check
  // and the count disagreed with the schema the moment the design set declared deep keys (404 vs 258).
  const tableRows = [...doc.matchAll(/^\| `(vmu\.[a-zA-Z0-9.]+)`/gm)].map((x) => x[1])
  const documented = new Set(tableRows)
  const declared = new Set(keys)
  const rowsWithoutKey = [...documented].filter((k) => !declared.has(k))
  const keysWithoutRow = [...declared].filter((k) => !documented.has(k))
  ok(rowsWithoutKey.length === 0, 'every documented key exists in the schema (no phantom rows)', rowsWithoutKey.join(','))
  ok(keysWithoutRow.length === 0, 'every schema key has a documented row (no undocumented knobs)', keysWithoutRow.join(','))
  ok(tableRows.length === declared.size, 'the table and the schema declare the same NUMBER of keys',
    tableRows.length + ' vs ' + declared.size)
}

// ---- 1c. every settings key the RUNTIME reads must be DECLARED (the direction nobody checked) ----------
// The docs audit covers "a key the DOCS name must exist"; its G group covers "a key claimed wired must be read".
// Neither covers the reverse of the second: a module READING a key that no volume ever declared had no gate at
// all - `kernel/minutes.js` read three such keys (`vmu.minutes.detail`, `dissentRetentionMs`,
// `verbatimCapBytes`) and the registration chain, which runs docs -> registry, could never have seen them.
{
  const files = []
  const walk = (d, n) => {
    if (n > 4) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', 'docs', 'settings'].includes(e.name)) continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, n + 1)
      else if (e.name.endsWith('.js') && !['math-computation.js', 'math-engines.js'].includes(e.name)) files.push(p)
    }
  }
  walk(join(REPO, 'vibe-math-vmu'), 0)
  ok(files.length >= 12, 'the runtime modules were found for the read-side key audit', files.length)
  const read = new Map()
  // Exemptions, each with a reason (the gate must not punish legitimate shapes):
  //   · a PREFIX-ONLY literal (`'vmu.math.' + suffix`) is a template, not a key;
  //   · a PACK-OWNED namespace (`vmu.v3.*`, `vmu.v5r.*`, `vmu.example.*`) is declared BY THE PACK, by design -
  //     docs/10 §4 says a pack may own a namespace, and the schema deliberately does not list those.
  const PACK_OWNED = /^vmu\.(?:v[2-5]r?|example|lab)\./
  // NOT a read: `Symbol('vmu.settings.writers')` is a symbol DESCRIPTION in kernel/index.js, not a settings
  // lookup. Exempted by exact name so the exemption cannot drift into a blanket hole.
  const NOT_A_READ = new Set([
    'vmu.settings.writers',
    // ROUND 108: the five `vmu.ip.*` service surfaces. `kernel/ip.js` lists them in its DECLARED_KEYS table
    // beside the fifteen real knobs, and the module says so in words. A name in a table is not a lookup - the
    // same shape as the symbol description above.
    'vmu.ip.hold', 'vmu.ip.ownership', 'vmu.ip.contributors', 'vmu.ip.recordSearch', 'vmu.ip.transfer',
    // RUN 142 / audit10 C2: `vmu.library.record` and `vmu.library.append` are FACE.OP dispatch targets named in
    // prose (`FIELD_OWNERS` + the reply-field means), not settings lookups. Same shape as the `vmu.ip.*`
    // service surfaces above: a name in a sentence or a table is not a read. Exempted by exact name so the
    // exemption cannot drift into a blanket hole.
    'vmu.library.record', 'vmu.library.append',
    // RUN 150 / audit14 C-1+C-2: `vmu.tasks.create` and `vmu.meetings.motion` are FACE.OP dispatch targets named in
    // prose (the `taskCreateArgs` adapter's comment and the motion skip branch), not settings lookups - the same shape
    // as the two entries above. They are the two faces whose reply-field payloads this round had to adapt/skip by name.
    'vmu.tasks.create', 'vmu.meetings.motion',
  ])
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"`](vmu\.[a-zA-Z0-9.]+)['"`]/g)) {
      const k = m[1]
      // 3+ segments only: two-segment names are SERVICE names (`vmu.tasks`), not settings keys.
      if (k.split('.').length < 3) continue
      if (k.endsWith('.') || PACK_OWNED.test(k) || NOT_A_READ.has(k)) continue
      if (!read.has(k)) read.set(k, new Set())
      read.get(k).add(f.replace(REPO + '\\', '').replace(REPO + '/', ''))
    }
  }
  // ROUND 99: a name that is the PREFIX of another name is a namespace, not a key. The universe to judge
  // against is the schema keys plus everything this scan saw, because a root whose longer key is not in the
  // kernel text at all (`vmu.math.ad` above `vmu.math.ad.backend`) is only recognisable that way. Two passes.
  {
    const universe = new Set([...keys, ...read.keys()])
    for (const k of [...read.keys()]) {
      // ROUND 224: TWO ways a name is not a key. (a) some other key lives under it - it is a namespace; (b) it was written
      // as a family, i.e. followed by `.*` or `…`, possibly after the dot the key regex stopped at - the generator learned
      // both rules this round when eight namespace names were being minted as settings.
      if ([...universe].some((o) => o !== k && o.startsWith(k + "."))) read.delete(k)
    }
    for (const k of [...read.keys()]) {
      if (/[*…]/.test(k)) read.delete(k)
    }
  }
  ok(read.size >= 20, 'the read-side scan found the keys the runtime actually reads', read.size)
  // `declared` lives inside section 1b's block; `keys` is the top-level list of every schema key.
  const declaredKeys = new Set(keys)
  const undeclared = [...read.keys()].filter((k) => !declaredKeys.has(k)).sort()
  ok(undeclared.length === 0, 'every settings key the runtime READS is declared in settings/schema.js',
    undeclared.slice(0, 8).map((k) => k + ' (' + [...read.get(k)].slice(0, 1).join('') + ')').join(' | '))
}

// ---- 2. undeclared keys are defects (R4) -------------------------------------------------------
expectThrow(() => m.assertDeclared('vmu.nope.x'), 'VMU_INVALID_ARGUMENT', 'undeclared key refused by name')
expectThrow(() => m.validateValue('vmu.nope.x', 1), 'VMU_INVALID_ARGUMENT', 'validating an undeclared key is refused')
ok(m.assertDeclared('vmu.limits.maxLiveMembers').def === 0, 'a declared key returns its definition')
// ★ C#3 residue (TB-2792 round 7): an undeclared key in an UNREGISTERED non-framework namespace is the PRECISE
// named code (`VMU_SETTING_NAMESPACE_UNKNOWN`) — a typo inside a FRAMEWORK namespace stays VMU_INVALID_ARGUMENT.
expectThrow(() => m.resolveSettings([{ 'vmu.typo.key': 1 }]), 'VMU_SETTING_NAMESPACE_UNKNOWN',
  'a layer carrying a key in an unknown namespace is refused by the namespace code, never merged')
expectThrow(() => m.resolveSettings([{ 'vmu.turn.typoKey': 1 }]), 'VMU_INVALID_ARGUMENT',
  'a typo inside a FRAMEWORK namespace is still the plain undeclared-key refusal')

// ---- 3. shape and domain refusals (R11) --------------------------------------------------------
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', -1), 'VMU_INVALID_ARGUMENT', 'negative natural refused')
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', 1.5), 'VMU_INVALID_ARGUMENT', 'fractional natural refused')
expectThrow(() => m.validateValue('vmu.limits.maxLiveMembers', '6'), 'VMU_INVALID_ARGUMENT', 'stringified natural refused')
// ★ LIVE-RUN FRICTION (run 18 ⑪.0 / run 19): the institute passed `value: "8000"`. Refusing is right; refusing
// without naming the mistake is not — the quote marks are invisible in a transcript. The refusal must say that a
// quoted number is TEXT and show the unquoted form (measured, not assumed: the hint is read back here).
try {
  m.validateValue('vmu.meetings.waitOnDueMs', '8000')
  ok(false, 'a quoted number is refused (RULE E: the case below must be reachable)')
} catch (e) {
  ok(e && e.code === 'VMU_INVALID_ARGUMENT', 'a quoted number is refused with VMU_INVALID_ARGUMENT', e && e.code)
  ok(typeof e.hint === 'string' && /QUOTED number is a text value/.test(e.hint) && /pass 8000, not "8000"/.test(e.hint),
    '★ the refusal NAMES the quoting mistake and shows the fix (a bare "expected an integer" was not enough)', e && e.hint)
}
ok(m.validateValue('vmu.limits.maxLiveMembers', 6) === 6, 'an in-range natural passes through')
expectThrow(() => m.validateValue('vmu.meetings.quorumRule', 'bogus'), 'VMU_INVALID_ARGUMENT', 'out-of-domain enum refused')
ok(m.validateValue('vmu.meetings.quorumRule', 'all-unanimous') === 'all-unanimous', 'in-domain enum passes through')
expectThrow(() => m.validateValue('vmu.prompts.overridesDir', 'D:/outside'), 'VMU_INVALID_ARGUMENT', 'absolute path refused')
expectThrow(() => m.validateValue('vmu.records.tracks', [1, 2]), 'VMU_INVALID_ARGUMENT', 'non-string list refused')
expectThrow(() => m.validateValue('vmu.middleware.entries', [null]), 'VMU_INVALID_ARGUMENT', 'non-object entry refused')

// ---- 4. time belongs to the framework (01 §3.1 I-3) --------------------------------------------
expectThrow(() => m.assertNoUserTime('vmu.custom.deadlineAt'), 'VMU_NOT_PERMITTED', 'user-supplied instant refused')
expectThrow(() => m.assertNoUserTime('vmu.custom.runDeadline'), 'VMU_NOT_PERMITTED', 'user-supplied deadline refused')
// ★ REMOVED the always-pass assertion here: "a declared budget key is allowed" is a claim that this call does NOT
// throw, so assert exactly that instead of asserting the literal true.
let budgetKeyError = null
try { m.assertNoUserTime('vmu.limits.wallClockMs') } catch (e) { budgetKeyError = e }
ok(budgetKeyError === null, 'a declared budget key is allowed (budgets are settings, instants are not)', budgetKeyError && String(budgetKeyError.message))

// ---- 5. the outward JSON Schema is derived, and closes the surface -----------------------------
const js = m.toJsonSchema()
ok(Object.keys(js.properties).length === keys.length, 'JSON Schema covers exactly the declarations')
ok(Object.keys(js.properties).every((k) => keys.includes(k)), 'JSON Schema invents no key')
ok(keys.every((k) => Object.hasOwn(js.properties, k)), 'every declaration reaches the JSON Schema')
ok(js.additionalProperties === false, 'JSON Schema closes the surface (no phantom keys)')
ok(js.properties['vmu.meetings.quorumRule'].enum.join('|') === 'm-unanimous|all-unanimous', 'enum projected to JSON Schema')
ok(js.properties['vmu.limits.maxLiveMembers'].minimum === 0, 'numeric lower bound projected')
ok(js.properties['vmu.limits.toolCallsPerTurnCap'].default === 0, 'harmless default projected (0 = unlimited)')
ok(js.properties['vmu.core.storeBackend']['x-vmu-hot'] === 'H1', 'hot class is carried outwards (planned entry: generator default H1)')
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

// ---- 7b. C#4 / C#3 / C#15 / C#23 (TB-2792 Step 1b–1d) ------------------------------------------
{
  const eq = (a, b, name, detail) => ok(a === b, name, detail === undefined ? JSON.stringify(a) : detail)
  const { V5R_SETTING_DEFAULTS } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.js')).href)
  const defOf = (k) => m.SETTING_DEFS.find((d) => d.key === k)
  // C#4: the FRAMEWORK defaults are neutral; the v5r institution carries its own values in its own defaults.
  ok(JSON.stringify(defOf('vmu.records.tracks').def) === '[]',
    'C#4: framework vmu.records.tracks default is NEUTRAL (no pack track names)', defOf('vmu.records.tracks').def)
  eq(defOf('vmu.records.requireSettledRecords').def, false,
    'C#4: framework requireSettledRecords default is NEUTRAL false (no v5r policy)')
  ok(Array.isArray(V5R_SETTING_DEFAULTS['vmu.records.tracks']) && V5R_SETTING_DEFAULTS['vmu.records.tracks'].length > 0,
    'C#4: the v5r PACK supplies its own tracks (framework default moved to the pack)', V5R_SETTING_DEFAULTS['vmu.records.tracks'].length)
  ok(V5R_SETTING_DEFAULTS['vmu.records.requireSettledRecords'] === false,
    'C#4: the v5r pack supplies its own requireSettledRecords value', V5R_SETTING_DEFAULTS['vmu.records.requireSettledRecords'])

  // C#3: a pack registers its OWN namespace through the one seam; zero framework edit; unknown namespace named.
  const reg = m.registerPackSettings({ pack: 'c3-test-pack', namespace: 'vmu.c3test', defs: [
    { key: 'vmu.c3test.mode', type: 'enum', domain: ['a', 'b'], def: 'a', hot: m.HOT.H1, who: 'office', doc: 'C#3 测试命名空间的一个键' },
  ] })
  ok(reg && reg.ok === true && reg.added.includes('vmu.c3test.mode'), 'C#3: a pack namespace registers at runtime (zero framework edit)', reg)
  const screened = m.screenSettings({ 'vmu.c3test.mode': 'b' })
  eq(JSON.stringify(screened.accepted), JSON.stringify({ 'vmu.c3test.mode': 'b' }),
    'C#3: the pack key is ACCEPTED by the same screen every framework key goes through')
  // ★ C#3 residue: the SAME owner re-registering its own key is an UPDATE (with `updatedFrom`), not a duplicate refusal —
  // a DIFFERENT owner is the refusal. Both facts are asserted; neither is silent.
  const upd = m.registerPackSettings({ pack: 'c3-test-pack', namespace: 'vmu.c3test', defs: [{ key: 'vmu.c3test.mode', type: 'enum', domain: ['a', 'b'], def: 'a', hot: m.HOT.H1, who: 'office', doc: 'updated declaration' }] })
  ok(upd.ok === true && upd.updated.includes('vmu.c3test.mode') && Array.isArray(upd.updatedFrom) && upd.updatedFrom[0].key === 'vmu.c3test.mode' && upd.updatedFrom[0].previous.doc === 'C#3 测试命名空间的一个键',
    'C#3: 同一 pack 重注册自己的 key = 「更新」，回执 `updatedFrom` 带出旧声明', upd)
  eq(m.SETTING_DEFS.find((d) => d.key === 'vmu.c3test.mode').type, 'enum', 'C#3: 更新真的替换了声明（type 由 string -> enum）')
  let dup = null
  try { m.registerPackSettings({ pack: 'another-pack', namespace: 'vmu.c3test', defs: [{ key: 'vmu.c3test.mode', type: 'string', def: '', hot: m.HOT.H1, who: 'office', doc: 'x' }] }) } catch (e) { dup = e }
  eq(dup && dup.code, 'VMU_SETTING_NAMESPACE_CONFLICT', 'C#3: 另一个 owner 的重复 key 仍具名拒（没有静默合并）')
  let outside = null
  try { m.registerPackSettings({ pack: 'c3-test-pack', namespace: 'vmu.c3test', defs: [{ key: 'vmu.records.tracks', type: 'stringList', def: [], hot: m.HOT.H1, who: 'office', doc: 'x' }] }) } catch (e) { outside = e }
  eq(outside && outside.code, 'VMU_INVALID_ARGUMENT', 'C#3: a pack may not declare a framework key (outside its namespace refused)')

  // ★★★ C#3 RESIDUE (TB-2792 round 7): REGISTER -> READ -> RETRACT -> READ IS A NAMED REFUSAL (and the lamp: without
  // the retraction the OLD value would still be readable, which is exactly the stale-global defect).
  const reg2 = m.registerPackSettings({ pack: 'c3-retract-pack', namespace: 'vmu.c3retract', defs: [
    { key: 'vmu.c3retract.mode', type: 'enum', domain: ['a', 'b'], def: 'a', hot: m.HOT.H1, who: 'office', doc: 'C#3 retraction 测试键' },
  ] })
  eq(JSON.stringify(m.screenSettings({ 'vmu.c3retract.mode': 'b' }).accepted), JSON.stringify({ 'vmu.c3retract.mode': 'b' }),
    'C#3 retract 正例①：注册后该键按同一 screen 被接受')
  // 反灯（控制）：不撤时旧值仍可读 —— 证明下面的判据不是恒真
  eq(JSON.stringify(m.resolveSettings([{ 'vmu.c3retract.mode': 'b' }]).values['vmu.c3retract.mode']), JSON.stringify('b'),
    'C#3 retract 反灯（控制）：不 retract ⇒ 旧值仍可读（判据不是恒真）')
  const retraction = m.retractPackSettings({ namespace: 'vmu.c3retract', reason: 'test' })
  ok(retraction.ok === true && retraction.removedCount === 1 && retraction.removed[0].key === 'vmu.c3retract.mode' && retraction.retracted.includes('vmu.c3retract'),
    'C#3 retract 正例②：retract 具名回执（removed/retracted），键从声明表撤除', retraction)
  let readAfter = null
  try { m.resolveSettings([{ 'vmu.c3retract.mode': 'b' }]) } catch (e) { readAfter = e }
  eq(readAfter && readAfter.code, 'VMU_SETTING_NAMESPACE_UNKNOWN',
    'C#3 retract 正例③：撤销后读该键 ⇒ 具名 VMU_SETTING_NAMESPACE_UNKNOWN（不是静默旧值）')
  const screenedAfter = m.screenSettings({ 'vmu.c3retract.mode': 'b' })
  eq(JSON.stringify(screenedAfter.rejected.map((r) => r.code)), JSON.stringify(['VMU_SETTING_NAMESPACE_UNKNOWN']),
    'C#3 retract 正例④：screen 面同样具名拒（config 路径与 resolve 路径同码）')
  const reReg = m.registerPackSettings({ pack: 'c3-retract-pack', namespace: 'vmu.c3retract', defs: [
    { key: 'vmu.c3retract.mode', type: 'enum', domain: ['a', 'b'], def: 'a', hot: m.HOT.H1, who: 'office', doc: '重新注册' },
  ] })
  ok(reReg.ok === true && reReg.added.includes('vmu.c3retract.mode') && JSON.stringify(m.screenSettings({ 'vmu.c3retract.mode': 'b' }).accepted) === JSON.stringify({ 'vmu.c3retract.mode': 'b' }),
    'C#3 retract 正例⑤：重新注册后命名空间复活（撤销不是永久墓碑）')
  // AUTO-RETRACT seam used by pack unload: manifest id 'c3-retract-pack' does not match the namespace token, but the
  // matcher also accepts the `vmu.<token>` / `vmu.<token>-…` relation, so a pack's own id form is covered.
  ok(typeof m.retractPackSettingsForPackId === 'function', 'C#3: unload helper exists (pack unload calls it)')
  const byId = m.retractPackSettingsForPackId('vmu.c3retract')
  ok(byId.ok === true && byId.matched.length === 0, 'C#3: unload helper matches by namespace token/id relation only (no false positive on a full key)', byId)
  const byRel = m.retractPackSettingsForPackId('c3retract-pack')
  ok(byRel.ok === true && byRel.matched.includes('vmu.c3retract') && byRel.removedCount === 1,
    'C#3: unload helper 以 manifest/request id 关联到命名空间并撤销（pack 卸载自动撤的判据）', byRel)

  // ★ C#4 residue: `vmu.turn.protocolPath` — framework default is NEUTRAL, the v5r institution carries the path.
  eq(m.SETTING_DEFS.find((d) => d.key === 'vmu.turn.protocolPath').def, '',
    'C#4: framework vmu.turn.protocolPath default is NEUTRAL (empty — the framework names no protocol document)')
  eq(V5R_SETTING_DEFAULTS['vmu.turn.protocolPath'], 'Shared/Protocol.md',
    'C#4: the v5r PACK supplies its own protocolPath (behaviour unchanged under v5r)')
  const layered = m.resolveSettings([{ ...V5R_SETTING_DEFAULTS }], { onInvalid: 'reject' })
  eq(layered.values['vmu.turn.protocolPath'], 'Shared/Protocol.md',
    'C#4: 挂 v5r 后该键解析回 Shared/Protocol.md（defaults 层生效）')

  const unknownNs = m.screenSettings({ 'vmu.nosuchnamespace.key': 1 })
  eq(unknownNs.rejected[0] && unknownNs.rejected[0].code, 'VMU_SETTING_NAMESPACE_UNKNOWN',
    'C#3: an UNKNOWN namespace is refused by its own name (not the generic undeclared)', unknownNs.rejected[0])
  ok(m.registeredPackNamespaces().some((r) => r.namespace === 'vmu.c3test' && r.packs.includes('c3-test-pack')),
    'C#3: registeredPackNamespaces() reports the pack and its namespace', m.registeredPackNamespaces())

  // C#15: the four quotas are FINITE by default; an explicit 0 remains the written-down unlimited literal.
  for (const [k, finite] of [['vmu.budget.tokens', 1000000], ['vmu.budget.turns', 500], ['vmu.budget.toolCalls', 10000], ['vmu.budget.subagents', 50]]) {
    eq(defOf(k).def, finite, 'C#15: ' + k + ' 默认是有限值（不是隐式的 0=不限）')
  }
  const budgetScreen = m.screenSettings({ 'vmu.budget.tokens': 0 })
  eq(budgetScreen.accepted['vmu.budget.tokens'], 0, 'C#15: 显式 0 仍是合法的不限字面量（写出来才算数）')
  const defaults = m.resolveSettings([])
  eq(defaults.values['vmu.budget.tokens'], 1000000, 'C#15: 未设时回执给有限默认（source 可区分「未设」）')
  eq((defaults.provenance['vmu.budget.tokens'] || []).length, 0, 'C#15: 未设键没有 provenance（未设 ≠ 被显式设为默认）')
  const explicit = m.resolveSettings([{ 'vmu.budget.tokens': 0 }])
  eq(explicit.values['vmu.budget.tokens'], 0, 'C#15: 显式 unlimited(0) 的值与未设可区分')

  // C#23: minimal profile is a SMALL explainable requirement list; missing keys are refused by name.
  ok(m.SETTING_PROFILES && m.SETTING_PROFILES.minimal && m.SETTING_PROFILES.minimal.required.length === 4,
    'C#23: minimal profile declares exactly FOUR required keys (small + explainable)', m.SETTING_PROFILES && m.SETTING_PROFILES.minimal)
  const emptyReport = m.profileReport({}, 'minimal')
  eq(emptyReport.ok, false, 'C#23: an empty deployment is NOT minimal-complete')
  eq(emptyReport.missing.length, 4, 'C#23: all four required keys are named missing', emptyReport.missing.map((x) => x.key))
  let profErr = null
  try { m.assertProfile({}, 'minimal') } catch (e) { profErr = e }
  eq(profErr && profErr.code, 'VMU_SETTING_PROFILE_INCOMPLETE', 'C#23: a missing required key is refused by name')
  ok(profErr && /vmu\.core\.enabled/.test(String(profErr.hint)) && /vmu\.budget\.tokens/.test(String(profErr.hint)),
    'C#23: the refusal hint lists every missing key WITH its reason', profErr && profErr.hint)
  const minimalValues = { 'vmu.core.profile': 'minimal', 'vmu.core.enabled': true, 'vmu.turn.deliveryTimeoutMs': 180000, 'vmu.budget.tokens': 200000, 'vmu.limits.toolCallsPerTurnCap': 40 }
  ok(m.profileReport(minimalValues).ok === true, 'C#23: a complete minimal values map passes the profile check')
  const km = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const mk = km.createKernel({ clock: () => 1000, settings: minimalValues })
  ok(mk && mk.status({}).enabled === true, 'C#23: a minimal profile really BOOTS a kernel (status.enabled)')
  const doc04 = readFileSync(resolve(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
  ok(/^\| 键 \| 必设 \|/m.test(doc04), 'C#23: docs/04 generated table carries the 必设 column')
  ok(/\| `vmu\.core\.enabled` \| ★ minimal \|/m.test(doc04), 'C#23: a required key is marked ★ minimal in the generated docs table')
}

// ---- 8. self-probe -----------------------------------------------------------------------------
if (SELF_PROBE) {
  ok(failed > 0, 'self-probe: the deliberately broken carrier/resolver produced failures', failed)
  console.log('=== VMU SETTINGS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}


// ── C#15 (ROUND-7) + C#23 profile wiring ────────────────────────────────────────────────────────────────────────
{
  const schema = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href)
  const kernelMod = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  // C#15a: tri-state, not "0 = unlimited"
  const unset = schema.limitsReadings({})
  ok(unset.limits.toolCallsPerTurnCap.state === 'unset-default' && unset.limits.toolCallsPerTurnCap.effective === null,
    'C15-1 ★★ 未设置的四键 ≠ 不限：state="unset-default"、effective=null（默认 0 不是任何人写下的决定）', unset.limits.toolCallsPerTurnCap)
  ok(unset.warnings.length === 4 && unset.warnings.every((w) => w.code === 'VMU_LIMIT_UNSET' && typeof w.means === 'string'),
    'C15-2 ★ 未设置时四个键各有一条具名警告（不阻断；不是静默）', unset.warnings)
  const explicitZero = schema.limitsReadings({ 'vmu.limits.toolCallsPerTurnCap': 0, 'vmu.limits.maxLiveMembers': 12 })
  ok(explicitZero.limits.toolCallsPerTurnCap.state === 'explicit-unlimited' && explicitZero.limits.toolCallsPerTurnCap.effective === null,
    'C15-3 ★★★ 显式写 0 ⇒ state="explicit-unlimited"（唯一的「不限」来源，可审计）', explicitZero.limits.toolCallsPerTurnCap)
  ok(explicitZero.limits.maxLiveMembers.state === 'finite' && explicitZero.limits.maxLiveMembers.effective === 12,
    'C15-4 ★ 显式有限值 ⇒ state="finite"/effective=12', explicitZero.limits.maxLiveMembers)
  ok(explicitZero.limits.toolCallsPerTurnCap.enforcement === 'advisory' && explicitZero.limits.maxLiveMembers.enforcement === 'blocking'
    && explicitZero.limits.memoryCeilingMb.enforcement === 'blocking' && explicitZero.limits.wallClockMs.enforcement === 'advisory',
    'C15-5 ★★★ enforcement 如实：maxLiveMembers/memoryCeilingMb 是 blocking，toolCallsPerTurnCap/wallClockMs 是 advisory（不假装强制）',
    Object.fromEntries(Object.entries(explicitZero.limits).map(([k, v]) => [k, v.enforcement])))
  // C#15b: the 1M token default carries a NAMED long-run warning; explicit 80M / explicit 0 do not
  const tokUnset = schema.tokenBudgetReading({})
  ok(tokUnset.state === 'unset-default' && tokUnset.warning && tokUnset.warning.code === 'VMU_BUDGET_TOKENS_DEFAULT'
    && /80,?000,?000|80000000/.test(String(tokUnset.warning.means)),
    'C15-6 ★★★ 默认 1M tokens（未设）⇒ 具名启动警告 VMU_BUDGET_TOKENS_DEFAULT（真实长跑 30–73M，必须显式设或 0=不限；不阻断）', tokUnset.warning && tokUnset.warning.means)
  const tok80 = schema.tokenBudgetReading({ 'vmu.budget.tokens': 80000000 })
  const tokZero = schema.tokenBudgetReading({ 'vmu.budget.tokens': 0 })
  ok(tok80.warning === null && tok80.state === 'finite' && tokZero.warning === null && tokZero.state === 'explicit-unlimited',
    'C15-7 ★ 显式 80M 或显式 0=不限 ⇒ 无警告（只有「未设」才警告）', { tok80: tok80.state, tokZero: tokZero.state })
  // C#23: explicit profile is ENFORCED at boot; undeclared profile stays backward-compatible
  let profileErr = null
  try { kernelMod.createKernel({ settings: { 'vmu.core.profile': 'minimal' } }) } catch (e) { profileErr = e }
  ok(!!profileErr && profileErr.code === 'VMU_SETTING_PROFILE_INCOMPLETE' && /vmu\.core\.enabled/.test(String(profileErr.message)),
    'C23-1 ★★★ 显式 profile="minimal" 且缺必设键 ⇒ boot 处具名拒 VMU_SETTING_PROFILE_INCOMPLETE（assertProfile 真有生产调用点）', profileErr && { code: profileErr.code, message: profileErr.message })
  const minimal = {
    'vmu.core.profile': 'minimal', 'vmu.core.enabled': true, 'vmu.turn.deliveryTimeoutMs': 120000,
    'vmu.budget.tokens': 80000000, 'vmu.limits.toolCallsPerTurnCap': 256,
  }
  let booted = null
  try { booted = kernelMod.createKernel({ settings: minimal }) } catch (e) { booted = e }
  ok(booted && booted.settingsView && booted.settingsView()['vmu.core.profile'] === 'minimal',
    'C23-2 ★★ 显式 minimal + 4 必设键 ⇒ 正常 boot，status 可读到 profile="minimal"', booted && booted.settingsView && booted.settingsView()['vmu.core.profile'])
  let noProfile = null
  try { noProfile = kernelMod.createKernel({ settings: {} }) } catch (e) { noProfile = e }
  ok(noProfile && noProfile.settingsView, 'C23-3 ★ 未声明 profile ⇒ 不强制（向后兼容）', noProfile && typeof noProfile)
  // C#23 反灯: copy tree, remove the assertProfile call -> the same invalid declaration boots silently (old shape)
  {
    const ldir = mkdtempSync(join(tmpdir(), 'vmu-profile-lamp-'))
    try {
      cpSync(resolve(REPO, 'vibe-math-vmu'), join(ldir, 'vibe-math-vmu'), { recursive: true })
      const kp = join(ldir, 'vibe-math-vmu', 'kernel', 'index.js')
      const src = readFileSync(kp, 'utf8')
      const from = "if (Object.prototype.hasOwnProperty.call(settings, 'vmu.core.profile')) assertProfile(settings, settings['vmu.core.profile'])"
      ok(src.indexOf(from) !== -1, 'C23 lamp-setup: the boot-time profile assertion exists')
      writeFileSync(kp, src.replace(from, '/* lamp: profile assertion removed */'))
      const lampKernel = await import(pathToFileURL(kp).href + '?c23lamp=1')
      let lampErr = null
      let lampBoot = null
      try { lampBoot = lampKernel.createKernel({ settings: { 'vmu.core.profile': 'minimal' } }) } catch (e) { lampErr = e }
      ok(!lampErr && lampBoot, 'C23 lamp RED-worthy: 去掉 boot 处 assertProfile ⇒ 缺键的 minimal 也静默启动（「未接线」的旧形状）', { lampErr: lampErr && lampErr.code })
    } finally { rmSync(ldir, { recursive: true, force: true }) }
  }
}

console.log('=== VMU SETTINGS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
