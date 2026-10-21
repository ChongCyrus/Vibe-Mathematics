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
  const sent = kernel.mailbox.send('office', payload)
  return { ok: true, tool: 'vibe_v5_message', from: 'office', to: str(args.to), subject: has(args.subject) ? str(args.subject) : null, urgent: urgentFlag, kind,
    note: 'kind does NOT decide urgency (kind "note" for non-urgent, "notice" only when urgent:true); urgent defaults to FALSE' }
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
  const returned = cards.slice(0, limit)
  return { ok: true, tool: 'vibe_v5_read_library', member: wanted, kind: has(args.kind) ? str(args.kind) : null,
    total: cards.length, returned: returned.length, truncated: cards.length > returned.length,
    hint: cards.length > returned.length ? '只回了 ' + returned.length + '/' + cards.length + ' 张：传 limit 提高上限，或按 kind/member 收窄' : null,
    count: returned.length, cards: returned, skippedTracks: skipped }
}



/** The generic helpers the moved handlers use. Exported so a pack can import ONE implementation instead of keeping
 *  a second copy (the bodies above are the verbatim extraction; this block only names them). */
export const KIT_HELPERS = Object.freeze({ str, has, refuse, settingsOf, declaredTracks, recordsOf, membersOf, requireSpeaker })

export const KIT_READ_LIBRARY = toolReadLibrary
export const KIT_RECORD_PROGRESS = toolRecordProgress
export const KIT_CARD_TOOL = cardTool
export const KIT_SOCIAL = Object.freeze({ say: toolSay, message: toolMessage })
