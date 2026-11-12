// tests/vmu-run78-meeting-provenance.test.mjs — RUN 78 / TB-2731 (FEEDBACK78 D2 + D3).
//
// THE TWO DEFECTS THIS PINS (measured on the real machine, `${__tmpRoot()}/slv-phase5/slvp258-ws`):
//
//   D2 — the DURABLE MEETING ROW stored only the RESOLVED type id. TB-2726 had already put `typeInput`/`typeMatchedBy`
//        on the receipt ring, but the meeting row itself (`state.json` → keys.meetings.value.data.live) carried
//        `type:"closure"` and nothing about the word the caller typed. So a replay could not answer "was this meeting
//        opened with an alias?" — the provenance lived only in the receipt and the chair's transcript.
//
//   D3 — `kernel.meetings.receiptsView()` had NO tool face. `vibe_v5_meeting` had exactly ONE read (rulings) and
//        `vibe_vmu_meeting`'s action set did not carry it, so the real run had to record NO-EVIDENCE for a reading
//        that existed in the kernel: a service with no face is a service nobody can call.
//
// WHAT THIS SUITE PROVES:
//   ① the SOURCE: openSeq writes both keys into the DURABLE row; one projection (`typeProvenanceOf`) is spread on BOTH
//      read faces; the pack forwards the read through its own action vocabulary (validator + handler + parameters);
//   ② THREE FIXTURES (Chinese alias / English id / omitted type) × THREE READINGS (convene receipt / durable meeting
//      row / TOOL-FACE receiptsView) are the SAME three keys — the third reading goes through a registered tool spec,
//      never through the kernel service;
//   ③ the read faces (`summary` and the status `meetingView`) carry the same provenance and the same sentence;
//   ④ a LEGACY row (same snapshot, two keys deleted) rehydrates without throwing and reads null + `typeMatchMeans`;
//   ⑤ `limit` is bounded and refused BY NAME outside 1..200;
//   ⑥ ANTI-LAMP-OFF ×2: (a) the durable row stops carrying the two keys ⇒ the three-way criterion is red; (b) the
//      tool action is removed ⇒ the tool-face reading fails by name (the CORE criterion cannot pass without the face).
//
// WHAT IT DOES NOT PROVE: that a model passes `type:"结题"` (that is `vmu-run76-meeting-type-aliases`); it does not
// migrate old rows — they are READ tolerantly, which is all a durable fold can honestly do.

// fs-purpose: copy the entry tree twice so each mutation boots real modules without touching the working tree
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

// the DURABLE MEETING ROW: state.json → keys.meetings.value.data.live (a Map serialised as {__map:[[id,row],…]})
const liveRows = (data) => {
  if (!data || typeof data.live !== 'string') return []
  try {
    const live = JSON.parse(data.live)
    return Array.isArray(live && live.__map) ? live.__map : []
  } catch { return [] }
}
const durableMeeting = async (root, mid) => {
  const raw = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  const data = raw && raw.keys && raw.keys.meetings && raw.keys.meetings.value && raw.keys.meetings.value.data
  const hit = liveRows(data).find((pair) => Array.isArray(pair) && String(pair[0]) === String(mid))
  return hit ? hit[1] : null
}
const THREE = ['type', 'typeInput', 'typeMatchedBy']
const threeKeys = (row) => ({ type: row && row.type, typeInput: row && row.typeInput === undefined ? '<absent>' : row.typeInput, typeMatchedBy: row && row.typeMatchedBy === undefined ? '<absent>' : row.typeMatchedBy })
const mismatch = (a, b, c) => THREE.filter((k) => !(a[k] === b[k] && b[k] === c[k]))

// the TOOL-FACE reading: a registered spec, never `kernel.meetings.receiptsView`
const toolRing = async (b, limit = 20) => {
  const r = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit })
  if (!r || r.ok !== true) return { tool: r, row: null }
  const rows = Array.isArray(r.receipts) ? r.receipts : []
  return { tool: r, row: (mid) => rows.filter((x) => x && x.action === 'open' && String(x.meeting) === String(mid))[0] || null }
}

try {
  // ── §0 THE SOURCE ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 0. SOURCE: durable row keys, one projection, two read faces, one tool action ===')
  {
    ok(/typeInput: typeMatch\.typeInput, typeMatchedBy: typeMatch\.typeMatchedBy,/.test(KERNEL_SRC),
      '★ D2: the DURABLE meeting row is built with the same `typeMatch` projection the receipt carries')
    ok(/function typeProvenanceOf\(m\)/.test(KERNEL_SRC), 'D2: one read projection exists by name (`typeProvenanceOf`)')
    const spreads = (KERNEL_SRC.match(/\.\.\.typeProvenanceOf\(m\),/g) || []).length
    ok(spreads === 2, '★ D2: the projection is spread on BOTH read faces (summary + meetingView) and nowhere else', { spreads })
    ok(/TYPE_ROW_LEGACY_MEANS/.test(KERNEL_SRC) && /typeMatchMeans/.test(KERNEL_SRC),
      'D2: a legacy row reads null + the named `typeMatchMeans` sentence')
    ok(/if \(String\(actionName\) === 'receiptsView'\) return toolMeetingReceiptsView\(args, \{ kernel \}\)/.test(PACK_SRC),
      '★ D3: the pack face dispatches `receiptsView` to its own handler (the kernel service is not the face)')
    ok(/if \(String\(word\) === 'receiptsView'\) return null/.test(PACK_SRC),
      '★ D3: the validator that runs BEFORE the handler also knows the word (a read the handler knows but the funnel refuses is unreachable)')
    ok(/function toolMeetingReceiptsView\(args = \{\}, \{ kernel \} = \{\}\)/.test(PACK_SRC), 'D3: the handler exists by name')
    ok(/limit: \{ type: 'integer' \}/.test(PACK_SRC), 'D3: `limit` is a declared parameter of the tool')
    ok(/`action:"receiptsView"` READS the kernel/.test(PACK_SRC), 'D3: the tool description names the read (so tool_help prints it)')
  }

  // ── §1 THREE FIXTURES × THREE READINGS ─────────────────────────────────────────────────────────────────────
  console.log('=== 1. THREE FIXTURES: receipt / durable meeting row / TOOL-FACE receiptsView ===')
  {
    const root = await mkRoot('vmu-run78-3way-')
    const b = await bootWith(ENTRY, root)
    const k = b.kernel
    await k.members.hire({ id: 'r-acad', slot: 'chair' })
    await k.members.hire({ id: 'r-1', slot: 'member' })

    const FIXTURES = [
      { tag: 'alias', args: { type: '结题' }, want: { type: 'closure', typeInput: '结题', typeMatchedBy: 'alias' } },
      { tag: 'id', args: { type: 'closure' }, want: { type: 'closure', typeInput: 'closure', typeMatchedBy: 'id' } },
      { tag: 'default', args: {}, want: { type: 'ordinary', typeInput: null, typeMatchedBy: 'default' } },
    ]
    const mids = {}
    for (const f of FIXTURES) {
      const r = await call(b, 'vibe_v5_meeting', { agenda: '议程：' + f.tag, member: 'r-acad', ...f.args })
      ok(r && r.ok === true, '§1 ' + f.tag + ': the chair convenes', r && (r.code || r.message))
      const mid = r && r.meeting
      mids[f.tag] = mid
      ok(str(mid) !== null, '§1 ' + f.tag + ': the receipt names the meeting', mid)
      const got = threeKeys(r)
      ok(got.type === f.want.type && got.typeInput === f.want.typeInput && got.typeMatchedBy === f.want.typeMatchedBy,
        '§1 ' + f.tag + ': the convene receipt carries the caller provenance', { got, want: f.want })
    }

    await settle(k)
    const ring = await toolRing(b, 20)
    ok(ring.tool && ring.tool.ok === true, '§1 ★ D3: the TOOL FACE answers `action:"receiptsView"` (no kernel call)', ring.tool && (ring.tool.code || ring.tool.message))
    ok(ring.tool && ring.tool.action === 'receiptsView' && ring.tool.tool === 'vibe_v5_meeting', '§1 the receipt says which face and which action answered', ring.tool && { tool: ring.tool.tool, action: ring.tool.action })
    ok(ring.tool && Array.isArray(ring.tool.receipts) && ring.tool.count === ring.tool.receipts.length, '§1 the ring read carries `receipts`/`count` honestly', ring.tool && { count: ring.tool.count })
    ok(ring.tool && Number.isInteger(ring.tool.available) && typeof ring.tool.receiptRingMeans === 'string', '§1 …plus `available` and the means sentence', ring.tool && { available: ring.tool.available })

    for (const f of FIXTURES) {
      const mid = mids[f.tag]
      const durable = mid ? await until(async () => durableMeeting(root, mid).catch(() => null)) : null
      ok(!!durable, '§1 ★ D2 ' + f.tag + ': the DURABLE meeting row reached state.json', mid)
      if (!durable) continue
      const viaTool = ring.row ? ring.row(mid) : null
      ok(!!viaTool, '§1 ★ D3 ' + f.tag + ': the TOOL-FACE ring carries this open row', mid)
      if (!viaTool) continue
      const receipt = threeKeys({ type: f.want.type, typeInput: f.want.typeInput, typeMatchedBy: f.want.typeMatchedBy })
      const red = mismatch(receipt, threeKeys(durable), threeKeys(viaTool))
      ok(red.length === 0, '★ §1 ' + f.tag + ': THREE readings agree on ' + JSON.stringify(THREE) + ' (red: ' + JSON.stringify(red) + ')',
        { receipt, durable: threeKeys(durable), tool: threeKeys(viaTool) })
      ok(durable.typeInput === f.want.typeInput && durable.typeMatchedBy === f.want.typeMatchedBy,
        '★ §1 ' + f.tag + ': the DURABLE row itself stores the input word + path (not only the resolved id)', threeKeys(durable))
      // the two read faces carry the same provenance and the same sentence
      const sum = k.meetings.summary({ meeting: mid })
      const view = k.meetings.meetingView({ meeting: mid })
      ok(sum.typeInput === f.want.typeInput && sum.typeMatchedBy === f.want.typeMatchedBy,
        '§1 ' + f.tag + ': summary() reads the provenance off the row', { typeInput: sum.typeInput, typeMatchedBy: sum.typeMatchedBy })
      ok(view.typeInput === f.want.typeInput && view.typeMatchedBy === f.want.typeMatchedBy,
        '§1 ' + f.tag + ': the status view reads the SAME provenance', { typeInput: view.typeInput, typeMatchedBy: view.typeMatchedBy })
      ok(str(sum.typeMatchMeans) !== null && sum.typeMatchMeans === view.typeMatchMeans,
        '§1 ' + f.tag + ': both faces print ONE sentence (one projection, one wording)', { sum: sum.typeMatchMeans, view: view.typeMatchMeans })
    }
  }

  // ── §2 LEGACY ROW: two keys deleted from the snapshot — reads null + means, does not throw ───────────────────
  console.log('=== 2. LEGACY ROW (rehydrate): null + typeMatchMeans, never a throw and never a guess ===')
  {
    const rootA = await mkRoot('vmu-run78-legacy-a-')
    const a = await bootWith(ENTRY, rootA)
    await a.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    const r = await call(a, 'vibe_v5_meeting', { agenda: '议程：legacy', member: 'r-acad', type: '结题' })
    const mid = r && r.meeting
    ok(r && r.ok === true && str(mid) !== null, '§2 precondition: a meeting was convened through the alias', r && (r.code || r.message))
    await settle(a.kernel)
    const snap = a.kernel.meetings.snapshot()
    const data = JSON.parse(JSON.stringify(snap.data))
    const live = JSON.parse(data.live)
    const pair = (Array.isArray(live.__map) ? live.__map : []).find((p) => String(p[0]) === String(mid))
    ok(!!pair, '§2 precondition: the snapshot holds the live row', mid)
    if (pair) {
      delete pair[1].typeInput
      delete pair[1].typeMatchedBy
    }
    data.live = JSON.stringify(live)

    const rootB = await mkRoot('vmu-run78-legacy-b-')
    const b = await bootWith(ENTRY, rootB)
    const restored = b.kernel.meetings.restoreReload({ face: 'meetings', v: 1, data })
    ok(restored && restored.ok === true, '§2 the legacy snapshot rehydrates (old rows are tolerated by the fold)', restored && (restored.code || restored.message))
    const sum = b.kernel.meetings.summary({ meeting: mid })
    const view = b.kernel.meetings.meetingView({ meeting: mid })
    ok(sum.typeInput === null && sum.typeMatchedBy === null, '§2 ★ the legacy row reads null for BOTH keys (not "" and not a guess)', { typeInput: sum.typeInput, typeMatchedBy: sum.typeMatchedBy })
    ok(view.typeInput === null && view.typeMatchedBy === null, '§2 …on the status view too', { typeInput: view.typeInput, typeMatchedBy: view.typeMatchedBy })
    ok(str(view.typeMatchMeans) !== null && /BEFORE RUN 78/.test(String(view.typeMatchMeans)), '§2 ★ a named sentence says why they are null (the row predates the fold)', view.typeMatchMeans)
    ok(view.type === 'closure' && sum.type === 'closure', '§2 the resolved `type` of the legacy row is untouched', { summary: sum.type, view: view.type })
  }

  // ── §3 limit is bounded and refused BY NAME outside 1..200 ──────────────────────────────────────────────────
  console.log('=== 3. `limit` is bounded; out-of-range is refused by name (never clamped) ===')
  {
    const root = await mkRoot('vmu-run78-limit-')
    const b = await bootWith(ENTRY, root)
    await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    await call(b, 'vibe_v5_meeting', { agenda: '议程：limit', member: 'r-acad', type: 'closure' })
    const zero = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 0 })
    ok(zero && zero.ok === false && zero.code === 'VMU_INVALID_ARGUMENT', '§3 limit 0 is refused by name (a clamp would answer a different question)', zero && (zero.code || zero.message))
    const big = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 500 })
    ok(big && big.ok === false && big.code === 'VMU_INVALID_ARGUMENT', '§3 limit 500 is refused by name (the ring holds at most 200)', big && (big.code || big.message))
    const one = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 1 })
    ok(one && one.ok === true && one.receipts.length <= 1 && one.count <= 1, '§3 limit 1 returns at most one row (the bound is real)', one && { count: one.count })
    ok(str(one && one.hint) === null, '§3 an honest read needs no hint', one && one.hint)
  }

  // ── §4 ANTI-LAMP-OFF ×2: one real copy, one mutation each; the symptom must be visible ───────────────────────
  console.log('=== 4. ANTI-LAMP-OFF: two mutations (durable row / tool action), two symptoms ===')
  {
    // (a) the durable row stops carrying the two keys — the three-way criterion must go red on the durable reading
    {
      const root = await mkRoot('vmu-run78-mut-row-')
      const copy = join(root, 'vibe-math-vmu')
      cpSync(VMU, copy, { recursive: true })
      const kpath = join(copy, 'kernel', 'meetings.js')
      const before = readFileSync(kpath, 'utf8')
      const after = before.replace(/typeInput: typeMatch\.typeInput, typeMatchedBy: typeMatch\.typeMatchedBy,/, '')
      ok(after !== before, '§4 row: the mutation really changed the copy (a no-op mutant would prove nothing)')
      await writeFile(kpath, after, 'utf8')
      const ws = join(root, 'ws')
      const b = await bootWith(pathToFileURL(join(copy, 'vibe-math-vmu.js')).href, ws)
      await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
      const r = await call(b, 'vibe_v5_meeting', { agenda: '议程：mut-row', member: 'r-acad', type: '结题' })
      ok(r && r.ok === true, '§4 row: the mutated copy still convenes (the symptom, not a crash, is what we read)', r && (r.code || r.message))
      await settle(b.kernel)
      const mid = r && r.meeting
      const durable = mid ? await until(async () => durableMeeting(ws, mid).catch(() => null)) : null
      ok(!!durable, '§4 row: precondition — the mutated meeting row reached the durable fold', mid)
      if (durable) {
        const ring = await toolRing(b, 20)
        const viaTool = ring.row && mid ? ring.row(mid) : null
        ok(durable.typeInput === undefined || durable.typeInput !== '结题',
          '★ §4 row RED LAMP: with the write removed the DURABLE row no longer stores the input word', threeKeys(durable))
        const red = mismatch(threeKeys({ type: 'closure', typeInput: '结题', typeMatchedBy: 'alias' }), threeKeys(durable), threeKeys(viaTool || {}))
        ok(red.length > 0, '★ §4 row RED LAMP: the three-way criterion FAILS (names ' + JSON.stringify(red) + ')', { red })
      }
    }
    // (b) the tool action is removed — the core reading cannot pass without a FACE
    {
      const root = await mkRoot('vmu-run78-mut-face-')
      const copy = join(root, 'vibe-math-vmu')
      cpSync(VMU, copy, { recursive: true })
      const ppath = join(copy, 'packs', 'v5r', 'tools.js')
      const before = readFileSync(ppath, 'utf8')
      const after = before.replace(/[\t ]*if \(String\(actionName\) === 'receiptsView'\) return toolMeetingReceiptsView\(args, \{ kernel \}\)\r?\n/, '')
      ok(after !== before, '§4 face: the mutation really changed the copy')
      await writeFile(ppath, after, 'utf8')
      const ws = join(root, 'ws')
      const b = await bootWith(pathToFileURL(join(copy, 'vibe-math-vmu.js')).href, ws)
      await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
      await call(b, 'vibe_v5_meeting', { agenda: '议程：mut-face', member: 'r-acad', type: 'closure' })
      const read = await call(b, 'vibe_v5_meeting', { action: 'receiptsView', limit: 5 })
      ok(read && read.ok === false, '★ §4 face RED LAMP: without the dispatch the tool face cannot read the ring (the kernel still can, which is exactly the defect)', read && { code: read.code, message: read.message })
      const viewed = (() => { try { return b.kernel.meetings.receiptsView({ limit: 5 }) } catch { return null } })()
      ok(viewed && viewed.ok === true && viewed.receipts.length > 0, '§4 face: the KERNEL service still answers — so only the FACE was lost (a service with no face is NO-EVIDENCE in a real run)', viewed && viewed.count)
    }
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch {} }
}

console.log('=== VMU RUN78 MEETING PROVENANCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('failures:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exitCode = 1
}
