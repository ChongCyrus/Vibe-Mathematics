#!/usr/bin/env node
// dsh-vibe-math doctor — "WHY IS THERE ONLY ONE TOOL?" ANSWERED WITH A COMMAND.
//
// WHY THIS EXISTS (round-1 audit, C#24 / P0-e and C#27): a cold start publishes exactly ONE tool (`vibe_vmu_status`)
// because the shipped preset row declares no config, and nothing on any read face said why; the registration failures
// the adapter collects only ever appeared in the install receipt and on stderr. There was no doctor anywhere in the
// repository. This script is READ-ONLY unless you ask for `--seed`.
//
// WHAT IT REPORTS (all of it computed, none of it asserted):
//   1. versions      — dsh (from --dsh-root/package.json when given), vmu (package.json of the preset), node;
//   2. profile       — path + the bundle count when a profile package.json is readable;
//   3. configSource  — preset | seeded | none, with the evidence (the installed preset row's `config:` or the seed marker);
//   4. SIMULATED COLD START — the adapter is installed against an in-memory host: it reports how many tools WOULD
//      register with NO config (the documented zero-mechanism default, expected 1) and with the minimal seed (expected
//      >1), plus every registration failure BY NAME with its repair hint. This is the code-level half; the real
//      model-facing picker cannot be reproduced from a script, and the verdict says so instead of pretending.
//   5. the same three steps the seats read: `kernel.status({detail:"full"}).coldStart` — the doctor feeds it the facts
//      it just measured and prints them, so the script and the receipt cannot tell different stories.
//   6. repair        — executable next actions (`--seed`, reinstall, fix a named face).
//
// USAGE
//   node scripts/doctor.mjs                     # this checkout's preset source (read-only)
//   node scripts/doctor.mjs --preset-root <dir> # a profile's preset root (the installer's destination)
//   node scripts/doctor.mjs --preset-root <dir> --seed   # write the minimal runnable config, then report
//   node scripts/doctor.mjs --json
//
// EXIT: 0 when the profile is ready (config present AND every declared tool registered), 1 otherwise — a doctor that
// always exits 0 cannot be used in a gate.

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  COLD_START_FACES, coldStartConfig, flattenColdStartConfig, readSeedState, seedInstalledPreset,
  coldStartConfigYaml,
} from './lib/install-seed.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

const argv = process.argv.slice(2)
const argOf = (name, fallback = null) => {
  const i = argv.indexOf('--' + name)
  if (i < 0) return fallback
  const v = argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const flag = (name) => argv.includes('--' + name)

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

/** Repair advice per failure code — the same vocabulary the kernel's coldStart.unavailable[].hint uses. */
const REPAIR_BY_CODE = Object.freeze({
  VMU_ENGINE_UNAVAILABLE: 'the host is missing a service this face needs (tools.register / agents / store): run the preset inside DSH, and check the preset row mounts ./vibe-math-vmu.js',
  VMU_NO_SUCH_OBJECT: 'a declared name does not exist in this build: remove it from vmu.tools.faces (status().faces.enabled lists the legal faces)',
  VMU_INVALID_ARGUMENT: 'the declaration is malformed: the message names the key; fix it and reload the profile',
  VMU_TOOL_REGISTRATION_FAILED: 'the host refused this registration (often a duplicate name from a second vmu row): keep ONE vmu row per profile',
  VMU_SEED_PRESET_ABSENT: 'there is no installed preset to seed: install the bundle first (dsh plugin --profile <name> add dsh-vibe-math)',
  VMU_SEED_WRITE_FAILED: 'the seed could not be written: check the preset directory permissions and retry',
})

/** Install the adapter against an IN-MEMORY host and report exactly what the receipt says. No DSH process needed. */
async function simulateInstall({ presetDir, settings }) {
  const kernelPath = join(presetDir, 'kernel', 'index.js')
  const hostPath = join(presetDir, 'host.js')
  if (!existsSync(kernelPath) || !existsSync(hostPath)) {
    return { ok: false, code: 'VMU_DOCTOR_PRESET_INCOMPLETE',
      message: 'the preset directory has no kernel/index.js or host.js (expected an installed vmu preset)',
      hint: 'point --preset-root at the directory that CONTAINS the preset folder (e.g. <profile>/.agent-presets), or omit it to inspect this checkout' }
  }
  let km = null
  let hm = null
  try {
    km = await import(pathToFileURL(kernelPath).href + '?doctor=' + Date.now())
    hm = await import(pathToFileURL(hostPath).href + '?doctor=' + Date.now())
  } catch (e) {
    return { ok: false, code: 'VMU_DOCTOR_IMPORT_FAILED', message: String((e && e.message) || e),
      hint: 'the installed preset files are inconsistent (half-written or wrong version): reinstall the bundle' }
  }
  const kernel = km.createKernel({ clock: () => Date.now() })
  const registered = []
  const receipt = { installed: 0, failures: [] }
  const ctx = {
    tools: { register: async (spec) => { registered.push(spec && spec.name); return () => {} }, schemas: () => registered.slice() },
    effect: (fn) => fn(),
    on: () => () => {},
    get: () => null,
  }
  try {
    const adapter = hm.createHostAdapter({ ctx, kernel, settings: settings || {} })
    const plan = adapter.plan()
    const r = await adapter.install()
    receipt.installed = r && Number.isFinite(Number(r.installed)) ? Number(r.installed) : registered.length
    receipt.failures = (r && Array.isArray(r.failures) ? r.failures : []).map((f) => ({
      name: f && f.name ? f.name : null,
      code: (f && f.code) || 'VMU_TOOL_REGISTRATION_FAILED',
      message: String((f && f.message) || ''),
      hint: REPAIR_BY_CODE[(f && f.code) || ''] || REPAIR_BY_CODE.VMU_TOOL_REGISTRATION_FAILED,
    }))
    receipt.planCount = plan && Number.isFinite(Number(plan.count)) ? Number(plan.count) : null
  } catch (e) {
    receipt.installError = { code: (e && e.code) || 'VMU_DOCTOR_INSTALL_THREW', message: String((e && e.message) || e) }
  }
  return { ok: true, kernel, receipt, registered: registered.slice() }
}

export async function doctor({ presetRoot = REPO, presetDir = 'vibe-math-vmu', profile = null, dshRoot = null, seed = false, json = false } = {}) {
  const root = resolve(presetRoot)
  const state = readSeedState({ presetRoot: root, presetDir })
  const dir = state.paths.dir
  const vmuPkg = readJson(join(dir, 'package.json')) || readJson(join(REPO, 'package.json'))
  const dshPkg = dshRoot ? readJson(join(resolve(dshRoot), 'package.json')) : null
  const profilePkg = profile ? readJson(join(resolve(profile), 'package.json')) : null
  const out = {
    schema: 1,
    versions: {
      dsh: dshPkg && dshPkg.version ? dshPkg.version : null,
      dshMeans: dshPkg ? 'read from ' + join(resolve(dshRoot || ''), 'package.json') : 'NOT READ: pass --dsh-root <dir containing package.json>; the doctor cannot see the host from here',
      vmu: vmuPkg && vmuPkg.version ? vmuPkg.version : null,
      node: process.version,
    },
    preset: { root, dir, present: state.present },
    profile: profile ? { path: resolve(profile), bundles: profilePkg && profilePkg.dsh && profilePkg.dsh.profile && Array.isArray(profilePkg.dsh.profile.bundles) ? profilePkg.dsh.profile.bundles.length : null } : null,
    configSource: state.source,
    seed: null,
    simulated: null,
    status: null,
    verdict: null,
    repair: [],
    limits: 'The model-facing tool picker is NOT reproduced here: this doctor installs the adapter against an in-memory host and reports what THAT receipt says. A real DSH session can still differ (host version, another plugin shadowing a name); the receipt and status().coldStart are the runtime evidence, this is the pre-flight one.',
  }
  if (seed) {
    // ★ A SOURCE CHECKOUT IS NOT A PROFILE: seeding it would put a config: block on the shipped preset row, which
    // tests/audit-preset-overlay-shape.test.mjs (run 90, measured) forbids — the deployment owns that key. The seed is
    // for the INSTALLED copy under a profile's preset root, so a source checkout is refused by name.
    if (dir === join(REPO, 'vibe-math-vmu')) {
      out.seed = { ok: false, seeded: false, why: 'source-checkout', code: 'VMU_SEED_SOURCE_CHECKOUT',
        means: 'this is the preset SOURCE (' + dir + '), not an installed profile copy: seeding it would pre-fill the deployment config key. Point --preset-root at the installed preset root (e.g. <profile>/.agent-presets) and re-run.' }
    } else {
      out.seed = seedInstalledPreset({ presetRoot: root, presetDir, at: new Date().toISOString() })
    }
    out.configSource = readSeedState({ presetRoot: root, presetDir }).source
  }
  // Two simulations, one for each answer a cold-start user needs: the zero-mechanism default and the seeded face set.
  const bare = await simulateInstall({ presetDir: dir, settings: {} })
  const seededSettings = flattenColdStartConfig(out.seed && out.seed.config ? out.seed.config : coldStartConfig())
  const withSeed = await simulateInstall({ presetDir: dir, settings: seededSettings })
  out.simulated = {
    faces: COLD_START_FACES.slice(),
    withoutConfig: bare.ok ? { registeredTools: bare.receipt.installed, planCount: bare.receipt.planCount, failures: bare.receipt.failures, installError: bare.receipt.installError || null } : bare,
    withSeedConfig: withSeed.ok ? { registeredTools: withSeed.receipt.installed, planCount: withSeed.receipt.planCount, failures: withSeed.receipt.failures, installError: withSeed.receipt.installError || null } : withSeed,
    means: 'withoutConfig is the DOCUMENTED zero-mechanism default (exactly ONE tool: status); withSeedConfig is what the minimal runnable seed publishes. If withoutConfig is 1 and configSource is "none", the cold start IS the audit finding',
  }
  // The SAME three steps the seats read: feed the receipt into the kernel and print it back (one source of truth).
  if (withSeed.ok) {
    try {
      withSeed.kernel.noteColdStartFacts({
        installed: withSeed.receipt.installError === undefined,
        registered: withSeed.receipt.installed,
        failures: withSeed.receipt.failures,
        configSource: out.configSource.value,
        configSourceEvidence: out.configSource.evidence,
        source: 'scripts/doctor.mjs (simulated adapter.install receipt)',
      })
      out.status = withSeed.kernel.status({ detail: 'full' }).coldStart
    } catch (e) { out.status = { error: String((e && e.message) || e) } }
  }
  // Verdict + executable repair. Both are computed from the measurements above.
  const sim = out.simulated.withSeedConfig || {}
  const failures = Array.isArray(sim.failures) ? sim.failures : []
  const registeredCount = Number(sim.registeredTools)
  const problems = []
  if (out.configSource.value === 'none') problems.push('cold-start-zero-mechanism')
  if (sim.installError) problems.push('install-threw')
  if (failures.length > 0) problems.push('registration-failures')
  out.verdict = problems.length === 0 && Number.isFinite(registeredCount) && registeredCount > 1
    ? { ok: true, kind: 'ready', means: 'the profile declares (or has seeded) a config and the simulated install registers ' + registeredCount + ' tools with no failures' }
    : { ok: false, kind: problems[0] || 'not-ready', problems,
      means: problems.length === 0
        ? 'the simulated install registered ' + String(registeredCount) + ' tool(s): a cold start would publish one tool and the zero-mechanism default would be in force — seed a config'
        : 'at least one cold-start step failed: ' + problems.join(', ') }
  const sourceCheckout = dir === join(REPO, 'vibe-math-vmu')
  if (out.configSource.value === 'none' && sourceCheckout) {
    out.repair.push('this is the preset SOURCE: install the bundle into a profile first (the installer seeds the installed copy), or point --preset-root at an installed preset root and add --seed')
  } else if (out.configSource.value === 'none') {
    out.repair.push('node scripts/doctor.mjs --preset-root ' + root + ' --seed   # write the minimal runnable config into the installed preset (the installer also does this on a fresh install)')
  }
  if (failures.length > 0) for (const f of failures.slice(0, 5)) out.repair.push('fix ' + (f.name || '(unnamed)') + ' [' + f.code + ']: ' + (f.hint || f.message))
  if (sim.installError) out.repair.push('the adapter threw during install: ' + sim.installError.code + ' — ' + sim.installError.message)
  if (out.repair.length === 0) out.repair.push('nothing to repair: keep the seed (configSource:' + out.configSource.value + ') and re-run after upgrading')
  if (!json) printReport(out)
  return out
}

function printReport(o) {
  const L = []
  L.push('=== dsh-vibe-math doctor ===')
  L.push('versions: dsh=' + (o.versions.dsh || 'unknown') + ' vmu=' + (o.versions.vmu || 'unknown') + ' node=' + o.versions.node)
  L.push('preset:   ' + o.preset.dir + (o.preset.present ? '' : '  (NOT PRESENT)'))
  if (o.profile) L.push('profile:  ' + o.profile.path + (o.profile.bundles === null ? ' (no readable package.json)' : ' (' + o.profile.bundles + ' bundles)'))
  L.push('configSource: ' + o.configSource.value + '  [' + o.configSource.at + ']')
  L.push('  evidence: ' + o.configSource.evidence)
  if (o.seed) L.push('seed: ' + (o.seed.seeded ? 'SEEDED ' + JSON.stringify(o.seed.faces) : (o.seed.why || o.seed.code)))
  L.push('')
  L.push('-- simulated cold start (in-memory host; the real picker is NOT reproduced) --')
  const sim = o.simulated
  if (!sim) L.push('  (no simulation)')
  else {
    const b = sim.withoutConfig || {}
    const w = sim.withSeedConfig || {}
    L.push('  without config: ' + (b.registeredTools === undefined ? 'ERROR ' + (b.code || '') : b.registeredTools + ' tool(s)' + (b.failures && b.failures.length ? ', ' + b.failures.length + ' failure(s)' : '')))
    L.push('  with seed:      ' + (w.registeredTools === undefined ? 'ERROR ' + (w.code || '') : w.registeredTools + ' tool(s)' + (w.failures && w.failures.length ? ', ' + w.failures.length + ' failure(s)' : '')))
    for (const f of (w.failures || []).slice(0, 8)) L.push('    FAIL ' + (f.name || '(unnamed)') + ' [' + f.code + '] ' + (f.message || '') + ' → ' + (f.hint || ''))
  }
  if (o.status && !o.status.error) {
    L.push('')
    L.push('-- status({detail:"full"}).coldStart (fed from the receipt above) --')
    L.push('  installed: ' + JSON.stringify(o.status.installed))
    L.push('  registeredTools: ' + JSON.stringify(o.status.registeredTools))
    L.push('  unavailable: ' + JSON.stringify({ reported: o.status.unavailable.reported, count: o.status.unavailable.count }))
    for (const f of (o.status.unavailable.items || []).slice(0, 8)) L.push('    · ' + (f.name || '(unnamed)') + ' [' + f.code + '] ' + (f.hint || f.message || ''))
    L.push('  configSource: ' + JSON.stringify(o.status.configSource))
  }
  L.push('')
  L.push('verdict: ' + (o.verdict.ok ? 'READY — ' : 'NOT READY — ') + o.verdict.means)
  L.push('repair:')
  for (const r of o.repair) L.push('  · ' + r)
  L.push('')
  L.push('limits: ' + o.limits)
  process.stdout.write(L.join('\n') + '\n')
}

// CLI
const isMain = (() => { try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const presetRootArg = argOf('preset-root', null)
  const out = await doctor({
    presetRoot: presetRootArg === true || presetRootArg === null ? REPO : String(presetRootArg),
    presetDir: String(argOf('preset', 'vibe-math-vmu')),
    profile: argOf('profile', null) === true ? null : (argOf('profile', null) ? String(argOf('profile', null)) : null),
    dshRoot: argOf('dsh-root', null) === true ? null : (argOf('dsh-root', null) ? String(argOf('dsh-root', null)) : null),
    seed: flag('seed'),
    json: flag('json'),
  })
  if (flag('json')) process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  process.exit(out.verdict.ok ? 0 : 1)
}
