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
//      check is proven able to fail, not passing by construction.

import { mkdtemp, rm, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

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

try {
  // ── 1. the defect itself: instance B must see instance A's write
  const a = await openStore()
  const b = await openStore()
  ok((a.read('ids') || []).length === 0 && (b.read('ids') || []).length === 0, 'both instances start empty')

  await a.patch('ids', (cur) => (cur || []).concat(['r-1']))
  ok((a.read('ids') || []).length === 1, 'A sees its own write')
  ok((b.read('ids') || []).length === 1,
    '★★ B (a DIFFERENT kernel instance over the same file) sees A\'s write — this is the run-13 defect',
    JSON.stringify(b.read('ids')))
  ok(b.stats().reloads >= 1, '★ the reload is counted, not invisible', JSON.stringify({ reloads: b.stats().reloads }))

  // ── 2. no lost update: B patches what A just wrote
  await b.patch('ids', (cur) => (cur || []).concat(['r-2']))
  const afterBoth = a.read('ids') || []
  ok(afterBoth.length === 2 && afterBoth.join(',') === 'r-1,r-2',
    '★★ B patched ON TOP of A\'s value (a stale fold would have written r-2 alone)',
    JSON.stringify(afterBoth))

  // ── 3. the lock file is released and concurrent writers both survive
  await Promise.all([
    a.patch('ids', (cur) => (cur || []).concat(['r-3'])),
    b.patch('ids', (cur) => (cur || []).concat(['r-4'])),
  ])
  const final = (a.read('ids') || []).slice().sort().join(',')
  ok(final === 'r-1,r-2,r-3,r-4', '★★ two concurrent writers both survive', final)
  const leftovers = (await readdir(join(root, 'vmu'))).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'))
  ok(leftovers.length === 0, '★ no lock or temp file is left behind', JSON.stringify(leftovers))

  // ── 4. refresh() says what it did; coherence:'off' reproduces the OLD behaviour on purpose
  const r1 = a.refresh()
  ok(r1.ok === true && r1.coherence === 'on', 'refresh() reports the coherence mode', JSON.stringify(r1))
  const stale = await openStore({ coherence: 'off' })
  await a.patch('ids', (cur) => (cur || []).concat(['r-5']))
  ok((stale.read('ids') || []).indexOf('r-5') === -1,
    '★★ coherence:"off" DOES go stale — the check is falsifiable, not vacuous',
    JSON.stringify(stale.read('ids')))
  ok(stale.refresh().reloaded === true, 'and an explicit refresh() fixes it', JSON.stringify(stale.refresh()))

  // ── 5. the file itself is a complete document at every step (the rename discipline still holds)
  const parsed = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  ok(Array.isArray(parsed.keys.ids) && parsed.keys.ids.length === 5, 'the durable file is complete JSON with all five ids',
    JSON.stringify(parsed.keys.ids))
  const st = await stat(join(root, 'vmu', 'state.json'))
  ok(st.size > 0, 'and it is non-empty on disk')
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('=== VMU STORE COHERENCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  for (const f of failures) console.log('  FAIL ' + f)
  process.exit(1)
}
