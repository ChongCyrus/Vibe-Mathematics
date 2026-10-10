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

console.log('=== VMU EXTERNAL: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
