#!/usr/bin/env node
// A7 — THE DISMISSAL RIGHT NOW NAMES ITS SCOPE (round 31 follow-up, Lead order).
//
// seat-faces.js declares `vibe_v5_fire: allow { chair: true, member: true, temp: false }`, and the sentence behind
// that decision is 「院士、常驻研究员各自的…」/「常驻研究员解雇**自己雇的**那名临时工」. Measured before this card:
// the handler ended ANY live roster row — a member seat could dismiss the academician, and the sentence was prose
// with nothing behind it (the live run's "所办替院士做裁决" family of defects).
//
// WHAT IS TESTED HERE, AND WITH WHICH KERNEL
//   §1  the academician seat is refused BY NAME — on the REAL boot, through the real spec, by every caller shape
//   §2/§3  a member seat's ownership scope — on a STUB kernel whose roster PUBLISHES the attribution field, because
//       this kernel's roster publishes none (kernel/members.js:118-123 carries {id, slot, state, since, wakes}) and
//       a branch that must not be invented in production still has to be PROVED executable. The stub is a kernel
//       that keeps the record; the live path is §4.
//   §4  the LIVE path of that same question: allowed + `ownership: "unrecorded"` + `ownershipMeans` that says the
//       roster holds no hiring record (allowed-and-disclosed, never pretended and never made un-dismissable)
//   §5  a chair caller is NOT scoped to "its own": the chair runs staffing, so any temp worker is dismissable
//   §6  an unattributable caller is DISCLOSED (`callerUnknown: true`), not silently allowed and not refused on a
//       fact the call does not carry
//   §7  a temp seat has no dismissal right (the declaration says so; the handler holds the same rule for seam calls)
//   §8  the disclosure fields travel on REFUSALS too (a receipt, not a throw — `host.js` keeps only
//       code/message/hint on a throw), and the tool description teaches the two rules.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const CORE = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const core = await import(pathToFileURL(CORE).href)
const PACK = core.PACK
const fireTool = (PACK.tools || []).find((t) => t && t.name === 'vibe_v5_fire')

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
const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-a7-fire-')); roots.push(d); return d }
// A caller the turn-tool record names: `resolveTurnMember` reads `kernel.currentTurnMember()` for a non-root agent id.
const asMember = (k, id) => { k.setActiveTurnMember(id); return { kernel: k, agent: { id: 'agent-' + id } } }

// A roster row WITH the attribution field — a kernel that keeps the record (this one does not; §4 measures that).
const stubKernel = (rows, { ended = [], caller = null } = {}) => ({
  members: {
    roster: () => rows.slice(),
    end: async (id, reason) => { ended.push({ id, reason }); return { ok: true, id, reason } },
  },
  currentTurnMember: () => caller,
})
const stubCall = (args, kernel, caller) => fireTool.handler(args, { kernel, exec: caller === null ? { kernel } : { kernel, agent: { id: 'agent-' + caller } } })

// ── §1 the academician seat is not dismissable through this face ─────────────────────────────────────
{
  console.log('§1 A7 — the academician seat is refused BY NAME (real boot, real spec)')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  await k.members.hire({ id: 'r-t1', slot: 'temp' })
  const self = await call(b, 'vibe_v5_fire', { id: 'r-acad' }, asMember(k, 'r-acad'))
  ok(self.parsed && self.parsed.ok === false && self.parsed.code === 'VMU_NOT_PERMITTED',
    'the chair may not dismiss a chair seat: VMU_NOT_PERMITTED', self.parsed || self)
  ok(self.parsed && /academician seat is not dismissable/.test(String(self.parsed.message)) && /slot "chair"/.test(String(self.parsed.message)),
    'the message says the academician seat is not dismissable and names the slot', self.parsed && self.parsed.message)
  ok(self.parsed && /vibe_vmu_control \{ action: "fire"/.test(String(self.parsed.hint)),
    'the hint points at the face that DOES settle the chair seat', self.parsed && self.parsed.hint)
  ok(self.parsed && self.parsed.targetSeat === 'chair' && self.parsed.ownership === 'unrecorded',
    'the refusal carries the same disclosure fields (targetSeat/ownership)', self.parsed)
  const chair = k.members.roster().filter((m) => String(m.id) === 'r-acad')[0]
  ok(chair && String(chair.slot) === 'chair' && String(chair.state) === 'live',
    'the chair is STILL live in the chair seat (nothing was ended)', chair)
  const memberOnChair = await call(b, 'vibe_v5_fire', { id: 'r-acad' }, asMember(k, 'r-1'))
  ok(memberOnChair.parsed && memberOnChair.parsed.code === 'VMU_NOT_PERMITTED' && /academician seat/.test(String(memberOnChair.parsed.message)),
    'a member seat is refused the same way (the chair guard is not caller-specific)', memberOnChair.parsed)
}

// ── §2 a member seat may not dismiss ANOTHER member's temp worker ────────────────────────────────────
{
  console.log('§2 A7 — a member seat may not dismiss another member\'s temp worker (stub roster that PUBLISHES attribution)')
  const rows = [
    { id: 'r-1', slot: 'member', state: 'live' },
    { id: 'r-2', slot: 'member', state: 'live' },
    { id: 'r-t9', slot: 'temp', state: 'live', hiredBy: 'r-2' },
  ]
  const ended = []
  const k = stubKernel(rows, { ended, caller: 'r-1' })
  const r = await stubCall({ id: 'r-t9' }, k, 'r-1')
  ok(r && r.ok === false && r.code === 'VMU_NOT_PERMITTED', 'dismissing another member\'s temp worker is refused by name', r)
  ok(r && r.ownership === 'not-own', 'the refusal says ownership:"not-own"', r && r.ownership)
  ok(r && /attributed to "r-2"/.test(String(r.message)), 'the message names the member the roster attributes the worker to', r && r.message)
  ok(r && ended.length === 0, 'nothing was ended (the refusal is upstream of the members face)', ended)
  ok(r && r.targetSeat === 'temp' && typeof r.ownershipMeans === 'string' && /`hiredBy`/.test(r.ownershipMeans),
    'the refusal carries targetSeat and names the field it read', r && r.ownershipMeans)
}

// ── §3 a member seat MAY dismiss its own temp worker ─────────────────────────────────────────────────
{
  console.log('§3 A7 — a member seat dismisses its OWN temp worker (stub roster that PUBLISHES attribution)')
  const rows = [
    { id: 'r-1', slot: 'member', state: 'live' },
    { id: 'r-t9', slot: 'temp', state: 'live', invitedBy: 'r-1' },
  ]
  const ended = []
  const k = stubKernel(rows, { ended, caller: 'r-1' })
  const r = await stubCall({ id: 'r-t9', reason: 'probation failed' }, k, 'r-1')
  ok(r && r.ok === true, 'the owner may dismiss its own temp worker', r)
  ok(r && r.ownership === 'own', 'the receipt says ownership:"own"', r && r.ownership)
  ok(r && /\`invitedBy\`/.test(String(r.ownershipMeans)) && /own temp worker/.test(String(r.ownershipMeans)),
    'ownershipMeans names the field and says it is the caller\'s own worker', r && r.ownershipMeans)
  ok(ended.length === 1 && ended[0].id === 'r-t9', 'the members face really ended that seat', ended)
  ok(r && r.slot === 'temp' && r.targetSeat === 'temp', 'the receipt keeps `slot` and adds `targetSeat`', r && { slot: r.slot, targetSeat: r.targetSeat })
}

// ── §4 the LIVE path: this roster records no attribution ─────────────────────────────────────────────
{
  console.log('§4 A7 — the LIVE path: allowed + `unrecorded` + means (this kernel keeps no hiring record)')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  await k.members.hire({ id: 'r-t1', slot: 'temp' })
  const r = await call(b, 'vibe_v5_fire', { id: 'r-t1' }, asMember(k, 'r-1'))
  ok(r.parsed && r.parsed.ok === true, 'a member seat may dismiss a temp worker whose hirer this roster does not record', r.parsed || r)
  ok(r.parsed && r.parsed.ownership === 'unrecorded', 'the receipt says ownership:"unrecorded"', r.parsed && r.parsed.ownership)
  ok(r.parsed && /NO hiring attribution/.test(String(r.parsed.ownershipMeans)) && /cannot be answered/.test(String(r.parsed.ownershipMeans)),
    'ownershipMeans says the roster holds no hiring record and does not pretend otherwise', r.parsed && r.parsed.ownershipMeans)
  ok(r.parsed && r.parsed.caller === 'r-1' && r.parsed.callerSeat === 'member' && r.parsed.callerUnknown === false,
    'the receipt names the caller the turn-tool record resolved', r.parsed && { caller: r.parsed.caller, callerSeat: r.parsed.callerSeat, callerUnknown: r.parsed.callerUnknown })
  const row = k.members.roster().filter((m) => String(m.id) === 'r-t1')[0]
  ok(!row || String(row.state) !== 'live', 'the temp seat really ended (the disclosure did not become a no-op)', row)
}

// ── §5 the chair is not scoped to "its own" temp workers ─────────────────────────────────────────────
{
  console.log('§5 A7 — the chair runs staffing: any temp worker is dismissable (no "own" restriction)')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  await k.members.hire({ id: 'r-t1', slot: 'temp' })
  const r = await call(b, 'vibe_v5_fire', { id: 'r-t1' }, asMember(k, 'r-acad'))
  ok(r.parsed && r.parsed.ok === true && r.parsed.callerSeat === 'chair',
    'the chair dismisses a temp worker that was not hired by it (chair is not restricted)', r.parsed || r)
  ok(r.parsed && r.parsed.ownership === 'unrecorded', 'the receipt is still explicit about what the roster does not record', r.parsed && r.parsed.ownership)
}

// ── §6 an unattributable caller is disclosed, not guessed at ─────────────────────────────────────────
{
  console.log('§6 A7 — an unattributable caller is DISCLOSED (`callerUnknown:true`), not silently allowed or refused')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-t1', slot: 'temp' })
  const r = await call(b, 'vibe_v5_fire', { id: 'r-t1' }, { kernel: k })
  ok(r.parsed && r.parsed.ok === true && r.parsed.caller === null && r.parsed.callerUnknown === true,
    'a call with no resolvable member identity is allowed AND disclosed as callerUnknown', r.parsed || r)
  ok(r.parsed && r.parsed.callerSeat === null, 'callerSeat is null rather than invented', r.parsed && r.parsed.callerSeat)
  const onChair = await call(b, 'vibe_v5_fire', { id: 'r-acad' }, { kernel: k })
  ok(onChair.parsed && onChair.parsed.ok === false && onChair.parsed.code === 'VMU_NOT_PERMITTED' && onChair.parsed.callerUnknown === true,
    'the chair guard still applies to an unattributed caller (disclosure does not weaken guard ①)', onChair.parsed || onChair)
}

// ── §7 a temp seat has no dismissal right ────────────────────────────────────────────────────────────
{
  console.log('§7 A7 — slot "temp" has no dismissal right')
  const rows = [
    { id: 'r-tmp', slot: 'temp', state: 'live' },
    { id: 'r-t9', slot: 'temp', state: 'live' },
  ]
  const ended = []
  const k = stubKernel(rows, { ended, caller: 'r-tmp' })
  const r = await stubCall({ id: 'r-t9' }, k, 'r-tmp')
  ok(r && r.ok === false && r.code === 'VMU_NOT_PERMITTED' && /no dismissal right/.test(String(r.message)),
    'the handler holds the declaration\'s `temp:false` for a seam caller too', r)
  ok(ended.length === 0, 'nothing ended', ended)
  // …and on the real boot the SEAT FACE refuses that caller even earlier, with its own code.
  const root = await mkRoot()
  const b = await boot({ root })
  const kk = b.handle.kernel
  await kk.members.hire({ id: 'r-acad', slot: 'chair' })
  await kk.members.hire({ id: 'r-t1', slot: 'temp' })
  await kk.members.hire({ id: 'r-t2', slot: 'temp' })
  const live = await call(b, 'vibe_v5_fire', { id: 'r-t2' }, asMember(kk, 'r-t1'))
  ok(live.parsed && live.parsed.ok === false && live.parsed.code === 'VMU_TOOL_NOT_IN_FACE',
    'on the real boot the seat face refuses a temp caller before the handler (VMU_TOOL_NOT_IN_FACE)', live.parsed || live)
  ok(kk.members.roster().filter((m) => String(m.id) === 'r-t2' && String(m.state) === 'live').length === 1,
    'the other temp worker is untouched', kk.members.roster().map((m) => [m.id, m.state]))
}

// ── §8 refusal shape + the taught description ────────────────────────────────────────────────────────
{
  console.log('§8 A7 — the disclosure travels on refusals, and the description teaches the scope')
  const charlie = await call((await boot({ root: await mkRoot() })), 'vibe_v5_fire', { id: 'nobody' }, {})
  ok(charlie.parsed && charlie.parsed.code === 'VMU_NO_SUCH_OBJECT',
    'an id that is not on the roster keeps the existing named refusal (VMU_NO_SUCH_OBJECT)', charlie.parsed || charlie)
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  const refusal = await call(b, 'vibe_v5_fire', { id: 'r-acad' }, asMember(k, 'r-acad'))
  ok(refusal.parsed && refusal.parsed.ok === false && refusal.parsed.code === 'VMU_NOT_PERMITTED' &&
    'targetSeat' in refusal.parsed && 'ownership' in refusal.parsed && 'ownershipMeans' in refusal.parsed && 'callerUnknown' in refusal.parsed,
    'the refusal is a RECEIPT carrying targetSeat/ownership/ownershipMeans/callerUnknown (a throw would lose them)', refusal.parsed)
  const desc = String((fireTool && fireTool.description) || '')
  ok(/academician seat is NOT dismissable/.test(desc) && /own temp workers/.test(desc) && /targetSeat/.test(desc),
    'the tool description states both rules and the receipt fields (prompt == mechanism)', desc)
  const declared = core.PACK.toolFaces && core.PACK.toolFaces.member ? core.PACK.toolFaces.member.deny || [] : []
  ok(!(declared || []).includes('vibe_v5_fire'),
    'the member seat still HAS the face in the declaration (this card narrowed the scope, it did not take the right away)', declared.filter((n) => /fire/.test(String(n))))
}

console.log('=== VMU A7 FIRE SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
await Promise.all(roots.map((d) => rm(d, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})))
process.exit(failed ? 1 : 0)
