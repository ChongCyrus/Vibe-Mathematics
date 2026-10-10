#!/usr/bin/env node
// vmu REPLAY — the guard for kernel/replay.js (K5: read-only reconstruction from the append-only audit).
//
// WHAT THIS PROVES
//   A. PURITY/DETERMINISM: the same plan applied twice (and two independent instances fed the same audit)
//      produce BYTE-IDENTICAL states (canonicalised), and `verify()` proves it;
//   B. GAPS ARE REPORTED: a `seq` hole, a missing antecedent and a truncated window each produce a specific
//      gap entry — and a plan with gaps is never called "complete";
//   C. UNKNOWN KINDS ARE COUNTED (never skipped silently): a custom `what` lands in `unknownKinds`, and with
//      `strict` the plan is REFUSED BY NAME instead;
//   D. ZERO SIDE EFFECTS: with a proxied fake service wired in, replay/plan/apply/verify/gaps/status call
//      NOTHING on it (the fake counts every property access and every call) — and no write method exists in
//      the module at all;
//   E. IDEMPOTENCE: replaying the same audit twice yields the same state, with or without the optional
//      `idempotency` seam injected;
//   F. TRUNCATION IS COUNTED: exceeding `vmu.replay.maxEvents` keeps a bounded window and reports the drops;
//   G. EMPTY AUDIT SAYS SO: `empty:true` / `reconstructed:false` and a `no-events` gap — "已重建" is never
//      claimed;
//   H. INJECTED CLOCK ONLY: with a frozen clock every `at` in every receipt equals that clock value;
//   I. READ PATHS DO NOT MUTATE: `status()`/`gaps()` before and after are byte-identical, and the plan object
//      is deeply frozen (applying it cannot change it).
import { readFileSync } from 'node:fs'
import { createReplay, emptyState, kindOf, canonicalize, fingerprintOf, AUDIT_PREFIXES } from '../vibe-math-vmu/kernel/replay.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const canon = (v) => canonicalize(v)

/** A row shaped exactly like a kernel/bus.js audit row. */
const row = (n, what, extra = {}) => Object.assign({ ts: 1000 + n, seq: n, what }, extra)
/** The sample audit: middleware lifecycle + a known-kind domain event + one MISSING seq (12). */
const audit = [
  row(10, 'middleware/registered', { id: 'm-1', order: 100, failure: 'closed', keys: ['deny'] }),
  row(11, 'middleware/decision', { hook: 'ballot/cast', id: 'm-1' }),
  row(13, 'middleware/failed', { id: 'm-1', code: 'VMU_MIDDLEWARE_FAILED', error: 'boom' }),
  row(14, 'control/paused', { reason: 'maintenance' }),
  row(15, 'middleware/breaker-tripped', { id: 'm-1', consecutive: 3 }),
  row(16, 'bidding/posted', { post: 'p1', taskId: 't-1', objectId: 'p1' }),
  row(17, 'bidding/bid', { post: 'p1', by: 'r-1', price: 10 }),
  row(18, 'control/resumed', { reason: null }),
  row(19, 'custom/unsupported-thing', { id: 'x' }),
]

// ---- A. purity & determinism ----------------------------------------------------------------------
{
  const r = createReplay({ clock: () => 777, audit })
  const p = r.plan()
  const s1 = r.apply({ plan: p.plan })
  const s2 = r.apply({ plan: p.plan })
  ok(canon(s1.state) === canon(s2.state) && s1.fingerprint === s2.fingerprint,
    'A1: applying the same plan twice yields a byte-identical state', s1.fingerprint.slice(0, 12) + ' vs ' + s2.fingerprint.slice(0, 12))
  const r2 = createReplay({ clock: () => 777, audit })
  const s3 = r2.apply({ plan: r2.plan().plan })
  ok(canon(s1.state) === canon(s3.state), 'A2: two independent instances fed the same audit agree byte-for-byte')
  const v = r.verify({ state: s1.state, plan: p.plan })
  ok(v.match === true && v.firstDiffAt === -1, 'A3: verify() proves a given state equals a fresh reconstruction', JSON.stringify(v).slice(0, 120))
  const tampered = JSON.parse(JSON.stringify(s1.state))
  tampered.events = 999
  const bad = r.verify({ state: tampered, plan: p.plan })
  ok(bad.match === false && bad.firstDiffAt >= 0, 'A4: a tampered state is reported as DIFFERENT (with the first diff byte)', JSON.stringify(bad).slice(0, 140))
  ok(Object.isFrozen(p.plan) && Object.isFrozen(p.plan.events) && Object.isFrozen(p.plan.events[0]),
    'A5: the plan (and its events) are deeply frozen — a reducer cannot rewrite history')
  ok(AUDIT_PREFIXES.includes('middleware') && kindOf(row(1, 'a/b')) === 'a/b' && fingerprintOf(emptyState()).length === 64,
    'A6: the exported vocabularies/helpers work')
}

// ---- B. gaps are reported -------------------------------------------------------------------------
{
  const r = createReplay({ clock: () => 0, audit })
  const p = r.plan()
  const kinds = p.gaps.map((g) => g.kind)
  ok(kinds.includes('seq-holes'), 'B1: a missing seq (12) is reported as a seq hole', JSON.stringify(kinds))
  const hole = p.gaps.find((g) => g.kind === 'seq-holes')
  ok(hole.holes[0].from === 12 && hole.holes[0].to === 12, 'B2: the hole names the EXACT missing range', JSON.stringify(hole.holes))
  ok(kinds.includes('missing-antecedent'), 'B3: an event referencing an object nobody created is a missing antecedent', JSON.stringify(p.gaps.find((g) => g.kind === 'missing-antecedent')))
  ok(kinds.includes('unknown-kinds'), 'B4: unknown kinds appear as a gap too')
  ok(!/complete within the window/.test(p.note), 'B5: a plan with gaps is NOT described as complete', p.note)
  const holeGap = p.gaps.find((g) => g.kind === 'seq-holes')
  const unknownGap = p.gaps.find((g) => g.kind === 'unknown-kinds')
  ok(holeGap.severity === 'blocking' && unknownGap.severity === 'warning',
    'B6: a seq hole is BLOCKING while an unknown kind is a WARNING (the two are not the same fault)',
    JSON.stringify({ hole: holeGap.severity, unknown: unknownGap.severity }))
  // a clean audit has no gaps
  const clean = createReplay({ clock: () => 0, audit: [row(1, 'control/paused'), row(2, 'control/resumed')] })
  const pc = clean.plan()
  ok(pc.gaps.filter((g) => g.severity === 'blocking').length === 0 && /complete within the window/.test(pc.note),
    'B7: a clean, contiguous audit reports no blocking gaps', JSON.stringify(pc.gaps))
  const g = r.gaps()
  ok(g.count === p.gaps.length && g.blocking === p.gaps.filter((x) => x.severity === 'blocking').length,
    'B8: gaps() agrees with the plan', JSON.stringify({ g: g.count, p: p.gaps.length }))
}

// ---- C. unknown kinds: counted, or refused in strict mode ------------------------------------------
{
  const r = createReplay({ clock: () => 0, audit })
  const p = r.plan()
  ok(p.unknownKinds['custom/unsupported-thing'] === 1, 'C1: an event with no explicit reducer is COUNTED in unknownKinds', JSON.stringify(p.unknownKinds))
  const s = r.apply({ plan: p.plan })
  ok(s.unknownKinds['custom/unsupported-thing'] === 1 && s.skipped >= 1,
    'C2: apply() counts the skipped event instead of dropping it silently', JSON.stringify({ u: s.unknownKinds, skipped: s.skipped }))
  ok(s.state.unknownKinds['custom/unsupported-thing'] === 1, 'C3: the state itself carries the unknown-kind count (self-reporting)')
  ok(/COUNTED but not reduced/.test(s.note), 'C4: the receipt says explicitly that some events were not reduced', s.note)
  const strict = createReplay({ clock: () => 0, audit, settings: { 'vmu.replay.strict': true } })
  ok(codeOf(() => strict.plan()) === 'VMU_INVALID_ARGUMENT', 'C5: strict mode REFUSES the plan by name instead of guessing')
  const strictOnce = createReplay({ clock: () => 0, audit })
  ok(codeOf(() => strictOnce.plan({ strict: true })) === 'VMU_INVALID_ARGUMENT', 'C6: strict can be requested per plan')
  const registered = createReplay({ clock: () => 0, audit })
  registered.register({ kind: 'custom/unsupported-thing', reduce: (s, e) => { s.objects['custom:' + e.id] = 1 } })
  const rp = registered.plan({ strict: true })
  ok(rp.unknownTotal === 0 && registered.apply({ plan: rp.plan }).applied >= 9,
    'C7: registering a PURE reducer for the kind removes it from unknownKinds', JSON.stringify(rp.unknownKinds))
  ok(codeOf(() => registered.register({ kind: 'x' })) === 'VMU_INVALID_ARGUMENT', 'C8: register without a reduce function is a named refusal')
}

// ---- D. zero side effects (proxied fake service) ---------------------------------------------------
{
  const calls = []
  const fake = new Proxy({}, {
    get(_t, prop) {
      calls.push(String(prop))
      return (...args) => { calls.push(String(prop) + '(' + args.length + ')'); return { ok: true } }
    },
  })
  const r = createReplay({ clock: () => 0, audit, bus: fake, idempotency: fake })
  const p = r.plan()
  r.apply({ plan: p.plan })
  r.verify({ state: emptyState(), plan: p.plan })
  r.gaps()
  r.status()
  const invoked = calls.filter((c) => c.includes('('))
  const writeReads = calls.filter((c) => /^(write|append|commit|set|delete|patch|mutate|store|emit|register)$/.test(c))
  ok(invoked.length === 0, 'D1: plan/apply/verify/gaps/status INVOKE nothing on the injected service', JSON.stringify(invoked.slice(0, 5)))
  ok(writeReads.length === 0, 'D2: no write-shaped member is even READ on the injected service', JSON.stringify(calls.slice(0, 8)))
  const source = readFileSync(new URL('../vibe-math-vmu/kernel/replay.js', import.meta.url), 'utf8')
  const forbidden = ['\\.write\\s*\\(', '\\.commit\\s*\\(', '\\.patch\\s*\\(', '\\.emit\\s*\\(', '\\.mutate\\s*\\('].filter((pat) => new RegExp(pat).test(source))
  ok(forbidden.length === 0, 'D3: the module never calls a write-shaped method (the only sink is the advisory `log.append`, wrapped in try/catch)', JSON.stringify(forbidden))
  // `set(`/`delete(` DO appear — every occurrence must be an in-memory Map/Set operation, never a collaborator
  const mapish = (source.match(/[A-Za-z_$][A-Za-z0-9_$]*\.(?:set|delete)\s*\(/g) || [])
  const notMap = mapish.filter((m) => !/^(reducers|seen|traces|series|disposers|sampler|refusals|silences|posts)\./.test(m))
  ok(notMap.length === 0, 'D4: every set(/delete( call is an in-memory collection operation, not a collaborator write', JSON.stringify(mapish.slice(0, 6)))
}

// ---- E. idempotence (with and without the seam) ----------------------------------------------------
{
  const noSeam = createReplay({ clock: () => 5, audit })
  const a1 = noSeam.apply({ plan: noSeam.plan().plan })
  const a2 = noSeam.apply({ plan: noSeam.plan().plan })
  ok(canon(a1.state) === canon(a2.state), 'E1: replaying twice without the idempotency seam is idempotent')
  const seam = { fingerprintOf: ({ payload }) => ({ ok: true, fingerprint: 'seam-' + canon(payload).length }) }
  const withSeam = createReplay({ clock: () => 5, audit, idempotency: seam })
  const b1 = withSeam.apply({ plan: withSeam.plan().plan })
  const b2 = withSeam.apply({ plan: withSeam.plan().plan })
  ok(canon(b1.state) === canon(b2.state) && canon(b1.state) === canon(a1.state),
    'E2: the optional idempotency seam does not change the reconstruction (it is advisory only)')
  ok(withSeam.status().idempotencySeam === true, 'E3: status() reports whether the seam is present')
}

// ---- F. truncation is counted ----------------------------------------------------------------------
{
  const r = createReplay({ clock: () => 0, audit, settings: { 'vmu.replay.maxEvents': 4 } })
  const p = r.plan()
  ok(p.truncated.kept === 4 && p.truncated.droppedEvents === 5 && Object.keys(p.truncated.byKind).length > 0,
    'F1: exceeding vmu.replay.maxEvents keeps a bounded window and counts the drops (by kind)', JSON.stringify(p.truncated))
  const s = r.apply({ plan: p.plan })
  ok(s.state.events === 4 && s.state.truncated.droppedEvents === 5, 'F2: the state records the truncation', JSON.stringify(s.state.truncated))
  const g = r.gaps()
  ok(g.gaps.some((x) => x.kind === 'window-truncated' && x.severity === 'blocking'),
    'F3: a truncated window is a BLOCKING gap (the reconstruction cannot be complete)', JSON.stringify(g.gaps.map((x) => x.kind)))
}

// ---- G. the empty audit is never called a reconstruction -------------------------------------------
{
  const r = createReplay({ clock: () => 0, audit: [] })
  const p = r.plan()
  ok(p.empty === true && p.plan.count === 0 && p.reconstructed === false, 'G1: an empty audit produces an empty plan', JSON.stringify({ empty: p.empty, n: p.plan.count }))
  ok(/NOT a reconstruction|nothing to replay/.test(p.note), 'G2: the note says there is nothing to replay', p.note)
  const s = r.apply({ plan: p.plan })
  ok(s.empty === true && s.reconstructed === false && /"已重建" would be a lie/.test(s.note),
    'G3: apply() refuses to call an empty reconstruction "已重建"', s.note)
  ok(s.state.events === 0 && canon(s.state) === canon(emptyState()), 'G4: the state is exactly the empty state')
  const g = r.gaps()
  ok(g.empty === true && g.gaps.some((x) => x.kind === 'no-events' && x.severity === 'blocking'),
    'G5: gaps() reports a blocking no-events gap', JSON.stringify(g.gaps))
  const none = createReplay({ clock: () => 0 })      // no audit source at all
  ok(none.plan().empty === true && none.status().source.kind === 'none', 'G6: a missing audit source is treated as empty (zero mechanism, no crash)')
}

// ---- H. injected clock only ------------------------------------------------------------------------
{
  let now = 4242
  const r = createReplay({ clock: () => now, audit })
  const p = r.plan()
  ok(p.plan.at === 4242, 'H1: the plan receipt uses the injected clock')
  now = 4343
  const s = r.apply({ plan: p.plan })
  ok(s.state.timeline.firstAt === 1010 && s.state.timeline.lastAt === 1019,
    'H2: event times come from the EVENTS, never from the clock', JSON.stringify(s.state.timeline))
  ok(r.status().at === 4343, 'H3: status() uses the injected clock')
  ok(r.plan().plan.at === 4343, 'H4: re-planning picks up the new clock value')
}

// ---- I. read paths do not mutate -------------------------------------------------------------------
{
  const r = createReplay({ clock: () => 0, audit })
  const auditBefore = canon(audit)
  const s1 = r.status()
  r.kinds()
  const s2 = r.status()
  ok(canon(s1) === canon(s2), 'I1: status() is idempotent on its own (no hidden mutation)')
  r.plan(); r.gaps(); r.plan({ kinds: ['control/paused'] })
  ok(canon(audit) === auditBefore, 'I1b: the audit SOURCE is byte-identical after plan/gaps/status (the input is never mutated)')
  const p1 = r.plan()
  const p2 = r.plan()
  ok(p1.plan.fingerprint === p2.plan.fingerprint && canon(p1.plan.events) === canon(p2.plan.events),
    'I1c: two plans over the same audit carry the same events and the same fingerprint (only the id differs)')
  const p = p1
  const planBefore = canon(p.plan)
  r.apply({ plan: p.plan })
  ok(canon(p.plan) === planBefore, 'I2: apply() does not mutate the plan it was given')
  ok(codeOf(() => r.apply({})) === 'VMU_INVALID_ARGUMENT', 'I3: apply without a plan is a named refusal')
  ok(codeOf(() => r.plan({ kinds: ['no/such-kind'] })) === 'VMU_NO_SUCH_OBJECT', 'I4: requesting a kind with no events is a named refusal')
  ok(codeOf(() => r.plan({ until: 'not-a-number' })) === 'VMU_INVALID_ARGUMENT', 'I5: a malformed `until` is a named refusal')
  const only = r.plan({ kinds: ['control/paused', 'control/resumed'] })
  ok(only.plan.count === 2 && Object.keys(only.unknownKinds).length === 0, 'I6: plan({kinds}) filters to the requested kinds', JSON.stringify({ n: only.plan.count }))
  const filtered = r.apply({ plan: only.plan })
  ok(filtered.state.control.paused === 1 && filtered.state.control.resumed === 1, 'I7: the filtered reconstruction reflects only those events')
}

// ---- L. the clone contract (round-8 fixes: no bare crash, no silent loss) --------------------------
{
  const r = createReplay({ clock: () => 0, audit })
  const p = r.plan()
  // L1/L2: an arbitrary `initial` shape is a NAMED refusal naming the offending key
  //        (was: bare TypeError "Cannot read properties of undefined (reading 'byKind')" @ replay.js:336)
  const e1 = (() => { try { r.apply({ plan: p.plan, initial: { a: 1 } }); return null } catch (e) { return e } })()
  ok(e1 && e1.code === 'VMU_INVALID_ARGUMENT' && /`events`/.test(String(e1.message)),
    'L1: apply({initial:{a:1}}) is a NAMED refusal naming the missing key (never a bare TypeError)', e1 && (e1.code + ': ' + String(e1.message).slice(0, 90)))
  ok(e1 && !/byKind/.test(String(e1.message)) && !/byKind/.test(String(e1.stack || '')),
    'L2: the old bare crash (reading \'byKind\') is gone from both message and stack')
  const e1b = (() => { try { r.apply({ plan: p.plan, initial: Object.assign(emptyState(), { events: 'x' }) }); return null } catch (e) { return e } })()
  ok(e1b && e1b.code === 'VMU_INVALID_ARGUMENT' && /`events`/.test(String(e1b.message)),
    'L3: a wrong TYPE is named too (events must be a finite number)', e1b && String(e1b.message).slice(0, 90))
  // L4/L5: a CYCLE is a NAMED refusal naming the path (was: bare "Converting circular structure to JSON")
  const cyc = Object.assign(emptyState(), { extra: {} }); cyc.extra.self = cyc.extra
  const e2 = (() => { try { r.apply({ plan: p.plan, initial: cyc }); return null } catch (e) { return e } })()
  ok(e2 && e2.code === 'VMU_INVALID_ARGUMENT' && /CYCLE/i.test(String(e2.message)) && /extra/.test(String(e2.message)),
    'L4: a circular initial is a NAMED refusal that names WHERE the cycle is', e2 && (e2.code + ': ' + String(e2.message).slice(0, 110)))
  ok(e2 && !/Converting circular/.test(String(e2.message)), 'L5: the old bare JSON cycle error is gone')
  ok(codeOf(() => r.verify({ state: { a: 1 }, plan: p.plan })) === 'VMU_INVALID_ARGUMENT',
    'L6: verify() applies the same shape contract (a malformed state is refused by name)')
  // L7–L12: NaN/Infinity/-0/Date/undefined survive the clone; two replays byte-identical AND faithful
  const initial = Object.assign(emptyState(), { extra: { nan: NaN, inf: Infinity, negZero: -0, when: new Date('2020-01-01T00:00:00.000Z'), u: undefined } })
  const initialBefore = canonicalize(initial.extra)
  const a1 = r.apply({ plan: p.plan, initial })
  const a2 = r.apply({ plan: p.plan, initial })
  ok(canon(a1.state) === canon(a2.state), 'L7: a state containing NaN/Date/undefined replays byte-identically twice')
  ok(Number.isNaN(a1.state.extra.nan) && a1.state.extra.inf === Infinity && Object.is(a1.state.extra.negZero, -0),
    'L8: the clone PRESERVES NaN/Infinity/-0 (the old JSON clone turned them into null)', JSON.stringify({ nan: String(a1.state.extra.nan), inf: a1.state.extra.inf, nz: Object.is(a1.state.extra.negZero, -0) }))
  ok(a1.state.extra.when instanceof Date && a1.state.extra.when.toISOString() === '2020-01-01T00:00:00.000Z',
    'L9: the clone preserves a Date as a Date (not a string, not {})')
  ok('u' in a1.state.extra && a1.state.extra.u === undefined, 'L10: an `undefined` property survives the clone (the old JSON clone dropped the key)')
  ok(canonicalize(initial.extra) === initialBefore, 'L11: the clone does not mutate the caller\'s initial value')
  ok(canonicalize({ n: NaN }).includes('$num') && canonicalize({ d: new Date(0) }).includes('$date'),
    'L12: the canonical form TAGS the values JSON cannot represent (so byte-equality is well defined)')
  // L13–L15: status() self-discloses the clone contract
  const st = r.status()
  ok(typeof st.cloneKind === 'string' && st.cloneKind.length > 0, 'L13: status().cloneKind exists (the premise of byte-equality is visible)', st.cloneKind)
  ok(Array.isArray(st.lossyTypes) && st.lossyTypes.some((x) => /Date/.test(x)) && st.clone.refuses.includes('cycle'),
    'L14: status() lists the tag encodings and the refused types', JSON.stringify({ lossy: st.lossyTypes.length, refuses: st.clone.refuses }))
  ok(/lossless-safe|json-tags-safe/.test(st.cloneKind) && st.clone.backend.length > 0,
    'L15: the clone kind and backend are both reported', st.cloneKind + '/' + st.clone.backend)
}

if (failed === 0) {
  console.log('=== VMU REPLAY: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU REPLAY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
