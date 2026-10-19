// tests/vmu-host-deliver-wiring.test.mjs — ROUND 87. THE DELIVERED SEAM MUST KEEP ITS OWN CAPABILITIES.
//
// THE DEFECT THIS PINS, MEASURED ON A REAL MACHINE. The entry assembled the turn-delivery seam and then returned it from
// a wrapper: `async ({ turn, text }) => callerSeam({ turn, text })`. In `caller` mode that arrow DOES the delivering, but
// it does not CARRY the seam's `supply`/`pending`/`awaiting`, so `kernel.turn.supplyMemberReply()` refused every reply the
// calling session handed back - twenty-one times in one run, each with "this delivery seam does not accept a
// caller-supplied reply". The caller-played route never delivered a single member turn, and the transcript looked as
// though replies were flowing because the task instructions quoted the phrase `supplied-by-caller` back into it. The
// seam's own fields were absent the whole time: `stopReason:"supplied-by-caller"` and `deliveryPath:"caller"` each
// occurred ZERO times. ★ A WRAPPER THAT HIDES THE CAPABILITY IT WRAPS is the whole bug, and the lesson is the one this
// repository keeps re-learning: read the seam's own output, never a word that merely appears in a transcript.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnDeliver } from '../vibe-math-vmu/host-deliver.js'
import { deliverByReturning, deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const build = (config) => createTurnDeliver({ ctx: { get: () => null }, config, settings: {}, deliverViaSubagents, deliverByReturning })

console.log('=== 1. CALLER MODE: THE RETURNED THING **IS** THE SEAM, CAPABILITIES INCLUDED ===')
{
  const seam = build({ vmu: { deliverMode: 'caller' } })
  ok(typeof seam === 'function', 'it is callable, so the turn loop can await it', { type: typeof seam })
  ok(typeof seam.supply === 'function',
    '★★★ and it still carries `supply` - the wrapper used to swallow it, which is what refused every caller-supplied reply on a real machine')
  ok(typeof seam.pending === 'function' && typeof seam.awaiting === 'function',
    'and the rest of its own surface travels with it (`pending`, `awaiting`)')
}

console.log('=== 2. AND THE WHOLE CHAIN WORKS: step hands a prompt back, the reply is ACCEPTED, the seam says so ===')
{
  const seam = build({ vmu: { deliverMode: 'caller' } })
  const kernel = createKernel({
    clock: () => 1000, settings: {}, deliverTurn: seam,
    slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }],
  })
  const first = await kernel.turn.step({ members: [{ id: 'm1', role: 'member' }], phase: 'founding' })
  ok(first.ok === true && first.awaiting === true, 'the round hands the member prompt back', { awaiting: first.awaiting })
  const supplied = kernel.turn.supplyMemberReply('{"say":"ok","vote_solved":true}')
  ok(supplied && supplied.ok === true,
    '★★★ the reply is ACCEPTED rather than refused - this is the exact call that failed twenty-one times on the real machine',
    { supplied })
  // ★ THE ASSERTION THAT WOULD HAVE CAUGHT IT, THROUGH THE REAL GLUE: the seam built by the entry itself, driving a
  // round that ends in the member's vote being recorded. A field of the seam's own output is read - not a phrase from
  // anywhere else - and the vote is the consequence.
  const real = build({ vmu: { deliverMode: 'caller' } })
  const k2 = createKernel({
    clock: () => 1000, settings: {}, deliverTurn: real,
    slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }],
  })
  await k2.members.hire({ id: 'm1', slot: 'member' })
  const handed = await k2.turn.step({ members: [{ id: 'm1', role: 'member' }], phase: 'founding' })
  ok(handed.ok === true && handed.awaiting === true && handed.memberPrompt && handed.memberPrompt.member === 'm1',
    'the entry s own seam hands back a prompt NAMING the member, so attribution has something to work from',
    { prompt: handed.memberPrompt })
  k2.turn.supplyMemberReply('{"say":"ok","vote_solved":true}')
  await k2.turn.step({ members: [{ id: 'm1', role: 'member' }], phase: 'founding' })
  const rec = k2.status({ detail: 'summary' }).closureVoteRecorded
  ok(rec.m1 === true,
    '★★★ and the member s vote reaches the ledger THROUGH THE ENTRY S OWN SEAM - the end-to-end path the real machine uses, where a wrapper that hid `supply` made this impossible',
    { recorded: rec })
}

console.log('=== 3. THE HOST BRIDGE KEEPS ITS OWN WRAPPER (the fix must not leak into the other route) ===')
{
  const bridge = build({})
  ok(typeof bridge === 'function' && typeof bridge.supply !== 'function',
    'the subagents bridge is still a plain callable without the caller seam s methods, so the two routes stay distinct',
    { supply: typeof bridge.supply })
  // The bridge REFUSES BY THROWING a named error rather than returning a fake reply - that is this framework's shape for
  // "I cannot do this", and asserting on the code is stronger than asserting on a return value.
  let refused = null
  try { await bridge({ turn: { id: 't', member: 'm1' }, text: 'x' }) } catch (e) { refused = e }
  ok(refused !== null && refused.code === 'VMU_ENGINE_UNAVAILABLE',
    'and calling it without a host seam REFUSES BY NAME rather than pretending a member answered',
    { code: refused && refused.code })
}

console.log('=== 4. THE ONE-SHOT PARENT IS THE CALLING AGENT (`currentInitiator`), NOT A GUESS FROM A LIST ===')
{
  // ★ MEASURED ON A REAL HOST: a v3 run driven from a tool turn (`vibe_vmu_turn`) had neither a configured session id
  // nor a single-entry agent list, so `parent` stayed null and the host provider read `null.options`: "the host refused
  // to start this member turn twice on the one-shot path". The host exposes the initiating Agent by name.
  const initiator = { options: { preset: 'vibe-math-vmu' }, session: { id: 'session-1' } }
  const seen = []
  const subagents = {
    list: () => ['one-shot-provider'],
    start: async (provider, request) => { seen.push({ provider, request }); return { reply: 'member-reply' } },
  }
  const ctx = {
    get: (name) => name === 'agents'
      ? { list: () => ['x', 'y'], get: () => null, currentInitiator: () => initiator }
      : (name === 'subagents' ? subagents : null),
  }
  const seam = createTurnDeliver({ ctx, config: {}, settings: {}, deliverViaSubagents, deliverByReturning })
  const reply = await seam({ turn: { id: 't-real', member: 'verifier-a' }, text: 'judge' })
  ok(JSON.stringify(reply).includes('member-reply'), 'the one-shot delivery returns the provider reply', { reply })
  ok(seen.length === 1 && seen[0].request.parent === initiator,
    '★ the request carries the CALLING Agent as parent (resolved from currentInitiator, not from the id list)',
    { parentKind: seen[0] && (seen[0].request.parent === initiator ? 'initiator' : seen[0].request.parent) })
  ok(seen[0].request.parent.options && seen[0].request.parent.session,
    'the parent is the shape the host reads (`.options` and `.session`) - the two fields the null-parent failure lacked')
  // Reverse: no initiator and a MULTI-entry list must NOT invent a parent. Since the root-binding change it refuses
  // BY NAME instead of calling the host with parent=null (that null was the real "reading 'options'" failure).
  const seen2 = []
  const subagents2 = { list: () => ['p'], start: async (provider, request) => { seen2.push(request); return { reply: 'r2' } } }
  const ctx2 = { get: (name) => name === 'agents' ? { list: () => ['x', 'y'], get: () => null } : (name === 'subagents' ? subagents2 : null) }
  const seam2 = createTurnDeliver({ ctx: ctx2, config: {}, settings: {}, deliverViaSubagents, deliverByReturning })
  let noParent = null
  try { await seam2({ turn: { id: 't-null', member: 'm' }, text: 'x' }) } catch (e) { noParent = e }
  ok(noParent !== null && noParent.code === 'VMU_ENGINE_UNAVAILABLE' && seen2.length === 0,
    'reverse: without an initiator/binding a multi-entry id list does NOT get an arbitrary parent - the delivery refuses by name before the host',
    { code: noParent && noParent.code, calls: seen2.length })
}

console.log('=== 5. THE BOUND ROOT AGENT: tick/timer deliveries have a parent even outside a turn (and no root is NAMED) ===')
{
  // ★ MEASURED: a scheduler tick is outside every turn initiator boundary, so `currentInitiator()` cannot answer and an
  // id list with more than one agent cannot pick one. The entry binds the root Agent when the host first shows it
  // (`exec.agent` on a tool call); this seam must accept that binding and use it as the one-shot parent.
  const root = { options: { preset: 'vibe-math-vmu' }, session: { id: 'root-session' } }
  const seen = []
  const subagents = { list: () => ['spawn'], start: async (provider, request) => { seen.push(request); return { reply: 'ok' } } }
  const ctx = { get: (name) => name === 'agents' ? { list: () => ['x', 'y'], get: () => null } : (name === 'subagents' ? subagents : null) }
  const seam = createTurnDeliver({ ctx, config: {}, settings: {}, deliverViaSubagents, deliverByReturning, getRootAgent: () => root })
  await seam({ turn: { id: 't-tick', member: 'planner-a' }, text: 'plan' })
  ok(seen.length === 1 && seen[0].parent === root,
    '★ a tick delivery uses the BOUND root Agent as parent (not currentInitiator, not a guess)', { bound: seen[0] && seen[0].parent === root })
  const seen2 = []
  const subagents2 = { list: () => ['spawn'], start: async (provider, request) => { seen2.push(request); return { reply: 'ok' } } }
  const ctx2 = { get: (name) => name === 'agents' ? { list: () => ['x', 'y'], get: () => null } : (name === 'subagents' ? subagents2 : null) }
  const seam2 = createTurnDeliver({ ctx: ctx2, config: {}, settings: {}, deliverViaSubagents, deliverByReturning })
  let refused = null
  try { await seam2({ turn: { id: 't-unbound', member: 'planner-a' }, text: 'plan' }) } catch (e) { refused = e }
  ok(refused !== null && refused.code === 'VMU_ENGINE_UNAVAILABLE' && /root Agent is bound/.test(String(refused.message || '')),
    '★ reverse: an UNBOUND deployment refuses by name instead of starting the host with a null parent', { code: refused && refused.code })
  ok(seen2.length === 0, 'and the host was never called with parent=null (the refusal happens before start)', { calls: seen2.length })
}

console.log('=== HOST DELIVER WIRING: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
