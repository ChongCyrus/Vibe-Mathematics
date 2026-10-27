#!/usr/bin/env node
// vmu RUN 56 / F-43 — EVERY DURABLE ENVELOPE NAMES WHO WROTE IT.
//
// THE OBSERVED DEFECT (live runs 54 AND 55, read straight off the disk by the root agent): `VibeMath/vmu/state.json`
// carries, for every key, an entry `{ v, mode, key, seq, dropped, incomplete, entries, value, digest, wroteAt }`. The
// last kernel to write a key wins - and nothing in the file says WHICH kernel that was. Run 54's member read
// `hasSpawnSeam:false` out of that file while the live `status` said `true`, and both were true: a member kernel (with
// no math host) had written the projection last. The reader could tell WHEN but not WHO, so "two honest readings that
// disagree" was indistinguishable from "one of the readings is stale".
//
// WHAT THIS SUITE PROVES:
//   1. a projection built WITHOUT a writer writes no `writer` field at all (absent means "not registered", not "nobody");
//   2. a projection with a writer getter stamps `{ kernelSession, at }` on BOTH envelope shapes (journal and state);
//   3. a writer that does not know the name yet writes NOTHING rather than `{ kernelSession: null }` (the ROUND 54 rule:
//      "I have not learned it" and "there is none" must stay distinguishable);
//   4. `adopt()` reports `writtenBy` - a COPY of the envelope's writer, or `null` when the envelope predates the field;
//   5. a real kernel assembly stamps ITS OWN session on the envelopes it persists, and a second kernel over the same
//      workspace stamps its own on the keys it writes (last writer named, not merged into one anonymous file).
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createProjection } from '../vibe-math-vmu/kernel/resume.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key)

// ── 1: no writer registered ⇒ the field is ABSENT, not null ───────────────────────────────────────────────────
{
  const journal = createProjection({ key: 'j' })
  const env = journal.envelope()
  ok(!has(env, 'writer'), 'a bare journal envelope carries no writer field at all', Object.keys(env))
  const state = createProjection({ key: 's', mode: 'state' })
  const senv = state.stateEnvelope({ a: 1 })
  ok(!has(senv, 'writer'), 'a bare state envelope carries no writer field at all', Object.keys(senv))
  ok(senv.v === 1 && senv.mode === 'state' && senv.key === 's', 'the state envelope keeps its existing shape (v/mode/key)', senv)
  const adopted = journal.adopt({ v: 1, mode: 'journal', key: 'j', seq: 0, dropped: 0, incomplete: false, entries: [] })
  ok(adopted.ok === true && adopted.writtenBy === null, 'adoption of a writer-less envelope reports writtenBy null (unknown, not "nobody")', adopted)
}

// ── 2: a writer getter stamps both shapes, read at ENVELOPE time ────────────────────────────────────────────
{
  let name = 'session-first'
  const p = createProjection({ key: 'k', writer: () => ({ kernelSession: name, at: 4242 }) })
  const env = p.envelope()
  ok(env.writer && env.writer.kernelSession === 'session-first' && env.writer.at === 4242, 'the journal envelope names the writer of THIS write', env.writer)
  name = 'session-second'
  const again = p.envelope()
  ok(again.writer && again.writer.kernelSession === 'session-second', 'the getter is re-asked on every envelope (a name learned later is not frozen)', again.writer)
  const senv = p.stateEnvelope({ x: 1 })
  ok(senv.writer && senv.writer.kernelSession === 'session-second', 'the state envelope stamps the same writer', senv.writer)
  // an agentId is stamped when the assembly supplies one, and omitted when it does not
  const withAgent = createProjection({ key: 'k', writer: () => ({ kernelSession: 'session-x', agentId: 'agent-1', at: 9 }) }).envelope()
  ok(withAgent.writer.agentId === 'agent-1', 'a writer may name the agent as well as the kernel', withAgent.writer)
  const noAgent = createProjection({ key: 'k', writer: () => ({ kernelSession: 'session-x', at: 9 }) }).envelope()
  ok(!has(noAgent.writer, 'agentId'), 'an unregistered agent stays absent rather than null', noAgent.writer)
}

// ── 3: a writer that cannot name the kernel yet writes NOTHING (no invented id) ─────────────────────────────
{
  const blank = createProjection({ key: 'b', writer: () => ({}) }).envelope()
  ok(!has(blank, 'writer'), 'a writer returning an empty record stamps nothing (it did not learn the name)', Object.keys(blank))
  const nullish = createProjection({ key: 'b', writer: () => null }).envelope()
  ok(!has(nullish, 'writer'), 'a writer returning null stamps nothing', Object.keys(nullish))
  const throwing = createProjection({ key: 'b', writer: () => { throw new Error('guarded context') } }).envelope()
  ok(!has(throwing, 'writer'), 'a writer that throws stamps nothing and does not break the envelope', Object.keys(throwing))
  const guarded = createProjection({ key: 'b', writer: () => ({ kernelSession: { nested: true } }) }).envelope()
  ok(!has(guarded, 'writer'), 'a non-string kernel session is not stamped as an id', guarded.writer)
}

// ── 4: adopt returns a COPY of the writer, so a reader cannot mutate the durable claim ───────────────────────
{
  const p = createProjection({ key: 'a' })
  const env = { v: 1, mode: 'journal', key: 'a', seq: 3, dropped: 0, incomplete: false, entries: [], writer: { kernelSession: 'session-w', at: 7 } }
  const adopted = p.adopt(env)
  ok(adopted.ok === true && adopted.writtenBy && adopted.writtenBy.kernelSession === 'session-w', 'adoption reports the envelope\'s writer', adopted.writtenBy)
  ok(adopted.writtenBy !== env.writer, 'the reported writer is a copy, not the caller\'s object', adopted.writtenBy === env.writer)
  adopted.writtenBy.kernelSession = 'mutated'
  ok(env.writer.kernelSession === 'session-w', 'mutating the report leaves the source envelope untouched', env.writer)
  const present = Object.keys(p.envelope()).includes('writer')
  ok(present === false, 'this projection has no writer of its own, so its next envelope still has none', present)
}

// ── 5: the resume face stamps its writer, and two writers over one file do not merge into one anonymous claim ─
{
  const { createStore } = await import('../vibe-math-vmu/kernel/store.js')
  const { createResume } = await import('../vibe-math-vmu/kernel/resume.js')
  const dir = await mkdtemp(join(tmpdir(), 'vmu-r56-writer-store-'))
  try {
    const store = createStore({ root: dir })
    await store.open()
    const mk = (name) => createResume({
      store, clock: () => 111,
      writer: () => ({ kernelSession: name, at: 111 }),
      faces: { members: { mode: 'state', snapshot: () => [{ id: 'r-1', state: 'live' }], restore: () => {} } },
    })
    const r1 = mk('session-first')
    await r1.read()
    const wrote1 = await r1.snapshot({ key: 'members' })
    ok(wrote1 && wrote1.ok !== false, 'the first resume writes a state envelope', wrote1)
    const e1 = store.read('members')
    ok(e1 && e1.writer && e1.writer.kernelSession === 'session-first', 'the envelope on the shared file names its first writer', e1 && e1.writer)
    ok(e1 && e1.value && e1.value[0] && e1.value[0].id === 'r-1', 'the envelope still carries the value the face handed in (the writer field is additive)', e1 && e1.value)
    const r2 = mk('session-second')
    await r2.read()
    const wrote2 = await r2.snapshot({ key: 'members' })
    ok(wrote2 && wrote2.ok !== false, 'a second writer over the same workspace writes the same key', wrote2)
    const e2 = store.read('members')
    ok(e2 && e2.writer && e2.writer.kernelSession === 'session-second', 'the LAST writer is named - the file never hides who owns it', e2 && e2.writer)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

// ── 6: the assembled kernel passes its session through, so real receipts carry a real writer ────────────────
const boot = async (config = {}, ctxExtra = {}) => {
  const state = { specs: [] }
  const ctx = Object.assign({
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }, ctxExtra)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message } }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-r56-writer-kernel-'))
  try {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-kernel-a' })
    const started = await callJSON(a, 'vibe_v5_start', { problem: '第56轮：投影写入者', researcherCount: 1 })
    ok(started.parsed && started.parsed.ok === true, 'the assembled kernel founded the run through its own face', started.parsed && started.parsed.code)
    let found = null
    for (let i = 0; i < 80 && !found; i += 1) {
      try {
        const raw = a.handle.kernel && a.handle.kernel.store ? a.handle.kernel.store.read('members') : null
        if (raw && raw.writer && raw.writer.kernelSession === 'session-kernel-a') found = raw
      } catch { /* not yet */ }
      if (!found) await new Promise((r) => setTimeout(r, 25))
    }
    ok(found !== null, 'the assembled kernel stamps ITS session on the envelope it persists', found && found.writer)
    ok(found && found.writer && typeof found.writer.at === 'number', 'the writer it stamps carries the write stamp, not just a name', found && found.writer)

    // ★ ROUND 56: the small door answers the question too, so a reader never has to open the raw JSON file.
    const prov = await callJSON(a, 'vibe_vmu_status', { detail: 'provenance' })
    const pr = prov.parsed || {}
    const writtenBy = pr.projections && pr.projections.writtenBy
    ok(writtenBy && writtenBy.members && writtenBy.members.kernelSession === 'session-kernel-a',
      'detail:"provenance" names the writer of the members projection', writtenBy)
    ok(pr.projections && Array.isArray(pr.projections.keys) && pr.projections.keys.includes('members'),
      'it also lists which keys it could ask about', pr.projections && pr.projections.keys)
    ok(pr.projections && typeof pr.projections.means === 'string' && pr.projections.means.includes('does not mean nobody wrote it'),
      'a key with no stamp is explained instead of read as "nobody wrote it"', pr.projections && pr.projections.means)
    const provText = JSON.stringify(pr)
    ok(provText.length < 2000, 'the provenance receipt stays inside the readable budget (one line, <2000 chars)', provText.length)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

// ── 7: the TASK BOARD builds its own state envelope - it has to stamp a writer too ──────────────────────────
// LIVE RUN 56 (F-47): after `vibe_v5_start` + `vibe_v5_assign`, the provenance door showed `tasks` among `keys` but
// NOT among `writtenBy`, and the raw file confirmed its envelope carried `wroteAt` but no writer. Root cause: the
// board writes through its OWN envelope constructor (`attachSharedBoard`'s `envelopeOf`), which was not stamped when
// the projection envelopes were. A second constructor for the same durable shape is a second place to forget.
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-r56-taskboard-'))
  const a = await boot({ root: dir }, { sessionId: 'session-board-a' })
  try {
    const created = await callJSON(a, 'vibe_v5_task_create', { subject: 'board writer check' })
    ok(created.parsed && created.parsed.ok === true, 'the board accepts a task (the precondition for a board write)', created.parsed)
    let env = null
    for (let i = 0; i < 60 && !env; i += 1) {
      const raw = a.handle.kernel && a.handle.kernel.store ? a.handle.kernel.store.read('tasks') : null
      if (raw && raw.writer) env = raw
      if (!env) await new Promise((r) => setTimeout(r, 25))
    }
    ok(env !== null, 'the board envelope written by THIS kernel carries a writer', env && env.writer)
    ok(env && env.writer && env.writer.kernelSession === 'session-board-a', 'the board writer names the kernel that wrote the row', env && env.writer)
    ok(env && env.writer && typeof env.writer.at === 'number', 'the board writer carries the write stamp too', env && env.writer)
    ok(env && env.value && Array.isArray(env.value.data && env.value.data.tasks) && env.value.data.tasks.length === 1,
      'the board envelope keeps its value shape (the writer field is additive)', env && env.value && env.value.data)

    // the small door must count that key as ON DISK and name its writer
    const prov = await callJSON(a, 'vibe_vmu_status', { detail: 'provenance' })
    const pr = prov.parsed || {}
    const proj = pr.projections || {}
    ok(Array.isArray(proj.onDisk) && proj.onDisk.includes('tasks'), 'the door lists `tasks` among the keys it can actually read', proj.onDisk)
    ok(proj.writtenBy && proj.writtenBy.tasks && proj.writtenBy.tasks.kernelSession === 'session-board-a',
      'the door names the board writer, so a reader never has to open the JSON', proj.writtenBy)
    ok(Array.isArray(proj.absent) && !proj.absent.includes('tasks'), 'a key that IS on disk is never reported as absent', proj.absent)
    ok(typeof proj.absentMeans === 'string' && proj.absentMeans.includes('nothing was flushed'),
      'the door says what absence means instead of letting it read as "nobody wrote it"', proj.absentMeans)
    ok(typeof proj.keysMeans === 'string' && proj.keysMeans.includes('ATTACHED'),
      'the door says that `keys` is a registration, not a file fact', proj.keysMeans)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

// ── 8: a key that is attached but never flushed is ABSENT, not unstamped ────────────────────────────────────
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-r56-absent-'))
  const a = await boot({ root: dir }, { sessionId: 'session-fresh-b' })
  try {
    const prov = await callJSON(a, 'vibe_vmu_status', { detail: 'provenance' })
    const proj = (prov.parsed && prov.parsed.projections) || {}
    ok(Array.isArray(proj.keys) && proj.keys.length > 0, 'the fresh kernel attaches projections', proj.keys)
    const neverFlushed = proj.keys.filter((k) => !(proj.onDisk || []).includes(k))
    ok(neverFlushed.length > 0, 'at least one attached projection has not been flushed yet (the shape this defect needs)', proj)
    ok(neverFlushed.every((k) => (proj.absent || []).includes(k)),
      'every attached-but-unflushed key is listed as absent (not silently dropped, not reported as unstamped)', { absent: proj.absent, neverFlushed })
    ok(Object.keys(proj.writtenBy || {}).every((k) => (proj.onDisk || []).includes(k)),
      'writtenBy only ever speaks about keys the door could actually read', proj.writtenBy)
    const text = JSON.stringify(prov.parsed || {})
    ok(text.length < 2000, 'the door still fits the readable budget with the extra fields', text.length)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

console.log('')
if (failed) { console.error('RUN56 PROJECTION WRITER: ' + passed + ' passed, ' + failed + ' failed'); for (const f of failures) console.error('  - ' + f); process.exitCode = 1 } else console.log('RUN56 PROJECTION WRITER: ' + passed + ' passed, 0 failed')
