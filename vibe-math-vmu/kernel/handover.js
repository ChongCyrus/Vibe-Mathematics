// vmu kernel handover — 交接单 + 上下文压缩包（照 docs/17-§11 交接／§21 码表）。
//
// 硬不变式：① 缺必填字段 ⇒ 具名拒并**点名缺哪些**；② 压缩/截断必须**报丢弃**（字节数＋段数）；
// ③ 拒绝必须给理由；④ **未接受的交接不得被视为已完成**（关联任务**不得**被自动关掉）；⑤ 脱敏在**打包前**；
// ⑥ 只用注入 clock（不读真实时间）；⑦ 零机制不崩；只读面不改状态。
import { createHash } from 'node:crypto'

export const apiVersion = 1
export const STATES = Object.freeze(['open', 'finalized', 'accepted', 'rejected'])

/** 必填字段的**下限**（docs/17-§11／§20.5 的可配置项不得少于这四个）。 */
export const MANDATORY_FIELDS = Object.freeze(['status', 'openItems', 'risks', 'nextSteps'])
/** 17 卷 §20.5 列出的默认集合（作为可配置上限的参考）。 */
export const DOC_DEFAULT_FIELDS = Object.freeze(['status', 'openItems', 'pointers', 'risks', 'acceptance'])

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  return e
}

const K = {
  requiredFields: 'vmu.handover.requiredFields',
  packBudgetBytes: 'vmu.handover.packBudgetBytes',
  includeKinds: 'vmu.handover.includeKinds',
  requireFingerprint: 'vmu.handover.requireFingerprint',
  acceptTimeoutMs: 'vmu.handover.acceptTimeoutMs',
  onTimeout: 'vmu.handover.onTimeout',
  redactKeys: 'vmu.handover.redactKeys',
  compress: 'vmu.handover.compress',
  linkToTask: 'vmu.handover.linkToTask',
  requireAck: 'vmu.handover.requireAck',
}
const read = (s, k, d) => {
  if (!s) return d
  if (Object.prototype.hasOwnProperty.call(s, k)) return s[k]
  const short = k.split('.').pop()
  const nest = s.handover || s
  return nest && Object.prototype.hasOwnProperty.call(nest, short) ? nest[short] : d
}
const bytesOf = (v) => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v), 'utf8')
const clone = (v) => JSON.parse(JSON.stringify(v))
const REDACTED = '[redacted]'

/** 脱敏：只按**声明的键**（与审计同规则）在**打包前**执行。 */
export function redact(value, keys = []) {
  const bad = keys.map(String).filter(Boolean)
  if (!bad.length) return value
  const walk = (v, k) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, k))
    if (v && typeof v === 'object') {
      const out = {}
      for (const [kk, vv] of Object.entries(v)) out[kk] = bad.includes(kk) ? REDACTED : walk(vv, kk)
      return out
    }
    if (typeof v === 'string') {
      let s = v
      for (const b of bad) if (s.includes(b)) s = s.split(b).join(REDACTED)
      return s
    }
    return v
  }
  return walk(value)
}

export function createHandover({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null, tasks = null, library = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createHandover needs a clock function', 'pass { clock }')
  const items = new Map()   // id -> record
  const seq = { n: 0 }
  const counts = { reads: 0, writes: 0 }

  const requiredFields = () => {
    const cfg = read(settings, K.requiredFields, null)
    // INTEGRATOR RULING: the RUNTIME default stays the four-field FLOOR. The design's five-field set
    // (`pointers`, `acceptance` included) is the DECLARED default in settings/schema.js and is reported as
    // `docDefault` in status(); the floor is what the code enforces when nothing is configured. This keeps the
    // documented layering honest: the entry passes the raw settings map, so a schema default is a declaration,
    // not a runtime value - and turning the declaration into behaviour here would have silently changed every
    // existing handover fixture (which is exactly what happened before this ruling).
    const list = Array.isArray(cfg) && cfg.length ? cfg.map(String) : [...MANDATORY_FIELDS]
    for (const need of MANDATORY_FIELDS) if (!list.includes(need)) list.push(need)   // 不得少于下限
    return list
  }
  const budgetBytes = () => { const n = Number(read(settings, K.packBudgetBytes, 32768)); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 32768 }
  const redactKeys = () => { const v = read(settings, K.redactKeys, []); return Array.isArray(v) ? v.map(String) : [] }
  const compressMode = () => { const v = read(settings, K.compress, 'summary'); return v === 'none' ? 'none' : 'summary' }
  const need = (id) => { const r = items.get(String(id)); if (!r) throw refuse('VMU_NO_SUCH_OBJECT', 'no such handover: ' + String(id), 'call status() to see the ids'); return r }
  const emit = (t, p) => { if (!bus || typeof bus.emit !== 'function') return null; try { return bus.emit(t, p) } catch (e) { log('handover: bus emit failed: ' + String((e && e.code) || e)); return null } }

  function open({ from, to, subject, taskId = null, fields = null } = {}) {
    if (!from) throw refuse('VMU_INVALID_ARGUMENT', 'open needs { from }', 'pass { from: "<member id>" }')
    if (!to) throw refuse('VMU_INVALID_ARGUMENT', 'open needs { to }', 'pass { to: "<member id>" }')
    seq.n += 1
    const rec = {
      id: 'ho-' + String(seq.n), from: String(from), to: String(to), subject: String(subject || ''),
      taskId: taskId ? String(taskId) : null, state: 'open', at: clock(), finalizedAt: null,
      acceptedAt: null, acceptedBy: null, rejectedAt: null, rejectedBy: null, rejectReason: null,
      fields: {}, attachments: [], pack: null, taskClosed: false,
    }
    if (fields && typeof fields === 'object') for (const [k, v] of Object.entries(fields)) rec.fields[k] = v
    items.set(rec.id, rec)
    counts.writes += 1
    emit('record/appended', { handoverId: rec.id, state: rec.state })
    log('handover: opened ' + rec.id + ' ' + rec.from + '->' + rec.to + (rec.taskId ? ' (task ' + rec.taskId + ')' : ''))
    return { ok: true, id: rec.id, state: rec.state, at: rec.at }
  }

  /** attach：把一段上下文挂到交接单（kind 兼作字段名：'status'／'openItems'／… 或 'progress' 等条目）。 */
  function attach({ id, kind, ref, text, fingerprint, quotes } = {}) {
    const rec = need(id)
    const k = String(kind || '')
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'attach needs { kind }', 'e.g. kind:"status" | "openItems" | "risks" | "nextSteps"')
    if (ref === undefined && text === undefined) throw refuse('VMU_INVALID_ARGUMENT', 'attach needs { ref } or { text }', 'pass a reference or the literal text')
    const body = text === undefined ? null : String(text)
    const entry = { kind: k, ref: ref === undefined ? null : String(ref), text: body, quotes: Array.isArray(quotes) ? quotes.map(String) : [], at: clock() }
    if (body !== null) rec.fields[k] = body                                   // 字段类附件直接落成字段
    else if (rec.fields[k] === undefined) rec.fields[k] = String(ref)         // 纯引用也算"有内容"
    if (read(settings, K.requireFingerprint, true) === true && fingerprint === undefined) {
      entry.fingerprint = createHash('sha256').update(JSON.stringify({ k, ref: entry.ref, text: body })).digest('hex').slice(0, 16)
    } else if (fingerprint !== undefined) entry.fingerprint = String(fingerprint)
    rec.attachments.push(entry)
    counts.writes += 1
    return { ok: true, id: rec.id, kind: k, attachments: rec.attachments.length, fingerprint: entry.fingerprint || null }
  }

  /** finalize：校验必填字段 ⇒ 缺则具名拒并**点名缺哪些**。 */
  function finalize({ id } = {}) {
    const rec = need(id)
    const have = (f) => rec.fields[f] !== undefined && rec.fields[f] !== null && String(rec.fields[f]).trim() !== ''
    const missing = requiredFields().filter((f) => !have(f))
    if (missing.length) {
      throw refuse('VMU_HANDOVER_INCOMPLETE', 'the handover is incomplete: missing ' + missing.join(', '),
        'attach the missing field(s) — requiredFields (floor: ' + MANDATORY_FIELDS.join('/') + ') via ' + K.requiredFields)
    }
    rec.state = 'finalized'
    rec.finalizedAt = clock()
    counts.writes += 1
    emit('record/appended', { handoverId: rec.id, state: rec.state })
    return { ok: true, id: rec.id, state: rec.state, finalizedAt: rec.finalizedAt, fields: Object.keys(rec.fields).length }
  }

  /** pack：脱敏在**打包前**；按 compress 压缩；触界则**报丢弃字节数与段数**。 */
  function pack({ id } = {}) {
    const rec = need(id)
    if (rec.state === 'open') throw refuse('VMU_HANDOVER_INCOMPLETE', 'pack refuses an unfinalized handover: ' + rec.id, 'call finalize({ id }) first')
    const budget = budgetBytes()
    const kinds = read(settings, K.includeKinds, null)
    const wanted = Array.isArray(kinds) ? kinds.map(String) : null
    const mode = compressMode()
    // ① 脱敏（打包前）
    const safeFields = redact(clone(rec.fields), redactKeys())
    const safeAtt = redact(clone(rec.attachments), redactKeys())
    // ② 选段（includeKinds 过滤）＋③ 压缩（summary：只留 kind+ref+指纹，丢 text）
    let sections = safeAtt.filter((a) => !wanted || wanted.includes(a.kind) || Object.prototype.hasOwnProperty.call(safeFields, a.kind))
    let droppedSections = 0, droppedBytes = 0
    if (mode === 'summary') {
      sections = sections.map((a) => {
        if (a.text === null) return a
        droppedSections += 1
        droppedBytes += bytesOf(a.text)
        return { kind: a.kind, ref: a.ref, text: null, quotes: a.quotes, at: a.at, fingerprint: a.fingerprint || null, compressed: true }
      })
    }
    const pkg = { id: rec.id, from: rec.from, to: rec.to, subject: rec.subject, taskId: rec.taskId, at: rec.at, mode, fields: safeFields, sections }
    let bytes = bytesOf(pkg)
    if (bytes > budget) {
      // 触界：按**段**从尾往前丢，全程计数；丢不下 ⇒ 具名拒（预算/实际/计数）
      while (bytes > budget && pkg.sections.length) {
        const gone = pkg.sections.pop()
        droppedSections += 1
        droppedBytes += bytesOf(gone)
        bytes = bytesOf(pkg)
      }
      if (bytes > budget) {
        throw refuse('VMU_HANDOVER_PACK_TOO_BIG', 'the context package cannot fit the budget: budget=' + budget + 'B actual=' + bytes + 'B',
          'dropped ' + droppedSections + ' section(s) / ' + droppedBytes + 'B; raise ' + K.packBudgetBytes + ' or compress (mode=' + mode + ')')
      }
    }
    rec.pack = { bytes, budgetBytes: budget, droppedBytes, droppedSections, mode, at: clock() }
    counts.writes += 1
    return { ok: true, id: rec.id, bytes, budgetBytes: budget, droppedBytes, droppedSections, mode, redacted: redactKeys().length > 0, sections: pkg.sections.length, state: rec.state }
  }

  /** accept：只有 finalized 才能被接受；**不得**自动关关联任务（未验收不算完成）。 */
  function accept({ id, by, note = null } = {}) {
    const rec = need(id)
    if (!by) throw refuse('VMU_INVALID_ARGUMENT', 'accept needs { by }', 'pass { by: "<member id>" }')
    if (rec.state !== 'finalized') {
      throw refuse('VMU_HANDOVER_NOT_ACCEPTED', 'the handover is not acceptable in state "' + rec.state + '": ' + rec.id,
        rec.state === 'open' ? 'finalize(' + JSON.stringify(rec.id) + ') first' : 'it was already ' + rec.state)
    }
    rec.state = 'accepted'
    rec.acceptedAt = clock()
    rec.acceptedBy = String(by)
    rec.acceptNote = note === null ? null : String(note)
    rec.taskClosed = false      // 硬不变式④：内核绝不在交接被接受时自动关任务
    counts.writes += 1
    emit('record/appended', { handoverId: rec.id, state: rec.state, acceptedBy: rec.acceptedBy })
    return { ok: true, id: rec.id, state: rec.state, acceptedAt: rec.acceptedAt, acceptedBy: rec.acceptedBy, taskClosed: false, taskNote: rec.taskId ? 'task ' + rec.taskId + ' must be verified/closed by the task owner (not by this handover)' : null }
  }

  /** reject：**必须给理由**；不关任务；按 onRejectReturnTo 记录退回对象。 */
  function reject({ id, by, reason } = {}) {
    const rec = need(id)
    if (!by) throw refuse('VMU_INVALID_ARGUMENT', 'reject needs { by }', 'pass { by: "<member id>" }')
    if (reason === undefined || reason === null || String(reason).trim() === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'reject needs a non-empty { reason }', 'a rejection without a reason is not auditable (17-§28 S-4)')
    }
    rec.state = 'rejected'
    rec.rejectedAt = clock()
    rec.rejectedBy = String(by)
    rec.rejectReason = String(reason)
    rec.returnTo = read(settings, 'vmu.handover.onRejectReturnTo', rec.from)
    rec.taskClosed = false
    counts.writes += 1
    emit('record/appended', { handoverId: rec.id, state: rec.state, rejectedBy: rec.rejectedBy })
    return { ok: true, id: rec.id, state: rec.state, rejectedAt: rec.rejectedAt, returnTo: rec.returnTo, reason: rec.rejectReason }
  }

  /** status：只读（含策略与计数）。 */
  function status() {
    counts.reads += 1
    return {
      ok: true, apiVersion,
      total: items.size,
      byState: STATES.reduce((a, s) => { a[s] = [...items.values()].filter((r) => r.state === s).length; return a }, {}),
      policy: {
        requiredFields: requiredFields(), mandatoryFloor: [...MANDATORY_FIELDS], docDefault: [...DOC_DEFAULT_FIELDS],
        packBudgetBytes: budgetBytes(), compress: compressMode(), requireFingerprint: read(settings, K.requireFingerprint, true) === true,
        acceptTimeoutMs: Number(read(settings, K.acceptTimeoutMs, 0)) || 0, onTimeout: read(settings, K.onTimeout, 'return'),
        linkToTask: read(settings, K.linkToTask, true) !== false, requireAck: read(settings, K.requireAck, false) === true,
        redactKeys: redactKeys().length,
      },
      mechanism: { hasTasks: !!tasks, hasLibrary: !!library, hasBus: !!bus, clockInjected: true },
      counts: { reads: counts.reads, writes: counts.writes },
      items: [...items.values()].map((r) => ({ id: r.id, from: r.from, to: r.to, state: r.state, taskId: r.taskId, acceptedAt: r.acceptedAt, taskClosed: r.taskClosed, packBytes: r.pack ? r.pack.bytes : null, dropped: r.pack ? { bytes: r.pack.droppedBytes, sections: r.pack.droppedSections } : null })),
    }
  }

  return { open, attach, finalize, accept, reject, pack, status }
}
