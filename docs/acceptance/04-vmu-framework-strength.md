# 目标 3 · vmu 框架强度判定 **v2**（Round 3 定稿）

> 问题原文：**当前 vmu 框架是否足够强大，使其本身支持原 vibe-math-v5r 中所有具体功能、设施、逻辑的实现？若不成立，则实现它们。**
> 判据来源：`03-v5r-full-inventory.md` 的三份需求清单（A 31 条、B F1–F53、C 20 条，去重后约 90 条）。
> 证据：**`05-framework-strength-evidence.md`**（vmu-verify 逐条实测，42 条长尾 + 地基 10 条）＋ **`05b-lead-strength-checks.md`**（Lead 独立核查，第二来源）。**本文件只做判定汇总，证据在两者里，逐条带 `file:line`。**

---

## 一、总判定

**"部分成立"** —— 框架**不需要推倒**；地基纪律**强于 v5r**，覆盖面已从 Round 2 的"2/12 耐久键"补到**可跨重启的 7–10 面**；**Round 4 又把子代理原语这一组补齐**（F9/F10/F11 已接线），剩余缺口集中在**少数等价形态**与**宿主是否提供接缝**这类**真机问题**上，且**已全部具名**。

| 组 | 具备 | 部分 | 缺失 | 说明 |
|---|---|---|---|---|
| 地基（F1–F7、迁移、CAS、有界台账、路径守卫） | 7 | 2 | 1 | Lead 独立核查：F2 白名单**具名抛错**（强于 v5r 的"静默丢弃"）、F5 载入失败 **fail-closed**、F7 配额**具名拒**、F41 路径包含用 `relative`+`isAbsolute`（`startsWith` 不够的坑已避） |
| F8–F14 子代理生命周期 | **6** | 1 | **0** | ★ **Round 4 已补齐**：F9 `sendMessage`／F10 `interrupt` 经宿主 `subagents` 接成可注入接缝（缺缝**具名拒**），F11 回合结束带 **`{reply, childId, stopReason, attribution}`** 生命周期信封（取不到就明写"没有 stopReason"，**不假装**）—— `kernel/turn/index.js:174-186`；宿主侧签名已用 Host Inspect 核实（`sendMessage(sender,targetId,content,{signal})`／`interrupt(targetSessionId,authority)`） |
| F15–F18 定时/并发 | 2 | 1 | 1 | F17 注入的 `spawn` **无 handle ⇒ 无法 terminate**；F18 锁**无仓内使用者**（"finally 释放"未被证明） |
| F20–F24 提示词 | 5 | 0 | 0 | Lead 独立核查 **F22 具备**（`FIELD_OWNERS` 24 字段 ↔ 真实面+op，且失败**可见地**报 face-not-wired，`kernel/turn/index.js:30-58,348-361`）；F23 `extractFence` 已对齐 v5r 两处易错语义（json 标签可选、**最后一个**围栏胜出） |
| F25–F34 共识 | 5 | 3 | **2** | 计量-裁定分离、单一盖章点、复议只升不降等已具备；缺口具名 |
| F35–F40 任务板/成果库 | 4 | 0 | **2** | F38 指纹"一处计算＋随记录持久"具备（`kernel/library.js:4,12,26`） |
| F43–F47 形式化/工具链 | 3 | 2 | 0 | F42 作业持久化本轮**已补**（`kernel/mathjobs.js`＋`kernel/lean.js` 同套镜像，`passed` 不能从磁盘复活） |
| F49–F53 可观测/可恢复 | 2 | 1 | **2** | **F52 本轮从"缺失"变"具备"**：新 `kernel/activity.js`＋`vibe_vmu_wait`（future-only／一次性／区间钳制／五条路都清理 disposer），**由 falsify 族证明可红** |
| **合计** | **25** | **8** | **9** | 与 `05-framework-strength-evidence.md` 一致（★ Round 4 把 F11 改判"具备"，42 条总计由 24/8/10 变为 **25/8/9**） |

## 二、本轮把"缺失"变成"具备"的（都已落地并留证）

| 原语 | 处置 | 证据 |
|---|---|---|
| **F52** 一次性 future-only 活动等待器 | ✅ **实现** | `kernel/activity.js`＋`tools/activity.js`＋`tests/vmu-activity-{kernel,falsify,tool}.test.mjs`（141/14/58）；**falsify 注入"历史重放"⇒同一探针变红** |
| **F48/F42** 作业持久化/断点续算 | ✅ **实现** | `Math/Jobs/<jobId>.json` 镜像＋七态（**无 `passed`**）＋四分支恢复＋jobId 级取消；**真机**跑通（python 3.12＋numpy/scipy/pandas/sympy） |
| **F19** 跨进程独占创建 | ✅ **实现（宿主可降级）** | `writeTextExclusive`（`wx`/`O_EXCL`）⇒ `EEXIST` ⇒ `VMU_MATH_JOB_ID_TAKEN`，半成品作业删除；无接缝**具名** `not-enforced` |
| **C-45** 忠实性强制弃权（矩阵空缺） | ✅ **实现** | `kernel/fidelity.js` 唯一强制点，`ballot.cast` 调用 ⇒ 1/0 改写 0.5 且 `kind:'abstain'`，可观测 |
| **C-30** office 定稿咨询门（矩阵空缺） | ✅ **实现** | `kernel/paper.js` 读 5 键 ⇒ `VMU_OFFICE_CONSULT_REQUIRED`＋审计 `what:'auth'`＋总线事件；**默认豁免 `[]`**（v5r 语义） |
| **C-52** 自动汇报（矩阵空缺） | ✅ 已于 Round 2 闭合 | `kernel/report.js`（零机制默认关）＋`tools/report.js` |

## 三、仍未具备的 10 条（**全部具名，附处置建议**）

| 原语 | 现状 | 处置建议 |
|---|---|---|
| ~~**F9/F10/F11**~~ ★ **Round 4 已完成** | **已实现**：宿主 `subagents` 的 `sendMessage`/`interrupt` 接成可注入接缝（无宿主能力 ⇒ 具名拒），回合结束回信封 `{reply, childId, stopReason, attribution}`；`status().seams.sendMessage/interrupt` 可观测（含 `*ConsumedBy/*Note`）；无新增 settings 键（能力不是策略） | **已闭环** ✓ —— 剩余只是**真机**上"宿主是否真的提供该 seam"的验证（Round 4 smoke 只跑到 `status` 面：零声明下只发布一个面，机制正确；多面点亮留 Round 5 的 U14） |
| F13 未知名 **fail-closed 具名拒** | 与 v5r 的"容错跳过"**不等价** | **有意偏离**：fail-closed 更安全；写进文档作为**具名差异**（不是缺陷） |
| F17 `spawn` 无 handle ⇒ 无法 terminate | 注入接缝只给 promise | 评估是否扩展接缝（`terminate`）；不能就具名 |
| F18 锁无仓内使用者 | 只有测试调 acquire/release | 真接线一处（如归档独占）或**具名登记为未使用** |
| F25/F30/F31 等共识组的 3 部分 + 2 缺失 | 部分具名（见 evidence） | 逐条评估；**部分**项写明"若要求同名原语应改判缺失" |
| F35/F40 组 2 缺失 | 具名 | 同上 |

## 四、方法论（本轮新增，值得保留）

1. **"缺失"必须给搜索范围与模式**（F52 的判定＝全树 grep 零命中＋v5r 有明确落点 `3424-3466`），否则读者无法复核。
2. **"具备"必须指出失败可见性**：F22 判"具备"而不是"部分"，关键是它有 **face-not-wired 可见降级**——本仓反复出现"声明了没实现"，所以**失败可见是判具备的必要条件**。
3. **等价形态要标明**：F16/F31/F33 的"具备（等价形态）"是**读码推理**而非探针，已注明"若要求同名原语应改判部分"。
4. **证伪优于断言**：本轮把"future-only""语义级数学对照"都做成了**可证伪的族**（注入缺陷 ⇒ 具名红），这比"断言通过"强一档。
