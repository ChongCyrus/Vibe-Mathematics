// vmu kernel · conference — the CROSS-SESSION conference-organiser face (docs/08, docs/16 §8).
//
// LAYERING (explicit, and the reason this module exists): `kernel/meetings.js` is the POLICY LAYER OF ONE
// MEETING (open/speak/vote/close). This module is the ORGANISER above it — call for papers, submissions,
// reviewer assignment, review rounds, registration and agenda orchestration — and it REFERENCES the meeting
// layer rather than redefining it: a conference's sessions are created by the caller through
// `kernel/meetings`, and this face only plans them (`planAgenda`), never opens or votes them.
//
// The 18 declared `vmu.conference.*` keys (docs/08/16) are READ HERE, one wired behaviour each — the accepted
// `kernel/mathtools.js` standard:
//   · every receipt carries `enforced[]` (the keys consulted) and `fired[]` (the subset that actually changed
//     the outcome), with `fired ⊆ enforced` and no duplicates;
//   · EVERY refusal carries an ARRAY `enforced` plus `enforcedScope:'evaluated-so-far'` — the keys evaluated up
//     to the moment of refusal, never a claim about the whole set (round 26 / D3 discipline);
//   · a declared key that is NOT wired is named in `status().plannedKeys` with its reason;
//   · refusals are counted BY CODE; the clock is injected; read surfaces never mutate; zero mechanism is inert.
//
// Codes are all ALREADY REGISTERED in 03-§8 (the VMU_CONF_* / VMU_SUBMISSION_* / VMU_REVIEW_* families); this
// file invents none: VMU_CONF_CFP_CLOSED · VMU_CONF_REGISTRATION_CLOSED · VMU_CONF_REVIEW_QUORUM_MISSING ·
// VMU_CONF_SUBMISSION_INVALID · VMU_CONF_ASSIGNMENT_CONFLICT · VMU_CONF_CAP_REACHED ·
// VMU_CONF_SCHEDULE_CONFLICT · VMU_SUBMISSION_DUPLICATE · VMU_REVIEW_DUE · VMU_REVIEW_RUBRIC_REQUIRED ·
// VMU_REVIEW_SELF_DENIED · VMU_REVIEW_EVIDENCE_REQUIRED · VMU_COMPLIANCE_COI_UNDISCLOSED ·
// VMU_OUTREACH_ANONYMITY_BREACH · VMU_REASON_REQUIRED · VMU_NOT_PERMITTED · VMU_STATE · VMU_NO_SUCH_OBJECT ·
// VMU_INVALID_ARGUMENT
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apiVersion = 1

/** The D3 (round 26) scope marker: `enforced[]` is what had been evaluated WHEN the refusal happened. */
export const ENFORCED_SCOPE = 'evaluated-so-far'

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 18 declared keys this face wires (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze([
  'vmu.conference.cfpOpenMs', 'vmu.conference.cfpCloseMs', 'vmu.conference.topicsRequired',
  'vmu.conference.anonymityMode', 'vmu.conference.reviewerConflicts', 'vmu.conference.proceedingsTrack',
  'vmu.conference.assign', 'vmu.conference.reviewAssignmentsPerPaper', 'vmu.conference.reviewDeadlineDays',
  'vmu.conference.metaReviewRequired', 'vmu.conference.register', 'vmu.conference.registrationCap',
  'vmu.conference.registrationFeeMinor', 'vmu.conference.waiverPolicy',
  'vmu.conference.schedule', 'vmu.conference.slotMinutes', 'vmu.conference.maxParallelTracks', 'vmu.conference.scheduleTz',
])

/** Why a declared-but-unwired key would not be honoured (kept for future declarations). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.conference': '尚未接线：本面只覆盖 08/16 卷声明的 18 条会议主办旋钮；新声明的键需要一个语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

const DAY_MS = 86400000
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])

const DEFAULT_SETTINGS = Object.freeze({
  'vmu.conference.cfpOpenMs': 0, 'vmu.conference.cfpCloseMs': 0, 'vmu.conference.topicsRequired': false,
  'vmu.conference.anonymityMode': 'single', 'vmu.conference.reviewerConflicts': false,
  'vmu.conference.proceedingsTrack': '', 'vmu.conference.assign': 'manual',
  'vmu.conference.reviewAssignmentsPerPaper': 2, 'vmu.conference.reviewDeadlineDays': 21,
  'vmu.conference.metaReviewRequired': false, 'vmu.conference.register': true,
  'vmu.conference.registrationCap': 0, 'vmu.conference.registrationFeeMinor': 0,
  'vmu.conference.waiverPolicy': 'require-reason',
  'vmu.conference.schedule': 'sequential', 'vmu.conference.slotMinutes': 30,
  'vmu.conference.maxParallelTracks': 1, 'vmu.conference.scheduleTz': 'UTC',
})

export function createConference({ clock = () => 0, log = null, settings = {}, bus = null, meetings = null } = {}) {
  if (typeof clock !== 'function') {
    throw Object.assign(refuse('VMU_INVALID_ARGUMENT', 'createConference needs a clock function',
      'pass { clock: () => ms } — the only time source is the injected clock'), { enforced: [], enforcedScope: ENFORCED_SCOPE })
  }
  let settingsReads = 0
  const sget = (key) => {
    settingsReads += 1
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULT_SETTINGS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULT_SETTINGS[key]
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* advisory */ } } }
  const emit = (ev) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(ev) } catch (e) { /* advisory */ } } }

  const K = {
    cfpOpenMs: intOr(sget('vmu.conference.cfpOpenMs'), 0),
    cfpCloseMs: intOr(sget('vmu.conference.cfpCloseMs'), 0),
    topicsRequired: sget('vmu.conference.topicsRequired') === true || Array.isArray(sget('vmu.conference.topicsRequired')),
    topicsList: listOr(sget('vmu.conference.topicsRequired')),
    anonymityMode: ['single', 'double', 'open'].includes(sget('vmu.conference.anonymityMode')) ? sget('vmu.conference.anonymityMode') : 'single',
    reviewerConflicts: sget('vmu.conference.reviewerConflicts') === true || Array.isArray(sget('vmu.conference.reviewerConflicts')),
    proceedingsTrack: str(sget('vmu.conference.proceedingsTrack')),
    assign: ['auto', 'manual', 'off'].includes(sget('vmu.conference.assign')) ? sget('vmu.conference.assign') : 'manual',
    perPaper: intOr(sget('vmu.conference.reviewAssignmentsPerPaper'), 2),
    deadlineDays: intOr(sget('vmu.conference.reviewDeadlineDays'), 21),
    metaReviewRequired: sget('vmu.conference.metaReviewRequired') === true,
    register: sget('vmu.conference.register') !== false,
    cap: intOr(sget('vmu.conference.registrationCap'), 0),
    feeMinor: intOr(sget('vmu.conference.registrationFeeMinor'), 0),
    waiverPolicy: ['never', 'always', 'require-reason'].includes(sget('vmu.conference.waiverPolicy')) ? sget('vmu.conference.waiverPolicy') : 'require-reason',
    schedule: ['sequential', 'parallel'].includes(sget('vmu.conference.schedule')) ? sget('vmu.conference.schedule') : 'sequential',
    slotMinutes: intOr(sget('vmu.conference.slotMinutes'), 30),
    maxParallelTracks: intOr(sget('vmu.conference.maxParallelTracks'), 1),
    scheduleTz: str(sget('vmu.conference.scheduleTz')) || 'UTC',
  }

  const counters = { opened: 0, submitted: 0, refused: 0, assigned: 0, reviewed: 0, decided: 0, registered: 0, agendas: 0, duplicates: 0, waivers: 0 }
  const refusals = new Map()
  const live = new Map()      // id -> conference
  const receiptRing = []
  const ringDropped = { n: 0 }

  /** The D3 refusal: an ARRAY `enforced` + the scope marker, always (never undefined/null). */
  const deny = (code, message, hint, enforced, fired) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    const firedKeys = Array.isArray(fired) ? fired.slice() : []
    try { say({ type: 'conference/refused', at: clock(), code, message, enforced: keys, fired: firedKeys, enforcedScope: ENFORCED_SCOPE }) } catch (e) { /* advisory */ }
    return Object.assign(refuse(code, message, hint), { enforced: keys, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, refusedAt: clock() })
  }
  const cap = (code, label, value, limit, key, enforced, fired) => {
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    if (!keys.includes(key)) keys.push(key)
    throw deny(code, label + ' exceeds ' + key + ': ' + value + ' > ' + limit,
      '现值=' + value + ', 上限=' + limit + ' (' + key + ')', keys, fired)
  }
  const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }
  const firedList = (evaluated, key) => (key === null || key === undefined ? [] : [key])
  const makeReceipt = (evaluated, fired, extra) => Object.assign({
    enforced: evaluated.slice(), fired: fired.slice().filter((k) => evaluated.includes(k)), enforcedScope: ENFORCED_SCOPE, at: clock(),
  }, extra || {})
  const pushReceipt = (r) => { receiptRing.push(r); while (receiptRing.length > 200) { receiptRing.shift(); ringDropped.n += 1 } }
  const conferenceOf = (id) => live.get(String(id))
  const must = (id) => {
    const c = conferenceOf(id)
    if (!c) {
      throw deny('VMU_NO_SUCH_OBJECT', 'no such conference: ' + String(id),
        live.size ? 'open ones: ' + [...live.keys()].sort().join(', ') : 'open a conference first (open())', [], [])
    }
    return c
  }

  const api = {
    apiVersion,
    WIRED_KEYS, UNWIRED_REASONS, ENFORCED_SCOPE,

    /** Open a conference. `cfpOpenMs`/`cfpCloseMs` must describe a usable window. */
    open({ id = null, topics = [], at = null } = {}) {
      const evaluated = []
      mark(evaluated, 'vmu.conference.cfpOpenMs')
      mark(evaluated, 'vmu.conference.cfpCloseMs')
      const now = at === null ? clock() : at
      const openMs = K.cfpOpenMs
      const closeMs = K.cfpCloseMs
      if (openMs > 0 && closeMs > 0 && closeMs <= openMs) {
        throw deny('VMU_CONF_SUBMISSION_INVALID',
          'the call-for-papers window is empty or inverted: open=' + openMs + ' close=' + closeMs,
          '现值=' + openMs + ' → ' + closeMs + ', 要求=close > open (vmu.conference.cfpOpenMs / cfpCloseMs)', evaluated, ['vmu.conference.cfpOpenMs'])
      }
      const cid = id === null ? 'c' + (counters.opened + 1) : String(id)
      if (live.has(cid)) throw deny('VMU_STATE', 'conference already open: ' + cid, 'close it or use another id', evaluated, [])
      const conf = {
        id: cid, topics: listOr(topics), openedAt: now, cfp: { openMs, closeMs },
        submissions: new Map(), reviews: [], assignments: [],
        registrations: [], agenda: null, anonymityMode: K.anonymityMode, proceedingsTrack: K.proceedingsTrack,
      }
      live.set(cid, conf)
      counters.opened += 1
      const receipt = makeReceipt(evaluated, evaluated, { action: 'open', conference: cid, cfp: conf.cfp, topics: conf.topics.length })
      pushReceipt(receipt)
      say({ type: 'conference/opened', at: now, conference: cid, enforced: receipt.enforced })
      return { ok: true, conference: cid, cfp: conf.cfp, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * Submit a paper. Rails: the CFP window (`cfpOpenMs`/`cfpCloseMs`), topic scope (`topicsRequired`),
     * the conflict declaration (`reviewerConflicts`), proceedings routing (`proceedingsTrack`), the slot
     * length (`slotMinutes`) and duplicate detection (VMU_SUBMISSION_DUPLICATE).
     */
    submit({ conference, id = null, title = null, authors = [], topics = [], minutes = 0, tz = null,
      conflictsDeclared = null, forProceedings = false, at = null } = {}) {
      const conf = must(conference)
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      if (!(typeof title === 'string' && title.trim())) {
        throw deny('VMU_CONF_SUBMISSION_INVALID', 'a submission needs a title', 'pass { title }', evaluated, fired)
      }
      // ① CFP window
      mark(evaluated, 'vmu.conference.cfpOpenMs')
      if (conf.cfp.openMs > 0 && now < conf.cfp.openMs) {
        throw deny('VMU_CONF_CFP_CLOSED', 'the call for papers has not opened yet', 'opens at ' + conf.cfp.openMs + 'ms (now ' + now + ')', evaluated, firedList(evaluated, 'vmu.conference.cfpOpenMs'))
      }
      mark(evaluated, 'vmu.conference.cfpCloseMs')
      if (conf.cfp.closeMs > 0 && now > conf.cfp.closeMs) {
        throw deny('VMU_CONF_CFP_CLOSED', 'the call for papers closed at ' + conf.cfp.closeMs + 'ms (submission at ' + now + ')',
          '现值=' + now + 'ms, 截止=' + conf.cfp.closeMs + 'ms (vmu.conference.cfpCloseMs)', evaluated, firedList(evaluated, 'vmu.conference.cfpCloseMs'))
      }
      // ② topic scope
      mark(evaluated, 'vmu.conference.topicsRequired')
      if (K.topicsRequired) {
        const declared = K.topicsList.length ? K.topicsList : conf.topics
        const given = listOr(topics)
        if (given.length === 0) {
          throw deny('VMU_CONF_SUBMISSION_INVALID', 'vmu.conference.topicsRequired: a submission must name its topics',
            'declared topics: ' + (declared.join(', ') || '(the conference declared none)'), evaluated, firedList(evaluated, 'vmu.conference.topicsRequired'))
        }
        if (declared.length) {
          const outside = given.filter((t) => !declared.includes(t))
          if (outside.length) {
            throw deny('VMU_CONF_SUBMISSION_INVALID', 'topic(s) outside the call-for-papers scope: ' + outside.join(', '),
              'declared: ' + declared.join(', ') + ' (vmu.conference.topicsRequired)', evaluated, firedList(evaluated, 'vmu.conference.topicsRequired'))
          }
        }
      }
      // ③ conflict declaration
      mark(evaluated, 'vmu.conference.reviewerConflicts')
      if (K.reviewerConflicts && conflictsDeclared !== true) {
        throw deny('VMU_COMPLIANCE_COI_UNDISCLOSED', 'vmu.conference.reviewerConflicts: the submission must carry a conflict declaration',
          'pass { conflictsDeclared: true } (with the conflicted reviewers) — an undeclared conflict is not reviewable', evaluated, firedList(evaluated, 'vmu.conference.reviewerConflicts'))
      }
      // ④ proceedings routing
      mark(evaluated, 'vmu.conference.proceedingsTrack')
      if (forProceedings && !K.proceedingsTrack) {
        throw deny('VMU_CONF_SUBMISSION_INVALID', 'the paper asks for the proceedings but no proceedings track is declared',
          'set vmu.conference.proceedingsTrack (e.g. "proceedings") or submit with forProceedings:false', evaluated, firedList(evaluated, 'vmu.conference.proceedingsTrack'))
      }
      // ⑤ agenda slot budget
      mark(evaluated, 'vmu.conference.slotMinutes')
      if (K.slotMinutes > 0 && intOr(minutes, 0) > K.slotMinutes) {
        cap('VMU_CONF_SCHEDULE_CONFLICT', 'talk length (minutes)', intOr(minutes, 0), K.slotMinutes, 'vmu.conference.slotMinutes', evaluated, firedList(evaluated, 'vmu.conference.slotMinutes'))
      }
      // ⑥ duplicate detection (same author set + same normalised title)
      const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
      const authorKey = listOr(authors).map((a) => String(a).trim()).sort().join('|')
      const dup = [...conf.submissions.values()].find((s) => s.authorKey === authorKey && norm(s.title) === norm(title))
      if (dup) {
        counters.duplicates += 1
        throw deny('VMU_SUBMISSION_DUPLICATE', 'this paper was already submitted as ' + dup.id,
          'same authors (' + (authorKey || '(none)') + ') and same title: withdraw ' + dup.id + ' instead of resubmitting', evaluated, [])
      }
      // ⑦ anonymity (observable in the reviewer view)
      mark(evaluated, 'vmu.conference.anonymityMode')
      const sid = id === null ? 's' + (conf.submissions.size + 1) : String(id)
      const sub = {
        id: sid, title: String(title), authors: listOr(authors), authorKey, topics: listOr(topics),
        minutes: intOr(minutes, 0), tz: tz === null ? K.scheduleTz : String(tz),
        conflictsDeclared: conflictsDeclared === true, forProceedings: forProceedings === true,
        proceedingsTrack: forProceedings ? K.proceedingsTrack : null,
        submittedAt: now, state: 'submitted', reviewers: [], reviews: [], decision: null,
      }
      conf.submissions.set(sid, sub)
      counters.submitted += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, {
        action: 'submit', conference: conf.id, submission: sid,
        anonymityMode: K.anonymityMode, authorsHiddenFromReviewers: K.anonymityMode === 'double',
        topics: sub.topics, proceedingsTrack: sub.proceedingsTrack, slotMinutes: K.slotMinutes,
      })
      pushReceipt(receipt)
      emit({ type: 'conference/submitted', at: now, conference: conf.id, submission: sid })
      return { ok: true, submission: sid, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * Assign reviewers. Rails: `assign` (auto|manual|off), `reviewAssignmentsPerPaper` (the threshold),
     * `reviewerConflicts` (conflicted reviewers are skipped/refused) and `reviewDeadlineDays` (the deadline).
     */
    assign({ conference, submission, reviewers = null, conflicted = [], eligible = null, at = null } = {}) {
      const conf = must(conference)
      const sub = conf.submissions.get(String(submission))
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      if (!sub) throw deny('VMU_NO_SUCH_OBJECT', 'no such submission: ' + String(submission), 'known: ' + ([...conf.submissions.keys()].join(', ') || '(none)'), evaluated, [])
      mark(evaluated, 'vmu.conference.assign')
      if (K.assign === 'off') {
        throw deny('VMU_NOT_PERMITTED', 'vmu.conference.assign=off: reviewer assignment is disabled',
          'set vmu.conference.assign to "auto" or "manual"', evaluated, firedList(evaluated, 'vmu.conference.assign'))
      }
      mark(evaluated, 'vmu.conference.reviewerConflicts')
      const conflictedList = listOr(conflicted)
      let chosen
      if (K.assign === 'auto') {
        const pool = listOr(eligible === null ? [] : eligible)
        if (pool.length === 0) {
          throw deny('VMU_CONF_REVIEW_QUORUM_MISSING', 'auto-assignment needs an eligible reviewer pool',
            'pass { eligible: [reviewerIds] } — the conference face does not invent reviewers', evaluated, firedList(evaluated, 'vmu.conference.assign'))
        }
        chosen = pool.filter((r) => !conflictedList.includes(r)).sort().slice(0, K.perPaper)
      } else {
        chosen = listOr(reviewers)
        const conflictedChosen = chosen.filter((r) => conflictedList.includes(r))
        if (conflictedChosen.length) {
          throw deny('VMU_CONF_ASSIGNMENT_CONFLICT', 'conflicted reviewer(s) cannot be assigned: ' + conflictedChosen.join(', '),
            'declared conflicts: ' + conflictedList.join(', ') + ' (vmu.conference.reviewerConflicts)', evaluated, firedList(evaluated, 'vmu.conference.reviewerConflicts'))
        }
      }
      // threshold (current / required) — this is the "评审人数不足 ⇒ 给当前/门槛" rail
      mark(evaluated, 'vmu.conference.reviewAssignmentsPerPaper')
      if (chosen.length < K.perPaper) {
        throw deny('VMU_CONF_REVIEW_QUORUM_MISSING', 'not enough reviewers for ' + sub.id + ': ' + chosen.length + '/' + K.perPaper,
          '现值=' + chosen.length + ', 门槛=' + K.perPaper + ' (vmu.conference.reviewAssignmentsPerPaper)', evaluated, firedList(evaluated, 'vmu.conference.reviewAssignmentsPerPaper'))
      }
      mark(evaluated, 'vmu.conference.reviewDeadlineDays')
      const deadlineAt = now + K.deadlineDays * DAY_MS
      sub.reviewers = chosen.slice()
      sub.deadlineAt = deadlineAt
      sub.state = 'under-review'
      const assignment = { id: 'a' + (conf.assignments.length + 1), submission: sub.id, reviewers: chosen.slice(), assignedAt: now, deadlineAt, assignedBy: K.assign, skippedConflicted: listOr(eligible === null ? [] : eligible).filter((r) => conflictedList.includes(r)) }
      conf.assignments.push(assignment)
      counters.assigned += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, { action: 'assign', conference: conf.id, submission: sub.id, reviewers: chosen.slice(), deadlineAt, assignedBy: K.assign })
      pushReceipt(receipt)
      say({ type: 'conference/assigned', at: now, conference: conf.id, submission: sub.id, enforced: receipt.enforced })
      return { ok: true, submission: sub.id, reviewers: chosen.slice(), deadlineAt, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * Record a review. Rails: `reviewDeadlineDays` (lateness), `reviewerConflicts` (conflicted or
     * self-reviewing reviewers), `metaReviewRequired` (rubric vs meta review) and `anonymityMode` (a
     * double-blind review may not carry the author's identity).
     */
    review({ conference, submission, reviewer, recommendation = 'accept', rubric = null, meta = false,
      authorName = null, at = null } = {}) {
      const conf = must(conference)
      const sub = conf.submissions.get(String(submission))
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      if (!sub) throw deny('VMU_NO_SUCH_OBJECT', 'no such submission: ' + String(submission), 'known: ' + ([...conf.submissions.keys()].join(', ') || '(none)'), evaluated, [])
      if (!(typeof reviewer === 'string' && reviewer)) throw deny('VMU_INVALID_ARGUMENT', 'a review needs a reviewer id', 'pass { reviewer }', evaluated, [])
      mark(evaluated, 'vmu.conference.reviewerConflicts')
      if (K.reviewerConflicts) {
        if (listOr(sub.authors).includes(reviewer)) {
          throw deny('VMU_REVIEW_SELF_DENIED', 'reviewer ' + reviewer + ' is an author of ' + sub.id,
            'vmu.conference.reviewerConflicts: a self-review is never allowed', evaluated, firedList(evaluated, 'vmu.conference.reviewerConflicts'))
        }
        if (listOr(sub.conflictedWith).includes(reviewer)) {
          throw deny('VMU_CONF_ASSIGNMENT_CONFLICT', 'reviewer ' + reviewer + ' declared a conflict with ' + sub.id,
            'vmu.conference.reviewerConflicts: conflicted reviewers do not review', evaluated, firedList(evaluated, 'vmu.conference.reviewerConflicts'))
        }
      }
      mark(evaluated, 'vmu.conference.reviewDeadlineDays')
      if (sub.deadlineAt && now > sub.deadlineAt) {
        throw deny('VMU_REVIEW_DUE', 'the review is late: submitted at ' + now + ', deadline was ' + sub.deadlineAt,
          '现值=' + now + 'ms, 截止=' + sub.deadlineAt + 'ms (' + K.deadlineDays + ' days, vmu.conference.reviewDeadlineDays)', evaluated, firedList(evaluated, 'vmu.conference.reviewDeadlineDays'))
      }
      mark(evaluated, 'vmu.conference.anonymityMode')
      if (K.anonymityMode === 'double' && authorName) {
        throw deny('VMU_OUTREACH_ANONYMITY_BREACH', 'a double-blind review cannot carry the author identity ("' + authorName + '")',
          'vmu.conference.anonymityMode=double: strip the identity from the review payload', evaluated, firedList(evaluated, 'vmu.conference.anonymityMode'))
      }
      mark(evaluated, 'vmu.conference.metaReviewRequired')
      if (!meta && K.metaReviewRequired && !rubric) {
        throw deny('VMU_REVIEW_RUBRIC_REQUIRED', 'a review needs a rubric here (or submit the meta review with meta:true)',
          'vmu.conference.metaReviewRequired=true: every first-round review is rubric-backed', evaluated, firedList(evaluated, 'vmu.conference.metaReviewRequired'))
      }
      const review = { id: 'r' + (conf.reviews.length + 1), submission: sub.id, reviewer: String(reviewer), recommendation: String(recommendation), rubric: rubric === null ? null : rubric, meta: meta === true, at: now }
      conf.reviews.push(review)
      sub.reviews.push(review.id)
      counters.reviewed += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, { action: 'review', conference: conf.id, submission: sub.id, reviewer: review.reviewer, meta: review.meta, anonymityMode: K.anonymityMode })
      pushReceipt(receipt)
      return { ok: true, review: review.id, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /** Decide a submission. `metaReviewRequired` demands the meta review; `proceedingsTrack` routes the paper. */
    decide({ conference, submission, decision = 'accept', forProceedings = null, at = null } = {}) {
      const conf = must(conference)
      const sub = conf.submissions.get(String(submission))
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      if (!sub) throw deny('VMU_NO_SUCH_OBJECT', 'no such submission: ' + String(submission), 'known: ' + ([...conf.submissions.keys()].join(', ') || '(none)'), evaluated, [])
      mark(evaluated, 'vmu.conference.metaReviewRequired')
      if (K.metaReviewRequired && decision === 'accept') {
        const hasMeta = conf.reviews.some((r) => r.submission === sub.id && r.meta === true)
        if (!hasMeta) {
          throw deny('VMU_REVIEW_EVIDENCE_REQUIRED', 'vmu.conference.metaReviewRequired=true: an acceptance needs the meta review as evidence',
            'record the meta review first (review({ meta:true }))', evaluated, firedList(evaluated, 'vmu.conference.metaReviewRequired'))
        }
      }
      mark(evaluated, 'vmu.conference.proceedingsTrack')
      const wantsProceedings = forProceedings === null ? sub.forProceedings : forProceedings === true
      if (wantsProceedings && !K.proceedingsTrack) {
        throw deny('VMU_CONF_SUBMISSION_INVALID', 'the paper is routed to the proceedings but no proceedings track is declared',
          'set vmu.conference.proceedingsTrack', evaluated, firedList(evaluated, 'vmu.conference.proceedingsTrack'))
      }
      sub.decision = { at: now, decision: String(decision), proceedingsTrack: wantsProceedings ? K.proceedingsTrack : null }
      sub.state = String(decision) === 'accept' ? 'accepted' : 'rejected'
      counters.decided += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, { action: 'decide', conference: conf.id, submission: sub.id, decision: sub.decision.decision, proceedingsTrack: sub.decision.proceedingsTrack })
      pushReceipt(receipt)
      return { ok: true, submission: sub.id, decision: sub.decision, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /** Register an attendee. Rails: `register`, `registrationCap`, `registrationFeeMinor`, `waiverPolicy`. */
    register({ conference, attendee, waiver = false, waiverReason = null, at = null } = {}) {
      const conf = must(conference)
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      if (!(typeof attendee === 'string' && attendee)) throw deny('VMU_INVALID_ARGUMENT', 'a registration needs an attendee id', 'pass { attendee }', evaluated, [])
      mark(evaluated, 'vmu.conference.register')
      if (!K.register) {
        throw deny('VMU_CONF_REGISTRATION_CLOSED', 'vmu.conference.register=false: registration is closed',
          'set vmu.conference.register=true to open it', evaluated, firedList(evaluated, 'vmu.conference.register'))
      }
      mark(evaluated, 'vmu.conference.registrationCap')
      if (K.cap > 0 && conf.registrations.length >= K.cap) {
        cap('VMU_CONF_CAP_REACHED', 'registrations', conf.registrations.length, K.cap, 'vmu.conference.registrationCap', evaluated, firedList(evaluated, 'vmu.conference.registrationCap'))
      }
      mark(evaluated, 'vmu.conference.waiverPolicy')
      let charged = K.feeMinor
      let waiverGranted = false
      if (waiver) {
        if (K.waiverPolicy === 'never') {
          throw deny('VMU_NOT_PERMITTED', 'vmu.conference.waiverPolicy=never: waivers are not granted',
            'pay the declared fee (vmu.conference.registrationFeeMinor=' + K.feeMinor + ')', evaluated, firedList(evaluated, 'vmu.conference.waiverPolicy'))
        }
        if (K.waiverPolicy === 'require-reason' && !(typeof waiverReason === 'string' && waiverReason.trim())) {
          throw deny('VMU_REASON_REQUIRED', 'vmu.conference.waiverPolicy=require-reason: a waiver needs a reason',
            'pass { waiverReason } — an unexplained waiver is not auditable', evaluated, firedList(evaluated, 'vmu.conference.waiverPolicy'))
        }
        waiverGranted = true
        charged = 0
        counters.waivers += 1
      }
      mark(evaluated, 'vmu.conference.registrationFeeMinor')
      const reg = { id: 'g' + (conf.registrations.length + 1), attendee: String(attendee), at: now, feeMinor: charged, listFeeMinor: K.feeMinor, waiver: waiverGranted, waiverReason: waiverReason === null ? null : String(waiverReason) }
      conf.registrations.push(reg)
      counters.registered += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, { action: 'register', conference: conf.id, attendee: reg.attendee, feeMinor: charged, listFeeMinor: K.feeMinor, waiver: waiverGranted })
      pushReceipt(receipt)
      return { ok: true, registration: reg.id, feeMinor: charged, listFeeMinor: K.feeMinor, waiver: waiverGranted, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * Plan the agenda. Rails: `schedule` (sequential|parallel), `slotMinutes` (per-item budget),
     * `maxParallelTracks` (how many tracks may run at once) and `scheduleTz` (one timezone per agenda).
     */
    planAgenda({ conference, items = [], at = null } = {}) {
      const conf = must(conference)
      const evaluated = []
      const fired = []
      const now = at === null ? clock() : at
      const list = Array.isArray(items) ? items : []
      mark(evaluated, 'vmu.conference.scheduleTz')
      const tz = K.scheduleTz
      const badTz = list.filter((i) => i && i.tz !== undefined && String(i.tz) !== tz)
      if (badTz.length) {
        throw deny('VMU_CONF_SCHEDULE_CONFLICT', 'agenda item(s) in another timezone: ' + badTz.map((i) => i.id).join(', '),
          'the agenda runs in ' + tz + ' (vmu.conference.scheduleTz); convert the items first', evaluated, firedList(evaluated, 'vmu.conference.scheduleTz'))
      }
      mark(evaluated, 'vmu.conference.slotMinutes')
      const tooLong = list.filter((i) => i && intOr(i.minutes, 0) > K.slotMinutes)
      if (tooLong.length) {
        cap('VMU_CONF_SCHEDULE_CONFLICT', 'agenda item length (minutes)', Math.max(...tooLong.map((i) => intOr(i.minutes, 0))), K.slotMinutes, 'vmu.conference.slotMinutes', evaluated, firedList(evaluated, 'vmu.conference.slotMinutes'))
      }
      mark(evaluated, 'vmu.conference.schedule')
      mark(evaluated, 'vmu.conference.maxParallelTracks')
      let placements
      if (K.schedule === 'sequential') {
        placements = list.map((i, idx) => ({ id: i && i.id !== undefined ? i.id : null, track: 0, slot: idx, minutes: intOr(i && i.minutes, 0), tz }))
      } else {
        const tracks = Math.max(1, K.maxParallelTracks)
        if (tracks === 1 && list.length > 1) {
          cap('VMU_CONF_SCHEDULE_CONFLICT', 'parallel tracks needed', list.length, tracks, 'vmu.conference.maxParallelTracks', evaluated, firedList(evaluated, 'vmu.conference.maxParallelTracks'))
        }
        placements = list.map((i, idx) => ({ id: i && i.id !== undefined ? i.id : null, track: idx % tracks, slot: Math.floor(idx / tracks), minutes: intOr(i && i.minutes, 0), tz }))
      }
      const totalMinutes = K.schedule === 'sequential'
        ? placements.reduce((a, p) => a + p.minutes, 0)
        : Math.max(0, ...placements.map((p) => p.slot * K.slotMinutes + p.minutes))
      conf.agenda = { plannedAt: now, mode: K.schedule, tz, slotMinutes: K.slotMinutes, maxParallelTracks: K.maxParallelTracks, placements, totalMinutes }
      counters.agendas += 1
      for (const k of evaluated) if (!fired.includes(k)) fired.push(k)
      const receipt = makeReceipt(evaluated, fired, { action: 'planAgenda', conference: conf.id, mode: K.schedule, tz, tracks: K.schedule === 'parallel' ? Math.max(1, K.maxParallelTracks) : 1, items: placements.length, totalMinutes })
      pushReceipt(receipt)
      emit({ type: 'conference/agenda-planned', at: now, conference: conf.id, items: placements.length })
      return { ok: true, agenda: conf.agenda, receipt, enforced: receipt.enforced, fired: receipt.fired, enforcedScope: ENFORCED_SCOPE }
    },

    // ── READ-ONLY surfaces (they never mutate) ──────────────────────────────────────────────────────────
    /** A submission as a REVIEWER sees it: `anonymityMode=double` strips the author identity. */
    viewSubmission({ conference, submission, asReviewer = false } = {}) {
      const conf = must(conference)
      const sub = conf.submissions.get(String(submission))
      if (!sub) throw deny('VMU_NO_SUCH_OBJECT', 'no such submission: ' + String(submission), 'known: ' + ([...conf.submissions.keys()].join(', ') || '(none)'), ['vmu.conference.anonymityMode'], [])
      const double = K.anonymityMode === 'double'
      return {
        ok: true, submission: sub.id, title: sub.title, topics: sub.topics.slice(), state: sub.state,
        anonymityMode: K.anonymityMode,
        authors: asReviewer && double ? [] : sub.authors.slice(),
        authorsHidden: asReviewer && double,
        reviews: sub.reviews.slice(), decision: sub.decision,
        enforced: ['vmu.conference.anonymityMode'], enforcedScope: ENFORCED_SCOPE,
      }
    },
    list({ conference } = {}) {
      const conf = must(conference)
      return {
        ok: true, conference: conf.id, submissions: [...conf.submissions.values()].map((s) => ({ id: s.id, title: s.title, state: s.state, reviewers: s.reviewers.slice() })),
        reviews: conf.reviews.length, registrations: conf.registrations.length, agenda: conf.agenda ? { mode: conf.agenda.mode, items: conf.agenda.placements.length, totalMinutes: conf.agenda.totalMinutes } : null,
        enforced: [], enforcedScope: ENFORCED_SCOPE,
      }
    },
    receiptsView({ limit = 20 } = {}) {
      const n = intOr(limit, 20) || 20
      const kept = receiptRing.slice(-n)
      return { ok: true, items: kept.map((r) => Object.assign({}, r)), total: receiptRing.length, omitted: receiptRing.length - kept.length, ringDropped: ringDropped.n, enforcedScope: ENFORCED_SCOPE }
    },
    /** The declared universe (read from the generated registry — never guessed) + the wiring self-report. */
    status() {
      const declared = declaredKeys()
      const wired = WIRED_KEYS.slice()
      const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
      return {
        ok: true, apiVersion, wired, wiredCount: wired.length,
        plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
        unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
        declaredConferenceKeys: declared.count,
        overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
        wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
        complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
        conferences: [...live.keys()].sort(),
        keys: keysSnapshot(K),
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        layeredOn: meetings ? 'kernel/meetings (sessions are created THERE; this face only plans them)' : 'kernel/meetings NOT injected: agenda planning stays declarative (no session is ever opened here)',
        enforcedScope: ENFORCED_SCOPE,
        note: 'every key in `wired` changes an observable result; each receipt/refusal carries enforced[] + fired[] (fired ⊆ enforced) and enforcedScope:"evaluated-so-far"',
        at: clock(),
      }
    },
  }

  function declaredKeys() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      if (!existsSync(p)) return { keys: [], count: 0, source: 'unavailable' }
      const text = readFileSync(p, 'utf8')
      const all = [...new Set([...text.matchAll(/key: "(vmu\.conference\.[^"]+)"/g)].map((m) => m[1]))].sort()
      return { keys: all, count: all.length, source: 'settings/planned.js' }
    } catch (e) { return { keys: [], count: 0, source: 'error:' + String((e && e.message) || e) } }
  }

  return api
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
function keysSnapshot(K) {
  return {
    'vmu.conference.cfpOpenMs': K.cfpOpenMs, 'vmu.conference.cfpCloseMs': K.cfpCloseMs,
    'vmu.conference.topicsRequired': K.topicsRequired, 'vmu.conference.anonymityMode': K.anonymityMode,
    'vmu.conference.reviewerConflicts': K.reviewerConflicts, 'vmu.conference.proceedingsTrack': K.proceedingsTrack,
    'vmu.conference.assign': K.assign, 'vmu.conference.reviewAssignmentsPerPaper': K.perPaper,
    'vmu.conference.reviewDeadlineDays': K.deadlineDays, 'vmu.conference.metaReviewRequired': K.metaReviewRequired,
    'vmu.conference.register': K.register, 'vmu.conference.registrationCap': K.cap,
    'vmu.conference.registrationFeeMinor': K.feeMinor, 'vmu.conference.waiverPolicy': K.waiverPolicy,
    'vmu.conference.schedule': K.schedule, 'vmu.conference.slotMinutes': K.slotMinutes,
    'vmu.conference.maxParallelTracks': K.maxParallelTracks, 'vmu.conference.scheduleTz': K.scheduleTz,
  }
}
