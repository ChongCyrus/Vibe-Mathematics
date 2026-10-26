// tests/vmu-run32-resume.test.mjs — ROUND 32 / F8: THE HOST-SIDE RESUME ITSELF.
//
// WHY THIS FILE EXISTS. Run 32 was the first live run that tried to continue a member in its own session, and the
// receipt came back `cause:"resume-failed"` with the host's internal error — `Cannot read properties of undefined
// (reading 'aborted')` — while the capability reading said `capable:true`. The kernel-side cause is fixed and pinned in
// tests/vmu-run31-continuity.test.mjs (the activation was disposed before the resume could read its signal). What was
// NOT pinned is the other half: `makeMemberResumeChild()` in `host-deliver.js` is the code that actually composes
// `subagents.prompt({mode:'continuable'})` + `whenIdle()` + `observeSession()` into one seam, and until this file it had
// no test at all — only the two references in `vmu-activity-timers` and `vmu-run31-continuity`'s capability probe.
//
// A seam with no test is a seam whose refusals are promises. So this file drives it against a FAKE host that behaves the
// way DSH 0.2.1 does — the measured contract is in the comment above the capability probe: `startContinuable` does not
// exist, `subagents.prompt` resolves an inbox message id, `agents.get(id).whenIdle()` is the completion await, and
// `sessionQuery.observeSession(id)` is the only way back to the child's own log — and asserts, per failure mode:
//   ① what is missing when it cannot resume at all (the reading is a measurement, not a boolean),
//   ② the happy path: ONE prompt into the member's OWN session, its turn/end read back, the answer returned with an
//      attribution that says no new child was started,
//   ③ the host's own refusal codes are mapped to vmu's code AND keep an actionable hint,
//   ④ a baseline that cannot be read is refused BEFORE anything is queued (a turn that did not run must not look sent),
//   ⑤ a turn that ended without text is named as a READING failure, not as "the member said nothing",
//   ⑥ the deadline bounds THIS CALL and says the member may still be working (`stillRunning`), and
//   ⑦ an empty session id is an argument error, because "nothing offered" must not be read as "resume it anyway".
//
// Run: node tests/vmu-run32-resume.test.mjs        Last line: === VMU RUN32 RESUME: N passed, M failed ===

import { makeMemberResumeChild, memberResumeCapability } from '../vibe-math-vmu/host-deliver.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const rejects = async (fn) => { try { await fn(); return { caught: false } } catch (e) { return { caught: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint, deliveryPath: e && e.deliveryPath, childId: e && e.childId, stillRunning: e && e.stillRunning, deliveryTimeoutMs: e && e.deliveryTimeoutMs, waitedMs: e && e.waitedMs } } }

// ── the fake host ────────────────────────────────────────────────────────────────────────────────────────────────
// `log(childId)` is the CHILD's OWN session log. `baselineSeq` is whatever cursor the seam read before queueing, and the
// seam's contract is "only events with seq > baseline count as this turn". The fake enforces that by advancing seq only
// when the prompt is admitted, which is also how the real host behaves (a queued prompt becomes the child's next turn).
const fakeHost = ({ onPrompt = null, failBaseline = null, endWithoutText = false, neverEnds = false, readback = '灯塔' } = {}) => {
  const calls = { prompts: [], baselines: [], reads: 0 }
  const logs = new Map()
  const logOf = (id) => {
    if (!logs.has(id)) logs.set(id, { seq: 5, events: [] })
    return logs.get(id)
  }
  const agents = {
    get: (id) => (id ? { session: { id }, whenIdle: async () => {} } : null),
  }
  const sessionQuery = {
    observeSession: async (id) => {
      calls.reads += 1
      if (failBaseline && calls.reads === 1) {
        const err = new Error('access denied reading ' + id)
        err.code = 'EACCES'
        throw err
      }
      const log = logOf(id)
      calls.baselines.push({ id, cursor: log.seq })
      return { cursor: log.seq, events: log.events.slice(), [Symbol.dispose]() {} }
    },
  }
  let admitted = 0
  const subs = {
    prompt: async (req) => {
      calls.prompts.push(req)
      admitted += 1
      if (onPrompt) await onPrompt(req, admitted)
      const log = logOf(req.childSessionId)
      if (!neverEnds) {
        log.seq += 1
        log.events.push({ seq: log.seq, type: 'turn/end' })
        if (!endWithoutText) {
          log.seq += 1
          log.events.push({
            seq: log.seq,
            type: 'assistant/message',
            data: { message: { content: [{ type: 'text', text: readback }] } },
          })
        }
      }
      return { messageId: 'inbox-msg-' + admitted }
    },
  }
  const parent = { session: { id: 'parent-office-session' } }
  const ctx = { get: (key) => ({ agents, sessionQuery }[key] || null) }
  return { ctx, subs, parent, calls, logs }
}

const childOf = (host, opts = {}) => makeMemberResumeChild(Object.assign({ ctx: host.ctx, subs: host.subs, parent: host.parent, sleep: async () => {}, deadlineMs: 5000 }, opts))
const turnOf = () => ({ id: 't-r32-1', member: 'res-01' })

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ① WHAT IS MISSING IS A READING, NOT A BOOLEAN
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost()
  const noPrompt = memberResumeCapability({ ctx: host.ctx, subs: {}, parent: host.parent })
  ok(noPrompt.capable === false && noPrompt.missing.includes('subagents.prompt'),
    '① without `subagents.prompt` the capability is NOT capable and NAMES the missing verb', noPrompt)
  ok(noPrompt.verb === null,
    '① …and `verb` is null rather than a string that names a verb the deployment does not have (the missing list is the reading)', noPrompt.verb)

  const noCtx = memberResumeCapability({ ctx: null, subs: host.subs, parent: host.parent })
  ok(noCtx.capable === false && noCtx.missing.includes('agents.get') && noCtx.missing.includes('sessionQuery.observeSession'),
    '① without the host context, BOTH services are named missing (agents.get + sessionQuery.observeSession)', noCtx.missing)

  const noParent = memberResumeCapability({ ctx: host.ctx, subs: host.subs, parent: null })
  ok(noParent.capable === false && noParent.missing.some((m) => /parent session/.test(m)),
    '① a missing live parent is named as such — the office session closing is not a missing member', noParent.missing)

  ok(makeMemberResumeChild({ ctx: host.ctx, subs: {}, parent: host.parent }) === null,
    '① when the capability is not met, the factory returns NULL rather than a seam that would fail later')

  const capable = memberResumeCapability({ ctx: host.ctx, subs: host.subs, parent: host.parent })
  ok(capable.capable === true && capable.parentSessionId === 'parent-office-session' && capable.missing.length === 0,
    '① with all four pieces (prompt / agents.get / observeSession / live parent) the capability is capable and the parent id is the read one', capable)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ② THE HAPPY PATH: ONE PROMPT INTO THE MEMBER'S OWN SESSION, ITS TURN/END READ BACK
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost()
  const resume = childOf(host)
  const out = await resume({ session: 'child-of-res-01', text: '上一轮我让你记住的词是什么？只回答那个词。', turn: turnOf() })

  ok(host.calls.prompts.length === 1, '② exactly ONE prompt was queued (no retry, no second child)', host.calls.prompts.length)
  const req = host.calls.prompts[0] || {}
  ok(req.childSessionId === 'child-of-res-01' && req.parentSessionId === 'parent-office-session',
    '② the prompt names the member\'s OWN child session and the live parent — not a new child', { childSessionId: req.childSessionId, parentSessionId: req.parentSessionId })
  ok(req.mode === 'continuable' && req.delivery === 'queue',
    '② the verb is the measured one: mode "continuable" + delivery "queue" (the shape DSH 0.2.1 accepts)', { mode: req.mode, delivery: req.delivery })
  ok(Array.isArray(req.content) && req.content.length === 1 && req.content[0].type === 'text' && /记住的词/.test(req.content[0].text),
    '② the assembled prompt text travels as one text block, unchanged', req.content)
  ok(typeof req.requestId === 'string' && /^vmu-cont-/.test(req.requestId),
    '② the queue carries a requestId derived from the turn (so a host log can be matched to this turn)', req.requestId)

  ok(out.reply === '灯塔' && out.childId === 'child-of-res-01', '② the member\'s answer is read back out of its own session log', { reply: out.reply, childId: out.childId })
  ok(out.acceptedMessageId === 'inbox-msg-1', '② the host\'s accepted message id is reported, so "admitted" is checkable', out.acceptedMessageId)
  ok(/no new child was started/.test(out.attribution) && /OWN session/.test(out.attribution),
    '② the attribution says it in words: queued into the member\'s OWN session, no new child started', out.attribution)
  ok(Number.isFinite(out.waitedMs) && out.waitedMs >= 0, '② the wait is a number on the envelope, not prose only', out.waitedMs)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ③ THE HOST'S OWN REFUSALS ARE MAPPED, AND THE HINT STAYS ACTIONABLE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
for (const [hostCode, mustMention] of [
  ['subagent/not-resumable', 'no continuation state recorded'],
  ['subagent/parent-unavailable', 'no longer live'],
  ['subagent/unauthorized', 'exact live parent'],
  ['subagent/delivery-unavailable', 'active-subagent cap'],
]) {
  const host = fakeHost({ onPrompt: () => { const err = new Error('host refused: ' + hostCode); err.code = hostCode; throw err } })
  const resume = childOf(host)
  const r = await rejects(() => resume({ session: 'child-of-res-01', text: 'x', turn: turnOf() }))
  ok(r.caught && r.code === 'VMU_ENGINE_UNAVAILABLE' && r.message.includes(hostCode),
    '③ ' + hostCode + ' becomes VMU_ENGINE_UNAVAILABLE and the host code is kept in the message', r.code + ' / ' + r.message)
  ok(typeof r.hint === 'string' && r.hint.includes(mustMention),
    '③ ' + hostCode + ' keeps an ACTIONABLE hint (what to fix), not just the host\'s words', r.hint)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ④ A BASELINE THAT CANNOT BE READ IS REFUSED **BEFORE** ANYTHING IS QUEUED
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost({ failBaseline: 'EACCES' })
  const resume = childOf(host)
  const r = await rejects(() => resume({ session: 'child-of-res-01', text: 'x', turn: turnOf() }))
  ok(r.caught && r.code === 'VMU_ENGINE_UNAVAILABLE' && /could not be read before resuming it/.test(r.message),
    '④ an unreadable baseline refuses the resume and says it failed BEFORE the prompt', r.message)
  ok(/cause=EACCES/.test(String(r.hint)) && /sessionQuery/.test(String(r.hint)),
    '④ …and the hint names the cause and the service to check', r.hint)
  ok(host.calls.prompts.length === 0,
    '④ NOTHING was queued: a turn that did not run must never look as if it was sent', host.calls.prompts.length)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑤ A TURN THAT ENDED WITHOUT TEXT IS A READING FAILURE, NOT "THE MEMBER SAID NOTHING"
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost({ endWithoutText: true })
  const resume = childOf(host)
  const r = await rejects(() => resume({ session: 'child-of-res-01', text: 'x', turn: turnOf() }))
  ok(r.caught && r.code === 'VMU_ENGINE_UNAVAILABLE' && /ended without any assistant text/.test(r.message),
    '⑤ a turn/end with no assistant text is refused by name', r.message)
  ok(/DID run and DID end its turn/.test(String(r.hint)) && /reading failure/.test(String(r.hint)),
    '⑤ the hint tells the reader the member DID run — the failure is on the way back', r.hint)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑥ THE DEADLINE BOUNDS THIS CALL AND SAYS SO
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost({ neverEnds: true })
  let nowMs = 0
  const resume = childOf(host, { deadlineMs: 1000, clock: () => (nowMs += 400) })
  const r = await rejects(() => resume({ session: 'child-of-res-01', text: 'x', turn: turnOf() }))
  ok(r.caught && r.code === 'VMU_TURN_DELIVERY_TIMEOUT' && r.deliveryPath === 'continuation',
    '⑥ the deadline is named as its own code and carries the route that timed out', { code: r.code, deliveryPath: r.deliveryPath })
  ok(r.stillRunning === true && r.childId === 'child-of-res-01' && Number.isFinite(r.deliveryTimeoutMs),
    '⑥ …the member is reported as possibly STILL WORKING (a bounded call is not a conclusion about the member)', { stillRunning: r.stillRunning, childId: r.childId })
  ok(/WAS admitted into the member/.test(String(r.hint)) && /Do not conclude the turn produced nothing/.test(String(r.hint)),
    '⑥ …and the hint refuses the wrong conclusion: the prompt was admitted, the child may still be working', r.hint)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⑦ NO SESSION ID IS AN ARGUMENT ERROR, NOT A REASON TO START A NEW CHILD
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const host = fakeHost()
  const resume = childOf(host)
  const r = await rejects(() => resume({ session: '', text: 'x', turn: turnOf() }))
  ok(r.caught && r.code === 'VMU_INVALID_ARGUMENT' && /without a session id/.test(r.message),
    '⑦ an empty session id is refused as an argument error', r.message)
  ok(host.calls.prompts.length === 0 && host.calls.reads === 0,
    '⑦ …and neither the log was read nor a prompt queued (an empty offer means "nothing to resume")', { reads: host.calls.reads })
}

console.log('')
if (failed === 0) console.log('=== VMU RUN32 RESUME: ' + passed + ' passed, 0 failed ===')
else { console.log('FAILURES:'); for (const f of failures) console.log('  FAIL ' + f); console.log('=== VMU RUN32 RESUME: ' + passed + ' passed, ' + failed + ' failed ==='); process.exitCode = 1 }
