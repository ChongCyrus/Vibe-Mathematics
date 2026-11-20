// scripts/sim/scenarios/mainline.mjs — the main line of an institute, driven by a SCRIPT, not by a language model.
//
// The scenario is deliberately boring: it walks the same path a live chair walks (start the institute, put a claim on
// the record, agree a blueprint, write a paper, settle a vote, close the meeting, deliver) and records the receipt of
// every call. A live run needs 30 minutes and a model to produce these receipts; this needs one second. What the corpus
// is FOR is the audit: receipts that answer the wrong question, faces that promise what they cannot do, md files that
// disagree with their index rows — all of it shows up here without a model in the loop.

// ★ TB-2625 — THE BLUEPRINT DRAFT MD IS THE MEMBER'S OWN FILE (fs-first, TB-2613 / RUN 255). The scenario plays the
// member's file tool exactly as a host would, so the blueprint chain below is the real one:
//     fs writes Members/<seat>/Drafts/protocol-r1.md  →  propose(mdPath) → codesign(rewrite same md, propose(mdPath))
//     →  adopt (the kernel writes the canonical Shared/Protocol.md)  →  read
// A propose WITHOUT mdPath writes neither a file nor a row and answers {ok:true, filed:false, id:null,
// draftMdMissing:true} (packs/v5r/blueprint.js:1633). This scenario used to call propose without mdPath and then use
// the missing draft id, so a contract change turned the gate red with two VMU_INVALID_ARGUMENT — the most dangerous
// colour, because the next person's real failure gets waved through as "the known mainline problem". Hence the
// CONTRACT SELF-CHECK below: the run is red by NAME when the contract moves again, never silently green.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NL = String.fromCharCode(10)

/**
 * @param {{ call: Function, receipts: Array, prompts: any, tree: Function, root: string }} h — the harness from ../harness.mjs
 * @param {{ log?: Function }} [opts]
 */
export async function mainline(h, { log = () => {} } = {}) {
  const steps = []
  // Named reds. `run.mjs` writes them into the corpus and exits NON-ZERO on them (a self-check that only lives in a
  // comment is not a check), and `tests/sim-mainline.test.mjs` asserts the list is empty.
  const failures = []
  // Refusals this scenario PREDICTS, pinned by receipt seq (TB-2650): the reindex refusal is POLICY - a member-written
  // plain md draft is a file the index cannot own, and RUN 259 turned that silent ok into a named refusal. One entry
  // here excuses exactly one refusal; the seq is what points at the receipt it excuses.
  const expectedRefusals = []
  const lastSeq = () => (h.receipts.length ? h.receipts[h.receipts.length - 1].seq : null)
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  // The one reading of "this propose FILED a draft" that both the old and the new receipt shapes satisfy.
  // The kernel omits `filed` on the success path (it only appears as `filed:false` on the unfiled one), so the reading
  // is: not refused, not draftMdMissing, and it hands back a draft row id. `filed:true` is this scenario's NAME for
  // that shape, printed into steps/highlights so the corpus says it in one word a reviewer can grep.
  const filedOf = (r) => Boolean(r && r.ok !== false && r.filed !== false && r.draftMdMissing !== true && typeof r.id === 'string' && r.id !== '')


  // ① the institute exists
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（占位题：本场景只压机制，不压数学）。',
    researcherCount: 2,
  }))

  // ② a claim goes on the record (chair states it, as a proposition card)
  const claim = await step('record/proposition', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2',
    value: '对任意正整数 n 成立',
    p: 0.9,
    motive: '主线命题：由蓝图与论文共同承载',
    member: 'r-1',
  }, { as: { agent: { id: 'r-1' } } }))

  // ③ a blueprint draft, then adoption (the md file is the truth; the row is its index)
  // fs-first: the DRAFT document belongs to the member, so the scenario plays the member's file tool and names the file
  // in `mdPath`. The path resolves under `<workspace>/VibeMath/` — that is what the refusal hint says when it is wrong,
  // and what the harness workspace looks like (end-to-end.mjs writes its draft the same way).
  const draftRel = 'Members/r-acad/Drafts/protocol-r1.md'
  const draftFile = join(h.root, 'VibeMath', draftRel)
  const draftBody = '# 公共蓝图' + NL +
    '- 命题：前 n 个奇数之和 = n²。' + NL +
    '- 路线：对 n 归纳；奇数是 n²-(n-1)² 的差分。' + NL
  const draftText = '# 公共蓝图' + NL + '- 命题：前 n 个奇数之和 = n²。' + NL + '- 路线：对 n 归纳；奇数是 n²-(n-1)² 的差分。'
  await step('blueprint/draft-md', async () => {
    mkdirSync(dirname(draftFile), { recursive: true })
    writeFileSync(draftFile, draftBody)
    return { ok: true }
  })
  const draft = await step('blueprint/propose', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    path: 'Shared/Protocol.md',
    member: 'r-acad',
    mdPath: draftRel,
    text: draftText,
  }))
  // ── CONTRACT SELF-CHECK (TB-2625) ─────────────────────────────────────────────────────────────────────────────
  // The failure this catches: the contract moves again (the default flips back to kernel-materialized, or a new required
  // field appears) and `propose` stops filing. Without this check the scenario walks on with `draftId = null`, the next
  // two calls are refused VMU_INVALID_ARGUMENT, and the run goes red for something that LOOKS like a product bug — the
  // exact confusion this task exists to end. Now the red carries the contract's name and the receipt evidence.
  if (!filedOf(draft)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'blueprint/propose',
      message: '场景没跟上 fs-first 契约：blueprint propose 没有落成草案（没拿到草案 id），后续 adopt/read 必然失败',
      means: 'fs-first 下 propose 必须带 mdPath（成员自己的草案 md）才有行与文件；text-only 只答 draftMdMissing:true',
      receipt: draft && {
        ok: draft.ok, filed: draft.filed, draftMdMissing: draft.draftMdMissing, id: draft.id,
        mdPath: draft.mdPath, nextActions: draft.nextActions, note: draft.note,
      },
    })
  }
  const draftId = (draft && (draft.id || draft.recordId)) || null
  // Shared design: a continuation rewrites the SAME draft document (one draft, one file), then re-proposes with the same
  // mdPath. Appending the chair's own design section to the member document is what a live seat would do.
  const codesignSection = '## 共同设计补充｜r-1' + NL + '- 复核归纳步：n=1 时 1=1² 成立。' + NL
  await step('blueprint/codesign-md', async () => {
    writeFileSync(draftFile, draftBody + NL + codesignSection)
    return { ok: true }
  })
  const codesign = await step('blueprint/codesign', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    draft: draftId,
    path: 'Shared/Protocol.md',
    member: 'r-1',
    mdPath: draftRel,
    text: codesignSection,
  }, { as: { agent: { id: 'r-1' } } }))
  if (!filedOf(codesign)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'blueprint/codesign',
      message: '场景没跟上 fs-first 契约：共同设计的续写没有落成（没拿到草案 id），adopt 会因缺共同设计留痕被拒',
      means: 'fs-first 下续写要把整份正文写进同一份草案 md，再带同一个 mdPath 重新 propose',
      receipt: codesign && {
        ok: codesign.ok, filed: codesign.filed, draftMdMissing: codesign.draftMdMissing, id: codesign.id, authors: codesign.authors,
      },
    })
  }
  const adopted = await step('blueprint/adopt', () => h.call('vibe_v5_blueprint', {
    action: 'adopt',
    path: 'Shared/Protocol.md',
    draft: draftId,
    member: 'r-acad',
  }))
  const blueprintRead = await step('blueprint/read', () => h.call('vibe_v5_blueprint', { action: 'read', id: draftId }))

  // ── TB-2795 / MAIN.4–13 (round-17 audit B4): the TEN-field schema was only reachable from the TEST, never from a
  //    RULE-mapped step: every rule-mapped propose had `outlineCount:0`, so `VMU_BLUEPRINT_FIELDS_MISSING` never
  //    appeared in a rule-step receipt and `outlineFieldsComplete` lived only in non-rule steps. These steps are the
  //    rule-level evidence: ① an incomplete node is REFUSED with missing/missingCn/nodes/shape readable per field;
  //    ② a complete node writes; ③ read/state carry outline[].fields (ten keys) + outlineFieldsComplete:true;
  //    ④ a revision written BEFORE the schema reads outlineFieldsComplete:false — never dressed up as complete.
  const fieldNode = {
    evaluationNow: '当前评价：结构已能承载十字段，但只验机制不评数学。',
    initialPlan: { plan: '先立蓝图骨架，再逐节点补字段。', inspiration: '规则要求每方向/路线/节点记录十字段。', initialTargets: '让 propose/read 都能逐字段复核。' },
    relatedPlans: ['前 n 个奇数之和 = n^2 的归纳证明路线'],
    feasibility: { assessment: '可行：字段是声明式 schema，写入前已逐项校验。', reasons: 'TB-2795 在 blueprint.js 里用同一份 schema 校验与读取。' },
    value: { assessment: '价值：规则层因此可以逐字段审计，而不是只看散文。', reasons: '字段缺失会被具名拒，完整会被聚合读数确认。' },
    findings: [{ kind: 'proposition', note: '前 n 个奇数之和 = n^2（占位命题，不声称已证）' }],
    obstacles: [{ what: '旧 revision 没有 fields', why: 'schema 是后加的，读面必须区分旧记录与完整记录' }],
    obstacleSolutions: [{ obstacleRef: '旧 revision 没有 fields', plan: '旧记录读 fields:null/fieldsComplete:false，新提案严格校验' }],
    implementation: { status: '已实施：propose 严格校验、read/state 聚合读数。', effects: '规则步现在能逐字段复核。', lessons: '结构必须随行与读面一起走，否则测试绿而规则盲。' },
    pastExperience: ['round-17 审计 B4：没有规则步读 fields/fieldsSchema 就是盲区。'],
  }
  const fieldsIncomplete = await step('blueprint/fields/incomplete', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Fields.md', member: 'r-acad', text: '节点字段校验（缺字段）',
    fieldsSchema: 'vmu.blueprint.fields@1',
    outline: [{ id: 'n1', title: '节点一（缺字段）', depth: 1, fields: { evaluationNow: '只有一条字段' } }],
  }))
  if (fieldsIncomplete && fieldsIncomplete.ok === false && fieldsIncomplete.code === 'VMU_BLUEPRINT_FIELDS_MISSING') {
    expectedRefusals.push({ seq: lastSeq(), tool: 'vibe_v5_blueprint', code: 'VMU_BLUEPRINT_FIELDS_MISSING', why: 'TB-2795 严格 schema：outline 节点缺必需字段必须具名拒并逐字段点名（MAIN.4–13 拒绝侧规则步）' })
  } else {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_MISSING_NOT_REFUSED', step: 'blueprint/fields/incomplete', message: '缺字段的 outline 节点没有被 VMU_BLUEPRINT_FIELDS_MISSING 具名拒', means: 'TB-2795 的严格校验必须能在规则步上被看到；一条不拒就等于规则层无法区分「校验在」与「校验不在」', receipt: fieldsIncomplete })
  }
  const fieldDetail = (fieldsIncomplete && fieldsIncomplete.detail) || null
  if (!(fieldDetail && Array.isArray(fieldDetail.missing) && fieldDetail.missing.length === 9 && Array.isArray(fieldDetail.missingCn) && fieldDetail.missingCn.length === 9 && Array.isArray(fieldDetail.nodes) && fieldDetail.nodes.length === 1 && typeof fieldDetail.shape === 'string' && fieldDetail.schema === 'vmu.blueprint.fields@1')) {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_DETAIL_NOT_FIELDWISE', step: 'blueprint/fields/incomplete', message: '拒绝回执的 detail 没有逐字段点名（missing/missingCn/nodes/shape/schema）', means: '规则层要逐字段可核：只有一个 code 的拒绝，审的人不知道缺的是哪九个字段', receipt: fieldDetail })
  }
  const fieldsCompleteProposal = await step('blueprint/fields/complete', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Fields.md', member: 'r-acad', text: '节点字段校验（十字段齐全）',
    materialize: true, // fs-first is the production default; this step asks the kernel to write the draft by NAME so the read below has a real row id
    fieldsSchema: 'vmu.blueprint.fields@1',
    outline: [{ id: 'n1', title: '节点一（十字段齐全）', depth: 1, fields: fieldNode }, { id: 'n2', title: '节点二（十字段齐全）', depth: 2, fields: fieldNode }],
  }))
  const completeId = (fieldsCompleteProposal && (fieldsCompleteProposal.id || fieldsCompleteProposal.recordId)) || null
  const fieldsCodesign = await step('blueprint/fields/codesign', () => h.call('vibe_v5_blueprint', {
    action: 'propose', draft: completeId, path: 'Shared/Fields.md', member: 'r-1',
    mdPath: (fieldsCompleteProposal && fieldsCompleteProposal.mdPath) || 'Shared/Drafts/Fields-r1.md',
    text: '## 共同设计补充｜r-1' + NL + '- 十字段形状复核完成，同意进入 current。' + NL,
  }, { as: { agent: { id: 'r-1' } } }))
  const fieldsAdopt = await step('blueprint/fields/adopt', () => h.call('vibe_v5_blueprint', {
    action: 'adopt', path: 'Shared/Fields.md', draft: completeId, member: 'r-acad',
  }))
  const fieldsRead = await step('blueprint/fields/read', () => h.call('vibe_v5_blueprint', { action: 'read', id: completeId }))
  const outlineRows = fieldsRead && Array.isArray(fieldsRead.outline) ? fieldsRead.outline : []
  const tenKeys = ['evaluationNow', 'initialPlan', 'relatedPlans', 'feasibility', 'value', 'findings', 'obstacles', 'obstacleSolutions', 'implementation', 'pastExperience']
  const rowsComplete = outlineRows.length === 2 && outlineRows.every((r) => r && r.fieldsComplete === true && r.fields && tenKeys.every((k) => Object.prototype.hasOwnProperty.call(r.fields, k)) && (!r.fieldsMissing || r.fieldsMissing.length === 0))
  if (!(fieldsRead && fieldsRead.ok !== false && rowsComplete && fieldsRead.outlineFieldsComplete === true && fieldsRead.fieldsSchema === 'vmu.blueprint.fields@1' && Array.isArray(fieldsRead.outlineFieldsMissing) && fieldsRead.outlineFieldsMissing.length === 0)) {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_READ_SURFACE', step: 'blueprint/fields/read', message: 'read 没有回 outline[].fields（十键）+ fieldsComplete:true + outlineFieldsComplete:true 的聚合', means: 'MAIN.4–13 的允许侧要有逐字段读面：没有它，「字段齐全」只是测试里的一句话', receipt: { outlineCount: fieldsRead && fieldsRead.outlineCount, outlineFieldsComplete: fieldsRead && fieldsRead.outlineFieldsComplete, rows: outlineRows.map((r) => ({ id: r.id, fieldsComplete: r.fieldsComplete, keys: r.fields ? Object.keys(r.fields).length : null })) } })
  }
  const fieldsState = await step('blueprint/fields/state', () => h.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Fields.md' }))
  if (!(fieldsState && fieldsState.action === 'state' && fieldsState.outlineFieldsComplete === true && fieldsState.fieldsSchema === 'vmu.blueprint.fields@1')) {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_STATE_SURFACE', step: 'blueprint/fields/state', message: 'state 面没有给 outlineFieldsComplete:true 的聚合读数', means: '读面与提案面必须同源：只在一个面上对，等于另一个面上的读者仍盲', receipt: { action: fieldsState && fieldsState.action, outlineFieldsComplete: fieldsState && fieldsState.outlineFieldsComplete, fieldsSchema: fieldsState && fieldsState.fieldsSchema } })
  }
  // ★ round-18 blind spot 1: a legacy record with an OUTLINE NODE and no `fields` did not exist in the fresh corpus
  // (only an outline-less revision was read, so `"fields":null` appeared 0 times). New proposals are strict whenever
  // an outline is provided, so a pre-schema node cannot be produced through `propose` any more — the honest way to
  // have one in the corpus is to seed the durable ledger with the row an older build really wrote (the records face is
  // the same durable store the blueprint rows live in; md-ownership.mjs uses h.records the same way). The read/state
  // steps below then prove the READ face distinguishes it from a complete node.
  const legacyOutline = [{ id: 'legacy-node', title: '旧节点（schema 之前，无 fields）', depth: 1 }]
  const legacyBody = [
    '- path：Shared/Legacy.md',
    '- status：current',
    '- revision：1',
    '- proposedBy：r-acad',
    '- proposedAt：2026-11-19T00:00:00.000Z',
    '- proposalId：legacy-1',
    '- outline：' + JSON.stringify(legacyOutline),
    '## 正文',
    'schema 之前写下的旧蓝图正文（节点没有十字段）。',
  ].join(NL)
  const legacySeed = await step('blueprint/fields/legacy-seed', () => h.records.put({ track: 'blueprint', kind: 'blueprint', title: 'Legacy blueprint (schema 之前)', body: legacyBody }))
  const legacyId = (legacySeed && (legacySeed.id || (legacySeed.record && legacySeed.record.id))) || null
  const fieldsLegacy = await step('blueprint/fields/legacy-read', () => h.call('vibe_v5_blueprint', { action: 'read', id: legacyId }))
  const legacyReadNode = fieldsLegacy && Array.isArray(fieldsLegacy.outline) ? fieldsLegacy.outline[0] || null : null
  const legacyReadOk = Boolean(fieldsLegacy && fieldsLegacy.ok !== false
    && fieldsLegacy.outlineFieldsComplete === false
    && fieldsLegacy.fieldsSchema === 'vmu.blueprint.fields@1'
    && legacyReadNode && legacyReadNode.fields === null && legacyReadNode.fieldsComplete === false
    && Array.isArray(legacyReadNode.fieldsMissing) && legacyReadNode.fieldsMissing.length === 10)
  if (!legacyReadOk) {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_LEGACY_READ', step: 'blueprint/fields/legacy-read', message: 'schema 之前的 revision 读面没有如实报 fields:null / fieldsComplete:false / fieldsMissing 10 项', means: 'legacy 记录必须与完整记录可区分：读面把旧记录读成 complete、或只读回 outlineCount 0，都让「旧记录不伪装完整」无法在层内复核', receipt: { outlineCount: fieldsLegacy && fieldsLegacy.outlineCount, outlineFieldsComplete: fieldsLegacy && fieldsLegacy.outlineFieldsComplete, node: legacyReadNode && { fields: legacyReadNode.fields, fieldsComplete: legacyReadNode.fieldsComplete, fieldsMissing: legacyReadNode.fieldsMissing } } })
  }
  const fieldsLegacyState = await step('blueprint/fields/legacy-state', () => h.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Legacy.md' }))
  const legacyStateNode = fieldsLegacyState && Array.isArray(fieldsLegacyState.outline) ? fieldsLegacyState.outline[0] || null : null
  const legacyStateOk = Boolean(fieldsLegacyState && fieldsLegacyState.ok !== false
    && fieldsLegacyState.outlineFieldsComplete === false
    && legacyStateNode && legacyStateNode.fields === null && legacyStateNode.fieldsComplete === false
    && Array.isArray(legacyStateNode.fieldsMissing) && legacyStateNode.fieldsMissing.length === 10)
  if (!legacyStateOk) {
    failures.push({ code: 'SIM_BLUEPRINT_FIELDS_LEGACY_STATE', step: 'blueprint/fields/legacy-state', message: 'state 面没有把 schema 之前的旧 revision 读成 fields:null / fieldsComplete:false / fieldsMissing 10 项', means: 'legacy 的区分必须在 state 与 read 两个读面同源成立；只在一个面对，另一个面的读者仍然盲', receipt: { outlineCount: fieldsLegacyState && fieldsLegacyState.outlineCount, outlineFieldsComplete: fieldsLegacyState && fieldsLegacyState.outlineFieldsComplete, node: legacyStateNode && { fields: legacyStateNode.fields, fieldsComplete: legacyStateNode.fieldsComplete, fieldsMissing: legacyStateNode.fieldsMissing } } })
  }
  const blueprintFields = {
    incomplete: { code: fieldsIncomplete && fieldsIncomplete.code, detail: fieldDetail && { schema: fieldDetail.schema, missing: fieldDetail.missing, missingCn: fieldDetail.missingCn, nodes: Array.isArray(fieldDetail.nodes) ? fieldDetail.nodes.length : null, shape: fieldDetail.shape } },
    complete: { id: completeId, ok: fieldsCompleteProposal && fieldsCompleteProposal.ok !== false, outlineCount: fieldsCompleteProposal && fieldsCompleteProposal.outlineCount },
    read: { outlineCount: fieldsRead && fieldsRead.outlineCount, outlineFieldsComplete: fieldsRead && fieldsRead.outlineFieldsComplete, perNode: outlineRows.map((r) => ({ id: r.id, fieldsComplete: r.fieldsComplete, keys: r.fields ? Object.keys(r.fields) : [], fieldsMissing: r.fieldsMissing })) },
    state: { outlineFieldsComplete: fieldsState && fieldsState.outlineFieldsComplete },
    legacy: { id: legacyId, outlineCount: fieldsLegacy && fieldsLegacy.outlineCount, outlineFieldsComplete: fieldsLegacy && fieldsLegacy.outlineFieldsComplete, node: legacyReadNode && { fields: legacyReadNode.fields, fieldsComplete: legacyReadNode.fieldsComplete, fieldsMissing: legacyReadNode.fieldsMissing }, stateOutlineFieldsComplete: fieldsLegacyState && fieldsLegacyState.outlineFieldsComplete },
    means: 'MAIN.4–13 rule-step evidence: per-field refusal (missing/missingCn/nodes/shape), complete node writes, read/state aggregate true, legacy revision reads false (never dressed up)',
  }
  const reindex = await step('record/reindex', () => h.call('vibe_vmu_records', { action: 'reindex', track: 'blueprint' }))
  // TB-2650 (MEASURED): the plain md draft this scenario wrote for the member is still on disk after adoption, and
  // `not-a-vmu-md` is one of the classes RUN 259 made blocking. The refusal is predictd here BY SEQ so the agent ledger
  // stays honest: if the code disappears, the entry becomes `declared-but-never-hit` instead of hiding a real change.
  if (reindex && reindex.ok === false && reindex.code === 'VMU_RECORDS_REINDEX_BLOCKED') {
    expectedRefusals.push({
      seq: lastSeq(),
      tool: 'vibe_vmu_records',
      code: 'VMU_RECORDS_REINDEX_BLOCKED',
      why: '成员自己 fs 写的 plain md 草案仍在磁盘上（fs-first 契约）：reindex 按名拒并点名 not-a-vmu-md（RUN 259/TB-2650 政策），不是场景故障',
    })
  }

  // ④ a paper: start → part → advance → review → final → render → compile
  const paper = await step('paper/start', () => h.call('vibe_v5_paper', {
    action: 'start',
    participants: ['r-1', 'r-2'],
    target: 'sim-paper-mainline',
    title: '前 n 个奇数之和 = n²',
  }))
  const part = await step('paper/part', () => h.call('vibe_v5_paper', {
    action: 'part',
    target: 'sim-paper-mainline',
    part: 'theorem',
    member: 'r-1',
    body: '命题：对任意正整数 n，前 n 个奇数之和等于 $n^2$。\n证据等级：draft',
  }, { as: { agent: { id: 'r-1' } } }))
  const advanced = await step('paper/advance', () => h.call('vibe_v5_paper', { action: 'advance', target: 'sim-paper-mainline', member: 'r-acad' }))
  const reviewed = await step('paper/review', () => h.call('vibe_v5_paper', {
    action: 'review',
    target: 'sim-paper-mainline',
    member: 'r-2',
    deliverable: true,
  }, { as: { agent: { id: 'r-2' } } }))
  const rendered = await step('paper/render', () => h.call('vibe_v5_paper', { action: 'render', target: 'sim-paper-mainline', member: 'r-acad' }))
  const compiled = await step('paper/compile', () => h.call('vibe_v5_paper', { action: 'compile', target: 'sim-paper-mainline', member: 'r-acad' }))

  // ⑤ a meeting: convene (with the durable invitation), attend, motion, vote, close
  const meeting = await step('meeting/open', () => h.call('vibe_v5_meeting', {
    agenda: '确认主线命题与论文定稿',
    kind: 'sync',
    member: 'r-acad',
  }))
  const meetingId = meeting && (meeting.meeting || meeting.id) ? (meeting.meeting || meeting.id) : null
  const attendance = []
  for (const seat of ['r-acad', 'r-1', 'r-2']) {
    attendance.push(await step('meeting/attend/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: seat }, { as: { agent: { id: seat } } })))
  }
  const motion = await step('meeting/motion', () => h.call('vibe_v5_motion', { meeting: meetingId, kind: 'resolution', text: '本主线命题以现有证据通过', member: 'r-acad' }))
  const motionId = motion && (motion.motion || motion.id) ? (motion.motion || motion.id) : null
  const votes = []
  for (const seat of ['r-1', 'r-2']) {
    votes.push(await step('meeting/vote/' + seat, () => h.call('vibe_vmu_meeting', { action: 'vote', meeting: meetingId, motion: motionId, member: seat, value: 1 }, { as: { agent: { id: seat } } })))
  }
  const closed = await step('meeting/close', () => h.call('vibe_vmu_meeting', { action: 'close', id: meetingId, member: 'r-acad', by: 'r-acad' }))

  // ⑥ what the seats would have been told (prompt capture, one assembly per seat)
  const promptChars = {}
  if (h.prompts && h.prompts.assembleFor) {
    for (const seat of ['chair', 'member', 'temp']) {
      const text = await h.prompts.assembleFor({ seat, phase: 'normal' })
      promptChars[seat] = text.length
    }
  }

  // The blueprint chain, read once, so the corpus and the gate can both say "four steps, in order, all filed" without
  // re-deriving it from a receipt shape that the kernel may change again.
  const contract = {
    fsFirst: filedOf(draft) && filedOf(codesign),
    draftMdPath: draftRel,
    draftMdFile: draftFile,
    chain: {
      propose: filedOf(draft),
      codesign: filedOf(codesign),
      adopt: Boolean(adopted && adopted.ok !== false && (adopted.id || adopted.adoptedBy)),
      read: Boolean(blueprintRead && blueprintRead.ok !== false),
    },
  }

  return {
    steps,
    failures,
    expectedRefusals,
    contract,
    ids: { meeting: meetingId, motion: motionId, paper: (paper && (paper.started || paper)) || null },
    receipts: h.receipts,
    promptChars,
    tree: h.tree ? h.tree() : [],
    highlights: { started, claim, draft, codesign, adopted, blueprintRead, reindex, paper, part, advanced, reviewed, rendered, compiled, closed, contract, blueprintFields },
  }
}
