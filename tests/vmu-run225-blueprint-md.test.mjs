// tests/vmu-run225-blueprint-md.test.mjs — RUN 225-A: the blueprint md file is the truth, the record row is its index.
//
// This suite drives a REAL vmu kernel (packs: ['v5r'], a throwaway root under D:/_tmp/run225) through the public
// tool faces: propose / co-design continuation / adopt write the full blueprint text to <root>/VibeMath/Shared/Protocol.md
// atomically, and stamp the file sha256 onto the index row. It then edits the md from OUTSIDE the kernel to prove the
// read paths disclose `mdChangedSinceIndex` instead of pretending the index is the truth, drives `vibe_vmu_records
// { action: "reindex" }` to reconcile without losing a single historical row, and finally wipes the index rows to
// prove reindex rebuilds them FROM the md (so the md really is the only truth).
//
// Run: node tests/vmu-run225-blueprint-md.test.mjs

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/run225'

const SRC_RECORDS = readFileSync(join(VMU, 'kernel', 'records.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_HOST = readFileSync(join(VMU, 'host.js'), 'utf8')
const BP = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
function has(text, needle, name) {
  ok(typeof text === 'string' && text.indexOf(needle) !== -1, name, { needle })
}
function hasNot(text, needle, name) {
  ok(!(typeof text === 'string' && text.indexOf(needle) !== -1), name, { needle })
}
function shaOf(absPath) {
  return 'sha256:' + createHash('sha256').update(readFileSync(absPath)).digest('hex')
}
function bodyAfterHeading(text) {
  const at = String(text || '').indexOf('## 正文')
  if (at === -1) return null
  return text.slice(at).replace(/^##\s*正文[^\n]*\n?/, '')
}

const R1_TEXT = '# 公共蓝图\n- 命题：前 n 个奇数之和 = n²。\n- 步骤：对 n 归纳，奇数是 n²-(n-1)²。'
const CODESIGN_TEXT = '## 共同设计补充｜r-1\n- 复核归纳步：n=1 时 1=1² 成立。'

async function boot(tag) {
  mkdirSync(TMP, { recursive: true })
  const root = mkdtempSync(join(TMP, 'k-' + tag + '-'))
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
    let raw
    try {
      raw = await spec.execute(args, { kernel: handle.kernel })
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch (e) { return { ok: false, code: 'NON_JSON', raw } }
    }
    return raw
  }
  const records = handle.kernel.records
  const mdAbs = join(root, 'VibeMath', 'Shared', 'Protocol.md')
  return { root, mdAbs, handle, records, specs, specOf, call }
}
const rowsOf = (records, track) => (records.list({ track: track || 'blueprint', limit: 0 }).items || [])

// ── §0 the faces exist in source (so a silent deletion is red here, not only in behaviour) ─────────────────────────
{
  console.log('\n=== §0 the md index face is wired into the three modules ===')
  has(SRC_RECORDS, 'fs-purpose: audit', 'records.js declares why it touches the filesystem')
  has(SRC_RECORDS, 'MD_FORMAT', 'records.js has a declared md format constant')
  has(SRC_RECORDS, 'mdReindex(', 'records.js exposes the md reindex face')
  has(SRC_RECORDS, 'mdRowBodyOf(', 'records.js can rebuild an index row FROM the md doc')
  has(SRC_RECORDS, 'mdFingerprintOf(', 'records.js fingerprints md bytes with sha256')
  has(SRC_BLUEPRINT, 'writeBlueprintMd(', 'blueprint.js writes the md file on adopt')
  // RUN 248-M2: this suite used to pin the ABSENCE of a draft write (`draftMdDeferred(`). That shape is gone: a draft owns
  // its own md, so the same intent — "the draft/documents split is explicit in the source, not implied" — is pinned by
  // naming the path builder and the writer label instead.
  hasNot(SRC_BLUEPRINT, 'draftMdDeferred(', 'blueprint.js no longer defers a draft write to adopt')
  has(SRC_BLUEPRINT, 'blueprintDraftMdPathOf(', 'blueprint.js names the draft md path shape it materializes')
  has(SRC_BLUEPRINT, "'kernel-materialized'", 'blueprint.js names the kernel as the writer of a materialized draft')
  has(SRC_BLUEPRINT, 'blueprintMdReading(', 'blueprint.js reads the md/index agreement')
  has(SRC_BLUEPRINT, "BLUEPRINT_MD_KEY = 'mdFingerprint'", 'blueprint.js names the fingerprint header field')
  has(SRC_BLUEPRINT, 'mdChangedSinceIndex', 'blueprint.js discloses mdChangedSinceIndex')
  hasNot(SRC_BLUEPRINT, 'NOT a filesystem writer', 'blueprint.js no longer claims it has no file face')
  has(SRC_HOST, "action === 'reindex'", 'host.js routes the reindex action')
  has(SRC_HOST, ".concat(['reindex'])", 'host.js lists reindex in the records action enum')
}

// ── §1 propose WRITES the draft md (RUN 248): the draft is a file, the canonical document is still adopt's job ─────
let b
let p1
let p2
let adopted
const DRAFT1 = 'Shared/Drafts/Protocol-r1.md'
{
  console.log('\n=== §1 propose writes the DRAFT md; canonical Protocol.md is still adopt-only ===')
  b = await boot('md')
  const started = await b.call('vibe_v5_start', { problem: '前 n 个奇数之和 = n²，用归纳法验证。', researcherCount: 2 })
  ok(started && started.ok === true, 'the round starts (so the blueprint seats exist)')

  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  p1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: R1_TEXT, materialize: true })
  ok(p1 && p1.ok === true, 'propose returns a receipt', p1)
  ok(p1 && p1.status === 'draft' && p1.revision === 1, 'propose is r1 draft', { revision: p1 && p1.revision, status: p1 && p1.status })
  ok(p1 && p1.md && p1.md.available === true, 'the receipt says the md face IS available (a draft is a document now)')
  ok(p1 && p1.md && p1.md.written === true, 'the md file IS written by the draft')
  ok(p1 && p1.md && p1.md.writtenBy === 'kernel-materialized', 'the receipt names the kernel as the writer', p1 && p1.md && p1.md.writtenBy)
  ok(p1 && p1.md && p1.md.mdPath === DRAFT1, 'the receipt names the draft file it wrote', p1 && p1.md && p1.md.mdPath)
  ok(p1 && p1.draftMdPath === DRAFT1 && p1.mdWritten === true, 'the receipt exposes draftMdPath + mdWritten', { draftMdPath: p1 && p1.draftMdPath, mdWritten: p1 && p1.mdWritten })
  const stDraft = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(stDraft && stDraft.md && stDraft.md.canonicalPath === 'Shared/Protocol.md', 'the reading surface still names the canonical path adoption promotes to', stDraft && stDraft.md)
  has(p1 && p1.md && p1.md.means, '原子', 'the means says the write was atomic')
  has(p1 && p1.md && p1.md.means, 'sha256', 'the means says the row indexes the sha256 of those bytes')
  ok(existsSync(join(b.root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r1.md')) === true, 'the draft md is on disk under Shared/Drafts/')
  ok(existsSync(b.mdAbs) === false, 'canonical <root>/VibeMath/Shared/Protocol.md is still NOT written by propose', { abs: b.mdAbs })
  const row1 = b.records.get({ id: p1.id, includeBody: true })
  has(row1 && row1.body, '- status：draft', 'the index row carries the readable status')
  has(row1 && row1.body, '- revision：1', 'the index row carries the revision')
  has(row1 && row1.body, '## 正文', 'the index row has a text section')
  ok(bodyAfterHeading(row1 && row1.body) === R1_TEXT, 'the index row body IS the proposed text (the row and the file agree)', { got: bodyAfterHeading(row1 && row1.body) })
  has(row1 && row1.body, '- mdPath：' + DRAFT1, 'the unadopted draft CLAIMS its own md file')
  has(row1 && row1.body, '- mdFingerprint：sha256:', 'the draft row indexes the sha256 of that file')
}

// ── §2 co-design continuation REWRITES that same draft file (one revision = one file); canonical stays untouched ───
{
  console.log('\n=== §2 co-design continuation rewrites the SAME draft file, never the canonical one ===')
  // legacy path: the continuation rewrites the kernel-materialized draft only when materialize:true is explicit
  p2 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: CODESIGN_TEXT, materialize: true })
  ok(p2 && p2.ok === true && p2.continued === true, 'the second member continues the r1 draft', p2)
  ok(p2 && p2.revision === 1, 'continuation keeps revision 1 (same draft)', p2 && p2.revision)
  ok(p2 && p2.md && p2.md.written === true && p2.md.mdPath === DRAFT1, 'the continuation REWRITES the same draft md (one revision = one file)', p2 && p2.md)
  ok(p2 && p2.draftMdPath === DRAFT1, 'the continuation keeps the draft file it continues', p2 && p2.draftMdPath)
  ok(existsSync(b.mdAbs) === false, 'the document in force is still untouched on disk')
  const row2 = b.records.get({ id: p2.id, includeBody: true })
  has(row2 && row2.body, '## 共同设计补充｜r-1', 'the row includes the co-design section')
  has(row2 && row2.body, '"member":"r-1"', 'the row authors record the co-design seat')
  has(row2 && row2.body, '"member":"r-acad"', 'the row authors still record the first seat')
  ok(p2.mdChangedSinceIndex === false, 'the writer does not flag a change it just made')
}

// ── §3 adopt writes the adopted text (status current) to the same md file ─────────────────────────────────────────
{
  console.log('\n=== §3 adopt writes status current to the md ===')
  const draftId = (p2 && p2.id) || (p1 && p1.id)
  const draftRow = b.records.get({ id: draftId, includeBody: true })
  const draftBody = bodyAfterHeading(draftRow && draftRow.body)
  adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: draftId, member: 'r-acad', path: 'Shared/Protocol.md' })
  ok(adopted && adopted.ok === true && adopted.action === 'adopt', 'adopt returns an adopt receipt', adopted && adopted.code)
  ok(adopted && adopted.revision === 1 && adopted.status === 'current', 'adopt produces r1 current')
  ok(adopted && adopted.md && adopted.md.available === true, 'the adopt receipt reads the md it just wrote')
  ok(adopted && adopted.md && adopted.md.mdChangedSinceIndex === false, 'the adopt receipt sees its own md as in sync')
  ok(adopted && adopted.mdWrite && adopted.mdWrite.written === true && adopted.mdWrite.atomic === 'temp+rename', 'the adopt receipt also carries the atomic write receipt', adopted && adopted.mdWrite)
  ok(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.wroteNow === true, 'the adopt receipt states the file contract in one line: adopt wrote the document', adopted && adopted.mdIsTheDocumentInForce)
  has(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.means, 'ONE file that counts', 'and it says ONE canonical file counts')
  ok(adopted && adopted.copiedFrom === DRAFT1, 'the receipt names the draft file whose bytes were promoted', { copiedFrom: adopted && adopted.copiedFrom })
  ok(adopted && adopted.alreadyWritten === false, 'the canonical file was written HERE (a member had not pre-written it)')
  const md3 = readFileSync(b.mdAbs, 'utf8')
  ok(md3.indexOf('# 蓝图｜Shared/Protocol.md｜r1｜生效') === 0, 'md title now says the r1 version is in force', md3.slice(0, 60))
  has(md3, '- status：current', 'md status line now says current')
  has(md3, '- adoptedBy：r-acad', 'md records who adopted it')
  has(md3, '- proposalId：' + draftId, 'md records the proposal it came from')
  ok(bodyAfterHeading(md3) === draftBody, 'md text is stable across adopt (byte for byte)', { draft: draftBody, adopted: bodyAfterHeading(md3) })
  has(md3, '- 命题：前 n 个奇数之和 = n²。', 'md keeps the draft body')
  ok(adopted.mdFingerprint === shaOf(b.mdAbs), 'the adopt receipt fingerprint matches the disk bytes', { disk: shaOf(b.mdAbs), receipt: adopted.mdFingerprint })
  ok(adopted.mdChangedSinceIndex === false, 'the writer does not flag a change it just made')
}

// ── §4 blueprint state agrees with the md (the normal, healthy case) ───────────────────────────────────────────────
{
  console.log('\n=== §4 state discloses an md that agrees with the index ===')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(st && st.ok === true, 'state returns ok')
  ok(st && st.hasCurrent === true && st.currentRevision === 1, 'state sees one current r1', { hasCurrent: st && st.hasCurrent })
  ok(st && st.md && st.md.available === true, 'state exposes the md reading')
  ok(st && st.mdChangedSinceIndex === false, 'state says the md did not change since the index')
  ok(st && st.mdFingerprint === shaOf(b.mdAbs), 'state mdFingerprint is the disk sha256')
  ok(st && st.indexFingerprint === st.mdFingerprint, 'state shows md and index fingerprints equal')
  ok(st && st.md.exists === true && st.mdMissing === false, 'state says the md exists')
  has(st && st.md && st.md.means, '一致', 'the means says they agree')
}

// ── §5 the md is edited from OUTSIDE the kernel: reads must disclose, never pretend ────────────────────────────────
let editedFingerprint = null
let staleState = null
{
  console.log('\n=== §5 an external md edit is disclosed by the read paths ===')
  const before = shaOf(b.mdAbs)
  const indexRows = rowsOf(b.records)
  const current = indexRows.filter((r) => r.id === adopted.id)[0] || indexRows[0]
  ok(!!current, 'the index still holds the current row before the external edit')
  writeFileSync(b.mdAbs, readFileSync(b.mdAbs, 'utf8') + '- 外部改动：核对 n=1。\n', 'utf8')
  editedFingerprint = shaOf(b.mdAbs)
  ok(editedFingerprint !== before, 'the external edit really changed the disk bytes')

  staleState = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(staleState && staleState.mdChangedSinceIndex === true, 'state discloses mdChangedSinceIndex: true')
  ok(staleState && staleState.mdFingerprint === editedFingerprint, 'state reports the md fingerprint now on disk')
  ok(staleState && staleState.indexFingerprint !== staleState.mdFingerprint, 'state shows the two fingerprints differ')
  has(staleState && staleState.mdMeans, 'reindex', 'the means points at the reindex action')
  has(staleState && staleState.mdMeans, 'mdFingerprint', 'the means names the fingerprints it compares')

  const direct = BP.readBlueprint({ records: b.records, id: current.id })
  ok(direct && direct.ok === true, 'readBlueprint of the current row still works (index is readable)')
  ok(direct && direct.mdChangedSinceIndex === true, 'read of a single revision also discloses the changed md')
  ok(direct && direct.mdFingerprint === editedFingerprint, 'read reports the disk fingerprint')
  ok(direct && typeof direct.indexFingerprint === 'string' && direct.indexFingerprint !== editedFingerprint, 'read keeps the index fingerprint')
  has(direct && direct.mdMeans, 'reindex', 'read means points at reindex')

  const rowNow = b.records.get({ id: current.id, includeBody: true })
  hasNot(rowNow && rowNow.body, '外部改动：核对 n=1。', 'the INDEX still holds the pre-edit text (md is not silently adopted)')
}

// ── §6 reindex reconciles: new index snapshot, zero history rows lost ─────────────────────────────────────────────
{
  console.log('\n=== §6 reindex reconciles the index to the md without losing history ===')
  const rowsBefore = rowsOf(b.records).length
  const currentId = staleState && staleState.current && staleState.current.id
  const rj = await b.call('vibe_vmu_records', { action: 'reindex' })
  ok(rj && rj.ok === true && rj.action === 'reindex', 'reindex returns a reindex receipt', rj && rj.code)
  ok(rj && rj.available === true, 'reindex finds a workspace root to scan')
  ok(rj && rj.historyKept === true, 'reindex says history is kept')
  ok(rj && rj.scanned >= 1, 'reindex scanned at least the protocol md', { scanned: rj && rj.scanned })
  ok(rj && Array.isArray(rj.adopted) && rj.adopted.length === 0, 'nothing is adopted from an already tracked md')
  ok(rj && Array.isArray(rj.changed) && rj.changed.length >= 1, 'the external edit is reported as changed', rj && rj.changed)
  const ch = rj && rj.changed && rj.changed[0]
  ok(ch && ch.id === currentId, 'the row that changed is the in-force row, not the stale draft', { got: ch && ch.id, want: currentId })
  ok(ch && ch.rowChoice === 'status+revision', 'the row choice is explained (status+revision)', ch && ch.rowChoice)
  ok(ch && ch.mdFingerprint === editedFingerprint, 'the changed item reports the md fingerprint')
  ok(ch && ch.indexFingerprint !== ch.mdFingerprint, 'the changed item reports the old index fingerprint')
  ok(rowsOf(b.records).length === rowsBefore, 'no history row disappeared (row count unchanged)', { before: rowsBefore, after: rowsOf(b.records).length })
  const hist = b.records.history({ id: currentId, limit: 0 })
  ok(hist && hist.count >= 1, 'the superseded body lives on in the row history', hist && hist.count)
  has(JSON.stringify(hist), 'md 被外部改过', 'the history reason names the external md edit')
  const after = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(after && after.mdChangedSinceIndex === false, 'after reindex the state agrees again')
  ok(after && after.mdFingerprint === after.indexFingerprint, 'after reindex md and index fingerprints match')
  ok(after && after.mdFingerprint === shaOf(b.mdAbs), 'after reindex the index carries the disk sha256')
  const rowNow = b.records.get({ id: currentId, includeBody: true })
  ok(String(bodyAfterHeading(rowNow && rowNow.body)).trim() === String(bodyAfterHeading(readFileSync(b.mdAbs, 'utf8'))).trim(), 'the reconciled row body equals the md body', { got: bodyAfterHeading(rowNow && rowNow.body) })
}

// ── §7 the md is the only truth: wipe the index rows, reindex rebuilds them FROM the file ──────────────────────────
{
  console.log('\n=== §7 md is the truth: reindex rebuilds a wiped index ===')
  const wiped = []
  const rowsToWipe = rowsOf(b.records)
  ok(rowsToWipe.length > 0, 'the index HAS rows before the wipe (a loop over nothing proves nothing)', { rows: rowsToWipe.length })
  for (const row of rowsToWipe) {
    const rm = b.records.remove({ id: row.id, reason: 'RUN 225-A test: prove the md alone can rebuild the index', by: 'r-acad' })
    ok(rm && rm.ok === true, 'index row ' + row.id + ' is removed for the rebuild proof')
    wiped.push(row.id)
  }
  ok(rowsOf(b.records).length === 0, 'the blueprint index is empty after the wipe')
  const rj = await b.call('vibe_vmu_records', { action: 'reindex' })
  ok(rj && rj.ok === true, 'reindex runs against an empty index')
  ok(rj && Array.isArray(rj.untracked) && rj.untracked.length >= 1, 'the md file is seen as untracked', rj && rj.untracked)
  ok(rj && Array.isArray(rj.adopted) && rj.adopted.length >= 1, 'reindex adopts the md file into a new index row', rj && rj.adopted)
  const rows = rowsOf(b.records)
  ok(rows.length === 1, 'exactly one row is rebuilt from the file', { rows: rows.map((r) => r.id) })
  const rebuiltRead = rows.length === 1 ? BP.readBlueprint({ records: b.records, id: rows[0].id }) : null
  ok(rebuiltRead && rebuiltRead.ok === true, 'the rebuilt row is a readable blueprint row again')
  ok(rebuiltRead && rebuiltRead.revision === 1, 'the rebuilt row takes its revision from the md', rebuiltRead && rebuiltRead.revision)
  const rebuiltHist = rows.length === 1 ? b.records.history({ id: rows[0].id, limit: 0 }) : null
  ok(rebuiltHist && rebuiltHist.count >= 1, 'the rebuilt row keeps the version history the tombstone carried', rebuiltHist && rebuiltHist.count,
    { wiped })
  const rebuilt = rows.length === 1 ? b.records.get({ id: rows[0].id, includeBody: true }) : null
  const mdNow = readFileSync(b.mdAbs, 'utf8')
  ok(String(bodyAfterHeading(rebuilt && rebuilt.body)).trim() === String(bodyAfterHeading(mdNow)).trim(), 'the rebuilt body is the md text, verbatim', { rebuilt: bodyAfterHeading(rebuilt && rebuilt.body) })
  has(rebuilt && rebuilt.body, '外部改动：核对 n=1。', 'the rebuilt body includes the EXTERNAL edit (md was the truth)')
  has(rebuilt && rebuilt.body, '- mdFingerprint：' + shaOf(b.mdAbs), 'the rebuilt row re-stamps the file sha256')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(st && st.hasCurrent === true, 'state sees a current version after the rebuild')
  ok(st && st.currentRevision === 1, 'state reads revision 1 from the rebuilt row')
  ok(st && st.mdChangedSinceIndex === false, 'the rebuilt index agrees with the md')
}

// ── §8 a new revision: propose r2 + adopt r2 rewrites the md to r2 current ─────────────────────────────────────────
{
  console.log('\n=== §8 a second blueprint round rewrites the md to r2 current ===')
  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const p3a = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: '- r2 补充：偶数情形归约到奇数情形。', materialize: true })
  ok(p3a && p3a.ok === true && p3a.revision === 2 && p3a.status === 'draft', 'propose starts r2 draft', { revision: p3a && p3a.revision })
  // legacy path: the r2 continuation rewrites the kernel-materialized draft only when materialize:true is explicit
  const p3 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: '## 共同设计补充｜r-1\n- r2 复核：n=2 时 4=2²。', materialize: true })
  ok(p3 && p3.ok === true && p3.continued === true, 'the co-design seat joins the r2 draft too')
  ok(p3a && p3a.md && p3a.md.written === true && p3a.md.mdPath === 'Shared/Drafts/Protocol-r2.md', 'the r2 draft writes ITS OWN file (a new revision is a new file)', p3a && p3a.md)
  ok(existsSync(join(b.root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r2.md')) === true, 'the r2 draft md sits beside the r1 one on disk')
  const mdDraft = readFileSync(b.mdAbs, 'utf8')
  ok(mdDraft.indexOf('# 蓝图｜Shared/Protocol.md｜r1｜生效') === 0, 'the document in force still says r1 (an unadopted draft did not touch it)', mdDraft.slice(0, 60))
  hasNot(mdDraft, 'r2 补充：偶数情形归约到奇数情形。', 'the r2 draft text is NOT in the document in force')
  const ad2 = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p3.id, member: 'r-acad', path: 'Shared/Protocol.md' })
  if (ad2 && ad2.ok !== true) console.log('  adopt(r2) receipt :: ' + JSON.stringify(ad2).slice(0, 600))
  ok(ad2 && ad2.ok === true && ad2.revision === 2 && ad2.status === 'current', 'adopt makes r2 current', { revision: ad2 && ad2.revision })
  const mdR2 = readFileSync(b.mdAbs, 'utf8')
  ok(mdR2.indexOf('# 蓝图｜Shared/Protocol.md｜r2｜生效') === 0, 'md title says r2 is in force', mdR2.slice(0, 60))
  has(mdR2, '- status：current', 'md keeps the current status line')
  has(mdR2, '- revision：2', 'md carries the new revision')
  ok(ad2.mdFingerprint === shaOf(b.mdAbs), 'the r2 receipt fingerprint matches the disk bytes')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(st && st.currentRevision === 2, 'state sees r2 in force')
  ok(st && st.mdChangedSinceIndex === false, 'after the r2 adopt the md agrees with the index')
  const revisionsOnDisk = rowsOf(b.records).map((r) => BP.readBlueprint({ records: b.records, id: r.id }).revision)
  ok(revisionsOnDisk.indexOf(1) !== -1 && revisionsOnDisk.indexOf(2) !== -1, 'the index still carries r1 and r2 rows (r1 kept as history)', { revisionOnDisk: revisionsOnDisk })
}

// ── §9 a missing md is a named report, never a silent row deletion ─────────────────────────────────────────────────
{
  console.log('\n=== §9 a deleted md is reported by name, rows are kept ===')
  const rowsBefore = rowsOf(b.records).length
  unlinkSync(b.mdAbs)
  const rj = await b.call('vibe_vmu_records', { action: 'reindex' })
  ok(rj && rj.ok === true, 'reindex runs with the md gone')
  ok(rj && Array.isArray(rj.missing) && rj.missing.length === 1, 'the missing md is reported once', rj && rj.missing)
  const miss = rj && rj.missing && rj.missing[0]
  ok(miss && miss.path === 'Shared/Protocol.md', 'the missing item names the path')
  ok(miss && Array.isArray(miss.ids) && miss.ids.length >= 1, 'the missing item names the index rows that point at it', miss && miss.ids)
  ok(miss && typeof miss.means === 'string' && miss.means.length > 0, 'the missing item carries a means')
  ok(rowsOf(b.records).length === rowsBefore, 'a missing md NEVER deletes index rows', { before: rowsBefore, after: rowsOf(b.records).length })
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(st && st.md && st.md.exists === false, 'state reports the md does not exist')
  ok(st && st.mdMissing === true, 'state flags mdMissing')
  ok(st && st.mdChangedSinceIndex === false, 'absent md is not a change of content (no false alarm)')
  const rows = rowsOf(b.records)
  const direct = BP.readBlueprint({ records: b.records, id: rows[0].id })
  ok(direct && direct.ok === true, 'the index row is still readable while the md is gone')
  has(direct && direct.mdMeans, 'missing', 'read means says the md is missing')
}

// ── §10 an untracked md is adopted by reindex; dryRun reports without writing ──────────────────────────────────────
{
  console.log('\n=== §10 an untracked md is adopted, and dryRun writes nothing ===')
  const orphanAbs = join(b.root, 'VibeMath', 'Shared', 'Orphan.md')
  writeFileSync(orphanAbs, [
    '# 蓝图｜Shared/Orphan.md｜r1｜生效',
    '- vmuMd：vmu-md/1',
    '- track：blueprint',
    '- kind：blueprint',
    '- title：蓝图｜Shared/Orphan.md｜r1｜生效',
    '- path：Shared/Orphan.md',
    '- status：current',
    '- revision：1',
    '## 正文',
    '# 孤儿蓝图',
    '- 只存在于磁盘上的正文。',
  ].join('\n'), 'utf8')
  const rowsBefore = rowsOf(b.records).length
  const dry = await b.call('vibe_vmu_records', { action: 'reindex', dryRun: true })
  ok(dry && dry.ok === true && dry.dryRun === true, 'dryRun reindex runs', dry && dry.code)
  ok(dry && Array.isArray(dry.untracked) && dry.untracked.length >= 1, 'dryRun reports the untracked md', dry && dry.untracked)
  ok(dry && dry.untracked.some((u) => u.path === 'Shared/Orphan.md'), 'dryRun names the untracked path')
  ok(dry && Array.isArray(dry.adopted) && dry.adopted.length === 0, 'dryRun adopts nothing')
  ok(rowsOf(b.records).length === rowsBefore, 'dryRun writes no row')
  const real = await b.call('vibe_vmu_records', { action: 'reindex' })
  ok(real && Array.isArray(real.adopted) && real.adopted.some((a) => a.path === 'Shared/Orphan.md'), 'the real reindex adopts the untracked md', real && real.adopted)
  const rows = rowsOf(b.records)
  ok(rows.length === rowsBefore + 1, 'exactly one row is created for the untracked md', { before: rowsBefore, after: rows.length })
  const adoptedRow = rows.filter((r) => r.title && String(r.title).indexOf('Orphan.md') !== -1)[0]
  ok(!!adoptedRow, 'the adopted row is titled from the md')
  if (adoptedRow) {
    const got = b.records.get({ id: adoptedRow.id, includeBody: true })
    has(got && got.body, '只存在于磁盘上的正文。', 'the adopted row body is the md text')
    has(got && got.body, '- mdFingerprint：' + shaOf(orphanAbs), 'the adopted row stamps the orphan md sha256')
  }
}

// ── summary ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== RUN 225-A blueprint md: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES: ' + JSON.stringify(failures, null, 2))
  process.exitCode = 1
}

function existsSyncAbs(p) {
  try {
    readFileSync(p)
    return true
  } catch (e) {
    return false
  }
}
