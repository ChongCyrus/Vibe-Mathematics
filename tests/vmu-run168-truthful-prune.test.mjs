// tests/vmu-run168-truthful-prune.test.mjs — RUN 168 (real machine, run 15 / FEEDBACK15 F15-1+F15-2+F15-4+F15-7):
// A RECEIPT MUST NOT BE TRUE ONLY UNTIL THE NEXT READ.
//
// THE DEFECT THIS PINS (measured on the real machine, run 15, build 248ffb59 — the run that first woke all four members):
//   · F15-1 `vibe_vmu_records {action:"prune", track:"paper", keep:170}` answered `liveBefore:200, prunedCount:30,
//     liveAfter:170`; the very next `status` said `paper:200` again, a member kernel said `paper:200` too, and the
//     SECOND prune reported `liveBefore:203`. The 30 rows came back between two reads: the fold is written asynchronously,
//     so a read right after a prune still carries the LIVE copy the snapshot captured BEFORE it, and `synchronize` adopted
//     that stale copy as a "restore". The agent reading the receipt concluded the repair had failed, then re-diagnosed a
//     phantom cross-kernel tombstone bug twice. THE TRASH MUST WIN TIES, and the guard must COUNT what it skipped.
//   · F15-2 `vibe_v5_paper {action:"start", target:"<Chinese title>"}` minted `paper-p16`; a member kernel then asked for
//     `paper-p16` three ways, was told `exists:false`, and the refusal hint said "start one first" — so it started
//     `paper-p16` AGAIN (a second state row, target "p16"). Afterwards the title and the id resolved two different
//     papers. THE ID IS THE NAME: a second paper may not take it, and "I cannot see it" is not "it does not exist".
//   · F15-4 `prune`'s receipt said `restoreMeans: "the kernel restores a trashed row before its purgeAt"` while the tool's
//     action enum had no `restore` — the hint named a verb the face did not have. RESTORE IS NOW A FACE ACTION.
//   · F15-7 `vibe_v5_set`/`vibe_v5_task_update` accepted only `why` and refused a call that passed `reason`.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
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
const BASE = 'D:/_tmp/r168/prune'
await mkdir(BASE, { recursive: true })

const boot = async (root, settings = null, clock = null) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const cfg = Object.assign({ root, packs: ['v5r'] }, settings || {})
  if (clock) cfg.clock = clock
  else cfg.clock = () => 1000
  const handle = entry.apply(ctx, cfg)
  await handle.ready()
  const specOf = (name) => specs.filter((s) => s.name === name)[0]
  const call = async (name, args) => {
    const spec = specOf(name)
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) { return { ok: false, code: e && e.code ? String(e.code) : 'THROW', message: String(e && e.message) } }
  }
  return { handle, kernel: handle.kernel, call }
}
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = await fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}
const avail = (k, track = 'paper') => k.records.list({ track, limit: 0 }).available
const putPaper = (k, title, body = 'body of ' + title) => k.records.put({ track: 'paper', kind: 'paper-part', title, body, settled: true, by: 'r-acad' })

// the durable fold is a JSON file keyed by the store's own name; find it under the root instead of guessing the layout
const findFold = async (root) => {
  const out = []
  const walk = async (dir, depth) => {
    if (depth > 6) return
    const ents = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p, depth + 1)
      else if (e.name === 'state.json' && /vmu/.test(p)) out.push(p)
    }
  }
  await walk(root, 0)
  return out[0] || null
}
const readFold = async (path) => JSON.parse(String(await readFile(path, 'utf8')))

// ── §0 the source says what this pins (a behavioural test alone could pass on a coincidence) ─────────────────────────
{
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  const paper = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/staleLiveRows: 0/.test(records) && /shared\.staleLiveRows \+= 1/.test(records),
    '§0 synchronize COUNTS the live fold rows it refuses to adopt over a local trash')
  ok(/const staleLive = restoredAtFold <= 0 \|\| \(trashedHere > 0 && restoredAtFold < trashedHere\)/.test(records),
    '§0 the guard: a live row with NO restore stamp, or one stamped strictly before this trash, is the OLD copy (an equal stamp is a same-tick restore and stays legitimate)')
  ok(/restoredAt: r\.restoredAt === undefined/.test(index),
    '§0 the durable snapshot carries `restoredAt`, which is what tells a real restore from a stale live row')
  ok(/enum: \['list', 'expand', 'append', 'status', 'prune', 'restore'\]/.test(host),
    '§0 the records face DECLARES `restore` (F15-4: the prune hint named a verb the enum did not have)')
  ok(/if \(action === 'restore'\) \{/.test(host) && /restoredCount: restored\.length/.test(host),
    '§0 restore is implemented, per id, with a per-id failure list')
  ok(/action:"restore".*id\(s\) above before purgeAt/s.test(host),
    '§0 prune\'s receipt now points at the action that exists')
  ok(/const rows = records\.list\(\{ track: TRACK, limit: 0 \}\)/.test(paper),
    '§0 the paper address reader sees EVERY live row of its track (a cap that outgrows the read limit hid the newest)')
  ok(/const idTwin = readState\(plateId\)/.test(paper),
    '§0 `start` refuses a second paper under an id the ledger already denotes')
  ok(/no paper "' \+ str\(target\) \+ '" exists in THIS instance records projection/.test(paper),
    '§0 the missing-paper refusal is scoped to the projection and names the cross-kernel exit instead of "start one"')
  ok(/has\(args\.reason\)/.test(tools) && /reason: \{ type: 'string', description: 'alias for why/.test(tools),
    '§0 `reason` is accepted as an alias for `why` on the same-family tools (F15-7)')
}

// ── §1 ★★ THE MEASURED DEFECT: a stale live snapshot must not undo a prune ───────────────────────────────────────────
{
  const root = await newRoot('stale')
  const A = await boot(root)
  const B = await boot(root)
  for (let i = 0; i < 5; i += 1) putPaper(A.kernel, 'row ' + i)
  const b0 = await until(() => (avail(B.kernel) === 5 ? 5 : null))
  ok(b0 === 5, '§1 fixture: B (booted first) reads all five rows A wrote', { b: avail(B.kernel) })
  const fold = await until(() => findFold(root))
  ok(typeof fold === 'string' && /state\.json$/.test(fold), '§1 fixture: the durable fold is on disk', fold)
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 2, why: 'run 168 §1' })
  ok(pr.ok === true && pr.liveBefore === 5 && pr.liveAfter === 2 && pr.prunedCount === 3,
    '§1 A prunes 5 → 2 and the receipt says so', { liveBefore: pr.liveBefore, liveAfter: pr.liveAfter, prunedCount: pr.prunedCount })
  ok(avail(A.kernel) === 2, '§1 fixture: A counts 2 live rows right after the prune', avail(A.kernel))
  // the race is only a race for a reader whose copy is still stale: B must first learn the trash (the fold is written
  // asynchronously, so B's very first read after the prune still legitimately answers 5). Learning it here is the
  // fixture, not the assertion — otherwise the stale snapshot below would be B's FIRST sight of the prune and would
  // arrive as new rows instead of as a file that disagrees with what B already holds.
  const bLearned = await until(() => (avail(B.kernel) === 2 ? 2 : null))
  ok(bLearned === 2, '§1 fixture: B learns the trash (2 live) before the stale snapshot is written', { b: avail(B.kernel) })
  // the asynchronous race the real machine measured: a read that lands right after the prune sees the snapshot written
  // BEFORE it. Reproduce it exactly: take the fold and turn its tombstones back into the LIVE rows they were.
  const wrote = await until(async () => {
    const doc = await readFold(fold)
    const rows = (doc.keys && Array.isArray(doc.keys.records)) ? doc.keys.records : []
    return rows.filter((r) => r && r.state === 'trashed').length === 3 ? rows : null
  })
  ok(Array.isArray(wrote) && wrote.length > 0, '§1 fixture: the fold carries the three tombstones (the trash is durable)', Array.isArray(wrote) ? wrote.length : null)
  // RUN 172: a kernel can still have an IN-FLIGHT snapshot write when this file is edited by hand, and a late write
  // would overwrite the stale copy with a correct one — the test then reads "nothing to skip" and blames the guard.
  // So: flush both kernels, write the stale copy, then poll (up to 2 s) until the skip is counted. Being deterministic
  // about write order is the fixture's job; the assertion is still "the skip is counted, and the rows are not revived".
  const staleFoldCopy = async () => {
    const cur = await readFold(fold)
    const rows = (cur.keys && Array.isArray(cur.keys.records)) ? cur.keys.records : []
    if (rows.filter((r) => r && r.state === 'trashed').length !== 3) return null
    cur.keys.records = rows.map((r) => {
      if (!r || r.state !== 'trashed') return r
      const copy = Object.assign({}, r)
      copy.state = 'live'
      delete copy.trashedAt
      delete copy.purgeAt
      return copy
    })
    return cur
  }
  let staleLive = -1
  let bAfter = 0
  for (let attempt = 0; attempt < 40 && staleLive < 3; attempt += 1) {
    if (typeof A.kernel.flushRecordsFold === 'function') await A.kernel.flushRecordsFold()
    if (typeof B.kernel.flushRecordsFold === 'function') await B.kernel.flushRecordsFold()
    const stale = await staleFoldCopy()
    if (!stale) { await new Promise((r) => setTimeout(r, 25)); continue }
    await writeFile(fold, JSON.stringify(stale), 'utf8')
    bAfter = B.kernel.records.list({ track: 'paper', limit: 0 }).available
    const shared = B.kernel.records.status().shared
    staleLive = shared ? Number(shared.staleLiveRows || 0) : -1
    if (staleLive < 3) await new Promise((r) => setTimeout(r, 25))
  }
  ok(bAfter === 2, '★★ §1 F15-1 FIXED: the stale live copy does NOT revive the pruned rows (B still counts 2)', { b: bAfter })
  ok(staleLive >= 3, '§1 and the skip is COUNTED, so a reader can tell "nothing was pruned" from "something refused to stay pruned"', { staleLiveRows: staleLive })
  const aAfter = A.kernel.records.list({ track: 'paper', limit: 0 }).available
  ok(aAfter === 2, '§1 A is not revived either — the receipt\'s liveAfter:2 still holds one read later', { a: aAfter })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §2 a REAL restore still crosses kernels (the guard must not close the legitimate direction) ──────────────────────
{
  const root = await newRoot('restore')
  let tick = 1000
  const clock = () => { tick += 10; return tick }     // a real restore is a LATER statement; give the clock room to say so
  const A = await boot(root, null, clock)
  const B = await boot(root, null, clock)
  putPaper(A.kernel, 'keep me')
  putPaper(A.kernel, 'trash me')
  await until(() => (avail(B.kernel) === 2 ? 2 : null))
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: 'run 168 §2' })
  const trashedId = pr.pruned && pr.pruned.length === 1 ? pr.pruned[0].id : null
  ok(pr.ok === true && typeof trashedId === 'string', '§2 fixture: one row went to the trash and the receipt names it', pr.pruned)
  const learned = await until(() => (avail(B.kernel) === 1 ? 1 : null))
  ok(learned === 1, '§2 B learns the trash (1 live)', { b: avail(B.kernel) })
  const res = await A.call('vibe_vmu_records', { action: 'restore', id: trashedId, why: 'run 168 §2' })
  ok(res.ok === true && res.restoredCount === 1 && res.restored[0].id === trashedId,
    '★★ §2 F15-4 FIXED: `restore` is a FACE action and it answers per id', { restored: res.restored, failed: res.failed })
  const restored = await until(() => (avail(B.kernel) === 2 ? 2 : null))
  ok(restored === 2, '§2 a REAL restore still reaches B (the stale guard did not close the legitimate direction)', { b: avail(B.kernel) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §3 the restore face names what it could not do, per id ───────────────────────────────────────────────────────────
{
  const root = await newRoot('face')
  const A = await boot(root)
  for (let i = 0; i < 3; i += 1) putPaper(A.kernel, 'face row ' + i)
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: 'run 168 §3' })
  ok(pr.ok === true && Array.isArray(pr.pruned) && pr.pruned.length === 2, '§3 fixture: two rows went to the trash', pr.pruned)
  const one = pr.pruned[0].id
  const bad = await A.call('vibe_vmu_records', { action: 'restore', id: one + ',rec-does-not-exist-168' })
  ok(bad.ok === false && bad.restoredCount === 1 && bad.failedCount === 1,
    '§3 a mixed restore answers per id (one live, one named failure) instead of a blanket ok', { restored: bad.restored, failed: bad.failed })
  ok(bad.failed[0] && typeof bad.failed[0].code === 'string' && bad.failed[0].id === 'rec-does-not-exist-168',
    '§3 the failure carries the id and a code', bad.failed[0])
  ok(typeof bad.hint === 'string' && /purged row is gone for good/.test(bad.hint), '§3 and a hint that says why an id cannot come back', bad.hint)
  const st = await A.call('vibe_vmu_records', { action: 'status', track: 'paper' })
  const byTrack = st.byTrack || (st.records && st.records.byTrack)
  ok(byTrack && byTrack.paper === 2, '§3 the restored row counts as live again (1 kept + 1 restored)', byTrack && byTrack.paper)
  const noId = await A.call('vibe_vmu_records', { action: 'restore' })
  ok(noId.ok === false && CODE(noId) === 'VMU_INVALID_ARGUMENT' && /needs `id`/.test(noId.message),
    '§3 restore without an id is refused by name, not silently ignored', { code: CODE(noId), message: noId.message })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §4 ★★ ONE ID, ONE PAPER (F15-2): a derived id that an existing paper already holds is a NAMED collision ──────────
{
  const root = await newRoot('paperid')
  const A = await boot(root)
  const first = await A.call('vibe_v5_paper', { action: 'start', target: '第十二次续跑 之 结题 现场 验证 稿', participants: ['r-acad', 'r-1'] })
  ok(first.ok === true && first.started && String(first.started.id) === 'paper-p1' && first.started.asciiSafe === false,
    '§4 fixture: a non-portable target mints the ASCII id paper-p1', first.started && { id: first.started.id, asciiSafe: first.started.asciiSafe })
  const twin = await A.call('vibe_v5_paper', { action: 'start', target: 'p1', participants: ['r-1'] })
  ok(twin.ok === false && CODE(twin) === 'VMU_PACK_V5R_CORE_PAPER_STATE',
    '★★ §4 F15-2 FIXED: starting target "p1" is REFUSED because its derived id already denotes the minted paper', { code: CODE(twin), message: twin.message })
  ok(typeof twin.message === 'string' && /already denotes an existing paper/.test(twin.message),
    '§4 the refusal names the collision in words', twin.message)
  const st1 = await A.call('vibe_v5_paper', { action: 'status', target: 'paper-p1' })
  ok(st1.ok === true && st1.exists === true && st1.paper && String(st1.paper.stateRecordId) === String(first.started.stateRecord),
    '§4 the id still resolves the ONE paper that exists (no second row was written)', { stateRecordId: st1.paper && st1.paper.stateRecordId })
  const all = A.kernel.records.list({ track: 'paper', limit: 0 }).items.filter((r) => /\|state$/.test(String(r.title || '')))
  ok(all.length === 1, '§4 exactly ONE paper state row exists (the refused start wrote nothing)', { rows: all.length, titles: all.map((r) => r.title) })
  const missing = await A.call('vibe_v5_paper', { action: 'advance', target: 'no-such-paper-168' })
  ok(missing.ok === false && /records projection/.test(String(missing.message)) && /instead of starting a second paper/.test(String(missing.hint || '')),
    '§4 a missing paper says its answer is projection-scoped and does NOT tell the caller to start a second one',
    { message: missing.message, hint: missing.hint })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §5 the same-family word: `reason` is accepted where `why` is taught ──────────────────────────────────────────────
{
  const root = await newRoot('alias')
  const A = await boot(root)
  const set = await A.call('vibe_v5_set', { key: 'vmu.records.headListAt', value: 5, reason: 'run 168 §5: the word the teaching uses' })
  ok(set.ok === true, '★★ §5 F15-7 FIXED: `vibe_v5_set` accepts `reason` as the reason', { ok: set.ok, code: CODE(set) })
  const both = await A.call('vibe_v5_set', { key: 'vmu.records.headListAt', value: 6, why: 'why wins', reason: 'reason loses' })
  ok(both.ok === true, '§5 both words together are accepted and `why` wins', { ok: both.ok })
  const bad = await A.call('vibe_v5_set', { key: 'vmu.not.a.declared.key', value: 1, reason: 'run 168 §5' })
  ok(bad.ok === false && CODE(bad) === 'VMU_INVALID_ARGUMENT', '§5 an undeclared key is still refused by name (the alias is not a bypass)', { code: CODE(bad) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

console.log('')
console.log(failed === 0 ? 'RUN168 OK ' + passed + ' passed / 0 failed' : 'RUN168 FAIL ' + passed + ' passed / ' + failed + ' failed')
if (failed > 0) { for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
