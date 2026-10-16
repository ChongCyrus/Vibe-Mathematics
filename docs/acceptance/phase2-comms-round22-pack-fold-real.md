# Phase 2 · comms · Round 22 · pack 默认折叠（机制证明）：★ 折叠半边已证 ＋ **来源半边的"能红"末证（反例打空）**

> ★ **结论两句，分开说**：
> **① 得到证的**：`tests/b1prime-pack-fold.test.mjs` ⇒ **7 passed / 0 failed** —— 用 **v5r 自己的默认键**行使了那条从未被走过的路由（★ 不碰任何随包默认、不加接缝、不写 `packs/**`）：**折叠成立**（`resolved[key].value === pack 默认值`）＋ **非空前置**（内核自报 ≥1 键来自 `pack:`）＋ **对照臂**（不声明 pack ⇒ 同键**不是** `pack:v5r`）。
> **② 末证的**：★ **"来源如实"那条断言的【能红】我没证成** —— 我的变异（把 `packSource[k] = 'pack:' + n.id` 改成 `'config'`）**落地了，但测试仍然 7/0 全绿** ⇒ ★ **我改的那处不是 `resolved[key].source` 的产地** ⇒ **该断言对"来源标签被去掉"这一机制没有可证的红**（★ 这一条按你的规矩必须报，不能当作已守）。
> 报告口径：**机制证明**与**"我们的两个键在某个 pack 里被折"**必须分开 —— ★ **本测试【不】证明后者**（**没有任何随包默认包含它们**，这正是"我没有翻默认"的结果）。
> 真树只读（hash 前后一致 ✓）；**未改** `packs/**`／`kernel/**`／`vibe-math-vmu.js`／`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`；**无半截状态**。

## 1. 为什么用"已发布 pack 的已有默认键"（照你的裁定）

- ★ 我 R21 读码指认：折叠处 `vibe-math-vmu.js:355` 用的是 **`here`（入口自身目录）**，`config.root` **不能**重定向它 ⇒ 临时树/临时 pack 折不到（你已认下这条，并把它入为纪律：**配方里的行号与机制，执行者必须自己核**）。
- ★ 因此本轮**不需要** temp tree／新接缝／写 `packs/**`：直接用 **`packs/v5r/settings/defaults.json` 里已有的默认键**行使同一台机制。
- ★ 测试**自选键**（不写死具体键名）：取「**同时出现在 v5r `defaults` 且在 `settings/schema.js` 里已声明**」的第一个键（★ 入口注释说：默认值指向**未声明**的键就是 typo，应由门抓到 ⇒ 所以选键必须要求"已声明"）。

## 2. 断言与读数（真入口 `entry.apply`，**启动时**声明 pack）

| # | 断言 | 结果 |
|---|---|---|
| 1 | v5r 确实带 `defaults` 对象 | PASS ✓ |
| 2 | ★ 至少一个 v5r 默认**同时是已声明设置**（否则是 typo） | PASS ✓ |
| 3 | ★★ **非空前置**：内核自报 **≥1 键来源为 `pack:`**（真的有 pack 被应用） | PASS ✓ |
| 4 | ★★ **折叠**：`resolved[key].value === v5r 默认值` | PASS ✓ |
| 5 | ★★ **来源如实**：`resolved[key].source === 'pack:v5r'` | PASS ✓（真树上确实如此） |
| 6 | ★★ **对照臂**：**不声明 pack** ⇒ 同键 **≠ `pack:v5r`** | PASS ✓ |
| 7 | ★ 对照臂非空：值不同**或**来源码如实 | PASS ✓ |

## 3. ★★ 当天副本制反例：**打空了**（必须报）

`D:\_tmp\v56\counter.mjs`：拷 tree ⇒ **只变异副本的 `kernel/index.js`**：把 `packSource[k] = 'pack:' + n.id` 改成 `packSource[k] = 'config'`（★ **落地证明通过**：原锚点已不存在）。
```
CONTROL (copy as-is): exit=0 (green ✓) 7/0            ← 拷贝本身没问题
MUTATION LANDED ✓ (source label reverted to a plain `config`)
MUTANT: exit=0 ★ GREEN ✗ — the pin does not protect the source      7/0
★ 红在"来源如实／pack 被应用"那条上 = ★ NO        REAL TREE UNTOUCHED ✓
```
★ **解读（不猜、但给出下一步）**：变异**落地却不改判** ⇒ ★ **`resolved[key].source` 的产地不是这条 `packSource`**（这条很可能是**运行期新增 pack 的报备**用的那张表，即 `:2154` 上下文），而 `resolved` 的来源格大概率由**另一处**决定（候选：`:312` 的 `packDefaultSource`／`:358` 的 `packDefaultSource[k] = name`，再经阶梯 `:2161 packSource[key] || settingWriter(...) || settingsSources[key] || …`）。
⇒ ★ **"来源如实"这条断言目前的红不可证**；**下一轮的决定性变异**＝改**真正那一处**（先用探针打印 `resolved` 的 `source` 在该变异前后的值，或直接变异 `packDefaultSource[k] = name` 与阶梯那行，看哪一处能把它翻成 `config`）。
★ **同时必须承认**：这不代表断言没价值（真树上它 PASS，且对照臂证明它不空）—— 只代表★ **它对"来源标签被去掉"这一机制的可红性【未证】**。

## 4. 纪律 / 没核

- ★ **未改** `packs/**`／`kernel/**`／`vibe-math-vmu.js`／`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（只在**副本**里变异）；**无半截状态**。
- ★ **纪律 33**：本文件是**新测试** ⇒ **派生计数会变** ⇒ 若 `--check` 变 STALE **请你 `--write`**（我不自行 `regen-all`／不 git；下轮若跑门禁会先提醒你 `git add`）。
- ★ **没核**：**"来源如实"的可红性**（§3，变异打空）；`audit-package-membership` 未独立复跑（R5 已按你的实测解除）。
- ★ **保留的判别器**：对照臂（不声明 pack ⇒ 非 `pack:v5r`）—— 按你的要求保留 ✓，且它在真树与副本两侧都 PASS。
