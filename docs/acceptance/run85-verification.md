# RUN 85 真机核对记录（attempt-1 / tag `run88`：论文链未收敛；V16/V22 PASS，交付 FAIL）

> **这是记录，不是证据。** 证据在 7 份 session journal、`run88.*` 驱动日志、`slvp268-ws/` 的磁盘与独立复核（audit8）里；本页把读数、V1–V22 判定、缺陷去向与未闭合事项留档。
> 依据可信度：**【A8】** audit8 独立复核（自解 journal / 自算 V16 逐请求 / 直读 `state.json` 与产品源码）> **【R】** run-lane 第一手证据（`run88-evidence/`）> **【D】** 本页亲验（复跑 `wc -l`/`sha256sum`/`json.load`）> **【O】** office 自报（**被审对象**，本轮 9 处需纠正/降级）。
>
> 一句话结论：**`DRIVER EXIT=0`、TB-2766 v3 收尾链 PASS；论文链全程未到 `awaiting-editor`、无 final 成功、无 render、无 PDF。** 两次 `final` 均在 `kit/paper.js:1784` 的**状态前置门**被 `VMU_PACK_V5R_CORE_PAPER_STATE` 具名拒（`gates[]` 在其后才构造，回执无 `gates`/`primaryGate`/`gatePriority`）。**V16 PASS**（非 resume 41/41 相等；resume 17 行三条件全满足：caption 诚实句、`wireStaleRisk:true`、两处 `toolFacePull` 三字段）；**V22 PASS（正面）**（三节正文均有 `证据等级：draft`，`evidenceGrades.fromBody` 一致），但**缺行拒收门从未运行**（`NO-EVIDENCE/RUN-DID-NOT-REACH`）；**V14/V15/V20 与 V21 全部 `NO-EVIDENCE/RUN-DID-NOT-REACH`**（交付结论按任务书 §7 = **FAIL**）；**V17 记 `RULE-UNREACHABLE`**——任务书场景在状态机上自相矛盾（`part` 在 awaiting-editor 被拒；正常 unanimity 路径 cross-review 门必 ok:true），**唯一可达路径是 round≥cap 的 forcedAfterCap 支，本轮未用**（cap 路径可补测，TB-2788）。结题 **3/4**（r-acad/r-2/r-3 赞成，**r-1 有资格但四次具名弃权**，r-temp 无票权）。预算：驱动 done 行 **115.03 min（120 min 内）**，wall clock **122.0 min**；首波 9 个成员回合 **61.1 min = 51% 墙钟**，paper start 迟到 **+74 min**。

---

## 0 本轮 attempt 记录

| attempt | 起止（北京） | tag / build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|
| **attempt-1（唯一轮次）** | 23:09:38 起（monitor）→ 01:11:38（**wall 122.0 min**；驱动段 23:16:33 起算 **115.03 min**） | `run88` / `365bbe5f`（`gitHead 365bbe5f55ba332b4dce1c2588971a01dcf1de68`，dirty=false） | **`DRIVER EXIT=0`**；`durationSec 6902`；收尾三键 `inspect:"ok"` / `stamped:"ok"` / `cleanup:"done"`；**论文链未收敛** | `tokenTotal 49 711 846` / cap 80 M（**62.1%**，`tokenCapHit:false`）；`transcriptEvents 241`、`toolCalls 34`（**root 会话口径**，见 §1/D3）；jsonl **137 671 615 B / 274 217 行**；**7 个会话**；**无 PDF**（`Paper/` 目录不存在） | `run88-metadata.json`、`run88.drive.log` done 行、`run88.monitor.log`、`run88.driver.exitcode.txt`（`0`） |

> 本轮**只有 attempt-1**。tag `run88` 是驱动侧命名（`git tag --list 'run88*'` 为空，N7 观察）。**交付结论 = FAIL**（任务书 §7：120 min 完不成论文链即记 FAIL）；但各 V 点的**证据判定**是 `NO-EVIDENCE/RUN-DID-NOT-REACH`——两句都写（audit8 §6.2⑦）。

---

## 1 运行元数据

| 项 | 值（来源） |
|---|---|
| 仓库 HEAD / 工作树 | `365bbe5f55ba332b4dce1c2588971a01dcf1de68`、`git status --porcelain` 空（【A8】核）；metadata `build/tarballBuild/gitHead` 三处一致、`dirty:false`、tarball `pkg-365bbe5f/dsh-vibe-math-2.8.5.tgz` 8 542 559 B |
| release gate | `run88.gate.acceptance.json`：`ready:true / auditVerdict:PASS / auditFailures:0 / gateExitCode:0 / head:365bbe5f…`；pointerDir `D:\_tmp\sim\run-2026-11-13T15-01-44-562Z-9260` |
| 起跑前 preflight | `run88-preflight.json` **8/8 PASS**（memory 2.70 GB、port **19819** listeners=0/residual=0、task-file **35 574 B** sha256 = `task-sim85.txt`、tree-frozen `365bbe5f` dirty=0、gate receipt head==HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0）【D】 |
| provider / model / dsh | `dsh-opencode-go` / `deepseek-v4.1-flash` / dsh **`0.2.2-rc.1`** |
| workspace / clone / port | `D:\_tmp\slv-phase5\slvp268-ws`、clone `slvp268`、port **19819**（已释放【D】） |
| 时长 / token（**两个口径**） | **驱动 done 行**：`durationSec 6902` = **115.03 min**（起算≈23:16:33，**在 120 min 预算内**）、`tokenTotal 49 711 846`（62.1%）、`transcriptEvents 241`、`toolCalls 34`、`tokenCapHit:false`、`followStreamWorked:true`、`llm-retry=0`；**wall clock**：LAUNCHED 23:09:38 → EXIT 01:11:38 = **122.0 min**。**done 行的三个计数是 root 会话口径**（audit8 §6.2⑧：root journal 242−1 事件=241、root tool/call=34；全 run ≈2 080 行 / 403 calls） |
| jsonl | `D:\wd\vibemath开发\_oneoff\vm-slv\full-1113-230939.jsonl`：**137 671 615 B / 274 217 行**（done 行在 :274217）【D `wc -c`/`wc -l`】 |
| 会话 | **7**：5 个席位（chair `ea8afd1c`、r-1 `ac7e740f`、r-2 `ffbcbc7d`、r-3 `d4728366`、r-temp `35e50e08`）+ 驱动 root `session-32df11b2` + PREFLIGHT 探针会话；7 份 journal 各 1 条 `run-metadata` 帧（`365bbe5f`）【A8/D】 |
| 收尾（TB-2766 v3） | `postDrive:{inspect:"ok", stamped:"ok", cleanup:"done"}`、`journalStamped:true/count:7`；`run-inspect-slvp268.log` **245 359 B**、`SUMMARY: 6 session(s) in 1 file(s), 0 with RED checks`（exit 0）；watchdog **39 轮**最低 free **1.99 GB**（闸 0.8 未触）、`RUN-ENDED` 01:14:31；clone 无、port 19819 无监听【D】 |
| 产物 | `SIM-REPORT85.md` **27 197 B / sha `f7cb0740…`**、`FEEDBACK85.md` **11 671 B / `7c38c6cb…`**、`PROGRESS85.md` **5 182 B / `ba498727…`**；**无 PDF**（`Paper/` 不存在、无 `*.pdf`）；`state.json` **441 654 B**、48 行记录（22 progress / 6 proposition / 4 method / **4 paper-part** / 3 feedback / **3 paper-review** / 2 subproblem / 2 blueprint / 1 state / **1 paper-state；无任何 paper-pdf/render 行**）；`closure_votes` 3 行（window 1、solved:true）【D】 |

---

## 2 office 自报的错误清单（本页把它当被审对象；audit8 §6.2 九条）

| # | office 写法（`SIM-REPORT85.md` / `FEEDBACK85.md` 摘要） | 独立复核的正确读数 | 严重度 |
|---|---|---|---|
| 1 | §一 元数据：`tokenTotal/cap`、`toolCalls`、`transcriptEvents` 三项写「不可达」，并用「起 = `vibe_v5_start` 回执时刻 / 时长 ≈115–125 min / **超 120 min 预算**」下结论 | 驱动 done 行就在磁盘（office 运行期不可见可理解，但写「无 done 行」不准确）：`durationSec 6902` = **115.03 min**（按驱动口径**在 120 min 内**）；wall LAUNCHED→EXIT = **122.0 min**。「超 120」是**猜测**且与 durationSec 冲突；「起」用了开所时刻（23:16:13）而非运行起点（23:09:38） | **P2（口径错 + 猜测）** |
| 2 | §一 会话数：「成员子会话 5 个…另有 5 席初建」 | **7 个 journal 会话**（5 席位 + 驱动 root + PREFLIGHT 探针）；「5 席初建」与会话混为一谈 | P3 |
| 3 | §一 轮次：「`turns:9`→最终 `turns:22`」并标来源 `vibe_vmu_turn{op:"status"}.turns` | 全 run 只调过 3 次 turn status（00:18:55 board、00:19:48 detail:full 被拒、00:20:02 全量），**最后读数就是 9**；22 这个数字本身对（按 journal `turn/start` 数出成员回合=22），但**来源标注是错的** | P3（来源错） |
| 4 | FEEDBACK85 F85-2：「cross-review 与 glyph-coverage 同屏 ok:false **在本部署不可达**」 | **结论过头**：正常 unanimity 路径确实不可达，但 `round≥cap` 的 `forcedAfterCap` 支（`kit/paper.js:1635-1673`）允许非一致进 awaiting-editor，届时 cross-review 可为 false ⇒ 该现象**可达**（只是任务书没写、status 没披露）。应降级为「正常路径不可达 + cap 路径可达但未文档化」 | **P2（结论过头）** |
| 5 | FEEDBACK85 F85-1：「产品根本没有 `detail:"full"`」 | 表述不准：`vibe_vmu_turn` 只接受 `closure|board`（`tools/turn.js:333-338`），但 **`vibe_vmu_status { detail:"full"|"settings" }` 存在**（`host.js:527/544/618`）；office 只试了 `vibe_vmu_turn` | P2（表述错） |
| 6 | §三 V21 格引 `voteStaleness.means:"staleness NOT JUDGED…"` | **非逐字引用**：磁盘原文是 `"staleness NOT JUDGEABLE: votes dated (2026-11-13T16:36:32.394Z) but no finalized paper on file (not \"fresh\")"`；三个值对、means 被改写 ⇒ 应贴原文或标「【转述】」（§9.2 纪律） | P3（引用不逐字） |
| 7 | §二 说「论文链未 finalized/render ⇒ 按 §7 记 FAIL」，但 V14/V15/V20 格判 `NO-EVIDENCE（RUN-DID-NOT-REACH）` | **两套口径打架**：正确写法是**两句都写**——交付结论 FAIL；各 V 点证据判 `NO-EVIDENCE/RUN-DID-NOT-REACH`（§7：`RUN-DID-NOT-REACH` 只用于规则不可达） | P3（口径不一） |
| 8 | §一 引用「241 / 34」未写作用域 | 两者都是 **root 会话口径**（root journal 242−1 事件、root tool/call=34），不是全 run（全 run ≈2 080 事件行、403 calls）；引用必须写「root 会话」 | P3（作用域缺失） |
| 9 | V16 判 `NO-EVIDENCE/RUN-DID-NOT-REACH`（「块 caption 与 journal 未取」） | 按分工（§2.0 块名集由 run-lane 配对）office 不自取不算错，但**最终结论应由 run-lane/audit 用 journal 给出**：**audit8 已判 V16 PASS**（§3.2）；另 office 本可用 `vibe_vmu_turn{op:"prompt"}` 读成员 prompt 里的块（一次调用） | P3（可做未做） |

> **准确项（不冤枉）**：两次 final 均 `VMU_PACK_V5R_CORE_PAPER_STATE`（now: writing / reviewing）且无 `gates[]`；V1 的 `records`/`memberWorkShare` 逐值、V10 的 9 行 `notices`、V11 的 board 9 083 / full 52 520、V16 ③ 的两处 `toolFacePull` 数值、V22 的 `bodyGradeLine` 三节 `line/at/fromBody/gradeSource`、F85-3 的「约 10 min 墙钟损失」（实为 9.4 min）、F85-5 的 `wallMs 3 734 553` 与默认 `hardLimitMs 1 800 000`——audit8 逐值复核相符。

---

## 3 V1–V22 判定表

### 3.1 判定矩阵（本轮 audit8 覆盖 7 个点；其余不据自报判 PASS）

| 验点 | 本轮判定 | 依据/说明 |
|---|---|---|
| V1 归因同源 | 未独立判定 | office 读数经 audit8 抽样逐值复核**相符**，但本轮不据此判 PASS |
| V2–V13 | 未独立复核 | 本轮任务书含（V13 已并入 V2）；audit8 未逐点核 |
| V14 结题链与 PDF sha | **NO-EVIDENCE / RUN-DID-NOT-REACH**（交付 = FAIL） | 无 final 成功、无 render、无 PDF、无 paper-pdf 行（§3.2） |
| V15 PDF 无缺字 | **NO-EVIDENCE / RUN-DID-NOT-REACH**（非 ENV-LIMIT） | 从未编译；默认值不能当 PASS；宿主有 xelatex ⇒ 不是环境限制 |
| V16 同源块 == 同请求 wire | **PASS** | 非 resume **41/41** 相等；resume **17 行**三条件全满足（§3.2） |
| V17 拒收分支 | **NO-EVIDENCE / RULE-UNREACHABLE** | 任务书场景在状态机自相矛盾；cap 强制路径存在但本轮未用（「可补测」） |
| V18、V19 | 未独立复核 | — |
| V20 V14 完整性 | **NO-EVIDENCE / RUN-DID-NOT-REACH** | 无 render 后的 status；终局 archive 全 false |
| V21 定稿后重投 | **NO-EVIDENCE / RUN-DID-NOT-REACH** | `reopen-closure` 全 run **0 次**；final 从未成功，前置不成立 |
| V22 证据等级 | **PASS（正面）/ 缺行门 `NO-EVIDENCE`** | 三节正文均有 `证据等级：draft`；缺行拒收分支从未运行（§3.2） |

### 3.2 独立复核到的点（【A8】§1–§5 +【D】亲验）

**两次 `final` 的 PAPER_STATE 回执（原文）**

- **FINAL #1 — 00:52:34，`ea8afd1c` seq 395(call)/396(result)**：`{"ok":false,"code":"VMU_PACK_V5R_CORE_PAPER_STATE","message":"the paper is not awaiting its editor (now: writing)","hint":"…a paper in \"writing\" needs its parts first…then advance() moves it to reviewing","memberActed":false,"actedForMember":"r-acad","callerMember":"r-acad","receiptMeta":{…"originalBytes":864}}`。
- **FINAL #2 — 00:56:50，seq 467(call)/468(result)**：`{"ok":false,"code":"VMU_PACK_V5R_CORE_PAPER_STATE","message":"the paper is not awaiting its editor (now: reviewing)","hint":"…a paper in \"reviewing\" needs every part reviewed by a member who is NOT its author…advance() only moves the flow, it does not review for you","memberActed":false,…"originalBytes":933}}`。
- 两次都**没有** `gates[]`/`primaryGate`/`gatePriority`/`stage`/`detail`；两次 `message` 的 `now:` **不同**（writing / reviewing）。`VMU_PAPER_GLYPH_UNCOVERED` 在 final 回执中 **0 次**。
- 产生点：`kit/paper.js:1784` 的状态前置门（`recordFinal` 开头）；`gates[]` 在其后 `1838` 才构造 ⇒ **状态门与 gates 是先后关系**，不到 `awaiting-editor` 永远看不到 gates。

**V17 = NO-EVIDENCE / RULE-UNREACHABLE（结构性）**

1. `part` 只在 `writing` 接受（`kit/paper.js:929`）⇒ 任务书「advance 到 awaiting-editor 后 r-1 用 part 重写」**无法按序执行**。
2. 正常 unanimity 路径下，advance 到 awaiting-editor 的前提是 `requireCrossReview` 通过（`kit/paper.js:1596/1267`）⇒ final 时 cross-review 门**必然** ok:true ⇒「cross-review 与 glyph-coverage 同屏 ok:false」不可能由正常路径产生。
3. **唯一可达路径**：`round ≥ roundsCap()`（默认 3，`kit/paper.js:128/169`）时 `advance(reviewing)` **不要求 unanimity**，直接 `forcedAfterCap` 进 awaiting-editor（`1635/1663`）⇒ 此时 final 的 cross-review 可 false、glyph 门也可 false。**本轮未用**（终局 writing/round3，只差 2 次 advance）。
4. 另一口径漏洞：`vmu.paper.officeConsult="required"`（advance 回执 `officeConsultPending:true`）⇒ 第一次到 gates 的 final 至少含 **3 项**失败（cross-review/glyph/office-consult），任务书写「两个 blocker」也不对。
⇒ 记 **`RULE-UNREACHABLE`**（按本轮任务书不可执行），但**cap 路径可补测**（TB-2789 的 V17 新口径按「先互审一致 → 断言 glyph 门」设计，避开原矛盾；TB-2788 负责 status 披露 cap）。

**V14 / V15 / V20 = NO-EVIDENCE / RUN-DID-NOT-REACH**

- V14：结题票 **3/4**（`votesCast:3, votesFor:3, votesAgainst:0, votesTotal:4, for:["r-acad","r-2","r-3"], missing:["r-1"], notEligible:[r-temp]`）；无 `render`（32 次 `vibe_v5_paper` 调用 action 分布：start 1 / part 10 / advance 4 / review 3 / final 2 / status 12；**无 compile/render/consult**）；无 PDF（`Paper/` 目录不存在）；`state.json` 48 行记录**无任何 paper-pdf**。
- V15：终局 `paper status`（root seq 212）：`glyphLossDetected:false, missingCharacterCount:null, glyphsUnrepaired:[], glyphLossCode:null, logPath:null, logRead:false`、`pdfCompiled:{produced:false, blockedBy:"not-finalized", …}` —— **从未编译的默认值，不能当 PASS**；宿主 `D:\texlive\2025\bin\windows\xelatex.exe` 在 PATH（`which xelatex` 命中）⇒ 不是 `ENV-LIMIT`。
- V20：无 render 后的 status；终局 `archiveArtifacts:{present:{md:false,tex:false,pdf:false,meta:false}, missing:[md,tex,pdf,meta], complete:false}`、`pdfCompiled{recordId:null,…diskPdfSha256:null,pdfSha256MatchesDisk:null}`。

**V22 = PASS（正面）；缺行拒收分支 = NO-EVIDENCE / RUN-DID-NOT-REACH**

- 正文行原文（磁盘 `state.json` records，逐节）：r-3/`rec-26` `证据等级：draft`（`at:35`）、r-1/`rec-28` `at:29`、r-2/`rec-43`（round 3）`at:43`。
- `paper status.evidenceGrades.parts[]`（root seq 212）：三节均 `bodyGradeLine:{grade:"draft",line:"证据等级：draft",at:…}`、`fromBody:"draft"`、`fromCards:{grade:"draft",source:"no-grade-source",cardId:…,evidenceCount:…}`、`grade:"draft"`、`gradeSource:"body-line"`；`bodyLineFormat:"one line in each part body: 证据等级：draft（or …）"`。⇒ 正文与投影一致、三节齐全 ⇒ **PASS**。
- **但**「缺行 ⇒ `VMU_PAPER_GRADE_LINE_MISSING`」门**从未运行**（全 run `"gates"` 0 次、两次 final 都在状态门前）⇒ 该分支 `NO-EVIDENCE/RUN-DID-NOT-REACH`。

**V16 = PASS（三条件全满足）**

- 方法与口径：块 = **同请求之前最近一次 `system/message`**（块跨请求常驻）；每次请求前 journal 都有 `system/message`，未出现「resume 无新块」的继承情形。seat 会话 5 个共 **58 个请求**；root 2 个会话各 1 个 `initial`（wire=95、无块）不计。
- **非 resume 41 个：41/41 块名集 == 同请求 wire 名集、且 41/41 计数相等**（initial 5 / change 15 / series 21）。
- **resume 17 行**（`ac7e740f` 4、`d4728366` 3、`ea8afd1c` 6、`ffbcbc7d` 4）**三条件全满足**：
  1. **caption 诚实（17/17）**：块尾逐字为「（名集取自本段装配时的 per-turn 工具表；本块可能被后续 resume 请求沿用而那个请求未重新装配提示词——此时本请求的 wire 可能更宽，以 request/header.tools 与紧随的 tool-registry tool-addition 为准；角色段里的静态清单只作职责说明）」——**含**「可能沿用 / wire 可能更宽 / 见 tool-addition」，**无**「同一来源」绝对句（产生点 `host.js:2700`，TB-2784 修复文案）。
  2. **`wireStaleRisk:true`**：唯一一次 full 对象读数（root seq 135，00:20:02）`status.toolFacePull.wireStaleRisk = true`（布尔、在 `toolFacePull` 内；同对象 `wireCaptureState:"registered:root"`、`blockAssembledAtMs:1794586711526`、`blockAssembledForAgent:"d4728366…"`、`blockAssembledForMember:"r-3"`）。
  3. **两处 `toolFacePull` 三字段**：①`vibe_vmu_status{detail:"summary"}`（root seq 130）恰 7 键：`registered:true, seen:195, matched:153, applied:153, wireCaptured:174, lastWireCapturedCount:95, lastWireCapturedSource:"agent.ctx.tools.schemas(scope,toolSet)"`；②`vibe_vmu_turn{op:"status"}`（seq 135）：`wireCaptured:175`、`lastWireCapturedCount:95`、source 同值。**`wireCaptured` 是累计抓取次数（21→174→175），`lastWireCapturedCount` 才是名集计数**；两处采样（79 对应成员请求 79、95 对应 root 请求 95）与各自 `header.tools` 数目逐一相符。
- **纠正**：run-lane `READINGS-NOTES` 初判「resume caption 未见诚实说明」不成立——诚实说明在块**尾部 caption**，初判只看了名集行。
- 另：`vibe_vmu_turn{op:"status",detail:"full"}` 被**具名拒**（`VMU_INVALID_ARGUMENT: unknown status detail: full; known detail values: closure | board (omit detail for the full status)`）；全量对象应用 `op:"status"`（省略 detail）或 `vibe_vmu_status{detail:"full"}`（audit8 §6.2⑤）。

---

## 4 独立对账（本页亲验 vs 转抄）

| 对账项 | 读数 | 方法/证据 | 来源 |
|---|---|---|---|
| 是否有 PDF | **无**（`Paper/` 不存在、`find *.pdf` 空） | `ls`/`find` | 【D】 |
| `state.json` 记录 | 48 行：22 progress / 6 proposition / 4 method / **4 paper-part** / 3 feedback / **3 paper-review** / 2 subproblem / 2 blueprint / 1 state / **1 paper-state**；无 paper-pdf | `json.load` 计数 | 【D】 |
| 驱动 done 行 | `durationSec:6902`、`tokenTotal:49 711 846`、`transcriptEvents:241`、`toolCalls:34` | `run88.drive.log` done 行 | 【D】 |
| jsonl | **137 671 615 B / 274 217 行** | `wc -c`/`wc -l` | 【D】 |
| 会话 / journal 盖章 | **7 个会话**、7 份 journal 各 1 条 `run-metadata` 帧（`365bbe5f`） | 目录计数 | 【D】/【A8】 |
| 两次 final 回执 | 均 `VMU_PACK_V5R_CORE_PAPER_STATE`（writing / reviewing）、无 `gates[]` | `ea8afd1c` seq 396/468 | 【A8】 |
| 结题票 | `votesCast:3/votesFor:3/missing:["r-1"]/notEligible r-temp` | root seq 196 | 【A8】/【D】 |
| closure_votes 耐久账 | 3 行 window:1 solved:true（r-acad/r-3/r-2） | 直读 `state.json` | 【D】 |
| V16 逐请求 | 非 resume **41/41**、resume **17**（三条件全满足） | `v16-pairs.json` + journal | 【A8】 |
| V22 正文行 | 三节 `证据等级：draft`（at 35/29/43） | `state.json` records + status | 【A8】/【D】 |
| TB-2766 v3 | `postDrive` 三键 ok；inspect 245 359 B 0 RED；watchdog 39 轮最低 1.99 GB；clone 无/19819 无监听 | metadata/log/`netstat` | 【D】/【A8】 |

---

## 5 汇总口径（audit8 覆盖 7 个点；不折算 22 行）

- **PASS（2）**：**V16**（三条件全满足）、**V22 正面**（三节正文等级行 + 投影一致）。
- **NO-EVIDENCE（5）**：**V14 / V15 / V20 / V21** 均 `RUN-DID-NOT-REACH`（final/render/PDF/reopen 从未发生）；**V17** 记 **`RULE-UNREACHABLE`**（任务书场景不可执行；cap 路径可补测）。
- **交付结论 = FAIL**（任务书 §7：120 min 完不成论文链），与各 V 点的 `NO-EVIDENCE` **两句话都要写**（office 在此处口径打架，§2 第 7 条）。
- **未独立复核**：V1–V13、V18、V19（office 的 V1/V10/V11 读数经 audit8 抽样复核相符，但不据自报判 PASS）。
- **时间账（两口径）**：done 行 115.03 min（预算内）/ wall 122.0 min；**首波 9 个成员回合 61.1 min = 51% 墙钟**；paper start 迟到 **+74.0 min**（主席该回合结束 +76.1 min）；两次 final +102.9 / +107.2 min；退出 +122.0 min。
- **结题**：**3/4**，不是 4/4；r-1 **有资格**（`notEligible` 只有 r-temp），**主动缓投**、四次具名说明（时序异议：怕票满让引擎提前停止）；office 与 r-1 对延后投票有共识；因 final 未成功，V21 窗口未开，票永远停在 3/4。

---

## 6 时间分布（audit8 §4；这是本轮最重要的「为什么没走完」）

| 阶段 | 起—讫 | 分钟 | 说明 |
|---|---|---|---|
| 启动/接内核 → root 会话建立 | 23:09:38–23:15:44 | 6.1 | DSH 起服务 |
| 立所 + hire + F80 探针 | 23:15:44–23:16:53 | 1.15 | root turn 1 前 11 步 |
| **首回合**：主席 drive rounds:2 | 23:16:53–23:24:56 | **8.1** | t-1 单独 5.2（15 step） |
| 首波：r-temp | 23:25:07–23:35:51 | 10.7 | 含读 prompt/边界自测 |
| 首波：r-1 rounds:2 | 23:36:09–23:47:50 | 11.7 | 两回合 |
| 首波：r-2 rounds:2 | 23:47:59–00:09:22 | **21.4** | 本轮最大单块 |
| 首波：r-3 rounds:2 | 00:09:31–00:18:43 | 9.2 | 两回合 |
| office 读数 + PROGRESS | 00:18:49–00:20:54 | 2.1 | V16 三读在这 70 s 内 |
| 主席 t-3（关 m1、开结题 m2、**paper start**、adopt 蓝图、投票） | 00:21:09–00:25:45 | 4.6 | `paper start` 执行 **00:23:37** |
| 三席写 part | 00:30:35–00:37:54 | 7.3 | parts 00:31:31/00:33:54/00:37:19 |
| advance + 三席互审 | 00:38:23–00:51:17 | 12.7 | 两票真拒收（r-1→r-2、r-3→r-1） |
| advance（bounce）+ final #1/#2 | 00:51:34–00:58:40 | 7.1 | final 均 STATE 拒 |
| 修订波（part 被拒 + r-2 advance + 改写） | 00:59:12–01:06:44 | 7.5 | 「谁都不能写正文」窗口 9.4 min |
| office 收数 + 三份报告 | 01:07:04–01:10:32 | 3.5 | — |
| 驱动收尾/退出 | 01:10:32–01:11:35 | 1.1 | — |

关键里程碑（相对 LAUNCHED）：**paper start +74.0 min**（00:23:37；主席回执结束 +76.1）；final #1 +102.9；final #2 +107.2；最后一次 advance +116.0；退出 +122.0。

**定因（【A8】§1.4）**：席位/编排主因——论文链**从未到 awaiting-editor**；互审第 1 轮两张真拒收把论文打回 writing，4 分钟后（00:56:16）又 advance 到 reviewing，而两位作者**没有先改正文**（r-1 00:59:47、r-2 01:04:07 才尝试 `part`，均被状态门拒）⇒ 第 2 轮必然再打回。任务书结构次因（V17 场景不可执行）；产品披露次因（status 不披露 `roundsCap`/`atCap`/强制路径，见 §8 D2/TB-2788）。

---

## 7 TB-2766 v3 实测：**PASS**

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run88-metadata.json`：`{inspect:"ok", stamped:"ok", cleanup:"done"}` | PASS |
| journal 盖章 | `journalStamped:true, count:7`；7 个会话目录各 1 条 `run-metadata` 帧（`365bbe5f`） | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp268.log` **245 359 B**；`SUMMARY: 6 session(s) … 0 with RED checks`；exit 0 | PASS |
| 看门狗无 kill | `run88.watchdog.log`：**39 轮**最低 `free_GB=1.99`（闸 0.8 从未触）、`badHits=0`；`RUN-ENDED` 01:14:31 | PASS |
| clone / 端口 | `slvp268-ws`、无 clone 目录、无 19819 监听；`cleanup: clone_gone=True` | PASS |

---

## 8 缺陷去向表

| 来源 | 摘要 | 去向 |
|---|---|---|
| **D1 / P1（任务书）** | V17 的场景在状态机上自相矛盾：①`part` 在 awaiting-editor 被拒（`kit/paper.js:929`）；②正常 unanimity 路径下 cross-review 门必 ok:true；③`officeConsult="required"` 时第一次 final 至少 3 个 blocker（任务书写「两个」） | **TB-2789（第 86 次任务书）V17 新口径**：先互审一致到 awaiting-editor（不真拒收）→ 首次 final 前把 `⨀` 写进某一节正文（`part` 只在 writing 期写，故必须在 advance 之前就写）→ 期望 `gates[]` 只有 **glyph-coverage ok:false、其它门 ok**、顶层 code=`VMU_PAPER_GLYPH_UNCOVERED` → 改写 → 二次 final 成功 → render |
| **D2 / P1（产品披露）** | `paper status` 不披露 `roundsCap`/`atCap`/`forcedAfterCap`，「只差 2 次 advance」不可见；`advance` capped 行为只有事后回执才看得到 | **TB-2788**（`paper-status-cap-disclosure`：`roundsCap`/`atCap`/`forcedAfterCapAvailable`/`nextMoves` + final 状态门拒带 `currentStage`/`nextMoves`） |
| **D3 / P2（测量口径）** | done 行 `durationSec/transcriptEvents/toolCalls` 是 **root 会话口径**且与 wall 不同（115.03 vs 122.0）；直接制造「超 120 / 不可达」两种误读 | **TB-2788 必做 3**（doc 写明口径 + metadata 补 `wallClockSec`） |
| **D4 / P3（读数）** | `evidenceGrades.parts[].recordId` 为 `null`（应给该节 part 行 id） | **TB-2788 必做 2** |
| **office 自报** | 9 处需纠正/降级（§2） | **报告纪律缺陷**（TB-2778 族）；不进产品缺陷表 |
| **已闭环** | TB-2766 v3 PASS；TB-2784（V16 resume 三条件本次真机 PASS）；TB-2785/2786 的投影已可读（本轮未到门，但 V22 正面投影生效） | 关闭/部分关闭 |
| **保留** | TB-2767（V19 埋点）、TB-2769（objective 两来源） | 保留 |

---

## 9 未闭合与 `ENV-LIMIT` 清单

1. **论文链未收敛（交付 FAIL）**：无 final 成功/render/PDF；V14/V15/V20/V21 全部 `RUN-DID-NOT-REACH`。下一轮按 TB-2789 的时间盒把 `final` 放在 **+90 min 前**发起；到 +95 仍在 writing ⇒ 走 cap 路径（round≥3 时 advance 强制进 awaiting-editor）。
2. **V17 的 cap 路径未补测**：本轮只在 `RULE-UNREACHABLE` 下记 NE；`round≥cap` 的 forcedAfterCap 支存在但未用（TB-2788 披露后可在下一轮补测「非一致 + 缺字」双 blocker 场景）。
3. **V22 缺行拒收分支未运行**（`VMU_PAPER_GRADE_LINE_MISSING` 无回执）；下一轮 V22 改为「缺行 ⇒ final 具名拒」的硬性路径（TB-2789）。
4. **V16 的两处口径**：`vibe_vmu_turn{op:"status",detail:"full"}` 会被具名拒（白名单 `closure|board`）；全量对象用 `op:"status"` 省略 detail 或 `vibe_vmu_status{detail:"full"}`——任务书下一轮已按此写。
5. **结题 3/4**：r-1 有资格但主动缓投（时序异议，四次具名）；V21 窗口未开。下一轮 V21 要求在 final 成功后重开窗口、四票都晚于两个 finalizedAt。
6. **office 9 处自报问题**（§2）；`SIM-REPORT85.md` 自身 sha `f7cb0740…` 与副本一致。
7. **V1–V13/V18/V19 未独立复核**：不要引用旧轮结论当本轮读数。
8. **tag `run88` 不存在**（N7）；`slv-inspect` 6 vs 7 会话（PREFLIGHT 会话无 item 事件）。
9. **环境侧**：`bash(MSYS)` 未复测；token/transcript 为宿主账本口径（office 不可达）；内存最低 1.99 GB（闸 0.8 未触）。

---

## 10 教训

1. **「状态门」先于「gates」是设计，不是缺陷**：`final` 在 writing/reviewing 被 `VMU_PACK_V5R_CORE_PAPER_STATE` 拒时**永远看不到 `gates[]`**（`kit/paper.js:1784` 在 1838 之前）；要测 gates 必须先把论文送到 awaiting-editor（或走 cap 强制路径）。**任务书不能假设「final 一定给 gates」。**
2. **时间最大杠杆还是「首波回合」**：9 个成员回合 61.1 min（51% 墙钟），r-2 一次 `rounds:2` 就 21.4 min；**立所回合内就 `paper start`、三席 founding part 各 1 回合、不要 rounds:2** 可省 30+ min（TB-2789 的时间盒）。
3. **让互审一致而不是真拒收**：一次 bounce ≈ 2 次 advance + 3 席重审/重写 ≈ 20–25 min；「真拒收」只放在 V17 专项（而且要在 advance 之前把字符写进正文，`part` 只在 writing 期可写）。
4. **两个时长口径必须写清**：done 行 115.03 min（root 会话/驱动口径）vs wall 122.0 min；`transcriptEvents`/`toolCalls` 也是 root 口径。**报告不写作用域就会得出相反结论**（office 因此误报「超 120」）。
5. **「可达/不可达」要看源码**：F85-2 的「cap 路径不可达」结论过头——`forcedAfterCap` 支存在（`kit/paper.js:1635/1663`），只是未文档化。**判 NO-EVIDENCE 前先确认产品有没有合法出路。**
6. **引用必须逐字**：V21 的 `voteStaleness.means` 被改写（「NOT JUDGED」vs 原文「NOT JUDGEABLE」）——报告纪律缺陷（TB-2778）在本轮再次出现。

---

## 11 证据路径总表

- **独立复核**：`D:/_tmp/audit8-lane/AUDIT8-REPORT85.md`（324 行）；自解 journal `D:/_tmp/audit8-lane/journals/*.jsonl`；V16 逐请求 `D:/_tmp/audit8-lane/out/v16-pairs.json`。
- **run-lane 证据包**：`D:/_tmp/run-lane/run88-evidence/MANIFEST.md`、`READINGS-NOTES.md`、`run88-readings.json`、`run88-v16-alignment.json`、`run88-v16-capture.json`、`journals/`、`logs/`、`wire-names/`、`workspace/`。
- **驱动/收尾**：`D:/_tmp/slv-phase5/run88.drive.log`、`run88-metadata.json`、`run88-preflight.json`、`run88.gate.acceptance.json`、`run88.monitor.log`、`run88.watchdog.log`、`run88.WATCHDOG-RUN-ENDED.json`、`run88.driver.exitcode.txt`、`run-inspect-slvp268.log`（245 359 B）。
- **jsonl / journal**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-230939.jsonl`（137 671 615 B / 274 217 行）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp268-ws--/`（7 个：`ea8afd1c` chair、`ac7e740f` r-1、`ffbcbc7d` r-2、`d4728366` r-3、`35e50e08` r-temp、`session-32df11b2` root、PREFLIGHT）。
- **workspace**：`D:/_tmp/slv-phase5/slvp268-ws/`：`SIM-REPORT85.md`（27 197 B / `f7cb0740…`）、`FEEDBACK85.md`（11 671 B / `7c38c6cb…`）、`PROGRESS85.md`（5 182 B / `ba498727…`）、`VibeMath/vmu/state.json`（441 654 B、48 行记录、无 paper-pdf）、**无 `Paper/`**。
- **任务书**：`D:/wd/vibemath开发/taskbooks/TB-2787-run85-brief.md`（第 85 次，sha `0693a76a…`；合成件 `task-sim85.txt` sha `fa5591c6…`）；本轮修复书 **TB-2784/2785/2786/2788**；第 86 次任务书 `TB-2789-run86-brief.md`（sha 见其自报）。
- **本页复核命令**：`wc -c`/`wc -l`/`sha256sum`/`ls`/`find`/`json.load`（§4 各行）。

---

## 12 结论一句话

**RUN 85 attempt-1（build `365bbe5f`，`DRIVER EXIT=0`，驱动 115.03 min / wall 122.0 min）交付 FAIL：论文链从未到 `awaiting-editor`，两次 `final` 都在 `kit/paper.js:1784` 的状态前置门被 `VMU_PACK_V5R_CORE_PAPER_STATE` 拒（writing / reviewing），`gates[]` 从未构造，无 render、无 PDF、无 `reopen-closure` ⇒ V14/V15/V20/V21 均 `NO-EVIDENCE/RUN-DID-NOT-REACH`，V17 记 `RULE-UNREACHABLE`（任务书场景在状态机自相矛盾；cap 强制路径存在但本轮未用、可补测）。正面结果：**V16 PASS**（非 resume 41/41；resume 17 行 caption 诚实句 + `wireStaleRisk:true` + 两处 `toolFacePull` 三字段齐；`wireCaptured` 是累计计数、`lastWireCapturedCount` 才是名集计数）与 **V22 PASS（正面）**（三节正文 `证据等级：draft` 与 `evidenceGrades.fromBody` 一致；缺行拒收门未运行）。结题 3/4：r-1 有资格但四次具名弃权（时序异议）。根因是**首波成员回合吃 51% 墙钟 + paper start 迟到 +74 min + 一次互审 bounce**；下一轮按 TB-2789 的时间盒（7 验点、`final` 于 +90 min 前发起、立所回合内 `paper start`、三席 founding part 各 1 回合）重跑，并按 TB-2788 披露 cap 出路。**
