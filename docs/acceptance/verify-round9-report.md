# Round 9 · vmu-verify（task-67）交付报告

> 任务：`task-67`（A commitStore e2e 落盘；B F52 语义；C 矩阵 v8／证据；D 复核新键/新钩子；E 指纹）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；**未改他人文件**；未按时间窗批量删。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 读数 |
|---|---|---|
| **A `commitStore` e2e 落盘** | ✅ **19 passed / 0 failed EXIT=0** | 14 条（§6.5 原样）＋**3 条负向**＋**2 条契约反例**；RULE E 非空前置齐 |
| **B F52 语义** | ✅ **已由既有族覆盖 ⇒ 未重复造** | `vmu-activity-falsify` **10/0**（future-only／one-shot／disposer 恰一次）＋ `vmu-activity-kernel` **141/0**（`:9` SUCCESS/TIMEOUT/ABORT 逐分支）＋ `-falsify-lib` **27/0**＋`-timers` **36/0** |
| **C 矩阵 v8／证据** | ✅ | v8 标题＋**§9.7.11–9.7.14**；证据 **§10.12** |
| **D 复核新键/新钩子** | ⚠️ **无可复核对象（未落）** | 8 键 schema 命中 **0**、`control/idle` 在 `bus.js` 命中 **0** ⇒ 需 Lead 指派 owner/授权连读者改 |
| **E 指纹** | ✅ **`current=67 = baseline=67`** | 另补 **RULE A 执行点**；criterion 70/5 → **73/3** |

---

## A · `commitStore` e2e 落盘（`tests/vmu-commit-store-e2e.test.mjs` ⇒ **19/0**）

**来源**：core 报告 **§6.5**（探针 `D:\_tmp\vmu-r8\commit-store.mjs` 为**唯一来源**，14 条原样搬入；`mkStore()` 桩的契约＝**分配缺失的号、保留显式的号**，`seq` 追上更大的号）。
- **①（4）** 两内核共用一份 store：两个 `gate.durable===true`；两边未完成意图落进**同一份**日志（`≥2`）；票号**恰好 1 然后 2**。
- **②（6）** 意图先落（`ticket===1`）／崩后恰一条未完成／新进程 `recover()` 恰一条 `pending`／**幂等**（再问一次仍一条）／`complete()` 后**不再重放**／**结果行与意图行同号**。
- **③（2）** 无 store ⇒ `durable===false` ＋ `seams.commitStore===false` ＋ `commitStoreNote` 命中 `/no allocating store/`。
- **④（2）** 开机后挂载 ⇒ 挂载前 `false`、挂载后**下一个** ballot `true` ⇒ **调用时解析**。
- ★ **新增 3 条负向**：resolver **抛错** ⇒ `durable===false` ＋ `history` 记 **`commit-store-failed` / `VMU_COMMIT_STORE_FAILED`** ＋ 保留 resolver 的 message（**不丢因**）。
- ★ **新增 2 条契约反例**：一个**不保留显式 ticket** 的 store ⇒ `complete()` 的结果落到**另一个号**、意图**永远 pending** ⇒ 把 Lead 强调的"**显式 ticket 必须保留**"做成**可观测反例**（不是只写在文档里）。
- **RULE E**：集合形状断言均加非空前置（`tickets.length > 0 && …`、`store.readAll().length > 0 && …`）。

## B · F52 语义：**先查既有覆盖 ⇒ 不重复造**

按 Lead 指示先看 activity 的族：三性质**已全覆盖**，且 `vmu-activity-kernel:9` 头注即写"the timeout disposer runs on **SUCCESS, TIMEOUT and ABORT, and nowhere twice**"（`:87/:98/:115/:128` 逐分支断言）。⇒ **F52＝具备**，证据在既有族；**我未新增重复断言**（重复只增维护面、不增证据）。

## C · 矩阵 v8／证据

- **§9.7.11** commitStore e2e（19/0，含负向与契约反例）。
- **§9.7.12** F52 覆盖明细（并写明"未重复造"）。
- **§9.7.13** 值域门禁常态化：`scripts/audit-pack-value-domain.mjs` **5/0**（`--selftest` **3/0**）；**首日抓到第二个真实例**——`packs/v3-core/index.js` 的 `vmu.meetings.quorumRule:'majority'` **域外**（域＝`['m-unanimous','all-unanimous']`）⇒ pack 值**绕过 settings 边界**、且默认 tally 只当上下文标签（**声明做不到它写的事**）⇒ 已改 `'m-unanimous'`；**真多数聚合＝R1 可插拔谓词**（需 pack 注入 `createBallot` 的 `tally`）＝**具名改判条件**。
- **§9.7.14** 新红（**不是我的**）：**RULE F** —— `kernel/resume.js:599/611` 的 `toMs(...)` 未处理 `NaN` ⇒ 已通知 owner（reader-a）。
- 证据文件 **§10.12** 同步（A/B/C/D/E 全节）。

## D · 复核 core 的 B1–B4（8 键）与 `control/idle` ⇒ **未落，无可复核对象**

★ 我实测：8 键在 `settings/schema.js` **命中 0**；`control/idle` 在 `kernel/bus.js` **命中 0**。
★ **Lead 已在 `task-66` 明确授权 vmu-core 连读者一起改**（`kernel/metrics.js|prompt`、`publication.js`、`members.js|recruit.js`、`tasks.js`）＋落 `control/idle` 钩子 ⇒ **这不是待裁项，而是等落地**。**落地后我按 task-67 D 复核**：① 每键有**真读者**（`vmu-seam-params-consumed`／`vmu-settings` 会查）；② 钩子**已登记且分类**（`audit-hook-coverage`／`scripts/audit-hook-emit-classification.mjs`）。**在 core 落地前不记为具备。**
（另：`vmu-wiring-index` 的 stale 由你轮末 `regen-all` 一并清理——我不单独提单。）

## E · 指纹与门禁（我这一侧的改动）

- `RULE E fingerprints: current=67 = baseline=67` ✓（**未动基线**）。
- ★ 我补了一条**RULE A 执行点**：`scripts/audit-pack-value-domain.mjs --selftest` 原先**无人真跑**（正是该规则存在的理由）⇒ 已在 `tests/audit-declaration-criterion.test.mjs` 的 RULE A 段加 `runSelfProof(...)` ＋ 断言绿（输出 `=== PACK VALUE-DOMAIN: 3 passed, 0 failed ===`）⇒ criterion **70/5 → 73/3**。
- **剩余 3 条红都不是我的**：`regen-all --check`（Lead）＋ **RULE F**（`resume.js:599/611`，owner＝reader-a）。

## F · 命令与退出码

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-commit-store-e2e.test.mjs` | **0** | 19/0 |
| `node tests/audit-package-membership.mjs` | **0** | 13/0（新测试已登记 `files[]`） |
| `node tests/audit-declaration-criterion.test.mjs` | **1** | **73/3**（`RULE E 67=67` ✓；余＝`regen-all`＋RULE F） |
| `node tests/vmu-activity-falsify.test.mjs` | **0** | 10/0 |
| `node tests/vmu-activity-kernel.test.mjs` | **0** | 141/0 |
| `node tests/vmu-activity-falsify-lib.test.mjs` | **0** | 27/0 |
| `node tests/vmu-activity-timers.test.mjs` | **0** | 36/0 |
| `node scripts/audit-pack-value-domain.mjs`（＋`--selftest`） | **0** | 5/0（selftest 3/0） |
| `node tests/vmu-resume-e2e.test.mjs`（reader-a 新版，我复跑） | **0** | **63/0** |

## G · 交回 Lead

1. **A 落盘、B 不重复（已有覆盖）、C 回填、E 保持 67=67** 均完成。
2. **D 需要你的决定**：B1–B4 八键 ＋ `control/idle` **未落**（只落键会造孤儿）⇒ 指派 owner 或授权 core 连读者改。
3. **两条非我红**：**RULE F**（`resume.js:599/611`，已通知 reader-a）＋ `regen-all --check`（你）。另 `vmu-wiring-index` RED 由新键 `vmu.meetings.leaveApprover` 引起、待你跑 `generate-wiring-index.mjs --write`。
