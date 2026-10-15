# Round 16 组织草案（Lead · Round 15 收尾后）

> **Round 15 结果（已 commit `40ad102` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **309/309**；19 文件、+526/−38。
> **★ 回执不再多报**：`vote({motion:null})` 原来回**伪造的** `tally:{0,0,0}`，而同一调用 `counters.votes+=1`＋minutes 真写入 ⇒ 现改 `tally:null`＋`counted:false`＋具名 note，**两半分开断言**，并**实测能红**（干净 60/0；还原旧 loader 钩子 ⇒ **59/1** 恰好红在那行）。★ 第二步是**设计问题**，用**考据**而非发明回答：**v5r 确有** open-ballot 机制（`vibe_v5_poll_open/vote/close`），vmu 也**已有等价容器**（`ballotbox.js`＋`ballot.js`）⇒ **缺口是回执诚实性，不是缺机制** ⇒ **不造第二份**。
> **★ 59 条断言进仓**：`tests/vmu-meeting-order.test.mjs`（60 条；变异用 `data:` URL 在进程内做 ⇒ **不依赖 `D:\_tmp`**）＋双登记。
> **★ 7 个清单外文件收口**：`docs/audit/` 6 份 ⇒ **具名豁免**（新 `tests/_lib/package-exemptions.mjs`：精确路径禁通配／五字段／六开关，含"**豁免一条已登记的路径 ⇒ 红**"）；`packs/example-data/README.md` ⇒ **两份清单同改**。membership **13→28**。
> **★ 判据 (e) 【真的】能红**：在预设源根下种一个**无 import 指向的纯数据文件** ⇒ **27/1 并具名该 path**；删同一路径 ⇒ **28/0**。这正是**今天两门都看不见的那一格**。
> **★ 门禁的"数目"升级为断言**：`audit-declaration-criterion` 把注释里的数字改成**打印读数＋三条"声明数＝实测数"断言** ⇒ 以后漂移**门自己会红**（25/0，selftest 16/0）。
> **★ 第九条台账 `I1–I8`**（`docs/11 §4.2`）：含 **I6 新的一型**——根因不是"分支没被触发"，而是**词表缺形状**。
> **★ 两位作者各自踩坑并自陈**：verify2 把三个服务名**裸写**进 `docs/11`（⑧ 再次）；activity2 的台账用 `C1…C9` 当运行编号，被 `audit-claim-traceability` 读成 claim id（`11:C9` 悬挂）⇒ 合成纪律 **⑧ 两型**：**你写下的每一个 token 都可能在门的另一侧有语义**。
> 6 名 R14/R15 队友全部空闲；**队友容量**：`maxMembers` 已提至 16，需要人手用**新名字** spawn（继承 Lead 当前路由）。

## ★ Round 16 首项：**收口第九条形态的最后 3 处逃生口 ＋ 目标终态验收**

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **`fired ⊆ enforced` 的条件式逃生口 3 处**：`tests/vmu-bidding-audit.test.mjs:88`／`tests/vmu-board-audit.test.mjs:105`／`tests/vmu-ballotbox.test.mjs:234` 的 `if (Array.isArray(r.fired))` ⇒ **改无条件断言＋非空前置**（照 `vmu-conference:246/280` 正例，实测无条件形式 **72/0**）；**先跑 RULE E 确认不新增指纹**（基线 **67**） | `vmu-verify2` | **第九条形态**：条件式断言＝分支可能永不执行；今天**冗余**（无条件形式已够）**但冗余仍是逃生口** |
| 2 | **★ 目标终态验收（consolidated acceptance）**：把 **目标 0–6** 的终判（`_handoff/vmu/06/07/08/09/10/11` ＋ 三份 e2e `12/13/14` ＋ `15/16`）在**当前树**上**逐条复核**：哪些仍成立、哪些被后续轮次改进、**每一条具名缺口**（含它的改判条件与 owner）汇成**一份总账** | 新队友（或 `vmu-verify2`） | 这是"**收集证据证明整个目标已达成**"该做的一步；产出 `_handoff/vmu/17-objective-status.md` |
| 3 | **`fired ⊆ enforced` 的具名残留复核**：确认那 3 处之外**没有第四处**约束式写法（`activity2` 只找到 3 处） | 同 #1 | 第九条：**"我没找到"要与"不存在"分开说** |

## 其余（若有预算）

| # | 项 | 说明 |
|---|---|---|
| 4 | **豁免表 `reviewRound` 到期的处置**（裁决：**只报告、不判红**——把记账日期变成门禁失败会推着人**不改内容只改日期**，正是我们一直在打的"白名单漂移"）；实现＝**可见计数**（如 `review due at round N: K`）而非红 | `vmu-verify2` |
| 5 | **`vmu.agenda.reorderAudit`** 保持"不进 `enforced[]`＋保留事件路径"（裁决已下）⇒ 在矩阵具名终态 | 派单时定 |
| 6 | ★ **新门/新脚本的"守恒"检查**：本轮新增 `tests/_lib/package-exemptions.mjs`／`tests/vmu-meeting-order.test.mjs`／`scripts/generate-seam-table.mjs` 的改动 ⇒ 确认 `regen-all --check` **15/15**、`files[]` 无重复、`PRESETS` 仍 `tests/`＝0 | Lead 轮末 |

## 已知具名缺口（持续跟踪，不阻塞）

- **多智能体**：两成员**不是 LLM 智能体**（框架给通道与耐久，不给智能体）；`records` 跨进程、`panel`、跨机未验。
- **数学引擎**：中间检查点未实现（续算＝重跑整段；改判条件＝真实可续引擎且单作业时长 ≥ 预算量级）；跨机/孤儿进程是宿主边界。
- **能力项**（非缺口）：真多数聚合（`quorumRule` 的 `tally` 谓词，R1 可插拔）；`docs/04` 桶① 19 键"无承载者"。
- **`vmu.agenda.reorderAudit`**：内核不读该键（事件路径替代）。
- **`kernel/meetings.js` 1197/1200**：该面扩展必须搬族。

## 纪律（沿用；本轮 ⑧ 补第二型）

- **⑧ 两型**：**你写下的每一个 token 都可能在门的另一侧有语义** —— ①**发现的名字**污染被扫卷（G2 静默 3→0）；②**运行/引用编号**被反向读成 claim id（`11:C9` 悬挂）。
- 其余：门禁必须有牙（**种违规⇒红／删⇒绿**）／判据与环境一致／观测量两档真的不同／**回执说成功必须与事真的做了分开断言**／门禁读事实所在的那种文本／"我没找到"≠"它不存在"／重构原子＋每步跑加载内核套件／清理只删显式创建路径／**引用前先落一行核验并写明读的是哪一次运行**／**服务方法一律调用形**。
- 轮末由 Lead 统一 `update-doc-counts → regen-all → generate-wiring-index → T0 → T1 → commit → push`；**不发布**。
