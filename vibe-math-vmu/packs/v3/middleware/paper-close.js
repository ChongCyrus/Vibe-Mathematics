/**
 * packs/v3/middleware/paper-close.js — PHASE 6 / **P1-10（论文收口）**。
 *
 * v3 的收口语义（`vibe-math-v3.js:4646-4850`）：**先产论文、再停机**；产物四件齐才算完成，缺一件**不宣称完成**。
 * 本复刻把“论文产物”落成 `journal` 轨的记录（pack 没有 fs 接缝；与 P1-5 的 file 路同一结论），四件分别是
 * `md`／`tex`／`pdf`／`meta`（v3 的 `paper.md`／`paper.tex`／`paper.pdf`／`paper.meta.json` 的等价物）。
 *
 * · `finalizePaper`：四件缺一 ⇒ 返回具名 `VMU_PACK_V3_PAPER_INCOMPLETE`（含 `missing` 列表），**不写完成记录、
 *   `completed:false`**——绝不把“缺件”报成完成；
 * · `closeout`：**先产论文再停机**。缺件时若给了 `turn`，**从 tick 处理器里**派一次 `paper-writer` 回合（绝不从
 *   turn 钩子里派，避免重入），然后**重新检查**；仍缺 ⇒ 具名 incomplete、`completed:false`；齐了才 `completed:true`。
 *
 * 触发：清单条目 `v3-paper-close` 挂在 `v3/tick` 上；只有 `vmu.v3.paperCloseTarget` 非空时才工作（空＝零机制）。
 */
import { writeBody } from './dataplane.js'

export const PAPER_ARTIFACTS = Object.freeze(['md', 'tex', 'pdf', 'meta'])
export const PAPER_PREFIX = 'v3-paper｜'
export const PAPER_FINAL_PREFIX = 'v3-paper-final｜'
export const PAPER_INCOMPLETE = 'VMU_PACK_V3_PAPER_INCOMPLETE'

const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** 某对象的论文产物集合（按 journal 标题 `v3-paper｜<target>｜<artifact>` 读）。 */
export function paperArtifacts({ records, target } = {}) {
  const id = str(target)
  const present = []
  for (const head of records.list({ track: 'journal', limit: 0 }).items) {
    const title = str(head.title)
    const prefix = PAPER_PREFIX + id + '｜'
    if (!title.startsWith(prefix)) continue
    const artifact = title.slice(prefix.length)
    if (PAPER_ARTIFACTS.includes(artifact) && !present.includes(artifact)) present.push(artifact)
  }
  return { target: id, present, missing: PAPER_ARTIFACTS.filter((a) => !present.includes(a)), complete: present.length === PAPER_ARTIFACTS.length }
}

/** 记一件产物。artifact 必须在四件名单里（未知 ⇒ 具名拒，不静默丢）。 */
export function recordPaperArtifact({ records, target, artifact, body = '', at = null, by = 'v3-paper' } = {}) {
  const id = str(target)
  const art = str(artifact)
  if (!id) return { ok: false, code: PAPER_INCOMPLETE, message: 'recordPaperArtifact needs a target', hint: 'pass { target }' }
  if (!PAPER_ARTIFACTS.includes(art)) {
    return { ok: false, code: PAPER_INCOMPLETE, message: 'unknown paper artifact: ' + (art || '(empty)'), hint: 'one of ' + PAPER_ARTIFACTS.join('|') }
  }
  // 正文至少带 target+artifact：默认 fingerprint 策略是 content-only（标题不进指纹），四件/多项目同空正文会被折成一条。
  const rec = writeBody({ records, track: 'journal', kind: 'state', title: PAPER_PREFIX + id + '｜' + art, body: str(body) || ('artifact: ' + art + ' for ' + id), settled: true, by })
  return { ok: true, recordId: rec && rec.id ? rec.id : null, target: id, artifact: art, at }
}

/** 收口判定：四件齐 ⇒ 写完成记录并 `completed:true`；缺一件 ⇒ 具名拒 + `completed:false`（不宣称完成）。 */
export function finalizePaper({ records, target, at = null, by = 'v3-paper' } = {}) {
  const id = str(target)
  const state = paperArtifacts({ records, target: id })
  if (!state.complete) {
    return {
      ok: false, completed: false, code: PAPER_INCOMPLETE, target: id,
      missing: state.missing, present: state.present, artifacts: PAPER_ARTIFACTS.slice(),
      message: 'paper is NOT finalised: missing artifact(s) ' + (state.missing.join(', ') || '(none)'),
      hint: 'produce ALL FOUR artifacts (' + PAPER_ARTIFACTS.join(', ') + ') before claiming closure; nothing was marked complete',
    }
  }
  const rec = writeBody({ records, track: 'journal', kind: 'state', title: PAPER_FINAL_PREFIX + id, body: ['- target: ' + id, '- status: completed', '- artifacts: ' + PAPER_ARTIFACTS.join(','), '- at: ' + (Number.isFinite(at) ? at : 'unknown')].join('\n'), settled: true, by })
  return { ok: true, completed: true, target: id, artifacts: PAPER_ARTIFACTS.slice(), recordId: rec && rec.id ? rec.id : null }
}

/**
 * **先产论文再停机**：缺件时（且给了 turn）派一次 paper-writer 回合，再重新检查。
 * 注意：调用方必须是 `v3/tick` 处理器（turn 内再派会被 VMU_TURN_REENTRANT 拒）；本函数不自己“停机”，只返回是否
 * 允许停机（`completed:true` 才是）。缺件 ⇒ `completed:false` + 具名 code，绝不宣称完成。
 */
export async function closeout({ records, turn = null, target, at = null, by = 'v3-paper', dispatch = null } = {}) {
  const id = str(target)
  const first = finalizePaper({ records, target: id, at, by })
  if (first.completed) return Object.assign({}, first, { dispatched: false, stopped: true })
  if (!turn || (typeof turn.run !== 'function' && typeof turn.dispatch !== 'function')) {
    return Object.assign({}, first, { dispatched: false, stopped: false, note: 'no turn seam: cannot produce the paper; closure is NOT claimed' })
  }
  let turnId = null
  // ★ SLV / TWO-PHASE: the closeout hook MUST NOT await the paper-writer turn (tick budget). It dispatches it; a later
  // tick calls closeout again, finds the artifacts, and finalizes. `pending:true` is the observable "waiting for reply".
  if (typeof turn.dispatch === 'function') {
    try {
      const ds = typeof turn.dispatchStatus === 'function' ? turn.dispatchStatus() : null
      if (ds && ((Number(ds.queued) || 0) > 0 || (Number(ds.inFlight) || 0) > 0)) {
        return Object.assign({}, first, { dispatched: false, pending: true, stopped: false,
          note: 'paper-writer NOT dispatched: the serial turn queue already has work (the closeout will retry on a later tick)' })
      }
    } catch { /* fall through: the dispatch below is still correct */ }
    try {
      const dispatched = turn.dispatch({
        member: 'paper-writer', role: 'paper-writer', phase: 'normal', task: 'v3-paper',
        statusBlock: JSON.stringify((() => {
          // ★ SLV: the writer must get the MATERIAL it is allowed to use - the verified cards. Without it a real writer
          // honestly answered "MATERIAL 缺失下的诚实回执" (skeleton placeholders only).
          const material = []
          try {
            for (const it of records.list({ track: 'verified', limit: 0 }).items.slice(0, 8)) {
              const rec = records.get({ id: it.id })
              material.push({ id: it.id, body: String((rec && rec.body) || '').slice(0, 6000) })
            }
          } catch { /* the writer still receives target/instruction */ }
          return { target: id, artifacts: PAPER_ARTIFACTS, material,
            instruction: '用 material 里的 verified 证据写完整论文；四件产物由框架从你的回执记录。顶层只允许 progress。' }
        })()),
        why: 'paper closeout: four artifacts must exist before stopping (missing: ' + first.missing.join(', ') + ')',
        round: 1,
      })
      if (typeof dispatch === 'function') dispatch(dispatched)
      return Object.assign({}, first, { dispatched: true, pending: true, stopped: false,
        turn: dispatched.turn && dispatched.turn.id ? dispatched.turn.id : null,
        note: 'paper-writer turn dispatched; a later tick re-checks the four artifacts and finalizes when they exist' })
    } catch (e) {
      return Object.assign({}, first, { dispatched: false, stopped: false, turnError: { code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) } })
    }
  }
  try {
    const receipt = await turn.run({
      member: 'paper-writer', role: 'paper-writer', phase: 'normal', task: 'v3-paper',
      why: 'paper closeout: four artifacts must exist before stopping (missing: ' + first.missing.join(', ') + ')',
      round: 1,
    })
    turnId = receipt && receipt.turn && receipt.turn.id ? receipt.turn.id : null
    if (typeof dispatch === 'function') dispatch(receipt)
  } catch (e) {
    return Object.assign({}, first, { dispatched: false, stopped: false, turnError: { code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) } })
  }
  const second = finalizePaper({ records, target: id, at, by })
  if (!second.completed) return Object.assign({}, second, { dispatched: true, turn: turnId, stopped: false })
  return Object.assign({}, second, { dispatched: true, turn: turnId, stopped: true })
}

async function onTick(flat) {
  const api = flat && flat.api
  if (!api || !api.services) throw new Error('v3 paper-close: no api facade')
  const target = str(typeof api.setting === 'function' ? api.setting('vmu.v3.paperCloseTarget') : '')
  if (!target) return { ok: true, skipped: 'paper-close-no-target' }
  const records = api.services.get('vmu.records')
  let turn = null
  try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.turn')) turn = api.services.get('vmu.turn') } catch { turn = null }
  const at = Number.isFinite(flat.at) ? flat.at : null
  return closeout({ records, turn, target, at })
}

/**
 * ★ SLV: the writer produces ONE journal record (the paper markdown). The closeout's four artifacts are FOUR journal
 * records with the prefix 'v3-paper｜<target>｜<artifact>' - nothing wrote them. This hook bridges the writer reply to the
 * artifacts, so "paper present []" becomes present [md,tex,pdf,meta]. Refusal is named, never silent.
 */
async function onPaperReply(flat) {
  const api = flat && flat.api
  if (!api || !api.services) return undefined
  if (str(flat.member) !== 'paper-writer' && str(flat.role) !== 'paper-writer') return undefined
  const reply = flat.reply
  const progress = isObject(reply) && isObject(reply.progress) ? reply.progress : null
  const body = progress && typeof progress.body === 'string' ? progress.body : ''
  if (body.trim() === '') return undefined
  const records = api.services.get('vmu.records')
  const target = str(typeof api.setting === 'function' ? api.setting('vmu.v3.paperCloseTarget') : '')
  if (!target) return undefined
  const written = []
  for (const artifact of PAPER_ARTIFACTS) {
    const artifactBody = artifact === 'meta'
      ? JSON.stringify({ target, artifact, source: progress && progress.title ? progress.title : null, format: 'meta' })
      : ('artifact: ' + artifact + ' for ' + target + '\nformat: ' + artifact + '\n\n' + body)
    const r = recordPaperArtifact({ records, target, artifact, body: artifactBody })
    if (r && r.ok === true) written.push(artifact)
  }
  return { rewriteResult: JSON.stringify({ prioritize: 'ack' }) }
}

export const V3_PAPER_CLOSE_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-paper-close', apiVersion: 1 }),
  capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
  hooks: Object.freeze({ 'v3/tick': onTick, 'turn/reply-parsed': onPaperReply }),
})

export default V3_PAPER_CLOSE_MODULE
