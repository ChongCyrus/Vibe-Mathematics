// vmu kernel external — the N11 external-fetch adapter (docs/16 §8).
// `fetchFn` is an INJECTED seam: without it every fetch refuses BY NAME (VMU_EXTERNAL_UNAVAILABLE) and
// this module NEVER invents metadata. Every fetch produces a complete receipt; cache expiry has three
// EXPLICIT strategies (refresh | serve-stale-with-flag | refuse) and a stale serve is always flagged;
// multi-source conflicts are surfaced in `conflicts[]` instead of silently picking one; a cache hit does
// ZERO network calls (offline first). Codes: VMU_EXTERNAL_UNAVAILABLE / VMU_EXTERNAL_RECEIPT_INCOMPLETE /
// VMU_EXTERNAL_CONFLICT / VMU_EXTERNAL_STALE / VMU_EXTERNAL_DISABLED (03-§8).

export const apiVersion = 1

/** The five-step pipeline (16 §8): resolve → fetch → normalize → merge → receipt. */
export const PIPELINE = Object.freeze(['resolve', 'fetch', 'normalize', 'merge', 'receipt'])

/** The three explicit expiry strategies. */
export const STALE_POLICIES = Object.freeze(['refresh', 'serve-stale-with-flag', 'refuse'])

/** Conflict policies: refuse-on-conflict (default) | newest-wins (still surfaced). */
export const CONFLICT_POLICIES = Object.freeze(['refuse-on-conflict', 'newest-wins'])

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

import { createHash } from 'node:crypto'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
/** Deterministic, non-cryptographic identity for a query/result (07 §4.2 is referenced, not redefined). */
export const fingerprintOf = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value)).digest('hex')

export function createExternal({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, fetchFn = null, listCap = 100 } = {}) {
  const cache = new Map()      // cacheKey -> { key, source, id, query, payload, at, ttlMs, etag }
  const receiptsLog = []       // append-only receipts
  let dropped = 0
  let fetches = 0

  const cfg = () => ({
    enabled: settings['vmu.external.enabled'] === true,                        // default: disabled (zero-mechanism)
    ttlMs: intOr(settings['vmu.external.ttlMs'], 3_600_000),
    stalePolicy: STALE_POLICIES.includes(settings['vmu.external.stalePolicy']) ? settings['vmu.external.stalePolicy'] : 'refresh',
    conflictPolicy: CONFLICT_POLICIES.includes(settings['vmu.external.conflictPolicy']) ? settings['vmu.external.conflictPolicy'] : 'refuse-on-conflict',
    maxResults: intOr(settings['vmu.external.maxResults'], 100),
    maxBytes: intOr(settings['vmu.external.maxBytes'], 1 << 20),
    offline: settings['vmu.external.offline'] === true,
    sources: Array.isArray(settings['vmu.external.sources']) ? settings['vmu.external.sources'] : [],
  })

  const sourceOf = (source, c) => {
    if (!source) throw refuse('VMU_EXTERNAL_UNAVAILABLE', 'a source is required', 'pass source:<name>; declared sources: ' + (c.sources.join('|') || '(none)'))
    return String(source)
  }
  const cacheKey = (source, ref) => source + '::' + fingerprintOf(ref).slice(0, 16)

  /** Run the injected seam. Without a seam (or while disabled) this refuses and invents nothing. */
  async function callSeam({ source, ref, c }) {
    if (!c.enabled) throw refuse('VMU_EXTERNAL_DISABLED', 'external fetching is disabled (vmu.external.enabled=false)', 'set vmu.external.enabled=true to allow external fetches', { source })
    if (typeof fetchFn !== 'function') throw refuse('VMU_EXTERNAL_UNAVAILABLE', 'no fetchFn was injected: nothing can be fetched and no metadata will be invented', 'wire the adapter with createExternal({ fetchFn }) (a script/plugin owns the network)', { source })
    fetches += 1
    const out = await fetchFn({ source, ref, at: clock() })
    return out
  }

  /** Receipt completeness is enforced: a missing field is itself a named failure. */
  function makeReceipt(fields) {
    const need = ['at', 'by', 'source', 'endpoint', 'queryFingerprint', 'resultFingerprint', 'cached', 'stale', 'ttlMs', 'ageMs']
    const missing = need.filter((k) => fields[k] === undefined || fields[k] === null)
    if (missing.length) throw refuse('VMU_EXTERNAL_RECEIPT_INCOMPLETE', 'fetch receipt is incomplete, missing: ' + missing.join(', '), 'a receipt must carry at/by/source/endpoint/queryFingerprint/resultFingerprint/cached/stale/ttlMs/ageMs', { missing })
    return fields
  }

  /** fetchOne(): cache first (zero network on hit), then the explicit expiry strategy. */
  async function fetchOne({ source = null, id = null, query = null, by = 'unknown' } = {}) {
    const c = cfg()
    const src = sourceOf(source, c)
    const ref = id !== null ? { id } : (query !== null ? { query } : null)
    if (!ref) throw refuse('VMU_EXTERNAL_UNAVAILABLE', 'fetchOne needs id or query', 'pass id:<doi|arxiv|pmid> or query:{…}', { source: src })
    const key = cacheKey(src, ref)
    const hit = cache.get(key)
    const ageMs = hit ? clock() - hit.at : null
    const expired = hit ? ageMs > hit.ttlMs : false
    const qfp = fingerprintOf(ref)

    // (5) offline first: a cache hit never touches the network, whatever the expiry strategy says next.
    if (hit && !expired) {
      const receipt = makeReceipt({ at: clock(), by, source: src, endpoint: hit.endpoint || (src + ':' + (ref.id || 'query')), queryFingerprint: qfp, resultFingerprint: hit.fingerprint, cached: true, stale: false, ttlMs: hit.ttlMs, ageMs })
      receiptsLog.push(receipt)
      return { ok: true, receipt, payload: hit.payload, conflicts: [] }
    }
    if (hit && expired) {
      if (c.offline && c.stalePolicy === 'refresh') {
        // no network available: honour the explicit policy rather than silently using stale data
        throw refuse('VMU_EXTERNAL_STALE', 'cached entry for ' + src + ' is expired and the adapter is offline', 'set vmu.external.stalePolicy=serve-stale-with-flag to serve it WITH a stale flag, or reconnect', { source: src, ageMs, ttlMs: hit.ttlMs })
      }
      if (c.stalePolicy === 'refuse') {
        throw refuse('VMU_EXTERNAL_STALE', 'cached entry for ' + src + ' is expired (age=' + ageMs + 'ms > ttl=' + hit.ttlMs + 'ms) and policy is refuse', 'refresh it or change vmu.external.stalePolicy', { source: src, ageMs, ttlMs: hit.ttlMs })
      }
      if (c.stalePolicy === 'serve-stale-with-flag') {
        const receipt = makeReceipt({ at: clock(), by, source: src, endpoint: hit.endpoint || (src + ':' + (ref.id || 'query')), queryFingerprint: qfp, resultFingerprint: hit.fingerprint, cached: true, stale: true, ttlMs: hit.ttlMs, ageMs })
        receiptsLog.push(receipt)
        if (bus && typeof bus.emit === 'function') bus.emit('external/stale-served', { source: src, ageMs, ttlMs: hit.ttlMs })
        log('external: serving STALE cache for ' + src + ' (age=' + ageMs + 'ms, ttl=' + hit.ttlMs + 'ms)')
        return { ok: true, receipt, payload: hit.payload, conflicts: [], staleNotice: 'VMU_EXTERNAL_STALE' }
      }
      // refresh falls through to the seam
    }

    const raw = await callSeam({ source: src, ref, c })
    const payload = normalize({ results: raw && raw.results ? raw.results : raw })
    const truncated = raw && raw.truncated === true
    const resultFingerprint = fingerprintOf(payload.items)
    const entry = { key, source: src, id: ref.id || null, query: ref.query || null, payload, endpoint: (raw && raw.endpoint) || (src + ':' + (ref.id || 'query')), at: clock(), ttlMs: c.ttlMs, fingerprint: resultFingerprint }
    cache.set(key, entry)
    const receipt = makeReceipt({ at: entry.at, by, source: src, endpoint: entry.endpoint, queryFingerprint: qfp, resultFingerprint, cached: false, stale: false, ttlMs: c.ttlMs, ageMs: 0 })
    receiptsLog.push(receipt)
    return { ok: true, receipt, payload, conflicts: [], truncated, note: truncated ? 'result set was truncated by the source' : null }
  }

  /** normalize(): a stable shape for any source's payload (never invents fields). */
  function normalize({ results } = {}) {
    const c = cfg()
    const list = Array.isArray(results) ? results : (results && Array.isArray(results.items) ? results.items : [])
    const items = list.slice(0, c.maxResults).map((r) => ({
      id: r && (r.id || r.doi || r.arxiv || r.pmid) ? String(r.id || r.doi || r.arxiv || r.pmid) : null,
      title: r && r.title !== undefined ? String(r.title) : null,
      source: r && r.source ? String(r.source) : null,
      authors: Array.isArray(r && r.authors) ? r.authors.slice(0, 50) : [],
      year: r && r.year !== undefined ? r.year : null,
      url: r && r.url ? String(r.url) : null,
      raw: r === undefined ? null : r,
    }))
    const droppedCount = Math.max(0, list.length - items.length)
    const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
    let totalDropped = droppedCount
    let kept = items
    if (bytes > c.maxBytes) {
      const perItem = bytes / Math.max(1, items.length)
      const keep = Math.max(1, Math.floor(c.maxBytes / perItem))
      totalDropped += items.length - keep
      kept = items.slice(0, keep)
    }
    if (totalDropped > 0) { dropped += totalDropped; log('external: normalize dropped ' + totalDropped + ' item(s) (maxResults=' + c.maxResults + ', maxBytes=' + c.maxBytes + ')') }
    return { items: kept, total: list.length, dropped: totalDropped, policyApplied: c.maxResults }
  }

  /** fetchMany(): merge several sources and SURFACE conflicts instead of silently picking one. */
  async function fetchMany({ refs = [], by = 'unknown' } = {}) {
    const c = cfg()
    const list = Array.isArray(refs) ? refs : []
    const results = []
    const conflicts = []
    const errors = []
    for (const ref of list) {
      try { results.push(await fetchOne({ ...ref, by })) } catch (e) { errors.push({ ref, code: e && e.code, message: String((e && e.message) || e) }) }
    }
    const byId = new Map()
    for (const r of results) for (const item of r.payload.items) {
      if (!item.id) continue
      const prev = byId.get(item.id)
      if (prev && JSON.stringify(prev.item) !== JSON.stringify(item)) {
        conflicts.push({ id: item.id, sources: [prev.source, item.source], fields: { title: [prev.item.title, item.title], year: [prev.item.year, item.year], url: [prev.item.url, item.url] } })
      } else if (!prev) byId.set(item.id, { item, source: item.source })
    }
    if (conflicts.length && c.conflictPolicy === 'refuse-on-conflict') {
      throw refuse('VMU_EXTERNAL_CONFLICT', 'sources disagree on ' + conflicts.length + ' record(s): ' + conflicts.map((x) => x.id).join(', '), 'vmu.external.conflictPolicy=refuse-on-conflict: resolve manually or switch to newest-wins', { conflicts })
    }
    return { ok: true, merged: [...byId.values()].map((v) => v.item), conflicts, errors, fetches, receipts: results.map((r) => r.receipt) }
  }

  /** Read-only surfaces. */
  const cacheView = ({ list = true, clear = false } = {}) => {
    if (clear) { const n = cache.size; cache.clear(); return { cleared: n } }
    const all = [...cache.values()].map((e) => ({ key: e.key, source: e.source, id: e.id, at: e.at, ttlMs: e.ttlMs, ageMs: Math.max(0, clock() - e.at), stale: clock() - e.at > e.ttlMs, fingerprint: e.fingerprint }))
    if (!list) return { size: all.length }
    if (all.length <= listCap) return { items: all, total: all.length, dropped: 0 }
    return { items: all.slice(0, listCap), total: all.length, dropped: all.length - listCap }
  }
  const receipts = ({ limit = 20 } = {}) => {
    const n = intOr(limit, 20) || 20
    const kept = receiptsLog.slice(-n)
    return { items: kept.map((r) => ({ ...r })), total: receiptsLog.length, omitted: receiptsLog.length - kept.length, dropped }
  }
  const status = () => ({ enabled: cfg().enabled, seam: typeof fetchFn === 'function' ? 'injected' : 'none', cacheSize: cache.size, receipts: receiptsLog.length, networkCalls: fetches, dropped, policy: cfg(), pipeline: PIPELINE.slice(), stalePolicies: STALE_POLICIES.slice() })

  return { apiVersion, fetchOne, fetchMany, normalize, cache: cacheView, receipts, status }
}
