# vmu 交接 · Round 11 · task-88 报告（三步探针进仓 ＋ 清单形状/能力门禁）

- 任务：`task-88`（vmu-pack）· 纪律：未跑全量/`regen-all`/未 git；临时文件 `D:\_tmp`；**新文件当场登记**；**不臆造常量**。
- 本轮新增：**`tests/vmu-stall-meeting.test.mjs`**（18/0）＋ **`scripts/audit-pack-middleware-shape.mjs`**（7/0，`--selftest` 6/0）；两者均已进 `package.json` 的 `files`；`docs/10`／`docs/27` 同步。

---

## A. 把 R10 的"仓库外探针"搬进仓当常驻断言 · **已落**

**新文件**：`tests/vmu-stall-meeting.test.mjs`（house 风格：命名断言＋计数＋非零退出）。它守住的正是 R10 在 `D:\_tmp` 里跑过的那条链路，并补两条纪律：

| 段 | 断言 | 为什么 |
|---|---|---|
| **形状** | `meta{id,apiVersion}`；`capabilities` 含 `trigger-workflow`；唯一 hook＝`control/idle` | loader 会校验这三样；能力决定服务缝是否解锁 |
| **阈值不硬编码** | `STALL_RATIO === 3`；`360000=3×120000` 开、`359999` 不开；**换声明值 60000 ⇒ 门槛 180000**（`179999` 不开） | **后一对**只有"用声明的 `afterMs` 算"才能过 —— 写死 360000 会同时挂掉两条 |
| **零机制** | `afterMs=0` ⇒ 什么都不做 | 未声明空闲即无机制 |
| **STEP 1** | 真控制面 `kernel.idleState()` 报出空闲**边沿**（`idle:true, emitted:true`），**同一 episode 第二次 `emitted:false`** | 边沿触发＝不重复开会 |
| **STEP 2** | `control/idle` 上**恰一条**条目、`on===['control/idle']`、带 `trigger-workflow` | 模块真进了总线且带对能力 |
| **STEP 3** | 在**真 `vmu.meetings` 面**上包一层观测 ⇒ `open()` **真被调用**，形状 `kind:'stall'`、`type:'ordinary'` | 不信 handler 的自述，只看真面被调用 |
| **反向** | 短空闲（130000 < 360000）不开；差 1ms 不开 | 门槛两侧都要证 |

**读数**：`node tests/vmu-stall-meeting.test.mjs` → **18 passed / 0 failed（exit 0）**。

**登记（双登记口径，附实测）**：
- **shipped 名册**：`package.json files[]` 已加 `tests/vmu-stall-meeting.test.mjs` 与 `scripts/audit-pack-middleware-shape.mjs` ✓。
- **托管名册**：`installer.js` 的 `PRESETS[].files` **只列随预设出货的运行时文件**，实测**不含任何 `tests/` 或 `scripts/` 条目**（`tests/`→false、`scripts/`→false）⇒ 这两个新文件**按本卷口径不进托管名册**；两份安装器门禁仍 `ALL GREEN`（`audit-installer-policy`／`audit-installer-compat`）。
- 另：R10 的 `packs/v5r/middleware/stall-meeting.js` **已在**两份名册里（`files[]` ✓ ＋ `installer.js` ✓）—— 我复核过，未重复添加。

## B. 清单形状/能力匹配门禁 · **已落**（`scripts/audit-pack-middleware-shape.mjs`）

**口径**（每条 pack 清单中间件都必须"形状配得上能力"）：
1. **inline `handler`** ⇒ **不得**伸手要 `api`（总线路径**没有** `api`；源码出现 `api.services`／`api.` ⇒ **红**）；也**不得**声明 `trigger-workflow`（只有 loader 路径能兑现）；
2. **module 形状**（`module:`／`file:`）⇒ **必须**有 `module.meta.apiVersion`、非空 `module.capabilities`、非空 `module.hooks`；**用 `api.services` ⇒ 必须声明 `trigger-workflow`**（条目自身也要声明 —— loader 同时校验条目能力）；
3. **裸路径**（既无 `handler` 也无 `module`/`file`）⇒ **红**；`kind: script|plugin` ⇒ **红**（总线上不存在）。

**§1 实测**（4 条条目全过）：`packs/v3-core :: v3-core-verifier-quorum`／`v3-core-manual-gate`（inline）· `packs/v5r :: v5r-core-settled-records-only`（inline）· `packs/v5r :: v5r.stall-meeting`（module object）。
**§2 自探针**（6/0）：① inline 伸手要 `api` ⇒ **必红**；② inline 声明 `trigger-workflow` ⇒ **必红**；③ module 用 `api.services` 但缺 `trigger-workflow` ⇒ **必红**；④ 裸路径 ⇒ **必红**；⑤ 干净 inline ⇒ **不误报**；⑥ 正确声明的 module ⇒ **不误报**。
**读数**：正常 **7 passed / 0 failed（exit 0）**；`--selftest` **6 passed / 0 failed（exit 0）**。

> ⚠️ **已知瞬时红（预期，需 vmu-verify 一行）**：`tests/audit-declaration-criterion.test.mjs` 的 **RULE A**（"每个自证模式必须**真的被某个门禁跑过**"）现在报
> `audit-pack-middleware-shape.mjs implements --selftest but no gate REALLY RUNS it` —— 因为执行点写在该文件里（**tests 归 vmu-verify**）。**修法一行**：在 `tests/audit-declaration-criterion.test.mjs` 的 `valueDomainRun` 附近加
> ```js
> const middlewareShapeRun = runSelfProof('audit-pack-middleware-shape.mjs', '--selftest')
> ```
> （并把它并入该文件的"全部自证模式都真跑过"断言）。**同一文件另两条红与本轮无关**：`regen-all --check really runs green`、`RULE E fingerprint set … vmu-resume-e2e.test.mjs:A:seedRows`（都不是我的文件）。

## C. 文档 · 已同步

- `docs/27 §6`：新增"与本卷相关的新门禁/常驻断言（轮 11）"两条（**点名** `scripts/audit-pack-middleware-shape.mjs` 与 `tests/vmu-stall-meeting.test.mjs`），并写明 shipped／托管两册的口径与实测。
- `docs/10 §4.10`：三步探针条目改为"**已进仓常驻**"（`tests/vmu-stall-meeting.test.mjs` 18/0），并新增"**形状与能力匹配门禁**"条目（口径＋自探针＋当前读数）。
- `docs/05/06`：**未改**（本轮零钩子语义、零管线变化；钩子登记与 emit 在 R10 已闭合）。

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-stall-meeting.test.mjs` | 0 | **18 passed, 0 failed**（三步 ＋ 反向 ＋ 阈值不硬编码） |
| `node scripts/audit-pack-middleware-shape.mjs` | 0 | **7 passed, 0 failed**（4 条清单条目全过） |
| `node scripts/audit-pack-middleware-shape.mjs --selftest` | 0 | **6 passed, 0 failed**（四类坏条目必红、两条干净不误报） |
| `node scripts/audit-pack-value-domain.mjs` | 0 | 5 passed, 0 failed（R9 门禁仍绿） |
| `node scripts/check-docs.mjs` | 0 | **DOC LINT: PASS**（`docs=30 issues=0`） |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed（新 pack 文件被 `docs/27` 点名） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-entry.test.mjs` | 0 | 150 passed, 0 failed |
| `node tests/vmu-loader.test.mjs` | 0 | 28 passed, 0 failed |
| `node tests/audit-installer-policy.test.mjs` | 0 | ALL GREEN（登记未破坏托管口径） |
| `node tests/audit-installer-compat.test.mjs` | 0 | ALL GREEN |
| `node tests/audit-hook-coverage.test.mjs` | 0 | 4 passed, 0 failed |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | 7 passed, 0 failed |

**非我红**：`tests/audit-declaration-criterion.test.mjs` **exit 1** —— ① **RULE A** 缺 `audit-pack-middleware-shape.mjs --selftest` 的执行点（**一行，已给 vmu-verify**）；② `regen-all --check` 那条（Lead 的轮末 regen）；③ **RULE E fingerprint** `vmu-resume-e2e.test.mjs:A:seedRows`（reader-a／verify 的套件）。

## 未做项 / 待他人

1. **RULE A 执行点一行** ⇒ vmu-verify（给了精确代码）。
2. 矩阵回填（R11 两条：**三步探针已进仓**、**形状/能力门禁**）⇒ vmu-verify。
3. `regen-all --check` 与 RULE E 两条非我红 ⇒ 各自 owner。
