// tests/vmu-resume-lock-and-marks.test.mjs — Round 4 (task-28): F18 (a real lock user, released on EVERY exit) and
// F51 (the durable restart marker), plus the `budget` projection seam that Round 3 recorded as missing.
//
// THE CONTRACT THIS FILE ENCODES
//   F18: `recover()` is an EXCLUSIVE section when a lock seam is injected. Every exit releases it — the happy
//        path, the early "no store" return, and every throw — and a second concurrent recovery is refused BY NAME
//        without touching the holder's lock.
//   F51: "this session resumed an existing institute, generation N, and here is what the restart cost" is a
//        durable fact (the `resume` key's recoveries[]), readable from status().restart / resume.restart().
//   C:   `budget` now has a public snapshot()/restore() pair, and what it projects is SPENDING (the declaration
//        is re-resolved from settings, never restored from disk).
//
// Last line: === VMU RESUME LOCK+MARKS: N passed, M failed ===
import { createResume } from '../vibe-math-vmu/kernel/resume.js'
import { createStorePolicy } from '../vibe-math-vmu/kernel/storepolicy.js'
import { createBudget } from '../vibe-math-vmu/kernel/budget.js'
import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'
import { createMembers } from '../vibe-math-vmu/kernel/members.js'
import { createBallot } from '../vibe-math-vmu/kernel/ballot.js'
import { createMeeting } from '../vibe-math-vmu/kernel/meeting.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const refuses = async (code, name, fn) => {
  try { await fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, (e && e.code) + ' | ' + (e && e.message)) }
}

const mkStore = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  return {
    export: () => ({ version: 1, keys: Object.fromEntries(data) }),
    read: (k) => copy(data.get(k)),
    patch: (k, fn) => { const next = fn(copy(data.get(k))); data.set(k, next); return { ok: true, key: k } },
    _raw: data,
  }
}
let NOW = 1000
const clock = () => NOW
const mkLock = (settings) => createStorePolicy({ settings: Object.assign({ 'vmu.store.lock': true }, settings || {}), clock, log: () => {} })

// ── F18 · 1. the happy path acquires once and releases in the finally ───────────────────────────────────────
{
  const store = mkStore({ work: [] })
  const lock = mkLock()
  const r = createResume({ store, work: createWorkLedger({ store, clock: () => '2026-03-01T00:00:00.000Z' }), lock, clock })
  const rep = await r.recover({ reason: 'f18-happy' })
  ok(rep.ok === true, 'the recovery succeeds under the lock', rep.ok)
  const st = r.status().lock
  ok(st.attached === true && st.acquisitions === 1 && st.releases === 1 && st.held === false,
    'acquired exactly once and released in the finally', st)
  ok(lock.status().locks === 0, 'the lock service reports nothing held afterwards', lock.status().locks)
}

// ── F18 · 2. the THROW path releases too (the branch the evidence file said was unproven) ───────────────────
{
  const broken = {
    export: () => { throw new Error('fold unreadable') },
    read: () => undefined,
    patch: () => ({ ok: true }),
  }
  const lock = mkLock()
  const r = createResume({ store: broken, lock, clock })
  await refuses('VMU_RESUME_UNAVAILABLE', 'a broken fold makes the recovery refuse by name', () => r.recover({ reason: 'f18-throw' }))
  const st = r.status().lock
  ok(st.acquisitions === 1 && st.releases === 1 && st.held === false && lock.status().locks === 0,
    'the THROW path still releases the lock (finally, not happy-path-only)', { st, held: lock.status().locks })
}

// ── F18 · 3. the EARLY RETURN path releases too (no store ⇒ a report, not a throw) ─────────────────────────
{
  const lock = mkLock()
  const r = createResume({ lock, clock })
  const rep = await r.recover({ reason: 'f18-no-store' })
  ok(rep.ok === false && rep.code === 'VMU_RESUME_UNAVAILABLE', 'with no store the recovery reports instead of throwing', rep.code)
  ok(r.status().lock.acquisitions === 1 && r.status().lock.releases === 1 && lock.status().locks === 0,
    'the early-return path released the lock as well', r.status().lock)
}

// ── F18 · 4. a second concurrent recovery is refused by name and does NOT touch the holder's lock ──────────
{
  const store = mkStore({ work: [] })
  const lock = mkLock()
  const held = lock.acquire({ name: 'recovery', by: 'operator' })
  ok(held.ok === true && lock.status().locks === 1, 'the lock is held by somebody else', held)
  const r = createResume({ store, work: createWorkLedger({ store, clock }), lock, clock })
  let err = null
  try { await r.recover({ reason: 'f18-busy' }) } catch (e) { err = e }
  ok(!!err && err.code === 'VMU_RESUME_BUSY', 'the second recovery is refused BY NAME', err && err.code)
  ok(err.detail && err.detail.lockCode === 'VMU_CONFLICT' && typeof err.detail.waitedMs === 'number' && err.detail.attempts >= 1,
    'the refusal carries the lock code and how long it waited', err.detail)
  ok(/operator/.test(String(err.message)), 'the refusal NAMES the holder (the lock seam carries it in its message)', err.message)
  ok(lock.status().locks === 1, 'the refused caller did NOT release somebody else\'s lock', lock.status().locks)
  ok(r.status().lock.busyRefusals === 1 && r.status().lock.releases === 0, 'the busy refusal is counted and nothing was released by us', r.status().lock)
  lock.release({ name: 'recovery' })
  const rep = await r.recover({ reason: 'f18-after-release' })
  ok(rep.ok === true && lock.status().locks === 0, 'once the holder releases, the recovery runs and releases', { ok: rep.ok, held: lock.status().locks })
}

// ── F18 · 5. an UNDECLARED lock is a zero-mechanism pass-through (still released, never held) ───────────────
{
  const store = mkStore({ work: [] })
  const lock = createStorePolicy({ settings: {}, clock, log: () => {} })   // vmu.store.lock unset
  const r = createResume({ store, work: createWorkLedger({ store, clock }), lock, clock })
  const rep = await r.recover({ reason: 'f18-nodecl' })
  ok(rep.ok === true && r.status().lock.attached === true && r.status().lock.acquisitions === 1,
    'with nothing declared the lock face is still consulted (and says it locked nothing)', r.status().lock)
  ok(r.status().lock.held === false && lock.status().locks === 0, 'a declared no-op holds nothing, and the finally still runs')
}

// ── F51 · the durable restart marker ───────────────────────────────────────────────────────────────────────
{
  const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const rA = createResume({ store, work: createWorkLedger({ store, clock }), clock })
  ok(rA.status().restart.generation === 0 && rA.status().restart.restarted === false,
    'before any recovery the marker says "first start, not a resume"', rA.status().restart)
  const w = createWorkLedger({ store, clock: () => '2026-03-02T00:00:00.000Z' })
  await w.start({ owner: 'r-1', kind: 'proof', objective: 'L' })
  const rB = createResume({ store, work: w, clock })
  const rep = await rB.recover({ reason: 'f51-restart' })
  const m = rB.status().restart
  ok(m.generation === 1 && m.restarted === true && m.reason === 'f51-restart' && m.interrupted === 1,
    'after a recovery the marker names the generation, the reason and the interrupted count', m)
  ok(m.readBack === true && typeof m.at === 'number' && m.durableKey === 'resume',
    'the marker is read from the durable record and carries the read-back result', { readBack: m.readBack, key: m.durableKey })
  ok(typeof rB.restart === 'function' && rB.restart().generation === 1, 'resume.restart() is the same view', rB.restart().generation)
  // PROCESS 2 over the same store: the generation is DURABLE (it counts restarts, not calls in one process)
  const rC = createResume({ store, work: createWorkLedger({ store, clock }), clock })
  await rC.recover({ reason: 'f51-restart-2' })
  ok(rC.status().restart.generation === 2, 'a second restart increments the durable generation', rC.status().restart.generation)
  // a degraded projection is part of the marker (what the restart COST)
  const rD = createResume({
    store, clock,
    faces: { members: { key: 'members', mode: 'state', snapshot: () => ({ apiVersion: 1, face: 'members', v: 1, data: { members: [] } }), restore: () => ({ ok: false, code: 'VMU_RESUME_RESTORE_CONFLICT', message: 'refused' }) } },
  })
  store._raw.set('members', { v: 1, mode: 'state', key: 'members', seq: 0, incomplete: false, entries: [], value: { apiVersion: 1, face: 'members', v: 1, data: { members: [] } } })
  await rD.recover({ reason: 'f51-degraded' })
  ok(rD.status().restart.unhydrated.includes('members'), 'the marker lists the faces the restart could NOT restore', rD.status().restart.unhydrated)
}

// ── C · the budget seam: spending is projected, the declaration is not ─────────────────────────────────────
{
  const store = mkStore({ resume: { v: 1, counters: {}, recoveries: [] } })
  const settings = { 'vmu.budget.tokens': 1000, 'vmu.budget.reserveRatio': 0.2 }
  const bA = createBudget({ clock, settings, log: () => {} })
  bA.open({ scope: 'meeting:mt-1', limits: { tokens: 100 } })
  bA.charge({ scope: 'meeting:mt-1', kind: 'tokens', amount: 40 })
  const snap = bA.snapshot()
  ok(snap.face === 'budget' && Array.isArray(snap.data.scopes) && snap.data.scopes.length === 1, 'budget.snapshot() carries the scopes', snap.face)
  const text = JSON.stringify(snap.data)
  ok(text.indexOf('reserveRatio') === -1 && text.indexOf('"totals"') === -1,
    'the DECLARATION (reserveRatio/totals) is NOT in the snapshot (it is re-resolved from settings)', text.slice(0, 80))
  const rA = createResume({ store, clock })
  await rA.read()
  const attached = rA.attachProjection({
    target: bA, methods: ['open', 'charge', 'reserve'], key: 'budget', mode: 'state',
    snapshot: () => bA.snapshot(), restore: (v) => bA.restore(v), list: () => bA.list().items,
  })
  ok(attached.writeThrough === true && attached.missing.length === 0, 'the budget face is attachable with write-through', attached)
  bA.charge({ scope: 'meeting:mt-1', kind: 'tokens', amount: 5 })   // 45 spent
  await new Promise((r) => setTimeout(r, 0))
  ok(!!store._raw.get('budget'), 'the spending was written through to the budget key')
  // PROCESS 2
  const bB = createBudget({ clock, settings, log: () => {} })
  const rB = createResume({ store, clock })
  await rB.read()
  rB.attachProjection({
    target: bB, methods: ['open', 'charge', 'reserve'], key: 'budget', mode: 'state',
    snapshot: () => bB.snapshot(), restore: (v) => bB.restore(v), list: () => bB.list().items,
  })
  const h = await rB.hydrate({ keys: ['budget'] })
  ok(h.ok === true && h.unhydrated.length === 0, 'the budget projection hydrates cleanly', h.unhydrated)
  ok(bB.remaining({ scope: 'meeting:mt-1' }).tokens === 55, 'the restarted ledger remembers 45 of 100 tokens spent', bB.remaining({ scope: 'meeting:mt-1' }))
  // a DIFFERENT snapshot over a live ledger is refused by name (no silent half-overwrite)
  let conflict = null
  try { bB.restore({ apiVersion: 1, face: 'budget', v: 1, data: { scopes: [['other', { scope: 'other' }]] }, counters: {} }) } catch (e) { conflict = e }
  ok(!!conflict && conflict.code === 'VMU_RESUME_RESTORE_CONFLICT', 'restoring a different snapshot without { replace: true } is refused by name', conflict && conflict.code)
  const replaced = bB.restore({ apiVersion: 1, face: 'budget', v: 1, data: { scopes: [['other', { scope: 'other', limits: { tokens: 10 }, used: { tokens: 1 } }]] }, counters: {} }, { replace: true })
  ok(replaced.ok === true && bB.remaining({ scope: 'other' }).tokens === 9, 'an explicit replace restores the given spending', replaced)
}

// ── C · members: a SINGLETON face (nullable) — the seam works through the projection engine ────────────────
{
  const store = mkStore({ resume: { v: 1, counters: {}, recoveries: [] } })
  const slots = [{ id: 'researcher', capacity: 2 }]
  const mA = createMembers({ slots, clock })
  const rA = createResume({ store, clock })
  await rA.read()
  const at = rA.attachProjection({
    target: mA, methods: ['hire', 'end', 'assignRole'], key: 'members', mode: 'state',
    snapshot: () => mA.snapshot(), restore: (v) => mA.restore(v), list: () => mA.roster() || [],
  })
  ok(at.writeThrough === true && at.missing.length === 0, 'members is attachable (singleton, with a roster) and write-through', at)
  const hired = await mA.hire({ id: 'r-1', slot: 'researcher' })
  ok(hired.ok === true, 'a member is hired', hired)
  await new Promise((r) => setTimeout(r, 0))
  ok(!!store._raw.get('members'), 'the roster was written through')
  // PROCESS 2
  const mB = createMembers({ slots, clock })
  const rB = createResume({ store, clock })
  await rB.read()
  rB.attachProjection({
    target: mB, methods: ['hire', 'end', 'assignRole'], key: 'members', mode: 'state',
    snapshot: () => mB.snapshot(), restore: (v) => mB.restore(v), list: () => mB.roster() || [],
  })
  const h = await rB.hydrate({ keys: ['members'] })
  ok(h.ok === true && h.unhydrated.length === 0, 'the roster hydrates cleanly', h.unhydrated)
  ok(mB.roster().length === 1 && mB.roster()[0].id === 'r-1', 'the restarted roster holds the hired member', mB.roster())
  const again = mB.restore(mB.snapshot())
  ok(again.ok === true && again.idempotent === true, 'restoring the same snapshot twice is idempotent (the face contract)', again)
}

// ── C · meeting/ballot are PER-INSTANCE FACTORIES: the conclusion is recorded here, not papered over ───────
// `kernel/index.js` builds them per meeting / per ballot (inside helpers), so "the ballot snapshot" is ambiguous:
// a single-instance projection would silently keep only the LAST one. The two singletons that DO own the live
// session (`meetings`, `ballotbox`) are the recommended attachment; a real multiset needs an instance registry.
{
  const b1 = createBallot({ clock })
  const b2 = createBallot({ clock })
  ok(b1 !== b2 && typeof b1.snapshot === 'function' && typeof b2.snapshot === 'function',
    'two ballots are independent instances, each with its own seam', { distinct: b1 !== b2 })
  const m1 = createMeeting({ clock })
  const m2 = createMeeting({ clock })
  ok(m1 !== m2 && m1.snapshot().face === 'meeting' && m2.snapshot().face === 'meeting',
    'two meetings are independent instances too', { face1: m1.snapshot().face, face2: m2.snapshot().face })
  const seeded = createBallot({ clock })
  seeded.open()
  ok(seeded.snapshot().data !== undefined && createBallot({ clock }).snapshot().data !== undefined,
    'a live ballot and an idle ballot produce different states, so "one snapshot per face key" cannot hold both')
}

// ── F51b · live-child reconciliation: absent port is NAMED, a stale child is NAMED, nothing is spawned ──────
{
  // (a) no port at all: the recovery still succeeds and says it could not check
  const storeA = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const rA = createResume({ store: storeA, work: createWorkLedger({ store: storeA, clock }), clock })
  const repA = await rA.recover({ reason: 'f51b-no-port' })
  const cA = repA.steps.filter((s) => s.step === 'children')[0]
  ok(repA.ok === true && cA && cA.attached === false && cA.code === 'VMU_RESUME_CHILDREN_UNAVAILABLE',
    'without a children port the step is NAMED and does not fail the recovery', cA)
  ok(rA.status().restart.missingChildren.length === 0, 'no port ⇒ nothing is claimed about missing children', rA.status().restart.missingChildren)

  // (b) a port that says the member's child is gone: the member is NAMED, and the engine NEVER spawns
  const membersRows = [{ id: 'r-1', childId: 'c-live', slot: 'researcher' }, { id: 'r-2', childId: 'c-gone', slot: 'researcher' }]
  const storeB = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const spawned = []
  const rB = createResume({
    store: storeB, work: createWorkLedger({ store: storeB, clock }), clock,
    children: { parentId: () => 'root-1', list: async (parentId) => { ok(parentId === 'root-1', 'the port is asked about the right parent', parentId); return ['c-live'] } },
    faces: { members: { key: 'members', mode: 'state', snapshot: () => ({ apiVersion: 1, face: 'members', v: 1, data: { members: membersRows } }), restore: () => ({ ok: true, restored: [] }), list: () => membersRows } },
  })
  const repB = await rB.recover({ reason: 'f51b-stale-child' })
  const cB = repB.steps.filter((s) => s.step === 'children')[0]
  ok(repB.ok === true && cB.attached === true && cB.live === 1 && cB.checked === 2, 'the port is consulted and the counts are reported', cB)
  ok(cB.missing.length === 1 && cB.missing[0].member === 'r-2' && cB.missing[0].childId === 'c-gone',
    'the member whose child the host no longer lists is NAMED', cB.missing)
  ok(spawned.length === 0 && /does NOT spawn/.test(String(cB.note)), 'the engine does NOT spawn (that is the assembly policy)', cB.note)
  ok(rB.status().restart.missingChildren.length === 1, 'the restart marker carries the missing children too', rB.status().restart.missingChildren)
}

// ── F51c · the v5r views in one place: `pendingWork` (inflight), which ports are wired, roster-source naming ─
{
  const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const w = createWorkLedger({ store, clock })
  await w.start({ owner: 'r-1', kind: 'proof', objective: 'finish lemma L' })
  const rows = [{ id: 'r-1', childId: 'c-live', slot: 'researcher' }, { id: 'r-2', childId: 'c-gone', slot: 'researcher' }]
  const r = createResume({
    store, work: w, clock,
    roster: async () => rows,                                  // the natural wiring: members.roster()
    children: { parentId: () => 'root-1', list: async () => ['c-live'] },
    mailbox: async () => [{ id: 'ml-1' }, { id: 'ml-2' }],     // a FUNCTION-shaped mailbox port is accepted
  })
  const rep = await r.recover({ reason: 'f51c' })
  const c = rep.steps.filter((s) => s.step === 'children')[0]
  ok(c.rosterSource === 'roster-port' && c.checked === 2 && c.missing.length === 1 && c.missing[0].member === 'r-2',
    'the roster port feeds the child reconciliation (the identity seam has no childId, so the source is NAMED)', c)
  ok(rep.steps.filter((s) => s.step === 'mailbox')[0].pending === 2, 'a function-shaped mailbox port is accepted and counted', rep.steps.filter((s) => s.step === 'mailbox')[0])
  const st = r.status()
  ok(st.ports.children === true && st.ports.roster === true && st.ports.mailbox === true && st.ports.watchdogs === false && st.ports.lock === false,
    'status().ports shows exactly which recovery ports this assembly wired', st.ports)
  ok(st.inflight.interrupted.length === 1 && st.inflight.interrupted[0].owner === 'r-1' && st.inflight.pending.length === 1 && st.inflight.pendingNow === 0,
    'status().inflight is the v5r `pendingWork` view: what the restart FOUND, what it ENDED, what is still open', st.inflight)
  ok(r.restart().missingChildren.length === 1 && r.restart().missingChildren[0].childId === 'c-gone',
    'the restart marker carries the missing child', r.restart().missingChildren)
}

// ── A key written by SOMEBODY ELSE (a bare array) is a NAMED refusal, not "hydrated, 0 entries" ──────────────
// This is the shape `kernel/work.js` writes under `work`: an ARRAY, not a projection envelope. Before the round-4
// fix, `adopt()` refused it and `hydrate()` reported the key as hydrated with 0 entries — a silent lie about a
// ledger that can hold unfinished work.
{
  const store = mkStore({ work: [{ id: 'w-1', owner: 'r-1', interrupted: true, interruptedReason: 'host-ended' }], resume: { v: 1, counters: {}, recoveries: [] } })
  const r = createResume({ store, work: createWorkLedger({ store, clock }), clock })
  await r.read()
  r.attachProjection({ target: createWorkLedger({ store, clock }), methods: [], key: 'work', mode: 'journal', list: () => [] })
  const h = await r.hydrate({ keys: ['work'] })
  const bad = h.unhydrated.filter((u) => u.key === 'work')[0]
  ok(!!bad && bad.code === 'VMU_RESUME_PROJECTION_GAP' && /not a projection envelope/.test(bad.reason),
    'a foreign value under a projection key is NAMED unhydrated (never "hydrated, 0 entries")', bad)
  const rep = await r.recover({ reason: 'foreign-value' })
  ok(rep.ok === false && rep.steps.filter((s) => s.step === 'ledgers')[0].ok === false,
    'and the recovery reports the ledger step as NOT ok (this is what a projection row over a self-persisting face looks like)', rep.ok)
  ok(r.status().projection.degraded === true && r.status().projection.unhydratedKeys.includes('work'),
    'status() shows the degradation', r.status().projection)
}

// ── task-52 A · unacked mail is counted from the DURABLE mailbox key (no new face method, no new wiring) ─────
{
  const boxSnap = { apiVersion: 1, face: 'mailbox', v: 1, at: 1, counters: { seq: 3 }, data: { boxes: { 'r-1': [{ id: 'ml-1' }, { id: 'ml-2' }], 'r-2': [{ id: 'ml-3' }] }, acked: {}, injected: {} }, skipped: [] }
  const storeA = mkStore({ work: [], mailbox: boxSnap, resume: { v: 1, counters: {}, recoveries: [] } })
  const rA = createResume({ store: storeA, work: createWorkLedger({ store: storeA, clock }), clock })
  const repA = await rA.recover({ reason: 'mail-durable' })
  const mA = repA.steps.filter((s) => s.step === 'mailbox')[0]
  ok(mA.attached === true && mA.source === 'durable-mailbox-key' && mA.pending === 3,
    'with no port, the count comes from the durable mailbox key (the face self-persists)', mA)
  ok(rA.status().inflight.unackedMail === 3 && rA.status().inflight.unackedMailSource === 'durable-mailbox-key',
    'the count also lands in the v5r `pendingWork` view (inflight.unackedMail)', rA.status().inflight)
  ok(rA.status().ports.mailbox === false, 'and status().ports still tells the truth: no PORT was wired', rA.status().ports)
  // a state-projection envelope (the other stored shape) is accepted too
  const storeB = mkStore({ work: [], mailbox: { v: 1, mode: 'state', key: 'mailbox', seq: 0, incomplete: false, entries: [], value: boxSnap }, resume: { v: 1, counters: {}, recoveries: [] } })
  const rB = createResume({ store: storeB, work: createWorkLedger({ store: storeB, clock }), clock })
  const repB = await rB.recover({ reason: 'mail-envelope' })
  ok(repB.steps.filter((s) => s.step === 'mailbox')[0].pending === 3, 'an envelope-wrapped mailbox key is accepted as well', repB.steps.filter((s) => s.step === 'mailbox')[0])
  // neither port nor key ⇒ named, never a fabricated zero
  const storeC = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const rC = createResume({ store: storeC, work: createWorkLedger({ store: storeC, clock }), clock })
  const repC = await rC.recover({ reason: 'mail-none' })
  const mC = repC.steps.filter((s) => s.step === 'mailbox')[0]
  ok(mC.attached === false && mC.code === 'VMU_RESUME_MAILBOX_UNAVAILABLE' && rC.status().inflight.unackedMail === null,
    'neither port nor durable key ⇒ NAMED (null, not a fake 0)', { step: mC, inflight: rC.status().inflight.unackedMail })
}

// ── task-52 B · re-dispatch is a DECLARED policy: the engine offers, counts DURABLY, and never spawns ────────
{
  const rows = [{ id: 'r-2', childId: 'c-gone', slot: 'researcher' }]
  const mkEngine = (store, reassign, applyCalls) => createResume({
    store, work: createWorkLedger({ store, clock }), clock,
    roster: () => rows,
    children: { parentId: () => 'root-1', list: async () => [] },
    reassign: reassign === null ? null : { maxAttempts: reassign.maxAttempts, apply: async (req) => { applyCalls.push(req); if (reassign.throws) { const e = new Error('spawn refused'); e.code = 'VMU_ACTIVATION_FAILED'; throw e } return { ok: true } } },
  })
  // (1) NO policy declared ⇒ nothing is attempted, the missing member is only NAMED
  {
    const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
    const calls = []
    const r = mkEngine(store, null, calls)
    const rep = await r.recover({ reason: 'reassign-none' })
    const s = rep.steps.filter((x) => x.step === 'reassign')[0]
    ok(s.attached === false && calls.length === 0 && /only NAMED/.test(s.note),
      'no declared policy ⇒ no attempt, and the step says so', s)
    ok(r.status().restart.reassigned === 0, 'the restart marker reports nothing re-dispatched', r.status().restart)
  }
  // (2) a declared policy is offered the missing member EXACTLY once, and the counter is durable
  const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const calls = []
  const r1 = mkEngine(store, { maxAttempts: 1 }, calls)
  const rep1 = await r1.recover({ reason: 'reassign-1' })
  const s1 = rep1.steps.filter((x) => x.step === 'reassign')[0]
  ok(s1.attached === true && s1.applied.length === 1 && calls.length === 1 && calls[0].member === 'r-2' && calls[0].attempt === 1 && calls[0].maxAttempts === 1,
    'the declared policy is offered the missing member once, with its attempt number', { s1, calls })
  ok(r1.status().reassignAttempts['r-2'] === 1 && store._raw.get('resume').reassignAttempts['r-2'] === 1,
    'the attempt counter is DURABLE (it is in the resume key)', r1.status().reassignAttempts)
  // (3) a SECOND restart must NOT re-dispatch: the durable bound is what stops a crash loop
  const r2 = mkEngine(store, { maxAttempts: 1 }, calls)
  const rep2 = await r2.recover({ reason: 'reassign-2' })
  const s2 = rep2.steps.filter((x) => x.step === 'reassign')[0]
  ok(calls.length === 1 && s2.exhausted.length === 1 && s2.exhausted[0].member === 'r-2' && s2.applied.length === 0,
    'the second restart finds the counter exhausted and does NOT re-dispatch (anti-crash-loop)', { calls: calls.length, s2 })
  ok(/crash loop/.test(String(s2.exhausted[0].reason)) && r2.status().restart.reassignExhausted === 1,
    'the exhaustion is named with its reason and shows in the restart marker', r2.status().restart)
  // (4) a policy that THROWS is named; the attempt is still counted (no free retries)
  const store4 = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const calls4 = []
  const r4 = mkEngine(store4, { maxAttempts: 2, throws: true }, calls4)
  const s4 = (await r4.recover({ reason: 'reassign-throws' })).steps.filter((x) => x.step === 'reassign')[0]
  ok(s4.failed.length === 1 && s4.failed[0].code === 'VMU_ACTIVATION_FAILED' && s4.applied.length === 0,
    'a throwing policy is NAMED, and the run continues', s4)
  ok(r4.status().reassignAttempts['r-2'] === 1, 'a failed attempt still consumes the bound (no unlimited retries)', r4.status().reassignAttempts)
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU RESUME LOCK+MARKS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU RESUME LOCK+MARKS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
