# Round 37 · task-175 · ① 收旧两值文案断言 ＋ ② `export*`/解构（设计·没核）＋ ③ 最小数据流（**已落**）＋ ④ 可选（未做）

> 纪律：表体/生成块不手写；反例副本制＋**变异落地自检**；未跑全量（T0/T1 归 Lead）；未 git；`D:\_tmp\v36`。

## 1. ① 收掉"同意图的旧两值文案断言"（**已收**）

- **删掉的原文（逐字，打印自替换器）**：
```
  ok(unmarkedRows.length === 0, 'every settings row states whether the key is WIRED (no silent promises)',
    unmarkedRows.slice(0, 3).map((r) => (r.split('|')[1] || '').trim()).join(','))
```
- 现在 `tests/audit-vmu-docs.test.mjs` 里 `no silent promises` 出现 **2 次 ＝ 1 条断言（三值口径）＋ 1 条注释**（我 R33 写的"that is what 'no silent promises' always meant"）⇒ ★ **同一意图只剩一条断言，口径一致** ✓。语法检查通过；审计照常运行（见 §3 的"当前红"）。

## 2. ② `export * from` ＋ `const { NAME } = await import()`：**仍"没核"，但给出最小数据流设计与代价**

| 形态 | 为什么一行正则不够 | **最小数据流设计** | 代价（估） |
|---|---|---|---|
| **`export * from '…'`** | 该行**不含任何名字**，名字在**被指向的文件**里 | ① 建**每文件导出名表**（`export const/function/class NAME`、`export { A as B }`）＝一遍正则；② `export *` ⇒ 把被指向文件的导出名**并入**该文件的导出集；③ 星链**有界传递**（深度 ≤2，超出即"没核"）⇒ 之后与 `import {…}` 同路 | 一遍全仓扫描 + 至多两层闭包；估 **~0.2–0.4s** |
| **`const { NAME } = await import('…')`** | 名字在**解构模式**里，不在模块名上 | 在含 `await import(` 的行上解析**解构模式** ⇒ `NAME → 该文件` 入库（与 `IMPORTERS` 同结构）⇒ 之后仍要求"那里真的遍历它" | 每行一次正则；估 **~0.1s** |

★ **两者本轮都未落**（具名"没核"）；★ 仍未写成"没人读"（**看不见 ≠ 没有**）。

## 3. ③ 那 2 行：★ **最小数据流已落**（`scripts/generate-vmu-settings-table.mjs`）

**为什么必须数据流**：声明名（`'vmu.report.params'`，`packs/v5r/prompts/v5r-core.js:148`）与**被遍历的名字**（`kernel/report.js` 里的 `c.params`）**不同**；名字匹配接不上，硬接一行"看到 `.map(` 就算"会重蹈 R33"松遍历"臆造证据。

**落地的规则（一级、字面量绑定，两半都必须成立）**：
1. **读并绑定**：同一行上 `const X = … sget('KEY')` 或 `X: … sget('KEY')` ⇒ 得到绑定名 `X`（**来自读取行，不是猜的**）；
2. **同文件里对该绑定**做**遍历或成员判定**：`X.map(`／`.X.map(`／`X.includes(`／`X.forEach|filter|some|indexOf(`。
- ★ 与 R33 松遍历的区别：**要求"绑定名由该键的读取行给出"**，因此与本键无关的 `.map(` **不可能**充当证据。

**效果（机制层读数，`--json`）**：`undetermined` **3 → 5**、`notWired` **115 → 113** ⇒ ★ **恰好那 2 行**（`vmu.turn.objective`／`vmu.turn.instituteName`）转为 **`❓ 未判定`**，证据＝`kernel/report.js:115`（绑定 `params: listOf(sget('vmu.report.params'))`）＋ **`:454` `c.params.map((key) => {`**（遍历），另有 `:509 if (!c.params.includes(k))`（成员判定）。
**性能**（同机同会话，`[Diagnostics.Stopwatch]`）：`settings-table --check` **5.06s**（基线 4.84）／`wiring-index --check` **6.83s**（基线 6.65；★ 且**优于** R35 末的 7.29–7.43）⇒ 新增分支只对"内联数组且本文件/导入者都无遍历"的**极少**候选跑，且先按 `indexOf(name)` 过滤文件。
**`--check` 现状**：**STALE**（`1226 keys (1108 wired, 5 undetermined, 113 declared-but-not-wired)`）⇒ ★ **请 Lead 跑 `--write`**（表体需从 3 个 `❓` 变 5 个）；`audit-vmu-docs` 现在 exit=1 的**唯一原因就是这个 STALE**（子检查先跑；§4 的反例已证明那两条断言本身有牙）。

## 4. 当天反例（副本制 ＋ ★ **变异落地自检**）

`D:\_tmp\v36\counter-r36.mjs`（R36 那套：副本里**先中和 STALE 子检查** ⇒ 红只能来自断言；★ 每次变异都打印"第 8 格 before→after ＋ 仍是行=YES"并**与 snapshot 比对**确认落地）：
```
M1 mutation: L312 第 8 格 "❓ 未判定（…" → ""  仍是行=YES ✓
M1 (blanked TIER CELL of a real row): exit=1 (red ✓)
    FAIL every settings row states which of the THREE tiers the key is in (✅/❓/⚠️ — no silent promises; blank or vague still reddens)
    FAIL no key is marked unwired although a runtime source reads it — or although the criterion cannot decide it [vmu.turn.objective,vmu.turn.instituteName]
M2 (❓ rewritten as ⚠️): exit=1 (red ✓)  → 同上第二条 FAIL
★ 红在被测断言上: YES ✓（两次）
REAL TREE UNTOUCHED: OK (read-only ✓)
```
★ 附带收获：失败信息**逐名点出**（R37 起包括**新转档的那 2 个键**）⇒ 断言能指认"哪几行不对"，不只说"红了"。

## 5. ④ 可选（四类正则合并单次扫描）：**本轮未做**（具名）

- **未做**，故**不给"④ 的"秒数**；★ 但顺带记录一个**实测**：`wiring-index --check` 现在是 **6.83s**（R35 末 7.29–7.43）⇒ 本轮**没有**把它拖慢，反而略快（原因：数据流分支按 `indexOf(name)` 先过滤文件、只对极少候选跑）。**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。

## 6. 收口与没核清单

- **本轮仓内改动**：`scripts/generate-vmu-settings-table.mjs`（最小数据流分支）＋ `tests/audit-vmu-docs.test.mjs`（删除重复的两值文案断言）。
- **需要 Lead 的动作**：跑一次 `--write`（表体 3 → 5 个 `❓`）⇒ 之后 `audit-vmu-docs` 应回 **103/0**（★ 我**未**复验 `--write` 后的绿＝**没核**，因为 `--write` 归你）。
- **没核**：② 两形态（本轮只给设计与代价，未落地）；④；`--write` 后的 103/0。
