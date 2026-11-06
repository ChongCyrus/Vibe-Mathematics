import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// tests/vmu-run245-audit12.test.mjs — RUN 245, the four high findings of the twelfth audit round.
//
// docs/acceptance/sim-audit-round12.md measured four ways the turn loop could still lie about itself:
//
//   H1  every root op entered one promise queue, so a step whose delivery hung also blocked `op:"status"` and
//       `op:"abandon"` — the only reading and the only release RUN 241 had added. The observation waited behind the
//       thing it was supposed to observe (measured: 1500 ms, everything hanging, while the kernel's own status answered).
//   H2  `abandon` said "nothing was applied"; the abandoned turn's delivery then returned, went through dispatchReply,
//       wrote records and rewrote the settled `abandoned` row to `applied` (keeping `codes:["VMU_TURN_ABANDONED"]`).
//   H3  the two `finally` blocks cleared whatever lock they found, so a LATE turn cleared a NEWER turn's lock: two rows
//       at `status:"open"` at once, `turnLoop.inFlightTurn` naming only the last.
//   H4  `counts.deliveryLastFail.at` used wall time while `writesWindow.from/to` in the same receipt used the kernel
//       clock — months apart in one reading, so the "order" a reader inferred never happened.
//
// Run: node tests/vmu-run245-audit12.test.mjs   (last line: === VMU RUN245 AUDIT12: N passed, M failed ===)

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
const TURN_SRC = read('vibe-math-vmu/kernel/turn/index.js')
const TURN_TOOL_SRC = read('vibe-math-vmu/tools/turn.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 260) + ']')) }
}
const has = (src, needle, name) => ok(src.includes(needle), name, needle.slice(0, 140))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const fence = (obj) => 'work first\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n'
const never = () => new Promise(() => {})

// ══ §0 the source says what the receipts claim ═══════════════════════════════════════════════════════════════
has(TURN_TOOL_SRC, "const observesOrReleases = op === 'status' || op === 'abandon'",
  '§0a ★★★ H1: the observation (status) and the release (abandon) are NAMED as the two ops that skip the queue')
has(TURN_TOOL_SRC, 'if (memberCaller || observesOrReleases) return Promise.resolve(coreTurnInner(args, exec))',
  '§0b ★★★ and they run directly, exactly like the member-side read already did')
ok(TURN_TOOL_SRC.indexOf('observesOrReleases') < TURN_TOOL_SRC.indexOf('const job = turnQueue.then'),
  '§0c ★★ the bypass sits BEFORE the queue join (a bypass after it would be decoration)')
has(TURN_SRC, 'let turnInFlightToken = null', '§0d ★★★ H3: the lock can say whose it is')
has(TURN_SRC, 'if (turnInFlightToken === myToken) {', '§0e ★★★ and the release is conditional on ownership')
has(TURN_SRC, 'if (inFlightTurn === turn) inFlightTurn = null', '§0f ★★★ the member slot has the same rule (a late turn clears only its own)')
has(TURN_SRC, 'const abandonedTurns = new Set()', '§0g ★★★ H2: abandoned turns are remembered')
has(TURN_SRC, "abandonedTurns.has(String(turn.id))", '§0h ★★★ and the delivery path asks before applying anything')
has(TURN_SRC, "code: 'VMU_TURN_ABANDONED',", '§0i ★★ the late answer is reported with the code it was closed under')
has(TURN_SRC, 'lateAnswerNotApplied: true,', '§0j ★★★ and the receipt names the fact: it was NOT applied')
has(TURN_SRC, "at: isoStampOf(clock()),\n        atSource: 'kernel-clock',", '§0k ★★ H4: the delivery-failure stamp comes from the kernel clock')
has(TURN_SRC, 'const turnLoopReading = () => ({', '§0l ★★ one function writes the loop reading (the audit found two copies, seven keys apart)')
has(TURN_SRC, 'turnLoop: turnLoopReading(),', '§0m ★★★ and `status()` calls it instead of carrying a hand-made copy')
has(TURN_SRC, 'turnLoop: turnLoopReading,', '§0n ★★ as does the public `kernel.turn.turnLoop()`')

// ══ §1 H1: the observer does not wait behind the thing it observes ═══════════════════════════════════════════
{
  const spec = makeTurnSpec({
    param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { turn: 'vibe_vmu_turn' },
    kernel: {
      members: { roster: () => [] },
      turn: {
        // a step whose delivery never returns: exactly the state run 64 was stuck in
        step: never,
        drive: never,
        status: () => ({ ok: true, inFlight: true, inFlightTurn: 't-1', turnReceipts: [{ turn: 't-1', status: 'open' }] }),
        abandon: ({ turn = null } = {}) => ({ ok: true, abandoned: true, turn: turn || 't-1', clearedParked: true }),
      },
    },
  })

  // the hung step holds the queue
  void spec.run({ op: 'step' })
  await sleep(30)

  const statusStarted = Date.now()
  const statusOut = await spec.run({ op: 'status' })
  const statusMs = Date.now() - statusStarted
  ok(statusOut && statusOut.ok === true, '§1a ★★★ op:"status" answers WHILE a step is in flight (the queue no longer blocks the reading)', statusOut && statusOut.code)
  ok(statusMs < 1000, '§1b ★★★ and it answered promptly, not after the hang', statusMs)
  ok(statusOut && statusOut.ok === true && statusOut.status && statusOut.status.inFlight === true,
    '§1c ★★ the reading still reports the truth (a turn IS in flight) — the bypass did not turn it into a stub', statusOut && statusOut.status)

  const abandonStarted = Date.now()
  const abandonOut = await spec.run({ op: 'abandon', turn: 't-1' })
  const abandonMs = Date.now() - abandonStarted
  ok(abandonOut && abandonOut.ok === true && abandonOut.abandoned === true,
    '§1d ★★★ op:"abandon" answers WHILE the same step is in flight — the release is reachable when it matters', abandonOut)
  ok(abandonMs < 1000, '§1e ★★★ and the release did not wait for the thing it releases', abandonMs)

  // a WRITE still queues: order is what the queue is for. The hung step is still sitting in it.
  const queuedStep = spec.run({ op: 'drive', rounds: 1 })
  const raceOut = await Promise.race([queuedStep.then(() => 'ran'), sleep(200).then(() => 'still-queued')])
  ok(raceOut === 'still-queued', '§1f ★★ opening ops still QUEUE behind the in-flight turn (only the reader and the release skip it)', raceOut)
}

// ══ §2 H2: an abandoned turn's answer is reported, never applied ═════════════════════════════════════════════
{
  const pending = []
  const deliver = ({ turn, text }) => new Promise((resolve) => { pending.push({ turn, member: turn.member, text, resolve }) })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver })

  const runA = t.run({ member: 'r-1', phase: 'normal' })
  await sleep(60)
  ok(pending.length === 1, '§2a a turn was delivered and its seam is holding the answer', pending.length)

  const closed = t.abandon({ why: 'test: the delivery seam never returns' })
  ok(closed && closed.ok === true && closed.abandoned === true && closed.turn === 't-1',
    '§2b ★★★ the turn is closed BY NAME while its delivery is still out', closed)

  // now the abandoned turn's seam finally answers, with a reply that WOULD write a progress row
  pending[0].resolve(fence({ progress: 'abandoned turn writing after the fact', say: 'late' }))
  const late = await runA
  ok(late && late.ok === false && late.code === 'VMU_TURN_ABANDONED',
    '§2c ★★★ the late answer comes back as a NAMED non-application, not as a settled turn', late)
  ok(late && late.lateAnswerNotApplied === true && late.turn === 't-1',
    '§2d ★★★ and the receipt says in words that nothing was applied', late && late.lateAnswerNotApplied)
  ok(late && typeof late.replyExcerpt === 'string' && late.replyExcerpt.includes('after the fact'),
    '§2e ★★ the member\'s answer is quoted back (the work is not thrown away silently)', late && late.replyLength)

  const st = t.status()
  const row = (st.turnReceipts || []).find((r) => r.turn === 't-1')
  ok(row && row.status === 'abandoned',
    '§2f ★★★ the ledger row STAYS "abandoned" — the late answer did not rewrite it to "applied"', row && row.status)
  ok(!row || !(row.codes || []).includes('VMU_TURN_APPLIED_AFTER_ABANDON'),
    '§2g ★★ and nothing claims it was applied later either', row && row.codes)
  ok(st.counts.lateAfterAbandon === 1,
    '§2h ★★ the count names it (a reader can see the case happened without digging)', st.counts.lateAfterAbandon)
  ok(st.turnLoop.lateAnswersNotApplied === 1 && typeof st.turnLoop.lateAnswersNotAppliedMeans === 'string',
    '§2i ★★ and turnLoop reports it with the rule: reported, not applied', st.turnLoop.lateAnswersNotApplied)
  ok(st.turnLoop.inFlight === false, '§2j no turn is in flight once it was abandoned', st.turnLoop.inFlight)
}

// ══ §3 H3: a late turn releases only its own lock ═══════════════════════════════════════════════════════════
{
  const pending = []
  const deliver = ({ turn, text }) => new Promise((resolve) => { pending.push({ turn, text, resolve }) })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver })

  const runA = t.run({ member: 'r-1', phase: 'normal' })
  await sleep(50)
  const aTurn = t.turnLoop().inFlightTurn
  ok(aTurn === 't-1', '§3a turn A holds the lock', aTurn)

  // A is abandoned (its answer is still out), then a NEW turn B takes the lock
  t.abandon({ why: 'test: abandon A so B can run' })
  const runB = t.run({ member: 'r-2', phase: 'normal' })
  await sleep(50)
  const bTurn = t.turnLoop().inFlightTurn
  ok(bTurn === 't-2' && t.turnLoop().inFlight === true, '§3b ★★ turn B now holds the lock', t.turnLoop().inFlightTurn)

  // A's seam finally answers: the late turn finishes, and its `finally` must NOT free B's lock
  pending[0].resolve(fence({ progress: 'A, late' }))
  const late = await runA
  ok(late && late.code === 'VMU_TURN_ABANDONED', '§3c the late turn reports itself as non-applied', late && late.code)

  const after = t.turnLoop()
  ok(after.inFlight === true && after.inFlightTurn === 't-2',
    '§3d ★★★ B still holds the lock after A returned late (the old turn freed nothing that was not its own)', after)

  // B settles normally and the lock is released by its own holder
  pending[1].resolve(fence({ progress: 'B, on time' }))
  const doneB = await runB
  ok(doneB && doneB.ok === true, '§3e turn B settled normally', doneB && doneB.code)
  ok(t.turnLoop().inFlight === false && t.turnLoop().inFlightTurn === null,
    '§3f ★★ and the lock came back from B, its rightful holder', t.turnLoop())
}

// ══ §4 H4: one receipt, one clock ═══════════════════════════════════════════════════════════════════════════
{
  const thrower = () => { const e = new Error('the seam gave up'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; e.stillRunning = true; throw e }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: thrower, clock: () => 1000 })
  const out = await t.run({ member: 'r-1', phase: 'normal' }).then(() => null, (e) => e)
  ok(out !== null, '§4a the delivery failure is thrown, as the seam raised it', out && out.code)
  const fail = t.status().counts.deliveryLastFail
  ok(fail && fail.atSource === 'kernel-clock', '§4b ★★★ the failure stamp SAYS which clock it came from', fail && fail.atSource)
  ok(fail && fail.at === '1970-01-01T00:00:01.000Z',
    '§4c ★★★ and it is the KERNEL clock (the injected one), the same clock writesWindow uses — not Date.now()', fail && fail.at)
  ok(fail && typeof fail.writesWindow === 'object' && fail.writesWindow && fail.writesWindow.from === '1970-01-01T00:00:01.000Z',
    '§4d ★★ the two stamps in the same receipt agree (this is the pair the audit measured months apart)',
    fail && fail.writesWindow && fail.writesWindow.from)
}

console.log('')
if (failed > 0) console.log('FAILURES: ' + failures.join(' | '))
console.log('=== VMU RUN245 AUDIT12: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
