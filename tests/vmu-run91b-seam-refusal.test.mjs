// tests/vmu-run91b-seam-refusal.test.mjs — ROUND 91b: a seam REFUSAL must stay a refusal.
//
// Measured on the live run (r91b): `vibe_vmu_mathtools {action:"run", op:"numeric", args:{expr:"6*7"}}` answered
// `{"ok":true,"action":"run","value":null}`. The math seam had answered a named failure (`MATH_INVALID_ARGUMENT`,
// "op must be probe|run|receipt|install"), and `createMathTools().run()` never looked at `raw.ok` — it read the
// missing `result` as "no value", walked the result rails and returned a SUCCESS. A silent null is the one outcome
// a computation face must never invent: the member had no way to tell "the seam refused my vocabulary" from
// "the answer to my computation is null".
//
// What this suite pins:
//   ① a seam refusal surfaces with the seam's OWN code / message / hint (never `ok:true`);
//   ② a seam success still returns its result;
//   ③ a seam failure without code/message still refuses by name (VMU_ENGINE_UNAVAILABLE);
//   ④ the tool wrapper turns the refusal into a named refusal envelope (no ok:true either);
//   ⑤ the tool description names the seam's vocabulary instead of inventing operation names.

import { createMathTools } from '../vibe-math-vmu/kernel/mathtools.js'
import { makeMathtoolsSpec } from '../vibe-math-vmu/tools/mathtools.js'

let pass = 0
let fail = 0
const ok = (cond, msg) => { if (cond) { pass += 1 } else { fail += 1; console.error('FAIL: ' + msg) } }
const eq = (a, b, msg) => ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')')

const settingsOf = (rows = {}) => (key) => (key in rows ? rows[key] : undefined)

// ── ① a refusal from the seam is a refusal here ────────────────────────────────────────────────
{
  const seamRefusal = {
    ok: false,
    code: 'MATH_INVALID_ARGUMENT',
    message: 'op must be probe|run|receipt|install',
    hint: 'call probe first, then run with mode code|file|expr',
  }
  const mt = createMathTools({ settings: settingsOf(), clock: () => 0, spawn: async () => seamRefusal })
  let caught = null
  try { await mt.run({ op: 'numeric', args: { expr: '6*7' } }) } catch (e) { caught = e }
  ok(caught !== null, '§1 the run must throw instead of returning ok:true')
  eq(caught && caught.code, 'MATH_INVALID_ARGUMENT', '§1 the refusal keeps the seam code')
  eq(caught && caught.message, seamRefusal.message, '§1 the refusal keeps the seam message')
  eq(caught && caught.hint, seamRefusal.hint, '§1 the refusal keeps the seam hint')

  // the refusal is NOT counted as a run: nothing was computed, nothing is cacheable
  const st = mt.status()
  eq(st.counters.ran, 0, '§1 a refused run must not increment counters.ran')
}

// ── ② a success still comes back as a success ─────────────────────────────────────────────────
{
  const mt = createMathTools({ settings: settingsOf(), clock: () => 0, spawn: async () => ({ ok: true, result: { value: 42 } }) })
  const out = await mt.run({ op: 'run', args: { mode: 'expr', expr: '6*7' } })
  ok(out.ok === true, '§2 a successful run stays ok:true')
  eq(out.result && out.result.value, 42, '§2 the result is carried through')
  eq(mt.status().counters.ran, 1, '§2 a successful run increments counters.ran')
}

// ── ③ a failure without a code/message still refuses by name ──────────────────────────────────
{
  const mt = createMathTools({ settings: settingsOf(), clock: () => 0, spawn: async () => ({ ok: false }) })
  let caught = null
  try { await mt.run({ op: 'run', args: {} }) } catch (e) { caught = e }
  ok(caught !== null, '§3 an anonymous refusal still throws')
  eq(caught && caught.code, 'VMU_ENGINE_UNAVAILABLE', '§3 an anonymous refusal gets a NAMED code')
  ok(!!(caught && caught.message), '§3 an anonymous refusal still says something')
}

// ── ④ the tool wrapper returns a named refusal envelope (no ok:true) ──────────────────────────
{
  const seamRefusal = { ok: false, code: 'MATH_INVALID_ARGUMENT', message: 'op must be probe|run|receipt|install', hint: 'probe first' }
  const mt = createMathTools({ settings: settingsOf(), clock: () => 0, spawn: async () => seamRefusal })
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const spec = makeMathtoolsSpec({ param: (t, d, extra = {}) => Object.assign({ type: t, description: d }, extra), refused, TOOL_NAMES: { mathtools: 'vibe_vmu_mathtools' }, kernel: { mathtools: mt } })
  const env = await spec.run({ action: 'run', op: 'numeric', args: { expr: '6*7' } })
  eq(env.ok, false, '§4 the wrapper must not answer ok:true for a refused run')
  eq(env.code, 'MATH_INVALID_ARGUMENT', '§4 the wrapper carries the seam code')
  ok(!('value' in env), '§4 the wrapper must not invent a null value')
  // the plan action is unaffected: it is policy only and never calls the seam
  const plan = await spec.run({ action: 'plan', op: 'optim/minimize', args: {} })
  eq(plan.ok, true, '§4 plan still works without a seam')
}

// ── ⑤ the description names the seam's own vocabulary ────────────────────────────────────────
{
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const spec = makeMathtoolsSpec({ param: (t, d, extra = {}) => Object.assign({ type: t, description: d }, extra), refused, TOOL_NAMES: { mathtools: 'vibe_vmu_mathtools' }, kernel: { mathtools: createMathTools({ settings: settingsOf() }) } })
  ok(spec.description.includes('probe|run|receipt|install'), '§5 the description names the seam op vocabulary')
  ok(spec.description.includes('math_computation'), '§5 the description names WHICH seam it is talking to')
  ok(spec.description.includes('接缝') || spec.description.includes('seam'), '§5 the description says the vocabulary belongs to the seam')
}

console.log('ROUND 91b SEAM REFUSAL: ' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exitCode = 1
