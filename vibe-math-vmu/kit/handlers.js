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
 * Append to the member's research log. `track` picks the file, exactly like the original (narrative = `progress`
 * by default; route/obstacle/rejected/state append their own track so NEGATIVE knowledge stays archived).
 * An unknown track is refused BY NAME with the declared list — the records face declares the allowed set.
 */
function toolRecordProgress(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  const tracks = declaredTracks(kernel)
  const track = has(args.track) ? str(args.track) : 'progress'
  if (!tracks.includes(track)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown progress track "' + track + '"',
      'vmu.records.tracks declares: ' + tracks.join(', '))
  }
  // ★ PHASE 12 / C3: THE STATE PANEL HAS FOUR REQUIRED CONTENTS, AND UNTIL THIS GATE THEM WERE FREE TEXT.
  // The rule: "状态版：可查看他人、可改自己、四个必需内容（当前进度／遇到的障碍／下一步计划／需要的帮助）＋时间信息".
  // Measured before this gate: a one-sentence `content` was accepted into the `state` track with no field check at all —
  // the four elements existed only in prose, which is the (乙) class defect (a published requirement with no mechanism).
  // The four fields are accepted either nested (`state:{progress,obstacles,next,help}`) or flat; a PARTIAL panel is
  // refused BY NAME with the missing keys in `e.missing`, never written as a state that silently omits what blocks it.
  // `content` is still allowed on top of the four (free text), but it can no longer SUBSTITUTE for them.
  if (track === 'state') {
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
    return {
      ok: true, tool: 'vibe_v5_record_progress', track,
      recordId: writtenState.id, rev: writtenState.rev,
      state: { fields: STATE_FIELDS.slice(), values: state },
      // The TIME information is the kernel's, not the author's: it stamps `createdAt`/`updatedAt` on every record. The
      // `put` receipt does not carry them (it returns id/rev), so the stamp is read back from the record itself rather
      // than guessed from the clock — a receipt that prints a time the record does not hold would be a second truth.
      at: stateStamp(records, writtenState.id),
      note: 'the state panel is stored as the four required sections plus any extra elements; a panel missing one of the four is refused by name',
    }
  }
  if (!has(args.content)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'record_progress needs the progress text',
      'pass content:"what you tried, the routes and obstacles, and the next step"')
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
    // ★★★ A TOOL NAME IS NOT AN AUTHOR. This used to fall back to the literal string 'vibe_v5_record_progress', so a research-log
    // entry claimed a "person" who was really the tool, and a reader could not tell an institutional record written by a member from one
    // whose author nobody recorded. Measured on a full live run: the agent drove rounds through vibe_vmu_turn and its progress lines came
    // back attributed to the tool. §1.4.4's "silently declared but ineffective" has an authorship twin: silently declared but UNKNOWN.
    // `by` now carries the member id when the caller names one, and is honestly null when it does not - with `bySource` saying which.
    by: has(args.member) ? str(args.member) : null,
    bySource: has(args.member) ? 'argument' : 'unknown',
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
      // ★ same rule as record_progress: a tool name is not an author
    by: has(args.member) ? str(args.member) : null,
    bySource: has(args.member) ? 'argument' : 'unknown',
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
function toolReadLibrary(args = {}, { kernel } = {}) {
  const records = recordsOf(kernel)
  if (has(args.id)) {
    const row = records.get({ id: str(args.id) })
    return { ok: true, tool: 'vibe_v5_read_library', card: row && row.record ? row.record : row }
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
  return { ok: true, tool: 'vibe_v5_read_library', member: wanted, kind: has(args.kind) ? str(args.kind) : null,
    tracks, declaredTracks: declared,
    total: cards.length, returned: returned.length, truncated: cards.length > returned.length,
    hint: cards.length > returned.length ? '只回了 ' + returned.length + '/' + cards.length + ' 张：传 limit 提高上限，或按 kind/member/track 收窄' : null,
    count: returned.length, cards: returned, skippedTracks: skipped }
}



/** The generic helpers the moved handlers use. Exported so a pack can import ONE implementation instead of keeping
 *  a second copy (the bodies above are the verbatim extraction; this block only names them). */
export const KIT_HELPERS = Object.freeze({ str, has, refuse, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker })

export const KIT_READ_LIBRARY = toolReadLibrary
export const KIT_RECORD_PROGRESS = toolRecordProgress
export const KIT_CARD_TOOL = cardTool
export const KIT_SOCIAL = Object.freeze({ say: toolSay, message: toolMessage })
