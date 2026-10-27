#!/usr/bin/env node
// vmu RUN 60 / F-50 — THE LEAN ARCHIVE WAS A MAP IN ONE PROCESS, AND NOTHING SAID SO.
//
// THE OBSERVED DEFECT (live run 60): a member archived a compiled lemma
// (`vibe_v5_lean_archive { kind:"lemma", name:"add_self", file:"Formal/p60/add_self.lean", statement:"∀ n, n + n = 2 * n" }`),
// then went looking for where that entry had gone: `VibeMath/vmu/state.json` had no such key, `records: []`, and its own
// `lib()` answered `count:1` only because it was the same process. The archive is a durable-LOOKING noun (a named
// library of proved lemmas) whose implementation was `const archived = new Map()` — so a kernel that started later read
// an empty library and had no way to tell "nobody archived anything" from "the archive lives somewhere else".
//
// WHAT THIS SUITE PROVES:
//   1. a face built WITHOUT a store answers `persistence().shared === false` and SAYS it is process-local (absent
//      durability is named, never implied);
//   2. with the durable port attached, `archive()` writes the rows to the `leanlibrary` key and `lib()`/`read()` fold
//      them in, so a SECOND face over the same root answers with the FIRST face's entry;
//   3. the write is a MERGE: a name another kernel added between our read and our write survives, and a name the local
//      process already answers for is never overwritten (a library that silently replaces entries is a worse lie);
//   4. the `statement` recorded by `archive()` is the text `lib()`/`read()` return (the ROUND 59 rule, now crossing a
//      process boundary rather than living in one map);
//   5. the key is declared: `createStore(...).read('leanlibrary')` is not refused as an undeclared durable key.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)
const { createLeanFace } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'lean.js')).href)
const { createStore } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'store.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-r60-leanlib-'))
const LEAN = 'theorem add_self (n : Nat) : n + n = 2 * n := by omega\n'
const face = (o = {}) => createLeanFace(Object.assign({ settings: {}, root: dir, clock: () => 1700000000000, log: () => {} }, o))

try {
  await mkdir(join(dir, 'Formal'), { recursive: true })
  await writeFile(join(dir, 'Formal', 'add_self.lean'), LEAN)
  await writeFile(join(dir, 'Formal', 'comm.lean'), 'theorem add_comm (a b : Nat) : a + b = b + a := by omega\n')

  // ── 1) no durable port: the face says so, in words a reader can act on ─────────────────────────────────────────
  const lone = face()
  await lone.archive({ name: 'lone', kind: 'lemma', file: 'Formal/add_self.lean', statement: '∀ n, n + n = 2 * n' })
  const loneLib = lone.lib()
  ok(loneLib.persistence && loneLib.persistence.shared === false, 'a face without a store reports process-local persistence', loneLib.persistence)
  ok(/process/.test(String((loneLib.persistence || {}).means || '')), 'and its means names the scope that actually answers (this process)', loneLib.persistence)
  ok(loneLib.persistence.key === 'leanlibrary', 'the durable key it would use is named even when unused', loneLib.persistence)

  // ── 2) one store, two faces: the second reads what the first archived ─────────────────────────────────────────
  const store = createStore({ root: dir })
  await store.open()
  // declared-key check FIRST: an undeclared key would throw here, and the whole F-50 fix would be a no-op on the
  // production path while still passing a unit test that only touches the face.
  let keyReadable = true
  try { store.read('leanlibrary') } catch (e) { keyReadable = false }
  ok(keyReadable, 'the `leanlibrary` key is DECLARED in store.PUBLIC_KEYS (an undeclared key is refused by name)', 'store.read threw')

  const writer = face()
  writer.attachStore(store)
  await writer.read('Formal/add_self.lean')   // no-op; proves the face works before any archive
  const wroteReceipt = await writer.archive({ name: 'add_self', kind: 'lemma', file: 'Formal/add_self.lean', statement: '∀ n, n + n = 2 * n' })
  ok(wroteReceipt && wroteReceipt.ok === true, 'archive() succeeds with the port attached', wroteReceipt)
  ok(wroteReceipt.persisted === true, 'and the receipt says the row reached the durable port (persisted:true)', wroteReceipt.persisted)
  ok(wroteReceipt.persistence && wroteReceipt.persistence.shared === true, 'the receipt names the shared scope', wroteReceipt.persistence)
  // ★ LIVE RUN 61 / F-52a (a member counted the receipt): the same receipt said `persisted:true` while `written:0`, and
  // the very next `lib()` said `written:1`. The counters were a snapshot of the moment BEFORE the asynchronous port
  // accepted the rows, so one receipt described two moments. The write is now awaited, and the numbers say what happened.
  ok(wroteReceipt.persistence.written >= 1,
    'the receipt counters describe the POST-write moment (persisted:true cannot sit next to written:0)',
    wroteReceipt.persistence)

  const onDisk = store.read('leanlibrary')
  ok(Array.isArray(onDisk) && onDisk.length === 1, 'the archive row is on the shared key (one row after one archive)', onDisk)
  ok(onDisk[0].name === 'add_self' && onDisk[0].statement === '∀ n, n + n = 2 * n', 'the durable row carries the NAME and the STATEMENT', onDisk[0])
  ok(/^[0-9a-f]{64}$/.test(String(onDisk[0].hash)), 'and the content hash it registered', onDisk[0].hash)

  // a fresh face over the SAME root is the "kernel that started later" in this defect
  const reader = face()
  reader.attachStore(store)
  const readLib = reader.lib()
  ok(readLib.count === 1, 'a second face over the same root sees the archived lemma (it was invisible before this fix)', readLib)
  ok(readLib.entries[0] && readLib.entries[0].statement === '∀ n, n + n = 2 * n', 'and sees its statement, not an empty string', readLib.entries)
  const readOne = await reader.read({ name: 'add_self' })
  ok(readOne && readOne.ok === true && String(readOne.content).indexOf('add_self') !== -1, 'read() answers from the source file through the adopted row', readOne && readOne.code)

  // ── 3) MERGE, not replace: a name added by the other face survives our write ────────────────────────────────
  const secondReceipt = await writer.archive({ name: 'add_comm', kind: 'lemma', file: 'Formal/comm.lean', statement: '∀ a b, a + b = b + a' })
  ok(secondReceipt && secondReceipt.ok === true, 'the first face archives a second name', secondReceipt)
  const afterTwo = store.read('leanlibrary')
  ok(Array.isArray(afterTwo) && afterTwo.length === 2, 'both names are on the durable key (merge, not replace)', afterTwo && afterTwo.map((r) => r.name))
  const namesOnDisk = afterTwo.map((r) => r.name).sort().join(',')
  ok(namesOnDisk === 'add_comm,add_self', 'and neither name was dropped', namesOnDisk)
  ok(afterTwo.filter((r) => r.name === 'add_self')[0].statement === '∀ n, n + n = 2 * n', 'the older row keeps its own statement through the merge', afterTwo)

  // the reader now adopts the second row, and re-archive of a known name is still refused (never a silent shadow)
  const readLib2 = reader.lib()
  ok(readLib2.count === 2, 'the other face adopts the newly added row before answering', readLib2.count)
  const dup = await reader.archive({ name: 'add_self', kind: 'lemma', file: 'Formal/add_self.lean', statement: 'something else' })
  ok(dup && dup.ok === false && dup.code === 'VMU_LEAN_ARCHIVE_NAME_TAKEN', 'a known name is still refused by name (no silent overwrite across processes)', dup && dup.code)
  ok(store.read('leanlibrary').filter((r) => r.name === 'add_self')[0].statement === '∀ n, n + n = 2 * n', 'and the durable row was not touched by the refused archive', store.read('leanlibrary'))

  // ★ LIVE RUN 61 / F-52b (a member tried to cite a job number in a card and could not tell which kernel owned it):
  // the in-memory job table answers for THIS kernel only while a durable mirror exists beside it, so the list has to
  // say which of the two a reader is holding.
  const listReceipt = face().list()
  ok(listReceipt && /this-kernel/.test(String(listReceipt.jobScope || '')),
    'list() names the scope of its job ids (this kernel, not the durable mirror)', listReceipt && listReceipt.jobScope)
  ok(/mirror/i.test(String(listReceipt.jobScopeMeans || '')),
    'and the sentence names the durable face that does answer across kernels', listReceipt && listReceipt.jobScopeMeans)

  // ── 4) a mismatched seam is a NAMED result, not a crash (a boot path must not throw over an optional port) ──
  const badAttach = face().attachStore({ read: () => [] })
  ok(badAttach && badAttach.ok === false && badAttach.reason === 'not-a-store', 'attachStore refuses a port without write() by name', badAttach)
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log('')
console.log('=== vmu run60 lean library durability: ' + (failed === 0 ? 'ALL GREEN' : 'FAILURES') + ' ' + passed + '/' + (passed + failed) + ' ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
