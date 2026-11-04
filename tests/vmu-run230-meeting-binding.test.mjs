// tests/vmu-run230-meeting-binding.test.mjs — RUN 230 / task-19 (E12): 回合与会议的绑定，以及交付接缝。
//
// 验收文件是 `docs/acceptance/sim-audit-decisions.md` §6 的 19 行。它量到的缺陷是：一个成员回合被派出去时**没有**
// 会议绑定（提示词里没有「这一轮属于哪场会」），成员交回的 `say` 因此在派发时被 skip 成
// `reason:"no-meeting-bound"` —— 回执把「调用方没绑」写成了「成员说的没处放」。这条链上有四个断点，本套件逐个在
// FACE 层读回（回执说 executed:1 只证明派发器相信自己）：
//   ① drive/step 派回合时把 meeting 记在回合、parked prompt 与 pending 条目上，回执可见（awaiting:true + memberPrompt.meeting）；
//   ② reply 带显式 meeting：接受；与停着那回合的会不一致 ⇒ 具名拒 VMU_TURN_REPLY_CONFLICT（hint 点名停着哪场会）；
//      省略 ⇒ 继承停着那回合的会（回执写明来源，不让人猜）；
//   ③ 回复落地后会议面真的收到 { meeting, member, text }，且 skippedDetail 里不再出现 no-meeting-bound；
//      围栏 JSON 顶层的 `meeting` 是保留键（不再被当成未知回复字段拒掉）；
//   ④ 交付接缝：kernel 选项 deliverTurn / host.effects.deliverTurn / settings 的 caller 模式都能让 drive 真跑，
//      status().seams 分别报出来源；没有任何接缝时仍是原文 VMU_ENGINE_UNAVAILABLE（旧文本不许被这轮改掉）。
//
// Run: node tests/vmu-run230-meeting-binding.test.mjs   (last line: === VMU RUN230 MEETING BINDING: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 500) + ']')) }
}
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

// 会议面是记录用的 FAKE：要读的是「到了什么」，不是回执自称什么。
const makeFaces = () => {
  const spoken = []
  const faces = facesFrom({
    meetings: {
      speak: async (payload) => { spoken.push(payload); return { ok: true, at: spoken.length } },
      status: async () => ({ ok: true, meeting: null }),
    },
  })
  return { faces, spoken }
}
const makeGov = (extra = {}) => {
  const { faces, spoken } = makeFaces()
  const gov = createTurnOrchestrator(Object.assign({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: deliverByReturning() }, extra))
  return { gov, spoken }
}
const codeOf = (e) => (e && (e.code || (e.refusal && e.refusal.code))) || null
const catchCode = async (fn) => { try { await fn(); return null } catch (e) { return codeOf(e) || String((e && e.message) || e) } }

console.log('=== VMU RUN230 MEETING BINDING ===')

// ── ① drive/step 派回合时绑定会议：回执把 meeting 交回给调用方 ─────────────────────────────────────────
{
  const { gov } = makeGov()
  const d = await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  ok(d.ok === true && d.awaiting === true, '①a drive parks a meeting turn (awaiting:true)', d)
  ok(!!d.memberPrompt && d.memberPrompt.meeting === 'm1', '①b ★★★ the parked prompt CARRIES the meeting (the member is told which meeting it is answering in)', d.memberPrompt)
  ok(!!d.memberPrompt && typeof d.memberPrompt.turnId === 'string' && d.memberPrompt.turnId !== '',
    '①c ★ and the prompt still names its turn (the binding did not replace the identity)', d.memberPrompt)
  ok(d.meeting === 'm1', '①d the drive reading names the same meeting (not only the nested prompt)', d.meeting)
  ok(d.deliveryPath === 'caller', '①e ★ the receipt names the delivery path (caller: the caller plays the member)', d.deliveryPath)
}
{
  // 第二个派发读回「调用方手里还握着的那一个未答 prompt」：pending 条目上也要有会议，否则
  // 「我手里的那个回合属于哪场会」答不出来（而这一步的 receipt 正是交回 prompt 的地方）。
  const { gov } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm2' })
  const s = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting', why: '开会', meeting: 'm2' })
  ok(s.ok === true && s.awaiting === true, '①f step parks a meeting turn too', s)
  ok(s.memberPrompt && s.memberPrompt.meeting === 'm2', '①g ★★ the step prompt carries the meeting', s.memberPrompt)
  ok(!!s.pending && s.pending.meeting === 'm2' && s.pending.member === 'm1',
    '①h ★★★ the pending entry names the meeting as well (a held prompt you cannot place in a meeting is not a reading)',
    { pending: s.pending, memberPrompt: s.memberPrompt })
}

// ── ② 显式 meeting：接受；冲突具名拒；省略继承 ────────────────────────────────────────────────────────
{
  const { gov, spoken } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  const rec = await gov.supplyStructuredReply({ say: '我在会上说的一句话' }, { forMember: 'm1' })
  ok(rec.ok === true && rec.accepted === true, '②a an inherited report is accepted', rec)
  ok(rec.meeting === 'm1', '②b ★★★ omitting `meeting` INHERITS the parked turn binding', rec.meeting)
  ok(rec.meetingSource === 'inherited-from-parked-turn', '②c ★★ and the receipt names the SOURCE of the binding (explicit vs inherited)', rec)
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  ok(step2.ok === true && step2.receipt && step2.receipt.executed === 1, '②d the held turn completes with one executed field', step2.receipt && step2.receipt.executed)
  const skipped = (step2.receipt && step2.receipt.skippedDetail) || []
  ok(!skipped.some((s) => s && s.reason === 'no-meeting-bound'),
    '②e ★★★ NO no-meeting-bound skip on a bound turn (the defect line from the audit)', skipped)
  ok(spoken.length === 1 && spoken[0].meeting === 'm1' && spoken[0].member === 'm1' && spoken[0].text === '我在会上说的一句话',
    '②f ★★★ the meetings face received the member speech in that meeting', spoken)
}
{
  const { gov } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  // The kernel refuses by THROWING a refusal (the tool face turns it into ok:false); read the refusal itself, not a
  // normalized return, because a test that only reads ok:false cannot see WHICH named code was used.
  let refusal = null
  try { await gov.supplyStructuredReply({ say: '在另一场会里说' }, { forMember: 'm1', meeting: 'm2' }) } catch (e) { refusal = e }
  ok(!!refusal && refusal.code === 'VMU_TURN_REPLY_CONFLICT',
    '②g ★★★ a report bound to a different meeting is refused BY NAME', refusal)
  ok(String((refusal && refusal.message) || '').includes('m1') && String((refusal && refusal.hint) || '').includes('m1'),
    '②h ★★★ and both message and hint NAME the meeting the parked turn belongs to (a reader can fix it without guessing)', refusal)
}
{
  const { gov } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  const rec = await gov.supplyStructuredReply({ say: '显式同一场会' }, { forMember: 'm1', meeting: 'm1' })
  ok(rec.ok === true && rec.meeting === 'm1' && rec.meetingSource === 'explicit',
    '②i an explicit meeting equal to the parked turn is accepted and named `explicit`', rec)
}

// ── ③ 围栏 JSON 顶层 meeting 是保留键；回复落地后 speak 真派发 ─────────────────────────────────────────
{
  const { gov, spoken } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  const supplied = await gov.supplyMemberReply(fence({ meeting: 'm1', say: '围栏里的发言' }), 'm1')
  ok(supplied.ok === true, '③a the fenced reply is supplied to the parked turn', supplied)
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  ok(step2.ok === true && step2.receipt && step2.receipt.executed === 1,
    '③b ★★★ a fenced reply carrying meeting at the top level is NOT refused as an unknown field (reserved key)', { receipt: step2.receipt })
  const skipped = (step2.receipt && step2.receipt.skippedDetail) || []
  ok(!skipped.some((s) => s && s.reason === 'no-meeting-bound'), '③c ★★★ and it is not skipped as unbound', skipped)
  ok(spoken.length === 1 && spoken[0].meeting === 'm1' && spoken[0].text === '围栏里的发言',
    '③d ★★★ the speech landed in the meeting named by the reply envelope', spoken)
}
{
  // 围栏里的 meeting 与停着那回合的会不一致：同一个冲突，同一族码（不许悄悄改用其中一个）。
  const { gov } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会', meeting: 'm1' })
  await gov.supplyMemberReply(fence({ meeting: 'm2', say: '串会的发言' }), 'm1')
  let out = null
  try { out = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' }) } catch (e) { out = { ok: false, code: codeOf(e) } }
  ok(out && out.ok === false && out.code === 'VMU_TURN_REPLY_CONFLICT',
    '③e ★★★ a fenced reply naming another meeting is refused by the same named code', out && { code: out.code, message: out.message })
}
{
  // 未绑定回合（旧路径）必须保持旧行为：不派发、句子留在回执 notes 里 —— 这轮不许把它改悄悄。
  const { gov, spoken } = makeGov()
  await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: '开会' })
  const rec = await gov.supplyStructuredReply({ say: '没有会议绑定' }, { forMember: 'm1' })
  ok(rec.ok === true && rec.meeting === null, '③f an unbound parked turn keeps meeting:null', rec)
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'meeting' })
  ok(spoken.length === 0, '③g ★ unbound speech still does NOT reach the meetings face', spoken)
  const notes = (step2.receipt && step2.receipt.notes) || []
  ok(notes.some((n) => n && n.field === 'say' && n.text === '没有会议绑定'),
    '③h ★★ and the sentence is KEPT on the receipt (no silent drop on the old path)', notes)
}

// ── ④ 交付接缝：三条声明来源 + status 分报 + 无接缝旧文本 ─────────────────────────────────────────────
{
  const seam = async ({ turn, text }) => ({ reply: null, awaiting: true, memberPrompt: { member: turn.member, turnId: turn.id, text: String(text).slice(0, 40), meeting: turn.meeting || null }, childId: null, stopReason: null, deliveryPath: 'fake-host' })
  const k1 = createKernel({ host: { effects: { deliverTurn: seam } }, settings: {} })
  const d1 = await k1.turn.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', meeting: 'm1' })
  ok(d1.ok === true && d1.awaiting === true, '④a ★★★ host.effects.deliverTurn lets the DEFAULT (subagents) mode drive a round', d1)
  ok(typeof d1.deliveryPath === 'string' && d1.deliveryPath !== '', '④b ★★★ and the loop receipt names the delivery path (a parked round is played by the caller side)', { deliveryPath: d1.deliveryPath, delivery: d1.delivery })
  ok(!!d1.memberPrompt && d1.memberPrompt.meeting === 'm1', '④c the injected seam still receives the bound turn', d1.memberPrompt)
  const seams1 = k1.status().seams
  ok(seams1.turnDeliver === true && seams1.turnDeliverSource === 'host.effects.deliverTurn',
    '④d ★★ status().seams reports the SOURCE of the seam (not a boolean guess)', seams1)

  const k2 = createKernel({ deliverTurn: seam, host: { effects: { deliverTurn: seam } }, settings: {} })
  ok(k2.status().seams.turnDeliverSource === 'kernel-deliverTurn',
    '④e ★★★ the kernel option WINS over host.effects (declared precedence, resolved once)', k2.status().seams)

  const k3 = createKernel({ settings: { 'vmu.turn.deliverMode': 'caller' } })
  ok(k3.status().seams.turnDeliverSource === 'settings.deliverMode=caller',
    '④f ★★ vmu.turn.deliverMode=caller builds the caller seam for the loop itself', k3.status().seams)
  const d3 = await k3.turn.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', meeting: 'm1' })
  ok(d3.ok === true && d3.awaiting === true && d3.memberPrompt && d3.memberPrompt.meeting === 'm1',
    '④g ★★★ and that caller route really parks a bound turn (the mode alone used to be refused)', d3)

  const k4 = createKernel({ settings: {} })
  const d4 = await k4.turn.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting' })
  const refused = (d4.receipts && d4.receipts[0]) || {}
  ok(refused.code === 'VMU_ENGINE_UNAVAILABLE' && d4.roundsRun === 0,
    '④h ★★ with NO seam the loop keeps its original refusal (a capability without its seam is refused by name)', { code: refused.code, roundsRun: d4.roundsRun })
  ok(k4.status().seams.turnDeliverSource === null && typeof k4.status().seams.turnDeliverNote === 'string',
    '④i and status says so (no seam, with a note naming how to inject one)', k4.status().seams)
}
{
  // ★ 「delegated 路径真的跑过」：注入一个**替成员作答的**接缝（成员在一个独立会话里回答，不是调用方扮演），
  // 这条路上 meeting 只能来自回合本身（没有 parked prompt 可继承）——绑定必须一路活到派发。
  const { gov, spoken } = makeGov({ deliver: async ({ turn }) => fence({ say: '代理成员的发言', meeting: turn.meeting }) })
  const d = await gov.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', meeting: 'm1' })
  ok(d.ok === true && d.roundsRun === 1 && !d.awaiting, '④j ★★★ an injected delivering seam settles the round (the delegated path really ran, not parked)', { ok: d.ok, awaiting: d.awaiting, roundsRun: d.roundsRun })
  const r0 = (d.receipts && d.receipts[0]) || {}
  ok(r0.executed === 1 && !((r0.skippedDetail || []).some((s) => s && s.reason === 'no-meeting-bound')),
    '④k ★★★ and the member speech dispatched in the bound meeting (no no-meeting-bound skip)', r0)
  ok(spoken.length === 1 && spoken[0].meeting === 'm1' && spoken[0].member === 'm1' && spoken[0].text === '代理成员的发言',
    '④l ★★★ the meetings face received the DELEGATED member speech in that meeting', spoken)
}

// ── ⑤ 源码接线：四处同时存在，缺一处这套机制就是「声明了却不生效」 ─────────────────────────────────────
{
  const turnSrc = readFileSync(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const kernelSrc = readFileSync(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const toolSrc = readFileSync(join(HERE, '..', 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
  ok(turnSrc.includes('const normalizeMeetingId = '), '⑤a the turn module normalizes the meeting id in one place')
  ok(turnSrc.includes('meeting: normalizeMeetingId(meeting)'),
    '⑤b ★★ open() puts the binding on the TURN object (where every later reading finds it)')
  ok(turnSrc.includes('meeting: turn && typeof turn.meeting === \'string\'') && turnSrc.includes('const answeredMeeting = pendingPrompt && pendingPrompt.meeting'),
    '⑤c ★★★ deliverByReturning carries the binding onto the parked prompt AND rides it back on the answer envelope (this is the pair the audit measured missing)')
  ok(turnSrc.includes('VMU_TURN_REPLY_CONFLICT') && turnSrc.includes('meetingSource:'),
    '⑤d ★★ the binding conflict is refused by name and the inheritance is reported')
  ok(kernelSrc.includes('hostEffectsDeliverTurn || hostDeliverTurn || settingsDeliverTurn'),
    '⑤e ★★★ the kernel resolves the seam by the declared precedence chain, not by a single host probe')
  ok(kernelSrc.includes("turnDeliverSource"), '⑤f ★★ and reports which rung it used')
  ok(toolSrc.includes('meeting: forMeetingArg'),
    '⑤g ★★ the tool surface forwards the binding on step/drive (a parameter with a consumer)')
}

console.log('')
if (failed) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
console.log('=== VMU RUN230 MEETING BINDING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
