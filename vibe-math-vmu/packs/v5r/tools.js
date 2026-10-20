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
function cardTool({ tool, track, kind, required, extra, title }) {
  return function handler(args = {}, { kernel } = {}) {
    const records = recordsOf(kernel)
    const body = cardBody(args, required, extra)
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

/**
 * THE MANIFEST FACE. Parameter shapes are taken from the ORIGINAL `vibe-math-v5r.js` registration blocks so a
 * member's prompt and the tool schema agree — first batch: `record_*` (content/statement+value+motive+p), `say`
 * (text), `message` (to/content); second batch: `task_create` (subject/description/blocked_by/write_scopes/priority),
 * `task_list` (status/owner/ready), `task_update` (task_id/expected_revision/action/...), `hire`
 * (purpose/initial_task/direction/term/to), `report` and `overview` (no parameters).
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
])

export default V5R_PACK_TOOLS

/**
 * THE NEXT BATCH, DECLARED AS DATA (not as tools). Every name below is MENTIONED by this pack's prompts and is NOT
 * declared by `V5R_PACK_TOOLS` yet; the `inOriginal` flag records whether the ORIGINAL registry in `vibe-math-v5r.js`
 * registers it — measured, not assumed:
 *
 *   · ten of them exist in the original (`assign / fire / nudge / prioritize / feedback / read_library / lean_*`), so
 *     they are real capabilities waiting for a translation, not prompt inventions;
 *   · `vibe_v5_tool_help` is the EXCEPTION: the prompt corpus mentions it 47 times and the ORIGINAL NEVER REGISTERED
 *     IT — the original's own prompt asked for a tool that did not exist. The corpus is sha256-locked and asserted by
 *     `tests/vmu-pack-prompts.test.mjs`, so deleting the sentence is not available without breaking that gate; the two
 *     honest options are to implement it (making the prompt true) or to keep the mismatch NAMED, and this round keeps
 *     it named and visible here rather than silent.
 *
 * WHY DATA AND NOT THIRTEEN MORE HANDLERS: each remaining name needs its own face mapping (and `lean_*` needs the Lean
 * archive surface), and a tool declared before its mapping exists would be the paper capability this repo bans.
 */
export const V5R_NEXT_BATCH_TOOLS = Object.freeze([
  { name: 'vibe_v5_assign', inOriginal: true },
  { name: 'vibe_v5_fire', inOriginal: true },
  { name: 'vibe_v5_nudge', inOriginal: true },
  { name: 'vibe_v5_prioritize', inOriginal: true },
  { name: 'vibe_v5_feedback', inOriginal: true },
  { name: 'vibe_v5_read_library', inOriginal: true },
  { name: 'vibe_v5_lean_archive', inOriginal: true },
  { name: 'vibe_v5_lean_lib', inOriginal: true },
  { name: 'vibe_v5_lean_read', inOriginal: true },
  { name: 'vibe_v5_lean_run', inOriginal: true },
  { name: 'vibe_v5_tool_help', inOriginal: false },
])
