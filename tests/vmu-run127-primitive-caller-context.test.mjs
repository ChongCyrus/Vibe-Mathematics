// tests/vmu-run127-primitive-caller-context.test.mjs — F-127a: THE PRIMITIVE FACE NOW ASKS THE TURN WHO IS CALLING.
//
// MEASURED IN RUN 127 (build 3bbc5c37): root opened `m-gate-test-2` through `vibe_vmu_meeting{action:"open"}` without
// naming a member and the receipt said `chairGate{enforced:false, why:"no caller was named (member/by/actor): ... the
// chair gate did not run"}`. The pack declares `vmu.meetings.conveneRequiresChair` = true and the office is NOT a
// member seat — but neither is an unnamed member, and the face could not tell them apart because `run()` threw the
// host's execution context away (`run: async ({ ... } = {}) => ...`).
//
// The host has always handed the spec the context (`toHostSpec().execute(args, exec)`), and
// `host-pack-tools#resolveTurnMember` already answers "which member does this agent play?" for the pack face. This
// suite pins the fix: the two chair gates and the attribution guard fall back to that resolver, and every receipt says
// WHERE the caller came from (`chairGate.callerSource: 'argument' | 'turn-context' | 'none'`).
//
// Run: node tests/vmu-run127-primitive-caller-context.test.mjs
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

console.log('=== 1. THE TURN CONTEXT CAN NAME THE CALLER (the seam this suite exercises) ===')
const root = mkdtempSync(path.join(tmpdir(), 'vmu-127-'))
try {
  const { call, kernel } = await boot(root)
  const start = await call('vibe_v5_start', { problem: '调用者上下文', researcherCount: 2, academician: true })
  ok(start.ok === true, 'the institute started - ' + JSON.stringify(start.ok))
  const roster = kernel.members.roster()
  const chair = roster.find((m) => m.slot === 'chair')
  const member = roster.find((m) => m.slot === 'member')
  ok(chair && member && chair.id !== member.id, 'two different seats exist - chair=' + (chair && chair.id) + ' member=' + (member && member.id))

  // A member turn runs in its own child session; the parent learned the pair and wrote it to the shared fold
  // (F-115a). Teach the kernel the mapping exactly the way the loop does, then confirm the resolver can read it.
  const MEMBER_SESSION = 'child-session-127-member'
  const CHAIR_SESSION = 'child-session-127-chair'
  const learn = (who, sid) => {
    try { if (kernel.turn && typeof kernel.turn.restoreMemberSessions === 'function') kernel.turn.restoreMemberSessions([{ member: who, session: sid }]) } catch { /* keep going */ }
    try { if (typeof kernel.onMemberSession === 'function') kernel.onMemberSession(who, sid) } catch { /* the fold write is best effort */ }
  }
  learn(member.id, MEMBER_SESSION)
  learn(chair.id, CHAIR_SESSION)
  ok(kernel.memberBySession(MEMBER_SESSION) === member.id, 'the kernel maps the member child session to its member - ' + JSON.stringify(kernel.memberBySession(MEMBER_SESSION)))
  ok(kernel.memberBySession(CHAIR_SESSION) === chair.id, 'the kernel maps the chair child session to the chair - ' + JSON.stringify(kernel.memberBySession(CHAIR_SESSION)))
  const execOf = (agentId) => ({ kernel, agent: { id: agentId } })

  console.log('')
  console.log('=== 2. A MEMBER CHILD SESSION THAT NAMES NOBODY IS NOW READ (and refused) ===')
  const memberOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-127-member', agenda: 'member tries silently', roster: [chair.id, member.id] }, execOf(MEMBER_SESSION))
  ok(memberOpen.ok === false && memberOpen.code === 'VMU_NOT_PERMITTED', 'member open WITH NO member argument is refused - ' + JSON.stringify({ ok: memberOpen.ok, code: memberOpen.code }))
  ok(typeof memberOpen.message === 'string' && memberOpen.message.indexOf(member.id) >= 0,
    'the refusal names the member the turn context resolved - ' + String(memberOpen.message).slice(0, 140))
  ok(typeof memberOpen.message === 'string' && memberOpen.message.indexOf('chair seat') >= 0,
    'the refusal still says which seat the action needs - ' + String(memberOpen.message).slice(0, 140))

  const chairOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-127-chair', agenda: 'chair opens silently', roster: [chair.id, member.id] }, execOf(CHAIR_SESSION))
  ok(chairOpen.ok === true, 'the chair child session opens WITHOUT naming itself - ' + JSON.stringify({ ok: chairOpen.ok, code: chairOpen.code, message: String(chairOpen.message || '').slice(0, 160) }))
  ok(chairOpen.chairGate && chairOpen.chairGate.enforced === true && chairOpen.chairGate.seat === 'chair',
    'the receipt reads the chair seat - ' + JSON.stringify(chairOpen.chairGate))
  ok(chairOpen.chairGate && chairOpen.chairGate.callerSource === 'turn-context',
    'the receipt SAYS the name came from the turn, not from an argument - ' + JSON.stringify(chairOpen.chairGate && chairOpen.chairGate.callerSource))

  console.log('')
  console.log('=== 3. THE OFFICE (ROOT) IS STILL NOT REFUSED, AND STILL DISCLOSES WHY IT WAS NOT JUDGED ===')
  const officeOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-127-office', agenda: 'office opens', roster: [chair.id, member.id] }, execOf('session-127-root'))
  ok(officeOpen.ok === true, 'root convenes without a seat - ' + JSON.stringify({ ok: officeOpen.ok, code: officeOpen.code }))
  ok(officeOpen.chairGate && officeOpen.chairGate.enforced === false && officeOpen.chairGate.callerSource === 'none',
    'root receipt says the gate did not run and why - ' + JSON.stringify(officeOpen.chairGate && { enforced: officeOpen.chairGate.enforced, source: officeOpen.chairGate.callerSource }))
  ok(typeof (officeOpen.chairGate && officeOpen.chairGate.why) === 'string' && officeOpen.chairGate.why.indexOf('turn context') >= 0,
    'the no-caller why now mentions the turn context it asked - ' + String(officeOpen.chairGate && officeOpen.chairGate.why).slice(0, 160))

  console.log('')
  console.log('=== 4. THE ATTRIBUTION GUARD LEARNS WHO IS ACTING WHEN `by` IS OMITTED ===')
  const silentByMember = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-127-chair', member: chair.id, reason: 'member tries to mute the chair, without naming itself' }, execOf(MEMBER_SESSION))
  ok(silentByMember.ok === false && silentByMember.code === 'VMU_NOT_PERMITTED',
    'a member child session withdrawing ANOTHER member\'s speech is refused with no `by` - ' + JSON.stringify({ ok: silentByMember.ok, code: silentByMember.code }))
  ok(typeof silentByMember.message === 'string' && silentByMember.message.indexOf('withdraw only its OWN') >= 0,
    'the refusal names the attribution rule - ' + String(silentByMember.message).slice(0, 160))
  const selfSilent = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-127-chair', member: member.id, reason: 'withdrawing my own' }, execOf(MEMBER_SESSION))
  ok(selfSilent.ok === true, 'the same member may still withdraw its OWN speech without `by` - ' + JSON.stringify({ ok: selfSilent.ok, code: selfSilent.code }))
  const officeSilent = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-127-chair', member: member.id, reason: 'office withdraws' }, execOf('session-127-root'))
  ok(officeSilent.ok === true, 'the office (root) keeps its authority to withdraw anyone\'s speech - ' + JSON.stringify({ ok: officeSilent.ok, code: officeSilent.code }))

  console.log('')
  console.log('=== 5. THE CLOSE DOOR ASKS THE SAME WAY ===')
  const memberClose = await call('vibe_vmu_meeting', { action: 'close', id: 'mtg-127-chair', reason: 'member tries to close', force: true }, execOf(MEMBER_SESSION))
  ok(memberClose.ok === false && memberClose.code === 'VMU_NOT_PERMITTED', 'a member child session cannot close, even with force - ' + JSON.stringify({ ok: memberClose.ok, code: memberClose.code }))
  ok(typeof memberClose.message === 'string' && memberClose.message.indexOf(member.id) >= 0, 'the close refusal names the resolved member - ' + String(memberClose.message).slice(0, 140))
  const chairClose = await call('vibe_vmu_meeting', { action: 'close', id: 'mtg-127-chair', reason: 'chair closes', force: true }, execOf(CHAIR_SESSION))
  ok(chairClose.ok === true && chairClose.state === 'closed', 'the chair child session closes without naming itself - ' + JSON.stringify({ ok: chairClose.ok, state: chairClose.state, code: chairClose.code }))
  ok(chairClose.chairGate && chairClose.chairGate.callerSource === 'turn-context' && chairClose.chairGate.seat === 'chair',
    'the close receipt reads the chair seat from the turn - ' + JSON.stringify(chairClose.chairGate))

  console.log('')
  console.log('=== 6. AN EXPLICIT ARGUMENT STILL WINS (and is labelled as such) ===')
  const explicit = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-127-explicit', agenda: 'chair names itself', roster: [chair.id, member.id], member: chair.id }, execOf(CHAIR_SESSION))
  ok(explicit.ok === true, 'an explicit chair id opens - ' + JSON.stringify({ ok: explicit.ok }))
  ok(explicit.chairGate && explicit.chairGate.callerSource === 'argument', 'the receipt labels an argument-sourced caller - ' + JSON.stringify(explicit.chairGate && explicit.chairGate.callerSource))
} finally { rmSync(root, { recursive: true, force: true }) }

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f); process.exit(1) }
console.log('vmu-run127-primitive-caller-context: ' + passed + ' passed, 0 failed')
