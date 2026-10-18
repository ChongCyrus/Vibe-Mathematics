// tests/vmu-rewrite-result.test.mjs — PHASE 6 / K10: the rewrite point the documentation already promised.
//
// THE DEFECT THIS PINS. `docs/19 §7` publishes `turn/reply-parsed` as returning "reply（rewrite-result）", and `bus.js`
// has always carried `rewriteResult: 'rewrite-result'` in DECISION_CAPABILITY plus `rewritable: true` on nine hooks.
// Measured before the fix: `.rewritable` had ZERO readers outside the registry, `rewriteResult` appeared exactly once in
// the whole tree (that mapping), and no handler returned one. So a pack could declare the capability, pass the
// capability check, return a rewrite, and watch the ORIGINAL reply reach the dispatcher - the "contract promises what
// the implementation does not do" family, and the reason the repair here is to IMPLEMENT the point rather than delete
// the sentence.
//
// WHAT IS PINNED, and why each assertion is falsifiable:
//   · a valid rewrite is RETURNED and is the value the caller would use (the positive direction - the whole point);
//   · both documented spellings work: a bare string and `{ reply }`;
//   · the LAST writer wins, because `order` already decides who runs last - so this is deterministic, not arbitrary;
//   · a malformed value is a NAMED refusal, never silence (silence is the defect being removed);
//   · a rewrite on a hook the registry says is NOT rewritable is a NAMED refusal that names the flag - this is the first
//     place the `.rewritable` metadata is actually READ, which is what makes it metadata rather than decoration;
//   · a refused emit (`ok:false`) yields nothing to rewrite;
//   · and turn/index.js really calls it for `turn/reply-parsed` (a wiring assertion, checked at the source).
//
// ★ ROUND 98 — THE WIRING HALF WAS MISSING AND IS NOW MEASURED ON A REAL KERNEL. This file used to end with the note
// "the orchestrator cannot be stood up here without a full pipeline", so the consumer was only GREPPED. That is why the
// defect below survived: `createKernel` never handed its `bus` to `createTurnOrchestrator`, so on the REAL assembly
// path `turn/reply-parsed` was emitted 0 times (a kernel that ran two turns left the hook's hit counter at 0) and
// `bus.rewriteOf` rewired nothing. Sections 8-10 now stand up a REAL kernel, run a turn through `kernel.turn.run()`,
// and require the hook to be hit AND the rewritten reply to be the one the dispatcher applies. They also pin the
// two things a rewrite could otherwise break: the ZERO-MECHANISM receipt (nobody rewrites ⇒ unchanged) and the
// NAMED failure for a rewrite the framework cannot read (never a silently emptied reply).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createBus, HOOK_REGISTRY } from '../vibe-math-vmu/kernel/bus.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const throwsNamed = async (fn, code, label) => {
  try { await fn(); ok(false, label, 'no throw'); return null } catch (e) {
    ok(e && e.code === code, label, { got: e && e.code, msg: String(e && e.message).slice(0, 160) })
    return e
  }
}

const entry = (id, order, decision, caps = ['rewrite-result']) => ({ id, kind: 'module', order, on: ['turn/reply-parsed'], failure: 'closed', capabilities: caps, handler: () => decision })
const emitReply = (bus, reply = 'original') => bus.emit('turn/reply-parsed', { turn: 1, member: 'm1', reply }, { member: 'm1' })

console.log('=== 1. THE POSITIVE DIRECTION: A VALID REWRITE IS RETURNED ===')
{
  const bus = createBus({ entries: [entry('normalise', 100, { rewriteResult: 'normalised' })] })
  const seen = await emitReply(bus)
  ok(seen && seen.ok === true, 'the emit itself succeeded', seen && seen.ok)
  ok(typeof bus.rewriteOf === 'function', 'the bus exposes rewriteOf - the method the turn loop probes', typeof bus.rewriteOf)
  const got = bus.rewriteOf('turn/reply-parsed', seen)
  ok(got === 'normalised', 'a string rewriteResult comes back as the new reply', { got })
}
{
  const bus = createBus({ entries: [entry('wrapped', 100, { rewriteResult: { reply: 'from-an-object' } })] })
  const got = bus.rewriteOf('turn/reply-parsed', await emitReply(bus))
  ok(got === 'from-an-object', 'the documented `{ reply }` spelling works too (docs/19 shows the value as the reply)', { got })
}

console.log('=== 2. NOBODY ASKED => NULL, SO THE CALLER KEEPS ITS VALUE ===')
{
  const bus = createBus({ entries: [entry('observes', 100, { annotate: 'just looking' }, ['annotate'])] })
  ok(bus.rewriteOf('turn/reply-parsed', await emitReply(bus)) === null, 'an entry that only annotates rewrites nothing', {})
  const empty = createBus({ entries: [] })
  ok(empty.rewriteOf('turn/reply-parsed', await emitReply(empty)) === null, 'and an emit with no decisions rewrites nothing', {})
}

console.log('=== 3. THE LAST WRITER WINS, BECAUSE `order` ALREADY DECIDES WHO RUNS LAST ===')
{
  const bus = createBus({ entries: [
    entry('first', 100, { rewriteResult: 'from-first' }),
    entry('second', 200, { rewriteResult: 'from-second' }),
  ] })
  const got = bus.rewriteOf('turn/reply-parsed', await emitReply(bus))
  ok(got === 'from-second', 'the higher-order entry wins, deterministically rather than by array accident', { got })
}

console.log('=== 4. A MALFORMED REWRITE IS A NAMED REFUSAL, NOT SILENCE ===')
{
  const bus = createBus({ entries: [entry('broken', 100, { rewriteResult: 42 })] })
  const seen = await emitReply(bus)
  const err = await throwsNamed(async () => bus.rewriteOf('turn/reply-parsed', seen), 'VMU_MIDDLEWARE_FAILED',
    'a rewrite that is neither a string nor { reply } is refused by name')
  ok(err && /broken/.test(String(err.message)), 'and the refusal names the offending entry', err && err.message)
}

console.log('=== 5. `.rewritable` FINALLY HAS A READER: A NON-REWRITABLE HOOK IS REFUSED ===')
{
  // tools/pre-execute is declared rewritable:false in the registry - this assertion is what makes that flag real.
  const declared = HOOK_REGISTRY.find((h) => h.name === 'tools/pre-execute')
  ok(declared && declared.rewritable === false, 'the registry really does declare tools/pre-execute as not rewritable', { rewritable: declared && declared.rewritable })
  const bus = createBus({ entries: [{ id: 'sneaky', kind: 'module', order: 100, on: ['tools/pre-execute'], failure: 'closed', capabilities: ['rewrite-result'], handler: () => ({ rewriteResult: 'hijacked' }) }] })
  const seen = await bus.emit('tools/pre-execute', { tool: 'x' }, {})
  const err = await throwsNamed(async () => bus.rewriteOf('tools/pre-execute', seen), 'VMU_MIDDLEWARE_FAILED',
    'a rewrite on a hook the registry calls read-only is refused by name')
  ok(err && /not declared rewritable/.test(String(err.message)), 'and the refusal says exactly that', err && err.message)
  ok(err && /rewritable=false/.test(String(err.hint)), 'and it reports the flag value, so the diagnosis needs no extra digging', err && err.hint)
}

console.log('=== 6. A REFUSED EMIT LEAVES NOTHING TO REWRITE ===')
{
  const bus = createBus({ entries: [
    entry('denies', 100, { deny: { code: 'VMU_TEST_DENIED', message: 'no' } }, ['deny']),
    entry('would-rewrite', 200, { rewriteResult: 'should-not-apply' }),
  ] })
  const seen = await emitReply(bus)
  ok(seen && seen.ok === false, 'the emit was refused', seen && seen.ok)
  ok(bus.rewriteOf('turn/reply-parsed', seen) === null, 'and nothing is returned to rewrite', {})
}

console.log('=== 7. WIRING: THE TURN LOOP CALLS IT AND KERNEL/index.js HANDS ITS bus OVER ===')
{
  const turnSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  ok(/bus\.rewriteOf\('turn\/reply-parsed'/.test(turnSrc), 'turn/index.js calls bus.rewriteOf for turn/reply-parsed', {})
  ok(/typeof bus\.rewriteOf === 'function'/.test(turnSrc), 'and probes for the method first, so an injected or older bus keeps working', {})
  ok(/parsed\.reply = replacement/.test(turnSrc) && /rewrittenReplyObject\(rewritten\)/.test(turnSrc),
    'and the returned value is DECODED into the replacement reply object that dispatch consumes', {})
  // THE ASSEMBLY HALF (the defect): the kernel must hand the SAME bus to the loop, or the emit branch above is dead.
  // Anchored to a REAL option line (`    bus,`), not to a mention: a commented-out `// bus,` must not satisfy this
  // assertion - that is exactly how a source-level check turns into a vacuous one (measured: the loose regex passed
  // while the line was commented out).
  const turnCall = /createTurnOrchestrator\(\{([\s\S]*?)\n  \}\)/.exec(kernelSrc)
  ok(turnCall !== null && /^ {4}bus,$/m.test(turnCall[1]),
    'kernel/index.js passes `bus` to createTurnOrchestrator - without it `turn/reply-parsed` is emitted ZERO times on a real kernel',
    turnCall === null ? 'createTurnOrchestrator call not found' : turnCall[1].slice(0, 200))
}

// ── THE REAL-ASSEMBLY HARNESS (sections 8-10): a REAL kernel, a REAL turn, no hand-wired loop ──────────────────────
const REPLY = '{"vote_solved": false}'
const MIDDLEWARE = (id, decision, caps) => ({ id, kind: 'module', order: 10, on: ['turn/reply-parsed'], failure: 'closed', capabilities: caps, handler: () => decision })
const bootKernel = (entries = []) => {
  const kernel = createKernel({ settings: {}, deliverTurn: async () => REPLY })
  for (const e of entries) kernel.bus.add(e)
  return kernel
}
const hookHits = (kernel, id) => {
  const rows = kernel.bus.status().entries
  const row = rows.find((e) => e.id === id)
  return row ? row.hits : 0
}

console.log('=== 8. ★★ REAL ASSEMBLY: THE HOOK FIRES AND THE DISPATCHER APPLIES THE REWRITTEN REPLY ===')
{
  // Control: nobody subscribes. The parsed reply's own field is what dispatch/record sees.
  const control = bootKernel([])
  const controlOut = await control.turn.run({ member: 'm-1', phase: 'founding' })
  const controlState = control.turn.status({ roster: ['m-1'], permission: 'vote' })
  ok(controlOut.ok === true && controlOut.fields.length === 1 && controlOut.fields[0] === 'vote_solved',
    'control: the ORIGINAL reply is the one the loop applies', JSON.stringify(controlOut.fields))
  ok(controlState.closureVoteVotes.get('m-1') === false && controlState.solvedThisRound['m-1'] === undefined,
    'control: the original values are recorded (vote false, no `solved` field)', JSON.stringify({ votes: Object.fromEntries(controlState.closureVoteVotes), solved: controlState.solvedThisRound }))

  // Rewriting middleware: replace the parsed reply BEFORE dispatch with a DIFFERENT document (order 10).
  const rewriting = bootKernel([MIDDLEWARE('k10-rewrite', { rewriteResult: '{"vote_solved": true, "solved": true}' }, ['rewrite-result'])])
  const rewrittenOut = await rewriting.turn.run({ member: 'm-1', phase: 'founding' })
  const rewrittenState = rewriting.turn.status({ roster: ['m-1'], permission: 'vote' })
  ok(hookHits(rewriting, 'k10-rewrite') === 1,
    '★★ the REAL kernel emitted turn/reply-parsed exactly once (before the wiring fix the hit counter stayed 0)',
    JSON.stringify({ hits: hookHits(rewriting, 'k10-rewrite') }))
  ok(rewrittenOut.ok === true && rewrittenOut.fields.length === 2 && rewrittenOut.fields.includes('solved'),
    '★★ and the DISPATCHER received the rewritten document: the receipt names the rewritten field set (original had only vote_solved)',
    JSON.stringify(rewrittenOut.fields))
  ok(rewrittenState.closureVoteVotes.get('m-1') === true && rewrittenState.solvedThisRound['m-1'] === true,
    '★★ the values recorded come from the REWRITE (vote true, solved true) - not from the original reply',
    JSON.stringify({ votes: Object.fromEntries(rewrittenState.closureVoteVotes), solved: rewrittenState.solvedThisRound }))
}

console.log('=== 9. ★ ZERO MECHANISM: NOBODY REWRITES ⇒ THE RECEIPT IS THE SAME AS WITH NO MIDDLEWARE ===')
{
  const plain = bootKernel([])
  const plainOut = await plain.turn.run({ member: 'm-1', phase: 'founding' })
  const observing = bootKernel([MIDDLEWARE('k10-observe', { annotate: 'just looking' }, ['annotate'])])
  const observedOut = await observing.turn.run({ member: 'm-1', phase: 'founding' })
  const plainState = plain.turn.status({ roster: ['m-1'], permission: 'vote' })
  const observedState = observing.turn.status({ roster: ['m-1'], permission: 'vote' })
  ok(hookHits(observing, 'k10-observe') === 1, 'the middleware really saw the hook', String(hookHits(observing, 'k10-observe')))
  ok(plainOut.fields.length === 1 && plainOut.fields.join(',') === observedOut.fields.join(',') &&
    plainOut.refused.length === observedOut.refused.length &&
    plainOut.executed.length === observedOut.executed.length &&
    plainOut.skipped.length === observedOut.skipped.length,
    'an entry that rewrites NOTHING leaves the receipt unchanged (fields/refused/executed/skipped)',
    JSON.stringify({ plain: plainOut.fields, observed: observedOut.fields }))
  ok(plainState.closureVoteVotes.get('m-1') === observedState.closureVoteVotes.get('m-1'),
    'and the recorded values are unchanged - no rewrite, no mechanism', JSON.stringify({ plain: Object.fromEntries(plainState.closureVoteVotes), observed: Object.fromEntries(observedState.closureVoteVotes) }))
}

console.log('=== 10. ★ NAMED FAILURES AND GRACEFUL DEGRADATION ON THE REAL ASSEMBLY ===')
{
  // A rewrite the framework cannot read is a NAMED refusal, never a silently emptied reply.
  const unreadable = bootKernel([MIDDLEWARE('k10-bad-rewrite', { rewriteResult: 'this is not json' }, ['rewrite-result'])])
  let bad = null
  try { await unreadable.turn.run({ member: 'm-1', phase: 'founding' }) } catch (e) { bad = e }
  ok(bad !== null && bad.code === 'VMU_TURN_BAD_JSON',
    '★★ a rewrite that is not a JSON object is REFUSED BY NAME (the member reply is not silently discarded)',
    bad === null ? 'no refusal was thrown' : bad.code)

  // An older/injected bus without `rewriteOf` must NOT crash the turn: the probe keeps the previous behaviour.
  const legacy = bootKernel([MIDDLEWARE('k10-legacy', { rewriteResult: '{"vote_solved": true}' }, ['rewrite-result'])])
  delete legacy.bus.rewriteOf
  let legacyErr = null
  let legacyOut = null
  try { legacyOut = await legacy.turn.run({ member: 'm-1', phase: 'founding' }) } catch (e) { legacyErr = e }
  const legacyState = legacy.turn.status({ roster: ['m-1'], permission: 'vote' })
  ok(legacyErr === null && legacyOut !== null && legacyOut.ok === true,
    'a bus WITHOUT rewriteOf (an injected or older one) does not crash the turn - the probe degrades gracefully',
    legacyErr === null ? 'ok' : String(legacyErr.message).slice(0, 160))
  ok(legacyState.closureVoteVotes.get('m-1') === false,
    'and with no rewrite channel the ORIGINAL reply is applied (false), unchanged behaviour',
    JSON.stringify(Object.fromEntries(legacyState.closureVoteVotes)))
}

console.log('')
console.log('=== REWRITE RESULT (K10): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
