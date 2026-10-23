// tests/vmu-host-refusal-attribution.test.mjs — ROUND 52: a thrown refusal must keep its ATTRIBUTION when the host
// turns it into a tool spec.
//
// ★ THE DEFECT THIS FILE PINS DOWN (measured, not assumed): `toHostSpec`'s error branch returned exactly
// `{ok:false, code, message, hint}`. Everything else on the error object — `enforced` (WHICH settings keys produced the
// decision), `enforcedScope`, `settingValues` — was silently DROPPED. The success branch goes through
// `boundedToolResult`, so a success receipt and a refusal receipt were not even the same species.
//
// ★ WHY IT MATTERS MORE THAN A MISSING FIELD: the two idiomatic ways of refusing (throw, or return `{ok:false,...}`)
// were NOT equivalent through the host. A pack author who threw got a receipt that could not answer "which keys refused
// this call" — the exact question docs/03 promises the receipt answers. That asymmetry is what pushed v5r's gate
// refusals into the returned-receipt shape (`packs/v5r/tools.js`: `gateRefuse`). With attribution preserved, both
// shapes carry the same facts and the choice becomes style, not necessity.
//
// Rule enforced here: a field is preserved WHEN THE ERROR CARRIES IT, and NOT INVENTED when it does not (no `null`,
// no empty array) — a receipt that prints `enforced: []` for a refusal that never consulted a setting is a false claim.

import { toHostSpec } from '../vibe-math-vmu/host.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

function refusalSpec(errFactory) {
  return toHostSpec({
    name: 'vibe_test_refusal', description: 'test-only face', parameters: {},
    run: async () => { throw errFactory() },
  })
}
function successSpec(payload) {
  return toHostSpec({
    name: 'vibe_test_success', description: 'test-only face', parameters: {},
    run: async () => payload,
  })
}
const parse = (s) => (typeof s === 'string' ? JSON.parse(s) : s)
function deny(code, message, extra) {
  const e = new Error(message)
  e.code = code
  e.hint = 'a test hint'
  for (const k of Object.keys(extra || {})) e[k] = extra[k]
  return e
}

console.log('=== VMU HOST REFUSAL ATTRIBUTION ===')

// ① 先红的那条：enforced / enforcedScope / settingValues 必须在宿主 spec 里活着。
{
  const spec = refusalSpec(() => deny('VMU_TEST_ENFORCED', 'the setting refused this call', {
    enforced: ['vmu.test.alpha', 'vmu.test.beta'], enforcedScope: 'evaluated-so-far', settingValues: { 'vmu.test.alpha': 7 },
  }))
  const receipt = parse(await spec.execute({}, {}))
  ok(receipt && receipt.ok === false && receipt.code === 'VMU_TEST_ENFORCED',
    '★ 正：被拒时宿主仍把 code/message/hint 交回调用方', receipt && { ok: receipt.ok, code: receipt.code })
  ok(Array.isArray(receipt.enforced) && JSON.stringify(receipt.enforced) === JSON.stringify(['vmu.test.alpha', 'vmu.test.beta']),
    '★★★ 正：宿主保留了 `enforced`（拒绝读了哪些键）——这正是 docs/03 承诺可观测的那一项', receipt && receipt.enforced)
  ok(receipt.enforcedScope === 'evaluated-so-far',
    '★★ 正：宿主保留了 `enforcedScope`（判到哪一步），不是拿默认值补齐的', receipt && receipt.enforcedScope)
  ok(receipt.settingValues && receipt.settingValues['vmu.test.alpha'] === 7,
    '★★ 正：宿主保留了 `settingValues` 里被读到的值（可复核，不是只有键名）', receipt && receipt.settingValues)
  ok(receipt.receiptMeta && receipt.receiptMeta.truncated === false,
    '★★ 正：拒绝回执与成功回执是同一物种（都带 receiptMeta），不是裸 JSON', receipt && receipt.receiptMeta)
}

// ② 不发明：没有归属字段的拒绝，回执里就没有这些键（不能有 `enforced: []` 这种“我查过了”的假声明）。
{
  const spec = refusalSpec(() => deny('VMU_TEST_PLAIN', 'nothing was consulted'))
  const receipt = parse(await spec.execute({}, {}))
  ok(receipt && receipt.ok === false && receipt.code === 'VMU_TEST_PLAIN', '正：普通拒绝照旧交回', receipt && receipt.code)
  ok(!('enforced' in receipt) && !('enforcedScope' in receipt) && !('settingValues' in receipt),
    '★★★ 反：不读设置的拒绝**不**带 enforced/enforcedScope/settingValues（不编造空数组假装查过）',
    { keys: Object.keys(receipt || {}) })
}

// ③ 空数组是“查过、但一个键都不强制”的合法事实，必须原样保留（不能当成 falsy 丢掉）。
{
  const spec = refusalSpec(() => deny('VMU_TEST_EMPTY', 'a pure predicate refused', { enforced: [], enforcedScope: 'evaluated-so-far' }))
  const receipt = parse(await spec.execute({}, {}))
  ok(Array.isArray(receipt.enforced) && receipt.enforced.length === 0 && receipt.enforcedScope === 'evaluated-so-far',
    '★★ 正：`enforced: []` 原样保留（纯谓词的诚实归属），不当 falsy 丢弃', { enforced: receipt.enforced, scope: receipt.enforcedScope })
}

// ④ 不夹带：`enforced` 不是数组时不当成归属事实透传（回执里宁可没有这一项）。
{
  const spec = refusalSpec(() => deny('VMU_TEST_GARBAGE', 'garbage attribution', { enforced: 'vmu.test.alpha' }))
  const receipt = parse(await spec.execute({}, {}))
  ok(!('enforced' in receipt), '★★ 反：非数组的 `enforced` 不透传（拒绝归因必须是可枚举的键名清单）', receipt.enforced)
}

// ⑤ 成功路径不受影响（同一序列化口径，带 receiptMeta）。
{
  const spec = successSpec({ ok: true, tool: 'vibe_test_success', payload: 'x' })
  const receipt = parse(await spec.execute({}, {}))
  ok(receipt && receipt.ok === true && receipt.receiptMeta && receipt.receiptMeta.truncated === false,
    '正：成功回执仍带 receiptMeta（本次改动没有动成功路径的形状）', receipt && receipt.receiptMeta)
}

console.log('=== VMU HOST REFUSAL ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
