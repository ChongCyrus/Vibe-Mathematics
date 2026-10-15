# Round 4 组织草案（Lead · Round 3 收尾后）

> **Round 3 结果（已 commit `d70a3ee` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **279/279**；76 文件、+5098/−215。
> 目标 1/2/5/6 的收尾全部落地；**目标 3 判定 v2 定稿**（42 条实测：24 具备／8 部分／10 缺失）；**目标 4 矩阵 v2**；新增 `kernel/activity.js`（F52）、`kernel/fidelity.js`（C-45）、C-30 咨询门、会议分级、耐久审批队列。
> 8 名队友全部空闲。

## Round 3 遗留 → Round 4 必办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **F9/F10/F11 子代理原语**（`sendMessage`／`interrupt`／回合结束带 `childId`+`stopReason`） | core（宿主层）＋verify（证据） | 目标 3 里**最重的剩余缺口**：决定"成员可被中断/可被投递"；能接就接（像 `deliverTurn` 那样在宿主层接出来并让内核可见），不能接就具名登记为宿主能力缺口 |
| 2 | **F17 `spawn` 接缝加 `terminate`**、**F18 锁真接线**、**F13 偏离写成具名差异** | core／reader-b | 都是小项，但都属"缺失/部分"清单 |
| 3 | **共识组与任务板组的 5 条缺失/部分** | reader-b／reader-c | 按 `05-framework-strength-evidence.md` 逐条评估；部分项写明"若要求同名原语应改判缺失" |
| 4 | **真机 smoke（Round 3 未完成）** | verify | 断点已写好：`dsh --from-default-profile web --profile vmsmoke` → `dsh plugin … add <本仓>` → 起服务取 token → `scripts/dsh-drive.mjs` 逐面跑（`web` 模板初始化 >120s，需给足时间或换模板） |
| 5 | **`resume.setPhase()` 四处调用**（pause/resume/stop/start） | core | 引擎侧就绪；现在 `phase` 投影 `present:false`（具名，不假装） |
| 6 | **`maxParallel` 真收敛**（`mathtools` 改读 `vmu.math.maxParallel`） | core | 收敛后 vmu-pack 删一行（它已注明） |
| 7 | **GAP-MTG 余项**（12 条中已落 3 条） | reader-c | 按 `docs/08 §25.4` 的 closed-by |
| 8 | **审批队列的"真门禁"覆盖面**：现在闸住 tasks/ballotbox/meetings | core | 评估是否扩到 records/library/paper 等写面 |
| 9 | **目标 4 矩阵 v3** | verify | 反映 Round 4 实现；空缺持续具名可追溯 |
| 10 | **文档**：`docs/03 §2` 服务实数、`docs/04 §11`、`docs/18` 工具表（54）随轮末 regen | Lead／core | 生成块由 Lead 统一跑 |

## 纪律（沿用）

- 每面自带测试；轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **"按文本解析"的门禁仍在误报**：本轮又抓到两处（生成器把注释当键、包成员审计把测试里的**数据字符串** `from './bus.js'` 当 import）。**新写门禁时必须要求形状/上下文**，并用自探针证明"数据不得被当成代码"。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**。
