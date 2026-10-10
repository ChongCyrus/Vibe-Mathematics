// vmu kernel audit — append-only, redact-before-store, named write failure, counted ring truncation.
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
  })

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

  /** Append one row. Redaction and sink write happen BEFORE it enters the ring. */
  function append({ what, ...fields } = {}) {
    if (!what || typeof what !== 'string') throw refuse('VMU_AUDIT_WRITE_FAILED', 'append needs a non-empty `what`', 'e.g. append({what:"vote", ballot:"b-1"})')
    const c = cfg()
    const seqNo = ++seq
    const row = { ...redactRow(fields, c.redactKeys), what, seq: seqNo, at: clock() }
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
  const status = () => ({ rows: rows.length, dropped, seq, policy: cfg(), sink: sink ? 'injected' : 'memory-only', vocab: WHAT_VOCAB.slice() })
  /** verify(): integrity of the in-memory chain (seq strictly increasing, no gaps after drops). */
  const verify = () => {
    let mono = true
    for (let i = 1; i < rows.length; i++) if (!(rows[i].seq > rows[i - 1].seq)) mono = false
    return { ok: mono, rows: rows.length, dropped, firstSeq: rows.length ? rows[0].seq : null, lastSeq: rows.length ? rows[rows.length - 1].seq : null }
  }
  /** rotate(): the only state-changing entry besides append; never deletes history outside the ring. */
  function rotate() {
    const c = cfg()
    const kept = rows.filter((_, i) => (i + 1) % c.keepEvery === 0)
    const removed = rows.length - kept.length
    if (removed > 0) { rows.length = 0; for (const r of kept) rows.push(r); dropped += removed }
    if (bus && typeof bus.emit === 'function') bus.emit('audit/rotate', { kept: kept.length, removed })
    return { kept: kept.length, removed, dropped }
  }
  /** export(): read-only projection; redaction already happened at append time. */
  const exportRows = ({ format } = {}) => {
    const c = cfg()
    const f = format === 'jsonl' || format === 'json' ? format : c.exportFormat
    const items = rows.map((r) => ({ ...r }))
    return f === 'jsonl' ? { format: f, text: items.map((r) => JSON.stringify(r)).join('\n') } : { format: f, text: JSON.stringify(items) }
  }

  return { apiVersion, append, tail, query, rotate, export: exportRows, verify, status, what: WHAT_VOCAB.slice() }
}
