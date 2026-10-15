# Round 6 · vmu-verify（task-42）交付报告

> 任务：`task-42`（A 主项「声明 ⇒ 面真的发布」运行时断言；B 矩阵 v5；C 证据同步；D `docs/11` 判据纪律正例/反例）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；凭据副本用完即删；未动他人 profile/进程。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 一句话 |
|---|---|---|
| **A 主项** | ✅ **完成并自证** | 真入口端到端 4 类断言 **28/0**；**falsify 证明可红**（含"关掉嵌套展平＝R5 真故障形态"）；**真机终态＝多面点亮成功**（`request/header` **L13/seq11 tools=78，`vibe_vmu_*` ＝ 52 面**；**5 对真调用/返回、4 个面**） |
| **B 矩阵 v5** | ✅ | 标题升 v5；§9.1 换成**实测具备**终态（含一条 NON-RESULT 如实标注）；新增 **§9.2**（C-45 变异证明／F31 再升档／写前必读闸／目标 2 终判／发布判据） |
| **C 证据同步** | ✅ | §8 真机面改成 R6 终态（seq/行号）；§10.6 F31 行升为"跨进程耐久原子"；新增 **§10.7**（目标 1／目标 2 终判摘要） |
| **D docs/11 §4.2** | ✅ | 加**正例/反例并列**：反例＝dump 字符串（R5 双向误判）；正例＝读运行时注册定义／读 `ctx.tools.register` ＋真机侧 `request/header.tools` |

> ⚠️ **一条 NON-RESULT（不得写成 PASS）**：R6 那次真机会话的**回合本身**被 `--max-tokens 40000` 触发上限而**取消**（`totalTokens 70 488 > cap 40 000`）。"52 面被发布 ＋ 5 对调用"是**取消前已完成**的观测事实；**"回合完成"不是结果**。

---

## A · 主项：声明 ⇒ 面真的发布（运行时断言 ＋ 可证伪）

### A.1 端到端断言（真入口 `apply(ctx, config)` ⇒ 读 `ctx.tools.register`）
`tests/audit-declaration-publishes-face.test.mjs` ⇒ **28 passed / 0 failed EXIT=0**：

| 断言 | 内容 |
|---|---|
| **D-01 红线** | **无声明 ⇒ 恰 1 个工具** `vibe_vmu_status`；**`{vmu:{}}`（空命名空间）⇒ 仍 1 个且零告警** |
| **两形态等价** | **点号** `{'vmu.tools.faces':['*']}` 与**嵌套** `{tools:{faces:['*']}}`（overlay 配方写的形态）⇒ **完全相同**的面集合（含 chat/panel/report） |
| **家族键** | 两种拼法的 `vmu.report.*` ⇒ 都真发布 `vibe_vmu_report`（不是只看 `settings()`） |
| **不可解析要具名** | 坏形状键 `'vmu.tools..faces'` ⇒ **`ctx.logger.warn` 具名 ＋ handle `settingsUnparsed()` 自曝 ＋ 不发布**；**三类**（空对象叶子／函数值／坏形状键）各一条具名且 **`status().settingsUnparsed` 计数一致** |
| **不许静默择一** | 同键两形态 ⇒ **点号胜** ＋ `settingsConflicts()` 披露 |
| **不误报** | **形状合法但 schema 不认**的键（`vmu.tools.facez`）⇒ 解析器接受、**不告警**、也不发布面（"解析器管形状、schema 管语义"） |
| **确定性** | 两次相同启动 ⇒ 相同工具清单 |

★ 关键实现细节（core 提醒的坑，已落实）：**适配器 install 链是异步的且 `handle.ready()` 不 await 它** ⇒ 读注册列表前 settle 60 ms，否则会误判"面没发布"。

### A.2 可证伪性（falsify，Lead 明确要求）
`tests/audit-declaration-publishes-face.mutants.mjs` ⇒ **GREEN EXIT=0**（走共享库 `tests/_lib/falsify.mjs`；入口有相对 import，库把相对说明符改写成绝对 `file://` ⇒ 副本仍引用**原仓**兄弟模块，只有被变异的那份文件不同）：
- **控制组**：真模块上四条事实全绿（无声明恰 1 工具／两形态集合相同且非平凡／坏键"告警且不发布"）。
- **M1** 关掉点号通道（`if (... !k.startsWith('vmu.')) continue` → `if (true) continue`）⇒ `dottedFaces` 退化 ✅
- ★ **M2 关掉嵌套展平**（`if (namespaced) {` → `if (false) {`）⇒ `nestedFaces` 退化 —— **正是 Round 5 的真故障形态** ✅
- **M3** 静音告警（`ctx.logger?.warn?.(line)` → `void line`）⇒ `malformedWarned` 变 false ✅

### A.3 真机终态（SLV：观测／支持／不支持／非结果）
**观测（会话日志 `session-4f62c01e…`，多帧 zstd 用 `dsh-drive.mjs:213-215` 规范读法；seq＋行号）**

| 事实 | 行 / seq | 内容 |
|---|---|---|
| `user/message`（首条） | **L10 / seq=8** | 以「**【模拟测试 / SIMULATED TEST】** …」开头 ✓（playbook §2 落点） |
| `system/message` | L9 / seq=7 | 6 929 字符 |
| ★ **`request/header`（宿主真发给模型的载荷）** | **L13 / seq=11** | **tools=78，其中 `vibe_vmu_*` ＝ 52 个面**（含 `chat`/`panel`/`report`/`mailbox`/`wait`/`meeting`/`turn`/`human`…） |
| ★ **真调用/返回（5 对、4 个面）** | **L18/seq16→L19/seq17** `status`；**L20/seq18→L21/seq19** `chat`；**L22/seq20→L23/seq21** `panel`；**L24/seq22→L25/seq23** 与 **L29/seq27→L30/seq28** `report` | ✅ **≥3 面的验收达成** |
| 模型过程自述 | L28 / seq=26 | 明写按脚本逐步调用（第 4 次＝report status） |
| ★ **声明真的到入口了（端到端交叉核对）** | 同会话 status 回执 | `settingsMerge.sources = {vmu.tools.faces:'config', vmu.packs.active:'config', vmu.report.enabled:'config', vmu.report.minIntervalMs:'config'}`、`keys=4`（**R5 同字段＝`sources:{}`／`keys:0`**）⇒ 与"52 面被发布"互为印证 |

**面数口径**：我按载荷程序化点数＝**52**（tools=78、unique 52）；vmu-assistant 已按此改正其文件中的 51 笔误。两次会话 `request/header` 均为 **78/52**。

**助手面三条（R5 记"未建立/未行使" → R6b 真机更新）**
| 条 | 判定 | 依据 |
|---|---|---|
| **报告声明路径** | **实测具备 ✓** | R6b（overlay v3 带一条真阈值报告）status 回执 **`declared:1, armed:1, problems:[]`**（L34/seq32→L35/seq33），且 `settingsMerge.sources`＝**5 键**、多出 **`vmu.report.reports:'config'`**（R5 为 `declared:0`／`sources:{}`） |
| **阈值真开火** | **未建立（NON-RESULT）** | **`report tick` 未被调用**（回合在 4 次调用后被上限切断）⇒ 机制**未被证伪**，但无真机读数（单元级免费探针已证 `declared=1`＋`tick({artifacts:9})`⇒`fired[0]`，非真机） |
| **参数面（`vibe_vmu_set`）/两条人设通道** | **未行使** | 第 5、6 步未执行（同上） |

**支持**：① U14 overlay 机制可用（`session/create` http=200 ok=true；`preset` 可用）；② 入口修复后**声明真的变成已发布的面**（52/78）；③ **面真的被调用**（4 个面、5 对）。
**不支持**：无（R5 的"只有 status"已闭合）。
**非结果（NON-RESULT）**：**回合被 `--max-tokens 40000` 上限取消**（`totalTokens 70 488 > cap`；`done`: in 42 778／out 1 086／21 s）⇒ 按 §8 不写成 PASS。**R6b 的第二次会话同样触顶**（`120 000`；实测 `totalTokens 154 084`，`cacheRead 110 976`；`turn/end`＝`aborted/user`）⇒ **两次都是 NON-RESULT**；**根因是预算不是机制**（`vibe_vmu_status` 回执 49 929 字符，其后每步从缓存重读，第 5 步触顶）⇒ 若要钉死后三条：**提高上限（≥400k）／精简系统面／把 `status` 挪到最后或取短 action／拆多次短会话**。

### A.4 免费预检（省掉一次白跑）
`POST /api/session/create {agentPreset:'vibe-math-vmu'}` ⇒ **http=200 ok=true**（R5 时是 `agent-preset/not-found`）。

---

## B · 矩阵 v5

- **§9.1 终态**：多面点亮＝**实测具备**（上表 seq/行号）＋一条如实 NON-RESULT；R5 的根因与判据保留为"已闭合的历史"。
- **§9.2 新增**：
  1. **C-45 弃权改写**：`tests/vmu-fidelity-falsify.test.mjs` ★**我复跑 10/0** —— 控制组（0/1 都改写成 0.5＝**弃权不是钳制**、他人/他对象/已是 0.3 原样通过）＋两处单点变异（`fidelity.js:136` 守卫 → `if (true)`；`:30` `FIDELITY_ABSTENTION_VOTE 0.5 → 0.25`）⇒ 判据升为"**唯一强制点不只在代码里，而且移除即被同一探针具名抓住**"。
  2. **F31 再升一档**：`kernel/ballot.js:139-152 createDurableCommitLog` ⇒ **跨进程耐久原子**（ticket 由 store 分配／意图先于生效／`reconcile()` 幂等不双花／无 store ⇒ `durable:false` 且 `reserve()`→null／`status().gate` 增 `durable`+`log`）；★我复跑 `tests/vmu-meeting-parity.test.mjs` ⇒ **162/0**；残余具名＝host 需提供**分配型 store**。
  3. **写前必读闸**：`tests/vmu-resume-falsify.test.mjs` ★**我复跑 9/0**（从未读就写 ⇒ 具名拒＋0 键落地；读失败不算读过；跳过/失效闸门各具名红）。
  4. **目标 2 终判摘要**（reader-c）：v5r 实现层 14/14；设计层 42 条 ⇒ vmu 具备≈26／部分≈11／缺≈5；"支持 v5r 全部功能"＝是（有余量）／"支持设计文档全部功能"＝否（v5r 自身也不满足）；缺口 G1–G9 具名。
  5. **发布判据**（本轮主交付）。

---

## C · 证据同步

- §8「真机面」改为 R6 终态（seq/行号 + 52 面 + 5 对 + NON-RESULT 标注）。
- §10.6 **F31** 行升为"具备（R5 显式队列 → R6 跨进程耐久原子）"，含 `ballot.js:139-152` 五条语义与我复跑的 162/0。
- 新增 **§10.7**：目标 1（reader-a task-44）与目标 2（reader-c task-46）终判摘要：
  - **断点续跑＝具备（3 处具名小缺口）**：23 条里 18 条具备/超集（5 条超集：写前必读闸、read-back 一致性、恢复独占锁、耐久重启标记/世代号、子代对账）；2 条部分（重派缺失成员＝**策略**不在引擎；未 ack 邮件计数＝**端口未接，一行可补**）；1 条 **N/A 有理由**（v5r 看门狗时钟刷新：vmu 无持久在飞时钟，`kernel/**` 零命中 `lastInputAt|lastVoteAt`）。
  - **人工干预＝具备（1 处具名上行缺口）**：12 条里 10 条具备/超集（3 条 v5r **完全没实现**：真闸门、跨重启审批/否决台账、否决解除）；1 条部分（成员→所办收件箱聚合：通道有＝`mailbox.office`＋`arbitration.escalate`，缺 v5r 式带上限的单一聚合面，**主干由审批队列承担**）。
  - ★ **缺陷类（已修，值得记）**：`recoverUnlocked` 局部变量 `roster` **遮蔽注入的 `roster` 端口** ⇒ 子代对账永远 `checked:0`；与 R4 的 `snapshot` 遮蔽**同类**（"局部变量遮蔽注入端口"）。reader-a 已修并加断言。
- 复跑确认：`vmu-resume-lock-and-marks` **54/0**、`vmu-human-gate` **75/0**、`vmu-fidelity-falsify` **10/0**、`vmu-resume-falsify` **9/0**、`vmu-activity-falsify-lib` **22/0**（全 EXIT=0）。

---

## D · `docs/11 §4.2`（判据纪律，正例/反例并列）

在第三条硬要求下新增并列段：**反例**＝`--dump-config` 的字符串出现/不出现（R5 双向误判：假阳性＝patch 原文当合并；假阴性＝注册期合并 dump 照不出）；**正例**＝① `tests/audit-preset-overlay-merge.test.mjs`（读 `agentPresets.register` 收到的定义）② **本条** `tests/audit-declaration-publishes-face.test.mjs`（读 `ctx.tools.register` 的工具清单）＋其变异族；**真机侧对应判据**＝`request/header.tools`（宿主真发给模型的载荷）＋ `tool/result` 的 `settingsMerge`/`settingsKeys`/`settingsUnparsed`。

---

## E · 命令与退出码（原样）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/audit-declaration-publishes-face.test.mjs` | **0** | 28/0 |
| `node tests/audit-declaration-publishes-face.mutants.mjs` | **0** | GREEN（M1/M2/M3 各具名红） |
| `node tests/audit-preset-overlay-merge.test.mjs` | **0** | 21/0 |
| `node tests/audit-package-membership.mjs` | **0** | 13/0（两新文件已登记 `files[]`） |
| `node tests/vmu-meeting-parity.test.mjs` | **0** | 162/0 |
| `node tests/vmu-resume-lock-and-marks.test.mjs` | **0** | 54/0 |
| `node tests/vmu-human-gate.test.mjs` | **0** | 75/0 |
| `node tests/vmu-fidelity-falsify.test.mjs` | **0** | 10/0 |
| `node tests/vmu-resume-falsify.test.mjs` | **0** | 9/0 |
| `node tests/vmu-activity-falsify-lib.test.mjs` | **0** | 22/0 |
| `node scripts/preflight.mjs` | **0** | PASS |

---

## F · 交回 Lead

1. **A 主项达成**：声明 ⇒ 面真的发布，有**运行时断言（28/0）＋可证伪证明（mutants GREEN）＋真机载荷（52 面 / 5 对调用）**三条腿。
2. **唯一的 NON-RESULT**：R6 会话回合被 `--max-tokens 40000` 取消（不是失败，也不是通过）——**若你要"回合完成"这条也成为结果，说一声我按更高上限重跑 1 次**。
3. 本报告与 `04-parity-matrix.md`(v5)／`05-framework-strength-evidence.md` 已同步；`docs/11 §4.2` 已补正例/反例。
4. **清理**：临时凭据副本与含账号 id 的 provider 补丁已删；实例 `--port 7801` 已停；未按时间窗批量删；未动他人 profile/进程。
