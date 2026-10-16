# Phase 1c-B · 运行时 parity（**协作与状态层**）—— `task-214`

> ★ **作者**：`vmu-accept`（独立第三方视角）。★ **唯一写入文件**：本文件。★ **只读**：**不改代码／不跑 T1／不跑全量门禁／不跑 git**；scratch `D:\_tmp`；**不碰 `token.txt`**。
> ★ **范围（只这五项）**：**(1)** 会议与投票／**(2)** 代理自组织／**(3)** 代理间通信／**(4)** 状态·归档·记忆（★ 只看**可观测行为**，不做存储设计评审）／**(5)** 本层失败语义（★ **具名**失败，不许静默）。
> ★ **不在本任务**：回合循环、钩子/bus、中间件四形态、控制流。
> ★★ **本文状态＝【部分完成，如实标注】**：★ **先建表头立刻存盘、再补**（任务点名要求）；★ **本轮交付的是【结构层事实 ＋ 一条把前提推翻的发现】**，★ **行为级 parity 对照【未做】**（见 §5）。

## 0. 口径与"读过 vs 推测"

| 项 | 值 |
|---|---|
| 新树（被核对象） | `vibe-math-vmu/`（`kernel/**` ＋ `packs/v5r/**`） |
| 原树（对照基线） | `vibe-math-v5r/` |
| 读法 | ★ **只读源码/文档文件名与行数 ＋ 定点 grep**；★ **"读过"＝我看到 file:line**；★ **"推测"＝按命名/结构推断**（分栏标注） |
| 证据 | ★ 每条带 **file（+ 行数）或 grep 读数** |

## 1. ★★★ 先把前提钉住：**这个 shard 的"原位置"不是运行时代码**

★★ **我实读（`Get-ChildItem vibe-math-v5r -Recurse -Include *.js,*.mjs`）**：★ **`vibe-math-v5r/` 下【全部】JS 只有三个文件**：

| 文件 | 行数 | ★ 性质 |
|---|---|---|
| `vibe-math-v5r/vibe-math-v5r.js` | **11,597 L** | ★ **单文件整体实现（monolith）** |
| `vibe-math-v5r/math-computation.js` | 1,481 L | ★ 数学计算 |
| `vibe-math-v5r/math-engines.js` | 197 L | ★ 数学引擎 |

★★ **而"协作与状态层"在原树里是【文档】形态**（★ 13 份 spec）：

| spec（`vibe-math-v5r/`） | 行数 | spec | 行数 |
|---|---|---|---|
| `MEETING-PLATFORM-SPEC.md` | **375 L** | `MEETING-PLATFORM-A-model.md` | 330 L |
| `MEETING-PLATFORM-PHILOSOPHY.md` | 304 L | `MEETING-PLATFORM-B-protocol.md` | 304 L |
| `MEETING-PLATFORM-EXPANSION.md` | 252 L | `MEETING-PLATFORM-GAPS.md` | 230 L |
| `MEETING-PLATFORM-VOTING.md` | 220 L | `MEETING-PLATFORM-OVERSIGHT-TIME.md` | 205 L |
| `MEETING-PLATFORM-RULINGS.md` | 178 L | `MEETING-PLATFORM-DECISIONS.md` | 164 L |
| `MEETING-PLATFORM-C-landing.md` | 165 L | `架构图.md` | 693 L |
| `设计总览.md` | 56 L | | |

★★★ **关键词两侧命中数（我实跑的 grep 计数）**：

| 机制词 | 在 `v5r` **文档**里 | 在 `v5r` **代码**里 | ★ 读法 |
|---|---|---|---|
| `quorum` | **82** | **0** | ★ 法定人数**只在 spec 里** |
| `motion` | 31 | **0** | 同上 |
| `roster` | 31 | **0** | 同上 |
| `tally` | 17 | **0** | 同上 |
| `abstain` | 17 | **0** | 同上 |
| `charter` | 7 | **0** | 同上 |
| `mailbox` | 4 | **0** | 同上 |
| `delegat` | 1 | **1** | ★ 两侧各 1（★ 需人工看是否同义） |
| `lapse` | **1** | **0** | ★ spec 里也几乎没写 |
| `panel` | **0** | **0** | ★ **原树里【完全没有】"panel"这个词** |

⇒ ★★ **结论（本轮最重要的一条）**：★ **"vmu＋v5r pack 是否重现了原 `vibe-math-v5r` 的协作/状态层"这个问题，在本 shard 上【不能按"代码 ↔ 代码"问】—— 原来的那一层是【spec（13 份文档）＋ 一个 11,597 行 monolith】，而 monolith 里【没有这些词】**。★ 因此正确的 parity 问题应当是：★ **(a)** `vmu` 的模块是否实现**那 13 份 spec 所写的行为**；★ **(b)** monolith 内是否以**别的名字**实现了同一批语义（★ **未核**，见 §5）。

## 2. 能力表（★ 新树侧：我实读的模块清单，按五项分类）

> ★ **"原位置"列**：★ 写成 **spec 文档名**（★ 因为 §1 已证原树那一层是文档）—— ★ **这不是回避，是读数**。

| # | 机制 | 原位置（spec；★ 见 §1） | 新位置（`vibe-math-vmu/kernel/`，★ 我实读行数） | 在不在 | 行为同不同 | 判定 |
|---|---|---|---|---|---|---|
| 1.1 | 会议主体 | `MEETING-PLATFORM-SPEC.md` | `meeting.js` **612L** ＋ `meetings.js` **1195L** | ✅ 在 | ★ **未比** | **结构在／行为未核** |
| 1.2 | 会议域常量 | （spec 未单列） | `meetingdomain.js` **71L** | ✅ | ★ 未比 | ★ 新树**新增**（spec 无对应） |
| 1.3 | 表决 | `MEETING-PLATFORM-VOTING.md` | `ballot.js` **630L** ＋ `ballotbox.js` **570L** | ✅ | ★ **未比** | 结构在／行为未核 |
| 1.4 | 动议 | `MEETING-PLATFORM-B-protocol.md` | （★ 我**未找到**独立 `motion*.js`） | ❓ | ★ 未比 | ★ **待定位**（可能在 `meetings.js` 内） |
| 1.5 | 纪要 | `MEETING-PLATFORM-C-landing.md` | `minutes.js` **433L** | ✅ | ★ 未比 | 结构在 |
| 1.6 | 失效（lapse） | ★ spec 里仅 **1** 处提到 | `meetinglapse.js` **223L** | ✅ | ★ **原方几乎无 spec** | ★ **新树超出原 spec** |
| 1.7 | 离席 | ★ spec 命中 0 | `meetingleave.js` **95L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 1.8 | 标记（marker） | ★ spec 命中 0 | `meetingmarker.js` **515L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 2.1 | 招募 | ★ spec 命中 0（`recruit`） | `recruit.js` **337L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 2.2 | 委派 | spec 仅 1 处 | `delegation.js` **546L** | ✅ | ★ 未比 | 结构在 |
| 2.3 | 名册/成员 | `MEETING-PLATFORM-A-model.md`（roster 31 处） | `members.js` **315L** | ✅ | ★ 未比 | 结构在 |
| 2.4 | 章程 | spec 7 处 | `charter.js` **597L** | ✅ | ★ 未比 | 结构在 |
| 2.5 | 任期 | ★ spec 未命中（`tenure`） | `tenure.js` **267L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 2.6 | 容量 | ★ spec 未命中 | `capacity.js` **455L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 3.1 | 信箱 | spec 4 处 | `mailbox.js` **602L** | ✅ | ★ 未比 | 结构在 |
| 3.2 | 群聊/频道 | ★ spec 未命中 | `chat.js` **751L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 3.3 | 通知 | ★ spec 未命中 | `notify.js` **300L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 3.4 | 面板 | ★★ **spec 命中 0（连词都没有）** | `panel.js` **427L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 4.1 | 状态/健值 | `架构图.md`／`设计总览.md` | `store.js` **316L**／`storepolicy.js` **283L**／`stateversion.js` **236L** | ✅ | ★ 未比 | 结构在 |
| 4.2 | 归档 | — | ★ **未找到 `archive*.js`**（★ 可能在 `custody.js` 内） | ❓ | ★ 未比 | ★ **待定位** |
| 4.3 | 记忆 | — | `memory.js` **496L** | ✅ | ★ 未比 | ★ **新树新增** |
| 4.4 | 恢复 | `设计总览.md`（resume） | `resume.js` **1194L**／`resumeflush.js` **151L** | ✅ | ★ 未比 | 结构在 |
| 4.5 | 保管 | — | `custody.js` **203L** | ✅ | ★ 无对照 | ★ **新树新增** |
| 5 | 本层失败语义 | `MEETING-PLATFORM-GAPS.md`（230L，★ 名字就是"缺口"） | ★ **未逐条核**（★ 见 §5） | ❓ | ★ 未比 | ★ **未核** |

## 3. 排序缺陷（★ 带"能显示差异的输入"）

**D1（最高，且它不是"实现得不好"而是"基线不存在"）**：★★ **本 shard 的 parity 基线【不是运行时代码】** —— 原树 JS 只有 3 个文件（`vibe-math-v5r.js` 11,597L／`math-computation.js` 1,481L／`math-engines.js` 197L），★ 而 `quorum`／`motion`／`tally`／`abstain`／`roster`／`charter`／`mailbox` 在**原树代码里命中 0**、只在 13 份 `MEETING-PLATFORM-*.md` 里密集出现（82／31／17／17／31／7／4）⇒ ★★ **"在不在／同不同"两列对这些问题【没有可执行对照物】**。
★ **能显示差异的输入**：★ 若把 parity 定义成"跑原实现与新实现、比同一输入的输出"，★ 则本 shard **连输入都构造不出来**（原实现没有可调用的会议/表决入口）⇒ ★ **必须先决定：以 spec 为基线，还是去 monolith 里找同义实现**。

**D2**：★★ **命名不可对齐（parity-by-name 不可用）**：★ 新树用 `vmu.ballot.*`（`quorumRule` 22 命中／`abstainCountsForFloor` 7／`runoffTopN` 12），★ 而原树代码里这些名字**命中 0** ⇒ ★ **即使 monolith 内实现了同义语义，也无法按名字对上** ⇒ ★ **需要一张【spec 词 → vmu 模块/键】映射表**（★ 我没有造，见 §4 改进 1）。
★ **能显示差异的输入**：★ 任取一个 spec 句（如 `MEETING-PLATFORM-VOTING.md` 的弃权规则），★ **在 monolith 里 grep 不到对应标识符** ⇒ ★ **无法判定"同不同"**。

**D3**：★ **新树存在原 spec 里没有词的机制**（★ `panel` 在原树**文档与代码里各 0 命中**，而新树有 `panel.js` 427L；同类的还有 `meetingleave`／`meetingmarker`／`recruit`／`tenure`／`capacity`／`chat`／`notify`／`memory`／`custody`）⇒ ★ **这些不是"parity 差异"，是【新树新增】**；★ 但它们让"parity 覆盖率"这种指标**失去意义**（★ 分母里混进了原树没有的东西）。

**D4（★ 待定位，不是缺陷）**：★ **`motion` 与 `archive` 我未在新树里找到同名模块**（★ 可能在 `meetings.js`／`custody.js` 内，★ **未核**）。

## 4. 改进（★ 按优先级）

1. ★★ **先建映射表再谈 parity**：★ **13 份 `MEETING-PLATFORM-*.md` → `vibe-math-vmu/kernel/*.js` ＋ `vmu.*` 键**（★ 一行一条：spec 句 → 实现位点），★ **否则本 shard 的 parity 无法判定**。
2. ★ **把基线定义写死**：★ **spec 基线**（推荐：因为原树那一层就是 spec）**还是 monolith 基线**（需要先在 11,597 行里定位同义实现）。★ **两者产出的"parity"含义不同**，★ 不许混用。
3. ★ **把"新树新增"单独开一列**：★ 让 parity 覆盖率**只对"spec 里有的机制"分母**，★ 否则新增项会稀释/扭曲结论。
4. ★ **失败语义按 spec 的 `MEETING-PLATFORM-GAPS.md`（230L）逐条对**：★ 那份文档**名字就是"缺口"**，★ 它很可能是本层失败语义的**原始清单**。

## 5. 没核（★ 与"核了"分开）

1. ★★ **行为级 parity 一条都没做**：★ 我**没有**跑任何"同一输入 → 两侧输出"的对照（★ 因为 §1 的基线问题，★ 也**没有**读那 11,597 行 monolith 去找同义实现）。
2. ★ **没有读 monolith 内部**：★ "原树代码里命中 0"是**关键词 grep 的结论**，★ **不等于**"原树没有该语义"（★ 可能用了别的词）⇒ ★ 这一条**必须**在下一轮用"人工读 spec＋定点读 monolith"来消解。
3. ★ **`motion` 与 `archive` 在新树里的位置未定位**（★ 我**猜**在 `meetings.js`／`custody.js`，★ **未核**）。
4. ★ **没有逐条核本层失败语义是否【具名】**（★ `meetings.js` 1195L／`ballotbox.js` 570L 里的 `refuse(`／错误码表**都未读**）。
5. ★ **没有核 pack `packs/v5r/**` 是否覆盖了这些机制的策略值**（★ 属 1c-A 的键普查，★ 不在本 shard）。
6. ★ **没有跑门禁/测试**；★ **本文件之外零写入**。
