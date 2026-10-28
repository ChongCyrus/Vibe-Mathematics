// vibe-math-vmu/kit/handlers.js — PHASE 8 / B-2 step 1: the SHARED KIT handlers.
//
// These bodies are EXTRACTED VERBATIM from `packs/v5r/tools.js` (the extraction is mechanical: helpers + cardBody +
// the record/progress card handlers + say + message + read_library). The kit is self-contained — it composes
// ALREADY-PUBLISHED kernel faces and carries its own tiny helpers — so nothing here imports from a pack, and the pack
// is NOT modified by this step (wiring is step 2).
//
// Gates (tests/audit-kit-boundaries): no spawn, no filesystem, no new error codes (only VMU_INVALID_ARGUMENT /
// VMU_NO_SUCH_OBJECT / VMU_STATE / VMU_ENGINE_UNAVAILABLE, all registered), and every kit tool has a disableKey.

const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''

/** A refusal is named: caller's vocabulary + a REGISTERED code + a next step (AGENTS red line 3).
 *  `extra` lets a refusal carry the MACHINE-READABLE part of what is wrong (e.g. WHICH fields are missing) instead of
 *  burying it in the message: the caller can branch on `e.missing` without parsing prose. It never overwrites code/hint. */
function refuse(code, message, hint, extra = null) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const k of Object.keys(extra)) if (!(k in e)) e[k] = extra[k]
  }
  return e
}

/** A refusal that must carry MACHINE-READABLE detail (which fields are missing / which tracks are declared).
 *
 *  ★ WHY THIS IS RETURNED AND NOT THROWN. The host turns a thrown error into `{ok:false, code, message, hint}` and
 *  DROPS every other property (`host.js` `toHostSpec`'s catch branch builds exactly those four keys). Measured: a
 *  `refuse(…, { missing })` reached the model as PROSE ONLY — the caller could not key on the missing names, which is
 *  the whole point of the C3 gate ("a panel missing one of the four is refused by name WITH the missing keys"). So
 *  these two cases return the refusal as DATA of the same shape plus the extras. Prose-only refusals still throw: one
 *  species of refusal, one shape, decided by whether the caller needs to branch on structure. */
function refusalReceipt(code, message, hint, extra = null) {
  const out = { ok: false, code, message, hint: hint || null }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const k of Object.keys(extra)) if (!(k in out)) out[k] = extra[k]
  }
  return out
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
/** ★ The state panel's four REQUIRED contents, in the rule's own order. They are a CLOSED set for validation (a panel
 *  missing one is refused by name) while EXTRA elements are still carried into the body — the institution may extend
 *  its panel, it may not omit what the rule requires. */
const STATE_FIELDS = Object.freeze(['progress', 'obstacles', 'next', 'help'])
const STATE_HINT = 'progress＝当前进度, obstacles＝遇到的障碍, next＝下一步计划, help＝需要的帮助'
/** The kernel's OWN timestamp for a record (never the wall clock this module might read): `put` returns id/rev only,
 *  so the stamp is read back from the record's head. A record the face cannot hand back stamps `null`, honestly. */
function stateStamp(records, id) {
  try {
    const got = records.get({ id })
    const head = got && got.record ? got.record : got
    return head ? (head.updatedAt || head.createdAt || null) : null
  } catch { return null }
}
/**
 * ★ ROUND 68 (F-63): A WRITE RECEIPT MUST ECHO THE ONE FACT THE CALLER JUST CHOSE — THE AUTHOR.
 *
 * Run 68 asked the office to report the `owner` of the card it had just written; the receipt carried `recordId` but no
 * author, so the only way to answer was a second read (the member then quoted a DIFFERENT owner, which is how F-61 was
 * found). The author is decided BY THIS CALL (`member`), so echoing it costs nothing — and when the caller named nobody,
 * the receipt must say that too: `owner:null` plus a sentence that denies the reading "nobody wrote it".
 */
function ownerEcho(records, id) {
  let owner = null
  try {
    const got = records.get({ id })
    const head = got && got.record ? got.record : got
    const v = head ? head.owner : null
    owner = v === undefined || v === null || v === '' ? null : String(v)
  } catch { owner = null }
  return {
    owner,
    ownerMeans: owner === null
      ? 'this row records NO author: the caller did not name `member`, so the record does not know who wrote it (that is not the same fact as "nobody wrote it")'
      : null,
  }
}
/**
 * Append to the member's research log. `track` picks the file, exactly like the original (narrative = `progress`
 * by default; route/obstacle/rejected/state append their own track so NEGATIVE knowledge stays archived).
 * An unknown track is refused BY NAME with the declared list — the records face declares the allowed set.
 */
function toolRecordProgress(args = {}, { kernel, agent, callerMember } = {}) {
  const records = recordsOf(kernel)
  const tracks = declaredTracks(kernel)
  const track = has(args.track) ? str(args.track) : 'progress'
  if (!tracks.includes(track)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown progress track "' + track + '"',
      'vmu.records.tracks declares: ' + tracks.join(', '))
  }
  // ★★ ROUND 99 / D7 (rule L34): "状态版：可查看他人、可改自己" — READABLE FOR OTHERS, WRITABLE ONLY BY ITS OWNER. Before
  // this gate `member` was taken at face value from whoever called: a member (or the office) could name another member and
  // rewrite THAT member's four contents, and nothing in the receipt said whose panel had just changed. The caller Agent is
  // already in `exec` (`tools/member-tools.js` reads `exec.agent` for the same reason): a root session id is not a member
  // seat, so an office/human call keeps the registrar path (it may write on behalf, and the receipt names the panel owner).
  // ★★ ROUND 103 / F-102a: THE SEAT IS TOLD TO US. `callerMember` is resolved by the pack dispatch with the same
  // criterion as the seat-face gate; the `agent.id` branch stays for a caller that wires this spec without the
  // dispatch (a test kernel). Reading only `agent` made every member call look like the office.
  const caller = (typeof callerMember === 'string' && callerMember !== '')
    ? callerMember
    : (agent && typeof agent.id === 'string' && !agent.id.startsWith('session-') ? agent.id : null)
  const panelTarget = track === 'state' ? (has(args.member) ? str(args.member) : caller) : null
  // ★★ ROUND 102 / F-100a: A PANEL BELONGS TO A MEMBER WHO EXISTS. Run 100 wrote a state panel for "r-2" - a name
  // that was never hired (the roster was r-acad + r-1) - and the write succeeded, so the ledger grew a panel owned by a
  // ghost and nobody could tell it from a real one. The existence check is done where the roster is READABLE: when the
  // kernel exposes no members face (small test kernels, a pack with its own roster) the check is SKIPPED and said so in
  // the receipt rather than pretended (`memberCheck: 'skipped'`), because inventing a refusal from an unread roster
  // would be the same class of lie in the other direction.
  let memberCheck = 'not-applicable'
  if (track === 'state' && panelTarget !== null) {
    const rosterIds = (() => {
      try {
        const face = membersOf(kernel)
        if (!face || typeof face.roster !== 'function') return null
        const list = face.roster()
        if (!Array.isArray(list)) return null
        return list.map((m) => String(m && m.id !== undefined ? m.id : m)).filter((id) => id !== '')
      } catch { return null }
    })()
    if (rosterIds === null) memberCheck = 'skipped'
    else if (!rosterIds.includes(panelTarget)) {
      throw refuse('VMU_NO_SUCH_OBJECT', 'there is no member "' + panelTarget + '" on this roster, so there is no panel to write',
        'the roster is: ' + (rosterIds.length ? rosterIds.join(', ') : '(empty)') + ' - hire the member first (vibe_v5_hire { purpose, initial_task, to }), then write their panel; writing a panel for a name nobody hired is refused here so the ledger cannot grow owners that do not exist')
    } else memberCheck = 'checked'
  }
  if (track === 'state' && caller !== null && panelTarget !== null && panelTarget !== caller) {
    throw refuse('VMU_NOT_PERMITTED', 'this state panel belongs to "' + panelTarget + '" and only that member may rewrite it',
      'read it with vibe_v5_read_library { member: "' + panelTarget + '", track: "state" } — reading a panelled member is allowed, rewriting it is not; write your own with member:"' + caller + '" (or leave member out and the caller is used)')
  }
  // ★ PHASE 12 / C3: THE STATE PANEL HAS FOUR REQUIRED CONTENTS, AND UNTIL THIS GATE THEM WERE FREE TEXT.
  // The rule: "状态版：可查看他人、可改自己、四个必需内容（当前进度／遇到的障碍／下一步计划／需要的帮助）＋时间信息".
  // Measured before this gate: a one-sentence `content` was accepted into the `state` track with no field check at all —
  // the four elements existed only in prose, which is the (乙) class defect (a published requirement with no mechanism).
  // The four fields are accepted either nested (`state:{progress,obstacles,next,help}`) or flat; a PARTIAL panel is
  // refused BY NAME with the missing keys in `e.missing`, never written as a state that silently omits what blocks it.
  // `content` is still allowed on top of the four (free text), but it can no longer SUBSTITUTE for them.
  if (track === 'state') {
    // ★★ ROUND 99 / D7: writing your own board needs no id — the caller IS the owner. The receipt says which panel it
    // rewrote (`panelOwner`), so the office registering for somebody cannot be confused with a member editing itself.
    if (panelTarget !== null && !has(args.member)) args.member = panelTarget
    const nested = args.state && typeof args.state === 'object' && !Array.isArray(args.state) ? args.state : null
    const state = {}
    const missing = []
    for (const field of STATE_FIELDS) {
      const raw = nested && nested[field] !== undefined ? nested[field] : args[field]
      if (has(raw)) state[field] = str(raw)
      else missing.push(field)
    }
    const extraFields = []
    const source = nested || args
    for (const k of Object.keys(source)) {
      if (STATE_FIELDS.includes(k) || k === 'track' || k === 'member' || k === 'title' || k === 'content' || k === 'state') continue
      // An UNKNOWN element is not silently dropped from a panel whose whole point is that the four are required.
      extraFields.push(k)
    }
    if (missing.length > 0) {
      return refusalReceipt('VMU_INVALID_ARGUMENT',
        'the state panel needs all four contents; missing: ' + missing.join(', '),
        'pass the four keys (nested under `state`, or flat): ' + STATE_HINT,
        { missing, required: STATE_FIELDS.slice() })
    }
    const body = STATE_FIELDS.map((f) => '- ' + f + '：' + state[f]).join('\n')
      + (extraFields.length > 0 ? '\n' + extraFields.map((k) => '- ' + k + '：' + str(source[k])).join('\n') : '')
      + (has(args.content) ? '\n\n' + str(args.content) : '')
    const writtenState = records.put({
      track,
      kind: 'state',
      title: str(args.title) || '状态版',
      body,
      settled: true,
      by: has(args.member) ? str(args.member) : null,
      bySource: has(args.member) ? 'argument' : 'unknown',
    })
    return Object.assign({
      ok: true, tool: 'vibe_v5_record_progress', track,
      recordId: writtenState.id, rev: writtenState.rev,
      state: { fields: STATE_FIELDS.slice(), values: state },
      // The TIME information is the kernel's, not the author's: it stamps `createdAt`/`updatedAt` on every record. The
      // `put` receipt does not carry them (it returns id/rev), so the stamp is read back from the record itself rather
      // than guessed from the clock — a receipt that prints a time the record does not hold would be a second truth.
      at: stateStamp(records, writtenState.id),
      note: 'the state panel is stored as the four required sections plus any extra elements; a panel missing one of the four is refused by name',
      // ★★ ROUND 99 / D7: name the panel that was just rewritten. Without it the office registering a member panel and a
      // member editing itself produce identical receipts, and a reader cannot tell whose four contents just changed.
      panelOwner: panelTarget,
      memberCheck,
      memberCheckMeans: memberCheck === 'checked'
        ? 'the named member exists on this roster (a panel for an unhired name is refused, not written)'
        : (memberCheck === 'skipped'
          ? 'no members face is readable from here, so the named member was NOT checked against a roster'
          : 'this write is not a state panel, so no member existence check applies'),
      panelOwnerMeans: caller === null
        ? 'written through the office/human path: no member seat was on the call, so the panel was written on behalf of the member named'
        : (panelTarget === caller
          ? 'written by the panel owner itself (the caller)'
          : 'written on behalf: the caller is not a member seat'),
    }, ownerEcho(records, writtenState.id))
  }
  if (!has(args.content)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'record_progress needs the progress text',
      'pass content:"what you tried, the routes and obstacles, and the next step"')
  }
  // ★★ AUDIT HOLE C2 ("已尝试路线/方法及其进度"): the rule names the PROGRESS of a tried route as part of what the log
  // holds, and this branch used to write `args.content` alone — a caller passing `progress:"50%"` with
  // `track:"routes"` got a receipt that neither kept the figure nor said it had been dropped. A parameter the tool
  // publishes must be either kept or REFUSED BY NAME; silence is the (乙) class defect. It is now kept as its own
  // labelled line inside the record body (so it survives into the durable row and every read face) and echoed back.
  const progressArg = args.progress !== undefined && args.progress !== null && String(args.progress).trim() !== '' ? String(args.progress).trim() : null
  const bodyText = str(args.content) + (progressArg === null ? '' : '\n- 进度：' + progressArg)
  const written = records.put({
    track,
    // `kind` must be one the institution DECLARES: the records face refuses anything outside `vmu.records.allowedKinds`
    // by name, so a progress log line uses the `progress` kind rather than an invented `note`.
    kind: 'progress',
    title: str(args.title) || 'progress ' + track,
    body: bodyText,
    // A PROGRESS LOG LINE IS FINAL for its own round: the v5r pack declares `vmu.records.requireSettledRecords: true`
    // (packs/v5r/prompts/v5r-core.js), so an archival entry must say it is settled — that is the institution's own
    // stance, read from the declaration rather than overridden here.
    settled: true,
    // ★★★ A TOOL NAME IS NOT AN AUTHOR. This used to fall back to the literal string 'vibe_v5_record_progress', so a research-log
    // entry claimed a "person" who was really the tool, and a reader could not tell an institutional record written by a member from one
    // whose author nobody recorded. Measured on a full live run: the agent drove rounds through vibe_vmu_turn and its progress lines came
    // back attributed to the tool. §1.4.4's "silently declared but ineffective" has an authorship twin: silently declared but UNKNOWN.
    // `by` now carries the member id when the caller names one, and is honestly null when it does not - with `bySource` saying which.
    by: has(args.member) ? str(args.member) : null,
    bySource: has(args.member) ? 'argument' : 'unknown',
  })
  return Object.assign({
    ok: true, tool: 'vibe_v5_record_progress', track,
    recordId: written.id, rev: written.rev,
    note: 'appended to the ' + track + ' track; the original wrote one file per track for the same reason',
    // ★★ AUDIT HOLE C2: the receipt says whether a progress figure came in and what was done with it — a caller who
    // passed one must be able to read back that it was kept, and a caller who passed none must not be left guessing
    // whether it was dropped.
    progress: progressArg,
    progressMeans: progressArg === null
      ? 'no `progress` figure was passed with this call, so the record body holds only `content` (this is said here, not left to be inferred from a missing field)'
      : 'the `progress` figure was kept as its own labelled line ("- 进度：…") inside the record body, so it survives into the durable row and every read face',
    ...(track === 'state' ? {
      panelOwner: panelTarget,
      memberCheck,
      memberCheckMeans: memberCheck === 'checked'
        ? 'the named member exists on this roster (a panel for an unhired name is refused, not written)'
        : (memberCheck === 'skipped'
          ? 'no members face is readable from here, so the named member was NOT checked against a roster'
          : 'this write is not a state panel, so no member existence check applies'),
      panelOwnerMeans: caller === null
        ? 'written through the office/human path: no member seat was on the call, so the panel was written on behalf of the member named'
        : (panelTarget === caller
          ? 'written by the panel owner itself (the caller)'
          : 'written on behalf: the caller is not a member seat'),
    } : {}),
  }, ownerEcho(records, written.id))
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
      // ★ same rule as record_progress: a tool name is not an author
      by: has(args.member) ? str(args.member) : null,
      bySource: has(args.member) ? 'argument' : 'unknown',
    })
    return Object.assign({
      ok: true, tool, track, kind,
      recordId: written.id, rev: written.rev, settled: isSettled,
      note: 'the card body carries the original fields (value/motive/p); settling follows p=1 or p=0',
    }, ownerEcho(records, written.id))
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
  // ★ PHASE 12 / C2: the DM form is the ONLY form with a recipient, so it is the only form that can carry `urgent`.
  // Normalisation matches `vibe_v5_message` (a boolean may reach a tool as the JSON string "true"/"1"); ABSENT is false.
  const urgentFlag = args.urgent === true || args.urgent === 'true' || args.urgent === 1 || args.urgent === '1'
  if (has(args.meeting)) {
    if (urgentFlag) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a meeting speech cannot be urgent: it has no recipient to wake',
        'drop `urgent` for the meeting form, or send a private message (to:"<member id>") with urgent:true')
    }
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
    // The flag is handed to the mailbox's OWN urgency semantics (`urgent:true` is what that face reads — it does not
    // re-derive urgency from `kind` here, because `vmu.mailbox.urgentKinds` is the deployment's declaration, not ours).
    const sent = kernel.mailbox.send(member, { to: str(args.to), text, kind: 'dm', urgent: urgentFlag })
    return { ok: true, tool: 'vibe_v5_say', via: 'mailbox', member, to: str(args.to), urgent: urgentFlag, receipt: sent }
  }
  if (urgentFlag) {
    throw refuse('VMU_INVALID_ARGUMENT', 'a group-chat message cannot be urgent: it has no single recipient to wake',
      'pass to:"<member id>" for an urgent private message, or drop `urgent` for the group chat')
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
  // ★ PHASE 9 / round 6 — TWO REAL BUGS FIXED HERE:
  //  A) the tool's PUBLISHED schema had lost `subject`/`urgent` (the spec param map), so the host dropped `urgent:true`
  //     before this handler ran. The spec carries them again; an assertion pins the deployed schema.
  //  B) `kind` must NOT decide urgency: the kernel computes `isUrgent = urgent === true || urgentOf(kind)`, and `notice`
  //     is in its urgent-kind list, so kind 'notice' made every office message urgent even without the flag. Non-urgent
  //     mail goes out as kind 'note' (not in that list); 'notice' only when the sender explicitly asked for urgent.
  // Arrival normalisation: a boolean may reach a tool as a JSON string (the older tools-parameter lesson), so `true`
  // and the strings "true"/"1" mean urgent; everything else — including ABSENT — is the default NON-urgent.
  const urgentFlag = args.urgent === true || args.urgent === 'true' || args.urgent === 1 || args.urgent === '1'
  const kind = urgentFlag ? 'notice' : 'note'
  const payload = { to: str(args.to), text: str(args.content), kind, urgent: urgentFlag }
  if (has(args.subject)) payload.subject = str(args.subject)
  // ★★★★★★★ LIVE RUN 28 (the institute's own report, item 9): THE FACE HAD NO SENDER PARAMETER, so `from` was
  // always "office" and the rule "a member can message another member" could not be expressed at all — the office
  // could only pretend. The tool now names WHOSE VOICE the mail carries (`member`, omitted = office) and the receipt
  // names BOTH sides: `from` is the voice, `relayedBy` is who actually wrote it. That distinction is the whole point
  // of the B ruling (members really act; the office records on their behalf) — a message that silently claimed a
  // member wrote it would be worse than one that says "office".
  const sender = has(args.member) ? str(args.member) : 'office'
  const sent = kernel.mailbox.send(sender, payload)
  return { ok: true, tool: 'vibe_v5_message', from: sender, relayedBy: 'office',
    fromMeans: sender === 'office'
      ? 'the OFFICE itself is speaking; pass member:"<id>" to carry a member\'s voice instead'
      : 'the mail carries ' + sender + '\'s voice, but the OFFICE relayed it — members are played by the office in this deployment, so the receipt never claims the member typed it',
    to: str(args.to), subject: has(args.subject) ? str(args.subject) : null, urgent: urgentFlag, kind,
    note: 'kind does NOT decide urgency (kind "note" for non-urgent, "notice" only when urgent:true); urgent defaults to FALSE' }
}



// ── ★★★ LIVE RUN 45 / DEFECT D: THE RECORDS LEDGER AND THE FILE LIBRARY ARE TWO LEDGERS, AND ONE READ MUST SAY SO ───
// THE MEASUREMENT (run 45, build fe98b36f). `r-2` filed its own final ruling with `vibe_v5_verdict { meeting,
// proposition_id, verdict:0.4, reason, member:"r-2" }` and got `ok:true, channel:"ruling", submission.path =
// …\Members\r-2\Propos\ruling-m-r45b-p-r45-r-2-bac61307.md`; the chair then adopted it (`coverage.adoptedFromSubmissions:1`,
// `submissions.cards:4`), so the card was really on disk. The same member then asked its OWN library
// `{ member:"r-2", track:"propositions" }` and got `count:0, rows:[]` — and had no way left to answer 「我提交过裁决吗」.
// WHY: `vibe_v5_verdict` files the ruling as a LIBRARY CARD (durable, under the member's own directory, readable from
// another kernel), while this handler lists the RECORDS ledger, and a file card is not a records row — by construction.
// ★ THE FIX IS (a), NOT (b) (writing a records row from the verdict tool), and the reason is structural:
//   ① a records row in a member's own kernel is MEMORY, while the card must cross the kernel boundary to reach the
//      chair — two sources of truth for one fact would drift, and the one that drifts is the one nobody reads;
//   ② the records `propositions` track is the P1/B1 carrier (`verified` accepts only p=1/p=0 proposition cards), so a
//      ruling (which is a verdict ON a proposition, not a proposition) written into that track would put a non-
//      proposition card in front of the proof gate — the gate's meaning, not just its shape, would be wrong.
// So the file cards are ATTACHED HERE under their own names (`libraryCards` / `libraryCardCount`), the old
// `count`/`cards` keep their old meaning (records rows only), and the receipt says which is which.
/** The library face (file cards under `Members/<member>/`), or null when this kernel publishes none. The kit composes
 *  the PUBLISHED face only (`list` + `expand`); a fake kernel without it must still answer a read, never crash one. */
function libraryFaceOf(kernel) {
  const lib = kernel && kernel.library
  if (!lib || typeof lib.list !== 'function' || typeof lib.expand !== 'function') return null
  return lib
}

/** WHAT A FILE CARD IS, said once and carried on every receipt that reports the readout — an empty list must never be
 *  readable as "nothing was filed" without this sentence next to it. */
// ── ROUND 49 / F-25 (the verified track is a place, not a label) ────────────────────────────────────────────────
//
// MEASURED (run 49, the chair's report, feedback rec-14 and the receipts beside it): the member looked at ITS OWN
// proposition row and had no way to see the one fact that decides whether it is ready for the verified track —
// whether a `verified` row in the same ledger states the SAME claim. In the live run that row came from the chair's
// `vibe_v5_verified_promote` call about a card whose name was `rec-1`, not from the member's row, so the member's
// proposition looked unverified while the ledger said the claim was concluded.
//
// WHAT IS GRANTED HERE: for a `propositions` row, `ready` is true exactly when a `verified` row in the SAME ledger
// states the same claim (its `## 陈述` section equals the row's `- statement：` value, whitespace-normalised). This
// is a READ: nothing is written, nothing is promoted, and a row with no matching verified row says so with a reason
// instead of a bare `ready:false`. `readyOn` names the verified row; `readyConclusion` gives its conclusion
// (true = concluded 真, false = concluded 假) — "verified" is a fact about the ledger, not a promise about the card.
/** The multi-line `- statement：…` value of a records row body (continuation lines fold back, like `parseBody`). */
function statementOfRowBody(body) {
  const lines = String(body === undefined || body === null ? '' : body).split('\n')
  let out = null
  for (const raw of lines) {
    const line = raw.replace('\r' + '$', '')
    const m = /^-\s*statement\s*[：:=]\s*(.*)$/.exec(line)
    if (m) { out = m[1]; continue }
    if (out !== null && (/^-\s/.test(line) || /^##\s/.test(line))) break
    if (out !== null) out += '\n' + line
  }
  return out === null ? null : out
}

/** The `## 陈述` section of a composed verified-row body (the field the promotion writer emits). */
function statementOfVerifiedBody(body) {
  const lines = String(body === undefined || body === null ? '' : body).split('\n')
  const out = []
  let inSection = false
  for (const raw of lines) {
    const line = raw.replace('\r' + '$', '')
    if (/^##\s/.test(line)) { inSection = /^##\s*陈述\s*$/.test(line); continue }
    if (inSection) out.push(line)
  }
  return out.length > 0 ? out.join('\n') : null
}

const normaliseClaim = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim()

/** Every `verified` row this kernel can see, indexed by the claim it states. A failure to read is REPORTED, never
 *  turned into "no verified rows exist" — that would make an empty readout indistinguishable from a silent refusal. */
function verifiedClaimsOf(kernel) {
  const records = recordsOf(kernel)
  const claims = []
  const out = { readable: false, claims, why: null }
  if (!records || typeof records.list !== 'function') { out.why = 'this kernel publishes no records face'; return out }
  let listed = null
  try { listed = records.list({ track: 'verified', limit: 0 }) } catch (e) {
    out.why = 'records.list({track:"verified"}) 失败：' + String((e && e.message) || e)
    return out
  }
  const items = listed && Array.isArray(listed.items) ? listed.items : []
  // ★ A head row carries no `body` (that is what `records.list` returns); the claim is IN the body, so a
  //   verified head is fetched by id before it can be indexed. A body that cannot be read is skipped, never guessed.
  for (const it of items) {
    const row = it && it.record ? it.record : it
    if (!row || typeof row !== 'object') continue
    let body = row.body
    if (body === undefined || body === null) {
      try { const full = records.get({ id: row.id }); body = full && (full.record ? full.record.body : full.body) } catch { continue }
    }
    const claim = normaliseClaim(statementOfVerifiedBody(body))
    if (!claim) continue
    const title = normaliseClaim(row.title)
    claims.push({ id: row.id === undefined || row.id === null ? null : String(row.id), claim,
      conclusion: title.indexOf('假') >= 0 && title.indexOf('定论') >= 0 ? false : true })
  }
  out.readable = true
  return out
}

const READY_MEANS = '`ready` 只说一件事：records 账本里**已经有一条 `verified` 行陈述同一个命题**（该行是 promotion 的唯一写入器写的，不是这张卡自己声明的）。它不是"这张卡已通过审查"，也不改卡的任何状态；`readyOn` 点名是哪条 verified 行、`readyConclusion` 给它的结论（true=已证为真、false=已证为假），`readyWhy` 说为什么还没有'
const READY_NONE_MEANS = '这一批里没有 propositions 行（`ready` 只对 propositions 行计算）'

const FILE_CARD_MEANS = '`libraryCards` 是**文件卡**（<root>/Members/<member>/{Propos,Methods,Subproblems}/ 下的 .md），不是 records 行：`count`/`cards` 只列 records 账本的行，文件卡另列在这里。文件卡没有 records 的 track，所以 `track`/`tracks`/`kind` 收窄的是 records 行，不收窄这里。数量来自库的 head list（受 vmu.records.headListAt 行帽），不是"全库"的保证'

/** The member's library cards, as a SEPARATE readout. Never folded into `count`/`cards`: those stay records rows.
 *  `path` comes from `expand` so a card the member filed has a real, openable address (run 45's receipt had one; the
 *  read side must be able to say the same thing). A card whose body cannot be expanded still counts — the head list
 *  already proves it exists, and `path:null` says only that its address could not be read this time. */
async function fileCardsOf(kernel, member, limit) {
  const cap = Number.isFinite(limit) && limit > 0 ? limit : 20
  const base = { libraryCardsMeans: FILE_CARD_MEANS }
  if (!member) {
    return Object.assign({}, base, { libraryCards: null, libraryCardCount: null, libraryCardsTruncated: false, libraryReadable: false,
      libraryWhy: '没有给 member：文件卡按成员目录存放、不属于任何 track，所以不猜——传 member:"<id>" 才会附带该成员的文件卡' })
  }
  const lib = libraryFaceOf(kernel)
  if (!lib) {
    return Object.assign({}, base, { libraryCards: null, libraryCardCount: null, libraryCardsTruncated: false, libraryReadable: false,
      libraryWhy: '这个 kernel 没有 library face（装配时没有持久 root），所以 <root>/Members/' + member + '/ 下的文件卡这一次**读不到**：'
        + '`count:0`/`cards:[]` 只说明 records 账本里没有行，**不能**说明该成员没有提交过裁决卡' })
  }
  let heads = []
  try { heads = await lib.list({ member }) } catch (e) {
    return Object.assign({}, base, { libraryCards: null, libraryCardCount: null, libraryCardsTruncated: false, libraryReadable: false,
      libraryWhy: 'library face 存在但读不出 head list：' + String((e && e.message) || e) + ' —— 同理，count:0 不能当作"没有文件卡"' })
  }
  // `list({member})` already narrows by directory member; the owner check is the CONTRACT (a card belongs to a member
  // by its owner field), so a head that disagrees is dropped rather than attributed to someone who did not write it.
  const mine = (Array.isArray(heads) ? heads : []).filter((h) => h && String(h.owner || '') === member)
  const shown = mine.slice(0, cap)
  const out = []
  for (const h of shown) {
    const one = { id: h.id === undefined ? null : String(h.id), kind: h.kind === undefined ? null : String(h.kind),
      title: h.title === undefined ? null : String(h.title), status: h.status === undefined ? null : String(h.status),
      owner: member, updatedAt: h.updatedAt === undefined ? null : h.updatedAt, path: null }
    try {
      const ex = await lib.expand(one.id)
      if (ex) {
        one.path = ex.path === undefined || ex.path === null ? null : String(ex.path)
        const head = ex.head && typeof ex.head === 'object' ? ex.head : null
        if (head) {
          if (head.title !== undefined && head.title !== null) one.title = String(head.title)
          if (head.status !== undefined && head.status !== null) one.status = String(head.status)
        }
      }
    } catch { /* the head list already proves the card exists; only its ADDRESS is unknown */ }
    out.push(one)
  }
  return Object.assign({}, base, { libraryCards: out, libraryCardCount: mine.length, libraryCardsTruncated: mine.length > out.length,
    libraryReadable: true, libraryWhy: null,
    libraryCardsMeans: FILE_CARD_MEANS + (mine.length > out.length ? '（本次只回了 ' + out.length + '/' + mine.length + ' 张：传更大的 limit）' : '') })
}

/** ★ `vibe_v5_read_library` — read anyone's library, READ-ONLY: `id` reads one card; the list form reads the given
 *  tracks and filters by kind and by the card's author. A track this deployment does not declare is SKIPPED because the
 *  records face refused it by name — the skip is the face's answer, not a swallowed exception.
 *
 *  ★ PHASE 12 / C3: THE READ SET IS NO LONGER FOUR HARD-CODED TRACKS. Measured before this fix: the list form read
 *  `['propositions','methods','problems','progress']` and NOTHING else, so a member could not read another member's
 *  state panel / obstacles / rejected routes / feedback with the tool the prompts actually teach — the rule requires
 *  "可查看他人" for the state panel, and the state track was invisible to the teaching surface (they had to reach for
 *  `vibe_vmu_records`, which the prompts do not teach). The set is now DERIVED from `vmu.records.tracks`, the same
 *  declaration the write side validates against, and `track` / `tracks` narrow it explicitly. An undeclared name in
 *  `track` is a NAMED refusal (the declaration is the only vocabulary); a declared track the deployment's records face
 *  refuses is still skipped and reported. */
async function toolReadLibrary(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  if (has(args.id)) {
    const id = str(args.id)
    try {
      const row = records.get({ id })
      return { ok: true, tool: 'vibe_v5_read_library', card: row && row.record ? row.record : row }
    } catch (e) {
      // ★ ROUND 42 / F-13: a miss must say WHICH NOUN the id belongs to. Before this, reading `id:"r-1"` answered
      //    "unknown record: r-1" with a list of ids, and nothing told the reader that `r-1` is a MEMBER (the roster
      //    mints `r-<n>` from the same counter family the records minted records from). A refusal is addressed to
      //    whoever must fix the call, so it names their next move: `member:"r-1"` reads THAT member's library.
      if (!e || e.code !== 'VMU_NO_SUCH_OBJECT') throw e
      let roster = []
      try { roster = kernel && kernel.members && typeof kernel.members.roster === 'function' ? kernel.members.roster() : [] } catch { roster = [] }
      const asMember = (Array.isArray(roster) ? roster : []).find((r) => r && String(r.id) === id) || null
      const base = String(e.hint || '')
      const err = new Error(e.message)
      err.code = e.code
      err.hint = asMember
        ? '"' + id + '" is a MEMBER (slot ' + asMember.slot + ', state ' + asMember.state + '), not a record. '
          + 'To read THEIR library pass member:"' + id + '" (optionally with kind / track / tracks); to read a record pass its own id '
          + '(records are minted as "rec-<n>"). ' + base
        : 'no record has the id "' + id + '": records are minted as "rec-<n>" and people are "r-<n>", so check which one you meant. '
          + base
      if (e.detail !== undefined) err.detail = e.detail
      throw err
    }
  }
  const limit = has(args.limit) ? Number(args.limit) : 20
  const wanted = has(args.member) ? str(args.member) : null
  const declared = declaredTracks(kernel)
  let tracks = declared.slice()
  if (has(args.track)) {
    const one = str(args.track)
    if (!declared.includes(one)) {
      return refusalReceipt('VMU_INVALID_ARGUMENT', 'unknown track "' + one + '" for vibe_v5_read_library',
        'vmu.records.tracks declares: ' + declared.join(', '), { declared, unknown: [one] })
    }
    tracks = [one]
  } else if (Array.isArray(args.tracks)) {
    const asked = args.tracks.map(String)
    const unknown = asked.filter((t) => !declared.includes(t))
    if (unknown.length > 0) {
      return refusalReceipt('VMU_INVALID_ARGUMENT', 'unknown tracks for vibe_v5_read_library: ' + unknown.join(', '),
        'vmu.records.tracks declares: ' + declared.join(', '), { declared, unknown })
    }
    tracks = asked
  }
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
  const returned = cards.slice(0, limit)
  // ★ RUN 45 / DEFECT D: the file cards the member actually filed live in the LIBRARY, not in records — attached here
  // under their own names so `count`/`cards` above keep meaning exactly what they meant before (records rows only).
  const fileCards = await fileCardsOf(kernel, wanted, limit)
  // ★ ROUND 49 / F-25: decorate the PROPOSITION rows with the one ledger fact that decides readiness.
  const verified = verifiedClaimsOf(kernel)
  let readyDecorated = 0
  const cardsOut = returned.map((it) => {
    if (!it || typeof it !== 'object' || String(it.track || '') !== 'propositions') return it
    // list rows are HEADS: the statement lives in the body, so one get() per proposition row is the price of
    // comparing claims at all. A body that cannot be read leaves the row undecided, with that fact in readyWhy.
    let rowBody = it.body
    if (rowBody === undefined || rowBody === null) {
      try { const full = records.get({ id: it.id }); rowBody = full && (full.record ? full.record.body : full.body) } catch { rowBody = null }
    }
    const claim = normaliseClaim(statementOfRowBody(rowBody))
    const hit = claim ? verified.claims.find((c) => c.claim === claim) || null : null
    readyDecorated += 1
    const out = Object.assign({}, it, { ready: hit !== null })
    if (hit) {
      out.readyOn = hit.id
      out.readyConclusion = hit.conclusion
      out.readyMeans = READY_MEANS
    } else {
      out.readyWhy = claim
        ? (verified.readable
          ? '这条命题还没有在任何一条 `verified` 行里被陈述过（账本里现在有 ' + verified.claims.length + ' 条 verified 行，没有一条的「陈述」与它相同）；要进 verified 轨，先走 promotion（' + "'vibe_v5_verified_promote'" + '），它会由唯一写入器写下定论行'
          : '读不到 verified 轨，所以不能判断（' + verified.why + '）：`ready:false` 只说明这一次读不到，不能当作"没有定论"')
        : '行体里没有找到 `- statement：` 字段，无法比对（这不是"没有定论"）'
      out.readyMeans = READY_MEANS
    }
    return out
  })
  const readyOn = cardsOut.filter((c) => c && c.ready === true).map((c) => c.id)
  return { ok: true, tool: 'vibe_v5_read_library', member: wanted, kind: has(args.kind) ? str(args.kind) : null,
    tracks, declaredTracks: declared,
    total: cards.length, returned: returned.length, truncated: cards.length > returned.length,
    hint: cards.length > returned.length ? '只回了 ' + returned.length + '/' + cards.length + ' 张：传 limit 提高上限，或按 kind/member/track 收窄' : null,
    count: returned.length, cards: cardsOut, skippedTracks: skipped,
    readyCount: readyOn.length, readyCards: readyOn,
    readyMeans: readyDecorated > 0 ? READY_MEANS : READY_NONE_MEANS,
    verifiedReadable: verified.readable, verifiedClaimsSeen: verified.claims.length, verifiedWhy: verified.why,
    libraryReadable: fileCards.libraryReadable, libraryCards: fileCards.libraryCards,
    libraryCardCount: fileCards.libraryCardCount, libraryCardsTruncated: fileCards.libraryCardsTruncated,
    libraryWhy: fileCards.libraryWhy, libraryCardsMeans: fileCards.libraryCardsMeans }
}



/** The generic helpers the moved handlers use. Exported so a pack can import ONE implementation instead of keeping
 *  a second copy (the bodies above are the verbatim extraction; this block only names them). */
export const KIT_HELPERS = Object.freeze({ str, has, refuse, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker })

export const KIT_READ_LIBRARY = toolReadLibrary
export const KIT_RECORD_PROGRESS = toolRecordProgress
export const KIT_CARD_TOOL = cardTool
export const KIT_SOCIAL = Object.freeze({ say: toolSay, message: toolMessage })
