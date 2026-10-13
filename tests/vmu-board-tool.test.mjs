// tests/vmu-board-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.board)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, boardTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.board),
    'and declaring the board intent registers the board tool', { n: on.length, names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO EIGHTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { boardTool: true })
ok(!!spec, 'the board tool has a spec')
const ACTIONS = ['columns', 'addColumn', 'move', 'setWip', 'swimlanes', 'aging', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the seven methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.board).filter((n) => typeof k.board[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    columns: () => { calls.push('columns'); return { ok: true, columns: [{ id: 'todo' }], count: 1 } },
    addColumn: (a) => { calls.push('addColumn'); return { ok: true, id: a.id } },
    move: (a) => { calls.push('move'); return { ok: true, taskId: a.taskId, toColumn: a.toColumn } },
    setWip: (a) => { calls.push('setWip'); return { ok: true, column: a.column, limit: a.limit } },
    swimlanes: () => { calls.push('swimlanes'); return { ok: true, swimlanes: ['default'], count: 1 } },
    aging: (a) => { calls.push('aging'); return { ok: true, rows: [], warnMs: a.warnMs } },
    status: () => { calls.push('status'); return { ok: true, columns: 1 } },
  }
  const s = specOf({ board: spy }, { boardTool: true })
  const r1 = await s.run({ action: 'columns' })
  ok(calls.includes('columns') && r1.count === 1 && r1.columns[0].id === 'todo',
    'columns delegates: the spy was CALLED and its own value comes back', { calls, r1 })
  await s.run({ action: 'addColumn', id: 'doing', name: 'Doing', wipLimit: 3 })
  const r3 = await s.run({ action: 'move', taskId: 't-1', toColumn: 'doing' })
  await s.run({ action: 'setWip', column: 'doing', limit: 2 })
  await s.run({ action: 'swimlanes' })
  await s.run({ action: 'aging', warnMs: 1000 })
  const r7 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'columns,addColumn,move,setWip,swimlanes,aging,status',
    'every one of the seven actions reaches the service, in order, once each', { calls })
  ok(r3.taskId === 't-1' && r7.columns === 1, 'and the receipts carry the service s values, not recomputed ones', { r3, r7 })
  ok(r3.ok === true && r3.action === 'move', 'and the envelope names the action it addressed', { r3 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const k2 = createKernel({ clock: () => 0, settings: {} })
  const s = specOf(k2, { boardTool: true })
  const r = await s.run({ action: 'move' })
  ok(r.ok === false && r.code === 'VMU_INVALID_ARGUMENT' && /non-empty taskId/.test(r.message),
    'the service s own refusal survives the tool boundary - the kernel face owns the policy, the tool only addresses it', { r })
  ok(!!r.hint, 'and so does its hint, which is what tells a caller how to fix the call', { r })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== BOARD TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
