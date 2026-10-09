// vmu loader — the capability scenario for kernel/loader.js (docs/05 §6.1, §9).
//
// M2 is the escape hatch for logic a declarative rule cannot express, so the scenarios are the BOUNDS:
//   · meta.apiVersion and capabilities are mandatory and validated (a wrong or newer apiVersion is
//     refused with both numbers);
//   · a hook name that is not registered is refused AT LOAD TIME - a typo must fail loudly instead of
//     subscribing to a hook that never fires;
//   · the module receives a FROZEN api facade whose keys are exactly the documented ones: whatever is not
//     handed over cannot be relied upon;
//   · a module (or its factory) that throws during load is refused by name and the framework survives;
//   · a loaded module runs through the SAME bus as M1, so ordering, capabilities, failure policies,
//     breakers and traces are shared;
//   · dry-run reaches the module as `api.dryRun`, and the loader is honest that M2 dry-run cannot be
//     PROVEN side-effect free (unlike M1, whose rules are data).
//
// `--self-probe` copies the module, REMOVES the unregistered-hook check and requires the typo assertion
// to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'loader.js')
const BUS = resolve(REPO, 'vibe-math-vmu', 'kernel', 'bus.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const busMod = await import(pathToFileURL(BUS).href)

const goodModule = {
  meta: { id: 'meeting-policy', apiVersion: 1 },
  capabilities: ['deny', 'read-args'],
  hooks: {
    'meeting/round-start': async (ev) => (ev.roster && ev.roster.length >= 2 ? undefined : { deny: { code: 'VMU_MEETING_TOO_SMALL', message: 'too few' } }),
  },
}
const mk = (opts = {}) => m.createLoader(Object.assign({
  services: { setting: (k) => (k === 'vmu.limits.maxLiveMembers' ? 6 : undefined), kernel: { read: () => 'state' } },
  log: () => {}, clock: () => '2026-10-09T00:00:00.000Z',
}, opts))

// ---- 1. a valid module loads, and the record is honest -----------------------------------------
{
  const loader = mk()
  const rec = await loader.load({ id: 'meeting-policy', kind: 'module', module: goodModule })
  ok(rec.id === 'meeting-policy' && rec.apiVersion === 1, 'the load record carries the declared api version')
  ok(rec.hooks.join(',') === 'meeting/round-start' && rec.capabilities.includes('deny'), 'the record lists the hooks and capabilities')
  ok(loader.get('meeting-policy').at === '2026-10-09T00:00:00.000Z', 'the load is timestamped by the injected clock')
  await expectThrow(() => Promise.resolve(loader.get('nope')), 'VMU_NO_SUCH_OBJECT', 'an unknown loaded id is refused by name')
  await expectThrow(() => loader.load({ id: 'x', kind: 'rules' }), 'VMU_MIDDLEWARE_FAILED', 'the loader refuses a non-module entry')
}

// ---- 2. mandatory declarations are mandatory ---------------------------------------------------
{
  const loader = mk()
  const noMeta = { capabilities: ['deny'], hooks: { 'meeting/round-start': async () => undefined } }
  await expectThrow(() => loader.load({ id: 'a', kind: 'module', module: noMeta }), 'VMU_MIDDLEWARE_FAILED', 'a module without meta is refused')
  const noVersion = { meta: { id: 'a' }, capabilities: ['deny'], hooks: { 'meeting/round-start': async () => undefined } }
  await expectThrow(() => loader.load({ id: 'a', kind: 'module', module: noVersion }), 'VMU_MIDDLEWARE_FAILED', 'a module without an api version is refused')
  const newer = { meta: { id: 'a', apiVersion: m.FRAMEWORK_API_VERSION + 1 }, capabilities: ['deny'], hooks: { 'meeting/round-start': async () => undefined } }
  const e = await loader.load({ id: 'a', kind: 'module', module: newer }).catch((err) => err)
  ok(e && /newer than this framework/.test(e.message) && e.message.includes(String(m.FRAMEWORK_API_VERSION)),
    'a module newer than the framework is refused WITH both numbers', e && e.message)
  const noCaps = { meta: { id: 'a', apiVersion: 1 }, hooks: { 'meeting/round-start': async () => undefined } }
  await expectThrow(() => loader.load({ id: 'a', kind: 'module', module: noCaps }), 'VMU_MIDDLEWARE_FAILED', 'a module without capabilities is refused')
  const badCap = { meta: { id: 'a', apiVersion: 1 }, capabilities: ['time-travel'], hooks: { 'meeting/round-start': async () => undefined } }
  await expectThrow(() => loader.load({ id: 'a', kind: 'module', module: badCap }), 'VMU_MIDDLEWARE_FAILED', 'an unknown capability is refused')
  const undeclared = { meta: { id: 'a', apiVersion: 1 }, capabilities: ['deny'], hooks: { 'meeting/round-start': async () => undefined } }
  await expectThrow(() => loader.load({ id: 'a', kind: 'module', module: undeclared, capabilities: ['annotate'] }),
    'VMU_MIDDLEWARE_FAILED', 'a capability the ENTRY did not declare is refused')
}

// ---- 3. hook names are checked at load time (typo protection) ----------------------------------
{
  const loader = mk()
  const typo = { meta: { id: 'a', apiVersion: 1 }, capabilities: ['deny'], hooks: { 'meeting/round-strat': async () => undefined } }
  const e = await loader.load({ id: 'a', kind: 'module', module: typo }).catch((err) => err)
  ok(e && /unregistered hook/.test(e.message), 'a misspelled hook is refused at load time, not silently ignored', e && e.message)
  ok(m.isRegisteredHook('meeting/round-start') && m.isRegisteredHook('tools/pre-execute') && m.isRegisteredHook('workflow/start'),
    'vmu hooks, host substrate hooks and workflow/* are all recognised')
  ok(!m.isRegisteredHook('meeting/round-strat') && !m.isRegisteredHook(''), 'a typo and an empty name are not')
  const hostHook = { meta: { id: 'b', apiVersion: 1 }, capabilities: ['annotate'], hooks: { 'tools/post-execute': async () => undefined } }
  ok((await loader.load({ id: 'b', kind: 'module', module: hostHook })).hooks[0] === 'tools/post-execute', 'a documented host hook is accepted')
}

// ---- 4. failure isolation starts at load time --------------------------------------------------
{
  const loader = mk()
  const throwingFactory = { meta: { id: 'c', apiVersion: 1 }, capabilities: ['deny'], hooks: {}, default: () => { throw new Error('boom at factory') } }
  // `hooks: {}` is itself invalid; use a real hook so the factory path is what fails.
  const factory = { meta: { id: 'c', apiVersion: 1 }, capabilities: ['deny'], hooks: { 'meeting/round-start': async () => undefined }, default: () => { throw new Error('boom at factory') } }
  const e1 = await loader.load({ id: 'c', kind: 'module', module: factory }).catch((err) => err)
  ok(e1 && e1.code === 'VMU_MIDDLEWARE_FAILED' && /factory/.test(e1.message), 'a throwing factory is refused by name', e1 && e1.message)
  const noSource = mk()
  await expectThrow(() => noSource.load({ id: 'd', kind: 'module' }), 'VMU_ENGINE_UNAVAILABLE', 'a module with no source and no importer is refused by name')
  ok(loader.status().stats.refusals >= 1, 'refusals are counted in status()')
}

// ---- 5. the api facade is frozen and minimal ---------------------------------------------------
{
  const loader = mk()
  let seen = null
  const probe = { meta: { id: 'probe', apiVersion: 1 }, capabilities: ['annotate'],
    hooks: { 'meeting/round-start': async (ev) => { seen = ev.api; return undefined } } }
  await loader.load({ id: 'probe', kind: 'module', module: probe })
  const api = seen || {}
  const rec = loader.get('probe')
  await rec.handlers['meeting/round-start']({ hook: 'meeting/round-start' })
  ok(seen && Object.isFrozen(seen), 'the api facade handed to a module is frozen')
  ok(seen && JSON.stringify(Object.keys(seen).sort()) === JSON.stringify([...m.API_KEYS].sort()),
    'the facade carries exactly the documented keys', seen && Object.keys(seen).join(','))
  ok(seen && seen.setting('vmu.limits.maxLiveMembers') === 6, 'the facade exposes the read-only setting accessor')
  ok(seen && typeof seen.kernel.read === 'function' && seen.kernel.read() === 'state', 'the facade exposes the kernel services it was given')
  ok(loader.apiKeys().join(',') === m.API_KEYS.join(','), 'the loader documents its api surface')
}

// ---- 6. dry-run reaches the module, and the caveat is stated -----------------------------------
{
  const loader = mk({ dryRun: true })
  let sawDry = null
  const probe = { meta: { id: 'dry', apiVersion: 1 }, capabilities: ['annotate'],
    hooks: { 'meeting/round-start': async (ev) => { sawDry = ev.api.dryRun; return undefined } } }
  const rec = await loader.load({ id: 'dry', kind: 'module', module: probe })
  await rec.handlers['meeting/round-start']({ hook: 'meeting/round-start' })
  ok(sawDry === true, 'a module sees api.dryRun and can honour it')
  ok(loader.status().dryRun === true && /cannot be PROVEN/.test(loader.status().note),
    'the loader states the honest M2 dry-run limitation instead of claiming a proof')
}

// ---- 7. a loaded module runs through the SAME bus as M1 ----------------------------------------
{
  const loader = mk()
  const bus = busMod.createBus()
  const entries = await loader.toBusEntries([{ id: 'meeting-policy', kind: 'module', module: goodModule, order: 100 }])
  for (const e of entries) bus.add(e)
  const refused = await bus.emit('meeting/round-start', { roster: ['r-1'] }, {})
  ok(refused.ok === false && refused.refused.code === 'VMU_MEETING_TOO_SMALL', 'an M2 module denies through the shared bus')
  const allowed = await bus.emit('meeting/round-start', { roster: ['r-1', 'r-2'] }, {})
  ok(allowed.ok === true, 'and lets the round start when its condition holds')
  ok(bus.status().entries[0].id.indexOf('meeting-policy::') === 0, 'the bus entry id names the module and the hook')
}

// ---- 8. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (!isRegisteredHook(h)) problems.push('unregistered hook: ' + h + ' (see docs/05 §4; a typo would silently never fire)')"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the hook-registry check is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-loader-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'bus.js'), await readFile(BUS, 'utf8'), 'utf8')
    await writeFile(join(dir, 'kernel', 'loader.js'), src.replace(guard, "      if (false) problems.push('unregistered hook: ' + h)"), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'loader.js')).href + '?probe=1')
    const ml = mm.createLoader()
    const typo = { meta: { id: 'a', apiVersion: 1 }, capabilities: ['deny'], hooks: { 'meeting/round-strat': async () => undefined } }
    let refused = false
    try { await ml.load({ id: 'a', kind: 'module', module: typo }) } catch (e) { refused = /unregistered hook/.test(e.message) }
    ok(refused === true, 'self-probe: check removed => the typo assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU LOADER SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU LOADER: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
