# vmu 交接 · Round 6 · task-47 报告（目标 4 终判 · v5r pack 一致性）

- 任务：`task-47`（vmu-pack）· 主交付 **`_handoff/vmu/09-goal4-verdict.md`**
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；`packs/v5r/prompts/**`（清单/提示词）与 `settings/**` **不在我的写范围** ⇒ 涉及它们的项只具名 + 给判据。

---

## A. 逐条对照（以 125 行矩阵为基线，逐行核 **pack 侧**）

**方法**：`04-parity-matrix.md` 的 125 行（A 47＋X 9、B 20、C 57）逐行取"v5r pack 声明"列 → 用四个探针核对**pack 实际声明了什么**：
1. `D:\_tmp\goal4-keycheck.mjs` —— 矩阵声称的键名 vs `settings/schema.js` vs pack 真声明；
2. `D:\_tmp\goal4-pack-readers3.mjs` —— pack 的 47 个键逐个找**真读者**（内核/宿主/工具/入口；`packs/**` 与 `settings/**` **不算读者**）；
3. `D:\_tmp\goal4-matrix-extract.mjs` —— 把矩阵 93 个"pack 声明"字符串去重，逐条判定；
4. `D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓外一次性探针·实测）—— 声明的键是否都在 schema。

**结论（总判定，见 `09-goal4-verdict.md §0`）**：
- **① pack 已声明且真生效**：**47 个 `vmu.*` 键**（`defaults.json` 34 ＋ 清单 13，去重 47）＋ 1 条 M1 规则 ＋ 1 个 prompt 策略 ＋ 4 个 prompt 模块 ＋ 3 slots／5 tracks ⇒ **直接承载约 35 行机制**，**每个键都点名真读者**（41 个内核读者 ＋ 5 个由 pack 自己的 `middleware/prompt-switches.js` 读）。
- **② 框架具备、pack 未声明**：**约 89 行**——内核已有原语/键，v5r 取**框架默认值**或**默认不启用**；**不是缺口**（逐行给出可声明的键族，如 `vmu.mailbox.digestMax/digestWindowMs`、`vmu.motions.secondThreshold`、`vmu.tenure.*`、`vmu.grant.*`、`vmu.control.idleAfterMs`、`vmu.schedule.*`）。
- **③ 真缺口**：**1 条子项（M-A04 论文轮次上限无键）＋ 1 个孤儿键（`vmu.meetings.reconsiderFloor`）**；另有 **4 处矩阵键名是 v1 转述**（真名已在 §3.1 给出，**不是缺口**）。
- **没有一行是"框架与 pack 都缺"**（C-30／C-45／C-52 已在 R3/R4 闭合，本轮复核）。

**★ 三处"矩阵声称 pack 声明、实际不存在"的键名（真名）**：
| 矩阵写的 | 真名（框架已有，pack 未声明） |
|---|---|
| `GRANTABLE_COMMANDS`／`GRANT_SCOPES`（M-A30） | `vmu.grant.commands`／`defaultScope`／`enabled`／`maxOpenGrants` ＋ `vmu.delegation.*`(12) |
| `vmu.lean.*`（M-B12） | **不存在**；框架承载是 `vmu.math.*`（pack 已声明 3 个） |
| `chatDigestMax(12)`／`chatDigestMs(45s)`（C-05） | `vmu.mailbox.digestMax`（**默认 12**）／`digestWindowMs`（**默认 45000**）——**与 v5r 值逐字相同** |
| `SECRETARY_ENTRY_MAX`／`min_votes`／`motionSecondsRequired` | `vmu.minutes.verbatimCapBytes`／`vmu.ballot.minVotes`／`vmu.motions.secondThreshold` |

## B. 三类结论 —— 见主交付 `09-goal4-verdict.md`

- §1 ①（逐键 → 机制 id → **真读者 file:line**）：47 键 ＋ 非 settings 声明（规则/策略/提示词/slots/tracks/phases/codes）。
- §2 ②（逐行：机制 → 框架键族 → 默认状态）：约 89 行，含"**框架默认值恰等于 v5r 值**"的 4 处。
- §3 ③（真缺口 ＋ 孤儿 ＋ 键名转述）：G1 论文轮次上限；§3.2 `vmu.meetings.reconsiderFloor`；G2–G5 键名转述。

## C. 能补就补 —— **pack 侧本轮无需再改**

- pack 能改的（`packs/v5r/settings/**`、`middleware/**`、`docs/10`）本轮**全部已达标**：47 键**零孤儿**（唯一孤儿 `vmu.meetings.reconsiderFloor` 在 **vmu-assistant 的清单**与 **vmu-core 的 schema** 里，不在我写范围）；`vmu-pack-defaults-vs-schema.mjs` → `undeclared=0`。
- **顺带修掉一条跨面红（我的文件）**：`kernel/lean.js` 在 `lean/` 命名空间 emit `lean/job-cancelled` 但**未登记** ⇒ 总线**具名拒**、被 helper 吞（静默；reader-a 发现、Lead 确认）⇒ 已登记进 `HOOK_REGISTRY`（`failure:'open'`，producer `kernel/lean.js`）：`VU_HOOKS` 85→**86**，`audit-hook-coverage` 由红转 **4/0**，仓内门禁 **7/0**。
- **四项具名未做**（`09-goal4-verdict.md §5`）：① 删/接 `vmu.meetings.reconsiderFloor`（core＋assistant）；② `vmu.paper.` 家族的轮次上限键（core）；③ 编制上限键（先核 `vmu.tenure.*`(11) 是否已覆盖）；④ 矩阵 pack 列改判（verify）。

## D. 文档 —— 已同步

| 卷 | 改了什么 |
|---|---|
| `docs/10-packs.md` | **新增 §4.4「目标 4 终判的 pack 侧结论」**：总判定（①②③）＋ 三行处置表（孤儿键／M-A04 子项／4 处键名转述）＋ "pack 侧本轮无需再改" |
| `docs/27`／`docs/05`／`docs/06` | **未改**（本轮零 pack 文件新增、零钩子语义变化——只有一条**登记**；`audit-pack-face` 5/0） |

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/audit-hook-coverage.test.mjs` | 0 | **4 passed, 0 failed**（登记 `lean/job-cancelled` 后由红转绿；86 个登记钩子 ⇄ emit 点） |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | **7 passed, 0 failed**（分类完备 / 无纸面能力 / declareTopic 对称） |
| `node tests/vmu-planned-settings.test.mjs` | 0 | **ALL GREEN（planned=113, docs=27, passed=39, failed=0）** |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-bus.test.mjs` | 0 | 44 passed, 0 failed |
| `node tests/vmu-kernel.test.mjs` | 0 | 175 passed, 0 failed |
| `node tests/vmu-host.test.mjs` | 0 | 103 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node scripts/check-docs.mjs` | 0 | **DOC LINT: PASS**（`docs=29 issues=0`） |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `packs-with-defaults checked; undeclared=0` |
| `node D:\_tmp\goal4-pack-readers3.mjs`（仓库外一次性探针·实测） | 0 | 47 键：41 内核读者 ＋ 5 pack 策略模块读者 ＋ **1 孤儿** |
| `node D:\_tmp\goal4-keycheck.mjs`（仓库外一次性探针·实测） | 0 | 矩阵声称键 vs schema vs pack 的三方对照（G2–G5 的依据） |

## 追加：孤儿键 `vmu.meetings.reconsiderFloor` 的清理（Lead 小项，已执行）

| 位置 | 归属 | 状态 |
|---|---|---|
| `packs/v5r/prompts/v5r-core.js:78`（清单值） | vmu-assistant（Lead 指派） | ✅ 已删 |
| `packs/institute-min/index.js:51`（清单值）＋ 文件头注释 | **vmu-pack** | ✅ 已删／已改述（改指 `vmu.ballot.reopenFloor`） |
| `packs/v5r/settings/defaults.js:93`（注释） | **vmu-pack** | ✅ 已改述 |
| `settings/schema.js:126`（声明行） | vmu-core | ⏳ 待删（顺序：清单先清，否则 `vmu-settings` 把"清单里点名"当"运行时读取"而红） |

- **原意由谁承载**：`vmu.ballot.reopenFloor`（本 pack 声明 `0`；真读者 `kernel/ballotbox.js:22,41,137` 的 `reopen()`）。
- **清完复跑（全 exit 0）**：`vmu-settings` **47/0**、`vmu-planned-settings` **ALL GREEN（planned=113, 39/0）**、`vmu-pack` 53/0、`audit-pack-face` 5/0、`vmu-entry` 150/0、`check-docs` **PASS**、`scripts/audit-hook-emit-classification.mjs` **7/0**。

## 未做项 / 待他人

1. `settings/schema.js:126` 的删除 ＋ `docs/04` 重生成（vmu-core；我这边三处清单/注释已清，已通知它）。
2. `vmu.paper.` 家族的轮次上限键（core；否则 M-A04 的"可覆盖轮次"必须撤回）。
3. 编制上限键（先核 `vmu.tenure.*`(11)）。
4. 矩阵 pack 列按 `09-goal4-verdict.md §4` 改判（verify）。
