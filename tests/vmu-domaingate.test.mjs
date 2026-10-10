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

console.log('')
console.log('=== VMU DOMAINGATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
