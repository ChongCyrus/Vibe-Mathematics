// vmu store — the capability scenario for kernel/store.js (docs/07).
//
// The four scenarios the document promises (docs/07 §6), each one tied to a defect this repository
// has already paid for:
//   1. concurrent writes in the SAME tick must not lose one (e2e-v5-round2, and the v5r
//      leanApplySettle case) — this is why mutations go through `patch(key, current => next)`;
//   2. the key whitelist is enforced on write AND on load: an undeclared key is an error, never a
//      silent drop;
//   3. writes are atomic (temp + rename) and acknowledged only once the file is complete;
//   4. migration is all-or-nothing, backs up first, and refuses to start half-migrated.
// Plus observability (R11), subscriptions with their disposer, and export/import round-trip.
//
// `--self-probe` swaps `patch` for a naive read-modify-write and REQUIRES the concurrency assertion to
// fail: that proves the check can actually catch a lost update instead of passing by construction.

import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SELF_PROBE = process.argv.includes('--self-probe')

const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'store.js')).href)

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

const root = await mkdtemp(join(tmpdir(), 'vmu-store-'))
const openStore = async (opts = {}) => {
  const s = m.createStore(Object.assign({ root, clock: () => '2026-10-09T00:00:00.000Z' }, opts))
  const info = await s.open()
  if (!SELF_PROBE) return { store: s, info }
  // deliberately naive: read outside the fold, then write the whole value back => lost update
  const naive = Object.create(s)
  naive.patch = async (key, fn) => { const cur = s.read(key); return s.write(key, fn(cur)) }
  return { store: naive, info }
}

// ---- 1. open creates a harmless fold -----------------------------------------------------------
{
  const { store, info } = await openStore()
  ok(info.opened === 'created', 'a fresh workspace creates the durable file')
  ok(info.version === m.STATE_VERSION, 'the created file carries the current projection version')
  ok(m.PUBLIC_KEYS.every((k) => store.read(k) !== undefined), 'every public key exists with a harmless default')
  ok(Array.isArray(store.read('members')) && store.read('members').length === 0, 'defaults enable nothing')
  ok(store.read('phase') === null, 'the default phase is "none"')
  const st = store.stats()
  ok(st.open === true && st.keys === m.PUBLIC_KEYS.length, 'stats() reports the open fold (R11)')

  // ---- 2. round-trip, clone isolation and compare-and-set -------------------------------------
  await store.write('phase', 'explore')
  ok(store.read('phase') === 'explore', 'write then read round-trips')
  const copy = store.read('members')
  copy.push('not-in-the-fold')
  ok(store.read('members').length === 0, 'read returns a clone: a caller cannot mutate the fold')
  await expectThrow(() => store.write('phase', 'x', { expect: 999 }), 'VMU_STORE_FAILED',
    'a stale compare-and-set expectation is refused by name')

  // ---- 3. concurrent patches in one tick must both survive ------------------------------------
  await Promise.all([
    store.patch('members', (cur) => cur.concat('m-1')),
    store.patch('members', (cur) => cur.concat('m-2')),
  ])
  const after = store.read('members').slice().sort()
  ok(after.length === 2 && after[0] === 'm-1' && after[1] === 'm-2',
    'two patches in the same tick both survive (no lost update)', JSON.stringify(after))
  const untouched = await store.patch('members', () => undefined)
  ok(untouched.changed === false, 'a patch returning undefined changes nothing')

  // ---- 4. the whitelist is enforced on write ... ----------------------------------------------
  await expectThrow(() => store.write('not.declared', 1), 'VMU_INVALID_ARGUMENT', 'writing an undeclared key is refused')
  await expectThrow(() => store.read('not.declared'), 'VMU_INVALID_ARGUMENT', 'reading an undeclared key is refused')
  await expectThrow(() => store.patch('not.declared', () => 1), 'VMU_INVALID_ARGUMENT', 'patching an undeclared key is refused')

  // ---- 5. subscriptions fire with (next, prev) and their disposer works ------------------------
  const seen = []
  const off = store.subscribe('phase', (next, prev) => seen.push(next + '<-' + prev))
  await store.write('phase', 'formalize')
  off()
  await store.write('phase', 'close')
  ok(seen.length === 1 && seen[0] === 'formalize<-explore', 'subscribe fires once, with next and prev', JSON.stringify(seen))

  // ---- 6. atomic writes leave no debris and always a complete document ------------------------
  const entries = await readdir(join(root, 'vmu'))
  ok(!entries.some((f) => f.endsWith('.tmp')), 'no temp file survives a write')
  const parsed = JSON.parse(await readFile(store.file, 'utf8'))
  ok(parsed && parsed.version === m.STATE_VERSION && parsed.keys.phase === 'close', 'the visible file is a complete document')

  // ---- 7. export / import round-trip ----------------------------------------------------------
  const snap = store.export()
  await store.write('phase', 'mutated')
  await store.import(snap)
  ok(store.read('phase') === 'close', 'import restores an exported snapshot')
  await expectThrow(() => store.import({ version: m.STATE_VERSION, keys: { nope: 1 } }), 'VMU_INVALID_ARGUMENT',
    'import refuses a snapshot with an undeclared key')
}

// ---- 8. migration: all-or-nothing, backed up, never half-migrated -----------------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-store-mig-'))
  await mkdir(join(dir, 'vmu'), { recursive: true })
  const keys = {}
  for (const k of m.PUBLIC_KEYS) keys[k] = k === 'phase' ? null : (k === 'settings.resolved' || k === 'budget' ? {} : [])
  keys.phase = 'legacy'
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: 0, keys }, null, 2), 'utf8')

  await expectThrow(async () => {
    const s = m.createStore({ root: dir })
    await s.open()
  }, 'VMU_STORE_MIGRATION', 'a version bump without a migrator refuses to start (never half-migrated)')

  const s2 = m.createStore({
    root: dir,
    migrators: [{ from: 0, id: 'v0->v1', up: (state) => { state.keys.phase = 'migrated' } }],
  })
  const info = await s2.open()
  ok(info.migration.applied.length === 1 && info.migration.backedUp === true, 'the migrator ran and the old file was backed up')
  ok(s2.read('phase') === 'migrated', 'the migrated value is visible after open')
  const files = await readdir(join(dir, 'vmu'))
  ok(files.some((f) => f.includes('.bak.0')), 'the pre-migration backup is on disk', files.join(','))

  // newer than this build: refuse
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: m.STATE_VERSION + 1, keys }, null, 2), 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_MIGRATION',
    'a durable file newer than this build is refused, not downgraded')

  // corrupt: refuse and leave the evidence alone
  await writeFile(join(dir, 'vmu', 'state.json'), '{ this is not json', 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_FAILED',
    'a corrupt durable file is refused')
  ok((await readFile(join(dir, 'vmu', 'state.json'), 'utf8')) === '{ this is not json',
    'the corrupt file is left untouched for inspection')

  // undeclared key inside the file: refuse
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: m.STATE_VERSION, keys: Object.assign({}, keys, { ghost: 1 }) }, null, 2), 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_FAILED',
    'a durable file carrying an undeclared key is refused on load')

  await rm(dir, { recursive: true, force: true })
}

// ---- 9. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  ok(failed > 0, 'self-probe: the naive read-modify-write lost an update and the assertion caught it', failed)
  console.log('=== VMU STORE SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  await rm(root, { recursive: true, force: true })
  process.exit(failed > 0 ? 0 : 1)
}

await rm(root, { recursive: true, force: true })
console.log('=== VMU STORE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
