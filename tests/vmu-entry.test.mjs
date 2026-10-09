// vmu preset entry — the capability scenario for vibe-math-vmu.js (docs/03 §1, docs/11 §9).
//
// The entry point is where the design meets a real host, so the scenarios cover the host-visible promise,
// the host's lifecycle contract, and the shape the REAL host accepted (execute + JSON string + content-part
// render, learned from the first scripted live run and from this repo's working preset):
//   · the module loads under PLAIN NODE (no host import at all) - which is why it declares no `Config`;
//   · with no configuration it registers exactly ONE tool (`vibe_vmu_status`) and injects no prompt;
//   · with `vmu.core.enabled=false` it registers NOTHING;
//   · every registration goes through `ctx.effect(fn, label)` (labels are observable), and the host owns
//     the unwind;
//   · a prompt section is injected ONLY when the configuration declares one;
//   · declared middleware is ACTIVATED (kernel.start()) and an undeclared setting key is still refused.
//
// `--self-probe` copies the entry, removes the "prompt only when declared" condition and requires the
// zero-prompt assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const ENTRY = resolve(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const entry = await import(pathToFileURL(ENTRY).href)
const clock = () => '2026-10-09T00:00:00.000Z'

const fakeCtx = (extra = {}) => {
  const state = { specs: [], disposed: 0, effects: [], sections: [] }
  return {
    state,
    ctx: Object.assign({
      effect(fn, label) { state.effects.push(label); return fn() },
      tools: { register: async (spec) => { state.specs.push(spec); return () => { state.disposed++ } } },
    }, extra),
  }
}
const call = async (spec, args = {}) => JSON.parse(await spec.execute(args, {}))

// ---- 1. the entry loads under plain Node and declares the documented shape ---------------------
{
  ok(entry.name === 'vibe-math-vmu', 'the entry declares its name')
  ok(Number.isInteger(entry.apiVersion) && entry.apiVersion >= 1, 'the entry declares an api version')
  ok(Array.isArray(entry.inject) && entry.inject.includes('tools'), 'only the tool surface is REQUIRED (the rest is opportunistic)', JSON.stringify(entry.inject))
  ok(entry.Config === undefined, 'no Config export: the module must stay loadable without the host (no static Schemastery import)')
  ok(typeof entry.apply === 'function', 'the entry exposes apply(ctx, config)')
}

// ---- 2. ZERO MECHANISM IN THE HOST: no config ⇒ exactly one tool, no prompt ---------------------
{
  const host = fakeCtx()
  const handle = entry.apply(host.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  const names = host.state.specs.map((s) => s.name)
  ok(names.join(',') === 'vibe_vmu_status', 'with no configuration exactly ONE tool is registered (status)', names.join(','))
  ok(host.state.effects.includes('vmu:tools') && !host.state.effects.includes('vmu:prompt'),
    'the tools effect ran and NO prompt effect did', host.state.effects.join(','))
  ok(handle.kernel.status().registrations.length === 0, 'the assembled kernel registered no middleware')
  ok(handle.status().plan.count === 1, 'the adapter plan agrees with what was registered')
  const st = await call(host.state.specs[0])
  ok(st.ok === true && st.active === true && st.registrations.length === 0,
    'status reports a STARTED kernel that registered nothing (that is what zero mechanism means)',
    JSON.stringify({ active: st.active, registrations: st.registrations }))
}

// ---- 3. disabled ⇒ nothing at all ---------------------------------------------------------------
{
  const host = fakeCtx()
  entry.apply(host.ctx, { clock, vmu: { 'vmu.core.enabled': false } })
  await new Promise((r) => setTimeout(r, 0))
  ok(host.state.specs.length === 0 && host.state.effects.length === 0,
    'a disabled kernel registers NO tools in the host (inert means invisible)', host.state.specs.length)
}

// ---- 4. declared middleware and a declared root add their tools, and the rule is live -----------
{
  const rule = { id: 'gate', kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }] }
  const host = fakeCtx()
  const root = await mkdtemp(join(tmpdir(), 'vmu-entry-'))
  const handle = entry.apply(host.ctx, { clock, root, vmu: { 'vmu.middleware.entries': [rule], 'vmu.records.tracks': ['progress'] } })
  await new Promise((r) => setTimeout(r, 0))
  const names = host.state.specs.map((s) => s.name)
  ok(names.includes('vibe_vmu_middleware'), 'declared middleware adds the middleware tool', names.join(','))
  ok(names.includes('vibe_vmu_records'), 'a declared root adds the records tool', names.join(','))
  ok(names.includes('vibe_vmu_set'), 'the settings tool is present because the entry passes a declared-key guard')
  const denied = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  ok(denied.ok === false && denied.refused.code === 'VMU_NOT_PERMITTED', 'the declared M1 rule is live in the assembled kernel')
  const setTool = host.state.specs.find((s) => s.name === 'vibe_vmu_set')
  const bad = await call(setTool, { key: 'vmu.ghost.key', value: '1' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an undeclared setting key is still refused by name')
  const good = await call(setTool, { key: 'vmu.meetings.wakeRetries', value: '4' })
  ok(good.ok === true && good.value === 4, 'a declared setting can be changed through the tool')
  for (const cleanup of handle.cleanups) cleanup()
  ok(host.state.disposed === 0, 'with ctx.effect the host owns the unwind (our cleanup must not double-dispose)', host.state.disposed)

  // ---- 5. a prompt section ONLY when declared ---------------------------------------------------
  const quiet = fakeCtx({ systemPrompt: { section: () => () => {}, getSectionOrder: () => 5 } })
  entry.apply(quiet.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  ok(!quiet.state.effects.includes('vmu:prompt'), 'no prompt section is injected when none is declared', quiet.state.effects.join(','))
  const loud = fakeCtx({ systemPrompt: { section: (s) => { loud.state.sections.push(s); return () => {} }, getSectionOrder: () => 5 } })
  entry.apply(loud.ctx, { clock, prompt: 'vmu: only locked objects may be voted on' })
  ok(loud.state.sections.length === 1 && loud.state.sections[0].text.includes('locked objects'),
    'a declared prompt section IS injected, through the host service', JSON.stringify(loud.state.sections))
  await rm(root, { recursive: true, force: true })
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(ENTRY, 'utf8')
  const guard = "  if (typeof config.prompt === 'string' && config.prompt.length > 0 && ctx && ctx.systemPrompt &&"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the declared-prompt guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-entry-mut-'))
    await mkdir(join(dir, 'kernel', 'prompt'), { recursive: true })
    await mkdir(join(dir, 'settings'), { recursive: true })
    for (const f of ['bus.js', 'store.js', 'library.js', 'members.js', 'ballot.js', 'meeting.js', 'tasks.js', 'math.js', 'rules.js', 'loader.js', 'script-bridge.js', 'registry.js', 'index.js']) {
      await writeFile(join(dir, 'kernel', f), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'prompt', 'index.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'settings', 'schema.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js'), 'utf8'), 'utf8')
    for (const f of ['math-computation.js', 'math-engines.js']) {
      await writeFile(join(dir, f), await readFile(resolve(REPO, 'vibe-math-vmu', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'host.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'host.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'vibe-math-vmu.js'), src.replace(guard, '  if (true &&'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'vibe-math-vmu.js')).href + '?probe=1')
    const state = { effects: [], sections: [] }
    const ctx = { effect(fn, l) { state.effects.push(l); return fn() }, tools: { register: async () => () => {} },
      systemPrompt: { section: (s) => { state.sections.push(s); return () => {} }, getSectionOrder: () => 5 } }
    mm.apply(ctx, { clock })
    // With the guard removed a prompt section is injected although none was declared: the assertion fails.
    ok(!state.effects.includes('vmu:prompt'), 'self-probe: guard removed => the zero-prompt assertion fails (as required)', state.effects.join(','))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU ENTRY SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU ENTRY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
