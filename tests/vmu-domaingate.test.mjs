// tests/vmu-domaingate.test.mjs — 独立可跑：kernel/domaingate.js 的十条不变式。
import { createDomainGate, DOMAINS, THREE_R, apiVersion } from '../vibe-math-vmu/kernel/domaingate.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needles, label) => {
  const list = Array.isArray(needles) ? needles : (needles ? [needles] : [])
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const good = e && e.code === code && list.every((n) => String(e.message).includes(n) || String(e.hint).includes(n)) && typeof e.hint === 'string' && e.hint.length > 0
    if (good) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: ' + e.message.slice(0, 95)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' msg=' + String(e && e.message).slice(0, 110)) }
  }
}
const CLOCK = () => '2026-06-01T00:00:00.000Z'
const mk = (settings = {}) => createDomainGate({ clock: CLOCK, settings })
const goodReview = (dg, protocolId = 'P-1') => dg.review({
  protocolId, approvedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-12-31T00:00:00.000Z',
  threeR: { replace: true, reduce: true, refine: true },
  facility: { accredited: true, validUntil: '2026-12-01T00:00:00.000Z' },
  training: [{ who: 'r-1', validUntil: '2026-11-01T00:00:00.000Z' }],
  ledgerRef: 'L-22-1',
})

console.log('-- 0) 模块面 --')
ok(apiVersion === 1 && DOMAINS.includes('clinical') && DOMAINS.includes('animal') && THREE_R.length === 3, 'module surface: 2 domains, 3 R, apiVersion=1')

console.log('-- ⑩ 零机制：明确"无闸"而不是"通过" --')
const z = mk()
ok(z.status().gate === 'no-gate' && /no domain pack/.test(z.status().note), 'status() states the gate is "no-gate" before any pack is declared')
const gz = z.gate({ domain: 'clinical' })
ok(gz.ok === true && gz.gated === false && gz.verdict === 'no-gate' && /not a pass/.test(gz.note), 'gate() returns verdict "no-gate" — explicitly NOT a pass (gated=false)')

console.log('-- ① 未批不得开始：具名拒并点名缺哪一项 --')
const a = mk()
a.declare({ domain: 'clinical' })
refuses(() => a.gate({ domain: 'clinical' }), 'VMU_GATE_UNSATISFIED', ['registration', 'consent', 'training'], 'an undeclared/unapproved clinical gate is refused, naming every missing item')
try { a.gate({ domain: 'clinical' }) } catch (e) { ok(Array.isArray(e.items) && e.items.length === 3, 'the refusal carries the per-item list (items=' + (e.items || []).length + ')') }

console.log('-- ② 同意版本化：不一致拒 ＋ 撤回可追溯 --')
a.consent({ studyId: 's-1', version: 'v1', effectiveAt: '2026-01-01T00:00:00.000Z' })
ok(a.checkConsent({ studyId: 's-1', version: 'v1' }).matches === true, 'the effective consent version matches the request')
refuses(() => a.checkConsent({ studyId: 's-1', version: 'v2' }), 'VMU_CONSENT_VERSION_MISMATCH', ['v2', 'v1'], 'a version mismatch is refused by name (both versions named)')
const w = a.withdraw({ studyId: 's-1', version: 'v1', at: '2026-02-01T00:00:00.000Z', by: 'pi' })
ok(w.ok === true && w.withdrawnAt === '2026-02-01T00:00:00.000Z' && w.traceable === true, 'the withdrawal is recorded with its timestamp (traceable)')
refuses(() => a.checkConsent({ studyId: 's-1', version: 'v1', at: '2026-03-01T00:00:00.000Z' }), 'VMU_GATE_UNSATISFIED', ['withdrawn', '2026-02-01'], 'a withdrawn consent is never usable and the refusal names the withdrawal time')

console.log('-- ③ SAE 24h / AE 72h 超时：拒并给时刻与时限 --')
const b = mk()
refuses(() => b.report({ kind: 'sae', observedAt: '2026-01-01T00:00:00.000Z', reportedAt: '2026-01-03T00:00:00.000Z', studyId: 's-1' }), 'VMU_SAE_REPORT_OVERDUE', ['2026-01-01', '2026-01-03', '24h'], 'an SAE reported 48h later is refused with both timestamps and the 24h limit')
const rae = b.report({ kind: 'ae', observedAt: '2026-01-01T00:00:00.000Z', reportedAt: '2026-01-03T00:00:00.000Z', studyId: 's-1' })
ok(rae.ok === true && rae.withinLimit === true && rae.limitLabel === '72h', 'the same 48h delay is within the AE limit (' + rae.limitLabel + ')')
refuses(() => b.report({ kind: 'ae', observedAt: '2026-01-01T00:00:00.000Z', reportedAt: '2026-01-05T00:00:00.000Z', studyId: 's-1' }), 'VMU_SAE_REPORT_OVERDUE', '72h', 'an AE reported 96h later is refused against the 72h limit')

console.log('-- ④⑤⑥ IACUC / 3R / 设施 / 培训 / ledgerRef --')
const c = mk()
c.declare({ domain: 'animal' })
refuses(() => c.review({ approvedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-12-31T00:00:00.000Z' }), 'VMU_REGISTRATION_MISSING', 'protocolId', 'a review without a protocol registration number is refused')
refuses(() => c.review({ protocolId: 'P-1', expiresAt: '2026-05-01T00:00:00.000Z' }), 'VMU_IACUC_EXPIRED', ['expired', '2026-05-01'], 'an expired approval is refused with its expiry date')
refuses(() => c.review({ protocolId: 'P-1', expiresAt: '2026-12-31T00:00:00.000Z', threeR: { replace: true, reduce: true } }), 'VMU_THREE_R_INCOMPLETE', 'refine', 'an incomplete 3R statement names the missing R (refine)')
refuses(() => c.review({ protocolId: 'P-1', expiresAt: '2026-12-31T00:00:00.000Z', facility: { accredited: false } }), 'VMU_FACILITY_UNACCREDITED', 'accredited', 'a non-accredited facility is refused')
refuses(() => c.review({ protocolId: 'P-1', expiresAt: '2026-12-31T00:00:00.000Z', training: [{ who: 'r-9', validUntil: '2026-05-01T00:00:00.000Z' }] }), 'VMU_TRAINING_EXPIRED', 'r-9', 'expired training is refused and names who')
refuses(() => c.review({ protocolId: 'P-1', expiresAt: '2026-12-31T00:00:00.000Z', ledgerRef: { id: 'L-22-1' } }), 'VMU_INVALID_ARGUMENT', 'LEDGER ID', 'ledgerRef must be an ID from the vol-22 ledger (no ledger structure is defined here)')
const rv = goodReview(c)
ok(rv.ok === true && rv.ledgerRef === 'L-22-1', 'a complete animal review (3R + facility + training + ledgerRef) is accepted')
const ga = c.gate({ domain: 'animal', protocolId: 'P-1', at: '2026-06-01T00:00:00.000Z' })
ok(ga.gated === true && ga.verdict === 'satisfied' && ga.checked.includes('threeR'), 'the animal gate is satisfied once every required item is in place')

console.log('-- ⑧ 截断必计数 --')
const d = mk({ 'vmu.compliance.maxReports': 2 })
for (const day of ['1', '2', '3']) d.report({ kind: 'deviation', observedAt: '2026-01-0' + day + 'T00:00:00.000Z', reportedAt: '2026-01-0' + day + 'T01:00:00.000Z', studyId: 's-1' })
ok(d.status().reports === 2 && d.status().dropped.reports === 1, 'the report log is capped and the drop count is reported (dropped=' + d.status().dropped.reports + ')')

console.log('-- ⑨ 注入时钟 ＋ 只读面不改状态 ＋ 确定性 --')
ok(mk().status().mechanism.clockInjected === true, 'status states the clock is injected (no real time is read)')
const e = mk()
const w0 = e.status().counts.writes
e.status(); e.status()
ok(e.status().counts.writes === w0, 'read-only calls do not increase the write counter (writes=' + w0 + ')')
const f1 = mk(), f2 = mk()
goodReview(f1); goodReview(f2)
ok(JSON.stringify(f1.status().reviews) === JSON.stringify(f2.status().reviews), 'two instances with the same clock produce identical review state (determinism)')

// task-217 (falsy-zero): epoch 0 is a LEGAL instant everywhere in this module. "not given" is now decided by
// an explicit undefined/null test, so 0 is ACCEPTED, preserved verbatim, and distinguishable from absence.
{
  const dg = mk()
  // (0) observedAt = 0 is accepted as an instant (before the fix: "report needs { observedAt }")
  const r0 = dg.report({ kind: 'ae', observedAt: 0, reportedAt: 0 })
  ok(r0.ok === true && r0.deltaMs === 0, 'report({ observedAt: 0, reportedAt: 0 }) is accepted: 0 is an instant, deltaMs=0 (no clock fallback)')
  refuses(() => dg.report({ kind: 'ae' }), 'VMU_INVALID_ARGUMENT', ['observedAt'], 'observedAt undefined ⇒ named refusal (needs { observedAt })')
  refuses(() => dg.report({ kind: 'ae', observedAt: null }), 'VMU_INVALID_ARGUMENT', ['observedAt'], 'observedAt null ⇒ named refusal (null means "not given")')
  // (1) consent: effectiveAt 0 preserved; withdrawnAt 0 preserved AND distinct from "not withdrawn"
  const c0 = dg.consent({ studyId: 's-0', version: 'v1', effectiveAt: 0 })
  ok(c0.effectiveAt === '0', 'consent({ effectiveAt: 0 }) records the epoch-0 instant verbatim (no clock fallback)')
  ok(c0.withdrawnAt === null, 'consent without withdrawnAt is NOT withdrawn (null), which 0 must not collapse into')
  const cw = dg.consent({ studyId: 's-0', version: 'v2', effectiveAt: 0, withdrawnAt: 0 })
  ok(cw.withdrawnAt === '0', 'consent({ withdrawnAt: 0 }) keeps 0 (before the fix the receipt said null)')
  ok(cw.withdrawnAt !== c0.withdrawnAt, 'withdrawn-at-0 and never-withdrawn are DISTINGUISHABLE (the two receipts differ)')
  // (2) review: expiresAt 0 is ACCEPTED as a value, then judged on its merits (expired in 1970) — the refusal is
  //     about EXPIRY, not about a missing argument.
  refuses(() => dg.review({ protocolId: 'p-0', expiresAt: 0 }), 'VMU_IACUC_EXPIRED', ['expired'], 'review({ expiresAt: 0 }) is accepted as a value, then refused for being EXPIRED (not "needs { expiresAt }")')
  refuses(() => dg.review({ protocolId: 'p-0' }), 'VMU_IACUC_EXPIRED', ['needs { expiresAt }'], 'review without expiresAt is refused as a MISSING argument (the two are distinguishable)')
  const gone = dg.review({ protocolId: 'p-1', approvedAt: 0, expiresAt: '2099-01-01T00:00:00.000Z' })
  ok(gone.ok === true, 'review({ approvedAt: 0, expiresAt: <future> }) is accepted (approvedAt 0 preserved as a value)')
  // (3) withdraw/checkConsent with an explicit 0 instant
  dg.consent({ studyId: 's-1', version: 'v1', effectiveAt: 0 })
  const w = dg.withdraw({ studyId: 's-1', version: 'v1', at: 0 })
  ok(w.ok === true && w.withdrawnAt === '0', 'withdraw({ at: 0 }) records the epoch-0 instant verbatim')
  refuses(() => dg.checkConsent({ studyId: 's-2', version: 'v1', at: 0 }), 'VMU_GATE_UNSATISFIED', ['no consent on file'], 'checkConsent({ at: 0 }) on an unknown study is refused by NAME (0 read as an instant, no crash, no falsy fallback)')
  const c3 = dg.consent({ studyId: 's-3', version: 'v1', effectiveAt: 0 })
  const cc3 = dg.checkConsent({ studyId: 's-3', version: 'v1', at: 0 })
  ok(c3.effectiveAt === '0' && cc3.ok === true && cc3.effectiveAt === '0', 'an epoch-0 consent is effective AT epoch 0 (the comparison reads 0 correctly)')
  const g0 = dg.gate({ domain: 'clinical', at: 0 })
  ok(g0.ok === true && g0.at === '0', 'gate({ at: 0 }) reports at="0" (the given instant, not the clock)')
}

// ── task-231: the instant→ms rule now has ONE shared implementation (kernel/timevalue.js), and both faces
// must judge the SAME input the SAME way. The trap the helper documents: Date.parse('1000') is the YEAR 1000
// (-30610224000000) and NOT NaN, so a number must be handled as a number before any stringification.
{
  const { ms } = await import('../vibe-math-vmu/kernel/timevalue.js')
  const { createCompliance } = await import('../vibe-math-vmu/kernel/compliance.js')
  ok(typeof ms === 'function' && ms(0) === 0 && ms(1000) === 1000, 'shared ms(): a finite NUMBER is epoch-ms (0 included)')
  ok(ms('1970-01-01T00:00:00.000Z') === 0 && ms(1000) === 1000, 'shared ms(): ISO strings and numbers agree on the same instant')
  ok(!Number.isNaN(ms('1000')) && ms('1000') === Date.parse('1000') && ms('1000') !== 1000, 'the bare-year trap is SILENT: ms("1000") = year 1000, not NaN and not 1000')
  ok(Number.isNaN(ms('nope')) && Number.isNaN(ms(NaN)), 'unparseable input ⇒ NaN (never a throw, never a guess)')
  ok(ms(0) < ms(1000) === true, 'the shared rule orders the two instants (0 before 1000)')
  // CROSS-FACE: the same pair {0, 1000} must read as "0 is in the past" in BOTH faces.
  const mine = (() => { try { mk().review({ protocolId: 'p-231', approvedAt: 0, expiresAt: 0, at: 1000 }); return null } catch (e) { return e.code } })()
  const cp = createCompliance({ clock: () => 1000, settings: {} })
  const theirs = (() => { try { cp.calendar({ dueAt: 0, at: 1000 }); return null } catch (e) { return e.code } })()
  ok(mine === 'VMU_IACUC_EXPIRED', 'domaingate: expiresAt 0 with now 1000 ⇒ EXPIRED (0 is a past instant)')
  ok(theirs === 'VMU_COMPLIANCE_CALENDAR_MISSED', 'compliance: dueAt 0 with now 1000 ⇒ OVERDUE (the same reading of the same instants)')
  ok(mine !== null && theirs !== null, 'CROSS-FACE CONSISTENCY: both faces (sharing ms()) treat 0 as a past instant, each with its own named code')
}

// task-238 (the FIFTEENTH case): `consent` used to STORE an unparseable instant as a raw string (no refusal),
// and `review({ expiresAt: 'nope' })` silently "passed" the expiry comparison. Both are named refusals now,
// and the value is still echoed verbatim when it is valid (0 stays "0", an ISO stays ISO).
{
  refuses(() => mk().consent({ studyId: 's-238', version: 'v1', withdrawnAt: 'nope' }), 'VMU_INVALID_ARGUMENT', ['withdrawnAt', 'nope'], 'unparseable withdrawnAt ⇒ named refusal naming the value')
  refuses(() => mk().consent({ studyId: 's-238', version: 'v1', effectiveAt: 'nope' }), 'VMU_INVALID_ARGUMENT', ['effectiveAt', 'nope'], 'unparseable effectiveAt ⇒ named refusal naming the value')
  refuses(() => mk().review({ protocolId: 'p-238', expiresAt: 'nope' }), 'VMU_INVALID_ARGUMENT', ['expiresAt', 'nope'], 'unparseable expiresAt ⇒ named refusal (it used to compare as a string and pass)')
  refuses(() => mk().gate({ domain: 'clinical', at: 'nope' }), 'VMU_INVALID_ARGUMENT', ['`at`', 'nope'], 'unparseable `at` on gate() ⇒ named refusal')
  ok(mk().consent({ studyId: 's-238', version: 'v1', withdrawnAt: 0 }).withdrawnAt === '0', 'control: withdrawnAt 0 is still accepted and echoed verbatim (no regression)')
  ok(mk().consent({ studyId: 's-238', version: 'v1', effectiveAt: '1970-01-01T00:00:00.000Z' }).effectiveAt === '1970-01-01T00:00:00.000Z', 'control: a valid ISO instant is stored verbatim (no regression)')
}

console.log('')
console.log('=== VMU DOMAINGATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
