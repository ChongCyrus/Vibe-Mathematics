// tests/vmu-run255-md-ownership.test.mjs — RUN 255 / TB-2613: WHO OWNS A BLUEPRINT DRAFT MD, AND HOW A READER TELLS.
//
// The user ruling (2026-11-06) made the draft md the seat's own file. RUN 248 taught the kernel to read one; RUN 255
// changes the DEFAULT (fs-first: a propose without mdPath writes NOTHING) and adds the evidence a reader needs to tell
// WHO wrote the file it is looking at. This suite is the criterion for that evidence, and every reading here is
// taken in a way the implementation cannot satisfy by accident:
//
//   §0  source pins: the three writer names, the two provenance keys, and the always-both receipt keys exist in the
//       files that own them (so §1-§7 cannot pass by asserting a value the code comment only claims);
//   §1  DEFAULT propose (no mdPath, no materialize) ⇒ {ok:true, filed:false, draftMdMissing:true, id:null}, NO new
//       file under Shared/Drafts/ (real directory snapshot before/after), NO index row — the migration contract;
//   §2  a member-written draft md (fs, plain markdown) ⇒ mdOwner.writtenBy:"member-file"; the sha256/bytes are the
//       ones THIS TEST recomputes from the bytes it wrote, and the kernel did NOT rewrite the file;
//   §3  an explicit materialize:true draft ⇒ mdOwner.writtenBy:"kernel-materialized", file appears, same sha rule;
//   §4  a file on disk with no row provenance ⇒ mdOwner.writtenBy:"fs-untracked", atSource:"disk-only";
//   §5  RECEIPT SYMMETRY (sim-lane mainline, m03982): `filed` and `draftMdMissing` are present in BOTH states — the
//       success receipt used to omit `filed`, so the two states could not be told apart by the same key;
//   §6  the office aggregate `mdOwnedBySeats` is recomputed HERE from the receipts, not trusted;
//   §7  the card/blueprint read faces carry mdOwner, and a card naming no md answers null (named absence, not {}).
//
// Run: node tests/vmu-run255-md-ownership.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { requireDir } from './_lib/require-file.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const VMU = join(ROOT, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const BP_PATH = join(VMU, 'packs', 'v5r', 'blueprint.js')
const TOOLS_PATH = join(VMU, 'packs', 'v5r', 'tools.js')
const BP_SRC = readFileSync(BP_PATH, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS_PATH, 'utf8')
const BP = await import(pathToFileURL(BP_PATH).href)

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
}
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — found (must be gone): ' + needle)
const hasOwn = (obj, key, msg) => ok(obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key), msg, obj)

// The INDEPENDENT reading of a file: the test reads the bytes itself and hashes them. Copying the receipt value would
// make this suite a mirror of the implementation instead of a criterion for it.
const shaOf = (absPath) => 'sha256:' + createHash('sha256').update(readFileSync(absPath)).digest('hex')
const bytesOf = (absPath) => readFileSync(absPath).length

const TMP = mkdtempSync(join(tmpdir(), 'vmu-run255-'))
const WS = join(TMP, 'VibeMath')
const DRAFTS = join(WS, 'Shared', 'Drafts')
const draftAbs = (stem, revision) => join(DRAFTS, stem + '-r' + String(revision) + '.md')
// ★ T1 (audit-no-silent-reads `ternary-readdir-empty`): this used to be `existsSync(DRAFTS) ? readdirSync(DRAFTS) : []`,
// which turned a moved or renamed Shared/Drafts into an EMPTY list, so §1l compared [] to [] and stayed green. Now the
// directory is enumerated through requireDir (a named refusal saying which directory, and why), so a wrong path fails
// loudly. The ABSENT directory is still legitimate: §1 runs before any draft has ever been filed, and "no Shared/Drafts
// yet" is exactly the state that section asserts — the moment the directory exists it must be listable or the suite dies.
const listDrafts = () => (existsSync(DRAFTS) ? requireDir(DRAFTS, 'Shared/Drafts holds the draft files this suite snapshots (§1/§3)').sort() : [])

async function boot(rootDir = TMP) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: rootDir })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_FACE', name }
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, call, kernel: handle.kernel, records: handle.kernel.records, specs }
}

const b = await boot()
await b.kernel.members.hire({ id: 'acad-01', slot: 'chair', institution: 'sim' })
await b.kernel.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })

const PROTO = 'Shared/Protocol.md'
const R1_TEXT = '# 公共蓝图 r1\n- 命题：前 n 个奇数之和 = n²。'
const MEMBER_TEXT = '# 我的草案（成员自己用 fs 写）\n\n- 命题：前 n 个奇数之和 = n²。\n- 路线：对 n 归纳。\n'

test('§0 a REAL call comes FIRST: the receipt shape is MEASURED, then the source that must keep it is pinned', async () => {
  // ★★★ RUN 255 rev3 (Lead P1-5, MEASURED): a source-string pin can be satisfied by an identifier sitting in dead code,
  // so it alone would be a weak criterion. The behaviour is measured first — on a throwaway kernel with its own root, so
  // this warm-up cannot disturb the §1 directory/row snapshots — and the pins below then say WHERE those measured facts
  // live (so a later edit cannot move them out from under the behaviour).
  const WARM = mkdtempSync(join(tmpdir(), 'vmu-run255-warm-'))
  try {
    const w = await boot(WARM)
    await w.kernel.members.hire({ id: 'acad-01', slot: 'chair', institution: 'sim' })
    const unfiled = await w.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Warmup.md', member: 'acad-01', text: 'warm-up: no mdPath, no materialize' })
    hasOwn(unfiled, 'filed', '§0a ★★★ MEASURED: the unfiled receipt carries `filed`')
    hasOwn(unfiled, 'draftMdMissing', '§0b ★★★ ...and `draftMdMissing` (a named absence, not undefined)')
    eq(unfiled.filed, false, '§0c MEASURED: nothing was filed')
    eq(unfiled.draftMdMissing, true, '§0d MEASURED: the one missing thing is the draft md')
    hasOwn(unfiled, 'headingDropped', '§0e ★★★ MEASURED (Lead P0-3): the unfiled receipt has the SAME keys as the filed one')
    eq(unfiled.headingDropped, null, '§0f ...headingDropped is a named null, not undefined')
    eq(unfiled.bodyPrefixDropped, null, '§0g ...and bodyPrefixDropped is a named null too')
    hasOwn(unfiled, 'verified', '§0h ...verified is present (null: there was no row to verify)')
    const filed = await w.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Warmup.md', member: 'acad-01', text: 'warm-up: explicit materialize', materialize: true })
    eq(filed.filed, true, '§0i ★★★ MEASURED: the success receipt carries filed===true')
    eq(filed.draftMdMissing, false, '§0j ★★★ ...and draftMdMissing===false in the SAME key set')
    eq(filed.headingDropped, 0, '§0k MEASURED: the success path reports a COUNT here, not null')
    eq(typeof filed.verified, 'object', '§0l MEASURED: the row-versus-file check actually ran on the success path')
    // ── the pins: same facts, located in the source that owns them ──────────────────────────────────────────────────
    has(BP_SRC, "BLUEPRINT_MD_BY_KEY = 'mdWrittenBy'", '§0m the row key that names the writer exists')
    has(BP_SRC, "BLUEPRINT_MD_IN_TURN_KEY = 'mdWroteInOwnTurn'", '§0n the row key that says "own turn" exists')
    has(BP_SRC, "'member-file'", '§0o the member-file writer is named')
    // Entry 2 of the P1-9 replacement (RUN 259 / TB-2655): the writer name is asserted on the MEASURED receipt, not on a
    // source string — a literal sitting in dead code could satisfy the pin while the face stopped naming the writer.
    eq(filed.writtenBy, 'kernel-materialized', '§0p MEASURED: the explicit-materialize receipt NAMES the kernel writer', filed && filed.writtenBy)
    has(BP_SRC, "'fs-untracked'", '§0q the fs-untracked writer is named')
    has(BP_SRC, 'export function mdOwnerOf(', '§0r the provenance reader is ONE exported function')
    has(BP_SRC, 'export function blueprintMdProvenanceOf(', '§0s the row-provenance reader is exported too')
    has(BP_SRC, 'atSource', '§0t the receipt says WHERE the ownership fact came from')
    ok(BP_SRC.split('filed: true').length - 1 >= 2, '§0u ★★★ receipt symmetry: BOTH success paths carry filed:true', BP_SRC.split('filed: true').length - 1)
    ok(BP_SRC.split('draftMdMissing: true').length - 1 >= 2, '§0v ★★★ ...and both unfiled paths carry draftMdMissing:true', BP_SRC.split('draftMdMissing: true').length - 1)
    has(BP_SRC, 'draftMdMissing: false', '§0w ...and the success paths carry draftMdMissing:false')
    has(TOOLS_SRC, 'function mdOwnedBySeatsOf(', '§0x the office aggregate is ONE helper')
    ok(TOOLS_SRC.split('mdOwnedBySeatsOf(').length - 1 >= 2, '§0y ...called by the overview face', TOOLS_SRC.split('mdOwnedBySeatsOf(').length - 1)
    has(TOOLS_SRC, 'function cardMdOwnerOf(', '§0z the card read face has ONE md ownership reader')
    has(TOOLS_SRC, 'mdOwner: cardOwner', '§0aa ...and the decorate carries it under its own name')
    // Entry 3 of the P1-9 replacement: the legacy switch is asserted by BEHAVIOUR — same face, same path shape, one call
    // without the switch (writes nothing, §0c/§0d above) and one with it (files the draft). No source literal involved.
    ok(filed.filed === true && String(filed.mdPath || '').indexOf('Shared/Drafts/') === 0,
      '§0ab MEASURED: materialize:true is still honoured — the same face files a draft under Shared/Drafts/',
      { filed: filed && filed.filed, mdPath: filed && filed.mdPath })
  } finally {
    rmSync(WARM, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('§1 DEFAULT propose writes NOTHING — no file, no row — and says so by name', async () => {
  const before = listDrafts()
  const p = await b.call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'acad-01', text: R1_TEXT })
  eq(p.ok, true, '§1a the default propose is NOT a refusal (it is a named absence, not an error)', p)
  hasOwn(p, 'filed', '§1b ★★★ the success-or-unfiled receipt always carries `filed`')
  hasOwn(p, 'draftMdMissing', '§1c ★★★ ...and `draftMdMissing`')
  eq(p.filed, false, '§1d ★★★ nothing was filed', p && p.filed)
  eq(p.draftMdMissing, true, '§1e ★★★ the receipt names exactly what is missing: the draft md', p && p.draftMdMissing)
  eq(p.id, null, '§1f no index row id is invented', p && p.id)
  eq(p.mdWritten, false, '§1g no md was written', p && p.mdWritten)
  eq(p.writtenBy, null, '§1h no writer is claimed', p && p.writtenBy)
  eq(p.mdOwner, null, '§1i no owner is claimed for a file that does not exist', p && p.mdOwner)
  has(JSON.stringify(p.nextActions || []), 'fs', '§1j the receipt names a reachable fix: write the file with fs', p && p.nextActions)
  eq(existsSync(draftAbs('Protocol', 1)), false, '§1k ★★★ THE CONTRACT: the kernel did not write the draft file', { abs: draftAbs('Protocol', 1) })
  eq(JSON.stringify(listDrafts()), JSON.stringify(before), '§1l ★★★ ...and no file appeared under Shared/Drafts/ (real directory snapshot)', { before, after: listDrafts() })
  const rows = b.records.list({ track: 'blueprint', limit: 0 }).items || []
  eq(rows.length, 0, '§1m ★★★ ...and no index row was written either', { rows: rows.length })
})

let memberDraft
test('§2 a member-written draft md is accepted and its ownership is read from disk, not from the receipt', async () => {
  mkdirSync(DRAFTS, { recursive: true })
  writeFileSync(draftAbs('Protocol', 1), MEMBER_TEXT)
  const INDEPENDENT_SHA = shaOf(draftAbs('Protocol', 1))
  const INDEPENDENT_BYTES = bytesOf(draftAbs('Protocol', 1))
  const p = await b.call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'r-1', mdPath: 'Shared/Drafts/Protocol-r1.md' })
  memberDraft = p
  eq(p.ok, true, '§2a a member file is admitted (the member owns the draft)', p)
  eq(p.filed, true, '§2b ★★★ a member file DOES file the draft row', p && p.filed)
  eq(p.draftMdMissing, false, '§2c ★★★ ...so draftMdMissing is false in the SAME receipt shape', p && p.draftMdMissing)
  eq(p.md && p.md.written, false, '§2d the kernel did NOT write the file it was handed', p && p.md)
  eq(p.md && p.md.writtenBy, 'member-file', '§2e ★★★ the writer is member-file', p && p.md && p.md.writtenBy)
  eq(p.writtenBy, 'member-file', '§2f ...also at the top level', p && p.writtenBy)
  ok(p.mdOwner && typeof p.mdOwner === 'object', '§2g ★★★ the receipt carries mdOwner (an owner, not just a boolean)', p && p.mdOwner)
  const o = p.mdOwner || {}
  eq(o.writtenBy, 'member-file', '§2h ★★★ mdOwner.writtenBy names the member', o)
  eq(o.path, 'Shared/Drafts/Protocol-r1.md', '§2i ...and the path it owns', o)
  eq(o.exists, true, '§2j ...the file really exists', o)
  eq(o.sha256, INDEPENDENT_SHA, '§2k ★★★ the sha256 equals the hash THIS TEST recomputed from the bytes it wrote', { got: o.sha256, expected: INDEPENDENT_SHA })
  eq(o.bytes, INDEPENDENT_BYTES, '§2l ★★★ ...and the byte count is the file size on disk', { got: o.bytes, expected: INDEPENDENT_BYTES })
  eq(o.atSource, 'row-provenance', '§2m ...and the fact came from the row, not from guessing', o.atSource)
  eq(o.wroteInOwnTurn, null, '§2n no turn context in this call ⇒ wroteInOwnTurn is null (unknown), never invented', o.wroteInOwnTurn)
  eq(shaOf(draftAbs('Protocol', 1)), INDEPENDENT_SHA, '§2o ★★★ the member file was not rewritten: its bytes are unchanged', INDEPENDENT_SHA)

  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: PROTO, member: 'acad-01' })
  const drafts = (st && st.drafts) || []
  eq(drafts.length, 1, '§2p the state face sees one draft', drafts.length)
  eq(drafts[0] && drafts[0].mdOwner && drafts[0].mdOwner.writtenBy, 'member-file', '§2q ★★ the state face carries the same owner')
  eq(drafts[0] && drafts[0].mdOwner && drafts[0].mdOwner.sha256, INDEPENDENT_SHA, '§2r ★★ ...with the disk sha, not a row copy')

  const rd = await b.call('vibe_v5_blueprint', { action: 'read', member: 'acad-01', id: p.id })
  eq(rd.ok, true, '§2s the read face answers for the row', rd)
  eq(rd.mdOwner && rd.mdOwner.writtenBy, 'member-file', '§2t ★★ the read face carries the owner too')
  eq(rd.mdOwner && rd.mdOwner.sha256, INDEPENDENT_SHA, '§2u ★★ ...and the sha THIS TEST computed')
})

let kernelDraft
test('§3 materialize:true is the explicit legacy path — the kernel writes the file and says so', async () => {
  const before = listDrafts()
  const p = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Second.md', member: 'acad-01', text: '# 第二份草案\n- 命题：偶数平方是 4 的倍数。', materialize: true })
  kernelDraft = p
  eq(p.ok, true, '§3a the explicit materialize path is not refused', p)
  eq(p.filed, true, '§3b ★★★ filed:true in the success receipt', p && p.filed)
  eq(p.draftMdMissing, false, '§3c ★★★ draftMdMissing:false in the very same receipt', p && p.draftMdMissing)
  eq(p.mdWritten, true, '§3d the kernel wrote an md', p && p.mdWritten)
  eq(p.writtenBy, 'kernel-materialized', '§3e ★★★ the writer is kernel-materialized', p && p.writtenBy)
  eq(p.mdOwner && p.mdOwner.writtenBy, 'kernel-materialized', '§3f ★★★ mdOwner names it', p && p.mdOwner)
  const abs = draftAbs('Second', 1)
  eq(existsSync(abs), true, '§3g ★★★ the file appeared under Shared/Drafts/', { abs })
  const after = listDrafts()
  eq(after.length, before.length + 1, '§3h ★★ exactly one new draft file appeared', { before, after })
  eq(p.mdOwner && p.mdOwner.sha256, shaOf(abs), '§3i ★★★ mdOwner.sha256 equals the hash of the bytes on disk now')
  eq(p.mdOwner && p.mdOwner.bytes, bytesOf(abs), '§3j ★★ ...and the byte count')
  eq(p.mdOwner && p.mdOwner.wroteInOwnTurn, false, '§3k the kernel wrote it, so "own turn" is false, not null', p && p.mdOwner && p.mdOwner.wroteInOwnTurn)
  eq(p.mdOwner && p.mdOwner.atSource, 'row-provenance', '§3l ...and the provenance came from the row')
})

test('§4 a file with no row provenance is fs-untracked — the third state is reachable and distinct', async () => {
  const rel = 'Shared/Drafts/Untracked-r1.md'
  writeFileSync(join(WS, rel), '# 没人认领的文件\n- 命题：从磁盘长出来的草案。\n')
  const owner = BP.mdOwnerOf({ records: b.records, mdPath: rel })
  eq(owner && owner.writtenBy, 'fs-untracked', '§4a ★★★ a file on disk with NO row provenance is fs-untracked', owner)
  eq(owner && owner.atSource, 'disk-only', '§4b ★★★ ...and the receipt says the fact came from the disk alone', owner && owner.atSource)
  eq(owner && owner.sha256, shaOf(join(WS, rel)), '§4c ★★ ...still hashing the real bytes, not a claimed value')
  eq(owner && owner.wroteInOwnTurn, null, '§4d nobody claims a turn, so it stays null')
  eq(BP.mdOwnerOf({ records: b.records, mdPath: '' }), null, '§4e no path ⇒ null, not an empty owner object')
  eq(BP.mdOwnerOf({ records: b.records, mdPath: 'Shared/Drafts/NotThere-r1.md' }), null, '§4f a path that does not exist and no writer ⇒ null')
  const states = new Set([memberDraft.mdOwner.writtenBy, kernelDraft.mdOwner.writtenBy, owner.writtenBy])
  eq(states.size, 3, '§4g ★★★ the three writers are three DISTINCT readings, not one reading told three ways', [...states])
})

test('§5 RECEIPT SYMMETRY — filed and draftMdMissing are present in BOTH states (success and unfiled)', async () => {
  // Success (member file): both keys, the values that mean filed.
  hasOwn(memberDraft, 'filed', '§5a success receipt: `filed` is PRESENT (the defect was its absence)')
  hasOwn(memberDraft, 'draftMdMissing', '§5b success receipt: `draftMdMissing` is present too')
  eq(memberDraft.filed, true, '§5c ★★★ success: filed === true')
  eq(memberDraft.draftMdMissing, false, '§5d ★★★ success: draftMdMissing === false')
  // Success (kernel materialize): same shape.
  hasOwn(kernelDraft, 'filed', '§5e materialized success: `filed` present')
  eq(kernelDraft.filed, true, '§5f ★★★ materialized success: filed === true')
  eq(kernelDraft.draftMdMissing, false, '§5g ★★★ materialized success: draftMdMissing === false')
  // Unfiled (text-only, no mdPath): the exact opposite values, same keys.
  const failed = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Third.md', member: 'acad-01', text: '# 只有文本\n- 命题：谁也没写文件。' })
  hasOwn(failed, 'filed', '§5h unfiled receipt: `filed` present')
  hasOwn(failed, 'draftMdMissing', '§5i unfiled receipt: `draftMdMissing` present')
  eq(failed.filed, false, '§5j ★★★ unfiled: filed === false')
  eq(failed.draftMdMissing, true, '§5k ★★★ unfiled: draftMdMissing === true')
  // Continuation, unfiled: a draft row exists (Protocol r1), the member added text but named no file ⇒ nothing is written.
  const shaBefore = shaOf(draftAbs('Protocol', 1))
  const cont = await b.call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'acad-01', text: '## 补充\n- 再核一遍 n=2。' })
  hasOwn(cont, 'filed', '§5l continuation-unfiled: `filed` present')
  hasOwn(cont, 'draftMdMissing', '§5m continuation-unfiled: `draftMdMissing` present')
  eq(cont.continued, true, '§5n the continuation was recognised as one', cont && cont.continued)
  eq(cont.filed, false, '§5o ★★★ continuation-unfiled: filed === false')
  eq(cont.draftMdMissing, true, '§5p ★★★ continuation-unfiled: draftMdMissing === true')
  eq(shaOf(draftAbs('Protocol', 1)), shaBefore, '§5q ★★★ ...and the member file was NOT rewritten by the kernel', shaBefore)
})

test('§6 the office aggregate mdOwnedBySeats is recomputed here from the receipts', async () => {
  const overview = await b.call('vibe_v5_overview', { member: 'acad-01' })
  eq(overview.ok, true, '§6a the chair can read the overview', overview)
  const agg = overview.mdOwnedBySeats
  ok(agg && typeof agg === 'object', '§6b ★★ the overview carries mdOwnedBySeats', overview && Object.keys(overview).slice(0, 8))
  // INDEPENDENT: the receipts collected above are the only source of this ratio.
  const owners = [memberDraft, kernelDraft]
    .map((r) => r && r.mdOwner)
    .filter((o) => o && typeof o.writtenBy === 'string' && o.writtenBy !== '')
  const total = owners.length
  const memberFiles = owners.filter((o) => o.writtenBy === 'member-file').length
  const ratio = total === 0 ? null : memberFiles / total
  eq(agg && agg.total, total, '§6c ★★★ total equals the number of distinct draft files the receipts named', { got: agg && agg.total, total })
  eq(agg && agg.memberFiles, memberFiles, '§6d ★★★ memberFiles recomputed from the receipts', { got: agg && agg.memberFiles, memberFiles })
  eq(agg && agg.ratio, ratio, '§6e ★★★ ratio recomputed by this test, not copied from the implementation', { got: agg && agg.ratio, ratio })
  eq(ratio, 0.5, '§6f precondition: one member file of two = one half', ratio)
  has(agg && agg.means, 'member-file', '§6g the aggregate explains which writer counts as member-owned', agg && agg.means)
})

test('§7 read faces answer mdOwner uniformly: a card with no md says null, a blueprint row says who wrote it', async () => {
  const card = await b.call('vibe_v5_record_proposition', {
    statement: 'r255 ownership card', value: '未定论', motive: 'run255 mdOwner card shape', p: 0.5, member: 'r-1',
  })
  eq(card.ok, true, '§7a a card is admitted', card)
  const lib = await b.call('vibe_v5_read_library', { member: 'r-1', track: 'propositions', limit: 5 })
  eq(lib.ok, true, '§7b the library face answers', lib)
  const items = lib.cards || []
  const row = items.filter((it) => it && it.id === card.recordId)[0] || items[0] || null
  ok(row !== null, '§7c precondition: the card is visible in the library', items.length)
  if (row !== null) {
    hasOwn(row, 'mdOwner', '§7d ★★ every card row carries mdOwner, even when there is no md')
    eq(row.mdOwner, null, '§7e ★★★ a card naming no md answers null (named absence, not an empty object)', row.mdOwner)
    has(row.mdOwnerMeans, 'null', '§7f ...and the means says null is the answer, so a reader is not left guessing', row.mdOwnerMeans)
  }
  eq(BP_SRC.includes('fs-untracked'), true, '§7g sanity: §4 could not have passed against a source without the third state')
})

test('§8 cleanup', () => {
  rmSync(TMP, { recursive: true, force: true })
  ok(n > 80, '§8a the suite made a substantive number of assertions (this is the criterion, not a smoke test)', { assertions: n })
  console.log('[run255] assertions=' + n)
})
