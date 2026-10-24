#!/usr/bin/env node
// vmu MEETING DOMAIN GUARD — Round 31 (task-149 C③): the eleven strict `vmu.meetings.*` domains, and the ONE
// invariant that makes the batch valid: `schema.domain` ≡ read-side set, ELEMENT-WISE.
//
// WHY: until R31 those keys were declared `type:'string'` ("any string is legal") while the reader SILENTLY CLAMPED
// anything outside its own set to the default — declaration and enforcement were opposite. The nine remaining keys
// are now hand-declared `enum` rows (outside the generated block) and the read side REFUSES BY NAME. R17's
// `orderMode` precedent is valid because the two sides were byte-identical; this suite asserts that for all eleven.
// RULE E: collection assertions carry their non-emptiness in the same expression and print the count.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MEETING_DOMAINS, MEETING_DOMAIN_KEYS, createMeetingDomains } from '../vibe-math-vmu/kernel/meetingdomain.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

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

console.log('=== 1. ★ THE CORE INVARIANT: schema.domain ≡ read-side set, ELEMENT-WISE ===')
{
  const byKey = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  ok(MEETING_DOMAIN_KEYS.length === 11, 'D0. eleven keys are declared here (the count the extraction moved out)', MEETING_DOMAIN_KEYS.length)
  const problems = []
  for (const key of MEETING_DOMAIN_KEYS) {
    const decl = byKey.get(key)
    const read = MEETING_DOMAINS[key]
    if (!decl) { problems.push(key + ': no schema declaration'); continue }
    // element-wise: same length, same ORDER, same members (a Set comparison would hide an order change)
    const same = decl.type === 'enum' && Array.isArray(decl.domain) &&
      decl.domain.length === read.values.length && decl.domain.every((v, i) => v === read.values[i])
    if (!same) problems.push(key + ': schema=' + JSON.stringify(decl.domain) + ' read=' + JSON.stringify(read.values))
    if (decl.def !== read.def) problems.push(key + ': defaults differ (' + decl.def + ' vs ' + read.def + ')')
  }
  ok(problems.length === 0,
    'D1. ★ every one of the eleven keys: schema.domain === read-side values ELEMENT-WISE (and the defaults agree)',
    { keys: MEETING_DOMAIN_KEYS.length, problems })
  ok(MEETING_DOMAIN_KEYS.every((k) => MEETING_DOMAINS[k].values.length > 0),
    'D2. and every declared domain is non-empty (the comparison above cannot pass vacuously)')
}

console.log('=== 2. THE READ SIDE REFUSES BY NAME (it used to clamp silently) ===')
{
  const sget = (k) => ({ 'vmu.meetings.tier': 'bogus' })[k]
  const mkRefuse = (code, message, hint) => Object.assign(new Error(message), { code, hint })
  // the factory reads all eleven EAGERLY, so an out-of-domain value is refused AT CONSTRUCTION — that is the face's
  // fail-fast shape (asserted in §3); `read()` is the same decision point for a single key.
  const e = errOf(() => createMeetingDomains({ sget, refuse: mkRefuse }))
  ok(e !== null && e.code === 'VMU_INVALID_ARGUMENT',
    'R1. an out-of-domain value ⇒ NAMED refusal (VMU_INVALID_ARGUMENT), never a silent fall back to the default', e && e.code)
  ok(!!e && String(e.message).includes('formal') && String(e.message).includes('bogus'),
    'R2. and the refusal names BOTH the value and the declared domain (actionable)', e && e.message)
  // NB the factory reads ALL ELEVEN keys eagerly (that is what makes the face fail fast), so these stubs are
  // key-aware: a constant stub would legitimately throw for the other ten keys.
  const unset = createMeetingDomains({ sget: () => undefined, refuse: (c, m, h) => Object.assign(new Error(m), { code: c, hint: h }) })
  ok(unset.read('vmu.meetings.tier') === 'formal', 'R3. unset ⇒ the DECLARED DEFAULT (zero mechanism, silent and correct)')
  const good = createMeetingDomains({ sget: (k) => (k === 'vmu.meetings.tier' ? 'light' : undefined), refuse: (c, m, h) => Object.assign(new Error(m), { code: c, hint: h }) })
  ok(good.read('vmu.meetings.tier') === 'light', 'R4. an in-domain value is returned as-is (the guard is not a reset)')
  const bare = createMeetingDomains()
  ok(bare.values && bare.values.tier === 'formal',
    'R5. the factory needs NO ports (zero mechanism: the table still reads, every key at its declared default)')
}

console.log('=== 3. THE FACE REALLY USES THIS READER (defence in depth behind R30\'s config screen) ===')
{
  // `createMeetings` is constructed DIRECTLY here, bypassing kernel/index.js's config screening on purpose: that is
  // the path on which the read-side refusal is the LAST line of defence.
  const root = await mkdtemp(join(tmpdir(), 'vmu-md-'))
  const e = errOf(() => createMeetings({ clock: () => 1000, settings: { get: (k) => (k === 'vmu.meetings.tier' ? 'bogus' : undefined) } }))
  ok(e !== null && e.code === 'VMU_INVALID_ARGUMENT',
    'F1. ★ a settings object carrying an out-of-domain meeting domain makes the face REFUSE AT CONSTRUCTION (not clamp)', e && e.code)
  const t = createMeetings({ clock: () => 1000, settings: { get: (k) => (k === 'vmu.meetings.tier' ? 'light' : undefined) } })
  const r = t.open({ type: 'ordinary', roster: ['r-1'] })
  ok(r && r.ok === true && r.receipt, 'F2. and an in-domain value builds and opens normally (the guard is not a blanket refusal)', r && r.ok)
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }).catch(() => {})
}

console.log('')
console.log('=== VMU MEETING DOMAIN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
