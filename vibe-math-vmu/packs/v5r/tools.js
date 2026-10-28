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
// ★ RUN 29: `classifySubject` is imported for the SAME reason the four predicates are — it is the ONE authority for
// "what shape is this debate object name" (`verification-gates.js:135`: card id / file reference / one-line statement).
// A second copy of that regex in the ask face would be a second answer to one question, and the two would drift.
import { p1Intent, debateSubjectGate, singleWriter, fidelityAsked, classifySubject } from './verification-gates.js'
// ★ The VERIFIED carrier (B1 step 1): `findVerified` answers null instead of guessing, `promoteVerified` is the ONLY
// writer on that track, and `parseCard` names a card it cannot judge (empty/truncated body) instead of half-parsing it.
import { parseCard, parseCardBody, findVerified, promoteVerified, VERIFIED_TRACK } from './verified.js'
// ★ GOAL ROUND 3: the paper subsystem's RUNTIME ENTRY. It lives in this pack (`./paper.js` → `kit/paper.js` is the flow);
// the face below is only the missing READ POINT — before it, `paper.start` existed but nothing in production called it.
// ★ E4 (真缺陷): `PAPER_CONSULT_ROLES` is imported, not re-typed. The kit owns the consult STATE TRANSITION; the pack owns
// "who may answer". One declaration, two readers (createPaperSubsystem hands it to the kit as `consultRoles`; the tool
// pre-check below uses the same constant) — a second literal `['office']` in this file would be a second authority.
import { createPaperSubsystem, PAPER_CONSULT_ROLES } from './paper.js'
// ★ GOAL ROUND 3 (rule conformance): the meeting TYPE catalog and the recommended procedure skeletons are INSTITUTION
// vocabulary, so they live in this pack (`./meeting-procedures.js`) — the kernel only carries the type string.
import { MEETING_TYPE_IDS, meetingTypeOf, procedureFor } from './meeting-procedures.js'
// ★ RUN 51 residue #4 (design: docs/acceptance/conformance/member-scope-design.md): WHICH FACE a seat may call is
// INstitution vocabulary, so the table lives in this pack and the derived lists come from it — one source, two
// readers (the narrowing below and the gate in tests/audit-member-scope.test.mjs).
import { applyMemberScope, MEMBER_SCOPE_NOTE } from './member-scope.js'
// ★ ROUND 92 / F-92a: the seat table is the DECLARED authority for "which seat may call which face".
// A card attributed to a seat must be a card that seat is allowed to write, so the card faces consult
// the same table the member face gate is derived from — not the caller's identity (the office is not
// subject to a seat, so before this a card could be attributed to a temp worker by the office).
import { seatDecision as seatDecisionOf } from './seat-faces.js'
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
// ★ A7 (round 31 follow-up): WHO IS CALLING, read from the one non-forgeable source there is. `vibe_v5_fire` has to
// know whether the caller is a member seat (whose dismissal right is scoped to its own temp worker) or the office /
// a chair (unscoped), and the ONLY trustworthy answer is the agent→member resolution the seat face gate itself uses:
// `host-pack-tools.js#resolveTurnMember` (turn-tool record → learned member session → exact roster id; `null` is a
// REAL answer meaning root/office). `args.member` is NOT read for this: it is model-typed text, which is exactly the
// run-29 lesson member-scope.js records for `verdict_ask`. `host-pack-tools.js` imports nothing, so this edge adds no
// cycle (it cannot import this file back).
import { resolveTurnMember } from '../../host-pack-tools.js'
// ★ PHASE 8 / B-2 step 2: the kit owns the implementations; v5r keeps only INSTITUTION vocabulary (names, descriptions,
// parameters) and its policy. The 8 generic helpers come from the kit so the tree has exactly ONE copy.
const { str, has, refuse, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker } = KIT_HELPERS
// ★ RUN 85 / E17 (规则 L36「单次发言版群聊：每人各说一次、不打断」): THE ONE-SPEECH-PER-MEMBER ROUND.
// The kit's `say` records a speech per call and knows nothing about rounds. The round rule is therefore a PACK
// convention carried by KERNEL bookkeeping: `round` names a page of the chat ledger, the kernel records who spoke on
// it, and the SAME member's second speech in the SAME round is refused by name (`VMU_CHAT_ALREADY_SPOKE`) before
// anything is appended. What it is NOT: a turn queue. It does not order or isolate the members' messages, so
// 「不打断」 is a room convention this book enforces AFTER the fact — every round receipt's `means` says exactly that,
// and this file must not claim more (a prompt-only promise would be the "写了 ≠ 机制存在" defect the repo forbids).
const toolSayBase = KIT_SOCIAL.say
function toolSay(args = {}, ctx = {}) {
  const round = has(args.round) ? str(args.round).trim() : ''
  if (!round) return toolSayBase(args, ctx)
  // `round` is the group-chat rule; the other two forms have their own notion of who/ordering and are refused BY NAME
  // rather than silently ignored (a silently dropped argument is the defect this face exists to avoid).
  if (has(args.to) || has(args.meeting)) {
    throw refuse('VMU_INVALID_ARGUMENT',
      '`round` is the GROUP-CHAT single-speech rule: it cannot be combined with `to` (a private message has a recipient, not a round) or `meeting` (a meeting speech is ordered by the meeting)',
      'call vibe_v5_say { round: "<round>", member: "<your id>", text: "…" } for the group chat, or drop `round` for the DM/meeting form')
  }
  const kernel = ctx && ctx.kernel
  if (!kernel || !kernel.chat || typeof kernel.chat.speakRound !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel publishes no chat round book, so the one-speech-per-round rule cannot be enforced here',
      'assemble a kernel whose chat face provides speakRound (the v5r host does); without it the round argument would be a silent no-op')
  }
  const member = requireSpeaker(kernel, args.member)
  const declared = Array.isArray(args.members) ? args.members : null
  if (!has(args.text)) {
    // A ROUND READ: opens no page and says nothing — it answers "who has spoken / who is still owed a turn".
    const read = kernel.chat.roundStatus({ round, members: declared })
    return Object.assign({ tool: 'vibe_v5_say', via: 'chat', read: true, member }, read)
  }
  const res = kernel.chat.speakRound({ round, from: member, text: str(args.text), members: declared })
  return Object.assign({ tool: 'vibe_v5_say', via: 'chat', member }, res)
}
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
async function toolHire(args = {}, { kernel, exec = null } = {}) {
  if (!has(args.purpose)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs purpose', 'pass purpose:"why this worker exists"')
  if (!has(args.initial_task)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs initial_task', 'pass initial_task:"the first task"')
  if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'hire needs the new member id', 'pass to:"<new member id>" (this pack never invents an id)')
  // ★ ROUND 92 / F-92b (live run 92): `to` names a NEW member. Calling this face with an id that is already
  // on the roster re-seated that member in place — the chair was moved into the temp seat, and every later
  // call then failed with `is in slot "temp"`. Re-seating is a different act, so it is refused BY NAME and
  // the receipt points at the face that does it on purpose.
  {
    const existing = membersOf(kernel).roster().filter((m) => String(m.id) === str(args.to))[0] || null
    if (existing) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'hire mints a NEW temp member; "' + str(args.to) + '" is already on the roster in slot "' + str(existing.slot) + '"',
        'pass to:"<a new member id>" — moving an existing member between seats is a different act: vibe_vmu_control { action: "hire", member_id, slot } (this face refuses instead of silently re-seating)')
    }
  }
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
  // ★ A7: WHO hires is a fact of the CALL, read from the turn-tool record (the same non-forgeable evidence the
  // face gate uses) — never from `args.member`, which is text the model wrote. Recorded on the roster row so a
  // later `fire` can tell "my own temp worker" from someone else's without trusting the caller again.
  const hiredBy = resolveTurnMember(kernel, exec)
  const hired = await members.hire({ id: str(args.to), slot, by: hiredBy })
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
  const memberScope = applyMemberScope({ kernel, members: [str(args.to)] })
  const hiredByRow = (members.roster().filter((m) => String(m.id) === str(args.to))[0] || {}).hiredBy || null
  return { ok: true, tool: 'vibe_v5_hire', member: str(args.to), slot, slotRequested: slot, hired, hiredBy: hiredByRow,
    hiredByMeans: hiredByRow === null
      ? 'the roster row carries no `hiredBy`: this call ran outside a member turn (a root/office call has no member seat), so no attribution could be recorded — a later `fire` reports ownership "unrecorded" rather than guessing'
      : 'who hired this seat, recorded on the roster row at hire time from the turn-tool record (not from any argument)',
    task: taskWithRegistry, memberScope,
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
    // ★★ LIVE RUN 20 (the institute's own report): after closing a meeting the NEXT reading simply did not contain it,
    // and the receipt could not say whether it had been DROPPED as closed or never seen. openMeetings() already answers
    // that (droppedClosed / addedFromService / source) one layer down - this face was taking only .meetings and
    // throwing the explanation away (the same family as §107: the answer existed and did not travel).
    openMeetingsReading: openMeetings ? { count: meetingRows.length, source: openMeetings.source === undefined ? null : openMeetings.source, droppedClosed: openMeetings.droppedClosed === undefined ? 0 : openMeetings.droppedClosed, addedFromService: openMeetings.addedFromService === undefined ? null : openMeetings.addedFromService, means: openMeetings.droppedClosedMeans === undefined ? null : openMeetings.droppedClosedMeans } : null,
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
    // ★★ LIVE RUN 20: this list is built from the SERVICE live set, so a closed meeting simply vanishes — and the
    // reader could not tell "dropped because it was closed" from "never seen". openMeetings() already distinguishes
    // them one layer down; relaying it is the same rule as `sweep` (a face must not lose the explanation it was given).
    openMeetingsReading: openMeetings
      ? {
        source: openMeetings.source === undefined ? null : openMeetings.source,
        droppedClosed: openMeetings.droppedClosed === undefined ? 0 : openMeetings.droppedClosed,
        addedFromService: openMeetings.addedFromService === undefined ? null : openMeetings.addedFromService,
      }
      : null,
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
  // ★★★ TASK-12 SUPPLEMENT (Lead, run 31 follow-up): THE SAME RUN COULD GIVE TWO ANSWERS TO "CAN I SEE MY OWN TOOLS".
  // `vibe_vmu_tools` (tools/member-tools.js) now names the VOICE and the READING SCOPE on every answer — `voice`,
  // `readingScope`, `callerIsThisMember`, `memberSession` + their means — while this forwarder returned the raw
  // `toolsView` and none of them, so a member comparing the two receipts saw two口径 for one question and could only
  // conclude one of them was broken. The fields are FORWARDED as-is when the kernel reading carries them, and `null`
  // with a sentence in `note` when it does not — they are deliberately NOT recomputed here: a second implementation is
  // exactly what this thin forwarder exists to avoid.
  const SCOPED_FIELDS = ['voice', 'readingScope', 'callerIsThisMember', 'memberSession', 'memberSessionMeans', 'callerMeans']
  const forwarded = {}
  const absentFields = []
  for (const field of SCOPED_FIELDS) {
    const present = view && Object.prototype.hasOwnProperty.call(view, field) && view[field] !== undefined
    forwarded[field] = present ? view[field] : null
    if (!present) absentFields.push(field)
  }
  return Object.assign({}, view, forwarded, { tool: 'vibe_v5_tool_help',
    note: 'thin forwarder: the kernel\'s toolsView reading (the member\'s VISIBLE set from the live provider), not the pack declaration; purpose:null means the host registered no description for that name'
      + (absentFields.length === 0 ? ''
        : '；' + absentFields.join('/') + ' 在本侧读数为 null：该读数在这一侧不存在（toolsView 没有带它），本面不自行推算——要读声音/视角就读 vibe_vmu_tools 的同名字段') })
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

/** The roster fields a kernel MAY use to publish "who hired this member". This kernel publishes none of them (see the
 *  block above `toolFire`), so this list is a READ list, not a writer's schema: it lets a kernel that DOES keep the
 *  record answer the ownership question without a second table in the pack. */
const FIRE_ATTRIBUTION_FIELDS = Object.freeze(['hiredBy', 'invitedBy', 'owner'])

/** Who does the roster SAY hired this member? `null` = it does not say. A row may carry the id as a string or as
 *  `{id}`; anything else is not an attribution (guessing here would invent the very fact being checked). */
function fireAttribution(row) {
  if (!row || typeof row !== 'object') return null
  for (const field of FIRE_ATTRIBUTION_FIELDS) {
    const raw = row[field]
    const by = typeof raw === 'string' ? raw.trim() : (raw && typeof raw.id === 'string' ? raw.id.trim() : '')
    if (by !== '' && by !== str(row.id)) return { by, field }
  }
  return null
}

/**
 * ★ `vibe_v5_fire` — dismiss a TEMP worker for real. The members face has `end(id, reason)`, and the task ledger can
 * move that member's open tasks to `cancelled` — both published capabilities, so the handler composes them. The
 * original also DROPPED its mail; the mailbox face has no per-member purge this pack may call, so it is reported.
 *
 * ★★ A7 — THE FACE NOW NAMES ITS SCOPE (round 31 follow-up, Lead order after the seat-face declaration landed).
 * `seat-faces.js` declares `vibe_v5_fire: allow {chair:true, member:true, temp:false}` and the sentence behind that
 * decision is 「院士、常驻研究员各自的…」/「常驻研究员解雇**自己雇的**那名临时工」. Until these two guards existed the face
 * ended ANY live roster row, so a member seat could dismiss the academician and the declaration's sentence was prose
 * with nothing behind it. Both guards read faces the kernel ALREADY publishes (the roster row and the turn-tool
 * record) — no new kernel state, no new code:
 *   ① THE ACADEMICIAN SEAT IS NOT DISMISSABLE BY A TOOL CALL. The chair seat is settled by the flow / the office, so
 *      the face refuses BY NAME and points at the face that does re-seat (`vibe_vmu_control {action:"fire"}`). This
 *      guard applies to EVERY caller, office included: a tool that can end the institute's chair is a foot-gun, and
 *      the office has a face that says what it is doing.
 *   ② A MEMBER-SEAT CALLER dismisses TEMP seats only, and (where the kernel records it) only a temp worker of its own.
 * WHERE THE ATTRIBUTION COMES FROM — AND WHAT IT CANNOT SAY. `kernel.members.roster()` rows are
 * `{id, slot, state, since, wakes, endedAt, endedReason}` (kernel/members.js:118-123): this kernel records WHO HIRED
 * WHOM NOWHERE — members.js keeps no `by`, tasks.js keeps no creator, and `recruit.staff`'s `by` is neither published
 * by `recruit.state()` nor reachable from v5r's hire/start path (both go through `members.hire`). So the ownership
 * question is answered from the roster row IF the kernel publishes an attribution field, otherwise the receipt says
 * `ownership: "unrecorded"`, the call is ALLOWED, and `ownershipMeans` states plainly that this roster keeps no hiring
 * record. Both halves are deliberate: refusing on a fact the roster does not hold would make a temp worker
 * un-dismissable (the very defect that put this guard here), and staying silent about it would pretend a check ran.
 * The `own`/`not-own` branches are reachable exactly on a kernel that publishes the field — the test proves both on a
 * stub roster AND the live path on this kernel's real one. Making the LIVE distinction real is a hire-time record
 * (kernel/members.js or `toolHire`), which is outside this card's write face and is reported, not done here.
 * CALLER. `exec` → `resolveTurnMember` (see the import note above); `null` is a real answer (root/office), so the call
 * is not refused on it — it is DISCLOSED (`callerUnknown: true`) and only guard ① applies. The three disclosure
 * fields travel on the REFUSAL TOO (as a returned receipt, not a throw: `host.js` keeps code/message/hint on a throw
 * and this refusal must carry the same three facts the success path carries).
 */
async function toolFire(args = {}, { kernel, exec = null } = {}) {
  if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'fire needs the member id', 'pass id:"<roster id>"')
  const id = str(args.id)
  const roster = membersOf(kernel).roster()
  const row = roster.filter((m) => m.id === id)[0]
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', 'the roster holds the live ids')
  const targetSeat = str(row.slot)
  // ── the caller: the turn-tool record, never `args.member` (model-typed text) ─────────────────────────────────
  const caller = resolveTurnMember(kernel, exec)
  const callerRow = caller === null ? null : (roster.filter((m) => str(m.id) === str(caller))[0] || null)
  const callerSeat = callerRow === null ? null : str(callerRow.slot)
  const attribution = fireAttribution(row)
  const ownership = attribution === null
    ? 'unrecorded'
    : (caller !== null && attribution.by === str(caller) ? 'own' : 'not-own')
  const ownershipMeans = attribution !== null
    ? 'the roster attributes "' + id + '" to "' + attribution.by + '" (field `' + attribution.field + '`)'
      + (ownership === 'own' ? ' — this is the caller\'s own temp worker.' : ' — not to the caller "' + str(caller || '(unknown)') + '".')
    : 'this roster records NO hiring attribution ("' + id + '" is '
      + JSON.stringify({ id: str(row.id), slot: targetSeat, state: row.state === undefined ? null : row.state })
      + ' and nothing else): members.js keeps no `hiredBy`, the task board keeps no creator, so "is this temp worker mine" cannot be answered from what this kernel publishes. '
      + 'The call is ALLOWED and reported as unrecorded rather than refused on a fact the roster does not hold (a seat that cannot read attribution must not pretend it can, and must not make a temp worker un-dismissable).'
  const disclosure = {
    targetSeat,
    ownership,
    ownershipMeans,
    caller,
    callerSeat,
    callerUnknown: caller === null,
  }
  // ── ⓪ A SESSION WE CANNOT NAME IS NOT THE OFFICE (F-116b, run 116) ──────────────────────────────────────────
  // Measured on a real machine: r-2 fired r-1's temp worker and the receipt said `ownership:"not-own"` with
  // `caller:null` — while `ok` stayed true. Every member rule here is keyed on a caller, so an unnamed caller walked
  // past them; and "not-own with no caller" is exactly the shape of a member whose session was not mapped.
  // The distinction that IS available: the office calls arrive with no `exec` at all, and a tool call from a SESSION
  // carries `exec.agent.id`, whose root form starts with `session-` (member child sessions do not — the same shape
  // `kit/handlers.js#toolRecordProgress` already keys on). So: attributed target + unmapped NON-root session ⇒ refuse
  // by name instead of allowing on a fact we do not hold. `looksLikeOffice` stays true when there is no exec.
  const agentId = exec && exec.agent && typeof exec.agent.id === 'string' ? exec.agent.id : null
  const looksLikeOffice = agentId === null || agentId === '' || agentId.startsWith('session-')
  if (caller === null && attribution !== null && !looksLikeOffice) {
    return Object.assign({}, disclosure, {
      ok: false,
      code: 'VMU_FIRE_CALLER_UNKNOWN',
      message: 'this call came from a session this kernel cannot map to a member (' + agentId + '), and "' + id + '" is attributed to "' + attribution.by + '": an unnamed caller may not dismiss a temp worker it cannot prove it hired',
      hint: 'the kernel of the calling member must be able to name its own session (kernel.memberBySession - see docs/26 ROUND 115); if you are the office, fire through a root call (no member session) or ask "' + attribution.by + '" to dismiss it',
    })
  }
  // ── ① THE CHAIR SEAT IS NOT DISMISSABLE BY A TOOL (any caller, office included) ───────────────────────────────
  if (targetSeat === 'chair') {
    return Object.assign({}, disclosure, {
      ok: false,
      code: 'VMU_NOT_PERMITTED',
      message: 'the academician seat is not dismissable through vibe_v5_fire: "' + id + '" holds slot "chair"',
      hint: 'the chair seat is settled by the flow / the office, not by a member tool call — use vibe_vmu_control { action: "fire", member_id: "' + id + '" } if the institute really is to lose its chair (this face refuses instead of silently ending it)',
    })
  }
  // ── ② A MEMBER-SEAT CALLER: temp seats only, and (where recorded) only its own ─────────────────────────────────
  if (callerSeat === 'member') {
    if (targetSeat !== 'temp') {
      return Object.assign({}, disclosure, {
        ok: false,
        code: 'VMU_NOT_PERMITTED',
        message: 'a member seat may only dismiss TEMP workers: "' + id + '" holds slot "' + targetSeat + '"',
        hint: 'dismissing a fellow member / the chair is not a member right (seat-faces.js: `vibe_v5_fire` is scoped to temp workers) — raise it with the academician or the office instead',
      })
    }
    if (ownership === 'not-own') {
      return Object.assign({}, disclosure, {
        ok: false,
        code: 'VMU_NOT_PERMITTED',
        message: 'a member seat may only dismiss ITS OWN temp worker: "' + id + '" is attributed to "' + attribution.by + '", not to the caller',
        hint: 'ask that member (or the academician, who runs the institute\'s staffing) to dismiss it — ownership is read from the roster field the kernel publishes, and this call is not the owner',
      })
    }
  }
  if (callerSeat !== null && callerSeat !== 'member' && callerSeat !== 'chair') {
    // A temp seat has no dismissal right at all (the declaration says `allow.temp === false`; the seat face gate
    // already refuses the call before it gets here — this is the same rule when a seam calls the handler directly).
    return Object.assign({}, disclosure, {
      ok: false,
      code: 'VMU_NOT_PERMITTED',
      message: 'slot "' + callerSeat + '" has no dismissal right: only the academician and a member seat may dismiss a temp worker',
      hint: 'the seat face already refuses this face for slot "' + callerSeat + '" (seat-faces.js declares fire: { chair: true, member: true, temp: false })',
    })
  }
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
  return Object.assign({}, disclosure, {
    ok: true, tool: 'vibe_v5_fire', id, slot: row.slot, ended, cancelledTasks: cancelled,
    note: 'mail is not purged (the mailbox face exposes no per-member purge this pack may call) — reported, not pretended',
  })
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
const FEEDBACK_OP_WORDS = Object.freeze(['add', 'update', 'list'])
/** The fifth REQUIRED body field of the original feedback form is literally called `action` — "what you recommend".
 * ★ LIVE RUN 61 (a member's own feedback): the caller passed `{ action:"add", … }` and the face accepted it as the
 * OPERATION, then stored `action：add` as the body field — the one thing the form asks for ("what should change") was
 * replaced by the verb that said which operation to run. ONE KEY, TWO MEANINGS is the defect, so: the operation is `op`;
 * the body field is `action` (legacy) or `recommendation` (preferred); and an `action` whose value is just an op word is
 * refused by name instead of being stored as a recommendation.
 * ★ LIVE RUN 62 (the same member read the stored card back): the input parameter had been renamed but the DURABLE row
 * still labelled the recommendation `action：` — the record itself kept teaching the old one-key-two-meanings shape to
 * every later reader. The stored line is now `recommendation：`; the legacy INPUT key keeps working. */
function feedbackBodyAction(args = {}) {
  const preferred = has(args.recommendation) ? str(args.recommendation).trim() : ''
  if (preferred) return preferred
  const legacy = has(args.action) ? str(args.action).trim() : ''
  if (!legacy) return ''
  if (FEEDBACK_OP_WORDS.indexOf(legacy) !== -1) return ''
  return legacy
}
function toolFeedback(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const op = has(args.op) ? str(args.op) : (FEEDBACK_OP_WORDS.indexOf(str(args.action).trim()) !== -1 ? str(args.action).trim() : '')
  if (op !== 'add' && op !== 'update' && op !== 'list') {
    throw refuse('VMU_INVALID_ARGUMENT', 'feedback needs op=add|update|list', 'pass op:"add" / "update" / "list" — the `action` key is the BODY field (what you recommend), not the operation')
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
    const bodyAction = feedbackBodyAction(args)
    if (!bodyAction && (has(args.action) || has(args.recommendation))) {
      throw refuse('VMU_FEEDBACK_ACTION_IS_THE_OPERATION',
        'feedback add got action:"' + str(args.action) + '" — that is the OPERATION word, not the recommendation',
        'pass the operation as op:"add" and the recommendation as recommendation:"what should change" (the legacy body key `action` still works when its value is not an op word)')
    }
    const missing = FEEDBACK_ADD_REQUIRED.filter((k) => k !== 'action' && !has(args[k])).concat(bodyAction ? [] : ['action'])
    if (missing.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'feedback add is missing REQUIRED field(s): ' + missing.join(', '),
        'the original required category/route/phenomenon/impact/action — pass the fifth one as recommendation or action')
    }
    if (str(args.route) === 'interpersonal' && !has(args.assessment)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the interpersonal route REQUIRES assessment',
        'pass assessment:"your judgement of the interpersonal situation" (required by the original)')
    }
    const body = ['category：' + str(args.category), 'route：' + str(args.route), 'context：' + str(args.context),
      'phenomenon：' + str(args.phenomenon), 'impact：' + str(args.impact), 'recommendation：' + bodyAction,
      'assessment：' + str(args.assessment)].filter((l) => !l.endsWith('：')).join('\n')
    const written = records.put({ track: 'feedback', kind: 'feedback', title: str(args.category) + '/' + str(args.route), body, settled: false, by: str(args.member) || null /* ★ LIVE RUN 50 (F-32): a tool name is not an author. The office-side call carried no member, and the ledger recorded owner:"vibe_v5_feedback" while a member-side call recorded the member id - two answers to "who wrote this" from one tool. Null + the ledger's own bySource is the honest answer; the caller can pass member to say who it is. */ })
    return { ok: true, tool: 'vibe_v5_feedback', op, recordId: written && written.id, status: 'open' }
  }
  if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'feedback update needs id', 'pass id:"<feedback record id>"')
  const body = ['status：' + (has(args.status) ? str(args.status) : 'closed'), 'outcome：' + str(args.outcome), 'note：' + str(args.note)]
    .filter((l) => !l.endsWith('：')).join('\n')
  const written = records.put({ id: str(args.id), track: 'feedback', kind: 'feedback', title: str(args.id), body,
    settled: has(args.status) && str(args.status) === 'closed', by: str(args.member) || null /* ★ LIVE RUN 50 (F-32): a tool name is not an author. The office-side call carried no member, and the ledger recorded owner:"vibe_v5_feedback" while a member-side call recorded the member id - two answers to "who wrote this" from one tool. Null + the ledger's own bySource is the honest answer; the caller can pass member to say who it is. */ })
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
  // ★★ ROUND 87 / LIVE RUN 86 (F-86a): THE GATE'S ONLY DECLARED ANSWERER WAS UNREACHABLE. `vmu.paper.officeConsult`
  // defaults to "required", so `final` asks the OFFICE a question; `PAPER_CONSULT_ROLES` declares "office" as the one
  // answerer; and `consult {member:"office"}` was refused `VMU_NO_SUCH_OBJECT "no member office on this roster"` — a
  // roster is about RESEARCHERS, while the office is the session running the work. The gate therefore could only time
  // out (or the chair had to turn the policy off), which is exactly the "mechanism with no reachable consumer" shape.
  // The declared ROLE token is now answerable without a seat, and the receipt SAYS which kind of identity answered.
  const declaredRole = PAPER_CONSULT_ROLES.filter((r) => String(r) === String(member))[0] || null
  let row = null
  if (declaredRole) {
    try {
      row = requireSeat(kernel, member, 'paper consult (answering the office pre-finalisation question)')
      row.answererKind = 'roster-seat'
    } catch (e) {
      row = { id: String(member), slot: null, state: 'live', onRoster: false, answererKind: 'declared-role' }
    }
  } else {
    row = requireSeat(kernel, member, 'paper consult (answering the office pre-finalisation question)')
    row.answererKind = 'roster-seat'
  }
  if (row.onRoster === false) return row
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
  // ★★ RUN 113 (lane evidence, B3): the gate HAD computed the answers a caller needs (`p1Route:null`,
  // `p1RouteMeans`, `p1Routes: [...]`) and this function rebuilt the receipt from four fields, so the refusal said less
  // than the gate knew. A refusal that drops the gate's own facts is a second, quieter kind of the run-52 defect.
  const out = { ok: false, code: gate.code || 'VMU_STATE', message,
    hint: gate.hint || 'the rule requires evidence this call did not carry; record the estimate and let the debate produce the conclusion',
    enforced: Array.isArray(gate.keys) ? gate.keys.slice() : [], enforcedScope: ENFORCED_SCOPE }
  for (const k of Object.keys(gate)) {
    if (GATE_RECEIPT_RESERVED.indexOf(k) >= 0) continue
    if (gate[k] === undefined) continue
    out[k] = gate[k]
  }
  return out
}
/** Keys the receipt above already speaks for; every OTHER key the gate reported is carried through verbatim. */
const GATE_RECEIPT_RESERVED = ['allowed', 'ok', 'code', 'message', 'hint', 'reason', 'question', 'options', 'keys']
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
    // ★★ LIVE RUN 48 (F-23): "this card cannot be judged" is NOT "its author declared nothing". The old projection
    // reported proofRef/proofState as '' here, and the debate gate forwarded that as 「没有任何登记」 — while the card
    // body plainly carried `- proofRef：…、- proofState：complete`. That is a readout lying about its own subject: the
    // gate must be able to say "unjudgeable, and here is what the author wrote", or the caller cannot tell a missing
    // registration from a parser problem (and will re-register a card that was already registered).
    const partial = (parsed && parsed.fields) || {}
    return { id: has(id) ? str(id) : null, p: null,
      proofRef: partial.proofRef === undefined ? '' : str(partial.proofRef),
      proofState: partial.proofState === undefined ? '' : str(partial.proofState),
      declaredYet: partial.proofRef !== undefined || partial.proofState !== undefined,
      bodyTruncated: row.bodyTruncated === true,
      unjudgeable: parsed && parsed.reason ? str(parsed.reason)
        : (parsed && Array.isArray(parsed.problems) && parsed.problems.length ? parsed.problems.join('; ')
          : 'the card body could not be parsed') }
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
/** ★ B2: the LITERATURE evidence a card write may claim — `literature_ref` is the citation itself (a non-empty
 *  string). Like the debate/lean forms, the gate proves "no citation ⇒ refuse"; it cannot prove the citation is
 *  real, and the verified row records the citation as its warrant so "why is this settled" names a source. */
function literatureEvidenceOf(args = {}) {
  const reference = has(args.literature_ref) ? str(args.literature_ref).trim() : ''
  if (!reference) return null
  const subject = has(args.card_id) ? str(args.card_id) : (has(args.id) ? str(args.id) : null)
  return { reference, subject }
}
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
    // ★ ROUND 92 / F-92a (live run 92): the seat gate keyed on the CALLER, and the office has no seat, so
    // `vibe_v5_record_method { member: "<a temp worker>" }` was accepted while seat-faces.js declares
    // `allow.temp === false` for that face — a card attributed to a seat that seat may not write. The
    // attributed member's seat is checked here, against the declared table, by NAME.
    if (by) {
      const seatRow = membersOf(kernel).roster().filter((m) => String(m.id) === by)[0] || null
      if (seatRow) {
        const decision = seatDecisionOf(String(seatRow.slot), toolName)
        if (decision.allowed !== true) {
          throw refuse('VMU_NOT_PERMITTED',
            toolName + ' is not one of the faces the ' + String(seatRow.slot) + ' seat holds: "' + by + '" is in slot "' + String(seatRow.slot) + '"',
            'rule ' + str(decision.rule || '?') + ': ' + str(decision.why || 'no declared decision')
              + ' — a card attributed to a seat is a card that seat must be allowed to write; pass member:"<a seat that holds this face>" or write the card as the office (omit member)')
        }
      }
    }
    const writerGate = singleWriter({ records, cardId, by, writer: toolName, track })
    const writerRefusal = gateRefuse(writerGate)
    if (writerRefusal) return writerRefusal
    const gates = [writerGate]
    let p1Form = null
    let p1Route = null
    let p1RouteMeans = null
    if (toolName === 'vibe_v5_record_proposition') {
      // The three evidences the rule accepts. `debate` and `lean` come from the CALLER's args (a card write cannot go
      // and hold a debate); `verified` is read from the records face, so it is not claimable by argument at all.
      const evidence = { verified: verifiedRowOf(records, cardId, kernel && kernel.fidelity),
        debate: debateEvidenceOf(args), lean: leanEvidenceOf(kernel, args), literature: literatureEvidenceOf(args) }
      // `card` carries the id for evidence matching and the truncation FACT, but NOT the old p: the value under judgement
      // is the one being written (p1Intent:95 prefers card.p, so handing it the stored row would judge yesterday's value).
      const stored = cardProjectionOf(records, cardId)
      const card = cardId === null ? null : { id: cardId, bodyTruncated: !!(stored && stored.bodyTruncated) }
      const pGate = p1Intent({ tool: toolName, args, card, evidence })
      const pRefusal = gateRefuse(pGate)
      if (pRefusal) return pRefusal
      gates.push(pGate)
      p1Form = pGate.evidenceForm === undefined ? null : pGate.evidenceForm
      // ★ B3：回执必须说清本行 p=1 的凭据是**哪一条路**（辩论 / 参考文献 / Lean conform / 已有 verified 行）。
      p1Route = pGate.p1Route === undefined ? null : pGate.p1Route
      p1RouteMeans = pGate.p1RouteMeans === undefined ? null : pGate.p1RouteMeans
    }
    const res = inner(args, ctx)
    if (!res || typeof res !== 'object' || Array.isArray(res)) return res
    return Object.assign({}, res, { enforced: enforcedOf(gates), enforcedScope: ENFORCED_SCOPE },
      p1Form === null ? {} : { p1Evidence: p1Form, p1Route, p1RouteMeans })
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
  const stored = cardProjectionOf(records, sourceId)
  const writerGate = singleWriter({ records, cardId: sourceId, by: member, writer: 'promoteVerified', track: VERIFIED_TRACK })
  const writerRefusal = gateRefuse(writerGate)
  if (writerRefusal) return writerRefusal
  const warrantKind = has(args.warrant_kind) ? str(args.warrant_kind).trim() : ''
  // ★ B2: a literature promotion names its SOURCE as the warrant. The caller still passes warrant_kind:"literature"
  //   and `literature_ref`; the row's warrant id becomes the citation, so "why settled" = "it is theorem X of Y".
  let warrantId = has(args.warrant) ? str(args.warrant).trim() : ''
  if (warrantKind === 'literature') {
    const reference = has(args.literature_ref) ? str(args.literature_ref).trim() : ''
    if (!reference) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a literature promotion needs the citation it comes from',
        'pass literature_ref:"<作者, 出处, 定理/页码>" (warrant_kind:"literature" without a source is an assertion, not a promotion)')
    }
    warrantId = reference
  }
  if (!warrantId || !warrantKind) {
    throw refuse('VMU_INVALID_ARGUMENT', 'promote needs the warrant that produced this conclusion — the judge, not a preference',
      'pass warrant:"<debate/ballot ruling id>" warrant_kind:"debate-unanimous" (or "lean-conformance" once that ruling exists)')
  }
  // ★ ROUND 97 (B1, independent audit): A CALLER-SUPPLIED WARRANT USED TO MINT A VERIFIED ROW WITHOUT THE GATE.
  // `promoteVerified` is a second write path into the same track as a p=1 card write, and it only checked the SHAPE of
  // the argument (id + kind) — so `warrant_kind:"debate-unanimous"` with no debate at all produced a verified row.
  // The four admissible evidences are the SAME ones a p=1 write must show; the gate now runs here too, and the row's
  // `source` must name the evidence that actually passed (the kind is what makes "why is this settled" answerable).
  const promoteCard = stored
    ? { id: sourceId, p: stored.p, bodyTruncated: !!stored.bodyTruncated }
    : { id: sourceId }
  const promoteEvidence = {
    verified: null,
    debate: debateEvidenceOf(args),
    lean: leanEvidenceOf(kernel, args),
    literature: literatureEvidenceOf({ card_id: sourceId, literature_ref: has(args.literature_ref) ? args.literature_ref : null }),
  }
  const FORM_OF_KIND = { 'debate-unanimous': 'debate-unanimous', 'lean-conformance': 'lean-conformance', literature: 'literature-reference' }
  const expectedForm = FORM_OF_KIND[warrantKind] || null
  if (!expectedForm) {
    throw refuse('VMU_INVALID_ARGUMENT', 'warrant_kind "' + warrantKind + '" is not one of the admitted conclusion forms',
      'the three forms a verdict can be promoted with are: debate-unanimous, lean-conformance, literature')
  }
  if (stored && Number.isFinite(Number(stored.p)) && Number(stored.p) !== 1 && Number(stored.p) !== 0) {
    throw refuse('VMU_STATE', 'card ' + sourceId + ' is not settled (p=' + String(stored.p) + '), so it cannot enter the verified track',
      'only a settled conclusion (p=1, or p=0 with the unanimous ruling that refuted it) may be promoted: p in (0,1) is a preference, not a conclusion')
  }
  let pGate = null
  if (promoteCard.p === 0) {
    // A disproof is a conclusion too, and it needs the ruling that produced it: unanimous, at value 0, about THIS card.
    const ruling = debateEvidenceOf(args)
    const unanimousZero = ruling && String(ruling.mode) === 'unanimous' && Number(ruling.value) === 0
    const subjectOk = !ruling || !ruling.subject || ruling.subject === sourceId
    if (!unanimousZero || !subjectOk || expectedForm !== 'debate-unanimous') {
      throw refuse('VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE', 'promoting the DISPROOF of card ' + sourceId + ' needs the unanimous ruling that refuted it (mode:"unanimous", value:0' + (ruling && ruling.subject ? ', subject:' + sourceId : '') + ')',
        'pass debate_ruling:{mode:"unanimous", value:0, subject:"' + sourceId + '", ballotId:"<the ruling id>"} with warrant_kind:"debate-unanimous" — a p=0 row claims "we know this is false", so it must name what decided that too')
    }
  } else {
    pGate = p1Intent({ tool: 'vibe_v5_verified_promote', args, card: promoteCard, evidence: promoteEvidence })
    const pRefusal = gateRefuse(pGate)
    if (pRefusal) return pRefusal
    if (pGate.evidenceForm !== expectedForm) {
      throw refuse('VMU_PACK_V5R_P1_NEEDS_DEBATE', 'the promotion claims warrant_kind "' + warrantKind + '" but the evidence that passed is "' + String(pGate.evidenceForm) + '"',
        'pass the evidence the kind names: a debate ruling (mode unanimous, value 1) for debate-unanimous, a passed Lean job WITH its conformance decision for lean-conformance, a non-empty literature_ref for literature')
    }
  }
  const promoted = promoteVerified({ records, sourceId,
    warrant: { id: warrantId, kind: warrantKind, subject: sourceId },
    by: member, fidelity: kernel && kernel.fidelity ? kernel.fidelity : null })
  return Object.assign({ ok: true, tool: 'vibe_v5_verified_promote', card: sourceId,
    warrant: { id: warrantId, kind: warrantKind },
    p1Evidence: pGate === null ? 'debate-unanimous (p=0 disproof)' : pGate.evidenceForm,
    // ★ B3：p=0 的否证也由辩论裁决产生，所以它同样有一条路名，并说清它与 p=1 的三条路的关系。
    p1Route: pGate === null ? 'debate' : (pGate.p1Route === undefined ? null : pGate.p1Route),
    p1RouteMeans: pGate === null
      ? '`debate`：这条 p=0 定论的凭据是**全体一致的否证裁决**（mode:"unanimous", value:0）—— 它不是 p=1 的路径，但同样是辩论定的，不是自述。'
      : (pGate.p1RouteMeans === undefined ? null : pGate.p1RouteMeans),
    enforced: enforcedOf(pGate === null ? [writerGate] : [writerGate, pGate]), enforcedScope: ENFORCED_SCOPE,
    note: 'the verified row is a SECOND carrier beside the card: the card keeps its p, the verified row keeps the JUDGE (warrant), so "why is this settled" is answerable instead of asserted' }, promoted)
}

/**
 * ★ D15 · THE DEBATE'S FINAL RULING — the pack half of "收各成员最终裁决 → 全一致取该值否则取均值 → 通知命题卡持有者".
 * The kernel face (vmu.meetingverdict) owns the arithmetic and the notice. THIS function owns the three things the
 * kernel cannot know: WHICH meeting the ruling belongs to (so the signer is that meeting's chair, NAMED — an anonymous
 * ruling is not a ruling), WHETHER the fidelity question was answered before a number is announced (④), and the
 * operator's receipt (`enforced`). It is an EXPLICIT act: nothing is hooked onto meetings.close.
 */
async function toolVerdictFinal(args = {}, { kernel } = {}) {
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
  // ★★★ TASK-12 / RUN 31 — THE SUBMISSIONS ARE COLLECTED HERE, AND THE CHAIR NO LONGER HAS TO TYPE THEM.
  // Before this, `verdicts` was REQUIRED, so the only way to produce a ruling was for the chair to write every
  // member's number itself — and `coverage.complete:true` then measured the roster, not a submission (run 31: the
  // receipt said complete while no member had submitted anything). The members now file their own rulings with
  // `vibe_v5_verdict { meeting, proposition_id, verdict, reason }`, and this face READS THEM BACK from the library.
  // `verdicts` stays available (a member with no card, a number the chair must record) — but an explicit empty array
  // is still refused, because "I passed none" and "I passed an empty set" are different mistakes.
  const filed = await rulingSubmissionsOf(kernel, { meeting, proposition: propositionId })
  const typed = Array.isArray(args.verdicts) ? args.verdicts : null
  if (typed && typed.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the final ruling needs the members\' verdicts — an empty set has no value',
      'omit verdicts to adopt every ruling the members filed with vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }, or pass verdicts:[{member,p,reason}] explicitly')
  }
  const verdicts = typed || filed.rows.map((r) => ({ member: r.member, p: r.verdict, reason: r.reason }))
  if (verdicts.length === 0) {
    throw refuse('VMU_RULING_NO_SUBMISSIONS', 'no member has filed a final ruling on ' + propositionId + (filed.readable ? '' : ' and the ledger could not be read (' + String(filed.why) + ')') + ', and no verdicts were passed, so there is nothing to aggregate',
      'ask the members who debated (vibe_v5_verdict_ask { meeting, proposition_id }) — each answers with vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }, and this face then collects them by itself')
  }
  // ★ THE RULE FIRST SENTENCE, ENFORCED: 「框架请各个辩论的各个成员给出最终裁决」 — so a ruling that silently
  // averages only the members the chair happened to collect is refused BY NAME, listing who is missing. The expected
  // set is read from the meeting minutes (never from a parameter), and an EMPTY set means "no debate on record" —
  // then there is nothing to enforce and the ruling proceeds (that is what keeps a plain proposition ruling working).
  const debated = debatedMembersOf(kernel, meeting)
  const provided = verdicts.map((v) => (v && has(v.member) ? str(v.member) : '')).filter(Boolean)
  const missing = debated.members.filter((m2) => !provided.includes(m2))
  const partial = args.partial === true
  if (missing.length > 0 && !partial) {
    throw refuse('VMU_STATE', 'the ruling is missing ' + missing.length + ' of the ' + debated.members.length + ' member(s) who debated: ' + missing.join('、'),
      'ask them for a final ruling first (vibe_v5_verdict_ask { meeting, proposition_id }) and pass every verdict — or, if the chair deliberately rules on a partial set, pass partial:true with why:"<理由>" so the receipt records that this number is not the whole debate')
  }
  if (partial && missing.length > 0 && !has(args.why)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'a partial ruling must say why (the missing verdicts are ' + missing.join('、') + ')',
      'pass why:"<why the remaining members have no verdict in this number>" — a partial number without a reason reads like a full one')
  }
  // ★★★ TASK-12 — PER-ROW ATTRIBUTION: for every number in the tally, where it CAME FROM. A filed ruling is the
  // member's own act; a typed row is the chair's transcription. The receipt has to say which is which, because "the
  // chair typed 1 for res-01" and "res-01 filed 1" are different facts that used to look identical on this receipt.
  const submittedByMember = new Map(filed.rows.map((r) => [r.member, r]))
  const contradictions = []
  const attribution = verdicts.map((row) => {
    const m = row && has(row.member) ? str(row.member) : ''
    const p = row && row.p !== undefined && row.p !== null ? Number(row.p) : null
    const sub = submittedByMember.get(m) || null
    if (sub && p !== null && Number(sub.verdict) !== p) {
      contradictions.push({ member: m, typed: p, submitted: Number(sub.verdict), submission: { id: sub.id, path: sub.path, at: sub.at } })
    }
    return { member: m, verdict: p, source: sub ? 'submission' : 'chair-typed',
      submission: sub ? { id: sub.id, path: sub.path, at: sub.at } : null,
      at: sub ? sub.at : null,
      reason: row && row.reason !== undefined && row.reason !== null ? String(row.reason) : null }
  })
  // A CHAIR MAY NOT REWRITE A MEMBER'S OWN RULING. Before this channel the chair typed everyone's number and nothing
  // compared the two; now that a filed ruling exists, typing a different number is not a correction, it is an
  // overwrite — refused by NAME, with both numbers, so the choice goes back to the member.
  if (contradictions.length > 0) {
    throw refuse('VMU_RULING_CONTRADICTS_SUBMISSION',
      'the chair typed a different number for ' + contradictions.map((c) => '"' + c.member + '"').join('、') + ' than that member filed itself ('
        + contradictions.map((c) => String(c.typed) + ' typed vs ' + String(c.submitted) + ' filed').join('; ') + ') — a filed ruling is the member\'s own act',
      'drop that member\'s typed row and let the filed ruling stand (omit `verdicts` entirely to adopt every filed ruling); if the filed number is wrong, the member says so and the chair rules on the set the receipts show')
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
  // ★★★ TASK-12 / F4 — "notified" NEXT TO `delivery.result {delivered:0, queued:1}` READS AS "RECEIVED", AND IT IS NOT.
  // The send port accepts a message into the holder's INBOX and reports `delivered:0, queued:1`; nothing has been
  // PUSHED into a live turn and the holder has not read anything. A reader of this receipt could not tell that apart
  // from "the owner has seen it" — the same class of reading defect as run 30's `satisfiedBy:false` beside `ok:true`.
  // So the pair now carries its own disambiguator: `notificationState` names what actually happened, and the sentence
  // says "there is a copy waiting in that mailbox", never "the owner was told".
  const deliveryResult = delivery && delivery.result && typeof delivery.result === 'object' ? delivery.result : null
  const deliveredCount = deliveryResult && Number.isFinite(Number(deliveryResult.delivered)) ? Number(deliveryResult.delivered) : null
  const queuedCount = deliveryResult && Number.isFinite(Number(deliveryResult.queued)) ? Number(deliveryResult.queued) : null
  const notificationState = selfAddressed ? 'self-addressed'
    : delivery.attempted !== true ? 'not-attempted'
      : delivery.ok !== true ? 'failed'
        : (deliveredCount !== null && deliveredCount > 0 ? 'delivered'
          : (queuedCount !== null && queuedCount > 0 ? 'queued' : 'accepted'))
  const notificationMeans = notificationState === 'delivered'
    ? 'the notice was PUSHED into ' + owner + '\'s live turn (the send port reported delivered=' + String(deliveredCount) + ') — that is the only state in which "the owner was told" is literally true'
    : notificationState === 'queued'
      ? 'the notice is IN ' + owner + '\'s INBOX but the owner has NOT read it: the send port queued it (delivered=0, queued=' + String(queuedCount) + '). `notified` therefore means "a copy is waiting in that mailbox", NOT "the owner has seen it" — they read it on their next turn'
      : notificationState === 'self-addressed'
        ? 'no mailbox copy was made: the owner IS the chair who signed, and a message may not be addressed to its own sender — the ruling is already on this receipt'
        : notificationState === 'failed'
          ? 'the send port REFUSED the message (see delivery.code): no copy exists in that mailbox and the owner was NOT told'
          : notificationState === 'accepted'
            ? 'the send port accepted the message but reported no delivered/queued counts, so whether it was pushed or is waiting cannot be told from this receipt (delivery.result is absent or partial)'
            : 'no send port was bound, so no mailbox copy exists and the owner was not told'
  const notification = { state: notificationState, recipient: owner, delivered: deliveredCount, queued: queuedCount,
    inboxCopy: notified.length > 0, means: notificationMeans }
  // ★ LIVE RUN 7 (agent feedback item d): 「表决人数下限 = min(用户设置, 院士+常驻研究员)」 had NO landing point on this
  // receipt — the agent could read `n:2` and `mode` but never the floor the ruling was supposed to satisfy. The kernel
  // face already computes it (`meetings.quorum()` → the same `quorumOf` the close rail enforces), so it is READ here
  // rather than re-derived: a second copy of the formula is exactly the kind of second authority this project refuses.
  // ★★ RUN 30 (the institute's own report, item ③): the receipt carried `floor{minVotes:3, satisfiedBy:false}` beside
  // `ok:true` and `n:2`, and the office read the pair as "the framework skipped a check it promised". Nothing was
  // skipped: `floor` is the VOTE floor the CLOSING rail enforces (the same quorumOf()), and a RULING is not a vote —
  // this face deliberately does not refuse for an unmet floor (a ruling over a partial set is legal when it says why,
  // see coverage.partial). The numbers are the kernel's (a second copy of the formula would be a second authority),
  // and the sentence that says what they MEAN is this face's job.
  const floor = (() => {
    const faceM = kernel && kernel.meetings
    if (!faceM || typeof faceM.quorum !== 'function') return { readable: false, why: 'the kernel publishes no quorum() reading', means: null }
    try {
      const q = faceM.quorum({ meeting })
      const required = q && q.required !== undefined ? q.required : null
      const n = ruled && ruled.n !== undefined && ruled.n !== null ? Number(ruled.n) : null
      return { readable: true, minVotes: required,
        min: q && q.min !== undefined ? q.min : null, roster: q && q.roster !== undefined ? q.roster : null,
        eligibleUniverse: q && q.capUniverse !== undefined ? q.capUniverse : null,
        cap: q && q.cap !== undefined ? q.cap : null,
        formula: q && q.capPolicy ? q.capPolicy : null,
        satisfiedBy: ruled && Array.isArray(ruled.perMember) ? (Number(ruled.n) >= Number(q && q.required)) : null,
        // ★ the sentence that keeps `satisfiedBy:false` from being read as "a gate was skipped": this is the quorum the
        // CLOSE rail enforces, it counts the CHAIR (the v5r rule is 「表决人数 ≥ min(用户设置数, 院士+常驻研究员数)」, and the
        // chair holds one of those seats), and the ruling face does NOT refuse on it — partial rulings are a declared,
        // receipt-recorded choice, not a silent relaxation.
        means: 'this is the VOTE floor the CLOSING rail enforces (kernel.meetings.quorum(), read here — not re-derived); it counts the CHAIR because the v5r rule puts 「院士+常驻研究员」 in the denominator and the chair holds one of those seats. It is NOT a gate on THIS receipt: `satisfiedBy:false` means the verdict set is smaller than the close rail would require (' + String(n) + ' of ' + String(required) + '), and a ruling over a partial set is legal exactly when `coverage.partial:true` carries a reason — a ruling is not a vote, and this face refuses by name elsewhere (missing member, duplicate member, p out of range)',
        satisfiedMeans: null }
    } catch (e) { return { readable: false, why: (e && e.message) || String(e), means: null } }
  })()
  // ★★ RUN 30 (the institute's own report, item ⑤): the kernel notice told the card's owner to correct the card's
  // probability, and NOTHING in the receipt said HOW — the live run ended with the card still at its old p and no
  // `debate_ruling` row, and the office reported "the framework said change it, but not with what". The rule
  // (「并通知命题卡持有者改卡」) makes the notice the framework's job and the edit the holder's; what was missing is the
  // one call that performs it, named with the values THIS ruling produced.
  // ★ TASK-12: the proposition id IS the card id whether the card lives on the records track (run 30's shape) or in a
  // member's library (a real file). Asking only in the records case made the library branch answer "no proposition id
  // was given" for a card that plainly exists on disk.
  const cardPath = await libraryCardPathOf(kernel, propositionId)
  const correction = {
    needed: true,
    recipient: owner,
    tool: 'vibe_v5_record_proposition',
    cardId: (cardRow || cardPath.path) ? propositionId : null,
    onRecord: cardRow !== null,
    // ★ TASK-12: WHERE the card is. "The framework said change it, but not with what" was run 30's finding (the values
    // are in `call`); "…and not where" is the same defect one step on. A library card has a real file; a records row
    // has none, and saying so is better than naming a path that does not exist.
    path: cardPath.path,
    pathMeans: cardPath.path || cardPath.why,
    call: cardRow
      ? 'vibe_v5_record_proposition { id: "' + propositionId + '", p: ' + String(ruled.value) + ', debate_ruling: { value: ' + String(ruled.value) + ', mode: "' + String(ruled.mode) + '", n: ' + String(ruled.n) + ', decided: ' + String(ruled.decided === true) + ', at: "<ISO time>", meeting: "' + str(meeting) + '", by: "' + chair + '" } }'
      : (cardPath.path
        ? 'edit the card FILE at ' + cardPath.path + ' and set its probability to p = ' + String(ruled.value) + ' (this proposition is a library card, not a records row: no records face owns it, so the edit is a file edit by its holder)'
        : 'this ruling has NO card to correct (the object was not on the records track): record the proposition first with vibe_v5_record_proposition { track: "propositions", statement, value, motive, p: ' + String(ruled.value) + ' } and then apply the ruling with the same call + debate_ruling'),
    means: 'the KERNEL notice tells the owner to correct the card; this field names the call that does it and the values this ruling produced, so "who changes the card, with what" is answerable from the receipt instead of inferred. This face does not write the card: the rule makes the notice the FRAMEWORK act and the edit the HOLDER act (and a card write here would be a second writer of the same row)',
  }
  return {
    ok: true, tool: 'vibe_v5_verdict_final', meeting, chair, from: chair,
    floor,
    // ★ RUN 30 ③: the sentence travels beside the numbers on purpose — `satisfiedBy:false` next to `ok:true` is exactly
    // the pair a reader misreads, so the receipt carries its own explanation instead of leaving it to the doc.
    floorMeans: floor && floor.means ? floor.means : null,
    // ★ RUN 30 ⑤: WHICH call corrects the card, with which values (see the `correction` block above).
    correction,
    // ★ LIVE RUN 11 (the institute's own report, item b): this receipt was read as if it carried the CLOSURE vote
    // (`cast`/`votesCast`) and the reading was reported missing. It is not missing - it is another mechanism. The
    // ruling answers 'what is the probability over this proposition', the closure vote answers 'did every member
    // judge the question solved'. Naming the neighbour is cheaper than letting two receipts look contradictory.
    // ★★★ TASK-12 / F3 — THIS POINTER WAS WRONG, AND A WRONG POINTER IS WORSE THAN NONE. It sent the reader to
    // `vibe_vmu_meeting { action: "status" }` → `closureVote`, and that receipt carries NO such key: a meeting status
    // answers the meeting OBJECT (state/roster/chair), while the closing tally is read from
    // `vibe_vmu_status { detail: "closure" }` (host face: `closureVote` + `counts`), from the closing receipt
    // `vibe_vmu_meeting { action: "close" }`, and from the turn status receipt. Verified against those three faces,
    // not against the doc.
    closureReading: 'NOT on this receipt: cast/votesCast are the CLOSURE vote and live on `vibe_vmu_status { detail: "closure" }` → closureVote (the closing receipt `vibe_vmu_meeting { action: "close" }` and the turn status receipt also carry it). `vibe_vmu_meeting { action: "status" }` does NOT — it answers the meeting object (state/roster/chair), not the quorum tally. floor.minVotes here is the vote floor that closing meeting also enforces',
    proposition: ruled.proposition, value: ruled.value, valueSource: ruled.valueSource,
    mode: ruled.mode, exact: ruled.exact, rounded: ruled.rounded, decided: ruled.decided,
    enforceable: ruled.enforceable, estimate: ruled.estimate, n: ruled.n, perMember: ruled.perMember,
    spread: ruled.spread, owner, notified, delivery,
    // ★ TASK-12 / F4: the state of the notice (see the block above). `notified` stays the list of mailboxes that hold a
    // copy; `notification.state` says whether that copy was pushed into a turn or is only waiting, so the pair cannot
    // be read as "the owner has seen it".
    notification,
    // ★ TASK-12: WHERE EACH NUMBER CAME FROM — one row per member in the tally (submission vs chair-typed), so "who
    // filed it" is answerable per member instead of being inferred from `coverage.complete`.
    attribution,
    attributionMeans: 'one row per number in the tally: source:"submission" means that member filed it itself (the row names the card and its path); source:"chair-typed" means the chair wrote it because no card was filed; `coverage.missing` names the members who debated and appear in NEITHER',
    // ★ TASK-12: the filing ledger this ruling was collected from — readable or not, and why.
    submissions: { readable: filed.readable === true, why: filed.readable === true ? null : filed.why,
      count: filed.rows.length, cards: filed.cards, duplicates: filed.duplicates,
      rows: filed.rows.map((r) => ({ member: r.member, verdict: r.verdict, reason: r.reason, at: r.at, id: r.id, path: r.path, counted: provided.includes(r.member) })),
      means: filed.readable === true
        ? 'the rulings were read back from the library on disk (each member files its own card with vibe_v5_verdict { meeting, proposition_id, verdict, reason }); counted:true marks the ones this tally actually used'
        : 'the filing ledger could not be read here, so NOTHING was collected from it: ' + String(filed.why) },
    coverage: { debated: debated.members, debatedSource: debated.source, provided,
      submitted: filed.rows.map((r) => r.member),
      submittedCount: filed.rows.length,
      adoptedFromSubmissions: attribution.filter((a) => a.source === 'submission').length,
      typed: attribution.filter((a) => a.source === 'chair-typed').map((a) => a.member),
      typedCount: attribution.filter((a) => a.source === 'chair-typed').length,
      outsideDebate: filed.rows.filter((r) => !debated.members.includes(r.member)).map((r) => ({ member: r.member, verdict: r.verdict, id: r.id })),
      missing,
      missingMeans: missing.length === 0
        ? 'every member the debate recorded is in this tally'
        : 'these members debated and appear in NEITHER the filed rulings nor the typed verdicts: ' + missing.join('、') + ' — the tally is not the whole debate, which is exactly why coverage.partial needs a reason',
      partial,
      partialWhy: partial ? (has(args.why) ? str(args.why) : null) : null,
      complete: missing.length === 0 },
    // the reading that keeps an empty `notified` from being read as a delivery failure (see R21 above), and — F4 — that
    // keeps a NON-empty one from being read as "the owner has seen it"
    notifiedMeans: selfAddressed
      ? 'no mailbox copy was made: the card owner is the chair who signed the ruling, so the ruling IS this receipt (a message may not be addressed to its own sender). An empty notified here means "nothing to send", not "the owner was not told" — see delivery.selfAddressed'
      : (notified.length
        ? 'a copy of the notice is IN the card owner\'s mailbox — but "in the mailbox" is not "read": ' + notificationMeans
        : 'NO mailbox copy was written: delivery reported ok=' + String(delivery.ok) + ' — the number is on the record and the receipt says so, but the owner was not told (see delivery.code); ' + notificationMeans),
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
        ? 'the ruling is on the record and the card owner (' + owner + ') has a copy waiting in their mailbox face — '
          + (notificationState === 'queued'
            ? 'QUEUED, not read: the owner picks it up on their next turn (`notified` lists mailboxes, it does not claim the owner has seen it)'
            : 'state ' + notificationState + ' (see `notification`)')
        : '★ the ruling IS on the record but the card owner was NOT told: delivery reported ok=' + String(delivery.ok)
          + ' — the number is not hidden, the notice is simply missing (see `delivery`)'),
  }
}

/**
 * WHO DEBATED — read from the meeting own minutes (the kind:"speech" entries), never from a caller claim.
 * The rule says the framework asks 「各个辩论的各个成员」 for a final ruling, so the set to ask is a fact about the
 * meeting, not a parameter: deriving it here keeps one authority (a caller can still widen it explicitly with
 * members:[…], and the receipt records which of the two was used).
 */
function debatedMembersOf(kernel, meeting) {
  const face = kernel && kernel.meetings
  if (!face) {
    return { readable: false, members: [], excluded: [], accountedCount: null, source: 'unreadable', rosterCount: null,
      rosterCountMeans: 'no meetings face was read at all, so there is no roster to count: `rosterCount:null` here means "nothing was read", NOT "zero seats"',
      why: 'the kernel publishes no meetings face, so who debated cannot be established' }
  }
  // ★★★ ROUND 19 (live run 26): THE ROSTER IS THE DEBATE, NOT ONLY THE SPEAKERS. This helper used to read `spokeBy`
  // (or minutes) alone, so a rostered member who had NOT spoken yet was invisible: the ask went to one member of two
  // while the ruling's completeness gate compared against the whole electorate. The honest set is the union —
  // everybody the meeting rostered except the chair (the chair signs the ask), PLUS anybody who actually spoke
  // (a speaker the roster omits still debated).
  let speakSet = { readable: false, members: [], why: 'no spokeBy()' }
  if (typeof face.spokeBy === 'function') {
    try {
      const out = face.spokeBy({ meeting })
      speakSet = { readable: true, members: (out && Array.isArray(out.spokeBy)) ? out.spokeBy.map(String) : [], why: null }
    } catch (e) {
      speakSet = { readable: false, members: [], why: (e && e.message) || String(e) }
    }
  }
  let roster = null
  let chair = null
  try {
    const v = (typeof face.meetingView === 'function') ? face.meetingView({ meeting }) : null
    if (v && Array.isArray(v.roster)) roster = v.roster.map(String).filter(Boolean)
    if (v && v.chair) chair = String(v.chair)
  } catch { roster = null }
  if (roster && roster.length > 0) {
    // ★★★ LIVE RUN 29 (the institute's report on run 29, the `rosterCount` / `asked` pair): the receipt published
    // `rosterCount:3` beside an `asked` list of two members and NOTHING reconciled the difference — the third seat was
    // the CHAIR, dropped by `m !== chair` with no record of the decision. A count a reader cannot reconcile is a number
    // they must either mis-trust or silently translate, which is the defect class this project keeps removing. So the
    // exclusion is NAMED (`excluded:[{member, why:"presides"}]`) and every count in the receipt adds up:
    // asked + excluded = the members the meeting actually named (roster ∪ speech record).
    const named = []
    for (const m of roster) if (m && !named.includes(m)) named.push(m)
    for (const m of speakSet.members) if (m && !named.includes(m)) named.push(m)
    const members = []
    const excluded = []
    for (const m of named) {
      if (m === chair) { excluded.push({ member: m, why: 'presides' }); continue }
      members.push(m)
    }
    const offRoster = named.length - roster.length
    return {
      readable: true, members, excluded, accountedCount: named.length,
      source: speakSet.readable ? 'roster+speech' : 'roster',
      chair, rosterCount: roster.length, speakerCount: speakSet.members.length, why: null,
      rosterCountMeans: 'the meeting view publishes a roster of ' + roster.length + ' seat(s), and the CHAIR holds one of'
        + ' those seats — it is INSIDE `rosterCount` but NOT inside `asked`, because the chair signs the ask instead of'
        + ' answering it (that is the `excluded` row with why:"presides"). The receipt therefore reconciles: asked '
        + members.length + ' + excluded ' + excluded.length + ' = the members the meeting named ' + named.length
        + (offRoster > 0
            ? ' (the named set is larger than the roster because ' + offRoster + ' speaker(s) are not seated on it and are still reachable)'
            : ' (every named speaker is also seated, so the named set IS the roster)') + '.',
    }
  }
  if (speakSet.readable) {
    const named = []
    for (const m of speakSet.members) if (m && !named.includes(m)) named.push(m)
    const members = []
    const excluded = []
    for (const m of named) {
      if (m === chair) { excluded.push({ member: m, why: 'presides' }); continue }
      members.push(m)
    }
    return { readable: true, members, excluded, accountedCount: named.length, source: 'spokeBy', chair,
      rosterCount: null, speakerCount: speakSet.members.length, why: null,
      rosterCountMeans: 'the meeting published NO roster, so there is no seat count to reconcile: `rosterCount:null` means'
        + ' NOT PUBLISHED, never zero. The population is the ' + named.length + ' member(s) on speech record (`speakBy`),'
        + ' of which the chair is excluded as the asker (`excluded` says why) — asked ' + members.length + ' + excluded '
        + excluded.length + ' = ' + named.length + '.' }
  }
  if (typeof face.minutes !== 'function') {
    return { readable: false, members: [], excluded: [], accountedCount: null, source: 'unreadable', rosterCount: null,
      rosterCountMeans: 'nothing was read (no spokeBy(), no minutes(), and the view published no roster), so `rosterCount:null` means "unknown", not "zero seats"',
      why: 'the kernel publishes neither spokeBy() nor minutes(), so who debated cannot be established' }
  }
  try {
    const m = face.minutes({ meeting })
    const entries = (m && (m.entries || (m.minutes && m.minutes.entries))) || []
    const seen = []
    for (const e of entries) {
      if (!e || e.kind !== 'speech') continue
      const who = e.member ? String(e.member) : ''
      if (who && !seen.includes(who)) seen.push(who)
    }
    return { readable: true, members: seen.filter((x) => x !== chair), excluded: seen.filter((x) => x === chair).map((member) => ({ member, why: 'presides' })),
      accountedCount: seen.length, source: 'minutes', chair, rosterCount: null, speakerCount: seen.length, why: null,
      rosterCountMeans: 'the meeting published NO roster, so there is no seat count to reconcile: `rosterCount:null` means'
        + ' NOT PUBLISHED, never zero. The population is the ' + seen.length + ' member(s) whose speech the MINUTES record,'
        + ' of which the chair is excluded as the asker (`excluded` says why) — asked ' + seen.filter((x) => x !== chair).length
        + ' + excluded ' + seen.filter((x) => x === chair).length + ' = ' + seen.length + '.' }
  } catch (e) {
    return { readable: false, members: [], excluded: [], accountedCount: null, source: 'unreadable', rosterCount: null,
      rosterCountMeans: 'the minutes could not be read, so `rosterCount:null` means "unknown", not "zero seats"',
      why: (e && e.message) || String(e) }
  }
}

/**
 * ★ LIVE RUN 29 — THE ASK ACCEPTED ANY STRING AS "THE PROPOSITION" AND ASKED A WHOLE DEBATE ABOUT IT.
 *
 * Until this round `proposition_id` was only checked for PRESENCE (`!has(args.proposition_id)` in toolVerdictAsk);
 * whatever the chair typed then went into every member's mail and into the target the ruling face aggregates. Measured
 * on run 29 (build 9dce66f0, reproduced in tests/vmu-run29-verdict-ask.test.mjs): with the propositions library at
 * `total:0`, the id `p-typo` — which is neither the meeting's declared debate subject nor any card — was accepted and
 * two members were asked to rule on it. The mistake only surfaces later as "the verdicts match no card".
 *
 * WHAT THIS FUNCTION DECIDES (returned as `propositionKind` + `propositionVerified` + `propositionWhy`):
 *   · a CARD row exists for the id                           → "card"            (verified: the ruling has a target)
 *   · the name is shaped like a FILE REFERENCE               → "file-ref"        (v5r allows the debate object to be a
 *                                                                                  file; this face has NO file face, so
 *                                                                                  `fileChecked:false` — the SHAPE is
 *                                                                                  accepted, the contents are not read)
 *   · no such card, but it IS the meeting's declared subject → "meeting-subject" (verified by the meeting itself)
 *   · `r-…` shape with a readable records face and no row    → REFUSED `VMU_ASK_UNKNOWN_PROPOSITION` (records, which
 *                                                              MINTS `r-` ids — kernel/records.js:533 — is the
 *                                                              authority, so absence there is a fact, not a guess)
 *   · the meeting declared a DIFFERENT debate subject        → REFUSED the same code (absence relative to the declared
 *                                                              object is also provable)
 *   · nothing declared and nothing found                     → "unverified": the name may be a legal one-line
 *                                                              proposition (「一句话命题」 is a legal v5r debate object)
 *                                                              or a typo, and this face cannot tell the two apart —
 *                                                              so it asks AND labels what it could not check instead
 *                                                              of refusing a shape the rule allows.
 * ★ THE SHAPE IS NOT RE-DERIVED HERE. `classifySubject` (verification-gates.js:135) is already the ONE authority for
 * card id / file reference / statement, and the debate-subject gate uses it; a second regex would be a second answer to
 * the same question and the two would drift (red line ③).
 */
function propositionOf(kernel, view, meeting, propositionId) {
  const id = str(propositionId)
  const records = kernel && kernel.records ? kernel.records : null
  // ★ `readable` is about the FACE, not about the row: "no card exists" is a fact only when the library could be
  // queried at all, and a stub kernel without `records` must not be described as an empty library.
  const recordsReadable = !!(records && typeof records.get === 'function')
  const card = recordsReadable ? cardProjectionOf(records, id) : null
  const cls = classifySubject(id, card ? { card } : null)
  if (card) {
    return { kind: 'card', verified: true, cardId: card.id === undefined ? id : str(card.id),
      why: 'the propositions track holds a card with this id, so every member is being asked about a target the ruling face can aggregate into'
        + (card.unjudgeable ? ' — NOTE the row EXISTS but its body could not be parsed (' + str(card.unjudgeable) + '), so the target is real while its own p is not readable here' : '') }
  }
  if (cls.form === 'file') {
    return { kind: 'file-ref', verified: false,
      why: 'the name has the shape of a FILE REFERENCE (a path separator, or a .md/.lean/.txt/.tex/.json suffix) and v5r allows the debate object to be a FILE, so it is accepted as-is; this face publishes no file face, so the file was NOT read — `fileChecked:false` says the shape was accepted, never that the contents were checked' }
  }
  const declared = (view && view.subject !== undefined && view.subject !== null && str(view.subject).trim() !== '')
    ? str(view.subject) : null
  if (cls.form === 'card' && recordsReadable) {
    throw refuse('VMU_ASK_UNKNOWN_PROPOSITION',
      'proposition "' + id + '" is shaped like a records card id ("r-…") but the library holds NO such row — asking the debate to rule on it would collect verdicts for a target that does not exist'
        + (declared === null ? '' : ' (this meeting declared its debate object as "' + declared + '")'),
      'record the proposition first (vibe_v5_record_proposition) and pass the id it returns, or pass the object this debate is actually about — if the debate object is a FILE, pass the file reference instead (a path, or a name ending in .md/.lean/.txt/.tex/.json): this face accepts that shape and marks the receipt propositionKind:"file-ref"')
  }
  if (declared !== null) {
    if (id === declared) {
      return { kind: 'meeting-subject', verified: true,
        why: 'this is exactly the object meeting ' + str(meeting) + ' was convened to debate (`meetingView.subject`), so the ask names the same object the debate did' }
    }
    throw refuse('VMU_ASK_UNKNOWN_PROPOSITION',
      'proposition "' + id + '" names nothing this debate is about: meeting ' + str(meeting) + ' declared its debate object as "' + declared + '", ' + (recordsReadable ? 'the library holds no card "' + id + '"' : 'the records face could not be read here so no card could be found for "' + id + '"') + ', and the name is not a file reference — the members would be asked to rule on an object nobody debated',
      'pass proposition_id:"' + declared + '" (the object this meeting was convened to debate), or record the card first with vibe_v5_record_proposition and pass its id; if the debate object really is a FILE, pass its path / file name (e.g. "docs/proof.md", "main.lean") — v5r allows that and the receipt then says propositionKind:"file-ref"')
  }
  return { kind: 'unverified', verified: false,
    why: (recordsReadable ? 'no card with this id exists' : 'the records face was not readable, so no card could be looked up') + ' and meeting ' + str(meeting) + ' declared NO debate subject, so this face cannot tell a legal one-line proposition (「一句话命题」) from a typo — it sent the ask and records that limit here instead of refusing a shape the rule allows' }
}

/**
 * ★ LIVE RUN 29 — THE ASK MAIL ASSERTED THE DEBATE WAS OVER WITHOUT EVER READING THE MEETING.
 *
 * The body carried a fixed clause 「（会议 <id> 已结束辩论；…）」. Measured on the run-29 build: the meeting's own
 * `meetingView` reported `state:"open"` while the mail told every member the debate had ended — the pack asserting a
 * fact it never read, and asking for a FINAL ruling on a debate that was still running.
 *
 * The state IS a published fact (`meetingView.state`, plus the kernel's own sentence in `meetingView.stateMeans` —
 * kernel/meeting.js:29 and kernel/meetings.js:1921), so the sentence is DERIVED from it and each phase says only what
 * the reader may conclude:
 *   closed ⇒ the debate has ended · lapsed ⇒ the meeting lapsed (no conclusion is assumed) · open/in_session/recess ⇒
 *   still running (the ask went out before the close) · scheduled/waiting ⇒ not started · unreadable ⇒ 「状态不可读」,
 *   nothing is asserted.
 * ★ THE VOCABULARY BELONGS TO THE KERNEL, NOT TO THIS FILE: kernel/meetings.js moves a meeting through
 * scheduled|waiting|open|recess|closed (lines 559/577/875/1376/1669) and kernel/meeting.js:29 declares meanings for
 * scheduled|waiting|in_session|closed|lapsed. A state this build does not name falls through to `unknown` ON PURPOSE:
 * a future kernel state must never be silently read as "the debate ended". The `null` `stateMeans` that 'open' carries
 * today is a real kernel gap and is DISCLOSED as such rather than papered over.
 */
function debateClosureOf(view, meeting) {
  const mid = str(meeting)
  const state = (view && view.state !== undefined && view.state !== null && str(view.state).trim() !== '') ? str(view.state) : null
  const means = (view && view.stateMeans !== undefined && view.stateMeans !== null) ? str(view.stateMeans) : null
  const meansClause = means === null
    ? '；内核没有为这个状态声明 stateMeans，此处只陈述状态名、不解释其含义'
    : '；内核对该状态的说明：' + means
  if (state === null) {
    return { phase: 'unknown', state: null, stateMeans: means, readable: false,
      sentence: '会议 ' + mid + ' 的状态不可读（meetingView 没有给出 state），本条消息**不断言**辩论是否结束；请先确认会议状态再把裁决发回。',
      why: 'meetingView published no `state` field, so whether the debate ended could not be read — the mail says so instead of asserting a closure' }
  }
  if (state === 'closed') {
    return { phase: 'ended', state, stateMeans: means, readable: true,
      sentence: '会议 ' + mid + ' 已结束辩论（state "closed"' + meansClause + '）。',
      why: 'meetingView reports state "closed"' }
  }
  if (state === 'lapsed') {
    return { phase: 'lapsed', state, stateMeans: means, readable: true,
      sentence: '会议 ' + mid + ' 已失效（state "lapsed"' + meansClause + '），本条请求**不假设**这场辩论产生过结论。',
      why: 'meetingView reports state "lapsed": the meeting ended without a conclusion, so the mail does not claim one' }
  }
  if (state === 'open' || state === 'in_session' || state === 'recess') {
    return { phase: 'running', state, stateMeans: means, readable: true,
      sentence: '会议 ' + mid + ' 仍在进行（state "' + state + '"' + meansClause + '），辩论**尚未**结束——这条裁决请求发得早于收口。',
      why: 'meetingView reports a state in which the meeting has not closed, so the debate has not ended' }
  }
  if (state === 'scheduled' || state === 'waiting') {
    return { phase: 'not_started', state, stateMeans: means, readable: true,
      sentence: '会议 ' + mid + ' 尚未开始（state "' + state + '"' + meansClause + '），更谈不上结束辩论——这条请求发早了。',
      why: 'meetingView reports a state before the meeting starts' }
  }
  return { phase: 'unknown', state, stateMeans: means, readable: false,
    sentence: '会议 ' + mid + ' 的状态是 "' + state + '"，但本构建没有为这个状态名声明含义，本条消息**不断言**辩论是否结束。',
    why: 'the state name "' + state + '" is not one this build gives a meaning, so no closure is asserted' }
}

/**
 * ★ THE RULE OTHER SENTENCE — 「待辩论会议结束，v5r框架**请**刚刚各个辩论的各个成员给出最终裁决」.
 *
 * Until now the pack only had the SECOND half (vibe_v5_verdict_final: aggregate + notify). The asking half was prose
 * in a recommended procedure, so on a real run nobody was asked and the ruling could be signed from whatever verdicts
 * the chair happened to collect. This face makes the ask a real act: one mailbox message per debating member, from the
 * chair, naming the proposition and the two things to answer (probability + reason). It refuses by name when nobody can
 * be asked (no speech on record, no mailbox face) instead of reporting a comfortable zero.
 *
 * It does NOT aggregate and does NOT touch the card: asking is not ruling (the same separation the pack already keeps
 * between meetings.close and the ruling — see the note on toolVerdictFinal).
 */
function toolVerdictAsk(args = {}, { kernel } = {}) {
  if (!has(args.meeting)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'asking for final rulings needs the meeting they belong to',
      'pass meeting:"<the id vibe_v5_meeting returned>" — the ask is signed by the chair of that meeting')
  }
  const meeting = str(args.meeting)
  if (!kernel || !kernel.meetings || typeof kernel.meetings.meetingView !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meeting face: the ask cannot be tied to a chair',
      'assemble a full kernel (vibe-math-vmu.js publishes vmu.meetings)')
  }
  const view = kernel.meetings.meetingView({ meeting })
  const chair = view && view.chair ? str(view.chair) : ''
  if (!chair) {
    throw refuse('VMU_STATE', 'meeting ' + meeting + ' declares no chair, so nobody can sign the ask',
      'convene the meeting with a chair seat — an ask without a signer is not the framework asking')
  }
  if (has(args.member) && str(args.member) !== chair) {
    throw refuse('VMU_NOT_PERMITTED', 'only the meeting CHAIR asks for the final rulings: the chair of ' + meeting + ' is "' + chair + '", and you passed "' + str(args.member) + '"',
      'pass member:"' + chair + '", or omit member (the chair asks by default)')
  }
  if (!has(args.proposition_id)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the ask must name the proposition the ruling is about',
      'pass proposition_id:"<records id of the proposition card>" — a member cannot answer a boolean probability without knowing the proposition')
  }
  const propositionId = str(args.proposition_id)
  // ★ RUN 29 ③: a PRESENT `proposition_id` used to be treated as a VALID one (run 29: library `total:0`, the id asked
  // about was neither a card nor the meeting's declared subject, and two members were still asked). The refusal is
  // raised here, before the mailbox, because an ask about nothing must not reach anybody's inbox.
  const proposition = propositionOf(kernel, view, meeting, propositionId)
  if (!kernel.mailbox || typeof kernel.mailbox.send !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no mailbox face: the framework cannot reach the members',
      'assemble a full kernel (vibe-math-vmu.js publishes vmu.mailbox) — without it an ask is not an ask')
  }
  const explicit = Array.isArray(args.members) ? args.members.map((x) => str(x)).filter(Boolean) : null
  const debated = debatedMembersOf(kernel, meeting)
  const asked = explicit && explicit.length ? explicit.slice() : debated.members.slice()
  const source = explicit && explicit.length ? 'members' : debated.source
  if (asked.length === 0) {
    // ★★★ ROUND 19 made the population the UNION (roster ∪ speech), so "empty" no longer means only "nobody spoke":
    // it can also mean "the meeting names nobody but the chair". The refusal says WHICH of the two it read, because a
    // message that sends the chair hunting for a speech that is not the missing thing is the same defect class as a
    // count nobody can reconcile (run 29 ①).
    const emptyWhy = debated.readable
      ? (debated.rosterCount !== null && debated.rosterCount > 0
          ? 'names no debater but the CHAIR (roster ' + debated.rosterCount + ': the chair is excluded because it asks instead of answering) and holds no speech on record'
          : 'reports no speech by any member and publishes no roster to draw a debater from')
      : debated.why
    throw refuse('VMU_STATE', 'nobody can be asked: meeting ' + meeting + ' ' + emptyWhy,
      'hold the debate first (members speak in the meeting), or pass members:[…] to name who must answer — the set of askers is a fact about the debate, so an empty one means there is nothing to rule on yet')
  }
  // ★★ RUN 29 ②: the clause below used to be the fixed text 「（会议 <id> 已结束辩论；…）」 — a closure ASSERTED in
  // every mail, whatever the meeting said. It is now generated by `debateClosureOf` from `meetingView.state`: the
  // reader of the mail learns what the meeting actually reports, and an unreadable state produces 「状态不可读」 rather
  // than a sentence the pack made up.
  const closure = debateClosureOf(view, meeting)
  // ★★ RUN 30 (the institute's own report, item ④): the mail named the object and nothing else. Measured: the office
  // asked about `p-nope` — an id the library did NOT hold — the receipt carried `propositionKind:"unverified"` and
  // `propositionVerified:false`, and the two members' mailboxes received a request that read exactly like one about a
  // registered card. The RECEIPT was honest and the MAIL was not, which is the same defect class as run 29 ②: the
  // reader of the mail is not the reader of the receipt. The provenance is therefore derived ONCE here and put in the
  // body the member actually reads (a card needs no clause — naming a registered card asserts nothing extra).
  const propositionClause = proposition.kind === 'card' ? null
    : proposition.kind === 'meeting-subject'
      ? '（辩论对象就是会议 ' + str(meeting) + ' 声明的对象，未登记为命题卡。）'
      : proposition.kind === 'file-ref'
        ? '（辩论对象是一个文件引用，本面**没有读取文件内容**（fileChecked:false）——裁决的对象以这条引用为准。）'
        : '（★ 命题 "' + propositionId + '" **尚未在命题库登记**：本面无法区分"规则允许的一句话命题"与"笔误"，因此照发并在此写明——裁决的对象仅为这条字符串，登记卡后重问才能对上命题库。）'
  // ★★★ TASK-12 / RUN 31: THE MAIL USED TO ASK FOR A RULING AND NAME NO CALL THAT COULD DELIVER IT. Measured: the
  // member answered with `vibe_v5_verdict { target: "p-r31" }`, got `VMU_NO_SUCH_OBJECT "no LIVE ballot with id p-r31"`,
  // and concluded 「I cannot vote without a ballot」 — it was asked for something the tool face then refused. The mail is
  // the member's instruction sheet, so it now names the exact call AND the exact shape (a filed ruling, not a ballot).
  const text = '请你作为本次辩论的参与者，就命题 ' + propositionId + ' 给出最终裁决：布尔概率（[0,1]）+ 理由。'
    + (propositionClause === null ? '' : propositionClause)
    + '（回答方式：调用 vibe_v5_verdict { meeting: "' + str(meeting) + '", proposition_id: "' + propositionId + '", verdict: <[0,1] 的数>, reason: "<理由>", member: "<你自己>" } —— 这是**你自己的裁决**，会落成你名下的一张卡并进入汇总；不要传 target（那是票箱，票箱只对"待核验对象"开放，命题卡不是票箱）。）'
    + '（' + closure.sentence + '收齐全部裁决后由主席用 vibe_v5_verdict_final { meeting: "' + str(meeting) + '", proposition_id: "' + propositionId + '" } 汇总：全部一致为 1 或 0 则取该值，否则取算术平均，并通知命题卡持有者。）'
  const delivered = []
  const failed = []
  // ★★ ROUND 19: THE MAILBOX IS A BAG OF BOXES, NOT AN ADDRESS BOOK — it will happily accept a message for an id that
  // is not a member (it creates a box). So "the ask was sent" would be a fake success for a non-existent member. The
  // membership check belongs here, where the institute's own roster is the authority; without a members face the pack
  // cannot verify and says so in the receipt rather than pretending.
  let liveIds = null
  try {
    if (kernel.members && typeof kernel.members.roster === 'function') {
      liveIds = new Set((kernel.members.roster() || []).map((m) => String(m && m.id ? m.id : m)))
    }
  } catch { liveIds = null }
  for (const to of asked) {
    if (liveIds && !liveIds.has(String(to))) {
      failed.push({ to, code: 'VMU_NO_SUCH_OBJECT', message: 'no live member "' + String(to) + '" in this institute, so nobody was asked' })
      continue
    }
    try {
      const sent = kernel.mailbox.send(chair, { to, kind: 'final-ruling-request', meeting, proposition: propositionId, text })
      if (sent && sent.ok === false) failed.push({ to, code: sent.code || 'VMU_STATE', message: sent.message || null })
      else delivered.push(to)
    } catch (e) {
      failed.push({ to, code: (e && e.code) || 'VMU_ENGINE_FAILURE', message: (e && e.message) || String(e) })
    }
  }
  // ★★ ROUND 19: A REFUSED DELIVERY IS NOT AN ASK. Until now this face returned `ok:true` with `delivered:[]` when the
  // mailbox refused every target, and its `means` still said "the ask is on the members record now" — the same
  // comfortable-zero the doc comment above claims this face avoids. Zero delivered is a named refusal; a partial
  // delivery says so in the receipt instead of being averaged with success.
  if (asked.length > 0 && delivered.length === 0) {
    throw refuse('VMU_ASK_NOTHING_DELIVERED',
      'the framework could not reach ANY of the ' + asked.length + ' member(s) it meant to ask: ' + failed.map((f) => String(f.to) + '=' + String(f.code)).join(', '),
      'the mailbox refused every target (see codes above). A ruling asked of nobody is not a ruling — make the members reachable (hire/attend them so they are on this meeting\'s roster) and call again, or ask explicitly with members:[…]')
  }
  const partialAsk = failed.length > 0
  // ★★★ RUN 29 ①: THE THREE NUMBERS MUST CLOSE. `rosterCount` counts the chair seat (the chair HOLDS a seat) while
  // `asked` never contains it, so the two were unreconcilable on the receipt. These two locals are the fix: the
  // excluded rows with a named reason, and one sentence in which asked + excluded equals what the meeting named.
  const excluded = Array.isArray(debated.excluded) ? debated.excluded : []
  const accountedRaw = debated.accountedCount === undefined || debated.accountedCount === null ? null : debated.accountedCount
  const accounting = {
    rosterCount: debated.rosterCount === undefined ? null : debated.rosterCount,
    speakerCount: debated.speakerCount === undefined ? null : debated.speakerCount,
    accountedCount: accountedRaw,
    askedCount: asked.length,
    excludedCount: excluded.length,
    means: explicit && explicit.length
      ? 'the caller named `members`, so this call population is that list (' + asked.length + '); the meeting-derived account (accountedCount) is not what was asked here — read `asked`, not the roster numbers'
      : (accountedRaw === null
          ? 'no rosters or minutes were readable, so there is nothing to reconcile: asked ' + asked.length + ' came from ' + source + ' and excluded ' + excluded.length + ' (see rosterCountMeans / askedWhy)'
          : 'asked ' + asked.length + ' + excluded ' + excluded.length + ' = ' + accountedRaw + ' — every member the meeting named is either in `asked` or in `excluded` with a named reason, so no seat is unaccounted for'),
  }
  return {
    ok: true, tool: 'vibe_v5_verdict_ask', meeting, chair, from: chair,
    proposition: propositionId,
    // ★ RUN 29 ③: "the field is present" is not "the field was consumed". These three say WHAT the id was understood
    // to be, and `propositionVerified:false` marks a file reference (shape accepted, contents not read) or an unverified
    // one-line name — the reader can tell a checked target from a plausible-looking string.
    propositionKind: proposition.kind,
    propositionVerified: proposition.verified === true,
    fileChecked: proposition.kind === 'file-ref' ? false : null,
    propositionWhy: proposition.why,
    // ★★ RUN 30 ④: the receipt and the MAIL must say the same thing about the object. `propositionClause` is the exact
    // sentence inserted into the body (null for a registered card, which needs no disclaimer), so a reader of the
    // receipt can see what the member was told without diffing two faces.
    propositionClause,
    asked, askedSource: source,
    // ★★★★★★★ LIVE RUN 28 (the institute's own report, item 5): the DESCRIPTION promised `askedWhy says why` and the
    // receipt never carried it — a promise with no field is a described mechanism that does not exist, the exact
    // defect class this phase keeps removing. The label `roster+speech` names the RULE (a union), not which side
    // actually contributed, so a run with an EMPTY speech record still read "roster+speech". `askedWhy` therefore
    // states the rule AND what each side contributed in this call.
    // ★★★ LIVE RUN 29: the two branches below tested `source === 'explicit'` and `source === 'speech'` while this
    // function has always emitted `'members'` / `'spokeBy'` / `'minutes'` — DEAD BRANCHES. An explicit `members:[…]`
    // call was therefore described as a union it never used, and a minutes-only ask fell into the union wording too.
    // The values here are now the values the code above actually assigns (and the declaration at the bottom of this
    // file lists the same five), so the receipt and the description cannot disagree again.
    askedWhy: source === 'members'
      ? 'the caller named `members`, so that list IS the population (it REPLACES the roster+speech set rather than widening it): ' + asked.length + ' member(s)'
      : (source === 'roster'
          ? 'the meeting has a roster and NO speech on record, so the roster alone is the population (' + String(debated.rosterCount === undefined ? '?' : debated.rosterCount) + ' seated); a seated member owes a ruling even if it never spoke — the chair seat is named in `excluded` because the chair signs the ask'
          : ((source === 'spokeBy' || source === 'minutes')
              ? 'the meeting has no roster, so only the members on SPEECH RECORD could be reached (' + String(debated.speakerCount === undefined ? '?' : debated.speakerCount) + ') from ' + (source === 'minutes' ? 'the minutes' : 'spokeBy()') + '; without a roster there is nobody else to ask, and the chair seat is named in `excluded`'
              : 'the population is the UNION of the meeting roster (' + String(debated.rosterCount === undefined ? '?' : debated.rosterCount) + ') and the speech record (' + String(debated.speakerCount === undefined ? '?' : debated.speakerCount) + ') — a seated member who never spoke still owes a ruling, and a speaker who left the roster is still reachable; the chair seat is named in `excluded` because the chair signs the ask')),
    rosterCount: debated.rosterCount === undefined ? null : debated.rosterCount,
    speakerCount: debated.speakerCount === undefined ? null : debated.speakerCount,
    // ★★★ LIVE RUN 29 ①: `rosterCount:3` sat beside `asked` of two members with no field saying WHO the third was or
    // why it was skipped. `excluded` names it (`why:"presides"`), `rosterCountMeans` states what the count counts, and
    // `accounting` is the single place the three numbers are shown to close: asked + excluded = the named set. A reader
    // no longer has to reverse-engineer the arithmetic.
    excluded,
    excludedMeans: explicit && explicit.length
      ? (excluded.length === 0
          ? 'the caller replaced the derived population with `members`, and the derived set would have left nobody out, so this list is empty — it says nothing about who was skipped in THIS call'
          : 'the caller replaced the derived population with `members`, so this list is what the DERIVED set would have left out (the chair presides); it does not describe who was skipped in THIS call')
      : (excluded.length === 0
          ? 'nobody the meeting named was left out: every member it named is in `asked`'
          : 'the chair presides over the meeting, so it SIGNS the ask and does not ANSWER it — that is the only reason a member the meeting named is not in `asked`; nothing else is filtered'),
    rosterCountMeans: debated.rosterCountMeans === undefined || debated.rosterCountMeans === null
      ? null : debated.rosterCountMeans,
    accounting,
    meetingState: closure.state,
    meetingStateMeans: closure.stateMeans,
    closurePhase: closure.phase,
    closureMeans: closure.why,
    mail: { text, stateReadable: closure.readable, closurePhase: closure.phase, closureSentence: closure.sentence,
      means: 'the clause inside `text` before the aggregation sentence is generated from meetingView.state: it states the debate ENDED only when the state is "closed", says the debate is still running for open/in_session/recess, says the meeting has not started for scheduled/waiting, and says 状态不可读 when the view publishes no state — this pack never writes a closure it did not read' },
    delivered, failed,
    deliveredCount: delivered.length,
    failedCount: failed.length,
    partialAsk,
    partialAskMeans: partialAsk
      ? 'the ask reached ' + delivered.length + ' of ' + asked.length + ' member(s); the rest are named in `failed` — they were NOT asked, so their silence is not a refusal to rule'
      : 'every member the framework meant to ask was reached',
    // ★★★ TASK-12 / RUN 31: the receipt must name BOTH halves of the channel, because only one of them existed before.
    // `memberCall` is the exact call the mail teaches (so the receipt and the mail cannot diverge the way run 30 ④
    // measured on the proposition provenance).
    memberCall: 'vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }',
    memberCallMeans: 'each asked member files ITS OWN final ruling with this call (no `target`: the ballot face is for LIVE ballots, and a proposition card is not one). The filing is a card under Members/<member>/Propos/, so it survives the member\'s session and the chair reads it back from disk',
    how: 'vibe_v5_verdict_final',
    // ★ TASK-12: `how` stays the TOOL NAME (a caller reads it as a name — run 31's defect was that nobody could name a
    // call at all), and the SHAPE lives next to it instead of inside it.
    howMeans: 'the chair rules with vibe_v5_verdict_final { meeting, proposition_id } and OMITS `verdicts`: it adopts the rulings the members filed, and each row of `attribution` names the submission a number came from. Pass verdicts:[{member,p,reason}] only for a member who filed nothing',
    means: 'the ask is on the members record now; the RULING is a separate, explicit act by the chair (asking is not ruling) — '
      + 'and this pack keeps no hook on meetings.close, so a closed debate does not silently become a ruling',
    next: 'wait for the members to file their own rulings (vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }), then call vibe_v5_verdict_final { meeting, proposition_id } with NO `verdicts`: it collects every filed ruling, attributes each number to its submission, and names the members who debated but filed nothing. Pass `verdicts:[{member,p,reason}]` only for a member who has no card (a typed number that contradicts a filed ruling is refused by name). If `closurePhase` is not "ended" the mail already told the members what `meetingState` says, so close the debate first (vibe_vmu_meeting { action:"close", id }) and ask again — "the debate ended" is then a fact the ask read instead of a sentence it wrote',
    enforced: enforcedOf([]), enforcedScope: ENFORCED_SCOPE,
    note: 'the framework asked; it did not decide. A member with no verdict cannot be averaged in.',
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
  // ★ ROUND 47: `action:"rulings"` IS dispatched here (see toolMeetingRulings) — the read face of the filed ruling
  // cards. Everything else still gets the "this face only convenes" refusal with the kernel face named.
  if (String(args.action) === 'rulings') return null
  // ★ RUN 84: the face's OWN verb was refused. An agent read "convene a meeting" and passed action:"convene" (the word
  // the refusal hint itself uses); the face said it "has no convene action" and lectured it about convening. Naming the
  // verb the tool performs is ALIGNED with the tool, not a wrong action: it dispatches, and the receipt still carries no
  // `meeting_round`-style side effects. (A different verb — close/extend/status — is still refused below.)
  if (String(args.action) === 'convene') return null
  return {
    ok: false,
    code: 'VMU_INVALID_ARGUMENT',
    message: 'vibe_v5_meeting only CONVENES a meeting; it has no "' + String(args.action) + '" action (this call was never dispatched, so nothing about it was validated)',
    hint: 'convene with { member, agenda } (optional: type/subject/title/at/formal_agenda/secretary); to READ or drive an existing meeting call vibe_vmu_meeting { action: "status"|"summary"|"snapshot"|"flow", id: "<meeting>" }',
  }
}

/**
 * ★★★ ROUND 47 — THE CHAIR'S READ SIDE OF THE DEBATE RULINGS. Run 45/46 measured the same hole from two ends: a member
 * filed its ruling card (`Members/<member>/Propos/ruling-<meeting>-<proposition>-*.md`) and the meeting face reported
 * `spokeBy:[]`, `present:1` — nothing about the filing, so the chair could not see WHO had filed WHAT until it ran
 * `vibe_v5_verdict_final` (which tallys, and refuses when somebody is missing). The cards were on disk the whole time;
 * what was missing was a READ. This action is that read: same source as the tally (`rulingSubmissionsOf`), no
 * aggregation, no card written, and it says `readable:false` + why when the kernel has no library face instead of
 * returning an empty list that looks like "nobody filed".
 */
async function toolMeetingRulings(args = {}, { kernel } = {}) {
  const meeting = has(args.id) ? str(args.id).trim() : ''
  if (meeting === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'reading the filed rulings needs the meeting id',
      'pass id:"<meeting>" — the id the meeting was convened with (the open receipt carries it)')
  }
  const proposition = has(args.proposition_id) ? str(args.proposition_id).trim() : ''
  if (proposition === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'reading the filed rulings needs the proposition',
      'pass proposition_id:"<the proposition this debate is about>" — each filing card names its proposition, so the read needs the same name (vibe_v5_verdict_ask\'s receipt names it)')
  }
  const filed = await rulingSubmissionsOf(kernel, { meeting, proposition })
  return {
    ok: true, tool: 'vibe_v5_meeting', action: 'rulings', meeting, proposition,
    readable: filed.readable === true, why: filed.readable === true ? null : filed.why,
    cards: Number.isFinite(filed.cards) ? filed.cards : 0,
    count: Array.isArray(filed.rows) ? filed.rows.length : 0,
    rows: Array.isArray(filed.rows) ? filed.rows : [],
    duplicates: Array.isArray(filed.duplicates) ? filed.duplicates : [],
    means: 'these are the ruling CARDS filed for this (meeting, proposition) by the members themselves (vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }): `rows` is the latest filing per member, `cards` counts every scanned proposition card and `duplicates` reports a member who filed two different values (the latest is the one the tally uses). Reading does NOT tally and does NOT decide — the chair still signs with vibe_v5_verdict_final. `readable:false` means no filing could be read (see `why`), which is NOT the same as "nobody filed"',
  }
}

// ★★ ROUND 103 / F-103a: THE CEILING IS A SETTING, SO THE NOTE MUST READ IT. Run 103 measured `extendlimit ms:10000000`
// lifting the bound to 11800000 and only 300000000 being refused against 14400000, while this face's note said
// "clamped [300000, 7200000]" — a number nobody enforced and a verb ("clamped") that names the wrong behaviour (the
// request is refused whole, not clamped to the edge). The phrase reads the live ceiling; when the deployment declares
// none, the note says so instead of inventing a number (a note that lies is the defect the number was meant to fix).
// ★★ ROUND 103 / F-103b: one sentence for "did the narrowing take", decided from the rows (not from the declaration).
function narrowNoteOf(face, notNarrowed) {
  const skipped = Array.isArray(notNarrowed) ? notNarrowed : []
  if (face.narrowed !== true) return '这一轮**没有**按会议类型收窄（' + face.reason + '）：工具面等于该成员的身份面。'
  if (skipped.length === 0) {
    return '★ 这一轮按会议类型收窄了成员工具面：下发的是「身份可见表 ∩ pack 声明的允许集」，不是手写名单 —— 只能变小。主席不在收窄范围内（他要维持会议秩序）。override 已在 finally 撤掉，不影响下一轮。'
  }
  const first = skipped[0].narrowing || {}
  return '★ 会议类型「' + face.type + '」声明了收窄，但**本部署没有生效**：第 ' + String(first.identityFaceVisible) + ' 个身份面可见工具与「' +
    String(first.expectedAllowed) + '」个允许项交集为 0（narrowing.reason="empty-intersect"）。本轮按各成员的身份面照常跑，没有下发任何 allow —— 这是披露，不是"更严格"。' +
    '要让收窄生效，部署需要装工具可见性提供者（身份面非空）。'
}

function wallCeilingPhrase(kernel) {
  let ceiling = null
  try {
    const raw = settingsOf(kernel)['vmu.meetings.extendCeilingMs']
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) ceiling = n
  } catch { /* an unreadable deployment is "no declared ceiling", said below */ }
  // NOT DECLARED HERE IS A FACT, NOT A HOLE: this deployment's settings snapshot carries no ceiling key, so the note
  // names the KEY and points at the refusal that prints both numbers (the refusal reads the kernel's own clamped
  // ceiling) — printing a framework default the kernel had not resolved would be the same lie in a new place.
  return ceiling === null
    ? '`vmu.meetings.extendCeilingMs` (this deployment declares no value, so the runtime ceiling applies; the refusal itself prints the ceiling it used, as `after / ceiling`)'
    : '`vmu.meetings.extendCeilingMs` (' + String(ceiling) + ' ms)'
}

function toolMeeting(args = {}, { kernel } = {}) {
  // ★★ ROUND 47: the rulings READ lives on this face (the pack owns the ruling cards it teaches members to file).
  if (String(args.action) === 'rulings') return toolMeetingRulings(args, { kernel })
  // ★★ FINDING (j) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12): the agent opened a SCHEDULED
  // meeting and then read it back with `{action:'status', id}` on THIS face; it got
  // 「VMU_INVALID_ARGUMENT: meeting needs an agenda」 and reasonably suspected that status had fallen through to the
  // open branch. The dispatch was not the defect — this face NEVER dispatches: it only convenes, so `action` was
  // silently ignored and the call became "convene a meeting with no agenda". A refusal that names a missing field the
  // caller never meant to supply is worse than a bare refusal: it sends the reader to fix the wrong thing. An `action`
  // (or the read-only keys a status call carries) is now refused BY NAME and pointed at the face that answers it.
  if (args.action !== undefined && args.action !== null) {
    const refusal = validateMeetingArgs(args)
    // ★ RUN 84: `validateMeetingArgs` returns NULL when the word is ALIGNED with this face (convene = its own verb:
    // it dispatches, the receipt still carries no round). Reading `.code` off null turned an aligned call into a
    // TypeError — declaring alignment and then crashing on it is the same defect in a new costume.
    if (refusal) throw refuse(refusal.code, refusal.message, refusal.hint)
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
  // ★★ ROUND 33 / P2-③: 「允许一次性连排多会议」was a MECHANISM THE RULE NAMES AND NO FACE COULD REACH. The kernel
  // side has been there since D6 — `kernel/meetings.js:2100 openSeq({ sequence })` takes the list of meetings that
  // FOLLOW this one and `:2193` advances it — but this face passed no such argument, so `grep sequence
  // packs/v5r/tools.js` found nothing and the only teachable line was "convene one at a time". The parameter is
  // passed through VERBATIM (the kernel validates its shape and refuses a bad descriptor by name, including which
  // key it did not recognise) and the receipt carries the sequence back, because a sequence you cannot read is a
  // promise, not a plan.
  const sequence = has(args.sequence) ? args.sequence : null
  // ★★ LIVE RUN 30, finding b-1: WITHOUT an id parameter the "one visible name, one meeting" rule was only enforceable
  // in ONE direction. The service mints `mN`, so a caller of THIS face could never name a meeting — the reverse collision
  // (a service meeting squatting on a primitive id) was inexpressible and therefore unverifiable, and the primitive-side
  // hint ("choose another id") was advice this face could not follow. `id` now optionally names the meeting; the kernel
  // service refuses an id the other registry holds, BY NAME and naming that table.
  const wantedId = (has(args.id) && String(args.id).trim() !== '') ? str(args.id).trim() : null
  // ★★ ROUND 49 / F-25: the verdict and the recommended procedure are handed to the meeting OBJECT, not only to the
  // receipt. run 49 measured the chair having to type the open receipt's `subjectGate` into a progress card because
  // no read face carried it afterwards. Nothing is recomputed here: the same objects the receipt prints are stored.
  // ★★ ROUND 101 (rule L32 / E10): THE CHAIR SETS THIS MEETING'S UPPER BOUND. The bound used to come only from the
  // deployment setting (`vmu.meetings.hardLimitMs`), so the chair that convened a meeting could not bound it and
  // `extendlimit` could only raise an already-open one. Validated HERE (integer + range) so the refusal names the
  // bound it got; the kernel re-checks the same range (one rule, two doors).
  const durationMsRaw = has(args.durationMs) && args.durationMs !== null && args.durationMs !== '' ? args.durationMs : null
  const durationMs = durationMsRaw === null ? null : Number(durationMsRaw)
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 300000 || durationMs > 7200000)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'durationMs must be an integer inside [300000, 7200000] (30 minutes .. 2 hours); got ' + JSON.stringify(durationMsRaw),
      'pass this meeting\u2019s own upper bound in ms, or omit it to use vmu.meetings.hardLimitMs (extendlimit raises an OPEN meeting\u2019s bound; there is no unbounded choice)')
  }
  const opened = kernel.meetings.open({ ...(wantedId !== null ? { id: wantedId } : {}), type, chair: member, actor: member, roster, materials: str(args.agenda), secretary, wallLimitMs: durationMs,
    subject: subject === null || subject === undefined ? null : subject, at, title, sequence,
    subjectGate: subjectGate ? { allowed: true, applicable: subjectGate.applicable === true, form: subjectGate.form || null,
      proofVia: subjectGate.proofVia || null, provenance: subjectGate.provenance || null, proofBasis: subjectGate.proofBasis || null,
      proofChecked: subjectGate.proofChecked === true, note: subjectGate.note || null } : null,
    procedure: procedureFor(type) })
  // ★ 可读回的事实：预约不是"一个被收下的参数"，而是会议对象的状态。`state`/`scheduledFor` 由内核回执给出，
  // 这一面只转述；`scheduleNote` 只在真的进入 scheduled 时出现（不要给立即召开的会议编一句预约说明）。
  const state = opened && opened.state !== undefined ? opened.state : null
  const scheduledFor = opened && opened.scheduledFor !== undefined ? opened.scheduledFor : null
  const scheduleNote = state === 'scheduled'
    ? '★ 这场会议是【预约】的（scheduledFor=' + String(scheduledFor) + '）：status/summary/meetingView 现在就能读；开始时间之前的**治理动作**（发言、动议、表决、结会、会长动作）都会被内核具名拒绝。有一个例外要说清：`attend` 是座位登记，内核按设计**允许提前签到**（等待/预约状态里唯一被豁免的动作），它不会让会议提前开始——到点后按法定人数转 open，或先进入等待阶段，等待期间迟到者 attend 凑满法定人数，那一次触碰才会让会议开始；到点的判定由内核对每次 `beat()` 跑的一趟 sweep 结算（框架没有定时器：没人 beat 的进程不会自己醒）。'
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
    // ★★ ROUND 101 (E10b): the chair set the bound, so the receipt must READ IT BACK. The kernel returns it on
    // the open receipt; this face used to drop it, so `durationMs` would have been a parameter nobody could verify
    // (the same defect shape as a settings key with no live reader).
    wallLimitMs: opened && Number.isFinite(opened.wallLimitMs) ? opened.wallLimitMs : null,
    wallLimitMsSource: opened && opened.wallLimitMsSource !== undefined ? opened.wallLimitMsSource : null,
    wallLimitMsDefaultMs: opened && opened.wallLimitMsDefaultMs !== undefined ? opened.wallLimitMsDefaultMs : null,
    wallLimitNote: opened && Number.isFinite(opened.wallLimitMs)
      ? 'the meeting\u2019s OWN upper bound, frozen at open: `wallLimitMs` is the value, `wallLimitMsSource` says who froze it (`convene` = the chair set it with durationMs, `vmu.meetings.hardLimitMs` = the deployment default), and `extendlimit` can raise it later: extensions ADD to the current bound, and a request that would pass ' + wallCeilingPhrase(kernel) + ' is refused BY NAME (`VMU_RESOURCE_BUDGET`) — nothing is clamped to the boundary. `extendCeilingMs` is the ceiling in effect for THAT refusal.'
      : null,
    // ★ ROUND 33 / P2-③: the sequence read back. `index`/`total` describe WHERE this meeting sits in the declared
    // run; `next` names the meeting that advances it (null = this is the last). No reader should have to infer
    // "how many more meetings were declared" from the prose.
    sequence: opened && opened.sequence !== undefined ? opened.sequence : null,
    sequenceMeans: opened && opened.sequence !== undefined
      ? 'the meetings after this one were declared IN THIS CALL: `index` is this meeting\'s position (0-based), `total` counts it, and `next` is the SEQUENCE ROW of the meeting that follows (`{type,kind,subject}` - the declaration, not an id: an id exists only once that meeting is actually convened, and the driver takes the row, convenes it, and reads the new id from the open receipt; null = last). Advancing is decided by the call that declared them, not by a settings key, so `enforced` names no policy for it.'
      : null,
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
 *   · 收窄后为空 ⇒ **跳过收窄并披露**（R103：空工具面是坏配置，但坏配置不该杀掉整场会；回执 `narrowing.applied:false`
 *     与两个计数说清"声明了但没生效"，且不装 override）。
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
  const notNarrowed = (applied.rows || []).filter((r) => r && r.narrowing && r.narrowing.applied === false)
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
  // ★ RUN 84: `kernel.turn.step()` REPORTS its refusal as a value (`{ok:false,code,…}`), it does not throw — so the
  // round receipt said `ok:true` for a turn that never ran (`unknown phase: "round"`), and an agent reading only the top
  // level would believe the round happened. A face may not report success for a step that failed: the step's code and
  // message move to the top level, and `turn` keeps the whole reading.
  if (step && step.ok === false) {
    return {
      ok: false, tool: 'vibe_v5_meeting_round', meeting, type, chair, phase: str(args.phase || 'meeting'),
      code: step.code || 'VMU_STATE', message: step.message || 'the member turn failed',
      hint: step.hint || null, turnFailed: true, turn: step,
      narrowed: face.narrowed === true,
      narrowing: { type, narrowed: face.narrowed === true, reason: face.reason, expected: face.allow, members: applied.rows },
      members: ids,
      note: 'the meeting-type face was applied and CLEARED (it lives for one round only), but the member turn itself failed: read `turn.error`/`code` before retrying',
    }
  }
  return {
    ok: true, tool: 'vibe_v5_meeting_round', meeting, type, chair, phase: str(args.phase || 'meeting'),
    narrowed: face.narrowed === true, narrowing: { type, narrowed: face.narrowed === true, reason: face.reason, expected: face.allow, members: applied.rows },
    members: ids, turn: step,
    note: narrowNoteOf(face, notNarrowed),
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
/** ★ RULE E19（宏观规则 L46–L48「辩论阶段不使用投票板」）: WHICH still-open meeting makes the ballot board the wrong
 * instrument. This is the PACK's policy half on purpose — the ballot box is type-agnostic by design (it knows nothing
 * about meetings, and teaching it meeting TYPEs would make the kernel carry institution vocabulary). The refusal is
 * raised at the one `poll_open` face, so the sentence in the prompt and the gate in the runtime cannot drift.
 * Reads only published faces: `kernel.meetings.openMeetings()` (the durable marker, which excludes `closed` rows and
 * COUNTS what it left out) and `kernel.meetings.meetingView({meeting})` (the same view `vibe_vmu_meeting
 * {action:"status"}` returns, `:1980` in kernel/meetings.js). A `lapsed` debate still counts: it is a debate that
 * needs attention (it can be revived), not one that is over. Missing faces ⇒ null (this check never invents a block). */
function openDebateMeeting(kernel) {
  const face = kernel && kernel.meetings
  if (!face || typeof face.openMeetings !== 'function' || typeof face.meetingView !== 'function') return null
  let list = null
  try { list = face.openMeetings() } catch { list = null }
  const rows = list && Array.isArray(list.meetings) ? list.meetings : []
  for (const row of rows) {
    const id = row && row.id !== undefined && row.id !== null ? String(row.id) : ''
    if (id === '') continue
    let view = null
    try { view = face.meetingView({ meeting: id }) } catch { view = null }
    const type = view && view.type !== undefined ? view.type : (view && view.meeting && view.meeting.type)
    if (String(type || '') === 'debate') return id
  }
  return null
}

function toolPollOpen(args = {}, { kernel } = {}) {
  if (!has(args.question)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs a question', 'pass question:"…"')
  const options = Array.isArray(args.options) ? args.options.map(String).filter((x) => x !== '') : []
  if (options.length < 2) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs at least two options', 'pass options:["A","B"] (the ballot box refuses <2 by name)')
  requireChairSeat(kernel, args.member, 'poll_open')
  // ★★★ E19 (macro rules L46–L48): 辩论阶段不使用投票板. Until this guard existed the rule lived ONLY in the teaching
  // sentence — a poll could be opened in the middle of a debate and nothing said no. A debate settles with verdicts
  // (`vibe_v5_verdict` / `vibe_v5_verdict_ask`) plus the collected ruling, so the board is refused BY NAME here, with
  // the open debate's own id in the message and the two real ways forward in the hint.
  const debateOpen = openDebateMeeting(kernel)
  if (debateOpen) {
    throw refuse('VMU_NOT_PERMITTED',
      'the ballot board is not used while a debate is open: meeting "' + debateOpen + '" is a debate, and a debate settles with verdicts (vibe_v5_verdict / vibe_v5_verdict_ask), not with a poll',
      'settle it with vibe_v5_verdict { meeting: "' + debateOpen + '", proposition_id: "…", verdict: <0..1>, reason: "…" }, or close the debate first (chair: vibe_vmu_meeting { action: "close", id: "' + debateOpen + '" })')
  }
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

// ── ★★★ TASK-12 / RUN 31: THE CHANNEL A DEBATING MEMBER CAN ACTUALLY REACH ───────────────────────────────────────
// THE MEASUREMENT (the institute's own run-31 transcript, member session 6e2e2e81, tool call seq 84): `res-01` was
// asked by `vibe_v5_verdict_ask` to give its final ruling on `p-r31`, answered by calling `vibe_v5_verdict
// { member:"res-01", target:"p-r31", verdict:1, reason }` and got `VMU_NO_SUCH_OBJECT "no LIVE ballot with id p-r31"` —
// a TRUE refusal (a ballot verdict targets a LIVE ballot) that left the member with NO call to make. It wrote the
// ruling into a progress body instead; the chair then typed everyone's numbers into `vibe_v5_verdict_final.verdicts`,
// and `coverage.complete:true` counted the ROSTER rather than a submission. The rule being implemented is
// 「请各个辩论的各个成员给出最终裁决（布尔概率+理由）」 — so a member must be able to SAY its own ruling.
//
// WHERE THE SUBMISSION IS FILED, AND WHY THERE. A member's turn can run in its OWN kernel instance (activation
// delivery; measured in run 31 as a separate member session), so the submission must cross that boundary. In this
// kernel `records`/`chat`/`panel`/`notify` are MEMORY-only, and the mailbox snapshot is a whole-file replace (two
// kernels persisting at once would drop each other's rows). The one surface that is BOTH on disk and safe for
// concurrent writers is the member's OWN library directory (`<root>/Members/<member>/Propos/`): each member writes
// only inside its own folder and the chair rebuilds the index from disk. The tally never parses prose — the payload
// rides in the card body as ONE `VMU-RULING {json}` line, and the human sentence stays above it.
const RULING_STATUS = 'ruling'
const RULING_MARK = 'VMU-RULING '
const RULING_CHANNEL = 'ruling'
const rulingSlugOf = (s) => String(s === undefined || s === null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
const rulingIdOf = (a) => 'ruling-' + [a.meeting, a.proposition, a.member].map(rulingSlugOf).join('-')
const rulingTitleOf = (a) => 'RULING ' + [a.meeting, a.proposition, a.member].map((x) => String(x)).join(' | ')
/** ★★★ LIVE RUN 45 / DEFECT D: WHERE THE FILER CAN READ ITS OWN CARD BACK. This tool files a LIBRARY CARD, and
 *  `vibe_v5_read_library` lists records rows in `count`/`cards` — so in run 45 a member that had just filed a ruling
 *  read `count:0` and concluded it had filed nothing. The receipt now NAMES the field the card appears in, so the
 *  question 「我提交过裁决吗」 has an answer the filer is handed at the moment it files. */
function rulingReadBackOf(member, proposition) {
  return {
    tool: 'vibe_v5_read_library',
    call: 'vibe_v5_read_library { member: "' + String(member) + '" }',
    field: 'libraryCards',
    means: 'the ruling on ' + String(proposition) + ' is a FILE card of yours (Members/' + String(member) + '/Propos/), so '
      + '`vibe_v5_read_library { member: "' + String(member) + '" }` lists it in `libraryCards`/`libraryCardCount` — NOT in `count`/`cards`, '
      + 'which only list records rows. A `count:0` there is not "I filed no ruling": look at `libraryCards` (and `libraryReadable`/"no library face" in `libraryWhy`) before concluding anything',
  }
}
/** The library face, or null. A kernel assembled without a durable root has no library at all — that is a REFUSAL on
 *  the submit path, never a silent "filed" (a ruling nobody can read back would be the fake coverage this replaces). */
function rulingLibraryOf(kernel) {
  const lib = kernel && kernel.library
  if (!lib || typeof lib.append !== 'function' || typeof lib.list !== 'function' || typeof lib.expand !== 'function') return null
  return lib
}
/** The machine payload of a ruling card: one `VMU-RULING {…}` line in the body, nothing else is parsed. */
function rulingPayloadOf(body) {
  const lines = String(body === undefined || body === null ? '' : body).split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (t.indexOf(RULING_MARK) !== 0) continue
    try {
      const p = JSON.parse(t.slice(RULING_MARK.length))
      return p && typeof p === 'object' ? p : null
    } catch { return null }
  }
  return null
}
/** EVERY ruling filed for ONE (meeting, proposition), read back from the library on disk — the chair's read side.
 *  The rows are a fact on disk, never a parameter: that is the difference between "the members said it" and "the
 *  chair typed it". A second card for the same member with a DIFFERENT value is reported as a duplicate, never
 *  silently collapsed. */
async function rulingSubmissionsOf(kernel, { meeting, proposition }) {
  const library = rulingLibraryOf(kernel)
  if (!library) {
    return { readable: false, why: 'this kernel has no library face (it was assembled without a durable root), so no filed ruling can be read back', rows: [], cards: 0, duplicates: [] }
  }
  let heads = []
  try { heads = await library.list({ kind: 'proposition' }) } catch (e) {
    return { readable: false, why: 'the library head list could not be read: ' + String((e && e.message) || e), rows: [], cards: 0, duplicates: [] }
  }
  const cards = (Array.isArray(heads) ? heads : []).filter((h) => h && String(h.status || '') === RULING_STATUS)
  const rows = []
  for (const h of cards) {
    let body = null
    let path = null
    try { const ex = await library.expand(h.id); body = ex && ex.body; path = ex && ex.path } catch { continue }
    const payload = rulingPayloadOf(body)
    if (!payload) continue
    if (String(payload.meeting || '') !== String(meeting) || String(payload.proposition || '') !== String(proposition)) continue
    const member = payload.member ? String(payload.member) : (h.owner ? String(h.owner) : '')
    const verdict = Number(payload.verdict)
    if (!member || !Number.isFinite(verdict)) continue
    rows.push({ member, verdict, reason: payload.reason === undefined || payload.reason === null ? '' : String(payload.reason),
      at: h.updatedAt || null, id: String(h.id), path: path ? String(path) : null })
  }
  // OLDEST FIRST, then keep the LATEST per member: a re-filed card (which this face refuses, but another kernel could
  // still have written) is not hidden — a disagreement lands in `duplicates` with both ids and both values.
  rows.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')) || String(a.id).localeCompare(String(b.id)))
  const effective = new Map()
  const duplicates = []
  for (const r of rows) {
    const prev = effective.get(r.member)
    if (prev && Number(prev.verdict) !== Number(r.verdict)) {
      duplicates.push({ member: r.member, kept: { id: r.id, verdict: r.verdict, at: r.at }, dropped: { id: prev.id, verdict: prev.verdict, at: prev.at },
        means: 'this member has TWO ruling cards with different values; the LATEST (kept) is the one the tally uses, and both are reported so the disagreement is visible instead of averaged away' })
    }
    effective.set(r.member, r)
  }
  return { readable: true, why: null, rows: [...effective.values()], cards: cards.length, duplicates }
}
/** WHERE the card that has to be corrected LIVES. A records row has no file; a library card has one, and naming it is
 *  the difference between "go fix it" and "fix it here". Never invents a path. */
async function libraryCardPathOf(kernel, id) {
  const library = rulingLibraryOf(kernel)
  if (!library) return { path: null, why: 'this kernel has no library face (no durable root), so no card file can be named' }
  if (!has(id)) return { path: null, why: 'no proposition id was given, so no card file can be named' }
  try {
    const heads = await library.list({ kind: 'proposition' })
    // ★ A library card's index id carries a fingerprint suffix (`<slug>-<fp8>`), so the id a caller holds may be the
    // exact index id OR the name the card was written with. Both are matched here (exact first) rather than answering
    // "no file" for a card that plainly exists on disk.
    const list = Array.isArray(heads) ? heads : []
    const hit = list.filter((h) => h && String(h.id) === str(id))[0]
      || list.filter((h) => h && String(h.id).indexOf(str(id) + '-') === 0)[0]
    if (!hit) return { path: null, why: 'proposition "' + str(id) + '" is a records row, not a library card: there is no file to edit, so the correction is the call above (the records face owns that row)' }
    const ex = await library.expand(hit.id)
    return { path: ex && ex.path ? String(ex.path) : null, why: null }
  } catch (e) { return { path: null, why: 'the library index could not be read: ' + String((e && e.message) || e) } }
}
/** THE MEMBER'S OWN ACT: file YOUR final debate ruling. Refusals are named and speak to the member (not to the
 *  chair), because the member is the caller: a member that is not part of the debate, a ruling already filed with a
 *  different value, and a session with no durable library are three DIFFERENT answers. */
async function submitRuling({ kernel, member, meeting, proposition, verdict, reason }) {
  if (!member) {
    throw refuse('VMU_INVALID_ARGUMENT', 'submitting YOUR final ruling needs the acting member id', 'pass member:"<your roster id>" — a pack handler has no agent→member map')
  }
  if (!meeting) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the ruling needs the meeting it was debated in', 'pass meeting:"<the meeting id in the chair\'s final-ruling request>"')
  }
  if (!proposition) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the ruling needs the proposition it judges', 'pass proposition_id:"<the proposition id in the chair\'s final-ruling request>"')
  }
  const library = rulingLibraryOf(kernel)
  if (!library) {
    throw refuse('VMU_RULING_NO_LEDGER', 'this session has no durable library, so YOUR ruling has nowhere to be filed — nothing was written and the chair will not see it',
      'the deployment must assemble this kernel with a durable root (config.root): a ruling is a card under Members/<member>/Propos/, which is what lets the chair read it from ANOTHER kernel. A receipt that claimed "filed" without a ledger is the fake coverage.complete this channel exists to replace')
  }
  const debated = debatedMembersOf(kernel, meeting)
  const listed = Array.isArray(debated.members) ? debated.members : []
  // A CHECK ONLY WHEN THE FACT IS READABLE. In a member's own (activation) kernel the meeting's roster can be
  // unreadable — the same honest gap run 31 measured. Refusing there would refuse the very members this channel is
  // for, so the check happens when the chair collects (and the receipt says which of the two happened).
  const rosterChecked = debated.readable === true && listed.length > 0
  if (rosterChecked && !listed.includes(member)) {
    if (String(debated.chair || '') === member) {
      throw refuse('VMU_RULING_CHAIR_SIGNS', 'the chair signs the tally instead of filing a member ruling: "' + member + '" presides over ' + meeting,
        'the members who debated submit their own rulings; the chair collects and adopts them with vibe_v5_verdict_final { meeting, proposition_id } — the chair does NOT type the members\' numbers')
    }
    throw refuse('VMU_RULING_NOT_DEBATER', '"' + member + '" did not debate ' + proposition + ', so it has no final ruling to file',
      'the members this ruling will count are the ones the meeting recorded: ' + (listed.length ? listed.join('、') : '(none readable)') + ' — if you should be in that set, the meeting has to record you first (vibe_v5_meeting { action: "speak" })')
  }
  const filed = await rulingSubmissionsOf(kernel, { meeting, proposition })
  const mine = filed.rows.filter((r) => r.member === member)
  if (mine.length) {
    const same = mine.filter((r) => Number(r.verdict) === Number(verdict) && String(r.reason || '') === String(reason || ''))[0]
    if (same) {
      // IDEMPOTENT: the same act twice is one ruling, not two cards (and not an error the member has to work around).
      return { ok: true, tool: 'vibe_v5_verdict', channel: RULING_CHANNEL, idempotent: true, duplicate: true,
        submission: { id: same.id, path: same.path, at: same.at, member, meeting, proposition, verdict: same.verdict, reason: same.reason },
        means: 'this is YOUR final ruling on ' + proposition + ', and it was ALREADY filed exactly like this — nothing was written a second time, and the tally counts it once',
        rosterChecked, rosterSource: debated.source,
        readBack: rulingReadBackOf(member, proposition),
        next: 'the chair collects it with vibe_v5_verdict_final { meeting: "' + meeting + '", proposition_id: "' + proposition + '" }' }
    }
    throw refuse('VMU_RULING_ALREADY_FILED', 'you already filed a DIFFERENT ruling on ' + proposition + ' (verdict ' + String(mine[0].verdict) + ', filed ' + String(mine[0].at || 'at an unrecorded time') + '): this one (' + String(verdict) + ') was NOT filed and the chair will not see it',
      'your filed ruling is the one that counts — it is ' + (mine[0].path ? 'the card ' + mine[0].path : 'card id ' + mine[0].id) + '. This face has no path that rewrites a filed ruling: if the number was wrong, say so to the chair, who rules on the set the receipts show (a chair does not rewrite a member\'s ruling either)')
  }
  const id = rulingIdOf({ meeting, proposition, member })
  const title = rulingTitleOf({ meeting, proposition, member })
  const statement = '对命题 ' + proposition + ' 的最终裁决：' + String(verdict) + '（会议 ' + meeting + '，裁决人 ' + member + '）'
  const payload = { v: 1, kind: 'final-ruling', meeting, proposition, member, verdict, reason: reason || '' }
  let added = null
  try {
    added = await library.append({ kind: 'proposition', id, title, statement, proof: RULING_MARK + JSON.stringify(payload),
      visibility: 'public', status: RULING_STATUS }, { member })
  } catch (e) {
    throw refuse((e && e.code) || 'VMU_STATE', String((e && e.message) || 'the library refused this ruling'),
      (e && e.hint) || 'the ruling card is written under Members/<member>/Propos/ — a refusal here is the write gate or the naming policy saying no, and the ruling was NOT filed')
  }
  // READ IT BACK: the receipt states a fact on disk (id, path, time), not a claim about what append was asked to do.
  const after = await rulingSubmissionsOf(kernel, { meeting, proposition })
  const row = after.rows.filter((r) => r.member === member)[0] || null
  return {
    ok: true, tool: 'vibe_v5_verdict', channel: RULING_CHANNEL,
    submission: {
      id: (row && row.id) || (added && added.id) || id,
      path: (row && row.path) || (added && added.file) || null,
      at: (row && row.at) || null,
      member, meeting, proposition, verdict, reason: reason || '',
    },
    means: 'this is YOUR final ruling (' + String(verdict) + ' on ' + proposition + ') and it is now a card of your own on disk, so it SURVIVES your session and the chair adopts it from the tally — the chair does not write this number for you',
    rosterChecked, rosterSource: debated.source,
    readBack: rulingReadBackOf(member, proposition),
    rosterCheckedMeans: rosterChecked
      ? 'the debate on ' + meeting + ' was readable in this session, so your membership in it was checked before the ruling was filed'
      : 'this session could not read who debated ' + meeting + ' (' + String(debated.why || debated.source || 'unreadable') + '), so the membership check happens when the chair collects — submit, and the chair names any member who did not debate',
    next: 'the chair collects every filed ruling with vibe_v5_verdict_final { meeting: "' + meeting + '", proposition_id: "' + proposition + '" } (all agree ⇒ that value, otherwise the arithmetic mean)',
    note: 'the ruling is a card under Members/' + member + '/Propos/ — writing it inside YOUR OWN folder is what makes concurrent submissions safe and lets the chair read them from another kernel',
  }
}

/** ★ `vibe_v5_verdict` — a boolean verdict, on ONE of TWO faces (the caller's context decides, never a silent default):
 *  ① a BALLOT verdict on the object under verification ([0,1]: 1 true, 0 false, between = an UNCERTAIN probability).
 *     The vmu verification ballot is a LIVE ballot (`kernel.liveBallot(id)`), so `target` is resolved through it; no
 *     such live ballot is a NAMED refusal rather than an invented ballot. This face is unchanged.
 *  ② a DEBATE RULING for the member itself: `meeting` + `proposition_id` (no `target`) files the member's own final
 *     ruling, which the chair's `vibe_v5_verdict_final` collects and adopts (see the block above).
 *  Neither context is a named refusal that shows both faces — the run-31 failure was a TRUE refusal that named only
 *  the ballot, so a member holding no ballot had nowhere to go. */
async function toolVerdict(args = {}, { kernel } = {}) {
  if (args.verdict === undefined || args.verdict === null) throw refuse('VMU_INVALID_ARGUMENT', 'verdict needs a number in [0,1]', 'pass verdict:1 / 0 / a probability')
  const v = Number(args.verdict)
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw refuse('VMU_INVALID_ARGUMENT', 'verdict must be a number in [0,1]', '1 = true, 0 = false, anything else = an UNCERTAIN estimate')
  }
  if (!has(args.target)) {
    if (has(args.meeting) && has(args.proposition_id)) {
      return await submitRuling({ kernel, member: str(args.member).trim(), meeting: str(args.meeting), proposition: str(args.proposition_id), verdict: v, reason: has(args.reason) ? str(args.reason) : '' })
    }
    throw refuse('VMU_RULING_NEEDS_CHANNEL', 'a verdict needs either the LIVE ballot it votes on, or the debate ruling it answers',
      'pass target:"<live ballot id>" to vote on a ballot; pass meeting:"<meeting id>" + proposition_id:"<proposition id>" to file YOUR final debate ruling (布尔概率 + 理由), which the chair collects with vibe_v5_verdict_final')
  }
  const member = requireVoter(kernel, args.member, 'verdict').id
  if (typeof kernel.liveBallot !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no live-ballot registry is published, so a verdict cannot be cast', 'assemble a full kernel (vibe-math-vmu.js)')
  }
  const ballot = kernel.liveBallot(str(args.target))
  if (!ballot || typeof ballot.cast !== 'function') {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no LIVE ballot with id ' + str(args.target), 'the ballot must be open; the original cast verdicts on the object under verification')
  }
  // ★★ LIVE RUN 22: the ballot's own face throws `VMU_STATE "the ballot is not open"` once it is tallied, and that
  // throw used to escape this handler and kill the host (see the rail in `vibe-math-vmu/host-pack-tools.js`). Two
  // layers now: this pre-check gives the READER a sentence about what happened to the ballot, and the funnel turns
  // any remaining named throw into a receipt. A verdict on a settled ballot is a normal race, not a crash.
  const boxState = ballot && typeof ballot.status === 'function' ? (() => { try { const s = ballot.status(); return s && s.state ? String(s.state) : null } catch { return null } })() : null
  if (boxState && boxState !== 'open' && boxState !== 'frozen') {
    throw refuse('VMU_STATE', 'no verdict may be cast on this ballot: it is already settled (state=' + boxState + ')',
      'the ballot is closed; a settled ballot keeps its tally — record further judgement with vibe_v5_record_progress, or open a NEW ballot with vibe_vmu_meeting {action:"ballot"}')
  }
  let r
  try {
    r = ballot.cast(member, v, { kind: v === 1 || v === 0 ? 'decisive' : 'estimate' })
  } catch (err) {
    throw refuse((err && err.code) || 'VMU_STATE', String((err && err.message) || 'the ballot refused this verdict'),
      (err && err.hint) || 'the ballot must be OPEN to take a verdict; re-open it or open a new one')
  }
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
/** The leader the institute currently recognises ('' = nobody: the setting is unset or blank). */
function leaderIdNow(kernel) {
  const view = kernel && typeof kernel.settingsView === 'function' ? kernel.settingsView() : null
  if (!view || typeof view.get !== 'function') return ''
  const v = view.get('vmu.turn.leaderId')
  return v === undefined || v === null ? '' : String(v)
}

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
  // ★ ROUND 94: seating the chair and leaving `vmu.turn.leaderId` empty made every prompt open with
  // `chair-seated-but-leaderId-empty` — the roster HAD an academician while the charter said the institute had
  // none, and the agent had to discover a `vibe_v5_configure` call to repair a state this tool created. The act
  // that seats the chair records who leads (only when nobody leads yet: an operator's choice is never overwritten).
  if (hired.includes('r-acad') && leaderIdNow(kernel) === '') {
    applied.push(applyDeclaredSetting(kernel, 'vmu.turn.leaderId', 'r-acad'))
  }
  if (has(args.problem)) applied.push(applyDeclaredSetting(kernel, 'vmu.turn.objective', str(args.problem)))
  // ★ The seats seeded here are the ones a run will actually drive, so the scope is applied AT SEATING TIME rather
  // than left to whichever later call happens to remember. `memberScope` carries the seam's answer by name.
  const memberScope = applyMemberScope({ kernel, members: hired })
  return { ok: true, tool: 'vibe_v5_start', hired, started, applied, memberScope, memberScopeNote: MEMBER_SCOPE_NOTE,
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
  // ROUND 200 (F-88b): every action except `sections` addresses ONE paper. Without a target the subsystem
  // answered `no paper "" exists`, which reads like a bug in the reader instead of a missing argument — so a
  // missing target is refused BY NAME here, naming the aliases and the read that lists papers.
  const TARGET_ACTIONS = new Set(['status', 'start', 'part', 'review', 'advance', 'final', 'render', 'compile', 'consult', 'consult_state', 'sections_all'])
  if (TARGET_ACTIONS.has(action) && !target) {
    throw refuse('VMU_INVALID_ARGUMENT', 'action "' + action + '" addresses ONE paper, and no target was given',
      'pass target:"<paper id>" (title/track are aliases of the same value); vibe_v5_paper { action: "status" } with no target lists the papers that exist')
  }
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
      // ★ ROUND 95: a fabricated evidence pointer used to be accepted here and refused by the quality gate at `render`
      // — after the paper had been written, cross-reviewed and consulted (the most expensive possible moment). The
      // pointers are resolved NOW; the gate keeps its own requirements (>=1 entry per part, a fingerprint per citation).
      const evidence = Array.isArray(args.evidence) ? args.evidence : []
      const pointers = typeof paper.evidencePointers === 'function' ? paper.evidencePointers(evidence) : null
      if (pointers && pointers.ok !== true) {
        throw refuse('VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
          'these evidence pointers do not resolve against the records face: ' + pointers.unknown.map((u) => '"' + u.pointer + '" (' + u.reason + (u.expectedTrack ? ', expected track ' + u.expectedTrack : '') + ')').join('; '),
          'write the record first (vibe_v5_record_proposition / vibe_v5_record_method / vibe_v5_record_subproblem), then re-write this part with the pointer it produced; a pointer is Members/<member>/(Propos|Methods|Subproblems|Progress)/<record id>.md')
      }
      const part = paper.recordPart({
        target,
        member: str(args.member),
        title: str(args.part || args.title || ''),
        solution: str(args.body || args.solution || ''),
        methods: str(args.methods || ''),
        rules: str(args.rules || ''),
        limits: str(args.limits || ''),
        evidence,
      })
      return { ok: true, tool, action, part,
        evidence: pointers === null ? null : { provided: pointers.provided, checked: true,
          resolved: pointers.resolved.map((r) => r.cardId), means: pointers.means } }
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
        // ★ ROUND 95: `wrote` lists RECORD kinds written into the paper track; render() writes no file, so a reader
        // who looks at `Paper/<id>/` and finds only a .tex (written by compile) used to conclude the receipt lied.
        wroteWhere: {
          records: Array.isArray(rendered.wrote) ? rendered.wrote.slice() : [],
          disk: [],
          means: '`wrote` lists the RECORD kinds written into the paper track (md/tex/meta). render() writes NO file: a .tex/.pdf reaches Paper/<id>/ only when compile runs, which is when the disk list would carry it',
        },
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
      const answerer = requireConsultAnswerer(kernel, by)
      const answered = paper.recordConsult({ target, by, note: str(args.note || args.notes || ''),
        answer: has(args.answer) ? str(args.answer) : null })
      const after = paper.consultState({ target })
      return { ok: true, tool, action, target: after.target, consult: {
        requestId: answered.requestId, answeredBy: answered.answeredBy, answeredRole: answered.answeredRole || null,
        answererKind: answerer.answererKind || 'roster-seat',
        answererMeans: answerer.answererKind === 'declared-role'
          ? 'the office answered by its DECLARED ROLE (PAPER_CONSULT_ROLES), not by a roster seat: the office is the session running the work, so it has no seat id to match'
          : 'a live roster seat answered (matched by id or slot against PAPER_CONSULT_ROLES)',
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
/**
 * ★ ROUND 69 / F-65: THE CARD'S VALUES WERE ONLY PROSE TO A READER.
 *
 * Measured on the real machine (run 69, build 5c5b3532): the office read back the proposition card it had just written
 * and `read_library` answered with `card.body` ("- statement：…
- p：0.6 …") but NO `p`, no `value`, no `proofState`
 * on the row. The framework itself had those values — `verified.js#parseCardBody` parses the SAME prose for the debate
 * and verified gates — so the product held two copies of one fact and gave the agent only the copy it cannot compute
 * with. An agent that must re-parse another tool's prose is being asked to be the parser.
 *
 * WHAT THIS DOES (no new parser): the rows and the single-card read of `vibe_v5_read_library` get `cardFields` — the
 * fields the ONE authority (`parseCardBody`) already reports for that body — plus `cardFieldsMeans`. The body stays
 * exactly the author's text (it is the author's field, not ours); a card that CANNOT be judged keeps `p: null` and
 * carries `cardUnjudgeable` with the parser's own reason, so "no p" is never silently indistinguishable from "p is 0".
 */
/**
 * ★ C8（独立审计，2026-10）：「命题库……那些布尔概率为 1 的命题卡需标记为已 verified。」
 *
 * 现状是 p=1 的卡会在 Verified 轨上得到一行（`verified.js#promoteVerified` 写的，标题带 `已验证｜`），但**卡自己**
 * 读出来看不出这件事，也指不回那一行：读者只看到 `p:1`，无从判断"这条已经 verified 了"还是"只是一个等于 1 的估计"。
 *
 * 这里只做**读**：用已有的读函数 `findVerified`（不是第二份解析器、不是新存储）按 `- cardId：` 找那一行，把
 * `{id,title,at}` 挂到卡上。找不到就诚实给 `null`，并由 `verifiedRefMeans` 说明"是没找到，还是这次读不到"——
 * 撤回过的证明（fidelity registry）在 `findVerified` 里本来就不可见，所以 `verifiedRef` 也跟着一起隐藏。
 */
function verifiedRefOf(records, cardId, kernel) {
  const none = (why) => ({ ref: null, means: '`verifiedRef:null`：' + why })
  if (!records || !cardId) {
    return none('这张卡这次读不出 id，无法按 `- cardId：` 在 Verified 库里比对 —— `null` 只说明这次没比对成，不是"没有定论行"。')
  }
  let found = null
  try {
    found = findVerified(records, String(cardId), { fidelity: kernel && kernel.fidelity ? kernel.fidelity : null })
  } catch (e) {
    return none('这一次读不到 Verified 库（' + String((e && (e.code || e.message)) || e) + '），所以无法判断它有没有对应的定论行 —— 不是"没有"。')
  }
  if (!found) {
    return none('没在 Verified 库里找到与这张卡对应的行（按卡 id 比对 `- cardId：`，不靠标题或位置猜）。规则 C8 要求 p=1 的命题卡被标记为已 verified：这张卡还没有那一行。')
  }
  const v = found.verified && typeof found.verified === 'object' ? found.verified : {}
  return {
    ref: {
      id: found.id === undefined || found.id === null ? null : String(found.id),
      title: found.title === undefined || found.title === null ? null : String(found.title),
      at: v.at === undefined || v.at === null ? null : v.at,
    },
    means: '`verifiedRef` 指回 **Verified 库**里与这张命题卡对应的那一条定论行（id/title/at 都是那一行的实际字段）：规则 C8 要求 p=1 的命题卡被标记为已 verified，这里给的就是它已经落库的那一行，`at` 是那一行自己的时间。`null` 只表示没找到（或这次读不到库，见本字段的说明）。',
  }
}

async function toolReadLibraryWithCardFields(args = {}, { kernel } = {}) {
  const out = await toolReadLibrary(args, { kernel })
  if (!out || out.ok !== true) return out
  const records = recordsOf(kernel)
  const decorate = (row) => {
    if (!row || typeof row !== 'object') return row
    if (String(row.track || '') !== 'propositions') return row
    let body = row.body
    if (body === undefined || body === null) {
      try {
        const full = records.get({ id: row.id })
        body = full && (full.record ? full.record.body : full.body)
      } catch { body = null }
    }
    const parsed = parseCardBody(body)
    const fields = parsed && parsed.fields ? parsed.fields : {}
    const text = (v) => (v === undefined || v === null ? null : String(v))
    const next = Object.assign({}, row, {
      cardFields: {
        p: parsed && parsed.card ? parsed.card.p : null,
        statement: text(fields.statement), value: text(fields.value), motive: text(fields.motive),
        proofRef: text(fields.proofRef), proofState: text(fields.proofState),
      },
      cardFieldsMeans: "`cardFields` are the fields of the card BODY, parsed by the one authority the debate/verified gates use (verified.js#parseCardBody). `card.body` stays the author's text — these are the same facts as program values, not a second declaration. `cardFields.p === null` with `cardUnjudgeable` set means the body could not be judged; it does NOT mean p is zero.",
    })
    if (parsed && parsed.ok !== true) {
      next.cardUnjudgeable = (Array.isArray(parsed.problems) && parsed.problems.length > 0)
        ? parsed.problems.join('; ')
        : String(parsed.reason || 'the card body could not be parsed')
    }
    // ★ C8：这张卡在 Verified 库里对应哪一行（读面自己说，不要求读者去另一张表里猜）。
    const verifiedRef = verifiedRefOf(records, row.id, kernel)
    next.verifiedRef = verifiedRef.ref
    next.verifiedRefMeans = verifiedRef.means
    return next
  }
  const next = Object.assign({}, out)
  if (Array.isArray(out.cards)) next.cards = out.cards.map(decorate)
  if (out.card && typeof out.card === 'object') next.card = decorate(out.card)
  return next
}

export const V5R_PACK_TOOLS = Object.freeze([
  {
    name: 'vibe_v5_record_progress',
    description: 'Append to YOUR research log. ★ Pass `member:"<your id>"` — without it the author of the row is UNKNOWN (`by:null`, `bySource:"unknown"`) and the status board cannot tell whose log it is. track picks the file: progress (default) / routes / obstacles / rejected / state — use rejected for disproved routes and obstacles for blockers, so negative knowledge is archived in its own track. '
      + '★ The STATE panel (track:"state") has FOUR REQUIRED contents — progress (当前进度), obstacles (遇到的障碍), next (下一步计划), help (需要的帮助) — passed flat or nested under `state`; a panel missing one is refused by name with the missing keys in `missing`, and `content` is free text on top, never a substitute.',
    parameters: { content: { type: 'string' }, track: { type: 'string' }, title: { type: 'string' }, member: { type: 'string' },
      progress: { type: 'string' }, obstacles: { type: 'string' }, next: { type: 'string' }, help: { type: 'string' }, state: { type: 'object' } },
    handler: toolRecordProgress,
  },
  {
    name: 'vibe_v5_record_proposition',
    description: 'Record a proposition/lemma card in your library. REQUIRES statement, value, motive and p (your probability that it is true); the card is settled when p is 1 or 0. ★ p=1 IS A CONCLUSION, NOT A PREFERENCE: writing 1 is refused BY NAME unless the write carries one of the three conclusions the rule accepts — a promoted verified row on THIS card (the kernel record, not an argument), a unanimous debate ruling (`debate_ruling:{mode:"unanimous", value:1, subject:"<this card id>", ballotId}`), or a passed Lean run PLUS the conformance ruling (`lean_job` + `lean_conformance:"conform"`). Estimating in (0,1) is always allowed. '
      + '★ LITERATURE (B2): a proposition taken from a reference may enter the verified track directly — pass `literature_ref:"<author, source, theorem/page>"` together with `p:1` (the gate accepts this citation as the fourth evidence form), then `vibe_v5_verified_promote{card, warrant_kind:"literature", literature_ref:"<the same citation>"}`; the verified row warrant IS the citation, so "why is this settled" answers with a source instead of "someone decided". An empty citation is not a citation. '
+ '★ PROOF REGISTRATION (B6): pass `proof_ref` (where the proof/refutation lives, e.g. "Members/<m>/Propos/<pid>.md#正式证明") and `proof_state:"complete"|"draft"` — this is a SELF-REPORT, recorded and traceable, NOT a verification: a debate on this card still needs machine evidence (a passed Lean run on it, or a verified row). Only `proof_ref` ⇒ state is recorded as draft.'
      + ' ★ 代记（REGISTRAR DUTY）：研究所的正式记录本由**所办**登记。收完一位成员的回执后，用本工具并传 `member:"<该成员id>"` 把该成员声明的卡片登记进去——`member` 就是卡的作者（owner），**必须是该成员而不是你自己**；否则持有者会变成所办，后续通知/认领都会指错人。',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, literature_ref: { type: 'string' }, track: { type: 'string' }, payload: { type: 'object' }, debate_ruling: { type: 'object' }, member: { type: 'string' } },
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
    description: 'Speak in the group chat (omit `to` and `meeting`), send a private message (`to`: a member id / "all" / "voters"), or record a meeting speech (`meeting`: the open meeting id). The speaker must be a REAL roster id: this tool never invents one. '
      + '★ SINGLE-SPEECH ROUND (`round`): name the round and each member may speak ONCE on it — the same member\'s second speech in the SAME round is refused by name (`VMU_CHAT_ALREADY_SPOKE`, nothing recorded), while a NEW round id allows speaking again. With `round` and NO `text` the call is a READ: it opens no page and answers `spokenBy` (who has already spoken) and `remaining` (who is still owed a turn; `null` when no participant list is known). `members` declares the round\'s participants; without it the kernel roster seam supplies them. '
      + '★ WHAT THIS IS: bookkeeping + a named refusal — the receipt\'s `means` says it plainly. It is NOT isolation: messages are not queued or ordered against each other, so 「不打断」 is the room convention this book enforces after the fact. '
      + '★ A `round` here is a CHAT round book, and every receipt and page says so: `roundSurface:"chat"` plus `roundSurfaceMeans` telling you that a MEETING round is opened and advanced through the meeting face instead. Measured on run 107: a caller read `remaining:["r-1","r-2"]` as the debate round of a meeting it had just convened, because nothing in the receipt named the surface. '
      + '★ `round` cannot be combined with `to` or `meeting` (those forms have a recipient/ordering of their own) — that combination is refused by name. '
      + '★ `urgent:true` is available ONLY on the private-message form (it is the sender\'s explicit intent, carried by the mailbox\'s own urgency semantics and reflected in the recipient\'s inbox row); the group-chat and meeting forms are refused by name when `urgent` is set, because neither has a recipient to wake.',
    parameters: { member: { type: 'string', required: true }, text: { type: 'string' }, to: { type: 'string' }, meeting: { type: 'string' }, urgent: { type: 'boolean' }, round: { type: 'string' }, members: { type: 'array' } },
    handler: toolSay,
  },
  {
    name: 'vibe_v5_message',
    description: 'Relay a message into the institute: to a member id, to "all", or to "voters". Delivered as per-recipient durable mail. SENDER: `member` names whose voice the mail carries (a member id, or omitted = "office"); the OFFICE is what actually relays it, so the receipt names both sides — `from` is the voice, `relayedBy` is "office". Without `member` the mail is from the office, and a member-to-member message is impossible to express.',
    parameters: { to: { type: 'string', required: true }, content: { type: 'string', required: true }, subject: { type: 'string' }, urgent: { type: 'boolean' }, member: { type: 'string' } },
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
    description: 'Dismiss a TEMP worker for real: seat ended through the members face, and that member\'s open tasks moved to cancelled. The academician seat is NOT dismissable through this face (the flow/office settles it), and a member seat may only dismiss its own temp workers — the receipt carries `targetSeat`/`ownership`/`ownershipMeans` and says `unrecorded` on a roster that keeps no hiring attribution. Mail is not purged (no per-member purge is exposed) — reported, not pretended.',
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
    description: 'Work-experience / process feedback library (not research conclusions). op=add needs category/route/phenomenon/impact and the recommendation (pass `recommendation`, or the legacy body key `action` when its value is not an op word) — plus assessment on the interpersonal route; op=update closes with status/outcome/note; op=list returns the open items. ★ `op` is the OPERATION; the recommendation is the FIFTH BODY FIELD, stored on the card as `recommendation：` (the legacy INPUT key `action` still works — it is only refused when its value is just an op word). Passing action:"add" is refused by name `VMU_FEEDBACK_ACTION_IS_THE_OPERATION`, because a receipt that stores the operation verb as the recommendation loses the one thing the form asks for.',
    parameters: { op: { type: 'string', required: true }, id: { type: 'string' }, member: { type: 'string' }, category: { type: 'string' }, route: { type: 'string' }, context: { type: 'string' }, phenomenon: { type: 'string' }, impact: { type: 'string' }, action: { type: 'string' }, recommendation: { type: 'string' }, assessment: { type: 'string' }, outcome: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, all: { type: 'boolean' }, limit: { type: 'integer' } },
    handler: toolFeedback,
  },
  {
    name: 'vibe_v5_read_library',
    description: 'Read anyone\'s library (read-only): id reads one card; the list form reads EVERY declared track (vmu.records.tracks — so a member\'s state panel, obstacles, rejected routes and feedback are all readable) and filters by kind, by the card\'s author, and by `track`/`tracks`. '
      + '★ An undeclared track name is refused by name with the declared set in `declared`; a declared track the records face itself refuses is reported in `skippedTracks`, never silently dropped. '
      + '★ TWO NOUNS, TWO SHAPES (round 42): a RECORD id is minted as `rec-<n>` and a MEMBER id as `r-<n>` — `id` reads a RECORD, `member` reads a PERSON’s library. Passing a member id as `id` is refused by name and the hint tells you to pass `member:"<id>"`; legacy `r-<n>` records still read (ids are names, nothing was migrated).',
    parameters: { member: { type: 'string' }, kind: { type: 'string' }, id: { type: 'string' }, list: { type: 'boolean' }, limit: { type: 'integer' }, track: { type: 'string' }, tracks: { type: 'array' } },
    handler: toolReadLibraryWithCardFields,
  },
  {
    name: 'vibe_v5_meeting',
    description: 'Convene a meeting. agenda REQUIRED; type is one of ordinary/academic/debate/closure/paper/planning (default ordinary) and a debate REQUIRES subject (its object: a card id, a file reference, or one line). ★ `title` is an OPTIONAL separate name (omit it and the agenda stays as the subject; non-string is refused by name). ★ `at` SCHEDULES it: epoch milliseconds or an ISO-8601 string (e.g. "2026-10-24T10:00:00+08:00"); a future time puts the meeting in the `scheduled` state — status/summary/meetingView read it right away, but every action before the start time is refused BY NAME, and when the start time arrives with too few present it waits (a latecomer attending then starts it). The receipt reads the real state back (`state`, `scheduledFor`). ★ A DEBATE\'S SUBJECT MUST CARRY A FINISHED PROOF: a card id must have `proofRef`+`proofState:"complete"` (or a verified row / a passed Lean run), a file reference needs `subject_evidence.file = {readable:true, bytes:N, name}` (the gate only proves "exists and is non-empty" — content completeness is judged by the members in the debate), and a one-line proposition is legal but the receipt records `subjectGate.provenance:"none"` because nothing can be checked. A type that the institution gave a recommended procedure returns it in `procedure` — ★ it is a RECOMMENDATION, never a gate: skipping or reordering it is allowed and unchecked. Steps the framework has NOT implemented are reported in `pendingSteps`. ★ THIS FACE ONLY CONVENES (plus ONE read: `action:"rulings"` reads the ruling cards the members filed for a debate — pass id + proposition_id; it shows rows/cards/duplicates and never tallys). status/summary/close/flow live on vibe_vmu_meeting { action, id }. The original could also PROPOSE a meeting from a non-chair seat — this face has no propose path, and the receipt says so by name. ★ `id` optionally NAMES the meeting (omit it and the service mints one); an id already held by the OTHER (primitive) meeting registry is refused by name, naming that table. ★ `target` is an ALIAS of `subject` on THIS face (one value, one meaning) — but on `vibe_vmu_meeting` `target` is a VOTE\'s object, so do not carry the habit between faces; a subject/target on a type that debates nothing is refused by name. ★ `sequence` CONVENES SEVERAL MEETINGS IN ONE CALL: an array of descriptors for the meetings that FOLLOW this one (e.g. [{ type: "academic", agenda: "..." }, { type: "planning", agenda: "..." }]); the kernel validates each descriptor and refuses a bad one by name (naming the key it did not recognise), and the receipt reads the declared run back (`sequence.index/total/next`). Omitting `at` convenes them all now; giving `at` schedules this one and the declared run follows it. ★ `durationMs` sets THIS meeting\'s own upper bound (integer ms, 30 minutes .. 2 hours; outside the range it is refused by name, and there is no unbounded choice) — omit it and `vmu.meetings.hardLimitMs` applies; the receipt reads back `wallLimitMs` and `wallLimitMsSource` ("convene" vs "vmu.meetings.hardLimitMs").',
    // ROUND 200: `agenda`/`member` are NOT globally required: the CONVENE path needs them (and refuses by
    // name without them — see validateMeetingArgs), while the READ paths (status/summary/rulings) need only
    // action+id. A schema that marks them required promised a refusal the read path never gives.
    parameters: { agenda: { type: 'string' }, id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, subject: { type: 'string' }, kind: { type: 'string' }, target: { type: 'string' }, formal_agenda: { type: 'boolean' }, secretary: { type: 'string' }, member: { type: 'string' }, at: { type: 'string' }, durationMs: { type: 'integer' }, subject_evidence: { type: 'object' }, lean_job: { type: 'string' }, sequence: { type: 'array' }, action: { type: 'string' }, proposition_id: { type: 'string' } },
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
      + 'A type with no declared narrowing is a NAMED decision (default face), never a silent empty set; when the intersection with the identity face of that member is EMPTY the narrowing is SKIPPED (no override is installed, so nothing is widened) and the round receipt carries `narrowing:{applied:false, reason:"empty-intersect", expectedAllowed, identityFaceVisible}` — a broken configuration must not kill the meeting. '
      + 'Defaults: members = every live member except the chair; phase = "meeting". '
      + '★ phase must be one the turn engine knows: founding / normal / checkpoint / verify / verify-debate / meeting / resume / heartbeat / paper-write / paper-review / paper-final — any other word is refused by name (and this face then returns ok:false carrying that step code, it does not claim the round happened).',
    parameters: { meeting: { type: 'string', required: true }, members: { type: 'array' }, phase: { type: 'string', enum: ['founding', 'normal', 'checkpoint', 'verify', 'verify-debate', 'meeting', 'resume', 'heartbeat', 'paper-write', 'paper-review', 'paper-final'] }, why: { type: 'string' } },
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
    description: '★ TWO FACES, picked by what you pass (the caller\'s context decides — neither is a default). ① BALLOT VERDICT: pass target = the id of the LIVE ballot + verdict in [0,1] (1 = true, 0 = false, in between = an UNCERTAIN probability) to cast your vote on the object under verification; a target that is not a live ballot is refused by name. ② YOUR FINAL DEBATE RULING: pass meeting + proposition_id (and NO target) + verdict + reason to FILE YOUR OWN ruling on that debate\'s proposition — this is the member half of 「请各个辩论的各个成员给出最终裁决」, and it used to have no channel at all (run 31: a debating member could only reach the ballot face and got "no LIVE ballot", so the chair had to type everyone\'s number). A filed ruling is a card of your own on disk, survives your session, and the chair ADOPTS it with vibe_v5_verdict_final { meeting, proposition_id } — re-filing the same ruling is idempotent, filing a DIFFERENT one after it is refused by name (a filed ruling is your act, not a draft). A member who did not debate is refused by name; when the debate cannot be read from inside your session the receipt says `rosterChecked:false` and the chair checks it at collection.',
    parameters: {
      target: { type: 'string' }, verdict: { type: 'number', required: true }, reason: { type: 'string' },
      meeting: { type: 'string' }, proposition_id: { type: 'string' }, member: { type: 'string', required: true },
    },
    handler: toolVerdict,
  },
  {
    name: 'vibe_v5_verdict_final',
    description: '★ TALLY THE DEBATE\'S FINAL RULING (the CHAIR signs it): collect the members\' boolean verdicts on ONE proposition, aggregate them (all agree ⇒ that value, otherwise the arithmetic mean) and tell the proposition card\'s owner to correct its probability. meeting + proposition_id REQUIRED. ★ THE MEMBERS\' OWN RULINGS ARE COLLECTED FOR YOU: omit `verdicts` and this face adopts every ruling the debating members filed with vibe_v5_verdict { meeting, proposition_id, verdict, reason } — each row of `attribution` says whose number came from a filed submission (with the card id/path) and whose was TYPED by the chair, and `coverage` separates `debated` / `submitted` / `typed` / `missing` (named). Run 31 measured the defect this replaces: with `verdicts` REQUIRED the chair had to type everyone\'s number, and `coverage.complete:true` counted the roster, not a submission. If you do pass verdicts = [{member,p,reason}] (p∈[0,1]) a typed number that CONTRADICTS that member\'s filed ruling is refused by name, not silently preferred. member is who signs (default: the meeting chair; anyone else is refused by name). owner defaults to the card\'s author and is REQUIRED to be resolvable, because a ruling nobody is told changes nothing. ★ If a Lean run passed and the card\'s p is still not 1, you must ANSWER THE FIDELITY QUESTION first (fidelity:"conform" or "defect", with lean_job naming the run). The kernel face keeps the arithmetic/validation and refuses by name (duplicate member, p out of range, mixed propositions). Delivery is reported honestly: `delivery` + `notified` (which mailboxes hold a copy) + `notification.state` ("delivered" = pushed into a live turn, "queued" = waiting in the inbox and NOT read) — do not read an empty `notified` as a failure nor a queued one as "the owner has seen it".',
    parameters: { meeting: { type: 'string', required: true }, proposition_id: { type: 'string', required: true }, verdicts: { type: 'array' }, member: { type: 'string' }, owner: { type: 'string' }, lean_job: { type: 'string' }, lean_passed: { type: 'boolean' }, fidelity: { type: 'string' }, template: { type: 'string' }, partial: { type: 'boolean' }, why: { type: 'string' } },
    handler: toolVerdictFinal,
  },
  {
    name: 'vibe_v5_verdict_ask',
    description: '★ ASK THE DEBATING MEMBERS FOR THEIR FINAL RULING (the CHAIR asks; this is the FIRST half of the rule: 「待辩论会议结束，v5r框架请各个辩论的各个成员给出最终裁决」). One mailbox message per DEBATING member asking for 「布尔概率（[0,1]）+ 理由」 on ONE proposition. ★ WHO COUNTS AS DEBATING IS THE MEETING\'S ROSTER PLUS ANYONE ON SPEECH RECORD — the receipt names which set was used in `askedSource` ("roster+speech" | "roster" | "spokeBy" | "minutes" | "members") and `askedWhy` says why: a member seated for the debate who never spoke still owes a ruling (reading `spokeBy` alone made a live run ask NOBODY and the ruling face then reported a 0-member debate), while a meeting with no roster must still reach the people who did speak. meeting + proposition_id REQUIRED; `members` is an explicit OVERRIDE of that set (it REPLACES the population and the receipt says so in `askedSource:"members"` — it is not a widening). ★ THE SEAT COUNT RECONCILES OR IT IS NOT A COUNT (live run 29): `rosterCount` includes the chair seat, which is NOT in `asked`, so the receipt also carries `excluded:[{member, why}]` (why "presides"), `rosterCountMeans` and `accounting` — asked + excluded = the members the meeting named, so a reader sees WHO was skipped and WHY instead of doing the arithmetic alone. ★ THE PROPOSITION IS CHECKED, NOT MERELY REQUIRED: `proposition_id` must be a card the library holds (`propositionKind:"card"`), a FILE REFERENCE (`propositionKind:"file-ref"` with `fileChecked:false`: v5r allows the debate object to be a file, and this face does not read files), or the object this meeting was convened to debate (`propositionKind:"meeting-subject"`). Anything else is REFUSED as `VMU_ASK_UNKNOWN_PROPOSITION`, whose hint names the card to record and the file-reference shape; when nothing is declared this face cannot tell a legal one-line proposition from a typo and says so in `propositionKind:"unverified"` + `propositionWhy`. ★ THE MAIL IS GENERATED FROM THE MEETING STATE, NOT ASSERTED: `meetingState`/`meetingStateMeans`/`closurePhase` carry what `meetingView` reports and the closure clause inside `mail.text` is derived from it (live run 29 told the members the debate had ended while the view said state:"open"), and an unreadable state makes the mail say 状态不可读 instead of asserting a closure. It does NOT aggregate and does NOT touch the card — asking is not ruling; the ruling is vibe_v5_verdict_final, which REFUSES by name when a member who debated has no verdict (pass partial:true + why to rule on a partial set deliberately). Refused by name: no chair to sign, a non-chair caller, no mailbox face, a proposition that names nothing this debate is about (`VMU_ASK_UNKNOWN_PROPOSITION`), and a meeting with no roster AND no speech on record (nothing to rule on yet).',
    parameters: { meeting: { type: 'string', required: true }, proposition_id: { type: 'string', required: true }, members: { type: 'array' }, member: { type: 'string' }, why: { type: 'string' } },
    handler: toolVerdictAsk,
  },
  {
    name: 'vibe_v5_verified_promote',
    description: '★ PROMOTE A PROPOSITION CARD TO THE VERIFIED TRACK — the ONLY writer of that track, and the place where a settled p is carried together with its JUDGE. card REQUIRED (a propositions/proposition card whose p is exactly 1 — this track carries what is PROVEN TRUE; a p=0 refutation is refused by name and belongs to the rejected track); warrant_kind REQUIRED, and it must be the kind the EVIDENCE actually shows: "debate-unanimous" + `debate_ruling:{mode:"unanimous",value:1,subject:<card id>}` (+ `warrant:"<ruling id>"`), "lean-conformance" + `lean_job` (+ `lean_conformance:"conform"`), or "literature" + `literature_ref:"<author, source, theorem/page>"` (the citation then becomes the row\'s warrant id). Passing a warrant with NO evidence is refused by name by the SAME p=1 gate a card write uses (`VMU_PACK_V5R_P1_NEEDS_DEBATE`), and a kind that disagrees with the evidence is refused by name too. Other refusals: a card that is not a proposition card, a truncated card, a p in (0,1) ("a preference is not a conclusion"), a withdrawn proof. The card keeps its own p; the verified row records the warrant, so "why is this settled" is answerable instead of asserted.',
    parameters: { card: { type: 'string', required: true }, warrant: { type: 'string' }, warrant_kind: { type: 'string', required: true }, literature_ref: { type: 'string' }, debate_ruling: { type: 'object' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, member: { type: 'string' } },
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
    // ★ LIVE RUN 58 (a member filed this as feedback after burning a call): the schema said `statement` was optional
    // and the description never mentioned it, while the face refuses a submit without it
    // (`VMU_LEAN_STATEMENT_REQUIRED`). Taught and done now say the same thing. The path rule is stated too, because
    // the teaching text used to promise a short form the face resolves against a different base.
    description: 'Compile one existing .lean file through the kernel\'s Lean face (the face owns the process, timeout and cancel path). ★ `statement` is REQUIRED: it is the proposition this file is supposed to formalise, and it is what the receipt and the audit are about (a submit without it is refused by name). ★ `file` is resolved against the LIBRARY ROOT (the `VibeMath/` directory), so a short path works only when it lives under that root — anywhere else pass an absolute path, and a file the face cannot read comes back with the absolute path it actually tried. Assembly without a host spawn seam ⇒ NAMED refusal; a per-call timeout_ms is reported as unapplied.',
    parameters: { file: { type: 'string', required: true }, target: { type: 'string', description: 'legacy alias for statement - a card id is NOT the proposition, so passing only this is refused by name' }, statement: { type: 'string', required: true, description: 'the proposition text this file is supposed to formalise (the audit records this, not an object id)' }, timeout_ms: { type: 'integer' }, member: { type: 'string' } },
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
    description: 'List the Lean archive/library (def/lemma/theorem/assumption entries) through the Lean face. ★ Every entry now carries its COMPILE RESULT: `outcome` (ok/failed/timeout/interrupted/not-measured), `exitCode`, `diagnosticsTail` (last characters of that job\'s diagnostics), `jobId`, `compileAt` (when the job ended), `at` (when it was archived) and `outcomeMeans` — so "archived" never has to be read as "compiled".',
    parameters: { refresh: { type: 'boolean' } },
    handler: toolLeanLib,
  },
  {
    name: 'vibe_v5_lean_read',
    description: 'Read one archived Lean entry VERBATIM by name (kind auto/lib/proved is reported as not applied: this kernel keeps one archive namespace). The receipt also carries that entry\'s compile result (`outcome`/`exitCode`/`diagnosticsTail`/`jobId`/`compileAt`/`outcomeMeans`), so the text and "did it compile" are read together.',
    parameters: { name: { type: 'string', required: true }, kind: { type: 'string' } },
    handler: toolLeanRead,
  },
  {
    name: 'vibe_v5_lean_archive',
    description: 'Archive an existing .lean file: kind def/lemma/proof/blocked maps to the face\'s def/lemma/theorem/assumption; the face registers existing files by hash (inline content is not stored). ★ pass `statement` (the proposition this file formalises) so the library can answer what the file proves - live run 59 archived a lemma and the entry came back with an empty statement because the argument did not exist. ★ The entry ALSO records the COMPILE RESULT of that file: it is read from a Lean job this kernel already ran on the same file (nothing is re-run) and comes back as `outcome`/`exitCode`/`diagnosticsTail`/`jobId`/`compileAt`/`outcomeMeans`; with no such job the entry says `outcome:"not-measured"` instead of pretending the proof compiled.',
    parameters: { kind: { type: 'string', required: true, enum: ['def', 'lemma', 'proof', 'blocked'], description: 'the kind of thing the file holds; the library maps these onto its own face kinds (proof -> theorem) and has no fifth word' }, name: { type: 'string', required: true }, statement: { type: 'string', description: 'the proposition text this file formalises (recorded in the library entry)' }, target: { type: 'string', description: 'legacy alias for statement' }, content: { type: 'string' }, from: { type: 'string' }, file: { type: 'string' }, note: { type: 'string' }, run: { type: 'boolean' } },
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
