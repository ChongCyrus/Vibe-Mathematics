// scripts/sim/scenarios/records-blueprint.mjs — the records ledger and the blueprint md, driven by a SCRIPT.
//
// WHY THIS SCENARIO EXISTS (task-6, on top of RUN 225-A): the records face publishes list/expand/status/append/prune/
// restore/reindex, and the blueprint's durable truth moved into `Shared/Protocol.md` (the md is the truth, the record
// row is its index). A live run reads those receipts ONCE and cannot re-ask; this scenario asks every one of them in
// one second and leaves the receipts behind for `scripts/sim/audit/receipts.mjs`.
//
// THE FOUR THINGS IT IS FOR:
//   ① the same record set read on BOTH tracks: the whole ledger (`list` with no track), one real track
//     (propositions/blueprint), and the DECLARED-but-once-empty `state` track;
//   ② the put -> supersede chain and its tombstones: propose puts a draft (rev 1), codesign supersedes the SAME row
//     (rev 2), adopt puts a NEW current row; prune moves those rows into the trash (tombstones), and reindex + restore
//     bring them back without deleting history;
//   ③ prune honesty: `dryRun:true` must move nothing and must name `inForceIds`/`doomedInForceCount` BEFORE the act;
//   ④ the md-only truth: an untouched tree reindexes `unchanged`; a hand-edited `Shared/Protocol.md` is DISCLOSED by
//     `blueprint read` (`mdChangedSinceIndex`) and only then admitted by `reindex` as `changed` with a `rowChoice` and
//     the new sha256 — and the `adopt` path is read off the draft (`pathFrom:"draft"`).
//
// EXPECTED REFUSALS AND WHERE THEY GO: this scenario also proves that a contradictory call is REFUSED BY NAME (adopting
// the same draft twice). `scripts/sim/run.mjs` fails a run on ANY non-environmental `ok:false` receipt, so an EXPECTED
// refusal is kept OUT of the returned `receipts` and carried in `highlights.expectedRefusals` + the `steps` ledger
// (which still records `REFUSED` for it, so the run REPORT shows it). The audit therefore only alarms on refusals this
// scenario did NOT predict, which is the distinction A1 is for. Every other call in this scenario is expected to answer.

// fs-purpose: audit — this scenario HAND-EDITS the blueprint md the way a human would, which is exactly what reindex
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NL = String.fromCharCode(10)
const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')

/**
 * @param {{ call: Function, receipts: Array, tree: Function, root?: string }} h — the harness from ../harness.mjs
 * @param {{ log?: Function }} [opts]
 */
export async function recordsBlueprint(h, { log = () => {} } = {}) {
  const steps = []
  const expectedSeqs = new Set()
  // ★ TB-2650 (MEASURED): RUN 259 made `not-a-vmu-md` a BLOCKING class, so every reindex call in a workspace that holds a
  // member-written plain md draft refuses by name (`VMU_RECORDS_REINDEX_BLOCKED`). Four calls in section ③/④ meet that
  // workspace, so four predictions are pinned BY SEQ - one prediction forgives one refusal, and the seq is what makes the
  // forgiveness nameable. A later policy change turns these into `declared-but-never-hit` (honest) instead of letting a
  // real new refusal hide behind them.
  const expectedRefusals = []
  const lastSeq = () => (h.receipts.length ? h.receipts[h.receipts.length - 1].seq : null)
  const predictReindexBlocked = (why) => expectedRefusals.push({ seq: lastSeq(), tool: 'vibe_vmu_records', code: 'VMU_RECORDS_REINDEX_BLOCKED', why })
  // ★ TB-2625 — named reds, the counterpart of `run.mjs`'s `result.failures` hook. This scenario used to THROW
  // ("the blueprint md was never written") when the fs-first contract moved; a throw kills the run before the corpus is
  // written, so the only trace was a stack in the terminal and the gate went red for days with no evidence in the corpus.
  // Now the drift is NAMED (code + which step + the receipt shape that changed), every remaining step runs, and the
  // corpus says why.
  const failures = []
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: (out && out.code) || null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  // fs-first (TB-2613 / RUN 255): a propose without mdPath no longer writes a row, so "filed" has to be read as a
  // NORMALISED fact — the kernel omits `filed` on the success path and only sends `filed:false` when nothing was filed.
  const filedOf = (r) => Boolean(r && r.ok !== false && r.filed !== false && r.draftMdMissing !== true && typeof r.id === 'string' && r.id !== '')

  const markExpected = () => {
    const last = steps[steps.length - 1]
    if (last && last.ok === false) expectedSeqs.add(last.at)
  }

  // ① ── the ledger, read on both tracks ───────────────────────────────────────────────────────────────────────────
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（记录面 + 蓝图 md 场景：只压机制，不压数学）。',
    researcherCount: 2,
  }))

  const claim = await step('records/proposition', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2',
    value: '对任意正整数 n 成立',
    p: 0.9,
    motive: '记录面覆盖：命题轨的一行，作为 expand 与 list 的读样本',
    member: 'r-1',
  }, { as: { agent: { id: 'r-1' } } }))

  const progress = await step('records/progress', () => h.call('vibe_v5_record_progress', {
    member: 'r-1',
    content: '进度轨：把蓝图落成，再核对 md 与索引。',
    progress: '命题卡已登记',
    next: '提请蓝图草案',
  }, { as: { agent: { id: 'r-1' } } }))

  // The DECLARED `state` track is writable through the same face only when the STATE PANEL is complete (four fields);
  // this run proves the track is reachable instead of reporting a declared-but-unwritable track from one empty list.
  const statePanel = await step('records/state-panel', () => h.call('vibe_v5_record_progress', {
    member: 'r-1',
    track: 'state',
    content: '状态面板（四要素齐备）：记录面读样本。',
    progress: '命题与进度轨已登记，蓝图草案待落成',
    obstacles: '无',
    next: '落成蓝图并核对 md',
    help: '无',
  }, { as: { agent: { id: 'r-1' } } }))

  const listAll = await step('records/list-all', () => h.call('vibe_vmu_records', { action: 'list', limit: 0 }))
  const listPropositions = await step('records/list-track-propositions', () => h.call('vibe_vmu_records', { action: 'list', track: 'propositions' }))
  const listState = await step('records/list-track-state', () => h.call('vibe_vmu_records', { action: 'list', track: 'state' }))
  const expanded = await step('records/expand', () => h.call('vibe_vmu_records', { action: 'expand', id: claim && claim.recordId }))
  const appended = await step('records/append', () => h.call('vibe_vmu_records', {
    action: 'append',
    kind: 'method',
    statement: '归纳模板：n 与 n-1 的平方之差是 2n-1。',
    proof: 'n^2-(n-1)^2 = 2n-1，所以第 n 个奇数是差分。',
  }))
  const listAfterAppend = await step('records/list-after-append', () => h.call('vibe_vmu_records', { action: 'list', limit: 0 }))
  const statusBefore = await step('records/status-before', () => h.call('vibe_vmu_records', { action: 'status' }))

  // ② ── the blueprint: put (propose) -> supersede the same row (codesign) -> put a new current row (adopt) ─────────
  // ★ TB-2625 / TB-2613 (RUN 255) — fs-first. A propose files a row only when it NAMES the member's markdown, so the
  // acting member writes the draft FIRST and hands the kernel that same relative path. A text-only propose now answers
  // `{ok:true, filed:false, id:null, draftMdMissing:true}` and every later adopt/read is refused by name — which is the
  // drift that made this scenario stop with "the blueprint md was never written" on a run that was behaving correctly.
  const draftRel = 'Members/r-acad/Drafts/protocol-r1.md'
  const draftAbs = join(h.root, 'VibeMath', draftRel)
  const draftBody = '# 公共蓝图｜前 n 个奇数之和' + NL
    + '- 命题：对任意正整数 n，前 n 个奇数之和等于 n 的平方。' + NL
    + '- 路线：对 n 归纳；第 n 个奇数正是 n 的平方与 n-1 的平方之差。'
  const writeMemberMd = (name, body) => step(name, () => {
    mkdirSync(dirname(draftAbs), { recursive: true })
    writeFileSync(draftAbs, body)
    return { ok: true, path: draftRel, absPath: draftAbs, bytes: Buffer.byteLength(body), sha256: sha256(body) }
  })
  const draftFileOpen = await writeMemberMd('blueprint/draft-md', draftBody)

  const draft = await step('blueprint/propose', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    path: 'Shared/Protocol.md',
    mdPath: draftRel,
    member: 'r-acad',
    text: draftBody,
  }))
  const draftId = (draft && (draft.id || draft.recordId)) || null
  // THE CONTRACT SELF-CHECK (TB-2625): if the fs-first contract moves again, this run says so BY NAME here instead of
  // dying three steps later with a message about a missing md file. `filedOf` normalises the asymmetric receipt — the
  // kernel omits `filed` on the success path and only sends `filed:false` when nothing was filed (task-92 makes it
  // three-state); the scenario must not depend on which shape the product happens to send today.
  if (!filedOf(draft)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'blueprint/propose',
      message: 'blueprint propose filed no row: this scenario is behind the fs-first contract (its mdPath was not honoured)',
      means: 'propose must answer with a draft row id when it names an existing mdPath; filed:false beside draftMdMissing:true means the md side of the contract moved',
      receipt: draft,
    })
  }

  const codesignBody = draftBody + NL + '## 共同设计补充｜r-1' + NL + '- 复核归纳步：n = 1 时 1 = 1 的平方成立。' + NL
  const draftFileSigned = await writeMemberMd('blueprint/codesign-md', codesignBody)

  const codesign = await step('blueprint/codesign', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    draft: draftId,
    path: 'Shared/Protocol.md',
    mdPath: draftRel,
    member: 'r-1',
  }, { as: { agent: { id: 'r-1' } } }))
  if (!filedOf(codesign)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'blueprint/codesign',
      message: 'the codesign filed nothing: the same draft row cannot be read back with two authors',
      means: 'a codesign is a propose that names draft + mdPath; if it does not file, the put -> supersede chain this scenario measures is gone',
      receipt: codesign,
    })
  }

  // NO `path` on purpose: the draft names its own path, so the receipt must say where the path came from.
  const adopted = await step('blueprint/adopt-no-path', () => h.call('vibe_v5_blueprint', {
    action: 'adopt',
    draft: draftId,
    member: 'r-acad',
  }, { as: { agent: { id: 'r-acad' } } }))

  const mdAbs = adopted && adopted.md && adopted.md.absPath ? adopted.md.absPath : null
  if (mdAbs === null) {
    // TB-2625: no throw. A throw here used to kill the run BEFORE the corpus was written, so the gate went red with no
    // evidence; now the rest of the scenario still runs and the failure is a named row in `result.failures`.
    failures.push({
      code: 'SIM_BLUEPRINT_MD_MISSING',
      step: 'blueprint/adopt-no-path',
      message: 'adoption returned no markdown path: there is no file to hand-edit and no md to reindex',
      means: 'adopt must materialise the canonical md and name its absPath; without it the md-only truth in ④ cannot be measured',
      receipt: adopted,
    })
  }
  const mdBefore = mdAbs ? readFileSync(mdAbs, 'utf8') : ''
  const readAdopted = await step('blueprint/read-current', () => h.call('vibe_v5_blueprint', { action: 'read', id: adopted && adopted.id }))
  const readDraft = await step('blueprint/read-draft', () => h.call('vibe_v5_blueprint', { action: 'read', id: draftId }))

  // A CONTRADICTION, refused by name: the same draft was already adopted. The refusal is expected, so it is moved out
  // of the returned receipts (see the header) and kept in highlights.expectedRefusals.
  const contradiction = await step('blueprint/adopt-again', () => h.call('vibe_v5_blueprint', {
    action: 'adopt',
    draft: draftId,
    member: 'r-acad',
  }, { as: { agent: { id: 'r-acad' } } }))
  markExpected()

  // The put -> supersede chain, read back: the SAME row id must carry rev 2 after the codesign.
  const chainRow = await step('records/expand-draft-row', () => h.call('vibe_vmu_records', { action: 'expand', id: draftId }))

  // ③ ── prune honesty: dry run first (must move nothing), then the real prune, then restore/reindex ───────────────
  const prunePreview = await step('records/prune-dry-run', () => h.call('vibe_vmu_records', {
    action: 'prune',
    track: 'blueprint',
    keep: 0,
    dryRun: true,
    why: '核对 dryRun：只预告会移哪些行，并先说清哪一行是在效版本',
  }))
  const pruned = await step('records/prune', () => h.call('vibe_vmu_records', {
    action: 'prune',
    track: 'blueprint',
    keep: 0,
    why: '场景压机制：把蓝图轨的活行移入回收站（可恢复），随后由 md 重建索引',
  }))
  const statusAfterPrune = await step('records/status-after-prune', () => h.call('vibe_vmu_records', { action: 'status' }))

  // The md is the truth: with every blueprint row in the trash, the index still has an md to adopt.
  const reindexAdopted = await step('records/reindex-adopt-from-md', () => h.call('vibe_vmu_records', { action: 'reindex', by: 'r-acad' }))
  if (reindexAdopted && reindexAdopted.code === 'VMU_RECORDS_REINDEX_BLOCKED') predictReindexBlocked('md 是唯一真相：重建索引时磁盘上仍有成员 plain md 草案 ⇒ 按名拒并点名 not-a-vmu-md（RUN 259 政策）')
  const currentAfterReindex = reindexAdopted && Array.isArray(reindexAdopted.adopted) && reindexAdopted.adopted[0] ? reindexAdopted.adopted[0].id : null

  const restored = await step('records/restore-draft', () => h.call('vibe_vmu_records', { action: 'restore', id: draftId, by: 'r-acad' }))

  // ④ ── an UNTOUCHED tree reindexes as unchanged ──────────────────────────────────────────────────────────────────
  const reindexClean = await step('records/reindex-untouched', () => h.call('vibe_vmu_records', { action: 'reindex' }))
  if (reindexClean && reindexClean.code === 'VMU_RECORDS_REINDEX_BLOCKED') predictReindexBlocked('未动过的树：vmu md 全部 unchanged，但成员 plain md 草案仍在盘上 ⇒ 具名拒（同一政策）')

  // A HUMAN EDITS THE FILE (no tool call: this is the shell edit reindex exists for).
  const edited = await step('md/hand-edit', () => {
    // TB-2625: a missing md is a NAMED failure now, not a throw that would also lose the corpus.
    if (mdAbs === null) return { ok: false, code: 'SIM_BLUEPRINT_MD_MISSING' }
    const before = readFileSync(mdAbs, 'utf8')
    const after = before + NL + '外部补注（手工编辑）：r-2 建议补一条边界例 n = 0。' + NL
    writeFileSync(mdAbs, after)
    return { ok: true, path: mdAbs, bytesBefore: Buffer.byteLength(before), bytesAfter: Buffer.byteLength(after), sha256Before: sha256(before), sha256After: sha256(after) }
  })

  // The read must DISCLOSE the drift before reindex is called, and the two fingerprints must differ.
  const readAfterEdit = await step('blueprint/read-after-edit', () => h.call('vibe_v5_blueprint', { action: 'read', id: currentAfterReindex }))
  const reindexChanged = await step('records/reindex-changed', () => h.call('vibe_vmu_records', { action: 'reindex', by: 'r-acad' }))
  if (reindexChanged && reindexChanged.code === 'VMU_RECORDS_REINDEX_BLOCKED') predictReindexBlocked('手工改过 md 之后：changed 一条已重写，但 plain 草案仍让这次调用 ok:false（同一政策）')
  const reindexDryRunAfter = await step('records/reindex-dry-run-after', () => h.call('vibe_vmu_records', { action: 'reindex', dryRun: true }))
  if (reindexDryRunAfter && reindexDryRunAfter.code === 'VMU_RECORDS_REINDEX_BLOCKED') predictReindexBlocked('dryRun 也照实拒绝：预告里有改动、也有 1 条 blocked（同一政策，dryRun 不改盘不代表可以谎报成功）')
  const listFinal = await step('records/list-final', () => h.call('vibe_vmu_records', { action: 'list', track: 'blueprint', limit: 0 }))

  const check = (name, cond, evidence) => ({ name, ok: cond === true, evidence })
  const changedFirst = reindexChanged && Array.isArray(reindexChanged.changed) && reindexChanged.changed[0] ? reindexChanged.changed[0] : null
  const mdOnDiskAfterEdit = mdAbs ? readFileSync(mdAbs, 'utf8') : ''
  // The fs-first contract, measured from the receipts (TB-2625): the member writes the file, the index row fingerprints
  // THAT file, the codesign re-fingerprints the signed bytes, and only the adoption materialises the canonical md.
  const contract = {
    fsFirst: filedOf(draft) && filedOf(codesign) && mdAbs !== null,
    draftMdPath: draftRel,
    draftMdFile: draftAbs,
    chain: {
      propose: filedOf(draft),
      codesign: filedOf(codesign),
      adopt: Boolean(adopted && adopted.ok !== false && mdAbs !== null),
      read: Boolean(readAdopted && readAdopted.ok !== false),
    },
  }
  const checks = [
    check('the draft is the member file, and the index row fingerprints exactly those bytes',
      Boolean(draft) && draft.ok !== false && draft.mdOwner && draft.mdOwner.writtenBy === 'member-file'
        && draft.mdFingerprint === draftFileOpen.sha256 && draft.mdPath === draftRel
        && (draft.textSource === 'md' || draft.textArgumentDropped === true),
      { mdOwner: draft && draft.mdOwner, mdFingerprint: draft && draft.mdFingerprint, file: draftFileOpen && draftFileOpen.sha256, textSource: draft && draft.textSource }),
    check('the codesign re-fingerprints the signed bytes and keeps two authors on ONE row',
      Boolean(codesign) && filedOf(codesign) && codesign.mdFingerprint === draftFileSigned.sha256
        && Array.isArray(codesign.authors) && codesign.authors.length === 2 && codesign.id === draftId,
      { mdFingerprint: codesign && codesign.mdFingerprint, file: draftFileSigned && draftFileSigned.sha256, authors: codesign && codesign.authors, id: codesign && codesign.id }),
    check('only the adoption materialises the canonical md (kernel-owned, not the member draft)',
      mdAbs !== null && Boolean(adopted.mdOwner) && adopted.mdOwner.writtenBy === 'kernel-materialized'
        && adopted.md.exists === true,
      { mdOwner: adopted && adopted.mdOwner, path: adopted && adopted.path, absPath: mdAbs }),
    check('the blueprint was written to a markdown file a human can read',
      mdAbs !== null && /^# 蓝图｜/m.test(mdBefore) && /^## 正文$/m.test(mdBefore),
      { path: mdAbs, head: mdBefore.slice(0, 80) }),
    check('adopt with no path reads the path off the draft',
      Boolean(adopted) && adopted.pathFrom === 'draft',
      { pathFrom: adopted && adopted.pathFrom, pathSource: adopted && adopted.pathSource }),
    // RUN 228: this was a REAL DEFECT first (the receipt said pathFrom:"draft" and pathSource:"setting:..." in the same
    // breath). The fix landed; the check stays so the two fields can never disagree again - a recorded defect that is
    // only recorded regresses silently.
    check('the path source names the same origin as pathFrom',
      Boolean(adopted) && adopted.pathSource === adopted.pathFrom,
      { pathFrom: adopted && adopted.pathFrom, pathSource: adopted && adopted.pathSource }),
    check('the read receipt fingerprints the file that is on disk',
      Boolean(readAdopted) && readAdopted.mdFingerprint === sha256(mdBefore) && readAdopted.mdChangedSinceIndex === false,
      { mdFingerprint: readAdopted && readAdopted.mdFingerprint, disk: sha256(mdBefore) }),
    check('a draft row adopted into the current one says the md moved on from it',
      Boolean(readDraft) && readDraft.mdChangedSinceIndex === true
        && Boolean(readDraft.md) && readDraft.md.mdStatusMoved === true && readDraft.md.mdStatus === 'current',
      { mdChangedSinceIndex: readDraft && readDraft.mdChangedSinceIndex, mdStatusMoved: readDraft && readDraft.md && readDraft.md.mdStatusMoved, mdStatus: readDraft && readDraft.md && readDraft.md.mdStatus }),
    // The chain the scenario measures is "ONE draft per unadopted revision, CONTINUED rather than duplicated". The raw
    // `rev` is the records-layer version counter, not the blueprint revision: measured 1 -> 2 (the codesign supersedes
    // the draft row) -> 3 (the adoption also writes the draft row it promoted), so pinning `rev === 2` would encode an
    // implementation detail that fs-first legitimately changed instead of the invariant the file is about.
    check('the put -> supersede chain stays on ONE row and one revision (the codesign CONTINUES the draft)',
      Boolean(chainRow) && chainRow.id === draftId && chainRow.rev >= 2
        && Boolean(codesign.continuedBase) && codesign.continuedBase.continued === true
        && codesign.continuedBase.actual === draftId && codesign.revision === draft.revision,
      { id: chainRow && chainRow.id, rev: chainRow && chainRow.rev, revision: codesign && codesign.revision, continuedBase: codesign && codesign.continuedBase }),
    check('prune dry run moves nothing and says so',
      Boolean(prunePreview) && prunePreview.liveAfter === prunePreview.liveBefore && prunePreview.prunedCount === 0
        && Array.isArray(prunePreview.pruned) && prunePreview.pruned.every((p) => p.state === 'would-be-trashed'),
      { liveBefore: prunePreview && prunePreview.liveBefore, liveAfter: prunePreview && prunePreview.liveAfter, prunedCount: prunePreview && prunePreview.prunedCount }),
    check('prune names the in-force row it would move, and its count matches its list',
      Boolean(prunePreview) && prunePreview.dryRun === true
        && Array.isArray(prunePreview.inForceIds) && prunePreview.inForceIds.length === 1
        && prunePreview.doomedInForceCount === prunePreview.doomedInForceIds.length,
      { inForceIds: prunePreview && prunePreview.inForceIds, doomedInForceCount: prunePreview && prunePreview.doomedInForceCount, doomedInForceIds: prunePreview && prunePreview.doomedInForceIds }),
    check('the real prune moves the rows and keeps them restorable',
      Boolean(pruned) && pruned.prunedCount >= 1 && pruned.liveAfter === 0
        && Array.isArray(pruned.pruned) && pruned.pruned.every((p) => p.state === 'trashed'),
      { prunedCount: pruned && pruned.prunedCount, liveAfter: pruned && pruned.liveAfter }),
    check('reindex rebuilds the index row FROM the md after the rows went to the trash',
      Boolean(reindexAdopted) && reindexAdopted.counts.adopted >= 1 && currentAfterReindex !== null,
      { adopted: reindexAdopted && reindexAdopted.adopted, counts: reindexAdopted && reindexAdopted.counts }),
    check('restore brings back a trashed row',
      Boolean(restored) && restored.ok === true && restored.restoredCount === 1,
      { restoredCount: restored && restored.restoredCount, failed: restored && restored.failed }),
    check('an untouched tree reindexes as unchanged (nothing is rewritten)',
      Boolean(reindexClean) && reindexClean.counts.unchanged >= 1 && reindexClean.counts.changed === 0 && reindexClean.counts.adopted === 0,
      { counts: reindexClean && reindexClean.counts }),
    check('a hand-edited md is disclosed by read BEFORE reindex admits it',
      Boolean(readAfterEdit) && readAfterEdit.mdChangedSinceIndex === true
        && readAfterEdit.mdFingerprint === sha256(mdOnDiskAfterEdit)
        && readAfterEdit.indexFingerprint !== readAfterEdit.mdFingerprint,
      { mdChangedSinceIndex: readAfterEdit && readAfterEdit.mdChangedSinceIndex, mdFingerprint: readAfterEdit && readAfterEdit.mdFingerprint, indexFingerprint: readAfterEdit && readAfterEdit.indexFingerprint }),
    check('reindex recognises the edit as a CHANGE of one row, with its rowChoice and the new sha256',
      Boolean(reindexChanged) && reindexChanged.counts.changed === 1 && changedFirst !== null
        && changedFirst.rowChoice === 'status+revision' && changedFirst.mdFingerprint === sha256(mdOnDiskAfterEdit)
        && reindexChanged.historyKept === true,
      { counts: reindexChanged && reindexChanged.counts, changed: changedFirst }),
    check('a second reindex finds nothing left to do (the index agreed, once)',
      Boolean(reindexDryRunAfter) && reindexDryRunAfter.counts.changed === 0 && reindexDryRunAfter.counts.unchanged >= 1,
      { counts: reindexDryRunAfter && reindexDryRunAfter.counts }),
    check('the denied contradiction is refused by name, with a next move',
      Boolean(contradiction) && contradiction.ok === false && Boolean(contradiction.code) && Boolean(contradiction.hint),
      { code: contradiction && contradiction.code, hint: contradiction && contradiction.hint }),
  ]

  // RUN 228: the one real defect this scenario found (`pathFrom:"draft"` beside `pathSource:"setting:..."`) is FIXED in
  // `packs/v5r/tools.js`; the guard is the check above, not this list. Keep the list for anything a later run finds.
  const defects = []

  return {
    steps,
    failures,
    expectedRefusals,
    ids: { claim: claim && claim.recordId, draft: draftId, adopted: adopted && adopted.id, currentAfterReindex, appended: appended && appended.id, md: mdAbs },
    receipts: h.receipts.filter((r) => !expectedSeqs.has(r.seq)),
    promptChars: {},
    tree: h.tree ? h.tree() : [],
    // ★ TB-2625 — the runner reads `failures` (generic hook in run.mjs): a named self-check failure fails the run and
    // says which contract moved. Empty here means this scenario is on the fs-first contract.
    failures,
    highlights: {
      ids: { claim: claim && claim.recordId, draft: draftId, adopted: adopted && adopted.id, currentAfterReindex, appended: appended && appended.id, md: mdAbs },
      started, claim, progress, statePanel,
      listAll, listPropositions, listState, expanded, appended, listAfterAppend, statusBefore,
      draft, codesign, adopted, readAdopted, readDraft, contradiction, chainRow,
      draftFileOpen, draftFileSigned, contract,
      prunePreview, pruned, statusAfterPrune, reindexAdopted, restored,
      reindexClean, edited, readAfterEdit, reindexChanged, reindexDryRunAfter, listFinal,
      checks,
      defects,
      failures,
      expectedRefusals: h.receipts
        .filter((r) => expectedSeqs.has(r.seq))
        .map((r) => ({ seq: r.seq, tool: r.tool, args: r.args, code: r.receipt && r.receipt.code, message: r.receipt && r.receipt.message, hint: r.receipt && r.receipt.hint, why: 'EXPECTED: adopting the same draft twice contradicts the state, and the face refuses it by name instead of writing a second current row' })),
    },
  }
}

// run.mjs discovers a scenario by FILE NAME (`records-blueprint`) and looks for that key, then `scenario`, then
// `default`. The exported name asked for by the task is `recordsBlueprint`, so the runner-facing alias is added here
// instead of renaming the function (the file is the only registration step, and the file name is hyphenated).
export const scenario = recordsBlueprint
