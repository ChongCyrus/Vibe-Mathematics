// vmu meeting parity — D-08 baseline A driven against the REAL primitives (task-11).
//
// Baseline A is "what the v5r line actually implemented" (≈14 meeting commands + 7 deformations + every meeting
// parameter with its bounds). This suite does not re-describe it: it DRIVES each capability and asserts the
// observable result, then checks §25.4 of docs/08 for the NAMED extension registry, so a gap can never be
// silently absent (the D-08 rule: 能落地就落地，不能落地必须具名登记).

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const K = (f) => resolve(REPO, 'vibe-math-vmu', 'kernel', f)
const T = (f) => resolve(REPO, 'vibe-math-vmu', 'tools', f)
const DOC08 = resolve(REPO, 'vibe-math-vmu', 'docs', '08-primitives-meeting-ballot-workflow.md')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const meetingMod = await import(pathToFileURL(K('meeting.js')).href)
const ballotMod = await import(pathToFileURL(K('ballot.js')).href)
const boxMod = await import(pathToFileURL(K('ballotbox.js')).href)
const meetingsMod = await import(pathToFileURL(K('meetings.js')).href)
const minutesMod = await import(pathToFileURL(K('minutes.js')).href)
const grantMod = await import(pathToFileURL(K('grant.js')).href)

let NOW = Date.parse('2026-10-09T00:00:00.000Z')
const clock = () => NOW
const roster = ['r-1', 'r-2']

// ---- 1. convene / rounds / speak / silence / refusal (the meeting core) ---------------------------
{
  const mk = (o = {}) => meetingMod.createMeeting(Object.assign({ id: 'mt-1', kind: 'review', roster, deliver: async () => {}, clock }, o))
  await expectThrow(() => mk({ roster: [] }).convene('x'), 'VMU_MEETING_TOO_SMALL', 'a meeting needs at least two participants by default')
  const m = mk()
  await m.convene('review the locked results')
  ok(m.state === 'convened' && m.phase === 'convened', 'convening records the agenda and the phase says so')
  await m.openRound({ members: roster, ask: 'your view?' })
  ok(m.phase === 'round-robin', 'a round with pending members is round-robin (derived, never timed)')
  await m.speak('r-1', 'I think it holds', { quotes: [{ id: 'p-1', depth: 1 }] })
  await m.markSilent('r-2', 'nothing to add')
  ok(m.roundComplete().complete === true, 'the round completes when every asked member is terminal')
  ok(m.phase === 'open-floor', 'all-terminal ⇒ the phase becomes open-floor')
  const hand = m.handUp('r-1')
  ok(hand.ok === true && hand.position === 1, 'an accepted hand is queued')
  await expectThrow(() => m.speak('r-9', 'stranger'), 'VMU_NOT_PERMITTED', 'a member who was not asked cannot speak')
}

// ---- 2. a refused input is NOT an input (the s8-freeze-say regression) ----------------------------
{
  const m = meetingMod.createMeeting({ id: 'mt-2', roster, deliver: async () => {}, clock })
  await m.convene('x')
  await m.openRound({ members: roster })
  m.refuseInput('r-1', 'talked while frozen', 'frozen')
  const st = m.status()
  ok(st.answered === 0 && st.pending.includes('r-1'), 'a refused input leaves the member PENDING and counts nothing')
  await expectThrow(() => m.close('early'), 'VMU_STATE', 'closing an incomplete round is refused by name')
  const forced = await m.close('forced by the chair', { force: true, by: 'acad' })
  ok(forced.forced === true, 'a forced close is allowed but self-reports as forced')
  ok(m.history().some((h) => h.what === 'close-forced'), 'the forced close is audited with who forced it')
}

// ---- 3. explicit end of debate + aggregation gate (R10-2a) -----------------------------------------
{
  const m = meetingMod.createMeeting({ id: 'mt-3', roster, deliver: async () => {}, clock })
  await m.convene('debate')
  await m.openRound({ members: roster })
  ok(m.aggregationAllowed().allowed === false, 'aggregation is refused while the debate is open')
  await expectThrow(() => m.endDebate({ by: 'acad' }), 'VMU_INVALID_ARGUMENT', 'ending a debate needs a reason')
  const ended = m.endDebate({ by: 'acad', reason: 'no new evidence' })
  ok(ended.ok === true && m.aggregationAllowed().allowed === true, 'an explicit end opens the aggregation gate')
  await expectThrow(() => m.endDebate({ by: 'acad', reason: 'again' }), 'VMU_STATE', 'a second end is refused (an end is a fact)')
}

// ---- 4. invited guest speech is recorded and NEVER blocks the round (v5r meeting_invite) -----------
{
  const m = meetingMod.createMeeting({ id: 'mt-4', roster, deliver: async () => {}, clock })
  await m.convene('x')
  await m.openRound({ members: roster })
  await expectThrow(() => m.invite('t-1'), 'VMU_INVALID_ARGUMENT', 'an invitation needs a why (auditable)')
  await expectThrow(() => m.invite('r-1', { why: 'x' }), 'VMU_NOT_PERMITTED', 'a member already asked is not a guest')
  const inv = m.invite('t-1', { by: 'acad', why: 'report the counterexample search' })
  ok(inv.ok === true && m.invite('t-1', { by: 'acad', why: 'again' }).deduped === true, 'inviting twice is idempotent')
  const spoke = m.speakInvited('t-1', 'I searched n<10^6 and found none', { by: 't-1' })
  ok(spoke.ok === true && spoke.countsTowardsRound === false, 'guest speech is recorded and marked as NOT counting')
  ok(m.status().pending.length === 2, 'the guest did not answer the round for anyone')
  ok(m.invitations()[0].speeches.length === 1, 'the invitation keeps the guest text')
  await expectThrow(() => m.speakInvited('t-9', 'hi'), 'VMU_NOT_PERMITTED', 'an uninvited guest cannot speak')
}

// ---- 5. ballot: boolean votes, freeze, tally, reopen ----------------------------------------------
{
  const b = ballotMod.createBallot({ target: 'p-1', eligible: roster, clock })
  await b.open()
  await b.cast('r-1', 1)
  await b.freeze('voting window')
  await expectThrow(() => b.cast('r-2', 1), 'VMU_STATE', 'a frozen ballot refuses a cast BY NAME')
  await b.unfreeze('window closed')
  await b.cast('r-2', 1)
  const tally = await b.close('tally')
  ok(tally.outcome === true && tally.tally.reason === 'unanimous for', 'two unanimous boolean votes decide TRUE')
  await b.reopen('reconsideration')
  ok(b.status().state === 'open' && b.status().voteCount === 0, 'reopen clears the votes and keeps the previous outcome in history')
  ok(b.history().some((h) => h.what === 'reopened' && h.previous === true), 'the previous outcome stays auditable')
}

// ---- 6. option board: minVotes / secrecy / abstention are DECLARED and enforced ---------------------
{
  const declared = boxMod.ALL_BALLOT_KEYS
  for (const k of ['vmu.ballot.minVotes', 'vmu.ballot.secrecy', 'vmu.ballot.abstainAllowed', 'vmu.ballot.abstainCountsForFloor', 'vmu.ballot.tieRule', 'vmu.ballot.roundsMax']) {
    ok(declared.includes(k), 'the option board declares ' + k)
  }
  const box = boxMod.createBallotBox({ clock, settings: { 'vmu.ballot.minVotes': 2, 'vmu.ballot.secrecy': true, 'vmu.ballot.tieRule': 'unresolved' } })
  const opened = box.open({ question: 'ship it?', options: ['yes', 'no'] })
  ok(opened.ok === true && opened.sealed === true, 'a secrect board opens and reports itself sealed')
  const bad = box.open({ question: 'x', options: ['only-one'] })
  ok(bad.ok === false && bad.code === 'VMU_CONFLICT', 'a one-option board is refused by name')
  box.cast({ boxId: opened.boxId, by: 'r-1', choice: 'yes' })
  box.cast({ boxId: opened.boxId, by: 'r-2', choice: 'abstain' })
  const closed = box.close({ boxId: opened.boxId })
  // The v5r two-threshold rule, verbatim: 1 valid vote < minVotes 2 ⇒ "not established", NOT "rejected",
  // and the receipt carries the floor it fell short of.
  ok(closed.ok === false && closed.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET' && closed.tally.floor === 2,
    'a board short of min_votes is NAMED as not-established (never counted as a rejection)')
  ok(closed.tally.votes === 1 && closed.tally.abstain === 1 && closed.tally.cast === 2,
    'abstention is counted APART from the valid votes (D3)')
  const ok2 = boxMod.createBallotBox({ clock, settings: { 'vmu.ballot.minVotes': 2 } })
  const o2 = ok2.open({ question: 'ship?', options: ['yes', 'no'] })
  ok2.cast({ boxId: o2.boxId, by: 'r-1', choice: 'yes' })
  ok2.cast({ boxId: o2.boxId, by: 'r-2', choice: 'yes' })
  const c2 = ok2.close({ boxId: o2.boxId })
  ok(c2.ok === true && c2.outcome === 'yes', 'a board that reaches min_votes produces an outcome')
  ok(box.status({}).boxes === 1, 'status counts the live boxes')
}

// ---- 7. meetings policy layer: bounds, appeal, minutes, quorum ------------------------------------
{
  const remit = meetingsMod.createMeetings({ clock, settings: { 'vmu.meetings.hardLimitMs': 99999999, 'vmu.meetings.wakeRetries': 99 } })
  const k = remit.status().keys
  ok(k['vmu.meetings.hardLimitMs'] === 7200000, 'hardLimitMs is CLAMPED to the declared upper bound')
  ok(k['vmu.meetings.wakeRetries'] === 10, 'wakeRetries is CLAMPED to [0,10]')
  ok(k['vmu.meetings.unansweredInDenominator'] === false, 'the default denominator policy is "unanswered NOT counted" (the v5r rule)')
  const m = meetingsMod.createMeetings({ clock, settings: {} })
  const out = m.open({ type: 'ordinary', chair: 'acad', roster, size: 2 })
  ok(out.ok === true, 'opening an ordinary meeting succeeds')
  const mid = out.meeting || out.id
  m.attend({ meeting: mid, member: 'r-1' })
  m.attend({ meeting: mid, member: 'r-2' })
  const spoke = m.speak({ meeting: mid, member: 'r-1', text: 'point one' })
  ok(spoke.ok === true, 'a member speaks inside the session')
  const motion = m.motion({ meeting: mid, member: 'r-1', kind: 'ordinary', text: 'adjourn' })
  ok(motion.ok === true, 'a motion can be filed')
  const vote = m.vote({ meeting: mid, member: 'r-2', motion: motion.motion || motion.id, value: 1 })
  ok(vote.ok === true, 'a motion can be voted on')
  const appeal = m.fileAppeal({ meeting: mid, member: 'r-1', kind: 'procedural', reason: 'the chair cut me off' })
  ok(appeal.ok === true && appeal.appeal, 'a procedural appeal is filed and receipted (v5r #46 equivalent)')
  const q = m.quorum({ meeting: mid })
  ok(q.ok === true && q.denominatorPolicy === 'present-only' && q.denominator === q.present && q.unansweredList.length === 0,
    'quorum counts the PRESENT members as the denominator and names no one once all attended')
  const qEmpty = meetingsMod.createMeetings({ clock, settings: {} })
  const out2 = qEmpty.open({ type: 'ordinary', chair: 'acad', roster, size: 2 })
  const q2 = qEmpty.quorum({ meeting: out2.meeting || out2.id })
  ok(q2.denominatorPolicy === 'present-only' && q2.unansweredList.length === 2 && q2.denominator === q2.present && q2.denominator < q2.roster,
    'with roster members absent the unanswered are LISTED and EXCLUDED from the denominator (v5r D3)')
  const mins = m.minutes({ meeting: mid, by: 'acad' })
  ok(mins.ok === true, 'minutes can be read out of the session')
  const conf = m.confirmMinutes({ meeting: mid, by: 'acad' })
  ok(conf.ok === true, 'minutes can be confirmed (v5r "上次纪要确认")')
}

// ---- 8. minutes service: draft / append / confirm / actions / persistence -------------------------
{
  const meeting = meetingMod.createMeeting({ id: 'mt-9', roster, deliver: async () => {}, clock })
  await meeting.convene('x')
  const minutes = minutesMod.createMinutes({ clock, settings: {}, meeting })
  const d = minutes.draft({ meetingId: 'mt-9' })
  ok(d.ok === true && d.id === 'mn-1', 'drafting minutes from a live meeting yields a stable id')
  const a = minutes.append({ id: d.id, text: 'r-1: it holds' })
  ok(a.ok === true && a.appended === true, 'a verbatim entry is appended')
  const c = minutes.confirm({ id: d.id, by: 'acad', dissent: ['r-2: unresolved case'], actions: [{ who: 'r-1', due: 'next meeting' }] })
  ok(c.ok === true && c.fingerprint, 'confirming minutes records a fingerprint')
  ok(minutes.actions({ id: d.id }).actions.length === 1, 'the action items are readable')
  const snap = minutes.snapshot()
  const fresh = minutesMod.createMinutes({ clock, settings: {}, meeting })
  const r = fresh.restore(snap)
  ok(r.ok === true && r.counters.minutes === 1, 'minutes restore the records and keep the id counter at max')
  const next = fresh.draft({ meetingId: 'mt-9' })
  ok(next.id === 'mn-2', 'a restored minutes service never re-mints an existing id')
  ok(Object.prototype.hasOwnProperty.call(snap.data, 'droppedVerbatimBytes'), 'the snapshot reports verbatim truncation as a number')
}

// ---- 9. grant: the v5r authority matrix, verbatim ------------------------------------------------
{
  ok(JSON.stringify(grantMod.GRANTABLE_COMMANDS) === JSON.stringify(['assign', 'prioritize', 'nudge', 'convene']),
    'the grantable commands match the v5r matrix exactly')
  ok(JSON.stringify(grantMod.GRANT_SCOPES) === JSON.stringify(['meeting', 'verify', 'once']),
    'the grant scopes match the v5r event-typed scopes exactly')
  const g = grantMod.createGrant({ clock, settings: { 'vmu.grant.enabled': true } })
  const gs = g.status()
  ok(gs.enabled === true && gs.commands.length === 4 && gs.defaultScope === 'once',
    'the grant face is enabled, exposes exactly the four contract commands, and defaults to a once-scope')
}

// ---- 10. the tool faces expose the baseline actions ----------------------------------------------
{
  const TOOL_NAMES = { meeting: 'vibe_vmu_meeting', minutes: 'vibe_vmu_minutes', chat: 'vibe_vmu_chat', mailbox: 'vibe_vmu_mailbox', panel: 'vibe_vmu_panel' }
  const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const { makeMeetingSpec } = await import(pathToFileURL(T('meeting.js')).href)
  const { makeMinutesSpec } = await import(pathToFileURL(T('minutes.js')).href)
  const { makeChatSpec } = await import(pathToFileURL(T('chat.js')).href)
  const { makeMailboxSpec } = await import(pathToFileURL(T('mailbox.js')).href)
  const { makePanelSpec } = await import(pathToFileURL(T('panel.js')).href)
  const specs = {
    meeting: makeMeetingSpec({ param, refused, TOOL_NAMES, kernel: {} }),
    minutes: makeMinutesSpec({ param, refused, TOOL_NAMES, kernel: {} }),
    chat: makeChatSpec({ param, refused, TOOL_NAMES, kernel: {} }),
    mailbox: makeMailboxSpec({ param, refused, TOOL_NAMES, kernel: {} }),
    panel: makePanelSpec({ param, refused, TOOL_NAMES, kernel: {} }),
  }
  for (const [name, spec] of Object.entries(specs)) {
    ok(spec.name === TOOL_NAMES[name] && typeof spec.run === 'function' && Array.isArray(spec.parameters.action.enum),
      'the ' + name + ' spec is well-formed and names its actions')
  }
  ok(specs.chat.parameters.action.enum.includes('mute') && specs.chat.parameters.action.enum.includes('setpolicy'),
    'the chat face exposes mute and setpolicy (admin actions are reachable, not kernel-only)')
  ok(specs.mailbox.parameters.action.enum.includes('flush') && specs.mailbox.parameters.action.enum.includes('anchor'),
    'the mailbox face exposes flush and anchor (ack-after-delivery is reachable)')
  ok(specs.panel.parameters.action.enum.includes('view') && specs.panel.parameters.action.enum.includes('set'),
    'the panel face exposes set and view (the three D-08 fields are reachable)')
  // The kernel-less guard: a face with no mounted primitive must refuse BY NAME, never crash.
  const unmounted = await specs.chat.run({ action: 'status' })
  ok(unmounted.ok === false && unmounted.code === 'VMU_ENGINE_UNAVAILABLE', 'a face without its primitive refuses by name')
}

// ---- 11. the NAMED extension registry (§25.4) covers every baseline-C gap ------------------------
{
  const doc = await readFile(DOC08, 'utf8')
  const rows = doc.split('\n').filter((l) => /^\|\s*\*\*GAP-MTG-\d\d\*\*\s*\|/.test(l))
  const ids = rows.map((l) => /GAP-MTG-(\d\d)/.exec(l)[1])
  ok(rows.length === 12, 'the registry lists exactly 12 named gaps', 'found ' + rows.length)
  ok(new Set(ids).size === ids.length, 'every gap id is unique')
  const emptyClosedBy = rows.filter((l) => {
    const cells = l.split('|').map((x) => x.trim())
    return cells.length < 6 || cells[cells.length - 2] === ''
  })
  ok(emptyClosedBy.length === 0, 'every gap names the layer that must close it (closed-by is never empty)')
  for (const want of ['GAP-MTG-01', 'GAP-MTG-02', 'GAP-MTG-03', 'GAP-MTG-10', 'GAP-MTG-12']) {
    ok(doc.includes(want), 'the registry carries ' + want)
  }
  // Baseline B is documented as COVERED (not a gap): the three user-named asks must not appear as gaps.
  ok(!doc.includes('GAP-MTG-B'), 'no user-named baseline-B item is filed as a gap')
}

console.log('vmu-meeting-parity: ' + passed + ' passed, ' + failed + ' failed')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
