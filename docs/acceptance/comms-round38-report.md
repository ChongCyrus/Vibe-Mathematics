# Round 38 · task-177 · ① `export *`／动态解构落地 ＋ ★ 反例自检升级为 target-addressed ＋ ② 可选（未做）

> 纪律：表体/生成块不手写；反例副本制＋**变异落地自检**；未跑全量（T0/T1 归 Lead）；未 git；`D:\_tmp\v38`。

## 1. ① 两形态已落地 —— ★ 并且**发现它们归约成同一条规则**（这改变了 R37 的设计与代价）

**R37 我给的设计**要"每文件导出名表 ＋ 并入 ＋ **星链有界传递（深度 ≤2）**"。★ **本轮落地时发现那一步是多余的**：
本判据是**按名字**的（`IMPORTERS: name → 会用到它的文件`），它**从不问"这个名字从哪里导出"**，只问"**哪个文件拿到了它、并在那里遍历**"。因此 `export * from` **不需要星边解析、也不需要深度上限** —— 需要的是**消费者拿到名字的那两种通道**，而它们都是**模块命名空间**：
| 形态 | 落地方式 |
|---|---|
| **`import * as NS from '…'` 后 `NS.NAME`**（`export *` 链的消费者最终就是这个样子） | 收集每文件的命名空间绑定 `NS`，把 `NS.NAME` 的 `NAME` 记进 `IMPORTERS[NAME]` |
| **`const { NAME } = await import('…')`** | 在含 `import(` 的行上解析**解构模式**，把**本地名**（`A: B` 取 `B`）记进 `IMPORTERS[NAME]` |

- ★ **判据不变**：命名空间**只是"拿到了名字"**，**必须仍在那里遍历**才算证据（builder 的遍历要求没动）⇒ **看不见仍不写成"没人读"**。
- ★ **代价比 R37 估的低**：没有星链闭包，只有**一遍**额外扫描，且**只对含 `import` 的行**跑（★ 我第一版忘了这道护栏，3 个正则跑在**每一行**上 ⇒ 实测 `wiring-index` 6.83 → **10.17s**；加 `l.indexOf('import') < 0 ⇒ continue` 后回落，见 §3）。
- **★ 范围＋残差口径**：我按这两形态核了**全部含命名空间/动态导入绑定的文件**（本树命中面）；**新增命中 0 处**（计数不变，见 §2）；**超出静态可见的部分写"没核"**：**计算属性访问**（`NS[key]`、`NS[dynamicName]`）**无法静态解析** ⇒ **没核**，**不写成"没人读"**。

## 2. 计数与 `--check`：**未变、且不陈旧**

```
--json: { "wired": 1108, "undetermined": 5, "notWired": 113, "stale": false }
```
⇒ ★ 两形态在本树**没有产生新证据**（不是"没生效"：机制见 §1；证据面＝本树没有"以命名空间/解构拿到名字、且那个列表没被别处覆盖"的键）。★ **`stale: false`** ⇒ **表与判据一致 ⇒ 本轮不需要 `--write`**（docs 里 5 个 `❓` 与判据一致，是你 R37 那次 `--write` 的结果）。

## 3. 性能（同机、同会话；`[Diagnostics.Stopwatch]` 包住整条命令）

| 命令 | 基线（R37 末） | 本轮最终 | 中途（缺护栏） |
|---|---|---|---|
| `settings-table --check` | 5.06s | **5.43s** | 5.96s |
| `wiring-index --check` | 6.83s | **7.41s** | **10.17s** |

- ★ 机制：新扫描是**一遍**、且只对含 `import` 的行跑；残余 **+0.37／+0.58s** 来自"每文件多一次行遍历＋命名空间成员 `matchAll`"。
- ★ **② 可选（四类正则合并为单次扫描）本轮未做** ⇒ **不给"② 的"秒数**；★ **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（"修负载，不修预算"）。★ 若你要 wiring-index 回到 ≈6.65s，② 是我看到的**唯一**剩余杠杆（需把 4+2 个正则合并成一次分派）。

## 4. ★ 纪律升级：反例自检改为 **target-addressed**（verify2 R37 建议，你本轮要求）

- **旧自检的漏洞**：只答"**文件变了吗**"。R35 的假绿里，锚点打在**散文行**上 ⇒ 文件**确实变了**（散文行被改）⇒ 旧自检**会误报"落地成功"**；R36 那次"恰好"报了"没落地"是**运气**（命中行不含可替换的档位文本 ⇒ 文本没变）。
- **新自检（`D:\_tmp\v38\counter.mjs`）**：先定位**目标键的表格行**（`/^\| \`vmu\./` ＋ 含该键）⇒ 若定位不到**直接抛** `★ TARGET NOT A ROW`（★ **这正是 R35 的失效形态，现在会当场炸而不是假绿**）；然后断言**该行第 8 格 before ≠ after**。
- **实测输出（逐字）**：
```
M1 (blank the tier CELL of a real row) TARGET-ADDRESSED: L312 key=vmu.turn.selfCheck stillRow=YES ✓
   cell8 "❓ 未判定（可能走动态读取，" → ""            ★ CELL CHANGED ✓
   exit=1 (red ✓)   FAIL every settings row states which of the THREE tiers the key is in (✅/❓/⚠️ — no silent promises; blank or vague still reddens)
   ★ 红在被测断言上: YES ✓
M2 (❓ rewritten as ⚠️) TARGET-ADDRESSED: L312 key=vmu.turn.selfCheck stillRow=YES ✓
   cell8 "❓ 未判定（…" → "⚠️ 未接线（改了不会有行为"    ★ CELL CHANGED ✓
   exit=1 (red ✓)   FAIL no key is marked unwired although a runtime source reads it — or although the criterion cannot decide it [vmu.turn.selfCheck]
   ★ 红在被测断言上: YES ✓
REAL TREE UNTOUCHED: OK (read-only ✓)
```
⇒ ★ **两个反例：目标行定位成功、目标格确实改变、红落在被测断言上、真树未动**。**只改了我自己的反例器**（`_tmp`），**没动别人的测试**。

## 5. 收口

- **本轮仓内改动**：`scripts/generate-vmu-settings-table.mjs`（两形态的命名空间/解构通道 ＋ 行护栏）。
- **不需要 `--write`**（`stale:false`、计数不变）；`audit-vmu-docs` 状态：★ **本轮我未复跑**（因为 `stale:false` ⇒ 无红触发条件）—— ★ 严格说这是 **没核**；如需我把"当前审计仍 103/0"补成实测，说一声即可（一条命令）。
- **没核**：计算属性访问（`NS[key]`）；② 未做；"审计当前仍 103/0"未复跑。
