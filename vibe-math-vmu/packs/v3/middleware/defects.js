/**
 * packs/v3/middleware/defects.js — PHASE 6 / **P1-9（defect 撤回＋归档证明）**。
 *
 * 目标：一条已归档的“通过/证明”在被判定为 defect 后，**所有读点都读不到“通过”**，而不是只在一个地方改字。
 * 做法：defect 标记是 `journal` 轨上的一条记录（标题前缀 `v3-defect｜<target>`，正文 `- status: withdrawn`），
 * 它成为**唯一真源**；本文件的 `proofVerdict()` 是所有 v3 侧读点共同调用的读取器：
 *   · 有 defect 标记 ⇒ `{state:'withdrawn', readableAsPassed:false}`
 *   · 否则有 verified 卡 ⇒ `{state:'passed', ...}`
 *   · 都没有 ⇒ `{state:'unknown'}`
 *
 * 三态撤回（至少一种要能断言）：`announce`＝只发公告（本模块的默认，纯记录，无需 fs）；
 * `delete`／`overwrite`＝要动归档文件本身 ⇒ **必须有宿主 fs 接缝**，没有就返回具名 `unenforced`（绝不假装撤回成功）。
 */
/** 直接按逻辑 `ID` 找 verified 卡（不 import dataplane，避免 dataplane↔defects 的循环依赖）。 */
function findVerifiedCard(records, id) {
  const list = records.list({ track: 'verified', limit: 0 }).items
  for (const head of list) {
    const rec = records.get({ id: head.id })
    const m = /- ID:\s*(.+)/.exec(rec.body)
    if (!m) continue
    if (m[1].trim() !== id) continue
    return { id }
  }
  return null
}

export const DEFECT_PREFIX = 'v3-defect｜'
export const DEFECT_CODE = Object.freeze({
  noteRequired: 'VMU_PACK_V3_DEFECT_NOTE_REQUIRED',
  unenforced: 'VMU_PACK_V3_DEFECT_UNENFORCED',
  withdrawn: 'VMU_PACK_V3_DEFECT_WITHDRAWN',
  modeUnknown: 'VMU_PACK_V3_DEFECT_MODE_UNKNOWN',
})
export const RETRACT_MODES = Object.freeze(['announce', 'delete', 'overwrite'])

const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** 最近一条 defect 标记；没有 ⇒ null。坏记录跳过（并让计数可见）。 */
export function latestDefect({ records, target } = {}) {
  const id = str(target)
  const list = records.list({ track: 'journal', limit: 0 }).items
  let best = null
  let bad = 0
  for (const head of list) {
    if (!str(head.title).startsWith(DEFECT_PREFIX)) continue
    const rec = records.get({ id: head.id })
    const t = /- target:\s*(.+)/.exec(rec.body)
    const s = /- status:\s*(\w+)/.exec(rec.body)
    if (!t || !s) { bad += 1; continue }
    if (t[1].trim() !== id) continue
    const row = { target: id, status: s[1], recordId: head.id, updatedAt: head.updatedAt || 0 }
    if (best === null || row.updatedAt >= best.updatedAt) best = row
  }
  return { ok: true, target: id || null, defect: best, bad }
}

/**
 * **共同真源读取器**：v3 侧所有“这算不算通过”的判断都必须经它。
 * 返回 `{state: 'withdrawn'|'passed'|'unknown', readableAsPassed, defectId?, recordId?, verifiedId?}`。
 */
export function proofVerdict({ records, target, fidelity = null } = {}) {
  const id = str(target)
  // 唯一写者/真源：内核 fidelity 的 `passedWithdrawn`。pack 不再写 journal 标记。
  if (fidelity && typeof fidelity.passedWithdrawnFor === 'function') {
    const marker = fidelity.passedWithdrawnFor(id)
    if (marker) return { ok: true, target: id, state: 'withdrawn', readableAsPassed: false, markerId: marker.markerId, source: 'fidelity' }
  }
  // 向后兼容：**旧** journal 标记仍被识别（只读），不会被静默丢弃。
  const defect = latestDefect({ records, target: id })
  if (defect.defect && defect.defect.status === 'withdrawn') {
    return { ok: true, target: id, state: 'withdrawn', readableAsPassed: false, defectId: defect.defect.recordId, source: 'legacy-journal' }
  }
  const verified = findVerifiedCard(records, id)
  if (verified) return { ok: true, target: id, state: 'passed', readableAsPassed: true, verifiedId: verified.id }
  return { ok: true, target: id, state: 'unknown', readableAsPassed: false }
}

/**
 * 记一条 defect 公告。**note 必填**：空/空白 ⇒ 返回具名拒**且不写任何记录**（证明保持不变）。
 */
export async function recordDefect({ records = null, target, note = null, by = 'v3-defects', at = null, fidelity = null } = {}) {
  const id = str(target)
  const why = str(note).trim()
  if (!id) return { ok: false, code: DEFECT_CODE.noteRequired, message: 'recordDefect needs a target', hint: 'pass { target }' }
  if (!why) {
    return {
      ok: false, code: DEFECT_CODE.noteRequired,
      message: 'recordDefect needs a NON-EMPTY note (a defect without a reason is not auditable)',
      hint: 'pass { note } explaining why the archived proof must no longer be read as passed; nothing was written',
    }
  }
  if (!fidelity || typeof fidelity.declareDefect !== 'function') {
    return {
      ok: false, code: DEFECT_CODE.unenforced, unenforced: true, target: id,
      message: 'defect markers live in the kernel fidelity registry, and no fidelity seam was provided',
      hint: 'pass { fidelity: <vmu.fidelity> }; the pack does NOT write a local marker (two truths is the defect)',
    }
  }
  const declared = await fidelity.declareDefect({ target: id, note: why, by })
  if (!declared || declared.ok === false) return { ok: false, code: (declared && declared.code) || DEFECT_CODE.unenforced, target: id, detail: declared || null }
  return { ok: true, target: id, status: 'withdrawn', source: 'fidelity', markerId: declared.marker && declared.marker.markerId ? declared.marker.markerId : null, durable: declared.durable === true }
}

/**
 * 三态撤回：
 *  · announce ⇒ 只写公告（recordDefect），无需 fs；
 *  · delete／overwrite ⇒ 要动归档文件本身，**必须**有 `fs.writeText`（或 `fs.delete`）接缝；
 *    缺失 ⇒ `{ok:false, code: VMU_PACK_V3_DEFECT_UNENFORCED, unenforced:true}`，**不写公告冒充成功**。
 * 返回回执里 `enforced` 如实报“哪一部分真的做了”。
 */
export async function retractArchivedProof({ records, target, note = null, mode = 'announce', fs = null, by = 'v3-defects', at = null, fidelity = null } = {}) {
  const m = str(mode)
  if (!RETRACT_MODES.includes(m)) return { ok: false, code: DEFECT_CODE.modeUnknown, message: 'unknown defect retract mode: ' + (m || '(empty)'), hint: 'one of ' + RETRACT_MODES.join('|') }
  if (m === 'announce') {
    const rec = await recordDefect({ records, target, note, by, at, fidelity })
    if (rec.ok !== true) return rec
    return Object.assign({}, rec, { mode: m, enforced: ['announce'], unenforced: [] })
  }
  const canWrite = fs && (typeof fs.writeText === 'function' || typeof fs.delete === 'function')
  if (!canWrite) {
    return {
      ok: false, code: DEFECT_CODE.unenforced, unenforced: true, mode: m, target: str(target),
      message: 'mode=' + m + ' needs the host fs seam (writeText/delete), and none is bound on this pack',
      hint: 'the archived proof was NOT deleted/overwritten and no completion is claimed; bind a host fs seam or use announce',
    }
  }
  // The fs seam exists but this pack does not own paths: it reports the intent and requires an explicit path,
  // rather than guessing which file is the archive. A missing path is a NAMED refusal, not a silent announce.
  return {
    ok: false, code: DEFECT_CODE.unenforced, unenforced: true, mode: m, target: str(target),
    message: 'mode=' + m + ' needs an explicit archive path; this pack does not guess paths',
    hint: 'pass the exact archived-proof path from the caller that owns the layout',
  }
}

export default { DEFECT_PREFIX, DEFECT_CODE, RETRACT_MODES, latestDefect, proofVerdict, recordDefect, retractArchivedProof }
