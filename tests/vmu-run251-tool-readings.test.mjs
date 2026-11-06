// RUN 251-B — the 71st real-machine run (build 0a9e9783) filed four defects on the v5r tool face, all about a receipt
// that could not answer the question it existed for:
//
//   F71-3 (中) a card filed with NO proof fields came back with `proofGate:null`. "Not locked" and "the face forgot to
//             report the gate" are then the same receipt. Every draft now reports `locked:false` + a NAMED reason
//             (`default-draft`, `declared-draft`, `read-back-default-draft`, …).
//   F71-4 (中) a DRAFT card's `lockNote` said its `proof_state` "says complete" — the sentence was state-blind. A draft's
//             lock note now states the draft fact and never borrows the word "complete".
//   F71-7 (中) with no live session `tool_help` answered `count:null / tools:null / source:"no-live-agent"`, so the
//             three seats' 48/27/8 readings could not be measured on a real machine. The DECLARED set is static: it is
//             now always printed (`declarationSet` + `declaredCount/allowCount/denyCount/seatFilter`) and kept clearly
//             separate from `measuredSet` (which needs a live Agent).
//   F71-8 (中) "no session" was told two ways — `VMU_MEMBER_SESSION_NOT_LIVE` when a child had existed, the catch-all
//             `VMU_NO_SUCH_OBJECT` when none ever had — and neither hint named a reachable repair. It is now two named
//             answers with the ONE action that fixes each: NEVER_OPENED ⇒ seat/assign/drive; NOT_LIVE ⇒ drive again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PACK_PATH = join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const PACK = readFileSync(PACK_PATH, 'utf8')

const packMod = await import(pathToFileURL(PACK_PATH).href)
const seatMod = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')).href)
// The INDEPENDENT criterion: the declared faces come from the pack's own published tool list, and the allow/deny split
// comes from the seat-face table — never from the reading under test.
const DECLARED_NAMES = packMod.V5R_PACK_TOOLS.map((t) => (t && t.name) || null).filter((x) => typeof x === 'string')

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
}
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — found (must be gone): ' + needle)

const R = (r) => r || { ok: false }

async function boot(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((x) => x && x.name === name)[0]
    if (!spec) return { ok: false, code: 'NO_SUCH_FACE', message: name }
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, call, kernel: handle.kernel, specs }
}

const root = mkdtempSync(join(tmpdir(), 'vmu-run251-'))
const b = await boot(root)
for (const [id, slot] of [['acad-01', 'chair'], ['r-1', 'member'], ['t-1', 'temp']]) {
  await b.kernel.members.hire({ id, slot, institution: 'sim' })
}

test('§0 every repair is on the source that owns it (source pins, so §1-§4 cannot pass by accident)', () => {
  const gateBlock = PACK.slice(PACK.indexOf('const proofGateOut'), PACK.indexOf('const p1ProofGateOut'))
  ok(gateBlock.length > 500, '§0c precondition: the gate block was located in the source', gateBlock.length)
  hasNot(gateBlock, '? null', '§0d ★★★ F71-3: no shape of the gate can answer proofGate:null (write path or read-back)')
  has(gateBlock, "reason: 'default-draft'", '§0e ★★★ F71-3: the no-declaration write path names the default draft')
  has(gateBlock, "reason: 'read-back-default-draft'", '§0f ★★ F71-3: the settlement read-back path names it too')
  has(PACK, 'a NOT-yet-finished registration', '§0e ★★ F71-4: a draft lock note speaks about the draft')
  has(PACK, 'export function sessionRefusalOf(', '§0f ★★★ F71-8: the cause→refusal translation is ONE exported function')
  has(PACK, 'VMU_MEMBER_SESSION_NEVER_OPENED', '§0g ★★★ F71-8: the never-opened fact has its own name')
  has(PACK, 'seatDenyNames', '§0h ★★★ F71-7: the deny list is COMPUTED from the seat-face table, not retyped')
  ok(PACK.length > 100000, '§0i sanity: the source read is the real file', PACK.length)
})

test('§1 F71-3 — every shape of "a card that is not locked" says so, with a reason', async () => {
  // Shape 1: NOTHING declared — the default draft (the measured defect: proofGate:null).
  const plain = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r251 default', value: '未定论', motive: 'run251 default shape', p: 0.5, member: 'r-1',
  }))
  eq(plain.ok, true, '§1a precondition: a card declaring no proof state is admitted', plain && { code: plain.code, message: plain.message })
  ok(plain.proofGate && typeof plain.proofGate === 'object', '§1b ★★★ F71-3: the default card REPORTS its gate (null left the question unanswered)', { proofGate: plain.proofGate })
  eq(plain.proofGate.locked, false, '§1c ★★★ ...and it is not locked', plain.proofGate)
  eq(plain.proofGate.reason, 'default-draft', '§1d ★★★ ...and the reason names the default draft', plain.proofGate && plain.proofGate.reason)
  eq(plain.proofGate.proofRefState, 'absent', '§1e ★ ...with no pointer to resolve', plain.proofGate && plain.proofGate.proofRefState)
  eq(plain.proofState, null, '§1f ★ ...and proofState stays null: the gate names the default, it does not invent a state', plain.proofState)

  // Shape 2: explicitly declared draft (already pinned in run249 §3, kept here for the three-shape sweep).
  const draft = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r251 draft', value: 'objects', motive: 'run251 draft shape', p: 0.5,
    proof_state: 'draft', proof_ref: 'r251-missing-proof.md', member: 'r-1',
  }))
  eq(draft.ok, true, '§1g precondition: a declared draft is admitted', draft && { code: draft.code, message: draft.message })
  eq(draft.proofGate && draft.proofGate.locked, false, '§1h ★★★ a declared draft is not locked', draft.proofGate)
  eq(draft.proofGate && draft.proofGate.reason, 'declared-draft', '§1i ★★ and the reason is its own named value', draft.proofGate && draft.proofGate.reason)

  // Shape 3: complete but the pointer does not resolve — a deferred lock, named.
  const unresolved = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r251 unresolved', value: 'objects', motive: 'run251 unresolved shape', p: 0.5,
    proof_state: 'complete', proof_ref: 'r251-missing-proof.md', member: 'r-1',
  }))
  eq(unresolved.ok, true, '§1j precondition: complete-with-a-broken-pointer is admitted', unresolved && { code: unresolved.code })
  eq(unresolved.proofGate && unresolved.proofGate.locked, false, '§1k ★★★ complete + unresolvable is NOT locked', unresolved.proofGate)
  eq(unresolved.proofGate && unresolved.proofGate.reason, 'complete-but-pointer-unresolved', '§1l ★★ and it names the failed lookup', unresolved.proofGate && unresolved.proofGate.reason)
  eq(unresolved.proofRefState, 'missing', '§1m ★ the pointer state is also at top level', unresolved.proofRefState)

  // Shape 4: complete AND resolving — still locked, so the gate was made honest, not weak.
  const libRoot = (() => { try { return b.kernel.library && typeof b.kernel.library.root === 'string' ? b.kernel.library.root : null } catch (e) { return null } })()
  ok(libRoot !== null, '§1n precondition: the kernel exposes a library root', { libRoot })
  if (libRoot !== null) {
    mkdirSync(libRoot, { recursive: true })
    writeFileSync(join(libRoot, 'r251-proof.md'), '# r251 proof\n\ncomplete registration.\n')
    const locked = R(await b.call('vibe_v5_record_proposition', {
      statement: 'r251 locked', value: 'objects', motive: 'run251 locked shape', p: 0.5,
      proof_state: 'complete', proof_ref: 'r251-proof.md', member: 'r-1',
    }))
    eq(locked.proofGate && locked.proofGate.locked, true, '§1o ★★★ complete AND resolving is still LOCKED (rule L14 kept)', locked.proofGate)
    eq(locked.proofGate && locked.proofGate.reason, 'complete-and-resolved', '§1p ★ and the reason says both halves held', locked.proofGate && locked.proofGate.reason)
  }
})

test('§2 F71-4 — a draft lock note never claims the registration is complete', async () => {
  const draft = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r251 locknote', value: 'objects', motive: 'run251 locknote', p: 0.5,
    proof_state: 'draft', proof_ref: 'r251-missing-proof.md', member: 'r-1',
  }))
  eq(draft.ok, true, '§2a precondition: the draft-with-pointer card is admitted', draft && { code: draft.code, message: draft.message })
  const evidence = draft.proofStateEvidence
  ok(evidence && typeof evidence === 'object', '§2b precondition: the receipt carries proofStateEvidence (where lockNote lives)', evidence && evidence.kind)
  const lockNote = String((evidence && evidence.lockNote) || '')
  ok(lockNote !== '', '§2c precondition: the draft card carries a lockNote at all', { lockNote })
  hasNot(lockNote, 'complete', '§2d ★★★ F71-4: a DRAFT lock note never borrows the word "complete" (the measured defect said its proof_state says complete)')
  hasNot(lockNote, 'Complete', '§2e ★★ ...nor a capitalised variant')
  has(String(lockNote).toLowerCase(), 'draft', '§2f ★★ ...and it does state the draft fact instead')
  has(lockNote, 'L14', '§2g ★ the note still names the rule that keeps the card writable')
})

test('§3 F71-7 — the DECLARED set is readable with NO live session, and the test recomputes it independently', async () => {
  eq(DECLARED_NAMES.length, 48, '§3a RUN 251 anchor: the pack publishes 48 faces (the run-71 machine printed 48/27/8)', DECLARED_NAMES.length)
  const expectations = { chair: 48, member: 27, temp: 8 }
  for (const [id, seat] of [['acad-01', 'chair'], ['r-1', 'member'], ['t-1', 'temp']]) {
    const read = R(await b.call('vibe_v5_tool_help', { member: id }))
    eq(read.ok, true, '§3b ★★★ tool_help answers for ' + seat + ' with no live session (the measured defect returned nulls)', read && { code: read.code, message: read.message })
    const indepAllow = seatMod.seatAllowNames(seat, DECLARED_NAMES)
    const indepDeny = seatMod.seatDenyNames(seat, DECLARED_NAMES)
    eq(read.declaredCount, DECLARED_NAMES.length, '§3c ★★ declaredCount is the pack count for ' + seat, read.declaredCount)
    eq(read.allowCount, indepAllow.length, '§3d ★★★ allowCount matches the independently computed allow list for ' + seat, read.allowCount)
    eq(read.denyCount, indepDeny.length, '§3e ★★★ denyCount matches the independently computed deny list for ' + seat, read.denyCount)
    eq(read.allowCount + read.denyCount, read.declaredCount, '§3f ★★ allow + deny = declared (the split is complete) for ' + seat, [read.allowCount, read.denyCount, read.declaredCount])
    eq(read.allowCount, expectations[seat], '§3g RUN 251 anchor: ' + seat + ' reads ' + expectations[seat] + ' allowed faces', read.allowCount)
    ok(read.seatFilter && Array.isArray(read.seatFilter.present) && Array.isArray(read.seatFilter.absent),
      '§3h ★★ seatFilter carries the present/absent NAME lists for ' + seat, read.seatFilter && Object.keys(read.seatFilter))
    eq(read.seatFilter && read.seatFilter.seat, seat, '§3i ★ the filter names the seat it filtered by', read.seatFilter && read.seatFilter.seat)
    // RUN 251 / audit RULE A: compare the two lists as SORTED SETS rather than with every(), so the
    // assertion cannot be "true because the list was empty" — the counts above already forbid that, and
    // an empty published list would now differ from a non-empty computed one.
    const publishedPresent = read.seatFilter && Array.isArray(read.seatFilter.present) ? read.seatFilter.present.slice().sort() : []
    const publishedAbsent = read.seatFilter && Array.isArray(read.seatFilter.absent) ? read.seatFilter.absent.slice().sort() : []
    eq(publishedPresent.length, indepAllow.length,
      '§3j ★★★ the published PRESENT list has exactly the independently computed size for ' + seat, publishedPresent.length)
    eq(JSON.stringify(publishedPresent), JSON.stringify(indepAllow.slice().sort()),
      '§3k ★★★ the published PRESENT list IS the independently computed one for ' + seat,
      read.seatFilter && { p: read.seatFilter.presentCount })
    eq(publishedAbsent.length, indepDeny.length,
      '§3l ★★ the published ABSENT list has exactly the independently computed size for ' + seat, publishedAbsent.length)
    eq(JSON.stringify(publishedAbsent), JSON.stringify(indepDeny.slice().sort()),
      '§3m ★★★ the published ABSENT list IS the independently computed one for ' + seat,
      read.seatFilter && { a: read.seatFilter.absentCount })
    ok(read.declarationSet && read.declarationSet.seat === seat && read.declarationSet.allowCount === read.allowCount,
      '§3n ★ the nested declarationSet agrees with the top-level counts for ' + seat, read.declarationSet && { seat: read.declarationSet.seat, allow: read.declarationSet.allowCount })
    has(String(read.declarationSetMeans || ''), 'DECLARATION', '§3o ★★ the receipt says which reading this is (declaration, not live)')
    // The OTHER reading must stay honestly unavailable, never a silent empty list.
    ok(read.measuredSet && read.measuredSet.available === false && read.measuredSet.count === null,
      '§3p ★★ measuredSet is null-because-no-session for ' + seat + ' (not an empty tool list)', read.measuredSet && { a: read.measuredSet.available, c: read.measuredSet.count })
    has(String(read.measuredSetMeans || ''), 'not', '§3q ★ measuredSetMeans says count:null does not mean "sees nothing"')
  }
})

test('§4 F71-8 — the two "no session" facts are two named refusals with reachable hints', async () => {
  // Real kernel, no session ever opened: the NEVER_OPENED branch, end to end.
  const read = R(await b.call('vibe_v5_tool_help', { member: 'r-1' }))
  eq(read.ok, true, '§4a precondition: the declaration reading itself succeeds', read && { code: read.code })
  ok(read.refusal && read.refusal.code === 'VMU_MEMBER_SESSION_NEVER_OPENED',
    '§4b ★★★ F71-8: a member who never opened a session is named NEVER_OPENED', read.refusal && read.refusal.code)
  ok(read.refusal && read.refusal.code !== 'VMU_NO_SUCH_OBJECT',
    '§4c ★★★ ...and NOT the catch-all (the measured defect told this fact two ways)', read.refusal && read.refusal.code)
  ok(read.refusal && /vibe_vmu_turn|vibe_v5_assign|vibe_vmu_control/.test(String(read.refusal.hint || '')),
    '§4d ★★★ the NEVER_OPENED hint names a reachable action (seat / assign / drive)', read.refusal && read.refusal.hint)
  has(String(read.refusal && read.refusal.means).toLowerCase(), 'never', '§4e ★ the refusal says WHY it differs from the ended case')
  eq(read.refusal.childId, null, '§4f ★ there is no child id to report: nothing was ever opened', read.refusal && read.refusal.childId)

  // The ENDED branch cannot be driven through a stub kernel (the kernel wraps every pack tool with a roster check and
  // owns the cause), so it is pinned at the exported translator the face itself calls.
  const endedView = {
    ok: true, member: 'r-9', count: null, tools: null, hidden: [], source: 'no-live-agent', liveAgent: false,
    cause: 'child-session-not-live', childId: 'session-child-9',
    refusal: { code: 'VMU_MEMBER_SESSION_NOT_LIVE', message: 'child finished', hint: null },
  }
  const ended = packMod.sessionRefusalOf({ view: endedView, member: 'r-9' })
  eq(ended && ended.code, 'VMU_MEMBER_SESSION_NOT_LIVE', '§4g ★★★ F71-8: an ENDED session keeps its own name', ended && ended.code)
  ok(/vibe_vmu_turn \{op:"drive"/.test(String(ended && ended.hint)), '§4h ★★★ the ENDED hint names the reopen action (drive the member again)', ended && ended.hint)
  eq(ended && ended.childId, 'session-child-9', '§4i ★ the ended refusal names the child that finished', ended && ended.childId)
  ok(ended && ended.code !== 'VMU_MEMBER_SESSION_NEVER_OPENED', '§4j ★★★ the two facts stay distinct', ended && ended.code)
  ok(packMod.sessionRefusalOf({ view: { liveAgent: true, tools: ['a', 'b'] }, member: 'r-9' }) === null,
    '§4k ★ a LIVE session is not refused at all (the translation only speaks when there is no wire)')
  ok(packMod.sessionRefusalOf({ view: null, member: 'r-9' }) !== null,
    '§4l ★ a missing view is treated as "no session", never as "all good"')
})

test('§5 F71-12/13 alignment — a scheduled meeting never claims that the clock opens it', async () => {
  const sched = R(await b.call('vibe_v5_meeting', {
    action: 'schedule', id: 'm-r251-sched', member: 'acad-01', members: ['acad-01', 'r-1'],
    title: '预约 +180s', at: '+180s', agenda: ['预约测试'],
  }))
  eq(sched.ok, true, '§5a precondition: the scheduled convene is admitted', sched && { code: sched.code, message: sched.message })
  eq(sched.state, 'scheduled', '§5b the meeting is scheduled, not open', sched.state)
  // 内核 RUN 251-C 已选②：框架不替主席开会。回执必须自己说出这一点，而不是让读者推断。
  eq(sched.requiresChairProceed, true, '§5c ★★★ the receipt says the CHAIR must proceed (opening is not the framework decision)', sched.requiresChairProceed)
  has(String(sched.requiresChairProceedMeans), 'proceed', '§5d ★★ ...and its means names proceed as the way forward')
  ok(/never/i.test(String(sched.requiresChairProceedMeans)), '§5e ★★★ ...and says opening is NEVER the framework own decision', sched.requiresChairProceedMeans)
  ok(Array.isArray(sched.nextActions) && sched.nextActions.some((a) => a && a.action === 'proceed'),
    '§5f ★★★ nextActions is the kernel action table and it names proceed', sched.nextActions)
  eq(sched.waitingFor, null, '§5g waitingFor is null while merely scheduled (it is not waiting yet)', sched.waitingFor)
  ok(typeof sched.startsInMs === 'number' && sched.startsInMs > 0, '§5h ★★ startsInMs says how far away the start is', sched.startsInMs)
  eq(sched.elapsedSinceMs, null, '§5i ★ elapsedSinceMs is only for a started meeting (never negative)', sched.elapsedSinceMs)
  eq(sched.atSource, 'relative', '§5j ★★ the receipt names which time spelling the caller used', sched.atSource)
  ok(typeof sched.scheduledForIso === 'string' && sched.scheduledForIso.length > 10,
    '§5k ★★ the RESOLVED instant is published, so no reader has to re-parse "+180s"', sched.scheduledForIso)
  // ★★★ 判据：pack 回执不得再出现「到点自动转 open / 自动开始」的表述。
  hasNot(String(sched.scheduleNote), '自动', '§5l ★★★ RUN 251-C: the pack note never says anything starts automatically')
  hasNot(String(sched.scheduleNote), '转 open', '§5m ★★★ ...and never says the clock turns it open')
  has(String(sched.scheduleNote), 'proceed', '§5n ★★ the note names the chair proceed as the reachable action')
  // 立即召开的会议不编造预约说明（旧行为保持）。
  const now = R(await b.call('vibe_v5_meeting', { action: 'convene', id: 'm-r251-now', member: 'acad-01', members: ['acad-01', 'r-1'], title: '立刻', agenda: ['立即测试'] }))
  eq(now.ok, true, '§5o precondition: an immediate convene is admitted', now && { code: now.code })
  eq(now.state, 'open', '§5p the immediate meeting opens now', now.state)
  eq(now.scheduleNote, null, '§5q ★ no scheduling note on a meeting that did not schedule anything', now.scheduleNote)
  eq(now.atSource, null, '§5r ★ and no at-provenance either (there was no `at`)', now.atSource)
  // 源码钉：被撤回的那句话不能再回来。
  hasNot(PACK, '到点后按法定人数转 open', '§5s ★★★ the retracted sentence is gone from the source')
  has(PACK, 'requiresChairProceedMeans', '§5t ★★ the receipt forwards the kernel field that carries the stance')
})

test('§6 cleanup', () => {
  try { rmSync(root, { recursive: true, force: true }) } catch (e) { /* best effort */ }
  ok(n > 0, '§6 assertions ran', n)
  console.log('RUN 251 assertions: ' + n)
})
