// vmu kernel (composition root) — the capability scenario for kernel/index.js (docs/02 §2, docs/03 §1).
//
// The first scenario is the framework's FIRST PROMISE, not a feature: a kernel assembled with no
// settings, no packs and no middleware must be INERT. So the assertions are about ABSENCE:
//   · no store, no library, no roster exist (and asking for one is refused by name, never faked);
//   · the bus subscribes to nothing; `start()` registers nothing;
//   · a disabled kernel touches no seam at all and says why it refuses.
// Then the positive side: declared middleware IS activated, seams ARE refused by name when missing, and a
// pack conflict (two claims on the same thing, or a code outside `VMU_PACK_<ID>_<REASON>`) is refused
// rather than merged (O4, R-d).
//
// `--self-probe` copies the module, makes the roster materialise even when nothing is declared, and
// requires the zero-mechanism assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { makeFakeHost } from './helpers/math-computation-fake-seam.mjs'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
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
const clock = () => '2026-10-09T00:00:00.000Z'

// ---- 1. ZERO MECHANISM: an assembly with no declarations is inert ------------------------------
{
  const k = m.createKernel({ clock })
  const st = k.status()
  ok(st.enabled === true && st.active === false, 'the kernel is enabled but NOT active until started')
  ok(k.store === null && k.library === null && k.members === null, 'nothing durable or institutional exists without a declaration')
  ok(st.bus.entries.length === 0, 'the bus subscribes to nothing', JSON.stringify(st.bus.entries))
  ok(k.tasks.status().total === 0 && k.tasks.stage().declared === false, 'the ledger is empty and no stage machine is pretended')
  const started = await k.start()
  ok(started.ok === true && started.registered.length === 0 && /registered nothing/.test(started.note),
    'starting an undeclared kernel registers nothing and says so', JSON.stringify(started))
  await expectThrow(() => k.requireStore(), 'VMU_ENGINE_UNAVAILABLE', 'a store is refused by name when no root was given (never faked in memory)')
  await expectThrow(() => k.requireLibrary(), 'VMU_ENGINE_UNAVAILABLE', 'a library is refused by name when no root was given')
  await expectThrow(() => k.requireMembers(), 'VMU_ENGINE_UNAVAILABLE', 'a roster is refused by name when no roles were declared (D5)')
  await expectThrow(() => k.math(), 'VMU_ENGINE_UNAVAILABLE', 'the math surface is refused by name when no host seam was injected')
  ok(k.activePacks().length === 0, 'no packs are active')
}

// ---- 2. disabled means inert, and it says why --------------------------------------------------
{
  const seam = makeFakeHost({ installed: ['python3'] })
  const k = m.createKernel({ clock, host: seam.host, settings: { 'vmu.core.enabled': false } })
  ok(k.enabled === false, 'the kernel reports itself disabled')
  const st = k.status()
  ok(st.active === false && st.note && /disabled by/.test(st.note), 'the disabled status explains itself')
  const started = await k.start()
  ok(started.ok === true && started.enabled === false && started.registered.length === 0, 'starting a disabled kernel does nothing')
  ok(seam.registrations.length === 0, 'a disabled kernel never touches the host seam', seam.registrations.length)
  await expectThrow(() => k.refuses(), 'VMU_STATE', 'a disabled kernel refuses service requests by name')
}

// ---- 3. declared middleware is activated; nothing else is --------------------------------------
{
  const rule = { id: 'pack-gate', kind: 'rules', on: ['tools/pre-execute'], when: { not: { tool: ['math_computation'] } }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'only the math tool here' } }] }
  const k = m.createKernel({ clock, settings: { 'vmu.middleware.entries': [rule] } })
  const started = await k.start()
  ok(started.registered.join(',') === 'pack-gate', 'the declared middleware is the only thing registered', started.registered.join(','))
  const refused = await k.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_ballot' }, {})
  ok(refused.ok === false && refused.refused.code === 'VMU_NOT_PERMITTED', 'the registered rule denies through the assembled bus')
  const allowed = await k.bus.emit('tools/pre-execute', { tool: 'math_computation' }, {})
  ok(allowed.ok === true, 'and lets the declared tool through')
}

// ---- 4. seams: present when injected, named when missing ---------------------------------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-kernel-'))
  const k = m.createKernel({ clock, root, slots: [{ id: 'chair', capacity: 1 }], settings: { 'vmu.records.tracks': ['progress'] } })
  ok(k.store !== null && k.library !== null && k.members !== null, 'with a root and declared slots the durable and institutional layers exist')
  const kst = k.requireStore().stats()
  ok(typeof kst === 'object' && typeof kst.open === 'boolean' && String(kst.file).startsWith(root),
    'the store reports its own status and its file lives under the given root', JSON.stringify(kst))
  const roles = k.requireMembers().roles()
  ok(roles.length === 1 && roles[0].id === 'chair', 'the declared slot is the only role surface (no kernel-provided roles)')
  const rec = await k.requireLibrary().append({ kind: 'proposition', statement: 'P', proof: 'because' }, {})
  ok(rec.ok === true && rec.fingerprint, 'the assembled library records a proposition with content identity')
  const seam = makeFakeHost({ installed: ['python3'] })
  const k2 = m.createKernel({ clock, host: seam.host })
  const math = k2.math()
  ok(math.toolName === 'math_computation' && k2.registry.resolve('math_computation').viaAlias === null,
    'the math tool is published under its inherited canonical name (D14)')
  const contract = k2.registry.contract()
  ok(contract.services.some((s) => s.name === 'vmu.tasks') && contract.services.some((s) => s.name === 'vmu.prompt'),
    'the assembly publishes the services it actually offers', contract.services.map((s) => s.name).join(','))
  ok(k2.registry.checkPack({ requires: [{ service: 'vmu.tasks', minVersion: 1 }] }).ok === true, 'a pack requiring a published service passes the check')
  ok(k2.registry.checkPack({ requires: [{ service: 'vmu.store', minVersion: 1 }] }).ok === false,
    'a pack requiring a service this assembly does NOT have (no root) fails the check')
  await rm(root, { recursive: true, force: true })
}

// ---- 5. packs: conflicts are refused, and codes follow the R-d rule ----------------------------
{
  const k = m.createKernel({ clock, settings: { 'vmu.records.tracks': ['progress'] } })
  expectThrow(() => k.usePack({}), 'VMU_INVALID_ARGUMENT', 'a pack without an id is refused')
  const good = k.usePack({ id: 'institute-x', codes: ['VMU_PACK_INSTITUTE_X_NO_QUORUM'], aliases: [{ from: 'vibe_v5_task_board', to: 'vmu.tasks' }] })
  ok(good.ok === true && good.active.join(',') === 'institute-x', 'a clean pack activates')
  ok(k.registry.resolve('vibe_v5_task_board').name === 'vmu.tasks', 'the pack alias resolves to the published service')
  expectThrow(() => k.usePack({ id: 'bad-alias', aliases: [{ from: 'vibe_v5_members', to: 'vmu.members' }] }), 'VMU_NO_SUCH_OBJECT',
    'an alias to a service this assembly does not publish is refused by name (nothing is faked)')
  expectThrow(() => k.usePack({ id: 'institute-x' }), 'VMU_PACK_CONFLICT', 'applying the same pack twice is refused (O4)')
  // The pack code namespace rule (R-d): the alias target must exist for the alias half to be checked too.
  const k2 = m.createKernel({ clock })
  expectThrow(() => k2.usePack({ id: 'rogue', codes: ['VMU_INVALID_ARGUMENT'] }), 'VMU_PACK_CONFLICT',
    'a pack claiming a framework code is refused: pack codes must be VMU_PACK_<ID>_<REASON>')
  const k3 = m.createKernel({ clock, settings: { 'vmu.records.tracks': ['progress'] } })
  expectThrow(() => k3.usePack({ id: 'clash', settings: { 'vmu.records.tracks': ['other'] } }), 'VMU_PACK_CONFLICT',
    'a pack that would overwrite an active setting is refused unless overrides are declared (O4)')
  const k4 = m.createKernel({ clock, settings: { 'vmu.records.tracks': ['progress'], 'vmu.packs.allowOverride': true } })
  ok(k4.usePack({ id: 'clash', settings: { 'vmu.records.tracks': ['other'] } }).ok === true,
    'with vmu.packs.allowOverride the same clash is accepted as an EXPLICIT override (O4)')
}

// ---- 6. status() composes every part -----------------------------------------------------------
{
  const k = m.createKernel({ clock, root: await mkdtemp(join(tmpdir(), 'vmu-kernel2-')) })
  const st = k.status()
  for (const part of ['bus', 'prompt', 'tasks', 'rules', 'loader', 'bridge', 'registry', 'seams', 'packs']) {
    ok(st[part] !== undefined && st[part] !== null, 'status() reports the ' + part + ' part')
  }
  ok(st.seams.host === false && st.seams.store === true, 'status() names which seams are present')
  ok(/inert by construction/.test(st.note), 'status() restates the zero-mechanism promise')
}

// ---- 7. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "    if (declaredSlots.length === 0 && cap === 0) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the zero-mechanism guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-kernel-mut-'))
    await mkdir(join(dir, 'kernel', 'prompt'), { recursive: true })
    // The copy must MIRROR the real import graph: kernel/*.js, kernel/prompt/index.js, settings/schema.js
    // (the kernel reads SETTING_DEFS/assertDeclared from it) and the shared math modules one level up.
    // A missing module here used to fail the probe with ERR_MODULE_NOT_FOUND instead of an anchor miss.
    await mkdir(join(dir, 'settings'), { recursive: true })
    for (const f of ['bus.js', 'store.js', 'library.js', 'members.js', 'ballot.js', 'meeting.js', 'tasks.js', 'math.js', 'rules.js', 'loader.js', 'script-bridge.js', 'registry.js', 'pack.js']) {
      await writeFile(join(dir, 'kernel', f), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'settings', 'schema.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js'), 'utf8'), 'utf8')
    // kernel/math.js imports '../math-computation.js', so the shared modules live one level ABOVE kernel/.
    for (const f of ['math-computation.js', 'math-engines.js']) {
      await writeFile(join(dir, f), await readFile(resolve(REPO, 'vibe-math-vmu', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'prompt', 'index.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'kernel', 'index.js'), src.replace(guard, '    if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'index.js')).href + '?probe=1')
    const mk = mm.createKernel({ clock })
    const inert = mk.members === null
    // With the guard removed a roster materialises with nothing declared: the assertion MUST fail.
    ok(inert === true, 'self-probe: guard removed => the zero-mechanism assertion fails (as required)', 'members=' + (mk.members === null ? 'null' : 'created'))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU KERNEL SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

// ---- B1: settings.resolved and auditTail exist, and the source is tracked honestly -----------------
{
  const clock = () => '2026-10-09T00:00:00.000Z'
  const k = m.createKernel({ clock, settings: { 'vmu.limits.maxLiveMembers': 4 } })
  const st = k.status()
  const res = st.settings.resolved
  ok(res && typeof res === 'object', 'status().settings.resolved exists (the manual promise, docs/04 §6)')
  ok(res['vmu.limits.maxLiveMembers'] && res['vmu.limits.maxLiveMembers'].source === 'config',
    'a value the config set reports source "config"', JSON.stringify(res['vmu.limits.maxLiveMembers']))
  ok(res['vmu.limits.maxToolCalls'] === undefined, 'resolved covers DECLARED keys only')
  ok(res['vmu.limits.wallClockMs'] && res['vmu.limits.wallClockMs'].source === 'default',
    'a key nobody set reports source "default" (the schema default applies)', JSON.stringify(res['vmu.limits.wallClockMs']))
  ok(res['vmu.limits.wallClockMs'].hot === 'H0' && typeof res['vmu.limits.wallClockMs'].who === 'string',
    'each entry carries its declared hot class and who-may-change')
  k.setSettingsValue('vmu.limits.wallClockMs', 600000)
  const after = k.status().settings.resolved['vmu.limits.wallClockMs']
  ok(after.source === 'runtime' && after.value === 600000,
    'a runtime write is reported as source "runtime" (not silently attributed to config)', JSON.stringify(after))
  ok(Array.isArray(k.status().auditTail), 'status().auditTail is an array (no log file needed to audit)')
  const before = k.status().auditTail.length
  k.bus.setDryRun(true)   // every bus state change is audited, so the tail must grow
  ok(k.status().auditTail.length > before, 'bus actions append to the audit tail (auditing is observable)')
}

// ---- V7: control flow is a GATE, and the heartbeat has a budget -------------------------------------
{
  const fails = async (fn, code, name) => {
    try { await fn(); ok(false, name, 'did not throw') } catch (e) { ok(e && e.code === code, name, e && e.code) }
  }
  const k = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', settings: { 'vmu.limits.wallClockMs': 60000 } })
  ok(k.control().state === 'running' && k.control().beats === 0, 'a fresh kernel is running, with no beats')
  const t = await k.tasks.create({ title: 'work' })
  ok(t.id && k.tasks.list().length === 1, 'work is accepted while running')
  const paused = await k.pause('freeze')
  ok(paused.ok === true && k.control().state === 'paused' && k.control().pausedReason === 'freeze',
    'pause records WHY it was taken (a label would not)', JSON.stringify(paused))
  await fails(() => k.tasks.create({ title: 'more' }), 'VMU_STATE', 'a paused kernel refuses NEW work by name')
  await fails(() => k.tasks.transition(t.id, 'doing'), 'VMU_STATE', 'and it refuses transitions too')
  const resumed = await k.resume('thaw')
  ok(resumed.ok === true && k.control().state === 'running' && resumed.resumedFrom === 'freeze',
    'resume restores the running state and reports what it resumed from', JSON.stringify(resumed))
  await k.tasks.transition(t.id, 'doing')
  ok(k.tasks.list()[0].state === 'doing', 'work flows again after resume')
  await k.beat('alive')
  ok(k.control().beats === 1 && k.control().lastBeatAt === '2026-10-09T00:00:00.000Z', 'the heartbeat is recorded')
  ok(k.status().control && k.status().control.state === 'running', 'status() exposes the control surface')
  const stopped = await k.stop('done')
  ok(stopped.state === 'stopped' && k.control().stops === 1, 'stop is part of the same state machine')
  await fails(() => k.pause('again'), 'VMU_STATE', 'a stopped kernel cannot be paused')

  // The staleness budget is a real consumer of vmu.limits.wallClockMs.
  let nowMs = Date.parse('2026-10-09T00:00:00.000Z')
  const k2 = m.createKernel({ clock: () => new Date(nowMs).toISOString(), settings: { 'vmu.limits.wallClockMs': 1000 } })
  await k2.beat()
  ok(k2.control().stale === false, 'a fresh heartbeat is not stale')
  nowMs += 5000
  ok(k2.control().stale === true && k2.control().sinceLastBeatMs === 5000,
    'a heartbeat older than the declared budget is reported STALE (wallClockMs now has a consumer)',
    JSON.stringify(k2.control()).slice(0, 140))
}

console.log('=== VMU KERNEL: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
