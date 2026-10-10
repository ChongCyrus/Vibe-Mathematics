// tests/vmu-external.test.mjs — kernel/external.js (batch-3 slice 5, N11).
// Scenarios: no fetchFn ⇒ named refusal (nothing invented); cache hit ⇒ ZERO network calls; the three
// expiry strategies; conflicts surfaced (and refused under the default policy); receipt completeness;
// counted truncation; zero-mechanism (enabled=false); determinism with a fake seam + injected clock.
import { createExternal, fingerprintOf, STALE_POLICIES, PIPELINE } from '../vibe-math-vmu/kernel/external.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = async (fn) => { try { await fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, missing: e && e.missing, conflicts: e && e.conflicts } } }

let now = 1000
const paper = (id, title) => ({ id, title, authors: ['A'], year: 2024, url: 'https://example.org/' + id })
const mkSeam = (log) => async ({ source, ref }) => { log.push(source + ':' + (ref.id || 'q')); return { endpoint: source + '/api', results: [paper('doi:' + (ref.id || 'q'), 'T-' + source)] } }

// 1) no fetchFn ⇒ named refusal; nothing invented
{
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true } })
  const r = await rejects(() => e.fetchOne({ source: 'crossref', id: '10.1/x' }))
  ok(r.threw && r.code === 'VMU_EXTERNAL_UNAVAILABLE' && !!r.hint, 'no seam ⇒ named refusal + hint')
  ok(e.status().networkCalls === 0 && e.status().cacheSize === 0, 'no seam ⇒ no calls, no cache entries')
}

// 2) zero-mechanism: enabled defaults to false ⇒ fetch refuses, reads never crash
{
  const calls = []
  const e = createExternal({ clock: () => now, fetchFn: mkSeam(calls) })
  const r = await rejects(() => e.fetchOne({ source: 'crossref', id: 'x' }))
  ok(r.threw && r.code === 'VMU_EXTERNAL_DISABLED', 'disabled by default ⇒ VMU_EXTERNAL_DISABLED')
  ok(calls.length === 0, 'disabled ⇒ the seam is never called')
  ok(e.status().enabled === false && e.receipts().total === 0, 'status safe when disabled')
}

// 3) first fetch: complete receipt, then cache hit with ZERO network calls (offline first)
{
  const calls = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 5000 }, fetchFn: mkSeam(calls) })
  const r1 = await e.fetchOne({ source: 'crossref', id: '10.1/x', by: 'acad' })
  ok(r1.ok === true && r1.receipt.cached === false && r1.receipt.stale === false, 'first fetch is a live fetch')
  const need = ['at', 'by', 'source', 'endpoint', 'queryFingerprint', 'resultFingerprint', 'cached', 'stale', 'ttlMs', 'ageMs']
  ok(need.every((k) => r1.receipt[k] !== undefined && r1.receipt[k] !== null), 'receipt carries all ten fields')
  ok(r1.receipt.by === 'acad' && r1.receipt.at === 1000 && r1.receipt.ttlMs === 5000 && r1.receipt.ageMs === 0, 'receipt traces who/when/ttl/age')
  ok(calls.length === 1, 'exactly one network call so far')
  now = 3000
  const r2 = await e.fetchOne({ source: 'crossref', id: '10.1/x', by: 'acad' })
  ok(calls.length === 1, 'cache hit ⇒ ZERO additional network calls')
  ok(r2.receipt.cached === true && r2.receipt.stale === false && r2.receipt.ageMs === 2000, 'hit receipt is cached, not stale, age counted')
  now = 1000
}

// 4) expiry strategy: refresh (default) refetches
{
  const calls = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 100, 'vmu.external.stalePolicy': 'refresh' }, fetchFn: mkSeam(calls) })
  await e.fetchOne({ source: 'arxiv', id: '2401.1' })
  now = 5000
  const r = await e.fetchOne({ source: 'arxiv', id: '2401.1' })
  ok(calls.length === 2 && r.receipt.cached === false && r.receipt.stale === false, 'refresh: expired entry is refetched')
  now = 1000
}

// 5) expiry strategy: refuse ⇒ named stale refusal
{
  const calls = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 100, 'vmu.external.stalePolicy': 'refuse' }, fetchFn: mkSeam(calls) })
  await e.fetchOne({ source: 'arxiv', id: '2401.2' })
  now = 5000
  const r = await rejects(() => e.fetchOne({ source: 'arxiv', id: '2401.2' }))
  ok(r.threw && r.code === 'VMU_EXTERNAL_STALE', 'refuse: expired cache refuses by name')
  ok(calls.length === 1, 'refuse policy does not touch the network')
  now = 1000
}

// 6) expiry strategy: serve-stale-with-flag ⇒ flagged receipt + notice code, never silent
{
  const calls = []
  const events = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 100, 'vmu.external.stalePolicy': 'serve-stale-with-flag' }, fetchFn: mkSeam(calls), bus: { emit: (t) => events.push(t) } })
  await e.fetchOne({ source: 'pmid', id: '123' })
  now = 5000
  const r = await e.fetchOne({ source: 'pmid', id: '123' })
  ok(r.ok === true && r.receipt.stale === true && r.receipt.cached === true, 'serve-stale flags stale:true in the receipt')
  ok(r.staleNotice === 'VMU_EXTERNAL_STALE', 'serve-stale emits the notice code')
  ok(events.includes('external/stale-served'), 'serve-stale announces itself on the bus')
  ok(calls.length === 1, 'serve-stale does not refetch (offline-first)')
  ok(STALE_POLICIES.join('|') === 'refresh|serve-stale-with-flag|refuse', 'the three strategies are the declared set')
  now = 1000
}

// 7) multi-source conflict: surfaced, and refused under the default conflict policy
{
  const seam = async ({ source, ref }) => ({ endpoint: source + '/api', results: [Object.assign(paper('doi:shared', source === 'a' ? 'Title A' : 'Title B'), { year: source === 'a' ? 2020 : 2021 })] })
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: seam })
  const r = await rejects(() => e.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] }))
  ok(r.threw && r.code === 'VMU_EXTERNAL_CONFLICT', 'conflict refused by default (never silently picked)')
  ok(Array.isArray(r.conflicts) && r.conflicts.length === 1 && r.conflicts[0].id === 'doi:shared', 'conflicts[] names the record and the sources')
  ok(Array.isArray(r.conflicts[0].fields.title) && r.conflicts[0].fields.title.length === 2, 'conflict shows both field values')
  // newest-wins still surfaces the conflict
  const e2 = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.conflictPolicy': 'newest-wins' }, fetchFn: seam })
  const m = await e2.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] })
  ok(m.ok === true && m.conflicts.length === 1 && m.merged.length === 1, 'newest-wins merges but still reports the conflict')
}

// 8) normalize(): counted truncation (maxResults) and stable shape
{
  const many = { results: Array.from({ length: 10 }, (_, i) => paper('d' + i, 'T' + i)) }
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.maxResults': 3 } })
  const n = e.normalize(many)
  ok(n.items.length === 3 && n.total === 10 && n.dropped === 7, 'normalize reports dropped count')
  ok(e.status().dropped === 7, 'status reports the counted drop')
  ok(n.items[0].id === 'd0' && n.items[0].raw !== undefined, 'stable item shape (raw preserved)')
  const empty = e.normalize({})
  ok(empty.items.length === 0 && empty.total === 0, 'normalize tolerates an empty payload (no invention)')
}

// 9) receipt completeness is itself enforced (a broken seam is a named failure)
{
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: async () => ({ results: [], endpoint: 'x' }) })
  const r = await e.fetchOne({ source: 's', id: '1' })
  ok(r.ok === true && r.receipt.endpoint === 'x', 'seam-provided endpoint is used in the receipt')
  const receipts = e.receipts({ limit: 1 })
  ok(receipts.items.length === 1 && receipts.total === 1 && receipts.omitted === 0, 'receipts() returns the append-only log')
}

// 10) receipts truncation + read-only surfaces + determinism
{
  const calls = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: mkSeam(calls), listCap: 2 })
  for (const id of ['1', '2', '3', '4']) await e.fetchOne({ source: 'crossref', id })
  const c = e.cache()
  ok(c.items.length === 2 && c.total === 4 && c.dropped === 2, 'cache() truncation is counted')
  const before = JSON.stringify({ s: e.status(), c: e.cache(), r: e.receipts() })
  e.status(); e.cache(); e.receipts()
  ok(JSON.stringify({ s: e.status(), c: e.cache(), r: e.receipts() }) === before, 'reads are side-effect free')
  ok(e.status().networkCalls === 4 && e.receipts({ limit: 3 }).items.length === 3, 'receipts limit works; call counter is exact')
  ok(PIPELINE.join('>') === 'resolve>fetch>normalize>merge>receipt', 'pipeline constant')
  ok(fingerprintOf({ a: 1 }) === fingerprintOf({ a: 1 }) && fingerprintOf({ a: 1 }) !== fingerprintOf({ a: 2 }), 'query/result fingerprints are deterministic')
}

// ═══════════ task-145: the 27 DECLARED vmu.external.* keys are actually READ ═══════════
import { WIRED_KEYS, MERGE_POLICIES } from '../vibe-math-vmu/kernel/external.js'
const A = async (fn) => { try { return { ok: true, value: await fn() } } catch (e) { return { ok: false, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, enforced: e && e.enforced } } }

// 11) enabled / endpoints / allowNetwork / offlineFirst
{
  now = 1000
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.endpoints': { crossref: 'https://api.crossref.org', arxiv: 'https://export.arxiv.org' } }, fetchFn: mkSeam([]) })
  const good = await e.fetchOne({ source: 'crossref', id: 'a' })
  ok(good.ok === true && good.enforced.includes('vmu.external.endpoints'), 'endpoints[+]: a declared source passes and the key is in enforced[]', JSON.stringify(good.enforced))
  const bad = await A(() => e.fetchOne({ source: 'pubmed', id: 'a' }))
  ok(bad.ok === false && bad.code === 'VMU_EXTERNAL_UNAVAILABLE' && /crossref/.test(String(bad.hint)),
    'endpoints[-]: an UNDECLARED source is refused by name listing the declared ones', bad.hint)
  ok(Array.isArray(bad.enforced) && bad.enforced.includes('vmu.external.endpoints'), 'endpoints[-]: the refusal carries enforced[] (array)')
  const off = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': false }, fetchFn: mkSeam([]) })
  const r1 = await A(() => off.fetchOne({ source: 'crossref', id: 'n1' }))
  ok(r1.ok === false && r1.code === 'VMU_NETWORK_DENIED' && r1.enforced.includes('vmu.external.allowNetwork'),
    'allowNetwork[-]: a cache miss refuses without egress when false', r1.executed || JSON.stringify(r1.enforced))
  const on = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': true }, fetchFn: mkSeam([]) })
  ok((await A(() => on.fetchOne({ source: 'crossref', id: 'n2' }))).ok === true, 'allowNetwork[+]: with true the fetch proceeds')
  const of = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.offlineFirst': true }, fetchFn: mkSeam([]) })
  const r2 = await A(() => of.fetchOne({ source: 'crossref', id: 'o1' }))
  ok(r2.ok === false && r2.enforced.includes('vmu.external.offlineFirst'), 'offlineFirst[-]: a cache miss is refused rather than fetched', JSON.stringify(r2.enforced))
  const of2 = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.offlineFirst': false }, fetchFn: mkSeam([]) })
  ok((await A(() => of2.fetchOne({ source: 'crossref', id: 'o2' }))).ok === true, 'offlineFirst[+]: with false a miss is fetched')
  const en = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: mkSeam([]) })
  ok((await en.fetchOne({ source: 'crossref', id: 'e1' })).receipt.enforced.includes('vmu.external.enabled'),
    'enabled[+]: every live receipt carries enforced[] naming the consulted keys')
}

// 12) timeoutMs / ttlMs / stalePolicy
{
  now = 1000
  const slow = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.timeoutMs': 100 }, fetchFn: async () => { now += 500; return { endpoint: 'x', results: [paper('d1', 'T')] } } })
  const r = await A(() => slow.fetchOne({ source: 'crossref', id: 't1' }))
  ok(r.ok === false && r.code === 'VMU_TIMEOUT' && /现值=500ms/.test(r.hint) && /上限=100ms/.test(r.hint),
    'timeoutMs[-]: exceeding the limit is a named refusal with 现值/上限', r.hint)
  ok(Array.isArray(r.enforced) && r.enforced.includes('vmu.external.timeoutMs'), 'timeoutMs[-]: the refusal carries the key')
  now = 1000
  const fast = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.timeoutMs': 5000 }, fetchFn: async () => { now += 10; return { endpoint: 'x', results: [paper('d2', 'T')] } } })
  const okFast = await A(() => fast.fetchOne({ source: 'crossref', id: 't2' }))
  ok(okFast.ok === true && okFast.value.receipt.enforced.includes('vmu.external.timeoutMs'), 'timeoutMs[+]: within the limit the fetch succeeds and the rail is listed')
  now = 1000
  const shortTtl = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 100 }, fetchFn: mkSeam([]) })
  await shortTtl.fetchOne({ source: 'crossref', id: 'k1' })
  now = 5000
  ok(shortTtl.cache().items[0].stale === true, 'ttlMs[+]: a 100ms ttl makes the entry stale after 4s')
  const longTtl = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 10_000_000 }, fetchFn: mkSeam([]) })
  await longTtl.fetchOne({ source: 'crossref', id: 'k2' })
  now = 5000
  ok(longTtl.cache().items[0].stale === false, 'ttlMs[-]: a long ttl keeps the entry fresh')
  now = 1000
}

// 13) maxCacheEntries / cacheDir
{
  now = 1000
  const capped = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.maxCacheEntries': 2 }, fetchFn: mkSeam([]) })
  for (const id of ['a', 'b', 'c']) await capped.fetchOne({ source: 'crossref', id })
  const st = capped.status()
  ok(st.cacheSize === 2 && st.evictions === 1, 'maxCacheEntries[+]: inserting past the cap EVICTS the oldest and counts it', JSON.stringify({ size: st.cacheSize, ev: st.evictions }))
  const roomy = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.maxCacheEntries': 10 }, fetchFn: mkSeam([]) })
  for (const id of ['a', 'b', 'c']) await roomy.fetchOne({ source: 'crossref', id })
  ok(roomy.status().evictions === 0 && roomy.status().cacheSize === 3, 'maxCacheEntries[-]: under the cap nothing is evicted')
  const dir = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.cacheDir': '/var/cache/vmu' }, fetchFn: mkSeam([]) })
  const dr = await dir.fetchOne({ source: 'crossref', id: 'd1' })
  ok(dr.receipt.cacheDir === '/var/cache/vmu', 'cacheDir[+]: the declared cache dir is echoed on the receipt')
  const drBad = await A(() => dir.fetchOne({ source: 'crossref', id: 'd2', cacheDir: '/tmp/elsewhere' }))
  ok(drBad.ok === false && drBad.enforced.includes('vmu.external.cacheDir'), 'cacheDir[-]: a different cache dir is refused (declared value wins)', JSON.stringify(drBad.enforced))
}

// 14) mergePolicy / primarySources / pubmed.preferAuthoritative
{
  now = 1000
  const seam = async ({ source, ref }) => ({ endpoint: source + '/api', results: [Object.assign(paper('doi:shared', source === 'a' ? 'Title A' : 'Title B'), { year: source === 'a' ? 2020 : 2021, source })] })
  const refuse = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'refuse-on-conflict' }, fetchFn: seam })
  const rr = await A(() => refuse.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] }))
  ok(rr.ok === false && rr.code === 'VMU_EXTERNAL_CONFLICT' && rr.enforced.includes('vmu.external.mergePolicy'), 'mergePolicy[-]: refuse-on-conflict refuses by name and lists the key', JSON.stringify(rr.enforced))
  const newest = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'newest-wins' }, fetchFn: seam })
  const nm = await newest.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] })
  ok(nm.merged.length === 1 && nm.merged[0].year === 2021 && nm.conflicts.length === 1, 'mergePolicy[+]: newest-wins picks the newest record and still surfaces the conflict')
  const prim = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'primary-wins', 'vmu.external.primarySources': ['a'] }, fetchFn: seam })
  const pm = await prim.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] })
  ok(pm.merged.length === 1 && pm.merged[0].year === 2020 && pm.enforced.includes('vmu.external.primarySources'),
    'primarySources[+]: primary-wins selects the declared primary source', JSON.stringify({ year: pm.merged[0].year, enforced: pm.enforced }))
  const primNone = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'primary-wins', 'vmu.external.primarySources': [] }, fetchFn: seam })
  const pn = await primNone.fetchMany({ refs: [{ source: 'a', id: 'shared' }, { source: 'b', id: 'shared' }] })
  ok(pn.merged[0].year === 2020, 'primarySources[-]: with no primary declared the first candidate wins (deterministic)')
  const authSeam = async ({ source }) => ({ endpoint: source, results: [Object.assign(paper('doi:p1', 'T-' + source), { source, authoritative: source === 'b' })] })
  const auth = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'newest-wins', 'vmu.external.pubmed.preferAuthoritative': true }, fetchFn: authSeam })
  const am = await auth.fetchMany({ refs: [{ source: 'a', id: 'p1' }, { source: 'b', id: 'p1' }] })
  ok(am.merged[0].source === 'b' && am.enforced.includes('vmu.external.pubmed.preferAuthoritative'),
    'pubmed.preferAuthoritative[+]: the authoritative duplicate outranks the first-seen one', JSON.stringify({ src: am.merged[0].source, enforced: am.enforced }))
  const authOff = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.mergePolicy': 'newest-wins' }, fetchFn: authSeam })
  ok((await authOff.fetchMany({ refs: [{ source: 'a', id: 'p1' }, { source: 'b', id: 'p1' }] })).merged[0].source === 'a',
    'pubmed.preferAuthoritative[-]: without the key the first-seen record stays')
}

// 15) requireReceipt / maxBytes
{
  now = 1000
  const strict = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.requireReceipt': true }, fetchFn: async () => ({ results: [paper('r1', 'T')] }) })
  const sr = await A(() => strict.fetchOne({ source: 'crossref', id: 'r1' }))
  ok(sr.ok === false && sr.code === 'VMU_EXTERNAL_RECEIPT_INCOMPLETE' && sr.enforced.includes('vmu.external.requireReceipt'),
    'requireReceipt[-]: a seam with no endpoint is refused while the key is true', JSON.stringify(sr.enforced))
  const lax = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.requireReceipt': false }, fetchFn: async () => ({ results: [paper('r2', 'T')] }) })
  const lr = await lax.fetchOne({ source: 'crossref', id: 'r2' })
  ok(lr.ok === true && lr.receipt.receiptSynthesised === true && lax.status().receiptsSynthesised === 1,
    'requireReceipt[+]: with false the endpoint is SYNTHESISED and counted (never silent)', JSON.stringify({ synth: lax.status().receiptsSynthesised }))
  const tiny = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.maxBytes': 40 }, fetchFn: mkSeam([]) })
  const tr = await tiny.fetchOne({ source: 'crossref', id: 'mb1' })
  ok(tr.payload.dropped >= 1 && tiny.status().dropped >= 1 && tr.enforced.includes('vmu.external.maxBytes'),
    'maxBytes[+]: truncation is COUNTED and the key is listed', JSON.stringify({ dropped: tr.payload.dropped }))
  const big = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.maxBytes': 1 << 20 }, fetchFn: mkSeam([]) })
  ok((await big.fetchOne({ source: 'crossref', id: 'mb2' })).payload.dropped === 0, 'maxBytes[-]: a large cap truncates nothing')
}

// 16) the six per-source key groups
{
  now = 1000
  // arxiv: preferVersioned + maxAbstractChars
  const ax = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.arxiv.preferVersioned': true, 'vmu.external.arxiv.maxAbstractChars': 5 }, fetchFn: async () => ({ endpoint: 'a', results: [{ arxiv: '2401.00001', title: 'T', abstract: 'abcdefghij' }] }) })
  const axr = await ax.fetchOne({ source: 'arxiv', id: '2401.00001' })
  ok(axr.payload.items[0].id === '2401.00001v1' && axr.payload.items[0].abstract === 'abcde' && axr.enforced.includes('vmu.external.arxiv.preferVersioned'),
    'arxiv.preferVersioned[+]: the id gains a version tag; maxAbstractChars truncates', JSON.stringify(axr.payload.items[0]))
  const axOff = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: async () => ({ endpoint: 'a', results: [{ arxiv: '2401.00001', title: 'T', abstract: 'abcdefghij' }] }) })
  const axo = await axOff.fetchOne({ source: 'arxiv', id: '2401.00001' })
  ok(axo.payload.items[0].id === '2401.00001' && axo.payload.items[0].abstract === undefined,
    'arxiv[−]: without the keys the id and abstract are untouched (no cap invented)')
  // crossref: includeRelations + mailto
  let seenIdentity = null
  const cr = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.crossref.includeRelations': true, 'vmu.external.crossref.mailto': 'acad@example.org' }, fetchFn: async (req) => { seenIdentity = req.identity; return { endpoint: 'c', results: [{ doi: '10.1/x', title: 'T', relations: [{ type: 'cites' }] }] } } })
  const crr = await cr.fetchOne({ source: 'crossref', id: '10.1/x' })
  ok(crr.payload.items[0].relations !== undefined && crr.enforced.includes('vmu.external.crossref.includeRelations'), 'crossref.includeRelations[+]: relations are carried and the key is listed')
  ok(seenIdentity && seenIdentity.mailto === 'acad@example.org' && crr.receipt.identity.mailto === 'acad@example.org',
    'crossref.mailto[+]: the declared contact address enters the request identity and is echoed on the receipt', JSON.stringify(crr.receipt.identity))
  const crOff = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: async () => ({ endpoint: 'c', results: [{ doi: '10.1/y', title: 'T', relations: [{ type: 'cites' }] }] }) })
  const cro = await crOff.fetchOne({ source: 'crossref', id: '10.1/y' })
  ok(cro.payload.items[0].relations === undefined && cro.receipt.identity.mailto === null,
    'crossref[-]: without the keys neither relations nor a mailto identity appear')
  // openalex: mailto + maxConcepts
  const oa = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.openalex.mailto': 'oa@example.org', 'vmu.external.openalex.maxConcepts': 2 }, fetchFn: async () => ({ endpoint: 'o', results: [{ id: 'W1', title: 'T', concepts: ['a', 'b', 'c', 'd'] }] }) })
  const oar = await oa.fetchOne({ source: 'openalex', id: 'W1' })
  ok(oar.payload.items[0].concepts.length === 2 && oar.receipt.identity.mailto === 'oa@example.org' && oar.status === undefined && oar.enforced.includes('vmu.external.openalex.maxConcepts'),
    'openalex.mailto/maxConcepts[+]: the cap truncates AND counts while the mailto identity is echoed', JSON.stringify({ c: oar.payload.items[0].concepts.length, mail: oar.receipt.identity.mailto }))
  ok(oa.status().capDropped.concepts === 2, 'openalex.maxConcepts[+]: the drop is counted in status().capDropped')
  // pubmed: maxMeshTerms
  const pm = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.pubmed.maxMeshTerms': 1 }, fetchFn: async () => ({ endpoint: 'p', results: [{ pmid: '1', title: 'T', meshTerms: ['x', 'y', 'z'] }] }) })
  const pmr = await pm.fetchOne({ source: 'pmid', id: '1' })
  ok(pmr.payload.items[0].meshTerms.length === 1 && pm.status().capDropped.meshTerms === 2, 'pubmed.maxMeshTerms[+]: the cap truncates and counts')
  // datacite: maxRelated + requireRights
  const dc = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.datacite.maxRelated': 1, 'vmu.external.datacite.requireRights': false }, fetchFn: async () => ({ endpoint: 'd', results: [{ doi: '10.2/x', title: 'T', relatedIdentifiers: ['r1', 'r2', 'r3'] }] }) })
  const dcr = await dc.fetchOne({ source: 'datacite', id: '10.2/x' })
  ok(dcr.payload.items[0].relatedIdentifiers.length === 1 && dc.status().capDropped.related === 2, 'datacite.maxRelated[+]: the cap truncates and counts')
  const dcReq = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.datacite.requireRights': true }, fetchFn: async () => ({ endpoint: 'd', results: [{ doi: '10.2/y', title: 'T' }] }) })
  const dcrBad = await A(() => dcReq.fetchOne({ source: 'datacite', id: '10.2/y' }))
  ok(dcrBad.ok === false && dcrBad.enforced.includes('vmu.external.datacite.requireRights'), 'datacite.requireRights[-]: a record without rights is refused (never invented)', JSON.stringify(dcrBad.enforced))
  const dcOk = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.datacite.requireRights': true }, fetchFn: async () => ({ endpoint: 'd', results: [{ doi: '10.2/z', title: 'T', rights: 'CC-BY-4.0' }] }) })
  ok((await A(() => dcOk.fetchOne({ source: 'datacite', id: '10.2/z' }))).ok === true, 'datacite.requireRights[+]: with rights declared the fetch passes')
  // patent: maxResults + requireQueryString
  const pt = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.patent.maxResults': 1 }, fetchFn: async () => ({ endpoint: 'pt', results: [paper('p1', 'T'), paper('p2', 'T')] }) })
  const ptr = await pt.fetchOne({ source: 'patent', id: 'p1' })
  ok(ptr.payload.items.length === 1 && ptr.enforced.includes('vmu.external.patent.maxResults'), 'patent.maxResults[+]: the per-source cap applies and is listed', JSON.stringify(ptr.enforced))
  const ptNo = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.patent.maxResults': 0 }, fetchFn: async () => ({ endpoint: 'pt', results: [paper('p1', 'T'), paper('p2', 'T')] }) })
  ok((await ptNo.fetchOne({ source: 'patent', id: 'p1' })).payload.items.length === 2, 'patent.maxResults[-]: with 0 the global cap governs (nothing dropped)')
  const ptQ = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.patent.requireQueryString': true }, fetchFn: mkSeam([]) })
  const ptQBad = await A(() => ptQ.fetchOne({ source: 'patent', query: { limit: 3 } }))
  ok(ptQBad.ok === false && ptQBad.enforced.includes('vmu.external.patent.requireQueryString'), 'patent.requireQueryString[-]: a patent query without a query string is refused')
  const ptQOk = await A(() => ptQ.fetchOne({ source: 'patent', query: { q: 'battery' } }))
  ok(ptQOk.ok === true, 'patent.requireQueryString[+]: with q the query passes')
  // swh: requireSwhid + maxTreeEntries
  const sw = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.swh.requireSwhid': true, 'vmu.external.swh.maxTreeEntries': 2 }, fetchFn: async () => ({ endpoint: 's', results: [{ swhid: 'swh:1:dir:' + 'a'.repeat(40), title: 'T', tree: ['1', '2', '3', '4'] }] }) })
  const swr = await sw.fetchOne({ source: 'swh', id: 'x' })
  ok(swr.payload.items[0].tree.length === 2 && sw.status().capDropped.tree === 2, 'swh.maxTreeEntries[+]: the tree is capped and the drops counted')
  const swBad = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.swh.requireSwhid': true }, fetchFn: async () => ({ endpoint: 's', results: [{ title: 'T' }] }) })
  ok((await A(() => swBad.fetchOne({ source: 'swh', id: 'y' }))).ok === false, 'swh.requireSwhid[-]: a record without a SWHID is refused')
}

// 17) enforced[] discipline (replicating the audit-enforced-consistency rules locally)
{
  now = 1000
  const rich = createExternal({ clock: () => now, settings: {
    'vmu.external.enabled': true, 'vmu.external.ttlMs': 1000, 'vmu.external.maxBytes': 1 << 20,
    'vmu.external.timeoutMs': 10_000, 'vmu.external.maxCacheEntries': 5, 'vmu.external.stalePolicy': 'refresh',
    'vmu.external.mergePolicy': 'newest-wins', 'vmu.external.requireReceipt': true, 'vmu.external.allowNetwork': true,
  }, fetchFn: mkSeam([]) })
  const r = await rich.fetchOne({ source: 'crossref', id: 'q1' })
  const list = r.receipt.enforced
  ok(Array.isArray(list) && list.length > 0, 'enforced[+]: a live receipt carries a non-empty enforced[]', JSON.stringify(list))
  ok(new Set(list).size === list.length, 'rule ① enforced[] has NO duplicate keys', JSON.stringify(list))
  ok(list.includes('vmu.external.enabled') && list.includes('vmu.external.allowNetwork'), 'rule ③ the keys that changed behaviour are LISTED')
  ok(!list.includes('vmu.external.primarySources') && !list.includes('vmu.external.patent.maxResults'),
    'rule ④ keys that were NOT consulted are ABSENT (nothing is claimed)', JSON.stringify(list))
  // rule ② must be judged on the SAME leaf path: a cache HIT legitimately consults different keys than a miss.
  const mkFresh = () => createExternal({ clock: () => 4242, settings: {
    'vmu.external.enabled': true, 'vmu.external.ttlMs': 1000, 'vmu.external.maxBytes': 1 << 20,
    'vmu.external.timeoutMs': 10_000, 'vmu.external.maxCacheEntries': 5, 'vmu.external.stalePolicy': 'refresh',
    'vmu.external.mergePolicy': 'newest-wins', 'vmu.external.requireReceipt': true, 'vmu.external.allowNetwork': true,
  }, fetchFn: mkSeam([]) })
  const f1 = await mkFresh().fetchOne({ source: 'crossref', id: 'q1' })
  const f2 = await mkFresh().fetchOne({ source: 'crossref', id: 'q1' })
  ok(JSON.stringify(f1.receipt.enforced) === JSON.stringify(f2.receipt.enforced), 'rule ② enforced[] is DETERMINISTIC for the same request on the same path')
  const hit = await rich.fetchOne({ source: 'crossref', id: 'q1' })
  ok(hit.receipt.cached === true && Array.isArray(hit.receipt.enforced), 'rule ② the cache-hit path carries its OWN (array) enforced[], i.e. paths are distinguishable')
  // refusal paths: every one carries an ARRAY
  const cases = [
    ['disabled', createExternal({ clock: () => now, fetchFn: mkSeam([]) }), { source: 'crossref', id: 'x' }],
    ['no seam', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true } }), { source: 'crossref', id: 'x' }],
    ['endpoints', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.endpoints': { crossref: 'x' } }, fetchFn: mkSeam([]) }), { source: 'zzz', id: 'x' }],
    ['allowNetwork', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': false }, fetchFn: mkSeam([]) }), { source: 'crossref', id: 'x' }],
    ['offlineFirst', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.offlineFirst': true }, fetchFn: mkSeam([]) }), { source: 'crossref', id: 'x' }],
    ['needs id or query', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true }, fetchFn: mkSeam([]) }), { source: 'crossref' }],
    ['cacheDir', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.cacheDir': '/a' }, fetchFn: mkSeam([]) }), { source: 'crossref', id: 'x', cacheDir: '/b' }],
    ['patent query', createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.patent.requireQueryString': true }, fetchFn: mkSeam([]) }), { source: 'patent', query: { limit: 1 } }],
  ]
  const bad = []
  for (const [label, inst, req] of cases) {
    const out = await A(() => inst.fetchOne(req))
    if (out.ok) { bad.push(label + ':NO-THROW'); continue }
    if (!Array.isArray(out.enforced)) bad.push(label + '=' + String(out.enforced))
  }
  ok(bad.length === 0, 'EVERY refusal path carries an ARRAY enforced[] (never undefined/null)', JSON.stringify(bad))
  // refusal counting by code
  const counted = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': false }, fetchFn: mkSeam([]) })
  await A(() => counted.fetchOne({ source: 'crossref', id: 'c1' }))
  await A(() => counted.fetchOne({ source: 'crossref', id: 'c2' }))
  ok(counted.status().refusals.VMU_NETWORK_DENIED === 2, 'refusals are COUNTED BY CODE', JSON.stringify(counted.status().refusals))
  // read-only purity
  const before = JSON.stringify({ s: rich.status(), c: rich.cache(), r: rich.receipts() })
  rich.status(); rich.cache(); rich.receipts()
  ok(JSON.stringify({ s: rich.status(), c: rich.cache(), r: rich.receipts() }) === before, 'read-only surfaces never mutate state')
  // determinism across instances
  const mkSame = () => createExternal({ clock: () => 4242, settings: { 'vmu.external.enabled': true, 'vmu.external.ttlMs': 700, 'vmu.external.maxCacheEntries': 3 }, fetchFn: mkSeam([]) })
  const d1 = mkSame(); const d2 = mkSame()
  await d1.fetchOne({ source: 'crossref', id: 'z' }); await d2.fetchOne({ source: 'crossref', id: 'z' })
  ok(JSON.stringify(d1.status()) === JSON.stringify(d2.status()), 'two instances with the same inputs produce identical status()')
}

// 18) the declared universe: WIRED ↔ plannedKeys are complementary (27 = 27 + 0)
{
  const e = createExternal({ clock: () => now })
  const st = e.status()
  ok(WIRED_KEYS.length === 27, 'the module wires all 27 declared vmu.external.* keys', String(WIRED_KEYS.length))
  ok(st.declaredExternalKeys === 27, 'the declared universe is read from settings/planned.js', String(st.declaredExternalKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredExternalKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 27 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredExternalKeys, overlap: st.overlapWithWired }))
  ok(st.wiredNotDeclared.length === 0, 'no wired key is missing from the declared registry', JSON.stringify(st.wiredNotDeclared))
  ok(Object.keys(st.keys).length === 27 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 27 wired keys (no silent nulls)')
  ok(MERGE_POLICIES.length === 3 && st.policy.mergePolicy === 'refuse-on-conflict', 'the merge policies are declared and the default is conservative')
  ok(Object.keys(e.status().unwiredReasons).length === 0, 'with nothing unwired the reason map is empty (mechanism retained for future keys)')
}

// D3: the evaluation scope rides with every receipt AND every refusal; no duplicates in a full scenario
{
  const calls = []
  const e = createExternal({ clock: () => now, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': true, 'vmu.external.sources': ['crossref'] }, fetchFn: mkSeam(calls) })
  const r1 = await e.fetchOne({ source: 'crossref', id: '10.1/x', by: 'm1' })
  ok(r1.ok === true && r1.enforcedScope === 'evaluated-so-far', 'D3: a fetchOne receipt states enforcedScope=evaluated-so-far')
  ok(r1.receipt && r1.receipt.enforcedScope === 'evaluated-so-far', 'D3: the nested receipt states it too')
  const cached = await e.fetchOne({ source: 'crossref', id: '10.1/x', by: 'm1' })
  ok(cached.enforcedScope === 'evaluated-so-far' && cached.receipt.cached === true, 'D3: a cache-hit receipt carries the scope as well')
  const many = await e.fetchMany({ refs: [{ source: 'crossref', id: '10.1/x' }], by: 'm1' })
  ok(many.enforcedScope === 'evaluated-so-far', 'D3: a merge receipt carries the scope')
  const bad = await rejects(() => e.fetchOne({ source: 'nope', id: 'x' }))
  ok(bad.threw && bad.code === 'VMU_EXTERNAL_UNAVAILABLE', 'D3: the refusal is still named')
  const receipts = [r1, cached, many]
  ok(receipts.every((x) => Array.isArray(x.enforced) && new Set(x.enforced).size === x.enforced.length), 'D3: no duplicate entries in any receipt of the scenario')
  ok(receipts.every((x) => x.enforced.every((k) => typeof k === 'string')), 'D3: every listed key is a string')
}

console.log('=== VMU EXTERNAL: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
