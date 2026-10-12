# 24 · v5r 包含（**vmu 必须能完全实现 v5r 的功能与运行机制**）

> 状态：**建立于 2026-10-11**（用户目标 ④："确保 vmu 框架可实现能力、运行机制可定义性足够强，**保证可以包含、完全实现原 vibemath-v5r 的所有功能、运行机制**（效果完全一致或更强）"）。**本文档是这一要求的度量处与计划处**：**先量、再列计划、最后才实现** ✗。

## 0. 判据与诚实口径

**要求**：v5r 的**每一项功能与运行机制**，在 vmu 里**要么被等价承载**（效果一致或更强 ✓），**要么被明确判为"不做"并给出理由与改判条件** ✗✓。**不允许含糊带过**。

**方法**（沿用仓库既有 `tests/vmu-ab-v5r.test.mjs` 的口径 ✓）：

> **不是"读两边代码说很像"** ✗，而是**把两边都真正跑起来**，在同一组输入上比较**可观测输出** ✓；**无法驱动或刻意不做的项逐个点名**（`NOT_ADOPTED` / `DIVERGENT`）✓。

★ **这条口径本身就是本项工作最有价值的部分**：**"这一项框架不做，理由是……，出现真实消费者就改判"远比"我们验证了等价"有价值** ✓。

## 1. 实测基线（**轮 303**）

| 项 | 实测 |
|---|---|
| **既有 A/B 对照台** | `tests/vmu-ab-v5r.test.mjs`（ROUND 137）✓ 已跑通 |
| **当前结论** | **`NOT_ADOPTED: 4`**（刻意不采纳，每条带理由＋改判条件 ✓）／**`DIVERGENT: 4`**（刻意分歧，已点名 ✗） |
| **已覆盖的对照面（4）** | ① 摘要逐字节相等（v5r 手写 sha256 ⇄ vmu `node:crypto`）② 头部列表契约（**"行里不得出现正文"是可伪证的** ✓）③ Lean 的 `-R` 搜索标志与超时回落 ④ 席位 id 安全规则（`idSafe` / `slugify`） |
| **一处真实分歧实例** | `leanHashText`：**名字像哈希、实际是【文本规范化】**（CRLF→LF、去尾空白）✗ ⇒ vmu 对 Lean 产物按**原始字节**取 sha256，**口径更严** ✓（若照搬 v5r 的规范化，"只改了行尾"也会判 passed ✗） |
| **v5r 运行时规模** | `vibe-math-v5r.js` **11,598 行**（单体）；导出 `inject` / `apply` / `__testHelpers` |
| **v5r 工具面** | **56 个 `vibe_v5_*` 工具**（实测列举，见 §3） |
| **v5r 会议平台规格** | **10 份 `MEETING-PLATFORM-*.md`，合计约 2,700 行**：总纲 / 模型 / 协议 / 投票 / 规格 / 裁决 / 查漏 / 决议 / 扩展 / 监督与时间 ✓ |
| **vmu 侧规模** | **103 个服务** ✓（撤除 instruments 后实测）／**125 个键族**／85 个内核面 |

⇒ ★★ **结论**：**A/B 台只覆盖 4 个对照面，而 v5r 有 56 个工具 ＋ 10 份会议规格** ✗ ⇒ **"包含"尚未被证明，只被部分抽检** ✓。**这正是本文档的工作计划。**

## 2. **被否决的证据路径**（记下来，避免重复走 ✗）

本轮曾尝试**按关键词把 56 个工具映射到 vmu 内核模块**（子串匹配）⇒ **噪声不可接受** ✗：**40 个概念里绝大多数都命中同几个大文件**（`arbitration` / `audit` / `ballot`），因为这些文件里"泛词"太多 ✓。

★ **裁定**：**子串映射不能作为"等价承载"的证据** ✗ ⇒ **唯一可接受的做法是【跑真实输入比可观测输出】** ✓。**任何"看起来对应"都必须由 A/B 断言背书** ✓。

## 3. v5r 的 56 个工具（**按家族分组**，实测列举）

| 家族 | 工具 | vmu 侧家族级载体（依据：键族/服务实测存在） | A/B 覆盖 |
|---|---|---|---|
| **会议** | `meeting` `minutes` `motion` `second` `verdict` `resolutions` `reconsider` `chair_proxy` `secretary` `procedural_objection` | `meetings`(56 键) / `meeting` / `ballot` / `ballotbox` / `motions` / `minutes` / `agenda` / `board` ✓ | ✗ 未覆盖 |
| **投票** | `poll_open` `poll_vote` `poll_close` | `ballot` / `ballotbox` ✓ | ✗ 未覆盖 |
| **任务与协作** | `task_create` `task_get` `task_list` `task_update` `assign` `prioritize` | `tasks` / `workflow`(27 键) / `delegation` / `scheduler` ✓ | ✗ 未覆盖 |
| **成员与人事** | `members` `hire` `fire` `add_researcher` `remove_researcher` `grant` `revoke` | `members` / `roles` / `recruit` / `grant` / `charter` ✓（`hr` 已判降级 ⇒ **其职能须落在 members/roles/charter 上** ✗ 待核） | ✗ 未覆盖 |
| **论文与记录** | `paper` `finalize_paper` `record_proposition` `record_method` `record_subproblem` `record_progress` `result_record` | `publication` / `records`(32 键) / `library` ✓ | ✗ 未覆盖 |
| **验证** | `propose_verify` `end_verify` `verdict` | `review` / `reviewers` / `formal` / `arbitration` ✓ | ✗ 未覆盖 |
| **Lean 与形式化** | `lean_run` `lean_archive` `lean_lib` `lean_read` `lean_job` | `lean` / `formal` / `mathtools` / `mathjobs` ✓ | **部分 ✓**（`-R` 与超时常量已对照） |
| **控制流** | `start` `stop` `pause` `resume` `set` `configure` `status` `overview` | `control`(7 键) / `bus` / `metrics` / settings 层 ✓ | ✗ 未覆盖 |
| **通信** | `say` `message` `nudge` `wait` `self_report` `feedback` | `bus` / `notify`(24 键) / `alerts` / `explain` ✓ | ✗ 未覆盖 |
| **库** | `read_library` | `library` / `records` ✓ | **部分 ✓**（头部列表契约已对照） |

## 4. GAP 与计划（**待实现** ✗）

| # | GAP | 处置 | 依赖 |
|---|---|---|---|
| **G1** | **A/B 台只覆盖 4 个面，而 v5r 有 56 个工具** | ★ **把 A/B 台按家族扩到 56 个工具**：每个工具给**同一组输入**，比较**可观测输出** ✓ | 无（纯测试扩建） |
| **G1-会议** | **会议家族 13 个工具** | ★★ **已开工（轮 304）** ✓：新对照台 **`tests/vmu-ab-v5r-meetings.test.mjs`**（**14 passed, 0 failed** ✓；判据分布 **EQUAL 1／PROPERTY 2／NOT_ADOPTED 1／DIVERGENT 1**）✓ | **已完成** ✓ |
| **G1-会议-流程** | **会议 happy path**（召集→动议→附议→表决→决议）**未逐段对照** | ★ **下一片**：v5r 会把会议**停在在途验证之后**并用自己的状态机驱动 ⇒ 需要完整流程驱动 | G1-会议 ✓ |
| **G2** | **v5r 会议平台 10 份规格 ≈2,700 行**，vmu 侧未逐条对照 | ★ **逐份规格做对照表**（模型／状态机／六种发言机制／投票全集／监督与时间），每项落 `等价 ✓` / `更强 ✓` / `不做 ✗＋理由` | G1 |
| **G3** | `procedural_objection` 等**未找到对应载体**的项 | ★ **先 A/B 实测**（可能只是命名不同）；确无 ⇒ **判"不做 ✗ ＋ 改判条件"**，按 §2 式登记 | G1 |
| **G4** | `hr` 已判降级，而 v5r 的 `hire` / `fire` 职能需有别处承载 | ★ 复核 **`members` / `roles` / `charter` / `recruit`** 能否承载，并**在 A/B 里证明** | G1 |
| **G5** | v5r 的 `set` / `configure`（**provider/model 覆盖 staff LLM 路由**）在 vmu 侧无同名能力 | ★ 对照 **settings 层 ＋ `vmu.middleware.*` ＋ pack 声明**能否表达同等的"运行机制可定义性" ✓ | G1 |

## 5. 未核项

- **56 个工具里哪些是"同一机制的不同入口"** ✗（例如 `motion` / `second` / `verdict` 可能同属一条动议流水线）⇒ 分组须在 **G1 中由真实驱动确认**，不靠名字 ✗。
- **十份 `MEETING-PLATFORM-*` 之间的权威顺序** ✗（`SPEC` 是初稿、`RULINGS` 是定稿、`DECISIONS` 是裁决）⇒ 对照**以定稿为准** ✓，**冲突处须记明** ✗。
- **"效果更强"的判据** ✗：目前只有 `leanHashText` 一例（**vmu 更严** ✓）⇒ 需一套**可比口径**（至少：同一输入 ⇒ 同一可观测输出；且 **vmu 不得更松** ✓）。
