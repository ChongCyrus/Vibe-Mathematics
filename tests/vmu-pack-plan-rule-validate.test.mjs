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

// =========================================================================================================
// G. THE TWO DECLARATION SHAPES: `rules[]` and `middleware[{kind:'rules'}]` MUST BEHAVE THE SAME
// =========================================================================================================
// A manifest may declare an M1 rule in TWO places: `manifest.rules[]`, or a `middleware` entry carrying
// `kind:'rules'` (a shape `validatePack` explicitly allows - "the bus runs `rules` and `module` only"). Both are
// compiled by `kernel.rules.toBusEntries` in apply(). The middleware shape used to be handed to `bus.add` RAW, and
// `kernel/bus.js` EXEMPTS `kind:'rules'` from its "must have a handler" rule - so the entry reached the bus with NO
// handler, `emit()` only recorded `middleware/skipped`, and the rule NEVER FIRED, even when perfectly valid
// (measured independently by two people, two predicates x two emit modes). These assertions pin the two shapes
// TOGETHER, so a future change that lets one of them go inert again cannot pass silently.
{
  const { kernel, loader, root } = await freshLoader()
  const RULE = { id: 'r-shape', kind: 'rules', on: ['tools/pre-execute'], when: {}, then: [{ deny: { code: 'VMU_SHAPE_DENY', message: 'fired' } }] }
  const payload = { tool: 'vibe_vmu_script', args: {}, agent: null, hook: 'tools/pre-execute' }

  // Shape A (the historical, working one) - the baseline this test is measured against.
  await loader.apply({ id: 'p-shape-a', rules: [RULE] })
  const a = await kernel.bus.emit('tools/pre-execute', payload)   // ★ awaited: JSON.stringify(<Promise>) is "{}"
  ok(a && a.decision && a.decision.deny && a.decision.deny.code === 'VMU_SHAPE_DENY',
    'G1. shape A (`rules[]`): the rule FIRES (this is the baseline, and it exists so G2 means something)', a && a.decision)

  // Shape B (the one that used to be a dead entry) - the SAME rule, the SAME hook, a fresh assembly.
  const b = await freshLoader()
  await b.loader.apply({ id: 'p-shape-b', middleware: [RULE] })
  const entries = (b.kernel.bus.status().entries || []).map((e) => e.id)
  // ★ non-emptiness inside the same expression: `[].every(…)` is vacuously true.
  ok(entries.length > 0 && entries.every((id) => typeof id === 'string'),
    'G2. shape B (`middleware[{kind:"rules"}]`): the entry really reaches the bus (it always did)', entries)
  const bb = await b.kernel.bus.emit('tools/pre-execute', payload)
  ok(bb && bb.decision && bb.decision.deny && bb.decision.deny.code === 'VMU_SHAPE_DENY',
    'G3. ★ AND IT FIRES: shape B now goes through the rule engine, so it compiles into a real handler instead of landing on the bus with none', bb && bb.decision)

  // Reverse: a shape-B rule with a RESTRICTIVE predicate must deny on its match and stay silent off it - so G3 is
  // the rule deciding, not a blanket deny. (My first version of this assertion used the always-match rule above and
  // failed: `when:{}` denies EVERY payload, so it could not have shown selectivity at all.)
  const B_RULE_TOOL = { id: 'r-shape-tool', kind: 'rules', on: ['tools/pre-execute'], when: { all: [{ tool: ['vibe_vmu_script'] }] }, then: [{ deny: { code: 'VMU_SHAPE_TOOL', message: 'tool-matched' } }] }
  const b2 = await freshLoader()
  await b2.loader.apply({ id: 'p-shape-b2', middleware: [B_RULE_TOOL] })
  const hit = await b2.kernel.bus.emit('tools/pre-execute', payload)
  const quiet = await b2.kernel.bus.emit('tools/pre-execute', { tool: 'some_other_tool', args: {}, agent: null, hook: 'tools/pre-execute' })
  ok(hit && hit.decision && hit.decision.deny && hit.decision.deny.code === 'VMU_SHAPE_TOOL',
    'G4a. a shape-B rule with a RESTRICTIVE predicate denies ON its match', hit && hit.decision)
  ok(!(quiet && quiet.decision && quiet.decision.deny),
    'G4b. ...and stays SILENT off it: the firing is the predicate deciding, not a blanket deny', quiet && quiet.decision)

  // Shape B with an INVALID rule must be refused at PLAN, like shape A.
  const bad = await freshLoader()
  const noWhen = { id: 'r-shape-bad', kind: 'rules', on: ['tools/pre-execute'], then: [{ deny: { code: 'VMU_X', message: 'x' } }] }
  const plannedB = bad.loader.plan({ id: 'p-shape-bad', middleware: [noWhen] })
  ok(plannedB.ok === false && plannedB.problems.length > 0 && plannedB.problems.some((p) => /when is required/.test(String(p))),
    'G5. ★ shape B with an INVALID rule is named at PLAN (the same rule in `rules[]` already was - the two shapes are finally symmetric)', plannedB)

  for (const rt of [root, b.root, b2.root, bad.root]) { try { await rm(rt, { recursive: true, force: true }) } catch { /* going away */ } }
}

// =========================================================================================================
// H. ZERO REGRESSION ON EVERY SHIPPED PACK (plan + apply, on the loader the entry builds)
// =========================================================================================================
// The middleware-shape fix is a BEHAVIOUR CHANGE (such rules now really fire). It is only acceptable because no
// shipped pack uses that shape - so this section runs EVERY shipped pack through the real loader, with the same
// seams the entry passes (settingSource + onPromptPolicy). A pack that used shape B would show up here.
{
  const shipped = [
    ['institute-min', 'packs/institute-min/index.js'],
    ['v3-core', 'packs/v3-core/index.js'],
    ['v5r', 'packs/v5r/index.js'],
  ]
  for (const [name, rel] of shipped) {
    const root = await mkdtemp(join(tmpdir(), `vmu-shipped-${name}-`))
    const kernel = kernelMod.createKernel({ root })
    const loader = packMod.createPackLoader({
      kernel, registry: kernel.registry,
      settingSource: (key) => kernel.settingSource(key),
      onPromptPolicy: () => {},
    })
    const mod = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', rel)).href)
    const manifest = mod.PACK || mod.V5R_PACK || mod.default
    const planned = loader.plan(manifest)
    let applyErr = null
    try { await loader.apply(manifest) } catch (e) { applyErr = e }
    ok(planned.ok === true && Array.isArray(planned.problems) && planned.problems.length === 0,
      'H1. shipped pack ' + name + ': still PLANS CLEAN', planned)
    ok(applyErr === null, 'H2. shipped pack ' + name + ': still APPLIES without throwing', applyErr && applyErr.code)
    try { await rm(root, { recursive: true, force: true }) } catch { /* going away */ }
  }

  // H3 IS DELIBERATELY NOT INSIDE THE LOOP. It used to be guarded by `if (name === 'v5r') { … }`, which the C2
  // criterion rightly flags: an assertion inside a statement-position `if` is SKIPPED (and reported by nothing) if
  // that branch never runs - so removing `v5r` from the list above would have made the check vanish instead of
  // failing. It now runs unconditionally, and the premise it relies on is asserted first.
  ok(shipped.some(([n]) => n === 'v5r'), 'H0. the shipped list really contains v5r, so H3 below is not vacuous', shipped.map(([n]) => n))
  const v5rRoot = await mkdtemp(join(tmpdir(), 'vmu-shipped-v5r-rule-'))
  const v5rKernel = kernelMod.createKernel({ root: v5rRoot })
  const v5rLoader = packMod.createPackLoader({
    kernel: v5rKernel, registry: v5rKernel.registry,
    settingSource: (key) => v5rKernel.settingSource(key),
    onPromptPolicy: () => {},
  })
  const v5rMod = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'packs/v5r/index.js')).href)
  await v5rLoader.apply(v5rMod.PACK || v5rMod.default)
  const fired = await v5rKernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_script', args: {}, agent: null, hook: 'tools/pre-execute' })
  ok(fired && fired.decision && fired.decision.deny && fired.decision.deny.code === 'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS',
    'H3. ★ the SHIPPED v5r rule still fires on the real assembly (no regression on the historical path; it discriminates by tool, so a blanket deny could not fake it)', fired && fired.decision)
  try { await rm(v5rRoot, { recursive: true, force: true }) } catch { /* going away */ }
}

console.log('=== VMU PACK PLAN RULE VALIDATE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
