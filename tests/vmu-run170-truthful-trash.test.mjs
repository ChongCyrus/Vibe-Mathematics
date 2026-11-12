// tests/vmu-run170-truthful-trash.test.mjs — RUN 170 (real machine, run 16 / FEEDBACK16).
//
// THE DEFECTS THIS PINS (measured on the real machine, run 16, build fd8a18d3 — the first run that pruned a full track
// and then tried to reuse the released space):
//   · F16-5 (worst): after `prune`, a kernel that had NOT done the prune knew nothing about the trash — `hydrateRecords()`
//     skipped trashed rows and `synchronize()` discarded unknown tombstones — so `start` minted a NEW id for a name the
//     durable ledger already held, and the old paper became unreachable by its own title.
//   · F16-1/F16-3: `records status` computed the shared counters and then projected them away (`staleLiveRows` absent),
//     and its `records` block had no `trashed` at all, while the prune receipt promised "status counts them".
//   · F16-6/F16-7: a name collision refused without saying WHERE the existing paper is (`stateRecordId`), and
//     `status exists:false` answered with no hint at all (the agent then started a second paper under that name).
//   · F16-8: a `review` receipt was thin — no `recordId`, so the review could not be pointed at afterwards.
//   · F16-9: `final` died with `VMU_NO_SUCH_OBJECT unknown record: run16-odd-cubes.md#四步归纳` — the citation gate read a
//     FILE NAME as a record id and the records exception escaped instead of a citation verdict.
//   · F16-10: the TeX escaper left `^`/`~` in text mode, so a formula stopped xelatex (`! Missing $ inserted`).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
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
const BASE = __tmpRoot() + '/r170/trash'
const roots = []
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }
let tick = 1000
const boot = async (root, settings = null) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => tick }, settings || {}))
  await handle.ready()
  const specOf = (name) => specs.filter((s) => s.name === name)[0]
  const call = async (name, args) => {
    const spec = specOf(name)
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, kernel: handle.kernel, call }
}
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]
const hire = async (k) => { for (const [id, slot] of SEATS) await k.members.hire({ id, slot, institution: 'inst' }) }

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  ok(/function adoptTombstoneRow\(id, row\) \{/.test(records) && /shared\.tombstonesAdopted \+= 1/.test(records),
    '§0 a fold tombstone the local store has never seen is ADOPTED as a trashed row (not merely counted)')
  ok(/state: r\.status/.test(index) && /trashRows\(\{\}\)/.test(index),
    '§0 the fold snapshot names each row\'s state and appends the trash tombstones (the two halves the adoption needs)')
  ok(/trashedByTrack/.test(records) && /trashedByTrack/.test(host),
    '§0 `status.records` carries `trashed`/`trashedByTrack` through to the tool face (the prune receipt promised it)')
  ok(/staleLiveRows/.test(host) && /tombstonesAdopted/.test(host),
    '§0 the status `shared` projection keeps the counters the records face computes (§ RUN 166/168 — project them away and the receipt lies by omission)')
  ok(/Do NOT start a second paper under that name/.test(tools),
    '§0 `status exists:false` carries the one sentence that stops the duplicate `start` (run 16 started a second paper)')
  ok(/recordId: /.test(kit) && /fingerprint: /.test(kit),
    '§0 a `review` receipt carries `recordId`/`fingerprint` (a review you cannot point at is not archived)')
  ok(/const normalizeCitedId = \(raw\) => \{/.test(quality) && /try \{ row = recordOf\(records, c\.cardId\) \} catch \{ row = null \}/.test(quality),
    '§0 one citation normalizer + a citations loop that turns an unknown id into a VERDICT, not an exception')
  ok(/textasciicircum\{\}/.test(kit) && /textasciitilde\{\}/.test(kit),
    '§0 the TeX escaper covers the active characters `^` and `~` (a formula is paper content)')
}

// ── §1 a kernel that never pruned still knows what was pruned ───────────────────────────────────────────────────────
{
  const root = await newRoot('adopt')
  const A = await boot(root)
  for (let i = 0; i < 5; i++) {
    await A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'row ' + i, body: 'body number ' + i, by: 'r-acad' })
  }
  ok(A.kernel.records.list({ track: 'paper' }).available === 5, '§1 A sees its five rows before the prune', A.kernel.records.list({ track: 'paper' }).available)
  const pruned = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 2, why: 'make room' })
  ok(pruned.ok === true && pruned.prunedCount === 3,
    '§1 the prune moved exactly three rows to the trash', pruned.prunedCount)
  const foldSeen = await until(() => {
    const rows = A.kernel.records.status().shared
    return rows && rows.tombstonesSeen >= 0 ? true : null
  })
  ok(!!foldSeen, '§1 A\'s fold write settles')
  const B = await boot(root)
  const trashB = await until(() => { const n = B.kernel.records.trashRows({}).length; return n >= 3 ? n : null })
  ok(trashB >= 3, '§1 ★ B (which never pruned) KNOWS the three tombstones — the trash is a fact about the ledger, not about an instance', trashB)
  ok(B.kernel.records.list({ track: 'paper' }).available === 2,
    '§1 …and the adopted tombstones are NOT counted as live rows', B.kernel.records.list({ track: 'paper' }).available)
  const stB = await B.call('vibe_vmu_records', { action: 'status' })
  ok(stB.ok === true && stB.records && stB.records.trashed === 3,
    '§1 ★ `status.records.trashed` names what the prune promised to count', stB.records && stB.records.trashed)
  ok(stB.records && stB.records.trashedByTrack && stB.records.trashedByTrack.paper === 3,
    '§1 …and `trashedByTrack` says which track they left', stB.records && stB.records.trashedByTrack)
  ok(stB.shared && stB.shared.tombstonesAdopted >= 3,
    '§1 ★ `status.shared.tombstonesAdopted` is on the TOOL face (§ RUN 168: the counter existed and the projection dropped it)',
    stB.shared && stB.shared.tombstonesAdopted)
  const C = await boot(root)
  const trashC = await until(() => { const n = C.kernel.records.trashRows({}).length; return n >= 3 ? n : null })
  ok(trashC >= 3, '§1 a THIRD kernel adopts them too (the knowledge travels through the fold, not through one instance\'s memory)', trashC)
}

// ── §2 a name that sits in the trash is still taken ────────────────────────────────────────────────────────────────
{
  const root = await newRoot('name')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'old-paper', participants: ['r-acad', 'r-1'] })
  ok(started.ok === true, '§2 a paper starts normally', started.code)
  await A.call('vibe_v5_paper', { action: 'part', target: 'old-paper', member: 'r-acad', part: 'body', body: 'the body', evidence: [] })
  const prunedPaper = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 0, why: 'move it to the trash' })
  ok(prunedPaper.ok === true && prunedPaper.prunedCount >= 1, '§2 the paper rows move to the trash', prunedPaper.prunedCount)
  tick += 10
  const B = await boot(root)
  await hire(B.kernel)
  await until(() => (B.kernel.records.trashRows({}).length >= 1 ? true : null))
  const again = await B.call('vibe_v5_paper', { action: 'start', target: 'old-paper', participants: ['r-acad', 'r-1'] })
  ok(again.ok === false, '§2 ★ a name held by a TRASHED paper cannot be started again by a kernel that never pruned', again)
  ok(/TRASH|trash/.test(String(again.message || '') + String(again.hint || '')),
    '§2 …and the refusal names the trash as the reason', String(again.message || '').slice(0, 160))
  const liveAfter = B.kernel.records.list({ track: 'paper' }).available
  ok(liveAfter === 0, '§2 …and no second paper was minted (live paper rows stay zero)', liveAfter)
}

// ── §3 `status exists:false` is not silent ──────────────────────────────────────────────────────────────────────────
{
  const root = await newRoot('silent')
  const A = await boot(root)
  const miss = await A.call('vibe_v5_paper', { action: 'status', target: 'no-such-paper' })
  ok(miss.ok === true && miss.exists === false, '§3 a missing paper is still a successful READ', miss.exists)
  ok(typeof miss.hint === 'string' && miss.hint.length > 0, '§3 ★ …and it carries a hint instead of silence (run 16 read 457 bytes and started a duplicate)', miss.hint && miss.hint.slice(0, 80))
  ok(/Do NOT start a second paper under that name/.test(String(miss.hint || '')),
    '§3 the hint states the durable rule (a name is reserved for the record\'s whole life)')
}

// ── §4 a review receipt can be pointed at afterwards ───────────────────────────────────────────────────────────────
{
  const root = await newRoot('review')
  const A = await boot(root)
  await hire(A.kernel)
  await A.call('vibe_v5_paper', { action: 'start', target: 'p1', participants: ['r-acad', 'r-1'] })
  await A.call('vibe_v5_paper', { action: 'part', target: 'p1', member: 'r-acad', part: 'a', body: 'part one', evidence: [] })
  await A.call('vibe_v5_paper', { action: 'advance', target: 'p1' })
  const rv = await A.call('vibe_v5_paper', { action: 'review', target: 'p1', member: 'r-1', of: 'r-acad', deliverable: true, comments: 'reads well' })
  ok(rv.ok === true && rv.review && rv.review.recorded === 'r-1', '§4 the review is recorded', rv.review)
  ok(rv.review && typeof rv.review.recordId === 'string' && rv.review.recordId.length > 0,
    '§4 ★ the receipt names the row it just wrote', rv.review && rv.review.recordId)
  ok(rv.review && typeof rv.review.fingerprint === 'string',
    '§4 …and its fingerprint, so a later reader can tell the two apart', rv.review && rv.review.fingerprint)
}

// ── §5 a FILE NAME in a citation is a verdict, never a records exception ───────────────────────────────────────────
{
  const quality = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
  const root = await newRoot('cite')
  const A = await boot(root)
  await hire(A.kernel)
  const card = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'odd-cubes card', body: '二值：1' })
  await A.call('vibe_v5_paper', { action: 'start', target: 'p9', participants: ['r-acad', 'r-1'] })
  // ★★ RUN 177 (run 22, FEEDBACK22 D3): the WRITE gate now resolves prose pointers at `part`, so this body is refused
  // there. This section pins the QUALITY gate's behaviour on a row that already exists (run 16's exact call), so the row
  // is written directly the way `recordPart` shapes it — bypassing the write gate on purpose.
  const solution = '见 Members/r-1/Propos/run16-odd-cubes.md#四步归纳 的四步归纳。'
  const refusedAtWrite = await A.call('vibe_v5_paper', { action: 'part', target: 'p9', member: 'r-acad', part: 'odd cubes',
    solution, evidence: [String(card.id)] })
  ok(refusedAtWrite.ok === false && refusedAtWrite.code === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
    '§5 ★★ the fabricated prose pointer is refused where it is typed (RUN 177 D3)', refusedAtWrite && refusedAtWrite.code)
  const partRow = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'v5r-paper|p9|part|r-acad', by: 'r-acad',
    body: JSON.stringify({ title: 'odd cubes', solution, evidence: [String(card.id)] }) })
  ok(!!partRow && !!partRow.id, '§5 the part row is on disk (this section pins the GATE, not the write gate)', partRow && partRow.id)
  const stateHead = A.kernel.records.list({ track: 'paper', limit: 2000 }).items.filter((r) => r.kind === 'paper-state')[0]
  if (stateHead) {
    const full = A.kernel.records.get({ id: stateHead.id })
    const body = JSON.parse(String(full && full.record ? full.record.body : full.body))
    body.parts = { 'r-acad': { recordId: partRow.id, round: 1 } }
    body.status = 'awaiting-editor'
    A.kernel.records.put({ track: 'paper', kind: 'paper-state', title: stateHead.title, body: JSON.stringify(body), id: stateHead.id })
  }
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'p9' })
  const state = Object.assign({}, st.paper, { status: 'awaiting-editor' })
  const view = quality.createRecordsView({ kernel: A.kernel, codes: quality.QUALITY_CODES })
  // ★ the exact run-16 call: BEFORE RUN 170 this threw `VMU_NO_SUCH_OBJECT unknown record: run16-odd-cubes.md#四步归纳`.
  let verdict = null
  let thrown = null
  try { verdict = quality.checkQuality({ md: '', state, view, codes: quality.QUALITY_CODES }) } catch (e) { thrown = e }
  ok(thrown === null, '§5 ★★ the gate returns a VERDICT instead of throwing a records exception (run 16: `unknown record: run16-odd-cubes.md#四步归纳`)', thrown && { code: thrown.code, message: String(thrown.message || '').slice(0, 160) })
  ok(verdict && verdict.ok === false, '§5 ★ the gate REFUSES the paper (the cited record does not exist)', verdict && verdict.ok)
  ok(verdict && /不存在的 id/.test(String(verdict.message || '')),
    '§5 …and says the cited id does not exist', verdict && String(verdict.message || '').slice(0, 140))
  const miss = verdict && Array.isArray(verdict.missing) ? verdict.missing : []
  ok(miss.length > 0 && miss.some((m) => String(m.path || '').includes('#四步归纳')),
    '§5 …and `missing` carries the offending path WITH its anchor (the reader can see what was written)', miss.length > 0 ? miss[0] : miss)
  ok(miss.length > 0 && miss.every((m) => !String(m.id || '').includes('#')),
    '§5 ★ the id is NORMALIZED (a `.md#anchor` suffix is addressing, never part of an id)', miss.length > 0 ? miss[0].id : null)
}

// ── §6 the TeX escaper renders a formula instead of eating it ──────────────────────────────────────────────────────
{
  const root = await newRoot('tex')
  const A = await boot(root)
  await hire(A.kernel)
  await A.call('vibe_v5_paper', { action: 'start', target: 'p2', participants: ['r-acad', 'r-1'] })
  await A.call('vibe_v5_paper', {
    action: 'part', target: 'p2', member: 'r-acad', part: 'formula',
    body: '前缀和 Σ_{k=1}^{n} 与近似 a~b 都在正文里。', evidence: [] })
  const rendered = await A.call('vibe_v5_paper', { action: 'render', target: 'p2' })
  ok(rendered.ok === true, '§6 render succeeds', rendered.code)
  const rows = A.kernel.records.list({ track: 'paper' })
  const texRow = (rows.items || []).filter((r) => /\|tex$/.test(String(r.title || '')))[0]
  const tex = texRow ? String(A.kernel.records.get({ id: texRow.id }).record ? A.kernel.records.get({ id: texRow.id }).record.body : A.kernel.records.get({ id: texRow.id }).body || '') : ''
  ok(tex.length > 0, '§6 the rendered .tex is readable from the paper track', texRow && texRow.title)
  ok(tex.includes('\\textasciicircum{}'), '§6 ★ `^` reaches TeX as a text-mode command (run 16: `! Missing $ inserted`)', tex.slice(0, 120))
  ok(tex.includes('\\textasciitilde{}'), '§6 ★ `~` likewise (it is TeX\'s non-breaking space)')
  const bodyLine = tex.split('\n').filter((l) => l.includes('前缀和'))[0] || ''
  ok(bodyLine.length > 0 && !/[^\\]\^/.test(bodyLine),
    '§6 …so no bare `^` survives into the body line', bodyLine.slice(0, 120))
}

// ── §7 a count is as old as the last fold (RUN 171, FEEDBACK16 F16-4) ───────────────────────────────────────────────
{
  const root = await newRoot('fresh')
  const A = await boot(root)
  await hire(A.kernel)
  for (let i = 0; i < 4; i += 1) {
    await A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'row ' + i, body: 'body ' + i, settled: true, by: 'r-acad' })
  }
  const B = await boot(root)
  await hire(B.kernel)
  const seen = await B.call('vibe_vmu_records', { action: 'status' })
  ok(seen.ok === true, '§7 a second kernel can read records status', seen.code)
  ok(seen.records && seen.records.byTrack && seen.records.byTrack.paper === 4,
    '§7 …and its own read already folded the four rows in (status pulls first)', seen.records && seen.records.byTrack)
  ok(seen.asOf && typeof seen.asOf.foldPullAt === 'number' && typeof seen.asOf.viewAt === 'number',
    '§7 ★ the receipt stamps WHEN it looked (foldPullAt) and WHEN it counted (viewAt)', seen.asOf)
  ok(/pulls the durable fold before counting/.test(String(seen.asOfMeans || '')),
    '§7 …and says out loud that the read pulls first', String(seen.asOfMeans || '').slice(0, 120))

  const pruned = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1 })
  ok(pruned.ok === true && pruned.prunedCount === 3, '§7 the office prunes three rows', pruned)
  const foldSt = typeof A.kernel.recordsFoldStatus === 'function' ? A.kernel.recordsFoldStatus() : null
  ok(foldSt && /fold writes this instance has started but not yet had acknowledged/.test(String(foldSt.means || '')),
    '§7 ★ the prune names the fold-write lag it opens (F16-4: the lag existed but had no name)', foldSt)
  const flushed = typeof A.kernel.flushRecordsFold === 'function' ? await A.kernel.flushRecordsFold() : null
  ok(flushed && flushed.pending === 0, '§7 ★★ the join point settles (flushRecordsFold) before the other kernel reads', flushed)
  // NO sleep, NO unrelated read: the very next status on the OTHER kernel must see the prune (run 16: it printed 193
  // twenty seconds after the prune, then 151 later, with nothing naming the lag).
  const after = await B.call('vibe_vmu_records', { action: 'status' })
  ok(after.records && after.records.byTrack && after.records.byTrack.paper === 1,
    '§7 ★★ the OTHER kernel status is current on the VERY NEXT read (F16-4: no silent lag)', after.records && after.records.byTrack)
  const trashed = after.records ? after.records.trashed : null
  ok(trashed === 3, '§7 …and counts the three pruned rows under records.trashed', trashed)
  const adopted = after.shared ? after.shared.trashAdopted : null
  ok(adopted >= 3, '§7 …having adopted them as trash it never pruned', adopted)
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
console.log('\nTOTAL ' + passed + ' passed / ' + failed + ' failed')
if (failed > 0) { console.error('FAILURES: ' + failures.join(' | ')); process.exit(1) }
