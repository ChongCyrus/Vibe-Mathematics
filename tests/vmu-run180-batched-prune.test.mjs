// tests/vmu-run180-batched-prune.test.mjs — RUN 180: A PRUNE OF A FULL TRACK IS ONE WRITE, NOT N
//
// THE DEFECT THIS PINS (measured on the twenty-fifth live run, 2026-11-01). The brief asked the office to bring the
// paper track back under its limit with `vibe_vmu_records {action:"prune", track:"paper", keep:6}`. The track held 195
// live rows, so 189 of them had to move to the trash. Each `records.remove` triggered the kernel's whole persistence
// snapshot (walk every track, rebuild ~700 rows, patch a multi-megabyte state file) — about 1.2 s per row, so the call
// needed minutes. The drive's HTTP read of the tool result gave up with `UND_ERR_HEADERS_TIMEOUT` and the run died
// with the prune half-issued and no receipt: from the caller's side a legitimate, documented repair was
// indistinguishable from a hang.
//
// WHAT IS TESTED HERE: (1) the batched path exists and is what `prune` uses; (2) a 55-row prune really moves 55 rows
// with ONE durable write and answers every line (track, state, purgeAt); (3) a permanent row inside the batch does not
// abort the rows behind it (per-row errors are reported, not thrown); (4) with no batch API the per-row path still
// works (the fallback is not dead code).
//
// Run: node tests/vmu-run180-batched-prune.test.mjs   (last line: === VMU RUN180 BATCHED PRUNE: N passed, M failed ===)

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) }
  else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const say = (m) => console.log(m)

const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r180-')); roots.push(d); return d }

const boot = async (settings = {}) => {
  const st = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { st.specs.push(spec); return () => {} } },
  }
  const root = await mkRoot()
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, root, specOf: (n) => st.specs.find((x) => x.name === n) }
}

const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true, parsed: null }
  let raw
  try { raw = await spec.execute(args || {}, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint, parsed: null }
  }
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  return { parsed, ok: !!(parsed && parsed.ok !== false) }
}

const seeds = async (kernel, track, n, opts = {}) => {
  const ids = []
  for (let i = 0; i < n; i += 1) {
    const extra = i === 0 && opts.firstPermanent ? { tags: ['permanent'] } : {}
    const r = await kernel.records.put(Object.assign({ track, kind: 'progress', title: track + '-row-' + i, body: 'body number ' + i + ' of ' + track, by: 'r-acad' }, extra))
    ids.push(r.id)
  }
  return ids
}

say('=== 0. THE BATCHED PATH IS DECLARED IN SOURCE, WHERE A READER CAN SEE IT ===')
{
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const hostSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  ok(/let snapshotSuppressed = 0/.test(kernelSrc) && /snapshotSuppressed > 0\) return/.test(kernelSrc),
    '§0a the snapshot is SUPPRESSIBLE (a batch can hold it while it flips rows)', true)
  ok(/records\.removeMany = function removeMany\(list = \[\]\)/.test(kernelSrc),
    '§0b the kernel exposes a batched `removeMany`', true)
  ok(/snapshotSuppressed \+= 1[\s\S]{0,900}snapshotSuppressed -= 1[\s\S]{0,900}snapshotRecords\(\)/.test(kernelSrc),
    '§0c it suppresses for the whole batch and writes the fold ONCE at the end', true)
  ok(/const batchRemove = !preview && typeof rc\.removeMany === 'function'/.test(hostSrc),
    '§0d `prune` prefers the batched form', true)
  ok(/ok: failed\.length === 0/.test(kernelSrc),
    '§0e per-row failures are REPORTED, not thrown (one permanent row must not abort the rest)', true)
}

say('=== 1. A 55-ROW PRUNE MOVES 55 ROWS WITH ONE WRITE AND ANSWERS EVERY LINE ===')
{
  const b = await boot()
  const track = 'paper'
  await seeds(b.K, track, 60)
  const before = await call(b, 'vibe_vmu_records', { action: 'status' })
  const liveBefore = before.parsed.records.byTrack[track]
  ok(liveBefore === 60, '§1a the track really holds 60 live rows before the prune', liveBefore)
  const started = Date.now()
  const pr = await call(b, 'vibe_vmu_records', { action: 'prune', track, keep: 5, why: 'run 180 batch probe' })
  const elapsed = Date.now() - started
  const p = pr.parsed || {}
  ok(p.ok === true && p.prunedCount === 55 && p.liveBefore === 60 && p.liveAfter === 5,
    '§1b one call moves exactly the 55 oldest rows', { prunedCount: p.prunedCount, liveBefore: p.liveBefore, liveAfter: p.liveAfter })
  ok(Array.isArray(p.pruned) && p.pruned.length === 55, '§1c every moved row is named', p.pruned && p.pruned.length)
  ok(p.pruned.every((r) => r.track === track && r.state === 'trashed' && Number.isFinite(Number(r.purgeAt))),
    '§1d every line carries its own track, the trashed state and a numeric purgeAt', p.pruned.slice(0, 2))
  ok(Array.isArray(p.pinned) && p.pinned.length === 0, '§1e nothing was pinned', p.pinned)
  ok(elapsed < 20000, '§1f the batch finishes in well under a minute (per-row snapshots would not)', elapsed + 'ms')
  const after = await call(b, 'vibe_vmu_records', { action: 'status' })
  ok(after.parsed.records.byTrack[track] === 5 && after.parsed.records.trashed === 55,
    '§1g the reader sees 5 live and 55 trashed', { live: after.parsed.records.byTrack[track], trashed: after.parsed.records.trashed })
  const restorable = await call(b, 'vibe_vmu_records', { action: 'restore', id: p.pruned[0].id })
  const restoredRow = restorable.parsed && Array.isArray(restorable.parsed.restored) ? restorable.parsed.restored[0] : null
  ok(restoredRow && restoredRow.state === 'live' && restorable.parsed.restoredCount === 1,
    '§1h a batched trash is still restorable (the batch is a repair, not a delete)', restoredRow)
}

say('=== 2. A PERMANENT ROW INSIDE THE BATCH IS PINNED, NOT AN ABORT ===')
{
  const b = await boot()
  const track = 'paper'
  const ids = await seeds(b.K, track, 20, { firstPermanent: true })
  const keeper = ids[0]
  const pr = await call(b, 'vibe_vmu_records', { action: 'prune', track, keep: 3, why: 'run 180 pin probe' })
  const p = pr.parsed || {}
  ok(p.ok === true, '§2a the call still succeeds when one row cannot leave', { ok: p.ok, code: p.code, message: p.message })
  ok(Array.isArray(p.pinned) && p.pinned.includes(keeper), '§2b THAT row is named as pinned', { keeper, pinned: p.pinned })
  ok(p.prunedCount === 16, '§2c the rows behind it still moved (20 - 1 permanent - 3 kept)', { prunedCount: p.prunedCount, prunedLen: p.pruned && p.pruned.length })
  const stillLive = await call(b, 'vibe_vmu_records', { action: 'expand', id: keeper })
  ok(stillLive.parsed && stillLive.parsed.id === keeper && stillLive.parsed.status === 'live',
    '§2d the pinned row is still live (and the receipt said so)', stillLive.parsed && { id: stillLive.parsed.id, status: stillLive.parsed.status })
  const statusAfter = await call(b, 'vibe_vmu_records', { action: 'status' })
  ok(statusAfter.parsed.records.trashed === p.pruned.length,
    '§2e the trash count matches the rows the receipt said it moved', { trashed: statusAfter.parsed.records.trashed, moved: p.pruned.length })
}

say('=== 3. THE PER-ROW FALLBACK IS NOT DEAD CODE ===')
{
  const b = await boot()
  const track = 'paper'
  await seeds(b.K, track, 8)
  const batched = b.K.records.removeMany
  delete b.K.records.removeMany
  try {
    const pr = await call(b, 'vibe_vmu_records', { action: 'prune', track, keep: 2, why: 'run 180 fallback probe' })
    const p = pr.parsed || {}
    ok(p.ok === true && p.prunedCount === 6, '§3a a kernel without the batch still prunes (one row at a time)', { prunedCount: p.prunedCount, code: p.code })
    ok(Array.isArray(p.pruned) && p.pruned.length === 6,
      '§3b the fallback names every row it moved', p.pruned && p.pruned.length)
    ok(p.pruned.every((r) => r.track === track && r.state === 'trashed'),
      '§3c and its lines are shaped the same', p.pruned.slice(0, 1))
  } finally { b.K.records.removeMany = batched }
}

for (const dir of roots) { try { await rm(dir, { recursive: true, force: true }) } catch { /* in-flight fold writes */ } }
console.log('\n=== VMU RUN180 BATCHED PRUNE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures:\n - ' + failures.join('\n - ')); process.exitCode = 1 }
