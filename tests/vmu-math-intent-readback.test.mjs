#!/usr/bin/env node
// RUN 90/201 — "the computation surface is off" must be ANSWERABLE.
//
// MEASURED: a deployment declared the math surface at the wrong level of the plugin row (a sibling of `config`
// instead of a key inside it). The plugin then behaved exactly like a deployment that never asked for math at all:
// no `math_computation` tool, and a member's `vibe_vmu_mathtools { action: "run" }` answered
// `VMU_ENGINE_UNAVAILABLE "the math surface needs a host seam (register/spawn)"` — a sentence about the KERNEL,
// which sent the reader looking at configs that were already right.
//
// WHAT THIS SUITE PROVES: the entry states its own reading (`status().mathIntent`), so `declared:false` can never
// be mistaken for `declared:true` — and the three ways of declaring it are distinguishable by name.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-mathintent-')); roots.push(d); return d }

const boot = async (config) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { specs.push(s.name); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specs }
}

// §1 — no declaration: the reading says so, and no math tool is registered
{
  const root = await mkRoot()
  const b = await boot({ root })
  const intent = b.handle.status().mathIntent
  ok(intent && intent.declared === false, 'no declaration ⇒ mathIntent.declared is false', intent)
  ok(intent && intent.via === null, 'and it names no route (via:null) rather than guessing one', intent && intent.via)
  ok(Array.isArray(intent && intent.configKeys), 'the reading lists which config keys DID arrive', intent && intent.configKeys)
  ok(!b.specs.includes('math_computation'), 'and no computation tool was registered', b.specs.filter((n) => /math/.test(n)))
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// §2 — config.math: the route is named, and the surface is built
{
  const root = await mkRoot()
  const b = await boot({ root, math: {} })
  const intent = b.handle.status().mathIntent
  ok(intent && intent.declared === true, 'config.math ⇒ declared', intent)
  ok(intent && intent.via === 'config.math', 'and the route is named exactly', intent && intent.via)
  ok(b.specs.includes('math_computation'), 'the computation tool IS registered', b.specs.filter((n) => /math/.test(n)))
  ok(Object.isFrozen(intent) === true, 'the reading is FROZEN (a view that a consumer could write would lie next boot)', intent)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// §3 — a vmu.math.* setting also declares it, and the reading names that key
{
  const root = await mkRoot()
  const b = await boot({ root, 'vmu.math.computation': 'auto' })
  const intent = b.handle.status().mathIntent
  ok(intent && intent.declared === true, 'a vmu.math.* setting ⇒ declared', intent)
  ok(intent && intent.via === 'vmu.math.computation', 'and the route names the setting that declared it', intent && intent.via)
  ok(b.specs.includes('math_computation'), 'the computation tool IS registered here too', b.specs.filter((n) => /math/.test(n)))
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// §4 — `vmu.math.computation: off` stays out even when declared: the off switch is not a declaration
{
  const root = await mkRoot()
  const b = await boot({ root, math: {}, 'vmu.math.computation': 'off' })
  const intent = b.handle.status().mathIntent
  ok(intent && intent.declared === true, 'the intent is still declared (the switch is a separate policy)', intent)
  ok(!b.specs.includes('math_computation'), 'but the surface stays OUT when the switch is off', b.specs.filter((n) => /math/.test(n)))
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 10 }) } catch { /* gone */ } }
console.log('=== MATH INTENT READBACK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
