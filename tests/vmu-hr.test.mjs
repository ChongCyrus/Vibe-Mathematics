// tests/vmu-hr.test.mjs — 独立可跑：kernel/hr.js（mathtools 标准：11 键划分/enforced/口径/wouldEvaluate/7 个已登记码）。
import { createHr, WIRED_KEYS, UNSUPPORTED_SEMANTICS, WOULD_EVALUATE, CODES, ENFORCED_SCOPE, apiVersion } from '../vibe-math-vmu/kernel/hr.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, extra, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const list = Array.isArray(e.enforced)
    const scopeOk = e.enforcedScope === ENFORCED_SCOPE
    const sub = Array.isArray(e.wouldEvaluate) && list && e.enforced.every((k) => e.wouldEvaluate.indexOf(k) !== -1)
    const exOk = !extra || Object.entries(extra).every(([k, v]) => String(e[k]) === String(v))
    const hintOk = typeof e.hint === 'string' && e.hint.length > 0
    if (e.code === code && list && scopeOk && sub && exOk && hintOk) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: enforced=' + e.enforced.length) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' enforced=' + JSON.stringify(e && e.enforced) + ' ok=' + list + '/' + scopeOk + '/' + sub + '/' + exOk) }
  }
}
const CLOCK = () => '2026-07-01T00:00:00.000Z'
const mk = (settings = {}) => createHr({ clock: CLOCK, settings })
const day = 86400000

console.log('-- 0) 11 键恰好划分 ＋ 无自造码 --')
ok(apiVersion === 1 && ENFORCED_SCOPE === 'evaluated-so-far', 'module surface: apiVersion=1 and the D3 scope literal')
ok(WIRED_KEYS.length === 11, 'all 11 declared vmu.hr.* keys are wired (' + WIRED_KEYS.length + ')')
ok(Object.values(CODES).every((c) => /^VMU_HR_/.test(c)) && Object.values(CODES).length === 7, 'only the 7 registered VMU_HR_* codes are used (no invented codes)')
ok(Object.keys(UNSUPPORTED_SEMANTICS).length === 6, 'the 6 requested-but-unregistered semantics are NAMED (contract/timesheet/leave/overlap/qualification/probation)')
ok(Object.keys(WOULD_EVALUATE).length === 6, 'WOULD_EVALUATE declares the per-op key sets (records.js OP_WOULD 口径)')

console.log('-- recruit（窗口/周期 ⇒ VMU_HR_CYCLE_CLOSED）--')
const a = mk()
refuses(() => a.recruit({ openingId: 'o-1', openedAt: '2026-06-01T00:00:00.000Z', at: '2026-06-20T00:00:00.000Z' }), CODES.CYCLE_CLOSED, null, 'a closed recruitment window is refused by name')
const ar = a.recruit({ openingId: 'o-1', openedAt: '2026-06-29T00:00:00.000Z', at: '2026-07-01T00:00:00.000Z' })
ok(ar.ok === true && ar.enforcedScope === ENFORCED_SCOPE && ar.fired.every((k) => ar.enforced.indexOf(k) !== -1) && !!ar.closesAt, 'an open window passes with closesAt and fired ⊆ enforced')

console.log('-- performance（节奏/证据 ⇒ CYCLE_CLOSED＋PERF_EVIDENCE_MISSING）--')
const b = mk()
refuses(() => b.performance({ who: 'r-1', lastAt: '2026-01-01T00:00:00.000Z', evidence: ['x'] }), CODES.CYCLE_CLOSED, null, 'an overdue cadence is refused')
refuses(() => b.performance({ who: 'r-1', lastAt: '2026-06-30T00:00:00.000Z', evidence: [] }), CODES.PERF_EVIDENCE_MISSING, null, 'missing evidence is refused by its own code')
ok(b.performance({ who: 'r-1', lastAt: '2026-06-30T00:00:00.000Z', evidence: ['e1'] }).ok === true, 'in-cadence with evidence passes')

console.log('-- tenure（人类决策/法定人数/决定到期 ⇒ 三个码）--')
const c = mk()
refuses(() => c.tenure({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z', votes: 5, auto: true }), CODES.AUTODECISION_FORBIDDEN, null, 'an automatic tenure decision is forbidden (humanDecisionRequired)')
refuses(() => c.tenure({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z', votes: 1 }), CODES.TENURE_QUORUM_MISSING, null, 'a missing quorum is refused')
refuses(() => c.tenure({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z', votes: 3 }), CODES.TENURE_DECISION_DUE, null, 'a due decision (track + window elapsed) is refused')
ok(c.tenure({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z', votes: 3, decisionAt: '2026-06-01T00:00:00.000Z' }).ok === true, 'a recorded decision passes')

console.log('-- appeal / offboard / rotation --')
const d = mk()
refuses(() => d.appeal({ who: 'r-3', openedAt: '2026-06-20T00:00:00.000Z' }), CODES.APPEAL_OPEN, null, 'an unresolved appeal is refused (APPEAL_OPEN)')
ok(d.appeal({ who: 'r-3', openedAt: '2026-06-20T00:00:00.000Z', resolved: true }).ok === true, 'a resolved appeal passes')
refuses(() => d.offboard({ who: 'r-3', done: ['handover'] }), CODES.OFFBOARDING_INCOMPLETE, null, 'an incomplete offboarding checklist is refused')
const od = d.offboard({ who: 'r-3', done: ['handover', 'keys', 'records'] })
ok(od.ok === true && od.checklist === 3, 'a complete checklist passes (checklist items counted)')
ok(d.rotation({ pool: ['r-1', 'r-2'] }).mode === 'round-robin', 'the rotation mode reaches the receipt (the key changes observable behaviour)')

console.log('-- 逐码计数 / 只读纯净 / 零机制 / 确定性 / settings 对 --')
const st = d.status()
ok(st.counts.refusals[CODES.APPEAL_OPEN] === 1 && st.counts.refusals[CODES.OFFBOARDING_INCOMPLETE] === 1, 'per-code counts are exact: ' + JSON.stringify(st.counts.refusals))
const w0 = st.counts.writes
d.status(); d.status()
ok(d.status().counts.writes === w0, 'read-only status() does not increase the write counter (writes=' + w0 + ')')
const z = mk()
ok(z.status().mechanism.zeroMechanismSafe === true && z.rotation({}).ok === true && z.status().partition.total === 11, 'zero-mechanism does not crash and still partitions 11 keys')
const h1 = mk(), h2 = mk()
h1.rotation({ pool: ['a'] }); h2.rotation({ pool: ['a'] })
ok(JSON.stringify(h1.status().counts) === JSON.stringify(h2.status().counts), 'two instances with the same clock agree exactly (determinism)')
const off = mk({ 'vmu.hr.humanDecisionRequired': false, 'vmu.hr.performanceEvidenceRequired': false, 'vmu.hr.tenureQuorum': 0 })
ok(off.tenure({ who: 'r-9', trackStart: '2023-01-01T00:00:00.000Z', votes: 0, auto: true, decisionAt: '2026-01-15T00:00:00.000Z' }).ok === true, 'settings pair (1): humanDecisionRequired=false + auto=true passes (the key really governs)')
ok(off.performance({ who: 'r-9', lastAt: '2026-06-30T00:00:00.000Z', evidence: [] }).ok === true, 'settings pair (1): performanceEvidenceRequired=false ⇒ missing evidence is allowed')
const win = mk({ 'vmu.hr.appealWindowDays': 1 })
ok(win.appeal({ who: 'r-9', openedAt: '2026-06-30T12:00:00.000Z', at: '2026-07-01T00:00:00.000Z', resolved: true }).ok === true, 'settings pair (2): a 1-day appeal window is read from settings (in-window passes)')
refuses(() => win.appeal({ who: 'r-9', openedAt: '2026-05-01T00:00:00.000Z', at: '2026-07-01T00:00:00.000Z' }), CODES.APPEAL_OPEN, null, 'settings pair (2): beyond the 1-day window the appeal is refused (window really governs)')
ok(JSON.stringify(off.status().policy.offboardingChecklist) === JSON.stringify(['handover', 'keys', 'records']), 'settings pair (2): the default checklist is visible (customisable per 22 卷)')
const strict = mk({ 'vmu.hr.tenureQuorum': 5, 'vmu.hr.recruitWindowOpenMs': 1000 })
refuses(() => strict.tenure({ who: 'r-9', trackStart: '2023-01-01T00:00:00.000Z', votes: 3 }), CODES.TENURE_QUORUM_MISSING, { quorum: 5 }, 'settings pair (3): quorum=5 refuses 3 votes (and reports quorum=5)')
refuses(() => strict.recruit({ openingId: 'o-9', openedAt: '2026-06-30T00:00:00.000Z', at: '2026-07-01T00:00:00.000Z' }), CODES.CYCLE_CLOSED, null, 'settings pair (3): a 1-second window closes immediately')

// task-210 (the THIRTEENTH falsy-zero case): epoch 0 is a LEGAL instant. "not given" is decided by an explicit
// `undefined`/`null` test, so `0` must be ACCEPTED, recorded as 0, and be distinguishable from a missing value.
{
  const h = mk()
  // (0) ACCEPTED and recorded truthfully
  const r0 = h.recruit({ by: 'u', openedAt: 0, at: 0 })
  ok(r0.ok === true && r0.openedAt === 0, 'openedAt=0 (epoch 0) is ACCEPTED, not treated as "not given"')
  ok(r0.closesAt === new Date(0 + h.status().policy.recruitWindowOpenMs).toISOString(), 'the epoch-0 instant really participates: closesAt = 0 + recruitWindowOpenMs')
  ok(r0.at === '0', 'at() records the given instant 0 instead of falling back to the clock')
  // (0b) 0 vs 1 vs ISO are three DIFFERENT instants (no collapse onto a default)
  const r1 = h.recruit({ by: 'u', openedAt: 1, at: 1 })
  const rIso = h.recruit({ by: 'u', openedAt: '1970-01-01T00:00:00.000Z', at: 0 })
  ok(r1.openedAt === 1 && r1.closesAt !== r0.closesAt, 'openedAt=1 is its own instant (not collapsed with 0)')
  ok(rIso.openedAt === 0 && rIso.closesAt === r0.closesAt, 'the ISO epoch is the SAME instant as 0 (both legal, consistently read)')
  // (1) really missing ⇒ named refusal (and NOT the "ISO instants" branch: the absence is named precisely)
  refuses(() => h.recruit({ by: 'u' }), 'VMU_INVALID_ARGUMENT', null, 'openedAt=undefined ⇒ named refusal (needs { openedAt })')
  refuses(() => h.recruit({ by: 'u', openedAt: null }), 'VMU_INVALID_ARGUMENT', null, 'openedAt=null ⇒ named refusal (null means "not given")')
  // (2) the SAME class elsewhere in hr.js: lastAt / trackStart / decisionAt / appeal openedAt, plus `at: 0`
  const perf = h.performance({ who: 'r-1', lastAt: 0, evidence: ['ev'], at: 0 })
  ok(perf.ok === true && perf.at === '0', 'performance({ lastAt: 0, at: 0 }) is accepted (0 is an instant, not a fallback)')
  const ten = mk({ 'vmu.hr.tenureQuorum': 0, 'vmu.hr.humanDecisionRequired': false })
  ok(ten.tenure({ who: 'r-1', trackStart: 0, votes: 0, decisionAt: 0, at: 0 }).ok === true, 'tenure({ trackStart: 0, decisionAt: 0, at: 0 }) is accepted')
  refuses(() => ten.tenure({ who: 'r-1', votes: 0 }), 'VMU_INVALID_ARGUMENT', null, 'tenure without trackStart is still refused by name')
  // `appeal({openedAt})` means "an appeal IS open" — so reading 0 must REFUSE by name (before the fix the falsy
  // guard IGNORED it and the call silently succeeded: that difference is the whole point of this case).
  refuses(() => h.appeal({ who: 'r-1', openedAt: 0, at: 0 }), CODES.APPEAL_OPEN, { openedAt: '0' }, 'appeal({ openedAt: 0 }) ⇒ the epoch-0 appeal is SEEN (named refusal, openedAt recorded as 0)')
  ok(h.appeal({ who: 'r-1', resolved: true, at: 0 }).ok === true, 'appeal({ resolved: true, at: 0 }) passes with at=0 recorded (no clock fallback)')
  refuses(() => mk({ 'vmu.hr.appealWindowDays': 1 }).appeal({ who: 'r-1', openedAt: 0, at: day }), CODES.APPEAL_OPEN, null, 'an epoch-0 appeal really ages: past the window it is refused (0 is not ignored)')
}

// task-234: the instant→ms rule is now the SHARED kernel/timevalue.js one (the local `num()` copy is gone).
// Each changed site must treat a NUMBER as epoch-ms and an ISO string as the SAME instant — and a numeric
// 1000 must never be re-read as the year 1000.
{
  const { ms } = await import('../vibe-math-vmu/kernel/timevalue.js')
  const ISO = '1970-01-01T00:00:00.000Z'
  ok(ms(0) === 0 && ms(1000) === 1000, 'shared ms(): a finite NUMBER is epoch-ms (0 included)')
  ok(ms(ISO) === 0 && ms(0) === ms(ISO), 'shared ms(): an ISO string and the matching number are the SAME instant')
  ok(!Number.isNaN(ms('1000')) && ms('1000') !== 1000, 'the bare-year trap stays explicit: ms("1000") is the year 1000, not 1000 and not NaN')
  // recruit: numeric vs ISO, and the numeric 1000 must not become the year 1000
  const r0 = mk().recruit({ by: 'u', openedAt: 0, at: 0 })
  const rIso = mk().recruit({ by: 'u', openedAt: ISO, at: ISO })
  ok(r0.openedAt === 0 && rIso.openedAt === 0 && r0.closesAt === rIso.closesAt, 'recruit: openedAt 0 and openedAt <ISO epoch> give the SAME receipt (number = epoch-ms)')
  const r1k = mk().recruit({ by: 'u', openedAt: 1000, at: 1000 })
  ok(r1k.openedAt === 1000 && r1k.closesAt === new Date(1000 + mk().status().policy.recruitWindowOpenMs).toISOString(), 'recruit: openedAt 1000 is 1000 ms after the epoch (NOT the year 1000)')
  ok(r1k.closesAt !== new Date(-30610224000000 + mk().status().policy.recruitWindowOpenMs).toISOString(), 'recruit: the year-1000 reading is NOT what the module computes (the trap is closed)')
  // performance
  const p0 = mk().performance({ who: 'r-1', lastAt: 0, evidence: ['ev'], at: 0 })
  const pIso = mk().performance({ who: 'r-1', lastAt: ISO, evidence: ['ev'], at: ISO })
  ok(p0.ok === true && pIso.ok === true && p0.cadenceDays === pIso.cadenceDays, 'performance: lastAt 0 / at 0 and their ISO equivalents are judged identically')
  ok(p0.at === '0' && pIso.at === ISO, 'performance: the receipt echoes each caller value verbatim (the ONLY difference is the display form)')
  // tenure (quorum satisfied so the track dates are what gets exercised)
  const t0 = mk({ 'vmu.hr.tenureQuorum': 0 }).tenure({ who: 'r-1', trackStart: 0, votes: 0, decisionAt: 0, at: 0 })
  const tIso = mk({ 'vmu.hr.tenureQuorum': 0 }).tenure({ who: 'r-1', trackStart: ISO, votes: 0, decisionAt: ISO, at: ISO })
  ok(t0.ok === true && tIso.ok === true && t0.trackMonths === tIso.trackMonths && t0.quorum === tIso.quorum, 'tenure: trackStart/decisionAt 0 and their ISO equivalents are judged identically')
  ok(t0.at === '0' && tIso.at === ISO, 'tenure: the receipt echoes each caller value verbatim (the ONLY difference is the display form)')
  // appeal: an epoch-0 appeal is SEEN (both spellings refuse with the same code)
  const a0 = (() => { try { mk().appeal({ who: 'r-1', openedAt: 0, at: 0 }); return null } catch (e) { return e } })()
  const aIso = (() => { try { mk().appeal({ who: 'r-1', openedAt: ISO, at: ISO }); return null } catch (e) { return e } })()
  ok(a0 && aIso && a0.code === CODES.APPEAL_OPEN && aIso.code === CODES.APPEAL_OPEN, 'appeal: openedAt 0 and the ISO epoch are both read as "an appeal is open"')
  ok(a0.openedAt === '0' && aIso.openedAt === ISO, 'appeal: each receipt echoes the caller value verbatim (0 stays "0", the ISO stays ISO)')
}

// task-238 (the FIFTEENTH case): an unparseable instant is a NAMED refusal carrying the RECEIVED value (`hr`
// refused before, but the message did not say which value was wrong). Valid 0 / ISO inputs are unchanged.
{
  refuses(() => mk().recruit({ by: 'u', openedAt: 'nope' }), 'VMU_INVALID_ARGUMENT', { received: 'nope' }, 'unparseable openedAt ⇒ named refusal carrying the received value')
  refuses(() => mk().performance({ who: 'r-1', lastAt: 'nope', evidence: ['ev'] }), 'VMU_INVALID_ARGUMENT', { received: 'nope' }, 'unparseable lastAt ⇒ named refusal carrying the received value')
  refuses(() => mk({ 'vmu.hr.tenureQuorum': 0 }).tenure({ who: 'r-1', trackStart: 'nope' }), 'VMU_INVALID_ARGUMENT', { received: 'nope' }, 'unparseable trackStart ⇒ named refusal carrying the received value')
  refuses(() => mk().appeal({ who: 'r-1', openedAt: 'nope', resolved: true }), 'VMU_INVALID_ARGUMENT', { received: 'nope' }, 'unparseable appeal openedAt ⇒ named refusal (with resolved, so the strict check is what fires)')
  ok(mk().recruit({ by: 'u', openedAt: 0, at: 0 }).ok === true, 'control: openedAt 0 is still accepted (no regression)')
  ok(mk().recruit({ by: 'u', openedAt: '1970-01-01T00:00:00.000Z', at: '1970-01-01T00:00:00.000Z' }).ok === true, 'control: the ISO epoch is still accepted (no regression)')
}

console.log('')
console.log('=== VMU HR: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
