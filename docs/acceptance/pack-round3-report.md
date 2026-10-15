# vmu 交接 · Round 3 · task-21 报告（机制面收尾：C-30 策略声明 · tier 声明 · 新键声明 · docs）

- 任务：`task-21`（vmu-pack）；判据：`round3-plan.md`、`00-decisions.md`（D-08/D-15）、`04-parity-matrix.md`（C-30/C-45）
- 纪律：未跑全量 sweep、未跑 `regen-all`、未动 git；临时文件在 `D:\_tmp`；只改我名下文件（`packs/**` 除 `packs/v5r/prompts/**`，以及 `docs/05/06/10/27`）。
- 本轮我**没有改任何 `kernel/**` 文件**（无钩子/中间件/管线改动，见 D）。

---

## A. C-30（office 定稿咨询门）· **已闭合**（reader 落地后我补了 5 个默认值）

- **键面**由 vmu-core 落 `settings/schema.js:968-972`（与我提案逐字一致，**无 default-allow 档**）：`vmu.paper.officeConsult`(`off|required`, def `required`)／`officeConsultOn`(`finalize|finalize-or-submit`, def `finalize`)／`officeConsultTimeoutMs`(`0`)／`officeConsultOnTimeout`(`hold|refuse`, def `hold`)／`officeConsultExemptRoles`（**Lead F4 裁决后 def `[]`**）。
- **读取者已落地**（vmu-assistant）：`kernel/paper.js:45-49`（`WIRED_KEYS` 3→8）＋ `:111-114`（`cfg()` **无条件读全五键**）；未咨询即定稿 ⇒ **具名拒 `VMU_OFFICE_CONSULT_REQUIRED`**（`enforced[]` 五键 ＋ `enforcedScope`）＋ 审计 `what:'auth'`（subject `paper:<id>`）＋ 总线事件 `paper/office-consult-required`（经 `declareTopic` 扩展点）；`consult()/requestConsult()/consultState()`；超时 `hold` 保持请求且**仍拒**、`refuse` 清请求且**仍拒**，无法识别的值按 `hold`（`default-allow` 拼写进不来）。
- **我在 pack 里补的 v5r 语义**（`packs/v5r/settings/defaults.json` ＋ `defaults.js`，**只放 defaults，不进清单 `PACK.settings`**——同键两处会被判 O4 重叠冲突）：
  `officeConsult='required'`／`On='finalize'`／`TimeoutMs=0`／`OnTimeout='hold'`／**`ExemptRoles=[]`**。
- ★ **豁免名单为空**（Lead F4）：本门存在的场景正是"office 自己定稿"，默认豁免 `office` 恰好把该场景豁免掉；"默认不豁免"与超时 `hold` 是同一条保守纪律。schema 默认与 vmu-assistant 的代码 fallback 都已同步为 `[]`。
- 判据（`04-parity-matrix.md:253`）："未咨询即定稿 ⇒ 具名拒 + 留痕"**已满足** ⇒ C-30 可判 **闭合**（读取点落地前我坚持不写默认值，现按铁律补齐）。

## B. GAP-MTG-02 的 tier 声明 · **已落**

- `packs/v5r/settings/defaults.json` ＋ `settings/defaults.js`（两份同值）：
  - **`vmu.meetings.tier: 'formal'`** —— v5r 只有完整会议协议。
  - **`vmu.meetings.allowLight: false`** —— "是否允许 light"由 **pack** 声明：v5r 下任何 light（简流程）会议被**具名拒** `VMU_MEETING_TIER_CONFLICT`（不是静默产出），部署可改 `true`（reader-c 确认两种状态都已实现）。
- **真读取者（已核）**：`kernel/meetings.js:39`（`WIRED_KEYS`）、`:111-114`（`K.tier`/`K.allowLight`）、`:293-318`（`open()` 与 `truthWriteRefusal()` 共用的派生判定）、`:971-972`（`status()` 回显 `tier/allowLight/isLight/tierConflict`）、`:1087`（`keysSnapshot()`）。内核只提供 tier＋派生谓词（`light` 不得产出实体定论），唯一判定点在收束路径。
- 文档：`docs/10 §4.1` 轮 3 行 ＋ `docs/27 §4.3`。

## C. Round 3 新键声明（**每个键都点名真读取者**）

| 键 | v5r 默认值 | 真读取者（已核） | 依据 |
|---|---|---|---|
| `vmu.meetings.tier` | `'formal'` | `kernel/meetings.js:39,111-114,293-318,971-972,1087` | v5r 只有完整协议 |
| `vmu.meetings.allowLight` | `false` | 同上（`K.allowLight`） | v5r 不跑简流程 ⇒ 具名拒而非静默 |
| `vmu.ballot.reopenFloor` | `0` | `kernel/ballotbox.js` 的 `reopen()`（GAP-MTG-10） | v5r"门槛只升不降"⇒ 不额外加门槛（与清单里的 `vmu.meetings.reconsiderFloor: 0` 同口径） |
| `vmu.resume.writeThrough` | `true` | `kernel/resume.js:320,504` | v5r 需要"未批动作重启后仍在排队"⇒ 状态型投影必须写穿 |
| `vmu.resume.projections` | **10 面**（原 7 ＋ `chat`/`panel`/`human`） | `kernel/resume.js` 的 `PROJECTION_KEYS`／`attachProjection` | reader-a 本轮把 chat/panel/human 接进耐久投影 |
| `vmu.paper.officeConsult` | `'required'` | `kernel/paper.js:45-49`（WIRED_KEYS 3→8）、`:111-114`（`cfg()` 无条件读全五键） | C-30：v5r 的 `finalizePaperByOffice`/`notePaperConsult` ⇒ 定稿前必须征询 |
| `vmu.paper.officeConsultOn` | `'finalize'` | 同上 | v5r 只卡**定稿**这一步 |
| `vmu.paper.officeConsultTimeoutMs` | `0` | 同上 | 无限等（挂起），不设逃生门 |
| `vmu.paper.officeConsultOnTimeout` | `'hold'` | 同上 | 超时**挂起且仍拒**（无 default-allow 档） |
| `vmu.paper.officeConsultExemptRoles` | `[]` | 同上 | **Lead F4**：本门场景正是 office 自己定稿 ⇒ 默认不豁免任何人 |
| `vmu.math.maxParallel` | `3` | `kernel/mathjobs.js:41,249` | **Lead 裁决**：v5r 出厂语义＝"每轮最多同时唤醒 3 名成员"（`vibe-math-v5r.js:1081`，措辞 `:2073-2076`） |
| `vmu.math.jobs.maxParallel` | `1` | `kernel/mathtools.js:56,200,571-572` | **Lead 裁决**：v5r 出厂语义＝"后台编译默认串行"（`:1118-1119`）；★ 语义边界：两者**当前互不驱动**（唤醒并发 vs 后台作业并发）⇒ 要限并发**两个都设**；core 的收敛方向＝让 `mathtools` 改读前者，届时本 pack 删一行 |

**不需要 pack 声明（已与 owner 逐条确认，避免"声明了没人读"）**：
- **chat/panel 投影缝**（reader-c）：只做 `attachProjection` 接线 ＋ `store.js` 白名单，**不引入 settings 键** ⇒ pack 零改动。
- **审批队列跨重启**（reader-a）：`kernel/human.js` 的 `snapshot()/restore()` ＋ 新耐久键 `human`（非 settings）＋ 装配期投影 ⇒ **无 settings 键**。
- **C-45 忠实性缺陷强制弃权**（reader-b）：落成**内核谓词** `declareDefect`/`applyAbstention`（不忠实者的 0/1 被改写为 0.5 弃权并留耐久 marker），**强制、不可配置** ⇒ pack **不提供**关闭开关（`docs/10 §4.1` 边界 ⑤）。
- **`vmu.math.maxParallel` / `vmu.math.jobs.maxParallel`**：**故意不声明**。它们是**部署容量**旋钮（schema doc 已写明"意图相同、读者不同、要限并发请两个都设"），不是机构偏好；且两者的收敛是 task-20 A 的未决项（core 已把边界写进 schema doc）。若 Lead 要 v5r 出厂即限并发，我再按同一值成对声明。

## D. 文档 · **已落**

| 卷 | 改了什么 | 为什么 |
|---|---|---|
| `docs/10-packs.md` §4.1 | 标题改"轮 2 立，轮 3 扩"；新增**轮 3 声明行**（tier/allowLight/reopenFloor/writeThrough/projections 10 面 ＋ **C-30 五键**）；边界 ④ 改为 **C-30 已闭合**（含 F4"豁免默认空"的理由）、⑤ C-45 不可配置 | pack 声明层是交接时最先被读的一页 |
| `docs/27-pack-folder.md` §4.3（新） | 分级会议 / 投票板重开 / 耐久投影的声明与归属；**C-30 已闭合**（判定点 `kernel/paper.js:45-49,111-114`、`paper/office-consult-required` 事件、F4 豁免空）与 **C-45 不归 pack** | 与 §4.2 的轮 2 收口并列 |
| `docs/05-middleware.md` | **未改** | 本轮**零**钩子/中间件改动；`audit-hook-coverage` **4/0** 证明 55 个登记钩子 ⇄ emit 点仍双向一致 |
| `docs/06-prompt-pipeline.md` | **未改** | 本轮**零**提示词管线改动（D-13 已在轮 2 收口） |

---

## 验证（原样命令 + 退出码；单跑，非全量）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-pack-data-sections.test.mjs` | 0 | 14 passed, 0 failed |
| `node tests/vmu-paper.test.mjs` | 0 | 37 passed, 0 failed（C-30 五键所在面） |
| `node tests/vmu-entry.test.mjs` | **1** | **非我红（测试竞态，见下）**：`:811 handlers[0] is not a function`；加 C-30 默认值**之前**该套件为 141/0 |
| `node tests/vmu-kernel.test.mjs` | 0 | 175 passed, 0 failed |
| `node tests/vmu-host.test.mjs` | 0 | 103 passed, 0 failed |
| `node tests/vmu-meeting-parity.test.mjs` | 0 | 113 passed, 0 failed（tier/allowLight/reopenFloor 所在面） |
| `node tests/vmu-resume-recovery.test.mjs` | 0 | 73 passed, 0 failed（writeThrough/10 面投影） |
| `node tests/vmu-human-gate.test.mjs` | 0 | 67 passed, 0 failed |
| `node tests/vmu-chat.test.mjs` | 0 | 67 passed, 0 failed |
| `node tests/vmu-panel.test.mjs` | 0 | 39 passed, 0 failed |
| `node tests/vmu-mailbox.test.mjs` | 0 | 44 passed, 0 failed |
| `node tests/audit-hook-coverage.test.mjs` | 0 | 4 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed（`docs/27` 已点名 pack 内每个文件） |
| `node tests/audit-doc-vs-code-tables.test.mjs` | 0 | 17 passed, 0 failed |
| `node tests/audit-vmu-release.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/audit-claim-traceability.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/audit-doc-api-coverage.test.mjs` | 0 | 2 passed, 0 failed |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs` | 0 | pack defaults 的键 **undeclared=0**（**34 键**全在 `schema.js` 里）；另如实打印 v3-core 清单的 5 个 `vmu.v3.*` 包私有键未在 schema（见"标准备注"） |
| `node --input-type=module -e`（JSON/JS 同值同键核对，见报告命令） | 0 | `keys 34 sameKeys true valueDiffs []`；`math.maxParallel 3 / jobs.maxParallel 1` |
| `node tests/vmu-pack.test.mjs`（并发键声明后复跑） | 0 | 53 passed, 0 failed |
| `node tests/vmu-paper.test.mjs`（并发键声明后复跑） | 0 | 37 passed, 0 failed |

**非我红**：
- `audit-surface-index`、`audit-vmu-docs`：轮 3 新增设置键（tier/allowLight/reopenFloor/writeThrough/officeConsult×5 等）使 docs/04 设置表与 docs/03/05/18 生成块 **stale**；按 D-07/D-11 由 Lead 在全员停写后 `regen-all`/`--write` 收口（届时 hook-index 仍应显示 55 个钩子，本轮未增钩子）。
- `tests/vmu-entry.test.mjs` **进程崩溃**（exit 1）＝**测试竞态**，非实现缺陷：`:802-804` **同步**读 `agent/turn-stopping` listeners，而实现（vmu-core 的 F5 修复 `vibe-math-vmu.js:499-502`）在 `adapter.install()` resolve **之后**才 `attachReportTick()` ⇒ 读到 0 个 ⇒ `:805` 断言失败，`:811` 又**无保护地** `await handlers[0]()` ⇒ 一条失败放大成整套死掉。探针证据（`node D:\_tmp\vmu-turnstopping-probe.mjs`）：`BEFORE ready=0 / AFTER ready=1`，`adapter registered=["vibe_vmu_status","vibe_vmu_set","vibe_vmu_report"]`，`[0] typeof=function` ⇒ **F5 实现正确**。已请 vmu-verify 改成 `await declaredHandle.ready()` ＋ 保护 `handlers[0]`。
- `tests/audit-doc-vs-code-tables.test.mjs` §4：docs/03 服务表声明的数字与 `registry.register` 实数不一致（**79**）—— vmu-core 的 docs/03（收尾随 `regen-all` 一并刷新）。

## 未做 / 需 Lead 裁决

1. **C-30 已闭合**（reader 落地 ⇒ 我补了 5 个默认值，`ExemptRoles=[]` 按 F4）；无遗留。
2. **`vmu.math.maxParallel` / `vmu.math.jobs.maxParallel`**：**已按 Lead 裁决成对声明**（`3` / `1`，语义边界写进 `docs/10 §4.1` 与 defaults 注释）；core 收敛后本 pack 删一行。
3. **标准备注（非本轮引入）**：`packs/v3-core/index.js` 的 5 个包私有键（`vmu.v3.verifierCount/solverMaxRounds/planningHorizon/promoteValueThreshold/mode`）**不在 `settings/schema.js`** —— 包自身经 `setting()` 能读，但**运行期 `vibe_vmu_set` 会以"未声明键"具名拒**。这属 v3-core 的既有设计（pack 私有键），若要可运行时调参需 vmu-core 在 schema 声明；本轮我只如实登记，未改。
4. **非我红三条已由 Lead 归口**：`vmu-entry` 竞态→verify；docs/03 服务实数 79→core；生成块 stale→Lead 轮末 regen。我这边不再跟进。
