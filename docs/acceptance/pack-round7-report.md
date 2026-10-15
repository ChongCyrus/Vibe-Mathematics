# vmu 交接 · Round 7 · task-55 报告（pack 保真度审计）

- 任务：`task-55`（vmu-pack）· 主交付 **`_handoff/vmu/11-pack-fidelity.md`**
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；**每个值都附 v5r `file:line`，无臆造**。

---

## A. 逐项对照（权威源＝v5r 自己的参数表）

**方法**：以 `vibe-math-v5r/vibe-math-v5r.js` 的 **`DEFAULT_PARAMS`（`:1062-1183`）** ＋ 顶层常量（`:229 PAPER_MAX_ROUNDS`、`:255 LEAN_QUEUE_CONCURRENCY` 等）为"v5r 当年确实那样跑"的一手证据，逐项对照 `settings/schema.js` 的**框架默认值**与 **pack 是否声明**。探针：`D:\_tmp\fidelity-keys.mjs`（键/默认/doc）、`D:\_tmp\fidelity-search.mjs`（按概念找键）。

**三类结果**（逐项表见主交付 §2）：
- **① v5r 那样跑且框架默认不同 ⇒ pack 必须声明：4 项**（3 项已落 ＋ **1 项纠错**）。
- **② 框架默认＝v5r ⇒ 不必声明：30 余项**（框架 schema 的 `P3` 注记多处写明"吸收 v5r 的 X"，即默认值就是从 v5r 抄的）。
- **③ v5r 有、vmu 无键（或有意不提供）：6 类**（4 真缺口 ＋ 1 值域不符 ＋ 1 有意分歧）。

## B. 本轮落地的声明（①，含 v5r 出处与读者）

| # | 键 | 值 | v5r 出处 | 读者 | 为什么必须声明 |
|---|---|---|---|---|---|
| 1 | `vmu.turn.selfCheck` | **false**（原 true） | `:1122` `resourceSelfCheck: false` | `packs/v5r/middleware/prompt-switches.js:27`（`OFF_SWITCHES`，`!== false` 门控 `v5r-turn-resources`） | 原先声明 `true` ⇒ 注入一段 **v5r 从不发**的【资源】段 |
| 2 | `vmu.control.idleAfterMs` | **120000**（新增） | `:1082` `activityTimeoutMs: 120000` | `kernel/control.js:65`（＋ `:206` `enforced[]`） | 框架默认 `0`＝不定义空闲 ⇒ 不声明则 v5r 的静止检测不会发生 |
| 3 | `vmu.paper.maxRounds` | 3（R6 已落，本轮复核） | `:229` `PAPER_MAX_ROUNDS = 3` | `kernel/paper.js:41,135`（`revise()` ⇒ `VMU_PAPER_ROUNDS_EXCEEDED`） | 框架默认 `0`＝无上限 |
| 4 | `vmu.limits.maxLiveMembers` | **删除**（原 3） | `:1130` `maxLiveChildren: 0`＝不设；`maxParallel: 3`（`:1081`）是**并发**维度 | — | 原声明会让本所拒掉 v5r 允许的第 4 名在活成员；框架已在 `vmu.limits.maxParallel`/`vmu.turn.maxParallel` 默认 3 |

**顺带发现（**Lead 已裁决：保留＋标注**）**：`vmu.math.maxParallel: 1`（R5 裁决）的值**等于框架默认**，且 v5r 的对应参数其实是 `leanJobsMaxParallel: 1`（`:1119`）——框架**已有同名键** `vmu.math.leanJobsMaxParallel`（默认 1）⇒ 该行属 ②（复述默认）。**裁决：保留**（整合包要可读、可调控），但**必须标注** `＝框架默认（复述）；v5r 对应参数 leanJobsMaxParallel:1（:1119）；非保真证据` ⇒ 已落在 `defaults.js` 该键上方注释 ＋ `defaults.json` 的 `_round7` 元数据（加载器只读 `defaults` 对象，元数据不进设置）。

## C. ③ 具名（v5r 有、vmu 无键／有意分歧，均给判据）

- `compactThreshold: 66`／`compactAfterRounds: 8`（`:1078/1079`）：**无键**（`vmu.memory.compactionEveryMs` 是记忆面周期，语义不同）。
- `finalPaper/paperFormat:'both'/paperLanguage:'zh'/paperCompilePdf`（`:1163-1166`）：**无键**（交付走 `publication.js`＋引擎三面门）。
- `paperEditor: 'academician'`（`:1167`）：`vmu.paper.finalizer` 的值域是 `['editor','contributor','any']`（`kernel/paper.js:69`）**不含 'academician'** ⇒ 声明它会被**静默回落**成 'editor'，**不要写**。
- `maxTempPerMember: 3`（`:1075`）／`memberMayRejectAssign: true`（`:1066`）：**无键**。
- `stallAutoMeetingMs: 360000`（`:1083`，静止即**自动开会**）：vmu 的 `vmu.control.idleAction` 默认 `'notice'`＝**只提示**⇒ **有意分歧**（R1：框架只推荐、不驱动；要周期推进由部署声明 `vmu.schedule.*` 并自行 arm/tick，见 `docs/10 §4.3`）。
- `provider/model/toolAllow/toolDeny/staffPersona/tempTool*`（`:1176-1182`）：**不是设置键**（per-spawn 接缝 ＋ `vmu.tools.faces`）⇒ **不是缺口**。

## D. 文档

- `docs/10-packs.md` **新增 §4.5**：保真度口径（R1）＋ 本轮 3 处修正表（含 v5r 出处）＋ "真正改变行为的约 8–10 键 vs 复述默认"的区分 ＋ ③ 具名清单。
- `docs/05/06/27` **未改**（本轮零钩子/管线/pack 文件变化）。

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `packs-with-defaults checked; undeclared=0`（**35 键**） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/vmu-settings.test.mjs` | 0 | 47 passed, 0 failed |
| `node tests/vmu-planned-settings.test.mjs` | 0 | **ALL GREEN（planned=113, docs=27, 39/0）** |
| `node tests/vmu-entry.test.mjs` | 0 | 150 passed, 0 failed |
| JSON/JS 同键同值核对（内联探针） | 0 | `keys 35 sameKeys true diffs []`；`selfCheck false / idleAfterMs 120000 / maxLiveMembers absent` |
| `node --check packs/v5r/settings/defaults.js` | 0 | 语法通过 |
| `node tests/vmu-round1-seams.test.mjs` | **1** | **38/2**：K5 的两条断言以 `'vmu.turn.selfCheck': false` 作为**会话值**、靠与 pack 默认**冲突**来验证 NAMED conflict／shadowed；我把 pack 默认改成 `false` 后二者**相等** ⇒ 冲突不再发生。**已把最小修法发 vmu-verify**（`:244/:254` 会话值改 `true`、`:252` 期望值改 `true`）。**非实现缺陷**。 |

**非我红**：`vmu-round1-seams` 的 2 条（tests 归 vmu-verify，修法已给）；`audit-vmu-docs` 的 1 条（`VMU_PAPER_ROUNDS_EXCEEDED` 未登记 docs/03 §8，core）。

## 未做项 / 待他人

1. §4.1–4.3、4.5 的键（若 Lead 要"v5r 的压缩节奏／终稿格式／院士终稿／编制上限"可声明）⇒ vmu-core 加键＋读点后我补 pack 默认值。
2. `vmu.math.maxParallel: 1` 的去留 ⇒ 等 Lead 一句话。
3. 矩阵 §9.3 的三类回填 ⇒ vmu-verify（依据＝主交付 §2）。
4. `vmu-round1-seams` 的两条断言 ⇒ vmu-verify（修法已给）。
