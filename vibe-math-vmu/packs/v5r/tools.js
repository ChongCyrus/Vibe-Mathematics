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
 *   · `vibe_v5_tool_help`          → READ: kernel `packTools()` (names+descriptions) ＋ the host applier's visible count
 *   · `vibe_v5_assign`             → tasks face `create`/`assign` ＋ mailbox face `send` (why/acceptance reach the assignee)
 *   · `vibe_v5_fire`               → members face `end` ＋ tasks face `transition` to `cancelled`
 *   · `vibe_v5_nudge`              → mailbox face `send` (kind nudge)
 *   · `vibe_v5_prioritize`         → records face `put` on the state track (the ledger has no priority column)
 *   · `vibe_v5_feedback`           → records face `put`/`list` on the feedback track
 *   · `vibe_v5_read_library`       → records face `get`/`list` (READ-ONLY)
 *
 * THE ROSTER RULE FOR `say`. The original resolved the speaker through its agent→member map (`memberIdOfAgent`).
 * A pack handler has no agent id, so the speaker is an EXPLICIT parameter and it must be a REAL roster id: an
 * unknown id is refused by name (never invented) and an absent one is refused too — that is the "empty sender ⇒
 * named refusal" semantics the SLV fixture verified for `meeting/send`.
 */

const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''

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
  } catch { /* a fake kernel with a throwing accessor is "nothing declared" */ }
  return {}
}

/** The declared record tracks — DERIVED from the live settings snapshot, with the framework's own fallback. */
function declaredTracks(kernel) {
  const v = settingsOf(kernel)['vmu.records.tracks']
  return Array.isArray(v) ? v.map(String) : ['progress', 'routes', 'obstacles', 'rejected', 'state']
}

function recordsOf(kernel) {
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel publishes no records face, so the v5r record tools are absent',
      'assemble a kernel that publishes vmu.records (the records service is part of the framework)')
  }
  return kernel.records
}

function membersOf(kernel) {
  if (!kernel || !kernel.members) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no roster is published, so the v5r social tools cannot name a sender',
      'load the pack through config.packs / vmu.packs.active: its slots[] creates the roster')
  }
  return kernel.members
}

/**
 * Resolve the SPEAKING member: an explicit id that is REALLY on the roster. Nothing is invented.
 * An absent id is refused (no silent "office"), an unknown id is refused with the roster size in the message.
 */
function requireSpeaker(kernel, member) {
  const id = str(member).trim()
  if (!id) {
    throw refuse('VMU_INVALID_ARGUMENT', 'this tool needs the speaking member id: a v5r pack handler has no agent→member map, so the sender cannot be guessed',
      'pass member:"<roster id>" (see vibe_vmu_control roster / vibe_vmu_status)')
  }
  const roster = membersOf(kernel).roster()
  const row = roster.filter((m) => m.id === id)[0]
  if (!row) {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster',
      'the roster holds ' + roster.length + ' member(s); call roster() for the live ids')
  }
  if (row.state !== undefined && row.state !== 'live') {
    throw refuse('VMU_STATE', 'member "' + id + '" is ' + String(row.state) + ', so it cannot speak',
      'roster() shows who is live')
  }
  return id
}

/** Compose the body of a record card from the original tool's fields (value/motive/p are v5r's card keys). */
function cardBody(args, required, extra = []) {
  const missing = required.filter((k) => !has(args[k]))
  if (missing.length) {
    throw refuse('VMU_INVALID_ARGUMENT', 'missing required field(s): ' + missing.join(', ') + ' (the original v5r tool REQUIRED them)',
      'pass ' + missing.map((k) => k + ':"…"').join(' '))
  }
  const lines = []
  for (const k of required.concat(extra)) {
    if (!has(args[k])) continue
    lines.push('- ' + k + '：' + str(args[k]))
  }
  return lines.join('\n')
}

// ── ① record_progress ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Append to the member's research log. `track` picks the file, exactly like the original (narrative = `progress`
 * by default; route/obstacle/rejected/state append their own track so NEGATIVE knowledge stays archived).
 * An unknown track is refused BY NAME with the declared list — the records face declares the allowed set.
 */
function toolRecordProgress(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  if (!has(args.content)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'record_progress needs the progress text',
      'pass content:"what you tried, the routes and obstacles, and the next step"')
  }
  const tracks = declaredTracks(kernel)
  const track = has(args.track) ? str(args.track) : 'progress'
  if (!tracks.includes(track)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown progress track "' + track + '"',
      'vmu.records.tracks declares: ' + tracks.join(', '))
  }
  const written = records.put({
    track,
    // `kind` must be one the institution DECLARES: the records face refuses anything outside `vmu.records.allowedKinds`
    // by name, so a progress log line uses the `progress` kind rather than an invented `note`.
    kind: 'progress',
    title: str(args.title) || 'progress ' + track,
    body: str(args.content),
    // A PROGRESS LOG LINE IS FINAL for its own round: the v5r pack declares `vmu.records.requireSettledRecords: true`
    // (packs/v5r/prompts/v5r-core.js), so an archival entry must say it is settled — that is the institution's own
    // stance, read from the declaration rather than overridden here.
    settled: true,
    by: str(args.member) || 'vibe_v5_record_progress',
  })
  return {
    ok: true, tool: 'vibe_v5_record_progress', track,
    recordId: written.id, rev: written.rev,
    note: 'appended to the ' + track + ' track; the original wrote one file per track for the same reason',
  }
}

/**
 * The four card tools share ONE handler: they differ only in track/kind and in which fields the original REQUIRED.
 * `value` / `motive` / `p` are carried into the body verbatim — they are v5r's card keys, and the framework does
 * not interpret them (the records face stores a body; the card schema belongs to the institution).
 */
function cardTool({ tool, track: defaultTrack, kind: defaultKind, required, extra, title }) {
  return function handler(args = {}, { kernel } = {}) {
    const records = recordsOf(kernel)
    // ★ PHASE 7 / toolification B: a record tool may target a DECLARED generic track (not only its original one).
    // The declared set is the ONLY source of allowed tracks — a name outside it is a NAMED refusal, never an invented
    // track. With no { track } the old behavior is byte-identical (default track, default kind); the old receipt path is
    // deliberately kept (the JSON-progress path still exists).
    const tracks = declaredTracks(kernel)
    const track = has(args.track) ? str(args.track) : defaultTrack
    if (!tracks.includes(track)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown track "' + track + '" for ' + tool,
        'vmu.records.tracks declares: ' + tracks.join(', '))
    }
    const kind = has(args.kind) ? str(args.kind) : defaultKind
    const body = cardBody(args, required, extra)
      + (has(args.payload) && args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload)
        ? '\n' + Object.entries(args.payload).map(([k, v]) => '- ' + k + '：' + str(v)).join('\n')
        : '')
    // v5r's card key `p` is the author's probability; a card is ARCHIVED as settled only when p is decision-grade
    // (1 or 0). The pack declares `requireSettledRecords:true`, so an undecided card is refused BY NAME downstream —
    // the refusal comes from the institution's declared stance, and this handler must not pretend otherwise.
    const isSettled = Number(args.p) === 1 || Number(args.p) === 0
    const written = records.put({
      id: has(args.id) ? str(args.id) : null,
      track,
      kind,
      title: str(args.title) || str(args.id) || (title + ' ' + str(args.p)),
      body,
      settled: isSettled,
      by: str(args.member) || tool,
    })
    return {
      ok: true, tool, track, kind,
      recordId: written.id, rev: written.rev, settled: isSettled,
      note: 'the card body carries the original fields (value/motive/p); settling follows p=1 or p=0',
    }
  }
}

// ── ⑤ say ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * THE CORE GROUP-CHAT TOOL, and the mapping needs a word of justification because two faces could carry it:
 *   · the ORIGINAL `vibe_v5_say` means "speak in the group chat (omit `to`) / send a private message (`to`: id) /
 *     address only the voters (`to`: "voters")" — that is `vmu.chat`, not a meeting: `meetings.speak` needs an
 *     OPEN meeting and writes into the MINUTES, which is a different artefact;
 *   · so `to` omitted ⇒ chat face `send(member, text)` (everyone who reads the channel), `to` given ⇒
 *     mailbox face `send(member, {to, text})` (per-recipient durable mail, which is what `all`/`voters` audiences
 *     mean once an audience seam is bound);
 *   · a `meeting` argument is ALSO accepted and routes to the meetings face `speak` — so the pack supports the
 *     meeting-board reading without pretending a meeting is open when it is not.
 */
function toolSay(args = {}, { kernel } = {}) {
  if (!has(args.text)) throw refuse('VMU_INVALID_ARGUMENT', 'say needs the text to say', 'pass text:"…"')
  const member = requireSpeaker(kernel, args.member)
  const text = str(args.text)
  if (has(args.meeting)) {
    if (!kernel.meetings || typeof kernel.meetings.speak !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'no meetings face is published, so a meeting speech cannot be recorded',
        'assemble a kernel with the meetings service, or omit `meeting` to use the group chat')
    }
    return { ok: true, tool: 'vibe_v5_say', via: 'meeting', member, meeting: str(args.meeting),
      receipt: kernel.meetings.speak({ meeting: str(args.meeting), member, text, at: null }) }
  }
  if (has(args.to)) {
    if (!kernel.mailbox || typeof kernel.mailbox.send !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'no mailbox face is published, so a private message cannot be delivered',
        'assemble a kernel with the mailbox service, or omit `to` to speak in the group chat')
    }
    const sent = kernel.mailbox.send(member, { to: str(args.to), text, kind: 'dm' })
    return { ok: true, tool: 'vibe_v5_say', via: 'mailbox', member, to: str(args.to), receipt: sent }
  }
  if (!kernel.chat || typeof kernel.chat.send !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no chat face is published, so the group chat cannot be written',
      'assemble a kernel with the chat service (or use `to` for a private message)')
  }
  const sent = kernel.chat.send(member, text, { kind: 'chat' })
  return { ok: true, tool: 'vibe_v5_say', via: 'chat', member, receipt: sent,
    note: 'the group chat is the original tool\'s default surface; a meeting speech needs `meeting`' }
}

// ── ⑥ message ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Relay an OFFICE/HUMAN message into the institute. The original's own description is the reason the sender is
 * `office` and not a member: it is the office speaking. `to` may be one member, `all` or `voters` (the audience
 * vocabulary lives in the mailbox face; an unbound audience seam is a NAMED refusal there, never a guess).
 */
function toolMessage(args = {}, { kernel } = {}) {
  if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'message needs a recipient', 'pass to:"<member id>" / "all" / "voters"')
  if (!has(args.content)) throw refuse('VMU_INVALID_ARGUMENT', 'message needs the content', 'pass content:"…"')
  if (!kernel.mailbox || typeof kernel.mailbox.send !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no mailbox face is published, so an office message cannot be delivered',
      'assemble a kernel with the mailbox service')
  }
  const sent = kernel.mailbox.send('office', { to: str(args.to), text: str(args.content), kind: 'notice' })
  return { ok: true, tool: 'vibe_v5_message', from: 'office', to: str(args.to), receipt: sent,
    note: 'the office/human voice is the original tool\'s sender; delivery state is per-recipient durable mail' }
}

// ── ⑦–⑫ SECOND BATCH: task board, hiring, reporting, overview ───────────────────────────────────────────────
/**
 * THE TASK BOARD. The original's `task_create / task_list / task_update` are the shared-board face; the kernel
 * publishes a tasks face with `create / assign / transition / setDependencies / list`, so three of the original's
 * eight update actions (edit, delete, release) have NO face operation here — those are refused BY NAME with the
 * supported list, never silently ignored and never re-implemented in the pack (the task ledger is kernel capability).
 */
function tasksOf(kernel) {
  if (!kernel || !kernel.tasks || typeof kernel.tasks.list !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel publishes no task ledger, so the v5r task tools are absent',
      'assemble a kernel with the tasks service (it is part of the framework)')
  }
  return kernel.tasks
}

const rowsOf = (listed) => (Array.isArray(listed) ? listed : (listed && Array.isArray(listed.tasks) ? listed.tasks : []))

async function toolTaskCreate(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  if (!has(args.subject)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task_create needs a subject',
      'pass subject:"what the task is" (the original REQUIRED it)')
  }
  const made = await tasks.create({
    title: str(args.subject),
    objective: has(args.description) ? str(args.description) : null,
    owner: has(args.owner) ? str(args.owner) : null,
    deps: Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : null,
    writeScopes: Array.isArray(args.write_scopes) ? args.write_scopes.map(String) : [],
  })
  return { ok: true, tool: 'vibe_v5_task_create', task: made,
    note: 'priority is a hint field in the original; this kernel\'s task ledger carries no priority column, so it is not stored (reported, not dropped silently)' }
}

async function toolTaskList(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  const all = rowsOf(await tasks.list())
  let out = all
  if (has(args.status)) out = out.filter((t) => String(t.status || t.state) === str(args.status))
  if (has(args.owner)) out = out.filter((t) => String(t.owner) === str(args.owner))
  // "ready" DERIVED, not guessed: a row is ready when it declares no unfinished blocker. The kernel hands the
  // blocked-by list out; this filter reads it, it does not invent a readiness rule of its own.
  if (args.ready === true) out = out.filter((t) => !Array.isArray(t.blockedBy) || t.blockedBy.length === 0)
  return { ok: true, tool: 'vibe_v5_task_list', count: out.length, total: all.length, tasks: out }
}

const TASK_UPDATE_FACE_OPS = Object.freeze(['claim', 'reassign', 'complete', 'reopen', 'set_dependencies'])

async function toolTaskUpdate(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  if (!has(args.task_id)) throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs task_id', 'pass task_id:"t-…"')
  if (!has(args.action)) throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs action', 'supported: ' + TASK_UPDATE_FACE_OPS.join(', '))
  const rev = Number(args.expected_revision)
  if (!Number.isInteger(rev)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs expected_revision (the compare-and-set token)',
      'take it from task_list/task_get; a stale revision must be refused, not overwritten')
  }
  const action = str(args.action)
  const id = str(args.task_id)
  if (!TASK_UPDATE_FACE_OPS.includes(action)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task action "' + action + '" has NO task-face operation in this kernel',
      'the original allowed edit/delete/release; this kernel\'s ledger exposes only ' + TASK_UPDATE_FACE_OPS.join(', ') + ' — the missing ones are refused by name rather than faked')
  }
  if (action === 'claim') {
    if (!has(args.member)) throw refuse('VMU_INVALID_ARGUMENT', 'claim needs the claiming member', 'pass member:"<roster id>"')
    const done = await tasks.assign(id, str(args.member), { expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, task: done }
  }
  if (action === 'reassign') {
    if (!has(args.owner)) throw refuse('VMU_INVALID_ARGUMENT', 'reassign needs the new owner', 'pass owner:"<roster id>"')
    const done = await tasks.assign(id, str(args.owner), { expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, task: done }
  }
  if (action === 'complete' || action === 'reopen') {
    const to = action === 'complete' ? 'done' : 'open'
    const done = await tasks.transition(id, to, { reason: 'vibe_v5_task_update ' + action, expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, to, task: done }
  }
  const deps = Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : []
  const done = await tasks.setDependencies(id, deps, { expectedRevision: rev })
  return { ok: true, tool: 'vibe_v5_task_update', action, blockedBy: deps, task: done }
}

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
function toolHelp(args = {}, { kernel } = {}) {
  const roster = membersOf(kernel).roster()
  const member = has(args.member) ? str(args.member) : ''
  if (member !== '' && !roster.some((m) => m.id === member)) {
    throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + member + '" on this roster',
      'the roster holds ' + roster.length + ' member(s); omit `member` for the institute-wide tool list')
  }
  const packTools = kernel && typeof kernel.packTools === 'function' ? kernel.packTools() : []
  const tools = packTools.map((t) => ({ name: t.name, purpose: t.description || null }))
  let host = { available: false, code: null, visible: null }
  if (member !== '') {
    try {
      const r = kernel.applyMemberToolFace({ member, allow: [], deny: [] })
      host = { available: true, code: null, visible: (r && (r.visibleBefore !== undefined ? r.visibleBefore : r.visibleAfter)) || 0 }
    } catch (e) {
      host = { available: false, code: (e && e.code) || null, visible: null }
    }
  }
  if (tools.length === 0) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the kernel holds no declared pack tools, so there is nothing to answer',
      'load the v5r pack (config.packs / vmu.packs.active) before asking what is available')
  }
  return { ok: true, tool: 'vibe_v5_tool_help', member: member || null, count: tools.length, tools, host,
    note: 'names come from the kernel\'s own declarations (packTools); the host face names are not readable from the kernel yet (named gap)' }
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
  const archived = recordsOf(kernel).put({
    track: 'state', kind: 'decision', title: 'priorities: ' + order.length + ' task(s)',
    body: 'why：' + str(args.why) + '\norder：' + order.map((r, i) => (i + 1) + '. ' + str(r.task_id) + ' (priority ' + str(r.priority) + ')').join('\n'),
    settled: false, by: str(args.member) || 'vibe_v5_prioritize',
  })
  return { ok: true, tool: 'vibe_v5_prioritize', order, archived: archived && archived.id,
    note: 'the task ledger has no priority column, so the ORDER is archived on the state track (a durable record) and NOT applied to the board — named, not silently ignored' }
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

/** ★ `vibe_v5_read_library` — read anyone's library, READ-ONLY: `id` reads one card; the list form reads the given
 * tracks and filters by kind and by the card's author. A track this deployment does not declare is SKIPPED because the
 * records face refused it by name — the skip is the face's answer, not a swallowed exception. */
function toolReadLibrary(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  if (has(args.id)) {
    const row = records.get({ id: str(args.id) })
    return { ok: true, tool: 'vibe_v5_read_library', card: row && row.record ? row.record : row }
  }
  const limit = has(args.limit) ? Number(args.limit) : 20
  const wanted = has(args.member) ? str(args.member) : null
  const tracks = has(args.kind) ? ['propositions', 'methods', 'problems', 'progress'] : ['propositions', 'methods', 'problems', 'progress']
  const cards = []
  const skipped = []
  for (const track of tracks) {
    let listed = null
    try { listed = records.list({ track, limit }) } catch (e) {
      if (!e || e.code !== 'VMU_INVALID_ARGUMENT') throw e
      skipped.push(track)
      continue
    }
    const items = Array.isArray(listed.items) ? listed.items : []
    for (const it of items) {
      if (has(args.kind) && String(it.kind) !== str(args.kind)) continue
      if (wanted && String(it.owner || it.by) !== wanted) continue
      cards.push(it)
    }
  }
  return { ok: true, tool: 'vibe_v5_read_library', member: wanted, kind: has(args.kind) ? str(args.kind) : null,
    count: cards.length, cards: cards.slice(0, limit), skippedTracks: skipped }
}

// ── ⑳–㉖ FOURTH BATCH: the meeting and voting skeleton (v5r's core difference from v3) ──────────────────────
/**
 * THE THREE ORIGINAL RULES AND WHERE THEY LIVE (measured from `vibe-math-v5r.js`, not assumed):
 *
 *  ① `V5_NOT_VOTER` — "列席／受邀／临时工没有表决权（D8）；授权也不能把票权授出去（H12/R36）". The vmu ballot box has no
 *     role/eligibility concept (its cast takes `by` and never asks who that is), so the rule lands HERE, on the pack's
 *     OWN declared slots: `VOTER_SLOTS = ['chair','member']` — the two permanent seats in this pack's slots[];
 *     `temp` (and an id not on the roster) is refused by name with the original wording. "Authorisation cannot lend
 *     the vote" is structural: this face has no grant path, so there is nothing to lend — stated in the refusal.
 *
 *  ② `min_votes` — "whether THIS ballot counts, not the quorum". vmu's ballot box HAS that floor, but per-INSTANCE
 *     (constructor config `vmu.ballot.minVotes` / `minVotesRatio`), and `open()` accepts only question+options. ⇒ a
 *     per-poll `min_votes` argument is REPORTED as not applied (`unapplied`), and `close()` is where the real floor
 *     fires: the face refuses by name (`VMU_BALLOT_MIN_VOTES_NOT_MET`) and poll_close re-throws that code with the
 *     "未达门槛" wording. ⇒ 需内核能力：per-box rules (mode/max/min/secret/allow_* 与 min_votes).
 *
 *  ③ RECORD-KEEPING vs VOTING — "决议只能由院士或当次会议的记录人写入". The vmu meeting face has no secretary concept
 *     (chair only), so the "院士 OR 记录人" half is a NAMED GAP; what the face CAN carry is enforced: opening/closing a
 *     poll board requires the CHAIR seat (the original marks both "(academician)").
 */
const CHAIR_SLOT = 'chair'
const VOTER_SLOTS = Object.freeze(['chair', 'member'])

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
/** ① V5_NOT_VOTER, landed on the pack's own slot declaration. */
function requireVoter(kernel, member, what) {
  const row = requireSeat(kernel, member, what)
  if (!VOTER_SLOTS.includes(String(row.slot))) {
    throw refuse('VMU_NOT_PERMITTED', '列席／受邀／临时工没有表决权（原版 V5_NOT_VOTER／D8）："' + row.id + '" 在 "' + String(row.slot) + '" 席',
      '只有常设席（chair/member）有票权；授权也不能把票权授出去（H12/R36）——本面没有授权路径，所以结构上无从授出')
  }
  return row
}

/** ★ `vibe_v5_task_get` — read ONE task (the corpus teaches it, so it is declared rather than left dangling). */
async function toolTaskGet(args = {}, { kernel } = {}) {
  if (!has(args.id) && !has(args.task_id)) throw refuse('VMU_INVALID_ARGUMENT', 'task_get needs the task id', 'pass id:"t-…" (from task_list)')
  const id = str(args.id || args.task_id)
  const rows = rowsOf(await tasksOf(kernel).list())
  const row = rows.filter((t) => String(t.id) === id)[0]
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no task "' + id + '" on this board', 'call task_list for the real ids')
  let brief = null
  if (kernel.tasks && typeof kernel.tasks.briefOf === 'function') brief = kernel.tasks.briefOf(id)
  return { ok: true, tool: 'vibe_v5_task_get', task: row, brief }
}

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
  const opened = kernel.meetings.open({ type: 'ordinary', chair: member, roster, materials: str(args.agenda) })
  return { ok: true, tool: 'vibe_v5_meeting', meeting: opened && opened.meeting ? opened.meeting : opened,
    kind, agenda: str(args.agenda), formalAgenda: args.formal_agenda === true,
    note: 'the original could also PROPOSE a meeting from a non-chair seat and let the chair convene it; this face has no propose path (named gap: procedure/propose)' }
}

const MOTION_KINDS = Object.freeze(['topic', 'procedural', 'resolution'])

/** ★ `vibe_v5_motion` — raise a motion inside an ONGOING meeting, or WITHDRAW your own. The vmu meeting face has
 * `motion()` but no withdraw and no secondedBy, so withdraw is refused by name (needs a kernel capability). */
function toolMotion(args = {}, { kernel } = {}) {
  const op = has(args.op) ? str(args.op) : ''
  if (op === 'withdraw') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'withdrawing a motion needs kernel capability "motion withdraw" — the meetings face exposes no withdrawal',
      'the original offered op:"withdraw"; this kernel models motions without a withdraw transition (named gap, not silently accepted)')
  }
  if (!has(args.meeting)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs the meeting id', 'take it from vibe_v5_meeting\'s receipt')
  if (!has(args.kind)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs a kind', 'the original offered: ' + MOTION_KINDS.join(', '))
  if (!MOTION_KINDS.includes(str(args.kind))) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown motion kind: ' + str(args.kind), 'the original offered: ' + MOTION_KINDS.join(', '))
  }
  if (!has(args.text)) throw refuse('VMU_INVALID_ARGUMENT', 'motion needs its text', 'pass text:"the motion as stated"')
  const member = requireVoter(kernel, args.member, 'motion').id
  const made = kernel.meetings.motion({ meeting: str(args.meeting), member, kind: str(args.kind), text: str(args.text) })
  return { ok: true, tool: 'vibe_v5_motion', meeting: str(args.meeting), motion: made && (made.motion || made.id), kind: str(args.kind), text: str(args.text),
    note: 'the original motions start `proposed` and need a SECOND; this face has no secondedBy field, so no second state is pretended' }
}

/** ★ `vibe_v5_second` — seconding a proposed motion. The vmu meetings face models NO second state (no secondedBy, no
 * proposed gate), so this refuses BY NAME and names the missing capability: a silent no-op would make the prompt's
 * "second it" look like it did something. */
function toolSecond(args = {}, { kernel } = {}) {
  if (!has(args.motion_id)) throw refuse('VMU_INVALID_ARGUMENT', 'second needs motion_id', 'pass motion_id:"<motion id from vibe_v5_motion>"')
  requireVoter(kernel, args.member, 'second')
  throw refuse('VMU_ENGINE_UNAVAILABLE', 'seconding a motion needs kernel capability "motion second" (secondedBy + proposed gate) — the meetings face has neither',
    'named gap: the original refused seconding your own motion and prevented double seconds; this kernel does not model seconds at all, so the tool refuses instead of pretending')
}

/** ★ `vibe_v5_poll_open` — open an option-type poll board. The box face supports question+options ONLY, so the
 * original's six per-poll rules are returned under `unapplied` with the reason — "asked" and "applied" stay distinct. */
function toolPollOpen(args = {}, { kernel } = {}) {
  if (!has(args.question)) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs a question', 'pass question:"…"')
  const options = Array.isArray(args.options) ? args.options.map(String).filter((x) => x !== '') : []
  if (options.length < 2) throw refuse('VMU_INVALID_ARGUMENT', 'poll_open needs at least two options', 'pass options:["A","B"] (the ballot box refuses <2 by name)')
  requireChairSeat(kernel, args.member, 'poll_open')
  if (!kernel.ballotbox || typeof kernel.ballotbox.open !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no ballot box face is published, so a poll cannot be opened', 'assemble a kernel with the ballot box service')
  }
  const opened = kernel.ballotbox.open({ question: str(args.question), options })
  const askedRules = ['mode', 'max', 'min', 'min_votes', 'secret', 'allow_abstain', 'allow_revote'].filter((k) => args[k] !== undefined)
  return { ok: true, tool: 'vibe_v5_poll_open', boxId: opened && opened.boxId, question: str(args.question), options,
    unapplied: askedRules.map((k) => ({ rule: k, why: 'the ballot box face accepts question+options only; per-box mode/max/min/secret/allow_*/min_votes are constructor-level in this kernel (需内核能力：per-box rules)' })),
    note: askedRules.length > 0
      ? 'the per-poll rules named in unapplied were ASKED FOR but not applied — reported, not silently dropped'
      : 'no per-poll rules were asked for; the box uses the deployment\'s declared ballot policy' }
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
function leanFaceOrRefuse(kernel, what) {
  const lean = kernel && kernel.lean
  if (!lean || typeof lean.submit !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', what + ' needs the Lean face, and this assembly has none (the host injected no spawn seam)',
      '需内核能力：宿主 spawn 接缝（kernel/index.js 只在 spawn 存在时创建 Lean face）。本包不自己起子进程——那是内核/特殊脚本的活')
  }
  return lean
}

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
  const r = await kernel.pause(has(args.reason) ? str(args.reason) : 'paused by vibe_v5_pause')
  return { ok: true, tool: 'vibe_v5_pause', receipt: r }
}
/** ★ `vibe_v5_resume` — un-pause through the kernel's CONTROL face (NOT `kernel.resume`, which is the durability
 * projection: a same-name trap, written down here instead of being learned the hard way). */
async function toolResume(args = {}, { kernel } = {}) {
  const control = kernel && kernel.controlService
  if (!control || typeof control.resume !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'no control face is published, so a paused institute cannot be resumed', 'assemble a kernel with the control service')
  }
  const r = control.resume(has(args.reason) ? str(args.reason) : undefined)
  const receipt = r && typeof r.then === 'function' ? await r : r
  return { ok: true, tool: 'vibe_v5_resume', receipt,
    note: 'resumed through the control face (kernel.resume is the DURABILITY projection and is deliberately not used here)' }
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

// ── the Lean five ──────────────────────────────────────────────────────────────────────────────────────────
const LEAN_ARCHIVE_KIND_MAP = Object.freeze({ def: 'def', lemma: 'lemma', proof: 'theorem', blocked: 'assumption' })

/** ★ `vibe_v5_lean_run` — compile one existing .lean FILE through the kernel's Lean face (the face owns the process,
 * the timeout and the cancel path). A per-call timeout is NOT supported (the face declares vmu.math.leanTimeoutMs). */
async function toolLeanRun(args = {}, { kernel } = {}) {
  if (!has(args.file)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_run needs file', 'pass file:"Formal/x.lean"')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_run')
  const statement = has(args.target) ? str(args.target) : (has(args.statement) ? str(args.statement) : '')
  const submitted = await lean.submit({ statement, file: str(args.file), member: has(args.member) ? str(args.member) : '' })
  return { ok: true, tool: 'vibe_v5_lean_run', job: submitted,
    unapplied: has(args.timeout_ms) ? [{ rule: 'timeout_ms', why: 'the Lean face times out on its declared vmu.math.leanTimeoutMs; a per-call timeout is not part of submit()' }] : [],
    note: 'the process, the timeout and the cancel path belong to the Lean face (spawn seam); this tool only submits' }
}
async function toolLeanJob(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_job')
  if (has(args.jobId)) return { ok: true, tool: 'vibe_v5_lean_job', job: lean.status(str(args.jobId)) }
  return { ok: true, tool: 'vibe_v5_lean_job', jobs: lean.list(),
    note: has(args.waitMs) ? 'waitMs is not applied: the job queue returns its current state; observe again after a wake' : undefined }
}
async function toolLeanLib(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_lib')
  return { ok: true, tool: 'vibe_v5_lean_lib', lib: await lean.lib({ refresh: args.refresh === true }) }
}
async function toolLeanRead(args = {}, { kernel } = {}) {
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_read needs name', 'pass name:"<archived name>" (see lean_lib)')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_read')
  return { ok: true, tool: 'vibe_v5_lean_read', card: await lean.read({ name: str(args.name) }),
    note: has(args.kind) ? 'kind (auto/lib/proved) is not applied: this kernel keeps ONE archive namespace (def/lemma/theorem/assumption)' : undefined }
}
async function toolLeanArchive(args = {}, { kernel } = {}) {
  if (!has(args.kind)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs kind', 'the original offered def/lemma/proof/blocked')
  const mapped = LEAN_ARCHIVE_KIND_MAP[str(args.kind)]
  if (!mapped) throw refuse('VMU_INVALID_ARGUMENT', 'unknown archive kind: ' + str(args.kind), 'the original offered: ' + Object.keys(LEAN_ARCHIVE_KIND_MAP).join(', '))
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs name', 'give a stable name: read() and lib() use it')
  const file = has(args.from) ? str(args.from) : (has(args.file) ? str(args.file) : '')
  if (!file) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs the existing .lean file (from/file)', 'this face registers existing files; it does not take inline content')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_archive')
  const archived = await lean.archive({ name: str(args.name), kind: mapped, file, statement: has(args.target) ? str(args.target) : '' })
  return { ok: true, tool: 'vibe_v5_lean_archive', mappedKind: mapped, archived,
    note: has(args.content) ? 'content is NOT stored: the archive registers existing files by hash (write the file first)' : undefined }
}

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
    handler: cardTool({ tool: 'vibe_v5_record_proposition', track: 'propositions', kind: 'proposition', required: ['statement', 'value', 'motive', 'p'], extra: ['title', 'id'], title: 'proposition' }),
  },
  {
    name: 'vibe_v5_record_method',
    description: 'Record a theory/method/tool card in your library. REQUIRES content, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, content: { type: 'string', required: true }, notation: { type: 'string' }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, member: { type: 'string' } },
    handler: cardTool({ tool: 'vibe_v5_record_method', track: 'methods', kind: 'method', required: ['content', 'value', 'motive', 'p'], extra: ['title', 'type', 'notation'], title: 'method' }),
  },
  {
    name: 'vibe_v5_record_subproblem',
    description: 'Record a sub-problem card in your library. REQUIRES statement, value, motive and p.',
    parameters: { id: { type: 'string' }, title: { type: 'string' }, statement: { type: 'string', required: true }, value: { type: 'number', required: true }, motive: { type: 'string', required: true }, p: { type: 'number', required: true }, member: { type: 'string' } },
    handler: cardTool({ tool: 'vibe_v5_record_subproblem', track: 'problems', kind: 'subproblem', required: ['statement', 'value', 'motive', 'p'], extra: ['title', 'id'], title: 'subproblem' }),
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
    parameters: { to: { type: 'string', required: true }, content: { type: 'string', required: true } },
    handler: toolMessage,
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
    description: 'Compare-and-set a task action: claim | reassign | complete | reopen | set_dependencies. Requires task_id, expected_revision and action; a stale revision is refused. edit/delete/release have NO task-face operation in this kernel and are refused by name.',
    parameters: { task_id: { type: 'string', required: true }, expected_revision: { type: 'integer', required: true }, action: { type: 'string', required: true }, member: { type: 'string' }, owner: { type: 'string' }, blocked_by: { type: 'array' } },
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
    description: 'What can I call right now? Answers from the kernel\'s own declarations (packTools), never from the prompt: the tool names with one-line purposes, plus the host\'s visible count when a member\'s Agent is reachable. An unknown member, or a host with no live Agent, is a NAMED refusal — never an empty list pretending success.',
    parameters: { member: { type: 'string' } },
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
    description: 'Set institute-wide priorities: an ordered list of {task_id, priority} plus why. This orders work only — it never changes what is true. The task ledger has no priority column, so the order is archived as a durable record and the receipt says it was not applied to the board.',
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
    parameters: { agenda: { type: 'string', required: true }, kind: { type: 'string' }, target: { type: 'string' }, formal_agenda: { type: 'boolean' }, member: { type: 'string', required: true } },
    handler: toolMeeting,
  },
  {
    name: 'vibe_v5_motion',
    description: 'Raise a motion inside an ongoing meeting (kind: topic/procedural/resolution; text required), or ask to withdraw one. Withdrawal needs a kernel capability the meetings face does not have, so it is refused by name.',
    parameters: { op: { type: 'string' }, motion_id: { type: 'string' }, kind: { type: 'string' }, text: { type: 'string' }, reason: { type: 'string' }, meeting: { type: 'string', required: true }, member: { type: 'string', required: true } },
    handler: toolMotion,
  },
  {
    name: 'vibe_v5_second',
    description: 'Second a proposed motion. This kernel does not model motion seconds (no secondedBy / proposed gate), so the tool refuses by name and names the missing capability — it never pretends a second was recorded.',
    parameters: { motion_id: { type: 'string', required: true }, member: { type: 'string', required: true } },
    handler: toolSecond,
  },
  {
    name: 'vibe_v5_poll_open',
    description: 'Open an option-type poll board inside the meeting (question + at least two options; chair seat only). The six §7.1 per-poll rules this kernel\'s box cannot take per box are returned under `unapplied` with the reason.',
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

/** ★ NAMED GAPS (each round's measured limits, recorded rather than hidden). */
export const V5R_NAMED_GAPS = Object.freeze([
  'visible-tools reader: the kernel has no getter for the host\'s full visible NAME set (the host publishes TOOL_NAMES and installs a visible-tools provider, but exposes no reader) — tool_help can therefore name the pack-declared tools exactly and the host visible COUNT, not the host face names.',
  'mail purge on fire: the mailbox face exposes no per-member purge this pack may call, so fire dismisses the member and cancels their tasks but does not drop their mail.',
  'task priority column: the task ledger has no priority/order column, so prioritize archives the order as a record instead of applying it to the board.',
  'motion second: the meetings face has no secondedBy field and no proposed gate, so vibe_v5_second and the withdraw half of vibe_v5_motion are refused by name (需内核能力：motion second / motion withdraw).',
  'per-box poll rules: the ballot box accepts question+options only; the original §7.1 six per-poll rules (mode/max/min/secret/allow_*/min_votes) are constructor-level in this kernel, so poll_open reports them under `unapplied` (需内核能力：per-box rules).',
  'meeting secretary: the meeting face records a chair but no secretary, so the original rule "决议只能由院士或当次会议的记录人写入" can only be half-enforced (chair check); the recorder half is a named gap.',
])
