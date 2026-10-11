#!/usr/bin/env node
// vmu CAPACITY — the guard for kernel/capacity.js (the 12 declared `vmu.capacity.*` keys).
//
// WHAT THIS PROVES
//   · every wired key changes an observable result (positive + negative);
//   · every RECEIPT carries `enforced[]` + `fired[]` (fired ⊆ enforced, no duplicates) + `enforcedScope`;
//   · every REFUSAL (returned, not thrown) carries an ARRAY `enforced`, the same scope, and
//     `wouldEvaluate ⊇ enforced`;
//   · preemption NAMES its victims; a touched reserve is a CODE-NAMED warning (never silence);
//   · WIRED ↔ plannedKeys partition the 12 declared keys; refusals are counted per code; reads never mutate.
import { createCapacity, WIRED_KEYS, ENFORCED_SCOPE, GATE_SCENARIOS } from '../vibe-math-vmu/kernel/capacity.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const DAY = 86400000

let NOW = 1_000_000
const mk = (settings = {}) => createCapacity({ clock: () => NOW, settings })

// ── 1. seatsPerDomain ───────────────────────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.seatsPerDomain': 2 })
  NOW = 1_000_000
  ok(c.reserve({ domain: 'd', seats: 1 }).ok === true, 'seatsPerDomain[+]: a seat within the cap is granted')
  ok(c.reserve({ domain: 'd', seats: 1 }).ok === true, 'seatsPerDomain[+]: the pool fills up to the cap')
  const over = c.reserve({ domain: 'd', seats: 1 })
  ok(over.ok === false && over.code === 'VMU_CAPACITY_EXHAUSTED' && /现值=3/.test(over.hint) && /上限=2/.test(over.hint),
    'seatsPerDomain[-]: exceeding the domain cap is refused WITH 现值/上限', over.hint)
  const other = c.reserve({ domain: 'e', seats: 2 })
  ok(other.ok === true, 'seatsPerDomain[+] (scope): the cap is PER DOMAIN, another domain still fits')
}

// ── 2. machineHoursPool ─────────────────────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.machineHoursPool': 10 })
  NOW = 1_000_000
  ok(c.reserve({ domain: 'a', hours: 4 }).ok === true, 'machineHoursPool[+]: hours within the pool are granted')
  const over = c.reserve({ domain: 'b', hours: 9 })
  ok(over.ok === false && over.code === 'VMU_CAPACITY_EXHAUSTED' && /现值=13/.test(over.hint) && /上限=10/.test(over.hint),
    'machineHoursPool[-]: exceeding the pool is refused WITH 现值/上限', over.hint)
  ok(c.reserve({ domain: 'b', hours: 6 }).ok === true, 'machineHoursPool[+]: the remaining hours are still usable')
}

// ── 3. overcommitRatio (reserve warn + overcommit headroom) ─────────────────────────────────────────
{
  const reserved = mk({ 'vmu.capacity.machineHoursPool': 100, 'vmu.capacity.overcommitRatio': 0.5 })
  NOW = 1_000_000
  const r = reserved.reserve({ domain: 'a', hours: 80 })
  ok(r.ok === true && r.warnings.length === 1 && r.warnings[0].code === 'VMU_CAPACITY_POOL_LOW',
    'overcommitRatio[+]: eating the declared reserve SUCCEEDS but WARNS by name (self-disclosed, not silent)', JSON.stringify(r.warnings[0] && r.warnings[0].code))
  ok(reserved.status().counters.poolLowWarnings === 1, 'overcommitRatio[+]: the reserve warning is COUNTED')
  const strict = mk({ 'vmu.capacity.machineHoursPool': 100, 'vmu.capacity.overcommitRatio': 1 })
  const r2 = strict.reserve({ domain: 'a', hours: 80 })
  ok(r2.warnings.length === 0, 'overcommitRatio[-]: with ratio 1 there is no reserve to touch (no warning)')
  const over = mk({ 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.overcommitRatio': 2 })
  NOW = 1_000_000
  const r3 = over.reserve({ domain: 'a', hours: 15 })
  ok(r3.ok === true && r3.limits.poolCeiling === 20, 'overcommitRatio[+]: ratio > 1 enlarges the usable pool (15 of 20 fits)', JSON.stringify(r3.limits))
  const beyond = over.reserve({ domain: 'b', hours: 6 })
  ok(beyond.ok === false && beyond.code === 'VMU_CAPACITY_EXHAUSTED' && /上限=20/.test(beyond.hint),
    'overcommitRatio[-]: beyond the overcommitted ceiling it is refused WITH 上限', beyond.hint)
}

// ── 4. allocationPolicy ─────────────────────────────────────────────────────────────────────────────
{
  const strict = mk({ 'vmu.capacity.machineHoursPool': 1 })
  NOW = 1_000_000
  strict.reserve({ domain: 'a', hours: 1 })
  ok(strict.reserve({ domain: 'b', hours: 1 }).code === 'VMU_CAPACITY_EXHAUSTED', 'allocationPolicy[+]: "strict" refuses when full')
  const wl = mk({ 'vmu.capacity.machineHoursPool': 1, 'vmu.capacity.allocationPolicy': 'waitlist', 'vmu.capacity.waitlistMax': 3 })
  NOW = 1_000_000
  wl.reserve({ domain: 'a', hours: 1 })
  const queued = wl.reserve({ domain: 'b', hours: 1 })
  ok(queued.ok === true && queued.waitlisted === true && queued.waitlistPosition === 1,
    'allocationPolicy[+] / waitlistMax[+]: "waitlist" queues instead of refusing (position disclosed)', JSON.stringify({ pos: queued.waitlistPosition }))
  ok(wl.status().counters.waitlisted === 1, 'allocationPolicy[+]: the queueing is COUNTED')
}

// ── 5. waitlistMax (cap + FIFO admit) ───────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.machineHoursPool': 1, 'vmu.capacity.allocationPolicy': 'waitlist', 'vmu.capacity.waitlistMax': 2 })
  NOW = 1_000_000
  c.reserve({ domain: 'a', hours: 1 })
  ok(c.reserve({ domain: 'b', hours: 1 }).waitlisted === true, 'waitlistMax[+]: the first waiter fits')
  ok(c.reserve({ domain: 'c', hours: 1 }).waitlisted === true, 'waitlistMax[+]: the second waiter fits')
  const full = c.reserve({ domain: 'd', hours: 1 })
  ok(full.ok === false && full.code === 'VMU_QUOTA_EXCEEDED' && /现值=2/.test(full.hint) && /上限=2/.test(full.hint),
    'waitlistMax[-]: a full waitlist is refused WITH 现值/上限', full.hint)
  c.release({ reservation: 'r1' })
  const admitted = c.admit()
  ok(admitted.ok === true && admitted.domain === 'b', 'waitlistMax[+]: admit() pulls the OLDEST waiter (FIFO)', JSON.stringify(admitted.domain))
}

// ── 6. preemptPolicy (names the victims) ────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.allocationPolicy': 'preempt', 'vmu.capacity.preemptPolicy': 'lower-priority' })
  NOW = 1_000_000
  const low = c.reserve({ domain: 'low', hours: 8, priority: 1 })
  const high = c.reserve({ domain: 'high', hours: 9, priority: 9 })
  ok(high.ok === true && high.preempted.includes(low.reservation) && high.preemptedCode === 'VMU_CAPACITY_PREEMPTED',
    'preemptPolicy[+]: a high-priority reservation PREEMPTS and NAMES the victim', JSON.stringify(high.preempted))
  ok(c.status().counters.preempted === 1 && c.list().reservations.find((r) => r.id === low.reservation).active === false,
    'preemptPolicy[+]: the victim is deactivated and the preemption is counted')
  const never = mk({ 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.allocationPolicy': 'preempt', 'vmu.capacity.preemptPolicy': 'never' })
  NOW = 1_000_000
  never.reserve({ domain: 'low', hours: 8, priority: 1 })
  const refused = never.reserve({ domain: 'high', hours: 9, priority: 9 })
  ok(refused.ok === false && refused.code === 'VMU_CAPACITY_EXHAUSTED' && /preemptPolicy=never/.test(refused.message),
    'preemptPolicy[-]: with "never" the same request is refused instead', refused.code)
}

// ── 7. facilities (declared set + double booking) ───────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.facilities': ['lab-a', 'lab-b'] })
  NOW = 1_000_000
  ok(c.reserve({ domain: 'd', facility: 'lab-a', fromMs: 0, toMs: 100 }).ok === true, 'facilities[+]: a declared facility can be booked')
  const undeclared = c.reserve({ domain: 'd', facility: 'lab-z', fromMs: 0, toMs: 100 })
  ok(undeclared.ok === false && undeclared.code === 'VMU_CAPACITY_FACILITY_CONFLICT' && /not declared/.test(undeclared.message),
    'facilities[-]: an undeclared facility is refused', undeclared.code)
  const clash = c.reserve({ domain: 'e', facility: 'lab-a', fromMs: 50, toMs: 150 })
  ok(clash.ok === false && clash.code === 'VMU_CAPACITY_FACILITY_CONFLICT' && /conflicting reservation: r1/.test(clash.hint),
    'facilities[-]: an OVERLAPPING booking is refused and the conflicting reservation is NAMED', clash.hint)
  ok(c.reserve({ domain: 'e', facility: 'lab-a', fromMs: 100, toMs: 200 }).ok === true, 'facilities[+]: a non-overlapping booking passes')
}

// ── 8. safetyBriefingRequired ───────────────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.facilities': ['lab-a'], 'vmu.capacity.safetyBriefingRequired': true })
  NOW = 1_000_000
  const bad = c.reserve({ domain: 'd', facility: 'lab-a', fromMs: 0, toMs: 10 })
  ok(bad.ok === false && bad.code === 'VMU_NOT_PERMITTED' && /safety briefing/.test(bad.message),
    'safetyBriefingRequired[-]: a facility booking without the briefing is refused', bad.code)
  ok(c.reserve({ domain: 'd', facility: 'lab-a', fromMs: 0, toMs: 10, safetyBriefing: true }).ok === true,
    'safetyBriefingRequired[+]: with the briefing the booking passes')
  const none = mk({ 'vmu.capacity.facilities': ['lab-a'] })
  NOW = 1_000_000
  ok(none.reserve({ domain: 'd', facility: 'lab-a', fromMs: 0, toMs: 10 }).ok === true,
    'safetyBriefingRequired[+]: with the key off no briefing is demanded')
}

// ── 9. storageWarnRatio ─────────────────────────────────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.storageWarnRatio': 0.5 })
  NOW = 1_000_000
  const calm = c.storage({ usedBytes: 10, totalBytes: 100 })
  ok(calm.ok === true && calm.warnings.length === 0, 'storageWarnRatio[+]: below the threshold there is no warning')
  const warned = c.storage({ usedBytes: 80, totalBytes: 100 })
  ok(warned.ok === true && warned.warnings.length === 1 && warned.warnings[0].code === 'VMU_CAPACITY_STORAGE_WARN',
    'storageWarnRatio[-]: above the threshold the call SUCCEEDS but warns by name', JSON.stringify(warned.warnings))
  ok(c.status().counters.storageWarnings === 1, 'storageWarnRatio[-]: the warning is COUNTED')
  const full = c.storage({ usedBytes: 120, totalBytes: 100 })
  ok(full.ok === false && full.code === 'VMU_CAPACITY_STORAGE_WARN' && /现值=120/.test(full.hint) && /上限=100/.test(full.hint),
    'storageWarnRatio[-]: over capacity it is refused WITH 现值/上限', full.hint)
  // and the reservation rail can warn too (soft, self-disclosed)
  const r = c.reserve({ domain: 'd', storageRatio: 0.9 })
  ok(r.ok === true && r.warnings.some((w) => w.code === 'VMU_CAPACITY_STORAGE_WARN'),
    'storageWarnRatio[-]: a reservation that would exceed it carries the warning instead of failing')
}

// ── 10–11. forecastHorizonDays / forecastStaleDays ──────────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.forecastHorizonDays': 5, 'vmu.capacity.forecastStaleDays': 2 })
  NOW = 1_000_000
  const good = c.forecast({ days: 3, dataAgeDays: 1 })
  ok(good.ok === true && good.horizonDays === 5 && good.days === 3 && good.dataAgeDays === 1,
    'forecastHorizonDays[+]: a forecast inside the horizon passes', JSON.stringify({ h: good.horizonDays, d: good.days }))
  const far = c.forecast({ days: 9 })
  ok(far.ok === false && far.code === 'VMU_CAPACITY_FORECAST_STALE' && /现值=9 days/.test(far.hint) && /上限=5 days/.test(far.hint),
    'forecastHorizonDays[-]: a forecast beyond the horizon is refused WITH 现值/上限', far.hint)
  const stale = c.forecast({ days: 3, dataAgeDays: 6 })
  ok(stale.ok === false && stale.code === 'VMU_CAPACITY_FORECAST_STALE' && /stale/.test(stale.message) && /上限=2 days/.test(stale.hint),
    'forecastStaleDays[-]: a forecast from stale data is refused with the staleness bound', stale.hint)
  ok(c.status().counters.staleForecasts === 2, 'forecast rails: the stale forecasts are COUNTED')
  const fresh = c.forecast({ days: 3, dataAgeDays: 2 })
  ok(fresh.ok === true, 'forecastStaleDays[+]: data at the staleness bound is still usable')
}

// ── 12. cleanupCadenceDays (cooldown + remaining time) ──────────────────────────────────────────────
{
  const c = mk({ 'vmu.capacity.cleanupCadenceDays': 2 })
  NOW = 1_000_000
  const r = c.reserve({ domain: 'd' })
  c.release({ reservation: r.reservation })
  const blocked = c.reserve({ domain: 'd' })
  ok(blocked.ok === false && blocked.code === 'VMU_STATE' && /剩余=/.test(blocked.hint) && blocked.cooldownRemainingMs === 2 * DAY,
    'cleanupCadenceDays[-]: re-reserving inside the cooldown is refused WITH the remaining time', blocked.hint)
  NOW = 1_000_000 + 2 * DAY + 1
  ok(c.reserve({ domain: 'd' }).ok === true, 'cleanupCadenceDays[+]: after the cooldown the domain may reserve again')
  const noCadence = mk({ 'vmu.capacity.cleanupCadenceDays': 0 })
  NOW = 1_000_000
  const r2 = noCadence.reserve({ domain: 'd' })
  noCadence.release({ reservation: r2.reservation })
  ok(noCadence.reserve({ domain: 'd' }).ok === true, 'cleanupCadenceDays[+]: with 0 there is no cooldown')
}

// ── refusal discipline: RETURNED refusals with enforced[] + scope + wouldEvaluate ⊇ enforced ────────
{
  const triggers = [
    ['seats cap', () => { const c = mk({ 'vmu.capacity.seatsPerDomain': 1 }); NOW = 1_000_000; c.reserve({ domain: 'd', seats: 1 }); return c.reserve({ domain: 'd', seats: 1 }) }],
    ['pool cap', () => { const c = mk({ 'vmu.capacity.machineHoursPool': 1 }); NOW = 1_000_000; return c.reserve({ domain: 'd', hours: 5 }) }],
    ['facility undeclared', () => { const c = mk({ 'vmu.capacity.facilities': ['a'] }); NOW = 1_000_000; return c.reserve({ domain: 'd', facility: 'z' }) }],
    ['safety', () => { const c = mk({ 'vmu.capacity.facilities': ['a'], 'vmu.capacity.safetyBriefingRequired': true }); NOW = 1_000_000; return c.reserve({ domain: 'd', facility: 'a' }) }],
    ['waitlist full', () => { const c = mk({ 'vmu.capacity.machineHoursPool': 1, 'vmu.capacity.allocationPolicy': 'waitlist', 'vmu.capacity.waitlistMax': 1 }); NOW = 1_000_000; c.reserve({ domain: 'a', hours: 1 }); c.reserve({ domain: 'b', hours: 1 }); return c.reserve({ domain: 'c', hours: 1 }) }],
    ['preempt never', () => { const c = mk({ 'vmu.capacity.machineHoursPool': 1, 'vmu.capacity.allocationPolicy': 'preempt', 'vmu.capacity.preemptPolicy': 'never' }); NOW = 1_000_000; c.reserve({ domain: 'a', hours: 1, priority: 1 }); return c.reserve({ domain: 'b', hours: 1, priority: 9 }) }],
    ['cooldown', () => { const c = mk({ 'vmu.capacity.cleanupCadenceDays': 1 }); NOW = 1_000_000; const r = c.reserve({ domain: 'd' }); c.release({ reservation: r.reservation }); return c.reserve({ domain: 'd' }) }],
    ['horizon', () => { const c = mk({ 'vmu.capacity.forecastHorizonDays': 1 }); NOW = 1_000_000; return c.forecast({ days: 5 }) }],
    ['stale input', () => { const c = mk({ 'vmu.capacity.forecastStaleDays': 1 }); NOW = 1_000_000; return c.forecast({ days: 1, dataAgeDays: 5 }) }],
    ['storage over', () => { const c = mk({}); NOW = 1_000_000; return c.storage({ usedBytes: 200, totalBytes: 100 }) }],
    ['no domain', () => mk({}).reserve({})],
    ['unknown reservation', () => mk({}).release({ reservation: 'nope' })],
    ['empty waitlist', () => mk({}).admit()],
  ]
  const bad = []
  for (const [label, fn] of triggers) {
    const r = fn()
    if (!r || r.ok !== false) { bad.push(label + ':NOT-A-REFUSAL(' + JSON.stringify(r && r.ok) + ')'); continue }
    if (typeof r.code !== 'string' || !r.code) bad.push(label + ':no-code')
    if (!Array.isArray(r.enforced)) bad.push(label + ':enforced=' + String(r.enforced))
    if (!Array.isArray(r.fired)) bad.push(label + ':fired=' + String(r.fired))
    if (r.enforcedScope !== ENFORCED_SCOPE) bad.push(label + ':scope=' + String(r.enforcedScope))
    if (!Array.isArray(r.wouldEvaluate) || !r.enforced.every((k) => r.wouldEvaluate.includes(k))) bad.push(label + ':wouldEvaluate⊉enforced')
    if (!r.fired.every((k) => r.enforced.includes(k))) bad.push(label + ':fired⊄enforced')
  }
  ok(bad.length === 0, 'EVERY refusal is a RETURN carrying code + array enforced[] + scope + wouldEvaluate ⊇ enforced', JSON.stringify(bad))
  // receipts: same discipline, no duplicates
  const c = mk({ 'vmu.capacity.machineHoursPool': 10 })
  NOW = 1_000_000
  c.reserve({ domain: 'd', hours: 1 })
  const rs = c.receiptsView({ limit: 20 })
  ok(rs.items.length >= 1 && rs.items.every((r) => Array.isArray(r.enforced) && Array.isArray(r.fired) && r.enforcedScope === ENFORCED_SCOPE),
    'receipts: enforced[] + fired[] + enforcedScope on every receipt', JSON.stringify(rs.items[0] && rs.items[0].enforcedScope))
  ok(rs.items.every((r) => r.fired.every((k) => r.enforced.includes(k))), 'receipts: fired ⊆ enforced')
  ok(rs.items.every((r) => new Set(r.enforced).size === r.enforced.length), 'receipts: enforced[] has no duplicates')
  // per-code counting
  const counted = mk({ 'vmu.capacity.machineHoursPool': 1 })
  NOW = 1_000_000
  counted.reserve({ domain: 'a', hours: 1 })
  counted.reserve({ domain: 'b', hours: 1 })
  counted.reserve({ domain: 'c', hours: 1 })
  ok(counted.status().refusals.VMU_CAPACITY_EXHAUSTED === 2, 'refusals are counted PER CODE', JSON.stringify(counted.status().refusals))
}

// ── the 3 C2 gate scenarios really change behaviour ─────────────────────────────────────────────────
{
  ok(GATE_SCENARIOS.length === 3, 'GATE_SCENARIOS offers 3 settings/call pairs for the C2 gate', String(GATE_SCENARIOS.length))
  const run = (settings, call) => {
    const c = createCapacity({ clock: () => 1_000_000, settings })
    return c[call.op](Object.assign({}, call.args))
  }
  const outcomes = GATE_SCENARIOS.map((s) => run(s.settings, s.call))
  ok(outcomes[0].ok === false && outcomes[0].code === 'VMU_CAPACITY_EXHAUSTED', 'scenario 1 (pool) refuses by name', outcomes[0].code)
  ok(outcomes[1].ok === true && outcomes[1].warnings.some((w) => w.code === 'VMU_CAPACITY_POOL_LOW'), 'scenario 2 (reserve touched) warns by name')
  ok(outcomes[2].ok === false && outcomes[2].code === 'VMU_CAPACITY_FORECAST_STALE', 'scenario 3 (horizon) refuses by name', outcomes[2].code)
  ok(outcomes.every((r) => Array.isArray(r.enforced) && (r.ok === true || r.wouldEvaluate.length >= r.enforced.length)),
    'every GATE_SCENARIOS outcome carries the receipt/refusal discipline')
  ok(GATE_SCENARIOS.every((s) => Object.keys(s.settings).length >= 1 && typeof s.call.op === 'string'),
    'each scenario pair names its settings AND its call (ready to paste into the gate)')
}

// ── declared universe, zero mechanism, determinism, read-only purity ────────────────────────────────
{
  const c = mk({})
  const st = c.status()
  ok(WIRED_KEYS.length === 12, 'the face wires all 12 declared vmu.capacity.* keys', String(WIRED_KEYS.length))
  ok(st.declaredCapacityKeys === 12, 'the declared universe is read from settings/schema.js (core + planned)', String(st.declaredCapacityKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredCapacityKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 12 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredCapacityKeys }))
  ok(st.wiredNotDeclared.length === 0, 'no wired key is missing from the declared registry', JSON.stringify(st.wiredNotDeclared))
  ok(Object.keys(st.keys).length === 12 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 12 wired keys (no silent nulls)')
  // zero mechanism: unlimited defaults (caps 0) ⇒ every call is granted, nothing crashes
  NOW = 1_000_000
  const z = mk({})
  ok(z.reserve({ domain: 'd', seats: 99, hours: 999 }).ok === true, 'zero mechanism[+]: caps of 0 mean "unlimited" ⇒ the reservation passes')
  ok(z.forecast({ days: 30 }).ok === true, 'zero mechanism[+]: the default horizon (30 days) admits a 30-day forecast')
  ok(z.storage({ usedBytes: 1, totalBytes: 10 }).ok === true, 'zero mechanism[+]: storage reports without crashing')
  ok(z.release({ reservation: 'nope' }).code === 'VMU_NO_SUCH_OBJECT', 'zero mechanism[-]: an unknown reservation is a named refusal')
  // read-only purity
  const before = JSON.stringify(z.status().counters)
  z.status(); z.list(); z.waitlistView(); z.receiptsView()
  ok(JSON.stringify(z.status().counters) === before, 'READ paths (status/list/waitlistView/receiptsView) never mutate recorded data')
  // determinism
  const mkSame = () => { NOW = 4242; const x = createCapacity({ clock: () => NOW, settings: { 'vmu.capacity.machineHoursPool': 5 } }); x.reserve({ domain: 'd', hours: 2 }); x.release({ reservation: 'r1' }); return x }
  ok(JSON.stringify(mkSame().status().counters) === JSON.stringify(mkSame().status().counters), 'two instances with the same inputs produce identical counters')
  ok(mkSame().status().at === 4242, 'status() uses the injected clock (no real time)')
  ok(Array.isArray(mk({}).status().gateScenarios) && mk({}).status().gateScenarios.length === 3, 'status() self-discloses the C2 scenario names')
}

if (failed === 0) {
  console.log('=== VMU CAPACITY: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU CAPACITY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
