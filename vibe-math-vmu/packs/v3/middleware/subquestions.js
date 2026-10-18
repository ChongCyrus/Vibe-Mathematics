/**
 * packs/v3/middleware/subquestions.js — PHASE 6 / **P1-4（子问题三对象）**。
 *
 * v3 的求解回执里可以带 `sub_questions`（`:1838` 让 solver 把极难的辅助猜想/子问题报上来）。v3 在
 * `addSubQuestion`（`:2740-2776`）里**一次注册三个对象**：
 *   ① 子问题本身（problem，来源＝后生）；
 *   ② “判断命题”问题（problem，用来裁决那条临时假设）；
 *   ③ 临时假设命题（proposition，`p-tmp-*`，概率 0.5、价值/关键性 0.5）。
 *
 * 本模块把这段行为搬成 vmu 的卡：三张卡都经 `dataplane.writeCard` 落盘（不是第二份 md 写手），并保持
 * **确定性 id**（由 qid＋方向＋陈述的短哈希派生）——重复的 q_sub 会命中**同一组 id**，于是去重是“已存在就
 * 不写”，返回 `duplicate:true` 而不是再建三个对象。
 *
 * 触发通道：`turn/reply-parsed`（与 planner 的 K10 归一化同一钩子；该钩子在带 bus 的装配上由回合循环发射）。
 * 回执形状：v3 solver 的 `sub_questions` 条目字段是 `q_sub_statement`/`q_sub_title`/`assumption_title`/
 * `assumption_statement`；本模块同时接受更短的 `statement`/`title`（同一语义的两个入口，不静默猜错字段）。
 */
import { writeCard } from './dataplane.js'

export const SUBQUESTION_TRACKS = Object.freeze({ problems: 'problems', propos: 'propos' })

const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** 确定性短哈希（FNV-1a 32 位 → base36）。同一 (qid,dir,statement) 永远得到同一组 id。 */
export function subHash(qid, dirId, statement) {
  let h = 0x811c9dc5
  const text = str(qid) + '\u0000' + str(dirId) + '\u0000' + str(statement)
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h * 0x01000193) >>> 0 }
  return h.toString(36)
}

export function subQuestionIds({ qid, dirId, statement }) {
  const h = subHash(qid, dirId, statement)
  return { subId: str(qid) + '-sub-' + h, judgeId: str(qid) + '-judge-' + h, assumeId: 'p-tmp-' + h }
}

function cardIndex(records, track, kind) {
  const list = records.list({ track, limit: 0 }).items
  const out = new Map()
  for (const h of list) {
    let rec
    try { rec = records.get({ id: h.id }) } catch { continue }
    const text = str(rec.body)
    const id = (/- ID:\s*(.+)/.exec(text) || [])[1]
    if (!id) continue
    out.set(id.trim(), { recordId: h.id, body: text })
  }
  return out
}

/**
 * 注册一次 q_sub 的三个对象。**重复调用返回 duplicate，且一个对象都不新增**（数量恰好留在 3）。
 * 返回 `{ok, created, duplicate, objects:[{kind,id,recordId}], missing:[]}`；坏条目（无陈述）逐条进 `skipped`。
 */
export function registerSubQuestions({ records, qid, dirId, subQuestions = null, at = null, by = 'v3-subquestions' } = {}) {
  if (!records || typeof records.put !== 'function') throw new Error('registerSubQuestions needs a vmu.records handle')
  const parent = str(qid)
  if (!parent) throw new Error('registerSubQuestions needs qid')
  const dir = str(dirId)
  const problems = cardIndex(records, 'problems', 'problem')
  const propos = cardIndex(records, 'propos', 'proposition')
  const list = Array.isArray(subQuestions) ? subQuestions : []
  const objects = []
  const skipped = []
  let duplicate = 0
  for (const sq of list) {
    if (!isObject(sq)) { skipped.push({ reason: 'not-an-object' }); continue }
    const statement = str(sq.q_sub_statement || sq.statement)
    if (!statement.trim()) { skipped.push({ reason: 'no-statement' }); continue }
    const title = str(sq.q_sub_title || sq.title) || '子问题'
    const assumeStatement = str(sq.assumption_statement || sq.assumption_title)
      || ('对子问题「' + title + '」的一种回答（临时假设）')
    const { subId, judgeId, assumeId } = subQuestionIds({ qid: parent, dirId: dir, statement })
    const exist = problems.has(subId) && problems.has(judgeId) && propos.has(assumeId)
    if (exist) { duplicate += 1; continue }
    const written = []
    const subCard = {
      id: subId,
      标题: title + '（分支）',
      状态: '求解中',
      优先级: 1,
      依赖: [],
      来源: '后生',
      动机: '由问题 ' + parent + '（方向 ' + dir + '）的求解分支产生；想利用它的结果推进主线，解决后回填主线方向。',
      计划: '独立求解后回填主线 ' + parent + ' 方向 ' + dir + '。',
      陈述: statement,
      来源与动机: '由问题 ' + parent + '（方向 ' + dir + '）的求解分支产生；动机：想利用该子问题的结果来推进主线问题的求解。',
      solutions: [],
    }
    written.push({ kind: 'problem', id: subId, recordId: writeCard({ records, kind: 'problem', card: subCard, settled: false, by }).id })
    const judgeCard = {
      id: judgeId,
      标题: '判断命题：' + (str(sq.assumption_title) || assumeId),
      状态: '求解中',
      优先级: 1,
      依赖: [],
      来源: '后生',
      动机: '判定临时假设是否成立，结果回写该命题；这是子问题的“回答”命题化。',
      计划: '判定 ' + assumeId + ' 是否成立；结果回写该命题。',
      陈述: '判断下述命题是否成立：' + assumeStatement,
      来源与动机: '由临时假设 ' + assumeId + ' 生成，它是对子问题 ' + subId + ' 的一种回答的命题化；判定结果回写命题 ' + assumeId + '。',
      solutions: [],
    }
    written.push({ kind: 'problem', id: judgeId, recordId: writeCard({ records, kind: 'problem', card: judgeCard, settled: false, by }).id })
    const propCard = {
      id: assumeId,
      标题: str(sq.assumption_title) || ('临时假设 ' + assumeId),
      状态: '未定论',
      概率: 0.5,
      优先级: 1,
      依赖: [],
      来源: '后生',
      动机: '对子问题 ' + subId + ' 的一种回答的命题化；判定结果回写这里，并回填主线 ' + parent + ' 方向 ' + dir + '。',
      陈述: assumeStatement,
      来源问题: parent,
      来源方向: dir,
      价值关键性: 0.5,
      分类: '未分类',
      proofs: [],
      refutes: [],
    }
    written.push({ kind: 'proposition', id: assumeId, recordId: writeCard({ records, kind: 'proposition', card: propCard, settled: false, by }).id })
    objects.push(...written)
  }
  return { ok: true, at, qid: parent, dirId: dir, created: objects.length, duplicate, objects, skipped }
}

/** 从 solver 回执里取子问题列表与定位（qid/dirId 可在 meta 或顶层）。取不到 ⇒ 返回 null（不是空数组）。 */
export function subQuestionsFromReply(reply) {
  if (!isObject(reply)) return null
  const list = Array.isArray(reply.sub_questions) ? reply.sub_questions : null
  if (list === null) return null
  const meta = isObject(reply.meta) ? reply.meta : {}
  const qid = str(reply.qid || meta.qid)
  const dirId = str(reply.dirId || reply.direction || meta.dirId || meta.direction)
  return { qid, dirId, subQuestions: list }
}

async function onReplyParsed(flat) {
  const api = flat && flat.api
  if (!api || !api.services) return undefined
  const found = subQuestionsFromReply(flat.reply)
  if (!found || found.subQuestions.length === 0) return undefined
  if (!found.qid) return undefined
  const records = api.services.get('vmu.records')
  const receipt = registerSubQuestions({ records, qid: found.qid, dirId: found.dirId, subQuestions: found.subQuestions, at: Number.isFinite(flat.at) ? flat.at : null, by: 'v3-subquestions' })
  return { subquestions: receipt }
}

export const V3_SUBQUESTIONS_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-subquestions', apiVersion: 1 }),
  // trigger-workflow：解锁 api.services（写 vmu.records）。
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({ 'turn/reply-parsed': onReplyParsed }),
})

export default V3_SUBQUESTIONS_MODULE
