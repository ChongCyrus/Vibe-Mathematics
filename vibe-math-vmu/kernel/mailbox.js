// vmu mailbox — the DURABLE PER-RECIPIENT MAIL primitive (docs/08 §2, docs/17).
//
// The v5r line got four things right about mail, and this module keeps all four as INVARIANTS rather than
// as habits:
//   1. ONE COPY PER RECIPIENT. Every message is queued for exactly the recipients it names, so one member's
//      acknowledgement can never consume another member's copy (its `say` minted one `msg-N` per recipient
//      in a single transaction — a group message is N messages, not one shared one);
//   2. ACK ONLY AFTER A SUCCESSFUL DELIVERY. The prompt is built, the send is attempted, and only a send
//      that really happened acknowledges the entries; a failed attempt leaves EVERYTHING pending, so
//      "not acked ⇒ still redeliverable" holds by construction;
//   3. THE BODY IS DROPPED AT ACK. Once delivered, only the envelope is kept (`id/from/at/kind/bytes`), so a
//      quote anchor that points at delivered mail is REFUSED BY NAME rather than quoting text that no
//      longer exists;
//   4. INJECT ONCE PER PROMPT. A second prompt build before the wake must not repeat the inbox block; the
//      injection mark is dropped on every CONCLUDED attempt, so a failed wake re-prepends what is pending.
//
// On top of that, delivery is GRADED (urgent vs digest) and budgeted (how many members one pass may wake),
// because the v5r lesson was that a chatty institute otherwise wakes everyone for every line.
//
// The kernel never calls the host itself: the transport is an INJECTED `deliver` seam, and a missing seam is
// returned as a named `VMU_ENGINE_UNAVAILABLE` result (never a silent success, never a thrown crash path for
// a runtime gap). Durability is an OPTIONAL injected `store` port; without it the mailbox is honest about
// being memory-only (`status().durable === false`).
//
// ★ ROUND 31 / task-11 — "DURABLE" ALSO HAS TO MEAN *VISIBLE TO THE OTHER KERNEL*. The institute runs every member
// in its own sub-session, which is its own KERNEL INSTANCE over the same store ROOT (one `<root>/vmu/state.json`).
// Run 31 measured the consequence: the office queued two entries (`vibe_v5_inbox` count 2 in the root session) and
// the member's own inbox answered count 0, while the durable file held `mailbox: null` — nothing ever called
// `persist()`/`restore()`, and nothing COULD: no assembly code called them. The five invariants above are all
// PER-INSTANCE; this sixth one is not. A read face now PULLS (folds what the store holds into memory) and every
// mutation WRITES THROUGH with a MERGE (see `mergeSnapshots`), so two kernels share one mailbox instead of each
// holding a private one. Neither direction changes the shape of what the store holds.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** ★ PHASE 9 / round 2: urgent is the SENDER'S explicit intent ⇒ DEFAULT EMPTY. An institution that wants a kind to be
 * always urgent declares `vmu.mailbox.urgentKinds`; nothing is urgent by kind out of the box. This constant is the
 * documented EMPTY default / recommendation only — the kernel never special-cases any particular list. */
export const MAILBOX_URGENT_KINDS = Object.freeze([])
export const MAILBOX_SUBJECT_MAX = 120
export const MAILBOX_NOTICE_MAX = 300

/** Advisory per-box cap. Over it a send is REFUSED by name with the count — a limit the machine enforces. */
export const MAILBOX_BOX_CAP = 500

/** Every `vmu.mailbox.*` key this module reads (docs/04). */
export const MAILBOX_KEYS = Object.freeze([
  'vmu.mailbox.digestWindowMs',
  'vmu.mailbox.digestMax',
  'vmu.mailbox.urgentKinds',
  'vmu.mailbox.ackedLedgerCap',
  'vmu.mailbox.wakeBudget',
  'vmu.mailbox.deliverTimeoutMs',
])

/**
 * WIRED = read AND able to change an outcome: the window and the max decide when a digest is due, the urgent
 * kinds decide which entries skip the window, the acked cap decides counted drops, the wake budget decides
 * how many members one plan may wake, and the deliver timeout is written into the envelope the host sees.
 */
export const WIRED_MAILBOX_KEYS = Object.freeze(MAILBOX_KEYS.slice())
export const PLANNED_MAILBOX_KEYS = Object.freeze([])

/** The durable key (kernel/store.js PUBLIC_KEYS). */
export const MAILBOX_STORE_KEY = 'mailbox'

/**
 * Named refusal (codes are registered in docs/03 §8). Like `kernel/chat.js`, EVERY refusal states its
 * evaluated scope (D3): `enforced[]` (empty when this decision read no settings key, never `undefined`)
 * plus `enforcedScope`.
 */
export function refuse(code, message, hint, enforced) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforced = Array.isArray(enforced) ? enforced.slice() : []
  err.enforcedScope = 'evaluated-so-far'
  return err
}

import { ms as toMs, msStrict } from './timevalue.js'

const INSTANT_KEY = /(At)$/i
const INSTANT_NAMES = Object.freeze(['until', 'expires', 'expiresAt', 'expiresOn', 'deadline'])
const clone = (v) => JSON.parse(JSON.stringify(v))
const bytesOf = (s) => Buffer.byteLength(String(s === undefined || s === null ? '' : s), 'utf8')

/** Codes with which a filesystem REFUSES a transient operation — measured here on the store's atomic temp→target
 *  rename while a second kernel in the same process was opening the same `vmu/state.json` (Windows: EPERM). At that
 *  point the merged document is still in THIS instance's memory, so retrying is honest and losing the write is not.
 *  The set is closed and small on purpose: every other failure is reported at once, never retried.
 *  R30 / task-17 made this a FALLBACK, not the primary path: `kernel/store.js` now takes the SAME lock in `open()` and
 *  retries a transient rename refusal itself (bounded, re-reading the file first, counted in `stats().writeRetries` /
 *  `writeRetryGiveUps`), and it reports an exhausted retry as `VMU_STORE_FAILED`. This table therefore only fires for a
 *  store implementation that still surfaces a raw transient code (e.g. an injected test store) — keep it, but it is no
 *  longer what a real kernel relies on. */
const TRANSIENT_WRITE_CODES = Object.freeze(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])

// ── ★ ROUND 31 / task-11 — merging TWO KERNELS' views of one `mailbox` key ────────────────────────────────────────
// The helpers below exist because the durable key is SHARED (see the header): the office session and every member
// sub-session are separate kernels over the same store root. A shared key turns "last writer wins" into silent data
// loss unless every write is a MERGE, and a merge needs to decide, per id, whether it is looking at one message or at
// two that were accidentally given the same name.

/** A `mode:'state'` projection envelope (`kernel/resume.js` `stateEnvelope`) is NOT a mailbox snapshot, but it
 *  CONTAINS one: a tolerant reader accepts both shapes, and a writer must not change the shape it found. */
const isStateEnvelope = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && v.mode === 'state' &&
  Object.prototype.hasOwnProperty.call(v, 'value')
const snapshotValueOf = (raw) => (isStateEnvelope(raw) ? raw.value : raw)

/** Two entries under the same id are the same MESSAGE only if the write face's own fields agree. The counter that
 *  mints ids (`let seq`) is PER INSTANCE, so two kernels that have not synced yet both mint `ml-1` — for different
 *  messages. Treating those as one entry would delete one of them. */
const sameMessage = (a, b) => String(a.from) === String(b.from) && String(a.at) === String(b.at) &&
  String(a.kind) === String(b.kind) && String(a.to === undefined ? '' : a.to) === String(b.to === undefined ? '' : b.to) &&
  String(a.text) === String(b.text)

/**
 * Which copy of the SAME entry carries the newer member-owned flags (`read`/`todo`). `stateAt` is stamped by the only
 * two writers of those flags (`open`, `setState`) from the injected clock in epoch-ms, and the LATER stamp wins — that
 * is what lets a member UN-read or un-todo what another kernel marked (mail re-put in the pending queue). On a TIE
 * (a constant clock, or an entry written before this field existed) the flags are OR-ed: "opened" is a fact, while two
 * equal instants are not evidence of order. The cost of a wrong OR is a weaker notification; the cost of a wrong
 * un-mark is a lost one.
 */
const mergeFlags = (a, b) => {
  const stampOf = (e) => (Number.isFinite(Number(e.stateAt)) && e.stateAt !== null ? Number(e.stateAt) : null)
  const ta = stampOf(a)
  const tb = stampOf(b)
  const readA = a.read === true
  const readB = b.read === true
  const todoA = a.todo === true
  const todoB = b.todo === true
  if (ta !== null && tb !== null && ta !== tb) {
    const later = ta > tb ? a : b
    return {
      read: later.read === true,
      todo: later.todo === true,
      stateAt: later.stateAt,
      changed: (readA !== readB) || (todoA !== todoB),
    }
  }
  return {
    read: readA || readB,
    todo: todoA || todoB,
    stateAt: ta !== null ? a.stateAt : (tb !== null ? b.stateAt : undefined),
    changed: (readA !== (readA || readB)) || (todoA !== (todoA || todoB)),
  }
}

/**
 * FOLD TWO SNAPSHOTS INTO THE ONE TO WRITE BACK — the whole write side of task-11. Each law answers a way the old
 * wholesale `persist()` (`patch(key, () => snap)`, ignoring `current`) lost mail:
 *   1. UNION: members and entries held by the store AND by this instance both survive; an instance that has never
 *      seen a message can never erase it.
 *   2. NO RESURRECTION: an id the store's ACKED ledger records is never written back as pending — mail a member
 *      settled in another kernel must not reappear here as unread.
 *   3. ID COLLISION IS NAMED, NEVER DROPPED: see `sameMessage`; the stored message keeps its name, the incoming one
 *      is re-keyed to the next free `ml-N`, and the rename is RETURNED so memory can adopt it and `status()` reports
 *      it. Keeping one silently would delete a message; writing both under one name would make open/ack ambiguous.
 *   4. THE COUNTER MOVES FORWARD ONLY, so a name is never reused.
 * `injected` marks are NOT unioned: they are THIS instance's prompt bookkeeping ("already shown to a builder"), and a
 * mark from another kernel's prompt would silence a notice this kernel has not shown yet.
 * Pure: no clock, no store, mutates neither argument.
 */
function mergeSnapshots(stored, mine) {
  const renamed = []
  let droppedAcked = 0
  const base = snapshotValueOf(stored)
  const own = (mine && mine.data && typeof mine.data === 'object')
    ? mine
    : { at: null, counters: { seq: 0 }, data: { boxes: {}, acked: {}, injected: {} }, skipped: [] }
  if (!base || base.face !== 'mailbox' || !base.data || typeof base.data !== 'object') {
    // Nothing readable is stored (a first write, `mailbox: null`, or a value this version cannot read): what this
    // instance holds IS the merge. `mine` is used unchanged so a caller's snapshot is never rewritten in place.
    return { snap: mine, renamed, droppedAcked }
  }
  const out = {
    apiVersion,
    face: 'mailbox',
    v: 1,
    at: own.at,
    counters: { seq: 0 },
    data: { boxes: {}, acked: {}, injected: {} },
    skipped: Array.isArray(own.skipped) ? own.skipped : (Array.isArray(base.skipped) ? base.skipped : []),
  }
  const baseBoxes = base.data.boxes || {}
  const ownBoxes = (own.data && own.data.boxes) || {}
  const baseAcked = base.data.acked || {}
  const ownAcked = (own.data && own.data.acked) || {}
  let top = Math.max(Number((base.counters && base.counters.seq) || 0), Number((own.counters && own.counters.seq) || 0))
  for (const member of new Set([...Object.keys(baseBoxes), ...Object.keys(ownBoxes)])) {
    const settled = new Set()
    for (const row of [...(baseAcked[member] || []), ...(ownAcked[member] || [])]) {
      if (row && row.id) settled.add(String(row.id))
    }
    const kept = []
    const byId = new Map()
    for (const row of baseBoxes[member] || []) {                                  // (2) stored, minus settled
      if (!row || !row.id || settled.has(String(row.id))) continue
      const copy = clone(row)
      kept.push(copy)
      byId.set(String(copy.id), copy)
    }
    for (const row of ownBoxes[member] || []) {
      if (!row || !row.id) continue
      const hit = byId.get(String(row.id))
      if (!hit) {
        if (settled.has(String(row.id))) { droppedAcked += 1; continue }         // (2) already acked elsewhere
        const copy = clone(row)
        kept.push(copy)
        byId.set(String(copy.id), copy)
        continue
      }
      if (!sameMessage(hit, row)) {                                              // (3) two messages, one name
        top += 1
        const copy = clone(row)
        copy.id = 'ml-' + String(top)
        copy.seq = top
        renamed.push({ member: String(member), from: String(row.id), to: copy.id })
        kept.push(copy)
        byId.set(copy.id, copy)
        continue
      }
      const flags = mergeFlags(hit, row)                                          // (1) same message, newer flags
      hit.read = flags.read
      hit.todo = flags.todo
      if (flags.stateAt !== undefined) hit.stateAt = flags.stateAt
    }
    if (kept.length) out.data.boxes[member] = kept
  }
  for (const member of new Set([...Object.keys(baseAcked), ...Object.keys(ownAcked)])) {
    const ledger = []
    const seen = new Set()
    for (const row of [...(baseAcked[member] || []), ...(ownAcked[member] || [])]) {
      if (!row || !row.id || seen.has(String(row.id))) continue
      seen.add(String(row.id))
      ledger.push(clone(row))
    }
    if (ledger.length) out.data.acked[member] = ledger
  }
  out.data.injected = clone((own.data && own.data.injected) || {})
  const ids = [...Object.values(out.data.boxes)].flat()
    .map((e) => Number(e.seq) || Number(String(e.id).replace(/^ml-/, '')) || 0)
  out.counters.seq = Math.max(top, ...ids)                                       // (4) forward only
  return { snap: out, renamed, droppedAcked }
}

/**
 * `createMailbox({ clock, log, settings, store, deliver, resolveAudience })`.
 *
 *   · `deliver(envelope)` — the transport seam. The envelope is `{member, entries, urgent, count, timeoutMs}`;
 *     returning `false` (or throwing) means NOTHING was delivered and NOTHING is acked;
 *   · `resolveAudience({to, from})` — the roster seam. Without it, a single member id is accepted as-is and
 *     `all`/`voters` are refused by name (the kernel does not guess a roster);
 *   · `store` — the durable port; absent ⇒ memory-only and `status().durable === false`.
 */
export function createMailbox({
  clock = () => new Date(0).toISOString(),
  log = () => {},
  settings = {},
  bus = null,
  store = null,
  deliver = null,
  resolveAudience = null,
  // G7 (Round 8): the durable commit log (`createDurableCommitLog`, `kernel/ballot.js`). Injected by the host;
  // absent ⇒ every send runs unchanged and nothing pretends to be durable.
  durableQueue = null,
} = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createMailbox needs a clock function', 'pass { clock }')

  const readKey = (k) => {
    if (settings && typeof settings.get === 'function') {
      const v = settings.get(k)
      if (v !== undefined) return v
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) return settings[k]
    const short = k.split('.').pop()
    const nested = (settings && (settings.mailbox || settings)) || {}
    if (nested && Object.prototype.hasOwnProperty.call(nested, short)) return nested[short]
    return undefined
  }
  const numKey = (k, d) => { const n = Number(readKey(k)); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d }
  const listKey = (k, d) => { const v = readKey(k); return Array.isArray(v) ? v.map(String) : d }

  const digestWindowOf = () => numKey('vmu.mailbox.digestWindowMs', 45000)
  const digestMaxOf = () => numKey('vmu.mailbox.digestMax', 12)
  const urgentKindsOf = () => listKey('vmu.mailbox.urgentKinds', MAILBOX_URGENT_KINDS)
  const ackedCapOf = () => numKey('vmu.mailbox.ackedLedgerCap', 500)
  const wakeBudgetOf = () => numKey('vmu.mailbox.wakeBudget', 1)
  const deliverTimeoutOf = () => numKey('vmu.mailbox.deliverTimeoutMs', 0)

  const boxes = new Map()          // member -> [entry]
  const acked = new Map()          // member -> [{id, from, at, kind, bytes}]
  const injected = new Map()       // member -> Set(ids)  ("already put in a prompt, not yet acked")
  const audit = []
  const dropped = { acked: 0, audit: 0, injectedMarks: 0 }
  // ★ PHASE 9 / round 5: the delivery path was invisible on the real machine (mail sent, no prompt notice). These
  // counters make "was deliverable/flush ever called?" a fact instead of a guess.
  const deliveryStats = { deliverableCalls: 0, flushCalls: 0, noSeam: 0, sent: 0, refused: 0, urgentDelivered: 0, noticesBuilt: 0 }
  const refusals = new Map()
  let seq = 0
  let durable = false

  /**
   * The framework owns the clock, so an uninterpretable one is a NAMED refusal (never coerced to 0, which would
   * make every entry look infinitely old and wake everyone). `msStrict` attaches `enforced: []` + scope.
   */
  const nowMs = () => msStrict(clock(), 'the injected mailbox clock')

  /**
   * RULE F: a stored stamp that cannot be interpreted is HANDLED, never silently coerced. Every stamp here was
   * written from the same injected clock `nowMs()` validates, so this cannot occur in practice — but if a
   * durable/hand-edited entry ever carries one, it is reported ONCE by name and excluded from the waiting-time
   * computation (`null` = "no interpretable arrival"), which is the conservative side: unreadable mail never
   * makes itself look "due now", and it is never silently dropped either.
   */
  let uninterpretableStamps = 0
  const finiteStamp = (v) => { const t = toMs(v); return Number.isFinite(t) ? t : null }
  const oldestStamp = (rows) => {
    const stamps = []
    for (const e of rows) {
      const t = finiteStamp(e.at)
      if (t === null) {
        uninterpretableStamps += 1
        if (uninterpretableStamps === 1 || uninterpretableStamps % 100 === 0) {
          record('stamp-uninterpretable', { id: e.id, at: e.at, total: uninterpretableStamps,
            reason: 'the arrival instant is not interpretable: EXCLUDED from the digest window and reported here (never coerced to 0)' })
        }
        continue
      }
      stamps.push(t)
    }
    return stamps.length ? Math.min(...stamps) : null
  }
  /**
   * The ONE hook helper (string topic FIRST — an object-shaped emit is rejected and then swallowed, so it would
   * never reach a subscriber). Registered names: `mailbox/deliver-before` (blockable), `mailbox/delivered`.
   */
  const emitHook = (topic, payload, scope) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      // Topic LITERALS: the hook-coverage gate reads `bus.emit('<name>'` from the source (see kernel/chat.js).
      if (topic === 'mailbox/deliver-before') return bus.emit('mailbox/deliver-before', payload, scope || {})
      if (topic === 'mailbox/delivered') return bus.emit('mailbox/delivered', payload, scope || {})
      return null
    } catch (e) { return null }
  }
  const note = (code) => { refusals.set(code, (refusals.get(code) || 0) + 1); return code }

  const record = (what, detail) => {
    const row = Object.assign({ at: clock(), what }, detail)
    audit.push(row)
    if (audit.length > 500) { const over = audit.length - 500; dropped.audit += over; audit.splice(0, over) }
    return row
  }

  const boxOf = (member) => {
    const id = String(member)
    if (!boxes.has(id)) boxes.set(id, [])
    return boxes.get(id)
  }
  const urgentOf = (kind) => urgentKindsOf().includes(String(kind))

  /** Stable, predictable subject: explicit subject wins; otherwise the first non-empty line, capped (with a marker). */
  const subjectOf = (text, subject) => {
    let s = typeof subject === 'string' ? subject.trim() : ''
    if (!s) {
      const first = String(text || '').split(/\r?\n/).map((x) => x.trim()).find((x) => x.length > 0) || ''
      s = first
    }
    if (s.length > MAILBOX_SUBJECT_MAX) return { subject: s.slice(0, MAILBOX_SUBJECT_MAX - 1) + '…', subjectTruncated: true }
    return { subject: s, subjectTruncated: false }
  }
  const capNotice = (s) => {
    const t = String(s || '')
    return t.length <= MAILBOX_NOTICE_MAX ? t : t.slice(0, MAILBOX_NOTICE_MAX - 1) + '…'
  }
  const sendersOf = (rows) => [...new Set(rows.map((e) => e.from))]
  const oldestAtOf = (rows) => {
    const st = oldestStamp(rows)
    return st === null ? null : new Date(st).toISOString()
  }
  /** Public list row: exactly these 8 fields; NO body. */
  // ★ ROUND 52 (measured defect): these two READ faces used to drop `urgent`. The entry carries it (the sender's own
  // intent, and the value the caller's receipt already shows), but a triage row that omits it makes an urgent message
  // indistinguishable from ordinary mail — the read face deleted a fact the write face had just recorded. A consumer
  // (v5r's inbox) could only reconstruct it by joining `pending()`, which returns "unknown" (null) for anything acked —
  // i.e. "I cannot tell" was the best a caller could do, and "cannot tell" is not "not urgent".
  // ★ ROUND 53 (Lead ruling): the field is a BOOLEAN with default `false`, never `undefined` and never absent. The
  // write side always records a boolean, so for anything this face produced the value is the sender's own; a LEGACY
  // entry restored from an older snapshot may predate the field, and for it `false` is the honest reading — a message
  // is not urgent unless it says so. What must never happen is an absent key: a consumer reading `row.urgent` gets a
  // verdict, and "the field is missing" is not one of the two possible values.
  const urgentOfEntry = (e) => e.urgent === true
  const listRow = (e) => ({ id: e.id, from: e.from, at: e.at, subject: e.subject, kind: e.kind,
    read: e.read === true, todo: e.todo === true, bytes: bytesOf(e.text), urgent: urgentOfEntry(e) })
  const openView = (e) => ({ id: e.id, from: e.from, at: e.at, subject: e.subject, kind: e.kind,
    text: e.text, replyTo: e.replyTo === undefined ? null : e.replyTo, urgent: urgentOfEntry(e) })
  const findEntry = (member, id) => {
    const box = boxes.get(String(member)) || []
    const hit = box.find((e) => e.id === String(id))
    return hit || null
  }
  const noSuchEntry = (member, id) => {
    note('VMU_MAILBOX_NO_SUCH_ENTRY')
    record('entry-refused', { member: String(member), id: String(id) })
    throw refuse('VMU_MAILBOX_NO_SUCH_ENTRY', 'no entry ' + String(id) + ' in the mailbox of ' + String(member),
      'list() names the live entries; an acked entry has no retained body')
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ★ ROUND 31 / task-11 — THE SHARED-KEY SEAM: PULL BEFORE A READ, MERGE ON A WRITE.
  //
  // The `mailbox` key is the one durable key this face owns, and TWO kernels of one run can own a handle on it (the
  // office's session and each member's own sub-session are separate kernels over one store root). Three facts shape
  // the code below:
  //   · the store is BOUND at construction but OPENED later (`vibe-math-vmu.js` awaits `store.open()` after
  //     `kernel.start()`), so reading at construction would always throw — hydration is LAZY and RETRIED on every
  //     access until it succeeds (the same reason `kernel/index.js` hydrates `records` lazily);
  //   · the store never PUSHES: `store.read()` reloads-if-stale on THIS instance, so freshness requires an explicit
  //     read BEFORE a read face answers. A member that only ever calls `unread()` must still see the office's mail;
  //   · a write is `store.patch(key, fn)` under a file lock, so it is safe to MERGE there — but only if the merge runs
  //     on the value the store hands us (`current`), which is what `mergeSnapshots` is for.
  // Failures are NAMED (`VMU_STORE_FAILED`, the store's own code), counted in `status().shared`, recorded in the
  // audit trail and RETRIED; they are never thrown out of a read face (a broken store must not take a member's whole
  // turn down) and never swallowed in silence.
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  /** A member-owned flag write (`open`/`setState`) carries WHEN it happened, in epoch-ms, so two copies of one entry
   *  can be ordered by `mergeFlags` instead of guessed at. */
  const stateStamp = () => { const t = finiteStamp(clock()); return t === null ? 0 : t }
  const storeReadable = () => !!store && typeof store.read === 'function'
  const storeWritable = () => !!store && typeof store.patch === 'function'
  const shared = {
    pulls: 0, pullRefused: 0, pulledEntries: 0, adoptedFlags: 0, droppedAcked: 0,
    pushes: 0, writeRefused: 0, writeRetries: 0, pushedEntries: 0, renamedOnCollision: 0, skippedEnvelope: 0,
    lastError: null, lastPullAt: null, lastPushAt: null,
  }
  /**
   * ★ 具名拒绝 (rule 2): the port is present but refused the operation. The code is the STORE's own code and the
   * message keeps the store's words, because the caller's fix is at the store (path / permission / open timing), not
   * at the mailbox. `enforced: []` — this decision read no settings key.
   */
  const storeRefused = (what, e) => {
    const code = (e && typeof e.code === 'string' && e.code) || 'VMU_STORE_FAILED'
    const message = String((e && e.message) || e)
    shared.lastError = { what, code, message, at: clock() }
    // NOT `note()`d as a refusal: during boot the store is simply not open yet, and a refusal counter that is non-zero
    // on every healthy start would make the counter useless. It IS recorded in the audit trail, logged, counted in
    // `status().shared`, and returned BY NAME to a caller that asked for a write (`persist()`), which is where the
    // rule "named, never swallowed" applies to a caller.
    record('store-refused', { what, code, message })
    log('mailbox: the shared store refused ' + what + ' (' + code + '): ' + message)
    return { code, message }
  }

  /**
   * Fold what the STORE holds into this instance's memory. The rules:
   *   · an entry the store holds and this instance never saw is ADDED (that missing add IS the run-31 defect);
   *   · an entry both hold is matched by id AND identity (`sameMessage`): the same message merges its member-owned
   *     flags through `mergeFlags`; a DIFFERENT message under an id this instance minted is a real collision and is
   *     kept for the next push to re-key (never merged away, never silently overwritten);
   *   · an entry the store's ACKED ledger records is REMOVED here — mail settled in another kernel must not come back
   *     as pending in this one;
   *   · `injected` marks are NOT adopted: they are the OTHER kernel's prompt bookkeeping, and adopting one would
   *     silence a notice this kernel has not shown yet;
   *   · `seq` moves FORWARD only, so a name is never reused.
   * Returns what it changed (for `status().shared`).
   */
  const mergeShared = (raw) => {
    const snap = snapshotValueOf(raw)
    const out = { entries: 0, flags: 0, dropped: 0, collisions: 0 }
    if (!snap || snap.face !== 'mailbox' || !snap.data || typeof snap.data !== 'object') return out
    const remoteBoxes = snap.data.boxes || {}
    const remoteAcked = snap.data.acked || {}
    const settled = new Map()
    for (const member of Object.keys(remoteAcked)) {
      const ids = new Set()
      for (const row of remoteAcked[member] || []) if (row && row.id) ids.add(String(row.id))
      if (ids.size) settled.set(String(member), ids)
    }
    // The members that matter are the union of "has mail" and "has settled mail": an ACK removes the body from the
    // store's box, so the ledger is the ONLY evidence left that this entry is no longer pending. Iterating the boxes
    // alone left such an entry pending here forever (measured: A kept showing ml-1 after B acked it).
    const members = new Set(Object.keys(remoteBoxes))
    for (const member of Object.keys(remoteAcked)) members.add(String(member))
    for (const member of members) {
      const box = boxes.get(String(member)) || []
      const done = settled.get(String(member)) || new Set()
      for (let i = box.length - 1; i >= 0 && done.size; i -= 1) {
        if (done.has(box[i].id)) { box.splice(i, 1); out.dropped += 1 }   // (2) settled elsewhere: never resurrect it here
      }
      for (const row of remoteBoxes[member] || []) {
        if (!row || !row.id) continue
        const id = String(row.id)
        if (done.has(id)) continue
        const hit = box.find((e) => e.id === id)
        if (!hit) {
          const copy = clone(row)
          if (copy.stateAt === undefined) delete copy.stateAt
          box.push(copy)
          out.entries += 1
          continue
        }
        if (!sameMessage(hit, row)) { out.collisions += 1; continue }   // (3) both survive; the push re-keys ours
        const flags = mergeFlags(hit, row)
        if (flags.changed) out.flags += 1
        hit.read = flags.read
        hit.todo = flags.todo
        if (flags.stateAt !== undefined) hit.stateAt = flags.stateAt
      }
      if (!boxes.has(String(member)) && box.length) boxes.set(String(member), box)
    }
    const remoteSeq = Number((snap.counters && snap.counters.seq) || 0)
    if (Number.isFinite(remoteSeq) && remoteSeq > seq) seq = remoteSeq
    return out
  }

  /**
   * Read the shared key and fold it in. Called at the START of every read face and every mutation, so an instance that
   * has never spoken to the store still answers with mail another kernel queued. Never throws: the normal boot state
   * ("store not open yet") and a genuinely broken store are both reported by name and retried on the next access.
   */
  const pullShared = (why) => {
    if (!storeReadable()) return null
    shared.pulls += 1
    let raw
    try {
      raw = store.read(MAILBOX_STORE_KEY)
    } catch (e) {                                             // not open yet, unreadable, or refused: named + retried
      shared.pullRefused += 1
      storeRefused('read "' + MAILBOX_STORE_KEY + '" for ' + why, e)
      return null
    }
    if (raw && typeof raw.then === 'function') {
      // The port contract is a SYNCHRONOUS `read` (`kernel/store.js` reads its in-memory fold). A promise here is a
      // caller error, and folding it in would be the worst kind of bug: `durable` would claim a share that was never
      // read. So it is refused BY NAME (and retried on the next access, like every other pull failure).
      const bad = new Error('store.read returned a promise; the durable port reads synchronously')
      bad.code = 'VMU_INVALID_ARGUMENT'
      shared.pullRefused += 1
      note('VMU_INVALID_ARGUMENT')
      storeRefused('read "' + MAILBOX_STORE_KEY + '" for ' + why, bad)
      return null
    }
    try {
      const got = mergeShared(raw)
      shared.pulledEntries += got.entries
      shared.adoptedFlags += got.flags
      shared.droppedAcked += got.dropped
      shared.renamedOnCollision += got.collisions
      if (raw !== undefined && raw !== null) durable = true
      shared.lastPullAt = clock()
      return got
    } catch (e) {
      // A stored value this version cannot merge is NOT a store failure; it is reported as such, so a reader can tell
      // "the store said nothing" from "the store said something I cannot read".
      shared.pullRefused += 1
      note('VMU_STATE')
      record('shared-merge-refused', { why, message: String((e && e.message) || e) })
      log('mailbox: the stored snapshot could not be merged for ' + why + ': ' + String((e && e.message) || e))
      return null
    }
  }

  /** Adopt the names a merge gave to entries that collided with another kernel's ids, so the NEXT pull matches them by
   *  id (otherwise the same message would be pulled in a second time under its new name). */
  const adoptRenames = (renamed) => {
    for (const r of renamed) {
      const box = boxes.get(String(r.member))
      const hit = box && box.find((e) => e.id === r.from)
      if (!hit) continue
      hit.id = r.to
      const n = Number(String(r.to).replace(/^ml-/, ''))
      if (Number.isFinite(n) && n > 0) hit.seq = n
    }
    if (renamed.length) shared.renamedOnCollision += renamed.length
  }

  let writeChain = Promise.resolve()
  let queuedPush = null
  /**
   * WRITE THROUGH, MERGED — the write half of the shared key. Every mutation funnels here; the merge runs on
   * `current` INSIDE `store.patch` (under the store's file lock), so two kernels writing at the same time each keep
   * the other's mail instead of overwriting it. Writes are COALESCED: a mutation that lands while a push is queued
   * but not yet started reuses it (the snapshot is taken when the callback runs, so it starts from the newest state),
   * which is why marking five entries read is one write and not five.
   *
   * SHAPE IS NOT NEGOTIABLE: if the key holds a `mode:'state'` projection envelope (`kernel/resume.js`
   * `stateEnvelope`, which hydrates through `mailbox.hydrate(env.value)`), this push DECLINES — it returns
   * `undefined` so the store records "unchanged" and reports `skipped:'state-envelope'`. That projection owns the
   * shape of the key in that process; replacing it with a bare snapshot would break its reader. In the shipped
   * assembly (`kernel/index.js`) there is no such projection row, so the bare snapshot is what gets written — the
   * shape `kernel/resume.js` counts unacked mail from.
   */
  const pushShared = (why) => {
    if (!storeWritable()) {
      return Promise.resolve({ ok: true, persisted: false, durable: false, reason: 'no store port is bound', key: MAILBOX_STORE_KEY })
    }
    if (queuedPush) return queuedPush
    const run = writeChain.then(async () => {
      queuedPush = null
      let attempt = 0
      for (;;) {
        let renamedNow = []
        let droppedNow = 0
        let entriesNow = 0
        let mergedTop = 0
        let skipEnvelope = false
        let res = null
        try {
          res = await store.patch(MAILBOX_STORE_KEY, (current) => {
            if (isStateEnvelope(current)) { skipEnvelope = true; return undefined }
            const mine = mailbox.snapshot()
            const merged = mergeSnapshots(current, mine)
            renamedNow = merged.renamed
            droppedNow = merged.droppedAcked
            mergedTop = Number((merged.snap.counters && merged.snap.counters.seq) || 0)
            entriesNow = Object.values((mine.data || {}).boxes || {}).flat().length
            return merged.snap
          })
        } catch (e) {
          const code = String((e && e.code) || '')
          // A TRANSIENT filesystem refusal is retried a BOUNDED number of times (TRANSIENT_WRITE_CODES): the merged
          // document is still in this instance's memory, so a retry can still land it. Every retry is counted and
          // logged, and the last attempt falls through to the named refusal below — a retry must never hide a failure.
          // R30 / task-17: this is now the FALLBACK layer (the store retries the same rename inside its own mutex and
          // reports give-up as VMU_STORE_FAILED); it stays so an injected store that surfaces a raw code still behaves.
          if (!TRANSIENT_WRITE_CODES.includes(code) || attempt >= 2) throw e
          attempt += 1
          shared.writeRetries += 1
          log('mailbox: transient ' + code + ' writing "' + MAILBOX_STORE_KEY + '" for ' + why +
            '; retry ' + attempt + '/' + 2)
          await new Promise((r) => setTimeout(r, 10 * attempt))
          continue
        }
        if (skipEnvelope) {
          shared.skippedEnvelope += 1
          record('shared-skip', { why, reason: 'the "' + MAILBOX_STORE_KEY + '" key holds a state projection envelope; its owner (resume) owns the shape, so this write declined by name' })
          return { ok: true, persisted: false, durable: true, key: MAILBOX_STORE_KEY, skipped: 'state-envelope',
            reason: 'the durable key holds a state projection envelope (kernel/resume.js) — its shape is not this face\'s to change' }
        }
        adoptRenames(renamedNow)                              // names stay consistent with what the store now holds
        if (Number.isFinite(mergedTop) && mergedTop > seq) seq = mergedTop
        if (renamedNow.length) record('shared-id-collision', { why, renamed: renamedNow })
        shared.pushes += 1
        shared.pushedEntries += entriesNow
        shared.droppedAcked += droppedNow
        shared.lastPushAt = clock()
        durable = true
        return { ok: true, persisted: true, durable: true, key: MAILBOX_STORE_KEY, seq, changed: !!(res && res.changed), renamed: renamedNow }
      }
    }).catch((e) => {
      queuedPush = null
      shared.writeRefused += 1
      const named = storeRefused('write "' + MAILBOX_STORE_KEY + '" for ' + why, e)
      durable = false
      return { ok: false, persisted: false, durable: false, code: named.code, message: named.message }
    })
    writeChain = run.then(() => undefined, () => undefined)
    queuedPush = run
    return run
  }


  const rejectInstants = (args, what) => {
    const keys = Object.keys(args || {}).filter((k) => INSTANT_KEY.test(String(k)) || INSTANT_NAMES.includes(String(k)))
    if (!keys.length) return
    note('VMU_INVALID_ARGUMENT')
    record('instant-refused', { what, keys })
    throw refuse('VMU_INVALID_ARGUMENT', 'a delivery timestamp is not the caller\'s to set: ' + what + ' does not accept ' + keys.join(', '),
      'the framework stamps `at` from the injected clock')
  }

  const mailbox = {
    /**
     * Queue one message for each named recipient. A group send is N queued entries with N ids (one per
     * recipient), which is what makes per-recipient acknowledgement meaningful.
     */
    /**
     * G7 (Round 8) — the SEND is committed through the SAME durable log the ballot face uses
     * (`createDurableCommitLog`, `kernel/ballot.js`): the INTENT is reserved before the body runs and the OUTCOME
     * right after it, so a crash in between is recoverable instead of a silently lost (or doubled) delivery.
     * No queue bound (`opts.durableQueue` absent) ⇒ the body runs unchanged and nothing pretends to be durable.
     */
    send(from, args = {}) {
      const q = durableQueue
      if (!q || q.durable !== true) return mailbox.sendBody(from, args)
      const rec = q.reserve({ kind: 'mailbox-send', from: String(from), to: args && args.to })
      try {
        const r = mailbox.sendBody(from, args)
        q.complete(rec, r && r.ok === false ? 'refused' : 'accepted')
        return r
      } catch (e) {
        q.complete(rec, 'refused')
        throw e
      }
    },
    sendBody(from, { to = null, text = '', kind = 'dm', replyTo = null, subject = null, urgent = false } = {}) {
      const who = String(from === undefined || from === null ? '' : from)
      // ★ ROUND 89: same wording fix as `kernel/chat.js` - the sender id reaches this service positionally from a tool
      // face whose parameter is `by`, so naming this function's own `from` sends an agent looking for a parameter it
      // cannot supply.
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'a message needs a non-empty sender id',
        'the tool face passes this as `by`: {"action":"send","by":"<member id>","text":"…"} - a message with no sender is not auditable')
      const body = String(text === undefined || text === null ? '' : text)
      if (!body.trim()) throw refuse('VMU_INVALID_ARGUMENT', 'a message needs non-empty text', 'pass { text }')
      // ★ task-11: pull BEFORE an id is minted, so `seq` accounts for mail another kernel already queued (a collision
      // is repairable, but not creating one is cheaper), and before the per-box cap is judged against stale counts.
      pullShared('send')
      rejectInstants({ replyTo }, 'send')
      const raw = to === null || to === undefined ? '' : to
      let targets = []
      if (Array.isArray(raw)) targets = raw.map(String).filter(Boolean)
      else if (String(raw) === '' ) targets = []
      else if (String(raw) === 'all' || String(raw) === 'voters') {
        if (typeof resolveAudience !== 'function') {
          note('VMU_ENGINE_UNAVAILABLE')
          record('send-refused', { from: who, reason: 'audience-seam-missing', to: String(raw) })
          return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', code: 'VMU_ENGINE_UNAVAILABLE',
            message: 'cannot resolve "' + String(raw) + '": no audience seam is bound',
            hint: 'inject { resolveAudience } — the kernel never guesses a roster (docs/11 §4.1)' }
        }
        targets = resolveAudience({ to: String(raw), from: who }) || []
        targets = (Array.isArray(targets) ? targets : []).map(String).filter(Boolean)
      } else targets = [String(raw)]
      if (!targets.length) {
        note('VMU_MAILBOX_NO_SUCH_RECIPIENT')
        record('send-refused', { from: who, reason: 'no-recipient', to: String(raw) })
        throw refuse('VMU_MAILBOX_NO_SUCH_RECIPIENT', 'no recipient: ' + JSON.stringify(raw),
          'pass a member id, an array of ids, or bind an audience seam for all/voters')
      }
      /**
       * G8 (Round 7) — SELF-MESSAGING. v5r refused it (`V5_SELF_MESSAGE`); this face used to accept a literal id
       * equal to the sender, which made "I told myself" a durable message no one else could act on (and, with an
       * audience seam returning the sender, a quiet loop). The audience seam is asked first when it exists —
       * `all`/`voters` are the seam's business — but a target equal to the sender is refused HERE, once, whatever
       * produced it. The code is the registered `VMU_INVALID_ARGUMENT`, and the RECORD carries `self-message` so
       * the refusal is greppable in the audit trail.
       */
      const selfAddressed = targets.filter((t) => t === who)
      if (selfAddressed.length) {
        note('VMU_INVALID_ARGUMENT')
        record('send-refused', { from: who, reason: 'self-message', to: String(raw) })
        throw refuse('VMU_INVALID_ARGUMENT', 'a message may not be addressed to its own sender: ' + who,
          'address another member, an array without yourself, or all/voters (which already exclude you)')
      }

      // A reply/quote anchor must still be LIVE: delivered bodies are gone, and quoting them would be a lie.
      let anchorRef = null
      if (replyTo !== null && replyTo !== undefined && String(replyTo) !== '') anchorRef = mailbox.anchor(replyTo).id

      const made = []
      const sub = subjectOf(body, subject)
      const isUrgent = urgent === true || urgentOf(kind)
      for (const t of targets) {
        const box = boxOf(t)
        if (box.length >= MAILBOX_BOX_CAP) {
          note('VMU_MAILBOX_CAP_REACHED')
          record('send-refused', { from: who, to: t, reason: 'box-cap', held: box.length, cap: MAILBOX_BOX_CAP })
          throw refuse('VMU_MAILBOX_CAP_REACHED',
            'the mailbox of ' + t + ' already holds ' + box.length + ' undelivered entries (cap ' + MAILBOX_BOX_CAP + ')',
            'deliver and acknowledge with flush(member), then retry — undelivered mail is never discarded for you')
        }
        seq += 1
        const entry = { id: 'ml-' + String(seq), seq, from: who, to: t, at: clock(), kind: String(kind || 'dm'),
          subject: sub.subject, subjectTruncated: sub.subjectTruncated, text: body, replyTo: anchorRef,
          urgent: isUrgent, read: false, todo: false, ackedAt: null }
        box.push(entry)
        made.push({ id: entry.id, to: t, urgent: entry.urgent })
      }
      record('sent', { from: who, ids: made.map((m) => m.id), to: targets, kind: String(kind || 'dm'), urgent: isUrgent })
      // ★ task-11: write through — the office's send is what the member's own kernel must be able to read. Fire and
      // forget BY DESIGN (the receipt is synchronous and the mail is already queued in memory); a failed write is
      // named in `status().shared` and in the audit trail instead of being pretended away.
      pushShared('send')
      return { ok: true, ids: made.map((m) => m.id), to: targets, delivered: 0, queued: made.length,
        urgent: isUrgent, subject: sub.subject, subjectTruncated: sub.subjectTruncated, enforced: ['vmu.mailbox.urgentKinds'] }
    },

    /** Pending = queued and NOT acked. `freshOnly` also excludes what a prompt already carried. */
    pending(member, { freshOnly = false } = {}) {
      // ★ task-11: THE read face that answered 0 in run 31 while the office held 2 — it now folds the shared key in
      // first. Every other read face (unread/boxes/deliverable/plan/flush) reaches the store through this one.
      pullShared('pending')
      const id = String(member)
      const box = boxes.get(id) || []
      const seen = injected.get(id) || new Set()
      const rows = box.filter((e) => !freshOnly || !seen.has(e.id))
      // RULE F: the comparator never sees NaN (which would make the order implementation-defined); an
      // uninterpretable arrival sorts LAST, deterministically.
      return rows.slice().sort((a, b) => {
        const ta = finiteStamp(a.at); const tb = finiteStamp(b.at)
        return (ta === null ? Number.POSITIVE_INFINITY : ta) - (tb === null ? Number.POSITIVE_INFINITY : tb)
      }).map((e) => clone(e))
    },

    /** Mark entries as "already put in a prompt" (the once-per-prompt rule). Idempotent. */
    markInjected(member, ids) {
      pullShared('markInjected')
      const id = String(member)
      const set = injected.get(id) || new Set()
      const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
      for (const x of list) set.add(x)
      injected.set(id, set)
      if (list.length) pushShared('markInjected')
      return { ok: true, member: id, marked: list.length, injected: set.size }
    },

    /** Drop the injection marks: called on EVERY concluded attempt, so a failed wake re-prepends. */
    clearInjected(member) {
      const id = String(member === undefined || member === null ? '' : member)
      if (id === '') {
        const had = [...injected.values()].reduce((a, s) => a + s.size, 0)
        injected.clear()
        if (had) pushShared('clearInjected')
        return { ok: true, cleared: 'all' }
      }
      const had = injected.get(id) ? injected.get(id).size : 0
      injected.delete(id)
      if (had) pushShared('clearInjected')
      return { ok: true, member: id, cleared: had }
    },

    /**
     * Deliver the PENDING NOTICE. ★ PHASE 9 / round 2:
     *   · non-urgent entries are announced (count/senders/subjects) with `entries: []` — the body never enters the
     *     prompt; they are marked injected (so the same notice is not repeated) but NOT acked: the body is still
     *     available through list/open until the member explicitly acks it;
     *   · urgent entries are the only ones whose body is put in the envelope, and only THEY are acked after a
     *     successful delivery (the old "ack everything" would delete the non-urgent body before the member could read it).
     * A transport that fails acks NOTHING and keeps everything redeliverable.
     */
    async flush(member, { send = null } = {}) {
      deliveryStats.flushCalls += 1
      const id = String(member === undefined || member === null ? '' : member)
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'flush needs a member id', 'pass { member }')
      const allPending = mailbox.pending(id)
      const fresh = mailbox.pending(id, { freshOnly: true })
      if (!allPending.length) {
        mailbox.clearInjected(id)
        return { ok: true, member: id, delivered: 0, acked: [], notified: 0, remaining: 0, reason: 'nothing-pending' }
      }
      if (!fresh.length) {
        return { ok: true, member: id, delivered: 0, acked: [], notified: 0, remaining: allPending.length,
          reason: 'already-notified', hint: 'list()/open() expose the bodies; ack() settles the delivery layer' }
      }
      const urgentRows = fresh.filter((e) => e.urgent)
      const plainRows = fresh.filter((e) => !e.urgent)
      const isUrgent = urgentRows.length > 0
      const tx = typeof send === 'function' ? send : deliver
      if (typeof tx !== 'function') {
        deliveryStats.noSeam += 1
        note('VMU_ENGINE_UNAVAILABLE')
        record('flush-refused', { member: id, reason: 'no-deliver-seam', pending: fresh.length })
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', code: 'VMU_ENGINE_UNAVAILABLE',
          message: 'cannot deliver to ' + id + ': no deliver seam is bound (' + fresh.length + ' entr(y/ies) still pending)',
          hint: 'inject { deliver } or pass { send } — a mail that was never sent is never acked' }
      }
      const allRows = fresh
      const senders = sendersOf(allRows)
      const subjects = allRows.slice(0, 4).map((e) => e.subject).filter(Boolean)
      let notice
      if (isUrgent) {
        notice = capNotice('【紧急｜对方希望尽快回复】' + urgentRows.length + ' 条留言：' +
          senders.join('、') + (subjects.length ? '｜' + subjects.join('；') : '') +
          (plainRows.length ? '（另有 ' + plainRows.length + ' 条非紧急，未展开）' : ''))
      } else {
        notice = capNotice('你收到 ' + allRows.length + ' 条新留言（来自 ' + senders.join('、') + '）。' +
          (subjects.length ? '标题：' + subjects.join('；') + '。' : '') +
          '不需要立即阅读，有空再看；用 vibe_vmu_mailbox 的 list 查看、open 打开。')
      }
      const envelope = {
        member: id,
        urgent: isUrgent,
        count: allRows.length,
        from: senders,
        kinds: [...new Set(allRows.map((e) => e.kind))],
        oldestAt: oldestAtOf(allRows),
        notice,
        entries: isUrgent ? urgentRows.map((e) => ({ id: e.id, from: e.from, at: e.at, kind: e.kind,
          subject: e.subject, text: e.text, replyTo: e.replyTo })) : [],
        at: clock(),
        timeoutMs: deliverTimeoutOf(),
      }
      // The BEFORE hook: a middleware may stop this delivery by name. A refusal acks NOTHING.
      const blocked = emitHook('mailbox/deliver-before', { member: id, count: allRows.length, urgent: isUrgent, notice }, { member: id })
      if (blocked && blocked.ok === false) {
        const code = (blocked.refused && blocked.refused.code) || blocked.code || 'VMU_MAILBOX_DELIVERY_FAILED'
        const msg = (blocked.refused && blocked.refused.message) || blocked.message || 'a middleware refused this delivery'
        note(code)
        record('flush-refused', { member: id, reason: 'middleware', code, pending: fresh.length })
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', code, message: msg, remaining: fresh.length,
          hint: 'the mailbox/deliver-before hook refused it; nothing was acknowledged (docs/05 §5)' }
      }
      let result
      try {
        result = await tx(envelope)
      } catch (e) {
        note('VMU_MAILBOX_DELIVERY_FAILED')
        record('flush-failed', { member: id, reason: 'transport-threw', error: String((e && e.message) || e), pending: fresh.length })
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', code: 'VMU_MAILBOX_DELIVERY_FAILED', message: 'delivery to ' + id + ' failed: ' + String((e && e.message) || e),
          remaining: fresh.length, hint: 'nothing was acknowledged: the same entries are still pending' }
      }
      if (result === false || (result && result.ok === false)) {
        note('VMU_MAILBOX_DELIVERY_FAILED')
        record('flush-failed', { member: id, reason: 'transport-refused', pending: fresh.length })
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', code: 'VMU_MAILBOX_DELIVERY_FAILED', message: 'the transport refused delivery to ' + id,
          remaining: fresh.length, hint: 'nothing was acknowledged: the same entries are still pending' }
      }
      // Success: only the URGENT bodies are settled by this delivery. Non-urgent entries stay readable until ack().
      deliveryStats.sent += 1
      deliveryStats.noticesBuilt += 1
      deliveryStats.urgentDelivered += urgentRows.length
      // ★ PHASE 9 / round 9 (UX): an URGENT body is DELIVERED IN THE PROMPT, not acked. The member's prompt says
      // "you received N messages"; if flush acked them the inbox would show 0 and the member correctly reports a
      // contradiction (measured: it spent two rounds looking). Keep the entry pending and mark it injected so it is
      // not repeated; `open()` still returns the body, and `ack()` remains the explicit settlement.
      const ackedIds = []
      if (allRows.length) mailbox.markInjected(id, allRows.map((e) => e.id))
      record('flushed', { member: id, acked: ackedIds.length, notified: allRows.length, urgent: isUrgent })
      emitHook('mailbox/delivered', { member: id, acked: ackedIds.length, notified: allRows.length, remaining: mailbox.pending(id).length, urgent: isUrgent }, { member: id })
      return { ok: true, member: id, delivered: urgentRows.length, acked: ackedIds, notified: allRows.length,
        remaining: mailbox.pending(id).length, urgent: isUrgent, notice, noticeLength: notice.length,
        entries: envelope.entries.length, timeoutMs: envelope.timeoutMs, enforced: ['vmu.mailbox.deliverTimeoutMs'] }
    },

    /**
     * Acknowledge entries: the body is DROPPED here and only the envelope stays. An unknown id is refused by
     * name (an ack for mail that does not exist is a defect, not a no-op).
     */
    ack(member, ids) {
      // ★ task-11: pull first, so the ack applies to the entry as the SHARED key holds it (an entry another kernel
      // just edited must not be acked from a stale copy); write through last, so the settlement is what keeps the
      // message from being re-delivered to this member by any kernel that pulls afterwards.
      pullShared('ack')
      const id = String(member)
      const box = boxOf(id)
      const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
      if (!list.length) throw refuse('VMU_INVALID_ARGUMENT', 'ack needs at least one entry id', 'pass ids from pending()')
      const ackedIds = []
      for (const wanted of list) {
        const i = box.findIndex((e) => e.id === wanted)
        if (i === -1) {
          const wasAcked = (acked.get(id) || []).some((a) => a.id === wanted)
          note('VMU_MAILBOX_ACK_UNKNOWN')
          record('ack-refused', { member: id, id: wanted, alreadyAcked: wasAcked })
          throw refuse('VMU_MAILBOX_ACK_UNKNOWN',
            wasAcked ? (wanted + ' was already acknowledged (its body is gone)') : ('no pending entry ' + wanted + ' for ' + id),
            'pending() lists what can still be acknowledged')
        }
        const e = box[i]
        e.ackedAt = clock()
        box.splice(i, 1)
        const ledger = acked.get(id) || []
        ledger.push({ id: e.id, from: e.from, at: e.at, kind: e.kind, subject: e.subject, read: e.read === true, todo: e.todo === true,
          ackedAt: e.ackedAt, bytes: bytesOf(e.text) })
        const cap = ackedCapOf()
        if (cap > 0 && ledger.length > cap) {
          const over = ledger.length - cap
          dropped.acked += over
          ledger.splice(0, over)
        }
        acked.set(id, ledger)
        ackedIds.push(e.id)
      }
      pushShared('ack')
      return { ok: true, member: id, acked: ackedIds, remaining: box.length, ackedLedger: (acked.get(id) || []).length, enforced: ['vmu.mailbox.ackedLedgerCap'] }
    },

    /**
     * ★ PHASE 9 / round 2: the LIST view. A row is EXACTLY {id, from, at, subject, kind, read, todo, bytes} — no body,
     * and listing never changes read state. `status` filters unread / todo / all. `ack` is the DELIVERY-layer settlement;
     * `read` is the MEMBER's reading state — they are deliberately different, and `ack` no longer implies read.
     */
    list(member, { status = 'all' } = {}) {
      pullShared('list')
      const id = String(member === undefined || member === null ? '' : member)
      const want = status === 'unread' || status === 'todo' ? status : 'all'
      const box = boxes.get(id) || []
      const rows = box.filter((e) => want === 'all' || (want === 'unread' ? e.read !== true : e.todo === true))
      const entries = rows.map(listRow)
      return { ok: true, member: id, status: want, count: entries.length, entries }
    },

    /** Open ONE entry by id: returns the body and marks read=true (the body is NOT removed; ack does that). */
    open(member, id) {
      // ★ task-11: a member opening mail it never queued is exactly the run-31 scenario, so pull first; and the
      // `read` flag is a SHARED fact (the office must be able to see that the member read it), so write it through
      // with a timestamp (`stateAt`) that lets a later un-read win the merge.
      pullShared('open')
      const mid = String(member === undefined || member === null ? '' : member)
      const entry = findEntry(mid, id)
      if (!entry) noSuchEntry(mid, id)
      entry.read = true
      entry.stateAt = stateStamp()
      record('opened', { member: mid, id: entry.id })
      pushShared('open')
      return { ok: true, member: mid, entry: openView(entry), read: true }
    },

    /** Change the per-entry READ/TODO state. Unknown id is a named refusal; at least one boolean is required. */
    setState(member, { id, read, todo } = {}) {
      pullShared('setState')
      const mid = String(member === undefined || member === null ? '' : member)
      if (id === undefined || id === null || String(id) === '') throw refuse('VMU_INVALID_ARGUMENT', 'setState needs an entry id', 'pass { id, read?, todo? }')
      if (typeof read !== 'boolean' && typeof todo !== 'boolean') {
        throw refuse('VMU_INVALID_ARGUMENT', 'setState needs read:boolean and/or todo:boolean', 'pass at least one explicit boolean')
      }
      const entry = findEntry(mid, id)
      if (!entry) noSuchEntry(mid, id)
      if (typeof read === 'boolean') entry.read = read
      if (typeof todo === 'boolean') entry.todo = todo
      entry.stateAt = stateStamp()
      record('entry-state', { member: mid, id: entry.id, read: entry.read === true, todo: entry.todo === true })
      pushShared('setState')
      return { ok: true, member: mid, id: entry.id, read: entry.read === true, todo: entry.todo === true }
    },

    /**
     * Resolve a quote anchor. LIVE mail resolves; delivered or unknown mail is a NAMED refusal — the body is
     * not retained, so pretending to quote it would fabricate evidence.
     */
    anchor(id) {
      pullShared('anchor')
      const want = String(id === undefined || id === null ? '' : id)
      for (const [, box] of boxes) {
        const hit = box.filter((e) => e.id === want)[0]
        if (hit) return clone(hit)
      }
      const ackedSomewhere = [...acked.values()].some((rows) => rows.some((r) => r.id === want))
      note('VMU_MAILBOX_ANCHOR_DANGLING')
      record('anchor-refused', { id: want, acked: ackedSomewhere })
      throw refuse('VMU_MAILBOX_ANCHOR_DANGLING',
        ackedSomewhere ? (want + ' was delivered and acknowledged: its body is no longer retained')
          : ('no such message: ' + (want || '(empty)')),
        'quote live mail only; use a durable record (library/minutes) for anything already delivered')
    },

    /** The v5r delivery decision: urgent kinds go now, plain chat waits for the digest window or the max. */
    deliverable(member) {
      deliveryStats.deliverableCalls += 1
      const id = String(member)
      const rows = mailbox.pending(id)
      if (!rows.length) return { ok: true, member: id, deliver: false, urgent: false, count: 0, reason: 'nothing-pending' }
      const urgent = rows.filter((e) => e.urgent)
      if (urgent.length) return { ok: true, member: id, deliver: true, urgent: true, count: rows.length, urgentCount: urgent.length,
        reason: 'urgent-kind', enforced: ['vmu.mailbox.urgentKinds'] }
      const max = digestMaxOf()
      const window = digestWindowOf()
      const oldest = oldestStamp(rows)
      const waitedMs = oldest === null ? 0 : nowMs() - oldest
      const due = (max > 0 && rows.length >= max) || (window > 0 && oldest !== null && (nowMs() - oldest) >= window)
      return { ok: true, member: id, deliver: due, urgent: false, count: rows.length,
        waitedMs, uninterpretableStamps, max, windowMs: window,
        reason: due ? (max > 0 && rows.length >= max ? 'digest-max' : 'digest-window') : 'not-due-yet',
        enforced: ['vmu.mailbox.digestMax', 'vmu.mailbox.digestWindowMs'] }
    },

    /**
     * Which members one scheduling pass may wake, urgent first, bounded by the budget. The deferred ones are
     * named WITH the reason (the plan never silently drops a member).
     */
    plan({ members = null, budget = null } = {}) {
      const b = budget === null || budget === undefined ? wakeBudgetOf() : Math.max(0, Math.floor(Number(budget) || 0))
      const ids = Array.isArray(members) && members.length ? members.map(String)
        : [...new Set([...boxes.keys()])].sort()
      const candidates = []
      for (const id of ids) {
        const d = mailbox.deliverable(id)
        if (d.deliver) candidates.push({ member: id, urgent: d.urgent, count: d.count, reason: d.reason })
      }
      candidates.sort((a, c) => (a.urgent === c.urgent ? 0 : (a.urgent ? -1 : 1)))
      const wake = candidates.slice(0, b)
      const deferred = candidates.slice(b).map((c) => ({ member: c.member, why: 'wake-budget', count: c.count }))
      for (const id of ids) if (!candidates.some((c) => c.member === id)) {
        const d = mailbox.deliverable(id)
        if (d.count > 0) deferred.push({ member: id, why: d.reason, count: d.count })
      }
      return { ok: true, budget: b, wake, deferred, enforced: ['vmu.mailbox.wakeBudget'] }
    },

    unread(member) {
      const id = String(member === undefined || member === null ? '' : member)
      if (id === '') {
        const per = Object.fromEntries([...boxes.keys()].map((k) => [k, mailbox.pending(k).length]))
        return { ok: true, total: Object.values(per).reduce((a, b) => a + b, 0), per }
      }
      return { ok: true, member: id, unread: mailbox.pending(id).length, injected: (injected.get(id) || new Set()).size }
    },

    boxes() {
      return Object.fromEntries([...boxes.keys()].sort().map((k) => [k, { pending: mailbox.pending(k).length, acked: (acked.get(k) || []).length }]))
    },

    /**
     * Durability is OPTIONAL and never faked: without a store the snapshot stays in memory and says so.
     * ★ task-11: this used to REPLACE the whole key with this instance's world (`patch(key, () => snap)`), which on a
     * shared key is a lost update — whatever another kernel queued since this one last read was erased. It now
     * delegates to the merge-based write-through, so `persist()` means "make the SHARED key hold everything either
     * side knows", and the public receipt keeps its old fields.
     */
    async persist() {
      const entries = Object.keys(mailbox.snapshot().data.boxes).length
      if (!storeReadable() || !storeWritable()) {
        durable = false
        return { ok: true, persisted: false, durable: false, reason: 'no store port is bound', entries }
      }
      const r = await pushShared('persist')
      if (r && r.ok === false) {
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', persisted: false, durable: false,
          code: r.code || 'VMU_STORE_FAILED', message: r.message || 'the durable write failed',
          hint: 'check the store root and its permissions, and that the store is OPEN (kernel.ready()); the mailbox keeps its state in memory and retries on the next access' }
      }
      return { ok: true, persisted: r.persisted !== false, durable: true, key: MAILBOX_STORE_KEY, seq,
        skipped: (r && r.skipped) || null }
    },

    /**
     * TWO CALLERS, ONE METHOD (projection seam + durable port):
     *   · `restore(snap)` — the `attachProjection` path (reader-a's v1 contract): hydrate from the GIVEN
     *     snapshot and return this face's own receipt;
     *   · `restore()` — the durable-port path: read the declared `'mailbox'` key from the injected store.
     * A missing store is a NAMED result (never a fake success), and the projection path never touches the store.
     */
    async restore(snap) {
      if (snap !== undefined && snap !== null) return mailbox.hydrate(snapshotValueOf(snap))
      if (!store || typeof store.read !== 'function') {
        return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', restored: false, durable: false, code: 'VMU_ENGINE_UNAVAILABLE',
          message: 'no store port is bound: the mailbox cannot be restored by key', hint: 'inject { store }, or pass a snapshot: restore(snap)' }
      }
      const fromStore = await store.read(MAILBOX_STORE_KEY)
      if (!fromStore) return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', restored: false, durable: true, code: 'VMU_NO_SUCH_OBJECT',
        message: 'the store holds no "' + MAILBOX_STORE_KEY + '" snapshot', hint: 'persist() first, or pass a snapshot: restore(snap)' }
      // ★ task-11: tolerant read — the key may hold the bare snapshot this face writes, or a `mode:'state'` projection
      // envelope (`kernel/resume.js`) that CONTAINS one. Both are readable; neither shape is rewritten by this call.
      return mailbox.hydrate(snapshotValueOf(fromStore))
    },

    /** The seam v5r-reader-a asked for: JSON-safe state, id counter at max+1, skipped items NAMED. */
    snapshot() {
      const data = { boxes: {}, acked: {}, injected: {} }
      for (const [k, v] of boxes) data.boxes[k] = clone(v)
      for (const [k, v] of acked) data.acked[k] = clone(v)
      for (const [k, v] of injected) data.injected[k] = [...v]
      const maxSeq = Math.max(0, ...[...boxes.values()].flat().map((e) => Number(e.seq) || Number(String(e.id).replace(/^ml-/, '')) || 0))
      return { apiVersion, face: 'mailbox', v: 1, at: clock(), counters: { seq: Math.max(seq, maxSeq) }, data,
        skipped: [{ what: 'deliver-seam', why: 'an injected seam is re-bound by the host, never serialised' },
          ...(store ? [] : [{ what: 'store-port', why: 'no durable port: the snapshot is memory-only' }])] }
    },

    /** Hydrate from a snapshot. Idempotent; the id counter only ever moves FORWARD. */
    hydrate(snap) {
      if (!snap || typeof snap !== 'object') return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', restored: false, code: 'VMU_INVALID_ARGUMENT', message: 'no snapshot to restore' }
      if (snap.face !== 'mailbox') return { ok: false, enforced: [], enforcedScope: 'evaluated-so-far', restored: false, code: 'VMU_INVALID_ARGUMENT', message: 'this snapshot is not a mailbox snapshot (face=' + String(snap.face) + ')' }
      const restored = []
      const skipped = []
      const data = snap.data || {}
      try {
        boxes.clear()
        for (const [k, rows] of Object.entries(data.boxes || {})) { boxes.set(String(k), clone(rows)); restored.push('boxes.' + k) }
        acked.clear()
        for (const [k, rows] of Object.entries(data.acked || {})) { acked.set(String(k), clone(rows)); restored.push('acked.' + k) }
        injected.clear()
        for (const [k, ids] of Object.entries(data.injected || {})) { injected.set(String(k), new Set((ids || []).map(String))); restored.push('injected.' + k) }
      } catch (e) {
        skipped.push({ what: 'data', why: 'hydration threw: ' + String((e && e.message) || e) })
      }
      const fromSnap = Number((snap.counters && snap.counters.seq) || 0)
      const maxSeq = Math.max(0, ...[...boxes.values()].flat().map((e) => Number(e.seq) || 0))
      const before = seq
      seq = Math.max(seq, fromSnap, maxSeq)          // names are immortal: the counter never goes backwards
      durable = !!(store && typeof store.patch === 'function')
      const dims = { ackedLedgerCap: ackedCapOf(), digestWindowMs: digestWindowOf(), digestMax: digestMaxOf(), wakeBudget: wakeBudgetOf() }
      return { ok: true, restored: true, restored_items: restored, seqBefore: before, seqAfter: seq,
        counters: { seq }, skipped: skipped.concat(snap.skipped || []), policy: dims, durable }
    },

    history() { return audit.map((a) => Object.assign({}, a)) },

    status() {
      // ★ task-11: `vibe_vmu_mailbox {action:'status'}` is a READ face, and in run 31 it was the command that reported
      // an empty mailbox to a member who had mail. It pulls like every other read face, and the pull's own health is
      // part of what it reports (`shared` below) — "no store bound", "store refused", "writes are queued" are answers,
      // not silence.
      pullShared('status')
      const per = mailbox.boxes()
      return { ok: true, apiVersion,
        boxes: per, members: Object.keys(per).length,
        pending: Object.values(per).reduce((a, b) => a + b.pending, 0),
        acked: Object.values(per).reduce((a, b) => a + b.acked, 0),
        seq, durable,
        // G7 self-report (Round 9): whether a durable commit log is bound is READABLE, never inferred.
        durableLog: { bound: !!(durableQueue && durableQueue.durable === true) },
        // ★ ROUND 31 / task-11: the shared-key health, so "is my mailbox the same one the office writes to?" is a
        // fact in the receipt instead of an inference from an empty list.
        shared: Object.assign(clone(shared), {
          key: MAILBOX_STORE_KEY, storeBound: storeWritable(), readable: storeReadable(),
          writeQueued: queuedPush !== null,
        }),
        policy: { digestWindowMs: digestWindowOf(), digestMax: digestMaxOf(), urgentKinds: urgentKindsOf(),
          ackedLedgerCap: ackedCapOf(), wakeBudget: wakeBudgetOf(), deliverTimeoutMs: deliverTimeoutOf(), boxCap: MAILBOX_BOX_CAP },
        mechanism: { hasDeliverSeam: typeof deliver === 'function', hasAudienceSeam: typeof resolveAudience === 'function',
          hasStore: !!(store && typeof store.patch === 'function'), clockInjected: true },
        delivery: Object.assign({}, deliveryStats),
        dropped: Object.assign({}, dropped), refusals: Object.fromEntries(refusals) }
    },

    keysUsed() {
      return { 'vmu.mailbox.digestWindowMs': true, 'vmu.mailbox.digestMax': true, 'vmu.mailbox.urgentKinds': true,
        'vmu.mailbox.ackedLedgerCap': true, 'vmu.mailbox.wakeBudget': true, 'vmu.mailbox.deliverTimeoutMs': true }
    },

    partition() {
      return { wired: WIRED_MAILBOX_KEYS.slice(), planned: PLANNED_MAILBOX_KEYS.map((x) => (Array.isArray(x) ? x[0] : x)), unwired: [] }
    },

    config() {
      return { digestWindowMs: digestWindowOf(), digestMax: digestMaxOf(), urgentKinds: urgentKindsOf(),
        ackedLedgerCap: ackedCapOf(), wakeBudget: wakeBudgetOf(), deliverTimeoutMs: deliverTimeoutOf() }
    },

    refusals: () => Object.fromEntries(refusals),
  }

  return mailbox
}

export default createMailbox
