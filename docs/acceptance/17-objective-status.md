# vmu 目标终态总账（Round 39 · `task-180` 刷新；R34 · `task-164` 五版；R32 · `task-158` 四版；R27 · `task-144` 三版；R24 · `task-137` 二版；R16 · `task-117` 初版）

> **这份文件是什么**：用户 7 条目标（0–6）的**终态总账**。每条给**四列**：① 结论 ② 证据（可复核命令＋读数，或指向 handoff 的哪一节）③ 具名缺口（缺什么／**改判条件**／owner）④ 本轮复核方式（**实跑**了什么，或**只读**了什么并注明）。
>
> **本轮（R34）相对上一版的六处实质变化**：① **目标 6 追加 R32/R33 三件**：**截断形状稳定**（`receiptMeta` 五键两态恒存在）／**§11 第三档「未判定」**（含**审计第二个真洞**）／**九项升档为真机证据**（§2 目标 6 的 (D)）；② ★★ **档位重写**：**R33 真机臂＝真机证据**（payload 跑前跑后逐字节核过、树已提交且干净）；**而 `truncated:true` 在 R33 臂上未发生**（真机面无叶可截）⇒ 当时写"真机未发生（进程内已证）"——★ **该格在收轮后即被 R34 臂改写：`truncated:true` 已在真机出现，现已【升档为真机证据】**（见文首"收轮后追加"、§0.2、§2 目标 6 (D)①）；③ **两条最值钱的教训**独立成节（§0.5）；④ **纪律族扩到九条**（每条带现场实例）（§5.9）；⑤ **"在飞写者污染读数"补 R33 的新面**：**宿主 spill／转录省略版** ⇒ **"我看见的那份不是全量"**（§0.4）；⑥ **G6-e 已闭合**——我按 R32 的复核清单**独立验证**（超预算时 `st.packs` 仍可读／`receiptMeta` 五键两态／`elided` 路径级可核／无可截叶子时不再沉默）⇒ **22/0**（§0.3）。
>
> **★ 收轮后追加·三（R39 刷新，并入 R36–R38；本版已并入）**：① ★★ **新增 §0.6「可推范围」的三层**（照 `vmu-pack2` 报告 §9 原文落；**三处同形可对账**）＋ **Lead 的裁定理由**（**不做** (i)(ii)、(iii) 具名留存／未排期）。② ★★ **§0.5 新增 (iii)「不变红的守卫」的终局**：**变异没落地**（锚点命中**散文行 L257**，真行 **L312** ⇒ 表格行从未被改 ⇒ 审计**正确地**绿）＋ ★ **"两方同向读数共享同一缺陷 ⇒ 一致不构成事实"**（R35 我与 `comms2` 都读"不红"＝**假一致**）。③ ★ **纪律三层递进（一条线）**：**"变异打错行"（R27）→ "落地自检只答【文件变了吗】"（R36）→ "打印 ≠ 断言"（R38/39）** ⇒ ★ **落地自检必须 target-addressed 且【被强制】**（R38 收口时**仍非强制**，具名保留）。④ ★ **R34 读数已可独立复算 —— 我做到 9/9**（**我自己**解析盘上 overlay 的规则＋逐字符验前缀，§0.3c）⇒ 关闭 verify2 R35/R36 的那条"输入件不可得"。⑤ 计数更新为 **`1108 / 5 / 113`**（R37 的**最小数据流转档**把 `vmu.turn.objective`／`vmu.turn.instituteName` 从"未接线"改判"未判定" ⇒ **5 ＝ 3 旧 ＋ 2 新**）⇒ ★ **N9／G0-g 由此闭合**。⑥ 纪律族扩到 **≥19 条**（§5.9）。
>
> **★ 笔误更正（沿上一版保留）**：任务书曾写"11 处 **`onOne`**"，**应为 `oneOf`**（`const oneOf = (v, set, def) => (set.includes(v) ? v : def)`）；本文件一律写 **`oneOf`**。
>
> **★ 收轮后追加（R34 真机臂，23:25；本版已并入）**：**"`truncated:true` 真机未发生"这一格已过期并已改** —— 新臂 **`session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`**（**23:25:02**，exit 0，**HEAD `8b680cb`**，payload `receiptbounds.js` **`56285AC856E75DE4`**）**在真机上观测到 `receiptMeta.truncated:true`** ⇒ 该契约**已升档为真机证据**（§2 目标 6 (D)①）。★ **上一版的考古结论保留**（"契约是 R33 提交后才有的" ⇒ **R33 那次必然无标记**）—— ★ **两者不矛盾**：我证的是"**那时**还没有契约"，新证据证的是"**现在**它在真机上真的生效"；这正是 **"读数要说清是哪一份／哪一版／哪一时刻"** 的现场。★ 我**第一手读了 spill 并复算**（§3.2 N10 已据此改写）。
>
> **★ 收轮后追加·二（R35 收口，23:50）**：① **`G6-h` 已给【结论】而非继续挂着** —— **"升档"判据已定义**（真机臂上以相同键／语义形状复现 ＋ payload 逐字节核过；有具名差异则标"升档（附具名差异 X）"，否则"待升档"），并按此**把 R33 的九项逐项标注**（**九项全部升档**：8 项＝R33 臂、⑥ 截断＝R34 臂；**1 项带具名差异 D2**）⇒ **原"7/1/1"口径差消解**（§2 目标 6 的 G6-h 两表）。② **`--write` 后的收口＝【Lead 已核（转述）】**：`audit-vmu-docs` 103/0、**表计数 1108 / 3 / 115**、**T1 323/323**、提交 **`8431f6d`**（★ **我没跑 T1、没核提交**）；★ 我另在 `8431f6d` 上**单门复测** `--check`＝**3/115**、`audit-vmu-docs`＝**103/0**（与 Lead 两个数逐字相同）。③ ★ **旧数 `4/114` 已作废**（新方法的越界 bug，机制由 `vmu-comms2` 给出）⇒ 这也是"旧数字可能是旧方法的产物"的**双向**版（§0.5 (ii) 已改写）。④ **新增 N11**（顶层 vs 子对象）与**纪律第 12 条**（子串探测）、**第 13/14 条**（先机制再改数字／"红了"vs"红在被测行"／"没核"vs"核了"／转述注明来源）。
>
> **作者**：`vmu-accept`（独立第三方视角）。**我只写这一个文件**；不改代码、不改测试、不改其他 docs。

---

## 0. 读的是哪一次运行（版本钉死 ＋ 读物策略）

| 项 | 值 |
|---|---|
| 工作树 | `D:\wd\vibemath开发\Vibe-Mathematics` |
| `git rev-parse --short HEAD` | ★ **`a3bde6a`**（R38，提交于 **2026-10-16 01:10:29**：*coverage reduced to one rule, and a self-check that would have lied now throws*）；本版并入区内还有 `a71370e`(R37)／`01cc427`(R36)／`345682f`(R35)／`8431f6d`(R34)／`8b680cb`(R33)／`c7950ce`(R32)／`1f0fb1d`(R31)／`c12556e`(R30)／`2d39d59`(R27) |
| ★ **工作树是否干净（本轮 R39）** | ★ **干净**（`git status --porcelain` ＝ **0 行**，01:11 与 01:14 两次读）⇒ **本轮的套件读数直接取自工作树 ＝ HEAD `a3bde6a`** |
| 我的运行时间窗 | ★ **本轮（R39）＝ 2026-10-16 01:11 – 01:14**；★ **历史（沿上一版保留）**：R34 主体 **23:19–23:28（`8b680cb` 干净树）**／R35 收口 **23:49–23:50（`8431f6d` 干净树）** ⇒ ★ **一切套件读数只属于这两个（或本轮那一个）干净树，不属于任何未提交改动之上的树** |
| ★ **本轮关键哈希**（sha256[0:16]，我自己算的，＝ HEAD `a3bde6a`） | `kernel/receiptbounds.js` **`E4873BFBC9AAC0AB`**（184L）／`kernel/index.js` **`81D7CDD40962C773`**（2311L）／`host.js` **`461D7FD499F016EA`**（1167L）／`scripts/generate-vmu-settings-table.mjs` **`3DA8DA781269E8B5`**（402L）／`tests/audit-vmu-docs.test.mjs` **`9DCB49F114306939`**（750L）／★ **两个新套件**：`tests/vmu-elision-prefix-recomputable.test.mjs` **`EC25574D2F1F7BFE`**（102L）／`tests/vmu-applies-name-unified.test.mjs` **`957CEC84D4D7DEA3`**（98L） |
| ★ **版本考古（保持，用于档位判定）** | `receiptbounds.js`：`8b680cb` **`56285AC856E75DE4`**（R34 真机臂那一版）→ `8431f6d`/HEAD **`E4873BFBC9AAC0AB`**（`note` 措辞更正＋`keptHash`/`origHash` 一族）；★ **entry／`host.js`／`kernel/index.js`／`schema.js` 在 R34 臂那一版与 HEAD 之间未变**（R33 考古结论不变：**`receiptMeta` 契约是 R33 提交后才有的**） |

**本机环境**：`node v24.21.0`；`python 3.12.10`；`numpy 2.5.3`／`scipy 1.18.1`／`pandas 3.0.6`／`sympy 1.14.0`（R16 我实跑过；**本轮未复跑**，见 §5）。

### 0.1 五件「测量环境的同一性」＋伴随件（**可引用编号**，照旧）

| 编号 | 名称 | 一句话判据 | 现场（代价） |
|---|---|---|---|
| **M-1** | **payload 哈希** | 报告真机读数前先证**宿主实际加载的 payload ＝ 仓库**（并按 payload 分档） | `r17-home` 快照 `13DA3E536C9187BF`（00:29）vs 仓库 `EA836778F2197B12`：10 文件不同 ＋ 1 个只在仓库（`artifact-counter.js`）⇒ 那份 payload **连 R17 的 `orderMode` 修复都不在**；★ **R33 臂跑前跑后都核了**（见 §0.2） |
| **M-1b（前置已机械化）** | `payloadsAgree()`／`findHostPayload()` | host 分支两条前置：payload **已定位** ＋ **与仓库逐字节相同**（**不是"容忍陈旧哈希"的白名单**）＋ 4 条两向自探针 | `tests/vmu-assistant-host-slice.test.mjs`：**10 passed / 0 failed / 5 not-run，exit 0**（**我本轮实跑**）；`--require-host` **exit 1** |
| **M-2** | **解码帧完整性** | one-shot zstd 只出 **2 行**、**看起来像证据**；须按 magic 切帧 | `scripts/dsh-drive.mjs:206-215`；R33 三臂按帧解出 **E 13 帧/29 events、A 17/35、C 32/60** |
| **M-3** | **`await` 指纹** | `JSON.stringify(<Promise>)＝"{}"`；**半对的坏读数最危险** | 签名＝本该有字段的对象却序列化成 `{}` |
| **M-4** | **装载 settle** | 读 `packErrors`／`appliedPacks`／`bus.entries` 前**先让装载落定** | `vmu-core2` 首跑读到 `packErrors` **空**（探针抢跑）：C 臂 `ready()` 后立即 `0`、**250 ms 后 `1`**；R25 起 **`ready()` 自己等装载** |
| **M-5** | **同刻同源** | 比较两个读数前，先证它们取自**同一时刻**且**同一 artifact** | `hits:2`（**会话内**某次 `vibe_vmu_status` 渲染当时）vs `tool-results=5`（**`r131E-boot.log` 第 3 行** sink）⇒ §3 |
| **M-6（伴随）** | **因式分解** | 汇总值只钉**乘积**；因子要用**原始行**分开钉 | `sum=5` 既可能"5 事件×1 观测×1"也可能"1×1×5"；`kernel.metrics` 的 `series({name}).items`：1 事件＝1 行、该行 `value=1` |
| ★ **M-7（R33 新增，属同一族）** | **"我看见的那份不是全量"** | 宿主会把大回执 **spill 到文件**、**转录里留省略版**（`\n\n[...]\n\n`，position **24846**）⇒ **"转录里没看见 X" ≠ "X 不存在"** | 三臂的 `vibe_vmu_status` 在转录里都是 **49,930 字符**（带 `[...]`），**完整回执 179,826／182,090 字符在 spill 文件里**；★ `vmu-assistant2` **一开始就被它坑了一次**（`settingsRejected` 在转录里不出现）。可靠读法＝**读 spill 文件**（省略文本里自带路径）或**用小结果面** |

### 0.2 ★★ 真机读数的分档（**R39 更新：三档并列，`receiptMeta` 已升档**）

| 档 | 范围 | 判定 |
|---|---|---|
| **真机证据（payload 逐字节核过）** | ★ **R33 臂**（`c7950ce`，21:58–22:01：entry `71E288B9AD711E2E`／`receiptbounds.js B8FEF79B61F178F6`／`host.js 2DF56A4492FA047B`／`kernel/index.js 81D7CDD40962C773`／`schema.js 90D9D1D492D88C53`；跑前/跑后 `git status` 均 0 行）＋ ★★ **R34 臂**（`session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`，**23:25:02**，exit 0，HEAD `8b680cb`，`receiptbounds.js 56285AC856E75DE4`＝**我版本考古过的那一版**） | ★ **我独立复核**：R33 五哈希与我 `git cat-file blob c7950ce:` 的结果**逐字节相同**；★★ **R34 的 `truncated:true` 我第一手读 spill 复核（§0.3b）＋ 用盘上规则独立复算（§0.3c，9/9）** |
| **当前树（进程内）** | **R30–R38 的进程内读数**：A 三个执行点／`settingsRejected`／`settingsUnenforced`／§11 第三档（1108/5/113）／`appliesAt===appliesFrom`／`elided[]` 的 **8 键**形态 | ★ 其中 **8 项已在 R33 臂上复现 ⇒ 升档为真机**（§2 目标 6 的判档表）；★ **`receiptMeta` 契约已由 R34 臂升档（真机）**；★ **`elided[]` 8 键形态仍只有代码读数**（R34 回执是 4 键 ⇒ **G6-i**，Lead 已裁不专门烧会话） |
| **铁证（对那份代码成立）** | **`r17-home` 家族**（00:29 快照）：R17 那次 `--require-host` 的 5 条 not-run ＋ `:367` 改前读数等 | 宿主跑的是 **00:29 快照** ⇒ 依赖其后的修复／模块的东西在它们上面**从未执行过**。★ 硬推论：**「R17 的 `orderMode` 修复从未被任何 `r17-home` 家族的宿主执行过」** ⇒ **不得引用成"真机已验"** |
| **缺证（不可判定，不是否证）** | **刷新前的 `r18-home` 会话**：R18 自主开火（`session-7105ed8b`，15:14:26）／R18 的 `--require-host` 17/0 复核（`session-6076da68`，15:17:20）／R20/R21 阈值会话／16:58 与 17:16 两次 arm A／arm B/D | payload 于 **17:13:49 就地刷新**、**逐会话状态不可回溯** ⇒ 写成**缺证** |
| **当前树@R23（真机）** | **arm A** `session-99d2090d`（17:18:52）／**arm E** `session-6ca9fefd`（17:42:42，44 events，`turn/end: completed`） | 跑前核过 payload entry ＝ 仓库（`EA836778F2197B12`） |

★★ **本轮最关键的一条档位结论（★ 收轮后已被 R34 臂改写，此处并列两版、不抹历史）**：
- ★★ **新事实（R34 真机臂，23:25:02，`session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`，exit 0，HEAD `8b680cb`，payload `receiptbounds.js 56285AC856E75DE4`）**：**`receiptMeta.truncated === true` 已在真机出现** ⇒ ★ **该契约与"截断在真机生效"已升档为真机证据**（★ 我**第一手读 spill 复核**：`elided` 逐条复算成立、完整回执 `JSON.parse` 成功且既有字段全在 ⇒ §0.3b）。
- **而 R33 那次臂（`c7950ce`，21:58–22:01）**：完整回执 **179,826／182,090 字符（≫ 12,000）**，`…[elided]`／`"elided"`／`hostElision` **全都不出现**（`truncated` 唯一出现处是**报告面自己的计数器** `"truncated":0`）⇒ **那一次自省略一次都没发生**；
- **定性（R33 定为 (i) 代码缺陷，已修）**：真机 `vibe_vmu_status` 面有 **4,470 个字符串叶子、最长只有 378 < 2,000** ⇒ **不存在可截叶子** ⇒ 旧版 `boundedToolResult` 走"无可截 ⇒ 原样返回、**不加任何标记**"⇒ **179 kB 静默通过**；
- ★ **我的版本考古（§0）**：**R33 那次臂跑的是 `receiptbounds.js B8FEF79B61F178F6`＝修复前**，而 **`receiptMeta` 契约（五键两态）是 `8b680cb` 才引入的**（`56285AC856E75DE4`）⇒ **R33 那次"必然无标记"，与 R34 那次"真的有标记"【不矛盾】**：一个是"那时还没有契约"，一个是"现在它在真机上生效"；★ 我另**第一手**读 R33 的两份 spill 证实其 `receiptMeta` **ABSENT**（§0.3b）。
⇒ ★ **写作口径（本版已按此改）**：**`receiptMeta` 契约＝真机证据（R34 臂）**；**R33 臂那一格＝"当时未发生"的历史事实**（保留，不抹）。

### 0.3 ★ 我本轮的独立复核（**R32 交办的那条清单**，我实跑）

**我的探针** `D:\_tmp\r34-accept\probe-receipt-bounds.mjs`（只 import `kernel/receiptbounds.js`，不写仓）⇒ **22 passed / 0 failed，exit 0**（`receiptbounds.js` `56285AC856E75DE4`，23:2x）：

| 臂 | 我验的判据 | 结果 |
|---|---|---|
| **① 未超预算** | `receiptMeta` **恒存在且恰五键**；`truncated:false`／`elided:[]`；`originalBytes ＝ 真实长度`；`hostElision:'possible'`；**未超预算 ⇒ `note:null`** | ✅ 全过 |
| **② 超预算且有可截叶子（33,105 字符）** | ★ **超预算时 `packs`／`faces` 仍可读且未变**；**数组长度不变**；`truncated:true`＋`elided` 非空；★ **`elided[]` 每条 `path` 可定位、保留值＝原值前缀、`bytes===to-from`、`to===原长度`** | ✅ 全过（**这就是 Lead 要我复核的那条**） |
| **③ 超预算但无叶 > 2000（＝真机那种形态）** | 我们**没截**（`truncated:false`／`elided:[]`）**但不再沉默**：`originalBytes` 是**真实大小**（≠ `null`）＋ `note` 写明"为何没截"；与原件相比**只多一个键 `receiptMeta`** | ✅ 全过 |
| **④ 非对象** | 原样返回（子对象挂不上去）＝**具名边界**（测试 D3 断言） | ✅ |

**消费者电池（我实跑，工作树 ＝ HEAD `8b680cb`，23:20–23:27）**：`vmu-receipt-truncation` **19/0**／`vmu-entry` **150/0**（★ 含 `st.packs`）／`vmu-host` **107/0**／`vmu-host-hooks` **22/0**／`vmu-packs-active-switch` **24/0**／`vmu-pack-defaults-named` **36/0**／`vmu-meeting-domain` **10/0**／`vmu-settings-domain` **48/0**／`audit-code-size` **9/0**／`audit-status-report-fields` **19/0** —— **全部 exit 0**。
**R33 的 §11 修后读数**：`audit-vmu-docs` ⇒ **103 passed / 0 failed，exit 0**（**我实跑**；R32 我读到的是 99/0）。
**生成器三档现状（★ 两栏：我的 vs Lead 的）**：
- ★ **`--write` 后的收口＝【Lead 已核（转述）】**：`audit-vmu-docs` **103/0**、表计数 **1108 / 3 / 115**、**T1 323/323**、提交 **`8431f6d`** —— ★ **这四项是 Lead 的读数；我没有跑 T1，也没有核那次提交**。
- ★ **我在 `8431f6d`（干净树，23:50）另做的两处【单门】复测（第一手）**：`generate-vmu-settings-table --check` ⇒ **`up to date (1226 keys (1108 wired, 3 undetermined, 115 declared-but-not-wired))`，exit 0**；`audit-vmu-docs` ⇒ **103 passed / 0 failed，exit 0** ⇒ **与 Lead 的两个数逐字相同**（**但 "T1 323/323" 仍未由我核**）。
- ★ **旧读数（我 23:20 在 `8b680cb` 上量的 `1108 / 4 / 114`）已作废**：`vmu-comms2` R34 查明第 4 个是**它自己新方法的 bug**（`/^\];?\s*$/` 判"列表结束"⇒ 以 `],`／`])`／`], //` 收尾的列表**永不终止**⇒ 扫描越界把别的键配给一个被遍历的列表）⇒ 按**括号深度**终止后**回到 3/115**，`vmu.paper.retentionMs` **从来不是"未判定"**。（**机制层解释归其报告；我未复算该算法**。）

### 0.3b ★★ R34 真机臂：**我第一手读 spill 复核**（★ 把上一版的 N10「不是第一手」变成第一手）

**我做的**：直接读宿主 spill 文件并 `JSON.parse`（探针 `D:\_tmp\r34-accept\probe-spill-firsthand.mjs` ＋ `…-resolve.mjs`），**不是采信报告**。

| 项 | 我的读数 |
|---|---|
| **读的是哪一份** | `C:\Users\admin\AppData\Local\Temp\1\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`；**182,374 字节／182,159 字符**；mtime **2026-10-15T15:25:18Z（＝23:25:18 本地）**；**sha256[0:16] `1A64C62814662CEF`**（★ 报告里那串 sha256[0:16] 是同一份的可能证据：**我报的是我算的**） |
| **★ 升档判据 ①：`truncated:true` 在真机出现** | `JSON.parse` **成功**；`doc.receiptMeta = {"truncated":true,"elided":[{"path":"settings.resolved.vmu.turn.instituteName.value","from":2000,"to":14000,"bytes":12000}],"hostElision":"possible","originalBytes":193684,"note":"string leaves over 2000 were elided BY US to reach MAX_TOOL_RESULT_BYTES (12000)…"}` ⇒ ★ **真机发生**（**不再写"真机未发生"**） |
| **★ 升档判据 ②：`elided` 我独立复算** | `bytes === to − from` ⇒ **true**（12000 ＝ 14000−2000）；`to === 14000` ⇒ **true**（＝ overlay 里 `'ABCDEFGHIJ'×1400` 的长度）；保留值 `settings.resolved["vmu.turn.instituteName"].value` ⇒ **`slice(0,2000) === 'ABCDEFGHIJ'×200` ⇒ true**，`slice(2000) === "…[elided]"`（**9 字符**）⇒ **`from + 9 === 存储长度(2009)`** ⇒ ★ **"保留值＝原文前缀"成立**；`originalBytes(193684) ≥ to` ⇒ true |
| **★ 升档判据 ③：完整回执可 `JSON.parse` 且既有字段全在** | **37 个顶层键**；`settingsMerge`（13 键：`packs`／`applied`／`appliedPacks`／`errors`／`defaultsFolded`／`defaultsUnfolded`…）／`packReport`（含 **`idMap={"v5r":"v5r-core"}`**、`ok:true`）／`promptSection`（具名降级 `VMU_EXTERNAL_UNAVAILABLE` ＋ `reason` ＋ `stack`）／`faces`（13 键含 `registeredTools`=**53 名**、`publishedDetail`、`enabledGap:[]`、`enabledNotPublished`、`evaluations:2`）／`guards.registered`=**4 个守卫名** **全在** ✓；★ **`settingsUnenforced` 在子对象里**（`settings.settingsUnenforced = {types:[{type:'planned',count:111,reason:'no validator implemented…'}],declarations:[],note:'NEITHER silently accepted NOR wrongly refused…'}`）⇒ ★ **它在顶层是 ABSENT，我第一遍按顶层找＝"取不到"**（**又一次"先证明路径对"**，见 §5.9-1） |
| **★ 升档判据 ④：同一份回执里 `truncated:false` 的空态也在** | 同臂另有小结果（`pwsh` 面）带**同一套标记**（报告转述）；★ **空态我已在进程内 22/0 探针里证过**（臂①③） |
| **★ 保留考古（不删）** | R33 的两份 spill（`dsh-spill-ibIK47\session-1f0fd42c9643\{85b47c0514d5,7b6e9e92d225}-vibe_vmu_status.txt`，**179,826／182,303 字节**）：我**第一手** `JSON.parse` ⇒ **`receiptMeta` 两份都 ABSENT**、`elided` 为空 ⇒ ★ **反证"R33 那次必然无标记"**（与我的版本考古一致：那时 `receiptbounds.js` 还是 `B8FEF79B61F178F6`） |
| **★ 一条量具现场（新增）** | 我第一版脚本用 `text.includes('[...]')` ⇒ **报"YES"**，而全文 **只有 1 处** `[...]`（offset **182077**），**就在 `receiptMeta.note` 自己的文字里**（"A host-inserted `[...]` marker may ALSO appear"）⇒ ★ **子串探测又被同名文本骗了一次**（与 R33 的 `"truncated":0` 同族，见 §5.9-1(d)） |
| **★ 一条精度注解（新增）** | `elided[].path` 是**点分定位符**，而设置表的键**本身含点**（`vmu.turn.instituteName`）⇒ **朴素按 `.` 切分解析会失败**（我第一版就失败）；正确读法是**按已知对象形状寻址**。★ 同时 **`from` 是"保留的前缀长度"，不是存储串长度**（存储＝`from` ＋ 9 字符标记）⇒ 复核时别拿 `value.length === from` 判失败 |

### 0.3c ★★ R39：**我自己把 R34 的读数重算了一遍（9/9 PASS）** —— 不是采信任何报告

**背景**：`vmu-verify2` R35/R36 指出 **"保留值 ＝ 原文前缀"当时不可独立复算**（它认为**输入件不可得**：`D:\_tmp` 里 `ABCDEFGHIJ` 只出现 10 字符）；R36 交付了**可复算夹具**（`tests/vmu-elision-prefix-recomputable.test.mjs`），R37/R38 把它做成可复算。**我本轮自己独立走了一遍**（**探针**：`D:\_tmp\r39-accept\probe-r34-recompute.mjs`，**只读**两个文件）⇒ **9 passed / 0 failed，exit 0**：

| 我验的 | 读数（★ 我自己算的） |
|---|---|
| **规则真的在盘上**（不是事后编的） | `D:\_tmp\r163-B-overlay.yml` **16,104 B／37 行／sha256[0:16] `1D228FA3492BAC25`**；该标量在**第 17 行（行长 14,037）** ⇒ 解析出 **14,000 字符**、**逐字符 ≡ `'ABCDEFGHIJ'.repeat(1400)`**、**值 sha256[0:16] `9AB9D27F942BD37F`** ✓（★ 与 `vmu-verify2` 独立得到**同值**） |
| **回执留存字节 ＝ 原文前缀＋标记** | spill `…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`，**182,374 B／182,159 字符／sha256[0:16] `1A64C62814662CEF`**；`receiptMeta.truncated === true`；`elided[0] = {from:2000,to:14000,bytes:12000}`（`bytes === to−from`）；**存储长 2009 ＝ 2000 ＋ 标记 9**；★ **`kept.slice(0,2000) === 'ABCDEFGHIJ'.repeat(200)`（闭式）** ✓；★★ **`kept === 规则重建的原文.slice(0,2000) + "…[elided]"`（逐字符）** ✓ |
| **口径** | ★ 我做的是**用盘上规则重算已有回执**（**可复核**），**不是重跑真机** —— ★ **不改写 R34 报告"我没有重跑"的口径**；★ 因此本条使 R34 读数从"**其读数**"升为"**可独立复算**"，但**真机那一跑本身仍是它的** |
| ★ **我自己的仪器自错一次（如实记）** | 我第一版**假设** overlay 是**YAML 折行标量**、按"续行拼接"解析 ⇒ 得到 **14,444 字符**（把外层 mapping 文本一起吃进来）⇒ 三条断言红。**先打印结构（行号/行长）后**才看清：**该标量就在一行里（第 17 行，14,037 字符）** ⇒ 改用一次正则即得 14,000。★ 与 `vmu-verify2` R36 把"正则读不全"误判为"折行"**同族**（**两个方向都错在"先假定文件形状、再解析"**）⇒ **新纪律见 §5.9-20** |

### 0.4 ★★ "在飞写者污染读数"＋**R33 的新面**：读数必须说清「**哪一份 / 哪一版 / 哪一时刻**」

**(A) 在飞写者（R31 由 `vmu-assistant2` 发现；R32 我独立复现三次）**：同一批套件**一分钟内翻红翻绿**、**干净副本全绿** ⇒ 红来自**未提交中途态**；**写者隔离只防"写撞写"，没防住"写撞读"**。
**我在 R32 的三次现场（带哈希＋时刻）**：① `vmu-entry` 工作树（`host.js 1E70BFDB0D84EF18`）**EXIT=1**（`:151` `st.packs` undefined）vs **干净 HEAD 副本 150/0**；② `generate-wired-schema --check` 工作树 **DRIFT** vs 副本 **in sync**；③ **工作树自身在移动**（21:06 两条 → 21:10 四条 → **21:14 六条**）。
**★ R34 状态**：本轮 `git status` **0 行**（`8b680cb`，23:19 与 23:21 两次）⇒ **该问题本轮不成立**，读数直接取自 HEAD。

**(B) R33 的新面：宿主 spill／转录省略版**（见 §0.1 的 **M-7**）：**"我看见的那份不是全量"** —— 转录里那份 49,930 字符**带着 `[...]`**，**完整回执在 spill 文件里**（179,826／182,090）⇒ ★ **与 (A) 合为一条总纪律**：
> **读数必须说清"读的是哪一份、哪一版、哪一时刻"**（哪一份 artifact／哪个提交或哈希／哪个时刻）。★ (A) 是"文件在变"，(B) 是"载体被截"——**两者都会让同一句结论在两个时刻自相矛盾**。

**三条处置（Lead 指定）**：① 读数绑**文件哈希＋时刻**；② 写者**先落一个可引用的检查点**（提交，或把哈希写进报告）；③ **见红先排除在飞写者**（比 `worktree blob` vs `HEAD blob`），**再**改自己。

### 0.5 ★★ 三条最值钱的教训（(i)(ii) 来自 R33/R34；(iii) 来自 R35–R38）

| # | 教训 | 现场 |
|---|---|---|
| **(iii)** | ★★ **「不变红的守卫」的终局＝【变异没落地】＋「两方同向读数共享同一缺陷 ⇒ 一致不构成事实」** | ★ **终局**（`vmu-verify2` R36 三臂，副本制）：**只中和 STALE ⇒ 绿**（中和本身不放宽断言）；**清空【真表格行】(L312) 的第 8 格 ⇒ `exit=1`，两条档位断言 FAIL 并逐名点出 `vmu.turn.selfCheck`**；**改【散文行】(L257) ⇒ 绿** ⇒ ★ **R35 那次"清空档位格却不红"＝变异打错行**（锚点在散文行，**真行在 L312**）⇒ **审计当时"正确地绿"**，**不是守卫没牙**。★★ **假一致**：R35 时 `comms2` 与我**各自独立**得到"不红" —— **两方一致，却共享同一个错锚点** ⇒ ★ **纪律：报"两方一致"之前，先问这两份读数是否共享同一个（可能错的）前提** |
| ★ **三层递进（一条线，Lead 指定）** | **"变异打错行"（R27）→ "落地自检只答【文件变了吗】"（R36）→ "打印 ≠ 断言"（R38/39）** | R27：变异打在 `:323` 而非 `:349`（**位置**错）／R36：自检比的是**整文件文本**（`out.join('\n')` vs `snapshot.join('\n')`）⇒ 只回答"**文件变了吗**"，不回答"**被判定的那个格变了吗**"（★ 且"原地改数组再自比"＝**恒真**，本身就是一个不变红的守卫）／R38：自检脚本**打印**"第 8 格 X → Y"但**唯一被强制**的判据仍是整文件快照比较 ⇒ ★ **落地自检必须 target-addressed（对【目标】说话）且【被强制】—— 本轮(38)它仍非强制，具名保留（G0-i）** |
| **(i)** | **"真机是'有没有生效'的判据 —— 进程内绿不算数"** | R33：**179,826 字符的回执在真机上静默通过**，而**门禁全绿**（我的 22/0 探针、19/0 套件在**修复前**也会是"看不见"的——因为"没截"在那时**既不报错也不自述**）⇒ ★ 只有**真机面**才暴露"这套机制在这条路上根本没执行" |
| **(ii)** | ★★ **"旧数字可能是旧方法的产物"—— 本族第 5 次，且 ★【双向】成立：新数字也可能是新方法的产物** | 现场：R33 我据"未判定 **3 → 4**"判"判据更准"、Lead 据此裁"接受 **4/114**"；★ **R34 查明 `4/114` 是新方法的 bug**（终止判据 `/^\];?\s*$/` ⇒ 以 `],`／`])`／`], //` 收尾的列表**永不终止** ⇒ 越界配对）⇒ 修后**回到 3/115**（★ 我 23:50 在 `8431f6d` 复测：`up to date (1108 wired, 3 undetermined, 115 …)`；**机制层解释归 `vmu-comms2`，我未复算该算法**）。★ **本项目的新口头禅**：**「逐字复刻一条已知会漏的规则 ＝ 用一致性换真相」**（R33）＋ ★ **「数字变了 ⇒ 采纳前必须先给【机制层解释】（哪一行、什么规则、为何改变）」**（R34 立，**顺序应当是"先给机制、再改数字"**） |

---

### 0.6 ★★ 「保留值是原文前缀」的**可推范围：三层**（照 `vmu-pack2` 报告 §9 原文落；★ **三处同形可对账**）

> ★ **来源与署名**：`_handoff/vmu/pack-round37-report.md` **§9「可引用总账句」**（该报告自陈**本轮零仓内改动**、未碰 `docs/**`）。★ **我未改一字语义**，只做版式；★ **两个可核的数字**我另在 §0.3c **独立复算过**（规则 14,000 逐字符／回执前缀 9/9）。

| 层 | 状态 | 证据／读数 |
|---|---|---|
| **(1) 规则被保留 ⇒ 可逐字符重算** | ✅ **已测** | `tests/vmu-elision-prefix-recomputable.test.mjs` **13/0**（**我本轮实跑**），含 **B3**：由 `'ABCDEFGHIJ' × 1400` **重建原文**，再逐字符验 `rebuilt.slice(0, from) + 标记 === 回执里的值`（并重算 `keptHash`／`origHash`，B5/B6）⇒ ★ **我另做了一遍 = 9/9**（§0.3c） |
| **(2) 任意真实内容 ⇒ 【声明】不是证明** | ⚠ **边界（诚实）** | 哈希**单向** ⇒ `keptHash`／`origHash` 提供 **篡改可发现 ＋ 一致性**，**不提供前缀性**；★ **分段哈希链【也不给前缀证明】**：对**未留存字节**的哈希主张，其强度与现有 `keptHash` **相同**、**只把粒度变细**（能定位篡改段、能按段增量校验）⇒ ★ **这是【结构性论证】，不是实测**（见 `docs/21 §20.9`）；★ 并具名一条实现坑：`from` **一般不落在块边界**，坚持做须把保留长度**向下取整到块边界** ⇒ 那是**既有省略行为的语义变更** |
| **(3) 回执外耐久副本 ＋ 取件键** | ⏳ **具名留存、未排期** | 形态：把原文留在**回执之外**的耐久存储，省略记录只放**可复核的取件键**（如 `origRef`＋`origHash`）⇒ ✅ 回执仍小（不破坏 `MAX_TOOL_RESULT_BYTES`）／✅ 前缀性对**有取件权限者**真可算；⚠ **四项代价**：**耐久写面**（`kernel/**` 的写路径）＋**保留策略**（多留、何时清）＋**访问规则**（谁能取）＋**取不到时的具名失败语义**（回执必须说"取不到"，不许静默）；★ **且它本身也只是"副本可达时可推"，不是普遍可推** |

★ **Lead 的裁定（不排期，含理由）**：★ 它是**新能力**，而**七条目标里没有"任意内容的前缀性必须可独立复核"**；★ **成本面大**（上面四项）；★ 且**它自己也不是普遍可推** ⇒ **为一条没有目标要求的性质引入一条新的耐久写路径，不划算**。★ **将来若有人要 ⇒ 按【独立契约变更】走**（字段＋文档＋全部消费者＋保留策略＋失败语义）。
★ **纪律（R38 立）**：**拒绝一项机制，要给"它为什么买不到目标性质"的结构性理由**（不是"麻烦／超范围"），并**把"能买到的"与"买不到的"分列**（`keptHash`＝篡改可发现；前缀性＝**只有规则或原文**）—— ★ **且必须标明"这是论证，不是实测"**。
★ **同形三处（可对账）**：**(1)** 报告 §4（测试 13/0 已测）／**(2)** `docs/21 §20.9`（任意内容仍是声明）／**(3)** 报告 §9（耐久副本＋取件键＝具名留存、未排期）。★ **三处措辞一致：没有任何一处把"对保留规则的场景可算"写成"普遍可算"**。

---

## 1. 本轮的"实跑"清单（★ 工作树干净 ⇒ 除注明外**直接取自工作树 ＝ HEAD `a3bde6a`**）

> **T1 全量按 task-164 明令归 Lead，我未跑**；未 `regen-all`；未做任何 git 写（只读 `git log/status/cat-file`）。

| # | 命令 | 读数 | exit |
|---|---|---|---|
| 1 | `node D:\_tmp\r34-accept\probe-receipt-bounds.mjs`（**我写的探针**，4 臂 22 条） | `=== VMU-ACCEPT RECEIPT-BOUNDS PROBE: 22 passed, 0 failed ===` | 0 |
| 2 | `node tests/vmu-receipt-truncation.test.mjs` | `=== VMU RECEIPT TRUNCATION: 19 passed, 0 failed ===` | 0 |
| 3 | `node tests/vmu-entry.test.mjs` | `=== VMU ENTRY: 150 passed, 0 failed ===`（★ 含 `st.packs`） | 0 |
| 4 | `node tests/vmu-host.test.mjs` | `=== VMU HOST: 107 passed, 0 failed ===` | 0 |
| 5 | `node tests/vmu-host-hooks.test.mjs` | `=== VMU HOST HOOKS: 22 passed, 0 failed ===` | 0 |
| 6 | `node tests/vmu-packs-active-switch.test.mjs` | `=== VMU PACKS ACTIVE SWITCH: 24 passed, 0 failed ===` | 0 |
| 7 | `node tests/vmu-pack-defaults-named.test.mjs` | `=== VMU PACK DEFAULTS NAMED: 36 passed, 0 failed ===` | 0 |
| 8 | `node tests/vmu-meeting-domain.test.mjs` | `=== VMU MEETING DOMAIN: 10 passed, 0 failed ===` | 0 |
| 9 | `node tests/vmu-settings-domain.test.mjs` | `=== VMU SETTINGS DOMAIN: 48 passed, 0 failed ===` | 0 |
| 10 | `node tests/audit-code-size.test.mjs` | `=== CODE SIZE: 9 passed, 0 failed ===`（`host.js` 1151/1200） | 0 |
| 11 | `node tests/audit-status-report-fields.mjs` | `=== STATUS FIELD TABLE: 19 passed, 0 failed ===` | 0 |
| 12 | `node tests/audit-vmu-docs.test.mjs` | `=== VMU DOCS AUDIT: 103 passed, 0 failed ===`（★ R32 我读到的是 99/0 ⇒ **§11 第三档纳入判据后 +4**） | 0 |
| 13 | `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 29 passed, 0 failed ===` | 0 |
| 14 | `node tests/vmu-planned-settings.test.mjs` | `=== VMU PLANNED SETTINGS: ALL GREEN (planned=111, docs=28, passed=39, failed=0) ===` | 0 |
| 15 | `node tests/vmu-kernel.test.mjs` | `=== VMU KERNEL: 175 passed, 0 failed ===` | 0 |
| 16 | `node tests/vmu-pack.test.mjs` | `=== VMU PACK: 53 passed, 0 failed ===` | 0 |
| 17 | `node tests/vmu-meetings.test.mjs` | `=== VMU MEETINGS: 163 passed, 0 failed ===` | 0 |
| 18 | `node tests/audit-declaration-criterion.test.mjs` | `88 passed, 0 failed`；**`RULE E fingerprints: current=67 baseline=67`**；**`RULE E multi-line C: files=57 baseline=57`** | 0 |
| 19 | `node scripts/generate-vmu-settings-table.mjs --check`（**23:20 在 `8b680cb` 上＝我的旧读数**） | `vmu settings table: up to date (1226 keys (1108 wired, **4 undetermined**, 114 declared-but-not-wired))` —— ★ **该 4/114 已被 R34 作废**（新方法 bug；见 §0.3） | 0 |
| 19b | ★ **收轮后**：`node scripts/generate-vmu-settings-table.mjs --check`（**23:50，`8431f6d` 干净树**） | `up to date (1226 keys (1108 wired, **3 undetermined**, 115 declared-but-not-wired))` ⇒ ★ **与 Lead 转述的 3/115 逐字相同** | 0 |
| 19c | ★ **收轮后（R35）**：`node tests/audit-vmu-docs.test.mjs`（`8431f6d`） | `=== VMU DOCS AUDIT: 103 passed, 0 failed ===` ⇒ ★ **与 Lead 转述的 103/0 逐字相同**（★ **T1 323/323 我未跑**） | 0 |
| ★ **R39-1** | `node D:\_tmp\r39-accept\probe-r34-recompute.mjs`（**我写的探针**：解析盘上 overlay 规则 ＋ 逐字符验回执前缀） | `=== VMU-ACCEPT R34-RECOMPUTE: 9 passed, 0 failed ===`（见 §0.3c） | 0 |
| ★ **R39-2** | `node tests/vmu-elision-prefix-recomputable.test.mjs` | `=== VMU ELISION PREFIX RECOMPUTABLE: 13 passed, 0 failed ===` | 0 |
| ★ **R39-3** | `node tests/vmu-applies-name-unified.test.mjs` | `=== VMU APPLIES NAME UNIFIED: 13 passed, 0 failed ===` | 0 |
| ★ **R39-4** | `node tests/vmu-receipt-truncation.test.mjs` | `=== VMU RECEIPT TRUNCATION: 19 passed, 0 failed ===` | 0 |
| ★ **R39-5** | `node tests/audit-vmu-docs.test.mjs` | `=== VMU DOCS AUDIT: 102 passed, 0 failed ===`（★ R37 删掉 1 条断言 ⇒ **103−1 算术自洽**） | 0 |
| ★ **R39-6** | `node tests/audit-kernel-index.test.mjs` ／ `node tests/audit-code-size.test.mjs` | `=== KERNEL INDEX: 6 passed, 0 failed ===` ／ `=== CODE SIZE: 9 passed, 0 failed ===`（`host.js` **1167 ≤ 1200**） | 0 |
| ★ **R39-7** | `node scripts/generate-vmu-settings-table.mjs --check` | `up to date (1226 keys (**1108 wired, 5 undetermined, 113 declared-but-not-wired**))` ⇒ **1108＋5＋113 ＝ 1226** ✓ | 0 |
| ★ **R39-8** | `node tests/vmu-planned-settings.test.mjs` ／ `node scripts/check-docs.mjs` | `ALL GREEN (planned=111, docs=28, passed=39, failed=0)` ／ `DOC LINT: PASS` | 0 |
| 20 | `node scripts/check-docs.mjs` | `DOC LINT: PASS` | 0 |
| 21 | `node tests/vmu-wiring-index.test.mjs`（**我计时**） | `=== VMU WIRING INDEX: ALL GREEN (volumes=30, passed=31, failed=0) ===`；**elapsed 109.5 s**（★ 修前 Lead 量 **236.8 s**；`c7950ce` 时 74.9 s） | 0 |
| 22 | `node tests/vmu-assistant-host-slice.test.mjs` | `=== VMU ASSISTANT HOST SLICE: 10 passed, 0 failed, 5 not-run ===` | 0 |
| 23 | `node tests/vmu-assistant-host-slice.test.mjs --require-host` | `10 passed, 1 failed, 5 not-run (--require-host)`；失败项＝`HOST SLICE REQUIRED BUT NOT RUN` | **1** |
| 24 | 版本考古：`git cat-file blob {c7950ce,8b680cb}:<5 files>` 逐字节 sha256 | **只有 `receiptbounds.js` 变了**（`B8FEF79B61F178F6` → `56285AC856E75DE4`）；其余四个**逐字节相同** | 0 |
| 25 | ★ **收轮后新增**：`node D:\_tmp\r34-accept\probe-spill-firsthand.mjs`（**读宿主 spill 并 `JSON.parse`**） | 最新 spill＝`…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`（**182,374 B／182,159 字符**，mtime 23:25:18，sha256[0:16] `1A64C62814662CEF`）；**`receiptMeta.truncated ＝ true`**；37 个顶层键，`settingsMerge`／`packReport`＋`idMap`／`promptSection`／`faces`／`guards.registered` **全在**；★ **R33 两份 spill 的 `receiptMeta` 均 ABSENT** | 0 |
| 26 | ★ **收轮后新增**：`node D:\_tmp\r34-accept\probe-spill-resolve.mjs`（**按真实对象形状寻址复算 `elided`**） | `bytes===to−from`（12000＝14000−2000）✓；`to===14000`✓；保留值 **`slice(0,2000)==='ABCDEFGHIJ'×200`**✓；`slice(2000)==="…[elided]"`（9 字符）⇒ **`from`＝保留前缀长度（存储长度＝`from`＋9）**；`originalBytes 193684 ≥ to`✓；★ `settings.settingsUnenforced`（**子对象**）＝`planned 111`＋reason＋`declarations:[]` | 0 |

**只读（未跑）**：`_handoff/vmu/pack-round3[567]-report.md`、`comms-round3[3-8]-report.md`、`assistant-round3[378]-report.md`、`verify-round3[568]-report.md`、`core-round29-report.md`、`04-parity-matrix.md` **§9.33–§9.39**（2011 行版）；以及**读码**（都标 file:line）。

---

## 2. 七条目标 · 四列总账

### 总表

| # | 目标 | ① 结论 | 一句话 |
|---|---|---|---|
| **0** | 已知问题修复 | **具备** | R32/R33 新闭 4 项；★ **R36–R38 又闭 5 项**（**"不变红的守卫"＝变异没落地**／落地自检改与 `snapshot` 比较／R37 旧两值断言收掉＋**最小数据流转档**／**第 4 次"任务前提被核查推翻"**／**R34 读数做成可复算**）；**新开 3 项**（`d.type===null⇒'object'` 兜底／**落地自检非 target-addressed**（G0-i）／**`export *`＋动态解构没核**（G0-j）） |
| **1** | 断点续跑 ＋ 人工干预 | **具备**（不变） | 读数沿用 R27：e2e **108/0**、锁/标记 **67/0**、人闸 **75/0**（**本轮未复跑**） |
| **2** | 代理通信／协作／会议（覆盖 v5r 全部功能） | **具备**（v5r 实现层 **14/14**，不变） | 本轮**我实跑** `vmu-meetings` **163/0**、`vmu-meeting-domain` **10/0** |
| **3** | 逐 v5r 代码梳理成 md ＋ 框架够强 | **具备**（不变） | 梳理 md 在树（373 KB ＋ 三分片）；F8–F53＝**41 具备／1 部分（刻意 fail-closed）／0 缺失** |
| **4** | vmu＋v5r pack 是否一致实现该 md | **具备（口径写清）＋ 具名边界** | 一致＝**能力进内核、策略进 pack**；`vmu.packs.active` 真开关**只对装载为真**；会议域"声明 ≡ 读取侧"**11/11**；★ **本轮新增**：`§11` 的**第三档「未判定」**（1108／**4**／114） |
| **5** | 数学引擎深度（四库 ＋ 作业持久化/断点续算） | **具备 ＋ 1 条真实边界**（**保持**） | 中间检查点仍未实现（`admission().resume.supported=false`；R9 改判条件未满足，升级清单**机读化**在起始行） |
| **6** | v5r pack 下主代理**真的**是助手 | **具备（机制层三段 ＋ 五条 ＋ R32/R33 三件）** | R23 三段（真机@R23）＋ R24–R26 三条（**其中 8 项已升档真机**）＋ R30/R31 执行点／`oneOf`（**已升档真机**）＋ **R32/R33**：**截断形状稳定**（★ **真机已生效**：R34 臂出现 `truncated:true`，我第一手复算）／**§11 第三档**／**九项升档** |

---

### 目标 0 · 已知问题修复

**① 结论：具备**（R32/R33 新增 4 项已闭；★ **R36–R38 又闭 5 项**；**新开 3 项**）。

**② 证据（R36–R38 新闭项）**

| # | 旧问题 | 现在的落点 | 我的读数／档位 |
|---|---|---|---|
| 5 | ★★ **"不变红的守卫"**（R35：清空 `docs/04 §11` 的档位格 ⇒ 该守卫**不红**） | ★ **终局＝变异没落地**：锚点命中**散文行 L257**，**真表格行在 L312** ⇒ **表格行从未被改 ⇒ 审计当时正确地绿**（★ R36 修好锚点后**两侧都红**） | **只读转述**（`vmu-verify2` R36 三臂，副本制）：**只中和 STALE ⇒ 绿**；**清空真行第 8 格 ⇒ `exit=1`** ＋ 两条档位断言 FAIL **逐名点出 `vmu.turn.selfCheck`**；**改散文行 ⇒ 绿**。★ 其两假设（"哪个 docs"／"第 8 格取法"）**被读码排除**（`:540 rows` 只看行首／`:38` 有 `VMU_DOCS_DIR` 注入根）⇒ ★ **R35 的假一致见 §0.5-(iii)** |
| 6 | ★ **落地自检的判据强度**（只回答"**文件变了吗**"） | R36 改成与 **`snapshot`** 比较（原地改数组再自比＝**恒真**）；★ **但 R38 收口时它仍【非 target-addressed】**：脚本**打印**"第 8 格 X → Y"，**唯一被强制**的判据仍是整文件快照比较 | **只读转述**（§9.39.6）：其 `counter-r36.mjs` **L42 注释**要求"prove the cell changed"，**L49/L51** 取 `before8`/`after8`、**L52 打印**，**但没做成断言** ⇒ ★ **具名保留（G0-i）**；★ 正向：**L47 锚点已绑定"第 8 格含 `❓ 未判定` 的真行"** ⇒ R36 起**变异确实落在真行上** |
| 7 | ★ **R37：旧两值文案断言与最小数据流转档** | ① 收掉**旧两值文案断言**（`no silent promises` 恰 **2 处＝1 断言(L556)＋1 注释(L548)**）；② **最小数据流转档**：判别＝**①该键在某行被读取并绑定**（`const X = … sget('KEY')`）**且 ②同文件内对该绑定名做遍历或成员判定** | ① **只读转述**：`audit-vmu-docs` **102/0 ＝ 103−1**（与"删掉 1 条断言"**算术自洽**）——★ **我本轮实跑 102/0** ✓。② ★ **我实跑** `--check` ⇒ **`1108 / 5 / 113`**（＝3 旧 ＋ **2 新**：`vmu.turn.objective`／`vmu.turn.instituteName`）⇒ ★ **这正是 N9／G0-g 的闭合**（那两行**从"未接线"改判"未判定"**，且**仍是结论不是逃生门**） |
| 8 | ★ **第 4 次「任务前提被核查推翻」** | `comms2` **先核三件**（`verdictOf` 三值？／行只渲染两档？／表体档位）⇒ **结论从"要改生成器"变成"无需改、也不需要 `--write`"** | **只读转述＋我的独立读数同向**：`--check` **up to date（1108／5／113）**、`audit-vmu-docs` **102/0**（我实跑）⇒ **两方确认** |
| 9 | ★ **R34 读数"可复算"** | ① 收掉"输入件不可得"：**规则就在盘上**（`D:\_tmp\r163-B-overlay.yml` 第 17 行，14,000 字符 ≡ `'ABCDEFGHIJ'×1400`）；② 用它**逐字符**验回执前缀 | ★★ **我自己做了 9/9 PASS**（§0.3c）——★ **不是采信**；★ 其口径**逐字写着"我没有重跑真机"**（★ **没有把"可复核"写成"已重跑"**，我保持同一口径） |

**②′ 证据（R32/R33 的 4 项，沿上一版保留）**

| # | 旧问题 | 现在的落点 | 我的读数／档位 |
|---|---|---|---|
| 1 | ★ **截断自伤回归**（R32 第一版**用封套替换整个回执** ⇒ `vmu-entry:151` `st.packs` undefined／`vmu-host` 崩溃／`packs-active-switch` 5/19／`defaults-named` 崩） | ★ **已改成"结构内、路径级"省略**：只缩短**超大字符串叶子**、**不动键、不动数组长度**；`elided:[{path,from,to,bytes}]`；★ **R33 再加固为 `receiptMeta` 五键两态恒存在**（`truncated`／`elided`／`hostElision`／`originalBytes`／`note`，**状态用值表达**） | ★ **我实跑 22/0 探针**（§0.3）：超预算时 `packs`／`faces` **仍可读且未变**、数组长度不变、`elided` 每条可核；四个曾红的套件**全绿**（150/0／107/0／24/0／36/0）；★ **归因靠副本消融**（只读转述）：把 `execute` 那次调用在**副本**里退回 `JSON.stringify(await spec.run(…))` ⇒ 四个套件**全部转绿** |
| 2 | ★ **生成器"看不见＝没人读"的假过滤**（`isDeclarationLine` 把"行首是带引号的 `vmu.*` 键"整行丢掉 ⇒ `kernel/meetingmarker.js:232` 的 **`'vmu.meetings.minutesDetail': K.minutesDetail`**（**真读**）被当成声明） | 加**读形状例外** `READ_SHAPE`（`K.<field>`／`sget(`／`.get(`／`readKey(`／`settings[`／`settingsView(`／`sgetValue(`）⇒ **会读的行就不是声明，无论它以什么开头**；★ **纯声明仍被过滤**（判据仍有牙） | **只读转述**：计数器 `1106/120 → 1108/118`（+2）；★ **我实跑** `vmu-planned-settings` ALL GREEN、`audit-vmu-docs` **103/0**、`generate-vmu-settings-table --check` **up to date**。★ **判因靠"修完还有没有 drift"**（§6 同形投影那一课） |
| 3 | ★ **生成器性能回归**（`generate-wiring-index.mjs:124` **把 settings-table 当自己的 check 去跑** ⇒ 单次变慢被 spawn **放大两次** ⇒ `tests/vmu-wiring-index.test.mjs` 整套 **236.8 s > 180 s 预算**） | 索引只建一次：模块加载时单遍扫描（`LIST_INDEX`／`LINES_OF` 记忆化）⇒ `listIterationEvidence` 变 **O(1) 查表**；★ **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（**修负载，不修预算**） | ★ **我独立计时**：`vmu-wiring-index` **ALL GREEN（volumes=30, passed=31, failed=0），elapsed 109.5 s** ⇒ **回到预算内**。（Lead 的 236.8 s／74.9 s 为**转述**；109.5 s 是**我的**） |
| 4 | ★ **审计的两值假设 ＋ 它的第二个真洞**（第三档落地后：`trulyUnwired = filter(d => !hasConsumer(d.key))` ＋ `lyingUnwired = claimedUnwired − trulyUnwired` ⇒ **那 3 个"未判定"键没有字面量读者 ⇒ 落在 `trulyUnwired` ⇒ 某行把"未判定"断言成 `⚠️ 未接线` 这条审计会放行** —— 恰好放行了第三档存在的目的所要拦的断言） | **真值三值化**（**直接取生成器自己的 `verdictOf`**，"one rule, one place"）＋ `lyingWired`／`lyingUnwired`（**含"判据无法决定却断言没消费者"**）／`lyingUndetermined`（**第三档是结论，不是逃生门**）＋ 三档 **partition**（`wired+undetermined+unwired === 1226`）；生成器**导出**三档词表以免审计自带第二份 | **我实跑** `audit-vmu-docs` **103/0 exit 0**（R32 时 99/0 ⇒ **+4**） |

**③ 具名缺口**
| id | 缺什么 | 改判条件 | owner |
|---|---|---|---|
| **G0-a** | **生成器 `d.type === null ⇒ 'object'` 兜底仍在**（"推断不出来就悄悄当 object"） | 改成**具名清单＋报告点名**：判据＝**给一个推断不出的 `def` ⇒ 必须有名字**（与"`planned` 不执法但具名"同一条纪律）。★ **R32 的在飞件 `tests/generate-wired-schema-fallback.test.mjs` 我上一轮看到过**，但**本轮 `git status` 干净** ⇒ 我不声称它已落 | `vmu-comms2`／Lead 派单 |
| **G0-b** | **`settingsUnenforced.declarations` 以实时读数为准**：`vmu-verify2` R30 侧 **13 键**（b1 `null` 默认 10／b2 数字默认被标 `object` 2／b3 `positiveInteger` 默认 `0` 1）vs `vmu-assistant2` 在 `c12556e` 实测 **0**；★ **R33 真机臂**实测 `declarations:[]` ＋ `planned 111` 带 reason | 口径不同（被豁免者清单 vs 修复后实测）⇒ **以 `unenforcedReport()` 实时读数为准**；任何交付物写"13→2"这类数字**必须以当时实测为准** ⇒ **我不采信任何一方为准，只记分歧与口径** | `vmu-comms2`＋引用者 |
| **G0-c** | **"声明与自己的默认值矛盾"这一类**（`type:'stringList'` 默认 `null`／`object` 默认数字／`positiveInteger` 默认 `0`） | 处置＝**逐键修声明或改默认值**，**不要长期靠豁免**；b1 建议裁 **`null` ＝"未设"哨兵**（裁了就少 10 键豁免）／b2 归生成器属主／b3 归手写行 | Lead 定序＋生成器／手写行属主 |
| **G0-d** | 三处 `fired ⊆ enforced` 在**回执不带 `fired[]`** 时仍"空集上为真"（牙齿在**自探针**上） | 需要一个**真的会带 `fired[]`** 的回执面 | 验证侧 |
| **G0-e** | 豁免表 `reviewRound` 到期**只计数不判红** | Lead 裁：升级为红 或 保持可见计数 | **Lead** |
| **G0-f** | **宿主 spill／转录省略**（M-7）与**在飞写者**共同造成的"读数说错载体/版本"没有机制拦截 | ★ 三条处置升为纪律（§0.4）＋ Lead 已裁"反例器**副本制**"（**R33 各处已执行**：真树 hash 判据 `NEVER WRITTEN=true`）；★ **R33 仍自曝一处**：其反例汇总正则**只读 stdout**，而计数印在 **stderr**（STALE 提示）⇒ 汇总打印 `MUTANT : null`（**证据在输出里可见，是汇总脚本的瑕疵**） | Lead／验证侧 |
| **G0-g** | ✅ **已闭合（R37/R38）**：R33 的"7 行没核" → R34 **已核 7 行**；★ **剩 2 行**（`vmu.turn.objective`／`vmu.turn.instituteName`）**在 R37 由【最小数据流转档】判为 `❓ 未判定`** ⇒ ★ **不再是"没核"**（我实测表计数 **1108／5／113**，**5 ＝ 3 旧 ＋ 2 新**）。★ **残留覆盖范围声明**（其自陈，我保留）：跨文件只覆盖 **`import { … } from` 具名导入** ⇒ **`export * from`（名字不可知面）／`import * as`／默认导入／动态 `import()` 的解构形态（`const { NAME } = await import(…)`）未覆盖** | 覆盖面的补齐＝**可选下一轮**；★ **"没核"不许被读者误读成"猜它没消费者"** | `vmu-comms2`（可选） |
| **G0-i** | ★ **落地自检仍【非 target-addressed（就"强制"而言）】**：它**打印**目标格的 before/after，但**唯一被强制的判据仍是"整文件文本变了吗"** | **建议**（R37/R38 已给，未落）：把 **`before8 === after8` 做成 throw／断言**（★ 我**未改他人测试**）；★ **改完后必须能给"改散文行 ⇒ 红"这条反例** | 反例器属主（`vmu-verify2`／`vmu-comms2`） |
| **G0-j** | ★ **`export * from` 的名字不可知面**（只被标 `starReexport`，仍写"没核"）＋ **动态 `import()` 的解构形态未覆盖** | 判据增强：按**导入图**去"谁 import 了这个名字并在那里遍历它"，但**`export *` 的名字集合静态不可知** ⇒ 要么**枚举运行时导出**、要么**具名其不可知** | `vmu-comms2`（可选） |
| **G0-h** | ✅ **已闭合（R34）**：R33 的"半个证据"—— 反例**先中和副本里的 STALE 子检查**（只在副本里注释掉那条 `process.exit(1)`），再清空某行档位格 ⇒ **红只可能来自审计自己的断言** | 读数（**只读转述**）：`exit=1` ＋ `FAIL no key is claimed UNDETERMINED unless the criterion really cannot decide it (the third tier is a finding, not an escape hatch) [vmu.paper.retentionMs]` ⇒ ★ **红在被测断言上、并逐名点出那个键**；真树 hash 前后一致 | — |

**④ 复核方式**：**实跑** §1 的 #1–#13、**#R39-1…#R39-8**（★ 含**我自己的 22 条收据探针**与**9/9 的 R34 复算探针**）；**只读** `pack-round32/33/36/37`、`comms-round33/34/36/37/38`、`assistant-round33/37/38`、`verify-round35/36/38` 报告 ＋ 矩阵 §9.30–§9.39；**读码** `kernel/receiptbounds.js`、`host.js` 的调用点与再导出、`scripts/generate-vmu-settings-table.mjs`（`READ_SHAPE`／`listIterationEvidence`／`verdictOf`）、`tests/audit-vmu-docs.test.mjs`（`:540 rows`／`:553 tierCellOf`／`:556`＋`:562` 两条断言）。

---

### 目标 1 · 断点续跑 ＋ 人工干预

**① 结论：具备**（**本轮未复跑**，读数沿用 R27；R27–R33 未改动本目标机制）。

**② 证据**：`06-goal1-verdict.md` §0/§2 表 A/§3/§5（**只读**）＋ `12-goal1-e2e.md`（**只读**）。**R27 我实跑**：`vmu-resume-e2e` **108/0**、`vmu-resume-lock-and-marks` **67/0**、`vmu-human-gate` **75/0**。**A20「未 ack 邮件计数」＝已闭**（**读码**）：`kernel/resume.js` 在没有端口时**直接读耐久键**（`store.read('mailbox')`）⇒ `{attached:true, source:'durable-mailbox-key', pending:N}`；断言在 `tests/vmu-resume-lock-and-marks.test.mjs:318-320`。★ 06 §5 的改判条件写的是"接线后 `status().ports.mailbox===true`"；实测**生产装配没接端口**，而是走了**另一条等价路** ⇒ **我没有**把"端口接了"写成事实。

**③ 具名缺口**：**G1-a** A19 重启自动重派＝装配策略（引擎只**对账并具名** `missingChildren`）／**G1-b** A21 看门狗＝**N/A（有理由）**／**G1-c** 多实例 face 投影缺**实例注册表**／**G1-d** 审批台账缺**跨 generation** 长期历史／**G1-e** B9 人工收件箱聚合缺（当前替代＝审批队列）。

**④ 复核方式**：**只读** `06-goal1-verdict.md`、`12-goal1-e2e.md`；三套件读数标**沿用 R27**（**本轮没有重跑**）。

---

### 目标 2 · 代理通信／协作／会议（覆盖 v5r 全部功能）

**① 结论：具备** —— 对 **v5r 代码里真实存在**的功能 **14/14**；对 **v5r 设计文档**的 42 条目录则**否**（**而 v5r 自己也不满足**）。

**② 证据**：`08-goal2-verdict.md` §0/§4-A/§4-B/§4-C（**只读**）。**本轮我实跑**：`vmu-meetings` **163/0**、`vmu-meeting-domain` **10/0**（会议域"声明 ≡ 读取侧"11/11 的不变量）。**R27 实跑**：`vmu-ab-v5r-meetings` **122/0**（`EQUAL 5／PROPERTY 12／DIVERGENT 4`，四条 DIVERGENT 逐条点名且都是**设计选择**：D3 无议程可开会／G3j 记录必填字段由声明决定／G4i 法庭式裁定 vs 布尔表决／G5j 模型路由属宿主）／`vmu-meeting-parity` **206/0**／`vmu-meeting-order` **60/0**／`vmu-conference` **72/0**／`vmu-ab-v5r-verification`（86%／**27% 反向口径**／通告族 6/6 逐字）。
**旧缺口已被实现超越（读码）**：G1 私聊补记已闭（`kernel/chat.js` 的 `supplement()`／`supplementOf()`）；G4 议程／流程／点名／请假部分已闭（`tools/meeting.js` 的 action 含 `flow`／`overrideorder`／`hands`／`agendaitems`／`agendaclose`／`leaverequest(s)`／`leaveapprove`／`invitedspeak`）；G5 会议级静默**存在**（`kernel/meetings.js` 的 `warn/mute/expel` 升级为 `'muted'`）。

**③ 具名缺口**（搜索范围与模式：`vibe-math-vmu/{kernel,tools,packs}/**/*.js`，模式 `challenge|rollcall|roll_call|vote_window|materialSubmit|materialsRequired` —— **R16 实搜过**；R24／R27／R32／R34 **均未复搜** ⇒ **只读沿用**）：**G2-a** `challenge`/`answer` 0 命中／**G2-b** `roll_call`／`vote_window` 0 命中／**G2-c** 无 `material_submit` action／**G2-d** 宿主分配型 durable store（跨进程耐久的**前提**）仍缺／**G2-e** 无名册接缝时自我发信"不判"／**G2-f** 会期任务板 `origin`／`claim_pending`／**G2-g** `invite` 的正文/timebox。**★ 框定一句：以上没有一条是"v5r 有而 vmu 没有"。**

**④ 复核方式**：**实跑** §1 的 #8/#17；**只读** `08-goal2-verdict.md`、`v5r-inventory-c.md §⑦-A`（经 08 转述）；**读码** `tools/meeting.js`、`kernel/chat.js`、`kernel/meetings.js`。

---

### 目标 3 · 逐 v5r 代码梳理成 md ＋ 框架是否够强

**① 结论：具备**（R27–R33 未改动本目标）。

**② 证据**：**只读**（目录列举：`03-v5r-full-inventory.md` 373 110 B ＋ 三分片 100 359／151 114／117 126 B）；终判 `10-goal3-final.md` §0（**F8–F53＝41 具备／1 部分／0 缺失**；唯一"部分"＝F13 `tools.restrict` 未注册名**刻意 fail-closed**）＋ §1.1（4 条旧"真缺口"已闭合）＋ §3（5 处具名残余）。★ 矩阵 §0.2 **具名**：合并本自"分片 A"起**UTF-8 二次编码损坏** ⇒ 矩阵以**三分片原文**为同一来源（**已知瑕疵，不是缺口**）。**本轮我实跑**：`vmu-kernel` **175/0**、`vmu-entry` **150/0**。

**③ 具名缺口**（均**不阻塞**"能否实现 v5r 功能"）：**G3-a** F13 的容错开关（刻意差异；改判条件＝加 `vmu.tools.onUnknown ∈ {refuse,skip}`，默认仍 refuse）／**G3-b** `meetingOpen` 域标记 **不存在**（R16 按语义关键词全仓搜，**命中 0**；**本轮未复搜**）／**G3-c** 宿主分配型 store／**G3-d** A19 重派＝策略、A21 看门狗＝N/A／**G3-e** 共享模块两处退避 sleep＝**具名豁免**。

**④ 复核方式**：**实跑** §1 的 #3/#15；**只读** `10-goal3-final.md` §0/§1.1/§3 与三份分片。

---

### 目标 4 · vmu＋v5r pack 是否**一致**实现该梳理 md 的全部机制

**① 结论：具备 —— 且本轮把"声明 ↔ 执法"的一致性从**会议域**扩到**整个设置表的第三档**。**

**② 证据**：`09-goal4-verdict.md` §0/§1.1/§3/§5、`11-pack-fidelity.md` §1–§4（**只读**）、矩阵 §9.3／§9.26.2／§9.31.3／§9.32.6（**只读**）。**本轮我实跑**：`vmu-pack` **53/0**／`vmu-pack-defaults-named` **36/0**／`vmu-planned-settings` **ALL GREEN（planned=111）**／`audit-package-membership` **29/0**／`audit-vmu-docs` **103/0**／`generate-vmu-settings-table --check` **up to date（1108 wired / 5 undetermined / 113 not-wired；`a3bde6a`，★ 我实跑：1108＋5＋113＝1226）**。
**旧缺口（沿用 R24/R27 复核）**：孤儿键 `vmu.meetings.reconsiderFloor` 键与清单值 **0 命中**（只剩 3 处注释）／**M-A04 `vmu.paper.maxRounds`＝已闭**／**`compactThreshold`/`compactAfterRounds`＝已闭**／**终稿 format/language/compilePdf＝已闭**。
**★ 具名边界（照旧，别写成"完全等价"）**：**设置键 `vmu.packs.active` 是真开关，但【只对"装载"】为真** —— 该 pack 的 `settings/defaults.json` **不随运行期装载折入** ⇒ 靠那些键声明的面/工具**不会发布**；已具名（`defaultsFolded`／`defaultsUnfolded:[{id,keys,reason}]`／`faces.notPublished:[{face,tool,reason}]`）。
**★ R33 新增的一条**：`docs/04 §11` 的设置表从此有**三档并列**（`✅ 已接线`／`❓ 未判定（消费者走动态读取，静态看不见）`／`⚠️ 未接线`），且**三档由同一条判据（生成器 `verdictOf`）决定**，审计**导出词表**而非自带第二份 ⇒ **"表 ↔ 判据"同源**。我实测树上＝**1108／5／113**。
**★★ R37/R38 新增的一条（第三档的判据被收紧）**：**`❓ 未判定` 不再是"可能被遍历"的宽松标记，而是【最小数据流转档】** —— 判据两半：**①该键在某行被【读取并绑定】**（`const X = … sget('KEY')` 或 `X: … sget('KEY')`）**且 ②同文件内对【该绑定名】做遍历或成员判定**（`X.map(`／`.X.map(`／`X.includes(`）。★ `vmu-verify2` **四臂反例**（副本制）：`P 对照 1108/5/113`；**只删 `.map(`（留 `.includes(`）⇒ 不变**（②任一形态即可）；**删净两处合格用法＋加一个无关 `.map(` ⇒ 回落到 `1108/3/115`**（★ **无关 `.map(` 不被采信**，这正是 R33"松遍历"的教训）；**打断绑定 ⇒ `1107/3/116`**（★ **① 是承重的**）。★ **行级确认**（1211）：`docs/04 §11` 共 **1226** 行、`1108 wired／5 undetermined／113 unwired／0 blank`，且 `vmu.turn.objective`／`vmu.turn.instituteName` 两行**确为 `❓ 未判定`**（第 3 个是既有的 `vmu.turn.selfCheck`）⇒ **5 ＝ 3 旧 ＋ 2 新** ✓（★ 我本轮**独立实测** `--check` ＝ 1108／5／113 且 `stale:false`）。

**③ 具名缺口**：**G4-a** `vmu.paper.finalizer` 域不含 `'academician'`（有意语义分歧；域外值已具名拒）／**G4-b** `maxTempPerMember`／`memberMayRejectAssign` 无对应键／**G4-c** 桶① 25 个接线候选键里 19 个"无承载者"（矩阵 §9.26.2）／**G4-d** 设置路线的 pack **摸不到"设置面"**（真机是否可观察**未测**）／**G4-e** "声明与自身默认值矛盾"的键（同 G0-c）／**G4-f** ★ **第三档剩 2 行"没核"**（同 G0-g；R34 已核 7 行）。

**④ 复核方式**：**实跑** §1 的 #6/#7/#9/#12/#13/#14/#16/#19；**只读** `09-goal4-verdict.md`、`11-pack-fidelity.md`、矩阵 §9.3／§9.26.2／§9.31.3／§9.32.6；**读码** `settings/schema.js`、`kernel/meetingdomain.js`、`scripts/generate-vmu-settings-table.mjs`（`isDeclarationLine` 的 `READ_SHAPE`／`listIterationEvidence`）。

---

### 目标 5 · 数学引擎深度（numpy/scipy/pandas/sympy ＋ 作业持久化/断点续算）

**① 结论：具备 ＋ 1 条真实边界（**保持**，R27–R33 未改动本目标）。

**② 证据**：`07-goal5-verdict.md` §0/§1–§3/§5（**只读**）；e2e `13-goal5-e2e.md`（`spawns=20, mirrors=13`；七态／六态）、`14-math-research-e2e.md`（18/18 步）——**只读**。**R27 我实跑**：`vmu-math-adapters` **21/0**／`vmu-mathjobs-persist` **21/0**／`vmu-lean.test.mjs` **ALL GREEN 13/0**（**本轮未复跑**）。**旧"部分"两条已闭（读码）**：Lean 面镜像＝`kernel/index.js` 注入 `fs: host`；F17＝`spawnHandle` 已传三面。

**③ 具名缺口**：**G5-a** **中间检查点未实现**：`kernel/mathjobs.js` 的 `admission().checkpointing` ＝ `'not-implemented: resumeFrom is CARRIED … never interpreted; segment/checkpoint semantics are the ENGINE\'s'`（`not-implemented` 前缀**由常驻断言守着**），**机读版**＝`admission().resume`（`supported:false`／`segmentSemantics:"the ENGINE's"`／`carriedNotInterpreted:[…]`／`whatTheKernelDoesNotDo:"it never reads, validates or advances the token…"`／**`changeCondition` 指向 `docs/15 §14.4`**）⇒ **R9 裁决的改判条件未满足** ⇒ **保持具名，不假装**。／**G5-b** 大结果内容寻址引用缺／**G5-c** 计算面**故意不做内容去重**／**G5-d** 共享模块两处退避 sleep 无句柄（具名豁免）。

**④ 复核方式**：**只读** `07-goal5-verdict.md`、`13-goal5-e2e.md`、`14-math-research-e2e.md`；**读码** `kernel/mathjobs.js` 的 `admission()`；§2 目标 5 的读数标**沿用 R27**。

---

### 目标 6 · v5r pack 下主代理是否**真的**是助手 ★ **R39 追加 R36–R38 三件**

**① 结论：具备 —— 分四层写：**
- **机制层三段**（R23，**真机**@R23）；
- **三条「回执↔事实」**（R24–R26，进程内 → ★ **R33 真机臂已复现 8 项 ⇒ 升档**）；
- **两条「执行点」**（R30/R31，进程内 → ★ **R33 真机臂已复现 ⇒ 升档**）；
- ★ **R32/R33 三件**：**截断形状稳定**（★ **真机已生效**：R34 臂 `session-ce7f04ec-…`（23:25:02，HEAD `8b680cb`）出现 `truncated:true`，我**第一手读 spill 复算**，§0.3b）／**§11 第三档「未判定」**／**九项升档为真机证据** —— 见 (D)(E)。
- ★★ **R36–R38 三件**：**①「保留值是原文前缀」的可推范围＝三层**（**测 / 声明 / 具名留存**，§0.6；★ **我独立复算 9/9**，§0.3c）／**②`appliesFrom === appliesAt` 两名字统一**（`vmu-applies-name-unified` **13/0**，我实跑）／**③`elided[]` 8 键形态只有代码读数**（R34 真机回执是 4 键 ⇒ G6-i，Lead 已裁不专门烧会话）。

**② 证据**

**(A) 机制层三段（R23；真机；档位＝当前树@R23）**

| 段 | 结论 | 证据（**带档位**） |
|---|---|---|
| **① 触发器会开火并送达** | ✅ | arm A（`session-99d2090d`，17:18:52，34 events，exit 0）／arm E（`session-6ca9fefd`，17:42:42，44 events／43 s／221,841 tokens，`turn/end: completed`） |
| **② 无人要求也会开火** | ✅ | arm E 同份 stdout 另有 `[vmu-report-sink] {"name":"turn-end-duty",…}`；★ 原始观测（R18 `session-7105ed8b`：剧本**去掉 `tick`**、`report/tick`＝0、stdout 恰一条 `turn-end-duty`、**0 条** `artifacts-threshold`）属**缺证档** |
| **③ 阈值型也自主开火** | ✅ | arm E：`{"name":"tool-results-met",…,"text":"【阈值·已达】tool-results=5 ≥ 1","drives":false}`；`report/tick` 调用 **0**；高位阈值 **0 条**；★ **单因子**：E 去掉那一行 `root:` 与 arm A **逐字节相同** ⇒ **因果**。根因链＝装配缺 `config.root` ⇒ `apply()` 具名拒 ⇒ 总线空 ⇒ 不订阅 ⇒ 无观察 ⇒ 阈值不可能开火；**加一行全通**；★ **R33 在真机上再观测一次**：E 臂 stdout 有 `turn-end-duty` ＋ **`tool-results-met`（`tool-results=3`）** |

**(B) 三条「回执↔事实」（R24–R26；★ R33 部分升档为真机）**：(甲) `out.packReport` 已落（`out.packs` 仍是内核真值）／(乙) 被拒 ⇒ **同帧** `settingsMerge.applied=false` ＋ `errors[{code:'VMU_ENGINE_UNAVAILABLE'}]` ＋ `packReport.ok=false`，**同时仍列 `settingsMerge.packs:["v5r"]`**／(丙) `registered − published = []`、`faces.evaluations=2`、`publishedDetail[].reason` 逐条在；R27 追加 `enabledGap`／`enabledNotPublished` 两方向具名。★ **R33 真机复核**（见 (D) ⑤）：E 臂 `"applied":[{"requestId":"v5r","manifestId":"v5r-core"}],"idMap":{"v5r":"v5r-core"},"errors":[],"ok":true`；A 臂 `"applied":[],"idMap":{},"errors":[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE",…}],"ok":false` **同帧** `settingsMerge{applied:false,packs:["v5r"]}` ✓

**(C) 两条「执行点」（R30/R31；★ R33 升档为真机）**：**甲** A 的**三个执行点**（`kernel/index.js` 的配置面 `screenSettings`／交互面 `validateValue`／pack 层 `resolveSettings`＝**它的第一个真调用者**）；**乙** `oneOf` 清零（抽到 `kernel/meetingdomain.js`）＋ 11 键域不变量。★ **R33 真机的原样读数（我转述，未跑真机）**：①① 交互面 `{"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"vmu.budget.onExceed: expected one of refuse | warn | pause","hint":"declared as enum"}`；①① 合法值 `{"ok":true,…,"appliesFrom":"next turn","source":"runtime"}`；①② 配置面（**取自 spill 的完整回执**）`"settingsRejected":[{"key":"vmu.budget.onExceed","value":"nonsense",…,"domain":["refuse","warn","pause"],"type":"enum","source":"config","default":"refuse"}]` ＋ 活值＝`refuse`；①③ pack 层 `"source":"pack:probe-domain"`、`layer:0`、活值＝`warn`、`settingsRejectedCount:2`；② `settingsUnenforced` 含 `planned 111` 带 reason、`declarations:[]`；③ `promptSection` 可读且 **E 与 A 逐字相同**（⇒ **与 pack 是否装载无关**）；④ `null` 不是域外值。

**(D) ★★ R32/R33 三件（含判档）**

| 项 | 结论 | 证据／档位 |
|---|---|---|
| **① 截断形状稳定（`receiptMeta` 五键两态）** | ✅ **已落** ⇒ ★★ **收轮后升档为真机证据（R34 臂）** | `kernel/receiptbounds.js`（108L，`56285AC856E75DE4`）：`receiptMeta:{truncated,elided,hostElision,originalBytes,note}` **恒存在**，**两态同形、状态用值表达**；★ **不改键、不改数组长度**；★ **`originalBytes` 恒为数字**（对上一版建议的 `null` 做了**具名偏离**）。★ **我实跑 22/0**（§0.3）：**超预算时 `packs`／`faces` 仍可读且未变**、`elided` 每条可核、无可截叶子时**不再沉默**。★★ **真机已发生**：**`session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`（23:25:02，exit 0，HEAD `8b680cb`，payload `receiptbounds.js 56285AC856E75DE4`）** 观测到 `receiptMeta.truncated:true` ＋ `elided:[{"path":"settings.resolved.vmu.turn.instituteName.value","from":2000,"to":14000,"bytes":12000}]` ＋ `originalBytes:193684`；★ **我第一手读 spill 复算**：`bytes===to−from`、`to===14000`、**保留值 `slice(0,2000) === 'ABCDEFGHIJ'×200`**、完整回执 `JSON.parse` 成功且 `settingsMerge`／`packReport`＋`idMap`／`promptSection`／`settingsUnenforced`／`faces.*` **全在**（§0.3b）。★ **历史保留（不抹）**：**R33 臂那一次自省略一次都没发生**（真机面 4,470 叶子／最长 378 ⇒ 无叶可截；且那次跑的是修复前字节 `B8FEF79B61F178F6`）⇒ **"那时未发生"与"现在生效"不矛盾** |
| **② §11 第三档「未判定」** | ✅ **已落入 `docs/04 §11`（进程内）＋ 已收口** | 格值＝`❓ 未判定（可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有）`，与两档并列；判别器 `listIterationEvidence(key)`＝**元素所属数组是否被遍历**（`for…of`／`.map|forEach|filter|some|reduce(`）＋ **R34 加了跨文件导入图**（`IMPORTERS`）。★ **原型期先踩两个"看似有牙"的假证据**（① 把注释当读 ⇒ `selfCheck` 一度被判已接线 ⇒ 加 `COMMENT_LINE`：**注释行永不算证据**；② 松遍历 ⇒ 会给一批键**臆造**动态读 ⇒ 收紧为"**必须是对持有该元素的那个数组的遍历**"）。★ **收口读数**：**Lead 已核（转述）**＝`--write` 后 **1108 / 3 / 115**、`audit-vmu-docs` **103/0**、**T1 323/323**、提交 **`8431f6d`**（★ 我**未跑 T1、未核提交**）；★ **我 23:50 在 `8431f6d` 上单门复测** `--check`＝**1108 / 3 / 115**、`audit-vmu-docs`＝**103/0**（**与 Lead 两个数逐字相同**） |
| **③ 九项升档为真机证据** | ✅（**他报"一致 9 项 ⇒ 升档；差异 2 条"**） | **我按他 §4 判档表复算**：明写"⇒ 升档"的 **7 行** ＋ "一致（但有字段名差异 **D2**）" **1 行** ＋ 差异 **1 行（⑥ 截断）** ⇒ ★ **该口径差已在 R35 收口时消解**（见 G6-h：**判据已定义，九项全部升档**）。★ **D2**＝`appliesFrom`（工具层）vs `appliesAt`（内核层）**同一语义两个名字** ⇒ ★ **R36/R37 已落**：`tests/vmu-applies-name-unified.test.mjs` **13/0**（**我本轮实跑**），两键**恒存在＋非空前置**，★ 当天反例（副本制）：**M1 12/1（红在 D2）**、**M2 11/2（红在 planned 那一例）**、`vmu-verify2` 自做 **6/7（红在 B1/B2/B3）** ⇒ ★ **可复用原理：能红的反例需要一个"两条路径会分叉"的输入**（普通 H1 键下"表里重算"与"取内核值"同值 ⇒ 只有 **refined-H2** 输入才分叉） |
| **④ 「保留值是原文前缀」的可推范围（R36–R38）** | ✅ **(1) 已测**；⚠ **(2) 边界【声明】**；⏳ **(3) 具名留存、未排期** | 见 **§0.6**（照 `vmu-pack2` §9 原文落）＋ ★ **我本轮独立复算 9/9**（§0.3c）；★ 其报告**逐字写着"我没有重跑真机"** ⇒ **没有把"可复核"写成"已重跑"** ✓。★ **回执字段的形态**：`receiptMeta` **5 键两态同形**（我 R34 已验 22/0）；★ **`elided[]` 在 R36 起是【8 键】**（`path,from,to,bytes,keptBytes,keptHash,origHash,hash`）—— ★ **R34 那条真机回执是【4 键形态】**（`path,from,to,bytes`）⇒ **8 键只有【代码读数】**（G6-j） |

**(E) 最值钱的教训** —— 见 §0.5：(i) **"真机是'有没有生效'的判据 —— 进程内绿不算数"**（179,826 字符回执在真机上**静默通过**，门禁全绿）；(ii) **"旧数字可能是旧方法的产物"**（未判定 **3→4** 是**配对方式**差异；**"逐字复刻一条已知会漏的规则＝用一致性换真相"** ⇒ 拒绝复刻旧配对）；★ **(iii)「不变红的守卫」的终局＝变异没落地 ＋「两方同向读数共享同一缺陷 ⇒ 一致不构成事实」**（R35 的假一致 → R36 修好后两侧都红）。

**(F) `--require-host` 的两档读数**：树上＝**10 passed／1 failed／5 not-run，EXIT=1**（**我本轮实跑**）；**真机 17/0**（R18，`session-6076da68`，15:17:20）——★ **档位＝缺证**（刷新前 `r18-home`，payload 不可回溯）⇒ "对那份 payload 成立"，**不是"当前树已过"**。

**(G) `systemPrompt`**：★ **宿主能力边界（不是缺陷）**，**单独记、不并档**；★ **R33 真机把它写进回执**：`"promptSection":{"registered":false,"code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt","reason":"cannot get property \"systemPrompt\" without inject","stack":"…"}` ⇒ **两臂（E 装载成功／A 被拒）逐字相同** ⇒ **与 pack 装载无关** ✓

**③ 具名缺口**
| id | 缺什么 | 改判条件 | owner |
|---|---|---|---|
| **G6-a** | **行为层未测**：机制层齐备 **≠**"模型会自发地*想*去汇报" | 需**另一类**实验（观测模型在无 duty 提示下的自发行为） | Lead（实验设计） |
| **G6-b** | **`--require-host` 的当前树真机读数缺失**（17/0 属缺证档；树上仍 `5 not-run`） | 一条 **payload 哈希已复核**的 `--require-host` ⇒ **`17 passed／0 failed／0 not-run，EXIT=0`** | Lead／assistant 面 |
| **G6-c** | ✅ **已闭合（收轮后升档）**：`receiptMeta` 契约 ＋ **"截断在真机生效"** —— R34 臂 **`session-ce7f04ec-…`（23:25:02，HEAD `8b680cb`）** 真机出现 `truncated:true`，且我**第一手复算** `elided`（§0.3b） | — | — |
| **G6-d** | ★ **R33 的 D2**：`appliesFrom` vs `appliesAt` 同一语义两个名字 | **独立契约变更**（两处名字都可能被消费者引用）⇒ 统一或具名并存 | `vmu-pack2`（自陈本轮未做、建议单开一项） |
| **G6-e** | ✅ **已闭合**：Lead R32 交办的复核清单（超预算时 `st.packs` 仍可读／`receiptMeta` 五键两态／`elided` 路径级可核／无可截叶子时不再沉默）—— **我本轮独立验证，22/0**（§0.3） | — | — |
| **G6-f** | **非对象结果拿不到 `receiptMeta`**（`run` 返回裸字符串/数字 ⇒ 子对象挂不上去） | **具名边界**（测试 D3 **断言**，不是假设）；若要覆盖需另立契约 | pack 面（具名） |
| **G6-g** | **`hostElision` 只在"我们确实截了"时随 `elided` 出现？** —— ★ 按 R33 契约它**恒为 `'possible'`**（五键之一）⇒ 该格**已不成立**（我 §0.3 实测：未超预算与"超预算但无叶可截"两态**都带** `hostElision:'possible'`） | — | — |
| **G6-h** | ✅ **R35 已给结论（判据＋九项逐项标注，九项全部升档）**：★ **判据（本文件采用）**：一项读数**升档为真机证据** ⟺ ① 它在**真机臂**上以**相同键／语义形状**复现；② 该臂的 **payload 已逐字节核过**（树已提交且干净、哈希＋时刻在场）；③ ⚠ **若复现时形状／语义有具名差异** ⇒ 标 **"升档（附具名差异 X）"**，**不**记"完全一致"；否则一律 **"待升档"**。★ 按此判据把 R33 的九项逐项标注（下表）⇒ **九项全部升档**（8 项＝**R33 臂**；**⑥ 截断＝R34 臂**），其中 **1 项带具名差异 D2** ⇒ ★ **原"7 行／1 行／1 行"的口径差就此消解**；★ **判据已定，后续真机臂直接套用** | — | — |
| **G6-i** | ★ **`elided[]` 的 8 键形态（含 `keptHash`／`origHash`／`keptBytes`／`hash`）只有【代码读数】** —— R34 那条真机回执是 **4 键**形态（`path,from,to,bytes`） | **真机确认**：R33/R34 的真机面**构造不出**可截形态（4,470 叶子／最长 378），R34 是**刻意**用 overlay 长字符串造出来的 ⇒ 若要覆盖 8 键，**需再构造一次真机臂**；★ **Lead 已裁定"不专门为它开销一次会话"** ⇒ 保持"代码读数"档位 | Lead（已裁） |
| **G6-j** | ★ **任意真实内容的前缀性仍是"声明"**（哈希不给前缀证明）＋ **耐久副本＋取件键（第三条路）未排期** | 见 §0.6：若将来要做 ⇒ **按独立契约变更走**（字段＋文档＋全部消费者＋保留策略＋失败语义）；★ **不做＋为什么**已是本轮结论 | Lead（已裁） |

**G6-h 的九项逐项标注（据上判据；★ 分项见 §2 目标 6 (B)(C)(D)）**

| # | 项 | 真机臂 | 我给的标注 |
|---|---|---|---|
| 1 | ①① 交互写面：域外值 ⇒ **具名拒**（点名键与值域） | R33 | **升档** |
| 2 | ①① 交互写面：**合法值 ⇒ 生效** | R33 | **升档（附具名差异 D2）**：工具层回执写 `appliesFrom`、内核层写 `appliesAt` ⇒ 同一语义两个名字（G6-d） |
| 3 | ①② 配置面：域外 ⇒ **记账＋声明默认留下** | R33 | **升档** |
| 4 | ①③ pack 层：**同样记账**（`source:'pack:…'`） | R33 | **升档** |
| 5 | ② `settingsRejected`／`Count`／`settingsUnenforced` **可读** | R33 | **升档**（★ 路径注意：`settingsUnenforced` 在 `settings.` **子对象**里，见 N10） |
| 6 | ③ `promptSection` 可读**且与 pack 是否装载无关**（E／A 逐字相同） | R33 | **升档** |
| 7 | ④ **`null` 不是域外值** | R33 | **升档** |
| 8 | ⑤ **D1 的 id 映射可机检**（被拒臂映射为空＋同帧仍列 `packs:["v5r"]`） | R33 | **升档** |
| 9 | ⑥ **超预算 ⇒ 自省略并自述** | **R34** | **升档**（隔了一轮：R33 那次＝差异/未发生；R34 臂四项验收全过 ⇒ 见 §2 (D)①、§0.3b） |

**④ 复核方式**：**实跑** §1 的 #1–#7/#9/#10/#22/#23（含**我自己的 22 条探针**）；**只读** `assistant-round33-report.md`（§0–§5）、`pack-round32/33-report.md`、`comms-round33-report.md`（§7–§12）、`assistant-round18-report.md`、`comms-round30/31-report.md`、矩阵 §9.30–§9.36；**读码** `kernel/receiptbounds.js`（全文）、`host.js` 的调用点与再导出、`kernel/index.js` 的执行点与回执字段。

---

## 3. ★ 未建立 / 未证 / 待解（**三分类**）

> **未建立**＝该机制／能力**在树上不存在或从未被观测到**；**未证**＝能力存在，但**没有当前树（或当前树真机）的读数**；**待解**＝**两个读数互相矛盾且未解释**。

### 3.1 未建立
| # | 事项 | 说明 |
|---|---|---|
| **U1** | **模型会自发地想汇报（行为层）** | ★ **R41 已测：未观察到**（真机；**三臂的自发汇报 0／0／0**）⇒ ★ **判定＝【仍未建立】**（★ **"没观察到" ≠ "不能"**；n=1/臂 ⇒ **提示性**；**单模型/单版本不外推**）。★ **三个证据等级必须分开，不许把 M 或 P 写成 S**：**M＝机制报的**（`[vmu-report-sink]`／`turn-end-duty`；★ **A 臂 2 行、B 臂 0 行 ⇒ A/B 对照证明那些"报"是机制打的**）／**P＝pack 提示词要求的**（`v5r-assistant.js:29-32`、`v5r-blocks-a.js:55` ⇒ ★ **A 臂里任何"报"都可能是 P**）／**S＝模型自发的**（★ **三臂 `vibe_vmu_report` 调用 0／0／0**；最终文本中 `汇报`／`报告`／`进度` **各 0**）。★ **什么读数会改变结论**：任一臂出现**无 duty、且无提示词要求**的 `vibe_vmu_report` 调用（>0），或最终文本出现**非模板化**的汇报段 ⇒ 转「已建立」；★ 要把 **P 与 S 彻底分开**，必须在**提示词干净的最小 preset** 下重跑 —— ★ **这一步【未做到】⇒ 已排 `task-185`**。★ **实验卫生（入册）**：**第一次尝试因【工作目录在工作区之外】被沙箱拒绝 ⇒ 设计没跑到目标条件 ⇒ 该次已作废**；★ **不得把"实验不成立"写成"模型不汇报"**。 |
| — | （**已建立，留档**）真 pack 下会话能起／装载证据／阈值自主开火 | R21 时三条都是"未建立"；R22 的 arm A ＋ R23 的 arm E 建立；★ **R33 在真机上再次观测**（E 臂 `turn-end-duty` ＋ `tool-results-met`） |

### 3.1bis ★ R39–R41 并入（判据与性能；差异指回 `comms-round39/40/41-report.md`，不重抄）

- **(a) 的绕过对照＝仍红** ⇒ ★ **(a) 是 (b) 的【前置＋消息精度】，不是唯一守卫**；★ **"判有牙必须附绕过对照"目前【只有 (b) 有】**（R39）。
- **"打印 ≠ 断言"三层递进**：**R27 打错行** → **R36 只答"文件变了吗"** → **R38/R39 打印 ≠ 断言**（R39 把两处 target-addressed 检查改成 `throw`，并用 **N1（真行但目标格未变）／N2（锚点落散文行）** 两个负对照证明**各自会当场炸**）。
- **R40 的性能前提被【自己的读数】否定**：文件级预筛让 `settings-table` 回基线（**5.73 → 4.91/4.92s**），而 `wiring-index` **几乎没动**（**7.54 → 7.46/7.37s**）⇒ "导入扫描是唯一剩余杠杆"**不成立**。
- ★★ **R41 的分段计时【又否定 R40 的归因】**：真机同会话 `--cpu-prof` ⇒ **父进程自身只有 0.71s，89%（6.84s）在 `spawnSync` 子进程**（(c) 渲染/写盘 ≈0）⇒ ★ **R40 那一步是"拿两次不同运行的数相减"（7.4 − 4.91）—— 正是"数字变了必须先给机制"要防的**；★ **仍 ≈1.75s 未定位**（`spawnSync` 6.84s vs 单独跑 5.09s：子进程启动／`encoding:'utf8'` 管道 IO／父进程 profiler 三者**未分离**）。
- ★ **纪律族现 ≥23 条**（★ **只指回差异、不重抄**）；**档位／三分类（未建立／未证／待解）照旧**。

### 3.2 未证（能力存在，但没有当前树（真机）读数）
| # | 事项 | 为什么未证 |
|---|---|---|
| **N1** | **跨机**（多机协作／跨机复核） | 从 R11 起具名；**从未**在两台机器上跑过 |
| **N2** | **`records` 跨进程** | 两进程 e2e 证的是 `mailbox`／`chat`／`mathjobs`／`lean`／`library`；**`records` 未单独验** |
| **N3** | **`panel` 跨进程** | 同上 |
| **N4** | **成员内核之间的 LLM 智能体性** | 框架给**通道与耐久**，**不给智能体**——**边界，不是缺陷** |
| **N5** | 目标 1 的 G1-c／G1-d／目标 2 的 G2-d／G3-c | 有机制设计但**无当前树真机读数** |
| **N6** | ✅ **已升档（收轮后）**：`receiptMeta` 契约 ＋ "截断在真机生效" —— **R34 臂 `session-ce7f04ec-…`（23:25:02，HEAD `8b680cb`）真机出现 `truncated:true`**；★ **仍是进程内的只剩**：**§11 第三档**与生成器侧读数（无真机需求） | 由 R34 臂**闭合**；不再列未证 | — |
| **N7** | ★ **设置路线 pack"摸不到设置面"在真机上是否可观察** | 只有进程内读数（G4-d） |
| **N8** | ★ **`settingsUnenforced.declarations` 的实时口径**：R30 侧 13（b1/b2/b3）vs `c12556e` 的 0 vs **R33 真机的 `[]`** | **口径不同**（被豁免者清单 vs 修复后实测）；**以 `unenforcedReport()` 实时读数为准**（G0-b） |
| **N9** | ✅ **已闭合（R37/R38）**：R34 已核 7 行；★ **剩 2 行**（`vmu.turn.objective`／`vmu.turn.instituteName`）**由【最小数据流转档】判为 `❓ 未判定`**（我实测 **1108／5／113**；**5 ＝ 3 旧 ＋ 2 新**）⇒ **不再是"没核"**；★ 残留：**`export * from`／动态解构未覆盖**（已单列为 **G0-j**） | 保留 7 行为「未接线（已核）」的结论；覆盖面补齐属**可选下一轮** |
| **N10** | ✅ **已第一手核对（收轮后）**：我**读了 R34 臂的 spill**（`…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`，**182,374 B／182,159 字符**，mtime **23:25:18 本地**，**sha256[0:16] `1A64C62814662CEF`**）并 `JSON.parse` ⇒ `truncated:true`、`elided` 我逐条复算、既有字段全在；★ **并读了 R33 的两份 spill**（179,826／182,303 B）⇒ `receiptMeta` **两份都 ABSENT**（反证"那时无标记"）。★ **残留（具名）**：`pwsh` 面那一份小结果我**未亲眼核**（仅报告转述） | 由我**第一手读文件**闭合（细节 §0.3b）；★ 仍属"**我读的是 spill 这份文本，不是会话本身**" |
| **N11** | ★ **读数路径的"顶层 vs 子对象"家族（≥2 次现场）**：我第一遍在**顶层**找 `settingsUnenforced` ⇒ **ABSENT（"取不到"）**，真值在 **`settings.settingsUnenforced`**（子对象）；★ 同族第二例＝`vmu-pack2` 读 `faces.guards.registered` 得 `null`，真值是 **`status()` 顶层的 `guards.registered`** | ★ **已成纪律**（§5.9-1）：**"取不到"必须先证明"路径对"**；★ **本条的实质**＝**同一份回执里，字段挂在【哪一层】没有统一约定** ⇒ 读者要么按已知形状寻址、要么先打印**父对象的键** | 文档/回执属主（若要收敛，可在 `docs/03` 写"回执各段的层级表"） |
| **N12** | ★ **`elided[]` 的 8 键形态只有【代码读数】**（`path,from,to,bytes,keptBytes,keptHash,origHash,hash`）；R34 那条**真机回执是 4 键**（`path,from,to,bytes`） | 真机面**构造不出**可截形态（4,470 叶子／最长 378）；要覆盖 8 键须**再构造一次真机臂** ⇒ ★ **Lead 已裁"不专门为它开销一次会话"** ⇒ 保持"代码读数"档位（G6-i） |
| **N13** | ★ **"保留值＝原文前缀"在【任意真实内容】上仍是【声明】**：哈希单向 ⇒ `keptHash`／`origHash` 只买"篡改可发现＋一致性"，**买不到前缀证明**；**分段哈希链同样买不到**（强度相同、只粒度更细）；**耐久副本＋取件键**未排期 | 复核需"**规则或原文**"二者之一；第三条路（回执外耐久副本）是**新能力**、成本四项 ⇒ **不做＋为什么**＝已裁（§0.6／G6-j） |

### 3.3 待解（矛盾读数）
| # | 状态 |
|---|---|
| **D1（原）`hits:2` vs `tool-results=5`** | ✅ **已结案：两数自洽**（**M-5**＋**M-6**；只读转述，署名 `vmu-comms2` ＋ 矩阵 §9.30.8／§9.30.9） |
| **D2** "回执说 pack 合并了、事实被具名拒" | ✅ **已可见/可解释**（目标 6(B) 乙；R33 真机 A 臂**同帧**验证） |
| **D3** `systemPrompt` 仍不可达 | ✅ **已定性为宿主能力边界**（不是缺陷）——★ **R33 真机把降级写进回执**（`promptStatus.registered:false` ＋ `reason` ＋ `stack`），**两臂逐字相同** |
| **D4** `generate-wired-schema --check` 与 `vmu-entry` 的"红绿" | ✅ **不是待解**＝**在飞污染**（R32 我三次隔离实验）；★ **本轮树干净 ⇒ 不成立** |
| **D5** ★ **R33 的 D1（"超预算 ⇒ 自省略"在真机未出现）** | ✅ **已结案 ＋ 已升档**：**R33 定为 (i) 代码缺陷并已修**（"无可截叶子 ⇒ 静默返回原回执"）⇒ 修法＝**不再沉默**（`receiptMeta` 恒存在）；★ **我做了版本考古**：R33 那次臂跑的是**修复前**字节 ⇒ **"当时未发生"是有字节依据的历史事实**；★★ **而 R34 臂（`session-ce7f04ec-…`，23:25:02，HEAD `8b680cb`）真机出现 `truncated:true`**，且我**第一手读 spill 复算通过**（§0.3b）⇒ **两者不矛盾**（时间点不同、契约有无不同） |
| **D6** ★ **「未判定」3 vs 4** | ✅ **已结案（且方向被推翻）**：R33 把 **3→4** 读成"判据更准"（并据此裁 (a)＝4/114）；★ **R34 查明 `4/114` 是新方法的越界 bug**（`vmu-comms2` 给出机制）⇒ **修正回 `1108 / 3 / 115`**（★ **我 23:50 在 `8431f6d` 单门复测：`up to date (1108 wired, 3 undetermined, 115 …)`**；★ **T1 323/323 与提交＝Lead 已核（转述）**）。★ 教训升级为**双向**：**新数字也可能是新方法的产物**（§0.5 (ii)、§5.9-13） |
| **D7** ★ **`appliesFrom` vs `appliesAt`** | ✅ **已闭合（R36/R37）**：`tests/vmu-applies-name-unified.test.mjs` **13/0**（**我本轮实跑**）＋ 当天反例（M1 12/1 红在 D2／M2 11/2／`vmu-verify2` 6/7 红在 B1/B2/B3）⇒ **"同一事实、同一名字、同一值"**；★ 可复用原理：**能红的反例需要一个"两条路径会分叉"的输入**（普通 H1 键同值 ⇒ 只有 refined-H2 输入才分叉） |
| **D8** ★★ **R35 的"不变红的守卫"** | ✅ **已结案：不是守卫没牙，是【变异没落地】** —— 锚点命中**散文行 L257**、**真行在 L312** ⇒ 表格行从未被改 ⇒ **审计当时正确地绿**；R36 修好锚点后**两侧都红**（并逐名点出 `vmu.turn.selfCheck`）。★★ 并结出一条纪律：**"两方同向读数共享同一缺陷 ⇒ 一致不构成事实"**（R35 我与 `comms2` 的"不红"＝**假一致**）⇒ §0.5-(iii) |
| **D9** ★ **"落地自检判据强度"** | ⏳ **仍非 target-addressed（就"强制"而言）**：它**打印**目标格 before/after，**唯一被强制**的判据仍是"整文件文本变了吗" ⇒ **具名保留 G0-i**（建议把 `before8 === after8` 做成 throw／断言，并补"改散文行 ⇒ 红"的反例） |
| — | ★ **本轮无新的"未解释"矛盾**。 |

---

## 4. 具名缺口汇总（按 owner；可派工）

| owner | 缺口 | 一句话 |
|---|---|---|
| **Lead** | **G0-e**（豁免表 `reviewRound`）｜**G0-f**（spill／在飞＝"读数说清哪一份/哪版/哪时刻"＋副本制）｜**G0-c** 定序（`null` 哨兵语义／b2／b3）｜G6-a（行为层实验设计）｜**G6-b**（当前树真机 17/0）｜**G6-h**（升档口径统一） | 最便宜的一步仍是 **G6-b**；★ **G6-c 已由 R34 臂闭合**（不再需要"为截断构造会话"） |
| **`vmu-comms2`** | **G0-g**（覆盖面：`export *`／动态解构＝**G0-j**；可选）｜**G0-b**（`declarations` 口径）｜**G0-c**（b1/b2/b3）｜**G0-a**（生成器类型兜底具名清单）｜**G0-i**（落地自检 target-addressed，与其反例器同处） | ★ **G0-h／N9 已由它闭合**（R36 三臂定位"变异没落地"；R37 最小数据流转档把 2 行改判未判定）；★ 它是**唯一一个"数字变了先给机制"的现场作者**（`4/114` 的越界 bug） |
| **`vmu-verify2`** | **G0-i**（把 `before8 === after8` 做成断言 ⇒ **需配"改散文行 ⇒ 红"的反例**）｜**N12**（8 键真机确认——**Lead 已裁不做**） | ★ R36/R38 的**三臂／四臂副本实验**是"守卫有没有牙"与"最小数据流转档"的**主判据来源**；★ 它自陈并已更正的"未归因代码"（把量具范围选窄）已入册（§5.9-18） |
| **`vmu-pack2`** | **G6-d**（`appliesFrom` vs `appliesAt`，建议单开一项）｜**G6-f**（非对象无 `receiptMeta`＝具名边界）｜**G0-f**（其反例器的副本制**已执行**：真树 `NEVER WRITTEN=true`） | 本轮**已把 R32 的错版改成正确形态并被消费者验证**（R32 破→R33 过） |
| **core（`settings/**`／`kernel/**`）** | G0-d（`fired⊆enforced` 的真实面）｜G4-a／G4-b／G4-c／G4-e | 会议域与设置表两处"声明 ↔ 执法"**都已闭环**；剩**声明层默认值矛盾** |
| **会议／表决面** | G1-c｜G2-a／G2-b／G2-c／G2-g｜G3-b | 多实例注册表；设计目录剩的 5 个命令；`meetingOpen` 域标记 |
| **mailbox／human 面** | G1-d｜G1-e｜G2-e | 跨代审批台账；人工收件箱聚合；自我发信判定 |
| **宿主／装配** | G1-a｜G2-d／G3-c｜G2-f｜G6-c（`systemPrompt` 宿主边界） | 重派组成员（策略）；**宿主分配型 durable store**；会期任务板批准点 |
| **math／pack 面** | G5-a（中间检查点，**等真实可续引擎**）｜G5-b | R9 裁决的改判条件**未满足** |
| **验证侧** | G0-d｜G5-d｜N1–N3｜**N11**（顶层 vs 子对象）｜**N12**（8 键真机确认——已裁不做）｜**N13**（任意内容前缀性＝声明）｜**D9**（落地自检仍非强制）｜★ **N6／N9／N10 已闭合** | 三处 `fired⊆enforced` 的真实面；旧边界；★ **真机 spill 我已第一手核对**；★ **R34 读数我已独立复算 9/9** |
| **不派工（N/A 或有意）** | G1-b（看门狗 N/A）｜G5-c（内容去重有意）｜G4 的"89 行未声明"｜N4（智能体性）｜**G6-g**（`hostElision` 恒 `'possible'` ⇒ 该格已不成立） | 有理由、已具名，**不是缺口** |

---

## 5. 诚实边界（**我没做的、别当已验证**）

1. **未跑 T1 全量**（task-164 明令归 Lead）；**未 `regen-all`**；**未做任何 git 写**（只读 `git log`／`status`／`cat-file`）。
2. **未跑任何真机会话**：目标 6 的真机结论分两种来源 —— ① **转述＋分档**（R33/R34 臂的报告，§0.2）；② ★ **我第一手读的是【宿主 spill 文件】**（R34 臂那份 182,374 B，sha256[0:16] `1A64C62814662CEF`；R33 两份亦读）⇒ ★ **"真机完整回执"这一份我已是第一手**（N10）；★ **R39 我更进一步：用【盘上的规则】把 R34 的读数独立复算了一遍（9/9，§0.3c）** —— ★ 但**"会话本身我没跑、凭据我没碰、宿主我没起"**，且★ **口径与 R34 报告一致：我做的是"可复核"，不是"重跑"**；★ 另有**一处仍是转述**：R34 臂里 `pwsh` 面那份小结果（我未亲眼看）。
3. **v5r 侧代码我一行未读**：目标 2/3/4/5 的 v5r 侧结论**全部是引用**，已逐条标"只读"。v5r **发布包路径不存在**（`06`／`07` 均记 `Test-Path=False`，基线取仓内副本）——**未复核，属转述**。
4. **未复跑的**（明确标"沿用"，别读成"本轮实跑"）：目标 1 的三套件（108/0／67/0／75/0）与目标 5 的三套件（21/0／21/0／13/0）＝**R27 读数**；`vmu-ab-v5r*`／`vmu-meeting-parity`／`order`／`conference` ＝**R27 读数**。
5. **我这一轮的读数全部绑定"哈希＋时刻"**：**工作树干净（`8b680cb`，`git status` 0 行，23:19 与 23:21 两次）** ⇒ 套件读数**直接取自 HEAD**（23:20–23:28）；关键文件哈希见 §0 表。★ 若下游要引用本文件的任何一条读数，**请连档位（真机／真机@R23／进程内／工作树@某提交）一起引**。
6. **搜索范围声明（第八条：负证据必须附范围）**：
   - `oneOf` 于 `vibe-math-vmu/kernel/meetings.js`：**命中 1 处，且是注释**（`:171`）⇒ 结论＝**helper 与 11 个调用点已移除**（R32 实搜；**本轮未复搜**）。
   - **矩阵**：★ **R39 已更新** —— `04-parity-matrix.md` 现在 **2011 行**，含 **§9.37（R35/v21）／§9.38（R36/v22）／§9.39（R38/v23）** 三个并入块 ⇒ **R32–R38 的证据现在【既有矩阵并入块、也有轮报告】**；★ 我在本文件里对 R36–R38 的引用**优先指向矩阵并入块**（如 §9.38.8 的三臂／§9.39.2 的四臂／§9.39.3 的 9/9）并标注来源署名（**"独立复核"＝`vmu-verify2` 实跑；"自报"＝他人一次运行**）。
   - 目标 2 的设计层命令搜索与目标 3 的 `meetingOpen`：**R16 实搜过，本轮未复搜** ⇒ **只读沿用**。
   - `session.v4.jsonl.zstd` 的 mtime 扫描＝**`vmu-verify2` 的实搜**（R28 记），我**未重扫**；R33 的真机会话我是**从报告读到的**。
7. **本机环境（python 四库版本）本轮未复跑**（引用 R16 实测值）。
8. 本文件写在 `_handoff/vmu/`（**在 git 仓之外** —— `Vibe-Mathematics/` 不含 `_handoff`）⇒ 它**不会污染**任何扫卷的门禁；即便如此，服务方法我仍一律写**调用形**。
9. ★★ **纪律族（R27–R33；每条带现场实例）**
   1. **"取不到"必须先证明"路径对"**（同族 **≥4 次**）：(a) **错误父对象** —— `vmu-verify2` 读 `faces.guards.registered` 得 `null`，真值是 **`status()` 顶层的 `guards.registered`**；★ **我在 R24 也踩过同型**（去 `packReport` 找 `defaultsFolded`，真值在入口 `mergeReport()`）；(b) **`String.replace` 只改首处** —— `A2` 的变异打在 `:323`（prompts）而非 `:349`（settings/defaults）⇒ 一度被读成"断言没牙"（**实际有牙**）；(c) **对象必须点名** —— `kernel.status()` 的 `settingsMerge`（窄对象）≠ **入口 `mergeReport()` 的**（回执那一个）；(d) **探测面太宽**（`s.includes('"truncated"')`／`'[...]'` 撞同名/自证文本）⇒ ★ **已单立为第 12 条**（2 例现场，**不在此重复**）。
   2. **"不确定时必须出声"**：`planned` **111 键**不执法但**具名**（`settingsUnenforced.types[0]`：type＋count＋reason）／`settingsRejected` 逐条记 key/value/code/reason/domain/source/default／★ **"未判定"是结论，不是逃生门**（第三档进 §11 并被审计的 `lyingUndetermined` 守着）／★ **生成器 `d.type === null ⇒ 'object'` 的兜底仍待改具名清单**（G0-a）。
   3. **"改声明的类型/形状 ⇒ 必须跑【消费它】的断言"**（**≥4 次**，**多数由门禁抓出**）：① R30 `audit-settings-channels` 的**合成探针值**；② R30 `vmu-set-attribution` 的**域外探针值**；③ R31 **代表键被提升类型**（T1 抓出）；④ ★ **R32 截断形态**（`truncated`/`elided` **有条件出现** ⇒ `vmu-entry`／`vmu-host`／`packs-active-switch`／`defaults-named` **四个套件红**，**套件先发现、作者后知道**）；⑤ ★ **R33 §11**：第三档落地 ⇒ **审计的两值假设**变红（`audit-vmu-docs` 98/1）。
   4. **"反例器必须与被测树物理隔离"**（**变异器也是量具**）：`vmu-verify2` 拒跑一个**直接写真树**再写回快照的反例脚本；★ **R33 各处已执行副本制**（真树 md5/sha 前后逐字节相同 ⇒ `NEVER WRITTEN=true`）；★ **残留**：R33 的反例汇总脚本**只读 stdout** 而计数印在 **stderr** ⇒ 打印 `MUTANT : null`（**证据在输出里，是汇总器的瑕疵**）。
   5. **"声明写了 `domain` ≠ 运行期受保护"**（R28）：`validateValue` 的唯一调用者 `resolveSettings` **当时无调用者** ⇒ 域外值经 `config.vmu` 对远离 meetings 的 enum 键同样 **LOADED**；判一条键是否真受保护，**唯一标准是"哪个执行点在拒"**。
   6. **"执行点上线前先证它对【每一种已声明类型】都有定义"**（R30，代价＝26% 回归）：与第 5 条**合看，两个方向都要防** —— R28＝**没人执行**；R30＝**执行了，却把"未定义"当成"非法"**。
   7. ★ **"有条件的键本身就是形状变化"**（R32）：`truncated`／`elided` **只在超限时出现** ⇒ **键集合随负载变** ⇒ 三个套件红；**R33 的修法＝`receiptMeta` 五键两态恒存在、状态用值表达**（★ **同一批消费者从"被打破"变成"被验证"**）。
   8. ★ **"注释提到键 ＝ 文档，不是读取"**（R32 立；R33 现场）**＋"看不见 ≠ 没有"**：`isDeclarationLine` 的假过滤（**真读被当成声明**）与 `selfCheck` 的**唯一"读"写在注释里**（⇒ **不能据此判"已接线"**）；★ **原型期两次"看似有牙"的假证据**（把注释当读／松遍历**臆造**动态读）都当场被修。
   9. ★ **"门红了 ≠ 红在被测那一行"**（R27 起）：R33 **自曝一次"只有半个证据"** —— `audit-vmu-docs` 的两条 docs 侧反例红了，但**审计先跑生成器 `--check`** ⇒ 改 docs 必然 STALE ⇒ **红可能来自 STALE 而非那两条断言**；★ **R34 已闭环**（副本先中和 STALE 子检查 ⇒ **红落在断言上并逐名点出 `vmu.paper.retentionMs`**，见 **G0-h**）。
   10. ★ **"生成器当子检查 ⇒ 性能放大"**（R33）：`generate-wiring-index.mjs` **把 settings-table 当自己的 check 去跑** ⇒ 单次变慢被 spawn **放大两次** ⇒ **236.8 s > 180 s 预算**；修法＝**索引只建一次（O(1) 查表）**；★ **我独立计时 109.5 s**。
   11. ★ **"不许抬超时来消红 —— 修负载，不修预算"**（R32 试过把常数 `20000 → 24000`，**治标**；R33 **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`）＋ ★ **"证明非既有"的做法**：**在上一提交的干净 worktree 里量同一套件**（而不是在正在被写的树上量）。
   12. ★★ **"子串探测会撞同名／自证文本 ⇒ 按路径验"**（★ 本轮据 Lead 建议**单立一条**；**已有 2 例现场**）：① **R33**：探测 `s.includes('"truncated"')` ⇒ 被**报告面自己的计数器 `"truncated":0`** 骗成 `true`；② **R34（我）**：`text.includes('[...]')` 报 `YES`，而全文**唯一**那处 `[...]`（offset **182077**）就在 **`receiptMeta.note` 自己的文字里**（"A host-inserted `[...]` marker may ALSO appear"）。⇒ **纪律**：**判"存在与否"必须按【路径/形状】验**（读 `receiptMeta.truncated` 这类字段），**不许用全文子串**；★ 与本条 1(d) 同族（那里是"路径不对"，这里是"探测面太宽"）。
   13. ★ **"数字变了 ⇒ 采纳前先给【机制层解释】"**（R34 立；★ **"旧数字是旧方法的产物"的【双向】版**）：新数字也可能是新方法的产物 ⇒ **顺序应当是"先给机制、再改数字"**；现场＝`3/115 → 4/114` 被当成"判据更准"（Lead 据此裁 (a)），机制一查才知是**新方法的越界 bug** ⇒ **回到 3/115**（§0.5 (ii)）。
   14. ★ **配套三条（R34）**：**① "红了"与"红在被测那一行"必须分开说**（R33 半个证据 → **R34 用"副本里先中和 STALE 子检查"闭环**，见 G0-h）；**② "没核"与"核了"必须分开写**（R34 的 `turn.objective`／`instituteName` 两行就如实写"没核"；跨文件覆盖范围也写明只到"具名导入"）；**③ 转述的证据必须注明来源**（如"Lead 已核（转述）"、`vmu-comms2` 自报 ⇒ **不抬成"我核过"**）。
   15. ★★ **"落地自检必须 target-addressed 且【被强制】"**（R36→R38 的**三层递进**：**R27 变异打错行 → R36 自检只答"文件变了吗" → R38"打印 ≠ 断言"**）：现场＝(a) `out.join('\n')` 与**原地数组自比**⇒**恒真**（"自检本身也是一个不变红的守卫"）；(b) 自检脚本**打印**"第 8 格 X → Y"但**唯一被强制**的仍是整文件快照比较 ⇒ **本轮仍非强制**（G0-i／D9）。
   16. ★★ **"两方同向读数共享同一缺陷 ⇒ 一致不构成事实"**（R35）：现场＝R35 我与 `comms2` **各自独立**得到"清空档位格不红"，**两方一致却是假一致**（都打在**散文行 L257**）⇒ **报"两方一致"前先问：这两份读数是否共享同一个（可能错的）前提**。
   17. ★ **"任务前提必须先核"**（**第 4 次** premise 被核查推翻）：现场＝`comms2` 先核三件（`verdictOf` 三值／行是否只渲染两档／表体档位）⇒ **结论从"要改生成器"变成"无需改、也不需要 `--write`"**（我独立读数同向：`--check` up to date、`audit-vmu-docs` 102/0）。
   18. ★ **"能红的反例需要一个【两条路径会分叉】的输入"**（R36）：现场＝普通 H1 键下"从表里重算"与"取内核值"**同值** ⇒ 反例**抓不住**"改回表值"这个回归；只有**内核会细化**的输入（refined-H2 `vmu.turn.instituteName`）才分叉；★ 与"变异打错行"**同族**（一错在**位置**、一错在**输入**）。
   19. ★ **"机制要在【依赖闭包】里找，不是只看被计时的那一个文件"**（R36 更正）：现场＝`vmu-verify2` 量 `wiring-index` **7.35/7.20 s**（其 6.65），因"**被计时脚本本身**字节未变"就推"环境漂移／不归因代码" ⇒ ★ **它自己有那块拼图**（`generate-vmu-settings-table.mjs` 的 blob 也变了：`C0A865AE7982FC5E → 3AF5671D40889CE1`）⇒ **机制已知、可归因**；★ 更正后的表述：**"数字变了／没变都要给机制"，且机制要在依赖闭包里找**。
   20. ★★ **"先打印结构，再写解析"**（★ **R39 我自己踩的**）：现场＝我第一版**假设** `r163-B-overlay.yml` 是 **YAML 折行标量**、按续行拼接 ⇒ 得到 **14,444 字符**（把外层 mapping 文本一起吃进来）⇒ 三条断言红；**先打印行号/行长**才看清该标量**就在第 17 行（14,037 字符）**。★ **同族反向**：`vmu-verify2` R36 把"正则读不全"误判成"YAML 折行" ⇒ **两个方向都错在"先假定文件形状、再解析"**。
   21. ★ **"可重推：先写清【要推出什么】，再选机制"**（R38）：现场＝**算术/长度/`keptHash` 可推**；★ **前缀性不可由哈希推**（哈希单向），**只由规则或原文推** ⇒ **哈希与规则各买各的**；★ **拒绝机制要给"它为什么买不到目标性质"的结构性理由，并把"能买到的"与"买不到的"分列**，**且标明"这是论证，不是实测"**（§0.6）。
   ★ 附一：**"基线是 67" ≠ "该形状不存在"**（`RULE E` A 类基线是**指纹集合**；R26 第四次复发即此）⇒ **每条新断言必须当天种一次反例**；本文件里 **`RULE E 67=67`／多行 `C 57=57`** 是"未动"的读数（§1 #18），**不是**"没有该形状"的证明。
   ★ 附二：**"我看到的格子不是原因，只是两种原因的共同投影"**（R33 §6）：**"表陈旧"与"判据看不见"在读数上同形** —— 唯一能分开的读写＝**修完判据再跑一次 `--check`**（旧因仍需 `--write`；新因变 `up to date`／`--write` no-op）。
