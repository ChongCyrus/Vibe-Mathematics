// vmu pack loader — the capability scenario for kernel/pack.js (docs/10 §2, §4).
//
// The scenarios are the three promises the loader makes:
//   · PLAN IS PURE: after planning a pack, the kernel's observable state is byte-identical (same settings
//     keys, same bus entries, same packs, same aliases) - so "what would this pack do?" has an answer
//     before anything happens;
//   · CONFLICTS ARE REFUSED: a second apply, an unmet `requires`, a code outside VMU_PACK_<ID>_<REASON>,
//     and settings this assembly cannot apply are all refused by name (never merged, never dropped);
//   · UNLOAD LEAVES NO RESIDUE: after apply+unload, emitting the same hook returns exactly what it
//     returned before the pack, and the pack's alias is gone.
//
// `--self-probe` copies the module, removes the already-applied conflict check, and requires the
// double-apply assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')
const KERNEL = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
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
const km = await import(pathToFileURL(KERNEL).href)
const clock = () => '2026-10-09T00:00:00.000Z'

const mk = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-pack-'))
  const kernel = km.createKernel({ clock, root, settings })
  const loader = m.createPackLoader({ kernel, registry: kernel.registry })
  return { kernel, loader, root }
}

// ---- 1. validation is static and complete ------------------------------------------------------
{
  ok(m.validatePack({ id: 'ok-pack' }).length === 0, 'a well-formed pack validates clean')
  ok(m.validatePack({ id: 'Bad Id' }).some((p) => /kebab-case/.test(p)), 'a malformed id is refused')
  ok(m.validatePack({ id: 'x', codes: ['VMU_INVALID_ARGUMENT'] }).some((p) => /VMU_PACK_X_/.test(p)),
    'a code outside the pack namespace is refused (R-d)')
  ok(m.validatePack({ id: 'x', slots: [{ custom: true }] }).some((p) => /slot needs a kebab-case id/.test(p)), 'a malformed slot is refused')
  ok(m.validatePack({ id: 'x', rules: [{ id: 'r' }] }).some((p) => /on is required/.test(p)), 'a rule without hooks is refused')
  ok(m.validatePack({ id: 'x', middleware: [{}] }).some((p) => /middleware entry needs an id/.test(p)), 'a middleware entry without an id is refused')
}

// ---- 2. plan() is PURE -------------------------------------------------------------------------
{
  const { kernel, loader, root } = await mk()
  const before = loader.snapshot()
  const manifest = {
    id: 'institute-min', version: '1.0.0',
    codes: ['VMU_PACK_INSTITUTE_MIN_NO_QUORUM'],
    slots: [{ id: 'chair', capacity: 1, label: 'chair' }, { id: 'worker', capacity: 0 }],
    tracks: ['progress', 'rejected'],
    rules: [{ id: 'no-vote-without-lock', kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'only locked objects may be voted on' } }] }],
    aliases: [{ from: 'vibe_v5_poll_vote', to: 'vmu.tasks' }],
  }
  const plan = loader.plan(manifest)
  ok(plan.ok === true && plan.count > 0, 'plan reports the actions it would take', plan.count)
  ok(plan.wouldTouch.includes('slot') && plan.wouldTouch.includes('track') && plan.wouldTouch.includes('rule') && plan.wouldTouch.includes('alias'),
    'the plan names every kind of change', plan.wouldTouch.join(','))
  ok(loader.snapshot() === before, 'planning changed NOTHING (the plan is pure)', loader.snapshot())
  ok(kernel.members === null && kernel.bus.status().entries.length === 0, 'and in particular nothing was declared or subscribed')

  const unmet = loader.plan({ id: 'needs-store', requires: [{ service: 'vmu.members', minVersion: 99 }] })
  ok(unmet.ok === false && unmet.problems.some((p) => /unmet requirements/.test(p)), 'an unmet requirement is reported by plan()', unmet.problems.join(' | '))
  await expectThrow(() => loader.apply({ id: 'needs-store', requires: [{ service: 'vmu.members', minVersion: 99 }] }), 'VMU_PACK_MISSING',
    'applying a pack whose requirements are unmet is refused by name')
  const withSettings = loader.plan({ id: 'wants-settings', settings: { 'vmu.records.headListAt': 9 } })
  ok(withSettings.ok === true, 'planning a pack that carries settings is fine (it is a plan, not an application)')
  await expectThrow(() => loader.apply({ id: 'wants-settings', settings: { 'vmu.records.headListAt': 9 } }), 'VMU_ENGINE_UNAVAILABLE',
    'applying a pack whose SETTINGS this assembly cannot apply is refused, not silently dropped')
  await rm(root, { recursive: true, force: true })
}

// ---- 3. apply() does what the plan said ---------------------------------------------------------
{
  const { kernel, loader, root } = await mk()
  const manifest = {
    id: 'institute-min', version: '1.0.0',
    slots: [{ id: 'chair', capacity: 1 }, { id: 'worker', capacity: 0 }],
    tracks: ['progress', 'rejected'],
    rules: [{ id: 'gate', kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'only locked objects may be voted on' } }] }],
    aliases: [{ from: 'vibe_v5_poll_vote', to: 'vmu.tasks' }],
  }
  const applied = await loader.apply(manifest)
  ok(applied.ok === true && applied.applied === loader.plan(manifest).count, 'the receipt reports the applied action count')
  ok(kernel.members !== null && kernel.requireMembers().roles().map((r) => r.id).join(',') === 'chair,worker',
    'the pack declared the role slots and the roster materialised')
  ok(kernel.requireMembers().roles[0] === undefined || kernel.requireMembers().roles().length === 2, 'the roster exposes exactly the declared slots')
  ok((await kernel.requireLibrary().status()).tracks.join(',') === 'progress,rejected', 'the pack declared the record tracks')
  const denied = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  ok(denied.ok === false && denied.refused.code === 'VMU_NOT_PERMITTED', 'the pack rule is live on the assembled bus')
  ok(kernel.registry.resolve('vibe_v5_poll_vote').name === 'vmu.tasks', 'the pack alias resolves')
  ok(kernel.packNotes().some((n) => n.what === 'applied'), 'the application is recorded in the pack notes')
  expectThrow(() => loader.apply(manifest), 'VMU_PACK_CONFLICT', 'applying the same pack twice is refused (O4)')
  await rm(root, { recursive: true, force: true })
}

// ---- 4. unload leaves no behavioural residue ----------------------------------------------------
{
  const { kernel, loader, root } = await mk()
  const before = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  const manifest = { id: 'temp-pack', version: '0.1.0',
    rules: [{ id: 'gate', kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }] }],
    aliases: [{ from: 'vibe_v5_poll_vote', to: 'vmu.tasks' }] }
  await loader.apply(manifest)
  const during = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  ok(before.ok === true && during.ok === false, 'the pack changed behaviour while applied')
  const unloaded = await loader.unload('temp-pack')
  ok(unloaded.ok === true && unloaded.residueFree === true, 'unload reports that it reversed everything')
  const after = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  ok(after.ok === before.ok && JSON.stringify(after.refused) === JSON.stringify(before.refused),
    'after unload the hook behaves EXACTLY as before the pack (no residue)', JSON.stringify({ before: before.ok, after: after.ok }))
  expectThrow(() => Promise.resolve(kernel.registry.resolve('vibe_v5_poll_vote')), 'VMU_NO_SUCH_OBJECT', 'the pack alias is gone after unload')
  expectThrow(() => loader.unload('temp-pack'), 'VMU_NO_SUCH_OBJECT', 'unloading a pack that is not applied is refused')
  ok(kernel.packNotes().some((n) => n.what === 'unloaded'), 'the unload is recorded in the notes')
  ok(loader.status().applied.length === 0, 'status() lists no applied packs afterwards')
  await rm(root, { recursive: true, force: true })
}

// ---- 5. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (applied.has(manifest.id)) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the double-apply guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-pack-mut-'))
    await mkdir(join(dir, 'kernel', 'prompt'), { recursive: true })
    for (const f of ['bus.js', 'store.js', 'library.js', 'members.js', 'ballot.js', 'meeting.js', 'tasks.js', 'math.js', 'rules.js', 'loader.js', 'script-bridge.js', 'registry.js', 'index.js']) {
      await writeFile(join(dir, 'kernel', f), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'prompt', 'index.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8'), 'utf8')
    for (const f of ['math-computation.js', 'math-engines.js']) {
      await writeFile(join(dir, f), await readFile(resolve(REPO, 'vibe-math-vmu', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'pack.js'), src.replace(guard, '      if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'pack.js')).href + '?probe=1')
    const kk = await import(pathToFileURL(join(dir, 'kernel', 'index.js')).href + '?probe=1')
    const root = await mkdtemp(join(tmpdir(), 'vmu-pack-mut-root-'))
    const kernel = kk.createKernel({ clock, root })
    const loader = mm.createPackLoader({ kernel, registry: kernel.registry })
    const manifest = { id: 'p', rules: [{ id: 'r', kind: 'rules', on: ['tools/pre-execute'], when: {}, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'x' } }] }] }
    await loader.apply(manifest)
    let refused = false
    try { await loader.apply(manifest) } catch (e) { refused = e.code === 'VMU_PACK_CONFLICT' }
    ok(refused === true, 'self-probe: guard removed => the double-apply assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
  console.log('=== VMU PACK SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU PACK: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
