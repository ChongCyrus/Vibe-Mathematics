# Round 34 · vmu-pack（`task-165`）交付报告 —— `appliesFrom` vs `appliesAt` 统一 ＋ `note` 措辞更正

> 任务：`task-165`。★ 交付：**(1) 取证（两名字的全部产出/消费点）✅、(2) 裁定＋同值别名＋移除条件 ✅、(3) 代码落地 ✅、(5) 别名同帧可读 ✅**；★ **未落：(3) 的常驻断言与 (4) 当天反例**（见 §7，具名）。
> 纪律：`host.js` 一动即重跑套件 ✓（**全绿**）；未跑全量／`regen-all`／git；未自造公开码；**副本制**反例器纪律沿用。

---

## 1. ★ 取证（步骤 1：`file:line`，未假设"只有一处产出"）

| 名字 | **产出点** | **消费点** |
|---|---|---|
| **`appliesAt`** | `kernel/index.js:1945`（写入回执，**H2＋实测活读者**的 F3 变体）、`:1982`（`APPLIES[g.hot]`）、`:1987`（审计行镜像） | ★ **4 个测试**：`vmu-assistant-e2e:241/243/245`、`vmu-assistant-host-slice:296/467`、`vmu-assistant-report:286/299`、**`vmu-kernel:636`** |
| **`appliesFrom`** | **`host.js:617`（唯一产出点）** | `vmu-host.test.mjs:228/231/234/250/325-327`（★ `:326` 写着"derived from `kernel.appliesTable()` for every class"） |

⇒ ★ **同一事实、两个名字**：内核从 `APPLIES` 表产出并**按实测活读者细化**；工具面**自己又从同一张表算一遍**。

## 2. ★★ 裁定：统一到 **`appliesAt`**，`appliesFrom` 保留为**同值别名**

**理由（三条，按强度）**：
1. **`appliesAt` 是产出侧与消费侧都更广的名字** —— 内核 **3 处产出**、**4 个测试消费**；`appliesFrom` 只有 **1 处产出**、1 个测试消费；
2. ★ **它携带更强的值**：`:1945` 能在 H2 上按**实测活读者**细化（F3），而 `host.js:618` 的表值**结构上给不出**这一点；
3. **内核是 `APPLIES` 表的拥有者** ⇒ 名字应跟着**事实的来源**走，而不是跟着消费者。

**别名与移除条件（具名）**：
- `appliesFrom` **保留为同值别名**，与 `appliesAt` **同一帧**（`appliesFrom: appliesAt`）⇒ ★ **不是"有条件的键"**（实测两键在两条臂上都存在，见 §5）；
- ★ **何时可以移除**：当 **`tests/vmu-host.test.mjs` 不再读它**（`:228/:231/:234/:250/:325-327`）**且**以下范围的外部搜索为**空**：`tests/**` ＋ `vibe-math-vmu/**` ＋ `docs/**`（★ 搜索口径：正则 `appliesFrom`，排除 `node_modules`／`.git`／`_handoff`）—— ★ 本轮该搜索**命中的全部就是上表那 6 行**（★ "我没找到"以**这个范围与技术**为准，不是"我看了几眼"）。

## 3. ★★ 落地中发现：这不只是改名，而是**修掉一个精度缺口**

`host.js` 现在**优先取内核回执的值**（`setReceipt.appliesAt`），仅在**内核没有回执**的两种情形回落：**planned 键**、**未声明键**。

**真入口实测（`D:\_tmp\vmu-pack34\applies-evidence.mjs`，`vibe_vmu_set` 真调用）**：

| key | `appliesAt` | `appliesFrom` | 同名同值 | 备注 |
|---|---|---|---|---|
| `vmu.turn.instituteName`（H2＋实测活读者） | **"this session for the measured live readers (kernel/prompt via a `{{ setting:<key> }}` variable (per assembly)); declared class H2, so construction-time readers see it next start"** | 同 | ✅ **true** | ★ **修前工具面只会说表里的粗值**（`next session (restart required)`）⇒ **值被升级为内核的实测披露** |
| `vmu.a11y.checkScope`（planned） | **"never yet (planned key: no runtime consumer)"** | 同 | ✅ **true** | ★ planned 披露存活 |
| 两键是否都在 | `appliesAt` ✅ / `appliesFrom` ✅ | — | — | ★ **无"有条件的键"** |

⇒ ★ **"同一事实必须同名同值"** 现在是**代码保证**（同一个局部量赋给两个键），不再是"两边各算一遍但愿它们相等"。

## 4. ★ 套件抓到我一次【优先级】错误（照实记）

第一版我把**内核值放在 planned 判断之前** ⇒ 实测 `vmu.a11y.checkScope` 的 `appliesAt/appliesFrom` 变成 **`"next turn"`**（表值），**把 planned 键"还没有消费者"的披露吃掉了** ⇒ `vmu-host` **106/1** 当场红。
★ **真因**：planned 键**也会**产生内核回执 ⇒ 我的新分支**静默覆盖了更强的披露** —— 而"settable but inert"正是这份回执存在要防的陷阱。
★ **修法**：**planned 判断优先**（"没有消费者"是比热类更强的事实），其余情形才取内核值 ⇒ **`vmu-host` 107/0** ✓。
★ 这是本会话又一次"**套件先发现、我后知道**"（与 R32/R30 同族）；也是**消费侧断言必须跑**的又一例。

## 5. Lead 指出的 `note` 措辞与实测不符 —— **已修**（`kernel/receiptbounds.js`）

**原措辞**：`… were elided BY US **to reach** MAX_TOOL_RESULT_BYTES (12000)` ⇒ 声称**已达预算**。
**实测（真机）**：放 14,000 字符串后**截后仍 ≈181.7 kB**（`originalBytes 193,684 − 12,000`），因为**其余叶子都 < 2,000**。
★ **`truncated:true` 的语义是"按契约截了可截的叶子"，不是"已压到 12,000 内"** ⇒ 措辞已改为
**`… were elided BY US TOWARD MAX_TOOL_RESULT_BYTES (12000): … ONLY cap-able leaves can be shortened, so this does NOT claim the budget was reached …`**
★ 你判得对：`note` 是契约的一部分，**说"已达预算"而事实没有，就是一处"声明↔实现不一致"**；这与本项目"读数必须与事实同形"是同一条。

## 6. ★ R33 那条"差异"按你的说明闭合

`c7950ce` 时 **`receiptMeta` 尚不存在**（task-161 落进 `8b680cb`），且 status 面**最长叶子 378** ⇒ **当时必然无标记** ⇒ ★ **不是缺陷**。现在**两形态键集合一致** ✓（本轮 §5 的措辞修正也只动 `note` 文案，不动键集合）。

## 7. 未落（**具名**）

★ 任务步骤 **(3) 的常驻断言**与 **(4) 的当天反例** **我未落**（预算耗尽），**只给了真入口的即时证据**（§3 的探针）。★ **因此本轮不能声称"两名字不一致会被套件挡住"**——现在挡住它的是"同一个局部量"这个**代码事实**，不是一条**断言**。★ 需要的后续（约 3 处）：
1. 在**我自己的**新测试文件里（避免与 `vmu-comms2` 本轮 `tests/**` 的写者重叠）走**真入口**调 `vibe_vmu_set`，断言 `appliesAt === appliesFrom` 且**两键都在**（planned／普通各一例）；
2. **副本制反例**：把 `appliesFrom: appliesAt` 改成 `appliesFrom: APPLIES[def.hot]`（或 `'diverged'`）⇒ **必须红**；
3. 记录 `appliesFrom` 的**移除条件**已写进 §2（★ 若你要，我可以把它也做成一条**具名待办**而不是散文）。
★ **另**：`appliesAt` 与 `appliesFrom` 的**键集契约**（"两键恒存在"）也建议随上面的断言一起钉住（否则将来又可能变成"有条件的键"）。

## 8. 门禁（本轮读数，全绿）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-host.test.mjs` | ★ **`107 passed, 0 failed`**（含 `appliesFrom` 6 条） | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed`（含 `appliesAt`） | **0** |
| `node tests/vmu-receipt-truncation.test.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node tests/vmu-pack-defaults-named.test.mjs` | `36 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/audit-code-size.test.mjs` | ★ `9 passed, 0 failed`（`host.js` **1167/1200**，余量 33） | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` | **0** |

**改动面**：`vibe-math-vmu/host.js`（`vibe_vmu_set` 回执：同值双名＋优先级）＋ `vibe-math-vmu/kernel/receiptbounds.js`（仅 `note` 文案）。★ **未新增文件** ⇒ 计数不增；**未碰** `vibe-math-vmu.js`／`scripts/**`／其它 `kernel/**`／`docs/**`；`meetings.js` 未碰。
