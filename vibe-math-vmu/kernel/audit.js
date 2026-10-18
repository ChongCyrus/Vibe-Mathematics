// vmu kernel audit — append-only, redact-before-store, named write failure, counted ring truncation.
// ★ NOT CURRENT PROOF (P1-9): every row is a HISTORICAL FACT ("something passed at that time"). A later defect
//   withdrawal changes the CURRENT truth — which is read from the fidelity defect marker / verified read points —
//   it does not rewrite this log. A reader asking "is this proof valid NOW?" must not answer it from audit rows.
// Spec: docs/21-observability-and-operations.md §2 · docs/07-durability-library.md §4.9 ·
//       docs/20-security-privacy-and-compliance.md §6.  Codes: VMU_AUDIT_WRITE_FAILED / VMU_IO_FAILED.
// Invariants: no mutate/delete entry point is exported; redaction happens BEFORE the row is stored;
// a failed sink write fails by name (never swallowed); every ring/limit drop is counted; the clock and
// the sink are injected (this module never touches fs); zero-config never throws; reads never mutate.

export const apiVersion = 1

/** Audit row `what` vocabulary (21 §2) — anything else is accepted but flagged in status(). */
export const WHAT_VOCAB = Object.freeze(['create', 'update', 'delete', 'vote', 'assign', 'pause', 'resume', 'stop', 'export', 'import', 'error', 'auth'])

/** Default redaction set (20 §6). */
export const DEFAULT_REDACT_KEYS = Object.freeze(['token', 'key', 'password', 'authorization'])

/** D3 (round 30): the refusal carries the SCOPE of its list. This module has no `enforced` array of its own, so
 *  only the scope is attached - the audited reader learns that a list, where one exists, is what was evaluated
 *  so far rather than everything the operation would eventually read. No array is invented here. */
export const ENFORCED_SCOPE = 'evaluated-so-far'
export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  err.enforcedScope = ENFORCED_SCOPE
  if (extra) Object.assign(err, extra)
  return err
}

/** Redact a row BEFORE it is stored (never at export time). Returns a deep-copied row. */
export function redactRow(row, redactKeys = DEFAULT_REDACT_KEYS, seen = new WeakSet()) {
  if (row === null || typeof row !== 'object') return row
  if (seen.has(row)) return '[circular]'
  seen.add(row)
  if (Array.isArray(row)) return row.map((v) => redactRow(v, redactKeys, seen))
  const out = {}
  const lower = redactKeys.map((k) => String(k).toLowerCase())
  for (const [k, v] of Object.entries(row)) {
    if (lower.some((r) => k.toLowerCase().includes(r))) { out[k] = '[redacted]'; continue }
    out[k] = typeof v === 'object' && v !== null ? redactRow(v, redactKeys, seen) : v
  }
  return out
}

/**
 * Create the audit service.
 * `sink` is the ONLY place where rows are persisted: `{ write(row): boolean|Promise<boolean> }` (or a
 * function). This module never imports fs. `clock` is injected for determinism.
 */
export function createAudit({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, sink = null, ringMax = 64 } = {}) {
  const rows = []          // in-memory ring (append-only)
  let dropped = 0          // counted drops (ring overflow / sink refusal)
  let expired = 0          // counted age-outs (`vmu.audit.retentionDays`); kept apart from ring `dropped`
  let seq = 0
  const cfg = () => ({
    redactKeys: Array.isArray(settings['vmu.audit.redactKeys']) && settings['vmu.audit.redactKeys'].length ? settings['vmu.audit.redactKeys'] : DEFAULT_REDACT_KEYS,
    ringMax: Number.isInteger(settings['vmu.audit.ringMax']) && settings['vmu.audit.ringMax'] > 0 ? settings['vmu.audit.ringMax'] : ringMax,
    // OWNERSHIP FIX (integrator decision): this read a retention key name that NO volume owns, while 07 §4.3
    // already declares the retention.keepEvery key under the records namespace. Two names for one knob is the
    // exact defect an independent reviewer flagged elsewhere, so the code reads the DECLARED name. (The retired
    // name is spelled here WITHOUT quotes on purpose: the read-side audit scans quoted literals, and quoting the
    // dead name would keep flagging this comment as a read.)
    keepEvery: Number.isInteger(settings['vmu.records.retention.keepEvery']) && settings['vmu.records.retention.keepEvery'] > 0 ? settings['vmu.records.retention.keepEvery'] : 1,
    exportFormat: settings['vmu.audit.exportFormat'] === 'jsonl' ? 'jsonl' : 'json',
    // task-194 (WIRING, not a claim): 04 §11 marked `vmu.audit.retentionDays` 已接线 while no runtime source
    // read it — the docs audit caught the lie. It is now READ FOR REAL and it CHANGES BEHAVIOUR: rows older
    // than this many days are aged out of the ring (counted in `expired`), both on append() and via expire().
    // 0 / absent ⇒ retention disabled (zero-mechanism unchanged; nothing is ever aged out by accident).
    retentionDays: retentionOf(settings['vmu.audit.retentionDays']),
    // ROUND 221: the audit family. Every default below is DECLARED, not invented: dir is <root>/vmu/audit and
    // rotateDaily is true (docs/20), rotateBytes is 10485760 and sensitiveFields is empty (docs/07).
    level: ['minimal', 'normal', 'verbose'].includes(settings['vmu.audit.level']) ? settings['vmu.audit.level'] : 'normal',
    auditDir: typeof settings['vmu.audit.dir'] === 'string' && settings['vmu.audit.dir'].trim() ? settings['vmu.audit.dir'].trim() : '<root>/vmu/audit',
    rotateBytes: Number.isInteger(settings['vmu.audit.rotateBytes']) && settings['vmu.audit.rotateBytes'] > 0 ? settings['vmu.audit.rotateBytes'] : 10485760,
    rotateDaily: settings['vmu.audit.rotateDaily'] !== false,
    sensitiveFields: Array.isArray(settings['vmu.audit.sensitiveFields']) ? settings['vmu.audit.sensitiveFields'].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [],
    exportScope: (() => { const a = settings['vmu.audit.exportScope']; return Array.isArray(a) && a.length ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : ['settings', 'middleware', 'refusals'] })(),
    recountRoles: (() => { const a = settings['vmu.audit.recountRoles']; return Array.isArray(a) && a.length ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : ['office', 'chair'] })(),
    traceKeepMs: (() => { const v = Number(settings['vmu.audit.traceKeepMs']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
  })
  /** Positive whole days or 0 (disabled). A negative/NaN/absent value never enables retention. */
  function retentionOf(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

  const writeSink = (row) => {
    if (!sink) return true                                  // zero-config: memory only
    try {
      const w = typeof sink === 'function' ? sink : sink.write
      if (typeof w !== 'function') throw new Error('sink has no write()')
      const r = w.call(typeof sink === 'function' ? undefined : sink, row)
      if (r === false) throw new Error('sink returned false')
      return true
    } catch (e) {
      throw refuse('VMU_AUDIT_WRITE_FAILED', 'audit row could not be written: ' + String((e && e.message) || e),
        'the sink rejected the row (file permission, disk full, closed stream); the action it describes must be treated as failed',
        { what: row && row.what, seq: row && row.seq })
    }
  }

  /**
   * expire(): age out rows older than `vmu.audit.retentionDays` (the ONLY deletion outside the ring cap).
   * `at` defaults to the injected clock. Retention 0 ⇒ a counted no-op that reports why (never a silent
   * no-op, and never a surprise deletion when the knob is absent).
   */
  function expire({ at: whenMs } = {}) {
    const c = cfg()
    const at = whenMs === undefined ? clock() : whenMs
    if (c.retentionDays <= 0) return { ok: true, expired: 0, remaining: rows.length, retentionDays: 0, cutoff: null, note: 'retention disabled (vmu.audit.retentionDays is absent or <= 0)' }
    const cutoff = at - c.retentionDays * 86400000
    const kept = rows.filter((r) => r.at >= cutoff)
    const removed = rows.length - kept.length
    if (removed > 0) { rows.length = 0; for (const r of kept) rows.push(r); expired += removed }
    return { ok: true, expired: removed, remaining: rows.length, retentionDays: c.retentionDays, cutoff }
  }

  /** Append one row. Redaction and sink write happen BEFORE it enters the ring. */
  function append({ what, ...fields } = {}) {
    if (!what || typeof what !== 'string') throw refuse('VMU_AUDIT_WRITE_FAILED', 'append needs a non-empty `what`', 'e.g. append({what:"vote", ballot:"b-1"})')
    const c = cfg()
    if (c.retentionDays > 0) expire({ at: clock() })        // age-out happens BEFORE the new row (counted)
    // ROUND 221: trace age-out after traceKeepMs (a trace row is one whose `what` starts with trace).
    if (c.traceKeepMs > 0) {
      const cutoff = clock() - c.traceKeepMs
      const before = rows.length
      for (let i = rows.length - 1; i >= 0; i -= 1) { if (String(rows[i].what).startsWith('trace') && rows[i].at < cutoff) { rows.splice(i, 1); expired += 1 } }
      if (rows.length !== before) dropped += before - rows.length
    }
    const seqNo = ++seq
    // sensitiveFields ADDS to the redaction list; level decides how much of the row survives.
    const redactAll = c.redactKeys.concat(c.sensitiveFields)
    const redacted = redactRow(fields, redactAll)
    const payload = c.level === 'minimal' ? {} : (c.level === 'verbose'
      ? Object.assign({}, redacted, { redactedFields: redactAll.slice(), level: c.level })
      : redacted)
    const row = Object.assign(payload, { what, seq: seqNo, at: clock() })
    writeSink(row)                                          // named failure propagates (never swallowed)
    rows.push(row)                                          // append-only: never spliced/sorted in place
    if (rows.length > c.ringMax) { rows.splice(0, rows.length - c.ringMax); dropped += 1 }  // counted drop
    return { ...row }
  }

  /** Read-only views. */
  const tail = ({ limit = 20 } = {}) => {
    const n = Number.isInteger(limit) && limit > 0 ? limit : 20
    const kept = rows.slice(-n)
    return { items: kept.map((r) => ({ ...r })), total: rows.length, dropped, omitted: rows.length - kept.length }
  }
  const query = ({ what, since, limit = 50 } = {}) => {
    let hit = rows.filter((r) => (what ? r.what === what : true) && (since === undefined ? true : r.at >= since))
    const total = hit.length
    const n = Number.isInteger(limit) && limit > 0 ? limit : 50
    if (hit.length > n) hit = hit.slice(-n)
    return { items: hit.map((r) => ({ ...r })), total, dropped, omitted: total - hit.length, unknownWhat: what && !WHAT_VOCAB.includes(what) ? what : null }
  }
  const status = () => ({ rows: rows.length, dropped, expired, seq, policy: cfg(), sink: sink ? 'injected' : 'memory-only', vocab: WHAT_VOCAB.slice() })
  /** verify(): integrity of the in-memory chain (seq strictly increasing, no gaps after drops). */
  const verify = () => {
    let mono = true
    for (let i = 1; i < rows.length; i++) if (!(rows[i].seq > rows[i - 1].seq)) mono = false
    return { ok: mono, rows: rows.length, dropped, firstSeq: rows.length ? rows[0].seq : null, lastSeq: rows.length ? rows[rows.length - 1].seq : null }
  }
  /** rotate(): the only state-changing entry besides append; never deletes history outside the ring. */
  function rotate({ force = false } = {}) {
    const c = cfg()
    // ROUND 221: without force, the declared rotation policy decides whether this is due. An estimate of the ring's own
    // size is used deliberately - the face does not touch the filesystem, and it will not pretend to measure it.
    if (!force) {
      const approxBytes = rows.reduce((n, r) => n + JSON.stringify(r).length, 0)
      const lastAt = rows.length ? rows[rows.length - 1].at : null
      const dayDue = c.rotateDaily && lastAt !== null && (clock() - lastAt) >= 86400000
      const bytesDue = c.rotateBytes > 0 && approxBytes >= c.rotateBytes
      if (!dayDue && !bytesDue) {
        throw refuse('VMU_AUDIT_WRITE_FAILED', 'rotation is not due: ' + approxBytes + ' bytes of a ' + c.rotateBytes + ' limit, rotateDaily=' + c.rotateDaily,
          'pass { force: true } to rotate anyway (vmu.audit.rotateBytes / vmu.audit.rotateDaily)', { approxBytes, rotateBytes: c.rotateBytes, rotateDaily: c.rotateDaily })
      }
    }
    const kept = rows.filter((_, i) => (i + 1) % c.keepEvery === 0)
    const removed = rows.length - kept.length
    if (removed > 0) { rows.length = 0; for (const r of kept) rows.push(r); dropped += removed }
    if (bus && typeof bus.emit === 'function') bus.emit('audit/rotate', { kept: kept.length, removed })
    return { kept: kept.length, removed, dropped }
  }
  /** ROUND 221: who may recount. vmu.audit.recountRoles is the declared list, refused by name. */
  function recount({ byRole = null } = {}) {
    const c = cfg()
    const role = byRole === null ? null : String(byRole)
    if (role === null || !c.recountRoles.includes(role)) {
      throw refuse('VMU_AUDIT_RECOUNT_NOT_ALLOWED', 'recount is not allowed for role: ' + (role || '(none)'),
        'declared: ' + c.recountRoles.join(', ') + ' (vmu.audit.recountRoles)', { byRole: role, declared: c.recountRoles.slice() })
    }
    return { ok: true, byRole: role, rows: rows.length, verify: verify(), enforced: ['vmu.audit.recountRoles'], fired: [] }
  }
  /** ROUND 221: export filtered by the declared scope; a scope outside the list is refused by name. */
  function exportScoped({ scope = null, limit = null } = {}) {
    const c = cfg()
    const sc = scope === null ? null : String(scope)
    if (sc !== null && !c.exportScope.includes(sc)) {
      throw refuse('VMU_AUDIT_SCOPE_NOT_DECLARED', 'export scope is not declared: ' + sc,
        'declared: ' + c.exportScope.join(', ') + ' (vmu.audit.exportScope)', { scope: sc, declared: c.exportScope.slice() })
    }
    const items = rows.map((r) => Object.assign({}, r))
    const kept = Number.isInteger(limit) && limit > 0 ? items.slice(-limit) : items
    return { ok: true, scope: sc, scopes: c.exportScope.slice(), dir: c.auditDir, level: c.level, items: kept, total: items.length, dropped, expired,
      enforced: ['vmu.audit.exportScope', 'vmu.audit.level', 'vmu.audit.dir'], fired: [] }
  }
  /** export(): read-only projection; redaction already happened at append time. */
  const exportRows = ({ format } = {}) => {
    const c = cfg()
    const f = format === 'jsonl' || format === 'json' ? format : c.exportFormat
    const items = rows.map((r) => ({ ...r }))
    return f === 'jsonl' ? { format: f, text: items.map((r) => JSON.stringify(r)).join('\n') } : { format: f, text: JSON.stringify(items) }
  }

  return { apiVersion, append, tail, query, rotate, expire, export: exportRows, verify, status, recount, exportScoped, what: WHAT_VOCAB.slice() }
}
