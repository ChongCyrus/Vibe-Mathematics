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
  ok(Array.isArray(withSeam.lean.keysUsed()) && withSeam.lean.keysUsed().length === 8,
    'the face reads exactly the eight Lean keys', JSON.stringify(withSeam.lean.keysUsed()))
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
}

console.log('=== VMU KERNEL: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
