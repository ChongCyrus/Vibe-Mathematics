#!/usr/bin/env node
// ROUND 113 — A7 「临时工由雇他的人解雇」 needs a fact the roster never carried.
//
// The seat-face lane landed the fire guards (chair can never be fired; a member fires only temp seats; ownership
// is read from the roster row). On this kernel the roster row was `{id, slot, state, since, wakes}` — nothing
// recorded WHO hired the seat — so every live call fell into `ownership:"unrecorded"` and the rule could not be
// enforced at all. The honest fix is not a cleverer guess in `fire`: it is recording the fact WHERE THE HIRE
// HAPPENS, from the turn-tool record (`resolveTurnMember`), never from `args.member`.
//
// What this suite proves, end to end on a real boot:
//   §1 a hire that runs inside a member turn stamps `hiredBy` on the roster row and reads it back in the receipt;
//   §2 a hire that runs from a root/office call records NO attribution and says so (no invented owner);
//   §3 the guard that now has a fact behind it: the hiring member may fire its own temp worker, another member may
//      not, and the chair seat is never fireable by anyone.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r113-')); roots.push(d); return d }
const hire = (b, kernel, to, agentId) => call(b, 'vibe_v5_hire',
  { purpose: '搬数据', initial_task: '读两篇文献', to }, { kernel, agent: agentId === undefined ? undefined : { id: agentId } })

// ── §1 the hire happens inside a member turn: the row carries who hired it ──────────────────────────────────────
{
  console.log('§1 a member-turn hire stamps `hiredBy` on the roster row')
  const root = await mkRoot()
  const b = await boot({ root })
  await call(b, 'vibe_v5_start', { problem: '雇佣归属', researcherCount: 2, academician: true }, { kernel: b.handle.kernel })
  const kernel = b.handle.kernel

  const r = await hire(b, kernel, 'r-tmp1', 'r-1')
  const p = r.parsed || {}
  ok(p.ok === true, 'the hire succeeds inside a member turn', p.code || p)
  ok(p.hiredBy === 'r-1', '★ the receipt names the hiring member (read back from the row, not echoed from an argument)', p.hiredBy)
  ok(typeof p.hiredByMeans === 'string' && /turn-tool record/.test(p.hiredByMeans), 'and says where that fact came from', p.hiredByMeans)
  const row = kernel.members.roster().filter((m) => m.id === 'r-tmp1')[0] || {}
  ok(row.hiredBy === 'r-1', '★ the ROSTER ROW itself carries it (the fact survives the call)', row)
  ok(row.slot === 'temp', 'and the seat is still a temp seat', row.slot)

  // the founding seats have no attribution, and that is an ANSWER (null), not a guess
  const chair = kernel.members.roster().filter((m) => m.slot === 'chair')[0] || {}
  ok(chair.hiredBy === null || chair.hiredBy === undefined, 'founding seats carry no `hiredBy` (nobody hired them)', chair.hiredBy)
}

// ── §2 a root/office hire has no member seat: no attribution, and the receipt says so ───────────────────────────
{
  console.log('§2 an office hire records no attribution and does not invent one')
  const root = await mkRoot()
  const b = await boot({ root })
  await call(b, 'vibe_v5_start', { problem: '雇佣归属', researcherCount: 2, academician: true }, { kernel: b.handle.kernel })
  const kernel = b.handle.kernel
  const r = await hire(b, kernel, 'r-tmp2', 'session-root-office')
  const p = r.parsed || {}
  ok(p.ok === true, 'the office hire succeeds', p.code || p)
  ok(p.hiredBy === null, '★ no owner is invented for an office hire (null)', p.hiredBy)
  ok(/no `hiredBy`/.test(String(p.hiredByMeans)) && /unrecorded/.test(String(p.hiredByMeans)),
    'and the receipt says a later fire reports it as unrecorded', p.hiredByMeans)
}

// ── §3 the guard that now has a fact behind it ─────────────────────────────────────────────────────────────────
{
  console.log('§3 "your own temp worker" is now enforceable on the live path')
  const root = await mkRoot()
  const b = await boot({ root })
  await call(b, 'vibe_v5_start', { problem: '雇佣归属', researcherCount: 2, academician: true }, { kernel: b.handle.kernel })
  const kernel = b.handle.kernel
  const roster = kernel.members.roster()
  const other = (roster.filter((m) => m.slot === 'member' && m.id !== 'r-1')[0] || {}).id
  ok(typeof other === 'string' && other !== '', 'there is a second member to be the wrong caller', roster.map((m) => m.id))

  await hire(b, kernel, 'r-tmp3', 'r-1') // hired by r-1
  const asOther = await call(b, 'vibe_v5_fire', { id: 'r-tmp3', reason: '看能不能替人解雇' }, { kernel, agent: { id: other } })
  const so = asOther.parsed || {}
  ok(so.ok === false || asOther.thrown === true, '★ another member may NOT fire r-1\'s temp worker', so.code || so)
  ok((so.code || asOther.code) === 'VMU_NOT_PERMITTED', 'refused BY NAME (VMU_NOT_PERMITTED)', so.code || asOther.code)
  ok(so.ownership === 'not-own', '★ the refusal classifies the ownership as not-own (it has the fact now)', so.ownership)
  ok(/r-1/.test(String(so.ownershipMeans || '') + String(so.message || '')), 'and names the member who did hire it', so.ownershipMeans || so.message)

  const asOwner = await call(b, 'vibe_v5_fire', { id: 'r-tmp3', reason: '收缩编制' }, { kernel, agent: { id: 'r-1' } })
  const ow = asOwner.parsed || {}
  ok(ow.ok === true, '★ the hiring member fires its own temp worker', ow.code || ow)
  ok(ow.ownership === 'own', 'and the receipt classifies it as own', ow.ownership)
  ok(kernel.members.roster().filter((m) => m.id === 'r-tmp3')[0].state === 'ended', 'the seat is ended (the action really happened)', null)

  const chairId = (kernel.members.roster().filter((m) => m.slot === 'chair')[0] || {}).id
  const asOwnerChair = await call(b, 'vibe_v5_fire', { id: chairId, reason: '试' }, { kernel, agent: { id: 'r-1' } })
  const oc = asOwnerChair.parsed || {}
  ok((oc.code || asOwnerChair.code) === 'VMU_NOT_PERMITTED', '★ nobody fires the chair seat', oc.code || asOwnerChair.code)
  ok(/chair/.test(String(oc.targetSeat || '') + String(oc.message || '')), 'and the refusal names the seat it refused', oc.targetSeat || oc.message)
}

for (const d of roots) await rm(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
console.log('=== VMU RUN113 A7 HIRE ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
