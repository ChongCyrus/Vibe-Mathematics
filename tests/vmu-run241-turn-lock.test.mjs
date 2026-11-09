import { createTurnOrchestrator, extractFence } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// tests/vmu-run241-turn-lock.test.mjs — RUN 241, the lock that held an institute for hours.
//
// Run 64's evidence (SIM-REPORT64.md / FEEDBACK64.md M1): a WAITER-WOKEN turn (`t-2`, member r-1, openedBy "wait",
// meeting null) sat at status "open" from 16:11:02 onwards. `vibe_vmu_turn {op:"step"}` and `vibe_v5_meeting_round` for
// every seat answered `VMU_TURN_REENTRANT`, the durable resume face reported `inflight.pending:0` (true, and useless),
// and NOTHING in the face list could release it. The institute never opened another turn: the paper only reached a PDF
// because the office did the academic acts itself, which the run then honestly reported as `memberActed:false`.
//
// Three things had to become true, and this suite holds each of them:
//   1. the re-entrancy lock NAMES its holder and its age, and reports both (`op:"status" turnLoop`);
//   2. a stuck turn can be closed BY NAME from outside (`op:"abandon"`), and the closed row says "abandoned" rather
//      than pretending it settled;
//   3. a wake that fires while the loop is busy is QUEUED (with the meeting it was born in) instead of opening a round
//      inside somebody else's turn.
//
// Run: node tests/vmu-run241-turn-lock.test.mjs   (last line: === VMU RUN241 LOCK: N passed, M failed ===)

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
const TURN_SRC = read('vibe-math-vmu/kernel/turn/index.js')
const KERNEL_SRC = read('vibe-math-vmu/kernel/index.js')
const TURN_TOOL_SRC = read('vibe-math-vmu/tools/turn.js')
const SCHEMA_SRC = read('vibe-math-vmu/settings/schema.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}
const has = (src, needle, name) => ok(src.includes(needle), name, needle.slice(0, 120))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fence = (obj) => 'work first\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n'
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const settingsOf = (map) => ({ get: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null) })

// ── §0 the source says what the receipts claim ────────────────────────────────────────────────────────────────
has(TURN_SRC, 'const ABANDON_AFTER_MS = (() => {', '§0a ★★ the abandon deadline is a NUMBER the loop knows, not a comment')
has(TURN_SRC, "settingOf(settings, 'vmu.turn.abandonAfterMs')", '§0b ★★ and a deployment can SET it (vmu.turn.abandonAfterMs)')
has(TURN_SRC, "Math.max(600000, DELIVERY_TIMEOUT_MS + 600000)", '§0c ★ the default is derived from the delivery deadline, floored at ten minutes')
// RUN 256 / TB-2616: `abandonTurn` grew a `settledBy` argument (the three exits of a parked turn must be told apart:
// resumed / released / timed-out). The invariant is unchanged — the escape is still ONE named function — so the pin
// moves with the signature instead of being dropped.
has(TURN_SRC, 'const abandonTurn = ({ turn = null, why = null, settledBy = null } = {}) => {', '§0d ★★★ the escape is a function with a name: abandonTurn')
// ★ RUN 258 / TB-2651 (AUDIT-14 P1-5): the same invariant ("a stale caller cannot kill a live turn") is now written as
// the named-row gate, which is the ONE place that decides a name is not the in-flight turn. Pinning the new expression
// keeps the invariant while allowing the named-row door to run while a turn is in flight (it never touches the lock).
has(TURN_SRC, 'if (namedTurnId !== null && namedTurnId !== inFlightId)', '§0e ★★ a caller that names a turn is only closed by the row door when it is NOT the in-flight turn (a stale caller cannot kill a live turn)')
// RUN 256 / TB-2616: the row now also records WHICH exit closed the turn (`settledBy`), which is the opposite of
// pretending it settled: "abandoned" stays its own status with its own code, and the settledBy word says released vs
// timed-out. Both halves are pinned so a later edit cannot collapse them into one.
has(TURN_SRC, "noteTurnReceipt(t, { status: 'abandoned', code: 'VMU_TURN_ABANDONED', settledBy: settled })", '§0f ★★★ the closed row says "abandoned" with its own code — it does not pretend to have settled')
has(TURN_SRC, "const settled = settledBy === 'timed-out' ? 'timed-out' : 'released'", '§0f2 ★★ and settledBy names the exit (timed-out vs released), one place')
has(TURN_SRC, 'void pumpWakeQueue()', '§0g ★★ closing a turn hands the lock to the queued wake immediately')
has(TURN_SRC, 'const queueWake = (spec = {}) => {', '§0h ★★★ a wake that fires while the loop is busy is QUEUED')
has(TURN_SRC, "if (isBusy()) break", '§0i ★★ and the queue only runs when the loop is actually free')
has(TURN_SRC, "throw refuse('VMU_TURN_REENTRANT',", '§0j the re-entrancy refusal still exists (the lock is kept, only made escapable)')
has(TURN_SRC, "REACHABLE INSTEAD: `vibe_vmu_turn { op:\"abandon\" }`", '§0k ★★ and its hint names the way out')
// RUN 245 moved this reading into ONE function: two hand-written copies is how the twelfth audit found `status()`
// reporting seven keys fewer than `kernel.turn.turnLoop()`. The invariant held here is the report, not its spelling.
has(TURN_SRC, 'turnLoop: turnLoopReading(),', '§0l ★★★ op:"status" can report the lock (turnLoop), through the ONE writer of that reading')
has(TURN_SRC, 'ifItNeverSettles', '§0m ★ a forwarded report says what to do if its turn never settles')
has(KERNEL_SRC, "openedBy: 'wait', meeting: wakeMeeting", '§0n ★★★ a waiter-woken turn CARRIES its meeting (run 64: meeting null while w-1 hung on m1)')
has(KERNEL_SRC, 'loop.isBusy() === true && typeof loop.queueWake', '§0o ★★ and the wake path queues instead of nesting when the loop is busy')
has(TURN_TOOL_SRC, "if (op === 'abandon') {", '§0p ★★★ the escape is reachable from the face (op:"abandon")')
has(TURN_TOOL_SRC, 'kernel.turn.abandon({ turn: wantTurn, why: args.why })', '§0q and the face forwards the name verbatim (it re-decides nothing)')
has(TURN_TOOL_SRC, "'known ops: status, prompt, reply, step, drive, abandon, reopen-closure'", '§0r the unknown-op list advertises it')
has(SCHEMA_SRC, "key: 'vmu.turn.abandonAfterMs'", '§0s ★ the setting is DECLARED (a hot setting outside the schema cannot be set)')

// ── §1 the lock names its holder and its age ─────────────────────────────────────────────────────────────────
const neverReturns = () => new Promise(() => {})
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: neverReturns })
  const idle = t.turnLoop()
  ok(idle.inFlight === false && idle.inFlightTurn === null, '§1a a fresh loop reports no turn in flight', idle)
  ok(Number.isFinite(idle.abandonAfterMs) && idle.abandonAfterMs >= 600000, '§1b ★★ and it publishes the deadline it will apply', idle.abandonAfterMs)
  void t.run({ member: 'r-1', phase: 'normal' })
  await sleep(60)
  const busy = t.turnLoop()
  ok(busy.inFlight === true && busy.inFlightMember === 'r-1', '§1c ★★★ the lock says WHICH turn and WHICH member hold it', busy)
  ok(typeof busy.inFlightForMs === 'number' && busy.inFlightForMs >= 0, '§1d ★★ and how long it has held the loop (run 64 could not see this at all)', busy.inFlightForMs)
  ok(t.isBusy() === true, '§1e isBusy() agrees with the readings')
}

// ── §2 a stuck turn can be closed by name, and the next turn opens ────────────────────────────────────────────
{
  let calls = 0
  const deliver = () => { calls += 1; return calls === 1 ? neverReturns() : fence({}) }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver })
  const first = t.run({ member: 'r-1', phase: 'normal' })
  await sleep(60)
  ok(t.turnLoop().inFlight === true, '§2a the first turn is holding the loop')

  let nested = null
  try { await t.run({ member: 'r-2', phase: 'normal' }) } catch (e) { nested = e }
  ok(nested !== null && nested.code === 'VMU_TURN_REENTRANT', '§2b ★★ a nested run is still refused by name (the lock is intact)', nested && nested.code)
  ok(nested !== null && /abandon/.test(String(nested.hint)), '§2c ★★★ and its hint points at the escape, so a caller is not trapped', nested && String(nested.hint).slice(0, 120))

  // ★ RUN 258 / TB-2651 (AUDIT-14 P1-5): naming a row is now a LEDGER operation, so an id the ledger never held is a
  // NAMED refusal (VMU_NO_SUCH_OBJECT) instead of `abandoned:false` — the old answer let a caller read "handled" while
  // nothing happened. The discoverability this case pinned is preserved IN THE HINT: it names the turn in flight.
  const namedErr = (() => { try { t.abandon({ turn: 't-999', why: 'wrong turn on purpose' }); return null } catch (e) { return e } })()
  ok(namedErr !== null && namedErr.code === 'VMU_NO_SUCH_OBJECT',
    '§2d ★★ naming an id this ledger never held is refused by name (a no-op must not answer ok:true)', namedErr && namedErr.code)
  ok(namedErr !== null && String(namedErr.hint).includes(String(t.turnLoop().inFlightTurn)),
    '§2d2 ★★★ and the hint names the turn that IS in flight, so a caller is not left guessing', namedErr && String(namedErr.hint).slice(0, 180))
  ok(t.turnLoop().inFlight === true, '§2d3 the refusal closed nothing — the stuck turn still holds the loop', t.turnLoop().inFlightTurn)

  const closed = t.abandon({ turn: t.turnLoop().inFlightTurn, why: 'the delivery seam never returned' })
  ok(closed.ok === true && closed.abandoned === true && closed.closedWith === 'VMU_TURN_ABANDONED', '§2e ★★★ op:"abandon" closes the stuck turn BY NAME', closed)
  const row = closed.turnRow || {}
  const rowCodes = Array.isArray(row.codes) ? row.codes : []
  ok(row.status === 'abandoned' && (row.code === 'VMU_TURN_ABANDONED' || rowCodes.includes('VMU_TURN_ABANDONED')),
    '§2f ★★★ and the ledger row says "abandoned" with its code (not "settled": nothing was applied)', row)
  ok(t.turnLoop().inFlight === false, '§2g ★★★ the lock is RELEASED — this is the thing run 64 could never do')

  const second = await t.run({ member: 'r-2', phase: 'normal' })
  ok(second && second.ok !== false && second.turn && second.turn.id !== closed.turn, '§2h ★★★ a NEW turn opens after the escape, so the institute is not held hostage', second && second.turn && second.turn.id)
  void first.catch(() => {})
  await sleep(20)
}

// ── §3 a lock past its deadline closes itself on the next call ───────────────────────────────────────────────
{
  let calls = 0
  const deliver = () => { calls += 1; return calls === 1 ? neverReturns() : fence({}) }
  const t = createTurnOrchestrator({
    sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver,
    settings: settingsOf({ 'vmu.turn.abandonAfterMs': 40 }),
  })
  ok(t.turnLoop().abandonAfterMs === 40, '§3a ★★ a deployment CAN shorten the deadline (40 ms here)')
  void t.run({ member: 'r-1', phase: 'normal' })
  await sleep(90)
  const after = await t.run({ member: 'r-2', phase: 'normal' })
  ok(after && after.ok !== false, '§3b ★★★ a turn held past its deadline does NOT block the next one: the loop closes it by name and proceeds', after && after.turn && after.turn.id)
  const abandons = t.turnLoop().recentAbandonments || []
  ok(abandons.length === 1 && abandons[0].member === 'r-1', '§3c ★★ and the automatic closure is on the record (recentAbandonments keeps who and why)', abandons)
  ok(typeof abandons[0].why === 'string' && /abandonAfterMs/.test(abandons[0].why), '§3d ★ the recorded reason names the deadline it crossed', abandons[0] && abandons[0].why)
}

// ── §4 a wake that fires while the loop is busy is QUEUED, and carries its meeting ───────────────────────────
{
  let calls = 0
  const deliver = () => { calls += 1; return calls === 1 ? neverReturns() : fence({}) }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver })
  void t.run({ member: 'r-1', phase: 'normal' })
  await sleep(60)
  const q = t.queueWake({ member: 'r-2', meeting: 'm1', why: 'the chair spoke' })
  ok(q.ok === true && q.queued === true && q.id === 'wq-1', '§4a ★★★ a wake while BUSY is queued, never driven inside the open turn', q)
  ok(t.turnLoop().wakeQueue.length === 1 && t.turnLoop().wakeQueue[0].meeting === 'm1', '§4b ★★ the queue row carries the meeting it was born in (run 64 opened a woken turn with meeting null)', t.turnLoop().wakeQueue)
  t.abandon({ why: 'release the loop so the queue can run' })
  const ran = await Promise.race([q.promise, sleep(2000).then(() => ({ timedOut: true }))])
  ok(ran && ran.timedOut !== true && ran.queued === true, '§4c ★★★ once the lock is free the queued wake actually RUNS', ran)
  await sleep(80)
  const rows = t.status().turnReceipts || []
  const wakeRow = rows.filter((r) => r && r.openedBy === 'wait')
  ok(wakeRow.length === 1 && wakeRow[0].meeting === 'm1', '§4d ★★★ the turn it opened is recorded as openedBy:"wait" and meeting:"m1"', wakeRow)
  ok(t.turnLoop().wakeQueue.length === 0, '§4e the queue is drained')
}

// ── §5 the face: unknown op list and the receipt shape ───────────────────────────────────────────────────────
{
  const src = TURN_TOOL_SRC
  const known = src.match(/known ops: ([^']+)'/g) || []
  ok(known.length === 1, '§5a there is exactly ONE unknown-op list (a second copy is a second truth)', known)
  ok(/abandon/.test(known[0]), '§5b ★ it advertises abandon')
  const desc = src.match(/abandon\uff1d[^']{0,60}/)
  ok(desc !== null, '§5c ★ the op description explains what abandon does (a reachable verb must be documented)', desc && desc[0].slice(0, 40))
  ok(/status:"abandoned"/.test(src) || /status:abandoned/.test(src), '§5d the description promises the row status, not just "it works"')
}

// ── §6 the attribution slot describes a delivery that RETURNED, and names it in full ────────────────────────────────────────────
// FEEDBACK64 M4: one op:"status" reported `lastAttribution.childId` = r-acad's child while calling it r-1's most
// recent delivery - half of one delivery (the member, stamped when the turn STARTED) beside the whole of an older one
// (the child, filled when it FINISHED). A turn whose seam never returns must leave the slot describing the last
// delivery that DID return.
{
  let calls = 0
  const deliver = () => { calls += 1; return calls === 1 ? fence({}) : neverReturns() }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver })
  await t.run({ member: 'r-1', phase: 'normal' })
  const afterFirst = t.status().lastAttribution || {}
  ok(afterFirst.member === 'r-1' && typeof afterFirst.turn === 'string' && afterFirst.turn.indexOf('t-') === 0,
    '§6a ★★ the returned delivery stamps member AND turn together', afterFirst)
  ok(typeof afterFirst.slotMeans === 'string' && /LAST DELIVERY THAT RETURNED/.test(afterFirst.slotMeans),
    '§6b ★★ and the slot SAYS what it describes (a reader is not left to infer it)', afterFirst.slotMeans && afterFirst.slotMeans.slice(0, 80))
  void t.run({ member: 'r-2', phase: 'normal' })
  await sleep(60)
  const during = t.status()
  ok(during.lastAttribution.member === 'r-1' && during.lastAttribution.turn === afterFirst.turn,
    '§6c ★★★ a turn that has NOT returned does not overwrite the slot (run 64 put r-2’s name on r-acad’s child)', during.lastAttribution)
  ok(t.turnLoop().inFlightMember === 'r-2',
    '§6d ★★ the in-flight turn is named where it belongs (turnLoop), not in the delivery slot', t.turnLoop())
  t.abandon({ why: 'end of test' })
}

console.log('')
console.log('=== VMU RUN241 LOCK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) console.log('failed: ' + failures.join(' | '))
if (failed > 0) process.exit(1)
