// tests/vmu-run22-findings.test.mjs
//
// LIVE RUN 22 (goal-5e2adedf, provider commandcode / deepseek/deepseek-v4.1-flash) died mid-run: the institute asked
// for a verdict on a ballot that had already been settled. `kernel/ballot.js` `castNow` throws
// `VMU_STATE "the ballot is not open" (hint: state=tallied)` — correctly, the API contract is "a settled box takes no
// more votes" — but the throw reached a path that ended the process:
//     dsh: fatal load failure: Error: the ballot is not open
//         at refuse (.../kernel/ballot.js:60:15)
//         at castNow (.../kernel/ballot.js:279:13)
//         at run (.../kernel/ballot.js:424:25)   { hint: 'state=tallied', code: 'VMU_STATE' }
// 6.0 M tokens of acceptance work were lost.
//
// WHAT THIS TEST PINS (and what it deliberately does NOT):
//   ① THE CALL-SITE GUARD (`vibe-math-vmu/packs/v5r/tools.js`, `vibe_v5_verdict`): the face asks the ballot for its
//      state BEFORE casting and refuses with a sentence about the ballot; the cast itself is inside try/catch so a
//      named throw becomes a named refusal of THIS face. That is the defect that was measured.
//   ② THE CONTRACT THAT MUST NOT CHANGE: `makePackToolSpec().run` still THROWS coded refusals — the host's
//      `toHostSpec` is the single place a throw becomes a receipt, and 42 existing assertions depend on the throw.
//      An earlier attempt to convert throws inside the funnel was REVERTED for exactly that reason (measured: 313
//      passed / 42 failed). This test asserts the contract is still the throwing one, so nobody "fixes" it twice.
//   ③ THE UNEXPLAINED PART IS NAMED, NOT FORGOTTEN: every throw inside the tool boundary already goes through
//      `toHostSpec`'s catch, so the fatal path was NOT an ordinary tool refusal. That gap is registered in the
//      ledger (§118) and asserted here only as "the host-side catch exists".
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makePackToolSpec } from '../vibe-math-vmu/host-pack-tools.js'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { console.log('  ok   ' + name) } else { failed++; console.log('  FAIL ' + name + (detail ? ' :: ' + JSON.stringify(detail) : '')) }
}

console.log('=== VMU RUN 22 FINDINGS (a settled ballot must refuse, not kill) ===')

// ① the call site
{
  const src = readFileSync(REPO + '/vibe-math-vmu/packs/v5r/tools.js', 'utf8')
  ok(/const boxState = ballot/.test(src), '①a the verdict face reads the ballot state before casting')
  ok(/it is already settled \(state=/.test(src), '①b the refusal says the ballot is SETTLED')
  ok(/try \{\s*r = ballot\.cast/.test(src), '①c the cast itself is guarded')
  ok(/vibe_v5_record_progress/.test(src), '①d the hint sends the reader somewhere that works')
  ok(/no verdict may be cast on this ballot/.test(src), '①e the message names the act that was refused')
}

// ② the contract that must not change: the funnel still throws coded refusals
{
  const spec = makePackToolSpec({ entry: { name: 't_probe', description: 'x', parameters: {}, handler: () => { throw Object.assign(new Error('the ballot is not open'), { code: 'VMU_STATE', hint: 'state=tallied' }) } }, kernel: null, packId: 'probe' })
  let thrown = null
  try { await spec.run({}, null) } catch (e) { thrown = e }
  ok(thrown && thrown.code === 'VMU_STATE', '②a a coded handler throw still THROWS out of the pack funnel (the host converts it)', thrown && thrown.code)
  ok(thrown && /state=tallied/.test(String(thrown.hint)), '②b the hint survives the funnel', thrown && thrown.hint)
}

// ③ the host-side single conversion point exists (the fatal path is NOT here, which is why it is unexplained)
{
  const src = readFileSync(REPO + '/vibe-math-vmu/host.js', 'utf8')
  ok(/export function toHostSpec\(spec\)/.test(src), '③a toHostSpec exists')
  ok(/code: \(e && e\.code\) \|\| 'VMU_MIDDLEWARE_FAILED'/.test(src), '③b a thrown tool call becomes a receipt with its code')
  ok(/return boundedToolResult\(Object\.assign\(\{\s*ok: false/.test(src), '③c the refusal uses the SAME serializer as a success (the round-36 shape rule)')
}

// ④ a normal handler still passes through
{
  const spec = makePackToolSpec({ entry: { name: 't_probe2', description: 'x', parameters: {}, handler: () => ({ ok: true, tool: 't_probe2', value: 7 }) }, kernel: null, packId: 'probe' })
  const out = await spec.run({}, null)
  ok(out && out.ok === true && out.value === 7, '④ a normal handler result passes through unchanged', out)
}

console.log((failed === 0 ? '=== ALL PASS ===' : '=== ' + failed + ' FAILED ==='))
process.exit(failed === 0 ? 0 : 1)
