// vmu registry — the capability scenario for kernel/registry.js (docs/03 §7, docs/05 §6.4).
//
// The scenarios are the three properties that make the public face a contract:
//   · NOTHING IS OVERRIDDEN SILENTLY: a second registration of the same name, and an alias that would
//     shadow a published name, are both refused (O4). A pack cannot quietly replace a service;
//   · VERSIONS ARE CHECKED, NOT TRUSTED: `requires` entries that are missing, malformed, or too new are
//     reported with the compared numbers, and a pack newer than the published contract is flagged;
//   · AN ALIAS NEVER HIDES ITSELF: resolving through a legacy name reports the alias, its deprecation and
//     its reason - including the D14 case, where the inherited tool name `math_computation` stays CANONICAL
//     and `vibe_vmu_math` is only an alias pointing at it (the reverse would break the shared module).
//
// `--self-probe` copies the module, REMOVES the shadow refusal and requires the "no silent override"
// assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'registry.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = (fn, code, name) => {
  try { fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const mk = () => m.createRegistry({
  services: { 'vmu.library': { apiVersion: 1, read: () => 'records' }, 'vmu.members': { apiVersion: 2 } },
  tools: { math_computation: { impl: { toolName: 'math_computation' }, apiVersion: 1 } },
})

// ---- 1. registration is a contract, not a convenience ------------------------------------------
{
  const r = mk()
  ok(r.packContractVersion === m.PACK_CONTRACT_VERSION, 'the pack contract version is published')
  expectThrow(() => r.register('vmu.library', { apiVersion: 1 }), 'VMU_MIDDLEWARE_FAILED', 'registering a published name again is refused (no silent override)')
  expectThrow(() => r.register('vmu.bad', { }), 'VMU_INVALID_ARGUMENT', 'a service without an apiVersion is refused')
  expectThrow(() => r.register('not a name', { apiVersion: 1 }), 'VMU_INVALID_ARGUMENT', 'a malformed name is refused')
  const good = r.register('vmu.extra', { apiVersion: 3 }, { description: 'extra' })
  ok(good.ok === true && good.packContractVersion === 1, 'a fresh name registers and reports the contract version')
  const c = r.contract()
  ok(c.services.length === 4 && c.services.find((s) => s.name === 'vmu.members').apiVersion === 2, 'the contract lists every service with its own version')
  ok(r.status().services.find((s) => s.kind === 'tool').name === 'math_computation', 'tools are published alongside services')
}

// ---- 2. versions are checked, not trusted ------------------------------------------------------
{
  const r = mk()
  ok(r.get('vmu.library').read() === 'records', 'a service can be fetched')
  expectThrow(() => r.get('vmu.library', { minVersion: 2 }), 'VMU_NO_SUCH_OBJECT', 'requiring a newer version than published is refused')
  const e = (() => { try { r.get('vmu.library', { minVersion: 2 }) } catch (err) { return err } })()
  ok(/apiVersion 1/.test(e.message) && /2 is required/.test(e.message), 'the refusal quotes BOTH numbers', e.message)
  ok(r.get('vmu.library', { minVersion: 1 }).read() === 'records', 'requiring an equal or older version succeeds')
  const near = (() => { try { r.get('vmu.librari') } catch (err) { return err } })()
  ok(near.code === 'VMU_NO_SUCH_OBJECT' && near.hint && /did you mean/.test(near.hint),
    'an unknown name suggests near matches (via hint, which is where remedies live)', near && (near.hint || near.message))
}

// ---- 3. the alias layer bridges names and never hides -------------------------------------------
{
  const r = mk()
  const a = r.alias('vibe_v5_library', 'vmu.library', { reason: 'v5r tool name' })
  ok(a.ok === true && a.deprecated === true, 'an alias is registered and marked deprecated by default')
  const resolved = r.resolve('vibe_v5_library')
  ok(resolved.name === 'vmu.library' && resolved.viaAlias.from === 'vibe_v5_library' && resolved.viaAlias.reason === 'v5r tool name',
    'resolving through an alias reports the alias and its reason', JSON.stringify(resolved.viaAlias))
  expectThrow(() => r.alias('vmu.library', 'vmu.members'), 'VMU_MIDDLEWARE_FAILED', 'an alias that would SHADOW a published name is refused')
  expectThrow(() => r.alias('vibe_v5_missing', 'vmu.nope'), 'VMU_NO_SUCH_OBJECT', 'an alias to an unpublished target is refused')
  expectThrow(() => r.alias('vibe_v5_library', 'vmu.members'), 'VMU_MIDDLEWARE_FAILED', 'a duplicate alias is refused')
  ok(r.status().deprecatedInUse.includes('vibe_v5_library'), 'status() lists the deprecated aliases in use')
}

// ---- 4. D14: the inherited tool name stays canonical -------------------------------------------
{
  const r = mk()
  r.alias('vibe_vmu_math', 'math_computation', { reason: 'new-name alias over the inherited tool name (D14)' })
  const viaNew = r.resolve('vibe_vmu_math')
  const canonical = r.resolve('math_computation')
  ok(viaNew.name === 'math_computation' && canonical.name === 'math_computation' && canonical.viaAlias === null,
    'the inherited name is CANONICAL and the new name is only an alias (D14)', JSON.stringify({ viaNew: viaNew.name, canonical: canonical.name }))
  ok(r.get('vibe_vmu_math').toolName === 'math_computation', 'both names reach the same implementation')
}

// ---- 5. pack requirements are checked with numbers ---------------------------------------------
{
  const r = mk()
  r.alias('vibe_v5_library', 'vmu.library')
  const good = r.checkPack({ packContractVersion: 1, requires: [{ service: 'vmu.library', minVersion: 1 }, { service: 'vibe_v5_library', minVersion: 1 }] })
  ok(good.ok === true && good.satisfied.length === 2, 'a satisfied pack passes, and its alias use is recorded', JSON.stringify(good.satisfied))
  ok(good.satisfied[1].viaAlias.from === 'vibe_v5_library', 'the check reports that a legacy name was used')
  const bad = r.checkPack({ packContractVersion: 2, requires: [{ service: 'vmu.members', minVersion: 3 }, { service: 'vmu.ghost' }, { service: 7 }] })
  ok(bad.ok === false, 'an unsatisfiable pack fails')
  ok(bad.tooOld.length === 1 && bad.tooOld[0].required === 3 && bad.tooOld[0].published === 2, 'a too-old service is reported with both numbers')
  ok(bad.missing.length === 2, 'a missing service and a malformed requirement are both reported')
  ok(bad.packContractVersion.tooOld === true && bad.packContractVersion.published === 1, 'a pack newer than the published contract is flagged')
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (entries.has(from)) {\n        throw refuse('VMU_MIDDLEWARE_FAILED', 'the alias ' + from + ' would SHADOW a published name',"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the shadow refusal is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-registry-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'registry.js'), src.replace(guard, "      if (false) {\n        throw refuse('VMU_MIDDLEWARE_FAILED', 'the alias ' + from + ' would SHADOW a published name',"), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'registry.js')).href + '?probe=1')
    const mr = mm.createRegistry({ services: { 'vmu.library': { apiVersion: 1 }, 'vmu.members': { apiVersion: 1 } } })
    let refused = false
    try { mr.alias('vmu.library', 'vmu.members') } catch (e) { refused = e.code === 'VMU_MIDDLEWARE_FAILED' }
    ok(refused === true, 'self-probe: shadow refusal removed => the no-override assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU REGISTRY SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU REGISTRY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
