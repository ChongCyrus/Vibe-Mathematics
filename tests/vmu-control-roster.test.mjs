// tests/vmu-control-roster.test.mjs - the roster and membership actions, plus the INERT DEFAULT they must not disturb.
//
// The default is a contract, not an accident: with nothing declared, exactly one tool registers (status), because status is
// how the inert default is observable. Last round's attempt at a separate members tool broke that, and this test now states
// it, so the next addition has to respect it too.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createHostAdapter } from '../vibe-math-vmu/host.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const install = async (opts) => {
  const kernel = createKernel({ clock: () => 0, settings: {} })
  const reg = []
  const ctx = { tools: { register: async (s) => { reg.push(s); return () => {} } }, effect: null }
  const adapter = createHostAdapter(Object.assign({ ctx, kernel, settings: {}, instance: 'probe' }, opts))
  await adapter.install()
  return { reg, kernel }
}

console.log('=== 1. THE INERT DEFAULT IS EXACTLY ONE TOOL ===')
const none = await install({})
ok(none.reg.length === 1, 'with nothing declared exactly one tool registers', { registered: none.reg.map((s) => s.name) })
ok(none.reg[0].name === 'vibe_vmu_status', 'and it is status, which is how the inert default is observable')

console.log('=== 2. THE ROSTER ACTIONS APPEAR ONLY WHEN A CONTROL SURFACE IS DECLARED ===')
const withCtl = await install({ controlTool: true })
const ctl = withCtl.reg.find((s) => s.name === 'vibe_vmu_control')
ok(!!ctl, 'declaring a control surface registers vibe_vmu_control')
ok(!none.reg.some((s) => s.name === 'vibe_vmu_control'), 'and NOT declaring one does not - the zero-mechanism rule holds')
// The host spec's execute returns a wrapped tool result; unwrap whatever shape it uses rather than assuming one.
const unwrap = (r) => {
  if (r && typeof r === 'object' && Array.isArray(r.content)) {
    const first = r.content[0]
    const text = first && typeof first.text === 'string' ? first.text : null
    if (text) { try { return JSON.parse(text) } catch { return { raw: text } } }
  }
  if (typeof r === 'string') { try { return JSON.parse(r) } catch { return { raw: r } } }
  return r
}
const call = async (args) => unwrap(await ctl.execute(args))

console.log('=== 3. ROSTER, HIRE AND FIRE GO THROUGH THE KERNEL PRIMITIVES ===')
const empty = await call({ action: 'roster' })
ok(empty.ok === true && empty.total === 0, 'roster starts empty and reports a total', { total: empty.total })
ok(empty.capped === false, 'and reports whether it was capped, because an unbounded roster would be a dump')
const hired = await call({ action: 'hire', member_id: 'r-1', institution: 'inst-a' })
ok(hired.ok === true && hired.institution === 'inst-a', 'hire records the membership', { hired: hired.memberId })
const after = await call({ action: 'roster' })
ok(after.total === 1 && after.members[0].id === 'r-1', 'and the roster then shows that member', { total: after.total })
ok(after.members[0].memberships.length === 1, 'with the membership the hire created', { memberships: after.members[0].memberships })
const fired = await call({ action: 'fire', member_id: 'r-1', reason: 'left' })
ok(fired.ok === true && fired.endedAt !== undefined, 'fire ends the membership through the same primitive the library exposes', { disposition: fired.disposition })

console.log('=== 4. REFUSALS ARE BY NAME, NOT BY GUESS ===')
const bad = await call({ action: 'not-an-action' })
ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an unknown action is refused with a code rather than silently ignored', { code: bad.code })
const badHire = await call({ action: 'hire' })
ok(badHire.ok === false || badHire.threw !== undefined, 'and hiring with no member id does not silently create one', { result: badHire.ok })

console.log('=== CONTROL ROSTER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
