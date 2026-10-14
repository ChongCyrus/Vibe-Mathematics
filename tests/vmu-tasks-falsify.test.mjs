// tests/vmu-tasks-falsify.test.mjs — FAMILY 7: `kernel/tasks.js`, the DAG guard (F35) — a dependency edge set that
// would close a cycle is refused BY NAME with the cycle path, at BOTH write paths (create and setDependencies).
// Run: node tests/vmu-tasks-falsify.test.mjs
//
// Why this face is worth a family: the module's own header records the defect it fixes — "a cycle used to be
// constructible and simply never became ready — a silent deadlock". The probe reads four things:
//   · CREATE PATH   — a task whose creation closes a cycle is refused and is NOT created;
//   · SET-DEPS PATH — t-1 -> t-2 while t-2 -> t-1 is refused and the edge set is UNCHANGED;
//   · SELF-LOOP     — still refused (the narrow control for "only self-loops are checked");
//   · CONTROL       — a legitimate DAG edge is accepted (so "everything is refused" is not the story).
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const TASKS = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'tasks.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

async function tasksProbe(mod) {
  const mk = () => mod.createTasks({ clock: () => 1000 })
  const attempt = async (fn) => { try { return { value: await fn() } } catch (e) { return { code: (e && e.code) || String((e && e.message) || e) } } }

  // (a) CREATE PATH: a dependency may name a task that does not exist yet, so the NEXT create can close the cycle.
  const t = mk()
  const t1 = (await t.create({ title: 'a' })).id            // t-1
  await t.setDependencies(t1, ['t-2'])                       // deps may name a future id (t-2 does not exist yet)
  const closeCreate = await attempt(() => t.create({ title: 'b', deps: [t1] }))   // that create WOULD be t-2 -> t-1 -> t-2
  const createdAfterCycle = t.list().length

  // (b) SET-DEPS PATH: a real 2-cycle through two existing tasks.
  const u = mk()
  const u1 = (await u.create({ title: 'x' })).id
  const u2 = (await u.create({ title: 'y', deps: [u1] })).id
  const setCycle = await attempt(() => u.setDependencies(u1, [u2]))
  const depsAfter = u.list().find((x) => x.id === u1).deps.join(',')

  // (c) SELF-LOOP: refused by the same guard (and by its own dedicated branch).
  const selfLoop = await attempt(() => u.setDependencies(u2, [u2]))

  // (d) CONTROL: a legitimate DAG edge is accepted.
  const v = mk()
  const v1 = (await v.create({ title: 'p' })).id
  const v2 = (await v.create({ title: 'q' })).id
  const dagOk = await attempt(() => v.setDependencies(v2, [v1]))
  return {
    createCycleCode: closeCreate.code || null, createdAfterCycle,
    setCycleCode: setCycle.code || null, depsAfter,
    selfLoopCode: selfLoop.code || null,
    dagAccepted: !!(dagOk.value && dagOk.value.ok === true), dagCode: dagOk.code || null,
  }
}

const family = await falsifyFamily({
  name: 'tasks — a dependency cycle is refused at both write paths',
  cases: [{
    name: 'tasks.js',
    module: TASKS,
    probe: tasksProbe,
    controlFields: ['dagAccepted', 'selfLoopCode'],
    mutations: [
      { label: 'the CREATE path skips the DAG guard', name: 'tasks-create-check',
        find: "      const cycle = findDependencyCycle(id, depList, (x) => { const known = tasks.get(String(x)); return known ? known.deps : null })\n      if (cycle) throw cycleRefusal(id, cycle)\n",
        replace: '' },
      { label: 'only self-loops are checked (the graph walk is disabled)', name: 'tasks-walk-disabled',
        find: '    const sub = walk(d, new Set())\n', replace: '    const sub = null   // MUTANT: the transitive walk is gone, so only self-loops are caught\n' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module refuses every cycle and accepts a DAG ===')
ok(family.cases[0].real.createCycleCode === 'VMU_TASK_DEPENDENCY_CYCLE' && family.cases[0].real.createdAfterCycle === 1,
  '★ a CREATE that would close a cycle is refused BY NAME and the task is NOT created', family.cases[0].real)
ok(family.cases[0].real.setCycleCode === 'VMU_TASK_DEPENDENCY_CYCLE' && family.cases[0].real.depsAfter === '',
  '★ a SET-DEPS that would close a cycle is refused BY NAME and the edge set is UNCHANGED', family.cases[0].real)
ok(family.cases[0].real.selfLoopCode === 'VMU_TASK_DEPENDENCY_CYCLE',
  'a self-loop is refused too (the narrow control: the walk mutation must not be credited with this one)', family.cases[0].real)
ok(family.cases[0].real.dagAccepted === true && family.cases[0].real.dagCode === null,
  'and a legitimate DAG edge is ACCEPTED (control direction: the guard is not "refuse everything")', family.cases[0].real)

console.log('=== FALSIFICATION: skip the guard, or weaken it to self-loops only ===')
ok(family.ok, '★ both tasks mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const createRed = byLabel('CREATE path skips') && byLabel('CREATE path skips').red
const walkRed = byLabel('only self-loops') && byLabel('only self-loops').red
ok(!!createRed && createRed.createCycleCode === null && createRed.createdAfterCycle === 2,
  '★ "create check skipped": the cycle IS created (the silent deadlock the module header records as fixed)', createRed)
ok(!!walkRed && walkRed.setCycleCode === null && walkRed.depsAfter !== '' && walkRed.selfLoopCode === 'VMU_TASK_DEPENDENCY_CYCLE',
  '★ "only self-loops checked": the 2-cycle is accepted while the self-loop is still refused (the mutation is NARROW — exactly what the control reads)', walkRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU TASKS FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
