// tests/vmu-run166-shared-trash.test.mjs — RUN 166 (real machine, run 14 / FEEDBACK14 F1+F2+F3+F4): THE LEDGER IS ONE
// FILE AND SEVERAL KERNELS, SO THE TRASH HAS TO TRAVEL WITH IT.
//
// THE DEFECT THIS PINS (measured on the real machine, run 14, build d18cde47 — the first run in which the office really
// drove four members as separate sessions, so each member turn had its OWN kernel instance over the SAME state.json):
//   · F1 the office pruned the paper track to 20 rows (`vibe_vmu_records {action:"prune"}`) and a MEMBER kernel still
//     answered `200/200` + `VMU_QUOTA_EXCEEDED` — the trash lived only in the instance that performed it, because the
//     durable snapshot was computed from the LIVE head list and therefore said nothing about trashed rows;
//   · F3+F4 the same hole made NAMES unsafe: the pruned rows stayed occupied in the member's world, so a freshly minted
//     `paper-p1` resolved there to an OLD paper the office had just trashed (and a minted `m33` resolved to an archived
//     meeting). "New" and "same name as an old one" could both be true of one name, with no receipt saying which object
//     answered;
//   · F2 the other proposed repair, `vibe_v5_set {key:"vmu.records.head.maxItems"}`, reported `applied:"immediate"` and
//     helped only the kernel that received the call: a runtime write is this-process state, and no receipt said so.
//
// THE FIX. The fold now carries the row's STATE: a trash writes a tombstone (`state:'trashed'` + `trashedAt`/`purgeAt`)
// and `records.synchronize` applies it to the local copy, so a trash made anywhere is learned everywhere on the next
// read (and a RESTORE travels back the same way). `remove`/`restore`/`purge`/`compact` are snapshotted like `put`, the
// boot hydrate skips tombstones (a tombstone is not a record to restore), and the settings writer states its scope
// (`crossKernelScope`, `capacityScopeMeans`) instead of letting `applied:"immediate"` imply "everywhere".
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

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
const J = (o) => JSON.stringify(o)
const CODE = (r) => (r && r.code) || null

const entry = await import(pathToFileURL(ENTRY).href)
const BASE = 'D:/_tmp/r166/trash'
import { mkdir } from 'node:fs/promises'
await mkdir(BASE, { recursive: true })

const boot = async (root, settings = null) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  // ★ the kernel reads settings from the CONFIG (flat `vmu.*` keys or a nested `vmu` tree) — a `settings:` wrapper is
  // not a config key, so passing one silently left every kernel at the declared default (head.maxItems 200).
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000 }, settings || {}))
  await handle.ready()
  const specOf = (name) => specs.filter((s) => s.name === name)[0]
  const call = async (name, args) => {
    const spec = specOf(name)
    if (!spec) throw new Error('no tool ' + name)
    return JSON.parse(await spec.execute(args, {}))
  }
  return { handle, kernel: handle.kernel, call }
}
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }
// The durable snapshot is written asynchronously (tmp + rename): wait for the FACT, do not guess a sleep.
const until = async (fn, ms = 4000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}
const avail = (k, track = 'paper') => k.records.list({ track, limit: 0 }).available
const putPaper = (k, title, body = 'body of ' + title) => k.records.put({ track: 'paper', kind: 'paper-part', title, body, settled: true, by: 'r-acad' })

// ── §0 the source says what this pins (a behavioural test alone would pass on a coincidence) ─────────────────────────
{
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/trashRows\s*\(/.test(records), '§0 records.js exposes trashRows (the tombstones the snapshot carries)')
  ok(/shared\.trashAdopted \+= 1/.test(records) && /shared\.tombstonesSeen \+= 1/.test(records),
    '§0 synchronize LEARNS a foreign trash (trashAdopted) and never adopts a tombstone as live (tombstonesSeen)')
  ok(/row && row\.state, row && row\.trashedAt, row && row\.purgeAt\]/.test(records),
    '§0 the content stamp includes the row state (else a trashed row looks unchanged forever)')
  ok(/records\.trashRows\(\{\}\)/.test(index), '§0 the durable snapshot appends the tombstones')
  ok(/if \(row\.state === 'trashed'\) continue/.test(index), '§0 boot hydrate skips tombstones (no resurrection at boot)')
  ok(/wrap\('remove', \{ snapshot: true \}\)/.test(index) && /wrap\('restore', \{ snapshot: true \}\)/.test(index),
    '§0 remove/restore are snapshotted (a trash that never reaches the fold is exactly the run-14 defect)')
  ok(/crossKernelScope: 'this-process'/.test(index) && /capacityScopeMeans:/.test(index),
    '§0 the settings writer states its cross-kernel scope and the capacity repair')
  ok(/capacityScopeMeans: receipt && typeof receipt\.capacityScopeMeans === 'string'/.test(tools),
    '§0 the pack tool CARRIES the kernel\'s answer instead of inventing a second one')
}

// ── §1 ★★ THE MEASURED DEFECT: a trash in kernel A must be visible in kernel B ───────────────────────────────────────
{
  const root = await newRoot('prune')
  const A = await boot(root)
  const B = await boot(root)                       // B boots FIRST and reads first: the latch is closed, as in run 14
  for (let i = 0; i < 5; i += 1) putPaper(A.kernel, 'row ' + i)
  const seen = await until(() => (avail(B.kernel) === 5 ? 5 : null))
  ok(seen === 5, '§1 fixture: B (booted first) reads all five rows A wrote', { b: avail(B.kernel) })
  ok(B.kernel.records.trashRows({}).length === 0, '§1 fixture: no tombstones yet (0 is measured, not assumed)')

  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 2, why: 'run 166 §1' })
  ok(pr.ok === true && pr.liveBefore === 5 && pr.liveAfter === 2 && pr.prunedCount === 3,
    '§1 A prunes 5 → 2 live rows and says so', { liveBefore: pr.liveBefore, liveAfter: pr.liveAfter, prunedCount: pr.prunedCount })
  ok(avail(A.kernel) === 2, '§1 A counts 2 live rows', avail(A.kernel))
  const learned = await until(() => (avail(B.kernel) === 2 ? 2 : null))
  ok(learned === 2, '★★ §1 F1 FIXED: B LEARNS the trash — its live count is 2, not the stale 5', { b: avail(B.kernel) })
  ok(B.kernel.records.trashRows({}).length === 3, '§1 B now holds the three tombstones (the fold is the meeting point)', B.kernel.records.trashRows({}).length)

  const st = await B.call('vibe_vmu_records', { action: 'status' })
  const byTrack = st.byTrack || (st.records && st.records.byTrack)
  ok(byTrack && byTrack.paper === 2, '§1 B\'s status board reports paper:2 (one answer, not two)', byTrack && byTrack.paper)

  // the names the trash freed are free in B too: a NEW row can take a slot the office had already vacated.
  // ★ `vibe_vmu_records {action:'append'}` writes the LIBRARY (`proposition`/`method`/`subproblem`), never the paper
  // track; the write the paper tools themselves use on that track is `records.put`. That is the write under test here.
  const ap = B.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'from B after prune', body: 'body written by B after the prune', settled: true, by: 'r-acad' })
  ok(ap.ok === true && /^rec-/.test(String(ap.id)), '§1 B can write into the freed slot (names follow the trash)', { ok: ap.ok, id: ap.id })
  const back = await until(() => (avail(A.kernel) === 3 ? 3 : null))
  ok(back === 3, '§1 and A sees B\'s new row (the round trip stays alive)', { a: avail(A.kernel) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §2 a RESTORE travels the same way (the reverse statement must not be the kernel-local one) ───────────────────────
{
  const root = await newRoot('restore')
  const A = await boot(root)
  const B = await boot(root)
  putPaper(A.kernel, 'keep me')
  putPaper(A.kernel, 'trash me')
  await until(() => (avail(B.kernel) === 2 ? 2 : null))
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: 'run 166 §2' })
  const trashedId = pr.pruned && pr.pruned.length === 1 ? pr.pruned[0].id : null
  ok(pr.ok === true && trashedId !== null, '§2 fixture: one row went to the trash, and the receipt names it', { pruned: pr.pruned })
  const learned = await until(() => (avail(B.kernel) === 1 ? 1 : null))
  ok(learned === 1, '§2 B sees one live row after A\'s prune', { b: avail(B.kernel) })
  A.kernel.records.restore({ id: trashedId, by: 'r-acad' })
  const restored = await until(() => (avail(B.kernel) === 2 ? 2 : null))
  ok(restored === 2, '★★ §2 a RESTORE in A reaches B (the trash state is symmetric, not a one-way local opinion)', { b: avail(B.kernel) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §3 ★★ THE QUOTA IS NOT THE INSTANCE'S OPINION: the durable trash frees the slot for EVERY kernel ────────────────
{
  const root = await newRoot('quota')
  const A = await boot(root, { 'vmu.records.head.maxItems': 2 })
  const B = await boot(root, { 'vmu.records.head.maxItems': 2 })
  putPaper(A.kernel, 'one')
  putPaper(A.kernel, 'two')
  await until(() => (avail(B.kernel) === 2 ? 2 : null))
  let refusedB = null
  try { B.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'third from B', body: 'the body B could not write while the track was full', settled: true, by: 'r-acad' }) } catch (e) { refusedB = e }
  ok(CODE(refusedB) === 'VMU_QUOTA_EXCEEDED', '§3 fixture: the track is full for B, by name', { code: CODE(refusedB), message: refusedB && refusedB.message })
  ok(typeof refusedB.hint === 'string' && /prune/.test(refusedB.hint) && /TWO reachable repairs/.test(refusedB.hint),
    '§3 the refusal still offers the two repairs (prune, or a bigger write-time cap)', refusedB.hint)
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: 'run 166 §3' })
  ok(pr.ok === true && pr.liveAfter === 1, '§3 A prunes to one row', { liveAfter: pr.liveAfter })
  const freed = await until(() => (avail(B.kernel) === 1 ? 1 : null))
  ok(freed === 1, '§3 B\'s count follows the durable trash (1, not its stale 2)', { b: avail(B.kernel) })
  const retried = B.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'third from B', body: 'the body B could not write while the track was full', settled: true, by: 'r-acad' })
  ok(retried.ok === true && /^rec-/.test(String(retried.id)),
    '★★ §3 F1 FIXED: the SAME append that was refused now succeeds — the repair A performed repairs B', { ok: retried.ok, id: retried.id, code: CODE(retried) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §4 ★★ F2: the settings write states WHO can see it, and names the repair that reaches the others ────────────────
{
  const root = await newRoot('scope')
  const B = await boot(root)
  const cap = await B.call('vibe_v5_set', { key: 'vmu.records.head.maxItems', value: 400, why: 'run 166 §4' })
  ok(cap.ok === true, '§4 fixture: the capacity key is writable at runtime', { ok: cap.ok, code: CODE(cap) })
  const applied = cap.applied || {}
  ok(applied.crossKernelScope === 'this-process', '★★ §4 the receipt says the write is this-process, not workspace-wide', applied.crossKernelScope)
  ok(typeof applied.crossKernelMeans === 'string' && /do NOT see this write/.test(applied.crossKernelMeans),
    '§4 and says in words that other kernel instances do not see it', applied.crossKernelMeans)
  ok(typeof applied.capacityScopeMeans === 'string' && /prune/.test(applied.capacityScopeMeans) && /CAPACITY key/.test(applied.capacityScopeMeans),
    '§4 a CAPACITY key names the repair every instance sees (a prune)', applied.capacityScopeMeans)
  const other = await B.call('vibe_v5_set', { key: 'vmu.records.headListAt', value: 5, why: 'run 166 §4 non-capacity' })
  const otherApplied = other.applied || {}
  ok(other.ok === true && otherApplied.capacityScopeMeans === null,
    '§4 a non-capacity key carries no capacity sentence (the field is not decoration)', { ok: other.ok, cap: otherApplied.capacityScopeMeans })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §5 a FRESH kernel neither resurrects a tombstone nor invents a live row for it ──────────────────────────────────
{
  const root = await newRoot('fresh')
  const A = await boot(root)
  // `keep:1` keeps the NEWEST row and trashes the older one, so the two titles say which is which.
  putPaper(A.kernel, 'older row')
  putPaper(A.kernel, 'newest row')
  await until(() => (avail(A.kernel) === 2 ? 2 : null))
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: 'run 166 §5' })
  ok(pr.ok === true && pr.liveAfter === 1, '§5 fixture: one live row left', { liveAfter: pr.liveAfter })
  const C = await boot(root)                        // a kernel that never saw the pre-trash world
  ok(avail(C.kernel) === 1, '★★ §5 a FRESH kernel reads one live row (the tombstone did not become a record at boot)', { c: avail(C.kernel) })
  ok(C.kernel.records.trashRows({}).length === 0, '§5 and carries no local trash it never performed (0 tombstones locally)', C.kernel.records.trashRows({}).length)
  const row = C.kernel.records.list({ track: 'paper', limit: 0 }).items.filter((r) => r.title === 'newest row')[0]
  ok(row && row.title === 'newest row', '§5 and the surviving row is the newest one (keep:1 keeps the tail)', row && row.title)
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ' ' + passed + ' passed / ' + failed + ' failed')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
