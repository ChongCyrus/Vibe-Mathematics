# PHASE 7 — 创始人质询后的覆盖与改进（目标 1–7）

> ★ **本卷的由来**：★ 目标 1–4 结项后，★ 创始人提出 **五个质询**（★ 见下）。★ **核实结果推翻了此前的两条结论**，★ 因此本轮不是"再检查一遍"，★ 而是**按质询重建事实基线** ✓
> ★ **本卷逐轮追加**，★ 并**持续记录**（★ 创始人要求）✓

---

## §0 ★★★ 五条质询（★ 原文要点）与**已核实的回答**

| ★ # | ★ 质询 | ★ 核实结论 |
|---|---|---|
| ★ 1 | ★ 为什么不覆盖"成员在回合内使用工具"？★ 这里的工具指什么？★ Lean／vmu 的工具或命令（★ 数学计算、通信、协作、会议）★ 都覆盖了吗？ | ★★ **真实原因比"夹具为避超时禁止"严重得多**：★ **`packs/v5r` 没有 `tools.js` ⇒ 声明 0 个工具**；★ 而 **v5r 提示词仍在教成员调用 `vibe_v5_record_*`**（★ 那些工具不存在）⇒ ★ **成员【没有工具可调】**。★ "工具"原指**宿主工具**（★ `read`/`grep`/`web_search`/`pwsh`）。★ **Lean／数学计算／会议**：★ **成员侧全部未覆盖**（★ Lean 只在 mock 层验证过） |
| ★ 2 | ★ 为什么目标 4 改了那么多次内核？★ 是有很多之前没检查出的缺陷吗？ | ★★ **是**。★ 静态审计 ＋ 本地夹具对**三类**系统性失明：★ (a) **接缝真实形状**（★ 夹具与错误代码同形状）★ (b) **时序与时长**（★ `await` 本地瞬时）★ (c) **无断言的运行时接线**。★ 目标 3 的 "P0＝0" 出自**三问启发式扫描**，★ **漏掉了"卡片不落盘"**（★ 那是结题硬阻断） |
| ★ 3 | ★ 当前 v5r 是否按成员/场景装卸工具（★ 借助 DSH 那个装卸接口，★ 装卸时有增减提示）？ | ★★ **没有**。★ vmu 只有**全局** `vmu.tools.enabled`/`faces` ＋ pack 声明工具；★ **per-child `toolFilter` 已在 `childFieldsOf` 透传但【无任何消费者】**；★ **grep 不到任何"工具增减"通知** |
| ★ 4 | ★ "v5r 没有 paper 面"是什么意思？★ v5r 不是有"合作写论文→审核→打磨→表决定稿→tex/pdf（★ latex 编译）"吗？ | ★★★ **创始人正确，我错了**。★ 原始 `vibe-math-v5r.js`（**11275 行**）有**完整论文子系统**：★ `paperWritePrompt`/`paperReviewPrompt`/`paperAdvance`/`paperPass`/`paperStep`/`paperRecordPart`/`paperRecordReview`/`paperRecordFinal`/`paperCompilePdf`/`paperLatexCommand`/`PaperMd`/`PaperTex`/`PaperArtifacts`/`paperSections`，★ 含 **xelatex 中文优先引擎探测** ＋ **"指纹不一致即具名阻塞"**。⇒ ★ **我们的 `packs/v5r` 整块【未移植】⇒ 是遗漏，★ 不是 pack 差异** |
| ★ 5 | ★ "每轮末尾返回 JSON 再由内核代执行"不好；★ 应改为**提供工具让成员自己调用**（★ 借鉴 DSH 与 agent teams）；★ 当前 JSON 字段里哪些已有对应工具、★ 成员能发现吗？ | ★★ **创始人正确，★ 且这是【倒退】**：★ 原始 v5r 本就是 **57 个 `vibe_v5_*` 工具驱动**，★ 不是 JSON 驱动。★ 我们**只搬了提示词、丢了工具**，★ 又加 JSON 回执去补 ⇒ ★ 造成"要等整轮结束才生效"＋"字段错即作废整轮"（★ 实测 `VMU_TURN_UNKNOWN_FIELD` 打断 **3 次**）。★ **字段映射**：★ `say`→有工具（★ `meeting.speak`）／★ `progress`→有工具（★ `records.put`）／★ `solved`→有工具（★ `decide`/`verdict`）／★ `vote_solved`→**无工具** ⇒ ★ **4 个里 3 个本就有工具，★ 问题是 v5r 没声明、★ 成员发现不了** |

---

## §1 ★ 七个总目标（★ 本轮）

| ★ # | ★ 目标 | ★ 状态 |
|---|---|---|
| ★ 1 | ★ **覆盖矩阵**（★ 分清甲/乙/丙三种情形，★ 不把"没测"写成"没问题"） | ★ 🟡 进行中 |
| ★ 2 | ★ **v5r 完整移植**（★ 57 工具 ＋ 论文子系统 ＋ Lean 五工具） | ★ ⬜ |
| ★ 3 | ★ **工具化改造**（★ JSON 回执 → 工具驱动；★ 只保留 `vote_solved` 这类无工具的纯决定） | ★ ⬜ |
| ★ 4 | ★ **按成员/场景装卸工具**（★ 接 DSH 接口 ＋ 增减提示 ＋ 状态块列出可用工具） | ★ 🟡 调查中 |
| ★ 5 | ★ **补审查静态审计的盲区**（★ 形状／时序／无断言接线） | ★ ⬜ |
| ★ 6 | ★ **文档纠错**（★ "v5r 无 paper 面"已改为"未移植"） | ★ ✅ 本轮完成第一处 |
| ★ 7 | ★ **收尾验证**（★ T1 全绿 ＋ 真机重跑两包到 `cast:true`） | ★ ⬜ |

---

## §2 ★ 本轮（★ 轮 1）已完成

### ★ ① 文档纠错（★ 目标 6，★ 已提交前先改）
★ `docs/acceptance/phase6-slv-closure.md` 的两处：
- ★ 偏差 3：★ 从"v5r 无 paper 面是**正确的 pack 差异**" ⇒ ★ 改为 **"原文有完整论文子系统、★ 我们【未移植】⇒ 是遗漏"** ＋ ★ **列出 15 个函数名** ✓
- ★ 未覆盖清单：★ 从"paper 面**不存在**" ⇒ ★ 改为 **"存在但未移植 ⇒ 是覆盖不足"** ✓
- ★ 偏差 1：★ 补上真实原因 —— ★ **不是"我们选择不测"，★ 是"成员当时没有工具可调"**（★ 无 `tools.js` ＋ 提示词引用不存在的工具）✓

### ★ ② 已核实的硬事实（★ 写入本卷 §0，★ 逐条可复核）
★ `packs/v5r` 无 `tools.js`（0 工具）／★ 原文 57 工具／★ vmu 47 面／★ v3 声明 10 工具／★ 内核允许 4 个顶层回执字段／★ per-child `toolFilter` 无消费者／★ 无工具增减通知 ✓

### ★ ③ 已派两路（★ 互不冲突）
★ **覆盖矩阵 ＋ 57→47 映射 ＋ 论文 13 函数拆解 ＋ 回执字段改造清单**（★ 只读，★ 产出 `phase7-coverage-matrix.md`）✓
★ **DSH 工具装卸接口与增减提示的确切形状**（★ 只读，★ 可用 `cordis_inspect_*`）✓

---

## §3 ★ 后续计划（★ 里程碑）

| ★ 里程碑 | ★ 内容 | ★ 依赖 |
|---|---|---|
| ★ **M1** | ★ 覆盖矩阵成文 ＋ 57→47 映射成表 ＋ 回执字段清单 | ★ 本轮两路 |
| ★ **M2** | ★ **v5r 工具面第一批**（★ `record_*` 4 个 ＋ `say`/`message` ＋ `task_*`） | ★ M1 |
| ★ **M3** | ★ **v5r 论文子系统**（★ 13 函数 ＋ LaTeX 引擎探测；★ **编译属"特殊脚本"，★ 位置按哲学定**） | ★ M1 ＋ ★ DSH 调查 |
| ★ **M4** | ★ **工具化改造**（★ v5r 先行，★ 再 v3；★ 关掉 JSON 代执行前确认无其它消费者） | ★ M2 |
| ★ **M5** | ★ **按成员/场景装卸 ＋ 增减提示 ＋ 状态块列出工具** | ★ DSH 调查 |
| ★ **M6** | ★ **盲区补审**（★ 形状／时序／无断言接线；★ 每类给一条可红的断言） | ★ 并行 |
| ★ **M7** | ★ T1 全绿 ＋ 真机两包 `cast:true` ＋ 文档同步 | ★ 全部 |

---

## §4 ★ 轮 1 的第二个硬发现：★ **DSH 0.2.1 已移除 per-child `toolFilter`/`persona`** ⇒ ★ **我目标 1(b) 的工作是死代码**

★★ **【这条推翻了 PHASE 6 目标 1(b) 的成果】**，★ 必须记下来 ✓

| ★ DSH 事实（★ 从 0.2.1 类型声明与源码核出） | ★ 后果 |
|---|---|
| ★★ `SubagentStartRequest` 只剩 `cwd`／`agentPreset`／`label`／`prompt`／`parent`／`signal`／`agentOptions`／`outputSchema`／**`maxDepth`** | ★★ **`toolFilter` 与 `persona` 已不存在**；★ `depthLimit` 应叫 `maxDepth` |
| ★ 官方替代：★ **"做一个 Agent Preset，创建时用 `agentPreset` 选它"**（★ `dsh-tool-subagent` 的拒词逐字） | ★ **"给子代理不同工具面"的官方形态是【预设】，★ 不是传字段** |
| ★ 宿主只读 `spec.request`（★ 不是 spec 顶层） | ★★ **我把它合到了 `startActivation` 的 spec【顶层】** ⇒ ★ **静默被忽略** |
| ★ `deliver({turn,text})` 与 `deliverer({turn,text})` 都**不传 `child`** | ★ **这条透传路径【无人喂】** |

★★★ **所以 PHASE 6 的 `childFieldsOf`（★ `kernel/turn/index.js`）是一段【看起来有能力、★ 实际无效】的代码** —— ★ **正是本仓红线 4 与"未接线"的那一族**，★ 而它是我自己写的 ✓
★ **处理**：★ 列入 PHASE 7 目标 4/5，★ **要么改成 `agentPreset` 路线，★ 要么删掉并如实说明"0.2.1 不支持 per-child 字段透传"** ✓

### ★★ 而 DSH 侧的好消息（★ 目标 4 的实现路径已明确）
| ★ 能力 | ★ 确切形状 |
|---|---|
| ★ **动态装卸** | ★★ `ctx.tools.register(def): () => void` ＋ ★ `ctx.tools.restrict({allow, deny}): () => void` —— ★ **作用域是"调用它的那个 agent"**，★ 返回**精确的撤销 disposer** ✓ |
| ★ **变更事件** | ★ `tools/change`（★ 未过滤的注册表通知）✓ |
| ★★ **"增减提示"是宿主【自动】的** | ★ `dsh-agent-loop` 对比**上一次 request header 的工具表**与本次，★ 差异写成一条 `developer/message`，★ 含 `tool-addition`／`tool-removal` 内容块 ⇒ ★ UI 显示"已添加工具：X／已移除工具：X" ✓ |
| ★★ **所以 vmu 不需要自造提示** | ★ **它只要【真的改】那个 agent 的工具面**，★ 提示与 UI 自动出现 ✓ |

★★ **而 vmu 的真缺口（★ 精确）**：
1. ★★ **适配器"只加不减"**：★ `doInstall` 只 `registered.push`，★ **注销只在整体卸载时批量做** ⇒ ★ **没有"按名字 retract"** ✓
2. ★★ **pack 卸载【不会真的卸掉工具】**：★ `retractPackTools` 只删内核记账，★ **不通知宿主** ⇒ ★ **卸载后工具仍在 DSH 工具表** ✓
3. ★ **策略全差**：★ 没有任何 pack 计算"这个成员该有哪些工具" ✓
4. ★ **有一个坑**：★ **DeepSeek 默认 `toolUpdate: "addition-only"`** ⇒ ★ **模型【收不到 "已移除" 那条】**（★ UI 仍显示）⇒ ★ 若要模型一定知道被移除，★ **需 vmu 自己注入一条 developer 文本** ✓

---

## §5 ★ 轮 1 的第三项：★ 覆盖矩阵成文（★ `phase7-coverage-matrix.md`，171 行）

★★ **核心派生值**：
| ★ 项 | ★ 值 |
|---|---|
| ★ vmu 工具面模块 | ★ **48**（★ 创始人说 47，★ **差 1，★ 文档保留差异不抹平**） |
| ★ `host.js` `TOOL_NAMES` 条目 | ★ 54 |
| ★ v3 声明 ／ ★ v5r 声明 | ★ **10 ／ 0** |
| ★ 原始 v5r 的 `vibe_v5_*` | ★ **57** |

★★ **三种情形（★ 创始人问的核心）**：
| ★ 包 | ★ （甲）内核有面、★ pack 没声明 | ★ （乙）声明了、★ 成员发现不了 | ★ （丙）成员根本没有 |
|---|---|---|---|
| ★ **v3** | ★ **48** | ★ **10** | ★ **0** |
| ★ **v5r** | ★ **48** | ★ **0** | ★★ **17** |

★★★ **最刺眼的一条**：★ **v5r 提示词在教成员调用 17 个 `vibe_v5_*` 工具，★ 而 v5r 声明了 0 个** —— ★ **其中 `vibe_v5_tool_help` 连原始 57 个里都没有** ✓

★★ **57 → vmu 映射**：★ **直接映射 26** ／ ★ **需写新 handler 29** ／ ★★ **无对应 2（★ `paper`、★ `finalize_paper`）** ⇒ ★ **只有这 2 个需要新内核能力** ✓
★★ **论文 13 函数**：★ **11 个可在 pack 内实现**（★ 提示词 3／★ 状态机 3／★ records 写入 3／★ 产物章节 2）★ **`paperCompilePdf` 必须动内核或特殊脚本**（★ LaTeX 子进程 ＋ 引擎探测）；★ `paperLatexCommand` 是设置项 ✓
★★ **回执 4 字段**：★ **建议【保留】代执行**（★ 消费者明确：★ 提示词契约／★ `turn/reply-parsed`／★ 闭题与验证结算／★ 测试）⇒ ★ **两条路不冗余：★ 代执行是"只输出回执"的适配层，★ 显式工具是"主动调用"的审计层，★ 二者共享同一 service/audit** ✓
﻿---

## §6 ★ 轮 2–22 的完整记录（★ 每轮：★ 做了什么、★ 抓到什么）

★★ **这一节不是流水账，★ 而是"我们被什么纠正了"** ⇒ ★ **每一条都带一个具体缺陷** ✓

### 轮 2 — 首轮真实交付 ＋ ★ 我自己的死代码被删
| ★ 做了什么 | ★ 被什么纠正 |
|---|---|
| ★ 装卸接口补 **按名字 retract** ＋ **pack 卸载真的卸载** | ★ 此前**只有装、没有卸** |
| ★ 删掉 childFieldsOf（★ **我 PHASE 6 写的**） | ★★ **DSH 0.2.1 已移除 per-child toolFilter/persona，★ 且字段放错层（spec 顶层 vs spec.request）、★ 且无人喂 child** ⇒ ★ **看起来有能力、★ 实际无效** |
| ★ v5r 首次声明 **6 个工具** | ★ 此前 **v5r 声明 0 个工具**、★ 而提示词在教 17 个不存在的名字 |

### 轮 3 — ★★★ **按成员装卸工具**（★ 目标 4 的主体）
★ applyMemberToolFace({member, allow, deny}) ＋ ★ **正断言比【真实差集】而不是比回执** ✓
★ 状态块里的"本轮可用工具"**从 schemas() 读**，★ 不是从声明抄 ✓

### 轮 4 — ★★ **盲区审计 ＋ 首道新门禁**
★ tests/audit-observer-consumers.mjs：★ **每个 set*Observer 必须有一个测试按名字提到它并断言**
★★ **它立刻抓到两个**：★ setToolExecObserver／setPackToolRetractObserver **此前从未被断言过** ✓

### 轮 5–6 — ★★★ **一个时钟被当成一把尺子**
★★ 审计卷第一条：★ planner 用 **tick 数**判"回合是否超时" ⇒ ★ **5 tick = 10 秒 去判一个 100 秒的回合** ✓
★ 修法：★ **lastDispatched.at ＋ pendingMs 对 vmu.turn.deliveryTimeoutMs**（★ **复用已有键、★ 未新造**）✓
★★ **反断言是关键**：★ **同一时间戳跑 10 个 tick ⇒ pendingMs===0、★ ageTicks===undefined、★ 不自禁用** ⇒ ★ **旧代码在这个用例上必红** ✓
★ 并补三个**具名内核缺口**：★ per-box 票箱规则／★ motion second+withdraw／★ meeting secretary ✓

### 轮 7–9 — ★★★ **论文子系统**（★ 14 个函数）＋ ★ LaTeX 判定
★ **状态机**：★ writing → reviewing → awaiting-editor → finalized，★ **指纹不一致 ⇒ 回 writing ＋ round+1（上限 3）** ✓
★★ **指纹用【内核的】**（★ records.put 返回的那个），★ **测试模拟"背后改文"⇒ 具名 FINGERPRINT_MISMATCH** ✓
★★★ **LaTeX 判定**：★ **grep 证据 ⇒ 内核【没有】LaTeX 执行器**（★ 只有 sympy 的 latex 字符串）⇒ ★ **按哲学补在【内核】**（★ 编译/子进程/超时/取消是机制）⇒ ★ **kernel/latex.js** ✓
★★ **而中文优先**：★ **内核【不硬编码】**，★ **由 pack 值层给 latexEngineOrder** ⇒ ★ **策略在 pack、★ 机制在内核的教科书例子** ✓

### 轮 10–12 — ★★★★★ **真机第一次覆盖"成员用工具"** ＋ ★★★ **三处假绿**
★★ 真机：★ **成员 21 次工具调用、★ 3 条记录真的落地**（★ r-1/r-2/r-3）✓
★★★ **而它同时暴露 scope.role 说的是【一个真实回合不说的词汇表】**：
- ★ **role 是 binding 选择的【KEY】＝槽 id**（★ kernel/turn/index.js:691 明写 roleLabel 与它**故意分开**）
- ★ **v5r 却用显示名 academician/researcher** ⇒ ★ **永不匹配** ⇒ ★ **两段"本轮可用工具"与夹具段【从未渲染】** ✓
★★ **而两条测试是绿的是因为它们【也】**用显示名装配 —— ★ **双方共谋** ✓
★★★ **改成槽 id 后**：★ **vmu-turn T65 立刻红**（★ 假绿现形）⇒ ★ 修正后绿 ✓
★★ **更重的一处**：★ **charter 的 role BINDINGS 也用显示名** ⇒ ★ **46 条 binding 里 18 条从未生效** ⇒ ★ **默认文本是 researcher 版** ⇒ ★★ **过去所有真机 run 里，院士读的都是研究员版章程** ✓
★ **修法**：★ **只改元数据，★ 文本 sha 逐字不变**（★ 68/68 sections, TEXT changed 0）✓
★ **并机械化**：★ audit-scope-role-vocabulary ⇒ ★ **一个 vocabularyOf(pack) ＋ 一个 validateDimension**，★ **scope 与 binding 各供一个提取器** ✓

### 轮 13–16 — ★★★ **门禁抓到的四件事**
| ★ 抓到 | ★ 性质 |
|---|---|
| ★ **v3-toolfilter 用了 api.services.get 却没声明 trigger-workflow** | ★ **能力被拒，★ 而代码用 try/catch 把拒绝【吞了】** ⇒ ★ **计数器永远不动且毫无提示** |
| ★ **meeting/second+meeting/withdrawn emit 了却没冻结** | ★ **总线拒收自己的事件** ⇒ ★ **没人能订阅** |
| ★ **secretary 的权限检查插到了 light-tier 检查【之前】** | ★ **拒绝说了错的理由**（你不是主持人 vs 这个会议不能产生实体结论） |
| ★ **服务数 80 → 81（加了 vmu.status）而文档写 80** | ★ **派生数字 stale** |

### 轮 17–19 — ★★★ **诊断面在说谎/读不到**
★★ 真机原文：★ **eligible:[], reason:"no member holds the closure-vote permission"** —— ★ **而成员明明有票权、★ 也真的投了票** ✓
★★★ **根因**：★ **vibe_vmu_turn 的 status 调 closureVoteOf 时【没传 roster】** ⇒ ★ **eligible:[] 是假的、★ reason 在说谎** ⇒ ★ **root 被引向"没人有票权"⇒ 反复派轮 ⇒ 撞 6.1M token cap** ✓
★★ **修法**：★ **closureVoteInput() 算一次、★ closureVoteView() 渲染，★ 两处共用** ⇒ ★ **两处算同一件事在结构上不可能不一致** ✓
★★ **第二个**：★ **vibe_vmu_status 49,933 字符被宿主截断** ⇒ ★ **模型读不到** ⇒ ★ **补 detail:closure（★ 真装配 447 字节）** ✓
★★★ **第三个（最妙）**：★ **Lean 的 code 是【错的具名】** —— ★ VMU_LEAN_EXIT_NONZERO ＋ "退出码 NaN"，★ 而 exitCode 是 null ⇒ ★ **Number(null) → NaN** ⇒ ★ **判成"非零退出"，★ 而真相在 spawn 层** ⇒ ★ **调用方会去查证明** ✓
⇒ ★ **已分开**：★ **缺 exitCode ⇒ VMU_LEAN_SPAWN_FAILED** ✓

### 轮 20 — ★★ **同一个病的第三次**
★★ **budget/warn → meeting/second+withdrawn → lean/job-failed** —— ★ **在自己命名空间 emit、★ 而名字没进冻结表** ✓
★★★ **三次都是 audit-hook-coverage 抓到的，★ 而它们附近的测试一次都没抓到** ✓
★ **原因**：★ **emit 与登记在两个文件里两处编辑** ⇒ ★ **只有全仓检查能看见不一致** ✓

### 轮 21 — ★★★★★ **closureVote.cast === true**
    {"window":"round","cast":true,"for":["member-a"],"against":[],"missing":[],
     "eligible":["member-a"],"permission":"vote",
     "reason":"every enfranchised member judged the question solved"}
★ **通过 detail:closure 读到，★ 447 字节** ✓
★★ **四票全 true**，★ 其中一票自己写道：★ **本轮本地实际运行 lean.exe 编译 exit 0；face 运行 lean-3 仍返回 VMU_LEAN_SPAWN_FAILED…我这一票 vote_solved=true** ⇒ ★ **成员把矛盾写进回执而【不隐藏】** ✓
★★★ **而之前每一票 false 的原因**：★ **vmu.turn.objective 未设定**（★ charter 显示"尚未设定"）⇒ ★ **成员拒绝从 why 自拟机构的问题** ⇒ ★ **那个拒绝是对的** ✓
★ **修法**：★ **机构目标写进 pack 值层**（★ 本所本期目标：确立并证明前 n 个奇数之和的封闭形式 n²…四步归纳…归档）✓
★★ **关键澄清**：★ **charter 的原问题字段根本没丢** —— ★ **原版它也是配置字段**（★ vibe-math-v5r.js:489 problem:{id:'',statement:''}）⇒ ★ **漏搬的不是文本、★ 是【机构数据】** ✓
★★★ **而 tools:none 上一轮为什么没生效**：★ **tools/turn.js 把 parameters 声明成【完整 JSON Schema】**，★ 而宿主按 **param map** 包 ⇒ ★ **发布 schema 变成 properties.type/properties/required** ⇒ ★ **真参数全被塞进一个叫 properties 的对象** ⇒ ★ **tools:none 被静默忽略** ⇒ ★ **投票回合仍有 30 次工具调用** ✓
★ **已修**：★ **发布 schema 现在是 properties.op/members/…/tools** ✓

---

## §7 ★ 七个目标的逐条对账

| # | ★ 目标 | ★ 证据 | ★ 状态 |
|---|---|---|---|
| 1 | ★ 覆盖矩阵 | ★ phase7-coverage-matrix.md（171 行）；★ **(甲)48／(乙)10／(丙)0**（v3）、★ **(甲)48／(乙)0／(丙)17**（v5r） | **✅** |
| 2 | ★ v5r 完整移植 | ★ **38 个 vibe_v5_* 工具**（★ V5R_NEXT_BATCH_TOOLS 为空且被断言）；★ **论文 14/14 函数**（★ 含指纹阻塞、★ 四件产物、★ xelatex 中文优先走 pack 值层） | **✅** |
| 3 | ★ 工具化改造 | ★ 真机 **124 次工具调用**；★ vmu.turn.unknownReplyFieldMode 默认 ignore-named（★ **一个多余字段不再作废整轮**）；★ 代执行路径**保留**（★ 消费者清单在 phase7-toolification-plan.md） | **✅** |
| 4 | ★ 按成员/场景装卸 | ★ applyMemberToolFace（★ 正断言比真实差集）；★ toolFaces 由 pack 声明、★ 内核执行；★ 状态块列真实可见工具；★ **DSH 侧核实：ctx.tools.register/restrict ＋ tools/change ＋ 宿主自动增减提示** | **✅** |
| 5 | ★ 补审盲区 | ★ phase7-blindspot-audit.md；★ **3 道新门禁**（observer-consumers／scope-vocabulary／hook-coverage 三次抓到）；★ **3 处假绿现形** | **✅** |
| 6 | ★ 文档纠错 | ★ 两处错误结论已改（v5r 没有 paper 是正确差异 → 未移植；no tools 是设计 → 未移植）；★ 派生面全同步 | **✅** |
| 7 | ★ 收尾验证 | ★ **全量 T1 389/389 绿**；★ **v5r 真机 cast === true**；★ **v3 待重跑**（★ 本阶段改过它的能力声明与守卫顺序） | **🟡 只剩 v3 重跑** |

---

## §8 ★ 这一阶段最该被记住的四条（★ 都花过真金）

1. ★★★ **"设了值" ≠ "生效了"** —— ★ 本轮三种形态：★ **构造期快照**（★ manifest 改 requireSettledRecords 不生效）、★ **scope 词汇不匹配**（★ 段永不渲染）、★ **schema 形状错层**（★ 参数被塞进 properties ⇒ tools:none 被忽略）⇒ ★ **每一种都必须【读回确认】，★ 不能只信"我设了"** ✓
2. ★★★ **假绿比红更危险** —— ★ 三处假绿都是因为**测试与代码犯了同一个错**（★ 同一种词汇、★ 同一个形状）⇒ ★ **"改对一侧，★ 看另一侧崩不崩"** 是发现它们的唯一办法 ✓
3. ★★★ **错的具名比不具名更糟** —— ★ VMU_LEAN_EXIT_NONZERO ＋ "退出码 NaN" 会把调用方引向**错误的方向**；★ **一个具名必须能被验伪**（★ 要么它说的事是真的，★ 要么它说"我不知道"）✓
4. ★★★ **诊断面本身就是被测系统的一部分** —— ★ **eligible:[] 说谎**让 root 撞了 6.1M token cap；★ **status 49,933 字节**让模型读不到 ⇒ ★ **"机制写好但没人能读"与本阶段那三类盲区是同一族** ✓
