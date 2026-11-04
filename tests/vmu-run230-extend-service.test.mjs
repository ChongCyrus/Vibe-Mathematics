#!/usr/bin/env node
/**
 * tests/vmu-run230-extend-service.test.mjs — RUN 230 / task-20: `extend`（发言延长）跨注册表。
 *
 * WHAT THIS PROVES (each assertion is paired with the premise it needs, per RULE E):
 *  §1 the SERVICE `extend` now has a caller and a receipt: a chair-named call raises the member's SPEECH budget
 *     (`extensions` grows, `max` reports the declared ceiling), the receipt is recorded on the service face
 *     (`at`/`action`/`by`), and `summary()`/`meetingView()` carry the raised bound back in `speechUsed[]` plus the
 *     four declared speech knobs — the two bounds stay named apart (`speechExtendMeans` says the WALL bound is
 *     `wallLimitMs`/`extendlimit`, and `extend` does NOT move it);
 *  §2 the chair rail (`vmu.meetings.extendRequiresChair`, the key `extendWall` already honours) is evaluated only
 *     when the caller names itself: a named non-chair is refused `VMU_NOT_PERMITTED`, a chair-less meeting refuses
 *     `VMU_ENGINE_UNAVAILABLE`, and an anonymous call keeps the pre-existing "the office may extend" behaviour the
 *     parity suite pins (the declared ceilings still refuse it by name);
 *  §3 the limits that already existed are untouched: the declared-step ceiling, "no declared step", an unknown id,
 *     and `extendlimit` (which must still move ONLY the meeting wall clock);
 *  §4 the TOOL face: `extend` is in the action enum and in `SERVICE_CROSSING_ACTIONS`, the pack boot routes a
 *     SERVICE id to the service (`registry:"service"`), a primitive meeting gets the NEW named refusal instead of
 *     the old raw TypeError, and the truthfully non-crossing verbs (`snapshot`/`hands`) keep their boundary text;
 *  §5 docs: the interface-contract meeting row registers the crossing and the read block.
 *
 * Run: node tests/vmu-run230-extend-service.test.mjs   (targeted only — never the full T1 suite)
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs' // fs-purpose: temp kernel root + the docs contract row
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { makeMeetingSpec, SERVICE_CROSSING_ACTIONS, primitiveMissError } from '../vibe-math-vmu/tools/meeting.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = join(tmpdir(), 'vmu-run230-extend-service')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const attempt = (fn) => { try { return { ok: true, value: fn() } } catch (e) { return { ok: false, error: e } } }
const errOf = (fn) => { const r = attempt(fn); return r.ok ? null : r.error }
const codeOf = (fn) => { const e = errOf(fn); return e ? (e.code || 'no-code') : 'NO-THROW' }
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 240) : text)

/* ── kernel harness: same shape tests/vmu-run225-late-admission.test.mjs uses ─────────────────────────────── */

let NOW = 1000
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const mk = (settings = {}) => {
  NOW = 1000
  return createMeetings({
    clock: () => NOW,
    settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings)),
    log: () => {},
  })
}
const ROSTER = ['acad', 'r-1', 'r-2']
const DECLARED = { 'vmu.meetings.speechExtendMs': 60000, 'vmu.meetings.speechExtendMax': 1 }

console.log('\n=== 1. THE SERVICE EXTEND: a chair-named call raises the SPEECH bound and the read faces say so ===')
{
  const t = mk(DECLARED)
  const o = t.open({ type: 'ordinary', chair: 'acad', roster: ROSTER })
  ok(o.ok === true, 'premise: a service meeting opens', o && o.meeting)
  const mid = o.meeting
  ok(o.wallLimitMs === 1800000 && o.extendedMs === undefined || o.extendedMs === 0,
    'premise: the meeting wall bound starts at the deployment default', { wall: o.wallLimitMs, ext: o.extendedMs })

  const e1 = t.extend({ meeting: mid, member: 'r-1', by: 'acad' })
  ok(e1.ok === true && e1.ms === 60000 && e1.extensions === 1 && e1.max === 1,
    'a chair-named extend succeeds and reports the declared step, the new count and the ceiling', { ms: e1.ms, extensions: e1.extensions, max: e1.max })
  ok(e1.by === 'acad', 'the receipt says WHO extended (by)', e1.by)
  ok(Array.isArray(e1.enforced) && e1.enforced.includes('vmu.meetings.speechExtendMs') && e1.enforcedScope === 'evaluated-so-far',
    'the receipt names the declared step in enforced[] and scopes it', { enforced: e1.enforced, scope: e1.enforcedScope })
  ok(e1.receipt && e1.receipt.action === 'extend' && e1.receipt.at === NOW && e1.receipt.meeting === mid && e1.receipt.member === 'r-1',
    'the service face records a receipt for it (action/at/meeting/member)', e1.receipt)
  has(e1.extendMeans, 'SPEECH', 'the receipt says WHICH bound moved (speech)')
  has(e1.extendMeans, 'extendlimit', 'and names the OTHER command (extendlimit = wall clock)')

  const view = t.meetingView({ meeting: mid })
  ok(Array.isArray(view.speechUsed) && view.speechUsed.length === 1
    && view.speechUsed[0].member === 'r-1' && view.speechUsed[0].extensions === 1 && view.speechUsed[0].speeches === 0,
    'meetingView carries the raised speech bound back (speechUsed[].extensions)', view && view.speechUsed)
  ok(view.speechExtendMs === 60000 && view.speechExtendMax === 1 && view.speechMaxMs === 0 && view.speechDefaultMs === 0,
    'meetingView also carries the declared speech knobs', { ms: view.speechExtendMs, max: view.speechExtendMax, cap: view.speechMaxMs, def: view.speechDefaultMs })
  has(view.speechExtendMeans, 'SPEECH', 'the view explains that this is the SPEECH bound')
  has(view.speechExtendMeans, 'extendlimit', 'and that the wall bound is a different command')

  const sum = t.summary({ meeting: mid })
  ok(JSON.stringify(sum.speechUsed) === JSON.stringify(view.speechUsed) && sum.speechExtendMax === 1,
    'summary() reports the SAME raised bound (one fact, two read faces)', { sum: sum.speechUsed, view: view.speechUsed })
  ok(sum.wallLimitMs === 1800000 && (sum.extendedMs || 0) === 0,
    '★ the SPEECH extension did NOT move the meeting wall clock (the two bounds are separate)', { wall: sum.wallLimitMs, ext: sum.extendedMs })

  // the second named call hits the DECLARED ceiling — the rail passed, the plan refused by name.
  const e2 = errOf(() => t.extend({ meeting: mid, member: 'r-1', by: 'acad' }))
  ok(e2 && e2.code === 'VMU_MEETING_SPEECH_TIMEBOUND', 'a named chair call past the declared ceiling refuses BY NAME (speech extensions)', e2 && e2.code)
  has(e2 && e2.message, 'speechExtendMax', 'the refusal names the key that refused it')

  // the receipts ring: both the open receipt and the extension receipt are on the service face's ledger.
  const st = t.status()
  ok(st.ok === true, 'premise: service status is readable', st && st.liveMeetings)
}

console.log('\n=== 2. THE CHAIR RAIL: named non-chair refused, chair-less refused, anonymous keeps the old behaviour ===')
{
  const t = mk(DECLARED)
  const mid = t.open({ type: 'ordinary', chair: 'acad', roster: ROSTER }).meeting
  const e = errOf(() => t.extend({ meeting: mid, member: 'r-1', by: 'r-1' }))
  ok(e && e.code === 'VMU_NOT_PERMITTED', 'a self-named NON-chair cannot extend a speech', e && e.code)
  has(e && e.message, 'acad', 'the refusal names the actual chair')
  has(e && e.hint, 'extendlimit', 'the hint points the wall-clock command at the right caller (extendlimit)')
  const after = t.meetingView({ meeting: mid })
  ok(Array.isArray(after.speechUsed) && after.speechUsed.length === 0,
    '★ a REFUSED extension leaves no trace in the speech budget (nothing was spent)', after && after.speechUsed)

  const noChair = t.open({ type: 'ordinary', roster: ROSTER })
  ok(noChair.ok === true && (noChair.chair === null || noChair.chair === undefined), 'premise: a meeting can open without a declared chair', noChair.chair)
  const e2 = errOf(() => t.extend({ meeting: noChair.meeting, member: 'r-1', by: 'acad' }))
  ok(e2 && e2.code === 'VMU_ENGINE_UNAVAILABLE', 'a named caller on a chair-less meeting is refused (no chair to check against)', e2 && e2.code)

  const t2 = mk(DECLARED)
  const mid2 = t2.open({ type: 'ordinary', chair: 'acad', roster: ROSTER }).meeting
  t2.extend({ meeting: mid2, member: 'r-1', by: 'acad' })
  const e3 = errOf(() => t2.extend({ meeting: mid2, member: 'r-1' }))
  ok(e3 && e3.code === 'VMU_MEETING_SPEECH_TIMEBOUND',
    '★ an ANONYMOUS call is not blocked by the rail (the parity suite pins this): the declared ceiling still refuses it', e3 && e3.code)
}

console.log('\n=== 3. THE OLD LIMITS ARE UNTOUCHED (declared step / no step / unknown id / extendlimit) ===')
{
  const t = mk({})
  const mid = t.open({ type: 'ordinary', chair: 'acad', roster: ROSTER }).meeting
  const e = errOf(() => t.extend({ meeting: mid, member: 'r-1' }))
  ok(e && e.code === 'VMU_INVALID_ARGUMENT', 'with NO declared step, extend refuses instead of inventing a duration', e && e.code)
  has(e && e.message, 'no extension step is declared', 'and says so in the same words')

  const e2 = errOf(() => t.extend({ meeting: 'm-does-not-exist', member: 'r-1', by: 'acad' }))
  ok(e2 && e2.code === 'VMU_NO_SUCH_OBJECT', 'an unknown meeting id refuses by name (not a TypeError)', e2 && e2.code)

  const t3 = mk(DECLARED)
  const o3 = t3.open({ type: 'ordinary', chair: 'acad', roster: ROSTER })
  t3.extend({ meeting: o3.meeting, member: 'r-1', by: 'acad' })
  const wall = t3.extendWall({ meeting: o3.meeting, ms: 600000, actor: 'acad' })
  ok(wall.ok === true && wall.extendedMs === 600000 && wall.wallLimitMs === 2400000,
    'extendlimit still raises the MEETING wall bound (the sibling command is untouched)', { wall: wall.wallLimitMs, ext: wall.extendedMs })
  const sum = t3.summary({ meeting: o3.meeting })
  ok(sum.extendedMs === 600000 && sum.speechUsed.length === 1 && sum.speechUsed[0].extensions === 1,
    '★ and the two bounds stay independent: extendlimit moved wall/ext, the speech row is unchanged', { ext: sum.extendedMs, speech: sum.speechUsed })
}

console.log('\n=== 4. THE TOOL FACE: enum, crossing set, service routing, primitive named refusal, untouched boundary verbs ===')
{
  const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const stub = makeMeetingSpec({ param, refused, TOOL_NAMES: { meeting: 'vibe_vmu_meeting' }, kernel: {} })
  ok(stub && stub.parameters && Array.isArray(stub.parameters.action.enum), 'premise: the tool spec declares an action enum')
  ok(stub.parameters.action.enum.includes('extend'), 'the tool action enum advertises extend')
  ok(SERVICE_CROSSING_ACTIONS.includes('extend'), 'extend is in SERVICE_CROSSING_ACTIONS (the service forwarding whitelist)')
  ok(!SERVICE_CROSSING_ACTIONS.includes('snapshot') && !SERVICE_CROSSING_ACTIONS.includes('agendaitems'),
    '★ verbs that truthfully never cross stay OUT of the crossing set (snapshot/agendaitems)')
  const snap = primitiveMissError({ id: 'm1', inService: true, action: 'snapshot' })
  ok(snap && snap.code === 'VMU_REGISTRY_BOUNDARY' && snap.boundaryOnly === true,
    '★ their refusal is unchanged: still boundary-first, boundaryOnly:true', { code: snap && snap.code, boundaryOnly: snap && snap.boundaryOnly })
  has(snap && snap.message, 'never crosses', 'and the message still says the verb never crosses registries')

  // a primitive meeting object has no `extend` method: the tool face must refuse it BY NAME, not leak a TypeError.
  const primSpec = makeMeetingSpec({
    param,
    refused,
    TOOL_NAMES: { meeting: 'vibe_vmu_meeting' },
    kernel: {
      liveMeeting: (id) => (String(id) === 'mp-ext' ? { id: 'mp-ext', state: 'open' } : null),
      liveList: () => ({ meetings: ['mp-ext'] }),
      meetings: null,
    },
  })
  const primRaw = await primSpec.run({ action: 'extend', id: 'mp-ext', member: 'r-1', ms: 60000, by: 'acad' })
  const primOut = typeof primRaw === 'string' ? JSON.parse(primRaw) : primRaw
  ok(primOut && primOut.ok === false && primOut.code === 'VMU_INVALID_ARGUMENT',
    '★ a PRIMITIVE meeting refuses extend by name (was: a raw TypeError leaking as VMU_STATE)', primOut && primOut.code)
  has(primOut && primOut.hint, 'vibe_v5_meeting', 'and the hint points at the service face that does carry a speech budget')
}

console.log('\n=== 5. THE INTERFACE CONTRACT registers the crossing ===')
{
  const DOC = readFileSync(join(VMU, 'docs', '03-interface-contract.md'), 'utf8')
  const meetingRow = DOC.split('\n').filter((line) => {
    if (!line.startsWith('|')) return false
    return String((line.split('|')[1] || '')).includes('vibe_vmu_meeting')
  })[0] || ''
  ok(meetingRow.length > 0, 'premise: the contract has a meeting tool row')
  has(meetingRow, 'RUN 230', 'the contract records RUN 230 on that row')
  has(meetingRow, 'speechUsed', 'and names the read block that proves the bound moved (speechUsed)')
  has(meetingRow, 'registry:"service"', 'and says extend reports its registry')
}

/* ── the real pack boot: the tool face against a REAL kernel ─────────────────────────────────────────────── */

mkdirSync(TMP, { recursive: true })
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const specs = []
const root = mkdtempSync(join(TMP, 'k-'))
const ctx = {
  effect: (fn) => fn(),
  on: () => () => {},
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const handle = entry.apply(ctx, {
  clock: () => 1000,
  packs: ['v5r'],
  root,
  vmu: { 'vmu.meetings.lateAfterMs': 100, 'vmu.meetings.speechExtendMs': 60000, 'vmu.meetings.speechExtendMax': 1 },
})
await handle.ready()
await handle.kernel.store.open()
const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
const call = async (name, args = {}) => {
  const spec = specOf(name)
  if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
  try {
    const raw = await spec.execute(args, { kernel: handle.kernel })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
  } catch (e) {
    return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
  }
}

console.log('\n=== 6. REAL PACK BOOT: vibe_vmu_meeting { action:"extend" } on a SERVICE meeting ===')
{
  ok(specOf('vibe_vmu_meeting') !== null, 'premise: the v5r boot registers the meeting tool')
  const booted = specOf('vibe_vmu_meeting')
  const props = (booted.parameters && booted.parameters.properties) || {}
  const enumVals = (props.action && Array.isArray(props.action.enum)) ? props.action.enum : []
  ok(enumVals.includes('extend'), 'the REGISTERED tool enum contains extend')

  const opened = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'], at: 500, actor: 'r-acad' })
  ok(opened.ok === true, 'premise: a service meeting is open', opened && opened.meeting)
  const mid = opened.meeting

  const ext = await call('vibe_vmu_meeting', { action: 'extend', id: mid, member: 'r-1', by: 'r-acad' })
  ok(ext.ok === true && ext.registry === 'service', '★ the tool crosses: extend on a SERVICE meeting now succeeds and says registry:"service"', { ok: ext.ok, code: ext.code, registry: ext.registry })
  ok(ext.ms === 60000 && ext.extensions === 1 && ext.max === 1, 'and reports the declared step / new count / ceiling', { ms: ext.ms, extensions: ext.extensions, max: ext.max })
  has(ext.extendMeans, 'extendlimit', 'the tool receipt keeps the two bounds named apart')

  const st = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st.ok === true && Array.isArray(st.speechUsed) && st.speechUsed.length === 1 && st.speechUsed[0].extensions === 1,
    '★ status reads the raised SPEECH bound back (speechUsed[].extensions)', st && st.speechUsed)
  const sm = await call('vibe_vmu_meeting', { action: 'summary', id: mid })
  ok(sm.ok === true && JSON.stringify(sm.speechUsed) === JSON.stringify(st.speechUsed),
    'summary agrees with status (one fact, two read faces)', { status: st.speechUsed, summary: sm && sm.speechUsed })
  ok((sm.extendedMs || 0) === 0, '★ and the wall bound is still untouched by extend', sm && sm.extendedMs)

  const bad = await call('vibe_vmu_meeting', { action: 'extend', id: mid, member: 'r-1', by: 'r-1' })
  ok(bad.ok === false && bad.code === 'VMU_NOT_PERMITTED', 'a self-named non-chair is refused through the tool face', { ok: bad.ok, code: bad.code })

  const wall = await call('vibe_vmu_meeting', { action: 'extendlimit', id: mid, ms: 600000, by: 'r-acad' })
  ok(wall.ok === true && wall.registry === 'service' && wall.extendedMs === 600000,
    'premise: extendlimit still raises the meeting wall bound through the same face', { ok: wall.ok, ext: wall.extendedMs })
  const st2 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st2.extendedMs === 600000 && st2.speechUsed[0].extensions === 1,
    '★ after extendlimit the two bounds are visibly different facts on one read face', { ext: st2.extendedMs, speech: st2.speechUsed })

  // primitive: a real primitive meeting object has no speech budget -> named refusal, not a TypeError.
  const prim = handle.kernel.meeting({ id: 'mp-ext-1' })
  ok(prim && typeof prim.id === 'string', 'premise: a primitive meeting can be created on the live table', prim && prim.id)
  const primOut = await call('vibe_vmu_meeting', { action: 'extend', id: 'mp-ext-1', member: 'r-1', ms: 60000, by: 'r-acad' })
  ok(primOut.ok === false && primOut.code === 'VMU_INVALID_ARGUMENT',
    '★ a real primitive meeting refuses extend by name (the old path leaked "live(...).extend is not a function")', { ok: primOut.ok, code: primOut.code, message: String(primOut.message).slice(0, 160) })
  ok(String(primOut.message).indexOf('is not a function') === -1, 'and no raw TypeError text survives in the receipt', String(primOut.message).slice(0, 160))
}

console.log('\n──────────────────────────────────────────────────────────────')
console.log('RUN 230 extend-service: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('RESULT: PASS')
}
