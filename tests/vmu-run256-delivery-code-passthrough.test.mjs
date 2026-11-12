// tests/vmu-run256-delivery-code-passthrough.test.mjs — RUN 256 / TB-2632 + RUN 258 / TB-2651: a code the delivery
// ADAPTER named is not the host's refusal, and the retry wrapper must not relabel it — and it must not re-issue a start
// whose effect has already happened.
//
// WHY THIS SUITE EXISTS. `deliverViaSubagents` wraps the host's start call in a retry: anything thrown inside
// `startOnce()` was caught, retried once, and then re-labelled `VMU_ENGINE_UNAVAILABLE` ("the host refused to start
// this member turn twice"). That wrapper predates the two delivery-shape codes the KERNEL itself now names —
// `VMU_TURN_DELIVERY_SHAPE` and `VMU_TURN_DELIVERY_NO_PAYLOAD` — and both are thrown from INSIDE that call: a host
// service that answers with a shape its caller cannot read throws there. So the one code that says "the adapter handed
// back an unreadable shape" never reached a receipt on a real machine; the operator was told the host refused a start
// that had in fact happened, and `sim-harness-shape` could not see the code the simulator carefully preserved.
//
// AUDIT-14 P1-1 (RUN 258 / TB-2651): the first fix named the TWO codes to PRESERVE, so every OTHER named code fell
// through to the retry. MEASURED (`${__tmpRoot()}\audit14b\probe2-codes-clock.mjs`): `VMU_TURN_DELIVERY_TIMEOUT` was issued a
// SECOND time (`starts:2, delays:1`) and then relabelled — while this file's own timeout paths say a timed-out delivery
// is the one thing that must never be re-issued. The predicate's question is therefore "MAY THIS START BE ISSUED
// AGAIN?" and the set it consults is the RETRYABLE class: only the transient host registry refusal (bare throw, or this
// bridge's own `VMU_ENGINE_UNAVAILABLE`) is retried. Every other named code — the two shapes, TIMEOUT, DELIVERY_FAILED,
// DISPATCH_FAILED, ASSEMBLY_FAILED, FACE_NOT_WIRED, and any code a future adapter invents — is re-thrown UNTOUCHED and
// not retried (fail-safe: unknown means "do not double-execute").
//
// The fallback is pinned too: a plain `Error` must still come out as `VMU_ENGINE_UNAVAILABLE`, otherwise the retry
// would have been quietly deleted along with the bug.
//
// Run: node tests/vmu-run256-delivery-code-passthrough.test.mjs   (targeted only)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TURN_MOD = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const { deliverViaSubagents, createTurnOrchestrator } = TURN_MOD
const { createPromptPipeline } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
const TURN_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')

const NL = String.fromCharCode(10)
let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  return false
}

// ---- the two named-refusal errors, built EXACTLY where a real host seam would throw them: inside `start()` ----
const shapeError = () => {
  const err = new Error('the DELIVERY ADAPTER returned a shape this simulator cannot read: an object with keys [output]')
  err.code = 'VMU_TURN_DELIVERY_SHAPE'
  err.shape = 'delivery-envelope'
  err.keys = ['output']
  err.value = { output: [{ type: 'text', text: 'hi' }] }
  err.means = 'the reply was not a string / ContentBlock[] / {text} / {reply}; the seam hands the structure down so the kernel can refuse the SHAPE by name'
  return err
}
const noPayloadError = () => {
  const err = new Error('the DELIVERY ADAPTER returned no payload at all: there is no reply text and no envelope')
  err.code = 'VMU_TURN_DELIVERY_NO_PAYLOAD'
  err.shape = 'no-payload'
  err.keys = []
  err.value = null
  err.means = 'the adapter resolved to null/undefined: SILENCE AT THE ADAPTER BOUNDARY, not a member that wrote prose without a fence'
  return err
}
// ★ AUDIT-14 P1-1: the code that proved the whitelist was the wrong shape. A delivery timeout means the child may STILL
// be working; a second start would double-execute it, so the code must reach the caller unchanged.
const timeoutError = () => {
  const err = new Error('the delivery seam gave up waiting for this member turn after 1800000 ms')
  err.code = 'VMU_TURN_DELIVERY_TIMEOUT'
  err.sideEffect = 'the child may still be working'
  err.means = 'the seam stopped WAITING; the work was not stopped, so this turn must never be delivered twice'
  return err
}
// A second side-effect-bearing code, to prove the rule is a class (not one special case beside TIMEOUT).
const deliveryFailedError = () => {
  const err = new Error('the delivery to this member failed after the start')
  err.code = 'VMU_TURN_DELIVERY_FAILED'
  err.means = 'the delivery had already begun'
  return err
}
// And a code no list in this file knows: the fail-safe direction must be "do not retry".
const unforeseenError = () => {
  const err = new Error('a future adapter named a code this kernel has never seen')
  err.code = 'VMU_TURN_DELIVERY_SOMETHING_NEW'
  err.means = 'a named code is a fact, not a transient refusal'
  return err
}

// A host-shaped seam whose start verb throws `err`; the counters prove whether the retry wrapper ran.
const seamThrowing = (err) => {
  const state = { starts: 0, delays: 0 }
  const seam = deliverViaSubagents(
    { list: () => ['sim'], start: () => { state.starts += 1; throw err } },
    null,
    { provider: 'sim', delay: async () => { state.delays += 1 } },
  )
  return { seam, state }
}
const attempt = async (seam) => {
  try {
    const value = await seam({ turn: { id: 't-1', member: 'r-1' }, text: 'PROMPT TEXT' })
    return { threw: false, value }
  } catch (error) { return { threw: true, error } }
}
const makeLoop = (deliver) => createTurnOrchestrator({
  sectionPolicy: () => ({ decisions: [] }),
  prompt: createPromptPipeline({ sections: [{ name: 'v5r-charter-opening', order: 100, text: 'OPENING' }], bindings: [], clock: () => '2026-01-01T00:00:00.000Z' }),
  deliver,
})

try {
  console.log('=== 1. VMU_TURN_DELIVERY_SHAPE passes through untouched (the fact the retry wrapper used to eat) ===')
  const shape = shapeError()
  const shapeRun = seamThrowing(shape)
  const shapeOut = await attempt(shapeRun.seam)
  ok(shapeOut.threw === true, 'the seam still refuses (a shape the kernel cannot read is never turned into prose)', shapeOut.value)
  ok(shapeOut.threw === true && shapeOut.error.code === 'VMU_TURN_DELIVERY_SHAPE',
    'the code is the ADAPTER\'s own VMU_TURN_DELIVERY_SHAPE, not a host-refusal code', shapeOut.error && shapeOut.error.code)
  // RULE E (tests/audit-declaration-criterion.test.mjs): assert non-empty before an every()/length===0 reading.
  const shapeKeys = shapeOut.error && Array.isArray(shapeOut.error.keys) ? shapeOut.error.keys : []
  ok(shapeOut.threw === true && shapeKeys.length > 0,
    'the refusal still carries the keys the adapter actually received', shapeOut.threw && shapeKeys)
  ok(shapeOut.threw === true && shapeKeys.length === 1 && shapeKeys[0] === 'output',
    'and those keys are the ones the seam named (not a rewritten list)', shapeOut.threw && shapeKeys)
  ok(shapeOut.threw === true && shapeOut.error.shape === 'delivery-envelope',
    'the shape reading survives the wrapper', shapeOut.error && shapeOut.error.shape)
  ok(shapeOut.threw === true && typeof shapeOut.error.means === 'string' && shapeOut.error.means.length > 0,
    'the means reading survives the wrapper (a reader can tell shape error from silence)', shapeOut.error && shapeOut.error.means)
  ok(shapeOut.threw === true && shapeOut.error === shape,
    'it is the SAME error object (nothing was re-wrapped: stack, cause and facts are the seam\'s own)', shapeOut.error === shape)
  ok(shapeOut.threw === true && String(shapeOut.error.message || '').indexOf('VMU_ENGINE_UNAVAILABLE') < 0,
    'the message does NOT name VMU_ENGINE_UNAVAILABLE (the relabel is gone)', shapeOut.error && String(shapeOut.error.message).slice(0, 120))
  ok(shapeRun.state.starts === 1, 'the wrapper did NOT retry a named delivery refusal (a second start would double-execute the seam)', shapeRun.state)
  ok(shapeRun.state.delays === 0, 'and it did not even wait for a retry (no pointless delay on a refusal a retry cannot change)', shapeRun.state)

  console.log('=== 2. VMU_TURN_DELIVERY_NO_PAYLOAD passes through too, and the two codes stay distinct ===')
  const nopay = noPayloadError()
  const nopayRun = seamThrowing(nopay)
  const nopayOut = await attempt(nopayRun.seam)
  ok(nopayOut.threw === true && nopayOut.error.code === 'VMU_TURN_DELIVERY_NO_PAYLOAD',
    'the no-payload code reaches the caller by its own name', nopayOut.error && nopayOut.error.code)
  ok(nopayOut.threw === true && nopayOut.error === nopay, 'and it is that same error object', nopayOut.error === nopay)
  ok(nopayOut.threw === true && nopayOut.error.shape === 'no-payload' && Array.isArray(nopayOut.error.keys) && nopayOut.error.keys.length === 0,
    'its shape reading and empty key list survive', nopayOut.threw && { shape: nopayOut.error.shape, keys: nopayOut.error.keys })
  ok(nopayRun.state.starts === 1 && nopayRun.state.delays === 0,
    'a no-payload refusal is not retried either', nopayRun.state)
  ok('VMU_TURN_DELIVERY_SHAPE' !== 'VMU_TURN_DELIVERY_NO_PAYLOAD',
    'the two codes are different strings — shape error and silence are different facts', 'same')

  console.log('=== 3. side-effect codes are NEVER re-issued (AUDIT-14 P1-1: the whitelist became a retryable class) ===')
  // MEASURED before the fix (AUDIT-14 probe 2): every one of these came out of the wrapper as VMU_ENGINE_UNAVAILABLE
  // with starts:2/delays:1 — a second delivery of work that had already happened.
  const timeout = timeoutError()
  const timeoutRun = seamThrowing(timeout)
  const timeoutOut = await attempt(timeoutRun.seam)
  ok(timeoutOut.threw === true && timeoutOut.error.code === 'VMU_TURN_DELIVERY_TIMEOUT',
    'VMU_TURN_DELIVERY_TIMEOUT reaches the caller under its OWN code (it used to be relabelled VMU_ENGINE_UNAVAILABLE)',
    timeoutOut.error && { code: timeoutOut.error.code, message: String(timeoutOut.error.message || '').slice(0, 120) })
  ok(timeoutOut.threw === true && timeoutOut.error === timeout,
    'and it is the seam\'s SAME error object: its sideEffect/means facts are not rewritten', timeoutOut.error === timeout)
  ok(timeoutOut.threw === true && timeoutOut.error.means === timeoutError().means,
    'the timeout means reading survives (a reader is told the child may still be working)', timeoutOut.error && timeoutOut.error.means)
  ok(timeoutRun.state.starts === 1,
    'the wrapper did NOT start a second delivery for a TIMEOUT (the child may still be working: a retry doubles the effect)',
    timeoutRun.state)
  ok(timeoutRun.state.delays === 0, 'and it did not even pause for a retry it must not perform', timeoutRun.state)
  ok(timeoutOut.threw === true && String(timeoutOut.error.message || '').indexOf('VMU_ENGINE_UNAVAILABLE') < 0,
    'the timeout message does not name the host-refusal code (the operator is no longer told the host refused it)',
    timeoutOut.error && String(timeoutOut.error.message).slice(0, 120))

  const failed = deliveryFailedError()
  const failedRun = seamThrowing(failed)
  const failedOut = await attempt(failedRun.seam)
  ok(failedOut.threw === true && failedOut.error.code === 'VMU_TURN_DELIVERY_FAILED' && failedRun.state.starts === 1 && failedRun.state.delays === 0,
    'VMU_TURN_DELIVERY_FAILED is likewise preserved and not re-issued (the rule is a CLASS, not one special case)',
    { code: failedOut.error && failedOut.error.code, ...failedRun.state })

  // The direction of the default matters more than any single code: a code this file has never seen must be PRESERVED,
  // because "a named code" is a fact the adapter took the trouble to name, while retrying is an action with effects.
  const unforeseen = unforeseenError()
  const unforeseenRun = seamThrowing(unforeseen)
  const unforeseenOut = await attempt(unforeseenRun.seam)
  ok(unforeseenOut.threw === true && unforeseenOut.error === unforeseen,
    'a NAMED code nobody listed in this kernel passes through untouched (fail-safe: unknown means "do not re-execute")',
    unforeseenOut.error && unforeseenOut.error.code)
  ok(unforeseenRun.state.starts === 1 && unforeseenRun.state.delays === 0,
    'and an unknown named code is not retried either (this is the reverse of the old whitelist, which retried the unknown)',
    unforeseenRun.state)

  console.log('=== 4. an ORDINARY error still becomes VMU_ENGINE_UNAVAILABLE (the fallback must not be deleted with the bug) ===')
  const boom = new Error('the registry is still tearing down the previous activation')
  const boomRun = seamThrowing(boom)
  const boomOut = await attempt(boomRun.seam)
  ok(boomOut.threw === true && boomOut.error.code === 'VMU_ENGINE_UNAVAILABLE',
    'a plain Error is still relabelled VMU_ENGINE_UNAVAILABLE', boomOut.error && boomOut.error.code)
  ok(boomOut.threw === true && boomOut.error !== boom, 'and the wrapper builds its own refusal for it (unchanged behaviour)', boomOut.error === boom)
  ok(boomOut.threw === true && String(boomOut.error.message || '').indexOf('twice on the one-shot path') >= 0,
    'the refusal still says a start was refused TWICE (the retry path is intact)', boomOut.error && String(boomOut.error.message).slice(0, 140))
  ok(boomOut.threw === true && String(boomOut.error.message || '').indexOf('tearing down the previous activation') >= 0,
    'and it still carries the host\'s own words', boomOut.error && String(boomOut.error.message).slice(0, 200))
  ok(boomOut.threw === true && boomOut.error.cause === boom,
    'the original error is kept as the cause (the frames are the host\'s)', boomOut.threw && boomOut.error.cause === boom)
  ok(boomRun.state.starts === 2, 'an ordinary refusal IS retried once, as before', boomRun.state)
  ok(boomRun.state.delays === 1, 'with the injected pause, as before', boomRun.state)
  // The retryable floor is the OTHER half of the class rule: this bridge's own transient "could not start just now"
  // code stays retryable, or the RUN 62 registry-teardown fix would have been deleted by the same change.
  const engineDown = Object.assign(new Error('the engine could not start this turn just now'), { code: 'VMU_ENGINE_UNAVAILABLE' })
  const engineRun = seamThrowing(engineDown)
  const engineOut = await attempt(engineRun.seam)
  ok(engineRun.state.starts === 2 && engineRun.state.delays === 1,
    'VMU_ENGINE_UNAVAILABLE is still the RETRYABLE class (the registry-teardown fix survives the change)', engineRun.state)
  ok(engineOut.threw === true && engineOut.error.code === 'VMU_ENGINE_UNAVAILABLE' && engineOut.error.cause === engineDown,
    'and its final refusal is still this bridge\'s own VMU_ENGINE_UNAVAILABLE, with the original as cause',
    engineOut.error && { code: engineOut.error.code, cause: engineOut.error.cause === engineDown })

  console.log('=== 5. no refusal message names both codes at once (a reader must not see two causes in one sentence) ===')
  const messages = [shapeOut, nopayOut, boomOut, timeoutOut].map((o) => String((o.error && o.error.message) || ''))
  ok(messages.length === 4 && messages.every((m) => m.length > 0), 'all four refusals have readable messages', messages.map((m) => m.length))
  ok(messages.every((m) => !(m.indexOf('VMU_TURN_DELIVERY_SHAPE') >= 0 && m.indexOf('VMU_TURN_DELIVERY_NO_PAYLOAD') >= 0)),
    'no single message names BOTH delivery shape codes', messages.map((m) => m.slice(0, 80)))
  ok(messages.every((m, i) => !(m.indexOf('VMU_ENGINE_UNAVAILABLE') >= 0 && i < 3)),
    'only the host-refusal message names VMU_ENGINE_UNAVAILABLE (never a preserved adapter code)', messages.map((m) => m.slice(0, 80)))

  console.log('=== 6. end-to-end: the drive receipt now carries the ADAPTER code (the real-machine gap) ===')
  const shapeLoop = makeLoop(deliverViaSubagents({ list: () => ['sim'], start: () => { throw shapeError() } }, null, { provider: 'sim' }))
  const shapeDriven = await shapeLoop.drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  const shapeRow = (shapeDriven && Array.isArray(shapeDriven.receipts) && shapeDriven.receipts[0]) || {}
  ok(shapeDriven && shapeDriven.roundsRun === 0, 'no round is claimed to have run on a delivery the seam named unreadable', shapeDriven && shapeDriven.roundsRun)
  ok(shapeRow.code === 'VMU_TURN_DELIVERY_SHAPE',
    'the RECEIPT names VMU_TURN_DELIVERY_SHAPE (previously relabelled VMU_ENGINE_UNAVAILABLE inside the retry wrapper)', shapeRow && { code: shapeRow.code, message: String(shapeRow.message || '').slice(0, 120) })
  const timeoutLoop = makeLoop(deliverViaSubagents({ list: () => ['sim'], start: () => { throw timeoutError() } }, null, { provider: 'sim' }))
  const timeoutDriven = await timeoutLoop.drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  const timeoutRow = (timeoutDriven && Array.isArray(timeoutDriven.receipts) && timeoutDriven.receipts[0]) || {}
  ok(timeoutRow.code === 'VMU_TURN_DELIVERY_TIMEOUT',
    'the RECEIPT also names VMU_TURN_DELIVERY_TIMEOUT (AUDIT-14 P1-1: this is the code a real machine never saw)', timeoutRow && { code: timeoutRow.code, message: String(timeoutRow.message || '').slice(0, 120) })
  const boomLoop = makeLoop(deliverViaSubagents({ list: () => ['sim'], start: () => { throw new Error('no admission') } }, null, { provider: 'sim' }))
  const boomDriven = await boomLoop.drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  const boomRow = (boomDriven && Array.isArray(boomDriven.receipts) && boomDriven.receipts[0]) || {}
  ok(boomRow.code === 'VMU_ENGINE_UNAVAILABLE',
    'the control proves the host-refusal relabel still exists end to end', boomRow && { code: boomRow.code })

  // ★ RUN 258 / TB-2651: the old §7 pinned the predicate's SOURCE TEXT (`TURN_SRC.includes("if (code !== '…SHAPE' …")`).
  // Audit铁律 3 says a pin that fails on an equivalent reordering is a false red, so the ONE-predicate claim is now
  // measured BEHAVIOURALLY: every named code above went through the same decision, and the two directions (retry only
  // the transient class, preserve every named code) both hold — a second list of codes could not produce that pattern.
  ok(typeof TURN_SRC === 'string' && TURN_SRC.length > 0, 'the delivery seam source is readable (the suite is not vacuous)', TURN_SRC.length)
  const pairs = [[shapeOut, shape], [nopayOut, nopay], [timeoutOut, timeout], [failedOut, failed], [unforeseenOut, unforeseen]]
  const preserved = pairs.filter(([out, original]) => out && out.threw === true && out.error === original)
  ok(preserved.length === pairs.length && preserved.length > 0,
    'all FIVE named codes came back as the seam\'s own error objects (one gate, not two special cases)', preserved.map(([out]) => out.error && out.error.code))
  const retried = [boomOut, engineOut].filter((o) => o && o.threw === true && o.error && o.error.cause)
  ok(retried.length === 2, 'and the two transient classes were the only ones retried (one retryable set, not a second whitelist)', retried.length)
} finally {
  console.log(NL + '=== RUN 256 DELIVERY CODE PASSTHROUGH: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed > 0) { console.log('failures: ' + JSON.stringify(failures)); process.exitCode = 1 }
}
