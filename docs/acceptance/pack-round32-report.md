# Round 32 · vmu-pack（`task-157`）交付报告 —— ③ 截断自述：**结构内省略（形状不变）** ＋ 一条被套件抓到的自伤回归

> 任务：`task-157`。★ 本轮**先做错、被强制套件抓到、按 Lead 裁定改对**，全过程与读数都在下面（未抹历史）。
> 纪律：`host.js`／`vibe-math-vmu.js` 一动即重跑五个套件 ✓（**全绿**）；**未自造公开码**；变异器**副本制**（真树只读＋hash 判据）；未跑全量／`regen-all`／git。
> **★ 读的是哪一版**：起点 HEAD = `c12556ed…`（R32 开工时）。

---

## 0. 结论速览

| 项 | 结果 |
|---|---|
| **③ 截断自述（形状稳定）** | ✅ **已落**：`boundedToolResult()` 做**结构内、路径级**省略；`elided:[{path,from,to,bytes}]`；`hostElision:'possible'` 只在**我们确实省略时**出现 |
| **两条判据** | ✅ ①超预算 ⇒ `truncated:true` ＋ `elided` 准确（区间/路径与真实一致）**且既有字段仍可读**；②未超预算 ⇒ **不出现 `truncated`**（反向断言 C2） |
| **当天反例** | ✅ **M1 7/9 红（B1/B3/B4）**、**M2 13/3 红（B4/B5/B6）**、**M3 15/1 红（C2）**；★ 全部**具名断言**红（非崩溃、非语法假红）；真实树 hash 前后不变 |
| **套件** | ✅ `vmu-entry` **150/0**（★ 含 `st.packs`）／`vmu-host` 107/0／`vmu-packs-active-switch` 24/0／`vmu-pack-defaults-named` 36/0／`vmu-host-hooks` 22/0／`audit-status-report-fields` 19/0／`audit-enforced-consistency` 358/0／新测试 **16/0** |
| **具名缺口** | ⚠ 见 §4：**大而无可截字符串**的回执 ⇒ 我们没截（对）但**也没能具名 `hostElision`**；试过具名 ⇒ **打破两个套件** ⇒ 已回退并**记为缺口**，请裁 |

---

## 1. ★ 我做错的那一版（自伤回归，被强制套件抓到）

**第一版实现**（已改掉，但记在此）：超预算时**用一个封套替换整个回执**
`{ok, truncated, bytes, kept, elided:[{from,to,bytes}], head, tail, hostElision, note}`
—— 即"**负载一变重，契约就换了**"。

**后果（实测，非转述）**：
| 套件 | 我改后 | 说明 |
|---|---|---|
| `vmu-entry` | **EXIT=1**（`:151` `st.packs` undefined） | 回执被整体替换 ⇒ 顶层字段消失 |
| `vmu-host` | **EXIT=1**（无 summary，崩溃） | 同上 |
| `vmu-packs-active-switch` | **5 passed / 19 failed** | 读不到既有字段 |
| `vmu-pack-defaults-named` | EXIT=1（无 summary） | 同上 |

**★ 归因靠【副本消融】**（`D:\_tmp\vmu-pack32\ablation.mjs`，真树只读）：把 `execute` 里那次调用在**副本**里退回 `JSON.stringify(await spec.run(…))` ⇒ 四个套件**全部转绿**（150/0、107/0、24/0、36/0）⇒ ★ **是我的改动**，不是别的写者。★ 我最初还把常数从 20 000 提到 24 000 试图"修好"—— **没修好**，因为真实回执在**别的配置**下已超过 24 000 ⇒ **"抬高阈值"是治标**。

---

## 2. ★★ 本次改动影响了哪些既有断言／套件（本族第四次，按要求单列）

| 受影响者 | 断言／读数 | 现在 |
|---|---|---|
| **`tests/vmu-entry.test.mjs:151`** | ★ **`st.packs`** —— Lead 指定的"必须跑的消费者" | ✅ **绿**（回执形状不变，`packs` 仍可读） |
| `tests/vmu-host.test.mjs` | 整套（回执形状被替换时崩溃） | ✅ 107/0 |
| `tests/vmu-packs-active-switch.test.mjs` | A2 等读回执字段的断言（曾 5/19） | ✅ 24/0 |
| `tests/vmu-pack-defaults-named.test.mjs` | 整套（曾崩） | ✅ 36/0 |

★ **同族前三次**（Lead 记）：R30 `applied` 形状（我自己 R25 的 B7 当场红 23/1）／R31 代表键提类型／R30 探针值。★ **本族纪律**：**改字段/回执形状 ⇒ 必须跑消费它的断言**；本轮是**套件先发现、我后知道**。

---

## 3. 正确形态（已落）

**`host.js`**：
- 具名常量 **`MAX_TOOL_RESULT_BYTES = 12000`** ＋ **`MAX_STRING_LEAF = 2000`**（都带注释说明**为什么是这些数**：真实回执在 ~23.6 kB～146 kB 量级；宿主边界实测 **24 846**）；
- **`boundedToolResult(value)`**：若序列化 > 预算 ⇒ 收集**字符串叶子**（长于 `MAX_STRING_LEAF`）并按**最长优先**就地缩短，逐条记 **`elided:[{path, from, to, bytes}]`**；
  ★ **不动键、不动数组长度** ⇒ `packs`／`faces`／`settings` 等**结构完全保留**；
  ★ 证据**可复核**：`path` 是返回对象里的定位符，`to` 是原长度、`from` 是保留长度、`bytes === to - from`，`env.blob.slice(0, from)` ＝ 原值前缀；
- 确实省略时，在**原对象上附加** `truncated:true` ＋ `originalBytes` ＋ `elided` ＋ `hostElision:'possible'` ＋ `note`（**附加**，不替换）；
- ★ **`hostElision` 与我们自己的省略分开写**：它只表示"宿主可能另外插 `[...]`"，**我们不声称能消除**。

**断言（`tests/vmu-receipt-truncation.test.mjs`，16/0）**：A 未超预算（字节相同＋**无 `truncated`**）；B 超预算（`truncated`＋**形状仍在**（`packs`/`faces` 可读）＋`elided` 路径级＋区间准确＋保留值＝原前缀＋`hostElision`＋`originalBytes`）；C **大但无可截叶子**（`truncated` **不得**出现，数组长度不变）；D 经**真实 seam**（`toHostSpec(...).execute()`）两条都成立。

---

## 4. ⚠ 具名缺口（需要裁）：大而"无可截字符串叶子"的回执

**事实**：真实回执可达 **146 150 字节**（实测某配置），但**没有超过 2000 的字符串叶子** ⇒ 我的实现**什么都不截** ⇒ 按设计**不出现 `truncated`**（正确：没截就不许声称）—— ★ **但也不出现 `hostElision`** ⇒ **宿主那次省略在这个形态下没有被具名**，而这正是最可能被宿主截的大回执。

**我试过把它具名**（给未截的大回执也附加 `hostElision`＋`note`）⇒ ★ **`vmu-entry` EXIT=1、`vmu-host` 106/1** ⇒ **消费者观察的是【键集合】**，给未截回执加键同样破坏形状。按裁定（**形状不动**）我**已回退**，并把缺口**具名**而不是重新打破消费者。

**需要的裁定（二选一）**：
- **(a)** 把"宿主边界"具名到一个**既有字段**里（不新增键），例如并入既有的 `note`／或 `faces`／或 `settingsMerge` 的某个已有子字段 ⇒ 形状不变且可读；
- **(b)** 接受该形态下**不具名**（只在报告/文档写明"大回执可能被宿主省略"）⇒ 与 `systemPrompt` 那条同形的"宿主边界"，但**不如 (a) 可机读**。
★ 我的建议：**(a)** —— 但落点必须由你定（要碰到别人的字段语义我就越界了）。

---

## 5. 当天反例（副本制，真树只读）

`D:\_tmp\vmu-pack32\structural-counterexamples.mjs`（`cpSync` 整包 → 只改副本 → 跑副本的测试）：

| 变异 | 读数 |
|---|---|
| CONTROL（副本未变异） | **16/0** EXIT=0 |
| **M1 去掉预算**（永不省略） | **7 passed / 9 failed**，具名 **B1／B3／B4** |
| **M2 `elided[].path` 造假**（指向错的叶子） | **13/3**，具名 **B4／B5／B6** |
| **M3 未截也报 `truncated`** | **15/1**，具名 **C2**（反向断言抓到） |
| CONTROL（副本复原后） | **16/0** |
| ★ 真树判据 | `host.js` md5 `1d5017e7be0c…` **变异前后逐字节相同 ⇒ 真树 NEVER WRITTEN=true** |

★ 三个变异**全部是具名断言红**（不是崩溃、不是语法假红）—— 为此我把 B 块写成**空值安全**（第一版 M1 是 TypeError 崩溃，属于"红得没说出哪条契约"，已改）。

---

## 6. 原样命令 ＋ 退出码

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-receipt-truncation.test.mjs` | **`16 passed, 0 failed`** | **0** |
| `node tests/vmu-entry.test.mjs` | **`150 passed, 0 failed`**（★ 含 `st.packs`） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node tests/vmu-pack-defaults-named.test.mjs` | `36 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-pack32\structural-counterexamples.mjs` | CONTROL 16/0 ⇒ M1 7/9、M2 13/3、M3 15/1 ⇒ 真树 md5 不变 | 0 |
| `node D:\_tmp\vmu-pack32\ablation.mjs` | 有我的改动：entry/host/defaults-named 崩、packs 5/19；**消融后四个全绿** | 0 |

★ **改动面**：`vibe-math-vmu/host.js` ＋ **新测试文件** `tests/vmu-receipt-truncation.test.mjs`（**已双登记** ⇒ 计数 +1，**轮末由 Lead 重生成**）。★ **未碰** `vibe-math-vmu.js`（本轮无需改）／`scripts/**`／`kernel/**`／`docs/**`；`meetings.js` 未碰；未自造公开码。

---

## 7. 交回 Lead

1. **③ 已按你的裁定重做**：**结构内、路径级**省略（**形状不变**）；两条判据都钉住（含**反向断言**）；`vmu-entry:151 st.packs` **已绿**。
2. **我第一版是错的，且被套件抓到**（第 4 次"改形状打破消费者"）；**副本消融证明是我的改动**（不是别的写者）；★ 我试图用"抬高阈值"救它 —— **无效**，已在报告里写明是治标。
3. **★ 请裁 §4 的缺口**：大而无可截字符串叶子的回执，**没法在不新增键的前提下具名宿主边界**；**(a) 并入既有字段**（我建议）／**(b) 接受不具名**。落点由你定，我不越界动别人的字段语义。
4. **门禁**：你点的五个 ＋ 其余**全绿**（见 §6）；反例器**副本制**（真树 hash 判据在 §5）；**报告已加"本次改动影响了哪些既有断言／套件"一栏**（§2）。

---

## 8. 追加：`host.js` 越 1200 行硬上限 ⇒ **抽取**（Lead 的 T1 红，已清）

### 8.1 净减证明（`split('\n').length`）

| 时点 | `host.js` 行数 | 说明 |
|---|---|---|
| **抽取前** | **1231** | 越 1200 上限 **31 行**（`md5=1d5017e7be0c2305d9b3c6e409837d3d`） |
| 抽出的块 | **84 行** | 由**内容**定位（不是数行）：起 `/**`（含 `ROUND 32 / task-157` 契约注释）→ 止 `boundedToolResult` 的 `}`；★ 断言先跑、脏了**中止不写**（第一次因尾部空行被挡下，**未产生任何写入**） |
| 新加回 `host.js` | **4 行** | 1 行 import ＋ 3 行**再导出**（保持公开面不变） |
| **抽取后** | **1151** | ★ **净减 80 行**，距上限**余量 49**（不是刚好 1200） |

★ **未动上限、未往 `KNOWN` 加名字**（`KNOWN` 仍是 `math-computation.js`／`settings/schema.js`／`kernel/index.js`）。
★ **公开面不变**：`host.js` 仍 `export { boundedToolResult, MAX_TOOL_RESULT_BYTES }`（再导出）⇒ 消费它的断言**无需改**；调用点保留 `return boundedToolResult(await spec.run(args || {}, exec))` ✓。

### 8.2 新模块 ＋ **当场双登记**

- 新模块 **`vibe-math-vmu/kernel/receiptbounds.js`**（**91 行**；**自足**：只用 JSON／普通对象）。
- **`package.json`**：`"vibe-math-vmu/kernel/receiptbounds.js"`（紧随 `meetingdomain.js`）。
- **`installer.js`**：vmu 预设 `files:` 内 `'kernel/receiptbounds.js'`（**相对 `src`、无前缀**，与同排 `'kernel/meetingdomain.js'` 形式一致）。

### 8.3 零机制矩阵：**从闭集挑词**（不猜）＋ 证据链

**★ 闭集（读到的原文）**：`:30` 「三种登记值：形状 ✓／`EXPECT_UNDECIDED`（显式待办，不红但计数 ✓）／**`EXPECT_NA`（非服务模块 ✓）**」；`:237` `if (!factoryKey) … '跳过（非服务模块）'`。
**★ `receiptbounds` 实际形态（逐字对应）**：一个常量 `MAX_TOOL_RESULT_BYTES` ＋ 一个纯函数 `boundedToolResult(value)` ⇒ **无 `create*` 工厂、无服务、无可探针** ⇒ 对应 **`EXPECT_NA`**。
★ **同类别先例（同一格，不是类比）**：`:176` `contentvalue` ＝「纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；**轮 9 从 `resume.js` 抽出（该文件越过 1200 行 ⇒ 拆分，未往 `KNOWN` 加名字 ✓）**」⇒ **与本模块"为何存在"完全同因**。
⇒ `receiptbounds: G('EXPECT_NA', …)`。**结果**：`ZERO-MECHANISM MATRIX: 98 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 5 n/a`，**无 `FINDING receiptbounds`** ✓。

### 8.4 ★ 我在这条上踩了一次（**假正例**，记下来）

第一版 note 我写了「由 `tests/vmu-receipt-truncation.test.mjs` **16/0** 覆盖 ✓」⇒ 生成器判红：
`FINDING receiptbounds: EXPECT 的 note 里写着**手写键数**…✗`
**真因**：检测正则 `/(\d+\s*\/\s*\d+…|\d+\s*(已接|未接|wired|planned))/` 把 **`16/0`** 当成"17 键中 14 已接"那类**手写键数** —— 我写的是**测试读数**，不是键数，**正则无法分辨**。
**处置**：**删掉 note 里的计数**（改为"由该测试覆盖 ✓"），★ **没有改检测器** —— 因为规则**意图是对的**：**note 只写【形状与理由】，计数由生成器从模块自己身上实测输出**；我那句 `16/0` 正是"会被时间变成假话的读数"（同类，只是来源不同）⇒ **与规则意图一致，且是改我这边、不是把门放宽**。

### 8.5 抽取后重跑（原样读数）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/audit-code-size.test.mjs` | ★ **`9 passed, 0 failed`**（`host.js` 1151 ≤ 1200，`unrecorded` 清空） | **0** |
| `node tests/vmu-receipt-truncation.test.mjs` | **`16 passed, 0 failed`** | **0** |
| `node tests/vmu-entry.test.mjs` | ★ **`150 passed, 0 failed`**（**`st.packs` 那条**） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/audit-package-membership.mjs` | **`29 passed, 0 failed`**（双登记后） | **0** |
| `node scripts/generate-zero-mechanism-matrix.mjs`（无 `--write`） | `98 modules, 0 mismatches, 0 unregistered`；★ **无 `FINDING receiptbounds`** | 0（见 8.4） |

★ **`regen-all --check` 的 zero-mechanism 格**：行已补、`FINDING` 已清 ⇒ 待你跑 `--write` 更新 `docs/11` 生成块后应回 **15/15**。
★ **写者隔离（具名）**：本项按你指令改到 **`scripts/generate-zero-mechanism-matrix.mjs`**（该文件上轮归 `vmu-comms2`）—— **是你直接指派**；我只加了 1 行登记（＋注释）并做了 1 处措辞修正，**未动其它行、未动检测器**。
