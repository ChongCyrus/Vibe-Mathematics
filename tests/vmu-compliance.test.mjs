// tests/vmu-compliance.test.mjs — 独立可跑：kernel/compliance.js（mathtools 标准：enforced/fired/口径/wouldEvaluate/17 键划分）。
import { createCompliance, WIRED_KEYS, PLANNED_KEYS, PLANNED_REASONS, WOULD_EVALUATE, ENFORCED_SCOPE, apiVersion } from '../vibe-math-vmu/kernel/compliance.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, extra, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const list = Array.isArray(e.enforced)
    const scopeOk = e.enforcedScope === ENFORCED_SCOPE
    const sub = Array.isArray(e.wouldEvaluate) && list && e.enforced.every((k) => e.wouldEvaluate.indexOf(k) !== -1)
    const exOk = !extra || Object.entries(extra).every(([k, v]) => String(e[k]) === String(v))
    const hintOk = typeof e.hint === 'string' && e.hint.length > 0
    if (e.code === code && list && scopeOk && sub && exOk && hintOk) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: enforced=' + JSON.stringify(e.enforced)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' enforced=' + JSON.stringify(e && e.enforced) + ' scope=' + (e && e.enforcedScope) + ' cls=' + list + '/' + scopeOk + '/' + sub) }
  }
}
const CLOCK = () => '2026-07-01T00:00:00.000Z'
const mk = (settings = {}) => createCompliance({ clock: CLOCK, settings })

console.log('-- 0) 17 键**恰好划分** + 口径常量 --')
ok(apiVersion === 1 && ENFORCED_SCOPE === 'evaluated-so-far', 'module surface: apiVersion=1 and the D3 scope literal')
ok(WIRED_KEYS.length === 16 && PLANNED_KEYS.length === 1 && WIRED_KEYS.length + PLANNED_KEYS.length === 17, 'the 17 declared keys are PARTITIONED exactly: wired=' + WIRED_KEYS.length + ' + planned=' + PLANNED_KEYS.length + ' = 17')
ok(/domaingate/.test(PLANNED_REASONS['vmu.compliance.exportControlCheck'] || ''), 'the unwired key is NAMED with its reason (exportControlCheck → domaingate layer)')
ok(Object.keys(WOULD_EVALUATE).length >= 6, 'WOULD_EVALUATE (records.js OP_WOULD 口径) declares the per-op key sets')

console.log('-- ① 伦理审批缺失 / ② 知情同意未签（同一已登记码 + item 区分）--')
const a = mk()
refuses(() => a.review({ protocolId: 'P-1' }), 'VMU_COMPLIANCE_APPROVAL_MISSING', { item: 'irb' }, 'a missing IRB approval is refused (item=irb)')
refuses(() => a.review({ protocolId: 'P-1', irb: { approved: true } }), 'VMU_COMPLIANCE_APPROVAL_MISSING', { item: 'consent' }, 'a missing consent is refused with the SAME registered code (item=consent)')
const ar = a.review({ protocolId: 'P-1', irb: { approved: true }, consent: { signed: true } })
ok(ar.ok === true && ar.enforcedScope === ENFORCED_SCOPE && ar.fired.every((k) => ar.enforced.indexOf(k) !== -1), 'the positive review carries enforced/fired/scope with fired ⊆ enforced')

console.log('-- ③ 数据保留超期（给 current/limit）--')
const b = mk()
refuses(() => b.retention({ keepDays: 30, usedDays: 45 }), 'VMU_COMPLIANCE_OVERDUE_BLOCK', { current: 45, limit: 30 }, 'over-retention is refused WITH current/limit')
ok(b.retention({ keepDays: 30, usedDays: 10 }).ok === true, 'within the retention window it is allowed')

console.log('-- ④ COI 未申报（已登记码）⑤ 受试者数据导出未批 ⑥ 审计留痕缺失 ⑦ 日历逾期 --')
const c = mk()
refuses(() => c.coi({ who: 'r-1' }), 'VMU_COMPLIANCE_COI_UNDISCLOSED', null, 'an undisclosed COI is refused with the registered code')
ok(c.coi({ who: 'r-1', declared: { declared: true } }).ok === true, 'a declared COI passes')
refuses(() => c.exportData({ studyId: 'S-1' }), 'VMU_COMPLIANCE_EXPORT_BLOCKED', null, 'an unapproved subject-data export is refused')
refuses(() => c.exportData({ studyId: 'S-1', approvedBy: 'acad' }), 'VMU_COMPLIANCE_EXPORT_BLOCKED', null, 'an approved but UNREDACTED export is refused too')
ok(c.exportData({ studyId: 'S-1', approvedBy: 'acad', redacted: { done: true } }).ok === true, 'approved + redacted export passes')
refuses(() => c.evidence({ kind: 'registry' }), 'VMU_COMPLIANCE_EVIDENCE_INCOMPLETE', null, 'an incomplete evidence packet is refused')
refuses(() => c.calendar({ dueAt: '2026-06-01T00:00:00.000Z' }), 'VMU_COMPLIANCE_CALENDAR_MISSED', null, 'an overdue compliance calendar entry is refused')

console.log('-- 逐码计数 + 只读纯净 + 零机制 + 确定性 --')
const st = c.status()
ok(st.counts.refusals['VMU_COMPLIANCE_COI_UNDISCLOSED'] === 1 && st.counts.refusals['VMU_COMPLIANCE_EXPORT_BLOCKED'] === 2, 'per-code refusal counts are exact: ' + JSON.stringify(st.counts.refusals))
const w0 = st.counts.writes
c.status(); c.status()
ok(c.status().counts.writes === w0, 'read-only calls (status) do not increase the write counter (writes=' + w0 + ')')
const z = mk()
ok(z.status().mechanism.zeroMechanismSafe === true && z.prepare({}).ok === true, 'zero-mechanism (no settings) does not crash and still serves a receipt')
ok(z.prepare({}).enforcedScope === ENFORCED_SCOPE && z.prepare({}).enforced.indexOf('vmu.compliance.prepare') !== -1, 'the prepare receipt names its wired key (reminder/prep keys change observable behaviour)')
const h1 = mk(), h2 = mk()
h1.calendar({ dueAt: '2026-09-01T00:00:00.000Z' }); h2.calendar({ dueAt: '2026-09-01T00:00:00.000Z' })
ok(JSON.stringify(h1.status().counts) === JSON.stringify(h2.status().counts), 'two instances with the same clock agree exactly (determinism)')

console.log('-- 关闭式策略（键改变可观测行为）--')
const off = mk({ 'vmu.compliance.irbRequired': false, 'vmu.compliance.requireApprovalGate': false, 'vmu.compliance.require': 'none' })
ok(off.review({ protocolId: 'P-2' }).ok === true, 'irbRequired=false + require=none ⇒ the review passes (the keys really change behaviour)')
const warn = mk({ 'vmu.compliance.overdueEscalation': 'warn' })
refuses(() => warn.retention({ keepDays: 5, usedDays: 9 }), 'VMU_COMPLIANCE_OVERDUE_BLOCK', null, 'overdueEscalation=warn still reports the block by name (mode is stated in the hint)')
ok(/warn/.test(String((() => { try { warn.retention({ keepDays: 5, usedDays: 9 }) } catch (e) { return e.hint } })())), 'the hint names the configured mode (warn) — no silent behaviour change')

console.log('')
console.log('=== VMU COMPLIANCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
