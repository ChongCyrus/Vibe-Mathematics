#!/usr/bin/env node
// vmu RUN 51 — A DECLARED ADMIN TOKEN IS NOT THE RESOLVED ADMIN SET.
//
// THE DEBT (recorded in run 47, still open in run 50): `chat status` printed `admins:["chair"]` — the DECLARED
// `vmu.chat.admins` entries as written — and `adminsMeans` said the seat is "resolved by the kernel's seat seam at
// the moment of the act". So a reader asking "who may administer right now?" got the declaration and had to resolve
// it by hand against the roster. Run 51 offered the other direction of the same seam (`seatsOf()`), and the status
// read now reports both: `admins` (as written) next to `adminsResolved` (who holds each entry at this read).
//
// WHAT THIS SUITE PROVES: (1) a seat entry reports the CURRENT holder; (2) a member-id entry reports that member;
// (3) an entry that matches neither a member nor a seat is reported as `unresolved` rather than dropped or granted;
// (4) an assembly with no roster seam says "cannot resolve here", which is different from "nobody is an admin".
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const CHAT = join(REPO, 'vibe-math-vmu', 'kernel', 'chat.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const chatMod = await import(pathToFileURL(CHAT).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ asleep: true, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message } }
  try { return JSON.parse(raw) } catch { return { raw } }
}

// ── the kernel assembly: a roster seam exists, so the declaration resolves ──────────────────────────
const root = await mkdtemp(join('D:/_tmp', 'vmu-run51-admins-'))
try {
  const a = await boot({ root, vmu: { chat: { admins: ['chair', 'r-1', 'ghost', 'member'] } } })
  const k = a.handle.kernel
  await k.members.hire({ id: 'r-a', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const st = await callJSON(a, 'vibe_vmu_chat', { action: 'status' })
  ok(st && st.ok === true, 'the status read answers', st)
  ok(Array.isArray(st.admins) && st.admins.includes('chair') && st.admins.includes('r-1') && st.admins.includes('ghost') && st.admins.includes('member'),
    'the DECLARED entries are reported as written', st.admins)
  const rows = Array.isArray(st.adminsResolved) ? st.adminsResolved : []
  const seat = rows.find((r) => r.entry === 'chair')
  ok(!!seat && seat.kind === 'seat' && Array.isArray(seat.members) && seat.members.includes('r-a'),
    'a SEAT entry reports whoever currently holds it (r-a)', seat)
  const named = rows.find((r) => r.entry === 'r-1')
  ok(!!named && named.kind === 'member' && named.members.length === 1 && named.members[0] === 'r-1',
    'a MEMBER-id entry reports that member', named)
  const ghost = rows.find((r) => r.entry === 'ghost')
  ok(!!ghost && ghost.kind === 'unresolved' && ghost.members.length === 0,
    'an entry matching neither a member nor a seat is reported as unresolved (grants nobody, not dropped)', ghost)
  ok(typeof st.adminsResolvedMeans === 'string' && st.adminsResolvedMeans.includes('resolved against the live roster'),
    'the read says how the resolution was done', st.adminsResolvedMeans)
  // the seat's holder set is the LIVE roster, not a snapshot: a second member in the same slot is reported too
  await k.members.hire({ id: 'r-b', slot: 'member' })
  const st2 = await callJSON(a, 'vibe_vmu_chat', { action: 'status' })
  const seat2 = (st2.adminsResolved || []).find((r) => r.entry === 'member')
  ok(!!seat2 && seat2.kind === 'seat' && seat2.members.includes('r-1') && seat2.members.includes('r-b'),
    'a seat reports EVERY current holder read from the live roster', seat2)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

// ── a bare chat face (no roster seam): "cannot resolve" must not be printed as "nobody" ─────────────
{
  const chat = chatMod.createChat({ clock: () => 1000, settings: { 'vmu.chat.admins': ['chair'] } })
  const st = chat.status()
  ok(st.adminsResolved === null, 'without a roster seam the resolved set is null', st.adminsResolved)
  ok(typeof st.adminsResolvedMeans === 'string' && st.adminsResolvedMeans.includes('cannot resolve'),
    'and the read says "cannot resolve", not "nobody is an admin"', st.adminsResolvedMeans)
}

console.log('\n=== VMU RUN 51 CHAT ADMINS RESOLVED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
