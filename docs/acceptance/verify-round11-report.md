# Round 11 · vmu-verify（task-83）交付报告

> 任务：`task-83`（A 全 pack 声明 `notAttached` 普查；B 零机制红线；C 常驻门禁＋自探针；D 矩阵 v10／证据；E 保质期复跑）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；**未改他人文件**；**新文件当场登记**。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 读数 |
|---|---|---|
| **A 普查（真装配，三表）** | ✅ | `declared=10` ⇒ **attached 7／viaAlias 0／notAttached 3**（3 条**全具名** `VMU_RESUME_NO_TARGET`） |
| **B 零机制红线** | ✅ 已**断言**（不只是口号） | "未声明 ⇒ 无实例/无包裹"＋每个 `notAttached` 必须点出零机制成因 |
| **C 常驻门禁＋自探针** | ✅ | `scripts/audit-projection-census.mjs` ⇒ **10 passed / 0 failed EXIT=0**；`files[]` 已登记（membership **13/0**）；执行点已接（`EXECUTED … ⇒ exit=0`） |
| **D 矩阵 v10／证据** | ✅ | 矩阵 **v10**＋**§9.14**（普查三表／门禁／R10 全部闭合项） |
| **E 保质期复跑** | ✅ | `audit-enforced-consistency` **358/0（findings=0）**｜`audit-hook-coverage` **4/0**｜`audit-hook-emit-classification` **7/0** |

---

## A · 普查：把"声明了没生效"一次查干净

**驱动**：真装配 `vibe-math-vmu.js apply(ctx, { clock, root, packs: ['v5r'] })`（最小假宿主 ctx，形状取自 `vmu-resume-e2e.test.mjs` §⑩）＋按**两个真观测量**轮询就绪（`store.stats().open === true` 且 `recovery.status().restart.generation >= 1` —— 否则折叠未读、写前必读闩未挂，后续读数会被 `VMU_RESUME_WRITE_BEFORE_READ` 具名拒）。**读的是真装配，不是文档。**

| 表 | 内容 |
|---|---|
| **declared（10）** | `members`／`tasks`／`meetings`／`ballotbox`／`budget`／`phase`／`work`／`chat`／`panel`／`human` |
| **attached（7）** | `human`／`tasks`／`meetings`／`ballotbox`／`budget`／`chat`／`panel`（且各自有 `wrappedMethods`） |
| **viaAlias（0）** | **空**——别名容错通道存在但本装配未用 ⇒ pack 侧已用**真名**声明 |
| **notAttached（3）** | `members`／`phase`／`work`，**全部 `VMU_RESUME_NO_TARGET`**，reason 一致说明"服务为 null **因为没人声明它**（零机制，如 members 需 slots／maxLiveMembers）⇒ 没有可包裹的目标；**键保持未接线而不是假装**" |

⇒ ★ **R10 那类"静默不挂"在本次普查里＝0**；这正是"逐个发现"给不了、只有"一次普查"能保证的结论。`known`（10）／`unwiredKnown`（3）与三表**逐项一致** ⇒ 两个读数无法各自漂移。

## B · 零机制红线（D-01）

门禁里**断言**（而非假设）：① **没有任何 `attached`／`wrappedMethods` 面是未声明的** ⇒ **不发明权威**；② 每个 `notAttached` 的 reason **必须点出零机制成因**（正则 `/zero-mechanism|nothing declared it/`）⇒ "没声明就没有实例"变成可测读数。与 core 的 `docs/03 §6.2` 零机制对照表同源。

## C · 常驻门禁 ＋ 自探针（新文件当场双登记）

`scripts/audit-projection-census.mjs`：
- **读数**：**10 passed / 0 failed EXIT=0**（`tables: declared=10 attached=7 viaAlias=0 notAttached=3`）；
- **登记**：`package.json files[]` ✓ ⇒ `audit-package-membership` **13/0**；
- **执行点**：已接入 `tests/audit-declaration-criterion.test.mjs` 的 RULE A 段 ⇒ 运行输出 `EXECUTED: node scripts/audit-projection-census.mjs ⇒ exit=0`（"自证脚本必须有执行点"这条规则本身也被满足）；
- ★ **自探针（防空洞）**：往声明里**种一个不存在的面** `no-such-face-r11-probe` ⇒ 它**必须被归档并具名**（实测报 `notAttached`）⇒ 哪天普查能让它悄悄消失，**门禁自己红**。

## D · 矩阵 v10

矩阵已升 **v10**（标题＋差异说明）＋新增 **§9.14**（上述三表／门禁／自探针）＋**§9.13**（R10 收尾：静止⇒开会／异议广播／`pack.js` 模块形状路由）。R10 的闭合项已并入：能力门控服务缝／三步探针／异议广播／`ballots` 静默不挂（已修且 `12f CLOSED`）／`budget` 空对象种子／`meetingleave.js` 未登记／八键＋真读者／`control/idle` 真生产者／依赖环门禁双向修（245→246）。

## E · 保质期复跑（`loader.js`／`pack.js` 本轮都动过）

`audit-enforced-consistency` **358/0（findings=0）**｜`audit-hook-coverage` **4/0**｜`audit-hook-emit-classification` **7/0** —— 全 EXIT=0 ⇒ **loader 块健康**。

## ⚠️ 一条新红（不是我的文件，已直发 owner）

`audit-declaration-criterion` 的 **RULE E `current=68 baseline=67`（纯新增）** ＝ `+ vmu-resume-e2e.test.mjs:A:seedRows`
（`tests/vmu-resume-e2e.test.mjs:679` 的 `seedRows.every(...)`，而 `seedRows` 由 `for (const key of seedKeys)` 填充 ⇒ **空列表即空过**）。
**修法一行**：`seedRows.length > 0 && …`。**我未改他人文件、未动基线（RULE E 基线仍 67，新增者是别人的文件）。**
★ 交叉核对（普查副产品）：其 `:669` 的 `seedKeys` 只列 **9** 个面、**缺 `human`**（声明面是 **10** 个）⇒ 已一并告知：请补 `human`，或在断言里写明排除理由。

## 交回 Lead

1. **A/B/C/E 完成**：普查一次查清（静默不挂＝0）、零机制被断言、门禁进仓＋自探针＋执行点齐全、保质期复跑全绿。
2. **D 完成**：矩阵 **v10**＋§9.13／§9.14。
3. **唯一非我红**：`vmu-resume-e2e A:seedRows` 的 RULE E 纯新增（owner＝reader-a，已通知）＋你的 `regen-all --check`。
4. **边界**：普查覆盖的是**该装配在 `packs:['v5r']` 下的声明**（`vmu.resume.projections`）；**其它 pack（如 `v3-core`／`institute-min`）与框架 `infer` 面未逐 pack 跑**——若要全覆盖，需对每个 pack 组合各跑一次（门禁已具备"换 config 重跑"的形状，扩成矩阵只是加循环）。
