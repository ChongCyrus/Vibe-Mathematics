// vmu kernel minutes — 会议纪要/决议/行动项（照 docs/08 §2／§10／§12.3）。
//
// 三条硬不变式：① 拒绝必须具名（`VMU_*` ＋ hint），绝不裸异常；② 任何上限触界都要**报丢弃计数**，
// 绝不静默；③ **不读真实时间**（只用注入的 `clock`）——同一输入在任何时刻都得到同一结果。
import { createHash } from 'node:crypto'

export const apiVersion = 1

/** 详略档（docs/08 §12.2 的纪要族：`vmu.minutes.detail`；独立复核者指出原注释误引 §12.3＝表决族 ✗）。 */
export const DETAIL_LEVELS = Object.freeze(['brief', 'normal', 'full'])

/** 正文/逐字稿的默认上限（字节）；触界必报丢弃量。 */
export const VERBATIM_CAP_BYTES = 32 * 1024

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
export function createMinutes({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null, meeting = null } = {}) {
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
  function actions({ id } = {}) {
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

  return { draft, confirm, append, actions, list, status }
}
