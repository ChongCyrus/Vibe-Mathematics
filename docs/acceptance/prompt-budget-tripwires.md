# 提示词预算绊线（TB-2705）：从「陈旧数字」改成「会说真话的判据」

<sub>2026-11-10 · 判据 `tests/vmu-run256-prompts-compress.test.mjs` · 本文是诊断与口径账，不是新机制</sub>

## 0. 结论与读数

| 指标 | HEAD `92bc6d94` | 本轮改后 | 归因 |
| --- | --- | --- | --- |
| 三份 normal 合计 | 74 047 | **75 940** | TB-2692 教学 +1 566，删重复 −138，TB-2707 归档句 +465 |
| chair/normal | 28 166 | **28 684** | 同上（+409 −46 +155） |
| fixture-tools（每席） | 1 291 | **1 409** | +164 教学，−46 已删重复 |
| `v5r-turn-channels`（每席） | 1 159 | **1 314** | TB-2707 +155 |

- `node scripts/audit-prompt-budget.mjs --check` → **PASS**（1 warning：chair/meeting 35 009 < cap **36 500**）。**两个 cap 都没上调**（chair/meeting 36 500、seat 30 100）；本轮没有为水位删任何教学。
- 三条旧绊线（§1h 1 455 > 1 300、§5b 75 613 > 75 414、§5c 75 613 > 74 214）的读数本身就是问题的一部分：HEAD 侧 74 047 / 1 291 已经**低于**两条旧总量/段落闸值，说明那些数字不是「当前口径」，而是某轮手写的余量；TB-2692 的教学一进来就红，而被红卡住的又不是重复。绊线该抓的是「同一事实说两遍」和「水位被悄悄改小」，不是「教学增长」本身。

## 1. 逐句归因（HEAD → 本轮；section 增量按渲染文本计，shared 段按三席各计一次）

诊断方法：`node scripts/sim/audit/prompt-sections.mjs --out …` 逐 section 量长，差值与 `git log -S"<句子>"` 定位到唯一提交，再读句子判 TEACHING / DUPLICATION。全部增长集中在 TB-2692（RUN 75 的提示词批评）与 TB-2707（F75-16 归档句）：

| section | Δ（三席合计） | 判定 | 来源 / 句子 |
| --- | --- | --- | --- |
| `v5r-turn-tracks` | +828 | TEACHING | TB-2692 状态板：`orderUnknownMeans`/`limitMeans`/`rowsFromMeans` 伴读 |
| `v5r-fixture-tools` | +492 −138 | TEACHING + 删重复 | 四形状码 + 「形状问题≠引擎不可用」；−138 见 §2 |
| `v5r-turn-tool-receipt` | +366 | TEACHING | 回执 57 顶层键、`identity.means` 会计恒等式 |
| `v5r-turn-loop-stuck` | +333 | TEACHING | parked `VMU_TURN_PARKED_NEEDS_OWNER` 三步 |
| `v5r-charter-opening` | +252 | TEACHING | 题目硬规则（F75-03） |
| `v5r-tools-academician` | −210 | 删除（RUN 247 遗留的残余复述） | RUN 247 收敛尾巴，TB-2692 复核时确认无规则句 |
| `v5r-tools-researcher` | −207 | 同上 | 同上 |
| `v5r-report-duty` | −111 | 同上 | 同上 |
| `v5r-charter-org` | −70 | 同上 | 同上 |
| `v5r-truth-note` | −60 | 同上 | 同上 |
| `v5r-tools-temp` | −36 | 同上 | 同上 |
| `v5r-charter-voting` | −11 | 同上 | 同上 |
| `v5r-turn-channels` | +465 | TEACHING | TB-2707：无条件归档句 → 条件+可校验+具名失败（169→324/席） |

算术恒等式：`74 047 + 1 566 − 138 + 465 = 75 940`；每席：`28 166 + 409 − 46 + 155 = 28 684`；fixture：`1 291 + 164 − 46 = 1 409`。

## 2. 删除清单（本轮唯一的 DUPLICATION）

| 文件 | 删除的短语 | 字符 | 为什么是重复 |
| --- | --- | --- | --- |
| `vibe-math-vmu/packs/v5r/prompts/v5r-core.js:561` | `；顶层字段不在清单 ⇒ \`VMU_TURN_UNKNOWN_FIELD\`（照 hint 改），` → `；` | 46/席（×3 = 138） | 同一 section 下方已经完整教过：`不在登记表里的字段会被判 \`VMU_TURN_UNKNOWN_FIELD\`，该回执的 hint 会列出此刻接受的全部字段名（\`known fields: …\`），据此改写调用即可`。前半句把「拒绝码 + 改法」说第二遍，与 tools 数组里 `VMU_TURN_UNKNOWN_FIELD` 的参数 description 也重复。 |

- 先 `grep -rn "顶层字段不在清单\|照 hint 改" tests/ scripts/ docs/` → **0 hit**，没有 pin 引用；删除后 `vmu-run256-prompts-compress`、`vmu-run239-prompts`、`vmu-ledger-teaching-pins`、`vmu-run247-prompt-dedup` 全绿。
- 其余增长在外观上像目录/复述的句子逐条读过：都是**规则/时机/失败处置**（例如「形状问题≠引擎不可用：改回执，不要去 probe 引擎」），不是 tools 参数表。判定：**TEACHING**，不动。

## 3. 基线口径（可复算，不写死历史数字）

```js
// 每一项都带来源归因注释（哪一句、来自哪个提交/事实、多少字符）
MEASURED = <本轮实测>            // fixture 1409 / channels 1314 / chair 28684 / sum 75940
MARGIN   = max(ceil(0.01 * MEASURED), 3)   // 15 / 14 / 287 / 760
CEILING  = MEASURED + MARGIN     // 1424 / 1328 / 28971 / 76700
```

- **为什么还保留余量**：合法教学（新回执字段、新失败码）会让文本增长，余量给「必须在本轮显式记账」的增长一点空间；而发水式的重复复述没有免费通行证——§1h2（同一拒绝码在一段里只能教一次）、§3/§4（结构句比对）单独抓重复，不靠字数。
- **`measured` 的精确 pin（§1h3 / §2e / §5d）**：只有上限断言时，把 baseline 改小 1 字符会被 `max(1%,3)` 的余量吞掉、永远不红——这正是「基线会撒谎」的形态。所以另加三条等式断言：`记录值 === 实测值`，任何变化（哪怕 +1 字符）都必须重新记账；上限是推导值，不是手调值。
- cap：`chair/meeting 36 500`、`seat 30 100`，本轮**未动**；`audit-prompt-budget --check` PASS。

## 4. 三条反关灯（仓库外副本，不动工作树）

副本：`git worktree add --detach D:/_tmp/wt2705 92bc6d94` + 把主树 5 个 prompt 文件、`tests/vmu-run256-prompts-compress.test.mjs`、`tests/vmu-tb2692-prompt-criticisms.test.mjs` cp 进去；脚本 `D:/_tmp/tb2705/lamp.mjs`（`dirrecap` / `dupfact` / `baseline` / `restore`）。基线（副本内）**34 passed / 0 failed**；恢复后仍 **34/0**。

**① 注入工具目录式重复句**（在 fixture 锚点 `    "本轮**可以且应该**调用你自己的工具，边做边记。",` 后插一行 RUN 247 式目录复述 `· vibe_v5_record_proposition —— 写命题卡（statement/value/motive/p 必填；草稿可写，不算已验证）。`）：

```
FAIL §1h the section is at its compressed size (<= 1424 = measured 1409 + max(1%,3) margin 15; TB-2705) 1487
FAIL §1h3 the recorded measurement is the live section length (a change must re-baseline the accounting, even +1 char; the ceiling alone cannot see it) { live: 1487, recorded: 1409 }
FAIL §5d the recorded measurements are the live ones (any change, even +1 char, must re-baseline the accounting; the ceiling is derived, not hand-tuned) { chair: 28762, recordedChair: 28684, sum: 76174, recordedSum: 75940 }
=== VMU RUN 256 PROMPTS COMPRESS: 31 passed, 3 failed ===
```

**② 同一事实注入两处**（插 `★ 围栏里的 JSON 不合法 ⇒ \`VMU_TURN_BAD_JSON\`，改回执即可（这句是把同一事实再说一遍）。`）：

```
FAIL §1h the section is at its compressed size (<= 1424 = measured 1409 + max(1%,3) margin 15; TB-2705) 1468
FAIL §1h3 the recorded measurement is the live section length (a change must re-baseline the accounting, even +1 char; the ceiling alone cannot see it) { live: 1468, recorded: 1409 }
FAIL §1h2 duplication counter: no refusal code is taught twice in the same fixture-tools section [["VMU_TURN_BAD_JSON",2]]
FAIL §5d the recorded measurements are the live ones (any change, even +1 char, must re-baseline the accounting; the ceiling is derived, not hand-tuned) { chair: 28743, recordedChair: 28684, sum: 76117, recordedSum: 75940 }
=== VMU RUN 256 PROMPTS COMPRESS: 30 passed, 4 failed ===
```

**③ 基线改小 1 字符**（`const NORMAL_SUM_MEASURED = 75475 + RUN2707_ARCHIVE_SENTENCE.sum` → `75474`，即 75 940→75 939）：

```
FAIL §5d the recorded measurements are the live ones (any change, even +1 char, must re-baseline the accounting; the ceiling is derived, not hand-tuned) { chair: 28684, recordedChair: 28684, sum: 75940, recordedSum: 75939 }
=== VMU RUN 256 PROMPTS COMPRESS: 33 passed, 1 failed ===
```

- ③ 的红落在 §5d 而不是 §5b/§5c：上限 `75 939 + 760 = 76 699` 仍 ≥ 实测 75 940，余量会把 1 字符吞掉（实测如此）。**这正是加等式 pin 的原因**：字数闸必须有一处对「记账值」本身敏感，否则改小基线永远不会被发现。

## 5. 边界

- 提示词正文本轮只做 §2 的 46 字符删除（TB-2705 的删重复）；未改 `kernel/**`、`packs/v5r/tools.js`、`scripts/sim/**`、`package.json`；未 commit。
- 本文只记录诊断、删除、口径与反关灯；判据本体在 `tests/vmu-run256-prompts-compress.test.mjs`（§1h/§1h2/§1h3/§2d/§2e/§5a-§5d）。
