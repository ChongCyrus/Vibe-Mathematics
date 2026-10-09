// vmu host hooks — the capability scenario for host-hooks.js (docs/05 §4, docs/11 §9).
//
// The scenario is the mapping between the vmu bus and the host's REAL hook contract (recon §3.1):
//   · with nothing declared, NO listener is registered (zero mechanism, host side);
//   · an M1 deny rule on `tools/pre-execute` makes the wrapper return `{ kind: 'deny', reason }`, and the
//     reason carries the rule's code and message (that is what the model sees);
//   · `cancel` and `ask` map to their host kinds; abstaining DELEGATES with `await next()`;
//   · `rewriteArgs` on pre-execute is REFUSED AND NAMED (the host excludes input rewriting) instead of
//     being silently dropped;
//   · post-execute maps `replaceResult` to `{kind:'accept', value}` and a block to `{kind:'block', feedback}`;
//   · every registration goes through `ctx.effect(..., 'vmu:hook:<name>')`.
//
// `--self-probe` copies the module, removes the "only declared hooks are attached" filter and requires the
// zero-mechanism assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'host-hooks.js')
const KERNEL = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
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

const hm = await import(pathToFileURL(MODULE).href)
const km = await import(pathToFileURL(KERNEL).href)
const clock = () => '2026-10-09T00:00:00.000Z'

const fakeCtx = () => {
  const state = { listeners: {}, effects: [] }
  return {
    state,
    ctx: {
      effect(fn, label) { state.effects.push(label); return fn() },
      on(event, handler) { (state.listeners[event] = state.listeners[event] || []).push(handler); return () => { state.listeners[event] = state.listeners[event].filter((h) => h !== handler) } },
    },
  }
}
const denyRule = (id = 'gate') => ({ id, kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'only locked objects may be voted on' } }] })

// ---- 1. ZERO MECHANISM: nothing declared ⇒ no listener at all ---------------------------------
{
  const kernel = km.createKernel({ clock })
  const host = fakeCtx()
  const bridge = hm.attachHostHooks({ ctx: host.ctx, kernel, settings: {} })
  ok(bridge.plan().count === 0, 'with nothing declared the bridge plans NO hooks')
  const res = bridge.attach()
  ok(res.attached.length === 0 && Object.keys(host.state.listeners).length === 0 && host.state.effects.length === 0,
    'and it registers no listener and no effect (inert means invisible)')
  await expectThrow(() => hm.attachHostHooks({ ctx: {}, kernel, settings: { 'vmu.middleware.entries': [denyRule()] } }).attach(),
    'VMU_ENGINE_UNAVAILABLE', 'a context without ctx.on is refused by name (never invented)')
}

// ---- 2. a declared M1 rule FIRES on the real host hook -----------------------------------------
{
  const settings = { 'vmu.middleware.entries': [denyRule()] }
  const kernel = km.createKernel({ clock, settings })
  await kernel.start()
  const host = fakeCtx()
  const bridge = hm.attachHostHooks({ ctx: host.ctx, kernel, settings })
  const res = bridge.attach()
  ok(res.attached.join(',') === 'tools/pre-execute', 'the declared host hook is bridged', res.attached.join(','))
  ok(host.state.effects.join(',') === 'vmu:hook:tools/pre-execute', 'the registration went through ctx.effect with its label', host.state.effects.join(','))
  const listener = host.state.listeners['tools/pre-execute'][0]
  let delegated = false
  const deny = await listener({ name: 'vibe_v5_poll_vote', args: {} }, async () => { delegated = true; return { kind: 'allow' } })
  ok(deny && deny.kind === 'deny' && /VMU_NOT_PERMITTED/.test(deny.reason) && /locked objects/.test(deny.reason),
    'the M1 rule denies through the REAL host hook, with code and message in the reason', JSON.stringify(deny))
  ok(delegated === false, 'a denying wrapper does NOT delegate to next()')
  const allow = await listener({ name: 'math_computation', args: {} }, async () => { delegated = true; return { kind: 'allow' } })
  ok(delegated === true && allow.kind === 'allow', 'abstaining delegates: the host decision is returned unchanged', JSON.stringify(allow))
}

// ---- 3. cancel / ask map, and unsupported rewriting is REFUSED AND NAMED ------------------------
{
  const mkBridge = async (thenAction) => {
    const settings = { 'vmu.middleware.entries': [{ id: 'm', kind: 'rules', on: ['tools/pre-execute'], when: {}, then: [thenAction] }] }
    const kernel = km.createKernel({ clock, settings })
    await kernel.start()
    const host = fakeCtx()
    const bridge = hm.attachHostHooks({ ctx: host.ctx, kernel, settings })
    bridge.attach()
    return { listener: host.state.listeners['tools/pre-execute'][0], bridge }
  }
  const cancelled = await mkBridge({ cancel: { reason: 'internal short circuit' } })
  const c = await cancelled.listener({ name: 'x' }, async () => ({ kind: 'allow' }))
  ok(c.kind === 'cancel', 'cancel maps to the host cancel decision', JSON.stringify(c))
  const asked = await mkBridge({ ask: { reason: 'needs approval' } })
  const a = await asked.listener({ name: 'x' }, async () => ({ kind: 'allow' }))
  ok(a.kind === 'ask' && /needs approval/.test(a.reason), 'ask maps to the host ask decision', JSON.stringify(a))
  const rewrite = await mkBridge({ rewriteArgs: { args: { safe: true } } })
  const r = await rewrite.listener({ name: 'x' }, async () => ({ kind: 'allow' }))
  ok(r.kind === 'deny' && /excludes input rewriting/.test(r.reason),
    'rewriteArgs on pre-execute is REFUSED AND NAMED (the host excludes input rewriting)', JSON.stringify(r))
  ok(rewrite.bridge.status().refusedUnsupported.length === 1, 'and the unsupported request is recorded for observability')
}

// ---- 4. post-execute mapping -------------------------------------------------------------------
{
  const settings = { 'vmu.middleware.entries': [{ id: 'p', kind: 'rules', on: ['tools/post-execute'], when: {}, then: [{ replaceResult: { value: { replaced: true } } }] }] }
  const kernel = km.createKernel({ clock, settings })
  await kernel.start()
  const host = fakeCtx()
  hm.attachHostHooks({ ctx: host.ctx, kernel, settings }).attach()
  const listener = host.state.listeners['tools/post-execute'][0]
  const accepted = await listener({ name: 'x' }, { ok: true }, async () => ({ kind: 'accept' }))
  ok(accepted.kind === 'accept' && accepted.value && accepted.value.replaced === true,
    'replaceResult maps to the host accept-with-value decision', JSON.stringify(accepted))
  const blocked = await listener({ name: 'vibe_v5_poll_vote' }, { ok: true }, async () => ({ kind: 'accept' }))
  ok(blocked.kind === 'accept', 'a rule whose tool clause does not match abstains and delegates', JSON.stringify(blocked))
}

// ---- 5. observation-only hooks always continue the waterfall -----------------------------------
{
  const settings = { 'vmu.middleware.entries': [{ id: 'obs', kind: 'rules', on: ['session/event'], when: {}, then: [{ record: { track: 'progress' } }] }] }
  const kernel = km.createKernel({ clock, settings })
  await kernel.start()
  const host = fakeCtx()
  const bridge = hm.attachHostHooks({ ctx: host.ctx, kernel, settings })
  bridge.attach()
  let delegated = false
  const out = await host.state.listeners['session/event'][0]({ type: 'x' }, async () => { delegated = true; return 'next-value' })
  ok(delegated === true && out === 'next-value', 'an observation-only hook always continues the waterfall', String(out))
  const detach = bridge.detach()
  ok(detach.ok === true && Object.values(host.state.listeners).every((list) => list.length === 0),
    'detach removes every listener', JSON.stringify(Object.entries(host.state.listeners).map(([k, v]) => k + ':' + v.length)))
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      for (const h of [].concat(e.on || [])) if (BRIDGED_HOOKS.includes(h)) hooks.add(h)"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the declared-hook filter is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-hooks-mut-'))
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
    await writeFile(join(dir, 'host-hooks.js'), src
      .replace('const declaredHooks = () => {', "const declaredHooks = () => { return ['tools/pre-execute']")
      .replace('const entries = Array.isArray(settings[\'vmu.middleware.entries\']) ? settings[\'vmu.middleware.entries\'] : []', 'const entries = [{}]'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'host-hooks.js')).href + '?probe=1')
    const kk = await import(pathToFileURL(join(dir, 'kernel', 'index.js')).href + '?probe=1')
    const kernel = kk.createKernel({ clock })
    const host = fakeCtx()
    const bridge = mm.attachHostHooks({ ctx: host.ctx, kernel, settings: {} })
    // With the filter removed the bridge attaches hooks although nothing was declared: assertion must fail.
    ok(bridge.plan().count === 0, 'self-probe: filter removed => the zero-mechanism assertion fails (as required)', JSON.stringify(bridge.plan()))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU HOST HOOKS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU HOST HOOKS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
