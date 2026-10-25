#!/usr/bin/env node
// vmu RUN 15 FINDINGS — the two lies the institute's own acceptance report caught on the real machine.
//
// RUN 15 (D:\wd\vibemath开发\_oneoff\vm-slv\full-1025-210042.jsonl, 10 sessions, `cast` never reached) reported two
// readings that were FALSE, and both were false in the same way: a value that is true about one scope was presented as
// the answer to a question about another scope.
//
//   ⑦ 「成员侧 0 工具调用，真干活没有发生」 — every settled turn receipt said `toolCalls: [], toolCallsTotal: 0`.
//      MEASURED against the same transcript: the member child sessions carried 38,674 tool-call events. The parent
//      kernel counted its own calls, which are always zero under activation delivery, and said nothing about the scope.
//      ⇒ `toolCallsScopeOf` names the scope on every receipt (`parent-kernel` vs `member-kernel`).
//
//   ① 「会议只能由院士召开」 held for every member call and FAILED on the automatic path — the pack's stall middleware
//      opened `{chair:null, roster:0}` meetings from `control/idle`, so the transcript contained a convene that no chair
//      performed. The kernel rail cannot cover it (a chairless convene installs no authority to check), so the rule is
//      completed where the seats are known: the pack convenes UNDER the seated chair and records `convenedBy`, or it
//      refuses by name when no chair is seated. ⇒ assert both branches, and assert the reading lands on the meeting.
//
// Every assertion below runs against the real modules; nothing is asserted about a copy.
import { toolCallsScopeOf } from '../vibe-math-vmu/kernel/turn/index.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { V5R_STALL_MEETING } from '../vibe-math-vmu/packs/v5r/middleware/stall-meeting.js'
import { classifySubject, debateSubjectGate } from '../vibe-math-vmu/packs/v5r/verification-gates.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── 1. ⑦ the scope reading: every branch, including the absent-delivery one ───────────────────────────
{
  // The measured mode: activation delivery runs the member in its own kernel.
  const act = toolCallsScopeOf('activation')
  ok(act.scope === 'parent-kernel', '⑦ ⑦a activation delivery ⇒ the count is scoped parent-kernel')
  ok(typeof act.note === 'string' && act.note.includes('child session'), '⑦ ⑦b the note sends the reader to the child session log', act.note)
  ok(act.note.includes('does not mean the member did nothing'), '⑦ ⑦c the note forbids the exact misreading the institute made')

  // The other two delegation paths run a child session too; naming only one of them would be the same defect again.
  for (const p of ['one-shot', 'continuable']) {
    const r = toolCallsScopeOf(p)
    ok(r.scope === 'parent-kernel' && typeof r.note === 'string', '⑦ ⑦d ' + p + ' is also a separate kernel', JSON.stringify(r))
  }

  // Caller-played: the caller IS the member, so the parent count IS the member's count — no note, no disclaimer.
  const caller = toolCallsScopeOf('caller')
  ok(caller.scope === 'member-kernel' && caller.note === null, '⑦ ⑦e a caller-played turn is counted in the member kernel and needs no disclaimer', JSON.stringify(caller))

  // No delivery path at all: the count cannot be attributed, and saying so is better than implying a scope.
  const none = toolCallsScopeOf(null)
  ok(none.scope === 'member-kernel' && typeof none.note === 'string', '⑦ ⑦f a receipt without a delivery path says the count cannot be attributed')
}

// ── 2. ① the automatic convene must run under a chair, and must say that it was automatic ─────────────
const mkMeetings = () => {
  const reads = []
  const t = createMeetings({ clock: () => 1000, settings: { get: (k) => { reads.push(k); return {}['vmu.meetings.quorumCap'] } } })
  return t
}
const STALL = { elapsedMs: 100000, afterMs: 1000, at: 1000 }
const hookFrame = (services, over = {}) => Object.assign({}, STALL, { api: { services: { get: (n) => services[n] || null } } }, over)

{
  // ①a NO chair seated (leaderless institute) ⇒ the automatic convene still happens — v5r's stall rule exists to unfreeze
  // an idle institute and a leaderless one is a supported configuration — but the exception is NAMED on both the return
  // value and the meeting, so it can never again be read as a chair's own act.
  const meetings = mkMeetings()
  const out = await V5R_STALL_MEETING.hooks['control/idle'](hookFrame({
    'vmu.meetings': meetings,
    'vmu.members': { roster: () => [{ id: 'member-1', slot: 'member' }] },
  }))
  ok(out.convened === true && out.chairless === true, '① ①a with no chair seated the path convenes and says it is chairless', JSON.stringify({ convened: out.convened, chairless: out.chairless }))
  ok(typeof out.chairlessNote === 'string' && out.chairlessNote.includes('NO CHAIR IS SEATED'), '① ①b and states in words that no chair authority exists', out.chairlessNote)
  const [cid] = meetings.liveIds()
  const cview = meetings.meetingView({ meeting: cid })
  ok(cview.chair === null, '① ①c the meeting records no chair (the truth) rather than inventing one')
  ok(cview.convenedBy === 'v5r.stall-meeting', '① ①d and records WHO triggered it')
  ok(typeof cview.convenedByMeans === 'string' && cview.convenedByMeans.includes('NO chair is seated'),
    '① ①e meetingView explains the chairless case instead of pointing at a chair that does not exist', cview.convenedByMeans)
}
{
  // ①f A chair IS seated ⇒ convene UNDER that chair, and record that the trigger was automatic.
  const meetings = mkMeetings()
  const out = await V5R_STALL_MEETING.hooks['control/idle'](hookFrame({
    'vmu.meetings': meetings,
    'vmu.members': { roster: () => [{ id: 'r-acad', slot: 'chair' }, { id: 'member-1', slot: 'member' }] },
  }))
  ok(out.convened === true && out.chairless === false, '① ①f with a chair seated the stall path convenes under it', JSON.stringify(out).slice(0, 200))
  ok(out.chair === 'r-acad', '① ①g the meeting is seated under the institute chair, not on nobody', out.chair)
  ok(out.convenedBy === 'v5r.stall-meeting', '① ①h the trigger is named: automatic, not the chair calling for it')
  const [id] = meetings.liveIds()
  // ★ THE READING MUST BE ON THE FACE THE RUN READ. `vibe_vmu_meeting { action:"status" }` returns `meetingView`, not
  // `summary` — so asserting only on `summary` would have re-created the defect (a field present where nobody looks).
  const view = meetings.meetingView({ meeting: id })
  const summ = meetings.summary({ meeting: id })
  ok(view.convenedBy === 'v5r.stall-meeting', '① ①i the reading lands on meetingView.convenedBy (the face the run reads)', JSON.stringify(view.convenedBy))
  ok(typeof view.convenedByMeans === 'string' && view.convenedByMeans.includes('NOT convened by a member act'),
    '① ①j and says in words that no member convened it', view.convenedByMeans)
  ok(view.chair === 'r-acad', '① ①k the chair whose authority seats it is on the same view', view.chair)
  ok(summ.convenedBy === 'v5r.stall-meeting', '① ①l summary() and meetingView() agree (one fact, not two counts)', JSON.stringify(summ.convenedBy))
}
{
  // ①m An ordinary chair's own convene keeps `convenedBy: null` — the field must DISTINGUISH, not decorate every row.
  const meetings = mkMeetings()
  const own = meetings.open({ type: 'ordinary', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'] })
  const view = meetings.meetingView({ meeting: own.meeting })
  ok(view.convenedBy === null, '① ①n a chair\'s own convene has convenedBy:null (the caller acted)', JSON.stringify(view.convenedBy))
  ok(view.chair === 'r-acad', '① ①o and it still records the chair')
  ok(typeof view.convenedByMeans === 'string' && view.convenedByMeans.includes('the caller of open() is the convener'),
    '① ①p and the means sentence says the caller acted', view.convenedByMeans)
}

// ── 3. the two suites that must not regress silently ─────────────────────────────────────────────────
{
  // The stall decision itself is unchanged: a switch that never convenes is not a fix, it is a removal.
  const short = await V5R_STALL_MEETING.hooks['control/idle'](hookFrame({ 'vmu.meetings': mkMeetings(), 'vmu.members': { roster: () => [{ id: 'r-acad', slot: 'chair' }] } }, { elapsedMs: 10 }))
  ok(short.convened === false && typeof short.reason === 'string' && short.reason.includes('short of the stall threshold'),
    '③ ③a below the threshold the path still declines, with the threshold in the reason', short.reason)
}

// ── 4. ⑦-2 the "cannot read the member wire" receipt must name WHICH cause it is ─────────────────────
{
  // The provider's refusal and the kernel's explanation are two halves of one reading. They are asserted by their CODE
  // SHAPE (comments stripped first), because the alternative — booting a full host — would test the harness instead of
  // the sentence a member reads. The point of the assertion is that the sentence can now DIFFER by cause: one fixed
  // explanation was false in the mode the institute measured.
  const { stripComments } = await import('./_lib/strip-comments.mjs')
  const hostSrc = stripComments(readFileSync(join(HERE, '..', 'vibe-math-vmu', 'host.js'), 'utf8'))
  ok(hostSrc.includes("cause === 'child-session-not-live'") && hostSrc.includes(": 'no-child-session-yet'"),
    '⑦ ⑦g host.js distinguishes a FINISHED child from a member that never had one')
  ok(/learnedSession:\s*learned\s*\|\|\s*null/.test(hostSrc), '⑦ ⑦h the learned child session id travels on the refusal (so a reader can open its log)')
  ok(hostSrc.includes('child session log'), '⑦ ⑦i and the hint sends the reader to the place the calls actually are')

  const kernelSrc = stripComments(readFileSync(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8'))
  ok(/const refusalCause = \(e && e\.cause\) \|\| null/.test(kernelSrc), '⑦ ⑦j the kernel READS the cause instead of assuming one')
  ok(kernelSrc.includes("refusalCause === 'child-session-not-live'") && kernelSrc.includes('child session log'),
    '⑦ ⑦k and builds the note from it, pointing at the child session log')
  // The regression this guards: the old single sentence claimed "caller delivery plays the member without a child
  // session" for EVERY cause. That sentence must not come back as the unconditional note.
  const noLiveNote = kernelSrc.slice(kernelSrc.indexOf("source: 'no-live-agent'"))
  ok(!/note: 'the member wire cannot be READ here: caller delivery plays the member without a child session/
    .test(noLiveNote.slice(0, 4000)), '⑦ ⑦l the unconditional "caller delivery" explanation is gone (it was false under activation)')
}

// ③ 「框架把一个卡片 id 当成了短语」 — the institute passed a pack card id (`p-chair-rail`) as a debate subject and the
// receipt came back `form:"statement", provenance:"none"`, which reads exactly like the framework mistook a card for a
// phrase. The card id is minted by the PACK (`p-…`), so the kernel-shaped test `/^r-/` never matched it; the gate had no
// second way to know. Now the gate accepts EVIDENCE as a discriminator and NAMES the ambiguity when it has none.
{
  const stmt = classifySubject('p-chair-rail')
  ok(stmt.form === 'statement', '③ ③a a bare pack card id with NO evidence is classified as a statement', stmt.form)
  ok(stmt.raw === 'p-chair-rail', '③ ③b and the raw string travels with the classification')
  const identified = classifySubject('p-chair-rail', { card: { id: 'p-chair-rail', proofState: 'complete' } })
  ok(identified.form === 'card', '③ ③c ★ the SAME name becomes a card the moment evidence says it resolves', identified.form)
  ok(identified.identifiedBy === 'evidence', '③ ③d and the receipt says WHICH judgement identified it', identified.identifiedBy)
  ok(classifySubject('p-chair-rail', { verified: { cardId: 'p-chair-rail', conclusion: true } }).form === 'card',
    '③ ③e a verified row identifies it too (both evidence kinds count)')
  ok(classifySubject('p-chair-rail.md#证明尝试').form === 'file', '③ ③f a file reference with a #anchor is a FILE, not a statement')
  ok(classifySubject('Members/r-1/Propos/p-chair-rail.md').form === 'file', '③ ③g a path is a file reference')
  ok(classifySubject('r-7').form === 'card', '③ ③h a kernel record id is still a card by shape')

  const debate = { type: 'debate', chair: 'r-acad' }
  const allowed = debateSubjectGate({ meeting: debate, subject: 'p-chair-rail', evidence: {
    card: { id: 'p-chair-rail', p: 1, proofRef: 'Members/r-1/Propos/p-chair-rail.md', proofState: 'complete' },
    verified: null, lean: { jobId: 'j-1', passed: true, subject: 'p-chair-rail' }, file: null,
  } })
  ok(allowed.allowed === true && allowed.form === 'card',
    '③ ③i ★ with card evidence the debate subject is judged AS A CARD (not as an unprovable statement)',
    JSON.stringify({ form: allowed.form, allowed: allowed.allowed }))
  const bare = debateSubjectGate({ meeting: debate, subject: 'p-chair-rail', evidence: {} })
  ok(bare.allowed === true && bare.form === 'statement', '③ ③j with no evidence it is admitted as a statement', bare.form)
  ok(bare.looksLikeIdentifier === true, '③ ③k ★ and the receipt MARKS that the name looks like an identifier', String(bare.looksLikeIdentifier))
  ok(typeof bare.note === 'string' && bare.note.includes('vibe_v5_read_library'),
    '③ ③l and tells the caller how to turn it into a card judgement', bare.note)
  ok(debateSubjectGate({ meeting: { type: 'ordinary' }, subject: 'p-chair-rail', evidence: {} }).applicable === false,
    '③ ③m an ordinary meeting is out of the gate\'s scope (it debates nothing)')
}

if (failed) {
  for (const f of failures) console.log('  FAIL ' + f)
  console.log('=== VMU RUN 15 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exit(1)
}
console.log('=== VMU RUN 15 FINDINGS: ' + passed + ' passed, 0 failed ===')
