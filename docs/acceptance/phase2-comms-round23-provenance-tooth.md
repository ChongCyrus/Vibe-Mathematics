# Phase 2 · comms · Round 23 · `resolved[key].source` 的产地：**读出了候选，但"能红"仍未证成，且与 R22 读数【矛盾】**

> ★ **结论三句，分开说**：
> **① 产地候选（读码，不是猜）**：`kernel/index.js:2153-2154` `const packSource = {}` / `for (const n of packApplied) for (const k of n.keys || []) packSource[k] = 'pack:' + n.id`；阶梯在 **`:2161` `const source = packSource[def.key] || settingWriter(settings, def.key)`** ⇒ ★ **按代码读，`:2154` 就是产地**，`:2161` 只是把它接出来。
> **② 实测（本轮）**：基线探针（副本内 `entry.apply(ctx,{clock,packs:['v5r']})`）⇒ ★ **`PROBE source=pack:v5r value=true`** ⇒ 折叠与"来源如实"在真树/副本上**确实成立** ✓。
> **③ ★★ 与 R22 的矛盾（必须报，不掩饰）**：★ R22 我变异的就是 `:2154` 那一行（锚点 `packSource[k] = 'pack:' + n.id` **与 `:2154` 逐字一致**），**落地证明通过**（替换后原锚点已不存在），**但测试仍 7/0 全绿** ⇒ ★ 这与"`:2154` 是产地"**互相矛盾** ⇒ ★ **两者必有一错**：要么那次变异**没落在被执行的那条路径**上（⇒ 存在**第二个**来源产地），要么**我的断言读的不是该字段**（⇒ 我的 `resolved` 取法有问题）。
> ⇒ ★ **因此"来源如实"这条断言目前【红不可证】**（按你的第 3 条：**不加接缝**，如实记 + 给机制）⇒ ★ 本轮**记为完成**，但把矛盾**摆上台面**。
> 真树只读（hash 前后一致 ✓）；**未改** `packs/**`／`kernel/**`／`vibe-math-vmu.js`／`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（只在**副本**里变异）；**无半截状态**。

## 1. 我按顺序做了什么（都在副本里）

1. ★ **候选 (a)**：变异 `packDefaultSource[k] = name;` ⇒ ★ **ANCHOR MISS**（该文本在当前 `kernel/index.js` 里**不存在** ⇒ 你给的行号/拼写有漂移；★ 这正是"配方里的行号与机制，执行者必须自己核"）。
2. ★ **候选 (b)**：变异阶梯 `packSource[key] ||` ⇒ ★ **ANCHOR MISS**（实际文本是 `packSource[def.key] || settingWriter(settings, def.key)`，**用的是 `def.key`**）。
3. ★ **改用读码定位**（不再猜锚点）：`Select-String` 读出**真实那三行**（`:2153`／`:2154`／`:2161`）⇒ ★ **产地候选就是 `:2154`**，与 R22 我变异的锚点**逐字相同** ⇒ ★ **于是矛盾出现**（见 §2）。
4. ★ **基线探针**（副本）：`PROBE source=pack:v5r value=true` ✓ —— 这条**读数**是本轮确定的收获（它把"折叠＋来源"在真构造下钉在了 `pack:v5r`）。

## 2. ★★ 矛盾与"下一步决定性实验"（写清楚，供下一轮一击命中）

**矛盾**：`:2154` 是产地（读码）↔ 变异 `:2154` **落地却不改判**（R22 实测）。
**两个候选解释（尚未证伪）**：
- **(i) 第二条产地**：★ **入口 `vibe-math-vmu.js` 自己也可能给设置视图算来源**（它读 pack 默认、并拼 `settings/…` 的视图），而我的测试读的是 **`handle.kernel.status().settings.resolved`**（内核那份）——★ 若那次变异只影响**另一份**（例如只影响**报备**用表），内核这份不变 ⇒ **不红**。★ 佐证：`:1886` 也有一处 `source: 'pack:' + String(by || 'pack')`（**另一条**拼 `pack:` 的地方 ⇒ 说明"pack 来源"在本文件里**不止一处**）。
- **(ii) 我的断言读错字段**：★ 我的 `resolvedOf()` 走 `handle.kernel.status().settings.resolved` ⇒ 若该键在 `resolved` 里的 `source` 另有出处（例如 `settingsSources`），则我变异 `packSource` 本就不该影响它 —— **但基线又观察到 `pack:v5r`** ⇒ 需要**逐处**变异才能分辨。
**决定性实验（下一轮，一次即可）**：★ 在**同一副本**里变异 `:2154` 的 `packSource[k] = 'pack:' + n.id`，**并且**跑 `_probe.mjs` 打印 `resolved[<key>].source` **与该键在 `resolved` 里的整行** ⇒
- 若打印**仍是 `pack:v5r`** ⇒ ★ **(i) 成立**（内核这份另有出处）⇒ 接着变异 `:1886` 与 `vibe-math-vmu.js` 里对应的拼装处；
- 若打印**变成 `config`** 而测试仍绿 ⇒ ★ **(ii) 成立**（我的断言没读该字段）⇒ 修断言取值即可。
★ 这条实验**不需要新接缝**（全部在副本里做）✓。

## 3. 断言注释（你的"顺手"项）：**未改**（预算）

★ 我**没有**给 `tests/b1prime-pack-fold.test.mjs` 的"来源如实"断言补那句"当前红不可证"的注释 ⇒ ★ **具名未做**（本轮预算用尽；下一轮与 §2 的实验一起做）。

## 4. 纪律 / 没核

- ★ **未改** `packs/**`／`kernel/**`／`vibe-math-vmu.js`／`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`；只在**副本**里变异（3 个候选副本）；**无半截状态**。
- ★ **新文件/派生计数**：本轮**未新增测试文件**（只在 `_tmp` 里做脚本）⇒ 不触发派生计数变化；若下一轮为 §2 的实验新增文件，**会**改计数 ⇒ 届时**请你 `--write`**。
- ★ **没核**：①`resolved[key].source` 的**唯一**产地（§2 两个候选都还活着）；②"来源如实"的**可红性**；③ **两个 ANCHOR MISS** 说明你给的行号/拼写**已漂移**（我按实际文本核对过）；④ `audit-package-membership` 未独立复跑（R5 已按你的实测解除）。
