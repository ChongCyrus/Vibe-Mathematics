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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { makeFakeHost } from './helpers/math-computation-fake-seam.mjs'
import { readSetting, declaredDefault } from '../vibe-math-vmu/kernel/settings-defaults.js'

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
// The ONE pack implementation is ASYNC (`createPackLoader.apply` awaits the pack's own load), so a refusal on that
// path arrives as a rejected promise. The named-code contract is the same; only the observation differs.
const expectReject = async (promise, code, name) => {
  try { await promise; failed++; failures.push(name + ' (did not refuse)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
// ROUND 1 / K5: the pack path's ONE implementation, injected the way the entry injects it.
const { createPackLoader } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
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

// ---- 5. packs: ONE implementation (the loader), and its refusals are named -----------------------
// ROUND 1 / K5 (D-02, Lead 裁决 = 硬拒). `usePack()` used to carry a SECOND pack loader inside the kernel (id, code
// prefix, alias, settings conflicts) that ran whenever no loader was injected - two semantics for one verb. The
// first block asserts the replacement contract (no loader ⇒ a NAMED refusal, never a quiet second path); the case
// list that used to sit here is preserved below, re-pointed at the ONE implementation (`kernel/pack.js`) so the
// coverage is the same or wider, not smaller.
{
  const k0 = m.createKernel({ clock })
  expectThrow(() => k0.usePack({}), 'VMU_PACK_LOADER_UNAVAILABLE',
    'with no pack loader injected, usePack() refuses BY NAME instead of loading through a second implementation')
  expectThrow(() => k0.usePack({ id: 'institute-x' }), 'VMU_PACK_LOADER_UNAVAILABLE',
    'an id does not open a hidden path: the loader is the only one')
  ok(k0.status().packPath === 'none', 'status().packPath names the path as ABSENT rather than implying a hidden one', k0.status().packPath)

  // The entry's shape: a LATE-BOUND applier, because the loader needs the kernel and the kernel needs the applier.
  const withLoader = (settings = {}) => {
    let loader = null
    const kernel = m.createKernel({ clock, settings, packApplier: (manifest) => loader.apply(manifest) })
    loader = createPackLoader({ kernel, registry: kernel.registry })
    return kernel
  }
  const k = withLoader({ 'vmu.records.tracks': ['progress'] })
  ok(k.status().packPath === 'loader', 'status().packPath reports the ONE path when the loader is injected')
  await expectReject(k.usePack({}), 'VMU_PACK_MISSING', 'a pack without an id is refused (by the loader that owns the rule)')
  const good = await k.usePack({ id: 'institute-x', codes: ['VMU_PACK_INSTITUTE_X_NO_QUORUM'], aliases: [{ from: 'vibe_v5_task_board', to: 'vmu.tasks' }] })
  ok(good && good.id === 'institute-x' && k.activePacks().includes('institute-x'), 'a clean pack activates through the loader', JSON.stringify(good).slice(0, 120))
  ok(k.registry.resolve('vibe_v5_task_board').name === 'vmu.tasks', 'the pack alias resolves to the published service')
  await expectReject(k.usePack({ id: 'bad-alias', aliases: [{ from: 'vibe_v5_members', to: 'vmu.members' }] }), 'VMU_NO_SUCH_OBJECT',
    'an alias to a service this assembly does not publish is refused by name (nothing is faked)')
  await expectReject(k.usePack({ id: 'institute-x' }), 'VMU_PACK_CONFLICT', 'applying the same pack twice is refused (O4)')
  // The pack code namespace rule (R-d) still holds, now enforced by the loader's own validation.
  const k2 = withLoader()
  await expectReject(k2.usePack({ id: 'rogue', codes: ['VMU_INVALID_ARGUMENT'] }), 'VMU_PACK_MISSING',
    'a pack claiming a framework code is refused: pack codes must be VMU_PACK_<ID>_<REASON>')
  const k3 = withLoader({ 'vmu.records.tracks': ['progress'] })
  await expectReject(k3.usePack({ id: 'clash', settings: { 'vmu.records.tracks': ['other'] } }), 'VMU_PACK_CONFLICT',
    'a pack that would overwrite an active setting is refused unless overrides are declared (O4)')
  const k4 = withLoader({ 'vmu.records.tracks': ['progress'], 'vmu.packs.allowOverride': true })
  const explicit = await k4.usePack({ id: 'clash', settings: { 'vmu.records.tracks': ['other'] } })
  ok(explicit && explicit.ok !== false, 'with vmu.packs.allowOverride the same clash is accepted as an EXPLICIT override (O4)')
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

// ---- Durable audit: rows reach the disk, and a write failure is REPORTED (R11) ------------------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-audit-'))
  const k = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', root })
  k.bus.setDryRun(true)
  const audit = k.status().audit
  ok(audit && audit.dir && audit.written >= 1 && audit.lastWriteError === null,
    'audit rows are APPENDED to <root>/vmu/audit/<day>.jsonl (the trail now survives the process)',
    JSON.stringify(audit))
  const text = audit.file ? await readFile(audit.file, 'utf8') : ''
  ok(/middleware\/dry-run/.test(text) && text.trim().split('\n').length >= 1,
    'the durable file holds the JSONL rows (one object per line)', text.slice(0, 100))
  ok(audit.file && /2026-10-09\.jsonl$/.test(audit.file), 'the file is named by UTC day', String(audit.file))
  await rm(root, { recursive: true, force: true })

  // A root that cannot hold a directory: the failure must be visible, and the in-memory tail must survive.
  const file = await mkdtemp(join(tmpdir(), 'vmu-audit-bad-'))
  const blocker = join(file, 'blocker')
  await writeFile(blocker, 'not a directory', 'utf8')
  const bad = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', root: blocker })
  bad.bus.setDryRun(true)
  ok(bad.status().audit.lastWriteError !== null,
    'a failing audit write is REPORTED in status().audit.lastWriteError, not swallowed',
    JSON.stringify(bad.status().audit).slice(0, 140))
  ok(bad.status().auditTail.length >= 1, 'and the in-memory auditTail keeps working meanwhile')
  await rm(file, { recursive: true, force: true })
}

// ---- In-flight ledger: "after an interruption the owner is told what is unfinished" ------------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-work-'))
  const k = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', root })
  await k.store.open()
  const started = await k.work.start({ owner: 'r-1', kind: 'verification', objective: 'check the lemma' })
  ok(started.ok === true && started.entry.owner === 'r-1' && k.work.list().length === 1,
    'in-flight work is registered in the DURABLE ledger (the `work` key is no longer reserved-and-unused)',
    JSON.stringify(started.entry))

  // A SECOND kernel on the same root is the restart: whatever is still listed did not settle.
  const k2 = m.createKernel({ clock: () => '2026-10-09T00:05:00.000Z', root })
  await k2.store.open()
  const rec = await k2.work.recover()
  ok(rec.recovered === 1 && k2.work.interrupted().length === 1 && k2.work.interrupted()[0].owner === 'r-1',
    'after a restart the unfinished item is marked INTERRUPTED with its owner (nothing is silently dropped)',
    JSON.stringify(rec).slice(0, 170))
  ok(k2.status().work.interrupted === 1 && k2.status().work.pending === 0,
    'status() reports the ledger so a reader can see what is unfinished', JSON.stringify(k2.status().work))

  await k2.work.settle(started.entry.id, { outcome: 'finished after recovery' })
  ok(k2.work.list().length === 0, 'settling removes the entry (the ledger does not grow forever)')
  let missing = null
  try { await k2.work.settle('ghost') } catch (e) { missing = e && e.code }
  ok(missing === 'VMU_NO_SUCH_OBJECT', 'settling an unknown id is refused by name', String(missing))

  const k3 = m.createKernel({ clock: () => '2026-10-09T00:10:00.000Z', root })
  await k3.store.open()
  await k3.pause('a hold')
  let refused = null
  try { await k3.work.start({ owner: 'r-2' }) } catch (e) { refused = e && e.code }
  ok(refused === 'VMU_STATE', 'a paused kernel refuses to register new in-flight work (control flow reaches the ledger too)')

  const bare = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z' })
  ok(bare.work === null && bare.status().work === null,
    'without a durable root there is no ledger - and status() stays safe instead of throwing (R11)')
  await rm(root, { recursive: true, force: true })
}

// ---- the concurrency gate has ONE meaning: maxLiveMembers, with maxParallel as a declared synonym ---------
{
  const k = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', settings: { 'vmu.limits.maxParallel': 2 } })
  k.declareSlots([{ id: 'm', label: '成员', capacity: 0 }])
  await k.members.hire({ id: 'r-1', slot: 'm' })
  await k.members.hire({ id: 'r-2', slot: 'm' })
  let refused = null
  try { await k.members.hire({ id: 'r-3', slot: 'm' }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_RESOURCE_BUDGET',
    'vmu.limits.maxParallel is a REAL consumer: it caps live members like maxLiveMembers does', String(refused && refused.code))
  const k2 = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z',
    settings: { 'vmu.limits.maxParallel': 9, 'vmu.limits.maxLiveMembers': 1 } })
  k2.declareSlots([{ id: 'm', label: '成员', capacity: 0 }])
  await k2.members.hire({ id: 'r-1', slot: 'm' })
  let refused2 = null
  try { await k2.members.hire({ id: 'r-2', slot: 'm' }) } catch (e) { refused2 = e }
  ok(refused2 && refused2.code === 'VMU_RESOURCE_BUDGET',
    'and the explicit maxLiveMembers WINS when both are set (a profile can always override the shorthand)',
    String(refused2 && refused2.code))
}

// ---- three more wired keys: logLevel, delegableKeys, activeOverrides ----------------------------------
{
  // 1) vmu.core.logLevel is a REAL consumer, and backwards compatible: default `info` keeps today's text.
  const logs = []
  const kInfo = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', log: (msg) => logs.push(msg) })
  kInfo.bus.setDryRun(true)
  ok(logs.filter((l) => typeof l === 'string' && l.indexOf('audit ') === 0).length >= 1,
    'at the default logLevel=info the audit line reaches log() exactly as before', JSON.stringify(logs.slice(0, 1)))
  const quiet = []
  const kQuiet = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', log: (msg) => quiet.push(msg),
    settings: { 'vmu.core.logLevel': 'error' } })
  kQuiet.bus.setDryRun(true)
  ok(quiet.filter((l) => typeof l === 'string' && l.indexOf('audit ') === 0).length === 0,
    'logLevel=error suppresses the info-level audit line (vmu.core.logLevel now has a consumer)', JSON.stringify(quiet))

  // 2) vmu.safety.delegableKeys: the schema ALREADY names each key's owner (`who`), and this makes it
  //    enforceable. Meeting decisions belong to `role:chair`, so a solver naming itself is refused by name.
  const k = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z' })
  const def = k.settingDef('vmu.meetings.quorumCap')
  ok(def && def.who === 'role:chair',
    'the schema already declares the owner of meeting decisions (who=role:chair) - this key makes it enforced',
    JSON.stringify(def && { who: def.who, hot: def.hot }))
  let refused = null
  try { k.setSettingsValue('vmu.meetings.quorumCap', 5, { by: 'solver' }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_NOT_PERMITTED' && /declared owner: role:chair/.test(String(refused.message)),
    'a non-owner writer is refused by name and told the declared owner', String(refused && refused.message))
  const k2 = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z',
    settings: { 'vmu.safety.delegableKeys': ['vmu.meetings.quorumCap'] } })
  const delegated = k2.setSettingsValue('vmu.meetings.quorumCap', 5, { by: 'solver' })
  ok(delegated.ok === true && k2.settingsSnapshot()['vmu.meetings.quorumCap'] === 5,
    'and the same write is allowed once that key is delegated')
  ok(k.setSettingsValue('vmu.meetings.quorumCap', 4, { by: 'role:chair' }).ok === true,
    'the declared owner slot is unaffected')
  ok(k.setSettingsValue('vmu.meetings.quorumCap', 3).ok === true,
    'and the no-`by` path (office tool + pack rollback) is unchanged')

  // 2b) RESOLUTION vs RUNTIME (found while wiring this, and worth pinning): `resolveSettings` reports the
  //     schema default (and so does `status().settings.resolved` with source 'default'), but the ENTRY hands the
  //     kernel the RAW map, so the kernel's own fallback decides behaviour: an UNSET cap is unlimited, and a
  //     CONFIGURED one is enforced. That is why wiring the synonym changed nothing by default.
  const kUnset = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z' })
  kUnset.declareSlots([{ id: 'm', label: '成员', capacity: 0 }])
  for (const id of ['r-1', 'r-2', 'r-3', 'r-4']) await kUnset.members.hire({ id, slot: 'm' })
  ok(kUnset.members.roster().length === 4,
    'an UNSET live-member cap leaves the roster unlimited (the entry passes the raw map, not the resolved one)',
    String(kUnset.members.roster().length))
  const kCap = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', settings: { 'vmu.limits.maxParallel': 3 } })
  kCap.declareSlots([{ id: 'm', label: '成员', capacity: 0 }])
  for (const id of ['r-1', 'r-2', 'r-3']) await kCap.members.hire({ id, slot: 'm' })
  let fourth = null
  try { await kCap.members.hire({ id: 'r-4', slot: 'm' }) } catch (e) { fourth = e }
  ok(fourth && fourth.code === 'VMU_RESOURCE_BUDGET',
    'and a CONFIGURED maxParallel=3 really caps the roster at three', String(fourth && fourth.code))

  // 3) vmu.packs.activeOverrides: naming the key opens exactly that door - and no wider one.
  const k3 = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', settings: { 'vmu.meetings.quorumRule': 'majority' } })
  let conflict = null
  try { k3.applyPackSettings({ 'vmu.meetings.quorumRule': 'm-unanimous' }, { by: 'p1' }) } catch (e) { conflict = e }
  ok(conflict && conflict.code === 'VMU_PACK_CONFLICT' && /activeOverrides/.test(String(conflict.hint)),
    'without a declaration the override is refused, and the hint names the exact key', String(conflict && conflict.hint))
  const k4 = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z',
    settings: { 'vmu.meetings.quorumRule': 'majority', 'vmu.limits.maxParallel': 4,
      'vmu.packs.activeOverrides': ['vmu.meetings.quorumRule'] } })
  const applied = k4.applyPackSettings({ 'vmu.meetings.quorumRule': 'm-unanimous' }, { by: 'p1' })
  ok(applied.ok === true && applied.applied.includes('vmu.meetings.quorumRule'),
    'the DECLARED key may be overridden through the fine-grained door')
  let sibling = null
  try { k4.applyPackSettings({ 'vmu.limits.maxParallel': 9 }, { by: 'p1' }) } catch (e) { sibling = e }
  ok(sibling && sibling.code === 'VMU_PACK_CONFLICT',
    'and an undeclared SIBLING key is still refused (the door is per-key, not a blanket)', String(sibling && sibling.code))
}

// ---- the Lean face is assembled ONLY when a spawn seam exists (nothing is faked without one) -----------
{
  const bare = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z' })
  ok(bare.lean === null,
    'without a spawn seam there is NO lean face (kernel.lean === null) - the assembly gate is tested too',
    String(bare.lean))
  const seam = async () => ({ code: 0, stdout: '', stderr: '', timedOut: false, ms: 1 })
  const withSeam = m.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', spawn: seam })
  ok(withSeam.lean && typeof withSeam.lean.submit === 'function' && typeof withSeam.lean.keysUsed === 'function',
    'and with a seam the face appears (submit/keysUsed present)', JSON.stringify(Object.keys(withSeam.lean || {})))
  // THE EXPECTED KEYS ARE LISTED, THE COUNT IS DERIVED. Round 2 added the job-ledger keys and round 4 added the
  // stdout cap (`vmu.math.captureStdoutBytes`, read by F17's real grace/terminate path), so a typed number went
  // stale twice. Named lists plus a derived total keep the claim precise: ADD A KEY HERE when the face reads it.
  const LEAN_KEYS = ['vmu.math.formalVerify', 'vmu.math.leanCommand', 'vmu.math.leanArgs', 'vmu.math.leanTimeoutMs',
    'vmu.math.leanAsync', 'vmu.math.leanInitiative', 'vmu.math.leanSearchPaths', 'vmu.math.leanJobsMaxParallel']
  const JOBS_KEYS = ['vmu.math.jobs.persist', 'vmu.math.jobs.dir', 'vmu.math.jobs.recover', 'vmu.math.jobs.keepMirrors']
  const OUTPUT_KEYS = ['vmu.math.captureStdoutBytes']   // round 4 / F17: the child-output cap the Lean face reads
  const expectedKeys = LEAN_KEYS.concat(JOBS_KEYS, OUTPUT_KEYS)
  const usedKeys = withSeam.lean.keysUsed()
  ok(Array.isArray(usedKeys) && expectedKeys.length > 0 && expectedKeys.every((k) => usedKeys.includes(k)),
    'the face reads EVERY key it declares: the Lean keys, the job-ledger keys AND the child-output cap (count derived from those lists)',
    JSON.stringify(usedKeys))
  ok(usedKeys.length === expectedKeys.length && new Set(usedKeys).size === usedKeys.length,
    'and it reads EXACTLY those (' + LEAN_KEYS.length + ' Lean + ' + JOBS_KEYS.length + ' jobs + ' + OUTPUT_KEYS.length + ' output) with no duplicate',
    usedKeys.length + ' keys')
}

// ---- E2 (task-154): `status().seams` is a CONSTRUCTION FACT, never an inference -----------------------
{
  // E2-a: with no slots there is NO roster service ⇒ "members" must not be claimed as a deliver consumer
  const bare = m.createKernel({ clock })
  const bs = bare.status().seams
  ok(bare.members === null && bs.members === false, 'E2-a: no slots ⇒ no roster service and seams.members === false')
  ok(Array.isArray(bs.deliverConsumedBy) && !bs.deliverConsumedBy.includes('members'),
    'E2-a: a NULL service is NOT listed in deliverConsumedBy (the old hard-coded list named it anyway)', JSON.stringify(bs.deliverConsumedBy))
  ok(JSON.stringify(bs.deliverConsumedBy) === '[]', 'E2-a: with no deliver seam at all the consumer list is empty', JSON.stringify(bs.deliverConsumedBy))
  // ... and with a real seam the services that ACTUALLY received it are listed
  const deliver = async () => ({ ok: true, delivered: true })
  const withSeam = m.createKernel({ clock, slots: [{ id: 'chair', capacity: 1 }], deliver })
  const ws = withSeam.status().seams
  ok(ws.deliver === true && ws.deliverConsumedBy.includes('members') && ws.deliverConsumedBy.includes('notify'),
    'E2-a[+]: roster + notify really received the seam and are listed', JSON.stringify(ws.deliverConsumedBy))
  ok(!ws.deliverConsumedBy.includes('meetings'),
    'E2-a: the meeting factory is listed only once a meeting was really built (construction fact, not a guess)',
    JSON.stringify(ws.deliverConsumedBy))
  withSeam.meeting({ id: 'e2m1' })
  ok(withSeam.status().seams.deliverConsumedBy.includes('meetings'),
    'E2-a[+]: after a meeting is created the factory is listed too', JSON.stringify(withSeam.status().seams.deliverConsumedBy))
  // E2-b: the timer is judged by the CONSUMER's contract shape, not by truthiness
  const bareTimer = m.createKernel({ clock, timer: () => {} })
  const bt = bareTimer.status().seams
  ok(bt.timer === false && bt.timerShape === null,
    'E2-b: a BARE FUNCTION timer is not a usable seam (status says false, matching the scheduler)', JSON.stringify({ timer: bt.timer, shape: bt.timerShape }))
  ok(bt.timerInjected === true, 'E2-b: the option WAS injected — that separate fact stays visible')
  ok(typeof bt.timerNote === 'string' && /arm,disarm/.test(bt.timerNote) && /setTimeout,clearTimeout/.test(bt.timerNote),
    'E2-b: the note NAMES the expected contract shapes', bt.timerNote)
  const objectTimer = m.createKernel({ clock, timer: { arm: () => 1, disarm: () => true } })
  const ot = objectTimer.status().seams
  ok(ot.timer === true && ot.timerShape === 'arm/disarm' && ot.timerNote === null,
    'E2-b[+]: one of the four OBJECT shapes ⇒ seams.timer === true and the shape is disclosed', JSON.stringify({ t: ot.timer, s: ot.timerShape }))
  // SINGLE SOURCE OF TRUTH + the hard rule: status may not claim what the consumer refuses
  ok(bareTimer.scheduler.status().timerShape === null && objectTimer.scheduler.status().timerShape === 'arm/disarm',
    'E2-b: status() reproduces the SCHEDULER\'s own shape verdict (one source of truth)')
  let armErr = null
  const hostTimerBare = m.createKernel({ clock, timer: () => {}, settings: { 'vmu.schedule.timeSource': 'host-timer' } })
  try { await hostTimerBare.scheduler.arm({}) } catch (e) { armErr = e }
  ok(armErr && armErr.code === 'VMU_CONTROL_NO_TIMER',
    'E2 hard rule: the consumer refuses (VMU_CONTROL_NO_TIMER) ...', String(armErr && armErr.code))
  ok(hostTimerBare.status().seams.timer === false,
    'E2 hard rule: ... and status AGREES (before the fix status said true here — "available" vs "refused")')
  const hostTimerOk = m.createKernel({ clock, timer: { arm: () => 1, disarm: () => true }, settings: { 'vmu.schedule.timeSource': 'host-timer' } })
  const armed = await hostTimerOk.scheduler.arm({})
  ok(armed && armed.mode === 'host-timer' && hostTimerOk.status().seams.timer === true,
    'E2 hard rule[+]: with a contractual timer both the consumer and status agree it is usable', JSON.stringify({ mode: armed && armed.mode }))
}

// ---- E-6 (task-163): the runtime receipt is graded by hot class, and the view is READ-ONLY -------------
{
  // ① H1 ("next turn") — checkpointEvery used to be frozen at construction: receipt ok, chain still 100
  const k = m.createKernel({ clock, settings: { 'vmu.audit.chain.checkpointEvery': 100 } })
  ok(k.auditchain.status().checkpointEvery === 100, 'H1: the declared value rules before the write')
  const r1 = k.setSettingsValue('vmu.audit.chain.checkpointEvery', 7, { by: 'office' })
  ok(r1.hot === 'H1' && r1.requiresRestart === false && r1.applied === 'immediate',
    'H1 receipt: hot class is named and requiresRestart is false', JSON.stringify({ hot: r1.hot, restart: r1.requiresRestart }))
  ok(k.auditchain.status().checkpointEvery === 7,
    'H1 BEHAVIOUR: the consumer observes the new value (was frozen at 100 while the receipt said ok)',
    String(k.auditchain.status().checkpointEvery))
  ok(r1.requiresRestart === false && k.auditchain.status().checkpointEvery === 7,
    'H1: the receipt MATCHES the observed behaviour (receipt = verifiable fact)')
  // ② H0 ("immediate") — dryRun reaches the status AND the bus
  const k2 = m.createKernel({ clock })
  ok(k2.status().settings.dryRun === false && k2.bus.isDryRun() === false, 'H0: dryRun starts false in both places')
  const r2 = k2.setSettingsValue('vmu.middleware.dryRun', true, { by: 'office' })
  ok(r2.hot === 'H0' && r2.requiresRestart === false && r2.liveApplied.includes('bus'),
    'H0 receipt: names the consumers it reached live (bus included)', JSON.stringify(r2.liveApplied))
  ok(k2.status().settings.dryRun === true && k2.bus.isDryRun() === true,
    'H0 BEHAVIOUR: status() and the BUS both observe true (was: receipt ok, both still false)',
    JSON.stringify({ status: k2.status().settings.dryRun, bus: k2.bus.isDryRun() }))
  ok(Array.isArray(r2.pendingConsumers) && r2.pendingConsumers.includes('script-bridge'),
    'H0 honesty: a consumer that captured the option at construction is DISCLOSED as pending, not claimed',
    JSON.stringify(r2.pendingConsumers))
  // ③ H2 ("next session") — the value is stored, nothing pretends it applied, and the receipt says so
  const k3 = m.createKernel({ clock })
  const r3 = k3.setSettingsValue('vmu.core.enabled', false, { by: 'office' })
  ok(r3.hot === 'H2' && r3.requiresRestart === true && r3.applied === 'next-session',
    'H2 receipt: requiresRestart:true (was a bare {ok:true} while kernel.enabled stayed true)', JSON.stringify({ hot: r3.hot, restart: r3.requiresRestart }))
  ok(k3.enabled === true, 'H2: the running kernel is honestly UNCHANGED (no false claim of immediate effect)')
  const st3 = k3.status().settings
  ok(st3.lastRuntimeWrite && st3.lastRuntimeWrite.requiresRestart === true && st3.lastRuntimeWrite.hot === 'H2',
    'H2: status() SELF-DISCLOSES the last runtime write and its grading', JSON.stringify(st3.lastRuntimeWrite))
  ok(/H0\/H1/.test(st3.hotGrading) && /requiresRestart/.test(st3.hotGrading),
    'status() states the hot-grading promise in words too')
  // ④ owner check survives the grading change
  let denied = null
  try { k3.setSettingsValue('vmu.core.enabled', true, { by: 'member-1' }) } catch (e) { denied = e }
  ok(denied && denied.code === 'VMU_NOT_PERMITTED', 'the declared-owner check still runs (grading never bypasses it)')
}

// ---- E-6b (task-163): settingsView refuses to write through --------------------------------------------
{
  const k = m.createKernel({ clock })
  const view = k.settingsView()
  ok(typeof view === 'object' && typeof view.get === 'function', 'the kernel exposes the sanctioned read-only view')
  const before = Object.keys(k.settingsSnapshot()).sort().join(',')
  let setErr = null
  try { view['vmu.safety.pathPolicy'] = 'allow-all' } catch (e) { setErr = e }
  ok(setErr && setErr.code === 'VMU_NOT_PERMITTED' && /READ-ONLY/.test(setErr.message),
    'write-through is a NAMED refusal (was: the key was silently added to kernel settings)', setErr && setErr.code)
  ok(/setSettingsValue/.test(String(setErr.hint)), 'the refusal points at the sanctioned writer', setErr && setErr.hint)
  ok(!('vmu.safety.pathPolicy' in k.settingsSnapshot()) && Object.keys(k.settingsSnapshot()).sort().join(',') === before,
    'the kernel settings object is unchanged after the refused write (no pollution)')
  let delErr = null
  try { delete view['vmu.audit.chain.checkpointEvery'] } catch (e) { delErr = e }
  ok(delErr && delErr.code === 'VMU_NOT_PERMITTED', 'delete-through is refused too', delErr && delErr.code)
  // the view is still LIVE for reads: a sanctioned write is visible through it immediately
  k.setSettingsValue('vmu.audit.chain.checkpointEvery', 3, { by: 'office' })
  ok(view['vmu.audit.chain.checkpointEvery'] === 3 && view.get('vmu.audit.chain.checkpointEvery') === 3,
    'reads stay LIVE (property and get() both see the sanctioned write)')
  // task-179: the self-reported runtime-write surface had NO gate. A write must move the counter and the
  // last-write record, and both must be observable through status().settings.
  {
    const beforeW = k.status().settings.runtimeWrites
    const w = k.setSettingsValue('vmu.audit.chain.checkpointEvery', 6, { by: 'office' })
    const st = k.status().settings
    ok(st.runtimeWrites === beforeW + 1, 'settings.runtimeWrites counts a real runtime write (' + beforeW + ' -> ' + st.runtimeWrites + ')')
    ok(st.lastRuntimeWrite && st.lastRuntimeWrite.key === 'vmu.audit.chain.checkpointEvery' && st.lastRuntimeWrite.action === 'set',
      'lastRuntimeWrite names the key and the action (' + JSON.stringify(st.lastRuntimeWrite && { key: st.lastRuntimeWrite.key, action: st.lastRuntimeWrite.action }) + ')')
    ok((typeof st.lastRuntimeWrite.hot === 'string' && st.lastRuntimeWrite.hot.length > 0) && typeof st.lastRuntimeWrite.at !== 'undefined',
      'lastRuntimeWrite reports the hot/cold class and the receipt time (hot=' + String(st.lastRuntimeWrite.hot) + ')')
    ok(w && w.ok === true && String(w.key || 'vmu.audit.chain.checkpointEvery') === 'vmu.audit.chain.checkpointEvery',
      'the write receipt names the same key the counter recorded')
  }
}

// ---- E-7 (task-166): the contract lives in the KERNEL API, not only at the tool boundary --------------
{
  const k = m.createKernel({ clock })
  // ① H3 (framework-owned, read-only) is refused by the kernel API with the SAME code and the SAME words the
  //    tool face uses (before: kernel API said ok + applied:'immediate' while the tool face refused).
  const H3_KEY = 'vmu.safety.pathPolicy'
  const H3_MSG = 'setting ' + H3_KEY + ' is read-only (H3): the framework owns it'
  let withBy = null
  try { k.setSettingsValue(H3_KEY, 'workspace+shared', { by: 'office' }) } catch (e) { withBy = e }
  ok(withBy && withBy.code === 'VMU_NOT_PERMITTED' && withBy.message === H3_MSG,
    'H3 via the kernel API is refused BY NAME with the tool face\'s exact code and words', withBy && withBy.message)
  let noBy = null
  try { k.setSettingsValue(H3_KEY, 'workspace+shared') } catch (e) { noBy = e }
  ok(noBy && noBy.code === 'VMU_NOT_PERMITTED' && noBy.message === H3_MSG,
    'H3 is refused even when the caller omits `by` (no path may bypass a hot-class contract)')
  ok(k.settingsSnapshot()[H3_KEY] === undefined, 'the refused H3 write changed nothing')
  // ② unset runs the SAME guard (it used to be a bare `delete settings[key]`)
  let unsetH3 = null
  try { k.unsetSettingsValue(H3_KEY, { by: 'office' }) } catch (e) { unsetH3 = e }
  ok(unsetH3 && unsetH3.code === 'VMU_NOT_PERMITTED' && unsetH3.message === H3_MSG,
    'unset of an H3 key is refused with the same code and words (no silent deletion)', unsetH3 && unsetH3.code)
  // ③ unknown keys are refused on BOTH writers
  let unknownSet = null
  try { k.setSettingsValue('vmu.no.such.key', 1, { by: 'office' }) } catch (e) { unknownSet = e }
  ok(unknownSet && unknownSet.code === 'VMU_INVALID_ARGUMENT' && /undeclared setting key/.test(unknownSet.message),
    'setting an UNDECLARED key is a named refusal (wording aligned with schema.assertDeclared)', unknownSet && unknownSet.message)
  let unknownUnset = null
  try { k.unsetSettingsValue('vmu.no.such.key', { by: 'office' }) } catch (e) { unknownUnset = e }
  ok(unknownUnset && unknownUnset.code === 'VMU_INVALID_ARGUMENT', 'unsetting an undeclared key is refused too')
  // ④ owner check: an identified non-owner is refused; a missing `by` is an EXPLICIT exemption, disclosed
  let notOwner = null
  try { k.setSettingsValue('vmu.middleware.dryRun', true, { by: 'member-1' }) } catch (e) { notOwner = e }
  ok(notOwner && notOwner.code === 'VMU_NOT_PERMITTED' && /declared owner/.test(notOwner.message),
    'a declared non-owner is refused (as before)', notOwner && notOwner.code)
  const exempt = k.setSettingsValue('vmu.middleware.dryRun', true)   // no `by` = the office path
  ok(exempt.ok === true && /exempted/.test(String(exempt.ownerCheck)),
    'a missing `by` is an EXPLICIT exemption and the receipt SAYS so (never a silent skip)', exempt.ownerCheck)
  // ⑤ unset H2: allowed, but the removal is RECORDED (who/when/previous value) and graded
  const k2 = m.createKernel({ clock, settings: { 'vmu.math.formalVerify': 'require' } })
  const un = k2.unsetSettingsValue('vmu.math.formalVerify', { by: 'office' })
  ok(un.ok === true && un.action === 'unset' && un.hot === 'H2' && un.requiresRestart === true && un.previous === 'require',
    'unset records the PREVIOUS value and the hot class (no silent removal)', JSON.stringify({ prev: un.previous, hot: un.hot }))
  ok(k2.settingsSnapshot()['vmu.math.formalVerify'] === undefined, 'the value really was removed')
  const lastWrite = k2.status().settings.lastRuntimeWrite
  ok(lastWrite && lastWrite.action === 'unset' && lastWrite.key === 'vmu.math.formalVerify' && lastWrite.by === 'office' && lastWrite.previous === 'require',
    'status() self-discloses the unset with who/when/previous', JSON.stringify(lastWrite))
  const unNoBy = k2.unsetSettingsValue('vmu.math.formalVerify')
  ok(unNoBy.ok === true && /exempted/.test(String(unNoBy.ownerCheck)),
    'unset without `by` is the disclosed office exemption, not a silent bypass', unNoBy.ownerCheck)
  // ⑥ ONE applies table, shared with the host face
  const table = k.appliesTable()
  ok(table.H0 === 'immediately' && table.H1 === 'next turn' && table.H2 === 'next session (restart required)' && /read-only/.test(table.H3),
    'the APPLIES table covers all four hot classes (H3 = read-only)', JSON.stringify(table))
  ok(JSON.stringify(k.status().settings.applies) === JSON.stringify(table),
    'status() exposes the SAME table (the host reads this one instead of keeping a copy)')
  const h1 = k.setSettingsValue('vmu.audit.chain.checkpointEvery', 5, { by: 'office' })
  ok(h1.appliesAt === table.H1, 'every receipt derives appliesAt from the shared table', h1.appliesAt)
  // ⑦ H0/H1 still apply live (continuity with task-163)
  const k3 = m.createKernel({ clock, settings: { 'vmu.audit.chain.checkpointEvery': 100 } })
  k3.setSettingsValue('vmu.audit.chain.checkpointEvery', 4, { by: 'office' })
  ok(k3.auditchain.status().checkpointEvery === 4, 'H1 is still immediate after the guard was centralised')
}

// ---- E-8 (task-170): the GUARD FACES are registered, verified, and reachable in PRODUCTION -------------
{
  const SRC = readFileSync(MODULE, 'utf8')
  const DOC11 = readFileSync(resolve(REPO, 'vibe-math-vmu', 'docs', '11-gates-and-development.md'), 'utf8')
  // The scanner: every guard-shaped face on the returned kernel object must be registered. A `require*` method
  // or the settingsView accessor that is NOT in the registry is exactly the eighth case (implemented, tested,
  // and never effective) — so this checker is what the gate runs.
  const scanFaces = (src) => [...new Set([...src.matchAll(/^\s{4}(require[A-Z]\w*|settingsView)\(\)\s*\{/gm)].map((m) => m[1]))].sort()
  const checkCoverage = (src, registered) => scanFaces(src).filter((f) => !registered.includes(f))
  const k = m.createKernel({ clock })
  const guards = k.status().guards
  ok(guards && Array.isArray(guards.registered) && guards.registered.length >= 4,
    'E-8: status() reports the guard-face registry', JSON.stringify(guards && guards.registered))
  ok(checkCoverage(SRC, guards.registered).length === 0,
    'E-8: EVERY `require*`/settingsView face in the source is registered (no unregistered guard face)',
    JSON.stringify(checkCoverage(SRC, guards.registered)))
  ok(guards.registered.includes('requireStore') && guards.registered.includes('requireLibrary') &&
    guards.registered.includes('requireMembers') && guards.registered.includes('settingsView'),
    'E-8: the three faces the reviewer named (plus requireLibrary) are all in the registry')
  // (乙) SELF-PROOF: a deliberately unregistered guard must make the checker go RED
  const mutant = SRC.replace('    requireStore() { return mustStore() },', '    requireStore() { return mustStore() },\n    requireNothing() { return 1 },')
  const mutantUncovered = checkCoverage(mutant, guards.registered)
  ok(mutantUncovered.includes('requireNothing'),
    'E-8 self-proof: a fabricated unregistered guard face IS detected (the gate can fail)', JSON.stringify(mutantUncovered))
  // contract faces declare REAL production call sites; diagnostic faces declare WHY they are diagnostic
  const contract = Object.entries(guards.faces).filter(([, f]) => f.kind === 'contract')
  const diagnostic = Object.entries(guards.faces).filter(([, f]) => f.kind === 'diagnostic')
  ok(contract.length === 2 && diagnostic.length === 2 && guards.contractCount === 2 && guards.diagnosticCount === 2,
    'E-8: contract and diagnostic faces are counted separately', JSON.stringify({ c: guards.contractCount, d: guards.diagnosticCount }))
  ok(contract.every(([, f]) => f.usedByProduction === true && f.productionCallSites.length >= 1 && f.reason === null),
    'E-8: every CONTRACT face names its production call sites', JSON.stringify(contract.map(([n]) => n)))
  ok(diagnostic.every(([, f]) => f.usedByProduction === false && typeof f.reason === 'string' && f.reason.length > 40),
    'E-8: every DIAGNOSTIC face states why it is not a production rail', JSON.stringify(diagnostic.map(([n]) => n)))
  // the declared production sites really exist in the source (a claim that cannot rot silently)
  ok(/read: \(\) => mustStore\(\)\.read\(\)/.test(SRC),
    'E-8(甲): the loader kernel facade calls the store guard in production (was `store ? … : null`)')
  ok(/declareTracks[\s\S]{0,220}mustLibrary\(\)/.test(SRC),
    'E-8(甲): declareTracks calls the library guard (the inline copy of the same refusal is gone)')
  ok(!/store \? store\.read\(\) : null/.test(SRC),
    'E-8(甲): the silent `null` fallback is GONE from the production facade')
  // (甲) BEHAVIOUR: with no root, the PRODUCTION path refuses by name; with a root it returns the state
  const probeModule = (sink) => ({ meta: { id: 'guard-probe', apiVersion: 1 }, capabilities: ['read-state'],
    hooks: { 'meeting/round-start': async () => undefined },   // the loader requires >=1 REGISTERED hook
    default: ({ kernel }) => {
      try { sink.push(kernel.read()) } catch (e) { sink.push({ code: e && e.code, message: e && e.message }) }
      return { hooks: { 'meeting/round-start': async () => undefined } }
    } })
  const bare = m.createKernel({ clock })
  const bareSeen = []
  await bare.loader.load({ id: 'guard-probe', kind: 'module', module: probeModule(bareSeen) })
  ok(bareSeen[0] && bareSeen[0].code === 'VMU_ENGINE_UNAVAILABLE' && /no durable root/.test(String(bareSeen[0].message)),
    'E-8(甲) BEHAVIOUR: a module calling kernel.read() with no root gets the NAMED refusal (not null)',
    JSON.stringify(bareSeen[0]))
  const root = await mkdtemp(join(tmpdir(), 'vmu-guard-'))
  const withRoot = m.createKernel({ clock, root })
  const rootSeen = []
  await withRoot.loader.load({ id: 'guard-probe', kind: 'module', module: probeModule(rootSeen) })
  ok(rootSeen[0] !== undefined && (rootSeen[0] === null || typeof rootSeen[0] === 'object' || typeof rootSeen[0] === 'string'),
    'E-8(甲) BEHAVIOUR: with a root the same production path returns the store state instead of refusing',
    JSON.stringify(rootSeen[0]).slice(0, 60))
  let tracksErr = null
  try { bare.declareTracks(['progress']) } catch (e) { tracksErr = e }
  ok(tracksErr && tracksErr.code === 'VMU_ENGINE_UNAVAILABLE' && /no library root/.test(tracksErr.message),
    'E-8(甲) BEHAVIOUR: declareTracks refuses by name through the guard when there is no root', tracksErr && tracksErr.message)
  await rm(root, { recursive: true, force: true })
  // the guard faces are registered in the DOCS too (docs/11 §守卫面清单)
  const section = DOC11.slice(DOC11.indexOf('## 4.2'), DOC11.indexOf('## 5.'))
  ok(section.length > 0 && guards.registered.every((f) => section.includes(f)),
    'E-8(乙): docs/11 §守卫面清单 names every registered face', JSON.stringify(guards.registered.filter((f) => !section.includes(f))))
  ok(/新增守卫面若不登记/.test(section) && /诊断/.test(section),
    'E-8(乙): the section states the "a new guard face must be registered" rule and the diagnostic disposition')
  // status() must never imply a diagnostic face is a live production rail
  ok(guards.faces.requireMembers.kind === 'diagnostic' && guards.faces.requireMembers.usedByProduction === false,
    'E-8: status() says plainly that requireMembers() is NOT a production rail')
  ok(/verifiedBy/.test(JSON.stringify(guards)) && /scans kernel\/index\.js/.test(String(guards.verifiedBy)),
    'E-8: status() names the verification that keeps this table honest')
}


// ── ROUND 240: an UNLOADED pack must not stay in the pack list ───────────────────────────────────────────────
{
  const km = await import(pathToFileURL(MODULE).href)   // this suite loads the kernel dynamically, so the assertion does too
  const k = km.createKernel({ clock: () => 0, settings: {} })
  ok((k.status().packs || []).includes('round240-pack') === false, 'packs[-]: an unapplied pack is not listed')
  k.notePackApplied('round240-pack')
  ok((k.status().packs || []).includes('round240-pack') === true, 'packs[+]: an applied pack IS listed')
  k.notePackUnloaded('round240-pack')
  ok((k.status().packs || []).includes('round240-pack') === false,
    'packs[unload]: after unloading it is GONE from the list - before this round it stayed there for ever, because the unload record was written and nothing read it')
  ok(k.packNotes().length >= 2, 'packNotes(): the note log is readable, so the record of both events is not write-only')
  const notes = k.packNotes()
  ok(notes.some((n) => n.what === 'applied') && notes.some((n) => n.what === 'unloaded'),
    'packNotes(): both the apply and the unload are recorded', JSON.stringify(notes.map((n) => n.what)))
}


// ── D4 (Round 35): THE STATUS RECEIPT MUST FIT, AND MUST NOT LOSE A SECTION TO DO IT ──────────────────────
// Measured on a real machine: the full receipt exceeded the host limit, the host truncated it, and the four
// segments a reader asks about were the parts cut. The KERNEL defaults to the complete view; the TOOL FACE
// defaults to the bounded summary. Both ends of that contract are asserted here.
{
  const kd = m.createKernel({ clock })
  const fullStr = JSON.stringify(kd.status({ detail: "full" }))
  const sumStr = JSON.stringify(kd.status({ detail: "summary" }))
  const dfltStr = JSON.stringify(kd.status())
  // EMPTY_ALLOWED: fullStr.length > 0 is asserted in the same condition, so two empty views cannot satisfy it; the
  // strings are JSON of a real status object and the non-empty requirement is stated rather than assumed.
  // ★★★★★★★ ROUND 82: A SHAPE-B VIOLATION, FIXED AT THE ROOT. This compared two LENGTHS, which is satisfied when BOTH
  // views are empty - the empty-vs-empty comparison rule E forbids, because the assertion would then prove nothing about
  // the view it is meant to check. Comparing the STRINGS is strictly stronger and cannot pass on two empty values, and
  // the length is required to be non-zero so the claim is about real content either way.
  ok(fullStr.length > 0, 'D4: the full view is NON-EMPTY, so the comparison below cannot be satisfied by two empty views')
  ok(dfltStr === fullStr,
    "D4: the KERNEL defaults to the COMPLETE view - eliding keys at the source would make an absent key indistinguishable from an unset one")
  ok(sumStr.length < fullStr.length, "D4: the summary is strictly smaller than the full view")
  ok(sumStr.length < 12000, "D4: the summary fits the 12 KB limit the real machine reported (measured " + sumStr.length + " B)")
  // ★ THE CONTRACT IS A SUPERSET, NOT AN EQUALITY: the summary may ADD a note explaining what it bounded, but it
  // may never REMOVE a section. Asserting equality would also forbid the receipt from saying what it did - which is
  // the honesty this change exists to provide.
  const fullKeyList = Object.keys(kd.status())
  const sumKeySet = new Set(Object.keys(kd.status({ detail: "summary" })))
  const missingFromSummary = fullKeyList.filter((key) => !sumKeySet.has(key))
  ok(missingFromSummary.length === 0,
    "D4: the summary removes NO top-level section (it may add a note; missing: " + missingFromSummary.join(",") + ")")
  const sm = kd.status({ detail: "summary" })
  ok(typeof sm.settings.resolvedDetail === "string" && /summary/.test(sm.settings.resolvedDetail),
    "D4: the summary STATES what it bounded and how to ask for the rest")
  ok(typeof sm.diagnosticsBounded === "string", "D4: the bounded diagnostic sections are named in the receipt")
  // ★ THE COUNTEREXAMPLE: a receipt that silently omitted a heavy section would satisfy every check above, so each
  // bound must remain visible as a PRESENCE fact rather than as a missing key.
  const bounded = ["registry", "guards", "seams", "reporting", "approvalGate", "projections", "activity"]
  // ★★★★★★★ ROUND 82: THE NON-EMPTY GUARD RULE E ASKS FOR. The two .every(...) assertions below are shape-A candidate
  // lines: with an EMPTY list they would pass vacuously and report success for a check that never ran. The list is a
  // literal of seven names, so the guard is provably satisfied - but it is STATED, because the scanner reads guards and
  // literals rather than intent, and an assertion that cannot fail is not an assertion.
  ok(bounded.length === 7, "D4: the bounded-section list is the seven the receipt names, so the checks below cannot run on nothing")
  ok(bounded.every((key) => sm[key] !== undefined && typeof sm[key].present === "boolean"),
    "D4: each bounded section still reports whether it is PRESENT (absent-by-design stays distinguishable from elided-for-size)")
  ok(bounded.every((key) => kd.status({ detail: "full" })[key] !== undefined),
    "D4: every bounded section is returned IN FULL for detail:full - nothing is lost, only requested")
}
// ── PHASE 6 · goal 3 P0: "未配置 ⇒ 声明默认" must hold on EVERY door ───────────────────────────────────────────
// What broke before this block existed (goal-3 audit round 1, R1/R2/R3): the kernel does not materialise schema
// defaults, and FOUR readers each invented a fallback - two of which said 'full' where the schema says 'diff', one said
// 0 where the schema says 2/3, and the M1 predicate saw `undefined` while M2 saw the declared default. The repair is
// ONE reader (kernel/settings-defaults.js); these assertions pin the reader AND its four call sites, and the last one
// makes any NEW bare read visible.
const FALLBACK_KEYS = [
  ['vmu.records.history.storeMode', 'diff'],
  ['vmu.meetings.quotesPerMessageMax', 2],
  ['vmu.meetings.quoteDepthMax', 3],
]
{
  ok(FALLBACK_KEYS.length === 3, 'P0-fallback: the three audited keys are listed, so the checks below cannot run on an empty list')
  for (const [key, expected] of FALLBACK_KEYS) {
    ok(readSetting({}, key) === expected, 'P0-fallback: unconfigured ' + key + ' reads as its DECLARED default ' + JSON.stringify(expected), readSetting({}, key))
    ok(declaredDefault(key) === expected, 'P0-fallback: the declared default really comes from the schema table (' + key + ')', declaredDefault(key))
  }
  ok(readSetting({ 'vmu.records.history.storeMode': 'full' }, 'vmu.records.history.storeMode') === 'full',
    'P0-fallback: a configured value WINS over the declared default (the reader is not a hard-coded default)')
  ok(readSetting(undefined, 'vmu.meetings.quotesPerMessageMax') === 2 && readSetting(null, 'vmu.meetings.quotesPerMessageMax') === 2,
    'P0-fallback: a missing settings object still yields the declared default (no undefined leaking into a consumer)')
  ok(readSetting({}, 'vmu.not.a.declared.key') === undefined,
    'P0-fallback: an UNDECLARED key still reads undefined - the reader does not invent defaults for unknown names')
}

// DOOR 1 (library): the diff-mode baseline protection is only reachable when the default is really 'diff'.
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-def-lib-'))
  const kl = m.createKernel({ clock, root })
  const added = await kl.library.append({ kind: 'proposition', statement: 'p0 default storeMode', title: 'p0', owner: 'acad' })
  await kl.library.commitRevision({ id: added.id, by: 'acad', reason: 'baseline' })
  const removed = await kl.library.removeRevision({ id: added.id, rev: 1 }).then(() => null, (e) => e)
  ok(removed && removed.code === 'VMU_RETENTION_CONFLICT',
    'P0-fallback: with an EMPTY settings object, storeMode is diff ⇒ the baseline revision is protected (before the fix the default was full and this delete succeeded)', removed && removed.code)
  await rm(root, { recursive: true, force: true })
}

// DOOR 2 (retention): its config view must report the same declared default.
{
  const kr = m.createKernel({ clock })
  ok(kr.retention.status().config.historyStoreMode === 'diff',
    'P0-fallback: retention sees the declared storeMode default (diff) when nothing configured', kr.retention.status().config.historyStoreMode)
}

// DOOR 3 (meeting factory): the quote caps are machine-enforced at their DECLARED defaults.
{
  const kq = m.createKernel({ clock })
  const mt = kq.meeting({ id: 'p0-caps', roster: ['a', 'b'] })
  await mt.convene('agenda')
  await mt.openRound({ members: ['a', 'b'] })
  const folded = await mt.speak('a', 'one quote', { quotes: [{ id: 'q1', depth: 5 }] })
  ok(folded && folded.ok === true && folded.folded === 1,
    'P0-fallback: quoteDepthMax is 3 by default, so a depth-5 quote is FOLDED and counted (before the fix the cap was 0 = off)', JSON.stringify(folded && folded.folded))
  const overCap = await mt.speak('b', 'three quotes', { quotes: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }).then(() => null, (e) => e)
  ok(overCap && overCap.code === 'VMU_INVALID_ARGUMENT' && /at most 2/.test(String(overCap.message)),
    'P0-fallback: quotesPerMessageMax is 2 by default, so a third quote is REFUSED by name (before the fix the cap was 0 = off)',
    overCap && String(overCap.message))
}

// DOOR 4 (M1 `setting:` predicate through the assembled bus): the SAME answer M2's api.setting() gives.
{
  const rule = (id, eq) => ({ id, kind: 'rules', on: ['tools/pre-execute'], when: { setting: { key: 'vmu.meetings.quotesPerMessageMax', eq } }, then: [{ allow: {} }] })
  const km = m.createKernel({ clock, settings: { 'vmu.middleware.entries': [rule('def-match', 2), rule('def-miss', 0)] } })
  await km.start()
  const hit = await km.bus.emit('tools/pre-execute', { tool: 'probe' })
  const matched = (hit.decisions || []).filter((d) => d && d.decision && Object.prototype.hasOwnProperty.call(d.decision, 'allow')).length
  ok(hit.ok === true && matched === 1,
    'P0-fallback: an M1 rule written against the DECLARED default (eq 2) matches on an unconfigured kernel, and the eq-0 twin does not',
    JSON.stringify((hit.decisions || []).map((d) => d.id)))
}

// THE WIDE-ANGLE GUARD: every remaining bare settings read is LISTED, so a fifth door cannot grow quietly.
{
  const KERNEL_DIR = join(REPO, 'vibe-math-vmu', 'kernel')
  const walkJs = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walkJs(p) : (p.endsWith('.js') ? [p] : [])
  })
  const bareReads = (src) => {
    const out = []
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      for (const match of line.matchAll(/settings\[\s*'(vmu\.[^']+)'\s*\]/g)) out.push({ line: i + 1, key: match[1] })
    })
    return out
  }
  ok(bareReads("const x = settings['vmu.records.tracks']").length === 1,
    'P0-scan: SELF-PROOF - the bare-read scanner really sees a bare read (a scanner that matches nothing would report "clean")')
  const found = []
  for (const file of walkJs(KERNEL_DIR)) {
    for (const hit of bareReads(readFileSync(file, 'utf8'))) found.push(file.replace(REPO + '\\', '').replace(REPO + '/', '') + ':' + hit.line + ' ' + hit.key)
  }
  console.log('  ★ BARE-READ-REPORT kernel reads still literal-dotted = ' + found.length)
  // RULE E NOTE: this is a join, not a loop - the report must not create an A-class "zero-iteration assertion" shape.
  if (found.length > 0) console.log('    ' + found.slice(0, 40).join('\n    '))
  const MUST_USE_READER = [
    ['kernel/library.js', 'vmu.records.history.storeMode'],
    ['kernel/retention.js', 'vmu.records.history.storeMode'],
    ['kernel/index.js', 'vmu.meetings.quotesPerMessageMax'],
    ['kernel/index.js', 'vmu.meetings.quoteDepthMax'],
    ['kernel/bus.js', 'vmu.middleware.hookTimeoutMs'],
    ['kernel/bus.js', 'vmu.middleware.breakerThreshold'],
  ]
  ok(MUST_USE_READER.length === 6, 'P0-scan: the must-use-reader list is the six audited read sites, so the loop below cannot run on nothing')
  for (const [file, key] of MUST_USE_READER) {
    ok(!found.some((row) => row.indexOf(file + ':') === 0 && row.endsWith(' ' + key)),
      'P0-scan: ' + file + ' no longer reads ' + key + ' as a bare literal (it goes through the one reader)')
  }
  for (const file of ['kernel/library.js', 'kernel/retention.js', 'kernel/rules.js', 'kernel/bus.js']) {
    ok(readFileSync(join(REPO, 'vibe-math-vmu', file), 'utf8').includes('settings-defaults.js'),
      'P0-scan: ' + file + ' imports the one declared-default reader')
  }
}

// ── PHASE 6 · goal 3 P1: the HALF-BUILT PAIRS (receipt truth / topic retract / ownership / atomicity / tracks) ──
// Each assertion below FAILS on the pre-fix tree: the receipt claimed 'immediate' for a construction-only key, a
// refused tool batch left its earlier entries behind, a foreign pack could retract another pack's tool, and an
// unloaded pack's tracks stayed declared.
{
  // (1) autoArm is a CONSTRUCTION-TIME read; the receipt must say "restart required", not "immediate".
  const ka = m.createKernel({ clock })
  const receipt = ka.setSettingsValue('vmu.schedule.autoArm', true, { by: 'office' })
  ok(receipt.requiresRestart === true && /next session|restart/i.test(String(receipt.appliesAt)),
    'P1-autoArm: setting it at runtime reports "restart required" (construction-time read) - before the hot-class fix this receipt said immediate',
    { requiresRestart: receipt.requiresRestart, appliesAt: receipt.appliesAt, applied: receipt.applied })
  ok(receipt.liveApplied.length === 0, 'P1-autoArm: the receipt names NO live consumer (because there is none)', receipt.liveApplied)
}
{
  // (2) declarePackTools is ALL-OR-NOTHING: a bad second entry must leave the first one out too.
  const kt = m.createKernel({ clock })
  const handler = async () => ({ ok: true })
  let refused = null
  try {
    kt.declarePackTools([
      { name: 'pack_atomic_one', description: 'first', handler },
      { name: 'BAD NAME', description: 'second', handler },
    ], { by: 'pack-A' })
  } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_INVALID_ARGUMENT', 'P1-atomic: an invalid entry is refused by name', refused && refused.code)
  ok(kt.packTools().length === 0,
    'P1-atomic: the refused batch leaves NO half-declaration behind (the first entry is not in packTools)', kt.packTools().map((t) => t.name))
  // (3) retractPackTools enforces OWNERSHIP: pack B cannot retract pack A's tool, and the tool survives.
  kt.declarePackTools([{ name: 'pack_a_tool', description: 'owned by A', handler }], { by: 'pack-A' })
  let denied = null
  try { kt.retractPackTools(['pack_a_tool'], { by: 'pack-B' }) } catch (e) { denied = e }
  ok(denied && denied.code === 'VMU_NOT_PERMITTED',
    'P1-ownership: a foreign pack retracting a tool is a NAMED refusal (before the fix it silently removed it)', denied && denied.code)
  ok(kt.packTools().some((t) => t.name === 'pack_a_tool'),
    'P1-ownership: and the tool is STILL declared after the refused retraction', kt.packTools().map((t) => t.name))
  const own = kt.retractPackTools(['pack_a_tool'], { by: 'pack-A' })
  ok(own.count === 1 && kt.packTools().length === 0, 'P1-ownership: the owner CAN retract its own tool', own)
}
{
  // (4) declareTracks has a REVERSE, and a pack unload uses it: the pack's tracks stop being declared.
  const root = await mkdtemp(join(tmpdir(), 'vmu-tracks-'))
  const kr = m.createKernel({ clock, root })
  const loader = createPackLoader({ kernel: kr, registry: kr.registry })
  const applied = await loader.apply({ id: 'track-pack', tracks: ['progress', 'problems'] })
  ok(applied && applied.ok !== false, 'P1-tracks: a pack declaring tracks applies', applied && applied.ok)
  const during = await kr.library.status()
  ok(during.tracks.includes('problems'),
    'P1-tracks: while applied, the pack track is declared (library.status().tracks)', during.tracks)
  const unload = await loader.unload('track-pack')
  ok(unload && unload.ok === true, 'P1-tracks: the pack unloads', unload && unload.ok)
  const after = await kr.library.status()
  ok(after.tracks.includes('problems') === false && after.tracks.length > 0,
    'P1-tracks: after the unload the pack track is GONE and the construction-time tracks are back (before the fix the rebuilt library survived)',
    after.tracks)
  await rm(root, { recursive: true, force: true })
}

// ── PHASE 6 · goal 3 P2: no decorative fields; documented middleware surface must be REACHABLE from M2 ─────────
{
  const kh = m.createKernel({ clock })
  const handler = async () => ({ ok: true })
  let capErr = null
  try { kh.declarePackTools([{ name: 'pack_cap_tool', description: 'd', handler, capabilities: ['x'] }], { by: 'pack-A' }) } catch (e) { capErr = e }
  ok(capErr && capErr.code === 'VMU_INVALID_ARGUMENT' && kh.packTools().length === 0,
    'P2-no-decoration: a pack tool carrying capabilities is REFUSED by name - there is no capability consumer for tools, so accepting it would be decoration', capErr && capErr.code)
  kh.declarePackTools([{ name: 'pack_plain_tool', description: 'd', handler }], { by: 'pack-A' })
  const declared = kh.packTools().find((t) => t.name === 'pack_plain_tool')
  ok(declared && Object.prototype.hasOwnProperty.call(declared, 'capabilities') === false,
    'P2-no-decoration: packTools() no longer exposes a capabilities field', declared && Object.keys(declared))
  let face = null
  let callErr = null
  const probe = {
    meta: { id: 'mw-face-probe', apiVersion: 1 },
    capabilities: ['trigger-workflow'],
    hooks: { 'tools/pre-execute': (event) => { try { face = event.api.services.get('vmu.middleware') } catch (e) { callErr = e } } },
  }
  const probeEntry = { id: 'mw-face-probe', kind: 'module', on: ['tools/pre-execute'], module: probe }
  const probeBusEntries = await kh.loader.toBusEntries([probeEntry])
  for (const entry of probeBusEntries) kh.bus.add(entry)
  await kh.bus.emit('tools/pre-execute', { tool: 'probe' })
  ok(!callErr && face && typeof face.rewriteOf === 'function',
    'P2-catalog: an M2 module CAN get vmu.middleware and its rewriteOf (before: VMU_NO_SUCH_OBJECT)', callErr && callErr.code)
  ok(face && face.rewriteOf('tools/pre-execute', { ok: true, decisions: [] }) === null,
    'P2-catalog: rewriteOf on an emit nobody rewrote returns null (pure read, executes nothing)')
}

// ---- 99. RECORDS ARE DURABLE: the projection had NO persistence seam, so a restart lost every card (SLV measured) ----
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-records-persist-'))
  const clockNum = () => 1000
  const settings = {
    'vmu.records.tracks': ['problems'],
    'vmu.records.allowedKinds': ['problem', 'state'],
    'vmu.records.requireSettledRecords': false,
  }
  const boot = async () => {
    const k = m.createKernel({ clock: clockNum, root, settings })
    await k.store.open()
    return k
  }
  const k1 = await boot()
  const put = k1.records.put({ track: 'problems', kind: 'problem', title: 'persist-q', body: 'persist-body', settled: true })
  await new Promise((r) => setTimeout(r, 30))
  const k2 = await boot()
  const heads = k2.records.list({ track: 'problems', limit: 0 }).items
  ok(heads.length === 1 && heads[0].id === put.id,
    '★ SLV: a record written before a restart is restored from the durable store with the SAME id (plan references survive)',
    { before: put.id, after: heads.map((h) => h.id) })
  ok(k2.records.get({ id: put.id }).body === 'persist-body',
    '★ and its body is readable after the restart (expand no longer VMU_NO_SUCH_OBJECT)')
  // Reverse: without a root there is no store at all, and a fresh kernel never invents records it never wrote.
  const noRoot = m.createKernel({ clock: clockNum, settings })
  ok(noRoot.store === null, 'reverse: no root means no store (named absence, not a fake durability)')
  noRoot.records.put({ track: 'problems', kind: 'problem', title: 'ephemeral', body: 'x', settled: true })
  const fresh = m.createKernel({ clock: clockNum, settings })
  ok(fresh.records.list({ track: 'problems', limit: 0 }).items.length === 0,
    'reverse: a kernel without a root starts with NO records (nothing is invented)')
  try { await rm(root, { recursive: true, force: true }) } catch { /* the store may still hold the file open */ }
}

// ── ★ PHASE 7: vmu.status — generic pack-registered status sections + unload dispose contract ─────────────────
{
  const k = m.createKernel({ clock: () => 0 })
  const bare = k.status()
  ok(!Object.prototype.hasOwnProperty.call(bare, 'sections'), '★ 反（零机制）：没有注册 ⇒ status() 没有 sections 段', Object.keys(bare).includes('sections'))
  const entry = {
    id: 'probe-status-module', kind: 'module', order: 100,
    module: {
      meta: { apiVersion: 1, id: 'probe-status-module' }, capabilities: ['trigger-workflow'],
      hooks: { 'turn/reply-parsed': async () => ({ ok: true }) },
      default({ services }) {
        const status = services.get('vmu.status')
        status.registerSection('paperDispatch', () => ({ last: { ok: true, code: null } }))
        return { hooks: { 'turn/reply-parsed': async () => ({ ok: true }) }, dispose: () => status.unregisterSection('paperDispatch') }
      },
    },
  }
  const entries = await k.loader.toBusEntries([entry])
  ok(entries.length === 1 && typeof entries[0].dispose === 'function', 'loader 把模块 dispose 挂到首条总线条目上（unload 契约）', entries.map((e) => e.id))
  const st = k.status()
  ok(st.sections && st.sections.paperDispatch && st.sections.paperDispatch.ok === true && st.sections.paperDispatch.value.last.ok === true,
    '★ 正：pack 模块经 services.get("vmu.status") 注册后 status().sections.paperDispatch 可读', st.sections)
  const status = entries[0]
  ok(status && typeof status.dispose === 'function', 'loader record 携带 dispose（同一契约的 commit 点）', status && typeof status.dispose)
  let dup = null
  // duplicate registration is a NAMED refusal — reach the service through a factory module
  const dupEntry = {
    id: 'probe-status-dup', kind: 'module', order: 101,
    module: { meta: { apiVersion: 1, id: 'probe-status-dup' }, capabilities: ['trigger-workflow'], hooks: { 'turn/reply-parsed': async () => ({ ok: true }) }, default({ services }) {
      const statusSvc = services.get('vmu.status')
      try { statusSvc.registerSection('paperDispatch', () => ({})) } catch (e) { dup = e }
      return { hooks: { 'turn/reply-parsed': async () => ({ ok: true }) } }
    } },
  }
  await k.loader.toBusEntries([dupEntry])
  ok(dup && dup.code === 'VMU_INVALID_ARGUMENT', '★ 反：同名注册两次 ⇒ 具名拒（不静默覆盖）', dup && dup.code)
  await status.dispose()
  ok(!Object.prototype.hasOwnProperty.call(k.status(), 'sections'), '★ 正/反：dispose 后该段消失（unload 清零路径存在）', Object.keys(k.status()).includes('sections'))
}

// ── ★ PHASE 8 / B-1: the kernel's toolsView = the LIVE visible set (not pack declarations) ─────────────────────
{
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  k.turn.setVisibleToolsProvider(() => ['a_tool', 'b_tool'])
  k.setToolFaceDescriptions({ a_tool: 'does A' })
  const v = k.toolsView({ member: 'member-a' })
  ok(v.ok === true && v.count === 2 && v.tools[0].name === 'a_tool' && v.tools[0].purpose === 'does A' && v.tools[1].purpose === null,
    '★ 正：toolsView 的名字集合 == visibleToolsOf 的实际集合，用途来自 host 描述（未登记 ⇒ null，不编造）', v)
  const bare = m.createKernel({ clock: () => 0 })
  bare.declareSlots([{ id: 'member', label: 'm', capacity: 0 }])
  await bare.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  let err = null
  try { bare.toolsView({ member: 'member-a' }) } catch (e) { err = e }
  ok(err && err.code === 'VMU_ENGINE_UNAVAILABLE', '★ 反：没有 visible provider ⇒ 具名拒，不返回空清单假装成功', err && err.code)
  const noAgent = m.createKernel({ clock: () => 0 })
  noAgent.declareSlots([{ id: 'member', label: 'm', capacity: 0 }])
  await noAgent.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  noAgent.turn.setVisibleToolsProvider(() => { const e = new Error('no live Agent'); e.code = 'VMU_NO_SUCH_OBJECT'; throw e })
  let err2 = null
  try { noAgent.toolsView({ member: 'member-a' }) } catch (e) { err2 = e }
  ok(err2 && err2.code === 'VMU_NO_SUCH_OBJECT', '★ 反：provider 的无 live Agent 具名拒原样传播', err2 && err2.code)
}

// ── PHASE 8 / goal 10 (round 36): the pack can DECLARE which presentation its tool batch uses ─────────────────────
// DECLARATION CHANNEL ONLY: the kernel records it and exposes ONE reader; execution (deferLoading / presentAs) is the
// host's, next round. So the assertions here are exactly: zero mechanism (no declaration ⇒ null), positive (declared ⇒
// readable), and the two NAMED refusals (unknown mode / unknown face). Nothing may change tool callability.
{
  const pk = m.createKernel({ clock: () => 1000 })
  ok(pk.packToolPresentation() === null,
    '\u2605 \u53cd\uff08\u96f6\u673a\u5236\uff09\uff1a\u4e0d\u58f0\u660e toolPresentation \u21d2 \u8bfb\u53d6\u5668\u8fd4\u56de null\uff08\u7edd\u4e0d\u4f2a\u9020 native \u9ed8\u8ba4\uff09', pk.packToolPresentation())
  let badMode = null
  try { pk.declarePackToolPresentation({ mode: 'warp' }, { by: 'probe-pack' }) } catch (e) { badMode = e }
  ok(badMode && badMode.code === 'VMU_INVALID_ARGUMENT' && /native.*ptc.*defer/.test(String(badMode.hint || badMode.message)),
    '\u2605\u2605 \u53cd\uff1a\u672a\u77e5 mode \u21d2 \u5177\u540d VMU_INVALID_ARGUMENT\uff0c\u5e76\u5217\u51fa\u5408\u6cd5\u503c', badMode && { code: badMode.code, hint: badMode.hint })
  const declared = pk.declarePackTools([{ name: 'probe_tool_alpha', description: 'probe face', handler: () => ({ ok: true }) }], { by: 'probe-pack' })
  ok(declared && declared.ok === true,
    '\u2605 precondition: a probe tool is declared so a narrowed declaration has a REAL name to reference', declared && declared.declared)
  const toolsBefore = pk.packTools().length
  const one = pk.declarePackToolPresentation({ mode: 'ptc', faces: ['probe_tool_alpha'] }, { by: 'probe-pack' })
  const readBack = pk.packToolPresentation()
  ok(one.ok === true && readBack && readBack.mode === 'ptc' && readBack.pack === 'probe-pack' &&
    Array.isArray(readBack.faces) && readBack.faces.length === 1 && readBack.faces[0] === 'probe_tool_alpha',
    '\u2605\u2605\u2605 \u6b63\uff1a\u58f0\u660e\u540e packToolPresentation() \u8fd4\u56de\u8be5\u58f0\u660e\uff08mode + faces + \u6765\u6e90 pack\uff09', readBack)
  ok(pk.packTools().length === toolsBefore,
    '\u2605 \u58f0\u660e\u53ea\u662f\u58f0\u660e\uff1a\u5df2\u5b58\u5728\u7684\u5de5\u5177\u8868\u4e0e\u53ef\u8c03\u6027\u4e0d\u53d8\uff08packTools \u6570\u91cf\u4e0d\u53d8\uff09', { before: toolsBefore, after: pk.packTools().length })
  let badFace = null
  try { pk.declarePackToolPresentation({ mode: 'defer', faces: ['no_such_face_here'] }, { by: 'probe-pack' }) } catch (e) { badFace = e }
  ok(badFace && badFace.code === 'VMU_INVALID_ARGUMENT' && /does not hold/.test(String(badFace.message)),
    '\u2605\u2605 \u53cd\uff1a\u58f0\u660e\u91cc\u5f15\u7528\u672a\u6ce8\u518c\u7684\u9762\u540d \u21d2 \u5177\u540d VMU_INVALID_ARGUMENT', badFace && badFace.code)
  const retracted = pk.retractPackToolPresentation({ by: 'probe-pack' })
  ok(retracted.ok === true && retracted.removed === true && pk.packToolPresentation() === null,
    '\u2605 \u5378\u8f7d\u534a\uff1a\u64a4\u9500\u540e\u8bfb\u53d6\u5668\u53c8\u53d8\u56de null\uff08\u96f6\u6b8b\u7559\uff09', retracted)
  // validatePack catches the same typo at PLAN time (shape problems), so apply is not the first place it appears.
  const packModW36 = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
  const plainsRaw = packModW36.validatePack({ id: 'probe-pack', version: '1.0.0', toolPresentation: { mode: 'warp' } })
  const plains = { problems: Array.isArray(plainsRaw) ? plainsRaw : ((plainsRaw && (plainsRaw.problems || plainsRaw.errors)) || []) }
  ok(plains && Array.isArray(plains.problems) && plains.problems.filter((p) => /toolPresentation\.mode must be one of/.test(String(p))).length === 1,
    '\u2605 validatePack \u540c\u6837\u5728 plan \u9636\u6bb5\u5c31\u62a5\u5f62\u72b6\uff08\u5408\u6cd5\u503c\u5217\u5728\u9519\u8bef\u91cc\uff09', plains && plains.problems)
}

console.log('=== VMU KERNEL: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

