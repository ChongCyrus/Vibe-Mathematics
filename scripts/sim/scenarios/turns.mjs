// scripts/sim/scenarios/turns.mjs — the TURN scenario: who is prompted, who answers, and what a round that cannot
// complete says about itself.
//
// WHY THIS SCENARIO EXISTS
//   Every other scenario drives the institute through its TOOL faces (start, paper, meeting). This one drives the
//   TURN ENGINE, whose whole job is: prompt ONE member, take that member's reply, dispatch the fields the reply
//   declares. A round that never ran looks exactly like a round that ran and did nothing, so the shapes are the
//   subject: `awaiting` (a turn handed back to the caller), the receipt that completes it, and the refusals for the
//   three ways a round produces no work — an envelope that does not parse (`VMU_TURN_NO_FENCE` +
//   `sideEffectsUnverified`), a report with no turn to answer (`VMU_TURN_NO_PENDING_MEMBER`), and a host with no
//   delivery seam at all (`VMU_ENGINE_UNAVAILABLE`).
//
// DELIVERY MODE IS DECLARED, NOT ASSUMED
//   `scripts/sim/harness.mjs` boots the kernel through `entry.apply(ctx, {clock, packs, root, vmu: settings})`. With
//   no settings the entry resolves `createTurnDeliver` (vibe-math-vmu.js:483; host-deliver.js:10 reads
//   `config.vmu.deliverMode`) to the SUBAGENTS path, and this in-process context exposes no `subagents` service:
//   every drive then reports `roundsRun:0` with a failed round `VMU_ENGINE_UNAVAILABLE`. The caller path needs no
//   subagents at all, and the entry already supports it — so this scenario EXPORTS `settings = { deliverMode:
//   'caller' }` (run.mjs passes a scenario's settings into boot, which maps them onto `config.vmu`). The delegated
//   path is still exercised once, on a second boot with the default mode, so both refusal shapes are in the corpus.
//
// WHAT A CALLER-MODE ROUND LOOKS LIKE (kernel/turn/index.js:1100-1131 `deliverByReturning`)
//   drive  -> `{ok:true, awaiting:true, roundsRun:0, memberPrompt:{member, turnId, text}}`: the round is PARKED on the
//             caller — the only state in which a test or a human can play the member's part.
//   answer -> `vibe_vmu_turn {op:"step", reply:"<fenced json>"}` — the reply is supplied to the parked turn and the
//             same call steps the engine forward; the receipt lands under `receipt` (fields/executed/turn).
//
// EXPECTED REFUSALS ARE DATA, NOT REFUSED RECEIPTS
//   `scripts/sim/run.mjs` counts every `ok:false` receipt as a mechanism refusal (except VMU_ENGINE_UNAVAILABLE) and
//   has no notion of an expected one. So the honest ledger here is: `steps[].ok` says what happened (including the
//   expected refusals), `result.receipts` holds the calls that succeeded, and `highlights.refusals` carries each
//   expected refusal in full. That gap in run.mjs is reported as a finding; it is not worked around silently.

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, tmpRoot, VMU, snapshotTree } from '../harness.mjs'

/** The delivery seam this scenario needs: the CALLER path (see the header). run.mjs maps this onto config.vmu. */
export const settings = { deliverMode: 'caller' }

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)

/** The fenced json envelope a member is taught to answer in. */
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)

const SEATS = ['chair', 'member', 'temp']
const PHASES = ['normal', 'meeting', 'checkpoint', 'verify']

export async function turns(h, { log = () => {} } = {}) {
  const steps = []
  const receipts = []
  const refusals = []
  const promptChars = {}
  const ledger = {}
  /** Self-check failures (mechanism contract drifts). run.mjs fails the run on a non-empty list. */
  const failures = []
  let seq = 0

  const tree = (root) => snapshotTree(root)
  const count = (root) => tree(root).length

  /** One recorded call; `record` when success is the point, `probe` when the refusal is the measurement. */
  const record = async (name, args = {}, opts = {}) => {
    const receipt = await h.call(name, args, opts)
    seq += 1
    receipts.push({ seq, tool: name, as: opts.as && opts.as.agent ? opts.as.agent.id : 'office', args, receipt })
    return receipt
  }
  const probe = async (name, args = {}, opts = {}) => {
    const receipt = await h.call(name, args, opts)
    // A predicted refusal is EVIDENCE, not a refused receipt: run.mjs keeps it in the corpus and prints its code and
    // hint, and the declaration below (result.expectedRefusals) stops it from counting as a mechanism defect. An
    // UNPREDICTED refusal still fails the run — which is the point.
    seq += 1
    receipts.push({ seq, tool: name, as: 'office', args, receipt })
    refusals.push({ tool: name, args, receipt })
    return receipt
  }

  /**
   * Park a caller-played turn, then answer THAT prompt. TB-2616 (task-97, RUN 256) made this pairing the ONLY legal
   * way to supply a reply: `step`/`reply` carrying an answer is refused by name (`VMU_TURN_PARKED_NEEDS_OWNER`) when
   * no prompt is parked in the seam, because a reply with no turn to answer would otherwise be handed to the NEXT turn
   * (a silent wrong-turn attribution). So the drive is not ceremony - it is the mechanism's precondition.
   *
   * The member and turn id always come from the drive receipt (`memberPrompt`), never from a literal: a hardcoded id
   * would keep passing after the engine changed which turn it parked, which is exactly what a corpus must not hide.
   */
  const park = async (member, phase, why) => {
    const r = await record('vibe_vmu_turn', { op: 'drive', member, rounds: 1, phase, why })
    const prompt = r && r.memberPrompt && typeof r.memberPrompt === 'object' ? r.memberPrompt : null
    const parked = { receipt: r, prompt, member: prompt && typeof prompt.member === 'string' ? prompt.member : null, turnId: prompt && typeof prompt.turnId === 'string' ? prompt.turnId : null }
    if (r && r.ok === true && r.awaiting === true && parked.prompt !== null && parked.turnId !== null) return parked
    // A missing parked prompt is a SEAM failure, not a refusal to forgive: record it and let the step go red.
    failures.push({
      code: 'SIM_TURN_PARK_CONTRACT',
      step: why,
      message: 'a caller-mode drive did not return a parked prompt (awaiting:true + memberPrompt.turnId): ' + JSON.stringify({ ok: r && r.ok, awaiting: r && r.awaiting, code: r && r.code, hasPrompt: parked.prompt !== null }),
      means: 'every reply-carrying step below depends on this prompt existing; without it the reply is refused by the parked-turn gate and the corpus would be testing a path it never parked',
    })
    return parked
  }

  /** Answer the prompt a `park()` returned. The id used is the one the receipt named. */
  const answer = async (parked, phase, why, payload) => record('vibe_vmu_turn', {
    op: 'step',
    member: parked.member === null ? undefined : parked.member,
    phase,
    why,
    reply: fence(payload),
  })

  /** Record one step; the step ledger is the scenario statement of what was expected and what happened. */
  const step = async (name, kind, fn) => {
    const before = count(h.root)
    let out
    try {
      out = await fn()
    } catch (e) {
      out = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    const after = count(h.root)
    const row = { name, kind, ok: out && out.ok === true, code: (out && out.code) || null, files: { before, after } }
    steps.push(row)
    log(name + ': ' + (row.ok ? 'ok' : 'REFUSED ' + (row.code || '')))
    return { row, out }
  }

  // ── 1. Prompt volumes: three SEATS x four PHASES, through the harness prompt pipeline ────────────────────────
  // The seat is the ROSTER SLOT (`chair|member|temp`) — what the kernel passes (kernel/turn/index.js:3555
  // `chosenRole`) — never the charter source word. The budget gate measured `role:"researcher"` for a whole round and
  // read a chair prompt ~4.6 K shorter than the deployed one (docs/26:3819 table; docs/26:3851 the same fix in the
  // harness), so a simulated prompt is only evidence when it is assembled the way a real turn assembles it.
  for (const seat of SEATS) {
    for (const phase of PHASES) {
      const text = await h.prompts.assembleFor({ seat, phase, round: 1, roster: 'r-acad、r-1、r-2', statusBlock: '[状态] 模拟器' })
      promptChars[seat + '/' + phase] = text.length
    }
  }
  steps.push({ name: 'prompt-matrix', kind: 'observe', ok: true, code: null, files: { before: count(h.root), after: count(h.root) } })
  log('prompt-matrix: ' + SEATS.length * PHASES.length + ' assemblies')

  // ── 2. No roster yet: a drive is a named STOP, not a silence ─────────────────────────────────────────────────
  await step('probe-no-members', 'probe', async () => {
    const r = await record('vibe_vmu_turn', { op: 'drive', rounds: 1 })
    ledger.noMembers = {
      ok: r.ok,
      stopped: r.stopped || null,
      roundsRun: r.roundsRun,
      attempted: r.roundsAttempted,
      next: r.next || null,
      means: 'with no live member the engine does not guess: the drive stops and names the next move (kind/tool/hint), which is how an office learns it must hire before it can dispatch',
    }
    return r
  })

  // ── 3. Open the institute ────────────────────────────────────────────────────────────────────────────────────
  await step('open-institute', 'setup', async () => {
    const r = await record('vibe_v5_start', { problem: '模拟器回合剧本：谁被派回合、谁回答、跑不动时回执说什么', researcherCount: 2 })
    ledger.started = { ok: r.ok === true, hired: r.hired || null, turnEngine: r.turnEngine || null }
    return r
  })
  const roster = h.kernel.members && typeof h.kernel.members.roster === 'function' ? h.kernel.members.roster() : null
  ledger.rosterLive = Array.isArray(roster) ? roster.map((m) => (m && m.id) || m) : roster

  // ── 3. A round is PARKED on the caller: drive returns awaiting and nothing ran ───────────────────────────────
  await step('round-parked', 'turn', async () => {
    const r = await record('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '第一轮：派出 r-1 的回合' })
    ledger.parked = {
      awaiting: r.awaiting === true,
      roundsRun: r.roundsRun,
      member: r.memberPrompt ? r.memberPrompt.member : null,
      turnId: r.memberPrompt ? r.memberPrompt.turnId : null,
      promptCharsInMemberTurn: r.memberPrompt ? String(r.memberPrompt.text || '').length : 0,
      means: 'a caller-played turn is HELD: the prompt went back to the caller, no member ran, roundsRun is 0 — this is the parked state',
    }
    return r
  })
  const beforeTurns = (await h.call('vibe_vmu_turn', { op: 'status' })).status.turns

  // ── 4. The caller plays the member; the same call steps the engine forward ──────────────────────────────────
  await step('round-answered', 'turn', async () => {
    const r = await record('vibe_vmu_turn', {
      op: 'step',
      member: 'r-1',
      phase: 'normal',
      why: '回答被暂存的回合并推进',
      reply: fence({
        say: 'r-1 汇报：第一步完成，记一条进展。',
        progress: { track: 'progress', title: '第一步', body: '完成第一步：定义已固定，下一步给出引理。' },
      }),
    })
    const inner = r.receipt || r
    ledger.answered = { turn: inner.turn || null, fields: inner.fields || null, executed: inner.executed === undefined ? null : inner.executed, attributed: inner.attributed === undefined ? null : inner.attributed }
    return r
  })
  const afterTurns = (await h.call('vibe_vmu_turn', { op: 'status' })).status.turns
  ledger.turnsCounter = { before: beforeTurns, after: afterTurns, advanced: typeof beforeTurns === 'number' && typeof afterTurns === 'number' ? afterTurns > beforeTurns : null }

  // ── 4b. THE COUNTER-EXAMPLE TB-2616 is about: a reply with NOTHING parked must be refused BY NAME ───────────────
  // The mechanism's whole claim is "a reply belongs to the prompt it was parked for". Its negative side is therefore
  // part of the contract, not an aside: with no prompt parked, a reply-carrying step must be refused (never handed to
  // the next turn), the refused reply must be DISCARDED from the slot, and no turn may be opened by the refusal.
  await step('probe-step-needs-owner', 'probe', async () => {
    const before = await h.call('vibe_vmu_turn', { op: 'status' })
    const beforeTurns2 = before && before.status ? before.status.turns : null
    const r = await probe('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal', why: '不先 drive 就直接交答复（应被具名拒绝）', reply: fence({ say: '这条答复没有可回答的回合' }) })
    const after = await h.call('vibe_vmu_turn', { op: 'status' })
    const loop = after && after.turnLoop ? after.turnLoop : {}
    const afterTurns2 = after && after.status ? after.status.turns : null
    const pendingStillEmpty = loop.parked !== true && (loop.parkedTurn === null || loop.parkedTurn === undefined)
    const noNewTurn = beforeTurns2 !== null && afterTurns2 !== null && afterTurns2 === beforeTurns2
    ledger.stepNeedsOwner = {
      code: r.code || null,
      parkedReason: r.parkedReason || null,
      parkedFacts: r.parkedFacts || null,
      replyDiscarded: r.parkedReplyDiscarded === true,
      pendingStillEmpty,
      noNewTurn,
      turnsBefore: beforeTurns2,
      turnsAfter: afterTurns2,
      hint: String(r.hint || '').slice(0, 400),
      means: 'TB-2616 negative face: a reply supplied with no parked prompt is refused BY NAME (VMU_TURN_PARKED_NEEDS_OWNER, reason no-parked-prompt), the staged reply is DISCARDED (parkedReplyDiscarded:true) so it cannot answer the next turn, the parked slot is still empty afterwards, and the refusal opens NO turn - the turn counter is unchanged',
    }
    return {
      ok: r.code === 'VMU_TURN_PARKED_NEEDS_OWNER' && r.parkedReason === 'no-parked-prompt' && r.parkedReplyDiscarded === true && pendingStillEmpty === true && noNewTurn === true,
      code: r.code || null,
    }
  })

  // ── 5. A reply that does not parse: VMU_TURN_NO_FENCE, and what the receipt still tells you ──────────────────
  await step('probe-no-fence', 'probe', async () => {
    // TB-2616: a reply is only ever supplied to a PARKED prompt, so the fence probe parks one first. The refusal then
    // measures the parse seam against a real parked turn instead of against "no turn at all".
    const parked = await park('r-2', 'normal', '故意不写围栏：先 park 再答')
    const r = await probe('vibe_vmu_turn', { op: 'step', member: parked.member === null ? undefined : parked.member, phase: 'normal', why: '故意不写围栏', reply: '我刚才想了想，这一步应该没问题，但我没有按格式回答。' })
    // A refused envelope IS supplied to the parked prompt and the resume CONSUMES that slot, so after this refusal the
    // row is an ORPHAN: still `status:"open"`, with nothing in flight and nothing parked (MEASURED, RUN 257 / TB-2639 —
    // this comment used to claim the prompt was still parked). That is the state op:"abandon" settles BY NAME — it never
    // picks a row on its own — so the probe names the very turn it parked and reads the ledger back: the row must go
    // terminal (`settledBy:"abandoned-orphan"`) and no parked slot may be left holding anything.
    const settled = await record('vibe_vmu_turn', { op: 'abandon', turn: parked.turnId === null ? undefined : parked.turnId, why: '围栏被拒的回合不能永远停着：按名字走显式释放出口' })
    const afterSettle = await h.call('vibe_vmu_turn', { op: 'status' })
    const readback = afterSettle && afterSettle.status && typeof afterSettle.status === 'object' ? afterSettle.status : null
    const parkedAfter = readback && readback.turnLoop ? (readback.turnLoop.parked === true || readback.turnLoop.parkedTurn !== null) : null
    const rowsAfter = afterSettle && Array.isArray(afterSettle.turns) ? afterSettle.turns : []
    const rowAfter = rowsAfter.find((x) => x && String(x.turn) === String(parked.turnId)) || null
    ledger.noFence = {
      code: r.code,
      sideEffectsUnverified: r.sideEffectsUnverified === true,
      replyExcerpt: r.replyExcerpt,
      replyLength: r.replyLength,
      replyExcerptMeans: r.replyExcerptMeans,
      sideEffectsMeans: r.sideEffectsMeans,
      deliveryPath: r.delivery ? r.delivery.path : null,
      deliveryStopReason: r.delivery ? r.delivery.stopReason : null,
      hint: r.hint || null,
      settledTurn: parked.turnId,
      settled: { ok: settled.ok === true, abandoned: settled.abandoned === true, code: settled.code || null, settledBy: settled.settledBy || null },
      rowAfterSettlement: rowAfter ? rowAfter.status : null,
      openRowsAfterSettlement: rowsAfter.filter((x) => x && x.status === 'open').length,
      parkedAfterSettlement: parkedAfter,
      settlementMeans: 'the refused envelope consumed the parked slot (a resume, not a refusal before the seam), so the row was left `open` with nothing in flight and nothing parked: op:"abandon" with the NAMED turn settles exactly that row (status "abandoned", settledBy "abandoned-orphan") and leaves no parked slot behind - a "release" that answers abandoned:false and leaves the row open is the RUN 257 defect (an open row the loop reports and cannot close)',
    }
    return r
  })

  // ── 6. A second drive while a turn is parked: the parked turn is a SINGLE slot, refused BY NAME ────────────────
  await step('round-parked-overwritten', 'turn', async () => {
    const first = await record('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '再派 r-1' })
    // ★ RUN 229 / task-13: the second dispatch must be REFUSED BY NAME (VMU_TURN_ALREADY_PARKED) instead of silently
    // replacing the parked prompt. The refusal is a deliberate probe, so it goes to `refusals`, not to `receipts`.
    const second = await probe('vibe_vmu_turn', { op: 'drive', member: 'r-2', rounds: 1, phase: 'normal', why: 'r-1 还没回答就派 r-2' })
    // ★ A report for a member whose turn is NOT the parked one is a STALE REPLY: named, and nothing is supplied.
    const stale = await probe('vibe_vmu_turn', { op: 'reply', reply_for: 'r-2', report: { say: 'r-2 迟到的答复' } })
    // The parked turn is still the one to answer: this reply is r-1's and it completes that turn.
    const answeredParked = await record('vibe_vmu_turn', {
      op: 'step',
      member: 'r-1',
      phase: 'normal',
      why: '回答真正停着的那一回合',
      reply: fence({ say: 'r-1 的答复：我才是当前停着的成员。' }),
    })
    // Only now may another member be dispatched — and that prompt is parked, so it is completed by the next step.
    const dispatched = await record('vibe_vmu_turn', { op: 'drive', member: 'r-2', rounds: 1, phase: 'normal', why: '上一回合答完后派 r-2' })
    const completed = await record('vibe_vmu_turn', {
      op: 'step',
      member: 'r-2',
      phase: 'normal',
      why: '回答 r-2 的回合',
      reply: fence({ say: 'r-2 的答复：轮到我时我才被派。' }),
    })
    ledger.parkedOverwrite = {
      firstTurn: first.memberPrompt ? first.memberPrompt.turnId : null,
      secondDispatch: { ok: second.ok, code: second.code, message: String(second.message || '').slice(0, 240) },
      staleReply: { ok: stale.ok, code: stale.code, message: String(stale.message || '').slice(0, 240) },
      parkedAnswered: { ok: answeredParked.ok === true, turn: (answeredParked.receipt || answeredParked).turn || null },
      nextDispatch: { awaiting: dispatched.awaiting === true, member: dispatched.memberPrompt ? dispatched.memberPrompt.member : null },
      nextCompleted: completed.ok === true,
      means: 'FIXED (RUN 229): a parked turn is still ONE slot, but a second dispatch is refused by name (VMU_TURN_ALREADY_PARKED) instead of silently replacing it, and a report for a member whose turn is not the parked one is refused as a STALE REPLY (VMU_TURN_STALE_REPLY) instead of VMU_INVALID_ARGUMENT. The parked prompt stays answerable, and its prompt is the memberPrompt the first dispatch returned.',
    }
    return { ok: second.ok === false && stale.ok === false && answeredParked.ok === true && completed.ok === true, code: second.code || null }
  })

  // ── 7. A report with no turn to answer: the CALLER path refusal, named ──────────────────────────────────────
  await step('probe-no-pending', 'probe', async () => {
    const r = await probe('vibe_vmu_turn', { op: 'reply', reply_for: 'r-1', report: { say: '没有可回答的回合' } })
    ledger.noPending = { code: r.code, message: r.message, hint: String(r.hint || '').slice(0, 600) }
    return r
  })

  // ── 8. A MEMBER may read the turn state, but may not dispatch: the engine belongs to the office ──────────────
  // The member acts AS ITSELF (`{as:{agent:{id}}}`) — the sim discipline: an act attributed to a seat must be
  // executed by that seat, or the corpus cannot tell the office playing a member from a member acting.
  await step('probe-member-caller', 'probe', async () => {
    const status = await record('vibe_vmu_turn', { op: 'status' }, { as: { agent: { id: 'r-1' } } })
    const dispatch = await probe('vibe_vmu_turn', { op: 'step' }, { as: { agent: { id: 'r-1' } } })
    ledger.memberCaller = {
      statusOk: status.ok === true,
      dispatch: { ok: dispatch.ok, code: dispatch.code, message: String(dispatch.message || '').slice(0, 200), hint: String(dispatch.hint || '').slice(0, 240) },
      means: 'a member caller may read status but not step/drive: the refusal is VMU_NOT_PERMITTED and the hint returns the act to the office — the turn engine cannot be run by a seat on its own behalf',
    }
    return { ok: dispatch.ok === false, code: dispatch.code || null }
  })

  // ── 9. The DELEGATE path: a host with no subagents service refuses by name ──────────────────────────────────
  await step('probe-delegated-path', 'probe', async () => {
    // A second boot with NO settings: the entry then resolves the SUBAGENTS delivery path, which this context cannot
    // satisfy. The drive answers with a failed ROUND (not a thrown error); the reply answers with a top-level refusal.
    const delegated = await boot({ root: tmpRoot('ws-turns-delegated-'), withPrompt: false })
    const started = await delegated.call('vibe_v5_start', { problem: '无交付 seam 的宿主，派回合会怎样', researcherCount: 1 })
    const drive = await delegated.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1 })
    const reply = await delegated.call('vibe_vmu_turn', { op: 'reply', reply_for: 'r-1', report: { say: 'x' } })
    ledger.delegated = {
      started: started.ok === true,
      driveOk: drive.ok,
      roundsRun: drive.roundsRun,
      turnReceipt: (drive.receipts || []).map((x) => ({ member: x.member, failed: x.failed, code: x.code, message: String(x.message || '').slice(0, 240) })),
      replyRefusal: { ok: reply.ok, code: reply.code, message: String(reply.message || '').slice(0, 200), hint: String(reply.hint || '').slice(0, 300) },
      means: 'without deliverMode the subagents path is chosen; this harness context exposes no subagents service, so a batch reports a failed round and the reply channel answers with its own named refusal',
    }
    // An ENVIRONMENTAL code (VMU_ENGINE_UNAVAILABLE) may sit in the corpus as a refused receipt without turning the
    // run red — run.mjs and the audit both exempt it, and its presence is the evidence the delegated path ran.
    seq += 1
    receipts.push({ seq, tool: 'vibe_vmu_turn', as: 'office', args: { op: 'reply', reply_for: 'r-1', report: { say: 'x' } }, receipt: reply })
    refusals.push({ tool: 'vibe_vmu_turn', args: { op: 'drive', member: 'r-1' }, receipt: { ok: false, code: (drive.receipts && drive.receipts[0] && drive.receipts[0].code) || 'VMU_ENGINE_UNAVAILABLE', message: 'the delegated drive produced a failed round, not a top-level refusal', detail: (drive.receipts || [])[0] || null } })
    return { ok: reply.ok === false, code: reply.code || null }
  })

  // ── 9. checkpoint: the round the engine runs at a checkpoint ────────────────────────────────────────────────
  await step('round-checkpoint', 'turn', async () => {
    const parked = await park('r-2', 'checkpoint', '结题检查回合：先 park 再答')
    const r = await answer(parked, 'checkpoint', '结题检查回合', { say: 'r-2：本轮无阻塞，结论待汇总。' })
    const inner = r.receipt || r
    ledger.checkpoint = { phase: 'checkpoint', turn: inner.turn || null, fields: inner.fields || null }
    return r
  })

  // ── 10. verify: the certification arm of the loop ───────────────────────────────────────────────────────────
  await step('round-verify', 'turn', async () => {
    const parked = await park('r-2', 'verify', '复核回合：先 park 再答')
    const r = await answer(parked, 'verify', '复核回合', { say: 'r-2：复核完毕，维持结论。' })
    const inner = r.receipt || r
    ledger.verify = {
      phase: 'verify',
      turn: inner.turn || null,
      fields: inner.fields || null,
      phases: 'kernel/turn/index.js:426 PHASES = founding|normal|checkpoint|verify|verify-debate|meeting|resume — no phase is literally named certification; verify (and verify-debate) IS the certification arm',
    }
    return r
  })

  // ── 11. A round whose work is BLOCKED, and that says why (the blocked archive) ──────────────────────────────
  await step('round-blocked-archive', 'turn', async () => {
    const parked = await park('r-2', 'verify', '形式化被环境阻塞：先 park 再答')
    const r = await answer(parked, 'verify', '形式化被环境阻塞，按公开口径归档', { say: '宿主没有 Lean 工具链，本轮形式化记为显式阻塞。', lean_archive: { name: 'Blocked_One', note: 'this host has no Lean toolchain', blocked: true } })
    const inner = r.receipt || r
    ledger.blockedArchive = { turn: inner.turn || null, fields: inner.fields || null, executed: inner.executed === undefined ? null : inner.executed, skipped: inner.skipped === undefined ? null : inner.skipped }
    return r
  })

  // ── 12. Blocked work: a task whose declared dependency is unmet, then claimed ───────────────────────────────
  await step('blocked-task-claim', 'turn', async () => {
    const blockedTask = await record('vibe_v5_task_create', { subject: '需要库定义的作业', description: '依赖定义任务' })
    const depTask = await record('vibe_v5_task_create', { subject: '库定义', description: '被依赖的任务' })
    const blockedId = blockedTask.task && blockedTask.task.id
    const depId = depTask.task && depTask.task.id
    await record('vibe_v5_task_update', { task_id: blockedId, expected_revision: 1, action: 'set_dependencies', blocked_by: [depId] })
    const claim = await probe('vibe_v5_task_update', { task_id: blockedId, expected_revision: 2, action: 'claim', member: 'r-2' })
    ledger.blockedTask = {
      taskId: blockedId,
      depId,
      claimOk: claim.ok === true,
      claimCode: claim.code || null,
      claimMessage: String(claim.message || '').slice(0, 200),
      claimHint: String(claim.hint || '').slice(0, 260),
      means: claim.ok === true
        ? 'MEASURED: the claim SUCCEEDED although the dependency is unmet, while the reply-field hint says blocked_by is refused by name (see findings)'
        : 'FIXED before RUN 229 (kernel/tasks.js enforces blocked_by): the claim on a task whose dependency is unmet is refused BY NAME (VMU_TASK_BLOCKED), naming the open blocker and the route to done - the hint no longer promises an enforcement that does not exist',
    }
    return { ok: claim.ok === false && claim.code === 'VMU_TASK_BLOCKED', code: claim.code || null }
  })

  // ── 13. The `progress` reply field with a plain string — the shape the teaching invites, now ACCEPTED ──────────
  await step('round-progress-string', 'turn', async () => {
    const parked = await park('r-1', 'normal', 'progress 写成一段文字：先 park 再答')
    const r = await answer(parked, 'normal', 'progress 写成一段文字（提示词教的形式）', { say: '记一条进展', progress: '完成第一步：定义已固定，下一步给出引理。' })
    const inner = r.receipt || r
    const executed = Array.isArray(inner.executedDetail) ? inner.executedDetail : (Array.isArray(inner.executed) ? inner.executed : [])
    const progressRow = executed.find((e) => e && e.field === 'progress') || null
    ledger.progressString = {
      ok: r.ok === true,
      turn: inner.turn || null,
      fields: inner.fields || null,
      executed: inner.executed === undefined ? null : inner.executed,
      skipped: inner.skipped === undefined ? null : inner.skipped,
      coercions: inner.coercions || null,
      progressEntry: progressRow,
      means: 'FIXED (RUN 229): the reply field progress accepts the taught TEXT form and maps it to ONE complete progress row (track progress, kind progress, title from the first line, body the whole text, settled, authored by the turn member) — the kernel reports the coercion in `coercions`, so nothing is half-written and the teaching and the engine agree',
    }
    return r
  })

  // ── 13b. The `progress` field with an object that names no track: refused BY NAME, naming what arrived ────────
  await step('probe-progress-shape', 'probe', async () => {
    const parked = await park('r-1', 'normal', 'progress 写成没有 track 的对象：先 park 再答')
    const r = await answer(parked, 'normal', 'progress 写成没有 track 的对象', { say: '形状不对的一条', progress: { title: '只有标题', body: '没有轨名' } })
    const inner = r.receipt || r
    const skipped = Array.isArray(inner.skippedDetail) ? inner.skippedDetail : (Array.isArray(inner.skipped) ? inner.skipped : [])
    const row = skipped.find((s) => s && s.field === 'progress') || null
    ledger.progressShape = {
      ok: r.ok === true,
      skipped: row,
      message: row ? String(row.message || '').slice(0, 260) : null,
      hint: row ? String(row.hint || '').slice(0, 260) : null,
      leaksUndefined: /undefined/.test(JSON.stringify(row || {})),
      leaksObjectObject: /\[object Object\]/.test(JSON.stringify(row || {})),
      means: 'FIXED (RUN 229): an object with no track is skipped by name (VMU_INVALID_ARGUMENT, reason progress-shape) and the message names the shape it received plus a 60-char excerpt — the old "unknown record track: undefined" leak is gone; the turn itself still completes',
    }
    return { ok: r.ok === true && row !== null && ledger.progressShape.leaksUndefined === false && ledger.progressShape.leaksObjectObject === false, code: row ? row.code || null : null }
  })

  // ── 14. What the rounds wrote on disk ───────────────────────────────────────────────────────────────────────
  const finalTree = tree(h.root)
  steps.push({ name: 'tree', kind: 'observe', ok: true, code: null, files: { before: finalTree.length, after: finalTree.length } })

  return {
    steps,
    receipts,
    /** Self-check failures (a caller-mode drive that parked nothing). run.mjs fails the run on a non-empty list. */
    failures,
    // Every refusal this scenario provokes ON PURPOSE. run.mjs prints them with code and hint and does not count them
    // as mechanism defects; anything else that refuses still fails the run.
    expectedRefusals: [
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_NO_FENCE' },
      // VMU_TURN_NO_PENDING_MEMBER happens TWICE, on two different paths, and "same code, different cause" is
      // exactly what a seq pin can say and a code-only prediction cannot. Both are pinned by the seq the corpus
      // gave them (scripts/sim/run.mjs names the number in its headline: "N pinned by seq"):
      //   seq 15 = the CALLER path: `probe-reply-without-turn` replies for r-1 when nothing is parked (below, the
      //            probe at the `op: "reply", reply_for: "r-1"` call in this scenario).
      //   seq 18 = the DELEGATED path: a SECOND boot with no settings takes the subagents seam, so its reply is
      //            refused by the same code for a different reason (no delivery seam in this context at all).
      // A prediction is a QUOTA, not a pardon (one declaration forgives one refusal): a single copy of this line
      // left the second one to be forgiven by the spent prediction, which the ledger reports as `advisory: 1`. The
      // seqs are re-read after every scenario change (TB-2635 added the drive-before-answer pairing, which moved
      // both of them down by three); a pin that no longer names its refusal shows up as `declared-but-never-hit`.
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_NO_PENDING_MEMBER', seq: 15 },
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_NO_PENDING_MEMBER', seq: 18 },
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_ALREADY_PARKED' },
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_STALE_REPLY' },
      // TB-2616 (task-97) negative face, measured by `probe-step-needs-owner`: a reply with NO parked prompt is
      // refused by name and the staged reply is discarded. One occurrence, so an unpinned (order) prediction is
      // unambiguous here; the matching is a quota, not a pardon - a second one would show up as `advisory`.
      { tool: 'vibe_vmu_turn', code: 'VMU_TURN_PARKED_NEEDS_OWNER' },
      { tool: 'vibe_vmu_turn', code: 'VMU_NOT_PERMITTED' },
      { tool: 'vibe_v5_task_update', code: 'VMU_TASK_BLOCKED' },
    ],
    tree: finalTree,
    promptChars,
    highlights: {
      scenario: 'turns',
      deliveryMode: 'caller',
      root: h.root,
      roster: ledger.rosterLive,
      promptMatrix: promptChars,
      promptMatrixMeans: 'measured through the harness prompt pipeline (scripts/sim/harness.mjs assembleFor: sections + bindings + settings, v5r.fixtureMode tools) with the ROSTER SLOT as the seat (chair|member|temp), which is what kernel/turn/index.js:3555 passes — not the charter source word',
      ledger,
      refusals,
      refusalsMean: 'expected refusals, kept out of result.receipts because scripts/sim/run.mjs counts every ok:false receipt as a mechanism refusal and has no notion of an expected one; each row carries the full receipt (code, message, hint, excerpt, side effects, delivery)',
      findings: [
        'run.mjs and the audit have no expected-refusal channel: a scenario that must MEASURE a refusal (VMU_TURN_NO_FENCE, VMU_TURN_NO_PENDING_MEMBER, VMU_TURN_ALREADY_PARKED, VMU_TURN_STALE_REPLY, VMU_NOT_PERMITTED) cannot keep an honest ok:false step without failing the run or the audit. Measured here, not worked around.',
        'the harness boot takes settings but no delivery seam: without settings every drive reports a failed round VMU_ENGINE_UNAVAILABLE because this context has no subagents service. The scenario declares deliverMode:"caller" through the settings export, which run.mjs maps onto config.vmu — a scenario WITHOUT that export can never run a turn.',
        'FIXED in RUN 229 (kernel/turn/index.js): a parked turn is still ONE slot by design, but a second dispatch is now refused by name (VMU_TURN_ALREADY_PARKED, hint says to answer the parked prompt first) instead of silently replacing it, and a report for a member whose turn is not the parked one is refused as VMU_TURN_STALE_REPLY instead of VMU_INVALID_ARGUMENT. The parked prompt stays the memberPrompt the first dispatch returned.',
        'FIXED before RUN 229 (kernel/tasks.js): blocked_by dependencies DO block a claim now - a claim on a task whose dependency is unmet is refused by name (VMU_TASK_BLOCKED), naming the open blocker and the route to done. The scenario measures the refusal.',
        'FIXED in RUN 229 (kernel/turn/index.js): the reply field progress now accepts the taught TEXT form and maps it to one complete progress row (coercion reported), while an object that names no track is skipped by name with the shape it received plus a 60-char excerpt — no "unknown record track: undefined" leak reaches the receipt or the audit.',
        'kernel PHASES has no phase named certification (kernel/turn/index.js:426); the certification arm is verify/verify-debate. The scenario covers verify and checkpoint as the two phase-bound rounds.',
      ],
    },
  }
}

export const scenario = turns
export default turns
