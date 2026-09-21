// ============================================================
// Vibe Math V5 架构图生成器（零依赖，纯 Node）
//
//   node docs/generate_framework_diagram_v5.mjs
//   → 写出 示例图/框架图-v5.svg
//
// v2/v3/v4 用 matplotlib 脚本生成 PNG；v5 用 Node 直接生成 **SVG**：
//   · 本仓库的运行时就包含 Node，不需要额外装 Python / matplotlib；
//   · SVG 是纯文本，diff 友好、可评审、任意缩放不糊。
// 需要 PNG 时用浏览器打开 SVG 另存，或用无头浏览器截图：
//   chrome --headless=new --window-size=1720,1100 --screenshot=框架图-v5.png 框架图-v5.svg
//
// 版式约定（改布局时请遵守，否则会重叠）：
//   · 每个 band 的标题在 y+27、副标题在 y+47，**内容从 y+56 开始**；
//   · 左侧 x=40..214 是一条「控制面通道」，只有所办↔框架的连线走这里，
//     研究所/框架两个 band 从 x=226 开始 —— 这样控制面的箭头不会穿过所内成员；
//   · 生成时会估算文字宽度，超出容器的行会打印 WARN，便于立刻发现溢出。
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '示例图', '框架图-v5.svg')

const W = 1720, H = 1116
const FONT = "'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC',sans-serif"
const MONO = "'Cascadia Mono','Consolas','SFMono-Regular',monospace"

const C = {
  ink: '#10202e', ink2: '#2c4557', mute: '#5d7788',
  frame: '#0b6fb8', frameBg: '#eaf3fd',
  house: '#b26a00', houseBg: '#fdf5e2',
  data: '#1f7a52', dataBg: '#eef7f1',
  gate: '#b3202c', gateBg: '#fdeef0',
  human: '#5b4bb8', humanBg: '#f1eefc',
  line: '#7d93a3',
}

// band geometry
const FULL_L = 40, FULL_R = W - 40                 // 40 .. 1680
const MAIN_L = 226, MAIN_R = FULL_R                // 研究所 / 框架（让出控制面通道）
const IN_L = MAIN_L + 22, IN_R = MAIN_R - 22       // 226+22=248 .. 1638

const warnings = []
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// 粗略字宽估算：CJK/全角 1.0em，ASCII 0.56em。用来抓文字溢出（比截图更快）。
const textWidth = (s, fs) => [...String(s)].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56), 0) * fs
const fits = (s, fs, limit, where) => {
  const w = textWidth(s, fs)
  if (w > limit) warnings.push(`${where}: 文字宽 ${w.toFixed(0)} > 可用 ${limit.toFixed(0)} — ${String(s).slice(0, 42)}…`)
  return w
}

const out = []
const push = (s) => out.push(s)

// ---------- primitives ----------
function band(x, y, w, h, title, sub, { fill, stroke, titleFill = C.ink }) {
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`)
  fits(title, 15, w - 36, 'band title')
  push(`<text x="${x + 18}" y="${y + 27}" font-size="15" font-weight="700" fill="${titleFill}">${esc(title)}</text>`)
  if (sub) {
    fits(sub, 12, w - 36, 'band sub')
    push(`<text x="${x + 18}" y="${y + 47}" font-size="12" fill="${C.mute}">${esc(sub)}</text>`)
  }
}

function card(x, y, w, h, lines, { fill = '#ffffff', stroke = C.frame, fs = 13, sfs = 11, titleFill = C.ink } = {}) {
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`)
  const cx = x + w / 2
  const lead = fs + 4
  const total = (lines.length - 1) * lead
  if (total + fs > h) warnings.push(`card@${x},${y}: ${lines.length} 行需要高 ${(total + fs).toFixed(0)} > 容器 ${h}`)
  let ty = y + h / 2 - total / 2 + fs * 0.36
  lines.forEach((ln, i) => {
    const size = i === 0 ? fs : sfs
    fits(ln, size, w - 16, `card line@${x},${y}`)
    push(`<text x="${cx}" y="${ty.toFixed(1)}" font-size="${size}" font-weight="${i === 0 ? 700 : 400}" `
      + `fill="${i === 0 ? titleFill : C.ink2}" text-anchor="middle">${esc(ln)}</text>`)
    ty += lead
  })
}

function plain(x, y, text, { size = 12, fill = C.ink2, anchor = 'start', weight = 400, mono = false, limit = null, where = 'plain', halo = false } = {}) {
  if (limit) fits(text, size, limit, where)
  // halo: 白色描边垫在文字下，用于压在连线上的标签，避免线从字中间穿过
  push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"`
    + (halo ? ' paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"' : '')
    + (mono ? ` font-family="${MONO}"` : '') + `>${esc(text)}</text>`)
}

function arrow(x1, y1, x2, y2, { color = C.line, dashed = false, both = true, width = 1.6, marker = 'both' } = {}) {
  push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" `
    + (dashed ? 'stroke-dasharray="7 5" ' : '')
    + (both ? `marker-start="url(#${marker})" ` : '') + `marker-end="url(#${marker})"/>`)
}

function polyline(points, { color = C.human, width = 2, dashed = false, marker = 'bothHuman' } = {}) {
  const d = points.map((p, i) => (i ? 'L' : 'M') + ' ' + p[0] + ' ' + p[1]).join(' ')
  push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" `
    + (dashed ? 'stroke-dasharray="7 5" ' : '') + `marker-start="url(#${marker})" marker-end="url(#${marker})"/>`)
}

// ---------- document ----------
push('<?xml version="1.0" encoding="UTF-8"?>')
push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vibe Math V5 研究所架构图">`)
push(`<defs>
  <marker id="both" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.line}"/></marker>
  <marker id="bothHuman" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.human}"/></marker>
  <marker id="bothFrame" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.frame}"/></marker>
  <marker id="bothData" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.data}"/></marker>
  <marker id="bothHouse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.house}"/></marker>
</defs>`)
push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
push(`<g font-family="${FONT}">`)

// ---- 标题 ----
plain(W / 2, 40, 'Vibe Math V5 —— 研究所体系', { size: 27, fill: C.ink, anchor: 'middle', weight: 700 })
plain(W / 2, 67, '框架只是媒介：中继消息 · 沉淀产物 · 计数表决 · 管理上下文。它绝不指派任务 —— 组织与分派是所内院士的职责',
  { size: 13, fill: C.mute, anchor: 'middle', limit: W - 80, where: 'subtitle' })

// ---- 求真门槛 ----
band(FULL_L, 84, FULL_R - FULL_L, 94, '求真门槛 —— 唯一让对象进入 Verified/ 的规则',
  'm = min(quorumCap, 在册有表决权人数)　·　票是 [0,1] 概率：恰好 1 = 断言为真，恰好 0 = 断言为假，严格介于两者 = 弃权/存疑（不计入 m，计入全组平均）',
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
card(62, 140, 506, 28, ['布尔票 ≥ m 且全部为 1 或全部为 0 → 定论，写入 Verified/'], { stroke: C.gate, fs: 12 })
card(588, 140, 506, 28, ['同时出现 1 与 0 → 阻塞：少数派无法靠别人弃权把结论推过去'], { stroke: C.gate, fs: 12 })
card(1114, 140, 524, 28, ['未达门槛 → 留在原库 + 全组平均概率 + 完整辩论录（不强行裁决）'], { stroke: C.gate, fs: 12 })

// ---- 所办 ----
band(FULL_L, 190, FULL_R - FULL_L, 100, '所办（会话根代理 / 人）—— 研究所的对外接口',
  '不参与研究 · 不投票 · 只汇报与转达人的指令；代持平台要求的一次性创建权',
  { fill: C.humanBg, stroke: C.human, titleFill: C.human })
card(62, 246, 372, 38, ['自然语言接口 + 汇报者', '「求解 XX」「进度如何」「暂停」'], { stroke: C.human, fs: 12, sfs: 10.5 })
card(452, 246, 372, 38, ['vibe_v5_configure → start', 'message / meeting / hire / fire'], { stroke: C.human, fs: 12, sfs: 10.5 })
card(842, 246, 330, 38, ['pause / resume / stop', 'set 调参（立即生效）'], { stroke: C.human, fs: 12, sfs: 10.5 })
card(1190, 246, 448, 38, ['/v5 斜杠命令（与工具等价）', 'configure|start|resume|pause|status|report|members|message|meeting|hire|fire|set'],
  { stroke: C.human, fs: 12, sfs: 9 })

// ---- 研究所 ----
band(MAIN_L, 302, MAIN_R - MAIN_L, 240, '研究所（所内自治）—— 编制、组织与分派都在成员之间完成，框架永不指派',
  '院士 acad：领头人 / 组织与协调中心　·　常驻研究员 r-n：有表决权　·　临时工 t-n：无表决权（由雇主雇入与解雇）',
  { fill: C.houseBg, stroke: C.house, titleFill: '#8a5200' })
card(IN_L, 362, 300, 142, [
  '院士 acad',
  '领头人 · 组织与协调中心',
  'L1 建立全所视图（overview）',
  'L2 拆解并分派任务（assign）',
  'L3 设定优先级（prioritize）',
  'L4 召集并主持会议（convene）',
  'L5 督导进度（nudge）',
  'L6 调配临时工 · L7 对外代表',
], { stroke: C.house, fs: 13.5, sfs: 10.5 })
plain(IN_L + 150, 520, '四条边界：一票与他人等重 / 分派的是工作不是结论 /', { size: 10, fill: C.gate, anchor: 'middle', limit: 300, where: 'acad note' })
plain(IN_L + 150, 536, '成员可据理反对 / 不能自我扩张编制', { size: 10, fill: C.gate, anchor: 'middle', limit: 300, where: 'acad note' })

const RX = IN_L + 328, RW = 1390 - 328 - 44
const rcw = (RW - 2 * 20) / 3
plain(RX, 372, '常驻研究员（有表决权 · 可自主雇佣/解雇自己的临时工）', { size: 11.5, fill: '#8a5200', weight: 700, limit: RW, where: 'researcher label' })
for (let i = 0; i < 3; i++) {
  card(RX + i * (rcw + 20), 380, rcw, 52, [`常驻研究员 r-${i + 1}`, 'continuable 持久会话 · 自主方向 · 主动汇报'],
    { stroke: C.house, fs: 13, sfs: 10.5 })
}
plain(RX, 452, '临时工（无表决权 · 为特定任务临时雇入 · 雇主或院士可解雇）', { size: 11.5, fill: '#8a5200', weight: 700, limit: RW, where: 'temp label' })
for (let i = 0; i < 3; i++) {
  card(RX + i * (rcw + 20), 460, rcw, 52, [`临时工 t-${i + 1}`, `由 r-${i + 1} 雇入 · 可读/可想/可发言/可写自己的库`],
    { stroke: '#c99a4a', fs: 13, sfs: 10.5 })
}
plain(RX, 536, '所内组织动作（分派 · 优先级 · 督办 · 会议 · 用人）由院士发起，不是框架行为 —— 框架只负责送达',
  { size: 10.5, fill: C.mute, limit: RW, where: 'house note' })

// ---- 框架 ----
band(MAIN_L, 566, MAIN_R - MAIN_L, 286, '框架 vibe-v5 —— 只是媒介（middleware）：中继 · 沉淀 · 计数 · 调度',
  '每轮发「状态块 + 本轮问句」（规章在 persona 里，不进对话）；成员回一个 JSON：say / progress / record / verdict / task_* / hire / fire / reject_assign / input / vote_solved',
  { fill: C.frameBg, stroke: C.frame, titleFill: '#084d80' })
const chips = [
  ['消息中继（持久邮箱）', '群聊 / 私信 / 致全体表决者', '所办通知 / 分派 / 督办 / 框架提示', '逐收件人落盘 · 先落盘再投递 · 群聊合批'],
  ['会议 / 辩论', '议程 · 实时名册对账 · 随机发言序', '与验证互斥：任一方进行中，另一方排队', '看门狗：卡死即放弃并回到自组织'],
  ['任务板（CAS + DAG）', '开 / 认领 / 释放 / 完成 / 重开 / 分派', '版本号比较交换 · 依赖环检测', '写范围重叠告警 · 解雇自动收回'],
  ['m 票共识验证', '发起 → 独立初评 → 公开辩论重投', '布尔一致 + ≥ m 才定论', 'Verified/ 卡 + 辩论录 + 全组平均概率'],
  ['上下文与活性', '阈值压缩（人设不丢）· 免轮询活动等待', '优先级调度 · 心跳永远重武装', '并发闸 maxParallel · 停滞自动开会'],
  ['编制与雇佣', '院士/研究员可雇自己的临时工', '雇主或院士可真实解雇（释放子会话）', '代号永不复用 · 按人/全所双配额'],
]
const ccw = (IN_R - IN_L - 2 * 22) / 3
chips.forEach((c, i) => {
  card(IN_L + (i % 3) * (ccw + 22), i < 3 ? 620 : 708, ccw, 78, c, { stroke: C.frame, fs: 12.5, sfs: 10.5 })
})
card(IN_L, 796, IN_R - IN_L, 38, [
  '调度器优先级：进行中的会议或验证（二者互斥，永不同时）→ 队列中的验证 → 暂存会议 → 已认领/被分派的在办任务（按 activityTimeoutMs 节流）→ 加急邮件 → 群聊摘要 → 停滞自动开会 → 兜底心跳',
], { stroke: C.frame, fs: 11.5 })

// ---- 数据面 ----
band(FULL_L, 876, 790, 196, '状态权威源：会话日志的 host-only 投影单元（键 vibeMathV5）',
  '副作用只是往会话日志追加事件 —— 不进模型上下文（零 token 成本），checkpoint / restore 交给 DSH',
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(62, 932, 360, 124, [
  'applyV5Event（纯折叠，只此一份）',
  '11 类事件：institute / member / task /',
  'message / delivered / meeting / debate /',
  'verdict / queue / counters / progress',
  '未知或损坏事件 → 跳过并记入 diagnostics：',
  '可用性优先，绝不因一条坏事件卡死全场',
], { stroke: C.data, fs: 12, sfs: 10.5 })
card(434, 932, 374, 124, [
  'checkpoint / restore / resume',
  '投影随会话日志一起 checkpoint；restore',
  '时从快照 + 日志尾部重新折叠 → 跨进程与',
  '同进程恢复走同一条代码路径',
  '回退：宿主无 sessionProjections 时改用',
  '加固 JSON：State/<institute>.v5state.json',
], { stroke: C.data, fs: 12, sfs: 10.5 })

band(852, 876, FULL_R - 852, 196, '文件面：人可读产物（投影之外的一切都只是镜像）',
  '共识的权威在投影；文件是工作区与可读产物，手工改坏不会破坏研究所',
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(874, 932, FULL_R - 874 - 22, 124, [
  'Members/<id>/Progress|Propos|Methods|Subproblems/',
  '只有本人可写，人人可读（跨读被鼓励）',
  'Shared/Chat/*.md · Shared/Meetings/<mt-id>.md · Shared/Debates/<obj>.md',
  'Shared/TaskBoard.md · Institutes.md（编制镜像）· State/README.md（说明此处非权威）',
  'Problems/<id>.md（原问题）· Problems/conclusion.md（结题）· Verified/<类型>/<id>.md（定论，只读）',
], { stroke: C.data, fs: 11.5, sfs: 10.5 })

// ---- 连线：控制面（左侧通道，不穿过所内成员） ----
const CHX = 127
polyline([[CHX, 290], [CHX, 700], [MAIN_L, 700]], { color: C.human, width: 2 })
plain(CHX, 336, '工具面', { fill: C.human, anchor: 'middle', size: 12, weight: 700, halo: true })
plain(CHX, 356, 'vibe_v5_*', { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 374, '/v5 命令', { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 398, '↓', { fill: C.human, anchor: 'middle', size: 13, weight: 700, halo: true })
plain(CHX, 470, '汇报', { fill: C.human, anchor: 'middle', size: 12, weight: 700, halo: true })
plain(CHX, 490, 'status', { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 508, 'report', { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 532, '↑', { fill: C.human, anchor: 'middle', size: 13, weight: 700, halo: true })
plain(CHX, 600, '所办不投票', { fill: C.mute, anchor: 'middle', size: 10, limit: 170, where: 'ch note' })
plain(CHX, 616, '不能让结论变真', { fill: C.mute, anchor: 'middle', size: 10, limit: 170, where: 'ch note' })
plain(CHX, 644, '也不替成员', { fill: C.mute, anchor: 'middle', size: 10, limit: 170, where: 'ch note' })
plain(CHX, 660, '思考或署名', { fill: C.mute, anchor: 'middle', size: 10, limit: 170, where: 'ch note' })

// ---- 连线：研究所 ↔ 框架（提示词 / 回执） ----
arrow(560, 542, 560, 566, { color: C.frame, marker: 'bothFrame', width: 2 })
arrow(1400, 542, 1400, 566, { color: C.frame, marker: 'bothFrame', width: 2 })
plain(980, 559, '↑ 每轮提示词（状态块 + 本轮问句）　　↓ 单个 JSON 回执',
  { fill: C.frame, anchor: 'middle', size: 10.5, limit: 780, where: 'prompt label', halo: true })

// ---- 连线：所内组织（虚线 = 不由框架执行） ----
arrow(556, 400, 578, 400, { color: C.house, dashed: true, width: 1.8, marker: 'bothHouse' })
arrow(556, 430, 578, 430, { color: C.house, dashed: true, width: 1.8, marker: 'bothHouse' })

// ---- 连线：框架 ↔ 数据面 ----
arrow(400, 852, 400, 876, { color: C.data, marker: 'bothData', width: 2 })
plain(392, 868, 'append / fold / stateOf', { fill: C.data, anchor: 'end', size: 10.5, halo: true })
arrow(1280, 852, 1280, 876, { color: C.data, marker: 'bothData', width: 2 })
plain(1288, 868, '读写产物', { fill: C.data, anchor: 'start', size: 10.5, halo: true })

// ---- 图例 ----
plain(52, 1098, '图例', { size: 12, fill: C.ink, weight: 700 })
const legend = [
  [C.human, '所办 / 人（外部接口，不研究不投票）'],
  [C.house, '所内成员与所内组织（虚线 = 不由框架执行）'],
  [C.frame, '框架（中继 / 沉淀 / 计数 / 调度）'],
  [C.data, '状态与产物'],
  [C.gate, '求真门槛（唯一定论规则）'],
]
legend.forEach(([col, txt], i) => {
  const x = 108 + i * 330
  push(`<rect x="${x}" y="1087" width="14" height="14" rx="3" fill="#ffffff" stroke="${col}" stroke-width="2"/>`)
  plain(x + 21, 1099, txt, { size: 11, fill: C.ink2, limit: 305, where: 'legend' })
})

push('</g>')
push('</svg>')

mkdirSync(dirname(OUT), { recursive: true })
const svg = out.join('\n')
writeFileSync(OUT, svg, 'utf8')
console.log('saved ' + OUT + ' (' + svg.length + ' bytes)')
if (warnings.length) {
  console.error('\n布局告警（文字可能溢出容器）：')
  for (const w of warnings) console.error('  WARN ' + w)
  process.exit(1)
}
console.log('layout: no overflow warnings')
