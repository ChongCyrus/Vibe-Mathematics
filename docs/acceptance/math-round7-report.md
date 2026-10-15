# Round 7 · `task-56` 交账（kind 第二轴 ＋ 六型对四库的真实路径）

**负责人**：`v5r-reader-b`。**判据**：`07-goal5-verdict.md` §5 的第 4 条（符号列表 vs 数值数组）＋ §B（六型契约完整性）。
**红线遵守**：`math-computation.js`／`math-engines.js` **一字未动**（四份逐字节副本 ＋ parity 冻结哈希安全）。未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（已删）；内容型批量改写只用 Node。

---

## A. `kind` 的第二轴：`elementKind`（✓ 已落地，真机可核）

### A.1 先核 v5r 的输出契约（命名不冲突）
`vibe-math-v5r/math-computation.js` 里**没有任何结果形状契约**：`next(kind,…)` 是**提示词**用的 `next.kind`，其取值集是
`agent-install | enable | engine-override | note | reason | user-install | vendor`（grep 实测），与"返回值长什么样"无关。
⇒ `elementKind` 及其词表**不与基线冲突**：它是 vmu 适配面**自己的第二轴**（与既有的 `SHAPE_KINDS` 同性质）。

### A.2 落点（`kernel/mathadapters.js`，是我的文件）
- 新导出 **`ELEMENT_KINDS = ['numeric','symbolic','mapping','text','mixed','unknown']`**（`:59` 一带），并在两处契约面公布：
  `plan()/status()` 的 `shapeKinds` 旁新增 **`elementKinds`**、`shapeContract()` 新增 **`elementKinds`**。
- 子侧 harness 新增 `_vmu_element_kind(...)`（逐元素判定：numpy 标量/数组 ⇒ numeric；`sympy.Basic` ⇒ symbolic；
  `dict` ⇒ mapping；`str` ⇒ text；混合 ⇒ mixed；空/无法判定 ⇒ unknown）。
- **加法式**：`kind` 一字未改（仍是 `array`），所以任何已按 `kind` 分支的调用方行为不变；`elementKind` 缺字段时**默认 `unknown`**，
  **未声明的词一律归 `unknown`**（`ELEMENT_KINDS.indexOf(ek) === -1 ⇒ 'unknown'`）——原样透传或替调用方猜都是撒谎。

### A.3 真机证明（四库 21 次调用，**全 EXIT=0**）
```
node D:\_tmp\r7-shapes.mjs numpy   → 5 calls, failures=0   EXIT=0
node D:\_tmp\r7-shapes.mjs scipy   → 4 calls, failures=0   EXIT=0
node D:\_tmp\r7-shapes.mjs pandas  → 6 calls, failures=0   EXIT=0
node D:\_tmp\r7-shapes.mjs sympy   → 6 calls, failures=0   EXIT=0
```
| 库 | 调用 | `kind` | **`elementKind`** | 真机片段 |
|---|---|---|---|---|
| numpy | `np.linalg.det(...)` | scalar | — | `-2.0000000000000004` |
| numpy | `np.arange(6).reshape(2,3)` | array | **numeric** | `[[0,1,2],[3,4,5]]` |
| numpy | `np.array([sp.Integer(2), sp.sqrt(2)], dtype=object)` | array | **symbolic** | `["2","sqrt(2)"]` |
| numpy | `[1, "text"]` | array | **mixed** | `[1,"text"]` |
| scipy | `integrate.quad(...)` | scalar | — | `0.8862269254527579` |
| scipy | `optimize.minimize(...)` | result | — | `success:true` |
| scipy | `integrate.solve_ivp(...).y` | array | **numeric** | `[[1,0.9048…,0.3680…]]` |
| scipy | `sparse.csr_matrix(...)` | array | **numeric**＋`sparse:true` | `nnz=2` |
| pandas | `DataFrame({...})` | frame | — | `["a","b"]` |
| pandas | `Series.describe()` | frame | — | `["s"]` |
| pandas | `df.a.sum()` | scalar | — | `3` |
| pandas | `df.to_dict()` | mapping | — | — |
| pandas | `df.values` | array | **numeric** | `[[1],[2]]` |
| pandas | `df.columns`（R7 新路径） | array | **text** | `["a"]` |
| sympy | `simplify(sqrt(8))` | expr | — | `2 \sqrt{2}` |
| sympy | `solve(Eq(x**2,4), x)` | array | **symbolic** | `["-2","2"]` |
| sympy | `Matrix([[1,2],[3,4]])`（R7 新路径） | array | **symbolic** | `[["1","2"],["3","4"]]` |
| sympy | `solve(..., dict=True)` | array | **mapping** | `[{"x":"-2"},{"x":"2"}]` |
| sympy | `float(pi.evalf())` | scalar | — | `3.141592653589793` |
| sympy | `{"x": Integer(2), "y": sqrt(2)}` | mapping | — | — |

**⇒ 判定**：要求的那条区分**已可核**：`sympy solve ⇒ symbolic`，`numpy reshape ⇒ numeric`（同表里还有 mapping/text/mixed）。

### A.4 顺带修掉一个**真机才暴露的缺陷**（不是形状问题，是崩溃）
`solve(..., dict=True)` 首次真机跑**整调用失败**：元素是 dict **且键是 `Symbol`**，而 `json.dumps(default=str)` 只处理**值**、不字符串化**键**。
现在数组 `values` 一律经 `_vmu_jsonable`（dict 键显式 `str()`，`:202` 一带）⇒ 该例现在返回 `elementKind:"mapping"`、`values:[{"x":"-2"},{"x":"2"}]`。
（这条正是"矩阵式核查"的价值：只跑 `numpy`/`sympy` 的常规路径永远看不到它。）

---

## B. 六型契约 × 四库：真实路径（缺的已补，其余具名）

| kind | numpy | scipy | pandas | sympy |
|---|---|---|---|---|
| `scalar` | ✓ `det` | ✓ `quad` | ✓ `df.a.sum()`（numpy 标量） | ✓ `float(pi.evalf())`（**注**：`sp.Integer(3)` 是 `Basic` ⇒ 走 `expr`，要"标量"必须落到 Python 数值） |
| `array` | ✓ `reshape`（numeric）＋ object-dtype（symbolic）＋ mixed | ✓ `solve_ivp().y`（numeric）＋ **sparse（R7 补）** | ✓ `df.values`（numeric）＋ **`pd.Index`／`df.columns`（R7 补，text）** | ✓ `solve`（symbolic）＋ **`Matrix`（R7 补，symbolic）**＋ `solve(dict=True)`（mapping） |
| `frame` | ✗ **具名**：numpy 没有"带列名的表格"这一返回物（强行包一层只会让形状说谎） | ✗ 同上 | ✓ `DataFrame`／`Series` | ✗ 同上 |
| `expr` | ✗ 具名（numpy 无符号表达式类型） | ✗ 具名 | ✗ 具名 | ✓ `simplify`／`sqrt(8)` |
| `result` | ✗ 具名（无 Result 类；`_attrs` 兜底路径存在但不是"特化"） | ✓ `OptimizeResult`／`OdeResult`／`RootResults` | ✗ 具名 | ✗ 具名（`solve` 是列表 ⇒ array；无 Result 类） |
| `mapping` | ✓ dict 返回（如 `{"a": ndarray}`） | ✓ dict 返回 | ✓ `to_dict()` | ✓ dict 返回／`solve(dict=True)` 的元素 |

**本轮补的三条特化**（此前**整类落到 `unknown`／具名拒**，属真实缺口）：
1. `sympy.Matrix` ⇒ `array`＋`elementKind:'symbolic'`＋`shape`＋`srepr`/`latex`（**矩阵是线性代数的核心返回物**）；
2. `scipy.sparse` 矩阵 ⇒ `array`＋`elementKind:'numeric'`＋`sparse:true`＋`nnz`（稀疏线性代数是 scipy 的主用途）；
3. `pandas.Index`／`df.columns` ⇒ `array`＋`elementKind`（`text`/`numeric`/…）。
**具名的"无路径"**：`frame` 对 numpy/scipy/sympy、`expr` 对 numpy/scipy/pandas、`result` 对 numpy/pandas/sympy —— 这些库**没有**这些返回物的自然构造；契约允许调用方**显式**用 dict/`kind` 包装（信封文档已写），但本品**不为"形状齐全"而制造假特化**。

---

## C. 文档同步
`docs/15 §14.9`（结果形状契约那一段）：表格补三行特化（`Matrix`／sparse／`Index`）＋新增"第二轴 `elementKind`（Round 7 ✓）"整段（词表、语义、21 次真机读数、命名核对、"未声明词归 unknown"、以及 A.4 的缺陷）。

---

## D. 原样命令 ＋ 退出码（全绿）

```
node tests/vmu-math-adapters.test.mjs   → === VMU MATH ADAPTERS: 21 passed, 0 failed ===   EXIT=0   （+1：新的 elementKind 用例）
node D:\_tmp\r7-shapes.mjs numpy        → 5 calls, failures=0                            EXIT=0
node D:\_tmp\r7-shapes.mjs scipy        → 4 calls, failures=0                            EXIT=0
node D:\_tmp\r7-shapes.mjs pandas       → 6 calls, failures=0                            EXIT=0
node D:\_tmp\r7-shapes.mjs sympy        → 6 calls, failures=0                            EXIT=0
node scripts/check-docs.mjs             → vmu doc-lint: DOC LINT: PASS                    EXIT=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, 0 failed                    EXIT=0
node tests/vmu-mathtools.test.mjs       → === VMU MATHTOOLS: 208 passed, 0 failed ===     EXIT=0
```

## E. 未做项 / 待协调
| # | 项 | 说明 |
|---|---|---|
| 1 | `07-goal5-verdict.md` §5 第 4 条的措辞（"改判条件＝加 `kind:'exprList'`"）已被本轮**取代** | 该文件**不在 task-56 的写范围**，我未擅自改；请在下一轮授权我同步（或由你/verify 改）：现状应写成"已用 `elementKind` 落地（`docs/15 §14.9`）"。 |
| 2 | `frame`／`expr`／`result` 对某些库**没有**路径 | 具名（见 §B 表尾）：这些是**库本身没有这种返回物**，不是漏接；调用方可用显式 dict/包装面表达。 |
| 3 | `elementKind` 目前只对 `array` 输出 | `frame`／`result`／`mapping` 的元素语义由它们自己的字段（`dtypes`／`fields`／`value`）表达；若将来确需统一第二轴，属接口扩展（需与 verify 的语义对照同改）。 |
