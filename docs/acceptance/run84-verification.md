# RUN 84 真机核对记录（attempt-1 / tag `run87`：V21 首次真机通过；V17 结构性不可达；V16 残 14/70）

> **这是记录，不是证据。** 证据在 7 份 session journal、`run87.*` 驱动日志、`slvp267-ws/` 的磁盘产物与独立复核（audit7）里；本页把读数、V1–V22 判定、缺陷去向与未闭合事项留档。
> 依据可信度：**【A7】** audit7 独立复核（自解 journal / 自算 PDF sha 与文本 / 直读 `state.json` 与 `paper-p1.log`）> **【R】** run-lane 第一手证据（`run87-evidence/`）> **【D】** 本页亲验（复跑 `sha256sum`/`wc -l`/pymupdf/读盘 parse）> **【O】** office 自报（**被审对象**，本轮已知有 4 处读数错）。
>
> 一句话结论：**`DRIVER EXIT=0`、TB-2766 v3 收尾链 PASS**；**V14/V20 PASS**（PDF 122 079 B / sha `2d456b60…5b67`，五字段与磁盘三方对齐）、**V15 PASS**（`U+FFFF=0`、日志 0 缺字）、**V21 PASS（首次真机）**（`reopen-closure window:2`、`voteStaleness.afterFinalization:true`、四票均晚于定稿，0/4 反对是**合理证据等级判断**）、**V22 FAIL**（r-1 正文无具名等级行、所办 PASS 引用为假 → TB-2786）、**V16 FAIL 14/70**（14 例**全部且仅**为 `reason:"resume"` 的回合首请求：块沿用上一回合 58/48 vs wire 79/69；TB-2780 捕获未生效且 `wireCaptured` 不可读 → TB-2784）、**V17 NO-EVIDENCE / RUN-DID-NOT-REACH**（final 期字符拒收被**互审一致门/ consult 门**挡在前面，结构性不可达 → TB-2785；compile 期有 3 次真实缺字拒收）。**预算 101.35 min，超 100 min 预算 1.35 min**，80.5% 墙钟花在 22 个成员回合 drive 里。V1–V12/V18/V19 本轮无独立复核（office 自报不可采信，见 §2），**不折算成 22 行汇总**（§5）。

---

## 0 本轮 attempt 记录

| attempt | 起止（北京） | tag / build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|
| **attempt-1（唯一轮次）** | 19:08:47 起（setup）→ 20:56:07（**驱动段 101.35 min**，超 100 min 预算） | `run87` / `55279f87`（`gitHead 55279f87d30eee93ead589da1b47b4a81a2e6fb3`，dirty=false） | **`DRIVER EXIT=0`**；drive 段 `durationSec 6081`；收尾三键 `inspect:"ok"` / `stamped:"ok"` / `cleanup:"done"` | `tokenTotal 68 730 086` / cap 80 M（**85.9%**，`tokenCapHit:false`）；`transcriptEvents 474`；`toolCalls 73`；jsonl **127 688 275 B / 239 833 行**；**7 个会话**；PDF **122 079 B / sha256 `2d456b605b80e776fdf335809ccdb581e23d2c6f6ad507bf625057c54a505b67`** | `run87-metadata.json`、`run87.drive.log` done 行、`run87.monitor.log`、`run87.driver.exitcode.txt`（`0`） |

> 本轮**只有 attempt-1**，不做分层矩阵。tag `run87` 只存在于驱动侧命名（仓库 `git tag --list 'run87*'` 为空，N7 观察）。与 RUN 83 的 V16 对照见 §3.2。

---

## 1 运行元数据

| 项 | 值（来源） |
|---|---|
| 仓库 HEAD / 工作树 | `55279f87d30eee93ead589da1b47b4a81a2e6fb3`、`git status --porcelain` 空（【A7】核）；metadata `build/tarballBuild/gitHead` 三处一致、`dirty:false`、tarball `pkg-55279f87/dsh-vibe-math-2.8.5.tgz` 8 529 749 B |
| release gate | `run87.gate.acceptance.json`：`ready:true / auditVerdict:PASS / auditFailures:0 / gateExitCode:0 / head:55279f87…`；pointerDir `D:\_tmp\sim\run-2026-11-13T11-01-05-206Z-6408` |
| 起跑前 preflight | `run87-preflight.json` **8/8 PASS**（memory 2.84 GB、port **19817** listeners=0/residual=0、task-file **32 795 B** sha256 `ecc590dd…`（= `task-sim84.txt`）、tree-frozen `55279f87` dirty=0、gate receipt head==HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0）【D】 |
| provider / model / dsh | `dsh-opencode-go` / `deepseek-v4.1-flash` / dsh **`0.2.2-rc.1`** |
| workspace / clone / port | `D:\_tmp\slv-phase5\slvp267-ws`、clone `slvp267`、port **19817**（已释放【D】） |
| drive 时长 / token | `durationSec 6081`（**101.35 min**，超 100 min 预算）；`tokenTotal 68 730 086` / 80 M（**85.9%**）；`transcriptEvents 474`；`toolCalls 73`；`tokenCapHit:false`、`followStreamWorked:true`、`llm-retry=0`（done 行 +【A7】） |
| jsonl | `D:\wd\vibemath开发\_oneoff\vm-slv\full-1113-190848.jsonl`：**127 688 275 B / 239 833 行**【D `wc -c`/`wc -l`；【A7】同】 |
| 会话 | **7**：5 个 vmu 会话（主席 `218c789f`、r-1 `f83d2a86`、r-2 `649c216b`、r-3 `c54b7056`、r-temp `01e90448`）+ 所办 root `session-cc56074b` + 排障/标题子会话 `session-140c02dc`（21 事件）；7 份 journal 各 1 条 `run-metadata` 帧（`55279f87`）【A7/D】 |
| 收尾（TB-2766 v3） | `postDrive:{inspect:"ok", stamped:"ok", cleanup:"done"}`、`journalStamped:true/count:7`；`run-inspect-slvp267.log` **222 292 B**、`SUMMARY: 6 session(s) in 1 file(s), 0 with RED checks`（exit 0）；watchdog **35 轮**最低 free **1.92 GB**（闸 0.8 未触）、`RUN-ENDED` 20:57:30；clone 无、port 19817 无监听【D】 |
| 产物 | `SIM-REPORT84.md` **33 920 B / sha `d35408f8…`**（run-lane 记 33 742 是读数错）、`FEEDBACK84.md` **11 051 B / `97da2346…`**、`PROGRESS84.md` **4 430 B / `a1c2502f…`**；PDF **122 079 B / `2d456b60…`**；`paper-p1.log` **758 行、`Missing character` 0 行**；`state.json` **580 282 B**（`rec-41/54` 两次 compile 期缺字拒收、`rec-76` 最终 pdf 行）【D】 |

---

## 2 office 自报的错误清单（本页把它当被审对象；全部有第一手反证）

| # | office 写法（`SIM-REPORT84.md` 摘要） | 独立复核的正确读数 | 严重度 |
|---|---|---|---|
| 1 | **V22 判 PASS**，并引「三节：rec-63（r-1，「证据等级：draft」）、rec-32（r-2 §2.4）、rec-30（r-3 §3.10）」 | **假引用**：`rec-63`（r-1 定稿正文）**通篇没有「证据等级」字样**（durable `read_library` body + 撰写调用 body + PDF 文本三处互证）；另两节确有行。所办在 20:35:53 答复 consult 时写「每节均带具名等级行且取值为 draft」——这是**放行定稿所依据的假前提**（consult 时 rec-63 已存在 7 分钟） | **P1（判定错 + 引用造假）** |
| 2 | V21 时把 **`rec-76` 的 `updatedAt` 抄成 `1794573488215`（=12:38:08Z）** | `1794573488215` 是 **`rec-75`（paper-meta）** 的 updatedAt；`rec-76` 是 **`1794573488217`**；且 `voteStaleness.finalizedAt`（12:36:57.336）来自 **paper-state `rec-13`**，报告把它与 rec-76 的时刻并列成一个判据，没指出两者差 **70.9 s**、来源不同（判定 PASS 不受影响：最晚票 12:45:07） | P2（读数错） |
| 3 | 头部「起 19:13:44 / 止 20:49:51 / ≈96 min」 | **不是 run 的读数**：起 = office 会话 `createdAt`、止 = 一次 `Get-Date` 探针；实际驱动 **19:12:57→20:56:07 = 101.35 min**（done 行 6081 s，**超 100 min 预算**）。报告自己在 R84-2 说「时长不可达」，头部却给 ≈96 min ⇒ **漏报超预算** | P2（口径错，漏报） |
| 4 | 会话数「5 个成员子会话 + 所办 root」 | **7 个 journal 会话**：+ 排障/标题子会话 `session-140c02dc`；`state.json member_sessions` 只能看到 5 成员 ⇒ 报告应注明「未含 preflight 子会话」 | P3（少算 1） |
| 附1 | V14 行引 `closureVote votesCast:4/votesAgainst:4` | 那是 **20:46 之后（window 2）** 的读数；20:36:57 定稿时 window 1 只有 2/4。V14 实质（final→render→status 链）不受影响，但该行应**标取数时刻** | P3（口径） |
| 附2 | 438 行 status 的 `liveReadings.closure`=3/4（12:43:53）落后于同回执 `closureVote` 4/4（12:45:07） | 所办自己在 F84-1 承认并报了；但 V14 行又拿 4/4 当「定稿时票数」，两处对票数时刻处理不一致 | P3（口径） |

> **第 1 条不是产品缺陷，是报告纪律缺陷**（TB-2778 同族：引用必须逐字可查；V22 的假 PASS 就是「把产品 `evidenceGrades` 的诚实读数当成正文行的证据」）。本页记在「office 误判」，**不记入 §8 产品缺陷表**。
> 同报告**准确**项（不冤枉）：V14/V15/V20 读数与判定；V17 = NE 且贴了 compile 期 rec-41/rec-54 真拒收、不伪造 final 期拒收；V21 的四票时刻/`window:2`/`archivedVotes:2`/`afterFinalization:true`；F84-1（board `liveReadings.closure` stale vs 权威 `closureVote`）、F84-9（`voteStaleness.means` 措辞）、F84-10（票回执 `closureVote.window:"session"`）均属实。
> **另**：run-lane 读 SIM-REPORT84 大小 33 742 B 是 run-lane 读数错（实际 **33 920 B**，sha `d35408f8…` 一致）。

---

## 3 V1–V22 判定表

### 3.1 判定矩阵（本轮只有 attempt-1；未复核 ≠ PASS/NE）

| 验点 | 本轮判定 | 依据/说明 |
|---|---|---|
| V1 归因同源 | 未独立复核 | office 自报不可采信（§2）；audit7 未逐行重算 |
| V2 状态板/蓝图（含原 V13 探针） | 未独立复核 | V13 已并入 V2（本轮任务书砍项，不单列） |
| V3 `prompt` 认 member | 未独立复核 | — |
| V4 `step` 三支 | 未独立复核 | — |
| V5 `receiptsView` | 未独立复核 | run-lane 一手：`count:1, available:25, dropped:0, readFrom:"durable-fold", inProcessRingCount:0`（未独立复算） |
| V6 议程（写面） | 未独立复核 | — |
| V7 互审票 | 未独立复核 | office 报 F84 系列，未审计确认 |
| V8 未测≠没有 | 未独立复核 | 终局 status `ran-present` + `toolchainProbeSource:"last-observation"`（未逐条核） |
| V9 `vote_solved` 不单独计票 | 未独立复核 | — |
| V10 通知块四键 | 未独立复核 | — |
| V11 board 面有界 | 未独立复核 | run-lane 另报 board 9 654 / full 86 788（full `truncated:false`，未独立复算） |
| V12 成员边界 | 未独立复核 | — |
| V13 蓝图探针 | **并入 V2**（本轮任务书砍项；编号保留不重排） | 见 §3.1 注 |
| V14 结题链与 PDF sha | **PASS** | 票 4/4 到位（window 2 为 0/4，见 V21）、`final`→`render`→`status` 三方对齐 |
| V15 PDF 无缺字 | **PASS** | pymupdf 5 页 5 321 字符、`U+FFFF=0`；日志 758 行 0 缺字 |
| V16 同源块 == 同请求 wire | **FAIL** | **54 PASS / 14 FAIL / 2 NO-BLOCK**（70 请求，§3.2） |
| V17 TB-2772 拒收分支 | **NO-EVIDENCE / RUN-DID-NOT-REACH** | final 期字符门被互审门/consult 门挡前；compile 期有真拒收 |
| V18 D-6 读面 | 未独立复核 | — |
| V19 D-7/D-3 | 未独立复核 | — |
| V20 V14 完整性 | **PASS** | render 后 status 五字段与磁盘一致 |
| V21 定稿后重投 | **PASS** | `reopen-closure window:2` + `voteStaleness.afterFinalization:true`；四票均晚于定稿（§3.2） |
| V22 证据等级 | **FAIL** | r-1 正文无具名等级行、四值未落正文；所办 PASS 引用为假（§3.2） |

> **读法**：「未独立复核」既不等于 PASS 也不等于 NE，是「本轮审计未覆盖该点」，**不折算进任何计数**（§5）。V13 并入 V2 是本轮任务书的有意砍项（见 TB-2783 与 §9）。

### 3.2 独立复核到的点（【A7】§1–§7 +【D】亲验）

**V14 / V20 = PASS**

- `final`（chair seq 362）：`ok:true`、`final.finalized:true`、`final.complete:true`、`archiveArtifacts 4/4`、`pdf:{ok:true, produced:true, engine:"xelatex", pdfBytes:122079, pdfSha256:"2d456b60…", recordId:"rec-76", glyphLossDetected:false, missingCharacterCount:0, glyphsUnrepaired:[], logRead:true}`、`math:{glyphsRepaired:1, inlineMathSpans:210}`。
- `render`（seq 367）：`renderOk:true`、`recordIds:{md:"rec-73",tex:"rec-74",meta:"rec-75"}`、`diskFiles:[]`、`archiveArtifacts.complete:true`。
- **render 之后**的 `status`（seq 372，30 657 chars 无 elision）：`finalPdfRecordId:"rec-76"`、`finalPdfBytes:122079`、`finalPdfSha256 = diskPdfSha256:"2d456b60…"`、`pdfSha256MatchesDisk:true`、`compiledAfterFinal:false`、`archiveArtifacts 4/4`、`diskFileFromRecord:"rec-76"`。
- 磁盘【D】：`stat` **122 079 B**、`sha256sum` **`2d456b605b80e776fdf335809ccdb581e23d2c6f6ad507bf625057c54a505b67`**；`state.json rec-76.body` 同值。⇒ V14/V20 PASS。

**V15 = PASS**【D 亲验】

- pymupdf 1.28.2：**5 页、5 321 字符、`U+FFFF=0`、`U+FFFD=0`、`U+FFFE=0`**；`paper-p1.log` **758 行、`Missing character` 0 行**；PDF 文本含「互质」27 次、「证据等级」8 次（正文完整，§4「verified 轨为空」明写）。⇒ PASS。

**V17 = NO-EVIDENCE / RUN-DID-NOT-REACH（final 期）；compile 期有真拒收**

chair 全部 `final` 4 条（原文核过）：

| # | seq | 本地时刻 | 参数 | 回执 |
|---|---|---|---|---|
| 1 | 211 | 20:17:57.946 | `final{decision:"deliverable"}` | `ok:false, code:"VMU_INVALID_ARGUMENT", where:"final"`；message「互审必须由两位不同的、非该作者的成员完成：3 位参与者里只有 2 位审了别人的部分（r-1、r-2）…不能算全体一致」；**无任何 glyph 字段** |
| 2 | 243 | 20:24:45.488 | `final{decision:"revise"}` | `ok:true, finalized:false, glyphLossDetected:false, missingCharacterCount:null, glyphsUnrepaired:[]`；`rolledBack`/`reviseAvailable` 分支生效 |
| 3 | 326 | 20:34:58.831 | `final{decision:"deliverable"}` | `ok:false, code:"VMU_OFFICE_CONSULT_REQUIRED"`（consult-0001-860a 未答） |
| 4 | 361 | 20:36:53.281 | `final{decision:"deliverable"}` | `ok:true, finalized:true, complete:true`（consult 已由 office 20:35:53 答 `cleared:true`） |

- **四条 final 回执 grep `VMU_PAPER_GLYPH_UNCOVERED` = 0**；office journal 里该串 90 次全部在提示词/工具说明/成员 reply/投票 note 里，不在任何 final 回执。
- **`⨀` 是被 revise 后「改写/删句」掉的**：20:03:14 `rec-37`（r-1 第 2 轮 part 含 ⨀）→ compile `rec-41`：`glyphLossDetected:true, missingCharacterCount:2, glyphsUnrepaired:[{char:"⨀",u:"U+2A00",count:2,font:"lmroman10-regular",where:"33"}], glyphLossCode:"VMU_PAPER_GLYPH_UNCOVERED"`；20:12:16 `rec-50`（第 3 轮仍含 ⨀）→ compile `rec-54`：`missingCharacterCount:1, where:"35"`；20:28:34 r-1 重写 `rec-63`（整句字符检验样本删除）→ compile `rec-67`：`missingCharacterCount:0`。
- **机制（N2）**：`final` 校验次序 = **互审一致门 →（其后）字符门**；带 ⨀ 时 r-3 如实 `deliverable:false` ⇒ 更前面的门先拒 ⇒ 3 人论文上 **final 期字符拒收结构性不可达**（不是「曾触发被拒回」）。TB-2785 = 门评估一次给全 `gates[]`。
- **替换表从未覆盖 ⨀**：两次 compile 均实测 `glyphsUnrepaired:[⨀]`；任务书「三次表外字符都编译干净」的前提本轮不成立（有一阶段确实缺字）。

**V21 = PASS（首次真机）**

- `reopen-closure`（office seq 246，20:38:38.388）：`{ok:true, op:"reopen-closure", window:2, previousWindow:1, archivedVotes:2, archivedByWindow:{"1":2}, unwindowedVotes:0, sessionVotesCleared:0, foldKey:"closure_window"}`；durable `closure_window = {window:2, openedAt:1794573518381, why:"paper-p1 已 finalized…"}`（同毫秒级一致）。
- 新窗口 `closureVote`（office `status detail:"full"` 全量 spill）：`cast:false, votesCast:4, votesFor:0, votesAgainst:4, for:[], against:["r-acad","r-1","r-2","r-3"], missing:[], notEligible:[r-temp], votersAsOf:1794573907727`、`voteStaleness:{finalizedAt:"2026-11-13T12:36:57.336Z", votesCastAt:"2026-11-13T12:45:07.727Z", afterFinalization:true, finalizedAtSource:"paper track: newest finalized paper-state row updatedAt"}`。
- **时刻表（全部 +08:00）**：定稿写 paper-state `rec-13` **20:36:57.336**；定稿写 paper-pdf `rec-76` **20:38:08.217**；开 window 2 **20:38:38.381**；四票 r-acad **20:40:56.662** / r-1 **20:42:44.369** / r-2 **20:43:53.460** / r-3 **20:45:07.727** ⇒ 四票**均晚于**两个定稿时刻，`votesCastAt > finalizedAt` 成立；window1 旧票 2 张已留档不计（window2 votesCast 恰 4 而非 6）。**PASS**。
- **观察（N4/N5，P2）**：①`voteStaleness.finalizedAt` 取 **paper-state rec-13**（12:36:57.336），任务书 V21 写的是 **paper-pdf 行**（rec-76 = 12:38:08.217），差 **70.9 s**；本 run 两口径都在票前，PASS 不受影响，但规范与实现对不上。②`reopen-closure` 称旧票「stay on file as an archive」，但终态 `state.json keys.closure_votes` **只有 4 行、全部 window:2，没有任何 window:1 行**——归档只剩回执里的计数，**归档不可从任何 vmu 面读回**。
- 另：chair 20:40:07 自行尝试 `reopen-closure` → **`VMU_NOT_PERMITTED`**（符合「只有所办能开」）。

**V22 = FAIL（诚实 draft 的一半成立；「每节具名等级行」不成立，所办自报为假）**

- `paper status.evidenceGrades`（post-render seq 372）：`grades:["draft","verified-by-citation","mechanically-checked","lean-verified"]`；`parts` 三节（r-1/r-3/r-2）全 `grade:"draft"`、`gradeSource:"no-grade-source"`；`propositions` 全 `draft`。**这个判定本身诚实**（verified 轨 0 行、`requiredLines.count:0`）。
- 命题卡凭据：`r3-p1` 调用带 `p:0.99, proof_ref:"Members/r-3/Proofs/…", proof_state:"complete"`；回执 `proofState:"complete"`、`proofStateFrom:"declared by this call"`、`proofGate:{locked:true, reason:"complete-and-resolved"}`、`proofRefState:"resolved"`——**"complete" 是自报声明，不是本所验证**。
- **逐节正文核【A7 读 durable 记录/撰写原文，不是报告转抄】**：`rec-63`（r-1 定稿正文）**通篇没有「证据等级」字样**（`read_library` body 0 次、撰写 body 0 次、PDF 文本 r-1 节无等级行）；`rec-32`（r-2 §2.4）与 `rec-30`（r-3 §3.10）**有**中文等级行；三节正文里四值英文（`draft` 等）**都没有出现**（四值只出现在产品 `evidenceGrades` 面）。
- ⇒ 按任务书 V22 判 **FAIL**：r-1 节缺具名行、四值词表未落入正文；「无证据如实写 draft / Verified 为空要明说」两半成立。**所办 SIM-REPORT84 判 PASS 并引「rec-63（r-1，「证据等级：draft」）」是假引用**（§2）。根因：`evidenceGrades` 从**证据卡**算、不读 part 正文，缺行无门可发现 ⇒ **TB-2786**。

**V16 = FAIL（54 PASS / 14 FAIL / 2 NO-BLOCK，70 请求）**

- 逐会话：chair `218c789f` **29/29 PASS**、temp `01e90448` **2/2 PASS**、office/sub 2 NO-BLOCK；members：`649c216b`(r-2) 6/3、`c54b7056`(r-3) 9/6、`f83d2a86`(r-1) 8/5。
- **14 个 FAIL 全同一形状**：`wire 79/69` vs 块 `58/48`，缺**恰好 21 个** `vibe_v5_*`（assign/configure/fidelity_conclude/meeting/meeting_round/message/nudge/overview/pause/poll_close/poll_open/prioritize/report/resume/script/set/start/stop/verdict_ask/verdict_final/verified_promote）；14 例**全部且仅**是每成员回合的**第一个请求**（`request/header.reason:"resume"`）：r-2 seq 150/254/290；r-3 seq 203/259/305/353/389/437；r-1 seq 137/255/343/408/468。**首回合首请求（turn1 step1，`reason:"initial"`，seq 12）PASS**（TB-2780 的修法覆盖了 initial）。
- **机制（事件序，m649 t2s1）**：`146 turn/start → 148 step/start{turn:2,step:1} → 149 user/message（26 525 chars，新消息走 user 不进 system prompt）→ 150 request/header reason:"resume"（wire 79/69）→ 151 developer/message{headerSeq:150, source.kind:"tool-registry", 21×tool-addition} → 152 assistant/message`。**新回合首请求没有重新 assemble 系统 prompt**（该 build 只在文本变化时写 `system/message`），模型带上一回合最后一次 assemble 的块（58/48）；wire 由 fresh agent 重新解析成 79/69；宿主用紧随的 21 条 `tool-addition` 补差。块 caption 仍写「名集取自本请求的 per-turn 工具表——与 `request/header.tools` 同一来源」⇒ 这 14 个请求上是**假话**。
- **TB-2780 捕获未生效且不可观测**：全 journal + 127 MB jsonl 里 `wireCaptured` **0 次**；office 从未调过 `vibe_vmu_status`；而 `vibe_vmu_turn{op:"status",detail:"full"}` 面**不含 `toolFacePull`**（audit7 解析 85 566 B 全量回执，top keys 无此项）⇒ `NO-EVIDENCE/PRODUCT-MISSING`（不能说「0 说明没跑」）。两种可能：(a) capture provider 未注册/未命中；(b) 该请求根本没触发 assemble。都指向 **TB-2784**。
- **任务书配对规则要改（NaN 关键）**：任务书字面规则（「seq<header 且 >上一 header 的最近 `system/message`」）会得到 **54 PASS / 7 FAIL / 9 NO-BLOCK**——因为该 build 只在 system prompt 文本变化时写 `system/message`；14 例里 7 例窗口内没有新 system/message。**语义配对**（块 = 最近一次 `system/message`，跨请求常驻）才是 54/14/2。⇒ 第 85 次任务书已按此改字面规则（TB-2787 §3.2）。

**与 RUN 83 的 V16 对照（硬要求）**

- 83：**4 FAIL / 35 计分（37 请求）**；84：**14 FAIL / 70 请求**。**不是「修好」，也不是同款重复**：83 的 4 例是 `tool-addition` 时序（新回合首请求，且首请求 wire 79/69）；84 的首回合首请求已 PASS，**残 14 例全部是 `resume`（不重装配）形态**。绝对数升、分母翻倍（35→70），**形状换成新维度**（TB-2784）。引用时必须写「54/14/2，14 例全为 resume 首请求」。

**`slv-inspect` 6 会话 0 RED**

- `run-inspect-slvp267.log` **222 292 B**、`SUMMARY: 6 session(s) in 1 file(s), 0 with RED checks`、exit 0；6 vs 7 = 排障子会话 `session-140c02dc` 无 item 事件。检查器用静态 prompt 工具清单/并集粒度，**不做**同请求比对 ⇒ 0 RED 与 V16 FAIL 不矛盾。

---

## 4 独立对账（本页亲验 vs 转抄）

| 对账项 | 读数 | 方法/证据 | 来源 |
|---|---|---|---|
| PDF 字节 / sha256 | **122 079 B** / `2d456b605b80e776fdf335809ccdb581e23d2c6f6ad507bf625057c54a505b67` | `stat` + `sha256sum` | 【D】 |
| PDF 文本 | 5 页、5 321 字符、**`U+FFFF=0`、`U+FFFD=0`、`U+FFFE=0`** | pymupdf 1.28.2 我亲跑 | 【D】 |
| `paper-p1.log` | 758 行、**`Missing character` 0 行** | `grep -c` | 【D】 |
| ledger `rec-76.body` | `pdfBytes:122079`、`pdfSha256:"2d456b60…"`、`updatedAt:1794573488217` | 直读 `state.json`（580 282 B） | 【D】 |
| 驱动 done 行 | `durationSec:6081`、`tokenTotal:68 730 086`、`transcriptEvents:474`、`toolCalls:73`、`tokenCapHit:false` | `run87.drive.log` done 行 | 【D】 |
| jsonl | **127 688 275 B / 239 833 行** | `wc -c` + `wc -l` | 【D】/【A7】 |
| 会话 / journal 盖章 | **7 个会话**、7 份 journal 各 1 条 `run-metadata` 帧（`55279f87`） | 目录计数 + 解码 | 【D】/【A7】 |
| `closure_window` / `voteStaleness` | `window:2, openedAt:1794573518381`；`afterFinalization:true`（12:45:07 > 12:36:57） | `state.json` + `status detail:"full"` spill | 【D】/【A7】 |
| `closure_votes` 四行 | 全 `window:2`，`at` 1794573656662 / 1794573764369 / 1794573833460 / 1794573907727 | 直读 `state.json` | 【D】 |
| V17 四条 final | ①`VMU_INVALID_ARGUMENT` ②`revise` ok ③`VMU_OFFICE_CONSULT_REQUIRED` ④成功 | chair journal 解码 | 【A7】 |
| V22 逐节 | `rec-63` 无等级行；`rec-32`/`rec-30` 有；四值英文不在正文 | durable body + PDF | 【A7】 |
| V16 逐请求 | **54 / 14 / 2**（70 请求） | run87 alignment + audit7 自算 | 【A7】/【R】 |
| TB-2766 v3 | `postDrive` 三键 ok；inspect 222 292 B 0 RED；watchdog 35 轮最低 1.92 GB；clone 无/19817 无监听 | metadata/log/`netstat` | 【D】/【A7】 |

---

## 5 汇总口径（本轮只覆盖 audit7 复核到的子集；**不折算成 22 行汇总**）

- **audit7 独立复核到的点（7 个）**：**V14 PASS**、**V15 PASS**、**V16 FAIL（54/14/2）**、**V17 NE（`RUN-DID-NOT-REACH`）**、**V20 PASS**、**V21 PASS（首次真机）**、**V22 FAIL**。
- **V13 已并入 V2**（本轮任务书砍项；不单列、不折算）。
- **未独立复核（14 个）**：V1–V12、V18、V19——office 自报（其 V22 为假 PASS、另有 4 处读数错）**不采信**；记「未独立复核」，不参与计数。
- **V16 的读法**：54 PASS / 14 FAIL / 2 NO-BLOCK（70 请求）；14 例**全为 `resume` 首请求**。与 RUN 83 的 4/35 对照：**不是修好、不是同款**——83 是「加面时序 + 首请求」，84 的首回合首请求已 PASS，残 14 是「resume 不重装配」新维度（TB-2784）。
- **结题读数**：window 2 = **0 票赞成 / 4 票反对**（与 window 1 的 3:1 不同）；这是**合理证据等级判断**（`Verified/` 0 行、无 lean 运行、正文只有草稿级），不是读数/机制缺陷 ⇒ **不改结题门槛**。

---

## 6 预算时间线（audit7 §7；本轮 101.35 min，超 100 min 预算 1.35 min）

- 驱动 19:12:57→20:56:07（6081 s）；office 会话自身事件跨度 19:14:02→20:55:20（101.30 min）——**几乎全部时长都在 office 会话内**。
- **73 个工具调用的「调用→回执」合计 81.53 min（占 80.5%）**；其中 22 个 `vibe_vmu_turn`（派/驱动成员回合）合计 **81.13 min**；office 自身思考/装配间隙 ≈19.8 min。
- 单步最贵（全部为成员回合，office 只是等）：①19:22:56 `drive r-1,r-2,r-3, rounds:3` → **1261.3 s（21.0 min）**（首回合：入学术会+报等级+V12/V16）；②19:52:03 `drive r-2,r-3` → 491.5 s（8.2）；③19:17:00 chair 首回合 301.5 s（5.0）；④20:23:22 chair（revise+结题会）230.4 s；⑤20:41:55 `drive r-1..r-3`（window2 重投）230.2 s；⑥19:44:18 chair（开论文+V13）221.2 s；⑦20:03:31 `drive r-2,r-3` 200.9 s；⑧20:12:26 r-3 重审 194.7 s；⑨19:48:31 r-1 首写 192.7 s；⑩20:16:14 chair 第一次 final 182.6 s；⑪20:38:47 chair（reopen 后重开会+票）174.8 s。
- 阶段（墙钟）：立所/探针 8.2 min；首回合+学术会 22.0；开论文 4.1；正文+编译 24.3；互审+首 final+revise 12.6；清稿/编辑/定稿/render 13.9；reopen/m4/重投 8.9；终读+写报告 7.9。
- 压缩杠杆（只报告，不改本轮）：①最大杠杆 = 成员回合总数/单回合长度（80%）；首回合 3 人 `rounds:3` 降到 **rounds:2** 或压成每人 1 条消息，可省 5–8 min；②修 V17 的时序冲突（先互审 3/3 一致再第一次 final，或产品把字符门前移）可省 revise 往返 8–10 min；③m1 作废重开 ≈2–3 min；④V13 蓝图探针并入开论文回合 ≈2 min；⑤终读+写报告 7.9 min 与最后两波成员回合**并行**；⑥起跑前段 8.2 min 可压到 ≈4 min；⑦token 85.9% 不急，要盯的是「派回合数」。**这些已落进 TB-2787（第 85 次任务书）：首回合 rounds 3→2、V13 并入 V2、终读与报告并行、预算 120 min（驱动 7200 s 不变）。**

---

## 7 TB-2766 v3 实测：**PASS**

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run87-metadata.json`：`{inspect:"ok", stamped:"ok", cleanup:"done"}`；三时刻齐全 | PASS |
| journal 盖章 | `journalStamped:true, count:7`；7 个会话目录各 1 条 `run-metadata` 帧（`55279f87`） | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp267.log` **222 292 B**；`SUMMARY: 6 session(s) … 0 with RED checks`；exit 0 | PASS |
| 看门狗无 kill | `run87.watchdog.log`：**35 轮**最低 `free_GB=1.92`（闸 0.8 从未触）、`badHits=0`；`RUN-ENDED` 20:57:30、tokens 68 730 086 | PASS |
| clone / 端口 | `slvp267-ws`、无 clone 目录、无 19817 监听；driver `cleanup: clone_gone=True` | PASS |

---

## 8 缺陷去向表

| 来源 | 摘要 | 去向 |
|---|---|---|
| **N1 / P0** | V16 残 14 例：新回合首请求是 `resume`（不重新 assemble 系统提示），块沿用上一回合 58/48 vs wire 79/69；caption「同一来源」是假话；TB-2780 的 capture 未生效且 `wireCaptured` 在 `turn status full` 完全不可观测 | **TB-2784**（P0；写域 `host.js`/`kernel/index.js`/packs status/`tests/vmu-host.test.mjs`/docs/03） |
| **N2 / P1** | `final` 门次序让字符门结构性不可达（互审一致门先拒，`gates` 不分屏）；⨀ 只能靠 revise 后改写删除 | **TB-2785**（`gates[]` 一次给全 + 顶层 code 取最高优先级；写域 `kit/paper.js`/packs/`tests/**`/docs/03） |
| **N3 / P1** | `evidenceGrades` 从证据卡算、不读 part 正文；缺具名等级行没有任何门能发现 ⇒ V22 被假 PASS | **TB-2786**（`fromBody`/`bodyGradeLine` + `final` 具名拒 `VMU_PAPER_GRADE_LINE_MISSING`；写域 `kit/paper.js`/packs/`tests/**`/docs/03） |
| **N4 / P2** | `voteStaleness.finalizedAt` 取 paper-state 行（12:36:57.336）而任务书要 paper-pdf 行（12:38:08.217），差 70.9 s | **待归并**（TB-2782 续；本轮 PASS 不受影响；下轮 V21 判据在 TB-2787 已写「两口径都贴」） |
| **N5 / P2** | `reopen-closure` 称旧票留档，但终态 `closure_votes` 无 window:1 行——归档不可从 vmu 面读回 | **待归并**（需核查多内核 fold 并写是否丢行，或提供归档读面） |
| **N6 / P3** | `evidenceGrades.*.facts.proofState` 对 r3-p1 读 `null`，卡本身 `proofState:"complete"`（自报）——"未验证=null" 与 "未读到=null" 不可区分 | 并入 TB-2786 |
| **N7 / 观察** | 驱动侧「tag run87」在仓库里不存在（`git tag --list` 空） | 观察（补 tag 或改记录方式） |
| **office 假引用** | V22 判 PASS 并引 rec-63 的「证据等级：draft」= 假引用；consult 放行依据是假前提 | **报告纪律缺陷**（TB-2778 族）；**不记入产品缺陷表** |
| **已闭环** | TB-2766 v3 PASS；TB-2776（run83 V18 PASS）；TB-2777（run83 V19 字面 PASS）；TB-2782 的 A 层（V21 首次真机 PASS，`voteStaleness` 生效） | 关闭/部分关闭 |
| **保留** | TB-2767（V19 埋点）、TB-2769（objective 两来源） | 保留 |

---

## 9 未闭合与 `ENV-LIMIT` 清单

1. **V16 残 14/70（全 resume）**：TB-2784；下一轮 V16 判据改为「非 resume 请求块==同请求 wire；resume 首请求判 caption 诚实 + `wireStaleRisk:true` + `toolFacePull` 三字段可读」（TB-2787）。
2. **V17 结构性不可达**：TB-2785（`gates[]` 同屏）后按 TB-2787 重排（先互审覆盖满足、再故意留表外字符 ⇒ 期望同屏两个 blocker → 改写 → 二次 final 成功）。
3. **V22 假 PASS**：TB-2786（正文具名等级行 + `final` 具名拒）；第 85 次任务书 V22 改硬性。
4. **任务书 V16 配对规则缺陷**：字面规则（窗口内最近 system/message）会漏 7 个真 FAIL（54/7/9）；TB-2787 改为「块 = 最近一次 `system/message`（跨请求常驻）」，run-lane 按此导出。
5. **`voteStaleness.finalizedAt` 来源与任务书不一致**（N4，70.9 s）；**归档行不可读**（N5）。
6. **V18/V19 本轮未独立复核**：run83 曾 PASS，但 run84 未复测；不要引用旧轮结论当本轮读数。
7. **V1–V12 未独立复核**：office 自报有 4 处读数错（§2）；若下一轮要全绿，审计必须覆盖。
8. **预算 101.35 min > 100 min**：未触发 driver 7200 s 超时；TB-2787 预算改 120 min（驱动 7200 s 不变）+ 砍项。
9. **V5 `receiptsView`**：run-lane 一手 `count:1, available:25, inProcessRingCount:0`（未独立复算）；与 run83 的 office/run-lane 分歧同源，下轮直接贴回执原文。
10. **tag `run87` 不存在**（N7）；`slv-inspect` 6 vs 7 会话（排障子会话无 item 事件）。
11. **环境侧**：`bash(MSYS)` 未复测；token/transcript 为宿主账本口径（office 不可达）。

---

## 10 教训

1. **「首请求 PASS」不等于 V16 修好**：TB-2780 覆盖了 `initial`，但新回合是 `resume`、**不重装配**，块沿用旧面 —— 残 14 例是新形态。**判据要按请求的 `reason` 分类**，不能只看总数。
2. **任务书的配对规则本身会造假 NO-EVIDENCE**：字面「窗口内最近 system/message」在「只在文本变化时落盘」的 build 上漏 7 例真 FAIL；**规则必须写成「块 = 最近一次 system/message（跨请求常驻）」**，并让审计按语义配对复核。
3. **门次序会让分支「结构性不可达」**：V17 的字符门被互审门挡前，⨀ 只能靠 revise 后删除；**「规则可达」要在任务书里按门序验证**，不能只在单测里验（TB-2785）。
4. **证据等级不能只看产品投影**：`evidenceGrades` 三节全 draft 是诚实的，但 r-1 正文根本没有等级行——**投影诚实 ≠ 正文有行**；引用必须逐字可查（TB-2786 / TB-2778）。
5. **超预算要按 done 行记**：报告头部用「会话创建时间 / 一次 Get-Date」算 ≈96 min，漏掉 101.35 min 超预算；**时长只认 done 行**（TB-2778 纪律）。
6. **时间杠杆在成员回合数**：80.5% 墙钟在 22 个 drive 里，首回合 3 人 `rounds:3` 一个就 21 min；**砍回合结构与并行动作**比压 token 有效（TB-2787）。

---

## 11 证据路径总表

- **独立复核**：`D:/_tmp/audit7-lane/AUDIT7-RUN87.md`（281 行）；自解 journal `D:/_tmp/audit7-lane/`（7 份 + 解码产物）；宿主 spill `C:\Users\admin\AppData\Local\Temp\1\dsh-spill-HqF9Qb\session-bb1a8534d7fd\be740cbe8b02-vibe_vmu_turn.txt`（office `status detail:"full"` 85 566 B）。
- **run-lane 证据包**：`D:/_tmp/run-lane/run87-evidence/MANIFEST.md`、`READINGS-NOTES.md`、`run87-readings.json`、`run87-pdf-audit.json`、`run87-v16-alignment.json`、`run87-v16-capture.json`、`journals/`、`logs/`、`wire-names/`、`workspace/`。
- **驱动/收尾**：`D:/_tmp/slv-phase5/run87.drive.log`、`run87-metadata.json`、`run87-preflight.json`、`run87.gate.acceptance.json`、`run87.monitor.log`、`run87.watchdog.log`、`run87.WATCHDOG-RUN-ENDED.json`、`run87.driver.exitcode.txt`、`run-inspect-slvp267.log`（222 292 B）。
- **jsonl / journal**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-190848.jsonl`（127 688 275 B / 239 833 行）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp267-ws--/`（7 个：`218c789f` chair、`f83d2a86` r-1、`649c216b` r-2、`c54b7056` r-3、`01e90448` temp、`session-cc56074b` office、`session-140c02dc` 排障子会话）。
- **workspace**：`D:/_tmp/slv-phase5/slvp267-ws/`：`SIM-REPORT84.md`（33 920 B / `d35408f8…`）、`FEEDBACK84.md`（11 051 B / `97da2346…`）、`PROGRESS84.md`（4 430 B / `a1c2502f…`）、`Paper/paper-p1/{paper-p1.pdf 122 079 B / 2d456b60…, paper-p1.tex, paper-p1.log 758 行 0 缺字}`、`VibeMath/vmu/state.json`（580 282 B；`rec-41/54` compile 期拒收、`rec-73/74/75/76`、`closure_votes window:2`、`closure_window`）。
- **任务书**：`D:/wd/vibemath开发/taskbooks/TB-2783-run84-brief.md`（第 84 次，sha `7aeba032…`；合成件 `task-sim84.txt` sha `ecc590dd…`）；本轮修复书 **TB-2784/2785/2786**；第 85 次任务书 `TB-2787-run85-brief.md`（sha 见其自报）。
- **本页复核命令**：`stat`/`sha256sum`/`wc -c`/`wc -l`/pymupdf/`json.load`（§4 各行）。

---

## 12 结论一句话

**RUN 84 attempt-1（build `55279f87`，`DRIVER EXIT=0`，驱动段 101.35 min 超 100 min 预算）可结算为「V21 首次真机通过、V14/V15/V20 PASS、V17 结构性不可达、V16 与 V22 双 FAIL」：PDF 122 079 B / sha `2d456b60…5b67` 与 `status.pdfCompiled`/磁盘三方对齐；`reopen-closure window:2` + `voteStaleness.afterFinalization:true` 四票均晚于定稿（0/4 反对是合理证据等级判断，不是缺陷）。但 V16 残 14/70——14 例全部且仅是 `resume` 首请求：块沿用上一回合 58/48 而 wire 79/69，caption「同一来源」是假话，TB-2780 捕获未生效且 `wireCaptured` 不可读（TB-2784）；V22 因 r-1 正文无具名等级行而 FAIL、所办 PASS 引用为假（TB-2786）；V17 的 final 期字符门被互审一致门/consult 门挡前，只能靠 revise 后改写删除 ⨀（TB-2785）。预算超 1.35 min，80.5% 墙钟在成员回合 drive——第 85 次任务书按此做减法（V16 新判据/ V17 重排 / V22 硬性 / 首回合 rounds 2 / 预算 120 min）。**
