# Round 36 · task-170 · ★ 查清"清空档位格却不红" ＋ 三条收尾

> 纪律：表体/生成块不手写；反例副本制；未跑全量（T0/T1 归 Lead）；未 git；`D:\_tmp\v36`。

## 1. ★ 主任务：M1 为什么不红 —— **根因是我的变异锚点，不是守卫**（两假设逐个排除，均有读数）

**(b) 先排除：审计的 `rows` 怎么取【代码指认】**
```js
// tests/audit-vmu-docs.test.mjs:540
const rows = settingsDoc.split('\n').filter((l) => /^\| `vmu\.[a-zA-Z0-9_.]+`/.test(l))
```
⇒ `rows` 只要求**行首**是 `` | `vmu.…` ``。**清空第 8 格不改变行首** ⇒ **该行仍在 `rows` 里** ⇒ 假设 (b)（"清空导致整行被跳过"）**被读数否定**（下方实测：清空后 `仍是行=YES ✓`）。

**(a) 变异是否落在审计真正读的那份 docs 上【读数】**
- 审计的 docs 根＝`tests/audit-vmu-docs.test.mjs:38`：`DOCS = process.env.VMU_DOCS_DIR ? resolve(...) : join(REPO, 'vibe-math-vmu', 'docs')` —— ★ **它本来就有"注入根"接缝**（`VMU_DOCS_DIR`），副本运行时读的是**副本自己的** docs ⇒ **路径是对的**。
- 真正的病根在**我的锚点**（`D:\_tmp\v36\diagnose-m1.mjs` 读数）：
```
=== 提到 `vmu.turn.selfCheck` 的每一行 ===
  L257  isRow=no   > ★ **已知需要 `❓` 的实例（范围＋残差口径；R32 普查）**：…
  L312  isRow=YES  | `vmu.turn.selfCheck` | bool | `true` | … | ❓ 未判定（…） | …
=== M1 用的锚点 `l.includes('`vmu.turn.selfCheck`')` 命中 L257；真正的【行】在 L312 ===
  ★ 同一个吗？★ NO —— 我的变异打在了【非表格行】上
  M1 打的锚点(any) 的第 8 格 = ""
  真正的行(row)   的第 8 格 = "❓ 未判定（可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有）"
=== 把【真正的行】的第 8 格清空后 ===
  第 8 格 = ""  ⇒ 已无档位标记？YES ✓
  该行仍以 `| `vmu.` 开头（因此仍在 audit 的 rows 里）？YES ✓（所以守卫应该能看见它）
```
⇒ ★ **R35 的 M1 打在 `docs/04` L257 的【散文行】**（那是 R32 普查段落里提到该键的行），**表格行在 L312** ⇒ **真正的行从未被改动** ⇒ 审计**正确地**保持绿色。★ 家族＝**"变异打错行"**（R27 那次"打错行被误记成没牙"的同一族），**不是守卫没牙**。

**(c) 判据必须能红 ⇒ 已用修好的 M1 证明（当天反例，副本制）**
`D:\_tmp\v36\counter-r36.mjs`：变异**改为选真行**，并加**"变异是否落地"自检**（★ 我第一版自检有 bug：`fn` 原地改数组，我却拿 `out` 与 `lines`（同一个数组）比较 ⇒ 误报"未落地"；改为与 **snapshot** 比较后正常）。结果（副本里先中和 STALE 子检查 ⇒ 红只能来自断言）：
```
M1 mutation: L312 第 8 格 "❓ 未判定（…" → ""  仍是行=YES ✓
M1 (blanked TIER CELL of a real row): exit=1 (red ✓)
    FAIL every settings row states which of the THREE tiers the key is in (✅/❓/⚠️ — no silent promises; blank or vague still reddens)
    FAIL every settings row states whether the key is WIRED (no silent promises) [`vmu.turn.selfCheck`]
    ★ 红在被测断言上: YES ✓
M2 (❓ rewritten as ⚠️): exit=1 (red ✓)
    FAIL no key is marked unwired although a runtime source reads it — or although the criterion cannot decide it [vmu.turn.selfCheck]
    ★ 红在被测断言上: YES ✓
REAL TREE UNTOUCHED: OK (read-only ✓)
```
⇒ ★ **两个反例都红、且都红在被测断言上**（R35 的 M1 缺口闭合）。⇒ **审计无需为"清空"加新规则**：它对"缺档/空档"**本来就会红**，R35 之所以没红是**变异没落地**。
★ **同时发现一处残留（具名，未改）**：M1 的 FAIL 列表里有**两条**同一意图的断言 —— 我 R33 那次只替换了 `const unmarkedRows = …` 一行，**旧的 `'every settings row states whether the key is WIRED (no silent promises)'` 那行还在**（它复用同一个 `unmarkedRows`，所以会一起红，**功能上无害**，但**文案已过时**＝仍说"WIRED"两值口径）。⇒ **下一轮**把那条重复断言的文案/去留收掉（**本轮没动**，避免与"落档"混在一起改）。

## 2. ② `export * from` ＋ `const { NAME } = await import()` 解构

★ **仍未覆盖，继续写"没核"**（不猜）：
- `export * from '…'`：**名字在该行上不可知** ⇒ 我只标记 `starReexport` 文件为残余，**没有猜**；
- `const { NAME } = await import('…')` **解构**：我 R35 只覆盖了 `.NAME` 形态；**解构形态本轮未实现**（要的是"解构出的名字 → 谁在那里遍历"的映射，属数据流，**不是一行正则**）。

## 3. ③ 那 2 行（`turn.objective`／`turn.instituteName`）—— ★ **找到了强证据，但判据连不上（结论：应判"未判定"，本轮不改判据）**

`kernel/report.js` 实测（逐行）：
```
:115   params: listOf(sget('vmu.report.params')),          ← 域被【读取】
:454   const entries = c.params.map((key) => {             ← ★ 域被【遍历】（.map）
:468   paramsDeclared: c.params.length > 0,
:509   if (!c.params.includes(k)) {                        ← ★ 成员判定（includes）
:511   'vmu.report.params declares what the main agent may view or change' + (c.params.length ? '; declared: ' + c.params.join(', ') : …
```
⇒ ★ **`vmu.report.params` 这个内联数组确实被遍历、也被成员判定** ⇒ 它的元素（`turn.objective`／`turn.instituteName`）**处在一条动态使用路径上** ⇒ **按 R33 定的语义，这两行应判「未判定」**。
★ **但我本轮没改判据**，理由是**诚实的技术理由**：**声明名与被遍历的局部名不同** —— 声明是 `'vmu.report.params': […]`（`v5r-core.js:148`），遍历发生在 `report.js` 里对 **`c.params`** 的调用（`c` 来自 `:115` 的 `sget('vmu.report.params')`）⇒ **把它连起来需要数据流（属性读取→重命名→迭代）**，**不是一行正则**；硬接会变成"看到 `.map(` 就算"那种会臆造证据的做法（R33 已因"松遍历"踩过一次）。
⇒ **结论**：**证据已入册；那两行在表里仍是"没核"**（不是"未接线"的断言）；**下一轮**：要么做**最小数据流**（把 `sget('K')` 绑定的属性名 → 迭代点），要么**具名声明该局限**。

## 4. ④ 性能（可选）—— **本轮未做（具名）**

- 未做"四类正则合并为单次扫描"。**最后一次量到的基线**（R35 末，同机同会话，`[Diagnostics.Stopwatch]`）：`settings-table --check` **4.75/4.86s**；`wiring-index --check` **7.43/7.29s**（未改 `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`）。★ **本轮未复量**（我只改了 `_tmp` 脚本与审计文案层，**未动生成器的热路径**）⇒ **没量**，不给数字。

## 5. 收口与没核清单

- **本轮仓内实际改动：无**（M1 的根因在**我的反例脚本**里，不在产品代码；审计**不需要**新增/修改规则）⇒ ★ 按纪律这也要说清：**"未改代码"是结论，不是遗漏**。
- **没核**：② 两形态（`export *`／解构）；③ 的最终判定（判据连不上数据流，保持"没核"）；④ 未做；重复断言文案未收。
- **建议下一轮顺序**：①③ 的数据流最小实现（它同时能解 ③ 与"署名不同"的家族）→ ② 解构形态 → 收益小但干净的 ④。
