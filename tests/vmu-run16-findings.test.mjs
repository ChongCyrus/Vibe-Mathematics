// tests/vmu-run16-findings.test.mjs — §107: the two readings the institute's own run-16 report said were missing.
//
// The institute's report (live run 2026-10-25, `full-1025-220054.jsonl`) named two defects of ONE family: the answer
// existed one layer down and did not travel to the receipt an operator actually reads.
//
//   ⑦ 「成员侧工具调用计数在 `step` 回执上均缺位」 — every receipt carried `toolCallsTotal` (which counts THIS kernel's
//      calls, i.e. the office's) and NONE carried the member's own count. Run 15's office read `toolCallsTotal: 0` as
//      「真干活没有发生」 while the child session log held tens of thousands of events. Run 16's office then asked for
//      `memberToolCallsTotal` and found the NAME ABSENT — so a reader still could not tell 「读不到」 from 「0」.
//   ⑨ 「超时回执的 `deliveryPath` / `deliveryPathMeans` 缺失」 — `host-deliver.js:283` sets both on the thrown error,
//      but `stepFailure()` kept only code/message/hint, so the delivery path had to be dug out of
//      `status.deliveryLastFail`.
//
// Run: node tests/vmu-run16-findings.test.mjs   (last line: === VMU RUN 16 FINDINGS: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const mk = (extra = {}) => createTurnOrchestrator({ sectionPolicy: decideSections, prompt: pipeline(), ...extra })
const fence = (obj) => 'prose\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n'

// ① ⑦ — the member-count fields exist on the settled receipt and say 「读不到」 rather than 「0」.
{
  const t = mk({ deliver: async ({ turn }) => fence({ progress: 'x' }) })
  t.open({ member: 'r-1', phase: 'normal', round: 1 })
  const r = await t.step({ members: ['r-1'] })
  ok(r.ok === true, '① the step settles', r && r.code)
  // caller delivery: the member's calls ARE this kernel's calls, so the field says so instead of lying.
  ok(r.memberToolCalls === null, '① `memberToolCalls` is present (null = not readable here, never 0)')
  ok(typeof r.memberToolCallsMeans === 'string' && r.memberToolCallsMeans.length > 40, '① `memberToolCallsMeans` explains what null means', r.memberToolCallsMeans)
  ok('memberToolCallsTotal' in r, '① `memberToolCallsTotal` is a field, not an absence')
  ok(/did not name a path|caller|SEPARATE/.test(String(r.memberToolCallsMeans)), '① the means distinguishes the three cases (caller / child kernel / path not named)', r.memberToolCallsMeans)
  ok('childSessionId' in r && 'childSessionIdMeans' in r, '① the child session id is named (null when the seam reports none)')
  ok(/LIVE RUN 16/.test(SRC) && SRC.includes('memberToolCallsTotal'), '① the source records WHY the field exists')
}

// ② ⑦ — a NOT-NAMED path is described honestly (neither "here" nor "a child kernel").
{
  const t = mk({ deliver: async ({ turn }) => fence({ progress: 'y' }) })
  t.open({ member: 'r-1', phase: 'normal', round: 1 })
  const r = await t.step({ members: ['r-1'] })
  const means = String(r.memberToolCallsMeans || '')
  ok(/did not name a path/.test(means), '② an unnamed path is reported as unknown, not as a child kernel', means)
  ok(!/SEPARATE kernel/.test(means), '② and it does NOT claim a separate kernel', means)
  ok(/null here means NOT READABLE/.test(means), '② while still warning that null is not zero', means)
}

// ③ ⑦ — CALLER delivery (the real seam) names this kernel as the owner of the count.
{
  const caller = deliverByReturning()
  const t = mk({ deliver: caller })
  t.open({ member: 'r-1', phase: 'normal', round: 1 })
  const first = await t.step({ members: ['r-1'] })
  ok(first && first.awaiting === true, '③ caller delivery hands the prompt back (awaiting)', first && Object.keys(first))
  ok(first.memberToolCalls === null && /caller/.test(String(first.memberToolCallsMeans)), "③ the awaiting receipt says the member calls ARE this kernel own", first.memberToolCallsMeans)
}

// ④ ⑨ — a delivery failure carries its delivery path onto the RECEIPT the operator reads.
{
  const boom = new Error('the one-shot delivery for this member turn did not settle within 180000ms')
  boom.code = 'VMU_TURN_DELIVERY_TIMEOUT'
  boom.deliveryPath = 'one-shot'
  boom.deliveryPathMeans = 'this call used the ONE-SHOT path (subagents.start)'
  boom.waitedMs = 180123
  boom.deliveryTimeoutMs = 180000
  boom.roundConsumed = true
  boom.roundCompleted = false
  boom.requestSent = true
  boom.lastPhase = 'awaiting-reply'
  boom.partial = { turnId: 't-1', member: 'r-1', elapsedMs: 180123 }
  const t = mk({ deliver: async () => { throw boom } })
  t.open({ member: 'r-1', phase: 'normal', round: 1 })
  const r = await t.step({ members: ['r-1'] })
  ok(r.ok === false && r.code === 'VMU_TURN_DELIVERY_TIMEOUT', '④ the failure keeps its named code', r && r.code)
  ok(r.deliveryPath === 'one-shot', '④ the failure receipt NAMES the delivery path', r.deliveryPath)
  ok(typeof r.deliveryPathMeans === 'string' && r.deliveryPathMeans.length > 20, '④ and explains what that path excludes', r.deliveryPathMeans)
  ok(r.waitedMs === 180123 && r.deliveryTimeoutMs === 180000, '④ the two windows travel as NUMBERS', { w: r.waitedMs, t: r.deliveryTimeoutMs })
  ok(r.roundConsumed === true && r.roundCompleted === false, '④ the round is reported as consumed-and-not-completed', { c: r.roundConsumed, d: r.roundCompleted })
  ok(r.partial && r.partial.member === 'r-1', '④ the partial block says which child was still owed', r.partial)
}

// ⑤ ⑨ — a failure WITHOUT a delivery seam keeps the old shape (no invented fields).
{
  const plain = new Error('boom')
  plain.code = 'VMU_STATE'
  const t = mk({ deliver: async () => { throw plain } })
  t.open({ member: 'r-1', phase: 'normal', round: 1 })
  const r = await t.step({ members: ['r-1'] })
  ok(r.ok === false && r.code === 'VMU_STATE', '⑤ a seam-less failure still reports its code')
  ok(!('deliveryPath' in r), '⑤ no deliveryPath is invented when the error carried none', Object.keys(r))
  ok(!('waitedMs' in r), '⑤ no window is invented either')
}

// ⑥ the claim is measured, not asserted: the seam really does set these on the thrown error.
{
  const HD = readFileSync(join(HERE, '..', 'vibe-math-vmu', 'host-deliver.js'), 'utf8')
  ok(/err\.deliveryPath = 'one-shot'/.test(HD), '⑥ `host-deliver.js` really sets `deliveryPath` on the thrown error')
  ok(HD.includes('err.deliveryPathMeans'), '⑥ and `deliveryPathMeans`')
  ok(/const failureDelivery =/.test(SRC) && /failureDelivery\.deliveryPath/.test(SRC), '⑥ `stepFailure` really forwards them (the layer that was dropping them)')
}

console.log('')
if (failed > 0) { console.log('FAILURES: ' + failures.join(' | ')) }
console.log('=== VMU RUN 16 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
