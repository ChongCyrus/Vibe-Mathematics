// ★ RUN 257 / TB-2639 (task-120) — A ROW THE LOOP REPORTS AS `open` IS A STATE THE LOOP MUST BE ABLE TO LEAVE.
//
// MEASURED (task-120 probe, and §1 below): park t-1 on the caller-played route; stage a reply that is prose with no
// fenced JSON envelope; `step` again — the RESUME consumes the seam slot (deliverByReturning takes the supplied text and
// clears pendingPrompt+supplied) and the refusal branch in `runFrom` deliberately does NOT flip the row ("the refusal
// already says this turn did not apply"). What is left is this:
//
//   turnReceipts: [{ turn:"t-1", status:"open" }]      ← the loop's OWN status reports it as open
//   turnLoop:     { inFlight:false, parked:false, openTurns:1 }
//   abandon({turn:"t-1"}) → { abandoned:false, means:"no turn is IN FLIGHT … the row is bookkeeping" }
//
// i.e. the loop could SEE the row and had no door to close it: the parked branch cannot reach it (no slot), the
// in-flight branch cannot reach it (no lock). RUN 241's lesson in its other form. THIS SUITE PINS THE DOOR:
//   §2 `op:"abandon"` with { turn:"<id>" } settles exactly that NAMED row — status "abandoned",
//      settledBy "abandoned-orphan", the reason it outlived its delivery written on the row.
//   §3 the door is really OPEN afterwards: the next step for that member opens a real turn (no VMU_TURN_REENTRANT, no
//      VMU_TURN_ALREADY_PARKED, no refusal code at all). NOTE, measured honestly: the pre-fix symptom was a row left
//      `open` FOREVER, not a REENTRANT refusal — the pre-fix run could still open t-2. So the "gate" this suite can
//      measure is "the row is terminal and the loop is not stuck", which is what §1b+§2+§3 assert together.
//   §4 it is NOT a master key: no name ⇒ still the honest abandoned:false, and the kernel never picks a row on its
//      own. BUT (AUDIT-14 P1-5) naming a row is a BOOKKEEPING act: it closes exactly that row even while another
//      seat's prompt is parked or another turn is in flight — the parked prompt and the in-flight lock are NOT
//      touched, because those are other doors. What the door refuses is everything except the one named row.
//   §5 idempotent; §6 an unknown id is a NAMED refusal (VMU_NO_SUCH_OBJECT, with the ids this loop actually holds).
//   §7 the tool face passes the name through and returns the same closure.
//
// Run: node tests/vmu-run257-abandon-orphan.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const turnSource = await readFile(TURN, 'utf8')
const toolSource = await readFile(TOOLS, 'utf8')

const { toolSpecs, TOOL_NAMES } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r257-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller', vmu: {} })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, ctx }
}

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const attempt = async (fn) => {
  try { return { threw: false, value: await fn() } } catch (e) {
    return { threw: true, code: (e && e.code) || null, message: e && e.message, hint: e && e.hint, value: null }
  }
}
const rowsOf = (K, turnId) => {
  const st = K.turn.status()
  return (st.turnReceipts || []).filter((r) => r && String(r.turn) === String(turnId))
}
const openRows = (K) => (K.turn.status().turnReceipts || []).filter((r) => r && r.status === 'open')

// The measured orphan: park a caller-played turn, stage a reply the channel cannot parse, and let the resume refuse.
const makeOrphan = async (K, member) => {
  const parked = await K.turn.step({ members: [member], phase: 'normal', why: 'run257 park ' + member })
  const turnId = parked && parked.memberPrompt && parked.memberPrompt.turnId
  const promptId = parked && parked.memberPrompt && parked.memberPrompt.promptId
  const supplied = await K.turn.supplyMemberReply('这一步我想说点什么，但完全忘了围栏。', member)
  const resumed = await K.turn.step({ members: [member], phase: 'normal', why: 'run257 answer without a fence' })
  return { parked, turnId, promptId, supplied, resumed }
}

try {
  // ── §0 ONE DOOR, ONE NAME, ONE CALL SITE ───────────────────────────────────────────────────────────────────────
  {
    console.log('§0 the orphan door is one named helper with exactly one caller')
    ok(turnSource.includes("settledBy: 'abandoned-orphan'"), '§0a the closure names its own exit (settledBy "abandoned-orphan")')
    ok(turnSource.includes('const closeOrphanTurn = (') && (turnSource.match(/closeOrphanTurn\(/g) || []).length === 1,
      '§0b one definition + exactly ONE caller (abandonTurn) — no second copy can drift',
      { defs: (turnSource.match(/const closeOrphanTurn = \(/g) || []).length, calls: (turnSource.match(/closeOrphanTurn\(/g) || []).length })
    ok(turnSource.includes('const namedTurnId = turn === null'),
      '§0c the door is keyed on the NAMED id, not on a scan of the ledger')
    ok(turnSource.includes("refuse('VMU_NO_SUCH_OBJECT'"),
      '§0d an unknown id is refused by name (the contract code for "no such object"), not closed silently')
    ok(turnSource.includes('orphanWhy'),
      '§0e the row records WHY it had outlived its delivery (not just a status flip)')
    ok(toolSource.includes('kernel.turn.abandon({ turn: wantTurn, why: args.why })'),
      '§0f the tool face already passes the name through (kernel-side door only, no second parameter path)')
  }

  // ── §1 THE STATE THAT NEEDS THE DOOR ──────────────────────────────────────────────────────────────────────────
  {
    console.log('§1 a resume the channel cannot parse leaves a row `open` with nothing in flight and nothing parked')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    ok(o.parked && o.parked.awaiting === true, '§1a the first step parks the caller-played turn', o.parked && o.parked.awaiting)
    ok(typeof o.turnId === 'string' && o.turnId !== '', '§1b the parked prompt names its turn', o.turnId)
    ok(o.supplied && o.supplied.ok === true, '§1c the prose reply is staged for that member', o.supplied)
    const resumed = o.resumed || {}
    ok(resumed.ok === false && resumed.receipt === null, '§1d the resume is REFUSED (returned, not thrown) with no receipt', { ok: resumed.ok, code: resumed.code })
    ok(resumed.code === 'VMU_TURN_NO_FENCE', '§1e the refusal names the channel defect', resumed.code)
    const rows = rowsOf(K, o.turnId)
    ok(rows.length === 1 && rows[0].status === 'open',
      '§1f ★★★ the row is still `open` — the loop itself reports this turn as unsettled', rows.map((r) => r.status))
    const loop = K.turn.turnLoop()
    ok(loop.inFlight === false && loop.parked === false && loop.openTurns === 1,
      '§1g ★★★ and it is an ORPHAN: nothing is in flight, nothing is parked, one row is open', { inFlight: loop.inFlight, parked: loop.parked, openTurns: loop.openTurns })
    ok(K.turn.status().turns === 1, '§1h the refusal did not open a second turn', K.turn.status().turns)
    const before = await attempt(() => { const out = K.turn.abandon({ turn: 't-1' }); return out })
    // (pre-fix this same call answered abandoned:false; §2 is the pin for the repaired answer)
    ok(before.threw === false && before.value && typeof before.value.means === 'string',
      '§1i abandon by name is answerable on this state (the door exists to be asked)', before.threw ? before.code : null)
  }

  // ── §2 THE NAMED ROW IS SETTLED ───────────────────────────────────────────────────────────────────────────────
  {
    console.log('§2 op:"abandon" { turn:"<id>" } settles that row: status abandoned, settledBy abandoned-orphan, reason on the row')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    const closed = K.turn.abandon({ turn: o.turnId, why: 'run257: the row outlived its delivery' })
    ok(closed && closed.ok === true, '§2a the named abandon succeeds', closed && { ok: closed.ok, code: closed.code })
    ok(closed.abandoned === true, '§2b ★★★ it really CLOSED something (not the pre-fix abandoned:false)', closed.abandoned)
    ok(closed.orphan === true, '§2c and says this was the orphan door', closed.orphan)
    ok(closed.settledBy === 'abandoned-orphan', '§2d ★★★ settledBy names the exit that closed it', closed.settledBy)
    ok(closed.closedWith === 'VMU_TURN_ABANDONED', '§2e the closure code is the same one every release writes', closed.closedWith)
    ok(closed.clearedParked === false, '§2f nothing was parked to clear (the slot was already consumed — that is why it orphaned)', closed.clearedParked)
    ok(closed.clearCapability === 'present',
      '§2f2 ★ the receipt separates "there was nothing to clear" from "this deployment has no clear seam" (AUDIT-14 P1-6)',
      { clearedParked: closed.clearedParked, clearCapability: closed.clearCapability })
    ok(closed.parkedCleared === 'not-applicable',
      '§2f3 ★ and says the parked slot was not this door\'s business at all, rather than a bare false', closed.parkedCleared)
    const row = closed.turnRow || {}
    ok(row.status === 'abandoned', '§2g ★★★ the LEDGER row is terminal, not open', row.status)
    ok(row.settledBy === 'abandoned-orphan', '§2h the row carries the same settledBy', row.settledBy)
    ok(Array.isArray(row.codes) && row.codes.includes('VMU_TURN_ABANDONED'),
      '§2i the row keeps a readable code (a reader that only opens the row sees what closed it)', row.codes)
    ok(row.orphan === true && typeof row.orphanWhy === 'string' && row.orphanWhy.length > 20,
      '§2j ★★ and states WHY it had outlived its delivery', row.orphanWhy)
    ok(/no prompt parked|nothing was applied/i.test(String(closed.means)),
      '§2k the receipt says what this closure was (CLOSED, not completed)', closed.means)
    const rows = rowsOf(K, o.turnId)
    ok(rows.length === 1 && rows[0].status === 'abandoned',
      '§2l ★★★ one row, now terminal (no duplicate row invented by the door)', rows.map((r) => r.status))
    const loop = K.turn.turnLoop()
    ok(loop.openTurns === 0 && loop.parked === false && loop.inFlight === false,
      '§2m ★★★ the loop no longer reports the row as open', { openTurns: loop.openTurns, parked: loop.parked })
    const recent = Array.isArray(loop.recentAbandonments) ? loop.recentAbandonments : []
    ok(recent.length > 0 && recent[recent.length - 1].settledBy === 'abandoned-orphan' && recent[recent.length - 1].turn === o.turnId,
      '§2n the loop reading records the closure (turnLoop.recentAbandonments)', recent[recent.length - 1])
    const lastAbandon = recent[recent.length - 1] || {}
    ok(lastAbandon.orphan === true && typeof lastAbandon.orphanWhy === 'string' && lastAbandon.orphanWhy.length > 20,
      '§2o ★★ the abandonment ROW itself says which door closed it (boolean `orphan`, not a magic `settledBy` comparison) and why',
      { orphan: lastAbandon.orphan, orphanWhy: lastAbandon.orphanWhy })
  }

  // ── §3 THE DOOR IS OPEN AFTERWARDS ────────────────────────────────────────────────────────────────────────────
  {
    console.log('§3 after the closure the loop proceeds: the next step for that member opens a REAL turn, with no refusal code')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    K.turn.abandon({ turn: o.turnId, why: 'run257: release the orphan' })
    const next = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run257: step after the orphan was closed' }))
    ok(next.threw === false, '§3a the next step is not refused by the loop', next.threw ? next.code : null)
    const out = next.value || {}
    ok(out.ok === true && out.awaiting === true, '§3b it hands a fresh prompt back (the institute is moving again)', { ok: out.ok, awaiting: out.awaiting })
    ok(out.code === undefined || out.code === null || out.code === '',
      '§3c ★★★ no refusal code at all on the accepted call (not REENTRANT, not ALREADY_PARKED, not PARKED_NEEDS_OWNER)', out.code)
    ok(out.code !== 'VMU_TURN_REENTRANT', '§3d ★★★ specifically not VMU_TURN_REENTRANT (the lock is not held by the closed row)', out.code)
    const newTurnId = out.memberPrompt && out.memberPrompt.turnId
    ok(typeof newTurnId === 'string' && newTurnId !== o.turnId, '§3e and it is a NEW turn id, not the settled row', { next: newTurnId, orphan: o.turnId })
    ok(rowsOf(K, o.turnId)[0].status === 'abandoned', '§3f the settled row stays settled (the next turn cannot revive it)',
      rowsOf(K, o.turnId).map((r) => r.status))
    const loop = K.turn.turnLoop()
    ok(loop.parked === true && loop.parkedTurn === newTurnId,
      '§3g the only open thing now is the prompt just parked (one row, one seat)', { parked: loop.parked, turn: loop.parkedTurn })
  }

  // ── §4 NOT A MASTER KEY ───────────────────────────────────────────────────────────────────────────────────────
  {
    console.log('§4 the door closes only what was NAMED — and closing a ROW never touches the parked slot')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    await K.members.hire({ id: 'r-2', slot: 'member' })
    const nameless = K.turn.abandon({ why: 'run257: nothing to close' })
    ok(nameless && nameless.abandoned === false,
      '§4a with nothing named and nothing parked, abandon still closes nothing (it never picks a row on its own)', nameless && nameless.abandoned)
    const o = await makeOrphan(K, 'r-1')
    const parkedOther = await K.turn.step({ members: ['r-2'], phase: 'normal', why: 'run257: park another seat' })
    const otherTurnId = parkedOther && parkedOther.memberPrompt && parkedOther.memberPrompt.turnId
    ok(parkedOther && parkedOther.awaiting === true && otherTurnId !== o.turnId, '§4b a second seat now holds the prompt slot', { other: otherTurnId, orphan: o.turnId })
    const closedWhileParked = K.turn.abandon({ turn: o.turnId, why: 'run257: close the orphan while another seat holds a prompt' })
    ok(closedWhileParked && closedWhileParked.abandoned === true && closedWhileParked.orphan === true,
      '§4c ★★★ AUDIT-14 P1-5: a NAMED row IS closed while another seat holds the prompt slot (bookkeeping is not blocked by the slot)',
      { abandoned: closedWhileParked && closedWhileParked.abandoned, orphan: closedWhileParked && closedWhileParked.orphan })
    ok(typeof closedWhileParked.means === 'string' && /Only the named row was touched/i.test(closedWhileParked.means),
      '§4d and the answer names the scope: only the named row was touched', closedWhileParked.means)
    const loopAfterParked = K.turn.turnLoop()
    ok(loopAfterParked.parked === true && String(loopAfterParked.parkedTurn) === String(otherTurnId),
      '§4e ★★ the parked prompt is UNTOUCHED — the other seat still holds its turn', { parked: loopAfterParked.parked, turn: loopAfterParked.parkedTurn })
    ok(rowsOf(K, o.turnId)[0].status === 'abandoned' && rowsOf(K, otherTurnId)[0].status === 'open',
      '§4f each row kept its own fate (the orphan is terminal, the live prompt is still open)',
      { orphan: rowsOf(K, o.turnId)[0].status, other: rowsOf(K, otherTurnId)[0].status })
    const released = K.turn.abandon({ why: 'run257: release the parked seat' })
    ok(released && released.abandoned === true && released.turn === otherTurnId,
      '§4g the parked seat is released by name-less abandon (unchanged RUN 256 behaviour)', { abandoned: released && released.abandoned, turn: released && released.turn })
    ok(released && released.clearCapability === 'present' && released.clearedParked === true && released.parkedCleared === true,
      '§4h ★★ a released prompt reports the capability, the act, and the kernel guarantee as THREE facts (P1-6: never one ambiguous false)',
      released && { clearedParked: released.clearedParked, clearCapability: released.clearCapability, parkedCleared: released.parkedCleared })
    // ★ RUN 258 / TB-2651-A: the SAME fact at every exit — a non-orphan closure says `orphan:false` by KEY, so a reader
    // never distinguishes doors by comparing `settledBy` with the magic value 'abandoned-orphan' (and a missing key is red).
    const parkedRows = (K.turn.turnLoop().recentAbandonments || []).filter((r) => r && String(r.turn) === String(otherTurnId))
    ok(parkedRows.length === 1 && parkedRows[0].settledBy === 'released',
      '§4i the parked release wrote exactly one abandonment row', parkedRows)
    ok(parkedRows.length > 0 && Object.prototype.hasOwnProperty.call(parkedRows[0], 'orphan') && parkedRows[0].orphan === false,
      '§4j ★★ a NON-orphan row carries `orphan:false` explicitly (the key is present; absence would be red)',
      parkedRows)
    ok(parkedRows.length > 0 && !Object.prototype.hasOwnProperty.call(parkedRows[0], 'orphanWhy'),
      '§4k and it does not invent an orphan reason it does not have', parkedRows)
  }

  // ── §4z A NAMED ROW CLOSES WHILE ANOTHER TURN IS IN FLIGHT (P1-5's real-machine half) ─────────────────────────
  {
    console.log('§4z a turn IN FLIGHT does not block closing a named open row, and closing a row does not release the lock')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    await K.members.hire({ id: 'r-2', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    const flushing = K.turn.step({ members: ['r-2'], phase: 'normal', why: 'run257: hold the loop in flight' })
    const loopInFlight = K.turn.turnLoop()
    ok(loopInFlight.inFlight === true && typeof loopInFlight.inFlightTurn === 'string' && loopInFlight.inFlightTurn !== o.turnId,
      '§4z0 ★ the loop IS in flight on ANOTHER turn when the named abandon arrives (the case a real machine is in most of the time)',
      { inFlight: loopInFlight.inFlight, turn: loopInFlight.inFlightTurn })
    const closed = K.turn.abandon({ turn: o.turnId, why: 'run257: close an orphan while another turn is in flight' })
    ok(closed && closed.ok === true && closed.abandoned === true && closed.orphan === true,
      '§4z1 ★★★ AUDIT-14 P1-5: the named row is CLOSED while a turn is in flight (pre-fix: ok:true + abandoned:false, row never closed)',
      closed && { ok: closed.ok, abandoned: closed.abandoned, orphan: closed.orphan })
    ok(typeof closed.means === 'string' && /NOT touched/i.test(closed.means),
      '§4z2 and the answer says the in-flight turn was not touched either', closed.means)
    const loopAfter = K.turn.turnLoop()
    ok(loopAfter.inFlight === true && loopAfter.inFlightTurn === loopInFlight.inFlightTurn,
      '§4z3 ★★ the LOCK is still held by the turn that held it (a row is bookkeeping; the lock is a different door)',
      { before: loopInFlight.inFlightTurn, after: loopAfter.inFlightTurn })
    ok(rowsOf(K, o.turnId)[0].status === 'abandoned', '§4z4 the named row is terminal', rowsOf(K, o.turnId)[0].status)
    const inFlightRow = (K.turn.status().turnReceipts || []).filter((r) => r && String(r.turn) === String(loopInFlight.inFlightTurn))[0]
    ok(inFlightRow && inFlightRow.status === 'open',
      '§4z5 the in-flight turn\'s own row is untouched (still open — it has not settled)', inFlightRow && inFlightRow.status)
    const settled = await flushing
    ok(settled && settled.awaiting === true,
      '§4z6 the in-flight step still finishes normally afterwards (closing a row did not sabotage it)', settled && { awaiting: settled.awaiting, code: settled.code })
    const releasedInFlight = K.turn.abandon({ turn: loopInFlight.inFlightTurn, why: 'run257: release the turn that was in flight' })
    ok(releasedInFlight && releasedInFlight.abandoned === true,
      '§4z7 the OTHER door still releases that turn by name (naming the parked turn is not the row door)', releasedInFlight && releasedInFlight.abandoned)
    ok(rowsOf(K, loopInFlight.inFlightTurn)[0].status === 'abandoned' && openRows(K).length === 0,
      '§4z8 both rows end terminal and no open row is left behind', { open: openRows(K).length })
    const inFlightAbandon = (K.turn.turnLoop().recentAbandonments || []).filter((r) => r && String(r.turn) === String(loopInFlight.inFlightTurn))
    ok(inFlightAbandon.length === 1 && inFlightAbandon[0].orphan === false && inFlightAbandon[0].settledBy === 'released',
      '§4z9 ★ the in-flight exit also states `orphan:false` (three exits, one shape: no reader has to decode settledBy)',
      inFlightAbandon)
  }

  // ── §5 IDEMPOTENT ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    console.log('§5 a second abandon of the same id rewrites nothing and says so')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    K.turn.abandon({ turn: o.turnId, why: 'run257: close once' })
    const beforeLoop = K.turn.turnLoop()
    const beforeAbandons = Array.isArray(beforeLoop.recentAbandonments) ? beforeLoop.recentAbandonments.length : 0
    const again = K.turn.abandon({ turn: o.turnId, why: 'run257: close twice' })
    ok(again && again.ok === true && again.abandoned === false,
      '§5a the second call is an honest no-op, not an error', again && { ok: again.ok, abandoned: again.abandoned })
    ok(again.status === 'abandoned', '§5b it reports the row status it found instead of pretending to close it', again.status)
    ok(again.settledBy === 'abandoned-orphan', '§5c the settledBy it found is reported back', again.settledBy)
    ok(typeof again.means === 'string' && /already settled/i.test(again.means),
      '§5d and says "already settled": the row is never rewritten into a different exit', again.means)
    const afterLoop = K.turn.turnLoop()
    const afterAbandons = Array.isArray(afterLoop.recentAbandonments) ? afterLoop.recentAbandonments.length : 0
    ok(afterAbandons === beforeAbandons, '§5e no second closure row was recorded', { before: beforeAbandons, after: afterAbandons })
    ok(rowsOf(K, o.turnId)[0].orphanWhy === 'run257: close once',
      '§5f the row keeps the FIRST reason (a later call cannot rewrite history)', rowsOf(K, o.turnId)[0].orphanWhy)
  }

  // ── §6 UNKNOWN ID IS A NAMED REFUSAL ──────────────────────────────────────────────────────────────────────────
  {
    console.log('§6 an id this ledger never held is refused by name, with the ids it does hold')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    const unknown = await attempt(() => K.turn.abandon({ turn: 't-999', why: 'run257: no such turn' }))
    ok(unknown.threw === true, '§6a an unknown id throws rather than closing something else', unknown.threw)
    ok(unknown.code === 'VMU_NO_SUCH_OBJECT', '§6b ★★ the code is the contract\'s "no such object"', unknown.code)
    ok(typeof unknown.message === 'string' && unknown.message.includes('t-999'),
      '§6c the message names the id that was not found', unknown.message)
    ok(typeof unknown.hint === 'string' && unknown.hint.includes(o.turnId),
      '§6d ★★ the hint lists what this loop DOES hold (the open row is named back to the caller)', unknown.hint)
    ok(rowsOf(K, o.turnId)[0].status === 'open', '§6e the refusal closed nothing (a bad name is not a release)', rowsOf(K, o.turnId)[0].status)
  }

  // ── §7 THE TOOL FACE ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    console.log('§7 `vibe_vmu_turn { op:"abandon", turn }` reaches the same door and returns the same closure')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const o = await makeOrphan(K, 'r-1')
    const specs = toolSpecs({ kernel: K, settings: {}, turnTool: true })
    const turnTool = specs.find((s) => s.name === TOOL_NAMES.turn)
    ok(turnTool !== undefined, '§7a the turn face is published', specs.map((s) => s.name))
    const handed = await turnTool.run({ op: 'abandon', turn: o.turnId, why: 'run257: close the orphan through the tool face' })
    ok(handed && handed.ok === true && handed.action === 'abandon', '§7b the face answers with its action named', handed && { ok: handed.ok, action: handed.action })
    ok(handed.abandoned === true && handed.settledBy === 'abandoned-orphan',
      '§7c ★★★ the tool face performs the orphan closure (not an abandoned:false)', { abandoned: handed.abandoned, settledBy: handed.settledBy })
    ok(handed.turnRow && handed.turnRow.status === 'abandoned', '§7d and the row it returns is terminal', handed.turnRow && handed.turnRow.status)
    ok(openRows(K).length === 0, '§7e the ledger has no open row left', openRows(K).map((r) => r.turn))
  }
} catch (e) {
  failed++
  failures.push('threw outside a section: ' + ((e && e.stack) || e))
  console.error('  FAIL threw outside a section - ' + ((e && e.stack) || e))
} finally {
  for (const root of roots) { try { await rm(root, { recursive: true, force: true }) } catch (e) { /* temp dir */ } }
}

console.log('')
console.log('=== vmu-run257-abandon-orphan: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log(failures.join(NL)); process.exitCode = 1 }
