#!/usr/bin/env node
// ROUND 116 — THE CHILD SESSION ID IS A FACT THE MOMENT THE CHILD STARTS, SO IT IS LEARNED THEN.
//
// What run 116 measured (build 97a0724d, the commit that made "which member am I?" durable):
//
//   · r-1's FIRST turn hired r-t1  → `hiredBy: null` with the note "this call ran outside a member turn".
//   · r-1's SECOND (continuation) turn hired r-t2 → `hiredBy: "r-1"` (learned after the first turn settled).
//   · r-2's FIRST turn fired r-1's r-t2 → `caller:null, callerUnknown:true, ownership:"not-own"` and **ok:true**.
//
// Two defects, one shape: the map "child session → member" was only written AFTER a delivery's reply settled, so every
// tool call of a member's first turn ran while the map was empty. And when the caller could not be named at all, the
// member seat guards (which are all keyed on a caller) were simply not applied — the receipt said `not-own` and let the
// call through.
//
// §1 the seam reports the child id BEFORE its result is awaited (`turn.onChild`), and the kernel can name the member
//    while that child is still working — which is exactly when its tools ask;
// §2 the pair still reaches the durable fold (a later kernel, i.e. the member's own, resolves it);
// §3 a call from an UNMAPPED non-root session, on a temp worker attributed to somebody else, is refused by name
//    (`VMU_FIRE_CALLER_UNKNOWN`); the office (no exec) and root sessions stay allowed, and a mapped caller is `own`.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const { createKernel } = await import(pathToFileURL(KERNEL).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r116-')); roots.push(d); return d }
const FENCED = ['```json', '{"say":"我这就去雇一个临时的帮手"}', '```'].join(String.fromCharCode(10))

// ★ TWO BOOTS, ON PURPOSE. §1/§2 need the TURN LOOP over an injected `deliverTurn` (the shape the real host has);
// the plugin entry wires its own `deliverTurn` from `ctx.get('subagents')`, so a seam handed to the entry is not the
// seam that would run. §3 needs the real plugin (real tool specs) — it calls the pack face directly through a spec.
const bootKernel = async (root, deliverTurn) => {
  const K = createKernel({
    clock: () => 1000,
    settings: {},
    root,
    deliverTurn,
    slots: [
      { id: 'chair', capacity: 1, permissions: ['speak', 'vote', 'decide'] },
      { id: 'member', capacity: 4, permissions: ['speak', 'vote'] },
      { id: 'temp', capacity: 4, permissions: ['speak'] },
    ],
  })
  await K.store.open()
  return K
}
const bootPlugin = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

// ── §1 THE EARLY REPORT: the kernel can name the member while its child is still working ─────────────
{
  console.log('§1 F-116a — the seam reports the child id BEFORE the reply settles, so the first turn can be attributed')
  const root = await mkRoot()
  const seen = { hasChannel: null, duringDelivery: null }
  let K = null
  const seam = async ({ turn }) => {
    seen.hasChannel = !!(turn && typeof turn.onChild === 'function')
    if (turn && typeof turn.onChild === 'function') turn.onChild('child-early-1')
    // ★ THIS is the measurement: the member's own tools run in this window, before any reply exists, and they ask
    // "who is calling?". Before F-116a the map was empty here, so every first-turn call was attributed to nobody.
    seen.duringDelivery = K && typeof K.memberBySession === 'function' ? K.memberBySession('child-early-1') : 'no-api'
    return { reply: FENCED, childId: 'child-early-1' }
  }
  K = await bootKernel(root, seam)
  ok(typeof K.memberBySession === 'function', 'the kernel publishes memberBySession', typeof K.memberBySession)
  await K.members.hire({ id: 'r-1', slot: 'member' })
  const step = await K.turn.step({ members: ['r-1'], phase: 'normal', why: '雇一个临时帮手' })
  ok(step && step.ok === true, 'the member turn settles', step && step.ok)
  ok(seen.hasChannel === true, 'F-116a: the kernel hands the seam `turn.onChild` (the child id has a channel)', seen)
  ok(seen.duringDelivery === 'r-1',
    'F-116a: DURING delivery the kernel already answers "child-early-1 is r-1" (run 116 answered null here)', seen)
}

// ── §2 THE DURABLE HALF: the pair reaches the fold, so a second kernel resolves it ───────────────────
{
  console.log('§2 F-116a — the learned pair reaches the durable fold (a later kernel resolves it)')
  const root = await mkRoot()
  let K = null
  const seam = async ({ turn }) => {
    if (turn && typeof turn.onChild === 'function') turn.onChild('child-early-2')
    return { reply: FENCED, childId: 'child-early-2' }
  }
  K = await bootKernel(root, seam)
  await K.members.hire({ id: 'r-1', slot: 'member' })
  await K.turn.step({ members: ['r-1'], phase: 'normal', why: '同一个事实要能被另一个内核读到' })
  const pairs = typeof K.turn.memberSessionPairs === 'function' ? K.turn.memberSessionPairs() : []
  ok(pairs.some((p) => p.session === 'child-early-2' && p.member === 'r-1'),
    'the in-memory map holds the pair (session → member)', pairs)
  let rows = null
  for (let i = 0; i < 40; i++) {
    try { const v = K.store.read('member_sessions'); if (Array.isArray(v) && v.length) { rows = v; break } } catch { /* not open yet */ }
    await new Promise((r) => setTimeout(r, 50))
  }
  ok(Array.isArray(rows) && rows.some((r) => r && r.session === 'child-early-2' && r.member === 'r-1'),
    'F-116a: the shared fold carries {member:"r-1", session:"child-early-2"} — a second kernel can read it', rows)
}

// ── §3 THE GUARD: an unnamed session may not dismiss a temp worker it cannot prove it hired ──────────
{
  console.log('§3 F-116b — an unmapped non-root session is refused BY NAME; the office and a mapped caller are not')
  const root = await mkRoot()
  const b = await bootPlugin(root)
  const K = b.handle.kernel
  await K.members.hire({ id: 'r-1', slot: 'member' })
  await K.members.hire({ id: 'r-2', slot: 'member' })
  await K.members.hire({ id: 'r-t3', slot: 'temp', by: 'r-1' })
  const row = K.members.roster().find((m) => m.id === 'r-t3')
  ok(row && row.hiredBy === 'r-1', 'the fixture really carries the attribution (`hiredBy:"r-1"`)', row)

  // ① an unmapped CHILD session (member child sessions are bare uuids; the office/root session starts with `session-`)
  const stranger = await call(b, 'vibe_v5_fire', { id: 'r-t3', reason: '越权测试' }, { kernel: K, agent: { id: 'aaaaaaaa-1111-4111-8111-111111111111' } })
  ok(stranger.parsed && stranger.parsed.ok === false && stranger.parsed.code === 'VMU_FIRE_CALLER_UNKNOWN',
    'F-116b: an unnamed calling session is refused `VMU_FIRE_CALLER_UNKNOWN` (run 116 allowed it with ok:true)', stranger)
  ok(stranger.parsed && stranger.parsed.ownership === 'not-own' && stranger.parsed.callerUnknown === true,
    'the refusal still discloses ownership/callerUnknown (the receipt keeps the facts)', stranger.parsed)
  ok(stranger.parsed && typeof stranger.parsed.hint === 'string' && stranger.parsed.hint.includes('memberBySession'),
    'the hint names the mechanism (memberBySession) and the two legitimate roads', stranger.parsed && stranger.parsed.hint)

  // ② the OFFICE: a root session id is not a member child, and a seam call carries no exec at all — both allowed
  const officeRoot = await call(b, 'vibe_v5_fire', { id: 'r-t3', reason: '编制调整' }, { kernel: K, agent: { id: 'session-root' } })
  ok(officeRoot.parsed && officeRoot.parsed.ok === true,
    'a ROOT session (office) is still allowed to dismiss a temp worker', officeRoot)
  const officeSeam = await call(b, 'vibe_v5_fire', { id: 'r-t3', reason: '编制调整' }, { kernel: K })
  ok(officeSeam.parsed && officeSeam.parsed.ok === true && officeSeam.parsed.callerUnknown === true,
    'a seam call with no exec (the office path) is allowed and still disclosed as callerUnknown', officeSeam)

  // ③ a MAPPED caller: the owner may dismiss its own worker — and this is the path F-116a makes reachable
  await K.members.hire({ id: 'r-t4', slot: 'temp', by: 'r-1' })
  await K.turn.restoreMemberSessions([{ member: 'r-1', session: 'child-map-1' }])
  const owner = await call(b, 'vibe_v5_fire', { id: 'r-t4', reason: '任务完成' }, { kernel: K, agent: { id: 'child-map-1' } })
  ok(owner.parsed && owner.parsed.ok === true && owner.parsed.caller === 'r-1' && owner.parsed.ownership === 'own',
    'a mapped member session fires its OWN worker: caller r-1, ownership "own"', owner)
  // and a DIFFERENT member, mapped too, is refused on ownership
  await K.turn.restoreMemberSessions([{ member: 'r-2', session: 'child-map-2' }])
  const other = await call(b, 'vibe_v5_fire', { id: 'r-t4', reason: '不是我的' }, { kernel: K, agent: { id: 'child-map-2' } })
  ok(other.parsed && other.parsed.ok === false && other.parsed.code === 'VMU_NOT_PERMITTED' && other.parsed.ownership === 'not-own',
    'a mapped OTHER member is refused `VMU_NOT_PERMITTED` with ownership "not-own"', other)
}

for (const d of roots) { try { await rm(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* best effort */ } }
console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
