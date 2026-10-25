// ★ PHASE 8 / B-3: the task board and the Lean five live in the kit now (one implementation in the tree).
import { toolTaskCreate, toolTaskList, toolTaskUpdate, toolTaskGet, toolLeanRun, toolLeanJob, toolLeanLib, toolLeanRead, toolLeanArchive, tasksOf, rowsOf } from '../../kit/extras.js'
import { KIT_CARD_TOOL as cardTool, KIT_HELPERS, KIT_READ_LIBRARY as toolReadLibrary, KIT_RECORD_PROGRESS as toolRecordProgress, KIT_SOCIAL } from '../../kit/handlers.js'
import { kitCardHandler, KIT_CARD_CONFIG } from '../../kit/tools.js'
// ★ PHASE 12 / D13–D15: THE FOUR RULE PREDICATES GET THEIR **CALLERS** IN THIS FILE.
// `./verification-gates.js` is PURE (no settings, no filesystem, no writes, nothing named `enforced` inside it) and until
// this round had ZERO call sites — a mechanism with no consumer, which AGENTS red line 4 forbids. The predicates stay
// pure: every refusal is raised in THIS file, and the declared keys a predicate consulted are copied into
// `enforced`/`enforcedScope` by the wiring layer only (the consistency audit reads a mention of the word inside a
// predicate module as a new blind spot, so it must not appear there).
import { p1Intent, debateSubjectGate, singleWriter, fidelityAsked } from './verification-gates.js'
// ★ The VERIFIED carrier (B1 step 1): `findVerified` answers null instead of guessing, `promoteVerified` is the ONLY
// writer on that track, and `parseCard` names a card it cannot judge (empty/truncated body) instead of half-parsing it.
import { parseCard, findVerified, promoteVerified, VERIFIED_TRACK } from './verified.js'
// ★ GOAL ROUND 3: the paper subsystem's RUNTIME ENTRY. It lives in this pack (`./paper.js` → `kit/paper.js` is the flow);
// the face below is only the missing READ POINT — before it, `paper.start` existed but nothing in production called it.
// ★ E4 (真缺陷): `PAPER_CONSULT_ROLES` is imported, not re-typed. The kit owns the consult STATE TRANSITION; the pack owns
// "who may answer". One declaration, two readers (createPaperSubsystem hands it to the kit as `consultRoles`; the tool
// pre-check below uses the same constant) — a second literal `['office']` in this file would be a second authority.
import { createPaperSubsystem, PAPER_CONSULT_ROLES } from './paper.js'
// ★ GOAL ROUND 3 (rule conformance): the meeting TYPE catalog and the recommended procedure skeletons are INSTITUTION
// vocabulary, so they live in this pack (`./meeting-procedures.js`) — the kernel only carries the type string.
import { MEETING_TYPE_IDS, meetingTypeOf, procedureFor } from './meeting-procedures.js'
// ★ PHASE 12 / D7 (second sentence)：「成员可用的命令按会议类型不同」。`kernel/turn.step` 早就能收窄一轮的工具面
// （`{tools:{allow}}` → `setMemberToolOverride`），但 pack 侧没有生产者 —— 提示词不是门禁。`./meeting-tool-face.js`
// 是这张**机构政策表**（哪类会议收窄、收窄到哪些工具）＋"只能收窄不能扩大"的求交；本文件只负责把它装到一轮上。
import { applyMeetingTypeFace, meetingTypeFace } from './meeting-tool-face.js'
// ★ PHASE 12 / R13 (measured on the full live run of 2026-10-24): seating the academician with
// `vibe_vmu_control {action:"hire", slot:"chair"}` does NOT set `vmu.turn.leaderId`, so every member prompt opened with
// 「本所当前没有在册院士」 while the chair was seated. `./leadership.js` is the pure reading that makes the two facts
// comparable; the chair-only `vibe_v5_overview` below is its consumer (a named warning instead of a silent mismatch).
import { leadershipReading, leadershipWarning, LEADER_SLOT } from './leadership.js'
// ★ R18-B2: the public blueprint carrier. `vmu.turn.protocolPath` had two prompt interpolations and no writer, so the
// blueprint was a path with no edit right attached. `./blueprint.js` is the data face (a records track + propose/adopt);
// this import is its REACHABLE consumer (red line ④).
import { BLUEPRINT_ADOPT_SLOT, BLUEPRINT_PATH_KEY, BLUEPRINT_TRACK, adoptBlueprint, blueprintState, proposeBlueprint, readBlueprint } from './blueprint.js'
// ★ PHASE 8 / B-2 step 2: the kit owns the implementations; v5r keeps only INSTITUTION vocabulary (names, descriptions,
// parameters) and its policy. The 8 generic helpers come from the kit so the tree has exactly ONE copy.
const { str, has, refuse, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker } = KIT_HELPERS
const toolSay = KIT_SOCIAL.say
const toolMessage = KIT_SOCIAL.message
/**
 * packs/v5r/tools.js — PHASE 7 / goal 2: THE TOOL FACE OF THE v5r INSTITUTION (first batch: 6 tools).
 *
 * WHY THIS FILE EXISTS. `packs/v5r` declared **0 tools** while its prompts taught members to call
 * `vibe_v5_record_progress / _proposition / _method / _subproblem`, `vibe_v5_say` and `vibe_v5_message` — a
 * discoverability defect measured in `docs/acceptance/phase7-coverage-matrix.md` §2 (17 names taught, 0 declared).
 * This file declares the six that the current kernel faces can carry WITHOUT new kernel capability; the other
 * eleven taught names stay a named gap (see §5 of the round report).
 *
 * THE NAMES LIVE HERE, NOT IN THE FRAMEWORK. `prompts/v5r-core.js` declares this array as the manifest's `tools[]`;
 * `kernel/pack.js` validates it, `kernel/index.js` holds the declarations and `host.js` publishes them through
 * `host-pack-tools.js`. Nothing in kernel/ or host.js learns a `vibe_v5_*` name (the same mechanism `packs/v3`
 * uses for its ten tools).
 *
 * THE THREE HANDLER CONTRACTS (the v3 pack's, kept identical on purpose):
 *   ① a handler returns an OBJECT — never a pre-serialized JSON string (the host has ONE serializer,
 *      `boundedToolResult`; a string would be encoded a second time);
 *   ② a refusal is NAMED — a REGISTERED code + a `hint` (an unregistered code would silently rot the docs/03
 *      implementation table, so only `VMU_INVALID_ARGUMENT` / `VMU_NO_SUCH_OBJECT` / `VMU_STATE` /
 *      `VMU_ENGINE_UNAVAILABLE` are used here);
 *   ③ nothing is pretended: a missing face, a missing roster or an unknown record track produces a named refusal,
 *      never an empty success. "The tool worked over an absent mechanism" is the paper capability this repo bans.
 *
 * WHERE EACH TOOL LANDS (the report states this table too). Face methods are written as `face.op`, never as a dotted
 * three-segment key: this repo's settings scanner treats an `a.b.c` shape in prose as a key READ, and an undeclared key
 * in a comment reddens `vmu-settings` — the scanner is right to be strict, so the prose adapts.
 *   · `vibe_v5_record_progress`    → records face `put`  track `progress` (default) or routes/obstacles/rejected/state
 *   · `vibe_v5_record_proposition` → records face `put`  track `propositions`, kind `proposition`
 *   · `vibe_v5_record_method`      → records face `put`  track `methods`,      kind `method`
 *   · `vibe_v5_record_subproblem`  → records face `put`  track `problems`,     kind `subproblem`
 *   · `vibe_v5_say`                → chat face `send` (group chat; `to` given ⇒ mailbox DM; `meeting` given ⇒
 *                                    meetings face `speak`) — the ORIGINAL semantics is the group chat, see the header
 *                                    of `toolSay`
 *   · `vibe_v5_message`            → mailbox face `send` as **office** (the original relays an office/human message)
 *   · `vibe_v5_task_create`        → tasks face `create`     (`subject`→title, `description`→objective, `blocked_by`→deps)
 *   · `vibe_v5_task_list`          → tasks face `list`       (filters applied here; `ready` is derived from blockers)
 *   · `vibe_v5_task_update`        → tasks face `assign`/`transition`/`setDependencies` with the revision token;
 *                                     edit/delete/release have NO face op ⇒ refused by name (never faked)
 *   · `vibe_v5_hire`               → members face `hire` into the `temp` seat ＋ tasks face `create` for the initial task
 *   · `vibe_v5_report`             → READ-ONLY aggregation of the published faces (no new capability)
 *   · `vibe_v5_overview`           → READ-ONLY aggregation, chair seat only (the role check is the pack's)
 *   · `vibe_v5_tool_help`          → thin forwarder to the kernel's `toolsView` (the member's VISIBLE set, not the declaration)
 *   · `vibe_v5_assign`             → tasks face `create`/`assign` ＋ mailbox face `send` (why/acceptance reach the assignee)
 *   · `vibe_v5_fire`               → members face `end` ＋ tasks face `transition` to `cancelled`
 *   · `vibe_v5_nudge`              → mailbox face `send` (kind nudge)
 *   · `vibe_v5_prioritize`         → records face `put` on the state track (the ledger has priority but NO setter for an existing row)
 *   · `vibe_v5_feedback`           → records face `put`/`list` on the feedback track
 *   · `vibe_v5_read_library`       → records face `get`/`list` (READ-ONLY)
 *
 * THE ROSTER RULE FOR `say`. The original resolved the speaker through its agent→member map (`memberIdOfAgent`).
 * A pack handler has no agent id, so the speaker is an EXPLICIT parameter and it must be a REAL roster id: an
 * unknown id is refused by name (never invented) and an absent one is refused too — that is the "empty sender ⇒
 * named refusal" semantics the SLV fixture verified for `meeting/send`.
 */

// ── PHASE 9 / round 3: INBOX + WAIT ───────────────────────────────────────────────────────────────────────────
/** The mailbox face action, or a NAMED refusal that names the capability. The list/open/setState work is another lane's;
 *  this face is ready the moment it lands, and says "waiting for a capability" instead of pretending to read mail. */
function mailboxAction(kernel, action) {
  const mb = kernel && kernel.mailbox
  const fn = mb && typeof mb[action] === 'function' ? mb[action] : null
  if (!fn) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'inbox ' + action + ' needs the mailbox face action this assembly does not publish yet',
      '需内核能力：mailbox ' + action + '（另一路在落）；落地后本工具自动可用，现在不会假装读到')
  }
  return fn.bind(mb)
}
/** id → urgent, joined from the mailbox face's ENTRY-level read (`pending`).
 *
 *  WHY A JOIN AND NOT A FIELD READ. `kernel/mailbox.js` keeps `urgent` on every entry, but its two TRIAGE read faces
 *  project a fixed field list and DROP it: `listRow` returns exactly the eight fields (id/from/at/subject/kind/read/
 *  todo/bytes) and `openView` six (no `urgent` either). So through those faces an urgent message is INDISTINGUISHABLE
 *  from ordinary mail — which is precisely the C2 rule violation. `pending(member)` returns whole entries (it is the
 *  "what is waiting for this member" face), so the pack joins id→urgent from it rather than widening a kernel face
 *  this lane does not own. An id the join cannot answer comes back `null` ("urgency unknown"), never `false` — a
 *  quiet `false` would be a lie of the same kind the missing field already tells. */
const urgencyById = (kernel, member) => {
  const map = new Map()
  const mb = kernel && kernel.mailbox
  if (!mb || typeof mb.pending !== 'function') return map
  const rows = mb.pending(String(member))
  for (const entry of Array.isArray(rows) ? rows : []) {
    if (!entry || entry.id === undefined) continue
    map.set(String(entry.id), entry.urgent === true)
  }
  return map
}
/** A row WITHOUT the body: the eight triage fields, plus `urgent` (joined by `urgencyById`; `null` when unknown). */
const inboxRow = (row, urgency = null) => {
  const id = str(row && row.id)
  let urgent = null
  if (row && row.urgent === true) urgent = true
  else if (row && row.urgent === false) urgent = false
  else if (urgency && urgency.has(id)) urgent = urgency.get(id)
  return {
    id, from: str(row && (row.from || row.by)), at: row && row.at !== undefined ? row.at : null,
    subject: row && row.subject !== undefined ? row.subject : null, read: row && row.read === true, todo: row && row.todo === true,
    urgent,
    kind: str(row && row.kind), bytes: Number.isFinite(Number(row && row.bytes)) ? Number(row.bytes) : 0,
  }
}
/** vibe_v5_inbox — ONE action-shaped tool (list | open | mark) over the mailbox face. */
async function toolInbox(args = {}, { kernel } = {}) {
  const action = has(args.action) ? str(args.action) : 'list'
  const member = requireSeat(kernel, args.member, 'inbox').id
  if (action === 'list') {
    const list = mailboxAction(kernel, 'list')
    const status = has(args.status) ? str(args.status) : 'unread'
    const r = await list(member, { status })
    const rows = Array.isArray(r) ? r : Array.isArray(r && r.entries) ? r.entries : Array.isArray(r && r.rows) ? r.rows : []
    const urgency = urgencyById(kernel, member)
    return { ok: true, tool: 'vibe_v5_inbox', action: 'list', member, status, count: rows.length, rows: rows.map((row) => inboxRow(row, urgency)),
      note: 'rows carry NO body: triage by sender/time/subject/urgent/read/todo, then open ONE message; urgent:null means the face could not tell (not "not urgent")' }
  }
  if (action === 'open') {
    if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'inbox open needs the message id', 'take it from the list rows')
    const open = mailboxAction(kernel, 'open')
    const r = await open(member, str(args.id))
    const row = r && r.entry ? r.entry : r
    if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no message "' + str(args.id) + '" in this inbox', 'call inbox list for the real ids')
    const urgency = urgencyById(kernel, member)
    const mid = str(row.id)
    const joinedUrgent = row.urgent === true ? true : urgency.has(mid) ? urgency.get(mid) : null
    return { ok: true, tool: 'vibe_v5_inbox', action: 'open', member, id: str(row.id),
      message: { id: str(row.id), from: str(row.from || row.by), at: row.at !== undefined ? row.at : null, subject: row.subject !== undefined ? row.subject : null, kind: str(row.kind), urgent: joinedUrgent, text: str(row.text), read: true, todo: row.todo === true },
      note: 'opening marks it read; use action:"mark" with todo to track a follow-up' }
  }
  if (action === 'mark') {
    if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'inbox mark needs the message id', 'take it from the list rows')
    const setState = mailboxAction(kernel, 'setState')
    const patch = {}
    if (args.read !== undefined) patch.read = args.read === true
    if (args.todo !== undefined) patch.todo = args.todo === true
    if (Object.keys(patch).length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'inbox mark needs read and/or todo', 'pass read:true|false and/or todo:true|false')
    const r = await setState(member, { id: str(args.id), ...patch })
    return { ok: true, tool: 'vibe_v5_inbox', action: 'mark', member, id: str(args.id), state: { read: r && r.read === true, todo: r && r.todo === true }, receipt: r }
  }
  throw refuse('VMU_INVALID_ARGUMENT', 'unknown inbox action: ' + action, 'legal: list | open | mark')
}
/** vibe_v5_wait — wait for activity through the kernel face (NOT polling). */
async function toolWait(args = {}, { kernel } = {}) {
  const act = kernel && kernel.activity
  if (!act || typeof act.wait !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'wait needs the activity face', 'assemble a kernel with the activity service')
  const action = has(args.action) ? str(args.action) : 'wait'
  if (action === 'status') return { ok: true, tool: 'vibe_v5_wait', action: 'status', status: typeof act.status === 'function' ? act.status() : null }
  if (action !== 'wait') throw refuse('VMU_INVALID_ARGUMENT', 'unknown wait action: ' + action, 'legal: wait | status')
  const timeoutMs = Number.isInteger(args.timeout_ms) && args.timeout_ms > 0 ? args.timeout_ms : 60000
  const result = await act.wait({ timeoutMs, member: has(args.member) ? str(args.member) : null, reason: has(args.reason) ? str(args.reason) : '' })
  return { ok: true, tool: 'vibe_v5_wait', action: 'wait', timedOut: result && result.timedOut === true, result,
    note: 'waits until activity or the timeout; never poll' }
}

// ── ⑦–⑫ SECOND BATCH: task board, hiring, reporting, overview ───────────────────────────────────────────────
/**
 * THE TASK BOARD. The original's `task_create / task_list / task_update` are the shared-board face; the kernel
 * publishes a tasks face with `create / assign / transition / setDependencies / list`, so three of the original's
 * eight update actions (edit, delete, release) have NO face operation here — those are refused BY NAME with the
 * supported list, never silently ignored and never re-implemented in the pack (the task ledger is kernel capability).
 */
/**
 * HIRING A TEMP WORKER. The original has NO recruit-face method named `hire`; in this kernel a temp seat is created by
 * the MEMBERS face and the onboarding work is a task, so the handler composes the two published capabilities rather
 * than inventing a third. `direction`/`term` are onboarding TEXT in the original; this kernel keeps a member's
 * direction in roster data, so they are accepted, reported as not stored, and never silently dropped.
 */
async function toolHire(args = {}, { kernel } = {}) {
  if (!has(args.purpose)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs purpose', 'pass purpose:"why this worker exists"')
  if (!has(args.initial_task)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs initial_task', 'pass initial_task:"the first task"')
  if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs the new member id', 'pass to:"<new member id>" (this pack never invents an id)')
  // ★ LIVE RUN 7 (agent feedback item e): the rule wants the SLOT stated explicitly (「显式给 slot…」), and this face used to
  // hardcode `temp` without ever reading a `slot` argument, so a caller could not tell whether its slot had been honoured
  // or overridden. The slot is now read, defaulted (temp), and REFUSED BY NAME when it names a seat this face does not
  // seat: a 院士/常驻研究员 seat is created by the FOUNDING face (`vibe_v5_start`) or by the office through
  // `vibe_vmu_control {action:"hire"}`, and quietly downgrading such a request to a temp seat is the silent-substitution
  // failure this project forbids.
  const slot = has(args.slot) ? str(args.slot) : 'temp'
  if (slot !== 'temp') {
    throw refuse('VMU_NOT_PERMITTED', 'vibe_v5_hire seats TEMP seats only; you asked for slot "' + slot + '"',
      'the 「院士」/「常驻研究员」 seats are created by the founding face (vibe_v5_start { researcherCount }) or by the office with '
      + 'vibe_vmu_control { action: "hire", member_id, slot } — this face refuses instead of silently seating a temp worker')
  }
  const members = membersOf(kernel)
  const hired = await members.hire({ id: str(args.to), slot })
  let task = null
  if (kernel.tasks && typeof kernel.tasks.create === 'function') {
    task = await kernel.tasks.create({ title: str(args.initial_task), objective: str(args.purpose), owner: str(args.to), deps: null, writeScopes: [] })
  }
  // ★ ROUND 32 (run-32 report, readability item 1): `vibe_v5_hire` hands back a TASK whose id is `t-1`, and
  // `vibe_vmu_turn { op:"step" }` hands back a PROMPT whose `turnId` is also `t-1` — two registries minting from their own
  // counters with the same prefix. Two tables, one spelling: a reader holding both receipts cannot tell which `t-1` a later
  // call means. The ids stay (renaming either namespace would break every stored id), so each receipt NAMES ITS TABLE.
  const taskWithRegistry = task === null || typeof task !== 'object'
    ? task
    : Object.assign({}, task, {
      idRegistry: 'task-board',
      idMeans: 'task ids are minted by the TASK board (`t-<n>`); the TURN store mints `t-<n>` from ITS own counter, so a bare id is ambiguous across receipts — this field names the table, and `memberPrompt.turnIdRegistry` names the other one',
    })
  return { ok: true, tool: 'vibe_v5_hire', member: str(args.to), slot, slotRequested: slot, hired, task: taskWithRegistry,
    note: 'direction/term are onboarding prose in the original and roster data here, so they are not stored by this tool' }
}

/**
 * ★ THE FEEDBACK LEDGER'S COUNT, IN ONE PLACE — the pack's two reporting tools both print it, and the prompt line
 * 「未闭环条目会出现在汇报与总览的计数里」 is only TRUE if this exists (it did not: the sentence was a claim with no code,
 * which is the (乙) class defect).
 *
 * THE MEASURED SEMANTICS, taken from the WRITE side and not re-invented here: `op:'add'` writes a card with no verdict
 * line, `op:'update'` rewrites the SAME card and puts its verdict on the FIRST BODY LINE (`status：closed|…`). So "closed"
 * is a fact of the body, and `open` is every other row. `op:'list'` and both reporting tools all classify through
 * `classifyFeedback` below, so a reader cannot get two answers, and the three keys are `open` / `closed` / `total`.
 *
 * HONEST ABSENCE: a deployment with no records face, or one that does not declare the `feedback` track, gets zeros with
 * `declared:false` — the records face refuses an undeclared track BY NAME, and reporting "0 open" from a track that does
 * not exist would be exactly the kind of confident-but-empty number this repository bans.
 */
const FEEDBACK_COUNT_LIMIT = 5000
/** ★ WHERE "CLOSED" ACTUALLY LIVES — measured, not assumed. The records HEAD row carries `status`, but it is the
 *  LIFECYCLE state (`rec.state`: live|trashed, `kernel/records.js:331`), never the feedback verdict; the `op:update`
 *  branch therefore records closure where it does live: the first line of the card BODY (`status：closed`). A counter
 *  that compared the head field would have reported "closed: 0" forever — a confident number, and a false one. */
const FEEDBACK_CLOSED_LINE = /^\s*status\s*[：:]\s*closed\b/m
function feedbackCardBody(records, id) {
  try {
    const got = records.get({ id })
    const rec = got && got.record ? got.record : got
    return rec ? String(rec.body || '') : null
  } catch { return null } // a body the face cannot hand back is reported as unreadable, never counted as closed
}
function classifyFeedback(kernel) {
  const out = { declared: false, total: 0, closed: 0, open: 0, unreadable: 0, items: [], truncated: false }
  const records = kernel && kernel.records
  if (!records || typeof records.list !== 'function') return out
  let listed = null
  try {
    listed = records.list({ track: 'feedback', limit: FEEDBACK_COUNT_LIMIT })
  } catch (e) {
    if (e && e.code === 'VMU_INVALID_ARGUMENT') return out // the face's own named answer: the track is not declared
    throw e
  }
  const heads = Array.isArray(listed && listed.items) ? listed.items : []
  out.declared = true
  out.total = heads.length
  out.truncated = listed && listed.truncated === true
  for (const head of heads) {
    const body = feedbackCardBody(records, head && head.id)
    if (body === null) { out.unreadable += 1; out.items.push({ id: head && head.id, status: 'unreadable' }); continue }
    const closed = FEEDBACK_CLOSED_LINE.test(body)
    if (closed) out.closed += 1; else out.open += 1
    out.items.push({ id: head && head.id, status: closed ? 'closed' : 'open' })
  }
  return out
}
function feedbackCounts(kernel) {
  const classified = classifyFeedback(kernel)
  const out = { open: classified.open, closed: classified.closed, total: classified.total, declared: classified.declared, basis: 'feedback card body status line' }
  // A count that silently saturates at the read limit is a lie of a different shape: say when the window was truncated.
  if (classified.truncated === true) out.truncated = true
  // An unreadable body is stated, not folded into either bucket (the two buckets must add up to what was READ).
  if (classified.unreadable > 0) out.unreadable = classified.unreadable
  return out
}

/** The one-line rendering both tools use, so the sentence and the counts cannot drift apart. */
function feedbackLine(fb) {
  if (!fb || fb.declared !== true) return '· 反馈库：本部署未声明 feedback 轨（计数如实缺席，不报 0 当结论）'
  return '· 反馈库：未闭环 ' + fb.open + ' 条 / 共 ' + fb.total + ' 条（已闭环 ' + fb.closed + ' 条）'
    + (fb.truncated === true ? '（读取窗口已截断，实际更多）' : '')
}

/** A READ-ONLY human-readable report (the original takes no parameters): staffing, task board, meetings, feedback. */
async function toolReport(args = {}, { kernel } = {}) {
  const roster = membersOf(kernel).roster()
  const rows = kernel.tasks && typeof kernel.tasks.list === 'function' ? rowsOf(await kernel.tasks.list()) : []
  const openRows = rows.filter((t) => String(t.status || t.state) !== 'done')
  const openMeetings = kernel.meetings && typeof kernel.meetings.openMeetings === 'function' ? kernel.meetings.openMeetings() : null
  const meetingRows = openMeetings && Array.isArray(openMeetings.meetings) ? openMeetings.meetings : []
  const fb = feedbackCounts(kernel)
  const lines = [
    '【所内报告】',
    '· 编制：名册 ' + roster.length + ' 人（在册 live ' + roster.filter((m) => m.state === 'live').length + ' 人）',
    '· 任务板：共 ' + rows.length + ' 张，其中未完成 ' + openRows.length + ' 张',
    '· 会议：开着的 ' + meetingRows.length + ' 场',
    feedbackLine(fb),
  ]
  return { ok: true, tool: 'vibe_v5_report', report: lines.join('\n'),
    counts: { roster: roster.length, live: roster.filter((m) => m.state === 'live').length, tasks: rows.length, openTasks: openRows.length, openMeetings: meetingRows.length, feedback: fb },
    note: 'read-only composition of the published faces; no new kernel capability and no template invention. '
      + 'feedback.open = the feedback-track rows whose status is not "closed" (the same predicate vibe_v5_feedback op=list uses); declared:false means this deployment has no feedback track, so the count is honestly absent' }
}

/**
 * THE INSTITUTE-WIDE VIEW, academician-only in the original ("(academician) Institute-wide view"). The ROLE CHECK is
 * the pack's: the slot vocabulary is the pack's own declaration, so the pack is where "only the chair seat" belongs.
 */
async function toolOverview(args = {}, { kernel } = {}) {
  const member = requireSpeaker(kernel, args.member)
  const row = membersOf(kernel).roster().filter((m) => m.id === member)[0]
  if (String(row.slot) !== 'chair') {
    throw refuse('VMU_NOT_PERMITTED', 'overview is an academician (chair seat) tool: member "' + member + '" is in slot "' + String(row.slot) + '"',
      'call it from a member seated in the chair slot; the roster view is available to everyone through the status face')
  }
  const roster = membersOf(kernel).roster()
  const rows = kernel.tasks && typeof kernel.tasks.list === 'function' ? rowsOf(await kernel.tasks.list()) : []
  const openMeetings = kernel.meetings && typeof kernel.meetings.openMeetings === 'function' ? kernel.meetings.openMeetings() : null
  const meetingRows = openMeetings && Array.isArray(openMeetings.meetings) ? openMeetings.meetings : []
  // ★ run-8 finding B (second half, found while pinning it): the marker only knows meetings that have been MARKED (a
  // convened meeting somebody spoke into), so a SCHEDULED or WAITING meeting was invisible in this list even though
  // `vibe_v5_meeting {action:"status"}` could read it. The list is therefore built from the MEETING SERVICE's live set
  // (the authority for "which meetings exist"); the marker's rows only enrich it, and the schedule-aware state always
  // comes from `meetingView`, because the marker's own `state` is its lifecycle, not the meeting's state.
  // ★ LIVE RUN 10, finding F: the due-clock pass (`meetings.sweepDue`) had no readable trace, so "the deadline was
  // observed" was unverifiable from outside. The service remembers its LAST pass and both read faces relay it;
  // `ran:false` is the honest state of a process that has not swept yet (NOT "nothing was due").
  const serviceStatus = (() => {
    try {
      return kernel.meetings && typeof kernel.meetings.status === 'function' ? kernel.meetings.status() : null
    } catch { return null }
  })()
  const serviceLive = serviceStatus && Array.isArray(serviceStatus.liveMeetings) ? serviceStatus.liveMeetings : null
  const sweepTrace = serviceStatus && serviceStatus.sweep !== undefined ? serviceStatus.sweep : null
  const markerById = new Map(meetingRows.filter(Boolean).map((r) => [String(r.id), r]))
  const meetingIds = (() => {
    const seen = []
    for (const id of (serviceLive || [])) if (id && !seen.includes(String(id))) seen.push(String(id))
    for (const r of meetingRows) if (r && r.id !== undefined && !seen.includes(String(r.id))) seen.push(String(r.id))
    return seen
  })()
  // ★ R13: WHO LEADS, read from the LIVE roster and the resolved setting — the two facts the charter depends on. The
  // reading is a separate module (`./leadership.js`) because the policy decision in `middleware/prompt-switches.js` §4
  // and this receipt must be able to disagree ONLY in a way a reader can see; today they delegate to one another instead.
  const settingsForLeader = typeof kernel.settingsView === 'function' ? kernel.settingsView() : null
  const leaderId = settingsForLeader && typeof settingsForLeader.get === 'function'
    ? String(settingsForLeader.get('vmu.turn.leaderId') === undefined || settingsForLeader.get('vmu.turn.leaderId') === null ? '' : settingsForLeader.get('vmu.turn.leaderId'))
    : ''
  const leadership = leadershipReading({ roster, leaderId, leaderSlot: LEADER_SLOT })
  const leadershipIssue = leadershipWarning(leadership)
  const out = { ok: true, tool: 'vibe_v5_overview', by: member,
    roster: roster.map((m) => ({ id: m.id, slot: m.slot, state: m.state })),
    board: { tasks: rows.length, open: rows.filter((t) => String(t.status || t.state) !== 'done').length },
    // ★ PHASE 12 / run-8 finding B: the marker's own `state` is the MARKER's lifecycle (it says "open" the moment a
    // meeting is convened, even for a meeting that is still SCHEDULED). Reporting it as the meeting's state made
    // `vibe_v5_overview` disagree with `vibe_v5_meeting {action:"status"}` for the same id in the same window — a read
    // face contradicting a read face. The authority for a meeting's state is the meeting service view (schedule-aware);
    // the marker's value is kept under a name that cannot be confused with it.
    meetings: meetingIds.map((id) => {
      const m = markerById.get(id) || {}
      let view = null
      try { view = kernel.meetings && typeof kernel.meetings.meetingView === 'function' ? kernel.meetings.meetingView({ meeting: id }) : null } catch { view = null }
      const meetingState = view && view.state !== undefined ? String(view.state) : null
      return { id, state: meetingState === null ? (m.state === undefined ? null : m.state) : meetingState,
        stateSource: meetingState === null ? 'marker (meeting service view unavailable)' : 'meeting service view',
        scheduledFor: view && view.scheduledFor !== undefined ? view.scheduledFor : null,
        type: view && view.type !== undefined ? view.type : null,
        // ★★★ PHASE 12 / R19 (run-16 report, item 3): these two used to be the MARKER's lifecycle under the neutral
        // names `status`/`faceState`, so a row could say state:'waiting' and status:'open' at once. The marker value is
        // reported once, under a name that cannot be read as the meeting's status, and the note says what it is.
        // the marker row already names its own value `markerState`; older rows carry it as `state`, so the fallback
        // keeps the FACT rather than reading null on a row shape the marker no longer emits.
        markerState: m.markerState === undefined ? (m.state === undefined ? null : String(m.state)) : m.markerState,
        markerStateNote: 'markerState is the DOMAIN MARKER own lifecycle (it opens when a meeting is convened, so it says "open" even for a meeting that is still scheduled). The meeting state is the `state` field.' }
    }),
    // ★ Same three keys and the same rule as vibe_v5_report.counts.feedback (one helper, so they cannot disagree).
    feedback: feedbackCounts(kernel),
    // the LAST due-clock pass over scheduled/waiting meetings (see the comment above `serviceStatus`)
    sweep: sweepTrace,
    leadership }
  // A warning is a TOP-LEVEL field, not a line inside `leadership`: a caller that reads only the warned shape cannot
  // mistake "no warning" for "no field" — absent means consistent, and the note says which code it was.
  if (leadershipIssue) { out.warning = leadershipIssue }
  return out
}

// ── ⑬–⑲ THIRD BATCH: help, assignment, dismissal, supervision, priorities, feedback, library reading ─────────
/**
 * ★ `vibe_v5_tool_help` — THE PROMPT-INVENTED NAME MADE REAL (PHASE 7 round 4 Lead ruling). The corpus teaches it 47
 * times and the ORIGINAL NEVER REGISTERED IT; the idea is right (a member needs an exit that answers "what can I call
 * right now?"), so this implements it instead of deleting the sentence.
 *
 * THE SOURCE IS THE KERNEL, NOT THE PROMPT: the list comes from `kernel.packTools()` — the declarations the kernel
 * actually holds, each carrying the description written in this file, so the answer cannot drift from what is
 * published. The host's per-Agent visible set is consulted through the ONLY kernel-side reader that exists
 * (`applyMemberToolFace` with an EMPTY allow/deny acts as a read: it returns the host receipt's visible counts); a
 * host with no applier / no live Agent refuses BY NAME and this tool reports that instead of an empty list.
 *
 * ★ NAMED GAP (reported, not hidden): the kernel has no reader for the FULL visible NAME set — the host publishes
 * TOOL_NAMES and installs a visible-tools PROVIDER, but no getter is exposed, so this tool can name the pack-declared
 * tools exactly and the host's visible COUNT, not the host face names. "需内核能力：visible-tools reader" is recorded
 * in `V5R_NEXT_BATCH_TOOLS`.
 */
/**
 * ★ `vibe_v5_tool_help` — A THIN FORWARDER (PHASE 8 / B-1), not a second implementation.
 *
 * WHAT CHANGED AND WHY: the old body answered from the kernel's DECLARATIONS (`packTools()` — 38 names, whether or not
 * the asking seat may call them). A member needs "what can I call RIGHT NOW?", which is the kernel's `toolsView`: names
 * from the LIVE visible-tools provider (`turn.visibleToolsOf`), purposes from the host's registered descriptions. With
 * role-scoped deny faces those two sets are no longer the same (a temp seat's declaration set is 38, its visible set is
 * 6), so keeping the old answer would have been a lie the pack could have avoided.
 *
 * ★ `purpose: null` IS NOT A MISSING FIELD: it means the host registered no description for that name. The kernel
 * refuses to invent one, and this forwarder passes it through untouched.
 * ★ NO LIVE AGENT / NO PROVIDER ⇒ the kernel's reading refuses BY NAME; this forwarder propagates that refusal (it never
 * returns an empty list and calls it success).
 */
function toolHelp(args = {}, exec = {}) {
  if (!has(args.member)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'tool_help needs the member id',
      'pass member:"<roster id>" — the answer is per member, because each seat sees a different tool table')
  }
  // ★★★ THE KERNEL HAS A CALLER-AGENT PATH AND THIS FACE WAS ITS ONLY CONSUMER THAT NEVER USED IT. `kernel/index.js`
  // documents "CALLER AGENT FIRST: inside a one-shot member turn the memberSession map may not be learned yet, but the tool
  // already runs on that Agent - its own schemas are the authoritative visible set". The signature defaults `agent = null`,
  // and this call passed only `{ member }`, so that branch was DEAD: the call always fell through to the provider, which
  // answered "no live Agent for member … (session=(none learned yet))" even after the member had run two turns (item #19).
  // ★ The caller Agent is already in `exec` - `tools/member-tools.js` reads `exec.agent` for exactly this purpose - so the
  // fix is to forward it, and to drop root session ids the same way that sibling does (a root session is not a member seat).
  const kernel = exec && exec.kernel ? exec.kernel : undefined
  if (!kernel || typeof kernel.toolsView !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no toolsView reader, so the visible tool table cannot be read',
      'assemble the host adapter so members expose their tool table (the pack must not invent one)')
  }
  const caller = exec && exec.agent ? exec.agent : null
  const agent = caller && typeof caller.id === 'string' && !caller.id.startsWith('session-') ? caller : null
  const view = kernel.toolsView({ member: str(args.member), agent })
  return Object.assign({}, view, { tool: 'vibe_v5_tool_help',
    note: 'thin forwarder: the kernel\'s toolsView reading (the member\'s VISIBLE set from the live provider), not the pack declaration; purpose:null means the host registered no description for that name' })
}

/**
 * ★ `vibe_v5_assign` — the original ASSIGNS work: create/pick a task, give it to a member, and state WHY plus the
 * acceptance criteria (all three REQUIRED there). This kernel has no separate "assignment" object, so the handler
 * composes two published capabilities: the tasks face (`create` when no task_id, then `assign`) and the mailbox face
 * (the assignee must SEE the why/acceptance — a silent assignment is the paper capability this repo bans).
 */
async function toolAssign(args = {}, { kernel } = {}) {
  if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'assign needs the assignee', 'pass to:"<roster id>"')
  if (!has(args.why)) throw refuse('VMU_INVALID_ARGUMENT', 'assign needs why', 'pass why:"the reason this work matters"')
  if (!has(args.acceptance)) throw refuse('VMU_INVALID_ARGUMENT', 'assign needs acceptance criteria', 'pass acceptance:"how we will know it is done"')
  const to = str(args.to)
  const roster = membersOf(kernel).roster()
  if (!roster.some((m) => m.id === to)) {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + to + '" on this roster', 'the roster holds ' + roster.length + ' member(s)')
  }
  const tasks = tasksOf(kernel)
  let taskId = has(args.task_id) ? str(args.task_id) : null
  let created = null
  if (!taskId) {
    if (!has(args.subject)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'assign without task_id needs a subject (the original created the task here)',
        'pass task_id:"t-…" to assign an existing task, or subject:"…" to create one')
    }
    created = await tasks.create({ title: str(args.subject), objective: has(args.description) ? str(args.description) : str(args.acceptance), owner: to, deps: null, writeScopes: Array.isArray(args.write_scopes) ? args.write_scopes.map(String) : [] })
    taskId = created && created.id
  } else {
    await tasks.assign(taskId, to)
  }
  let notice = null
  if (kernel.mailbox && typeof kernel.mailbox.send === 'function') {
    notice = kernel.mailbox.send('office', { to, kind: 'assign',
      text: '【分派】' + str(args.subject || args.task_id) + '\n理由：' + str(args.why) + '\n验收：' + str(args.acceptance) })
  }
  return { ok: true, tool: 'vibe_v5_assign', to, taskId, created: created || null, notice,
    note: 'priority/due_in/origin of the original have no column here; the why/acceptance travel to the assignee as mail (named, not dropped)' }
}

/**
 * ★ `vibe_v5_fire` — dismiss a TEMP worker for real. The members face has `end(id, reason)`, and the task ledger can
 * move that member's open tasks to `cancelled` — both published capabilities, so the handler composes them. The
 * original also DROPPED its mail; the mailbox face has no per-member purge this pack may call, so it is reported.
 */
async function toolFire(args = {}, { kernel } = {}) {
  if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'fire needs the member id', 'pass id:"<roster id>"')
  const id = str(args.id)
  const row = membersOf(kernel).roster().filter((m) => m.id === id)[0]
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', 'the roster holds the live ids')
  const ended = await membersOf(kernel).end(id, str(args.reason) || 'dismissed by vibe_v5_fire')
  const cancelled = []
  const tasks = kernel.tasks && typeof kernel.tasks.list === 'function' ? rowsOf(await kernel.tasks.list()) : []
  for (const t of tasks) {
    if (String(t.owner) !== id) continue
    const st = String(t.status || t.state)
    if (st === 'done' || st === 'cancelled') continue
    try {
      await kernel.tasks.transition(t.id, 'cancelled', { reason: 'assignee dismissed (vibe_v5_fire)' })
      cancelled.push(t.id)
    } catch (e) { cancelled.push(t.id + ':refused:' + ((e && e.code) || 'unknown')) }
  }
  return { ok: true, tool: 'vibe_v5_fire', id, slot: row.slot, ended, cancelledTasks: cancelled,
    note: 'mail is not purged (the mailbox face exposes no per-member purge this pack may call) — reported, not pretended' }
}

/** ★ `vibe_v5_nudge` — supervision: wake one member with a reason and a concrete next step, through the mailbox. */
function toolNudge(args = {}, { kernel } = {}) {
  if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'nudge needs the member', 'pass to:"<roster id>"')
  if (!has(args.why)) throw refuse('VMU_INVALID_ARGUMENT', 'nudge needs why', 'pass why:"the concrete reason"')
  const to = str(args.to)
  const roster = membersOf(kernel).roster()
  const row = roster.filter((m) => m.id === to)[0]
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + to + '" on this roster', 'the roster holds ' + roster.length + ' member(s)')
  if (!kernel.mailbox || typeof kernel.mailbox.send !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no mailbox face is published, so a nudge cannot be delivered', 'assemble a kernel with the mailbox service')
  }
  const text = '【督办】' + str(args.why) + (has(args.next_step) ? '\n建议下一步：' + str(args.next_step) : '')
  const sent = kernel.mailbox.send('office', { to, kind: 'nudge', text })
  return { ok: true, tool: 'vibe_v5_nudge', to, sent,
    note: row.state === 'live' ? 'delivered as urgent mail (v5r lists nudge among its urgent kinds)' : 'member is ' + String(row.state) + '; the mail waits for its next wake' }
}

/**
 * ★ `vibe_v5_prioritize` — "set institute-wide priorities: an ordered list of {task_id, priority} plus WHY. This
 * orders work only — it never changes what is true." The kernel's task ledger has NO priority/order column (measured:
 * `tasks.create` has no priority and there is no reorder op), so the ORDER is ARCHIVED as a durable record on the
 * state track and the receipt says so — the order is real, its enforcement is not pretended.
 */
async function toolPrioritize(args = {}, { kernel } = {}) {
  const order = args.order
  if (!Array.isArray(order) || order.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'prioritize needs a non-empty ordered list', 'pass order:[{task_id, priority}, …]')
  }
  if (!has(args.why)) throw refuse('VMU_INVALID_ARGUMENT', 'prioritize needs why', 'pass why:"why this order"')
  const taskRows = rowsOf(await tasksOf(kernel).list())
  const unknown = []
  for (const row of order) {
    if (!row || typeof row !== 'object' || !has(row.task_id)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'every order entry needs a task_id', 'pass order:[{task_id, priority}, …]')
    }
    if (!taskRows.some((t) => String(t.id) === String(row.task_id))) unknown.push(String(row.task_id))
  }
  if (unknown.length > 0) {
    throw refuse('VMU_NO_SUCH_OBJECT', 'the order names task(s) this board does not hold: ' + unknown.join(', '),
      'call task_list for the real ids; an order over phantom tasks would be a lie about priorities')
  }
  // the board's CURRENT priorities travel with the receipt, so "what was already true" stays comparable to the order
  const currentPriorities = order.map((r) => {
    const row = taskRows.filter((t) => String(t.id) === String(r.task_id))[0]
    return { task_id: String(r.task_id), current: row && row.priority !== undefined ? row.priority : null, requested: r.priority === undefined ? null : r.priority }
  })
  const archived = recordsOf(kernel).put({
    track: 'state', kind: 'decision', title: 'priorities: ' + order.length + ' task(s)',
    body: 'why：' + str(args.why) + '\norder：' + order.map((r, i) => (i + 1) + '. ' + str(r.task_id) + ' (priority ' + str(r.priority) + ')').join('\n'),
    settled: false, by: str(args.member) || 'vibe_v5_prioritize',
  })
  // ★★★ THE ORDER IS NOW APPLIED, NOT ONLY ARCHIVED. This face used to record the order and say, in its own note, that the
  // kernel had no operation for changing an existing task's priority - so an agent set priorities, read the board back, saw
  // `current: null` and reported the tool as broken. It was right. `kernel/tasks.js` now publishes `setPriority` with the same
  // compare-and-set discipline as every other mutation, and this face applies every entry that CARRIES a priority.
  // ★ An entry with no `priority` is a position-only statement: it stays part of the archived order and is NOT turned into a
  // number the caller never asked for. Each applied row reports what it was and what it became, so nothing is inferred.
  const applied = []
  for (const r of order) {
    if (r.priority === undefined || r.priority === null) continue
    const res = await tasksOf(kernel).setPriority(str(r.task_id), r.priority, { by: str(args.member) || 'vibe_v5_prioritize' })
    applied.push({ task_id: String(r.task_id), from: res.previous, to: res.priority, revision: res.revision })
  }
  return { ok: true, tool: 'vibe_v5_prioritize', order, archived: archived && archived.id, currentPriorities, applied,
    note: applied.length === 0
      ? 'no entry carried a priority, so only the ORDER was archived - pass priority on an entry to change the board'
      : 'priorities applied to ' + applied.length + ' task(s); the board sorts DESC by priority (see `applied` for from/to)' }
}

const FEEDBACK_ADD_REQUIRED = Object.freeze(['category', 'route', 'phenomenon', 'impact', 'action'])

/** ★ `vibe_v5_feedback` — the work-experience/process feedback library (not research conclusions). Mapped onto the
 * records face with a `feedback` track: `add` writes, `update` writes a revision with status/outcome, `list` returns
 * the open ones. The original REQUIRED five fields for `add` and `assessment` on the interpersonal route. */
function toolFeedback(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const op = has(args.op) ? str(args.op) : ''
  if (op !== 'add' && op !== 'update' && op !== 'list') {
    throw refuse('VMU_INVALID_ARGUMENT', 'feedback needs op=add|update|list', 'pass op:"add" / "update" / "list"')
  }
  if (op === 'list') {
    // ★ ONE RULE, ONE PLACE: the same classifier the report/overview counters use decides what "open" means here, so the
    // list and the two counts cannot drift apart (`status: 'unreadable'` rows are listed under `unreadable`, not folded
    // into "open" — a body the face cannot hand back is unknown, not unresolved).
    const classified = classifyFeedback(kernel)
    const heads = records.list({ track: 'feedback', limit: has(args.limit) ? Number(args.limit) : 50 })
    const byId = new Map(classified.items.map((r) => [r.id, r.status]))
    const items = Array.isArray(heads.items) ? heads.items : []
    const open = items.filter((r) => byId.get(r && r.id) !== 'closed')
    return { ok: true, tool: 'vibe_v5_feedback', op, count: open.length,
      counts: { open: classified.open, closed: classified.closed, total: classified.total, declared: classified.declared },
      items: args.all === true ? items : open }
  }
  if (op === 'add') {
    const missing = FEEDBACK_ADD_REQUIRED.filter((k) => !has(args[k]))
    if (missing.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'feedback add is missing REQUIRED field(s): ' + missing.join(', '),
        'the original required category/route/phenomenon/impact/action')
    }
    if (str(args.route) === 'interpersonal' && !has(args.assessment)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the interpersonal route REQUIRES assessment',
        'pass assessment:"your judgement of the interpersonal situation" (required by the original)')
    }
    const body = ['category：' + str(args.category), 'route：' + str(args.route), 'context：' + str(args.context),
      'phenomenon：' + str(args.phenomenon), 'impact：' + str(args.impact), 'action：' + str(args.action),
      'assessment：' + str(args.assessment)].filter((l) => !l.endsWith('：')).join('\n')
    const written = records.put({ track: 'feedback', kind: 'feedback', title: str(args.category) + '/' + str(args.route), body, settled: false, by: str(args.member) || 'vibe_v5_feedback' })
    return { ok: true, tool: 'vibe_v5_feedback', op, recordId: written && written.id, status: 'open' }
  }
  if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'feedback update needs id', 'pass id:"<feedback record id>"')
  const body = ['status：' + (has(args.status) ? str(args.status) : 'closed'), 'outcome：' + str(args.outcome), 'note：' + str(args.note)]
    .filter((l) => !l.endsWith('：')).join('\n')
  const written = records.put({ id: str(args.id), track: 'feedback', kind: 'feedback', title: str(args.id), body,
    settled: has(args.status) && str(args.status) === 'closed', by: str(args.member) || 'vibe_v5_feedback' })
  return { ok: true, tool: 'vibe_v5_feedback', op, recordId: written && written.id, status: has(args.status) ? str(args.status) : 'closed' }
}

// ── ★ PHASE 12 / B10: THE SCRIPT ARCHIVE (归档/复算) ───────────────────────────────────────────────────────────────
/**
 * The rule: 「脚本文件」— a script is a *所级产物*: it must be archivable and reviewable, and the no-adhoc-scripts rule's
 * own hint says "请走归档/复算流程". Measured before this tool: that sentence had NO landing point — the member could
 * write a script with the host's own write face, but the PACK had no scripts track, no archive face and no read-back,
 * so "归档/复算" was a promise with no mechanism (the (乙) class: a published claim with no code).
 *
 * WHY `kind: 'dataset'` AND NOT A NEW KIND: the records face owns the vocabulary (`vmu.records.allowedKinds`) and a
 * script IS an archived artifact with a path/purpose/fingerprint — exactly what `dataset` means in this kernel. The
 * fingerprint is the KERNEL's (`records.put` computes it under `vmu.records.fingerprintPolicy`), so a re-read can prove
 * the archived text has not drifted instead of trusting a hash this tool invented. No new key and no new kind is added;
 * the only declaration change is the `scripts` TRACK, which the record layer refuses by name until it is declared.
 *
 * THE BODY IS THE SCRIPT, VERBATIM: `read` returns `text` byte-identical to what was archived (the provenance lives in
 * `title`/`tags`/`by`), because a "recompute" over a body that was silently decorated is not a recompute of the thing.
 */
function scriptArchivedRow(kernel, id) {
  const got = recordsOf(kernel).get({ id: str(id) })
  return got && got.record ? got.record : got
}

function toolScript(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const op = has(args.op) ? str(args.op) : 'archive'
  if (op !== 'archive' && op !== 'read' && op !== 'list') {
    throw refuse('VMU_INVALID_ARGUMENT', 'script needs op=archive|read|list', 'pass op:"archive" / "read" / "list"')
  }
  const tracks = declaredTracks(kernel)
  if (!tracks.includes(SCRIPTS_TRACK)) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'this deployment declares no scripts track, so a script cannot be archived (vmu.records.tracks)',
      'declare "scripts" in vmu.records.tracks (the v5r pack ships it); until then this face is absent rather than fake',
      { declared: tracks, missingTrack: SCRIPTS_TRACK })
  }
  if (op === 'archive') {
    const missing = ['name', 'text'].filter((k) => !has(args[k]))
    if (missing.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'script archive is missing: ' + missing.join(', '),
        'pass name:"<file name>" text:"<the whole script>" (optional purpose/parent/edition)')
    }
    const tags = ['script']
    if (has(args.purpose)) tags.push('purpose:' + str(args.purpose))
    if (has(args.parent)) tags.push('parent:' + str(args.parent))
    if (has(args.edition)) tags.push('edition:' + str(args.edition))
    const written = records.put({
      track: SCRIPTS_TRACK,
      kind: 'dataset', // an archived artifact: kernel-computed fingerprint + provenance, no invented hash
      title: str(args.name),
      body: str(args.text), // verbatim: read-back must return the same bytes
      tags,
      settled: true,
      by: has(args.member) ? str(args.member) : null,
      bySource: has(args.member) ? 'argument' : 'unknown',
    })
    return {
      ok: true, tool: 'vibe_v5_script', op, track: SCRIPTS_TRACK,
      recordId: written && written.id, name: str(args.name),
      fingerprint: written && written.fingerprint,
      purpose: has(args.purpose) ? str(args.purpose) : null,
      at: written && (written.updatedAt || written.createdAt),
      recompute: 'recompute by running the archived text again (math_computation op=run mode=file), and compare the '
        + 'record fingerprint before/after — the archive is the artefact, not a note ABOUT the artefact',
    }
  }
  if (op === 'read') {
    if (!has(args.id) && !has(args.name)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'script read needs id or name', 'pass id:"<record id>" or name:"<archived file name>"')
    }
    let row = null
    if (has(args.id)) {
      row = scriptArchivedRow(kernel, args.id)
      if (!row || String(row.track) !== SCRIPTS_TRACK) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no archived script with id "' + str(args.id) + '"',
          'call op=read with name:"<file name>", or op=list for the archived scripts')
      }
    } else {
      const listed = records.list({ track: SCRIPTS_TRACK, limit: SCRIPT_LIST_LIMIT })
      const items = Array.isArray(listed.items) ? listed.items : []
      const same = items.filter((it) => String(it.title) === str(args.name))
      if (same.length === 0) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no archived script named "' + str(args.name) + '"',
          'call op=list to see the archived script names')
      }
      // latest edition wins: the head list is ordered newest-first by the records layer
      row = scriptArchivedRow(kernel, same[0].id)
    }
    return {
      ok: true, tool: 'vibe_v5_script', op,
      script: {
        id: row && row.id, name: row && row.title, fingerprint: row && row.fingerprint,
        track: row && row.track, by: row && row.owner, at: row && (row.updatedAt || row.createdAt),
        tags: row && Array.isArray(row.tags) ? row.tags : [], text: row && row.body,
      },
      note: 'the text is the archived body verbatim; the fingerprint is the kernel\'s, so a recompute can prove drift',
    }
  }
  const listed = records.list({ track: SCRIPTS_TRACK, limit: has(args.limit) ? Number(args.limit) : SCRIPT_LIST_LIMIT })
  const items = Array.isArray(listed.items) ? listed.items : []
  return { ok: true, tool: 'vibe_v5_script', op, track: SCRIPTS_TRACK, count: items.length,
    // `tags` is NOT part of the head row (`vmu.records.headFields`), so the list form does not print it — an empty array
    // here would claim "no provenance" for a script whose provenance is in the body record. `op:read` returns it.
    scripts: items.map((it) => ({ id: it.id, name: it.title, fingerprint: it.fingerprint, by: it.owner,
      at: it.updatedAt || it.createdAt })),
    truncated: listed.truncated === true }
}

const SCRIPTS_TRACK = 'scripts'
const SCRIPT_LIST_LIMIT = 50

// ── ⑳–㉖ FOURTH BATCH: the meeting and voting skeleton (v5r's core difference from v3) ──────────────────────
/**
 * THE THREE ORIGINAL RULES AND WHERE THEY LIVE (measured from `vibe-math-v5r.js`, not assumed):
 *
 *  ① `V5_NOT_VOTER` — "列席／受邀／临时工没有表决权（D8）；授权也不能把票权授出去（H12/R36）". The vmu ballot box has no
 *     role/eligibility concept (its cast takes `by` and never asks who that is), so the rule lands HERE, on the pack's
 *     OWN slots: the VOTER SEATS are now a DECLARED VALUE (`vmu.meetings.eligibleSeats`, shipped in this pack's
 *     settings/defaults.json as chair + member), not a constant in this file - policy belongs to the institution,
 *     not to code (red line 1). `temp` (and an id not on the roster) is refused by name with the original wording.
 *     "Authorisation cannot lend the vote" is structural: this face has no grant path, so there is nothing to lend -
 *     stated in the refusal.
 *
 *  ② `min_votes` — "whether THIS ballot counts, not the quorum". vmu's ballot box HAS that floor, but per-INSTANCE
 *     (constructor config `vmu.ballot.minVotes` / `minVotesRatio`), and `open()` accepts only question+options. ⇒ a
 *     per-poll `min_votes` argument is translated into the kernel's per-BOX `rules` (minVotes) and `close()` is where
 *     the real floor fires: the face refuses by name (`VMU_BALLOT_MIN_VOTES_NOT_MET`) and poll_close re-throws that code
 *     with the "未达门槛" wording. Only per-box secrecy/abstention remain unappliable (deployment-level policy).
 *
 *  ③ RECORD-KEEPING vs VOTING — "决议只能由院士或当次会议的记录人写入". The meeting face now carries a SECRETARY and
 *     lets the chair OR the secretary move a resolution; what stays the PACK's is narrower and stricter: opening/closing a
 *     poll board requires the CHAIR seat (the original marks both "(academician)"), and a recorder right never grants a
 *     vote — the secretary still votes through the ordinary eligibility rules.
 */
const CHAIR_SLOT = 'chair'
/** The DECLARED voter seats, read per call through the kernel's live settings view (empty ⇒ no seat restriction). */
function voterSeatsOf(kernel) {
  const view = kernel && typeof kernel.settingsView === 'function' ? kernel.settingsView() : null
  const raw = view ? view['vmu.meetings.eligibleSeats'] : undefined
  return Array.isArray(raw) ? raw.map(String).filter((x) => x !== '') : []
}

function seatOf(kernel, member) {
  const roster = membersOf(kernel).roster()
  return roster.filter((m) => m.id === str(member))[0] || null
}
function requireSeat(kernel, member, what) {
  const id = str(member).trim()
  if (!id) throw refuse('VMU_INVALID_ARGUMENT', what + ' needs the acting member id', 'pass member:"<roster id>" (a pack handler has no agent→member map)')
  const row = seatOf(kernel, id)
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', 'the roster holds the live ids')
  return row
}
function requireChairSeat(kernel, member, what) {
  const row = requireSeat(kernel, member, what)
  if (String(row.slot) !== CHAIR_SLOT) {
    throw refuse('VMU_NOT_PERMITTED', what + ' is an academician (chair seat) action; "' + row.id + '" is in slot "' + String(row.slot) + '"',
      'call it from a member seated in the chair slot (the original marks this action "(academician)")')
  }
  return row
}
/** ① V5_NOT_VOTER, landed on the pack's DECLARED voter seats (never a constant in this file). */
function requireVoter(kernel, member, what) {
  const row = requireSeat(kernel, member, what)
  const seats = voterSeatsOf(kernel)
  if (seats.length && !seats.includes(String(row.slot))) {
    throw refuse('VMU_NOT_PERMITTED', '列席／受邀／临时工没有表决权（原版 V5_NOT_VOTER／D8）："' + row.id + '" 在 "' + String(row.slot) + '" 席',
      '只有声明的表决席有票权（本机构声明：' + seats.join(' / ') + '）；授权也不能把票权授出去（H12/R36）——本面没有授权路径，所以结构上无从授出')
  }
  return row
}

// ── ★ E4 (真缺陷): THE MISSING TOOL FACE FOR "THE OFFICE ANSWERS" ────────────────────────────────────────────────
// `kit/paper.js` grew `recordConsult`/`consultState` and the gate runs on the assembled path — but `vibe_v5_paper`'s
// action table only had start/part/review/advance/final/render/status/compile/sections, so in a REAL session the
// academician's final was blocked by a question NOBODY could answer: the gate could only ever time out. That is the
// "mechanism with no reachable consumer" defect, one level worse than a missing feature (the mechanism exists and is
// even tested — the TESTS call it directly, the product cannot).
//
// WHO MAY ANSWER IS POLICY AND IT IS DECLARED IN ONE PLACE: `PAPER_CONSULT_ROLES` (`./paper.js`), matching a member by
// `id` OR `slot`. This helper is a PRE-CHECK, not a second gate: the kit re-checks after the delegation (defence in
// depth). Its value is that the refusal can name the roster fact ("r-1 is in slot member") and the declared roles
// BEFORE the durable consult ledger is touched — and that a member id which does not exist cannot claim to be the office.
function requireConsultAnswerer(kernel, member) {
  const row = requireSeat(kernel, member, 'paper consult (answering the office pre-finalisation question)')
  if (row.state !== undefined && String(row.state) !== 'live') {
    throw refuse('VMU_STATE', 'member "' + String(row.id) + '" is ' + String(row.state) + ', so it cannot answer the office consult',
      'the roster holds the live ids (roster() reports state); seat a live office member, or answer from one')
  }
  const who = [String(row.id), String(row.slot)].filter((x) => x !== '')
  const hit = PAPER_CONSULT_ROLES.filter((r) => who.includes(String(r)))[0]
  if (!hit) {
    const e = refuse('VMU_NOT_PERMITTED',
      '「' + String(row.id) + '」不能答复所办问询：只有 ' + (PAPER_CONSULT_ROLES.join('|') || '（本 pack 没有声明答复角色）') + ' 可以',
      '答复角色是机构政策（packs/v5r/paper.js 的 PAPER_CONSULT_ROLES，按 member id 或 slot 匹配）；普通成员不能替所办签字——'
      + '他们该做的是等所办答复，或由主席改 vmu.paper.officeConsult 的取值（那是设置面，不是这条工具）')
    e.declared = PAPER_CONSULT_ROLES.slice()
    e.received = String(row.id)
    e.memberSlot = String(row.slot)
    throw e
  }
  return row
}

// ── PHASE 12 / D13–D15: THE WIRING LAYER OF THE FOUR RULE PREDICATES ──────────────────────────────────────────
// A predicate answers {ok, allowed, applicable, code, message, hint, keys}. It never throws and never writes: the
// NAMED refusal and the `enforced` receipt field are THIS file's job (see the import note at the top of the file).
/** The pack evaluated the rule for THIS call (the kernel's own receipts use the same scope word). */
const ENFORCED_SCOPE = 'evaluated-so-far'
/** The track a card tool writes by default — read from the kit's OWN config, so there is no second copy to drift. */
const cardTrackOf = (toolName) => (KIT_CARD_CONFIG[toolName] ? KIT_CARD_CONFIG[toolName].track : null)

/** A refused predicate becomes a NAMED refusal carrying the declared keys it consulted. */
function gateRefuse(gate) {
  if (!gate || gate.allowed !== false) return null
  // The message is what the AGENT reads first, so it must carry the RULE and, when the gate knows it, the QUESTION the
  // rule is asking — a refusal that only says "not allowed" costs a round trip ("what exactly do you want from me?").
  // `fidelityAsked` reports its prompt as `reason`/`question`/`options` (not `message`), so fold those in here rather
  // than inventing a second vocabulary in the wiring layer.
  const base = str(gate.message) || str(gate.reason) || 'a v5r rule refused this call; nothing was written'
  const asked = str(gate.question)
  const options = Array.isArray(gate.options) && gate.options.length ? ' [' + gate.options.join(' | ') + ']' : ''
  const message = asked ? base + ' — ' + asked + options : base
  // ★ WHY THIS IS A RETURNED RECEIPT (re-measured ROUND 52, and the reason it first needed to be one is gone).
  // HISTORY: the host used to turn a thrown refusal into exactly {ok:false, code, message, hint} and DROP every other
  // property, so the p=1 gate refused correctly and the receipt still carried no `enforced` list — the "which keys
  // refused this" fact docs/03 promises never reached the caller. That is why this wiring layer hands the refusal back
  // as DATA of the same shape plus the enforced keys, and why the old throw-version left two dead lines here (removed).
  // NOW: `host.js` preserves `enforced`/`enforcedScope`/`settingValues` on a thrown refusal too (proved by
  // tests/vmu-host-refusal-attribution.test.mjs), so the two shapes ARE equivalent and the choice is style, not
  // necessity. It stays a receipt because v5r's callers read it as DATA (a receipt is a value the turn can inspect and
  // a hook cannot swallow), and because it carries the gate's own facts (`enforced`, `enforcedScope`) without building
  // an exception object per refusal. The gate itself still stays a pure predicate: allowed / code / keys.
  return { ok: false, code: gate.code || 'VMU_STATE', message,
    hint: gate.hint || 'the rule requires evidence this call did not carry; record the estimate and let the debate produce the conclusion',
    enforced: Array.isArray(gate.keys) ? gate.keys.slice() : [], enforcedScope: ENFORCED_SCOPE }
}
/** The union of the keys the gates of ONE call consulted (order-preserving, no duplicates). */
function enforcedOf(gates) {
  const out = []
  for (const g of gates) {
    if (!g || !Array.isArray(g.keys)) continue
    for (const k of g.keys) if (out.indexOf(k) < 0) out.push(k)
  }
  return out
}
/** ONE record row by id, or null: a gate judges ABSENCE, so "no such record" must not escape this plumbing as a throw. */
function rowOrNull(records, id) {
  if (!has(id) || !records || typeof records.get !== 'function') return null
  try { return records.get({ id: str(id) }) } catch { return null }
}
/** The card as the DEBATE gate must see it: its `p`, and the proof reference its AUTHOR put in the body payload. */
function cardProjectionOf(records, id) {
  const row = rowOrNull(records, id)
  if (!row) return null
  const parsed = parseCard(row)
  if (!parsed || parsed.ok !== true || !parsed.card) {
    return { id: has(id) ? str(id) : null, p: null, proofRef: '', proofState: '', bodyTruncated: row.bodyTruncated === true,
      unjudgeable: parsed && parsed.reason ? str(parsed.reason) : 'the card body could not be parsed' }
  }
  const fields = parsed.fields || {}
  return { id: row.id, p: parsed.card.p,
    proofRef: fields.proofRef === undefined ? '' : str(fields.proofRef),
    proofState: fields.proofState === undefined ? '' : str(fields.proofState),
    bodyTruncated: false }
}
/** The card's own `p`, or null when the card cannot be judged (never half-parsed). */
function cardPOf(records, id) {
  const proj = cardProjectionOf(records, id)
  return proj ? proj.p : null
}
/** The VERIFIED row a card was promoted to, or null. An undeclared track throws inside the carrier ⇒ "no evidence". */
function verifiedRowOf(records, id, fidelity = null) {
  if (!has(id) || !records) return null
  try {
    const found = findVerified(records, str(id), { fidelity })
    if (!found) return null
    const v = found.verified || {}
    return { id: found.id, cardId: v.cardId === undefined ? str(id) : v.cardId, conclusion: v.conclusion }
  } catch { return null }
}
/** The Lean EVIDENCE a write may claim: the kernel's conclusion for that job, plus the caller's conformance ruling.
 *  Lean passing is NOT the same as "the code says what the proposition needs" — the gate demands BOTH (p1Intent:111). */
function leanEvidenceOf(kernel, args = {}) {
  const job = leanPassedOf(kernel, args.lean_job)
  if (!job) return null
  const decision = has(args.lean_conformance) ? str(args.lean_conformance) : null
  return Object.assign({}, job, decision === null ? {} : { conformance: { decision } })
}
/** The debate EVIDENCE a write may claim (caller-supplied by design: the gate proves "no evidence ⇒ refuse", never
 *  "this evidence is true" — see docs/acceptance/conformance/lane-verified-design.md §10.6). Only known fields pass. */
function debateEvidenceOf(args = {}) {
  const raw = args.debate_ruling
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return { mode: raw.mode === undefined ? null : str(raw.mode), value: raw.value === undefined ? null : raw.value,
    ballotId: raw.ballotId === undefined ? null : str(raw.ballotId),
    subject: raw.subject === undefined ? null : str(raw.subject) }
}
/** The Lean CONCLUSION for one job id, or null. `passed` is a conclusion on the kernel's lean face, never a state.
 *  ★ B8 修的两个真缺陷：① 这个面挂的方法叫 `status(id)`（导出表见 `vibe-math-vmu/kernel/lean.js:977`），
 *  早先按 `job(id)` 探测 ⇒ 真机上永远探不到 ⇒ "Lean 证据"这条分支静默不存在；② 面本身在宿主没有 spawn 缝时
 *  就是 `null`（零机制红线的正常态），那不是错误、是"没有形式化面"，调用方要具名说清而不是当成"作业没通过"。 */
function leanPassedOf(kernel, jobId) {
  if (!has(jobId)) return null
  const face = kernel && kernel.lean
  if (!face) return null
  const read = typeof face.status === 'function' ? face.status.bind(face)
    : (typeof face.job === 'function' ? face.job.bind(face) : null)
  if (!read) return null
  try {
    const r = read(str(jobId))
    const job = r && (r.job || (r.ok === true && (r.passed !== undefined || r.state !== undefined) ? r : null))
    if (!job) return null
    return { jobId: str(jobId), passed: job.passed === true, state: job.state === undefined ? null : job.state,
      file: job.file === undefined ? null : job.file }
  } catch { return null }
}
/** The deployment's formalisation policy (`vmu.math.formalVerify`), read through the face that owns it.
 *  面不存在（无 spawn 缝）⇒ `null`：这时"要求形式化"这件事没有载体，调用方必须如实说出来。 */
function leanPolicyOf(kernel) {
  const face = kernel && kernel.lean
  if (!face || typeof face.policy !== 'function') return null
  try { const p = face.policy(); return p && typeof p === 'object' ? p : null } catch (e) { return null }
}
/** The fidelity registry's withdrawal predicate in the shape the ④ gate wants (a function), or null when unpublished.
 *  ★ B8：内核返回的是**标记对象**（`{withdrawn:true,…}`）而不是布尔 `true`，所以两种形状都认。 */
function fidelityWithdrawnFn(kernel) {
  const face = kernel && kernel.fidelity
  if (!face || typeof face.passedWithdrawnFor !== 'function') return null
  return (id) => {
    try {
      const r = face.passedWithdrawnFor(str(id))
      return r === true || (!!r && typeof r === 'object' && r.withdrawn === true)
    } catch { return false }
  }
}
/** 读回撤回标记（对象或布尔都归一成"有/没有 + 内容"）。 */
function withdrawalOf(kernel, cardId) {
  const face = kernel && kernel.fidelity
  if (!face || typeof face.passedWithdrawnFor !== 'function') return null
  try {
    const r = face.passedWithdrawnFor(str(cardId))
    if (r === true) return { withdrawn: true, markerId: null, note: null, by: null, at: null }
    if (r && typeof r === 'object' && r.withdrawn === true) {
      return { withdrawn: true, markerId: r.markerId === undefined ? null : r.markerId,
        note: r.note === undefined ? null : r.note, by: r.by === undefined ? null : r.by,
        at: r.at === undefined ? null : r.at }
    }
    return null
  } catch (e) { return null }
}

/**
 * ★ B8 · 「Lean 已过 ⇒ 辩论只查描述/定义符合性 ⇒ 符合即 p=1 且入 verified」的**显式收口动作**。
 *
 * 为什么需要一个动作而不是自动钩子：规则里的"符合性判定"是**人的判断**（形式化说的还是不是命题说的），
 * 框架不该替人答，也不该把判定埋进 `meetings.close`。所以这里是主席（院士）点名做的一次收口：
 *   · `fidelity:"conform"` ⇒ 卡上的 p 由同一条 gated 写卡路径改成 1（证据＝这次 Lean 作业），
 *     再经**唯一写入器** `promoteVerified` 进 verified 轨（warrant＝lean 作业 id，kind=`lean-conformance`）；
 *   · `fidelity:"defect"` ⇒ 由 `kernel.fidelity.declareDefect` 落下**耐久标记**（原因必填），
 *     该标记让 verified 读数立刻不可见（`findVerified` 的唯一撤回读法），且**不能再被下一次收口复活**。
 *
 * 两条硬前提（都具名拒，不静默）：① Lean 作业必须存在且**通过** —— 没有通过的编译，"符合性"无从谈起；
 * ② 收口人必须是主席席位（`requireChairSeat`）—— 把别人的经验值改成结论，是署名动作。
 */
async function toolFidelityConclude(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const cardId = has(args.card) ? str(args.card)
    : (has(args.id) ? str(args.id) : (has(args.proposition_id) ? str(args.proposition_id) : ''))
  if (!cardId) {
    throw refuse('VMU_INVALID_ARGUMENT', 'fidelity conclusion needs the proposition card it judges',
      'pass card:"<records id of the proposition card>"')
  }
  const decision = has(args.fidelity) ? str(args.fidelity).trim() : ''
  if (decision !== 'conform' && decision !== 'defect') {
    throw refuse('VMU_INVALID_ARGUMENT', 'fidelity must be "conform" or "defect"; got "' + decision + '"',
      'after a PASSING Lean run the debate judges correspondence only: "conform"＝形式化说的就是命题说的 ⇒ p=1 且入 verified；'
      + '"defect"＝不一致 ⇒ 撤回该卡的 verified 并记原因（defect 必须给 note）')
  }
  const chair = requireChairSeat(kernel, has(args.member) ? args.member : args.by, 'fidelity conclusion')
  const jobId = has(args.lean_job) ? str(args.lean_job)
    : (has(args.lean_job_id) ? str(args.lean_job_id) : '')
  const policy = leanPolicyOf(kernel)
  if (!jobId) {
    throw refuse('VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED',
      'a conformance conclusion needs the PASSING Lean job that settled the formalisation (no job id was given)',
      'pass lean_job:"<job id from vibe_v5_lean_run / vibe_v5_lean_job>" — 没有编译通过的作业，"符合性"无从判定')
  }
  const lean = leanPassedOf(kernel, jobId)
  if (!lean) {
    throw refuse('VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED',
      'Lean job "' + jobId + '" is not readable on this deployment ('
      + (kernel && kernel.lean ? 'the Lean face knows no such job id' : 'the Host exposes no spawn seam, so this deployment has no Lean face at all')
      + ')',
      'run the formalisation first（vibe_v5_lean_run）或把真实作业 id 传进来；没有 Lean 面时这条收口无载体，不要假装编过')
  }
  if (lean.passed !== true) {
    throw refuse('VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED',
      'Lean job "' + jobId + '" did NOT pass (state=' + str(lean.state) + '): conformance can only be judged on a formalisation that compiles',
      'fix the Lean file and re-run；缺陷路径也要求编译通过 —— "编译不过"不是"定义不忠实"')
  }
  const delivery = { lean: { jobId: lean.jobId, passed: lean.passed, state: lean.state, file: lean.file },
    policy: policy ? { formalVerify: policy.formalVerify, requireFormal: policy.requireFormal === true, encourageFormal: policy.encourageFormal === true } : null }

  if (decision === 'defect') {
    const fidelityFace = kernel && kernel.fidelity
    if (!fidelityFace || typeof fidelityFace.declareDefect !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'this deployment publishes no fidelity registry, so a defect cannot be recorded (and a withdrawal nobody records is not a withdrawal)',
        'assemble a kernel whose fidelity face is published (kernel.fidelity.declareDefect)')
    }
    const note = has(args.note) ? str(args.note).trim() : (has(args.reason) ? str(args.reason).trim() : '')
    const before = withdrawalOf(kernel, cardId)
    let declared = null
    let appended = false
    if (!before) {
      const res = await fidelityFace.declareDefect({ target: cardId, by: chair.id, note })
      if (!res || res.ok === false) {
        throw refuse(str(res && res.code) || 'VMU_STATE', (res && res.message) || 'the fidelity registry refused to record the defect',
          (res && res.hint) || 'a defect needs target + by + note（写清哪条定义/条件/假设/结论与命题原文不一致）')
      }
      declared = res
    } else if (note && before.note !== note) {
      const res = await fidelityFace.declareDefect({ target: cardId, by: chair.id, note })
      if (!res || res.ok === false) {
        throw refuse(str(res && res.code) || 'VMU_STATE', (res && res.message) || 'the fidelity registry refused to record the new defect',
          (res && res.hint) || 'a defect needs target + by + note')
      }
      declared = res
      appended = true
    }
    const marker = withdrawalOf(kernel, cardId)
    const stillVisible = findVerified(records, cardId, { fidelity: fidelityFace })
    const projection = cardProjectionOf(records, cardId)
    return Object.assign({ ok: true, tool: 'vibe_v5_fidelity_conclude', card: cardId, fidelity: 'defect',
      chair: chair.id, withdrawn: marker !== null, marker, alreadyWithdrawn: before !== null, appended,
      verifiedVisible: stillVisible !== null, cardP: projection ? projection.p : null,
      persisted: declared ? declared.persisted === true : null,
      enforced: [], enforcedScope: ENFORCED_SCOPE }, delivery,
    { note: '撤回是**耐久标记**，不是删行：verified 行还在盘上，但唯一读法（findVerified/verified 轨读面）从此看不见它；'
      + '再次 conform 会被 promoteVerified 以 `VMU_STATE` 拒（撤回不可被下一次收口撤销）。卡上的 p 不动 —— 撤回的是"结论"，不是"作者当时的估计"。' })
  }

  const cardRow = rowOrNull(records, cardId)
  if (!cardRow) {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id "' + cardId + '"',
      'pass the records id of an existing proposition card（先 vibe_v5_record_proposition）')
  }
  const projection = cardProjectionOf(records, cardId)
  if (!projection || projection.unjudgeable || projection.bodyTruncated) {
    throw refuse('VMU_STATE', 'card "' + cardId + '" cannot be read as a complete v5r proposition card',
      'a truncated or unparseable card cannot be promoted：修好卡体（四个声明字段）再收口')
  }
  const parsed = parseCard(cardRow)
  if (!parsed.ok) {
    throw refuse('VMU_STATE', 'card "' + cardId + '" is not a propositions/proposition card with the four declared fields'
      + (Array.isArray(parsed.problems) && parsed.problems.length ? ' (' + parsed.problems.join('; ') + ')' : ''),
      'the carrier never invents a missing field；先按 vibe_v5_record_proposition 的四个必填字段重写')
  }
  const fields = parsed.fields || {}
  let cardWrite = null
  if (projection.p !== 1) {
    // p=1 只能走**同一条** gated 写卡路径（p1Intent 的证据＝这次 Lean 作业），这样"改成 1"不产生第二条写路径。
    const writeCard = gatedCardHandler('vibe_v5_record_proposition')
    const writeArgs = { id: cardId, title: str(cardRow.title || fields.title || ''),
      statement: fields.statement, value: fields.value, motive: fields.motive, p: 1,
      lean_job: jobId, lean_conformance: 'conform', member: chair.id }
    if (projection.proofRef) writeArgs.proof_ref = projection.proofRef
    writeArgs.proof_state = 'complete'
    cardWrite = await writeCard(writeArgs, { kernel })
  }
  const writerGate = singleWriter({ records, cardId, by: chair.id, writer: 'promoteVerified', track: VERIFIED_TRACK })
  const writerRefusal = gateRefuse(writerGate)
  if (writerRefusal) return writerRefusal
  const promoted = promoteVerified({ records, sourceId: cardId,
    warrant: { id: jobId, kind: 'lean-conformance', subject: cardId },
    by: chair.id, fidelity: kernel && kernel.fidelity ? kernel.fidelity : null })
  const after = cardProjectionOf(records, cardId)
  const verified = findVerified(records, cardId, { fidelity: kernel && kernel.fidelity ? kernel.fidelity : null })
  return Object.assign({ ok: true, tool: 'vibe_v5_fidelity_conclude', card: cardId, fidelity: 'conform',
    chair: chair.id, p1Written: cardWrite !== null, cardWrite: cardWrite ? { recordId: cardWrite.recordId === undefined ? null : cardWrite.recordId,
      deduplicated: cardWrite.deduplicated === true } : null,
    cardP: after ? after.p : null,
    verified: verified ? { id: verified.id, cardId: verified.verified.cardId, p: verified.verified.p, warrant: verified.verified.warrant,
      source: verified.verified.source, by: verified.verified.by, at: verified.verified.at } : null,
    promoted: { written: promoted.written === true, unchanged: promoted.unchanged === true, refreshed: promoted.refreshed === true, id: promoted.id },
    enforced: enforcedOf([writerGate]), enforcedScope: ENFORCED_SCOPE }, delivery,
  { note: 'conform 的语义：卡上 p 改成 1（证据＝这次 Lean 作业，走 gated 写卡路径），并由唯一写入器进 verified 轨；'
    + '重复收口是幂等的（p 已是 1 且 verified 行同事实 ⇒ 不新增行、不报错）。' })
}

/**
 * ★ ① + ③, ON THE CARD WRITE PATH. `kitCardHandler` is the ONE body shared by the three card tools; wrapping it here is
 * the smallest place where both facts a gate needs are visible at once (the args, AND the records face).
 *   · p1Intent     — p=1 is a CONCLUSION, not a preference: the ordinary card write must carry one of the three
 *                    evidences (a verified row, a unanimous debate value of 1, a passed Lean run). Without one the
 *                    refusal is NAMED and the card is not written; the estimate belongs in (0,1).
 *   · singleWriter — the verified track has exactly ONE writer (`promoteVerified`, reached through
 *                    vibe_v5_verified_promote). A card tool can never become a second door into that track.
 */
function gatedCardHandler(toolName) {
  const inner = kitCardHandler(toolName)
  return function handler(args = {}, ctx = {}) {
    const kernel = ctx && ctx.kernel
    const records = recordsOf(kernel)
    const track = has(args.track) ? str(args.track) : cardTrackOf(toolName)
    const cardId = has(args.id) ? str(args.id) : null
    const by = has(args.member) ? str(args.member) : null
    // ★ PHASE 12 / B6 声明层：卡上的 `proofRef`/`proofState` 是**作者自述**（"我的证明写在哪、写完了没有"）。
    // 它不构成证明 —— 证据层在 `verification-gates.js` 的 `debateSubjectGate`（Lean 通过 或 verified 定论行）。
    // 两个别名收在这里，调用方不必知道 kit 的 payload 机制；只给 proofRef 不给状态 ⇒ 一律记 'draft'
    // （"只写了个引用"不能被读成"已经写完"）。
    if (has(args.proof_ref) || has(args.proof_state)) {
      const state = has(args.proof_state) ? str(args.proof_state).trim() : ''
      if (state && state !== 'complete' && state !== 'draft') {
        throw refuse('VMU_INVALID_ARGUMENT', 'proof_state must be "complete" or "draft"; got "' + state + '"',
          'pass proof_state:"complete" only if the proof/refutation is finished — it is a self-report, and a debate still needs machine evidence (Lean passed or a verified row)')
      }
      const payload = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload) ? Object.assign({}, args.payload) : {}
      if (has(args.proof_ref)) payload.proofRef = str(args.proof_ref)
      if (state) payload.proofState = state
      else if (has(args.proof_ref) && !has(payload.proofState)) payload.proofState = 'draft'
      args = Object.assign({}, args, { payload })
    }
    const writerGate = singleWriter({ records, cardId, by, writer: toolName, track })
    const writerRefusal = gateRefuse(writerGate)
    if (writerRefusal) return writerRefusal
    const gates = [writerGate]
    if (toolName === 'vibe_v5_record_proposition') {
      // The three evidences the rule accepts. `debate` and `lean` come from the CALLER's args (a card write cannot go
      // and hold a debate); `verified` is read from the records face, so it is not claimable by argument at all.
      const evidence = { verified: verifiedRowOf(records, cardId, kernel && kernel.fidelity),
        debate: debateEvidenceOf(args), lean: leanEvidenceOf(kernel, args) }
      // `card` carries the id for evidence matching and the truncation FACT, but NOT the old p: the value under judgement
      // is the one being written (p1Intent:95 prefers card.p, so handing it the stored row would judge yesterday's value).
      const stored = cardProjectionOf(records, cardId)
      const card = cardId === null ? null : { id: cardId, bodyTruncated: !!(stored && stored.bodyTruncated) }
      const pGate = p1Intent({ tool: toolName, args, card, evidence })
      const pRefusal = gateRefuse(pGate)
      if (pRefusal) return pRefusal
      gates.push(pGate)
    }
    const res = inner(args, ctx)
    if (!res || typeof res !== 'object' || Array.isArray(res)) return res
    return Object.assign({}, res, { enforced: enforcedOf(gates), enforcedScope: ENFORCED_SCOPE })
  }
}

/**
 * ★ ③ THE VERIFIED TRACK'S ONLY WRITE PATH. `promoteVerified` (in ./verified.js) had NO caller — a writer nobody could
 * reach. It needs a JUDGE (`warrant.id` + `warrant.kind`) and it refuses by name a card whose p is not exactly 1 or 0, a
 * truncated card, and a proof the fidelity registry withdrew. This face mints nothing: it forwards the warrant the
 * caller names, so "which debate decided this" stays answerable from the record.
 */
function toolVerifiedPromote(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const sourceId = has(args.card) ? str(args.card) : (has(args.id) ? str(args.id) : '')
  if (!sourceId) {
    throw refuse('VMU_INVALID_ARGUMENT', 'promote needs the proposition card it promotes',
      'pass card:"<records id of a propositions/proposition card whose p is exactly 1 or 0>"')
  }
  const member = has(args.member) ? requireSeat(kernel, args.member, 'verified promote').id : null
  const writerGate = singleWriter({ records, cardId: sourceId, by: member, writer: 'promoteVerified', track: VERIFIED_TRACK })
  const writerRefusal = gateRefuse(writerGate)
  if (writerRefusal) return writerRefusal
  if (!has(args.warrant) || !has(args.warrant_kind)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'promote needs the warrant that produced this conclusion — the judge, not a preference',
      'pass warrant:"<debate/ballot ruling id>" warrant_kind:"debate-unanimous" (or "lean-conformance" once that ruling exists)')
  }
  const promoted = promoteVerified({ records, sourceId,
    warrant: { id: str(args.warrant), kind: str(args.warrant_kind), subject: sourceId },
    by: member, fidelity: kernel && kernel.fidelity ? kernel.fidelity : null })
  return Object.assign({ ok: true, tool: 'vibe_v5_verified_promote', card: sourceId,
    warrant: { id: str(args.warrant), kind: str(args.warrant_kind) },
    enforced: enforcedOf([writerGate]), enforcedScope: ENFORCED_SCOPE,
    note: 'the verified row is a SECOND carrier beside the card: the card keeps its p, the verified row keeps the JUDGE (warrant), so "why is this settled" is answerable instead of asserted' }, promoted)
}

/**
 * ★ D15 · THE DEBATE'S FINAL RULING — the pack half of "收各成员最终裁决 → 全一致取该值否则取均值 → 通知命题卡持有者".
 * The kernel face (vmu.meetingverdict) owns the arithmetic and the notice. THIS function owns the three things the
 * kernel cannot know: WHICH meeting the ruling belongs to (so the signer is that meeting's chair, NAMED — an anonymous
 * ruling is not a ruling), WHETHER the fidelity question was answered before a number is announced (④), and the
 * operator's receipt (`enforced`). It is an EXPLICIT act: nothing is hooked onto meetings.close.
 */
function toolVerdictFinal(args = {}, { kernel } = {}) {
  if (!has(args.meeting)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the final ruling needs the meeting it was taken in',
      'pass meeting:"<the id vibe_v5_meeting returned>" — the ruling is signed by that meeting\'s chair')
  }
  const meeting = str(args.meeting)
  if (!kernel || !kernel.meetings || typeof kernel.meetings.meetingView !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meeting face: the ruling cannot be tied to a chair',
      'assemble a full kernel (vibe-math-vmu.js publishes vmu.meetings)')
  }
  const view = kernel.meetings.meetingView({ meeting })
  const chair = view && view.chair ? str(view.chair) : ''
  if (!chair) {
    throw refuse('VMU_STATE', 'meeting ' + meeting + ' declares no chair, so nobody can sign its final ruling',
      'convene the meeting with a chair seat (vibe_v5_meeting) — a ruling without a signer would be an anonymous assertion')
  }
  if (has(args.member) && str(args.member) !== chair) {
    throw refuse('VMU_NOT_PERMITTED', 'only the meeting CHAIR signs the final ruling: the chair of ' + meeting + ' is "' + chair + '", and you passed "' + str(args.member) + '"',
      'pass member:"' + chair + '", or omit member (the chair signs by default)')
  }
  if (!has(args.proposition_id)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the ruling needs the proposition it rules on',
      'pass proposition_id:"<records id of the proposition card>" — verdicts of different propositions are never mixed')
  }
  const propositionId = str(args.proposition_id)
  const verdicts = Array.isArray(args.verdicts) ? args.verdicts : null
  if (!verdicts || verdicts.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the final ruling needs the members\' verdicts — an empty set has no value',
      'pass verdicts:[{member,p,reason}] (p is a boolean probability in [0,1]); the kernel aggregates: all agree ⇒ that value, otherwise the arithmetic mean')
  }
  const records = kernel.records || null
  const cardRow = rowOrNull(records, propositionId)
  const owner = has(args.owner) ? str(args.owner)
    : (cardRow && has(cardRow.owner) ? str(cardRow.owner) : '')
  if (!owner) {
    throw refuse('VMU_STATE', 'nobody can be told: proposition "' + propositionId + '" is '
      + (cardRow ? 'owned by nobody (the record row carries no author)' : 'not on the records track')
      + ', so a ruling over it would have no recipient and the card could never be corrected',
    'pass owner:"<member id>", or record the proposition first (the card tools store the author as `by`)')
  }
  // ④ BEFORE a number is announced: if Lean passed and p is still not 1, the fidelity question must be ANSWERED —
  // either the caller answers it here (fidelity:"conform"|"defect") or the gate refuses with the question and options.
  const leanEvidence = has(args.lean_job) ? leanPassedOf(kernel, args.lean_job)
    : (args.lean_passed === true || args.lean_passed === false
      ? { jobId: null, passed: args.lean_passed === true, state: null, file: null } : null)
  const answered = has(args.fidelity) ? { decision: str(args.fidelity) } : null
  const pGate = fidelityAsked({ cardId: propositionId,
    leanPassed: !!(leanEvidence && leanEvidence.passed === true),
    p: cardRow ? cardPOf(records, propositionId) : null,
    withdrawnFor: fidelityWithdrawnFn(kernel), answered })
  const pRefusal = gateRefuse(pGate)
  if (pRefusal) return pRefusal
  const face = kernel.meetingverdict
  if (!face || typeof face.rulePropositionProbability !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the kernel publishes no meeting-verdict face, so nothing can aggregate the verdicts',
      'assemble a full kernel — vibe-math-vmu.js publishes vmu.meetingverdict (kernel/meetingverdict.js)')
  }
  // The kernel validates every row (duplicate member, out-of-range p, mixed propositions…) and refuses BY NAME; those
  // refusals travel up unchanged — this face never rewrites a kernel refusal into a success.
  const ruled = face.rulePropositionProbability({ verdicts, propositionId, owner, from: chair, at: null,
    template: has(args.template) ? str(args.template) : null })
  const delivery = (ruled && ruled.delivery) || { attempted: false, ok: false }
  // ★ LIVE RUN 9, finding B: when the card's OWNER is the chair who signs, the ruling could not be delivered at all —
  // the mailbox refuses a message addressed to its own sender ("a message may not be addressed to its own sender"), so
  // `notified` came out EMPTY while the rule requires the holder to be told. The honest reading: the holder IS the
  // signer, and the ruling is already in the signer's own receipt — there is no mailbox copy to make, and inventing one
  // by sending from somebody else would misattribute the signature. So the receipt says exactly that, and the fact is
  // DISCLOSED instead of presenting an empty `notified` that looks like a failure to notify.
  // ★ LIVE RUN 11: this used to INFER the self case from a FAILED delivery and then WRITE `selfAddressed` into the
  // kernel's own `delivery` object (old line: `if (selfAddressed) delivery.selfAddressed = true`). The result was a
  // receipt that said both `selfAddressed:true` and `ok:false, code:VMU_INVALID_ARGUMENT`, i.e. 'I addressed myself and
  // it failed' — a read face editing another face's verdict, and the reason the kernel's short-circuit was never noticed
  // as broken. The kernel decides this now (`delivery.selfAddressed` after its own short-circuit); the pack only READS it
  // and may not mutate it.
  const selfAddressed = delivery.selfAddressed === true
  // ★★ PHASE 12 / R21 (the institute's own run-17 report, item 5): `notified` listed the owner even when the r-35
  // case made NO delivery at all (`attempted:false`, `selfAddressed:true`), so the receipt claimed a recipient while
  // that member's mailbox held 0 messages - "I told them" and "there is nothing to read" in one receipt. `notified`
  // now lists ONLY mailboxes that actually received a copy; the self case is explained in `notifiedMeans` and the
  // empty list there means "nothing to send", not "the delivery failed".
  const notified = delivery.attempted === true && delivery.ok === true ? [owner] : []
  const deliveryContradiction = selfAddressed && (delivery.attempted === true || delivery.ok === false)
  // ★ LIVE RUN 7 (agent feedback item d): 「表决人数下限 = min(用户设置, 院士+常驻研究员)」 had NO landing point on this
  // receipt — the agent could read `n:2` and `mode` but never the floor the ruling was supposed to satisfy. The kernel
  // face already computes it (`meetings.quorum()` → the same `quorumOf` the close rail enforces), so it is READ here
  // rather than re-derived: a second copy of the formula is exactly the kind of second authority this project refuses.
  const floor = (() => {
    const faceM = kernel && kernel.meetings
    if (!faceM || typeof faceM.quorum !== 'function') return { readable: false, why: 'the kernel publishes no quorum() reading' }
    try {
      const q = faceM.quorum({ meeting })
      return { readable: true, minVotes: q && q.required !== undefined ? q.required : null,
        min: q && q.min !== undefined ? q.min : null, roster: q && q.roster !== undefined ? q.roster : null,
        eligibleUniverse: q && q.capUniverse !== undefined ? q.capUniverse : null,
        cap: q && q.cap !== undefined ? q.cap : null,
        formula: q && q.capPolicy ? q.capPolicy : null,
        satisfiedBy: ruled && Array.isArray(ruled.perMember) ? (Number(ruled.n) >= Number(q && q.required)) : null }
    } catch (e) { return { readable: false, why: (e && e.message) || String(e) } }
  })()
  return {
    ok: true, tool: 'vibe_v5_verdict_final', meeting, chair, from: chair,
    floor,
    proposition: ruled.proposition, value: ruled.value, valueSource: ruled.valueSource,
    mode: ruled.mode, exact: ruled.exact, rounded: ruled.rounded, decided: ruled.decided,
    enforceable: ruled.enforceable, estimate: ruled.estimate, n: ruled.n, perMember: ruled.perMember,
    spread: ruled.spread, owner, notified, delivery,
    // the reading that keeps an empty `notified` from being read as a delivery failure (see R21 above)
    notifiedMeans: selfAddressed
      ? 'no mailbox copy was made: the card owner is the chair who signed the ruling, so the ruling IS this receipt (a message may not be addressed to its own sender). An empty notified here means "nothing to send", not "the owner was not told" — see delivery.selfAddressed'
      : (notified.length
        ? 'the card owner received a mailbox copy of the notice (notified lists the mailboxes that were written)'
        : 'NO mailbox copy was written: delivery reported ok=' + String(delivery.ok) + ' — the number is on the record and the receipt says so, but the owner was not told (see delivery.code)'),
    notice: ruled.notice && ruled.notice.text ? ruled.notice.text : null,
    fidelity: { consulted: pGate.applicable === true, resolved: pGate.resolved === true,
      required: pGate.required === true, answered: !!answered,
      lean: leanEvidence ? (leanEvidence.jobId ? 'lean_job:' + leanEvidence.jobId : 'caller') : 'none' },
    enforced: enforcedOf([pGate]), enforcedScope: ENFORCED_SCOPE,
    // if this is ever true, the kernel attempted a self-addressed send: the receipt says so rather than smoothing it over
    deliveryContradiction,
    note: selfAddressed
      ? 'the ruling is on the record and the card owner (' + owner + ') is the chair who signed it, so the notice IS this receipt: a message may not be addressed to its own sender, no mailbox copy was made, and `notified` is empty for that reason (see `notifiedMeans` and `delivery.selfAddressed`)'
      : (notified.length
        ? 'the ruling is on the record and the card owner (' + owner + ') was told through the mailbox face'
        : '★ the ruling IS on the record but the card owner was NOT told: delivery reported ok=' + String(delivery.ok)
          + ' — the number is not hidden, the notice is simply missing (see `delivery`)'),
  }
}

/** ★ `vibe_v5_task_get` — read ONE task (the corpus teaches it, so it is declared rather than left dangling). */


/** ★ `vibe_v5_meeting` — convene a meeting. ONLY the chair seat may convene (the rule「会议只能由院士…召开」): the
 * original also let a non-chair PROPOSE one for the chair to convene; this face has no propose path, so that half is a
 * named gap rather than a silent convenience. */
/**
 * ★★ FINDING (j) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12) — as a PURE judge so it can run in the
 * two places that need it: this face's own `run()` (a direct call, e.g. from a test or an M2 module) and the pack funnel's
 * `validate` hook (which refuses BEFORE the generic undeclared-parameter gate, so this message wins and the reader is sent
 * to the right face instead of to a parameter list). Returns `null` when the call is not an action call.
 */
function validateMeetingArgs(args = {}) {
  if (args.action === undefined || args.action === null) return null
  return {
    ok: false,
    code: 'VMU_INVALID_ARGUMENT',
    message: 'vibe_v5_meeting only CONVENES a meeting; it has no "' + String(args.action) + '" action (this call was never dispatched, so nothing about it was validated)',
    hint: 'convene with { member, agenda } (optional: type/subject/title/at/formal_agenda/secretary); to READ or drive an existing meeting call vibe_vmu_meeting { action: "status"|"summary"|"snapshot"|"flow", id: "<meeting>" }',
  }
}

function toolMeeting(args = {}, { kernel } = {}) {
  // ★★ FINDING (j) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12): the agent opened a SCHEDULED
  // meeting and then read it back with `{action:'status', id}` on THIS face; it got
  // 「VMU_INVALID_ARGUMENT: meeting needs an agenda」 and reasonably suspected that status had fallen through to the
  // open branch. The dispatch was not the defect — this face NEVER dispatches: it only convenes, so `action` was
  // silently ignored and the call became "convene a meeting with no agenda". A refusal that names a missing field the
  // caller never meant to supply is worse than a bare refusal: it sends the reader to fix the wrong thing. An `action`
  // (or the read-only keys a status call carries) is now refused BY NAME and pointed at the face that answers it.
  if (args.action !== undefined && args.action !== null) {
    const refusal = validateMeetingArgs(args)
    throw refuse(refusal.code, refusal.message, refusal.hint)
  }
  if (!has(args.agenda)) throw refuse('VMU_INVALID_ARGUMENT', 'meeting needs an agenda', 'pass agenda:"what this meeting is for"')
  // ★ PHASE 12 — before this line, `requireSeat` let ANY member convene and 「会议只能由院士召开」 was only a sentence in
  // a prompt. The slot is the pack's own declared vocabulary (the kernel never learns what "academician" means), so the
  // gate belongs here, where both the caller id and its seat are known. The kernel holds the matching SHAPE gate
  // (`vmu.meetings.conveneRequiresChair`: a convene that installs a chair must name that chair as its actor) — two
  // locks, because a member calling the kernel directly is the other door, and neither lock claims to be the whole door.
  const member = requireChairSeat(kernel, args.member, 'meeting (convening)').id
  const roster = membersOf(kernel).roster().filter((m) => m.state === 'live').map((m) => m.id)
  // ★ GOAL ROUND 3 — THE TYPE. Until now this line was `type: 'ordinary'` HARDCODED into the call below: the rule says
  // 「院士可以设置会议的类型」 and the academician could not set it at all. The type is now a parameter, validated against
  // the pack's own catalog with the legal list named in the refusal; the kernel ADDITIONALLY validates it against the
  // declared `vmu.meetings.typeCatalog` when the institution declares that key, so the vocabulary is tunable without code.
  const typeInfo = meetingTypeOf(has(args.type) ? str(args.type) : 'ordinary')
  if (!typeInfo.known) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown meeting type: "' + typeInfo.type + '"',
      'the declared types are: ' + MEETING_TYPE_IDS.join(', ') + ' — declare vmu.meetings.typeCatalog to change the vocabulary')
  }
  const type = typeInfo.type
  const kind = has(args.kind) ? str(args.kind) : 'sync'
  const KNOWN = ['sync', 'division', 'verify-request', 'solve-vote']
  if (!KNOWN.includes(kind)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown meeting kind: ' + kind, 'the original offered: ' + KNOWN.join(', '))
  }
  if (!kernel.meetings || typeof kernel.meetings.open !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meetings face is published, so a meeting cannot be convened', 'assemble a kernel with the meetings service')
  }
  // ★ GOAL ROUND 3 — THE DEBATE'S EXTRA FIELD. The rule says 「院士如果设定会议类型为辩论，则会议会有个额外字段用于设置辩论的
  // 对象或辩论对象的文件引用」. `target` was DECLARED in the schema and read by nothing (a declared parameter with no
  // consumer); both spellings now reach the kernel, which stores the reference and reads it back on the receipt, on
  // `summary()` and on `meetingView()`. For a type that requires it, an empty value is refused by name instead of
  // convening a debate about nothing.
  const subject = has(args.subject) ? args.subject : (has(args.target) ? args.target : null)
  // ★★ LIVE RUN 30, finding b-2 (the institute's own words): `target` was a live alias of `subject` and NOTHING said so —
  // the agent passed `target:"p-prim-1"` meaning "name the meeting p-prim-1" and got a NEW meeting m114 whose subject was
  // that string. On the KERNEL face `target` means the object of a vote; here it means the object of a DEBATE. One word,
  // two meanings, no declaration. Two things changed: the alias is now stated in the tool description, and a subject on a
  // type that has NO object is refused by name instead of being silently filed as a subject (that is what made the
  // mistake invisible — an ordinary meeting accepted an object it can never use).
  const subjectSupplied = has(args.subject) || has(args.target)
  if (subjectSupplied && !typeInfo.subjectRequired) {
    throw refuse('VMU_INVALID_ARGUMENT',
      // ★ LIVE RUN 31: the institute quoted this refusal back and flagged the grammar. It is a message, not a
      // rule: the article is derived from the type it names (an ordinary / a debate).
      (type === 'ordinary' ? 'an ordinary' : 'a ' + type) + ' meeting takes no object: subject/target only mean something for a type that debates one',
      'drop subject/target (this meeting is about its agenda) — or convene with type:"debate"; ★ note that `target` on this face is an ALIAS of `subject`, while on vibe_vmu_meeting `target` is a VOTE\'s object')
  }
  if (typeInfo.subjectRequired && (subject === null || String(subject).trim() === '')) {
    throw refuse('VMU_INVALID_ARGUMENT', 'a ' + type + ' meeting needs a subject: the object of the debate',
      'pass subject:"<card id | file reference | the proposition in one line>" — the rule gives a debate meeting an extra field for its object')
  }
  // ★ D14 — 辩论的对象必须带「证明已写完」的承载，而且这个判定发生在会议**存在之前**（规则：「只有辩论才能把命题卡的
  // 布尔概率改成 1」，所以一场围绕半成品/没证明的辩论是在辩论"没有对象"）。闸是纯谓词（只判不写、不抛、不读设置），
  // 具名拒由这一层抛出；它核到的证据形态原样写进回执（`subjectGate.proofVia`/`provenance`），不替调用方美化。
  // 证据来源：卡/form 的文件形态由调用方在 `subject_evidence` 里自报（闸只保证"没证据就拒"，不核内容真伪——见
  // docs/acceptance/conformance/lane-verified-design.md §10.6）；vedrified 轨与 Lean 结论由 pack 自己查 records 面。
  let subjectGate = null
  if (typeInfo.subjectRequired) {
    const records = kernel.records || null
    const subjectText = subject === null || subject === undefined ? '' : str(subject)
    const supplied = (args.subject_evidence && typeof args.subject_evidence === 'object' && !Array.isArray(args.subject_evidence))
      ? args.subject_evidence : null
    subjectGate = debateSubjectGate({ meeting: { type }, subject: subjectText, evidence: {
      card: cardProjectionOf(records, subjectText) || null,
      verified: verifiedRowOf(records, subjectText),
      lean: (supplied && supplied.lean) || leanPassedOf(kernel, args.lean_job),
      file: (supplied && supplied.file) || null,
    } })
    const subjectRefusal = gateRefuse(subjectGate)
    if (subjectRefusal) return subjectRefusal
  }
  // ★ PHASE 7 round 23: the kernel's `meetings.open` accepts a SECRETARY (a recorder). The pack passes it through and
  // validates that the named id is on the roster — the RECORD right is a role the meeting declares, never a silent name.
  let secretary = null
  if (has(args.secretary)) {
    const row = membersOf(kernel).roster().filter((m) => m.id === str(args.secretary))[0]
    if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + str(args.secretary) + '" on this roster', 'the secretary must be a real member id')
    secretary = row.id
  }
  // PHASE 12 - the academician convenes AS ITSELF: `actor` is the caller, `chair` the seat it takes. With
  // vmu.meetings.conveneRequiresChair=true (declared below) the kernel refuses an anonymous convene and a convene
  // that installs somebody ELSE as chair, so "only the chair may convene" is a machine fact rather than a habit.
  // ★ PHASE 12 D1 — 预约时间（规则：「院士可以预约会议的召开时间（预约时负责人可设置预约时间、等待阶段、未到齐超时自决）」）。
  // 这一面之前**根本没法预约**：内核的 `open` 收 `at`，而这里不透传，于是「预约」在真机上完全不可达（内核的状态机却早已存在）。
  // `at` 原样透传，不在这一层做第二次解析：内核是唯一的时点判定点（`atMs()`：有限数字＝epoch ms，或 ISO-8601 字符串；
  // 其它一律具名 `VMU_INVALID_ARGUMENT`，并把那个值和它的类型写进消息）。也不在这里造第二套预约机制：`scheduled`/`waiting`、
  // 惰性结算（`syncMeeting`，全仓没有定时器，进程被杀不会留下永远卡住的会议）与 chairman 的 `proceed()` 都是内核的。
  // ★ PHASE 12 / D3 — 标题。在这之前「会议没有独立标题」：`agenda` 兼作议题与标题，于是回执里那个位置永远是一句话
  // 议程。内核的 `open({title})` 已经存在（字符串、空白归 null、非字符串具名拒并带 typeof），这一面只做**声明 + 只在
  // 传了时透传** + 读回：不在这里做第二次空白归一以外的加工，也不给没传的会议编一个标题。
  let title = null
  if (args.title !== undefined && args.title !== null) {
    if (typeof args.title !== 'string') {
      throw refuse('VMU_INVALID_ARGUMENT', 'title must be a string; got ' + typeof args.title,
        'pass title:"<a short name for this meeting>" or omit it (the agenda stays as the subject)')
    }
    const trimmed = args.title.trim()
    title = trimmed === '' ? null : trimmed
  }
  const at = has(args.at) ? args.at : null
  // ★★ LIVE RUN 30, finding b-1: WITHOUT an id parameter the "one visible name, one meeting" rule was only enforceable
  // in ONE direction. The service mints `mN`, so a caller of THIS face could never name a meeting — the reverse collision
  // (a service meeting squatting on a primitive id) was inexpressible and therefore unverifiable, and the primitive-side
  // hint ("choose another id") was advice this face could not follow. `id` now optionally names the meeting; the kernel
  // service refuses an id the other registry holds, BY NAME and naming that table.
  const wantedId = (has(args.id) && String(args.id).trim() !== '') ? str(args.id).trim() : null
  const opened = kernel.meetings.open({ ...(wantedId !== null ? { id: wantedId } : {}), type, chair: member, actor: member, roster, materials: str(args.agenda), secretary,
    subject: subject === null || subject === undefined ? null : subject, at, title })
  // ★ 可读回的事实：预约不是"一个被收下的参数"，而是会议对象的状态。`state`/`scheduledFor` 由内核回执给出，
  // 这一面只转述；`scheduleNote` 只在真的进入 scheduled 时出现（不要给立即召开的会议编一句预约说明）。
  const state = opened && opened.state !== undefined ? opened.state : null
  const scheduledFor = opened && opened.scheduledFor !== undefined ? opened.scheduledFor : null
  const scheduleNote = state === 'scheduled'
    ? '★ 这场会议是【预约】的（scheduledFor=' + String(scheduledFor) + '）：status/summary/meetingView 现在就能读，但开始时间之前任何动作都会被内核具名拒绝；到点后按法定人数转 open，或先进入等待阶段——等待期间有迟到者 attend 并凑满法定人数，那一次触碰就会让会议开始；到点的判定由内核对每次 `beat()` 跑的一趟 sweep 结算（框架没有定时器：没人 beat 的进程不会自己醒）。'
    : null
  // ★ GOAL ROUND 3 — THE RECOMMENDED PROCEDURE. A type that the rule gave a skeleton gets it in the receipt, labelled
  // `binding:'recommendation'` so no reader can mistake it for a gate; a type with no skeleton reports null and WHY
  // (nothing is invented). Steps the framework has NOT implemented are reported in `pendingSteps` rather than omitted.
  const proc = procedureFor(type)
  return { ok: true, tool: 'vibe_v5_meeting', meeting: opened && opened.meeting ? opened.meeting : opened,
    type, subject: opened && opened.subject !== undefined ? opened.subject : null,
    title: opened && opened.title !== undefined ? opened.title : title,
    procedure: proc.procedure, procedureBinding: proc.binding, procedureNote: proc.note, pendingSteps: proc.pendingSteps,
    kind, agenda: str(args.agenda), formalAgenda: args.formal_agenda === true, secretary,
    state, scheduledFor, at, scheduleNote,
    subjectGate: subjectGate ? { allowed: true, applicable: subjectGate.applicable === true, form: subjectGate.form || null,
      proofVia: subjectGate.proofVia || null, provenance: subjectGate.provenance || null,
      // ★ run-8 finding A: the gate now ADMITS a declared-only proof, so the receipt must carry the honesty the gate
      // bought — otherwise the read face would be more flattering than the decision that produced it.
      proofBasis: subjectGate.proofBasis || null,
      proofChecked: subjectGate.proofChecked === true, note: subjectGate.note || null } : null,
    enforced: enforcedOf([subjectGate]), enforcedScope: ENFORCED_SCOPE,
    note: 'the original could also PROPOSE a meeting from a non-chair seat and let the chair convene it; this face has no propose path (named gap: procedure/propose). ★★ THIS FACE ONLY CONVENES: for status/summary/snapshot/close/extend/extendlimit/proceed/lapse/ballot/speak/hand/hands/order/invite/invitedspeak/attend/flow/overrideorder use vibe_vmu_meeting { action, id } - the kernel face, which reaches the same meeting object. Measured on a full live run: an agent tried summary/close HERE, got nothing, and reported it as a missing capability; the capability existed one face over and nothing said so. ★ D9 邀请面 (this round): hand/invite/invitedspeak/order/attend now really reach a SERVICE meeting through that face — hand = a member queues itself, invite = the CHAIR puts one member or an ordered list (members:[…]) on the floor queue, order = reads the real queue back, invitedspeak = the invited voice speaks in the minutes, attend = marks a member present (an invitation NEVER marks anybody present: attendance is its own act and only it counts for the quorum). silent/end/hands stay primitive-only and the kernel face refuses them on a service meeting BY NAME. ★ A floor-order override (flow/overrideorder) still needs vmu.meetings.orderMode declared by the deployment; v5r does not declare it, so on a real run it is refused by name rather than silently ignored. ★ The recommended procedure is a RECOMMENDATION: skipping it, reordering it, or ignoring it entirely is allowed and unchecked.' }
}

/**
 * ★ PHASE 12 / D7 第二句 —— `vibe_v5_meeting_round`：按**会议类型**推进一轮，并把这一轮的工具面收窄到该类型允许的范围。
 *
 * 为什么需要一个新的驱动面：`kernel/turn.step` 的 `{tools:{allow}}` 只接受**本次调用方**给的名单，而唯一的既有调用方
 * 是 host 的 `vibe_vmu_turn`（它不接受外部策略）；中间件够不到 kernel root；服务会议没有 open/close 生命周期钩子；
 * 持久 override 又会被 host 工具自己的 `finally` 清掉（`tools/turn.js`）。所以"谁能按会议类型收窄"这件事，只能由一个
 * **知道自己正在为哪场会是哪类型**的驱动者来做 —— 那就是这个 pack 工具。
 *
 * 三条语义（每一条都有门禁）：
 *   · 只**收窄**：allow 是「身份可见表 ∩ pack 声明的类型允许集」，读不到身份面就具名拒（不猜、不扩权）；
 *   · 未声明收窄的类型**具名决定走默认**（不设 override），不是空集；
 *   · 收窄后为空 ⇒ 具名拒（空工具面是坏配置，不是"严格"）。
 * 主席**不收窄**：他要在会议里维持秩序（关会、流程、投票箱），那是他的席位职责，不是议题内容。
 */
// ★ PHASE 12 / 2026-10-25 (the first REAL multi-agent run, the institute's own diagnosis): this handler called
// `kernel.turn.step(...)` WITHOUT awaiting it. `step` is async, so the handler returned a PROMISE, which the tool funnel
// serialised as `turn:{}` — the round looked "done" while the member turn was still opening, and the store kept that turn
// "in progress" so every later round was refused. A caller-played turn hid this (the seam hands the prompt back anyway);
// a real subagent turn made it a HANG. The handler is async and the step is awaited; the narrowing is still cleared in
// the `finally`, which now runs after the step has actually settled.
async function toolMeetingRound(args = {}, { kernel } = {}) {
  const meeting = str(args.meeting || args.id || '')
  if (meeting === '') throw refuse('VMU_INVALID_ARGUMENT', 'meeting_round needs the meeting id', 'pass meeting:"<id>" — the id vibe_v5_meeting returned when the meeting was opened')
  // 未知会议 ⇒ 内核具名拒（原样透出，这一层不重新解释）。
  const viewed = kernel.meetings.meetingView({ meeting })
  const type = viewed && viewed.type ? String(viewed.type) : 'ordinary'
  const chair = viewed && viewed.chair ? String(viewed.chair) : null
  // 成员名单：显式给了就用；没给就取"全部在册 live 成员 − 主席"。空集不静默跳过，而是具名拒。
  const live = membersOf(kernel).roster().filter((m) => m.state === 'live').map((m) => m.id)
  let ids
  if (args.members !== undefined) {
    if (!Array.isArray(args.members)) throw refuse('VMU_INVALID_ARGUMENT', 'members must be an array of member ids', 'pass members:["r-1","r-2"] or omit it (defaults to every live member except the chair)')
    ids = args.members.map((m) => String(m && typeof m === 'object' ? (m.id === undefined ? '' : m.id) : m)).filter((id) => id !== '')
    if (ids.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'members was given but names nobody', 'pass at least one member id, or omit members to use the default set')
  } else {
    ids = live.filter((id) => id !== chair)
  }
  if (ids.length === 0) {
    throw refuse('VMU_STATE', '这一轮没有可推进的成员：名册 ' + live.length + ' 人，主席 ' + String(chair) + '，去掉主席后为空',
      '先让成员 attend/在册，或用 members:[…] 明确点名这一轮由谁发言')
  }
  const face = meetingTypeFace(type)
  const applied = applyMeetingTypeFace({ kernel, type, members: ids, refuse })
  let step = null
  let failure = null
  try {
    step = await kernel.turn.step({ members: ids.map((id) => ({ id })), phase: str(args.phase || 'meeting'), why: str(args.why || '') })
  } catch (err) {
    failure = err
  } finally {
    // override 是**这一轮**的：无论 step 成功还是失败都要撤掉，否则会影响下一个回合（那不是"收窄"，是留后门）。
    applied.clear()
  }
  if (failure) {
    if (failure && typeof failure === 'object') {
      failure.narrowing = { type, narrowed: face.narrowed === true, reason: face.reason, members: applied.rows }
    }
    throw failure
  }
  return {
    ok: true, tool: 'vibe_v5_meeting_round', meeting, type, chair, phase: str(args.phase || 'meeting'),
    narrowed: face.narrowed === true, narrowing: { type, narrowed: face.narrowed === true, reason: face.reason, expected: face.allow, members: applied.rows },
    members: ids, turn: step,
    note: face.narrowed === true
      ? '★ 这一轮按会议类型收窄了成员工具面：下发的是「身份可见表 ∩ pack 声明的允许集」，不是手写名单 —— 只能变小。主席不在收窄范围内（他要维持会议秩序）。override 已在 finally 撤掉，不影响下一轮。'
      : '这一轮**没有**按会议类型收窄（' + face.reason + '）：工具面等于该成员的身份面。',
  }
}

// ── ★ R18-B2: THE PUBLIC BLUEPRINT (提案 → 落成 → 读到"哪一版在生效 / 多久没动") ────────────────────────────────────
// THE DEFECT: `vmu.turn.protocolPath` had two prompt interpolations and NO writer — the blueprint was a path with no
// edit right attached: nobody could propose a revision, nobody could decide which one is in force, and nobody could
// tell when the one in force was last touched. The carrier is `./blueprint.js` (a `records` track, declared in
// `settings/defaults.json`), and this handler is its REACHABLE consumer (red line ④: no mechanism without one).
//
// WHO MAY DO WHAT IS PACK POLICY, IN ONE PLACE: any live member may `propose` (a draft is not in force), ONLY the chair
// slot may `adopt` (`BLUEPRINT_ADOPT_SLOT` in `./blueprint.js`, compared against the roster row — the kernel never learns
// the name, same rule as `PAPER_CONSULT_ROLES`). Staleness is a SIGNAL: `state` reports `updatedAt/ageMs/stale`; nothing
// here refuses because a blueprint is old (a reminder that blocks work is a gate nobody asked for).
function toolBlueprint(args = {}, { kernel } = {}) {
  const action = str(args.action || 'state').trim()
  const records = recordsOf(kernel)
  const pathFromArg = has(args.path) ? str(args.path).trim() : ''
  const pathFromSetting = str((settingsOf(kernel) || {})[BLUEPRINT_PATH_KEY] || '').trim()
  const path = pathFromArg || pathFromSetting
  if (path === '') {
    throw refuse('VMU_INVALID_ARGUMENT', '没有蓝图路径：既没传 path，部署也没声明 ' + BLUEPRINT_PATH_KEY,
      'pass path:"Shared/Protocol.md"（或让部署声明 ' + BLUEPRINT_PATH_KEY + '）—— 蓝图按路径分账，路径不明就无从读、也无从提案')
  }
  const pathSource = pathFromArg !== '' ? 'argument' : 'setting:' + BLUEPRINT_PATH_KEY
  if (action === 'state') {
    const state = blueprintState({ records, path })
    return Object.assign({}, state, {
      tool: 'vibe_v5_blueprint', action, pathSource,
      readSurface: 'vibe_v5_read_library { track: "' + BLUEPRINT_TRACK + '" }',
      note: state.hasCurrent === false
        ? '该路径上还没有生效版本：先 propose（任何成员）再由主席席 adopt。'
        : (state.stale === true
          ? '★ 蓝图已超期（提示，不是拒绝）：' + Math.round(state.staleAfterMs / 86400000) + ' 天内没有更新，建议按协议复查后提案。'
          : '蓝图为现行版本；成稿读面见 readSurface。'),
    })
  }
  if (action === 'read') {
    const wanted = str(args.id || args.draft || '').trim()
    const read = readBlueprint({ records, id: wanted })
    return { ok: read.ok, tool: 'vibe_v5_blueprint', action, path, pathSource, id: read.id, status: read.status || null, revision: read.revision || null, fields: read.fields, text: read.text, problems: read.problems, title: read.row && read.row.title }
  }
  if (action === 'propose') {
    const member = requireSeat(kernel, args.member || args.by, 'blueprint (proposal)')
    const text = str(args.text || args.body || '').trim()
    if (text === '') {
      throw refuse('VMU_INVALID_ARGUMENT', '蓝图提案需要正文 text',
        'pass text:<完整的一版蓝图> —— 空提案等于悄悄落成"什么都没有"')
    }
    const proposed = proposeBlueprint({ records, path, text, by: String(member.id), note: str(args.note || '') })
    const state = blueprintState({ records, path })
    return Object.assign({}, proposed, {
      tool: 'vibe_v5_blueprint', pathSource, member: String(member.id),
      inForce: state.current,
      draftsWaiting: state.draftsWaiting,
      note: '★ 草案已登记但**没有生效**：只有主席席可以 adopt（机构政策：' + BLUEPRINT_ADOPT_SLOT + ' 席）。',
    })
  }
  if (action === 'adopt') {
    const member = requireChairSeat(kernel, args.member || args.by, 'blueprint (adoption)')
    const draft = str(args.draft || args.id || '').trim()
    if (draft === '') {
      throw refuse('VMU_INVALID_ARGUMENT', '落成蓝图需要指名哪一份草案（draft）',
        'pass draft:<proposal id>；state 的 drafts[] 列出在等的草案（含 revision 与提案人）')
    }
    const adopted = adoptBlueprint({ records, path, draft, by: String(member.id), note: str(args.note || '') })
    return Object.assign({}, adopted, {
      tool: 'vibe_v5_blueprint', pathSource, member: String(member.id),
      readSurface: 'vibe_v5_read_library { track: "' + BLUEPRINT_TRACK + '" }',
    })
  }
  throw refuse('VMU_INVALID_ARGUMENT', 'unknown blueprint action: ' + action,
    'actions: state（读现行版/草案/超期）| propose（任何成员提案）| adopt（主席席落成）| read（按 id 读一版）')
}

const MOTION_KINDS = Object.freeze(['topic', 'procedural', 'resolution'])
/** ★ `vibe_v5_motion` — raise a motion inside an ONGOING meeting, or WITHDRAW your own. The kernel's meeting face has
 * `motion()`, `second()` and `withdraw()` (PHASE 7 round 6); this tool is the pack-side path to all three. */
function toolMotion(args = {}, { kernel } = {}) {
  const op = has(args.op) ? str(args.op) : ''
  if (!has(args.meeting)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs the meeting id', 'take it from vibe_v5_meeting\'s receipt')
  if (op === 'withdraw') {
    if (!has(args.motion_id) && !has(args.motion)) throw refuse('VMU_INVALID_ARGUMENT', 'withdraw needs the motion id', 'pass motion_id:"<motion id from vibe_v5_motion>"')
    const who = requireVoter(kernel, args.member, 'motion withdraw').id
    const w = kernel.meetings.withdraw({ meeting: str(args.meeting), motion: str(args.motion_id || args.motion), member: who })
    if (w && w.ok === false) throw refuse(w.code || 'VMU_CONFLICT', w.message || 'the meeting face refused this withdrawal', w.hint || null)
    return { ok: true, tool: 'vibe_v5_motion', op: 'withdraw', meeting: str(args.meeting), motion: w && (w.motion || args.motion_id), status: w && w.status, receipt: w && w.receipt }
  }
  if (!has(args.kind)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs a kind', 'the original offered: ' + MOTION_KINDS.join(', '))
  if (!MOTION_KINDS.includes(str(args.kind))) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown motion kind: ' + str(args.kind), 'the original offered: ' + MOTION_KINDS.join(', '))
  }
  if (!has(args.text)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs its text', 'pass text:"the motion as stated"')
  const member = requireVoter(kernel, args.member, 'motion').id
  const made = kernel.meetings.motion({ meeting: str(args.meeting), member, kind: str(args.kind), text: str(args.text) })
  // the face's `motion()` receipt may not carry the status; read the meeting's OBSERVABLE view for it instead of
  // inventing "proposed" — the state machine is the kernel's and this tool only reports it.
  const motionId = made && (made.motion || made.id)
  const view = made && made.status === undefined && typeof kernel.meetings.meetingView === 'function'
    ? kernel.meetings.meetingView({ meeting: str(args.meeting) }) : null
  const row = view && Array.isArray(view.motions) ? view.motions.filter((x) => String(x.id) === String(motionId))[0] : null
  return { ok: true, tool: 'vibe_v5_motion', meeting: str(args.meeting), motion: motionId, kind: str(args.kind), text: str(args.text),
    status: (made && made.status) || (row && row.status) || null,
    note: 'a new motion starts `proposed` and needs a SECOND (vibe_v5_second) before it can be voted — the kernel models that window' }
}

/** ★ `vibe_v5_second` — second a proposed motion. The kernel's meeting face models the second state (secondedBy + the
 * proposed gate, PHASE 7 round 6), including the original's "the proposer cannot second their own motion" rule. */
function toolSecond(args = {}, { kernel } = {}) {
  if (!has(args.motion_id)) throw refuse('VMU_INVALID_ARGUMENT', 'second needs motion_id', 'pass motion_id:"<motion id from vibe_v5_motion>"')
  if (!has(args.meeting)) throw refuse('VMU_INVALID_ARGUMENT', 'second needs the meeting id', 'the second state lives on the meeting; take the id from vibe_v5_meeting\'s receipt')
  const member = requireVoter(kernel, args.member, 'second').id
  const s = kernel.meetings.second({ meeting: str(args.meeting), motion: str(args.motion_id), member })
  if (s && s.ok === false) throw refuse(s.code || 'VMU_CONFLICT', s.message || 'the meeting face refused this second', s.hint || null)
  return { ok: true, tool: 'vibe_v5_second', meeting: str(args.meeting), motion: s && s.motion, status: s && s.status, secondedBy: s && s.secondedBy, receipt: s && s.receipt }
}

/**
 * ★ `vibe_v5_poll_open` — open an option-type poll board, TRANSLATING the original's per-poll rules into the kernel's
 * per-BOX `rules` object (PHASE 7 round 6 added it: `ballotbox.open({question, options, rules})`, where the allowed rule
 * keys are minVotes / allowRevote / maxChoices / minChoices / mode). Rule names are the KERNEL's, not guessed:
 *   · `min_votes`     → rules.minVotes        (integer ≥ 0)
 *   · `max`           → rules.maxChoices      (integer ≥ 1)
 *   · `min`           → rules.minChoices      (integer ≥ 1)
 *   · `mode`          → rules.mode            (single|multi)
 *   · `allow_revote`  → rules.allowRevote     (boolean)
 *   · `secret` / `allow_abstain` have NO per-box rule in this kernel (secrecy and abstention are deployment-level), so
 *     they stay in `unapplied` with that reason — asked-vs-applied stays explicit.
 */
function toolPollOpen(args = {}, { kernel } = {}) {
  if (!has(args.question)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs a question', 'pass question:"…"')
  const options = Array.isArray(args.options) ? args.options.map(String).filter((x) => x !== '') : []
  if (options.length < 2) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs at least two options', 'pass options:["A","B"] (the ballot box refuses <2 by name)')
  requireChairSeat(kernel, args.member, 'poll_open')
  if (!kernel.ballotbox || typeof kernel.ballotbox.open !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no ballot box face is published, so a poll cannot be opened', 'assemble a kernel with the ballot box service')
  }
  const rules = {}
  const appliedMap = [['min_votes', 'minVotes'], ['max', 'maxChoices'], ['min', 'minChoices'], ['mode', 'mode'], ['allow_revote', 'allowRevote']]
  for (const [from, to] of appliedMap) if (args[from] !== undefined) rules[to] = args[from]
  const hasRules = Object.keys(rules).length > 0
  const opened = kernel.ballotbox.open({ question: str(args.question), options, ...(hasRules ? { rules } : {}) })
  if (opened && opened.ok === false) {
    throw refuse(opened.code || 'VMU_CONFLICT', opened.message || 'the ballot box refused to open with these rules', opened.hint || null)
  }
  const unapplied = ['secret', 'allow_abstain'].filter((k) => args[k] !== undefined)
    .map((k) => ({ rule: k, why: 'this kernel has no per-box ' + (k === 'secret' ? 'secrecy' : 'abstention') + ' rule: it is a deployment-level ballot policy, not a per-box one' }))
  const appliedRules = ['min_votes', 'max', 'min', 'mode', 'allow_revote'].filter((k) => args[k] !== undefined)
  return { ok: true, tool: 'vibe_v5_poll_open', boxId: opened && opened.boxId, question: str(args.question), options,
    rulesDeclared: !!(opened && opened.rulesDeclared), rules: (opened && opened.rules) || {},
    applied: appliedRules, unapplied,
    note: unapplied.length > 0
      ? 'the rules named in unapplied have NO per-box form in this kernel — reported, not silently dropped'
      : (hasRules ? 'every asked rule was translated into the kernel per-box rules object' : 'no per-poll rules were asked for; the box uses the deployment\'s declared ballot policy') }
}

/** ★ `vibe_v5_poll_vote` — cast an option-type vote. ① lands here (non-voter refused by name). `choices[]` is
 * forwarded as the face's ranked/multi list; `abstain` rides on the face's explicit abstention. */
function toolPollVote(args = {}, { kernel } = {}) {
  if (!has(args.ballot_id)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_vote needs ballot_id', 'take it from vibe_v5_poll_open\'s receipt (this face has no "the open board" default)')
  const member = requireVoter(kernel, args.member, 'poll_vote').id
  const choices = Array.isArray(args.choices) ? args.choices.map(String) : null
  if (!choices && !has(args.choice) && args.abstain !== true) {
    throw refuse('VMU_INVALID_ARGUMENT', 'poll_vote needs choices[], a choice, or abstain:true', 'the original required one of them')
  }
  if (!kernel.ballotbox || typeof kernel.ballotbox.cast !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no ballot box face is published, so a vote cannot be cast', 'assemble a kernel with the ballot box service')
  }
  const castArgs = { boxId: str(args.ballot_id), by: member }
  if (has(args.note)) castArgs.note = str(args.note)
  if (choices) castArgs.choices = choices
  else if (has(args.choice)) castArgs.choice = str(args.choice)
  if (args.abstain === true) castArgs.abstain = true
  const r = kernel.ballotbox.cast(castArgs)
  if (r && r.ok === false) {
    throw refuse(r.code || 'VMU_CONFLICT', (r.message || 'the ballot box refused this vote'), (r.hint || 'see the ballot box refusal'))
  }
  return { ok: true, tool: 'vibe_v5_poll_vote', ballotId: str(args.ballot_id), member, receipt: r,
    note: 'the vote right is the PACK\'s: only the permanent seats (chair/member) may vote here — the box itself does not check who `by` is' }
}

/** ★ `vibe_v5_poll_close` — close and tally. The floor is the box's own (`vmu.ballot.minVotes`/ratio): when unmet the
 * face refuses by name and this handler RE-THROWS that code with the original wording, so "the ballot did not count"
 * is a named result, never a quiet settled:false dressed as success. */
function toolPollClose(args = {}, { kernel } = {}) {
  if (!has(args.ballot_id)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_close needs ballot_id', 'take it from vibe_v5_poll_open\'s receipt')
  requireChairSeat(kernel, args.member, 'poll_close')
  if (!kernel.ballotbox || typeof kernel.ballotbox.close !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no ballot box face is published, so a poll cannot be closed', 'assemble a kernel with the ballot box service')
  }
  let r = null
  try {
    r = kernel.ballotbox.close({ boxId: str(args.ballot_id) })
  } catch (e) {
    if (e && e.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET') {
      throw refuse('VMU_BALLOT_MIN_VOTES_NOT_MET', '本次投票【不成立】：已投数未达到门槛 min_votes（原版 §7.1：min_votes 是"这次投票是否算数"的门槛，不是法定人数 m）: ' + String(e.message || ''),
        'the ballot did not count; gather more votes and close again, or state the threshold the deployment declares (vmu.ballot.minVotes)')
    }
    throw e
  }
  if (r && r.ok === false) {
    const code = r.code || 'VMU_CONFLICT'
    if (code === 'VMU_BALLOT_MIN_VOTES_NOT_MET') {
      throw refuse(code, '本次投票【不成立】：已投数未达到门槛 min_votes（它不是法定人数 m）: ' + String(r.message || ''), 'gather more votes, or restate the deployment threshold')
    }
    throw refuse(code, r.message || 'the ballot box refused this close', r.hint || 'see the ballot box refusal')
  }
  return { ok: true, tool: 'vibe_v5_poll_close', ballotId: str(args.ballot_id), result: r && (r.outcome !== undefined ? r.outcome : r.result), tally: r && r.tally, receipt: r }
}

/** ★ `vibe_v5_verdict` — a boolean verdict on the object under verification ([0,1]: 1 true, 0 false, between = an
 * UNCERTAIN probability). The vmu verification ballot is a LIVE ballot (`kernel.liveBallot(id)`), so this resolves
 * `target` through it; no such live ballot is a NAMED refusal rather than an invented ballot. */
function toolVerdict(args = {}, { kernel } = {}) {
  if (args.verdict === undefined || args.verdict === null) throw refuse('VMU_INVALID_ARGUMENT', 'verdict needs a number in [0,1]', 'pass verdict:1 / 0 / a probability')
  const v = Number(args.verdict)
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw refuse('VMU_INVALID_ARGUMENT', 'verdict must be a number in [0,1]', '1 = true, 0 = false, anything else = an UNCERTAIN estimate')
  }
  if (!has(args.target)) throw refuse('VMU_INVALID_ARGUMENT', 'verdict needs the target ballot id', 'pass target:"<live ballot id>"')
  const member = requireVoter(kernel, args.member, 'verdict').id
  if (typeof kernel.liveBallot !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no live-ballot registry is published, so a verdict cannot be cast', 'assemble a full kernel (vibe-math-vmu.js)')
  }
  const ballot = kernel.liveBallot(str(args.target))
  if (!ballot || typeof ballot.cast !== 'function') {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no LIVE ballot with id ' + str(args.target), 'the ballot must be open; the original cast verdicts on the object under verification')
  }
  const r = ballot.cast(member, v, { kind: v === 1 || v === 0 ? 'decisive' : 'estimate' })
  if (r && r.ok === false) throw refuse(r.code || 'VMU_CONFLICT', r.message || 'the ballot refused this verdict', r.hint || 'see the ballot refusal')
  return { ok: true, tool: 'vibe_v5_verdict', target: str(args.target), member, verdict: v,
    kind: v === 1 || v === 0 ? 'decisive' : 'estimate', receipt: r }
}

// ── ㉗–㊲ FIFTH/SIXTH BANDS: lifecycle, configuration, and the Lean five ─────────────────────────────────────
/**
 * ★ THE LEAN QUESTION, ANSWERED FROM CODE (PHASE 7 round 6): the kernel DOES have a real Lean executor, but it is
 * CONDITIONAL on the host's `spawn` seam:
 *   · kernel/index.js:679 — `const lean = spawn ? createLeanFace({...}) : null` ⇒ an assembly without a spawn seam
 *     (a bare kernel, or the local fixture context) has NO Lean face;
 *   · kernel/formal.js:151 — `formal.check` really calls `spawn({ file: leanCommand, args, stdin, timeoutMs })` and
 *     REFUSES BY NAME when the seam is missing (`VMU_EXTERNAL_UNAVAILABLE`, "本面绝不假跑");
 *   · kernel/lean.js:882 — the face's API is `submit / status / list / settle / archive / read / lib / cancel /
 *     recover / dispose / admission …`, i.e. a JOB QUEUE with Formal/Jobs mirrors, states
 *     queued|running|settled|failed|timeout|interrupted, and archive kinds def|lemma|theorem|assumption.
 * ⇒ these five tools CALL that face and never start a process themselves: how it spawns / times out / cancels is the
 * face's business (vmu.math.leanCommand, vmu.math.leanTimeoutMs, cancel() with the killable handle). A face-less
 * assembly is a NAMED refusal, never a pretend run.
 */


/** ★ `vibe_v5_start` — found the institute: start the kernel, seat the academician, and seat N researchers. The
 * original also carried problem/seedDirections; a member's direction is roster DATA here, so it is reported. */
async function toolStart(args = {}, { kernel } = {}) {
  const n = Number.isInteger(args.researcherCount) ? args.researcherCount : 3
  if (n < 0 || n > 50) throw refuse('VMU_INVALID_ARGUMENT', 'researcherCount must be between 0 and 50', 'the original seeded a small permanent staff')
  const hired = []
  if (args.academician !== false) {
    await membersOf(kernel).hire({ id: 'r-acad', slot: 'chair' })
    hired.push('r-acad')
  }
  for (let i = 1; i <= n; i += 1) {
    await membersOf(kernel).hire({ id: 'r-' + i, slot: 'member' })
    hired.push('r-' + i)
  }
  const started = typeof kernel.start === 'function' ? await kernel.start() : null
  const applied = []
  if (has(args.problem)) applied.push(applyDeclaredSetting(kernel, 'vmu.turn.objective', str(args.problem)))
  return { ok: true, tool: 'vibe_v5_start', hired, started, applied,
    note: 'seedDirections are roster data here (the charter reads a member\'s direction), so they are not stored by this tool — reported, not silently dropped' }
}

/** ★ `vibe_v5_stop` / `vibe_v5_pause` — the kernel's own control state, not a second one. */
async function toolStop(args = {}, { kernel } = {}) {
  if (typeof kernel.stop !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no stop()', 'assemble a full kernel (vibe-math-vmu.js)')
  const r = await kernel.stop(has(args.reason) ? str(args.reason) : 'vibe_v5_stop')
  return { ok: true, tool: 'vibe_v5_stop', receipt: r, note: 'the kernel\'s control state is the only one; nothing here starts child sessions' }
}
async function toolPause(args = {}, { kernel } = {}) {
  if (typeof kernel.pause !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no pause()', 'assemble a full kernel (vibe-math-vmu.js)')
  try {
    const r = await kernel.pause(has(args.reason) ? str(args.reason) : 'paused by vibe_v5_pause')
    return { ok: true, tool: 'vibe_v5_pause', receipt: r }
  } catch (e) {
    // ★ G6 tier 2 (UX): "named but no way forward". The kernel refuses VMU_STATE with no hint; the tool layer owes
    // the caller a ROUTE (the reciprocal action + the read path) or an explicit statement that none exists.
    if (e && e.code === 'VMU_STATE' && !e.hint) e.hint = 'nothing was paused: the kernel is stopped (terminal) — read the control state with vibe_vmu_control {action:"status"} (fields state/pausedReason/stops); a stopped institute cannot be resumed, start a fresh one with vibe_v5_start'
    throw e
  }
}
/** ★ `vibe_v5_resume` — un-pause through the kernel's CONTROL-FLOW face. NOTE the name collision measured in
 * `kernel/index.js:1935-1941`: `kernel.resume(reason)` IS the control-flow counterpart of `pause()`; the DURABILITY
 * projection is `kernel.recovery` / `kernel.resumeService`. This handler used to call
 * `kernel.controlService.resume({...})`, which is the SCOPE-LEVEL approval resume — it answered ok while the kernel
 * stayed paused (measured in the A1 probe: `controlState.state === 'paused'`, `resumes:0`), so meetings and ballots
 * could not be opened after a pause. One state, one writer. */
async function toolResume(args = {}, { kernel } = {}) {
  if (!kernel || typeof kernel.resume !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no control-flow resume()', 'assemble a full kernel (vibe-math-vmu.js)')
  }
  try {
    const r = await kernel.resume(has(args.reason) ? str(args.reason) : undefined)
    return { ok: true, tool: 'vibe_v5_resume', receipt: r,
      note: 'resumed through the kernel control state (the durability projection is kernel.recovery, never used here)' }
  } catch (e) {
    if (e && e.code === 'VMU_STATE' && !e.hint) e.hint = 'nothing was resumed: the kernel is NOT in the paused state (it may be running or stopped) — read the control state with vibe_vmu_control {action:"status"} (field state); pause with vibe_v5_pause first if that is the intent, and note that a STOPPED kernel is terminal (start a fresh one with vibe_v5_start)'
    throw e
  }
}

/** Apply ONE declared setting through the kernel's guarded writer and report the hot level it declares. Shared body of
 * configure/set/start so the H1/H2 wording is written exactly once. */
/**
 * ★ LIVE RUN 20 (its residual 1) — THE DECLARATION IS THE FACE'S PROMISE, SO THE FACE MUST KEEP IT.
 * `vibe_v5_set` describes `value` as 「新值（按声明的类型解析：布尔/数字/JSON 数组或对象/字符串）」, so a caller who reads
 * that sentence passes `"8000"` — a STRING — and the kernel guard then refuses it (`expected an integer >= 0`), which
 * is correct at the guard's layer (it only judges JSON types) and wrong at the face's (it promised to parse). The
 * institute caught the contradiction in its run-20 report and it was right: two layers, one sentence.
 *
 * The face now parses, for declarations that are not text themselves:
 *   · natural / integer / positiveInteger / number / percentage / ratio — "8000" ⇒ 8000, "8.5" ⇒ 8.5
 *   · boolean — "true"/"false"/"1"/"0" ⇒ true/false
 *   · object / objectList / stringList / list-ish — a JSON string ⇒ JSON.parse once
 * A string that cannot be parsed is NOT guessed at: it is refused HERE, naming the declared type and the input, so the
 * caller is never told "expected an integer" about a value it never saw.
 */
function coerceDeclaredValue(def, value) {
  if (typeof value !== 'string') return value
  const t = String(def && def.type ? def.type : '')
  const TEXT_TYPES = ['string', 'path', 'enum']
  if (TEXT_TYPES.includes(t)) return value
  const s = value.trim()
  if (['natural', 'integer', 'positiveInteger', 'number', 'percentage', 'ratio'].includes(t)) {
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
    throw refuse('VMU_INVALID_ARGUMENT', 'setting ' + def.key + ' is declared ' + t + ' but the value is the text ' + JSON.stringify(value),
      'pass a JSON NUMBER (pass ' + (s === '' ? '8000' : '8000') + ', not "8000") — the face parses a numeric string, but ' + JSON.stringify(value) + ' is not one')
  }
  if (t === 'boolean') {
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
    throw refuse('VMU_INVALID_ARGUMENT', 'setting ' + def.key + ' is declared boolean but the value is the text ' + JSON.stringify(value),
      'pass true or false (JSON booleans), or the text "true"/"false"')
  }
  // Everything structured: one JSON.parse, and a refusal that says the text was not JSON.
  try {
    return JSON.parse(s)
  } catch {
    throw refuse('VMU_INVALID_ARGUMENT', 'setting ' + def.key + ' is declared ' + t + ' but the value is not JSON: ' + JSON.stringify(value),
      'pass the structure itself (a JSON array/object) or its JSON text')
  }
}

function applyDeclaredSetting(kernel, key, value, opts = {}) {
  const def = typeof kernel.settingDef === 'function' ? kernel.settingDef(key) : null
  if (!def) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown setting: ' + key,
      'only DECLARED keys are settable (settings/schema.js); the kernel refuses an undeclared key by name')
  }
  if (def.hot === 'H3') {
    throw refuse('VMU_NOT_PERMITTED', 'setting ' + key + ' is H3 (read-only at runtime)',
      'the declaration owns its hot level; an H3 key cannot be written by any face')
  }
  if (typeof kernel.setSettingsValue !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no settings writer', 'assemble a full kernel (vibe-math-vmu.js)')
  }
  // THE OWNER IS THE DECLARATION'S: the kernel's settings guard refuses a `by` that is not the key's declared owner
  // (`settingsGuard`: declared key, H3 read-only, declared owner). A pack tool has no human identity, so it acts AS the
  // declared owner and records that in the receipt instead of inventing an actor.
  // ★ The FACE keeps its declaration's promise before the guard judges the value (run 20 residual 1).
  const coerced = coerceDeclaredValue(def, value)
  const actor = opts.by || def.who || null
  const receipt = kernel.setSettingsValue(key, coerced, { by: actor, reason: opts.reason || null })
  // ★ LIVE RUN 7 (agent feedback item g): this used to RE-INVENT the applicability with its own rule
  // (`hot === 'H1' ? '立即生效' : '重启后生效'`, and `restartRequired = hot !== 'H1'`), which contradicted the kernel's own
  // receipt two lines below it. Measured on the run: setting `vmu.turn.leaderId` (declared H2) came back with
  // `applied:"immediate"`, `liveReadBy:['kernel/prompt …']` AND `restartRequired:['vmu.turn.leaderId']` in the same
  // object, while the very next turn assembly already used the new value. The kernel already answers this question
  // correctly - `requiresRestart = hot === 'H2' && liveReaders.length === 0` (kernel/index.js:2847) - so the pack now
  // CARRIES the kernel's answer instead of computing a second, contradictory one.
  const kApplied = receipt && receipt.applied !== undefined ? receipt.applied : null
  const kRestart = !!(receipt && receipt.requiresRestart === true)
  return { key, value: coerced, hot: def.hot, who: def.who || null, appliedBy: actor,
    applied: kApplied,
    requiresRestart: kRestart,
    appliesAt: receipt && receipt.appliesAt !== undefined ? receipt.appliesAt : null,
    liveReadBy: receipt && Array.isArray(receipt.liveReadBy) ? receipt.liveReadBy : [],
    effective: String(def.hot) + (kRestart ? '（需重启的读取者，见 appliesAt）' : '（本会话内即可读到，见 appliesAt）'),
    receipt }
}

/** ★ `vibe_v5_configure` — create/configure the institute WITHOUT starting it: every value goes through the declared
 * setting writer, so an undeclared key is refused by name (never stored "for later"). */
function toolConfigure(args = {}, { kernel } = {}) {
  const applied = []
  if (has(args.institute)) applied.push(applyDeclaredSetting(kernel, 'vmu.turn.instituteName', str(args.institute), { reason: 'vibe_v5_configure' }))
  if (has(args.problem)) applied.push(applyDeclaredSetting(kernel, 'vmu.turn.objective', str(args.problem), { reason: 'vibe_v5_configure' }))
  if (args.params !== undefined && args.params !== null) {
    if (typeof args.params !== 'object' || Array.isArray(args.params)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'configure params must be an object of {declared key: value}', 'pass params:{"vmu.turn.instituteName":"…"}')
    }
    for (const [k, v] of Object.entries(args.params)) {
      applied.push(applyDeclaredSetting(kernel, k, v, { reason: 'vibe_v5_configure params' }))
    }
  }
  if (applied.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'configure needs something to set', 'pass institute/problem/params (the original needed at least one)')
  // The partition comes from the KERNEL receipt (`requiresRestart`), never from the hot letter: an H2 key that a live
  // reader measures (e.g. `vmu.turn.leaderId` read by the prompt assembler) is readable in THIS session, and the kernel
  // already says so. Reporting it as "restart required" is the contradiction run 7 caught.
  const restarts = applied.filter((a) => a.requiresRestart === true)
  const liveNow = applied.filter((a) => a.requiresRestart !== true)
  return { ok: true, tool: 'vibe_v5_configure', applied,
    restartRequired: restarts.map((a) => a.key),
    appliesNow: liveNow.map((a) => a.key),
    note: restarts.length > 0
      ? 'the keys in restartRequired have NO measured live reader (kernel receipt `requiresRestart`), so they take effect on restart; the keys in appliesNow are already readable in this session - read `appliesAt` on each entry instead of inferring from the hot letter'
      : 'every key applied here is readable in this session (kernel receipt `requiresRestart` is false for each); `appliesAt` names the granularity of the readers - the hot letter alone does not decide when a value is seen' }
}

/** ★ `vibe_v5_set` — one declared key. Same guarded writer, same hot-level wording. */
function toolSet(args = {}, { kernel } = {}) {
  if (!has(args.key)) throw refuse('VMU_INVALID_ARGUMENT', 'set needs a key', 'pass key:"vmu.…" (a DECLARED settings key)')
  if (args.value === undefined) throw refuse('VMU_INVALID_ARGUMENT', 'set needs a value', 'pass value:… explicitly')
  const applied = applyDeclaredSetting(kernel, str(args.key), args.value, { reason: has(args.why) ? str(args.why) : 'vibe_v5_set' })
  return { ok: true, tool: 'vibe_v5_set', applied, effective: applied.effective }
}

/**
 * ★★ GOAL ROUND 3 — `vibe_v5_paper`: THE PAPER SUBSYSTEM'S RUNTIME ENTRY (the read point that was missing).
 *
 * WHY THIS FACE EXISTS. `packs/v5r/paper.js` exports `createPaperSubsystem` and `kit/paper.js` holds the whole flow
 * (writing → reviewing → awaiting-editor → finalized, the fingerprint guard, md/tex/meta/pdf), but NOTHING in production
 * ever called it: `paper.start` appeared only in unit tests. A member could neither open nor advance a paper, so the
 * paper mechanism was "complete but unreachable". This face is the missing entry — and the ONLY thing it does is map
 * arguments onto the subsystem's own methods.
 *
 * THE FACE ADDS NO POLICY OF ITS OWN (hard rule):
 *   · no stage checks here (before-writing, out-of-order advance, unanimous-review … are the flow's own named refusals);
 *   · no role checks here — "only the chair seat may finalise" is enforced by the flow against the KERNEL roster;
 *   · no defaults that decide a meaning (a missing `decision` reaches the flow and is refused by its own message).
 * A kernel refusal keeps its registered code and hint: the tool never rewrites one into a generic error.
 *
 * PARAMETER MAPPING (institution vocabulary → flow arguments, and nothing more):
 *   start   target|title|track · participants · editor · lang · format
 *   part    target · member · part|title · body|solution · methods · rules · limits · evidence
 *   review  target · member · deliverable (boolean) · notes · of|part
 *   advance target
 *   final   target · member · decision (deliverable|revise) · note · conclusion|body
 *   consult_state target                        ← ★ read side of the office-consult ledger (E4, see below)
 *   consult target · member|by (the ANSWERER) · request_id · answer|note   ← ★ E4: the office's answer
 *   render / status / compile / sections
 *
 * ★ E4 (真缺陷) — `consult` EXISTS SO THE GATE CAN BE SATISFIED FROM A SESSION AT ALL. `kit/paper.js` `recordConsult`
 * was reached by nothing but tests: the action table had no answer action, so `vmu.paper.officeConsult="required"` (the
 * declared v5r value) could only ever time out in a real run. Two design rules for this action:
 *   · it adds NO second policy — the answer is delegated to `paper.recordConsult`, and "who may answer" is the pack's
 *     `PAPER_CONSULT_ROLES` (pre-checked in `requireConsultAnswerer`, re-checked by the kit);
 *   · it adds NO second vocabulary — `decision` is deliberately NOT accepted here: the kit's consult has no decision
 *     enum (`deliverable|revise` belongs to `action:"final"`), so the office answers with `answer`/`note` text.
 */
async function toolPaper(args = {}, { kernel } = {}) {
  const action = str(args.action || 'status')
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the paper subsystem needs the records face, and this assembly has none',
      'assemble a kernel with the records primitive (the paper state is a record, not memory)')
  }
  const paper = createPaperSubsystem({ kernel })
  const target = str(args.target || args.title || args.track || '')
  const tool = 'vibe_v5_paper'
  switch (action) {
    case 'sections':
      return { ok: true, tool, action, sections: paper.sections() }
    case 'status': {
      const got = paper.state(target)
      // ★ G7 finding: status exposed the flow state only, while render exposed missing/complete/pdf. Same source,
      // same fields: a status reader must not have to render (which WRITES artefacts) just to learn what is missing.
      const artifacts = got && got.state && typeof paper.PaperArtifacts === 'function' ? paper.PaperArtifacts({ target }) : null
      return { ok: true, tool, action, target, exists: !!(got && got.state),
        paper: got && got.state ? got.state : null,
        missing: artifacts ? artifacts.missing : [], complete: artifacts ? artifacts.complete === true : false,
        pdf: artifacts ? artifacts.pdf : null }
    }
    case 'start': {
      const started = paper.start({
        target,
        participants: Array.isArray(args.participants) ? args.participants : undefined,
        ...(has(args.editor) ? { editor: str(args.editor) } : {}),
        ...(has(args.lang) ? { lang: str(args.lang) } : {}),
        ...(has(args.format) ? { format: str(args.format) } : {}),
      })
      return { ok: true, tool, action, started }
    }
    case 'part': {
      const part = paper.recordPart({
        target,
        member: str(args.member),
        title: str(args.part || args.title || ''),
        solution: str(args.body || args.solution || ''),
        methods: str(args.methods || ''),
        rules: str(args.rules || ''),
        limits: str(args.limits || ''),
        evidence: Array.isArray(args.evidence) ? args.evidence : [],
      })
      return { ok: true, tool, action, part }
    }
    case 'review': {
      const review = paper.recordReview({
        target,
        member: str(args.member),
        deliverable: args.deliverable,
        comments: str(args.notes || args.comments || ''),
        of: has(args.of) ? str(args.of) : (has(args.part) ? str(args.part) : null),
      })
      return { ok: true, tool, action, review }
    }
    case 'advance':
      return { ok: true, tool, action, advance: paper.advance({ target }) }
    case 'final': {
      const finalized = await paper.recordFinal({
        target,
        member: str(args.member),
        decision: str(args.decision || ''),
        note: str(args.note || ''),
        conclusion: str(args.conclusion || args.body || ''),
      })
      // Projected, not re-exported: the flow returns `artifacts`/`missing`/`pdf` sharing references, and the host's
      // serializer labels a second occurrence of the same value "[circular]". A face that hands out a receipt full of
      // "[circular]" would make a reader think the receipt is broken.
      return { ok: true, tool, action, final: {
        ok: finalized.ok === true, finalized: finalized.finalized === true, target: finalized.target,
        final: finalized.final || null,
        missing: Array.isArray(finalized.missing) ? finalized.missing.slice() : [],
        // ★ E4: the kit returns WHICH way the consult rule was satisfied ("off" / "answered" / "exempt") precisely so a
        // finalisation cannot quietly claim "the office checked it" when the gate was simply off. The projection used to
        // drop that field — i.e. the tool face hid the one piece of evidence that makes the gate's claim auditable.
        consult: finalized.consult ? {
          armed: finalized.consult.armed === true, satisfiedBy: finalized.consult.satisfiedBy || null,
          answeredBy: finalized.consult.answeredBy || null, requestId: finalized.consult.requestId || null,
          note: finalized.consult.note || null } : null,
        pdf: finalized.pdf ? { ok: finalized.pdf.ok === true, code: finalized.pdf.code || null, message: finalized.pdf.message || null,
          faceCode: finalized.pdf.faceCode || null,
          // ★ THE CAP MUST ANNOUNCE ITSELF. A caller that sees a truncated list with no marker concludes those are
          // all the engines that were tried - the same silent-truncation defect records.list and read_library had.
          // The cap stays (a receipt must stay bounded) but `triedEnginesTotal` and `triedEnginesTruncated` say so.
          ...(() => {
            const all = Array.isArray(finalized.pdf.triedEngines) ? finalized.pdf.triedEngines : []
            const capped = all.slice(0, 12)
            return { triedEngines: capped, triedEnginesTotal: all.length, triedEnginesTruncated: all.length > capped.length }
          })() } : null,
      } }
    }
    case 'render': {
      const rendered = paper.render({ target })
      const arts = rendered.artifacts || null
      return { ok: true, tool, action, target, renderOk: rendered.ok === true,
        wrote: Array.isArray(rendered.wrote) ? rendered.wrote.slice() : [],
        missing: Array.isArray(rendered.missing) ? rendered.missing.slice() : [],
        complete: arts ? arts.complete === true : false,
        present: arts && arts.present ? Object.assign({}, arts.present) : null,
        pdf: rendered.pdf ? { ok: rendered.pdf.ok === true, code: rendered.pdf.code || null,
          needsKernel: rendered.pdf.needsKernel || null, message: rendered.pdf.message || null } : null }
    }
    case 'compile': {
      const compiled = await paper.compilePdf({ target })
      return { ok: true, tool, action, compiled: {
        ok: compiled.ok === true, target: compiled.target, engine: compiled.engine || null,
        pdfPath: compiled.pdfPath || null, pdfBytes: compiled.pdfBytes || null,
        missing: Array.isArray(compiled.missing) ? compiled.missing.slice() : [],
      } }
    }
    case 'consult_state':
      // Read side (the same discipline as `order` on the meeting face): the ledger was WRITE-ONLY from the tool face, so
      // "am I still waiting, and on which request id?" was unanswerable and a stale id looked exactly like a typo.
      return { ok: true, tool, action, consult: paper.consultState({ target }) }
    case 'consult': {
      if (has(args.decision)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'consult does not take `decision` (the office answer is free text)',
          'the kit\'s recordConsult has no decision enum — `deliverable|revise` is the argument of action:"final"; pass answer:"…" + note:"…" so the answer says what was checked')
      }
      const by = str(args.member || args.by || '')
      if (!by) {
        throw refuse('VMU_INVALID_ARGUMENT', 'consult needs the member answering (the office)',
          'pass member:"<roster id>" — the paper refuses an answer with no author (an unsigned signature is not a consult answer)')
      }
      const before = paper.consultState({ target })
      const waiting = before.requests.filter((r) => r && r.status === 'awaiting')
      const wanted = str(args.request_id || args.requestId || '')
      if (wanted && !waiting.some((r) => r.id === wanted)) {
        // A wrong id is the signature of "I answered a question I remember, not the one on the table": name the waiting
        // ones instead of silently answering whichever is open (the kit would do that, and the caller would never learn).
        const e = refuse('VMU_NO_SUCH_OBJECT', 'no waiting consult request "' + wanted + '" on paper "' + before.target + '"',
          waiting.length
            ? 'answer one of the requests still waiting: ' + waiting.map((r) => r.id).join(', ')
            : 'nothing is waiting on this paper (the gate is off, or it was already answered): read action:"consult_state"')
        e.waiting = waiting.map((r) => r.id)
        throw e
      }
      requireConsultAnswerer(kernel, by)
      const answered = paper.recordConsult({ target, by, note: str(args.note || args.notes || ''),
        answer: has(args.answer) ? str(args.answer) : null })
      const after = paper.consultState({ target })
      return { ok: true, tool, action, target: after.target, consult: {
        requestId: answered.requestId, answeredBy: answered.answeredBy, answeredRole: answered.answeredRole || null,
        cleared: answered.cleared === true, answeredTotal: answered.answered, note: answered.note || null,
        // Read back through the READER, not from the write receipt: "the write said ok" is not "the gate sees an answer".
        armed: after.armed === true, awaiting: after.awaiting, latestAnswer: after.answered,
        declaredAnswerRoles: after.policy && Array.isArray(after.policy.answerRoles) ? after.policy.answerRoles.slice() : [],
      } }
    }
    default:
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown paper action: ' + action,
        'actions: start|part|review|advance|final|render|status|compile|sections|consult|consult_state')
  }
}

// ── the Lean five ──────────────────────────────────────────────────────────────────────────────────────────


/**
 * THE MANIFEST FACE. Parameter shapes are taken from the ORIGINAL `vibe-math-v5r.js` registration blocks so a
 * member's prompt and the tool schema agree — first batch: `record_*` (content/statement+value+motive+p), `say`
 * (text), `message` (to/content); second batch: `task_create` (subject/description/blocked_by/write_scopes/priority),
 * `task_list` (status/owner/ready), `task_update` (task_id/expected_revision/action/...), `hire`
 * (purpose/initial_task/direction/term/to), `report` and `overview` (no parameters); third batch: `assign`
 * (to/why/acceptance required, task_id or subject), `fire` (id/reason), `nudge` (to/why/next_step), `prioritize`
 * (order/why), `feedback` (op + the original's fields), `read_library` (member/kind/id/list/limit), and `tool_help`
 * (member optional); fourth batch: `meeting` (agenda/kind/target/formal_agenda), `motion` (op/motion_id/kind/text/
 * reason), `second` (motion_id), `poll_open` (question/options + the six §7.1 rules), `poll_vote`
 * (ballot_id/choices/abstain/note/reason), `poll_close` (ballot_id/reason), `verdict` (target/verdict/reason);
 * fifth/sixth: `start` (problem/researcherCount/academician/params/seedDirections), `stop`/`pause`/`resume`
 * (reason optional), `configure` (project/institute/problem/params), `set` (key/value/why), and the Lean five
 * (`lean_run` file/target/timeout_ms, `lean_job` jobId/waitMs, `lean_lib` refresh, `lean_read` name/kind,
 * `lean_archive` kind/name/target/content/from/note/run).
 */
export const V5R_PACK_TOOLS = Object.freeze([
  {
    name: 'vibe_v5_record_progress',
    description: 'Append to YOUR research log. track picks the file: progress (default) / routes / obstacles / rejected / state — use rejected for disproved routes and obstacles for blockers, so negative knowledge is archived in its own track. '
      + '★ The STATE panel (track:"state") has FOUR REQUIRED contents — progress (当前进度), obstacles (遇到的障碍), next (下一步计划), help (需要的帮助) — passed flat or nested under `state`; a panel missing one is refused by name with the missing keys in `missing`, and `content` is free text on top, never a substitute.',
    parameters: { content: { type: 'string' }, track: { type: 'string' }, title: { type: 'string' }, member: { type: 'string' },
      progress: { type: 'string' }, obstacles: { type: 'string' }, next: { type: 'string' }, help: { type: 'string' }, state: { type: 'object' } },
    handler: toolRecordProgress,
  },
  {
    name: 'vibe_v5_record_proposition',
    description: 'Record a proposition/lemma card in your library. REQUIRES statement, value, motive and p (your probability that it is true); the card is settled when p is 1 or 0. ★ p=1 IS A CONCLUSION, NOT A PREFERENCE: writing 1 is refused BY NAME unless the write carries one of the three conclusions the rule accepts — a promoted verified row on THIS card (the kernel record, not an argument), a unanimous debate ruling (`debate_ruling:{mode:"unanimous", value:1, subject:"<this card id>", ballotId}`), or a passed Lean run PLUS the conformance ruling (`lean_job` + `lean_conformance:"conform"`). Estimating in (0,1) is always allowed. '
      + '★ PROOF REGISTRATION (B6): pass `proof_ref` (where the proof/refutation lives, e.g. "Members/<m>/Propos/<pid>.md#正式证明") and `proof_state:"complete"|"draft"` — this is a SELF-REPORT, recorded and traceable, NOT a verification: a debate on this card still needs machine evidence (a passed Lean run on it, or a verified row). Only `proof_ref` ⇒ state is recorded as draft.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, track: { type: 'string' }, payload: { type: 'object' }, debate_ruling: { type: 'object' }, member: { type: 'string' } },
    handler: gatedCardHandler('vibe_v5_record_proposition'),
  },
  {
    name: 'vibe_v5_record_method',
    description: 'Record a theory/method/tool card in your library. REQUIRES content, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, content: { type: 'string', required: true }, notation: { type: 'string' }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, track: { type: 'string' }, payload: { type: 'object' }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, member: { type: 'string' } },
    handler: gatedCardHandler('vibe_v5_record_method'),
  },
  {
    name: 'vibe_v5_record_subproblem',
    description: 'Record a sub-problem card in your library. REQUIRES statement, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, track: { type: 'string' }, payload: { type: 'object' }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, member: { type: 'string' } },
    handler: gatedCardHandler('vibe_v5_record_subproblem'),
  },
  {
    name: 'vibe_v5_say',
    description: 'Speak in the group chat (omit `to`), send a private message (`to`: a member id / "all" / "voters"), or record a meeting speech (`meeting`: the open meeting id). The speaker must be a REAL roster id: this tool never invents one. '
      + '★ `urgent:true` is available ONLY on the private-message form (it is the sender\'s explicit intent, carried by the mailbox\'s own urgency semantics and reflected in the recipient\'s inbox row); the group-chat and meeting forms are refused by name when `urgent` is set, because neither has a recipient to wake.',
    parameters: { member: { type: 'string', required: true }, text: { type: 'string', required: true }, to: { type: 'string' }, meeting: { type: 'string' }, urgent: { type: 'boolean' } },
    handler: toolSay,
  },
  {
    name: 'vibe_v5_message',
    description: 'Relay a message from the office/human into the institute: to a member id, to "all", or to "voters". Delivered as per-recipient durable mail in the office voice.',
    parameters: { to: { type: 'string', required: true }, content: { type: 'string', required: true }, subject: { type: 'string' }, urgent: { type: 'boolean' } },
    handler: toolMessage,
  },
  {
    name: 'vibe_v5_inbox',
    description: 'Read/triage the mailbox: action=list returns rows WITHOUT the body (id/from/at/subject/read/todo/urgent/kind/bytes) — `urgent` is the sender\'s explicit flag from the message face, so urgency is visible WITHOUT opening the message; action=open returns ONE body and marks it read, action=mark sets read/todo. Mail does not need to be read immediately.',
    parameters: { action: { type: 'string' }, member: { type: 'string', required: true }, status: { type: 'string' }, id: { type: 'string' }, read: { type: 'boolean' }, todo: { type: 'boolean' } },
    handler: toolInbox,
  },
  {
    name: 'vibe_v5_wait',
    description: 'Wait until someone answers (returns on activity or timeout) — do NOT poll. action=status reports the waiter instead.',
    parameters: { action: { type: 'string' }, timeout_ms: { type: 'integer' }, member: { type: 'string' }, reason: { type: 'string' } },
    handler: toolWait,
  },
  {
    name: 'vibe_v5_task_create',
    description: 'Open a task on the shared board (subject required; optional description, blocked_by, write_scopes). Note: the original priority hint has no column in this kernel\'s ledger and is reported, not stored.',
    parameters: { subject: { type: 'string', required: true }, description: { type: 'string' }, blocked_by: { type: 'array' }, write_scopes: { type: 'array' }, priority: { type: 'integer' }, owner: { type: 'string' } },
    handler: toolTaskCreate,
  },
  {
    name: 'vibe_v5_task_list',
    description: 'List shared tasks with readiness, owner and blockers. Filters: status, owner, ready (ready is DERIVED: no unfinished blocker).',
    parameters: { status: { type: 'string' }, owner: { type: 'string' }, ready: { type: 'boolean' } },
    handler: toolTaskList,
  },
  {
    name: 'vibe_v5_task_get',
    description: 'Read ONE task by id (the corpus teaches this name): the board row plus its brief when the ledger has one.',
    parameters: { id: { type: 'string' }, task_id: { type: 'string' } },
    handler: toolTaskGet,
  },
  {
    name: 'vibe_v5_task_update',
    description: 'Compare-and-set a task action: claim | reassign | assign | transition | complete | reopen | set_dependencies. Requires task_id, expected_revision and action; a stale revision is refused. edit/delete/release have NO task-face operation in this kernel and are refused by name.',
    parameters: { task_id: { type: 'string', required: true }, expected_revision: { type: 'integer', required: true }, action: { type: 'string', required: true }, member: { type: 'string' }, owner: { type: 'string' }, blocked_by: { type: 'array' }, to: { type: 'string' }, why: { type: 'string' }, by: { type: 'string', description: 'WHO acted (the chair assigning on someone\'s behalf). The face already reads it (kit/extras.js task_update assign/claim) — without a declaration a caller could not attribute an assignment through the taught tool.' },},
    handler: toolTaskUpdate,
  },
  {
    name: 'vibe_v5_hire',
    description: 'Hire one temp worker into the temp seat and open their initial task. Requires purpose, initial_task and to (the new member id — this pack never invents an id). The SLOT is explicit (default "temp"); any other slot is refused by name and points at the founding face.'
    , parameters: { purpose: { type: 'string', required: true }, initial_task: { type: 'string', required: true }, to: { type: 'string', required: true }, slot: { type: 'string' }, direction: { type: 'string' }, term: { type: 'string' } },
    handler: toolHire,
  },
  {
    name: 'vibe_v5_script',
    description: 'THE SCRIPT ARCHIVE (归档/复算): op=archive stores a script\'s WHOLE text as a `scripts`-track card with the kernel\'s own fingerprint (provenance in title/tags, body byte-identical); op=read returns the archived text verbatim by id or name (latest edition); op=list shows the archived scripts. '
      + '★ A script is a 所级产物, so it is archived and reviewable — but a TEMPORARY script still cannot be run ad hoc: the pack\'s no-adhoc-scripts rule refuses that by name. Recompute by running the archived text again and comparing the fingerprint, never by trusting a note about it.',
    parameters: { op: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, purpose: { type: 'string' }, parent: { type: 'string' }, edition: { type: 'string' }, id: { type: 'string' }, limit: { type: 'integer' }, member: { type: 'string' } },
    handler: toolScript,
  },
  {
    name: 'vibe_v5_report',
    description: 'Human-readable institute report (staffing, task board, meetings, feedback ledger). Read-only composition of the published faces; the original takes no parameters. '
      + 'counts.feedback = { open, closed, total, declared } — a feedback card is CLOSED when its body verdict line is `status：closed` (what vibe_v5_feedback op=update writes); open is every other card, and both are derived by the same classifier vibe_v5_feedback op=list uses, '
      + 'declared:false means this deployment declares no feedback track (the count is then honestly absent, never a fabricated 0), and unreadable counts bodies the records face could not hand back.',
    parameters: {},
    handler: toolReport,
  },
  {
    name: 'vibe_v5_overview',
    description: 'Institute-wide view (roster, task board, meetings, feedback ledger). Academician (chair seat) only — the role check is the pack\'s, and another seat is refused by name. '
      + 'The returned `feedback` object is { open, closed, total, declared } with the same rule as vibe_v5_report.counts.feedback (closed = the card body verdict line is `status：closed`, classified by the one shared classifier).',
    parameters: { member: { type: 'string', required: true } },
    handler: toolOverview,
  },
  {
    name: 'vibe_v5_tool_help',
    description: 'What can I call right now? A thin forwarder to the kernel\'s toolsView: the member\'s VISIBLE tool set from the live provider (not the pack declaration), each with a one-line purpose (null = the host registered none). No live Agent / no provider ⇒ the provider\'s NAMED refusal — never an empty list pretending success.',
    parameters: { member: { type: 'string', required: true } },
    handler: toolHelp,
  },
  {
    name: 'vibe_v5_assign',
    description: 'Assign work: pick an existing task (task_id) or create one (subject), give it to the member in `to`, and state why + acceptance criteria (both REQUIRED, as in the original). The why/acceptance are mailed to the assignee.',
    parameters: { to: { type: 'string', required: true }, why: { type: 'string', required: true }, acceptance: { type: 'string', required: true }, task_id: { type: 'string' }, subject: { type: 'string' }, description: { type: 'string' }, write_scopes: { type: 'array' }, priority: { type: 'integer' }, due_in: { type: 'string' }, origin: { type: 'string' } },
    handler: toolAssign,
  },
  {
    name: 'vibe_v5_fire',
    description: 'Dismiss a member for real: seat ended through the members face, and that member\'s open tasks moved to cancelled. Mail is not purged (no per-member purge is exposed) — reported, not pretended.',
    parameters: { id: { type: 'string', required: true }, reason: { type: 'string' } },
    handler: toolFire,
  },
  {
    name: 'vibe_v5_nudge',
    description: 'Supervise: wake one member with a stated reason and a concrete suggested next step (prefer a specific step over a bare "hurry up"). Delivered as urgent mail.',
    parameters: { to: { type: 'string', required: true }, why: { type: 'string', required: true }, next_step: { type: 'string' } },
    handler: toolNudge,
  },
  {
    name: 'vibe_v5_prioritize',
    description: 'Set institute-wide priorities: an ordered list of {task_id, priority} plus why. The order is archived as a durable record AND applied to the board — entries that carry a priority change the task via kernel/tasks.js setPriority (compare-and-set), and the receipt reports each task\'s from->to. An entry without a priority is a position-only statement and changes nothing.',
    parameters: { order: { type: 'array', required: true }, why: { type: 'string', required: true } },
    handler: toolPrioritize,
  },
  {
    name: 'vibe_v5_feedback',
    description: 'Work-experience / process feedback library (not research conclusions). op=add needs category/route/phenomenon/impact/action (and assessment on the interpersonal route); op=update closes with status/outcome/note; op=list returns the open items.',
    parameters: { op: { type: 'string', required: true }, id: { type: 'string' }, member: { type: 'string' }, category: { type: 'string' }, route: { type: 'string' }, context: { type: 'string' }, phenomenon: { type: 'string' }, impact: { type: 'string' }, action: { type: 'string' }, assessment: { type: 'string' }, outcome: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, all: { type: 'boolean' }, limit: { type: 'integer' } },
    handler: toolFeedback,
  },
  {
    name: 'vibe_v5_read_library',
    description: 'Read anyone\'s library (read-only): id reads one card; the list form reads EVERY declared track (vmu.records.tracks — so a member\'s state panel, obstacles, rejected routes and feedback are all readable) and filters by kind, by the card\'s author, and by `track`/`tracks`. '
      + '★ An undeclared track name is refused by name with the declared set in `declared`; a declared track the records face itself refuses is reported in `skippedTracks`, never silently dropped.',
    parameters: { member: { type: 'string' }, kind: { type: 'string' }, id: { type: 'string' }, list: { type: 'boolean' }, limit: { type: 'integer' }, track: { type: 'string' }, tracks: { type: 'array' } },
    handler: toolReadLibrary,
  },
  {
    name: 'vibe_v5_meeting',
    description: 'Convene a meeting. agenda REQUIRED; type is one of ordinary/academic/debate/closure/paper/planning (default ordinary) and a debate REQUIRES subject (its object: a card id, a file reference, or one line). ★ `title` is an OPTIONAL separate name (omit it and the agenda stays as the subject; non-string is refused by name). ★ `at` SCHEDULES it: epoch milliseconds or an ISO-8601 string (e.g. "2026-10-24T10:00:00+08:00"); a future time puts the meeting in the `scheduled` state — status/summary/meetingView read it right away, but every action before the start time is refused BY NAME, and when the start time arrives with too few present it waits (a latecomer attending then starts it). The receipt reads the real state back (`state`, `scheduledFor`). ★ A DEBATE\'S SUBJECT MUST CARRY A FINISHED PROOF: a card id must have `proofRef`+`proofState:"complete"` (or a verified row / a passed Lean run), a file reference needs `subject_evidence.file = {readable:true, bytes:N, name}` (the gate only proves "exists and is non-empty" — content completeness is judged by the members in the debate), and a one-line proposition is legal but the receipt records `subjectGate.provenance:"none"` because nothing can be checked. A type that the institution gave a recommended procedure returns it in `procedure` — ★ it is a RECOMMENDATION, never a gate: skipping or reordering it is allowed and unchecked. Steps the framework has NOT implemented are reported in `pendingSteps`. ★ THIS FACE ONLY CONVENES - status/summary/close/flow live on vibe_vmu_meeting { action, id }. The original could also PROPOSE a meeting from a non-chair seat — this face has no propose path, and the receipt says so by name. ★ `id` optionally NAMES the meeting (omit it and the service mints one); an id already held by the OTHER (primitive) meeting registry is refused by name, naming that table. ★ `target` is an ALIAS of `subject` on THIS face (one value, one meaning) — but on `vibe_vmu_meeting` `target` is a VOTE\'s object, so do not carry the habit between faces; a subject/target on a type that debates nothing is refused by name.',
    parameters: { agenda: { type: 'string', required: true }, id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, subject: { type: 'string' }, kind: { type: 'string' }, target: { type: 'string' }, formal_agenda: { type: 'boolean' }, secretary: { type: 'string' }, member: { type: 'string', required: true }, at: { type: 'string' }, subject_evidence: { type: 'object' }, lean_job: { type: 'string' } },
    handler: toolMeeting,
    // ★ LIVE RUN 29: the funnel refuses undeclared keys generically; this face can say WHY it is the wrong face.
    validate: validateMeetingArgs,
  },
  {
    name: 'vibe_v5_meeting_round',
    description: 'Advance ONE member turn of an open meeting with the meeting-type tool face enforced (D7: 成员可用的命令按会议类型不同). '
      + 'It resolves the meeting\'s `type`, then narrows each participating member\'s tool face to 「identity visible set ∩ the pack-declared allow list for that type」 — it can only get SMALLER (a widening is impossible: the intersection is taken against the member\'s own visible face, and an unreadable identity face is refused by name instead of guessed). '
      + 'During a DEBATE, recording tools such as vibe_v5_paper / lean / hiring / settings are NOT callable by members (they are another meeting\'s business); in a type that declares no narrowing (ordinary/academic/closure/paper/planning) the member keeps the identity face and the receipt says so by name. '
      + 'The CHAIR is never narrowed (order-keeping is the seat\'s duty). The override lives for exactly this one round and is cleared in a finally, so the next turn starts from the identity face again. '
      + 'A type with no declared narrowing is a NAMED decision (default face), never a silent empty set; an empty intersection is refused by name (a bad configuration is not "strictness"). '
      + 'Defaults: members = every live member except the chair; phase = "meeting".',
    parameters: { meeting: { type: 'string', required: true }, members: { type: 'array' }, phase: { type: 'string' }, why: { type: 'string' } },
    handler: toolMeetingRound,
  },
  {
    name: 'vibe_v5_motion',
    description: 'Raise a motion inside an ongoing meeting (kind: topic/procedural/resolution; text required; you must be a voting seat), or WITHDRAW your own with op:"withdraw" + motion_id. A new motion starts proposed and needs a second.',
    parameters: { op: { type: 'string' }, motion_id: { type: 'string' }, kind: { type: 'string' }, text: { type: 'string' }, reason: { type: 'string' }, meeting: { type: 'string', required: true }, member: { type: 'string', required: true } },
    handler: toolMotion,
  },
  {
    name: 'vibe_v5_second',
    description: 'Second a proposed motion (meeting + motion_id). The kernel models the second state and refuses the proposer seconding their own motion by name.',
    parameters: { meeting: { type: 'string', required: true }, motion_id: { type: 'string', required: true }, member: { type: 'string', required: true } },
    handler: toolSecond,
  },
  {
    name: 'vibe_v5_poll_open',
    description: 'Open an option-type poll board inside the meeting (question + at least two options; chair seat only). min_votes/max/min/mode/allow_revote are translated into the kernel\'s per-box rules; only per-box secrecy/abstention stay in `unapplied`.',
    parameters: { question: { type: 'string', required: true }, options: { type: 'array', required: true }, mode: { type: 'string' }, max: { type: 'integer' }, min: { type: 'integer' }, min_votes: { type: 'integer' }, secret: { type: 'boolean' }, allow_abstain: { type: 'boolean' }, allow_revote: { type: 'boolean' }, member: { type: 'string', required: true } },
    handler: toolPollOpen,
  },
  {
    name: 'vibe_v5_poll_vote',
    description: 'Vote on the open poll board (ballot_id; choices[] ranked/multi, or abstain). ONLY a permanent seat (chair/member) may vote: 列席／受邀／临时工没有表决权（原版 V5_NOT_VOTER／D8）is refused by name here.',
    parameters: { ballot_id: { type: 'string', required: true }, choices: { type: 'array' }, choice: { type: 'string' }, abstain: { type: 'boolean' }, note: { type: 'string' }, reason: { type: 'string' }, member: { type: 'string', required: true } },
    handler: toolPollVote,
  },
  {
    name: 'vibe_v5_poll_close',
    description: 'Close and tally the poll board (chair seat only). The box\'s own min_votes floor decides whether the ballot COUNTS: when unmet the refusal is named (VMU_BALLOT_MIN_VOTES_NOT_MET, "本次投票不成立") — min_votes is not the quorum.',
    parameters: { ballot_id: { type: 'string', required: true }, reason: { type: 'string' }, member: { type: 'string', required: true } },
    handler: toolPollClose,
  },
  {
    name: 'vibe_v5_verdict',
    description: 'Cast your boolean verdict on the object under verification: verdict in [0,1] (1 = true, 0 = false, in between = an UNCERTAIN probability), on a LIVE ballot (target = its id).',
    parameters: { target: { type: 'string', required: true }, verdict: { type: 'number', required: true }, reason: { type: 'string' }, member: { type: 'string', required: true } },
    handler: toolVerdict,
  },
  {
    name: 'vibe_v5_verdict_final',
    description: '★ TALLY THE DEBATE\'S FINAL RULING (the CHAIR signs it): collect the members\' boolean verdicts on ONE proposition, aggregate them (all agree ⇒ that value, otherwise the arithmetic mean) and tell the proposition card\'s owner to correct its probability. meeting + proposition_id + verdicts REQUIRED; verdicts = [{member,p,reason}] where p∈[0,1]. member is who signs (default: the meeting chair; anyone else is refused by name — an anonymous ruling is not a ruling). owner defaults to the card\'s author and is REQUIRED to be resolvable, because a ruling nobody is told changes nothing. ★ If a Lean run passed and the card\'s p is still not 1, you must ANSWER THE FIDELITY QUESTION first (pass fidelity:"conform" or "defect", with lean_job naming the run): the refusal carries the question and the two legal answers. The kernel face keeps the arithmetic/validation and refuses by name (duplicate member, p out of range, mixed propositions); delivery of the notice is reported honestly in `delivery` and `notified` (an empty `notified` means the number is on the record but nobody was told).',
    parameters: { meeting: { type: 'string', required: true }, proposition_id: { type: 'string', required: true }, verdicts: { type: 'array', required: true }, member: { type: 'string' }, owner: { type: 'string' }, lean_job: { type: 'string' }, lean_passed: { type: 'boolean' }, fidelity: { type: 'string' }, template: { type: 'string' } },
    handler: toolVerdictFinal,
  },
  {
    name: 'vibe_v5_verified_promote',
    description: '★ PROMOTE A PROPOSITION CARD TO THE VERIFIED TRACK — the ONLY writer of that track, and the place where a settled p is carried together with its JUDGE. card REQUIRED (a propositions/proposition card whose p is exactly 1 or 0); warrant + warrant_kind REQUIRED (which debate/ruling decided it, e.g. kind "debate-unanimous"). Refused by name: a card that is not a proposition card, a truncated card, a card whose p is neither 1 nor 0 ("a preference is not a conclusion"), a withdrawn proof, and a missing warrant. The card keeps its own p; the verified row records the warrant, so "why is this settled" is answerable instead of asserted.',
    parameters: { card: { type: 'string', required: true }, warrant: { type: 'string', required: true }, warrant_kind: { type: 'string', required: true }, member: { type: 'string' } },
    handler: toolVerifiedPromote,
  },
  {
    name: 'vibe_v5_fidelity_conclude',
    description: '★ CLOSE A FORMALISATION: the chair judges whether a PASSING Lean run says what the proposition says, and that judgement is the ONLY way a debate turns into a conclusion. card + fidelity("conform"|"defect") + lean_job + member(the chair seat) REQUIRED. conform ⇒ the card p is written as 1 through the SAME gated card path (evidence = this Lean job) and the ONLY writer promotes it into the verified track (warrant = lean job, kind "lean-conformance"); defect ⇒ kernel.fidelity.declareDefect records a DURABLE marker with your reason (note REQUIRED), which makes the verified row invisible to every reader and cannot be undone by a later conclusion. Refused by name: a Lean job that is missing / not readable / did NOT pass, a non-chair signer, an unreadable or truncated card, a bad fidelity value, and a defect without a note. Idempotent: repeating the same conclusion adds nothing.',
    parameters: { card: { type: 'string', required: true }, fidelity: { type: 'string', required: true }, lean_job: { type: 'string', required: true }, member: { type: 'string' }, note: { type: 'string' } },
    handler: toolFidelityConclude,
  },
  {
    name: 'vibe_v5_blueprint',
    description: '★ THE INSTITUTE\'S PUBLIC BLUEPRINT (公共蓝图) — the document named by vmu.turn.protocolPath, as a versioned records track. actions: "state" (default) reads which revision is IN FORCE, when it was adopted, whether it is OVERDUE (updatedAt/ageMs/stale — a hint, never a refusal) and which drafts are waiting; "propose" (ANY live member) files a draft revision (path + text REQUIRED; a draft is never in force); "adopt" (CHAIR seat ONLY) makes a named draft the revision in force and supersedes the previous one (draft REQUIRED; any other seat is refused by name); "read" returns one revision by id. Every change is one record row (who proposed, who adopted, when, fingerprint), so "who changed the blueprint" is answerable instead of remembered. The rows are also readable through vibe_v5_read_library { track: "blueprint" }.',
    parameters: { action: { type: 'string' }, path: { type: 'string' }, member: { type: 'string' }, text: { type: 'string' }, draft: { type: 'string' }, id: { type: 'string' }, note: { type: 'string' } },
    handler: toolBlueprint,
  },
  {
    name: 'vibe_v5_start',
    description: 'Found the institute: start the kernel and seat the academician (unless academician:false) plus researcherCount permanent researchers (default 3). seedDirections are roster data here and are reported as not stored.',
    parameters: { problem: { type: 'string' }, researcherCount: { type: 'integer' }, academician: { type: 'boolean' }, params: { type: 'object' }, seedDirections: { type: 'array' } },
    handler: toolStart,
  },
  {
    name: 'vibe_v5_stop',
    description: 'Stop the institute through the kernel\'s own control state (the only one). Nothing here kills child sessions.',
    parameters: { reason: { type: 'string' } },
    handler: toolStop,
  },
  {
    name: 'vibe_v5_pause',
    description: 'Pause the institute through the kernel\'s control face (in-flight turns are the kernel\'s business; no new wakes while paused).',
    parameters: { reason: { type: 'string' } },
    handler: toolPause,
  },
  {
    name: 'vibe_v5_resume',
    description: 'Resume a paused institute through the CONTROL face (deliberately not kernel.resume, which is the durability projection).',
    parameters: { reason: { type: 'string' } },
    handler: toolResume,
  },
  {
    name: 'vibe_v5_configure',
    description: 'Configure the institute WITHOUT starting it: institute/problem/params, where params is {declared key: value}. Every write goes through the declared-settings guard, so an undeclared key is refused by name; each receipt carries the key\'s hot level (H1 live now / H2 restart).',
    parameters: { project: { type: 'string' }, institute: { type: 'string' }, problem: { type: 'string' }, params: { type: 'object' } },
    handler: toolConfigure,
  },
  {
    name: 'vibe_v5_set',
    description: 'Set ONE declared setting key. The receipt carries the declared hot level and whether it is live now or on restart; an undeclared key or an H3 (read-only) key is refused by name. `value` is parsed against the key\'s DECLARED type: a numeric string ("8000") becomes the number 8000, "true"/"false" become booleans, and a JSON string becomes the structure — text keys keep their text. A value the declared type cannot accept is refused by name, never coerced silently.',
    parameters: { key: { type: 'string', required: true }, value: {}, why: { type: 'string' } },
    handler: toolSet,
  },
  {
    name: 'vibe_v5_lean_run',
    description: 'Compile one existing .lean file through the kernel\'s Lean face (the face owns the process, timeout and cancel path). Assembly without a host spawn seam ⇒ NAMED refusal; a per-call timeout_ms is reported as unapplied.',
    parameters: { file: { type: 'string', required: true }, target: { type: 'string' }, statement: { type: 'string' }, timeout_ms: { type: 'integer' }, member: { type: 'string' } },
    handler: toolLeanRun,
  },
  {
    name: 'vibe_v5_lean_job',
    description: 'Inspect the Lean job queue: with jobId the job\'s state, otherwise the list. (waitMs is reported as not applied — the queue returns current state.)',
    parameters: { jobId: { type: 'string' }, waitMs: { type: 'integer' } },
    handler: toolLeanJob,
  },
  {
    name: 'vibe_v5_lean_lib',
    description: 'List the Lean archive/library (def/lemma/theorem/assumption entries) through the Lean face.',
    parameters: { refresh: { type: 'boolean' } },
    handler: toolLeanLib,
  },
  {
    name: 'vibe_v5_lean_read',
    description: 'Read one archived Lean entry VERBATIM by name (kind auto/lib/proved is reported as not applied: this kernel keeps one archive namespace).',
    parameters: { name: { type: 'string', required: true }, kind: { type: 'string' } },
    handler: toolLeanRead,
  },
  {
    name: 'vibe_v5_lean_archive',
    description: 'Archive an existing .lean file: kind def/lemma/proof/blocked maps to the face\'s def/lemma/theorem/assumption; the face registers existing files by hash (inline content is not stored).',
    parameters: { kind: { type: 'string', required: true }, name: { type: 'string', required: true }, target: { type: 'string' }, content: { type: 'string' }, from: { type: 'string' }, file: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } },
    handler: toolLeanArchive,
  },
  {
    name: 'vibe_v5_paper',
    description: '论文子系统（真入口）：action=start|part|review|advance|final|render|status|compile|sections|consult|consult_state。只做参数映射——阶段合法性、互审规则、'
      + '「只有 chair 席能定稿」都由内核的 paper flow 判并具名拒；本面不自己判政策、不造阶段、不编结论。render 如实报 wrote/missing/complete；compile 无 LaTeX 面即具名拒。'
      + '★ 所办问询（vmu.paper.officeConsult="required"）：定稿被拦时会给出 requestId，由所办用 action:"consult" 答复（member=答复人所办，answer/note 写核对结论），'
      + '答完重试 action:"final" 才放行；谁能答复由本 pack 的 PAPER_CONSULT_ROLES 声明（不是内核猜的），普通成员答会被具名拒（VMU_NOT_PERMITTED）。'
      + 'action:"consult_state" 只读：看谁在等、哪条 requestId 还开着。',
    parameters: {
      action: { type: 'string', required: true, description: 'start｜part｜review｜advance｜final｜render｜status｜compile｜sections｜consult｜consult_state' },
      target: { type: 'string', description: '论文对象（对象名；start 时可用 title/track 别名）' },
      title: { type: 'string' },
      track: { type: 'string' },
      participants: { type: 'array', description: 'start：写作参与者（成员 id 列表；引用名册，本面不猜）' },
      editor: { type: 'string' }, lang: { type: 'string' }, format: { type: 'string' },
      member: { type: 'string', description: 'part/review/final：动作发起者的名册 id（由内核校验其参与资格/席位）；consult：答复人（所办，必须匹配 pack 声明的答复角色）' },
      by: { type: 'string', description: 'consult：member 的别名（谁在答复）' },
      part: { type: 'string', description: 'part：你这一份的标题；review：被审对象（of 的别名）' },
      body: { type: 'string', description: 'part：正文；final：结论别名' },
      solution: { type: 'string' }, methods: { type: 'string' }, rules: { type: 'string' }, limits: { type: 'string' },
      evidence: { type: 'array', description: 'part：证据指针列表' },
      deliverable: { type: 'boolean', description: 'review：true/false（未表态不交付）' },
      notes: { type: 'string', description: 'review：评语；consult：答复备注（note 的别名）' },
      comments: { type: 'string', description: 'review：评语（与 notes 同义，向后兼容的别名）' },
      of: { type: 'string', description: 'review：被审成员' },
      decision: { type: 'string', description: 'final：deliverable｜revise（必填，面不代填）；consult 不收这个参数（答复是自由文本）' },
      note: { type: 'string', description: 'final：定稿代表备注；consult：答复备注（写清核对了什么）' },
      conclusion: { type: 'string', description: 'final：结论' },
      request_id: { type: 'string', description: 'consult：要答复的那条问询 id（定稿被拦时回执里的 requestId）；给了却不是当前在等的 ⇒ 具名拒并列出现在在等的那几条' },
      answer: { type: 'string', description: 'consult：所办的答复正文（自由文本，sealed 进台账；不要填 decision）' },
    },
    handler: toolPaper,
  },
])

export default V5R_PACK_TOOLS

/**
 * THE NEXT BATCH, DECLARED AS DATA (not as tools). Every name below is MENTIONED by this pack's prompts and is NOT
 * declared by `V5R_PACK_TOOLS` yet; the `inOriginal` flag records whether the ORIGINAL registry in `vibe-math-v5r.js`
 * registers it — measured, not assumed. Round 4 implemented `assign / fire / nudge / prioritize / feedback /
 * read_library`, and `vibe_v5_tool_help` (the ONE prompt-invented name: the corpus teaches it and the original never
 * registered it) is now a REAL tool. What is left is the Lean family, which needs the Lean archive surface.
 *
 * WHY DATA AND NOT MORE HANDLERS: each remaining name needs a face mapping that does not exist yet (the `lean_*` set
 * needs the Lean archive), and a tool declared before its mapping exists would be the paper capability this repo bans.
 */
export const V5R_NEXT_BATCH_TOOLS = Object.freeze([])

/**
 * ★ `V5R_NEXT_BATCH_TOOLS` IS NOW EMPTY, AND THAT IS THE FINDING, NOT AN OVERSIGHT: the eleven prompt-taught names
 * that were undeclared in round 3 are all declared now (rounds 4–6), and the four Lean names the last round left here
 * are declared too — no name this pack's prompts teach is missing from `V5R_PACK_TOOLS`. The EMPTINESS is asserted in
 * `tests/vmu-v5r-tools.test.mjs` §7 together with "every prompt-taught name is declared", so a new taught-but-missing
 * name reddens the suite instead of quietly lingering as a comment.
 */

/**
 * ★ NAMED GAPS — ONLY WHAT IS STILL TRUE, and each one carries a MACHINE CHECK below so the list cannot rot again.
 *
 * PHASE 7 round 23 rewrote this list. Three entries of the old list were STALE: the kernel had closed them in round 6
 * (per-box ballot `rules`, `meetings.second`/`withdraw`, `meetings.open({secretary})`) while the pack still said
 * "需内核能力" — the (甲) class defect (kernel face exists, pack does not wire it). Those three are now WIRED (see the
 * tools above) and moved to `V5R_CLOSED_GAPS` with the kernel references. One further entry was ALSO stale in a subtler
 * way: the task ledger DOES carry priority (create + board sort) — what it lacks is a SETTER for an existing task, so
 * the gap was narrowed to exactly that.
 */
export const V5R_NAMED_GAPS = Object.freeze([
  'visible-tools reader: the kernel installs a visible-tools PROVIDER but exposes no getter for the full visible NAME set, so tool_help can name the pack-declared tools exactly and the host visible COUNT, not the host face names.',
  'mail purge on fire: the mailbox face exposes no per-member purge this pack may call, so fire dismisses the member and cancels their tasks but does not drop their mail.',
  'per-box secrecy/abstention: the per-box `rules` object covers minVotes/allowRevote/maxChoices/minChoices/mode only; secrecy and abstention remain deployment-level ballot policy, so poll_open reports those two under `unapplied`.',
  'meeting propose: the meetings face has no "propose a meeting" path, so a non-chair seat cannot propose one for the chair to convene (the tool says so in its receipt instead of pretending).',
])

/** The gaps CLOSED by the kernel in round 6 and WIRED by this pack in round 23 — kept as data so "closed" is searchable. */
export const V5R_CLOSED_GAPS = Object.freeze([
  { id: 'per-box ballot rules', kernel: 'kernel/ballotbox.js open({rules}) — minVotes/allowRevote/maxChoices/minChoices/mode', wired: 'vibe_v5_poll_open translates the original six rule names' },
  { id: 'motion second', kernel: 'kernel/meetings.js second({meeting,motion,member}) — secondedBy + proposed gate', wired: 'vibe_v5_second' },
  { id: 'motion withdraw', kernel: 'kernel/meetings.js withdraw({meeting,motion,member})', wired: 'vibe_v5_motion {op:"withdraw"}' },
  { id: 'meeting secretary', kernel: 'kernel/meetings.js open({secretary}) + resolution mover check', wired: 'vibe_v5_meeting {secretary}' },
])

/**
 * ★ THE ANTI-ROT CHECK: every gap above must remain VERIFIABLE — its claimed missing capability must still be ABSENT
 * from the kernel file named here (and, for the provider/getter pair, the provider must still be PRESENT). The suite
 * greps these patterns; if the kernel gains the capability, the assertion flips and the list must be edited, not drift.
 */
export const V5R_NAMED_GAP_CHECKS = Object.freeze([
  { gap: 'visible-tools reader', file: 'kernel/turn/index.js', absent: /visibleTools\s*\(/, present: /setVisibleToolsProvider/ },
  { gap: 'mail purge on fire', file: 'kernel/mailbox.js', absent: /purge/ },
  { gap: 'per-box secrecy/abstention', file: 'kernel/ballotbox.js', absent: /RULE_KEYS\s*=\s*\[[^\]]*'secret'/ },
  { gap: 'meeting propose', file: 'kernel/meetings.js', absent: /propose\s*\(/ },
])
