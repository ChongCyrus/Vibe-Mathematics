/**
 * packs/v3/middleware/methods.js — PHASE 6 / **P0-4（方法库：卡/应用/改进）＋ P0-5（发明上报闭环）**。
 *
 * v3 的第二根支柱（`vibe-math-v3.js:2787-2927` 的 method library 段）落成一个 M2 模块：
 *
 * ① **卡**：方法卡就是 P0-9 的三卡之一（`dataplane.composeMethod`/`parseCard` 的 `method` kind），落 `methods` 轨。
 *    本模块**不写第二份 md 解析器**：读卡走 `parseCard`，改卡走 `parseCard → composeCard → supersedeBody`。
 * ② **应用记录**（v3 `:2789-2815`）：只有**有 qid 或 dirId 上下文**时才追加 `### 应用 N｜<时间>｜问题 X 方向 d`
 *    —— 纯整理时引用方法不算"实际应用"（否则污染应用计数、触发错误的全局晋升）。未知 method id **不丢**：
 *    作为待沉淀发明入 `inventions` 轨（v3 `:2798-2802`）。
 * ③ **改进历史**（v3 `:2891-2901`）：追加 `### v<n>（原因）`，**v 号单调**（取既有最大 v + 1，不是数组长度），
 *    并逐条写进卡的版本历史。
 * ④ **可信断言**（v3 `:2880`）：只保留**已定论**命题的 id（概率 1 或 0）；不存在的/未定论的一律**具名丢弃**并计数。
 * ⑤ **两级**：`records` 活卡（`vmu.records.history.storeMode=full` ⇒ 版本带快照）＋ 耐久库的冻结修订
 *    `<库记录 id>@<n>.md`（`kernel/library.js:661-679` 的 `commitRevision`）。后者需要工作区根；没有根时
 *    **具名**报 `archived:false, skipped:'no-library-root'`，绝不静默。
 * ⑥ **P0-5 发明上报**（v3 `:2816-2922`）：`new_inventions` ⇒ `inventions` 轨入队；keeper 到期/攒够 N 条 ⇒ 起
 *    method-keeper 回合；keeper **有产出**（新建或改进）⇒ pending 清零；**无产出** ⇒ 兜底建草稿卡且 pending 清零
 *    （防滞留）。兜底建卡的**幂等键**见 `draftIdemKey()`：`fallback:<sha256(发明记录 id)[:16]>`，写进草稿卡的
 *    `## 沉淀元数据` 段（自定义段，回写不会丢）+ 作为 `records` 内容指纹的确定性输入 ⇒ 同一批 pending 再兜底
 *    一次会得到**同一张卡**（先按键查、再由内容指纹兜底），不会重复建卡。
 *
 * ★★ 回执载体（实测约束，不是自选）：内核的回合字段门**具名拒未知顶层字段**（`kernel/turn/index.js:844-848`）， *    而 v3 的 `methods_used`/`new_inventions` 是**顶层**字段 ⇒ 在 vmu 里必须放进一个**已登记字段的载荷**。
 *    本包用 `progress` 载荷（与 P0-2 用 `progress` + `act:` tag 承载计划动作是同一手法）：
 *    `{"progress":{"tags":["mu:<id>｜<效果>｜<建议>","inv:<类型>｜<标题>｜<描述>","ctx:<qid>｜<dirId>"],
 *                  "methods_used":[…],"new_inventions":[…],"qid":"…","dirId":"…"}}`
 *    带前缀的 tag 是给模型的稳定契约（P1-6 的提示段会写它）；载荷里的同名数组/字段也接受（纯 API 与旧形状）。
 *    keeper 的回执同理：`progress` 里放 `body`（方法卡 md，v3 的"新协议"）或 `new_methods`/`improvements` 数组；
 *    空对象 `{}` 是**合法**回执 ⇒ 走兜底路径（清单 P0-5 的可写断言）。
 *    本模块消费完反馈后返回 `{rewriteResult: <JSON 对象文本>}`，把原始载荷换成一条合法 journal 记录再交给派发器
 *    （K10 的语义：改写后的回执在 apply 之前替换；非 JSON 对象文本会被内核以 `VMU_TURN_BAD_JSON` 具名拒）。
 *
 * ★ **派发只从 tick 做**（同 P0-2）：`vmu.turn.run()` 若在 turn 里再开会被 `VMU_TURN_REENTRANT` 拒；
 *   `turn/reply-parsed` 处理器只**消费/落盘/改写**，绝不在这里 `run()`。
 *
 * ★ 时间只来自注入时钟：tick 的 `at`；回合钩子用「本 tick 的 at」（`lastTickAt`）——没有值就写 `unknown`，
 *   绝不编一个 `Date.now()`。
 *
 * ★ 本模块【不新增拒码】：复用已登记的内核码（`VMU_INVALID_ARGUMENT`/`VMU_STATE`/`VMU_NO_SUCH_OBJECT`），
 *   原因同 dataplane 文件头（码表是单一登记源，`docs/**` 不在本卡写域）。
 */
import { createHash } from 'node:crypto'
import { V3_TICK_TOPIC } from './tick.js'
import {
  parseCard, composeCard, parseAnchors, section, anchorLine, escField, unescField,
  writeBody, supersedeBody,
} from './dataplane.js'

/** 方法库的轨/kind（`vmu.records.tracks` 与 `allowedKinds` 在 packs/v3/settings/defaults.json 的值层里声明）。 */
export const METHOD_TRACK = 'methods'
export const METHOD_KIND = 'method'
export const INVENTION_TRACK = 'inventions'
export const INVENTION_KIND = 'invention'
/** v3 的 method-keeper 成员 id（`:2838-2841` 的 `spawnChild('method-keeper', …)`）。 */
export const KEEPER_MEMBER = 'method-keeper'
export const REPLY_PARSED_HOOK = 'turn/reply-parsed'
/** v3 `:2939`：应用记录 ≥ 3 且尚未入全局库 ⇒ 触发晋升（这是一个常量，不是可配置旋钮 —— v3 也在代码里写死）。 */
export const GLOBAL_PROMOTE_MIN_APPLICATIONS = 3
/** 方法卡两级用 **tag** 表示（不是锚点：锚点由 dataplane 的 compose 托管，新增锚点会在回写时被丢弃）。 */
export const LEVEL_TAGS = Object.freeze({ project: 'level:project', global: 'level:global' })
/** 兜底草稿卡的幂等键锚（写在自定义段里，回写不丢）。 */
const IDEM_LINE_PREFIX = '- 幂等键: '
const IDEM_TAG_PREFIX = 'idem:'
/** 反馈/回执的 tag 前缀（给模型的稳定契约；P1-6 的提示段负责把它写进提示词）。 */
const TAG = Object.freeze({ used: 'mu:', invention: 'inv:', context: 'ctx:', improvement: 'imp:' })
/** 公开的 tag 前缀表（测试与提示段对账用；编码/解码必须走同一张表，避免两处漂移）。 */
export const TAG_PREFIXES = Object.freeze({ used: TAG.used, invention: TAG.invention, context: TAG.context, improvement: TAG.improvement })

const str = (v) => (v === undefined || v === null ? '' : String(v))
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** 具名拒绝：调用者的词汇 + code + hint（AGENTS 红线 3）。码只用已登记内核码，理由见文件头。 */
function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const timeText = (at) => (Number.isFinite(at) ? new Date(at).toISOString() : 'unknown')
const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

// ── tag 编解码（尊重 escField 的转义；与 P0-2 的 act: 同一手法） ──────────────────────────────────────
const SEP = '｜'
function splitEscaped(text, sep) {
  const out = []
  let cur = ''
  for (let i = 0; i < String(text).length; i++) {
    const c = String(text)[i]
    if (c === '\\' && i + 1 < String(text).length) { cur += c + String(text)[i + 1]; i += 1; continue }
    if (c === sep) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}
export function encodeTag(prefix, fields) { return prefix + fields.map((x) => escField(x)).join(SEP) }
/** 按公开前缀表编码一条反馈 tag（`kind` = used/invention/context/improvement）；未知 kind ⇒ 具名拒。 */
export function encodeFeedbackTag(kind, fields) {
  const prefix = TAG_PREFIXES[String(kind)]
  if (!prefix) throw refuse('VMU_INVALID_ARGUMENT', 'unknown feedback tag kind: ' + String(kind), 'one of ' + Object.keys(TAG_PREFIXES).join(', '))
  return encodeTag(prefix, Array.isArray(fields) ? fields : [fields])
}
export function decodeTag(prefix, tag) {
  const s = str(tag)
  if (!s.startsWith(prefix)) return null
  return splitEscaped(s.slice(prefix.length), SEP).map((x) => unescField(x).trim())
}

// ── 状态：按 records 句柄隔离（WeakMap；同 P0-2 的理由：影响行为的计数不能是模块级） ────────────────────
const METHOD_STATES = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = METHOD_STATES.get(records)
  if (!s) {
    s = {
      ticks: 0, keeperRuns: 0, keeperInFlight: false, keeperReceipt: null,
      lastKeepAt: null, lastTickAt: null, lastSkip: null, lastReceipt: null, lastError: null,
      applications: 0, inventionsQueued: 0, drafts: 0, improved: 0, created: 0, promotions: 0, archived: 0,
    }
    METHOD_STATES.set(records, s)
  }
  lastState = s
  return s
}

/** 只读自报（诊断用；持久事实都在 records 轨上，与 P0-1/P0-2 同一口径）。 */
export function v3MethodsStatus() {
  const s = lastState
  if (!s) {
    return { topic: V3_TICK_TOPIC, keeperRuns: 0, keeperInFlight: false, lastKeepAt: null, lastTickAt: null,
      lastSkip: null, lastReceipt: null, lastError: null, applications: 0, inventionsQueued: 0, drafts: 0,
      improved: 0, created: 0, promotions: 0, archived: 0, note: 'no tick has touched this module yet' }
  }
  return {
    topic: V3_TICK_TOPIC,
    keeperRuns: s.keeperRuns, keeperInFlight: s.keeperInFlight,
    lastKeepAt: s.lastKeepAt, lastTickAt: s.lastTickAt,
    lastSkip: s.lastSkip, lastReceipt: s.lastReceipt ? JSON.parse(JSON.stringify(s.lastReceipt)) : null,
    lastError: s.lastError,
    applications: s.applications, inventionsQueued: s.inventionsQueued, drafts: s.drafts,
    improved: s.improved, created: s.created, promotions: s.promotions, archived: s.archived,
    note: 'diagnostics only: counters are per-process; the durable facts are records on the methods/inventions tracks',
  }
}

// ── 卡索引（一律经 dataplane.parseCard；坏卡点名、不炸整条 tick） ─────────────────────────────────────
/** 某轨上的卡索引：`{items:[{recordId,id,card,tags,level}], bad:[{recordId,reason}]}`。 */
export function loadMethodIndex(records) {
  const list = records.list({ track: METHOD_TRACK, limit: 0 })
  const items = []
  const bad = []
  for (const head of list.items) {
    if (head.kind !== METHOD_KIND) continue
    let rec
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, reason: str((e && e.message) || e) }); continue }
    const parsed = parseCard(rec.body)
    if (!parsed.ok) { bad.push({ recordId: head.id, reason: parsed.reason }); continue }
    if (parsed.kind !== 'method') { bad.push({ recordId: head.id, reason: 'kind-mismatch:' + parsed.kind }); continue }
    const tags = Array.isArray(rec.tags) ? rec.tags : []
    items.push({ recordId: head.id, id: str(parsed.card.id), card: parsed.card, tags, level: tags.includes(LEVEL_TAGS.global) ? 'global' : 'project', rev: rec.rev })
  }
  return { items, bad }
}

/** 按卡内 `- ID:` 找方法卡；`level` 为空 ⇒ 项目级优先，再找全局级。 */
export function findMethod(records, id, level = null) {
  const index = loadMethodIndex(records)
  const want = str(id)
  const hit = index.items.find((m) => m.id === want && (level === null || m.level === level))
  return hit || null
}

/** 待沉淀发明（`inventions` 轨上的活记录）。 */
export function pendingInventions(records) {
  const list = records.list({ track: INVENTION_TRACK, limit: 0 })
  const items = []
  const bad = []
  for (const head of list.items) {
    if (head.kind !== INVENTION_KIND) continue
    let rec
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, reason: str((e && e.message) || e) }); continue }
    const anchors = parseAnchors(rec.body)
    items.push({
      recordId: head.id,
      类型: str(anchors['类型'] || '方法'),
      标题: str(anchors['标题'] || head.title || head.id),
      来源: str(anchors['来源'] || ''),
      内容描述: section(rec.body, '内容描述'),
      body: rec.body,
    })
  }
  return { items, count: items.length, bad }
}

/** 一条发明的记录正文（md；不是"卡"，所以不走 composeCard —— 它没有托管锚点集合）。 */
export function inventionBody({ 标题, 类型 = '方法', 来源 = '', 内容描述 = '', at = null }) {
  const lines = []
  lines.push('# 发明｜' + (标题 || '未命名'))
  lines.push(anchorLine('类型', 类型))
  lines.push(anchorLine('标题', 标题 || '未命名'))
  lines.push(anchorLine('时间', timeText(at)))
  lines.push(anchorLine('来源', 来源 || ''))
  lines.push('')
  lines.push('## 内容描述')
  lines.push(内容描述 || '')
  lines.push('')
  return lines.join('\n').trimEnd() + '\n'
}

/** 入队一条发明。同一条记录重复入队时由 records 的内容指纹去重（`deduplicated:true`），不静默重复。 */
export function enqueueInvention({ records, at = null, 标题, 类型 = '方法', 来源 = '', 内容描述 = '', by = null }) {
  if (!records || typeof records.put !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'enqueueInvention needs a vmu.records handle', 'pass { records: kernel.records }')
  if (!str(标题).trim()) throw refuse('VMU_INVALID_ARGUMENT', 'an invention needs a non-empty 标题', 'v3 only queues inventions with a title (vibe-math-v3.js:2817-2818)')
  const body = inventionBody({ 标题, 类型, 来源, 内容描述, at })
  return writeBody({
    records, track: INVENTION_TRACK, kind: INVENTION_KIND,
    title: '待沉淀发明｜' + 标题, body, settled: false, by,
    tags: ['invention:' + sha(body).slice(0, 12)],
  })
}

// ── 可信断言：只收已定论（概率 1/0）的命题 id ────────────────────────────────────────────────────────
/**
 * v3 `:2880`：`可信断言` 只留「命题存在且概率 === 1 或 === 0」的 id。这里把**每一次丢弃都点名**：
 * `dropped:[{id, why:'unknown-proposition'|'not-settled:概率=0.5'}]`，绝不静默过滤。
 */
export function trustedAssertions(records, ids) {
  const wanted = Array.isArray(ids) ? ids.map(str).filter(Boolean) : []
  const heads = records.list({ track: 'propos', limit: 0 })
  const settled = new Set()
  for (const head of heads.items) {
    if (head.kind !== 'proposition') continue
    let parsed = null
    try { parsed = parseCard(records.get({ id: head.id }).body) } catch (e) { parsed = null }
    if (!parsed || !parsed.ok || parsed.kind !== 'proposition') continue
    if (parsed.card.概率 === 1 || parsed.card.概率 === 0) settled.add(str(parsed.card.id))
  }
  const kept = []
  const dropped = []
  for (const id of wanted) {
    if (settled.has(id)) { if (!kept.includes(id)) kept.push(id); continue }
    dropped.push({ id, why: 'unknown-or-not-settled-proposition' })
  }
  return { kept, dropped }
}

// ── 回执解析：从 turn/reply-parsed 的 reply 里取出 v3 的方法反馈 ──────────────────────────────────────
/**
 * v3 的 `reply.methods_used` / `reply.new_inventions` 是**顶层**字段，而 vmu 的回合字段门会具名拒未知顶层字段
 * （见文件头）⇒ 本包契约使用 `progress` 载荷的 `tags`（前缀）或同名字段。两种形状都接受：
 * · 顶层（纯 API / 测试 / 内核放宽后）：`reply.methods_used` / `reply.new_inventions` / `reply.qid` / `reply.dirId`
 * · 载荷（真实回合）：`reply.progress.{tags,methods_used,new_inventions,qid,dirId}`
 */
export function feedbackFromReply(reply) {
  const r = isObject(reply) ? reply : {}
  const progress = isObject(r.progress) ? r.progress : {}
  const methods_used = []
  const new_inventions = []
  const malformed = []
  const ctx = { qid: str(r.qid || progress.qid || progress.qidId), dirId: str(r.dirId || progress.dirId) }
  const pushUsed = (raw, carrier) => {
    if (!isObject(raw)) { malformed.push({ what: 'methods_used', carrier, why: 'not-an-object', raw }); return }
    const id = str(raw.id).trim()
    if (!id) { malformed.push({ what: 'methods_used', carrier, why: 'missing-id', raw }); return }
    methods_used.push({ id, 效果: str(raw.效果 || raw.effect), 建议: str(raw.建议 || raw.advice) })
  }
  const pushInvention = (raw, carrier) => {
    if (!isObject(raw)) { malformed.push({ what: 'new_inventions', carrier, why: 'not-an-object', raw }); return }
    const 标题 = str(raw.标题 || raw.title).trim()
    if (!标题) { malformed.push({ what: 'new_inventions', carrier, why: 'missing-标题', raw }); return }
    new_inventions.push({
      标题,
      类型: str(raw.类型 || raw.type || '方法'),
      内容描述: str(raw.内容描述 || raw.description || raw.text),
      来源: str(raw.来源 || raw.source || ''),
    })
  }
  if (Array.isArray(r.methods_used)) for (const mu of r.methods_used) pushUsed(mu, 'top-level')
  if (Array.isArray(r.new_inventions)) for (const inv of r.new_inventions) pushInvention(inv, 'top-level')
  if (Array.isArray(progress.methods_used)) for (const mu of progress.methods_used) pushUsed(mu, 'progress-fields')
  if (Array.isArray(progress.new_inventions)) for (const inv of progress.new_inventions) pushInvention(inv, 'progress-fields')
  const tags = Array.isArray(progress.tags) ? progress.tags : (Array.isArray(r.tags) ? r.tags : [])
  for (const tag of tags) {
    const used = decodeTag(TAG.used, tag)
    if (used) { pushUsed({ id: used[0], 效果: used[1], 建议: used[2] }, 'progress-tags'); continue }
    const inv = decodeTag(TAG.invention, tag)
    if (inv) { pushInvention({ 类型: inv[0], 标题: inv[1], 内容描述: inv[2] }, 'progress-tags'); continue }
    const context = decodeTag(TAG.context, tag)
    if (context) { ctx.qid = str(context[0]); ctx.dirId = str(context[1]); continue }
  }
  // ★ 双载体（tags 与同名字段）**任一存在即可**；两者同时出现同一项时不能重复消费 ⇒ 按业务键去重。
  const dedupeBy = (list, keyOf) => {
    const seen = new Set()
    const out = []
    for (const item of list) {
      const k = keyOf(item)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(item)
    }
    return out
  }
  const usedUnique = dedupeBy(methods_used, (x) => x.id)
  const invUnique = dedupeBy(new_inventions, (x) => [x.标题, x.类型, x.内容描述].join('\u0000'))
  const carrier = (Array.isArray(r.methods_used) || Array.isArray(r.new_inventions)) ? 'top-level' : 'progress'
  return { methods_used: usedUnique, new_inventions: invUnique, ctx, carrier, malformed, malformedCount: malformed.length }
}

/**
 * keeper 回执：`progress.body`（方法卡 md）或 `new_methods`/`improvements`（结构数组）或 `imp:` tags。
 * ★ 缺字段的条目**不静默过滤**：进 `malformed`（`applyKeeperOutput` 会把它计入 failed 并具名）。
 */
export function keeperOutputFromReply(reply) {
  const r = isObject(reply) ? reply : {}
  const progress = isObject(r.progress) ? r.progress : {}
  const collect = (v) => (Array.isArray(v) ? v : [])
  const new_methods = collect(progress.new_methods).concat(collect(r.new_methods))
  const improvements = collect(progress.improvements).concat(collect(r.improvements))
  const card_bodies = []
  const body = str(progress.body)
  if (body.trim()) card_bodies.push(body)
  const tags = Array.isArray(progress.tags) ? progress.tags : (Array.isArray(r.tags) ? r.tags : [])
  for (const tag of tags) {
    const imp = decodeTag(TAG.improvement, tag)
    if (imp) improvements.push({ id: str(imp[0]), 原因: str(imp[1]), 改进内容: str(imp[2]) })
  }
  const malformed = []
  const goodMethods = []
  for (const nm of new_methods) {
    if (!isObject(nm)) { malformed.push({ what: 'new_methods', why: 'not-an-object', raw: nm }); continue }
    if (!str(nm.标题 || nm.title).trim()) { malformed.push({ what: 'new_methods', why: 'missing-标题', raw: nm }); continue }
    goodMethods.push(nm)
  }
  const goodImprovements = []
  for (const im of improvements) {
    if (!isObject(im)) { malformed.push({ what: 'improvements', why: 'not-an-object', raw: im }); continue }
    if (!str(im.id).trim()) { malformed.push({ what: 'improvements', why: 'missing-id', raw: im }); continue }
    goodImprovements.push({ id: str(im.id).trim(), 原因: str(im.原因 || im.reason), 改进内容: str(im.改进内容 || im.text || im.content) })
  }
  return { new_methods: goodMethods, improvements: goodImprovements, card_bodies, malformed, malformedCount: malformed.length }
}

// ── 卡的写入：compose → records（+ 耐久库冻结修订） ──────────────────────────────────────────────────
/**
 * 冻结一层耐久修订：把当前卡正文追加进 library（同内容去重）并 `commitRevision` ⇒ `<库记录 id>@<n>.md` 存在。
 * 没有工作区根（library 为 null）⇒ **具名** skip，不假装归档。`rev` 只是给库记录 id 一个稳定前缀
 * （`<方法id>-r<卡 rev>`），真正的冻结号 `<n>` 由 library 的 high-water mark 保证单调。
 */
export async function archiveMethodCard({ library, methodId, rev = 1, body, title = '', by = null, reason = null }) {
  if (!library || typeof library.append !== 'function' || typeof library.commitRevision !== 'function') {
    return { archived: false, skipped: 'no-library-root', methodId: str(methodId) }
  }
  const appended = await library.append({
    id: str(methodId) + '-r' + String(rev),
    kind: 'method',
    statement: String(body || ''),
    title: '方法卡｜' + (title || str(methodId)),
    owner: by || 'shared',
  })
  const committed = await library.commitRevision({ id: appended.id, by: by || 'shared', reason: reason || ('v3 方法卡修订 r' + String(rev)) })
  return {
    archived: true, methodId: str(methodId), libraryId: appended.id, rev: committed.rev,
    file: committed.path, basename: String(committed.path || '').split(/[\\/]/).pop(),
    deduplicated: appended.deduplicated === true,
  }
}

/** 写一张方法卡（records 活卡；可选耐久归档）。返回写入口回执 + 归档结果。 */
export async function createMethodCard({ records, card, at = null, by = null, library = null, level = 'project', tags = null }) {
  const composed = composeCard('method', card)
  const rec = writeBody({
    records, track: METHOD_TRACK, kind: METHOD_KIND,
    title: 'v3 method｜' + (card.标题 || card.id), body: composed, settled: false, by,
    tags: Array.isArray(tags) ? tags : [LEVEL_TAGS[level] || LEVEL_TAGS.project],
  })
  const archive = await archiveMethodCard({ library, methodId: card.id, rev: rec.rev || 1, body: composed, title: card.标题, by, reason: 'v3 方法卡创建' })
  return Object.assign({}, rec, { methodId: card.id, body: composed, archive })
}

/** 改一张方法卡（compose 后 supersede；可选耐久归档这一修订）。 */
async function reviseMethodCard({ records, recordId, card, reason, by = null, library = null }) {
  const composed = composeCard('method', card)
  const res = supersedeBody({ records, id: recordId, body: composed, reason, by })
  const archive = await archiveMethodCard({ library, methodId: card.id, rev: res.rev || 1, body: composed, title: card.标题, by, reason })
  return Object.assign({}, res, { body: composed, archive })
}

/** 追加一条应用记录（**只有 qid/dirId 有值时才写** —— v3 `:2804-2812`）。 */
export async function appendApplication({ records, recordId, qid = '', dirId = '', text = '', at = null, by = null, library = null }) {
  if (!qid && !dirId) {
    // 调用方必须先判上下文；这里再判一次并**具名**说明"没有追加"，而不是写一条空应用。
    return { ok: true, appended: false, reason: 'no-context', note: 'applications are recorded only with a qid or dirId context (v3 consumeMethodFeedback)' }
  }
  const rec = records.get({ id: recordId })
  const parsed = parseCard(rec.body)
  if (!parsed.ok || parsed.kind !== 'method') throw refuse('VMU_INVALID_ARGUMENT', 'record ' + str(recordId) + ' is not a parsable method card', 'write the card through createMethodCard() first')
  const card = parsed.card
  card.applications = (Array.isArray(card.applications) ? card.applications : []).concat([{
    at: timeText(at), 问题: str(qid), 方向: str(dirId), text: str(text),
  }])
  const revised = await reviseMethodCard({ records, recordId, card, reason: 'v3 应用记录 #' + card.applications.length, by, library })
  return { ok: true, appended: true, index: card.applications.length, rev: revised.rev, archive: revised.archive }
}

/**
 * 追加一条改进记录，**v 号单调**：`v = max(既有 v) + 1`（不是数组长度 —— 中间被删过也不会倒退/复用，
 * 这正是 v3 `:2897` 用 `length+1` 做不到而本卡要更严的地方；v3 的值域断言在 P0-4 里被写成"单调"）。
 */
export async function recordImprovement({ records, recordId, 原因 = '', 改进内容 = '', at = null, by = null, library = null }) {
  const rec = records.get({ id: recordId })
  const parsed = parseCard(rec.body)
  if (!parsed.ok || parsed.kind !== 'method') throw refuse('VMU_INVALID_ARGUMENT', 'record ' + str(recordId) + ' is not a parsable method card', 'write the card through createMethodCard() first')
  const card = parsed.card
  const existing = Array.isArray(card.improvements) ? card.improvements : []
  let maxV = 0
  for (const im of existing) if (Number.isInteger(im.v) && im.v > maxV) maxV = im.v
  const v = maxV + 1
  card.improvements = existing.concat([{ v, 原因: str(原因), text: str(改进内容) }])
  const revised = await reviseMethodCard({ records, recordId, card, reason: 'v3 改进 v' + v + '（' + str(原因) + '）', by, library })
  return { ok: true, v, rev: revised.rev, archive: revised.archive }
}

// ── P0-4：消费方法反馈 ───────────────────────────────────────────────────────────────────────────────
/**
 * v3 `consumeMethodFeedback` 的等价面。输入 `reply`（回合回执）或显式 `methods_used`/`new_inventions`；
 * `ctx` 缺省时从 reply 的载体里取（`feedbackFromReply`）。
 * 输出计数：`applications`（真的追加了几条）、`unknown`（引用未知方法 ⇒ 入队发明）、`inventionsQueued`、
 * `skippedApplications`（有上下文才写；这次没写就具名计数 —— 不静默丢）。
 */
export async function consumeMethodFeedback({ records, reply = null, methods_used = null, new_inventions = null, ctx = null, at = null, by = null, library = null } = {}) {
  if (!records || typeof records.put !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'consumeMethodFeedback needs a vmu.records handle', 'pass { records: kernel.records }')
  // ★ 双载体（tags 与同名字段）**任一存在即可**、两条都走同一个归一化器（避免两份解析器漂移）。
  const explicit = !(methods_used === null && new_inventions === null)
  const parsed = explicit
    ? feedbackFromReply({ methods_used: Array.isArray(methods_used) ? methods_used : [], new_inventions: Array.isArray(new_inventions) ? new_inventions : [] })
    : feedbackFromReply(reply)
  const context = Object.assign({ qid: '', dirId: '' }, isObject(ctx) ? ctx : parsed.ctx)
  const index = loadMethodIndex(records)
  const applications = []
  const unknown = []
  const skippedApplications = []
  const malformed = []
  // ★ 缺字段的反馈**不静默丢**：作为待沉淀发明入队（标题点名缺什么、内容里保留原始载荷），并计数。
  for (const bad of parsed.malformed || []) {
    const title = '(缺字段的' + str(bad.what) + '：' + str(bad.why) + ')'
    const rec = enqueueInvention({
      records, at, 标题: title, 类型: '反馈载体缺字段', 来源: context.qid ? ('问题 ' + context.qid + (context.dirId ? ' 方向 ' + context.dirId : '')) : '',
      内容描述: JSON.stringify(bad.raw === undefined ? null : bad.raw), by,
    })
    malformed.push({ what: bad.what, why: bad.why, carrier: bad.carrier, inventionRecordId: rec.id })
  }
  for (const mu of parsed.methods_used) {
    const local = index.items.find((m) => m.id === str(mu.id) && m.level === 'project')
    if (!local) {
      // 未知 method id（或只有全局级）：**不丢** —— 作为待沉淀发明入队（v3 `:2798-2802`）。
      const source = context.qid ? ('问题 ' + context.qid + (context.dirId ? ' 方向 ' + context.dirId : '')) : ''
      const rec = enqueueInvention({
        records, at, 标题: str(mu.id), 类型: '方法', 来源: source,
        内容描述: str(mu.效果) + (mu.建议 ? '；建议：' + str(mu.建议) : ''), by,
      })
      unknown.push({ id: str(mu.id), inventionRecordId: rec.id, deduplicated: rec.deduplicated === true })
      continue
    }
    if (!context.qid && !context.dirId) {
      skippedApplications.push({ id: str(mu.id), reason: 'no-context', note: 'a reference without a problem/direction context is not an APPLICATION (v3 consumeMethodFeedback)' })
      continue
    }
    const res = await appendApplication({
      records, recordId: local.recordId, qid: context.qid, dirId: context.dirId,
      text: str(mu.效果) + (mu.建议 ? '；建议：' + str(mu.建议) : ''), at, by, library,
    })
    applications.push({ id: local.id, index: res.index, rev: res.rev })
  }
  const queued = []
  for (const inv of parsed.new_inventions) {
    const source = inv.来源 || (context.qid ? ('问题 ' + context.qid + (context.dirId ? ' 方向 ' + context.dirId : '')) : '')
    const rec = enqueueInvention({ records, at, 标题: inv.标题, 类型: inv.类型, 来源: source, 内容描述: inv.内容描述, by })
    queued.push({ 标题: inv.标题, recordId: rec.id, deduplicated: rec.deduplicated === true })
  }
  return {
    ok: true, carrier: explicit ? 'explicit' : parsed.carrier, ctx: context,
    applications: applications.length, applicationDetails: applications,
    unknown: unknown.length, unknownDetails: unknown,
    inventionsQueued: queued.length, inventionDetails: queued,
    skippedApplications: skippedApplications.length, skippedDetails: skippedApplications,
    malformed: malformed.length, malformedDetails: malformed,
    pending: pendingInventions(records).count,
  }
}

// ── P0-5：兜底建卡（幂等键） ─────────────────────────────────────────────────────────────────────────
/**
 * 兜底草稿卡的**幂等键**：`fallback:<sha256(发明记录 id)[:16]>`。
 * 为什么用发明记录的 id：它是**耐久事实**（records 的记录 id，处理过程中不会变），而标题/正文可能被重述；
 * 同一批 pending 若因崩溃/清队失败再兜底一次，键相同 ⇒ 先按键查（卡里的 `## 沉淀元数据` 段）命中，
 * 再由 `records` 的内容指纹（content-only：kind+body+tags）兜底 —— 两道都不新建第二张卡。
 */
export function draftIdemKey(recordId) {
  return 'fallback:' + sha('v3-method-draft\u0000' + str(recordId)).slice(0, 16)
}

/** 找到某幂等键已经建出的草稿卡（自定义段里的 `- 幂等键:` 行；回写不会丢自定义段）。 */
export function findDraftByIdemKey(records, key) {
  const needle = IDEM_LINE_PREFIX + str(key)
  const index = loadMethodIndex(records)
  for (const m of index.items) {
    let body = ''
    try { body = records.get({ id: m.recordId }).body } catch (e) { continue }
    if (body.includes(needle)) return m
  }
  return null
}

/** 一张 pending 发明 → 一张草稿方法卡（状态=经验、来源=草稿沉淀；v3 `:2908-2920` 的等价面）。
 * ★ 来源与幂等键写进 `## 沉淀元数据` 自定义段：dataplane 的方法卡 compose **没有 `- 来源:` 锚点**
 *   （v3 `:1019-1030` 同样没有），写进 `card.来源` 会被 compose 静默丢弃 ⇒ 必须落到一个不会被回写抹掉的段里。 */
export function draftCardFor(inv, key) {
  const source = '草稿沉淀(' + (str(inv.来源) || '未知来源') + ')'
  return {
    id: 'm-draft-' + String(key).replace(/^fallback:/, ''),
    标题: str(inv.标题) || '未命名发明',
    类型: str(inv.类型) || '方法',
    状态: '经验',
    可信断言: [],
    上级体系: [],
    子方法: [],
    相关: [],
    适用场景: '',
    核心内容: str(inv.内容描述),
    来源: source,
    applications: [],
    improvements: [{ v: 1, 原因: '草稿沉淀', text: 'Method Keeper 未产出，按发明清单兜底建卡（来源：' + (str(inv.来源) || '未知来源') + '）' }],
    extraSections: [{ name: '沉淀元数据', text: IDEM_LINE_PREFIX + String(key) + '\n- 来源发明: ' + str(inv.recordId) + '\n- 来源: ' + source }],
  }
}

/** 清 pending：把发明记录移入 trash（**有计数、可恢复**；不是静默丢弃）。 */
export function clearPending({ records, items = null, by = KEEPER_MEMBER, reason = 'consumed by method keeper' }) {
  const list = Array.isArray(items) ? items : pendingInventions(records).items
  const cleared = []
  const failed = []
  for (const inv of list) {
    try { records.remove({ id: inv.recordId, reason, by }); cleared.push(inv.recordId) } catch (e) { failed.push({ recordId: inv.recordId, code: str((e && e.code) || (e && e.message)) }) }
  }
  return { cleared: cleared.length, clearedIds: cleared, failed }
}

/** 无产出兜底：pending 逐条建草稿卡（幂等）+ 清队。 */
export async function fallbackFromPending({ records, at = null, by = KEEPER_MEMBER, library = null }) {
  const pending = pendingInventions(records)
  const created = []
  if (pending.items.length > 0) {
    for (const inv of pending.items) {
      const key = draftIdemKey(inv.recordId)
      const existing = findDraftByIdemKey(records, key)
      if (existing) {
        created.push({ inventionRecordId: inv.recordId, idempotencyKey: key, deduplicated: true, methodId: existing.id, recordId: existing.recordId })
        continue
      }
      const card = draftCardFor(inv, key)
      const written = await createMethodCard({ records, card, at, by, library, tags: [LEVEL_TAGS.project, IDEM_TAG_PREFIX + key] })
      created.push({
        inventionRecordId: inv.recordId, idempotencyKey: key, idempotencyLine: IDEM_LINE_PREFIX + key,
        deduplicated: written.deduplicated === true, methodId: card.id, recordId: written.id, archive: written.archive,
      })
    }
  }
  const cleared = clearPending({ records, items: pending.items, by })
  return {
    ok: true, fallback: true, pendingBefore: pending.items.length,
    // ★ 两个计数分开报：`created` 是"处理的条目数"，`newCards` 是**真的新写**的卡数，`deduplicated` 是
    //   幂等键（或内容指纹）命中而**没有新建**的条目数 —— 于是"第一遍建、第二遍不建"在回执里可见。
    created: created.length,
    newCards: created.filter((x) => x.deduplicated !== true).length,
    deduplicated: created.filter((x) => x.deduplicated === true).length,
    details: created, cleared: cleared.cleared,
  }
}

/** keeper 有产出 ⇒ 清队（v3 `:2902-2904`：只返回 improvements 也算有产出，防复整理）。 */
export async function applyKeeperOutput({ records, reply = null, at = null, by = KEEPER_MEMBER, library = null } = {}) {
  const out = keeperOutputFromReply(reply)
  const created = []
  const improved = []
  // ★ 缺字段的 keeper 条目**不静默丢**：逐条进 failed（具名），并参与"是否有产出"的判定。
  const failed = (out.malformed || []).map((bad) => ({ why: 'malformed-' + str(bad.what) + ':' + str(bad.why), raw: bad.raw }))
  for (const nm of out.new_methods) {
    const trusted = trustedAssertions(records, nm.可信断言 || nm.assertions)
    const title = str(nm.标题 || nm.title).trim()
    const card = {
      id: str(nm.id).trim() || ('m-' + sha(title + '\u0000' + str(nm.核心内容 || nm.content)).slice(0, 10)),
      标题: title,
      类型: str(nm.类型 || nm.type || '方法'),
      状态: '经验',
      可信断言: trusted.kept,
      上级体系: Array.isArray(nm.上级体系) ? nm.上级体系 : [],
      子方法: Array.isArray(nm.子方法) ? nm.子方法 : [],
      相关: [],
      适用场景: str(nm.适用场景),
      核心内容: str(nm.核心内容 || nm.content),
      定义与记号: str(nm.定义与记号),
      来源: str(nm.来源),
      applications: [],
      improvements: Array.isArray(nm.improvements) && nm.improvements.length > 0
        ? nm.improvements.map((x, i) => ({ v: Number.isInteger(x.v) ? x.v : i + 1, 原因: str(x.原因), text: str(x.text || x.改进内容) }))
        : [{ v: 1, 原因: '初始沉淀', text: '由 Method Keeper 从近期工作提炼' }],
    }
    // ★ 方法卡的 compose 没有 `- 来源:` 锚点（v3 `:1019-1030` 同样没有）⇒ 来源要落到自定义段，否则被静默丢弃。
    if (str(nm.来源)) card.extraSections = [{ name: '来源与出处', text: '- 来源: ' + str(nm.来源) }]
    const written = await createMethodCard({ records, card, at, by, library })
    created.push({ methodId: card.id, recordId: written.id, deduplicated: written.deduplicated === true, trusted: trusted.kept, trustedDropped: trusted.dropped, archive: written.archive })
  }
  for (const body of out.card_bodies) {
    const parsed = parseCard(body)
    if (!parsed.ok || parsed.kind !== 'method') { failed.push({ why: 'card-body-not-a-method-card:' + (parsed.ok ? parsed.kind : parsed.reason) }); continue }
    const trusted = trustedAssertions(records, parsed.card.可信断言)
    parsed.card.可信断言 = trusted.kept
    if (!str(parsed.card.id).trim()) { failed.push({ why: 'method-card-body-without-ID' }); continue }
    const written = await createMethodCard({ records, card: parsed.card, at, by, library })
    created.push({ methodId: parsed.card.id, recordId: written.id, deduplicated: written.deduplicated === true, trusted: trusted.kept, trustedDropped: trusted.dropped, archive: written.archive })
  }
  for (const imp of out.improvements) {
    const hit = findMethod(records, imp.id, 'project')
    if (!hit) { failed.push({ id: imp.id, why: 'unknown-method' }); continue }
    const res = await recordImprovement({ records, recordId: hit.recordId, 原因: imp.原因, 改进内容: imp.改进内容, at, by, library })
    improved.push({ methodId: imp.id, v: res.v, rev: res.rev, archive: res.archive })
  }
  const hasOutput = created.length > 0 || improved.length > 0
  let fallback = null
  if (!hasOutput) fallback = await fallbackFromPending({ records, at, by, library })
  else clearPending({ records, by })
  return {
    ok: true, hasOutput,
    created: created.length, createdDetails: created,
    improved: improved.length, improvedDetails: improved,
    failed, failedCount: failed.length,
    fallback,
    pendingAfter: pendingInventions(records).count,
  }
}

// ── 两级：项目级 → 全局级晋升（v3 `:2928-2952`；阈值 3 是 v3 的常量） ─────────────────────────────────
/**
 * 应用记录 ≥ `GLOBAL_PROMOTE_MIN_APPLICATIONS` 且尚无全局级同 id 卡 ⇒ 晋升一张**全局级**卡（tag `level:global`，
 * 与项目级同一 `- ID:`）。`auto !== true`（即 `vmu.v3.methodAutoPromote=false`，**默认**）⇒ **不晋升**并逐条
 * 具名回报 `skipped`（P0-8 的人工门以后会接管这一步；本卡不伪造审批）。
 */
export async function promoteMethodsToGlobal({ records, auto = false, at = null, by = KEEPER_MEMBER, library = null } = {}) {
  const index = loadMethodIndex(records)
  const promoted = []
  const skipped = []
  const alreadyGlobal = []
  for (const m of index.items) {
    if (m.level !== 'project') continue
    const applications = Array.isArray(m.card.applications) ? m.card.applications.length : 0
    if (applications < GLOBAL_PROMOTE_MIN_APPLICATIONS) continue
    const globalHit = index.items.find((g) => g.level === 'global' && g.id === m.id)
    if (globalHit) { alreadyGlobal.push({ methodId: m.id, level: 'global', recordId: globalHit.recordId }); continue }
    if (auto !== true) {
      skipped.push({ methodId: m.id, applications, reason: 'methodAutoPromote=false', note: 'the promotion is a DECISION, not a side effect: it is reported, not taken (P0-8 will gate it)' })
      continue
    }
    const body = composeCard('method', m.card)
    const rec = writeBody({
      records, track: METHOD_TRACK, kind: METHOD_KIND,
      title: 'v3 method global｜' + (m.card.标题 || m.id), body, settled: true, by,
      tags: [LEVEL_TAGS.global],
    })
    const archive = await archiveMethodCard({ library, methodId: m.id, rev: rec.rev || 1, body, title: m.card.标题, by, reason: 'v3 方法晋升到全局级' })
    promoted.push({ methodId: m.id, projectRecordId: m.recordId, globalRecordId: rec.id, archive })
  }
  return { ok: true, auto: auto === true, threshold: GLOBAL_PROMOTE_MIN_APPLICATIONS, promoted: promoted.length, promotedDetails: promoted, skipped: skipped.length, skippedDetails: skipped, alreadyGlobal: alreadyGlobal.length }
}

// ── keeper：到期判定 / 摘要 / 回合 ───────────────────────────────────────────────────────────────────
/** v3 `:2824-2832` 的 methodKeepDue 等价面（返回具名 reason，不只是布尔）。 */
export function keepDue({ records, at = null, every = 0, interval = 0, keeperInFlight = false, lastKeepAt = null }) {
  const pending = pendingInventions(records).count
  if (keeperInFlight) return { due: false, reason: 'keeper-in-flight', pending }
  if (pending === 0) return { due: false, reason: 'no-pending', pending }
  if (Number.isFinite(interval) && interval > 0 && Number.isFinite(at) && at - (Number.isFinite(lastKeepAt) ? lastKeepAt : 0) >= interval) {
    return { due: true, reason: 'interval', pending, elapsedMs: at - (Number.isFinite(lastKeepAt) ? lastKeepAt : 0), intervalMs: interval }
  }
  if (Number.isFinite(every) && every > 0 && pending >= every) return { due: true, reason: 'count', pending, every }
  return { due: false, reason: 'not-due', pending }
}

/** v3 `:2844-2860` 的 buildMethodDigest 等价面（只给标题/类型/来源 + 一句话，不把 pending 全文压进提示）。 */
export function buildMethodDigest({ records, at = null }) {
  const pending = pendingInventions(records)
  const lines = []
  lines.push('- 待沉淀发明 ' + pending.items.length + ' 条（仅列标题/类型/来源）：')
  for (const inv of pending.items.slice(-16)) {
    const desc = str(inv.内容描述).slice(0, 60)
    lines.push('  * [' + inv.类型 + '] ' + inv.标题 + (inv.来源 ? '（' + inv.来源 + '）' : '') + (desc ? '：' + desc + '…' : ''))
  }
  const propos = []
  try {
    const heads = records.list({ track: 'propos', limit: 0 })
    for (const h of heads.items.slice(-6)) {
      if (h.kind !== 'proposition') continue
      let p = null
      try { p = parseCard(records.get({ id: h.id }).body) } catch (e) { p = null }
      if (p && p.ok) propos.push(p.card.id + '「' + p.card.标题 + '」概率=' + p.card.概率)
    }
  } catch (e) { /* 命题轨不可读时不编造近期命题 */ }
  if (propos.length > 0) lines.push('- 最近命题：' + propos.join('；'))
  lines.push('- 本回合契约：progress.tags 里放 `inv:`（新发明）与 `imp:<id>｜<原因>｜<改进内容>`（改进），progress.body 可放一张方法卡 md；什么都不产出就直接回 `{}`（会走兜底建卡）。')
  lines.push('- at: ' + timeText(at))
  return lines.join('\n')
}

// ── 回执改写（K10）：把被消费的载荷换成一条合法 journal 记录 ─────────────────────────────────────────
function normalizedReply(reply, member, receipt) {
  const out = Object.assign({}, isObject(reply) ? reply : {})
  out.progress = {
    track: 'journal',
    kind: 'state',
    title: 'v3 方法反馈（已由 pack 消费）',
    body: ['- source: ' + str(member), '- applications: ' + receipt.applications, '- inventionsQueued: ' + receipt.inventionsQueued,
      '- unknownMethods: ' + receipt.unknown, '- skippedApplications: ' + receipt.skippedApplications].join('\n'),
    tags: [],
  }
  return out
}

// ── tick / reply-parsed 处理器 ──────────────────────────────────────────────────────────────────────
function requireApi(flat, who) {
  const api = flat && flat.api
  if (!api || !api.services) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', who + ' received no api facade, so vmu.records/vmu.turn cannot be reached',
      'a middleware entry must go through kernel/loader.js (module shape), not the raw bus path')
  }
  return api
}

/** 可选的耐久库：没发布（无工作区根）⇒ null（回执里会具名 skip，不假装归档）。 */
function tryLibrary(api) {
  const names = typeof api.services.names === 'function' ? api.services.names() : []
  if (!names.includes('vmu.library')) return null
  try { return api.services.get('vmu.library') } catch (e) { return null }
}

function readSettings(api) {
  const every = Number(api.setting('vmu.v3.methodKeepEvery'))
  const interval = Number(api.setting('vmu.v3.methodKeepIntervalMs'))
  return {
    every: Number.isFinite(every) && every >= 0 ? Math.floor(every) : 5,
    interval: Number.isFinite(interval) && interval >= 0 ? interval : 0,
    autoPromote: api.setting('vmu.v3.methodAutoPromote') === true,
  }
}

/** 跑一次 method-keeper 回合（**只从 tick 调用**；turn 里再跑会被 VMU_TURN_REENTRANT 拒）。 */
async function runKeeperTurn({ records, turn, at, library, settings, state, digest }) {
  state.keeperRuns += 1
  state.keeperInFlight = true
  state.keeperReceipt = null
  let receipt = null
  try {
    receipt = await turn.run({
      member: KEEPER_MEMBER,
      role: KEEPER_MEMBER,
      phase: 'normal',
      task: 'v3-method-keeper',
      why: 'v3 method keeper due (' + digest.split('\n')[0].replace(/^- /, '') + ')',
      statusBlock: digest,
      round: 1,
    })
  } catch (e) {
    state.lastError = { phase: 'keeper-turn', code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
    receipt = { ok: false, code: state.lastError.code, message: state.lastError.message }
  } finally {
    state.keeperInFlight = false
  }
  // 钩子没被触发（总线没接/回合没产出可解析回执）⇒ 不能把 pending 留到永远：走兜底建卡 + 清队，
  // 并把「为什么是兜底」具名写进回执（v3 `:2905-2922` 的防滞留语义，比 v3 更严：失败路径也兜底）。
  if (state.keeperReceipt === null) {
    const fb = await fallbackFromPending({ records, at, library })
    state.lastReceipt = {
      fallback: true,
      fallbackReason: receipt && receipt.ok === true ? 'keeper-turn-produced-no-parsed-reply' : 'keeper-turn-failed',
      turnOk: !!(receipt && receipt.ok === true), code: receipt && receipt.code ? receipt.code : null,
      pendingBefore: fb.pendingBefore, created: fb.created, newCards: fb.newCards, deduplicated: fb.deduplicated, cleared: fb.cleared,
    }
  }
  state.lastKeepAt = at
  return { keeperTurn: receipt && receipt.turn ? receipt.turn.id : null, hookHandled: state.keeperReceipt !== null, receipt: state.lastReceipt }
}

async function onTick(flat) {
  const api = requireApi(flat, 'v3 methods')
  const at = Number.isFinite(flat.at) ? flat.at : null
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  state.ticks += 1
  if (at === null) {
    state.lastSkip = { reason: 'no-injected-clock', tick: state.ticks }
    return { ok: true, skipped: 'no-injected-clock', ticks: state.ticks }
  }
  state.lastTickAt = at
  const settings = readSettings(api)
  const library = tryLibrary(api)
  // ① 晋升（默认 methodAutoPromote=false ⇒ 只报告，不晋升）。
  const promotion = await promoteMethodsToGlobal({ records, auto: settings.autoPromote, at, library })
  state.promotions += promotion.promoted
  // ② keeper 到期判定 + 派发。
  const due = keepDue({ records, at, every: settings.every, interval: settings.interval, keeperInFlight: state.keeperInFlight, lastKeepAt: state.lastKeepAt })
  if (!due.due) {
    state.lastSkip = Object.assign({ tick: state.ticks }, due)
    return { ok: true, skipped: due.reason, at, pending: due.pending, promotion: { promoted: promotion.promoted, skipped: promotion.skipped } }
  }
  const turn = api.services.get('vmu.turn')
  const digest = buildMethodDigest({ records, at })
  const ran = await runKeeperTurn({ records, turn, at, library, settings, state, digest })
  return { ok: true, keeper: true, at, due: due.reason, pendingBefore: due.pending, ...ran, promotion: { promoted: promotion.promoted, skipped: promotion.skipped } }
}

async function onReplyParsed(flat) {
  const api = flat && flat.api
  if (!api || !api.services) return undefined
  const member = str(flat.member)
  const reply = flat.reply
  if (!isObject(reply)) return undefined
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  const library = tryLibrary(api)
  const at = Number.isFinite(flat.at) ? flat.at : (Number.isFinite(state.lastTickAt) ? state.lastTickAt : null)
  if (member === KEEPER_MEMBER) {
    const receipt = await applyKeeperOutput({ records, reply, at, by: KEEPER_MEMBER, library })
    state.keeperReceipt = receipt
    state.created += receipt.created
    state.improved += receipt.improved
    if (receipt.fallback && receipt.fallback.fallback) { state.drafts += receipt.fallback.newCards; state.lastKeepAt = at }
    state.lastReceipt = receipt
    state.archived += (receipt.createdDetails || []).filter((x) => x.archive && x.archive.archived).length
    // 凯珀回合的回执已经被本模块落盘/消费：改写成 `{}`（JSON 对象文本），内核不再派发它的 progress 载荷。
    return { rewriteResult: JSON.stringify({}) }
  }
  const feedback = feedbackFromReply(reply)
  if (feedback.methods_used.length === 0 && feedback.new_inventions.length === 0) return undefined
  try {
    const res = await consumeMethodFeedback({ records, reply, ctx: feedback.ctx, at, by: member || null, library })
    state.applications += res.applications
    state.inventionsQueued += res.inventionsQueued
    state.archived += (res.applicationDetails || []).filter((x) => x.archive && x.archive.archived).length
    return { rewriteResult: JSON.stringify(normalizedReply(reply, member, res)) }
  } catch (e) {
    state.lastError = { phase: 'reply-parsed', code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
    // 消费失败 ⇒ **不改写**：让内核按原载荷派发，它的拒绝会以具名回执到达（绝不静默丢）。
    return undefined
  }
}

export const V3_METHODS_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-methods', apiVersion: 1 }),
  // trigger-workflow：解锁 api.services（vmu.records / vmu.turn / vmu.library）。
  // rewrite-result：K10（return { rewriteResult } 需要它；非 JSON 对象文本会被内核具名拒）。
  capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
  hooks: Object.freeze({
    [V3_TICK_TOPIC]: onTick,
    [REPLY_PARSED_HOOK]: onReplyParsed,
  }),
})

export default V3_METHODS_MODULE
