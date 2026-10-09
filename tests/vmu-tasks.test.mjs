// vmu tasks & stages — the capability scenario for kernel/tasks.js (docs/08 §4).
//
// What must hold:
//   · "created" and "ready" are different facts: a dependency may be declared before the task it points at
//     exists, but the work cannot START until that dependency is done, and the refusal NAMES what is missing;
//   · the open-task ceiling is a MACHINE limit that quotes the current count;
//   · with no stages declared the stage machine REFUSES to advance - the default is "no process", not a
//     pretend one (the zero-mechanism default);
//   · whether a stage may be left is a PLUGGABLE gate, and a refusing gate leaves an audit record;
//   · a task brief is fetched BY ID and never leaks into the ledger listing (docs/06 §4.2).
//
// `--self-probe` copies the module, REMOVES the dependency guard and requires the dependency assertion to
// fail (the technique tests/run-tests.mutants.mjs uses on the runner).

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'tasks.js')
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
const mk = (opts = {}) => m.createTasks(Object.assign({ clock: () => '2026-10-09T00:00:00.000Z' }, opts))

// ---- 1. creation, assignment and the open-task ceiling -----------------------------------------
{
  const l = mk()
  await expectThrow(() => l.create({ title: '   ' }), 'VMU_INVALID_ARGUMENT', 'a task needs a non-empty title')
  const a = await l.create({ title: 'prove the lemma' })
  ok(a.state === 'open', 'a task with no owner starts open')
  const b = await l.create({ title: 'write it up', owner: 'r-1' })
  ok(b.state === 'assigned' && l.list({ owner: 'r-1' }).length === 1, 'a task created with an owner starts assigned')
  await l.assign(a.id, 'r-2')
  ok(l.list({ owner: 'r-2' }).length === 1, 'assignment is a state, queryable by owner')
  await expectThrow(() => l.assign('t-999', 'r-1'), 'VMU_NO_SUCH_OBJECT', 'assigning an unknown task is refused')

  const capped = mk({ maxOpenTasks: 1 })
  await capped.create({ title: 'one' })
  await expectThrow(() => capped.create({ title: 'two' }), 'VMU_RESOURCE_BUDGET', 'the open-task ceiling refuses by name')
  const err = await capped.create({ title: 'two' }).catch((e) => e)
  ok(/1\/1/.test(err.message), 'the ceiling refusal quotes the current count and the cap', err.message)
  const t1 = capped.list()[0]
  await capped.transition(t1.id, 'cancelled')
  ok((await capped.create({ title: 'now it fits' })).ok === true, 'closing a task frees capacity')
}

// ---- 2. the state machine, and terminal means terminal -----------------------------------------
{
  const l = mk()
  const t = await l.create({ title: 'x' })
  ok((await l.transition(t.id, 'doing')).ok === true, 'open -> doing is allowed by the declared table')
  await expectThrow(() => l.transition(t.id, 'open'), 'VMU_STATE', 'doing -> open is NOT in the table, so it is refused')
}
{
  const l = mk()
  const t = await l.create({ title: 'x' })
  await expectThrow(() => l.transition(t.id, 'nonsense'), 'VMU_INVALID_ARGUMENT', 'an unknown state is refused')
  await l.transition(t.id, 'cancelled')
  await expectThrow(() => l.transition(t.id, 'assigned'), 'VMU_STATE', 'a cancelled task cannot be revived')
  const t2 = await l.create({ title: 'y' })
  await l.transition(t2.id, 'doing')
  await l.transition(t2.id, 'done')
  await expectThrow(() => l.assign(t2.id, 'r-1'), 'VMU_STATE', 'a done task cannot be assigned')
  ok(l.status().byState.done === 1 && l.status().byState.cancelled === 1, 'the ledger reports the terminal counts')
}

// ---- 3. dependencies are enforced at START, and the refusal names them -------------------------
{
  const l = mk()
  const dep = await l.create({ title: 'dependency' })
  const work = await l.create({ title: 'dependent work', deps: [dep.id, 't-404'] })
  ok(l.list().length === 2, 'a dependency on a task that does not exist yet can still be declared')
  await expectThrow(() => l.transition(work.id, 'doing'), 'VMU_STATE', 'work cannot start while dependencies are unmet')
  const err = await l.transition(work.id, 'doing').catch((e) => e)
  ok(err.message.includes(dep.id) && err.message.includes('t-404'), 'the refusal NAMES the unmet dependencies', err.message)
  const st = l.status()
  ok(st.blocked.length === 1 && st.blocked[0].id === work.id, 'status() reports what is blocked and on what')
  ok(st.ready.length === 1 && st.ready[0] === dep.id, 'status().ready lists only what can start')
  await l.transition(dep.id, 'doing')
  await l.transition(dep.id, 'done')
  await expectThrow(() => l.transition(work.id, 'doing'), 'VMU_STATE', 'a missing dependency still blocks (t-404 was never created)')
  const work2 = await l.create({ title: 'second dependent', deps: [dep.id] })
  ok((await l.transition(work2.id, 'doing')).ok === true, 'once every dependency is done the work can start')
}

// ---- 4. stages: none by default, pluggable gate ------------------------------------------------
{
  const none = mk()
  ok(none.stage().declared === false && none.stage().current === null, 'no stages are declared by default')
  await expectThrow(() => none.advance(), 'VMU_STATE', 'with no stages the machine refuses to advance (no pretend process)')

  const gated = mk({ stages: ['explore', 'formalize', 'close'] })
  ok(gated.stage().current === 'explore', 'the first stage is current')
  ok((await gated.advance()).stage === 'formalize', 'advancing moves to the next stage')
  ok((await gated.advance({ to: 'close' })).stage === 'close', 'an explicit jump forward is allowed (the pack asked for it)')
  ok(gated.stage().current === 'close' && gated.stage().index === 2, 'the stage machine lands where it was told to')
  await expectThrow(() => gated.advance(), 'VMU_INVALID_ARGUMENT', 'advancing past the last stage is refused')
  await expectThrow(() => gated.advance({ to: 'explore' }), 'VMU_STATE', 'jumping BACKWARDS is refused by advance (use rollback)')
  ok((await gated.rollback()).stage === 'formalize', 'rollback goes back exactly one stage')

  const refusing = mk({ stages: ['a', 'b'], stageGate: ({ from, to }) => ({ ok: false, code: 'VMU_STATE', message: 'no conclusion without a source id (' + from + '->' + to + ')' }) })
  await expectThrow(() => refusing.advance(), 'VMU_STATE', 'a refusing stage gate blocks the advance')
  const e2 = await refusing.advance().catch((e) => e)
  ok(/source id/.test(e2.message), 'the gate speaks with its own message', e2.message)
  ok(refusing.history().some((h) => h.what === 'stage-gate-refused'), 'the refused stage change is audited')
  ok(refusing.stage().current === 'a', 'a refused gate leaves the stage machine where it was')

  const hookDenied = mk({ stages: ['a', 'b'], bus: { emit: async () => ({ ok: false, code: 'VMU_STATE', message: 'settle/before denied', entry: 'pack-gate' }) } })
  const r = await hookDenied.advance()
  ok(r.ok === false && r.refused.entry === undefined && /denied/.test(r.refused.message), 'a settle/before denial returns a refusal instead of throwing')
}

// ---- 5. briefs are fetched by id and never leak into the listing -------------------------------
{
  const l = mk()
  const t = await l.create({ title: 'x', owner: 'r-1' })
  await expectThrow(() => l.briefOf(t.id), 'VMU_NO_SUCH_OBJECT', 'reading a brief that was never set is refused by name')
  const set = l.brief(t.id, 'do the following: ...', { by: 'office' })
  ok(set.ok === true && set.rollbackable === true, 'setting a brief reports rollbackability')
  const got = l.briefOf(t.id)
  ok(got.brief.includes('do the following') && got.owner === 'r-1', 'the brief is fetched by id, with its owner')
  const row = l.list().find((x) => x.id === t.id)
  ok(!('brief' in row) && row.hasBrief === true, 'the ledger lists hasBrief but NEVER the brief text itself')
  l.clearBrief(t.id)
  ok(l.status().briefs === 0 && l.list()[0].hasBrief === false, 'clearing a brief removes it')
  await expectThrow(() => Promise.resolve(l.briefOf(t.id)), 'VMU_NO_SUCH_OBJECT', 'after clearing, the brief is gone')
  const replaced = l.brief(t.id, 'first')
  const second = l.brief(t.id, 'second')
  ok(second.previous && replaced.ok === true, 'replacing a brief reports the previous one (reference swap, rollbackable)')
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if ((to === 'doing' || to === 'done') && unmetDeps(t).length > 0) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the dependency guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-tasks-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'tasks.js'), src.replace(guard, '      if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'tasks.js')).href + '?probe=1')
    const ml = mm.createTasks()
    const dep = await ml.create({ title: 'd' })
    const work = await ml.create({ title: 'w', deps: [dep.id] })
    let refused = false
    try { await ml.transition(work.id, 'doing') } catch (e) { refused = e && e.code === 'VMU_STATE' }
    // With the guard removed the unmet dependency is ignored: the assertion below MUST fail.
    ok(refused === true, 'self-probe: guard removed => the dependency assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU TASKS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU TASKS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
