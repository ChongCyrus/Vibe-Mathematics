// ★ RUN 256 / TB-2616 (task-97) — THE PARKED TURN IS CONTINUED, NOT REPLACED.
//
// MEASURED (audit round 14, the caller-played route the live runs use): `vibe_vmu_turn { op:"step", reply:"…" }` supplied
// the reply and then called `step`, which opened a NEW turn. The receipt named t-2, the record was attributed to the
// parked member (the seam's `forMember` came from the parked prompt), and t-1 — the turn whose prompt was actually
// answered — stayed `status:"open"` for the rest of the run. `drive` refused an overwrite of a parked prompt by name;
// `step` silently replaced it.
//
// THE REPAIR (this suite pins it):
//   1. P0-1 the staged reply is applied to the PARKED turn: same turnId, same member, same promptId. The receipt says so
//      (`resumed:true`, `resumedTurnId`, `resumedPromptId`), and the ledger has ONE row for that turn, now terminal.
//   2. P0-2 `step` and `drive` refuse a parked prompt through the SAME gate (`VMU_TURN_ALREADY_PARKED`, same reader,
//      same facts) — `step` can no longer silently replace it.
//   3. A reply with nothing to answer is refused by name (`VMU_TURN_PARKED_NEEDS_OWNER`) and DISCARDED, so it cannot
//      leak onto the next turn.
//   4. THREE EXITS, three `settledBy` values: resumed (the caller answered), released (op:"abandon"), timed-out (the
//      parked prompt outlived abandonAfterMs — the loop closes it by name so one walked-away caller cannot hold the slot).
//   5. `status().turnLoop` and `kernel.turn.turnLoop()` are the SAME reading, parked period and after.
//
// §0 source-side readings: one gate, one reader, named shapes
// §1 a staged reply CONTINUES the parked turn (same turnId/member/promptId, one terminal row, no second assembly)
// §2 a step over a parked prompt with NO reply is refused by name, with facts, and changes nothing
// §3 the REAL text channel (`vibe_vmu_turn { op:"step", reply }`) takes the same resume path
// §4 a reply with no parked prompt is refused and discarded (it never lands on the next turn)
// §5 the three exits write three settledBy values
// §6 status().turnLoop is the loop's own reading, before and after
//
// Run: node tests/vmu-run256-parked-turn.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')

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

const { toolSpecs, TOOL_NAMES } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r256-')); roots.push(d); return d }

const boot = async (root, vmu) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller', vmu: vmu || {} })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, ctx }
}

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const attempt = async (fn) => {
  try { return { threw: false, value: await fn() } } catch (e) { return { threw: true, code: (e && e.code) || null, message: e && e.message, hint: e && e.hint, parked: e && e.parkedFacts, parkedReason: e && e.parkedReason, parkedMeans: e && e.parkedMeans, parkedReplyDiscarded: e && e.parkedReplyDiscarded === true ? true : (e && typeof e === 'object' ? e.parkedReplyDiscarded : undefined) } }
}
const rowsOf = (K, turnId) => {
  const st = K.turn.status()
  return (st.turnReceipts || []).filter((r) => r && String(r.turn) === String(turnId))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  // ── §0 ONE GATE, ONE READER, NAMED SHAPES ──────────────────────────────────────────────────────────────────────
  {
    console.log('§0 the repair is one predicate with one name, not two independent patches')
    ok(turnSource.includes('VMU_TURN_PARKED_NEEDS_OWNER'), '§0a the "reply with nothing to answer" refusal has its own name')
    ok((turnSource.match(/'VMU_TURN_ALREADY_PARKED'/g) || []).length === 2,
      '§0b the overwrite code is spelled ONCE (definition + the lastRefusal mirror), so `step` and `drive` cannot disagree',
      (turnSource.match(/'VMU_TURN_ALREADY_PARKED'/g) || []).length)
    ok((turnSource.match(/refuseParkedOverwrite\('/g) || []).length === 2,
      '§0c exactly TWO doors call that one gate (`dispatching`, `stepping`) — no third copy exists',
      (turnSource.match(/refuseParkedOverwrite\('/g) || []).length)
    ok((turnSource.match(/parkedOf\(parkedPromptNow\(\)\)/g) || []).length >= 2,
      '§0d both doors read the parked prompt through the SAME reader')
    ok(turnSource.includes('resumeTurn') && turnSource.includes('resumedPromptId'),
      '§0e the resume path is named (turn + prompt identity travel together)')
    // ★ The RU N 250 pin fixes the settled patch to ONE literal (`Object.assign({ emptyReply, replyBytes }, evidence)`),
    // so `resumed` cannot ride inside it any more: it is written onto the same patch object right after, and the other two
    // exits keep their own sites (abandonTurn's `settledBy: settled`, and `timed-out` from the loop's own close).
    ok(turnSource.includes("settledPatch.settledBy = 'resumed'") && turnSource.includes("settledBy: 'timed-out'") && turnSource.includes("settledBy: 'released'") === false,
      '§0f the resumed and timed-out exits are written where they happen (released is the abandon default)')
    ok(turnSource.includes('closeParkedOverdue') && turnSource.includes('parkedAt'),
      '§0g a parked prompt carries its age, and a named closer exists for the third exit')
  }

  // ── §1 A STAGED REPLY CONTINUES THE PARKED TURN ───────────────────────────────────────────────────────────────
  {
    console.log('§1 the reply answers THAT turn: same turnId, same member, same promptId, one terminal row')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 park r-1' })
    ok(parked && parked.awaiting === true, '§1a the first step parks a member turn on the caller', parked && parked.awaiting)
    const parkedTurnId = parked && parked.memberPrompt && parked.memberPrompt.turnId
    const parkedPromptId = parked && parked.memberPrompt && parked.memberPrompt.promptId
    ok(typeof parkedTurnId === 'string' && parkedTurnId !== '', '§1b the parked prompt names its turn', parkedTurnId)
    ok(typeof parkedPromptId === 'string' && parkedPromptId !== '', '§1c and its own prompt id (a prompt has identity, not just a member)', parkedPromptId)
    const beforeCounts = K.turn.status().counts
    const supplied = await K.turn.supplyMemberReply(fence({ say: 'r-1 的回答：本回合完成。' }), 'r-1')
    ok(supplied && supplied.ok === true, '§1d the reply is staged for the parked member', supplied)
    const resumed = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 answer parked' }))
    const res = resumed.value || {}
    ok(resumed.threw === false, '§1e answering the parked prompt is accepted', resumed.threw ? resumed : null)
    ok(res.ok === true && res.resumed === true, '§1f the receipt says this call RESUMED a turn', { ok: res.ok, resumed: res.resumed })
    ok(res.resumedTurnId === parkedTurnId, '§1g ★★★ the resumed turnId IS the parked turn id (no new t-N)', { resumed: res.resumedTurnId, parked: parkedTurnId })
    ok(res.resumedMember === 'r-1', '§1h the resumed member is the parked member', res.resumedMember)
    ok(res.resumedPromptId === parkedPromptId, '§1i ★★★ the promptId is the one the caller was holding', { resumed: res.resumedPromptId, parked: parkedPromptId })
    const rec = res.receipt || {}
    ok(rec.turn === parkedTurnId, '§1j ★★★ the ledged receipt belongs to the parked turn', { receiptTurn: rec.turn, parked: parkedTurnId })
    ok(rec.member === 'r-1', '§1k and to the parked member', rec.member)
    ok(rec.resumedTurnId === parkedTurnId && rec.resumed === true, '§1l the receipt itself carries the resume reading (a reader that only opens `receipt` still sees it)', { resumed: rec.resumed, turn: rec.resumedTurnId })
    ok(typeof res.resumedMeans === 'string' && /same turnId/.test(res.resumedMeans), '§1m and states the claim in words', res.resumedMeans)
    const rows = rowsOf(K, parkedTurnId)
    ok(rows.length === 1, '§1n ★★★ turnReceipts has exactly ONE row for that turn (no phantom second turn)', rows.map((r) => r.turn))
    ok(rows[0] && rows[0].status !== 'open', '§1o ★★★ and it is TERMINAL, not left open', rows[0] && rows[0].status)
    ok(rows[0] && rows[0].settledBy === 'resumed', '§1p settledBy names the exit that closed it', rows[0] && rows[0].settledBy)
    const st = K.turn.status()
    ok(st.turns === 1, '§1q the kernel opened exactly ONE turn in this run (the resume did not open another)', st.turns)
    ok(st.turnLoop.parked === false && st.turnLoop.openTurns === 0, '§1r nothing is parked and no row is left open', { parked: st.turnLoop.parked, openTurns: st.turnLoop.openTurns })
    ok(st.counts.assembled === beforeCounts.assembled, '§1s ★★ the resume did NOT re-assemble the prompt (one prompt, one assembly — notices are one-shot)',
      { before: beforeCounts.assembled, after: st.counts.assembled })
    ok(/undefined/.test(JSON.stringify(res)) === false, '§1t the receipt leaks no literal undefined')
  }

  // ── §2 A STEP OVER A PARKED PROMPT WITH NO REPLY IS REFUSED, WITH FACTS ──────────────────────────────────────
  {
    console.log('§2 step with no reply over a parked prompt: refused by name, nothing replaced')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 park for gate' })
    const parkedTurnId = parked.memberPrompt.turnId
    const parkedPromptId = parked.memberPrompt.promptId
    const refused = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 second step' }))
    ok(refused.threw === true, '§2a the second step is REFUSED (it does not silently replace the parked prompt)', refused.code)
    ok(refused.code === 'VMU_TURN_ALREADY_PARKED', '§2b the code is the SAME one `drive` uses', refused.code)
    ok(typeof refused.message === 'string' && refused.message.includes('already parked') && refused.message.includes('r-1'),
      '§2c the message says a turn is parked, and for whom', refused.message)
    ok(typeof refused.hint === 'string' && refused.hint.includes('answer the parked prompt first'), '§2d the hint says how to continue', refused.hint)
    const facts = refused.parked || {}
    ok(facts.turnId === parkedTurnId, '§2e ★★ the refusal carries the parked TURN id', facts.turnId)
    ok(facts.member === 'r-1' && facts.promptId === parkedPromptId, '§2f and the member + prompt id', { member: facts.member, promptId: facts.promptId })
    ok(Number.isFinite(facts.parkedSince), '§2g and since when it has been parked', facts.parkedSince)
    ok(typeof facts.releaseBy === 'string' && facts.releaseBy.includes('op:"step"') && facts.releaseBy.includes('op:"abandon"'),
      '§2h and WHICH door releases it (two exits, both named)', facts.releaseBy)
    ok(typeof refused.parkedMeans === 'string' && refused.parkedMeans.length > 40, '§2i the refusal explains why it is refused (not a bare code)', refused.parkedMeans)
    const rows = rowsOf(K, parkedTurnId)
    ok(rows.length === 1 && rows[0].status === 'open', '§2j ★★★ the parked turn is UNTOUCHED — still open, still one row', rows.map((r) => r.status))
    const loop = K.turn.turnLoop()
    ok(loop.parked === true && loop.parkedTurn === parkedTurnId && loop.parkedPromptId === parkedPromptId,
      '§2k the loop reading names the parked prompt (turn + prompt)', { parked: loop.parked, turn: loop.parkedTurn })
    ok(K.turn.awaitingCaller() === true, '§2l and the prompt is still there to answer')
  }

  // ── §3 THE REAL TEXT CHANNEL TAKES THE SAME PATH ─────────────────────────────────────────────────────────────
  {
    console.log('§3 `vibe_vmu_turn { op:"step", reply }` continues the parked turn through the tool face')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const specs = toolSpecs({ kernel: K, settings: {}, turnTool: true })
    const turnTool = specs.find((s) => s.name === TOOL_NAMES.turn)
    ok(turnTool !== undefined, '§3a the turn face is published', specs.map((s) => s.name))
    const handed = await turnTool.run({ op: 'step', phase: 'normal' })
    ok(handed && handed.awaiting === true, '§3b the face hands the prompt back (awaiting:true)', handed && handed.awaiting)
    const parkedTurnId = handed.memberPrompt && handed.memberPrompt.turnId
    const parkedPromptId = handed.memberPrompt && handed.memberPrompt.promptId
    const answered = await turnTool.run({ op: 'step', phase: 'normal', reply: fence({ say: 'r-1 通过文本通道回答。' }) })
    ok(answered && answered.ok === true && answered.receipt, '§3c the text-channel answer is accepted and settles', answered && { ok: answered.ok, code: answered.code })
    ok(answered.resumedTurnId === parkedTurnId, '§3d ★★★ the text channel resumed the SAME turn id', { resumed: answered.resumedTurnId, parked: parkedTurnId })
    ok(answered.resumedPromptId === parkedPromptId, '§3e and the same prompt id', answered.resumedPromptId)
    ok(answered.receipt && answered.receipt.turn === parkedTurnId, '§3f the receipt belongs to that turn', answered.receipt && answered.receipt.turn)
    const rows = rowsOf(K, parkedTurnId)
    ok(rows.length === 1 && rows[0].status !== 'open', '§3g ★★★ one terminal row for the parked turn (the live-run defect was t-1 open forever)', rows.map((r) => ({ s: r.status, t: r.turn })))
    ok(K.turn.status().turns === 1, '§3h the face did not open a second turn', K.turn.status().turns)
  }

  // ── §4 A REPLY WITH NOTHING TO ANSWER IS REFUSED AND DISCARDED ───────────────────────────────────────────────
  {
    console.log('§4 a staged reply with no parked prompt: named refusal, and the reply cannot leak onto the next turn')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const staged = await K.turn.supplyMemberReply(fence({ say: '这一条没有对应的提示词' }), null)
    ok(staged && staged.ok === true, '§4a the bare channel accepts a reply (it cannot know yet that nothing is parked)', staged)
    const refused = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 orphan reply' }))
    ok(refused.threw === true, '§4b the step REFUSES to apply it', refused.code)
    ok(refused.code === 'VMU_TURN_PARKED_NEEDS_OWNER', '§4c with its own name (not VMU_INVALID_ARGUMENT)', refused.code)
    ok(refused.parkedReason === 'no-parked-prompt', '§4d the reason is stated', refused.parkedReason)
    ok(typeof refused.message === 'string' && refused.message.includes('nothing for it to answer'),
      '§4e the message says why (it would be attributed to a turn nobody asked about)', refused.message)
    ok(typeof refused.hint === 'string' && /memberPrompt|drive|step/.test(refused.hint), '§4f and the hint is actionable', refused.hint)
    // ★ the refusal must be a STOP, not a warning: no turn may be opened by the call that carries the orphan reply, and
    // nothing may be left parked (a staged reply that survived would answer the NEXT prompt - exactly the live defect,
    // one door earlier).
    const turnsAfterRefusal = K.turn.status().turns
    const loopAfterRefusal = K.turn.turnLoop()
    ok(turnsAfterRefusal === 0, '§4f2 ★★ the refused call opened NO turn — the orphan reply never became one', turnsAfterRefusal)
    ok(refused.parkedReplyDiscarded === true, '§4f4 ★★ the receipt says the orphan reply was DISCARDED (not staged for the next turn)', refused.parkedReplyDiscarded)
    ok(loopAfterRefusal.parked === false && loopAfterRefusal.openTurns === 0,
      '§4f3 ★★ and nothing is left parked or open', { parked: loopAfterRefusal.parked, openTurns: loopAfterRefusal.openTurns })
    const after = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 fresh turn after discard' }))
    ok(after.threw === false && after.value && after.value.awaiting === true,
      '§4g ★★★ the slot is CLEARED: a plain step now opens a real turn (the orphan reply was discarded, not left staged)',
      after.threw ? after : { awaiting: after.value && after.value.awaiting })
    const freshTurnId = after.value && after.value.memberPrompt && after.value.memberPrompt.turnId
    ok(typeof freshTurnId === 'string' && freshTurnId !== '', '§4h and that fresh prompt has its own id', freshTurnId)

    // ★★ THE SAME NEGATIVE THROUGH THE LIVE TEXT CHANNEL (`{op:"step", reply}` with nothing parked). The kernel-level
    // reading above proves the mechanism; this proves the door a real caller actually uses meets it — and that the
    // receipt the caller reads carries all five facts the simulator pins (code / reason / discarded / still-empty /
    // no-new-turn). A `reply`-first call is exactly what a transcript-level caller does when it misreads which prompt
    // is outstanding.
    const b2 = await boot(await mkRoot())
    const K2 = b2.K
    await K2.members.hire({ id: 'r-1', slot: 'member' })
    const specs2 = toolSpecs({ kernel: K2, settings: {}, turnTool: true })
    const turnTool2 = specs2.find((s) => s.name === TOOL_NAMES.turn)
    const orphanFace = await attempt(() => turnTool2.run({ op: 'step', phase: 'normal', reply: fence({ say: '没有提示词可答。' }) }))
    // ★ The live channel returns this refusal as a RECEIPT (the generic funnel would keep only code/message/hint and drop
    // the three facts the simulator pins), so the caller can read WHY and WHAT happened — not just that it failed.
    ok(orphanFace.threw === false && orphanFace.value && orphanFace.value.ok === false && orphanFace.value.code === 'VMU_TURN_PARKED_NEEDS_OWNER',
      '§4i ★★★ the live text channel is refused the same way (reply first, no drive), as a named receipt', orphanFace.threw ? orphanFace.code : (orphanFace.value && orphanFace.value.code))
    ok(orphanFace.value && orphanFace.value.parkedReason === 'no-parked-prompt', '§4j with the reason named on the receipt', orphanFace.value && orphanFace.value.parkedReason)
    ok(orphanFace.value && orphanFace.value.parkedReplyDiscarded === true, '§4k ★★ and the receipt says the reply was discarded', orphanFace.value && orphanFace.value.parkedReplyDiscarded)
    const loopFace = K2.turn.turnLoop()
    ok(K2.turn.status().turns === 0, '§4l ★★ the refused face call opened NO turn', K2.turn.status().turns)
    ok(loopFace.parked === false && loopFace.openTurns === 0,
      '§4m ★★ and no turn is parked or open — the refusal did not park anything',
      { parked: loopFace.parked, openTurns: loopFace.openTurns })
    // ★ THE PROOF THAT THE ORPHAN REPLY IS GONE (not just that a receipt says so): with a fresh prompt parked, a bare
    // second step has NOTHING staged to consume, so it must be refused. If the discarded reply were still in the slot,
    // this call would silently RESUME the fresh turn with words meant for a turn that never existed.
    const freshFace = await attempt(() => turnTool2.run({ op: 'step', phase: 'normal' }))
    ok(freshFace.threw === false && freshFace.value && freshFace.value.awaiting === true,
      '§4n the next prompt parks normally', freshFace.threw ? freshFace : { awaiting: freshFace.value && freshFace.value.awaiting })
    const bareSecond = await attempt(() => turnTool2.run({ op: 'step', phase: 'normal' }))
    ok(bareSecond.threw === true && bareSecond.code === 'VMU_TURN_ALREADY_PARKED',
      '§4o ★★★ a bare second step is REFUSED, which proves the orphan reply is no longer staged (it would have been consumed as an answer)',
      bareSecond.threw ? bareSecond.code : bareSecond.value)
  }

  // ── §5 THREE EXITS, THREE settledBy VALUES ───────────────────────────────────────────────────────────────────
  {
    console.log('§5 resumed / released / timed-out — each exit names itself on the ledger')
    const seen = []
    // (a) resumed
    {
      const b = await boot(await mkRoot())
      const K = b.K
      await K.members.hire({ id: 'r-1', slot: 'member' })
      const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 exit resumed' })
      await K.turn.supplyMemberReply(fence({ say: '继续' }), 'r-1')
      const res = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 exit resumed apply' }))
      ok(res.threw === false, '§5a the resumed exit works', res.threw ? res : null)
      const row = rowsOf(K, parked.memberPrompt.turnId)[0]
      ok(row && row.settledBy === 'resumed', '§5b its row says settledBy:"resumed"', row && row.settledBy)
      if (row) seen.push(row.settledBy)
    }
    // (b) released
    {
      const b = await boot(await mkRoot())
      const K = b.K
      await K.members.hire({ id: 'r-1', slot: 'member' })
      const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 exit released' })
      const closed = await attempt(() => K.turn.abandon({ turn: parked.memberPrompt.turnId, why: 'the caller let go of the parked prompt' }))
      ok(closed.threw === false && closed.value && closed.value.abandoned === true, '§5c op:"abandon" closes the parked turn by name', closed.threw ? closed : closed.value)
      ok(closed.value && closed.value.settledBy === 'released', '§5d its receipt says settledBy:"released"', closed.value && closed.value.settledBy)
      const row = rowsOf(K, parked.memberPrompt.turnId)[0]
      ok(row && row.settledBy === 'released' && row.status === 'abandoned', '§5e the ledger row carries the same exit', row && { settledBy: row.settledBy, status: row.status })
      const loop = K.turn.turnLoop()
      ok(loop.parked === false, '§5f the parked slot is released', loop.parked)
      ok(Array.isArray(loop.recentAbandonments) && loop.recentAbandonments.length === 1 && loop.recentAbandonments[0].settledBy === 'released',
        '§5g and the loop keeps the closure on the record', loop.recentAbandonments)
      if (row) seen.push(row.settledBy)
    }
    // (c) timed-out: the parked prompt outlives the deployment's abandonAfterMs
    {
      const b = await boot(await mkRoot(), { 'vmu.turn.abandonAfterMs': 60 })
      const K = b.K
      await K.members.hire({ id: 'r-1', slot: 'member' })
      ok(K.turn.turnLoop().abandonAfterMs === 60, '§5h a deployment can shorten the deadline (60 ms here)', K.turn.turnLoop().abandonAfterMs)
      const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 exit timed out' })
      const parkedTurnId = parked.memberPrompt.turnId
      await sleep(140)
      const after = await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 after the parked prompt aged out' }))
      ok(after.threw === false, '§5i ★★★ the door is NOT blocked forever by a caller who walked away', after.threw ? after : null)
      const newTurnId = after.value && after.value.memberPrompt && after.value.memberPrompt.turnId
      ok(typeof newTurnId === 'string' && newTurnId !== parkedTurnId, '§5j a NEW turn opens (the old one was closed, not resumed)', { old: parkedTurnId, now: newTurnId })
      const row = rowsOf(K, parkedTurnId)[0]
      ok(row && row.status === 'abandoned' && row.settledBy === 'timed-out',
        '§5k ★★★ the aged-out row says settledBy:"timed-out"', row && { status: row.status, settledBy: row.settledBy })
      const loop = K.turn.turnLoop()
      const last = (loop.recentAbandonments || [])[0]
      ok(last && last.settledBy === 'timed-out' && /abandonAfterMs/.test(String(last.why)),
        '§5l and the loop names the deadline it crossed', last && { settledBy: last.settledBy, why: String(last.why).slice(0, 80) })
      if (row) seen.push(row.settledBy)
    }
    ok(seen.length === 3 && seen[0] === 'resumed' && seen[1] === 'released' && seen[2] === 'timed-out',
      '§5m ★★★ the three exits wrote THREE DISTINCT values (not one word for three facts)', seen)
  }

  // ── §6 status().turnLoop IS THE LOOP'S OWN READING ───────────────────────────────────────────────────────────
  {
    console.log('§6 two readers, one reading: parked period and after')
    const b = await boot(await mkRoot())
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 loop reading' })
    const parkedTurnId = parked.memberPrompt.turnId
    const parkedPromptId = parked.memberPrompt.promptId
    const a1 = JSON.stringify(K.turn.turnLoop())
    const b1 = JSON.stringify(K.turn.status().turnLoop)
    ok(a1 === b1, '§6a while parked, the two readers are the same object shape and values', { bytes: a1.length })
    const loop = K.turn.turnLoop()
    ok(loop.parked === true && loop.parkedTurn === parkedTurnId && loop.parkedMember === 'r-1' && loop.parkedPromptId === parkedPromptId,
      '§6b the parked period is READ (turn, member, prompt)', { parked: loop.parked, turn: loop.parkedTurn })
    ok(loop.inFlight === false && loop.parked === true,
      '§6c ★★ inFlight:false + parked:true is not a contradiction: the lock is released, the prompt is held', { inFlight: loop.inFlight, parked: loop.parked })
    ok(Number.isFinite(loop.parkedSince) && Number.isFinite(loop.parkedForMs), '§6d the age of the parked prompt is numbered', { since: loop.parkedSince, forMs: loop.parkedForMs })
    ok(typeof loop.parkedMeans === 'string' && loop.parkedMeans.length > 40, '§6e and the reading spells itself out', loop.parkedMeans)
    await K.turn.supplyMemberReply(fence({ say: '完成' }), 'r-1')
    await attempt(() => K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run256 loop reading apply' }))
    const a2 = JSON.stringify(K.turn.turnLoop())
    const b2 = JSON.stringify(K.turn.status().turnLoop)
    ok(a2 === b2, '§6f after the parked turn settles, the two readers still agree')
    const loop2 = K.turn.turnLoop()
    ok(loop2.parked === false && loop2.openTurns === 0, '§6g and nothing is parked or open', { parked: loop2.parked, openTurns: loop2.openTurns })
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
console.log('=== VMU RUN 256 PARKED TURN: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
