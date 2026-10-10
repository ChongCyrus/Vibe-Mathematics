// vmu kernel external — the N11 external-fetch adapter (docs/16 §8).
// `fetchFn` is an INJECTED seam: without it every fetch refuses BY NAME (VMU_EXTERNAL_UNAVAILABLE) and
// this module NEVER invents metadata. Every fetch produces a complete receipt; cache expiry has three
// EXPLICIT strategies (refresh | serve-stale-with-flag | refuse) and a stale serve is always flagged;
// multi-source conflicts are surfaced in `conflicts[]` instead of silently picking one; a cache hit does
// ZERO network calls (offline first). Codes: VMU_EXTERNAL_UNAVAILABLE / VMU_EXTERNAL_RECEIPT_INCOMPLETE /
// VMU_EXTERNAL_CONFLICT / VMU_EXTERNAL_STALE / VMU_EXTERNAL_DISABLED (03-§8).
//
// task-145 — the 27 DECLARED `vmu.external.*` keys (docs/16 §8) are now actually READ here, one wired
// behaviour each (the same standard as kernel/mathtools.js): every receipt and every read surface carries
// `enforced[]` naming ONLY the keys that were consulted for that call, and EVERY refusal carries the same
// list as an ARRAY (an empty array is legal; `undefined` is not). Nothing is read-but-inert: a declared key
// that could not be honoured is NAMED in `status().plannedKeys` with its reason.
//
// WHAT EACH DECLARED KEY CHANGES (all observable through the EXISTING public surface — no method was added):
//   enabled            disabled ⇒ named refusal; the seam is never called
//   endpoints          a source outside the declared map ⇒ named refusal listing the allowed ones
//   allowNetwork       false ⇒ a cache miss refuses (VMU_NETWORK_DENIED) instead of egressing
//   offlineFirst       true ⇒ a cache miss refuses rather than going to the network
//   timeoutMs          the seam took longer than the limit ⇒ VMU_TIMEOUT with 现值/上限
//   ttlMs              the cached entry's lifetime (drives expiry)
//   stalePolicy        the THREE registered strategies (refresh | serve-stale-with-flag | refuse)
//   maxCacheEntries    inserting past the cap EVICTS the oldest and counts it (`status().evictions`)
//   cacheDir           echoed on the receipt; a request naming a different dir is refused
//   mergePolicy        refuse-on-conflict | newest-wins | primary-wins (observable in `merged[]`)
//   primarySources     which source wins under primary-wins
//   requireReceipt     true ⇒ a seam without `endpoint` is refused; false ⇒ synthesised AND counted
//   maxBytes           normalized payload above the cap is truncated AND counted
//   swh.requireSwhid / swh.maxTreeEntries
//   arxiv.preferVersioned / arxiv.maxAbstractChars
//   crossref.includeRelations / crossref.mailto
//   openalex.mailto / openalex.maxConcepts
//   pubmed.maxMeshTerms / pubmed.preferAuthoritative
//   datacite.maxRelated / datacite.requireRights
//   patent.maxResults / patent.requireQueryString

export const apiVersion = 1

/** The five-step pipeline (16 §8): resolve → fetch → normalize → merge → receipt. */
export const PIPELINE = Object.freeze(['resolve', 'fetch', 'normalize', 'merge', 'receipt'])

/** The three explicit expiry strategies. */
export const STALE_POLICIES = Object.freeze(['refresh', 'serve-stale-with-flag', 'refuse'])

/** Conflict policies: refuse-on-conflict (default) | newest-wins (still surfaced). */
export const CONFLICT_POLICIES = Object.freeze(['refuse-on-conflict', 'newest-wins'])

/** task-145: the merge policies the DECLARED `vmu.external.mergePolicy` may take. */
export const MERGE_POLICIES = Object.freeze(['refuse-on-conflict', 'newest-wins', 'primary-wins'])

/** task-145: the 27 declared keys this module reads (self-disclosed; complement lives in status().plannedKeys). */
export const WIRED_KEYS = Object.freeze([
  'vmu.external.enabled', 'vmu.external.endpoints', 'vmu.external.allowNetwork', 'vmu.external.offlineFirst',
  'vmu.external.timeoutMs', 'vmu.external.ttlMs', 'vmu.external.stalePolicy', 'vmu.external.maxCacheEntries',
  'vmu.external.cacheDir', 'vmu.external.mergePolicy', 'vmu.external.primarySources', 'vmu.external.requireReceipt',
  'vmu.external.maxBytes',
  'vmu.external.swh.requireSwhid', 'vmu.external.swh.maxTreeEntries',
  'vmu.external.arxiv.preferVersioned', 'vmu.external.arxiv.maxAbstractChars',
  'vmu.external.crossref.includeRelations', 'vmu.external.crossref.mailto',
  'vmu.external.openalex.mailto', 'vmu.external.openalex.maxConcepts',
  'vmu.external.pubmed.maxMeshTerms', 'vmu.external.pubmed.preferAuthoritative',
  'vmu.external.datacite.maxRelated', 'vmu.external.datacite.requireRights',
  'vmu.external.patent.maxResults', 'vmu.external.patent.requireQueryString',
])

/** Why a declared-but-unwired key would not be honoured (kept for future declarations). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.external': '尚未接线：本层只覆盖 16 卷 §8 声明的 27 条外部取数旋钮；新声明的键需要一个语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])
/** Deterministic, non-cryptographic identity for a query/result (07 §4.2 is referenced, not redefined). */
export const fingerprintOf = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value)).digest('hex')

export function createExternal({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, fetchFn = null, listCap = 100 } = {}) {
  const cache = new Map()      // cacheKey -> { key, source, id, query, payload, at, ttlMs, etag }
  const receiptsLog = []       // append-only receipts
  let dropped = 0
  let fetches = 0
  let evictions = 0
  let receiptsSynthesised = 0
  let capDropped = { abstract: 0, concepts: 0, meshTerms: 0, related: 0, tree: 0 }
  const refusals = new Map()

  /** task-145: every refusal carries `enforced` — an ARRAY of the keys consulted so far (never undefined).
   *  D3（第 26 轮）：`enforcedScope` **随证明同行** —— 明写这是"**到此为止**"的已求值集合，
   *  而非该操作会读的完整集合 ⇒ 审计者**不得**把部分集当全集 ✗✓（照 records／meetings 已验收口径 ✓）。 */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  const deny = (code, message, hint, extra, evaluated) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const keys = Array.isArray(evaluated) ? evaluated.slice() : []
    try { log('external: refused ' + code + ' [' + keys.join(',') + ']') } catch (e) { /* logging must not break a refusal */ }
    return refuse(code, message, hint, Object.assign({ enforced: keys, enforcedScope: ENFORCED_SCOPE, evaluated: keys.slice() }, extra || {}))
  }
  const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }

  const cfg = () => ({
    // ── pre-existing knobs (kept for compatibility) ───────────────────────────────────────────────────
    enabled: settings['vmu.external.enabled'] === true,                        // default: disabled (zero-mechanism)
    ttlMs: intOr(settings['vmu.external.ttlMs'], 3_600_000),
    stalePolicy: STALE_POLICIES.includes(settings['vmu.external.stalePolicy']) ? settings['vmu.external.stalePolicy'] : 'refresh',
    conflictPolicy: CONFLICT_POLICIES.includes(settings['vmu.external.conflictPolicy']) ? settings['vmu.external.conflictPolicy'] : 'refuse-on-conflict',
    maxResults: intOr(settings['vmu.external.maxResults'], 100),
    maxBytes: intOr(settings['vmu.external.maxBytes'], 1 << 20),
    offline: settings['vmu.external.offline'] === true,
    // 语义（第 26 轮实测后写明，**不改行为** ✗）：`vmu.external.sources` **默认 `[]` ＝ 不设白名单** ——
    // 空数组意味着 sourceOf() **不做** source 名校验（**任意源名都能通过** ✓）；只有当它非空时，
    // 未声明的源名才会被具名拒（VMU_EXTERNAL_UNAVAILABLE）。要"只允许白名单内的源"必须显式声明该键。
    sources: Array.isArray(settings['vmu.external.sources']) ? settings['vmu.external.sources'] : [],
    // ── task-145: the DECLARED keys (plain literals; the settings audit discovers them by scanning text) ─
    allowNetwork: settings['vmu.external.allowNetwork'] !== false,
    offlineFirst: settings['vmu.external.offlineFirst'] === true,
    timeoutMs: intOr(settings['vmu.external.timeoutMs'], 0),
    maxCacheEntries: intOr(settings['vmu.external.maxCacheEntries'], 0),
    cacheDir: str(settings['vmu.external.cacheDir']),
    endpoints: settings['vmu.external.endpoints'] && typeof settings['vmu.external.endpoints'] === 'object' ? settings['vmu.external.endpoints'] : null,
    mergePolicy: MERGE_POLICIES.includes(settings['vmu.external.mergePolicy'])
      ? settings['vmu.external.mergePolicy']
      : (CONFLICT_POLICIES.includes(settings['vmu.external.conflictPolicy']) ? settings['vmu.external.conflictPolicy'] : 'refuse-on-conflict'),
    primarySources: listOr(settings['vmu.external.primarySources']),
    requireReceipt: settings['vmu.external.requireReceipt'] !== false,
    swhRequireSwhid: settings['vmu.external.swh.requireSwhid'] === true,
    swhMaxTreeEntries: intOr(settings['vmu.external.swh.maxTreeEntries'], 0),
    arxivPreferVersioned: settings['vmu.external.arxiv.preferVersioned'] === true,
    arxivMaxAbstractChars: intOr(settings['vmu.external.arxiv.maxAbstractChars'], 0),
    crossrefIncludeRelations: settings['vmu.external.crossref.includeRelations'] === true,
    crossrefMailto: str(settings['vmu.external.crossref.mailto']),
    openalexMailto: str(settings['vmu.external.openalex.mailto']),
    openalexMaxConcepts: intOr(settings['vmu.external.openalex.maxConcepts'], 0),
    pubmedMaxMeshTerms: intOr(settings['vmu.external.pubmed.maxMeshTerms'], 0),
    pubmedPreferAuthoritative: settings['vmu.external.pubmed.preferAuthoritative'] === true,
    dataciteMaxRelated: intOr(settings['vmu.external.datacite.maxRelated'], 0),
    dataciteRequireRights: settings['vmu.external.datacite.requireRights'] === true,
    patentMaxResults: intOr(settings['vmu.external.patent.maxResults'], 0),
    patentRequireQueryString: settings['vmu.external.patent.requireQueryString'] === true,
  })

  /** The declared-key values (used by status()); explicit so a name-derived lookup cannot produce nulls. */
  const keyValues = (c) => ({
    'vmu.external.enabled': c.enabled, 'vmu.external.endpoints': c.endpoints, 'vmu.external.allowNetwork': c.allowNetwork,
    'vmu.external.offlineFirst': c.offlineFirst, 'vmu.external.timeoutMs': c.timeoutMs, 'vmu.external.ttlMs': c.ttlMs,
    'vmu.external.stalePolicy': c.stalePolicy, 'vmu.external.maxCacheEntries': c.maxCacheEntries, 'vmu.external.cacheDir': c.cacheDir,
    'vmu.external.mergePolicy': c.mergePolicy, 'vmu.external.primarySources': c.primarySources, 'vmu.external.requireReceipt': c.requireReceipt,
    'vmu.external.maxBytes': c.maxBytes,
    'vmu.external.swh.requireSwhid': c.swhRequireSwhid, 'vmu.external.swh.maxTreeEntries': c.swhMaxTreeEntries,
    'vmu.external.arxiv.preferVersioned': c.arxivPreferVersioned, 'vmu.external.arxiv.maxAbstractChars': c.arxivMaxAbstractChars,
    'vmu.external.crossref.includeRelations': c.crossrefIncludeRelations, 'vmu.external.crossref.mailto': c.crossrefMailto,
    'vmu.external.openalex.mailto': c.openalexMailto, 'vmu.external.openalex.maxConcepts': c.openalexMaxConcepts,
    'vmu.external.pubmed.maxMeshTerms': c.pubmedMaxMeshTerms, 'vmu.external.pubmed.preferAuthoritative': c.pubmedPreferAuthoritative,
    'vmu.external.datacite.maxRelated': c.dataciteMaxRelated, 'vmu.external.datacite.requireRights': c.dataciteRequireRights,
    'vmu.external.patent.maxResults': c.patentMaxResults, 'vmu.external.patent.requireQueryString': c.patentRequireQueryString,
  })

  /** `endpoints` (when declared) is the allow-list of sources: an undeclared source is refused BY NAME. */
  const sourceOf = (source, c, enforced = null) => {
    if (!source) throw deny('VMU_EXTERNAL_UNAVAILABLE', 'a source is required', 'pass source:<name>; declared sources: ' + (c.sources.join('|') || '(none)'), null, enforced)
    const src = String(source)
    if (c.endpoints) {
      mark(enforced || [], 'vmu.external.endpoints')
      const allowed = Object.keys(c.endpoints)
      if (!allowed.includes(src)) throw deny('VMU_EXTERNAL_UNAVAILABLE', 'source "' + src + '" is not in vmu.external.endpoints', 'declared sources: ' + (allowed.join(', ') || '(none)'), { source: src }, enforced)
    }
    if (c.sources.length && !c.sources.includes(src)) {
      throw deny('VMU_EXTERNAL_UNAVAILABLE', 'source "' + src + '" is not in vmu.external.sources', 'declared sources: ' + c.sources.join(', '), { source: src }, enforced)
    }
    return src
  }
  const cacheKey = (source, ref) => source + '::' + fingerprintOf(ref).slice(0, 16)

  /** The request identity: the DECLARED per-source contact address (an honest, disclosable identifier). */
  const identityOf = (source, c, enforced) => {
    const id = { source, mailto: null, cacheDir: c.cacheDir || null }
    if (source === 'crossref' && c.crossrefMailto) { mark(enforced, 'vmu.external.crossref.mailto'); id.mailto = c.crossrefMailto }
    if (source === 'openalex' && c.openalexMailto) { mark(enforced, 'vmu.external.openalex.mailto'); id.mailto = c.openalexMailto }
    return id
  }

  /** Run the injected seam. Without a seam (or while disabled) this refuses and invents nothing. */
  async function callSeam({ source, ref, c, enforced }) {
    mark(enforced, 'vmu.external.enabled')
    if (!c.enabled) throw deny('VMU_EXTERNAL_DISABLED', 'external fetching is disabled (vmu.external.enabled=false)', 'set vmu.external.enabled=true to allow external fetches', { source }, enforced)
    if (typeof fetchFn !== 'function') throw deny('VMU_EXTERNAL_UNAVAILABLE', 'no fetchFn was injected: nothing can be fetched and no metadata will be invented', 'wire the adapter with createExternal({ fetchFn }) (a script/plugin owns the network)', { source }, enforced)
    mark(enforced, 'vmu.external.allowNetwork')
    if (!c.allowNetwork) throw deny('VMU_NETWORK_DENIED', 'a network fetch is required but vmu.external.allowNetwork=false', 'set vmu.external.allowNetwork=true (or make the answer cacheable) — no egress happens while it is false', { source }, enforced)
    mark(enforced, 'vmu.external.offlineFirst')
    if (c.offlineFirst) throw deny('VMU_EXTERNAL_UNAVAILABLE', 'vmu.external.offlineFirst=true: a cache miss is NOT resolved over the network', 'warm the cache first, or set vmu.external.offlineFirst=false', { source }, enforced)
    const startedAt = clock()
    fetches += 1
    const out = await fetchFn({ source, ref, at: clock(), identity: identityOf(source, c, enforced) })
    if (c.timeoutMs > 0) {
      mark(enforced, 'vmu.external.timeoutMs')
      const spent = clock() - startedAt
      if (spent > c.timeoutMs) throw deny('VMU_TIMEOUT', 'the fetch exceeded vmu.external.timeoutMs: ' + spent + 'ms > ' + c.timeoutMs + 'ms', '现值=' + spent + 'ms, 上限=' + c.timeoutMs + 'ms (vmu.external.timeoutMs)', { source, spent }, enforced)
    }
    return out
  }

  /** Receipt completeness is enforced: a missing field is itself a named failure. */
  function makeReceipt(fields, c, enforced) {
    const need = ['at', 'by', 'source', 'endpoint', 'queryFingerprint', 'resultFingerprint', 'cached', 'stale', 'ttlMs', 'ageMs']
    if (c && c.requireReceipt === false && (fields.endpoint === undefined || fields.endpoint === null)) {
      // requireReceipt=false: a seam that declares no endpoint is tolerated, SYNTHESISED and counted.
      receiptsSynthesised += 1
      fields = Object.assign({}, fields, { endpoint: fields.source + ':' + (fields.id || 'query'), receiptSynthesised: true })
      mark(enforced, 'vmu.external.requireReceipt')
    } else if (c && c.requireReceipt !== false) {
      mark(enforced, 'vmu.external.requireReceipt')
    }
    const missing = need.filter((k) => fields[k] === undefined || fields[k] === null)
    if (missing.length) throw deny('VMU_EXTERNAL_RECEIPT_INCOMPLETE', 'fetch receipt is incomplete, missing: ' + missing.join(', '), 'a receipt must carry at/by/source/endpoint/queryFingerprint/resultFingerprint/cached/stale/ttlMs/ageMs', { missing }, enforced)
    if (enforced) fields.enforced = enforced.slice()
    fields.enforcedScope = ENFORCED_SCOPE   // D3：回执级口径（"到此为止"的已求值集合 ✓）
    return fields
  }

  /** fetchOne(): cache first (zero network on hit), then the explicit expiry strategy. */
  async function fetchOne({ source = null, id = null, query = null, by = 'unknown', cacheDir = null } = {}) {
    const c = cfg()
    const enforced = []
    const src = sourceOf(source, c, enforced)
    if (cacheDir !== null) {
      mark(enforced, 'vmu.external.cacheDir')
      if (c.cacheDir && String(cacheDir) !== c.cacheDir) {
        throw deny('VMU_EXTERNAL_UNAVAILABLE', 'cacheDir "' + String(cacheDir) + '" differs from the declared one', 'declared=' + c.cacheDir + ', requested=' + String(cacheDir) + ' (vmu.external.cacheDir)', { source: src }, enforced)
      }
    }
    // task-145: patent queries must carry a query string when the key says so
    if (src === 'patent' && c.patentRequireQueryString) {
      mark(enforced, 'vmu.external.patent.requireQueryString')
      const q = query && (query.q || query.queryString || query.query)
      if (!q) throw deny('VMU_EXTERNAL_UNAVAILABLE', 'vmu.external.patent.requireQueryString=true: a patent query needs a query string', 'pass query:{ q: "…" }', { source: src }, enforced)
    }
    const ref = id !== null ? { id } : (query !== null ? { query } : null)
    if (!ref) throw deny('VMU_EXTERNAL_UNAVAILABLE', 'fetchOne needs id or query', 'pass id:<doi|arxiv|pmid> or query:{…}', { source: src }, enforced)
    const key = cacheKey(src, ref)
    const hit = cache.get(key)
    const ageMs = hit ? clock() - hit.at : null
    const expired = hit ? ageMs > hit.ttlMs : false
    const qfp = fingerprintOf(ref)

    // (5) offline first: a cache hit never touches the network, whatever the expiry strategy says next.
    if (hit && !expired) {
      mark(enforced, 'vmu.external.ttlMs')
      const identity = identityOf(src, c, enforced)
      const receipt = makeReceipt({ at: clock(), by, source: src, endpoint: hit.endpoint || (src + ':' + (ref.id || 'query')), queryFingerprint: qfp, resultFingerprint: hit.fingerprint, cached: true, stale: false, ttlMs: hit.ttlMs, ageMs, identity }, c, enforced)
      receiptsLog.push(receipt)
      return { ok: true, receipt, payload: hit.payload, conflicts: [], enforced, enforcedScope: ENFORCED_SCOPE }
    }
    if (hit && expired) {
      mark(enforced, 'vmu.external.stalePolicy')
      if (c.offline && c.stalePolicy === 'refresh') {
        // no network available: honour the explicit policy rather than silently using stale data
        throw deny('VMU_EXTERNAL_STALE', 'cached entry for ' + src + ' is expired and the adapter is offline', 'set vmu.external.stalePolicy=serve-stale-with-flag to serve it WITH a stale flag, or reconnect', { source: src, ageMs, ttlMs: hit.ttlMs }, enforced)
      }
      if (c.stalePolicy === 'refuse') {
        throw deny('VMU_EXTERNAL_STALE', 'cached entry for ' + src + ' is expired (age=' + ageMs + 'ms > ttl=' + hit.ttlMs + 'ms) and policy is refuse', 'refresh it or change vmu.external.stalePolicy', { source: src, ageMs, ttlMs: hit.ttlMs }, enforced)
      }
      if (c.stalePolicy === 'serve-stale-with-flag') {
        const identity = identityOf(src, c, enforced)
        const receipt = makeReceipt({ at: clock(), by, source: src, endpoint: hit.endpoint || (src + ':' + (ref.id || 'query')), queryFingerprint: qfp, resultFingerprint: hit.fingerprint, cached: true, stale: true, ttlMs: hit.ttlMs, ageMs, identity }, c, enforced)
        receiptsLog.push(receipt)
        if (bus && typeof bus.emit === 'function') bus.emit('external/stale-served', { source: src, ageMs, ttlMs: hit.ttlMs })
        log('external: serving STALE cache for ' + src + ' (age=' + ageMs + 'ms, ttl=' + hit.ttlMs + 'ms)')
        return { ok: true, receipt, payload: hit.payload, conflicts: [], staleNotice: 'VMU_EXTERNAL_STALE', enforced, enforcedScope: ENFORCED_SCOPE }
      }
      // refresh falls through to the seam
    }

    const raw = await callSeam({ source: src, ref, c, enforced })
    mark(enforced, 'vmu.external.requireReceipt')
    let endpoint = raw && raw.endpoint !== undefined && raw.endpoint !== null ? raw.endpoint : null
    let synthesised = false
    if (endpoint === null) {
      if (c.requireReceipt !== false) {
        throw deny('VMU_EXTERNAL_RECEIPT_INCOMPLETE', 'vmu.external.requireReceipt=true but the seam returned no endpoint', 'the seam must declare endpoint, or set vmu.external.requireReceipt=false (the endpoint is then synthesised and COUNTED)', { source: src }, enforced)
      }
      // requireReceipt=false: the module supplies the endpoint — SYNTHESISED and COUNTED, never silent.
      receiptsSynthesised += 1
      synthesised = true
      endpoint = src + ':' + (ref.id || 'query')
    }
    mark(enforced, 'vmu.external.maxBytes')
    const payload = normalize({ results: raw && raw.results ? raw.results : raw, source: src, enforced, raw })
    const truncated = raw && raw.truncated === true
    const resultFingerprint = fingerprintOf(payload.items)
    const entry = { key, source: src, id: ref.id || null, query: ref.query || null, payload, endpoint, at: clock(), ttlMs: c.ttlMs, fingerprint: resultFingerprint }
    cache.set(key, entry)
    // task-145: maxCacheEntries evicts the OLDEST entry and counts it (never silently unbounded)
    if (c.maxCacheEntries > 0) {
      mark(enforced, 'vmu.external.maxCacheEntries')
      while (cache.size > c.maxCacheEntries) { const oldest = cache.keys().next().value; cache.delete(oldest); evictions += 1 }
    }
    const identity = identityOf(src, c, enforced)
    const receipt = makeReceipt({ at: entry.at, by, source: src, endpoint: entry.endpoint, queryFingerprint: qfp, resultFingerprint, cached: false, stale: false, ttlMs: c.ttlMs, ageMs: 0, identity, cacheDir: c.cacheDir || null, ...(synthesised ? { receiptSynthesised: true } : {}) }, c, enforced)
    receiptsLog.push(receipt)
    return { ok: true, receipt, payload, conflicts: [], truncated, enforced, enforcedScope: ENFORCED_SCOPE, note: truncated ? 'result set was truncated by the source' : null }
  }

  /**
   * normalize(): a stable shape for any source's payload (never invents fields).
   * task-145: the DECLARED per-source caps/options shape the result — each cap truncates AND counts.
   */
  function normalize({ results, source = null, enforced = null, raw = null } = {}) {
    const c = cfg()
    const keys = enforced || []
    const list = Array.isArray(results) ? results : (results && Array.isArray(results.items) ? results.items : [])
    const src = source === null ? null : String(source)
    // per-source result cap (`vmu.external.patent.maxResults`), intersected with the global maxResults
    let cap = c.maxResults
    if (src === 'patent' && c.patentMaxResults > 0) { mark(keys, 'vmu.external.patent.maxResults'); cap = Math.min(cap, c.patentMaxResults) }
    const items = list.slice(0, cap).map((r) => {
      const item = {
        id: r && (r.id || r.doi || r.arxiv || r.pmid) ? String(r.id || r.doi || r.arxiv || r.pmid) : null,
        title: r && r.title !== undefined ? String(r.title) : null,
        source: r && r.source ? String(r.source) : null,
        authors: Array.isArray(r && r.authors) ? r.authors.slice(0, 50) : [],
        year: r && r.year !== undefined ? r.year : null,
        url: r && r.url ? String(r.url) : null,
        raw: r === undefined ? null : r,
      }
      // arxiv: versioned ids + abstract cap (both counted)
      if (src === 'arxiv' || (r && r.arxiv !== undefined)) {
        if (c.arxivPreferVersioned) {
          mark(keys, 'vmu.external.arxiv.preferVersioned')
          if (item.id && /^arxiv:|^\d{4}\.\d{4,5}$/.test(item.id) && !/v\d+$/.test(item.id)) item.id = item.id + 'v1'
        }
        if (c.arxivMaxAbstractChars > 0 && r && typeof r.abstract === 'string' && r.abstract.length > c.arxivMaxAbstractChars) {
          mark(keys, 'vmu.external.arxiv.maxAbstractChars')
          capDropped.abstract += r.abstract.length - c.arxivMaxAbstractChars
          item.abstract = r.abstract.slice(0, c.arxivMaxAbstractChars)
        }
      }
      // crossref: relations are only carried when the declared key asks for them
      if (c.crossrefIncludeRelations && r && (r.relations !== undefined || r.relation !== undefined)) {
        mark(keys, 'vmu.external.crossref.includeRelations')
        item.relations = r.relations === undefined ? r.relation : r.relations
      }
      // openalex: concept cap (counted)
      if (src === 'openalex' || (r && r.concepts !== undefined)) {
        if (c.openalexMaxConcepts > 0 && Array.isArray(r && r.concepts) && r.concepts.length > c.openalexMaxConcepts) {
          mark(keys, 'vmu.external.openalex.maxConcepts')
          capDropped.concepts += r.concepts.length - c.openalexMaxConcepts
          item.concepts = r.concepts.slice(0, c.openalexMaxConcepts)
        } else if (r && r.concepts !== undefined) item.concepts = Array.isArray(r.concepts) ? r.concepts.slice() : r.concepts
      }
      // pubmed: MeSH cap (counted)
      if (src === 'pmid' || src === 'pubmed' || (r && r.meshTerms !== undefined)) {
        if (c.pubmedMaxMeshTerms > 0 && Array.isArray(r && r.meshTerms) && r.meshTerms.length > c.pubmedMaxMeshTerms) {
          mark(keys, 'vmu.external.pubmed.maxMeshTerms')
          capDropped.meshTerms += r.meshTerms.length - c.pubmedMaxMeshTerms
          item.meshTerms = r.meshTerms.slice(0, c.pubmedMaxMeshTerms)
        } else if (r && r.meshTerms !== undefined) item.meshTerms = Array.isArray(r.meshTerms) ? r.meshTerms.slice() : r.meshTerms
      }
      // datacite: related-identifier cap (counted) + rights requirement (refused, never invented)
      if (src === 'datacite' || (r && (r.relatedIdentifiers !== undefined || r.rights !== undefined))) {
        if (c.dataciteRequireRights) {
          mark(keys, 'vmu.external.datacite.requireRights')
          const rights = r && (r.rights !== undefined ? r.rights : (r.rightsList && r.rightsList[0]))
          if (!rights) throw deny('VMU_EXTERNAL_RECEIPT_INCOMPLETE', 'vmu.external.datacite.requireRights=true: a DataCite record without `rights` is refused', 'the source declared no licence/rights: this module never invents one', { id: item.id }, keys)
        }
        if (c.dataciteMaxRelated > 0 && Array.isArray(r && r.relatedIdentifiers) && r.relatedIdentifiers.length > c.dataciteMaxRelated) {
          mark(keys, 'vmu.external.datacite.maxRelated')
          capDropped.related += r.relatedIdentifiers.length - c.dataciteMaxRelated
          item.relatedIdentifiers = r.relatedIdentifiers.slice(0, c.dataciteMaxRelated)
        }
      }
      // swh: the soft/archival source must carry a SWHID when declared, and its tree is capped (counted)
      if (src === 'swh' || (r && (r.swhid !== undefined || r.tree !== undefined))) {
        if (c.swhRequireSwhid) {
          mark(keys, 'vmu.external.swh.requireSwhid')
          const swhid = r && (r.swhid || r.id)
          if (!(typeof swhid === 'string' && /^swh:1:/.test(swhid))) {
            throw deny('VMU_EXTERNAL_RECEIPT_INCOMPLETE', 'vmu.external.swh.requireSwhid=true: a SWH record must carry a `swh:1:` identifier', 'the payload had no SWHID; refusing instead of inventing an archival identity', { id: item.id }, keys)
          }
        }
        if (c.swhMaxTreeEntries > 0 && Array.isArray(r && r.tree) && r.tree.length > c.swhMaxTreeEntries) {
          mark(keys, 'vmu.external.swh.maxTreeEntries')
          capDropped.tree += r.tree.length - c.swhMaxTreeEntries
          item.tree = r.tree.slice(0, c.swhMaxTreeEntries)
        }
      }
      return item
    })
    const droppedCount = Math.max(0, list.length - items.length)
    const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
    let totalDropped = droppedCount
    let kept = items
    if (bytes > c.maxBytes) {
      mark(keys, 'vmu.external.maxBytes')
      const perItem = bytes / Math.max(1, items.length)
      // An item cannot be split: when even one item exceeds the cap, keeping it would silently break the
      // declared bound ⇒ keep ZERO and count them (the payload also reports bytes vs maxBytes).
      const keep = Math.max(0, Math.floor(c.maxBytes / perItem))
      totalDropped += items.length - keep
      kept = items.slice(0, keep)
    }
    if (totalDropped > 0) { dropped += totalDropped; log('external: normalize dropped ' + totalDropped + ' item(s) (maxResults=' + c.maxResults + ', maxBytes=' + c.maxBytes + ')') }
    return { items: kept, total: list.length, dropped: totalDropped, policyApplied: c.maxResults, bytes, maxBytes: c.maxBytes, enforced: keys.slice(), enforcedScope: ENFORCED_SCOPE }
  }

  /** fetchMany(): merge several sources and SURFACE conflicts instead of silently picking one. */
  async function fetchMany({ refs = [], by = 'unknown' } = {}) {
    const c = cfg()
    const enforced = []
    const list = Array.isArray(refs) ? refs : []
    const results = []
    const conflicts = []
    const errors = []
    for (const ref of list) {
      try { results.push(await fetchOne({ ...ref, by, cacheDir: ref && ref.cacheDir !== undefined ? ref.cacheDir : null })) } catch (e) { errors.push({ ref, code: e && e.code, message: String((e && e.message) || e), enforced: Array.isArray(e && e.enforced) ? e.enforced.slice() : [] }) }
    }
    const byId = new Map()
    for (const r of results) for (const item of r.payload.items) {
      if (!item.id) continue
      const prev = byId.get(item.id)
      if (prev && JSON.stringify(prev.item) !== JSON.stringify(item)) {
        conflicts.push({ id: item.id, sources: [prev.source, item.source], fields: { title: [prev.item.title, item.title], year: [prev.item.year, item.year], url: [prev.item.url, item.url] } })
      } else if (!prev) byId.set(item.id, { item, source: item.source })
    }
    if (conflicts.length) {
      mark(enforced, 'vmu.external.mergePolicy')
      const policy = c.mergePolicy
      if (policy === 'refuse-on-conflict') {
        throw deny('VMU_EXTERNAL_CONFLICT', 'sources disagree on ' + conflicts.length + ' record(s): ' + conflicts.map((x) => x.id).join(', '), 'vmu.external.mergePolicy=refuse-on-conflict: resolve manually or switch to newest-wins/primary-wins', { conflicts }, enforced)
      }
      if (policy === 'newest-wins') {
        // pick the newest YEAR per conflicting id (still surfaced)
        for (const conf of conflicts) {
          const cands = results.flatMap((r) => r.payload.items.filter((i) => i.id === conf.id).map((i) => ({ item: i, source: i.source })))
          cands.sort((a, b) => (Number(b.item.year) || 0) - (Number(a.item.year) || 0))
          if (cands.length) byId.set(conf.id, cands[0])
        }
      }
      if (policy === 'primary-wins') {
        mark(enforced, 'vmu.external.primarySources')
        for (const conf of conflicts) {
          const cands = results.flatMap((r) => r.payload.items.filter((i) => i.id === conf.id).map((i) => ({ item: i, source: i.source })))
          const primary = cands.find((x) => c.primarySources.includes(String(x.source))) || cands[0]
          if (primary) byId.set(conf.id, primary)
        }
      }
    }
    // pubmed.preferAuthoritative: an authoritative duplicate outranks a non-authoritative one
    if (c.pubmedPreferAuthoritative) {
      mark(enforced, 'vmu.external.pubmed.preferAuthoritative')
      for (const [id, v] of byId) {
        if (v.item.raw && v.item.raw.authoritative === true) continue
        const better = results.flatMap((r) => r.payload.items.filter((i) => i.id === id && i.raw && i.raw.authoritative === true).map((i) => ({ item: i, source: i.source })))
        if (better.length) byId.set(id, better[0])
      }
    }
    return { ok: true, merged: [...byId.values()].map((v) => v.item), conflicts, errors, fetches, receipts: results.map((r) => r.receipt), enforced, enforcedScope: ENFORCED_SCOPE }
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
  /** The declared universe (read-only, from the generated registry — never guessed). */
  const declaredKeys = () => {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      if (!existsSync(p)) return { keys: [], count: 0, source: 'unavailable' }
      const text = readFileSync(p, 'utf8')
      const all = [...new Set([...text.matchAll(/key: "(vmu\.external\.[^"]+)"/g)].map((m) => m[1]))].sort()
      return { keys: all, count: all.length, source: 'settings/planned.js' }
    } catch (e) { return { keys: [], count: 0, source: 'error:' + String((e && e.message) || e) } }
  }
  const status = () => {
    const c = cfg()
    const declared = declaredKeys()
    const wired = WIRED_KEYS.slice()
    const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
    return {
      enabled: c.enabled, seam: typeof fetchFn === 'function' ? 'injected' : 'none', cacheSize: cache.size,
      receipts: receiptsLog.length, networkCalls: fetches, dropped,
      // task-145 self-report (read-only)
      evictions, receiptsSynthesised, capDropped: Object.assign({}, capDropped),
      wired, wiredCount: wired.length,
      plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
      declaredExternalKeys: declared.count,
      unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
      overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
      wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
      complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
      keys: keyValues(c),
      refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
      refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
      policy: c, pipeline: PIPELINE.slice(), stalePolicies: STALE_POLICIES.slice(),
      note: 'every key in `wired` changes an observable result; each receipt/refusal carries enforced[] = the keys consulted for that call (an empty array is legal, undefined is not)',
    }
  }

  return { apiVersion, fetchOne, fetchMany, normalize, cache: cacheView, receipts, status }
}
