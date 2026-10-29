// tests/vmu-run125-primitive-seat-gate.test.mjs — F-125a: ONE ACTION, TWO DOORS, ONE GATE.
//
// MEASURED IN RUN 125: the pack declares `vmu.meetings.conveneRequiresChair` / `vmu.meetings.closeRequiresChair` =
// true, the teaching says "召集与关闭只对 chair 席开放" (`v5r-blocks-b.js:798`), and the SERVICE face refused member
// r-2's convene by name — while the SAME member, through the PRIMITIVE face, opened a meeting (`mtg-r2-attempt-1`,
// ok:true), marked the CHAIR silent (`silent{member:"r-acad",by:"r-2"}`, ok:true) and closed the meeting (ok:true).
// The rule lived on one door only.
//
// WHAT THIS SUITE PROVES:
//   · a member's primitive `open` is refused by name when the setting is on, and the chair's is accepted (with a
//     `chairGate` reading in the receipt);
//   · a member cannot mark ANOTHER member silent (attribution), while the chair can;
//   · a member cannot close a primitive meeting, the chair can;
//   · a caller that names NO seat (the office/root path) is not refused, but the receipt SAYS the gate did not run.
//
// Run: node tests/vmu-run125-primitive-seat-gate.test.mjs
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
  const call = async (name, args) => {
    const spec = byName.get(name)
    if (!spec) throw new Error('tool not registered: ' + name)
    let raw
    try { raw = await spec.execute(args || {}, { kernel: handle.kernel }) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROWN', message: String((e && e.message) || e), hint: e && e.hint }
    }
    const text = raw && typeof raw === 'object' && typeof raw.content === 'string' ? raw.content : raw
    if (typeof text === 'string') { try { return JSON.parse(text) } catch { return { raw: text } } }
    return text || {}
  }
  return { call, kernel: handle.kernel }
}

console.log('=== 1. THE GATE IS ON IN THIS DEPLOYMENT (the pack declares it) ===')
const root = mkdtempSync(path.join(tmpdir(), 'vmu-125-'))
try {
  const { call, kernel } = await boot(root)
  ok(kernel.settingOf('vmu.meetings.conveneRequiresChair') === true, 'vmu.meetings.conveneRequiresChair is declared true by the v5r pack - ' + JSON.stringify(kernel.settingOf('vmu.meetings.conveneRequiresChair')))
  ok(kernel.settingOf('vmu.meetings.closeRequiresChair') === true, 'vmu.meetings.closeRequiresChair is declared true by the v5r pack - ' + JSON.stringify(kernel.settingOf('vmu.meetings.closeRequiresChair')))
  const start = await call('vibe_v5_start', { problem: '席位门', researcherCount: 2, academician: true })
  ok(start.ok === true, 'the institute started - ' + JSON.stringify(start.ok))
  const roster = kernel.members.roster()
  const chair = roster.find((m) => m.slot === 'chair')
  const member = roster.find((m) => m.slot === 'member')
  ok(chair && member && chair.id !== member.id, 'two different seats exist - chair=' + (chair && chair.id) + ' member=' + (member && member.id))
  ok(kernel.seatOfMember(chair.id) === 'chair' && kernel.seatOfMember(member.id) === 'member', 'the seat accessor reads the roster in both directions')

  console.log('')
  console.log('=== 2. A MEMBER CANNOT OPEN A PRIMITIVE MEETING; THE CHAIR CAN ===')
  const memberOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-125-member', agenda: 'member tries', roster: [chair.id, member.id], member: member.id })
  ok(memberOpen.ok === false && memberOpen.code === 'VMU_NOT_PERMITTED', 'member open refused by name - ' + JSON.stringify({ ok: memberOpen.ok, code: memberOpen.code }))
  ok(typeof memberOpen.message === 'string' && memberOpen.message.indexOf('chair seat') >= 0, 'the refusal names the seat it needs - ' + String(memberOpen.message).slice(0, 120))
  ok(typeof memberOpen.hint === 'string' && memberOpen.hint.indexOf('BOTH doors') >= 0, 'the hint says the gate covers both doors - ' + String(memberOpen.hint).slice(0, 120))
  const chairOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-125-chair', agenda: 'chair opens', roster: [chair.id, member.id], member: chair.id })
  ok(chairOpen.ok === true && chairOpen.id === 'mtg-125-chair', 'chair open accepted - ' + JSON.stringify({ ok: chairOpen.ok, id: chairOpen.id }))
  ok(chairOpen.chairGate && chairOpen.chairGate.enforced === true && chairOpen.chairGate.seat === 'chair', 'the receipt shows the gate ran and the seat it read - ' + JSON.stringify(chairOpen.chairGate))

  console.log('')
  console.log('=== 3. A MEMBER CANNOT WITHDRAW ANOTHER MEMBER\'S SPEECH; THE CHAIR CAN ===')
  const impersonate = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-125-chair', member: chair.id, by: member.id, reason: 'member tries to mute the chair' })
  ok(impersonate.ok === false && impersonate.code === 'VMU_NOT_PERMITTED', 'member muting the chair refused - ' + JSON.stringify({ ok: impersonate.ok, code: impersonate.code }))
  ok(typeof impersonate.message === 'string' && impersonate.message.indexOf('withdraw only its OWN') >= 0, 'the refusal names the attribution rule - ' + String(impersonate.message).slice(0, 140))
  const selfSilent = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-125-chair', member: member.id, by: member.id, reason: 'withdrawing my own speech' })
  ok(selfSilent.ok === true, 'a member may still withdraw its OWN speech - ' + JSON.stringify(selfSilent.ok))
  const chairSilent = await call('vibe_vmu_meeting', { action: 'silent', id: 'mtg-125-chair', member: member.id, by: chair.id, reason: 'chair withdraws the member speech' })
  ok(chairSilent.ok === true, 'the chair may withdraw another member\'s speech - ' + JSON.stringify(chairSilent.ok))

  console.log('')
  console.log('=== 4. A MEMBER CANNOT CLOSE A PRIMITIVE MEETING; THE CHAIR CAN ===')
  const memberClose = await call('vibe_vmu_meeting', { action: 'close', id: 'mtg-125-chair', actor: member.id, reason: 'member tries to close', force: true })
  ok(memberClose.ok === false && memberClose.code === 'VMU_NOT_PERMITTED', 'member close refused - ' + JSON.stringify({ ok: memberClose.ok, code: memberClose.code }))
  ok(typeof memberClose.message === 'string' && memberClose.message.indexOf('closeRequiresChair') >= 0, 'the refusal names the setting - ' + String(memberClose.message).slice(0, 120))
  const chairClose = await call('vibe_vmu_meeting', { action: 'close', id: 'mtg-125-chair', actor: chair.id, reason: 'chair closes', force: true })
  ok(chairClose.ok === true && chairClose.state === 'closed', 'chair close accepted - ' + JSON.stringify({ ok: chairClose.ok, state: chairClose.state, code: chairClose.code, message: String(chairClose.message || '').slice(0, 200) }))
  ok(chairClose.chairGate && chairClose.chairGate.seat === 'chair', 'the close receipt also shows the gate reading - ' + JSON.stringify(chairClose.chairGate))

  console.log('')
  console.log('=== 5. THE OFFICE PATHS STILL WORK, AND SAY THE GATE DID NOT RUN ===')
  const officeOpen = await call('vibe_vmu_meeting', { action: 'open', id: 'mtg-125-office', agenda: 'office opens', roster: [chair.id, member.id] })
  ok(officeOpen.ok === true, 'a caller that names no seat is not refused - ' + JSON.stringify(officeOpen.ok))
  ok(officeOpen.chairGate && officeOpen.chairGate.enforced === false && typeof officeOpen.chairGate.why === 'string', 'the receipt discloses that the gate did not run - ' + JSON.stringify(officeOpen.chairGate && officeOpen.chairGate.enforced))
} finally { rmSync(root, { recursive: true, force: true }) }

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f); process.exit(1) }
console.log('vmu-run125-primitive-seat-gate: ' + passed + ' passed, 0 failed')
