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
import { p1Intent, debateSubjectGate, singleWriter, fidelityAsked, classifySubject, PROOF_STATE_COMPLETE } from './verification-gates.js'
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
import { MEETING_TYPE_ALIASES, MEETING_TYPE_IDS, meetingTypeOf, meetingTypePairs, procedureFor } from './meeting-procedures.js'
// ★ RUN 51 residue #4 (design: docs/acceptance/conformance/member-scope-design.md): WHICH FACE a seat may call is
// INstitution vocabulary, so the table lives in this pack and the derived lists come from it — one source, two
// readers (the narrowing below and the gate in tests/audit-member-scope.test.mjs).
import { applyMemberScope, MEMBER_SCOPE_NOTE } from './member-scope.js'
// ★ ROUND 92 / F-92a: the seat table is the DECLARED authority for "which seat may call which face".
// A card attributed to a seat must be a card that seat is allowed to write, so the card faces consult
// the same table the member face gate is derived from — not the caller's identity (the office is not
// subject to a seat, so before this a card could be attributed to a temp worker by the office).
import { seatDecision as seatDecisionOf } from './seat-faces.js'
// ★ RUN 251 (F71-7): the DECLARED seat faces are the ONE authority for "what may this seat call", and `tool_help` now
// prints their counts with no live session — so it reads that table itself instead of re-typing a second list.
import { seatAllowNames, seatDenyNames } from './seat-faces.js'
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
import { BLUEPRINT_MD_PATH_KEY, BLUEPRINT_ADOPT_SLOT, BLUEPRINT_OUTLINE_REQUIRE_KEY, BLUEPRINT_PATH_KEY, BLUEPRINT_STALE_KEY, BLUEPRINT_TRACK, adoptBlueprint, blueprintMdProvenanceOf, blueprintState, listBlueprints, mdOwnerOf, outlineRequireOf, proposeBlueprint, readBlueprint, staleWindowOf } from './blueprint.js'
// ★ A7 (round 31 follow-up): WHO IS CALLING, read from the one non-forgeable source there is. `vibe_v5_fire` has to
// know whether the caller is a member seat (whose dismissal right is scoped to its own temp worker) or the office /
// a chair (unscoped), and the ONLY trustworthy answer is the agent→member resolution the seat face gate itself uses:
// `host-pack-tools.js#resolveTurnMember` (turn-tool record → learned member session → exact roster id; `null` is a
// REAL answer meaning root/office). `args.member` is NOT read for this: it is model-typed text, which is exactly the
// run-29 lesson member-scope.js records for `verdict_ask`. `host-pack-tools.js` imports nothing, so this edge adds no
// cycle (it cannot import this file back).
import { resolveTurnMember } from '../../host-pack-tools.js'
import { ENV_NEEDS_DEFAULTS } from '../../settings/env-needs.js'
// ★★★ RUN 258 / AUDIT-14 (P1-8): a hint may name an environment need - and `latex` is NOT one (the registry knows
// xelatex / latexmk / pdflatex / lualatex / tectonic). Deriving the sentence FROM the table is the point: a renamed row
// cannot leave the prose teaching a string the env face refuses as VMU_ENV_UNKNOWN_NEED.
const ENGINE_NEEDS = Object.keys(ENV_NEEDS_DEFAULTS).filter((k) => /latex|tectonic/.test(String((ENV_NEEDS_DEFAULTS[k].probe || {}).command || '')))
const ENGINE_NEED = ENGINE_NEEDS.indexOf('xelatex') >= 0 ? 'xelatex' : (ENGINE_NEEDS[0] || 'xelatex')
// ★ PHASE 8 / B-2 step 2: the kit owns the implementations; v5r keeps only INSTITUTION vocabulary (names, descriptions,
// parameters) and its policy. The 8 generic helpers come from the kit so the tree has exactly ONE copy.
const { str, has, refuse, refusalReceipt, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker } = KIT_HELPERS
// ★★★ TB-2694 / F75-17 (MEASURED on the 75th real-machine run): `VMU_NO_SUCH_OBJECT` said "the roster holds the live ids" —
// no tool name, no parameter name, no REACHABLE INSTEAD — so "copy the hint" was not an action a reader could take. One sentence
// now, used by every roster-id refusal in this pack AND by kit/handlers.js#requireSpeaker: WHO reads it (the chair seat),
// HOW to list it (vibe_v5_overview), HOW to pick a usable id (roster[].state === "live"), and what to do with it (inbox + retry).
const ROSTER_ID_REACHABLE_HINT = 'REACHABLE INSTEAD: 先 vibe_v5_overview {member:"<你的 id>"}（主席席读名册：回执 roster[] 带 id/slot/state，挑 state:"live" 的那个），再 vibe_v5_inbox {action:"list", member:"<roster id>"} 确认这个名字收得到消息，然后用这个 id 重试本调用'
// ★★★ TB-2694 / F75-17 (Lead-approved follow-up scope): two faces address the member through a parameter named `to`,
// not `member`/`id`. A sentence that teaches the WRONG parameter is still not copyable, so those two sites name their
// own parameter — HOW to find a live id is the same four steps, only the retry parameter differs.
const ROSTER_TO_REACHABLE_HINT = (tool) => 'REACHABLE INSTEAD: 本面要的形参是 `to` — 先 vibe_v5_overview {member:"<你的 id>"}（主席席读名册：回执 roster[] 带 id/slot/state，挑 state:"live" 的那个），再 vibe_v5_inbox {action:"list", member:"<roster id>"} 确认这个名字收得到消息，然后用 to:"<roster id>" 重试 vibe_v5_' + tool
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
    // ★ TB-2691 / F75-13 — PASS THE SAME BLOCK THROUGH. The mailbox face answers "how many rows are still
    // owed an ack" from exactly one producer (`noticeBlockOf` in kernel/mailbox.js, returned as
    // `status().notice` AND `list().notice`). In run 75 the office had to hop to `vibe_vmu_mailbox status`
    // to read that number because THIS face dropped it — the fix forwards the block untouched: no second
    // sum, no perBox copy here (a second ruler is always a second answer).
    const notice = r && r.notice ? r.notice : null
    return { ok: true, tool: 'vibe_v5_inbox', action: 'list', member, status, count: rows.length, rows: rows.map((row) => inboxRow(row, urgency)), notice,
      note: 'rows carry NO body: triage by sender/time/subject/urgent/read/todo, then open ONE message; urgent:null means the face could not tell (not "not urgent"). notice is the mailbox face own ack reading (unackedRowsAllBoxes / perBox / asOf / asOfSource), forwarded untouched' }
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
        'pass to:"<a new member id>" — moving an existing member between seats is a different act: vibe_vmu_control { action: "hire", member_id, slot } (this face refuses instead of silently re-seating). `institution` is NEVER written on this face — it is accepted only to be IGNORED (a hire joins the institute that already exists; founding one is the control face, the only call that reads `institution`), so a second hire cannot change it either; a caller that sends no `institution` gets institutionIgnored:false, not true')
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
    // ★★★ TB-2750 / RUN 80 (F80-1): `create` with an owner is an ASSIGNMENT that did not pass through `assign`, so the
    // brief gate cannot refuse it here (the id must exist before a brief can be written). The hire purpose is the hiring
    // caller's own written statement of what the new member is for, so it becomes the brief IMMEDIATELY — otherwise the
    // fresh seat would wake to an assignment with nothing to read. This stores the caller's words; it does not invent work
    // text.
    if (task && typeof task.id === 'string' && typeof kernel.tasks.brief === 'function') {
      await kernel.tasks.brief(task.id, str(args.purpose), { by: hiredBy })
      // ★★★ TB-2750 follow-up (MEASURED by a probe after the fix above): `brief` bumps the row revision, so the CREATE
      // row this receipt would otherwise hand back is ALREADY STALE — revision 1 beside a board at revision 2, and no
      // `hasBrief`/`readable`. A caller that took that revision into a compare-and-set write was refused VMU_TASK_STALE_REVISION.
      // The receipt must describe the row as it stands AFTER the brief: read it back and return THAT row.
      const listed = await kernel.tasks.list()
      const rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.tasks) ? listed.tasks : [])
      const freshRow = rows.filter((r) => r && r.id === task.id)[0] || null
      // ★★★ TB-2750 follow-up (R5-b, MEASURED by a probe): the create row says `assignmentUnreadable:true` (an owner
      // existed before the brief); the row AFTER the brief does not. The board row carries no such key, so merging only
      // it left the create-time field in place — the same receipt then said "assigned but nothing to read" AND
      // `readable:true/ready:true`: TWO READINGS, ONE RECEIPT. The brief was written IN THIS CALL (awaited above), so the
      // post-brief truth overwrites both fields (null = named absence, never a stale sentence).
      if (freshRow) task = Object.assign({}, task, freshRow, { assignmentUnreadable: false, assignmentMeans: null })
    }
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
    // ★★ RUN 206 (run 44 / FEEDBACK43 1.9, MEASURED): the CONTROL face requires `institution` when it FOUNDS an
    // institute, so a caller who read that face sent it here too and this face refused the parameter — two hire verbs
    // with two vocabularies. `institution` is now ACCEPTED and DISCLOSED as not used: a temp hire joins the institute
    // that already exists, and refusing a field the other face requires sends the caller to fix the wrong call.
    institution: has(args.institution) ? str(args.institution) : null,
    institutionIgnored: has(args.institution),
    institutionMeans: has(args.institution)
      ? 'this face hires INTO the institute that already exists, so `institution` was accepted and NOT used: founding an institute is the control face (it is the call that requires institution)'
      : null,
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
 * ★★★ RUN 255 / TB-2613: the office-side aggregate of md OWNERSHIP — how many of the institute's blueprint md files were
 * written by the seat itself, how many exist, and the ratio between them. ONE computation, from the same `mdOwnerOf` the
 * per-row receipts use, over the blueprint rows that name a file; the ratio is null (never 0) when nothing names a file,
 * because "no file yet" is not "nobody owns anything". READ-ONLY: it walks the rows and the disk, it writes no mark.
 */
function mdOwnedBySeatsOf(kernel) {
  const records = recordsOf(kernel)
  const meansTail = 'counted over the BLUEPRINT rows that name their own md file (the rows `vibe_v5_blueprint` lists), one entry per file, deduplicated by path'
  if (records === null) {
    return { memberFiles: 0, total: 0, ratio: null, means: 'this kernel exposes no records face, so md ownership cannot be counted: ' + meansTail }
  }
  let rows = []
  try {
    // ★★★ RUN 255: `listBlueprints` refuses without a `path` (a blueprint read is about ONE path), so an institute-wide
    // aggregate cannot use it. The rows are listed directly and each body is read through the SAME `cardMdOwnerOf`
    // reader the card face uses — one provenance reader, two faces, never a second parse.
    const listed = records.list({ track: BLUEPRINT_TRACK, limit: 0 })
    const items = listed && Array.isArray(listed.items) ? listed.items : []
    for (const item of items) {
      if (!item || item.id === undefined || item.id === null) continue
      const got = records.get({ id: item.id })
      const body = got && got.record ? got.record.body : (got ? got.body : null)
      if (typeof body === 'string' && body.trim() !== '') rows.push({ id: item.id, body })
    }
  } catch (e) {
    return { memberFiles: 0, total: 0, ratio: null, means: 'the blueprint rows could not be listed (' + String((e && e.message) || e) + '), so this aggregate reports no numbers rather than a false zero: ' + meansTail }
  }
  const owners = []
  for (const row of rows) {
    const owner = cardMdOwnerOf(records, row.body)
    if (owner !== null && owners.every((o) => o.path !== owner.path)) owners.push(owner)
  }
  const memberFiles = owners.filter((o) => o.writtenBy === 'member-file').length
  const total = owners.length
  return {
    memberFiles,
    total,
    ratio: total === 0 ? null : memberFiles / total,
    means: 'memberFiles = the md files whose row records writtenBy:"member-file" (the seat wrote its own file); total = the distinct files the blueprint rows name; ratio = memberFiles/total, null when total is 0 (no md has been named yet — that is absence, not a zero ratio). Written by the seat, kernel-materialized and fs-untracked are all counted as files, only the first counts as owned. ' + meansTail,
  }
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
    // ★★★ RUN 255 / TB-2613: the office-side aggregate of md OWNERSHIP (seats writing their own md files), computed once
    // from the same `mdOwnerOf` the per-row receipts use. `ratio:null` when no md has been named yet — absence is not 0%.
    mdOwnedBySeats: mdOwnedBySeatsOf(kernel),
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
/**
 * ★★★ RUN 251 (F71-8, MEASURED on the 71st real-machine run): ONE FACT — "no live session" — was told TWO ways
 * (`VMU_MEMBER_SESSION_NOT_LIVE` when a child had existed and finished, `VMU_NO_SUCH_OBJECT` when none had ever been
 * opened), and neither hint named a reachable repair, so a member reading the receipt could not tell "reopen me" from
 * "I was never opened". The KERNEL owns the CAUSE (`view.cause` / `view.childId` / `view.refusal`) and is not edited
 * here; this function TRANSLATES that cause into the two named answers, each carrying the ONE action that fixes it.
 * Exported so the translation is pinned as a pure function (the pack face and the test read the same code).
 */
export function sessionRefusalOf({ view = null, member = '' } = {}) {
  // ★★★ RUN 254 (F-73-02): LIVE means "this reading HAS a visible set" — not "the view carries liveAgent:true". The kernel
  // degraded receipt sets `liveAgent:false`; the LIVE receipt carries the tools array and no `liveAgent` field at all, so
  // keying liveness on the flag alone told a live session it had NEVER opened one. The tools array is the fact; the flag
  // only ever denies.
  const live = view !== null && view !== undefined && Array.isArray(view.tools)
    && !(view.refusal !== undefined && view.refusal !== null)
    && view.liveAgent !== false
  if (live) return null
  const providerRefusal = view && view.refusal ? view.refusal : null
  const cause = view && view.cause ? String(view.cause) : ''
  const childId = view && view.childId !== undefined && view.childId !== null ? String(view.childId) : null
  const ended = cause === 'child-session-not-live'
    || (providerRefusal !== null && String(providerRefusal.code || '') === 'VMU_MEMBER_SESSION_NOT_LIVE')
  const who = String(member === null || member === undefined ? '' : member)
  return ended
    ? {
      code: 'VMU_MEMBER_SESSION_NOT_LIVE',
      cause: cause === '' ? null : cause,
      childId,
      message: 'member "' + who + '" HAD a child session' + (childId !== null ? ' (' + childId + ')' : '') + ', and it is no longer live — the visible tool set cannot be read from a finished session',
      hint: 'the session EXISTED and ENDED, so it can be reopened: drive the member again with vibe_vmu_turn {op:"drive", member:"' + who + '"} (or seat it again through vibe_vmu_control), then call tool_help again; the DECLARED set in `declarationSet` is readable right now and needs no session',
      means: 'this code means "there WAS a wire and it has since closed" — distinct from VMU_MEMBER_SESSION_NEVER_OPENED ("there was never a wire"), because only the first has a session to reopen (RUN 251 / F71-8)',
    }
    : {
      code: 'VMU_MEMBER_SESSION_NEVER_OPENED',
      cause: cause === '' ? null : cause,
      childId: null,
      message: 'member "' + who + '" has NEVER opened a session, so there is no wire to read a visible tool set from — nothing has failed that a session could have shown',
      hint: 'a session has to exist first — TWO steps, and both acts are on faces this receipt names: (1) read a REAL id with vibe_vmu_control {action:"roster"} (its `roster[]` carries id/slot/state); (2) seat that id with vibe_vmu_control {action:"hire", slot:"chair"|"member", member_id:"<roster id>", institution:"<this deployment name>"} — member_id, slot and institution are EACH required, the face invents none of them. Then give the member work (vibe_v5_assign or vibe_vmu_turn {op:"drive", member:"' + who + '"} so a child session opens) and call tool_help again; until then `declarationSet` is the honest reading of what it may call. REACHABLE INSTEAD: 两步都落在本回执点到的面上——① 读真 id：vibe_vmu_control {action:"roster"}，回执 roster[i].id 就是真实成员 id（别自己编）；② 入席：vibe_vmu_control {action:"hire", slot:"member", member_id:"<roster 里那个 id>", institution:"<本部署的机构名>"}（member_id / slot / institution 三个都必填，机构是部署的决定，内核没有缺省）；随后 vibe_v5_assign 或 vibe_vmu_turn {op:"drive", member:"<同一 id>"} 派活开子会话，再调 vibe_v5_tool_help {member:"<id>"}；没有会话时 declarationSet 本身就是可读的声明集',
      means: 'this code means "there has NEVER been a wire" — distinct from VMU_MEMBER_SESSION_NOT_LIVE ("the wire existed and closed"): there is no session to reopen, only one to open (RUN 251 / F71-8)',
    }
}

/**
 * ★★★ RUN 252 (F72-8, MEASURED on the 72nd real-machine run): `read-back-default-draft` had ZERO receipts in the whole
 * run, and the reason is not that no card was a default draft — it is that this reason lived ONLY in the settlement
 * read-back branch, while the settlements that reach it are refused before the read-back (p=1 needs a ballot; p=0 would
 * be a manufactured refutation, which the institute refuses to file). So the one question a reader actually asks —
 * "is this STORED card locked, and why" — could only be answered by performing a settlement the reader could not
 * perform. The gate for a stored row therefore has ONE implementation here: the settlement read-back below and the read
 * face (`vibe_v5_read_library`) both call it, so a plain READ answers the question and no write is needed.
 */
/**
 * ★★★ RUN 254 (F-73-01, MEASURED on the 73rd real-machine run): the task asked "is this card a draft" and the receipt
 * answered `proofState:null` — honest (nothing was DECLARED) but not literally answerable. The two facts are now printed
 * under two names: `proofState` stays the DECLARED value (null when nothing was declared — never back-filled with a
 * default, which would report a declaration that never happened), while `proofStateFolded` is the EFFECTIVE state the
 * rules fold the card into when no declaration exists. This one function is that fold, and both `proofGateOfStoredCard`
 * and the card-write receipt read it, so two receipts cannot fold the same row differently.
 */
export function foldedProofStateOf(rawState) {
  const raw = rawState === undefined || rawState === null ? '' : str(rawState).trim()
  return raw === '' ? 'draft' : raw.toLowerCase()
}

/**
 * ★★★ RUN 2699 (F75-04, MEASURED on the 75th real-machine run): the pointer-state word `proofRefState` had TWO producers
 * with DIFFERENT value ranges — the card-write receipt answered `resolved|missing|absent` from what the write itself had
 * resolved, the stored-row read face answered `absent|missing|unknown` without resolving anything. One row therefore had
 * two answers (a complete+locked card read `resolved` on the write receipt and `unknown` on the read face), and the write
 * face could say `resolved` when NOTHING had been measured (no resolver, an absolute path, or a pointer naming a directory).
 * There is now ONE producer below: `proofRefReadingOf` MEASURES a pointer (exactly once per face), `proofRefStateOf` JUDGES
 * the reading into the four words, and every exit (write receipt, stored-row read face, settlement read-back) calls them.
 * `unknown` is narrowed to mean exactly ONE thing: NOT CHECKED. A checked failure is `missing`.
 */
export function proofRefReadingOf(kernel, pointer) {
  const raw = pointer === undefined || pointer === null ? '' : str(pointer).trim()
  if (raw === '') {
    return { checked: false, resolved: null, pointer: '', wellFormed: false, relativePath: null, bytes: null,
      reason: 'no-pointer',
      means: 'this call/row declares NO `proof_ref`, so there is no pointer to resolve — nothing was checked and nothing failed' }
  }
  const lib = kernel && kernel.library ? kernel.library : null
  if (!lib || typeof lib.resolvePointer !== 'function') {
    return { checked: false, resolved: null, pointer: raw, wellFormed: false, relativePath: null, bytes: null,
      reason: 'no-resolver',
      means: 'this kernel exposes no `library.resolvePointer`, so THIS face cannot resolve the pointer — the value is NOT CHECKED, not "checked and failed" (a checked failure is `missing`)' }
  }
  let out = null
  try { out = lib.resolvePointer(raw) } catch (e) { out = null }
  if (out === null || typeof out !== 'object') {
    return { checked: false, resolved: null, pointer: raw, wellFormed: false, relativePath: null, bytes: null,
      reason: 'resolver-failed',
      means: 'the library resolver threw or returned no object, so the pointer was NOT checked — a checked failure would be `missing`' }
  }
  const resolved = out.resolved === true
  return {
    checked: true,
    resolved,
    pointer: raw,
    wellFormed: out.wellFormed === true || out.ok === true,
    relativePath: out.relativePath === undefined ? null : out.relativePath,
    bytes: out.bytes === undefined ? null : out.bytes,
    reason: resolved ? 'file' : String(out.reason || 'unresolved'),
    libraryMeans: String(out.means || ''),
  }
}

export function proofRefStateOf({ pointer = '', reading = null, source = 'stored-row-read' } = {}) {
  const word = pointer === undefined || pointer === null ? '' : str(pointer).trim()
  const sourceOut = source === undefined || source === null || String(source).trim() === '' ? 'stored-row-read' : String(source)
  if (word === '') {
    return { proofRefState: 'absent', proofRefStateChecked: false, proofRefStateSource: sourceOut,
      proofRefStateMeans: '没有 `proof_ref` 可解析：这次调用（或这一行）没有申报指针，所以没有量可做，也没有失败。若本意是锁定这张卡，下一步是重新登记一张新卡：`vibe_v5_record_proposition {statement, value, motive, p, proof_ref:"Members/<成员>/Propos/<id>.md#正式证明", proof_state:"complete"}` —— 本行的指针不可改（records 每写一次新开一行）' }
  }
  if (reading === null || reading === undefined || reading.checked !== true) {
    const why = reading === null || reading === undefined ? 'no-reading' : String(reading.reason || 'unchecked')
    return { proofRefState: 'unknown', proofRefStateChecked: false, proofRefStateSource: sourceOut,
      proofRefStateMeans: '未检查（NOT CHECKED）：' + why + ' —— 这个值表示「本面根本没有解析指针」，不是「查了但解析不了」（那是 `missing`）。下一步：用 `vibe_v5_read_library {card:"<id>"}` 读回这张卡（当前部署有库解析器时会给出 `resolved` 或 `missing`）；若读回仍是 `unknown`，说明这个内核没有 `library.resolvePointer`，换有解析器的部署再读写' }
  }
  if (reading.resolved === true) {
    const bytesText = reading.bytes === null || reading.bytes === undefined ? '大小未知' : String(reading.bytes) + ' 字节'
    return { proofRefState: 'resolved', proofRefStateChecked: true, proofRefStateSource: sourceOut,
      proofRefStateMeans: '已检查：`proof_ref` 在库根内解析到真实文件（' + String(reading.relativePath || word) + '，' + bytesText + '）。这是 ' + sourceOut + ' 的读数；这张卡是否被规则 L14 锁定，读 `proofGate.locked`，不要读 `ok`' }
  }
  const reason = String(reading.reason || 'unresolved')
  return { proofRefState: 'missing', proofRefStateChecked: true, proofRefStateSource: sourceOut,
    proofRefStateMeans: '已检查，解析不到（reason=' + reason + '）。下一步：把证明文件写进**库根下的相对路径**（不是会话工作目录），例如 `Members/<成员>/Propos/<id>.md`，然后**登记一张新卡**：`vibe_v5_record_proposition {statement, value, motive, p, proof_ref:"Members/<成员>/Propos/<id>.md#正式证明", proof_state:"complete"}` —— 本行的指针不可改（records 每写一次新开一行）' }
}

export function proofGateOfStoredCard(fields = {}, opts = {}) {
  const rawState = fields.proofState
  const state = rawState === undefined || rawState === null ? '' : str(rawState).trim().toLowerCase()
  // the EFFECTIVE state: a stored row that declares nothing folds to the DEFAULT draft; a declared state is reported as
  // declared (folded only by case/whitespace). The folded value is never substituted for `proofState`.
  const folded = foldedProofStateOf(rawState)
  const rawDeferred = fields.proofLockDeferred
  const deferredWord = rawDeferred === undefined || rawDeferred === null ? '' : str(rawDeferred).trim()
  // ★★★ RUN 2699 (F75-04): the pointer-state word comes from the ONE judge, fed by a reading this face takes itself (or one
  // the caller already took, e.g. the write face that just resolved the pointer). `locked`/`reason` keep their meanings.
  const pointerWord = fields.proofRef === undefined || fields.proofRef === null ? '' : str(fields.proofRef).trim()
  const readSource = opts.source === undefined || opts.source === null ? 'stored-row-read' : String(opts.source)
  const reading = opts.reading !== undefined ? opts.reading : proofRefReadingOf(opts.kernel || null, pointerWord)
  const pointerState = proofRefStateOf({ pointer: pointerWord, reading, source: readSource })
  const finish = (gate) => Object.assign(gate, {
    proofRefState: pointerState.proofRefState,
    proofRefStateChecked: pointerState.proofRefStateChecked,
    proofRefStateMeans: pointerState.proofRefStateMeans,
    proofRefStateSource: pointerState.proofRefStateSource,
  })
  if (state === '') {
    return finish({
      folded,
      locked: false, reason: 'read-back-default-draft',
      why: 'READ BACK from the stored row: it declares NO `proof_state` at all — a card without one is a DRAFT (the default) — so rule L14 (「登记即定稿」) does not lock it',
      nextMove: null,
      means: 'read proofGate.locked, not `ok`, to answer "is this card locked": the default is a DRAFT (nothing was declared), and this value was READ BACK from a stored row — reading it required no write and no settlement',
    })
  }
  if (deferredWord !== '') {
    return finish({
      folded,
      locked: false, reason: 'read-back-deferred',
      why: 'READ BACK from the stored row: it is declared complete but its lock is DEFERRED (' + deferredWord + ')',
      nextMove: 'the card is still writable: write the file the pointer names and REGISTER A NEW CARD - the records face mints a NEW row per write, so this row' + String.fromCharCode(39) + 's pointer cannot be edited',
      means: 'read proofGate.locked, not `ok`, to answer "is this card locked"; this value was READ BACK from a stored row',
    })
  }
  if (state !== PROOF_STATE_COMPLETE) {
    return finish({
      folded,
      locked: false, reason: 'read-back-not-complete',
      why: 'READ BACK from the stored row: it is declared "' + state + '", NOT a finished registration, so rule L14 does not lock it',
      nextMove: null,
      means: 'read proofGate.locked, not `ok`, to answer "is this card locked"; only a registration declared finished is locked',
    })
  }
  return finish({
    folded,
    locked: true, reason: 'read-back-complete',
    why: 'READ BACK from the stored row: it is declared finished and the lock is on',
    nextMove: null,
    means: 'read proofGate.locked, not `ok`, to answer "is this card locked"; this value was READ BACK from a stored row',
  })
}

/**
 * ★★★ RUN 252 (F72-2, MEASURED on the 72nd real-machine run): the DEFAULT card receipt carried `proofState:null` and
 * nothing else — no `proofStateMeans`, no `lockNote` — so a reader could not answer "is this card a draft / is it locked
 * / why" from the receipt alone without opening another face. This note follows the gate (the same fact, one sentence)
 * and is emitted on the card-write receipt AND on the read-back card, so both receipts answer in words.
 */
export function proofLockNoteOf({ gate = null, declaredState = '' } = {}) {
  if (gate === null || gate === undefined || typeof gate !== 'object') return null
  const reason = str(gate.reason)
  const state = declaredState === null || declaredState === undefined ? '' : str(declaredState)
  if (gate.locked === true) {
    return 'this card is LOCKED (rule L14 「登记即定稿」): its proof is registered as finished, so a later write to this card id is refused — file a NEW card id to change the proof'
  }
  if (reason === 'default-draft' || reason === 'read-back-default-draft') {
    return 'this card is NOT locked: it declares NO `proof_state` at all, so it is a DRAFT (the default), and rule L14 (「登记即定稿」) locks only a finished registration — the card stays writable'
      + ' (EFFECTIVE state: ' + String(gate.folded === undefined || gate.folded === null || gate.folded === '' ? 'draft' : gate.folded) + ' — folded from the default because nothing was declared, NOT a declared value)'
      + (reason === 'read-back-default-draft' ? ' (READ BACK from the stored row: answering this needed no write and no settlement)' : '')
  }
  if (reason === 'declared-draft') {
    return 'this card is NOT locked: it declares `proof_state:"draft"` — a draft is not a finished registration, so rule L14 does not lock it and the card stays writable (EFFECTIVE state: draft — declared by the caller)'
  }
  if (reason === 'declared-not-complete') {
    return 'this card is NOT locked: it declares `proof_state:"' + state + '"`, which is not a finished registration, so rule L14 does not lock it — the card stays writable'
  }
  if (reason === 'complete-but-pointer-unresolved' || reason === 'read-back-deferred') {
    return 'this card is NOT locked: its proof is declared finished but the lock is DEFERRED because its own `proof_ref` does not resolve inside the library — write that file (or point at a record id) and register a NEW card'
  }
  if (reason === 'read-back-not-complete') {
    return 'this card is NOT locked: it is stored as `proof_state:"' + state + '"`, not a finished registration, so rule L14 does not lock it'
  }
  return 'this card is NOT locked (gate reason: ' + reason + ')'
}

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
  // ★★★ RUN 251 (F71-7, MEASURED on the 71st real-machine run): outside a live session this face answered
  // `count:null / tools:null / source:"no-live-agent"`, so the three seats' DECLARED readings (48 / 27 / 8 on the run-71
  // build) could not be measured on a real machine at all — a reading that is only available when a session happens to be
  // live is not a reading of an institution. The DECLARATION SET is static: it comes from `SEAT_TOOL_FACES` in
  // `seat-faces.js` and needs no Agent, so it is now ALWAYS printed, next to a MEASURED SET that is honestly `null` until
  // a live Agent exists. The two are separate fields with their own `means`: one is a declaration, the other a measurement.
  const declaredToolNames = V5R_PACK_TOOLS.map((t) => (t && t.name) || null).filter((n) => typeof n === 'string')
  // ★ RUN 251: the roster may be absent in a harness that only forwards `toolsView` (several suites drive this face with a
  // minimal kernel). An absent roster means the SEAT is unknown — not that the declaration set does not exist — so the
  // lookup is guarded and the receipt says which of the two it is, instead of turning a reading into an exception.
  let seatRow = null
  try {
    seatRow = seatOf(kernel, str(args.member))
  } catch (e) {
    seatRow = null
  }
  const seatOfMember = seatRow === null ? '' : String(seatRow.slot || '')
  const declarationSet = (() => {
    if (seatOfMember === '') {
      return {
        seat: null,
        declaredCount: declaredToolNames.length,
        allowCount: null,
        denyCount: null,
        seatFilter: null,
        tools: null,
        means: 'the roster publishes no seat for "' + str(args.member) + '", so which DECLARED face belongs to this member cannot be computed: the pack-declared tool COUNT is printed (' + declaredToolNames.length + '), the per-seat split is null rather than a guess — seat the member first (vibe_vmu_control {action:"hire"}), then ask again',
      }
    }
    const allow = seatAllowNames(seatOfMember, declaredToolNames)
    const deny = seatDenyNames(seatOfMember, declaredToolNames)
    return {
      seat: seatOfMember,
      declaredCount: declaredToolNames.length,
      allowCount: allow.length,
      denyCount: deny.length,
      seatFilter: {
        seat: seatOfMember,
        present: allow,
        presentCount: allow.length,
        absent: deny,
        absentCount: deny.length,
        means: 'seatFilter.present is this seat\'s DECLARED face (the names `SEAT_TOOL_FACES[<tool>].allow[<seat>] === true` in packs/v5r/seat-faces.js); seatFilter.absent is `declared − allow`, COMPUTED from that same table — not a second hand-written list. Both lists are static and readable with no live session',
      },
      tools: allow,
      means: 'the DECLARATION set, not the live visible set: these are the pack-declared names this seat is ALLOWED to call by the seat-face table, and they do not depend on any session. `measuredSet` is what a live Agent actually exposes — read THAT for "what can I call right now", and this for "what does the institute say I may call"',
    }
  })()
  // ★★★ RUN 251 (F71-8): the translation from the kernel's cause to the two named refusals lives in ONE exported
  // pure function (`sessionRefusalOf`, above) so the face and the suite read the same code instead of two copies.
  // ★★★ RUN 254 (F-73-02): "measured" follows the SAME liveness fact the refusal translator uses: a view WITH a tools
  // array is a measured reading (the kernel's live branch carries no `liveAgent` flag and prints the tools), and a view
  // without one is degraded. Keying on `liveAgent === true` alone printed count:null beside a non-empty tools array.
  const liveView = view !== null && view !== undefined && Array.isArray(view.tools)
    && !(view.refusal !== undefined && view.refusal !== null)
    && view.liveAgent !== false
  const measuredCount = liveView ? view.tools.length : null
  const providerRefusalRaw = view && view.refusal ? view.refusal : null
  const sessionRefusal = sessionRefusalOf({ view, member: str(args.member) })
  // ★★★ RUN 252 (F72-1, MEASURED on the 72nd real-machine run): the DECLARED layer was already right, but the provider
  // refusal nested in this same receipt still said `VMU_NO_SUCH_OBJECT` for a member that had simply never opened a
  // session — the same fact under a second name, in the same object a reader compares field by field. The host provides
  // the cause (`no-child-session-yet`) and now also a `namedCode`; the provider-level payload is TRANSLATED here to the
  // named session answer, and the raw provider code is deliberately NOT copied into the receipt (one fact, one name).
  const providerRefusalTranslated = providerRefusalRaw !== null
    && String(providerRefusalRaw.code || '') === 'VMU_NO_SUCH_OBJECT'
    && !liveView
    && sessionRefusal !== null
  const providerRefusal = providerRefusalTranslated
    ? Object.assign({}, sessionRefusal, {
      providerCodeTranslated: true,
      translatedMeans: 'the host provider reports "no live Agent" in its own code; this receipt translates that fact to the named session code so ONE fact has ONE name — the raw provider code is deliberately not repeated here (RUN 252 / F72-1)',
    })
    : providerRefusalRaw
  // ★★★ RUN 254 (F-73-02, MEASURED on the 73rd real-machine run): the marker existed ONLY when a translation HAPPENED, so
  // the ENDED state (whose provider code was already named) and the LIVE state carried no marker at all — a reader could
  // not tell "not translated because nothing needed translating" from "this receipt forgot to say". The key is now ALWAYS
  // present with a boolean true/false, and its sentence says which of the two "false" reasons applies.
  const providerCodeTranslatedMeans = providerRefusalTranslated
    ? 'true: the provider payload was translated from its own catch-all code ("no live Agent") to the named session answer (' + String(sessionRefusal && sessionRefusal.code) + '), because "no live Agent" is one fact and this face gives it one name (RUN 252 / F72-1)'
    : (providerRefusalRaw === null
      ? 'false: there was NO provider-level refusal in this reading to translate (a live session, or no provider payload), so nothing was translated — the key is present so "not translated" is a fact about this receipt rather than a missing field (RUN 254 / F-73-02)'
      : 'false: the provider code "' + String(providerRefusalRaw.code || '') + '" was ALREADY named, so no translation was performed — replacing an honest name with another would rename a fact that was never ambiguous (RUN 254 / F-73-02)')

  const measuredSet = {
    available: measuredCount !== null,
    count: measuredCount,
    tools: measuredCount === null ? null : view.tools,
    hidden: view && Array.isArray(view.hidden) ? view.hidden : null,
    source: view && view.source !== undefined ? view.source : null,
    liveAgent: liveView,
    schemaScope: view && view.schemaScope !== undefined ? view.schemaScope : null,
    refusal: sessionRefusal,
    providerRefusal,
    means: measuredCount !== null
      ? 'the MEASURED set: the names a live Agent for this member actually exposes right now (the host\'s visible-tools wire), which is a different question from `declarationSet` — a governed seat may be denied by the meeting type, and a non-live seat has no wire at all'
      : '`count:null` here is NOT "sees nothing": the MEASURED set needs a live Agent and there is none, so it is null on purpose and `refusal` says which of the two session facts it is. The DECLARED set in `declarationSet` is readable with no session and is what the institution says this seat may call',
  }
  // ★★★ TB-2694 / F75-07 (MEASURED on the 75th real-machine run): a temp seat's `tool_help` printed
  // `declarationSet` (8 allowed of 48 declared) beside `measuredSet` (40 rows on the wire) and NAMED the difference
  // nowhere, so the only reading a member could take away was "40 tools are mounted and I hold 8 permissions". The two
  // numbers are two different questions, and this block makes the difference a readable fact in BOTH directions:
  //   · `wireOnly`        = measured − declaration: rows the WIRE offers that this seat's declared face does not name;
  //   · `declarationOnly` = declaration − measured: rows the seat's declared face allows that this wire does not carry.
  // Neither direction is a permission verdict. A row can be wireOnly because the v5r seat table does not govern it at all
  // (a framework or host face — the call-time gate decides that row), and it can be declarationOnly because a seat face,
  // a turn override or a missing host catalogue kept it off this wire. The rows say WHICH of those it is (`why`), so a
  // reader reconciles 40-vs-8 instead of guessing — "mounted" is not "authorized", and "declared" is not "mounted".
  const measuredNames = measuredCount === null
    ? null
    : view.tools.map((t) => (t && typeof t === 'object' ? t.name : t)).filter((n) => typeof n === 'string' && n !== '')
  const declaredAllowedNames = declarationSet.tools === null ? null : declarationSet.tools
  const wireOnlyNames = measuredNames === null || declaredAllowedNames === null
    ? null
    : measuredNames.filter((n) => !declaredAllowedNames.includes(n))
  const declarationOnlyNames = measuredNames === null || declaredAllowedNames === null
    ? null
    : declaredAllowedNames.filter((n) => !measuredNames.includes(n))
  const wireRowOf = (name) => {
    const declared = declaredToolNames.includes(name)
    return {
      name,
      // `governed` = the v5r seat table has an opinion about this name at all. `false` means the row is a framework or
      // host face the pack never declares — it is on the wire because the host offers it, not because the pack allowed it.
      governed: declared,
      why: declared
        ? 'declared by the pack but not in this seat\'s DECLARED face — on the wire it must be read as offered, and the call-time face gate decides the call'
        : 'outside the v5r pack declaration (a framework/host face): the seat table does not govern it, so neither side of this receipt is a permission for it',
      deniedBy: declared ? { face: 'v5r#seat-faces.js', slot: seatOfMember === '' ? null : seatOfMember } : null,
    }
  }
  const declarationRowOf = (name) => ({
    name,
    why: 'the seat\'s DECLARED face allows this name and this wire does not carry it — read `measuredSet.hidden` for the named reason (seat/turn/catalogue); a declaration is a permission, not proof the host offered it on this turn',
  })
  const wireOnly = wireOnlyNames === null
    ? {
      available: false,
      count: null,
      tools: null,
      rows: null,
      measuredCount: null,
      declaredAllowedCount: declarationSet.allowCount,
      means: 'no live Agent, so there is no wire to compare with the declaration: `count:null` says "not measurable here", it never claims the difference is 0 (the declaration side is still readable in `declarationSet`)',
    }
    : {
      available: true,
      count: wireOnlyNames.length,
      tools: wireOnlyNames,
      rows: wireOnlyNames.map(wireRowOf),
      measuredCount: measuredNames.length,
      declaredAllowedCount: declaredAllowedNames.length,
      means: 'rows this member\'s LIVE wire offers that its DECLARED face does not name. This is the 40-vs-8 reconciliation: for the temp seat on the 75th run the wire carried 40 rows and the declared face named 8, because the other 32 are framework/host faces (`governed:false`) the v5r seat table does not govern. Seeing a row here is NOT permission and not a refusal — the call-time gate decides each row (e.g. `vibe_vmu_vote`/`vibe_vmu_meeting` are refused to a temp seat by their own faces, measured on that same run)',
    }
  const declarationOnly = declarationOnlyNames === null
    ? {
      available: false,
      count: null,
      tools: null,
      rows: null,
      means: 'no live Agent, so the declaration cannot be compared with a wire: read `declarationSet` alone, and read this field only when a wire exists',
    }
    : {
      available: true,
      count: declarationOnlyNames.length,
      tools: declarationOnlyNames,
      rows: declarationOnlyNames.map(declarationRowOf),
      means: 'rows the seat\'s DECLARED face allows that this wire does not carry. A governed seat with a complete wire reports 0 here; a nonzero count points at `measuredSet.hidden` (seat) or at a host catalogue that does not publish the name (catalogue)',
    }
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
  // ★★ RUN 190 (run 34 / FEEDBACK33 1.5, MEASURED): OUTSIDE A TURN THE ANSWER WAS ONLY A REFUSAL. Run 34's members asked
  // "what can I call" between turns (to plan the next step) and got `tools:null` + `VMU_MEMBER_SESSION_NOT_LIVE` — true,
  // but the DECLARATION is static: the pack's published tools are the same list whatever session state is. The seat-scoped
  // VISIBLE set genuinely needs a live Agent, so it stays `null`; what is added is the catalog, clearly marked as the
  // declaration and NOT as "what you can call right now" (narrowing by seat/meeting type is exactly why they differ).
  const catalogFallback = (() => {
    if (!view || Array.isArray(view.tools)) return null
    const names = V5R_PACK_TOOLS.map((t) => (t && t.name) || null).filter((n) => typeof n === 'string').sort()
    if (names.length === 0) return null
    return {
      catalog: names,
      catalogMeans: "this is the pack's DECLARED tool surface (every name the v5r pack publishes), not your seat's live visible set: the per-seat set depends on your role and on any meeting-type narrowing, and that reading needs a live Agent. Use this list to look a name up; use `vibe_vmu_tools` inside a turn for the authoritative visible set",
    }
  })()
  // ★ RUN 251: a LIVE provider answer already carries the kernel's own `seatFilter` (slot/rule/before/after/deniedNames,
  // added by RUN 249-A) — that is the MEASURED narrowing and must be forwarded, never overwritten by the declaration
  // filter. The declaration filter is therefore nested under `declarationSet.seatFilter` and only takes the top-level
  // name when the kernel has nothing to say (no live session), so both readings stay readable side by side.
  const kernelSeatFilter = view && view.seatFilter !== undefined && view.seatFilter !== null ? view.seatFilter : null
  return Object.assign({}, view, forwarded, catalogFallback || {}, {
    // ★★★ RUN 251 (F71-7 / F71-8): the DECLARED reading is always here (session or not); the MEASURED one says
    // `available:false` with one of the two named session refusals, never `VMU_NO_SUCH_OBJECT`.
    declaredCount: declarationSet.declaredCount,
    allowCount: declarationSet.allowCount,
    denyCount: declarationSet.denyCount,
    seatFilter: kernelSeatFilter !== null ? kernelSeatFilter : declarationSet.seatFilter,
    declarationSeatFilter: declarationSet.seatFilter,
    declarationSet,
    declarationSetMeans: declarationSet.means,
    measuredSet,
    measuredSetMeans: measuredSet.means,
    // ★★★ TB-2694 / F75-07: the named, counted reconciliation between the wire and the declaration (see the block above
    // `measuredSet`). Always present; `available:false` on a session-less kernel rather than a 0 that would read as "no
    // difference".
    wireOnly,
    wireOnlyMeans: wireOnly.means,
    declarationOnly,
    declarationOnlyMeans: declarationOnly.means,
    refusal: sessionRefusal === null ? (view && view.refusal ? view.refusal : null) : sessionRefusal,
    providerRefusal,
    // ★★★ RUN 254 (F-73-02): ALWAYS present (true/false), so "was the provider code translated" is answerable on all three
    // session states — live, ended, never-opened — instead of only on the one state that needed translating.
    providerCodeTranslated: providerRefusalTranslated,
    providerCodeTranslatedMeans,
    tool: 'vibe_v5_tool_help',
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
    throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + to + '" on this roster', ROSTER_TO_REACHABLE_HINT('assign'))
  }
  const tasks = tasksOf(kernel)
  let taskId = has(args.task_id) ? str(args.task_id) : null
  let created = null
  // ★★★ TB-2750 / RUN 80 (F80-1): this face is the v5r ASSIGNMENT verb, and it carries the assignment's WHY + ACCEPTANCE
  // — the work statement the assignee must be able to read. The kernel now refuses an unbriefed take by name
  // (`VMU_TASK_BRIEF_MISSING`), so this face turns its own two required parameters into that brief instead of leaving the
  // assignee with an assigned-but-unreadable row. The text is the caller's, never invented; an EXISTING brief is not
  // overwritten (the existing work statement is the more specific one).
  const assignmentBrief = () => '【分派】' + str(args.subject || args.task_id) + '\n理由：' + str(args.why) + '\n验收：' + str(args.acceptance)
  if (!taskId) {
    if (!has(args.subject)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'assign without task_id needs a subject (the original created the task here)',
        'pass task_id:"t-…" to assign an existing task, or subject:"…" to create one')
    }
    created = await tasks.create({ title: str(args.subject), objective: has(args.description) ? str(args.description) : str(args.acceptance), owner: to, deps: null, writeScopes: Array.isArray(args.write_scopes) ? args.write_scopes.map(String) : [] })
    taskId = created && created.id
    // create({owner}) plants the owner without a brief (the id must exist first); write the brief NOW and return the row
    // as it stands AFTER it (the brief bumps revision — a stale receipt would feed the next compare-and-set a bad number).
    if (created && typeof tasks.brief === 'function') {
      await tasks.brief(created.id, assignmentBrief(), {})
      const listed = await tasks.list()
      const rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.tasks) ? listed.tasks : [])
      const fresh = rows.filter((r) => r && r.id === created.id)[0] || null
      // ★★★ TB-2750 follow-up (R5-b): same as hire above — the brief was written in THIS call, so the create-time
      // `assignmentUnreadable:true`/`assignmentMeans` no longer describe this row. Returning both would contradict
      // `readable:true` in the SAME receipt (one receipt, one reading).
      if (fresh) created = Object.assign({}, created, fresh, { assignmentUnreadable: false, assignmentMeans: null })
    }
  } else {
    // an EXISTING task: assign refuses when it has no brief, so hand it the same work statement first — but only when it
    // really lacks one (briefOf throws VMU_NO_SUCH_OBJECT for "no brief", which is an absence, not a failure).
    let alreadyBriefed = false
    if (typeof tasks.briefOf === 'function') {
      try { tasks.briefOf(taskId); alreadyBriefed = true } catch (e) {
        // ONLY "this task has no brief" is an absence this face may fill; any other failure is a real read failure and
        // must travel (silently treating it as "no brief" would overwrite a statement nobody could read).
        if (!e || e.code !== 'VMU_NO_SUCH_OBJECT') throw e
        alreadyBriefed = false
      }
    }
    if (!alreadyBriefed && typeof tasks.brief === 'function') await tasks.brief(taskId, assignmentBrief(), {})
    await tasks.assign(taskId, to)
  }
  let notice = null
  if (kernel.mailbox && typeof kernel.mailbox.send === 'function') {
    notice = kernel.mailbox.send('office', { to, kind: 'assign',
      text: '【分派】' + str(args.subject || args.task_id) + '\n理由：' + str(args.why) + '\n验收：' + str(args.acceptance) })
  }
  // ★★ RUN 198 (run 38 FEEDBACK37 2.6): the chair assigned a FORMAL-VERIFICATION task to a temp worker, and the receipt
  // said nothing about the fact that the temp seat has no Lean face at all (seat-faces A8: the five `lean_*` tools, the
  // research-library writes and `paper` are `temp: false`). The worker could only report "I cannot run Lean" — after the
  // assignment had already been made. This face cannot read intent out of prose, so it does not refuse: it STATES the
  // seat and what that seat cannot reach, so "assign it to a member instead" is answerable at the moment of assigning.
  const seatRow = roster.filter((m) => String(m.id) === to)[0] || null
  const seat = seatRow ? String(seatRow.slot) : ''
  const assigneeCapability = seat === 'temp'
    ? { seat, noLeanFace: true, noResearchLibrary: true,
        means: 'the TEMP seat has no Lean face and no research-library FACE (seat-faces A8: the five vibe_v5_lean_* tools, record_proposition / record_method / record_subproblem / record_progress and paper are all temp:false). A temp worker does the assigned temporary task and reports through task_update / read_library. ★ RUN 202 (run 40 / FEEDBACK39 1.4): this line used to read as "a temp seat can never leave a progress row", and a live run showed the opposite — the TURN reply envelope wrote one for a temp member, attributed by the turn itself. Both are true because they are DIFFERENT DOORS: the research-library face is closed to temp, while the reply envelope is the turn\'s own channel and writes through it (the row is attributed by the turn, not by a library face). What a temp seat cannot do is open the library face; what it can always do is answer its turn. If this assignment needs FORMAL VERIFICATION or a library-face write, assign it to a member (r-1/r-2) or the chair instead — that work is reachable there, not here.' }
    : (seat === '' 
      ? { seat: null, noLeanFace: null, noResearchLibrary: null,
          means: 'this assignee is not on the roster this face can read, so nothing is claimed about its faces' }
      : { seat, noLeanFace: false, noResearchLibrary: false,
          means: 'this seat holds the Lean face, the research-library writes and `paper` (seat-faces); nothing in a normal assignment is out of its reach' })
  return { ok: true, tool: 'vibe_v5_assign', to, taskId, created: created || null, notice,
    assigneeSeat: seat === '' ? null : seat, assigneeCapability,
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
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', ROSTER_ID_REACHABLE_HINT)
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
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + to + '" on this roster', ROSTER_TO_REACHABLE_HINT('nudge'))
  if (!kernel.mailbox || typeof kernel.mailbox.send !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no mailbox face is published, so a nudge cannot be delivered', 'assemble a kernel with the mailbox service')
  }
  const text = '【督办】' + str(args.why) + (has(args.next_step) ? '\n建议下一步：' + str(args.next_step) : '')
  const sent = kernel.mailbox.send('office', { to, kind: 'nudge', text })
  return { ok: true, tool: 'vibe_v5_nudge', to, sent,
    // ★ KEEP-THE-RECEIPT-HONEST: the row's urgent flag comes from `vmu.mailbox.urgentKinds`, and that list is EMPTY by
    // default — so a note that always said "urgent mail" contradicted `sent.urgent:false` in the SAME receipt (a chair
    // read that and filed it as a defect). The note now reads the flag back instead of asserting a policy nobody set.
    note: row.state !== 'live'
      ? 'member is ' + String(row.state) + '; the mail waits for its next wake'
      : (sent && sent.urgent === true
        ? 'delivered as urgent mail (this deployment lists nudge among vmu.mailbox.urgentKinds)'
        : 'delivered as ORDINARY mail: this deployment does not list nudge among vmu.mailbox.urgentKinds (the row reads urgent:false — urgency is the deployment declaration, not the kind name)') }
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
function toolFeedback(args = {}, { kernel, callerMember } = {}) {
  const records = recordsOf(kernel)
  // ★★★ RUN 249 (F-04, MEASURED on the 69th real-machine run): `rec-10`/`rec-14` were feedback rows whose `owner`,
  // `writer` and `by` were ALL null — the face wrote a card it could not attribute. The RUN 50 (F-32) reasoning still
  // holds (a TOOL name is not an author, so never write "vibe_v5_feedback"), but silence is not the honest answer
  // either: a row nobody authored cannot be routed back to its author, and "who said this" is the whole point of a
  // feedback ledger. The author is knowable twice over — the caller names `member`, and a member turn's call context
  // carries `callerMember` (host-pack-tools.js resolves it) — so the ONE honest shape is: resolve it, and when BOTH
  // are empty REFUSE BY NAME instead of filing an unattributable row.
  const authorOf = () => {
    const named = has(args.member) ? str(args.member).trim() : ''
    const caller = typeof callerMember === 'string' ? callerMember.trim() : ''
    const author = named !== '' ? named : caller
    if (author === '') {
      throw refuse('VMU_INVALID_ARGUMENT',
        'feedback ' + (has(args.op) ? str(args.op) : 'add/update') + ' has no author: neither `member` nor the call context names one — this face no longer files a card whose owner/writer/by would all be null',
        'pass member:"<your member id>" (e.g. member:"r-1"); a feedback card records WHO filed it, and a row nobody authored cannot be routed back. The member turn\'s own call context supplies it automatically — only a call made outside a member turn has to say it (RUN 249 / F-04)')
    }
    return author
  }
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
    const author = authorOf()
    const written = records.put({ track: 'feedback', kind: 'feedback', title: str(args.category) + '/' + str(args.route), body, by: author })
    return { ok: true, tool: 'vibe_v5_feedback', op, recordId: written && written.id, status: 'open',
    finalAck: written && written.finalAck === true, finalAckSource: written ? written.finalAckSource : null, finalAckMeans: written ? written.finalAckMeans : null }
  }
  if (!has(args.id)) throw refuse('VMU_INVALID_ARGUMENT', 'feedback update needs id', 'pass id:"<feedback record id>"')
  const body = ['status：' + (has(args.status) ? str(args.status) : 'closed'), 'outcome：' + str(args.outcome), 'note：' + str(args.note)]
    .filter((l) => !l.endsWith('：')).join('\n')
  const author = authorOf()
  const written = records.put({ id: str(args.id), track: 'feedback', kind: 'feedback', title: str(args.id), body,
    finalAck: has(args.status) && str(args.status) === 'closed', by: author })
  return { ok: true, tool: 'vibe_v5_feedback', op, recordId: written && written.id, status: has(args.status) ? str(args.status) : 'closed',
    finalAck: written && written.finalAck === true, finalAckSource: written ? written.finalAckSource : null, finalAckMeans: written ? written.finalAckMeans : null }
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

function toolScript(args = {}, { kernel, exec } = {}) {
  const records = recordsOf(kernel)
  const op = has(args.op) ? str(args.op) : 'archive'
  if (op !== 'archive' && op !== 'read' && op !== 'list') {
    throw refuse('VMU_INVALID_ARGUMENT', 'script needs op=archive|read|list', 'pass op:"archive" / "read" / "list"')
  }
  // ★ RUN 236 / C14 — THE SEAT RAIL. The seat face (seat-faces.js#SEAT_TOOL_FACES) makes this a chair-only face; this
  // is its CALL-SIDE twin, because a face is a presentation and a call is what an institution must be able to refuse by
  // name. Rule C14 says a study script must be archived; before this rail the whole face was denied to every seat, so
  // the rule had no executor. The archive is the ACADEMICIAN's institutional act (it files a 所级产物 on the records
  // track) — a member or temp hands the script to the chair and says what it should be archived AS. An explicit
  // `member` wins (the office relays for a seat); otherwise the turn answers, the same identity rule the meeting face
  // uses (LIVE RUN 128 / F-128d) — no live turn ⇒ no rail (the office is the institute's own hand, not a seat).
  const caller = has(args.member) && str(args.member).trim() !== '' ? str(args.member) : callerFromTurn(kernel, exec)
  const callerRow = caller === null || caller === undefined || str(caller).trim() === '' ? null : seatOf(kernel, caller)
  if (callerRow && String(callerRow.slot) !== CHAIR_SLOT) {
    throw refuse('VMU_NOT_PERMITTED',
      'the script archive is an ACADEMICIAN (chair seat) act (rule C14): "' + str(callerRow.id) + '" is in slot "' + String(callerRow.slot) + '"',
      'hand the script to the chair and say what it should be archived AS — say {to:"<chair id>", ...} with the text, a recorded meeting note, or your task receipt — then the chair files it with op:"archive"; member/temp do not hold the archive face (archive is an archival copy, not execution evidence)')
  }
  const tracks = declaredTracks(kernel)
  if (!tracks.includes(SCRIPTS_TRACK)) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'this deployment declares no scripts track, so a script cannot be archived (vmu.records.tracks)',
      'declare "scripts" in vmu.records.tracks (the v5r pack ships it); until then this face is absent rather than fake',
      { declared: tracks, missingTrack: SCRIPTS_TRACK })
  }
  if (op === 'archive') {
    // ★★ RUN 239-E (FEEDBACK62 #8): TWO REACHABLE SOURCES. This branch used to need `name`+`text` only, so a member
    // holding a library record whose BODY IS the script (id:"rec-19") was told "script archive is missing: name, text",
    // and the hint named only the literal form — the record was already in the library and this face could not see it.
    // The archive now takes EITHER name+text (the caller carries the bytes) OR id:"rec-<n>" (the records face hands back
    // the row; its body becomes the script verbatim, its title becomes the archive name unless `name` overrides it), and
    // the receipt says which door was used (`archived.source`) and what was read (`fromRecord`).
    const idGiven = has(args.id) && str(args.id).trim() !== ''
    const nameGiven = has(args.name) && str(args.name).trim() !== ''
    let body = ''
    let source = 'argument'
    let fromRecord = null
    let archiveName = nameGiven ? str(args.name) : ''
    if (idGiven) {
      const wanted = str(args.id).trim()
      // records.get() THROWS VMU_NO_SUCH_OBJECT for an unknown id; this face turns that into one hint that names BOTH
      // doors, because a caller who mistyped an id needs the same two choices as a caller who passed none.
      let row = null
      try { row = scriptArchivedRow(kernel, wanted) } catch (e) { row = null }
      if (!row) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no library record with id "' + wanted + '" to archive as a script',
          'pass id:"<a record id like rec-12>" — or pass name:"<file name>" text:"<the whole script>" if the bytes are not in a record yet')
      }
      const rowBody = row.body === undefined || row.body === null ? '' : String(row.body)
      if (rowBody.trim() === '') {
        throw refuse('VMU_INVALID_ARGUMENT', 'the record "' + str(row.id === undefined ? wanted : row.id) + '" has no body text to archive as a script',
          'pass id:"<a record whose body IS the script>", or pass name:"<file name>" text:"<the whole script>" directly')
      }
      body = rowBody
      if (!nameGiven) {
        archiveName = row.title === undefined || row.title === null || String(row.title).trim() === ''
          ? str(row.id === undefined ? wanted : row.id)
          : String(row.title)
      }
      source = 'record'
      fromRecord = {
        id: str(row.id === undefined ? wanted : row.id),
        title: row.title === undefined || row.title === null ? null : String(row.title),
        bytes: Buffer.byteLength(rowBody, 'utf8'),
      }
    } else {
      const missing = ['name', 'text'].filter((k) => !has(args[k]))
      if (missing.length > 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'script archive is missing: ' + missing.join(', '),
          'pass name:"<file name>" text:"<the whole script>", or id:"<a library record whose body is the script>" (optional purpose/parent/edition)')
      }
      body = str(args.text)
    }
    const tags = ['script']
    if (has(args.purpose)) tags.push('purpose:' + str(args.purpose))
    if (has(args.parent)) tags.push('parent:' + str(args.parent))
    if (has(args.edition)) tags.push('edition:' + str(args.edition))
    const written = records.put({
      track: SCRIPTS_TRACK,
      kind: 'dataset', // an archived artifact: kernel-computed fingerprint + provenance, no invented hash
      title: archiveName,
      body, // verbatim: read-back must return the same bytes
      tags,
      finalAck: true,
      by: has(args.member) ? str(args.member) : null,
      bySource: has(args.member) ? 'argument' : 'unknown',
    })
    return {
      ok: true, tool: 'vibe_v5_script', op, track: SCRIPTS_TRACK,
      recordId: written && written.id, name: archiveName,
      finalAck: written && written.finalAck === true, finalAckSource: written ? written.finalAckSource : null,
      // ★ RUN 239-E: where the archived bytes came from — null when the caller carried them with name+text.
      fromRecord,
      source,
      fingerprint: written && written.fingerprint,
      purpose: has(args.purpose) ? str(args.purpose) : null,
      at: written && (written.updatedAt || written.createdAt),
      // ★ RUN 236 / C14: an ok is not an archive — the caller asked the institution to FILE something, so the receipt
      // names the row that was actually written (readable back by id) and says out loud what it is and is not.
      archived: {
        recordId: written && written.id,
        name: archiveName,
        track: SCRIPTS_TRACK,
        bytes: Buffer.byteLength(body, 'utf8'),
        source,
      },
      archivedBy: callerRow ? str(callerRow.id) : (has(args.member) ? str(args.member) : null),
      archiveMeans: 'an archival COPY of the script text on the records face (track "scripts", kernel fingerprint), not execution '
        + 'evidence: nothing was run here (the no-adhoc-scripts rule still refuses ad-hoc running), and a recompute means '
        + 're-running the archived text and comparing the fingerprint before/after',
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
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', ROSTER_ID_REACHABLE_HINT)
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
      ROSTER_ID_REACHABLE_HINT)
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
      leanJob: partial.leanJob === undefined ? (row.lean_job === undefined || row.lean_job === null ? '' : str(row.lean_job)) : str(partial.leanJob),
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
    leanJob: fields.leanJob === undefined ? (row.lean_job === undefined || row.lean_job === null ? '' : str(row.lean_job)) : str(fields.leanJob),
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
  const word = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : str(v))
  // ★★ RUN 198 (run 38 FEEDBACK37 2.4): one ruling, two names. The gate read ONLY `ballotId` while the framework's own
  // `correction.call` told the holder to pass `meeting` — so a ruling that named its meeting reached the gate, was
  // admitted, and the receipt could not name what decided the card (the run-38 reader passed BOTH keys to get through).
  // Both names are now part of the declared shape, they are normalized ONCE into `rulingRef`, and the fields the card
  // body already keeps (`n`/`decided`/`at`/`by`/`warrant`) travel with the evidence instead of being dropped here and
  // re-appearing in a different shape on the body row.
  const ballotId = word(raw.ballotId)
  const meeting = word(raw.meeting)
  // ★★★ RUN 204 (FEEDBACK41 1.4): THE FRAMEWORK'S OWN PRINTED REPAIR COULD NOT BE PASTED BACK. `vibe_v5_verdict_final`
  // hands out `debate_ruling: { …, ballotId: "tally-<meeting>-<card>", meeting: "…" }`, and the p=1 gate sent that tally
  // id to the BALLOT branch, where no box by that name exists ⇒ UNRESOLVED. A tally id is a NAME for an aggregate
  // (reproducible from meeting + proposition), declared here as its own key so the routed reading can re-derive it.
  const tallyId = word(raw.tallyId)
  const rulingRef = ballotId || meeting || tallyId || null
  return { mode: word(raw.mode), value: raw.value === undefined || raw.value === null ? null : raw.value,
    ballotId, meeting, tallyId, rulingRef,
    rulingRefMeans: rulingRef === null
      ? 'this ruling named NEITHER a ballot nor a meeting, so nothing outside itself says what decided it — the gate still admits it (a caller-supplied ruling is the contract), but a reader cannot follow it anywhere'
      : (ballotId !== null && meeting !== null
        ? 'the ruling names both a ballot id and a meeting; they are ONE reference read two ways (`rulingRef` = the ballot id), not two decisions'
        : (ballotId !== null
          ? 'the ruling names a ballot id (`rulingRef`); no meeting was named'
          : 'the ruling names a MEETING (`rulingRef`); a meeting-ruled card and a ballot-ruled card take the same route "debate"')),
    n: raw.n === undefined || raw.n === null ? null : raw.n,
    decided: raw.decided === true ? true : (raw.decided === false ? false : null),
    at: word(raw.at), by: word(raw.by), warrant: word(raw.warrant),
    subject: word(raw.subject) }
}
/**
 * ★★ RUN 201 (run 40 / FEEDBACK39 1.1, MEASURED): the ruling a p=1 write may claim was checked for SHAPE only — mode
 * unanimous, value 1, subject matches the card — so run 40 wrote p=1 onto a card that had never been debated and named
 * a ballot that EXISTED and held ZERO votes. Every word of the write receipt was true and nothing had decided anything.
 * The institution owns a ballot face and a meetings face; "the name resolves to something people voted in" is a fact
 * only it can answer, so this face asks it and refuses by name when the answer is no.
 *
 * THREE ANSWERS, never two: a name can be UNKNOWN (no such box/meeting), UNVOTED (it exists and nobody voted), or READ
 * (here is what it holds). The middle one is the run-40 shape and it is not an error state: it is a real entity that has
 * decided nothing yet.
 */
async function rulingNameResolution(kernel, debate, context = {}) {
  // ★★★ RUN 206 (run 44 / FEEDBACK43 1.5, MEASURED): the reader is ASYNC now — a debate can settle with TYPED
  // RULING CARDS filed on disk, and reading those goes through the library. The caller awaits; a rule that can be
  // decided two ways and is only read one way is a rule the loop cannot close.
  const ctxCardId = context && context.cardId !== undefined && context.cardId !== null && String(context.cardId).trim() !== ''
    ? String(context.cardId).trim() : null
  let ref = debate && debate.rulingRef !== undefined && debate.rulingRef !== null ? str(debate.rulingRef) : ''
  if (!ref) return null
  const ballotId = debate.ballotId !== undefined && debate.ballotId !== null ? str(debate.ballotId) : null
  // ★★★ RUN 204 (FEEDBACK41 1.4): a TALLY id is not a ballot-box id. `vibe_v5_verdict_final` prints
  // `ballotId: "tally-<meeting>-<card>"` next to `meeting`, and this face looked that name up on the BOX face, where it
  // cannot exist ⇒ UNRESOLVED on a ruling the framework itself had just produced. A tally id is a NAME derived from
  // (meeting, proposition) and stored nowhere, so it is checked by RE-DERIVING it — and the meeting it names is then read
  // like any meeting ruling. A tally id without its meeting cannot be re-derived, and that is refused by name.
  if (ballotId !== null && /^tally-/.test(ballotId)) {
    const meetingId = debate.meeting !== undefined && debate.meeting !== null ? str(debate.meeting).trim() : ''
    const subject = debate.subject !== undefined && debate.subject !== null ? str(debate.subject).trim() : ''
    if (!meetingId) {
      return { ok: false, kind: 'tally', ref, reason: 'no-meeting',
        means: 'the ruling names the aggregate tally id ' + ballotId + ', which is a NAME derived from (meeting, proposition) and stored nowhere — '
          + 'pass the `meeting` it was decided in as well (the verdict_final receipt prints both), so the name can be re-derived; never treat a tally id as a ballot box id' }
    }
    const expected = subject ? 'tally-' + [meetingId, subject].map(rulingSlugOf).join('-') : null
    if (expected !== null && expected !== ballotId) {
      return { ok: false, kind: 'tally', ref, reason: 'mismatch',
        means: 'the ruling names tally id ' + ballotId + ', but that name does not re-derive from the meeting ' + meetingId
          + ' + this card ' + subject + ' (it would be ' + expected + ') — one of the two names refers to a different decision' }
    }
    ref = meetingId
  }
  if (ballotId !== null && !/^tally-/.test(ballotId)) {
    const face = kernel && kernel.ballotbox
    if (!face || typeof face.status !== 'function') {
      return { ok: false, kind: 'ballot', ref, reason: 'unreadable',
        means: 'this kernel exposes no ballot face, so the named ballot id cannot be resolved here; a ruling on a name nobody can check is an assertion' }
    }
    let read = null
    try { read = face.status({ boxId: ballotId }) } catch { read = null }
    if (!read || read.ok !== true) {
      // ★★★ RUN 208 (run 45 / FEEDBACK44 1.3, MEASURED): a DEBATE's ballot box id (`b-1-…`, the one `vibe_vmu_meeting
      // { action:"ballot" }` returns) was cited as `debate_ruling.ballotId`; the box face answered "no ballot with that id
      // exists", which is FALSE — the box exists, on the MEETING face, and its votes live in the meeting tally. Two faces,
      // two registries: say which one holds the id, and name the shape that reads it.
      const meetingBallot = (() => {
        try {
          const list = kernel && typeof kernel.liveList === 'function' ? kernel.liveList() : null
          const ids = list && Array.isArray(list.ballots) ? list.ballots.map(String) : []
          return ids.includes(String(ballotId))
        } catch (e) { return false }
      })()
      return { ok: false, kind: 'ballot', ref, reason: 'unknown', meetingBallot,
        means: meetingBallot
          ? 'the id ' + ballotId + ' is NOT a poll box this gate can look up — it is a MEETING ballot (the box a debate opens on the meeting face), and its votes are tallied into that meeting: name the MEETING in the ruling (`meeting:"<meeting id>"`), never the box id'
          : 'no ballot with id ' + ballotId + ' exists on this kernel, so the ruling names a decision that cannot be read anywhere' }
    }
    const votes = Number(read.votes) || 0
    const abstain = Number(read.abstain) || 0
    const state = read.state === undefined ? null : String(read.state)
    const byChoice = read.byChoice && typeof read.byChoice === 'object' ? read.byChoice : {}
    // ★★★ RUN 202 (run 40 / FEEDBACK39 1.1, MEASURED): RUN 201 taught this face to check that the named box HAS votes.
    // run 40's hole was empty; the NEXT hole is one step in: a box can hold votes that agree on NOTHING. "unanimous" is a
    // claim about a tally, so the reading has to include the tally — how many distinct choices were cast, which one led,
    // and whether the box was ever CLOSED (a poll in progress is not a decision).
    const choices = Object.keys(byChoice).filter((k) => Number(byChoice[k]) > 0)
    const unanimous = votes > 0 && choices.length === 1
    return { ok: true, kind: 'ballot', ref, exists: true, state, votes, abstain, byChoice,
      choices: choices.length,
      choiceNames: choices.slice(0, 8),
      unanimous,
      decisive: unanimous ? choices[0] : null,
      settled: state === 'closed',
      voted: votes > 0,
      means: 'the ballot ' + ballotId + ' was READ on this kernel: state ' + String(state) + ', '
        + String(votes) + ' vote(s) for ' + String(choices.length) + ' distinct choice(s) '
        + (choices.length === 0 ? '' : '(' + choices.slice(0, 8).join('、') + ') ')
        + ', ' + String(abstain) + ' abstention(s)'
        + (unanimous ? ' — every vote went to ONE choice, so "unanimous" is what the tally says' : (votes > 0 ? ' — the votes are SPLIT across choices, so "unanimous" is NOT what the tally says' : ' — no vote was cast for any choice, so there is no tally here'))
        + '; a box that is not closed is a poll in progress, not a decision (see `settled`)' }
  }
  const face = kernel && kernel.meetings
  if (!face || typeof face.summary !== 'function') {
    return { ok: false, kind: 'meeting', ref, reason: 'unreadable',
      means: 'this kernel exposes no meetings face, so the named meeting cannot be resolved here' }
  }
  let read = null
  try { read = face.summary({ meeting: ref }) } catch { read = null }
  if (!read || read.ok !== true) {
    return { ok: false, kind: 'meeting', ref, reason: 'unknown',
      means: 'no meeting with id ' + ref + ' exists on this kernel, so the ruling names a decision that cannot be read anywhere' }
  }
  const motions = Array.isArray(read.motions) ? read.motions : []
  const counted = motions.reduce((n, mo) => n + (mo && Array.isArray(mo.votes) ? mo.votes.length : 0), 0)
  // ★★★ RUN 206 (run 44 / FEEDBACK43 1.5, MEASURED): A DEBATE'S DECISION CAN BE TYPED, NOT MOVED. run 44 had a
  // debate meeting (m5) whose seats filed their typed rulings with `vibe_v5_verdict`, and `verdict_final` printed the
  // aggregate name `tally-m5-rec-41` right beside `meeting:"m5"`. This branch counted MOTIONS only, so the loop's OWN
  // receipt named a decision that this gate then read as "0 votes recorded" — p=1 could not be written at all and the
  // only way out was a different tool (`fidelity_conclude`). The two readings are complementary: the motions tally is
  // read FIRST (it is the procedural record), and when it holds no vote the FILED RULING CARDS for this meeting and
  // proposition are read as the substance. `sources` says which reading answered, so a receipt never hides it.
  let rulingCards = null
  if (counted === 0 && typeof rulingSubmissionsOf === 'function') {
    const probables = []
    if (ctxCardId !== null) probables.push(ctxCardId)
    const debateSubject = debate.subject === undefined || debate.subject === null ? '' : String(debate.subject).trim()
    if (debateSubject !== '' && probables.indexOf(debateSubject) === -1) probables.push(debateSubject)
    for (const proposition of probables) {
      let filed = null
      try { filed = await rulingSubmissionsOf(kernel, { meeting: ref, proposition }) } catch (e) { filed = null }
      const rows = filed && Array.isArray(filed.rows) ? filed.rows : []
      if (rows.length > 0) {
        rulingCards = { proposition, count: rows.length, rows,
          unanimous: rows.every((r) => Number(r.verdict) === 1),
          duplicates: Array.isArray(filed.duplicates) ? filed.duplicates : [] }
        break
      }
    }
  }
  const decidedMotions = motions.filter((mo) => mo && (mo.status === 'seconded' || mo.status === 'carried'))
  // ★★★ RUN 202: same question as the ballot branch — "did this meeting DECIDE anything, and was the decision unanimous?"
  // A meeting whose motions were seconded but never voted is a debate; a motion that carried 2:1 is a decision that was
  // NOT unanimous. Both used to look identical here (a count of votes), so p=1 could cite either one as "unanimous".
  const carried = motions.filter((mo) => mo && mo.status === 'carried')
  // ★★★ RUN 202, SECOND CORRECTION (measured by `tests/vmu-run198-feedback37b.test.mjs` §1): WHAT "UNANIMOUS" QUANTIFIES.
  // The first version of this repair asked only about motions already CARRIED, so a meeting whose motion was seconded and
  // voted 3:0 — every seat for it, the chair not yet having closed the round — read as "not unanimous", and a card quoting
  // that meeting was refused. The gate was talking about PROCEDURE while the ruling talks about VOTES. A tally is evidence
  // whether or not the chair has rung the bell: `unanimousTallies` counts motions whose recorded votes are all FOR (no
  // against vote, no abstention), and `unanimousCarried` stays the NARROWER disclosure ("carried without a single against
  // vote") so a receipt still distinguishes "the votes agree" from "the round was closed".
  const unanimousTallies = motions.filter((mo) => {
    const t = mo && mo.tally ? mo.tally : null
    if (!t) return false
    return Number(t.for) > 0 && Number(t.against) === 0 && Number(t.abstain) === 0
  })
  const unanimousCarried = carried.filter((mo) => unanimousTallies.indexOf(mo) !== -1)
  // ★★★ RUN 204 (FEEDBACK41 1.1): a tally is not the only reading a ruling needs — a meeting can hold votes its own
  // floor refused to COUNT (run 42: three cast, present 1 of 3, tally 0). The floor reading rides ON the resolution so
  // the UNVOTED refusal can say WHICH fact is missing instead of reporting "0 votes" for both cases.
  const quorum = (() => {
    if (typeof face.quorum !== 'function') return null
    try {
      const q = face.quorum({ meeting: ref, allowArchived: true })
      if (!q || q.ok !== true) return null
      return { present: Number(q.present) || 0, required: Number(q.required) || 0, met: q.met === true }
    } catch { return null }
  })()
  // ★★ RUN 206: the two readings are reported side by side. `sources` is the ANSWER to "which record was counted",
  // and a typed ruling is not a motion — nobody seconded it, so `motions`/`motionsCarried` stay procedural counts.
  const cardVotes = rulingCards === null ? 0 : rulingCards.count
  const cardUnanimous = rulingCards !== null && rulingCards.unanimous === true
  return { ok: true, kind: 'meeting', ref, exists: true, quorum, state: read.state === undefined ? null : String(read.state),
    motions: motions.length, motionsSeconded: decidedMotions.length, motionsCarried: carried.length, votes: counted + cardVotes,
    motionsVotes: counted, rulingVotes: cardVotes,
    // ★★★ RUN 214 (run 51 / FEEDBACK50 1.2, MEASURED): the same receipt printed `tally.sources.typed:0` beside
    // `sources.typedRulings:2`. `typedRulings` held the SUBMITTED count, so a reader looking at a key named "typed"
    // read the opposite of the fact — the run's own agent did exactly that. The alias is GONE from `sources`: the
    // submitted count travels as `submittedRulings`, and chair-typed numbers are only ever read off the tally.
    sources: rulingCards === null
      ? { motions: counted, submittedRulings: 0 }
      : { motions: counted, submittedRulings: cardVotes, proposition: rulingCards.proposition },
    // ★★★ RUN 211 (run 48 / FEEDBACK47 1.1, MEASURED): `sources.typedRulings` counted the DURABLE ruling CARDS the
    // members filed — the same rows the tally calls `submitted` — while a chair-typed tally printed 0 there. Read beside
    // `p1CannotBackMeans` ("read p1RulingReading first") the name said the OPPOSITE of the fact: m1 (two members filed)
    // looked chair-typed and m2 (chair typed both) looked like nobody had ruled. The count is right; only its NAME was
    // wrong. `submittedRulings` is the honest name, and RUN 214 DELETED the old alias (run 51 printed it beside a `typed`
    // number that meant the opposite); `sourcesMeans` says which is which instead of leaving the reader to guess.
    sourcesMeans: 'sources.submittedRulings counts the DURABLE ruling cards the members filed with vibe_v5_verdict — the same rows the tally reports as `submitted`. Chair-typed numbers are NOT cards: they are counted in `sources.typed` and attributed to the chair in `attribution[].source` (the count lives on the tally, the card count lives here, and neither is a substitute for the other). sources.motions counts procedure votes (motions/seconded/voted), which is a different record.',
    rulingCards: rulingCards === null ? null : { proposition: rulingCards.proposition, count: rulingCards.count, duplicates: rulingCards.duplicates },
    rulingCardsMeans: 'these are the durable ruling CARDS read for this (meeting, proposition) — what the tally calls `submitted`. An empty/null value here does NOT mean nobody ruled: a chair-typed tally has no cards at all, and the tally receipt already says so in `attribution`',
    typedRulingsDeprecated: 'the old key name `typedRulings` was REMOVED in RUN 214 (it held the submitted count, not the chair-typed one, and sat beside a `typed` number that meant the opposite); read `rulingCards` and `sources.submittedRulings`',
    unanimous: unanimousTallies.length > 0 || cardUnanimous,
    unanimousCarried: unanimousCarried.length > 0 || cardUnanimous,
    // ★★★ RUN 222 (run 58 / FEEDBACK57 ②E, MEASURED): three different things were called `settled` in one run — whether the
    // MEETING is closed (here), whether the TALLY is decided (`tally.decided`), and whether an evidence CARD is settled. Run 58
    // reported the collision. The meeting side now says which question it answers; the old key stays as an alias and says so.
    meetingSettled: read.state === 'closed',
    meetingSettledMeans: 'this answers ONLY "is the MEETING closed": it is `read.state === "closed"`. It says nothing about whether a tally is decided (`tally.decided`), whether a proposition card is settled, or whether the ruling was filed.',
    settled: read.state === 'closed',
    settledDeprecated: 'the key name `settled` is kept as an alias of `meetingSettled` only for compatibility; three different questions were read off the word `settled` in run 58 (meeting closed / tally decided / card settled), so read `meetingSettled` here and the other two from their own faces',
    voted: counted > 0 || cardVotes > 0,
    means: 'the meeting ' + ref + ' was READ on this kernel: state ' + String(read.state) + ', '
      + String(motions.length) + ' motion(s) (' + String(decidedMotions.length) + ' seconded, '
      + String(carried.length) + ' carried), ' + String(counted) + ' vote(s) recorded; '
      + String(unanimousTallies.length) + ' motion(s) with a tally that is ALL FOR (no against vote, no abstention) '
      + 'and ' + String(unanimousCarried.length) + ' of those already carried'
      + (rulingCards === null
        ? ''
        // ★★★ RUN 216 (run 53 / FEEDBACK52 1.2, MEASURED): this sentence said "TYPED RULING CARD(S)" about the DURABLE
        // cards the members filed with vibe_v5_verdict, in the same receipt that printed `sources.typed:0`. Run 53 read the
        // sentence alone and reported "the chair typed two cards" — the opposite of the fact. The cards here are
        // SUBMITTED (that is what `sources.submittedRulings` counts); chair-typed numbers are not cards at all.
        : '; it ALSO holds ' + String(rulingCards.count) + ' SUBMITTED RULING CARD(S) filed for proposition '
          + rulingCards.proposition + ' (' + (cardUnanimous ? 'all of them for it' : 'they are SPLIT') + ')')
      + ' — that is what the ruling name points at' }
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
/** ★★ G7 AUDIT C5 — the DECLARED switch, readable on a kernel that has no Lean face. `leanPolicyOf` answers "what does
 *  the assembled Lean face believe"; a deployment with no spawn seam has no such face, yet the setting is still declared
 *  and still means what it says. The ruling gate prefers the face (one owner of the computed policy) and falls back to
 *  the declaration, so `require` is honoured whether or not this deployment can run Lean — a switch that only works when
 *  a compiler happens to be installed is not a switch. */
function formalVerifyPolicyOf(kernel) {
  const face = leanPolicyOf(kernel)
  if (face && face.formalVerify !== undefined) return face
  try {
    const raw = typeof kernel.settingOf === 'function' ? kernel.settingOf('vmu.math.formalVerify') : undefined
    const v = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase()
    if (!v) return null
    return { formalVerify: v, requireFormal: v === 'require', encourageFormal: v === 'encourage' }
  } catch (e) { return null }
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
  // ★★ RUN 152 (real machine, run 2, agent feedback F2): a Lean job created in an EARLIER kernel process lives only in
  // the durable mirror (`Formal/Jobs/<id>.json`), and the in-process lookup knows nothing about it until the mirror is
  // hydrated — so a continuation run got `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED … not readable on this deployment` for a
  // job whose pass the mirror holds (the workspace had lean-1..lean-5.json). Hydrate the mirror once and retry before
  // refusing; if it is still absent, the refusal names BOTH scopes so the reader knows what was searched.
  let lean = leanPassedOf(kernel, jobId)
  let mirrorHydrated = null
  // ★ the face is created only when the Host offers a spawn seam (kernel/index.js: `const lean = spawn ? … : null`), so the
  // call is made through a local binding: `kernel.lean.<method>(` would read as a call to a service a minimal kernel does
  // not construct, and audit-service-calls.mjs (rightly) treats that as dangling.
  const leanFace = kernel && kernel.lean ? kernel.lean : null
  if (!lean && leanFace && typeof leanFace.listMirrors === 'function') {
    try {
      const listed = await leanFace.listMirrors()
      mirrorHydrated = listed && listed.ok === true ? { dir: listed.dir, count: listed.count } : { error: (listed && listed.code) || 'unreadable' }
    } catch (e) { mirrorHydrated = { error: String((e && e.message) || e) } }
    lean = leanPassedOf(kernel, jobId)
  }
  if (!lean) {
    throw refuse('VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED',
      'Lean job "' + jobId + '" is not readable on this deployment ('
      + (kernel && kernel.lean
        ? 'neither this kernel process nor the durable job mirror knows that id'
          + (mirrorHydrated && mirrorHydrated.dir !== undefined ? ' — the mirror was re-read: ' + String(mirrorHydrated.dir) + ' holds ' + String(mirrorHydrated.count) + ' job(s)' : '')
          + (mirrorHydrated && mirrorHydrated.error !== undefined ? ' — the mirror could not be read: ' + String(mirrorHydrated.error) : '')
        : 'the Host exposes no spawn seam, so this deployment has no Lean face at all')
      + ')',
      'run the formalisation first（vibe_v5_lean_run）或把真实作业 id 传进来；跨进程的作业由 `vibe_v5_lean_job { jobId }` 读镜像（Formal/Jobs/<id>.json，不是计算作业的 Math/Jobs），没有 Lean 面时这条收口无载体，不要假装编过')
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
      lean_job: jobId, lean_conformance: 'conform', member: chair.id,
      // ★ C6b: the card may already be locked (a member declared the proof complete before the Lean run settled). This
      // is not an edit of the card's content — it is the machine writing the p=1 the passed Lean run already justifies
      // — so the internal lock exemption is passed here. It is NOT a declared tool parameter, so no caller can send it.
      fidelity_conclude: true }
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
/**
 * ★★ RUN 153 (real machine, run 3 / agent report G1 — the most serious defect of that run): a ruling settlement reached
 * the ORDINARY card write, which REBUILDS the whole body from the arguments it was handed. The settlement passes only
 * `p` + `debate_ruling`, so the rebuild DELETED everything else the card carried: its title fell back to the id, and
 * `proofRef` / `proofState` / `leanJob` / `leanConformance` vanished — and with `proofState` gone the lock (rule L14,
 * 「登记即定稿」) no longer bit, so the next ordinary write happily rewrote a completed card. Rule L53 settles the
 * PROBABILITY, not the card. The settlement is therefore a PATCH: rewrite the `p` line, replace any earlier ruling row
 * with THIS ruling, and leave every other line — and therefore the lock — exactly as it was.
 */
function settleRulingOnCard({ records, id, value, ruling, track, kind, by, fallbackTitle, p1Evidence = null }) {
  const got = records.get({ id })
  const row = got && got.record ? got.record : got
  if (!row) return undefined
  const NL = String.fromCharCode(10)
  const lines = str(row.body).split(NL)
  const out = []
  let wroteP = false
  let droppedEarlierRuling = false
  let droppedEarlierEvidence = false
  for (const line of lines) {
    if (/^- *p *[：:]/.test(line)) { out.push('- p：' + String(value)); wroteP = true; continue }
    // A card carries at most ONE ruling row: a second settlement REPLACES the earlier ruling instead of stacking a
    // second, contradicting probability history into the body.
    if (/^- *debateRuling *[：:]/.test(line)) { droppedEarlierRuling = true; continue }
    // ★★ RUN 241 (FEEDBACK64 M9, MEASURED): a settlement receipt carried `p1Evidence:"debate-unanimous"` while the CARD
    // carried no such line — the reader could only infer the evidence form from `debateRuling`. The form is a fact about
    // WHY p=1 was accepted, so it lands as one card line; a re-settlement REPLACES it (one line, never a stack).
    if (p1Evidence !== null && /^- *p1Evidence *[：:]/.test(line)) { droppedEarlierEvidence = true; continue }
    out.push(line)
  }
  if (!wroteP) out.push('- p：' + String(value))
  // ★★★ RUN 238 (run 61 / FEEDBACK61 C, MEASURED): the card carried `- value：0.95` (a free-text line) and the settlement
  // wrote `- p：1`. Both lines then read as "the probability on this card", and nothing said which one counts. The
  // settlement still edits only the p row (rule L53 is about p) but it NAMES the conflicting line, so the reader is not
  // left to notice it.
  const staleValueLines = []
  for (const line of out) {
    if (/^- *p *[：:]/.test(line)) continue
    const m = /^- *value *[：:](.*)$/.exec(line)
    if (!m) continue
    const raw = String(m[1]).trim()
    if (raw === '' || !/^-?\d+(\.\d+)?$/.test(raw)) continue
    const num = Number(raw)
    if (!Number.isFinite(num) || num < 0 || num > 1) continue
    if (num !== Number(value)) staleValueLines.push(raw)
  }
  const rulingRow = {}
  for (const key of ['subject', 'value', 'mode', 'n', 'decided', 'at', 'meeting', 'by', 'ballotId', 'warrant']) {
    if (ruling && ruling[key] !== undefined && ruling[key] !== null) rulingRow[key] = ruling[key]
  }
  if (rulingRow.subject === undefined) rulingRow.subject = id
  rulingRow.value = value
  out.push('- debateRuling：' + JSON.stringify(rulingRow))
  if (p1Evidence !== null) out.push('- p1Evidence：' + String(p1Evidence))
  // ★★ RUN 155 (audit of c5d356b9, problem 3) — the reason this path uses `supersede`, HISTORICAL as of RUN 236:
  // that audit measured `put` REBUILDING the record (rev back to 1, a fresh createdAt, a re-minted slug, versions/tags
  // reset), so "every other card field was left exactly as it was" was false about the row a reader would inspect.
  // RUN 236 (lane-g2, FEEDBACK60 M4) fixed the root: `kernel/records.js#put` now MERGES on an update (identity and
  // unnamed fields are kept, rev grows, a version is pushed) and its receipt names `fieldsKept`/`fieldsReplaced`.
  // This settlement still goes through `supersede` on purpose — it edits a card whose body must be rewritten as a
  // whole — and `kit/handlers.js#mergeEcho` now states the merge facts to seat-facing callers. Kept as history so a
  // future reader does not re-derive why one path supersedes and the card tools put.
  const nextBody = out.join(NL)
  // ★★★ RUN 249 (F-05): a settlement's AUTHOR is a person. Source words are NEVER names: "argument"/"caller"/"unknown"
  // describe where a value came from, and writing one into `by` made the ledger attribute a card to a metaphor (the
  // measured run-21 row read writer:"argument", by:"argument"). Resolution order, each step honest about its source:
  //   ① the named/call-context member from the write (a real actor)  → writerSource:"field-argument"
  //   ② the RULING's own signer (`debate_ruling.by`, printed by vibe_v5_verdict_final's correction.call) → "debate-ruling"
  //   ③ nobody knowable → null, and the receipt SAYS the writer is unknown; `records.supersede` with a null `by`
  //      PRESERVES whatever author the row already had (kernel/records.js:1249-1251), so null never overwrites a name.
  const SOURCE_WORD = /^(argument|caller|unknown|field-argument|field-argument[^ ]*)$/i
  const byGiven = has(by) ? str(by).trim() : ''
  const rulingBy = (ruling && typeof ruling === 'object' && ruling.by !== undefined && ruling.by !== null) ? str(ruling.by).trim() : ''
  const writer = byGiven !== '' && !SOURCE_WORD.test(byGiven) ? byGiven
    : ((rulingBy !== '' && !SOURCE_WORD.test(rulingBy)) ? rulingBy : null)
  const writerSource = writer === null ? 'unknown'
    : (byGiven !== '' && !SOURCE_WORD.test(byGiven) ? 'field-argument' : 'debate-ruling')
  const writerSourceMeans = writer === null
    ? 'no author was nameable for this settlement: neither the write nor the ruling named a member, so `writer` is null ON PURPOSE and the row keeps whatever author it already had (a null `by` never overwrites a name) — a settlement is about the RULED VALUE, not about inventing an author'
    : (writerSource === 'field-argument'
      ? 'the write named the settlement\'s author (`member` or the member turn\'s own call context)'
      : 'the write named no author, so the settlement is attributed to the person who SIGNED the ruling (`debate_ruling.by`) — a chair\'s ruling is the act being recorded')
  const reason = 'rule L53 ruling settlement: p set to ' + String(value)
    + (droppedEarlierRuling ? '; the earlier debateRuling row was replaced' : '')
  let wrote = null
  let mode = 'supersede'
  if (records && typeof records.supersede === 'function') {
    wrote = records.supersede({ id, reason, by: writer, body: nextBody })
  } else {
    // A records face without `supersede` still gets the patch, but the receipt then SAYS the row was re-put.
    mode = 'put-fallback'
    wrote = records.put({
      id, track, kind,
      title: str(row.title) || fallbackTitle || id,
      body: nextBody,
      finalAck: value === 1 || value === 0,
      by: writer, bySource: writerSource,
    })
  }
  return {
    ok: true, track, kind, recordId: (wrote && wrote.id) || id, rev: (wrote && wrote.rev) || null, id,
    settled: true, p: value, ruling: rulingRow, rulingReplaced: droppedEarlierRuling,
    // TB-2700: the settlement receipt names the write admission and WHO made it - the card receipt merges only this block,
    // so a source that lived only in the put receipt would disappear from what the caller actually reads.
    finalAck: wrote ? wrote.finalAck === true : null, finalAckSource: wrote ? wrote.finalAckSource : null,
    // ★★★ RUN 249 (F-05): WHO this settlement attributed the row to, and WHERE that name came from. A source word is
    // never reported as an author: `writer:null` + `writerSource:"unknown"` is the honest answer when nobody was nameable.
    writer, writerSource, writerSourceMeans,
    settlement: {
      patch: true,
      mode,
      // ★★★ RUN 249 (F-05): the AUTHOR of this settlement travels inside `settlement` as well as at the top level, because
      // the card receipt merges only this block — a writer the caller cannot read is a writer it cannot audit.
      writer, writerSource, writerSourceMeans,
      wrote: p1Evidence !== null ? ['p', 'debateRuling', 'p1Evidence'] : ['p', 'debateRuling'],
      p1Evidence: p1Evidence !== null ? String(p1Evidence) : null,
      p1EvidenceLine: p1Evidence !== null,
      p1EvidenceReplaced: droppedEarlierEvidence,
      preserved: mode === 'supersede'
        ? 'the card LINES: only the p row is rewritten and one debateRuling row is replaced' + (p1Evidence !== null ? ' (plus the p1Evidence row, which names the evidence form that admitted p=1)' : '') + '; every other line (title, statement/value/motive, proofRef, proofState, leanJob, leanConformance) is byte-identical, and the record keeps its id/slug/createdAt while gaining one version entry — so the rule-L14 lock still bites'
        : 'the card LINES are preserved (only the p row is rewritten and one debateRuling row added/replaced), but this records face has no supersede(): the row was re-put, so its rev/createdAt/slug are rebuilt by the records face — read the card by id, not by slug or createdAt',
      record: { id: (wrote && wrote.id) || id, rev: (wrote && wrote.rev) || null, mode },
      finalAck: wrote ? wrote.finalAck === true : null, finalAckSource: wrote ? wrote.finalAckSource : null,
      // ★★ RUN 201 (run 40 / FEEDBACK39 2.4): a FIRST write of a card read settlement.record:{rev:2, mode:"supersede"} and
      // looked like an overwrite of something that was never there. rev is the record version counter; the count of writes
      // this CALL made is a separate fact and is printed as such.
      revMeans: 'rev is the RECORD version counter, not a count of the writes in this call: a card that already existed and is settled here reads rev 2 because the settlement is the second write of that same record',
      means: 'a ruling settlement edits the probability rule L53 settles and records the ruling — it is not a card rewrite',
      // ★ RUN 238 / FEEDBACK61 C: `p` is the settled probability; a numeric `value` line is somebody's estimate and is NOT
      // rewritten by a settlement. When the two disagree the receipt says so instead of leaving two numbers on one card.
      staleValueLines,
      staleValueLinesMeans: staleValueLines.length === 0
        ? 'this card carries no numeric `value` line that disagrees with the settled p, so there is exactly one probability on it'
        : 'this card also carries numeric `value` line(s) ' + staleValueLines.join(', ') + ' that a settlement does NOT rewrite: `p` is the settled probability (rule L53), `value` is the estimate somebody wrote — read the settlement for the number that counts, and correct the value line deliberately if it is meant to agree',
    },
  }
}

function gatedCardHandler(toolName) {
  const inner = kitCardHandler(toolName)
  // ★★ RUN 206: ASYNC because the p=1 gate now READS the filed ruling cards (a debate can settle with typed rulings and
  // not only with motions). Every caller of a pack handler already awaits (`host-pack-tools.js:314`), so this is the same
  // entry point with one more await inside — no caller changes.
  return async function handler(args = {}, ctx = {}) {
    const kernel = ctx && ctx.kernel
    const records = recordsOf(kernel)
    const track = has(args.track) ? str(args.track) : cardTrackOf(toolName)
    const cardId = has(args.id) ? str(args.id) : null
    // ★★★ RUN 249 (F-05, MEASURED on the 69th real-machine run): `expand rec-21` came back with writer/by == "argument"
    // — a FIELD-SOURCE word had been written into the AUTHOR column. The settlement used to fall back to the literal
    // string "argument" whenever the call named no member, so the ledger said a card was written by a word that means
    // "this value came from the arguments". Who wrote a row is a PERSON (or unknown), never a source label. The caller is
    // knowable from the call context (`ctx.callerMember`, resolved by host-pack-tools.js), so resolve it here and let
    // settleRulingOnCard fall back to the RULING's own signer (a chair's debate_ruling carries `by`) before giving up.
    const by = has(args.member) ? str(args.member)
      : ((typeof ctx.callerMember === 'string' && ctx.callerMember.trim() !== '') ? ctx.callerMember.trim() : null)
    // ★ WAVE 2 (audit C5): `p` is the card's CONCLUSION and must be a LITERAL JSON number — `Number(args.p)` turned
    // "0.6", true and "" into plausible values, so the caller could not tell whether the face read its estimate or
    // invented one.
    if (args.p !== undefined && args.p !== null && (typeof args.p !== 'number' || !Number.isFinite(args.p))) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'p must be a literal JSON number (0..1); this call passed ' + JSON.stringify(args.p) + ' (' + typeof args.p + ')',
        'pass p:0.6 — not p:"0.6" and not p:true; a coerced conclusion is a conclusion nobody stated')
    }
    // ★ AUDIT C6b (rule L14: 「登记即定稿，之后不再更改（locked）」): declaring the proof complete used to change
    // NOTHING — the same card id could be rewritten the next minute, so "final" was a word in a receipt. A card whose
    // recorded proofState is complete is now locked: any later write to that id is refused BY NAME, and the correction
    // path is a NEW card id (a changed proposition is a different proposition, and the locked one stays as history).
    // The ONE internal exception is the fidelity conclusion below, which is not an edit of the card's content but the
    // machine taking the card from p<1 to the p=1 its passed Lean run already justifies (it passes `fidelity_conclude`,
    // a key the tool schema does not publish, so no caller can reach it).
    // ★★ RUN 152 (real machine, run 2, agent feedback F1 — a DEADLOCK the framework itself created):
    // a card whose proof is registered complete is locked (rule L14). But rule L53 requires the framework to tell the
    // card's holder「请把相应命题卡的布尔概率改为该概率值」— and `vibe_v5_verdict_final`'s own `correction.call` is exactly
    // `vibe_v5_record_proposition { id, p, debate_ruling }`. Measured: every such call was refused `VMU_STATE card "rec-12"
    // is locked`, so the instructed repair was impossible and the proposition could never reach p=1 or the Verified
    // track. The lock protects the PROOF CONTENT ("登记即定稿" — the written proof is final); the probability is what the
    // ruling settles, and L53 makes settling it a required act. So a write that carries a `debate_ruling` is admitted as
    // a SETTLEMENT — and only as one: it must set p to the ruling's own value, and it may not touch the proof fields.
    // Every other write to a completed card stays refused by name.
    const rulingSettlement = args.debate_ruling !== undefined && args.debate_ruling !== null ? args.debate_ruling : null
    if (rulingSettlement !== null) {
      const settled = typeof rulingSettlement === 'object' && !Array.isArray(rulingSettlement) ? rulingSettlement : null
      const value = settled && settled.value !== undefined && settled.value !== null ? Number(settled.value) : null
      if (settled === null || value === null || (value !== 0 && value !== 1)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'debate_ruling must be an object carrying the ruled value (0 or 1)',
          'pass debate_ruling:{ value: 1|0, mode, n, decided: true, meeting, by } — the shape `vibe_v5_verdict_final` prints in its `correction.call`')
      }
      if (!has(args.p) || Number(args.p) !== value) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a ruling settlement must set p to the ruled value (' + String(value) + ')',
          'pass p:' + String(value) + ' together with debate_ruling:{ value: ' + String(value) + ', … } — the settlement is the ruling\'s own number, not a new estimate')
      }
    }
    if (cardId !== null && args.fidelity_conclude !== true && rulingSettlement === null) {
      const lockedRow = rowOrNull(records, cardId)
      if (lockedRow) {
        const lockedParsed = parseCardBody(str(lockedRow.body))
        const lockedState = lockedParsed && lockedParsed.fields && lockedParsed.fields.proofState !== undefined
          ? str(lockedParsed.fields.proofState).trim() : ''
        // ★ RUN 210: a card registered complete with a pointer that does NOT resolve carries `proofLockDeferred` — the lock
        // is what would make the bad pointer permanent, so it is deferred until the pointer really lands.
        const lockDeferred = lockedParsed && lockedParsed.fields && lockedParsed.fields.proofLockDeferred !== undefined
          ? str(lockedParsed.fields.proofLockDeferred).trim() : ''
        if (lockedState.toLowerCase() === PROOF_STATE_COMPLETE && lockDeferred === '') {
          throw refuse('VMU_STATE',
            'card "' + cardId + '" is locked: its proof was registered as complete, so the card is final and no later write may change it',
            'a completed card is NOT rewritten — write the correction under a NEW card id (a different claim is a different card) and keep the locked card as history; if the card must be promoted into the verified track, use `vibe_v5_verified_promote` (promotion is not a card edit); if a debate has SETTLED this card, settle its probability with the ruling (pass p plus debate_ruling:{value, mode, …} — rule L53 makes that edit the framework\'s own instruction, so it is admitted on a locked card) and promote it afterwards')
        }
      }
    }
    // ★★★ RUN 240b (实测于全量门禁 `tests/vmu-run153-real-run-fixes.test.mjs` §1j): this guard sits BEHIND the rule-L14 lock,
    // because a card whose proof is registered complete is already refused by name (`VMU_STATE ... is locked`) and that
    // broader fact must keep its own sentence. What this guard adds is the case the lock does NOT cover: an UNLOCKED card
    // that is already settled, where a merge write used to change the probability in place and quietly un-settle it.
    // ★★★ RUN 240 (live run 63 / FEEDBACK63 1.2, MEASURED): THE SETTLEMENT GUARD PROTECTED LINES, NOT THE READING.
    // Run 63 settled a card (p=1 plus a `- debateRuling：` row), then re-wrote it with `bodyMode:"merge"` and `p:0.95`:
    // the ruling row survived, the receipt honestly said `ok:true, settled:false`, and the card was quietly undecided
    // again — the one dimension the destructive-write guard did not cover was the PROBABILITY, because a merge changes
    // the *value* of the `p` line instead of deleting it. So un-settling a card now has to be NAMED by the caller:
    // settle it again with the ruling that decides it (rule L53), or pass `confirmDestructive:true` to say the settled
    // reading is being withdrawn on purpose. A correction that only changes `value`/`motive` does not trip this at all.
    if (rulingSettlement === null && cardId !== null && typeof args.p === 'number') {
      const prevRow = rowOrNull(records, cardId)
      if (prevRow !== null) {
        const prevProj = cardProjectionOf(records, cardId)
        const hadRulingLine = /^- *debateRuling *[：:]/m.test(String(prevRow.body === undefined || prevRow.body === null ? '' : prevRow.body))
        const wasSettled = hadRulingLine && prevProj !== null && (prevProj.p === 1 || prevProj.p === 0)
        if (wasSettled && Number(args.p) !== prevProj.p && args.confirmDestructive !== true) {
          const settledRefusal = refuse('VMU_RECORD_SETTLEMENT_REWRITE',
            'card "' + cardId + '" is SETTLED (p=' + String(prevProj.p) + ' with a debateRuling row); this write sets p=' + String(args.p) + ', which would leave the card undecided while the ruling row still sits in its body',
            'THREE reachable paths: (1) if a ruling really changed the probability, settle it with the ruling — pass p:' + String(args.p) + ' TOGETHER WITH debate_ruling:{value:' + String(args.p === 0 ? 0 : 1) + ', mode:"unanimous", meeting:"<a meeting id>", …} and the write is admitted as a settlement; (2) if you only meant to correct the text beside the probability, send the SAME p the card already carries (p=' + String(prevProj.p) + ') — that is admitted, because a write that leaves the reading where it was declares nothing new (`p1GateSkipped`); p is a REQUIRED parameter, so it cannot be omitted; (3) if withdrawing the settled reading IS the intent, pass confirmDestructive:true and the receipt will say the card is no longer settled — that is a different claim, not a correction, and it must be said out loud')
          // ★ RUN 242 (FEEDBACK65 1.5): A REFUSAL THAT STOPS BEFORE TOUCHING THE BODY MUST SAY SO, or "no
          // bodyLinesDropped key" reads as "the body was processed and nothing was lost" (one of them is a promise and
          // the other is silence). MEASURED (run 65): this refusal carried none of the three body keys while a MERGED
          // write on the same card carried all of them.
          settledRefusal.bodyModeUsed = 'refused'
          settledRefusal.bodyLinesDropped = null
          settledRefusal.bodyLinesAdded = null
          settledRefusal.bodyLinesMeans = 'NOT PROCESSED: this write was refused before the body stage, so no card line was examined, added or dropped. `null` here means "not reached", never "nothing was lost"'
          throw settledRefusal
        }
      }
    }
    // 它不构成证明 —— 证据层在 `verification-gates.js` 的 `debateSubjectGate`（Lean 通过 或 verified 定论行）。
    // 两个别名收在这里，调用方不必知道 kit 的 payload 机制；只给 proofRef 不给状态 ⇒ 一律记 'draft'
    // （"只写了个引用"不能被读成"已经写完"）。
    // ★ PHASE 12 / B6 声明层：卡上的 `proofRef`/`proofState` 是**作者自述**（"我的证明写在哪、写完了没有"）。
    // ★★★ RUN 210 (run 47 / FEEDBACK46 1.3, MEASURED): what this write had to DOWNGRADE, if anything.
    let proofStateDowngraded = null
    // ★★★ RUN 2699 (F75-04): the ONE measurement of this write's pointer — taken here, reused by the gate and by every
    // pointer-state exit below, so "did this write check the file" has one answer.
    let proofRefReading = null
    if (has(args.proof_ref) || has(args.proof_state)) {
      // ★ WAVE 2 (audit C6a): the value is CASE-FOLDED to the two words the face publishes — "COMPLETE" was rejected
      // by the old string comparison while "complete" was accepted, so the same state read as an unknown word.
      const state = has(args.proof_state) ? str(args.proof_state).trim().toLowerCase() : ''
      if (state && state !== 'complete' && state !== 'draft') {
        throw refuse('VMU_INVALID_ARGUMENT', 'proof_state must be "complete" or "draft"; got "' + state + '"',
          'pass proof_state:"complete" only if the proof/refutation is finished — it is a self-report: a debate accepts the card with a finished `proof_ref` registration (the debaters judge its content) or with Lean/verified evidence')
      }
      const payload = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload) ? Object.assign({}, args.payload) : {}
      // ★★ G7 AUDIT (F-135a): the write VALIDATED `lean_job` and then dropped it — the later reader (and the
      // formalisation gate of `vibe_v5_verdict_final`) could only say "names no lean_job at all" about a card whose
      // author had named one. A field that decided the write's legality must survive the write.
      if (has(args.lean_job)) payload.leanJob = str(args.lean_job)
      if (has(args.lean_conformance)) payload.leanConformance = str(args.lean_conformance)
      if (has(args.proof_ref)) payload.proofRef = str(args.proof_ref)
      if (state) payload.proofState = state
      else if (has(args.proof_ref) && !has(payload.proofState)) payload.proofState = 'draft'
      args = Object.assign({}, args, { payload })
      // ★★★ RUN 210 (run 47 / FEEDBACK46 1.3, MEASURED): run 47 registered a card with proof_state:"complete" whose
      // `proof_ref` pointed at a file that DID NOT exist yet. The receipt said so (pointerCheck.exists:false) — and then
      // the card LOCKED (rule L14), so the pointer could never be corrected: "I am finished" became "I am final, and
      // wrong". A complete self-report whose OWN pointer does not resolve is recorded as DRAFT instead: the card stays
      // writable, the author can fix the pointer, and the receipt names the downgrade instead of burying it in a note.
      // ★ RUN 210 (narrowed by the RUN 210 regressions): the DECLARATION stays exactly as the author wrote it — turning
      // "complete" into "draft" here would ALSO change what the debate gate sees (it admits a card whose author declared a
      // finished proof, shape-checked), and that is not this fix's business. What must not happen is the LOCK: a complete
      // card is locked by L14, and locking it on a pointer that resolves to NOTHING makes the pointer uncorrectable.
      // So the write records `proofLockDeferred` (the reason) and the lock check below skips a card that carries it.
      if (payload.proofState === PROOF_STATE_COMPLETE && payload.proofRef !== undefined) {
        // ★★★ RUN 2699 (F75-04): ONE reader for the pointer. Before, only `ok===true && exists!==true` downgraded, so an
        // absolute path, an escape, or a pointer naming a DIRECTORY was recorded as `resolved` although nothing resolved;
        // and a kernel without `resolvePointer` did not measure at all yet still printed `resolved`. Now the measurement is
        // always taken (the reading records "not checked" honestly) and ANY checked and unresolved pointer defers the lock.
        const pointerWord = str(payload.proofRef).trim()
        proofRefReading = proofRefReadingOf(kernel, pointerWord)
        if (proofRefReading.checked === true && proofRefReading.resolved !== true) {
          const reasonWord = String(proofRefReading.reason || 'missing')
          proofStateDowngraded = {
            kind: 'lock-deferred', reason: reasonWord,
            pointer: String(proofRefReading.relativePath === null || proofRefReading.relativePath === undefined ? pointerWord : proofRefReading.relativePath),
          }
          payload.proofLockDeferred = 'pointer:' + reasonWord
        }
      }
      args = Object.assign({}, args, { payload })
    }
    // ★ AUDIT C6a (rule L14: 「只有当自己真正知道怎么证明证伪时才开始写正式证明或证伪字段下内容……只有命题卡中含有
    // 正式证明或证伪内容（且已经写完了而非半成品）才能用于后续辩论」 + prompt rule 10's promise 「归档 Lean 通过证据」):
    // `proof_state:"complete"` used to be accepted with NOTHING behind it — a self-report was enough to make a card look
    // debate-ready. The state is now admitted only when the SAME write carries Lean registration: a `lean_job` that the
    // kernel's Lean face records as PASSED, or a `lean_conformance` decision (the fidelity path's own registration), or
    // the card already sits on the verified track (someone already judged it). The declared value can also arrive inside
    // `payload` (the back-compat shape), so both spellings are read here.
    const declaredProofState = (() => {
      const direct = has(args.proof_state) ? str(args.proof_state).trim() : ''
      if (direct) return direct
      const p = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload) ? args.payload : null
      return p && p.proofState !== undefined && p.proofState !== null ? str(p.proofState).trim() : ''
    })()
    const declaredProofStateFolded = declaredProofState.toLowerCase()
    if (declaredProofStateFolded === PROOF_STATE_COMPLETE) {
      const leanRegistered = leanEvidenceOf(kernel, args)
      const alreadyVerified = cardId === null ? null : verifiedRowOf(records, cardId, kernel && kernel.fidelity)
      const leanPassed = !!(leanRegistered && leanRegistered.passed === true)
      // ★ WAVE 2 (audit C6a, tightened): a `lean_conformance` word alone is a CLAIM — presence used to satisfy this gate.
      const conformanceWord = has(args.lean_conformance) ? str(args.lean_conformance).trim() : ''
      // ★★ G7 AUDIT #2 (C4, rule L14): the rule admits a card 「含有正式证明或证伪内容…」 — a WRITTEN proof. Demanding a
      // Lean job on top made that path unregistrable: proof_ref + complete was refused, complete was required for debate
      // ⇒ a text proof could never become a debate object. The registration is the written proof the author points at;
      // Lean stays the STRONGER evidence (machine-checked) and p=1 still needs the sanctioned sources below.
      const declaredProofRef = has(args.proof_ref) ? str(args.proof_ref).trim() : ''
      // ★★★ G7 AUDIT #8 (G4): the gate used to accept a FAILED `lean_job` beside a conformance word: `leanRegistered`
      // was non-null (so the "no job" branch was skipped) and the conformance word satisfied the other branch — a card
      // could be locked as `complete` on evidence the framework itself had measured as not passed. A conclusion the
      // kernel measured as failed is not evidence of completeness, so it is refused by name with the job's state.
      if (leanRegistered && leanPassed !== true) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'lean_job "' + String(leanRegistered.jobId || '') + '" did not pass (state: ' + String(leanRegistered.state || 'unknown') + '), so it cannot support proof_state "complete"'
          + (cardId === null ? '' : ' (card ' + cardId + ')'),
          'settle that job until it reports passed:true (`vibe_v5_lean_job { jobId }`), or point the card at the written proof with `proof_ref`, or write the card with proof_state:"draft"')
      }
      if (!leanPassed && conformanceWord !== '' && !leanRegistered) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'lean_conformance "' + conformanceWord + '" is a claim, not evidence: the same write names no `lean_job` the kernel could read as PASSED'
          + (cardId === null ? '' : ' (card ' + cardId + ')'),
          'pass lean_job:"<jobId of a settled, passed Lean run>" together with lean_conformance, or register the run first with `vibe_v5_lean_run`')
      }
      if (!leanPassed && conformanceWord === '' && !alreadyVerified && declaredProofRef === '') {
        throw refuse('VMU_INVALID_ARGUMENT',
          'a card may not declare proof_state "complete" without evidence: this write carries no `proof_ref`, no `lean_job` pointing at a settled, PASSED Lean run, and no `lean_conformance` registration'
          + (cardId === null ? '' : ' (card ' + cardId + ')') + ' — a card may not enter debate on a declared-complete proof with no Lean registration',
          'point the card at the finished proof with `proof_ref` (the rule admits a written proof:「含有正式证明或证伪内容」), or register Lean evidence: `vibe_v5_lean_run { file:"Formal/<name>.lean", statement:"…" }` → `vibe_v5_lean_job { jobId }` until passed:true, then write the card with lean_job:"<jobId>" (a `lean_conformance` word may travel WITH that lean_job, but it cannot replace it)')
      }
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
    // ★★ RUN 198: the gate already computes WHICH ruling admitted the write (`rulingRef`); a receipt that keeps only the
    // route word leaves the reader unable to open what decided the card. Forwarded, not re-derived.
    let p1Ruling = null
    let p1RulingMeans = null
    let p1RulingReading = null
    let p1GateSkipped = null
    let p1GateSkippedMeans = null
    if (toolName === 'vibe_v5_record_proposition' || track === 'propositions') {
      // ★ AUDIT C8 (rule L14: 「那些布尔概率为1的命题卡需标记为已verified」 — the read face's `verifiedRef` was
      // decoration and NOTHING held a writer to it): p=1 could be written into the propositions track without any
      // conclusion source, and `vibe_v5_record_method {p:1, track:"propositions"}` reached the same track through a
      // second tool that skipped this gate entirely. So the gate is keyed on the RESULTING TRACK, not on the tool name:
      // any p=1 write into the propositions track must name one of the four sanction来源 (which is what the eventual
      // `vibe_v5_verified_promote` will record as the mark), and the refusal names the promote call.
      // The three evidences the rule accepts. `debate` and `lean` come from the CALLER's args (a card write cannot go
      // and hold a debate); `verified` is read from the records face, so it is not claimable by argument at all.
      const evidence = { verified: verifiedRowOf(records, cardId, kernel && kernel.fidelity),
        debate: debateEvidenceOf(args), lean: leanEvidenceOf(kernel, args), literature: literatureEvidenceOf(args) }
      // `card` carries the id for evidence matching and the truncation FACT, but NOT the old p: the value under judgement
      // is the one being written (p1Intent:95 prefers card.p, so handing it the stored row would judge yesterday's value).
      const stored = cardProjectionOf(records, cardId)
      const storedP = stored && stored.p !== undefined && stored.p !== null ? Number(stored.p) : null
      const card = cardId === null ? null : { id: cardId, bodyTruncated: !!(stored && stored.bodyTruncated) }
      // ★★ RUN 201 (run 40 / FEEDBACK39 1.1): resolve the ruling NAME against the institution before the shape gate
      // speaks. A p=1 write that names a ballot nobody voted in is not a badly-typed ruling, it is a card that claims a
      // decision the institution never took — so it is refused here, by name, with the reading in hand.
      if (evidence.debate !== null && evidence.debate !== undefined) {
        const resolution = await rulingNameResolution(kernel, evidence.debate, { cardId })
        if (resolution !== null) {
          if (resolution.ok !== true) {
            throw refuse('VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED',
              'p=1 was refused because the ruling it names cannot be resolved: ' + resolution.means,
              resolution.reason === 'unknown'
                ? (resolution.meetingBallot === true
                  ? 'the id you gave is a MEETING ballot (returned by vibe_vmu_meeting { action:"ballot" }): this gate reads that decision through the MEETING, so cite `meeting:"<meeting id>"` instead of `ballotId` — the box id cannot be looked up here (two faces, two registries), and the meeting tally is where its votes were counted. Or drop the ruling and use vibe_v5_fidelity_conclude, whose conformance ruling writes p=1 itself'
                  : 'pass a name this kernel can read: debate_ruling:{mode:"unanimous", value:1, meeting:"<a meeting id from vibe_v5_meeting>", …} or ballotId:"<a box id from vibe_v5_poll_open>"; or drop the ruling and use the route that actually settles a card — vibe_v5_fidelity_conclude (the chair conformance ruling writes p=1 itself)')
                : 'the ruling must name something THIS kernel holds: read the meeting with vibe_v5_meeting {action:"summary"}, or close the poll box first (vibe_v5_poll_close returns its tally) — this pack publishes NO separate poll-result tool — and pass that id')
          }
          if (resolution.voted !== true) {
            // ★★★ RUN 204 (FEEDBACK41 1.1, second half): "no votes" and "votes nobody counted" are DIFFERENT facts. run 42's
            // card cited a meeting where three seats had voted, but the house stood at present 1/3, so the meeting tallied
            // nothing — the refusal said "0 vote(s) recorded" and the caller spent three calls finding `attend`. When the
            // resolution carries a floor reading that is NOT met, the hint names the floor BEFORE it names the vote route.
            const floorShort = resolution.quorum && resolution.quorum.met === false
              ? 'the meeting it names is not legally seated yet (present ' + String(resolution.quorum.present)
                + ' of required ' + String(resolution.quorum.required) + '), so votes cast into it were RECEIVED but NOT COUNTED — '
                + 'call vibe_v5_meeting {action:"attend"} for the missing seats first, then vote; '
              : ''
            throw refuse('VMU_PACK_V5R_CORE_P1_RULING_UNVOTED',
              'p=1 was refused because the ruling it names holds NO counted votes: ' + resolution.means,
              floorShort + 'a ruling is a decision people made — ' + (resolution.kind === 'ballot'
                ? 'cast votes into that box and close it (vibe_v5_poll_vote then close), then write the card'
                : 'second and vote the motion in that meeting, OR — when the debate settled with TYPED RULINGS instead of motions — have each member file vibe_v5_verdict { meeting, proposition_id, verdict, reason } for this card\'s proposition and name that same (meeting, proposition) here; the filed cards are then read as the decision') + '; or settle the card through vibe_v5_fidelity_conclude, whose conformance ruling carries its own evidence')
          }
          // ★★★ RUN 202: "unanimous" is a claim about a TALLY. If the named decision was split, the name resolves and the
          // ruling is still false — the institute must say that instead of writing the claim (run 40's p=1 landed on a card
          // nobody had ever debated; a 2:1 box would have been the same lie with more effort).
          const mode = str(evidence.debate.mode || '')
          if (mode === 'unanimous' && resolution.unanimous !== true) {
            throw refuse('VMU_PACK_V5R_CORE_P1_RULING_NOT_UNANIMOUS',
              'p=1 was refused because the ruling claims UNANIMOUS while the named decision is not: ' + resolution.means,
              'a unanimous ruling needs a tally where every vote went to one choice — read a meeting back with vibe_v5_meeting {action:"summary"} (a poll box is tallied by closing it: vibe_v5_poll_close), close the vote if it is still open, or settle the card through vibe_v5_fidelity_conclude, whose conformance ruling carries its own evidence')
          }
          evidence.debate.ruling = resolution
        }
      }
      // ★★★ RUN 240 (live run 63 / FEEDBACK63 1.2's other half, MEASURED): a SETTLED CARD COULD NOT BE CORRECTED AT ALL.
      // `p` is one of the four required parameters, so every text correction had to send p=1 again — and a p=1 write
      // without a fresh conclusion source is refused by the gate below (measured on run 63's card: the write that only
      // wanted to fix `value`/`motive` came back as `VMU_PACK_V5R_P1_NEEDS_DEBATE`). The gate exists to stop a card from
      // being DECLARED proven; a write that leaves the probability exactly where the card already had it declares nothing
      // new, so it is admitted — and the receipt says so (`p1GateSkipped`) rather than leaving the reader to infer it.
      const pUnchanged = storedP !== null && typeof args.p === 'number' && Number(args.p) === storedP
      // ★★★ RUN 240b (看到的缺口：`tests/vmu-b3-c8-c10.test.mjs` ④⑥ 在全量门禁里转红): the first version of this skip RETURNED before the
      // p1 reading block, so a text correction on a settled card lost `p1Route`/`p1RouteMeans` altogether — the four-route
      // surface shrank for exactly the writes that had least to hide. A skip is a fact about the GATE, not about whether
      // the reading has a warrant: the route is still computed for the RECEIPT (never refused), and the gate words are kept.
      const pRouteOnly = pUnchanged ? p1Intent({ tool: toolName, args, card, evidence }) : null
      const pGate = pUnchanged
        ? { ok: true, applicable: false, p: storedP,
            p1Route: pRouteOnly !== null && pRouteOnly.p1Route !== undefined ? pRouteOnly.p1Route : null,
            p1RouteMeans: pRouteOnly !== null && pRouteOnly.p1RouteMeans !== undefined ? pRouteOnly.p1RouteMeans : null,
            evidenceForm: pRouteOnly !== null && pRouteOnly.evidenceForm !== undefined ? pRouteOnly.evidenceForm : undefined,
            rulingRef: pRouteOnly !== null && pRouteOnly.rulingRef !== undefined ? pRouteOnly.rulingRef : undefined,
            rulingRefMeans: pRouteOnly !== null && pRouteOnly.rulingRefMeans !== undefined ? pRouteOnly.rulingRefMeans : undefined,
            ruling: pRouteOnly !== null && pRouteOnly.ruling !== undefined ? pRouteOnly.ruling : undefined,
            p1GateSkipped: 'p-unchanged',
            p1GateSkippedMeans: 'this write sets p=' + String(storedP) + ', which is EXACTLY the probability the card already carried, so no new conclusion is being claimed and the p=1 evidence gate does not apply — it guards a change of the reading, not a correction of the text beside it. The card stays settled; if the intent was to move the probability, send a different p and the gate (or the settlement route) applies again' }
        : p1Intent({ tool: toolName, args, card, evidence })
      if (pUnchanged) { p1GateSkipped = pGate.p1GateSkipped; p1GateSkippedMeans = pGate.p1GateSkippedMeans }
      const pRefusal = gateRefuse(pGate)
      if (pRefusal) return pRefusal
      gates.push(pGate)
      p1Form = pGate.evidenceForm === undefined ? null : pGate.evidenceForm
      // ★ B3：回执必须说清本行 p=1 的凭据是**哪一条路**（辩论 / 参考文献 / Lean conform / 已有 verified 行）。
      p1Route = pGate.p1Route === undefined ? null : pGate.p1Route
      p1RouteMeans = pGate.p1RouteMeans === undefined ? null : pGate.p1RouteMeans
      p1Ruling = pGate.rulingRef === undefined ? null : pGate.rulingRef
      p1RulingMeans = pGate.rulingRefMeans === undefined ? null : pGate.rulingRefMeans
      p1RulingReading = pGate.ruling === undefined ? null : pGate.ruling
    }
    // ★ WAVE 2 (audit C6a): WHICH half admitted a "complete" proof_state — a measured Lean run, the caller's
    // conformance word (a claim), or an existing verified row. Evidence of different weight must not print as one word.
    const proofStateEvidence = declaredProofState === '' ? null : (() => {
      const row = cardId === null ? null : verifiedRowOf(records, cardId, kernel && kernel.fidelity)
      const lean = leanEvidenceOf(kernel, args)
      if (lean && lean.passed === true) return { kind: 'lean-job', measured: true, jobId: has(args.lean_job) ? str(args.lean_job) : null, means: 'the kernel read this job as PASSED before the card was written' }
      if (row) return { kind: 'verified-row', measured: true, rowId: row.id === undefined ? null : row.id, means: 'the card already carries a settled verification row' }
      if (has(args.lean_conformance)) return { kind: 'lean-conformance-claim', measured: false, means: 'the caller named a conformance word; this gate cannot verify it — a conformance word is not a measurement' }
      // ★ G7 ROUND 136: the gate above ALSO admits a finished TEXT proof named through `proof_ref` (rule L14). When it
      // does, this field used to stay null — the receipt then said "complete" with no evidence at all, which is the
      // "a claim without its warrant" shape the ledger keeps catching. Shape-checked, not content-checked: say which.
      const refHere = has(args.proof_ref) ? str(args.proof_ref).trim() : ''
      // ★★ RUN 200 (run 39 / FEEDBACK38 1.1): the message told the author to check the pointer itself. The kernel owns
      // the library root and the filesystem, so the receipt can answer instead of instructing: `pointerCheck` carries
      // the resolution this same call performed (absolute / escapes / missing / file), and `pointerCheck.ok` means
      // "the library answered", NOT "the file exists" — the two facts are separate and both are printed.
      const pointerCheck = (refHere !== '' && kernel && kernel.library && typeof kernel.library.resolvePointer === 'function')
        ? kernel.library.resolvePointer(refHere)
        : null
      if (refHere !== '') return { kind: 'proof-ref', measured: false, ref: refHere,
        pointerCheck,
        // ★★★ RUN 211 (run 48 / FEEDBACK47 1.4, MEASURED): the receipt printed `pointerCheck.ok:true` beside
        // `exists:false, reason:"missing"` and the reader took the first field as "resolved". `ok` answers the SHAPE
        // question (well formed + inside the library) and always did; the two facts are now printed under their own
        // names so nobody has to know that.
        pointerCheckWellFormed: pointerCheck === null ? null : pointerCheck.wellFormed === true,
        pointerCheckResolved: pointerCheck === null ? null : pointerCheck.resolved === true,
        pointerCheckFieldsMeans: 'pointerCheck.ok / pointerCheckWellFormed answer "is this pointer WELL FORMED and inside the library root" (true even when the file is missing); pointerCheck.resolved / pointerCheck.exists answer "does the named file exist and is it a regular file". Both are printed because they are different questions',
        pointerCheckMeans: pointerCheck === null
          ? 'this kernel exposes no library pointer resolver, so the receipt can only hand the pointer back'
          : (pointerCheck.exists === true
            ? 'resolved: the pointer names a real file INSIDE the library root (' + String(pointerCheck.relativePath) + ')'
            : 'NOT resolved: ' + String(pointerCheck.reason || 'unknown') + ' — ' + String(pointerCheck.means || '').split(' — ')[0]),
        means: 'the caller pointed the card at a written proof (`proof_ref`); this gate checked only that the reference is non-empty — the content is read by the members in the debate',
        // ★★ RUN 199 (run 39 / FEEDBACK38 1.1, MEASURED): run 39 pointed a card at Members/r-acad/Propos/p-1.md#… while
        // writing that file into the WORKSPACE root instead of the LIBRARY root, and the receipt said nothing — then the
        // card locked (rule L14) and the pointer could no longer be corrected. Two facts now travel with the receipt: the
        // pointer is resolved against the LIBRARY root (not the session cwd), and a complete card is LOCKED.
        pointerNote: 'the pointer is a POINTER, not a resolution: this write does NOT read it. It is relative to the LIBRARY root (the libraryRoot that vibe_v5_read_library prints), NOT to your session working directory — a file you wrote at the workspace root is not there, and read_library would answer libraryCardCount:0 for it',
        // ★★★ RUN 212 (run 49 / FEEDBACK48 1.2, MEASURED): this sentence was printed even when the LOCK WAS DEFERRED, so
        // one receipt said both "the lock is deferred, correct the pointer freely" and "the pointer can never be
        // corrected". Both sentences were generated from the same write; only one of them was true. The note now follows
        // the same fact the lock itself follows — does this card's OWN pointer resolve?
        // ★★★ RUN 251 (F71-4, MEASURED on the 71st real-machine run): the DRAFT card came back with a lockNote that said
        // 「its proof_state says complete」 / 「a card whose proof_state is complete is LOCKED」 while the SAME receipt's
        // `proofState` was "draft". The note was state-blind: it only asked whether the pointer resolved. A note is read as
        // a fact about THIS card, so it now follows the declared state — a draft states draft facts and never borrows the
        // finished-registration branch's words.
        lockNote: declaredProofStateFolded !== PROOF_STATE_COMPLETE
          ? 'this card declares `proof_state:"' + declaredProofState + '"`, a NOT-yet-finished registration, so rule L14 (「登记即定稿」) does not lock it: the card stays writable, this pointer is only a POINTER to a file (this write does not read it, and a later write may correct or replace it)'
          : (pointerCheck !== null && pointerCheck.resolved !== true
            ? 'this card is NOT locked: its `proof_state` says complete, but its OWN `proof_ref` does not resolve inside the library (reason: ' + String(pointerCheck.reason || 'unknown') + '), so the rule-L14 lock is DEFERRED — write the file into the library (or point at a record id) and re-register, or correct the pointer freely; the card stays writable until a pointer that really resolves is registered'
            : 'a card whose proof_state is complete is LOCKED (rule L14: later writes to the same card id are refused), so the pointer cannot be corrected afterwards — check that <libraryRoot>/<pointer-without-anchor> exists BEFORE judging the card, and copy the file into the library tree first if it does not') }
      return null
    })()
    // ★★ RUN 153 (G1): a settlement on an EXISTING card is a PATCH (see settleRulingOnCard). It never reaches the
    // ordinary write, which would rebuild the body from a three-field argument set and erase the card's proof fields —
    // including the `proofState` the lock reads.
    //
    // ★★★ RUN 153 — A CARD THAT DOES NOT EXIST YET IS NOT A SETTLEMENT. The first write of a card may legitimately
    // carry `debate_ruling` (a card born from a debate), and taking the patch path there turned "create this card" into
    // "patch a card nobody wrote" ⇒ VMU_NO_SUCH_OBJECT on a track that had nothing wrong with it. So the patch path is
    // taken only when the row is THERE; a create falls through to the ordinary write (which carries p, and therefore
    // settled) and then gets the same ruling line layered on top by the same patch function — one write, then a patch.
    const cardKind = KIT_CARD_CONFIG[toolName] ? KIT_CARD_CONFIG[toolName].kind : track
    const existing = rulingSettlement !== null && cardId !== null ? rowOrNull(records, cardId) : null
    let res
    let settlement = null
    if (existing !== null) {
      res = settleRulingOnCard({
        records, id: cardId, value: Number(rulingSettlement.value), ruling: rulingSettlement,
        track, kind: cardKind, by, fallbackTitle: has(args.title) ? str(args.title) : null, p1Evidence: p1Form,
      })
      settlement = res && res.settlement ? res.settlement : null
    }
    if (res === undefined) res = inner(args, ctx)
    if (!res || typeof res !== 'object' || Array.isArray(res)) return res
    if (existing === null && rulingSettlement !== null && cardId !== null && res.ok === true) {
      // the create succeeded: layer the ruling onto the row it just wrote (the receipt stays the CREATE receipt, and
      // says the ruling was added as a patch afterwards)
      const patched = settleRulingOnCard({
        records, id: cardId, value: Number(rulingSettlement.value), ruling: rulingSettlement,
        track, kind: cardKind, by, fallbackTitle: has(args.title) ? str(args.title) : null, p1Evidence: p1Form,
      })
      settlement = patched && patched.settlement ? patched.settlement : null
      if (settlement !== null) {
        settlement = Object.assign({}, settlement, {
          createdByThisCall: true,
          writesInThisCall: 2,
          writesInThisCallMeans: 'TWO writes happened in this call: the card was CREATED (that is why rev starts at 1) and the ruling was then laid on the same row as a patch, which is what makes rev 2 — read writesInThisCall, not rev, to know how many times this call touched the record',
        })
      }
    }
    // ★ C8: a p=1 write with a sanctioned route is only half the rule — the card must END UP marked. The receipt says
    // whether the mark is already on the verified track, and if not, it names the ONE call that puts it there.
    const verifiedMark = p1Form === null ? null : (() => {
      const row = cardId === null ? null : verifiedRowOf(records, cardId, kernel && kernel.fidelity)
      return row
        ? { required: true, present: true, rowId: row.id === undefined ? null : row.id }
        : { required: true, present: false, call: 'vibe_v5_verified_promote',
            means: 'p=1 的卡必须带 verified 标记：现在还没有定论行，调用 `vibe_v5_verified_promote {card:"<id>", warrant_kind:"…", …}` 写下它；没有这一行的 p=1 卡在 Verified 轨上不可见' }
    })()
    // ★★★ RUN 221 (run 57 / FEEDBACK56 1.1, MEASURED): A SETTLEMENT IS A PATCH, SO THE PROOF FIELDS TRAVEL BY READ-BACK.
    // run 57 settled `rec-3` (p=1) and the receipt printed `proofState:null`, `proofLockDeferred:false`,
    // `proofGate:null`, `proofStateEvidence:null` — while the SAME receipt's `settlement.preserved` said every line except
    // `p` and the ruling row was "byte-identical". Both statements were about the same card and only one of them was
    // read by the reader: the literal nulls were read as "this card has no proof state any more". A settlement call
    // declares no proof state (it may not touch the proof fields at all), so stamping null is the PATCH talking, not the
    // card. The card is read back after the write and the values are labelled as read back.
    const settlementReadback = (existing !== null && settlement !== null && cardId !== null) ? (() => {
      const row = rowOrNull(records, cardId)
      if (!row) return null
      const parsed = parseCardBody(str(row.body))
      const fields = parsed && parsed.fields ? parsed.fields : {}
      const state = fields.proofState !== undefined ? str(fields.proofState).trim().toLowerCase() : ''
      const deferredWord = fields.proofLockDeferred !== undefined ? str(fields.proofLockDeferred).trim() : ''
      return {
        proofState: state === '' ? null : state,
        proofLockDeferred: deferredWord !== '',
        proofLockDeferredReason: deferredWord === '' ? null : deferredWord,
        rev: row.rev === undefined || row.rev === null ? null : row.rev,
        // ★★★ RUN 252 (F72-8) + RUN 2699 (F75-04): the settlement read-back calls the ONE stored-row reader, and it feeds
        // it a measurement of the stored pointer so the pointer-state word there is a checked reading, not a guess.
        gate: proofGateOfStoredCard(fields, { reading: proofRefReadingOf(kernel, fields.proofRef), source: 'settlement-read-back' }),
      }
    })() : null
    const proofStateOut = settlementReadback !== null ? settlementReadback.proofState
      : (declaredProofState === '' ? null : declaredProofStateFolded)
    // ★★★ RUN 254 (F-73-01): the EFFECTIVE state, from the SAME fold the read face uses (`foldedProofStateOf`). It is a
    // SEPARATE field on purpose: `proofState` above stays the declared value (null when the call declared nothing), and
    // back-filling it with the fold would report a declaration this write never made.
    const proofStateFoldedOut = settlementReadback !== null ? settlementReadback.gate.folded
      : foldedProofStateOf(declaredProofState)
    const proofDeferredOut = settlementReadback !== null ? settlementReadback.proofLockDeferred
      : (proofStateDowngraded === null ? false : true)
    const proofDeferredReasonOut = settlementReadback !== null ? settlementReadback.proofLockDeferredReason
      : (proofStateDowngraded === null ? null : proofStateDowngraded.reason)
    const proofDeferredMeansOut = proofStateDowngraded === null
      ? (settlementReadback !== null && settlementReadback.proofLockDeferred === true
        ? 'READ BACK from the stored row: it carries a deferred lock (' + String(settlementReadback.proofLockDeferredReason || 'reason unreadable')
          + '), which this settlement did not write and may not change — a settlement rewrites only the `p` line and the ruling row'
        : null)
      : "rule L14 locks a card whose proof is registered complete — but this card’s OWN `proof_ref` does not resolve inside the library (" + proofStateDowngraded.reason + "), and locking it would make that pointer uncorrectable. The declaration is recorded AS WRITTEN and the LOCK IS DEFERRED: write the file (or point at a record id) and REGISTER THE CARD AGAIN — the records face mints a NEW row per write, so \"re-register\" means filing a new card, never editing this row's pointer — or correct the pointer in a fresh write before filing: this card stays writable until a pointer that really resolves lands"
    // ★★★ RUN 249 (F-06 / 缺陷 D, MEASURED on the 69th real-machine run): a card written with `proof_state:"draft"` came
    // back `proofGate:{locked:true, why:"the declared proof is registered complete…"}`, while the same receipt carried
    // `proofLockDeferred:"pointer:missing"`. The gate asserted a registration that had not happened. Rule L14
    // 「登记即定稿」 locks a COMPLETE registration, so the gate is a DOUBLE condition — the declared state must BE
    // complete AND its pointer must not have failed to resolve — and every answer now carries a machine-readable
    // `reason` plus the state of the pointer this call actually read (`proofRefState`: resolved|missing|absent|unknown,
    // where `unknown` is the read-back case: a settlement does not re-resolve anything).
    const declaredProofRefWord = (() => {
      if (has(args.proof_ref)) return str(args.proof_ref).trim()
      const p = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload) ? args.payload : null
      return p && p.proofRef !== undefined && p.proofRef !== null ? str(p.proofRef).trim() : ''
    })()
    // ★★★ RUN 2699 (F75-04): the pointer-state word is JUDGED once, from the ONE measurement taken above (or, for a
    // settlement, from the stored-row reader). The four words keep their names; `unknown` now means exactly "not checked".
    const writeProofReading = declaredProofRefWord !== ''
      ? (proofRefReading !== null ? proofRefReading : proofRefReadingOf(kernel, declaredProofRefWord))
      : proofRefReadingOf(null, '')
    const writeProofStateOut = proofRefStateOf({ pointer: declaredProofRefWord, reading: writeProofReading, source: 'write-resolution' })
    // ★★★ RUN 251 (F71-3, MEASURED on the 71st real-machine run): the DEFAULT card (no `proof_state`, no proof fields at
    // all) came back `proofGate:null`, so the one receipt a reader has for "may I still change this card?" answered
    // nothing — measured on run 71's C3: a default draft was filed and the gate was a null. The invariant is now stated
    // unconditionally: a card that is not a finished registration is NEVER locked and ALWAYS names why, and the default
    // path names itself `default-draft` rather than borrowing the declared-draft words (nothing was declared).
    const proofGateOut = settlementReadback !== null
      // ★★★ RUN 252 (F72-8): the settlement read-back branch is the SAME reader the ordinary read face uses
      // (`proofGateOfStoredCard`), not a second copy of the four read-back reasons — a read of a stored row and a
      // read-back after a settlement must never be able to disagree about the same row.
      ? settlementReadback.gate
      : (declaredProofState === ''
        ? { locked: false, reason: 'default-draft',
            why: 'this write declares NO `proof_state` — a card filed without one is a DRAFT (the default), and rule L14 (「登记即定稿」) locks only a finished registration, so this card is NOT locked and stays writable',
            nextMove: null,
            means: 'read proofGate.locked, not `ok`, to answer "is this card locked": the default is a DRAFT, and a receipt that prints proofGate:null leaves that question unanswered (RUN 251 / F71-3)' }
        : (declaredProofStateFolded !== PROOF_STATE_COMPLETE
          ? { locked: false,
              reason: declaredProofStateFolded === 'draft' ? 'declared-draft' : 'declared-not-complete',
              why: 'this write declares the proof as "' + declaredProofState + '", NOT complete: rule L14 (「登记即定稿」) locks only a COMPLETE registration, so this card stays writable',
              nextMove: null,
              means: 'read proofGate.locked, not `ok`, to answer "is this card locked": a draft (or any non-complete state) is NOT locked — a receipt that says locked:true beside proof_state:"draft" would report a registration that never happened' }
          : (proofStateDowngraded === null
            ? { locked: true, reason: 'complete-and-resolved',
                why: declaredProofRefWord !== ''
                  ? 'the declared proof is complete and its own `proof_ref` resolves inside the library'
                  : 'the declared proof is complete and NO `proof_ref` was declared — the registration itself (with the Lean/conformance evidence this write carried) is what rule L14 locks',
                nextMove: null,
                means: 'locked:true means the LOCK is on this row; a later write cannot re-point it - file a new card to change the proof' }
            : { locked: false, reason: 'complete-but-pointer-unresolved',
                why: 'the card is filed AS DECLARED (complete), but its own `proof_ref` does not resolve inside the library (' + String(proofStateDowngraded.reason) + '): rule L14 will not lock a pointer that could never be corrected',
                nextMove: 'write the file into the library (or point at a record id) and REGISTER A NEW CARD - the records face mints a NEW row per write, so this row' + String.fromCharCode(39) + 's pointer cannot be edited',
                means: 'read proofGate.locked, not `ok`, to answer "is this card locked": `ok:true` only says the card was filed' })))
    // ★★★ RUN 224 (run 59 / FEEDBACK58 1.2, MEASURED): run 59 settled a card at p=1 whose `proof_ref` pointed at a file that
    // does not exist (`nope-r222.md`). Every field was true and every one of them was about something else: the receipt said
    // `p1Evidence:"debate-unanimous"` (a DEBATE happened) and `settled:true` (the p line was written), while the card itself
    // still carried `proofLockDeferred:pointer:missing` - so "settled at p=1" and "the proof was never there" sat in one
    // receipt with nothing naming their coexistence. A reader concluded the conclusion was verified. These two fields put the
    // card's OWN gate next to the settlement, in one place, and name the unresolved pointer instead of leaving it in prose.
    // ★★★ RUN 2699 (F75-04): ONE pointer-state word on this receipt. The gate branches above describe the LOCK; the
    // pointer state is the measurement, and a write face that measured the pointer must not defer to a constant it wrote
    // in the branch (that was the second producer). For a settlement the stored-row reader already judged it.
    const proofGateFinal = Object.assign({}, proofGateOut, {
      proofRefState: settlementReadback !== null ? proofGateOut.proofRefState : writeProofStateOut.proofRefState,
      proofRefStateChecked: settlementReadback !== null ? proofGateOut.proofRefStateChecked : writeProofStateOut.proofRefStateChecked,
      proofRefStateMeans: settlementReadback !== null ? proofGateOut.proofRefStateMeans : writeProofStateOut.proofRefStateMeans,
      proofRefStateSource: settlementReadback !== null ? proofGateOut.proofRefStateSource : writeProofStateOut.proofRefStateSource,
    })
    const p1ProofGateOut = p1Form === null ? null : proofGateFinal
    const p1ProofUnresolved = p1Form === null
      ? null
      : (p1ProofGateOut === null ? null : p1ProofGateOut.locked !== true)
    const p1ProofMeans = p1Form === null
      ? null
      : (p1ProofUnresolved === null
        ? 'this settlement wrote the p line, and the card carries no proof declaration to check (proofState is null): p=1 here means the debate agreed, nothing about a proof file'
        : (p1ProofUnresolved === true
          ? 'p=1 was WRITTEN, but the CARD\'s proof is NOT resolved (' + String(p1ProofGateOut && p1ProofGateOut.why ? p1ProofGateOut.why : 'see proofGate') + '): p=1 here means the members agreed and the record was patched - it does NOT mean a proof file was found, read, or verified. The card stays writable for exactly this reason'
          : 'p=1 was written AND the card\'s own proof declaration is resolved inside the library, so rule L14 locks it (the pointer cannot be corrected afterwards)'))
    return Object.assign({}, res, {
      enforced: enforcedOf(gates), enforcedScope: ENFORCED_SCOPE,
      proofStateFrom: settlementReadback === null ? 'declared by this call' : 'READ BACK from the stored row after the settlement patch: this call is a settlement and may not write the proof fields, so `proofState`/`proofGate` describe the CARD, not this call',
      proofState: proofStateOut,
      // ★★★ RUN 252 (F72-2, MEASURED on the 72nd real-machine run): the DEFAULT receipt carried `proofState:null` with
      // no sentence saying what that null MEANS, so "is this card a draft" could not be answered from the receipt at all.
      proofStateMeans: settlementReadback !== null
        ? 'READ BACK from the stored row: `null` means the row states NO `proof_state` line, i.e. the card is a DRAFT (the default). This settlement wrote no proof fields — the value describes the CARD, not this call'
        : (declaredProofState === ''
          ? 'this call declared NO `proof_state`, so `proofState` is null and the card is a DRAFT (the default): null is the honest value for "nothing was declared", and `proofGate.reason:"default-draft"` is the machine-readable form of the same fact'
          : 'this call DECLARED `proof_state:"' + declaredProofState + '"`; `proofState` is that declared value (proof_ref is a POINTER, and declaring "complete" is not the same as the institute verifying the proof)'),
      // ★★★ RUN 254 (F-73-01, MEASURED on the 73rd real-machine run): the task asked "is this card a draft" and the receipt
      // answered only `proofState:null`. Both facts now travel: the declared value (null, honest) AND the EFFECTIVE state
      // (the default draft, folded). `foldedMeans` says plainly that this is NOT a declaration, so no reader mistakes it
      // for one, and no reader has to know the default rule to answer "is this a draft".
      proofStateFolded: proofStateFoldedOut,
      foldedMeans: settlementReadback !== null
        ? 'READ BACK from the stored row: the EFFECTIVE state is "' + proofStateFoldedOut + '" — folded from what the row declares (a row that declares NO `proof_state` folds to the DEFAULT "draft"). This is NOT a declared value: `proofState` is the declaration, `proofStateFolded` is what rule L14 actually reads'
        : (declaredProofState === ''
          ? 'the EFFECTIVE state is "' + proofStateFoldedOut + '" — when a call declares NO `proof_state`, the rules fold the card to the DEFAULT "draft". This is NOT a declared value: `proofState` is null on purpose (nothing was declared), and `proofStateFolded` answers "is this card a draft" without asking the reader to know the default (RUN 254 / F-73-01)'
          : 'the EFFECTIVE state is "' + proofStateFoldedOut + '", folded from the value this call DECLARED (`proof_state:"' + declaredProofState + '"`); folding only normalises case/whitespace when a state was declared, so here `proofState` and `proofStateFolded` agree'),
      proofLockDeferred: proofDeferredOut,
      proofLockDeferredReason: proofDeferredReasonOut,
      proofLockDeferredMeans: proofDeferredMeansOut,
      // ★★★ RUN 217 (run 54 / FEEDBACK53 ①-3, MEASURED): a first write of a card declared `proof_state:"complete"` with a
      // pointer that does not resolve came back `ok:true` + `proofState:"complete"` + `proofLockDeferred:true`. Every field was
      // true, and the receipt still read like "rule L14's lock is on". `ok` answers "was the card filed"; nothing answered
      // "is it locked". This block answers exactly that, in one value, and names the one move that can lock it.
      proofGate: proofGateFinal,
      // ★★★ RUN 252 (F72-2): the gate answers "locked?", this note answers "why, in a sentence that travels with the
      // receipt" — including the DEFAULT draft, where the receipt used to carry no note at all.
      lockNote: proofLockNoteOf({ gate: proofGateFinal, declaredState: proofStateOut }),
      // ★★★ RUN 249 (F-06/D) + RUN 2699 (F75-04): the state of the pointer this call actually MEASURED, next to the gate,
      // so "is it locked" and "was the pointer checked, and what did it name" are both readable from one receipt. The word
      // is one of resolved|missing|absent|unknown, and `unknown` now means exactly "NOT CHECKED" (with the next move in
      // `proofRefStateMeans` and the read-out path in `proofRefStateSource`).
      proofRefState: proofGateFinal.proofRefState,
      proofRefStateChecked: proofGateFinal.proofRefStateChecked,
      proofRefStateMeans: proofGateFinal.proofRefStateMeans,
      proofRefStateSource: proofGateFinal.proofRefStateSource,
      proofStateEvidence: settlementReadback === null ? proofStateEvidence : null,
      proofStateEvidenceMeans: settlementReadback === null ? undefined
        : 'null ON PURPOSE: a settlement verifies nothing, so there is no evidence block for THIS call to report - the card\'s own proof lines are unchanged (see settlement.preserved) and were read back into proofState/proofGate',
    }, settlement === null ? {} : { settlement },
    p1GateSkipped === null ? {} : { p1GateSkipped, p1GateSkippedMeans },
    p1Form === null ? {} : { p1Evidence: p1Form, p1RulingRef: p1Ruling, p1RulingMeans, p1RulingReading, verifiedMark, p1ProofGate: p1ProofGateOut, p1ProofUnresolved, p1ProofMeans },
    p1Route === null && p1RouteMeans === null ? {} : { p1Route, p1RouteMeans })
  }
}

/**
 * ★ ③ THE VERIFIED TRACK'S ONLY WRITE PATH. `promoteVerified` (in ./verified.js) had NO caller — a writer nobody could
 * reach. It needs a JUDGE (`warrant.id` + `warrant.kind`) and it refuses by name a card whose p is not exactly 1 or 0, a
 * truncated card, and a proof the fidelity registry withdrew. This face mints nothing: it forwards the warrant the
 * caller names, so "which debate decided this" stays answerable from the record.
 */
function toolVerifiedPromote(args = {}, { kernel, exec } = {}) {
  const records = recordsOf(kernel)
  const sourceId = has(args.card) ? str(args.card) : (has(args.id) ? str(args.id) : '')
  if (!sourceId) {
    throw refuse('VMU_INVALID_ARGUMENT', 'promote needs the proposition card it promotes',
      'pass card:"<records id of a propositions/proposition card whose p is exactly 1 or 0>"')
  }
  // ★★ RUN 179 (run 24 / FEEDBACK24 F24-4): A PROMOTION MADE WITHOUT `member` HAD NO AUTHOR. The verified row went to
  // the records face with `by: null`, the fold wrote it that way, and the next boot's hydration turned the missing
  // author into the literal verb `restore` (fixed in the kernel as well) — so the row read `owner:"restore"` once and
  // `owner:null` another time for the SAME fact. The face now records who actually called it (the seat whose turn/exec
  // made the call!), and leaves it null only when the caller is the office, which is a real absence of a seat.
  const member = has(args.member) ? requireSeat(kernel, args.member, 'verified promote').id : callerFromTurn(kernel, exec)
  const stored = cardProjectionOf(records, sourceId)
  const writerGate = singleWriter({ records, cardId: sourceId, by: member, writer: 'promoteVerified', track: VERIFIED_TRACK })
  const writerRefusal = gateRefuse(writerGate)
  if (writerRefusal) return writerRefusal
  const warrantKindGiven = has(args.warrant_kind) ? str(args.warrant_kind).trim() : ''
  // ★★ RUN 186 (run 29 / FEEDBACK29 D4): a member passed warrant_kind:"debate" — the institution's own ruling receipt
  // calls the form `debate-unanimous`, and the refusal listed the three legal forms while silently dropping the short
  // word the caller had just read elsewhere. A vocabulary that half-accepts a word is a trap: either refuse the concept
  // or accept the address. The three forms stay the CONTRACT; their short names are ADDRESSES for it, and the receipt
  // records which one was read (`warrantKindGiven` + `warrantKindMeans`) so nothing is rewritten behind the caller.
  const KIND_ALIAS = {
    debate: 'debate-unanimous', ballot: 'debate-unanimous', 'debate-unanimity': 'debate-unanimous',
    lean: 'lean-conformance', literature_reference: 'literature',
  }
  const warrantKind = KIND_ALIAS[warrantKindGiven] || warrantKindGiven
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
      'pass warrant:"<debate/ballot ruling id>" with warrant_kind:"debate-unanimous" — on the lean-conformance route (lean_job + lean_conformance:"conform") the warrant is STILL required: it is the conformance ruling id that turned the passed job into a conclusion')
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
    // ★★ RUN 186 (D4): the receipt answers the question the caller actually asked — "did the word I typed count, and
    // does the row say the same thing?" A short address that is silently rewritten is indistinguishable from a typo
    // that happened to work, so the given word and the canonical form are both named.
    warrantKindGiven,
    warrantKindAliased: warrantKindGiven !== warrantKind,
    warrantKindMeans: warrantKindGiven === warrantKind
      ? 'the form you passed is the contract word, and the row records it unchanged'
      : 'you passed the short address "' + warrantKindGiven + '"; the CONTRACT form is "' + warrantKind + '" and the row records that. The three contract forms are debate-unanimous, lean-conformance and literature — the short words debate/ballot/lean/literature_reference are only ways to say them',
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
  // ★★★ RUN 158 (run 6 / N3 — rule L53): the rule takes the final ruling AFTER the debate meeting ends, but `close()`
  // archives the meeting, so this read used to answer `VMU_NO_SUCH_OBJECT` for exactly the meeting the rule names. The
  // archive is readable; the chair is still the chair, and the receipt says which of the two the ruling was taken in.
  const view = kernel.meetings.meetingView({ meeting, allowArchived: true })
  const meetingArchived = view && view.archived === true
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
  // ★★ G7 AUDIT C5 (rule L16) — THE FORMALISATION SWITCH GETS ITS CONSUMER. `vmu.math.formalVerify:"require"` used to be
  // read only by the Lean face (`kernel/lean.js` policy) and echoed back by `vibe_v5_fidelity_conclude`, while the
  // teaching promised 「缺 Lean 结果或 blocked 记录则裁定不生效」. A promise the ruling path never keeps is worse than no
  // promise: the chair could sign a final ruling on a proposition whose Lean run had never passed, and the receipt looked
  // identical to a formalised one. The ruling now refuses BY NAME, and the refusal names which of the two evidences the
  // card lacks — a "blocked" decision is the rule's own escape hatch for a claim that cannot be formalised at all.
  const formalPolicy = formalVerifyPolicyOf(kernel)
  if (formalPolicy && formalPolicy.requireFormal === true) {
    const cardRow = rowOrNull(kernel && kernel.records, propositionId) || null
    const proj = cardProjectionOf(kernel && kernel.records, propositionId) || null
    // F-135a: the job id may live on the row column OR in the card body the write persisted — both are the author's.
    const leanJobId = cardRow && cardRow.lean_job !== undefined && cardRow.lean_job !== null ? str(cardRow.lean_job)
      : (proj && proj.leanJob ? str(proj.leanJob) : '')
    const leanVerdict = leanJobId ? leanPassedOf(kernel, leanJobId) : null
    const leanOk = !!(leanVerdict && leanVerdict.passed === true)
    const formalDecision = proj && proj.formal && proj.formal.decision ? str(proj.formal.decision) : ''
    if (!leanOk && formalDecision !== 'blocked') {
      throw refuse('VMU_PACK_V5R_FORMAL_REQUIRED',
        'this institute requires formalisation (vmu.math.formalVerify:"require") and ' + propositionId
          + ' has neither a PASSED Lean run nor a recorded "blocked" decision'
          + (leanJobId
            ? ' — its lean_job "' + leanJobId + '" has not passed'
              + (leanVerdict ? ' (state: ' + str(leanVerdict && leanVerdict.state) + ')' : ' (this deployment exposes no Lean face, so no job can be read)')
            : ' — it names no lean_job at all'),
        'run vibe_v5_lean_run on the card\'s file, wait for vibe_v5_lean_job to read passed:true, then rule; or, when the claim cannot be formalised at all, record the "blocked" decision the rule allows so the ruling can say why. The office sets vmu.math.formalVerify (off/encourage/require)')
    }
  }
  // ★★★ TASK-12 / RUN 31 — THE SUBMISSIONS ARE COLLECTED HERE, AND THE CHAIR NO LONGER HAS TO TYPE THEM.
  // Before this, `verdicts` was REQUIRED, so the only way to produce a ruling was for the chair to write every
  // member's number itself — and `coverage.complete:true` then measured the roster, not a submission (run 31: the
  // receipt said complete while no member had submitted anything). The members now file their own rulings with
  // `vibe_v5_verdict { meeting, proposition_id, verdict, reason }`, and this face READS THEM BACK from the library.
  // `verdicts` stays available (a member with no card, a number the chair must record) — but an explicit empty array
  // is still refused, because "I passed none" and "I passed an empty set" are different mistakes.
  const filed = await rulingSubmissionsOf(kernel, { meeting, proposition: propositionId })
  // ★★★ RUN 206 (run 44 / FEEDBACK43 1.4, MEASURED): an OBJECT of verdicts (`{"r-acad":1,"r-1":1,"r-2":1}`) was
  // silently read as "no verdicts passed", so three filed numbers came back as `VMU_RULING_NO_SUBMISSIONS`. A shape the
  // face does not read is now refused BY NAME with the shape it does read — the difference between a caller fixing their
  // call and a caller re-reading the same three cards forever.
  if (args.verdicts !== undefined && args.verdicts !== null && !Array.isArray(args.verdicts)) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'verdicts must be an ARRAY of {member, p, reason} rows; you passed ' + (typeof args.verdicts === 'object'
        ? 'an OBJECT'
        : (typeof args.verdicts === 'string' && /^[[{]/.test(String(args.verdicts).trim())
          ? 'a STRING that reads as a SERIALIZED ' + (String(args.verdicts).trim().charAt(0) === '[' ? 'ARRAY' : 'OBJECT')
            + ' (' + (String(args.verdicts).trim().length > 60 ? String(args.verdicts).trim().slice(0, 60) + '…' : String(args.verdicts).trim()) + ') — the tool schema turns an object into text, and an object is NOT read as a tally'
          : ('a ' + typeof args.verdicts))),
      'pass verdicts:[{ member:"r-1", p:1, reason:"…" }, …] — or omit verdicts entirely and let this face adopt the ruling cards the members filed with vibe_v5_verdict { meeting, proposition_id, verdict, reason }; an object is NOT read as a tally')
  }
  const typed = Array.isArray(args.verdicts) ? args.verdicts : null
  // ★★★ RUN 209 (run 46 / FEEDBACK45 1.2, MEASURED): run 46 passed `verdicts:[{"r-acad":1}]` — an ARRAY of one object
  // KEYED BY MEMBER ID. Each row had no `member`, so it was filtered out as "no member named" and the caller was told
  // "the ruling is missing 2 of the 2 member(s) who debated: r-1、r-2" — a sentence about missing PEOPLE when the truth was
  // a missing SHAPE. The row gate runs before the member arithmetic: who a row speaks for is a shape question.
  if (typed && typed.length > 0) {
    const ROW_KEYS = ['member', 'p', 'verdict', 'reason', 'why', 'note']
    const badIndex = typed.findIndex((row) => row === null || typeof row !== 'object' || Array.isArray(row) || !has(row.member))
    if (badIndex !== -1) {
      const row = typed[badIndex]
      const keys = (row && typeof row === 'object' && !Array.isArray(row)) ? Object.keys(row) : []
      const keyedByMember = keys.length > 0 && keys.every((k) => !ROW_KEYS.includes(k))
      throw refuse('VMU_INVALID_ARGUMENT',
        'verdicts[' + String(badIndex) + '] is not a {member, p, reason} row, so WHO it speaks for cannot be read: you passed '
          + (Array.isArray(row) ? 'an ARRAY' : (row === null ? 'null' : (typeof row === 'object' ? 'an OBJECT with keys [' + keys.join(', ') + ']' : 'a ' + typeof row)))
          + (keyedByMember ? ' — an OBJECT KEYED BY MEMBER ID is not a row: this face reads ONE ROW PER MEMBER, with `member` as a field' : ''),
        'pass verdicts:[{ member:"r-1", p:1, reason:"…" }, { member:"r-2", p:1, reason:"…" }] — one object per member, `member` as a FIELD. An object keyed by member id ({"r-1":1}) is a different shape and is not read as a tally')
    }
  }
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
  // ★★★ AUDIT 10 / GAP G2 (rule L47 — 「辩论、结题的表决人数至少要达到 min(用户设置数量, 院士+常驻研究员人数)」).
  // THE RULING WAS THE ONE LINK IN THE CHAIN WITH NO FLOOR: this receipt READ the floor (`floor.satisfiedBy`) and said
  // in so many words that it was "NOT a gate on THIS receipt" — a number printed beside `ok:true` that a reader takes
  // as a check that was skipped (run 30's own report, item ③). The CLOSE rail carries no vote tally either
  // (kernel/meetings.js close() checks the chair, the minutes and the action items, never the ballot), so the rule's
  // DEBATE half had no gate anywhere. It has one now, and it counts SIGNATURES: the members whose number is in this
  // tally PLUS the chair, who signs. Counting the tally alone would make the floor unreachable BY CONSTRUCTION: the
  // chair cannot file a ruling of its own (`vibe_v5_verdict` refuses `VMU_RULING_CHAIR_SIGNS`) and `vibe_v5_verdict_ask`
  // does not ask it (excluded: "presides"), so a normal debate of m seats files m-1 numbers and `satisfiedBy` was
  // false on every well-run meeting.
  const voteFloorGate = (() => {
    const faceM = kernel && kernel.meetings
    if (!faceM || typeof faceM.quorum !== 'function') {
      return { readable: false, required: null, satisfied: null, signed: null, signedBy: [], unsigned: null,
        means: 'the kernel publishes no quorum() reading, so no vote floor could be read for this ruling' }
    }
    let q = null
    try { q = faceM.quorum({ meeting, allowArchived: true }) } catch (e) {
      return { readable: false, required: null, satisfied: null, signed: null, signedBy: [], unsigned: null,
        means: 'the quorum() reading failed: ' + ((e && e.message) || String(e)) }
    }
    // ★★ RUN 163 (second cut): the rule's 表决 floor is the kernel's `voteFloor.effective` — its denominator is the
    // INSTITUTE's voter seats, so a narrow invitation list cannot lower it. `required` (attendance, bounded by the
    // meeting's roster) is deliberately NOT used here: it answers a different question and is reported beside this one
    // so the two numbers can never be confused again.
    const voteFloorOf = (x) => (x && x.voteFloor && x.voteFloor.effective !== undefined && x.voteFloor.effective !== null)
      ? Number(x.voteFloor.effective)
      : (x && x.required !== undefined && x.required !== null ? Number(x.required) : 0)
    const required = voteFloorOf(q)
    // The signer set: every member whose number is in THIS tally (filed or chair-typed) plus the chair, who signs.
    const signedSet = new Set(provided)
    signedSet.add(chair)
    const signedBy = [...signedSet]
    let unsigned = null
    try {
      // allowArchived: a closed debate's electorate is read from the archived record (rule L53 rules after the end).
      const voters = typeof faceM.eligibleVoterIds === 'function' ? faceM.eligibleVoterIds({ meeting, allowArchived: true }) : null
      if (voters && voters.restricted === true && Array.isArray(voters.ids)) unsigned = voters.ids.map(String).filter((v) => !signedSet.has(v))
    } catch (e) { unsigned = null }
    const satisfied = signedBy.length >= required
    // ★★ RUN 152 (real machine, run 2, agent feedback F7): at a three-seat roster the floor is `min(cap, universe)` = 3
    // and `signed` is「every debating member + the chair」 = 3, so `VMU_MEETING_QUORUM_LOST` was UNREACHABLE — the agent
    // spent a whole task trying to trigger it and could not, while the receipt read like a live gate. The gate itself is
    // right (it CAN refuse when a named member has not filed); what was missing is the receipt saying so. These two
    // fields answer "did this gate bite, and when could it" instead of leaving a satisfied number looking like a proof
    // that the gate works.
    const uncovered = unsigned === null ? null : unsigned.length
    const vacuous = satisfied === true && (uncovered === null || uncovered === 0)
    return { readable: true, required, satisfied, signed: signedBy.length, signedBy, unsigned,
      chairCounted: true,
      vacuous,
      // ★★ RUN 163 / live-run-11 card rec-297: the denominator is now the INSTITUTE's eligible seats, so the sentence
      // that used to say "this run cannot reach VMU_MEETING_QUORUM_LOST" is no longer true — a narrow invitation list
      // no longer lowers the floor, and a debate whose electorate is narrower than the institute WILL lose it.
      bitesWhen: 'it refuses exactly when the signers (the members whose number is in this tally plus the chair) are fewer than the floor kernel.meetings.quorum() reports — and because vmu.meetings.quorumFloorSource is "universe", that floor counts the INSTITUTE\'s voter seats, not this meeting\'s invitation list: convening a debate with fewer invitees does NOT lower it, so a narrower meeting reaches VMU_MEETING_QUORUM_LOST (measured: required 2 with 1 signature, and required 3 with 2 signatures)',
      uncovered,
      eligibleUniverse: q && q.voteFloor && q.voteFloor.eligibleUniverse !== undefined ? q.voteFloor.eligibleUniverse : null,
      universeSource: q && q.voteFloor && q.voteFloor.universeSource !== undefined ? q.voteFloor.universeSource : null,
      invitedEligible: q && q.voteFloor && q.voteFloor.invitedEligible !== undefined ? q.voteFloor.invitedEligible : null,
      // the attendance reading is printed too, NAMED, so `required` (the vote floor) can never be read as "who must show up"
      attendanceFloor: q && q.required !== undefined ? q.required : null,
      formula: q && q.voteFloor && q.voteFloor.formula ? q.voteFloor.formula : (q && q.capPolicy ? q.capPolicy : null),
      means: 'signed = the members whose number is in this tally PLUS the chair, who signs; the floor is kernel.meetings.quorum().voteFloor.effective (the rule 「min(用户设置数, 院士+常驻研究员数)」, whose denominator is the INSTITUTE\'s voter seats, not this meeting\'s invitation list) — it GATES this ruling: below it the call is refused by name, unless the chair deliberately rules on fewer seats and says why; the separate attendance floor (who must show up) is reported as attendanceFloor and never gates a ruling' }
  })()
  if (voteFloorGate.readable === true && voteFloorGate.satisfied === false && !partial) {
    throw refuse('VMU_MEETING_QUORUM_LOST',
      'the ruling is signed by ' + String(voteFloorGate.signed) + ' of the ' + String(voteFloorGate.required) + ' seat(s) the vote floor requires (rule L47: 辩论、结题的表决人数至少 min(用户设置数, 院士+常驻研究员人数); the floor is vmu.meetings.quorumMin/quorumRatio capped by vmu.meetings.quorumCap at the eligible voter seats)'
        + (voteFloorGate.unsigned && voteFloorGate.unsigned.length ? ' — no ruling yet from: ' + voteFloorGate.unsigned.join('、') : ''),
      'collect their ruling first (vibe_v5_verdict_ask { meeting, proposition_id }) and let them file with vibe_v5_verdict — or, when the chair deliberately rules on fewer seats than the floor, pass partial:true with why:"<理由>": the receipt then records the override in floor.gate.escapedBy')
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
  // ★★ RUN 160 (FEEDBACK7 item 9): `fidelity.lean` was `"none"` even on a card whose body records `leanJob` and
  // whose proofState is complete — the card itself was the evidence and nobody read it. The card's own Lean job is
  // now consulted when the caller passes neither `lean_job` nor `lean_passed`; `source` says which of the three it
  // came from, so a reader never has to guess why the fidelity gate did or did not apply.
  const cardLeanJob = (() => {
    if (!cardRow || !has(cardRow.body)) return null
    try {
      const parsed = parseCardBody(str(cardRow.body))
      const fields = (parsed && parsed.fields) || {}
      const job = fields.leanJob === undefined ? (fields.leanjob === undefined ? null : fields.leanjob) : fields.leanJob
      return has(job) ? str(job) : null
    } catch (e) { return null }
  })()
  const leanEvidence = has(args.lean_job) ? Object.assign({}, leanPassedOf(kernel, args.lean_job), { source: 'argument' })
    : (args.lean_passed === true || args.lean_passed === false
      ? { jobId: null, passed: args.lean_passed === true, state: null, file: null, source: 'argument' }
      : (cardLeanJob ? Object.assign({}, leanPassedOf(kernel, cardLeanJob), { source: 'card', cardJob: cardLeanJob }) : null))
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
  // ★★★ RUN 212 (run 49 / FEEDBACK48 2.2, MEASURED): the notice sentence claimed "参与辩论的 N 名成员给出的最终裁决" while
  // `attribution` on the same receipt said every row was `chair-typed` — the two halves of one ruling disagreed about
  // whether a debate had happened. `attribution` is already computed above, so the provenance goes INTO the notice: the
  // holder reads the sentence, not the JSON.
  const provenance = {
    submitted: attribution.filter((a) => a && a.source === 'submission').length,
    typed: attribution.filter((a) => a && a.source === 'chair-typed').length,
  }
  const ruled = face.rulePropositionProbability({ verdicts, propositionId, owner, from: chair, at: null, provenance,
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
  // face already computes it (`meetings.quorum()` → the same `quorumOf` the vote/close rail reads), so it is READ here
  // rather than re-derived: a second copy of the formula is exactly the kind of second authority this project refuses.
  // ★★ RUN 30 (the institute's own report, item ③): the receipt carried `floor{minVotes:3, satisfiedBy:false}` beside
  // `ok:true` and `n:2`, and the office read the pair as "the framework skipped a check it promised". Nothing was
  // skipped THEN — the floor was only a reading — but the reading was the whole problem: the rule's debate half had no
  // gate in the chain (see the gate above). AUDIT 10 / GAP G2 replaced "read it and explain it" with "refuse below it,
  // and record the declared exception": `floor.gate` is now the enforced reading, and `escapedBy:"partial"` is the only
  // way past it. The numbers stay the kernel's (a second copy of the formula would be a second authority), and the
  // sentence that says what they MEAN is this face's job.
  const floor = (() => {
    const faceM = kernel && kernel.meetings
    if (!faceM || typeof faceM.quorum !== 'function') return { readable: false, why: 'the kernel publishes no quorum() reading', means: null }
    try {
      const q = faceM.quorum({ meeting, allowArchived: true })
      const required = q && q.required !== undefined ? q.required : null
      return { readable: true, minVotes: required,
        min: q && q.min !== undefined ? q.min : null, roster: q && q.roster !== undefined ? q.roster : null,
        eligibleUniverse: q && q.capUniverse !== undefined ? q.capUniverse : null,
        cap: q && q.cap !== undefined ? q.cap : null,
        formula: q && q.capPolicy ? q.capPolicy : null,
        satisfiedBy: voteFloorGate.readable === true ? voteFloorGate.satisfied : null,
        // ★ AUDIT 10 / GAP G2: THE ENFORCED READING. `satisfiedBy` alone was the defect (a number beside `ok:true`
        // that the face itself disclaimed) — `gate` names the code that refuses below the floor and the declared
        // escape when the chair rules on fewer seats, so "was the floor enforced, and if not, who said so" is
        // answerable from the receipt instead of inferred.
        gate: {
          enforced: voteFloorGate.readable === true,
          universeSource: voteFloorGate.readable === true ? (voteFloorGate.universeSource === undefined ? null : voteFloorGate.universeSource) : null,
          invitedEligible: voteFloorGate.readable === true ? (voteFloorGate.invitedEligible === undefined ? null : voteFloorGate.invitedEligible) : null,
          code: 'VMU_MEETING_QUORUM_LOST',
          required: voteFloorGate.required,
          signed: voteFloorGate.signed,
          signedBy: voteFloorGate.signedBy,
          unsigned: voteFloorGate.unsigned,
          chairCounted: voteFloorGate.chairCounted === true,
          satisfied: voteFloorGate.satisfied,
          // ★★ RUN 152 (F7): a satisfied floor at a full house says nothing about whether the gate works. `vacuous` is
          // true exactly when nobody is missing (so it could not have refused this run) and `bitesWhen` states the
          // condition under which it does refuse — the pair keeps "the rule holds" from being read as "the gate bit".
          vacuous: voteFloorGate.vacuous === true,
          uncovered: voteFloorGate.uncovered === undefined ? null : voteFloorGate.uncovered,
          bitesWhen: voteFloorGate.bitesWhen === undefined ? null : voteFloorGate.bitesWhen,
          escapedBy: (partial && voteFloorGate.satisfied === false) ? 'partial' : null,
          means: voteFloorGate.means,
        },
        // ★ the sentence that keeps `satisfiedBy:false` from being read as "a gate was skipped": this is the quorum the
        // CLOSE rail enforces, it counts the CHAIR (the v5r rule is 「表决人数 ≥ min(用户设置数, 院士+常驻研究员数)」, and the
        // chair holds one of those seats), and the ruling face does NOT refuse on it — partial rulings are a declared,
        // receipt-recorded choice, not a silent relaxation.
        means: 'this is the VOTE floor of rule L47, read from kernel.meetings.quorum() (not re-derived); it counts the CHAIR because 「院士+常驻研究员」 is the denominator and the chair holds one of those seats. It GATES this ruling (see floor.gate): below it the call is refused by name with VMU_MEETING_QUORUM_LOST, unless the chair passes partial:true with why — then floor.gate.escapedBy:"partial" records the override instead of hiding it. `satisfiedBy` is signed >= required, where signed counts SIGNATURES (the members whose number is in this tally plus the chair) and NOT attendance: a ruling is not a ballot, and this floor is about who signed the number, not who sat in the room',
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
  // ★★ RUN 153 (real machine, run 3 / agent report G4): the ruling produced NO aggregate id. The only ids a caller
  // could put into `vibe_v5_verified_promote`'s `warrant` were the members' OWN ruling cards — so a 2/2 unanimous ruling
  // was recorded as if one member's card had produced it (measured: `warrant:"ruling-m-deb-1-rec-12-r-1-…"`). The tally
  // now has its own name. It is stable per (meeting, proposition) because rule L53 settles a proposition once, so
  // re-reading the receipt gives the same id instead of minting a second one.
  const tallyId = 'tally-' + [str(meeting), propositionId].map(rulingSlugOf).join('-')
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
      ? (() => {
        // ★★ RUN 152 (real machine, run 2, F1's second half): this `call` used to omit statement/value/motive, but
        // `vibe_v5_record_proposition` REQUIRES all four declared fields — the printed repair was not copy-pasteable:
        // the host schema check would refuse it before the lock gate was even reached. The call now carries the card's
        // OWN fields, read back from the record, and `debate_ruling.subject` names this card so the p=1 gate can match
        // the evidence to it.
        let f = null
        try { const p = parseCardBody(str(cardRow.body)); f = p && p.fields ? p.fields : null } catch { f = null }
        const quoted = (v) => JSON.stringify(v === undefined || v === null ? '' : String(v))
        // ★★★ RUN 209 (run 46 / FEEDBACK45 1.1, MEASURED): run 46's card held `value: "对 n≥1 成立"` (TEXT), and this
        // printed `value: NaN` because the renderer was `String(Number(f.value))` — the ONE call the receipt tells the
        // holder to copy back. A number is printed as a number; anything else is printed as a JSON string, so the text
        // parses back to the same text instead of to NaN. `correction.callMeans` says this out loud.
        const valueLiteral = (v) => {
          if (v === undefined || v === null) return '1'
          if (typeof v === 'number' && Number.isFinite(v)) return String(v)
          if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) && String(Number(v)) === v.trim()) return v.trim()
          return quoted(v)
        }
        return 'vibe_v5_record_proposition { id: "' + propositionId + '", statement: ' + quoted(f && f.statement)
          + ', value: ' + valueLiteral(f && f.value) + ', motive: ' + quoted(f && f.motive)
          + ', p: ' + String(ruled.value) + ', debate_ruling: { subject: "' + propositionId + '", value: ' + String(ruled.value) + ', mode: "' + String(ruled.mode) + '", n: ' + String(ruled.n) + ', decided: ' + String(ruled.decided === true) + ', at: "' + kernelClockIsoOf(kernel).iso + '", ballotId: "' + tallyId + '", meeting: "' + str(meeting) + '", by: "' + chair + '" } }'
      })()
      : (cardPath.path
        ? 'edit the card FILE at ' + cardPath.path + ' and set its probability to p = ' + String(ruled.value) + ' (this proposition is a library card, not a records row: no records face owns it, so the edit is a file edit by its holder)'
        : 'this ruling has NO card to correct (the object was not on the records track): record the proposition first with vibe_v5_record_proposition { track: "propositions", statement, value, motive, p: ' + String(ruled.value) + ' } and then apply the ruling with the same call + debate_ruling'),
    // ★★ RUN 152: the settlement is ADMITTED even on a locked card (see the lock gate in gatedCardHandler) — say it here,
    // because a reader who has already seen「登记即定稿」will otherwise assume the card cannot be touched at all.
    // ★★ RUN 198 (run 38 FEEDBACK37 2.4): the printed shape above carries BOTH names on purpose — `ballotId` (the
    // aggregate tally id, which is what the p=1 gate reads as `rulingRef`) and `meeting` (the room it was decided in).
    // The reader of run 38 had to guess that passing only `meeting` left the gate's reference empty; the shape itself is
    // now the answer, and this sentence says the two names are one reading.
    // ★★★ RUN 210 (run 47 / FEEDBACK46 1.2, MEASURED): the call above carries `ballotId` — and that slot holds the
    // RULING AGGREGATE NAME (`tally-…`), NOT a meeting ballot box id. Run 47 put the meeting face's own `ballotId`
    // (`b-…`) there and was refused ("it is a MEETING ballot … name the MEETING"). `meeting` is also in the call, which
    // is the field that resolves; this sentence exists so the two same-named things are not confused again.
    ballotIdMeans: 'the `ballotId` above is the RULING AGGREGATE NAME (`tally-<meeting>-<card>`), never a ballot BOX id: a meeting box id (`b-…` from the meeting face) is refused in that slot by name — name the MEETING instead, which this same call also carries',
    shapeMeans: 'one ruling carries ONE reference; this framework accepts it under two names — `ballotId` (a ballot/tally id) and `meeting` (the convened meeting), and the write receipt reads back whichever was given as `p1RulingRef`. The call above is accepted AS PRINTED: both keys are present, and they name the same decision.',
    // ★★★ RUN 209 (run 46 / FEEDBACK45 1.1): the sentence that makes `call` auditable instead of trusted. Run 46 copied
    // a call whose `value` was `NaN` and its own `shapeMeans` still said "accepted AS PRINTED".
    callMeans: 'every field in `call` is carried from the CARD, not re-derived: a numeric value prints as a number, a text value prints as a quoted JSON string (so it parses back to the same text), and a field the card does not hold is left at the documented default. If your card\'s `value` is prose, the printed call keeps that prose — it never becomes a non-number and it never silently becomes 1. `at` is THIS receipt\'s own timestamp (the moment the ruling was read) and is optional: omit it and the write uses the current time — the call stays valid as printed, and the string is a real ISO time, not a placeholder',
    // ★ RUN 153 (G4): the ONE id that stands for the whole ruling, ready to be the `warrant` of the promotion.
    warrantFor: {
      id: tallyId,
      kind: 'debate-unanimous',
      n: ruled.n,
      value: ruled.value,
      spread: ruled.spread === undefined ? null : ruled.spread,
      useAs: 'the `warrant` argument of `vibe_v5_verified_promote` (the aggregate tally of this ruling, not one member\'s card)',
      // ★★ RUN 155 (audit of c5d356b9, problem 5): a receipt that hands out an id invites the reader to READ it, and
      // `vibe_v5_read_library { id: "tally-…" }` answered NO_SUCH_OBJECT because nothing is written under that name. The id
      // is a NAME for the aggregate (stable per meeting+proposition), so the receipt now says exactly that, names where the
      // durable evidence lives (each member\'s ruling card) and how to reproduce the aggregate from the meeting.
      durable: 'this id is a NAME for the aggregate, not a records row — nothing is stored under it. The durable evidence is (a) the per-member ruling cards in `attribution[].submission`, readable with vibe_v5_read_library { id }, and (b) the verified row the promotion writes, whose `warrant` line carries this id. Reproduce the aggregate from (meeting, proposition): vibe_v5_meeting { action: "summary" } lists the motions and votes it was summed from.',
    },
    lockedCardNote: 'a card whose proof is registered complete stays locked for every CONTENT edit; this settlement writes only the probability the ruling produced, which rule L53 requires — the gate admits exactly that shape (p + debate_ruling) and nothing else',
    means: 'the KERNEL notice tells the owner to correct the card; this field names the call that does it and the values this ruling produced, so "who changes the card, with what" is answerable from the receipt instead of inferred. This face does not write the card: the rule makes the notice the FRAMEWORK act and the edit the HOLDER act (and a card write here would be a second writer of the same row)',
  }
  // ★★★ RUN 208 (run 45 / FEEDBACK44 1.2, MEASURED): this receipt printed `correction.call` (a p=1 write with
  // debate_ruling naming this meeting) but NOT the reading that write will make, so a chair could only learn "the gate
  // will say it counted no votes" by copying the call back and being refused. The reading is the same function the gate
  // uses, taken here over the SAME (meeting, proposition): a prediction of a READ, never a decision this ruling makes.
  const p1RulingReading = await (async () => {
    try {
      if (kernel === null || kernel === undefined) return null
      const reading = await rulingNameResolution(kernel, { rulingRef: meeting, meeting, subject: propositionId, ballotId: null, tallyId: null }, { cardId: propositionId })
      return reading === null || reading === undefined ? null : reading
    } catch (e) {
      return { ok: false, reason: 'unreadable', means: 'the p=1 gate would read this meeting through the same function, and that read failed HERE: ' + String((e && e.message) || e) }
    }
  })()
  // ★★★ RUN 210 (run 47 / FEEDBACK46 1.1, MEASURED): a chair could TYPE every member's verdict in one call, receive a
  // tally, and then be refused at p=1 (VMU_PACK_V5R_CORE_P1_RULING_UNVOTED) because a chair-typed tally is not a
  // COUNTED decision on the meeting — the reading below already knew (`voted:false`) but did not say what it means for
  // the copy-back call. This field says it in the receipt that hands out the call.
  const p1CannotBack = (() => {
    if (p1RulingReading === null || p1RulingReading === undefined || p1RulingReading.ok === false) return null
    if (p1RulingReading.voted === true) return null
    // WHO typed the numbers matters here: `attribution` (built above) says which rows came from a member's own card and
    // which the chair transcribed. A tally whose numbers are ALL chair-typed is exactly the run-47 shape, and its repair
    // is different from "nobody has decided anything yet".
    const rows = Array.isArray(attribution) ? attribution : []
    const typed = rows.filter((a) => a && a.source === 'chair-typed').length
    const submitted = rows.filter((a) => a && a.source === 'submission').length
    return {
      code: 'VMU_PACK_V5R_CORE_P1_RULING_UNVOTED', typed, submitted,
      why: typed > 0 && submitted === 0 ? 'chair-typed-only' : (typed > 0 ? 'partly-chair-typed' : 'no-counted-decision'),
    }
  })()
  return {
    ok: true, tool: 'vibe_v5_verdict_final', meeting, chair, from: chair,
    p1RulingReading,
    p1CannotBack,
    p1CannotBackMeans: p1CannotBack === null
      ? null
      : 'copying `correction.call` back WILL BE REFUSED as ' + p1CannotBack.code + ': this tally is not a counted decision on ' + String(meeting) + ' (typedRulings ' + String(p1CannotBack.typed) + ', member-submitted ' + String(p1CannotBack.submitted) + ') — the fix is not to retry the write: have each debater file their OWN ruling card (`vibe_v5_verdict { meeting, proposition_id, verdict, reason }` per member) and take the ruling again, or settle the motion by seconding and voting it in the meeting',
    p1RulingReadingMeans: 'this is the SAME reading the p=1 write will take when you copy `correction.call` back (its debate_ruling names this meeting): sources.motions + sources.submittedRulings (the durable ruling cards the members filed — a chair-typed number is NOT one of them) say what the gate will count, voted says whether it will find a counted decision, and means names it in words. It PREDICTS a read, it does not decide the card — so "my p=1 write will be refused for having no counted votes" is answerable here instead of by trying and being refused',
    // ★ RUN 158 (N3): rule L53 takes the ruling AFTER the debate ends, and a closed meeting lives in the archive. The
    // receipt names that state so a reader can tell a ruling taken mid-debate from the rule's own order of events.
    meetingArchived,
    // ★★ ROUND 159 (FEEDBACK6 item 3): the meeting's own state is a reading, not an inference from `meetingArchived`.
    meetingState: view && view.state !== undefined ? view.state : null,
    // ★★ ROUND 159 (FEEDBACK6 item 4): "awaiting" has to say WHAT is awaited and that it is the person the rule names.
    meetingStateMeans: view && view.state !== undefined ? ('the meeting record says state "' + String(view.state) + '"' + (meetingArchived ? ' and it is held by the archive' : ' and it is still live')) : null,
    meetingArchivedMeans: meetingArchived === false
      ? 'the ruling was taken while the meeting was still open (its record is live)'
      : 'the ruling was taken over the CLOSED (archived) record: the debate had ended, which is the order rule L53 describes — 「待辩论会议结束，v5r框架请…给出最终裁决」. Nothing was reopened: this face only reads the archive.',
    floor,
    // ★ RUN 30 ③: the sentence travels beside the numbers on purpose — `satisfiedBy:false` next to `ok:true` is exactly
    // the pair a reader misreads, so the receipt carries its own explanation instead of leaving it to the doc.
    floorMeans: floor && floor.means ? floor.means : null,
    // ★ RUN 30 ⑤: WHICH call corrects the card, with which values (see the `correction` block above).
    correction,
    // ★ RUN 153 (G4): the ruling's aggregate name, so the evidence a promotion cites is the JUDGEMENT (n signatures,
    // one value) and not whichever member's card happened to be picked.
    tally: {
      id: tallyId,
      kind: 'debate-unanimous',
      n: ruled.n,
      value: ruled.value,
      spread: ruled.spread === undefined ? null : ruled.spread,
      means: 'one aggregate id for this ruling: name it in `vibe_v5_verified_promote`\'s `warrant`; the per-member rulings stay in `attribution`. It is derived from (meeting, proposition) because L53 settles a proposition once, so the same ruling always has the same name',
      // ★★ RUN 155 (problem 5, second half): say what the id IS, right next to the id.
      isRecordId: false,
      durableUnder: 'nothing — the id names an aggregate; read the per-member rulings (attribution[].submission.id) or the meeting summary',
      // ★★★ RUN 212 (run 49 / FEEDBACK48 1.1, MEASURED): the kernel has computed `agreed` and `anyAsserted` since RUN 211,
      // and said which of the two cases this ruling is in (`note`), but this object is a WHITELIST — so the facts existed
      // and were dropped one layer above them. Two members who both estimated 0.6 were readable only as prose ("numbers
      // agree, but 0.6 is not 0/1"); a field-checking reader could not tell that apart from a real disagreement.
      agreed: ruled.agreed === true,
      anyAsserted: ruled.anyAsserted === true,
      note: ruled.note === undefined || ruled.note === null ? null : str(ruled.note),
    },
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
    closureReading: 'NOT on this receipt: cast/votesCast are the CLOSURE vote and live on `vibe_vmu_status { detail: "closure" }` → closureVote (the closing receipt `vibe_vmu_meeting { action: "close" }` and the turn status receipt also carry it). `vibe_vmu_meeting { action: "status" }` does NOT — it answers the meeting object (state/roster/chair), not the quorum tally. floor.minVotes here is the rule-L47 vote floor read from kernel.meetings.quorum(); it gates THIS ruling through floor.gate — the CLOSING rail (kernel/meetings.js close()) checks the chair, the previous minutes and the action items and reads NO vote tally, so closing a meeting says nothing about the floor',
    proposition: ruled.proposition, value: ruled.value, valueSource: ruled.valueSource,
    mode: ruled.mode, exact: ruled.exact, rounded: ruled.rounded, decided: ruled.decided,
    enforceable: ruled.enforceable, estimate: ruled.estimate, n: ruled.n, perMember: ruled.perMember,
    spread: ruled.spread, owner, notified, delivery,
    // ★★★ RUN 212 (run 49 / FEEDBACK48 1.1, MEASURED): the same two facts at the TOP level, because a reader scanning this
    // receipt for "did they agree" should not have to know that the aggregate lives under `tally`.
    agreed: ruled.agreed === true,
    anyAsserted: ruled.anyAsserted === true,
    note: ruled.note === undefined || ruled.note === null ? null : str(ruled.note),
    agreeMeans: 'agreed: every member gave the SAME number (so any gap is 0 or 1, not the estimate); anyAsserted: at least one member actually named the value this ruling used. Both are false only when the members really differed — that is the case where the mean is a compromise',
    // ★ TASK-12 / F4: the state of the notice (see the block above). `notified` stays the list of mailboxes that hold a
    // copy; `notification.state` says whether that copy was pushed into a turn or is only waiting, so the pair cannot
    // be read as "the owner has seen it".
    notification,
    // ★ TASK-12: WHERE EACH NUMBER CAME FROM — one row per member in the tally (submission vs chair-typed), so "who
    // filed it" is answerable per member instead of being inferred from `coverage.complete`.
    attribution,
    // ★★ RUN 182 (run 27 / FEEDBACK27 F27-4, MEASURED): `n:2` was read by the chair as "two ruling cards on disk" while the
    //   disk held ONE card and the other number was typed by the chair itself. `attribution` knew the difference; the bare
    //   `n` did not. The aggregate carries the split beside the count, so "n signers" and "n cards" cannot be confused.
    sources: { n: ruled.n, submitted: attribution.filter((a) => a.source === 'submission').length, typed: attribution.filter((a) => a.source === 'chair-typed').length },
    sourcesMeans: '`n` counts the SIGNERS of this ruling, not the cards on disk: submitted = members who filed a ruling card themselves, typed = numbers the chair entered because no card was filed. Read `n` next to this split — a reader who quotes `n` as a card count is quoting the wrong number',
    attributionMeans: 'one row per number in the tally: source:"submission" means that member filed it itself (the row names the card and its path); source:"chair-typed" means the chair wrote it because no card was filed; `coverage.missing` names the members who debated and appear in NEITHER',
    // ★ TASK-12: the filing ledger this ruling was collected from — readable or not, and why.
    submissions: { readable: filed.readable === true, why: filed.readable === true ? null : filed.why,
      count: filed.rows.length, cards: filed.cards, cardsScanned: filed.cardsScanned, duplicates: filed.duplicates,
      rows: filed.rows.map((r) => ({ member: r.member, verdict: r.verdict, reason: r.reason, at: r.at, id: r.id, path: r.path, counted: provided.includes(r.member) })),
      means: filed.readable === true
        ? 'the rulings were read back from the library on disk (each member files its own card with vibe_v5_verdict { meeting, proposition_id, verdict, reason }); counted:true marks the ones this tally actually used. `count` is how many members filed for THIS debate, `cards` how many matching cards were found, and `cardsScanned` how many ruling-status cards the library holds in total: 0 / 0 / 2 means the library has ruling cards but none about this meeting+proposition'
        : 'the filing ledger could not be read here, so NOTHING was collected from it: ' + String(filed.why) },
    coverage: { debated: debated.members, debatedSource: debated.source, provided,
      submitted: filed.rows.map((r) => r.member),
      submittedCount: filed.rows.length,
      adoptedFromSubmissions: attribution.filter((a) => a.source === 'submission').length,
      typed: attribution.filter((a) => a.source === 'chair-typed').map((a) => a.member),
      typedCount: attribution.filter((a) => a.source === 'chair-typed').length,
      outsideDebate: filed.rows.filter((r) => !debated.members.includes(r.member)).map((r) => ({ member: r.member, verdict: r.verdict, id: r.id })),
      // ★★★ LIVE RUN 139 (F-139a): the electorate is now derived from the seat table, so the members the meeting
      // NAMED but who cannot file (the chair presides; a temp seat's `vibe_v5_verdict` is closed to it) must be
      // NAMED here too — asked + excluded reconciles against the roster instead of quietly shrinking it.
      excluded: debated.excluded || [],
      excludedMeans: 'the members this meeting named who are NOT in the electorate above: the chair PRESIDES (it signs the ask instead of answering it), and a seat whose ruling face is closed cannot file a ruling at all (a temp seat: `vibe_v5_verdict` is closed to it) — so `debated` + `excluded` reconciles against the roster, and a missing member in `missing` is always somebody who COULD have filed',
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
    // ★★★ RUN 213 (run 50 / FEEDBACK49 1.1, MEASURED): the kernel already computes WHO TYPED the verdicts and hands
    // it to this face as an object (`ruled.notice.provenance`), but the receipt reduced the notice to its text — so the
    // one machine-readable fact about chair-typed verdicts was one layer down again, and run 50 could only re-count it
    // from `attribution`. The counts are now printed by name, beside the sentence that says the same thing.
    noticeProvenance: ruled.notice && ruled.notice.provenance
      ? { submitted: Number(ruled.notice.provenance.submitted) || 0, typed: Number(ruled.notice.provenance.typed) || 0 }
      : null,
    noticeProvenanceMeans: 'counts, not prose: `submitted` = rulings the members filed THEMSELVES, `typed` = rulings the chair typed on their behalf. `attribution[].source` says which member is which, and the tally\'s `sources` carries the same pair under the names `submitted`/`typed`; the notice TEXT states it in a sentence and adds the ★ line when typed>0',
    // ★★★ RUN 213 (run 50 / FEEDBACK49 1.2, MEASURED): this receipt carries TWO different things called `note` — the
    // top-level `note` explains DELIVERY (was a mailbox copy made? has the owner read it?), while the verdict\'s own
    // explanation lives in `tally.note` ("every member gave the SAME value …"). Run 50 started quoting the delivery
    // note as if it were the verdict\'s note. Each field now says which question it answers.
    noteMeans: 'this top-level `note` is the DELIVERY note: it answers "was the owner told, and how". It is NOT the verdict\'s explanation — that one is `tally.note` (for example whether the members\' numbers agreed). Same word, two questions',
    fidelity: { consulted: pGate.applicable === true, resolved: pGate.resolved === true,
      required: pGate.required === true, answered: !!answered,
      lean: leanEvidence ? (leanEvidence.jobId ? 'lean_job:' + leanEvidence.jobId : (leanEvidence.cardJob ? 'lean_job:' + leanEvidence.cardJob : 'caller')) : 'none',
      leanSource: leanEvidence ? (leanEvidence.source || 'argument') : 'none',
      leanSourceMeans: leanEvidence
        ? (leanEvidence.source === 'card'
          ? 'read from THIS card\'s own body (leanJob), because the caller passed neither lean_job nor lean_passed — the card IS the evidence'
          : 'passed by the caller in this call (lean_job / lean_passed)')
        : 'no Lean run is on this card and none was passed, so the fidelity question cannot apply',
      cardJob: leanEvidence && leanEvidence.cardJob ? leanEvidence.cardJob : null },
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
// ★★★ LIVE RUN 139 (F-139a): a seat that cannot FILE a ruling is not a debater — the temp seats sit on the
// meeting roster, and the completeness gate then demanded a submission from a seat whose `vibe_v5_verdict`
// face is closed to it: the chair could only escape by `partial:true`, which turned the rule's normal path
// into an exception. The population is derived from the DECLARED seat table (`seatDecision`), never guessed.
function seatOfMemberId(kernel, memberId) {
  const id = String(memberId || '')
  if (id === '') return { seat: null, known: false, why: 'the member id is empty' }
  let rows = []
  try {
    const m = kernel && kernel.members
    rows = (m && typeof m.roster === 'function') ? (m.roster() || []) : []
  } catch { rows = [] }
  for (const row of rows) {
    if (row && String(row.id) === id) return { seat: String(row.slot || ''), known: true, why: null }
  }
  return { seat: null, known: false, why: 'the roster publishes no seat for ' + id }
}

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
      // ★ RUN 158 (N3): a debate that has CLOSED still names its electorate — read the archived minutes/spokeBy rather
    // than answering "nothing readable" for the very case rule L53 asks about.
    const out = face.spokeBy({ meeting, allowArchived: true })
      speakSet = { readable: true, members: (out && Array.isArray(out.spokeBy)) ? out.spokeBy.map(String) : [], why: null }
    } catch (e) {
      speakSet = { readable: false, members: [], why: (e && e.message) || String(e) }
    }
  }
  let roster = null
  let chair = null
  try {
    const v = (typeof face.meetingView === 'function') ? face.meetingView({ meeting, allowArchived: true }) : null
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
      const at = seatOfMemberId(kernel, m)
      if (at.known && at.seat !== '' && !seatDecisionOf(at.seat, 'vibe_v5_verdict').allowed) {
        excluded.push({ member: m, seat: at.seat, why: 'seat "' + at.seat + '" cannot file a ruling (`vibe_v5_verdict` is closed to it), so it is not part of the electorate' })
        continue
      }
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
      const at = seatOfMemberId(kernel, m)
      if (at.known && at.seat !== '' && !seatDecisionOf(at.seat, 'vibe_v5_verdict').allowed) {
        excluded.push({ member: m, seat: at.seat, why: 'seat "' + at.seat + '" cannot file a ruling (`vibe_v5_verdict` is closed to it), so it is not part of the electorate' })
        continue
      }
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
 *   · nothing declared and nothing found                     → "unverified": the name may be a one-line
 *                                                              proposition (「一句话命题」) or a typo, and this face
 *                                                              cannot tell the two apart — so it asks AND labels what
 *                                                              it could not check. A one-line proposition is NOT a
 *                                                              legal debate object (the gate refuses it by name);
 *                                                              this face asks only about the string that was named.
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
  // ★★★ RUN 249 (缺陷 A, MEASURED on the 69th real-machine run): a call asking about `p-rulecheck-不存在` came back
  // `ok:true, propositionKind:"unverified"` and DELIVERED the mail to ["r-1","r-2"] — while this face's own description
  // promised the ask would be refused. Every member was asked to rule on an object the library does not hold, the
  // meeting never declared, and no file backs; the verdicts could never be aggregated into anything. The honest shape is
  // ONE behaviour and ONE description: a name this face cannot check is REFUSED BY NAME. A one-line proposition is not a
  // legal debate object either (the debate-subject gate refuses it as VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF), so there is
  // no legal caller this refusal could cost — only an ask that should never have gone out.
  throw refuse('VMU_ASK_UNKNOWN_PROPOSITION',
    'proposition "' + id + '" names nothing this face can check: ' + (recordsReadable ? 'no card with this id exists' : 'the records face was not readable, so no card could be looked up') + ', the name is not a file reference, and meeting ' + str(meeting) + ' declared ' + (declared === null ? 'NO debate subject' : 'a different one ("' + declared + '")') + ' — asking the members to rule on it would collect verdicts for a target nobody can aggregate',
    'three reachable repairs: ① record the proposition first (vibe_v5_record_proposition) and pass the id it returns; ② pass proposition_id:"' + (declared === null ? '<the object this debate was convened to debate>' : declared) + '" — the object the meeting was convened to debate; ③ if the debate object really is a FILE, pass its path or file name (e.g. "docs/proof.md", "main.lean") — v5r allows that shape and the receipt then says propositionKind:"file-ref". A free one-line string carries no proof carrier and is NOT a legal debate object (the debate-subject gate refuses it by name VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF), so this face refuses the ask instead of mailing every member about a target it could not check (RUN 249 / A)')
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
  // ★ RUN 158 (N3): the ask is the rule's own step between "the debate ended" and "the members answer" — so it reads a
  // CLOSED debate too (allowArchived), and the receipt says which state it read.
  const view = kernel.meetings.meetingView({ meeting, allowArchived: true })
  const askMeetingArchived = view && view.archived === true
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
        : '（★ 命题 "' + propositionId + '" **尚未在命题库登记**：本面无法区分"一句话命题"与"笔误"，因此照发并在此写明——裁决的对象仅为这条字符串，登记卡后重问才能对上命题库；另注：一句话命题**不能**作辩论对象（会被具名拒 VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF）。）'
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
    meetingArchived: askMeetingArchived,
    // ★★ RUN 158 (N3): a boolean is a reading, not a sentence — the same receipt says WHAT the archived read means, so a
    // caller never has to infer from `ok:true` whether the debate it is asking about is still open.
    meetingArchivedMeans: askMeetingArchived
      ? 'this meeting was CLOSED and its record now lives in the archive: the ask reads the recorded closure (rule L53 takes the final ruling after the debate ends), so `meetingState`/`closurePhase` below are a READ of that record, not a fresh poll'
      : 'this meeting is still open in the meetings service registry: the ask reads the live view',
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
          : 'each row of `excluded` names WHY it was left out (`why`): the chair presides over the meeting, so it SIGNS the ask and does not ANSWER it; a seat with no ruling face on this face (see the row\'s `seat`) cannot file a ruling at all — G7 audit 9 (C2) measured this list claiming "the only reason" beside rows excluded for the second one'),
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
  // ★★★ RUN 248-N / task-67 — THE NOTICE'S OWN CALL SHAPE MUST WORK. The appointment row the kernel writes ends with an
  // `attend` call spelled `vibe_v5_meeting {op:"attend", id, member}`; a shape a receipt PRINTS but the face refuses is
  // the same defect as a silent drop (提示即承诺). `op` is therefore a declared alias of `action` on this face, and the
  // three words the notice teaches — appoint / schedule / attend — dispatch below. When BOTH words are given and they
  // disagree, the call is refused by name rather than letting one of them win silently.
  const actionWord = args.action === undefined || args.action === null ? '' : String(args.action).trim()
  const opWord = args.op === undefined || args.op === null ? '' : String(args.op).trim()
  if (actionWord !== '' && opWord !== '' && actionWord !== opWord) {
    return {
      ok: false,
      code: 'VMU_INVALID_ARGUMENT',
      message: 'vibe_v5_meeting was given BOTH action:"' + actionWord + '" and op:"' + opWord + '", and they name different actions — this face will not pick one silently',
      hint: 'pass ONE of them: `op` is the alias used in the appointment notices (`{op:"attend"|"appoint"|"schedule"}`); `action` is the older spelling. Send the same word in both only if you mean it',
    }
  }
  const word = actionWord !== '' ? actionWord : opWord
  if (word === '') return null
  // ★ ROUND 47: `action:"rulings"` IS dispatched here (see toolMeetingRulings) — the read face of the filed ruling
  // cards. Everything else still gets the "this face only convenes" refusal with the kernel face named.
  if (String(word) === 'rulings') return null
  // ★★★ ROUND 78 / TB-2731 (FEEDBACK78 D3): `receiptsView` is a READ of the same kind — the kernel's recorded receipt
  // ring. The host funnel runs THIS validator BEFORE the handler, so a read the handler knows about but this function
  // does not would be refused before it could dispatch (the same alignment defect `types` fixed in WAVE 2).
  if (String(word) === 'receiptsView') return null
  // ★ WAVE 2 (audit E33): `types` is the SECOND read on this face (the type catalogue). The host funnel runs THIS
  // validator BEFORE the handler, so a read that only `toolMeeting` knows about is refused here and never dispatches —
  // the alignment must be declared in both places, and this one runs first.
  if (String(word) === 'types') return null
  // ★ RUN 84: the face's OWN verb was refused. An agent read "convene a meeting" and passed action:"convene" (the word
  // the refusal hint itself uses); the face said it "has no convene action" and lectured it about convening. Naming the
  // verb the tool performs is ALIGNED with the tool, not a wrong action: it dispatches, and the receipt still carries no
  // `meeting_round`-style side effects. (A different verb — close/extend/status — is still refused below.)
  if (String(word) === 'convene') return null
  // ★★★ RUN 248-N / task-67: the appointment vocabulary the notice prints. `appoint` = convene/预约 in one word;
  // `schedule` = the same call with a REQUIRED `at`; `attend` = take the seat the notice promised (`attend({meeting,member})`
  // on the kernel service). All three dispatch in `toolMeeting`; the kernel remains the single judge of timing/seat rules.
  if (String(word) === 'appoint' || String(word) === 'schedule' || String(word) === 'attend') return null
  return {
    ok: false,
    code: 'VMU_INVALID_ARGUMENT',
    message: 'vibe_v5_meeting only CONVENES a meeting; it has no "' + word + '" action (this call was never dispatched, so nothing about it was validated)',
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
    cardsScanned: Number.isFinite(filed.cardsScanned) ? filed.cardsScanned : 0,
    count: Array.isArray(filed.rows) ? filed.rows.length : 0,
    rows: Array.isArray(filed.rows) ? filed.rows : [],
    duplicates: Array.isArray(filed.duplicates) ? filed.duplicates : [],
    means: 'these are the ruling CARDS filed for this (meeting, proposition) by the members themselves (vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }): `rows` is the latest filing per member, `cards` counts the cards filed for THIS (meeting, proposition), `cardsScanned` counts every ruling-status card the library holds (so `cards:0` beside `cardsScanned:2` is not a contradiction — it means the cards on disk are about other debates), and `duplicates` reports a member who filed two different values (the latest is the one the tally uses). Reading does NOT tally and does NOT decide — the chair still signs with vibe_v5_verdict_final. `readable:false` means no filing could be read (see `why`), which is NOT the same as "nobody filed". ★ THE TOP-LEVEL `count` OF THIS FACE IS the number `vibe_v5_verdict_final` reports as `submissions.count` for the same (meeting, proposition) — the same fact in two shapes, so the absence of a `submissions` block here is not a missing number',
  }
}

/**
 * ★★★ ROUND 78 / TB-2731 (FEEDBACK78 D3) — THE RECEIPT RING, REACHABLE FROM A TOOL FACE.
 * `kernel.meetings.receiptsView()` has existed since ROUND 77, but NO tool face exposed it, so a real run that needed
 * the recorded receipts could only record NO-EVIDENCE: a read that lives only in the kernel is not reachable by the
 * members and the office, who speak through tools. ★ ROUND 79 / TB-2740 (FEEDBACK79 B2): that face then read the
 * kernel's IN-PROCESS ring, which dies with the kernel that wrote it — the office kernel read `{receipts:[],available:0}`
 * for a meeting the chair's CHILD kernel had convened. The kernel's `receiptsView` now reads the DURABLE meetings fold
 * first (shared through the store root) and falls back to its own ring only when the fold seam is absent; this tool
 * passes that answer through unchanged, including `readFrom` and `inProcessRingCount`, so the two numbers are never
 * conflated. It bounds `limit` to 200 and REFUSES an out-of-range value by name instead of clamping it — a clamp
 * answers a different question than the one asked. A legacy open row (no `typeInput`/`typeMatchedBy`) reads null +
 * `typeMatchedByMeans` here exactly as it does there.
 */
function toolMeetingReceiptsView(args = {}, { kernel } = {}) {
  const meetings = kernel && kernel.meetings
  if (!meetings || typeof meetings.receiptsView !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meetings face is published, so the receipt ring cannot be read',
      'assemble a kernel with the meetings service (the ring is written by that service\'s open/close path, so there is nothing to read without it)')
  }
  let limit = null
  if (args.limit !== undefined && args.limit !== null) {
    const n = Number(args.limit)
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'receiptsView limit must be an INTEGER from 1 to 200 (the kernel ring holds at most 200 rows); got ' + JSON.stringify(args.limit),
        'pass limit: 50 (the default) or any integer in 1..200 — the ring is bounded at 200, so a larger limit could never return more rows, and a smaller one asks a narrower question; the answer carries `available` and `dropped` so the bound is visible')
    }
    limit = n
  }
  const read = limit === null ? meetings.receiptsView() : meetings.receiptsView({ limit })
  return Object.assign({ tool: 'vibe_v5_meeting', action: 'receiptsView', receiptRingMeans: 'the meetings service\'s receipt LEDGER: the kernel reads the DURABLE meetings fold first (every kernel sharing this store root sees the same receipts) and falls back to its own in-process ring only when the fold seam is absent — `readFrom` says which answered, `available` is how many rows that source held, `count` how many this read returned, `dropped` = available − count, `ringDropped` how many rows the bounded ring discarded, and `inProcessRingCount` THIS kernel instance\'s own ring length (reported separately, never used to overwrite the fold). This is a READ: nothing is replayed, nothing is re-recorded. An open row carries the input provenance (`typeInput`/`typeMatchedBy`), with null + `typeMatchedByMeans` for rows recorded before RUN 77/78' }, read)
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

/** ★ WAVE 2 (audit E33): the six declared meeting types as a READ. Before this, the vocabulary was only readable
 * by convening with a WRONG word and reading the refusal's `the declared types are: ...`. Each row carries its `kind`,
 * the `procedure.steps` count the catalogue BINDS it to, and the tool-face narrowing it applies.
 *
 * WHERE THE ROWS COME FROM — no second hand-maintained table: the types and their steps are
 * `packs/v5r/meeting-procedures.js` (`MEETING_TYPES` / `MEETING_PROCEDURES`, read through `procedureFor`), the narrowing
 * is `packs/v5r/meeting-tool-face.js` (`MEETING_TYPE_TOOL_FACES`, read through `meetingTypeFace`). `typeCatalogSource`
 * names both files, because a read face that cannot say where its rows live is a table pretending to be a fact.
 */
function meetingTypeCatalog() {
  const types = MEETING_TYPE_IDS.map((id) => {
    const row = meetingTypeOf(id)
    const procedure = procedureFor(id)
    const face = meetingTypeFace(id)
    const steps = procedure && procedure.procedure && Array.isArray(procedure.procedure.steps)
      // the declared steps are OBJECTS ({ step, why, ... }) — handed back as declared, never flattened to prose here
      ? procedure.procedure.steps.map((step) => (step && typeof step === 'object' ? Object.assign({}, step) : step))
      : []
    return {
      type: String(id),
      kind: str(row && row.kind ? row.kind : 'meeting-type'),
      label: row ? str(row.label || '') : '',
      // ★ TB-2715: the accepted INPUT words are listed next to the displayed label, so a Chinese caller reading the
      // catalog never has to translate: `type:"结题"` and `type:"closure"` reach the same meeting.
      aliases: Array.isArray(MEETING_TYPE_ALIASES[id]) ? MEETING_TYPE_ALIASES[id].slice() : [],
      purpose: row ? str(row.purpose || '') : '',
      declared: Boolean(face && face.declared),
      subjectRequired: Boolean(procedure && procedure.subjectRequired),
      hasProcedure: steps.length > 0,
      procedureSteps: steps.length,
      procedure: { steps, count: steps.length },
      narrowed: Boolean(face && face.narrowed === true),
      narrowingTo: face && face.narrowed === true && Array.isArray(face.allow) ? face.allow.length : null,
      allowedTools: face && face.narrowed === true && Array.isArray(face.allow) ? face.allow.slice() : null,
      narrowingReason: face && face.reason ? String(face.reason) : null,
      undeclared: Boolean(procedure && procedure.known === false),
    }
  })
  return {
    ok: true,
    tool: 'vibe_v5_meeting',
    action: 'types',
    count: types.length,
    types,
    typeCatalogSource: 'packs/v5r/meeting-procedures.js::MEETING_TYPES + MEETING_PROCEDURES (kind / procedure.steps / subjectRequired) × packs/v5r/meeting-tool-face.js::MEETING_TYPE_TOOL_FACES (工具面收窄)',
    means: '六型就是从这两张声明里读出来的，这里没有第二份手维表。convene 时 type 对着同一份目录校验，工具面收窄也在同一轮打开（applyMeetingTypeFace）；`procedureSteps` 是该型被绑定的必走步数，空就是「不绑步骤」而不是「没有程序」（看 `hasProcedure`）。',
  }
}

/** The caller of THIS turn (turn-tool record → learned member session → exact roster id); null for the office. */
function callerFromTurn(kernel, exec) {
  // a ROSTER ID STRING (or null) — never an object with `.id`
  try { const m = resolveTurnMember(kernel, exec); if (!m) return null; return typeof m === 'string' ? m : (m.id ? String(m.id) : null) } catch { return null }
}

/**
 * ★★★ TB-2763 (RUN 81 attempt-3, FEEDBACK81 D-6, reproduced twice on m3/m6): the agenda string is ONE stored line whose
 * separators are `;`, `；` and newlines — but the split was UNCONDITIONAL, so an agenda that WROTE about a separator
 * (`…中文分号作分隔（；）；…`) was cut INSIDE the parentheses and minted empty-shell items (`"中文分号作分隔（"`, `"）"`).
 * The splitter now tracks PAIRED brackets `（）()[]【】` and quotes `""''「」“”‘’` (nesting via a depth stack) and only cuts
 * at depth 0. Unpaired input is NOT silently split as if level 0: the caller receives `balanced:false` + which token is
 * unclosed, and the pre-fix top-level split is used as the documented fallback.
 */
const AGENDA_BRACKET_PAIRS = Object.freeze({ '（': '）', '(': ')', '[': ']', '【': '】', '「': '」', '“': '”', '‘': '’' })
const AGENDA_BRACKET_CLOSERS = new Set(Object.values(AGENDA_BRACKET_PAIRS))
function splitAgendaText (text) {
  const src = String(text === undefined || text === null ? '' : text)
  const parts = []
  const stack = [] // expected closers, innermost last
  const unbalanced = []
  let quote = null // a straight " or ' that was opened and not yet closed
  let buf = ''
  for (const ch of src) {
    if (stack.length === 0 && quote === null && (ch === ';' || ch === '；' || ch === '\n')) { parts.push(buf); buf = ''; continue }
    if (quote !== null) { if (ch === quote) quote = null; buf += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (Object.prototype.hasOwnProperty.call(AGENDA_BRACKET_PAIRS, ch)) { stack.push(AGENDA_BRACKET_PAIRS[ch]); buf += ch; continue }
    if (stack.length > 0 && ch === stack[stack.length - 1]) { stack.pop(); buf += ch; continue }
    if (AGENDA_BRACKET_CLOSERS.has(ch)) { unbalanced.push({ kind: 'bracket', open: null, expected: ch }); buf += ch; continue }
    buf += ch
  }
  parts.push(buf)
  for (let i = stack.length - 1; i >= 0; i -= 1) unbalanced.push({ kind: 'bracket', open: null, expected: stack[i] })
  if (quote !== null) unbalanced.push({ kind: 'quote', quote })
  const items = parts.map((x) => x.trim()).filter((x) => x !== '')
  const balanced = unbalanced.length === 0
  // Unpaired input: keep the PRE-FIX behaviour (top-level split) so nothing silently moves between items, and let the
  // receipt name the fallback instead of pretending the brackets were understood.
  return balanced
    ? { items, balanced: true, unbalanced: [] }
    : { items: src.split(/[;；\n]/).map((x) => x.trim()).filter((x) => x !== ''), balanced: false, unbalanced }
}

function toolMeeting(args = {}, { kernel, exec } = {}) {
  // ★★★ RUN 248-N / task-67: ONE action word, resolved once. `op` is the alias the appointment notice prints
  // (`{op:"attend", …}`); `action` is the older spelling. Resolving it here keeps the two dispatch tables (this face and
  // `validateMeetingArgs`, which the host funnel runs FIRST) in step — a word known to only one of them is a word that
  // is refused before it dispatches.
  const actionWord = args.action === undefined || args.action === null ? '' : String(args.action).trim()
  const opWord = args.op === undefined || args.op === null ? '' : String(args.op).trim()
  const actionName = actionWord !== '' ? actionWord : opWord
  // ★★ ROUND 47: the rulings READ lives on this face (the pack owns the ruling cards it teaches members to file).
  if (String(actionName) === 'rulings') return toolMeetingRulings(args, { kernel })
  // ★★★ ROUND 78 / TB-2731 (FEEDBACK78 D3): the kernel's `receiptsView` ring had NO tool face, so a real run that needed
  // "what was recorded" could only write NO-EVIDENCE. Same kernel ring, no second store; `limit` is bounded and an
  // out-of-range value is refused BY NAME (clamping would answer a different question than the one asked).
  if (String(actionName) === 'receiptsView') return toolMeetingReceiptsView(args, { kernel })
  // ★ WAVE 2 (audit E33): `action:"types"` is a READ of that same catalogue — six rows, their declared
  // `procedure.steps` count and the narrowing each applies to the tool face. It dispatches BEFORE `validateMeetingArgs`
  // because that validator owns the *convene* vocabulary and would refuse a word that means "read".
  if (String(actionName) === 'types') return meetingTypeCatalog()
  // ★★ FINDING (j) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12): the agent opened a SCHEDULED
  // meeting and then read it back with `{action:'status', id}` on THIS face; it got
  // 「VMU_INVALID_ARGUMENT: meeting needs an agenda」 and reasonably suspected that status had fallen through to the
  // open branch. The dispatch was not the defect — this face NEVER dispatches: it only convenes, so `action` was
  // silently ignored and the call became "convene a meeting with no agenda". A refusal that names a missing field the
  // caller never meant to supply is worse than a bare refusal: it sends the reader to fix the wrong thing. An `action`
  // (or the read-only keys a status call carries) is now refused BY NAME and pointed at the face that answers it.
  if (args.action !== undefined && args.action !== null || args.op !== undefined && args.op !== null) {
    const refusal = validateMeetingArgs(args)
    // ★ RUN 84: `validateMeetingArgs` returns NULL when the word is ALIGNED with this face (convene = its own verb:
    // it dispatches, the receipt still carries no round). Reading `.code` off null turned an aligned call into a
    // TypeError — declaring alignment and then crashing on it is the same defect in a new costume.
    if (refusal) throw refuse(refusal.code, refusal.message, refusal.hint)
  }
  // ★★★ RUN 248-N / task-67 — `attend`, the third word the appointment notice prints. It marks a member PRESENT in a
  // SERVICE meeting (the kernel face owns the seat/timing/late-admission rules and refuses by name); this branch only
  // resolves WHO and WHICH meeting and passes them through, so the printed call and the reachable call are one call.
  if (String(actionName) === 'attend') {
    const meetings = kernel && kernel.meetings
    if (!meetings || typeof meetings.attend !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meetings face is published, so attendance cannot be recorded',
        'assemble a kernel with the meetings service (the appointment notice is only a promise until the kernel that wrote it can seat you)')
    }
    const meetingId = has(args.id) ? str(args.id).trim() : (has(args.meeting) ? str(args.meeting).trim() : '')
    if (meetingId === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'attend needs the meeting id the appointment named',
        'pass id:"<meeting>" (the appointment row and its notice line print it) or meeting:"<meeting>"')
    }
    const seatMember = has(args.member) && str(args.member).trim() !== '' ? str(args.member).trim() : callerFromTurn(kernel, exec)
    if (!seatMember) {
      throw refuse('VMU_INVALID_ARGUMENT', 'attend needs the member taking the seat',
        'pass member:"<member id>", or call it from that member\'s own turn (the turn knows who is speaking)')
    }
    const seated = meetings.attend({ meeting: meetingId, member: seatMember })
    return Object.assign({ ok: true, tool: 'vibe_v5_meeting', op: 'attend', action: 'attend', registry: 'service', meeting: meetingId, member: seatMember }, seated && typeof seated === 'object' ? seated : {})
  }
  // ★★ RUN 198 (run 38 FEEDBACK37 2.3): the old refusal was one line and only covered the ABSENT case — an agenda of
  // spaces convened a room nobody could state the purpose of, and a reader who mistook this face for the read face was
  // told to pass a field they never meant to supply. The refusal now says WHICH case it is, what the agenda IS once
  // stored (the meeting's `materials`, what status/summary/the board read back) and where the reader who meant to READ
  // actually belongs.
  // ★ RUN 198 correction: `has()` ALREADY trims (`kit/handlers.js:12`), so `!has(agenda)` is true for a blank agenda
  // too — branching the two cases on `has()` made the empty case unreachable and reported every blank agenda as
  // "none was passed". Presence is what tells them apart.
  const agendaGiven = args.agenda !== undefined && args.agenda !== null
  // ★★★ RUN 204 (FEEDBACK41 1.2): a STRUCTURE is not an agenda. This face stored `str(args.agenda)`, so an object became
  // the minutes line "[object Object]" — a meeting whose stated purpose is a JavaScript type name — and a bare array was
  // silently joined with commas. The stored agenda is ONE LINE OF TEXT, and the face now says so instead of stringifying.
  let agendaText = ''
  // ★ RUN 239-E (FEEDBACK62 #9): the agenda as ITEMS too, in the order the caller gave them. An array agenda is joined
  // with "; " into the one line the kernel stores as `materials`; keeping the list lets the receipt read the lines back
  // instead of making a reader split a sentence.
  let agendaItems = []
  if (agendaGiven && typeof args.agenda !== 'string') {
    if (!Array.isArray(args.agenda)) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'meeting needs an agenda as TEXT, and you passed a ' + (typeof args.agenda) + ' — it would be stored as "'
          + String(args.agenda) + '", which is a JavaScript type name, not a purpose',
        'pass agenda:"what this meeting is for" (one line of text). An ARRAY is accepted only as a list of NON-EMPTY strings, joined with "; ". `title` is a SEPARATE optional name.')
    }
    const kept = args.agenda.filter((x) => typeof x === 'string' && x.trim() !== '')
    if (kept.length === 0) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'meeting needs an agenda as TEXT, and the array you passed holds no non-empty string (' + String(args.agenda.length) + ' item(s))',
        'pass agenda:"what this meeting is for", or an array holding at least one non-empty string.')
    }
    agendaItems = kept.map((x) => x.trim())
    agendaText = agendaItems.join('; ')
  } else {
    agendaText = str(args.agenda)
    // ★★★ RUN 206 (run 44 / FEEDBACK43 1.3, MEASURED): the schema says `agenda` is a STRING, so a caller who wanted to
    // pass a structure sent its JSON TEXT — `agenda:"{\"议题\": \"偶数\"}"` was accepted verbatim and stored as the
    // meeting's purpose, so the minutes recited a brace-and-quote blob nobody can read as a reason. A serialized JSON
    // OBJECT/ARRAY is refused by name here; a JSON STRING/NUMBER is left alone (it can be a real title).
    const trimmed = agendaText.trim()
    if ((trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}')
      || (trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']')) {
      let parsedBlob = null
      try { parsedBlob = JSON.parse(trimmed) } catch (e) { parsedBlob = null }
      if (parsedBlob !== null && typeof parsedBlob === 'object') {
        // ★★★ RUN 211 (run 48 / FEEDBACK47 1.3, MEASURED): the same ARRAY agenda was accepted in one meeting (because
        // `formal_agenda:true` routed it through the array branch) and refused in the next, because the tool schema
        // declares `agenda` as a STRING and the caller's array reached this face as its JSON TEXT. Whether an agenda
        // shape is legal depended on an UNRELATED boolean flag. A serialized JSON ARRAY of non-empty strings is now read
        // as a list of agenda lines (same join as the array branch) — the shape means the same thing whichever door the
        // argument came through. A serialized OBJECT is still refused: it is a blob, not a purpose.
        if (Array.isArray(parsedBlob)) {
          const keptBlob = parsedBlob.filter((x) => typeof x === 'string' && x.trim() !== '')
          if (keptBlob.length === 0) {
            throw refuse('VMU_INVALID_ARGUMENT',
              'meeting needs an agenda as TEXT, and the JSON array you passed holds no non-empty string (' + String(parsedBlob.length) + ' item(s))',
              'pass agenda:"what this meeting is for", or a JSON array / array holding at least one non-empty string — every item must be TEXT (a nested object is not an agenda line)')
          }
          agendaItems = keptBlob.map((x) => x.trim())
          agendaText = agendaItems.join('; ')
        } else {
          throw refuse('VMU_INVALID_ARGUMENT',
            'meeting needs an agenda as a PURPOSE, and you passed its JSON TEXT (' + trimmed.slice(0, 80) + '…) — storing that would make the minutes recite a blob instead of a reason',
            'pass agenda as one sentence of text (e.g. agenda:"判断偶数之和是否仍为偶数"), and put structured detail in `subject`/`title`; a serialized object is not a purpose (a serialized ARRAY of strings IS read as a list of lines)')
        }
      }
    }
  }
  // ★ RUN 239-E: a one-line agenda is ONE stored line; its boundaries are the "; " join the array form uses, so
  // splitting on that separator is the inverse of the join, not a new segmentation rule. This does NOT claim the kernel
  // keeps N items — the kernel face owns that reading (lane-g2 adds kernel `agendaItems`); `agendaItemsSource` says
  // which door produced this list.
  // ★ ROUND 79 / TB-2740 (FEEDBACK79 B9): the STRING path is now challenged on its own, so its separators are DECLARED:
  // `;`, `；` and a newline split; `,` and `、` do NOT (a purpose like "确认 (2k−1,2k) 的界" is ONE item — a comma is
  // punctuation inside a sentence, and `、` is a list marker inside Chinese prose, not an agenda boundary). An ARRAY
  // agenda keeps its elements VERBATIM: its items are never re-split by any separator.
  // ★★★ TB-2763: ONE bracket/quote-aware splitter for BOTH single-source doors (`agenda` and the legacy
  // `materials` name); `agendaSplit` is what the receipt prints as the mode + the unpaired-token reading.
  let agendaSplit = null
  if (agendaItems.length === 0 && agendaText.trim() !== '') {
    agendaSplit = splitAgendaText(agendaText)
    agendaItems = agendaSplit.items
  }
  // ★★★ TB-2750 follow-up (RUN 80 / F80-2, LEAD DECISION "option ②"): `materials` is the KERNEL-side name for this
  // same stored line, so — having refused the BOTH-supplied call above — the legacy name has to be legal ALONE as well.
  // Otherwise this face's own conflict hint would name a call it refuses (agenda required): a repair path that does not
  // exist. This is NOT a second "material content" slot; it is the same one line under its old name, and the receipt
  // names which name supplied it (`agendaSource` / `agendaItemsSource`).
  const agendaFromLegacyName = !has(args.agenda) && has(args.materials)
  if (agendaFromLegacyName) {
    agendaText = str(args.materials)
    if (agendaText.trim() !== '') {
      agendaSplit = splitAgendaText(agendaText)
      agendaItems = agendaSplit.items
    }
  }
  if (!has(args.agenda) && !agendaFromLegacyName) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'meeting needs an agenda — ' + (agendaGiven
        ? 'the one you passed is EMPTY after trimming (whitespace is not a purpose)'
        : 'none was passed')
        + '. The agenda is not a label: it is stored as the meeting\'s `materials` and it is what `status`/`summary`/the board read back, so a meeting without one is a room nobody can say the purpose of',
      'pass agenda:"what this meeting is for" — for example agenda:"decide whether p-evenprod settles at 1 (debate)", agenda:"close the run and file the account", agenda:"plan the next two steps". `title` is a SEPARATE optional name. If you meant to READ a meeting, that is vibe_vmu_meeting { action: "status" | "summary", id } — this face only convenes.')
  }
  // ★ PHASE 12 — before this line, `requireSeat` let ANY member convene and 「会议只能由院士召开」 was only a sentence in
  // a prompt. The slot is the pack's own declared vocabulary (the kernel never learns what "academician" means), so the
  // gate belongs here, where both the caller id and its seat are known. The kernel holds the matching SHAPE gate
  // (`vmu.meetings.conveneRequiresChair`: a convene that installs a chair must name that chair as its actor) — two
  // locks, because a member calling the kernel directly is the other door, and neither lock claims to be the whole door.
  // ★ LIVE RUN 128 (F-128d): the chair's OWN turn called convene without `member` and got 「meeting (convening) needs
  // the acting member id」 — while the primitive face had just been taught to read the caller from the turn (F-127a)
  // and the host hands every handler the same `exec`. Two faces of one institution disagreed about whether the turn
  // knows who is calling. An explicit `member` still wins (the office relays for a seat); otherwise the turn answers.
  const memberFromTurn = has(args.member) && str(args.member).trim() !== '' ? null : callerFromTurn(kernel, exec)
  const member = requireChairSeat(kernel, has(args.member) && str(args.member).trim() !== '' ? args.member : memberFromTurn, 'meeting (convening)').id
  const liveRoster = membersOf(kernel).roster().filter((m) => m.state === 'live').map((m) => m.id)
  // ★ WAVE 2 (audit E9): 「设定了会议参与人员就在范围内」 had no door on this face — the roster was ALWAYS every live
  // member, so a chair narrowing the meeting could not narrow anything. `members` (and its alias `roster`) is now read
  // here and handed to the kernel, which validates it (index-naming refusals) and records where it came from.
  const declaredRoster = has(args.members) ? args.members : (has(args.roster) ? args.roster : null)
  const roster = declaredRoster === null ? liveRoster : declaredRoster
  // ★ GOAL ROUND 3 — THE TYPE. Until now this line was `type: 'ordinary'` HARDCODED into the call below: the rule says
  // 「院士可以设置会议的类型」 and the academician could not set it at all. The type is now a parameter, validated against
  // the pack's own catalog with the legal list named in the refusal; the kernel ADDITIONALLY validates it against the
  // declared `vmu.meetings.typeCatalog` when the institution declares that key, so the vocabulary is tunable without code.
  // ★ TB-2715 (RUN 76 / FEEDBACK63 C18): a Chinese alias is a LEGAL input, not a typo to be corrected by the chair.
  // `meetingTypeOf` resolves id first, then the pack's own alias table (空白 / `/` 容忍), and says which door matched.
  // `type` below is ALWAYS the canonical id — the alias never reaches the kernel, so no second vocabulary is stored.
  const typeGiven = has(args.type)
  const typeInfo = meetingTypeOf(typeGiven ? str(args.type) : 'ordinary')
  if (!typeInfo.known) {
    // The sentence keeps the ENGLISH ids first (old callers and pins read it that way) and then the pair list
    // 「id（中文标签；别名…）」 so a Chinese user is told the accepted words instead of being sent to learn a closed set.
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown meeting type: "' + typeInfo.type + '"',
      'the declared types are: ' + MEETING_TYPE_IDS.join(', ') + ' — with Chinese aliases: ' + meetingTypePairs()
      + ' — declare vmu.meetings.typeCatalog to change the vocabulary')
  }
  const type = typeInfo.type
  const typeInput = typeGiven ? str(args.type) : null
  // "default" is the convention default ordinary, not a match: a caller who passed nothing did not "match an id".
  const typeMatchedBy = typeGiven ? typeInfo.matchedBy : 'default'
  // ★ LIVE RUN 122 (E6, second half): `kind` DEFAULTED to 'sync'. That default is what let the label rail stay
  // unreachable on the only face that turns it on (r122a convened m2 with neither title nor kind and read back
  // "kind":"sync"). The default is KEPT — `sync` is a legal kind and a framework that always has a word for the
  // meeting is easier to live with than one that refuses every unlabelled convene — but its PROVENANCE is now printed
  // (`kindSource`), so 「'sync' 这条标签是谁写的」 can be read off the receipt instead of guessed. A caller that passes
  // no label at all therefore gets: a legal kind, and an explicit "default, not chosen".
  const kindGiven = has(args.kind) && String(args.kind).trim() !== ''
  // ★★ RUN 191 (run 35 / FEEDBACK34 2.3, MEASURED): A DEBATE USED TO BE FILED AS `sync`. Run 35 convened
  // `type:"debate"` and `type:"closure"` meetings, read `kind:"sync", kindSource:"default"` on BOTH, and — correctly —
  // called that a contradiction with the `typeMeans` sentence added in RUN 189 (which says type decides the procedure and
  // kind is the archive label). A filled-in default that CONTRADICTS the known type is not neutral: an archive reader sees
  // a "sync meeting" that was in fact a debate. When no kind is passed the label is now DERIVED from the type where the
  // type names one, and the receipt says the derivation happened (`kindSource:"derived-from-type"`) instead of pretending
  // a caller chose it. `sync` remains the fallback for a type with no natural label.
  const KIND_BY_TYPE = { debate: 'verify-request', closure: 'solve-vote', division: 'division' }
  const kind = kindGiven ? str(args.kind) : (KIND_BY_TYPE[type] || 'sync')
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
      'MINIMAL CALL for this type: { type:"' + type + '", agenda:"what this meeting decides", title:"<short label>" } — '
        + (type === 'closure'
          ? 'a CLOSURE meeting takes an AGENDA and nothing else (no subject: it closes the institute, it does not debate an object). '
          : 'an ordinary meeting takes an AGENDA and nothing else; ')
        + 'to debate an OBJECT convene with type:"debate" and subject:"<card id or file reference>". ★ `target` on THIS face is an ALIAS of `subject`; on vibe_vmu_meeting `target` is a VOTE\'s object')
  }
  if (typeInfo.subjectRequired && (subject === null || String(subject).trim() === '')) {
    throw refuse('VMU_INVALID_ARGUMENT', 'a ' + type + ' meeting needs a subject: the object of the debate',
      'pass subject:"<card id carrying a finished written proof | file reference>" — a one-line proposition is not an object (the debate gate refuses it by name)')
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
    // ★★ RUN 200: a declared proof pointer that names nothing is not a refusal this gate can make (the rule admits a
    // DECLARATION), but a receipt that stays silent about it is how run 39 locked a card onto a file that lived in the
    // wrong tree. The gate predicate stays pure; the resolution is attached beside it, by name and with its reason.
    if (subjectGate && subjectGate.declaredProofRef && kernel && kernel.library && typeof kernel.library.resolvePointer === 'function') {
      // ★★ RUN 203 (run 41 / FEEDBACK40 1.4, MEASURED): the means said `exists:false` means "not inside the library root",
      // while run 41's own pointer was INSIDE the root and merely missing — the receipt contradicted itself in two fields
      // a reader is meant to act on. One sentence per reason: "missing" and "outside the library" are different repairs.
      const pointer = kernel.library.resolvePointer(subjectGate.declaredProofRef)
      const pointerWhy = pointer.exists === true
        ? 'it RESOLVED: the pointer names a real file inside the library root (' + String(pointer.relativePath) + ')'
        : pointer.reason === 'missing'
          ? 'it did NOT resolve because NO FILE EXISTS at that path yet (reason "missing", `insideLibrary:true`) — the pointer is well formed and inside the library root; a file written in the SESSION WORKING DIRECTORY is not there'
          : pointer.reason === 'absolute'
            ? 'it did NOT resolve because the pointer is an ABSOLUTE path (reason "absolute") — a card pointer must be RELATIVE to the library root'
            : pointer.reason === 'escapes'
              ? 'it did NOT resolve because the pointer climbs OUT of the library root (reason "escapes", e.g. a .. segment)'
              : pointer.reason === 'empty'
                ? 'it did NOT resolve because no pointer was given at all (reason "empty")'
                : 'it did NOT resolve (reason "' + String(pointer.reason) + '") — see `proofPointer.means` for the library own sentence'
      subjectGate = Object.assign({}, subjectGate, {
        proofPointer: pointer,
        proofPointerMeans: 'the debate gate admitted this card on a DECLARATION; this line is the LIBRARY answer about WHERE the declared pointer points. ' + pointerWhy,
      })
    }
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
  // ★★★ RUN 248-N / task-67: `op:"appoint"|"schedule"` are the words the appointment notice teaches. They convene the
  // same way `convene` does — the kernel owns scheduling — with ONE extra promise: `schedule` must name WHEN. `at` is the
  // kernel spelling, `scheduledFor` the notice spelling; both reach the kernel untouched, and `schedule` without a time
  // is refused here BY NAME instead of silently convening an immediate meeting (which is the exact confusion the two
  // words exist to remove: "预约" is a time, "召开" is now).
  const appointWord = String(actionName) === 'appoint' || String(actionName) === 'schedule' ? String(actionName) : null
  const atRaw = has(args.at) ? args.at : (has(args.scheduledFor) ? args.scheduledFor : null)
  if (appointWord === 'schedule' && (atRaw === null || String(atRaw).trim() === '')) {
    throw refuse('VMU_INVALID_ARGUMENT', 'action "schedule" needs `at` (or its alias `scheduledFor`): a scheduled meeting is one whose START the chair named',
      'pass at:"<ISO-8601 time>" or scheduledFor:"<the same time>" — use `op:"appoint"` (or plain convene) for a meeting that starts now')
  }
  const at = atRaw === null ? null : atRaw
  // ★★★ RUN 225-B / RUN 255 rev3: per-meeting late-admission policy - forwarded when given, left to the kernel default
  // when not. The kernel default is "chair" (kernel/meetings.js lateAdmissionOf: `typeof m.lateAdmission === 'string' ?
  // ... : 'chair'`): a late arrival is HELD AT THE DOOR until the chair calls admit(). The old comment said "open" —
  // the wording had drifted from the mechanism, so a caller was told the opposite of what would happen.
  // The default lives in ONE place (kernel/meetings.js) or the same default drifts in two layers. A non-string is refused
  // here by name: a type error should not travel into the kernel and come back as a vague complaint.
  const lateAdmissionRaw = has(args.lateAdmission) ? args.lateAdmission : null
  if (lateAdmissionRaw !== null && typeof lateAdmissionRaw !== 'string') {
    throw refuse('VMU_INVALID_ARGUMENT', 'lateAdmission must be a string; got ' + typeof lateAdmissionRaw,
      'REACHABLE INSTEAD: 调 vibe_vmu_meeting {action:"attend"} 时把 lateAdmission 写成 "open"|"chair"|"refuse" — "open" 直接放行（late:true），"chair" 是默认（把人挡在门口，等主席调 vibe_vmu_meeting {action:"admit", id:"<会议 id>", member:"<迟到成员 id>"} 放行），"refuse" 具名拒绝并给两条修法')
  }
  const lateAdmission = lateAdmissionRaw === null ? null : lateAdmissionRaw.trim()
  if (lateAdmission === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'lateAdmission was given but names no policy',
      'REACHABLE INSTEAD: 把 lateAdmission 写成 "open"|"chair"|"refuse" 三者之一，或整项省略（内核默认 "chair"：迟到的席位被挡在门口，等主席调 vibe_vmu_meeting {action:"admit", id:"<会议 id>", member:"<迟到成员 id>"} 放行）')
  }
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
  // ★ RUN 248-N / task-67: `wallLimitMs` is the kernel's own spelling of the same bound (`durationMs` is this face's), and
  // `materials` the kernel's spelling of the stored agenda line. Both are DECLARED now because the host funnel refuses
  // undeclared keys before the handler — a caller reading the kernel-side signature gets a named answer, not a mystery.
  const wallLimitMsRaw = has(args.wallLimitMs) && args.wallLimitMs !== null && args.wallLimitMs !== '' ? args.wallLimitMs : null
  const wallLimitMs = wallLimitMsRaw === null ? durationMs : Number(wallLimitMsRaw)
  if (wallLimitMsRaw !== null && (!Number.isInteger(wallLimitMs) || wallLimitMs < 300000 || wallLimitMs > 7200000)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'wallLimitMs must be an integer inside [300000, 7200000] (30 minutes .. 2 hours); got ' + JSON.stringify(wallLimitMsRaw),
      'pass this meeting\u2019s own upper bound in ms (or its alias durationMs), or omit it to use vmu.meetings.hardLimitMs')
  }
  // ★★★ TB-2750 / RUN 80 (F80-2, MEASURED on the 80th live run): `agenda` and `materials` are TWO NAMES FOR ONE STORED
  // LINE, and this face let the SECOND one win silently. The run passed an agenda of three items AND a materials string;
  // the stored line was the materials text, `agendaItems` read back as two materials lines, and the receipt still said
  // `agendaInputShape:"string"` — so the caller believed its three-item agenda had been recorded. A face that answers two
  // names for one slot must never pick one behind the caller's back: with BOTH supplied it refuses BY NAME and spells out
  // the two legal ways to say the same thing (pass the agenda alone, or the legacy materials alone).
  const agendaNamedBoth = has(args.agenda) && has(args.materials)
  if (agendaNamedBoth) {
    throw refuse('VMU_MEETING_AGENDA_CONFLICT',
      'both `agenda` and `materials` address the SAME stored line, so passing both would silently drop one (the previous behaviour let materials win and still reported the agenda shape)',
      'pass ONE of them: agenda:"what this meeting is for" (the preferred name; one string, or an array of non-empty lines joined with "; "). `materials` is the SAME stored line under the KERNEL-side old name: a legacy caller may pass materials:"the same one line" ALONE (that single-source form is accepted), but never both, and it is NOT a second "material content" slot — if you mean material content, write it INSIDE the agenda text. The read faces (status/summary/board) return that one line either way',
      { agendaInputShape: Array.isArray(args.agenda) ? 'array' : 'string', materialsSupplied: true,
        reachableInstead: 'vibe_v5_meeting { agenda: "…" } — or vibe_v5_meeting { materials: "…" } — never both (the two names store ONE line; each single-source form is legal)' })
  }
  const materialsText = has(args.materials) ? str(args.materials) : agendaText
  // (TB-2750) `agenda` is REQUIRED on this face, so `materials` can only ever arrive ALONGSIDE it — which the block above
  // now refuses by name. There is therefore no receipt flag to add here: a convene that returns has exactly one agenda
  // source, and `agenda`/`agendaItems` in the receipt are that source.
  // ★ RUN 240-I: the declaration used to STOP HERE. `formal_agenda:true` was echoed into this face's receipt while the
  // kernel was never told, so the stored meeting carried no agenda row and every read face returned
  // `formalAgendaItems:null` forever (live run 63). The kernel now stores what is said (a boolean declaration or an
  // ordered list), so the face passes the argument through untouched instead of folding it into `=== true`.
  const formalAgendaParam = args.formal_agenda === undefined ? null : args.formal_agenda
  const opened = kernel.meetings.open({ ...(wantedId !== null ? { id: wantedId } : {}), type, typeInput, typeMatchedBy, chair: member, actor: member,
    ...(declaredRoster === null ? { roster } : { members: declaredRoster }),
    // ★ WAVE 2 (audit E6): 「会议要有有意义的标签」 is enforced on the face the rule talks about. The kernel rail is
    // opt-in (`labelRequired`) so direct service callers and the ~70 unlabelled fixtures keep working; a PACK face that
    // is the rule's own tool passes true and gets the named refusal when neither `kind` nor `title` was given.
    labelRequired: true, kind, materials: materialsText, secretary, wallLimitMs,
    // ★★★ TB-2776: hand the READ face the items THIS face already split (bracket/quote aware, TB-2763). The kernel stores
    // them and every read projection returns them verbatim — otherwise the read face re-split the joined line on every
    // `;`/`；` and a `；` inside `（…）` turned 3 items into 4 on the very same meeting.
    ...(Array.isArray(agendaItems) && agendaItems.length > 0 ? { agendaLines: agendaItems } : {}),
    ...(formalAgendaParam === null ? {} : { formalAgenda: formalAgendaParam }),
    ...(lateAdmission === null ? {} : { lateAdmission }),
    subject: subject === null || subject === undefined ? null : subject, at, title, sequence,
    subjectGate: subjectGate ? { allowed: true, applicable: subjectGate.applicable === true, form: subjectGate.form || null,
      proofVia: subjectGate.proofVia || null, provenance: subjectGate.provenance || null, proofBasis: subjectGate.proofBasis || null,
      // ★ 闸判过的形态与它「没核过什么」一起发布：只给 proofChecked 的话，`proofContentChecked:false` 这条披露就消失在回执里。
      proofChecked: subjectGate.proofChecked === true, proofContentChecked: subjectGate.proofContentChecked === true,
      looksLikeIdentifier: subjectGate.looksLikeIdentifier === true, note: subjectGate.note || null,
      // ★ RUN 200: the library answer about WHERE the declared pointer points travels with the admission, because run 39
      // read the silence as "the pointer was checked". The gate itself stays a pure predicate over its own inputs.
      proofPointer: subjectGate.proofPointer || null, proofPointerMeans: subjectGate.proofPointerMeans || null } : null,
    procedure: procedureFor(type) })
  // ★ 可读回的事实：预约不是"一个被收下的参数"，而是会议对象的状态。`state`/`scheduledFor` 由内核回执给出，
  // 这一面只转述；`scheduleNote` 只在真的进入 scheduled 时出现（不要给立即召开的会议编一句预约说明）。
  // ★★★ RUN 223 (run 59 / FEEDBACK58 A, MEASURED BY ABSENCE): 「院士可以设置……邀请入会的成员」was a LIST, never
  // an ACT. convene narrowed the roster and printed it, and then nothing told those members a meeting existed: a member
  // learned about it only inside a turn that someone else drove (`vibe_vmu_turn { op:"drive" }`). Two rails for exactly
  // this have existed for many rounds — the durable mailbox (`kernel/mailbox.js send`, used by assign/nudge above) and
  // the meetings wake seam (`kernel/meetings.js wake`, RUN 198) — and no convene ever called either one.
  // WHAT THIS DOES NOT CLAIM: a mailed invitation is not a live wake. The mail is DURABLE and is read at the member's
  // next turn (or by `vibe_v5_inbox`); `woken` is non-empty only when the deployment actually injects a wake seam; and
  // `unreachable` means the MAIL itself did not go out — the convene still stands (a delivery failure must never roll
  // back an academic act; same rule as RUN 185's freeze).
  const invitedMembers = (() => {
    const rows = (opened && Array.isArray(opened.roster)) ? opened.roster : []
    return rows.map(String).filter((id) => id !== '' && id !== String(member))
  })()
  // ★★★ RUN 248-N / task-67 — THE DOUBLE SEND IS GONE. RUN 223 gave THIS face its own invitation mail
  // (`kernel.mailbox.send('office', { kind: 'meeting-invitation' })`), while the kernel's `open()` had meanwhile started
  // writing the AUTHORITATIVE appointment row (kind "meeting-appointment", channel "mail", carrying chair / seat /
  // scheduledFor / the exact attend call). One convene therefore produced TWO rows per invitee and TWO notice lines —
  // and the second one was strictly less true than the first. The kernel is now the SINGLE delivery point; this face
  // only REPORTS what it did, and the `invitation` block keeps the RUN 223 field shape (attempted / kind / delivered /
  // woken / unreachable / means) so an old reader still reads something true.
  const kernelNotified = Array.isArray(opened && opened.notified) ? opened.notified.map(String) : []
  const kernelRows = Array.isArray(opened && opened.notifyRows) ? opened.notifyRows : []
  const kernelFailed = Array.isArray(opened && opened.notifyFailed) ? opened.notifyFailed : []
  const invitation = (() => {
    const kind = 'meeting-appointment'
    if (!invitedMembers.length) {
      return { attempted: [], kind, delivered: [], woken: [], unreachable: [],
        means: 'nobody was invited: the roster of this meeting holds no member besides the chair, so there was no one to tell' }
    }
    const delivered = kernelRows
      .map((r) => ({ member: String((r && r.member) || ''), mailId: r && r.mailId ? String(r.mailId) : '' }))
      .filter((r) => r.member !== '')
    const unreachable = kernelFailed
      .map((f) => ({ member: String((f && f.member) || ''), code: String((f && f.code) || 'VMU_ENGINE_UNAVAILABLE'), why: String((f && f.reason) || '') }))
      .filter((f) => f.member !== '')
    return { attempted: invitedMembers, kind, delivered, woken: [], unreachable,
      means: 'the appointment notice is DURABLE MAIL (channel "mail", kind "' + kind + '") written ONCE, by the kernel open(), never by this face: every member in `delivered` will see it at their next turn or through vibe_v5_inbox, and the notice line it renders carries the exact attend call. `woken` is always [] here — a wake is a live nudge and the durable row is the promise; whether this deployment injects a wake seam is a deployment fact, not a silence (RUN 198). `unreachable` lists the members whose row did NOT go out, with the kernel own reason; the convene still succeeded and the meeting is readable, so the repair is a message to that member — never a second convene, and a delivery failure must never roll back an academic act' }
  })()
  const state = opened && opened.state !== undefined ? opened.state : null
  const scheduledFor = opened && opened.scheduledFor !== undefined ? opened.scheduledFor : null
  // ★★★ RUN 251-C 对齐（task-78 追加 A）: 内核已裁定「框架不替主席开会」（state-lane 的 start window：到点只结算一次考勤，
  // 转入 waiting 后只有主席 proceed 能开会）。这段文案以前把到点写成「按法定人数就会开会 / 那一次触碰才会开始」，读起来像
  // 时钟会自动开会。这里改成内核的真话，并把内核回执字段透出（requiresChairProceed / waitingFor / startsInMs / nextActions /
  // atSource / scheduledForIso）；pack 回执里不再允许出现「到点自动开会」的表述。
  const scheduleNote = state === 'scheduled'
    ? '★ 这场会议是【预约】的（scheduledFor=' + String(scheduledFor) + '，解析后的开始时刻见 scheduledForIso）：status/summary/meetingView 现在就能读；开始时间之前的**治理动作**（发言、动议、表决、结会、会长动作）都会被内核具名拒绝；例外是主席的 proceed()（可提前开会，回执记 startsEarly/earlyByMs）。有两件事要说清：① `attend` 是座位登记，内核按设计**允许提前签到**（预约状态里被豁免的动作之一，另一个是主席的 proceed()），它不会让会议提前开始；② **到点不会自己开会——框架不替主席开会**（没有定时器，没人触碰的进程不会自己醒）。到点后的下一次触碰（beat/status/summary/meetingView 等）把考勤规则结算一次：规则当时已满足就开会，否则转入 waiting，此后只有主席的 proceed() 能开会（主席也可以提前 proceed()，回执会写 startedLate）。所以预约回执带着 `requiresChairProceed`/`requiresChairProceedMeans`、`waitingFor`、`startsInMs`、`nextActions`：要开会就按 nextActions 里的 proceed 行动，不要假设时钟会替主席做决定。'
    : null
  // ★ GOAL ROUND 3 — THE RECOMMENDED PROCEDURE. A type that the rule gave a skeleton gets it in the receipt, labelled
  // `binding:'recommendation'` so no reader can mistake it for a gate; a type with no skeleton reports null and WHY
  // (nothing is invented). Steps the framework has NOT implemented are reported in `pendingSteps` rather than omitted.
  const proc = procedureFor(type)
  // ★★★ RUN 214 (run 51 / FEEDBACK50 2.2, MEASURED): the seats a deployment declares non-attending
  // (`vmu.meetings.attendDeniedSeats`) were only named AFTER a member had already tried to attend and been refused
  // (`VMU_NOT_PERMITTED`, on the attend receipt of a DIFFERENT member). The roster on the convene receipt looked like
  // "everyone here may sit", so the run seated a temp member and learned the rule from the error. The declaration is
  // now printed beside the roster, where the decision is made.
  const deniedSeatList = (() => {
    const raw = (settingsOf(kernel) || {})['vmu.meetings.attendDeniedSeats']
    return Array.isArray(raw) ? raw.map(String) : []
  })()
  const rosterRows = membersOf(kernel).roster()
  const nonAttending = deniedSeatList.length === 0
    ? []
    : rosterRows.filter((m) => deniedSeatList.includes(String(m.slot))).map((m) => String(m.id))
  const nonAttendingMeans = deniedSeatList.length === 0
    ? 'this deployment declares no non-attending seats (vmu.meetings.attendDeniedSeats is empty), so every member on this roster may attend'
    : 'these members are ON the roster but a deployment declaration (vmu.meetings.attendDeniedSeats: '
      + deniedSeatList.join(', ') + ') forbids their seat to attend or vote: an attempt to attend is refused BY NAME, and the unanimity reading does not wait for them'
  return { ok: true, tool: 'vibe_v5_meeting', meeting: opened && opened.meeting ? opened.meeting : opened,
    type, subject: opened && opened.subject !== undefined ? opened.subject : null,
    // ★ TB-2715 (RUN 76 / FEEDBACK63 C18): the receipt says WHICH word the caller used and which door matched it —
    // `type` alone cannot tell `type:"closure"` from `type:"结题"`, and both are legal now. `type` stays the canonical id
    // so every downstream reader (kernel, archive, prompts) keeps one vocabulary; the alias never propagates.
    typeInput,
    typeMatchedBy,
    typeMatchedByMeans: typeMatchedBy === 'alias'
      ? 'the caller passed a Chinese alias (the rule wording); `type` is its canonical id — the alias is an accepted INPUT, never a stored type'
      : (typeMatchedBy === 'id'
        ? 'the caller passed a declared type id'
        : 'no type was passed, so the convention default "ordinary" applies; pass type (id or Chinese alias) to choose'),
    title: opened && opened.title !== undefined ? opened.title : title,
    procedure: proc.procedure, procedureBinding: proc.binding, procedureNote: proc.note, pendingSteps: proc.pendingSteps,
    kind, agenda: agendaText,
    // ★ RUN 239-E (FEEDBACK62 #9, MEASURED): the audit read `agenda` as a string, passed an ARRAY, and got
    // materials:"确认命题; 分配复核" back — the joined text was the only trace of the items. The receipt now reads the
    // agenda back in BOTH shapes and says where each came from: `agenda` is the normalized line stored as materials,
    // `agendaItems` is the ordered list, `agendaSource` is "argument" or "materials" (the TWO single-source names for
    // the same line; "default" is reserved for a kernel-side default), and `agendaItemsSource` names which door split
    // the list.
    agendaItems,
    // ★★★ TB-2750 follow-up (F80-2 option ②): the one stored line has TWO accepted names; this pair names WHICH name
    // supplied it, so a reader never has to infer it from `args` it cannot see (agenda argument vs the legacy
    // kernel-side `materials`, never both).
    agendaSource: agendaFromLegacyName ? 'materials' : 'argument',
    agendaSourceMeans: agendaFromLegacyName
      ? 'the caller passed NO `agenda` and passed `materials` (the kernel-side name for the SAME stored line): that single-source form is accepted and named here; the two names are never two fields, and the read faces return this one line as `materials`'
      : 'the agenda came from the `agenda` argument (this face refuses to convene without ONE of the two single-source forms)',
    agendaItemsSource: agendaFromLegacyName
      ? 'materials-line'
      : (Array.isArray(args.agenda)
        ? 'argument-array'
        : (agendaGiven && String(args.agenda).trim().charAt(0) === '[' ? 'argument-json-array' : 'argument-line')),
    agendaItemsSourceMeans: '`agendaItems` are the lines THIS face joined into the stored materials (an array agenda keeps its items; a one-line agenda is split on the "; " separator the join itself uses). The kernel meeting object keeps its own agenda items (ids ag-1..., closable one at a time) and the kernel face reads them back — this field never claims to be that ledger.',
    // ★ ROUND 79 / TB-2740 (FEEDBACK79 B9): WHICH SHAPE the caller passed, and the separator rules that applied — the
    // two convenes of RUN 79 both passed ARRAYS, so 「逗号不是分隔符」 was never challenged on the string path. A reader
    // must be able to tell the paths apart without re-reading the transcript.
    agendaInputShape: Array.isArray(args.agenda) ? 'array' : 'string',
    // ★★★ TB-2763 (RUN 81 attempt-3, FEEDBACK81 D-6): the string split is now BRACKET- AND QUOTE-AWARE (nesting is
    // counted); an UNPAIRED bracket/quote is a NAMED fallback, never a silent top-level split.
    agendaSplitMode: Array.isArray(args.agenda) ? 'verbatim-array' : (agendaSplit === null ? null : 'bracket-aware'),
    agendaSplitUnbalanced: agendaSplit !== null && agendaSplit.balanced === false ? agendaSplit.unbalanced : null,
    agendaSplitUnbalancedMeans: agendaSplit === null || agendaSplit.balanced === true
      ? null
      : 'the agenda string has unpaired bracket/quote(s): ' + agendaSplit.unbalanced.map((u) => (u.kind === 'quote' ? 'a straight quote with no closing pair' : 'a closing "' + u.expected + '" with no opener')).join('; ')
        + ' — guessing a repair would silently MOVE text between items, so this call used the PRE-RUN-81 top-level split (every `;`/`；`/newline separated) and NAMES that fallback here instead of pretending the brackets were understood; close the pair to keep those separators inside the span',
    agendaSplitMeans: Array.isArray(args.agenda)
      ? 'the caller passed an ARRAY: its elements ARE the agenda items, in order, and are NOT re-split on any separator (a comma or a 、 inside an element stays inside that element)'
      : 'the caller passed ONE STRING: it was split on `;`, `；` and newlines ONLY AT DEPTH 0 — separators inside paired brackets （）()[]【】 or quotes "" 「」 “” ‘’ are NOT boundaries (nesting is counted: the last-opened pair must close first); `,` and `、` are NOT separators at any depth (a purpose like "确认 (2k−1,2k) 的界" is ONE item), and empty pieces after trimming are dropped',
    formalAgenda: args.formal_agenda !== undefined && args.formal_agenda !== null && args.formal_agenda !== false,
    // ★ RUN 240-I: the read faces' own fields, spread from the kernel's opening receipt, so a caller compares THIS
    // receipt with the stored meeting instead of being told a boolean it can no longer check.
    ...(opened && typeof opened === 'object'
      ? {
        formalAgendaItems: opened.formalAgendaItems === undefined ? null : opened.formalAgendaItems,
        formalAgendaItemsWhy: opened.formalAgendaItemsWhy === undefined ? null : opened.formalAgendaItemsWhy,
        formalAgendaItemsHint: opened.formalAgendaItemsHint === undefined ? null : opened.formalAgendaItemsHint,
        formalAgendaItemsMeans: opened.formalAgendaItemsMeans,
        formalAgendaDeclared: opened.formalAgendaDeclared === true,
        formalAgendaDeclaredBy: opened.formalAgendaDeclaredBy === undefined ? null : opened.formalAgendaDeclaredBy,
      }
      : {}),
    secretary,
    nonAttending, nonAttendingMeans,
    invitation,
    // ★★★ RUN 248-N / task-67: THE KERNEL'S OWN DELIVERY VERDICT, ECHOED — not restated. `notified` / `notifyRows` /
    // `notifyFailed` are the arrays the kernel `open()` receipt already carries (it wrote the rows), so a caller reads
    // the same list from both faces instead of trusting a second opinion. `appointment` names the word the caller used
    // (`appoint` vs `schedule`, null for a plain convene) and `appointmentState` says what actually happened to the start
    // time, read back off the kernel — so "预约" can never be asserted on a meeting that started immediately.
    notified: kernelNotified,
    notifyRows: kernelRows,
    notifyFailed: kernelFailed,
    noticesMeans: 'notified / notifyRows / notifyFailed are the kernel open() receipt fields, passed through unchanged (the kernel wrote the durable rows, so there is exactly ONE row per invited member and ONE notice line): `notified` names the members that really got a row, `notifyRows` names the mail ids, `notifyFailed` names every member that did not with the kernel reason. This face sends no invitation of its own — a second sender would be a second row',
    appointment: appointWord,
    appointmentState: appointWord === null ? null : (state === 'scheduled' ? 'scheduled' : 'appointed'),
    // ★ LIVE RUN 122 (E6): WHERE the label came from. `kind` defaults to 'sync' so every meeting always has a word for
    // what it is — and that default is exactly why a reader must be able to tell a chosen label from a filled-in one.
    kindSource: kindGiven ? 'args' : (KIND_BY_TYPE[type] ? 'derived-from-type' : 'default'),
    // ★★ RUN 189 (run 33 / FEEDBACK33 1.7) TAUGHT the difference; ★★ RUN 191 (run 35 / FEEDBACK34 2.3, MEASURED)
    // repaired it: run 35 convened `type:"debate"` and `type:"closure"`, read `kind:"sync"` on BOTH, and correctly called
    // that a contradiction with the sentence below. A default that CONTRADICTS the known type is not neutral. The label is
    // now DERIVED from the type where the type names one; the sentence says so instead of implying a caller chose it.
    typeMeans: '`type` decides the PROCEDURE (which skeleton this meeting follows) and is the word the institute uses; `kind` is the meeting BOARD label (sync/division/verify-request/solve-vote) and is what an archive files the row under. When no kind was passed the label is DERIVED from the type where the type names one (debate→verify-request, closure→solve-vote, division→division) and `kindSource:"derived-from-type"` says nobody chose it; a type with no natural label falls back to "sync" with `kindSource:"default"`. Either way it is a filled-in label, not a reading of what the meeting was',
    kindIsLabelOnly: true,
    kindSourceMeans: kindGiven
      ? 'the caller named this meeting’s kind'
      : (KIND_BY_TYPE[type]
        ? 'no kind was passed, so the framework DERIVED ' + JSON.stringify(kind) + ' from type ' + JSON.stringify(type) + ' — the label an archive reader would expect. No caller chose it: pass kind explicitly to override'
        : 'no kind was passed: the framework filed this meeting under its default kind "sync". The label is legal but nobody chose it — pass kind (sync/division/verify-request/solve-vote) or title to name the meeting yourself'),
    // ★ WAVE 2 (E9/E6): the roster a narrowed meeting was convened with must be READABLE, not just accepted.
    roster: opened && Array.isArray(opened.roster) ? opened.roster : null,
    rosterNarrowed: opened && opened.rosterNarrowed === true,
    rosterSource: opened && opened.rosterSource !== undefined ? opened.rosterSource : null,
    rosterMeans: opened && opened.rosterMeans !== undefined ? opened.rosterMeans : (opened && Array.isArray(opened.roster)
      ? 'this meeting was convened over exactly this roster (`rosterNarrowed` says whether it is narrower than the live roster, `rosterSource` says who supplied it). The roster bounds who may be counted present and who is on the order queue'
      : null),
    state, scheduledFor, at, scheduleNote,
    // ★★★ RUN 251-C 对齐 (task-78 追加 A): 内核 start window 的字段原样透出 —— pack 不重新解释时间，也不重新解释
    // 「谁来开会」。`requiresChairProceed` 是内核给的布尔（未开始即为 true），`nextActions` 是内核给的可达动作表；
    // `waitingFor` 区分 waiting 的两种原因（quorum 未凑满 / 只差主席 proceed）。回执不写「到点自动开始」。
    atSource: opened && opened.atSource !== undefined ? opened.atSource : null,
    atSourceMeans: opened && opened.atSourceMeans !== undefined ? opened.atSourceMeans : null,
    scheduledForIso: opened && opened.scheduledForIso !== undefined ? opened.scheduledForIso : null,
    started: opened && opened.started !== undefined ? opened.started : null,
    startedAt: opened && opened.startedAt !== undefined ? opened.startedAt : null,
    startsInMs: opened && opened.startsInMs !== undefined ? opened.startsInMs : null,
    elapsedSinceMs: opened && opened.elapsedSinceMs !== undefined ? opened.elapsedSinceMs : null,
    elapsedMs: opened && opened.elapsedMs !== undefined ? opened.elapsedMs : null,
    waitingFor: opened && opened.waitingFor !== undefined ? opened.waitingFor : null,
    waitingForMeans: opened && opened.waitingForMeans !== undefined ? opened.waitingForMeans : null,
    quorumMetWhileWaiting: opened && opened.quorumMetWhileWaiting !== undefined ? opened.quorumMetWhileWaiting : null,
    requiresChairProceed: opened && opened.requiresChairProceed !== undefined ? opened.requiresChairProceed : null,
    requiresChairProceedMeans: opened && opened.requiresChairProceedMeans !== undefined ? opened.requiresChairProceedMeans : null,
    nextActions: opened && Array.isArray(opened.nextActions) ? opened.nextActions : null,
    startReadsMeans: opened && opened.startReadsMeans !== undefined ? opened.startReadsMeans : null,
    // ★ RUN 225-B: a meeting that declared a policy must read it back - otherwise 'what rule does this meeting hold late
    // arrivals to' exists only in the call that made it.
    lateAdmission: opened && opened.lateAdmission !== undefined ? opened.lateAdmission : null,
    lateAdmissionMeans: opened && opened.lateAdmissionMeans !== undefined ? opened.lateAdmissionMeans : null,
    pendingLate: opened && Array.isArray(opened.pendingLate) ? opened.pendingLate : [],
    pendingLateCount: opened && opened.pendingLateCount !== undefined ? opened.pendingLateCount : 0,
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
      // ★ 闸判过的形态与它「没核过什么」一起发布：只给 proofChecked 的话，`proofContentChecked:false` 这条披露就消失在回执里。
      proofChecked: subjectGate.proofChecked === true, proofContentChecked: subjectGate.proofContentChecked === true,
      looksLikeIdentifier: subjectGate.looksLikeIdentifier === true, note: subjectGate.note || null,
      // ★ RUN 200: the library answer about WHERE the declared pointer points travels with the admission, because run 39
      // read the silence as "the pointer was checked". The gate itself stays a pure predicate over its own inputs.
      proofPointer: subjectGate.proofPointer || null, proofPointerMeans: subjectGate.proofPointerMeans || null } : null,
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
/** One sentence for the two different ways a round can run UNNARROWED (declared-none vs declared-but-not-installed).
 *  ★★ RUN 167 (real machine, run 14 / FEEDBACK14 F5): the first version of this helper read EVERY row whose
 *  `narrowing.applied` was false as "declared but invisible" — but a type that declares NO narrowing also reports
 *  `applied:false` (reason `type-declares-no-narrowing`, see meeting-tool-face.js), so the sentence would have been false
 *  for exactly the types it was supposed to contrast. The rows are classified by their own `reason`, which is the fact.
 */
function narrowInEffectMeans(face, notNarrowed, inEffect) {
  if (face && face.narrowed === true && inEffect !== false) return 'this round ran with the meeting-type face in effect (the allow list below was installed for the round and cleared after it)'
  const rows = (Array.isArray(notNarrowed) ? notNarrowed : []).filter((r) => r && r.narrowing && r.narrowing.reason !== 'type-declares-no-narrowing')
  if (rows.length > 0) {
    const why = rows[0].narrowing.reason || 'unknown'
    const visible = rows[0].narrowing.identityFaceVisible
    const expected = rows[0].narrowing.expectedAllowed
    return 'this round ran UNNARROWED although the meeting type DECLARES an allow list: it could not be installed (' + why + '; the identity face showed ' + String(visible) + ' of the ' + String(expected) + ' allowed name(s)), so every member row reports narrowing.applied:false — a disclosed no-op, not a silent one'
  }
  return 'this round ran UNNARROWED because this meeting type declares NO narrowing (its allow list is empty by declaration, not by failure)'
}
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
  // ★★ RUN 167 (F5): DECLARING a face is not INSTALLING it. The first version reported `narrowingInEffect: face.narrowed === true`,
  // which is "this meeting type declares an allow list" — true even when every member row said `applied:false` and the round ran
  // with its full identity face. The field now reports the EFFECT (declared AND installed), and the sentence below says which of
  // the two ways it was not installed.
  const narrowingInEffect = face.narrowed === true && notNarrowed.length === 0
  // ★ RUN 132 (F-132a): the verb that OPENS a debate round could not name its own meeting type — `phase:"debate"` was
  // refused by the enum ("it accepts o…"), so the chair had to guess `verify-debate`. The turn engine's vocabulary is
  // its own (verify-debate is the debate round there); the alias is accepted HERE and DISCLOSED in the receipt, because
  // a word that works but is rewritten silently is the same defect one level down.
  const phaseGiven = str(args.phase || 'meeting')
  const PHASE_ALIASES = { debate: 'verify-debate' }
  const phaseUsed = PHASE_ALIASES[phaseGiven] || phaseGiven
  const phaseAliased = PHASE_ALIASES[phaseGiven] ? { given: phaseGiven, used: phaseUsed, why: 'the turn engine calls a debate round "verify-debate"; "debate" is accepted on this face and mapped for you' } : null
  let step = null
  let failure = null
  try {
    // ★★ RUN 230 / task-19 (E12): A MEETING ROUND IS BOUND TO ITS MEETING. The round used to call
    // `kernel.turn.step` without `meeting`, so the parked turn carried no meeting, the member's `say` reached
    // the dispatch with nothing to speak into, and the receipt explained it away as `reason:"no-meeting-bound"`
    // - the member was blamed for a silence the FACE caused by not saying which meeting the round was in.
    // The kernel now records the binding on the turn and on the pending entry, and a member reply inherits it.
    step = await kernel.turn.step({ members: ids.map((id) => ({ id })), phase: phaseUsed, why: str(args.why || ''), meeting })
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
      ok: false, tool: 'vibe_v5_meeting_round', meeting, type, chair, phase: phaseUsed, phaseAliased,
      code: step.code || 'VMU_STATE', message: step.message || 'the member turn failed',
      hint: step.hint || null, turnFailed: true, turn: step,
      narrowed: face.narrowed === true,
      narrowingInEffect,
      narrowingInEffectMeans: narrowInEffectMeans(face, notNarrowed, narrowingInEffect),
      narrowing: { type, narrowed: face.narrowed === true, reason: face.reason, expected: face.allow, members: applied.rows },
      members: ids,
      roundMeeting: meeting,
      roundMeetingMeans: 'the round was dispatched WITH the meeting binding; the turn itself failed, so nothing was parked and no speech was recorded',
      note: 'the meeting-type face was applied and CLEARED (it lives for one round only), but the member turn itself failed: read `turn.error`/`code` before retrying',
    }
  }
  return {
    ok: true, tool: 'vibe_v5_meeting_round', meeting, type, chair, phase: phaseUsed, phaseAliased,
    narrowed: face.narrowed === true,
    // ★★ RUN 167 (real machine, run 14 / FEEDBACK14 F5): the deployment had no identity-visible tool face, so EVERY row's
    // `narrowing.applied` was false and the round ran with the FULL tool list — a fact buried one level down while the
    // top level said `narrowed:false` (which reads as "this meeting type declares no narrowing", a different statement).
    // The top level now states the EFFECT, with the reason, so nobody has to parse `narrowing.members[]` to learn that
    // the round was not narrowed.
    narrowingInEffect,
    narrowingInEffectMeans: narrowInEffectMeans(face, notNarrowed, narrowingInEffect),
    narrowing: { type, narrowed: face.narrowed === true, reason: face.reason, expected: face.allow, members: applied.rows },
    members: ids, turn: step,
    // ★ RUN 230: the round is BOUND to this meeting; a member reply to a parked turn inherits the binding, so the
    // member's `say` is recorded as that seat speaking in THIS meeting (no `no-meeting-bound` skip). Said out loud
    // because "the round ran" and "the round ran IN a meeting" are two facts and only the first was visible.
    roundMeeting: meeting,
    roundMeetingMeans: 'this round was dispatched WITH the meeting binding, so each member turn is parked for meeting '
      + meeting + ' and an answer inherits it; a member that names a DIFFERENT meeting is refused by name (VMU_TURN_REPLY_CONFLICT)',
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
/** ★ B4: the window the blueprint's 「按时更新」 is judged against. It is DECLARED (`vmu.blueprint.staleAfterMs`) instead of
 *  frozen at 30 days, so a deployment can tune it AND a live run can observe the overdue path at all; the receipt always
 *  says where the number came from (`staleAfterMsSource`), and an ABSENT setting reports `policy`, not a silent 30 days. */
function blueprintStaleWindowOf(kernel) {
  const view = kernel && typeof kernel.settingsView === 'function' ? kernel.settingsView() : null
  const raw = view && typeof view.get === 'function' ? view.get(BLUEPRINT_STALE_KEY) : (settingsOf(kernel) || {})[BLUEPRINT_STALE_KEY]
  return staleWindowOf(raw)
}

/**
 * ★★★ RUN 256 / TB-2623 (clock purity): the pack face reads the KERNEL clock once and hands it to the
 * blueprint module. `kernel.clockguard.now()` is the guarded accessor the kernel exposes; reading `Date.now()` here
 * (or letting `blueprint.js` fall back to it) is how an injected clock and the wall clock ended up mixed in one receipt
 * (`authors[].at` wall time beside a `scheduledFor` from the injected clock). `null` = this deployment has no usable
 * clock, and the module then NAMES the wall-clock fallback (`atSource:'wall-clock'`) instead of hiding it.
 */
function kernelClockMsOf(kernel) {
  try {
    const guard = kernel && kernel.clockguard
    if (guard && typeof guard.now === 'function') {
      const v = Number(guard.now())
      if (Number.isFinite(v)) return v
    }
  } catch (e) { /* no clock: report null; the module names the fallback, it does not borrow the wall clock here */ }
  return null
}
/** An ISO stamp for TEXT the pack prints (an example call); the source is named, never silently the wall clock. */
function kernelClockIsoOf(kernel) {
  const ms = kernelClockMsOf(kernel)
  if (ms !== null) return { iso: new Date(ms).toISOString(), atSource: 'kernel-clock' }
  return { iso: new Date().toISOString(), atSource: 'wall-clock' }
}

function toolBlueprint(args = {}, { kernel, exec = null } = {}) {
  const action = str(args.action || 'state').trim()
  const staleWindow = blueprintStaleWindowOf(kernel)
  const records = recordsOf(kernel)
  const clockMs = kernelClockMsOf(kernel)
  // ★★★ RUN 236 (G8 outline / G11 revision reason, run 60 / FEEDBACK60 P-series): `blueprint.js` learned to store and
  // publish both facts, but THIS face neither declared the parameters nor forwarded them - so the very call the prompt
  // teaches (propose a revision with its 由粗到细 outline) could not record one. A field the row keeps and the face
  // cannot write is a promise told by omission, which is the defect class RUN 219 fixed for `draft`.
  const outlineArg = has(args.outline) ? args.outline : null
  const reasonArg = str(args.revisionReason || args.revision_reason || '').trim()
  // The SETTING decides whether a missing outline is worth a named line in the receipt; it is a hint, never a gate
  // (schema.js `vmu.blueprint.requireOutline`, default false) - so this is read here, not enforced here.
  const requireOutline = outlineRequireOf(settingsOf(kernel) || {})
  const pathFromArg = has(args.path) ? str(args.path).trim() : ''
  const pathFromSetting = str((settingsOf(kernel) || {})[BLUEPRINT_PATH_KEY] || '').trim()
  const path = pathFromArg || pathFromSetting
  // ★★★ RUN 224: `adopt` names a draft, and a draft carries its own path — refusing that shape before reading the draft
  // made the shape the prompts teach fail (run 59 / FEEDBACK58 1.7). Every OTHER action still needs the path here.
  const adoptDraftArg = str(args.draft || args.id || '').trim()
  if (path === '' && !(action === 'adopt' && adoptDraftArg !== '')) {
    throw refuse('VMU_INVALID_ARGUMENT', '没有蓝图路径：既没传 path，部署也没声明 ' + BLUEPRINT_PATH_KEY,
      'pass path:"Shared/Protocol.md"（或让部署声明 ' + BLUEPRINT_PATH_KEY + '）—— 蓝图按路径分账，路径不明就无从读、也无从提案')
  }
  // ★★★ RUN 228 (found by the simulator, `scripts/sim/scenarios/records-blueprint.mjs`): the old test was
  // `path === '' && action === 'adopt'`, but `path` has ALREADY been filled from the deployment setting by then, so that
  // branch was unreachable and `adopt` without a path answered `pathFrom:"draft"` and `pathSource:"setting:..."` in the
  // SAME receipt - two answers to one question. What makes a path "the draft's" is that the caller did not pass one.
  const pathSource = pathFromArg !== ''
    ? 'argument'
    : (action === 'adopt' && adoptDraftArg !== '' ? 'draft' : 'setting:' + BLUEPRINT_PATH_KEY)
  if (action === 'state') {
    const state = blueprintState({ records, path, now: clockMs, nowFromKernel: true, staleAfterMs: staleWindow.ms, staleAfterMsSource: staleWindow.source })
    return Object.assign({}, state, {
      tool: 'vibe_v5_blueprint', action, pathSource, staleAfterMsSource: staleWindow.source,
      readSurface: 'vibe_v5_read_library { track: "' + BLUEPRINT_TRACK + '" }',
      // ★★ RUN 205 (run 43 / FEEDBACK42 1.6, MEASURED): a task brief asked for `nodes`/`count` and this reading has neither —
      // the blueprint is PROSE. Node ids ("节点 3") are the authors' own labels inside the text, not a structure the kernel
      // indexes, so there is no count to print; saying that is the honest answer, and the text is one call away.
      nodes: null,
      nodesMeans: 'the blueprint is PROSE: the kernel indexes revisions and drafts, NOT nodes — labels like "节点 3" live in the text and belong to its authors, so no structural count exists to read. Read the text with readSurface and quote the labels it actually uses',
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
    // ★★★ RUN 225-A: the md file is the truth and the row is its index. This branch used to hand back a FIXED subset and
    // dropped every md field, so a reader of a `read` receipt could not tell "the file changed on disk" from "the index is
    // right yet" — `state` forwards them (Object.assign), so `read` names them here and the two surfaces agree.
    return {
      ok: read.ok, tool: 'vibe_v5_blueprint', action, path, pathSource, id: read.id, status: read.status || null, revision: read.revision || null, fields: read.fields, text: read.text, problems: read.problems, title: read.row && read.row.title,
      md: read.md === undefined ? null : read.md,
      mdChangedSinceIndex: read.mdChangedSinceIndex === true,
      mdMissing: read.mdMissing === true,
      mdFingerprint: read.mdFingerprint === undefined ? null : read.mdFingerprint,
      indexFingerprint: read.indexFingerprint === undefined ? null : read.indexFingerprint,
      mdMeans: read.mdMeans === undefined ? null : read.mdMeans,
      // ★★★ RUN 248-M2: a draft revision owns its OWN md file (Shared/Drafts/<stem>-r<N>.md, or the file the member
      // wrote and named). `state` spreads the reading, while this branch copies a fixed subset, so a member quoting a
      // `read` receipt could not say where the draft file is nor whether it is on disk until these two names existed here.
      draftMdPath: read.draftMdPath === undefined ? null : read.draftMdPath,
      mdWritten: read.mdWritten === undefined ? null : read.mdWritten,
      // ★★★ RUN 255 / TB-2613: WHO wrote the file this revision indexes. This branch copies a FIXED subset, so a reading
      // the module publishes is silent here until it is named — the same lesson RUN 248-M2 pinned for draftMdPath.
      mdWrittenBy: read.mdWrittenBy === undefined ? null : read.mdWrittenBy,
      mdOwner: read.mdOwner === undefined ? null : read.mdOwner,
      // ★★★ RUN 236 / task-26 (G8, G11): `read` forwarded the md facts but not the two fields RUN 236 added to the row
      // itself — so `state` (which spreads the readings) could name an outline while `read` — the surface a member quotes
      // when it reports back — stayed silent about it. Same source, both surfaces: the readings come from `readBlueprint`,
      // never recomputed here.
      outline: read.outline === undefined ? null : read.outline,
      outlineCount: read.outlineCount === undefined ? null : read.outlineCount,
      outlineDepthMax: read.outlineDepthMax === undefined ? null : read.outlineDepthMax,
      outlineSource: read.outlineSource === undefined ? null : read.outlineSource,
      // RUN 239-B: the same enumerated reading must be printable on BOTH surfaces — the state face spreads the
      // readings, while this branch copies a fixed subset, so a new reading is silent here until it is named.
      outlineSourceMeans: read.outlineSourceMeans === undefined ? null : read.outlineSourceMeans,
      outlineRequired: read.outlineRequired === undefined ? null : read.outlineRequired,
      outlineRequiredSource: read.outlineRequiredSource === undefined ? null : read.outlineRequiredSource,
      outlineMeans: read.outlineMeans === undefined ? null : read.outlineMeans,
      outlineRequiredMeans: read.outlineRequiredMeans === undefined ? null : read.outlineRequiredMeans,
      revisionReason: read.revisionReason === undefined ? null : read.revisionReason,
      revisionReasonSource: read.revisionReasonSource === undefined ? null : read.revisionReasonSource,
      revisionReasonMeans: read.revisionReasonMeans === undefined ? null : read.revisionReasonMeans,
    }
  }
  if (action === 'propose') {
    const member = requireSeat(kernel, args.member || args.by, 'blueprint (proposal)')
    // ★★★ RUN 255 / TB-2613 (default flipped to fs-first): `mdPath` names the draft md the MEMBER wrote with the fs tool.
    // Omitting it no longer means "the kernel writes the draft": the module returns `draftMdMissing` naming the file the
    // member still owes. Kernel materialization is an explicit request (`materialize:true`), never a silent default.
    const mdPathArg = str(args.mdPath || args.md_path || '').trim()
    const materializeArg = args.materialize === true
    const text = str(args.text || args.body || '').trim()
    if (text === '' && mdPathArg === '') {
      throw refuse('VMU_INVALID_ARGUMENT', '蓝图提案需要正文 text（或一个用 fs 写好的草案 mdPath）',
        '先用 fs 工具把草案 md 写成 Members/<seat>/Drafts/<slug>-r<N>.md（或 Shared/Drafts/…）再传 mdPath；也可传 text 让回执告诉你缺哪个文件；materialize:true 是显式请内核代写（RUN 255 默认 fs-first，不再自动写）')
    }
    // ★★ RUN 205 (run 43 / FEEDBACK42 1.5, MEASURED): every `authors[].seat` was null because this face forwarded only the
    // member id while `codesignMeans` claims adopt needs a chair author AND a member author — the check read a field nobody
    // wrote. The roster knows the slot, so the seat is resolved HERE and recorded (an unseated/temp slot stays null, which
    // is a fact, not a missing write).
    const authorSeatRow = seatOfMemberId(kernel, member.id)
    const authorSeat = ('chair' === String(authorSeatRow.seat) || 'member' === String(authorSeatRow.seat)) ? String(authorSeatRow.seat) : ''
    // ★★★ RUN 219 (run 55 / FEEDBACK54 1.1, MEASURED): this face PUBLISHED `draft` and never forwarded it, so the receipt
    // said "this call named no draft" about a call that had named one (`draft:"rec-37"`), and `continuedBase.requested`
    // printed null beside the caller's own request. A parameter the schema publishes and the body drops is a lie told by
    // omission; the name is forwarded here and the outcome is reported by `continuedBase` as before.
    const namedDraft = str(args.draft || '').trim()
    // ★★★ RUN 248-M2: `mdPath` reaches the module here. The kernel receipt already answers the whole file contract
    // (`md.written`/`md.writtenBy`/`md.mdPath`/`draftMdPath`/`mdWritten`/`verified`), so this face forwards the name and
    // does not restate it; a path that is not on disk is refused by NAME by the module (VMU_PACK_V5R_BLUEPRINT_MD_MISSING).
    const proposed = proposeBlueprint({
      at: clockMs,
      atKernel: true,
      records, path, text, by: String(member.id), seat: authorSeat, note: str(args.note || ''), draft: namedDraft,
      outline: outlineArg, revisionReason: reasonArg, requireOutline, mdPath: mdPathArg,
      // ★★★ RUN 255 / TB-2613: the ownership the row will record. `inOwnTurn` is a fact of THIS CALL: the kernel resolves
      // which member turn is speaking, and only a call made from the member own turn claims wroteInOwnTurn:true. An office
      // call naming the member is not the member acting (false is still unknown-in-a-direction: the caller was not that
      // member; true is reserved for the member turn itself).
      materialize: materializeArg,
      inOwnTurn: (() => {
        const caller = resolveTurnMember(kernel, exec)
        if (caller === null) return null
        return caller === String(member.id) ? true : false
      })(),
    })
    const state = blueprintState({ records, path, now: clockMs, nowFromKernel: true, staleAfterMs: staleWindow.ms, staleAfterMsSource: staleWindow.source })
    const filed = proposed.filed !== false
    return Object.assign({}, proposed, {
      tool: 'vibe_v5_blueprint', pathSource, member: String(member.id),
      inForce: state.current,
      staleAfterMs: state.staleAfterMs,
      staleAfterMsSource: staleWindow.source,
      draftsWaiting: state.draftsWaiting,
      // ★★★ RUN 255 / TB-2613: when the default returned `draftMdMissing` NOTHING was filed, so the "已登记" sentence
      // would be a lie; the module note (which names the file to write) is kept in that case.
      note: filed
        ? '★ 草案已登记但**没有生效**：只有主席席可以 adopt（机构政策：' + BLUEPRINT_ADOPT_SLOT + ' 席）。'
        : proposed.note,
    })
  }
  if (action === 'adopt') {
    // ★ WAVE 2 (audit B6): adopt judged the CALLER-SUPPLIED `args.member`, so a resident could adopt by naming the
    // chair id. The seat is a fact of the CALL.
    const callerMember = resolveTurnMember(kernel, exec)
    const namedForAdopt = has(args.member) ? str(args.member) : (has(args.by) ? str(args.by) : null)
    if (callerMember !== null && namedForAdopt !== null && namedForAdopt !== callerMember) {
      throw refuse('VMU_NOT_PERMITTED',
        'blueprint adopt was called by member "' + callerMember + '" but names "' + namedForAdopt + '": a member cannot adopt in another member name (the seat is read from the CALL, not from the request text)',
        'adopt as yourself (omit member), or let the chair call adopt; the office (root) may adopt without a member seat')
    }
    // ★ WAVE 2 (audit B6): the CALLER is judged FIRST — a resident that names NO member still cannot adopt, and the
    // refusal names the seat it read from the call (`is in slot "member"`) instead of asking it for a member id.
    // Office/root calls resolve to `null` here, so they keep resolving the named member exactly as before.
    const member = requireChairSeat(kernel, callerMember || args.member || args.by, 'blueprint (adoption)')
    const draft = adoptDraftArg
    if (draft === '') {
      throw refuse('VMU_INVALID_ARGUMENT', '落成蓝图需要指名哪一份草案（draft）',
        'pass draft:<proposal id>；state 的 drafts[] 列出在等的草案（含 revision 与提案人）')
    }
    // ★★★ RUN 224 (run 59 / FEEDBACK58 1.7): the ADOPT branch gets the path AS THE CALLER SPELLED IT, not the resolved
    // setting default — a draft names its own path, and the setting is a fallback for readers, not a claim about which draft
    // is being adopted. Passing the resolved value here made `pathFrom` say "argument" about a path nobody passed.
    // ★★★ RUN 259 / AUDIT-14 P0-3: `refreshFingerprint` is the repair the drift refusal NAMES: "the file is the truth,
    // take its current bytes". It is forwarded as a boolean fact, and the receipt carries `mdDrift` (the two sha256s)
    // so a reader never has to guess whether an adoption admitted a drift.
    const adopted = adoptBlueprint({
      at: clockMs,
      atKernel: true,
      records, path: pathFromArg, draft, by: String(member.id), note: str(args.note || ''),
      staleAfterMs: staleWindow.ms, staleAfterMsSource: staleWindow.source,
      outline: outlineArg, revisionReason: reasonArg, requireOutline,
      refreshFingerprint: args.refreshFingerprint === true,
    })
    return Object.assign({}, adopted, {
      tool: 'vibe_v5_blueprint', pathSource, member: String(member.id), staleAfterMsSource: staleWindow.source,
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
    // ★★★ RUN 211 (run 48 / FEEDBACK47 1.5, MEASURED): motion ids are minted per MEETING (`mo1` in m1 and `mo1` in m2),
    // so a bare `mo1` in a log names two rows. The id itself is the kernel's and is not rewritten here; the qualified
    // spelling travels beside it, and the sentence says which one is unique.
    motionQualified: str(args.meeting) + '/' + String(motionId),
    motionIdMeans: 'the motion id is unique INSIDE its meeting only — the same string is minted again in another meeting, so carry `meeting` with it (motionQualified prints the pair)',
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
      'settle it with vibe_v5_verdict { meeting: "' + debateOpen + '", proposition_id: "…", verdict: <0..1>, reason: "…" }, or close the debate first — chair: vibe_vmu_meeting { action: "close", id: "' + debateOpen + '" }: CLOSING THE MEETING ENDS THE DEBATE (a debate is open exactly while its meeting is), and once it is closed the ballot board is free again')
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

/** ★★★ RUN 206 (run 44 / FEEDBACK43 1.2, MEASURED): TWO FACES, TWO BOX REGISTRIES. The primitive ballot box and the
 *  meetings service each hold their own boxes: run 44 took a meeting ballot id (`b-3-mvzt20vz`, opened by
 *  `vibe_vmu_meeting {action:"ballot"}`) to `vibe_v5_poll_vote` and got 「找不到票箱」 with the hint 「先 open() 取 id」 —
 *  advice that cannot work, because the box exists and belongs to the OTHER face. This helper recognises a meeting box
 *  so the refusal can name the call that actually votes it.
 */
function meetingBallotOf(kernel, id) {
  try {
    const live = typeof kernel.liveList === 'function' ? kernel.liveList() : null
    // ★★ RUN 206 (MEASURED twice): `liveList().ballots` is a list of box IDS and a live box carries no `meeting` field
    // (its binding lives in the primitive meeting service, which the pack cannot read). What the pack CAN say is true and
    // useful: this id is a LIVE ballot of the KERNEL — it is voted by the meeting face, not by the poll face, and the
    // poll face holds no box under it. Naming that is the whole point; guessing a meeting id would be a second lie.
    const ids = live && Array.isArray(live.ballots) ? live.ballots.map(String) : []
    if (ids.indexOf(String(id)) === -1) return null
    const box = typeof kernel.liveBallot === 'function' ? kernel.liveBallot(id) : null
    const targetOf = box && box.target !== undefined && box.target !== null ? String(box.target) : null
    return { id: String(id), meeting: null, target: targetOf }
  } catch (e) { return null }
}
/** ★ `vibe_v5_poll_vote` — cast an option-type vote. ① lands here (non-voter refused by name). `choices[]` is
 * forwarded as the face's ranked/multi list; `abstain:true` is translated into the face's ONLY abstention shape
 * (`choice === 'abstain'`, kernel/ballotbox.js:274 — the face never reads an `abstain` flag, so passing the flag
 * through silently turned a taught abstention into `VMU_CONFLICT 选项不在票面上`; RUN 153). */
function toolPollVote(args = {}, { kernel } = {}) {
  if (!has(args.ballot_id)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_vote needs ballot_id', 'take it from vibe_v5_poll_open\'s receipt (this face has no "the open board" default)')
  const member = requireVoter(kernel, args.member, 'poll_vote').id
  const choices = Array.isArray(args.choices) ? args.choices.map(String) : null
  if (!choices && !has(args.choice) && args.abstain !== true) {
    throw refuse('VMU_INVALID_ARGUMENT', 'poll_vote needs choices[], a choice, or abstain:true', 'the original required one of them')
  }
  // audit22 C-1 follow-up: the teaching says `choices: […]` OR `abstain: true`, so a payload carrying both is refused
  // BY NAME instead of silently letting the abstention win and dropping the options.
  if (args.abstain === true && (choices || has(args.choice))) {
    throw refuse('VMU_INVALID_ARGUMENT', 'poll_vote takes choices[]/choice OR abstain:true, not both', 'an abstention is not a ballot with options; pick one shape')
  }
  if (!kernel.ballotbox || typeof kernel.ballotbox.cast !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no ballot box face is published, so a vote cannot be cast', 'assemble a kernel with the ballot box service')
  }
  const castArgs = { boxId: str(args.ballot_id), by: member }
  if (has(args.note)) castArgs.note = str(args.note)
  if (args.abstain === true) castArgs.choice = 'abstain'
  else if (choices) castArgs.choices = choices
  else if (has(args.choice)) castArgs.choice = str(args.choice)
  // ★★ RUN 206: the box THROWS for an unknown id (`VMU_NOT_FOUND` 「找不到票箱」) — a return-value check alone missed it,
  // so the cross-face sentence never printed on the real path. Catch the throw and treat it like the refusal it is.
  let r = null
  let thrown = null
  try { r = kernel.ballotbox.cast(castArgs) } catch (e) { thrown = e }
  if (thrown !== null || (r && r.ok === false)) {
    const failCode = thrown !== null ? (thrown && thrown.code) || 'VMU_CONFLICT' : (r.code || 'VMU_CONFLICT')
    const failMessage = thrown !== null ? String((thrown && thrown.message) || 'the ballot box refused this vote') : (r.message || 'the ballot box refused this vote')
    const failHint = thrown !== null ? (thrown && thrown.hint) : r.hint
    const elsewhere = meetingBallotOf(kernel, str(args.ballot_id))
    const crossFace = elsewhere === null ? null
      : 'this box id belongs to a MEETING ballot (opened by vibe_vmu_meeting { action:"ballot" }'
        + (elsewhere.meeting === null ? '' : ' on meeting ' + elsewhere.meeting)
        + '), which the poll face does not serve: vote it with vibe_vmu_meeting { action:"vote", ballotId:"' + elsewhere.id + '", member:"' + member + '", value: 1 | 0 }'
        + (elsewhere.target === null ? '' : ' (it votes the motion ' + elsewhere.target + ')')
        + '. The two faces hold SEPARATE box registries; this id is not missing, it is elsewhere'
    throw refuse(failCode, failMessage, crossFace || (failHint || 'see the ballot box refusal'))
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
    const elsewhereClose = meetingBallotOf(kernel, str(args.ballot_id))
    throw refuse(code, r.message || 'the ballot box refused this close',
      elsewhereClose === null ? (r.hint || 'see the ballot box refusal')
        : 'this box belongs to a MEETING ballot (vibe_vmu_meeting { action:"ballot" }) and the poll face does not hold it: tally it with vibe_vmu_meeting { action:"tally", ballotId:"' + elsewhereClose.id + '" } — two faces, two registries, and this id is on the other one')
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
// ★★★ RUN 183 (run 29 / FEEDBACK29 D12): "DIFFERENT ruling" described a different REASON. The refusal says which part of
// the filed ruling this one disagrees with, so a member never reads "you changed your conclusion" out of a re-worded one.
const alreadyFiledMeans = (sameVerdict, proposition, filed, incoming) => (sameVerdict
  ? 'you already filed a ruling on ' + proposition + ' with the SAME verdict (' + String(filed.verdict) + ', filed ' + String(filed.at || 'at an unrecorded time') + ') and a DIFFERENT reason: this one (' + String(incoming) + ') was NOT filed and the chair will not see it'
  : 'you already filed a ruling on ' + proposition + ' with a DIFFERENT verdict (' + String(filed.verdict) + ', filed ' + String(filed.at || 'at an unrecorded time') + '): this one (' + String(incoming) + ') was NOT filed and the chair will not see it')
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
    return { readable: false, why: 'this kernel has no library face (it was assembled without a durable root), so no filed ruling can be read back', rows: [], cards: 0, cardsScanned: 0, duplicates: [] }
  }
  let heads = []
  try { heads = await library.list({ kind: 'proposition' }) } catch (e) {
    return { readable: false, why: 'the library head list could not be read: ' + String((e && e.message) || e), rows: [], cards: 0, cardsScanned: 0, duplicates: [] }
  }
  const cards = (Array.isArray(heads) ? heads : []).filter((h) => h && String(h.status || '') === RULING_STATUS)
  const rows = []
  let matched = 0
  for (const h of cards) {
    let body = null
    let path = null
    try { const ex = await library.expand(h.id); body = ex && ex.body; path = ex && ex.path } catch { continue }
    const payload = rulingPayloadOf(body)
    if (!payload) continue
    if (String(payload.meeting || '') !== String(meeting) || String(payload.proposition || '') !== String(proposition)) continue
    matched += 1
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
  // ★★★ RUN 215 (run 52 / FEEDBACK51 1.2, MEASURED): `cards` used to be EVERY ruling-status card in the library — all
  // meetings, all propositions — while `rows` was filtered to this (meeting, proposition). A chair-typed sitting therefore
  // read `count:0, cards:2` in one receipt and a reader could not tell which number answered "did the members file for
  // THIS debate". `cards` now counts the cards that actually match this pair; the library-wide scan is reported beside it
  // under its own name, so the two facts stay separable.
  return { readable: true, why: null, rows: [...effective.values()], cards: matched, cardsScanned: cards.length, duplicates,
    cardsMeans: '`cards` counts the ruling cards filed for THIS (meeting, proposition) and `cardsScanned` counts every ruling-status proposition card the library holds; a `cards:0` with `cardsScanned:2` means two ruling cards exist but neither is about this debate' }
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
async function submitRuling({ kernel, member, meeting, proposition, verdict, reason, exec = null }) {
  // ★★★ RUN 236 / task-31 sibling (M3, measured on run 60): this receipt said "this is YOUR final ruling … the chair
  // does not write this number for you" EVEN WHEN the call came from the office on a seat's behalf — the same
  // receipt carried `memberActed:false`. The sentence and the field described two different events. The act is the
  // same either way (a durable card in that member's folder, adopted by the chair from the tally), but WHO did it is
  // now read from the caller and said out loud, because "YOUR" is a claim about the caller, not about the card.
  const callerOfRuling = callerFromTurn(kernel, exec)
  const rulingBySeat = callerOfRuling !== null && String(callerOfRuling) === String(member)
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
    // ★★★ RUN 183 (run 29 / FEEDBACK29 D12, MEASURED): two rulings with the SAME number but different reasons were
    // reported as "you already filed a DIFFERENT ruling … this one (1)" beside "verdict 1" — the word DIFFERENT was about
    // the reason, while the reader reads it as "the member changed its conclusion". Name which part differs.
    const sameVerdict = Number(mine[0].verdict) === Number(verdict)
    throw refuse('VMU_RULING_ALREADY_FILED',
      alreadyFiledMeans(sameVerdict, proposition, mine[0], verdict),
      'your filed ruling is the one that counts — it is ' + (mine[0].path ? 'the card ' + mine[0].path : 'card id ' + mine[0].id) + '. This face has no path that rewrites a filed ruling: if the ' + (sameVerdict ? 'reason was incomplete, that is a note to the chair, not a second card — send it with vibe_v5_message { to: "<chair id>", content: "…" }, which is durable mail the chair can read' : 'number was wrong, say so to the chair with vibe_v5_message { to: "<chair id>", content: "…" }, who rules on the set the receipts show (a chair does not rewrite a member\'s ruling either)'),
      { existing: { verdict: mine[0].verdict === undefined ? null : mine[0].verdict, at: mine[0].at === undefined ? null : mine[0].at, path: mine[0].path || null }, incoming: { verdict }, sameVerdict })
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
    means: rulingBySeat
      ? 'this is YOUR final ruling (' + String(verdict) + ' on ' + proposition + ') and it is now a card of your own on disk, so it SURVIVES your session and the chair adopts it from the tally — the chair does not write this number for you'
      : 'this ruling (' + String(verdict) + ' on ' + proposition + ') was filed IN ' + member + '"s name by a call that did NOT come from that seat (' + (callerOfRuling === null ? 'the office/root session' : 'the seat "' + String(callerOfRuling) + '"') + ') — the card is durable and the tally will count it, but the seat did not act in its own turn: who typed it is not who decided it',
    rosterChecked, rosterSource: debated.source,
    readBack: rulingReadBackOf(member, proposition),
    rosterCheckedMeans: rosterChecked
      ? 'the debate on ' + meeting + ' was readable in this session, so your membership in it was checked before the ruling was filed'
      : 'this session could not read who debated ' + meeting + ' (' + String(debated.why || debated.source || 'unreadable') + '), so the membership check happens when the chair collects — submit, and the chair names any member who did not debate',
    next: 'the chair collects every filed ruling with vibe_v5_verdict_final { meeting: "' + meeting + '", proposition_id: "' + proposition + '" } (all agree ⇒ that value, otherwise the arithmetic mean)',
    note: 'the ruling is a card under Members/' + member + '/Propos/ — one folder per member is what makes concurrent submissions safe and lets the chair read them from another kernel'
      + (rulingBySeat ? '' : "; the folder is the SEAT's, not the caller's"),
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
async function toolVerdict(args = {}, { kernel, exec = null } = {}) {
  if (args.verdict === undefined || args.verdict === null) throw refuse('VMU_INVALID_ARGUMENT', 'verdict needs a number in [0,1]', 'pass verdict:1 / 0 / a probability')
  const v = Number(args.verdict)
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw refuse('VMU_INVALID_ARGUMENT', 'verdict must be a number in [0,1]', '1 = true, 0 = false, anything else = an UNCERTAIN estimate')
  }
  if (!has(args.target)) {
    if (has(args.meeting) && has(args.proposition_id)) {
      return await submitRuling({ kernel, member: str(args.member).trim(), meeting: str(args.meeting), proposition: str(args.proposition_id), verdict: v, reason: has(args.reason) ? str(args.reason) : '', exec })
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
  // RUN 209 (FEEDBACK45 2.2): who was on the roster BEFORE this call — the fact that lets a reader tell "founded now" from
  // "already founded", which `started.already` (about the KERNEL's middleware start) cannot answer.
  let rosterBefore = []
  try { rosterBefore = (typeof membersOf(kernel).roster === 'function' ? membersOf(kernel).roster() : []) || [] } catch (e) { rosterBefore = [] }
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
  // ★★ RUN 194 (run 36 / FEEDBACK35 2.5, MEASURED): `memberScopeNote` is the sentence a MEMBER prompt carries. Read
  // from the office's side of this receipt it reads as if it also governed the caller — a chair who had just hired
  // members asked whether "these readings are not in my harness either", which they are. The note is unchanged (it is
  // what the member reads); this field says WHO it addresses and what it therefore does NOT say about the caller.
  const memberScopeNoteMeans = 'that sentence is written for a MEMBER (it is the paragraph a member prompt carries): it says which faces the hired seat cannot reach. It is NOT a statement about the caller of vibe_v5_start — the office that seeds the institute keeps the institution-level readings (report / overview / start-stop / settings / final ruling / verified promotion) in its own harness'
  // ★★ RUN 195 (run 37 / FEEDBACK36 2.5, MEASURED): run 37's office convened its first meeting right after `start` and was
  // refused with VMU_CHAIR_ACT_NOT_DELEGATED (`vmu.meetings.chairActRequiresTurn`). The RULE is right (a chair acts in its
  // own turn, not through the office's handle) but nothing on the seeding receipt said a chair needs a turn first, so the
  // first act of every fresh institute failed once. The gate and its one remedy are named at the moment the seats are made.
  const chairTurnNote = 'the chair cannot ACT through the office: `vmu.meetings.chairActRequiresTurn` is on, so convening / attending / closing on behalf of a chair is refused with VMU_CHAIR_ACT_NOT_DELEGATED until that chair has walked a turn of its own (`vibe_vmu_turn { op: "drive", member: "<主席席>" }`, or a round the host opens). Give the chair its first turn BEFORE asking it for a meeting act — the refusal is a delegation rail, not a missing permission'
  // ★★★ RUN 209 (run 46 / FEEDBACK45 2.2, MEASURED): run 46 founded the institute, got
  // `started:{ok:true,already:true,registered:[]}` beside `hired:["r-acad","r-1","r-2"]`, and reported the two fields as
  // fighting: on an EMPTY roster, "already" read as "the institute already existed". It is the KERNEL's own word about
  // its middleware start (`kernel.start()` answers `already:true` when that start ran earlier in THIS process), and the
  // seeding receipt never said so. The two facts are now named separately: what the KERNEL said, and what THIS CALL hired.
  const startedMeans = '`started` is the KERNEL\'s own answer about its middleware start: `already:true` means `kernel.start()` had ALREADY RUN IN THIS PROCESS (it registers the declared middleware and nothing else) — it is NOT a statement that the institute existed before. What THIS call seeded is `hiredNow` (the seats it created just now) and `rosterBefore` (who was on the roster when it began); an empty `rosterBefore` with `already:true` is a normal first founding in a process whose kernel was already started'
  // ★★★ RUN 213 (run 50 / FEEDBACK49 1.5, MEASURED): `start` seats the chair and records `vmu.turn.leaderId`, but a
  // MEMBER's kernel is a separate process: it does not inherit this setting, so a member reads leaderId as empty and
  // leadership falls back to the chair SEAT. That is disclosed (`applied[].partial`/`visibleToMemberKernels`) but was
  // never stated as a ceiling, so run 50's chair reported `leaderId empty` as a defect. The ceiling is named here.
  const leaderIdMeans = '`applied` records the settings THIS call changed on ITS OWN kernel. `vmu.turn.leaderId` is one of them, and it is a PER-KERNEL setting: a member works in a different kernel/process, which does not inherit it, so a member\'s prompt can read leaderId as empty and fall back to the chair SEAT (the charter\'s leadership section names the chair) — that fallback is by design, not a broken setting. No face can push a setting into another kernel; `vibe_v5_configure` changes it for THIS process only, and its receipt says the same' 
  // ★★★ RUN 221 (run 57 / FEEDBACK56 1.5, MEASURED): `started.already:true` ON A FIRST FOUNDING. The word is the
  // KERNEL's ("this process already ran kernel.start()"), and on the very call that creates an empty institute it reads
  // as "the institute already existed". The receipt now projects the kernel's answer under a name that carries its
  // subject, keeps the kernel's raw object under `startedRaw`, and says so once.
  // ★★★ RUN 222 (run 58 / FEEDBACK57 ②A, MEASURED): RUN 221 renamed the kernel's `already` to `middlewareAlreadyRegistered` to
  // give it a subject — and left `startedRaw.already` beside it, so ONE receipt spelled the same fact two ways and run 58
  // reported the shape difference as the problem. The subject belongs in the SENTENCE, not in a second key: the field keeps
  // the kernel's own name and the means carries the subject.
  const startedProjected = {
    ok: started && started.ok === true,
    already: started && started.already === true,
    registered: started && Array.isArray(started.registered) ? started.registered.slice() : [],
    alreadyMeans: '`already` is the KERNEL\'s answer about ITS OWN start in THIS process — it registers the declared middleware and does nothing else, so `true` does NOT mean the institute existed before this call. Whether an institute existed is answered by `rosterBefore` (empty = nothing was there) and `hiredNow` (who this call minted).',
    means: 'this block is the PROJECTION of the kernel\'s start answer (same keys as `startedRaw`, minus nothing); the sentence that gives `already` its subject is `alreadyMeans`',
  }
  return { ok: true, tool: 'vibe_v5_start', hired, hiredNow: hired.slice(), rosterBefore: rosterBefore.map((r) => r.id),
    started: startedProjected, startedRaw: started, startedMeans, applied, leaderIdMeans, memberScope, memberScopeNote: MEMBER_SCOPE_NOTE, memberScopeNoteMeans, chairTurnNote,
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

// ★ RUN 207 (run 42 / FEEDBACK42 1.1, MEASURED): "ACCEPTED HERE" IS NOT "IN FORCE THERE", AND FOR SOME KEYS THERE IS
// NO WRITE THAT WOULD MAKE IT SO. Run 42's office set `vmu.paper.officeConsult: "off"` and read `applied: "immediate"`
// + `partial: true`; the chair's `final` was still refused by `VMU_OFFICE_CONSULT_REQUIRED` in a member kernel that
// boots its OWN kernel over the same workspace and reads the declared default. The receipt said the scope was partial
// but named no DURABLE route - so the next agent repeats the same write and hits the same wall. Each entry below is the
// route that actually reaches the members (a durable record they read), or a named statement that no such route exists.
const MEMBER_FACING_SETTING_ROUTES = {
  'vmu.paper.officeConsult': 'DO NOT FLIP THIS SETTING TO UNBLOCK A MEMBER. Answer the pending consult instead: `vibe_v5_paper { action:"consult", target:"<paper>", member:"<office id>", request_id:"<the id the gate named>", answer:"…" }` writes a durable consult row, the paper ledger is shared by every kernel, and that row is what the gate tests (`p.consult.entries.length`). The setting above lives in THIS process only, so it cannot reach the finaliser.',
  'vmu.paper.officeConsultOn': 'same route as `vmu.paper.officeConsult`: the consult row is the durable fact; this switch only exists in the kernel that reads it.',
  'vmu.paper.officeConsultTimeoutMs': 'same route as `vmu.paper.officeConsult`: answering the consult ends the wait for every kernel; the timeout only lives in this one.',
  'vmu.paper.officeConsultOnTimeout': 'same route as `vmu.paper.officeConsult`: answering the consult makes the timeout irrelevant.',
  'vmu.paper.officeConsultExemptRoles': 'same route as `vmu.paper.officeConsult`. An exempt role is decided by the kernel that finalises, which is not this one: if the office must finalise without asking, the consult row has to exist first.',
  'vmu.turn.objective': 'a member kernel reads the DECLARED default of this key, so write the objective where the members read it: `vibe_v5_blueprint { action:"propose"|"revise" }` and the proposition card (`vibe_v5_record_proposition`) are durable records every kernel reads. Rewriting this setting cannot reach a member turn.',
  '*': 'NO face can make another kernel read this value: each member turn boots its own kernel over the same workspace and reads the declared default. If a member must obey the rule, the rule has to read durable state (a fold row / a record) - a runtime write here is local to this process by construction.'
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
  // ★ RUN 207: one predicate, so `partial`, `reachableInstead` and every derived sentence below cannot disagree.
  const processOnly = !!(receipt && receipt.crossKernelScope === 'this-process')
  // ★★★ RUN 220 (run 56 / FEEDBACK55 1.1, MEASURED): `appliedScope` read `this-process-only` for
  // `vmu.paper.officeConsult` — a key whose own `reachableInstead` names a durable route members DO read —
  // with the SAME word as `vmu.turn.leaderId`, whose `reachableInstead` says no face can reach it. The word
  // now follows the route: a key with a named per-key route reports reachable-somehow, everything else
  // `this-process-only`.
  const routeFor = processOnly ? (MEMBER_FACING_SETTING_ROUTES[key] || null) : null
  // ★★★ RUN 218 (run 54 / FEEDBACK53 1.5, MEASURED): the receipt printed `applied:"immediate"` FIRST and
  // `partial:true` three fields later. Both were true, and the word a reader skims is the misleading one (run 40 taught the
  // same lesson for `vibe_v5_set`; this is the `vibe_v5_start` / `vibe_v5_configure` path, which kept the bare word). The
  // scope now rides IN the value a reader quotes, so "immediate" cannot be repeated without its qualifier.
  const appliedValue = (processOnly && kApplied === 'immediate') ? 'immediate (THIS PROCESS ONLY)' : kApplied
  return { key, value: coerced, hot: def.hot, who: def.who || null, appliedBy: actor,
    applied: appliedValue,
    appliedScope: processOnly
      ? (routeFor ? 'this-process (members reach the intent another way — see reachableInstead)' : 'this-process-only')
      : (kApplied === null ? null : 'this-process'),
    requiresRestart: kRestart,
    appliesAt: receipt && receipt.appliesAt !== undefined ? receipt.appliesAt : null,
    liveReadBy: receipt && Array.isArray(receipt.liveReadBy) ? receipt.liveReadBy : [],
    effective: String(def.hot) + (kRestart ? '（需重启的读取者，见 appliesAt）' : '（本会话内即可读到，见 appliesAt）'),
    // ★★ RUN 158 (run 6 / N4): a runtime write does not become durable configuration; the kernel says so, and the tool
    // face carries its answer instead of letting the caller infer it from `source:"runtime"`.
    persistsAcrossRestart: receipt && receipt.persistsAcrossRestart === false ? false : null,
    persistsAcrossRestartMeans: receipt && typeof receipt.persistsAcrossRestartMeans === 'string' ? receipt.persistsAcrossRestartMeans : null,
    // ★★ RUN 166 (real machine, run 14 / FEEDBACK14 F2): each member turn runs its OWN kernel instance over the same
    // workspace, so a runtime write is not shared with them. Raised in the office, `vmu.records.head.maxItems` looked
    // applied (`applied:"immediate"`) while a member kernel kept its own cap and kept refusing `VMU_QUOTA_EXCEEDED`. These
    // two fields carry the kernel's own scope answer, and for a CAPACITY key they name the repair every instance sees.
    crossKernelScope: receipt && typeof receipt.crossKernelScope === 'string' ? receipt.crossKernelScope : null,
    crossKernelMeans: receipt && typeof receipt.crossKernelMeans === 'string' ? receipt.crossKernelMeans : null,
    // ★★ RUN 191 (run 35 / FEEDBACK34 1.2, MEASURED): `applied:"immediate"` WAS READ AS "THE MEMBERS SEE IT". Run 35's
    // office ran `vibe_v5_start {researcherCount:2}`; the receipt said `applied:"immediate"`, `requiresRestart:false`, and
    // — three fields later — `crossKernelScope:"this-process"`. The members then reported `leaderId empty`, because each
    // member turn runs its OWN kernel over the same workspace and the leader declaration was never shared state. Both
    // statements were true and the one a reader skims first was the misleading one. These two fields say the second fact
    // in the same breath, by name, for the keys where it matters most.
    visibleToMemberKernels: receipt && receipt.crossKernelScope === 'this-process' ? false : null,
    // ★★★ RUN 202 (run 40 / FEEDBACK39 2.5, MEASURED): the kernel says `applied:"immediate"` and, three fields later,
    // `crossKernelScope:"this-process"`. Both true, and the word a reader skims first ("immediate") is the misleading one:
    // it reads as "the institute has it", while a member turn boots its OWN kernel and reads the old value. The honest
    // spelling is `partial` with the scope named, so nobody has to notice the second field to learn the first fact.
    partial: processOnly ? true : null,
    partialFor: processOnly ? 'the member kernels spawned for turns (this process only)' : null,
    // ★ RUN 207: the durable route that DOES reach the members, per key - or the named statement that none exists.
    reachableInstead: processOnly ? (routeFor || MEMBER_FACING_SETTING_ROUTES['*']) : null,
    reachableInsteadMeans: processOnly
      ? 'this write is live in THIS process only, so the reachable route is the one named in reachableInstead (a durable record the member kernels already read); repeating the write cannot reach them'
      : null,
    partialMeans: processOnly
      ? 'applied:"immediate" above is TRUE FOR THIS PROCESS ONLY: the write is live here, and every member turn boots its own kernel over the same workspace and keeps reading the old value. If a member must see it, the value has to reach shared state — a durable setting write or the record fold — not a runtime write on this face'
      : null,
    memberKernelMeans: (() => {
      if (!processOnly) return null
      const base = 'each member turn runs its OWN kernel instance over the same workspace, and this write lives only in '
        + 'THIS process: the members do NOT read it, so a member reporting the old value is not a bug — it is this scope'
      if (key === 'vmu.turn.leaderId') {
        return base + '。★ 具体到本键：`vmu.turn.leaderId` 写在这里，成员子内核读到的仍是声明默认值（空），于是领导力自检会报 '
          + '`chair-seated-but-leaderId-empty` 并按席位回退 —— 想让成员也读到领头人，需要把该值落到共享状态（持久化设置/折叠账），'
          + '本面没有这条写入路径'
      }
      return base
    })(),
    capacityScopeMeans: receipt && typeof receipt.capacityScopeMeans === 'string' ? receipt.capacityScopeMeans : null,
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
  // ★★ RUN 168 (FEEDBACK15 F15-7): the v5r teaching says 「写清楚为什么」 and a caller naturally passes `reason`, but this
  // face declared only `why` and refused the call outright (`does not accept parameter(s) "reason"`) — a same-family word
  // mismatch costing a whole tool call. `reason` is an accepted alias; `why` wins when both are given.
  const whyGiven = has(args.why) ? str(args.why) : (has(args.reason) ? str(args.reason) : '')
  const applied = applyDeclaredSetting(kernel, str(args.key), args.value, { reason: whyGiven === '' ? 'vibe_v5_set' : whyGiven })
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
/**
 * ★★★ RUN 252 (run 72 / F72-7, MEASURED): `missing` WAS ANSWERING TWO QUESTIONS AT ONCE. The paper track has four
 * ARCHIVE row names (md/tex/pdf/meta), and `PaperArtifacts().missing` lists the rows merely NOT NAMED yet — but the pdf
 * block copied that list into `missing` beside `produced:true`, so ONE receipt said "tex is missing" and "the compile
 * produced the file" together. The artifact-row reading now has its OWN name and block (`archiveArtifacts`), and
 * `missing` means only what THIS action needed and did not get: a compile that produced the file needed nothing
 * (`missing: []`), a compile that did not produce it lacked `pdf`. `toolchainAbsent` is the third, separate question:
 * the ENVIRONMENT lacking an engine is not an input this compile failed to get, so it never enters `missing` and it is
 * never merged with it.
 */
const PAPER_ROW_NAMES = Object.freeze(['md', 'tex', 'pdf', 'meta'])

function archiveArtifactsReading(artifacts) {
  const a = artifacts && typeof artifacts === 'object' ? artifacts : null
  const present = a && a.present && typeof a.present === 'object' ? a.present : {}
  const rowPresent = {}
  for (const name of PAPER_ROW_NAMES) rowPresent[name] = present[name] === true
  const rowsMissing = PAPER_ROW_NAMES.filter((name) => rowPresent[name] !== true)
  return {
    scope: 'archive',
    present: rowPresent,
    missing: rowsMissing,
    complete: rowsMissing.length === 0,
    means: 'this is the ARCHIVE reading: which of the four rows (' + PAPER_ROW_NAMES.join(', ') + ') are NAMED on the paper track. It is NOT what an action needed: `tex` is absent here whenever the paper was started with format "md" and render therefore never wrote a tex row, even after a successful PDF compile (RUN 252 / F72-7). Read `present`/`complete` here, and read the pdf block for "is there a compiled file"',
  }
}

function toolchainAbsentOf(pdf) {
  const p = pdf && typeof pdf === 'object' ? pdf : {}
  const code = String(p.code || '')
  const faceCode = String(p.faceCode || '')
  const absent = []
  // The two names the paper faces use for "this assembly cannot typeset at all": both mean the ENVIRONMENT lacks the
  // engine, not that an input of this compile was missing.
  if (code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' || faceCode === 'VMU_PAPER_LATEX_NO_ENGINE') absent.push('latex')
  return absent
}

function toolchainAbsentMeans(list) {
  const names = Array.isArray(list) ? list : []
  return names.length === 0
    ? 'no piece of the compiler toolchain was reported absent: an empty `missing` therefore means the action lacked nothing, and any refusal on this receipt is about the document or the process, not about an uninstalled engine'
    : 'the COMPILER toolchain itself lacks ' + names.join(', ') + ': that is an environment fact, not an input this action failed to get, so it never appears in `missing` and it never decides `produced`'
}

/**
 * ★★★ RUN 256 (TB-2624 item 1, MEASURED in run 74): ONE LaTeX-absent fact, THREE shapes. The finalisation receipt put
 * it under `final.{toolchainAbsent,pdfEnvironmentMissing,finalized}`, `compile` kept a `code` at top level and had no
 * `toolchainAbsent` at all, and `status` printed the literal `toolchainAbsent: []` — the same environment fact could not
 * be compared across the three doors, so a reader could not tell "the engine is missing" from "this read never asked".
 * The reader below is the ONE producer: same four keys, same names, at the TOP level of `final`, `compile` and `status`,
 * and the values are byte-equal inside one session because the first observation is memoised on the kernel object (the
 * WeakMap key is the assembly, not the paper) and later reads reuse it. `latexAvailable:null` is the honest word for
 * "this session did not ask" — it is never an installed-engine claim.
 */
const ENVIRONMENT_KEYS = Object.freeze(['latex'])
const environmentObserved = new WeakMap()

/**
 * ★★★ TB-2743 (item B) — the ONE mapping from "was the engine question asked, and what did it find" to the three named
 * values. Exported because the criterion suite must pin all three shapes; the `status` face only ever observes one.
 *   · `ran-present` — a compile/finalisation asked and the engine was available;
 *   · `ran-absent`  — a compile/finalisation asked and the toolchain was not usable;
 *   · `not-run`     — nobody asked: absence is UNKNOWN (the empty `toolchainAbsent` list is NOT a verdict).
 */
export function toolchainProbeOf({ latexAvailable = null, asked = false } = {}) {
  // ★★★ TB-2777 D-7: an ABSENCE verdict needs an absent NAME, not merely "somebody asked". The old branch returned
  // `ran-absent` for `latexAvailable:null, asked:true` — that is how a run printed `toolchainProbe:"ran-absent"` beside
  // `toolchainAbsent:[]` and `latexAvailable:null` (three fields denying each other). `asked` is kept in the signature
  // for callers/tests that pass it, but it can no longer manufacture an absence: no verdict ⇒ `not-run`.
  if (latexAvailable === true) return 'ran-present'
  if (latexAvailable === false) return 'ran-absent'
  return 'not-run'
}

function environmentReadingsOf(observed, fallback) {
  const memo = fallback && typeof fallback === 'object' ? fallback : null
  const known = !!(observed && typeof observed === 'object')
  // ★ TB-2781 D3: whether THIS observation carried an engine verdict; assigned inside the `known` branch below and read
  // after it (the probe/source fields are function-scope facts).
  let observanceHadVerdict = false
  let toolchainAbsent = memo && Array.isArray(memo.toolchainAbsent) ? memo.toolchainAbsent.slice() : []
  let pdfEnvironmentMissing = memo && typeof memo.pdfEnvironmentMissing === 'boolean' ? memo.pdfEnvironmentMissing : null
  let latexAvailable = memo && typeof memo.latexAvailable === 'boolean' ? memo.latexAvailable : null
  if (known) {
    const pdf = observed.pdf && typeof observed.pdf === 'object' ? observed.pdf : null
    const observedAbsent = toolchainAbsentOf(pdf)
    const missingFlag = observed.pdfEnvironmentMissing === true
    // ★★★ TB-2781 D3 (RUN 83 attempt-1, MEASURED): `final{decision:"revise"}` carries NO pdf of its own, and the old
    // `typeof observed.pdfEnvironmentMissing === 'boolean'` counted the forwarded `false` as a VERDICT — which reset the
    // memoised `ran-present` observation to null and made the receipt answer `not-run` 68 s after a successful compile.
    // A verdict needs a real pdf (or an explicit TRUE absence flag); a plain `false` is the absence of a measurement.
    const hasVerdict = pdf !== null || observed.pdfEnvironmentMissing === true
    observanceHadVerdict = hasVerdict
    if (hasVerdict) {
      toolchainAbsent = observedAbsent.length > 0 ? observedAbsent.slice() : (missingFlag ? ENVIRONMENT_KEYS.slice() : [])
      pdfEnvironmentMissing = toolchainAbsent.length > 0 || missingFlag
      // ★★★ TB-2777 D-7 (RUN 82 attempt-2, MEASURED): a compile that RAN and failed on the DOCUMENT still proves the engine
      // is installed — the old `pdf.ok === true ? true : null` read every non-ok compile as "never measured", so
      // `final{revise}`/`status` answered `toolchainProbe:"ran-absent"` + `latexAvailable:null` + `toolchainAbsent:[]`
      // (an absence verdict with NO absent name) while the same machine compiled a PDF minutes later. Presence is
      // evidenced by REACHING an engine (argv/tried/engine/produced), not by the document being correct; `null` stays
      // only for an observation that carries no presence/absence evidence at all.
      const engineAttempted = pdf !== null && (
        pdf.ok === true || pdf.produced === true
        || (typeof pdf.engine === 'string' && pdf.engine !== '')
        || (typeof pdf.engineSource === 'string' && pdf.engineSource !== '')
        || (Array.isArray(pdf.triedEngines) && pdf.triedEngines.length > 0)
        || (Array.isArray(pdf.argv) && pdf.argv.length > 0))
      latexAvailable = toolchainAbsent.length > 0 ? false : (engineAttempted ? true : null)
    }
  }
  const means = latexAvailable === false
    ? 'the COMPILER toolchain itself lacks ' + (toolchainAbsent.join(', ') || 'latex') + ' — an environment fact, not an input any action failed to get: read it here, never as the reason a document was refused'
    : (latexAvailable === true
      ? 'the engine ran in this session, so ' + ENVIRONMENT_KEYS.join(', ') + ' was not absent when this assembly asked: this is an OBSERVATION from a compile/finalisation, not an installation claim made by a read'
      : 'this session has not asked the engine question yet (no compile/finalisation observed one): absent unknown, never "none installed" — `latexAvailable:null` names the absence of a verdict, and `toolchainAbsent:[]` means not-reported, not installed')
  // ★★★ TB-2743 (item B, MEASURED shape): "NOT TESTED" IS NOT "ABSENT". A read that never asked the engine question
  // printed `toolchainAbsent: []` and a reader took the empty list as "the toolchain is installed and fine". The empty
  // list was the absence of a MEASUREMENT. `toolchainProbe` names which of the two facts this session actually holds:
  // `not-run` (nobody asked), `ran-absent` (a compile/finalisation ran and did not find the toolchain), `ran-present` (a
  // compile ran and the engine was there). It is a READING of what happened, never a completion claim.
  const priorProbe = memo && typeof memo.toolchainProbe === 'string' ? memo.toolchainProbe : null
  const asked = observanceHadVerdict
  const toolchainProbe = toolchainProbeOf({ latexAvailable, asked })
  // ★★★ TB-2781 D3: a face that did not ask must SAY so, and a reading inherited from an earlier observation must name
  // itself. `toolchainProbeAsked:false` + `toolchainProbeSource:"last-observation"` is the honest shape for a receipt
  // like `final{revise}` that never compiles: it reports the session's last measurement (e.g. ran-present) instead of
  // silently falling back to `not-run`, and never pretends this face measured it.
  const toolchainProbeAsked = observanceHadVerdict
  const toolchainProbeSource = observanceHadVerdict
    ? 'this-face'
    : ((priorProbe !== null && priorProbe !== 'not-run') ? 'last-observation' : 'not-measured-here')
  const toolchainProbeMeans = toolchainProbe === 'not-run'
    ? 'toolchainProbe:"not-run" together with toolchainAbsent:[] means the engine question was NOT ASKED (or an observation carried no presence/absence evidence), so NO verdict was measured — NOT that the toolchain is installed: absence is UNKNOWN. Run `vibe_vmu_env { action: "probe", need: "' + ENGINE_NEED + '" }` (or a compile) to turn this into a verdict'
    : (toolchainProbe === 'ran-absent'
      ? 'toolchainProbe:"ran-absent": a compile/finalisation DID ask the engine question and the toolchain was not usable (' + (toolchainAbsent.join(', ') || 'no usable latex engine') + ') — this IS a measured absence, not an opinion'
      : 'toolchainProbe:"ran-present": a compile/finalisation DID ask, and the engine was available then; this is an OBSERVATION from that run, not an installation claim made by a read')
  const toolchainProbeMeans2 = toolchainProbeAsked
    ? toolchainProbeMeans
    : (toolchainProbe === 'not-run'
      ? toolchainProbeMeans
      : toolchainProbeMeans + ' — ★ NOT measured by THIS face (toolchainProbeAsked:false): this is the LAST OBSERVATION of the session (toolchainProbeSource:"last-observation"), inherited because this receipt asked no compile question; it is not a fresh probe and not a claim this action measured the engine')
  return { toolchainAbsent, pdfEnvironmentMissing, latexAvailable, toolchainProbe, toolchainProbeAsked, toolchainProbeSource, toolchainProbeMeans: toolchainProbeMeans2, environmentMeans: means }
}

function environmentReadingsAt(kernelObj, observed = null) {
  const memoKey = kernelObj && typeof kernelObj === 'object' ? kernelObj : null
  const prior = memoKey !== null && environmentObserved.has(memoKey) ? environmentObserved.get(memoKey) : null
  const reading = environmentReadingsOf(observed, prior)
  if (memoKey !== null && (observed || prior === null)) environmentObserved.set(memoKey, reading)
  return reading
}

/**
 * ★★ RUN 155 (audit of c5d356b9, problem 2): ONE pdf block, TWO doors. `final` and `compile` describe the
 * same compile, and they used to describe it in two different shapes: `final` returned a body, `compile` THREW, and the
 * keys differed even when both answered. The doc claimed they "share one structure", which was false on both halves.
 * The projection below is the single shape: every key is present on success and on failure (null/[] when it does not
 * apply), so a caller can diff the two doors field by field, and a reader can ask "did it produce a pdf, and with
 * which argv" the same way in both places.
 */
/**
 * ★★★ TB-2768 (RUN 81 attempt-3, MEASURED): "a PDF exists" and "the mathematics printed" are TWO readings. The kernel
 * latex face reads the engine log after a successful compile and reports which glyphs the font dropped; this projects
 * that reading onto the paper receipt so it can never be true that `ok:true` arrives while a `Missing character` line
 * sits in the log with ZERO counters. One reading, every door (final / compile / status.pdfCompiled).
 */
function glyphLossOf (pdfLike) {
  const r = pdfLike && typeof pdfLike === 'object' ? pdfLike : {}
  return {
    glyphLossDetected: r.glyphLossDetected === true,
    missingCharacterCount: r.missingCharacterCount === undefined ? null : r.missingCharacterCount,
    glyphsUnrepaired: Array.isArray(r.glyphsUnrepaired) ? r.glyphsUnrepaired : [],
    glyphLossCode: r.glyphLossCode === undefined ? null : r.glyphLossCode,
    glyphLossMeans: r.glyphLossMeans === undefined ? null : r.glyphLossMeans,
    glyphLossHint: r.glyphLossHint === undefined ? null : r.glyphLossHint,
    logPath: r.logPath === undefined ? null : r.logPath,
    logRead: r.logRead === true,
  }
}
/** The same reading under the name TB-2768 asks for: the engine-log findings, visible next to the toolchain fields. */
function glyphFindingsOf (pdfLike) {
  const g = glyphLossOf(pdfLike)
  return { source: 'engine-log', logPath: g.logPath, logRead: g.logRead, missingCharacterCount: g.missingCharacterCount,
    glyphLossDetected: g.glyphLossDetected, glyphLossCode: g.glyphLossCode, means: g.glyphLossMeans }
}

function projectPdfBlock(pdf, target) {
  // ★★ RUN 158 (run 6 / item 6 + N5): the projection carries the outDir/sourceName that were TRIED and discloses when
  // the two tails are the same text — one failure structure for `final` and `compile`, see kit/paper.js compilePdf.
  const p = pdf || {}
  const ok = p.ok === true
  // ★★★ TB-2768 (RUN 81 attempt-3): the glyph verdict is decided ONCE here and travels on the pdf block, inside `math`,
  // and as `stderrFindings` — so `ok:true` can never arrive beside an unread `Missing character` log.
  const glyph = glyphLossOf(p)
  const enginesRaw = Array.isArray(p.triedEngines) ? p.triedEngines : (Array.isArray(p.tried) ? p.tried : [])
  const engines = enginesRaw.slice(0, 12)
  // ★★★ RUN 252 (F72-7): `produced` is decided ONCE here, so `missing` and `archiveArtifacts` below are derived from
  // the SAME reading instead of from two copies of the pdf block (the old shape could disagree with itself).
  const produced = ok && (p.produced === true || Boolean(p.pdfPath))
  const toolchainAbsent = toolchainAbsentOf(p)
  const archiveArtifacts = archiveArtifactsReading(p.artifacts || null)
  return {
    ok,
    kind: ok ? 'compiled' : 'refused',
    produced,
    target: target === undefined || target === null ? (p.target || null) : String(target),
    code: ok ? null : (p.code || null),
    message: ok ? null : (p.message || null),
    hint: ok ? null : (p.hint || null),
    faceCode: ok ? null : (p.faceCode || null),
    // ★★ RUN 156 (real machine, run 5 / N4): on a failure the face leaves `engine` null (nothing produced) while the
    // SAME receipt's `triedEngines[0].engine` names xelatex - a reader diffing the two fields could not tell whether an engine
    // ever ran. The field now reports the engine that was attempted, and `engineSource` says which half supplied it.
    engine: p.engine || (engines[0] && engines[0].engine) || null,
    engineSource: p.engine ? 'face' : ((engines[0] && engines[0].engine) ? 'triedEngines' : null),
    pdfPath: p.pdfPath || null,
    pdfBytes: p.pdfBytes === undefined || p.pdfBytes === null ? null : p.pdfBytes,
    // ★★★ TB-2772 follow-up (audit4 P1): `final` is the moment the compile happens, so its pdf block must carry the FILE
    // HASH too — otherwise a reader who wants "which bytes were finalised" has to call `status` afterwards (and a later
    // recompile can move the file out from under that reading). `null` = this compile/receipt had no hash (named absence).
    pdfSha256: p.pdfSha256 === undefined || p.pdfSha256 === null ? null : String(p.pdfSha256),
    pdfSha256Means: p.pdfSha256 === undefined || p.pdfSha256 === null
      ? 'this compile recorded no file hash (an older row/build), so "which bytes were finalised" is NOT provable from this receipt — read status.pdfCompiled.pdfSha256MatchesDisk instead of assuming'
      : 'the sha256 of the PDF file THIS compile produced and recorded; `status.pdfCompiled` compares it with the file on disk later (a later `compile` rewrites the file, so this receipt is the moment-of-finalisation reading)',
    // ★★ RUN 205 (run 43 / FEEDBACK42 2.4, MEASURED): the final receipt's `pdf` block printed produced/engine/pdfBytes/pdfPath and
    // DROPPED `recordId`, which the compiler had already returned — the very row a caller was told to quote was readable only
    // from `status.pdfCompiled`. One compile, one id, both doors.
    recordId: p.recordId === undefined || p.recordId === null ? null : String(p.recordId),
    recordIdMeans: 'the `paper-pdf` row this compile wrote (a row id in the paper track). `final` and `compile` print the SAME id for the same compile; `status.pdfCompiled.finalPdfRecordId` says which row the FINALISATION used, so the two can be compared',
    argv: Array.isArray(p.argv) ? p.argv.slice(0, 16) : [],
    outDir: p.outDir || null,
    sourceName: p.sourceName || null,
    stderrTail: p.stderrTail ? String(p.stderrTail) : '',
    stdoutTail: p.stdoutTail ? String(p.stdoutTail) : '',
    tailSource: p.tailSource || null,
    tailsIdentical: p.tailsIdentical === true,
    // ★★ ROUND 159 (FEEDBACK6 item 7): a boolean is not an explanation — the same two tails are one diagnosis, and the
    // receiver says which stream carried it.
    tailsIdenticalMeans: p.tailsIdenticalMeans || (p.tailsIdentical === true
      ? 'the two tails are the SAME text: one stream carried the whole diagnosis, and `tailSource` names it'
      : null),
    // ★★ RUN 252 (F72-7 cleanup): two lines used to repeat `outDir`/`sourceName` here — a duplicate key in an object
    // literal silently keeps the LAST value, so the literal was writing the same two fields twice; one pair is enough.
    signal: p.signal || null,
    triedEngines: engines,
    triedEnginesTotal: enginesRaw.length,
    triedEnginesTruncated: enginesRaw.length > engines.length,
    // ★★★ RUN 252 (run 72 / F72-7, MEASURED): `missing` is the ACTION reading, not the archive reading any more. Before
    // this line the list was copied straight from `PaperArtifacts().missing` (absent archive ROWS), so a successful
    // compile of an `md`-format paper printed `missing: ["tex"]` beside `produced: true` — one receipt asserting both
    // "we lack the tex artefact" and "the compile worked". Now: produced => the action lacked NOTHING; refused => it
    // lacked the pdf. The archive rows still travel, under their own name (`archiveArtifacts`) and WITH the explanation
    // of why `tex` can be absent after a real compile. Mutually exclusive by construction, so the suite can assert it.
    missing: produced ? [] : ['pdf'],
    missingMeans: produced
      ? 'empty BY CONSTRUCTION: this compile PRODUCED the pdf, so it needed nothing and lacked nothing. The archive rows are `archiveArtifacts.missing` — a different question (e.g. `tex` is absent there when the paper format is md and render never wrote that row)'
      : 'the one thing this compile needed and did not get is the pdf. The compiler toolchain is `toolchainAbsent` (an environment fact, never merged into this list), and the artifact ROWS are `archiveArtifacts.missing`',
    toolchainAbsent,
    toolchainAbsentMeans: toolchainAbsentMeans(toolchainAbsent),
    // ★★★ TB-2768 (RUN 81 attempt-3): the engine-log reading, ON the pdf block AND on the receipt top level (the caller
    // must not have to find it under `math`); `stderrFindings` is the name TB-2768 asked for.
    ...glyph,
    stderrFindings: glyphFindingsOf(p),
    archiveArtifacts,
    // ★★ RUN 217 (run 54 / FEEDBACK53 1.4): `produced:true` answers "is there a file", NOT "were the formulas
    // typeset". The kit measures that in the SAME pass that builds the .tex (inline-math spans, prose carets and
    // underscores, glyphs it had to repair) - and a door that does not project the measurement hides it. One block,
    // both doors, `null` when the kit did not measure (a failure produced no .tex, so nothing was typeset).
    math: p.math && typeof p.math === 'object'
      ? Object.assign({}, p.math, { glyphsUnrepaired: glyph.glyphsUnrepaired, glyphLossDetected: glyph.glyphLossDetected,
        glyphLossMeans: glyph.glyphLossMeans, glyphLossCode: glyph.glyphLossCode, missingCharacterCount: glyph.missingCharacterCount,
        logPath: glyph.logPath })
      : (glyph.glyphLossDetected
        ? { glyphsUnrepaired: glyph.glyphsUnrepaired, glyphLossDetected: true, glyphLossMeans: glyph.glyphLossMeans,
          glyphLossCode: glyph.glyphLossCode, missingCharacterCount: glyph.missingCharacterCount, logPath: glyph.logPath }
        : null),
  }
}

/**
 * ★★★ RUN 258 (TB-2638 / P43+P45, MEASURED on the 47-pair corpus): ONE sentence for the one confusion the audit
 * found — a top-level `ok:true` was read as 「事情成了」 while the SAME receipt carried `missing:["pdf"]` and
 * `toolchainAbsent:["latex"]`. `ok` is the REQUEST verdict; completion has its own name on these receipts
 * (`complete` on final/render, `renderOk` on render, `missing`/`toolchainAbsent` for what was absent). No
 * capability was added here: a finalisation without a PDF is an honest outcome on a machine with no LaTeX — what
 * the corpus measured missing was the READING, not the ability.
 */
const PAPER_OK_MEANS = 'ok:true means the REQUEST was accepted and executed; it does NOT mean the paper is done. ★ `complete` is NOT ONE QUESTION across these doors: on `status` and `render` it asks whether the four ARCHIVE ROWS (md/tex/meta/pdf) are NAMED (on render it is the same value as `renderOk`); on `final` it asks whether the finalisation RAN and the pdf FILE exists. Read `completeMeans` on the receipt you hold instead of carrying the word between doors, and read `renderOk` (render), `missing` (what this request needed and did not get), `archiveArtifacts` (the row set under its own name) and `toolchainAbsent` (what the MACHINE lacks). `ok:true` with `complete:false` is a normal reading — e.g. a finalisation on a machine with no LaTeX.'

const EVIDENCE_GRADE_RANK = Object.freeze({ draft: 0, 'verified-by-citation': 1, 'mechanically-checked': 2, 'lean-verified': 3 })
const EVIDENCE_GRADES_MEANS = 'evidenceGrades projects the evidence grade the mechanism can ACTUALLY support for each part and each proposition: "draft" (no grade source on file), "verified-by-citation" (a verified-track row names this card as its source, written by the single writer promoteVerified), "mechanically-checked" (the card body carries an explicit machine-check verdict), "lean-verified" (the card body carries a PASSED Lean verdict). Every row names the field/source it read; a grade is never inferred from p or from prose, and a card with no grade source stays "draft" — an honest absent grade, not a fabricated promotion. This is a READ of the existing ledger, never a new judgement: to raise a grade, use the mechanism that writes it (debate/promoteVerified, a Lean pass, the machine-check writer), then read this face again.'
/** TB-2782: one evidence pointer -> the grade the ledger can support, with the source that says so. */
function evidenceGradeOfPointer (kernel, pointer) {
  const raw = String(pointer === undefined || pointer === null ? '' : pointer)
  let id = raw.replace(/#.*$/, '').trim()
  const slash = id.split('/')
  id = slash[slash.length - 1].trim()
  if (id.endsWith('.md')) id = id.slice(0, -3).trim()
  if (id === '') return { evidence: raw, cardId: null, grade: 'draft', source: 'unparseable-pointer', why: 'the pointer carries no record id this face can read (pass rec-<n> or Members/<member>/Propos/<rec-id>.md)' }
  let row = null
  try { const got = kernel && kernel.records && typeof kernel.records.get === 'function' ? kernel.records.get({ id }) : null; row = got && got.record ? got.record : got } catch (e) { row = null }
  if (!row) return { evidence: raw, cardId: id, grade: 'draft', source: 'records.get:none', why: 'no record answers to this pointer, so no grade source was read (the grade is absent, not verified)' }
  let body = null
  try { body = JSON.parse(String((row && row.body) || '{}')) } catch (e) { body = null }
  const facts = { track: row && row.track !== undefined ? String(row.track) : null,
    p: body && body.p !== undefined && body.p !== null ? Number(body.p) : null,
    proofState: body && body.proofState !== undefined && body.proofState !== null ? String(body.proofState) : null,
    leanState: body && body.leanState !== undefined ? String(body.leanState) : null,
    leanConformance: body && body.leanConformance !== undefined ? body.leanConformance : null }
  const leanPassed = (body && body.leanConformance === true) || (body && typeof body.leanState === 'string' && body.leanState === 'passed') || (body && body.lean && body.lean.state === 'passed')
  if (leanPassed) return { evidence: raw, cardId: id, track: facts.track, grade: 'lean-verified', source: body && body.leanConformance === true ? 'body.leanConformance:true' : (facts.leanState === 'passed' ? 'body.leanState:passed' : 'body.lean.state:passed'), facts, why: 'the card body carries a PASSED Lean verdict, so the strongest grade this build can name' }
  const mech = body && (body.mechanicalCheck === true || body.mathJobState === 'passed' || body.checkedBy === 'mathjobs')
  if (mech) return { evidence: raw, cardId: id, track: facts.track, grade: 'mechanically-checked', source: body.mechanicalCheck === true ? 'body.mechanicalCheck:true' : (body.mathJobState === 'passed' ? 'body.mathJobState:passed' : 'body.checkedBy:mathjobs'), facts, why: 'a machine-check writer recorded its verdict on this card' }
  try {
    const found = findVerified(kernel.records, id)
    if (found) return { evidence: raw, cardId: id, track: facts.track, grade: 'verified-by-citation', source: 'verified:' + String(found.id), facts, why: 'a verified-track row names this card as its source (the single writer promoteVerified)' }
  } catch (e) { /* the verified track may be undeclared in this deployment: named below, never silently upgraded */ }
  return { evidence: raw, cardId: id, track: facts.track, grade: 'draft', source: 'no-grade-source', facts,
    why: 'no verified row, no machine-check verdict and no Lean pass on file: this card is DRAFT until one of those mechanisms writes a grade (an unverified p/proofState is not a grade)' }
}
function evidenceGradesOf (kernel, state) {
  const st = state && typeof state === 'object' ? state : null
  const target = st && st.target !== undefined && st.target !== null ? String(st.target) : null
  const rawParts = st && st.parts && typeof st.parts === 'object' ? st.parts : {}
  // the EVIDENCE lives in the durable paper-part ROW body (kit's recordPart), not in the state slot — read the row, not a
  // copy, so the grade is of what was actually filed.
  let heads = []
  try { const got = kernel && kernel.records && typeof kernel.records.list === 'function' ? kernel.records.list({ track: 'paper', limit: 0 }) : null; heads = Array.isArray(got && got.items) ? got.items : [] } catch (e) { heads = [] }
  const partEvidenceOf = (member) => {
    const suffix = '|part|' + String(member)
    const rows = heads.filter((h) => h && String(h.kind || '') === 'paper-part' && String(h.title || '').endsWith(suffix))
    if (rows.length === 0) return []
    // same-instant writes tie on updatedAt (a fixed test clock / a fast turn), so the id number breaks the tie: ids are
    // minted strictly increasing, and the newest row is the one that carries the evidence just filed.
    const idNum = (v) => Number(String(v || '').split('-').pop() || 0)
    const newest = rows.slice().sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)) || (idNum(b.id) - idNum(a.id)))[0]
    try {
      const got = kernel.records.get({ id: newest.id })
      const row = got && got.record ? got.record : got
      const body = JSON.parse(String((row && row.body) || '{}'))
      return Array.isArray(body.evidence) ? body.evidence.map(String) : []
    } catch (e) { return [] }
  }
  const parts = []
  const props = new Map()
  for (const member of Object.keys(rawParts)) {
    const slot = rawParts[member]
    const evidence = partEvidenceOf(member)
    const graded = evidence.map((pointer) => evidenceGradeOfPointer(kernel, pointer))
    for (const g of graded) {
      if (g.cardId === null) continue
      const prev = props.get(g.cardId)
      if (!prev || EVIDENCE_GRADE_RANK[g.grade] > EVIDENCE_GRADE_RANK[prev.grade]) props.set(g.cardId, g)
    }
    const strongest = graded.reduce((best, g) => (best === null || EVIDENCE_GRADE_RANK[g.grade] > EVIDENCE_GRADE_RANK[best.grade] ? g : best), null)
    parts.push({ member: String(member), part: slot && slot.title !== undefined ? slot.title : null,
      evidenceCount: evidence.length,
      grade: strongest === null ? 'draft' : strongest.grade,
      gradeSource: strongest === null ? 'no-evidence-pointer' : strongest.source,
      evidence: graded,
      why: strongest === null ? 'this part files no evidence pointer, so the only honest grade is draft' : null })
  }
  return { grades: ['draft', 'verified-by-citation', 'mechanically-checked', 'lean-verified'], target, parts, propositions: Array.from(props.values()), means: EVIDENCE_GRADES_MEANS }
}

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
  // ★★ RUN 156 (real machine, run 5 / N2): the hint below told a caller that `status` with NO target lists the papers that
  // exist — and that call was refused by the very sentence that recommended it. A hint is a promise about this build, so
  // either the listing exists or the sentence goes; the listing exists now (same rows the flow reads, one line each).
  if (action === 'status' && !target) {
    const rows = typeof paper.papers === 'function' ? paper.papers() : []
    const papers = []
    for (const row of rows) {
      if (String((row && row.kind) || '') !== 'paper-state') continue
      let body = row && row.body
      if (body === undefined && row && row.id) {
        try {
          const got = kernel.records.get({ id: row.id })
          const full = got && got.record ? got.record : got
          body = full && full.body
        } catch { body = undefined }
      }
      let st = null
      try { st = JSON.parse(String(body || '{}')) } catch { st = null }
      if (!st || st.target === undefined || st.target === null) continue
      // ★★ RUN 158 (N2 follow-on): this listing is what a caller copies an id FROM, so it must print the durable id the
      // paper actually carries (`paper-pN` for a minted plate) - synthesising `paper-<title>` printed an id that the
      // status/compile doors had no row for.
      papers.push({
        id: st.id === undefined || st.id === null || st.id === '' ? 'paper-' + String(st.target) : String(st.id),
        target: String(st.target),
        status: st.status === undefined ? null : st.status,
        stage: st.stage === undefined ? null : st.stage,
        round: st.round === undefined ? null : st.round,
        repairs: st.repairs === undefined ? null : st.repairs,
        stateRecordId: row.id || null,
      })
    }
    return { ok: true, tool, action, listed: true, count: papers.length, papers,
      note: 'one line per paper (id/target/status/stage/round/repairs); pass target:"<id or target>" for the full state' }
  }
  if (TARGET_ACTIONS.has(action) && !target) {
    throw refuse('VMU_INVALID_ARGUMENT', 'action "' + action + '" addresses ONE paper, and no target was given',
      'pass target:"<paper id>" (title/track are aliases of the same value); to see which papers exist call vibe_v5_paper { action: "status" } with no target (it lists them)')
  }
  switch (action) {
    case 'sections':
      // ★★ RUN 205 (run 43 / FEEDBACK42 2.3, MEASURED): `sections` answers with the paper's OUTLINE (the nine headers it will be
      // written into) and `status.parts` answers with the parts ALREADY WRITTEN. Same word, two questions — said here.
      return { ok: true, tool, action, sections: paper.sections(),
        sectionsMeans: 'these are the paper\'s OUTLINE sections (the headers the text is written into), not the parts already written: a reader asking "what has been written" wants `status.parts` (and `requiredLines.items[]` for the required-line view)' }
    case 'status': {
      const got = paper.state(target)
      // ★ G7 finding: status exposed the flow state only, while render exposed missing/complete/pdf. Same source,
      // same fields: a status reader must not have to render (which WRITES artefacts) just to learn what is missing.
      const artifacts = got && got.state && typeof paper.PaperArtifacts === 'function' ? paper.PaperArtifacts({ target }) : null
      const exists = !!(got && got.state)
      // ★★ RUN 170 (run 16 / FEEDBACK16 F16-7): `exists:false` was 457 bytes of silence — no hint, no candidates, no
      // statement that starting a second paper under a name the ledger may still hold is the wrong move. A missing paper
      // is a QUESTION ("did you mean the id, the target, or a spelling this reader normalises?"), so answer it.
      let hint = null
      // ★★ RUN 172 (FEEDBACK17 P3-16): a TRASHED name answered `exists:false` — the same receipt a name that never existed
      // gets. The trash holds restorable rows and the ledger reserves their names, so "not live" must not read as "free".
      const inTrash = !exists && typeof paper.trashLookup === 'function' ? paper.trashLookup(str(target)) : null
      if (!exists) {
        const known = typeof paper.papers === 'function'
          ? paper.papers().filter((r) => String((r && r.kind) || '') === 'paper-state')
          : []
        const seen = []
        for (const row of known) {
          let st = null
          try {
            const got2 = row && row.id ? kernel.records.get({ id: row.id }) : null
            const full = got2 && got2.record ? got2.record : got2
            st = JSON.parse(String((full && full.body) || '{}'))
          } catch { st = null }
          if (!st || st.target === undefined || st.target === null) continue
          seen.push({ id: st.id === undefined || st.id === null || st.id === '' ? 'paper-' + String(st.target) : String(st.id), target: String(st.target), status: st.status === undefined ? null : st.status })
        }
        const byId = seen.filter((p) => p.id === str(target))[0] || null
        const byTarget = seen.filter((p) => p.target === str(target))[0] || null
        const normalized = String(str(target)).replace(/^paper-/, '')
        const byNormalized = seen.filter((p) => p.target === normalized || p.id === normalized || p.id === 'paper-' + normalized)[0] || null
        hint = 'no paper answers to "' + str(target) + '" in this instance: '
          + (byId ? 'that IS the id of "' + byId.target + '" (state ' + byId.status + ') — address it by that target' :
            byTarget ? 'that is the target; address it by its id "' + byTarget.id + '"' :
            byNormalized ? 'a paper on this track answers to a spelling of it: "' + byNormalized.target + '" (id ' + byNormalized.id + ')' :
            'known papers: ' + (seen.map((p) => p.id + ' (' + p.target + ')').slice(0, 8).join(', ') || '(none)') + '. ')
          // ★★ RUN 172 (FEEDBACK17 P3-11): the candidate list was hard-truncated at 8 with no count of the rest — a reader
          // with 20 folders saw 8 and concluded those were all. A truncated list that does not say it truncated is a wrong
          // count wearing a list's clothes.
          + (seen.length > 8 ? '(另有 ' + String(seen.length - 8) + ' 篇未列出：共 ' + String(seen.length) + ' 篇；pass a fuller id/target to address one) ' : '')
          + (inTrash ? 'TRASH: the ledger still holds ' + inTrash.id + ' (target "' + inTrash.target + '", record ' + inTrash.recordId + ') as a RESTORABLE row until purgeAt ' + String(inTrash.purgeAt) + ' — the name is reserved, not free. ' : '')
          + ' Do NOT start a second paper under that name: the durable ledger reserves a name for its whole life, including while a row sits in the TRASH'
      }
      // ★★ RUN 174 (run 19 FEEDBACK19 F4): every part slot carried `at: <round>` next to `round: <round>` — a field named
      // like a timestamp holding the round, so a reviewer counted "at 1" as an epoch. This subsystem keeps ROUNDS, not wall
      // time: the receipt now names the round once (`round`) and says so, and the review rows carry the round they judge.
      // ★★★ RUN 256 (TB-2624 item 1): the SAME environment reader the compile/final doors use. `status` never sees a
      // compile refusal itself, so it reports what this session OBSERVED (memoised on the kernel) and says "not asked yet"
      // when nothing did — the literal `toolchainAbsent: []` below used to read as "engine installed".
      const envRead = environmentReadingsAt(kernel)
      const paperView = (() => {
        const st = got && got.state ? got.state : null
        if (!st) return null
        const parts = {}
        for (const [who, slot] of Object.entries(st.parts || {})) {
          if (!slot || typeof slot !== 'object') { parts[who] = slot; continue }
          const round = slot.round !== undefined && slot.round !== null ? slot.round : (slot.at === undefined ? null : slot.at)
          parts[who] = { recordId: slot.recordId === undefined ? null : slot.recordId, fingerprint: slot.fingerprint === undefined ? null : slot.fingerprint, round, title: slot.title === undefined ? null : slot.title }
        }
        return Object.assign({}, st, { parts })
      })()
      // ★★★ RUN 252 (run 72 / F72-7, MEASURED): status printed `missing: ["tex"]` beside `pdfCompiled.produced: true` —
      // the same self-contradiction as the compile receipt, one question asked twice. ONE ledger read now answers both
      // halves: `compiledProduced` decides `missing` (a compiled paper needed no artifact ROW to exist), and the rows
      // themselves are read once more below under `archiveArtifacts`. `pdfCompiled` (inside the return) reuses this same
      // read, so the receipt cannot disagree with itself about which row wrote the file.
      const compiledRow = (() => { try { return got && got.state && typeof paper.compiledPdfRow === 'function' ? paper.compiledPdfRow(got.state) : null } catch (e) { return null } })()
      const compiledProduced = compiledRow !== null
      // ★★★ TB-2750 / RUN 80 (F80-5, MEASURED on the 80th live run): the same status receipt said `toolchainProbe:"not-run"`
      // while `pdfCompiled` described a compiled PDF (produced:true, engine "xelatex", 111327 bytes, sha matching disk). The
      // probe was read only from THIS kernel's session memo — so a compile that ran in an earlier kernel, or before a
      // restore, left "nobody asked" on a paper whose PDF provably exists. A READ THAT CAN SEE THE PROOF OWES THE VERDICT:
      // the durable paper ledger's compile row is the observation ("a compile ran and produced a file"), so `not-run` is
      // upgraded to `ran-present` and the receipt names WHICH evidence it used (`toolchainProbeSource`). Nothing is
      // invented: no row ⇒ no verdict, and `ran-absent` (a measured failure) is never overwritten by a row from another
      // compile — absence is about the engine, and a produced file is not evidence of absence.
      const envLedgerRead = (() => {
        if (!compiledProduced || envRead.toolchainProbe !== 'not-run') return envRead
        const engine = compiledRow && compiledRow.engine !== undefined && compiledRow.engine !== null ? String(compiledRow.engine) : null
        const rowAt = compiledRow && compiledRow.at !== undefined && compiledRow.at !== null ? String(compiledRow.at) : null
        const rowBytes = compiledRow && compiledRow.pdfBytes !== undefined && compiledRow.pdfBytes !== null ? compiledRow.pdfBytes : null
        return Object.assign({}, envRead, {
          latexAvailable: envRead.latexAvailable === null ? true : envRead.latexAvailable,
          toolchainProbe: 'ran-present',
          toolchainProbeSource: 'paper-ledger',
          toolchainProbeMeans: 'toolchainProbe:"ran-present" read from the durable paper ledger, not from this session\'s probe memo: the paper track already holds a compile row (engine ' + (engine === null ? 'unnamed' : '"' + engine + '"') + ', ' + (rowBytes === null ? 'PDF size not recorded by the row' : String(rowBytes) + ' byte PDF') + (rowAt === null ? '' : ', recorded at ' + rowAt) + '), so a compile DID run and produced a file — the engine was available before it. This is an OBSERVATION of that compile, not an installation claim made by a read; it is the same verdict any kernel can reach from the same ledger',
        })
      })()
      // ★★★ RUN 2691 (TB-2691 / F75-15): IS THE FILE ON DISK STILL THE FILE THE ROW RECORDED? The row carries the sha256
      // the compile counted (same buffer as `pdfBytes`); this read hashes the disk file once. Either side `null` is named
      // absence — never "matches". A mismatch is the tamper/permission case: the row says which bytes, the disk says other.
      const pdfDisk = (compiledRow && compiledRow.pdfPath && kernel && kernel.latex && typeof kernel.latex.pdfReading === 'function')
        ? await kernel.latex.pdfReading(compiledRow.pdfPath)
        : { ok: false, exists: false, pdfBytes: null, pdfSha256: null, why: 'this kernel has no latex.pdfReading face, so the disk file could not be read' }
      const pdfRowSha = compiledRow && compiledRow.pdfSha256 !== undefined && compiledRow.pdfSha256 !== null ? String(compiledRow.pdfSha256) : null
      const pdfDiskSha = pdfDisk && pdfDisk.pdfSha256 !== undefined && pdfDisk.pdfSha256 !== null ? String(pdfDisk.pdfSha256) : null
      const pdfSha256MatchesDisk = pdfRowSha === null || pdfDiskSha === null ? null : pdfRowSha === pdfDiskSha
      const pdfSha256Mismatch = pdfSha256MatchesDisk === false
      return { ok: true, tool, action, target, exists,
        // ★★★ TB-2768: the SAME engine-log reading on the status door (status never compiles, so this is the LAST
        // compile's measured verdict — `logRead:false` means it was not measured, never "clean").
        ...glyphLossOf(compiledRow),
        stderrFindings: glyphFindingsOf(compiledRow),
        // ★★★ RUN 256 (TB-2624 item 1): the same four environment keys, same names, at the TOP level of this door too.
        ...envLedgerRead,
        ...(exists ? {} : { hint, inTrash: inTrash !== null, ...(inTrash ? { trash: inTrash } : {}) }),
        paper: paperView,
        // ★★★ TB-2782 (RUN 83 attempt-1): the evidence grades a reader like r-acad asked for, projected from the existing ledger
        evidenceGrades: evidenceGradesOf(kernel, got && got.state),
        // ★★★ TB-2713 (RUN 76 / A5, MEASURED): round 2's `deliverable:true` votes were read as stale on round 3, and no
        // receipt said which members a round boundary had invalidated. The reading now travels on the READ face too — and
        // it is the SAME object the advance door prints: `paper.perRoundReviewCoverage` owns the only arithmetic, this line
        // only calls it. A missing paper has no round coverage ⇒ null (the exists:false branch names what it can answer).
        perRoundReviewCoverage: exists && typeof paper.perRoundReviewCoverage === 'function' ? paper.perRoundReviewCoverage(target) : null,
        // ★★ RUN 182 (run 27 / FEEDBACK27 F27-10, MEASURED): `final{decision:"revise"}` is the ONLY way back to writing, and
        //   it was documented only in the refusal a caller gets AFTER trying the wrong move. A state machine that can say what
        //   it accepts should say it on the read face, not only when it says no.
        // ★★ RUN 189 (run 33 / FEEDBACK33 1.3, MEASURED): the content gate requires the paper's prose to carry every
        //   verified conclusion VERBATIM, and the ONLY way to learn which line that is used to be failing `final` and
        //   reading `missing[]`. Run 33's office did exactly that, then repaired the prose — which bumped the paper's
        //   round and invalidated both cross-reviews. The requirement is a property of the ledger, so it is readable
        //   before anything is written: `requiredLines` answers "what will the gate look for" on the status face.
        requiredLines: (() => {
          try {
            if (typeof paper.requiredLines !== 'function') return null
            const r = paper.requiredLines()
            return r && typeof r === 'object' ? r : null
          } catch (e) { return { ok: false, count: 0, items: [], message: 'reading the verified requirements threw: ' + String((e && e.message) || e) } }
        })(),
        reachableMoves: (() => {
          if (!paperView) return null
          const status = String(paperView.status === undefined || paperView.status === null ? '' : paperView.status)
          // ★★ RUN 188 (run 33 / FEEDBACK32 ②, MEASURED): this list used to show `final{decision:"revise"}` in `writing`
          //   and `reviewing` as well, and both were REFUSED (`VMU_PACK_V5R_CORE_PAPER_STATE`) — the one door back to
          //   writing is `final{decision:"revise"}`, and its gate is `state.status === 'awaiting-editor'` (or the
          //   pdf-less-final repair). A list of "reachable" moves that the state refuses is worse than no list.
          const pdfLess = (() => {
            if (status !== 'finalized' || !got || !got.state) return false
            try { return typeof paper.compiledPdfRow === 'function' ? paper.compiledPdfRow(got.state) === null : false } catch (e) { return false }
          })()
          const moves = status === 'writing' ? ['part{member,body}', 'advance']
            : status === 'reviewing' ? ['review{deliverable}', 'advance']
              : status === 'awaiting-editor' ? ['final{decision:"deliverable"}', 'final{decision:"revise"}', 'consult']
                : status === 'finalized' ? (pdfLess ? ['compile', 'final{decision:"revise"}', 'status'] : ['compile', 'status'])
                  : []
          return { status, moves, pdfLessFinalRepair: pdfLess, means: status === 'writing' || status === 'reviewing'
            ? 'the moves THIS state accepts next, read from the state machine: a draft takes part/advance and a reviewing paper takes review/advance. `final{decision:"revise"}` is the only door back to writing and it is NOT accepted here — it is accepted at awaiting-editor (and as the repair of a finalised paper that has no compiled PDF), so reaching it from ' + status + ' means advancing first'
            : 'the moves THIS state accepts next, read from the state machine: awaiting-editor takes final (deliverable or revise) and consult; a finalised paper takes compile/status, plus `final{decision:"revise"}` only as the repair of a paper whose compile never produced a PDF (`pdfLessFinalRepair`)' }
        })(),
        // ★★ RUN 178 (run 23 / FEEDBACK23 F6): the state's `editor` is a ROLE word, and `status` printed it bare next to
        // parts/reviews that carry real ids. The receipt now says which of the two you are reading, where the word came
        // from (persisted at `start` since RUN 178), and which seat actually signs.
        editorReading: (() => {
          const st = got && got.state ? got.state : null
          if (!st) return null
          const word = st.editor === undefined || st.editor === null ? null : String(st.editor)
          const source = st.editorSource === undefined || st.editorSource === null ? null : String(st.editorSource)
          const chair = (typeof kernel.members === 'object' && kernel.members && typeof kernel.members.roster === 'function'
            ? kernel.members.roster().filter((m) => m && String(m.slot) === 'chair' && String(m.state) !== 'ended')[0]
            : null) || null
          return {
            value: word,
            source,
            isRoleWord: word === 'academician' || word === 'office',
            seat: chair ? String(chair.id) : null,
            means: source === null
              ? 'this paper was started before the source was recorded (RUN 178): treat `paper.editor` below as a ROLE word, not a seat id'
              : '`value` is a ROLE word (not a seat id): "academician" means the seat in the chair slot signs, "office" means the office does; `source` says whether it was passed, normalised from a chair-seated member id, or defaulted, and `seat` names who held the chair when this reading was made',
          }
        })(),
        // ★★ RUN 175 (run 20 FEEDBACK20 ⑤): this view carries three clocks — `parts[].round`, `reviews[].round` and
        // `consult.requests[].at` — two measured in ROUNDS and one in milliseconds, and nothing said which was
        // which. One sentence now states the convention for the whole view (the old `at` on a part slot was already
        // removed in RUN 174; this names what remains).
        // ★★ RUN 256 (TB-2623): that millisecond "clock" is no longer assumed to be the wall clock — it is the subsystem
        // clock (`paperClock`: kernel clock when the kernel carries one), so the sentence names the source instead of
        // promising a wall-clock number the way it used to.
        // ★★ RUN 189 (run 33 / FEEDBACK33 1.4): `warnings` was a GROWING list read as if it described NOW. Run 33's
        // status printed the 3-round-cap disagreement next to two `deliverable:true` reviews of the SAME round. Each entry
        // now carries the round it belongs to; this sentence is the reading rule.
        warningsMeans: '`warnings` is HISTORY, not a verdict about the current state: each entry is tagged with the round it was written in (`（第 N 轮）`), and `forcedAfterCapRound` names the round whose cross-review hit the cap — a later round can agree and this list does not shrink (it is the record), so compare `forcedAfterCapRound` with the current `round` before reading it as now',
        roundMeans: 'every `round` in this view (parts, reviews) is the paper ROUND the row was written in — an ordinal, not an instant; `consult.requests[].at` is the subsystem clock in milliseconds (the only true time in the view — `paperClock` says whether that is the injected kernel clock or the counted wall-clock fallback), and the paper itself carries `createdRound`/`updatedRound`',
        partsMeans: 'each part slot says which ROUND it was written in (`round`); this subsystem counts rounds, it does not stamp a clock time on a part',
        reviewsMeans: 'each review row says which ROUND of the cross-review it belongs to (`round`); a row of another round is durable history, not a vote on this round',
        // ★★★ RUN 252 (run 72 / F72-7, MEASURED): the mutual exclusion is STRUCTURAL on this face too: a paper with a
        // compiled pdf answers `missing: []` (the compile needed no archive row), and the artifact ROWS travel as
        // `archiveArtifacts`. A paper with no compile on file still names the rows it lacks (RUN 183: a write-stage paper
        // must name them), and `missingMeans` says which of the two readings the caller is holding.
        // ★★★ TB-2691 correction (MEASURED on run 252): `pdfSha256` is EVIDENCE about the ledger row, not an INPUT the
        // compile lacked. RUN 2691 put it in this list, which re-opened the very contradiction F72-7 closed — a receipt
        // reading `produced:true` beside `missing:["pdfSha256"]`. The absence is named where it belongs: `pdfCompiled.
        // pdfSha256:null` plus `pdfSha256Means` ("treat the byte count as a claim"). This list stays ACTION-scoped, which
        // is the one thing its readers (compile/final/status) may compare.
        missing: compiledProduced
          ? []
          : (artifacts ? artifacts.missing.slice() : []),
        complete: artifacts ? artifacts.complete === true : false,
        missingMeans: compiledProduced
          ? 'empty because a compile IS on file for this paper: nothing this read needed is missing. The artifact ROWS are `archiveArtifacts` (e.g. `tex` is absent there for an md-format paper even after a successful compile) — two different questions (RUN 252 / F72-7). The LEDGER-EVIDENCE question (does the row carry `pdfSha256`, does it still match the disk) is answered by `pdfCompiled.pdfSha256`/`pdfSha256MatchesDisk`/`pdfSha256Means`, never by this list (TB-2691 correction)'
          : 'no compile is on file for this paper, so this list names the artifact ROWS that are absent (a write-stage paper reports md, tex, pdf, meta until render writes them). `archiveArtifacts` carries the same rows under their own name; `pdfCompiled.produced` is the file question, not this one',
        archiveArtifacts: archiveArtifactsReading(artifacts),
        // ★★★ RUN 255 / TB-2613: the OWNERSHIP question, under the same name on every read face. A paper artifact is a
        // LEDGER ROW (md/tex/pdf/meta), and a row names an md FILE only when its body carries `mdPath`; paper rows do not,
        // so the honest answer is null — the uniform shape, not an invented writer.
        mdOwner: null,
        mdOwnerMeans: 'a paper artifact is a LEDGER ROW (md/tex/pdf/meta), not an md file it owns: no paper row names `mdPath`, so there is no ownership evidence to report — null is the honest absence (the same null `vibe_v5_read_library` prints for a card that names no md file). Blueprint rows DO name their md file and carry `mdOwner` with bytes/sha256 read from the disk (RUN 255 / TB-2613)',
        // ★★ RUN 256 (TB-2623 clock purity): the paper subsystem is built per call, and both product sites passed no
        // clock — so it silently used the wall clock. It now resolves the kernel guarded clock first; this field is how a
        // receipt reader learns WHICH clock stamped the paper (injected:true names the kernel clock; the fallback is
        // counted and reported, never indistinguishable from it).
        paperClock: (() => {
          try { return typeof paper.clockSource === 'function' ? paper.clockSource() : null } catch (e) { return null }
        })(),
        paperClockMeans: 'the clock THIS paper face used: `injected:true` + `source:"kernel-clock"` means every paper timestamp came from the injected kernel clock (reproducible); `source:"wall-clock"` names the counted fallback, so no receipt can mistake a wall stamp for an injected one',
        // ★★ RUN 252: status reads the LEDGER, not a compile refusal, so the toolchain question is answered where the
        // refusal exists (`compile` / `final` receipts). An empty list here means "not reported", never "engine installed".
        // ★★★ RUN 256 (TB-2624 item 1): the environment reading is the SAME one `compile`/`final` print at top level
        // (one reader, three doors). `latexAvailable:null` means this session never asked; an empty list means
        // not-reported, never "installed".
        toolchainAbsent: envLedgerRead.toolchainAbsent,
        pdfEnvironmentMissing: envLedgerRead.pdfEnvironmentMissing,
        latexAvailable: envLedgerRead.latexAvailable,
        // ★★★ TB-2743 (item B): `toolchainAbsent: []` beside `not-run` means NOT TESTED, never "installed and fine".
        toolchainProbe: envLedgerRead.toolchainProbe,
        toolchainProbeMeans: envLedgerRead.toolchainProbeMeans,
        toolchainAbsentMeans: envLedgerRead.environmentMeans,
        // ★★ RUN 183 (run 29 / FEEDBACK29 D9, MEASURED): a finalized paper read `complete:true` beside `pdf:null` and
        //   a reader took it as "no PDF but the paper is complete". `complete` speaks only about the ARCHIVE artifacts
        //   row (md/tex/pdf/meta as NAMED rows); the file a compile produced is `pdfCompiled` below, and the two are
        //   different questions.
        completeMeans: 'complete means the four artifacts (md, tex, pdf, meta) are NAMED on the paper track\'s archive row — it does NOT mean a PDF file was compiled: that is `pdfCompiled.produced`/`pdfPath`. `missing` names only what THIS READ needed and did not get — empty once a compile is on file, otherwise the absent artifact ROWS (a write-stage paper reports md, tex, pdf, meta) — and the rows themselves ALWAYS travel as `archiveArtifacts` (RUN 252 / F72-7)',
        // ★★ RUN 156 (run-5 finding 7): `status.pdf` describes the paper track's ARCHIVE row (written by `render`), not the
        // file `compile` produced - so a reader who had just seen `compiled.produced:true` read `pdf.produced:false` as "no PDF".
        // Both readings are now named on the receipt instead of being left to the reader.
        pdf: artifacts ? artifacts.pdf : null,
        pdfMeans: 'this `pdf` block describes the ARCHIVE row in the paper track (render writes it); a file produced by compile is reported by `vibe_v5_paper { action: "compile" }` / the `final` receipt as `produced`+`pdfPath`+`pdfBytes` - the two are different questions, and `produced:false` here is not "no pdf was made"',
        // ★★ RUN 175 (run 19 FEEDBACK19 F9): the ARCHIVE row above says `produced:false` even right after a successful
        // `final`, because the compiled file is a SEPARATE row (`kind:"paper-pdf"`). A reader asking "is there a PDF?" had
        // to make another call and know that. So the status now reads the compiled ledger itself and answers that question
        // by name: `pdfCompiled` is the LAST compile this paper produced, or `produced:false` when it never compiled.
        ...(() => {
          const stateTarget = got && got.state && got.state.target !== undefined && got.state.target !== null ? String(got.state.target) : str(target)
          const stateId = got && got.state && got.state.id !== undefined && got.state.id !== null ? String(got.state.id) : str(target)
          const matchTitle = (t) => {
            const title = String(t || '')
            if (!title.endsWith('|pdf')) return null
            if (stateTarget !== '' && title.endsWith('|' + stateTarget + '|pdf')) return 'target'
            if (stateId !== '' && title.endsWith('|' + stateId + '|pdf')) return 'id'
            return null
          }
          // ★★ RUN 176 (run 21 A2, MEASURED): RUN 175's ledger read parsed `row.body` off `paper.papers()`, whose rows
          // carry METADATA ONLY (the kit says so at its own `listPaper`), so `produced` was false for every paper that had
          // really compiled — `rec-601/605` existed and the disk held 112 268 bytes. The ledger read now asks the kit's
          // `compiledPdfRow`, which OPENS each candidate row, so the error cannot be repeated one call deeper.
          let ledger = compiledRow
          if (!ledger) {
            // ★★★ TB-2743 (item B): `produced:false` alone made "the paper was never finalised", "there is nothing to
            // compile" and "the toolchain is missing" read as ONE fact. `blockedBy` names which gate the file is behind,
            // in the order the flow passes them, so the fix is the named one rather than a guess.
            const blockedState = got && got.state ? got.state : null
            const blockedStatus = blockedState && blockedState.status !== undefined && blockedState.status !== null ? String(blockedState.status) : ''
            const blockedPartKeys = blockedState && blockedState.parts && typeof blockedState.parts === 'object' ? Object.keys(blockedState.parts) : []
            const blockedBy = blockedStatus !== 'finalized'
              ? 'not-finalized'
              : (blockedPartKeys.length === 0
                ? 'no-parts'
                : (Array.isArray(envLedgerRead.toolchainAbsent) && envLedgerRead.toolchainAbsent.length > 0 ? 'toolchain-absent' : 'compile-not-run'))
            const blockedByMeans = blockedBy === 'not-finalized'
              ? 'the paper is not finalized yet (status: ' + (blockedStatus === '' ? 'unknown' : blockedStatus) + '): a PDF is produced by `final` (or by `compile` on an already-finalized paper), so there is nothing to look for yet — this is NOT a toolchain verdict'
              : (blockedBy === 'no-parts'
                ? 'the paper is finalized but carries NO parts, so there is no prose to typeset: record parts first (vibe_v5_paper { action: "part", … }) — this is NOT a toolchain verdict'
                : (blockedBy === 'toolchain-absent'
                  ? 'the paper was finalized and parts exist, but the compile found the LaTeX toolchain unusable (' + envLedgerRead.toolchainAbsent.join(', ') + '): a MEASURED absence, see `toolchainProbe:"ran-absent"`'
                  : 'the paper was finalized and parts exist, and the compile was never observed producing a PDF (toolchainProbe:' + String(envLedgerRead.toolchainProbe) + '): re-run vibe_v5_paper { action: "compile", target: "' + stateTarget + '" } and read its receipt'))
            return { pdfCompiled: { ...glyphLossOf(null), produced: false, matchedBy: null, target: stateTarget, recordId: null, pdfPath: null, pdfBytes: null, pdfSha256: null, engine: null,
              blockedBy, blockedByMeans,
              // ★★★ RUN 249 (F-08): no ledger row ⇒ NO record can name the file on disk. Stated as a field (not silence)
              // so a reader never has to infer "recordId:null" means "the file exists but no row wrote it".
              diskFileFromRecord: null, diskFileBytes: null,
              diskPdfSha256: null, diskPdfBytes: null, pdfSha256MatchesDisk: null, pdfSha256Mismatch: false,
              pdfSha256Means: 'there is no compile row, so no file hash can be compared: `produced:false` and a null hash are the honest answer (RUN 2691 / F75-15)',
              diskFileFromRecordMeans: 'there is NO compile ledger row, so no record can name the file on disk: `produced:false` is the honest answer, and a paper whose `final` reported a PDF while this row is missing is a named gap, not an empty one',
              means: 'no compile is on file for this paper (the `paper` track holds no `paper-pdf` row named after this paper id or target); `final` compiles, `compile` re-typesets an already-finalized paper — and a paper whose `final` reported a PDF but whose ledger row is missing is a named gap, not an empty one' } }
          }
          const stateBody = got && got.state ? got.state : null
          const finalPdfRecordId = stateBody && stateBody.finalPdfRecordId !== undefined ? stateBody.finalPdfRecordId : null
          const finalPdfBytes = stateBody && stateBody.finalPdfBytes !== undefined ? stateBody.finalPdfBytes : null
          // ★★ RUN 195 (run 37 / FEEDBACK36 1.1, MEASURED): after the finalisation a member's own kernel recompiled the
          // paper (91 156 → 91 198 bytes on disk) while this block still reported the finalisation's compile. Two facts
          // were being merged into one number. `pdfCompiled` is the NEWEST compile row (the file's current provenance) and
          // `compiledAfterFinal` says whether that row is a DIFFERENT compile than the one the paper was finalised with.
          const recompiled = finalPdfRecordId !== null && ledger && ledger.id !== undefined && ledger.id !== null
            && String(ledger.id) !== String(finalPdfRecordId)
          return { pdfCompiled: {
            ...glyphLossOf(ledger),
            produced: true,
            matchedBy: matchTitle(ledger.title),
            target: stateTarget,
            recordId: ledger.id === undefined ? null : ledger.id,
            pdfPath: ledger.pdfPath === undefined ? null : ledger.pdfPath,
            pdfBytes: ledger.pdfBytes === undefined ? null : ledger.pdfBytes,
            engine: ledger.engine === undefined ? null : ledger.engine,
            // ★★★ RUN 2691 (TB-2691 / F75-15): the file's sha256, as the compile recorded it from the SAME buffer it
            // counted. Run 75's archive row had only a body fingerprint, so the verifier's "sha256(disk) == row sha"
            // leg was ARITHMETIC-BLOCKED. `null` means "this row predates the hash" — named, not silently equal.
            pdfSha256: ledger.pdfSha256 === undefined ? null : ledger.pdfSha256,
            finalPdfSha256: stateBody && stateBody.finalPdfSha256 !== undefined ? stateBody.finalPdfSha256 : null,
            diskPdfSha256: pdfDiskSha,
            diskPdfBytes: pdfDisk && pdfDisk.pdfBytes !== undefined ? pdfDisk.pdfBytes : null,
            pdfSha256MatchesDisk,
            pdfSha256Mismatch,
            pdfSha256Means: pdfRowSha === null
              ? 'the ledger row records no pdfSha256, so the file on disk cannot be proved to be this compile: treat the byte count as a claim, not a proof (RUN 2691 / F75-15). This is EVIDENCE about the row, not an input the compile lacked — status `missing` stays empty (TB-2691 correction, RUN 252)'
              : pdfDiskSha === null
                ? 'the row records pdfSha256 ' + pdfRowSha + ', but the file at pdfPath could not be read (' + String((pdfDisk && pdfDisk.why) || 'no reading') + '), so disk agreement is unknown — not true by default'
                : pdfSha256Mismatch
                  ? 'TAMPERED OR REPLACED: the row records pdfSha256 ' + pdfRowSha + ' but the file on disk is ' + pdfDiskSha + ' (' + String(pdfDisk.pdfBytes) + ' bytes vs recorded ' + String(ledger.pdfBytes) + ') — the file is no longer the bytes this compile produced. This named mismatch is the reading; `missing` stays empty because the action lacked nothing (TB-2691 correction)'
                  : 'the file on disk IS the file this compile produced: sha256(' + String(ledger.pdfPath || '') + ') = ' + pdfRowSha + ', equal to the row, and both are ' + String(pdfDisk.pdfBytes) + ' bytes',
            // ★★★ RUN 249 (F-08, MEASURED on the 69th real-machine run): `final` recorded 69,726 B (rec-31) while the
            // newest `compile` recorded 69,725 B (rec-32) and `compiledAfterFinal:true` — two numbers, and NO field said
            // which RECORD the file now on disk came from. `recordId` was the newest compile row, but a reader holding
            // "final says 69726, compile says 69725" could not answer "so which record wrote the file I can open". This
            // field answers exactly that, by name; `compiledAfterFinal` then says whether that row is the finalisation's.
            diskFileFromRecord: ledger.id === undefined ? null : ledger.id,
            diskFileBytes: ledger.pdfBytes === undefined ? null : ledger.pdfBytes,
            diskFileFromRecordMeans: 'the file ON DISK was typeset by ' + String(ledger.id === undefined ? 'a ledger row whose id is unreadable' : ledger.id) + ' (' + String(ledger.pdfBytes === undefined ? 'bytes unreadable' : ledger.pdfBytes) + ' bytes); the FINALISATION recorded ' + String(finalPdfRecordId === null ? 'no compile row' : finalPdfRecordId) + ' (' + String(finalPdfBytes === null ? 'bytes unreadable' : finalPdfBytes) + ' bytes) — `compiledAfterFinal` says whether those are the same compile, so read this field, not `finalPdfBytes`, to answer "which record put the file I can open on disk"',
            tried: Array.isArray(ledger.tried) ? ledger.tried : [],
            finalPdfRecordId,
            finalPdfBytes,
            compiledAfterFinal: recompiled,
            compiledAfterFinalMeans: recompiled
              ? 'this row is NOT the compile the paper was finalised with: the paper was finalised by ' + String(finalPdfRecordId) + ' (' + String(finalPdfBytes) + ' bytes) and the file has since been re-typeset by ' + String(ledger.id) + ' (' + String(ledger.pdfBytes) + ' bytes) — `compile` is allowed on a finalised paper, so BOTH numbers are true of different moments: the finalisation is the old one, the file on disk is this one'
              : 'this row IS the compile the paper was finalised with (no later compile is on the ledger), so pdfBytes and the file on disk describe the same moment',
            means: 'the NEWEST `paper-pdf` row this paper produced (the compile ledger), read by OPENING the row — so "is there a PDF file, and which compile made it?" is answered here instead of by a second call; the `pdf` block above is the ARCHIVE row render wrote, a different record',
          } }
        })(),
        // ★★ RUN 196 (run 37 / FEEDBACK36 2.6, MEASURED): TWO TREES, AND NO RECEIPT SAID WHICH ONE HOLDS THE PAPER.
        // Run 37's `read_library` answered `libraryRoot: <ws>/VibeMath` while the finalised PDF sat at `<ws>/Paper/
        // paper-p1/paper-p1.pdf` — both true, because paper artifacts are written under the deployment's ARTIFACT root
        // (`outDirPrefix`, 'Paper/<folder>') and the institute LIBRARY is a different tree. A reader holding two
        // absolute paths and no sentence connecting them has to guess whether the paper was filed in the library.
        // The status receipt now carries both roots and says what each is FOR, so the answer is a reading, not an
        // inference. `artifactRoot` is derived from the compiled file's own path when a compile exists; before the
        // first compile it is null WITH a reason, rather than a path nobody measured.
        roots: (() => {
          const libRoot = (() => {
            try {
              const lib = kernel && kernel.library
              return lib && typeof lib.root === 'string' && lib.root !== '' ? lib.root : null
            } catch (e) { return null }
          })()
          let artifactRoot = null
          try {
            const led = kernel && got && got.state && typeof paper.compiledPdfRow === 'function' ? paper.compiledPdfRow(got.state) : null
            const p = led && typeof led.pdfPath === 'string' ? led.pdfPath : ''
            if (p !== '') artifactRoot = p.replace(/[\\/][^\\/]+$/, '')
          } catch (e) { artifactRoot = null }
          return {
            libraryRoot: libRoot,
            artifactRoot,
            artifactPrefix: 'Paper/<paper-folder>/',
            means: 'TWO DIFFERENT TREES, both real: the institute LIBRARY (`libraryRoot`) holds member file cards and the '
              + 'records-backed library surface, while PAPER ARTIFACTS (md/tex/pdf/meta) are written under the deployment\'s '
              + 'artifact prefix `' + 'Paper/<paper-folder>/' + '` — a sibling of the library root when the kernel root is the '
              + 'workspace, NOT a directory inside it. `artifactRoot` is the ABSOLUTE directory of the newest compiled file '
              + 'when a compile exists (null with `artifactRootWhy` before the first compile: nothing has been measured yet, '
              + 'which is not the same as "no such tree"). A PDF therefore NEVER shows up under `libraryRoot` — look for it at '
              + '`pdfCompiled.pdfPath` (absolute) first',
            artifactRootWhy: artifactRoot === null
              ? 'no compile is on file for this paper, so no absolute artifact directory has been measured — `status` can name the prefix, not a path'
              : null,
            libraryRootMeans: libRoot === null
              ? 'this kernel was assembled without a durable library root, so there is no library tree to compare the artifact root against'
              : 'the ABSOLUTE directory the library surface scans for member file cards (the same value `vibe_v5_read_library` prints as `libraryRoot`)',
          }
        })() }
    }
    case 'start': {
      // ★★ RUN 164 (FEEDBACK12 item 7): `title` was accepted by the schema and SILENTLY DROPPED here, so the human name a
      // caller gave the paper never reached the state — and later addressing attempts by that name were refused as
      // "no such paper". The title is now persisted and addressable (the state keeps the target as its one TRUE name).
      const started = paper.start({
        target,
        ...(has(args.title) ? { title: str(args.title) } : {}),
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
        // ★★ RUN 191 (run 35 / FEEDBACK34 2.1, MEASURED): THE DIAGNOSIS WAS ONLY IN `hint`. Run 35 read this refusal's
        // `message` alone ("these evidence pointers do not resolve against the records face … no-such-record"), concluded
        // the pointer was a typo, and only found "that is a FILE CARD, not a record" one field later. A reader that stops
        // at the first sentence must not be told the wrong cause: the file-card fact belongs in the message.
        const fileCardPointers = pointers.unknown.filter((u) => /(^|[\/])Members[\/]/.test(String(u.pointer || '')) || /\.md$/.test(String(u.pointer || '')))
        const fileCardClause = fileCardPointers.length
          ? ' —— 其中 ' + fileCardPointers.map((u) => '"' + u.pointer + '"').join('、') + ' 是磁盘上的「文件卡」（Members/<成员>/Propos/<名>.md）而不是记录行：文件存在不等于记录库里有一行（附录按【记录】索引）'
          : ''
        // ★★ RUN 197 (run 38 / FEEDBACK37 1.5, MEASURED): this refusal carried code+message+hint only, while the SAME gate at
        // render carried `gate`/`nextGate`/`missing`/`missingMeans` — run 38's member parsed prose to learn which check had
        // fired. Returned as DATA, not thrown: the host rebuilds a thrown error as {ok:false, code, message, hint} and drops
        // every other key, so a thrown `gate` would be thrown away.
        return refusalReceipt('VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
          'these evidence pointers do not resolve against the records face: ' + pointers.unknown.map((u) => '"' + u.pointer + '" (' + u.reason + (u.expectedTrack ? ', expected track ' + u.expectedTrack : '') + ')').join('; ') + fileCardClause,
          'write the record first (vibe_v5_record_proposition / vibe_v5_record_method / vibe_v5_record_subproblem), then re-write this part with the pointer it produced; a pointer is Members/<member>/(Propos|Methods|Subproblems|Progress)/<record id>.md'
            // ★★ RUN 188 (run 33 / FEEDBACK32 ③): when the pointer IS the file card the member wrote to disk, say so —
            //   "do not resolve" and "this is a different face" are different sentences, and only the second one tells
            //   the member what to do next. ★ RUN 191 moved the same fact INTO the message (see above) so it is not
            //   lost to a reader who stops at the first field.
            + (fileCardPointers.length
              ? ' —— 把这张卡写成记录行拿到 rec-<n>，再用那个 id（文件卡本身不能当证据指针）' : '')
            + (pointers.unknown.some((u) => Array.isArray(u.closest) && u.closest.length)
              ? ' — 相近的: ' + pointers.unknown.filter((u) => Array.isArray(u.closest) && u.closest.length).map((u) => u.cardId + ' ⇒ ' + u.closest.map((c) => c.id).join('/')).join('；')
              : ''),
          {
            gate: 'evidence',
            nextGate: 'required-line',
            missing: pointers.unknown.map((u) => String(u.pointer)),
            provided: pointers.provided,
            missingMeans: 'every id here is an EVIDENCE pointer the records face could not resolve — this gate answered "do these pointers resolve?" (`missing` names them); the next check in the delivery contract is the required-line gate at render',
          })
      }
      // ★★ RUN 177 (run 22, FEEDBACK22 D3): the BODY is judged at the same moment as the evidence list. A member wrote
      // `Members/r-1/Propos/run22-cubes.md#二` in prose while the record's id was rec-6xx; `recordPart` accepted it and
      // the citation rule fired at render/final — after the paper had been written and cross-reviewed. The rule was
      // right, the moment was not: a pointer that names no record is refused where it is typed.
      // ★★ RUN 178 (run 23 / FEEDBACK23 F1+D3, MEASURED): this list scanned `part`/`solution`/`methods`/`rules`/
      // `limits` and NOT `body` — while `recordPart` below reads `args.body || args.solution`, i.e. `body` is the
      // FIRST prose parameter of a part. A caller who passed its prose as `body` (the documented shape) had every
      // fabricated pointer accepted and only found out at `render`, the most expensive moment. The list is now the
      // SAME set `recordPart` consumes, so a field that reaches the page cannot skip the check.
      const proseText = ['part', 'body', 'solution', 'methods', 'rules', 'limits']
        .map((k) => (args[k] === undefined || args[k] === null ? '' : String(args[k]))).filter((s) => s !== '').join(String.fromCharCode(10))
      const prosePointers = proseText !== '' && typeof paper.prosePointers === 'function' ? paper.prosePointers(proseText) : null
      if (prosePointers && prosePointers.ok !== true) {
        // ★★ RUN 188 (run 33 / FEEDBACK32 ③, MEASURED): run 33's member DID what the institute asked — it wrote its
        //   reasoning to `VibeMath/Members/r-1/Propos/<name>.md` — and cited that file. The refusal said the id is
        //   unknown, which is true, and never said the pointer is a FILE CARD rather than a records row: two different
        //   things, one of which does not exist on the cited track by design.
        const fileCards = prosePointers.unknown.filter((u) => /(^|[\/])Members[\/]/.test(String(u.pointer || '')))
        // ★★ RUN 197 (same repair as the evidence refusal above): the citation refusal is a DIFFERENT gate answering a
        // DIFFERENT question, and now says which instead of leaving the caller to guess from prose.
        return refusalReceipt('VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
          '这部分的正文引用了记录库里不存在的 id：' + prosePointers.unknown.map((u) => '"' + u.pointer + '" (' + u.reason + (u.expectedTrack ? '，应为 ' + u.expectedTrack + ' 轨' : '') + (Array.isArray(u.nearby) && u.nearby.length ? '；相近的 ' + u.nearby.join('/') : '') + ')').join('；')
            + (fileCards.length > 0 ? '——其中 ' + fileCards.length + ' 条是磁盘上的「文件卡」（Members/<成员>/Propos/<名>.md），不是记录库里的行：文件存在不等于有这一行' : ''),
          '正文里的 Members/<member>/(Propos|Methods|Subproblems|Progress)/<记录 id>.md 指针按【记录 id】解析，不按文件名解析：先用记录面写出那条卡（vibe_v5_record_proposition 等）并拿到它返回的 id，再把路径写成 …/<那个 id>.md；或在 evidence 里直接写记录 id',
          {
            gate: 'citation',
            nextGate: 'evidence',
            missing: prosePointers.unknown.map((u) => String(u.pointer)),
            missingMeans: 'every pointer here is a PROSE citation that resolved to no record — this gate answered "does the record exist?" (`missing` names the paths); the next check is the evidence gate (>=1 entry per part)',
          })
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
      // ★★ RUN 197 (run 38 / FEEDBACK37 1.4, MEASURED): this face ACCEPTS an empty `evidence` list (the requirement is the
      // DELIVERY gate's) and nothing said so — the member read its own empty list as "checked and fine". The receipt states
      // which face requires what, where the writer can still act on it.
      // ★★★ RUN 215 (run 52 / FEEDBACK51 2.2, MEASURED): the delivery gate checks REQUIRED LINES verbatim, and that list
      // lived only on `status` — so the first time a writer heard about it was `final` refusing the paper, after every part
      // had been written and cross-reviewed. The part receipt now carries the list, i.e. the writer learns the target while
      // it can still write the sentence.
      const requiredLineLookahead = (() => {
        try {
          if (typeof paper.requiredLines !== 'function') return null
          const r = paper.requiredLines()
          if (!r || typeof r !== 'object') return null
          return { count: Number(r.count) || (Array.isArray(r.items) ? r.items.length : 0), items: Array.isArray(r.items) ? r.items : [] }
        } catch (e) { return null }
      })()
      return { ok: true, tool, action, part,
        requiredLines: requiredLineLookahead === null ? null : Object.assign({}, requiredLineLookahead, {
          means: 'these are the lines the DELIVERY gate looks for VERBATIM in the rendered text (read them from `status.requiredLines` at any time): write each one exactly as printed inside some part, otherwise `final` refuses the paper after every part has been written',
        }),
        evidence: pointers === null ? null : { provided: pointers.provided, checked: true,
          resolved: pointers.resolved.map((r) => r.cardId), means: pointers.means },
        evidenceGate: {
          gate: 'evidence',
          requiredAt: 'render/final',
          satisfiedNow: pointers !== null && pointers.provided > 0,
          means: pointers !== null && pointers.provided > 0
            ? 'this part filed ' + pointers.provided + ' evidence pointer(s) and every one resolved; the delivery gate asks the same question per part and will find this part covered'
            : 'this face REQUIRES nothing: a part with no `evidence` is accepted HERE, and the DELIVERY gate (gate "evidence", one entry per part) refuses the paper at render/final until every part filed at least one — write `evidence: ["rec-<n>"]` before then',
        } }
    }
    case 'review': {
      // ★★ RUN 177 (run 22, FEEDBACK22 D4): `final` takes `decision:"deliverable"|"revise"`, `review` takes
      // `deliverable:true|false` — and the schema documents both on one face, so the first honest attempt
      // (`review {decision:"deliverable"}`) came back "deliverable must be true or false", a sentence about a
      // parameter the caller never passed. The face now names the confusion and the fix, before the kernel sees it.
      // ★★★ RUN 208 (run 45 / FEEDBACK44 1.1, MEASURED): the guard below only named the confusion when `decision` was a
      // STRING. run 45 passed `decision:false` (a boolean, i.e. the shape of `final`), the guard stayed silent, and the
      // key was dropped by the reader — the review came back ok:true and the NEXT advance read the paper as unanimous,
      // so "send this part back" was accepted and then ignored. A parameter this face does not read must be refused at
      // ANY type: the silent drop is the defect, not the spelling.
      // ★★★ RUN 209 (run 46 / FEEDBACK45 1.3, MEASURED): RUN 208's guard was written as "refuse `decision` when
      // `deliverable` is absent" — and run 46 passed BOTH (`deliverable:true, decision:false`), so the guard never ran and
      // the boolean was dropped exactly as before: `ok:true`, next `advance` read the paper as unanimous. The precondition
      // was the bug. This face NEVER reads `decision`, so its presence is refused at any combination, and the refusal says
      // which of the two values the caller gave is the one that counts.
      if (args.decision !== undefined && args.decision !== null) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'review takes `deliverable: true|false`, not `decision:' + (typeof args.decision === 'string' ? '"' + String(args.decision) + '"' : ('(' + typeof args.decision + ') ' + JSON.stringify(args.decision))) + '` — `decision` belongs to `final`, and this face does NOT read it: a review that says "decision" was silently counted as deliverable:true before RUN 208',
          'call review again with deliverable:true (this part is deliverable) or deliverable:false (send it back), keeping `of` naming the part you reviewed')
      }
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
      // ★★★ TB-2772 (RUN 82 attempt-1): A PDF THAT DROPPED GLYPHS IS NOT A DELIVERABLE. The kit rolled the
      // finalisation back to awaiting-editor and returned a NAMED refusal; this face hands the caller `ok:false` + the
      // code + the glyph rows + the literal rewrite advice, so the loss is never delivered silently. No override.
      if (finalized && finalized.ok === false && finalized.code === 'VMU_PAPER_GLYPH_UNCOVERED') {
        const glyphRows = Array.isArray(finalized.glyphsUnrepaired) ? finalized.glyphsUnrepaired : []
        const glyphCount = finalized.missingCharacterCount === undefined || finalized.missingCharacterCount === null
          ? glyphRows.reduce((n, r) => n + (Number(r && r.count) || 0), 0)
          : Number(finalized.missingCharacterCount)
        const glyphStage = finalized.stage === undefined ? null : finalized.stage
        return { ok: false, tool, action,
          code: 'VMU_PAPER_GLYPH_UNCOVERED',
          message: finalized.message === undefined ? null : finalized.message,
          hint: finalized.hint === undefined ? null : finalized.hint,
          target: finalized.target === undefined ? target : finalized.target,
          stage: glyphStage,
          finalized: false,
          rolledBack: finalized.rolledBack === undefined ? null : finalized.rolledBack,
          // ★★★ TB-2781 D2 (RUN 83 attempt-1, MEASURED): the 2,688-char glyph refusal answered `rolledBack` but NOT
          // `reviseAvailable`, while V17's criterion asks for the three names together (rolledBack/returned/reviseAvailable)
          // — the caller was told the paper went back but not that it can be revised. The kit already returns the fact;
          // this projection just stopped dropping it.
          reviseAvailable: finalized.reviseAvailable !== false,
          returned: glyphStage,
          glyphLossDetected: true,
          missingCharacterCount: glyphCount,
          glyphsUnrepaired: glyphRows,
          glyphLossCode: 'VMU_PAPER_GLYPH_UNCOVERED',
          logPath: finalized.logPath === undefined ? null : finalized.logPath,
          glyphLossMeans: finalized.means === undefined ? null : finalized.means,
          final: { ok: false, finalized: false, code: 'VMU_PAPER_GLYPH_UNCOVERED', stage: glyphStage,
            glyphLossDetected: true, missingCharacterCount: glyphCount, glyphsUnrepaired: glyphRows,
            means: finalized.means === undefined ? null : finalized.means },
          means: finalized.means === undefined ? null : finalized.means }
      }
      // Projected, not re-exported: the flow returns `artifacts`/`missing`/`pdf` sharing references, and the host's
      // serializer labels a second occurrence of the same value "[circular]". A face that hands out a receipt full of
      // "[circular]" would make a reader think the receipt is broken.
      const finProduced = !!(finalized.pdf && finalized.pdf.ok === true && (finalized.pdf.produced === true || Boolean(finalized.pdf.pdfPath)))
      // ★★★ RUN 256 (TB-2624 item 1): ONE environment reading, TOP level, same four names as `compile`/`status`. The
      // nested `final.toolchainAbsent`/`final.pdfEnvironmentMissing` below stay for compatibility (RUN 252 pins read them),
      // but the authoritative, comparable reading is this one.
      const envFin = environmentReadingsAt(kernel, {
        pdf: finalized.pdf || null,
        pdfEnvironmentMissing: finalized.pdfEnvironmentMissing === true,
      })
      // ★★★ RUN 258 (TB-2638 / P43): `ok:true` on THIS door was read as "the paper is finalised and done", while the
      // same receipt carried `missing:["pdf"]`. Completion is a different question from acceptance, so it gets its own
      // name, its own sentence, and a list of the calls that answer the difference. `ok` stays true (RUN 155/252 forbid
      // demoting it to false: the finalisation really was accepted; what was absent is a downstream fact).
      const finComplete = finalized.finalized === true && finProduced
      const finUnfinished = finComplete ? [] : [finalized.finalized === true ? 'pdf' : 'final']
      const finCompleteMeans = finComplete
        ? 'complete:true — the finalisation ran AND the pdf exists. The archive ROW set is a separate question: read `archiveArtifacts.complete`'
        : 'complete:false — `ok:true` says the finalisation REQUEST was accepted, NOT that the paper is complete: ' + (finalized.finalized === true
          ? 'the finalisation ran but the pdf is absent (`missing:["pdf"]`). On a machine with no LaTeX that is an ENVIRONMENT fact, not a retry: read `toolchainAbsent`/`pdfEnvironmentMissing`, and `reachableInstead` for the calls that answer it'
          : 'the finalisation itself did not happen (see `rolledBack`/`reviseAvailable`/`pdf`)')
      const finReachable = finComplete ? [] : [
        { call: 'vibe_v5_paper { action: "status", target }', reads: 'toolchainAbsent / pdfEnvironmentMissing — the environment fact, without retrying a compile' },
        // RUN 258 / AUDIT-14 P1-7 (lead-approved 4th site): the same false value lived here too — the legal needs are
        // the registry keys below, and a registered name is the only thing `vibe_vmu_env` accepts.
        { call: 'vibe_vmu_env { action: "probe", need: "' + ENGINE_NEED + '" }', reads: 'ok / installCommand; a failed probe is a NORMAL result (this framework never installs anything for you); legal document-engine needs: ' + ENGINE_NEEDS.join(' / ') },
        { call: 'nothing further — final is already accepted', reads: 'complete:false + missing:["pdf"] is the honest completion reading on an md-only or engine-less machine' },
      ]
      return { ok: true, tool, action,
        okMeans: PAPER_OK_MEANS,
        complete: finComplete,
        completeMeans: finCompleteMeans,
        unfinished: finUnfinished,
        reachableInstead: finReachable,
        ...envFin,
        // ★★★ TB-2768 (RUN 81 attempt-3): `ok:true` + a `Missing character` log is exactly what this round removes from
        // invisibility — the glyph verdict is a TOP-LEVEL reading of the final receipt (and inside final.pdf via projection).
        ...glyphLossOf(finalized.pdf),
        stderrFindings: glyphFindingsOf(finalized.pdf),
        final: {
        ok: finalized.ok === true, finalized: finalized.finalized === true, target: finalized.target,
        // ★★★ RUN 258 (TB-2638 / P43): the same two facts INSIDE the nested block, because that is where a reader who
        // looks at `receipt.final` first will ask the question. One value, two projections — not a second estimate.
        complete: finComplete,
        completeMeans: finCompleteMeans,
        unfinished: finUnfinished,
        final: finalized.final || null,
        // ★★★ RUN 252 (run 72 / F72-7, MEASURED): the finalisation receipt carried `missing: ["tex"]` beside
        // `pdf.produced: true` — the archive-row list was being read as "what finalisation lacked". It is not: a
        // finalisation needs the PDF, so when the pdf block says produced this list is EMPTY; the artifact ROWS (which
        // can lack `tex` for an md-format paper even after a successful compile) are `archiveArtifacts` below.
        missing: finProduced ? [] : ['pdf'],
        // ★ RUN 252 review: an EMPTY list gets NO explanation here. RUN 161's pin (run161 §6) already ruled that a
        // receipt must not invent "the missing thing is an archive row" prose when nothing is missing, and the archive
        // question has its own named field (`archiveArtifacts.means`) — so `null` is the honest word for "nothing to
        // explain", not a sentence that re-opens the very confusion F72-7 removes.
        missingMeans: finProduced
          ? null
          : 'the one thing this finalisation needed and did not get is the pdf. `pdfEnvironmentMissing`/`toolchainAbsent` say whether an engine was even installed, and `archiveArtifacts` carries the artifact ROWS',
        // ★★ RUN 161 (FEEDBACK8 item 5.2): `requestedTarget` records the spelling the caller used (the rows are titled
        // by the paper's own target — run 9 read four present rows as missing because the projection spoke for the argument).
        requestedTarget: finalized.requestedTarget || null,
        toolchainAbsent: toolchainAbsentOf(finalized.pdf),
        toolchainAbsentMeans: toolchainAbsentMeans(toolchainAbsentOf(finalized.pdf)),
        // ★★★ RUN 252 (F72-7): the kit hands `finalized.artifacts` as a SNAPSHOT TAKEN BEFORE the compile — it cannot
        // even see the pdf row the finalisation just wrote. The rows are a property of the LEDGER, so this projection
        // re-reads them AFTER the finalisation and only falls back to the snapshot if that read throws.
        archiveArtifacts: (() => {
          try {
            if (typeof paper.PaperArtifacts === 'function') return archiveArtifactsReading(paper.PaperArtifacts({ target }))
          } catch (e) { /* fall back to the kit snapshot */ }
          return archiveArtifactsReading(finalized.artifacts)
        })(),
        // ★★★ RUN 212 (run 49 / FEEDBACK48 1.3/2.4, MEASURED): the advance receipt named this fact `officeConsultPending`
        // while this projection answered only with `consult.armed` — one fact, two names, on the door that runs LAST. The
        // projection is where the field was lost (the kit already prints it), so the alias is carried here as well.
        officeConsultPending: false,
        officeConsultPendingMeans: 'false here BY CONSTRUCTION: finalisation already happened, so nothing is pending. `consult.armed`/`satisfiedBy` on this receipt is the authoritative reading of the setting, and `vibe_v5_paper { action: "consult_state" }` prints the same fact as `armed`/`policy`. The projection used to drop the alias, so the one name a reader learned from `advance` was missing on the door that finalises (RUN 212 / FEEDBACK48 1.3).',
        // ★ E4: the kit returns WHICH way the consult rule was satisfied ("off" / "answered" / "exempt") precisely so a
        // finalisation cannot quietly claim "the office checked it" when the gate was simply off. The projection used to
        // drop that field — i.e. the tool face hid the one piece of evidence that makes the gate's claim auditable.
        consult: finalized.consult ? {
          armed: finalized.consult.armed === true, satisfiedBy: finalized.consult.satisfiedBy || null,
          answeredBy: finalized.consult.answeredBy || null, requestId: finalized.consult.requestId || null,
          note: finalized.consult.note || null } : null,
        // ★★ RUN 155 (problem 2): the SAME projection the `compile` door returns (one shape, two doors).
        pdf: finalized.pdf ? projectPdfBlock(finalized.pdf, finalized.target) : null,
        // ★★★ RUN 177 (run 22, FEEDBACK22 D1): RUN 176 taught the KIT to answer `finalized:false` plus the two fields
        // that make the answer actionable — and this projection dropped BOTH, so the real-machine receipt said "not
        // finalized" with nothing naming why or what to call next (and the agent read the missing keys as the old bug).
        // A receipt that hides the branch it took is the defect this file keeps closing: the keys travel now, and
        // `pdfEnvironmentMissing` (the one branch that DOES finalise without a PDF) travels with its own explanation.
        rolledBack: finalized.rolledBack ? {
          from: finalized.rolledBack.from || null,
          to: finalized.rolledBack.to || null,
          keptEarlierFinal: finalized.rolledBack.keptEarlierFinal === true,
        } : null,
        reviseAvailable: finalized.reviseAvailable === true,
        pdfEnvironmentMissing: finalized.pdfEnvironmentMissing === true,
        pdfEnvironmentMeans: finalized.pdfEnvironmentMeans || null,
        // ★★ RUN 156 (run-5 finding 1): a `revise` past the review cap is admitted as a REPAIR round, and the kit
        // has always returned `repair`/`repairs`/`repairBudget`/`cap` for it — but this projection dropped all four, so a
        // caller had to call `status` a second time to learn that the revise it just made was a repair. A receipt that
        // hides the branch it took is the exact defect this file keeps closing; the keys are projected only when the
        // branch is a repair, so an ordinary final is unchanged.
        moved: finalized.moved === true,
        // ★★★ RUN 208 (run 45 / FEEDBACK44 1.5, MEASURED): a SUCCESSFUL final answered moved:false with from/to null — true in
        // the narrow sense that `advance` did not move anything (this call is not an advance), and useless to a reader who
        // asked "did the stage change". stageMoved names the STAGE: a finalisation takes awaiting-editor to finalized.
        stageMoved: finalized.moved === true || finalized.finalized === true,
        stageMovedMeans: finalized.finalized === true
          ? 'the STAGE moved to finalized (awaiting-editor → finalized); `moved` answers the narrower question "did an ADVANCE move anything", which is false for this call by definition'
          : (finalized.moved === true
            ? 'the stage moved (see from/to): `final {decision:"revise"}` took the paper back to writing'
            : 'no stage moved: the finalisation was refused or rolled back (see rolledBack/reviseAvailable and the `pdf` block)'),
        from: finalized.from || null,
        to: finalized.to || null,
        // ★★ RUN 158 (E): the four keys are now ALWAYS present, not only on a repair round. A revise that took the
        // ORDINARY branch answers repair:false with repairs/repairBudget/cap, so a caller can tell "rewrite, budget
        // untouched" from "repair, budget spent" without a second status read — the old shape simply omitted them and
        // left the ordinary branch indistinguishable from a receipt that forgot to say.
        repair: finalized.repair === true,
        repairs: Number(finalized.repairs) || 0,
        repairBudget: Number(finalized.repairBudget) || 0,
        cap: finalized.cap === undefined || finalized.cap === null ? null : finalized.cap,
      } }
    }
    case 'render': {
      const rendered = paper.render({ target })
      const arts = rendered.artifacts || null
      return { ok: true, tool, action, target, renderOk: rendered.ok === true,
        // ★★★ RUN 258 (TB-2638 / P45): `renderOk` is the ARCHIVE ROW question, not "did the render fail" — the kit
        // answers it with `artifacts.complete` (md/tex/meta/pdf), so on a machine without LaTeX it is false even when
        // the render request was ACCEPTED and wrote md/tex/meta. The corpus measured the word being read as "the
        // render succeeded"; it never meant that. One sentence each, no renaming (callers already read `renderOk`).
        okMeans: PAPER_OK_MEANS,
        renderOkMeans: rendered.ok === true
          ? 'renderOk:true — the ARCHIVE ROW SET (md/tex/meta/pdf) is complete after this render; `ok:true` was only the request being accepted'
          : 'renderOk:false — the archive ROW SET is INCOMPLETE (`missing` names the absent rows; typically the pdf row, which only `compile` writes). The render REQUEST was accepted and wrote the rows in `wroteToLedger`; renderOk:false is NOT "the .tex failed" and NOT a retryable error',
        // ★★★ RUN 221 (run 57 / FEEDBACK56 1.4, MEASURED): `wrote: ["md","tex","meta"]` beside `wroteWhere.disk: []`
        // reads as "wrote and did not write". The list is RECORD KINDS; the primary key now says so, the filesystem
        // answer is its own field, and `wrote` survives as a deprecated alias that names itself as one.
        wroteToLedger: Array.isArray(rendered.wrote) ? rendered.wrote.slice() : [],
        // ★★★ RUN 78 (FEEDBACK78 待定位节 / TB-2734, MEASURED): this receipt named the KINDS it wrote and not the ROWS,
        // so a reader who wanted to check "the three rows this render just made" had to run `read_library {track:"paper"}`
        // and guess. `recordIds` carries the id each `records.put` returned on THIS call (md/tex/meta; a kind the state
        // format did not request is absent, never null), so the rows are one `records.get` away and no second read is
        // needed. `wroteToLedger` stays: it answers WHICH artefacts were written, `recordIds` answers WHERE they landed.
        recordIds: rendered.wroteIds && typeof rendered.wroteIds === 'object' ? Object.assign({}, rendered.wroteIds) : null,
        recordIdsMeans: '`recordIds` maps the artefact kind (md/tex/meta) to the RECORD id `records.put` returned during THIS render — read it with `vibe_vmu_records { action: "get", id }` to see the row this call wrote. A kind absent here was not requested by the paper format (e.g. format:"md" writes no tex). It is NOT a file path: files appear in `diskFiles` only when compile writes one (RUN 78 / TB-2734)',
        diskFiles: [],
        wrote: Array.isArray(rendered.wrote) ? rendered.wrote.slice() : [],
        wroteDeprecated: '`wrote` is the OLD name for `wroteToLedger`: both list RECORD KINDS written into the paper track (md/tex/meta), NOT files. Read wroteToLedger and diskFiles — a .tex/.pdf appears on disk only when compile runs',
        // ★ ROUND 95: `wrote` lists RECORD kinds written into the paper track; render() writes no file, so a reader
        // who looks at `Paper/<id>/` and finds only a .tex (written by compile) used to conclude the receipt lied.
        wroteWhere: {
          records: Array.isArray(rendered.wrote) ? rendered.wrote.slice() : [],
          disk: [],
          means: '`wrote` lists the RECORD kinds written into the paper track (md/tex/meta). render() writes NO file: a .tex/.pdf reaches Paper/<id>/ only when compile runs, which is when the disk list would carry it',
        },
        missing: Array.isArray(rendered.missing) ? rendered.missing.slice() : [],
        // ★★★ RUN 252 (F72-7): on THIS face the two readings coincide (render writes archive rows and has no `produced`),
        // so `missing` keeps meaning "the rows this render was to name and did not", and the rows are ALSO printed under
        // the name that is unambiguous everywhere else. The sentence says which question each list answers.
        missingMeans: 'the artifact ROWS this render was to NAME and did not (render writes md/tex/meta rows into the paper track; a pdf row only appears when `compile` runs, which is why `pdf` is usually here). The same rows travel as `archiveArtifacts` — and this list is NOT "the compile lacked something": render never compiles (RUN 252 / F72-7)',
        archiveArtifacts: archiveArtifactsReading(arts),
        // RUN 217 (run 54 / FEEDBACK53 1-4, MEASURED): renderOk said the .tex was built, and the PDF printed `n  1` where
        // the paper wrote `n >= 1` because the font has no such glyph and the receipt never mentioned it. The counts come
        // from the SAME pass that wrote the .tex (PaperTexBody), so they cannot disagree with it.
        math: rendered.math || null,
        // ★★ RUN 174 (run 19 FEEDBACK19 F2): say what the .tex pass does with formulas, so no reader has to infer it from a
        // PDF that typeset `Σ_{k=1}^{n}` as literal text. Paired `$…$` is inline math (kept verbatim); everything else is
        // text-escaped, which is why a bare `^` in prose reaches the page as `\textasciicircum{}` on purpose.
        mathTypeset: { enabled: true, syntax: 'paired $…$ spans', means: 'a span between two `$` is kept VERBATIM as inline math (so `$x^2$` reaches the page as a superscript); text outside such a pair is escaped (`^` becomes \\textasciicircum{}, `_` becomes \\_) — write a formula between `$` and it will be typeset, write it bare and it will be text on purpose' },
        // ★★ RUN 174 (run 19 FEEDBACK19 F1): the renderer's own verdict rides on the receipt. A draft render does not
        // refuse (a paper being written must stay renderable) — it SAYS it did not judge, and names what `final` would.
        qualityGate: rendered.qualityGate || null,
        complete: arts ? arts.complete === true : false,
        // ★★★ RUN 258 (TB-2638 / P45): `complete` here is the SAME value as `renderOk` by construction (the kit returns
        // ok = artifacts.complete), so the sentence says which question both answer instead of leaving two names for
        // one fact to be read as two successes.
        completeMeans: 'same value as `renderOk` on this door BY CONSTRUCTION: both answer the archive ROW question (the kit returns ok = artifacts.complete). `complete:false` with `ok:true` is the normal reading of "rendered, but the row set is not finished yet"',
        unfinished: arts && Array.isArray(arts.missing) ? arts.missing.slice() : [],
        present: arts && arts.present ? Object.assign({}, arts.present) : null,
        pdf: rendered.pdf ? { ok: rendered.pdf.ok === true, code: rendered.pdf.code || null,
          needsKernel: rendered.pdf.needsKernel || null, message: rendered.pdf.message || null } : null }
    }
    case 'compile': {
      // ★★ RUN 155 (audit of c5d356b9, problem 2): this door used to THROW on failure while `final` returned
      // a body, and the two shapes differed even when both answered - the doc's "they share one structure" was false on
      // both halves. The door answers with the shared `projectPdfBlock` shape on success AND failure, so a caller diffs
      // fields instead of catching exceptions, and a failing compile is a receipt the operator can act on.
      let compiled = null
      try {
        compiled = await paper.compilePdf({ target })
      } catch (e) {
        // ★★ RUN 157 (audit26 item 8): the catch is scoped to THE COMPILE FAILURE, not to every error this door can
        // raise. Turning a compile failure into a receipt is right; turning "no such paper" (requireState) and "this
        // assembly has no LaTeX face" (CODES.EXECUTOR) into `ok:true` is not - those are named refusals the caller must
        // see, and RUN 155's unconditional catch silently reclassified them as success.
        // ★★★ RUN 258 (TB-2638 / P44): the engine question is an ENVIRONMENT fact, and the 47-pair corpus measured the
        // refusal as readable but not actionable for a seat that had just been told "compile the paper" — its hint named
        // the mechanism (the host spawn seam) but no call the seat COULD make. The refusal stays a refusal (RUN 157
        // forbids turning it into a receipt); its hint gains the three reachable reads, APPENDED after the kit sentence
        // so the mechanism explanation still comes first.
        if (e && String(e.code || '') === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING') {
          const e2 = refuse(String(e.code), String(e.message || ''),
            String(e.hint || '') + ' REACHABLE INSTEAD: 不用重试 compile —— ① 先 vibe_v5_paper { action: "status", target } 读 toolchainAbsent/pdfEnvironmentMissing（这是环境事实，不是参数错误）；② vibe_vmu_env { action: "probe", need: "' + ENGINE_NEED + '" } 探本机有没有引擎（探测失败是正常结果，框架不会替你安装）；本框架的文档引擎 need 只有注册表里这些真值：' + ENGINE_NEEDS.join(' / ') + '（换一种引擎就换这个词；注册表外的字符串会被判 VMU_ENV_UNKNOWN_NEED）；③ 没有引擎时 final 仍可收口，pdf 会记在 final 的 missing 里，先交能交的部分')
          e2.faceCode = e && e.faceCode
          throw e2
        }
        if (!e || String(e.code || '') !== 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED') throw e
        // ★ RUN 155: `message` is NON-ENUMERABLE on an Error, so `{ ok: false, ...(e || {}) }` silently dropped it and
        // the receipt answered with an empty message - the very "a receipt that cannot be acted on" this round removes.
        // The projection is fed the named fields EXPLICITLY, and it keeps its own `missing: ['pdf']`.
        // ★★★ RUN 256 (TB-2624 item 1): this refusal is where the engine question is actually ASKED, so it carries the
        // same four top-level environment keys as `final`/`status` — byte-equal readings inside one session.
        return { ok: true, tool, action, target,
          // ★★★ TB-2777 D-7: the engine question is answered by EVIDENCE — a compile that threw because the DOCUMENT failed
          // still reached an engine (`argv`/`triedEngines`/`engine` are on the error). Feeding the reading only {ok:false,
          // code, faceCode} made "asked but nothing measured" look like an ABSENT toolchain (ran-absent + null + []).
          ...environmentReadingsAt(kernel, { pdf: { ok: false, produced: false, code: (e && e.code) || null, faceCode: (e && e.faceCode) || null,
            engine: (e && e.engine) || null, engineSource: (e && e.engineSource) || null,
            argv: (e && e.argv) || null, triedEngines: (e && e.triedEngines) || null } }),
          compiled: projectPdfBlock({
          ok: false,
          code: (e && e.code) || null,
          message: (e && e.message) || null,
          hint: (e && e.hint) || null,
          faceCode: (e && e.faceCode) || null,
          target,
          argv: e && e.argv,
          outDir: e && e.outDir,
          sourceName: e && e.sourceName,
          stderrTail: e && e.stderrTail,
          stdoutTail: e && e.stdoutTail,
          tailSource: e && e.tailSource,
          // ★★ RUN 158 (N5): the explicit projection must forward the two new facts that live on the thrown error,
          // otherwise the blanket "one structure, both doors" claim is again false for exactly the fields just added.
          tailsIdentical: e && e.tailsIdentical === true,
          signal: e && e.signal,
          triedEngines: e && e.triedEngines,
        }, target) }
      }
      // RUN 217: the repair counts reach this door through the ONE projection above (they ride on `compiled.math`),
      // so `compile` and `final` keep the same key set on success and on failure.
      // ★★★ RUN 256 (TB-2624 item 1): same four top-level environment keys, read by the same producer.
      return { ok: true, tool, action, target,
        ...environmentReadingsAt(kernel, { pdf: compiled }),
        compiled: projectPdfBlock(compiled, target),
        // ★★★ TB-2768: the glyph verdict at the TOP level of this receipt too (never only nested in `compiled`).
        ...glyphLossOf(compiled),
        stderrFindings: glyphFindingsOf(compiled) }
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

/**
 * ★★★ RUN 255 / TB-2613: the ownership evidence of a CARD row that indexes a md file of its own. Cards usually have no
 * file (the body is the holder), and then this returns null — the honest absence, not an empty object. When the body
 * carries `- mdPath：`, the writer comes from the body header and the bytes/sha256 are read from the disk JUST NOW.
 */
function cardMdOwnerOf(records, body) {
  const header = (key) => {
    const re = new RegExp('^-\\s*' + key + '[：:]\\s*(.*)$', 'm')
    const m = re.exec(String(body === undefined || body === null ? '' : body))
    return m === null ? '' : String(m[1]).trim()
  }
  const mdPath = header('mdPath')
  if (mdPath === '') return null
  const writtenBy = header('mdWrittenBy')
  const inTurn = header('mdWroteInOwnTurn')
  return mdOwnerOf({ records, mdPath, writtenBy: writtenBy === '' ? null : writtenBy, wroteInOwnTurn: inTurn === '' ? null : inTurn === 'true' })
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
    // ★★★ RUN 252 (F72-8, MEASURED on the 72nd real-machine run): the READ face is where a reader asks "may I still
    // change this card?". It used to answer only the card fields, so the gate could be obtained ONLY as the read-back of
    // a settlement — and the settlements that produce `read-back-default-draft` are refused before they reach it. The
    // gate and its note are therefore answered HERE, by the same `proofGateOfStoredCard` the settlement read-back uses.
    const storedProofState = text(fields.proofState)
    // ★★★ RUN 2699 (F75-04): the read face now MEASURES the stored pointer once and feeds that reading to the ONE gate, so
    // this face and the write receipt cannot answer the same row differently; `unknown` here means "not checked" only.
    const storedGate = proofGateOfStoredCard(fields, { reading: proofRefReadingOf(kernel, fields.proofRef), source: 'stored-row-read' })
    const cardOwner = cardMdOwnerOf(records, body)
    const next = Object.assign({}, row, {
      // ★★★ RUN 252 (F72-2): the stored row's proof line, NAMED, with the sentence that says what `null` means — a
      // reader no longer has to know that "no line" and "draft" are the same fact.
      proofState: storedProofState,
      proofStateMeans: storedProofState === null
        ? 'the card body states NO `proof_state` line, so the card is a DRAFT (the default): `null` is the honest reading of "nothing was declared", and `proofGate.reason:"read-back-default-draft"` is the machine-readable form of it'
        : 'the card body states `proof_state:"' + storedProofState + '"` — this is the author\'s declared line, READ BACK; declaring a state is not the same as the institute verifying the proof',
      // ★★★ RUN 254 (F-73-01): the EFFECTIVE state, from the same fold, so "is this card a draft" has a literal answer on
      // the READ face too — `proofState` stays the declared value (null when the body states nothing).
      proofStateFolded: storedGate.folded,
      foldedMeans: storedProofState === null
        ? 'the EFFECTIVE state is "' + storedGate.folded + '" — folded from a card body that states NO `proof_state`, i.e. the DEFAULT "draft". This is NOT a declared value: `proofState` is null because nothing was declared (RUN 254 / F-73-01)'
        : 'the EFFECTIVE state is "' + storedGate.folded + '", folded from the `proof_state` the card body declares; folding only normalises case/whitespace when a state was declared, so here `proofState` and `proofStateFolded` agree',
      proofGate: storedGate,
      // ★★★ RUN 2699 (F75-04): the pointer-state word on the READ face comes from the same measurement + judge as the
      // write receipt. `proofRefStateChecked:false` means NOT CHECKED (never "checked and failed" — that is `missing`).
      proofRefState: storedGate.proofRefState,
      proofRefStateChecked: storedGate.proofRefStateChecked,
      proofRefStateMeans: storedGate.proofRefStateMeans,
      proofRefStateSource: storedGate.proofRefStateSource,
      lockNote: proofLockNoteOf({ gate: storedGate, declaredState: storedProofState }),
      cardFields: {
        p: parsed && parsed.card ? parsed.card.p : null,
        statement: text(fields.statement), value: text(fields.value), motive: text(fields.motive),
        proofRef: text(fields.proofRef), proofState: text(fields.proofState),
      },
      cardFieldsMeans: "`cardFields` are the fields of the card BODY, parsed by the one authority the debate/verified gates use (verified.js#parseCardBody). `card.body` stays the author's text — these are the same facts as program values, not a second declaration. `cardFields.p === null` with `cardUnjudgeable` set means the body could not be judged; it does NOT mean p is zero.",
      // ★★★ RUN 255 / TB-2613: WHO owns this card md, with bytes and sha256 read from the disk right now. A card that
      // names no md path carries `mdOwner:null` — the honest absence, never an object that invents a writer.
      mdOwner: cardOwner,
      mdOwnerMeans: cardOwner === null
        ? 'this card names no md file of its own (the body is the holder), so there is no md ownership to report: null, not an empty object'
        : 'mdOwner is the ownership EVIDENCE of the md file this card names: writtenBy comes from the row header (member-file | kernel-materialized | fs-untracked), bytes/sha256 were read from the disk by this read, and atSource says whether the row provenance or only the disk decided it (RUN 255 / TB-2613)',
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
    description: 'Append to YOUR research log. ★ Pass `member:"<your id>"` — without it the author of the row is UNKNOWN (`by:null`, `bySource:"unknown"`) and the status board cannot tell whose log it is. track picks the TRACK in the LEDGER (vmu.records), NOT a Progress/ file: progress (default) / routes / obstacles / rejected / state; the Files under Members/<you>/Progress/<track>.md are written by the reply `record` field — use rejected for disproved routes and obstacles for blockers, so negative knowledge is archived in its own track. '
      + '★ The STATE panel (track:"state") has FOUR REQUIRED contents — progress (当前进度), obstacles (遇到的障碍), next (下一步计划), help (需要的帮助) — passed flat or nested under `state`; a panel missing one is refused by name with the missing keys in `missing`, and `content` is free text on top, never a substitute.',
    parameters: { content: { type: 'string' }, track: { type: 'string' }, title: { type: 'string' }, member: { type: 'string' },
      progress: { type: 'string' }, obstacles: { type: 'string' }, next: { type: 'string' }, help: { type: 'string' }, state: { type: 'object' } },
    handler: toolRecordProgress,
  },
  {
    name: 'vibe_v5_record_proposition',
    description: 'Record a proposition/lemma card in your library. REQUIRES statement, value, motive and p (your probability that it is true); the card is settled when p is 1 or 0. ★ p=1 IS A CONCLUSION, NOT A PREFERENCE: writing 1 is refused BY NAME unless the write carries one of the three conclusions the rule accepts — a promoted verified row on THIS card, a unanimous debate ruling (`debate_ruling:{mode:"unanimous", value:1, subject:"<this card id>", ballotId}`), or a passed Lean run PLUS the conformance ruling (`lean_job` + `lean_conformance:"conform"`). ★ WHAT THAT THIRD ROUTE ACTUALLY REQUIRES: the kernel must be able to read that Lean job as PASSED; the working path in this institute is the chair calling `vibe_v5_fidelity_conclude { card, fidelity:"conform", lean_job, member }`, which writes p=1 through this same gate and promotes the verified row itself. Estimating in (0,1) is always allowed. ★ LITERATURE (B2): `literature_ref:"<author, source, theorem/page>"` with `p:1` is the fourth evidence form; then `vibe_v5_verified_promote{card, warrant_kind:"literature", literature_ref:"<the same citation>"}` makes the citation the verified row warrant. An empty citation is not a citation. ★ PROOF REGISTRATION (B6): `proof_ref` (where the proof/refutation lives) + `proof_state:"complete"|"draft"` is a SELF-REPORT, not a verification; `proof_state:"complete"` IS ADMITTED ONLY WITH EVIDENCE: either `proof_ref` (pointing at the finished proof/refutation this card declares) or a `lean_job` pointing at a settled PASSED run (`lean_conformance` alone is a CLAIM, not evidence) — otherwise refused by name (VMU_INVALID_ARGUMENT) and nothing is written. ★ ONCE A CARD IS COMPLETE IT IS LOCKED: a later write to the SAME card id is refused (VMU_STATE) — correct it under a NEW card id. ★ THE ONE SANCTIONED EDIT ON A LOCKED CARD IS A RULING SETTLEMENT: a write carrying `debate_ruling:{value:0|1, …}` with `p` set to that same value is admitted (rule L53), because the lock protects the PROOF CONTENT while a ruling settles the PROBABILITY — exactly what `vibe_v5_verdict_final` prints in its `correction.call`. Neither `proof_ref` nor Lean evidence ⇒ state is recorded as draft. ★ 进度 IS A CARD FIELD: `progress` is kept as its own labelled line and echoed with `progressMeans`. p must be a NUMBER IN [0,1]: out of range is refused by name. ★ 代记（REGISTRAR DUTY）：正式记录本由**所办**登记——代成员登记时传 `member:"<该成员id>"`，它才是卡的作者（owner），**必须是该成员而不是你自己**。',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true, description: 'value is stored as the card body\'s TEXT line (`- value：…`) — a number you pass is written as its decimal text and read back as a STRING (`cardFields.value`); it is NOT a numeric field and it is NOT the probability (that is `p`). The ruling receipt prints a fully numeric value as a bare number and a non-numeric one as a quoted JSON string, which is a PRINTING difference, not a storage one' }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, literature_ref: { type: 'string' }, progress: { type: 'string' }, track: { type: 'string' }, payload: { type: 'object' }, debate_ruling: { type: 'object' }, member: { type: 'string' }, bodyMode: { type: 'string', description: 'the body write mode on an UPDATE of an existing row: \"replace\" (default) swaps the body, \"merge\" lets the lines this write names win while every other line survives; an unknown word is refused by name' }, confirmDestructive: { type: 'boolean', description: 'only set true when DELETING a settlement-bearing line really is the intent (the kernel refuses such a delete by name otherwise: VMU_RECORD_DESTRUCTIVE_WRITE)' } },
    handler: gatedCardHandler('vibe_v5_record_proposition'),
  },
  {
    name: 'vibe_v5_record_method',
    description: 'Record a theory/method/tool card in your library. REQUIRES content, value, motive and p. ★ p must be in [0,1] (an out-of-range p is refused by name and the card is NOT written). ★ 进度 (PROGRESS) IS A CARD FIELD: an optional `progress` is kept as its own labelled line `- 进度：…` inside the card body and echoed in the receipt with `progressMeans`. ★ `proof_state:"complete"` needs evidence (`proof_ref` on a finished proof, or a `lean_job` of a settled PASSED run; `lean_conformance` alone is a claim, not evidence) and LOCKS the card id afterwards.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, content: { type: 'string', required: true }, notation: { type: 'string' }, value: { type: 'number', required: true, description: 'value is stored as the card body\'s TEXT line (`- value：…`) — a number you pass is written as its decimal text and read back as a STRING (`cardFields.value`); it is NOT a numeric field and it is NOT the probability (that is `p`). The ruling receipt prints a fully numeric value as a bare number and a non-numeric one as a quoted JSON string, which is a PRINTING difference, not a storage one' }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, track: { type: 'string' }, payload: { type: 'object' }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, progress: { type: 'string' }, member: { type: 'string' } },
    handler: gatedCardHandler('vibe_v5_record_method'),
  },
  {
    name: 'vibe_v5_record_subproblem',
    description: 'Record a sub-problem card in your library. REQUIRES statement, value, motive and p. ★ p must be in [0,1] (an out-of-range p is refused by name and the card is NOT written). ★ 进度 (PROGRESS) IS A CARD FIELD: an optional `progress` is kept as its own labelled line `- 进度：…` inside the card body and echoed in the receipt with `progressMeans`. ★ `proof_state:"complete"` needs evidence (`proof_ref` on a finished proof, or a `lean_job` of a settled PASSED run; `lean_conformance` alone is a claim, not evidence) and LOCKS the card id afterwards.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true, description: 'value is stored as the card body\'s TEXT line (`- value：…`) — a number you pass is written as its decimal text and read back as a STRING (`cardFields.value`); it is NOT a numeric field and it is NOT the probability (that is `p`). The ruling receipt prints a fully numeric value as a bare number and a non-numeric one as a quoted JSON string, which is a PRINTING difference, not a storage one' }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, track: { type: 'string' }, payload: { type: 'object' }, proof_ref: { type: 'string' }, proof_state: { type: 'string' }, lean_job: { type: 'string' }, lean_conformance: { type: 'string' }, progress: { type: 'string' }, member: { type: 'string' } },
    handler: gatedCardHandler('vibe_v5_record_subproblem'),
  },
  {
    name: 'vibe_v5_say',
    description: 'Speak in the group chat (omit `to` and `meeting`), send a private message (`to`: a member id / "all" / "voters"), or record a meeting speech (`meeting`: the open meeting id). The speaker must be a REAL roster id: this tool never invents one. ★ SINGLE-SPEECH ROUND (`round`): name the round and each member may speak ONCE on it — a second speech in the SAME round is refused by name (`VMU_CHAT_ALREADY_SPOKE`, nothing recorded), while a NEW round id allows speaking again. With `round` and NO `text` the call is a READ: it opens no page and answers `spokenBy` (who has already spoken) and `remaining` (who is still owed a turn; `null` when no participant list is known); `members` declares the round\'s participants. ★ WHAT THIS IS: bookkeeping + a named refusal — it is NOT isolation: messages are not queued or ordered against each other, so 「不打断」 is the room convention this book enforces after the fact. ★ A `round` here is a CHAT round book, and every receipt and page says so: `roundSurface:"chat"` plus `roundSurfaceMeans` telling you that a MEETING round is opened and advanced through the meeting face instead. ★ `round` cannot be combined with `to` or `meeting` — that combination is refused by name. ★ `urgent:true` is available ONLY on the private-message form (the sender\'s explicit intent); the group-chat and meeting forms are refused by name when `urgent` is set.',
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
    parameters: { task_id: { type: 'string', required: true }, expected_revision: { type: 'integer', required: true }, action: { type: 'string', required: true }, member: { type: 'string' }, owner: { type: 'string' }, blocked_by: { type: 'array' }, to: { type: 'string' }, why: { type: 'string' }, reason: { type: 'string', description: 'alias for why — either word is accepted; why wins when both are passed' }, by: { type: 'string', description: 'WHO acted (the chair assigning on someone\'s behalf). The face already reads it (kit/extras.js task_update assign/claim) — without a declaration a caller could not attribute an assignment through the taught tool.' },},
    handler: (args, ctx) => toolTaskUpdate(has(args.reason) && !has(args.why) ? Object.assign({}, args, { why: args.reason }) : args, ctx),
  },
  {
    name: 'vibe_v5_hire',
    description: 'Hire one temp worker into the temp seat and open their initial task. Requires purpose, initial_task and to (the new member id — this pack never invents an id). The SLOT is explicit (default "temp"); any other slot is refused by name and points at the founding face. ★ `institution` is NEVER written on this face: a hire goes INTO the institute that already exists, and founding one is the control face — the only call that reads `institution`. If the caller SENDS `institution` here it is accepted and ignored, and the receipt answers `institutionIgnored:true` with `institutionMeans`; a caller that sends nothing gets `institutionIgnored:false` and `institution:null` (nothing was ignored because nothing was sent). A second hire of an occupied seat is refused by name, not silently re-slotted (RUN 211 / FEEDBACK47 2.3, corrected in RUN 212 / FEEDBACK48 2.1).'
    , parameters: { purpose: { type: 'string', required: true }, initial_task: { type: 'string', required: true }, to: { type: 'string', required: true }, slot: { type: 'string' }, direction: { type: 'string' }, term: { type: 'string' }, institution: { type: 'string' } },
    handler: toolHire,
  },
  {
    name: 'vibe_v5_script',
    description: 'THE SCRIPT ARCHIVE (归档/复算): op=archive stores a script\'s WHOLE text as a `scripts`-track card with the kernel\'s own fingerprint (provenance in title/tags, body byte-identical); the text comes from EITHER name+text, OR id:"rec-<n>" (an existing library record whose body IS the script: name then defaults to that record title and the receipt answers fromRecord + archived.source); op=read returns the archived text verbatim by id or name (latest edition); op=list shows the archived scripts. '
      + '★ CHAIR-ONLY (rule C14: a study script must be archived — the archive is the academician\'s institutional act). member/temp are refused by name and told the path: hand the script to the chair and say what it should be archived AS. ★ A script is a 所级产物, so it is archived and reviewable — but a TEMPORARY script still cannot be run ad hoc: the pack\'s no-adhoc-scripts rule refuses that by name. Recompute by running the archived text again and comparing the fingerprint, never by trusting a note about it.',
    parameters: { op: { type: 'string', enum: ['archive', 'read', 'list'] }, name: { type: 'string' }, text: { type: 'string' }, purpose: { type: 'string' }, parent: { type: 'string' }, edition: { type: 'string' }, id: { type: 'string' }, limit: { type: 'integer' }, member: { type: 'string' } },
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
    description: 'What can I call? TWO readings: `declarationSet` (STATIC, no session needed: declaredCount/allowCount/denyCount/seatFilter from the seat-face table) and `measuredSet` (the live visible set; count:null + a named `refusal` when no session: `VMU_MEMBER_SESSION_NEVER_OPENED` or `VMU_MEMBER_SESSION_NOT_LIVE`). Never an empty list.',
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
    description: 'Supervise: wake one member with a stated reason and a concrete suggested next step (prefer a specific step over a bare "hurry up"). Delivered by mail; whether the row is URGENT is declared by the deployment (`vmu.mailbox.urgentKinds`, empty by default) and the receipt reads `sent.urgent` back — a nudge is not urgent by name alone.',
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
    description: 'Work-experience / process feedback library (not research conclusions). op=add needs category/route/phenomenon/impact plus the recommendation (`recommendation`; the legacy body key `action` counts unless it is an op word) and an assessment on the interpersonal route; op=update closes with status/outcome/note; op=list lists open items. ★ EVERY write needs an AUTHOR: pass `member`; a write that names nobody is REFUSED `VMU_INVALID_ARGUMENT` (RUN 249 / F-04). ★ `op` is the OPERATION; the recommendation is the FIFTH BODY FIELD, stored on the card as `recommendation：` (the legacy INPUT key `action` still works — it is only refused when its value is just an op word). Passing action:"add" is refused by name `VMU_FEEDBACK_ACTION_IS_THE_OPERATION`, because that stores the operation verb as the recommendation.',
    parameters: { op: { type: 'string', required: true }, id: { type: 'string' }, member: { type: 'string', description: 'WHO files this feedback (your member id). REQUIRED for op=add/update in practice: a member turn\'s call context supplies it, and a write that names nobody is refused by name (RUN 249 / F-04) — never silently filed with a null author.' }, category: { type: 'string' }, route: { type: 'string' }, context: { type: 'string' }, phenomenon: { type: 'string' }, impact: { type: 'string' }, action: { type: 'string' }, recommendation: { type: 'string' }, assessment: { type: 'string' }, outcome: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, all: { type: 'boolean' }, limit: { type: 'integer' } },
    handler: toolFeedback,
  },
  {
    name: 'vibe_v5_read_library',
    description: 'Read anyone\'s library (read-only): id reads one card; the list form reads EVERY declared track (vmu.records.tracks — so a member\'s state panel, obstacles, rejected routes and feedback are all readable) and filters by kind, by the card\'s author, and by `track`/`tracks`. '
      + '★ An undeclared track name is refused by name with the declared set in `declared`; a declared track the records face itself refuses is reported in `skippedTracks`, never silently dropped. '
      + '★ TWO NOUNS, TWO SHAPES (round 42): a RECORD id is minted as `rec-<n>` and a MEMBER id as `r-<n>` — `id` reads a RECORD, `member` reads a PERSON’s library. Passing a member id as `id` is refused by name and the hint tells you to pass `member:"<id>"`; legacy `r-<n>` records still read (ids are names, nothing was migrated).',
    parameters: { member: { type: 'string' }, kind: { type: 'string' }, id: { type: 'string' }, list: { type: 'boolean' }, limit: { type: 'integer' }, track: { type: 'string' }, tracks: { type: 'array' }, withWriter: { type: 'boolean' } },
    handler: toolReadLibraryWithCardFields,
  },
  {
    name: 'vibe_v5_meeting',
    description: 'Convene a meeting. agenda REQUIRED (or its kernel-side alias `materials`: ONE stored line — pass exactly one, never both (`VMU_MEETING_AGENDA_CONFLICT`); there is no separate material slot; a materials-only convene reads back `agendaSource:"materials"`); a STRING agenda splits on `;`/`；`/newline only (a comma is punctuation); type is one of ordinary/academic/debate/closure/paper/planning (default ordinary); a debate REQUIRES subject — a card id whose written proof is finished (proofRef + proofState:"complete", or a verified row / passed Lean run) or a file reference (`subject_evidence.file` with readable/bytes/name), because a one-line proposition has no addressable proof carrier: `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`. ★ `title`/`id` optional (omit both ⇒ an id is minted; an id held by another registry is refused by name). ★ `at` schedules it (epoch ms or ISO-8601): a future time ⇒ `scheduled` — reads work at once, every action before the start is refused, a latecomer attending starts it; receipt reads `state`/`scheduledFor`. ★ `procedure` is a RECOMMENDATION, never a gate; unimplemented steps are in `pendingSteps`. ★ THIS FACE ONLY CONVENES + TWO reads: `action:"rulings"` (filed ruling cards: id + proposition_id) and `action:"receiptsView"` READS the kernel receipts; `limit` 1..200 default 50, out-of-range refused; rows carry `typeInput`/`typeMatchedBy`, old rows null + means). status/summary/close/flow are on vibe_vmu_meeting { action, id }. ★ `target` is an ALIAS of `subject` on THIS face; on vibe_vmu_meeting it is a VOTE object — do not carry the habit between faces. ★ `sequence` convenes the FOLLOWING meetings (descriptors validated/refused by name; omit `at` ⇒ now). ★ `durationMs` is this meeting own upper bound (integer ms, 30min..2h; out-of-range refused); default `vmu.meetings.hardLimitMs`; receipt reads `wallLimitMs`/`wallLimitMsSource`. ★ `lateAdmission` (open|chair|refuse, default chair) decides LATE arrivals (late = vmu.meetings.lateAfterMs vs openedAt; 0 = nobody late): open seats it (`late:true`); chair holds it (`pendingLate:true`, released by the chair via vibe_vmu_meeting { action:"admit", id, member, actor }); refuse ⇒ `VMU_LATE_ADMISSION_REFUSED`. ★ `op` aliases `action` (both with different words ⇒ refused by name); the appointment notice teaches `{op:"appoint"}`, `{op:"schedule", scheduledFor:"<ISO-8601>"}` (start required; alias `at`), `{op:"attend", id, member}`. The receipt echoes the kernel `notified`/`notifyRows`/`notifyFailed` (one durable row per invited member; this face sends no invitation of its own).',
    parameters: { agenda: { type: ['string', 'array'], items: { type: 'string' }, description: 'the meeting purpose as ONE line, or an ORDERED list of non-empty lines (string | string[]): array items are joined in order with "; " into the materials the kernel stores' }, id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, subject: { type: 'string' }, kind: { type: 'string' }, target: { type: 'string' }, formal_agenda: { type: ['boolean', 'array'], items: { type: ['string', 'object'] }, description: 'true = declare that this meeting has a formal agenda; an ARRAY = the agenda items themselves (each a non-empty line, or {title|text, kind, id}); the kernel stores either and the read faces return `formalAgendaItems` rows with `formalAgendaItemsWhy` naming why they are empty' }, secretary: { type: 'string' }, member: { type: 'string' }, at: { type: 'string' }, durationMs: { type: 'integer' }, subject_evidence: { type: 'object' }, lean_job: { type: 'string' }, sequence: { type: 'array' }, members: { type: 'array' }, action: { type: 'string' }, proposition_id: { type: 'string' }, op: { type: 'string' }, scheduledFor: { type: 'string' }, materials: { type: 'string', description: 'the KERNEL-side name for the SAME one stored agenda line (legacy alias of `agenda`): accepted ALONE when no agenda is passed; never alongside agenda (VMU_MEETING_AGENDA_CONFLICT). It is not a second "materials" slot — put material content inside the agenda text' }, wallLimitMs: { type: 'integer' }, limit: { type: 'integer' },
    // ★ RUN 225-B / RUN 255 rev3: lateAdmission is THIS meeting policy for a LATE arrival; the default (chair — a
    //   late arrival is held at the door until the chair admits it) lives in the kernel, not here. Undeclared keys are
    //   refused generically by the host funnel BEFORE the handler runs, so being able to say it at all has to be a
    //   declaration.
    lateAdmission: { type: 'string', enum: ['open', 'chair', 'refuse'] } },
    handler: toolMeeting,
    // ★ LIVE RUN 29: the funnel refuses undeclared keys generically; this face can say WHY it is the wrong face.
    validate: validateMeetingArgs,
  },
  {
    name: 'vibe_v5_meeting_round',
    description: 'Advance ONE member turn of an open meeting with the meeting-type tool face enforced (D7: 成员可用的命令按会议类型不同). It resolves the meeting\'s `type`, then narrows each participating member\'s tool face to 「identity visible set ∩ the pack-declared allow list for that type」 — it can only get SMALLER (a widening is impossible: an unreadable identity face is refused by name instead of guessed). During a DEBATE, recording tools such as vibe_v5_paper / lean / hiring / settings are NOT callable by members (they are another meeting\'s business); in a type that declares no narrowing (ordinary/academic/closure/paper/planning) the member keeps the identity face and the receipt says so by name. The CHAIR is never narrowed. The override lives for exactly this one round and is cleared in a finally. A type with no declared narrowing is a NAMED decision, never a silent empty set; when the intersection is EMPTY the narrowing is SKIPPED (nothing is widened) and the receipt carries `narrowing:{applied:false, reason:"empty-intersect", …}` — a broken configuration must not kill the meeting. Defaults: members = every live member except the chair; phase = "meeting". ★ phase must be one the turn engine knows: founding / normal / checkpoint / verify / verify-debate / meeting / resume / heartbeat / paper-write / paper-review / paper-final — plus the ALIAS "debate" (the receipt then says `phaseAliased:{given:"debate", used:"verify-debate"}`, so the alias is disclosed, not silent). Any other word is refused by name.',
    parameters: { meeting: { type: 'string', required: true }, members: { type: 'array' }, phase: { type: 'string', enum: ['founding', 'normal', 'checkpoint', 'verify', 'verify-debate', 'debate', 'meeting', 'resume', 'heartbeat', 'paper-write', 'paper-review', 'paper-final'] }, why: { type: 'string' } },
    handler: toolMeetingRound,
  },
  {
    name: 'vibe_v5_motion',
    description: 'Raise a motion inside an ongoing meeting (kind: topic/procedural/resolution; text required), or WITHDRAW your own with op:"withdraw" + motion_id. A new motion starts proposed and needs a second. WHO MAY RAISE: a topic or procedural motion may be raised by any VOTING seat; a resolution is a RECORD write that only the chair or the declared secretary may raise (any other seat is refused VMU_NOT_PERMITTED by name).',
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
    description: '★ TWO FACES, picked by what you pass (the caller\'s context decides — neither is a default). ① BALLOT VERDICT: pass target = the id of the LIVE ballot + verdict in [0,1] (1 = true, 0 = false, in between = an UNCERTAIN probability) to cast your vote on the object under verification; a target that is not a live ballot is refused by name. ② YOUR FINAL DEBATE RULING: pass meeting + proposition_id (and NO target) + verdict + reason to FILE YOUR OWN ruling on that debate\'s proposition — this is the member half of 「请各个辩论的各个成员给出最终裁决」. A filed ruling is a card of your own on disk, survives your session, and the chair ADOPTS it with vibe_v5_verdict_final { meeting, proposition_id } — re-filing the same ruling is idempotent, filing a DIFFERENT one after it is refused by name (a filed ruling is your act, not a draft). A member who did not debate is refused by name; when the debate cannot be read from inside your session the receipt says `rosterChecked:false` and the chair checks it at collection.',
    parameters: {
      target: { type: 'string' }, verdict: { type: 'number', required: true }, reason: { type: 'string' },
      meeting: { type: 'string' }, proposition_id: { type: 'string' }, member: { type: 'string', required: true },
    },
    handler: toolVerdict,
  },
  {
    name: 'vibe_v5_verdict_final',
    description: '★ TALLY THE DEBATE\'S FINAL RULING (the CHAIR signs it): collect the members\' boolean verdicts on ONE proposition, aggregate them (all agree ⇒ that value, otherwise the arithmetic mean) and tell the card\'s owner to correct its probability. meeting + proposition_id REQUIRED. ★ THE MEMBERS\' OWN RULINGS ARE COLLECTED FOR YOU: omit `verdicts` and this face adopts every ruling the debating members filed with vibe_v5_verdict { meeting, proposition_id, verdict, reason } — each row of `attribution` says whose number came from a filed submission (with the card id/path) and whose was TYPED by the chair, and `coverage` separates debated / submitted / typed / missing. A typed number that CONTRADICTS that member\'s filed ruling is refused by name, not silently preferred. member is who signs (default: the meeting chair; anyone else is refused by name); owner defaults to the card\'s author and must be resolvable. ★ If a Lean run passed and the card\'s p is still not 1, ANSWER THE FIDELITY QUESTION first (fidelity:"conform" or "defect", with lean_job naming the run). Delivery is reported honestly: `delivery` + `notified` + `notification.state` ("delivered" = pushed into a live turn, "queued" = waiting in the inbox and NOT read) — do not read an empty `notified` as a failure nor a queued one as "the owner has seen it". ★★ THE VOTE FLOOR GATES THE RULING (rule L47, 「辩论、结题的表决人数至少 min(用户设置数, 院士+常驻研究员)」): signed = the members whose number is in this tally PLUS the chair who signs; below the floor kernel.meetings.quorum() reads, the call is REFUSED by name (`VMU_MEETING_QUORUM_LOST`, with the setting keys and who is missing) and the hint names vibe_v5_verdict_ask. Pass partial:true with why ONLY when the chair deliberately rules on fewer seats than the floor: the receipt then records `floor.gate.escapedBy:"partial"` beside `satisfiedBy:false`.',
    parameters: { meeting: { type: 'string', required: true }, proposition_id: { type: 'string', required: true }, verdicts: { type: 'array', items: { type: 'object', required: ['member', 'p'], properties: { member: { type: 'string' }, p: { type: 'number' }, reason: { type: 'string' } } }, description: 'one element per member: { member:"r-1", p:1, reason:"…" } — `member` and `p` are REQUIRED fields of each element (RUN 252 / F72-10). Omit the whole array to adopt the filed rulings' }, member: { type: 'string' }, owner: { type: 'string' }, lean_job: { type: 'string' }, lean_passed: { type: 'boolean' }, fidelity: { type: 'string' }, template: { type: 'string' }, partial: { type: 'boolean' }, why: { type: 'string' } },
    handler: toolVerdictFinal,
  },
  {
    name: 'vibe_v5_verdict_ask',
    description: '★ ASK THE DEBATING MEMBERS FOR THEIR FINAL RULING (the CHAIR asks; this is the FIRST half of the rule: 「待辩论会议结束，v5r框架请各个辩论的各个成员给出最终裁决」). One mailbox message per DEBATING member asking for 「布尔概率（[0,1]）+ 理由」 on ONE proposition. meeting + proposition_id REQUIRED. ★ WHO COUNTS AS DEBATING IS THE MEETING\'S ROSTER PLUS ANYONE ON SPEECH RECORD — `askedSource` names which set was used ("roster+speech" | "roster" | "spokeBy" | "minutes" | "members") and `askedWhy` says why: a seated non-speaker still owes a ruling; a meeting with no roster still reaches those who spoke. `members` is an explicit OVERRIDE that REPLACES the population (`askedSource:"members"`), not a widening. ★ THE SEAT COUNT RECONCILES OR IT IS NOT A COUNT: `rosterCount` includes the chair seat, which is NOT in `asked`, so the receipt also carries `excluded:[{member, why}]`, `rosterCountMeans` and `accounting` — asked + excluded = the members the meeting named. ★ THE PROPOSITION IS CHECKED, NOT MERELY REQUIRED: `proposition_id` must be a card the library holds (`propositionKind:"card"`), a FILE REFERENCE (`propositionKind:"file-ref"` with `fileChecked:false`), or the object this meeting was convened to debate (`propositionKind:"meeting-subject"`); ANYTHING ELSE IS REFUSED by name `VMU_ASK_UNKNOWN_PROPOSITION` — free one-line strings included, and a meeting with no declared subject; the hint names three reachable repairs: record the card, pass the subject, or pass a file ref. ★ THE MAIL IS GENERATED FROM THE MEETING STATE: `meetingState`/`meetingStateMeans`/`closurePhase` carry what `meetingView` reports and the closure clause inside `mail.text` is derived from it; an unreadable state makes the mail say 状态不可读 instead of asserting a closure. Asking is not ruling: the ruling is vibe_v5_verdict_final. Refused by name: no chair to sign, a non-chair caller, no mailbox face, and a meeting with no roster AND no speech on record.',
    parameters: { meeting: { type: 'string', required: true }, proposition_id: { type: 'string', required: true }, members: { type: 'array' }, member: { type: 'string' }, why: { type: 'string' } },
    handler: toolVerdictAsk,
  },
  {
    name: 'vibe_v5_verified_promote',
    description: '★ PROMOTE A PROPOSITION CARD TO THE VERIFIED TRACK — the ONLY writer of that track, and the place where a settled p is carried together with its JUDGE. card REQUIRED (a proposition card whose p is exactly 1 — this track carries what is PROVEN TRUE; a p=0 refutation is refused by name and belongs to the rejected track); warrant_kind REQUIRED, and it must be the kind the EVIDENCE actually shows: "debate-unanimous" + `debate_ruling:{mode:"unanimous",value:1,subject:<card id>}` (+ `warrant:"<ruling id>"`), "lean-conformance" + `lean_job` + `lean_conformance:"conform"` (BOTH required together, and the job must report passed:true), or "literature" + `literature_ref:"<author, source, theorem/page>"` (the citation then becomes the row\'s warrant id). A warrant with NO evidence is refused by name by the SAME p=1 gate a card write uses (`VMU_PACK_V5R_P1_NEEDS_DEBATE`), and a kind that disagrees with the evidence is refused by name too. ★ ON THE lean-conformance ROUTE `warrant` IS REQUIRED TOO: `lean_job` + `lean_conformance:"conform"` name the measurement, and `warrant` names the JUDGE that turned it into a conclusion — pass the conformance ruling id. Other refusals: a card that is not a proposition card, a truncated card, a p in (0,1) ("a preference is not a conclusion"), a withdrawn proof. The card keeps its own p; the verified row records the warrant, so "why is this settled" is answerable instead of asserted.',
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
    description: '★ THE INSTITUTE\'S PUBLIC BLUEPRINT (公共蓝图) — the document named by vmu.turn.protocolPath, as a versioned records track. actions: "state" (default) reads which revision is IN FORCE, when it was adopted, whether it is OVERDUE (updatedAt/ageMs/stale — a hint, never a refusal) and which drafts are waiting; "propose" (ANY live member) files a draft revision — and a DRAFT OWNS ITS OWN md FILE: fs-first by DEFAULT: write Shared/Drafts/<stem>-r<N>.md with fs and pass `mdPath` (its bytes become the row prose; plain markdown accepted; a missing file is refused by name); omitting mdPath writes NOTHING — the receipt is draftMdMissing + nextActions naming the file (pass materialize:true only to ask the kernel to write it); `draft` OPTIONAL names which OPEN draft of this path the text continues — omit it and the open draft is continued, or a new revision is started when none is open; a draft is never in force, and `adopt` promotes the DRAFT FILE bytes to the canonical path after checking they are still the bytes the row indexed (a changed draft is refused by name; a canonical file already holding those bytes is verified, not rewritten); "adopt" (CHAIR seat ONLY) makes a named draft the revision in force and supersedes the previous one; "read" returns one revision by id. ★ COMMON DESIGN (共同设计): if your text carries a `## 共同设计补充｜<your id>` heading it MUST be the FIRST line — only a heading on the very first line is recognised and dropped. Do NOT paste the draft you are continuing back into your text: a leading copy of the draft THIS CALL CONTINUES is stripped (reported in bodyPrefixDropped), and `continuedBase.actual` names the row your text was joined to - null when the call started a new draft, and then nothing was compared. A draft is NOT private: every propose writes into the SAME shared revision row, so a proposal filed to test the face is visible to every member and becomes the base the next author continues. Every change is one record row, also readable via vibe_v5_read_library { track: "blueprint" }.',
    parameters: { action: { type: 'string' }, path: { type: 'string' }, member: { type: 'string' }, text: { type: 'string' }, draft: { type: 'string' }, id: { type: 'string' }, note: { type: 'string' },
      // ★★★ RUN 248-M2: a DRAFT revision owns a real md file (task-64). `mdPath` lets the MEMBER be its writer.
      mdPath: { type: 'string', description: 'OPTIONAL: the draft md YOU wrote with the fs tool, workspace relative (e.g. Members/<seat>/Drafts/<slug>-r<N>.md). The kernel reads it back, records its sha256 and WHO wrote it (mdOwner), and the row prose becomes the file text. OMIT it: fs-first returns draftMdMissing + nextActions naming the file and writes nothing. A path not on disk is refused by name (VMU_PACK_V5R_BLUEPRINT_MD_MISSING); an empty file too.' },
      materialize: { type: 'boolean', description: 'OPTIONAL (default false): true = the kernel writes the draft md for you (receipt writtenBy:"kernel-materialized"). The default never writes a file.' },
      refreshFingerprint: { type: 'boolean', description: 'OPTIONAL (adopt only): true = take the draft file CURRENT bytes when it changed after indexing (receipt mdDrift names both sha256s).' },
      outline: { type: 'array', description: 'OPTIONAL ordered outline of this revision: [{id,title,depth}] with depth 1 (粗) or 2 (细). Read back as outline/outlineCount/outlineDepthMax on state, read and every propose/adopt receipt; a malformed entry is refused by name, never dropped.' },
      revision_reason: { type: 'string', description: 'OPTIONAL one line: WHY this revision exists (G11). Read back as revisionReason/revisionReasonSource. An alias of revisionReason.' } },
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
    parameters: { key: { type: 'string', required: true }, value: {}, why: { type: 'string' }, reason: { type: 'string', description: 'alias for why — either word is accepted (v5r teaching uses both); why wins when both are passed' } },
    handler: toolSet,
  },
  {
    name: 'vibe_v5_lean_run',
    // ★ LIVE RUN 58 (a member filed this as feedback after burning a call): the schema said `statement` was optional
    // and the description never mentioned it, while the face refuses a submit without it
    // (`VMU_LEAN_STATEMENT_REQUIRED`). Taught and done now say the same thing. The path rule is stated too, because
    // the teaching text used to promise a short form the face resolves against a different base.
    description: 'Compile one existing .lean file through the kernel\'s Lean face (the face owns the process, timeout and cancel path). ★ `statement` is REQUIRED: it is the proposition this file is supposed to formalise, and it is what the receipt and the audit are about (a submit without it is refused by name). ★ `file` is resolved against the LIBRARY ROOT (the `VibeMath/` directory), so a short path works only when it lives under that root — anywhere else pass an absolute path, and a file the face cannot read comes back with the absolute path it actually tried. Assembly without a host spawn seam ⇒ NAMED refusal; a per-call timeout_ms is reported as unapplied. ★ `jobId` is declared now, and an auto id already present in the mirror directory is re-minted (the receipt carries `rederivedId`).',
    parameters: { file: { type: 'string', required: true }, target: { type: 'string', description: 'legacy alias for statement - a card id is NOT the proposition, so passing only this is refused by name' }, statement: { type: 'string', required: true, description: 'the proposition text this file is supposed to formalise (the audit records this, not an object id)' }, timeout_ms: { type: 'integer' }, member: { type: 'string' }, jobId: { type: 'string', description: 'name this job yourself; the AUTO counter mints lean-<n>, and when the shared mirror directory already holds those numbers the face re-mints the next free id (the receipt reports rederivedId). Pass this to pick a name deliberately - it is the exit the VMU_MATH_JOB_ID_TAKEN refusal names' } },
    handler: toolLeanRun,
  },
  {
    name: 'vibe_v5_lean_job',
    description: 'Inspect the Lean job queue: with jobId the job\'s state, otherwise the list. (waitMs is reported as not applied — the queue returns current state.) ★ TWO JOB FACES ARE NOT ONE: this is the LEAN face — its durable mirror is `Formal/Jobs/<jobId>.json` (vmu.math.jobs.dir for the Lean face). `vibe_vmu_mathjobs` is the PYTHON computation face and its mirror is `Math/Jobs/` by default; `vibe_vmu_mathjobs{action:"listMirrors"}` therefore says nothing about Lean jobs. A Lean job created in an earlier process is readable here by id (the mirror is hydrated on demand).',
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
    parameters: { kind: { type: 'string', required: true, enum: ['def', 'lemma', 'proof', 'blocked'], description: 'the kind of thing the file holds; the library maps these onto its own face kinds (proof -> theorem) and has no fifth word — a THEOREM goes in as kind:"proof" (the receipt then reports kind/mappedKind "theorem")' }, name: { type: 'string', required: true }, statement: { type: 'string', description: 'the proposition text this file formalises (recorded in the library entry)' }, target: { type: 'string', description: 'legacy alias for statement' }, content: { type: 'string' }, from: { type: 'string', description: 'the existing .lean file — the SAME parameter as `file` (it is not the author; pass one of the two, never two that disagree)' }, file: { type: 'string', description: 'the existing .lean file — the SAME parameter as `from` (the alias exists for older briefs; pass one of the two)' }, note: { type: 'string' }, run: { type: 'boolean' } },
    handler: toolLeanArchive,
  },
  {
    name: 'vibe_v5_paper',
    description: '论文子系统（真入口）：action=start|part|review|advance|final|render|status|compile|sections|consult|consult_state。只做参数映射——阶段合法性、互审规则、「只有 chair 席能定稿」都由内核的 paper flow 判并具名拒；本面不自己判政策、不造阶段、不编结论。render 如实报 wrote/missing/complete；compile 无 LaTeX 面即具名拒。★ 所办问询（vmu.paper.officeConsult="required"）：定稿被拦时会给出 requestId，由所办用 action:"consult" 答复（member=答复人所办，answer/note 写核对结论），答完重试 action:"final" 才放行；谁能答复由本 pack 的 PAPER_CONSULT_ROLES 声明（不是内核猜的），普通成员答会被具名拒（VMU_NOT_PERMITTED）。★ action:"consult" 与 "consult_state" 一次只对一篇论文说话，都必须带 `target`（论文 id 或标题），省了会被具名拒。★ action:"part" 是「每参与者一节」——同一成员第二次 part 会**替换**他自己上一节（回执 `replaced` 写明被替换的 recordId）；`review` 的 `part` 是 `of` 的别名（被审成员的 id），把章节名传进去不报错也不绑定章节。★ 定稿的正文门：正文里必须出现**每一张 Verified 结论的 `requiredLine`**（逐字）；被拦时回执的 `missing[]` 给出每条的 `requiredLine`，照抄进正文再定稿即可。render 把 md/tex/meta 写进记录区（record track），磁盘上的 .tex/.pdf 由 compile 产生：阅读回执时两者不是同一件事。★ `advance` 不接受 `to`：目标阶段由当前状态和评审结果决定（writing→reviewing、reviewing→awaiting-editor 或回 writing），回执的 `from`/`to`/`stageMoved` 就是答案；传了未声明的 `to` 会被具名拒（RUN 212 / FEEDBACK48 2.3）。',
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
      body: { type: 'string', description: 'part：正文；final：结论别名。★ 正文里的 `Members/<成员>/<kind>/<x>.md` 指针按【记录 id】解析（不是文件名）：引用文件卡请写记录 id，或把它放进 evidence；与 `proof_ref` 的区别是——`proof_ref` 指「证明正文在哪」，可以指文件；正文里的指针必须是记录库里真有的那一行（RUN 209 / FEEDBACK45 2.3）。★★ RUN 211（run 48 / FEEDBACK47 2.2 实测）：这道闸是「出现即命」——**正文任何位置**（含括注、注释、解释性的一句话）出现该形状的路径都会被解析并在解析不到时被拒，所以要把文件卡路径从正文里**删掉**，不是换成记录 id 后在括号里再提一次。★ TB-2772：**公式请写 LaTeX 命令，不要写裸 unicode 数学字符**（ℤ→`\\mathbb{Z}`、⌊→`\\lfloor`、∉→`\\notin`、①→`1`）——替换表只是兜底，表外字符会被 xelatex 丢掉并在回执里具名（`glyphsUnrepaired` / `VMU_PAPER_GLYPH_UNCOVERED`）' },
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
