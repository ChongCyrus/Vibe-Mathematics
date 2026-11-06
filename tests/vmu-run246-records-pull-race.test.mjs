// tests/vmu-run246-records-pull-race.test.mjs -- ROUND 246 (RUN 246): THE DURABLE GATE AND THE PULL, ASSERTED AGAINST
// state.json ON DISK.
//
// WHY THIS SUITE EXISTS. tests/vmu-run36-records-shared.test.mjs section 2 used to prove "the row really is in the
// DURABLE fold (state.json)" by reading `k.store.read('records')` -- the in-memory fold of the SAME instance that wrote
// it. The durable write is asynchronous: store.js `mutate()` sets `fold.keys[key] = next` (store.js:350) and only then
// `await persist()`, whose tmp+rename (store.js:291-313) adopts the stamp AFTER the rename. So the old gate passed on
// memory and went red under parallel load exactly when the gate moment had fileHas=false (measured 6/6 correlated).
// The gate now reads the file; THIS suite pins the properties that a file-based gate rests on, so the fix cannot quietly
// turn into "read the file, but still believe the kernel":
//
//   1. A row that IS in state.json is visible to a kernel that booted FIRST and had already read an EMPTY list -- and
//      the restored row's fingerprint VERIFIES (a pull RESTORES the row; it does not re-mint a lookalike).
//   2. A pull INVENTS NOTHING: every id the reader lists exists in the durable file. No ghost rows can appear from a
//      sibling instance's unflushed memory (the only way to satisfy a race by cheating).
//   3. An id nobody wrote is still refused BY NAME (`VMU_NO_SUCH_OBJECT`): reading the shared file did not become
//      "read anything".
//   4. A READ MUST NOT WRITE: list/get through the seam leave state.json BYTE-IDENTICAL and bump no store write.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

const entry = await import(pathToFileURL(ENTRY).href)

const BASE = 'D:/_tmp/r246/records'
await mkdir(BASE, { recursive: true })

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specs: state.specs }
}
const railOn = (root) => ({ root, packs: ['v5r'], clock: () => 1000 })
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }

// The DURABLE file -- store.file is the state.json path. This is the only source of truth this suite trusts for
// "is it really written"; k.store.read() is deliberately NOT used for that question.
const durableDoc = (k) => {
  try { return JSON.parse(readFileSync(k.store.file, 'utf8')) } catch (e) { return null }
}
const durableRows = (k) => {
  const doc = durableDoc(k)
  return doc && doc.keys && Array.isArray(doc.keys.records) ? doc.keys.records : []
}
const fileIds = (k) => durableRows(k).map((r) => (r && r.id) || '?')
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}

console.log('=== 1. A ROW THAT IS IN state.json IS VISIBLE TO A KERNEL THAT BOOTED FIRST ===')
const root = await newRoot('race')
const B = await boot(railOn(root)) // "the office": boots first, reads, closes its latch on an empty store
const bEmpty = B.kernel.records.list({ track: 'progress', limit: 0 })
ok(bEmpty.ok === true && bEmpty.count === 0 && Array.isArray(bEmpty.items) && bEmpty.items.length === 0,
  '1 B booted FIRST and really read an EMPTY list (the precondition; without it the pull below proves nothing)', bEmpty.items)
const A = await boot(railOn(root)) // "a member child session": its OWN kernel over the SAME root
ok(A.kernel !== B.kernel, '1 A and B are SEPARATE kernel instances over the same root (ONE state.json, SEVERAL kernels)', { same: A.kernel === B.kernel })
const put = A.kernel.records.put({ track: 'progress', kind: 'verified', title: 'p-race-sum', body: 'the race card', tags: ['r246'], by: 'r-6' })
ok(put.ok === true && typeof put.id === 'string' && put.deduplicated === false, '1 A put returned a real id (the fixture wrote something)', put)
const onDisk = await until(() => fileIds(A.kernel).includes(put.id), 5000)
ok(!!onDisk, '1* the row is REALLY in state.json ON DISK (readFileSync of store.file, polled up to 5s; not "the kernel remembers it")',
  { idsOnDisk: fileIds(A.kernel) })
const bList = B.kernel.records.list({ track: 'progress', limit: 0 })
ok(bList.ok === true && bList.count === 1 && Array.isArray(bList.items) && bList.items.length === 1 && bList.items[0].id === put.id,
  '1* B now lists the row that was written to the file after B had read an empty list', bList.items.map((i) => i.id))
const bGet = serr(() => B.kernel.records.get({ id: put.id }))
ok(!bGet.error, '1* B resolves the id instead of refusing VMU_NO_SUCH_OBJECT',
  bGet.error ? { code: bGet.error.code, message: bGet.error.message } : null)
const got = bGet.value || {}
ok(got.title === 'p-race-sum' && got.body === 'the race card' && got.track === 'progress' && got.kind === 'verified',
  '1 the pulled row is the SAME row (title/body/track/kind), not a placeholder minted to satisfy the lookup',
  { title: got.title, body: got.body, track: got.track, kind: got.kind })
ok(got.fingerprintOk === true && typeof got.fingerprint === 'string' && got.fingerprint.length === 64,
  '1* the pulled row fingerprint VERIFIES (recomputed === stored): restored, not re-derived into a lookalike',
  { fingerprintOk: got.fingerprintOk, len: typeof got.fingerprint === 'string' ? got.fingerprint.length : null })
ok(got.status === 'live', '1 the pulled row is live in this instance too (nothing invented a trashed/superseded state)', { status: got.status })
const bShared = B.kernel.records.status().shared
ok(bShared && bShared.attached === true && bShared.pulls >= 1 && bShared.pulled >= 1,
  '1* the seam is ATTACHED and the pull is COUNTED (pulls/pulled >= 1): a silent refresh would be its own defect', bShared)

console.log('=== 2. A PULL INVENTS NOTHING: every listed id exists in state.json ===')
const listedIds = B.kernel.records.list({ track: 'progress', limit: 0 }).items.map((i) => i.id)
const diskIds = fileIds(B.kernel)
ok(listedIds.length > 0, '2 the reader has rows to compare (non-vacuous: the negative check below has something to check)', listedIds)
ok(listedIds.every((id) => diskIds.includes(id)),
  '2* every id B lists EXISTS IN state.json - no ghost row from a sibling instance that never flushed to disk', { listedIds, diskIds })
// and the reverse direction, from a FRESH instance over the same root: it must see exactly the file's ids, not fewer
const C = await boot(railOn(root))
const cIds = C.kernel.records.list({ track: 'progress', limit: 0 }).items.map((i) => i.id)
ok(diskIds.length > 0, '2 the durable file really carries ids (non-vacuous guard for the set equality below)', diskIds)
ok(cIds.length === diskIds.length && cIds.every((id) => diskIds.includes(id)),
  '2* a kernel booting NOW sees exactly the ids the file carries (memory never invents, memory never hides)', { cIds, diskIds })

console.log('=== 3. THE GATE IS NOT LOOSENED: an unknown id is still refused BY NAME ===')
const ghost = serr(() => B.kernel.records.get({ id: 'p-nobody-wrote-this' }))
ok(ghost.error && ghost.error.code === 'VMU_NO_SUCH_OBJECT',
  '3* a row that exists nowhere is still REFUSED with VMU_NO_SUCH_OBJECT (cross-instance read != read anything)',
  ghost.error ? ghost.error.code : ghost.value)
ok(ghost.error && /known ids: /.test(String(ghost.error.hint)) && !/known ids: \(none\)/.test(String(ghost.error.hint)),
  '3* the hint lists the ids this instance can REALLY see (the ids on disk are non-empty, so "(none)" would be a lie)',
  ghost.error ? ghost.error.hint : null)

console.log('=== 4. A READ MUST NOT WRITE: state.json is byte-identical after list/get ===')
const rawBefore = readFileSync(B.kernel.store.file, 'utf8')
const writesBefore = B.kernel.store.stats().writes
const reads = []
reads.push(B.kernel.records.list({ track: 'progress', limit: 0 }))
reads.push(serr(() => B.kernel.records.get({ id: put.id })))
reads.push(B.kernel.records.list({ track: 'progress', limit: 2 }))
const rawAfter = readFileSync(B.kernel.store.file, 'utf8')
ok(reads.length === 3 && !reads[1].error && reads[2].count === 1,
  '4 the three reads really happened (non-vacuous: the byte comparison below is not comparing after a crash)', { reads: reads.length })
ok(rawAfter === rawBefore,
  '4* state.json is BYTE-IDENTICAL after the reads (the pull is a read; a read that writes is a second writer)',
  { bytesBefore: rawBefore.length, bytesAfter: rawAfter.length })
ok(B.kernel.store.stats().writes === writesBefore,
  '4* no store write was bumped by the reads', { before: writesBefore, after: B.kernel.store.stats().writes })

for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch (e) { /* best effort */ } }

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  . ' + f) }
console.log('=== VMU RUN246 RECORDS PULL RACE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
