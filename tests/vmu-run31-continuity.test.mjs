// tests/vmu-run31-continuity.test.mjs — LIVE RUN 31: A MEMBER'S TURNS DID NOT CONTINUE, AND THE MEMBER COULD NOT READ
// ITS OWN TOOL FACE.
//
// WHAT THE RUN SAID (run 31, the institute's own acceptance brief): twelve member turns were delivered, and afterwards
// the office read the host's session list and found acad-01 and res-01 each running in TWO DIFFERENT child sessions.
// Every turn of a member therefore started from zero — no memory of the progress it had archived, no memory of the
// routes it had already tried — which is precisely what v5r asks a researcher to carry (independent advancement,
// archived progress, attempted routes). And a member that called `vibe_v5_tool_help` INSIDE its own session was told
// `no live Agent for member res-01 (session=(none learned yet))`: it did not know that the session it was standing in
// WAS the session being looked for, and the sentence read as "this member has no tool face at all".
//
// WHAT IS ASSERTED HERE, IN THREE LAYERS:
//   ①② the KERNEL: two consecutive `step` calls for ONE member hand the member's learned child session to the delivery
//      seam on the second call, and the step receipt says so in fields a reader can compare (`continuation.offered` /
//      `.ranIn` / `.reused` + a sentence) — the exact reading run 31 could not produce;
//   ③④ the SEAM (`deliverViaSubagents`): it fills the `child` slot that has always been in its signature — a
//      caller-supplied reply-capable resume continues the member in its own session — and when it has no such resume it
//      delivers a fresh child AND names who cannot continue, why, and what would fix it (never silently, never a claim);
//   ⑤  the FACE (`tools/member-tools.js`): the answer now carries `voice` / `readingScope` / `callerIsThisMember` and a
//      sentence that says either "this IS your own tool face" or "this is the OFFICE-side reading" — so a member is
//      never left believing it is blind, and the office is never left believing a member read its own table.
//   ⑥⑦ the PRODUCTION BRIDGE (`host-deliver.js`): the resume is BUILT and handed to the seam, so the second turn of a
//      member really runs in the first turn's session (`started === 1`); and when the host cannot do it, the receipt
//      names the missing capability AND pins the measured host contract (no `startContinuable` on DSH 0.2.1).
//
// Run: node tests/vmu-run31-continuity.test.mjs        Last line: === VMU RUN31 CONTINUITY: N passed, M failed ===

import { createTurnOrchestrator, deliverViaSubagents, deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { makeMemberToolsSpec } from '../vibe-math-vmu/tools/member-tools.js'
import { createTurnDeliver, makeMemberResumeChild, memberResumeCapability } from '../vibe-math-vmu/host-deliver.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const rejects = async (fn) => { try { await fn(); return { caught: false } } catch (e) { return { caught: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint } } }

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const faces = { 'vmu.meetings': { speak: async () => ({ ok: true }) } }

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ① THE KERNEL: THE SECOND STEP OF THE SAME MEMBER MUST HAND THE LEARNED SESSION TO THE SEAM.
// The seam here is a TEST SEAM, and it plays the only role that matters for this assertion: it reports back the child
// id it ran in, exactly as the real seam does (`delivery.childId`). A seam that HONOURS the offer continues in the
// member's session; the kernel's job is to PUT the offer on the turn. Both halves are asserted separately so a failure
// says which side broke.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const seen = []
  let n = 0
  const deliver = async ({ turn, text }) => {
    seen.push({ turn, text })
    n += 1
    const offer = turn && turn.continuation && typeof turn.continuation.session === 'string' ? turn.continuation.session : null
    // ★ the seam CONTINUES when it was offered a session (a host with a reply-capable resume would), and starts a fresh
    // child when it was not — so `reused` is a real comparison, not a constant.
    return {
      reply: JSON.stringify({ say: 'round ' + n }),
      childId: offer === null ? 'child-' + n : offer,
      stopReason: 'completed',
      deliveryPath: offer === null ? 'activation' : 'continuation',
      attribution: offer === null ? 'test seam: started a fresh child' : 'test seam: continued the offered session',
      continuation: { applied: offer !== null, how: offer === null ? null : 'test seam resumed the offered session', cause: offer === null ? 'nothing-learned-yet' : null },
    }
  }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s1 = await t.step({ members: ['res-01'], why: '第一次：归档 progress 与已尝试路线' })
  const s2 = await t.step({ members: ['res-01'], why: '第二次：接着自己的进度继续' })
  const d1 = s1 && s1.receipt && s1.receipt.delivery
  const d2 = s2 && s2.receipt && s2.receipt.delivery
  ok(s1 && s1.ok === true && d1 && d1.childId === 'child-1',
    '①-1 setup: the first turn of res-01 ran in a fresh child (child-1) and the receipt names it', d1)
  ok(seen.length === 2 && seen[0].turn && seen[0].turn.continuation === undefined,
    '①-2 the FIRST turn carries NO continuation offer — nothing had been learned yet, and the kernel does not manufacture one',
    seen[0] && seen[0].turn && seen[0].turn.continuation)
  ok(s1 && s1.continuation && s1.continuation.offered === null && s1.continuation.reused === null,
    '①-3 and the receipt says so in fields: continuation.offered=null, reused=null (null = nothing to compare, never "false")',
    s1 && s1.continuation)
  ok(seen.length === 2 && seen[1].turn && seen[1].turn.continuation && seen[1].turn.continuation.session === 'child-1',
    '★★★ ①-4 THE SECOND TURN HANDED THE SEAM THE SESSION LEARNED FROM THE FIRST (turn.continuation.session === child-1)',
    seen[1] && seen[1].turn && seen[1].turn.continuation)
  ok(s2 && s2.ok === true && d2 && d2.childId === 'child-1',
    '★★★ ①-5 and it RAN THERE: the second turn did not open a second child session (the run-31 defect)',
    d2)
  ok(s2 && s2.continuation && s2.continuation.offered === 'child-1' && s2.continuation.ranIn === 'child-1' && s2.continuation.reused === true,
    '★★★ ①-6 the step receipt carries the comparison: offered=child-1, ranIn=child-1, reused=true',
    s2 && s2.continuation)
  ok(s2 && s2.continuation && s2.continuation.applied === true && typeof s2.continuationMeans === 'string' && /CONTINUED THE MEMBER/.test(s2.continuationMeans),
    '★★ ①-7 and a sentence says what that means (the member kept its own memory), so no reader has to infer it from ids',
    s2 && s2.continuationMeans)
  ok(s2 && s2.memberSession === 'child-1' && s2.childSessionId === 'child-1',
    '★ ①-8 the older readings agree instead of contradicting: memberSession and childSessionId are the same session',
    { memberSession: s2 && s2.memberSession, childSessionId: s2 && s2.childSessionId })
}

// ② THE CALLER-PLAYED ROUTE: it cannot continue on its own, and it must not pretend it did — the caller holds the
// prompt and is told which session the member already has, so the caller can play the turn there.
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: deliverByReturning(), faces })
  const first = await t.step({ members: ['res-02'], why: 'caller plays this turn' })
  ok(first && first.awaiting === true && first.continuation && first.continuation.offered === null,
    '②-1 the caller-played route reports the continuation reading too (first turn: nothing learned, offered=null)', first && first.continuation)
  ok(typeof first.continuationMeans === 'string' && /NO CONTINUATION WAS POSSIBLE/.test(first.continuationMeans),
    '②-2 and says in words why no continuation was possible (a fresh child was necessarily started)')
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ③ THE SEAM WITHOUT A REPLY-CAPABLE RESUME: fresh child (never a fake continuation) + a NAMED boundary.
// The fake host below is the SHAPE of DSH 0.2.1 that run 31 ran on: `startActivation` exists and takes a child id as a
// RESERVED identity (an existing id is refused with DUPLICATE_CHILD), `sendMessage` exists but resolves to a
// MessageId. Delivering into the member's own session through either one cannot return a reply, so this seam must not
// claim it continued — it must say who cannot and what would fix it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  let started = 0
  const subagents = {
    startActivation: async () => {
      started += 1
      return {
        childId: 'fresh-child-' + started,
        result: Promise.resolve({ output: [{ type: 'text', text: 'fresh answer ' + started }], stopReason: 'completed' }),
        dispose() {},
      }
    },
    sendMessage: async () => 'message-id-1',
  }
  const seam = deliverViaSubagents(subagents, null, { provider: 'vmu-test' })
  const out = await seam({ turn: { id: 't-1', member: 'res-01', continuation: { session: 'child-9', means: 'learned earlier' } }, text: 'continue please' })
  ok(out && out.reply === 'fresh answer 1' && out.childId === 'fresh-child-1',
    '③-1 with no resume capability the turn still DELIVERS, in a fresh child — the fix never pretends a continuation it did not perform',
    { reply: out && out.reply, childId: out && out.childId })
  ok(out && out.continuation && out.continuation.applied === false && out.continuation.cause === 'no-reply-capable-resume',
    '★★★ ③-2 and the return NAMES the boundary: applied=false, cause=no-reply-capable-resume', out && out.continuation)
  ok(out && out.continuation && out.continuation.session === 'child-9',
    '★★ ③-3 the refused session is named (child-9), so a reader knows WHICH session was not continued')
  ok(out && out.continuation && /sendMessage/.test(out.continuation.why) && /DUPLICATE_CHILD/.test(out.continuation.why) && /startActivation/.test(out.continuation.why),
    '★★★ ③-4 the reason is the MEASURED host contract, verb by verb (sendMessage returns a MessageId; startActivation refuses an existing id)',
    out && out.continuation && out.continuation.why)
  ok(out && out.continuation && Array.isArray(out.continuation.hostVerbs) && out.continuation.hostVerbs.includes('startActivation') && out.continuation.hostVerbs.includes('sendMessage'),
    '★★ ③-5 and it names the resume-related verbs the host ACTUALLY offers, rather than wishing for one',
    out && out.continuation && out.continuation.hostVerbs)
  ok(out && out.continuation && typeof out.continuation.fix === 'string' && /`child`/.test(out.continuation.fix),
    '★★★ ③-6 and what would fix it: a reply-capable resume passed as this seam\'s `child` argument (or a durable channel)',
    out && out.continuation && out.continuation.fix)
  ok(started === 1 && out.continuation.applied === false,
    '★ ③-7 the fresh child was started EXACTLY once — no retry loop, no double child on a continuation attempt', { started })
  // no offer at all ⇒ byte-identical behaviour to before this change (the fix must be inert where nothing is offered)
  const plain = await seam({ turn: { id: 't-2', member: 'res-02' }, text: 'first turn' })
  ok(plain && plain.reply === 'fresh answer 2' && plain.childId === 'fresh-child-2' && plain.continuation === undefined,
    '★ ③-8 a turn with NO offer behaves exactly as before (no extra field, one child)', plain && { childId: plain.childId, continuation: plain.continuation })
}

// ④ THE SEAM WITH A REPLY-CAPABLE RESUME: the member runs in ITS OWN session and the answer comes back.
// This is the `child` slot that has been in the signature since the beginning and was never read.
{
  let started = 0
  const subagents = {
    startActivation: async () => {
      started += 1
      return { childId: 'fresh-child-' + started, result: Promise.resolve({ output: [{ type: 'text', text: 'fresh' }] }), dispose() {} }
    },
  }
  const seam = deliverViaSubagents(subagents, null, { provider: 'vmu-test' })
  const asked = []
  const out = await seam({
    turn: { id: 't-3', member: 'res-01', continuation: { session: 'child-9', means: 'learned earlier' } },
    text: 'continue please',
    child: async ({ session, text }) => { asked.push({ session, text }); return { reply: 'resumed answer', childId: session, stopReason: 'completed' } },
  })
  ok(out && out.reply === 'resumed answer' && out.childId === 'child-9',
    '★★★ ④-1 the resume capability was used and the turn settled in the member\'s OWN session (child-9)', { reply: out && out.reply, childId: out && out.childId })
  ok(asked.length === 1 && asked[0].session === 'child-9' && /continue please/.test(asked[0].text),
    '★★★ ④-2 the capability received the session id AND the member prompt (the seam is the only place that knows both)',
    asked)
  ok(out && out.deliveryPath === 'continuation',
    '★★ ④-3 the path says how: deliveryPath="continuation" (a reader can tell this from activation/one-shot/caller)', out && out.deliveryPath)
  ok(out && out.continuation && out.continuation.applied === true && out.continuation.cause === null && typeof out.continuation.how === 'string' && /child-9/.test(out.continuation.how),
    '★★ ④-4 and the continuation reading says it WORKED, naming the session and the mechanism', out && out.continuation)
  ok(started === 0,
    '★★★ ④-5 NO fresh child was started on a continued turn — the run-31 defect cannot recur on this path', { started })
  ok(/CONTINUES the member/.test(out.attribution || ''),
    '★ ④-6 the attribution sentence states the difference in words (continues, not starts)', out && out.attribution)
}

// ④b A RESUME THAT FAILS IS AN *EXPLICIT* DOWNGRADE, NOT A FAILED TURN (lead ruling, task-16 裁决 1): one failed turn stops
// the institute, and what run-31 actually lost was the SILENCE around the downgrade, not the downgrade. So: fall back to a
// fresh child, and put the downgrade on the receipt as data — cause / hostCode / why / fix — instead of refusing.
// The ONE exception stays a failure: a resume that runs out of budget may still be running the member's own session, so
// starting a second child would double-execute it.
{
  let started = 0
  const subagents = { startActivation: async () => { started += 1; return { childId: 'fresh-child-' + started, result: Promise.resolve({ output: [{ type: 'text', text: 'fresh answer ' + started }] }), dispose() {} } } }
  const seam = deliverViaSubagents(subagents, null, { provider: 'vmu-test' })
  const r = await seam({
    turn: { id: 't-4', member: 'res-01', continuation: { session: 'child-9' } },
    text: 'continue',
    child: async () => { const e = new Error('the resume verb refused'); e.code = 'VMU_TEST_RESUME_REFUSED'; throw e },
  })
  ok(r && r.reply === 'fresh answer 1' && started === 1,
    '★★★ ④b-1 a throwing resume does NOT fail the turn: the member is delivered by exactly ONE fresh child', { reply: r && r.reply, started })
  ok(r && r.continuation && r.continuation.applied === false && r.continuation.cause === 'resume-failed' && r.continuation.hostCode === 'VMU_TEST_RESUME_REFUSED',
    '★★★ ④b-2 and the receipt carries the downgrade as DATA (applied:false, cause:"resume-failed", hostCode = the host\'s own code)', r && r.continuation)
  ok(/EXPLICIT downgrade/.test(String(r && r.continuation.why)) && /child-9/.test(String(r && r.continuation.why)) && /VMU_TEST_RESUME_REFUSED/.test(String(r && r.continuation.why)),
    '★★★ ④b-3 `why` says it is EXPLICIT, names the session it tried and quotes the host refusal — the silence run-31 lost is gone', r && r.continuation.why)
  ok(/dsh-session-query/.test(String(r && r.continuation.fix)) && /continuable/.test(String(r && r.continuation.fix)),
    '★★ ④b-4 `fix` names the real causes (session-query missing / child not recorded continuable / dead parent), not "try again"', r && r.continuation.fix)
  ok(r && r.childId === 'fresh-child-1' && r.deliveryPath !== 'continuation',
    '★★ ④b-5 the turn reports where it REALLY ran (a fresh child), so nothing claims continuity that did not happen', { childId: r && r.childId, path: r && r.deliveryPath })
  const noReply = await seam({
    turn: { id: 't-5', member: 'res-01', continuation: { session: 'child-9' } },
    text: 'continue',
    child: async () => ({ }),
  })
  ok(noReply && noReply.reply === 'fresh answer 2' && noReply.continuation.applied === false && noReply.continuation.cause === 'resume-no-reply',
    '★★ ④b-6 a resume that returns no text downgrades the same way, under its OWN cause ("resume-no-reply": a reading failure, not a host refusal)', noReply && noReply.continuation)
  const slow = await rejects(() => seam({
    turn: { id: 't-6', member: 'res-01', continuation: { session: 'child-9' } },
    text: 'continue',
    child: async () => { const e = new Error('the continuation poll ran out of budget'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; throw e },
  }))
  ok(slow.caught && slow.code === 'VMU_TURN_DELIVERY_TIMEOUT' && started === 2,
    '★★★ ④b-7 the ONE continuation failure that STAYS a failure: a budget timeout is re-thrown by name and starts NO second child (that member may still be running)', { code: slow.code, started })
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑤ THE TOOL FACE: VOICE AND SCOPE, NAMED — the run-31 sentence that made a member believe it was blind.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const param = (type, description, extra = {}) => ({ type, description, ...extra })
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const TOOL_NAMES = { memberTools: 'vibe_vmu_tools' }
  const liveView = (member, agent) => ({ ok: true, member, count: 2, tools: [{ name: 'vibe_vmu_turn', purpose: '回合' }, { name: 'vibe_v5_records_list', purpose: '归档' }], hidden: [], source: 'caller', agentId: agent.id, schemaScope: 'agent', liveAgent: true })
  const deadView = (member) => ({
    ok: true, member, count: null, tools: null, hidden: [], source: 'no-live-agent', liveAgent: false,
    cause: 'child-session-not-live', childId: 'child-7',
    refusal: { code: 'VMU_NO_SUCH_OBJECT', message: 'member "res-01" has a learned child session (child-7) but no LIVE Agent', hint: 'deliver one turn first' },
    note: 'the member ran in a CHILD SESSION (child-7) that has finished, so there is no live tool table to read here',
  })
  const kernelLive = { toolsView: ({ member, agent }) => liveView(member, agent), turn: { memberSession: (m) => (m === 'res-01' ? 'child-7' : null) } }
  const kernelDead = { toolsView: ({ member }) => deadView(member), turn: { memberSession: (m) => (m === 'res-01' ? 'child-7' : null) } }
  const specFor = (kernel) => makeMemberToolsSpec({ param, refused, TOOL_NAMES, kernel })

  // ★ THE RUN-31 CASE ITSELF: a member calling about ITSELF from inside its own child session.
  const own = await specFor(kernelLive).run({ member: 'res-01' }, { agent: { id: 'child-7' } })
  ok(own && own.voice === 'member' && own.readingScope === 'caller-live-agent' && own.callerIsThisMember === true,
    '★★★ ⑤-1 a member calling about itself gets voice="member", readingScope="caller-live-agent", callerIsThisMember=true',
    { voice: own && own.voice, readingScope: own && own.readingScope, callerIsThisMember: own && own.callerIsThisMember })
  ok(own && /这是成员自己的读数/.test(own.note) && /child-7/.test(own.note),
    '★★★ ⑤-2 and the sentence says THIS IS THE MEMBER\'S OWN reading, naming the session — the exact sentence run 31 lacked',
    own && own.note)
  ok(own && own.memberSession === 'child-7' && /continued turn would resume/.test(own.memberSessionMeans),
    '★★ ⑤-3 the session is also a field (memberSession) with its meaning attached, so it is comparable with the step receipt',
    { memberSession: own && own.memberSession })

  // ★ a DIFFERENT member's child asking: the table is real, but it is not the asked member's own.
  const other = await specFor(kernelLive).run({ member: 'res-01' }, { agent: { id: 'child-8' } })
  ok(other && other.voice === 'member' && other.callerIsThisMember === false && /另一个子会话/.test(other.note),
    '★★ ⑤-4 a different child session reads a REAL table but is told it is another session\'s, not the asked member\'s',
    { callerIsThisMember: other && other.callerIsThisMember, note: other && other.note })

  // ★ THE HONEST OFFICE NOTE: root-session caller (id starts with 'session-'), no live table.
  const office = await specFor(kernelDead).run({ member: 'res-01' }, { agent: { id: 'session-root-1' } })
  ok(office && office.voice === 'office' && office.readingScope === 'office-view-unreadable' && office.tools === null,
    '★★★ ⑤-5 an office call still reads the honest degrade (tools:null) and NAMES the scope "office-view-unreadable"',
    { voice: office && office.voice, readingScope: office && office.readingScope, tools: office && office.tools })
  ok(office && /【办公室视角的读数】/.test(office.note) && /既不是"成员看不见任何工具"/.test(office.note) && /child-7/.test(office.note),
    '★★★ ⑤-6 and the sentence refuses the misreading run 31 produced ("tools:null is not \'sees nothing\'"), naming where the session went',
    office && office.note)
  ok(office && /the member ran in a CHILD SESSION/.test(office.note) && / \| /.test(office.note),
    '★★ ⑤-7 the kernel\'s own note is PRESERVED (both sentences travel, neither overwrites the other)', office && office.note)
  ok(office && office.callerMeans && /root session/.test(office.callerMeans),
    '★ ⑤-8 and the voice itself is defined, so "office" is not a word to look up')

  // ★ THE MOST IMPORTANT FAILURE MODE: a member-voice caller that STILL cannot read a table must be told it is holding
  // the OFFICE-side reading, not that it is blind.
  const memberBlind = await specFor(kernelDead).run({ member: 'res-01' }, { agent: { id: 'child-7' } })
  ok(memberBlind && memberBlind.voice === 'member' && memberBlind.readingScope === 'office-view-unreadable',
    '★★★ ⑤-9 a non-live read taken from INSIDE a member session is still labelled office-view-unreadable',
    { voice: memberBlind && memberBlind.voice, readingScope: memberBlind && memberBlind.readingScope })
  ok(memberBlind && /你此刻处在成员语气里/.test(memberBlind.note) && /不是你自己会话的工具表/.test(memberBlind.note),
    '★★★ ⑤-10 and the sentence says outright: this is the OFFICE view, NOT your own tool table — the run-31 misreading, closed',
    memberBlind && memberBlind.note)

  // ★ provider path and unknown member both stay honest.
  const providerSpec = makeMemberToolsSpec({ param, refused, TOOL_NAMES, kernel: {
    toolsView: ({ member }) => ({ ok: true, member, count: 1, tools: [{ name: 'vibe_vmu_turn' }], hidden: [], source: 'provider', liveAgent: true }),
    turn: { memberSession: () => null },
  } })
  const viaProvider = await providerSpec.run({ member: 'res-01' }, { agent: { id: 'child-7' } })
  ok(viaProvider && viaProvider.readingScope === 'provider-live-agent' && viaProvider.callerIsThisMember === null,
    '★ ⑤-11 a provider-read table is a real server-side table (provider-live-agent) and the comparison is null, not false',
    { readingScope: viaProvider && viaProvider.readingScope, callerIsThisMember: viaProvider && viaProvider.callerIsThisMember })
  ok(viaProvider && /NOT LEARNED YET/.test(viaProvider.memberSessionMeans),
    '★ ⑤-12 an unlearned member says NOT LEARNED YET (a reading absence), never "the member sees nothing"')
  const noArgument = await specFor(kernelLive).run({ member: '' }, null)
  ok(noArgument && noArgument.ok === false && noArgument.code === 'VMU_INVALID_ARGUMENT',
    '★ ⑤-13 the argument refusal is unchanged (this fix decorates the reading, it does not weaken the gate)', noArgument)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑥ THE PRODUCTION BRIDGE (`host-deliver.js`): the resume is BUILT, not assumed. Task-13 left the `child` slot empty
// in production, so a member still started a fresh child per turn even though the seam could have continued it. This
// layer drives the REAL `createTurnDeliver` against a fake DSH-shaped host and asserts the composed resume end to end:
// the prompt is admitted into the member's OWN session (`subagents.prompt`, mode continuable / delivery queue), the
// answer is read back OUT of that session's log after its `turn/end`, and the step receipt reports a continuation —
// with `started === 1`, i.e. no second child for the same member (the run-31 defect, closed in production wiring).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const SETTINGS = { 'vmu.turn.deliveryTimeoutMs': 5000 }
  const rootAgent = { options: {}, session: { id: 'root-session-1' } }
  // The child session's OWN event log. It already holds the FIRST turn (that is the point: the resume must distinguish
  // the events the resumed turn adds from the ones that were already there, which is why it reads a baseline cursor).
  const log = [
    { seq: 1, type: 'turn/start', data: { turn: 1 } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ say: 'first answer', member: 'res-01' }) }] } } },
    { seq: 3, type: 'turn/end', data: { turn: 1, reason: 'completed' } },
  ]
  const prompts = []
  const promptSignals = []
  let started = 0
  let disposed = 0
  let resumedTurnWritten = false
  const childAgent = {
    // ★ the completion await the inbox MessageId does not carry: when the host says the child is idle, the resumed turn
    // has ENDED — so the answer is now readable from the log. The fake writes it here, exactly when the real host would
    // have finished writing it.
    whenIdle: async () => {
      if (resumedTurnWritten) return
      resumedTurnWritten = true
      log.push({ seq: 4, type: 'turn/start', data: { turn: 2 } })
      log.push({ seq: 5, type: 'assistant/message', data: { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ say: 'resumed in place', member: 'res-01' }) }] } } })
      log.push({ seq: 6, type: 'turn/end', data: { turn: 2, reason: 'completed' } })
    },
  }
  const observation = () => {
    const events = log.slice()
    return {
      source: 'live', header: { id: 'mres-1' }, inheritedEventCount: 0, events,
      cursor: events.length > 0 ? events[events.length - 1].seq : -1,
      [Symbol.dispose]() {},
    }
  }
  const subs = {
    list: () => ['vmu-test'],
    startActivation: async () => {
      started += 1
      return {
        childId: 'mres-1',
        result: Promise.resolve({ output: [{ type: 'text', text: JSON.stringify({ say: 'first answer', member: 'res-01' }) }], stopReason: 'completed' }),
        dispose() { disposed += 1 },
      }
    },
    // DSH 0.2.1's continuation verb: it admits the prompt and resolves to an inbox id — NOT to the answer.
    // ★ RUN 33: it also REQUIRES a caller AbortSignal (`submitAdmitted` → `options.signal.throwIfAborted()`, and the
    // prompt's own refusal path dereferences `signal.aborted` unguarded). The fake enforces that, so the production
    // wiring cannot regress to the signal-less call that produced run 33's "reading 'aborted'".
    prompt: async (request, signal) => {
      if (signal === undefined || signal === null || typeof signal.throwIfAborted !== 'function') {
        throw new TypeError("Cannot read properties of undefined (reading 'aborted')")
      }
      promptSignals.push(signal)
      prompts.push(request)
      return { messageId: 'msg-7' }
    },
    sendMessage: async () => 'inbox-id-1',
  }
  const ctx = {
    get: (key) => {
      if (key === 'subagents') return subs
      if (key === 'agents') return { get: (id) => (id === 'mres-1' ? childAgent : null) }
      if (key === 'sessionQuery') return { observeSession: async () => observation() }
      return null
    },
  }
  const deliver = createTurnDeliver({
    ctx, config: { deliverProvider: 'vmu-test' }, settings: SETTINGS,
    deliverViaSubagents, deliverByReturning, getRootAgent: () => rootAgent,
  })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s1 = await t.step({ members: ['res-01'], why: '第一回合：归档 progress' })
  const s2 = await t.step({ members: ['res-01'], why: '第二回合：接着自己的进度继续' })
  ok(s1 && s1.ok === true && s1.childSessionId === 'mres-1' && started === 1,
    '⑥-1 setup: the first turn ran through the activation path in mres-1 and the receipt names it',
    { childSessionId: s1 && s1.childSessionId, started })
  ok(s2 && s2.ok === true,
    '⑥-2 the second turn of the SAME member settles (the resumed turn produced a parseable report)', s2 && s2.receipt)
  ok(prompts.length === 1 && prompts[0].childSessionId === 'mres-1' && prompts[0].parentSessionId === 'root-session-1',
    '★★★ ⑥-3 the prompt was admitted into the member\'s OWN session (childSessionId=mres-1, parentSessionId=root-session-1)',
    prompts[0])
  ok(prompts.length === 1 && prompts[0].mode === 'continuable' && prompts[0].delivery === 'queue' && /第二回合/.test(String(prompts[0].content[0].text)),
    '★★★ ⑥-4 through the continuation verb with the measured contract (mode=continuable, delivery=queue) and THIS turn\'s prompt',
    prompts[0] && { mode: prompts[0].mode, delivery: prompts[0].delivery })
  ok(started === 1,
    '★★★ ⑥-5 NO second child was started for the same member — the run-31 defect cannot recur through the production bridge',
    { started })
  ok(s2 && s2.childSessionId === 'mres-1' && s2.memberSession === 'mres-1',
    '★★ ⑥-6 and the older readings agree: childSessionId and memberSession are both mres-1', { childSessionId: s2 && s2.childSessionId })
  ok(s2 && s2.continuation && s2.continuation.offered === 'mres-1' && s2.continuation.ranIn === 'mres-1' && s2.continuation.reused === true && s2.continuation.applied === true,
    '★★★ ⑥-7 the receipt comparison is real: offered=mres-1, ranIn=mres-1, reused=true, applied=true', s2 && s2.continuation)
  ok(s2 && s2.receipt && s2.receipt.delivery && s2.receipt.delivery.path === 'continuation',
    '★★★ ⑥-8 deliveryPath="continuation" — a reader can tell this turn from activation/one-shot/caller',
    s2 && s2.receipt && s2.receipt.delivery)
  ok(JSON.stringify(s2).includes('resumed in place'),
    '★★★ ⑥-9 the ANSWER CAME BACK: the text read out of the child session log is the reply this step settled with')
  ok(disposed === 0 && s1 && s1.receipt && s1.receipt.delivery && s1.receipt.delivery.residency === 'kept-resident-for-continuation',
    '★★★ ⑥-10 ROUND 32 / F8: the activation was KEPT RESIDENT rather than disposed — a resume cannot be attempted against a child whose activation was torn down. (Run 33 later measured the OTHER half of that refusal: the prompt call itself needs a caller AbortSignal; ⑥-12 pins it.) The receipt names the choice in `delivery.residency`, so the measurement is readable instead of inferred',
    { disposed, residency: s1 && s1.receipt && s1.receipt.delivery && s1.receipt.delivery.residency })
  ok(typeof s2.continuationMeans === 'string' && /CONTINUED THE MEMBER/.test(s2.continuationMeans),
    '★★ ⑥-11 and the sentence says so in words, not only in ids', s2 && s2.continuationMeans)
  ok(promptSignals.length === 1 && promptSignals[0] && promptSignals[0].aborted === false && typeof promptSignals[0].throwIfAborted === 'function',
    '★★★ ⑥-12 RUN 33: the production wiring passes a LIVE AbortSignal into `subagents.prompt` — the signal-less call it used to make dies in the host\'s own refusal path reading `undefined.aborted`',
    promptSignals.length ? { aborted: promptSignals[0].aborted, throwIfAborted: typeof promptSignals[0].throwIfAborted } : promptSignals.length)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑦ THE PIN: A HOST THAT CANNOT RESUME MUST BE MEASURED, NOT WISHED FOR. DSH 0.2.1 has no `startContinuable` verb at
// all, and `sendMessage`/`prompt` resolve to inbox ids — so the composed resume needs `subagents.prompt` +
// `agents.get(id).whenIdle()` + `sessionQuery.observeSession(id)`. This layer pins that contract: with any piece absent
// the bridge returns NO resume, the member gets a fresh child again, and the receipt names the missing piece. A future
// host that grows a cleaner resume verb must come here and change this assertion — that is the point of pinning it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const rootAgent = { options: {}, session: { id: 'root-session-1' } }
  let started = 0
  const subs = {
    list: () => ['vmu-test'],
    startActivation: async () => {
      started += 1
      return { childId: 'plain-child-' + started, result: Promise.resolve({ output: [{ type: 'text', text: JSON.stringify({ say: 'fresh turn ' + started }) }] }), dispose() {} }
    },
    // ★ NO `prompt`: this is the shape of a host that cannot admit a next-turn prompt into an existing session.
    sendMessage: async () => 'inbox-id-1',
  }
  const ctx = { get: (key) => (key === 'subagents' ? subs : key === 'agents' ? { get: () => null } : null) }
  const capability = memberResumeCapability({ ctx, subs, parent: rootAgent })
  ok(capability.capable === false && capability.missing.includes('subagents.prompt') && capability.missing.includes('sessionQuery.observeSession'),
    '★★ ⑦-1 the capability probe NAMES the missing pieces (no subagents.prompt, no sessionQuery.observeSession)', capability)
  ok(makeMemberResumeChild({ ctx, subs, parent: rootAgent }) === null,
    '★★★ ⑦-2 with a piece missing the bridge returns NO resume (the seam then says so instead of faking continuity)')
  const deliver = createTurnDeliver({ ctx, config: { deliverProvider: 'vmu-test' }, settings: { 'vmu.turn.deliveryTimeoutMs': 5000 }, deliverViaSubagents, deliverByReturning, getRootAgent: () => rootAgent })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s1 = await t.step({ members: ['res-01'], why: '第一回合' })
  const s2 = await t.step({ members: ['res-01'], why: '第二回合' })
  ok(s1 && s1.ok === true && s2 && s2.ok === true && started === 2 && s2.childSessionId === 'plain-child-2',
    '★★ ⑦-3 without a resume the member still gets a turn — in a FRESH child, once per turn, and the receipt says which',
    { started, childSessionId: s2 && s2.childSessionId })
  ok(s2 && s2.continuation && s2.continuation.applied === false && s2.continuation.cause === 'no-reply-capable-resume',
    '★★★ ⑦-4 and it is NAMED: applied=false, cause=no-reply-capable-resume (never a claim of continuity)',
    s2 && s2.continuation)
  ok(s2 && s2.continuation && s2.continuation.capability && s2.continuation.capability.capable === false && Array.isArray(s2.continuation.capability.missing),
    '★★★ ⑦-5 the deployment\'s OWN capability probe travels onto the receipt, so the boundary is a measurement',
    s2 && s2.continuation && s2.continuation.capability)
  ok(s2 && s2.continuation && /missing=\[/.test(String(s2.continuation.why)),
    '★★★ ⑦-6 the reason sentence names WHICH piece is missing instead of only "this host offers no resume"',
    s2 && s2.continuation && s2.continuation.why)
  ok(s2 && s2.continuation && Array.isArray(s2.continuation.hostVerbs) && !s2.continuation.hostVerbs.includes('startContinuable') && s2.continuation.hostVerbs.includes('startActivation'),
    '★★★ ⑦-7 THE PIN: this host offers startActivation/sendMessage and NO startContinuable — a host that grows a reply-capable resume verb must update this test, not silently keep the old shape',
    s2 && s2.continuation && s2.continuation.hostVerbs)
}

console.log('')
if (failed) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  FAIL ' + f)
  console.error('=== VMU RUN31 CONTINUITY: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exit(1)
} else {
  console.log('=== VMU RUN31 CONTINUITY: ' + passed + ' passed, 0 failed ===')
}
