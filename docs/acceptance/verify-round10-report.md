# Round 10 · vmu-verify（task-75）交付报告

> 任务：`task-75`（A 依赖环门禁的形状判据；B 矩阵 v9／证据；C 复核 core 的 task-74；D `docs/11 §4.2` 新教训）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；**未改他人文件**。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 读数 |
|---|---|---|
| **A 依赖环门禁形状** | ✅ **已修 ＋ 双向自探针** | `tests/audit-dependency-cycles.test.mjs` ⇒ **8/0 EXIT=0**（168 文件 / **246** 边 / 0 环） |
| **B 矩阵 v9／证据** | ✅ | v9 标题＋**§9.8**（7 缺陷账／退出冲刷＋G7／resume 拆分／门禁形状）；证据 **§10.13** |
| **C 复核 B1–B4＋`control/idle`** | ⏳ **前提未落 ⇒ 无可复核对象** | ★我实测：8 键 schema **0/8**、`control/idle` 在 `bus.js` **0**、**`idleState()` 在 `control.js` 之外 0 个调用者** ⇒ core 的 task-74 未开工 |
| **D `docs/11 §4.2`** | ✅ | 新增**第七条硬要求：门禁必须读"事实所在的那种文本"** |

---

## A · 依赖环门禁：把"注释当 import"修成语句位置判据

**缺陷**（Lead 报，我接手时该门**已绿**——因为**注释被改写**了 ⇒ 症状被藏起来、判据没修）：门禁直接对**原文**跑
`(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]`，于是 `resume.js` **注释里**为解释一个摘要助手而写的
`import { contentDigest } from './resume.js'` 被当成**真 import** ⇒ 报出**自环** `resume.js -> resume.js`。

**修法**（与 `audit-package-membership` 同一做法）：**先去注释**（`tests/_lib/strip-comments.mjs`）**再要求语句位置**，导出
`relativeImportsOf(source)`：
```js
const IMPORT_STATEMENT = /^[ \t]*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+['"]([^'"]+)['"]/gm
```
`graphOf()` 改用它建图。

**★ 双向自探针（新增）**——"不许放宽成存在即通过"：
| 样本 | 期望 | 结果 |
|---|---|---|
| 行注释里的 import 形状 | **不计入** | ✓ 0 |
| 块注释里的 import 形状 | **不计入** | ✓ 0 |
| **数据字符串**里的 import 形状 | **不计入** | ✓ 0 |
| 真 单行 ESM import | **必须找到** | ✓ 1 |
| 真 **多行** import（`import {\n a,\n} from '…'`） | **必须找到** | ✓ 1 |
| 真 副作用导入 `import './side.js'` | **必须找到** | ✓ 1 |
| 真 **re-export** `export { d } from './d.js'` | **必须找到** | ✓ 1 |
＋ 断言**旧模式确实数了注释形状**（证明修的是**活盲点**而非假想）。

**★ 附带收获（值得记）**：换判据后同一棵树上的内部边由 **245 → 246** —— 旧模式 `[^'"\n]*` **不跨行**，连**多行 import** 都看不见。所以这次**既去掉一条假边、又补回一条真边**；`0 环`的结论不变（168 文件 / 246 边 / 0 环）。⇒ **该门 8/0 EXIT=0**。

## B · 矩阵 v9／证据（详见矩阵 §9.8）

- **R9 的 7 个真缺陷**（全部已修）入册：`methodsOf` 未写穿／`store.js` 白名单崩／Lean 崩溃续算坏／同号覆写→**恢复租约**／`fired ⊄ enforced`／`lean.js` 绕过注入时钟／E-17 观测量无差异。
- **退出冲刷 ＋ G7 共享队列**：`state` 自动写穿 vs `journal` 显式 flush、`ok` 是二者的**与**、**"写前必读"同样管辖退出**（我先前报的那条 stdout 噪声，core 确认**有意**并做成具名断言＋写进 `docs/03 §2`）；`vmu.commitlog` 成为 board＋mailbox **共用**日志（探针 17/0）。
- **`resume.js` 拆分（★三块；我上一版只报两块，已更正）**：`kernel/resume.js` **1179 行** ＋ `kernel/resumeflush.js` **150 行**（`createExitContract`）＋ `kernel/contentvalue.js` **50 行**（`stableStringify`/`contentDigest`/`clone`/`idSuffix`）；消费者 `resume.js:47/48`；已登记 `files[]`＋`installer.js`＋zero-mechanism 矩阵 ✓。**Lead 同轮独立实测 1125/141/44** ⇒ **两版并存记录**（reader-a 收尾微调所致，不以任一版掩盖另一版）。★ **我的失误根因**：用了 `-Filter 'resume*'` **按名字前缀搜** ⇒ `contentvalue.js` **从未进入结果**（与 R7 的 **F52 教训同族**）；**"搜不到"必须与"不存在"分开说**，我当时写成了后者 —— 已同步进矩阵 §9.8.3 与证据 §10.13。

## C · core 的 task-74：**未落，无可复核对象**

★ 我实测：**8 键 schema 命中 0/8**、**`control/idle` 在 `kernel/bus.js` 命中 0**、**`idleState()` 在 `control.js` 之外 0 个调用者**。
⇒ 三项复核（每键真读者／钩子已登记且分类／**有真生产者**）**都还没有对象**；尤其第③项：core 自己也指出 `idleState()` 原本**零调用者** ⇒ **只加 emit 会得到"无生产者钩子"**，必须同时定轮询点。**在本轮不记为具备**，等 task-74 落地后我按 D 复核并回报读数。

## D · `docs/11 §4.2` 第七条硬要求

**门禁必须读"事实所在的那种文本"** —— 静态门扫源码时，**注释与数据字符串不是代码**。实例＝本轮依赖环门禁（注释里的 import 形状被当边 ⇒ 假自环 ⇒ 当时的修法是**改写注释**，即**门禁指挥文档措辞**）。正解＝**先去注释、再要求语句位置**，并配**双向自探针**（假的不算、真的不漏）；只证一头会留下另一头的错。★ 并记下"地区性"收获：旧判据**同时**漏掉了多行 import（245→246）。

## E · 命令与退出码

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/audit-dependency-cycles.test.mjs` | **0** | **8/0**（168 文件 / 246 边 / 0 环） |
| `node tests/audit-vmu-services.test.mjs` | **0** | **49/0**（R9 末尾我改的：全名扫描＋按 kind 排除工具＋自探针） |
| `node tests/vmu-entry.test.mjs` | **0** | **150/0**（E-17 观测量改为 `verdictMaxRounds`） |
| `node tests/audit-declaration-criterion.test.mjs` | **1** | **75/1**（RULE E `67=67` ✓；唯一 FAIL＝Lead 的 `regen-all --check`） |
| `node tests/audit-vmu-docs.test.mjs` / `scripts/check-docs.mjs` | **0** | **84/0** / **PASS** |
| `node tests/vmu-activity-timers.test.mjs` | **0** | **36/0**（F2 由 reader-b 用注入接缝修掉） |
| `node tests/vmu-storepolicy.test.mjs` | **0** | **11/0**（我补了 `tmpDir` 分支，非空过） |

## F · 交回 Lead

1. **A 完成**：门禁改为"去注释＋语句位置"＋**双向自探针**，并因此**补回一条旧判据漏掉的真边**（245→246）。
2. **B 完成**：矩阵 **v9**＋证据 **§10.13**（R9 七个真缺陷账／退出冲刷＋G7／resume 拆分）。
3. **C 未可做**：core 的 task-74 **未落**（8 键 0/8、`control/idle` 0、`idleState()` 零外部调用者）⇒ 留待其落地后复核，**不记为具备**。
4. **D 完成**：`docs/11 §4.2` 现共**七条**硬要求。
5. 唯一非我红仍是 **`regen-all --check`**（你）；`audit-code-size` 曾报的 `resume.js` 越界已由**三块拆分**解决（我实测 **1179 ＋ 150 ＋ 50**；你的同轮实测 1125/141/44，两版并存）。
