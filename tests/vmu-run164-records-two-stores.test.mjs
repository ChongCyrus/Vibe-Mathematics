// ★ RUN 164 — the run's eighth reading (FEEDBACK12 items 1/2/9): the records face read TWO stores but answered
// as if it had read one.
//   ① `action:"status"` never printed the per-track cap it really enforces (`caps` was absent), so "written at
//      startup" and "read at write time" could not be told apart from the receipt;
//   ② `action:"list"` AWAITED the pack library head list FIRST and, whenever it answered non-empty, returned those
//      rows and nothing else — so `track:"paper"`, `track:"obstacles"` and no track at all answered the SAME 7
//      ruling heads, and the ids it printed were refused by `action:"expand"` (they live in the library, not in
//      the records projection);
//   ③ a fresh kernel's FIRST `status` could print total 0 over a store holding hundreds of rows (not folded yet).
// Every case below is asserted against what this entry REALLY answers; §0 is the source-side reading.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const HOST = join(REPO, 'vibe-math-vmu', 'host.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const { readFile } = await import('node:fs/promises')
const source = await readFile(HOST, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r164-')); roots.push(d); return d }

const boot = async (root, settings = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, settings })
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

try {
  // ── §0 source reading: the two-store answer is written where a reader looks for it
  {
    console.log('§0 the face says its two sources and its cap out loud (source reading)')
    ok(/rowsFrom: \{ records: recRows\.length, library: libKept\.length \}/.test(source),
      '§0a list reports rowsFrom {records, library} (so a merged answer is never mistaken for one store)')
    ok(/trackFilterMeans/.test(source) && /library head rows carry no track/.test(source),
      '§0b list NAMES the track filter and says library heads carry no track (a filter is applied or explained, never silently skipped)')
    ok(/expandedFrom: 'library'/.test(source),
      '§0c expand falls back to the pack library (an id this face printed is readable by this face)')
    ok(/caps: st\.caps && typeof st\.caps === 'object'/.test(source) && /foldedYet: shared\.pulls > 0/.test(source),
      '§0d status prints caps and foldedYet')
  }

  // ── §1 a library holding cards AND a records projection both non-empty: filters apply, ids read back
  {
    console.log('§1 both stores non-empty — track filters the records side and expand reads both')
    const root = await mkRoot()
    const b = await boot(root)
    const lib = await b.K.library.append({ kind: 'proposition', statement: 'S 一', proof: 'P 一', title: '库卡一', member: 'r-1' })
    ok(lib && lib.ok === true, '§1 setup: the pack library holds one card', lib && { id: lib.id })
    await b.K.records.put({ track: 'paper', kind: 'paper-part', title: '纸稿一节', body: '- 正文：paper 行' })
    await b.K.records.put({ track: 'obstacles', kind: 'lesson', title: '一个障碍', body: '- 正文：obstacle 行' })
    await b.K.records.put({ track: 'progress', kind: 'progress', title: '一条进展', body: '- 正文：progress 行' })

    const all = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0 })
    const allRows = (all.parsed && all.parsed.records) || []
    ok(allRows.length >= 3, '§1a no track: both stores are read (records rows + library heads)', all.parsed && all.parsed.rowsFrom)
    ok(all.parsed && all.parsed.rowsFrom && all.parsed.rowsFrom.records >= 3 && all.parsed.rowsFrom.library >= 1,
      '§1b the receipt counts each source separately', all.parsed && all.parsed.rowsFrom)

    const paperOnly = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0, track: 'paper' })
    const paperRows = (paperOnly.parsed && paperOnly.parsed.records) || []
    ok(paperOnly.parsed && paperOnly.parsed.trackFilter === 'paper' && typeof paperOnly.parsed.trackFilterMeans === 'string',
      '§1c track:"paper" is NAMED in the receipt (never a silent no-op)', paperOnly.parsed && { trackFilter: paperOnly.parsed.trackFilter })
    ok(paperRows.length >= 1 && paperRows.every((r) => r && r.track === 'paper'),
      '§1d every row really belongs to the requested track (the filter is honoured)', paperRows.map((r) => r && r.track))
    ok(paperRows.every((r) => r && typeof r.id === 'string' && r.id !== lib.id),
      '§1e the library head (which carries no track) is EXCLUDED from a track answer, not returned as if it matched',
      paperRows.map((r) => r && r.id))

    const obsOnly = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0, track: 'obstacles' })
    const obsRows = (obsOnly.parsed && obsOnly.parsed.records) || []
    ok(obsRows.length === 1 && obsRows[0] && obsRows[0].track === 'obstacles',
      '§1f a second track answers its own row (two different tracks cannot answer the same list)', obsRows.map((r) => r && r.track))

    // ★ the hard half of FEEDBACK12 item 2: an id this face PRINTED must be READABLE by this face
    const mixed = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0 })
    const printed = (mixed.parsed && mixed.parsed.records) || []
    let readable = 0
    let firstRefusal = null
    for (const row of printed) {
      const got = await call(b, 'vibe_vmu_records', { action: 'expand', id: row.id })
      if (got.parsed || got.thrown === undefined) { if (!got.thrown) readable++ } else if (!firstRefusal) firstRefusal = got
      if (got.thrown && !firstRefusal) firstRefusal = got
    }
    ok(printed.length >= 4 && readable === printed.length,
      '§1g EVERY id the list printed is expandable by the same face (no printed-but-unreadable id)',
      { printed: printed.length, readable, firstRefusal })
    const viaLibrary = await call(b, 'vibe_vmu_records', { action: 'expand', id: lib.id })
    ok(!viaLibrary.thrown && viaLibrary.parsed && viaLibrary.parsed.expandedFrom === 'library',
      '§1h the library card expands through the fallback and the receipt says which store answered',
      viaLibrary.thrown ? viaLibrary : viaLibrary.parsed && viaLibrary.parsed.expandedFrom)
    const missing = await call(b, 'vibe_vmu_records', { action: 'expand', id: 'no-such-record-xyz' })
    const missingBody = missing.thrown === true ? missing : missing.parsed
    ok(!!missingBody && String(missingBody.code) === 'VMU_NO_SUCH_OBJECT' && /neither knows that id/.test(String(missingBody.hint)),
      '§1i an id in NEITHER store is still refused by name, and the hint names both stores',
      missingBody)
  }

  // ── §2 status: the cap it enforces is printable, and "0 before the first fold" says so
  {
    console.log('§2 status — caps and foldedYet, so a 0 means one thing only')
    const root = await mkRoot()
    const b = await boot(root, { 'vmu.records.head.maxItems': 2 })
    const first = await call(b, 'vibe_vmu_records', { action: 'status' })
    ok(first.parsed && first.parsed.caps && typeof first.parsed.caps === 'object',
      '§2a status prints caps (the cap is enforced, so it must be readable)', first.parsed && first.parsed.caps)
    const capNow = first.parsed && first.parsed.caps && first.parsed.caps.headMaxItems
    ok(typeof capNow === 'number' && capNow > 0,
      '§2b caps.headMaxItems is the number really in force (it is the one the refusal quotes)', capNow)
    ok(first.parsed && first.parsed.caps && typeof first.parsed.caps.headMaxItemsAtStart === 'number' &&
      typeof first.parsed.caps.headMaxItemsMeans === 'string' && /WRITE time/.test(first.parsed.caps.headMaxItemsMeans),
      '§2c caps carries BOTH the write-time value and the startup snapshot, with a means line',
      first.parsed && first.parsed.caps)
    ok(first.parsed && first.parsed.foldedYet === false && typeof first.parsed.foldedYetMeans === 'string' && /NOT folded/.test(first.parsed.foldedYetMeans),
      '§2d a fresh kernel reports foldedYet:false (a 0 that means "not folded yet" is not printed as a 0 that means "empty")',
      first.parsed && { foldedYet: first.parsed.foldedYet })
    await call(b, 'vibe_vmu_records', { action: 'list', limit: 0 })
    const after = await call(b, 'vibe_vmu_records', { action: 'status' })
    ok(after.parsed && after.parsed.foldedYet === true,
      '§2e after one read the same field turns true (the flag tracks the fold, it is not decoration)',
      after.parsed && { foldedYet: after.parsed.foldedYet, pulls: after.parsed.shared && after.parsed.shared.pulls })
  }

  // ── §3 no regression: a records-only deployment keeps the RUN 117 contract (kind filter, counted cap)
  {
    console.log('§3 records-only deployment — kind still filters, total still counts the same source')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.records.put({ track: 'propositions', kind: 'proposition', title: '卡一', body: '- statement：S' })
    await b.K.records.put({ track: 'progress', kind: 'progress', title: '进展一', body: '- 正文：进展' })
    const onlyProps = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0, kind: 'proposition' })
    const rows = (onlyProps.parsed && onlyProps.parsed.records) || []
    ok(rows.length === 1 && rows[0].kind === 'proposition',
      '§3a kind:"proposition" still returns exactly that kind', rows.map((r) => r && r.kind))
    ok(onlyProps.parsed && onlyProps.parsed.kindFilter === 'proposition' && typeof onlyProps.parsed.total === 'number' &&
      typeof onlyProps.parsed.kindFilterMeans === 'string',
      '§3b the kind filter is named and the total is the count of what this answer covers (not the whole store)',
      onlyProps.parsed && { total: onlyProps.parsed.total, kindFilter: onlyProps.parsed.kindFilter })
    const capped = await call(b, 'vibe_vmu_records', { action: 'list', limit: 1 })
    ok(capped.parsed && capped.parsed.returned === 1 && capped.parsed.truncated === true,
      '§3c the cap is still reported as truncated (the caller can tell a page from the whole answer)',
      capped.parsed && { returned: capped.parsed.returned, truncated: capped.parsed.truncated, total: capped.parsed.total })
  }
  // ── §4 FEEDBACK12 item 5: a second `part` is a WHOLE-SECTION replacement, and the receipt says so in sizes
  {
    console.log('§4 a member holds ONE part slot — the replacement is announced with both sizes')
    const root = await mkRoot()
    const b = await boot(root)
    const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'p164', title: '一六四号论文', member: 'r-acad', participants: ['r-1'] })
    const st = (started.parsed && started.parsed.started) || {}
    ok(st.ok === true && st.paperTitle === '一六四号论文',
      '§4a start persists the human title it was GIVEN (it used to be accepted and dropped in silence)',
      { paperTitle: st.paperTitle, title: st.title, titleMeans: st.titleMeans })
    const first = await call(b, 'vibe_v5_paper', { action: 'part', target: 'p164', member: 'r-1', title: '第一节', solution: '第一版正文' })
    ok(first.parsed && first.parsed.ok === true && first.parsed.part && first.parsed.part.replaced === null,
      '§4b the first part replaces nothing', first.parsed && first.parsed.part && first.parsed.part.replaced)
    const second = await call(b, 'vibe_v5_paper', { action: 'part', target: 'p164', member: 'r-1', title: '第一节', solution: '第二版正文，比第一版长一些' })
    const rep = second.parsed && second.parsed.part && second.parsed.part.replaced
    ok(!!rep && typeof rep.oldBytes === 'number' && typeof rep.newBytes === 'number' && rep.newBytes > rep.oldBytes,
      '§4c the replacement reports BOTH sizes (a reader can see it shrank/grew, not guess)', rep)
    ok(!!rep && /ONE part slot/.test(String(rep.means)) && /replaced/.test(String(rep.means)),
      '§4d and says in words that it is a whole-section replacement, not an addition', rep && rep.means)
  }

  // ── §5 FEEDBACK12 item 7: the paper can be addressed by its title, its target and its printed id
  {
    console.log('§5 three spellings address ONE paper (title / target / paper-id)')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await call(b, 'vibe_v5_paper', { action: 'start', target: 'p165', title: '一六五号论文', member: 'r-acad', participants: ['r-1'] })
    const byTarget = await call(b, 'vibe_v5_paper', { action: 'consult_state', target: 'p165' })
    const byId = await call(b, 'vibe_v5_paper', { action: 'consult_state', target: 'paper-p165' })
    const byTitle = await call(b, 'vibe_v5_paper', { action: 'consult_state', target: '一六五号论文' })
    const answered = [byTarget, byId, byTitle].map((x) => (x.parsed && x.parsed.consult ? x.parsed.consult.target : (x.thrown ? 'REFUSED:' + x.code : null)))
    ok(answered[0] === 'p165' && answered[1] === 'p165' && answered[2] === 'p165',
      '§5a target, printed id and human title all reach the same paper (the address is the answer)', answered)
    const statusByTitle = await call(b, 'vibe_v5_paper', { action: 'status', target: '一六五号论文' })
    ok(statusByTitle.parsed && statusByTitle.parsed.ok === true && (statusByTitle.parsed.paper || {}).id === 'paper-p165',
      '§5b every action inherits it (status by title reads the same paper)',
      statusByTitle.thrown ? statusByTitle : statusByTitle.parsed && statusByTitle.parsed.paper && statusByTitle.parsed.paper.id)
  }
} finally {
  // ★ Windows: a kernel that still holds its store directory open makes `rm` throw EBUSY, and that failure must not
  // be read as a test result. Best-effort cleanup, retried once, and never fatal.
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { try { await rm(r, { recursive: true, force: true }) } catch { /* the OS still holds it; the temp dir is cleaned by the machine */ } } }
}

console.log('')
console.log('=== VMU RUN164 RECORDS TWO STORES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
