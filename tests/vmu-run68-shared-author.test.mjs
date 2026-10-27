// tests/vmu-run68-shared-author.test.mjs — ROUND 68 (F-61): AN UNKNOWN AUTHOR IS NOT A NAME.
//
// THE DEFECT THIS PINS (measured on the real machine, run 68, build 4cb80fc5). The office wrote one card, then a member
// kernel read the SAME id and reported `owner: "restore"` while the office's own list of the same row said
// `owner: null`. Two readers, one row, two answers — and the wrong answer looked specific, because "restore" is a
// plausible-looking writer name that never existed. It came from `kernel/records.js`'s shared-fold adoption: a durable
// row that carried neither `by` nor `owner` was stamped with the literal `'restore'`, i.e. the name of the OPERATION
// that adopted it was promoted into the name of the PERSON who wrote it.
//
// WHY IT IS A PRODUCT DEFECT AND NOT A TIDY-UP: attribution is evidence. A reader who sees `owner:"restore"` will
// believe a session called "restore" wrote that card (and may then ask it something); a reader who sees `owner:null`
// learns the truth — the row does not say. The invented value also breaks the invariant that one row has ONE owner
// across instances, which is what `read_library{id}` and the status board both rely on.
//
// WHAT IS ASSERTED HERE:
//   ① a fold row with NO writer is adopted with `owner: null` — and specifically never `'restore'`;
//   ② a fold row that carries `by` satisfies the author;
//   ③ a fold row that carries only the VIEW's name for it (`owner`) is still honoured (the snapshot copies the view);
//   ④ the adoption counter distinguishes "the ROW did not say" from "nothing was adopted", and its sentence denies the
//      wrong reading;
//   ⑤ ★ the run-68 shape itself: two instances over one root — `get` and `list` must agree about the owner of the same
//      id, and neither may report a name that is not on the row;
//   ⑥ no adopted row is ever stamped with an operation word (`restore`), across repeated pulls.
//
// RULE E: every collection assertion states its exact expected shape in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
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
const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

const BASE = 'D:/_tmp/r68/records'
await mkdir(BASE, { recursive: true })
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specs: state.specs }
}
const railOn = (root) => ({ root, packs: ['v5r'], clock: () => 1000 })
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const foldHas = (k, id) => () => {
  const rows = k.store.read('records')
  return Array.isArray(rows) && rows.some((r) => r && String(r.id) === id)
}

const entry = await import(pathToFileURL(ENTRY).href)
const recordsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')).href)

// ── a duck-typed durable port whose rows this test controls, so "who wrote what" is a fixture, not a guess ──────────
const makeStore = (rowsRef) => ({
  read: (key) => (key === 'records' ? JSON.parse(JSON.stringify(rowsRef())) : undefined),
  stats: () => ({ open: true, stamp: 'fake:' + rowsRef().length }),
})
const face = () => recordsMod.createRecords({ clock: () => 1000, settings: {}, log: () => {} })

console.log('=== 1. ★★ THE ROW THAT DOES NOT SAY WHO WROTE IT READS AS UNKNOWN, NOT AS "restore" ===')
const rowsNoAuthor = () => [
  { id: 'rec-n1', track: 'progress', kind: 'progress', title: 'no author row', body: 'a body', tags: [], fingerprint: null },
]
const f1 = face()
const att1 = f1.attachStore(makeStore(rowsNoAuthor))
ok(att1.ok === true && att1.attached === true && att1.key === 'records', '① attachStore accepts the durable port and names the key it reads', att1)
const got1 = serr(() => f1.get({ id: 'rec-n1' }))
ok(!got1.error, '① the adopted row resolves instead of refusing (the fixture really adopted it)', got1.error ? { code: got1.error.code, message: got1.error.message } : null)
const card1 = got1.value || {}
ok(card1.owner === null, '①★ a row with no writer is adopted with `owner: null` (the truth: the row does not say)', { owner: card1.owner })
ok(card1.owner !== 'restore', '①★ AND NEVER the literal `"restore"` — the adopting operation is not a person (run 68 read exactly this)', { owner: card1.owner })
const st1 = f1.status()
ok(st1.shared && st1.shared.adoptedWithoutAuthor === 1, '④ the adoption of an author-less row is COUNTED (`shared.adoptedWithoutAuthor === 1`)', st1.shared)
ok(typeof st1.shared.adoptedWithoutAuthorMeans === 'string' && /not because nobody wrote it/.test(st1.shared.adoptedWithoutAuthorMeans),
  '④★ the counter carries the sentence that denies the wrong reading of `null`', { means: st1.shared.adoptedWithoutAuthorMeans })

console.log('=== 2. A ROW THAT CARRIES `by` KEEPS THAT NAME (the fix must not flatten a known author into null) ===')
const rowsBy = () => [
  { id: 'rec-n2', track: 'progress', kind: 'progress', title: 'by row', body: 'b', tags: [], by: 'r-6' },
]
const f2 = face()
f2.attachStore(makeStore(rowsBy))
const got2 = serr(() => f2.get({ id: 'rec-n2' })).value || {}
ok(got2.owner === 'r-6', '② a fold row carrying `by` is adopted with that writer (not null)', { owner: got2.owner })
ok(f2.status().shared.adoptedWithoutAuthor === 0, '④ an author-carrying row does NOT bump the author-less counter (the two facts stay separable)', f2.status().shared)

console.log('=== 3. THE VIEW\'S NAME FOR THE WRITER IS STILL HONOURED (a copied snapshot only has `owner`) ===')
const rowsOwner = () => [
  { id: 'rec-n3', track: 'progress', kind: 'progress', title: 'owner row', body: 'b', tags: [], owner: 'r-2' },
]
const f3 = face()
f3.attachStore(makeStore(rowsOwner))
const got3 = serr(() => f3.get({ id: 'rec-n3' })).value || {}
ok(got3.owner === 'r-2', '③ a row that names its writer only through the VIEW name `owner` still resolves that writer', { owner: got3.owner })

console.log('=== 4. ★★ THE RUN-68 SHAPE: TWO INSTANCES OVER ONE ROOT MUST AGREE ABOUT ONE ROW\'S OWNER ===')
const rootShared = await newRoot('shared')
const B = await boot(railOn(rootShared))
const bFirst = B.kernel.records.list({ track: 'propositions', limit: 0 })
ok(bFirst.count === 0 && Array.isArray(bFirst.items) && bFirst.items.length === 0 && bFirst.suppressed === false,
  '⑤ B really started with an EMPTY list (the precondition that makes ⑤ a cross-instance read)', bFirst.items)
const A = await boot(railOn(rootShared))
ok(A.kernel !== B.kernel, '⑤ A and B are separate kernel instances over the same root', { same: A.kernel === B.kernel })
// A writes a card the way an OFFICE writes one: no member id, so no `by` on the row.
const wrote = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'r68 卡片', body: '- statement：取证卡', tags: [] })
ok(wrote.ok === true && typeof wrote.id === 'string', '⑤ A’s put returned a real id', wrote)
const landed = await until(foldHas(A.kernel, wrote.id))
ok(!!landed, '⑤★ the row really is in the durable fold (what makes the next read a READ)', A.kernel.store.read('records'))

const aGet = serr(() => A.kernel.records.get({ id: wrote.id })).value || {}
const bGet = serr(() => B.kernel.records.get({ id: wrote.id })).value || {}
ok(aGet.owner === bGet.owner, '⑤★★ the writer and the reader report the SAME owner for the same id (run 68: `null` vs `"restore"`)', { a: aGet.owner, b: bGet.owner })
ok(bGet.owner === null || bGet.owner === undefined, '⑤★ and that shared answer is "unknown", never an invented name', { owner: bGet.owner })
ok(bGet.owner !== 'restore', '⑤★ no instance in this fixture reports the operation word as an owner', { owner: bGet.owner })
const bList = B.kernel.records.list({ track: 'propositions', limit: 0 })
const listed = Array.isArray(bList.items) ? bList.items.filter((r) => r && r.id === wrote.id)[0] : null
ok(!!listed && listed.owner === bGet.owner,
  '⑤★★ `list` and `get` agree about the same row\'s owner (the two faces run-68 quoted at each other)', { listed: listed && listed.owner, get: bGet.owner })
ok(B.kernel.records.status().shared.adoptedWithoutAuthor >= 1,
  '⑤★ B counts the adoption of the author-less row (evidence, not a silent convention)', B.kernel.records.status().shared)

console.log('=== 5. NO ADOPTED ROW IS EVER STAMPED WITH AN OPERATION WORD, ACROSS REPEATED PULLS ===')
const rows2 = () => [
  { id: 'rec-n4', track: 'progress', kind: 'progress', title: 'r4', body: 'b4', tags: [] },
  { id: 'rec-n5', track: 'progress', kind: 'progress', title: 'r5', body: 'b5', tags: [], owner: 'r-3' },
]
const f5 = face()
f5.attachStore(makeStore(rows2))
f5.list({ limit: 0 })
const after1 = (f5.list({ limit: 0 }).items || []).map((r) => r.owner)
ok(JSON.stringify(after1) === JSON.stringify([null, 'r-3']),
  '⑥ after one pull the owners are exactly [null, "r-3"] (nothing invented, nothing flattened)', after1)
const after2 = (f5.list({ limit: 0 }).items || []).map((r) => r.owner)
ok(JSON.stringify(after2) === JSON.stringify([null, 'r-3']),
  '⑥ a second pull does not re-stamp or drift the owners (adoption is idempotent)', after2)
ok(!after2.includes('restore'), '⑥★ the operation word never appears as an owner in this face', after2)
ok(f5.status().shared.adoptedWithoutAuthor === 1,
  '⑥ the counter counted the author-less row once, not once per pull', f5.status().shared)

console.log('=== 6. F-63: A WRITE RECEIPT ECHOES THE AUTHOR THE CALL JUST CHOSE ===')
// Run 68 asked the office for the `owner` of the card it had just written and the receipt carried only `recordId`; the
// answer had to be fetched by a SECOND read, and that read is what produced the contradictory owner. The author is
// decided by THIS call, so the receipt states it — and says so out loud when the caller named nobody.
const root6 = await newRoot('echo')
const F = await boot(railOn(root6))
const withAuthor = F.kernel.records.put({ track: 'progress', kind: 'progress', title: 'echo with author', body: 'b6a', tags: [], by: 'r-4' })
const withAuthorGet = F.kernel.records.get({ id: withAuthor.id })
ok(withAuthorGet.owner === 'r-4', '⑥ the row written with a member really carries that owner (fixture)', { owner: withAuthorGet.owner })
const anon = F.kernel.records.put({ track: 'progress', kind: 'progress', title: 'echo no author', body: 'b6b', tags: [] })
const anonGet = F.kernel.records.get({ id: anon.id })
ok(anonGet.owner === null, '⑥ a row written without a member carries owner null (the truth the receipt must echo)', { owner: anonGet.owner })
// the pack-level card tool is what a live office calls; its receipt must carry the same two fields
const cardSpec = [...F.specs, ...(F.handle.specs || [])].filter((sp) => sp && sp.name === 'vibe_v5_record_proposition')[0]
ok(!!cardSpec, '⑥ the pack really registers `vibe_v5_record_proposition` on this kernel (the receipt under test is the live one)', { names: F.specs.map((sp) => sp && sp.name) })
if (cardSpec) {
  const created = await cardSpec.execute({ title: 'echo card', statement: 's', value: 1, motive: 'm', p: 0.99, member: 'r-4' }, { kernel: F.kernel })
  const c = typeof created === 'string' ? JSON.parse(created) : created
  ok(c && c.recordId && c.owner === 'r-4', '⑥★ the card write receipt ECHOES `owner` (no second read needed to answer "whose card is this")', c && { recordId: c.recordId, owner: c.owner })
  ok(c && c.ownerMeans === null, '⑥ when the author is known the receipt carries no "unknown" sentence', c && { means: c.ownerMeans })
  const anonCard = await cardSpec.execute({ title: 'echo card 2', statement: 's2', value: 2, motive: 'm2', p: 0.5 }, { kernel: F.kernel })
  const c2 = typeof anonCard === 'string' ? JSON.parse(anonCard) : anonCard
  ok(c2 && c2.owner === null && typeof c2.ownerMeans === 'string' && /NO author/.test(c2.ownerMeans),
    '⑥★ and when nobody was named it echoes null WITH the sentence that denies "nobody wrote it"', c2 && { owner: c2.owner, means: c2.ownerMeans })
}

// ── cleanup ───────────────────────────────────────────────────────────────────────────────────────────────────────
// The store writes through fire-and-forget, so a teardown can meet a write that is still landing (run 68's own gate
// met `ENOTEMPTY: directory not empty, rmdir '…\vmu'` AFTER every assertion had passed). A directory-listing race at
// teardown is not a product defect, so the removal waits the write out instead of failing the suite.
async function removeTree(dir) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await rm(dir, { recursive: true, force: true }); return } catch (e) {
      const code = e && e.code
      if (code !== 'ENOTEMPTY' && code !== 'EPERM' && code !== 'EBUSY') throw e
      await new Promise((done) => setTimeout(done, 25))
    }
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}
for (const r of roots) await removeTree(r)

console.log('')
console.log('RUN68 SHARED AUTHOR: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.error(failures.join('\n')); process.exitCode = 1 }
