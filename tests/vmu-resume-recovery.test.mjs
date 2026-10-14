// tests/vmu-resume-recovery.test.mjs — the recovery primitives (kernel/resume.js) and the id minter (kernel/ids.js).
//
// WHY THIS SUITE EXISTS. Round 2 measured that the durable layer was almost asleep (2 of 12 white-list keys had a
// reader AND a writer) and that ~30 modules restarted their id counters at 1. The contract encoded here:
//   1. a write before a successful read is REFUSED BY NAME (never a silent clobber);
//   2. a recovery marks interrupted work BY NAME, and `passed` for such work is refused unless explicit + reasoned;
//   3. a projection hydrates through its own journal replay and the id counter continues above the maximum seen;
//   4. a journal with a hole, or a key with no adapter, is REPORTED — never a plausible-but-wrong rebuild;
//   5. read-back detects drift;
//   6. `mint()` never goes backwards, across a restart, with or without the durable counter.
//
// Last line: === VMU RESUME: N passed, M failed ===
import { createResume, createProjection, attachProjection, checkSnapshot, RECOVERY_STEPS } from '../vibe-math-vmu/kernel/resume.js'
import { createIds, createIds as mkIds, idNumber } from '../vibe-math-vmu/kernel/ids.js'
import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const refuses = async (code, name, fn) => {
  try { await fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, e && e.code) }
}
const throws = (code, name, fn) => {
  try { fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, e && e.code) }
}

/** The durable store contract this face uses: `export()` (whole fold), `read(key)`, `patch(key, fn)`. */
const mkStore = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  return {
    export: () => ({ version: 1, keys: Object.fromEntries(data) }),
    read: (k) => copy(data.get(k)),
    patch: (k, fn) => {
      const next = fn(copy(data.get(k)))
      data.set(k, next)
      return { ok: true, key: k }
    },
    _raw: data,
  }
}
let NOW = 1000
const clock = () => NOW

// ── 1. the read-before-write gate ────────────────────────────────────────────────────────────────────────────
{
  const store = mkStore({ work: [] })
  const r = createResume({ store, clock })
  await refuses('VMU_RESUME_WRITE_BEFORE_READ', 'write() before any successful read is refused by name', () => r.write('work', []))
  await refuses('VMU_RESUME_WRITE_BEFORE_READ', 'patch() before any successful read is refused by name', () => r.patch('work', () => []))
  ok(r.status().writeRefusals === 2 && r.status().read === false, 'both refusals are counted and the latch is still open', r.status().writeRefusals)
  const read = r.read()
  ok(read.ok === true && read.keys.includes('work'), 'read() folds the store and reports its keys', read.keys)
  ok(r.status().read === true, 'after a successful read the write gate opens')
  await r.write('work', [])
  ok(r.status().writes === 1, 'the gated write is counted')
  // a read must be re-established for a NEW path/instance: a second instance cannot write off the first one's read
  const r2 = createResume({ store, clock })
  await refuses('VMU_RESUME_WRITE_BEFORE_READ', 'a fresh session cannot inherit another session\'s read', () => r2.write('work', []))
}

// ── 2. no store is reported, never faked ────────────────────────────────────────────────────────────────────
{
  const r = createResume({ clock })
  await refuses('VMU_RESUME_UNAVAILABLE', 'write() without a durable store is refused by name', () => r.write('resume', {}))
  const rep = await r.recover({ reason: 'test' })
  ok(rep.ok === false && rep.code === 'VMU_RESUME_UNAVAILABLE' && rep.steps[0].ok === false,
    'recover() with no store says so instead of claiming a recovery', rep.code)
  ok(r.recoverPlan().willAutoRecover === false, 'recoverPlan() reports that nothing would be recovered')
}

// ── 3. the ten-step recovery, and interrupted work that may never silently pass ──────────────────────────────
{
  const store = mkStore({ work: [] })
  const w1 = createWorkLedger({ store, clock: () => '2026-01-01T00:00:00.000Z' })
  const started = await w1.start({ owner: 'r-1', kind: 'proof', objective: 'finish the lemma' })
  const r = createResume({ store, work: w1, clock, settings: {} })
  const rep = await r.recover({ reason: 'host-ended' })
  ok(rep.steps.length >= RECOVERY_STEPS.length, 'the recovery reports every declared step', rep.steps.map((s) => s.step))
  const inflight = rep.steps.filter((s) => s.step === 'inflight')[0]
  ok(inflight && inflight.ok === true && inflight.marked === 1 && inflight.interrupted === 1,
    'the survivor is marked interrupted with a NAMED reason', inflight)
  ok(rep.interrupted.length === 1 && typeof rep.interrupted[0].reason === 'string' && rep.interrupted[0].reason.length > 0,
    'the interruption carries its reason', rep.interrupted)
  ok(r.status().wroteNothingBeforeRead === undefined && r.status().neverWritesBeforeRead === true, 'the face states its read-before-write invariant')
  throws('VMU_RESUME_INTERRUPTED_NOT_PASSED', 'interrupted work cannot be reported as passed', () => r.settleOutcome({ id: started.entry.id, outcome: 'passed' }))
  throws('VMU_INVALID_ARGUMENT', 'an explicit override still needs a reason', () => r.settleOutcome({ id: started.entry.id, outcome: 'passed', explicit: true }))
  const done = r.settleOutcome({ id: started.entry.id, outcome: 'passed', explicit: true, reason: 're-run the proof after the restart; it compiled' })
  ok(done.ok === true && done.override === true, 'an explicit, reasoned override is accepted and marked', done)
  const other = r.settleOutcome({ id: 'w-unknown', outcome: 'passed' })
  ok(other.ok === true && other.interrupted === false, 'an id that was never interrupted passes without ceremony')
  // the record is durable, and a SECOND session over the same store sees it
  const r2 = createResume({ store, work: w1, clock })
  const rep2 = await r2.recover({ reason: 'second' })
  ok(rep2.ok === true, 'a second recovery over the same store succeeds', rep2.steps.map((s) => s.step))
  ok(store._raw.get('resume') && Array.isArray(store._raw.get('resume').recoveries) && store._raw.get('resume').recoveries.length === 2,
    'each recovery is recorded durably (bounded)', store._raw.get('resume').recoveries.length)
}

// ── 4. the mailbox and watchdog ports: attached is used, absent is NAMED ─────────────────────────────────────
{
  const store = mkStore({ resume: { v: 1, counters: {}, recoveries: [] } })
  const bare = createResume({ store, clock })
  const repBare = await bare.recover({ reason: 'bare' })
  const mb = repBare.steps.filter((s) => s.step === 'mailbox')[0]
  const wd = repBare.steps.filter((s) => s.step === 'watchdogs')[0]
  ok(mb.attached === false && mb.code === 'VMU_RESUME_MAILBOX_UNAVAILABLE', 'no mailbox port is REPORTED, never faked', mb)
  ok(wd.attached === false && wd.ok === true, 'no watchdog port is REPORTED too (and does not fail the recovery)', wd)
  const touched = []
  let pendingCalls = 0
  const rich = createResume({
    store, clock,
    mailbox: { pending: async () => { pendingCalls += 1; return [{ id: 'msg-1' }, { id: 'msg-2' }] } },
    watchdogs: { targets: async () => ['mt-1', 'v-1'], touch: async (t) => { touched.push(t) } },
  })
  const repRich = await rich.recover({ reason: 'rich' })
  ok(pendingCalls === 1 && repRich.steps.filter((s) => s.step === 'mailbox')[0].pending === 2,
    'an injected mailbox port is really read (unacked mail is counted)', repRich.steps.filter((s) => s.step === 'mailbox')[0])
  ok(touched.length === 2 && repRich.steps.filter((s) => s.step === 'watchdogs')[0].refreshed === 2,
    'an injected watchdog port is really refreshed', touched)
}

// ── 5. journal projection: replay rebuilds the face, and ids continue above the maximum ─────────────────────
{
  const store = mkStore({ tasks: undefined, resume: { v: 1, counters: {}, recoveries: [] } })
  const makeFace = () => {
    const items = new Map()
    let seq = 0
    return {
      items,
      create: (title) => { const id = 't-' + (++seq); items.set(id, { id, title }); return { ok: true, id } },
      settle: (id) => { items.delete(id); return { ok: true, id } },
      list: () => [...items.values()].map((x) => Object.assign({}, x)),
    }
  }
  const faceA = makeFace()
  const idsA = createIds({ store, clock })
  const rA = createResume({ store, clock, settings: {} })
  rA.read()
  rA.attachProjection({ target: faceA, methods: ['create', 'settle'], key: 'tasks', mode: 'journal', list: () => faceA.list() })
  faceA.create('alpha')
  faceA.create('beta')
  faceA.settle('t-1')
  const snap = await rA.snapshot({ key: 'tasks' })
  ok(snap.ok === true && snap.mode === 'journal' && snap.entries === 3, 'the journal records every wrapped call', snap)
  ok(snap.incomplete === false, 'the journal is complete')

  // a RESTART: the same store, a fresh face and a fresh resume instance
  const faceB = makeFace()
  const rB = createResume({ store, clock, settings: {} })
  rB.read()
  rB.attachProjection({ target: faceB, methods: ['create', 'settle'], key: 'tasks', mode: 'journal', list: () => faceB.list() })
  const h = await rB.hydrate({ keys: ['tasks'] })
  ok(h.ok === true && h.unhydrated.length === 0, 'the journal hydrates with no unhydrated key', h.unhydrated)
  ok(faceB.list().length === 1 && faceB.list()[0].title === 'beta', 'the replayed face holds exactly the surviving item', faceB.list())
  const next = faceB.create('gamma')
  ok(next.id === 't-3', 'the face continues ABOVE the maximum id it ever minted (t-1 was settled, never reused)', next.id)
  ok(idNumber(next.id) > idNumber('t-1'), 'no id is ever reused', next.id)
}

// ── 6. a hole in the journal, and a key with no adapter, are REPORTED ───────────────────────────────────────
{
  const store = mkStore({ tasks: undefined })
  const face = { items: new Map(), create: (t) => ({ ok: true, id: 'x' }), list: () => [] }
  const r = createResume({ store, clock })
  r.read()
  r.attachProjection({ target: face, methods: ['create'], key: 'tasks', mode: 'journal', list: () => [] })
  face.create('one')
  face.create('two')
  await r.snapshot({ key: 'tasks' })
  // damage the journal: remove a middle entry, as a truncation would
  const env = store._raw.get('tasks')
  env.entries.splice(0, 1)
  store._raw.set('tasks', env)
  const h = await r.hydrate({ keys: ['tasks'] })
  ok(h.ok === false && h.unhydrated.length === 1 && h.unhydrated[0].code === 'VMU_RESUME_PROJECTION_GAP',
    'a journal with a hole refuses hydration BY NAME (never a partial rebuild)', h.unhydrated)
  ok(r.status().projection.degraded === true, 'status() reports the projection as degraded', r.status().projection)
  const h2 = await r.hydrate({ keys: ['members'] })
  ok(h2.unhydrated.length === 1 && h2.unhydrated[0].code === 'VMU_RESUME_NO_ADAPTER',
    'a key with no adapter is reported, not silently treated as empty', h2.unhydrated)
}

// ── 7. non-replayable commands are refused, not silently skipped ────────────────────────────────────────────
{
  const store = mkStore({ tasks: undefined })
  const face = { sent: 0, list: () => [], send: () => { face.sent += 1; return { ok: true } } }
  const r = createResume({ store, clock })
  r.read()
  r.attachProjection({ target: face, methods: ['send'], key: 'tasks', mode: 'journal', nonReplayable: ['send'], list: () => [] })
  face.send()
  await r.snapshot({ key: 'tasks' })
  const h = await r.hydrate({ keys: ['tasks'] })
  const gap = h.unhydrated[0]
  ok(gap && gap.code === 'VMU_RESUME_PROJECTION_GAP' && gap.gap.kind === 'non-replayable',
    'a command with effects outside the face makes the replay refuse by name', gap)
}

// ── 8. read-back: consistent after a gated write, DRIFT when the store changes behind us ────────────────────
{
  const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
  const r = createResume({ store, clock, settings: { 'vmu.resume.readBack': true } })
  await r.recover({ reason: 'rb' })
  const rb1 = r.readBack()
  ok(rb1.consistent === true && rb1.checked >= 1, 'read-back is consistent right after the recovery wrote its record', rb1)
  // an external writer lands a different value under the same key
  store._raw.set('resume', { v: 1, counters: {}, recoveries: [], tampered: true })
  const rb2 = r.readBack()
  ok(rb2.consistent === false && rb2.code === 'VMU_RESUME_READBACK_DRIFT' && rb2.drift.length === 1,
    'drift is detected and NAMED', rb2.drift)
  ok(r.status().readBackFailures === 1, 'the drift is counted in status()')
}

// ── 9. the id minter: monotonic, durable, and never backwards across a restart ──────────────────────────────
{
  const store = mkStore({ ids: undefined })
  const idsA = createIds({ store, clock, settings: {} })
  await idsA.hydrate()
  const a1 = idsA.mint('task', 't-')
  const a2 = idsA.mint('task', 't-')
  ok(a1 === 't-1' && a2 === 't-2', 'mint() is monotonic with the declared prefix', [a1, a2])
  idsA.observe('task', ['t-40'])
  ok(idsA.mint('task', 't-') === 't-41', 'observe() raises the floor, so an existing id is never handed out again')
  await idsA.flush()
  const persisted = store._raw.get('ids')
  ok(persisted && persisted.counters.task === 41, 'the counter is durable', persisted && persisted.counters)
  // A RESTART: a fresh minter over the same store
  const idsB = createIds({ store, clock, settings: {} })
  await idsB.hydrate()
  ok(idsB.mint('task', 't-') === 't-42', 'after a restart the minter continues above the durable counter', idsB.mint('task', 't-'))
  const loose = createIds({ clock, settings: {} })
  ok(loose.status().durable === false, 'an unbound minter SAYS it is not durable instead of pretending', loose.status().durable)
  ok(loose.mint('veto', 'veto-') === 'veto-1', 'an unbound minter still hands out process-unique ids', loose.mint('veto', 'veto-'))
  throws('VMU_IDS_BAD_KIND', 'a bad kind is refused by name', () => loose.mint('Bad Kind'))
  // the module-level singleton is what ~30 modules import
  const mod = await import('../vibe-math-vmu/kernel/ids.js')
  const bound = mod.bindIds({ store, clock })
  ok(mod.mint('member', 'm-') === 'm-1' && bound.status().durable === true, 'bindIds() binds the process-wide minter to the durable store', bound.status().durable)
}

// ── 10. the shared snapshot validator (one shape for every face) ────────────────────────────────────────────
{
  throws('VMU_RESUME_SNAPSHOT_VERSION', 'a snapshot from another version is refused by name', () => checkSnapshot('tasks', { apiVersion: 2, v: 2, face: 'tasks', data: {} }, []))
  throws('VMU_RESUME_SNAPSHOT_VERSION', 'a snapshot for another face is refused by name', () => checkSnapshot('members', { apiVersion: 1, v: 1, face: 'tasks', data: {} }, []))
  throws('VMU_RESUME_SNAPSHOT_INCOMPLETE', 'a snapshot missing a required collection names it', () => checkSnapshot('tasks', { apiVersion: 1, v: 1, face: 'tasks', data: {} }, ['tasks']))
  ok(checkSnapshot('tasks', { apiVersion: 1, v: 1, face: 'tasks', data: { tasks: [] } }, ['tasks']).ok === true, 'a well-formed snapshot validates')
  // createProjection is usable on its own (the pure half of the wrapper)
  const p = createProjection({ key: 'k', mode: 'journal', cap: 2 })
  p.record('a', [], {})
  p.record('b', [], {})
  p.record('c', [], {})
  ok(p.size() === 2 && p.gap().kind === 'truncated-head', 'a capped journal is marked incomplete (replay refuses it)', p.gap())
}

// ── 11. a face that REFUSES to restore is REPORTED, never counted as hydrated ───────────────────────────────
{
  const store = mkStore({ resume: { v: 1, counters: {}, recoveries: [] } })
  const face = { items: [1, 2, 3] }
  const r = createResume({
    store, clock,
    faces: {
      members: {
        key: 'members', mode: 'state',
        snapshot: () => ({ apiVersion: 1, face: 'members', v: 1, at: clock(), data: { members: face.items }, counters: {}, skipped: [] }),
        // This is how the five faces v5r-reader-c owns behave: a refusal is RETURNED as {ok:false, code}.
        restore: () => ({ ok: false, restored: false, code: 'VMU_RESUME_RESTORE_CONFLICT', message: 'live roster differs; refusing to half-overwrite' }),
        list: () => face.items,
      },
    },
  })
  await r.read()
  await r.snapshot({ key: 'members' })
  const h = await r.hydrate({ keys: ['members'] })
  ok(h.ok === false && h.unhydrated.length === 1 && h.unhydrated[0].code === 'VMU_RESUME_RESTORE_CONFLICT',
    'a face-level REFUSAL is reported as unhydrated (a returned {ok:false} is not success)', h.unhydrated)
  ok(r.status().projection.degraded === true && r.status().projection.unhydratedKeys.includes('members'),
    'status() shows the refusal instead of pretending the face was restored', r.status().projection)
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU RESUME SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU RESUME: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
