// vmu kernel · trust — auditable reputation: signals, decay, explanation, disputes.
// Design source: docs/17-agent-society-and-delegation.md §5 (S-3) / §17 / §21; keys: settings/planned.js vmu.trust.*
//   S-3 (hard): reputation NEVER grants authority — no votes, no seats, no delegation, no budget.
//   Every score must be explainable; a strong weight without evidence is downweighted AND self-disclosed;
//   truncation always reports how many were dropped; decay uses only the injected clock; read-only surfaces
//   never mutate; zero mechanism returns "no data" — never a fake 0.
export const apiVersion = 1

/** D3（第 26 轮）：拒绝**随证明同行** —— `enforcedScope:'evaluated-so-far'` 明写"到此为止"的已求值集合，
 *  而非该操作会读的完整集合 ⇒ 审计者不得把部分集当全集 ✓（照 records／meetings 已验收口径 ✓）。 */
export const ENFORCED_SCOPE = 'evaluated-so-far'

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  e.enforcedScope = ENFORCED_SCOPE
  return e
}

export const AUTHORITY_REFUSAL = 'VMU_TRUST_USE_FORBIDDEN'
export const DEFAULT_WEAK_CAP = 0.25
export const DEFAULT_MAX_SIGNALS = 500

export function createTrust({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createTrust needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const firstOf = (keys, def) => { for (const k of keys) { const v = sget(k, undefined); if (v !== undefined) return v } return def }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging must never break trust */ } } }

  const cfg = () => ({
    kinds: (() => { const k = sget('vmu.trust.kinds', null); return Array.isArray(k) ? k.slice() : null })(),
    weights: (() => { const w = sget('vmu.trust.weights', null); return w && typeof w === 'object' ? w : null })(),
    // INTEGRATOR RULING on the three alias pairs: ONE knob, ONE name. The volume's name wins (17 §20), so the
    // task's alternative spellings were removed rather than declared as a second knob the gate would demand.
    // Reading two names for one setting is the same defect as documenting two names: nobody can tell which is real.
    // task-217 RULING: `vmu.trust.halfLifeMs = 0` means **decay is OFF** (docs/04 declares `0` as the default
    // with the words "0＝不衰减"). A caller who sets 0 EXPLICITLY and a caller who sets nothing share the same
    // effective value (0 ⇒ no decay) but NOT the same source, and the module says which one it was: an explicit
    // 0 is `explicit`, an absent/invalid value is `default`. 0 is never treated as "missing" ✗.
    halfLife: (() => {
      const raw = sget('vmu.trust.halfLifeMs', undefined)
      if (raw === undefined || raw === null) return { ms: 0, source: 'default', decay: 'off' }
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) return { ms: n, source: 'explicit', decay: 'on' }
      return { ms: 0, source: 'explicit', decay: 'off' }
    })(),
    halfLifeMs: (() => { const raw = sget('vmu.trust.halfLifeMs', undefined); const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : 0 })(),
    halfLifeSource: (() => { const raw = sget('vmu.trust.halfLifeMs', undefined); return (raw === undefined || raw === null) ? 'default' : 'explicit' })(),
    minEvidenceForWeight: (() => { const v = sget('vmu.trust.evidenceRequired', null); return typeof v === 'number' ? v : (v === true ? 0.75 : null) })(),
    disputeWindowMs: (() => { const v = sget('vmu.trust.appealWindowMs', 0); return Number.isFinite(v) && v > 0 ? v : 0 })(),
    requireSource: sget('vmu.trust.requireSource', true) !== false,
    selfScoreAllowed: sget('vmu.trust.selfScoreAllowed', false) === true,
    maxSignalsPerSubject: (() => { const v = sget('vmu.trust.maxSignalsPerSubject', DEFAULT_MAX_SIGNALS); return Number.isInteger(v) && v > 0 ? v : DEFAULT_MAX_SIGNALS })(),
    aggregate: (() => { const a = sget('vmu.trust.aggregate', 'weighted'); return ['mean', 'weighted', 'median'].includes(a) ? a : 'weighted' })(),
    useInSelection: sget('vmu.trust.useInSelection', true) !== false,
    useInArbitration: sget('vmu.trust.useInArbitration', false) === true,
    useInAuction: sget('vmu.trust.useInAuction', false) === true,
  })

  const signals = []           // append-only: { id, subject, kind, weight, source, evidence, at, flags[] }
  const disputes = []          // append-only: { id, scoreId, subject, reason, at, status }
  let dropped = 0
  let seq = 0

  const forSubject = (subject) => signals.filter((s) => s.subject === subject)
  const decayedWeight = (s, at) => {
    const { halfLifeMs } = cfg()
    if (halfLifeMs <= 0) return s.weight   // 0 = decay OFF (vmu.trust.halfLifeMs, docs/04 §11); never a divide-by-zero
    const age = Math.max(0, at - s.at)
    return s.weight * Math.pow(0.5, age / halfLifeMs)
  }
  const aggregate = (pairs) => {
    const { aggregate: mode } = cfg()
    if (!pairs.length) return null
    if (mode === 'mean') return pairs.reduce((a, p) => a + p.w, 0) / pairs.length
    if (mode === 'median') { const v = pairs.map((p) => p.w).slice().sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
    const den = pairs.reduce((a, p) => a + Math.abs(p.w), 0)
    if (den === 0) return 0
    return pairs.reduce((a, p) => a + p.w * p.w, 0) / den   // weighted (self-weighted)
  }
  const compute = (subject, at) => {
    const list = forSubject(subject)
    const pairs = list.map((s) => ({ s, w: decayedWeight(s, at) }))
    const score = aggregate(pairs)
    return { list, pairs, score, hasData: list.length > 0, at }
  }

  return {
    apiVersion,

    /** Record one signal. Weight without evidence is DOWNWEIGHTED and self-disclosed (never silent). */
    signal({ subject, kind, weight = null, source = null, evidence = null } = {}) {
      if (typeof subject !== 'string' || !subject) throw refuse('VMU_INVALID_ARGUMENT', 'signal needs a non-empty subject', 'e.g. { subject: "m1", kind: "review", source: "m2" }')
      if (typeof kind !== 'string' || !kind) throw refuse('VMU_INVALID_ARGUMENT', 'signal needs a non-empty kind', 'kinds come from vmu.trust.kinds when configured')
      const c = cfg()
      if (c.kinds && !c.kinds.includes(kind)) throw refuse('VMU_TRUST_VOCAB_VIOLATION', 'kind not in the controlled vocabulary: ' + kind, 'allowed: ' + c.kinds.join(', '))
      if (c.requireSource && (typeof source !== 'string' || !source)) throw refuse('VMU_TRUST_EVIDENCE_REQUIRED', 'signal needs a source (vmu.trust.requireSource=true)', 'pass { source: "<member id>" }')
      if (source !== null && source === subject && !c.selfScoreAllowed) throw refuse('VMU_TRUST_SELF_SCORE', 'self-scoring is refused: ' + subject, 'ask another member to signal (vmu.trust.selfScoreAllowed=false)')

      let w = 1
      if (weight !== null) {
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1) throw refuse('VMU_INVALID_ARGUMENT', 'weight must be a number in [0,1] when given', 'omit it for the default 1')
        w = weight
      }
      if (c.weights && typeof c.weights[kind] === 'number') w = w * c.weights[kind]
      const flags = []
      const strong = c.minEvidenceForWeight === null ? 0.75 : c.minEvidenceForWeight
      const hasEvidence = Array.isArray(evidence) ? evidence.length > 0 : (typeof evidence === 'string' && evidence.length > 0)
      if (!hasEvidence && w >= strong) { w = Math.min(w, DEFAULT_WEAK_CAP); flags.push('downgraded:no-evidence') }

      const id = 'sig-' + (++seq)
      const rec = { id, subject, kind, weight: w, requestedWeight: weight === null ? 1 : weight, source: source || null, evidence: evidence || null, at: clock(), flags }
      signals.push(rec)

      const cap = c.maxSignalsPerSubject
      const mine = forSubject(subject)
      let droppedNow = 0
      if (mine.length > cap) {
        const excess = mine.length - cap
        const victims = mine.slice(0, excess).map((s) => s.id)
        for (const vid of victims) { const i = signals.findIndex((s) => s.id === vid); if (i >= 0) signals.splice(i, 1) }
        dropped += excess
        droppedNow = excess
      }
      say({ type: 'trust/signal', at: rec.at, subject, kind, weight: w, flags, dropped: droppedNow })
      if (bus && typeof bus.emit === 'function') { try { bus.emit({ type: 'trust/signal', at: rec.at, subject, kind }) } catch (e) { /* advisory */ } }
      return { ok: true, id, subject, weight: w, flags, dropped: droppedNow, truncated: droppedNow > 0, samples: forSubject(subject).length }
    },

    /** Read-only. Zero mechanism ⇒ score is null with hasData:false (NEVER a fake 0). */
    score({ subject } = {}) {
      if (typeof subject !== 'string' || !subject) throw refuse('VMU_INVALID_ARGUMENT', 'score needs a subject', 'e.g. { subject: "m1" }')
      const c = cfg()
      const r = compute(subject, clock())
      if (!r.hasData) return { ok: true, subject, score: null, hasData: false, reason: 'no-signals', samples: 0, aggregate: c.aggregate, halfLifeMs: c.halfLifeMs, halfLifeSource: c.halfLifeSource, decay: c.halfLifeMs > 0 ? 'on' : 'off', at: r.at }
      return { ok: true, subject, score: r.score, hasData: true, samples: r.list.length, aggregate: c.aggregate, halfLifeMs: c.halfLifeMs, halfLifeSource: c.halfLifeSource, decay: c.halfLifeMs > 0 ? 'on' : 'off', at: r.at }
    },

    /** Pure recomputation at `at` (default: now) — never mutates stored signals. */
    decay({ subject, at = null } = {}) {
      if (typeof subject !== 'string' || !subject) throw refuse('VMU_INVALID_ARGUMENT', 'decay needs a subject', 'e.g. { subject: "m1", at: <ms> }')
      const when = Number.isFinite(at) ? at : clock()
      if (Number.isFinite(at) && at < 0) throw refuse('VMU_INVALID_ARGUMENT', 'at must be a non-negative ms timestamp', 'omit it to use the clock')
      const c = cfg()
      const r = compute(subject, when)
      if (!r.hasData) return { ok: true, subject, score: null, hasData: false, reason: 'no-signals', halfLifeMs: c.halfLifeMs, halfLifeSource: c.halfLifeSource, decay: c.halfLifeMs > 0 ? 'on' : 'off', at: when }
      return { ok: true, subject, score: r.score, hasData: true, samples: r.list.length, halfLifeMs: c.halfLifeMs, halfLifeSource: c.halfLifeSource, decay: c.halfLifeMs > 0 ? 'on' : 'off', at: when, note: 'recomputation only: stored signals are unchanged' }
    },

    /** Read-only. Every score is explainable: constituents, weights, decay and flags. */
    explain({ subject } = {}) {
      if (typeof subject !== 'string' || !subject) throw refuse('VMU_INVALID_ARGUMENT', 'explain needs a subject', 'e.g. { subject: "m1" }')
      const c = cfg()
      const at = clock()
      const r = compute(subject, at)
      const parts = r.pairs.map((p) => ({
        id: p.s.id, kind: p.s.kind, source: p.s.source, at: p.s.at,
        weight: p.s.weight, decayedWeight: p.w, evidence: p.s.evidence, flags: p.s.flags.slice(),
      }))
      return {
        ok: true, subject, at, aggregate: c.aggregate, halfLifeMs: c.halfLifeMs, halfLifeSource: c.halfLifeSource, decay: c.halfLifeMs > 0 ? 'on' : 'off',
        hasData: r.hasData, score: r.score,
        noDataReason: r.hasData ? null : 'no-signals: the subject has no signals, so no score exists (this is not 0)',
        signals: parts, samples: parts.length,
        droppedFromCap: dropped,
        authorityRefusalCode: AUTHORITY_REFUSAL,
      }
    },

    /** Open a dispute against a computed score. Window is enforced with the injected clock. */
    dispute({ scoreId, reason } = {}) {
      if (typeof scoreId !== 'string' || !scoreId) throw refuse('VMU_INVALID_ARGUMENT', 'dispute needs a scoreId', 'use the subject id returned by score()/explain()')
      if (typeof reason !== 'string' || !reason) throw refuse('VMU_INVALID_ARGUMENT', 'dispute needs a reason', 'state what is wrong in one sentence')
      const c = cfg()
      const at = clock()
      const subj = typeof scoreId === 'string' ? scoreId : null
      const anchors = signals.filter((s) => s.subject === subj)
      if (c.disputeWindowMs > 0 && anchors.length) {
        const newest = anchors.reduce((a, s) => Math.max(a, s.at), 0)
        if (at - newest > c.disputeWindowMs) throw refuse('VMU_TRUST_APPEAL_WINDOW', 'the dispute window has closed for ' + scoreId, 'window=' + c.disputeWindowMs + 'ms; ask the office for an exception')
      }
      const id = 'disp-' + (++seq)
      disputes.push({ id, scoreId, subject: subj, reason, at, status: 'open' })
      say({ type: 'trust/dispute', at, scoreId, reason })
      return { ok: true, id, scoreId, status: 'open', at, open: disputes.filter((d) => d.status === 'open').length }
    },

    /** Read-only. */
    list() {
      const subjects = Array.from(new Set(signals.map((s) => s.subject)))
      const rows = subjects.map((s) => ({ subject: s, samples: forSubject(s).length, score: compute(s, clock()).score }))
      rows.sort((a, b) => (a.subject < b.subject ? -1 : 1))
      return { ok: true, subjects: rows, signals: signals.length, disputes: disputes.length, droppedFromCap: dropped }
    },

    /** Read-only self-disclosure: reputation does NOT grant authority (S-3). */
    status() {
      const c = cfg()
      return {
        ok: true,
        subjects: new Set(signals.map((s) => s.subject)).size,
        signals: signals.length,
        disputes: disputes.length,
        openDisputes: disputes.filter((d) => d.status === 'open').length,
        droppedFromCap: dropped,
        vocab: c.kinds,
        aggregate: c.aggregate,
        halfLifeMs: c.halfLifeMs,
        disputeWindowMs: c.disputeWindowMs,
        requireSource: c.requireSource,
        selfScoreAllowed: c.selfScoreAllowed,
        maxSignalsPerSubject: c.maxSignalsPerSubject,
        reputationGrantsAuthority: false,
        authorityRefusalCode: AUTHORITY_REFUSAL,
        selfDisclosure: '声誉不授权：不得进入票权、席位、委托或预算（S-3）',
        allowedUses: { selection: c.useInSelection, arbitration: c.useInArbitration, auction: c.useInAuction },
        forbiddenUses: ['vote', 'seat', 'delegation', 'budget'],
        at: clock(),
      }
    },

    /** S-3: ALWAYS refuses — reputation can never be turned into authority. */
    authorityFrom() {
      throw refuse(AUTHORITY_REFUSAL, 'reputation never grants authority: no vote, no seat, no delegation, no budget (S-3)', 'authority comes from the charter/seat rules, not from a score')
    },
  }
}
