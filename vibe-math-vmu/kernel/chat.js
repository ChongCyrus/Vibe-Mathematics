// vmu chat — the GROUP CHAT primitive (docs/08 §2, docs/17).
//
// WHAT THIS MODULE IS, AND WHAT IT REFUSES TO BE. A chat is where members talk; the kernel's job is to
// record what was said and to ENFORCE the room's declared rules as machine facts, never to invent them:
//   · WHO may speak is not decided here — a mute, a speech quota and a freeze are all enforced BY NAME,
//     and the values they come from are DECLARED (settings) or set through an audited hot change;
//   · the v5r line had NONE of this: its group chat was an append-only mirror with no admin, no speech
//     quota and no per-member mute (its only "mute" was the meeting-wide ballot freeze). D-08 baseline B
//     therefore asks the KERNEL for the primitive and the PACK for the policy;
//   · a REPLY TARGET is a first-class field (`replyTo`), resolved against the ledger: a dangling anchor is
//     refused by name instead of silently becoming an unthreaded message;
//   · the ballot freeze the v5r line derived ("an OPEN ballot freezes speech", R3/K12/B9) is consumed as an
//     INJECTED predicate (`isFrozen`), so this module stays compatible with `kernel/ballot.js` without
//     importing it — and the chair exemption is a predicate too (`freezeExempt`), never a hard-coded role;
//   · time is NEVER taken from the caller: an absolute mute end is written by the framework from the
//     injected clock, and a caller-supplied absolute instant (`...At`, `until`, `expires*`) is refused by
//     name (I-3, docs/01 §3.1). RELATIVE durations are the caller's to give and are named `...Ms` — those
//     are values, not instants, and are deliberately allowed.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Message kinds. `chat` is ordinary talk; `announce` is a room-wide notice (audited like any other). */
export const CHAT_KINDS = Object.freeze(['chat', 'announce'])

/** Per-message quote cap (a reminder to thread, not a wall: the full text is never copied). */
export const CHAT_QUOTE_MAX = 4

/** Every `vmu.chat.*` key this module reads (docs/04). */
export const CHAT_KEYS = Object.freeze([
  'vmu.chat.admins',
  'vmu.chat.speakQuota',
  'vmu.chat.speakQuotaWindowMs',
  'vmu.chat.muteDefaultMs',
  'vmu.chat.freezeExemptAdmins',
  'vmu.chat.historyCap',
])

/**
 * WIRED = read AND able to change an outcome. All six keys decide something here: the admin list decides who
 * may mute or set a quota, the quota decides whether a send is accepted, the window decides WHEN the counter
 * resets, the mute default sets how long a mute lasts, the freeze exemption decides whether an admin may
 * speak during a ballot freeze, and the cap decides counted drops. Nothing is declared-but-dead.
 */
export const WIRED_CHAT_KEYS = Object.freeze(CHAT_KEYS.slice())
export const PLANNED_CHAT_KEYS = Object.freeze([])

/**
 * Named refusal (codes are registered in docs/03 §8).
 *
 * EVERY refusal carries its evaluated scope (repo D3 discipline): `enforced[]` lists the settings keys this
 * decision REALLY read — an EMPTY array when it read none, never `undefined` — plus the `enforcedScope`
 * marker every other face uses. Without them a refusal is indistinguishable from "we evaluated nothing",
 * which is exactly the drift `tests/audit-enforced-consistency.test.mjs` rule ⑤ exists to catch.
 */
export function refuse(code, message, hint, enforced) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforced = Array.isArray(enforced) ? enforced.slice() : []
  err.enforcedScope = 'evaluated-so-far'
  return err
}

/** The instant normaliser is SHARED: a numeric OR ISO clock both work (kernel/timevalue.js). */
// `ms` is the LOOSE reader (NaN when uninterpretable) and `msStrict` is its named-refusal twin: the RULE F
// gate requires every loose call site to handle the NaN explicitly, and this module prefers the strict twin
// wherever a framework-owned or caller-supplied instant must be interpretable to continue.
import { ms as toMs, msStrict } from './timevalue.js'
import { CODE as RESUME_CODE } from './resume.js'

const INSTANT_KEY = /(At)$/i
const INSTANT_NAMES = Object.freeze(['until', 'expires', 'expiresAt', 'expiresOn', 'deadline', 'at'])
const clone = (v) => JSON.parse(JSON.stringify(v))

/**
 * `createChat({ clock, log, settings, isFrozen, freezeExempt, isAdmin })`.
 *
 * Every decision point is INJECTED or DECLARED; the defaults are conservative:
 *   · `isFrozen` defaults to "never frozen" (a kernel with no ballot has no freeze);
 *   · `freezeExempt` defaults to "admins may speak during a freeze" when `vmu.chat.freezeExemptAdmins` is
 *     true (the v5r chair-first rule, kept as a switch);
 *   · `isAdmin` defaults to the declared `vmu.chat.admins` list.
 */
export function createChat({
  clock = () => new Date(0).toISOString(),
  log = () => {},
  settings = {},
  bus = null,
  isFrozen = null,
  freezeExempt = null,
  isAdmin = null,
  // G1 (Round 7): the optional PRIVATE-MESSAGE seam `{ senderOf(id) }`. With it, `supplement()` verifies that the
  // signer really sent the private message; without it the record says `authorship:'claimed-unverified'` — the
  // face never pretends it verified something it could not.
  privateSender = null,
} = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createChat needs a clock function', 'pass { clock }')

  // ── settings access (a live view with .get() wins; a plain object also works) ────────────────────────
  const readKey = (k) => {
    if (settings && typeof settings.get === 'function') {
      const v = settings.get(k)
      if (v !== undefined) return v
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) return settings[k]
    const short = k.split('.').pop()
    const nested = (settings && (settings.chat || settings)) || {}
    if (nested && Object.prototype.hasOwnProperty.call(nested, short)) return nested[short]
    return undefined
  }
  const declaredNum = (k, d) => { const n = Number(readKey(k)); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d }
  const declaredBool = (k, d) => { const v = readKey(k); return v === undefined ? d : !!v }
  const declaredList = (k, d) => { const v = readKey(k); return Array.isArray(v) ? v.map(String) : d }

  // ── live state: ONE source for each tunable ─────────────────────────────────────────────────────────
  // `hot` holds a value only when this session changed it and the settings view offered no writer; with a
  // real settings view `setQuota`/`setPolicy` write the declared key instead, so the key stays the source.
  const hot = { speakQuota: undefined, speakQuotaWindowMs: undefined }
  const quotaOf = () => (hot.speakQuota !== undefined ? hot.speakQuota : declaredNum('vmu.chat.speakQuota', 0))
  const quotaWindowOf = () => (hot.speakQuotaWindowMs !== undefined ? hot.speakQuotaWindowMs : declaredNum('vmu.chat.speakQuotaWindowMs', 0))
  const muteDefaultOf = () => declaredNum('vmu.chat.muteDefaultMs', 0)
  const capOf = () => declaredNum('vmu.chat.historyCap', 200)
  const freezeExemptAdminsOn = () => declaredBool('vmu.chat.freezeExemptAdmins', true)

  const messages = []
  const audit = []
  const mutes = new Map()          // member -> { until, reason, by, at }
  const speaks = new Map()         // member -> [instant]
  const admins = new Set(declaredList('vmu.chat.admins', []))
  const dropped = { messages: 0, audit: 0, supplements: 0 }
  /**
   * G1 (Round 7) — THE SUPPLEMENT BOOK. v5r kept private messages OUT of the public face, and let the sender
   * bring one in deliberately with `supplement_of` + a `why`; the quote then resolved through the supplement
   * book with `viaSupplement`. That is a real need (a private agreement has to become citable WITHOUT the
   * framework leaking it), so it is implemented here rather than registered as missing:
   *   · the BODY IS NEVER COPIED (`body:'withheld'`) — the public face records `{of, by, at, why, publicRef}`;
   *   · only the SENDER may supplement (verified through the optional `privateSender` seam; without a seam the
   *     record says `authorship:'claimed-unverified'` instead of pretending it verified anything);
   *   · a reason is mandatory, the book is append-only (a second supplement of the same message is idempotent),
   *     and it is bounded by the DECLARED `vmu.chat.historyCap` with a drop counter.
   */
  const supplements = new Map()
  const refusals = new Map()
  let seq = 0
  let policyGen = 0

  /**
   * The framework owns the clock (kernel/clockguard.js), so an uninterpretable clock is a NAMED refusal that
   * carries what the seam returned — it is never coerced to 0, which would silently reset every window and
   * every mute expiry. `msStrict` already attaches `enforced: []` + `enforcedScope`.
   */
  const nowMs = () => msStrict(clock(), 'the injected clock')
  /**
   * The ONE hook helper. The bus takes a STRING topic FIRST and the scope as its third argument — an
   * object-shaped emit (`emit({type:'…'})`) is rejected by the bus and then swallowed by the caller's catch,
   * so such a broadcast never reaches anyone (measured in this repo: two lifecycle broadcasts were dead that
   * way). The registered names are `chat/send-before` (blockable), `chat/sent`, `chat/refused`.
   */
  const emitHook = (topic, payload, scope) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      // The topic LITERALS live here on purpose: the hook-coverage gate looks for `bus.emit('<name>'` in the
      // source, so a variable topic would register a producer that the gate cannot see (and could not name).
      if (topic === 'chat/send-before') return bus.emit('chat/send-before', payload, scope || {})
      if (topic === 'chat/sent') return bus.emit('chat/sent', payload, scope || {})
      if (topic === 'chat/refused') return bus.emit('chat/refused', payload, scope || {})
      return null
    } catch (e) { return null }
  }
  const note = (code, extra) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    emitHook('chat/refused', Object.assign({ code }, extra || {}), extra && extra.member ? { member: extra.member } : {})
    return code
  }

  const record = (what, detail, by) => {
    const row = Object.assign({ at: clock(), what }, detail)
    if (by !== undefined) row.by = by === null ? null : String(by)
    audit.push(row)
    const cap = capOf()
    if (cap > 0 && audit.length > cap) {
      const over = audit.length - cap
      dropped.audit += over
      audit.splice(0, over)
    }
    return row
  }

  /** The ONE place "who is an admin" is answered (declared list ∪ injected override). */
  const adminOf = (member) => {
    const id = member === null || member === undefined ? '' : String(member)
    if (!id) return false
    if (typeof isAdmin === 'function') return !!isAdmin({ member: id })
    return admins.has(id)
  }

  /** The freeze predicate, normalised: boolean, `{frozen}`, or ballot-style `{frozen, ballotId}`. */
  const frozenNow = () => {
    if (typeof isFrozen !== 'function') return { frozen: false, ballotId: null, reason: null }
    const v = isFrozen()
    if (v === true) return { frozen: true, ballotId: null, reason: 'frozen' }
    if (!v || v.frozen !== true) return { frozen: false, ballotId: null, reason: null }
    return { frozen: true, ballotId: v.ballotId === undefined ? null : v.ballotId, reason: v.reason || 'frozen' }
  }

  /**
   * An expiry that has passed is LIFTED, recorded ONCE, and never silently kept.
   *
   * An expiry that cannot be INTERPRETED is a third state, and it is handled by name: coercing it to 0 would
   * silently UNMUTE the member (the accepted failure mode is "stays muted, loudly"), so the mute is kept in
   * force and the fact is reported ONCE per record (audit row + `chat/refused` + the refusal reason itself).
   */
  const activeMute = (member) => {
    const m = mutes.get(String(member))
    if (!m) return null
    if (m.until > 0) {
      const untilMs = toMs(m.until)
      if (!Number.isFinite(untilMs)) {
        if (!m.uninterpretableExpiry) {
          m.uninterpretableExpiry = true
          note('VMU_INVALID_ARGUMENT', { member: String(member), stage: 'mute-expiry' })
          record('mute-uninterpretable', { member: String(member), until: m.until,
            reason: 'the mute expiry is not an interpretable instant: the mute STAYS IN FORCE (conservative) and must be lifted explicitly' })
        }
        return m
      }
      if (nowMs() >= untilMs) {
        mutes.delete(String(member))
        record('mute-expired', { member: String(member), until: m.until, reason: m.reason })
        return null
      }
    }
    return m
  }

  /** Accepted sends inside the window (window 0 = the whole session). */
  const usedOf = (member) => {
    const list = speaks.get(String(member)) || []
    const w = quotaWindowOf()
    if (w <= 0) return list.length
    const from = nowMs() - w
    // RULE F: the loose reader is guarded explicitly. Every stamp here was written from the SAME injected
    // clock `nowMs()` just validated, so a non-finite one cannot occur in practice; if one ever does, it does
    // not silently count as "inside the window" — it is excluded from the count, which is the conservative side.
    return list.filter((t) => { const at = toMs(t); return Number.isFinite(at) && at >= from }).length
  }

  /**
   * The admin gate. The BOOTSTRAP path (`source:'settings'|'framework'`) is the host/pack loading a declared
   * policy, and it must be asked for EXPLICITLY: a missing `by` is NOT a free pass, because the tool face
   * would otherwise let any caller mute or silence any member anonymously. A caller that omits both is
   * treated as an unnamed member and refused BY NAME.
   */
  /**
   * Which settings keys the ADMIN gate really read for this decision. An injected `isAdmin` seam replaces the
   * declared list entirely, so in that case the gate read NO settings key (and says so with an empty array).
   */
  const adminEnforced = () => (typeof isAdmin === 'function' ? [] : ['vmu.chat.admins'])

  /**
   * Which settings keys the FREEZE gate really read: the exemption switch, and — only when no `isAdmin` seam
   * replaced the admin lookup — the declared admin list. An injected `freezeExempt` predicate reads neither.
   */
  const freezeEnforced = () => {
    if (typeof freezeExempt === 'function') return []
    return ['vmu.chat.freezeExemptAdmins'].concat(typeof isAdmin === 'function' ? [] : ['vmu.chat.admins'])
  }

  const requireAdmin = (by, what, source) => {
    const src = (source === 'settings' || source === 'framework') ? String(source) : 'member'
    if (src === 'settings' || src === 'framework') {
      if (by !== null && by !== undefined && String(by) !== '') {
        throw refuse('VMU_INVALID_ARGUMENT', 'the ' + src + ' bootstrap path must not name an acting member',
          'pass by:null with source:"' + src + '", or act as a member (source:"member")', [])
      }
      return { bootstrap: true, source: src, enforced: [] }
    }
    if (by === null || by === undefined || String(by) === '') {
      note('VMU_CHAT_NOT_ADMIN')
      record('admin-refused', { actor: null, what, reason: 'no-acting-member', source: src })
      throw refuse('VMU_CHAT_NOT_ADMIN',
        'no acting member was named for ' + what + ': anonymous policy changes are refused',
        'pass by:"<member id>" (the actor is recorded), or use the settings bootstrap path explicitly',
        adminEnforced())
    }
    if (adminOf(by)) return { bootstrap: false, source: src, enforced: adminEnforced() }
    note('VMU_CHAT_NOT_ADMIN')
    record('admin-refused', { actor: String(by), what, source: src, admins: [...admins] })
    throw refuse('VMU_CHAT_NOT_ADMIN',
      String(by) + ' is not a chat admin: ' + what + ' is refused',
      'an admin can grant it (vibe_vmu_chat {action:"admin"}) or declare vmu.chat.admins',
      adminEnforced())
  }

  /** Refuse caller-supplied ABSOLUTE instants. Relative durations (`...Ms` values) stay the caller's. */
  const rejectInstants = (args, what) => {
    const keys = Object.keys(args || {}).filter((k) => INSTANT_KEY.test(String(k)) || INSTANT_NAMES.includes(String(k)))
    if (!keys.length) return
    note('VMU_INVALID_ARGUMENT')
    record('instant-refused', { what, keys })
    throw refuse('VMU_INVALID_ARGUMENT',
      'time is set by the framework: ' + what + ' does not accept an absolute instant (' + keys.join(', ') + ')',
      'pass a RELATIVE duration instead (durationMs / windowMs); the framework writes the instant')
  }

  const chat = {
    get policyGen() { return policyGen },

    /**
     * Speak. The order is the contract: a muted member hears "muted", a member over quota hears the quota
     * WITH its current value, and a frozen room hears WHICH ballot froze it. Every refusal is audited, and
     * NOTHING is appended on a refusal (a refused send is not a message — the v5r s8-freeze-say lesson).
     */
    send(from, text, { replyTo = null, quotes = [], kind = 'chat' } = {}) {
      const who = from === null || from === undefined ? '' : String(from)
      // ★ ROUND 89: THE REFUSAL NAMES THE PARAMETER THE CALLER ACTUALLY SUPPLIES. This said "a message needs a non-empty
      // `from`" - which is correct about THIS function's own parameter - but an agent only ever reaches it through the
      // tool face, whose parameter is `by`. A real run showed the consequence: the agent reported that `from` appears
      // nowhere in the tool's parameter table, which is true, and it had no way to act on the message. A refusal is
      // addressed to whoever must fix it, so it names their vocabulary and says which face it is on.
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'a message needs a non-empty sender id',
        'the tool face passes this as `by`: {"action":"send","by":"<member id>","text":"…"} - a message with no sender is not auditable')
      const body = String(text === undefined || text === null ? '' : text)
      if (!body.trim()) throw refuse('VMU_INVALID_ARGUMENT', 'a message needs non-empty text', 'pass { text }')
      const k = String(kind || 'chat')
      if (!CHAT_KINDS.includes(k)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown message kind: ' + k, 'one of ' + CHAT_KINDS.join(', '))

      // The BEFORE hook: a middleware may block this message by name. A refusal here means NOTHING is appended.
      const blocked = emitHook('chat/send-before', { member: who, text: body, kind: k }, { member: who })
      if (blocked && blocked.ok === false) {
        const code = (blocked.refused && blocked.refused.code) || blocked.code || 'VMU_NOT_PERMITTED'
        const msg = (blocked.refused && blocked.refused.message) || blocked.message || 'a middleware refused this message'
        note(code, { member: who, stage: 'send-before' })
        record('send-refused', { from: who, reason: 'middleware', code })
        throw refuse(code, msg, 'the chat/send-before hook refused it (docs/05 §5)')
      }

      const mute = activeMute(who)
      if (mute) {
        note('VMU_CHAT_MUTED', { member: who })
        record('send-refused', { from: who, reason: 'muted', until: mute.until, muteReason: mute.reason })
        throw refuse('VMU_CHAT_MUTED',
          who + ' is muted from the group chat' + (mute.until > 0 ? (' until ' + mute.until) : ' (no expiry)')
            + (mute.uninterpretableExpiry ? '【注意：该禁言的到期时刻不可解释 ⇒ 按"仍生效"处理，需显式解除】' : ''),
          'reason: ' + (mute.reason || '(none given)') + ' — an admin can unmute (vibe_vmu_chat {action:"unmute"})')
      }

      const limit = quotaOf()
      const used = usedOf(who)
      if (limit > 0 && used >= limit) {
        note('VMU_CHAT_QUOTA_EXCEEDED', { member: who })
        record('send-refused', { from: who, reason: 'quota', used, limit, windowMs: quotaWindowOf() })
        throw refuse('VMU_CHAT_QUOTA_EXCEEDED',
          who + ' reached the speech quota: ' + used + '/' + limit + (quotaWindowOf() > 0 ? (' per ' + quotaWindowOf() + 'ms window') : ' this session'),
          'raise vmu.chat.speakQuota (0 = unlimited) or set it with vibe_vmu_chat {action:"quota"}',
          ['vmu.chat.speakQuota'].concat(quotaWindowOf() > 0 ? ['vmu.chat.speakQuotaWindowMs'] : []))
      }

      const fr = frozenNow()
      if (fr.frozen) {
        const exempt = typeof freezeExempt === 'function'
          ? !!freezeExempt({ from: who, frozen: fr })
          : (freezeExemptAdminsOn() && adminOf(who))
        if (!exempt) {
          note('VMU_CHAT_FROZEN', { member: who })
          record('send-refused', { from: who, reason: 'frozen', ballotId: fr.ballotId })
          throw refuse('VMU_CHAT_FROZEN',
            'speech is frozen while ballot ' + String(fr.ballotId || '(unnamed)') + ' is open (R3/K12/B9)',
            'the freeze is DERIVED from an open ballot, never a timer: close the ballot, or speak after it settles',
            freezeEnforced())
        }
      }

      const target = (replyTo === null || replyTo === undefined || String(replyTo) === '') ? null : chat.anchor(replyTo)
      const list = Array.isArray(quotes) ? quotes : []
      if (list.length > CHAT_QUOTE_MAX) {
        note('VMU_INVALID_ARGUMENT')
        throw refuse('VMU_INVALID_ARGUMENT', 'at most ' + CHAT_QUOTE_MAX + ' quote(s) per message, got ' + list.length,
          'quote the few messages that matter; the full text is never copied')
      }
      const kept = list.map((q) => {
        const ref = typeof q === 'string' ? q : String((q && q.ref) || '')
        const anchored = chat.anchor(ref)                                  // dangling ⇒ named refusal
        return { ref: anchored.id, depth: Number((q && q.depth) || (anchored.depth || 0) + 1) }
      })

      seq += 1
      const row = { id: 'msg-' + String(seq), seq, from: who, at: clock(), text: body,
        replyTo: target ? target.id : null, quotes: kept, kind: k }
      messages.push(row)
      const cap = capOf()
      if (cap > 0 && messages.length > cap) {
        const over = messages.length - cap
        dropped.messages += over
        messages.splice(0, over)
        log('chat: history cap ' + cap + ' reached — dropped ' + over + ' message(s) (total ' + dropped.messages + ')')
      }
      const stamps = speaks.get(who) || []
      stamps.push(row.at)
      speaks.set(who, stamps)
      record('sent', { id: row.id, from: who, chars: body.length, replyTo: row.replyTo, kind: k })
      emitHook('chat/sent', { id: row.id, from: who, kind: k, replyTo: row.replyTo, chars: body.length }, { member: who })
      const enforced = []
      if (limit > 0) enforced.push('vmu.chat.speakQuota')
      if (quotaWindowOf() > 0) enforced.push('vmu.chat.speakQuotaWindowMs')
      if (fr.frozen && freezeExemptAdminsOn()) enforced.push('vmu.chat.freezeExemptAdmins')
      if (typeof isAdmin !== 'function') enforced.push('vmu.chat.admins')
      return { ok: true, id: row.id, seq, at: row.at, from: who, kind: k, replyTo: row.replyTo, quotes: clone(kept),
        quota: { used: used + 1, limit, remaining: limit > 0 ? Math.max(0, limit - used - 1) : null }, enforced }
    },

    /** Resolve a reply/quote anchor against the ledger. A dangling anchor is a NAMED refusal (never silent). */
    anchor(id) {
      const want = String(id === undefined || id === null ? '' : id)
      const hit = messages.filter((m) => m.id === want)[0]
      if (!hit) {
        note('VMU_CHAT_ANCHOR_DANGLING', { member: want })
        record('anchor-refused', { id: want })
        throw refuse('VMU_CHAT_ANCHOR_DANGLING', 'no such message: ' + (want || '(empty)'),
          'a reply must point at a message still in the ledger; list() shows the ids')
      }
      return clone(hit)
    },

    /** Read the ledger. `list` is the ONLY body reader (status/history never carry message text). */
    /**
     * G1: bring a PRIVATE message into the public record — the sender's own act, explained, body withheld.
     */
    supplement({ of = null, by = null, why = '', publicRef = null } = {}) {
      const ref = String(of === null || of === undefined ? '' : of).trim()
      const author = String(by === null || by === undefined ? '' : by).trim()
      const reason = String(why || '').trim()
      if (!ref) throw refuse('VMU_INVALID_ARGUMENT', 'supplement needs { of } (the private message id)', 'name the message being brought into the public record')
      if (!author) throw refuse('VMU_INVALID_ARGUMENT', 'supplement needs { by } (the message\'s own sender)', 'a supplement is the sender\'s own act: it must be signed')
      if (!reason) throw refuse('VMU_INVALID_ARGUMENT', 'supplement needs { why }', 'an unexplained supplement is exactly the leak this rule prevents')
      rejectInstants({ why }, 'supplement')
      const prior = supplements.get(ref) || null
      if (prior) return { ok: true, deduped: true, of: ref, supplement: Object.assign({}, prior), enforced: [] }
      let authorship = 'claimed-unverified'
      if (privateSender && typeof privateSender.senderOf === 'function') {
        let real = null
        try { real = privateSender.senderOf(ref) } catch (e) { real = null }
        if (real === undefined || real === null) {
          note('VMU_CHAT_ANCHOR_DANGLING', { member: author })
          throw refuse('VMU_CHAT_ANCHOR_DANGLING', 'no such private message: ' + ref,
            'the supplement must point at a message the private face can still resolve')
        }
        authorship = String(real) === author ? 'verified' : 'mismatch'
        if (authorship === 'mismatch') {
          note('VMU_NOT_PERMITTED', { member: author })
          throw refuse('VMU_NOT_PERMITTED', 'only the SENDER may supplement their own private message: ' + ref,
            'the sender is ' + String(real) + ', not ' + author)
        }
      }
      const cap = capOf()
      const rec = { of: ref, by: author, at: clock(), why: reason, authorship, body: 'withheld',
        publicRef: publicRef === null || publicRef === undefined ? null : String(publicRef) }
      supplements.set(ref, rec)
      while (supplements.size > cap) {
        const oldest = supplements.keys().next().value
        supplements.delete(oldest)
        dropped.supplements += 1
      }
      record('supplemented', { of: ref, by: author, why: reason, authorship, publicRef: rec.publicRef }, author)
      return { ok: true, of: ref, supplement: Object.assign({}, rec), bodyWithheld: true, authorship,
        enforced: ['vmu.chat.historyCap'] }
    },

    /** The supplement book, append-only, bodies never copied. */
    supplements() { return [...supplements.values()].map((s) => Object.assign({}, s)) },

    /** Resolve a citation THROUGH the supplement book (v5r's `viaSupplement`): the body stays withheld. */
    supplementOf(id) {
      const want = String(id === undefined || id === null ? '' : id)
      const hit = supplements.get(want) || null
      if (!hit) {
        note('VMU_CHAT_ANCHOR_DANGLING', { member: want })
        return { ok: false, code: 'VMU_CHAT_ANCHOR_DANGLING', of: want, enforced: [], enforcedScope: 'evaluated-so-far',
          message: 'no public supplement was recorded for ' + (want || '(empty)'),
          hint: 'a private message stays private until its sender supplements it with a why' }
      }
      return { ok: true, viaSupplement: true, bodyWithheld: true, supplement: Object.assign({}, hit), enforced: [] }
    },

    list({ limit = 50, member = null, since = null } = {}) {
      const n = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50
      let rows = messages.slice()
      if (member !== null && member !== undefined && String(member) !== '') rows = rows.filter((m) => m.from === String(member))
      // `since` is CALLER-supplied, so it goes through the STRICT reader: an uninterpretable instant is a
      // named refusal rather than a filter that silently matches nothing (RULE F / clockguard discipline).
      if (since !== null && since !== undefined && String(since) !== '') {
        const sinceMs = msStrict(since, 'list({ since })')
        rows = rows.filter((m) => { const at = toMs(m.at); return Number.isFinite(at) && at >= sinceMs })
      }
      const truncated = rows.length > n
      return { ok: true, total: messages.length, returned: Math.min(n, rows.length), truncated, dropped: dropped.messages, messages: clone(rows.slice(-n)) }
    },

    /** The declared policy AS ENFORCED (values, not intentions). */
    policy() {
      const fr = frozenNow()
      return { ok: true, policyGen, admins: [...admins], adminSeam: typeof isAdmin === 'function',
        speakQuota: quotaOf(), speakQuotaWindowMs: quotaWindowOf(), muteDefaultMs: muteDefaultOf(),
        freezeExemptAdmins: freezeExemptAdminsOn(), historyCap: capOf(),
        mutes: Object.fromEntries([...mutes.entries()].map(([m, v]) => [m, { until: v.until, reason: v.reason, by: v.by }])),
        frozen: fr.frozen, frozenBy: fr.ballotId, quoteMax: CHAT_QUOTE_MAX }
    },

    /**
     * Hot change. `by === null` is the framework/settings bootstrap path (audited as such); anyone else must
     * be an admin. The change is INSTANT and AUDITED — no restart, no silent write.
     */
    setPolicy(patch, { by = null, reason = '', source = null } = {}) {
      const p = patch || {}
      rejectInstants(p, 'setPolicy')
      const gate = requireAdmin(by, 'setPolicy', source)
      const applied = {}
      const enforced = []
      const unknown = []
      // EVERY policy key is consumed by its OWN branch below. There is deliberately no separate "allowed
      // list" a branch could forget to read: a declared-but-unconsumed enum member is the exact drift class
      // `tests/audit-enum-branches.mjs` is built to catch, so the declaration and the consumer are one thing.
      for (const k of Object.keys(p)) {
        if (k === 'admins') {
          if (!Array.isArray(p.admins)) throw refuse('VMU_INVALID_ARGUMENT', 'admins must be an array of member ids')
          admins.clear()
          for (const a of p.admins) admins.add(String(a))
          applied.admins = [...admins]
          enforced.push('vmu.chat.admins')
          continue
        }
        if (k === 'speakQuota' || k === 'speakQuotaWindowMs' || k === 'muteDefaultMs' || k === 'historyCap') {
          const v = Number(p[k])
          if (!Number.isFinite(v) || v < 0) throw refuse('VMU_INVALID_ARGUMENT', k + ' must be a number >= 0 (0 = unlimited/off)', 'got ' + JSON.stringify(p[k]))
          applied[k] = Math.floor(v)
          enforced.push('vmu.chat.' + k)
          writeThrough(k, Math.floor(v))
          continue
        }
        if (k === 'freezeExemptAdmins') {
          applied.freezeExemptAdmins = !!p.freezeExemptAdmins
          enforced.push('vmu.chat.freezeExemptAdmins')
          writeThrough('freezeExemptAdmins', !!p.freezeExemptAdmins)
          continue
        }
        unknown.push(k)
      }
      if (unknown.length) {
        note('VMU_INVALID_ARGUMENT')
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown chat policy key(s): ' + unknown.join(', '),
          'allowed: admins, speakQuota, speakQuotaWindowMs, muteDefaultMs, freezeExemptAdmins, historyCap')
      }
      policyGen += 1
      const row = record('policy-changed', { applied: clone(applied), reason: String(reason || ''), bootstrap: !!gate.bootstrap, policyGen }, by)
      return { ok: true, applied: clone(applied), at: row.at, by: by === null ? null : String(by), bootstrap: !!gate.bootstrap, policyGen, enforced: enforced.concat(gate.enforced) }
    },

    /** Mute one member. `durationMs` 0/undefined ⇒ `vmu.chat.muteDefaultMs`; still 0 ⇒ no expiry. */
    mute(member, { durationMs = null, reason = '', by = null, source = null } = {}) {
      const who = String(member === undefined || member === null ? '' : member)
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'mute needs a member id', 'pass { member }')
      rejectInstants({ reason }, 'mute')
      const gate = requireAdmin(by, 'mute', source)
      const asked = durationMs === null || durationMs === undefined ? null : Number(durationMs)
      if (asked !== null && (!Number.isFinite(asked) || asked < 0)) throw refuse('VMU_INVALID_ARGUMENT', 'durationMs must be a number >= 0', 'got ' + JSON.stringify(durationMs))
      const base = asked === null ? muteDefaultOf() : Math.floor(asked)
      const until = base > 0 ? nowMs() + base : 0
      mutes.set(who, { until, reason: String(reason || ''), by: by === null ? null : String(by), at: clock() })
      record('muted', { member: who, until, durationMs: base, reason: String(reason || ''), bootstrap: !!gate.bootstrap }, by)
      return { ok: true, member: who, until, durationMs: base, reason: String(reason || ''),
        enforced: gate.enforced.concat(asked === null ? ['vmu.chat.muteDefaultMs'] : []) }
    },

    unmute(member, { reason = '', by = null, source = null } = {}) {
      const who = String(member === undefined || member === null ? '' : member)
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'unmute needs a member id', 'pass { member }')
      const gate = requireAdmin(by, 'unmute', source)
      const had = mutes.get(who) || null
      mutes.delete(who)
      record('unmuted', { member: who, reason: String(reason || ''), had: had ? { until: had.until } : null, bootstrap: !!gate.bootstrap }, by)
      return { ok: true, member: who, wasMuted: !!had, enforced: gate.enforced }
    },

    /** Set the speech quota. 0 ⇒ unlimited, and the receipt SAYS so (an unlimited quota is a decision too). */
    setQuota(limit, { windowMs = null, by = null, reason = '', source = null } = {}) {
      const v = Number(limit)
      if (!Number.isFinite(v) || v < 0) throw refuse('VMU_INVALID_ARGUMENT', 'the quota must be a number >= 0 (0 = unlimited)', 'got ' + JSON.stringify(limit))
      const gate = requireAdmin(by, 'setQuota', source)
      const w = windowMs === null || windowMs === undefined ? quotaWindowOf() : Number(windowMs)
      if (!Number.isFinite(w) || w < 0) throw refuse('VMU_INVALID_ARGUMENT', 'windowMs must be a number >= 0', 'got ' + JSON.stringify(windowMs))
      writeThrough('speakQuota', Math.floor(v))
      if (windowMs !== null && windowMs !== undefined) writeThrough('speakQuotaWindowMs', Math.floor(w))
      policyGen += 1
      record('quota-changed', { limit: Math.floor(v), windowMs: Math.floor(w), unlimited: Math.floor(v) === 0, reason: String(reason || ''), bootstrap: !!gate.bootstrap }, by)
      return { ok: true, limit: Math.floor(v), windowMs: Math.floor(w), unlimited: Math.floor(v) === 0,
        enforced: gate.enforced.concat(['vmu.chat.speakQuota']).concat(windowMs !== null && windowMs !== undefined ? ['vmu.chat.speakQuotaWindowMs'] : []) }
    },

    grantAdmin(member, { by = null, source = null } = {}) {
      const who = String(member === undefined || member === null ? '' : member)
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'grantAdmin needs a member id')
      const gate = requireAdmin(by, 'grantAdmin', source)
      admins.add(who)
      policyGen += 1
      record('admin-granted', { member: who, bootstrap: !!gate.bootstrap }, by)
      return { ok: true, member: who, admins: [...admins], enforced: gate.enforced }
    },

    revokeAdmin(member, { by = null, source = null } = {}) {
      const who = String(member === undefined || member === null ? '' : member)
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'revokeAdmin needs a member id')
      const gate = requireAdmin(by, 'revokeAdmin', source)
      admins.delete(who)
      policyGen += 1
      record('admin-revoked', { member: who, bootstrap: !!gate.bootstrap }, by)
      return { ok: true, member: who, admins: [...admins], enforced: gate.enforced }
    },

    /** How much of the quota is left, and WHY that number (window 0 = the whole session). */
    quotaState(member) {
      const who = String(member === undefined || member === null ? '' : member)
      const limit = quotaOf()
      const used = usedOf(who)
      const w = quotaWindowOf()
      return { ok: true, member: who, limited: limit > 0, limit, used, remaining: limit > 0 ? Math.max(0, limit - used) : null,
        windowMs: w, resetEveryMs: w > 0 ? w : null,
        enforced: ['vmu.chat.speakQuota'].concat(w > 0 ? ['vmu.chat.speakQuotaWindowMs'] : []) }
    },

    speakCount(member) { return usedOf(String(member === undefined || member === null ? '' : member)) },

    /**
     * True when this member currently may speak (used by faces/packs before they even try). The refusals are
     * RETURNED rather than thrown, and they carry the same evaluated scope a thrown refusal does (D3).
     */
    maySpeak(member) {
      const who = String(member === undefined || member === null ? '' : member)
      const mute = activeMute(who)
      if (mute) return { ok: false, code: 'VMU_CHAT_MUTED', until: mute.until, reason: mute.reason, enforced: [], enforcedScope: 'evaluated-so-far' }
      const limit = quotaOf()
      const used = usedOf(who)
      if (limit > 0 && used >= limit) {
        return { ok: false, code: 'VMU_CHAT_QUOTA_EXCEEDED', used, limit,
          enforced: ['vmu.chat.speakQuota'].concat(quotaWindowOf() > 0 ? ['vmu.chat.speakQuotaWindowMs'] : []), enforcedScope: 'evaluated-so-far' }
      }
      const fr = frozenNow()
      if (fr.frozen) {
        const exempt = typeof freezeExempt === 'function' ? !!freezeExempt({ from: who, frozen: fr }) : (freezeExemptAdminsOn() && adminOf(who))
        if (!exempt) return { ok: false, code: 'VMU_CHAT_FROZEN', ballotId: fr.ballotId, enforced: freezeEnforced(), enforcedScope: 'evaluated-so-far' }
      }
      return { ok: true, used, limit, enforced: [], enforcedScope: 'evaluated-so-far' }
    },

    /** The full audit trail (append-only under the declared cap, with counted drops). */
    history() { return audit.map((a) => Object.assign({}, a)) },

    /**
     * PERSISTENCE SEAM v1 (kernel/resume.js interface, attached by `attachProjection`). What is captured is the
     * LEDGER, not the policy: `vmu.chat.admins`/`speakQuota`/`speakQuotaWindowMs`/`muteDefaultMs`/
     * `freezeExemptAdmins`/`historyCap` come from settings and are re-resolved on restore, so a snapshot can
     * never pin an old declaration over a newer configuration. The id counter travels as `counters.chat` (the
     * LAST used seq) and the reader keeps it monotonic ("names are immortal").
     *
     * Injected seams (`bus`, `clock`, `isFrozen`, `freezeExempt`, `isAdmin`) are re-bound by the host and are
     * therefore NOT listed as `skipped` (docs/07 §14): `skipped` is reserved for state this face cannot capture.
     */
    snapshot() {
      return { apiVersion, face: 'chat', v: 1, at: clock(),
        data: {
          messages: messages.map((m) => clone(m)),
          mutes: Object.fromEntries([...mutes.entries()].map(([k, v]) => [k, clone(v)])),
          speaks: Object.fromEntries([...speaks.entries()].map(([k, v]) => [k, v.slice()])),
          policyGen,
        },
        counters: { chat: seq },
        skipped: [] }
    },

    /**
     * Hydrate a `snapshot()`. Merge-safe while the ledger is EMPTY, idempotent on the same snapshot, and a NAMED
     * conflict otherwise — a half-overwritten chat would silently lose messages.
     */
    restore(snap) {
      if (!snap || typeof snap !== 'object') return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'no snapshot to restore', missing: ['snapshot'] }
      if (snap.face !== 'chat') return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'not a chat snapshot (face=' + String(snap.face) + ')' }
      if (Number(snap.v) !== 1) return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'unsupported snapshot version ' + String(snap.v), hint: 'this module speaks v1' }
      const d = snap.data
      const missing = ['messages', 'mutes', 'speaks'].filter((k) => !d || d[k] === undefined)
      if (missing.length) return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'snapshot is missing ' + missing.join(', '), missing }
      const same = JSON.stringify(d) === JSON.stringify(chat.snapshot().data)
      if (messages.length > 0 && !same) {
        return { ok: false, restored: false, code: RESUME_CODE.restoreConflict,
          message: 'this chat already holds ' + messages.length + ' message(s): refusing to half-overwrite them',
          hint: 'restore into a fresh chat, or restore the snapshot that matches the live ledger' }
      }
      messages.length = 0
      for (const m of (d.messages || [])) messages.push(clone(m))
      mutes.clear()
      for (const [k, v] of Object.entries(d.mutes || {})) mutes.set(k, clone(v))
      speaks.clear()
      for (const [k, v] of Object.entries(d.speaks || {})) speaks.set(k, (Array.isArray(v) ? v : []).slice())
      policyGen = Number(d.policyGen || 0) || 0
      const fromSnap = Number((snap.counters && snap.counters.chat) || 0)
      const maxSeq = messages.reduce((mx, m) => Math.max(mx, Number(m.seq) || Number(String(m.id || '').replace(/^msg-/, '')) || 0), 0)
      const before = seq
      seq = Math.max(seq, fromSnap, maxSeq)
      return { ok: true, restored: true, restored_items: ['messages', 'mutes', 'speaks'],
        seqBefore: before, seqAfter: seq, counters: { chat: seq }, skipped: (snap.skipped || []).slice() }
    },

    status() {
      const fr = frozenNow()
      return { ok: true, apiVersion, messages: messages.length, policyGen, admins: [...admins],
        speakQuota: quotaOf(), speakQuotaWindowMs: quotaWindowOf(), muteDefaultMs: muteDefaultOf(),
        freezeExemptAdmins: freezeExemptAdminsOn(), historyCap: capOf(), muted: [...mutes.keys()],
        frozen: fr.frozen, frozenBy: fr.ballotId,
        mechanism: { hasFrozenSeam: typeof isFrozen === 'function', hasFreezeExemptSeam: typeof freezeExempt === 'function',
          hasAdminSeam: typeof isAdmin === 'function', clockInjected: true, hotSource: typeof (settings && settings.set) === 'function' ? 'settings' : 'memory' },
        counts: { sends: messages.length, audit: audit.length, supplements: supplements.size },
        dropped: Object.assign({}, dropped), refusals: Object.fromEntries(refusals) }
    },

    keysUsed() {
      return { 'vmu.chat.admins': true, 'vmu.chat.speakQuota': true, 'vmu.chat.speakQuotaWindowMs': true,
        'vmu.chat.muteDefaultMs': true, 'vmu.chat.freezeExemptAdmins': true, 'vmu.chat.historyCap': true }
    },

    /** wired ∩ planned = ∅ and together they are exactly CHAT_KEYS (the mathtools standard). */
    partition() {
      return { wired: WIRED_CHAT_KEYS.slice(), planned: PLANNED_CHAT_KEYS.map((x) => (Array.isArray(x) ? x[0] : x)), unwired: [] }
    },

    config() {
      return { admins: [...admins], speakQuota: quotaOf(), speakQuotaWindowMs: quotaWindowOf(),
        muteDefaultMs: muteDefaultOf(), freezeExemptAdmins: freezeExemptAdminsOn(), historyCap: capOf() }
    },

    refusals: () => Object.fromEntries(refusals),
  }

  /**
   * The ONE writer for a tunable: the declared key when the settings view can write (the hot rail), else the
   * in-memory value. `hot` is the fallback for a plain-object settings (unit tests, zero-writer sessions).
   */
  function writeThrough(name, value) {
    if (settings && typeof settings.set === 'function') {
      try { settings.set('vmu.chat.' + name, value); return { hot: true } } catch (e) { /* fall through */ }
    }
    hot[name] = value
    return { hot: false }
  }

  return chat
}

export default createChat
