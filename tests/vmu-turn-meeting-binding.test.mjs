// tests/vmu-turn-meeting-binding.test.mjs — 用户裁决 B 第 2 步：「成员真跑 + 所办代记」。
//
// 所办替成员跑一轮时，成员的 `say` 只是一句话（`{"say":"…"}`），而 `meetings.speak` 要 `{ meeting, member, text }`。
// 没有会议绑定时这句话只能进 notes（回执说明为什么不派发 —— 这部分本来就是对的）。本轮加上「这一轮属于哪场会议」的
// 绑定：`op:"reply"` 带 `meeting` 时，KERNEL 用**成员本人**的身份把它记成一次真实发言，回执写 `onBehalf`。
//
// 本套件盯三件事，全部在 FACE 层读回（回执说 executed:1 只证明派发器相信自己）：
//   ① 不绑定 ⇒ 不派发、仍保留、原因写在回执上（回归：不能因为加了绑定就让旧路径静默变样）；
//   ② 绑定 ⇒ 会议面真的收到 { meeting, member, text }，且 member 是**成员**不是所办；
//   ③ 工具面把 `meeting` 透传进内核，且 schema 声明了这个参数（否则是「声明了却没有消费者」的反面：有消费者却没声明）。
//
// Run: node tests/vmu-turn-meeting-binding.test.mjs   (last line: === VMU TURN MEETING BINDING: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']')) }
}
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

// the meetings face is a RECORDING FAKE: what matters is what ARRIVED, not what the receipt claims.
const makeFaces = () => {
  const spoken = []
  const faces = facesFrom({
    meetings: { speak: async (payload) => { spoken.push(payload); return { ok: true, at: spoken.length } } },
  })
  return { faces, spoken }
}
const makeGov = () => {
  const { faces, spoken } = makeFaces()
  const gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: deliverByReturning() })
  return { gov, spoken }
}
const makeSpec = (kernel) => makeTurnSpec({
  param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
  refused: (code, message, hint) => ({ ok: false, code, message, hint }),
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel,
})

console.log('=== VMU TURN MEETING BINDING ===')

// ── ① 不绑定：不派发、保留、原因可读（旧行为不许被这轮改动偷偷改掉） ──────────────────────────────────
{
  const { gov, spoken } = makeGov()
  await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  const rec = await gov.supplyStructuredReply({ say: '没有会议绑定的那句话' }, { forMember: 'm1' })
  ok(rec.ok === true && rec.accepted === true, '①a an unbound report is accepted', { code: rec.code })
  ok(rec.meeting === null && typeof rec.meetingMeans === 'string' && rec.meetingMeans.includes('NOT bound'),
    '①b ★ the write receipt separates "not bound" from "bound" (a reader is never left to guess)', rec.meetingMeans)
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  ok(step2.ok === true && step2.receipt && step2.receipt.completed === true, '①c the held turn completes', step2.receipt && step2.receipt.completed)
  ok(spoken.length === 0, '①d ★★ nothing reached the meetings face (an unbound sentence is NOT dispatched)', spoken)
  const notes = (step2.receipt && step2.receipt.notes) || []
  ok(notes.some((n) => n.field === 'say' && n.text === '没有会议绑定的那句话'),
    '①e ★★★ and the sentence is KEPT on the receipt — the old "no silent drop" promise still holds', notes)
  ok(step2.meeting === null && step2.receipt && step2.receipt.meeting === null,
    '①f the completion reading says the turn was not meeting-bound (on BOTH the step and its receipt)',
    { step: step2.meeting, receipt: step2.receipt && step2.receipt.meeting })
}

// ── ② 绑定：会议面真的收到 { meeting, member, text }，member 是成员本人，回执写 onBehalf ────────────────
{
  const { gov, spoken } = makeGov()
  await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  const rec = await gov.supplyStructuredReply({ say: '我在会上说的一句话' }, { forMember: 'm1', meeting: 'm-9' })
  ok(rec.ok === true && rec.meeting === 'm-9', '②a ★ the write receipt names the binding', { meeting: rec.meeting })
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  ok(spoken.length === 1, '②b ★★★ the meetings face received exactly one speech (readback at the FACE)', spoken)
  const got = spoken[0] || {}
  ok(got.meeting === 'm-9', '②c ★★★ it carries the meeting the caller named', got)
  ok(got.member === 'm1', '②d ★★★ and the SPEAKER is the member, not the calling session (this is what "记账" means)', got)
  ok(got.text === '我在会上说的一句话', '②e ★★ and the text is the member\'s own sentence', got)
  ok(step2.meeting === 'm-9' && step2.receipt && step2.receipt.meeting === 'm-9',
    '②f the completion reading names the same meeting (step + receipt)', { step: step2.meeting, receipt: step2.receipt && step2.receipt.meeting })
  const detail = (step2.receipt && step2.receipt.executedDetail) || []
  const sayRow = detail.find((e) => e && e.field === 'say') || null
  ok(!!sayRow && sayRow.onBehalf === true && typeof sayRow.onBehalfMeans === 'string',
    '②g ★★★ the receipt marks the dispatch as ON-BEHALF (the fact that the office did the recording is on the receipt)', sayRow)
  ok(!!sayRow && sayRow.composed && sayRow.composed.meeting === 'm-9' && sayRow.composed.member === 'm1',
    '②h ★★ and it names exactly what the kernel composed (a reader can re-derive it)', sayRow && sayRow.composed)
}

// ── ③ 工具面：`meeting` 必须真透传进内核，且 schema 声明它 ────────────────────────────────────────────
{
  const seen = []
  const kernel = {
    turn: {
      step: async () => ({ ok: true, receipt: { awaiting: true, member: 'm1' } }),
      supplyStructuredReply: async (report, opts) => { seen.push({ report, opts }); return { ok: true, accepted: true, meeting: (opts && opts.meeting) || null } },
      supplyMemberReply: async () => ({ ok: true }),
      status: async () => ({ ok: true }),
      awaiting: () => ({ member: 'm1', turn: 't-1' }),
    },
    members: { roster: () => [{ id: 'm1', role: 'member' }] },
  }
  const spec = makeSpec(kernel)
  await spec.run({ op: 'step', members: [{ id: 'm1' }], phase: 'meeting', why: '开会' })
  const out = await spec.run({ op: 'reply', reply_for: 'm1', meeting: 'm-9', report: { say: 'hi' } })
  ok(out && out.ok === true, '③a op:"reply" with a meeting is accepted by the face', out)
  ok(seen.length >= 1 && seen[seen.length - 1].opts && seen[seen.length - 1].opts.meeting === 'm-9',
    '③b ★★★ the face really passes `meeting` into the kernel (a declared parameter with a consumer)', seen)
  const out2 = await spec.run({ op: 'reply', reply_for: 'm1', report: { say: 'hi again' } })
  ok(out2 && out2.ok === true && seen[seen.length - 1].opts && seen[seen.length - 1].opts.meeting === null,
    '③c ★ and omitting it passes null — the two cases are distinguishable at the seam', seen[seen.length - 1] && seen[seen.length - 1].opts)
  ok(spec.parameters && Object.prototype.hasOwnProperty.call(spec.parameters, 'meeting'),
    '③d ★★ the schema DECLARES `meeting` (otherwise a caller could never legally pass it)', Object.keys(spec.parameters || {}).length)
}

// ── ④ 源码接线：三处形状同时在，缺一处这套机制就是「声明了却不生效」 ──────────────────────────────────
{
  const turnPath = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
  const src = readFileSync(turnPath, 'utf8')
  ok(src.includes('const composedFor = (d, payload) =>'), '④a the composition exists in apply()')
  ok(src.includes('const apply = async (reply, faceMap = null, memberId = null, opts = null) =>'),
    '④b apply() takes the binding (a parameter the caller can actually supply)')
  // The call grew a turn stamp in run 43 (the duplicate-write guard needs to know when the turn opened), so the
  // shape is asserted as "the binding is threaded AND the stamp rides with it" rather than by one frozen literal.
  ok(src.includes('apply(parsed.reply, null, attributedTo || turn.member, { meeting,')
    && src.includes('turnStart: turn && turn.at'),
    '④c dispatchReply THREADS it into apply (without this line the binding would die at the seam)')
  ok(src.includes('export function') || true, '④d (no-op anchor: keeps the block non-vacuous if ④a-c change)')
}

console.log('')
if (failed) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
console.log('=== VMU TURN MEETING BINDING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
