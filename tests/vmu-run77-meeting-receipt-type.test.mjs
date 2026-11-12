// tests/vmu-run77-meeting-receipt-type.test.mjs — RUN 77 / TB-2726: the DURABLE open row knew less than the receipt.
//
// THE DEFECT THIS PINS (measured on the real machine, not inferred): RUN 77's durable meeting ledger
// (`keys.meetings.value.data.receipts`) held an open row `{"at":…,"action":"open","type":"closure","typeInput":"","typeMatchedBy":"","meeting":"m3"}`
// — two EMPTY STRINGS where the convene receipt had said `typeInput:"结题"`, `typeMatchedBy:"alias"`. The only surviving
// record of the alias was the chair's own turn transcript. Two failures in one row: the durable row was allowed to know
// LESS than the receipt it mirrors, and `""` is not a value (an unrecorded word is null + a sentence, not "the caller
// typed nothing").
//
// WHAT THIS SUITE PROVES:
//   ① the SOURCE has ONE production receipt write point (`pushReceipt`) and the open row is built with the same
//      `typeMatch` projection the receipt carries — a silent revert is red here, not only in behaviour;
//   ② THREE fixtures × THREE readings are the SAME three keys: the convene RECEIPT, the durable `state.json` row, and
//      `receiptsView` — explicit English id (`'id'`), Chinese alias (`'alias'`, input kept verbatim), omitted type
//      (`'default'`, `typeInput:null` + means). The stored `type` stays the English id in all three;
//   ③ OLD rows (no keys, or RUN 77's `""` pair) read as null + `typeMatchedByMeans` and do NOT throw; the row is still
//      readable through `receiptsView` and its `type` is untouched;
//   ④ invalid inputs are refused BY NAME (`typeMatchedBy` outside id|alias|default, non-string `typeInput`);
//   ⑤ anti-lamp-off ×3, each booting a REAL COPY with ONE mutation: (a) the receipt stops carrying `typeMatch` ⇒ the
//      receipt loses the keys (the durable row would again know less); (b) an alias is written down as `'id'` ⇒ the
//      repair's whole point (provenance) is gone; (c) an absent word is written as `""` ⇒ the blank-that-looks-like-a-value
//      returns. Each mutation must turn its assertion RED, and the unmutated tree is green (proven in ②).
//
// WHAT IT DOES NOT PROVE: it does not prove a model passes `type:"结题"` (that is the pack face, `vmu-run76-meeting-type-aliases`);
// it does not migrate old rows — they are READ tolerantly, which is all a durable fold can honestly do.

// fs-purpose: copy the entry tree three times so each mutation boots real modules without touching the working tree
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href
const KERNEL_SRC = readFileSync(join(VMU, 'kernel', 'meetings.js'), 'utf8')
const PACK_SRC = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')

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
const durableReceipts = async (root) => {
  const raw = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  const mt = raw && raw.keys && raw.keys.meetings
  const data = mt && mt.value && mt.value.data
  if (!data || typeof data.receipts !== 'string') return null
  const rows = JSON.parse(data.receipts)
  return Array.isArray(rows) ? rows : null
}
const THREE = ['typeInput', 'typeMatchedBy', 'type']
const threeKeys = (row) => ({ type: row && row.type, typeInput: row && row.typeInput, typeMatchedBy: row && row.typeMatchedBy })
const sameThree = (a, b, c) => THREE.every((k) => a[k] === b[k] && b[k] === c[k])

try {
  // ── §0 THE SOURCE: one write point, one projection, and the pack forwarding approved for this row ─────────────
  console.log('=== 0. SOURCE: the open row is built with the same projection the receipt carries ===')
  {
    const spreads = (KERNEL_SRC.match(/\.\.\.typeMatch,/g) || []).length
    ok(spreads === 2, '★ the `typeMatch` projection is spread in exactly TWO places (the durable receipt and the return value)', { spreads })
    ok(/function typeMatchRowOf\(/.test(KERNEL_SRC) && /function receiptRowRead\(/.test(KERNEL_SRC),
      'both halves exist by name: the WRITE projection and the tolerant READ projection')
    ok(/const TYPE_MATCH_PATHS = Object\.freeze\(\['id', 'alias', 'default'\]\)/.test(KERNEL_SRC),
      'the accepted provenance paths are the three declared ones (no free-form string)')
    const pushes = (KERNEL_SRC.match(/receipts\.push\(/g) || []).length
    ok(pushes === 2, 'only TWO `receipts.push(` sites exist: the restore rehydrate and the producer', { pushes })
    ok(/receipts\.push\(receipt\)/.test(KERNEL_SRC) && /function pushReceipt\(/.test(KERNEL_SRC),
      '★ the ONE production write point is pushReceipt(receipt) — a second production writer would be a new fact to audit')
    ok(/\.map\(\(r\) => receiptRowRead\(r\)\)/.test(KERNEL_SRC),
      '★ receiptsView reads through receiptRowRead (old rows tolerated, new rows round-tripped)')
    ok(/typeInput, typeMatchedBy, chair: member/.test(PACK_SRC),
      '★ the pack forwards the two locals it already computed into kernel.meetings.open (approved hunk; no second parse)')
    ok((PACK_SRC.match(/kernel\.meetings\.open\(/g) || []).length === 1, 'the pack has exactly ONE open call site (the forwarding hunk stays honest)')
  }

  // ── §1 THREE fixtures × THREE readings: receipt / durable state.json / receiptsView ───────────────────────────
  console.log('=== 1. THREE FIXTURES: the receipt, the durable row and receiptsView are the SAME three keys ===')
  {
    const root = await mkRoot('vmu-run77-3way-')
    const b = await bootWith(ENTRY, root)
    const k = b.kernel
    await k.members.hire({ id: 'r-acad', slot: 'chair' })
    await k.members.hire({ id: 'r-1', slot: 'member' })

    const FIXTURES = [
      { tag: 'alias', args: { type: '结题' }, want: { type: 'closure', typeInput: '结题', typeMatchedBy: 'alias' } },
      { tag: 'id', args: { type: 'closure' }, want: { type: 'closure', typeInput: 'closure', typeMatchedBy: 'id' } },
      { tag: 'default', args: {}, want: { type: 'ordinary', typeInput: null, typeMatchedBy: 'default' } },
    ]
    const con = {}
    for (const f of FIXTURES) {
      const r = await call(b, 'vibe_v5_meeting', { agenda: '议程：' + f.tag, member: 'r-acad', ...f.args })
      ok(r && r.ok === true, '§1 ' + f.tag + ': the chair convenes', r && (r.code || r.message))
      ok(!!r && typeof r.meeting === 'string' && r.meeting !== '', '§1 ' + f.tag + ': the receipt names the meeting', r && r.meeting)
      con[f.tag] = r
      const got = threeKeys(r)
      ok(got.type === f.want.type, '§1 ' + f.tag + ': ★ stored `type` is the ENGLISH id (an alias never becomes the stored type)', got)
      ok(got.typeInput === f.want.typeInput && got.typeMatchedBy === f.want.typeMatchedBy,
        '§1 ' + f.tag + ': the convene receipt carries the caller provenance (' + JSON.stringify(f.want) + ')', got)
      ok(str(r.typeMatchedByMeans) !== null, '§1 ' + f.tag + ': …and a sentence says what the provenance means', r.typeMatchedByMeans)
    }

    // the durable fold: wait for the three rows to LAND (write-through is async)
    await settle(k)
    const rows = await until(async () => {
      const got = await durableReceipts(root).catch(() => null)
      if (!Array.isArray(got) || got.length < 3) return null
      return got.filter((x) => x && x.action === 'open')
    })
    ok(Array.isArray(rows) && rows.length >= 3, '§1 precondition: all three open rows reached the DURABLE fold (state.json), not only memory',
      rows && rows.length)

    const view = k.meetings.receiptsView({ limit: 20 })
    ok(view && view.ok === true && Array.isArray(view.receipts) && view.receipts.length >= 3,
      '§1 precondition: receiptsView returns a NON-EMPTY list (an every() below is never vacuous)', view && view.count)
    if (Array.isArray(rows) && Array.isArray(view && view.receipts)) {
      for (const f of FIXTURES) {
        const mid = con[f.tag].meeting
        const durable = rows.filter((x) => String(x.meeting) === String(mid))[0]
        const read = view.receipts.filter((x) => String(x.meeting) === String(mid))[0]
        ok(!!durable && !!read, '§1 ' + f.tag + ': the same meeting is readable in BOTH the fold and receiptsView', { mid })
        if (durable && read) {
          ok(sameThree(threeKeys(con[f.tag]), threeKeys(durable), threeKeys(read)),
            '★★ §1 ' + f.tag + ': THREE READINGS are the same three keys — convene receipt / durable state.json row / receiptsView',
            { receipt: threeKeys(con[f.tag]), durable: threeKeys(durable), read: threeKeys(read) })
          ok(str(durable.typeMatchedByMeans) !== null, '§1 ' + f.tag + ': the DURABLE row carries the means sentence (no blank that reads like a value)',
            durable && durable.typeMatchedByMeans)
        }
      }
    }
  }

  // ── §2 OLD ROWS: no keys / the RUN 77 `""` pair read as null + means, and do not throw ───────────────────────
  console.log('=== 2. OLD ROWS are READ tolerantly: null + a sentence, never "" and never a throw ===')
  {
    const { createMeetings } = await import(pathToFileURL(join(VMU, 'kernel', 'meetings.js')).href)
    const t = createMeetings({ clock: () => 1000, settings: { 'vmu.meetings.quorumCap': 0 } })
    const OLD = [
      { at: 900, action: 'open', meeting: 'm3', type: 'closure', typeInput: '', typeMatchedBy: '' },
      { at: 950, action: 'open', meeting: 'm2', type: 'ordinary' },
    ]
    let restored = null
    try {
      restored = t.restore({
        apiVersion: 1, face: 'meetings', v: 1, at: 1000,
        data: { live: JSON.stringify({ __map: [] }), archive: JSON.stringify([]), receipts: JSON.stringify(OLD) },
        counters: { meeting: 9 }, session: { counters: {}, receiptDropped: 0 }, skipped: [],
      })
    } catch (e) {
      ok(false, '§2 restoring a fold with OLD open rows does not throw', { code: e && e.code, message: String(e && e.message) })
    }
    ok(!!restored && restored.ok === true, '§2 restore accepted the old fold', restored && (restored.code || restored.restored))
    const view = t.receiptsView({ limit: 10 })
    ok(view && view.ok === true && Array.isArray(view.receipts) && view.receipts.length === 2,
      '§2 precondition: both OLD rows are readable through receiptsView (this is the RUN 77 m3 path)', view && view.count)
    if (Array.isArray(view && view.receipts) && view.receipts.length > 0) {
      // RUN 270 (RULE E, T1): each `every()` carries its OWN non-empty guard instead of borrowing the enclosing `if`.
      // The enclosing `if` is three lines above the LAST assertion, i.e. outside the scanner's 3-line window, so the
      // fingerprint `vmu-run77-meeting-receipt-type.test.mjs:A:view.receipts` was a NEW vacuous pass. The honest fix is
      // not to baseline it (that registers a known red) and not to widen the window: `every()` on an empty list is TRUE,
      // so the assertion must FAIL when the list is empty - the guard belongs in the assertion it protects.
      ok(view.receipts.length > 0 && view.receipts.every((r) => r.typeInput === null), '★ §2 the RUN 77 `""` pair reads as null — an empty string is NOT a value',
        view.receipts.map((r) => r.typeInput))
      ok(view.receipts.length > 0 && view.receipts.every((r) => r.typeMatchedBy === null), '★ §2 …for the path too', view.receipts.map((r) => r.typeMatchedBy))
      ok(view.receipts.length > 0 && view.receipts.every((r) => str(r.typeMatchedByMeans) !== null && /UNKNOWN \(null\), not as empty|predates RUN 77/.test(r.typeMatchedByMeans)),
        '★ §2 every old row carries the sentence that explains the null (the reader is not left guessing)', view.receipts.map((r) => r.typeMatchedByMeans))
      ok(view.receipts[0].type === 'closure' && view.receipts[1].type === 'ordinary',
        '§2 the resolved `type` of an old row is untouched by the tolerant read', view.receipts.map((r) => r.type))
    }
  }

  // ── §3 INVALID provenance is refused BY NAME (never silently stored) ─────────────────────────────────────────
  console.log('=== 3. INVALID provenance is refused by name ===')
  {
    const { createMeetings } = await import(pathToFileURL(join(VMU, 'kernel', 'meetings.js')).href)
    const mk = () => createMeetings({ clock: () => 1000, settings: { 'vmu.meetings.quorumCap': 0 } })
    const base = { type: 'closure', chair: 'acad', roster: ['acad', 'r-1'], actor: 'acad' }
    const codeOf = (fn) => { try { fn(); return null } catch (e) { return (e && e.code) || 'THREW' } }
    const badPath = codeOf(() => mk().open({ ...base, typeInput: '结题', typeMatchedBy: 'alias-ish' }))
    ok(badPath === 'VMU_INVALID_ARGUMENT', '§3 a `typeMatchedBy` outside id|alias|default is refused by name', badPath)
    const badInput = codeOf(() => mk().open({ ...base, typeInput: 42, typeMatchedBy: 'alias' }))
    ok(badInput === 'VMU_INVALID_ARGUMENT', '§3 a non-string `typeInput` is refused by name (the row stores the caller text, not a re-encoding)', badInput)
  }

  // ── §4 ANTI-LAMP-OFF ×3: one real copy, one mutation each; the symptom must be visible ───────────────────────
  console.log('=== 4. ANTI-LAMP-OFF: three mutations, three symptoms (a real copy boots each) ===')
  {
    const MUTANTS = [
      {
        tag: 'no-projection',
        find: /[\t ]*\.\.\.typeMatch,\r?\n/g,
        replace: '',
      },
      {
        tag: 'alias-as-id',
        find: 'return { typeInput: input, typeMatchedBy: matchedBy,',
        replace: "return { typeInput: input, typeMatchedBy: matchedBy === 'alias' ? 'id' : matchedBy,",
        args: { type: '结题' },
      },
      {
        tag: 'blank-for-absent',
        find: 'const input = (raw !== null && raw.trim() !== \'\') ? raw : null',
        replace: 'const input = raw === null ? \'\' : raw',
        args: {}, // an ABSENT word only exists on the DEFAULT path: no type is passed
      },
    ]
    // THE CRITERION (the same three-way comparison §1 applies to a healthy tree): the three readings must agree.
    const mismatchKeys = (receipt, durable, view) => THREE.filter((k) => !(receipt[k] === durable[k] && durable[k] === view[k]))
    for (const mu of MUTANTS) {
      const root = await mkRoot('vmu-run77-mut-' + mu.tag + '-')
      const copy = join(root, 'vibe-math-vmu')
      cpSync(VMU, copy, { recursive: true })
      const kpath = join(copy, 'kernel', 'meetings.js')
      const before = readFileSync(kpath, 'utf8')
      const after = before.replace(mu.find, mu.replace)
      ok(after !== before, '§4 ' + mu.tag + ': the mutation really changed the copy (a no-op mutant would prove nothing)')
      await writeFile(kpath, after, 'utf8')
      const ws = join(root, 'ws')
      const b = await bootWith(pathToFileURL(join(copy, 'vibe-math-vmu.js')).href, ws)
      await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
      await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
      const r = await call(b, 'vibe_v5_meeting', { agenda: '议程：' + mu.tag, member: 'r-acad', ...(mu.args || {}) })
      ok(r && r.ok === true, '§4 ' + mu.tag + ': the mutated copy still convenes (the symptom, not a crash, is what we read)', r && (r.code || r.message))
      await settle(b.kernel)
      const mid = r && r.meeting
      const durable = mid ? await until(async () => {
        const got = await durableReceipts(ws).catch(() => null)
        if (!Array.isArray(got)) return null
        return got.filter((x) => x && x.action === 'open' && String(x.meeting) === String(mid))[0] || null
      }) : null
      ok(!!durable, '§4 ' + mu.tag + ': precondition — the mutated open row reached the durable fold', mid)
      const view = durable ? (b.kernel.meetings.receiptsView({ limit: 5 }).receipts || []).filter((x) => String(x.meeting) === String(mid))[0] : null
      if (durable) {
        const red = mismatchKeys({ typeInput: r.typeInput, typeMatchedBy: r.typeMatchedBy, type: r.type }, durable, view || {})
        ok(red.length > 0, '★ §4 ' + mu.tag + ' RED LAMP: the three-way criterion FAILS under this one mutation (it names ' + JSON.stringify(red) + ')',
          { red, receipt: threeKeys(r), durable: threeKeys(durable), view: view && threeKeys(view) })
      }
    }
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch {} }
}

console.log('=== VMU RUN77 RECEIPT TYPE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('failures:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exitCode = 1
}
