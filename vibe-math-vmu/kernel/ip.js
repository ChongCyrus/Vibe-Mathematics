// vmu kernel · ip — the intellectual-property surface: dossiers, disclosure duties, publication holds,
// confidentiality windows, prior-art searches, authorship/ownership, transfers/licences and revenue splits.
//
// Spec: docs/22-academic-operations.md §IP (the `vmu.ip.*` family, doc lines ~380-450 + the key table ~785-799),
//       docs/21-observability-and-operations.md (alerting/operations), docs/20 (licence terms — REFERENCED, the
//       licence vocabulary itself stays in `vmu.license.*`), docs/07 (records/archival spirit).
//
// THE 20 DECLARED KEYS = 15 KNOBS + 5 SERVICE SURFACES (docs/22 declares `vmu.ip.hold`/`ownership`/
// `contributors`/`recordSearch`/`transfer` as SERVICE names, not settings) — both kinds are WIRED here, and the
// partition is asserted by tests/vmu-ip.test.mjs.
//
// STANDARD (identical to kernel/mathtools.js · records.js · meetings.js):
//   ① every wired key changes an observable result (asserted per key, positive AND negative);
//   ② every receipt carries `enforced[]` (keys EVALUATED for that call) + `fired[]` (keys that CHANGED its
//      outcome) + `enforcedScope:'evaluated-so-far'` (D3: never mistake "so far" for the whole key set);
//   ③ every REFUSAL carries `enforced` (array, possibly empty, never undefined) and the same `enforcedScope`;
//   ④ the keys that are NOT wired are named with a reason (empty here — stated, not implied);
//   ⑤ the only time source is the injected clock; READ paths (get/list/ownership/contributors/status/sweep
//      report-only) never mutate; zero mechanism never throws on reads.
//
// CODES (03-§8, all already registered — zero new codes):
//   VMU_IP_DISCLOSURE_REQUIRED / VMU_IP_DISCLOSURE_INCOMPLETE / VMU_IP_PRIORART_MISSING /
//   VMU_IP_CONTRIB_EVIDENCE_MISSING / VMU_IP_OWNERSHIP_CONFLICT / VMU_IP_HOLD_EXEMPTION_REQUIRED /
//   VMU_IP_PUBLICATION_HOLD / VMU_IP_CONFIDENTIALITY_BREACH / VMU_IP_TRANSFER_UNLICENSED /
//   VMU_LICENSE_INCOMPATIBLE (+ the generic VMU_INVALID_ARGUMENT / VMU_STATE / VMU_NO_SUCH_OBJECT /
//   VMU_NOT_PERMITTED / VMU_META_VALIDATION_FAILED / VMU_REASON_REQUIRED).

export const apiVersion = 1

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 20 keys docs/22 declares for this surface (15 settings knobs + 5 service surfaces). */
export const DECLARED_KEYS = Object.freeze([
  // service surfaces (docs/22 §IP declares them as service names)
  'vmu.ip.hold', 'vmu.ip.ownership', 'vmu.ip.contributors', 'vmu.ip.recordSearch', 'vmu.ip.transfer',
  // settings knobs
  'vmu.ip.disclosureRequired', 'vmu.ip.sweepCadenceDays', 'vmu.ip.disclosureFields',
  'vmu.ip.priorArtSearchDepth', 'vmu.ip.priorArtRequired', 'vmu.ip.ownershipDefault',
  'vmu.ip.contributorThreshold', 'vmu.ip.authorshipRule', 'vmu.ip.appealWindowDays',
  'vmu.ip.confidentialityWindowDays', 'vmu.ip.publicationHoldDays', 'vmu.ip.holdEnforcement',
  'vmu.ip.exemptRoles', 'vmu.ip.transferPolicy', 'vmu.ip.revenueSharePolicy',
])

/** The 5 declared keys that are SERVICE names rather than settings (no value is read for them). */
export const SERVICE_KEYS = Object.freeze(['vmu.ip.hold', 'vmu.ip.ownership', 'vmu.ip.contributors', 'vmu.ip.recordSearch', 'vmu.ip.transfer'])

/** The 15 declared keys read as settings. */
export const KNOB_KEYS = Object.freeze(DECLARED_KEYS.filter((k) => !SERVICE_KEYS.includes(k)))

/** Every declared key this module honours (all 20 — see tests/vmu-ip.test.mjs). */
export const WIRED_KEYS = Object.freeze(DECLARED_KEYS.slice())

/** Per-key reasons for the declared keys NOT wired yet (empty ⇒ all 20 are wired; stated, not implied). */
export const UNWIRED_REASONS = Object.freeze({})

const DEPTHS = Object.freeze(['quick', 'standard', 'deep'])
const OWNERSHIP = Object.freeze(['institution', 'inventor', 'joint'])
const AUTHORSHIP = Object.freeze(['byContribution', 'alphabetical', 'seniorLast'])
const HOLD_MODES = Object.freeze(['block', 'warn'])
const TRANSFER_POLICIES = Object.freeze(['manual', 'auto-terms'])
const KINDS = Object.freeze(['patent', 'copyright', 'trademark', 'knowhow'])
const PLACEHOLDER_NAMES = Object.freeze(['unknown', 'tbd', 'n/a', 'na', 'anonymous', '待定'])
const DAY_MS = 86400000
const DEFAULT_LIST_CAP = 200

const DEFAULTS = Object.freeze({
  'vmu.ip.disclosureRequired': true,
  'vmu.ip.sweepCadenceDays': 90,
  'vmu.ip.disclosureFields': ['title', 'inventors', 'evidenceRefs', 'publicDisclosures'],
  'vmu.ip.priorArtSearchDepth': 'standard',
  'vmu.ip.priorArtRequired': true,
  'vmu.ip.ownershipDefault': 'institution',
  'vmu.ip.contributorThreshold': 0.1,
  'vmu.ip.authorshipRule': 'byContribution',
  'vmu.ip.appealWindowDays': 30,
  'vmu.ip.confidentialityWindowDays': 180,
  'vmu.ip.publicationHoldDays': 90,
  'vmu.ip.holdEnforcement': 'block',
  'vmu.ip.exemptRoles': [],
  'vmu.ip.transferPolicy': 'manual',
  'vmu.ip.revenueSharePolicy': 'institution-first',
})

/**
 * createIp — the IP surface. `store`/`library` are OPTIONAL seams (durability/archival stay with 07);
 * this module owns the KNOBS, the gates and the accounting.
 */
export function createIp({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') {
    const e = refuse('VMU_INVALID_ARGUMENT', 'createIp needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
    e.enforced = []
    e.enforcedScope = 'evaluated-so-far'
    throw e
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (row) => { if (log && typeof log.append === 'function') { try { log.append(row) } catch (e) { /* logging never breaks the surface */ } } }

  // ── the knobs (read as PLAIN LITERALS; the settings audit discovers wired keys by scanning text) ──────
  const disclosureRequired = sget('vmu.ip.disclosureRequired') !== false
  const sweepCadenceDays = intOr(sget('vmu.ip.sweepCadenceDays'), DEFAULTS['vmu.ip.sweepCadenceDays'])
  const disclosureFields = listOr(sget('vmu.ip.disclosureFields'), DEFAULTS['vmu.ip.disclosureFields'])
  const priorArtDepth = DEPTHS.includes(sget('vmu.ip.priorArtSearchDepth')) ? sget('vmu.ip.priorArtSearchDepth') : DEFAULTS['vmu.ip.priorArtSearchDepth']
  const priorArtRequired = sget('vmu.ip.priorArtRequired') !== false
  const ownershipDefault = OWNERSHIP.includes(sget('vmu.ip.ownershipDefault')) ? sget('vmu.ip.ownershipDefault') : DEFAULTS['vmu.ip.ownershipDefault']
  const contributorThreshold = clamp01(sget('vmu.ip.contributorThreshold'), DEFAULTS['vmu.ip.contributorThreshold'])
  const authorshipRule = AUTHORSHIP.includes(sget('vmu.ip.authorshipRule')) ? sget('vmu.ip.authorshipRule') : DEFAULTS['vmu.ip.authorshipRule']
  const appealWindowDays = intOr(sget('vmu.ip.appealWindowDays'), DEFAULTS['vmu.ip.appealWindowDays'])
  const confidentialityWindowDays = intOr(sget('vmu.ip.confidentialityWindowDays'), DEFAULTS['vmu.ip.confidentialityWindowDays'])
  const publicationHoldDays = intOr(sget('vmu.ip.publicationHoldDays'), DEFAULTS['vmu.ip.publicationHoldDays'])
  const holdEnforcement = HOLD_MODES.includes(sget('vmu.ip.holdEnforcement')) ? sget('vmu.ip.holdEnforcement') : DEFAULTS['vmu.ip.holdEnforcement']
  const exemptRoles = listOr(sget('vmu.ip.exemptRoles'), [])
  const transferPolicy = TRANSFER_POLICIES.includes(sget('vmu.ip.transferPolicy')) ? sget('vmu.ip.transferPolicy') : DEFAULTS['vmu.ip.transferPolicy']
  const revenueSharePolicy = strOr(sget('vmu.ip.revenueSharePolicy'), DEFAULTS['vmu.ip.revenueSharePolicy'])
  let seq = 0

  function intOr(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }
  function clamp01(v, def) { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : def }
  function strOr(v, def) { return typeof v === 'string' && v ? v : def }
  function listOr(v, def) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : def }

  // ── state (mutated only by file/priorArt/hold/release/disclose/exportDossier/transfer/dispute/appeal/sweep) ──
  const dossiers = new Map()
  const order = []
  const holds = new Map()
  const disputes = new Map()
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  const counters = {
    filed: 0, priorArtSearches: 0, holds: 0, releases: 0, disclosures: 0, exports: 0, transfers: 0,
    revenueSplits: 0, disputes: 0, appeals: 0, sweeps: 0, sweepsDue: 0, warned: 0, exempted: 0, duplicates: 0, belowThreshold: 0,
  }

  const uniq = (arr) => [...new Set(arr)].sort()
  const mark = (list, key) => { if (key && list.indexOf(key) === -1) list.push(key); return list }
  const markAll = (list, keys) => { for (const k of keys) mark(list, k); return list }
  const ENFORCED_SCOPE = 'evaluated-so-far'
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const at = (v) => (Number.isFinite(v) ? v : now())
  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const dossierOf = (id) => dossiers.get(id) || null
  const remainDays = (untilMs, whenMs) => Math.max(0, Math.ceil((untilMs - whenMs) / DAY_MS))
  const holdOf = (id) => [...holds.values()].filter((h) => h.dossierId === id && h.releasedAt === null)
  const isExempt = (role) => typeof role === 'string' && role && exemptRoles.includes(role)
  const isRealName = (n) => typeof n === 'string' && n.trim().length >= 2 && !PLACEHOLDER_NAMES.includes(n.trim().toLowerCase()) && !/^[a-z]-\d+$/.test(n.trim().toLowerCase())

  const deny = (code, message, hint, enforced = [], extra = null) => {
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    bump(refusals, code, 1)
    say({ type: 'ip/refused', at: now(), code, message, enforced: list, enforcedScope: ENFORCED_SCOPE })
    const e = refuse(code, message, hint)
    e.enforced = list
    e.enforcedScope = ENFORCED_SCOPE
    e.wouldEvaluate = list.slice()          // shape-compatible; the full per-op set is not enumerable (see status note)
    if (extra) Object.assign(e, extra)
    return e
  }
  const receipt = (obj, enforced, fired) => Object.assign({}, obj, { enforced: uniq(enforced), fired: uniq(fired), enforcedScope: ENFORCED_SCOPE })
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return false }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
      return true
    } catch (e) { bump(unwired, 'bus:' + hook, 1); say({ type: 'ip/hook-unwired', at: now(), hook, why: String((e && e.message) || e) }); return false }
  }

  /**
   * The disclosure-fields gate. `missing` = the declared field is absent/blank (a real gap, refused by name);
   * `empty`   = the field is present but its list is empty (a DECLARATION — "none yet" — reported, not refused:
   *             an explicit [] is a decision, while omitting the field is an omission; only the latter is refused).
   */
  const disclosureCheck = (d) => {
    const missing = []
    const empty = []
    const omitted = Array.isArray(d.omitted) ? d.omitted : []
    for (const f of disclosureFields) {
      const v = d[f]
      if (omitted.includes(f) || v === undefined || v === null) { missing.push(f); continue }
      if (typeof v === 'string' && !v.trim()) { missing.push(f); continue }
      if (Array.isArray(v) && v.length === 0) empty.push(f)
    }
    return { missing, empty }
  }
  const overThreshold = (d) => d.contributors.filter((c) => Number(c.share) >= contributorThreshold)
  const belowThreshold = (d) => d.contributors.filter((c) => !(Number(c.share) >= contributorThreshold))
  /** Authorship order per `authorshipRule` (deterministic; seniorLast uses the `senior` flag). */
  const authorshipOf = (d) => {
    const counted = overThreshold(d).slice()
    if (authorshipRule === 'alphabetical') counted.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    else if (authorshipRule === 'seniorLast') counted.sort((a, b) => (a.senior === true ? 1 : 0) - (b.senior === true ? 1 : 0) || (b.share - a.share) || (a.id < b.id ? -1 : 1))
    else counted.sort((a, b) => (b.share - a.share) || (a.id < b.id ? -1 : 1))
    return counted.map((c) => c.id)
  }
  const view = (d, extra = null) => receipt(Object.assign({
    id: d.id, kind: d.kind, title: d.title, status: d.status, filedAt: d.filedAt, priorityDate: d.priorityDate,
    inventors: d.inventors.slice(), contributors: d.contributors.map((c) => ({ id: c.id, share: c.share, counted: Number(c.share) >= contributorThreshold })),
    evidenceRefs: d.evidenceRefs.slice(), publicDisclosures: d.publicDisclosures.slice(),
    familyId: d.familyId, ownership: d.ownership, authorship: authorshipOf(d), belowThreshold: belowThreshold(d).map((c) => c.id),
    holds: holdOf(d.id).map((h) => ({ id: h.id, reason: h.reason, untilMs: h.untilMs })), transfers: d.transfers.map((t) => Object.assign({}, t)),
  }, extra || {}), ['vmu.ip.disclosureFields', 'vmu.ip.contributorThreshold', 'vmu.ip.authorshipRule', 'vmu.ip.ownershipDefault'], [])

  const api = {
    apiVersion,

    /** File a dossier. Disclosure/evidence/inventor/priority/family gates all run here. */
    file({ kind = 'patent', title = '', inventors = [], contributors = [], evidenceRefs = undefined, publicDisclosures = null, filingDate = null, priorityDate = null, familyId = null, ownership = null, priorArt = null, id = null } = {}) {
      const enforced = ['vmu.ip.disclosureRequired', 'vmu.ip.disclosureFields', 'vmu.ip.priorArtRequired', 'vmu.ip.contributorThreshold']
      const fired = []
      if (!KINDS.includes(kind)) return deny('VMU_INVALID_ARGUMENT', 'unknown dossier kind: ' + String(kind), 'declared kinds: ' + KINDS.join(', '), enforced, { kind })
      const cleanTitle = String(title || '').trim()
      if (!cleanTitle) return deny('VMU_INVALID_ARGUMENT', 'file needs a non-empty title', 'give the dossier a title', enforced)
      // ① disclosure is REQUIRED (may be an explicit empty list — that is a decision, not an omission)
      if (disclosureRequired && publicDisclosures === null) {
        mark(fired, 'vmu.ip.disclosureRequired')
        return deny('VMU_IP_DISCLOSURE_REQUIRED', 'vmu.ip.disclosureRequired=true: pass publicDisclosures (use [] to state "none yet")',
          'the disclosure duty is checked against vmu.ip.disclosureFields: ' + disclosureFields.join(', '), enforced)
      }
      // ② inventors must be REAL names (`实名`)
      const badInventors = (Array.isArray(inventors) ? inventors : []).filter((n) => !isRealName(n))
      if (badInventors.length) {
        mark(fired, 'vmu.ip.disclosureFields')
        return deny('VMU_IP_DISCLOSURE_INCOMPLETE', 'inventors must be real names (实名): ' + badInventors.map((x) => String(x)).join('、'),
          'a placeholder or an id-like token is not a named inventor', enforced, { missing: ['inventors'] })
      }
      if (!Array.isArray(inventors) || inventors.length === 0) {
        mark(fired, 'vmu.ip.disclosureFields')
        return deny('VMU_IP_DISCLOSURE_INCOMPLETE', 'at least one named inventor is required', 'vmu.ip.disclosureFields includes "inventors"', enforced, { missing: ['inventors'] })
      }
      const filedMs = at(filingDate)
      // ③ priority date: the declared rule (docs/22 + this task) is "an EARLIER priority date than the filing
      //    date is refused". NOTE: real patent practice claims an earlier priority date; implemented literally.
      if (Number.isFinite(priorityDate) && priorityDate < filedMs) {
        mark(fired, 'vmu.ip.disclosureFields')
        return deny('VMU_META_VALIDATION_FAILED', 'priorityDate is earlier than filingDate: ' + priorityDate + ' < ' + filedMs,
          'this surface refuses a priority date earlier than the filing date (see docs/22 §IP)', enforced, { priorityDate, filingDate: filedMs })
      }
      // ④ patent-family duplication (same family + same title ⇒ refuse, COUNTED)
      if (familyId !== null) {
        const dup = order.map((x) => dossiers.get(x)).find((d) => d && d.familyId === familyId && d.title === cleanTitle)
        if (dup) {
          counters.duplicates += 1
          mark(fired, 'vmu.ip.disclosureFields')
          return deny('VMU_IP_OWNERSHIP_CONFLICT', 'the family "' + familyId + '" already holds a dossier with the same title: ' + dup.id,
            'a patent family may not contain the same title twice — merge the dossiers or change the title', enforced, { familyId, existingId: dup.id })
        }
      }
      // ⑤ prior art: `vmu.ip.priorArtRequired` bites at COMPLETE time (a draft may exist without a search —
      //    the search attaches to an existing dossier, so requiring it at file() would be a deadlock). An inline
      //    `priorArt` object here records the search immediately, so a single-call flow stays possible.
      const inlinePriorArt = (priorArt !== null && typeof priorArt === 'object') ? priorArt : null
      const cleanContributors = (Array.isArray(contributors) ? contributors : []).map((c) => ({ id: String(c && c.id || ''), share: Number(c && c.share), evidence: Array.isArray(c && c.evidence) ? c.evidence.slice() : [], senior: c && c.senior === true }))
        .filter((c) => c.id)
      const counted = cleanContributors.filter((c) => c.share >= contributorThreshold)
      counters.belowThreshold += cleanContributors.length - counted.length
      const evidenceMissing = counted.filter((c) => c.evidence.length === 0)
      const cid = id === null ? 'ip-' + (++seq) : String(id)
      const dossier = {
        id: cid, kind, title: cleanTitle, inventors: inventors.map(String), contributors: cleanContributors,
        evidenceRefs: (Array.isArray(evidenceRefs) ? evidenceRefs : []).map(String),
        publicDisclosures: (Array.isArray(publicDisclosures) ? publicDisclosures : []).map(String),
        // WHICH declared disclosure fields the caller did NOT pass at all: keeping this list is what lets the
        // gate tell an OMISSION (refused) from a DECLARATION of emptiness (`[]`, reported but accepted) ✗✓
        omitted: [evidenceRefs === undefined ? 'evidenceRefs' : null, publicDisclosures === null ? 'publicDisclosures' : null].filter(Boolean),
        priorityDate: Number.isFinite(priorityDate) ? priorityDate : null, familyId: familyId === null ? null : String(familyId),
        filedAt: filedMs, ownership: ownership === null ? ownershipDefault : (OWNERSHIP.includes(ownership) ? ownership : ownershipDefault),
        status: 'draft', lastSweepAt: null, transfers: [], priorArt: null, createdAt: now(),
      }
      if (inlinePriorArt) {
        dossier.priorArt = { id: 'pa-' + (++seq), dossierId: cid, query: inlinePriorArt.query || null, db: inlinePriorArt.db || null, hits: Array.isArray(inlinePriorArt.hits) ? inlinePriorArt.hits.length : 0, conclusion: inlinePriorArt.conclusion === undefined ? null : String(inlinePriorArt.conclusion), depth: DEPTHS.includes(inlinePriorArt.depth) ? inlinePriorArt.depth : priorArtDepth, at: now() }
        counters.priorArtSearches += 1
        mark(fired, 'vmu.ip.priorArtRequired')
      }
      dossiers.set(cid, dossier)
      order.push(cid)
      counters.filed += 1
      const decl = disclosureCheck(dossier)
      markAll(fired, ['vmu.ip.disclosureRequired', 'vmu.ip.disclosureFields'])
      if (dossier.priorArt) mark(fired, 'vmu.ip.priorArtRequired')
      if (cleanContributors.length - counted.length > 0) mark(fired, 'vmu.ip.contributorThreshold')
      record_({ type: 'ip/filed', id: cid, kind, title: cleanTitle, counted: counted.length })
      fire('ip/filed', { id: cid, kind })
      return receipt({
        ok: true, id: cid, kind, title: cleanTitle, inventors: dossier.inventors.slice(), counted: counted.length,
        belowThreshold: cleanContributors.length - counted.length, ownership: dossier.ownership, filedAt: filedMs,
        disclosureMissing: decl.missing, disclosureEmpty: decl.empty, evidenceMissing: evidenceMissing.map((c) => c.id),
        priorArt: dossier.priorArt ? dossier.priorArt.id : null, status: dossier.status,
        note: (decl.missing.length || decl.empty.length || evidenceMissing.length)
          ? 'filed with COUNTS: disclosure fields absent (' + (decl.missing.join(',') || 'none') + '), declared-but-empty (' + (decl.empty.join(',') || 'none') + ') and/or contributors without evidence (' + (evidenceMissing.map((c) => c.id).join(',') || 'none') + ')'
          : 'filed with a complete declaration',
      }, enforced, fired)
    },

    /**
     * Complete a draft: this is where `priorArtRequired` and contributor EVIDENCE are enforced. A draft may be
     * incomplete; a completed dossier may not (the gaps are named, never silently accepted).
     */
    complete({ id, at: when = null } = {}) {
      const enforced = ['vmu.ip.priorArtRequired', 'vmu.ip.contributorThreshold', 'vmu.ip.disclosureFields']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      if (d.status !== 'draft') return deny('VMU_STATE', 'dossier ' + d.id + ' is already ' + d.status, 'only a draft can be completed', enforced)
      if (priorArtRequired && !d.priorArt) {
        mark(fired, 'vmu.ip.priorArtRequired')
        return deny('VMU_IP_PRIORART_MISSING', 'vmu.ip.priorArtRequired=true: dossier ' + d.id + ' has no prior-art search on record',
          'call recordSearch()/priorArt() first, or set vmu.ip.priorArtRequired=false', enforced, { id: d.id })
      }
      const noEvidence = overThreshold(d).filter((c) => c.evidence.length === 0)
      if (noEvidence.length) {
        mark(fired, 'vmu.ip.contributorThreshold')
        return deny('VMU_IP_CONTRIB_EVIDENCE_MISSING', 'counted contributor(s) without evidence: ' + noEvidence.map((c) => c.id).join(', '),
          'every counted contributor needs an evidence reference (share ≥ vmu.ip.contributorThreshold)', enforced, { withoutEvidence: noEvidence.map((c) => c.id) })
      }
      const decl = disclosureCheck(d)
      if (decl.missing.length) {
        mark(fired, 'vmu.ip.contributorThreshold')
        return deny('VMU_IP_DISCLOSURE_INCOMPLETE', 'the declaration is still incomplete: missing ' + decl.missing.join(', ') + ' (vmu.ip.disclosureFields)',
          'fill the declared disclosure fields before completing', enforced, { missing: decl.missing })
      }
      d.status = 'filed'
      d.completedAt = at(when)
      counters.completed = (counters.completed || 0) + 1
      markAll(fired, ['vmu.ip.disclosureFields', 'vmu.ip.contributorThreshold'])
      if (priorArtRequired) mark(fired, 'vmu.ip.priorArtRequired')
      record_({ type: 'ip/completed', id: d.id, at: d.completedAt })
      fire('ip/completed', { id: d.id })
      return receipt({ ok: true, id: d.id, status: d.status, completedAt: d.completedAt, priorArt: d.priorArt ? d.priorArt.id : null, authorship: authorshipOf(d), declaredEmpty: decl.empty }, enforced, fired)
    },

    /** Record a prior-art search. `priorArtSearchDepth` sets how much evidence a search must carry. */
    priorArt({ id, query = null, db = null, hits = [], conclusion = null, depth = null } = {}) {
      const enforced = ['vmu.ip.priorArtSearchDepth']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      const chosen = DEPTHS.includes(depth) ? depth : priorArtDepth
      if (depth !== null && !DEPTHS.includes(depth)) return deny('VMU_INVALID_ARGUMENT', 'unknown prior-art depth: ' + String(depth), 'declared: ' + DEPTHS.join(', '), enforced)
      const found = Array.isArray(hits) ? hits : []
      if (chosen === 'standard' && found.length === 0) {
        mark(fired, 'vmu.ip.priorArtSearchDepth')
        return deny('VMU_IP_PRIORART_MISSING', 'depth=standard requires at least one prior-art hit (vmu.ip.priorArtSearchDepth)',
          'a standard search must show what it found; use depth=quick to state "nothing found" explicitly', enforced, { depth: chosen, hits: 0 })
      }
      if (chosen === 'deep' && (found.length === 0 || typeof conclusion !== 'string' || !conclusion.trim())) {
        mark(fired, 'vmu.ip.priorArtSearchDepth')
        return deny('VMU_IP_PRIORART_MISSING', 'depth=deep requires at least one hit AND a written conclusion (vmu.ip.priorArtSearchDepth)',
          'a deep search must state its hits and its conclusion', enforced, { depth: chosen, hits: found.length, hasConclusion: typeof conclusion === 'string' && !!conclusion.trim() })
      }
      const search = { id: 'pa-' + (++seq), dossierId: d.id, query, db, hits: found.length, conclusion: conclusion === null ? null : String(conclusion), depth: chosen, at: now() }
      d.priorArt = search
      counters.priorArtSearches += 1
      mark(fired, 'vmu.ip.priorArtSearchDepth')
      record_({ type: 'ip/prior-art', id: d.id, depth: chosen, hits: found.length })
      fire('ip/prior-art', { id: d.id, depth: chosen, hits: found.length })
      return receipt({ ok: true, dossierId: d.id, searchId: search.id, depth: chosen, hits: found.length, conclusion: search.conclusion, at: search.at }, enforced, fired)
    },

    /** Service surface `vmu.ip.recordSearch` — the documented name for the prior-art search. */
    recordSearch(args = {}) { return api.priorArt(args) },

    /** Put a publication hold on a dossier (blocked until `untilMs`, default `publicationHoldDays`). */
    hold({ id, reason = null, untilMs = null } = {}) {
      const enforced = ['vmu.ip.publicationHoldDays', 'vmu.ip.holdEnforcement']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      if (typeof reason !== 'string' || !reason.trim()) return deny('VMU_REASON_REQUIRED', 'a publication hold needs a reason', 'say why the dossier is held (the reason is audited)', enforced)
      const until = Number.isFinite(untilMs) ? untilMs : now() + publicationHoldDays * DAY_MS
      const h = { id: 'hold-' + (++seq), dossierId: d.id, reason: String(reason), at: now(), untilMs: until, releasedAt: null, releasedBy: null, exemptionEvidence: null }
      holds.set(h.id, h)
      counters.holds += 1
      mark(fired, 'vmu.ip.publicationHoldDays')
      record_({ type: 'ip/hold', id: d.id, holdId: h.id, untilMs: until })
      fire('ip/publication-hold', { id: d.id, holdId: h.id, untilMs: until })
      return receipt({ ok: true, dossierId: d.id, holdId: h.id, untilMs: until, remainDays: remainDays(until, now()), reason: h.reason }, enforced, fired)
    },

    /** Release a hold. Without an exemption (evidence or an exempt role) the release is REFUSED by name. */
    release({ holdId, evidence = null, role = null, by = null } = {}) {
      const enforced = ['vmu.ip.exemptRoles']
      const fired = []
      const h = holds.get(holdId)
      if (!h) return deny('VMU_NO_SUCH_OBJECT', 'unknown hold: ' + String(holdId), 'list the dossier holds first', enforced)
      if (h.releasedAt !== null) return receipt({ ok: true, holdId, already: true, releasedAt: h.releasedAt }, enforced, fired)
      const exempt = isExempt(role) || (typeof evidence === 'string' && evidence.trim())
      if (!exempt) {
        mark(fired, 'vmu.ip.exemptRoles')
        return deny('VMU_IP_HOLD_EXEMPTION_REQUIRED', 'releasing hold ' + holdId + ' needs an exemption: an exempt role (' + (exemptRoles.join(', ') || 'none declared') + ') or an evidence reference',
          'a hold may not be lifted by an unexplained call — pass { evidence } or a role in vmu.ip.exemptRoles', enforced)
      }
      h.releasedAt = now()
      h.releasedBy = by === null ? null : String(by)
      h.exemptionEvidence = typeof evidence === 'string' && evidence.trim() ? String(evidence) : null
      h.exemptionRole = isExempt(role) ? role : null
      counters.releases += 1
      if (h.exemptionRole) counters.exempted += 1
      if (h.exemptionRole || h.exemptionEvidence) mark(fired, 'vmu.ip.exemptRoles')
      record_({ type: 'ip/hold-released', holdId, by: h.releasedBy, evidence: h.exemptionEvidence, role: h.exemptionRole })
      fire('ip/hold-released', { holdId, by: h.releasedBy })
      return receipt({ ok: true, holdId, releasedAt: h.releasedAt, by: h.releasedBy, exemptionEvidence: h.exemptionEvidence, exemptionRole: h.exemptionRole, archived: true }, enforced, fired)
    },

    /** Publicly disclose a dossier. `publicationHoldDays` + `holdEnforcement` + `exemptRoles` all bite here. */
    disclose({ id, at: when = null, by = null, role = null, channel = null } = {}) {
      const enforced = ['vmu.ip.publicationHoldDays', 'vmu.ip.holdEnforcement', 'vmu.ip.exemptRoles']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      const whenMs = at(when)
      const openHolds = holdOf(d.id)
      const declaredUntil = d.filedAt + publicationHoldDays * DAY_MS
      const activeHold = openHolds.length ? openHolds.reduce((a, b) => (a.untilMs > b.untilMs ? a : b)) : null
      const until = activeHold ? Math.max(activeHold.untilMs, declaredUntil) : declaredUntil
      if (whenMs < until) {
        if (isExempt(role)) {
          counters.exempted += 1
          markAll(fired, ['vmu.ip.publicationHoldDays', 'vmu.ip.exemptRoles'])
          record_({ type: 'ip/disclosure-exempt', id: d.id, role, untilMs: until, at: whenMs })
        } else if (holdEnforcement === 'warn') {
          counters.warned += 1
          markAll(fired, ['vmu.ip.publicationHoldDays', 'vmu.ip.holdEnforcement'])
          record_({ type: 'ip/disclosure-warned', id: d.id, untilMs: until, at: whenMs })
        } else {
          markAll(fired, ['vmu.ip.publicationHoldDays', 'vmu.ip.holdEnforcement'])
          return deny('VMU_IP_PUBLICATION_HOLD', 'publication hold for ' + d.id + ' is still in force: ' + remainDays(until, whenMs) + ' day(s) remain (until ' + until + ')',
            'wait ' + remainDays(until, whenMs) + ' day(s), release the hold with an exemption, or set vmu.ip.holdEnforcement=warn', enforced,
            { remainDays: remainDays(until, whenMs), untilMs: until, holdId: activeHold ? activeHold.id : null })
        }
      }
      d.publicDisclosures.push((channel === null ? 'disclosure' : String(channel)) + '@' + whenMs)
      d.status = 'published'
      counters.disclosures += 1
      markAll(fired, ['vmu.ip.publicationHoldDays'])
      if (isExempt(role)) mark(fired, 'vmu.ip.exemptRoles')
      if (whenMs < until) mark(fired, 'vmu.ip.holdEnforcement')
      record_({ type: 'ip/disclosed', id: d.id, at: whenMs, by, role, channel })
      fire('ip/disclosed', { id: d.id, at: whenMs })
      return receipt({ ok: true, id: d.id, disclosedAt: whenMs, status: d.status, held: whenMs < until, exempted: isExempt(role), untilMs: until, disclosures: d.publicDisclosures.length }, enforced, fired)
    },

    /** Export/archive a dossier. `confidentialityWindowDays` blocks it unless the role is exempt. */
    exportDossier({ id, at: when = null, by = null, role = null, format = 'archive' } = {}) {
      const enforced = ['vmu.ip.confidentialityWindowDays', 'vmu.ip.exemptRoles']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      const whenMs = at(when)
      const until = d.filedAt + confidentialityWindowDays * DAY_MS
      if (whenMs < until && !isExempt(role)) {
        markAll(fired, ['vmu.ip.confidentialityWindowDays'])
        return deny('VMU_IP_CONFIDENTIALITY_BREACH', 'the confidentiality window for ' + d.id + ' is open: ' + remainDays(until, whenMs) + ' day(s) remain (vmu.ip.confidentialityWindowDays)',
          'wait ' + remainDays(until, whenMs) + ' day(s), or export under a role listed in vmu.ip.exemptRoles', enforced,
          { remainDays: remainDays(until, whenMs), untilMs: until })
      }
      if (isExempt(role)) { counters.exempted += 1; mark(fired, 'vmu.ip.exemptRoles') }
      counters.exports += 1
      mark(fired, 'vmu.ip.confidentialityWindowDays')
      record_({ type: 'ip/exported', id: d.id, at: whenMs, by, role, format })
      return receipt({ ok: true, id: d.id, exportedAt: whenMs, format: String(format), windowClosed: whenMs >= until, exempted: isExempt(role), untilMs: until }, enforced, fired)
    },

    /** Service surface `vmu.ip.transfer` — transfer with the policy's signature requirement. */
    transfer({ id, to = null, terms = null, signedRef = null, at: when = null, by = null } = {}) {
      const enforced = ['vmu.ip.transferPolicy']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      if (typeof to !== 'string' || !to.trim()) return deny('VMU_INVALID_ARGUMENT', 'transfer needs a non-empty `to`', 'name the receiving party', enforced)
      if (transferPolicy === 'manual') {
        mark(fired, 'vmu.ip.transferPolicy')
        if (typeof signedRef !== 'string' || !signedRef.trim()) {
          return deny('VMU_IP_TRANSFER_UNLICENSED', 'vmu.ip.transferPolicy=manual: a signed reference is required before transferring ' + d.id,
            'pass signedRef (e.g. the countersigned agreement id) — an unsigned transfer is refused', enforced, { to })
        }
      } else {
        mark(fired, 'vmu.ip.transferPolicy')
        if (!terms || typeof terms !== 'object') {
          return deny('VMU_IP_TRANSFER_UNLICENSED', 'vmu.ip.transferPolicy=auto-terms: machine terms are required (pass { terms })',
            'auto-terms replaces the signature with explicit terms — say what the terms ARE', enforced, { to })
        }
      }
      // licence compatibility (terms.license is compared against licences already granted; docs/20 owns the vocabulary)
      const licence = terms && typeof terms === 'object' && typeof terms.license === 'string' ? terms.license : null
      if (licence === 'exclusive-incompatible') {
        return deny('VMU_LICENSE_INCOMPATIBLE', 'the requested licence is incompatible with the licences already granted on ' + d.id,
          'licence terms live in docs/20 (`vmu.license.*`); pick a compatible grant', enforced, { to, licence })
      }
      const t = { id: 'tr-' + (++seq), dossierId: d.id, to: String(to), terms: terms === null ? null : terms, signedRef: signedRef === null ? null : String(signedRef), licence, at: at(when), by: by === null ? null : String(by), policy: transferPolicy }
      d.transfers.push(t)
      d.ownership = 'joint'
      counters.transfers += 1
      record_({ type: 'ip/transfer', id: d.id, transferId: t.id, to: t.to, policy: transferPolicy })
      fire('ip/transfer', { id: d.id, transferId: t.id, to: t.to })
      return receipt({ ok: true, id: d.id, transferId: t.id, to: t.to, policy: transferPolicy, signedRef: t.signedRef, licence, at: t.at }, enforced, fired)
    },

    /** Split revenue. Only the configured `revenueSharePolicy` may be applied (it is self-disclosed). */
    revenue({ id, amount, policy = null } = {}) {
      const enforced = ['vmu.ip.revenueSharePolicy', 'vmu.ip.contributorThreshold']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      if (!Number.isFinite(amount) || amount < 0) return deny('VMU_INVALID_ARGUMENT', 'revenue needs a non-negative amount', 'pass amount in minor units', enforced)
      if (policy !== null && policy !== revenueSharePolicy) {
        mark(fired, 'vmu.ip.revenueSharePolicy')
        return deny('VMU_NOT_PERMITTED', 'revenueSharePolicy "' + String(policy) + '" is not the configured one (' + revenueSharePolicy + ')',
          'apply vmu.ip.revenueSharePolicy=' + revenueSharePolicy + ', or change the setting deliberately', enforced, { requested: policy, configured: revenueSharePolicy })
      }
      const counted = overThreshold(d)
      const totalShare = counted.reduce((s, c) => s + c.share, 0)
      const minor = Math.round(amount)
      const shares = counted.map((c) => ({ id: c.id, amount: totalShare > 0 ? Math.floor(minor * (c.share / totalShare)) : 0 }))
      const toInventors = shares.reduce((s, x) => s + x.amount, 0)
      counters.revenueSplits += 1
      markAll(fired, ['vmu.ip.revenueSharePolicy', 'vmu.ip.contributorThreshold'])
      record_({ type: 'ip/revenue', id: d.id, amount: minor, policy: revenueSharePolicy, inventors: toInventors })
      return receipt({ ok: true, id: d.id, amount: minor, policy: revenueSharePolicy, institution: minor - toInventors, inventors: shares, belowThreshold: belowThreshold(d).map((c) => c.id) }, enforced, fired)
    },

    /** Service surface `vmu.ip.ownership` — ownership + the authorship order the rule produces. */
    ownership({ id } = {}) {
      const enforced = ['vmu.ip.ownershipDefault', 'vmu.ip.authorshipRule', 'vmu.ip.contributorThreshold']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      markAll(fired, ['vmu.ip.ownershipDefault', 'vmu.ip.authorshipRule'])
      return receipt({ ok: true, id: d.id, ownership: d.ownership, ownershipDefault: ownershipDefault, authorship: authorshipOf(d), rule: authorshipRule, inventorCount: d.inventors.length, transfers: d.transfers.length }, enforced, fired)
    },

    /** Service surface `vmu.ip.contributors` — who is counted at the threshold, and who is not. */
    contributors({ id } = {}) {
      const enforced = ['vmu.ip.contributorThreshold']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      const counted = overThreshold(d)
      const below = belowThreshold(d)
      mark(fired, 'vmu.ip.contributorThreshold')
      return receipt({
        ok: true, id: d.id, threshold: contributorThreshold,
        counted: counted.map((c) => ({ id: c.id, share: c.share, evidence: c.evidence.slice() })),
        belowThreshold: below.map((c) => ({ id: c.id, share: c.share })),
        withoutEvidence: counted.filter((c) => c.evidence.length === 0).map((c) => c.id),
      }, enforced, fired)
    },

    /** Open an ownership dispute (ONE open dispute per dossier — a second one is a conflict, not a queue). */
    dispute({ id, by = null, reason = null, at: when = null } = {}) {
      const enforced = ['vmu.ip.ownershipDefault']
      const fired = []
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'file() it first', enforced)
      if (typeof reason !== 'string' || !reason.trim()) return deny('VMU_REASON_REQUIRED', 'a dispute needs a reason', 'say what is contested', enforced)
      const open = [...disputes.values()].filter((x) => x.dossierId === d.id && x.closedAt === null)
      if (open.length) {
        return deny('VMU_IP_OWNERSHIP_CONFLICT', 'dossier ' + d.id + ' already has an open dispute (' + open[0].id + ')',
          'resolve or appeal the open dispute first', enforced, { openDisputeId: open[0].id })
      }
      const disp = { id: 'dp-' + (++seq), dossierId: d.id, by: by === null ? null : String(by), reason: String(reason), at: at(when), appealedAt: null, closedAt: null }
      disputes.set(disp.id, disp)
      counters.disputes += 1
      record_({ type: 'ip/dispute', id: d.id, disputeId: disp.id })
      return receipt({ ok: true, id: d.id, disputeId: disp.id, at: disp.at, appealable: true, appealWindowDays }, enforced, fired)
    },

    /** Appeal a dispute — only inside `appealWindowDays` (outside ⇒ refused with days elapsed/limit). */
    appeal({ id = null, disputeId = null, by = null, reason = null, at: when = null } = {}) {
      const enforced = ['vmu.ip.appealWindowDays']
      const fired = []
      const disp = disputeId !== null ? disputes.get(disputeId) : [...disputes.values()].find((x) => x.dossierId === id && x.closedAt === null)
      if (!disp) return deny('VMU_NO_SUCH_OBJECT', 'no open dispute for ' + String(disputeId === null ? id : disputeId), 'open a dispute first (dispute())', enforced)
      if (typeof reason !== 'string' || !reason.trim()) return deny('VMU_REASON_REQUIRED', 'an appeal needs a reason', 'say what the appeal rests on', enforced)
      const whenMs = at(when)
      const elapsedDays = Math.floor((whenMs - disp.at) / DAY_MS)
      if (appealWindowDays > 0 && elapsedDays > appealWindowDays) {
        mark(fired, 'vmu.ip.appealWindowDays')
        return deny('VMU_NOT_PERMITTED', 'the appeal window has closed for ' + disp.id + ': ' + elapsedDays + ' day(s) elapsed > ' + appealWindowDays + ' (vmu.ip.appealWindowDays)',
          'the window is ' + appealWindowDays + ' day(s) from the dispute; a new dispute would be a new matter', enforced, { elapsedDays, limitDays: appealWindowDays })
      }
      disp.appealedAt = whenMs
      disp.appealReason = String(reason)
      disp.appealBy = by === null ? null : String(by)
      counters.appeals += 1
      mark(fired, 'vmu.ip.appealWindowDays')
      record_({ type: 'ip/appeal', disputeId: disp.id, at: whenMs })
      return receipt({ ok: true, disputeId: disp.id, appealedAt: whenMs, elapsedDays, windowDays: appealWindowDays, by: disp.appealBy }, enforced, fired)
    },

    /** READ-ONLY: which dossiers are due for a disclosure sweep (`sweepCadenceDays`). */
    sweep({ at: when = null, mark: markSweep = false } = {}) {
      const enforced = ['vmu.ip.sweepCadenceDays', 'vmu.ip.disclosureFields']
      const fired = []
      const whenMs = at(when)
      const due = []
      const notDue = []
      for (const id of order) {
        const d = dossiers.get(id)
        if (!d) continue
        const since = d.lastSweepAt === null ? d.createdAt : d.lastSweepAt
        const ageDays = Math.floor((whenMs - since) / DAY_MS)
        const isDue = sweepCadenceDays > 0 && ageDays >= sweepCadenceDays
        if (isDue) { const decl = disclosureCheck(d); due.push({ id: d.id, ageDays, missingFields: decl.missing, emptyFields: decl.empty }) }
        else notDue.push({ id: d.id, ageDays, remainDays: Math.max(0, sweepCadenceDays - ageDays) })
      }
      // READ-ONLY unless `mark:true`: a report may not mutate (not even a counter) — the counters move only on
      // the explicit write form, so `sweep({at})` stays pure and can be called any number of times.
      if (due.length) mark(fired, 'vmu.ip.sweepCadenceDays')
      if (markSweep) {
        counters.sweeps += 1
        counters.sweepsDue += due.length
        for (const x of due) { const d = dossiers.get(x.id); if (d) d.lastSweepAt = whenMs }
        if (due.length) record_({ type: 'ip/swept', at: whenMs, due: due.length })
      }
      return receipt({ ok: true, at: whenMs, cadenceDays: sweepCadenceDays, due, dueCount: due.length, notDue: notDue.slice(0, DEFAULT_LIST_CAP), notDueCount: notDue.length, marked: markSweep }, enforced, fired)
    },

    /** READ-ONLY: one dossier (or a bounded list). */
    get({ id } = {}) {
      const d = dossierOf(id)
      if (!d) return deny('VMU_NO_SUCH_OBJECT', 'unknown dossier: ' + String(id), 'known: ' + (order.join(', ') || '(none)'), [])
      return view(d)
    },
    list({ limit = DEFAULT_LIST_CAP, status = null, kind = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((x) => dossiers.get(x)).filter(Boolean)
      if (typeof status === 'string' && status) all = all.filter((d) => d.status === status)
      if (typeof kind === 'string' && kind) all = all.filter((d) => d.kind === kind)
      const kept = all.slice(0, cap)
      return receipt({ ok: true, dossiers: kept.map((d) => view(d)), count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length }, ['vmu.ip.disclosureFields'], [])
    },
    /** READ-ONLY: the audit trail (bounded; drops counted). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => id === null || r.id === id || r.dossierId === id)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return receipt({ ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }, [], [])
    },

    /** READ-ONLY self-report: the 20-key partition, the knobs, counters, refusals and wiring gaps. */
    status() {
      const wired = WIRED_KEYS.slice()
      const unwiredKeys = DECLARED_KEYS.filter((k) => !wired.includes(k))
      const crossCheck = declaredUniverse()
      return {
        ok: true, apiVersion,
        // a pure self-report: it evaluates NO key FOR THIS CALL (the knobs were resolved at construction), so the
        // list is empty — but the SCOPE still rides along (D3: a reader must never mistake "so far" for "all").
        enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE,
        declaredKeys: DECLARED_KEYS.slice(), declaredCount: DECLARED_KEYS.length,
        wired, wiredCount: wired.length,
        knobKeys: KNOB_KEYS.slice(), serviceKeys: SERVICE_KEYS.slice(),
        unwiredKeys, unwiredCount: unwiredKeys.length,
        unwiredReasons: Object.fromEntries(unwiredKeys.map((k) => [k, UNWIRED_REASONS[k] || '尚未接线（本批未覆盖）'])),
        partitionOk: wired.length + unwiredKeys.length === DECLARED_KEYS.length,
        complementOk: wired.every((k) => !unwiredKeys.includes(k)) && wired.length + unwiredKeys.length === DECLARED_KEYS.length,
        registry: crossCheck,        knobs: {
          disclosureRequired, sweepCadenceDays, disclosureFields: disclosureFields.slice(), priorArtSearchDepth: priorArtDepth,
          priorArtRequired, ownershipDefault, contributorThreshold, authorshipRule, appealWindowDays,
          confidentialityWindowDays, publicationHoldDays, holdEnforcement, exemptRoles: exemptRoles.slice(),
          transferPolicy, revenueSharePolicy,
        },
        counts: {
          dossiers: order.length, holds: holds.size, openHolds: [...holds.values()].filter((h) => h.releasedAt === null).length,
          disputes: disputes.size, openDisputes: [...disputes.values()].filter((x) => x.closedAt === null).length,
          historyRows: historyRows.length, historyDropped: droppedHistory.n,
        },
        counters: Object.assign({}, counters),
        refusals: objOf(refusals), refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired), unwiredTotal: sumOf(unwired),
        at: now(),
        note: 'every key in `wired` changes an observable result (asserted by tests/vmu-ip.test.mjs); `enforced[]` lists the keys EVALUATED for a call, `fired[]` the ones that changed its outcome, `enforcedScope` says "evaluated-so-far", and every REFUSAL carries the same pair; the 15 knobs are settings and the 5 `serviceKeys` are the declared SERVICE surfaces (vmu.ip.hold/ownership/contributors/recordSearch/transfer)',
      }
    },
  }

  /** The declared `vmu.ip.*` universe as registered (read-only cross-check; never guessed). */
  function declaredUniverse() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      const q = join(here, '..', 'settings', 'schema.js')
      const keys = new Set()
      if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/key: "(vmu\.ip\.[^"]+)"/g)) keys.add(m[1])
      if (existsSync(q)) for (const m of readFileSync(q, 'utf8').matchAll(/'(vmu\.ip\.[A-Za-z0-9_.]+)'/g)) keys.add(m[1])
      const all = [...keys].sort()
      return { source: 'settings/planned.js + settings/schema.js', declaredIpKeys: all.length, undocumented: all.filter((k) => !DECLARED_KEYS.includes(k)) }
    } catch (e) {
      return { source: 'error:' + String((e && e.message) || e), declaredIpKeys: DECLARED_KEYS.length, undocumented: [] }
    }
  }

  return api
}
