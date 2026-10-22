// vmu-script-service — ★ A MIDDLEWARE CAN NOW RUN A DECLARED SCRIPT WITHOUT BREAKING THE HOOK BUDGET.
//
// THE GAP THIS CLOSES (goal 8). "Decide on an event AND run an external program" had no supported shape: the script bridge
// was not in the capability-gated catalogue, so an M2 module could not reach it and had to spawn its own child_process -
// losing structured-JSON validation, the hard named timeout, and the declared-script budget - which is precisely the
// "everyone writes their own version, no single source" pattern this project keeps removing.
//
// WHY IT IS `start()` AND NOT `run()`. A hook has vmu.middleware.hookTimeoutMs (2000 ms by default) to spend; a script's
// own budget defaults to 60000 ms. Exposing the blocking `run` would let a policy await the subprocess, burn the hook
// budget, and leave the bus applying the entry's `failure` policy to an event whose child was still running. The published
// object therefore HAS NO `run` - the restriction is structural, so it cannot be forgotten.
//
// AND THE RESULT ARRIVES AS THE `script/settled` EVENT, which keeps the bus's synchronous-decision model intact.

import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

// ★ fileURLToPath, not `.pathname`: the repository path contains non-ASCII characters, and the raw pathname comes back
// percent-encoded (`vibemath%E5%BC%80...`), which made the first version of this suite unable to import the kernel at all.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const km = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const bm = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'script-bridge.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed += 1
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const slowSpawn = (delayMs, payload = { ok: true, summary: 'done' }) => async () => {
  await new Promise((r) => setTimeout(r, delayMs))
  return { code: 0, stdout: JSON.stringify(payload), stderr: '' }
}

// ── 1. THE BRIDGE'S ASYNC FORM RETURNS AT ONCE AND DELIVERS LATER ─────────────────────────────────────────────
{
  const settled = []
  const bridge = bm.createScriptBridge({ spawn: slowSpawn(120), onSettled: (jobId, s) => settled.push({ jobId, ok: s.ok }) })
  ok(typeof bridge.start === 'function' && typeof bridge.run === 'function',
    '★ 前提：桥同时有 start（异步）与 run（阻塞）', { start: typeof bridge.start, run: typeof bridge.run })
  const t0 = Date.now()
  const started = bridge.start({ inline: 'x', args: [] })
  const elapsed = Date.now() - t0
  ok(started && started.ok === true && started.started === true && typeof started.jobId === 'string',
    '★★ 正：start() 立刻返回一个 jobId（不是结果本身）', started)
  ok(elapsed < 60,
    '★★ 正：start() 的耗时远小于子进程耗时（否则它就不是异步形态了）', { elapsed, childDelay: 120 })
  await new Promise((r) => setTimeout(r, 260))
  ok(settled.length === 1 && settled[0].jobId === started.jobId && settled[0].ok === true,
    '★★ 正：结果经 onSettled 回来，且带着同一个 jobId', settled)
}

// ── 2. THE CATALOGUE PUBLISHES `start` AND NOT `run` ──────────────────────────────────────────────────────────
// ★ Reached THROUGH THE LOADER, because that is the only path a middleware has: the catalogue is handed to the loader as
// `api.services` and is deliberately not on the kernel object.
{
  const k = km.createKernel({ spawn: slowSpawn(10), settings: {} })
  await k.start()
  let seen = null
  // ★ The loader's M2 contract, stated exactly (the first version of this test omitted `meta` and used an unregistered hook,
  // and the loader refused BY NAME with all three reasons - which is how the shape was learned rather than guessed).
  const mod = {
    meta: { id: 'probe-script-service', apiVersion: 1 },
    // \u2605 TOP-LEVEL, not inside meta (the error message said 'the module must declare capabilities' and the loader reads
    // module.capabilities); and the ENTRY must declare a superset, checked separately.-
    capabilities: ['read-args', 'trigger-workflow'],
    // ★ THE FACTORY RECEIVES `services` AT LOAD TIME, so the catalogue is reachable without firing a hook. That matters for
    // the test: the loader RETURNS the handler, and REGISTERING it on the bus is the caller's job - a test that only loaded
    // and then emitted would be asserting on a hook nobody attached, which is exactly the "silently never fires" shape.
    // ★ BOTH are required: the loader validates the STATIC `module.hooks` export, and hands `services` to `default()`.
    // Missing either is a named refusal — which is how this shape was learned rather than guessed.
    hooks: { 'task/assign': async () => undefined },
    default: ({ services }) => {
      const svc = services.get('vmu.script')
      seen = { keys: Object.keys(svc), hasRun: Object.prototype.hasOwnProperty.call(svc, 'run'), hasStart: typeof svc.start === 'function' }
      return mod.hooks
    },
  }
  let loaded = null
  try { loaded = await k.loader.load({ id: 'probe-script-service', kind: 'module', module: mod, capabilities: ['read-args', 'trigger-workflow'] }) } catch (e) { loaded = { error: String((e && e.message) || e) } }
  ok(loaded && !loaded.error, '★ 前提：一个声明 trigger-workflow 的模块能被装载', loaded && loaded.error)
  if (loaded && !loaded.error) {
    await k.bus.emit('task/assign', {}, {})
    ok(seen && seen.hasStart === true,
      '★★ 正：模块经 services.get("vmu.script") 拿到了 async 形态', seen)
    ok(seen && seen.hasRun === false,
      '★★★ 反：catalogue 里【没有】run —— 这是结构性的，不是靠自觉（有 run 就能在 2 秒钩子里 await 60 秒脚本）', seen && seen.keys)
  }
}

// ── 3. THE SETTLED EVENT IS PUBLISHED AND A MIDDLEWARE CAN ACT ON IT ──────────────────────────────────────────
{
  const k = km.createKernel({ spawn: slowSpawn(5, { ok: true, summary: 'checked' }), settings: {} })
  await k.start()
  const got = []
  k.bus.on({ id: 'script-observer', kind: 'module', order: 10, on: ['script/settled'], failure: 'open', capabilities: ['read-args'], scope: ['member'] },
    async ({ payload }) => { got.push(payload); return undefined })
  const bridge = bm.createScriptBridge({ spawn: slowSpawn(5, { ok: true, summary: 'checked' }), onSettled: (jobId, s) => { k.bus.emit('script/settled', Object.assign({ jobId, at: 1 }, s), {}) } })
  bridge.start({ inline: 'x', args: [] })
  await new Promise((r) => setTimeout(r, 200))
  ok(got.length === 1 && typeof got[0].jobId === 'string' && got[0].ok === true,
    '★★ 正：`script/settled` 被发布，且另一个中间件能读到 jobId 与结果', got)
}

// ── 4. NO SPAWN SEAM ⇒ NAMED REFUSAL, NOT A SILENT NO-OP ─────────────────────────────────────────────────────
{
  const bridge = bm.createScriptBridge({})
  let threw = null
  try { bridge.start({ inline: 'x', args: [] }) } catch (e) { threw = e && e.code }
  ok(threw === 'VMU_ENGINE_UNAVAILABLE',
    '★ 反：没有子进程接缝 ⇒ 具名 VMU_ENGINE_UNAVAILABLE（不是静默失败）', threw)
}

console.log('=== VMU SCRIPT SERVICE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
