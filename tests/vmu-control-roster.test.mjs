// tests/vmu-control-roster.test.mjs - the roster and membership actions, plus the INERT DEFAULT they must not disturb.
//
// The default is a contract, not an accident: with nothing declared, exactly one tool registers (status), because status is
// how the inert default is observable. A previous round's attempt at a separate members tool broke that, and this test now
// states it, so the next addition has to respect it too.
//
// ★★★★★★★ ROUND 83 - THE LEDGER THIS SUITE ASSERTS WAS WRONG, AND THE SUITE SAID SO BY FAILING. Its section 3 asserted the
// IDENTITY roster's shape (`total`, `capped`, `members[0].memberships`) and hired WITHOUT a slot. But `tools/control.js`
// declares that hire/fire go through the KERNEL SLOTS - the roster the TURN face reads - and Round 44 moved all three
// actions onto that ledger, because the two-ledger split is what made a real institute unable to start: a hire was written
// in one ledger and read from another, the roster stayed empty, every turn answered `no-members`, and the institute could
// never begin. So this suite now asserts the contract that actually holds, and it asserts the part that MATTERS: that a
// hire is SEATED in a declared slot, because the slot is what grants the permissions the turn face enforces.
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

// The declared slots are what make the ledger non-empty: without them there is nowhere to seat anyone and `hire` must be
// refused by name rather than guessing which role a member fills.
const SLOTS = [
  { id: 'member', capacity: 0, permissions: ['speak', 'vote'] },
  { id: 'chair', capacity: 1, permissions: ['convene'] },
]

const install = async (opts) => {
  const kernel = createKernel({ clock: () => 0, settings: {}, slots: SLOTS })
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

console.log('=== 3. THE ROSTER THE TURN FACE READS IS THE LEDGER THIS FACE WRITES ===')
const empty = await call({ action: 'roster' })
ok(empty.ok === true && Array.isArray(empty.roster) && empty.roster.length === 0,
  'roster starts empty and returns the KERNEL SLOT ledger as an array, not the identity roster', { roster: empty.roster })
ok(/kernel\.members/.test(String(empty.source || '')),
  'and it NAMES that ledger, so a reader can tell which of the two rosters answered', String(empty.source || '').slice(0, 90))

// ★ THE SLOT IS CHECKED FIRST, DELIBERATELY: a caller who omitted it must be told about the SLOT, because seating is this
// face's own concept and the point of the ledger fix - not about a later requirement it has not reached yet.
const noSlot = await call({ action: 'hire', member_id: 'r-1', institution: 'inst-a' })
ok(noSlot.ok === false && noSlot.code === 'VMU_INVALID_ARGUMENT' && /member|chair/.test(String(noSlot.hint || '')),
  'hire with no slot is refused BY NAME, and the hint lists the slots actually declared', { code: noSlot.code, hint: String(noSlot.hint || '').slice(0, 90) })

const hired = await call({ action: 'hire', member_id: 'r-1', slot: 'member', institution: 'inst-a' })
ok(hired.ok === true && hired.seated === true && String(hired.slot) === 'member',
  'hire SEATS the member into the declared slot - the seating is the point, not the identity record', { seated: hired.seated, slot: hired.slot })

const after = await call({ action: 'roster' })
ok(after.roster.length === 1 && String(after.roster[0].id) === 'r-1',
  'and the roster the TURN FACE reads now shows that member', { roster: after.roster.map((m) => m.id) })
ok(String(after.roster[0].slot) === 'member',
  'seated in the slot it was given, because the SLOT is what grants the permissions the turn face enforces', { slot: after.roster[0].slot })

const fired = await call({ action: 'fire', member_id: 'r-1', reason: 'left' })
ok(fired.ok === true && fired.unseated === true,
  'fire UNSETS the member from the kernel slot rather than only ending the identity membership', { unseated: fired.unseated })
const afterFire = await call({ action: 'roster' })
// An ended member may remain as a RECORD, but must not remain LIVE in a slot: the turn face selects on live state.
const live = afterFire.roster.filter((m) => String(m.id) === 'r-1' && m.state !== 'ended')
ok(live.length === 0,
  'and nobody is left LIVE in a slot afterwards, so a fired member cannot keep being woken', { live: live.length, states: afterFire.roster.map((m) => m.state) })

console.log('=== 4. REFUSALS ARE BY NAME, NOT BY GUESS ===')
const bad = await call({ action: 'not-an-action' })
ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an unknown action is refused with a code rather than silently ignored', { code: bad.code })
const badHire = await call({ action: 'hire' })
ok(badHire.ok === false || badHire.threw !== undefined, 'and hiring with no member id does not silently create one', { result: badHire.ok })

console.log('=== CONTROL ROSTER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
