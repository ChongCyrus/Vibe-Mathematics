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

console.log('-- task-216：假值零（0 是合法值，与"缺"必须可区分）--')
refuses(() => mk().calendar({ dueAt: 0 }), 'VMU_COMPLIANCE_CALENDAR_MISSED', null, 'dueAt:0 is ACCEPTED as a value (epoch 0 ⇒ genuinely overdue, NOT reported as missing)')
refuses(() => mk().calendar({}), 'VMU_INVALID_ARGUMENT', null, 'a missing dueAt is refused by name (0 and missing stay distinguishable)')
refuses(() => mk().calendar({ dueAt: null }), 'VMU_INVALID_ARGUMENT', null, 'a null dueAt is refused by name')
ok(mk().prepare({ at: 0 }).at === '0', 'at:0 is recorded verbatim (not replaced by the clock): at=' + JSON.stringify(mk().prepare({ at: 0 }).at))
ok(mk().review({ protocolId: 'P-0', irb: { approved: true }, consent: { signed: true }, at: 0 }).at === '0', 'the 7 collapsed sites now preserve at:0 (review receipt)')
// task-229: the end-to-end proof that `dueAt: 0` means "due at epoch 0" ⇒ OVERDUE (not "missing"). The
// earlier probe passed a NUMERIC `at`, which is mis-read as a year (see the caveat below), so it only proved
// "0 is not treated as absent". With an ISO `at` the comparison runs and the refusal must be CALENDAR_MISSED.
refuses(() => mk().calendar({ dueAt: 0, at: '2026-01-01T00:00:00.000Z' }), 'VMU_COMPLIANCE_CALENDAR_MISSED', null, 'dueAt:0 + ISO at ⇒ the entry is OVERDUE by name (0 is an instant, not an omission)')
try {
  mk().calendar({ dueAt: 0, at: '2026-01-01T00:00:00.000Z' })
  ok(false, 'dueAt:0 must be refused (unreachable)')
} catch (e) {
  ok(String(e.message).includes('0') && String(e.message).includes('2026-01-01'), 'the overdue refusal NAMES the due instant and now: ' + JSON.stringify(e.message))
}
refuses(() => mk().calendar({ at: '2026-01-01T00:00:00.000Z' }), 'VMU_INVALID_ARGUMENT', null, 'dueAt MISSING + ISO at ⇒ a different, named refusal (needs { dueAt }) — the two are DISTINGUISHABLE')
ok(mk().calendar({ dueAt: '2099-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z' }).ok === true, 'a FUTURE dueAt with the same ISO at passes (the comparison really runs both ways)')
// CAVEAT (reported to the Lead, NOT fixed here — kernel/compliance.js is outside this task's write scope):
//   calendar({ dueAt: 0, at: 1000 }) currently returns ok=true, because a NUMERIC at is stringified and
//   Date.parse('1000') = -30610224000000 (year 1000) — finite, so the numeric branch compares 0 < year-1000
//   ⇒ false. A numeric `at` is therefore silently mis-read; the fix belongs in kernel/compliance.js.

// task-230: a NUMERIC instant must be epoch-ms on BOTH sides of the comparison. The trap for the next reader:
//   String(1000) = '1000', and Date.parse('1000') = -30610224000000 — the YEAR 1000, not NaN — so the old code
//   compared 0 < year-1000 ⇒ false ⇒ SILENTLY PASSED. Numbers are never stringified before comparing now.
refuses(() => mk().calendar({ dueAt: 0, at: 1000 }), 'VMU_COMPLIANCE_CALENDAR_MISSED', null, 'NUMERIC at: {dueAt:0, at:1000} is OVERDUE by name (before the fix it passed silently)')
try {
  mk().calendar({ dueAt: 0, at: 1000 })
  ok(false, 'numeric-at overdue must be refused (unreachable)')
} catch (e) {
  ok(String(e.message).includes('0') && String(e.message).includes('1000'), 'the numeric-at refusal NAMES the due epoch and now: ' + JSON.stringify(e.message))
  ok(e.dueMs === 0 && e.whenMs === 1000, 'the refusal carries the COMPARED numbers (dueMs=0, whenMs=1000) so the judgement is auditable')
}
ok(mk().calendar({ dueAt: 2000, at: 1000 }).ok === true, 'NUMERIC at: {dueAt:2000, at:1000} is NOT yet due ⇒ passes (the comparison runs both ways)')
refuses(() => mk().calendar({ at: 1000 }), 'VMU_INVALID_ARGUMENT', null, 'NUMERIC at + MISSING dueAt ⇒ the other named refusal (needs { dueAt }) — distinguishable from overdue')
ok(mk().calendar({ dueAt: 1000, at: 1000 }).ok === true, 'due exactly now (dueMs === whenMs) is NOT overdue (strict <, no off-by-one)')
// ISO must not regress: the same three shapes with ISO strings
refuses(() => mk().calendar({ dueAt: '1970-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z' }), 'VMU_COMPLIANCE_CALENDAR_MISSED', null, 'ISO dueAt in 1970 + ISO at in 2026 ⇒ overdue (the original shape still works)')
ok(mk().calendar({ dueAt: '2099-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z' }).ok === true, 'ISO future dueAt ⇒ passes (no regression)')

// ── task-231: the instant→ms rule now has ONE shared implementation (kernel/timevalue.js), and both faces
// must judge the SAME input the SAME way. The trap the helper documents: Date.parse('1000') is the YEAR 1000
// (-30610224000000) and NOT NaN, so a number must be handled as a number before any stringification.
{
  const { ms } = await import('../vibe-math-vmu/kernel/timevalue.js')
  const { createDomainGate } = await import('../vibe-math-vmu/kernel/domaingate.js')
  ok(typeof ms === 'function' && ms(0) === 0 && ms(1000) === 1000, 'shared ms(): a finite NUMBER is epoch-ms (0 included)')
  ok(ms('1970-01-01T00:00:00.000Z') === 0 && ms(1000) === 1000, 'shared ms(): ISO strings and numbers agree on the same instant')
  ok(!Number.isNaN(ms('1000')) && ms('1000') === Date.parse('1000') && ms('1000') !== 1000, 'the bare-year trap is SILENT: ms("1000") = year 1000, not NaN and not 1000')
  ok(Number.isNaN(ms('nope')) && Number.isNaN(ms(NaN)), 'unparseable input ⇒ NaN (never a throw, never a guess)')
  ok(ms(0) < ms(1000) === true, 'the shared rule orders the two instants (0 before 1000)')
  // CROSS-FACE: the same pair {0, 1000} must read as "0 is in the past" in BOTH faces.
  const mine = (() => { try { mk().calendar({ dueAt: 0, at: 1000 }); return null } catch (e) { return e.code } })()
  const dg = createDomainGate({ clock: () => 1000, settings: {} })
  const theirs = (() => { try { dg.review({ protocolId: 'p-231', approvedAt: 0, expiresAt: 0, at: 1000 }); return null } catch (e) { return e.code } })()
  ok(mine === 'VMU_COMPLIANCE_CALENDAR_MISSED', 'compliance: dueAt 0 with now 1000 ⇒ OVERDUE (0 is a past instant)')
  ok(theirs === 'VMU_IACUC_EXPIRED', 'domaingate: expiresAt 0 with now 1000 ⇒ EXPIRED (the same reading of the same instants)')
  ok(mine !== null && theirs !== null, 'CROSS-FACE CONSISTENCY: both faces (sharing ms()) treat 0 as a past instant, each with its own named code')
}

// task-238 (the FIFTEENTH case): an UNINTERPRETABLE instant is a NAMED refusal in every face. This face used
// to return ok:true for `dueAt: 'nope'` and the deadline was silently lost. The refusal must name the RECEIVED
// value and the EXPECTED shape; the valid 0 / ISO / missing paths must not regress (asserted above).
{
  const grab = (fn) => { try { fn(); return null } catch (e) { return e } }
  const badDue = grab(() => mk().calendar({ dueAt: 'nope', at: '2026-01-01T00:00:00.000Z' }))
  ok(!!badDue && badDue.code === 'VMU_INVALID_ARGUMENT', 'unparseable `dueAt` ⇒ NAMED refusal (never ok:true)')
  ok(!!badDue && String(badDue.message).includes('nope'), 'the refusal NAMES the received value')
  ok(!!badDue && /ISO timestamp|epoch-ms/.test(String(badDue.message)), 'the refusal states the EXPECTED shape')
  const badAt = grab(() => mk().calendar({ dueAt: 0, at: 'nope' }))
  ok(!!badAt && badAt.code === 'VMU_INVALID_ARGUMENT' && String(badAt.message).includes('`at`'), 'unparseable `at` ⇒ named refusal (the comparison would be meaningless)')
  ok(mk().calendar({ dueAt: '2099-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z' }).ok === true, 'control: valid ISO instants still pass (no regression)')
}

console.log('')
console.log('=== VMU COMPLIANCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
