// tests/vmu-minutes-tool.test.mjs - the four acceptance criteria written BEFORE the code, now executed.
//   1. registration is CONDITIONAL: no kernel.minutes means no tool;
//   2. the action enum is COMPLETE and has no seventh entry;
//   3. the tool DELEGATES rather than reimplements - a spy service proves it CALLED the methods;
//   4. the service's own named refusals pass THROUGH unchanged.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.minutes)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without the declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, minutesTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.minutes),
    'and declaring the intent registers the minutes tool', { n: on.length, names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO EXTRA ENTRY ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { minutesTool: true })
ok(!!spec, 'the minutes tool has a spec')
// TASK-11: `zones` (v5r 的发言区/投票区) and `gaps` (只报缺口、不自动补全) joined the six original actions.
// TASK-17 (GAP-MTG-03): `resolve`/`resolutions`/`supersede` joined them — the resolution ENTITY.
const ACTIONS = ['list', 'draft', 'confirm', 'append', 'actions', 'zones', 'gaps', 'resolve', 'resolutions', 'supersede', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the eleven methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
ok(Object.keys(spec.parameters).every((p) => ['action', 'id', 'kind', 'text', 'member', 'session', 'meeting', 'target', 'actions', 'retroactive', 'by', 'of', 'limit'].includes(p)),
  'and the parameters only forward what the service takes')

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  // a spy service replaces kernel.minutes; the tool must CALL it, and the receipt must be the spy's own
  const calls = []
  const spy = {
    list: () => { calls.push('list'); return [{ id: 'm-1' }] },
    draft: async (a) => { calls.push('draft'); return { ok: true, created: a.id } },
    confirm: async (id) => { calls.push('confirm'); return { ok: true, confirmed: id } },
    append: async (id, text) => { calls.push('append'); return { ok: true, id, len: String(text).length } },
    actions: (id) => { calls.push('actions'); return [{ id, what: 'spoke' }] },
    zones: () => { calls.push('zones'); return { ok: true, speechZone: { count: 1 }, voteZone: { count: 0 } } },
    gaps: () => { calls.push('gaps'); return { ok: true, gaps: [{ what: 'ballots', why: 'none' }] } },
    resolve: (a) => { calls.push('resolve'); return { ok: true, resolution: { id: 'res-1', text: a.text } } },
    resolutions: () => { calls.push('resolutions'); return { ok: true, count: 1, resolutions: [{ id: 'res-1' }] } },
    supersede: (a) => { calls.push('supersede'); return { ok: true, id: a.of, supersededBy: a.by } },
    status: () => { calls.push('status'); return { ok: true, total: 7 } },
  }
  const withSpy = { minutes: spy }
  const s = specOf(withSpy, { minutesTool: true })
  const r1 = await s.run({ action: 'list' })
  ok(calls.includes('list') && Array.isArray(r1.minutes) && r1.minutes[0].id === 'm-1',
    'list delegates: the spy was CALLED and its own value is what comes back', { calls, r1 })
  await s.run({ action: 'draft', id: 'm-2', text: 'hello' })
  await s.run({ action: 'confirm', id: 'm-2' })
  await s.run({ action: 'append', id: 'm-2', text: 'more' })
  await s.run({ action: 'actions', id: 'm-2' })
  const rz = await s.run({ action: 'zones', id: 'm-2' })
  const rg = await s.run({ action: 'gaps', id: 'm-2' })
  const rres = await s.run({ action: 'resolve', meeting: 'm1', text: 'adopt X', by: 'acad' })
  const rlist = await s.run({ action: 'resolutions', meeting: 'm1' })
  const rsup = await s.run({ action: 'supersede', of: 'res-1', by: 'res-2' })
  const r6 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'list,draft,confirm,append,actions,zones,gaps,resolve,resolutions,supersede,status',
    'every one of the eleven actions reaches the service, in order, once each', { calls })
  ok(rz.speechZone.count === 1 && rg.gaps.length === 1, 'the derived reads come back from the service unchanged')
  ok(rres.resolution.text === 'adopt X' && rlist.count === 1 && rsup.supersededBy === 'res-2',
    'and the resolution entity is addressed, not reimplemented at the face')
  ok(r6.total === 7, 'and the receipt carries the service s value, not a recomputed one', { r6 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const spy = {
    list: () => [], draft: async () => ({}), confirm: async () => ({}), append: async () => ({}), actions: () => [],
    status: () => { const e = new Error('service says no'); e.code = 'VMU_MINUTES_LOCKED'; e.hint = 'confirm the previous one'; throw e },
  }
  const s = specOf({ minutes: spy }, { minutesTool: true })
  const r = await s.run({ action: 'status' })
  ok(r.ok === false && r.code === 'VMU_MINUTES_LOCKED',
    'the service s own code survives the tool boundary - the kernel face owns the refusal, the tool only addresses it', { r })
  ok(r.hint === 'confirm the previous one', 'and so does its hint', { r })
  const missing = await s.run({ action: 'draft', text: 'x' })
  ok(missing.ok === false && missing.code === 'VMU_INVALID_ARGUMENT',
    'and a missing required field is refused by name rather than passed on as undefined', { missing })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message),
    'and an action outside the enum is refused by name', { unknown })
}

console.log('=== MINUTES TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
