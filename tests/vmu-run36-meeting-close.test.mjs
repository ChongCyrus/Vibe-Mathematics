#!/usr/bin/env node
// vmu RUN 36 / F-3 — A CLOSED MEETING MUST NOT COME BACK OPEN ON THE NEXT KERNEL.
//
// THE OBSERVED DEFECT (live run 36, the institute's own report, `VibeMath/vmu/state.json` line 182): `close()` was
// called, its receipt said `closeSemantics:"service-archives"` with the meeting MOVED TO THE ARCHIVE, and yet the
// durable `live` row for the same id still said `state:"open"` — so a fresh kernel hydrated that row and the meeting
// was open again (members re-attended it, the status face showed `present:1`, `spokeBy:[]` as if nothing had happened).
//
// THE MECHANISM (two halves, both here):
//   1. `snapshot()` used to serialise whatever `live` the INSTANCE held. `close()` deletes from `live` and pushes to
//      `archive`, but an instance that booted BEFORE the closure still holds the open twin, and its next state
//      write-through put the closed meeting back into the durable `live` map. A meeting the ARCHIVE records as closed
//      must never be serialised as live ⇒ `snapshot()` now drops it and counts the drop.
//   2. The reload path had no additive restore: `restore()` REPLACES (correct for recovery) and refuses a non-empty
//      instance by name, so the read-refresh hook could not adopt a newer fold at all. `restoreReload()` merges,
//      lets the ARCHIVE win, and never deletes what the instance already holds.
//
// WHAT THIS SUITE PROVES: (a) a live twin in a snapshot is dropped on the way OUT; (b) on the way IN, a stored live
// meeting whose id our archive records closed is dropped and counted; (c) the additive reload keeps local rows and
// adopts new ones; (d) end to end: open + close on one instance, reload on a second ⇒ the second reports CLOSED.
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

let NOW = 1000
const mk = () => createMeetings({ clock: () => NOW, settings: { 'vmu.meetings.quorumCap': 0 } })
const roster = ['acad', 'r-1', 'r-2', 'r-3']
const decode = (s) => JSON.parse(String(s || '[]'), (k, v) => {
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__map)) return new Map(v.__map)
    if (Array.isArray(v.__set)) return new Set(v.__set)
  }
  return v
})
const snapWith = ({ live = new Map(), archive = [] } = {}) => ({
  apiVersion: 1, face: 'meetings', v: 1, at: NOW,
  data: { live: JSON.stringify({ __map: [...live.entries()] }), archive: JSON.stringify(archive), receipts: '[]' },
  counters: { meeting: 9 }, session: { counters: {}, receiptDropped: 0 }, skipped: [],
})
const liveIds = (snap) => [...decode(snap.data.live).keys()].sort()
const archiveIds = (snap) => decode(snap.data.archive).map((m) => String(m.id)).sort()

// ── 1. a live twin is DROPPED on the way out (the write-through half) ────────────────────────────────────────
// The twin cannot be built through `restore()` any more (that half is fixed below), so the reachable path is a
// RELOAD that learns of a closure the instance had not seen: the archive record arrives, the local live row stays —
// and the next state write must not serialise that row as live.
{
  const t = mk()
  const r = t.restore(snapWith({ live: new Map([['m1', { id: 'm1', state: 'open', type: 'ordinary' }]]), archive: [] }))
  ok(r.ok === true, 'restore[+]: a snapshot with one live meeting is accepted', JSON.stringify(r))
  ok(t.summary({ meeting: 'm1' }).state === 'open', 'twin setup[+]: the instance holds the open meeting')
  const learned = t.restoreReload(snapWith({
    live: new Map(),
    archive: [{ id: 'm1', state: 'closed', type: 'ordinary', closedAt: 900, wallMs: 100 }],
  }))
  ok(learned.ok === true && learned.adoptedArchive === 1, 'twin setup[+]: a reload brings the archived record of the SAME id', JSON.stringify(learned))
  ok(liveIds(t.snapshot()).length === 0, 'snapshot[+]: the local live row is NOT serialised once the archive records the closure', liveIds(t.snapshot()).join(','))
  // ★ LIVE RUN 50 / F-28 changed WHERE the drop is counted: a closure learned from the shared ledger now ENDS the
  // local live row at reload time (`evictedLiveWhileArchived`), so by the time the state is serialised there is no twin
  // left to drop and `droppedLiveWhileArchived` legitimately stays 0. The invariant this assertion guards — the drop is
  // COUNTED somewhere, never silent — still holds; the counter just moved to the door that actually did it.
  {
    const after = t.snapshot()
    const atSerialisation = Number(after && after.counters && after.counters.droppedLiveWhileArchived) || 0
    const atEviction = Number(learned && learned.evictedLiveWhileArchived) || 0
    ok(atSerialisation + atEviction >= 1, 'snapshot[+]: the drop is counted, not silent (at eviction or at serialisation)',
      { atEviction, atSerialisation })
  }
  ok(archiveIds(t.snapshot()).join(',') === 'm1', 'snapshot[+]: the archived record IS serialised (the closure is durable)', archiveIds(t.snapshot()).join(','))
}

// ── 1b. a fold that carries BOTH objects is admitted as CLOSED (the hydrate half) ────────────────────────────
{
  const withTwin = mk()
  const rr = withTwin.restore(snapWith({
    live: new Map([['m1', { id: 'm1', state: 'open', type: 'ordinary' }]]),
    archive: [{ id: 'm1', state: 'closed', type: 'ordinary', closedAt: 900, wallMs: 100 }],
  }))
  ok(rr.ok === true, 'restore[+]: a snapshot holding BOTH objects (live twin + archived record) is accepted', JSON.stringify(rr))
  ok(rr.droppedLiveWhileArchived === 1, 'restore[+]: the boot drops the twin and counts it', String(rr.droppedLiveWhileArchived))
  ok(liveIds(withTwin.snapshot()).length === 0, 'restore[+]: the instance holds no live twin after the boot', liveIds(withTwin.snapshot()).join(','))
  ok(withTwin.summary({ meeting: 'm1' }).state === 'closed', 'restore[+]: and it reports the meeting CLOSED, not open', withTwin.summary({ meeting: 'm1' }).state)
  ok(withTwin.summary({ meeting: 'm1' }).liveWhileArchived === false, 'restore[+]: there is no twin left for the read face to name')
}

// ── 2. on the way in, a stored live twin is DROPPED and counted (the reload half) ─────────────────────────────
{
  const b = mk()
  ok(b.restore(snapWith({ live: new Map([['m2', { id: 'm2', state: 'open', type: 'ordinary', subject: 'kept locally' }]]) })).ok === true,
    'reload setup[+]: the second instance holds m2')
  // The durable fold is now EXACTLY run 36's shape: m1 is archived closed, but a stale writer left both m1 and m2 live.
  const stale = snapWith({
    live: new Map([
      ['m1', { id: 'm1', state: 'open', type: 'ordinary', subject: 'stale twin' }],
      ['m2', { id: 'm2', state: 'open', type: 'ordinary', subject: 'durable copy' }],
    ]),
    archive: [{ id: 'm1', state: 'closed', type: 'ordinary', closedAt: 950, wallMs: 50 }],
  })
  const r = b.restoreReload(stale)
  ok(r.ok === true, 'restoreReload[+]: the reload of a stale fold is accepted', JSON.stringify(r))
  ok(r.droppedLiveWhileArchived === 1, 'restoreReload[+]: the archived twin is dropped and counted', String(r.droppedLiveWhileArchived))
  ok(r.adoptedLive === 0, 'restoreReload[+]: nothing new is adopted (m2 was already here)', String(r.adoptedLive))
  ok(liveIds(b.snapshot()).join(',') === 'm2', 'restoreReload[+]: m1 is NOT live after the reload, m2 is', liveIds(b.snapshot()).join(','))
  ok(b.summary({ meeting: 'm1' }).state === 'closed', 'restoreReload[+]: a reloaded twin reads CLOSED (from the archive)', b.summary({ meeting: 'm1' }).state)
  ok(b.summary({ meeting: 'm1' }).liveWhileArchived === false, 'restoreReload[+]: and there is no twin left to name')
  ok(b.summary({ meeting: 'm2' }).subject === 'kept locally', 'restoreReload[+]: the LOCAL row is not overwritten by the durable copy', b.summary({ meeting: 'm2' }).subject)
}

// ── 3. the reload is ADDITIVE: it adopts what it lacks, keeps what it has ────────────────────────────────────
{
  const c = mk()
  c.restoreReload(snapWith({ live: new Map([['m3', { id: 'm3', state: 'open', type: 'ordinary' }]]) }))
  ok(liveIds(c.snapshot()).join(',') === 'm3', 'additive[+]: a meeting the instance lacks is adopted', liveIds(c.snapshot()).join(','))
  const r = c.restoreReload(snapWith({
    live: new Map([['m3', { id: 'm3', state: 'open', type: 'ordinary', subject: 'durable' }], ['m4', { id: 'm4', state: 'open', type: 'ordinary' }]]),
    archive: [{ id: 'm5', state: 'closed', type: 'ordinary', closedAt: 970, wallMs: 20 }],
  }))
  ok(r.adoptedLive === 1 && r.adoptedArchive === 1, 'additive[+]: one live meeting and one archived record are adopted', JSON.stringify({ l: r.adoptedLive, a: r.adoptedArchive }))
  ok(liveIds(c.snapshot()).join(',') === 'm3,m4', 'additive[+]: both live meetings are present, sorted', liveIds(c.snapshot()).join(','))
  ok(archiveIds(c.snapshot()).join(',') === 'm5', 'additive[+]: the archived record arrived with the reload', archiveIds(c.snapshot()).join(','))
  ok(c.summary({ meeting: 'm5' }).state === 'closed', 'additive[+]: the adopted archive record reads closed')
}

// ── 4. END TO END: open + close on one instance, reload on a second ⇒ the second reports CLOSED ───────────────
{
  const a = mk()
  const opened = a.open({ type: 'ordinary', chair: 'acad', roster })
  const closed = a.close({ meeting: opened.meeting, report: { ok: true, notes: ['run 36 shape'] }, actions: [{ what: 'none', who: 'acad', by: NOW + 1 }] })
  ok(closed.nextMeetingError === null || closed.nextMeetingError === undefined, 'e2e setup[+]: close succeeded', String(closed.nextMeetingError))
  const durable = a.snapshot()
  ok(liveIds(durable).length === 0, 'e2e[+]: the closing instance serialises no live row for the closed meeting', liveIds(durable).join(','))
  ok(archiveIds(durable).join(',') === 'm1', 'e2e[+]: the closed meeting is serialised in the archive', archiveIds(durable).join(','))

  const b = mk()
  const r = b.restoreReload(durable)
  ok(r.ok === true, 'e2e[+]: the second instance reloads the durable fold', JSON.stringify(r))
  ok(liveIds(b.snapshot()).length === 0, 'e2e[+]: the second instance holds NO live meeting — the closure survived the crossing', liveIds(b.snapshot()).join(','))
  ok(b.summary({ meeting: 'm1' }).state === 'closed', 'e2e[+]: and it reports the meeting CLOSED, not open', b.summary({ meeting: 'm1' }).state)
  ok(b.summary({ meeting: 'm1' }).stateMeans === 'the meeting is closed: its tally is frozen and its vote detail is hidden',
    'e2e[+]: the state is explained, not just named', b.summary({ meeting: 'm1' }).stateMeans)

  // The resurrection is also refused by name when the archive is on the same instance: `restore()` REPLACES, so the
  // recovery path (a deliberate restore onto a fresh boot) is unchanged and still accepted.
  const c = mk()
  ok(c.restore(durable).ok === true, 'e2e[+]: the recovery path still accepts the durable fold whole')
}

// ── 5. the fold shape and the counters survive the round trip ────────────────────────────────────────────────
{
  const t = mk()
  t.open({ type: 'ordinary', chair: 'acad', roster })
  const snap = t.snapshot()
  ok(typeof snap.data.live === 'string' && typeof snap.data.archive === 'string', 'shape[+]: live/archive stay strings (the on-disk envelope format)', typeof snap.data.live)
  ok(snap.v === 1 && snap.face === 'meetings', 'shape[+]: version/face unchanged')
  const back = mk()
  ok(back.restoreReload(snap).ok === true, 'shape[+]: our own snapshot reloads cleanly')
  ok(liveIds(back.snapshot()).join(',') === 'm1', 'shape[+]: the live meeting is adopted by the reload', liveIds(back.snapshot()).join(','))
  // Refusals are RETURNED (a reload reports, it does not throw) — the code carries the name of the refusal.
  const bad = back.restoreReload({})
  ok(bad.ok === false && bad.code === 'VMU_RESUME_SNAPSHOT_VERSION', 'shape[-]: a reload with no snapshot object is refused by name', String(bad.code))
  const noLive = back.restoreReload({ face: 'meetings', v: 1, data: {} })
  ok(noLive.ok === false && noLive.code === 'VMU_RESUME_SNAPSHOT_INCOMPLETE', 'shape[-]: a reload missing `live` is refused by its code', String(noLive.code))
  const notMeetings = { face: 'members', v: 1, data: { live: JSON.stringify({ __map: [] }) } }
  const wrongFace = back.restoreReload(notMeetings)
  ok(wrongFace.ok === false && wrongFace.code === 'VMU_RESUME_SNAPSHOT_VERSION', 'shape[-]: a snapshot of another face is refused', String(wrongFace.code))
}

if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  ✗ ' + f)
}
console.log('=== VMU RUN36 MEETING CLOSE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
