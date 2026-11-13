# RUN 86 真机核对记录（attempt-1 / tag `run89`：**首次 7/7 全绿 + 结题 4/4**；D3 两口径修复验证）

> **这是记录，不是证据。** 证据在 6 份 session journal、`run89.*` 驱动日志、`slvp269-ws/` 的磁盘产物与 run-lane 一手证据包（`run89-evidence/`）里；本页把读数、7 验点判定、时间盒执行与未闭合事项留档。
> 依据可信度：**【R】** run-lane 第一手证据（回执原文/逐请求对齐表/捕获读数）> **【L】** Lead 给的运行读数 > **【D】** 本页亲验（`sha256sum`/`wc -l`/pymupdf/`json.load` 读盘）> **【O】** office 自报（被审对象，本轮差异见 §2）。
> **注意**：audit9 独立复核**尚未出**；本页的 receipt 级字段以 run-lane 一手回执为准（【R】），磁盘/计数已由本页【D】复核。**首次 7/7 + 结题 4/4** 是本轮最重要的结论。
>
> **★★ 首次 7/7 全绿 + 结题 4/4**：V14/V15/V16/V17/V20/V21/V22 **全部 PASS**（V17 新口径首次真机行使成功：首次 final 仅 `glyph-coverage` 失败、四门结构可读；V21 `reopen-closure` window2 + 新窗口 4/4 赞成）；PDF **148 381 B / sha `9c0c9e27…09f76`**；**首次 final 03:22、render 03:22、收尾 03:37（+73.3 min，远早于 +90 硬点，未触发 cap 路径）**；**D3 修复验证通过**：`wallClockSec=4396.9`（73.28 min）与 done 行 `durationSec=4054`（67.57 min，root 口径）两口径并存且 `measurementScope` 原文落盘，不再互相误读。

---

## 0 本轮 attempt 记录

| attempt | 起止（北京） | tag / build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|
| **attempt-1（唯一轮次）** | 02:24:29 起（LAUNCHED）→ 03:37:50（**wall 73.35 min**；metadata `wallClockSec 4396.9` = 73.28 min） | `run89` / `3b5f754d`（`gitHead 3b5f754d40021cd9787713e01224ad88e980fc5c`，dirty=false） | **`DRIVER EXIT=0`**；done 行 `durationSec 4054`（67.57 min，**root 会话口径**）；收尾三键 `inspect:"ok"`/`stamped:"ok"`/`cleanup:"done"` | `tokenTotal 30 723 437` / cap 80 M（**38.4%**，`tokenCapHit:false`）；`transcriptEvents 352`、`toolCalls 55`（**root 口径**）；jsonl **80 737 830 B / 148 409 行**；**6 个会话**；PDF **148 381 B / sha256 `9c0c9e27364f9732e4d442c1d2aa5705151118f19dbe562b483324c958609f76`** | `run89-metadata.json`（含 `measurementScope`/`wallClockSec`）、`run89.drive.log` done 行、`run89.monitor.log`、`run89.driver.exitcode.txt`（`0`） |

> 本轮**只有 attempt-1**。tag `run89` 是驱动侧命名。**6 个 journal** = 4 个席位会话（主席 `72bf5aa1`、r-1 `c96d6d4e`、r-2 `5afb9213`、r-3 `24c37a54`）+ 驱动 root `session-1995dc19` + PREFLIGHT `session-261f23b7`；**r-temp 无独立 journal**（`members` 里 5 席 live，但 temp 未获回合/未投票，office 记 `attendDeniedSeats:temp`）——V16 的 **temp 腿本轮无样本**。

---

## 1 运行元数据

| 项 | 值（来源） |
|---|---|
| 仓库 HEAD / 工作树 | `3b5f754d40021cd9787713e01224ad88e980fc5c`、`dirty:false`（metadata；tarball `pkg-3b5f754d/dsh-vibe-math-2.8.5.tgz` 8 545 245 B） |
| release gate | `run89.gate.acceptance.json`：`ready:true / auditVerdict:PASS / auditFailures:0 / gateExitCode:0 / head:3b5f754d…`；pointerDir `D:\_tmp\sim\run-2026-11-13T18-18-40-254Z-7744` |
| 起跑前 preflight | `run89-preflight.json` **8/8 PASS**（memory 2.88 GB、port **19821** listeners=0/residual=0、task-file **19 866 B** sha = `task-sim86.txt`（`46eb089b…`）、tree-frozen `3b5f754d` dirty=0、gate head==HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0）【D】 |
| provider / model / dsh | `dsh-opencode-go` / `deepseek-v4.1-flash` / dsh **`0.2.2-rc.1`** |
| workspace / clone / port | `D:\_tmp\slv-phase5\slvp269-ws`、clone `slvp269`、port **19821**（已释放【D】） |
| **两口径（D3 修复）** | metadata **`measurementScope` 原文**：「durationSec/transcriptEvents/toolCalls = ROOT-SESSION readings (dsh-drive done line); wallClockSec = FULL wall clock (LAUNCHED -> post-drive completion) and the authoritative full-run reading」；**`wallClockSec: 4396.9`（73.28 min）**；done 行 `durationSec:4054`（67.57 min）+ `tokenTotal:30 723 437` + `transcriptEvents:352` + `toolCalls:55`。**两口径差 ≈342.9 s = setup+post-drive**，不再互相误读【R/D】 |
| jsonl | `D:\wd\vibemath开发\_oneoff\vm-slv\full-1114-022430.jsonl`：**80 737 830 B / 148 409 行**【D `wc -c`/`wc -l`】 |
| 会话 | **6 个 journal**（4 席位 + 驱动 root + PREFLIGHT）；7 份→本轮 6 份 `run-metadata` 帧（`journalStampedCount:6`，build `3b5f754d`）【D】 |
| 收尾（TB-2766 v3） | `postDrive:{inspect:"ok", stamped:"ok", cleanup:"done"}`；`run-inspect-slvp269.log` **180 881 B**、`SUMMARY: 5 session(s) in 1 file(s), 0 with RED checks`（exit 0；PREFLIGHT 无 item 事件）；watchdog **25 轮**最低 free **2.15 GB**（闸 0.8 未触）、`RUN-ENDED` 03:41:33；clone 无、19821 无监听【D】 |
| 产物 | `SIM-REPORT86.md` **16 963 B / sha `83743928…`**、`FEEDBACK86.md` **10 278 B / `f6cbc9bd…`**、`PROGRESS86.md` **8 034 B / `45e5c6f2…`**；PDF `Paper/paper-p1/paper-p1.pdf` **148 381 B / `9c0c9e27…`**；`paper-p1.log` **763 行、`Missing character` 0 行**；`state.json` **365 370 B**、55 行记录（9 paper-part / 6 paper-review / 2 paper-pdf / 1 paper-md / 1 paper-tex / 1 paper-meta / 1 paper-state 等）【D】 |

---

## 2 office 自报（`SIM-REPORT86.md`，16 963 B）与本页的差异（【O】vs 【R】/【D】）

| # | office 写法 | 本页/一手核对 | 性质 |
|---|---|---|---|
| 1 | 头部「wall clock（LAUNCHED→EXIT 近似）= 3 831 756 ms ≈ **63.9 min**」（两个内核时钟读数之差，自标「不是 done 行口径」） | 驱动侧 **`wallClockSec 4396.9` = 73.28 min**（LAUNCHED→post-drive），done 行 4054 s。office 的 63.9 是**会话内时钟差**、偏低 ≈9.4 min | 口径差异（office 自标了限制，仍应以此页两口径为准） |
| 2 | 「驱动 done 行四字段：**无回执 / NO-EVIDENCE**（done 行由 run-lane 在会话之外产出，本会话看不到）」 | **对会话可见面属实**；但运行层 done 行存在：`durationSec 4054 / tokenTotal 30 723 437 / transcriptEvents 352 / toolCalls 55`。记录分两层写（office 不可见 ≠ run 层无此读数） | 作用域差异，不是错 |
| 3 | V17「`primaryGate` 在主席归档回复/19 条 turn 回执/status 回执里都没有 ⇒ 该子键 `NO-EVIDENCE（PRODUCT-MISSING）`」 | **首次 final 的回执（seq134，run-lane 从 journal 取）有 `primaryGate:"glyph-coverage"` 与 `gatePriority`**；office 只读了主席归档回复（该回复未转录此键）⇒ 差异来自**取数面覆盖不足**，不是产品缺键 | **需修正**（子键不是 PRODUCT-MISSING） |
| 4 | 「会话数：6 个 agent id」「journal 文件数：**4**（`replyFullPath` 非空者）」 | journal 文件数 = **6**（4 席位 + root + PREFLIGHT）；office 的「4」是「回复全文路径」数，不是 journal 文件数 | 标注混用（两个数都真，但标签错） |
| 5 | V16 只判「字段面 PASS，逐请求配对交 run-lane」；未写 `wireCaptureState` | 与本页分工一致；run-lane 全量面已取到 **`wireCaptureState:"registered:root"`**、`effectiveBlock:"replaced"`、`effectiveCount:58`、`blockAssembledForMember:"r-3"` | 覆盖差异（非错误） |
| 6 | V22 判 PASS 且**诚实标注**「缺行拒收门本轮未触发 = RUN-DID-NOT-REACH，不拿正面 PASS 冒充」 | **一致**（本页同样把缺行门记为 `RUN-DID-NOT-REACH`） | 准确项 |
| 7 | V14 用主席盖章的 render/status 回执并注明「`recordIds` 只在 render 回执里」 | **一致**；`rec-47/48/49` 已由本页直读 `state.json` 复核为 paper-md/paper-tex/paper-meta | 准确项 |

> 其它准确项（不冤枉）：V15 数字、V20 五字段/`compiledAfterFinal:false`/archive 4/4、V21 两个定稿时刻与四票时刻、`reopen-closure window:2`、V17 的 consult 闸与改写链、V22 四节正文行——均与一手证据一致。office 的 `wall clock`/done 行/`primaryGate` 三处差异已在此单列；**报告纪律：done 行与 wall clock 必须分作用域写**（TB-2778/TB-2788）。

---

## 3 七验点判定表（V14/V15/V16/V17/V20/V21/V22）

| 验点 | 判定 | 一句话证据 |
|---|---|---|
| V14 结题链与 PDF sha | **PASS** | 票 **4/4**（`cast:true/confirmed:true/votesFor:4/against:0/missing:[]`）；`final` finalized + `render` `recordIds{md:"rec-47",tex:"rec-48",meta:"rec-49"}`；`status` 五字段与磁盘 sha 一致 |
| V15 PDF 无缺字 | **PASS** | pymupdf **8 页 / 6 244 字符 / `U+FFFF=0` / `U+FFFD=0`**；`paper-p1.log` **763 行、`Missing character` 0 行** |
| V16 同源块 == 同请求 wire | **PASS** | 非 `resume` **33/33** 相等；`resume` **15 行**三条件全满足（caption 诚实句、`wireStaleRisk:true`、`toolFacePull` 两处三字段；`wireCaptureState:"registered:root"`） |
| V17 拒收分支（新口径） | **PASS（首次真机）** | 首次 final `code:"VMU_PAPER_GLYPH_UNCOVERED"`、`primaryGate:"glyph-coverage"`、**仅 glyph 门 false（其余三门 true）**、`glyphsUnrepaired:[⨀ U+2A00 count:1]`、`reviseAvailable:true`；改写 → 二次 final 全 true → render |
| V20 V14 完整性 | **PASS** | render 后 status：`finalPdfRecordId:"rec-46"/148381/9c0c9e27…`、`diskPdfSha256` 同值、`pdfSha256MatchesDisk:true`、`compiledAfterFinal:false`、archive 4/4 |
| V21 定稿后重投 | **PASS** | `reopen-closure` `window:2/previousWindow:1`；新窗口 **4/4 for**（`cast:true/confirmed:true`）；`voteStaleness:{finalizedAt:"2026-11-13T19:22:02.650Z", votesCastAt:"2026-11-13T19:32:20.783Z", afterFinalization:true}`；四票均晚于 paper-state 与 paper-pdf 两个时刻 |
| V22 证据等级 | **PASS（正面）** | 四节正文首行 `证据等级：draft`（rec-38/rec-15/rec-40/rec-27，`at` 24/24/46/30）；`evidenceGrades.parts[]` `fromBody:"draft"`、`gradeSource:"body-line"`；`Verified/` 为空（`requiredLines.count:0`） |

### 3.1 明细（【R】一手回执 +【D】磁盘复核）

**V14 / V20（链与五字段）**

- 结题票（root 最后一次 `closureVote`）：`cast:true、confirmed:true、votesCast:4、votesFor:4、votesAgainst:0、votesTotal:4、for:["r-acad","r-1","r-2","r-3"]、missing:[]、notEligible:[]`（`r-temp` 未参会/未投票，`attendDeniedSeats:temp`，故 `notEligible` 为空——与「4/4 全体」不矛盾）。
- `final`（chair）：`ok:true、finalized:true、complete:true`，四门全 true（含 `glyph-coverage`）、`glyphLossDetected:false`。
- `render`：`recordIds:{md:"rec-47",tex:"rec-48",meta:"rec-49"}`、`archiveArtifacts.present{md,tex,pdf,meta}=true/missing:[]/complete:true`。
- **render 之后** `status`：`finalPdfRecordId:"rec-46"`、`finalPdfBytes:148381`、`finalPdfSha256 = diskPdfSha256:"9c0c9e27…"`、`pdfSha256MatchesDisk:true`、`compiledAfterFinal:false`、`archiveArtifacts` 4/4、`toolchainProbe:"ran-present"`（`toolchainProbeSource:"paper-ledger"`）、`stage:"finalized"`。
- 磁盘【D】：`stat` **148 381 B**、`sha256sum` **`9c0c9e27364f9732e4d442c1d2aa5705151118f19dbe562b483324c958609f76`**；`state.json rec-46.body` 同值；`rec-47/48/49` 分别为 paper-md/paper-tex/paper-meta（updatedAt 19:23:36.858/.859/.861Z）。⇒ V14/V20 PASS。

**V15（【D】亲验）**

- pymupdf 1.28.2：**pages 8、chars 6 244、`U+FFFF=0`、`U+FFFD=0`、`U+FFFE=0`**；`paper-p1.log` **763 行、`Missing character` 0 行**；`pdf-audit` 同值。⇒ PASS。

**V16（【R】逐请求对齐 + 两处 status）**

- 逐请求（配对 = header 前最近 `system/message`，块跨请求常驻；按 `reason` 分类）：4 个席位会话共 **48 个请求**（`72bf5aa1` 19、`c96d6d4e` 11、`24c37a54` 9、`5afb9213` 9），其中 **非 resume 33 个：33/33 块名集 == 同请求 wire 名集且计数相等**；**resume 15 个**（3+4+3+3 + chair 2? 逐会话 `24c37a54` 3、`5afb9213` 3、`72bf5aa1` 5、`c96d6d4e` 4 = 15）。root 2 会话各 1 个 `initial`（wire 95、无块）不计 V16。
- resume 三条件：①caption 诚实句逐字（「本块可能被后续 resume 请求沿用而那个请求未重新装配提示词——此时本请求的 wire 可能更宽，以 request/header.tools 与紧随的 tool-registry tool-addition 为准」；**无「同一来源」**）；②`wireStaleRisk:true`；③两处 status 都取到——`vibe_vmu_status{detail:"summary"}` 7 键（`registered:true、wireCaptured:204、lastWireCapturedCount:95、lastWireCapturedSource:"agent.ctx.tools.schemas(scope,toolSet)"` 等）+ `vibe_vmu_turn{op:"status"}`（**省略 detail，本轮未被拒**）完整 `toolFacePull`（**`wireCaptureState:"registered:root"`**、`wireStaleRisk:true`、`blockAssembledAtMs`、`effectiveBlock:"replaced"`、`effectiveCount:58`、`blockAssembledForMember:"r-3"`）。⇒ PASS。
- 注：`vibe_vmu_turn{op:"status",detail:"full"}` 仍会具名拒（白名单 `closure|board`）；本轮按 TB-2789 用「省略 detail」取得全量对象——**任务书取数面更正生效**。

**V17（新口径首次真机行使）**

- **首次 `final { decision:"deliverable" }`**（chair seq134，line 96525）：`ok:false`、`code:"VMU_PAPER_GLYPH_UNCOVERED"`、`primaryGate:"glyph-coverage"`、`gatePriority:["glyph-coverage","cross-review","evidence-grade-line","office-consult"]`；`gates` 四个：`cross-review ok:true`、`office-consult ok:true`、`evidence-grade-line ok:true`、**`glyph-coverage ok:false`**；`glyphsUnrepaired:[{char:"⨀",u:"U+2A00",count:1,font:"lmroman10-regular",where:"87"}]`、`missingCharacterCount:1`、`rolledBack:{from:"awaiting-editor",to:"awaiting-editor",keptEarlierFinal:false}`、`reviseAvailable:true`、`stage:"awaiting-editor"`。
- 前置链：互审一致 `advance` → `awaiting-editor`（`unanimous:true`、`covered:[rec-28,rec-30,rec-32,rec-34]`、`refusers:[]`），此时 r-1 正文 `rec-6`（fp `661cdd49…`）**已含 ⨀**（在 advance 之前写入）；office consult 已答（`requestId:"consult-0001-4fba"`、`answeredBy:"office"`、`cleared:false`）⇒ office-consult 门 ok:true。
- `final{decision:"revise"}`（seq141）→ `ok:true`、`from:"awaiting-editor"→to:"writing"`；r-1 改写 `rec-38`（fp `de9c8687…`，正文已无 U+2A00），r-3 改写 `rec-40`；重投 review → `advance` `unanimous:true`；**二次 final**（seq214）`ok:true`、四门全 true、`glyphLossDetected:false`；`render` 成功。
- ⇒ **与 TB-2789 V17 新口径逐条一致**（仅 glyph 门失败、顶层 code 为 glyph、`primaryGate`/`gatePriority` 可读），**首次真机行使**。

**V21（重投窗口）**

- `reopen-closure`（office）：`window:2、previousWindow:1、archivedVotes:0、archivedByWindow:{}、unwindowedVotes:0、sessionVotesCleared:0`；durable `closure_window={window:2, openedAt:1794597825130, why:"paper-p1 已 finalized 并 render 完成（rec-46 PDF / rec-47-49 md+tex+meta）…"}`【D】。
- 新窗口票（seq299）：`cast:true、confirmed:true、votesCast:4、votesFor:4、votesAgainst:0、for:["r-acad","r-1","r-2","r-3"]、missing:[]、notEligible:[]`；`voteStaleness:{finalizedAt:"2026-11-13T19:22:02.650Z", votesCastAt:"2026-11-13T19:32:20.783Z", afterFinalization:true, finalizedAtSource:"paper track: newest finalized paper-state row updatedAt"}`。
- **两个定稿时刻**：paper-state `19:22:02.650Z`；paper-pdf `rec-46` `updatedAt 1794597816856` = **19:23:36.856Z**。四票时刻 `19:24:45.615 / 19:28:41.281 / 19:30:41.712 / 19:32:20.783` ⇒ **四票都晚于两者**（首次 V21 真机通过）。durable `closure_votes` 4 行全 `window:2`、`solved:true`【D】。
- 观察（FEEDBACK86 F-3）：开窗后每张票的 `closureVote.window` 仍读 `"session"`、`scope:"this-session"`——窗口号只能从 office 的开窗回执取。

**V22（正面）**

- 四节正文首行（`records expand`，【D】直读 state）：`rec-38`(r-1) `"solution":"证据等级：draft\n\n## 命题…`、`rec-15`(r-2) `证据等级：draft`、`rec-40`(r-3) `证据等级：draft`、`rec-27`(r-acad) `证据等级：draft`。
- `status.evidenceGrades.parts[]` 四行：`bodyGradeLine:{grade:"draft",line:"证据等级：draft",at:24/24/46/30}`、`fromBody:"draft"`、`gradeSource:"body-line"`；`fromCards.source:"no-grade-source"`（未顶替正文）。`Verified/` 为空（`requiredLines.count:0`；报告/投票说明引用「本 run 不提供 lean 证据」）。⇒ PASS（正面）。
- **缺行拒收门**（`VMU_PAPER_GRADE_LINE_MISSING`）本轮**未触发**（四节都有行）⇒ 该分支 `NO-EVIDENCE/RUN-DID-NOT-REACH`，**不拿正面 PASS 冒充**。

---

## 4 独立对账（本页亲验 vs 转抄）

| 对账项 | 读数 | 方法/证据 | 来源 |
|---|---|---|---|
| PDF 字节 / sha256 | **148 381 B** / `9c0c9e27364f9732e4d442c1d2aa5705151118f19dbe562b483324c958609f76` | `stat` + `sha256sum` | 【D】 |
| PDF 文本 | **8 页、6 244 字符、`U+FFFF=0`、`U+FFFD=0`** | pymupdf 1.28.2 我亲跑 | 【D】 |
| `paper-p1.log` | 763 行、**`Missing character` 0 行** | `grep -c` | 【D】 |
| ledger `rec-46` | `pdfBytes:148381`、`pdfSha256:"9c0c9e27…"`、`updatedAt:1794597816856` | 直读 `state.json`（365 370 B） | 【D】 |
| `rec-47/48/49` | paper-md / paper-tex / paper-meta（render 三件） | 直读 `state.json` | 【D】 |
| 两口径 | `wallClockSec:4396.9`（73.28 min）+ `measurementScope` 原文；done 行 `durationSec:4054`（root） | metadata + done 行 | 【D】/【L】 |
| jsonl | **80 737 830 B / 148 409 行** | `wc -c`/`wc -l` | 【D】 |
| 会话 / 盖章 | **6 个 journal**、`journalStampedCount:6` | 目录计数 + metadata | 【D】 |
| 结题 4/4 | `cast:true/confirmed:true/votesCast:4/votesFor:4/notEligible:[]` | seq299 + `closure_votes` 4 行 window:2 | 【R】/【D】 |
| V17 首次 final | 四门结构 + 仅 glyph false + `primaryGate` + ⨀ U+2A00 | seq134 回执原文 | 【R】 |
| V16 逐请求 | 非 resume **33/33**、resume **15** | `v16-alignment.json` + journal | 【R】 |
| V22 四节正文 | 每节 `证据等级：draft`（at 24/24/46/30） | `records expand` + `evidenceGrades` | 【R】/【D】 |
| TB-2766 v3 | `postDrive` 三键 ok；inspect 180 881 B 0 RED（5 会话）；watchdog 25 轮最低 2.15 GB；clone 无/19821 无监听 | metadata/log/`netstat` | 【D】 |

---

## 5 汇总口径

- **7/7 PASS（首次）**：V14、V15、V16、V17、V20、V21、V22。
- **结题 4/4（首次）**：`cast:true`，四席全 for（temp 未参会/未投票，`notEligible:[]` 与「4/4 全体」不矛盾）。
- **时间盒执行**：首次 final **03:22**（+57.9 min）、render **03:22**、收尾 **03:37**（**+73.3 min**）——远早于 +90 硬点，**未触发 cap 路径**；首波成员回合大幅缩短（本轮未再出现 9 回合 61 min 的首波）。
- **D3 修复验证通过**：`wallClockSec` 与 done 行 root 口径并存，`measurementScope` 原文落盘；报告据此可同时写两个数、不再误读「超 120 / 不可达」。
- **覆盖边界**：temp 腿无样本（r-temp 无独立 journal / `attendDeniedSeats:temp`）；V22 缺行拒收门未触发（NE）；office 3 处差异（§2）；audit9 未出。

---

## 6 时间盒对照（TB-2789 §2）

| 窗口 | 计划 | 本轮实际（【R】/【L】） | 结果 |
|---|---|---|---|
| +0–20 | 立所+首发（立所回合内 `paper start`） | 02:24:29 起；立所/首发在预算内 | ✅ |
| +20–45 | 三席 founding part 各 1 回合（无 rounds:2） | 改为每席 1 回合，首波显著缩短 | ✅ |
| +45–70 | 互审 + advance 到 `awaiting-editor` | 互审一致 → awaiting-editor（`unanimous:true`） | ✅ |
| +70–90 | final/render/V20（成功 final ≤ +90） | **首次 final +57.9 min**（03:22）、render 03:22 | ✅（远早于硬点） |
| +90–105 | V21 重投 + V22 核对 | `reopen-closure window2` + 4/4；V22 四节核对 | ✅ |
| +105–115 | 结题 + 报告 | 收尾 03:37（+73.3 min）、三份报告落盘 | ✅ |
| 硬点 | `final` ≤ +90；+95 仍 writing ⇒ cap 路径 | 未触发 cap（TB-2788 的 `nextMoves` 本轮未用到） | ✅ |

---

## 7 TB-2766 v3 实测：**PASS**

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run89-metadata.json`：`{inspect:"ok", stamped:"ok", cleanup:"done"}` | PASS |
| journal 盖章 | `journalStamped:true, count:6`（6 个会话） | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp269.log` **180 881 B**；`SUMMARY: 5 session(s) … 0 with RED checks`；exit 0 | PASS |
| 看门狗无 kill | 25 轮最低 `free_GB=2.15`（闸 0.8 未触）、`badHits=0`；`RUN-ENDED` 03:41:33、tokens 30 723 437 | PASS |
| clone / 端口 | `slvp269-ws`、无 clone、无 19821 监听；`cleanup: clone_gone=True` | PASS |

---

## 8 缺陷与新观察

| 来源 | 摘要 | 去向 |
|---|---|---|
| **本轮 0 FAIL** | 7 验点全 PASS；无新的 P0/P1 产品缺陷 | — |
| **D3 修复验证** | `wallClockSec`/`measurementScope` 落盘，两口径不再误读 | **TB-2788 必做 3 已验证**（可关或留观察） |
| **FEEDBACK86 F-1** | 所办内核读到过期论文投影（同一面/target 两内核两答案） | 待归并（产品缺陷，本轮未影响 7 验点） |
| **FEEDBACK86 F-2** | 被替换的 part 行仍 `status:"live"`，列表无法区分新旧 | 待归并 |
| **FEEDBACK86 F-3** | `reopen-closure` 开的窗口在票面读不回来（`closureVote.window:"session"`） | 待归并（读数披露，LOW） |
| **FEEDBACK86 F-4** | `paper{action:"consult"}` 在无待答请求时静默新开一条请求 | 待归并 |
| **FEEDBACK86 F-5** | `advance` 没有席位栏杆，成员须替主席推状态机 | 待归并 |
| **观察** | r-temp 无独立 journal / `attendDeniedSeats:temp`（temp 腿无样本）；V22 缺行门未触发（NE）；audit9 未出 | 记录在 §5/§9 |

---

## 9 未闭合与 `ENV-LIMIT`

1. **V22 缺行拒收门未触发**（`RUN-DID-NOT-REACH`）：四节都有等级行；若要在真机验 `VMU_PAPER_GRADE_LINE_MISSING`，下一轮需构造「某节无行」样本。
2. **temp 腿无样本**：r-temp 未获回合（`attendDeniedSeats:temp`）；V16 的 temp 样本、V19 的 temp prompt 分支均未覆盖（V19 本轮已不在 7 验点内）。
3. **office 3 处差异**（§2）：wall clock 63.9 vs 73.28；done 行作用域；V17 `primaryGate` 取数面不足（不是 PRODUCT-MISSING）。
4. **audit9 未出**：本页 receipt 级字段以 run-lane 一手为准；独立复核后如有出入以 audit9 更正。
5. **FEEDBACK86 F-1…F-5 未独立复核**（office 自报，本轮未作判据）。
6. **`closureVote.window` 读面仍 `"session"`**（F-3）：窗口号只能取开窗回执。
7. **V16 的 `vibe_vmu_turn{op:"status",detail:"full"}` 仍具名拒**：全量用省略 detail 或 `vibe_vmu_status{detail:"full"}`（本轮按此执行）。
8. **环境侧**：`bash(MSYS)` 未复测；`slv-inspect` 5 会话（PREFLIGHT 无 item 事件）；内存最低 2.15 GB（闸 0.8 未触）。

---

## 10 教训

1. **时间盒 + 砍验点有效**：从 180 行/21 验点压到 144 行/7 验点，首波从 9 回合 61 min 压到「每席 1 回合」，首次 final +57.9 min、收尾 +73.3 min —— **首次 7/7 + 4/4**。规划比读数更能决定成败。
2. **`final` 要按「状态可达」设计**：V17 新口径（先互审一致 → ⨀ 在 advance 前写入 → office 先答 consult → 只让 glyph 门失败）首次真机即通过；上一轮「先 advance 再改 part」在状态机上不可执行（TB-2785/2789 的教训闭环）。
3. **两口径必须并存写**：`wallClockSec` 与 done 行 `durationSec` 各有作用域，`measurementScope` 写明后读者不再误读（TB-2788 D3 修复）。
4. **报告取数面要覆盖全**：office 因只读主席归档回复而把 `primaryGate` 判成 PRODUCT-MISSING——**「我读不到」≠「产品没有」**（TB-2778 纪律），应把「面/字段/出处」写清。
5. **窗口号要靠开窗回执**：`closureVote.window` 读面仍是 `"session"`，V21 的窗口证据只能取 `reopen-closure` 回执（F-3）。
6. **首次全绿不等于无残留**：V22 缺行门、temp 腿、F-1…F-5 仍在——记录要把「PASS 的边界」写清，而不是写成「产品全部修好」。

---

## 11 证据路径总表

- **run-lane 一手（本轮主证）**：`D:/_tmp/run-lane/run89-evidence/MANIFEST.md`（36 文件 sha256）、`READINGS-NOTES.md`、`run89-v16-alignment.json`、`run89-v16-capture.json`、`run89-pdf-audit.json`、`journals/`、`logs/`、`wire-names/`、`workspace/`。
- **驱动/收尾**：`D:/_tmp/slv-phase5/run89.drive.log`、`run89-metadata.json`（`wallClockSec`/`measurementScope`）、`run89-preflight.json`、`run89.gate.acceptance.json`、`run89.monitor.log`、`run89.watchdog.log`、`run89.WATCHDOG-RUN-ENDED.json`、`run89.driver.exitcode.txt`、`run-inspect-slvp269.log`（180 881 B）。
- **jsonl / journal**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1114-022430.jsonl`（80 737 830 B / 148 409 行）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp269-ws--/`（6 个：`72bf5aa1` chair、`c96d6d4e` r-1、`5afb9213` r-2、`24c37a54` r-3、`session-1995dc19` root、`session-261f23b7` PREFLIGHT）。
- **workspace**：`D:/_tmp/slv-phase5/slvp269-ws/`：`SIM-REPORT86.md`（16 963 B / `83743928…`）、`FEEDBACK86.md`（10 278 B / `f6cbc9bd…`）、`PROGRESS86.md`（8 034 B / `45e5c6f2…`）、`Paper/paper-p1/{paper-p1.pdf 148 381 B / 9c0c9e27…, paper-p1.tex, paper-p1.log 763 行 0 缺字}`、`VibeMath/vmu/state.json`（365 370 B；`rec-46/47/48/49`、`closure_window window:2`、`closure_votes` 4 行 window:2）。
- **任务书**：`D:/wd/vibemath开发/taskbooks/TB-2789-run86-brief.md`（第 86 次，sha `93c09c70…`；合成件 `task-sim86.txt` sha `46eb089b…`）。
- **本页复核命令**：`stat`/`sha256sum`/`wc -c`/`wc -l`/pymupdf/`json.load`（§4 各行）。

---

## 12 结论一句话

**RUN 86 attempt-1（build `3b5f754d`，`DRIVER EXIT=0`，wall 73.28 min / done 行 67.57 min 两口径）是首次 7/7 全绿 + 结题 4/4：V14 链与 PDF sha 一致（148 381 B / `9c0c9e27…`，render rec-47/48/49，post-render 五字段 + archive 4/4）、V15 无缺字（8 页 6 244 字符、`U+FFFF=0`、日志 0 缺字）、V16 PASS（非 resume 33/33；resume 15 行 caption 诚实 + `wireStaleRisk:true` + 两处 `toolFacePull`，`wireCaptureState:"registered:root"`）、V17 新口径首次真机行使（首次 final 仅 glyph 门失败、`primaryGate:"glyph-coverage"`、⨀ U+2A00、`reviseAvailable:true` → 改写 → 二次 final 全 true → render）、V20 PASS、V21 PASS（`reopen-closure window2` + 新窗口 4/4 for + `afterFinalization:true`，四票晚于 paper-state 与 paper-pdf 两个时刻）、V22 PASS（四节正文 `证据等级：draft` + `fromBody` 一致，缺行门 NE）。**D3 修复验证通过**（`wallClockSec`/`measurementScope` 并存）；时间盒使首次 final 落在 +57.9 min、收尾 +73.3 min，未触发 cap 路径。边界：temp 腿无样本、V22 缺行门未触发、office 3 处取数/口径差异（wall clock、done 行作用域、V17 `primaryGate`）、audit9 未出。**
