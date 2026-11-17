// scripts/sim/scenarios/long-session.mjs — C#21: FRAMEWORK-SIDE CONTEXT COMPACTION IN A LONG SESSION (ROUND-10 coverage gap).
//
// WHY THIS SCENARIO EXISTS. The ROUND-10 audit found `contextCompaction` reported 6 times with `droppedCount=0` in the
// whole corpus: the framework trims a member's transcript to `vmu.prompt.compactAfterRounds` (declared default 8) and
// carries the dropped tail as a bounded summary in the NEXT prompt — but no scenario ever ran a seat past the
// keep-window, so "the summary block is in the prompt and a seat knows it is looking at old context" was a BLIND SPOT
// for the prompts lane, not a product defect it could audit.
//
// WHAT THIS SCENARIO DOES. One seat (r-1) is driven through TEN real, answered rounds (progress + a sentence each) —
// more than the declared keep-window of 8 — so the framework REALLY trims: `droppedCount > 0`, `summaryBytes > 0`, and
// the next prompt carries 「【上下文摘要（框架裁剪；已丢弃 N 轮，摘要 X 字节）】」. The budget is the DECLARED default
// (explicitly set to 8; never lowered to make the scenario pass). The /full/ prompt is then read back through the
// public paged face (`vibe_vmu_turn {op:"prompt"}` — the awaiting receipt's `memberPrompt.text` is receipt-bounded, so
// the block at the END of the prompt is not necessarily in it) and recorded into the scenario corpus as a prompt row,
// so the prompts lane audits the same characters a seat would read.
//
// WHAT IS DELIBERATELY *NOT* CLAIMED. The per-turn ledger (`droppedTurns: [{turnId, bytes}]`) is NOT on any public
// face (the turn receipt has no `contextCompaction`; `op:"status"` is the bounded projection: budget + per-member
// counts only). The scenario therefore records the projection and the prompt, and states the ledger gap in
// `highlights.compaction.exposure` instead of inventing a reading. See ROUND-10 report.

import { boot, tmpRoot } from '../harness.mjs'

/** The delivery seam this scenario needs: the CALLER path (turns the prompt into evidence). */
export const settings = {
  deliverMode: 'caller',
  // EXPLICIT keep-window = the DECLARED default (8). Never lowered: 10 rounds > 8 is the whole point; the mechanism
  // must trim under the budget a deployment really gets.
  'vmu.prompt.compactAfterRounds': 8,
}

// A deterministic, MOVING clock: the progress dedupe key is `(member, row.createdAt >= turn start)`, so a FIXED clock
// can make later progress rows land as `skipped-duplicate` (the ROUND-2 C1 lesson in turns.mjs). Advancing by a
// literal constant keeps every round's write real AND keeps two runs byte-identical.
export const clockState = { now: 1_800_000_000_000 }
export const clock = () => clockState.now

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)
const BLOCK_MARK = '【上下文摘要（框架裁剪'

export async function longSession(h, { log = () => {} } = {}) {
  const steps = []
  const failures = []
  const highlights = {}
  const log1 = (m) => log('  ' + m)
  const files = () => (h.tree ? h.tree().length : 0)
  const step = async (name, fn) => {
    const before = h.receipts.length
    const filesBefore = files()
    let out = null
    try { out = await fn() } catch (e) {
      out = { ok: false, code: (e && e.code) || 'SIM_THREW', message: String((e && e.message) || e) }
    }
    const row = { name, at: h.receipts.length, receipts: h.receipts.length - before, files: { before: filesBefore, after: files() }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null }
    steps.push(row)
    log1(name + (row.ok ? '  ok' : '  [' + (row.code || 'refused') + ']'))
    return out
  }

  // ── ① the institute exists: one long-session seat (r-1) beside the chair ────────────────────────────────────────
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '长会话压缩仿真：同一席位连续 10 轮（> 框架 keep-window 8），占位题，不压数学。',
    researcherCount: 2,
  }))
  const roster = h.kernel && h.kernel.members && typeof h.kernel.members.roster === 'function'
    ? h.kernel.members.roster().map((m) => (m && m.id) || m)
    : null
  highlights.started = { ok: started && started.ok === true, hired: started ? started.hired : null, roster }

  // ── ①b THE DECLARED KEEP-WINDOW, READ FROM THE PRODUCT (never a literal in the assertions) ──────────────────────
  // cross-r11 ② asks that the boundary control not hardcode the window: the projection reports `keepRecentTurns`, so
  // THIS scenario derives "within / over the window" from that reading and only asserts it agrees with the declared
  // setting it boots with (8). If the product's window changes, the boundary moves with it instead of silently rotting.
  const keepWindowReading = await step('session/keep-window', () => h.call('vibe_vmu_turn', { op: 'status' }))
  const kst = keepWindowReading && keepWindowReading.status ? keepWindowReading.status : keepWindowReading
  const kproj = kst && kst.contextCompaction ? kst.contextCompaction : null
  const keepWindow = kproj && Number.isInteger(Number(kproj.keepRecentTurns)) && Number(kproj.keepRecentTurns) > 0 ? Number(kproj.keepRecentTurns) : null
  const declaredBudget = Number(settings['vmu.prompt.compactAfterRounds'])
  const roundsToRun = (keepWindow === null ? declaredBudget : keepWindow) + 2
  highlights.keepWindow = { keepWindow, declaredBudget, roundsToRun, agrees: keepWindow !== null && keepWindow === declaredBudget,
    means: 'the window is READ from the kernel projection and cross-checked against the declared setting; the rounds driven are window+2, so "over the window" is a claim about the product reading, not a hardcoded constant' }
  if (!(keepWindow !== null && keepWindow === declaredBudget)) {
    failures.push({ code: 'SIM_C21_KEEP_WINDOW_READING', step: 'session/keep-window', message: 'the projection keepRecentTurns does not equal the declared compactAfterRounds: ' + JSON.stringify({ keepWindow, declaredBudget }), means: 'the boundary and the positive block assertion are derived from the declared budget; if the projection disagrees there is no trustworthy window to be inside or outside', })
  }

  /** Read the FULL archived prompt through the public paged face (the common ruler for every prompt read below). */
  const readArchivedPrompt = async (hh = h) => {
    let text = ''
    let chars = null
    let pages = null
    let offset = 0
    for (let page = 0; page < 40; page += 1) {
      const pr = await hh.call('vibe_vmu_turn', { op: 'prompt', member: 'r-1', offset, limit: 9000 })
      if (!pr || pr.ok !== true) return { ok: false, code: pr && pr.code ? pr.code : 'SIM_PROMPT_READ_FAILED', message: pr && pr.message ? String(pr.message) : 'prompt op refused' }
      if (page === 0) { chars = typeof pr.chars === 'number' ? pr.chars : null; pages = pr.pages === undefined ? null : pr.pages }
      text += String(pr.text || '')
      const next = pr.nextOffset === undefined || pr.nextOffset === null ? offset + String(pr.text || '').length : pr.nextOffset
      if (pr.done === true || next === offset) break
      offset = next
    }
    return { ok: true, text, chars, pages }
  }

  // ── ② THE SESSION on the same seat (the caller plays each one): window+2 real rounds ──────────────────────────
  const rounds = []
  for (let i = 1; i <= roundsToRun; i += 1) {
    clockState.now += 60_000
    const parked = await step('session/' + i + '/park', () => h.call('vibe_vmu_turn', {
      op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '长会话第 ' + i + ' 轮（同一席位连续推进）',
    }))
    const prompt = parked && parked.memberPrompt ? parked.memberPrompt : null
    // BOUNDARY NEGATIVE CONTROL (the 反灯 ask, in-scenario form): at EXACTLY the keep-window (8 answered turns) the
    // next prompt must carry NO summary block and the projection must report droppedCount 0 — so the block asserted
    // after 10 rounds cannot be an unconditional banner. (Mutating the setting upward would redden the 10-round
    // assertion; this control proves the lower edge on the REAL declared budget without changing it.)
    if (i === keepWindow + 1) {
      const boundaryPrompt = await step('session/window-boundary', () => readArchivedPrompt())
      const boundaryText = boundaryPrompt && boundaryPrompt.ok === true ? String(boundaryPrompt.text || '') : ''
      const boundaryStatus = await step('session/window-boundary-status', () => h.call('vibe_vmu_turn', { op: 'status' }))
      const bst = boundaryStatus && boundaryStatus.status ? boundaryStatus.status : boundaryStatus
      const bproj = bst && bst.contextCompaction ? bst.contextCompaction : null
      const brow = bproj && Array.isArray(bproj.members) ? bproj.members.filter((m) => m && m.member === 'r-1')[0] || null : null
      highlights.windowBoundary = {
        answeredRoundsBeforeThisAssembly: i - 1,
        keepRecentTurns: bproj ? bproj.keepRecentTurns : null,
        blockFound: boundaryText.includes(BLOCK_MARK),
        projection: brow,
        means: 'at the declared keep-window (8 answered turns) the NEXT prompt must carry NO summary block and the projection must report droppedCount 0 — otherwise the block asserted at 10 rounds would be an unconditional banner, not evidence of trimming',
      }
      if (boundaryText === '' || boundaryText.includes(BLOCK_MARK)) {
        failures.push({ code: 'SIM_C21_COMPACTED_TOO_EARLY', step: 'session/window-boundary', message: 'a summary block is present in the prompt assembled at the keep-window (' + (i - 1) + ' answered turns, keep ' + keepWindow + ')', means: 'the block must appear ONLY after the transcript exceeds the declared keep-window; an unconditional banner is not compaction evidence', })
      }
      if (!(brow && Number(brow.droppedCount) === 0)) {
        failures.push({ code: 'SIM_C21_BOUNDARY_PROJECTION', step: 'session/window-boundary-status', message: 'the status projection already reports droppedCount>0 at the keep-window: ' + JSON.stringify(brow), means: 'the projection must agree with the boundary: nothing is dropped until the window is exceeded', })
      }
    }
    const answered = await step('session/' + i + '/answer', () => h.call('vibe_vmu_turn', {
      op: 'step', member: 'r-1', phase: 'normal', why: '回答长会话第 ' + i + ' 轮',
      reply: fence({
        say: '第 ' + i + ' 轮：把蓝图节点 ' + i + ' 从粗到细推进一格（长会话正文，用于触发框架裁剪）。',
        progress: { track: 'progress', kind: 'progress', title: '长会话进展 ' + i, body: '第 ' + i + ' 轮完成：节点 ' + i + ' 的引理需求已记录，下一步细化。' },
      }),
    }))
    const inner = (answered && answered.receipt) || answered || {}
    rounds.push({
      round: i,
      parked: parked ? parked.awaiting === true : false,
      promptId: prompt ? prompt.promptId || null : null,
      turnId: prompt ? prompt.turnId || null : null,
      promptCharsInReceipt: prompt ? String(prompt.text || '').length : 0,
      answered: answered ? answered.ok === true : false,
      executed: inner.executed === undefined ? null : inner.executed,
    })
  }
  highlights.rounds = rounds
  const answeredRounds = rounds.filter((r) => r.answered === true).length
  if (answeredRounds !== roundsToRun) {
    failures.push({ code: 'SIM_LONG_SESSION_ROUNDS', step: 'session', message: 'expected ' + roundsToRun + ' answered rounds, got ' + answeredRounds, means: 'the compaction claim below needs a transcript longer than the keep-window', })
  }

  // ── ③ the NEXT prompt: read it back through the PUBLIC paged face ──────────────────────────────────────────────
  // The receipt's memberPrompt.text is bounded by the host (measured: 6 006 chars with an `[elided]` marker while the
  // archived prompt was 36 085), so the block at the END is only recoverable by paging the archive — and that archive is
  // the EXACT string the delivery seam received (kernel: "archived verbatim", statusBlockMeans says so).
  const nextPrompt = await step('session/next-prompt', () => readArchivedPrompt())
  const nextText = nextPrompt && nextPrompt.ok === true ? String(nextPrompt.text || '') : ''
  const blockAt = nextText.indexOf(BLOCK_MARK)
  const blockLine = blockAt >= 0 ? nextText.slice(blockAt, nextText.indexOf(NL, blockAt) > blockAt ? nextText.indexOf(NL, blockAt) : blockAt + 200) : null
  const blockMatch = blockLine ? /已丢弃 (\d+) 轮，摘要 (\d+) 字节/.exec(blockLine) : null
  highlights.nextPrompt = {
    readOk: nextPrompt && nextPrompt.ok === true,
    chars: nextText.length,
    archiveChars: nextPrompt && nextPrompt.chars !== undefined ? nextPrompt.chars : null,
    pages: nextPrompt && nextPrompt.pages !== undefined ? nextPrompt.pages : null,
    blockFound: blockAt >= 0,
    blockLine,
    droppedCountInBlock: blockMatch ? Number(blockMatch[1]) : null,
    summaryBytesInBlock: blockMatch ? Number(blockMatch[2]) : null,
    // the summary must carry the DROPPED turn's text, not a generic sentence: assert a marker from round 1 is in it.
    summaryCarriesDroppedText: blockAt >= 0 && nextText.slice(blockAt).includes('第 1 轮'),
    means: 'the archived prompt (kernel archive = exactly what the delivery seam received) is the string the seat would read; the block at its END names how many turns were dropped and how many summary bytes replace them',
  }
  if (blockAt < 0 || !blockMatch) {
    failures.push({
      code: 'SIM_C21_COMPACTION_NOT_TRIGGERED',
      step: 'session/next-prompt',
      message: 'after ' + roundsToRun + ' answered rounds the next prompt carries no 【上下文摘要（框架裁剪…）】 block',
      means: 'C#21 claims the framework trims a member transcript past keep-window 8 and the NEXT prompt carries a bounded summary; without the block the mechanism is bookkeeping, not delivered context',
      receipt: { chars: nextText.length, tail: nextText.slice(-200) },
    })
  } else if (!(Number(blockMatch[1]) > 0 && Number(blockMatch[2]) > 0)) {
    failures.push({ code: 'SIM_C21_COMPACTION_EMPTY', step: 'session/next-prompt', message: 'summary block present but droppedCount/summaryBytes are not both > 0: ' + blockLine, means: 'a block that says it dropped 0 turns and carries 0 bytes is not compaction evidence', })
  } else if (!nextText.slice(blockAt).includes('第 1 轮')) {
    failures.push({ code: 'SIM_C21_SUMMARY_NOT_FROM_DROPPED', step: 'session/next-prompt', message: 'the summary block does not carry the dropped round-1 text', means: 'the summary must be the dropped turns, not a fresh sentence that only looks like one', })
  }

  // ── ④ the status PROJECTION (bounded surface: budget + per-member counts) ──────────────────────────────────────
  const statusReading = await step('session/compaction-status', () => h.call('vibe_vmu_turn', { op: 'status' }))
  const st = statusReading && statusReading.status ? statusReading.status : statusReading
  const projection = st && st.contextCompaction ? st.contextCompaction : null
  const r1 = projection && Array.isArray(projection.members) ? projection.members.filter((m) => m && m.member === 'r-1')[0] || null : null
  // ★ TB-2794 Step 4 follow-up (sim-lane visibility gap): the FULL ledger now has a NAMED public face —
  // `vibe_vmu_turn { op:"status", detail:"compaction" }` returns contextCompactionReading() incl. droppedTurns.
  const ledgerReading = await step('session/compaction-ledger', () => h.call('vibe_vmu_turn', { op: 'status', detail: 'compaction' }))
  const lt = ledgerReading && ledgerReading.status ? ledgerReading.status : ledgerReading
  const ledger = lt && lt.contextCompaction ? lt.contextCompaction : null
  const ledgerRow = ledger && Array.isArray(ledger.members) ? ledger.members.filter((m) => m && m.member === 'r-1')[0] || null : null
  const droppedTurnsLedger = ledgerRow && Array.isArray(ledgerRow.droppedTurns) ? ledgerRow.droppedTurns : null
  if (!(Array.isArray(droppedTurnsLedger) && droppedTurnsLedger.length > 0 &&
    droppedTurnsLedger.every((d) => d && typeof d.turnId === 'string' && Number(d.bytes) > 0))) {
    failures.push({
      code: 'SIM_C21_LEDGER_NOT_PUBLIC',
      step: 'session/compaction-ledger',
      message: 'op:"status",detail:"compaction" does not expose the per-member droppedTurns ledger: ' + JSON.stringify(ledgerRow),
      means: 'C#21 says every dropped turn keeps turnId+bytes; a reading that cannot be reached from any public face is not a reading (step 4 fixed this with a named detail)',
    })
  }
  highlights.compaction = {
    keepRecentTurns: projection ? projection.keepRecentTurns : null,
    member: r1,
    budgetIsDeclaredDefault: projection ? projection.keepRecentTurns === 8 : null,
    budgetMeans: projection ? String(projection.means || '') : null,
    exposure: {
      statusProjection: projection !== null,
      statusDetailCompaction: ledger !== null,
      droppedTurnsLedger,
      ledgerMeans: 'op:"status", detail:"compaction" returns the FULL C#21 ledger (contextCompactionReading) incl. droppedTurns [{turnId,bytes}] per member; the settled receipt and the default status keep the bounded projection by design',
    },
  }
  if (!(r1 && Number(r1.droppedCount) > 0 && Number(r1.summaryBytes) > 0)) {
    failures.push({
      code: 'SIM_C21_STATUS_PROJECTION_EMPTY',
      step: 'session/compaction-status',
      message: 'the status projection does not show droppedCount/summaryBytes > 0 after ' + roundsToRun + ' rounds: ' + JSON.stringify(r1),
      means: 'C#21-6 requires the status reading to show budget and usage; a projection that reports nothing cannot be audited',
    })
  }

  // ── ④b SETTINGS-MUTATION LAMP (cross-r11 ②): the SAME session under a LARGER keep-window must NOT trim ─────────
  // The positive assertion above has to be sensitive to the DECLARED BUDGET, not a banner. This lamp boots a SECOND
  // kernel with `vmu.prompt.compactAfterRounds: 20` (> the rounds driven here), replays the same session shape, and
  // requires: keepRecentTurns 20, NO summary block, droppedCount 0. A product that ignored the setting (or a block
  // that were unconditional) would turn THIS lamp red — which is what makes the 10-round block a measurement.
  const budgetLamp = await step('session/budget-lamp', async () => {
    let lamp = null
    try {
      lamp = await boot({ root: tmpRoot('ws-long-session-lamp-'), clock, settings: { deliverMode: 'caller', 'vmu.prompt.compactAfterRounds': 20 } })
      await lamp.call('vibe_v5_start', { problem: '长会话压缩反灯：keep-window=20 > 本轮轮数，应不裁剪。', researcherCount: 2 })
      for (let i = 1; i <= roundsToRun; i += 1) {
        clockState.now += 60_000
        await lamp.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '反灯第 ' + i + ' 轮' })
        await lamp.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal', why: '反灯回答 ' + i,
          reply: fence({ say: '反灯第 ' + i + ' 轮正文。', progress: { track: 'progress', kind: 'progress', title: '反灯进展 ' + i, body: '反灯正文 ' + i } }) })
      }
      const lst = await lamp.call('vibe_vmu_turn', { op: 'status' })
      const ls = lst && lst.status ? lst.status : lst
      const lproj = ls && ls.contextCompaction ? ls.contextCompaction : null
      const lrow = lproj && Array.isArray(lproj.members) ? lproj.members.filter((m) => m && m.member === 'r-1')[0] || null : null
      const lp = await readArchivedPrompt(lamp)
      const ltext = lp && lp.ok === true ? String(lp.text || '') : ''
      const out = { keepRecentTurns: lproj ? lproj.keepRecentTurns : null, rounds: roundsToRun, blockFound: ltext.includes(BLOCK_MARK), projection: lrow }
      if (!(Number(out.keepRecentTurns) === 20 && out.blockFound === false && lrow && Number(lrow.droppedCount) === 0)) {
        failures.push({ code: 'SIM_C21_BUDGET_LAMP_NOT_RED', step: 'session/budget-lamp', message: 'with compactAfterRounds=20 and only ' + roundsToRun + ' rounds the lamp STILL trimmed: ' + JSON.stringify(out), means: 'the compaction evidence must react to the declared keep-window: a block that appears regardless of the budget would pass the main assertion for the wrong reason', })
      }
      return out
    } finally {
      if (lamp) { try { await lamp.close() } catch { /* throwaway kernel */ } }
    }
  })
  highlights.budgetLamp = Object.assign({
    means: 'second kernel, keep-window 20 (> rounds driven): same session shape, ZERO dropped turns and NO summary block — the exact opposite reading of the main session, which is what makes the main block evidence of trimming rather than an unconditional banner',
  }, budgetLamp || {})

  // ── ⑤ record the archived prompt as a PROMPT ROW (the prompts lane audits prompts.jsonl) ──────────────────────
  if (nextPrompt && nextPrompt.ok === true && nextText.length > 0) {
    h.prompts.push({
      seat: 'member',
      phase: 'normal',
      round: roundsToRun + 1,
      chars: nextText.length,
      text: nextText,
      assembly: h.prompts.length + 1,
      afterReceipts: h.receipts.length,
      member: 'r-1',
      notices: null,
      source: 'turn-prompt-after-compaction',
      turnId: rounds[rounds.length - 1] ? rounds[rounds.length - 1].turnId : null,
      contextCompaction: {
        keepRecentTurns: projection ? projection.keepRecentTurns : null,
        member: r1,
        blockLine,
        droppedCountInBlock: blockMatch ? Number(blockMatch[1]) : null,
        summaryBytesInBlock: blockMatch ? Number(blockMatch[2]) : null,
      },
      means: 'the archived prompt the seat was handed on round ' + (roundsToRun + 1) + ' (read back through op:"prompt"), carrying the framework-trimmed context summary at its end — recorded so the prompts lane can audit whether a seat is told that this is old context',
    })
  }

  // ── ⑥ finish the session (one more answered round; proves the trimmed transcript keeps going) ────────────────
  clockState.now += 60_000
  const finalPark = await step('session/final/park', () => h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '长会话收尾轮' }))
  const finalAnswer = await step('session/final/answer', () => h.call('vibe_vmu_turn', {
    op: 'step', member: 'r-1', phase: 'normal', why: '回答收尾轮',
    reply: fence({ say: '收尾轮：长会话按框架裁剪后的摘要继续推进。', progress: { track: 'progress', kind: 'progress', title: '长会话收尾', body: '收尾轮完成：裁剪后的上下文仍支持继续。' } }),
  }))
  const finalStatus = await step('session/final/status', () => h.call('vibe_vmu_turn', { op: 'status' }))
  const fs2 = finalStatus && finalStatus.status ? finalStatus.status : finalStatus
  const finalProjection = fs2 && fs2.contextCompaction ? fs2.contextCompaction : null
  highlights.finalRound = {
    parked: finalPark ? finalPark.awaiting === true : false,
    answered: finalAnswer ? finalAnswer.ok === true : false,
    compaction: finalProjection && Array.isArray(finalProjection.members) ? finalProjection.members.filter((m) => m && m.member === 'r-1')[0] || null : null,
  }

  return {
    steps,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    failures,
    highlights,
    expectedRefusals: [],
    promptChars: { 'member/normal': nextText.length },
  }
}

// Discovery uses the FILE stem ("long-session"), which is not a valid identifier; run.mjs also accepts `scenario`.
export const scenario = longSession
