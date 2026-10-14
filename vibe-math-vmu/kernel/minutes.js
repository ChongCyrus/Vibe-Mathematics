// vmu kernel minutes — 会议纪要/决议/行动项（照 docs/08 §2／§10／§12.3）。
//
// 三条硬不变式：① 拒绝必须具名（`VMU_*` ＋ hint），绝不裸异常；② 任何上限触界都要**报丢弃计数**，
// 绝不静默；③ **不读真实时间**（只用注入的 `clock`）——同一输入在任何时刻都得到同一结果。
import { createHash } from 'node:crypto'
import { CODE as RESUME_CODE } from './resume.js'

export const apiVersion = 1

/** 详略档（docs/08 §12.2 的纪要族：`vmu.minutes.detail`；独立复核者指出原注释误引 §12.3＝表决族 ✗）。 */
export const DETAIL_LEVELS = Object.freeze(['brief', 'normal', 'full'])

/** 正文/逐字稿的默认上限（字节）；触界必报丢弃量。 */
export const VERBATIM_CAP_BYTES = 32 * 1024

/** 快照里逐字稿的上限（字节）：超出**计数上报**，绝不静默裁（kernel/resume.js 接口约定的透明度）。 */
export const SNAPSHOT_VERBATIM_CAP = 64 * 1024

/** 具名拒绝（形状照 kernel/meeting.js／tasks.js）。 */
export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  return e
}

const K = {
  detail: 'vmu.minutes.detail',
  confirmPreviousRequired: 'vmu.minutes.confirmPreviousRequired',
  dissentMandatory: 'vmu.minutes.dissentMandatory',
  actionsOwnerRequired: 'vmu.minutes.actionsOwnerRequired',
  dueRequired: 'vmu.minutes.dueRequired',
  dissentRetentionMs: 'vmu.minutes.dissentRetentionMs',
}

function readSetting(settings, key, fallback) {
  if (!settings) return fallback
  if (Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
  const short = key.split('.').pop()               // 兼容写法：{ minutes: { detail } } / { detail }
  const nested = settings.minutes || settings
  if (nested && Object.prototype.hasOwnProperty.call(nested, short)) return nested[short]
  return fallback
}
const boolOf = (v, d) => (v === undefined ? d : !!v)
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

const bytesOf = (s) => Buffer.byteLength(String(s === undefined || s === null ? '' : s), 'utf8')
const clone = (v) => JSON.parse(JSON.stringify(v))

/**
 * `createMinutes({ clock, log, settings, bus, meeting })` —— `meeting` 可选注入（零机制时不注入 ⇒ 具名拒）。
 */
export function createMinutes({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null, meeting = null, meetings = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createMinutes needs a clock function', 'pass { clock }')
  const records = new Map()       // id -> minutes 记录
  const verbatim = new Map()      // meetingId -> { entries: [], droppedBytes: 0, capBytes }
  const seq = { n: 0 }
  const dirty = { reads: 0, writes: 0 }

  const detailLevel = () => {
    const v = readSetting(settings, K.detail, 'normal')
    return DETAIL_LEVELS.includes(v) ? v : 'normal'
  }
  const capBytes = () => numOf(readSetting(settings, 'vmu.minutes.verbatimCapBytes', VERBATIM_CAP_BYTES), VERBATIM_CAP_BYTES)
  const need = (id) => {
    const r = records.get(String(id))
    if (!r) throw refuse('VMU_NO_SUCH_OBJECT', 'no such minutes: ' + String(id), 'call list() to see the ids')
    return r
  }
  const emit = (topic, payload) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try { return bus.emit(topic, payload) } catch (e) { log('minutes: bus emit failed: ' + String((e && e.code) || e)); return null }
  }

  /** draft：从注入的 meeting 快照生成纪要草稿；无会议注入 ⇒ 具名拒（零机制不崩）。 */
  function draft({ meetingId, detail } = {}) {
    if (!meeting) {
      throw refuse('VMU_NO_OPEN_MEETING', 'draft needs a meeting to summarise: none is injected (zero-mechanism)',
        'construct createMinutes({ meeting }) or convene a meeting first')
    }
    const mid = String(meetingId || (meeting.id !== undefined ? meeting.id : ''))
    if (!mid) throw refuse('VMU_INVALID_ARGUMENT', 'draft needs { meetingId }', 'pass { meetingId }')
    // 上次纪要未确认 ⇒ 具名拒（docs/08 §2「上次纪要确认」）
    if (boolOf(readSetting(settings, K.confirmPreviousRequired, false), false)) {
      const prev = [...records.values()].filter((r) => r.meetingId === mid && !r.confirmedAt)
      if (prev.length) {
        throw refuse('VMU_MINUTES_NOT_CONFIRMED', 'the previous minutes for meeting ' + mid + ' is still unconfirmed: ' + prev[0].id,
          'confirm(' + JSON.stringify(prev[0].id) + ', { by }) first, or turn off ' + K.confirmPreviousRequired)
      }
    }
    const lvl = DETAIL_LEVELS.includes(detail) ? detail : detailLevel()
    const at = clock()
    seq.n += 1
    const summary = (typeof meeting.summary === 'function') ? meeting.summary() : null
    const rec = {
      id: 'mn-' + String(seq.n),
      meetingId: mid,
      at,
      detail: lvl,
      confirmedAt: null,
      attendance: {},
      agendaOutcomes: [],
      motions: [],
      ballots: [],
      resolutions: [],
      actions: [],
      dissent: [],
      verbatimRef: mid,
      droppedBytes: 0,
      // 可追溯：记录当时的会议快照（brief 只留计数，full 留全量）
      snapshot: lvl === 'brief'
        ? { rounds: summary && summary.rounds ? summary.rounds.length : 0 }
        : (lvl === 'full' ? clone(summary) : (summary ? { rounds: (summary.rounds || []).length, inputs: (summary.inputs || []).length } : null)),
    }
    records.set(rec.id, rec)
    dirty.writes += 1
    emit('meeting/round-end', { minutesId: rec.id, meetingId: mid, detail: lvl })
    log('minutes: drafted ' + rec.id + ' for ' + mid + ' (' + lvl + ')')
    return { ok: true, id: rec.id, meetingId: mid, at, detail: lvl }
  }

  /** append：逐字稿条目；触界只截断**并报丢弃字节数**（绝不静默）。 */
  function append({ id, text, kind = 'entry' } = {}) {
    const rec = need(id)
    const body = String(text === undefined || text === null ? '' : text)
    if (!body) throw refuse('VMU_INVALID_ARGUMENT', 'append needs non-empty { text }', 'pass { text }')
    const cap = capBytes()
    const slot = verbatim.get(rec.meetingId) || { entries: [], storedBytes: 0, droppedBytes: 0, capBytes: cap }
    const entry = { at: clock(), kind: String(kind), text: body, quotes: [], folded: [] }
    const size = bytesOf(JSON.stringify(entry))
    if (slot.storedBytes + size > cap) {
      slot.droppedBytes += size
      verbatim.set(rec.meetingId, slot)
      rec.droppedBytes = slot.droppedBytes
      dirty.writes += 1
      log('minutes: verbatim cap reached for ' + rec.meetingId + ' — dropped ' + size + ' bytes (total ' + slot.droppedBytes + ')')
      return { ok: true, id: rec.id, appended: false, droppedBytes: slot.droppedBytes, capBytes: cap, reason: 'verbatim-cap' }
    }
    slot.entries.push(entry)
    slot.storedBytes = (slot.storedBytes || 0) + size
    verbatim.set(rec.meetingId, slot)
    dirty.writes += 1
    return { ok: true, id: rec.id, appended: true, entries: slot.entries.length, droppedBytes: slot.droppedBytes, capBytes: cap }
  }

  /** actions：列出行动项（只读，深拷贝，不得改状态）。 */
  function actions(input = {}) {  // A DEFAULT PARAMETER DOES NOT PROTECT AGAINST null: `{ id } = {}` throws when called with null, which is how this
  // method once leaked a V8 message. Normalise first, so an imperfect caller is refused rather than crashed.
  const { id } = input || {}
  if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'actions needs { id }', 'pass { id: "<minutes id>" }; list() shows the ids')
    const rec = need(id)
    dirty.reads += 1
    return { ok: true, id: rec.id, actions: clone(rec.actions) }
  }

  /** confirm：确认纪要；落实 dissentMandatory／actionsOwnerRequired／dueRequired。 */
  function confirm({ id, by, dissent, actions } = {}) {
    const rec = need(id)
    if (!by) throw refuse('VMU_INVALID_ARGUMENT', 'confirm needs { by } (who confirms)', 'pass { by: "<member id>" }')
    if (rec.confirmedAt) return { ok: true, id: rec.id, confirmedAt: rec.confirmedAt, alreadyConfirmed: true }
    if (Array.isArray(dissent)) rec.dissent = dissent.map(String)
    if (Array.isArray(actions)) rec.actions = clone(actions)

    if (boolOf(readSetting(settings, K.dissentMandatory, false), false) && rec.dissent.length === 0) {
      throw refuse('VMU_MINUTES_DISSENT_REQUIRED', 'confirm refuses: this policy requires the dissent section to be present (it is empty)',
        'pass { dissent: [...] } (an explicit "no dissent" entry is acceptable) or turn off ' + K.dissentMandatory)
    }
    const ownerReq = boolOf(readSetting(settings, K.actionsOwnerRequired, false), false)
    const dueReq = boolOf(readSetting(settings, K.dueRequired, false), false)
    if (ownerReq || dueReq) {
      const bad = []
      rec.actions.forEach((a, i) => {
        const missing = []
        if (ownerReq && !(a && (a.who || a.owner))) missing.push('owner')
        if (dueReq && !(a && (a.due || a.dueAt))) missing.push('due')
        if (missing.length) bad.push('# ' + (i + 1) + ' missing ' + missing.join('+'))
      })
      if (bad.length) {
        throw refuse('VMU_MINUTES_ACTION_REQUIRED', 'confirm refuses: ' + bad.join('; '),
          'every action needs ' + [ownerReq ? 'who/owner' : null, dueReq ? 'due' : null].filter(Boolean).join(' + ') + ' (policy ' + K.actionsOwnerRequired + '/' + K.dueRequired + ')')
      }
    }
    rec.confirmedAt = clock()
    rec.confirmedBy = String(by)
    rec.fingerprint = createHash('sha256').update(JSON.stringify({ id: rec.id, meetingId: rec.meetingId, at: rec.at, actions: rec.actions, dissent: rec.dissent })).digest('hex').slice(0, 16)
    dirty.writes += 1
    emit('record/appended', { minutesId: rec.id, confirmedBy: rec.confirmedBy })
    log('minutes: confirmed ' + rec.id + ' by ' + rec.confirmedBy)
    return { ok: true, id: rec.id, confirmedAt: rec.confirmedAt, confirmedBy: rec.confirmedBy, fingerprint: rec.fingerprint }
  }

  /** list：只读列表（不含正文，避免读操作搬运大对象）。 */
  function list() {
    dirty.reads += 1
    return {
      ok: true,
      total: records.size,
      items: [...records.values()].map((r) => ({ id: r.id, meetingId: r.meetingId, at: r.at, detail: r.detail, confirmedAt: r.confirmedAt, actions: r.actions.length, dissent: r.dissent.length, droppedBytes: r.droppedBytes })),
    }
  }

  /** status：只读（含机制自述与计数，便于门禁与自检）。 */
  function status() {
    dirty.reads += 1
    return {
      ok: true,
      apiVersion,
      total: records.size,
      confirmed: [...records.values()].filter((r) => !!r.confirmedAt).length,
      policy: {
        detail: detailLevel(),
        confirmPreviousRequired: boolOf(readSetting(settings, K.confirmPreviousRequired, false), false),
        dissentMandatory: boolOf(readSetting(settings, K.dissentMandatory, false), false),
        actionsOwnerRequired: boolOf(readSetting(settings, K.actionsOwnerRequired, false), false),
        dueRequired: boolOf(readSetting(settings, K.dueRequired, false), false),
        dissentRetentionMs: numOf(readSetting(settings, K.dissentRetentionMs, 0), 0),
        verbatimCapBytes: capBytes(),
      },
      mechanism: { hasMeeting: !!meeting, hasBus: !!bus, clockInjected: true },
      counts: { reads: dirty.reads, writes: dirty.writes },
      dropped: [...verbatim.values()].reduce((a, v) => a + v.droppedBytes, 0),
    }
  }

  /**
   * TASK-11 (v5r S8/R3/K12): the minutes in TWO ZONES — the speech zone (what was said, refusals included) and
   * the vote zone (every board of this meeting). v5r split them because a mixed transcript made "who voted what"
   * unauditable; the split is preserved here, and an EMPTY zone says so instead of silently disappearing.
   */
  function zones(input = {}) {
    const { id, ballotIds = [] } = input || {}
    const rec = need(id)
    const slot = verbatim.get(rec.meetingId) || { entries: [], storedBytes: 0, droppedBytes: 0, capBytes: capBytes() }
    const speech = slot.entries.filter((e) => e.kind !== 'ballot' && e.kind !== 'vote')
    const voteEntries = slot.entries.filter((e) => e.kind === 'ballot' || e.kind === 'vote')
    const voteZone = (rec.ballots || []).map((b) => Object.assign({}, b))
      .concat((rec.resolutions || []).map((r) => ({ kind: 'resolution', text: String(r.text || r) })))
      .concat(voteEntries.map((e) => ({ kind: e.kind, text: e.text, at: e.at })))
    dirty.reads += 1
    return {
      ok: true, id: rec.id, meetingId: rec.meetingId, detail: rec.detail,
      speechZone: { entries: speech.map((e) => ({ at: e.at, kind: e.kind, text: e.text, quotes: (e.quotes || []).length, folded: (e.folded || []).length })),
        count: speech.length, empty: speech.length === 0, note: speech.length === 0 ? '发言区为空（本场尚无逐字稿条目）' : '' },
      voteZone: { entries: voteZone, count: voteZone.length, empty: voteZone.length === 0, ballotIds: ballotIds.slice(),
        note: voteZone.length === 0 ? '投票区为空（本场未使用投票板，也无决议）' : '' },
      // The zones are derived, never written: a read cannot change the record (§R7 只增不改).
      derivedFrom: { verbatimEntries: slot.entries.length, droppedBytes: slot.droppedBytes, capBytes: slot.capBytes },
    }
  }

  /**
   * TASK-11 (v5r #54 "无 entry ⇒ 只报缺口"): report what the minutes are MISSING and never fill it in.
   * A silent auto-completion would fabricate a record, which is the failure mode this report exists to prevent.
   */
  function gaps(input = {}) {
    const { id } = input || {}
    const rec = need(id)
    const slot = verbatim.get(rec.meetingId) || { entries: [] }
    const gaps = []
    if (!(rec.agendaOutcomes || []).length) gaps.push({ what: 'agendaOutcomes', why: '议程结果为空：谁讨论了哪一条没有落进纪要' })
    if (!Object.keys(rec.attendance || {}).length) gaps.push({ what: 'attendance', why: '出席表为空：点名/出席没有被记录' })
    if (!(rec.motions || []).length) gaps.push({ what: 'motions', why: '动议节为空：本场没有动议（或没有记录）' })
    if (!(rec.ballots || []).length) gaps.push({ what: 'ballots', why: '投票区为空：本场未使用投票板' })
    if (!(rec.resolutions || []).length) gaps.push({ what: 'resolutions', why: '决议区为空：没有落决议' })
    if (!(rec.actions || []).length) gaps.push({ what: 'actions', why: '行动项为空：没有责任人/期限' })
    if (!(rec.dissent || []).length) gaps.push({ what: 'dissent', why: '少数意见节为空（若政策要求则必须在 confirm 时补齐）' })
    if (!slot.entries.length) gaps.push({ what: 'verbatim', why: '逐字稿为空：本场没有 append 任何条目' })
    dirty.reads += 1
    return { ok: true, id: rec.id, meetingId: rec.meetingId, gaps, count: gaps.length,
      note: '只报缺口，**不自动补全**（R7）；补齐走 append/confirm，责任人是记录人或院士' }
  }

  /**
   * GAP-MTG-03 — THE RESOLUTION ENTITY (v5r `result_record`/`resolutions` #55/#56, S13/G2).
   *
   * v5r's three decisions, kept: the id is ALLOCATED BY THE FRAMEWORK (`res-<n>`, institute-monotonic, never
   * taken from the caller) so a resolution can be quoted across meetings; it takes effect ON ANNOUNCEMENT
   * (`effectiveAt === at`), and a `retroactive` declaration is recorded (`declaredAt`) WITHOUT moving
   * `effectiveAt`; and superseding is a one-way, append-only link (`supersededBy`) rather than a rewrite.
   *
   * THE TIER GATE is the SAME single decision point as the meeting layer's: `meetings.truthWriteRefusal(…)`
   * (GAP-MTG-02/D7). This face does not re-implement "may this meeting conclude?" — without the seam it refuses
   * BY NAME instead of guessing the tier (a light meeting must never acquire an entity conclusion by omission).
   */
  const RESOLUTION_TEXT_MAX = 1000
  const RESOLUTION_KINDS = Object.freeze(['resolution', 'solve', 'org', 'procedure'])
  const resolutions = []
  const resolutionSeq = { n: 0 }

  const tierGate = (what) => {
    if (!meetings || typeof meetings.truthWriteRefusal !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'recording a resolution needs the meeting policy layer (the tier predicate) to be injected',
        'construct createMinutes({ meetings }) — a resolution may only be recorded inside a FORMAL meeting (D7), and this face will not guess the tier')
    }
    const r = meetings.truthWriteRefusal(what)
    if (r) throw refuse(r.code || 'VMU_MEETING_LIGHT_NO_TRUTH', String(r.message), r.hint)
  }

  function resolve(input = {}) {
    const a = input || {}
    const text = String(a.text === undefined || a.text === null ? '' : a.text).trim()
    if (!text) throw refuse('VMU_INVALID_ARGUMENT', 'a resolution needs non-empty text', 'pass { text }')
    if (text.length > RESOLUTION_TEXT_MAX) throw refuse('VMU_INVALID_ARGUMENT', 'the resolution text is over ' + RESOLUTION_TEXT_MAX + ' characters', 'split it into two resolutions')
    const kind = String(a.kind || 'resolution')
    if (!RESOLUTION_KINDS.includes(kind)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown resolution kind: ' + kind, 'one of ' + RESOLUTION_KINDS.join(', '))
    const stampKeys = Object.keys(a).filter((k) => /(At|Ms)$/i.test(String(k)))
    if (stampKeys.length) throw refuse('VMU_INVALID_ARGUMENT', 'time is set by the framework: ' + stampKeys.join(', ') + ' is refused', 'the announcement instant is written by the framework; use `due_in` for relative deadlines')
    tierGate('recording a resolution')
    const meetingId = a.meeting === undefined || a.meeting === null ? '' : String(a.meeting)
    const target = a.target === undefined || a.target === null ? '' : String(a.target)
    const actions = Array.isArray(a.actions) ? a.actions.map((x) => {
      const who = String((x && (x.who || x.member)) || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'actions[].who is required (the owner)', 'every action item needs an owner')
      const bad = Object.keys(x || {}).filter((k) => /(At|Ms)$/i.test(String(k)))
      if (bad.length) throw refuse('VMU_INVALID_ARGUMENT', 'an action item takes a RELATIVE due_in, not ' + bad.join(', '), 'pass { due_in: "next meeting" }')
      return { who, due_in: String((x && (x.due_in || x.dueIn)) || ''), state: 'open' }
    }) : []
    const same = resolutions.filter((r) => r.meetingId === meetingId && r.target === target && r.text === text)[0]
    if (same) return { ok: true, deduped: true, resolution: clone(same), message: 'the same resolution already exists (idempotent): not recorded twice' }
    const at = clock()
    const rec = { id: 'res-' + (resolutionSeq.n + 1), by: a.by === undefined || a.by === null ? null : String(a.by),
      at, meetingId, target, kind, text, actions, effectiveAt: at,
      retroactive: a.retroactive === true, declaredAt: a.retroactive === true ? at : 0, supersededBy: '' }
    resolutionSeq.n += 1
    resolutions.push(rec)
    // Also hang it on this meeting's minutes record when one exists (the human-readable side), append-only.
    const recRow = [...records.values()].filter((r) => String(r.meetingId || '') === meetingId)[0]
    if (recRow) { if (!Array.isArray(recRow.resolutions)) recRow.resolutions = []; recRow.resolutions.push({ id: rec.id, kind: rec.kind, text: rec.text, effectiveAt: rec.effectiveAt }) }
    dirty.writes += 1
    emit('record/appended', { at, kind: 'resolution', id: rec.id, meetingId })
    return { ok: true, resolution: clone(rec), tierKeys: ['vmu.meetings.tier'],
      note: 'announcement IS the effect (G2); the stable id is quotable across meetings (res:' + rec.id + ')' }
  }

  /** Read-only search. Time is display/order only: any `…At`/`…Ms` FILTER is refused by name. */
  function resolutions_(input = {}) {
    const a = input || {}
    const bad = Object.keys(a).filter((k) => /(At|Ms)$/i.test(String(k)))
    if (bad.length) throw refuse('VMU_INVALID_ARGUMENT', 'time is display-only here: a ' + bad.join(', ') + ' filter is refused', 'filter by id/target/meetingId/kind instead')
    let list = resolutions.slice()
    if (a.id) { const want = String(a.id).trim(); const id = /^\d+$/.test(want) ? ('res-' + want) : want; list = list.filter((r) => r.id === id) }
    if (a.target) list = list.filter((r) => r.target === String(a.target))
    if (a.meetingId) list = list.filter((r) => r.meetingId === String(a.meetingId))
    if (a.kind) list = list.filter((r) => r.kind === String(a.kind))
    const limit = Math.max(1, Math.min(50, Number(a.limit || 10) || 10))
    const rows = list.slice(-limit).reverse().map((r) => ({ id: r.id, kind: r.kind, text: r.text, effectiveAt: r.effectiveAt,
      meetingId: r.meetingId, target: r.target, supersededBy: r.supersededBy, actions_count: r.actions.length }))
    dirty.reads += 1
    return { ok: true, count: list.length, resolutions: rows,
      latest_id: (list.filter((r) => !r.supersededBy).slice(-1)[0] || {}).id || null }
  }

  /** Mark an older resolution as superseded by a newer one: ONE-WAY and append-only (the old text stays). */
  function supersede(input = {}) {
    const a = input || {}
    const of = String(a.of || a.id || '').trim()
    const by = String(a.by || '').trim()
    if (!of || !by) throw refuse('VMU_INVALID_ARGUMENT', 'supersede needs { of, by }', 'name the superseded resolution and the superseding one')
    const old = resolutions.filter((r) => r.id === of)[0]
    const next = resolutions.filter((r) => r.id === by)[0]
    if (!old) throw refuse('VMU_NO_SUCH_OBJECT', 'no such resolution: ' + of, 'resolutions({ … }) lists the ids')
    if (!next) throw refuse('VMU_NO_SUCH_OBJECT', 'no such resolution: ' + by, 'resolutions({ … }) lists the ids')
    if (old.supersededBy === by) return { ok: true, deduped: true, id: old.id, supersededBy: by }
    if (old.supersededBy) throw refuse('VMU_CONFLICT', old.id + ' is already superseded by ' + old.supersededBy, 'a supersede link is one-way; supersede the newer one instead')
    old.supersededBy = by
    dirty.writes += 1
    return { ok: true, id: old.id, supersededBy: by, note: 'the old text is preserved (append-only)' }
  }

  return { draft, confirm, append, actions, list, status, zones, gaps, resolve, resolutions: resolutions_, supersede, snapshot, restore }

  /**
   * PERSISTENCE SEAM v1 (kernel/resume.js interface). Two things are deliberate here:
   *   · the VERBATIM transcript is a large text body, so the snapshot carries a declared cap and reports the
   *     truncation (`truncated` + a `skipped` entry) instead of silently clipping it;
   *   · the id counter is `max(seq, highest existing mn-<n>)`, so a restored session never re-mints an id that
   *     already exists in the archives ("names are immortal", the v5r invariant).
   */
  function snapshot() {
    const cap = SNAPSHOT_VERBATIM_CAP
    const verbatimOut = {}
    let verbatimBytes = 0
    let droppedBytes = 0
    for (const [mid, slot] of verbatim.entries()) {
      const text = JSON.stringify(slot)
      if (verbatimBytes + text.length > cap) { droppedBytes += text.length; continue }
      verbatimOut[mid] = clone(slot)
      verbatimBytes += text.length
    }
    const maxId = [...records.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/^mn-/, '')) || 0), 0)
    return { apiVersion, face: 'minutes', v: 1, at: clock(),
      data: { records: Object.fromEntries([...records.entries()].map(([k, v]) => [k, clone(v)])), verbatim: verbatimOut,
        resolutions: resolutions.map((r) => clone(r)),
        verbatimBytes, verbatimCapBytes: cap, droppedVerbatimBytes: droppedBytes },
      counters: { minutes: Math.max(seq.n, maxId), resolution: resolutionSeq.n },
      skipped: (droppedBytes > 0 ? [{ what: 'verbatim', why: 'snapshot cap ' + cap + ' bytes reached: ' + droppedBytes + ' byte(s) omitted (counted in droppedVerbatimBytes)' }] : [])
        .concat([{ what: 'meeting', why: 'the injected meeting seam is re-bound by the host, never serialised' }]) }
  }

  /** Hydrate a `snapshot()`. Merge-safe while empty, idempotent on the same snapshot, named conflict otherwise. */
  function restore(snap) {
    if (!snap || typeof snap !== 'object') return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'no snapshot to restore', missing: ['snapshot'] }
    if (snap.face !== 'minutes') return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'not a minutes snapshot (face=' + String(snap.face) + ')' }
    if (Number(snap.v) !== 1) return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'unsupported snapshot version ' + String(snap.v) }
    const d = snap.data
    const missing = ['records'].filter((k) => !d || d[k] === undefined)
    if (missing.length) return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'snapshot is missing ' + missing.join(', '), missing }
    if (records.size > 0) {
      const same = JSON.stringify(d) === JSON.stringify(snapshot().data)
      if (!same) return { ok: false, restored: false, code: RESUME_CODE.restoreConflict,
        message: 'this minutes service already holds ' + records.size + ' record(s): refusing to half-overwrite them',
        hint: 'restore into a fresh service, or restore the snapshot matching the live state' }
    }
    records.clear()
    for (const [k, v] of Object.entries(d.records || {})) records.set(k, clone(v))
    verbatim.clear()
    for (const [k, v] of Object.entries(d.verbatim || {})) verbatim.set(k, clone(v))
    // GAP-MTG-03: the resolution LEDGER travels with the minutes (it is the same face's record), and its id
    // counter only ever moves FORWARD — a restored service never re-mints `res-<n>`.
    resolutions.length = 0
    for (const r of (d.resolutions || [])) resolutions.push(clone(r))
    const fromSnap = Number((snap.counters && snap.counters.minutes) || 0)
    const fromRes = Number((snap.counters && snap.counters.resolution) || 0)
    const maxId = [...records.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/^mn-/, '')) || 0), 0)
    const maxRes = resolutions.reduce((mx, r) => Math.max(mx, Number(String(r.id || '').replace(/^res-/, '')) || 0), 0)
    seq.n = Math.max(seq.n, fromSnap, maxId)
    resolutionSeq.n = Math.max(resolutionSeq.n, fromRes, maxRes)
    return { ok: true, restored: true, restored_items: ['records', 'verbatim', 'resolutions'],
      counters: { minutes: seq.n, resolution: resolutionSeq.n },
      truncated: d.droppedVerbatimBytes ? { what: 'verbatim', bytes: d.droppedVerbatimBytes } : null,
      skipped: (snap.skipped || []).slice() }
  }
}
