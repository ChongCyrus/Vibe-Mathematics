// vmu reportfeedback delivery — PHASE 9 / new goal round 2.
// Two declared guards were never called by the delivery path: assertFiniteOrder (host does not validate context order)
// and boundFeedback (truncation must SAY SO). These tests exercise BOTH directions and pin the read points so they
// cannot silently become declarations again.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const m = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'reportfeedbackdelivery.js')).href)

let passed = 0, failed = 0
const ok = (cond, name, detail) => { if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) } }
const mkHost = () => {
  const calls = []
  const host = { context: (o) => { calls.push(o); return () => {} } }
  return { calls, ctx: { get: (name) => (name === 'systemPrompt' ? host : null) } }
}

// ── 1. positive: finite order + short feedback ⇒ delivered, NOT truncated ───────────────────────────────
{
  const h = mkHost()
  const out = await m.deliverReportFeedback({ ctx: h.ctx, effect: (fn) => fn(), enabled: true, audience: 'office', order: 5000 })
  ok(out.delivered === true && out.registered === true && out.truncated === false && out.deliveredBytes === out.originalBytes,
    '★ 正：order 有限 + 短文本 ⇒ 正常投递且 truncated:false', { delivered: out.delivered, truncated: out.truncated, bytes: out.deliveredBytes })
  ok(h.calls.length === 1 && h.calls[0].order === 5000 && /delivery notice/.test(h.calls[0].text),
    '★ 正：guard 通过后，host.context 真的被调用一次，order 就是传入的 5000', h.calls[0] && { order: h.calls[0].order })
}

// ── 2. reverse: non-finite order ⇒ named refusal, host NEVER called ─────────────────────────────────────
{
  const h = mkHost()
  const out = await m.deliverReportFeedback({ ctx: h.ctx, effect: (fn) => fn(), enabled: true, audience: 'office', order: Infinity })
  ok(out.delivered === false && out.code === 'VMU_MIDDLEWARE_FAILED' && out.what === 'report.feedback.order' &&
    /finite/.test(String(out.reason)) && h.calls.length === 0,
    '★ 反：order 非有限 ⇒ 具名 VMU_MIDDLEWARE_FAILED（guard 自己的码），且 host.context 0 次调用', { out, calls: h.calls.length })
}

// ── 3. overlong feedback ⇒ truncation is stated in BOTH text and receipt ────────────────────────────────
{
  const h = mkHost()
  const longText = 'x'.repeat(70000)
  const out = await m.deliverReportFeedback({ ctx: h.ctx, effect: (fn) => fn(), enabled: true, audience: 'office', feedbackText: longText })
  ok(out.delivered === true && out.truncated === true && out.originalBytes === 70000 && out.deliveredBytes === out.maxBytes &&
    out.deliveredBytes < out.originalBytes,
    '★ 正：超长 feedback ⇒ 回执带 truncated:true + 原长/截断后长/maxBytes', { truncated: out.truncated, originalBytes: out.originalBytes, deliveredBytes: out.deliveredBytes, maxBytes: out.maxBytes })
  ok(h.calls.length === 1 && /vmu feedback truncated: original 70000 bytes/.test(h.calls[0].text),
    '★ 正：被投递的文本自己写明“已截断”，不把短文本冒充完整', h.calls[0] && h.calls[0].text.slice(-160))
}

// ── 4. both guards have READ POINTS in the delivery source (red line 4: no declaration without a consumer) ─
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'reportfeedbackdelivery.js'), 'utf8')
  ok((src.match(/assertFiniteOrder/g) || []).length >= 2, '★ 守卫读点：reportfeedbackdelivery.js 调用 assertFiniteOrder（≥1 读点）', (src.match(/assertFiniteOrder/g) || []).length)
  ok((src.match(/boundFeedback/g) || []).length >= 2, '★ 守卫读点：reportfeedbackdelivery.js 调用 boundFeedback（≥1 读点）', (src.match(/boundFeedback/g) || []).length)
}

console.log('=== VMU REPORTFEEDBACK DELIVERY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
