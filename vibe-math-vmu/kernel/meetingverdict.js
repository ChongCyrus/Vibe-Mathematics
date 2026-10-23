// vmu meetings — THE FINAL RULING (phase 12 / D15): what a DEBATE ends at, and what the proposition's holder is told.
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────────────────────────
// THE RULE (verbatim, phase 12): 待辩论会议结束，v5r框架请刚刚各个辩论的各个成员给出最终裁决「布尔概率（[0,1]），理由」，
// 若它们给出的布尔概率全部一致为 1（或一致为 0）则最终该命题的布尔概率为 1（或 0），否则取平均值。并发通知告诉该命题卡的
// 持有者「由于…，该命题最终布尔概率裁定为…，故请把相应命题卡的布尔概率改为该概率值」。
// MEASURED BEFORE THIS MODULE EXISTED: the institute had the single-member halves only — `vibe_v5_verdict` (which casts
// into `kernel/liveBallot`) and `kernel/ballot.js`'s `defaultTally` (booleans in, a boolean outcome out) — and NOTHING
// turned a set of per-member [0,1] rulings into the one number the proposition card carries, and nothing produced the
// notice that tells the card's holder to change it. That is two named holes, not a wording problem: a pack could compute
// a mean in its own middleware, but then "all agree ⇒ 1/0, otherwise the mean" would live in policy code no gate can
// check, and every pack would re-implement it with a different float rule.
//
// ── THE BOUNDARY (one-way; a change on the wrong side is a bug) ───────────────────────────────────────────────────
//   · THIS MODULE OWNS THE ARITHMETIC AND THE EVIDENCE: validating the verdict set, deciding UNANIMOUS vs MEAN, the value
//     that is actually written (and the float evidence for it), and the machine-readable notice payload.
//   · IT DOES NOT OWN: who debates, when a debate ends, which members are eligible, who owns a proposition card, which
//     wording a given language uses (`template` is injectable), or DELIVERY — the payload is handed to the EXISTING
//     mailbox/message face (`vmu.mailbox`); this module opens no second communications channel.
//   · IT READS NO SETTING. The rule above is the pack's rule, and the kernel is not the place to declare a threshold for
//     it; `keys: []` is therefore the honest answer on every receipt (a new key would need a declared consumer, docs and
//     a schema row — none of which this capability requires to be useful).
// ⇒ "what a set of verdicts MEANS" changes here; "who is asked, and when" changes in the pack or `kernel/meetings.js`.
//
// ★ NEVER INVENT A RULING (this project's oldest rule, applied to arithmetic):
//   · an EMPTY set is refused by name — the mean of nothing is not 0, and "nobody voted" must not read as "unanimous 0";
//   · a bare number WITHOUT a reason is refused — the rule asks for `布尔概率, 理由`, so a row lacking the reason is not a
//     final ruling;
//   · the WRITTEN value is rounded to `VERDICT_PRECISION` decimal places and BOTH numbers travel (`exact` + `rounded` +
//     `valueSource`), because `0.30000000000000004` must never be the number told to a card's holder as "the ruling".
//   · the SAME question asked twice answers the same way: aggregation is a pure function of the rows, so a retry cannot
//     produce a different mean (no clock, no randomness, no order dependence beyond the row order it reports).
//   · ONE BUCKET, ONE PROPOSITION (the 「票→动议」 discipline): a row MAY name its proposition (`propositionId`); when rows
//     name one, the set must be about ONE id and `rulePropositionProbability` refuses verdicts that name another card.
//     A mean over two propositions is arithmetically valid and MEANINGLESS — the worst kind of wrong number, so it is a
//     named refusal rather than a guess. Unlabelled rows stay legal (a pure calculation); a PARTIALLY labelled set is
//     refused, because nothing can show which bucket the unlabelled rows belong to.

/** Public-interface version of this module's surface (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * HOW MANY DECIMAL PLACES the value that is WRITTEN carries. Six is a DECLARATION, not a discovery: a boolean probability
 * is a report about belief, so more places would imply a precision the input never had, while fewer (say two) would move
 * a genuine consensus of 0.999 to 1.00 and hand a card a decision it was not given. The exact mean still travels.
 */
export const VERDICT_PRECISION = 6

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  if (extra && typeof extra === 'object') Object.assign(err, extra)
  return err
}

/** A value as it must appear INSIDE a refusal message: never `[object Object]`, never `undefined` spelled as "null". */
const shown = (v) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'function') return '[function]'
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s } catch (e) { return String(v) }
}

/** The rounding the WRITTEN value uses. `Number(...toFixed(n))` also normalises `-0` to `0`. */
const roundTo = (x, places) => Number(Number(x).toFixed(places))

/**
 * THE AGGREGATION, as a pure function of the rows — no clock, no settings, no state.
 *
 * `aggregateVerdicts({ verdicts, propositionId, at })` ⇒
 * `{ ok, mode, proposition, value, exact, rounded, precision, valueSource, decided, enforceable, estimate, n, perMember, spread, at, keys }`.
 *
 * `propositionId` is the bucket: the target this ruling is about. A row may also carry its own (`propositionId`, or the
 * reading alias `proposition`) and then every row must agree with every other and with the argument — otherwise it is a
 * named refusal (see the header). `proposition` in the result is the resolved bucket, or `null` for a bare calculation.
 *
 * `mode`:
 *   · `'unanimous'` — every member said 1 (⇒ 1) or every member said 0 (⇒ 0). This is the ONLY branch that produces a
 *     DECISION, and `decided`/`enforceable` say so: the card is being told a truth value the members already agree on.
 *   · `'mean'` — anything else, INCLUDING twelve members who all said 0.5: the rule's word is 「否则取平均值」, and a value
 *     in (0,1) is an ESTIMATE, not a decision. `estimate:true` and the notice say so, so nobody can read "the mean was 0.5"
 *     as "the institute decided the proposition is half true".
 */
export function aggregateVerdicts({ verdicts, propositionId = null, at = null } = {}) {
  if (!Array.isArray(verdicts)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'aggregateVerdicts needs { verdicts: [...] }, got ' + shown(verdicts),
      'each row is { member, p, reason }: the debating members\' final boolean probability and its reason')
  }
  if (verdicts.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'there is no ruling to aggregate: the verdict set is empty',
      'an empty set is not a ruling of 0 — ask the members for their final verdicts instead of inventing one')
  }
  const seen = new Set()
  const rows = []
  verdicts.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'verdict row ' + i + ' is not an object: ' + shown(row),
        'each row is { member, p, reason }')
    }
    const member = typeof row.member === 'string' ? row.member.trim() : ''
    if (!member) {
      throw refuse('VMU_INVALID_ARGUMENT', 'verdict row ' + i + ' names no member',
        'every final verdict must say WHICH member gave it (member: a non-empty string)', { index: i })
    }
    if (seen.has(member)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'member "' + member + '" gave more than one final verdict',
        'one member, one final ruling: fold the rows into one before aggregating (a member is not a weight multiplier)',
        { member })
    }
    seen.add(member)
    const p = row.p
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the final verdict from member "' + member + '" has no usable boolean probability (p=' + shown(p) + ')',
        'p must be a FINITE NUMBER in [0,1], the member\'s boolean probability — not a string like "0.8" and not NaN',
        { member, p: p === undefined ? null : p })
    }
    if (p < 0 || p > 1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the final verdict from member "' + member + '" is outside [0,1] (p=' + String(p) + ')',
        'a boolean probability lives in the closed interval [0,1]; percentages (80) are not accepted', { member, p })
    }
    const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
    if (!reason) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the final verdict from member "' + member + '" carries no reason',
        'the rule asks for 「布尔概率, 理由」: a bare number is not a final ruling — ask that member for the reason',
        { member, p })
    }
    const propRaw = row.propositionId !== undefined ? row.propositionId : row.proposition
    let rowProp = null
    if (propRaw !== undefined && propRaw !== null) {
      if (typeof propRaw !== 'string' || propRaw.trim() === '') {
        throw refuse('VMU_INVALID_ARGUMENT', 'the final verdict from member "' + member + '" names its proposition with ' + shown(propRaw) +
          ' — a row\'s propositionId must be a non-empty string (the card id), or omitted; a non-string id cannot be compared',
          'a row\'s propositionId must be a non-empty string (the card id), or omitted — a non-string id cannot be compared',
          { member, propositionId: propRaw === undefined ? null : propRaw })
      }
      rowProp = propRaw.trim()
    }
    rows.push({ member, p, reason, proposition: rowProp })
  })

  // ★ ONE BUCKET, ONE PROPOSITION (the 「票→动议」 discipline applied to verdicts). A mean over verdicts about two
  // different propositions is a SILENT WRONG NUMBER: each row is individually valid, the arithmetic is valid, and the
  // answer names neither proposition correctly. So a row MAY name its proposition (`propositionId`, or `proposition`
  // as a reading alias); when it does, the whole set must be about ONE id, and a ruling for a given id refuses a set
  // that names another. Rows that name nothing stay legal (a bare calculation), but a PARTIAL bucket — some rows
  // named, some not — is refused: there is no honest way to tell whether the unnamed rows belong to that bucket.
  const namedRows = rows.filter((r) => r.proposition !== null)
  const resolved = (() => {
    const arg = propositionId === null || propositionId === undefined
      ? null
      : (typeof propositionId === 'string' ? propositionId.trim() : '')
    if (propositionId !== null && propositionId !== undefined && !arg) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the ruling target `propositionId` must be a non-empty string, got ' + shown(propositionId),
        'pass the proposition card id this ruling is about, or omit it for a pure calculation')
    }
    if (namedRows.length > 0 && namedRows.length < rows.length) {
      const missing = rows.filter((r) => r.proposition === null).map((r) => r.member)
      throw refuse('VMU_INVALID_ARGUMENT',
        'only some verdicts name the proposition they are about (named: ' + namedRows.map((r) => r.member + '=' + r.proposition).join(', ') +
        '; unnamed: ' + missing.join(', ') + ')',
        'give EVERY row its propositionId (or none): a partially labelled set cannot be shown to be one bucket, and aggregating across buckets is a silent wrong number',
        { named: namedRows.map((r) => r.member), unnamed: missing })
    }
    const distinct = [...new Set(namedRows.map((r) => r.proposition))]
    if (distinct.length > 1) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'the verdicts are about more than one proposition (' + distinct.map((d) => d + ' ← ' +
          namedRows.filter((r) => r.proposition === d).map((r) => r.member).join('/')).join('; ') + ')',
        'one ruling per proposition: split the set by propositionId and rule each one separately (a mean over two propositions is a number about nothing)',
        { propositions: distinct })
    }
    const said = distinct.length === 1 ? distinct[0] : null
    if (arg && said && arg !== said) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'the verdicts are about proposition "' + said + '", but the ruling asked for is about "' + arg + '"',
        'refusing rather than ruling the wrong card: pass the verdicts for "' + arg + '" (or correct the target)',
        { target: arg, verdictsAbout: said })
    }
    return arg || said
  })()

  const ps = rows.map((r) => r.p)
  const allOne = ps.every((p) => p === 1)
  const allZero = ps.every((p) => p === 0)
  const mode = allOne || allZero ? 'unanimous' : 'mean'
  // The mean is computed in ONE pass over the rows as given; `exact` is what arithmetic says, `rounded` is what is
  // written. `Math.min/max` are reported too, so "0 and 1 over two members" is distinguishable from "0.5 and 0.5".
  const exact = mode === 'unanimous' ? (allOne ? 1 : 0) : ps.reduce((s, p) => s + p, 0) / ps.length
  const rounded = roundTo(exact, VERDICT_PRECISION)
  const value = mode === 'unanimous' ? exact : rounded
  const decided = mode === 'unanimous'
  return {
    ok: true,
    mode,
    // The bucket this ruling belongs to: the caller's target, or the one the verdicts themselves name, or `null`
    // (a pure calculation over unlabelled rows). Never guessed from the members.
    proposition: resolved,
    value,
    exact,
    rounded,
    precision: VERDICT_PRECISION,
    valueSource: value === exact ? 'exact' : 'rounded',
    decided,
    enforceable: decided,
    estimate: !decided,
    n: rows.length,
    perMember: rows.map((r) => ({ member: r.member, p: r.p, reason: r.reason, proposition: r.proposition })),
    spread: { min: Math.min(...ps), max: Math.max(...ps) },
    at,
    keys: [],
    note: decided
      ? 'every member gave the same ' + String(value) + ', so the ruling IS that value (unanimous; ' + rows.length + ' member(s))'
      : 'the members did not agree (' + ps.map(String).join(', ') + '), so the ruling is the ARITHMETIC MEAN ' + String(value) +
        (value === exact ? '' : ' (exact ' + String(exact) + ', written to ' + VERDICT_PRECISION + ' places)') +
        ' — an ESTIMATE, not a decision: no member asserted the proposition at that probability',
  }
}

/**
 * THE NOTICE TEXT, rendered from a template both sides can read. Placeholders that a template does not know are LEFT
 * VISIBLE (`{unknown}` stays `{unknown}`) rather than silently emptied — a notice is read by a human/fellow agent, and a
 * blank where a number should be is exactly the silent failure this project refuses.
 *
 * The default is the RULE'S OWN wording (Chinese, because the rule is quoted in it); a pack that runs another language
 * passes its own `template` — the kernel does not decide language, it decides that the four facts survive into the text:
 * why the value is what it is, what the value is, whose card it is, and what to do with it.
 */
export const DEFAULT_RULING_TEMPLATE = {
  unanimous: '由于参与辩论的 {n} 名成员给出的最终裁决全部一致（布尔概率 {value}），命题 {proposition} 的最终布尔概率裁定为 {value}，故请把相应命题卡的布尔概率改为 {value}。',
  mean: '由于参与辩论的 {n} 名成员给出的最终裁决未全部一致（依次为 {list}），依规则取平均值后命题 {proposition} 的最终布尔概率裁定为 {value}，故请把相应命题卡的布尔概率改为 {value}。{caveat}',
}

/** The facts a template may name, and — for a caller — the full list rather than a guess. */
// ★ R8 OF THE PHASE-12 LIVE RUN: `caveat` is a field like the others (a template may place it) and is EMPTY for a
// unanimous ruling, so a caller that does not use it sees no change. It exists because the mean template used to be an
// imperative - "请把命题卡的布尔概率改为 0.6" - while the same receipt said `decided:false, estimate:true`. The
// receipt was honest and the SENTENCE was not: the card holder reads the notice, not the JSON.
export const TEMPLATE_FIELDS = Object.freeze(['proposition', 'owner', 'n', 'value', 'exact', 'mode', 'list', 'reasons', 'caveat'])

const fill = (template, fields) => String(template).replace(/\{(\w+)\}/g, (whole, k) =>
  (Object.prototype.hasOwnProperty.call(fields, k) ? String(fields[k]) : whole))

/**
 * ONE PROPOSITION, ONE RULING, ONE NOTICE PAYLOAD.
 *
 * `rulePropositionProbability({ verdicts, propositionId, owner, at, template })` ⇒ the aggregation PLUS
 * `notice: { to, about, kind, suggestedChannel, mode, value, exact, decided, enforceable, estimate, n, perMember, text }`.
 *
 * The payload is MACHINE-READABLE on purpose (owner / proposition / value / mode / per-member) so the existing message
 * face does not have to parse prose. It is NOT sent here: `delivery.attempted === false` says that plainly, and the note
 * names the face to hand it to. A caller that wants delivery binds the assembly's `send` port (the module's
 * `createMeetingVerdict({ send })`), which is the existing mailbox/message face — not a second channel.
 */
export function rulePropositionProbability({ verdicts, propositionId, owner, from = null, at = null, template = null } = {}) {
  const id = typeof propositionId === 'string' ? propositionId.trim() : ''
  if (!id) {
    throw refuse('VMU_INVALID_ARGUMENT', 'rulePropositionProbability needs { propositionId } (a non-empty string), got ' + shown(propositionId),
      'the ruling is about ONE proposition card: pass its id so the notice can name it')
  }
  const to = typeof owner === 'string' ? owner.trim() : ''
  if (!to) {
    throw refuse('VMU_INVALID_ARGUMENT', 'rulePropositionProbability needs { owner } (a non-empty string), got ' + shown(owner),
      'the notice is addressed to the holder of the proposition card: pass that member/seat id, or nobody can change the card')
  }
  // WHO SPEAKS is a POLICY fact (the chair, the office, the meeting itself), so it is a caller-supplied parameter and this
  // module never invents an identity: the EXISTING mailbox face refuses an empty sender by name, so a payload without one
  // can be built and read but cannot be handed over. `null` is legal (a pure calculation), a NON-string is a mistake.
  const fromId = from === null || from === undefined ? null : (typeof from === 'string' ? from.trim() : '')
  if (from !== null && from !== undefined && fromId === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'the notice sender must be a non-empty string, got ' + shown(from),
      'pass `from` (the seat/member that speaks for the ruling) or omit it — the mailbox face refuses an empty sender', { from })
  }
  // The AGGREGATION is told which card this ruling is for: verdicts that name ANOTHER proposition are refused rather
  // than averaged in (see aggregateVerdicts — the same bucket discipline, applied at the ruling's front door).
  const agg = aggregateVerdicts({ verdicts, propositionId: id, at })
  const fields = {
    proposition: id,
    owner: to,
    n: agg.n,
    value: agg.value,
    exact: agg.exact,
    mode: agg.mode,
    list: agg.perMember.map((r) => r.member + '=' + String(r.p)).join('、'),
    reasons: agg.perMember.map((r) => r.member + ': ' + r.reason).join('；'),
    // R8: empty when the ruling IS the decision; otherwise it says in words what `decided:false` says in JSON.
    caveat: agg.decided ? ''
      : '★ 注意：这不是全体一致的裁定，而是由各自不同的判断取出的均值（decided:false／estimate:true）——没有任何成员主张这个数值。改卡前请让成员对同一个布尔概率达成一致。',
  }
  const chosen = template === null || template === undefined ? DEFAULT_RULING_TEMPLATE[agg.mode] : template
  if (typeof chosen !== 'string' || chosen.trim() === '') {
    throw refuse('VMU_INVALID_ARGUMENT', 'the ruling template must be a non-empty string, got ' + shown(chosen),
      'pass a template string using ' + TEMPLATE_FIELDS.join('/') + ', or omit it for the rule\'s own wording', { template: chosen })
  }
  const notice = Object.freeze({
    from: fromId,
    to,
    about: id,
    kind: 'verdict-ruling',
    suggestedChannel: 'mailbox',
    proposition: id,
    owner: to,
    mode: agg.mode,
    value: agg.value,
    exact: agg.exact,
    decided: agg.decided,
    enforceable: agg.enforceable,
    estimate: agg.estimate,
    n: agg.n,
    perMember: agg.perMember,
    text: fill(chosen, fields),
  })
  return Object.assign({}, agg, {
    ok: true,
    proposition: id,
    owner: to,
    notice,
    delivery: {
      attempted: false, via: null, ok: null, error: null,
      note: 'the payload is complete but NOTHING was sent: hand `notice` to the existing message/mailbox face (e.g. `vmu.mailbox` send) — ' +
        'this module opens no second channel, and a caller that wants the assembly\'s port bound uses createMeetingVerdict({ send })',
    },
  })
}

/**
 * `createMeetingVerdict({ clock, log, bus, send })` ⇒ `{ aggregateVerdicts, rulePropositionProbability, status }`.
 *
 * The three seams are all optional: with none bound the face is a PURE CALCULATOR plus a notice payload (clock 0, no log,
 * no event, nothing sent) — that is the zero-mechanism default, and every one of the three adds only OBSERVABILITY, never
 * a decision. `send` is the assembly's EXISTING delivery port (the mailbox/message face), never a second channel.
 */
export function createMeetingVerdict({ clock = () => 0, log = null, bus = null, send = null } = {}) {
  // TWO LOG SHAPES, as the rest of the kernel accepts them (`kernel/report.js` is the precedent): a FUNCTION logger gets
  // the EVENT OBJECT (not a pre-stringified copy — a logger that wants text can render it, one that wants fields cannot
  // recover them from a string), and an APPEND-style sink gets the object too. Logging never breaks a ruling.
  const say = (event) => {
    try {
      if (typeof log === 'function') { log(event); return }
      if (log && typeof log.append === 'function') log.append(event)
    } catch (e) { /* logging never breaks a ruling */ }
  }
  let aggregations = 0
  let rulings = 0
  let refusals = 0
  let emitAttempts = 0
  let emitFailures = 0
  let deliveries = 0
  let deliveryFailures = 0
  let lastRuling = null

  /** The ONE emit site: a ruling happened, and any middleware may react. Registered in kernel/bus.js; failure is not the
   *  ruling's (the value is already computed), so a broken listener cannot undo it — the failure is COUNTED and said. */
  const emitRuled = (payload) => {
    if (!bus || typeof bus.emit !== 'function') return false
    emitAttempts += 1
    try { bus.emit('meeting/verdict-ruled', Object.assign({ type: 'meeting/verdict-ruled', at: clock() }, payload)); return true }
    catch (e) {
      emitFailures += 1
      say({ type: 'bus/emit-failed', at: clock(), name: 'meeting/verdict-ruled', code: (e && e.code) || 'VMU_BUS_EMIT_FAILED', message: String((e && e.message) || e) })
      return false
    }
  }
  const atOf = (args) => (args && args.at !== undefined && args.at !== null ? args.at : clock())

  const aggregateVerdictsThrough = (args = {}) => {
    try { const rec = aggregateVerdicts(Object.assign({}, args, { at: atOf(args) })); aggregations += 1; return rec } catch (e) { refusals += 1; throw e }
  }
  const ruleThrough = (args = {}) => {
    let rec = null
    try { rec = rulePropositionProbability(Object.assign({}, args, { at: atOf(args) })) } catch (e) { refusals += 1; throw e }
    rulings += 1
    lastRuling = { at: rec.at, proposition: rec.proposition, owner: rec.owner, mode: rec.mode, value: rec.value, n: rec.n, decided: rec.decided }
    if (typeof send === 'function') {
      deliveries += 1
      try {
        const out = send(rec.notice)
        // THE PORT'S OWN ANSWER COUNTS: the mailbox face refuses by RETURNING `{ok:false, code}` for some cases (no such
        // recipient), so "it did not throw" is NOT "it was delivered". A `false`-ish answer is a FAILED delivery and is
        // recorded as one — the difference between "not sent" and "sent" is exactly what this project refuses to blur.
        const answered = out === undefined ? null : out
        const failed = answered && typeof answered === 'object' && answered.ok === false
        if (failed) deliveryFailures += 1
        rec.delivery = {
          attempted: true, via: 'send-port', ok: failed ? false : true,
          result: answered, error: failed ? String(answered.message || answered.code || 'the send port answered ok:false') : null,
          code: failed ? (answered.code || null) : null,
          note: failed
            ? 'the send port ANSWERED a refusal: the ruling stands, the holder was not told — reported, not swallowed'
            : 'handed to the send port the ASSEMBLY bound (the existing message/mailbox face)',
        }
        if (failed) say({ type: 'meeting/verdict-delivery-failed', at: clock(), proposition: rec.proposition, owner: rec.owner, code: (answered && answered.code) || null, message: String((answered && (answered.message || answered.code)) || 'ok:false') })
      } catch (e) {
        deliveryFailures += 1
        rec.delivery = { attempted: true, via: 'send-port', ok: false, error: String((e && e.message) || e), code: (e && e.code) || null,
          note: 'the send port THREW: the ruling stands (it is computed here) but the holder was not told — reported, not swallowed' }
        say({ type: 'meeting/verdict-delivery-failed', at: clock(), proposition: rec.proposition, owner: rec.owner, code: (e && e.code) || null, message: String((e && e.message) || e) })
      }
    }
    emitRuled({ proposition: rec.proposition, owner: rec.owner, mode: rec.mode, value: rec.value, n: rec.n, decided: rec.decided })
    return rec
  }
  /** Self-disclosure: what this face DID, and what it never decided (no setting read, nothing sent without a port). */
  const status = () => ({
    ok: true,
    apiVersion,
    precision: VERDICT_PRECISION,
    aggregations,
    rulings,
    refusals,
    lastRuling,
    emit: { name: 'meeting/verdict-ruled', attempts: emitAttempts, failures: emitFailures },
    delivery: { portBound: typeof send === 'function', attempts: deliveries, failures: deliveryFailures },
    keys: [],
    note: 'pure arithmetic + one notice payload: NO setting is read (the rule is the pack\'s), and nothing is delivered unless a send port is bound',
  })

  return { aggregateVerdicts: aggregateVerdictsThrough, rulePropositionProbability: ruleThrough, status }
}

export default createMeetingVerdict
