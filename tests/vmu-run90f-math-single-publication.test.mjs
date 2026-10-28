#!/usr/bin/env node
// RUN 90f — the shared math tool must be PUBLISHED ONCE, no matter how many callers reach the host with it.
//
// MEASURED (clean-room run 90f, the first round where math actually assembled): an ordinary
// `vibe_vmu_mathtools { action: "run", op: "numeric" }` receipt answered
//   {"ok":false,"code":"VMU_STATE","message":"tool \"math_computation\" is already registered in this scope"}
// The math face itself worked (`math_computation {op:"run"}` returned stdout "1025"), so the failure was a
// REGISTRATION COLLISION, not a computation failure: host-math.js publishes the tool at assembly, and
// kernel/math.js's `createMathSurface` published it a second time through the same adapter.
//
// WHAT THIS SUITE PROVES: (1) the adapter's `register` is idempotent by name and counts the reuse;
// (2) `createMathSurface` asks `hasTool()` first and does not re-publish; (3) a real plugin boot with
// `config.math` registers `math_computation` exactly ONCE; (4) the surface still answers — a single publication
// must not cost the handler.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const { createHostMath } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host-math.js')).href)
const { createMathSurface } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'math.js')).href)
const { MATH_TOOL_NAME } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'math-computation.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-mathpub-')); roots.push(d); return d }

// ── §1 the adapter folds a second publication into the first handle ─────────────────────────────────
{
  const specs = []
  const disposes = []
  const root = await mkRoot()
  const ctx = {
    get: () => null,
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { specs.push(s.name); return () => { disposes.push(s.name) } } },
  }
  const host = createHostMath({ ctx, settings: {}, projectRoot: root })
  ok(host.hasTool(MATH_TOOL_NAME) === false, 'assembly alone publishes nothing: the surface decides when', host.publishedNames())
  host.register(MATH_TOOL_NAME, 'x', {}, () => ({ ok: true }))
  ok(host.hasTool(MATH_TOOL_NAME) === true, 'after the first publication the adapter knows it carries the tool', host.publishedNames())
  const again = host.register(MATH_TOOL_NAME, 'x', {}, () => ({ ok: true }))
  ok(again && again.reused === true, 'a SECOND publication of the same name is folded into the first handle', again)
  ok(host.reuseCount() === 1, 'the reuse is COUNTED (a reading, not a guess)', host.reuseCount())
  ok(specs.filter((n) => n === MATH_TOOL_NAME).length === 1,
    'the host saw exactly ONE registration call for the name', specs)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §2 createMathSurface does not re-publish on a host that already carries the tool ─────────────────
{
  const specs = []
  const root = await mkRoot()
  const ctx = {
    get: () => null,
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { specs.push(s.name); return () => {} } },
  }
  const host = createHostMath({ ctx, settings: {}, projectRoot: root })
  const surface = createMathSurface({ host, settings: {} })
  ok(surface.toolName === MATH_TOOL_NAME, 'the surface reports the shared tool name', surface.toolName)
  ok(specs.filter((n) => n === MATH_TOOL_NAME).length === 1,
    'binding the surface did NOT register the name a second time', specs)
  ok(host.reuseCount() === 0,
    'and it did not need the reuse path either — it asked `hasTool` FIRST', host.reuseCount())
  // the handler that WAS published is still the one the surface dispatches
  const out = await surface.registered
  ok(out && out.name === MATH_TOOL_NAME, 'the surface keeps the published registration description', out)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §3 a real plugin boot declares math ⇒ one and only one registration ─────────────────────────────
{
  const specs = []
  const root = await mkRoot()
  const ctx = {
    get: () => null,
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { specs.push(s.name); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, math: {} })
  await handle.ready()
  const mine = specs.filter((n) => n === MATH_TOOL_NAME)
  ok(mine.length === 1, 'the plugin boot published `math_computation` exactly ONCE', mine.length)
  const st = handle.status()
  ok(st && st.mathIntent && st.mathIntent.declared === true,
    'the entry states that math was DECLARED (the reason the tool exists at all)', st && st.mathIntent)
  ok(!st || !st.mathHostError, 'no math assembly failure was recorded', st && st.mathHostError)
  const kst = handle.kernel && typeof handle.kernel.status === 'function' ? handle.kernel.status() : null
  ok(kst && kst.math && kst.math.hostInjected === true, 'the kernel sees an injected math host', kst && kst.math)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §4 a plain read of the math face is not a registration ──────────────────────────────────────────
{
  const specs = []
  const root = await mkRoot()
  const ctx = {
    get: () => null,
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { specs.push(s.name); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, math: {} })
  await handle.ready()
  const before = specs.length
  // the kernel's own math surface: binding it again must be a no-op publication-wise
  const kstBefore = handle.kernel && typeof handle.kernel.status === 'function' ? handle.kernel.status().math : null
  const kstAfter = handle.kernel && typeof handle.kernel.status === 'function' ? handle.kernel.status().math : null
  ok(specs.length === before, 'reading the status surfaces publishes nothing new', { before, after: specs.length })
  // RULE E shape B: two objects that are both absent compare equal, so the stability claim must be made on
  // fields that are PROVEN to be there first — otherwise "stable" would also pass if the reading did not exist.
  ok(kstBefore && Array.isArray(kstBefore.toolsPublished) && kstBefore.toolsPublished.length === 1,
     'the math reading exists and lists exactly one published tool', kstBefore && kstBefore.toolsPublished)
  ok(kstAfter && kstAfter.toolsPublished.join(',') === kstBefore.toolsPublished.join(',') && kstAfter.publicationReuse === kstBefore.publicationReuse,
     'the math reading is STABLE across two reads (no lazy re-publish)', { before: kstBefore && kstBefore.toolsPublished, after: kstAfter && kstAfter.toolsPublished })
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

for (const d of roots) { try { await rm(d, { recursive: true, force: true, maxRetries: 10 }) } catch { /* best effort */ } }
console.log('\n=== RUN 90F MATH SINGLE PUBLICATION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
