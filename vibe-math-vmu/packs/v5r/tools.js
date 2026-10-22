// ★ PHASE 8 / B-3: the task board and the Lean five live in the kit now (one implementation in the tree).
import { toolTaskCreate, toolTaskList, toolTaskUpdate, toolTaskGet, toolLeanRun, toolLeanJob, toolLeanLib, toolLeanRead, toolLeanArchive, tasksOf, rowsOf } from '../../kit/extras.js'
import { KIT_CARD_TOOL as cardTool, KIT_HELPERS, KIT_READ_LIBRARY as toolReadLibrary, KIT_RECORD_PROGRESS as toolRecordProgress, KIT_SOCIAL } from '../../kit/handlers.js'
import { kitCardHandler } from '../../kit/tools.js'
// ★ GOAL ROUND 3: the paper subsystem's RUNTIME ENTRY. It lives in this pack (`./paper.js` → `kit/paper.js` is the flow);
// the face below is only the missing READ POINT — before it, `paper.start` existed but nothing in production called it.
import { createPaperSubsystem } from './paper.js'
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
/** A row WITHOUT the body: exactly the eight fields a member needs to triage. */
const inboxRow = (row) => ({
  id: str(row && row.id), from: str(row && (row.from || row.by)), at: row && row.at !== undefined ? row.at : null,
  subject: row && row.subject !== undefined ? row.subject : null, read: row && row.read === true, todo: row && row.todo === true,
  kind: str(row && row.kind), bytes: Number.isFinite(Number(row && row.bytes)) ? Number(row.bytes) : 0,
})
/** vibe_v5_inbox — ONE action-shaped tool (list | open | mark) over the mailbox face. */
async function toolInbox(args = {}, { kernel } = {}) {
  const action = has(args.action) ? str(args.action) : 'list'
  const member = requireSeat(kernel, args.member, 'inbox').id
  if (action === 'list') {
    const list = mailboxAction(kernel, 'list')
    const status = has(args.status) ? str(args.status) : 'unread'
    const r = await list(member, { status })
    const rows = Array.isArray(r) ? r : Array.isArray(r && r.entries) ? r.entries : Array.isArray(r && r.rows) ? r.rows : []
    return { ok: true, tool: 'vibe_v5_inbox', action: 'list', member, status, count: rows.length, rows: rows.map(inboxRow),
      note: 'rows carry NO body: triage by sender/time/subject/read/todo, then open ONE message' }
  }
  if (action === 'open') {
    if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'inbox open needs the message id', 'take it from the list rows')
    const open = mailboxAction(kernel, 'open')
    const r = await open(member, str(args.id))
    const row = r && r.entry ? r.entry : r
    if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no message "' + str(args.id) + '" in this inbox', 'call inbox list for the real ids')
    return { ok: true, tool: 'vibe_v5_inbox', action: 'open', member, id: str(args.id),
      message: { id: str(row.id), from: str(row.from || row.by), at: row.at !== undefined ? row.at : null, subject: row.subject !== undefined ? row.subject : null, kind: str(row.kind), text: str(row.text), read: true, todo: row.todo === true },
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
  const members = membersOf(kernel)
  const hired = await members.hire({ id: str(args.to), slot: 'temp' })
  let task = null
  if (kernel.tasks && typeof kernel.tasks.create === 'function') {
    task = await kernel.tasks.create({ title: str(args.initial_task), objective: str(args.purpose), owner: str(args.to), deps: null, writeScopes: [] })
  }
  return { ok: true, tool: 'vibe_v5_hire', member: str(args.to), slot: 'temp', hired, task,
    note: 'direction/term are onboarding prose in the original and roster data here, so they are not stored by this tool' }
}

/** A READ-ONLY human-readable report (the original takes no parameters): staffing, task board, meetings, artefacts. */
async function toolReport(args = {}, { kernel } = {}) {
  const roster = membersOf(kernel).roster()
  const rows = kernel.tasks && typeof kernel.tasks.list === 'function' ? rowsOf(await kernel.tasks.list()) : []
  const openRows = rows.filter((t) => String(t.status || t.state) !== 'done')
  const openMeetings = kernel.meetings && typeof kernel.meetings.openMeetings === 'function' ? kernel.meetings.openMeetings() : null
  const meetingRows = openMeetings && Array.isArray(openMeetings.meetings) ? openMeetings.meetings : []
  const lines = [
    '【所内报告】',
    '· 编制：名册 ' + roster.length + ' 人（在册 live ' + roster.filter((m) => m.state === 'live').length + ' 人）',
    '· 任务板：共 ' + rows.length + ' 张，其中未完成 ' + openRows.length + ' 张',
    '· 会议：开着的 ' + meetingRows.length + ' 场',
  ]
  return { ok: true, tool: 'vibe_v5_report', report: lines.join('\n'),
    counts: { roster: roster.length, live: roster.filter((m) => m.state === 'live').length, tasks: rows.length, openTasks: openRows.length, openMeetings: meetingRows.length },
    note: 'read-only composition of the published faces; no new kernel capability and no template invention' }
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
  return { ok: true, tool: 'vibe_v5_overview', by: member,
    roster: roster.map((m) => ({ id: m.id, slot: m.slot, state: m.state })),
    board: { tasks: rows.length, open: rows.filter((t) => String(t.status || t.state) !== 'done').length },
    meetings: meetingRows.map((m) => ({ id: m.id, state: m.state })) }
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
    const rows = records.list({ track: 'feedback', limit: has(args.limit) ? Number(args.limit) : 50 })
    const items = Array.isArray(rows.items) ? rows.items : []
    const open = items.filter((r) => String(r.status) !== 'closed')
    return { ok: true, tool: 'vibe_v5_feedback', op, count: open.length, items: args.all === true ? items : open }
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

/** ★ `vibe_v5_task_get` — read ONE task (the corpus teaches it, so it is declared rather than left dangling). */


/** ★ `vibe_v5_meeting` — convene a meeting. The original also let a non-chair PROPOSE one for the chair to convene;
 * this face has no propose path, so that half is a named gap rather than a silent convenience. */
function toolMeeting(args = {}, { kernel } = {}) {
  if (!has(args.agenda)) throw refuse('VMU_INVALID_ARGUMENT', 'meeting needs an agenda', 'pass agenda:"what this meeting is for"')
  const member = requireSeat(kernel, args.member, 'meeting').id
  const roster = membersOf(kernel).roster().filter((m) => m.state === 'live').map((m) => m.id)
  const kind = has(args.kind) ? str(args.kind) : 'sync'
  const KNOWN = ['sync', 'division', 'verify-request', 'solve-vote']
  if (!KNOWN.includes(kind)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown meeting kind: ' + kind, 'the original offered: ' + KNOWN.join(', '))
  }
  if (!kernel.meetings || typeof kernel.meetings.open !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meetings face is published, so a meeting cannot be convened', 'assemble a kernel with the meetings service')
  }
  // ★ PHASE 7 round 23: the kernel's `meetings.open` accepts a SECRETARY (a recorder). The pack passes it through and
  // validates that the named id is on the roster — the RECORD right is a role the meeting declares, never a silent name.
  let secretary = null
  if (has(args.secretary)) {
    const row = membersOf(kernel).roster().filter((m) => m.id === str(args.secretary))[0]
    if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + str(args.secretary) + '" on this roster', 'the secretary must be a real member id')
    secretary = row.id
  }
  const opened = kernel.meetings.open({ type: 'ordinary', chair: member, roster, materials: str(args.agenda), secretary })
  return { ok: true, tool: 'vibe_v5_meeting', meeting: opened && opened.meeting ? opened.meeting : opened,
    kind, agenda: str(args.agenda), formalAgenda: args.formal_agenda === true, secretary,
    note: 'the original could also PROPOSE a meeting from a non-chair seat and let the chair convene it; this face has no propose path (named gap: procedure/propose)' }
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
  const actor = opts.by || def.who || null
  const receipt = kernel.setSettingsValue(key, value, { by: actor, reason: opts.reason || null })
  return { key, value, hot: def.hot, who: def.who || null, appliedBy: actor,
    applied: receipt && receipt.applied !== undefined ? receipt.applied : null,
    effective: def.hot === 'H1' ? '立即生效（H1）' : '重启后生效（' + String(def.hot) + '）',
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
  const restarts = applied.filter((a) => a.hot !== 'H1')
  return { ok: true, tool: 'vibe_v5_configure', applied, restartRequired: restarts.map((a) => a.key),
    note: restarts.length > 0
      ? 'the keys in restartRequired are NOT live yet: their declared hot level takes effect on restart (the receipt says so instead of implying it worked)'
      : 'every key applied here is H1 (live immediately)' }
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
 *   render / status / compile / sections
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
    default:
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown paper action: ' + action,
        'actions: start|part|review|advance|final|render|status|compile|sections')
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
    description: 'Append to YOUR research log. track picks the file: progress (default) / routes / obstacles / rejected / state — use rejected for disproved routes and obstacles for blockers, so negative knowledge is archived in its own track.',
    parameters: { content: { type: 'string', required: true }, track: { type: 'string' }, title: { type: 'string' }, member: { type: 'string' } },
    handler: toolRecordProgress,
  },
  {
    name: 'vibe_v5_record_proposition',
    description: 'Record a proposition/lemma card in your library. REQUIRES statement, value, motive and p (your probability that it is true); the card is settled when p is 1 or 0.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, member: { type: 'string' } },
    handler: kitCardHandler('vibe_v5_record_proposition'),
  },
  {
    name: 'vibe_v5_record_method',
    description: 'Record a theory/method/tool card in your library. REQUIRES content, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, content: { type: 'string', required: true }, notation: { type: 'string' }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, member: { type: 'string' } },
    handler: kitCardHandler('vibe_v5_record_method'),
  },
  {
    name: 'vibe_v5_record_subproblem',
    description: 'Record a sub-problem card in your library. REQUIRES statement, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, member: { type: 'string' } },
    handler: kitCardHandler('vibe_v5_record_subproblem'),
  },
  {
    name: 'vibe_v5_say',
    description: 'Speak in the group chat (omit `to`), send a private message (`to`: a member id / "all" / "voters"), or record a meeting speech (`meeting`: the open meeting id). The speaker must be a REAL roster id: this tool never invents one.',
    parameters: { member: { type: 'string', required: true }, text: { type: 'string', required: true }, to: { type: 'string' }, meeting: { type: 'string' } },
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
    description: 'Read/triage the mailbox: action=list returns rows WITHOUT the body (id/from/at/subject/read/todo/kind/bytes), action=open returns ONE body and marks it read, action=mark sets read/todo. Mail does not need to be read immediately.',
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
    parameters: { task_id: { type: 'string', required: true }, expected_revision: { type: 'integer', required: true }, action: { type: 'string', required: true }, member: { type: 'string' }, owner: { type: 'string' }, blocked_by: { type: 'array' }, to: { type: 'string' }, why: { type: 'string' },},
    handler: toolTaskUpdate,
  },
  {
    name: 'vibe_v5_hire',
    description: 'Hire one temp worker into the temp seat and open their initial task. Requires purpose, initial_task and to (the new member id — this pack never invents an id).',
    parameters: { purpose: { type: 'string', required: true }, initial_task: { type: 'string', required: true }, to: { type: 'string', required: true }, direction: { type: 'string' }, term: { type: 'string' } },
    handler: toolHire,
  },
  {
    name: 'vibe_v5_report',
    description: 'Human-readable institute report (staffing, task board, meetings). Read-only composition of the published faces; the original takes no parameters.',
    parameters: {},
    handler: toolReport,
  },
  {
    name: 'vibe_v5_overview',
    description: 'Institute-wide view (roster, task board, meetings). Academician (chair seat) only — the role check is the pack\'s, and another seat is refused by name.',
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
    parameters: { op: { type: 'string', required: true }, id: { type: 'string' }, category: { type: 'string' }, route: { type: 'string' }, context: { type: 'string' }, phenomenon: { type: 'string' }, impact: { type: 'string' }, action: { type: 'string' }, assessment: { type: 'string' }, outcome: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, all: { type: 'boolean' }, limit: { type: 'integer' } },
    handler: toolFeedback,
  },
  {
    name: 'vibe_v5_read_library',
    description: 'Read anyone\'s library (read-only): id reads one card; the list form reads the declared tracks and filters by kind and by the card\'s author.',
    parameters: { member: { type: 'string' }, kind: { type: 'string' }, id: { type: 'string' }, list: { type: 'boolean' }, limit: { type: 'integer' } },
    handler: toolReadLibrary,
  },
  {
    name: 'vibe_v5_meeting',
    description: 'Convene a meeting (agenda REQUIRED; kind is sync/division/verify-request/solve-vote). The original could also PROPOSE a meeting from a non-chair seat — this face has no propose path, and the receipt says so by name.',
    parameters: { agenda: { type: 'string', required: true }, kind: { type: 'string' }, target: { type: 'string' }, formal_agenda: { type: 'boolean' }, secretary: { type: 'string' }, member: { type: 'string', required: true } },
    handler: toolMeeting,
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
    description: 'Set ONE declared setting key. The receipt carries the declared hot level and whether it is live now or on restart; an undeclared key or an H3 (read-only) key is refused by name.',
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
    description: '论文子系统（真入口）：action=start|part|review|advance|final|render|status|compile|sections。只做参数映射——阶段合法性、互审规则、'
      + '「只有 chair 席能定稿」都由内核的 paper flow 判并具名拒；本面不自己判政策、不造阶段、不编结论。render 如实报 wrote/missing/complete；compile 无 LaTeX 面即具名拒。',
    parameters: {
      action: { type: 'string', required: true, description: 'start｜part｜review｜advance｜final｜render｜status｜compile｜sections' },
      target: { type: 'string', description: '论文对象（对象名；start 时可用 title/track 别名）' },
      title: { type: 'string' },
      track: { type: 'string' },
      participants: { type: 'array', description: 'start：写作参与者（成员 id 列表；引用名册，本面不猜）' },
      editor: { type: 'string' }, lang: { type: 'string' }, format: { type: 'string' },
      member: { type: 'string', description: 'part/review/final：动作发起者的名册 id（由内核校验其参与资格/席位）' },
      part: { type: 'string', description: 'part：你这一份的标题；review：被审对象（of 的别名）' },
      body: { type: 'string', description: 'part：正文；final：结论别名' },
      solution: { type: 'string' }, methods: { type: 'string' }, rules: { type: 'string' }, limits: { type: 'string' },
      evidence: { type: 'array', description: 'part：证据指针列表' },
      deliverable: { type: 'boolean', description: 'review：true/false（未表态不交付）' },
      notes: { type: 'string', description: 'review：评语' },
      comments: { type: 'string', description: 'review：评语（与 notes 同义，向后兼容的别名）' },
      of: { type: 'string', description: 'review：被审成员' },
      decision: { type: 'string', description: 'final：deliverable｜revise（必填，面不代填）' },
      note: { type: 'string', description: 'final：定稿代表备注' },
      conclusion: { type: 'string', description: 'final：结论' },
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
