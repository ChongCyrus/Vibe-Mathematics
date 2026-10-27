// tests/vmu-run35-readouts.test.mjs — LIVE RUN 35: TWO READOUTS THE OFFICE COULD NOT READ.
//
// WHAT THE RUN SAID (run 35, the institute's own acceptance brief):
//   F4  three member rounds came back as `fields:[]` / `memberToolCalls:null` / BAD_JSON=14. The members HAD answered -
//       they wrote prose where the reply channel wanted a fenced json object - and the office could not read one word of
//       what they said: "did the muted member speak anyway?" took a grep through the child session log, which is most of
//       what the office's budget went on. A reply we could not parse is not a reply nobody can read.
//   F3  the status board's `[总任务]` line silently switched source (setting -> the board's dependency-free root task)
//       without saying which one fired; the office then reported "the board disagrees with the setting" - a true
//       observation about a reading that would not name its own provenance.
//
// WHAT IS ASSERTED HERE:
//   §1 the RENDERER names the source next to a value, and does NOT change the `该来源未提供：<why>` lines (whose `why`
//      already names what was tried) - so nothing that read the old lines sees a different sentence by accident;
//   §2 the readings themselves still carry one named source per field (the renderer prints what the loop derived);
//   §3 a reply that could not be parsed leaves a BOUNDED RECORD of the member's own words in `counts.replyParseFailedLast`
//      (reachable through `vibe_vmu_turn {op:"status"}`), and the counter/means say it was an ANSWER that failed to parse,
//      not a silent member and not a delivery failure;
//   §4 a reply that DID parse carries the same bounded excerpt on the receipt, next to the fields it produced.
//
// Run: node tests/vmu-run35-readouts.test.mjs        Last line: === VMU RUN35 READOUTS: N passed, M failed ===

import {
  renderStatusBoard, statusBoardReadings, STATUS_BOARD_FIELDS,
} from '../vibe-math-vmu/kernel/turn/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  return false
}
const rejects = async (fn) => { try { await fn(); return { caught: false } } catch (e) { return { caught: true, code: e && e.code, message: String(e && e.message || e) } } }
const lineOf = (text, label) => (text.split('\n').find((l) => l.startsWith(label)) || '')

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const faces = { 'vmu.meetings': { speak: async () => ({ ok: true }) } }
const PREFIX = '我先说明：这一步我还没有开始。'

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §1 THE RENDERER: A VALUE SAYS WHERE IT CAME FROM; A GAP KEEPS ITS OWN SENTENCE.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('=== 1. [总任务] NAMES ITS SOURCE, AND THE GAP LINES ARE UNCHANGED ===')
{
  const rendered = renderStatusBoard({
    fields: [
      { key: 'objective', label: '总任务', value: '证明前 n 个奇数之和 = n²', why: null, at: null, source: '设置键 vmu.turn.objective' },
      { key: 'plan', label: '规划', value: '可开工：t-1（r-1）', why: null, at: null, source: '任务板（未完成 1 条）' },
      { key: 'tasks', label: '各任务完成状态', value: null, why: '任务板不可读：没有注入任务面', at: null, source: '任务板' },
      { key: 'current', label: '当前小任务', value: null, why: '该成员在 progress 轨上还没有记录', at: null, source: 'progress 轨' },
    ],
  })
  const objective = lineOf(rendered, '[总任务]')
  ok(objective.includes('证明前 n 个奇数之和 = n²'), '①-1 the value is still printed verbatim', objective)
  ok(objective.includes('（来源：设置键 vmu.turn.objective）'),
    '★★ ①-2 and the line NAMES the source that fired, so "the board disagrees with the setting" is answerable from the line itself', objective)
  ok(lineOf(rendered, '[规划]').includes('（来源：任务板（未完成 1 条））'),
    '①-3 the plan line names its source too (every field, not only the one that bit us)', lineOf(rendered, '[规划]'))
  const tasks = lineOf(rendered, '[各任务完成状态]')
  ok(tasks.includes('该来源未提供：任务板不可读：没有注入任务面'),
    '①-4 a GAP still prints 该来源未提供：<why> - the run-31 contract is untouched', tasks)
  ok(!tasks.includes('（来源：'), '★ ①-5 ... and it does NOT append a source suffix to a line that has no value (that line already names its sources in `why`)', tasks)
  ok(lineOf(rendered, '[当前小任务]').includes('该来源未提供：该成员在 progress 轨上还没有记录'),
    '①-6 the member-specific gap is unchanged as well', lineOf(rendered, '[当前小任务]'))
  const noSource = renderStatusBoard({ fields: [{ key: 'objective', label: '总任务', value: '纯值', why: null, at: null }] })
  ok(lineOf(noSource, '[总任务]') === '[总任务] 纯值',
    '①-7 a value with NO source prints exactly as before (the suffix is not invented)', lineOf(noSource, '[总任务]'))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §2 THE READINGS: THE RENDERER PRINTS WHAT THE LOOP DERIVED, AND EVERY FIELD HAS ONE NAMED SOURCE.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== 2. THE FOUR READINGS EACH CARRY ONE NAMED SOURCE (the renderer prints, it does not guess) ===')
{
  const tasks = [
    { id: 't-1', title: '证明引理 A', state: 'open', owner: 'r-1', deps: [] },
    { id: 't-2', title: '写论文第 3 节', state: 'assigned', owner: 'r-2', deps: ['t-1'] },
  ]
  const records = [
    { id: 'r-1', track: 'progress', kind: 'progress', owner: 'r-1', title: '第 3 轮：引理 A 前半段', updatedAt: '2026-01-01T00:00:01.000Z' },
    { id: 'r-2', track: 'progress', kind: 'progress', owner: 'r-1', title: '第 4 轮：自然性方块', updatedAt: '2026-01-01T00:00:02.000Z' },
  ]
  const readings = statusBoardReadings({
    settings: { get: (k) => (k === 'vmu.turn.objective' ? '本所本期目标：证明 n²' : null) },
    tasks: { list: () => tasks },
    records: { list: () => records, get: () => null },
    member: 'r-1',
  })
  // ★ the declaration-criterion rule E: a `.length === .length` comparison is VACUOUS when both sides can be empty,
  // and `.every()` on an unbound array is the same hole one line down. Both are bound to a non-empty row list FIRST, so
  // each assertion fails for its own reason rather than passing because there was nothing to check.
  const DECLARED = STATUS_BOARD_FIELDS
  const ROWS = readings && Array.isArray(readings.fields) ? readings.fields : []
  ok(DECLARED.length > 0 && ROWS.length > 0 && ROWS.length === DECLARED.length,
    '②-1 four fields come back, no more and no fewer', ROWS.map((f) => f.key))
  const SOURCED = ROWS.filter((f) => typeof f.source === 'string' && f.source.trim() !== '')
  ok(ROWS.length > 0 && SOURCED.length === ROWS.length,
    '★★ ②-2 every field carries a NAMED source - the renderer can print a provenance it was actually given',
    ROWS.map((f) => [f.key, f.source]))
  const obj = ROWS.find((f) => f.key === 'objective')
  ok(obj && obj.value === '本所本期目标：证明 n²' && obj.source.includes('vmu.turn.objective'),
    '②-3 with the setting set, [总任务] comes from the SETTING and says so (the run-35 ambiguity: the board had a root task to show instead)', obj)
  const rendered = renderStatusBoard(readings)
  ok(lineOf(rendered, '[总任务]').includes(obj.value) && lineOf(rendered, '[总任务]').includes('（来源：'),
    '②-4 so the rendered line carries both the mission and its provenance', lineOf(rendered, '[总任务]'))
  const cur = ROWS.find((f) => f.key === 'current')
  ok(cur && typeof cur.value === 'string' && cur.value.includes('第 4 轮'),
    '②-5 [当前小任务] is the member\'s LATEST progress row (r-2, not r-1)', cur)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §3 A REPLY THAT DID NOT PARSE: THE MEMBER'S OWN WORDS SURVIVE THE REFUSAL.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== 3. AN UNPARSEABLE REPLY LEAVES A BOUNDED RECORD OF WHAT THE MEMBER SAID ===')
let orchestrator = null
{
  const deliver = async () => ({ reply: PREFIX + '请稍等，我会把它写进 progress。', childId: 'child-prose', stopReason: 'completed', deliveryPath: 'activation' })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  orchestrator = t
  const r = await t.step({ members: ['r-1'], why: '要一个围栏 json 里的 say' })
  ok(r && r.ok === false, '③-1 the round is REFUSED with a failure receipt (a reply with no declared shape is still a failed round, not a silent success)', r && r.code)
  ok(r && (r.code === 'VMU_TURN_NO_FENCE' || r.code === 'VMU_TURN_BAD_JSON'),
    '③-2 the refusal is the NAMED parse code (the office can tell it apart from a delivery failure)', r && r.code)
  const st = await t.status()
  const last = st && st.counts && st.counts.replyParseFailedLast
  ok(!!last, '★★★ ③-3 counts.replyParseFailedLast exists after the round (this is the reading run 35 could not produce)', last)
  ok(last && last.replyExcerpt && last.replyExcerpt.includes(PREFIX),
    '★★★ ③-4 it carries the member\'s own text - "it answered in prose" is now readable instead of a grep', last && last.replyExcerpt)
  ok(last && last.replyLength >= PREFIX.length && last.replyExcerpt.length <= 2000,
    '③-5 the excerpt is BOUNDED while the length is the real length (a receipt is not a log file)', last && { len: last.replyLength, excerpt: last.replyExcerpt.length })
  ok(last && last.member === 'r-1' && typeof last.turn === 'string',
    '③-6 the record names the member AND the turn it belongs to (no anonymous failure)', last && { member: last.member, turn: last.turn })
  ok(last && typeof last.means === 'string' && /ANSWERED/.test(last.means) && /not a delivery failure/i.test(last.means),
    '★★ ③-7 the sentence says it was an ANSWER that failed to parse - not a silent member, not a delivery failure', last && last.means)
  ok(st.counts.replyParseFailed >= 1, '③-8 and the counter agrees with the record', st.counts.replyParseFailed)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §4 A REPLY THAT DID PARSE: THE SAME EXCERPT RIDES THE RECEIPT, NEXT TO THE FIELDS IT PRODUCED.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== 4. A PARSED REPLY CARRIES ITS EXCERPT ON THE RECEIPT ===')
{
  const said = '第 5 轮：引理 A 的交换图已完成，下一步补自然性。'
  const deliver = async () => ({ reply: JSON.stringify({ say: said }), childId: 'child-ok', stopReason: 'completed', deliveryPath: 'activation' })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s = await t.step({ members: ['r-2'], why: '要一个围栏 json 里的 say' })
  ok(s && s.ok === true, '④-1 the round completes', s && s.ok)
  ok(s && s.receipt && Array.isArray(s.receipt.fields) && s.receipt.fields.includes('say'),
    '④-2 the parsed field is present, as before', s && s.receipt && s.receipt.fields)
  ok(s && s.receipt && typeof s.receipt.replyExcerpt === 'string' && s.receipt.replyExcerpt.includes(said),
    '★★★ ④-3 AND the office can read the sentence the member actually wrote', s && s.receipt && s.receipt.replyExcerpt)
  ok(s && s.receipt && s.receipt.replyLength >= said.length && s.receipt.replyExcerpt.length <= 2000,
    '④-4 the excerpt is bounded, the length is not', s && s.receipt && { len: s.receipt.replyLength })
  // ★ ROUND 67 / F-57: the sentence no longer says "bounded" in the abstract — a bound that is not declared is a silent
  // cut (live run 66 read a 2,679-character reply and had to notice the cut by eye). It now says whether THIS text is
  // the whole reply (`replyTruncated` false here) and, when it is not, names where the remainder lives. Pin the MEANING,
  // not one wording.
  ok(s && s.receipt && typeof s.receipt.replyExcerptMeans === 'string' && /complete|CUT at/.test(s.receipt.replyExcerptMeans),
    '★ ④-5 and a sentence says what the excerpt is and is not (so it is not mistaken for a log)', s && s.receipt && s.receipt.replyExcerptMeans)
  const st = await t.status()
  ok(!st.counts.replyParseFailedLast || st.counts.replyParseFailed === 0,
    '④-6 a clean round leaves the parse-failure record empty on a fresh orchestrator (the record is per instance)', st.counts)
}

console.log('\n=== VMU RUN35 READOUTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('\nFAILURES:'); for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
void orchestrator
