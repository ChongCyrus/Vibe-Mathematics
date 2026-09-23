// ============================================================
// Vibe Math V4 架构图生成器（零依赖，纯 Node）
//
//   node docs/generate_framework_diagram_v4.mjs
//   → 写出 示例图/框架图-v4.svg（中文 —— 与本次加入语言开关之前逐字节一致）
//
//   node docs/generate_framework_diagram_v4.mjs --lang=en
//   node docs/generate_framework_diagram_v4.mjs --lang en
//   → 写出 示例图/框架图-v4-en.svg（英文 —— 同一份版式，只换文字）
//
// 所有面向人的文字都收在 zh / en 两张表里，绘制代码只从选中的那张表（T）取值；
// 语言开关**不改变**几何、颜色、坐标、元素顺序与绘制原语 —— 只改文字来源。
// 溢出告警（warnings + process.exit(1)）对两种语言同样生效：英文往往更长，
// 所以它同时也是"译文没有撑破容器"的守卫。
//
// 与 v5 同一套版式语言（band / card / 图例 / 溢出告警），只是内容换成 v4 的真实机制：
//   · 常驻层：continuable 持久子代理，独立上下文，自主方向；
//   · 框架层：只是媒介 —— 中继留言、沉淀产物、计数表决、管理上下文，**绝不指派任务**；
//   · 数据面：每人一个专属库（本人可写 / 他人只读）+ Shared/ 协作产物 + Verified/ 定论；
//   · 门槛：**全体常驻一致**（全 1 或全 0）才进 Verified/，没有 forced / flat / 近共识收口；
//   · Lean 形式化：formalVerify = off / encourage / require（passed 后审查对象变成"忠实性"）。
//
// 需要 PNG（市场轮播 / 预览图）时**不要**直接照着"窗口尺寸 = 画布尺寸"截图：
//   msedge --headless=new --window-size=1720,1260 --screenshot=示例图/框架图-v4.png 示例图/框架图-v4.svg   ← 会静默裁掉底部
// 原因：`--screenshot` 截的是**窗口**，而页面**视口**比窗口矮约 96px（浏览器 UI 占位），
// 画布底部那一截根本没被绘制——而 PNG 的尺寸又恰好等于画布尺寸，所以从尺寸上完全看不出来。
// （2.3.15 修掉的真实缺陷：v4/v5 的 PNG 因此丢了最下面的图例行，且连续两版没人发现。）
// 正确做法（按 SVG 自身尺寸渲染、裁掉多余高度、并校验墨迹到达内容底边）：
//   node docs/render_framework_diagram_png.mjs 示例图/框架图-v4.svg 示例图/框架图-v4.png 2
//
// 版式约定（改布局时请遵守）：
//   · 每个 band 的标题在 y+27、副标题在 y+47，**内容从 y+56 开始**；
//   · 左侧 x=40..218 是「人 / 助手」控制面通道，主内容从 x=230 开始 —— 工具面箭头不穿过成员；
//   · 生成时估算文字宽度，超出容器的行会打印 WARN 并以退出码 1 结束。
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- 语言开关 ----------
// 无参数 = zh（默认，输出与历史版本逐字节一致）；--lang=en 或 --lang en = 英文。
const LANGS = { zh: 'zh', 'zh-cn': 'zh', en: 'en' }
function parseLang(argv) {
  let lang = 'zh'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    let raw = null
    if (a === '--lang') raw = argv[++i]
    else if (a.startsWith('--lang=')) raw = a.slice('--lang='.length)
    else continue
    const key = String(raw === null || raw === undefined ? '' : raw).trim().toLowerCase().replace(/_/g, '-')
    if (!Object.prototype.hasOwnProperty.call(LANGS, key)) {
      console.error('unknown --lang value ' + (raw === undefined || raw === null ? '(missing)' : JSON.stringify(raw)) + ' (supported: zh | en)')
      process.exit(2)
    }
    lang = LANGS[key]
  }
  return lang
}
const LANG = parseLang(process.argv.slice(2))

// ============================================================
// 文字表 —— zh 就是历史版本的原文（不得改动），en 是同一句话的英文。
// 工具名 / 参数名 / 路径 / JSON 键 / 标识符不翻译，两表保持一致。
// ============================================================
const zh = {
  outFile: '框架图-v4.svg',
  ariaLabel: 'Vibe Math V4 常驻自组织架构图',

  title: 'Vibe Math V4 —— 常驻自组织合作研究',
  subtitle: '框架只是媒介：中继留言 · 沉淀产物 · 计数表决 · 管理上下文。它绝不分配任务 —— 分工由常驻之间留言与开会决定',

  gate: {
    title: '定论门槛 —— 唯一让对象进入 Verified/ 的规则',
    sub: '全体常驻一致为真（全 1）或一致为假（全 0）　·　没有任何 forced / flat / 近共识自动收口 —— 强分歧不得被强行判真',
    cards: [
      ['全体一致为真 → 写入 Verified/命题|问题/<id>.md，回写来源库状态 = 已验证·真'],
      ['全体一致为假 → 同样写入 Verified/（结论 = 假），来源库状态 = 已验证·假'],
      ['出现分歧 → 公开辩论重评；仍未全票 → 留库 + 全组平均概率 + 完整辩论录'],
    ],
  },

  residents: {
    title: '常驻层（所内自治）—— 编制、方向与分工都在常驻之间完成，框架永不指派',
    sub: '起始 brainstorm 产出各自方向　·　此后持续工作直到"全体认为已解决"（会议全票同意）　·　可增开 / 关闭常驻',
    cards: [
      ['常驻 r-1', 'continuable 持久会话', '独立上下文 · 自主方向', '只写自己的库', '跨读他人的库（只读）'],
      ['常驻 r-2', 'continuable 持久会话', '独立上下文 · 自主方向', '只写自己的库', '跨读他人的库（只读）'],
      ['常驻 r-3', 'continuable 持久会话', '独立上下文 · 自主方向', '只写自己的库', '跨读他人的库（只读）'],
      ['… r-N', 'add_member / remove_member', 'residentCount 默认 4', '唤醒 = sendMessage', '一轮 = 一次完整思考'],
    ],
  },

  human: {
    lines: [
      '人 / 助手',
      '会话根代理 = 接口',
      'configure → start',
      'message / meeting',
      'add_member / remove_member',
      'pause / resume / abort',
      'set 调参（立即生效）',
    ],
  },

  framework: {
    title: '框架 vibe-v4 —— 只是媒介（middleware）：中继 · 沉淀 · 计数 · 调度',
    sub: '每轮发「状态块 + 本轮问句」；常驻回一个 JSON：summary / solved / input / vote / propose_verify / propose_task / claim_task / task_done / voteSolved / formal / contextPct',
    chips: [
      ['消息总线 · 邮件箱', 'vibe_v4_message(to|all) → 入目标邮箱', '空闲则 sendMessage 唤醒；常驻之间不直接互调', '全靠框架 relay（模拟收件箱）· 支持广播'],
      ['会议 / 辩论', 'vibe_v4_meeting(agenda) → 全体发言', '写 Shared/meetings/<id>.md 并广播结论', '看门狗防死锁 · 与验证互斥（排队，不抢占）'],
      ['任务板（只搬运）', '提议 / 认领写在回执里 → Shared/taskboard.md', '认领后被唤醒；框架不决定谁做什么', 'open 任务在空闲时常驻的唤醒顺序里优先'],
      ['共识验证（全票）', '回执字段 propose_verify → FIFO 排队', '独立初评（互不可见）→ 公开辩论重评', '最多 verdictMaxRounds 轮（默认 3）；全票同向才入 Verified/'],
      ['上下文 / compact', 'contextPct ≥ compactThreshold（默认 66）', '触发 DSH /compact；压缩后重申核心规则', 'compactAfterRounds 默认 8；人设与哲学不丢'],
      ['活性 / 并发 / 恢复', 'activityTimeoutMs 心跳 · maxParallel 并发闸', '停滞 stallAutoMeetingMs（默认 6 min）自动开会', 'resume 用 residents.json + progress.md 重种化'],
    ],
    lean: [
      'Lean 形式化验证（可调参数 formalVerify = off / encourage / require）· 工具 vibe_v4_lean_run / _archive / _lib',
      'encourage：按实现难度自行决定是否形式化；require：真/假结论必须先有「Lean 通过」或显式阻塞记录，否则记为未定论',
      '★ 一旦 Lean 通过，审查对象就变了：不再是「推导对不对」，而是「Lean 的定义/对象/条件/假设/结论是否忠实于命题原文」',
      '★ 忠实性缺陷（decision=defect）≠ 命题为假：撤回「已通过」+ 撤回归档证明 + 进「形式化待办」，绝不记成 0/假',
    ],
    advance: [
      'subagent/end 之后框架按序推进：① 邮箱非空 → 唤醒非忙收件人　② open 任务 → 唤醒提议人/认领人　③ 待验证提议 → 开会　④ 否则心跳：唤醒最久未活跃者并给它开会',
    ],
  },

  libraries: {
    title: '常驻专属库（每人一个目录）',
    sub: '本人可写 · 他人只读（跨读被鼓励）—— 直接经 fs 写入，框架只登记',
    lines: [
      'Progress/<r-id>/progress.md',
      '本人持续进展（追加式，断点续跑靠它重种化）',
      '',
      'Propos/<r-id>/<p-id>.md　命题',
      'Methods/<r-id>/<m-id>.md　理论 / 方法 / 工具',
      'Subproblems/<r-id>/<s-id>.md　子问题',
      '',
      '每条记录必填：价值程度 / 动机用途计划 / 自身概率估计',
    ],
  },

  shared: {
    title: '共享与定论（VibeMath/Projects/<project>/）',
    sub: 'Shared/ 是协作产物；Verified/ 是唯一定论，写入后只读',
    lines: [
      'Shared/meetings/<id>.md　会议录 + 结论',
      'Shared/debates/<target>.md　辩论录（初评 + 重评）',
      'Shared/taskboard.md　任务板（提议 / 认领）',
      'Shared/meetings/brainstorm.md　起始头脑风暴',
      '',
      'Verified/命题/<id>.md　（或 问题/、方法→可信断言）',
      'Problems/<id>.md　原问题陈述',
      '未全票 → 留在来源库 + 平均概率 + 辩论录',
    ],
  },

  state: {
    title: '状态 / 隔离 / 恢复',
    sub: '框架自己的状态：注册表、邮件箱、锁、进程纪元',
    lines: [
      'State/residents.json　常驻注册表',
      'State/mailboxes.json　邮件箱（谁还没读）',
      'State/taskboard.json　任务板机器态',
      'State/decisions.json　关键决策留痕',
      'State/session.json　活动日志（人可读）',
      'State/settings.json　参数（set 立即生效）',
      'State/formal.json　Lean 形式化记录（非 off 档）',
      'fileOwner 写锁 · projectLock · processEpoch · abort→resume',
    ],
  },

  redlines: {
    title: '哲学红线（不可协商）',
    sub: '这五条是设计本体，不是实现细节；改它们等于换一个架构',
    cards: [
      ['框架绝不指派任务', '方向 / 分工 / 谁做什么', '只能由常驻留言与开会决定'],
      ['定论必须全体一致', '没有 forced / flat / 近共识收口', '强分歧只能留在库里'],
      ['只有 Verified/ 绝对可信', '其余（方法库未验证断言等）', '只作经验参考'],
      ['常驻不直接互调', '留言一律经框架 relay', '（模拟收件箱，先落盘再投递）'],
      ['人工干预不改变自组织', '留言 / 开会 / 增删成员都可用', '但"之后怎么做"仍由常驻决定'],
    ],
  },

  links: {
    toolSurface: ['工具面', 'vibe_v4_*', '/v4 命令', '↓'],
    report: ['汇报', 'status', 'report', '↑'],
    prompt: '↑ 每轮提示词（状态块 + 本轮问句）　　↓ 单个 JSON 回执',
    promptFields: 'say / progress / record_* / propose_verify / verdict / vote_solved / input / reject_assign / task_done',
    persist: '沉淀 / 记录 / 唤醒',
    notUnanimous: '未全票 → 留库附概率（虚线）',
  },

  legend: {
    title: '图例',
    items: [
      ['human', '人 / 助手（外部接口，不研究不投票）'],
      ['house', '常驻子代理（有表决权 · 自主方向）'],
      ['frame', '框架（中继 / 沉淀 / 计数 / 调度）'],
      ['data', '产物与状态（常驻专属库 / Shared / State）'],
      ['gate', '定论门槛 / Lean 形式化（可调）'],
    ],
  },

  msg: {
    saved: (p, n) => 'saved ' + p + ' (' + n + ' bytes)',
    warnHeader: '\n布局告警（文字可能溢出容器）：',
    warnPrefix: '  WARN ',
    ok: 'layout: no overflow warnings',
    widthOverflow: (where, w, limit, s) => `${where}: 文字宽 ${w} > 可用 ${limit} — ${s}…`,
    cardOverflow: (x, y, n, need, h) => `card@${x},${y}: ${n} 行需要高 ${need} > 容器 ${h}`,
  },
}

const en = {
  outFile: '框架图-v4-en.svg',
  ariaLabel: 'Vibe Math V4 resident self-organizing architecture diagram',

  title: 'Vibe Math V4 —— Resident Self-Organizing Collaborative Research',
  subtitle: 'The framework is only a medium: relay messages · persist artifacts · count votes · manage context. It never assigns tasks —— division of labor is decided by residents messaging and meeting',

  gate: {
    title: 'Truth gate —— the only rule that lets an object enter Verified/',
    sub: 'All residents agree true (all 1) or agree false (all 0)　·　no forced / flat / near-consensus auto-closing —— strong disagreement must not be forced true',
    cards: [
      ['All agree true → write Verified/命题|问题/<id>.md; source: verified·true'],
      ['All agree false → also write Verified/ (conclusion = false), source = false'],
      ['Disagreement → debate re-vote; still split → library + average + debate log'],
    ],
  },

  residents: {
    title: 'Resident layer (self-organization inside) —— roster, direction and division of labor are all settled among residents; the framework never assigns',
    sub: 'Initial brainstorm produces each one\'s own direction　·　after that they keep working until "all consider it solved" (unanimous meeting consent)　·　residents can be added / closed',
    cards: [
      ['Resident r-1', 'continuable persistent session', 'Independent context · autonomous direction', 'Writes only its own library', "Cross-reads others' libraries (read-only)"],
      ['Resident r-2', 'continuable persistent session', 'Independent context · autonomous direction', 'Writes only its own library', "Cross-reads others' libraries (read-only)"],
      ['Resident r-3', 'continuable persistent session', 'Independent context · autonomous direction', 'Writes only its own library', "Cross-reads others' libraries (read-only)"],
      ['… r-N', 'add_member / remove_member', 'residentCount defaults to 4', 'Wake-up = sendMessage', 'One round = one full thought'],
    ],
  },

  human: {
    lines: [
      'Human / assistant',
      'Root agent = the interface',
      'configure → start',
      'message / meeting',
      'add_member / remove_member',
      'pause / resume / abort',
      'set parameters (immediate)',
    ],
  },

  framework: {
    title: 'Framework vibe-v4 —— only a medium (middleware): relay · persist · count · schedule',
    sub: 'Each round: "state block + this round\'s question"; each resident returns one JSON: summary / solved / input / vote / propose_verify / propose_task / claim_task / task_done / voteSolved / formal / contextPct',
    chips: [
      ['Message bus · mailbox', 'vibe_v4_message(to|all) → into the target mailbox', 'Idle → sendMessage wake-up; residents never call each other directly', 'Everything via the framework relay (simulated inbox) · broadcast'],
      ['Meeting / debate', 'vibe_v4_meeting(agenda) → everyone speaks', 'Writes Shared/meetings/<id>.md and broadcasts the conclusion', 'Watchdog vs deadlock · queued, never preempts verification'],
      ['Task board (relay only)', 'Propose / claim written in the receipt → Shared/taskboard.md', 'Claiming wakes the claimer; the framework never decides who does what', 'Open tasks come first in the idle-resident wake-up order'],
      ['Consensus verification (unanimous)', 'Receipt field propose_verify → FIFO queue', 'Independent first vote (blind to each other) → public debate re-vote', 'Max verdictMaxRounds rounds (default 3); unanimous same-way → Verified/'],
      ['Context / compact', 'contextPct ≥ compactThreshold (default 66)', 'Triggers DSH /compact; core rules restated after compaction', 'compactAfterRounds default 8; persona and philosophy kept'],
      ['Liveness / concurrency / recovery', 'activityTimeoutMs heartbeat · maxParallel concurrency gate', 'Stall stallAutoMeetingMs (default 6 min) automatic meeting', 'resume re-seeds from residents.json + progress.md'],
    ],
    lean: [
      'Lean formal verification (adjustable parameter formalVerify = off / encourage / require) · tools vibe_v4_lean_run / _archive / _lib',
      'encourage: decide by implementation difficulty whether to formalize; require: a true/false conclusion needs "Lean passed" or an explicit blocking record, otherwise it is recorded as undecided',
      '★ Once Lean passes, the object of review changes: no longer "is the derivation right" but "are Lean\'s definitions/objects/conditions/assumptions/conclusions faithful to the original text of the proposition"',
      '★ A fidelity defect (decision=defect) ≠ the proposition is false: revoke "passed" + withdraw the archived proof + add to the "formalization TODO"; never record it as 0/false',
    ],
    advance: [
      'After subagent/end the framework advances: ① non-empty mailbox → wake non-busy recipients　② open task → wake proposer/claimer　③ pending verification → meeting　④ else heartbeat: wake longest-idle resident into a meeting',
    ],
  },

  libraries: {
    title: 'Resident-owned libraries (one directory each)',
    sub: 'Owner writes · others read-only · via fs · framework registers',
    lines: [
      'Progress/<r-id>/progress.md',
      'Ongoing progress (append-only; checkpoint resume re-seeds from it)',
      '',
      'Propos/<r-id>/<p-id>.md　proposition',
      'Methods/<r-id>/<m-id>.md　theory / method / tool',
      'Subproblems/<r-id>/<s-id>.md　subproblem',
      '',
      'Required per record: value · motivation-use plan · own probability',
    ],
  },

  shared: {
    title: 'Shared and concluded (VibeMath/Projects/<project>/)',
    sub: 'Shared/ = artifacts; Verified/ = only conclusion, read-only',
    lines: [
      'Shared/meetings/<id>.md　meeting minutes + conclusion',
      'Shared/debates/<target>.md　debate record (first vote + re-vote)',
      'Shared/taskboard.md　task board (propose / claim)',
      'Shared/meetings/brainstorm.md　initial brainstorm',
      '',
      'Verified/命题/<id>.md　(or 问题/, 方法 → trusted assertion)',
      'Problems/<id>.md　original problem statement',
      'Not unanimous → source library + average probability + debate record',
    ],
  },

  state: {
    title: 'State / isolation / recovery',
    sub: 'Framework state: registry, mailboxes, locks, process epoch',
    lines: [
      'State/residents.json　resident registry',
      'State/mailboxes.json　mailboxes (who has not read)',
      'State/taskboard.json　task board machine state',
      'State/decisions.json　key decisions on record',
      'State/session.json　activity log (human-readable)',
      'State/settings.json　parameters (set takes effect immediately)',
      'State/formal.json　Lean formalization record (non-off tiers)',
      'fileOwner write lock · projectLock · processEpoch · abort→resume',
    ],
  },

  redlines: {
    title: 'Philosophical red lines (non-negotiable)',
    sub: 'These five are the design itself, not implementation details; changing them means a different architecture',
    cards: [
      ['The framework never assigns tasks', 'Direction / division / who does what', 'only residents, by messages and meetings'],
      ['Conclusions must be unanimous', 'No forced / flat / near-consensus closing', 'strong disagreement stays in the library'],
      ['Only Verified/ is absolutely trusted', 'the rest (unverified method-library claims)', 'is empirical reference only'],
      ['Residents never call each other', 'all messages go through framework relay', '(simulated inbox: persisted before delivery)'],
      ['Self-organization survives intervention', 'messages / meetings / add-remove members', 'but "what happens next" is up to residents'],
    ],
  },

  links: {
    toolSurface: ['Tool surface', 'vibe_v4_*', '/v4 commands', '↓'],
    report: ['Report', 'status', 'report', '↑'],
    prompt: '↑ prompt each round (state block + this round\'s question)　　↓ a single JSON receipt',
    promptFields: 'say / progress / record_* / propose_verify / verdict / vote_solved / input / reject_assign / task_done',
    persist: 'Persist / record / wake',
    notUnanimous: 'Not unanimous → kept in library with probability (dashed)',
  },

  legend: {
    title: 'Legend',
    items: [
      ['human', 'Human / assistant (no research, no vote)'],
      ['house', 'Resident subagent (votes · autonomous direction)'],
      ['frame', 'Framework (relay / persist / count / schedule)'],
      ['data', 'Artifacts, state (resident lib / Shared / State)'],
      ['gate', 'Truth gate / Lean formalization (adjustable)'],
    ],
  },

  msg: {
    saved: (p, n) => 'saved ' + p + ' (' + n + ' bytes)',
    warnHeader: '\nLayout warnings (text may overflow its container):',
    warnPrefix: '  WARN ',
    ok: 'layout: no overflow warnings',
    widthOverflow: (where, w, limit, s) => `${where}: text width ${w} > available ${limit} — ${s}…`,
    cardOverflow: (x, y, n, need, h) => `card@${x},${y}: ${n} line(s) need height ${need} > container ${h}`,
  },
}

const T = LANG === 'en' ? en : zh
const OUT = join(ROOT, '示例图', T.outFile)

const W = 1720, H = 1260
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

// 几何：左侧控制通道 40..218；主内容 230..1680
const FULL_L = 40, FULL_R = 1680
const MAIN_L = 230, MAIN_R = 1680
const IN_L = MAIN_L + 22, IN_R = MAIN_R - 22      // 252 .. 1658

const warnings = []
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textWidth = (s, fs) => [...String(s)].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56), 0) * fs
const fits = (s, fs, limit, where) => {
  const w = textWidth(s, fs)
  if (w > limit) warnings.push(T.msg.widthOverflow(where, w.toFixed(0), limit.toFixed(0), String(s).slice(0, 42)))
  return w
}

const out = []
const push = (s) => out.push(s)

function band(x, y, w, h, title, sub, { fill, stroke, titleFill = C.ink } = {}) {
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
  if (total + fs > h) warnings.push(T.msg.cardOverflow(x, y, lines.length, (total + fs).toFixed(0), h))
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
push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(T.ariaLabel)}">`)
push(`<defs>
  <marker id="both" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.line}"/></marker>
  <marker id="bothHuman" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.human}"/></marker>
  <marker id="bothFrame" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.frame}"/></marker>
  <marker id="bothData" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.data}"/></marker>
  <marker id="bothHouse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.house}"/></marker>
  <marker id="bothGate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.gate}"/></marker>
</defs>`)
push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
push(`<g font-family="${FONT}">`)

// ---- 标题 ----
plain(W / 2, 40, T.title, { size: 27, fill: C.ink, anchor: 'middle', weight: 700 })
plain(W / 2, 67, T.subtitle, { size: 13, fill: C.mute, anchor: 'middle', limit: W - 80, where: 'subtitle' })

// ---- 定论门槛 ----
band(FULL_L, 84, FULL_R - FULL_L, 92, T.gate.title, T.gate.sub,
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
card(62, 140, 506, 28, T.gate.cards[0], { stroke: C.gate, fs: 11.5 })
card(588, 140, 506, 28, T.gate.cards[1], { stroke: C.gate, fs: 11.5 })
card(1114, 140, 524, 28, T.gate.cards[2], { stroke: C.gate, fs: 11.5 })

// ---- 常驻层 ----
band(MAIN_L, 188, MAIN_R - MAIN_L, 150, T.residents.title, T.residents.sub,
  { fill: C.houseBg, stroke: C.house, titleFill: '#8a5200' })
{
  const cw = (IN_R - IN_L - 3 * 18) / 4
  T.residents.cards.forEach((lines, i) => card(IN_L + i * (cw + 18), 246, cw, 88, lines, { stroke: C.house, fs: 13, sfs: 10.5 }))
}

// ---- 人 / 助手（左侧控制通道）----
card(FULL_L + 2, 188, 176, 150, T.human.lines, { stroke: C.human, fs: 12, sfs: 10 })

// ---- 框架 ----
band(MAIN_L, 400, MAIN_R - MAIN_L, 384, T.framework.title, T.framework.sub,
  { fill: C.frameBg, stroke: C.frame, titleFill: '#084d80' })
const ccw = (IN_R - IN_L - 2 * 22) / 3
T.framework.chips.forEach((c, i) => {
  card(IN_L + (i % 3) * (ccw + 22), i < 3 ? 462 : 548, ccw, 76, c, { stroke: C.frame, fs: 12.5, sfs: 10.5 })
})
card(IN_L, 636, IN_R - IN_L, 84, T.framework.lean, { stroke: C.gate, fs: 12, sfs: 10.5 })
card(IN_L, 732, IN_R - IN_L, 40, T.framework.advance, { stroke: C.frame, fs: 11 })

// ---- 数据面 ----
const dw = (MAIN_R - MAIN_L - 2 * 20) / 3
band(MAIN_L, 816, dw, 250, T.libraries.title, T.libraries.sub,
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(IN_L, 872, dw - 44, 176, T.libraries.lines, { stroke: C.data, fs: 11.5, sfs: 10.5 })

const B2 = MAIN_L + dw + 20
band(B2, 816, dw, 250, T.shared.title, T.shared.sub,
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(B2 + 22, 872, dw - 44, 176, T.shared.lines, { stroke: C.data, fs: 11.5, sfs: 10.5 })

const B3 = B2 + dw + 20
band(B3, 816, MAIN_R - B3, 250, T.state.title, T.state.sub,
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(B3 + 22, 872, MAIN_R - B3 - 44, 176, T.state.lines, { stroke: C.data, fs: 11.5, sfs: 10.5 })

// ---- 哲学红线 ----
band(MAIN_L, 1102, MAIN_R - MAIN_L, 118, T.redlines.title, T.redlines.sub,
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
{
  const rw = (IN_R - IN_L - 4 * 16) / 5
  T.redlines.cards.forEach((lines, i) => card(IN_L + i * (rw + 16), 1158, rw, 56, lines, { stroke: C.gate, fs: 11.5, sfs: 10 }))
}

// ---- 连线：人 / 助手 ↔ 框架（左侧通道，不穿过常驻）----
const CHX = 129
polyline([[CHX, 338], [CHX, 470], [MAIN_L, 470]], { color: C.human, width: 2 })
plain(CHX, 384, T.links.toolSurface[0], { fill: C.human, anchor: 'middle', size: 12, weight: 700, halo: true })
plain(CHX, 404, T.links.toolSurface[1], { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 422, T.links.toolSurface[2], { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 446, T.links.toolSurface[3], { fill: C.human, anchor: 'middle', size: 13, weight: 700, halo: true })
plain(CHX, 506, T.links.report[0], { fill: C.human, anchor: 'middle', size: 12, weight: 700, halo: true })
plain(CHX, 526, T.links.report[1], { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 544, T.links.report[2], { fill: C.human, anchor: 'middle', size: 11, halo: true })
plain(CHX, 572, T.links.report[3], { fill: C.human, anchor: 'middle', size: 13, weight: 700, halo: true })

// ---- 连线：常驻 ↔ 框架（提示词 / 回执）----
arrow(600, 338, 600, 400, { color: C.frame, marker: 'bothFrame', width: 2 })
arrow(1360, 338, 1360, 400, { color: C.frame, marker: 'bothFrame', width: 2 })
plain(980, 366, T.links.prompt, { fill: C.frame, anchor: 'middle', size: 10.5, limit: 700, where: 'prompt label', halo: true })
plain(980, 386, T.links.promptFields, { fill: C.mute, anchor: 'middle', size: 9.5, limit: 760, where: 'prompt fields', halo: true })

// ---- 连线：框架 ↔ 数据面 ----
arrow(560, 784, 560, 816, { color: C.data, marker: 'bothData', width: 2 })
plain(552, 806, T.links.persist, { fill: C.data, anchor: 'end', size: 10.5, halo: true })
arrow(1180, 784, 1180, 816, { color: C.gate, marker: 'bothGate', width: 2, dashed: true })
plain(1188, 806, T.links.notUnanimous, { fill: C.gate, anchor: 'start', size: 10.5, halo: true })

// ---- 图例 ----
plain(52, 1246, T.legend.title, { size: 12, fill: C.ink, weight: 700 })
T.legend.items.forEach(([key, txt], i) => {
  const x = 108 + i * 330
  push(`<rect x="${x}" y="1235" width="14" height="14" rx="3" fill="#ffffff" stroke="${C[key]}" stroke-width="2"/>`)
  plain(x + 21, 1247, txt, { size: 11, fill: C.ink2, limit: 305, where: 'legend' })
})

push('</g>')
push('</svg>')

mkdirSync(dirname(OUT), { recursive: true })
const svg = out.join('\n')
writeFileSync(OUT, svg, 'utf8')
console.log(T.msg.saved(OUT, svg.length))
if (warnings.length) {
  console.error(T.msg.warnHeader)
  for (const w of warnings) console.error(T.msg.warnPrefix + w)
  process.exit(1)
}
console.log(T.msg.ok)
