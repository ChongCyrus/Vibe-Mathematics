# dsh-vibe-math 2.3.9 — v4 架构图重绘为 SVG（零依赖生成器 + README 展示）

> 上一版：2.3.8。本版把 v4 的架构图从"matplotlib 生成的位图"换成**零依赖 Node 生成的 SVG**，
> 与 v5 同一套版式语言，并把它纳入随包发布（README 里的图在 GitHub 与 npm 上都能正常显示）。
> 无代码行为变更，四套预设字节未变。

---

## 1. 为什么换

| | 旧（`框架图-v4.png` + `generate_framework_diagram_v4.py`） | 新（`框架图-v4.svg` + `generate_framework_diagram_v4.mjs`） |
|---|---|---|
| 生成方式 | Python + matplotlib | **纯 Node，零依赖**（本仓库运行时自带 Node） |
| 产物 | 位图，缩放糊、无法 diff | 纯文本 SVG，任意缩放、可评审、diff 友好 |
| 信息量 | 5 个方框 + 若干小字 | 分带：定论门槛 / 常驻层 / 框架六面 / 数据面 / 哲学红线 + 图例 |
| 版式校验 | 无（只能靠眼睛） | 生成时**估算文字宽度**，任何一行溢出容器即 WARN + 退出码 1 |
| 随包发布 | 否（npm 上 README 图裂） | **是**（`files` 收录，GitHub 与 npm 均可显示） |

旧文件已删除（需要时可从 git 历史取）；`README.md` 的图源链接与说明同步更新，
`docs/generate_framework_diagram_v5.mjs` 头部注释里的"v2/v3/v4 用 matplotlib"也改成"v2/v3"。

## 2. 新图覆盖的内容（全部与实现逐项核对过）

- **定论门槛**：全体一致为真（全 1）/ 一致为假（全 0）→ 写入 `Verified/`；
  **没有** forced / flat / 近共识收口；分歧 → 公开辩论重评；仍未全票 → 留库 + 平均概率 + 辩论录。
- **常驻层**：`continuable` 持久会话、独立上下文、自主方向、只写自己的库 / 跨读他人库（只读）、
  唤醒 = `subagents.sendMessage`、一轮 = 一次完整思考；起始 brainstorm 产出各自方向；全票"已解决"才停。
- **框架六面**（逐条对齐代码/规格）：
  - 消息总线·邮件箱：`vibe_v4_message(to|all)` → 入目标邮箱 → 空闲则唤醒；常驻之间不直接互调；
  - 会议 / 辩论：`vibe_v4_meeting(agenda)` → 全体发言 → `Shared/meetings/<id>.md` → 广播结论；
    看门狗防死锁；与验证**互斥**（排队，不抢占）；
  - 任务板（只搬运）：提议/认领写在回执里 → `Shared/taskboard.md`；框架不决定谁做什么；
  - 共识验证（全票）：回执字段 `propose_verify` → FIFO 排队 → 独立初评（互不可见）→ 公开辩论重评
    （最多 `verdictMaxRounds` 轮，默认 3）；
  - 上下文 / compact：`contextPct ≥ compactThreshold`（默认 66）触发 DSH `/compact`，
    `compactAfterRounds` 默认 8，压缩后重申核心规则；
  - 活性 / 并发 / 恢复：`activityTimeoutMs` 心跳、`maxParallel` 并发闸、停滞 `stallAutoMeetingMs`
    （默认 6 min）自动开会、`resume` 用 `residents.json` + `progress.md` 重种化。
- **回执字段**（**按代码里真正的解析字段列**，不是照抄记忆）：
  `summary / solved / input / vote / propose_verify / propose_task / claim_task / task_done / voteSolved / formal / contextPct`。
  （核对时发现我第一版图里写了 `reject_assign` 与 `vote_solved` —— 前者是 **v5** 的字段、后者是拼错的
  驼峰名，v4 实际是 `voteSolved`；已改正。）
- **数据面**（真实路径核对过）：
  `Progress/<r-id>/progress.md`、`Propos/<r-id>/<p-id>.md`、`Methods/<r-id>/<m-id>.md`、
  `Subproblems/<r-id>/<s-id>.md`（每条记录必填 价值程度 / 动机用途计划 / 自身概率估计）；
  `Shared/meetings|debates`、`Shared/taskboard.md`、`Shared/meetings/brainstorm.md`、
  `Verified/命题|问题/<id>.md`、`Problems/<id>.md`；
  `State/residents.json`、`mailboxes.json`、`taskboard.json`、`decisions.json`、`session.json`、
  `settings.json`、`formal.json`；`fileOwner` 写锁 / `projectLock` / `processEpoch` / `abort → resume`。
- **哲学红线**：框架绝不指派 / 定论必须全体一致 / 只有 `Verified/` 绝对可信 / 常驻不直接互调 /
  人工干预不改变自组织。

## 3. 验收

| 项 | 结果 |
|---|---|
| 生成器 | `node docs/generate_framework_diagram_v4.mjs` → `示例图/框架图-v4.svg`（23501 字节），**0 条溢出告警** |
| 渲染校验 | 无头 Chrome 截图 1760×1300 逐带人工核对（无重叠、无截断；左侧控制通道不穿过常驻） |
| 全量并行回归 | 23/23 |
| 静态守卫 | invariants 157/0（self-probe 5/5）、traceability 94/0、v5-integrity clean、persona-surface 197/0 |
| closing verification | 18/18（含"包内所有声明文件存在"） |
| 发布产物自证 | registry 取回 tarball 比对 sha1 + 包内跑随包套件（见发布记录） |

## 4. 升级

```
npm i dsh-vibe-math@latest
```

无迁移。README 里的 v4 图现在读 `示例图/框架图-v4.svg`。
