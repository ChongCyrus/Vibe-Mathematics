// tests/vmu-turn-activation.test.mjs - PHASE 6: the DSH 0.2.1-rc.2 delivery verb, and the two older ones kept alive.
//
// WHY THIS FILE EXISTS. DSH 0.2.1-rc.2 removed `subagents.start(name, request)` and `subagents.startContinuable(spec)`
// and added `subagents.startActivation(spec)`. Measured against the running host's own service catalog, the `subagents`
// service now lists exactly: startActivation, waitForChildren, drainDescendants, drainChildren, sendMessage, interrupt,
// listChildren, listDescendants, prompt, interruptByParent, registerProvider, getProvider, list, resolveMaxDepth - and
// NO start / startContinuable. vmu's DEFAULT delivery mode is 'subagents', so without an activation path EVERY member
// turn would be refused on the current host, and the refusal would have blamed a missing service that is present.
//
// WHAT IS PINNED HERE, AND WHY EACH ONE MATTERS:
//   1. the activation path is actually taken when only startActivation exists (deliveryPath === 'activation');
//   2. the spec it sends has the shape the host types require - provider, label, request, signal, delivery:'caller'
//      ('caller' keeps the result with this caller instead of also notifying the parent model);
//   3. the reply is read out of `result.output` CONTENT BLOCKS (a SubagentResult has no reply/text field), and
//      stopReason/childId/structured are carried through;
//   4. dispose() is called - on the success path AND on the failure path, because an undisposed activation holds an
//      execution handle open and later shows up as "the host refuses to admit a new activation";
//   5. no words in output is a NAMED refusal, not an empty member turn;
//   6. a missing provider name is VMU_INVALID_ARGUMENT checked OUTSIDE the retry wrapper (inside it, the two catch
//      blocks would re-label a fixable setting mistake as "the host refused twice");
//   7. a host offering only the OLD verbs still works - vmu declares support back to 0.1.2-alpha.4;
//   8. a host offering none of the three refuses by name and NAMES the verbs it does offer.
import { deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'

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
    ok(e && e.code === code, label, { got: e && e.code, msg: String(e && e.message).slice(0, 140) })
    return e
  }
}

const parent = { options: { provider: 'p', model: 'm' }, session: { id: 'sess-1', header: { id: 'sess-1' } } }
const signal = new AbortController().signal

// ── 1. THE 0.2.1 SHAPE: only startActivation, and nothing else can start anything ───────────────────────────────
{
  const seen = []
  let disposed = 0
  const subs = {
    list: () => ['spawn'],
    interrupt: () => {},
    sendMessage: async () => 'm1',
    async startActivation(spec) {
      seen.push(spec)
      return {
        childId: 'child-42',
        messageId: 'msg-42',
        result: Promise.resolve({
          output: [{ type: 'text', text: 'the member answered' }, { type: 'reasoning', text: 'ignored' }],
          stopReason: 'completed',
          structured: { verdict: 1 },
        }),
        dispose: async () => { disposed++ },
      }
    },
  }
  const deliver = deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal })
  const res = await deliver({ turn: { id: 't1', member: 'm1', why: 'check', nextStep: 'vote' }, text: 'please verify' })

  ok(seen.length === 1, 'the activation path was used exactly once', { calls: seen.length })
  ok(res && res.deliveryPath === 'activation', 'deliveryPath is activation', res && res.deliveryPath)
  ok(res && res.reply === 'the member answered', 'reply is read from result.output text blocks (not a reply field)', res && res.reply)
  ok(res && res.stopReason === 'completed', 'stopReason carried from the result', res && res.stopReason)
  ok(res && res.childId === 'child-42', 'childId carried from the activation', res && res.childId)
  ok(res && res.structured && res.structured.verdict === 1, 'structured result carried through (0.2.1 new field)', res && res.structured)
  ok(disposed === 1, 'dispose() called exactly once on the success path', { disposed })

  const spec = seen[0] || {}
  ok(spec.provider === 'spawn', 'spec.provider is the configured name', spec.provider)
  ok(typeof spec.label === 'string' && spec.label.indexOf('vmu-turn-') === 0, 'spec.label is the vmu turn label', spec.label)
  ok(spec.delivery === 'caller', "spec.delivery is 'caller' (result stays with this caller)", spec.delivery)
  ok(spec.signal === signal, 'spec.signal is the delivered signal', typeof spec.signal)
  ok(spec.request && Array.isArray(spec.request.prompt) && spec.request.prompt[0].text === 'please verify',
    'spec.request.prompt carries the assembled text', spec.request && spec.request.prompt)
  ok(spec.request && spec.request.parent === parent, 'spec.request.parent carries the resolved parent', spec.request && typeof spec.request.parent)
}

// ── 2. NO WORDS IS A NAMED REFUSAL, NOT AN EMPTY TURN ──────────────────────────────────────────────────────────
{
  let disposed = 0
  const subs = {
    list: () => ['spawn'],
    interrupt: () => {},
    sendMessage: async () => 'm1',
    async startActivation() {
      return { childId: 'c', result: Promise.resolve({ output: [{ type: 'reasoning', text: 'only thinking' }], stopReason: 'max-tokens' }), dispose: async () => { disposed++ } }
    },
  }
  const deliver = deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal })
  const err = await throwsNamed(() => deliver({ turn: { id: 't2' }, text: 'x' }), 'VMU_ENGINE_UNAVAILABLE',
    'structure without text refuses by name (not an empty member turn)')
  ok(err && /stopReason=max-tokens/.test(String(err.message) + String(err.hint)), 'the refusal reports the stopReason it saw', err && err.hint)
  ok(disposed === 1, 'dispose() still called when the result carried no text', { disposed })
}

// ── 3. A FAILED CHILD RUN DISPOSES, THEN REFUSES BY NAME ───────────────────────────────────────────────────────
{
  let disposed = 0
  const subs = {
    list: () => ['spawn'],
    interrupt: () => {},
    sendMessage: async () => 'm1',
    async startActivation() {
      return { childId: 'c', result: Promise.reject(new Error('child exploded')), dispose: async () => { disposed++ } }
    },
  }
  const deliver = deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal })
  const err = await throwsNamed(() => deliver({ turn: { id: 't3' }, text: 'x' }), 'VMU_ENGINE_UNAVAILABLE',
    'a rejected activation result refuses by name')
  ok(err && /child exploded/.test(String(err.message)), "the refusal carries the child's own words", err && err.message)
  ok(disposed === 1, 'dispose() called on the FAILURE path too (an open activation is a leak)', { disposed })
}

// ── 4. A MISSING PROVIDER IS A CONFIGURATION ERROR, CHECKED OUTSIDE THE RETRY ──────────────────────────────────
{
  let starts = 0
  const subs = { list: () => ['spawn', 'fork'], interrupt: () => {}, async startActivation() { starts++; return null } }
  const deliver = deliverViaSubagents(subs, null, { provider: null, parent, signal })
  const err = await throwsNamed(() => deliver({ turn: { id: 't4' }, text: 'x' }), 'VMU_INVALID_ARGUMENT',
    'no provider name refuses as a CONFIGURATION error, not as a host failure')
  ok(starts === 0, 'nothing was started when the provider was missing', { starts })
  ok(err && /spawn,fork/.test(String(err.hint)), 'the hint lists the provider names the host actually offers', err && err.hint)
}

// ── 5. REGRESSION: A HOST OFFERING ONLY THE OLD VERBS STILL WORKS ─────────────────────────────────────────────
{
  const subs = {
    list: () => [],
    interrupt: () => {},
    sendMessage: async () => 'm1',
    async startContinuable(spec) {
      return { id: 'old-child', stopReason: 'completed', reply: 'from the continuable path', spec }
    },
  }
  const deliver = deliverViaSubagents(subs, null, { provider: null, parent, signal })
  const res = await deliver({ turn: { id: 't5' }, text: 'x' })
  ok(res && res.deliveryPath === 'continuable', 'a host with only startContinuable keeps the continuable path', res && res.deliveryPath)
  ok(res && res.reply === 'from the continuable path', 'the old path still returns its reply', res && res.reply)
}

// ── 6. A HOST OFFERING NONE OF THE THREE REFUSES BY NAME, AND NAMES WHAT IT HAS ───────────────────────────────
// ★ NOTE ON WHERE THIS THROWS: the path is chosen when deliverViaSubagents() is CALLED, not when the returned
// closure is invoked - so the construction itself is what must be wrapped here. (Measured by writing it the other
// way first: the refuser fired before the test could enter its own try block, and the run died on an uncaught throw.)
{
  const subs = { list: () => ['spawn'], interrupt: () => {}, sendMessage: async () => 'm1', someOtherStartLikeThing: () => {} }
  const err = await throwsNamed(
    async () => deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal }),
    'VMU_ENGINE_UNAVAILABLE',
    'a host with no start verb refuses by name')
  ok(err && /startActivation/.test(String(err.message) + String(err.hint)), 'the refusal names the verbs that WOULD work', err && err.message)
  ok(err && /someOtherStartLikeThing|\(none/.test(String(err.hint)), 'the hint lists the start-like verbs the host does offer', err && err.hint)
}

// ── 7. ★ TARGET 1(b): THE 0.2.1 PER-CHILD FIELDS ARE EXPRESSIBLE, AND COST NOTHING WHEN UNUSED ────────────────
{
  const taken = []
  const subs = {
    list: () => ['spawn'], interrupt: () => {}, sendMessage: async () => 'm1',
    async startActivation(s) {
      taken.push(s)
      return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' }), dispose: async () => {} }
    },
  }
  const base = { turn: { id: 't' }, text: 'x' }
  // (a) a caller that supplies the new fields: they must reach the spec verbatim.
  await deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal })({ ...base, child: {
    cwd: '/workspace/proj', agentPreset: 'v3-solver', outputSchema: { type: 'object' }, persona: 'solver', toolFilter: ['read', 'write'], depthLimit: 2,
  } })
  const withFields = taken[0] || {}
  ok(withFields.cwd === '/workspace/proj', 'cwd reaches the activation spec (0.2.1 per-child field)', withFields.cwd)
  ok(withFields.agentPreset === 'v3-solver', 'agentPreset reaches it, so roles can use different presets', withFields.agentPreset)
  ok(withFields.toolFilter && withFields.toolFilter.length === 2, 'toolFilter reaches it, so roles can have different tool faces', withFields.toolFilter)
  ok(withFields.persona === 'solver' && withFields.depthLimit === 2, 'persona and depthLimit reach it too', { p: withFields.persona, d: withFields.depthLimit })
  ok(withFields.outputSchema && withFields.outputSchema.type === 'object', 'outputSchema reaches it (structured member output becomes expressible)', withFields.outputSchema)
  // (b) a caller that supplies NOTHING: the spec must not grow undefined keys, i.e. default behaviour is byte-identical.
  taken.length = 0
  await deliverViaSubagents(subs, null, { provider: 'spawn', parent, signal })(base)
  const bare = taken[0] || {}
  const extraKeys = Object.keys(bare).filter((k) => ['cwd', 'agentPreset', 'outputSchema', 'persona', 'toolFilter', 'depthLimit'].includes(k))
  ok(extraKeys.length === 0, 'NOTHING is injected when the caller supplies nothing, so an unchanged caller is byte-identical', extraKeys)
}

console.log('')
console.log('=== TURN ACTIVATION (0.2.1 delivery verb): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
