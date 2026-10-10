// Independent test for vmu kernel · idempotency (no dependency on kernel/index.js).
// Spec source: docs/07-durability-library.md §4.2 (identity computed once; stored fingerprints are read back)
// and 03-§8 (`VMU_IDEMPOTENCY_KEY_REUSED`). The K6 rule under test: a replayed/retried request must not take
// effect twice — and a pending key must never be reported as a success.
// Round 8 additions: B1 type-tagged canonicalisation, B2 scope-in-identity, B3 explicit abort→retry payload
// rule, N2 optional store-backed durability (a replay after a RESTART still deduplicates).
// Run: node tests/vmu-idempotency.test.mjs     Last line: === VMU IDEMPOTENCY: N passed, M failed ===
import { createIdempotency, canonicalize, refuse, CANONICAL_VERSION, LEDGER_KEY, checksumOf } from '../vibe-math-vmu/kernel/idempotency.js'

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
/** A minimal store seam in the shape of kernel/store.js: read + patch, and a RESTART means a new ledger over it. */
function fakeStore(opts = {}) {
  const disk = {}
  const o = Object.assign({ failRead: false, failWrite: false, corrupt: false }, opts)
  return {
    disk, opts: o,
    read(key) { if (o.failRead) throw new Error('store not open'); return Object.prototype.hasOwnProperty.call(disk, key) ? JSON.parse(JSON.stringify(disk[key])) : null },
    patch(key, fn) { if (o.failWrite) throw new Error('store write refused'); if (o.corrupt) disk[key] = { junk: true }; else disk[key] = fn(Object.prototype.hasOwnProperty.call(disk, key) ? disk[key] : null); return disk[key] },
  }
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
  ok(m.status().canonicalVersion === CANONICAL_VERSION && m.status().identity === 'len(scope):scope len(key):key', 'zero-mechanism: status() declares the encoding version and the identity rule')
}

// ── 2. begin ⇒ pending (NOT a success) ⇒ commit ⇒ committed (the only settled state) ─────────────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  const b = m.begin({ key: 'task-create:t-3', payload: { title: 't-3', owner: 'alpha' } })
  ok(b.ok === true && b.state === 'pending' && b.settled === false && b.reused === false, 'begin: a fresh key is pending and NOT settled')
  ok(b.ref === 'session/task-create:t-3' && b.scope === 'session', 'begin: the entry is addressed by scope/key (the default scope comes from settings)')
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
  ok(Object.keys(first).length > 0 && Object.keys(second).length > 0, '② 前置: the retry结果对象都非空 (否则两个空对象会"相等")')
  const sameRetry = second === first || JSON.stringify(second) === JSON.stringify(first)
  ok(sameRetry, '②: the retry got the SAME result object back')
  ok(m.status().counters.deduplicated === 1, '②: the retry is counted as deduplicated')
  ok(m.status().counters.committed === 1, '②: only ONE commit happened (no second execution)')
  const replay = m.begin({ key: 'k1', payload: { a: 1 } })
  ok(replay.deduplicated === true && replay.settled === true && replay.result.ranAt === 0, '②: begin() on a settled key replays the result instead of executing')
  ok(m.status().counters.begun === 1, '②: the replayed begin did not create a new attempt')
  const orderInsensitive = m.begin({ key: 'k1', payload: { a: 1 } })
  ok(orderInsensitive.deduplicated === true, '②: key order in the payload does not matter (canonical encoding)')
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
  ok(retry.payloadChanged === false && retry.retryIsNewAttempt === false, '④: a same-payload retry is NOT flagged as a new attempt')
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

// ── 6b. B3: the abort→retry PAYLOAD rule is explicit (same payload by default) ────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const strict = createIdempotency({ clock: c.clock, log, settings: S() })
  ok(strict.status().retrySamePayloadOnly === true && strict.status().retryIsNewAttempt === false, 'B3: the default demands the SAME payload on a retry (and status() says so)')
  strict.begin({ key: 'k2', payload: { p: 1 } })
  strict.abort({ key: 'k2', reason: 'engine gave up' })
  const e = throwsNamed(() => strict.begin({ key: 'k2', payload: { p: 999 } }), 'VMU_IDEMPOTENCY_KEY_REUSED', 'B3: an aborted key retried with a DIFFERENT payload is refused by name')
  ok(!!e && /aborted/.test(e.message) && /DIFFERENT payload/.test(e.message), 'B3: the refusal says the key was aborted with another payload')
  ok(!!e && /first difference at byte/.test(String(e.hint)), 'B3: the refusal still carries the payload diff')
  const same = strict.begin({ key: 'k2', payload: { p: 1 } })
  ok(same.ok === true && same.retried === true && same.attempt === 2 && same.payloadChanged === false, 'B3: the SAME payload may be retried (that is the intended retry)')

  const loose = createIdempotency({ clock: c.clock, log, settings: S({ 'vmu.idempotency.retrySamePayloadOnly': false }) })
  ok(loose.status().retryIsNewAttempt === true, 'B3: relaxing the rule is DISCLOSED as retryIsNewAttempt:true')
  loose.begin({ key: 'k3', payload: { p: 1 } })
  loose.abort({ key: 'k3', reason: 'engine gave up' })
  const r = loose.begin({ key: 'k3', payload: { p: 999 } })
  ok(r.ok === true && r.retried === true && r.payloadChanged === true && r.retryIsNewAttempt === true, 'B3: with the rule relaxed the changed payload is allowed AND labelled a new attempt')
  ok(/THE PAYLOAD CHANGED/.test(r.note), 'B3: the receipt says in words that this is a new attempt, not a replay')
  ok(log.rows.some((x) => x.type === 'idempotency/retried' && x.payloadChanged === true), 'B3: the payload change is AUDITED')
  ok(loose.status().counters.retriedWithNewPayload === 1, 'B3: the changed-payload retry is counted separately')
}

// ── 6c. B1: the canonical encoding is TYPE-TAGGED (five collision classes are gone) ──────────────────
{
  const pairs = [
    [{ x: NaN }, { x: null }, 'NaN vs null'],
    [{ x: Infinity }, { x: null }, 'Infinity vs null'],
    [{ x: undefined }, { x: 'undefined' }, 'undefined vs the string "undefined"'],
    [{ x: -0 }, { x: 0 }, '-0 vs 0'],
    [{ x: 10n }, { x: 10 }, 'bigint vs number'],
    [{ x: -Infinity }, { x: Infinity }, '-Infinity vs Infinity'],
  ]
  for (const [a, b, label] of pairs) {
    ok(canonicalize(a) !== canonicalize(b), 'B1: ' + label + ' no longer collide')
  }
  ok(canonicalize(undefined) !== canonicalize(null), 'B1: a missing payload differs from an explicit null')
  ok(canonicalize({ x: undefined }) !== canonicalize({}), 'B1: an undefined-valued key differs from an absent key')
  ok(canonicalize(-0) === 'v' + CANONICAL_VERSION + '|n:-0' && canonicalize(0) === 'v' + CANONICAL_VERSION + '|n:0', 'B1: -0 and 0 carry distinct reprs')
  ok(canonicalize(NaN) === 'v' + CANONICAL_VERSION + '|n:nan' && canonicalize(null) === 'v' + CANONICAL_VERSION + '|z', 'B1: NaN and null carry distinct tags')
  ok(canonicalize(10n) === 'v' + CANONICAL_VERSION + '|g:10', 'B1: bigint is tagged (g:)')
  ok(canonicalize('10') === 'v' + CANONICAL_VERSION + '|s:"10"', 'B1: strings are tagged (s:)')
  ok(canonicalize({ a: 1, b: 2 }) === canonicalize({ b: 2, a: 1 }), 'B1: key order still does not matter')
  ok(canonicalize([1, { z: 1, a: 2 }]) === 'v' + CANONICAL_VERSION + '|a:[n:1,o:{s:"a":n:2,s:"z":n:1}]', 'B1: the tagged form is stable and readable')

  // The critic's exact reproduction: begin+commit with NaN, then retry with null ⇒ MUST be refused now.
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  m.begin({ key: 'nan', payload: { x: NaN } })
  m.commit({ key: 'nan', result: 'first' })
  const e = throwsNamed(() => m.begin({ key: 'nan', payload: { x: null } }), 'VMU_IDEMPOTENCY_KEY_REUSED', 'B1: {x:NaN} then {x:null} is REFUSED (the measured bypass is closed)')
  ok(!!e && /first difference at byte/.test(String(e.hint)), 'B1: the refusal explains where the two payloads differ')
  ok(m.status().canonicalVersion === CANONICAL_VERSION && m.fingerprintOf({ payload: 1 }).canonicalVersion === CANONICAL_VERSION, 'B1: the encoding version is exposed')

  // Non-JSON-safe payloads are refused by name instead of being flattened into a false "same request".
  const bad = [
    [{ fn: () => {} }, 'a function'],
    [{ s: Symbol('x') }, 'a symbol'],
    [new Date(0), 'a Date instance'],
    [new Map(), 'a Map instance'],
    [new (class Thing { constructor() { this.a = 1 } })(), 'a class instance'],
  ]
  for (const [payload, label] of bad) {
    const err = throwsNamed(() => m.begin({ key: 'unsafe', payload }), 'VMU_INVALID_ARGUMENT', 'B1: ' + label + ' in the payload is refused by name')
    ok(!!err && /not JSON-safe/.test(err.message), 'B1: the refusal says the payload is not JSON-safe (' + label + ')')
  }
  const cyclic = { a: 1 }; cyclic.self = cyclic
  ok(throwsNamed(() => canonicalize(cyclic), 'VMU_INVALID_ARGUMENT', 'B1: a cyclic payload is refused by name') !== null, 'B1: cycles are refused (never silently encoded)')
}

// ── 6d. B2: scope is PART OF the ledger identity ─────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createIdempotency({ clock: c.clock, log, settings: S() })
  const a = m.begin({ key: 'close', scope: 'meeting:A', payload: { agenda: 1 } })
  const b = m.begin({ key: 'close', scope: 'meeting:B', payload: { agenda: 1 } })
  ok(a.ok === true && b.ok === true && a.ref === 'meeting:A/close' && b.ref === 'meeting:B/close', 'B2: the same key in two scopes creates TWO independent entries (no false KEY_REUSED)')
  ok(m.status().entries.total === 2 && m.status().scopes.join(',') === 'meeting:A,meeting:B', 'B2: both scopes are counted and listed')
  m.commit({ key: 'close', scope: 'meeting:A', result: 'A closed' })
  const la = m.lookup({ key: 'close', scope: 'meeting:A' })
  const lb = m.lookup({ key: 'close', scope: 'meeting:B' })
  ok(la.state === 'committed' && la.result === 'A closed', 'B2: scope A settled independently')
  ok(lb.state === 'pending' && lb.settled === false, 'B2: scope B is untouched by scope A (the two meetings do not share a key slot)')
  const ambiguous = throwsNamed(() => m.lookup({ key: 'close' }), 'VMU_INVALID_ARGUMENT', 'B2: a bare key that matches several scopes is REFUSED (never guessed)')
  ok(!!ambiguous && /meeting:A, meeting:B/.test(ambiguous.message), 'B2: the refusal names the candidate scopes')
  ok(m.list({ scope: 'meeting:B' }).count === 1 && m.list({ scope: 'meeting:A' }).count === 1, 'B2: list() can filter by scope')
  ok(m.status().scopeIsPartOfIdentity === true && m.status().identity === 'len(scope):scope len(key):key', 'B2: status() declares that scope is part of the identity')
  m.commit({ key: 'close', scope: 'meeting:B', result: 'B closed' })
  ok(m.begin({ key: 'close', scope: 'meeting:A', payload: { agenda: 1 } }).deduplicated === true, 'B2: each scope deduplicates on its own payload')
  const scoped = m.begin({ key: 'fresh', scope: 'brand:new', payload: 1 })
  ok(scoped.ok === true && scoped.ref === 'brand:new/fresh', 'B2: a scope is a free-form label — a NEW scope registers normally (it is not an error)')
  const one = createIdempotency({ clock: c.clock, settings: S() })
  one.begin({ key: 'solo', scope: 'only', payload: 1 })
  ok(one.lookup({ key: 'solo' }).state === 'pending', 'B2: a bare key matching exactly ONE scope still resolves (no needless friction)')
  ok(one.list({ scope: 'only' }).count === 1 && one.history({ scope: 'only' }).available >= 1, 'B2: history() can filter by scope too')
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
  ok(a.fingerprint === b.fingerprint && a.canonical === 'v2|o:{s:"a":n:1,s:"b":n:2}', 'fingerprintOf: canonical encoding makes key order irrelevant')
  ok(m.fingerprintOf({ payload: null }).fingerprint.length === 64, 'fingerprintOf: sha256 over 64 hex chars')
  ok(m.fingerprintOf({ payload: [1, { z: 1, a: 2 }] }).canonical === 'v2|a:[n:1,o:{s:"a":n:2,s:"z":n:1}]', 'fingerprintOf: nested keys are sorted too')
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

// ── 11. N2: the durability projection through an OPTIONAL store seam ──────────────────────────────────
{
  const c = fakeClock(0)
  const memoryOnly = createIdempotency({ clock: c.clock, settings: S() })
  memoryOnly.begin({ key: 'm1', payload: 1 })
  const st0 = memoryOnly.status()
  ok(st0.durable === false && st0.durableBackend === null && /MEMORY ONLY/.test(st0.note), 'N2: without a seam status().durable=false says plainly it is memory-only')
  ok(/no store seam/.test(st0.durableReason), 'N2: the reason names the missing seam')
  ok(memoryOnly.durable().durable === false, 'N2: durable() agrees with status()')
  ok(memoryOnly.persist().durable === false && memoryOnly.persist().ok === true, 'N2: persist() without a seam is an honest no-op')

  const store = fakeStore()
  const a = createIdempotency({ clock: c.clock, settings: S(), store })
  a.begin({ key: 'job:42', payload: { op: 'close', at: 7 }, scope: 'meeting:A' })
  a.commit({ key: 'job:42', scope: 'meeting:A', result: { ok: true, closed: 42 } })
  const stA = a.status()
  ok(stA.durable === true && stA.durableBackend === 'store' && stA.durableLoaded === true, 'N2: with a seam status().durable=true and the backend is named')
  ok(stA.ledgerKey === LEDGER_KEY && store.disk[LEDGER_KEY] && store.disk[LEDGER_KEY].entries.length === 1, 'N2: the projection is written under the documented ledger key')
  ok(store.disk[LEDGER_KEY].entries[0].payloadFingerprint === a.lookup({ key: 'job:42', scope: 'meeting:A' }).payloadFingerprint, 'N2: the stored row carries the fingerprint (identity survives the restart)')
  ok(a.persist().ok === true && a.persist().rows === 1, 'N2: persist() reports what it wrote')

  // ── the RESTART: a brand-new ledger over the same store must still recognise the request ──
  const b = createIdempotency({ clock: c.clock, settings: S(), store })
  const lb = b.lookup({ key: 'job:42', scope: 'meeting:A' })
  ok(lb.found === true && lb.state === 'committed' && lb.result.closed === 42, 'N2: after a restart the committed entry is REPLAYED from the store')
  const replay = b.begin({ key: 'job:42', scope: 'meeting:A', payload: { op: 'close', at: 7 } })
  ok(replay.deduplicated === true && replay.settled === true && replay.result.closed === 42, 'N2: the same payload after a restart DEDUPLICATES (the whole point of N2)')
  ok(b.status().durableLoaded === true && /loaded 1 verified entries/.test(b.status().durableReason), 'N2: the load is reported in the status')
  const e = throwsNamed(() => b.begin({ key: 'job:42', scope: 'meeting:A', payload: { op: 'close', at: 8 } }), 'VMU_IDEMPOTENCY_KEY_REUSED', 'N2: a DIFFERENT payload after a restart is refused (cross-restart protection both ways)')
  ok(!!e && /first difference at byte/.test(String(e.hint)), 'N2: the cross-restart refusal still carries the diff')
  ok(b.status().counters.deduplicated === 1, 'N2: the cross-restart dedup is counted')

  // A broken write degrades to memory and is COUNTED — it never crashes and never claims durability.
  const badWrite = fakeStore({ failWrite: true })
  const degraded = createIdempotency({ clock: c.clock, settings: S(), store: badWrite })
  degraded.begin({ key: 'd1', payload: 1 })
  degraded.commit({ key: 'd1', result: 'ok' })
  ok(degraded.lookup({ key: 'd1' }).state === 'committed', 'N2: a failing store does NOT break the ledger')
  ok(degraded.status().durable === false && degraded.status().durableDegraded === true && degraded.status().unwired['store-seam'] >= 1, 'N2: the degraded durability is counted and status() reports durable:false')
  ok(/refused the projection/.test(degraded.status().durableReason), 'N2: the reason explains why durability is not real')
  ok(/MEMORY ONLY/.test(degraded.status().note), 'N2: the note never pretends the ledger is durable')

  const badRead = fakeStore({ failRead: true })
  const noLoad = createIdempotency({ clock: c.clock, settings: S(), store: badRead })
  ok(noLoad.lookup({ key: 'x' }).state === 'absent' && noLoad.status().unwired['store-seam'] >= 1, 'N2: an unreadable store is counted and the ledger still answers')

  const corrupt = fakeStore({ corrupt: true })
  const c1 = createIdempotency({ clock: c.clock, settings: S(), store: corrupt })
  c1.begin({ key: 'x1', payload: 1 })
  const c2 = createIdempotency({ clock: c.clock, settings: S(), store: corrupt })
  c2.begin({ key: 'y1', payload: 1 })
  ok(c2.status().unwired['store-corrupt-doc'] >= 1, 'N2: an unrecognised projection shape is counted, not swallowed')
  ok(c2.lookup({ key: 'y1' }).state === 'pending', 'N2: a corrupt document does not stop new work')
}

// ── 11b. M3: `durable` is never restored by a successful write alone (and projections are checksummed) ─
{
  const c = fakeClock(0)
  const store = fakeStore({ failRead: true })
  const deg = createIdempotency({ clock: c.clock, settings: S(), store })
  deg.begin({ key: 'm3', payload: 1 })
  deg.commit({ key: 'm3', result: 'ok' })
  const s1 = deg.status()
  ok(s1.durable === false && s1.loaded === false && s1.lastPatchOk === true, 'M3: a successful WRITE after a failed READ does not make the ledger durable (three facts are separate)')
  ok(s1.durableDegraded === true && s1.durableLoadError === 'store not open', 'M3: the degraded verdict is sticky and names the load error')
  ok(/never read back successfully/.test(s1.durableReason) && /NOT established/.test(s1.durableReason), 'M3: the reason says in words that durability is NOT established')
  ok(/MEMORY ONLY/.test(s1.note), 'M3: the note still reports a memory-only ledger')
  ok(deg.durable().durable === false && deg.durable().loaded === false && deg.durable().lastPatchOk === true, 'M3: durable() exposes loaded/lastPatchOk separately from the verdict')

  store.opts.failRead = false
  const r = deg.reload()
  ok(r.ok === true && r.loaded === true && r.durable === false, 'M3: a successful RE-READ alone still does not restore durability (a write must follow)')
  ok(deg.status().durableDegraded === true, 'M3: the verdict stays degraded until the write leg also succeeds')
  deg.persist()
  const s2 = deg.status()
  ok(s2.durable === true && s2.durableDegraded === false && s2.loaded === true && s2.lastPatchOk === true, 'M3: only a COMPLETE read+write cycle clears the degraded verdict')
  ok(/persisted and verified/.test(s2.durableReason), 'M3: the reason now says the projection was persisted AND verified')

  const st = fakeStore()
  const a = createIdempotency({ clock: c.clock, settings: S(), store: st })
  a.begin({ key: 'ck', payload: 1 })
  a.commit({ key: 'ck', result: 'r' })
  ok(st.disk[LEDGER_KEY].version === CANONICAL_VERSION && typeof st.disk[LEDGER_KEY].checksum === 'string', 'M3: the projection carries a VERSION and a CHECKSUM')
  ok(st.disk[LEDGER_KEY].checksum === checksumOf(st.disk[LEDGER_KEY].entries), 'M3: the checksum covers the entries')

  st.disk[LEDGER_KEY].entries[0].result = 'tampered'
  const b = createIdempotency({ clock: c.clock, settings: S(), store: st })
  ok(b.lookup({ key: 'ck' }).found === false, 'M3: a projection whose checksum does not match is NOT loaded')
  ok(b.status().unwired['store-checksum-mismatch'] === 1 && b.status().durableDegraded === true, 'M3: the checksum mismatch is counted and the ledger stays degraded')
  ok(/failed its checksum/.test(b.status().durableReason), 'M3: the reason names the checksum failure')

  const st2 = fakeStore()
  st2.disk[LEDGER_KEY] = { version: CANONICAL_VERSION - 1, savedAt: 0, checksum: checksumOf([]), entries: [] }
  const v = createIdempotency({ clock: c.clock, settings: S(), store: st2 })
  ok(v.lookup({ key: 'anything' }).state === 'absent' && v.status().unwired['store-version-mismatch'] === 1, 'M3: an older projection version is refused and counted (never silently interpreted)')
  ok(v.status().durable === false && v.status().durableDegraded === true, 'M3: a version mismatch keeps the ledger degraded')

  const st3 = fakeStore()
  st3.disk[LEDGER_KEY] = [{ scope: 'session', key: 'legacy', state: 'committed', payloadFingerprint: 'x', payloadCanon: 'v1|x', attempts: 1, startedAt: 0, result: 1 }]
  const legacy = createIdempotency({ clock: c.clock, settings: S(), store: st3 })
  ok(legacy.lookup({ key: 'legacy' }).found === false && legacy.status().unwired['store-no-checksum'] === 1, 'M3: an unversioned/unchecksummed projection is counted and NOT loaded (fail closed)')
}

// ── 11c. bare-crash hardening: throwing getters and Proxy traps become NAMED refusals (with the path) ─
{
  const boom = {}
  Object.defineProperty(boom, 'x', { enumerable: true, get() { throw new Error('boom') } })
  const e1 = throwsNamed(() => canonicalize(boom), 'VMU_INVALID_ARGUMENT', 'crash: a throwing getter is refused by name (no bare crash)')
  ok(!!e1 && /boom/.test(e1.message) && /\$\.x/.test(e1.message), 'crash: the refusal carries the underlying message AND the path ($.x)')
  ok(!!e1 && /could not be read/.test(e1.message), 'crash: the refusal explains that the payload could not be READ')

  const e2 = throwsNamed(() => canonicalize(new Proxy({}, { ownKeys() { throw new Error('trapped') } })), 'VMU_INVALID_ARGUMENT', 'crash: a Proxy whose ownKeys trap throws is refused by name')
  ok(!!e2 && /trapped/.test(e2.message) && /\$/.test(e2.message), 'crash: the Proxy refusal carries the trap message and a path')

  const e3 = throwsNamed(() => canonicalize(new Proxy({ a: { b: 1 } }, { get() { throw new Error('get-trap') } })), 'VMU_INVALID_ARGUMENT', 'crash: a Proxy whose get trap throws is refused by name')
  ok(!!e3 && /get-trap/.test(e3.message), 'crash: the get-trap refusal carries its message')

  const e4 = throwsNamed(() => canonicalize(new Proxy([1, 2], { get() { throw new Error('arr-trap') } })), 'VMU_INVALID_ARGUMENT', 'crash: a Proxy around an array is refused by name too')
  ok(!!e4 && /arr-trap/.test(e4.message), 'crash: the array trap refusal carries its message')

  const rev = Proxy.revocable({ a: 1 }, {})
  rev.revoke()
  ok(throwsNamed(() => canonicalize(rev.proxy), 'VMU_INVALID_ARGUMENT', 'crash: a revoked Proxy is refused by name') !== null, 'crash: revoked proxies are named refusals')
  ok(throwsNamed(() => canonicalize(new Proxy({}, { getPrototypeOf() { throw new Error('proto-trap') } })), 'VMU_INVALID_ARGUMENT', 'crash: a getPrototypeOf trap is refused by name') !== null, 'crash: prototype traps are named refusals')

  const deep = [{ ok: 1 }, { get bad() { throw new Error('deep-boom') } }]
  const e5 = throwsNamed(() => canonicalize(deep), 'VMU_INVALID_ARGUMENT', 'crash: a getter deep inside an array is refused by name')
  ok(!!e5 && /deep-boom/.test(e5.message) && /\$\[1\]\.bad/.test(e5.message), 'crash: the deep refusal reports the full path ($[1].bad)')

  const m = createIdempotency({ clock: fakeClock(0).clock, settings: S() })
  const e6 = throwsNamed(() => m.begin({ key: 'p1', payload: boom }), 'VMU_INVALID_ARGUMENT', 'crash: begin() with a throwing getter is refused by name')
  ok(!!e6 && m.status().entries.total === 0 && m.status().refusals.VMU_INVALID_ARGUMENT === 1, 'crash: the ledger is left untouched and the refusal is counted')
  ok(msgHasNoBareBoom(() => m.begin({ key: 'p2', payload: new Proxy({}, { ownKeys() { throw new Error('trapped') } }) })), 'crash: NO bare error escapes begin() either')
}
function msgHasNoBareBoom(fn) {
  try { fn(); return false } catch (e) { return !!e.code && e.code === 'VMU_INVALID_ARGUMENT' }
}

// ── 11d. M2: the composite identity is INJECTIVE (a delimiter cannot collapse two identities) ────────
{
  const c = fakeClock(0)
  const m = createIdempotency({ clock: c.clock, settings: S() })
  ok(m.status().identity === 'len(scope):scope len(key):key', 'M2: the identity rule is length-prefixed (and self-disclosed)')
  const first = m.begin({ scope: 'a', key: 'b\u0000c', payload: { v: 1 } })
  m.commit({ scope: 'a', key: 'b\u0000c', result: 'first' })
  const second = m.begin({ scope: 'a\u0000b', key: 'c', payload: { v: 1 } })
  ok(second.ok === true && second.deduplicated !== true && second.settled === false, 'M2: the critic\u2019s pair is now TWO identities (no false dedup)')
  ok(first.ref === 'a/b\u0000c' && second.ref === 'a\u0000b/c' && first.ref !== second.ref, 'M2: the two entries have distinct refs')
  ok(m.status().entries.total === 2, 'M2: both identities are in the ledger')
  ok(m.lookup({ scope: 'a', key: 'b\u0000c' }).result === 'first' && m.lookup({ scope: 'a\u0000b', key: 'c' }).state === 'pending', 'M2: each identity resolves on its own')
  const pairs = [
    ['', '1:a'], ['1', ':a'], ['a:', '1'], [':', 'a'],
    ['x\u0000', 'y'], ['x', '\u0000y'], ['1:2', '3'], ['1', '2:3'],
  ]
  const seen = new Set()
  for (const [scope, key] of pairs) {
    const r = m.begin({ scope, key, payload: { tag: scope + '|' + key } })
    seen.add(r.ref)
  }
  ok(seen.size === pairs.length, 'M2: eight adversarial (scope,key) pairs produce eight distinct identities')
  ok(m.status().entries.total === 2 + pairs.length, 'M2: every adversarial pair is a separate entry (no collapsing)')
  const collide = pairs.map(([scope, key]) => scope.length + ':' + scope + key.length + ':' + key)
  ok(new Set(collide).size === pairs.length, 'M2: the length-prefixed ident string itself has no collisions on the adversarial set')
  ok(collide[0] !== collide[1], 'M2: (\'\',\'1:a\') and (\'1\',\':a\') no longer share an ident')
}

// ── 11e. task-123: monotonic seq + writerId ⇒ a concurrent overwrite is DETECTED and disclosed ──────
// NOTE: every mutation (begin/commit/abort/retry/reap-with-changes) persists, so the seq advances once per
// mutation — the assertions below count the writes rather than assuming one write per operation.
{
  const c = fakeClock(0)
  const st = fakeStore()
  const a = createIdempotency({ clock: c.clock, settings: S(), store: st, writerId: 'A' })
  a.begin({ key: 'k', payload: 1 })       // write 1
  a.commit({ key: 'k', result: 'a1' })    // write 2
  ok(Number.isInteger(st.disk[LEDGER_KEY].seq) && st.disk[LEDGER_KEY].seq === 2 && st.disk[LEDGER_KEY].writerId === 'A', 'seq: the projection carries a monotonic seq and the writer id')
  a.begin({ key: 'k2', payload: 2 })      // write 3
  a.commit({ key: 'k2', result: 'a2' })   // write 4
  ok(st.disk[LEDGER_KEY].seq === 4 && a.status().seq === 4, 'seq: every write increments seq (one write per mutation)')
  ok(a.status().writerId === 'A' && a.status().lastWrite.seq === 4 && a.status().lastWrite.writerId === 'A', 'seq: status() exposes writerId/seq/lastWrite')
  ok(a.status().staleWrites === 0 && a.status().lastLoadStale === null, 'seq: a normal same-instance ledger never reports a stale write')
  const own = a.reload()
  ok(own.ok === true && own.stale !== true && a.status().staleWrites === 0, 'seq: re-reading OUR OWN latest projection is NOT reported as stale (no false positive)')
  ok(a.status().durable === true, 'seq: an own read+write cycle keeps the ledger durable')
  ok(/DETECT, do not lock/.test(a.status().concurrencyPolicy) && /no CAS/.test(a.status().concurrencyPolicy), 'seq: status() states plainly that this is detection, not mutual exclusion')

  // (2) an OLDER projection appears in the store (a stale writer overwrote newer data)
  const older = JSON.parse(JSON.stringify(st.disk[LEDGER_KEY]))
  older.seq = 3
  older.writerId = 'B'
  older.checksum = checksumOf(older.entries)   // the checksum is VALID: checksums cannot see an overwrite
  st.disk[LEDGER_KEY] = older
  const r = a.reload()
  ok(r.ok === false && r.stale === true && r.staleWrite.reason === 'older-seq', 'stale: an OLDER projection is disclosed, never silently accepted')
  ok(r.staleWrite.storeSeq === 3 && r.staleWrite.knownSeq === 4 && r.staleWrite.storeWriterId === 'B', 'stale: the disclosure names both seqs and the other writer')
  const s1 = a.status()
  ok(s1.staleWrites === 1 && s1.lastLoadStale.reason === 'older-seq' && s1.durableDegraded === true, 'stale: it is counted, kept in lastLoadStale, and durability is degraded')
  ok(/overwrote newer data/.test(s1.durableReason) && /USABLE/.test(s1.durableReason), 'stale: the reason says what happened AND that the ledger stays usable')
  ok(s1.unwired['store-stale-write'] === 1, 'stale: the stale read is counted as an unwired hazard')
  ok(a.lookup({ key: 'k2' }).state === 'committed' && a.status().entries.total === 2, 'stale: the ledger REMAINS USABLE and the newer in-memory state is NOT rolled back')
  ok(a.status().lastSeenInStore.seq === 3 && a.status().lastSeenInStore.writerId === 'B', 'stale: what the store showed is recorded too')
  a.persist()   // write 5
  ok(st.disk[LEDGER_KEY].seq === 5 && st.disk[LEDGER_KEY].writerId === 'A', 'stale: the next write repairs the store at seq 5 (monotonic, never backwards)')
  ok(a.status().durable === true && a.status().durableDegraded === false, 'stale: a complete read+write cycle restores durability')
  ok(a.status().staleWrites === 1, 'stale: the historical disclosure is retained (staleWrites keeps counting)')

  // (3a) two writers alternating: the stale writer overwrites a NEWER projection ⇒ detected as an OLDER write
  const st2 = fakeStore()
  const w1 = createIdempotency({ clock: c.clock, settings: S(), store: st2, writerId: 'W1' })
  w1.begin({ key: 'x', payload: 1 })      // 1
  w1.commit({ key: 'x', result: 'w1' })   // 2  ⇒ doc {seq 2, W1}
  const w2 = createIdempotency({ clock: c.clock, settings: S(), store: st2, writerId: 'W2' })
  w2.begin({ key: 'y', payload: 1 })      // adopts 2, write 3
  w2.commit({ key: 'y', result: 'w2' })   // write 4 ⇒ doc {seq 4, W2}
  ok(st2.disk[LEDGER_KEY].seq === 4 && st2.disk[LEDGER_KEY].writerId === 'W2', 'concurrency: the second writer continues the sequence from what the store holds')
  ok(w2.status().adoptedForeignWrites === 1 && w2.status().staleWrites === 0, 'concurrency: a NEWER foreign write is ADOPTED (that is not a stale read)')
  w1.persist()                            // W1 is stale (knows 2) ⇒ writes 3 ⇒ OVERWRITES W2's newer seq-4 doc
  ok(st2.disk[LEDGER_KEY].seq === 3 && st2.disk[LEDGER_KEY].writerId === 'W1', 'concurrency: the stale writer can still overwrite newer data (no CAS ⇒ the loss happens)')
  const r2 = w2.reload()
  ok(r2.ok === false && r2.stale === true && r2.staleWrite.reason === 'older-seq', 'concurrency: W2 DETECTS that a stale writer replaced its newer projection')
  ok(r2.staleWrite.storeWriterId === 'W1' && /written by "W1"/.test(r2.staleWrite.note), 'concurrency: the disclosure names the other writer')
  ok(/overwrote newer data/.test(w2.status().durableReason) && w2.status().staleWrites === 1, 'concurrency: the overwrite is disclosed with its reason and counted')
  ok(w2.status().entries.total === 2 && w2.status().seq === 4, 'concurrency: W2 keeps its own (newer) in-memory state and stays usable')
  ok(w2.lookup({ key: 'y' }).state === 'committed' && w2.lookup({ key: 'x' }).state === 'committed', 'concurrency: lookups still answer while the ledger is degraded')
  const again = w2.reload()
  ok(again.stale === true && w2.status().staleWrites === 2, 'concurrency: the same conflict is reported EVERY time it is seen (never swallowed after the first)')
  const fresh = createIdempotency({ clock: c.clock, settings: S(), store: st2, writerId: 'W3' })
  ok(fresh.status().staleWrites === 0 && fresh.lookup({ key: 'x' }).found === true, 'concurrency: a FRESH instance ADOPTS the projection without a false stale report')
  ok(fresh.lookup({ key: 'y' }).found === false, 'concurrency: the LOST write is really gone from the store — the detection is what makes it visible')
  ok(fresh.status().seq === 3 && fresh.status().adoptedForeignWrites === 1, 'concurrency: adopting a foreign projection continues its sequence')

  // (3b) the SAME seq written by two different writers (a real race): our own write was replaced
  const st3 = fakeStore()
  const p1 = createIdempotency({ clock: c.clock, settings: S(), store: st3, writerId: 'P' })
  p1.begin({ key: 'r', payload: 1 })      // 1
  p1.commit({ key: 'r', result: 'p1' })   // 2 ⇒ lastWrite {seq 2, P}
  const raced = JSON.parse(JSON.stringify(st3.disk[LEDGER_KEY]))
  raced.writerId = 'Q'                     // another writer computed the SAME next seq and won the write
  st3.disk[LEDGER_KEY] = raced
  const r3 = p1.reload()
  ok(r3.ok === false && r3.stale === true && r3.staleWrite.reason === 'same-seq-foreign-writer', 'race: the same seq written by another writer is DETECTED')
  ok(r3.staleWrite.storeSeq === 2 && r3.staleWrite.knownSeq === 2 && r3.staleWrite.storeWriterId === 'Q' && r3.staleWrite.writerId === 'P', 'race: the disclosure names the seq and BOTH writers')
  ok(/was LOST/.test(p1.status().durableReason) && /manual reconciliation/.test(p1.status().durableReason), 'race: the reason says a write was lost and points at manual reconciliation')
  ok(p1.status().staleWrites === 1 && p1.status().durableDegraded === true, 'race: it is counted and durability is degraded')
  ok(p1.lookup({ key: 'r' }).state === 'committed', 'race: the ledger is still USABLE (its in-memory state is kept)')

  const noSeam = createIdempotency({ clock: c.clock, settings: S(), writerId: 'N1' })
  ok(noSeam.status().writerId === 'N1' && noSeam.status().seq === 0 && noSeam.status().staleWrites === 0, 'seq: without a store the seq stays 0 and no stale report is invented')
  const bySetting = createIdempotency({ clock: c.clock, settings: S({ 'vmu.idempotency.writerId': 'from-settings' }) })
  ok(bySetting.status().writerId === 'from-settings', 'seq: the writer identity can come from the setting (no randomness involved)')
}

// ── 12. truncation counting + read-only purity + determinism ─────────────────────────────────────────
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
  for (let i = 0; i < 3; i++) { m.list(); m.status(); m.history(); m.lookup({ key: 'k1' }); m.fingerprintOf({ payload: 1 }); m.durable() }
  const after = JSON.stringify(m.list()) + '|' + JSON.stringify(m.status()) + '|' + JSON.stringify(m.history()) + '|' + JSON.stringify(m.lookup({ key: 'k1' }))
  ok(before === after, 'read-only: list/status/history/lookup/fingerprintOf/durable never mutate the ledger')
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
