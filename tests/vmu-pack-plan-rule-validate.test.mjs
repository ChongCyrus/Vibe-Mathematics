// vmu pack PLAN vs the M1 rule validator — the plan path must run the same validator apply() does
// (round 20c, task-128).
//
// THE DEFECT THIS HOLDS. `kernel/pack.js`'s `validatePack` is a PURE function with no kernel, so for an M1 rule it
// could only require `on`. `apply()` then compiles every rule through `kernel.rules`, which ADDITIONALLY requires
// `when` and scans `when.subject` against the kernel's NAMED predicates. So `plan()` answered `problems: []` for
// manifests `apply()` then refused - and the refusal's own hint promised "it reports EVERY problem", which was
// false in both directions (plan did not run the rule validator at all, and it still cannot see a middleware
// MODULE's problems, which only `kernel/loader` finds at apply time).
//
// `kernel.rules.validate(rule)` is the module's own single call covering BOTH halves; its comment records that
// this exact asymmetry was fixed ONCE at the rules layer ("the predicate scan used to live only inside
// toBusEntries, so validate() said fine") while the pack layer kept bypassing it. The fix wires that call into
// `buildPlan`, where the kernel IS in scope - deliberately NOT into `validatePack`, which cannot reach a kernel.
//
// WHY EACH DIRECTION IS HERE: the two "plan must NAME it" assertions alone could be satisfied by a validator that
// refuses everything, so the reverse direction (a LEGAL rule plans silently) and the shipped-pack regression guard
// are what make the pair mean something. P0 asserts the validator itself is the source of truth, so silence can
// never be bought by gutting it.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const ENTRY = resolve(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PACKER = resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')
const KERNEL = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const V5R = resolve(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const packMod = await import(pathToFileURL(PACKER).href)
const kernelMod = await import(pathToFileURL(KERNEL).href)
const entry = await import(pathToFileURL(ENTRY).href)

/** A kernel WITH a root plus the loader built exactly the way the entry builds it (registry passed). */
async function freshLoader() {
  const root = await mkdtemp(join(tmpdir(), 'vmu-plan-rule-'))
  const kernel = kernelMod.createKernel({ root })
  const loader = packMod.createPackLoader({ kernel, registry: kernel.registry })
  return { root, kernel, loader }
}

// A registered host hook is used on purpose: an UNREGISTERED one would add its own problem and the assertions
// below could pass for the wrong reason.
const HOOK = 'tools/result'
const NO_WHEN = { id: 'p-nowhen', rules: [{ id: 'r-nowhen', on: [HOOK], then: [{ record: { track: 'progress' } }] }] }
const BAD_SUBJECT = { id: 'p-badsubj', rules: [{ id: 'r-badsubj', on: [HOOK], when: { subject: 'no-such-predicate' }, then: [{ record: { track: 'progress' } }] }] }
const LEGAL = { id: 'p-legal', rules: [{ id: 'r-legal', on: [HOOK], when: {}, then: [{ record: { track: 'progress' } }] }] }

// =========================================================================================================
// A. THE VALIDATOR IS THE SOURCE OF TRUTH (so "plan is quiet" cannot be bought by gutting it)
// =========================================================================================================
{
  const { kernel, loader, root } = await freshLoader()
  const vNo = kernel.rules.validate(NO_WHEN.rules[0])
  const vBad = kernel.rules.validate(BAD_SUBJECT.rules[0])
  const vOk = kernel.rules.validate(LEGAL.rules[0])
  ok(Array.isArray(vNo) && vNo.length > 0 && vNo.some((p) => /when is required/.test(String(p))),
    'P0a. the source of truth itself reports the missing `when`, so the plan assertions below rest on a real check', vNo)
  ok(Array.isArray(vBad) && vBad.length > 0 && vBad.some((p) => /unknown named predicate/.test(String(p))),
    'P0b. ...and it reports an unknown NAMED predicate (the half that used to live only inside toBusEntries)', vBad)
  ok(vOk.length === 0, 'P0c. and it is SILENT for a legal rule - the validator is not simply always complaining', vOk)

  // B. plan NAMES the missing `when` (this is the defect: it used to answer `problems: []`)
  const p1 = loader.plan(NO_WHEN)
  ok(p1.ok === false, 'P1. plan() REFUSES a rule with no `when` instead of reporting nothing', p1)
  ok(p1.code === 'VMU_PACK_MISSING', 'P1b. ...with the same code apply() uses for manifest problems', p1.code)
  ok(p1.problems.length > 0 && p1.problems.some((p) => /when is required/.test(String(p))),
    'P1c. ...and the problem text NAMES the missing `when`', p1.problems)
  ok(p1.problems.length > 0 && p1.problems.some((p) => String(p).includes('r-nowhen')),
    'P1d. ...and says WHICH rule (an unattributed "when is required" is nearly useless in a pack with many rules)', p1.problems)

  // C. plan NAMES the unknown named predicate
  const p2 = loader.plan(BAD_SUBJECT)
  ok(p2.ok === false, 'P2. plan() REFUSES a `when.subject` that names no kernel predicate', p2)
  ok(p2.problems.length > 0 && p2.problems.some((p) => /unknown named predicate/.test(String(p)) && String(p).includes('no-such-predicate')),
    'P2b. ...naming the offending predicate', p2.problems)
  ok(p2.problems.length > 0 && p2.problems.some((p) => String(p).includes('r-badsubj')),
    'P2c. ...and the rule it is in', p2.problems)

  // D. THE REVERSE DIRECTION: a legal rule plans SILENTLY (without this, "plan refuses" could mean "plan always refuses")
  const p3 = loader.plan(LEGAL)
  ok(p3.ok === true, 'P3. a LEGAL rule plans clean - the new check does not turn valid packs red', p3)
  ok(Array.isArray(p3.problems) && p3.problems.length === 0, 'P3b. ...with an empty problem list', p3.problems)

  try { await rm(root, { recursive: true, force: true }) } catch { /* the store handle may still be held */ }
}

// =========================================================================================================
// E. NO REGRESSION ON THE PACK THAT ACTUALLY SHIPS (the strongest evidence the seam is safe)
// =========================================================================================================
{
  const { loader, root } = await freshLoader()
  const v5r = await import(pathToFileURL(V5R).href)
  const manifest = v5r.PACK || v5r.default
  const p = loader.plan(manifest)
  const rules = Array.isArray(manifest.rules) ? manifest.rules : []
  ok(rules.length > 0, 'E0. the shipped pack really carries M1 rules, so this is not a vacuous regression guard', { rules: rules.length })
  ok(p.ok === true && Array.isArray(p.problems) && p.problems.length === 0,
    'E1. ★ the REAL shipped v5r pack still plans CLEAN after the validator was wired in (no false positive on the pack we ship)', p)
  try { await rm(root, { recursive: true, force: true }) } catch { /* going away */ }
}

// =========================================================================================================
// F. THE TWO PATHS AGREE: direct loader vs the real entry (`config.packs`)
// =========================================================================================================
{
  // (i) DIRECT: plan refuses by name, and apply refuses with the SAME code and the SAME named reason.
  // ★ MEASURED CONSEQUENCE OF THE FIX (round 20c): before it, apply() reached `kernel/loader` and this class came
  // back as `VMU_MIDDLEWARE_FAILED`. Now `apply()` consults `buildPlan` FIRST (pack.js), so the same rule problem
  // is refused earlier as `VMU_PACK_MISSING` - i.e. plan and apply agree on the code as well as on the text. An
  // assertion pinned to the OLD code would have been passing on a description of the pre-fix world.
  const { loader, root } = await freshLoader()
  const planned = loader.plan(NO_WHEN)
  let applyErr = null
  try { await loader.apply(NO_WHEN) } catch (e) { applyErr = e }
  ok(planned.ok === false, 'F1. DIRECT loader: plan() is already a named refusal', planned)
  ok(applyErr !== null && applyErr.code === 'VMU_PACK_MISSING' && /when is required/.test(String(applyErr.message)),
    'F2. DIRECT loader: apply() refuses with the SAME named code (VMU_PACK_MISSING) and the same cause', applyErr && applyErr.code)
  ok(applyErr !== null && String(applyErr.message).includes('r-nowhen') && planned.problems.some((p) => String(p).includes('r-nowhen')),
    'F3. ★ both DIRECT readings name the SAME rule, so plan and apply are not describing different things',
    { plan: planned.problems, apply: String(applyErr && applyErr.message) })
  ok(applyErr !== null && planned.code === applyErr.code,
    'F3b. ★ the CODE agrees too: plan and apply do not disagree about what kind of refusal this is',
    { plan: planned.code, apply: applyErr && applyErr.code })

  // (ii) REAL ENTRY: the refusal is recorded instead of thrown, and nothing is recorded as applied.
  const root2 = await mkdtemp(join(tmpdir(), 'vmu-plan-rule-entry-'))
  const listeners = {}
  const ctx = {
    effect: (fn) => fn(),
    on: (name, l) => { (listeners[name] = listeners[name] || []).push(l); return () => {} },
    tools: { register: async () => () => {} },
  }
  const handle = entry.apply(ctx, { clock: () => 1000000, root: root2, packs: [NO_WHEN], deliver: () => {} })
  await handle.ready()
  const errs = handle.packErrors()
  ok(handle.appliedPacks().length === 0, 'F4. REAL ENTRY: nothing is recorded as applied', handle.appliedPacks())
  // ★ `[].every(…)` is vacuously true: the non-emptiness precondition is in the SAME expression on purpose.
  ok(errs.length > 0 && errs.every((e) => e.code === 'VMU_PACK_MISSING'),
    'F5. REAL ENTRY: the refusal is RECORDED (not thrown into the void) with the same code the direct path used', errs)
  ok(errs.length > 0 && errs.some((e) => /when is required/.test(String(e.message)) && String(e.message).includes('r-nowhen')),
    'F6. ★ REAL ENTRY: the recorded reason names the SAME rule and the SAME cause as the direct path',
    errs.map((e) => e.message))
  try { await rm(root2, { recursive: true, force: true }) } catch { /* going away */ }
  try { await rm(root, { recursive: true, force: true }) } catch { /* going away */ }
}

console.log('=== VMU PACK PLAN RULE VALIDATE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
