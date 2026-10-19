/**
 * packs/v3/middleware/dataplane.js — PHASE 6 / **P0-9（数据面：轨/卡/索引/持久）** ＋ **P0-6（软规范三卡 ＋ Verified 分裂）**。
 *
 * 这一版把 v3 的 md 软规范落成 `vmu.records` 上的**卡**：
 *
 *   ① **三卡**（P0-9 证据 `vibe-math-v3.js:906-1015` 的 compose/parse）：问题卡、命题卡、方法卡。
 *      头部锚点行（`- 状态:`／`- 概率:` …）是唯一强制部分，正文是自由叙述；调度器只解析锚点。
 *   ② **正文只增不减**（`vibe-math-v3.js:893-903` 的 `withExtraSections`）：compose 只重写它接管的那几段，
 *      其余任意 `## ` 段（代理自己写的、或人在卡里加的）**原样保留**。`findSectionHeads` 跳过围栏代码块
 *      （`vibe-math-v3.js:6128-6143` 的审计 L4：围栏里的 `## ` 不是段边界，否则回写会把代码块劈开）。
 *   ③ **Verified 分裂**（`vibe-math-v3.js:1060-1080` composeVerifiedMd、`:2112-2131` writeVerifiedCardIfChanged）：
 *      只有**定论**（命题 概率 1/0、问题 已解决）才能复制进 `verified` 轨；内容不变**不重写**（幂等）。
 *      轨的形状由**值层** `settings/defaults.json` 声明 —— `vmu.records.tracks` 在 `createKernel` 构造期被
 *      `kernel/records.js:214` 快照一次，写进被装载清单的 `settings` 会**永远读不到**且不报错。
 *   ④ **索引**（`vibe-math-v3.js:1205-1259` rebuildIndex/启动扫描、`:2039` 5s 节流）：重建是**读视图**，
 *      不写盘；条目数 = 该轨上的卡数，截断有 `dropped` 计数，**坏卡只被点名，不让整个索引失败**。
 *
 * ★ 本模块【不新增拒码】：本仓码表是单一登记源（docs/03 §8.1 由代码扫描生成），一个未登记的
 *   `VMU_PACK_V3_*` 会让文档门禁变红，而 `docs/**` 不在本卡的写域。所以拒绝一律复用已登记的内核码
 *   （`VMU_INVALID_ARGUMENT`／`VMU_STATE`），并带 message＋hint —— 具名，不静默。
 *
 * ★ 时间只来自**注入的时钟**：`v3/tick` 事件的 `at`（调度器 clock() 的值）。没有注入时钟就**不重建索引**，
 *   并在回执里写明 `skipped` 的理由，绝不编一个“当前时间”。
 *
 * ★ `INDEX_THROTTLE_MS` 是 v3 的 5s 节流（`:2039`）的**唯一值**。它目前没有设置键：P0 不给无消费者的机制，
 *   而新增 `vmu.v3.*` 键必须先登记进 `settings/schema.js`（本卡的写域不含该文件）⇒ 如实暴露为常量，
 *   并在 `status()` 里自报，而不是假装它可配置。
 */
import { V3_TICK_TOPIC } from './tick.js'
// P1-9：defect 标记是归档证明的**共同真源**。`findVerified` 与 `promoteVerified` 都先问它，避免“某处还读得到 passed”。
import { latestDefect } from './defects.js'

/** 局部文本归一（dataplane 的 helper；与内核 str 同义）。 */
const str = (v) => (v === undefined || v === null ? '' : String(v))
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** v3 的记录轨。★ 这是**值层**的同一份清单（settings/defaults.json 的 vmu.records.tracks），此处仅供测试与文档对照。 */
export const V3_TRACKS = Object.freeze([
  // P1-5：`reports` 是 v3 汇报面（file 路）的持久快照轨；它不是“卡”轨（kind=state），所以 CARD_KINDS 不含它。
  'problems', 'propos', 'methods', 'directions', 'journal', 'verified', 'plans', 'inventions', 'votes', 'reports',
])

/** 有卡片形状的 kind（索引只解析这些；journal 的 state、vote 等不是卡片，不算坏卡）。 */
export const CARD_KINDS = Object.freeze(['problem', 'proposition', 'method', 'verified', 'plan', 'invention', 'direction'])

/** kind → 轨（写入侧只走这一张表，避免“写进 A、又从 B 读”）。 */
export const KIND_TRACK = Object.freeze({
  problem: 'problems',
  proposition: 'propos',
  method: 'methods',
  verified: 'verified',
  plan: 'plans',
  invention: 'inventions',
  direction: 'directions',
})

/** v3 的 5s 索引节流（`vibe-math-v3.js:2039`）。见文件头：没有设置键，不自称可配。 */
export const INDEX_THROTTLE_MS = 5000

/** 某 kind 的落点轨。未知 kind ⇒ 具名拒（不给一个“猜出来的”轨）。 */
export function trackForKind(kind) {
  const track = KIND_TRACK[String(kind)]
  if (!track) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown card kind: ' + String(kind),
      'a v3 card kind must be one of ' + Object.keys(KIND_TRACK).join(', ') + ' (the track names are declared in vmu.records.tracks)')
  }
  return track
}

/** 具名拒绝：调用者的词汇 + code + hint（AGENTS 红线 3）。码只用已登记的内核码，理由见文件头。 */
function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const uniq = (arr) => arr.filter((v, i) => arr.indexOf(v) === i)

// ── md 软规范的逐行格式（v3 `vibe-math-v3.js:880-903`、`:6113-6226` 的等价实现） ────────────────────────
// 约定：锚点行是**逐行**格式；字段里的换行会被折成空格（否则一行会劈成两行，下一行既不是锚点也会污染解析）。
export function anchorLine(k, v) {
  return '- ' + k + ': ' + String(v == null ? '' : v).replace(/[\r\n]+/g, ' ')
}

/** 顶层 `## ` 段边界，**跳过围栏代码块**（``` 或 ~~~）。返回 [{name, from, len}]。 */
export function findSectionHeads(text) {
  const out = []
  const src = String(text == null ? '' : text)
  const lines = src.split('\n')
  let pos = 0
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; pos += line.length + 1; continue }
    if (!fence) {
      const m = /^##\s+(.+?)\s*$/.exec(line)
      if (m) out.push({ name: m[1].trim(), from: pos, len: line.length })
    }
    pos += line.length + 1
  }
  return out
}

/** 头/身切分：第一个 `## ` 之前是头部锚点区，之后是正文。 */
export function splitHeader(text) {
  const heads = findSectionHeads(text)
  const first = (heads.length > 0 && heads[0].from > 0) ? heads[0].from : -1
  const head = first === -1 ? String(text == null ? '' : text) : String(text).slice(0, first - 1)
  const body = first === -1 ? '' : String(text).slice(first)
  return { head, body }
}

/** 解析头部锚点行（`- 键: 值`）。 */
export function parseAnchors(head) {
  const anchors = {}
  const re = /^-\s*([A-Za-z\u4e00-\u9fa5/]+)\s*:\s*(.*)$/gm
  let m
  while ((m = re.exec(String(head))) !== null) anchors[m[1].trim()] = m[2].trim()
  return anchors
}

/** 切出正文里的全部 `## ` 段（含围栏保护的边界规则）。 */
export function parseBodySections(body) {
  const text = String(body == null ? '' : body)
  const heads = findSectionHeads(text)
  const found = []
  for (let i = 0; i < heads.length; i++) {
    const to = i + 1 < heads.length ? heads[i + 1].from : text.length
    found.push({ name: heads[i].name, text: text.slice(heads[i].from + heads[i].len, to).trim() })
  }
  return found
}

/** 读一个命名段（不存在 ⇒ 空串，不编内容）。 */
export function section(body, name) {
  const hit = parseBodySections(body).find((s) => s.name === name)
  return hit ? hit.text : ''
}

/** 未被 compose 接管的段：原样保留。 */
export function extraSections(body, managedNames) {
  return parseBodySections(body)
    .filter((s) => !managedNames.includes(s.name))
    .map((s) => ({ name: s.name, text: s.text }))
}

/** 把保留段追加到 compose 输出末尾（无则原样返回），保证正文只增不减。 */
export function withExtraSections(lines, extras) {
  if (!Array.isArray(extras) || extras.length === 0) return lines
  for (const s of extras) {
    if (!s || !s.name) continue
    lines.push('## ' + s.name)
    if (s.text) lines.push(s.text)
    lines.push('')
  }
  return lines
}

// 条目标题行的字段体：接受 `\\.` 转义对，但不接受裸 `｜`/裸换行（惰性匹配只在真分隔符处停）。
const ENTRY_FIELD = '(?:[^｜\\r\\n\\\\]|\\\\.)*?'
export function escField(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/｜/g, '\\｜').replace(/\r?\n/g, '\\n') }
export function unescField(v) {
  const s = String(v == null ? '' : v)
  if (s.indexOf('\\') === -1) return s
  return s.replace(/\\(.)/g, (_m, c) => (c === 'n' ? '\n' : c))
}
export function entryRe(kind) { return new RegExp('^###\\s*' + kind + '\\s*\\d+｜(' + ENTRY_FIELD + ')｜概率([-+0-9.eE]+)｜状态(' + ENTRY_FIELD + ')$') }
export function probText(v) { const n = Number(v); return Number.isFinite(n) ? String(n) : '0.5' }

/** 解析 `### 解法 N｜标题｜概率X｜状态Y` 这类条目。 */
export function parseEntries(body, kindRe) {
  const out = []
  const lines = String(body == null ? '' : body).split('\n')
  let cur = null
  for (const line of lines) {
    const m = kindRe.exec(line)
    if (m) {
      if (cur) out.push(cur)
      cur = { heading: line.trim(), title: (m[1] || '').trim(), prob: m[2] !== undefined ? Number(m[2]) : undefined, status: (m[3] || '').trim(), text: [] }
      continue
    }
    if (/^#{2,3}\s/.test(line)) { if (cur) { out.push(cur); cur = null } continue }
    if (cur) cur.text.push(line)
  }
  if (cur) out.push(cur)
  for (const e of out) e.text = e.text.join('\n').trim()
  return out
}

const safeJson = (v, fb) => { if (v == null || v === '') return fb; try { return JSON.parse(v) } catch { return fb } }

// ── compose：三卡 ＋ Verified ───────────────────────────────────────────────────────────────────────
export function composeProblem(card) {
  const lines = []
  lines.push('# 问题｜' + (card.标题 || card.id))
  lines.push(anchorLine('标题', card.标题 || card.id))
  lines.push(anchorLine('ID', card.id))
  lines.push(anchorLine('类型', '问题'))
  lines.push(anchorLine('状态', card.状态 || '求解中'))
  lines.push(anchorLine('优先级', card.优先级 == null ? 1 : card.优先级))
  lines.push(anchorLine('依赖', JSON.stringify(card.依赖 || [])))
  lines.push(anchorLine('被依赖', JSON.stringify(card.被依赖 || [])))
  lines.push(anchorLine('来源', card.来源 || '原始'))
  // P1-4：子问题三对象的“来源／动机”是逐字段可核的（空串＝未声明，不是“填了”）。
  if (card.动机) lines.push(anchorLine('动机', card.动机))
  // P1-3：晋升出来的判断命题问题与源命题**双向**可追（问题侧指回命题；命题侧指回问题）。
  if (card.来源命题) lines.push(anchorLine('来源命题', card.来源命题))
  lines.push(anchorLine('计划', card.计划 || ''))
  lines.push('')
  lines.push('## 陈述')
  lines.push(card.陈述 || '')
  lines.push('')
  if (card.来源与动机) { lines.push('## 来源与动机'); lines.push(card.来源与动机); lines.push('') }
  lines.push('## 解法候选')
  const sols = Array.isArray(card.solutions) ? card.solutions : []
  if (sols.length === 0) lines.push('（暂无解法候选）')
  else for (let i = 0; i < sols.length; i++) {
    const s = sols[i]
    lines.push('### 解法 ' + (i + 1) + '｜' + escField(s.title || '解法' + (i + 1)) + '｜概率' + probText(s.prob != null ? s.prob : 0.5) + '｜状态' + escField(s.status || '未定论'))
    lines.push(s.text || '')
    lines.push('')
  }
  return withExtraSections(lines, card.extraSections).join('\n').trimEnd() + '\n'
}

export function composeProposition(card) {
  const lines = []
  lines.push('# 命题｜' + (card.标题 || card.id))
  lines.push(anchorLine('标题', card.标题 || card.id))
  lines.push(anchorLine('ID', card.id))
  lines.push(anchorLine('类型', '命题'))
  lines.push(anchorLine('状态', card.状态 || '未定论'))
  lines.push(anchorLine('概率', card.概率 == null ? 0.5 : card.概率))
  lines.push(anchorLine('优先级', card.优先级 == null ? 1 : card.优先级))
  lines.push(anchorLine('依赖', JSON.stringify(card.依赖 || [])))
  if (card.来源问题) lines.push(anchorLine('来源问题', card.来源问题))
  if (card.来源方向) lines.push(anchorLine('来源方向', card.来源方向))
  // P1-4：子问题三对象里的临时假设命题也要有**可核的**来源与动机（不是只靠自由文本）。
  if (card.来源) lines.push(anchorLine('来源', card.来源))
  if (card.动机) lines.push(anchorLine('动机', card.动机))
  // P1-3：被自动晋升成问题卡的命题回指那个问题（与问题卡的 `来源命题` 互为反向指针）。
  if (card.晋升问题) lines.push(anchorLine('晋升问题', card.晋升问题))
  // P1-3：命题的「价值/关键性」是晋升判据（0..1）。只在有值时写锚点；缺省 = 未声明（不冒充 0.5）。
  if (card.价值关键性 !== undefined && card.价值关键性 !== null && card.价值关键性 !== '') lines.push(anchorLine('价值关键性', card.价值关键性))
  lines.push('')
  lines.push('## 陈述')
  lines.push(card.陈述 || '')
  lines.push('')
  const entriesOf = (label, list) => {
    lines.push('## ' + label)
    if (list.length === 0) lines.push('（暂无' + label + '）')
    else for (let i = 0; i < list.length; i++) {
      const s = list[i]
      lines.push('### ' + label.replace('尝试', '') + ' ' + (i + 1) + '｜' + escField(s.title || (label.replace('尝试', '') + (i + 1))) + '｜概率' + probText(s.prob != null ? s.prob : 0.5) + '｜状态' + escField(s.status || '未定论'))
      lines.push(s.text || '')
      lines.push('')
    }
  }
  entriesOf('证明尝试', Array.isArray(card.proofs) ? card.proofs : [])
  entriesOf('证伪尝试', Array.isArray(card.refutes) ? card.refutes : [])
  return withExtraSections(lines, card.extraSections).join('\n').trimEnd() + '\n'
}

export function composeMethod(card) {
  const lines = []
  lines.push('# 方法｜' + (card.标题 || card.id))
  lines.push(anchorLine('标题', card.标题 || card.id))
  lines.push(anchorLine('ID', card.id))
  lines.push(anchorLine('类型', card.类型 || '方法'))
  lines.push(anchorLine('状态', card.状态 || '经验'))
  lines.push(anchorLine('可信断言', JSON.stringify(card.可信断言 || [])))
  lines.push(anchorLine('上级体系', JSON.stringify(card.上级体系 || [])))
  lines.push(anchorLine('子方法', JSON.stringify(card.子方法 || [])))
  lines.push(anchorLine('相关', JSON.stringify(card.相关 || [])))
  lines.push(anchorLine('适用场景', card.适用场景 || ''))
  lines.push('')
  lines.push('## 核心内容')
  lines.push(card.核心内容 || '')
  lines.push('')
  if (card.定义与记号) { lines.push('## 定义与记号'); lines.push(card.定义与记号); lines.push('') }
  lines.push('## 应用记录')
  const apps = Array.isArray(card.applications) ? card.applications : []
  if (apps.length === 0) lines.push('（暂无应用记录）')
  else for (let i = 0; i < apps.length; i++) {
    const a = apps[i]
    lines.push('### 应用 ' + (i + 1) + '｜' + (a.at || '') + '｜问题 ' + (a.问题 || '') + (a.方向 ? ' 方向 ' + a.方向 : ''))
    lines.push(a.text || '')
    lines.push('')
  }
  lines.push('## 改进历史')
  const imps = Array.isArray(card.improvements) ? card.improvements : []
  if (imps.length === 0) lines.push('（暂无改进记录）')
  else for (let i = 0; i < imps.length; i++) {
    const im = imps[i]
    lines.push('### v' + (im.v || (i + 1)) + '（' + (im.原因 || '') + '）')
    lines.push(im.text || '')
    lines.push('')
  }
  return withExtraSections(lines, card.extraSections).join('\n').trimEnd() + '\n'
}

/** v3 的 Verified 卡形（`vibe-math-v3.js:1060-1080`）：结论/时间/来源 ＋ 全部 prob=1 的全文。 */
export function composeVerified(card) {
  const lines = []
  lines.push('# 已验证｜' + (card.标题 || card.id))
  lines.push(anchorLine('ID', card.id))
  lines.push(anchorLine('类型', card.类型 || '命题'))
  lines.push(anchorLine('结论', card.结论 === true ? '真' : (card.结论 === false ? '假' : '')))
  lines.push(anchorLine('概率', probText(card.概率)))
  lines.push(anchorLine('分类', card.分类 || '未分类'))
  lines.push(anchorLine('来源', card.来源 || ''))
  lines.push(anchorLine('时间', card.时间 || ''))
  lines.push('')
  lines.push('## 陈述')
  lines.push(card.陈述 || '')
  lines.push('')
  lines.push('## 可信内容')
  lines.push(card.内容 || '')
  lines.push('')
  return withExtraSections(lines, card.extraSections).join('\n').trimEnd() + '\n'
}

export function composeCard(kind, card) {
  switch (String(kind)) {
    case 'problem': return composeProblem(card)
    case 'proposition': return composeProposition(card)
    case 'method': return composeMethod(card)
    case 'verified': return composeVerified(card)
    default:
      throw refuse('VMU_INVALID_ARGUMENT', 'no v3 card composer for kind: ' + String(kind),
        'the three soft-spec cards are problem/proposition/method; verified is the split track')
  }
}

// ── parse：三卡 ＋ Verified（坏卡只被点名，不抛） ──────────────────────────────────────────────────────
const MANAGED = Object.freeze({
  problem: ['陈述', '来源与动机', '解法候选'],
  proposition: ['陈述', '证明尝试', '证伪尝试'],
  method: ['核心内容', '定义与记号', '应用记录', '改进历史'],
  verified: ['陈述', '可信内容'],
})
const MANAGED_FIELDS = Object.freeze({
  problem: { 陈述: '陈述', 来源与动机: '来源与动机' },
  proposition: { 陈述: '陈述' },
  method: { 核心内容: '核心内容', 定义与记号: '定义与记号' },
  verified: { 陈述: '陈述', 可信内容: '内容' },
})
const HEADING_KIND = Object.freeze({ 问题: 'problem', 命题: 'proposition', 方法: 'method', 已验证: 'verified' })

/** 解析一张卡。返回 {ok:true, kind, card} 或 {ok:false, reason}（**不抛**：坏卡由索引点名）。 */
export function parseCard(body) {
  const text = String(body == null ? '' : body)
  const m = /^#\s*([^\n｜]+)｜[^\n]*$/m.exec(text)
  if (!m) return { ok: false, reason: 'unknown-card-heading' }
  const kind = HEADING_KIND[m[1].trim()]
  if (!kind) return { ok: false, reason: 'unknown-card-heading:' + m[1].trim() }
  const { head, body: rest } = splitHeader(text)
  const a = parseAnchors(head)
  const extra = extraSections(rest, MANAGED[kind])
  const card = { id: a['ID'] || '', 标题: a['标题'] || '', extraSections: extra }
  if (!card.id) return { ok: false, reason: 'missing-anchor:ID' }
  if (kind === 'problem') {
    card.状态 = a['状态'] || '求解中'
    card.优先级 = a['优先级'] === 'never' ? 'never' : (Number(a['优先级']) || 1)
    card.依赖 = safeJson(a['依赖'], [])
    card.被依赖 = safeJson(a['被依赖'], [])
    card.来源 = a['来源'] || '原始'
    card.来源命题 = a['来源命题'] || ''
    card.动机 = a['动机'] || ''
    card.计划 = a['计划'] || ''
    card.陈述 = section(rest, '陈述')
    card.来源与动机 = section(rest, '来源与动机')
    card.solutions = parseEntries(section(rest, '解法候选'), entryRe('解法')).map((e) => ({ title: unescField(e.title), prob: e.prob, status: unescField(e.status), text: e.text }))
  } else if (kind === 'proposition') {
    card.状态 = a['状态'] || '未定论'
    const prob = Number(a['概率'])
    if (!Number.isFinite(prob)) return { ok: false, reason: 'probability-not-numeric:' + String(a['概率']) }
    card.概率 = prob
    card.优先级 = a['优先级'] === 'never' ? 'never' : (Number(a['优先级']) || 1)
    card.依赖 = safeJson(a['依赖'], [])
    card.来源问题 = a['来源问题'] || ''
    card.来源方向 = a['来源方向'] || ''
    card.来源 = a['来源'] || ''
    card.动机 = a['动机'] || ''
    card.晋升问题 = a['晋升问题'] || ''
    // P1-3：价值/关键性（0..1）；缺锚点 = 未声明（null），不是 0 —— 0 会把“没填”读成“最不重要”。
    card.价值关键性 = a['价值关键性'] === undefined || a['价值关键性'] === '' ? null : Number(a['价值关键性'])
    card.陈述 = section(rest, '陈述')
    card.proofs = parseEntries(section(rest, '证明尝试'), entryRe('证明')).map((e) => ({ title: unescField(e.title), prob: e.prob, status: unescField(e.status), text: e.text }))
    card.refutes = parseEntries(section(rest, '证伪尝试'), entryRe('证伪')).map((e) => ({ title: unescField(e.title), prob: e.prob, status: unescField(e.status), text: e.text }))
  } else if (kind === 'method') {
    card.类型 = a['类型'] || '方法'
    card.状态 = a['状态'] || '经验'
    card.可信断言 = safeJson(a['可信断言'], [])
    card.上级体系 = safeJson(a['上级体系'], [])
    card.子方法 = safeJson(a['子方法'], [])
    card.相关 = safeJson(a['相关'], [])
    card.适用场景 = a['适用场景'] || ''
    card.核心内容 = section(rest, '核心内容')
    card.定义与记号 = section(rest, '定义与记号')
    card.applications = parseEntries(section(rest, '应用记录'), /^###\s*应用\s*\d+｜(.*?)$/).map((e) => {
      const t = String(e.title)
      const mq = /(?:^|[\s｜])问题[ \t]+([^｜\s]+)/.exec(t)
      const md = /(?:^|[\s｜])方向[ \t]+([^｜\s]+)/.exec(t)
      return { at: t.split('｜')[0].trim(), 问题: mq ? mq[1] : '', 方向: md ? md[1] : '', text: e.text }
    })
    card.improvements = parseEntries(section(rest, '改进历史'), /^###\s*v(\d+)\s*（(.*?)）\s*$/).map((e) => {
      const mm = /^###\s*v(\d+)\s*（(.*?)）\s*$/.exec(e.heading)
      return { v: mm ? Number(mm[1]) : 0, 原因: mm ? mm[2] : '', text: e.text }
    })
  } else {
    card.类型 = a['类型'] || '命题'
    const 结论 = a['结论']
    if (结论 !== '真' && 结论 !== '假') return { ok: false, reason: 'verified-conclusion-not-final:' + String(结论) }
    card.结论 = 结论 === '真'
    const prob = Number(a['概率'])
    if (!Number.isFinite(prob)) return { ok: false, reason: 'verified-probability-not-numeric:' + String(a['概率']) }
    card.概率 = prob
    card.分类 = a['分类'] || '未分类'
    card.来源 = a['来源'] || ''
    card.时间 = a['时间'] || ''
    card.陈述 = section(rest, '陈述')
    card.内容 = section(rest, '可信内容')
    // ★ “verified 轨只含定论”：一张 概率 不是 1/0 的卡不是 Verified 卡 ⇒ 索引把它当坏卡点名。
    if (prob !== 1 && prob !== 0) return { ok: false, reason: 'verified-not-settled:概率=' + prob }
  }
  return { ok: true, kind, card }
}

// ── 回写：只改自己接管的锚点与段，未识别段逐字保留 ────────────────────────────────────────────────────
/**
 * 重写一张卡：`patch.anchors` 改托管锚点（仅改那些行），`patch.sections` 改托管段的内容
 * （不在托管清单里的名字按**自定义段**追加），**其余 `## ` 段原样保留在正文末尾**。
 */
export function rewriteCard(body, patch = {}) {
  const parsed = parseCard(body)
  if (!parsed.ok) return parsed
  const card = Object.assign({}, parsed.card)
  const updated = []
  const anchors = patch && typeof patch.anchors === 'object' && patch.anchors ? patch.anchors : {}
  for (const [k, v] of Object.entries(anchors)) {
    if (k === '概率') card.概率 = Number(v)
    else if (k === '结论') card.结论 = v === true || v === '真'
    else card[k] = v
    updated.push(k)
  }
  const managedFields = MANAGED_FIELDS[parsed.kind] || {}
  const sections = patch && typeof patch.sections === 'object' && patch.sections ? patch.sections : {}
  const added = []
  for (const [k, v] of Object.entries(sections)) {
    if (managedFields[k]) { card[managedFields[k]] = String(v == null ? '' : v); updated.push(k); continue }
    added.push({ name: k, text: String(v == null ? '' : v) })
  }
  const extras = (Array.isArray(card.extraSections) ? card.extraSections : []).slice()
  for (const s of added) {
    // 同名自定义段 ⇒ 就地替换（否则反复写会让同一段重复堆叠，正文“只增不减”就变成“只增不减地变胖”）。
    const i = extras.findIndex((x) => x.name === s.name)
    if (i >= 0) extras[i] = s
    else extras.push(s)
  }
  card.extraSections = extras
  return { ok: true, kind: parsed.kind, body: composeCard(parsed.kind, card), preserved: card.extraSections.map((s) => s.name), updated: uniq(updated) }
}

// ── 写入：有界（截断＋计数，不是拒写） ────────────────────────────────────────────────────────────────
/** 按 UTF-8 字节上限截断，且不劈开代理对（`String.slice` 可能切在 UTF-16 中间）。 */
function truncateToBytes(text, capBytes) {
  const s = String(text == null ? '' : text)
  if (Buffer.byteLength(s, 'utf8') <= capBytes) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (Buffer.byteLength(s.slice(0, mid), 'utf8') <= capBytes) lo = mid
    else hi = mid - 1
  }
  let end = lo
  const code = s.charCodeAt(end - 1)
  if (end > 0 && code >= 0xD800 && code <= 0xDBFF) end -= 1
  return s.slice(0, end)
}

/**
 * 写一条记录（卡的持久面）。**有界**：正文超过 `vmu.records.bodyCapBytes` 时按字节截断，并在回执里
 * 报 `dropped` —— **不是拒写**。上限取自 `records.status().caps.bodyCapBytes`（内核构造期的**同一个**
 * 快照），因此这里与内核不会出现“两个上限”。
 */
export function writeBody({ records, track, kind, title, body = '', tags = null, settled = false, by = null, capBytes = null } = {}) {
  if (!records || typeof records.put !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'writeBody needs a vmu.records handle', 'pass { records: kernel.records }')
  const caps = records.status().caps
  const cap = Number.isInteger(capBytes) && capBytes > 0 ? capBytes : caps.bodyCapBytes
  const text = String(body == null ? '' : body)
  const bytes = Buffer.byteLength(text, 'utf8')
  const kept = truncateToBytes(text, cap)
  const dropped = bytes - Buffer.byteLength(kept, 'utf8')
  // `tags` 是可选的：v3 的 `plans` 轨把**规划回执的动作**编码在 tags 上（P0-2），因此写入口必须能带它们。
  // 不传时保持原样（`records.put` 的默认是 []），所以已有的 4 个卡的调用点逐字节不变。
  const putSpec = { track, kind, title, body: kept, settled, by }
  if (Array.isArray(tags)) putSpec.tags = tags
  const rec = records.put(putSpec)
  return Object.assign({}, rec, {
    track, kind,
    bounded: { key: 'vmu.records.bodyCapBytes', cap, bytes, keptBytes: Buffer.byteLength(kept, 'utf8'), dropped, truncated: dropped > 0 },
  })
}

/**
 * 改一条**非卡记录**的正文（`records.supersede` 的有界包装）。与 `writeBody` 共用同一个上限与同一套
 * `bounded` 回执形状：`plans` 轨的记录是 JSON（不是 md 卡），`updateCard` 的 compose 路径不适用，所以
 * 它的第二版走这里 —— 两个写入点共享**同一份**截断实现与同一个 `vmu.records.bodyCapBytes` 快照。
 * `reason` 仍是必填的（内核 `supersede` 会以 `VMU_REASON_REQUIRED` 拒），这里只是把默认措辞点名。
 */
export function supersedeBody({ records, id, title = null, body, tags = null, reason = null, by = null, capBytes = null } = {}) {
  if (!records || typeof records.supersede !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'supersedeBody needs a vmu.records handle', 'pass { records: kernel.records }')
  const caps = records.status().caps
  const cap = Number.isInteger(capBytes) && capBytes > 0 ? capBytes : caps.bodyCapBytes
  const text = String(body == null ? '' : body)
  const bytes = Buffer.byteLength(text, 'utf8')
  const kept = truncateToBytes(text, cap)
  const dropped = bytes - Buffer.byteLength(kept, 'utf8')
  const spec = { id, reason: reason || 'v3 dataplane: bounded record body', title, body: kept, by }
  if (Array.isArray(tags)) spec.tags = tags
  const res = records.supersede(spec)
  return Object.assign({}, res, {
    bounded: { key: 'vmu.records.bodyCapBytes', cap, bytes, keptBytes: Buffer.byteLength(kept, 'utf8'), dropped, truncated: dropped > 0 },
  })
}

/** compose 一张卡并写它（kind 决定轨）。 */
export function writeCard({ records, kind, card, settled = false, by = null, capBytes = null } = {}) {
  const track = trackForKind(kind)
  const body = composeCard(kind, card)
  return writeBody({ records, track, kind, title: 'v3 ' + kind + '｜' + (card.标题 || card.id), body, settled, by, capBytes })
}

/**
 * 改一张卡：读 → `rewriteCard` → `records.supersede`（可审计的版本历史）。
 * 自定义 `## ` 段在回写后仍在正文里，`preserved` 把这件事实点名回报。
 */
export function updateCard({ records, id, patch = {}, reason = null, capBytes = null } = {}) {
  if (!records || typeof records.get !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'updateCard needs a vmu.records handle', 'pass { records: kernel.records }')
  const rec = records.get({ id })
  const rewritten = rewriteCard(rec.body, patch)
  if (!rewritten.ok) throw refuse('VMU_INVALID_ARGUMENT', 'record ' + String(id) + ' is not a parsable v3 card: ' + rewritten.reason, 'write the card through createCard()/composeCard() first')
  const caps = records.status().caps
  const cap = Number.isInteger(capBytes) && capBytes > 0 ? capBytes : caps.bodyCapBytes
  const bytes = Buffer.byteLength(rewritten.body, 'utf8')
  const kept = truncateToBytes(rewritten.body, cap)
  const dropped = bytes - Buffer.byteLength(kept, 'utf8')
  const res = records.supersede({ id, reason: reason || 'v3 dataplane: managed anchors/sections', body: kept })
  return {
    ok: true, id, rev: res.rev, kind: rewritten.kind, preserved: rewritten.preserved, updated: rewritten.updated,
    bounded: { key: 'vmu.records.bodyCapBytes', cap, bytes, keptBytes: Buffer.byteLength(kept, 'utf8'), dropped, truncated: dropped > 0 },
  }
}

// ── Verified 分裂：只有定论进 verified 轨，内容不变不重写 ──────────────────────────────────────────────
const timeText = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '')
const stripTime = (s) => String(s).split('\n').filter((l) => l.indexOf('- 时间:') !== 0).join('\n').trim()

/** 找到某个源卡的 Verified 卡（`- ID:` 等于源 id）。找不到 ⇒ null，绝不猜。 */
export function findVerified(records, sourceId, { fidelity = null } = {}) {
  // ★ P1-9 共同真源：defect 撤回后，verified 卡**不再被这个读点看见**（返回 null，而非返回旧证明）。
  const defect = latestDefect({ records, target: String(sourceId) })
  if (defect.defect && defect.defect.status === 'withdrawn') return null
  // 内核侧的 fidelity defect（`passedWithdrawn`）是另一份已存在的标记：读点也必须问它，否则它只是写入没人看。
  if (fidelity && typeof fidelity.passedWithdrawnFor === 'function' && fidelity.passedWithdrawnFor(String(sourceId))) return null
  const heads = records.list({ track: 'verified', limit: 0 })
  for (const h of heads.items) {
    const rec = records.get({ id: h.id })
    const parsed = parseCard(rec.body)
    if (parsed.ok && parsed.kind === 'verified' && String(parsed.card.id) === String(sourceId)) return { id: h.id, body: rec.body, rev: rec.rev }
  }
  return null
}

/** prob=1 的条目全文（命题取证明/证伪，问题取解法）——Verified 卡“可信内容”的全部来源。 */
function trustedContent(kind, card) {
  const parts = []
  if (kind === 'proposition') {
    const proofs = (card.proofs || []).filter((x) => x.prob === 1)
    const refutes = (card.refutes || []).filter((x) => x.prob === 1)
    proofs.forEach((x, i) => parts.push('【证明 #' + (i + 1) + '】' + (x.text || '')))
    refutes.forEach((x, i) => parts.push('【证伪 #' + (i + 1) + '】' + (x.text || '')))
  } else {
    const sols = (card.solutions || []).filter((x) => x.prob === 1)
    sols.forEach((x, i) => parts.push('【解法 #' + (i + 1) + '】' + (x.text || '')))
  }
  return parts.join('\n\n')
}

/**
 * 把一张**定论**卡复制进 `verified` 轨。
 * · 命题：概率必须是 1 或 0；· 问题：状态必须是`已解决`。否则 **具名拒** `VMU_STATE`（不是沉默地不写）。
 * · `written:false, unchanged:true` 表示内容没变（时间行不参与比较）—— 与 v3 `writeVerifiedCardIfChanged` 同义。
 */
export function promoteVerified({ records, sourceId, at = null, by = null, capBytes = null, fidelity = null } = {}) {
  if (!records || typeof records.get !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'promoteVerified needs a vmu.records handle', 'pass { records: kernel.records }')
  const src = records.get({ id: sourceId })
  const parsed = parseCard(src.body)
  if (!parsed.ok) throw refuse('VMU_INVALID_ARGUMENT', 'record ' + String(sourceId) + ' is not a parsable v3 card: ' + parsed.reason, 'only problem/proposition/method cards can be promoted')
  const card = parsed.card
  // ★ P1-9：内核 fidelity 的 `passedWithdrawn` 标记必须先问 —— 键是**卡片的逻辑 id**（不是记录 id）。
  if (fidelity && typeof fidelity.passedWithdrawnFor === 'function' && fidelity.passedWithdrawnFor(String(card.id))) {
    throw refuse('VMU_PACK_V3_DEFECT_WITHDRAWN', 'archived proof of ' + String(card.id) + ' was withdrawn by a fidelity defect marker',
      'the fidelity registry already records passedWithdrawn for this target; a new attempt cannot silently reinstate it')
  }
  // ★ P1-9：被 defect 撤回的对象**不能再进 verified 轨**（否则“撤回”会被下一次结算悄悄撤销）。
  const verdictOfDefect = latestDefect({ records, target: String(card.id) })
  if (verdictOfDefect.defect && verdictOfDefect.defect.status === 'withdrawn') {
    throw refuse('VMU_PACK_V3_DEFECT_WITHDRAWN', 'archived proof of ' + String(card.id) + ' was withdrawn by a defect marker',
      'the defect is the shared truth for every reader; if the proof is reinstated, record that as a NEW card/settlement, not by deleting the defect')
  }
  let 结论
  let 概率
  if (parsed.kind === 'proposition') {
    if (card.概率 !== 1 && card.概率 !== 0) {
      throw refuse('VMU_STATE', 'proposition ' + String(sourceId) + ' is not settled (概率=' + probText(card.概率) + '), so it cannot enter the verified track',
        'set - 概率: 1 or 0 once the verdict is in; until then the card is experience, not fact (v3 verified split)')
    }
    结论 = card.概率 === 1
    概率 = card.概率
  } else if (parsed.kind === 'problem') {
    if (card.状态 !== '已解决') {
      throw refuse('VMU_STATE', 'problem ' + String(sourceId) + ' is not settled (状态=' + String(card.状态) + '), so it cannot enter the verified track',
        'set - 状态: 已解决 once the problem is closed; until then the card is experience, not fact (v3 verified split)')
    }
    结论 = true
    概率 = 1
  } else {
    throw refuse('VMU_INVALID_ARGUMENT', 'a ' + parsed.kind + ' card cannot enter the verified track',
      'the verified track carries settled problem/proposition conclusions only (v3 verified split)')
  }
  const when = Number.isFinite(at) ? at : Number.isFinite(src.updatedAt) ? src.updatedAt : null
  const verifiedCard = {
    id: card.id,
    标题: card.标题 || card.id,
    类型: parsed.kind === 'problem' ? '问题' : '命题',
    结论, 概率,
    分类: parsed.kind === 'problem' ? '问题' : (card.分类 || '未分类'),
    来源: parsed.kind === 'problem' ? String(card.id) : String(card.来源问题 || card.来源 || card.id),
    时间: timeText(when),
    陈述: card.陈述 || '',
    内容: trustedContent(parsed.kind, card),
  }
  const body = composeVerified(verifiedCard)
  const existing = findVerified(records, card.id)
  if (existing && stripTime(existing.body) === stripTime(body)) {
    return { ok: true, written: false, unchanged: true, id: existing.id, sourceId: card.id, 结论, 概率, note: 'the verified card is already up to date (the time line is ignored when comparing, like v3 writeVerifiedCardIfChanged)' }
  }
  const caps = records.status().caps
  const cap = Number.isInteger(capBytes) && capBytes > 0 ? capBytes : caps.bodyCapBytes
  const kept = truncateToBytes(body, cap)
  const dropped = Buffer.byteLength(body, 'utf8') - Buffer.byteLength(kept, 'utf8')
  let outcome
  if (existing) outcome = Object.assign({ written: true, refreshed: true }, records.supersede({ id: existing.id, reason: 'v3 verified refresh (' + (结论 ? '真' : '假') + ')', body: kept }))
  else outcome = Object.assign({ written: true, refreshed: false }, records.put({ track: 'verified', kind: 'verified', title: '已验证｜' + (card.标题 || card.id), body: kept, settled: true, by }))
  return Object.assign(outcome, { sourceId: card.id, 结论, 概率, bounded: { key: 'vmu.records.bodyCapBytes', cap, dropped, truncated: dropped > 0 } })
}

// ── 索引：重建后条目数 = 磁盘卡数；截断有 dropped，坏卡只点名 ─────────────────────────────────────────
/**
 * 重建索引（**读视图**，不写盘）：逐轨取头，只解析 `CARD_KINDS` 的记录。
 * · `entries`   成功解析的卡数
 * · `dropped`   `limit`（每轨上限；0 = 不限）之外未进索引的卡数
 * · `diskCards` 该轨上的卡片记录总数
 * · `badCards`  解析失败的卡（**被点名，但索引整体仍然成功**）
 * 恒等式：`entries + badCards.length + dropped === diskCards`（测试断言它）。
 */
export function rebuildIndex({ records, tracks = V3_TRACKS, limit = 0, at = null } = {}) {
  if (!records || typeof records.list !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'rebuildIndex needs a vmu.records handle', 'pass { records: kernel.records }')
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 0
  const byTrack = {}
  const badCards = []
  let entries = 0
  let dropped = 0
  let diskCards = 0
  for (const track of tracks) {
    const heads = records.list({ track, limit: 0 })
    const cards = heads.items.filter((h) => CARD_KINDS.includes(h.kind))
    diskCards += cards.length
    const kept = cap === 0 ? cards : cards.slice(0, cap)
    dropped += cards.length - kept.length
    const rows = []
    const bad = []
    for (const h of kept) {
      try {
        const rec = records.get({ id: h.id })
        const parsed = parseCard(rec.body)
        if (!parsed.ok) { bad.push({ id: h.id, track, reason: parsed.reason }); continue }
        rows.push({
          id: h.id, track, kind: parsed.kind,
          title: parsed.card.标题 || parsed.card.id,
          status: parsed.card.状态 === undefined ? null : parsed.card.状态,
          prob: Number.isFinite(parsed.card.概率) ? parsed.card.概率 : null,
          rev: rec.rev,
        })
        entries += 1
      } catch (e) {
        bad.push({ id: h.id, track, reason: String((e && e.message) || e) })
      }
    }
    for (const b of bad) badCards.push(b)
    byTrack[track] = { available: cards.length, kept: kept.length, entries: rows.length, dropped: cards.length - kept.length, cards: rows, bad }
  }
  return {
    ok: true, at, tracks: tracks.slice(), entries, dropped, diskCards, badCards, byTrack,
    note: 'the index is a READ VIEW of the cards (nothing is written); truncation and unparsable cards are COUNTED and named, never silent',
  }
}

/**
 * ★ SLV / P0-9 COMPOSER: a SOLVER turn's journal has no card composer, so a complete proof stayed on the journal track and
 * the verifier never had a candidate. This lifts a proposition out of the SOLVER's own progress payload:
 *   · SOURCE IS THE TURN, not a journal scan - only role solver (member solver-*) is considered, so planner/explorer
 *     journal rows can never become verification candidates;
 *   · IDEMPOTENT - the record id is deterministic ('p-sol-' + turn id), so composing the same reply twice returns
 *     {already:true} and writes NO second card;
 *   · NAMED - a solver that claims success but carries no extractable statement/body gets a journal record with
 *     VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE instead of an empty card.
 */
export function composePropositionFromReply({ records, flat, at = null } = {}) {
  const turnId = str(flat && (flat.turn || (flat.receipt && flat.receipt.turn)))
  const role = str(flat && flat.role)
  const member = str(flat && flat.member)
  if (role !== 'solver' && !/^solver(?:-|$)/i.test(member)) return { ok: true, skipped: 'not-a-solver-turn' }
  const reply = flat && isObject(flat.reply) ? flat.reply : null
  const progress = reply && isObject(reply.progress) ? reply.progress : null
  const body = progress && typeof progress.body === 'string' ? progress.body : ''
  const tags = progress && Array.isArray(progress.tags) ? progress.tags.map(String) : []
  const status = str(progress && progress.status) || str(reply && reply.status)
  const solutionish = status === 'success' || tags.some((t) => /^solution\s*:/i.test(t)) || /证毕|完整解|Q\.E\.D|∎/.test(body)
  let qid = progress && progress.qid !== undefined ? str(progress.qid) : ''
  let dirId = progress && progress.dirId !== undefined ? str(progress.dirId) : ''
  const ctxTag = tags.find((t) => /^ctx\s*:/.test(t))
  if ((!qid || !dirId) && ctxTag) {
    const parts = ctxTag.replace(/^ctx\s*:/, '').split('｜')
    if (!qid && parts[0]) qid = parts[0].trim()
    if (!dirId && parts[1]) dirId = parts[1].trim()
  }
  if (!solutionish) return { ok: true, skipped: 'not-a-complete-solution' }
  const fail = (message, hint) => {
    try {
      writeBody({ records, track: 'journal', kind: 'state', title: 'v3 命题抽取失败', settled: true, by: 'v3-dataplane',
        body: ['- code: VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE', '- turn: ' + (turnId || '(none)'), '- member: ' + member,
          '- problem: ' + (qid || '(none)'), '- status: ' + (status || '(none)'), '- reason: ' + message, '- at: ' + (at === null ? '(none)' : String(at))].join('\n') })
    } catch { /* the named receipt below is the primary channel */ }
    return { ok: true, skipped: 'proposition-not-extractable', code: 'VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE', message, hint, turnId }
  }
  if (!qid) return fail('the solver reply carries no problem id (progress.qid / ctx tag), so no proposition can be anchored', 'the solver prompt must put qid/dirId in the progress payload or a ctx:qid｜dirId tag')
  if (!body.trim()) return fail('the solver claims a complete solution but its journal body is empty', 'a proposition must quote the statement/proof; refusing to create an empty card')
  const propId = 'p-sol-' + (turnId || (qid + '-' + String(body.length)))
  try {
    const existing = records.get({ id: propId })
    if (existing && existing.id === propId) return { ok: true, already: true, propositionId: propId, qid }
  } catch { /* not present: compose it */ }
  let statement = ''
  try {
    const items = records.list({ track: 'problems', limit: 0 }).items
    for (const it of items) {
      const full = records.get({ id: it.id })
      const text = String((full && full.body) || '')
      if (text.includes('- ID: ' + qid + '\n') || text.includes('- ID: ' + qid + ' ') || text.includes('- ID: ' + qid)) {
        const m = /(?:^|\n)[-*]\s*(?:描述|陈述)\s*[:：]\s*([^\n]*)/.exec(text)
        statement = m ? m[1].trim() : ''
        break
      }
    }
  } catch { statement = '' }
  if (!statement) statement = '问题 ' + qid + ' 的求解候选'
  const composedBody = ['# 命题｜' + qid + ' 的求解候选', '- ID: ' + propId, '- 类型: 命题', '- 标题: ' + qid + ' 的求解候选',
    '- 陈述: ' + statement, '- 状态: 未定论', '- 概率: 0.5', '- 来源: solver 回合 ' + (turnId || '(none)'),
    '- 问题: ' + qid + (dirId ? '，方向 ' + dirId : ''), '', '## 求解正文（来自 solver 回合的 journal）', '', body].join('\n')
  try {
    records.put({ id: propId, track: 'propos', kind: 'proposition', title: qid + ' 的求解候选', body: composedBody,
      tags: ['qid:' + qid, 'from:solver', turnId ? 'turn:' + turnId : 'turn:none'] })
    return { ok: true, composed: true, propositionId: propId, qid, dirId: dirId || null, turnId }
  } catch (e) {
    return fail('the proposition record could not be written: ' + str((e && e.message) || e), 'the records track/kind must accept proposition cards')
  }
}

// ── 模块：tick 驱动的索引重建（5s 节流） ──────────────────────────────────────────────────────────────
let indexRuns = 0
let lastIndexAt = null
let lastIndex = null

/** 只读自报（进程内；重启归零，与 tick.js 的计数同一口径：只用于诊断，不当作持久计数）。 */
export function v3DataplaneStatus() {
  return {
    topic: V3_TICK_TOPIC,
    throttleMs: INDEX_THROTTLE_MS,
    indexRuns,
    lastIndexAt,
    tracks: lastIndex === null ? null : lastIndex.tracks.slice(),
    index: lastIndex === null ? null : JSON.parse(JSON.stringify(lastIndex)),
  }
}

export const V3_DATAPLANE_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-dataplane', apiVersion: 1 }),
  // 读 vmu.records 必须声明它（kernel/loader.js:127-143 的能力门）。
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({
    // ★ SLV / P0-9: the solver turn's reply is the ONE source of verification candidates. The hook never throws: a
    // refusal is a named receipt/journal row, so a bad reply cannot break the turn loop.
    'turn/reply-parsed': async (event) => {
      const flat = event && typeof event === 'object' ? event : {}
      const api = flat.api
      if (!api || !api.services) return undefined
      try {
        const records = api.services.get('vmu.records')
        return composePropositionFromReply({ records, flat, at: Number.isFinite(flat.at) ? flat.at : null })
      } catch (e) {
        return { ok: true, skipped: 'composer-error', code: 'VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE', message: str((e && e.message) || e) }
      }
    },
    [V3_TICK_TOPIC]: async (event) => {
      const flat = event && typeof event === 'object' ? event : {}
      const api = flat.api
      if (!api || !api.services) {
        throw Object.assign(new Error('v3 dataplane received no api facade, so vmu.records cannot be reached'), {
          hint: 'a middleware entry must go through kernel/loader.js (module shape), not the raw bus path',
        })
      }
      const at = Number.isFinite(flat.at) ? flat.at : null
      // 时间只来自注入的时钟：没有它就不重建索引，并把理由写在回执里（绝不编一个“现在”）。
      if (at === null) return { ok: true, skipped: 'no-injected-clock', indexRuns, lastIndexAt }
      if (lastIndexAt !== null && at - lastIndexAt < INDEX_THROTTLE_MS) {
        return { ok: true, throttled: true, indexRuns, lastIndexAt, at, throttleMs: INDEX_THROTTLE_MS }
      }
      const records = api.services.get('vmu.records')
      const caps = records.status().caps
      lastIndex = rebuildIndex({ records, tracks: caps.tracks, at })
      indexRuns += 1
      lastIndexAt = at
      return {
        ok: true, throttled: false, indexRuns, at,
        entries: lastIndex.entries, dropped: lastIndex.dropped, diskCards: lastIndex.diskCards,
        badCards: lastIndex.badCards.length,
      }
    },
  }),
})

export default V3_DATAPLANE_MODULE
