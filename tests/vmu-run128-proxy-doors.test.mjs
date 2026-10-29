// tests/vmu-run128-proxy-doors.test.mjs — RUN 128: ONE ACTION, TWO DOORS — AND ONLY ONE DOOR HAD A LOCK.
//
// MEASURED IN RUN 128 (build 4bc5db49). A member child session (r-1's own turn, so the turn context named it) did
// four things that the institution's rules forbid, and three of them WORKED:
//
//   F-128b  `vibe_vmu_mailbox{action:"send", from:"office", …}` → ok:true, delivered as OFFICE mail (ml-12). The
//           human face refused the same member with VMU_HUMAN_INJECT_ROLE in the same round; the mailbox face
//           checked nothing. `from` was a label, not a claim about the caller.
//   F-128c  `vibe_vmu_panel{action:"set", member:"r-2", by:"r-1", overall:"…"}` → ok:true, changed:["overall"],
//           mirrored into r-2's self-report. `member` is the TARGET and `by` is a label; a member could write
//           another member's panel (D7) through this door while the pack's records path already refused it.
//   F-128d  The chair's own turn called `vibe_v5_meeting{agenda, title, type}` with no `member` and got
//           「meeting (convening) needs the acting member id」 — the same session whose identity the primitive face
//           had just learned to read (F-127a). Two faces of one institution disagreed about whether the turn knows
//           who is calling.
//   F-128a  `openApproval` takes the id as `requestId`; decide/state/withdraw read `request_id`. Passing the id
//           back under the name openApproval itself accepts produced `VMU_INVALID_ARGUMENT "unknown approval:
//           undefined"` — a refusal that prints the word it never received.
//
// The invariant this suite pins: when the turn context can NAME the caller, a write or a signature in someone
// else's name is refused BY NAME; when it cannot (the office/root), the faces keep their old behaviour. A face
// that cannot tell who is calling must not silently accept the strongest claim in the call.
//
// Run: node tests/vmu-run128-proxy-doors.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href

let passed = 0
const failures = []
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ok   ' + msg) } else { failures.push(msg); console.log('  FAIL ' + msg) } }

let NOW = 1_000
async function boot(root) {
  const entry = await import(ENTRY)
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, get: () => undefined, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => (NOW += 1_000), packs: ['v5r'], root })
  await handle.ready()
  const byName = new Map(specs.map((t) => [t.name, t]))
  const call = async (name, args, exec) => {
    const spec = byName.get(name)
    if (!spec) throw new Error('tool not registered: ' + name)
    let raw
    try { raw = await spec.execute(args || {}, exec === undefined ? { kernel: handle.kernel } : exec) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROWN', message: String((e && e.message) || e), hint: e && e.hint }
    }
    const text = raw && typeof raw === 'object' && typeof raw.content === 'string' ? raw.content : raw
    if (typeof text === 'string') { try { return JSON.parse(text) } catch { return { raw: text } } }
    return text || {}
  }
  return { call, kernel: handle.kernel }
}

const root = mkdtempSync(path.join(tmpdir(), 'vmu-128-'))
try {
  const { call, kernel } = await boot(root)
  const start = await call('vibe_v5_start', { problem: '席位门与代理权：四种调用者', researcherCount: 2, academician: true })
  ok(start.ok === true, 'the institute started - ' + JSON.stringify(start.ok))
  const roster = kernel.members.roster()
  const chair = roster.find((m) => m.slot === 'chair')
  const members = roster.filter((m) => m.slot === 'member')
  ok(!!chair && members.length >= 2, 'a chair and at least two resident seats exist - ' + JSON.stringify(roster.map((m) => m.id + ':' + m.slot)))
  const MEMBER = members[0].id
  const OTHER = members[1].id
  const CHAIR = chair.id

  // The loop learns (member ⇄ child session) pairs and writes them into the shared fold (F-115a). Teach the kernel
  // the same way, so `resolveTurnMember` answers exactly as it does in a live run.
  const MEMBER_SESSION = 'child-session-128-member'
  const CHAIR_SESSION = 'child-session-128-chair'
  // ONE restore call with BOTH pairs: `restoreMemberSessions` REPLACES the map, so learning the second pair alone
  // erases the first one (a test that teaches one at a time silently loses the other).
  try { if (kernel.turn && typeof kernel.turn.restoreMemberSessions === 'function') kernel.turn.restoreMemberSessions([{ member: MEMBER, session: MEMBER_SESSION }, { member: CHAIR, session: CHAIR_SESSION }]) } catch { /* best effort */ }
  try { if (typeof kernel.onMemberSession === 'function') kernel.onMemberSession(MEMBER, MEMBER_SESSION) } catch { /* best effort */ }
  try { if (typeof kernel.onMemberSession === 'function') kernel.onMemberSession(CHAIR, CHAIR_SESSION) } catch { /* best effort */ }
  ok(kernel.memberBySession(MEMBER_SESSION) === MEMBER, 'the kernel maps the member child session - ' + JSON.stringify(kernel.memberBySession(MEMBER_SESSION)))
  ok(kernel.memberBySession(CHAIR_SESSION) === CHAIR, 'the kernel maps the chair child session - ' + JSON.stringify(kernel.memberBySession(CHAIR_SESSION)))
  const execOf = (agentId) => ({ kernel, agent: { id: agentId } })

  console.log('')
  console.log('=== 1. F-128d: THE PACK CONVENE READS THE TURN WHEN `member` IS ABSENT ===')
  const chairConvene = await call('vibe_v5_meeting', { agenda: '主席在自己回合里不点名召集', type: 'planning', title: '不点名召集' }, execOf(CHAIR_SESSION))
  ok(chairConvene.ok === true, 'the CHAIR turn convenes without naming itself (the turn context answers) - ' + JSON.stringify({ ok: chairConvene.ok, code: chairConvene.code, message: String(chairConvene.message || '').slice(0, 180) }))
  const meetingId = chairConvene.meeting
  ok(typeof meetingId === 'string' && meetingId !== '', 'the receipt names the meeting it created - ' + JSON.stringify(meetingId))

  const memberConvene = await call('vibe_v5_meeting', { agenda: '委员在自己回合里不点名召集' }, execOf(MEMBER_SESSION))
  // The member's SEAT FACE does not include the convening face at all, so the refusal arrives from the face gate
  // BEFORE the chair gate can speak. Either way the answer must be a named no that identifies the caller.
  ok(memberConvene.ok === false && (memberConvene.code === 'VMU_NOT_PERMITTED' || memberConvene.code === 'VMU_TOOL_NOT_IN_FACE'),
    'the MEMBER turn convening is refused (by the seat face or the chair gate) - ' + JSON.stringify({ ok: memberConvene.ok, code: memberConvene.code }))
  ok(String(memberConvene.message).indexOf(MEMBER) >= 0, 'the refusal names the member the turn resolved - ' + String(memberConvene.message).slice(0, 160))
  ok(/chair seat|seat face/.test(String(memberConvene.message)), 'the refusal says which door refused it (a seat, not a nameless nobody) - ' + String(memberConvene.message).slice(0, 160))
  ok(String(memberConvene.message).indexOf('[object Object]') < 0, 'the refusal does not print an object literal as its reason - ' + String(memberConvene.message).slice(0, 160))

  const explicitWins = await call('vibe_v5_meeting', { agenda: '办公室点名主席', member: CHAIR })
  ok(explicitWins.ok === true, 'the office still convenes when it NAMES the chair explicitly (an argument is not overridden by the turn) - ' + JSON.stringify({ ok: explicitWins.ok, code: explicitWins.code }))

  console.log('')
  console.log('=== 2. F-128b: A MEMBER MAY NOT SIGN MAIL AS ANOTHER SEAT ===')
  const asOffice = await call('vibe_vmu_mailbox', { action: 'send', from: 'office', to: CHAIR, subject: '代所办发信', text: '我要以所办名义发信' }, execOf(MEMBER_SESSION))
  ok(asOffice.ok === false && asOffice.code === 'VMU_NOT_PERMITTED', 'a member signing as office is REFUSED - ' + JSON.stringify({ ok: asOffice.ok, code: asOffice.code, message: String(asOffice.message || '').slice(0, 160) }))
  ok(String(asOffice.message).indexOf(MEMBER) >= 0 && String(asOffice.message).indexOf('office') >= 0, 'the refusal names BOTH the caller and the signature - ' + String(asOffice.message).slice(0, 200))
  ok(asOffice.caller === MEMBER && asOffice.callerSource === 'turn-context', 'the refusal reports where the caller came from - ' + JSON.stringify({ caller: asOffice.caller, callerSource: asOffice.callerSource }))

  const asSelf = await call('vibe_vmu_mailbox', { action: 'send', from: MEMBER, to: CHAIR, subject: '本人发信', text: '以自己名义发信' }, execOf(MEMBER_SESSION))
  ok(asSelf.ok === true, 'the member may send under its OWN id - ' + JSON.stringify({ ok: asSelf.ok, code: asSelf.code, ids: asSelf.ids }))
  ok(asSelf.caller === MEMBER && asSelf.callerSource === 'turn-context', 'the accepted send also says who signed it - ' + JSON.stringify({ caller: asSelf.caller, callerSource: asSelf.callerSource }))

  const officeRelay = await call('vibe_vmu_mailbox', { action: 'send', from: 'office', to: CHAIR, subject: '所办发信', text: '办公室自己发信' })
  ok(officeRelay.ok === true, 'the office (root, no member seat) keeps the right to send as office - ' + JSON.stringify({ ok: officeRelay.ok, code: officeRelay.code }))

  const seatRelay = await call('vibe_v5_message', { member: CHAIR, to: MEMBER, subject: '转报', content: '由主席席转报' })
  ok(seatRelay.ok === true && seatRelay.relayedBy === 'office', 'the pack relay path still says the OFFICE relayed it (that door is unchanged) - ' + JSON.stringify({ ok: seatRelay.ok, relayedBy: seatRelay.relayedBy }))

  console.log('')
  console.log('=== 3. F-128c: A MEMBER MAY NOT WRITE ANOTHER MEMBER PANEL ===')
  const otherPanel = await call('vibe_vmu_panel', { action: 'set', member: OTHER, by: MEMBER, overall: '越界写入' }, execOf(MEMBER_SESSION))
  ok(otherPanel.ok === false && otherPanel.code === 'VMU_NOT_PERMITTED', 'a member writing ANOTHER member panel is REFUSED (D7) - ' + JSON.stringify({ ok: otherPanel.ok, code: otherPanel.code, message: String(otherPanel.message || '').slice(0, 160) }))
  ok(String(otherPanel.message).indexOf(MEMBER) >= 0 && String(otherPanel.message).indexOf(OTHER) >= 0, 'the refusal names the caller and the target - ' + String(otherPanel.message).slice(0, 200))
  const untouched = await call('vibe_vmu_panel', { action: 'get', member: OTHER })
  const overallAfter = untouched.known === false ? '' : String((untouched.fields && untouched.fields.overall) || '')
  ok(untouched.ok === true && overallAfter === '', 'the refused write left the target panel EMPTY (a refusal that still writes is worthless) - ' + JSON.stringify({ known: untouched.known, overall: overallAfter }))

  const ownPanel = await call('vibe_vmu_panel', { action: 'set', member: MEMBER, overall: '本人的总目标' }, execOf(MEMBER_SESSION))
  ok(ownPanel.ok === true, 'the member writes its OWN panel - ' + JSON.stringify({ ok: ownPanel.ok, code: ownPanel.code }))
  ok(ownPanel.caller === MEMBER && ownPanel.callerSource === 'turn-context', 'the accepted write records the caller it resolved - ' + JSON.stringify({ caller: ownPanel.caller, callerSource: ownPanel.callerSource }))
  const ownHistory = await call('vibe_vmu_panel', { action: 'history', member: MEMBER })
  const firstAuthor = ownHistory.ok && Array.isArray(ownHistory.entries) && ownHistory.entries.length ? String(ownHistory.entries[0].by) : null
  ok(firstAuthor === MEMBER, 'an omitted `by` is filled with the caller, so the append-only history has an author - ' + JSON.stringify({ firstAuthor }))

  const forgedBy = await call('vibe_vmu_panel', { action: 'set', member: MEMBER, by: CHAIR, overall: '冒名写' }, execOf(MEMBER_SESSION))
  ok(forgedBy.ok === false && forgedBy.code === 'VMU_NOT_PERMITTED', 'a member attributing its write to another seat is refused - ' + JSON.stringify({ ok: forgedBy.ok, code: forgedBy.code }))

  const officePanel = await call('vibe_vmu_panel', { action: 'set', member: OTHER, overall: '所办代记' })
  ok(officePanel.ok === true, 'the office may record a panel for a member (that is the sanctioned path) - ' + JSON.stringify({ ok: officePanel.ok, code: officePanel.code }))

  console.log('')
  console.log('=== 4. F-128a: ONE FACE, ONE APPROVAL ID — UNDER BOTH NAMES IT DECLARES ===')
  const opened = await call('vibe_vmu_human', { action: 'openApproval', requestId: 'rq-128-suite', subject: '测试审批' })
  ok(opened.ok === true && opened.id === 'rq-128-suite', 'openApproval takes its id as `requestId` - ' + JSON.stringify({ ok: opened.ok, id: opened.id }))
  const byCamel = await call('vibe_vmu_human', { action: 'decide', allow: true, requestId: 'rq-128-suite' })
  ok(byCamel.ok === true && byCamel.decision === 'allowed', 'decide accepts the SAME id under `requestId` (it is declared on this face) - ' + JSON.stringify({ ok: byCamel.ok, code: byCamel.code, message: String(byCamel.message || '').slice(0, 160), decision: byCamel.decision }))
  const stateCamel = await call('vibe_vmu_human', { action: 'approvalState', requestId: 'rq-128-suite' })
  ok(stateCamel.ok === true, 'approvalState accepts `requestId` too - ' + JSON.stringify({ ok: stateCamel.ok, code: stateCamel.code }))
  const opened2 = await call('vibe_vmu_human', { action: 'openApproval', requestId: 'rq-128-suite-2' })
  ok(opened2.ok === true, 'a second approval for the missing-id case - ' + JSON.stringify(opened2.ok))
  const noId = await call('vibe_vmu_human', { action: 'decide', allow: true })
  ok(noId.ok === false && noId.code === 'VMU_INVALID_ARGUMENT', 'decide without an id is a NAMED refusal - ' + JSON.stringify({ ok: noId.ok, code: noId.code }))
  ok(String(noId.message).indexOf('undefined') < 0, 'the refusal no longer prints the word it never received ("undefined") - ' + String(noId.message).slice(0, 160))
  ok(/request_id/.test(String(noId.hint)), 'the hint names the parameter to pass - ' + String(noId.hint).slice(0, 200))

  console.log('')
  console.log('=== 5. THE OLD BEHAVIOUR IS INTACT WHERE NO CALLER EXISTS (root / office paths) ===')
  const rootPanel = await call('vibe_vmu_panel', { action: 'get', member: MEMBER })
  ok(rootPanel.ok === true, 'the office still READS any panel - ' + JSON.stringify(rootPanel.ok))
  const rootMail = await call('vibe_vmu_mailbox', { action: 'send', from: 'r-acad', to: MEMBER, text: '所办替主席席发信' })
  ok(rootMail.ok === true, 'the office still sends under any seat (relay) - ' + JSON.stringify({ ok: rootMail.ok, code: rootMail.code }))
} finally {
  try { rmSync(root, { recursive: true, force: true, maxRetries: 5 }) } catch { /* windows locks */ }
}

console.log('')
console.log('passed=' + passed + ' failed=' + failures.length)
if (failures.length) { console.log('FAILURES: ' + failures.join(' | ')); process.exitCode = 1 }
