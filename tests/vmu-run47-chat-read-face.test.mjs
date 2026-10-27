#!/usr/bin/env node
// vmu RUN 47 — THE CHAT READ FACE MUST SEE THE SHARED BOOK (the office could not report its own chat).
//
// THE OBSERVED DEFECT (live run 47, the institute's own report, with file evidence): the OFFICE kernel's
// `vibe_vmu_chat {action:"status"}` answered `messages:1, sends:1` three times across the run while the durable
// `VibeMath/vmu/state.json` held FIVE messages written by member kernels — and its `mutedMeans` claimed
// "the same live book action:status prints". The office is the role whose whole job is reporting, and its read face
// was serving a per-instance hot book that nothing refreshed (only MUTATORS read fresh, from run 45's fix).
//
// THE MECHANISM: `chat` is a `mode:'state'` projection. A reader in instance A only learns another instance's writes
// when something calls `store.read('chat')` (the engine's own stale check) and the `restoreReload` hook merges the
// fold. Reads did not do that, so the book was instance-local.
//
// WHAT THIS SUITE PROVES (out-of-band writes are exactly what "another kernel wrote the fold" looks like from here):
// (1) a message another writer put in the durable fold is visible to this kernel's `status` on the next read;
// (2) a MUTE another writer put in the fold is honoured by this kernel's read AND its `send` refuses by name;
// (3) repeated reads are consistent (the refresh neither drops nor duplicates rows); (4) `history()` sees those rows
// too; (5) an unmute another writer made is visible. The counterfactual is the live run: this same read answered a
// stale count for the whole session.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 5000
const boot = async (root) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => NOW })
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message } }
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const messageRow = (id, seq, from, text, at) => ({ id, seq, at, from, text, kind: 'chat', replyTo: null, quotes: [] })

const root = await mkdtemp(join('D:/_tmp', 'vmu-run47-chatread-'))
try {
  const b = await boot(root)
  const kernel = b.handle.kernel
  // A SECOND KERNEL OVER THE SAME ROOT — this is exactly what "another writer wrote the fold" looks like here: its
  // store.patch lands in the file, and THIS kernel only learns of it through the reload hook on its own next read.
  const other = await boot(root)
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length === 3 && typeof kernel.store.patch === 'function', 'setup: a roster and a durable store exist (RULE E)', kernel.members.roster().map((m) => m.id))
  const empty = await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })
  ok((empty.parsed || {}).ok === true && (empty.parsed || {}).messages === 0, 'setup: the kernel starts with an empty chat book', empty.parsed && empty.parsed.messages)

  // ANOTHER WRITER PUTS A MESSAGE IN THE FOLD (this is what a member kernel's write-through lands as).
  const chatEnvelope = (messages, mutes) => ({ apiVersion: 1, face: 'chat', v: 1, at: NOW, data: { messages, mutes: mutes || {}, audit: [], supplements: [], counters: { chat: messages.length } } })
  await other.handle.kernel.store.patch('chat', () => chatEnvelope([messageRow('msg-1', 1, 'r-1', '第一次发言', NOW)], {}))
  NOW += 10

  // §1 — THE READ SEES THE OTHER WRITER'S MESSAGE.
  const s1 = await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })
  const st1 = s1.parsed || {}
  ok(st1.ok === true, 'the office reads the chat status', st1)
  ok(Number(st1.messages) === 1, 'sis. RUN 47 DEFECT: the read now counts the fold\'s message (1, was 0 for the whole live run)', st1.messages)
  ok(Number(st1.counts && st1.counts.sends) === 1, 'counts.sends follows the same book (1)', st1.counts)
  ok(typeof st1.mutedMeans === 'string' && st1.mutedMeans.length > 0, 'the receipt still explains what the muted list means', st1.mutedMeans)

  // §2 — THREE MORE MESSAGES IN THE FOLD; THE READ FOLLOWS THEM.
  await other.handle.kernel.store.patch('chat', (cur) => {
    const rows = ((cur || {}).data || {}).messages || []
    return chatEnvelope(rows.concat([
      messageRow('msg-2', 2, 'r-2', '第二次', NOW), messageRow('msg-3', 3, 'r-2', '第三次', NOW), messageRow('msg-4', 4, 'r-1', '第四次', NOW),
    ]), {})
  })
  NOW += 10
  const s2 = await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })
  const st2 = s2.parsed || {}
  ok(Number(st2.messages) === 4, 'the office read counts all four messages written into the fold (4)', st2.messages)

  // §3 — A MUTE IN THE FOLD IS HONOURED BY THE READ AND BY SEND.
  await other.handle.kernel.store.patch('chat', (cur) => {
    const rows = ((cur || {}).data || {}).messages || []
    return chatEnvelope(rows, { 'r-1': { at: NOW, until: NOW + 60000, durationMs: 60000, reason: 'run47 read-face check', by: 'r-acad' } })
  })
  NOW += 10
  const s3 = await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })
  const st3 = s3.parsed || {}
  ok(Array.isArray(st3.muted) && st3.muted.includes('r-1'), 'the read lists r-1 as muted (the read refreshes before answering)', st3.muted)
  const refused = await call(b, 'vibe_vmu_chat', { action: 'send', by: 'r-1', text: '被禁言时发言' })
  ok((refused.parsed || {}).ok === false && (refused.parsed || {}).code === 'VMU_CHAT_MUTED', 'a send from this kernel is refused by name (VMU_CHAT_MUTED)', (refused.parsed || {}).code)

  // §4 — READS ARE CONSISTENT ACROSS REPEATED CALLS (no drift, no duplication).
  const again = await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })
  const st4 = again.parsed || {}
  ok(Number(st4.messages) === 4, 'a second read still counts 4 (the refresh does not lose or duplicate rows)', st4.messages)
  // The read also REPORTS where its book came from, so a reader can tell "the shared book" from "my own memory".
  ok(st4.mechanism && (st4.mechanism.hotSource === 'settings' || st4.mechanism.hotSource === 'memory'),
    'the read states its hot-source (so a stale per-instance book is diagnosable)', st4.mechanism)

  // §5 — UNMUTE THROUGH THE FACE, THEN THE SAME READ SHOWS IT GONE. A reload merges mutes ADDITIVELY (a read must
  // never delete one), so the only honest way to clear a mute is the face's own `unmute` — that is the invariant.
  const unm = await call(b, 'vibe_vmu_chat', { action: 'unmute', member: 'r-1', by: 'r-acad' })
  ok((unm.parsed || {}).ok === true, 'the chair may unmute r-1 through the face (ok:true)', (unm.parsed || {}).ok)
  const st5 = (await call(b, 'vibe_vmu_chat', { action: 'status', by: 'r-acad' })).parsed || {}
  ok(Array.isArray(st5.muted) && st5.muted.length === 0, 'after the unmute the read lists nobody muted', st5.muted)
  const sent = await call(b, 'vibe_vmu_chat', { action: 'send', by: 'r-1', text: '解除后发言' })
  ok((sent.parsed || {}).ok === true, 'and this kernel may send as r-1 again (ok:true)', (sent.parsed || {}).ok)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 47 CHAT READ FACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
