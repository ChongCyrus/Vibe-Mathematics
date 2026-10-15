# Round 36 · vmu-pack（`task-171`）交付报告 —— 让"保留值＝原文前缀"**可重推**

> 任务：`task-171`。★ **先写清"要能推出什么"，再选机制**（你的要求）→ 结论：**(B) 保留可重推材料是【判据】的机制；(A) 哈希只买到【篡改可发现】，买不到前缀性**。两件都落，全绿。
> 纪律：`receiptbounds.js` 改动**未碰 `host.js`**（仍 1167/1200）✓；变异器**副本制**（真树只读＋hash 判据）；未跑全量／`regen-all`／git；未自造公开码。

---

## 1. ★★ 先把"到底要能推出什么"写清楚（再从这份清单选机制）

| 要推出的事实 | 只凭回执记录能否推出 | 需要什么 |
|---|---|---|
| `bytes === to − from`、`from`、`to` | ✅ **能**（纯算术） | 记录本身 |
| 保留段**长度**与标记一致（`from + 标记长 = 保留值长`） | ✅ **能** | 记录 ＋ 回执里的值 |
| **"保留段就是我哈希的那一段"** | ✅ **能**（重算 `keptHash`） | 记录 ＋ 回执里的值 |
| **"原文真的是 `to` 字节、哈希为 `origHash`"** | ❌ **不能**（哈希是对一个**已不存在**的串的主张） | 原文或**可重推材料** |
| ★★ **"保留段逐字符是原文的前缀"** | ❌★ **完全不能** —— **即使同时有 `keptHash` 与 `origHash` 也不行**（哈希**单向**，两个哈希之间**推不出**"一个是另一个的前缀"） | ★ **原文本身**，或**能重建原文的规则** |

⇒ ★★ **机制选择（理由）**：
- **(A) 单独加哈希 ⇒ 不满足目标**。它能证明**一致性/篡改可发现**，**证明不了前缀性** —— 而"前缀性"正是 R35 复核算不出来的那一格；
- ★ **(B) 保留【可重推材料】（确定性生成规则）才是【判据】的机制**：复核者**重建原文**后，前缀性变成**可逐字符复核**的算式 ✓；
- ★ **因此两条并用**：**(B) 提供判据、(A) 提供篡改证据**（并**如实写明各自能证什么、不能证什么**）。

## 2. 判据的可重推材料：**规则，不是字面量**（你的建议，我采纳）

测试保留 **`'ABCDEFGHIJ' × 1400 = 14,000`** 这条**确定性规则** ⇒ ★ **不往源码塞 14 KB 字面量**（`audit-code-size`／仓库体积），而**规则本身就是可重推材料**，且**比字面量更好**（可读、可核、可推广到别的长度）。

## 3. 落地：(A) 的四个字段进 `elided[]` 每条

`kernel/receiptbounds.js`，每条省略记录现在是：
```
{ path, from, to, bytes, keptBytes, keptHash, origHash, hash:'sha256' }
```
- `keptBytes`／`keptHash` **描述【回执里实际存在的那段值】**（保留前缀 ＋ 标记）⇒ 复核者**重算它**就知道"这段值有没有被改过"；
- `origHash` ＋ `to` 把**被主张的原文**钉住 ⇒ **有可重推材料时**可对账；
- `hash` **写明算法**；
- ★ **不改既有字段语义**（`path/from/to/bytes` 原义不变）；★ **每条 entry 键集合恒定（8 键）**，空态是 `elided: []` ⇒ **两态同形**（R32 教训）。

## 4. 测试：**从留存材料重建原文，再验前缀性**

`tests/vmu-elision-prefix-recomputable.test.mjs` ⇒ **13 passed / 0 failed**：

| 组 | 断言 |
|---|---|
| **A 前提** | A1 原文**可由规则重建**（14,000）；A2 确实发生了省略且记录**点名** `blob` |
| **B 核心** | B1 `to` ＝重建原文长度；B2 `bytes === to − from`；★★ **B3 重推的前缀性：`rebuilt.slice(0, from) + 标记 === 回执里的值`（逐字符，不是"声明"）**；B4 记录与**实际存在的值**一致；★ B5 `keptHash` 重算命中；B5b 裸前缀与重建原文前缀同哈希；★ B6 `origHash` 对**重建原文**重算命中；★ B7 **同字符换序不再命中** ⇒ 哈希**绑定顺序**（不只是内容） |
| **C 同形** | C1 前提（>1 条记录）；★ C2 **每条 entry 键集合完全一致**；★ C3 空态 `receiptMeta` 键集合与非空态一致（`elided: []`） |

## 5. ★ 当天反例（副本制，真树只读）

`D:\_tmp\vmu-pack36\prefix-counterexamples.mjs`：

| 变异 | 读数 | 红在哪一行 |
|---|---|---|
| CONTROL（副本未变异） | **13/0** | — |
| **M1** `from` **差 1**（＝你指定的那条反例） | **10 passed / 3 failed** | ★ **B2／B3／B4**（**B3 ＝ 前缀性断言**） |
| **M2** `keptHash` 造假 | **12 passed / 1 failed** | ★ **B5** |
| CONTROL（副本复原后） | **13/0** | — |
| ★ 真树判据 | `receiptbounds.js` md5 `33ff03a119b355f2960b873b11276d6f` **变异前后逐字节相同** ⇒ **NEVER WRITTEN=true** | — |

## 6. ★★ 还差什么（**具名，不粉饰**）

1. ★ **对【任意真实内容】前缀性仍是"声明"**：真实回执没有可保留的生成规则 ⇒ 那里**哈希只能把损害限定在"篡改可发现"**，**达不到"可重推前缀性"**。★ 要真正普遍可推，只有两条路：**留原文副本**（受尺寸上限约束）或**留一种能证明前缀关系的结构（如分段哈希链）** —— 两者都是**独立契约变更**，我没有顺手做。
2. ★ **R34 那条真机臂【本身】仍不可复核**：它的 14,000 字输入来自一个 overlay，而**盘上那份只有 10 字符** ⇒ ★ **本轮做的是【机制】**（证明"若保留规则则可逐字符复核"），**不是**"把 R34 那次读数补成可复核"。★ 要让真机臂可复核，需要**那个臂自己保留规则**（属 `vmu-assistant2` 的真机夹具，不在我范围）。
3. **测试侧我自己的两个前提错误（已修，自陈）**：① B5 第一版把 `keptHash` 当"裸前缀的哈希"，而字段语义是"**回执里实际存在的那段值**"（保留前缀＋标记）⇒ 断言写错，**改成对实际值重算**（并留 B5b 核裸前缀）；② C1 第一版用 9,000 字叶子，**第一次截断就已达标** ⇒ 只产生 1 条记录 ⇒ `>1` 的前提不成立 ⇒ 改成 **30,000 字叶子**。★ 两条都是**测试的前提错**，不是被测物的发现。

## 7. 登记与门禁

- **`package.json`**：新增 `"tests/vmu-elision-prefix-recomputable.test.mjs"`（**定点 `edit`，只加 1 行**）⇒ 计数 +1，轮末你重生成。★ **重叠具名**：你本轮的写者隔离把 **`package.json` 给了 `vmu-comms2`**，而任务又要求"新文件**当场双登记**" ⇒ ★ **我做了最小侵入（单行定点 edit）并在此具名**，请你裁；若你要我撤这一行，我立刻撤。
- ★ **`installer.js PRESETS[].files` 不适用**（测试文件不在受管预设清单里；R14 已核 `tests/` 命中 0 次）⇒ 未碰 `installer.js`。
- **改动面**：`kernel/receiptbounds.js`（新增 4 字段＋算法常量＋注释）＋ 新测试文件 ＋ `package.json` 一行。★ **未碰** `host.js`（1167/1200）／`vibe-math-vmu.js`／`vmu-comms2` 的 `scripts/**`。

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-elision-prefix-recomputable.test.mjs` | ★ **`13 passed, 0 failed`**（新） | **0** |
| `node tests/vmu-receipt-truncation.test.mjs` | **`19 passed, 0 failed`**（既有契约未破） | **0** |
| `node tests/audit-code-size.test.mjs` | `9 passed, 0 failed`（`host.js` 1167/1200） | **0** |
| `node D:\_tmp\vmu-pack36\prefix-counterexamples.mjs` | CONTROL 13/0 ⇒ M1 10/3、M2 12/1 ⇒ 真树 md5 不变 | 0 |

★ **未跑**：`vmu-entry`／`vmu-host`／`vmu-host-hooks`／`audit-status-report-fields`／`audit-enforced-consistency` —— ★ 因为**本轮没有改 `host.js`**（只改了 `receiptbounds.js` 的记录字段）；★ 但该模块**被 `host.js` 加载**，所以**我在 §7 只跑了直接相关的两条**；★ **若你要求按"两文件一动"的规矩全跑，请点名，我立刻补**（我不把它写成"已跑"）。

---

## 8. 追加：`kernel/receiptbounds.js` 的**目的头注释**（Lead 的 T1 唯一红，已清）

**原红**：`audit-kernel-index` ⇒ `FAIL every kernel module states its purpose in a header comment… {"headerless":["receiptbounds.js"]}`。
**★ 真因（不是"没写注释"）**：**头注释必须在【任何代码之前】** —— 我 R36 加 `import { createHash }` 时把它插到了**文件第 1 行**，原来那段说明注释被挤到**其后** ⇒ 生成器/审计看不到"模块头"。★ 这是**抽取/加 import 的【顺序】副作用**。

**修法**：按该目录惯例（`meetingmarker.js`／`meetingdomain.js` 同格式）在第 1 行、import **之前**写目的头，内容覆盖这两轮**实际**做进去的：
- **拥有什么**：`MAX_TOOL_RESULT_BYTES`(12000)＋`boundedToolResult(value)`（**唯一**序列化点）；**结构内、路径级省略**（只缩超长**字符串叶子**）＋ `elided[]` **8 键**（`path/from/to/bytes/keptBytes/keptHash/origHash/hash`）；`receiptMeta` **五键两态同形**（状态用**值**表达）；
- ★ **不拥有什么（具名）**：**不保证压到预算内**（只截可截叶子；真机 179,826 字符且无可截叶子 ⇒ 如实报 `truncated:false` ＋ 真 `originalBytes`）；**不消除宿主那次事后省略**（`hostElision:'possible'`，**分开报**）；**不使"任意内容"的前缀性可重推**（哈希只给篡改证据；前缀性仅当**规则被保留**时可算）；
- **零机制形状**：纯函数模块（一常量＋一函数、无 `create*`／无服务／无可探针）⇒ 与矩阵 `EXPECT_NA` 一致。

**生成块（按 Lead 指令跑、未手写）**：`node scripts/generate-kernel-index.mjs --write` ⇒ **`kernel-index: written (98 modules, 0 headerless)`**。
**审计**：★ **`KERNEL INDEX: 6 passed, 0 failed`** ✓；生成索引里已出现该模块（`docs/02-architecture.md:283`，行首即新目的句）。
★ **写者隔离具名**：本项按指令使 **`docs/02` 的生成块**变化（该目录通常归 `vmu-assistant2`）—— ★ **是生成器写的，我未手工编辑任何 docs 内容**。

### 8.1 Lead 裁的三条（照记）

1. **R34 真机臂本身仍不可复核**（overlay 只有 10 字符）⇒ ★ 属**真机夹具**（`vmu-assistant2` 的面），Lead 已记下 ⇒ **我不再处理**；
2. ★ **`package.json` 那 1 行【保留】**（新文件当场双登记是硬约束；`comms2` 本轮未改 `package.json`）⇒ **不撤** ✓；
3. ★ **⑦.1（任意真实内容的前缀性仍是"声明"）** 被收下并**排下一轮**（普遍可推需**留原文副本**或**分段哈希链** ⇒ 独立契约变更）⇒ **我没顺手做，是对的** ✓。

### 8.2 追加后的门禁

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/audit-kernel-index.test.mjs` | ★ **`6 passed, 0 failed`** | **0** |
| `node scripts/generate-kernel-index.mjs --check` | `98 modules, 0 headerless` | 0 |
| `node tests/vmu-elision-prefix-recomputable.test.mjs` | `13 passed, 0 failed` | **0** |
| `node tests/vmu-receipt-truncation.test.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-code-size.test.mjs` | `9 passed, 0 failed`（`host.js` 1167/1200） | **0** |
