// vmu paper — the MULTI-CONTRIBUTOR manuscript face (docs/17 §6 分工, docs/22 §终稿).
//
// WHY THIS EXISTS (round 135, measured): the v5r line has two tools - `paper` (start the team-authored paper for
// this run) and `finalize_paper` (finalise it after consulting the whole institute) - and vmu had their PIECES but
// not the ORCHESTRATION: `publication.js` owns the version chain, submission packs and archive registration, and
// `conference.js` owns the call for papers, submissions and reviewer assignment, but nothing owned "each section is
// owed by a NAMED member, and the manuscript may only be finalised when what was promised is in". That gap was
// recorded as one of the two remaining partials in the v5r containment table; this module closes it.
//
// THE DECISION THIS MODULE ENCODES (framework, not policy):
//   · ownership is MACHINE-ENFORCED: a section can only be handed in by the member it was contracted to, and a
//     refusal names both the owner and the caller (a rule the machine cannot enforce is a suggestion, not a rule);
//   · completeness is a GATE, not a hope: finalising with outstanding sections is refused BY NAME - listing each
//     missing section and who owes it - unless the pack has explicitly turned the requirement off, and then the
//     gaps travel in the receipt so they are recorded rather than forgotten;
//   · registration is DELEGATED: the module never writes a version chain itself; it calls the injected `register`
//     seam and, when no seam is bound, refuses by name instead of pretending the manuscript was registered;
//   · nothing is silently overwritten: a second hand-in for the same section, or a second finalisation, is refused.
//
// Zero policy check (asserted by tests/vmu-paper.test.mjs): no role name, section name or title from the v5r line
// appears in this file; every name here comes from the caller or from settings.

import { mint } from './ids.js'   // ROUND 2 (task-14): ids never restart from 0 (kernel/ids.js)
/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** D3: the refusal states its EVALUATION SCOPE (see members.js for the same sentence). */
export const ENFORCED_SCOPE = 'evaluated-so-far'

/** The keys this module really reads. Exported so the schema generator can see them (see generate-wired-schema). */
export const WIRED_KEYS = Object.freeze([
  'vmu.paper.requireAllSections',
  'vmu.paper.finalizer',
  // ROUND 145: the section cap used to be declared-but-unwired. It is a real LIMIT now: opening a manuscript with
  // more sections than the cap is refused by name with the count and the cap, because a bound the machine cannot
  // enforce is a suggestion. 0 means unlimited, which is also the default, so nothing changes unless a pack asks.
  'vmu.paper.maxSections',
  // ROUND 6 / target-4 (M-A04): the REVISION-ROUND cap. v5r promised it in prose only
  // ("decision=\"revise\" 会退回继续修订（有轮次上限）", packs/v5r/prompts/v5r-blocks-b.js:513) and neither line
  // implemented it; this key is its ONE reader (`revise()`), 0 = unlimited (the zero-mechanism default).
  'vmu.paper.maxRounds',
  // ROUND 3 (C-30, the office-consultation gate). The v5r line gated finalisation on the office having consulted the
  // institute first: both a message and a meeting had to be on record, the counts written AT THE POINT OF THE ACT (never
  // from intent), and the door stayed shut with a named refusal otherwise. These five keys are the vmu form of that rule.
  // They were landed in the schema first (vmu-core) and had NO READER until this gate: the "declared but nobody reads
  // it" defect class this repository keeps finding. NOTE the prose above deliberately avoids apostrophes and quoted
  // identifiers inside this array - the schema generator recovers keys by reading EVERY single-quoted string between the
  // brackets (generate-wired-schema.mjs), so one stray quote in a comment becomes a phantom setting key.
  'vmu.paper.officeConsult',
  'vmu.paper.officeConsultOn',
  'vmu.paper.officeConsultTimeoutMs',
  'vmu.paper.officeConsultOnTimeout',
  'vmu.paper.officeConsultExemptRoles',
  // ROUND 10 / task-74 (A3): the four v5r paper-output parameters. Each is read in cfg() on every call and carried
  // into the register() request as `artifact`, so the value changes what the host is asked to produce (not a label).
  // NOTE: no quoted identifiers in the comments inside this array - the schema generator reads every single-quoted
  // string between these brackets and a stray one becomes a phantom setting key.
  'vmu.paper.finalPaper',
  'vmu.paper.format',
  'vmu.paper.language',
  'vmu.paper.compilePdf',
])

/** Declared but deliberately NOT wired (the audit criterion: named, with a reason, and a revival condition). */
export const PLANNED_KEYS = Object.freeze([
  /**
   * ROUND 153: measured as declaration-only (this name appears once in the module - in this very entry). The retention
   * MECHANISM is carried by the `retention` face, which is also where this key belongs if it is ever needed: a
   * manuscript face that wrote its own expiry would be a second retention implementation.
   */
  ['vmu.paper.retentionMs', '★ **轮 191 实测补齐指针** ✓：保留机制由 **`retention` 面**承载 ✓（`removed[]` 每项可追 ✓）；★ **登记可以点名** ✓ —— `retention.js` 读 '
    + '`vmu.records.retention.*`（`keepEvery`／`maxBytes`／`tierThreshold` ✓）、`vmu.records.trash.retainDays`（**默认 30 天** ✓）、`vmu.records.history.depth` ✓。'
    + '本面**无持久化面** ✓（实测：`paper.js` 里持久化相关命中 **0** ✓）。'
    + '**复活条件** ✓：稿件需要独立保留期时 ⇒ **加在 `retention` 的键族里** ✓（**避免第二份保留实现** ✗）'],
])

export const FINALIZERS = Object.freeze(['editor', 'contributor', 'any'])
// ROUND 10 / task-74 (A3): the two CLOSED domains v5r uses for the paper output (v5r :1164/:1165). Out-of-domain
// values are refused BY NAME below - the same defect class the round-8 finalizer fix closed.
export const PAPER_FORMATS = Object.freeze(['both', 'md', 'tex'])
export const PAPER_LANGUAGES = Object.freeze(['zh', 'en'])

/** C-30: when the office-consultation gate applies. Anything unknown falls back to `finalize` (the narrow case). */
export const CONSULT_POINTS = Object.freeze(['finalize', 'finalize-or-submit'])

/** C-30: what an expired wait does. THERE IS NO `default-allow` MEMBER, and there never will be. */
export const CONSULT_TIMEOUT_ACTIONS = Object.freeze(['hold', 'refuse'])

/**
 * D3: a refusal states the keys it EVALUATED, and the scope that evaluation covered. The scope marker has been here
 * since round 135; `enforced[]` joins it because a refusal that cannot name what it read is not auditable - and the
 * D3 gate (`tests/audit-enforced-consistency.test.mjs`) reads refusals too.
 */
export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforcedScope = ENFORCED_SCOPE
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'enforced') { if (Array.isArray(v)) err.enforced = v.slice(); continue }
      err[k] = v
    }
  }
  return err
}

const SECTION_ID = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/
const TRAIL_MAX = 200

export function createPaper({ clock = () => Date.now(), log = () => {}, settings = {}, register = null, audit = null, bus = null } = {}) {
  const readKey = (k) => (settings && typeof settings.get === 'function' ? settings.get(k) : (settings || {})[k])
  const say = (ev) => { try { if (typeof log === 'function') log(ev) } catch (e) { /* logging never breaks the face */ } }

  /** Settings read in exactly ONE place, so keysUsed() and the behaviour can never disagree. */
  const cfg = () => {
    const requireAllSections = readKey('vmu.paper.requireAllSections') === false ? false : true
    const finalizerRaw = String(readKey('vmu.paper.finalizer') || 'editor')
    // ROUND 8 (vmu-pack's fidelity audit, Lead-confirmed defect): this used to be `indexOf(...) === -1 ? 'editor' : raw`
    // - a SILENT fallback. Measured: `vmu.paper.finalizer = <an INSTITUTION ROLE name from v5r's paperEditor>` made
    // `finalize` answer `VMU_NOT_PERMITTED "only the editor (acad) may finalise"`, i.e. the 'editor' RULE ran with no
    // "your value is invalid" anywhere. Two paths could inject it (a pack's data layer bypassing the settings boundary,
    // and `vibe_vmu_set` while the schema said `type:'string'`). The value domain is now a CLOSED SET and an out-of-domain
    // value is refused BY NAME with the declared domain - never silently downgraded. v5r's equivalent is expressed as
    // `finalizer='editor'` plus choosing the paper's `editor` at creation (D5: the kernel never learns role names).
    if (FINALIZERS.indexOf(finalizerRaw) === -1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.finalizer must be one of ' + FINALIZERS.join('|') + ': ' + finalizerRaw,
        "v5r's paperEditor names an institution ROLE (a pack-supplied title, never a kernel concept); in vmu the equivalent is finalizer='editor' plus the paper's editor chosen at creation",
        { enforced: ['vmu.paper.finalizer'], declared: FINALIZERS.slice(), value: finalizerRaw })
    }
    const finalizer = finalizerRaw
    // ROUND 145: written in the `|| <literal>` shape on purpose - the schema generator recovers the default from
    // that shape (readKey('k') || 0), so this key is declared with its REAL default rather than an honest null.
    const rawMax = Number(readKey('vmu.paper.maxSections') || 0)
    const maxSections = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 0
    // C-30. Every one of the five is read HERE, on every call, so a recording stub sees them and `keysUsed()` cannot
    // claim a reader that does not exist. Unknown values fall back to the CLOSED side (`required`, `finalize`,
    // `hold`), never to the permissive one: a pack that mistypes a value must not thereby open the gate.
    const officeConsult = readKey('vmu.paper.officeConsult') === 'off' ? 'off' : 'required'
    const consultOnRaw = String(readKey('vmu.paper.officeConsultOn') || 'finalize')
    const consultOn = CONSULT_POINTS.indexOf(consultOnRaw) === -1 ? 'finalize' : consultOnRaw
    const consultTimeoutRaw = Number(readKey('vmu.paper.officeConsultTimeoutMs') || 0)
    const consultTimeoutMs = Number.isFinite(consultTimeoutRaw) && consultTimeoutRaw > 0 ? Math.floor(consultTimeoutRaw) : 0
    const consultOnTimeoutRaw = String(readKey('vmu.paper.officeConsultOnTimeout') || 'hold')
    // NO default-allow, under ANY spelling: an unreadable value holds. (The schema's enum already refuses a bad value
    // at the settings boundary; this is the second line, for a value that arrived through a pack's data layer.)
    const consultOnTimeout = consultOnTimeoutRaw === 'refuse' ? 'refuse' : 'hold'
    const exemptRaw = readKey('vmu.paper.officeConsultExemptRoles')
    // F4 RULING (Lead, round 3): THE DEFAULT IS NO EXEMPTION. v5r gated the OFFICE's own finalisation (the office had
    // to consult the institute first), so exempting `office` by default would exempt exactly the act the original
    // checked. "Nobody is exempt until a declaration says so" is the conservative side of the same discipline the
    // timeout follows (`hold`, never `default-allow`), and it matches the schema default after the same ruling.
    const consultExemptRoles = Array.isArray(exemptRaw)
      ? exemptRaw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      : []
    // ROUND 6 / target-4 (M-A04): the revision-round cap. `0` (and any unusable value) means UNLIMITED - the
    // zero-mechanism default, so an undeclared deployment behaves exactly as before. The `|| 0` shape is deliberate:
    // the schema generator recovers the REAL default from it (the same convention `maxSections` uses above).
    const rawRounds = Number(readKey('vmu.paper.maxRounds') || 0)
    const maxRounds = Number.isFinite(rawRounds) && rawRounds > 0 ? Math.floor(rawRounds) : 0
    // ROUND 10 / task-74 (A3): the v5r paper-OUTPUT parameters (v5r :1163-1166, one line each, all four read here so
    // that keysUsed() and the behaviour cannot disagree). Defaults are v5r's own values; the two enumerations are
    // CLOSED SETS and an out-of-domain value is refused BY NAME rather than silently downgraded to the default.
    const finalPaper = readKey('vmu.paper.finalPaper') !== false
    const formatRaw = String(readKey('vmu.paper.format') || 'both')
    if (PAPER_FORMATS.indexOf(formatRaw) === -1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.format must be one of ' + PAPER_FORMATS.join('|') + ': ' + formatRaw,
        'v5r paperFormat is one of both|md|tex (v5r :1164)',
        { enforced: ['vmu.paper.format'], declared: PAPER_FORMATS.slice(), value: formatRaw })
    }
    const languageRaw = String(readKey('vmu.paper.language') || 'zh')
    if (PAPER_LANGUAGES.indexOf(languageRaw) === -1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.language must be one of ' + PAPER_LANGUAGES.join('|') + ': ' + languageRaw,
        'v5r paperLanguage is one of zh|en (v5r :1165)',
        { enforced: ['vmu.paper.language'], declared: PAPER_LANGUAGES.slice(), value: languageRaw })
    }
    const compilePdf = readKey('vmu.paper.compilePdf') !== false
    // v5r :8258 asks for a PDF with `pdf: params.paperCompilePdf !== false`, and v5r :8820 states the rule that goes
    // with it: format=md with compilePdf on must NOT warn about a missing tex engine, because no PDF can be built from
    // markdown alone. `pdf` is therefore compilePdf AND a format that can carry one.
    const artifact = {
      auto: finalPaper, format: formatRaw, language: languageRaw, pdf: compilePdf && formatRaw !== 'md',
      note: formatRaw === 'md' && compilePdf
        ? 'vmu.paper.compilePdf is on but vmu.paper.format=md: no PDF is requested (v5r :8820 - and no missing-tex warning)'
        : null,
    }
    return { requireAllSections, finalizer, maxSections, maxRounds, officeConsult, consultOn, consultTimeoutMs, consultOnTimeout, consultExemptRoles, artifact }
  }

  const keysUsed = () => WIRED_KEYS.slice()
  const partition = () => ({
    all: WIRED_KEYS.length + PLANNED_KEYS.length,
    wired: WIRED_KEYS.length,
    planned: PLANNED_KEYS.length,
    disjoint: WIRED_KEYS.every((k) => PLANNED_KEYS.every((p) => p[0] !== k)),
    exact: true,
  })

  const papers = new Map()

  const trail = []
  let droppedTrail = 0
  const note = (id, what) => {
    trail.push({ at: clock(), id, what })
    if (trail.length > TRAIL_MAX) { trail.shift(); droppedTrail += 1 }
  }

  const view = (p) => ({
    id: p.id, title: p.title, editor: p.editor, state: p.state, at: p.at, finalizedAt: p.finalizedAt,
    sections: p.sections.map((s) => ({ name: s.name, owner: s.owner, by: s.by, at: s.at, artifact: s.artifact })),
    outstanding: p.sections.filter((s) => s.by === null).map((s) => ({ name: s.name, owner: s.owner })),
    gaps: p.gaps ? p.gaps.slice() : null,
    receipt: p.receipt === undefined ? null : p.receipt,
    // C-30: the consultation ledger travels with the manuscript, so "was the office consulted?" is a fact a reader can
    // check rather than an inference from a prose claim.
    consult: { count: p.consult.entries.length, kinds: [...new Set(p.consult.entries.map((e) => e.kind))].sort(),
      requestedAt: p.consult.requestedAt, requestedBy: p.consult.by, lastAt: p.consult.entries.length ? p.consult.entries[p.consult.entries.length - 1].at : null },
  })

  const find = (id) => {
    const p = papers.get(String(id || ''))
    if (!p) throw refuse('VMU_NO_SUCH_OBJECT', 'no paper with id ' + String(id), 'call status() for the open manuscripts')
    return p
  }

  /**
   * C-30 · THE OFFICE-CONSULTATION GATE. Evaluates the five declared keys for ONE finalise attempt and never mutates
   * more than the pending request. Three outcomes matter:
   *   · NOT REQUIRED - the switch is off, or the caller is an exempt role (v5r: the office asking itself is not a
   *     consultation);
   *   · SATISFIED    - the ledger already holds at least one consultation recorded AT THE POINT OF THE ACT;
   *   · BLOCKED      - nothing recorded yet: a request is opened (once) and the wait is evaluated against the declared
   *     timeout. An expired wait does what `vmu.paper.officeConsultOnTimeout` says - `hold` keeps waiting, `refuse`
   *     ends the request - and BOTH still refuse the finalisation. There is no `default-allow`: a manuscript nobody
   *     consulted must never be finalised because time passed.
   */
  function consultGate(p, who, { now, auto = true }) {
    const c = cfg()
    const keys = WIRED_KEYS.filter((k) => k.indexOf('vmu.paper.officeConsult') === 0)
    const base = { required: false, blocked: false, enforced: keys, who }
    if (c.officeConsult === 'off') return Object.assign(base, { reason: 'off', note: 'vmu.paper.officeConsult=off: the gate is switched off (zero mechanism)' })
    if (c.consultExemptRoles.indexOf(who) !== -1) {
      return Object.assign(base, { reason: 'exempt', exemptRole: who,
        note: 'vmu.paper.officeConsultExemptRoles lists ' + who + ': an exempt role need not consult (v5r: the office does not consult itself)' })
    }
    base.required = true
    // `consultOn` is reported, not re-interpreted here: `finalize-or-submit` widens the gate to the SUBMISSION path too,
    // and that path belongs to the publication face - this module only owns the `finalize` half. Reporting the declared
    // value is what keeps a reader from thinking this face silently narrowed a wider declaration.
    base.on = c.consultOn
    if (p.consult.entries.length > 0) {
      return Object.assign(base, { reason: 'consulted', count: p.consult.entries.length,
        kinds: [...new Set(p.consult.entries.map((e) => e.kind))].sort() })
    }
    // Not consulted: open the request ONCE (the attempt itself is the ask), then read the declared wait. `auto:false` is
    // the READ-ONLY path (`consultState`) - a diagnostic surface must not change the manuscript it describes.
    if (p.consult.requestedAt === null) {
      if (!auto) return Object.assign(base, { blocked: true, reason: 'awaiting', requestedAt: null, requestedBy: null,
        elapsedMs: 0, timeoutMs: c.consultTimeoutMs, onTimeout: c.consultOnTimeout, remainingMs: c.consultTimeoutMs > 0 ? c.consultTimeoutMs : null,
        heldOnTimeout: false, wouldRequest: true,
        note: 'no request is open yet; a finalisation attempt would open one at that moment (this read opened nothing)' })
      p.consult.requestedAt = now
      p.consult.by = who
    }
    const askedAt = p.consult.requestedAt
    const elapsedMs = Math.max(0, now - askedAt)
    const timeoutMs = c.consultTimeoutMs
    const out = Object.assign(base, { blocked: true, requestedAt: askedAt, requestedBy: p.consult.by, elapsedMs, timeoutMs,
      onTimeout: c.consultOnTimeout })
    if (timeoutMs === 0) {
      return Object.assign(out, { reason: 'awaiting', heldOnTimeout: false, remainingMs: null,
        note: 'vmu.paper.officeConsultTimeoutMs=0: the wait is unbounded, so the request stays open (hold)' })
    }
    if (elapsedMs < timeoutMs) return Object.assign(out, { reason: 'awaiting', heldOnTimeout: false, remainingMs: timeoutMs - elapsedMs })
    if (c.consultOnTimeout === 'refuse') {
      // The request EXPIRED: it is cleared so a later attempt asks afresh, and the refusal says so.
      p.consult.requestedAt = null
      p.consult.by = null
      return Object.assign(out, { reason: 'timeout', timedOut: true, heldOnTimeout: false, requestCleared: true, remainingMs: 0 })
    }
    return Object.assign(out, { reason: 'timeout', timedOut: true, heldOnTimeout: true, requestCleared: false, remainingMs: 0 })
  }

  /** The named refusal + its trace. An audit row and a bus event are written BEFORE the throw, so evidence exists even
   *  though the call failed; a missing seam is reported in the refusal instead of being silently skipped. */
  async function refuseConsult(p, gate, c) {
    // EVERY decision field the gate produced travels on the refusal (reason, the wait, which timeout action applied,
    // whether the request survived) - a refusal that hides its own arithmetic cannot be audited.
    const detail = { paperId: p.id, title: p.title, gate: 'office-consult', by: gate.who, state: p.state, enforceKeys: gate.enforced }
    for (const [k, v] of Object.entries(gate)) {
      if (k === 'enforced' || k === 'note' || k === 'who') continue
      detail[k] = v
    }
    const trace = { audit: { appended: false, code: null, note: null }, bus: { emitted: false, hook: 'paper/office-consult-required', note: null } }
    if (audit && typeof audit.append === 'function') {
      try {
        // `what:'auth'` because this IS an authorisation gate: the manuscript may not be finalised until the office has
        // been consulted. It is the vocabulary the audit owns for "a required permission was missing".
        audit.append({ what: 'auth', subject: 'paper:' + p.id, gate: 'office-consult', reason: gate.reason,
          by: gate.who, onTimeout: gate.onTimeout, enforced: gate.enforced, enforceScope: ENFORCED_SCOPE })
        trace.audit = { appended: true, code: null, note: null }
      } catch (e) { trace.audit = { appended: false, code: (e && e.code) || 'VMU_AUDIT_WRITE_FAILED', note: String((e && e.message) || e) } }
    } else {
      trace.audit = { appended: false, code: 'VMU_ENGINE_UNAVAILABLE',
        note: 'no audit seam is bound on this paper face: the refusal is in the trail below and nowhere durable (a named gap)' }
    }
    if (bus && typeof bus.emit === 'function') {
      try {
        if (typeof bus.declareTopic === 'function') bus.declareTopic('paper/office-consult-required')
        await bus.emit('paper/office-consult-required', detail, {})
        trace.bus = { emitted: true, hook: 'paper/office-consult-required', note: null }
      } catch (e) { trace.bus = { emitted: false, hook: 'paper/office-consult-required', note: String((e && e.code) || (e && e.message) || e) } }
    } else {
      trace.bus = { emitted: false, hook: 'paper/office-consult-required', note: 'no bus seam is bound on this paper face (named, not skipped silently)' }
    }
    note(p.id, 'consult-required:' + gate.reason)
    say({ type: 'paper/office-consult-required', at: clock(), paperId: p.id, reason: gate.reason, onTimeout: gate.onTimeout })
    const msg = gate.reason === 'off'
      ? 'unreachable: the gate is off'
      : (gate.reason === 'awaiting'
        ? 'cannot finalise ' + p.id + ': the office has not been consulted yet (waiting' + (gate.remainingMs === null ? ' (unbounded)' : ', ' + gate.remainingMs + 'ms left') + ')'
        : 'cannot finalise ' + p.id + ': the office-consultation wait expired (' + gate.timeoutMs + 'ms) and vmu.paper.officeConsultOnTimeout=' + gate.onTimeout + (gate.heldOnTimeout ? ' ⇒ it stays on hold' : ' ⇒ the request was cleared, ask again'))
    throw refuse('VMU_OFFICE_CONSULT_REQUIRED', msg,
      'consult first: consult({ paperId: "' + p.id + '", kind: "message"|"meeting", by: "<who consulted>", ref: "<pointer>" }) - or make the caller an exempt role in vmu.paper.officeConsultExemptRoles, or switch the gate off with vmu.paper.officeConsult=off',
      // ★★ RUN 153 (G9): the answer call needs a `target`, and this refusal did not name the paper — the real run's
      // office answered, hit `action "consult" addresses ONE paper, and no target was given`, and had to retry blind.
      // The refusal now carries the same key the answer takes (`target`), so the repair is a copy.
      Object.assign({}, detail, { enforced: gate.enforced, trace, target: p.id, paperId: p.id }))
  }

  return {
    /**
     * Start a manuscript: a title, the sections it must contain, WHO OWES EACH SECTION, and the editor. Every
     * section must have an owner - an unowned section would be a promise nobody made, so it is refused by name.
     */
    start({ title, sections, contributors, editor } = {}) {
      const t = String(title || '').trim()
      if (!t) throw refuse('VMU_INVALID_ARGUMENT', 'start needs a title', 'the title is what the receipt and the registration carry')
      const names = Array.isArray(sections) ? sections.map((s) => String(s || '').trim()).filter((s) => s.length > 0) : []
      if (!names.length) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one section', 'sections: ["intro", ...]')
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      if (dupes.length) throw refuse('VMU_INVALID_ARGUMENT', 'duplicate section name(s): ' + [...new Set(dupes)].join(', '), 'section names are the contract keys')
      const bad = names.filter((n) => !SECTION_ID.test(n))
      if (bad.length) throw refuse('VMU_INVALID_ARGUMENT', 'malformed section name(s): ' + bad.join(', '), 'letters/digits/space/._-/ only')
      // ROUND 145: the cap is enforced HERE, on the request's shape, before ownership is even examined - so a
      // hundred-section manuscript is refused for its size rather than for a long list of unowned names.
      const c = cfg()
      if (c.maxSections > 0 && names.length > c.maxSections) {
        throw refuse('VMU_RESOURCE_BUDGET', 'too many sections: ' + names.length + ' > ' + c.maxSections + ' (vmu.paper.maxSections)',
          'split the manuscript into parts, or raise the cap (0 = unlimited)')
      }
      const map = contributors && typeof contributors === 'object' ? contributors : {}
      const unowned = names.filter((n) => typeof map[n] !== 'string' || map[n].trim().length === 0)
      if (unowned.length) {
        throw refuse('VMU_INVALID_ARGUMENT', 'section(s) with no owner: ' + unowned.join(', '),
          'each section is owed by a NAMED member; give contributors: { "<section>": "<member>" }')
      }
      const ed = String(editor || '').trim()
      if (!ed) throw refuse('VMU_INVALID_ARGUMENT', 'start needs an editor', 'the editor is who may finalise by default')
      const id = mint('paper', 'paper-')
      const p = {
        id, title: t, at: clock(), editor: ed, state: 'open', finalizedAt: null, gaps: null, receipt: undefined,
        sections: names.map((n) => ({ name: n, owner: String(map[n]).trim(), by: null, at: null, artifact: null })),
        // ROUND 6 / target-4 (M-A04): the REVISION-ROUND counter. v5r promised the cap in prose only
        // ("decision=\"revise\" 会退回继续修订（有轮次上限）", packs/v5r/prompts/v5r-blocks-b.js:513) and neither line
        // implemented it; `vmu.paper.maxRounds` is the declared knob and `revise()` is its ONE reader.
        rounds: 0,
        // C-30: the consultation ledger. `requestedAt` is opened by the first BLOCKED attempt (or explicitly through
        // requestConsult), and every `consult()` appends one entry - the evidence is the act, not a claim about it.
        consult: { requestedAt: null, by: null, entries: [] },
      }
      papers.set(id, p)
      note(id, 'started')
      return { ok: true, paperId: id, sections: p.sections.length, editor: ed, outstanding: view(p).outstanding }
    },

    /** Hand in ONE section. Only the member it was contracted to may do it - checked, not assumed. */
    contribute({ paperId, section, by, artifact } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is ' + p.state, 'a finalised manuscript is closed to contributions')
      const s = p.sections.find((x) => x.name === String(section || ''))
      if (!s) throw refuse('VMU_NO_SUCH_OBJECT', 'no section ' + String(section) + ' in ' + p.id,
        'declared sections: ' + p.sections.map((x) => x.name).join(', '))
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'contribute needs by', 'the hand-in is attributed')
      if (who !== s.owner) {
        throw refuse('VMU_NOT_PERMITTED', 'section "' + s.name + '" is owed by ' + s.owner + ', not by ' + who,
          'ownership is machine-enforced; the owner hands it in, or the manuscript is re-started with a different owner')
      }
      if (s.by !== null) {
        throw refuse('VMU_STATE', 'section "' + s.name + '" was already handed in by ' + s.by + ' at ' + s.at,
          'a section is written once; start a new manuscript version rather than overwriting silently')
      }
      s.by = who
      s.at = clock()
      s.artifact = artifact === undefined || artifact === null || String(artifact).trim() === '' ? null : String(artifact)
      note(p.id, 'section:' + s.name)
      return { ok: true, paperId: p.id, section: s.name, by: who, artifact: s.artifact, outstanding: view(p).outstanding }
    },

    /**
     * ROUND 6 / target-4 (M-A04) — REVISE: the SANCTIONED overwrite path, and the ONE reader of
     * `vmu.paper.maxRounds`. `contribute()` deliberately writes a section ONCE (a silent overwrite is the defect it
     * prevents); the v5r corpus nevertheless promises that a `revise` decision sends the work back for another round
     * "有轮次上限". That promise now has a mechanism:
     *   · only the section's OWNER may revise (same machine-enforced ownership as `contribute`);
     *   · the section must already have been handed in (there is nothing to revise before that);
     *   · EVERY revision increments the manuscript's round counter, and with `vmu.paper.maxRounds > 0` the revision
     *     that would exceed the cap is refused BY NAME (`VMU_PAPER_ROUNDS_EXCEEDED`) with the cap in `enforced[]`.
     * `maxRounds = 0` means UNLIMITED - the zero-mechanism default, so an undeclared deployment keeps working exactly
     * as before.
     */
    revise({ paperId, section, by, artifact, note: why = null } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is ' + p.state, 'a finalised manuscript is closed to revisions')
      const s = p.sections.find((x) => x.name === String(section || ''))
      if (!s) throw refuse('VMU_NO_SUCH_OBJECT', 'no section ' + String(section) + ' in ' + p.id,
        'declared sections: ' + p.sections.map((x) => x.name).join(', '))
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'revise needs by', 'the revision is attributed')
      if (who !== s.owner) {
        throw refuse('VMU_NOT_PERMITTED', 'section "' + s.name + '" is owed by ' + s.owner + ', not by ' + who,
          'ownership is machine-enforced; the owner revises, or the manuscript is re-started with a different owner')
      }
      if (s.by === null) {
        throw refuse('VMU_STATE', 'section "' + s.name + '" has not been handed in yet, so there is nothing to revise',
          'contribute() first; revise() is the sanctioned second pass')
      }
      const c = cfg()
      const cap = Number.isFinite(Number(c.maxRounds)) && Number(c.maxRounds) > 0 ? Math.floor(Number(c.maxRounds)) : 0
      if (cap > 0 && p.rounds >= cap) {
        const e = refuse('VMU_PAPER_ROUNDS_EXCEEDED',
          'manuscript ' + p.id + ' reached its revision-round cap: ' + p.rounds + ' >= ' + cap + ' (vmu.paper.maxRounds)',
          'raise vmu.paper.maxRounds (0 = unlimited), or start a new manuscript version')
        e.enforced = ['vmu.paper.maxRounds']
        e.fired = ['vmu.paper.maxRounds']
        e.enforcedScope = 'evaluated-so-far'
        e.rounds = p.rounds
        e.maxRounds = cap
        throw e
      }
      p.rounds += 1
      s.at = clock()
      s.artifact = artifact === undefined || artifact === null || String(artifact).trim() === '' ? null : String(artifact)
      note(p.id, 'revised:' + s.name)
      return { ok: true, paperId: p.id, section: s.name, by: who, artifact: s.artifact, rounds: p.rounds, maxRounds: cap,
        outstanding: view(p).outstanding, enforced: ['vmu.paper.maxRounds'], fired: ['vmu.paper.maxRounds'],
        enforcedScope: 'evaluated-so-far' }
    },

    /**
     * Finalise the manuscript. The gates run in a stated order, each refusing BY NAME with what it evaluated:
     *   ① the finaliser rule (`vmu.paper.finalizer`);
     *   ② completeness (`vmu.paper.requireAllSections`, with the cap checked at `start`);
     *   ③ C-30 the OFFICE-CONSULTATION gate (`vmu.paper.officeConsult*`) - the manuscript may not be finalised until the
     *      office has consulted the institute, unless the caller is exempt or the pack switched the gate off;
     *   ④ registration goes through the injected seam or is refused by name.
     */
    async finalize({ paperId, by, auto = false } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is already ' + p.state, 'finalise once; a revision is a new manuscript')
      const c = cfg()
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'finalize needs by', 'the finaliser is recorded')
      // ROUND 10 / task-74 (A3): vmu.paper.finalPaper gates the AUTOMATIC path (v5r :7867 `if (params.finalPaper !==
      // false)` decides whether the run concludes by writing the paper). An automation passes `auto:true`; with the
      // declaration off that is refused BY NAME instead of being silently downgraded to a manual finalisation - the
      // exact shape of the round-8 finalizer defect, which is why it is refused rather than absorbed.
      if (auto === true && c.artifact.auto !== true) {
        throw refuse('VMU_NOT_PERMITTED', 'automatic finalisation is not declared: vmu.paper.finalPaper=false',
          'call finalize() without auto:true (a manual finalisation is still allowed), or declare vmu.paper.finalPaper=true',
          { enforced: ['vmu.paper.finalPaper'], paperId: p.id, caller: who })
      }
      if (c.finalizer === 'editor' && who !== p.editor) {
        throw refuse('VMU_NOT_PERMITTED', 'only the editor (' + p.editor + ') may finalise, not ' + who,
          'vmu.paper.finalizer=editor; set it to contributor/any if the pack wants a different rule',
          { enforced: ['vmu.paper.finalizer'], paperId: p.id, caller: who, editor: p.editor })
      }
      if (c.finalizer === 'contributor' && who !== p.editor && !p.sections.some((s) => s.owner === who)) {
        throw refuse('VMU_NOT_PERMITTED', who + ' is neither the editor nor a contributor to ' + p.id,
          'vmu.paper.finalizer=contributor',
          { enforced: ['vmu.paper.finalizer'], paperId: p.id, caller: who })
      }
      const missing = p.sections.filter((s) => s.by === null)
      if (missing.length && c.requireAllSections) {
        throw refuse('VMU_STATE',
          'cannot finalise: ' + missing.length + ' section(s) outstanding - ' + missing.map((s) => '"' + s.name + '" (' + s.owner + ')').join(', '),
          'the manuscript is finalised when what was promised is in; or set vmu.paper.requireAllSections=false to record the gaps instead',
          { enforced: ['vmu.paper.requireAllSections'], paperId: p.id, outstanding: missing.map((s) => ({ name: s.name, owner: s.owner })) })
      }
      // ③ C-30: THE OFFICE-CONSULTATION GATE. Evaluated on the DECLARED keys, before anything is registered, and it
      // refuses by name with `enforced[]` after writing its evidence (audit row + bus event).
      const gate = consultGate(p, who, { now: clock() })
      if (gate.blocked) await refuseConsult(p, gate, c)
      p.gaps = missing.map((s) => ({ name: s.name, owner: s.owner }))
      if (typeof register !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no registration seam is bound', 'inject { register } - the kernel never writes the version chain itself (docs/11 §4.1)')
      }
      const receipt = await register({
        title: p.title, editor: p.editor, at: clock(),
        sections: p.sections.map((s) => ({ name: s.name, owner: s.owner, by: s.by, artifact: s.artifact })),
        gaps: p.gaps.slice(),
        // ROUND 10 / task-74 (A3): the DECLARED shape of the artifact travels with the request, so the host's
        // registration seam builds what the declaration asks for instead of guessing (v5r :8251-8258 does this inline).
        artifact: Object.assign({}, c.artifact),
      })
      p.state = 'finalized'
      p.finalizedAt = clock()
      p.receipt = receipt === undefined ? null : receipt
      note(p.id, 'finalized' + (p.gaps.length ? ':with-gaps' : ''))
      return { ok: true, paperId: p.id, state: p.state, by: who, gaps: p.gaps.slice(), receipt: p.receipt, droppedTrail,
        // ROUND 10 / task-74 (A3): what the face ASKED the seam to produce, in the receipt (the four v5r output keys).
        artifact: Object.assign({}, c.artifact),
        // The gate that ran travels in the receipt, so "was the office consulted?" is answerable for THIS finalisation.
        consult: { required: gate.required, reason: gate.reason, count: gate.count || 0, kinds: gate.kinds || [],
          exemptRole: gate.exemptRole || null },
        enforced: ['vmu.paper.finalizer', 'vmu.paper.requireAllSections', 'vmu.paper.officeConsult',
          'vmu.paper.finalPaper', 'vmu.paper.format', 'vmu.paper.language', 'vmu.paper.compilePdf'], fired: [] }
    },

    /**
     * C-30 · RECORD A CONSULTATION. The evidence is the ACT: the office consulted the institute (a message sent, a
     * meeting held), reported here by whoever owns that act - never by the finaliser asserting "I consulted". `kind`
     * is free vocabulary ('message', 'meeting', or anything an institution names), so the face carries the mechanism
     * while the pack decides which kinds count.
     */
    consult({ paperId, kind, by, ref } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is ' + p.state, 'a finalised manuscript takes no further consultations')
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'consult needs by', 'the consultation is attributed to who made it')
      const k = String(kind || 'message').trim()
      if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'consult needs a non-empty kind', 'e.g. kind: "message" or "meeting"')
      const at = clock()
      const entry = { kind: k, by: who, at, ref: ref === undefined || ref === null || String(ref).trim() === '' ? null : String(ref) }
      p.consult.entries.push(entry)
      p.consult.requestedAt = null
      p.consult.by = null
      note(p.id, 'consult:' + k)
      say({ type: 'paper/consulted', at, paperId: p.id, kind: k, by: who })
      return { ok: true, paperId: p.id, consultation: entry, count: p.consult.entries.length,
        kinds: [...new Set(p.consult.entries.map((e) => e.kind))].sort(), gate: 'satisfied',
        enforced: WIRED_KEYS.filter((x) => x.indexOf('vmu.paper.officeConsult') === 0), fired: [] }
    },

    /** C-30 · OPEN THE REQUEST EXPLICITLY, so an institution can ask before it tries to finalise. Idempotent. */
    requestConsult({ paperId, by, note: why } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is ' + p.state, 'a finalised manuscript cannot ask again')
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'requestConsult needs by', 'the request is attributed')
      const opened = p.consult.requestedAt === null
      if (opened) { p.consult.requestedAt = clock(); p.consult.by = who }
      if (opened) note(p.id, 'consult-requested')
      return { ok: true, paperId: p.id, opened, requestedAt: p.consult.requestedAt, by: p.consult.by,
        reason: why === undefined || why === null ? null : String(why), enforced: ['vmu.paper.officeConsult'], fired: [] }
    },

    /** C-30 · READ THE GATE without changing anything: what WOULD happen if this caller finalised now. */
    consultState({ paperId, by } = {}) {
      const p = find(paperId)
      const c = cfg()
      const who = String(by === undefined || by === null ? p.editor : by).trim()
      // `auto:false`: a read reports what WOULD happen and opens nothing (the request is opened by the attempt).
      const gate = consultGate(p, who, { now: clock(), auto: false })
      return { ok: true, paperId: p.id, state: p.state, caller: who, cfg: { officeConsult: c.officeConsult, consultOn: c.consultOn,
        consultTimeoutMs: c.consultTimeoutMs, consultOnTimeout: c.consultOnTimeout, consultExemptRoles: c.consultExemptRoles },
        gate: { required: gate.required, blocked: gate.blocked, reason: gate.reason, remainingMs: gate.remainingMs === undefined ? null : gate.remainingMs,
          onTimeout: gate.onTimeout === undefined ? null : gate.onTimeout, heldOnTimeout: gate.heldOnTimeout === true,
          wouldRequest: gate.wouldRequest === true, count: gate.count || 0, kinds: gate.kinds || [] } }
    },

    /** Read-only: every manuscript with its section states. Never a decision, only what is (docs/21 §5). */
    status(paperId) {
      if (paperId) return { ok: true, paper: view(find(paperId)) }
      return {
        ok: true, count: papers.size, droppedTrail,
        papers: [...papers.values()].map(view),
        cfg: cfg(),
      }
    },

    keysUsed,
    partition,
  }
}

export default createPaper
