# Round 34 · task-166 · 跨文件遍历定位器 ＋ 7 行"没核"收口 ＋ 反例补"红在被测行"

> 承接 R33 `comms-round33-report.md` §8 的 7 行"判未接线但没核"。纪律：表体/生成块**不手写**；反例**副本制**；未跑全量（T0/T1 归 Lead）；未 git。写范围：`scripts/generate-vmu-settings-table.mjs`、报告。

## 0. ★★ 最重要的一条：**你裁定 (a) 的输入是我的一个 bug —— 诚实数是 `3/115`，不是 `4/114`**

- R33 我改成**单遍索引**后计数从 3/115 变成 **4/114**，我把它当"判据更准"（第 4 个＝`vmu.paper.retentionMs`），你也据此裁 **(a) 接受 4/114**。
- ★ **本轮我查出那是我自己的 bug**：单遍版**用 `/^\];?\s*$/` 判断"列表到此结束"** ⇒ 用 `],`／`])`／`], // 注` 收尾的列表**永远不终止** ⇒ 扫描**越界到下一个声明**，把后面的键**配给了一个无关的、被遍历的列表** ⇒ `vmu.paper.retentionMs`（其实是**从不被遍历**的 `PLANNED_KEYS` 的元素）被误判成「未判定」。
- ★ **修法**：**按括号深度**终止（逐行统计 `[` 与 `]`，深度 ≤0 即结束）⇒ 修后计数**回到 `1108 wired / 3 undetermined / 115`**（`--json` 实测）。⇒ **R33 的 3/115 是对的**，`paper.retentionMs` 从来不是"未判定"。
- ⇒ **请把 `--write` 按修后重跑**（现在 `--check` 报 **STALE**：docs 里那格还留着 R33 误判写进去的 `❓`）⇒ 落盘后应为 3/115。★ 这正是你那条纪律的**反向应用**：**"旧数字是旧方法的产物"** —— 这次 4/114 是**我新方法**的产物，所以按同一条纪律作废它。

## 1. ① 跨文件遍历定位器（导入图）

- 新增 `IMPORTERS`（**单遍**扫 `import { … } from '…'`，`名字 → 导入它的文件集`）＋ `BY_REL`；列表**本文件内**找不到遍历点时，**沿导入图**去"谁 import 了这个名字、并在那里遍历它"找 ⇒ 命中则记为 `{rel(声明文件), listName, elemLine, iterLine, iterRel, crossFile:true}`。
- `verdictOf` 语义不变（三档），**且"看不见"仍不写成"没人读"**：既不在本文件遍历、也没有具名导入者遍历 ⇒ 仍 **`未接线`**。
- ★ 性能护栏：`IMPORTERS` 扫行前先 `l.indexOf('import') < 0 ⇒ continue`（否则正则跑遍每行）。

## 2. ② 7 行逐行结论（**核了 / 没核**严格分开）

探针：`D:\_tmp\v35\rows-crossfile.mjs`（对每个键：定位持有它的列表 → 同文件遍历点 → 具名导入者 → 导入者处的遍历点）。

| 键 | 结论 | 证据（逐字） |
|---|---|---|
| `vmu.ballot.freezeMeetingLinked` | ★ **未接线（已核）** | 元素 `kernel/ballotbox.js:18`（列表 `ALL_BALLOT_KEYS`）＋ `:59`（`PLANNED_BALLOT_KEYS`）；**同文件遍历＝—**、**具名导入者＝无** ⇒ 无动态读路径 |
| `vmu.ballot.freezeMode` | ★ **未接线（已核）** | `ballotbox.js:18`（`ALL_BALLOT_KEYS`）／`:55`（`PLANNED_BALLOT_KEYS`）；同上 |
| `vmu.ballot.reopenInitiatorScope` | ★ **未接线（已核）** | `ballotbox.js:22`／`:64`；同上 |
| `vmu.ballot.reopenSameMeetingOnly` | ★ **未接线（已核）** | `ballotbox.js:23`／`:67`；同上 |
| `vmu.paper.retentionMs` | ★ **未接线（已核）** | 元素 `kernel/paper.js:71`（`PLANNED_KEYS`）；同文件遍历＝—、具名导入者＝无 ⇒ ★ 即 §0 那个误判的受害者 |
| `vmu.teaching.blindMappingRetentionMs` | ★ **未接线（已核）** | `kernel/course.js:32`（`COURSE_KEYS`）／`:57`（`PLANNED_COURSE_KEYS`）；同上 |
| `vmu.teaching.maxUnits` | ★ **未接线（已核）** | `course.js:33`／`:62`；同上 |
| `vmu.turn.objective` | ★ **没核** | 元素 `packs/v5r/prompts/v5r-core.js:155`，但**持有它的列表我定位不到**（`列表=null`，探针向上 60 行内没有 `const NAME = [`）⇒ 判据给「未接线」，**但我不能说"已核"**（很可能在一个我没识别的结构里，例如更上方的声明或对象字面量） |
| `vmu.turn.instituteName` | ★ **没核** | 同上（`v5r-core.js:154`） |

**范围声明（不许当成全覆盖）**：跨文件只覆盖 **`import { … } from` 具名导入**；**默认导入／命名空间导入（`import * as`）／`export … from` 再导出／动态 `import()`** 我**没覆盖** ⇒ 那部分是**没核**。

## 3. ③ 反例：★ **红在被测那一行**（R33 的"半个证据"本轮补上）

- **R33 的缺口**：审计**先跑生成器 `--check`** ⇒ 改 docs 必然先红成 STALE ⇒ "红了"成立、"红在被测断言上"未成立。
- **本轮修法（照我 R33 自己具名的）**：副本里**先把生成器的 STALE 子检查中和**（注释掉那条 `process.exit(1)`，**只在副本内**），再清空某行的档位格，然后跑副本的审计 ⇒ 这样红**只可能**来自审计自己的断言。
- **结果**（`D:\_tmp\v35\counter-line.mjs`，真树 hash 前后一致 ✓）：
```
MUTANT (blanked cell, STALE sub-check neutralised): exit=1 (red ✓)
  FAIL no key is claimed UNDETERMINED unless the criterion really cannot decide it
       (the third tier is a finding, not an escape hatch) [vmu.paper.retentionMs]
REAL TREE UNTOUCHED: OK (read-only ✓)
```
★ **红确实落在被测断言上**（我在 R33 加的 `lyingUndetermined`），而且**逐名点出 `vmu.paper.retentionMs`** —— ★ **它捕到的正是我自己 §0 那个越界误判**：docs 里那格是 `❓`、修好的判据说 `未接线` ⇒ 断言当场红并点名。⇒ **R33 的"半个证据"闭环**：现在是"**红了，而且红在断言上，并说清了红在哪个键**"。
- **真树的当前红**：`node tests/audit-vmu-docs.test.mjs` ⇒ **exit=1**，输出**只有 STALE 两行、没有 `FAIL`/摘要** ⇒ ★ **红的原因就是"表陈旧"**（子检查先跑并终止）⇒ **你 `--write` 后应回 103/0**；★ **这一条我未复验（没核）**。

## 4. 性能红线（同机、同会话；`[Diagnostics.Stopwatch]` 包住整条命令）

| 命令 | 基线（R33 修后） | 本轮改后 | 判定 |
|---|---|---|---|
| `generate-vmu-settings-table.mjs --check`（本轮量 `--json` 同路径） | 4.8–5.5s | **4.84s** | ✓ 未拖慢 |
| `generate-wiring-index.mjs --check` | ≈6.4s | **6.65s** | ✓（+0.25s，含导入图单遍＋`indexOf` 护栏） |

★ **未改** `tests/run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（修负载、不修预算）。

## 5. 收口与没核清单

1. **请 Lead 跑 `--write`**（`--check` 现为 **STALE**：docs 需从 4 个 `❓` 回到 **3 个**）⇒ 期望 `1108 / 3 / 115`、`audit-vmu-docs` 回 **103/0**；★ **已落库**：`--write` 后树上是 **`1108 wired / 3 undetermined / 115`**、`audit-vmu-docs` **103/0**、T1 **323/323**，提交 **`8431f6d`**；
2. **没核（保持原样）**：`turn.objective`／`turn.instituteName` 两行（持有它们的列表定位不到）；跨文件覆盖的**默认/命名空间/再导出/动态导入**面；
   - ★ 原第三条「`--write` 后的 103/0 我未复验＝没核」**现改为：Lead 已核（★ 转述，非我复验）—— `8431f6d` 提交时 103/0 与 3/115 均已成立**。★ **转述的证据必须标明来源**：这条由 Lead 提供，我本人**仍未**在提交后复跑它；
3. **具名下一轮（可选）**：把那两个"列表定位不到"的键判实（需要更强的结构识别：对象字面量／计算属性／更远的声明）。

---

## 6. ★ 本轮之后入账的纪律（Lead 裁定，我照记）

**「旧数字是旧方法的产物」这条【双向】成立 —— 新数字也可能是新方法的产物。** ⇒ **凡是"数字变了"，采纳前必须先给【机制层解释】（哪一行、什么规则、为何改变），不能因为"新方法看起来更好"就收。**
★ 本轮的实例就是我自己：3/115 → 4/114 我当成"判据更准"，Lead 据此裁 (a)；**机制层一查**才知是 `/^\];?\s*$/` 判"列表结束"的**越界**（`],`／`])`／`], //` 收尾的列表永不终止 ⇒ 扫描越界到下一个声明）⇒ 修后回 **3/115**。★ 顺序应当相反：**先给机制、再改数字**；我 R33 给的是"更准"、**不是机制**（机制解释是 R34 才补上的）。
★ 配套三条：**"红了"与"红在被测那一行"必须分开说**（R33 半个证据 → R34 用"副本里先中和 STALE 子检查"闭环）；**"没核"与"核了"必须分开写**；**转述的证据要注明来源**。
