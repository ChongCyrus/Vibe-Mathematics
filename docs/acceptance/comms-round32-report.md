# Round 32 · task-156 · 生成器「类型推断不出 ⇒ 静默 `object`」改成**具名**（★ 不确定时必须出声）

> 起点＝我在 **R30 §9 残留 (b)** 与 **R31 §7(1)** 自己具名的这条残留。纪律：未跑全量（T0/T1 归 Lead）／未 `regen-all`／未 git；临时文件 `D:\_tmp\v32`；**生成块内不手写**；★ **反例器副本制（真树只读，已 hash 核）**。写者隔离：只动 `scripts/generate-wired-schema.mjs`／`tests/**`／`package.json`。

## 0. 缺陷与判据

**缺陷**：`scripts/generate-wired-schema.mjs` 的 `render()` 里 `const type = d.type === null ? 'object' : d.type` —— `typeOf(lit)` **推断不出**时返回 `null`，而发射器把它写成一个**确定类型** `object`。★ **R30 修掉的两个数值容差（`1e-6`/`1e-9`）正是被这条兜底标成 `object`** 的；可识别字面量修完后，**兜底本身仍在**。
**判据（Lead 给的）**：**给一个推断不出的 `def` ⇒ 必须有名字**；「**回落可解释**」与「**静默兜底**」必须区分。

## 1. 落地（`scripts/generate-wired-schema.mjs`）

- 新增**声明表** **`OBJECT_FALLBACKS`**（frozen，`key ⇒ {class, why}`）＋三个导出：**`typeFor(d)`**（未识别 ⇒ `'object'`，但**必须**有名字才算合法）、**`namedFallbacks(defs)`**、**`unnamedFallbacks(defs)`**（两条互为补集）。
- **`render()`**：未识别的行在其 **`doc` 里带名**（`；★ 类型推断不出（具名回落 object：<class> — <why>）`），未具名的行则写成 `★ 未具名：见 OBJECT_FALLBACKS，--check 会红` ⇒ ★ **产物本身不静默**（不是只在报告里说）。
- **`main()`**：① **逐个点名**打印 `NAMED type fallback: <key> [<class>] (<module>) — <why>`；② 未具名的行**进 `problems`** ⇒ `INVARIANT VIOLATED` ＋ **红**（判据机械化）。

**实测（本轮真树）**：`collect().defs = 323`，其中 **`type === null` 的恰好 8 个**，**8/8 已具名、未具名 0**；两类（这是「可解释回落」的实质）：
| class | 键（8） | 为什么类型不可知 |
|---|---|---|
| **`null-literal`**（2） | `vmu.external.endpoints`／`vmu.math.repro.seed` | 源码字面量就是 **`null`**（= R30 裁定的**未设哨兵**）⇒ **有默认值、无类型证据**；`object` 只是可解释回落（种子更可能是数字/字符串） |
| **`no-literal`**（6） | `vmu.external.mergePolicy`／`vmu.partnership.crossBorderGate`／`invoiceTaxSlots`／`registryDir`／`vmu.resource.capabilityTags`／`vmu.teaching.latePenaltyRatio` | 模块**根本没声明默认值**（走自身缺省路径）⇒ **无字面量、无类型证据**；`EFFECTIVE_DEFAULTS` 只解释**有效值**，对**类型**什么都没说 |

★ 与既有纪律同条：**`planned`（111 键）不执法但具名**／**`settingsUnenforced` 具名** ⇒ **不确定时必须出声**。

## 2. 断言（`tests/generate-wired-schema-fallback.test.mjs`，新，**14 条**，已双登记＝`package.json files[]`）

- §1 **G1**：`un=8 / named=8 / unnamed=0`（**计数打印**）；**G2**：每个名字都带 **`class` ＋ 非空 `why`**（"名字没有理由＝换了说法的静默兜底"）；**G3**：名字确实来自**声明表**。
- §2 **判据本体**：**伪造一个推断不出的 `def`**（`typeOf('<<opaque>>') === null`，**F0 先证非空**）⇒ **F1 它被列为 unnamed（判据在此失败，而不是悄悄 `object`）**／**F2 两条清单互为补集**／**F3 产物那行带"类型推断不出 ＋ 未具名"**（**F3 就是"红在被测那一行"的断言形态**）。
- §3 **「可解释」vs「静默」不塌缩**：同形状的 def，**在表里 ⇒ EXPLAINED**（E1）、**不在表里 ⇒ UNNAMED**（E2）、表恰好 8 项（E3）。
- §4 **产物**：渲染块里 **8 行**都自曝 class ＋ reason（B1/B2）；B3 是**对照**：本任务**只给回落命名、没有偷偷改掉回落**（仍是 `object`）。

## 3. 当天反例（★ **副本制**，真树只读）

`D:\_tmp\v32\counter-evidence.mjs`：把 `scripts/generate-wired-schema.mjs` ＋ `vibe-math-vmu/**` ＋ `tests/_lib` **拷到 `D:\_tmp\v32\copy`**，只对**副本**做变异（`namedFallbacks`／`unnamedFallbacks` 恒返回 `[]` ＝ **把静默兜底放回去**），再跑**副本里的**该测试：
```
REAL TREE UNTOUCHED: gen ed153ec4b9742227 -> ed153ec4b9742227 | test a82c7c6287af95f0 -> a82c7c6287af95f0 | OK (read-only ✓)
MUTANT exit=1 (red ✓)
  === VMU WIRED-SCHEMA FALLBACK: 9 passed, 5 failed ===
  FAIL G1. … NAMED with a class and a reason … [{"unInferable":8,"named":0,"unnamed":0}]   ← ★ 名字被打出来
  FAIL G2. every name carries a CLASS and a non-empty reason [[]]
  FAIL F1. ★ an un-inferable def with NO name is reported as unnamed — the criterion fails HERE [[]]
  FAIL E1. … EXPLAINED … [vmu.external.endpoints]   /   FAIL E2. … UNNAMED …
```
⇒ ★ **红落在"给名字"的那几条断言上**（G1/G2/F1/E1/E2，正是被测行），且 **G1 把计数与"无名"打出来**（R27 教训：变异打在预期行、红落在预期断言）；**真树 hash 前后一致** ⇒ 副本制成立。

## 4. `--check` / INVARIANTS / 登记

```
$ node scripts/generate-wired-schema.mjs --check
  NAMED type fallback: vmu.external.endpoints [null-literal] (external.js) — …（8 条逐个点名，略）
  INVARIANTS ok: 323 emitted, 792 pre-existing, 5 service surfaces, 6 with an honest null default
  schema DRIFT (1747 -> 1747 lines)   ⇒ 8 行的 `doc` 变了 ⇒ ★ 要 Lead 跑 --write
```
★ **`INVARIANTS ok`（未具名 0 ⇒ 无违反）＋ `DRIFT`（8 行 doc）**：**行数不变、只有那 8 行的名字进去** ⇒ 语义上正是"给回落命名、不动回落"。
**登记**：新测试已进 `package.json files[]`（`audit-package-membership 29/0` ✓；我先前一度把它插进 kernel 分组，已核**不是门禁项**、仅观感）。
**同轮读数**：`generate-wired-schema-fallback 14/0`／`vmu-settings 47/0`／`vmu-planned-settings ALL GREEN`／`audit-doc-vs-code-tables 17/0`／`check-docs PASS`／**RULE E 67=67**。

## 5. ★ 具名：两件**不是我的**（写者隔离，我没碰）

1. **`tests/vmu-entry.test.mjs` 现在 exit=1**：`status().packs` 为 **undefined** ⇒ `st.packs.includes(...)` 抛 `TypeError`（`tests/vmu-entry.test.mjs:151`）。★ `packs` 是**宿主/pack 报表面**（`vibe-math-vmu.js` 里 `config.vmu … packs` 那套），**归 `vmu-pack2`（task-153）**，**不在我的写范围**，我没有改它。**请派属主核**（我这一轮的改动只碰 `scripts/generate-wired-schema.mjs`／`tests/generate-wired-schema-fallback.test.mjs`／`package.json`，与该字段无关）。
2. **`docs/11` 等生成块**：需 Lead 的 `--write`（本任务只落 `--check` 的读侧与具名，不改生成块）。

## 6. 需要 Lead 的动作

1. **跑 `--write`**（把 8 行 `doc` 里的名字落进生成块）⇒ 之后 `--check` 应回 **in sync**；
2. **派 `vmu-pack2`** 核 `status().packs` 为 undefined 的 `vmu-entry:151`（上面第 5.1 条）；
3. T0/T1 与整轮提交归 Lead。
