#!/usr/bin/env node
// vmu SETTINGS DOMAIN GUARD — Round 30 (task-149 A): the DECLARED `type`/`domain` must be ENFORCED at runtime.
//
// THE GAP THIS GUARDS (measured, then independently reproduced): `settings/schema.js`'s `validateValue` had NO
// runtime caller — its only callee `resolveSettings` had no caller either — so `type`/`domain` was documentation and
// an out-of-domain value arriving through `config.vmu` was simply LOADED. The KEY guard was wired, so half of the
// same file's schema really ran, which is exactly why the missing half was easy to assume.
//
// WHAT IS ASSERTED (two faces, three states, and a counterexample that must be able to go red):
//   §1 INTERACTIVE face (`kernel.setSettingsValue`) ⇒ REFUSE BY NAME (`VMU_INVALID_ARGUMENT`, the code R17 uses);
//   §2 CONFIG face (construction-time) ⇒ NOT ACCEPTED + RECORDED + the DECLARED DEFAULT stays; the kernel still
//      builds (one mistyped key must not stop the session);
//   §3 PACK/MERGE face (`kernel.applyPackSettings`) ⇒ same disposition, recorded with its layer;
//   §4 THREE STATES distinguishable: absent (silent default) / undeclared (recorded, left alone) / out-of-domain;
//   §5 the ratio bound — the value the false comment at schema.js:1521 used to claim was enforced.
// RULE E: collection assertions carry their non-emptiness in the SAME expression and print the count.
// Run: node tests/vmu-settings-domain.test.mjs
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

const root = await mkdtemp(join(tmpdir(), 'vmu-settings-domain-'))
const build = (settings = {}) => createKernel({ root, clock: () => 1000, settings: Object.assign({}, settings) })

console.log('=== 1. THE INTERACTIVE WRITE FACE REFUSES BY NAME (was: stored, then every reader fell back) ===')
{
  const k = build()
  const cases = [
    ['vmu.budget.onExceed', 'nonsense', 'refuse | warn | pause'],
    ['vmu.quota.onExceed', 'sometimes', 'warn | refuse | degrade'],
    ['vmu.compat.unknownCombo', 'maybe', 'refuse | try'],
  ]
  for (const [key, bad, domain] of cases) {
    const e = errOf(() => k.setSettingsValue(key, bad, { by: 'office' }))
    ok(e !== null && e.code === 'VMU_INVALID_ARGUMENT',
      'I1. set(' + key + ' = ' + JSON.stringify(bad) + ') is REFUSED by name (VMU_INVALID_ARGUMENT)', e && e.code)
    ok(!!e && String(e.message).includes(domain.split(' | ')[0]) && String(e.message).includes('expected one of'),
      'I2. and the refusal NAMES the declared domain (' + key + ')', e && e.message)
    ok(codeOf(() => k.setSettingsValue(key, String(domain.split(' | ')[0]), { by: 'office' })) === 'NO-THROW',
      'I3. the same key accepts a DECLARED value (positive control, non-vacuous: ' + key + ')')
  }
  // §5 the ratio bound: the false comment said validateValue enforced 0..1 "on every runtime write"
  const ratio = errOf(() => k.setSettingsValue('vmu.metrics.sampleRate', 7, { by: 'office' }))
  ok(ratio !== null && ratio.code === 'VMU_INVALID_ARGUMENT' && /0\.\.1/.test(String(ratio.message)),
    'I4. ★ the 0..1 ratio bound really is enforced now (schema.js:1521 used to CLAIM this with no caller)', ratio && ratio.message)
  ok(k.status().settings.settingsRejectedCount === 0,
    'I5. the interactive face REFUSES rather than recording ⇒ nothing lands in settingsRejected', k.status().settingsRejectedCount)
}

console.log('=== 2. THE CONFIG FACE: not accepted + recorded + declared default (session still builds) ===')
{
  const k = build({ 'vmu.budget.onExceed': 'nonsense', 'vmu.compat.unknownCombo': 'try' })
  const st = k.status()
  const rejected = st.settings.settingsRejected || []
  ok(st.settings.settingsRejectedCount === 1,
    'C1. exactly the ONE out-of-domain value is recorded (the valid `try` is accepted, not recorded)', st.settings.settingsRejectedCount)
  ok(rejected.length > 0 && rejected.every((r) => r.key && r.value !== undefined && r.reason),
    'C2. each record NAMES key/value/reason/domain (non-empty, count printed)', rejected)
  const r0 = rejected[0] || null
  ok(!!r0 && r0.key === 'vmu.budget.onExceed' && r0.reason === 'outside the declared domain refuse | warn | pause' && r0.default === 'refuse',
    'C3. the record names the key, the domain it missed and the default it fell back to', r0)
  ok(st.settings.resolved['vmu.budget.onExceed'].value === 'refuse',
    'C4. ★ the out-of-domain value is NOT in effect: the DECLARED DEFAULT is', st.settings.resolved['vmu.budget.onExceed'].value)
  ok(st.settings.resolved['vmu.compat.unknownCombo'].value === 'try',
    'C5. and a VALID config value is untouched (the screen is not a blanket reset)', st.settings.resolved['vmu.compat.unknownCombo'].value)
  ok(k.settingsView()['vmu.budget.onExceed'] === 'refuse', 'C6. the live settings view shows the default too (30+ consumers read this view)')
  ok(typeof st.settings === 'object' && st.enabled !== undefined, 'C7. ★ the kernel still BUILT: one mistyped key does not stop the session', { ok: st.ok })
}

console.log('=== 3. THE PACK/MERGE FACE: same disposition, with its layer named ===')
{
  const k = build()
  const res = k.applyPackSettings({ 'vmu.budget.onExceed': 'pause', 'vmu.quota.warnAt': 42 }, { by: 'probe-pack' })
  ok(Array.isArray(res.applied) && res.applied.includes('vmu.budget.onExceed') && !res.applied.includes('vmu.quota.warnAt'),
    'P1. the VALID pack value is applied, the out-of-domain one is NOT', res.applied)
  const rec = (k.status().settings.settingsRejected || []).filter((r) => r.source === 'pack:probe-pack')
  ok(rec.length === 1 && rec[0].key === 'vmu.quota.warnAt' && /^(outside the declared domain|expected )/.test(String(rec[0].reason)),
    'P2. and the refusal is RECORDED with the layer that brought it (non-empty, count printed)', rec)
  ok(k.settingsView()['vmu.quota.warnAt'] === undefined && k.status().settings.resolved['vmu.quota.warnAt'].value === 0.8,
    'P3. ★ the out-of-domain 42 was NOT accepted (the live object has no such key) while the resolved view reports the declared default 0.8',
    { live: k.settingsView()['vmu.quota.warnAt'], resolved: k.status().settings.resolved['vmu.quota.warnAt'].value })
  ok(codeOf(() => k.applyPackSettings({ 'vmu.budget.onExceed': 'nonsense' }, { by: 'p2' })) === 'NO-THROW',
    'P4. a bad pack default does NOT throw (a merge face must not break the session)')
}

console.log('=== 4. THREE STATES, NEVER MIXED ===')
{
  const touch = build({ 'vmu.notdeclared.typo': 1, 'vmu.budget.onExceed': 'nonsense' })
  const st = touch.status()
  const rec = st.settings.settingsRejected || []
  const undeclared = rec.filter((r) => r.reason === 'undeclared')
  const outside = rec.filter((r) => String(r.reason).startsWith('outside'))
  ok(rec.length === 2 && undeclared.length === 1 && outside.length === 1,
    'T1. an UNDECLARED key and an OUT-OF-DOMAIN value are recorded as DIFFERENT reasons (counts printed)',
    { total: rec.length, undeclared: undeclared.length, outside: outside.length })
  ok(touch.settingsView()['vmu.notdeclared.typo'] === 1,
    'T2. an undeclared key is LEFT ALONE (recorded, never silently deleted by a face that does not own it)')
  ok(st.settings.resolved['vmu.budget.onExceed'].value === 'refuse', 'T3. the out-of-domain key keeps its declared default')
  const clean = build({ 'vmu.budget.onExceed': 'warn' })
  ok(clean.status().settings.settingsRejectedCount === 0,
    'T4. a deployment with only VALID values records nothing (absent ≠ rejected — zero mechanism stays silent)')
}

console.log('=== 5. ★ REGRESSION WITNESS (the blind spot that let the 319-key defect through): EVERY declared type ===')
{
  // ★ THE DEFECT THIS SECTION EXISTS FOR: A first shipped enforcement only for the types that already had a case,
  // and refused every LEGAL value of the other five (`string` 173 keys, `planned` 111, `object` 21, `integer` 7,
  // `number` 7 = 319 ≈ 26%). No assertion here walked a `string` key, so the regression was INVISIBLE to this suite.
  const k = build()
  // (a) `string` on the INTERACTIVE face — the exact call verify2 measured as throwing.
  ok(codeOf(() => k.setSettingsValue('vmu.meetings.attendanceMode', 'roster', { by: 'office' })) === 'NO-THROW',
    'W1. ★ a legal value of a `string`-typed key is ACCEPTED on the interactive face (it used to throw "unknown declaration type")')
  ok(codeOf(() => k.setSettingsValue('vmu.meetings.minutesDetail', 'brief', { by: 'office' })) === 'NO-THROW',
    'W2. and the second measured witness (`vmu.meetings.minutesDetail`) too')
  const wrong = errOf(() => k.setSettingsValue('vmu.meetings.attendanceMode', 42, { by: 'office' }))
  ok(wrong !== null && wrong.code === 'VMU_INVALID_ARGUMENT' && /expected a string/.test(String(wrong.message)),
    'W3. a WRONG type is still refused, with an ACCURATE reason (not "unknown declaration type")', wrong && wrong.message)
  // (b) `string` on the CONFIG face: any string is legal, so nothing may be recorded (the misleading
  // "expected string" record verify2 saw came from the missing case).
  const cfg = build({ 'vmu.meetings.attendanceMode': 'bogus' })
  ok(cfg.status().settings.settingsRejectedCount === 0,
    'W4. ★ a token of a `string` key is NOT screened out on the config face (a string is a string)', cfg.status().settings.settingsRejected)
  ok(cfg.settingsView()['vmu.meetings.attendanceMode'] === 'bogus',
    'W5. and it is really in effect (not silently replaced by the default)')
  // (c) EVERY declared type gets a witness, driven from the schema (so a new type cannot arrive untested). Keys
  // that are NAMED as not-enforced (§5d) are skipped on purpose — they are the documented exception, not a witness.
  const { SETTING_DEFS: DEFS, unenforcedReport } = await import('../vibe-math-vmu/settings/schema.js')
  const exempt = new Set((unenforcedReport().declarations || []).map((d) => d.key))
  const LEGAL = { boolean: true, enum: null, natural: 1, integer: 1, number: 1.5, object: {}, string: 'x',
    stringList: ['x'], objectList: [{}], path: 'a/b', ratio: 0.5, positiveInteger: 1 }
  const probed = []
  for (const d of DEFS) {
    if (probed.some((p) => p.type === d.type)) continue
    // H3 keys are framework-owned and refused for an unrelated reason (read-only), so they cannot witness a TYPE
    // check; the exempt keys are the documented non-enforcement exception.
    if (exempt.has(d.key) || String(d.hot) === 'H3' || !(d.type in LEGAL)) continue
    const legal = d.type === 'enum' ? d.domain[0] : LEGAL[d.type]
    const okLegal = codeOf(() => k.setSettingsValue(d.key, legal, { by: 'office' })) === 'NO-THROW'
    const badIllegal = errOf(() => k.setSettingsValue(d.key, Symbol('wrong'), { by: 'office' }))
    probed.push({ type: d.type, key: d.key, okLegal, illegal: badIllegal })
  }
  ok(probed.length > 0, 'W6. the per-type witness sweep found types to probe (the loop below is non-vacuous)', probed.length)
  const broken = probed.filter((p) => !p.okLegal || p.illegal === null ||
    p.illegal.code !== 'VMU_INVALID_ARGUMENT' || /unknown declaration type/.test(String(p.illegal.message)))
  ok(broken.length === 0,
    'W7. ★ EVERY declared type: a legal value passes and an illegal one is refused BY TYPE (never "unknown declaration type")',
    { probed: probed.length, broken: broken.map((p) => p.type + '@' + p.key + ' legal=' + p.okLegal + ' illegal=' + (p.illegal && p.illegal.message)) })
  // (d) the two NAMED non-enforcement categories: `planned` (no validator yet) and the self-inconsistent
  // declarations (their own default contradicts them) — neither judged, NEITHER silently invisible.
  const unenforced = k.status().settings.settingsUnenforced || { types: [], declarations: [] }
  ok(Array.isArray(unenforced.types) && unenforced.types.length > 0 &&
     unenforced.types.some((t) => t.type === 'planned' && Number(t.count) > 0 && /no validator/.test(String(t.reason))),
    'W8. ★ a type with no validator yet (`planned`) is NAMED with its key count and a reason', unenforced.types)
  ok(Array.isArray(unenforced.declarations) && unenforced.declarations.every((d) => d.key && d.reason),
    'W9. ★ and every declared key whose own default contradicts its declaration is NAMED too (count printed)', unenforced.declarations.length)
  const planned = unenforced.types.find((t) => t.type === 'planned')
  ok(planned === undefined || planned.count === 111, 'W10. the `planned` count is the measured 111 keys', planned && planned.count)
}

console.log('=== 6. ★ COVERAGE GATE: every declared type is either JUDGED or NAMED (a new case-less type reddens this) ===')
{
  const { SETTING_DEFS, validateValue, unenforcedReport } = await import('../vibe-math-vmu/settings/schema.js')
  const named = new Set((unenforcedReport().types || []).map((t) => t.type))
  const byType = new Map()
  for (const d of SETTING_DEFS) if (!byType.has(d.type)) byType.set(d.type, d)
  ok(byType.size > 0, 'G0. the declared-type inventory is non-empty (the sweep below is non-vacuous)', byType.size)
  const unjudged = []
  for (const [type, def] of byType) {
    let verdict = 'judged'
    try { validateValue(def.key, Symbol('wrong')) } catch (e) {
      if (/unknown declaration type/.test(String(e.message))) verdict = 'UNKNOWN-TYPE'
    }
    // A named non-enforcement category is not a defect — it is a DISCLOSED gap. Anything else must be loud.
    const excused = named.has(type) || (unenforcedReport().declarations || []).some((d) => d.key === def.key)
    if (verdict === 'UNKNOWN-TYPE' && !excused) unjudged.push(type + '(' + def.key + ')')
  }
  ok(unjudged.length === 0,
    'G1. ★ every declared type either HAS a validator case or is NAMED as not-yet-enforced ⇒ a new case-less type is RED here',
    { types: byType.size, named: [...named], unjudged })
  // the same invariant from the other direction: a declaration must not refuse its OWN default
  const selfRefused = []
  for (const d of SETTING_DEFS) {
    try { validateValue(d.key, d.def) } catch (e) { selfRefused.push(d.key + ' :: ' + e.message) }
  }
  ok(selfRefused.length === 0,
    'G2. ★ no declaration refuses its own default (a validator derived from a declaration cannot contradict it)',
    { refused: selfRefused.length, sample: selfRefused.slice(0, 3) })
  // and the sentinel stays LOUD: an unknown type must refuse by name rather than pass quietly
  const forged = { key: 'vmu.forged.probe', type: 'forgeType', def: 1, domain: null }
  ok(/unknown declaration type/.test(String((() => { try { return validateValue('vmu.kernel.enabled', 1) } catch (e) { return e.message } })()) || '') === false,
    'G3. control: a JUDGED key does not report an unknown type (non-vacuous comparison)')
  void forged
}

console.log('=== 7. ★ `null` = THE SETTINGS-UNSET SENTINEL (task-149 ②) + ④ committeeSize ===')
{
  const sch = await import('../vibe-math-vmu/settings/schema.js')
  const byType = new Map()
  for (const d of sch.SETTING_DEFS) if (!byType.has(d.type)) byType.set(d.type, d)
  ok(byType.size > 0, 'N0. the type inventory is non-empty (the sweep below is non-vacuous)', byType.size)
  const rejectedNull = []
  for (const [type, d] of byType) {
    if (sch.unenforcedReason(d)) continue
    try { sch.validateValue(d.key, null) } catch (e) { rejectedNull.push(type + ':' + e.message.slice(0, 40)) }
  }
  ok(rejectedNull.length === 0,
    'N1. ★ `null` is ACCEPTED for EVERY judged type (the unset sentinel, not a value — the declaration system already had it: "an honest null default")',
    { types: byType.size, rejected: rejectedNull })
  const k = build({ 'vmu.external.endpoints': null, 'vmu.tools.enabled': null })
  ok(k.status().settings.settingsRejectedCount === 0,
    'N2. a `null` config value is NOT a rejection (null ≠ out-of-domain)', k.status().settings.settingsRejected)
  const decl = (k.status().settings.settingsUnenforced.declarations || []).map((r) => r.key)
  // RULE E: no `.every` on a possibly-empty list (it is vacuously true on `[]`, and after the generator's `--write`
  // b2's pair may legitimately become empty). `filter` + a count states the same claim without that trap.
  const strangers = decl.filter((key) => !/vmu\.math\.(optim|precision)\.tolerance/.test(key))
  ok(decl.length <= 2 && strangers.length === 0,
    'N3. ★ the self-contradiction list shrank to the GENERATOR pair only (the 10 null-default keys left it): 13 → 2',
    { count: decl.length, strangers })
  const cs = sch.SETTING_DEFS.find((d) => d.key === 'vmu.topology.committeeSize')
  ok(cs && cs.type === 'natural' && cs.def === 0 && codeOf(() => sch.validateValue('vmu.topology.committeeSize', 0)) === 'NO-THROW',
    'N4. ★ `vmu.topology.committeeSize` declares `natural` (0 = no limit, per topology.js:55 `v > 0 ? v : 0` and :91 `> 0`) so its default satisfies its own declaration',
    cs && { type: cs.type, def: cs.def })
  // ③ the GENERATOR's type inference: scientific notation used to be unrecognised ⇒ the emitter's fallback claimed
  // `object` for a numeric default (vmu.math.*.tolerance). The recogniser must name it `number`.
  const gen = await import('../scripts/generate-wired-schema.mjs')
  ok(gen.typeOf('1e-6') === 'number' && gen.typeOf('1e-9') === 'number',
    'N5. ★ the generator reads SCIENTIFIC NOTATION as a number (it used to fall through to the `object` fallback while the def was a number)',
    { e6: gen.typeOf('1e-6'), e9: gen.typeOf('1e-9') })
  ok(gen.typeOf('0.5') === 'ratio' && gen.typeOf('7') === 'natural' && gen.typeOf('{}') === 'object',
    'N6. and the pre-existing recognitions are unchanged (control, so N5 is not a blanket rewrite)',
    { dec: gen.typeOf('0.5'), int: gen.typeOf('7'), obj: gen.typeOf('{}') })
}

await rm(root, { recursive: true, force: true }).catch(() => {})

console.log('')
console.log('=== VMU SETTINGS DOMAIN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
