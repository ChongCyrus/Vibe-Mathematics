// tests/vmu-notify-tool.test.mjs - the four acceptance criteria, with both failure shapes.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.notify)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, notifyTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.notify), 'and declaring the notification intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { notifyTool: true })
ok(!!spec, 'the notification tool has a spec')
const ACTIONS = ['watch', 'unwatch', 'emit', 'flush', 'list', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.notify).filter((n) => typeof k.notify[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    watch: async (a) => { calls.push('watch'); return { ok: true, watcher: a.subject } },
    unwatch: async (a) => { calls.push('unwatch'); return { ok: true, id: a.id } },
    emit: async (a) => { calls.push('emit'); return { ok: true, event: a.event } },
    flush: async () => { calls.push('flush'); return { ok: true, delivered: 2 } },
    list: async () => { calls.push('list'); return { ok: true, watchers: [] } },
    status: async () => { calls.push('status'); return { ok: true, defaultOff: true } },
  }
  const s = specOf({ notify: spy }, { notifyTool: true })
  const r1 = await s.run({ action: 'watch', subject: 'm1' })
  const r2 = await s.run({ action: 'unwatch', id: 'w-1' })
  const r3 = await s.run({ action: 'emit', event: 'task.assigned' })
  const r4 = await s.run({ action: 'flush' })
  await s.run({ action: 'list' })
  await s.run({ action: 'status' })
  ok(calls.join(',') === 'watch,unwatch,emit,flush,list,status',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.watcher === 'm1' && r2.id === 'w-1' && r3.event === 'task.assigned' && r4.delivered === 2,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r3, r4 })
}

console.log('=== 4. NAMED REFUSALS AND THE DEFAULT-OFF STATE ===')
{
  const s = specOf(k, { notifyTool: true })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && st.defaultOff === true && st.enabled === false,
    'against the real kernel the status says the face is OFF by default, so a caller cannot mistake silence for delivery', { st })
  const w = await s.run({ action: 'watch' })
  ok(w.ok === false && w.code === 'VMU_INVALID_ARGUMENT' && /needs a subject/.test(w.message),
    'and watching without a subject is refused by the service, by name', { w })
  ok(typeof w.hint === 'string' && w.hint.includes('events'),
    'with a hint that shows the fuller call shape, which is what makes the refusal actionable', { w })
  const e = await s.run({ action: 'emit' })
  ok(e.ok === false && /needs an event name/.test(String(e.message)), 'and emitting without an event name is refused too', { e })

  const sync = specOf({ notify: { watch: async () => ({}), unwatch: async () => ({}), emit: async () => ({}), flush: async () => ({}), list: async () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, status: async () => ({}) } }, { notifyTool: true })
  const a = await sync.run({ action: 'list' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { watch: async () => ({}), unwatch: async () => ({}), emit: async () => { const e2 = new Error('the channel is closed'); e2.code = 'VMU_ASYNC_NO'; e2.hint = 'open it'; throw e2 }, flush: async () => ({}), list: async () => ({}), status: async () => ({}) }
  const s2 = specOf({ notify: asyncSpy }, { notifyTool: true })
  const b = await s2.run({ action: 'emit', event: 'x' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== NOTIFY TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
