// vmu store teardown — what a write does when its own STORE ROOT is deleted under it (R31 / task-20).
//
// Measured defect: `tests/vmu-meeting-invite.test.mjs` passed all 69 assertions and then exited 1 with
// `Error: ENOENT: no such file or directory, open '…/vmu/state.json.<pid>.<n>.<rand>.tmp'` in about one run in
// five. The write that outlived the test's `rm(root)` was a FIRE-AND-FORGET marker write (`store.patch` whose
// promise nobody awaits); the crash was the unhandled rejection of the DERIVED promise that `patch()` used to
// return. Two things are asserted here, and they are different on purpose:
//
//   1. HONESTY — a write after teardown cannot land, so it must refuse BY NAME: the registered code `VMU_STORE_FAILED`
//      with `reason: 'root-gone'` (a dedicated code would need a docs/03 §8 registration, which this task does not own),
//      saying the write is NOT acknowledged and counting itself in `stats.writeRootGone`, not as a filesystem accident;
//   2. NO PROCESS DEATH — an un-awaited write must not become an unhandled rejection: a teardown cannot be awaited,
//      and a test that passed every assertion must not exit 1 because of a write aimed at a directory it deleted.
//
// The teeth: with the HEAD store the un-awaited write after `rm(root)` produces an `unhandledRejection` and the
// first assertion below fails (the listener keeps this process alive long enough to REPORT it instead of dying).

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')

const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'store.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const root = await mkdtemp(join(tmpdir(), 'vmu-store-teardown-'))
const store = m.createStore({ root, clock: () => '2026-10-09T00:00:00.000Z' })
await store.open()
await store.patch('work', () => ['ack-1'])
const before = store.stats()
ok(before.writes >= 1 && store.read('work')[0] === 'ack-1', 'a write before teardown lands normally (precondition)')

// ---- 1. the root disappears under the store -----------------------------------------------------
const unhandled = []
const onUnhandled = (e) => unhandled.push(String((e && e.code) || (e && e.message) || e))
process.on('unhandledRejection', onUnhandled)
try {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })

  // 1a. an AWAITED write is told the truth by name: the target is gone and nothing was acknowledged
  let refusal = null
  try { await store.patch('work', (v) => v.concat(['never'])) } catch (e) { refusal = e }
  ok(refusal !== null, 'a write after teardown refuses instead of pretending to succeed')
  ok(refusal !== null && refusal.code === 'VMU_STORE_FAILED' && refusal.reason === 'root-gone', 'the refusal is NAMED root-gone, not a raw ENOENT', refusal && (refusal.code + '/' + refusal.reason))
  ok(refusal !== null && /NOT acknowledged/.test(String(refusal.message)), 'the refusal says the write is NOT acknowledged', refusal && refusal.message)
  ok(refusal !== null && /teardown/i.test(String(refusal.hint)), 'the refusal points at the teardown as the cause', refusal && refusal.hint)

  // 1b. a FIRE-AND-FORGET write (the shape the meeting-invite marker uses) must not become an unhandled rejection
  const fireAndForget = store.patch('work', (v) => v.concat(['never-2']))
  ok(typeof fireAndForget === 'object' && typeof fireAndForget.then === 'function', 'patch() still returns a promise (the caller can await it)')
  await sleep(250)
  ok(unhandled.length === 0, 'an un-awaited write after teardown does NOT become an unhandled rejection', unhandled.join(','))
  await fireAndForget.then(() => null, (e) => e) // drain it: the rejection is real for whoever awaits
  const after = store.stats()
  ok(after.writeRootGone === 2, 'every root-gone write is COUNTED in stats.writeRootGone', after.writeRootGone)

  // 1c. the in-memory fold is not corrupted by the failed writes, and the file is honestly gone
  ok(JSON.stringify(store.read('work')) === '["ack-1"]', 'a write that could not land leaves the in-memory fold untouched')
  ok(after.writes === before.writes && after.patches === before.patches, 'a root-gone write is not counted as landed')
  ok(store.refresh().why === 'missing', 'refresh() reports the durable file as missing, not as fresh')
} finally {
  process.removeListener('unhandledRejection', onUnhandled)
}

// ---- 2. the same API on a HEALTHY store is unaffected by the failed one --------------------------
{
  const healthyRoot = await mkdtemp(join(tmpdir(), 'vmu-store-teardown-ok-'))
  try {
    const s = m.createStore({ root: healthyRoot, clock: () => '2026-10-09T00:00:00.000Z' })
    await s.open()
    const r = await s.patch('work', (v) => (v || []).concat(['landed']))
    ok(r.ok === true && r.changed === true, 'a healthy store still acknowledges a write after another root vanished')
    ok(s.stats().writeRootGone === 0, 'the healthy store counted no root-gone write')
  } finally {
    await rm(healthyRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
}

await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {})
console.log('=== VMU STORE TEARDOWN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
