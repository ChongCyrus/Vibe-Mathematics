# Round 40 · task-182 · 四类导入正则 → 单次扫描（/等价的更小改动）· **报告（先写设计与判断，再改代码）**

> ★ 本轮按 Lead 的要求：**先把中间结论写进报告**（避免"跑到一半断了、树上留半截"）。纪律：表体/生成块不手写；反例副本制＋target-addressed；未跑全量（T0/T1 归 Lead）；未 git；`D:\_tmp\v40`。
> ★ 上一轮（R39 之后那次）**实现中途失败但【无写入】**：Lead 事后核过——树干净、生成器 `up to date (1108/5/113)`、审计 102/0。本轮从零重做同一件事。

## 0. 基线与目标（★ 两方独立测量）

| 命令 | 我（R39 同机自量） | `vmu-verify2`（独立） | 目标 |
|---|---|---|---|
| `settings-table --check` | **5.73s** | **4.89 / 5.09s** | ~3–5s |
| `wiring-index --check` | **7.54s** | **7.71 / 7.27s** | ★ **≈6.65s** |

⇒ 两方一致：**`wiring-index` 仍高于目标，合并导入扫描是唯一已知杠杆**。

## 1. 设计判断（写于动代码之前）

**现状**：四类导入形态分散在**两遍**全仓遍历里：
- **遍 1（形态遍）**：`for (f of SOURCE_FILES) for (l of linesOf(f))`，守卫 `l.indexOf('import')<0 && l.indexOf('export')<0 ⇒ continue`，其后 **4 个正则**（命名空间／默认／具名／再导出）；
- **遍 2（R38 命名空间/解构遍）**：再来一遍 `for (f) for (l)`（守卫 `l.indexOf('import')<0`），收集 `import * as NS`／`= await import(…)`／解构绑定，然后对每个绑定 `f.text.matchAll(NS\.NAME)` **扫整份文件文本**。

**改动选择（zero-semantics 优先）**：我不做"把两个 for 合成一个"的大重写（同收益、大 diff、易错），而做**等价且更小的三处**：
1. **遍 2 的文件级预筛**：`if (!/import\s*\*\s*as|import\s*\(/.test(f.text)) continue` ⇒ 绝大多数文件**连逐行循环都不进**（原来每文件 ~1000 次 `indexOf`）；
2. **`matchAll` 前的成员预检**：`if (f.text.indexOf(nsName + '.') < 0) continue` ⇒ 命名空间从未被用到的文件不跑全文正则；
3. **遍 1 保持**（它的守卫已是最便宜的短路，4 个正则只在含 `import`/`export` 的行上跑）。
★ **语义保证**：正则、名字集合、`add` 的调用顺序**都不变** ⇒ 判据仍按名字、"拿到名字仍须在那里遍历"、"看不见不写成没人读"、**计算属性访问维持 R39 的收口（本树 0 处）**、三档计数必须仍是 **1108 / 5 / 113**。

**若达不到 ≈6.65s 我会明说**：剩余杠杆＝把遍 1／遍 2 合成**一次**遍历（收益≈本轮已拿到的部分，代价＝把两段逻辑揉进一个循环）。**届时给实测数字，不猜。**

## 2. 结果（改完填）

### 2.1 语义与计数：**完全不变** ✓
```
--json: { "wired": 1108, "undetermined": 5, "notWired": 113, "stale": false }
```
⇒ `--check` 仍 **up to date（1108 / 5 / 113）**；★ **不需要 `--write`**。判据仍按名字、"拿到名字仍须在那里遍历"、"看不见不写成没人读"、**计算属性访问维持 R39 收口（本树 0 处）**。

### 2.2 秒数（同机、同会话；`[Diagnostics.Stopwatch]::StartNew()` 包住整条命令，各 2 次）
| 命令 | 改前（R39 自量） | **改后** | 变化 |
|---|---|---|---|
| `settings-table --check` | 5.73s | **4.91s / 4.92s** | ★ **−0.81s ⇒ 回到 R37 基线（≈4.9）** |
| `wiring-index --check` | 7.54s（verify2：7.71/7.27） | **7.46s / 7.37s** | ★ **基本未动（仍高于 ≈6.65 目标）** |

### 2.3 ★ 结论：**"合并导入扫描是唯一剩余杠杆"这个假设被读数否定**
- **理由（读数，不是猜）**：若那~0.8s 来自导入扫描，`settings-table` 与 `wiring-index` **应当一起下降**。实测 **只有 `settings-table` 下降到基线**，而 `wiring-index` **几乎没动** ⇒ ★ **剩余 ~0.75s 不在导入扫描里**，而在 `wiring-index` **自身的工作**里（它把 `settings-table --check` 当**子检查**跑，再加上自己的扫描/渲染）。
- ⇒ **下一步（本轮未做，具名）**：给 `wiring-index` **分段计时**（子检查 vs 自身扫描 vs 渲染），把 ~0.75s 定位到具体阶段 —— ★ **在此之前，继续"合并/预筛"不会把它带回 6.65s**。
- ★ 因此我**没有**做"把两个 for 合成一个"的大重写：**收益已由更小的预筛拿到**（settings-table −0.81s），剩下的缺口在**别处**。

### 2.4 ★ 当天反例（副本制）：合并后的判定**是承重的**（`D:\_tmp\v40\counter2.mjs`）
四类形态在本树**新增命中 0 处**，所以"删一类形态 ⇒ 审计红"**观察不到**；改用**正向夹具**做**差分**：在副本里加两个文件 —— `kernel/zzprobeA.js` 导出 `ZZPROBE = [ 'vmu.math.network', ]`，`kernel/zzprobeB.js` 用 `import * as NS from './zzprobeA.js'` 且 `NS.ZZPROBE.map(...)` —— 然后**同一夹具**跑两次：
```
INTACT  (namespace branch present) ⇒ {"row":1446,"cell":"❓ 未判定（可能走动态读取，静态"}   ← 期望 ❓ 未判定 ✓
MUTATION LANDED ✓ (whole branch replaced; no dangling `re`)
DROPPED (namespace branch removed) ⇒ {"row":1446,"cell":"⚠️ 未接线（改了不会有行为变化"}   ← 期望 ⚠️ 未接线 ✓
REAL TREE UNTOUCHED: ee4699eab145724b -> ee4699eab145724b OK (read-only ✓)
```
⇒ ★ **删掉一类形态 ⇒ 判定从「未判定」退回「未接线」** ⇒ **该分支承重**（差分证据）；★ **target-addressed**：读的是**目标键的表格行（L1446）的第 8 格**，不是散文；★ **变异证明落地**（整段分支被替换、`matchAll(re)` 已不存在）。

### 2.5 ★ 我自己的两个错（具名，均已修）
1. **夹具污染了量具**：第一版把 `export const ZZPROBE = ['vmu.math.network']` 写在**同一行** ⇒ 该行**不是声明形状** ⇒ **`hasConsumer` 把夹具本身算成了消费者**（键直接变"已接线"，差分失效）⇒ 改成**元素独占一行、行首是 `'vmu.…'`**（与真实键表同形）⇒ 判定回到可观察的 `❓/⚠️`。
2. **变异造出崩溃而不是红**：第一版只删了 `const re = …`，留下 `matchAll(re)` ⇒ 副本 **ReferenceError** ⇒ ★ **崩溃不是红** ⇒ 改成**整段 4 行替换**，并断言 `matchAll(re)` 已消失。

## 3. 收口

- **本轮仓内改动**：`scripts/generate-vmu-settings-table.mjs`——**文件级预筛**（`if (!/import\s*\*\s*as|import\s*\(/.test(f.text)) continue`）＋ **`matchAll` 前的成员预检**（`f.text.indexOf(nsName + '.') < 0 ⇒ continue`）。**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`；**表体/生成块未手写**。
- **跑了/核了**：三档计数与 `--check`（`stale:false`）；前后秒数（各 2 次）；差分反例（INTACT/DROPPED ＋ 落地证明 ＋ 真树 hash 未变）。
- **没核/没做**：`wiring-index` 的**分段计时**（定位 ~0.75s 在哪个阶段）——★ **这是把 7.4s 拉回 6.65s 的前置**；把两遍遍历合成一遍的大重写（按 2.3 的判断，**收益不在这里**）。**未复跑 `audit-vmu-docs`**（`stale:false` ⇒ 无红触发）。
