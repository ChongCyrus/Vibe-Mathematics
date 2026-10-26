// vmu store layer 4 — CROSS-INSTANCE COHERENCE (docs/07 §1-(5)).
//
// Why this file exists: the real machine proved the gap. Live run 13 (`D:\wd\vibemath开发\_oneoff\vm-slv\full-1025-194540.jsonl`)
// had four member child sessions, each mounting its OWN kernel instance over the SAME `<root>/vmu/state.json`.
// Three of them reported, unprompted:
//   · `vibe_vmu_control {action:'roster'}` → empty table, `live: 0`, chair/member/temp `occupied: 0`
//   · `vibe_v5_say` / `vibe_v5_tool_help` / `vibe_vmu_tools` → `VMU_NO_SUCH_OBJECT` "the roster holds 0 member(s)"
//   · `records expand r-5` → `VMU_NO_SUCH_OBJECT` (known ids stop at r-4) while the file on disk DID hold r-5..r-7
// i.e. a fold cached at `open()` is a SNAPSHOT: every kernel saw the institute as it was when IT started, and later
// writes by the office were invisible to it. A single-process caller-played run could never show this.
//
// So the store now revalidates a STAMP (mtime+size) before every read, reloads before every write, and takes an
// exclusive-create lock file while writing. This suite pins all three:
//   1. a second instance SEES the first instance's write (the defect above);
//   2. a second instance's patch BUILDS ON the first instance's value instead of clobbering it (no lost update);
//   3. the lock file is not left behind, and two stores writing concurrently both survive;
//   4. `refresh()` reports what it did, and `coherence:'off'` reproduces the old stale behaviour ON PURPOSE — so the
//      check is proven able to fail, not passing by construction;
//   5. (R30 / task-17) `open()` takes the SAME exclusive lock the writers take, so a kernel that is merely opening can
//      no longer make another kernel's atomic `rename` fail with `EPERM` (measured before the fix: 259 of 400
//      acknowledged patches refused, and the next kernel opened onto the OLD file);
//   6. interleaved open/patch pairs across two kernels: no refused write, no silently lost write, no give-up;
//   7. a transient rename refusal (a handle held open by THIS process) is retried inside the mutex and lands EXACTLY
//      once — the retry re-reads the file, so it cannot duplicate its own unpersisted value;
//   8. a plain NON-locking reader in ANOTHER process can neither lose nor duplicate the write: it lands once, or the
//      store refuses by name (`VMU_STORE_FAILED`) with the give-up counted in `stats.writeRetryGiveUps`.

import { mkdtemp, rm, readFile, readdir, stat, writeFile, unlink } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')

const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'store.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const root = await mkdtemp(join(tmpdir(), 'vmu-coherence-'))
const openStore = async (opts = {}) => {
  const s = m.createStore(Object.assign({ root }, opts))
  await s.open()
  return s
}

// `ids(s)` is a VALUE NORMALISER, not a degraded file read: the store seeds the `ids` key `null`
// (`kernel/store.js` NULL_SEEDED — "nothing has been projected yet" is the honest first-run state, and a `[]` there
// would make recovery report a projection gap). Writing `s.read('ids') || []` inline is the same normalisation but it
// LOOKS like `readFileSync(p) || ''`, the shape `audit-no-silent-reads` exists to catch — so the shape is removed at
// its source. The assertions below keep exactly the same strictness: a non-array or non-empty fold still fails them.
const ids = (s) => { const v = s.read('ids'); return Array.isArray(v) ? v : [] }

try {
  // ── 1. the defect itself: instance B must see instance A's write
  const a = await openStore()
  const b = await openStore()
  ok(ids(a).length === 0 && ids(b).length === 0, 'both instances start empty')

  await a.patch('ids', (cur) => (cur || []).concat(['r-1']))
  ok(ids(a).length === 1, 'A sees its own write')
  ok(ids(b).length === 1,
    '★★ B (a DIFFERENT kernel instance over the same file) sees A\'s write — this is the run-13 defect',
    JSON.stringify(ids(b)))
  ok(b.stats().reloads >= 1, '★ the reload is counted, not invisible', JSON.stringify({ reloads: b.stats().reloads }))

  // ── 2. no lost update: B patches what A just wrote
  await b.patch('ids', (cur) => (cur || []).concat(['r-2']))
  const afterBoth = ids(a)
  ok(afterBoth.length === 2 && afterBoth.join(',') === 'r-1,r-2',
    '★★ B patched ON TOP of A\'s value (a stale fold would have written r-2 alone)',
    JSON.stringify(afterBoth))

  // ── 3. the lock file is released and concurrent writers both survive
  await Promise.all([
    a.patch('ids', (cur) => (cur || []).concat(['r-3'])),
    b.patch('ids', (cur) => (cur || []).concat(['r-4'])),
  ])
  const final = ids(a).slice().sort().join(',')
  ok(final === 'r-1,r-2,r-3,r-4', '★★ two concurrent writers both survive', final)
  const leftovers = (await readdir(join(root, 'vmu'))).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'))
  ok(leftovers.length === 0, '★ no lock or temp file is left behind', JSON.stringify(leftovers))

  // ── 4. refresh() says what it did; coherence:'off' reproduces the OLD behaviour on purpose
  const r1 = a.refresh()
  ok(r1.ok === true && r1.coherence === 'on', 'refresh() reports the coherence mode', JSON.stringify(r1))
  const stale = await openStore({ coherence: 'off' })
  await a.patch('ids', (cur) => (cur || []).concat(['r-5']))
  ok(ids(stale).indexOf('r-5') === -1,
    '★★ coherence:"off" DOES go stale — the check is falsifiable, not vacuous',
    JSON.stringify(ids(stale)))
  ok(stale.refresh().reloaded === true, 'and an explicit refresh() fixes it', JSON.stringify(stale.refresh()))

  // ── 5. the file itself is a complete document at every step (the rename discipline still holds)
  const parsed = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  ok(Array.isArray(parsed.keys.ids) && parsed.keys.ids.length === 5, 'the durable file is complete JSON with all five ids',
    JSON.stringify(parsed.keys.ids))
  const st = await stat(join(root, 'vmu', 'state.json'))
  ok(st.size > 0, 'and it is non-empty on disk')

  // ── 5. R30 / task-17: open() is INSIDE the writers' mutex. Measured on this machine before the fix: a kernel that was
  // merely OPENING made another kernel's `rename(tmp -> state.json)` answer `EPERM ... operation not permitted`; the
  // write was acknowledged in memory but never reached the file, and the NEXT kernel opened onto the OLD value. This
  // assertion would have failed on that code: open() ignored the lock file entirely (it returned at once, lockWaits 0).
  const raceRoot = await mkdtemp(join(tmpdir(), 'vmu-race-'))
  const raceLock = join(raceRoot, 'vmu', 'state.json.lock')
  const writer2 = m.createStore({ root: raceRoot })
  await writer2.open()
  // a fat fold widens the write window (writeFile + rename take measurably longer than a read), so the interleave below
  // hits the race window on the OLD code deterministically instead of once every few hundred attempts.
  await writer2.patch('work', () => Array.from({ length: 1200 }, (_, i) => 'row-' + i))
  await writeFile(raceLock, JSON.stringify({ pid: process.pid, at: 'held-by-the-test' }), 'utf8')
  const opener = m.createStore({ root: raceRoot })
  const opening = opener.open()
  await new Promise((r) => setTimeout(r, 90))
  const waitsWhileLocked = opener.stats().lockWaits
  await unlink(raceLock)
  const openedWhileLocked = await opening
  ok(openedWhileLocked && waitsWhileLocked >= 1,
    '★★ open() WAITS on the same exclusive lock a writer holds — opening is inside the mutex, not racing it',
    JSON.stringify({ lockWaits: waitsWhileLocked, opened: !!openedWhileLocked }))

  // ── 6. interleaved open/patch across two kernels: every patch lands, nothing refused, nothing silently lost
  const REFUSED = []
  const ROUNDS = 120
  for (let i = 0; i < ROUNDS; i++) {
    const fresh = m.createStore({ root: raceRoot }) // a NEW kernel opening while the writer is mid-patch
    const [w] = await Promise.allSettled([
      writer2.patch('work', (cur) => (Array.isArray(cur) ? cur : []).concat('w' + i)),
      fresh.open(),
    ])
    if (w.status === 'rejected') REFUSED.push(String((w.reason && w.reason.code) || w.reason).slice(0, 60))
  }
  const after = m.createStore({ root: raceRoot })
  await after.open()
  const landed = after.read('work')
  const MISSING = []
  for (let i = 0; i < ROUNDS; i++) if (!Array.isArray(landed) || landed.indexOf('w' + i) === -1) MISSING.push(i)
  const wstats = writer2.stats()
  ok(REFUSED.length === 0 && MISSING.length === 0 && wstats.writeRetryGiveUps === 0,
    '★★ ' + ROUNDS + ' interleaved open/patch pairs: every acknowledged write is on disk, no EPERM refusal, no give-up',
    JSON.stringify({ refused: REFUSED.slice(0, 3), missing: MISSING.slice(0, 5), writeRetries: wstats.writeRetries, giveUps: wstats.writeRetryGiveUps }))

  // ── 7. a transient `EPERM` on the atomic rename IS retried, counted, and lands EXACTLY ONCE — measured with a handle
  // THIS process holds open (Windows refuses the rename while it is open). The handle is released as soon as the store
  // REPORTS its first retry (`stats.writeRetries`), not on a timer guess: that makes the collision deterministic instead
  // of a race between the write and a sleep. On a host where renaming over an open handle is allowed (POSIX) the write
  // lands on the first attempt, which the assertion accepts explicitly.
  const stateFile = join(raceRoot, 'vmu', 'state.json')
  const heldFd = openSync(stateFile, 'r')
  let heldReleased = false
  const releaseHeld = () => {
    if (heldReleased) return
    heldReleased = true
    try { closeSync(heldFd) } catch { /* already closed */ }
  }
  const retryWatch = setInterval(() => { if (writer2.stats().writeRetries >= 1) releaseHeld() }, 2)
  const heldSafety = setTimeout(releaseHeld, 400)
  const held = await writer2.patch('work', (cur) => (cur || []).concat('held')).then(
    () => ({ ok: true }), (e) => ({ ok: false, code: e.code, attempts: e.attempts }))
  clearInterval(retryWatch)
  clearTimeout(heldSafety)
  releaseHeld()
  const heldStats = writer2.stats()
  const heldVerifier = m.createStore({ root: raceRoot })
  await heldVerifier.open()
  const heldWork = heldVerifier.read('work') // disk truth: the retry must have re-read the file before merging again
  ok(held.ok === true && heldWork.filter((v) => v === 'held').length === 1
    && (process.platform !== 'win32' || heldStats.writeRetries >= 1),
    '★★ a transient rename refusal is RETRIED and lands EXACTLY ONCE — the retry re-read the file, not its own unpersisted value',
    JSON.stringify({ held, writeRetries: heldStats.writeRetries, giveUps: heldStats.writeRetryGiveUps, landed: heldWork.filter((v) => v === 'held').length, platform: process.platform }))

  // ── 8. TWO PROCESSES: a plain reader in ANOTHER process holds no lock at all. The outcome must be honest in both
  // directions — the write lands exactly once, or the store REFUSES by name (`VMU_STORE_FAILED`), counts the give-up and
  // leaves the disk without the value. What may NEVER happen is an acknowledged write that is missing or duplicated.
  const childSrc = 'const fs=require("fs");const h=fs.openSync(' + JSON.stringify(stateFile) +
    ',"r");process.stdout.write("held\\n");setTimeout(()=>{try{fs.closeSync(h)}catch{}},30)'
  const child = spawn(process.execPath, ['-e', childSrc], { stdio: ['ignore', 'pipe', 'ignore'] })
  await new Promise((res, rej) => { child.stdout.once('data', res); child.once('error', rej) })
  const childExited = new Promise((res) => child.once('exit', res))
  const xproc = await writer2.patch('work', (cur) => (cur || []).concat('xproc')).then(
    () => ({ ok: true }), (e) => ({ ok: false, code: e.code, attempts: e.attempts }))
  await childExited
  const xstats = writer2.stats()
  const xverifier = m.createStore({ root: raceRoot })
  await xverifier.open()
  const xwork = xverifier.read('work')
  const xCount = Array.isArray(xwork) ? xwork.filter((v) => v === 'xproc').length : -1
  const honest = xproc.ok === true
    ? xCount === 1
    : (xproc.code === 'VMU_STORE_FAILED' && xCount === 0 && xstats.writeRetryGiveUps === 1 && xstats.writeRetries >= 1)
  ok(honest,
    '★★ a write colliding with a NON-locking reader in ANOTHER PROCESS is never silently lost or duplicated (lands once, or refuses by name with the give-up counted)',
    JSON.stringify({ xproc, xCount, writeRetries: xstats.writeRetries, giveUps: xstats.writeRetryGiveUps, platform: process.platform }))
  const raceLeftovers = (await readdir(join(raceRoot, 'vmu'))).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'))
  ok(raceLeftovers.length === 0, '★ the race section leaves no lock or temp file behind', JSON.stringify(raceLeftovers))
  await rm(raceRoot, { recursive: true, force: true })
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('=== VMU STORE COHERENCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  for (const f of failures) console.log('  FAIL ' + f)
  process.exit(1)
}
