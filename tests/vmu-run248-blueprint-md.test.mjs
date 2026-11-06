// tests/vmu-run248-blueprint-md.test.mjs — RUN 248 (task-64): the blueprint DRAFT owns a real md file.
//
// The user ruling this suite enforces (2026-11-06): 蓝图草案必须落盘，成员自己通过 fs 管理 md. So:
//   §1 propose with no mdPath WRITES Shared/Drafts/<stem>-r<N>.md (atomic temp+rename), stamps mdPath + file sha256
//      onto the index row, and its receipt says written:true / writtenBy:"kernel-materialized";
//   §2 a co-design continuation rewrites the SAME draft md and keeps the same row;
//   §3 adopt promotes the DRAFT FILE bytes to the canonical path (copiedFrom = the draft file) and the canonical sha
//      equals the row mdFingerprint;
//   §4 an external edit to the draft prose is REFUSED by name (VMU_PACK_V5R_BLUEPRINT_MD_DRIFT, both sha values, a reachable
//      fix); reindex then admits the file against the DRAFT row (its own mdPath, not the path its body names), and adopt
//      succeeds with the edited bytes;
//   §5 a member-written draft md (plain markdown, no vmu header) is accepted through mdPath: the file is NOT rewritten,
//      the row text IS the file bytes;
//   §6 a mdPath that does not exist is refused by name (VMU_PACK_V5R_BLUEPRINT_MD_MISSING) with the path and a reachable fix;
//   §7 when the member already wrote the canonical file with exactly the bytes adoption would write, adopt only VERIFIES
//      (alreadyWritten:true, copiedFrom:null, no write).
//
// Run: node tests/vmu-run248-blueprint-md.test.mjs

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/run248'

const SRC_RECORDS = readFileSync(join(VMU, 'kernel', 'records.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
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
function refusalOf(fn) {
  try {
    const receipt = fn()
    return { thrown: false, receipt }
  } catch (e) {
    return { thrown: true, code: e && e.code, message: String((e && e.message) || e), hint: e && e.hint }
  }
}

const R1_TEXT = '# 公共蓝图 r1\n- 命题：前 n 个奇数之和 = n²。\n- 步骤：对 n 归纳。'
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
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e), hint: e && e.hint }
    }
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch (e) { return { ok: false, code: 'NON_JSON', raw } }
    }
    return raw
  }
  const records = handle.kernel.records
  const mdAbs = join(root, 'VibeMath', 'Shared', 'Protocol.md')
  const draftAbs = (revision) => join(root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r' + String(revision) + '.md')
  return { root, mdAbs, draftAbs, handle, records, specs, specOf, call }
}

// ── §0 the source carries the new facts and NONE of the retired ones ────────────────────────────────────────────────
{
  console.log('\n=== §0 the source names the draft file and retired the old copy ===')
  has(SRC_BLUEPRINT, 'BLUEPRINT_DRAFT_DIR', 'blueprint.js names the draft directory constant')
  has(SRC_BLUEPRINT, "BLUEPRINT_MD_MISSING = 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING'", 'blueprint.js declares the missing-md refusal code')
  has(SRC_BLUEPRINT, "BLUEPRINT_MD_DRIFT = 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT'", 'blueprint.js declares the drift refusal code')
  has(SRC_BLUEPRINT, 'blueprintDraftMdPathOf(', 'blueprint.js derives <stem>-r<N>.md from the canonical path')
  has(SRC_BLUEPRINT, 'readBlueprintDraftMd(', 'blueprint.js reads a draft md (vmu or plain) off disk')
  has(SRC_BLUEPRINT, 'verifyBlueprintRowMd(', 'blueprint.js verifies row text vs file bytes after the write')
  hasNot(SRC_BLUEPRINT, 'draftMdDeferred', 'the deferred-draft helper is gone from blueprint.js')
  hasNot(SRC_BLUEPRINT, 'writtenNever', 'the writtenNever claim is gone from blueprint.js')
  hasNot(SRC_BLUEPRINT, 'deferredTo', 'the deferredTo claim is gone from blueprint.js')
  hasNot(SRC_BLUEPRINT, '草案不写文件', 'the claim that a draft writes no file is gone from blueprint.js')
  has(SRC_RECORDS, "MD_PATH_KEY = 'mdPath'", 'records.js names the field that binds a row to its own file')
  has(SRC_RECORDS, 'mdByRel', 'records.js keeps the draft files visible beside the declared-path index')
  has(SRC_RECORDS, 'kind: \'draft-md\'', 'records.js accounts draft rows against their own md')
  has(SRC_RECORDS, 'content:', 'records.js mdRead discloses the raw file content')
}

// ── §1 propose with no mdPath writes the draft md; the row indexes THAT file ───────────────────────────────────────
let b
let p1
{
  console.log('\n=== §1 propose writes Shared/Drafts/<stem>-r<N>.md and stamps it on the row ===')
  b = await boot('md')
  const started = await b.call('vibe_v5_start', { problem: '前 n 个奇数之和 = n²，用归纳法验证。', researcherCount: 2 })
  ok(started && started.ok === true, 'the round starts (so the blueprint seats exist)', started)

  p1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: R1_TEXT })
  ok(p1 && p1.ok === true, 'propose returns a receipt', p1)
  ok(p1 && p1.status === 'draft' && p1.revision === 1, 'propose is r1 draft', { revision: p1 && p1.revision, status: p1 && p1.status })
  ok(p1 && p1.md && p1.md.available === true, 'the receipt says the md face is available and used', p1 && p1.md)
  ok(p1 && p1.md && p1.md.written === true, 'the draft md IS written', p1 && p1.md)
  ok(p1 && p1.md && p1.md.writtenBy === 'kernel-materialized', 'the receipt names the writer', p1 && p1.md)
  ok(p1 && p1.mdPath === 'Shared/Drafts/Protocol-r1.md', 'the receipt names the draft md path', { mdPath: p1 && p1.mdPath })
  ok(p1 && p1.md && p1.md.mdPath === 'Shared/Drafts/Protocol-r1.md', 'the md face names the same draft path', p1 && p1.md)
  ok(p1 && p1.draftMdPath === 'Shared/Drafts/Protocol-r1.md', 'the receipt exposes draftMdPath', { draftMdPath: p1 && p1.draftMdPath })
  ok(p1 && p1.mdWritten === true, 'the receipt exposes mdWritten', { mdWritten: p1 && p1.mdWritten })
  ok(p1 && p1.textSource === 'argument', 'the text came from the argument', { textSource: p1 && p1.textSource })
  ok(existsSync(b.draftAbs(1)) === true, 'the draft md exists on disk under Shared/Drafts', { abs: b.draftAbs(1) })
  ok(existsSync(b.mdAbs) === false, 'the canonical md is NOT written by a draft', { abs: b.mdAbs })
  ok(p1 && p1.md && p1.md.writtenNever === undefined, 'the receipt no longer claims writtenNever')
  ok(p1 && p1.md && p1.md.deferredTo === undefined, 'the receipt no longer claims deferredTo')
  hasNot(JSON.stringify(p1 || {}), '草案不写文件', 'the propose receipt never says the old phrase')

  const draftDoc = b.records.mdParse(readFileSync(b.draftAbs(1), 'utf8'))
  ok(draftDoc && draftDoc.ok === true, 'the draft md is a valid vmu md document', draftDoc && draftDoc.why)
  ok(draftDoc && draftDoc.fields.path === 'Shared/Protocol.md', 'the draft md names the revision it is about')
  ok(draftDoc && draftDoc.fields.mdPath === 'Shared/Drafts/Protocol-r1.md', 'the draft md names ITSELF as mdPath')
  ok(draftDoc && draftDoc.fields.status === 'draft', 'the draft md carries status draft')
  ok(draftDoc && draftDoc.text === R1_TEXT, 'the draft md body IS the proposed text', { got: draftDoc && draftDoc.text })

  const row1 = b.records.get({ id: p1.id, includeBody: true })
  has(row1 && row1.body, '- mdPath：Shared/Drafts/Protocol-r1.md', 'the index row carries the draft md path')
  ok(row1 && row1.body.includes(shaOf(b.draftAbs(1))), 'the index row carries the file sha256', { want: shaOf(b.draftAbs(1)) })
  ok(bodyAfterHeading(row1 && row1.body) === R1_TEXT, 'the index row body IS the draft text', { got: bodyAfterHeading(row1 && row1.body) })
  ok(p1 && p1.verified && p1.verified.checked === true, 'the kernel verified row-vs-file after writing', p1 && p1.verified)
}

// ── §2 the co-design continuation rewrites the SAME draft md (one revision, one file) ──────────────────────────────
let p2
{
  console.log('\n=== §2 continuation rewrites the SAME draft md and keeps the same row ===')
  const before = shaOf(b.draftAbs(1))
  p2 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: CODESIGN_TEXT })
  ok(p2 && p2.ok === true && p2.continued === true, 'the second member continues the r1 draft', p2)
  ok(p2 && p2.id === p1.id, 'continuation keeps the same index row', { before: p1.id, after: p2 && p2.id })
  ok(p2 && p2.md && p2.md.written === true, 'the continuation rewrites the draft md', p2 && p2.md)
  ok(p2 && p2.md && p2.md.mdPath === 'Shared/Drafts/Protocol-r1.md', 'it rewrites the SAME draft file', p2 && p2.md)
  ok(shaOf(b.draftAbs(1)) !== before, 'the draft md bytes changed on disk')
  ok(p2 && p2.mdFingerprint === shaOf(b.draftAbs(1)), 'the row fingerprint matches the new file bytes')
  ok(existsSync(b.draftAbs(2)) === false, 'no r2 draft file was invented by the continuation')
  ok(existsSync(b.mdAbs) === false, 'the canonical md is still untouched')
  const draftDoc = b.records.mdParse(readFileSync(b.draftAbs(1), 'utf8'))
  ok(draftDoc && draftDoc.text.indexOf(CODESIGN_TEXT) !== -1, 'the draft md body includes the co-design section')
  ok(draftDoc && draftDoc.fields.authors && draftDoc.fields.authors.indexOf('r-1') !== -1, 'the draft md authors include the co-design seat', draftDoc && draftDoc.fields.authors)
}

// ── §3 state/read expose draftMdPath + mdWritten; adopt promotes the DRAFT FILE bytes ──────────────────────────────
{
  console.log('\n=== §3 state exposes the draft face; adopt promotes the draft file to canonical ===')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(st && st.ok === true, 'state ok', st)
  ok(st && st.draftMdPath === 'Shared/Drafts/Protocol-r1.md', 'state root exposes draftMdPath', { v: st && st.draftMdPath })
  ok(st && st.mdWritten === true, 'state root exposes mdWritten', { v: st && st.mdWritten })
  ok(st && st.md && st.md.draftMdPath === 'Shared/Drafts/Protocol-r1.md', 'state md block exposes draftMdPath', st && st.md)
  ok(st && st.md && st.md.mdWritten === true, 'state md block exposes mdWritten', st && st.md)
  ok(st && st.drafts && st.drafts[0] && st.drafts[0].mdPath === 'Shared/Drafts/Protocol-r1.md', 'state drafts[] exposes the draft md path', st && st.drafts)
  ok(st && st.drafts && st.drafts[0] && st.drafts[0].mdWritten === true, 'state drafts[] exposes mdWritten', st && st.drafts)
  ok(st && st.md && st.md.writtenNever === undefined && st.md.deferredTo === undefined, 'the md block carries neither retired key')
  hasNot(JSON.stringify(st || {}), '草案不写文件', 'the state copy never says the old phrase')

  const rd = await b.call('vibe_v5_blueprint', { action: 'read', id: p1.id })
  ok(rd && rd.ok === true, 'read ok', rd)
  ok(rd && rd.md && rd.md.draftMdPath === 'Shared/Drafts/Protocol-r1.md', 'the read md block exposes draftMdPath', rd && rd.md)
  ok(rd && rd.md && rd.md.mdWritten === true, 'the read md block exposes mdWritten', rd && rd.md)
  // the module reading is the source of both faces: it must carry the pair itself (the tool branch copies a fixed subset,
  // so a reading added to blueprint.js stays silent there until the Lead forwards it — reported with this suite)
  const rdModule = BP.readBlueprint({ records: b.records, id: p1.id })
  ok(rdModule && rdModule.draftMdPath === 'Shared/Drafts/Protocol-r1.md', 'readBlueprint exposes draftMdPath directly', { v: rdModule && rdModule.draftMdPath })
  ok(rdModule && rdModule.mdWritten === true, 'readBlueprint exposes mdWritten directly', { v: rdModule && rdModule.mdWritten })

  const draftText = b.records.mdParse(readFileSync(b.draftAbs(1), 'utf8')).text
  const adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: p1.id, member: 'r-acad' })
  ok(adopted && adopted.ok === true, 'adopt ok', adopted)
  ok(adopted && adopted.copiedFrom === 'Shared/Drafts/Protocol-r1.md', 'the receipt names the draft file it copied from', adopted && adopted.copiedFrom)
  ok(adopted && adopted.alreadyWritten === false, 'the canonical file was written by adoption', adopted && adopted.alreadyWritten)
  ok(adopted && adopted.mdWrite && adopted.mdWrite.written === true, 'the md face wrote the canonical file', adopted && adopted.mdWrite)
  ok(existsSync(b.mdAbs) === true, 'the canonical md now exists')
  ok(bodyAfterHeading(readFileSync(b.mdAbs, 'utf8')) === draftText, 'the canonical body IS the draft file body', { got: bodyAfterHeading(readFileSync(b.mdAbs, 'utf8')) })
  ok(adopted && adopted.mdFingerprint === shaOf(b.mdAbs), 'the canonical sha256 is the row mdFingerprint', { row: adopted && adopted.mdFingerprint, file: shaOf(b.mdAbs) })
  const canonDoc = b.records.mdParse(readFileSync(b.mdAbs, 'utf8'))
  ok(canonDoc && canonDoc.fields.status === 'current', 'the canonical md carries status current', canonDoc && canonDoc.fields.status)
  ok(canonDoc && canonDoc.fields.mdPath === 'Shared/Protocol.md', 'the canonical md names ITSELF as mdPath', canonDoc && canonDoc.fields.mdPath)
  hasNot(JSON.stringify(adopted && adopted.mdIsTheDocumentInForce), 'deferredTo', 'the adopt copy drops the deferredTo claim')
  hasNot(JSON.stringify(adopted || {}), '草案不写文件', 'the adopt receipt never says the old phrase')

  // ── §3b ★★★ RUN 248-M3 (cold T1): PROMOTION MOVES THE CLAIM, so afterwards exactly ONE row names the canonical file ──
  // The regression this pins: adoption used to leave `mdPath`/`mdFingerprint` on the draft row, so two row bodies named a
  // file at once and a reader of the old draft row compared its DRAFT file (sha equal, "unchanged") instead of the
  // canonical file the adoption had just written - "which row points at the file" had two wrong answers.
  const CANON = 'Shared/Protocol.md'
  const canonicalSha = shaOf(b.mdAbs)
  const draftRowAfter = b.records.get({ id: p1.id })
  const draftBodyAfter = String((draftRowAfter && draftRowAfter.body) || '')
  ok(draftRowAfter && draftRowAfter.id === p1.id, 'the adopted draft row is still readable (history is append-only)', draftRowAfter && draftRowAfter.id)
  hasNot(draftBodyAfter, '- mdPath：', 'after adoption the draft row no longer claims a md file (mdPath released)')
  hasNot(draftBodyAfter, '- mdFingerprint：', 'and it no longer indexes a file sha either (mdFingerprint released)')
  ok(draftBodyAfter.indexOf('- status：draft') !== -1, 'the draft row still reads as a DRAFT (only its file claim moved)', draftBodyAfter.slice(0, 120))
  const claimers = (b.records.list({ track: 'blueprint', limit: 0 }).items || [])
    .map((r) => b.records.get({ id: r.id }))
    .filter((r) => String((r && r.body) || '').indexOf('- mdPath：' + CANON) !== -1)
  ok(claimers.length === 1, 'exactly ONE row claims the canonical file after adoption', claimers.map((r) => r && r.id))
  ok(claimers.length === 1 && claimers[0].id === adopted.id, 'and it is the row this adoption put in force', { claimer: claimers[0] && claimers[0].id, adopted: adopted && adopted.id })
  ok(claimers.length === 1 && String(claimers[0].body).indexOf('- mdFingerprint：' + canonicalSha) !== -1,
    'the claiming row sha256 IS the sha256 on disk', { row: claimers.length === 1 ? String(claimers[0].body).split('\n').filter((l) => l.indexOf('mdFingerprint') === 0 || l.indexOf('- mdFingerprint') === 0)[0] : null, disk: canonicalSha })
  const releasedRead = BP.readBlueprint({ records: b.records, id: p1.id })
  ok(releasedRead && releasedRead.md && releasedRead.md.draftMdPath === null, 'a released draft row names NO draft file any more', releasedRead && releasedRead.md && releasedRead.md.draftMdPath)
  ok(releasedRead && releasedRead.mdFingerprint === canonicalSha, 'reading it measures against the CANONICAL file the adoption wrote', { row: releasedRead && releasedRead.mdFingerprint, disk: canonicalSha })
  ok(releasedRead && releasedRead.mdChangedSinceIndex === true, 'and it reports the file moved on instead of claiming an equality it does not have', releasedRead && releasedRead.mdChangedSinceIndex)
  ok(releasedRead && releasedRead.md && releasedRead.md.mdWritten === true, 'the released draft row still says the canonical file is on disk', releasedRead && releasedRead.md && releasedRead.md.mdWritten)
  ok(adopted && adopted.draftReleased && adopted.draftReleased.ok === true && adopted.draftReleased.from === 'Shared/Drafts/Protocol-r1.md',
    'the receipt reports WHICH draft claim was released', adopted && adopted.draftReleased)
  ok(adopted && adopted.mdClaim && adopted.mdClaim.owner === adopted.id && adopted.mdClaim.mdFingerprint === canonicalSha,
    'and WHICH single row owns the file, with the sha it indexed', adopted && adopted.mdClaim)
}

// ── §4 external edit to the draft prose: drift refused by name, reindex admits it, adopt then succeeds ─────────────
let p3
let EDITED_R2
{
  console.log('\n=== §4 drift is refused by name; reindex admits the draft file; adopt then succeeds ===')
  p3 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: '# 公共蓝图 r2\n- 命题：待复核。' })
  ok(p3 && p3.ok === true, 'propose r2 ok', p3)
  ok(p3 && p3.md && p3.md.mdPath === 'Shared/Drafts/Protocol-r2.md', 'r2 draft gets its OWN file', p3 && p3.md)
  ok(existsSync(b.draftAbs(2)) === true, 'the r2 draft md exists', { abs: b.draftAbs(2) })
  const sign = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: CODESIGN_TEXT })
  ok(sign && sign.ok === true, 'r2 co-design continuation ok', sign)

  const doc2 = b.records.mdParse(readFileSync(b.draftAbs(2), 'utf8'))
  EDITED_R2 = '# 被外部改过的 r2\n- 命题：改过了。'
  const edited = b.records.mdWrite({ path: 'Shared/Drafts/Protocol-r2.md', title: doc2.title, track: 'blueprint', kind: 'blueprint', fields: doc2.fields, text: EDITED_R2 })
  ok(edited && edited.written === true, 'the member edit landed on disk outside the kernel', edited)

  const drift = await b.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: p3.id, member: 'r-acad' })
  ok(drift && drift.ok === false && drift.code === 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT', 'adopt refuses a drifted draft by name', drift)
  ok(drift && drift.message && drift.message.indexOf(shaOf(b.draftAbs(2))) !== -1, 'the refusal names the file sha256 it found', { message: drift && drift.message })
  ok(drift && typeof drift.hint === 'string' && drift.hint.indexOf('reindex') !== -1, 'the refusal names a reachable fix', { hint: drift && drift.hint })

  const re = await b.call('vibe_vmu_records', { action: 'reindex' })
  ok(re && re.ok === true, 'reindex ok', re)
  ok(re && re.changed && re.changed.length >= 1 && re.changed.some((c) => c.kind === 'draft-md'), 'reindex admits the edited draft against the DRAFT row', re && re.changed)
  ok(re && re.missing && re.missing.length === 0, 'the draft file is not called missing', re && re.missing)
  ok(re && re.counts && re.counts.missing === 0, 'the receipt counts no missing document', re && re.counts)

  const a2 = await b.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: p3.id, member: 'r-acad' })
  ok(a2 && a2.ok === true, 'adopt succeeds once the index admits the file', a2)
  ok(bodyAfterHeading(readFileSync(b.mdAbs, 'utf8')) === EDITED_R2, 'the canonical body is the EDITED draft bytes', { got: bodyAfterHeading(readFileSync(b.mdAbs, 'utf8')) })
}

// ── §5 a member-written plain md is accepted through mdPath and never rewritten ────────────────────────────────────
{
  console.log('\n=== §5 mdPath accepts a member-written plain markdown draft ===')
  const c = await boot('member')
  const started = await c.call('vibe_v5_start', { problem: '成员自写草案。', researcherCount: 2 })
  ok(started && started.ok === true, 'the round starts', started)
  const memberRel = 'Members/r-1/Drafts/Plan-r1.md'
  const memberAbs = join(c.root, 'VibeMath', 'Members', 'r-1', 'Drafts', 'Plan-r1.md')
  mkdirSync(join(c.root, 'VibeMath', 'Members', 'r-1', 'Drafts'), { recursive: true })
  const MEMBER_TEXT = '# 我的草案\n只写在文件里，不进参数。'
  writeFileSync(memberAbs, MEMBER_TEXT, 'utf8')
  const memberShaBefore = shaOf(memberAbs)

  const p4 = BP.proposeBlueprint({ records: c.records, path: 'Shared/Protocol.md', text: '', by: 'r-acad', seat: '院士', mdPath: memberRel })
  ok(p4 && p4.ok === true, 'propose accepts mdPath with no text argument', p4)
  ok(p4 && p4.mdPath === memberRel, 'the receipt names the member mdPath', { mdPath: p4 && p4.mdPath })
  ok(p4 && p4.md && p4.md.written === false, 'the kernel did NOT write the member file', p4 && p4.md)
  ok(p4 && p4.md && p4.md.writtenBy === 'member-file', 'the receipt credits the member as the writer', p4 && p4.md)
  ok(p4 && p4.textSource === 'md', 'the text came OFF THE FILE', { textSource: p4 && p4.textSource })
  ok(shaOf(memberAbs) === memberShaBefore, 'the member file bytes are untouched', { before: memberShaBefore, after: shaOf(memberAbs) })
  const row4 = c.records.get({ id: p4.id, includeBody: true })
  ok(row4 && row4.body.indexOf('- mdPath：' + memberRel) !== -1, 'the index row carries the member mdPath', { body: row4 && row4.body })
  ok(row4 && row4.body.indexOf(memberShaBefore) !== -1, 'the index row carries the member file sha256', { want: memberShaBefore })
  ok(bodyAfterHeading(row4 && row4.body) === MEMBER_TEXT, 'the row text IS the member file bytes', { got: bodyAfterHeading(row4 && row4.body) })
  ok(p4 && p4.verified && p4.verified.checked === true, 'the kernel verified row-vs-member-file', p4 && p4.verified)
}

// ── §6 a mdPath that is not on disk is refused by name, with the path and a reachable fix ─────────────────────────
{
  console.log('\n=== §6 a missing mdPath is refused by name ===')
  const c = await boot('missing')
  const started = await c.call('vibe_v5_start', { problem: '缺文件。', researcherCount: 2 })
  ok(started && started.ok === true, 'the round starts', started)
  const missingRel = 'Members/r-1/Drafts/NoSuch-r1.md'
  const got = refusalOf(() => BP.proposeBlueprint({ records: c.records, path: 'Shared/Protocol.md', text: '', by: 'r-acad', seat: '院士', mdPath: missingRel }))
  ok(got.thrown === true && got.code === 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING', 'the refusal is named VMU_PACK_V5R_BLUEPRINT_MD_MISSING', got)
  ok(got.message && got.message.indexOf(missingRel) !== -1, 'the refusal names the path it looked for', { message: got.message })
  ok(typeof got.hint === 'string' && got.hint.indexOf('fs') !== -1, 'the refusal names a reachable fix', { hint: got.hint })
  ok(typeof got.hint === 'string' && got.hint.indexOf('Shared/Drafts/Protocol-r1.md') !== -1, 'the fix also offers the kernel-materialized default', { hint: got.hint })
  const rows = c.records.list({ track: 'blueprint', limit: 0 }).items || []
  ok(rows.length === 0, 'no index row was written for the refused proposal', { rows: rows.length })
}

// ── §7 the member already wrote the canonical file with the bytes adoption would write: adopt verifies only ────────
{
  console.log('\n=== §7 adopt verifies an already-written canonical file instead of rewriting it ===')
  const d = await boot('already')
  const started = await d.call('vibe_v5_start', { problem: '已经写好。', researcherCount: 2 })
  ok(started && started.ok === true, 'the round starts', started)
  const dp = await d.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: R1_TEXT })
  ok(dp && dp.ok === true, 'draft proposed', dp)
  const sign = await d.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: CODESIGN_TEXT })
  ok(sign && sign.ok === true, 'co-design continuation ok', sign)
  const AT = 5000
  const st = await d.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  const draftDoc = d.records.mdParse(readFileSync(join(d.root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r1.md'), 'utf8'))
  const fields = BP.blueprintMdHeaderOf({
    path: 'Shared/Protocol.md', status: 'current', revision: 1,
    proposedBy: st.drafts[0].proposedBy, proposedAt: Date.parse(st.drafts[0].proposedAt), adoptedBy: 'r-acad', adoptedAt: AT,
    proposalId: dp.id, note: '', authors: st.drafts[0].authors, mdPath: 'Shared/Protocol.md',
  })
  const composed = d.records.mdCompose({ title: BP.BLUEPRINT_TITLE_PREFIX + 'Shared/Protocol.md｜r1｜生效', track: 'blueprint', kind: 'blueprint', fields, text: draftDoc.text })
  mkdirSync(join(d.root, 'VibeMath', 'Shared'), { recursive: true })
  writeFileSync(d.mdAbs, composed.content, 'utf8')
  const a = BP.adoptBlueprint({ records: d.records, path: 'Shared/Protocol.md', draft: dp.id, by: 'r-acad', at: AT })
  ok(a && a.ok === true, 'adopt ok', a)
  ok(a && a.alreadyWritten === true, 'the receipt says the member already wrote it', a && a.alreadyWritten)
  ok(a && a.copiedFrom === null, 'nothing was copied, so copiedFrom is null', { copiedFrom: a && a.copiedFrom })
  ok(a && a.mdWrite && a.mdWrite.written === false, 'adopt did NOT rewrite the file', a && a.mdWrite)
  ok(readFileSync(d.mdAbs, 'utf8') === composed.content, 'the canonical bytes are exactly what the member wrote')
}

console.log('\n' + (failed === 0 ? 'ALL PASSED' : 'FAILURES: ' + failures.join(' | ')))
console.log('passed=' + passed + ' failed=' + failed)
process.exit(failed === 0 ? 0 : 1)
