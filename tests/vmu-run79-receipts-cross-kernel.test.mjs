// tests/vmu-run79-receipts-cross-kernel.test.mjs — RUN 79 / TB-2740: the receipt ledger must be readable ACROSS kernels.
//
// THE DEFECT THIS PINS (measured on the real machine, RUN 79, build 6c689c86): the office kernel called
// `vibe_v5_meeting {action:"receiptsView", limit:10}` and got `{"receipts":[],"count":0,"available":0,...}` — while the
// SAME run had a Chinese-alias meeting convened by the CHAIR'S CHILD kernel whose convene receipt said
// `typeInput:"结题" / typeMatchedBy:"alias"` and whose durable row in `state.json` was identical. The receipt ring was
// per kernel INSTANCE, so a read face could only ever see its own acts: in a real run that is NO-EVIDENCE, and a
// reader had no way to tell "nothing happened" from "happened in another kernel".
//
// WHAT THIS SUITE PROVES:
//   ① the kernel's `receiptsView` reads the DURABLE meetings fold first (the seam `durable.readFold`, added READ-ONLY
//      by the approved hunk) and names its source (`readFrom`), while the in-process ring is reported separately as
//      `inProcessRingCount` — the ring never overwrites the fold;
//   ② TWO kernel instances on the SAME store root: A convenes (Chinese alias), B reads through the TOOL face and the
//      three keys are byte-identical across receipt / durable row / B's read;
//   ③ `agendaInputShape` + `agendaSplitMeans`: a STRING agenda splits on `;` / `；` / newlines only AT DEPTH 0
//      (separators inside paired brackets/quotes are not boundaries; an unpaired token is a NAMED fallback; a `,` or `、` is
//   ④ `limit` 1..200, out-of-range refused BY NAME (no clamp) — and `available`/`dropped` stay honest on the durable
//      source;
//   ⑤ a legacy fold row (no `typeInput`/`typeMatchedBy`) reads null + means, not "" and not a throw; a BROKEN fold seam
//      falls back to the ring and says why;
//   ⑥ anti-lamp-off ×3 on REAL COPIES: (a) read the ring again ⇒ B's cross-kernel read is empty; (b) `available` from
//      the ring ⇒ the number contradicts the fold; (c) split a string agenda on `,` ⇒ the comma case gains an item.
//      Each mutation must turn its assertion RED; the copy is restored byte-identically (sha256 shown).

// fs-purpose: copy the entry tree for three mutations and restore it byte-identically so no module is left mutated
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href
const IDX_SRC = readFileSync(join(VMU, 'kernel', 'index.js'), 'utf8')
const KERNEL_SRC = readFileSync(join(VMU, 'kernel', 'meetings.js'), 'utf8')
const PACK_SRC = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const T = 1_800_000_000_000

const TMP_ROOT = process.env.VMU_TEST_TMP_ROOT || (existsSync(__tmpRoot()) ? __tmpRoot() : tmpdir())
const MUT_ROOT = join(__tmpRoot(), 'tb2740')
const roots = []
const mkRoot = async (tag) => { const d = await mkdtemp(join(TMP_ROOT, tag)); roots.push(d); return d }

const settings = () => ({
  'vmu.resume.writeThrough': true,
  'vmu.resume.projections': ['members', 'meetings'],
})

const bootWith = async (entryUrl, root) => {
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (s) => { specs.push(s); return () => {} } },
  }
  const e = await import(entryUrl)
  const handle = e.apply(ctx, { clock: () => T, packs: ['v5r'], root, vmu: settings() })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, kernel: handle.kernel, specs, specOf: (n) => specs.find((s) => s && s.name === n) || null }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
  try {
    const raw = await spec.execute(args, { kernel: b.kernel })
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
  }
}
const settle = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}
const durableState = async (root) => JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
const durableReceiptRows = async (root) => {
  const st = await durableState(root).catch(() => null)
  const data = st && st.keys && st.keys.meetings && st.keys.meetings.value && st.keys.meetings.value.data
  if (!data || typeof data.receipts !== 'string') return null
  const rows = JSON.parse(data.receipts)
  return Array.isArray(rows) ? rows : null
}
const durableMeetingRow = async (root, mid) => {
  const st = await durableState(root).catch(() => null)
  const data = st && st.keys && st.keys.meetings && st.keys.meetings.value && st.keys.meetings.value.data
  if (!data || typeof data.live !== 'string') return null
  const live = JSON.parse(data.live)
  const pairs = live && Array.isArray(live.__map) ? live.__map : []
  const hit = pairs.filter((p) => p && Array.isArray(p) && String(p[0]) === String(mid))[0]
  return hit ? hit[1] : null
}
const THREE = ['typeInput', 'typeMatchedBy', 'type']
const threeKeys = (row) => ({ type: row && row.type, typeInput: row && row.typeInput, typeMatchedBy: row && row.typeMatchedBy })
const sameKeys = (a, b) => THREE.every((k) => a[k] === b[k])

try {
  // ── §0 THE SOURCE: the read-only seam, the durable-first read, and the two agenda paths ───────────────────────
  console.log('=== 0. SOURCE: one READ-ONLY fold seam, a durable-first read, and a declared string split ===')
  {
    ok(/readFold: \(\) => store\.read\('meetings'\)/.test(IDX_SRC),
      '★ the seam exposes the durable meetings fold READ-ONLY (the approved hunk)')
    ok(/readFold: \(\) => store\.read\('meetings'\),\n/.test(IDX_SRC) && /write: \(rows\) => store\.patch\('meetings'/.test(IDX_SRC),
      '★ nothing writes THROUGH the fold seam: readFold is exactly one store.read, and the sibling write is unchanged')
    ok(/function durableReceiptFold\(\)/.test(KERNEL_SRC) && /typeof durable\.readFold !== 'function'/.test(KERNEL_SRC),
      'the kernel builds the fold read as an OPTIONAL seam (a fixture without it still works)')
    ok(/const readFrom = fromFold \? 'durable-fold' : 'in-process-ring'/.test(KERNEL_SRC),
      '★ the receipt NAMES its source instead of letting two different ledgers look alike')
    ok(/inProcessRingCount: receipts\.length/.test(KERNEL_SRC),
      '★ the in-process ring is reported SEPARATELY (never folded into `available`)')
    ok(/sourceDivergenceMeans: 'the durable fold and this instance/.test(KERNEL_SRC) && /authoritative because it is the shared record/.test(KERNEL_SRC),
      'a disagreement is stated with both numbers and the reason the fold wins')
    ok(/agendaInputShape: Array\.isArray\(args\.agenda\) \? 'array' : 'string'/.test(PACK_SRC),
      'the pack receipt declares WHICH agenda shape the caller used')
    // ★★★ TB-2763 (RUN 81 attempt-3): the splitter is DEPTH-AWARE now — a separator inside paired brackets
    // （）()[]【】 or quotes is NOT a boundary, and an unpaired token is NAMED instead of silently split at level 0.
    ok(/function splitAgendaText \(/.test(PACK_SRC) &&
      /AGENDA_BRACKET_PAIRS/.test(PACK_SRC) &&
      /stack\.length === 0 && quote === null && \(ch === ';' \|\| ch === '；' \|\| ch === '\\n'\)/.test(PACK_SRC) &&
      /agendaSplitUnbalancedMeans/.test(PACK_SRC),
      '★ the STRING path splits on `;` / `；` / newline only AT DEPTH 0 — paired brackets/quotes are not boundaries, a bare comma never splits, and an unpaired token is NAMED (TB-2763)')
    ok(/agendaSplitMeans:/.test(PACK_SRC), 'the split rules are stated in the receipt (a reader does not re-read the transcript)')
  }

  // ── §1 TWO KERNELS, ONE ROOT: A convenes, B reads through the TOOL face ───────────────────────────────────────
  console.log('=== 1. CROSS-KERNEL: two kernels share a store root; the office kernel READS the chair kernel\'s act ===')
  let cross = null
  {
    const root = await mkRoot('vmu-run79-cross-')
    const a = await bootWith(ENTRY, root)
    await a.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    await a.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const con = await call(a, 'vibe_v5_meeting', { type: '结题', member: 'r-acad', agenda: '确认 (2k−1,2k) 的界,与证明；评审 证明 B' })
    ok(con && con.ok === true, '§1 A (chair kernel) convenes a Chinese-alias meeting', con && (con.code || con.message))
    ok(!!con && con.type === 'closure' && con.typeInput === '结题' && con.typeMatchedBy === 'alias',
      '§1 the convene receipt carries the alias provenance', con && threeKeys(con))
    const mid = con && con.meeting
    await settle(a.kernel)

    const rows = await until(async () => {
      const got = await durableReceiptRows(root).catch(() => null)
      if (!Array.isArray(got)) return null
      return got.filter((x) => x && x.action === 'open').length > 0 ? got : null
    })
    ok(Array.isArray(rows) && rows.length >= 1, '§1 precondition: the open row reached the DURABLE fold', rows && rows.length)

    const b = await bootWith(ENTRY, root)
    const view = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 10 })
    ok(view && view.ok === true, '§1 ★ B (the OFFICE kernel, no meeting of its own) can read the ledger through the TOOL face', view && (view.code || view.message))
    ok(view && view.readFrom === 'durable-fold', '★ §1 the B read comes from the durable fold (not B\'s empty ring)', view && view.readFrom)
    ok(view && Number.isInteger(view.available) && view.available >= 1,
      '★ §1 `available` counts the DURABLE rows — a sibling kernel\'s act IS visible (this was 0 in the defect)', view && view.available)
    ok(view && Number.isInteger(view.inProcessRingCount) && view.inProcessRingCount <= view.available,
      '§1 the ring length is reported separately, and it does not exceed the durable count here', view && { ring: view.inProcessRingCount, available: view.available })
    ok(view && str(view.receiptRingMeans) !== null && /DURABLE meetings fold/.test(String(view.receiptRingMeans)),
      '§1 the means sentence says `available` is the durable count, not ring capacity')
    const got = view && Array.isArray(view.receipts) ? view.receipts.filter((x) => String(x.meeting) === String(mid))[0] : null
    ok(!!got, '§1 the SAME meeting appears in B\'s read (a cross-kernel read, not a coincidence)', { mid })
    if (got) {
      const durableRow = rows.filter((x) => String(x.meeting) === String(mid))[0]
      ok(!!durableRow && sameKeys(threeKeys(con), threeKeys(durableRow)),
        '§1 convene receipt and the durable open row agree on the three keys', { receipt: threeKeys(con), durable: threeKeys(durableRow) })
      ok(sameKeys(threeKeys(con), threeKeys(got)),
        '★★ §1 the THREE READINGS agree across kernels and faces: convene receipt / durable state.json / B\'s tool read',
        { receipt: threeKeys(con), read: threeKeys(got) })
      ok(str(got.typeMatchedByMeans) !== null, '§1 B\'s row still carries the means sentence', got.typeMatchedByMeans)
    }
    const mrow = await durableMeetingRow(root, mid)
    ok(!!mrow, '§1 the DURABLE MEETING row itself is in the fold (not just the receipt)', { mid })
    ok(!!mrow && mrow.typeInput === '结题' && mrow.typeMatchedBy === 'alias',
      '★ §1 the durable meeting row carries the input word AND the path (D2 of RUN 78, still true after the fold read)', mrow && threeKeys(mrow))
    cross = { root, a, b, view }
  }

  // ── §2 AGENDA SHAPES: the string separators are declared; an array is never re-split ───────────────────────────
  console.log('=== 2. AGENDA: a comma is punctuation, a `;`/newline is a boundary, an array keeps its elements ===')
  {
    const root = await mkRoot('vmu-run79-agenda-')
    const b = await bootWith(ENTRY, root)
    await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    const STR = '确认 (2k−1,2k) 的界,与证明；评审 证明 B\n补充 C'
    const rs = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: STR })
    ok(rs && rs.ok === true, '§2 a one-string agenda convenes', rs && (rs.code || rs.message))
    ok(rs && rs.agendaInputShape === 'string', '§2 the receipt says the caller passed a STRING', rs && rs.agendaInputShape)
    ok(rs && Array.isArray(rs.agendaItems) && rs.agendaItems.length === 3,
      '★ §2 three items: the `,` inside "(2k−1,2k)" did NOT split, `；` and the newline DID', rs && rs.agendaItems)
    ok(rs && Array.isArray(rs.agendaItems) && rs.agendaItems[0] === '确认 (2k−1,2k) 的界,与证明',
      '★ §2 the comma stays INSIDE the first item (a purpose is a sentence, not a list)', rs && rs.agendaItems && rs.agendaItems[0])
    ok(rs && Array.isArray(rs.agendaItems) && rs.agendaItems[2] === '补充 C', '§2 the newline is a boundary', rs && rs.agendaItems)
    ok(rs && /`,` and `、` are NOT separators/.test(String(rs.agendaSplitMeans)),
      '§2 the means says which characters are NOT separators', rs && rs.agendaSplitMeans)
    const arr = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: ['a,b', 'c、d', '  '] })
    ok(arr && arr.ok === true, '§2 an array agenda convenes', arr && (arr.code || arr.message))
    ok(arr && arr.agendaInputShape === 'array', '§2 the receipt says the caller passed an ARRAY', arr && arr.agendaInputShape)
    ok(arr && Array.isArray(arr.agendaItems) && arr.agendaItems.length === 2 && arr.agendaItems[0] === 'a,b' && arr.agendaItems[1] === 'c、d',
      '★ §2 array elements are kept VERBATIM (`a,b` stays one item; a whitespace-only element is dropped)', arr && arr.agendaItems)
  }

  // ── §3 LIMIT: 1..200, refused by name, and available/dropped stay honest ──────────────────────────────────────
  console.log('=== 3. LIMIT: out-of-range is refused BY NAME (a clamp answers another question) ===')
  {
    const b = await bootWith(ENTRY, await mkRoot('vmu-run79-limit-'))
    for (const bad of [0, 201, 500, -1]) {
      const r = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: bad })
      ok(r && r.ok === false && r.code === 'VMU_INVALID_ARGUMENT', '§3 limit ' + bad + ' is refused by name', r && (r.code || r.ok))
    }
    const one = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 1 })
    ok(one && one.ok === true && one.count <= 1, '§3 limit 1 returns at most one row', one && one.count)
    const wide = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 200 })
    ok(wide && wide.ok === true && (wide.readFrom === 'durable-fold' || wide.readFrom === 'in-process-ring'),
      '§3 limit 200 is accepted and names its source (a fresh root may legitimately read the ring)', wide && wide.readFrom)
  }

  // ── §4 DIVERGENCE: a sibling writes AFTER this kernel booted — the fold wins and both numbers appear ──────────
  console.log('=== 4. DIVERGENCE: the ring must NOT overwrite the fold, and both numbers must appear ===')
  {
    const root = await mkRoot('vmu-run79-div-')
    const a = await bootWith(ENTRY, root)
    await a.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    const first = await call(a, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'A' })
    ok(first && first.ok === true, '§4 A convenes the first meeting', first && (first.code || first.message))
    await settle(a.kernel)
    const b = await bootWith(ENTRY, root)
    const before = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 10 })
    ok(before && before.ok === true && before.available === 1, '§4 B reads ONE durable row before the sibling writes', before && before.available)
    const second = await call(a, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'B' })
    ok(second && second.ok === true, '§4 A convenes a SECOND meeting after B booted', second && (second.code || second.message))
    await settle(a.kernel)
    const after = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 10 })
    ok(after && after.ok === true, '§4 B reads again', after && (after.code || after.message))
    ok(after && after.available === 2, '★ §4 `available` grew with the DURABLE fold (the sibling\'s new act is visible)', after && after.available)
    ok(after && after.inProcessRingCount === 1,
      '★ §4 `inProcessRingCount` stayed at B\'s OWN ring (1) — the ring did not absorb the sibling\'s act', after && after.inProcessRingCount)
    ok(after && str(after.sourceDivergenceMeans) !== null && /2 durable \/ 1 in-process/.test(String(after.sourceDivergenceMeans)),
      '★ §4 the disagreement is stated with BOTH numbers (this is the "numbers fork" the lead asked to see)', after && after.sourceDivergenceMeans)
    ok(after && /authoritative because it is the shared record/.test(String(after.sourceDivergenceMeans)),
      '§4 …and the reason the durable fold wins is written down')
    ok(after && Array.isArray(after.receipts) && after.receipts.length === 2,
      '★ §4 the returned rows are the DURABLE ones (a ring of 1 did not truncate the answer to 1)', after && after.receipts && after.receipts.length)
  }

  // ── §5 LEGACY ROWS + A BROKEN SEAM: null + means, and an honest fallback ─────────────────────────────────────
  console.log('=== 5. LEGACY ROWS read null + means; a broken/absent fold seam falls back and SAYS SO ===')
  {
    const { createMeetings } = await import(pathToFileURL(join(VMU, 'kernel', 'meetings.js')).href)
    const OLD = JSON.stringify([
      { at: 900, action: 'open', meeting: 'm3', type: 'closure' },
      { at: 950, action: 'open', meeting: 'm2', type: 'ordinary', typeInput: '', typeMatchedBy: '' },
    ])
    const foldEnv = (receipts) => ({ value: { data: { receipts } } })
    const t = createMeetings({ clock: () => 1000, settings: { 'vmu.meetings.quorumCap': 0 }, durable: { read: () => [], write: () => {}, readFold: () => foldEnv(OLD) } })
    const view = t.receiptsView({ limit: 10 })
    ok(view && view.ok === true && view.readFrom === 'durable-fold', '§5 an old durable fold is read as the durable fold', view && view.readFrom)
    ok(view && view.receipts && view.receipts.length === 2, '§5 both old rows are readable', view && view.count)
    const old = view && view.receipts ? view.receipts.filter((r) => r && r.meeting === 'm3')[0] : null
    ok(!!old && old.type === 'closure', '§5 the legacy row keeps its resolved type', old && old.type)
    ok(!!old && old.typeInput === null && old.typeMatchedBy === null,
      '★ §5 an unrecorded provenance reads NULL, not "" (a blank that looks like a value is the RUN 77 defect)', old && threeKeys(old))
    ok(!!old && str(old.typeMatchedByMeans) !== null, '§5 …and a sentence says the row predates the record', old && old.typeMatchedByMeans)

    const boom = createMeetings({ clock: () => 1000, settings: { 'vmu.meetings.quorumCap': 0 }, durable: { read: () => [], write: () => {}, readFold: () => { throw new Error('unreadable fold') } } })
    const fb = boom.receiptsView({ limit: 10 })
    ok(fb && fb.ok === true && fb.readFrom === 'in-process-ring',
      '★ §5 a BROKEN fold seam degrades to the ring and names it (no crash, no silent lie)', fb && fb.readFrom)
    ok(fb && str(fb.foldWhy) !== null && /could not be read/.test(String(fb.foldWhy)),
      '★ §5 …and the failure is stated, not swallowed', fb && fb.foldWhy)

    const none = createMeetings({ clock: () => 1000, settings: { 'vmu.meetings.quorumCap': 0 } })
    const nr = none.receiptsView({ limit: 10 })
    ok(nr && nr.ok === true && nr.readFrom === 'in-process-ring',
      '§5 a kernel built WITHOUT the seam (unit fixtures / older kernels) still reads its own ring', nr && nr.readFrom)
  }

  // ── §6 ANTI-LAMP-OFF ×3: each mutation on a REAL COPY must make its assertion RED, then restore byte-identically ─
  console.log('=== 6. ANTI-LAMP-OFF: three real copies, each with ONE mutation; restore is byte-identical (sha256) ===')
  {
    mkdirSync(MUT_ROOT, { recursive: true })
    const KREL = join('kernel', 'meetings.js')
    const PREL = join('packs', 'v5r', 'tools.js')
    const withMutant = async (name, rel, mutate, fn) => {
      const tree = join(MUT_ROOT, 'tree-' + name)
      await rm(tree, { recursive: true, force: true })
      cpSync(VMU, tree, { recursive: true })
      const file = join(tree, rel)
      const pristine = readFileSync(file, 'utf8')
      const pristineSha = sha256(pristine)
      const mutated = mutate(pristine)
      ok(mutated !== pristine, '§6 ' + name + ': the mutation actually changed the source text')
      await writeFile(file, mutated, 'utf8')
      const mutantSha = sha256(mutated)
      ok(mutantSha !== pristineSha, '§6 ' + name + ': the mutant tree differs from the pristine tree', { sha: mutantSha.slice(0, 12) })
      try {
        return await fn({ tree, entry: pathToFileURL(join(tree, 'vibe-math-vmu.js')).href })
      } finally {
        await writeFile(file, pristine, 'utf8')
        ok(sha256(readFileSync(file, 'utf8')) === pristineSha, '§6 ' + name + ': the copy RESTORED byte-identically to the pristine sha256')
      }
    }

    // A convenes m1 (pristine), B (the kernel under test) boots, then A convenes m2 AFTER B booted: B's ring can only
    // hold m1, while the durable fold holds both — that is the only honest way to observe a fork.
    const twoKernels = async (root, copyEntry) => {
      const a = await bootWith(ENTRY, root)
      await a.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
      const m1 = await call(a, 'vibe_v5_meeting', { type: '结题', member: 'r-acad', agenda: 'm1' })
      ok(m1 && m1.ok === true, '§6 control: the pristine kernel convenes m1 (before B boots)', m1 && (m1.code || m1.message))
      await settle(a.kernel)
      const b = await bootWith(copyEntry, root)
      const m2 = await call(a, 'vibe_v5_meeting', { type: 'closure', member: 'r-acad', agenda: 'm2' })
      ok(m2 && m2.ok === true, '§6 control: the sibling kernel convenes m2 AFTER B booted', m2 && (m2.code || m2.message))
      await settle(a.kernel)
      await until(async () => {
        const rows = await durableReceiptRows(root).catch(() => null)
        return Array.isArray(rows) && rows.filter((r) => r && r.action === 'open').length >= 2
      }, 5000)
      return { a, b, m1, m2 }
    }

    // (a) revert the read to the in-process ring ⇒ the sibling's later act is INVISIBLE.
    {
      const root = await mkRoot('vmu-run79-mut-a-')
      const out = await withMutant('a-ring', KREL, (s) => s.replace('const source = fromFold ? fold.rows : receipts', 'const source = receipts'),
        async ({ entry }) => {
          const { b, m2 } = await twoKernels(root, entry)
          const view = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 10 })
          return { view, m2 }
        })
      ok(out.view && out.view.ok === true, '§6 (a) the mutant kernel still answers', out.view && (out.view.code || out.view.message))
      ok(out.view && out.view.available === 1 && out.view.receipts.length === 1,
        '★★ §6 (a) RED-worthy: reading the ring shows ONE act while the durable fold holds TWO (the RUN 79 defect)',
        out.view && { available: out.view.available, rows: out.view.receipts.length })
      ok(out.view && Array.isArray(out.view.receipts) && !out.view.receipts.some((r) => String(r.meeting) === String(out.m2.meeting)),
        '★★ §6 (a) …and the sibling\'s meeting is ABSENT from that read (NO-EVIDENCE, not "nothing happened")',
        out.view && out.view.receipts && out.view.receipts.map((r) => r.meeting))
    }

    // (b) available from the ring ⇒ rows come from the fold but the count says 1.
    {
      const root = await mkRoot('vmu-run79-mut-b-')
      const out = await withMutant('b-available', KREL, (s) => s.replace('available: source.length', 'available: receipts.length'),
        async ({ entry }) => {
          const { b } = await twoKernels(root, entry)
          return call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 10 })
        })
      ok(out && out.ok === true, '§6 (b) the mutant kernel still answers', out && (out.code || out.message))
      ok(out && out.receipts.length === 2 && out.available === 1,
        '★★ §6 (b) RED-worthy: `available` (1) contradicts the returned rows (2) — the numbers fork and lie',
        out && { rows: out.receipts.length, available: out.available })
    }

    // (c) split a string agenda on a comma ⇒ one purpose becomes two items.
    {
      const root = await mkRoot('vmu-run79-mut-c-')
      // ★ TB-2763 re-anchor: the old mutation replaced `agendaText.split(/[;；\n]/)`; the splitter now compares
      // characters at depth 0, so the SAME defect is injected by ADDING the comma to that separator condition.
      const out = await withMutant('c-comma', PREL, (s) => s.replace("(ch === ';' || ch === '；' || ch === '\\n')", "(ch === ';' || ch === '；' || ch === '\\n' || ch === ',')"),
        async ({ entry }) => {
          const b = await bootWith(entry, root)
          await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
          return call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '确认 (2k−1,2k) 的界,与证明' })
        })
      ok(out && out.ok === true, '§6 (c) the mutant kernel still convenes', out && (out.code || out.message))
      ok(out && Array.isArray(out.agendaItems) && out.agendaItems.length === 2,
        '★★ §6 (c) RED-worthy: with a comma split, ONE comma-bearing purpose becomes TWO items (the comma inside (…) stays protected — the depth rule survives the mutation)',
        out && out.agendaItems)
    }
  }
} finally {
  for (const d of roots) await rm(d, { recursive: true, force: true }).catch(() => {})
}

console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
