// ★★★★★★★ SUBAGENTS-MODE DEFECTS (measured 2026-10-25 on the real machine, `deliverMode:'subagents'`).
//
// The institute's own defect note said, in its words: 「代理实际有在工作，但框架把工作判失败」. Three mechanisms were
// measured in one run and each one threw away a real agent turn:
//
//   1. THE DELIVERY DEADLINE WAS A FAILURE VERDICT. A real member turn settled at 197 913 ms against a 180 000 ms
//      deadline with `receipt:null`, and the turn was reported as VMU_TURN_DELIVERY_TIMEOUT although the child had
//      FINISHED (it had written its Lean file, its proposition card and its progress file).
//   2. A REPORT PLUS UNPARSABLE PROSE FAILED THE TURN. A member answered through the tool channel (`accepted:true,
//      source:"tool"`) and then explained itself in prose quoting `{ op: "reply", … }`; the kernel answered
//      VMU_TURN_BAD_JSON (`replyLength:1122`) - the turn was declared failed while its content was recorded.
//   3. THE RECEIPT COULD NOT SAY WHO EXECUTED THE TURN. `/api/status` reported `lastDelivery:{deliveryPath:"caller"}`
//      for a run that was actually played by the CALLING session, and a subagent-run turn carried no executor field at
//      all, so "did a real child run this?" was unanswerable from the receipt.
//
// WHAT THIS FILE CANNOT PROVE: it drives the bridge with a STUBBED `deliverViaSubagents`, so it proves the deadline/
// harvest logic, the report-vs-prose logic and the receipt shape - not that a host subagent really runs. Only a live run
// says that, and the live run that found these defects is recorded in the ledger (§77).
import { createTurnDeliver } from '../vibe-math-vmu/host-deliver.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

const passed = []
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed.push(label); return }
  failures.push({ label, detail })
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 500)))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const fakeParent = { options: {}, session: { header: {} } }
const ctx = {
  agents: {
    currentInitiator: () => fakeParent,
    get: () => fakeParent,
    list: () => ['root'],
  },
  // the bridge asks the host for the subagents service by name before it does anything else; a stub is enough here
  // because `deliverViaSubagents` itself is injected below (only the bridge's deadline logic is under test)
  // the bridge validates the service's VERBS before it delivers, so the stub carries the three it looks for (the
  // delivery itself is injected: `deliverViaSubagents` below replaces the whole call)
  get: (name) => (name === 'subagents' ? { name: 'subagents-stub', start: () => {}, startActivation: () => {}, startContinuable: () => {} } : null),
}
const turn = { id: 't-1', member: 'member-1', phase: 'normal' }
const SETTINGS = { 'vmu.turn.deliveryTimeoutMs': 150 }

// ── 1. a turn that settles INSIDE the grace window is HARVESTED, not reported as a timeout ───────────────────────
{
  const deliver = createTurnDeliver({
    ctx, settings: SETTINGS, config: { deliverMode: 'subagents' },
    deliverViaSubagents: () => async () => {
      await sleep(260) // past the 150 ms deadline, inside the grace window (150/4 -> clamped to 1000 ms)
      return { reply: { say: '我完成了' }, deliveryPath: 'subagents', childId: 'child-1', stopReason: 'end' }
    },
    deliverByReturning: () => async () => { throw new Error('the caller seam must not run in subagents mode') },
  })
  const out = await deliver(turn, 'prompt text')
  ok(out && out.reply && out.reply.say === '我完成了', '★ the late turn\'s reply is returned (not discarded)', out && out.reply)
  ok(out && out.deliveredLate === true, '★★ and the receipt SAYS it settled late', out && out.deliveredLate)
  ok(out && typeof out.deliveryWaitedMs === 'number' && out.deliveryWaitedMs >= 150, '★★ the waited time travels with it', out && out.deliveryWaitedMs)
  ok(out && out.deliveryDeadlineMs === 150 && out.deliveryGraceMs === 1000, '★ both windows are named (deadline 150, grace 1000)', out && { d: out.deliveryDeadlineMs, g: out.deliveryGraceMs })
  ok(out && typeof out.attribution === 'string' && /HARVESTED/.test(out.attribution), '★★★ the attribution names the harvest, so "late" cannot be read as "timed out"', out && out.attribution)
  ok(out && out.childId === 'child-1', '★ the child that did the work is still named', out && out.childId)
}

// ── 2. a turn that NEVER settles is still reported, and the report names the grace window ────────────────────────
{
  const deliver = createTurnDeliver({
    ctx, settings: SETTINGS, config: { deliverMode: 'subagents' },
    deliverViaSubagents: () => async () => { await sleep(60000); return { reply: {} } },
    deliverByReturning: () => async () => { throw new Error('unused') },
  })
  let caught = null
  try { await deliver(turn, 'prompt text') } catch (e) { caught = e }
  ok(!!caught && caught.code === 'VMU_TURN_DELIVERY_TIMEOUT', '★ a delivery that never settles is still a named refusal', caught && caught.code)
  ok(!!caught && caught.deliveryGraceMs === 1000, '★ and the refusal says the grace window was already spent', caught && caught.deliveryGraceMs)
  ok(!!caught && /\+1000ms grace/.test(String(caught.message)), '★★ the message distinguishes "did not settle in 150" from "did not settle in 150 + grace"', caught && caught.message)
  ok(!!caught && Array.isArray(caught.phases) && /whether the call was entered/.test(String(caught.hint)), '★ the phase record survives (where the turn stood)', caught && caught.hint)
}

// ── 3. the delivery envelope reaches the turn receipt AND the step receipt ──────────────────────────────────────
{
  const pipeline = () => createPromptPipeline({ sections: [{ name: 'p-body', text: '正文', order: 700, kind: 'shared' }], bindings: [], sectionPolicy: decideSections })
  const t = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: pipeline(),
    // the subagents seam answers with an ENVELOPE: a text reply plus who ran it
    deliver: async () => ({ reply: '{"say":"收到"}', deliveryPath: 'subagents', childId: 'child-7', stopReason: 'end', attribution: 'the child returned normally' }),
    faces: {},
    settings: {},
  })
  const stepped = await t.step({ members: ['member-1'], why: 'the receipt must name the executor' })
  const rc = stepped && stepped.receipt
  ok(!!rc, '★ the step produced a receipt', stepped && { code: stepped.code, message: stepped.message })
  ok(!!rc && rc.delivery && rc.delivery.path === 'subagents', '★★★ the STEP receipt names the delivery path', rc && rc.delivery)
  ok(!!rc && rc.delivery && rc.delivery.childId === 'child-7' && rc.delivery.stopReason === 'end', '★★ the child and its stop reason travel', rc && rc.delivery)
  ok(!!rc && rc.delivery && typeof rc.delivery.means === 'string' && /caller = the CALLING session/.test(rc.delivery.means), '★★ and the field explains both paths', rc && rc.delivery && rc.delivery.means)
}

// ── 4. a report is authoritative: prose that quotes a call in braces must NOT fail the turn ──────────────────────
{
  const pipeline = () => createPromptPipeline({ sections: [{ name: 'p-body', text: '正文', order: 700, kind: 'shared' }], bindings: [], sectionPolicy: decideSections })
  let supplied = null
  const seam = async () => {
    if (supplied === null) return { awaiting: true, memberPrompt: { turnId: 't-1', member: 'member-1', text: 'prompt' } }
    const reply = supplied
    supplied = null
    return { reply, deliveryPath: 'caller' }
  }
  seam.supply = (reply) => { supplied = reply }
  seam.pending = () => (supplied === null ? { turn: 't-1', member: 'member-1' } : null)
  const t = createTurnOrchestrator({ sectionPolicy: decideSections, prompt: pipeline(), deliver: seam, faces: {}, settings: {} })
  const first = await t.step({ members: ['member-1'], why: 'R30 the report must not be failed by prose' })
  ok(!!first && first.ok === true && first.awaiting === true, '★ the caller-played round is awaiting a reply', first && { ok: first.ok, code: first.code })
  // A member that answers BOTH ways: the tool channel first (recorded report), then prose that quotes a call
  t.supplyStructuredReply({ say: '我已归档 Lean 证据', progress: 'p=1 已达成' }, { forMember: 'member-1' })
  t.supplyMemberReply('我先把结论说出来。然后我调用工具：{ op: "reply", report: { say: "示例" } } —— 注意这是说明，不是数据。')
  const second = await t.step({ members: ['member-1'], why: 'complete the reported turn' })
  const rc = second && second.receipt
  ok(!!rc, '★★★ the turn COMPLETES even though the prose brace span does not parse', second && { ok: second.ok, code: second.code, message: second.message })
  ok(!!second && second.ok === true && second.code !== 'VMU_TURN_BAD_JSON', '★★★ and it is NOT reported as VMU_TURN_BAD_JSON', second && second.code)
  ok(!!rc && rc.fields && rc.fields.includes('say'), '★★ the report fields are the ones recorded', rc && rc.fields)
  ok(!!rc && rc.proseUnparsable && rc.proseUnparsable.code === 'VMU_TURN_BAD_JSON', '★★★ the unparsed prose is NAMED on the receipt instead of failing the turn', rc && rc.proseUnparsable)
}

console.log('=== VMU SUBAGENT TURN: ' + passed.length + ' passed, ' + failures.length + ' failed ===')
process.exit(failures.length ? 1 : 0)
