// vmu members — the capability scenario for kernel/members.js (docs/02 partition A, D5).
//
// What must hold:
//   · a slot must be declared before anyone occupies it, and the kernel KNOWS NOTHING about what a slot
//     means: labels and permissions are opaque strings supplied by a pack (D5 - the kernel gives SLOTS,
//     not roles). The source contains none of the v5r role names, which is asserted directly;
//   · capacity is a MACHINE limit: a full slot refuses the placement BY NAME, quoting the current count
//     and the cap (the S25-E lesson - an unenforceable limit is a suggestion);
//   · the institute-wide live-member ceiling is enforced the same way;
//   · ending a member records WHY, and ending an unknown id is refused by name;
//   · waking builds an envelope and hands it to an injected seam; with no seam bound the wake is refused
//     by name (VMU_ENGINE_UNAVAILABLE) instead of silently doing nothing;
//   · permissions are checked against the slot's opaque strings and never interpreted.
//
// `--self-probe` copies the module, REMOVES the slot-capacity guard and requires the capacity assertion
// to fail (the technique tests/run-tests.mutants.mjs uses on the runner).

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'members.js')
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

const slots = [
  { id: 'lead', label: '负责人', capacity: 1, permissions: ['convene', 'assign'] },
  { id: 'worker', label: '执行者', capacity: 2, permissions: ['compute'] },
  { id: 'observer', label: '观察者', capacity: 0, permissions: [] }, // 0 = unlimited
]
const mk = (opts = {}) => m.createMembers(Object.assign({ slots, clock: () => '2026-10-09T00:00:00.000Z' }, opts))

// ---- 1. slots are declared data, not kernel knowledge ------------------------------------------
{
  const mid = mk()
  const roles = mid.roles()
  ok(roles.length === 3 && roles.every((r) => r.capacity !== undefined), 'the declared slots are reported with their capacities')
  ok(roles.find((r) => r.id === 'observer').capacity === 0, 'capacity 0 means unlimited, as documented')
  await expectThrow(() => mid.assignRole('m-1', 'chief'), 'VMU_INVALID_ARGUMENT', 'placing a member in an undeclared slot is refused by name')
  let threw = null
  try { m.createMembers({ slots: [{ id: 'Bad_Slot' }] }) } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_INVALID_ARGUMENT', 'a malformed slot id is refused at construction', threw && threw.code)
  let dup = null
  try { m.createMembers({ slots: [{ id: 'x' }, { id: 'x' }] }) } catch (e) { dup = e }
  ok(dup && dup.code === 'VMU_MIDDLEWARE_FAILED', 'duplicate slot ids are a conflict, never a silent merge')
}

// ---- 2. capacity is machine-enforced, by name --------------------------------------------------
{
  const mid = mk()
  await mid.assignRole('m-1', 'lead')
  await expectThrow(() => mid.assignRole('m-2', 'lead'), 'VMU_RESOURCE_BUDGET', 'a full slot refuses a second occupant')
  const err = await mid.assignRole('m-2', 'lead').catch((e) => e)
  ok(/1\/1/.test(err.message), 'the refusal quotes the current count and the cap', err.message)
  await mid.assignRole('m-2', 'worker')
  await mid.assignRole('m-3', 'worker')
  await expectThrow(() => mid.assignRole('m-4', 'worker'), 'VMU_RESOURCE_BUDGET', 'capacity 2 refuses the third occupant')
  ok((await mid.assignRole('m-1', 'lead')).unchanged === true, 're-placing the same member is idempotent')
  await mid.assignRole('a', 'observer'); await mid.assignRole('b', 'observer'); await mid.assignRole('c', 'observer')
  ok(mid.roles().find((r) => r.id === 'observer').occupied === 3, 'an unlimited slot keeps accepting occupants')
}

// ---- 3. the institute-wide ceiling -------------------------------------------------------------
{
  const mid = mk({ maxLiveMembers: 2 })
  await mid.hire({ id: 'm-1', slot: 'worker' })
  await mid.hire({ id: 'm-2', slot: 'worker' })
  await expectThrow(() => mid.hire({ id: 'm-3', slot: 'worker' }), 'VMU_RESOURCE_BUDGET',
    'the live-member ceiling refuses a third member by name')
  ok(mid.status().maxLiveMembers === 2 && mid.status().live === 2, 'status() reports the cap and the live count')
}

// ---- 4. ending a member records why ------------------------------------------------------------
{
  const mid = mk()
  await mid.assignRole('m-1', 'worker')
  const r = await mid.end('m-1', 'task complete')
  ok(r.state === 'ended' && mid.roster()[0].endedReason === 'task complete', 'ending records the reason')
  await expectThrow(() => mid.end('ghost', 'x'), 'VMU_NO_SUCH_OBJECT', 'ending an unknown member is refused by name')
  await expectThrow(() => mid.wake('m-1', 'do work'), 'VMU_STATE', 'waking an ended member is refused as a state error')
}

// ---- 5. the wake seam --------------------------------------------------------------------------
{
  const mid = mk()
  await mid.assignRole('m-1', 'lead')
  await expectThrow(() => mid.wake('m-1', 'review this'), 'VMU_ENGINE_UNAVAILABLE',
    'with no seam bound the wake is refused by name (never a silent no-op)')
  const seen = []
  const bound = mk({ deliver: async (env) => { seen.push(env); return { accepted: true } } })
  await bound.assignRole('m-1', 'lead')
  const w = await bound.wake('m-1', 'review this', { phase: 'review' })
  ok(w.ok === true && seen.length === 1, 'the envelope reaches the injected seam')
  ok(seen[0].member === 'm-1' && seen[0].slot === 'lead' && seen[0].ask === 'review this' && seen[0].phase === 'review',
    'the envelope carries member, slot, ask and phase', JSON.stringify(seen[0]))
  ok(bound.roster()[0].wakes === 1, 'the wake count is recorded')
  await expectThrow(() => bound.wake('m-1', '   '), 'VMU_INVALID_ARGUMENT', 'an empty ask is refused')
}

// ---- 6. permissions are opaque ----------------------------------------------------------------
{
  const mid = mk()
  await mid.assignRole('m-1', 'lead')
  ok(mid.may('m-1', 'convene').allowed === true, 'a declared permission is granted')
  ok(mid.may('m-1', 'compute').allowed === false, 'an undeclared permission is not granted')
  await expectThrow(() => Promise.resolve(mid.may('ghost', 'convene')), 'VMU_NO_SUCH_OBJECT', 'permission checks refuse unknown members')
}

// ---- 7. the kernel knows no roles (D5) ---------------------------------------------------------
{
  const src = await readFile(MODULE, 'utf8')
  const forbidden = ['院士', 'academician', '研究员', 'researcher', '临时工', 'temp', 'chair', 'reviewer']
  const hits = forbidden.filter((w) => src.includes(w))
  ok(hits.length === 0, 'the source names no role from the v5r line (kernel gives slots, not roles)', hits.join(','))
}

// ---- 8. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (def.capacity > 0 && used >= def.capacity && (!existing || existing.slot !== slotId)) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the capacity guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-members-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'members.js'), src.replace(guard, '      if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'members.js')).href + '?probe=1')
    const ml = mm.createMembers({ slots })
    await ml.assignRole('m-1', 'lead')
    let refused = false
    try { await ml.assignRole('m-2', 'lead') } catch (e) { refused = e && e.code === 'VMU_RESOURCE_BUDGET' }
    ok(refused === true, 'self-probe: guard removed => the capacity assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU MEMBERS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU MEMBERS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
