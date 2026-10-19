/**
 * packs/v3/tools.js — PHASE 6 / P0-10: THE TOOL FACE OF THE v3 INSTITUTION (10 tools).
 *
 * WHY THIS FILE EXISTS. v3 shipped 36 tools. Most of them were the only API v3 had at the time; in
 * this replication the same work is done by the scheduler (tick), the planner, the data plane and the
 * method keeper — so publishing all 36 would hand the model 25 names with no consumer. What is left
 * is the CONTROL/OBSERVATION surface a root agent or a human actually drives:
 *
 *     start / pause / status / report / list_decisions / decide / plan / list_agents /
 *     method_list / add_problem
 *
 * THE NAMES LIVE HERE, NOT IN THE FRAMEWORK. `packs/v3/index.js` declares this array as the manifest's
 * `tools[]`; `kernel/pack.js` validates it, `kernel/index.js` holds the declarations, and `host.js`
 * publishes them through `host-pack-tools.js`. The kernel/host never learns a v3 tool name.
 *
 * THE THREE CONTRACTS A HANDLER OBEYS (all pinned by tests/vmu-v3-tools.test.mjs):
 *   ① a handler returns an OBJECT (never a pre-serialized JSON string: the host has ONE serializer,
 *      `boundedToolResult`, and a string would be encoded a second time);
 *   ② a refusal is NAMED — a registered `code` + a `hint` that says what to do next (an unregistered
 *      code would make the docs/03 implementation-status table stale, so the codes used here are all
 *      already registered);
 *   ③ nothing is pretended: a missing service/roster/slot produces a named refusal, never an empty
 *      success. A tool that "works" over an absent mechanism is the paper capability this repo bans.
 *
 * WHAT THESE HANDLERS READ, AND WHY IT IS READ DEFENSIVELY. `api.setting()` does not materialise schema
 * defaults (the kernel only holds keys a deployment/值层 provided), so every setting read below has an
 * explicit fallback: a missing `vmu.v3.mode` means `auto`, a missing `vmu.v3.tickIntervalMs` means 2000.
 * A default deployment must not silently become `manual` just because nobody set the key.
 */
import { listGates, approveGate, rejectGate, cancelGate } from './middleware/gates.js'
import { paperArtifacts, PAPER_ARTIFACTS } from './middleware/paper-close.js'
import { latestPlanRecord, readPlanRecord, v3PlannerStatus } from './middleware/planner.js'
import { v3VerifyStatus, listCandidates } from './middleware/verify.js'
import { writeCard, parseCard } from './middleware/dataplane.js'

const str = (v) => (v === undefined || v === null ? '' : String(v))
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() !== '') : [])

/** A refusal is named: caller's vocabulary + a REGISTERED code + a next step (AGENTS red line 3). */
function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The settings snapshot, as a plain map; never throws (a kernel without the accessor is a test fake). */
function settingsOf(kernel) {
  try {
    if (kernel && typeof kernel.settingsSnapshot === 'function') return kernel.settingsSnapshot() || {}
  } catch { /* a fake kernel with a throwing accessor is treated as "nothing declared" */ }
  return {}
}

/** Read one setting WITH an explicit fallback — the kernel does not materialise schema defaults. */
function settingOr(kernel, key, fallback) {
  const snap = settingsOf(kernel)
  const v = snap[key]
  return v === undefined || v === null ? fallback : v
}

function recordsOf(kernel) {
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel publishes no records face, so the v3 data plane is absent',
      'construct the kernel with a durable root (the v3 cards live on vmu.records) and load packs/v3')
  }
  return kernel.records
}

function membersOf(kernel) {
  if (!kernel || !kernel.members) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no roster is published: the v3 pack declares the planner/solver/verifier slots, so it must be APPLIED before the roster exists',
      'load packs/v3 through config.packs; its slots[] creates the roster (kernel.declareSlots)')
  }
  return kernel.members
}

function schedulerOf(kernel) {
  return kernel && kernel.scheduler ? kernel.scheduler : null
}

function schedulerView(kernel) {
  const s = schedulerOf(kernel)
  if (!s || typeof s.status !== 'function') return null
  const st = s.status()
  return {
    mode: st.autoArm === true ? 'armed' : 'tick-only',
    autoArm: st.autoArm === true,
    timeSource: st.timeSource,
    timerShape: st.timerShape,
    pending: st.items ? st.items.pending : null,
    tickPasses: st.tickPasses,
    fired: st.ticks ? st.ticks.fired : null,
  }
}

function controlView(kernel) {
  try { return kernel && typeof kernel.control === 'function' ? kernel.control() : null } catch { return null }
}

/** Per-track live counts from the records self-report (the ONE place records counts its own tracks). */
function trackCounts(records) {
  try {
    const st = records.status()
    const byTrack = (st && st.records && st.records.byTrack) || {}
    const out = {}
    for (const k of Object.keys(byTrack).sort()) out[k] = byTrack[k]
    return out
  } catch { return {} }
}

function lastPlanView(records) {
  const latest = latestPlanRecord(records)
  if (!latest) return null
  const parsed = readPlanRecord(latest)
  if (!parsed) {
    return { recordId: latest.recordId, settled: false, updatedAt: latest.updatedAt, note: 'the latest plans-track record is not a settled plan JSON (raw planner receipt?)' }
  }
  return {
    recordId: latest.recordId, updatedAt: latest.updatedAt, settled: true,
    summary: typeof parsed.summary === 'string' ? parsed.summary : null,
    validated: Array.isArray(parsed.validated) ? parsed.validated.length : 0,
    rejected: Number.isInteger(parsed.rejected) ? parsed.rejected : null,
    truncated: Number.isInteger(parsed.truncated) ? parsed.truncated : null,
    outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes.length : 0,
    status: typeof parsed.status === 'string' ? parsed.status : null,
    awaitingApproval: parsed.awaitingApproval === true,
    gateId: typeof parsed.gateId === 'string' ? parsed.gateId : null,
  }
}

/** A bounded, card-aware summary of one track (problems/propositions), parsed through the data plane. */
function cardSummaries(records, track, limit) {
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 20
  const list = records.list({ track, limit: 0 })
  const out = []
  const bad = []
  for (const head of list.items.slice(0, cap)) {
    let rec = null
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ id: head.id, code: str(e && e.code) }); continue }
    const parsed = parseCard(rec.body)
    if (!parsed.ok) { bad.push({ id: head.id, reason: parsed.reason }); continue }
    const c = parsed.card
    out.push(track === 'problems'
      ? { id: c.id, 标题: c.标题, 状态: c.状态, 优先级: c.优先级, 计划: c.计划, solutions: c.solutions.length }
      : { id: c.id, 标题: c.标题, 状态: c.状态, 概率: c.概率, 优先级: c.优先级 })
  }
  return { items: out, shown: out.length, available: list.available, dropped: Math.max(0, list.available - out.length), bad }
}

// ── ① start ─────────────────────────────────────────────────────────────────────────────────────────────
/** Ensure the scheduler is running: resume a paused kernel, arm the declared schedule if it is not armed. */
async function toolStart(args = {}, { kernel } = {}) {
  if (!kernel) throw refuse('VMU_ENGINE_UNAVAILABLE', 'start needs a kernel handle', 'this tool runs inside an assembled kernel')
  const control = controlView(kernel)
  if (control && control.state === 'stopped') {
    return { ok: false, tool: 'start', code: 'VMU_STATE', message: 'the kernel is stopped, so the scheduler cannot be started from here', hint: 're-activate the session/host first (a stopped kernel clears its registrations); then call vibe_math_start' }
  }
  let resumed = null
  if (control && control.state === 'paused') {
    try {
      const r = await kernel.resume(str(args.reason) || 'vibe_math_start')
      resumed = { ok: r.ok === true, state: r.state, resumedFrom: r.resumedFrom || null }
    } catch (e) {
      throw refuse(str(e && e.code) || 'VMU_STATE', 'the scheduler could not be resumed: ' + str(e && e.message), str(e && e.hint) || 'inspect vibe_math_status for the control state')
    }
  }
  const scheduler = schedulerOf(kernel)
  let armed = null
  let view = schedulerView(kernel)
  if (view && view.autoArm !== true && scheduler && typeof scheduler.autoArm === 'function') {
    try { armed = scheduler.autoArm({ on: true }) } catch (e) { armed = { ok: false, code: str(e && e.code) || 'VMU_CONTROL_NO_TIMER', message: str(e && e.message), hint: str(e && e.hint) } }
    view = schedulerView(kernel)
  }
  // Re-read the control state AFTER the resume: the receipt must report where the kernel IS, not where it was.
  const after = controlView(kernel)
  return {
    ok: true, tool: 'start',
    state: after ? after.state : 'unknown',
    resumed,
    armed,
    scheduler: view,
    note: view && view.autoArm === true
      ? 'the schedule is armed and advances by the injected wall clock'
      : 'the schedule is NOT armed: no timer seam was injected, so it only advances by explicit tick() calls (never pretend otherwise)',
  }
}

// ── ② pause ─────────────────────────────────────────────────────────────────────────────────────────────
/** Pause the kernel (a REAL gate: task mutations are refused by name while paused). */
async function toolPause(args = {}, { kernel } = {}) {
  if (!kernel) throw refuse('VMU_ENGINE_UNAVAILABLE', 'pause needs a kernel handle', 'this tool runs inside an assembled kernel')
  const control = controlView(kernel)
  if (control && control.state === 'stopped') {
    return { ok: false, tool: 'pause', code: 'VMU_STATE', message: 'the kernel is stopped, not running: it cannot be paused', hint: 'call vibe_math_start first' }
  }
  if (control && control.state === 'paused') {
    return { ok: true, tool: 'pause', already: true, state: 'paused', reason: control.pausedReason === undefined ? null : control.pausedReason }
  }
  const receipt = await kernel.pause(str(args.reason) || 'paused by vibe_math_pause')
  return { ok: true, tool: 'pause', paused: true, state: receipt.state === undefined ? 'paused' : receipt.state, reason: receipt.reason === undefined ? null : receipt.reason }
}

// ── ③ status ────────────────────────────────────────────────────────────────────────────────────────────
/** Read-only: control state, scheduler, per-track counts, roster and the pending human gates. */
function toolStatus(_args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const gates = listGates({ records })
  const members = kernel && kernel.members ? kernel.members : null
  // ★ SLV MEASURED: "论文好了没有" had no reader at all - the paper-close middleware wrote its final record, but no
  // status/report field exposed it. `vmu.v3.paperCloseTarget` names the project; absent ⇒ explicitly `null` (zero
  // mechanism), never an invented "paper not started".
  const paperTarget = str(settingOr(kernel, 'vmu.v3.paperCloseTarget', ''))
  const paper = paperTarget
    ? paperArtifacts({ records, target: paperTarget })
    : { target: null, present: [], missing: PAPER_ARTIFACTS.slice(), complete: false, note: 'no vmu.v3.paperCloseTarget is declared, so no paper is being tracked' }
  return {
    ok: true, tool: 'status',
    mode: str(settingOr(kernel, 'vmu.v3.mode', 'auto')),
    tickIntervalMs: Number(settingOr(kernel, 'vmu.v3.tickIntervalMs', 2000)) || 2000,
    control: controlView(kernel),
    scheduler: schedulerView(kernel),
    packs: kernel && typeof kernel.activePacks === 'function' ? kernel.activePacks() : [],
    counts: trackCounts(records),
    pendingGates: gates.counts ? gates.counts.pending : 0,
    roster: members
      ? { slots: members.roles().map((r) => ({ id: r.id, capacity: r.capacity })), live: members.roster().filter((m) => m.state === 'live').length }
      : null,
    lastPlan: lastPlanView(records),
    paper,
    // ★ SLV: the TURN DISPATCH QUEUE - "verify dispatched but no reply" vs "dispatch failed" is visible here.
    dispatch: (() => {
      try { return kernel && kernel.turn && typeof kernel.turn.dispatchStatus === 'function' ? kernel.turn.dispatchStatus() : null } catch { return null }
    })(),
    // ★ SLV: the verifier's own decision surface. Without this, "verified 0" could mean no candidate, no dispatch, or
    // dispatched-but-no-vote - three very different bugs. This reports which one it is.
    verify: (() => {
      const v = v3VerifyStatus()
      let candidates = null
      let bad = null
      try {
        const c = listCandidates(records)
        candidates = c.items.length
        bad = c.bad.length
      } catch (e) { candidates = null; bad = { error: String((e && e.message) || e) } }
      return { ticks: v.ticks, rounds: v.rounds, debates: v.debates, ballotsOpened: v.ballotsOpened, votesCast: v.votesCast,
        verdicts: v.verdicts, undecided: v.undecided, malformed: v.malformed, inFlight: v.inFlight,
        lastSkip: v.lastSkip, lastReceipt: v.lastReceipt, lastError: v.lastError, candidates, badCandidates: bad }
    })(),
    // ★ SLV DIAGNOSTIC READER: the failure record (with replyLength/hadBrace/replyExcerpt) existed but NO reader
    // exposed it - the journal was head-capped and status only showed lastPlan. Same family as the paper field.
    planner: (() => {
      const p = v3PlannerStatus()
      return { plannerCalls: p.plannerCalls, plans: p.plans, fails: p.fails, disabled: p.disabled, lastSkip: p.lastSkip, lastError: p.lastError }
    })(),
    note: 'read-only receipt: no card and no gate was changed by this call',
  }
}

// ── ④ report ────────────────────────────────────────────────────────────────────────────────────────────
/** The readable progress report (the v3 报告的面): counts + per-problem / per-proposition summaries + pending gates. */
function toolReport(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 50) : 20
  const problems = cardSummaries(records, 'problems', limit)
  const propositions = cardSummaries(records, 'propos', limit)
  const methods = records.list({ track: 'methods', limit })
  const gates = listGates({ records })
  const members = kernel && kernel.members ? kernel.members : null
  const counts = trackCounts(records)
  const lines = []
  lines.push('# v3 进度报告（复刻包）')
  lines.push('- 模式：' + str(settingOr(kernel, 'vmu.v3.mode', 'auto')) + '；调度器：' + (schedulerView(kernel) ? schedulerView(kernel).mode : 'unknown'))
  const solved = problems.items.filter((p) => str(p.状态) === '已解决').length
  const settled = propositions.items.filter((p) => Number(p.概率) === 1 || Number(p.概率) === 0).length
  lines.push('- 问题：' + solved + '/' + (problems.available === undefined ? 0 : problems.available) + ' 已解决；命题：' + settled + '/' + (propositions.available === undefined ? 0 : propositions.available) + ' 已定论；方法卡：' + (methods.available === undefined ? 0 : methods.available) + '；待批门：' + (gates.counts ? gates.counts.pending : 0))
  for (const p of problems.items) lines.push('- 问题 ' + p.id + '｜' + str(p.状态) + '｜优先级 ' + str(p.优先级) + '｜解法 ' + p.solutions)
  for (const p of propositions.items) lines.push('- 命题 ' + p.id + '｜' + str(p.状态) + '｜概率 ' + str(p.概率))
  return {
    ok: true, tool: 'report',
    counts,
    problems: { available: problems.available, shown: problems.shown, dropped: problems.dropped, bad: problems.bad, items: problems.items },
    propositions: { available: propositions.available, shown: propositions.shown, dropped: propositions.dropped, bad: propositions.bad, items: propositions.items },
    methods: { available: methods.available, shown: methods.items.length, dropped: methods.dropped },
    pendingGates: gates.pending.map((g) => ({ id: g.gateId, kind: g.kind, subject: g.subject, why: g.why })),
    roster: members ? { slots: members.roles().length, live: members.roster().filter((m) => m.state === 'live').length } : null,
    lastPlan: lastPlanView(records),
    text: lines.join('\n'),
    note: 'counts are live records counts; the per-track dropped count is the records head cap, never silent',
  }
}

// ── ⑤ list_decisions ───────────────────────────────────────────────────────────────────────────────────
/** List the pending manual gates (P0-8's ledger): the id here is what `decide` takes. */
function toolListDecisions(_args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const gates = listGates({ records })
  return {
    ok: true, tool: 'list_decisions',
    count: gates.counts ? gates.counts.pending : 0,
    pending: gates.pending.map((g) => ({ id: g.gateId, kind: g.kind, subject: g.subject, why: g.why, at: g.at === undefined ? null : g.at })),
    resolved: gates.resolved.length,
    bad: gates.bad,
    note: 'a pending gate was NOT executed: it is queued until a human approves it (manual mode) or the mode returns to auto',
  }
}

// ── ⑥ decide ───────────────────────────────────────────────────────────────────────────────────────────
/** Resolve ONE pending gate: approve (runs the registered executor) or reject (never executes). */
async function toolDecide(args = {}, { kernel } = {}) {
  const id = str(args.id).trim()
  if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'decide needs the gate id', 'call vibe_math_list_decisions first; the id is the gate/record id')
  const raw = str(args.action).trim().toLowerCase()
  const action = ['approve', 'approved', 'allow'].includes(raw) ? 'approve'
    : ['reject', 'rejected', 'deny'].includes(raw) ? 'reject'
      : ['cancel', 'withdraw'].includes(raw) ? 'cancel'
        : ['override'].includes(raw) ? 'override'
          : null
  if (action === null) throw refuse('VMU_INVALID_ARGUMENT', 'unknown decide action "' + str(args.action) + '"', 'action must be approve / reject / cancel / override')
  const records = recordsOf(kernel)
  let human = null
  try { human = kernel && kernel.human ? kernel.human : null } catch { human = null }
  const by = str(args.by) || 'human'
  const reason = str(args.reason) || null
  if (action === 'reject') {
    const r = rejectGate({ records, human, gateId: id, by, reason })
    return { ok: r.ok === true, tool: 'decide', action, executed: false, code: r.code || null, message: r.message || null, hint: r.hint || null, gate: r.gate ? gateView(r.gate) : null }
  }
  if (action === 'cancel') {
    const r = cancelGate({ records, human, gateId: id, by, reason })
    return { ok: r.ok === true, tool: 'decide', action, executed: false, cancelled: r.cancelled === true, code: r.code || null, message: r.message || null, hint: r.hint || null, gate: r.gate ? gateView(r.gate) : null }
  }
  // approve / override share the ONE executor path (override additionally RECORDS the human's verdict in the reason).
  const overrideNote = action === 'override' && args.verdict !== undefined
    ? 'override verdict=' + str(args.verdict) + (reason ? '; ' + reason : '')
    : reason
  const r = await approveGate({ records, human, gateId: id, by, reason: overrideNote })
  return {
    ok: r.ok === true, tool: 'decide', action,
    executed: r.executed === true,
    code: r.code || (r.error && r.error.code) || null,
    message: r.message || (r.error && r.error.message) || null,
    hint: r.hint || null,
    gate: r.gate ? gateView(r.gate) : null,
    note: r.executed === true
      ? 'approved and executed by the gate executor'
      : 'approved but NOT executed: a terminal failure is reported here (never a silent release)',
  }
}

function gateView(g = {}) {
  return {
    id: g.gateId || g.recordId || null, kind: g.kind || null, subject: g.subject || null,
    status: g.status || null, executed: g.executed === true,
    error: g.error ? { code: g.error.code || null, message: g.error.message || null } : null,
    rev: g.rev === undefined ? null : g.rev,
  }
}

// ── ⑦ plan ─────────────────────────────────────────────────────────────────────────────────────────────
/** Show the last plan (and its per-action outcomes), or force one planning round through the scheduler. */
function toolPlan(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const scheduler = schedulerOf(kernel)
  let forced = null
  if (args.force === true && scheduler && typeof scheduler.tick === 'function') {
    try {
      const r = scheduler.tick({})
      forced = { ok: r.ok !== false, fired: r.firedCount, skipped: r.skippedCount, passes: r.passes, note: 'the tick emitted the hooks; the planner round itself settles asynchronously on the bus' }
    } catch (e) {
      forced = { ok: false, code: str(e && e.code) || 'VMU_INVALID_ARGUMENT', message: str(e && e.message), hint: str(e && e.hint) }
    }
  }
  const last = lastPlanView(records)
  return {
    ok: true, tool: 'plan', forced,
    lastPlan: last,
    note: last === null
      ? 'no plan record yet: the planner writes one per planning round (tick-driven); force:true asks for a round now'
      : 'lastPlan.outcomes is the learning loop input: its length is the number of executed actions of that plan',
  }
}

// ── ⑧ list_agents ─────────────────────────────────────────────────────────────────────────────────────
/** Who is on the roster (the pack's three slots) and which of them are live. */
function toolListAgents(_args = {}, { kernel } = {}) {
  const members = membersOf(kernel)
  const slots = members.roles().map((r) => ({ id: r.id, label: r.label === undefined ? null : r.label, capacity: r.capacity, occupied: r.occupied }))
  const roster = members.roster().map((m) => ({ id: m.id, slot: m.slot, state: m.state, wakes: m.wakes }))
  return { ok: true, tool: 'list_agents', slots, agents: roster, count: roster.filter((m) => m.state === 'live').length, note: 'the roster is the pack-declared slots; a member exists only after it is hired/assigned' }
}

// ── ⑨ method_list ─────────────────────────────────────────────────────────────────────────────────────
/** List the method library (the methods track heads): the institution's second pillar, read-only. */
function toolMethodList(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 500) : 100
  const list = records.list({ track: 'methods', limit })
  return {
    ok: true, tool: 'method_list',
    count: list.available === undefined ? list.items.length : list.available,
    shown: list.items.length,
    dropped: list.dropped === undefined ? 0 : list.dropped,
    methods: list.items.map((h) => ({ id: h.id, title: h.title, kind: h.kind, status: h.status, updatedAt: h.updatedAt })),
    note: 'method cards are written by the method keeper / data plane; this face only reads them',
  }
}

// ── ⑩ add_problem ─────────────────────────────────────────────────────────────────────────────────────
/** Seed the institution with a problem card (the one write the human/root agent needs to start a project). */
function toolAddProblem(args = {}, { kernel } = {}) {
  const id = str(args.id).trim()
  const description = str(args.description)
  if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'add_problem needs a problem id', 'the id is the card name, e.g. q-1')
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw refuse('VMU_INVALID_ARGUMENT', 'problem id must be path-safe: ' + JSON.stringify(id), 'use letters / digits / dot / dash / underscore, 1..64 chars')
  if (description.trim() === '') throw refuse('VMU_INVALID_ARGUMENT', 'add_problem needs the full problem statement', 'pass description with the complete statement (it becomes the 陈述 section)')
  const records = recordsOf(kernel)
  // Idempotent-by-name refusal: the data plane keys cards by title/body, so two cards with one id would be two
  // identities for one problem. Refuse BEFORE writing (the record layer cannot see this rule).
  const existing = records.list({ track: 'problems', limit: 0 })
  const clash = existing.items.some((h) => str(h.title) === id || str(h.title).endsWith('｜' + id))
  if (clash) return { ok: false, tool: 'add_problem', code: 'VMU_STATE', message: 'a problem card with id "' + id + '" already exists', hint: 'list it with vibe_math_status / vibe_math_report, or choose a fresh id' }
  const priority = Number.isInteger(args.priority) ? args.priority : 1
  const dependencies = listOf(args.dependencies)
  const written = writeCard({
    records, kind: 'problem',
    card: { id, 标题: id, 状态: '求解中', 优先级: priority, 依赖: dependencies, 被依赖: [], 来源: '原始', 计划: '待调度', 陈述: description, 来源与动机: '' },
    settled: false,
    by: 'vibe_math_add_problem',
  })
  return {
    ok: true, tool: 'add_problem', id,
    recordId: written.id, rev: written.rev, track: written.track,
    bounded: written.bounded || null,
    note: 'problem card written to the problems track with 状态: 求解中; the scheduler will consider it on the next tick',
  }
}

/**
 * THE MANIFEST FACE. `packs/v3/index.js` imports this array and declares it as `tools[]`; `kernel/pack.js`
 * validates every entry, `kernel/index.js` holds them, and `host.js` publishes them. Nothing in kernel/ or
 * host.js knows any of these names.
 */
export const V3_PACK_TOOLS = Object.freeze([
  {
    name: 'vibe_math_start',
    description: 'Start (or resume) the v3 scheduler: resumes a paused kernel and arms the declared schedule if it is not armed. Reports the real scheduler mode (armed vs tick-only) instead of pretending a timer exists.',
    parameters: { override: { type: 'boolean' }, reason: { type: 'string' } },
    handler: toolStart,
  },
  {
    name: 'vibe_math_pause',
    description: 'Pause the v3 kernel. Pause is a REAL gate: task mutations are refused by name while paused. Returns already:true when it was paused already.',
    parameters: { reason: { type: 'string' } },
    handler: toolPause,
  },
  {
    name: 'vibe_math_status',
    description: 'Read-only status: control state, scheduler mode/timer shape, per-track record counts, pending human gates, roster slots and the last plan. Changing nothing is the point.',
    parameters: {},
    handler: toolStatus,
  },
  {
    name: 'vibe_math_report',
    description: 'The readable progress report: problem/proposition/method counts, per-card summaries (bounded, with dropped counts), pending gates and the last plan outcomes.',
    parameters: { limit: { type: 'integer' } },
    handler: toolReport,
  },
  {
    name: 'vibe_math_list_decisions',
    description: 'List the pending manual gates (plan / verdict / method-promote). The returned id is what vibe_math_decide takes; a pending gate has NOT been executed.',
    parameters: {},
    handler: toolListDecisions,
  },
  {
    name: 'vibe_math_decide',
    description: 'Resolve one pending manual gate: approve runs the registered executor, reject never executes, cancel withdraws it (a reason is required) so a withdrawn request stops blocking. A terminal failure is reported, never silently released.',
    parameters: { id: { type: 'string', required: true }, action: { type: 'string', required: true }, verdict: { type: 'number' }, reason: { type: 'string' }, by: { type: 'string' } },
    handler: toolDecide,
  },
  {
    name: 'vibe_math_plan',
    description: 'Show the last plan and its per-action outcomes, or force:true to ask the scheduler for a planning round now (the round itself settles asynchronously).',
    parameters: { force: { type: 'boolean' } },
    handler: toolPlan,
  },
  {
    name: 'vibe_math_list_agents',
    description: 'List the declared role slots (planner/solver/verifier) and the current roster: who is live and in which slot.',
    parameters: {},
    handler: toolListAgents,
  },
  {
    name: 'vibe_math_method_list',
    description: 'List the method library (methods track heads: id, title, kind, status, updatedAt) — the institution\'s distilled reusable methods.',
    parameters: { limit: { type: 'integer' } },
    handler: toolMethodList,
  },
  {
    name: 'vibe_math_add_problem',
    description: 'Add a problem card to the current project (id + full statement, optional priority/dependencies). A duplicate id is refused by name.',
    parameters: { id: { type: 'string', required: true }, description: { type: 'string', required: true }, priority: { type: 'integer' }, dependencies: { type: 'array' } },
    handler: toolAddProblem,
  },
])

export default V3_PACK_TOOLS
