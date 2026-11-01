// ★ RUN 181 — the run's twenty-seventh reading (run 26 / FEEDBACK25): a paper that went back in time, and four receipts
// that contradicted themselves.
//   F25-5 THE PAPER WENT BACK IN TIME. `paper-p30` had every round-2 `part`/`review` call acknowledged (`ok:true`,
//        `round:2`), yet its newest state row carried a round-1 body: `parts` named the round-1 rows and the next
//        `advance` answered `from:"writing", round:1, reviewOf:{}`. Two live state rows existed for one title, and the
//        reader took the first in list order. One row IS the paper: the reader now takes the row FURTHEST ALONG
//        (highest round, then newest revision), and a snapshot that lost its `stateRecordId` ADOPTS the existing row
//        instead of minting a second one — a snapshot older than the paper is refused BY NAME, never written.
//   F25-1 A WINDOW THAT WAS STILL IN FLIGHT. `reopen-closure` answered `window:6` and the very next vote was counted
//        against the OLD window: `recordsStore.patch` had been started but not awaited, so the next read still saw the
//        previous window (default 1). The reopen now waits for its own write before the receipt exists.
//   F25-2 `truncated:true` beside `rowsOmitted:0` in one receipt: the countable rest is now stated for EVERY read.
//   F25-3 `requiredLineFull` was null everywhere — the gate demanded a sentence that stopped mid-formula and could not
//        say what it was. The claim is read back from the CARD when the verified row carries no section.
//   F25-4 `wrong-track` named two tracks and no way forward. The row EXISTS and the refusal now says where.
//   F25-10 `pinned` was a list with no count: `pinnedCount` says how many rows the prune was not allowed to move.
// §0 is the source-side reading; everything after it is answered by this entry.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PAPER = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const HANDLERS = join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')
const HOST = join(REPO, 'vibe-math-vmu', 'host.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const paperSource = await readFile(PAPER, 'utf8')
const handlersSource = await readFile(HANDLERS, 'utf8')
const hostSource = await readFile(HOST, 'utf8')
const qualitySource = await readFile(QUALITY, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r181-')); roots.push(d); return d }

const boot = async (root, settings = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}

const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const bodyOf = (receipt) => (receipt && receipt.parsed ? receipt.parsed : null)

try {
  // ── §0 THE SOURCE-SIDE READING ──
  {
    console.log('§0 each repair is a named shape in the source (a pass cannot come from a coincidence)')
    ok(paperSource.includes('const stateRowOfTitle = (title) => {') && /const better = !bestKey/.test(paperSource),
      '§0a a title with several state rows is read FURTHEST ALONG, not first-in-list')
    ok(paperSource.includes('const refuseStaleRound = (target, mine, theirs) => {') &&
      paperSource.includes('state.stateRecordId = existing.id'),
      '§0b a snapshot that lost its id ADOPTS the existing row instead of minting a second one')
    ok(!/records\.put\(\{\s*\n?\s*id: state\.stateRecordId \|\| null/.test(paperSource) === false,
      '§0c the state row is still written in place (the adoption feeds the same put)')
    ok(handlersSource.includes('Math.max(0, cards.length - returned.length)'),
      '§0d the countable rest is stated for a paged read too, not only for limit:0')
    ok(hostSource.includes('pinnedCount: pinned.length'),
      '§0e a prune says how many rows it could not move')
    ok(qualitySource.includes('const statementOfCard = (recordsFace, cardId) =>') &&
      qualitySource.includes('statementOfCard(records, item.cardId)'),
      '§0f the full claim is read back from the CARD when the verified row carries no 陈述 section')
    ok(qualitySource.includes('reason: \'wrong-track\',') && qualitySource.includes('existsAt: { id: cardId, track: actualTrack || null }'),
      '§0g a wrong-track refusal says where the row really lives')
  }

  // ── §1 F25-5: the reader takes the state row that is furthest along ──
  {
    console.log('§1 one paper, two state rows: the reader follows the paper, not the list order (run 26 F25-5)')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-2', slot: 'member', institution: 'VibeMath' })
    const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r181', participants: ['r-1', 'r-2'], title: 'state row selection' })
    ok(started.parsed && started.parsed.ok === true, '§1a the paper starts', started.parsed || started)
    // the LOST UPDATE of run 26: a second state row under the same title, whose body is OLDER than the paper
    const rows = b.K.records.list({ track: 'paper', limit: 0 }).items || []
    const stateRow = rows.filter((r) => String(r.kind) === 'paper-state')[0]
    const fullState = b.K.records.get({ id: stateRow.id })
    const stateBody = JSON.parse(String((fullState && fullState.record ? fullState.record.body : fullState.body) || '{}'))
    const stale = JSON.parse(JSON.stringify(stateBody))
    stale.round = Math.max(1, Number(stale.round) || 1) - 1
    stale.status = 'writing'
    stale.stage = 'writing'
    stale.parts = {}
    stale.reviews = {}
    const minted = b.K.records.put({ track: 'paper', kind: 'paper-state', title: String(stateRow.title), body: JSON.stringify(stale), by: 'vibe_v5_paper' })
    ok(minted && minted.id && minted.id !== stateRow.id, '§1b a second state row exists under the SAME title (the shape of the run-26 defect)', minted)
    // make the paper itself further along, and give the second row a NEWER timestamp (list order would prefer it)
    const moved = JSON.parse(JSON.stringify(stateBody))
    moved.round = 2
    moved.status = 'reviewing'
    moved.stage = 'reviewing'
    b.K.records.put({ id: stateRow.id, track: 'paper', kind: 'paper-state', title: String(stateRow.title), body: JSON.stringify(moved), by: 'vibe_v5_paper' })
    const status = await call(b, 'vibe_v5_paper', { action: 'status', target: 'r181' })
    const paper = status.parsed && status.parsed.paper
    ok(paper && Number(paper.round) === 2, '§1c `status` reads the row that is FURTHEST ALONG (round 2), not the oldest/stalest one', paper && { round: paper.round, status: paper.status })
    ok(paper && String(paper.status) === 'reviewing', '§1d the stage travels with the round the reader chose', paper && paper.status)
  }

  // ── §2 F25-2: a paged read states the countable rest ──
  {
    console.log('§2 `truncated:true` and `rowsOmitted:0` cannot both be true (run 26 F25-2)')
    const root = await mkRoot()
    const b = await boot(root)
    for (const [i, stmt] of [[1, 'claim one'], [2, 'claim two'], [3, 'claim three']]) {
      const appended = b.K.records.put({ track: 'propositions', kind: 'proposition', title: 'run181 claim ' + String(i),
        body: '- statement\uFF1A' + stmt + ' (run181)\n- value\uFF1A0.6\n- motive\uFF1Areading\n- p\uFF1A0.6', settled: false, by: 'r-acad' })
      ok(appended && appended.id !== undefined, '§2' + String.fromCharCode(96 + i) + ' the library holds claim ' + String(i), appended)
    }
    const paged = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 2 })
    const p = bodyOf(paged)
    ok(p && p.ok === true, '§2d the paged read answers', p || paged)
    ok(p && Number(p.total) >= 3 && Number(p.returned) === 2,
      '§2e total is the MATCHED count and returned is the page', p && { total: p.total, returned: p.returned })
    ok(p && p.truncated === true, '§2f the page was cut', p && p.truncated)
    ok(p && Number(p.rowsOmitted) === Number(p.total) - Number(p.returned),
      '§2g the rows the page left behind are COUNTED (not 0 beside truncated:true)', p && { rowsOmitted: p.rowsOmitted, total: p.total, returned: p.returned })
    const counted = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 0 })
    const c = bodyOf(counted)
    ok(c && c.countOnly === true && Number(c.rowsOmitted) === Number(c.total),
      '§2h a limit:0 read still says every matched row is the countable rest', c && { countOnly: c.countOnly, rowsOmitted: c.rowsOmitted, total: c.total })
  }

  // ── §3 F25-10: a prune says how many rows it could not move ──
  {
    console.log('§3 a prune that leaves rows behind says how many (run 26 F25-10)')
    const root = await mkRoot()
    const b = await boot(root)
    b.K.records.put({ track: 'progress', kind: 'progress', title: 'progress row pinned', body: 'pinned row', settled: true, by: 'r-acad', permanent: true })
    for (let i = 1; i <= 4; i += 1) {
      b.K.records.put({ track: 'progress', kind: 'progress', title: 'progress row ' + String(i), body: 'row ' + String(i), settled: true, by: 'r-acad' })
    }
    const pruned = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'progress', keep: 1, why: 'run 181 reading', by: 'r-acad' })
    const p = bodyOf(pruned)
    ok(p && p.ok === true, '§3a the prune answers', p || pruned)
    ok(p && Array.isArray(p.pinned) && p.pinned.length === 1,
      '§3b the permanent row is named as pinned', p && p.pinned)
    ok(p && Number(p.pinnedCount) === 1,
      '§3c the count of rows the prune could NOT move is stated', p && { pinnedCount: p.pinnedCount, pinned: p.pinned })
    ok(p && typeof p.pinnedMeans === 'string' && p.pinnedMeans.length > 0,
      '§3d and the receipt explains what a pinned row is', p && p.pinnedMeans)
  }
} finally {
  for (const dir of roots) { try { await rm(dir, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('TOTAL ' + String(passed + failed) + ' PASS ' + String(passed) + ' FAIL ' + String(failed))
if (failed > 0) process.exitCode = 1
