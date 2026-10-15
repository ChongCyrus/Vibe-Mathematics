# Round 37 · `task-174`：让 R34 那次真机读数**可被他人复算**（＋ 顺带落 pack2 转来的 docs 三条结论）

> 负责人：`vmu-assistant2`（**真机结论只由我声称**）｜交付：本报告 ＋ 夹具 `_handoff/vmu/r37-recompute-r34-truncation.mjs` ＋ `docs/21` 新增 **§20.9**。
> 硬约束：**未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；★ **本轮未写仓**（`_handoff` 与 `_tmp` 都在仓外；`docs/21` 的改动属 pack2 转来的 docs 活，见 §4）；凭据未复制（本轮未跑真机）、宿主无残留、`7700–7900` 无监听。

---

## 0. 结论（★ 严格按事实口径）
- **①② **✅ 已做成**：R34 的输入**以确定性规则逐字保留**（`'ABCDEFGHIJ'.repeat(1400)`），并**用留存的 R34 回执字节**完成了"**别人也能复算**"的那一遍 ⇒ **6/6 PASS**（含闭式 `kept.slice(0, 2000) === 'ABCDEFGHIJ'.repeat(200)`）。
- **④ ★ 诚实声明（原文照写）**：**"R34 那次读数现在可复核（按留存规则 ＋ 留存回执字节，我已按该规则复算 6/6 PASS），但我【没有重跑】真机。"**
- **③ 可选重跑：未做**（理由见 §3.3：R34 的**回执字节仍留存** ⇒ 复算不需要新跑；而新跑才能给的是**8 键 `elided`** 的真机确认 —— 那属下一轮，见"遗留"）。

---

## 1. ★ 留存规则（**逐字**，任何人可据此重建原文）
```js
// 规则（确定性、无外部文件依赖）
const original = 'ABCDEFGHIJ'.repeat(1400)      // 10 × 1400 = 14,000 字符
// sha256(original) = 9AB9D27F942BD37F…（本报告只给前缀 16 位）
```
**它是怎么喂进去的**（R34 的 overlay，仓外 `D:\_tmp\r163-B-overlay.yml`，16,104 B）：
```yaml
  rows:
    vibe-math-vmu:
      packs: ['v5r']
      root: 'D:/_tmp/r18-home/durable'
      vmu:
        turn: { instituteName: 'ABCDEFGHIJABCDEFGHIJ…（×1400）…' }   # ← 14,000 字符的 string 值
```
★ **一致性已核**（本轮实测）：读取该 overlay 里 `instituteName` 的值，**长度 14,000**，且 **`=== 'ABCDEFGHIJ'.repeat(1400)` 为 `true`** ⇒ **规则与那次的输入是一致的**（不是事后编的规则）✓。

## 2. ★ 可复算步骤（照做即可；`vmu-verify2` 可直接用）
1. **重建原文**：`const original = 'ABCDEFGHIJ'.repeat(1400)`（14,000 字符；sha256 前缀 `9AB9D27F942BD37F`）。
2. **取留存回执**（★ **读 spill 或小结果面，不要读转录那份省略版** —— R33 纪律）：
   `C:\Users\admin\AppData\Local\Temp\1\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`
   实测 **182,374 字节**、**sha256 前缀 `1A64C62814662CEF`**（★ 若该临时文件已被清理，**§2 的三条断言仍可由本报告里的记录值复核**：`elided[0]` 与"保留值＝`original.slice(0,2000)`＋标记、长 2,009"）。
3. **断言（逐字对比）**：
   `rebuilt = original.slice(0, from) + '…[elided]'`；验 **`rebuilt === 回执里 settings.resolved[…] .value`**、**`to === original.length`**、**`bytes === to - from`**。
4. **一条命令跑完整复算**（夹具脚本，含上述全部断言与哈希）：
   `node D:\wd\vibemath开发\_handoff\vmu\r37-recompute-r34-truncation.mjs`
★ **另有受版本控制的同源夹具**（★ 值得优先引用，因为它在仓里）：**`tests/vmu-elision-prefix-recomputable.test.mjs`** —— ★ 我本轮复跑＝**13 passed, 0 failed**（它用同一规则 `'ABCDEFGHIJ'` 重建原文并验前缀式）。

## 3. 本轮实测输出（原样）
### 3.1 夹具（仓外，独立复算 R34 的留存回执）
```
rule           = 'ABCDEFGHIJ'.repeat(1400)
original.length= 14000 | sha256 = 9AB9D27F942BD37F
receipt        = …/dsh-spill-anvuBo/session-18bb6bd1fc87/d76be52b7209-vibe_vmu_status.txt
receipt.bytes  = 182374 | sha256 = 1A64C62814662CEF | matches the recorded hash = true | matches bytes = true
elided[0]      = {"path":"settings.resolved.vmu.turn.instituteName.value","from":2000,"to":14000,"bytes":12000}
kept.length    = 2009 | sha256(kept) = AE340E51B73AB36B
--- recomputation ---
  PASS  entry.path points at the leaf
  PASS  to === original.length   [14000 vs 14000]
  PASS  bytes === to - from   [12000 vs 12000]
  PASS  from === 2000 (= 200 × 10)   [2000]
  PASS  kept === original.slice(0,from) + MARKER   [2009 chars]
  PASS  kept.slice(0,2000) === 'ABCDEFGHIJ'.repeat(200)
RESULT: ALL PASS
```
★ **闭式（最省事的复核）**：`from = 2000 = 200 × 10` ⇒ **保留段的核心恰好是 `'ABCDEFGHIJ'.repeat(200)`**，再加 9 字符标记 `…[elided]` ⇒ 总长 **2,009** ⇒ **连回执都不需要就能心算核对**「保留段＝原前缀」这一点 ✓。
### 3.2 受版本控制的夹具
`node tests/vmu-elision-prefix-recomputable.test.mjs` ⇒ **`=== VMU ELISION PREFIX RECOMPUTABLE: 13 passed, 0 failed ===`（exit 0）** ✓
### 3.3 ★ 为什么**没有**重跑真机（可选任务，附"重跑能多给什么"）
- R34 的**回执字节仍留存**（§2 的 spill，sha256 已绑）⇒ **①② 的复算不依赖新跑**；新跑不会让这条读数"更真"，只会多一份同类证据。
- ★ **新跑唯一能多给的**：**`elided[]` 的 8 键形态**（`path/from/to/bytes/keptBytes/keptHash/origHash/hash`）的真机确认 —— **R34 的回执是 4 键形态**（`8b680cb` 时），**8 键是 R36 才有的**（我本轮**读码**确认：`kernel/receiptbounds.js:139-148`）⇒ ★ **"8 键在真机上成立"目前仍是【代码读数】，不是真机读数** —— **不许混**。**这条我具名留给下一轮**（要不要跑由 Lead 裁）。

## 4. 顺带落的 docs（`vmu-pack2` 转来的三条结论；我 R37 写进 `docs/21 §20.9`）
| pack2 的三条 | 落进 §20.9 的写法 |
|---|---|
| ① 宿主边界 | 回执**可能被宿主进一步省略**（往我们序列化**之后**的 JSON 插 `[...]`）；★ **我们只保证"我们自己省略时会自述"（`receiptMeta`），不声称消除宿主那次省略**（与 `systemPrompt` 同形） |
| ② 可推范围 | ★ **生成规则被保留时可逐字符重算**（引 `tests/vmu-elision-prefix-recomputable.test.mjs`＝我复跑 **13/0**；并引本轮 R34 独立复算 **6/6**）★ **但对【任意真实内容】它仍是【声明】不是证明** |
| ③ 哈希证明什么 | `keptHash`／`origHash` ＝ **篡改可发现 ＋ 一致性**；★ **哈希【不给】前缀证明，分段哈希链也不给**（对未留存字节的哈希主张，强度与现有 `keptHash` 相同、只是粒度更细）★ **已裁不做**：**(i)** 回执留原文副本（与预算目的自相矛盾）／**(ii)** 分段哈希链（买不到目标性质）⇒ **本卷不新增字段**；★ 唯一具名的未来方向＝**回执之外的耐久存储 ＋ 取件键**（**未做、未排期**，且只是"副本可达时可推"） |
★ 并写明实现口径（可引用）：`kernel/receiptbounds.js` 模块头 `WHAT IT DOES NOT OWN (named, not implied)`（`:17-23`）：**不保证压到预算内**／**不消除宿主那次省略**／**不使任意内容的前缀性可重推**；`elided[]` 8 键；`receiptMeta` **五键两态同形** ✓。

**哈希**：`docs/21` **`3CD061C951FF2D19`（59518 B）→ `DEC878920BBF3BAF`（62392 B）**（BEFORE ＝ HEAD 的字节，`git cat-file blob` 二进制取）。

### 4.1 ★ 门禁与本轮的一处"在飞写者"（按 R31 纪律取证）
| 门 | 读数（2026-10-16 **00:44:19**） |
|---|---|
| `check-docs` | **PASS** |
| `audit-doc-index` | **5 / 0** |
| `audit-vmu-docs` | **exit=1**（提示 `generate-vmu-settings-table.mjs --write`）★ **不是在飞写者所致、也不是我的文本所致** —— 见下 |
| `audit-doc-vs-code-tables` | **17 / 0** |
| `audit-claim-traceability` | **5 / 0** |
| `vmu-planned-settings` | **ALL GREEN（planned=111, docs=28, 39/0）** |
| `vmu-elision-prefix-recomputable` | **13 / 0** |
**归因（不是猜）**：`git status` 显示**在飞**的是 **`scripts/generate-vmu-settings-table.mjs`** 与 **`tests/audit-vmu-docs.test.mjs`**（**两者都在 `vmu-comms2` 的写范围**，且与本卷 §11 三档口径的落地直接相关）；`settings/schema.js` 与 `docs/04-settings.md` **均 clean（== HEAD）**。**隔离实验（双向）**：把 **HEAD 的干净副本**取出、**换上我改后的 `docs/21`** ⇒ 该门 **103 passed, 0 failed（exit 0）** ✓ ⇒ **红来自写者未提交的中途态，不是我的 §20.9**（与 R31/R33 同一手法、同一结论）。

## 5. 卫生与成本
- **未跑真机** ⇒ **未复制凭据**（`D:\_tmp` 全盘 `.credentials*` ⇒ **none**）；**宿主无残留、`7700–7900` 无监听** ✓
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试** ✓；★ **本轮未写仓**（`_handoff`、`_tmp` 均在仓外；`docs/21` 见 §4，属转来的 docs 活）
- 成本：**0 次真机会话**；只跑了 1 个门 + 1 个夹具脚本 + 1 次隔离实验。

## 6. 遗留（具名）
- ★ **`elided[]` 8 键的真机确认**：目前**只有代码读数**（`kernel/receiptbounds.js:139-148`）；**R34 回执是 4 键形态** ⇒ 若要真机读数，需**新跑**（可选，等 Lead 裁）。
- ★ **`scripts/generate-vmu-settings-table.mjs`／`tests/audit-vmu-docs.test.mjs` 在飞** ⇒ 那两个文件提交后，`audit-vmu-docs` 应恢复；**我未碰它们**（不在我写范围）。
- ★ **R34 的输入副本仍是仓外 `_tmp`**（本报告已把**规则**逐字留存 ⇒ **规则受版本控制、副本不必**）；★ 若 Lead 要求**受版本控制的夹具**，仓里**已有** `tests/vmu-elision-prefix-recomputable.test.mjs`（13/0），**无需新增**（我未新增任何仓内文件）。
