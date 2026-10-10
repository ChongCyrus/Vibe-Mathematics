// Independent test for vmu kernel · idempotency (no dependency on kernel/index.js).
// Spec source: docs/07-durability-library.md §4.2 (identity computed once; stored fingerprints are read back)
// and 03-§8 (`VMU_IDEMPOTENCY_KEY_REUSED`). The K6 rule under test: a replayed/retried request must not take
// effect twice — and a pending key must never be reported as a success.
// Run: node tests/vmu-idempotency.test.mjs     Last line: === VMU IDEMPOTENCY: N passed, M failed ===
import { createIdempotency, canonicalize, refuse } from '../vibe-math-vmu/kernel/idempotency.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus({ throwOnEmit = false } = {}) {
  const rows = []; const topics = []
  return { rows, topics, declareTopic: (n) => { topics.push(n); return { ok: true, topic: n, existing: false } }, emit: (h, p) => { if (throwOnEmit) throw new Error('bus down'); rows.push({ hook: h, payload: p }) } }
}
const S = (extra = {}) => Object.assign({}, extra)

// ── 1. zero mechanism: an untouched ledger answers empty and never throws ─────────────────────────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock })
  ok(m.status().configured === false, 'zero-mechanism: status().configured=false')
  const l = m.lookup({ key: 'never-used' })
  ok(l.ok === true && l.found === false && l.state === 'absent' && l.settled === false, 'zero-mechanism: lookup() says absent (not a failure)')
  ok(m.list().count === 0 && m.list().configured === false, 'zero-mechanism: list() is empty')
  ok(m.history().count === 0, 'zero-mechanism: history() is empty')
  const r = m.reap()
  ok(r.ok === true && r.reapedCount === 0 && r.droppedCount === 0 && r.kept === 0, 'zero-mechanism: reap() is a harmless no-op')
  ok(m.status().counters.begun === 0, 'zero-mechanism: nothing was begun')
}

// ── 2. begin ⇒ pending (NOT a success) ⇒ commit ⇒ committed (the only settled state) ─────────────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  const b = m.begin({ key: 'task-create:t-3', payload: { title: 't-3', owner: 'alpha' } })
  ok(b.ok === true && b.state === 'pending' && b.settled === false && b.reused === false, 'begin: a fresh key is pending and NOT settled')
  const p = m.lookup({ key: 'task-create:t-3' })
  ok(p.found === true && p.state === 'pending' && p.settled === false && /NOT a success/.test(p.note), '③: lookup() reports pending and says it is not a success')
  ok(p.result === null && p.committedAt === null, '③: a pending key carries NO result')
  const cm = m.commit({ key: 'task-create:t-3', result: { id: 't-3' } })
  ok(cm.ok === true && cm.state === 'committed' && cm.settled === true && cm.result.id === 't-3', 'commit: the pending key becomes committed with its result')
  const after = m.lookup({ key: 'task-create:t-3' })
  ok(after.state === 'committed' && after.settled === true && after.result.id === 't-3' && /replayable/.test(after.note), 'commit: lookup() reports committed with the stored result')
  ok(m.status().entries.pending === 0 && m.status().entries.committed === 1, 'status: the entry moved from pending to committed')
}

// ── 3. INVARIANT ②: same key + same payload ⇒ the stored result, and NOTHING is executed again ───────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  let executions = 0
  const doWork = (payload) => { executions += 1; const b = m.begin({ key: 'k1', payload }); if (b.state === 'committed') return b.result; const r = { ranAt: c.now() }; m.commit({ key: 'k1', result: r }); return r }
  const first = doWork({ a: 1 })
  const second = doWork({ a: 1 })
  ok(executions === 2, '②: the caller ran its guard twice (as a retry would)')
  ok(second === first || JSON.stringify(second) === JSON.stringify(first), '②: the retry got the SAME result object back')
  ok(m.status().counters.deduplicated === 1, '②: the retry is counted as deduplicated')
  ok(m.status().counters.committed === 1, '②: only ONE commit happened (no second execution)')
  const replay = m.begin({ key: 'k1', payload: { a: 1 } })
  ok(replay.deduplicated === true && replay.settled === true && replay.result.ranAt === 0, '②: begin() on a settled key replays the result instead of executing')
  ok(m.status().counters.begun === 1, '②: the replayed begin did not create a new attempt')
  const orderInsensitive = m.begin({ key: 'k1', payload: { a: 1 } })
  ok(orderInsensitive.deduplicated === true, '②: key order in the payload does not matter (canonical JSON)')
  const m2 = createIdempotency({ clock: c.clock, settings: S() })
  m2.begin({ key: 'k2', payload: { a: 1, b: 2 } })
  m2.commit({ key: 'k2', result: 'ok' })
  ok(m2.begin({ key: 'k2', payload: { b: 2, a: 1 } }).deduplicated === true, '②: a differently ordered payload is the SAME request')
}

// ── 4. INVARIANT ①: same key + different payload ⇒ VMU_IDEMPOTENCY_KEY_REUSED with both fingerprints ─
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  const fp1 = m.begin({ key: 'k3', payload: { title: 'A', owner: 'alpha' } }).payloadFingerprint
  m.commit({ key: 'k3', result: { id: 'x' } })
  const e = throwsNamed(() => m.begin({ key: 'k3', payload: { title: 'B', owner: 'alpha' } }), 'VMU_IDEMPOTENCY_KEY_REUSED', '①: a reused key with a different payload is refused by name')
  ok(!!e && e.message.includes(fp1), '①: the refusal names the ORIGINAL fingerprint')
  const fp2 = m.fingerprintOf({ payload: { title: 'B', owner: 'alpha' } }).fingerprint
  ok(!!e && e.message.includes(fp2), '①: the refusal names the NEW fingerprint too')
  ok(!!e && /first difference at byte \d+/.test(String(e.hint)) && /lengths \d+\/\d+/.test(String(e.hint)), '①: the hint says WHERE the payloads diverge (byte + lengths)')
  ok(!!e && /changed keys: title/.test(String(e.hint)), '①: the hint lists the changed top-level keys')
  ok(m.status().refusals.VMU_IDEMPOTENCY_KEY_REUSED === 1, '①: the refusal is counted by code')
  ok(m.lookup({ key: 'k3' }).result.id === 'x', '①: the refused call did not disturb the committed entry')
  const nested = createIdempotency({ clock: c.clock, settings: S() })
  nested.begin({ key: 'n1', payload: { a: [1, 2] } })
  nested.commit({ key: 'n1', result: 1 })
  const e2 = throwsNamed(() => nested.begin({ key: 'n1', payload: { a: [1, 3] } }), 'VMU_IDEMPOTENCY_KEY_REUSED', '①: an array change is caught (byte diff still reported)')
  ok(!!e2 && /first difference at byte/.test(String(e2.hint)), '①: array payloads still get a byte-level diff')
  const fresh = createIdempotency({ clock: c.clock, settings: S() })
  ok(fresh.begin({ key: 'k4', payload: { a: 1 } }).ok === true, '①: a different KEY with the same payload is a different request (allowed)')
}

// ── 5. INVARIANT ③: a pending key is never a success, and a second begin does not start a rerun ──────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  const a = m.begin({ key: 'work', payload: { q: 1 } })
  ok(a.state === 'pending' && a.settled === false, '③: the first begin is pending')
  const b = m.begin({ key: 'work', payload: { q: 1 } })
  ok(b.state === 'pending' && b.reused === true && b.inFlight === true && b.settled === false, '③: a concurrent begin is told "still in flight"')
  ok(/IN FLIGHT/.test(b.note) && /not a success/.test(b.note), '③: the note says plainly that a pending key is not a success')
  ok(m.status().counters.begun === 1, '③: no second attempt was started')
  ok(m.lookup({ key: 'work' }).settled === false, '③: lookup() never reports a pending key as settled')
  throwsNamed(() => m.commit({ key: 'unknown', result: 1 }), 'VMU_NO_SUCH_OBJECT', 'commit: an unknown key is refused with a pointer to begin()')
  ok(m.commit({ key: 'work', result: 'done' }).settled === true, '③: committing the pending key settles it')
  ok(m.begin({ key: 'work', payload: { q: 1 } }).deduplicated === true, '③: after settling, the same payload deduplicates')
}

// ── 6. INVARIANT ④: abort needs a reason, is audited, and is the only way to un-settle ───────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createIdempotency({ clock: c.clock, log, settings: S() })
  m.begin({ key: 'a1', payload: 1 })
  throwsNamed(() => m.abort({ key: 'a1' }), 'VMU_REASON_REQUIRED', '④: aborting without a reason is refused')
  throwsNamed(() => m.abort({ key: 'a1', reason: '   ' }), 'VMU_REASON_REQUIRED', '④: a blank reason is refused too')
  throwsNamed(() => m.abort({ key: 'nope', reason: 'x' }), 'VMU_NO_SUCH_OBJECT', '④: an unknown key is refused with the known list')
  const r = m.abort({ key: 'a1', reason: 'engine refused the call', by: 'office' })
  ok(r.ok === true && r.state === 'aborted' && r.abortedAt === 0 && r.reason === 'engine refused the call', '④: the abort records why and when')
  ok(log.rows.some((x) => x.type === 'idempotency/aborted' && x.why === 'engine refused the call' && x.by === 'office'), '④: the abort is audited (who/why/when)')
  const l = m.lookup({ key: 'a1' })
  ok(l.state === 'aborted' && l.settled === false && /not a success either/.test(l.note), '④: lookup() reports aborted and says it is not a success')
  ok(m.abort({ key: 'a1', reason: 'again' }).already === true, '④: aborting twice is idempotent')
  throwsNamed(() => m.commit({ key: 'a1', result: 1 }), 'VMU_STATE', '④: an aborted key cannot be committed')
  const retry = m.begin({ key: 'a1', payload: 1 })
  ok(retry.state === 'pending' && retry.retried === true && retry.attempt === 2, '④: retryAfterAbort (default) allows a fresh attempt and counts it')
  const noRetry = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.retryAfterAbort': false }) })
  noRetry.begin({ key: 'b1', payload: 1 })
  noRetry.abort({ key: 'b1', reason: 'stop' })
  throwsNamed(() => noRetry.begin({ key: 'b1', payload: 1 }), 'VMU_STATE', '④: retryAfterAbort=false refuses the retry by name')
  ok(noRetry.status().retryAfterAbort === false, '④: status() declares the rule')
  const noReason = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.abortNeedsReason': false }) })
  noReason.begin({ key: 'c1', payload: 1 })
  ok(noReason.abort({ key: 'c1' }).ok === true, '④: abortNeedsReason=false allows a bare abort (disclosed in status)')
  const done = createIdempotency({ clock: c.clock, settings: S() })
  done.begin({ key: 'd1', payload: 1 })
  done.commit({ key: 'd1', result: 1 })
  throwsNamed(() => done.abort({ key: 'd1', reason: 'undo' }), 'VMU_STATE', '④: a committed key cannot be aborted (an abort cannot undo a result)')
}

// ── 7. INVARIANT ⑤: TTL reaping vs STALE-PENDING dropping, both counted ──────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createIdempotency({ clock: c.clock, log, settings: S({ 'vmu.idempotency.ttlMs': 100, 'vmu.idempotency.pendingTimeoutMs': 50 }) })
  m.begin({ key: 'settled', payload: 1 })
  m.commit({ key: 'settled', result: 'ok' })
  m.begin({ key: 'stuck', payload: 2 })
  ok(m.lookup({ key: 'settled' }).expiresAt === 100, '⑤: the TTL is anchored at the commit (injected clock)')
  c.advance(60)
  const early = m.reap()
  ok(early.reapedCount === 0 && early.droppedCount === 1 && early.dropped[0].why === 'stale-pending', '⑤: a stale PENDING attempt is dropped (and distinguished from a TTL reap)')
  ok(early.dropped[0].ageMs === 60 && early.dropped[0].attempts === 1, '⑤: the drop reports the age and the attempt count')
  ok(log.rows.some((x) => x.type === 'idempotency/dropped' && x.why === 'stale-pending'), '⑤: the drop is audited (never silent)')
  ok(m.lookup({ key: 'stuck' }).state === 'absent', '⑤: the dropped attempt is gone (it is NOT reported as success)')
  ok(m.status().counters.dropped === 1 && m.status().entries.stalePending === 0, '⑤: the drop is counted in status()')
  c.advance(50)
  const later = m.reap()
  ok(later.reapedCount === 1 && later.reaped[0].key === 'settled' && later.reaped[0].why === 'ttl', '⑤: an expired committed key is reaped with its reason')
  ok(later.droppedCount === 0 && later.kept === 0, '⑤: reap() separates reaped from dropped')
  ok(m.lookup({ key: 'settled' }).state === 'absent', '⑤: a reaped key is no longer replayable (and says absent, not success)')
  ok(m.status().counters.reaped === 1 && m.status().counters.dropped === 1, '⑤: both counters are kept apart')
  const noTtl = createIdempotency({ clock: c.clock, settings: S() })
  noTtl.begin({ key: 'forever', payload: 1 })
  noTtl.commit({ key: 'forever', result: 1 })
  c.advance(100000)
  ok(noTtl.reap().reapedCount === 0 && noTtl.lookup({ key: 'forever' }).state === 'committed', '⑤: ttlMs=0 means "never reaped" (and is reported in status)')
}

// ── 8. INVARIANT ⑥: the cap refuses by name with current/limit (and never evicts silently) ───────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.maxEntries': 2 }) })
  m.begin({ key: 'k1', payload: 1 })
  m.begin({ key: 'k2', payload: 2 })
  const e = throwsNamed(() => m.begin({ key: 'k3', payload: 3 }), 'VMU_RESOURCE_BUDGET', '⑥: exceeding the cap is refused by name')
  ok(!!e && /2\/2/.test(e.message), '⑥: the refusal states current/limit (2/2)')
  ok(m.list().count === 2, '⑥: nothing was evicted to make room')
  ok(m.status().counters.refusedAtCap === 1, '⑥: the cap refusal is counted')
  m.commit({ key: 'k1', result: 1 })
  const withTtl = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.maxEntries': 1, 'vmu.idempotency.ttlMs': 10 }) })
  withTtl.begin({ key: 'x', payload: 1 })
  withTtl.commit({ key: 'x', result: 1 })
  c.advance(20)
  withTtl.reap()
  ok(withTtl.begin({ key: 'y', payload: 2 }).ok === true, '⑥: after a reap there is room again')
  const big = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.maxPayloadBytes': 10 }) })
  const pe = throwsNamed(() => big.begin({ key: 'z', payload: { long: 'aaaaaaaaaaaaaaaaaaaaaaaa' } }), 'VMU_INVALID_ARGUMENT', '⑥: an over-large payload is refused by name')
  ok(!!pe && /maxPayloadBytes/.test(pe.message), '⑥: the payload refusal names the setting')
}

// ── 9. the canonical fingerprint helper (read-only) and payload edge cases ───────────────────────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  const a = m.fingerprintOf({ payload: { b: 2, a: 1 } })
  const b = m.fingerprintOf({ payload: { a: 1, b: 2 } })
  ok(a.fingerprint === b.fingerprint && a.canonical === '{"a":1,"b":2}', 'fingerprintOf: canonical JSON makes key order irrelevant')
  ok(m.fingerprintOf({ payload: null }).fingerprint.length === 64, 'fingerprintOf: sha256 over 64 hex chars')
  ok(m.fingerprintOf({ payload: [1, { z: 1, a: 2 }] }).canonical === '[1,{"a":2,"z":1}]', 'fingerprintOf: nested keys are sorted too')
  ok(canonicalize(undefined) === 'null' && canonicalize(NaN) === 'null', 'canonicalize: undefined/NaN normalise to null (deterministic)')
  ok(m.begin({ key: 'nullpayload', payload: null }).ok === true, 'begin: a null payload is a legitimate request')
  ok(m.begin({ key: 'nullpayload', payload: null }).deduplicated === false, 'begin: a second begin while pending is still in flight')
  throwsNamed(() => m.begin({ key: '' }), 'VMU_INVALID_ARGUMENT', 'begin: an empty key is refused')
  throwsNamed(() => m.begin({}), 'VMU_INVALID_ARGUMENT', 'begin: a missing key is refused')
  throwsNamed(() => m.lookup({}), 'VMU_INVALID_ARGUMENT', 'lookup: a missing key is refused (never a silent absent)')
  throwsNamed(() => m.lookup({ key: '  ' }), 'VMU_INVALID_ARGUMENT', 'lookup: a blank key is refused')
  ok(m.status().refusals.VMU_INVALID_ARGUMENT >= 3, 'refusals: every refusal is counted by code')
}

// ── 10. bus hooks + broken bus (counted, never silent) ────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const m = createIdempotency({ clock: c.clock, bus, settings: S() })
  m.begin({ key: 'h1', payload: 1 })
  m.commit({ key: 'h1', result: 1 })
  ok(bus.topics.includes('idempotency/committed') && bus.rows.some((x) => x.hook === 'idempotency/committed' && x.payload.key === 'h1'), 'bus: idempotency/committed is declared and emitted')
  const broken = createIdempotency({ clock: c.clock, bus: fakeBus({ throwOnEmit: true }), settings: S() })
  broken.begin({ key: 'h2', payload: 1 })
  broken.commit({ key: 'h2', result: 1 })
  ok(broken.status().unwired['bus:idempotency/committed'] === 1, 'bus: a broken bus is a COUNTED wiring gap')
}

// ── 11. truncation counting + read-only purity + determinism ──────────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.maxEntries': 0 }) })
  for (let i = 1; i <= 5; i++) { m.begin({ key: 'k' + i, payload: i }); m.commit({ key: 'k' + i, result: 'r' + i }) }
  const all = m.list()
  ok(all.count === 5 && all.available === 5 && all.dropped === 0 && all.truncated === false, 'list: five keys, no truncation')
  const capped = m.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 5 && capped.dropped === 3 && capped.truncated === true, 'list: a limit reports the DROPPED count (3)')
  ok(capped.entries[0].key === 'k1' && capped.entries[1].key === 'k2', 'list: deterministic insertion order')
  const h = m.history({ limit: 2 })
  ok(h.count === 2 && h.available >= 10 && h.dropped === h.available - 2, 'history: the ring reports drops')
  ok(m.list({ state: 'committed' }).count === 5 && m.list({ state: 'pending' }).count === 0, 'list: state filter works')
  const before = JSON.stringify(m.list()) + '|' + JSON.stringify(m.status()) + '|' + JSON.stringify(m.history()) + '|' + JSON.stringify(m.lookup({ key: 'k1' }))
  for (let i = 0; i < 3; i++) { m.list(); m.status(); m.history(); m.lookup({ key: 'k1' }); m.fingerprintOf({ payload: 1 }) }
  const after = JSON.stringify(m.list()) + '|' + JSON.stringify(m.status()) + '|' + JSON.stringify(m.history()) + '|' + JSON.stringify(m.lookup({ key: 'k1' }))
  ok(before === after, 'read-only: list/status/history/lookup/fingerprintOf never mutate the ledger')
  const build = () => { const cc = fakeClock(7); const x = createIdempotency({ clock: cc.clock, settings: S() }); x.begin({ key: 'd', payload: { a: 1 } }); x.commit({ key: 'd', result: 'r' }); return x }
  const a = build(); const b = build()
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two ledgers agree on list()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two ledgers agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two ledgers agree on history()')
  ok(a.fingerprintOf({ payload: { a: 1 } }).fingerprint === b.fingerprintOf({ payload: { a: 1 } }).fingerprint, 'determinism: fingerprints are stable across instances')
  ok(createIdempotency({ clock: fakeClock(3).clock, settings: S() }).begin({ key: 't', payload: 1 }).now === 3, 'injected clock: startedAt comes from clock() only')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

console.log('=== VMU IDEMPOTENCY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
