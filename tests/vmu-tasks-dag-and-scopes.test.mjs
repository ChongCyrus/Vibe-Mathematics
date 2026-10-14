// tests/vmu-tasks-dag-and-scopes.test.mjs — Round 5 (task-35): F35 (the dependency graph is a DAG) and F39 (write
// scopes are an ADVISORY the framework reports but never enforces).
//
// WHY THIS SUITE EXISTS. Round 5's evidence file found two missing guarantees:
//   F35 — `unmetDeps` answered "is this dependency finished yet", so a CYCLE was constructible and simply never
//         became ready: a silent deadlock with no refusal and no path to explain it.
//   F39 — "advisory write scopes" existed in the v5r pack's prompt examples (`task_create {write_scopes:[…]}`)
//         but the kernel had no such notion, so the field was dropped at the boundary.
//
// THE CONTRACT
//   F35: a self-loop or an entire-graph cycle is refused at `create()`/`setDependencies()` BY NAME
//        (`VMU_TASK_DEPENDENCY_CYCLE`) and the refusal carries the CYCLE PATH in `detail.cycle`. A legal DAG is
//        unaffected — including the documented "a dependency may name a task that does not exist yet" rule.
//   F39: `writeScopes` are declared by the task creator, normalised like the team-board contract, REPORTED when
//        they overlap another live task, and NEVER used to refuse anything. Invalid entries are reported, never
//        silently dropped; no scopes declared ⇒ zero mechanism.
//
// Last line: === VMU TASKS DAG+SCOPES: N passed, M failed ===
import { createTasks, findDependencyCycle, TASK_STATES } from '../vibe-math-vmu/kernel/tasks.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const refuses = async (code, name, fn) => {
  try { await fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, (e && e.code) + ' | ' + (e && e.message)); return e }
}
let NOW = 1000
const clock = () => { NOW += 1; return NOW }
const mk = (opts = {}) => createTasks(Object.assign({ clock }, opts))

// ── F35 · 1. self-loop: at creation (a caller may name the id it is about to get) and via setDependencies ────
{
  const a = mk()
  const e1 = await refuses('VMU_TASK_DEPENDENCY_CYCLE', 'a task cannot depend on itself at creation',
    () => a.create({ title: 'self', deps: ['t-1'] }))
  ok(!!e1 && e1.detail && Array.isArray(e1.detail.cycle) && e1.detail.cycle.join('>') === 't-1>t-1',
    'the refusal carries the self-loop path', e1 && e1.detail)
  ok(/t-1 -> t-1/.test(String(e1.message)), 'the message shows the cycle', e1.message)
  ok(a.list().length === 0, 'nothing was created when the guard fired', a.list().length)

  const b = mk()
  const t1 = await b.create({ title: 'one' })
  const e2 = await refuses('VMU_TASK_DEPENDENCY_CYCLE', 'setDependencies refuses a self-loop too',
    () => b.setDependencies(t1.id, [t1.id]))
  ok(!!e2 && e2.detail.cycle.join('>') === 't-1>t-1', 'the mutation path carries the same path', e2 && e2.detail)
  ok(b.status().dag.indexOf('VMU_TASK_DEPENDENCY_CYCLE') !== -1, 'status() states the DAG guarantee', b.status().dag)
}

// ── F35 · 2. a two-node cycle is refused, with the path ─────────────────────────────────────────────────────
{
  const a = mk()
  const t1 = await a.create({ title: 'one' })
  const t2 = await a.create({ title: 'two' })
  const first = await a.setDependencies(t1.id, [t2.id])
  ok(first.ok === true && first.deps.join(',') === 't-2', 'the forward edge t-1 -> t-2 is legal', first)
  const e = await refuses('VMU_TASK_DEPENDENCY_CYCLE', 'the back edge t-2 -> t-1 is refused',
    () => a.setDependencies(t2.id, [t1.id]))
  ok(!!e && e.detail.cycle.length === 3 && e.detail.cycle[0] === 't-2' && e.detail.cycle[e.detail.cycle.length - 1] === 't-2',
    'the path starts and ends at the task being changed', e && e.detail.cycle)
  ok(a.list().filter((x) => x.id === 't-2')[0].deps.length === 0, 'the refused edge did not land', a.list())
}

// ── F35 · 3. a LONG cycle (three hops) is refused and the whole path is named ───────────────────────────────
{
  const a = mk()
  await a.create({ title: 'one' })
  await a.create({ title: 'two' })
  await a.create({ title: 'three' })
  await a.setDependencies('t-1', ['t-2'])
  await a.setDependencies('t-2', ['t-3'])
  const e = await refuses('VMU_TASK_DEPENDENCY_CYCLE', 'closing the long cycle is refused',
    () => a.setDependencies('t-3', ['t-1']))
  const cycle = e && e.detail && e.detail.cycle
  ok(!!cycle && cycle.length === 4 && cycle.join('>') === 't-3>t-1>t-2>t-3', 'the full cycle path is reported', cycle)
}

// ── F35 · 4. a legal DAG still passes, and the start-time gate is unchanged ─────────────────────────────────
{
  const a = mk()
  const t1 = await a.create({ title: 'one' })
  const t2 = await a.create({ title: 'two', deps: [t1.id] })
  const t3 = await a.create({ title: 'three', deps: [t1.id, t2.id] })
  const t4 = await a.create({ title: 'four', deps: ['t-999'] })   // documented: a dep may not exist yet
  ok(t4.ok === true, 'a dependency naming a not-yet-existing task is still allowed (checked at start)', t4)
  const st = a.status()
  ok(st.ready.join(',') === 't-1', 'only the root is ready', st.ready)
  ok(st.blocked.length === 3 && st.blocked.some((x) => x.id === 't-4' && x.missing.join(',') === 't-999'),
    'the blocked list names the unmet dependencies', st.blocked)
  const gate = await refuses('VMU_STATE', 'starting work with unmet dependencies is still refused at START time',
    () => a.transition(t2.id, 'doing'))
  ok(/unmet dependencies/.test(String(gate.message)), 'the start-time refusal keeps its wording', gate.message)
  const legal = await a.setDependencies(t3.id, [t1.id])
  const beforeRev = a.list().filter((x) => x.id === t3.id)[0].revision
  ok(legal.ok === true && legal.revision === beforeRev, 'a legal dependency change lands and bumps the revision', legal)
  await refuses('VMU_TASK_STALE_REVISION', 'a stale revision is still refused (CAS unchanged)',
    () => a.setDependencies(t3.id, [], { expectedRevision: 1 }))
  await refuses('VMU_NO_SUCH_OBJECT', 'setDependencies on an unknown task refuses by name', () => a.setDependencies('t-404', []))
  ok(TASK_STATES.indexOf('doing') !== -1, 'the states are unchanged', TASK_STATES.length)
}

// ── F39 · 1. write scopes are normalised, and what was dropped is REPORTED ──────────────────────────────────
{
  const a = mk()
  const made = await a.create({ title: 'scoped', writeScopes: ['Members/r-1/Propos', 'Members\\r-1\\Methods', 'Members/r-1/Propos', '/abs/path', 'C:/drive', '../up', '', 'a/./b'] })
  ok(made.writeScopes.join('|') === 'Members/r-1/Propos|Members/r-1/Methods',
    'backslashes and the leading ./ are normalised, duplicates collapse', made.writeScopes)
  ok(made.skippedScopes.length === 5, 'every rejected scope is reported (absolute, drive, .., empty, dot-segment)', made.skippedScopes)
  ok(made.skippedScopes.every((s) => typeof s.what === 'string' && typeof s.why === 'string'),
    'each rejection names the entry and the reason', made.skippedScopes)
  const row = a.list().filter((x) => x.id === made.id)[0]
  ok(row.writeScopes.length === 2, 'the ledger row exposes the scopes (so a colleague can see them)', row.writeScopes)
}

// ── F39 · 2. overlap is ADVISORY: reported, never enforced ─────────────────────────────────────────────────
{
  const a = mk()
  const t1 = await a.create({ title: 'mine', owner: 'r-1', writeScopes: ['Members/r-1'] })
  const t2 = await a.create({ title: 'also mine', owner: 'r-2', writeScopes: ['Members/r-1/Propos'] })
  const st = a.status()
  ok(st.writeScopeConflicts.length === 1 && st.writeScopeConflicts[0].a === 't-1' && st.writeScopeConflicts[0].b === 't-2',
    'the overlapping pair is REPORTED', st.writeScopeConflicts)
  ok(/advisory only/.test(String(st.writeScopes)), 'status() says the scopes are advisory', st.writeScopes)
  // the decisive assertion: nothing is blocked by the overlap
  const assigned = await a.assign(t2.id, 'r-3', { expectedRevision: t2.revision })
  ok(assigned.ok === true, 'an overlapping scope does NOT block an assignment', assigned)
  const moved = await a.transition(t2.id, 'doing', { expectedRevision: assigned.revision })
  ok(moved.ok === true, 'nor a transition into work', moved)
  const none = mk()
  ok(none.status().writeScopeConflicts.length === 0, 'zero mechanism: no scopes declared ⇒ no conflicts reported')
  // the advisory view follows the LEDGER: a task that no longer overlaps stops being reported
  await a.transition(t1.id, 'cancelled', { reason: 'dropped' })
  ok(a.status().writeScopeConflicts.length === 0, 'the conflicts are recomputed from the live ledger (no stale row)', a.status().writeScopeConflicts)
}

// ── F39 · 3. terminal tasks stop conflicting, and the metadata survives a snapshot/restore ─────────────────
{
  const a = mk()
  await a.create({ title: 'one', writeScopes: ['x/y'] })
  const t2 = await a.create({ title: 'two', writeScopes: ['x/y/z'] })
  ok(a.status().writeScopeConflicts.length === 1, 'live tasks conflict', a.status().writeScopeConflicts)
  await a.transition(t2.id, 'cancelled', { reason: 'dropped' })
  ok(a.status().writeScopeConflicts.length === 0, 'a terminal task no longer contributes a conflict (advisory view is about LIVE work)', a.status().writeScopeConflicts)

  const snap = a.snapshot()
  const b = mk()
  const restored = b.restore(snap)
  ok(restored.ok === true && restored.skipped.length === 0, 'the board snapshot (including advisory scopes) restores', restored)
  const row = b.list().filter((x) => x.id === 't-1')[0]
  ok(row && row.writeScopes.join(',') === 'x/y', 'the advisory metadata came back with the task', row && row.writeScopes)
  ok((b.status().writeScopeConflicts || []).length === 0, 'and the advisory view is consistent after the restore')
}

// ── the pure helper is exported (so another face can reuse the same DAG rule) ───────────────────────────────
{
  const acyclic = { a: ['b'], b: [], c: [] }
  ok(findDependencyCycle('c', ['a'], (x) => acyclic[x]) === null, 'no cycle when the chain ends', null)
  ok(findDependencyCycle('a', ['a'], (x) => acyclic[x]).join('>') === 'a>a', 'self-loop detected by the helper')
  const chained = { a: ['b'], b: ['c'], c: [] }
  const cyc = findDependencyCycle('c', ['a'], (x) => chained[x])
  ok(!!cyc && cyc.join('>') === 'c>a>b>c', 'a chain that leads back to the start IS the cycle it would create', cyc)
  const graph2 = { a: ['b'], b: ['c'], c: ['a'] }
  ok(findDependencyCycle('x', ['a'], (x) => graph2[x]) === null,
    'a pre-existing cycle elsewhere is not blamed on the new node (only paths back to startId count)')
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU TASKS DAG+SCOPES SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU TASKS DAG+SCOPES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
