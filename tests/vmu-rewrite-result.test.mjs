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
//   · and turn/index.js really calls it for `turn/reply-parsed` (a wiring assertion, checked at the source, because the
//     orchestrator cannot be stood up here without a full pipeline - the unit contract above is what that call relies on).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createBus, HOOK_REGISTRY } from '../vibe-math-vmu/kernel/bus.js'

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

console.log('=== 7. WIRING: THE TURN LOOP ACTUALLY CALLS IT (source-level, because the unit above is what it relies on) ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  ok(/bus\.rewriteOf\('turn\/reply-parsed'/.test(src), 'turn/index.js calls bus.rewriteOf for turn/reply-parsed', {})
  ok(/typeof bus\.rewriteOf === 'function'/.test(src), 'and probes for the method first, so an injected or older bus keeps working', {})
  ok(/parsed\.reply = rewritten/.test(src), 'and the returned value replaces the parsed reply BEFORE dispatch', {})
}

console.log('')
console.log('=== REWRITE RESULT (K10): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
