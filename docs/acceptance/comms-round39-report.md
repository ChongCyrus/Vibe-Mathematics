# Round 39 · task-178 · ① 自检"打印→断言"（统一为一版）＋ ② 计算属性访问收口（**本树 0 处**）＋ ③ 可选（未做）

> 纪律：表体/生成块不手写；反例副本制＋**target-addressed**；未跑全量（T0/T1 归 Lead）；未 git；`D:\_tmp\v39`。**"没跑/没核"与"跑了/核了"分开写**。

## 1. ① 主任务：反例器统一为**一版**，且两处检查**强制**（不再是打印）

- **统一**：`D:\_tmp\v39\counter.mjs` 是**唯一**的反例运行器（R36 版 `_tmp\v36\counter-r36.mjs` 与 R38 版 `_tmp\v38\counter.mjs` 的角色都并入它）⇒ **不再"两版并存"**。
- **强制项**：
  - **(a) 目标定位失败 ⇒ 抛**：`if (i < 0) throw new Error('★ TARGET NOT A ROW: …')`；
  - **(b) 目标格未变 ⇒ 抛**：`if (cellBefore === cellAfter) throw new Error('★ TARGET CELL UNCHANGED: …')` —— ★ **R38 版只是"打印"**，现在**变成断言**。
- **两条失效形态各给读数（负对照，逐字）**：
```
N1 (real row, OTHER cell edited) ⇒ blocked by check (b): ★ TARGET CELL UNCHANGED: L312 cell8 "❓ 未判定（可能走动态读取，静态" (check (b) fired)
N2 (prose-only key)             ⇒ blocked by check (a): ★ TARGET NOT A ROW: no TABLE ROW for vmu.turn.selfCheck  (check (a) fired)
```
⇒ ★ **R35 的失效形态（变异落散文行 ⇒ 目标格未变）现在【当场炸】**，而不是"恰好被锚点拦住"；**另**一条"锚点命中真行但只改同行其它格"也被 **(b)** 拦住。
- **真反例（同一运行器）**：
```
M1 (blank the tier CELL) TARGET-ADDRESSED ✓ L312 stillRow=YES cell8 "❓ 未判定（…" → ""
  audit ⇒ exit=1 (red ✓)  FAIL …the THREE tiers…(blank or vague still reddens)      ★ 红在被测断言上: YES ✓
M2 (❓ rewritten as ⚠️)  TARGET-ADDRESSED ✓ L312 stillRow=YES cell8 "❓ 未判定（…" → "⚠️ 未接线（…"
  audit ⇒ exit=1 (red ✓)  FAIL …criterion cannot decide it [vmu.turn.selfCheck]     ★ 红在被测断言上: YES ✓
REAL TREE UNTOUCHED: OK (read-only ✓)
```
- ★ **只改我自己的反例器**（`_tmp`）；**未动任何别人的测试**。

## 2. ② 计算属性访问（`NS[key]`）：**从"没核"升级为"核了：本树 0 处"**（并给出可核判据与范围）

- **先纠一个会误导的数**：全仓 `\[[A-Za-z_$][\w$]*\]` 在 **`vibe-math-vmu/**/*.js`（深度 ≤3）** 上＝ **792** 处；★ **绝大多数是普通索引**（`settings[key]`、`map.get(k)`、数组下标）⇒ **它不是本残余的判据**（R38 我引的 559 是**更窄的文件集** kernel/*.js＋packs/v5r/*/*.js＋*.js，两者**范围不同**，我不能拿其中任一个当"残余数"）。
- **真正的判据**：**`<nsBinding>[ … ]`，其中 `<nsBinding>` 来自 `import * as NS from …` 或 `const X = (await) import(…)`**（这正是"命名空间拿到名字"的形态，也是 R38 记的那条残余）。
- **实测（`D:\_tmp\v39\computed.mjs`）**：
```
raw `\[[A-Za-z_$][\w$]*\]` hits (WRONG base)      : 792
★ residual candidates  <nsBinding>[ … ]           : 0
```
⇒ ★ **本树 0 处** ⇒ **R38 的"没核"可以收口为"核了：0 处"**（判据与范围如上）。⇒ **不需要**为它做"有界可解析子集"（**没有可解析的对象**）；**若将来出现**，判据是 **`NS\[`**（NS 来自那两种绑定）⇒ 再逐处判"常量键/动态键"。
- ★ **残余（具名，仍可能）**：**动态键**（`NS[dyn]`）与**字面量常量键**（`const K='x'; NS[K]`）——★ 本树**当前 0 处**；一旦出现，**该形态静态不可解析 ⇒ 写"没核"**，**不写成"没人读"**。

## 3. ③ 可选性能：**本轮未做**（具名）

| 命令 | R37 末基线 | 本轮 | 说明 |
|---|---|---|---|
| `settings-table --check` | 5.06s | **5.73s** | 含 R38 的命名空间/解构通道 |
| `wiring-index --check` | 6.83s | **7.54s** | ★ 仍高于 ≈6.65s 目标 |

- ★ **③（四类导入正则合并为单次扫描）未做** ⇒ **不给"③ 的"秒数**；★ **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。★ 若你要 wiring-index 回 ≈6.65s，**这是唯一剩余杠杆**（把 4+2 个导入/命名空间正则合并成一次分派）。

## 4. 收口

- **计数与 `--check`**：`1108 wired / 5 undetermined / 113 notWired`、**`stale: false`** ⇒ **本轮不需要 `--write`**。
- **本轮仓内改动：无**（①只改 `_tmp` 反例器；②只给判据与读数）⇒ ★ **"未改仓内文件"是结论、不是遗漏**；`vibe-math-vmu.js`／`host.js`／`docs` 未碰。
- **跑了/核了**：反例 N1/N2/M1/M2（各给读数）；计算属性访问判据（792 vs 0，范围写明）。
- **没核/没做**：③ 未做；② 的"将来出现则没核"（当前 0 处）；★ 我**未复跑** `audit-vmu-docs` 的 103/0（`stale:false` ⇒ 无红触发；要补一条命令即可）。
