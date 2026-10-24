// ★★★ LIVE RUN 29 — ONE VISIBLE NAME, ONE MEETING.
//
// WHAT THE INSTITUTE REPORTED (its own acceptance report, ㉑.5/㉑.6): it held two meetings whose ids both read `m111` —
// one created through the SERVICE face (`vibe_v5_meeting`) and one through the PRIMITIVE face
// (`vibe_vmu_meeting { action:"open", id }`) — and it could not tell, from any read face, which table a bare `m111`
// referred to. Each registry only guarded its OWN table, so two different meetings shared one visible name.
//
// THE RULE THIS FILE PINS: an id denotes AT MOST ONE meeting across BOTH registries. Each side refuses an explicit id
// the other side holds (by name, naming the other table) and a MINTED id steps past it. The ONE exception is the
// documented BRIDGE (`adoptForeign: true`), where a single act deliberately records the same id in both tables so a
// tool-declared secretary can be honoured — two separate opens that happen to pick one name are the defect, one act is
// not.
//
// WHAT IT DOES NOT PROVE: it does not prove the AGENT will read the hint (that is live-run evidence, not a unit
// assertion), and it says nothing about the primitive registry's own lifecycle rules (motions, votes) — only about
// identity.

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const K = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')).href)
const KM = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings-defaults.js')).href)
const HPT = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host-pack-tools.js')).href)
const ENTRY = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = (fn) => { try { fn(); return null } catch (e) { return (e && e.code) || 'THREW_NO_CODE' } }

const root = await mkdtemp(join(tmpdir(), 'vmu-name-space-'))
void root
const NOW = 1000

// ── ① THE SERVICE SIDE: a minted id must step past the OTHER registry ───────────────────────────────────────────────
console.log('=== 1. A MINTED ID STEPS PAST THE OTHER TABLE (no silent reuse) ===')
{
  const calling = []
  const mt = K.createMeetings({
    clock: () => NOW,
    settings: { get: (k) => (k === 'vmu.meetings.quorumMin' ? 0 : k === 'vmu.meetings.quorumCap' ? 0 : undefined) },
    foreignIds: () => calling,
  })
  // the first mint is m1; make the OTHER registry already hold it, so the mint must move to m2
  calling.push('m1')
  const opened = mt.open({ agenda: 'x', roster: ['a', 'b'] })
  ok(opened.ok === true, 'the open still succeeds — the guard moves the id, it does not block the meeting', opened)
  ok(opened.meeting !== 'm1', '★ the minted id is NOT the id the other registry already holds', { id: opened.meeting, foreign: calling })
  ok(opened.meeting === 'm2', 'it is the next number, not a random one (deterministic advance)', opened.meeting)
  ok(calling.includes('m1') && !calling.includes(opened.meeting), 'the foreign list is unchanged — this side never writes into it')
}

// ── ② THE SERVICE SIDE: an EXPLICIT id the other table holds is refused by name ─────────────────────────────────────
console.log('=== 2. AN EXPLICIT COLLIDING ID IS REFUSED BY NAME, NOT SILENTLY RE-POINTED ===')
{
  const mt = K.createMeetings({
    clock: () => NOW,
    settings: { get: (k) => (k === 'vmu.meetings.quorumMin' ? 0 : k === 'vmu.meetings.quorumCap' ? 0 : undefined) },
    foreignIds: () => ['m111'],
  })
  const threw = (() => { try { mt.open({ id: 'm111', agenda: 'x', roster: ['a'] }); return null } catch (e) { return e } })()
  ok(threw && threw.code === 'VMU_CONFLICT', '★ an explicit id held by the primitive registry is refused VMU_CONFLICT', threw && threw.code)
  ok(threw && /PRIMITIVE meeting registry/.test(String(threw.hint)), '★ the hint names WHICH table owns it (the report\'s complaint was that nothing said)', threw && threw.hint)
  ok(threw && /m111/.test(String(threw.message)), 'the message names the id', threw && threw.message)
}

// ── ③ THE BRIDGE IS THE ONE ALLOWED SHARED ID ──────────────────────────────────────────────────────────────────────
console.log('=== 3. THE DOCUMENTED BRIDGE MAY ADOPT THE OTHER SIDE\'S ID (one act, two records) ===')
{
  const mt = K.createMeetings({
    clock: () => NOW,
    settings: { get: (k) => (k === 'vmu.meetings.quorumMin' ? 0 : k === 'vmu.meetings.quorumCap' ? 0 : undefined) },
    foreignIds: () => ['bridge-1'],
  })
  const adopted = (() => { try { return mt.open({ id: 'bridge-1', agenda: 'x', roster: ['a', 'b'], adoptForeign: true }) } catch (e) { return { threw: (e && e.code) || 'THREW' } } })()
  ok(adopted && adopted.ok === true && adopted.meeting === 'bridge-1',
    '★ with adoptForeign the SAME id is accepted — the bridge (secretary honoured by the service) still works', adopted)
  ok(adopted && adopted.threw === undefined, 'it did not throw', adopted && adopted.threw)
}

// ── ④ THE PRIMITIVE SIDE REFUSES AN ID THE SERVICE HOLDS ───────────────────────────────────────────────────────────
console.log('=== 4. THE OTHER DIRECTION: THE PRIMITIVE FACE REFUSES AN ID THE SERVICE HOLDS ===')
{
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = ENTRY.apply(ctx, { root: join(root, 'k'), clock: () => NOW })
  await handle.ready()
  const boot = handle
  const kernel = boot.kernel || (boot.state && boot.state.kernel) || null
  ok(!!kernel && typeof kernel.meetings === 'object' && typeof kernel.liveMeeting === 'function',
    'the booted kernel exposes both meeting registries', { hasMeetings: !!kernel && !!kernel.meetings })
  if (kernel) {
    const svcId = kernel.meetings.open({ agenda: 'service meeting', roster: ['a', 'b'] }).meeting
    ok(typeof svcId === 'string' && svcId.length > 0, 'the service minted an id', svcId)
    const viaPrimitive = (() => { try { return kernel.meeting({ id: svcId, agenda: 'primitive twin' }) } catch (e) { return { threw: (e && e.code) || 'THREW', hint: e && e.hint } } })()
    ok(viaPrimitive && viaPrimitive.threw === 'VMU_CONFLICT',
      '★ the primitive face refuses the id the service already holds (no second meeting under one name)', viaPrimitive)
    ok(viaPrimitive && /meetings SERVICE/.test(String(viaPrimitive.hint)),
      'and its hint names the other table', viaPrimitive && viaPrimitive.hint)
  }
}

// ── ⑤ THE PACK'S `validate` HAD TO SURVIVE REGISTRATION TO BE ABLE TO RUN AT ALL ───────────────────────────────────
console.log('=== 5. A DECLARED `validate` REACHES THE FUNNEL (it was dropped by two key maps) ===')
{
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = ENTRY.apply(ctx, { root: join(root, 'k2'), clock: () => NOW, packs: ['v5r'] })
  await handle.ready()
  const kernel = handle.kernel || (handle.state && handle.state.kernel) || null
  const declared = kernel && typeof kernel.packTools === 'function' ? kernel.packTools() : []
  const meeting = declared.find((t) => t.name === 'vibe_v5_meeting')
  ok(!!meeting, 'the pack declared vibe_v5_meeting to the kernel', declared.length)
  ok(meeting && typeof meeting.validate === 'function',
    '★ the declaration\'s validate survived BOTH key maps (kernel registration + packTools()) — without this it can never run',
    meeting && Object.keys(meeting))

  const specs = []
  HPT.appendPackToolSpecs(specs, declared, [], kernel)
  const spec = specs.find((s) => s.name === 'vibe_v5_meeting')
  ok(!!spec, 'the funnel spec exists')
  const refused = await (async () => { try { await spec.run({ action: 'status', id: 'm-1' }, {}); return null } catch (e) { return e } })()
  ok(refused && refused.code === 'VMU_INVALID_ARGUMENT', 'the wrong-face call is refused', refused && refused.code)
  ok(refused && /only CONVENES/.test(String(refused.message)),
    '★ and the message is the PACK\'s sentence (the face only convenes), not the generic parameter list', refused && refused.message)
  ok(refused && /vibe_vmu_meeting \{ action: "status"/.test(String(refused.hint)),
    'its hint points at the face that CAN answer', refused && refused.hint)
  ok(refused && !/meeting needs an agenda/.test(String(refused.message)),
    'it does not pretend the agenda is missing — the misleading part of the original refusal', refused && refused.message)
}

// ── ⑥ THE REVERSE DIRECTION AT THE PACK FACE (live run 30, finding b-1) ────────────────────────────────────────────
// Run 30 proved the rule was only enforceable in ONE direction: `vibe_v5_meeting` had no `id` parameter, so a caller of
// the face the AGENT actually uses could never name a meeting — the reverse collision was inexpressible, hence
// unverifiable, and the primitive-side hint ("choose another id") was advice that face could not follow. `id` now exists.
console.log('=== 6. THE PACK FACE CAN NAME A MEETING, AND A TAKEN NAME IS REFUSED BY NAME ===')
{
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = ENTRY.apply(ctx, { root: join(root, 'k3'), clock: () => NOW, packs: ['v5r'] })
  await handle.ready()
  const kernel = handle.kernel || (handle.state && handle.state.kernel) || null
  const specs = []
  HPT.appendPackToolSpecs(specs, kernel && kernel.packTools ? kernel.packTools() : [], [], kernel)
  // the funnel THROWS a refusal (Error with code/hint) and RETURNS a JSON string on success — both are read here, and a
  // thrown refusal is never treated as "no answer" (that is how a refusal can look like a missing feature).
  const call = async (name, args) => {
    const spec = specs.find((s) => s.name === name)
    try {
      const raw = await spec.run(args, {})
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  await kernel.members.hire({ id: 'm-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'm-res', slot: 'member' })
  const prim = kernel.meeting({ id: 'p-taken-1', agenda: 'primitive meeting' })
  ok(prim && prim.id === 'p-taken-1', 'a primitive meeting holds an id the pack face will try to reuse', prim && prim.id)
  const refused = await call('vibe_v5_meeting', { member: 'm-acad', agenda: 'x', id: 'p-taken-1' })
  ok(refused && refused.ok === false && refused.code === 'VMU_CONFLICT',
    '★ the PACK face refuses an id the primitive registry holds (the reverse direction is now expressible)', refused && refused.code)
  ok(refused && /PRIMITIVE meeting registry/.test(String(refused.hint)),
    '★ and it names WHICH table holds it', refused && refused.hint)
}

// ── ⑦ `target` IS DECLARED AS AN ALIAS, AND AN OBJECT ON A TYPE THAT DEBATES NOTHING IS REFUSED ─────────────────────
// Run 30, finding b-2: the agent passed `target:"p-prim-1"` meaning "name the meeting that" and got a NEW meeting whose
// SUBJECT was that string. Two defects in one: the alias was undeclared, and an ordinary meeting silently accepted an
// object it can never use (which is what made the mistake invisible).
console.log('=== 7. THE `target` ALIAS IS DECLARED, AND A USELESS OBJECT IS REFUSED ===')
{
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = ENTRY.apply(ctx, { root: join(root, 'k4'), clock: () => NOW, packs: ['v5r'] })
  await handle.ready()
  const kernel = handle.kernel || (handle.state && handle.state.kernel) || null
  const declared = kernel && kernel.packTools ? kernel.packTools() : []
  const meeting = declared.find((t) => t.name === 'vibe_v5_meeting')
  ok(meeting && /ALIAS of `subject`/.test(String(meeting.description)),
    '★ the tool description STATES that `target` is an alias of `subject` (it was undeclared before)', meeting && String(meeting.description).slice(-260))
  ok(meeting && /do not carry the habit between faces/.test(String(meeting.description)),
    '★ and warns that the kernel face uses `target` for a VOTE\'s object', meeting && String(meeting.description).slice(-260))

  const specs = []
  HPT.appendPackToolSpecs(specs, declared, [], kernel)
  const call = async (name, args) => {
    const spec = specs.find((s) => s.name === name)
    try {
      const raw = await spec.run(args, {})
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  await kernel.members.hire({ id: 'm-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'm-res', slot: 'member' })
  const misuse = await call('vibe_v5_meeting', { member: 'm-acad', agenda: 'x', target: 'p-prim-1' })
  ok(misuse && misuse.ok === false && misuse.code === 'VMU_INVALID_ARGUMENT',
    '★ an object on a type that debates nothing is REFUSED (was silently filed as subject)', misuse && misuse.code)
  ok(misuse && /takes no object/.test(String(misuse.message)) && /ALIAS of `subject`/.test(String(misuse.hint)),
    'the refusal names the cause AND quotes the alias rule so the next reader cannot repeat it', misuse && misuse.message)
}

console.log('')
console.log('=== VMU MEETING NAME SPACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error(' - ' + f); process.exit(1) }
void KM
