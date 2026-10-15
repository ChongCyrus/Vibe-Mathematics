# task-48 Round 6 · falsify 第 4–5 族 ＋ 配方降到 10 行（`vmu-activity` 交付报告）

> 继续 Round 5 的推广：**现在共 5 个族、10 个单点缺陷**，全部"未变异绿 / 变异红"。
> 依据：`tests/_lib/falsify.mjs`（Round 4 建库、Round 5 加家族形态、本轮加 10 行最简式）。
> 纪律：未跑全量 sweep、未 `regen-all`、未 git；变异体只写 `D:\_tmp` 且自建自删（有断言）；**未改任何他人测试**。

---

## 1. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| **第 4 族** | `resume` 的**写前必读闸**（v5r `V5_STATE_NOT_LOADED` 规则） | `tests/vmu-resume-falsify.test.mjs`（**9/0**；2 处单点变异） |
| **第 5 族** | `fidelity` 的 **C-45 弃权改写**（"唯一强制点"） | `tests/vmu-fidelity-falsify.test.mjs`（**10/0**；2 处单点变异） |
| C · 配方 | **10 行最简式**（库头注释）＋ 导出为字符串常量 ＋ 自证 | `tests/_lib/falsify.mjs:54`（`MINIMAL_FAMILY_EXAMPLE`）、头注释 `:22-40`；自证在 `tests/vmu-activity-falsify-lib.test.mjs §4`（5 条断言，含"恰好 10 行"与"配方点名的 API 必须真的被导出"） |
| — | 本报告 | `_handoff/vmu/activity-round6-report.md` |

---

## 2. A · 第 4 族：`kernel/resume.js` 的写前必读闸

**不变式**：*"an unread snapshot must never be overwritten"*（`resume.js:407-413` 的 `requireRead`；写路径 `write`:418 / `patch`:432 / `nextId`:447 三处都过它）。

**探针读数**（三段，各带控制方向）：
- **从未读过** ⇒ 写被**具名拒** `VMU_RESUME_WRITE_BEFORE_READ`，且 store 里 **0 个键落地**（`status().writeRefusals` 计数 +1）；
- **读本身失败**（`store.export()` 抛错）⇒ 读拒绝 `VMU_RESUME_UNAVAILABLE`，**锁仍关着**：随后的写仍被拒，仍 0 键落地；
- **控制**：读成功后，**同一个写**成功落地（1 键）——所以"没落地"不是空转。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| 写路径**跳过**闸门 | `resume.js:418`（`requireRead('write durable key ' + String(key))` 整行删除） | `beforeReadCode:null`、`landedBeforeRead:1`（未读的快照被覆盖） |
| **读失败也照写**（闸门本身失效） | `resume.js:408`（`if (!readOk) {` → `if (false) {`） | `afterFailedReadCode:null`、`landedAfterFailedRead:1`（"读不出来的快照"也算读过了） |

---

## 3. B · 第 5 族：`kernel/fidelity.js` 的 C-45 弃权改写（按价值挑的那一族）

**为什么挑它**：Round 3/4 的文档把它写成"**唯一强制点**、**不可由 pack 关闭**"（`docs/03` 的 `vibe_vmu_fidelity` 行、`fidelity.js:126` 的注释）。一条"不可关闭"的强制点，**最需要**变异证明——否则它只是注释里的承诺。

**不变式**：被登记为"对该对象声明了忠实性缺陷"的成员，其**布尔票（1/0）一律被改写为 0.5 弃权**（`fidelity.js:130-143`），并留耐久 marker。

**探针读数**（一个强制点 ＋ 三条边界，每条都是控制方向）：
- 被登记者 `declared:1` ⇒ `vote:0.5, enforced:true, reason:'fidelity-defect'`；`declared:0` ⇒ **同样** 0.5（是弃权，不是钳制）；
- **另一位成员**（同对象）⇒ 原样 1；**同一成员的另一对象** ⇒ 原样 1（缺陷是 per (object, member) 的）；
- **已经是非布尔值**（0.3）⇒ 原样通过（只改写布尔断言）；
- marker 与 `view().enforcedVote` 都是 0.5，`view().abstentionsEnforced` 计数。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| 布尔改写被**跳过** | `fidelity.js:136`（`if (!(declared === 0 || declared === 1)) {` → `if (true) {`） | `oneVote:1`、`zeroVote:0`、`oneEnforced:false`、`abstentionsEnforced:0`（有缺陷的成员的 1 与 0 **都成为结论**，C-45 消失且无人计数） |
| 弃权值**漂移**（0.5 → 0.25） | `fidelity.js:30`（`FIDELITY_ABSTENTION_VOTE = 0.5`） | `oneVote:0.25`、`markerVote:0.25`、`enforcedVote:0.25`（"弃权"悄悄变成一张 0.25 的软票，marker 与视图一起漂） |

---

## 4. C · 配方降到 **10 行**（最简式，已写进库头 ＋ 导出为常量）

```js
 1  import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
 2  import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
 3  const MOD = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu/kernel/<face>.js')
 4  async function probe(mod) {                    // ← THE INVARIANT, with a CONTROL direction
 5    const a = mod.create<Face>({ clock: () => 1000, log: () => {}, settings: {} })
 6    return { good: /* the good path really happens */, bad: /* the bad path, NAMED */ }
 7  }
 8  const family = await falsifyFamily({ name: '<face>', cases: [{ name: '<face>.js', module: MOD, probe,
 9    mutations: [{ label: '<defect>', find: '<unique anchor>', replace: '<defective version>' }] }] })
10  if (!family.ok) { console.error(formatFamilyReport(family)); process.exitCode = 1 }
```

- 这 10 行里**只有第 4–7 行（探针）是真工作**：它必须同时给出"好路径真的发生"与"坏路径的**具名**结果"（第 6 行）。其余 6 行是库的契约。
- **不是口头承诺**：`MINIMAL_FAMILY_EXAMPLE`（`falsify.mjs:54`）就是这个字符串，`tests/vmu-activity-falsify-lib.test.mjs §4` 断言它**恰好 10 行**、点名 `falsifyFamily`/`formatFamilyReport`/`probe`/`mutations`/`CONTROL`，并且**它点名的每个库符号都真的被导出**（配方与 API 不会各自漂移）；同一节还断言 `falsifyFamily({cases:[]})` 以 `MUTATION-NOT-APPLIED` 拒空家族（**永不空过**）。
- Round 5 的 30 行配方仍然有效（多了控制组断言与逐条具名断言）；本轮的 10 行式是"先接上、再加固"的入口。两族的实际文件：`vmu-resume-falsify.test.mjs`（~50 行含控制组断言）、`vmu-fidelity-falsify.test.mjs`（~55 行）——**接一个族的最小成本就是"探针 + 一条变异"**。

---

## 5. 原样命令与退出码（定向单跑）

```
node tests/vmu-resume-falsify.test.mjs       -> === VMU RESUME FALSIFY: 9 passed, 0 failed ===       exit=0
node tests/vmu-fidelity-falsify.test.mjs     -> === VMU FIDELITY FALSIFY: 10 passed, 0 failed ===    exit=0
node tests/vmu-mailbox-falsify.test.mjs      -> === VMU MAILBOX FALSIFY: 10 passed, 0 failed ===     exit=0   (Round 5 族，未回归)
node tests/vmu-chat-falsify.test.mjs         -> === VMU CHAT FALSIFY: 8 passed, 0 failed ===         exit=0
node tests/vmu-panel-falsify.test.mjs        -> === VMU PANEL FALSIFY: 9 passed, 0 failed ===        exit=0
node tests/vmu-activity-falsify-lib.test.mjs -> === VMU FALSIFY LIB: 22 passed, 0 failed ===         exit=0   (+5 条 10 行式自证)
node tests/audit-declaration-criterion.test.mjs -> 74 passed, 1 failed                               exit=1   (RULE E 指纹 current=67 baseline=67：我的文件零新增)
node tests/audit-scope-classification.test.mjs  -> 38 passed, 0 failed                               exit=0
node tests/audit-code-size.test.mjs             -> 9 passed, 0 failed                                exit=0
node tests/audit-dependency-cycles.test.mjs     -> 5 passed, 0 failed                                exit=0
node tests/audit-vmu-orphan-methods.test.mjs    -> 4 passed, 0 failed                                exit=0
```

**唯一一条红不属我**：`audit-declaration-criterion` 的 `regen-all --check really runs green`（生成链，Lead 的 regen 步骤）。
（两个新文件里的 `family.results.every(...)` 都**同带** `family.results.length > 0 &&`，所以 RULE E 指纹**零新增**——Round 5 踩过的坑本轮没有重演。）

---

## 6. 累计覆盖（5 个族 / 10 个单点缺陷）

| 族 | 面 | 不变式 | 变异数 |
|---|---|---|---|
| 1 | `kernel/mailbox.js` | ack 只在投递成功之后 | 2 |
| 2 | `kernel/chat.js` | 配额与禁言真的强制 | 2 |
| 3 | `kernel/panel.js` | 子任务字段真的写入 ＋ 状态词表真的校验 | 2 |
| 4 | `kernel/resume.js` | 未读的快照永不被覆盖（含"读失败不算读过"） | 2 |
| 5 | `kernel/fidelity.js` | C-45：布尔票被强制改写为 0.5 弃权，且值就是 0.5 | 2 |

---

## 7. 未做项 / 下一轮候选

1. **`human` 审批闸**与 **`tasks` 环检测**未做（本轮按价值挑了 `fidelity`）：两者都是显式单点检查（`human` 的 `gate` 排队 vs 放行；`tasks.validateDeps` 的环检测），按 §4 的 10 行式各约 30–50 行可接。
2. **每族只证 2 条不变式**，其余（如 `resume` 的 `readBack` 漂移、`fidelity` 的 `loadDefects` 重载）**未**证伪——如实登记，不假装覆盖。
3. **10 行式只覆盖单探针单变异**；多探针/多模块的家族仍用 Round 5 的完整形态（`falsifyFamily` 的 `cases` 数组）。
4. **未跑**：全量 sweep、`regen-all`、`git`（Lead 统一）。
5. **临时文件**：两族的变异体全部由库写进 `D:\_tmp` 并在 `finally` 删除（每个文件都有 `leftovers.length === 0` 断言）；我的 scratch 无残留。
