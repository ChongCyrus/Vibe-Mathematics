# RUN 82 真机核对记录（attempt-1 / tag `run84` · attempt-2 / tag `run85`：收尾链两次真机通过；V16 仍 FAIL）

> **这是记录，不是证据。** 证据在 7 份 session journal、`run84.*`/`run85.*` 驱动日志、`slvp264-ws/`/`slvp265-ws/` 的磁盘产物与两次独立复核（audit4 / audit5）里；本页把读数、V1–V16 判定（**按 attempt 分层，不互相回填**）、缺陷去向与未闭合事项留档。
> 依据可信度：**【A4】** audit4 独立复核 attempt-1 / **【A5】** audit5 独立复核 attempt-2（均自解 journal / 自算 PDF sha 与文本 / 直读 `state.json` 与 `paper-p1.log`）> **【R】** run-lane 第一手证据（`RUN82-V15-GLYPHS.md`/`RUN82-V16-BLOCK.md`/`run84-evidence/`）> **【D】** 本页亲验（复跑 `sha256sum`/`wc -l`/pymupdf/读盘 parse）> **【O】** office 自报（**被审对象**，两轮均已知有错）。
>
> 一句话结论：**两轮 `DRIVER EXIT=0`；TB-2766 v3 的收尾链两次真机 PASS**。**attempt-1**（`d492dc8c`）：两条 P0 半修——**V15 FAIL**（PDF 仍有 23 个 `U+FFFF`）、**V16 FAIL**（块写「1 个」而同一请求 wire 有 58–79 个）；**V1 按审计应判 FAIL**；**V14 实质 PASS 但验收点名的 5 个 status 字段 NO-EVIDENCE**。**attempt-2**（`293d1f34`）：**V14 PASS**（5 字段全部取到、磁盘/回执/status 三方对齐）、**V15 PASS（实测）**（`U+FFFF=0`、`Missing character`=0、`glyphsUnrepaired:[]`；但 TB-2772 的**拒收/回滚分支本轮未被真机行使**，只有单测证据）、**V5 PASS**（`count:10`，`count:1` 不可复现）；**V16 仍 FAIL**（TB-2773 半修：chair 20/20、窄请求 36 PASS，但每回合**第一个请求** 13/49 块 58/48 ≠ wire 79/69 ⇒ TB-2775）。约 09:00 峰值时段前落档，**未提交**（由 Lead 统一 commit）。

---

## 0 本轮 attempt 记录

| attempt | 起止（北京） | tag / build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|
| **attempt-1**（历史，判定不因 attempt-2 回填） | 05:09:28 → 06:11:35（**62.1 min** 墙钟） | `run84` / `d492dc8c`（`gitHead d492dc8c53efadca0f9e7093c160c1a2c9791ff0`，dirty=false） | **`DRIVER EXIT=0`**；drive 段 `durationSec 3381`（**56.35 min**）；收尾三键 `inspect:"exit=1"`（判据要求 5 RED）/ `stamped:"ok"` / `cleanup:"done"` | `tokenTotal 23 698 259` / cap 80 M（**29.6%**，`tokenCapHit:false`）；`transcriptEvents 288`；`toolCalls 47`；jsonl **66 160 360 B / 129 184 行**；**7 个会话**；PDF **131 793 B / sha256 `a1bd3f37…bef4a`** | `run84-metadata.json`、`run84.drive.log:90`（done 行）、`run84.monitor.log`、`run84.driver.exitcode.txt`（`0`） |
| **attempt-2**（唯一新增轮次；tag `run85`） | 07:47:57 → 08:33:47（**45.8 min** 墙钟） | `run85` / `293d1f34`（`gitHead 293d1f3448257873ded181db2a4b48b77873aa83`，dirty=false） | **`DRIVER EXIT=0`**；drive 段 `durationSec 2430`（**40.5 min**）；收尾三键 `inspect:"exit=1"`（4 RED）/ `stamped:"ok"` / `cleanup:"done"` | `tokenTotal 21 726 155` / cap 80 M（**27.2%**，`tokenCapHit:false`）；`transcriptEvents 434`；`toolCalls 76`；jsonl **53 100 208 B / 84 941 行**；**7 个会话**；PDF **113 580 B / sha256 `29a8c3ed…4f5f`** | `run85-metadata.json`、`run85.drive.log:90`（done 行）、`run85.monitor.log`（`08:33:54 RESULT exited exit=0`）、`run85.driver.exitcode.txt`（`0`） |

> 两轮之间**没有**失败的 attempt：attempt-1 是因两条 P0 未修而进入 attempt-2 的验收轮次，attempt-2 是修后复验。tag `run84`/`run85` 是 artifact 前缀，与「第 82 次真机」是两套编号。
> **分层纪律**：attempt-2 只新增它自己取到的读数与判定；**不把 attempt-2 的改善回填进 attempt-1 的 PASS/FAIL**（例如 attempt-1 的 V15 FAIL、V16 FAIL、V14 五字段 NE 原样保留）。

---

## 1 运行元数据（两 attempt 对照）

| 项 | attempt-1（`run84` / `d492dc8c`） | attempt-2（`run85` / `293d1f34`） |
|---|---|---|
| 仓库 HEAD / 工作树 | `d492dc8c`、`git status --porcelain` 空（【A4】核）；`run84-metadata.json` 的 `build/tarballBuild/gitHead` 一致、`dirty:false`、tarball 8 503 526 B | `293d1f3448257873ded181db2a4b48b77873aa83`、porcelain 空（【A5】`git rev-parse` 核）；metadata 三处 `293d1f34`、`dirty:false`、tarball `pkg-293d1f34/dsh-vibe-math-2.8.5.tgz` **8 515 837 B**【D】 |
| release gate | `RELEASE GATE READY`（`D:\_tmp\sim\run-2026-11-12T21-02-53-498Z-9792\AUDIT.md`）；`run84.gate.acceptance.json`：`ready:true / auditVerdict:PASS / gateExitCode:0 / head:d492dc8c…` | `run85.gate.acceptance.json`：`ready:true / auditVerdict:PASS / auditFailures:0 / gateExitCode:0 / head:293d1f34…`；pointerDir `D:\_tmp\sim\run-2026-11-12T23-39-43-677Z-12028`；receiptHead==HEAD（preflight#5） |
| 起跑前 preflight | `run84-preflight.json` **8/8 PASS**（memory 2.72 GB、port/residual 0、task-file 27 606 B sha `064eedf0…`、tree-frozen `d492dc8c` dirty=0、gate receipt head==HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0） | `run85-preflight.json` **8/8 PASS**（memory **2.79 GB**、port **19813** listeners=0/residual=0、task-file 27 606 B sha256 `064eedf0…e25f33`、tree-frozen `293d1f34` dirty=0、gate match=true、dsh `0.2.2-rc.1`、lanes-quiet、shell-probe exit 0）【D】 |
| provider / model / dsh | `dsh-opencode-go` / `deepseek-v4.1-flash` / dsh **`0.2.2-rc.1`** | 同（`run85-metadata.json` + `run85.drive.log` `MODEL SET`/镜像行）【D】 |
| workspace / clone / port | `D:\_tmp\slv-phase5\slvp264-ws`、clone `slvp264`、port **19811** | `D:\_tmp\slv-phase5\slvp265-ws`、clone `slvp265`、port **19813**（落盘 `19813`、clone 已清【D】） |
| drive 时长 / token | `durationSec 3381`（56.35 min）；`tokenTotal 23 698 259` / 80 M（29.6%）；`transcriptEvents 288`；`toolCalls 47`（【A4】核 journal 47 条 `tool/call`；【O】写「≈38」是错） | `durationSec 2430`（**40.5 min**）；`tokenTotal 21 726 155` / 80 M（**27.2%**）；`transcriptEvents 434`；`toolCalls 76`（【A5】root journal `tool/call`=76 与 tuned 行一致；【O】写「≈45」是错） |
| 运行时刻 | monitor `05:09:28 LAUNCHED` → `DRIVER EXIT=0 06:11:35` | metadata `startedAt 07:52:05.627` → `completedAt 08:33:47.647`；monitor `07:47:57 LAUNCHED`（墙钟含包装/起跑探针段） |
| jsonl | `full-1113-050929.jsonl`：**66 160 360 B / 129 184 行**【D `ls`+`wc -l`】 | `full-1113-074757.jsonl`：**53 100 208 B / 84 941 行**【D `ls`+`wc -l`】 |
| 会话 | **7**：5 成员（r-acad/r-1/r-2/r-3/r-temp）+ 1 所办（`session-6984a0e2…`）+ 1 起跑探针（`session-2acf870a…`）；7 份 journal 各 1 条 `run-metadata` 帧（build `d492dc8c`）【A4/D】 | **7**：5 成员（`a89af03e` r-acad / `9cc291ee` r-1 / `b38c7fa2` r-2 / `6f7aeca8` r-3 / `f438019a` r-temp）+ 所办 `session-2390d125` + 起跑探针 `session-dd412f56`；7 份 journal 各 1 条 `run-metadata` 帧（build `293d1f34`）【A5/D】 |
| 收尾（TB-2766 v3） | `run84-metadata.json` `postDrive:{inspect:"exit=1", stamped:"ok", cleanup:"done"}`、`journalStamped:true/count:7`；`run-inspect-slvp264.log` 161 269 B；watchdog `RUN-ENDED`（21 轮最低 free 2.05 GB，闸 0.8 未触）；clone 已清、port 19811 无监听【A4/D】 | `run85-metadata.json` `postDrive:{inspect:"exit=1", stamped:"ok", cleanup:"done"}`、`journalStamped:true/count:7`；`run-inspect-slvp265.log` **114 326 B**、`SUMMARY: 6 session(s) in 1 file(s), 4 with RED checks`；watchdog 16 轮最低 free **2.12 GB**（闸 0.8 未触）、`RUN-ENDED` 08:35:39；clone 无、port 19813 无监听【D】 |
| 产物 | `SIM-REPORT82.md` 8b5357… / `FEEDBACK82.md` 030d23… / `PROGRESS82.md` d84852…；PDF `Paper/paper-p1/paper-p1.pdf` 131 793 B；`paper-p1.log` 23 条 `Missing character`；副本在 `D:/_tmp/run-lane/run84-evidence/`（MANIFEST 含 sha256） | `SIM-REPORT82.md` **29 450 B / sha `cba5fa05…f2011`**、`FEEDBACK82.md` **10 853 B / `e0491126…b866`**、`PROGRESS82.md` **8 755 B / `39811fda…a58d`**；PDF **113 580 B / sha `29a8c3ed…4f5f`**；`paper-p1.log` **32 101 B、0 条 `Missing character`**；`state.json` **261 069 B**，`keys.records[37]` = `rec-38.body{pdfBytes:113580, pdfSha256:"29a8c3ed…4f5f"}`【D 亲验】 |

---

## 2 office 自报的错误清单（本页把它当被审对象；全部有第一手反证）

### 2.1 attempt-1（`slvp264-ws/` 的报告）

| # | office 写法（`SIM-REPORT82.md` / `FEEDBACK82.md`） | 独立复核的正确读数 | 证据 |
|---|---|---|---|
| 1 | **build「未测」**（写 `NO-EVIDENCE/PRODUCT-MISSING`：工作区不是 git 仓库） | **build = `d492dc8c`**：`run84-metadata.json` 与 7 份 journal 的 `run-metadata` 帧逐字一致；「所办读不到」≠「本轮无此读数」 | 【A4】【D】 |
| 2 | `toolCalls ≈ 38`（含「3 次 pwsh」） | **47**（driver done 行 `toolCalls:47`；office journal 47 条 `tool/call`，其中 5 条 pwsh） | 【A4】【D】 |
| 3 | 会话数 **「5 + 1」** | **7**（5 成员 + 所办 + **起跑探针会话**） | 【A4】【D】 |
| 4 | 同一 board 读数 `acts:6`（SIM）vs `acts:5`（FEEDBACK D7） | 同一时刻（seq164）是 **`memberActs:4 / officeRelayedActs:1 / acts:5`**；`acts:6` 是更晚的 full status（seq204，多次写入之后）——两份文件引了**不同时刻**的同一读数 | 【D】解码 office journal 核 |
| 5 | 「chair 首条 prompt **全文不含**工具块」 | **错**：chair 会话 `3d692508` `system/message` seq8 **含** `【本轮你实际能调用的工具｜chair】1 个：working_directory`；真实情况是 `op:"prompt"` 返回的 memberPrompt 不含 system-prompt 段（**读数面缺口**），不是「chair 没有该块」 | 【A4】【R】 |
| 6 | 「`glyphsUnrepaired` 数组**在可读面缺席**（只有计数）」 | **错**：`final` 回执顶层/`math`/`pdf`/`stderrFindings` 四处都有**具名 10 行数组**（合计 23）；缺席的是所办侧 drive 回执的转述 | 【A4】【R】 |
| 7 | **V1 判 `NO-EVIDENCE（RULE-UNREACHABLE：不可复现）`** | **错**：两读面都取到了且**互相矛盾**（records `count:22` = own-turn 15 / relayed 7 vs board `acts:5`）⇒ **应判 FAIL（口径缺陷）**；「不可复现」也不在任务书允许的三个 NO-EVIDENCE 原因里；报告同时又在 FEEDBACK82 D7 把它当缺陷报出 ⇒ 同轮两文件自相矛盾 | 【A4】【D】 |
| 8 | **V12 判 `NO-EVIDENCE（RULE-UNREACHABLE）`** | 偏保守：成员 r-1 自己会话的 `op:"status"` 回执里 **`memberOps:["status"]` 确实出现**（`93023c6e` seq49）⇒ V12 可判 **PASS**（由 audit4 独立核到） | 【A4】【D】 |

> 另有报告准确性小项（P3）：`run-inspect-slvp264.log` 中文是 **mojibake**（UTF-8 文本被 GBK 解码后再以 UTF-8 落盘，如「鈹€」「鍥炴墽」；`encode('gbk')→decode('utf-8')` 可恢复），不影响 RED/SUMMARY 判定（5 个成员会话各 2 条 RED）。

### 2.2 attempt-2（`slvp265-ws/` 的报告；【A5】§7）

| # | office 写法（原文摘要） | 独立复核的正确读数 | 严重度 |
|---|---|---|---|
| 1 | §1 **「build｜非 git 检出：`git rev-parse --short HEAD` 返回空；部署形态为打包应用」** | **build = `293d1f34`**：`run85-metadata.json` 的 `build/tarballBuild/gitHead` 三处逐字、`dirty:false`、tarball `pkg-293d1f34`；7 份 journal 的 `run-metadata` 帧同值。「在安装目录里 `git rev-parse` 为空」≠「本轮无 build」 | **P2（结论错）** |
| 2 | 会话数 **「1 个根会话 + 5 个子会话」** | **7**：root + **起跑探针 `session-dd412f56`** + 5 成员；`status.memberSessions` 只覆盖 5 成员 | P3（漏计探针） |
| 3 | 起/止 **`23:52:00Z / 00:36:00Z`**、时长 **≈44 分钟** | metadata `startedAt 23:52:05Z / completedAt 00:33:47Z`（≈41.7 min）；驱动 `durationSec=2430`（**40.5 min**）；root 最后事件 `00:33:26.7Z`。报告两数都对不上 | P3 |
| 4 | **`toolCalls｜≈ 45 次`** | driver done 行 `toolCalls:76`；root journal `tool/call`=76（`tool/result` 也对 76）——两口径均为 **76** | **P2（读数错）** |
| 5 | **V16 判 PASS（member 腿）** | **假 PASS**：按「同请求 wire」裁决，member 首请求块 58/48 ≠ wire 79/69（缺 21 个 `vibe_v5_*`），**13/49 请求 FAIL**（§3.3）。office 自认「不可读 `header.tools`，改以席位面 allow 集对照」（FEEDBACK82 文末）——这正是验收纪律禁止的**用替代证据升格**；应判 FAIL 或至少 `NO-EVIDENCE` | **P1（判定错，最关键）** |
| 6 | V16 temp 腿 **`NO-EVIDENCE（PRODUCT-MISSING）`** | 过保守：temp 块**在 journal 里有**——`f438019a` `system/message` seq8 = `【本轮你实际能调用的工具｜temp】39 个…`，同请求 header seq12 = 79/69 ⇒ 应判 **FAIL**，不是 NE。（「temp 回合 prompt 不留存」D-3 是真的，但不等于「块没落盘」） | P2 |
| 7 | V5 行 **`state.json（233 252 B）… closure_votes 5 处命中`** | 终态盘 `state.json` = **261 069 B**、`closure_votes` **6** 处；233 252 是运行中某刻快照，报告**未标时刻** ⇒ 不可终态复核 | P3（不可复核） |

> 同报告**准确**项（不冤枉）：`final.pdf.recordId:"rec-38"`、render `recordIds md/tex/meta = rec-35/36/37` 与读数一致；V15 `text_chars:3512` 与我 pymupdf 3508／pdftotext 3697 是工具差异，`uffff/ufffd=0` 与审计一致；`tokenTotal/transcriptEvents` 写「未测量」可接受（所办确不可达，但按 RUN 82 教训宜注明「宿主账本口径」）。**`run-inspect-slvp265.log` 中文 mojibake 仍在**（P3，attempt-1 已报、未修）。

---

## 3 V1–V16 判定表（按 attempt 分层）

> 「实测」= 回执字段=原值；【A4】audit4 /【A5】audit5 /【R】run-lane /【D】本页亲验 /【O】office 自报。`NO-EVIDENCE` 必带三分类；**没有用替代证据把 NO-EVIDENCE 升成 PASS**。

### 3.1 分层判定矩阵（一览；明细见 §3.2/§3.3）

| 验点 | attempt-1（`run84`/`d492dc8c`） | attempt-2（`run85`/`293d1f34`） |
|---|---|---|
| V1 归因同源 | **FAIL**（两读面互矛盾、缺换算键） | 未独立复核（office 判 PASS；其 V16 假 PASS 记录在案，不采信） |
| V2 状态板/蓝图进正文 | PASS（状态板/注入半）/ NE（`RUN-DID-NOT-REACH`，同值同刻半） | 未独立复核 |
| V3 `prompt` 认 `member` | PASS | 未独立复核 |
| V4 `step` 三支 | PASS | 未独立复核 |
| V5 `receiptsView` 跨内核 | PASS（`readFrom:"durable-fold"`、`inProcessRingCount:0`；当轮 `count:2`） | **PASS**（`count:10/available:15/dropped:5`；`count:1` 不可复现） |
| V6 议程（主席自拟 + 同传拒） | PASS（写面 3 项 bracket-aware；同传具名拒） | **写面 PASS**（3 项 `bracket-aware`）/ **读面 FAIL**（同场 `summary` 4 项 ⇒ D-6 → **TB-2776**） |
| V7 互审票绑正文 | PASS（带具名矛盾 D-4） | 未独立复核（旁证：D-2 `voidReviews` 非空且分组正确 ⇒ 见 §7.1） |
| V8 未测≠没有 | PASS | 未独立复核（旁证：D-7 `ran-absent` 假读数复现 ⇒ 见 §7.1） |
| V9 `vote_solved` 不单独计票 | PASS | 未独立复核（旁证：D-8 未启用、幽灵票未计 ⇒ 见 §7.1） |
| V10 通知块四键（全量） | PASS（office 自报全量；本页未独立复算） | 未独立复核 |
| V11 board 面有界 | PASS（6.05×） | 未独立复核 |
| V12 成员面动作边界 | PASS（`memberOps:["status"]`） | 未独立复核（旁证：D-9 PASS ⇒ 见 §7.1） |
| V13 蓝图草案口径 | PASS（state 半）/ NE（propose 首支 `RUN-DID-NOT-REACH`） | 未独立复核 |
| V14 结题链与 PDF sha | **PASS（实质）/ NE（5 字段 `RUN-DID-NOT-REACH`）** | **PASS（5 字段全部取到，三方对齐）** |
| V15 PDF 无缺字（TB-2768） | **FAIL**（`U+FFFF=23`；检测链 ✅ / 覆盖链 ❌） | **PASS（实测）**（`U+FFFF=0`、`Missing character`=0、`glyphsUnrepaired:[]`）；**TB-2772 拒收分支未行使**（只有单测证据，见 §3.3） |
| V16 成员同源块名集 == wire 名集 | **FAIL**（块「1 个」vs wire 58–79） | **FAIL**（TB-2773 半修：chair 20/20、窄请求 36 PASS；每回合首请求 **13/49** 块 58/48 ≠ wire 79/69 ⇒ **TB-2775**） |

> **矩阵读法**：attempt-2 列只写 audit5 独立复核到的读数；**「未独立复核」既不等于 PASS 也不等于 NE**，它是「本轮审计未覆盖该点」，不得折算进任何 PASS 计数。attempt-1 列的判定逐字保留（V15/V16/V14 不因 attempt-2 的改善而改写）。

### 3.2 attempt-1 明细（历史，原样保留）

| 验点 | 实测（回执字段=原值 / 独立证据） | 判定 | 备注 |
|---|---|---|---|
| **V1** 归因同源 | 同回合两读：`vibe_vmu_records{list}`（office seq159）`count:22`，按行 = **own-turn 15 / relayed 7 / unknown 0**（【D】解码核）；`vibe_vmu_turn{status,detail:"board"}`（office seq164）`memberActs:4, officeRelayedActs:1, unknownActs:0, acts:5, provenActs:5, memberTurns:3, memberShare:0.8`（【D】）。**22 行无法重算成 acts:5**；`acts:6` 是更晚的 seq204（【O】误引） | **FAIL**（两读面互矛盾、缺换算键） | office 写 `NO-EVIDENCE（不可复现）` 是**错误分级**（【A4】§5.2）；报告与 FEEDBACK 又各报一个时刻的 acts（6/5）⇒ 见 §10 教训 |
| **V2** 状态板/蓝图进正文 | `op:"prompt",member:"r-acad"` 4 页读到 `done:true`（`chars:29829`、`pages:4`）；`statusBlockIncluded:true`、`statusBlockChars:972`、`promptFor.turnMember:"r-acad"`（【D】解码 seq74）；正文含 `[状态板]` 四行与 `[蓝图] 无现行版（rev 0，md 未落盘）`；board 的 `liveReadings.blueprint` 是**更晚**的 `rec-13`（21:37 才有草案）（【O】+【D】片段） | `PASS`（状态板/注入半）/ **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（「同值同刻」半：t-1 装配早于 rec-13，同一瞬间的 prompt+board 未捕获） | 【O】自己标了「同刻对照未取」；不升格为完整 PASS |
| **V3** `prompt` 认 `member`（不一致拒） | 正例 `promptFor.member:"r-acad"`；**不一致调用**（`turn:"t-10", member:"r-acad"`）⇒ `ok:false`、`code:"VMU_INVALID_ARGUMENT"`、message「turn t-10 is seat r-1's prompt, not r-acad's…」、hint 给两条 `REACHABLE INSTEAD:`（【D】office journal 原文命中；【O】同） | **PASS** | RUN 81 的 V3 缺口本轮补上（构造了不一致调用） |
| **V4** `step` 三支 | ①`turns` 12（`counts.opened:12`）；②成员 `op:"step"` 具名拒（见 V12）；③park 后裸 step ⇒ `{ok:true, completed:true, turn:"t-8", instructionDelivered:false, receipt.round:null}`（【O】+【A4】摘要） | **PASS** | 第三支形状与任务书逐字一致 |
| **V5** `receiptsView` 跨内核 | 回执：`readFrom:"durable-fold"`、`inProcessRingCount:0`、`available:2`（【D】解码 seq69 核到 `readFrom`/`inProcessRingCount`）；office 报 `count:2`；磁盘 `state.json keys.meetings` digest `b6857229:122991`（【O】） | **PASS** | 首读 `count` 曾是 0（run-lane 抽取 seq69），office 报后一次 2——`count` 随会议数增长，`readFrom`/`inProcessRingCount` 两源一致 |
| **V6** 议程（主席自拟 + 同传拒） | m3：`agendaInputShape:"string"`、**`agendaSplitMode:"bracket-aware"`**、`agendaSplitUnbalanced:null`、`agendaItems` **恰 3 条**（括号/引号内全角「；」未切）（【D】r-acad journal seq57 +【O】）；同传 ⇒ `VMU_MEETING_AGENDA_CONFLICT` + `reachableInstead`（【O】） | **PASS** | `agendaSource:"argument"` 原值未在主席回执出现 ⇒ 小口径缺口，不改变 3 项切分结论 |
| **V7** 互审票绑正文 | `review of:"r-2"` ⇒ rec-27、`judgedPartFingerprint:"4a5a983e…c966ab"`、`judgedPartRound:1`、`stalePart:false`（【D】r-acad journal seq202 核到）；rec-25/rec-30 同型（【O】） | **PASS**（带具名矛盾） | 同一 `advance` 的 `reviewsRead` 又把 rec-25/27/30 判 `stalePart:true` 且两串指纹相同，而 coverage 判 covered ⇒ **D-4 复现 / D-1 半修**，单列 §8 |
| **V8** 未测≠没有 | 定稿前 `toolchainProbe:"not-run"`、`toolchainAbsent:[]`、`pdfCompiled.produced:false` + **`blockedBy:"not-finalized"`**（【D】seq129 核到）；`final` 后 `toolchainProbe:"ran-present"`、`latexAvailable:true`（【O】+【A4】） | **PASS** | `not-run` 未被读成「没装」 |
| **V9** `vote_solved` 不单独计票 | 首回执（office seq149）**`keptNow:false`**、`keptWhy:"tool-visibility-unprovable"`、`fieldsKeeping`、`countedLater.notCountedFields:["vote_solved"]`（【D】解码核）；`votesCast` 4→4（【O】） | **PASS** | caller 通道本轮**未声明 `mounted_tools:"none"`** ⇒ 机制在但通道仍未启用（见 §8 D-8） |
| **V10** 通知块四键（全量） | office 报 **12 行全核**（t-1…t-12，`namedEmpty===(lines===0)` 12/12 成立；宿主另吞 5 484 B 但 12 行均在回执内可读）；本页对 full status 回执的 JSON 解析被宿主中段 `[...]` 打断（【D】未能整条 parse） | **PASS**（office 自报 · 全量 12 行；本页未独立复算） | 不把「本页没复算」写成「office 错」；但**宿主 `[...]` 会拦整条 JSON.parse**，复核须逐字段正则 |
| **V11** board 面有界 | board（office seq164）`receiptMeta:{originalBytes:9321, truncated:false}`（【D】解码核）；full `originalBytes:56398`、`truncated:true`（【O】）；比值 **6.05×** | **PASS** | 与 RUN 81 的 9 285/61 990 同量级 |
| **V12** 成员面动作边界（成员自读） | 成员 r-1 在**自己会话**调 `vibe_vmu_turn{op:"status"}` ⇒ 回执含 **`memberOps:["status"]`** + `memberOpsMeans`（【A4】D-9 +【D】r-1 journal `93023c6e` seq49 原文）；成员 `op:"step"` 被拒 `VMU_NOT_PERMITTED` + hint 点名 `status` | **PASS** | 【O】判 `NO-EVIDENCE` 偏保守；本判据用 audit4 第一手 journal 原文，非替代证据 |
| **V13** 蓝图草案口径 | 可证：蓝图为 `rec-13`（`status:"draft"`、`revision:1`、`mdPath:"Shared/Drafts/tech-route-r1.md"`、`draftMdMissing:false`、`mdFingerprint:"sha256:7e3c1a59…2dd1"`，【O】+【A4】读盘核）；`state` 面键 `hasCurrent:false`/`currentRevision:0`（【D】r-2 journal seq19 核到）。**首支 `filed:false`/`draftMdMissing:true` 的原值未取** | `PASS`（state 半）/ **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（propose 首支） | 不把「未取首支」升为完整 PASS |
| **V14** 结题链与 PDF sha | 票（office seq139）：`votesCast:4, votesTotal:4, votesFor:0, votesAgainst:4, missing:[], notEligible:[{member:"r-temp",solved:false,why:"no-closure-vote-permission"}]`（【D】）；`render`（r-acad seq300）`recordIds:{md:"rec-32", tex:"rec-33", meta:"rec-34"}`、`renderOk:true`（【D】）；`final`（seq295）`pdf:{produced:true, recordId:"rec-35", pdfBytes:131793, engine:"xelatex"}` —— **该块没有 `pdfSha256` 键**（【A4】grep `Sha256`=0）；磁盘 sha `a1bd3f37…bef4a` = `state.json` `rec-35.body.pdfSha256`（【D】`sha256sum`+读盘逐字相等）；**final→render 之后无任何 `status` 调用** | **`PASS`（实质）/ `NO-EVIDENCE` / `RUN-DID-NOT-REACH`（5 字段）** | 5 字段 = `finalPdfRecordId`/`finalPdfBytes`/`finalPdfSha256` + `pdfCompiled.diskPdfSha256`/`pdfSha256MatchesDisk`；已有 status 全是 final 前（`produced:false`/`blockedBy:"not-finalized"`）⇒ **不许用「磁盘=ledger 行」替证** |
| **V15** PDF 无缺字（TB-2768） | PDF（pymupdf 1.28.2）：7 页、6 161 字符、**`U+FFFF=23`**、`U+FFFD=0`、页分布 **[4,7,2,2,8,0,0]**（【D】我亲跑 +【A4】【R】）；`pdftotext` 交叉 23；`paper-p1.log` **23 条 `Missing character`**（【D】`grep -c`）；回执 `glyphLossDetected:true`、`missingCharacterCount:23`、`glyphLossCode:"VMU_PAPER_GLYPH_UNCOVERED"`、`logRead:true`，`glyphsUnrepaired` 10 行具名（和=23）（【A4】【R】）；缺的字 `∉⌊⌋①②③④⑤`（10 行/8 distinct，含 bold/regular 两字体）与 RUN 81 的 6 个 **交集为空** | **FAIL** | **检测链 ✅ / 覆盖链 ❌ = 半修**：TB-2768 不能算「已修」，但也不能算「完全没修」；TB-2772 = 替换表第二轮 |
| **V16** 成员同源块名集 == wire 名集（TB-2770） | 5 个成员/临时工首回合 `header.tools` **全 79**（`vibe_*` **69**），块却是 **「1 个：`working_directory`」**（块内 `vibe_*` 名集 = 空）；**同一请求内即矛盾**：r-1 `seq31 块=1 ↔ seq32 header=58`、`seq162=1 ↔ seq164=79`、`seq171=1 ↔ seq172=58`（【A4】【R】）；源头 `agent.ctx.tools.schemas()` 装配期只返回 1 个，`out.tools` 在子会话为 null，**`wireSource` 无任何可读诊断**（`PRODUCT-MISSING`）；块里「wire 快照」句仍是假事实；每个 step 都错（不是一次性首装配过期） | **FAIL** | TB-2770 **约 1/3 生效**：假否定「0 个」没了、`wire-unknown` 兜底与「空表不写缓存」已加；但块仍非 wire。TB-2773 = 第二轮 |

### 3.3 attempt-2 明细（audit5 独立复核到的点；【A5】§1–§5）

**V5 `receiptsView` 跨内核 = PASS（但 office 的 `count:1` 不可复现）**

- 唯一一次调用：root `session-2390d125` call seq 315，`args={"action":"receiptsView","limit":10}` → result seq 316。
- 回执摘要：`count:10`、`available:15`、`dropped:5`、`ringDropped:0`、`readFrom:"durable-fold"`、`inProcessRingCount:0`；`sourceDivergenceMeans`「15 durable / 0 in-process：durable fold 是共享记录，ring 只反映本内核的动作」；`receiptRingMeans` 说明 `dropped = available − count`（`limit` 截断）。
- `count = min(limit=10, available=15)` = **10**，不是 1；`receiptMeta.truncated:false`，但该 result 被宿主插入 `(Omitted 15 497 bytes…)`（`originalBytes:64 602`、`hostElision:"possible"`）⇒ 正文不可整体 `JSON.parse`，summary 块在尾部完整可读。
- 跨内核可读成立：15 条 durable 行里有主席子会话写入的 m1/m2/m3 行（`open m2/m3 openedBy:"r-acad"`、`attend m1 member:"r-3"` 等）；现盘 `state.json` 261 069 B、`"m1"/"m2"/"m3"` 各 1 处、`closure_votes` 6 处【D】。
- **若有人报 `count:1`**：本轮 journal 只有这一条 `receiptsView`，无第二来源，**不可复现**。

**V14 结题链与 PDF sha = PASS（五字段跨会话取齐，三方对齐）**

- `final`（chair `a89af03e` call233 → res234）：`pdf:{ok:true, kind:"compiled", produced:true, engine:"xelatex", pdfPath:"…slvp265-ws\\Paper\\paper-p1\\paper-p1.pdf", pdfBytes:113580, pdfSha256:"29a8c3ed…4f5f", pdfSha256Means:"…THIS compile produced and recorded…", recordId:"rec-38"}`；顶层 `complete:true`、`glyphLossDetected:false`、`missingCharacterCount:0`、`glyphsUnrepaired:[]`、`logRead:true`、`toolchainProbe:"ran-present"`、`latexAvailable:true`。（注意：顶层**仍无 `pdfCompiled`**，事实在 `final.pdf` —— D-4 口径未变。）
- `render`（call240 → res241）：`renderOk:true`、`recordIds:{md:"rec-35",tex:"rec-36",meta:"rec-37"}`、`wroteToLedger:["md","tex","meta"]`、`diskFiles:[]`、`archiveArtifacts:{present:{md:true,tex:true,pdf:true,meta:true}, missing:[], complete:true}`、`pdf:null`。
- **`final`→`render` 之后的那次 `status`**（root `session-2390d125` call363 → res364；时间 `1794529701040` > render `1794529544762`，确为之后）：
  `pdfCompiled.produced:true`、`recordId:"rec-38"`、`pdfBytes:113580`、`pdfSha256=finalPdfSha256=diskPdfSha256:"29a8c3ed…4f5f"`、`diskPdfBytes:113580`、**`pdfSha256MatchesDisk:true`**、`pdfSha256Mismatch:false`、`diskFileFromRecord:"rec-38"`、`diskFileBytes:113580`、**`finalPdfRecordId:"rec-38"`**、`finalPdfBytes:113580`、**`compiledAfterFinal:false`**、`logRead:true`、`glyphLossDetected:false`、`glyphsUnrepaired:[]`；`archiveArtifacts` 4/4 complete。
- 磁盘【D 亲验】：`stat` = **113 580 B**、`sha256sum` = **`29a8c3ed…4f5f`**；`state.json keys.records[37]` = `rec-38` body `{pdfBytes:113580, pdfSha256:"29a8c3ed…4f5f"}` ⇒ **磁盘 = `final.pdf` = `status.pdfCompiled` 三方逐字相等**。
- `closureVote`（root res359，同一回执内）：`cast:true、confirmed:true、votesCast:4、votesFor:4、votesAgainst:0、votesTotal:4、for:["r-acad","r-1","r-2","r-3"]、missing:[]、notEligible:[{member:"r-temp", solved:false, why:"no-closure-vote-permission"}]、voters:[…]`。
- **attempt-1 的 5 个 NE 字段本轮全部取到** ⇒ V14 PASS（**只写 attempt-2 这一行**，不回填 attempt-1）。

**V15 PDF 无缺字（TB-2768）= PASS（实测）/ 但 TB-2772 的拒收分支本轮未被真机行使**

- PDF【D 亲验】：pymupdf 1.28.2 `pages:5`、`chars:3508`、**`U+FFFF=0`、`U+FFFD=0`、`U+FFFE=0`**；`pdftotext -enc UTF-8` 交叉 3 697 字符、`U+FFFF/U+FFFD=0`（【A5】）；`paper-p1.log` **32 101 B、`Missing character` 0 行**【D `grep -c`】。
- 回执：`glyphLossDetected:false`、`missingCharacterCount:0`、`glyphsUnrepaired:[]`、`glyphLossMeans:"…the compile log was read and carried NO `Missing character` line: every glyph the .tex asked the font for was printed (a MEASURED clean reading, not \"not checked\")"`、`logRead:true`、`logPath:"…paper-p1.log"`、`toolchainProbe:"ran-present"`；`final.math:{glyphsRepaired:1, glyphsUnrepaired:[], glyphLossDetected:false, missingCharacterCount:0}`。
- **★ 必须如实记**：7 份 journal 的 `tool/result` 里**没有任何回执返回 `code:"VMU_PAPER_GLYPH_UNCOVERED"`**（0 命中；全文出现该串的 113 处都是 `part` 工具的 **schema description 文本**，不是回执）。.tex 里非 CJK 非 ASCII 字符只有 9 个（`—`×3、`→`×4、`−`×2），xelatex 全部打印、日志 0 缺字；`glyphsRepaired:1` 只说明走了 1 次**替换**分支。⇒ **TB-2772「`final` 缺字即具名拒 + 回滚 `awaiting-editor`」分支本轮未被真机行使，只有单测证据；不能把「没触发」写成「已验」。**

**V16 成员同源块名集 == wire 名集 = FAIL（TB-2773 半修：13/49 请求）**

- 配对规则：每个 `request/header`（seq R）取「seq < R 且大于上一 header」的最近 `system/message` 中 `【本轮你实际能调用的工具｜<slot>】<N> 个：a、b、…` 块（块自称与 `request/header.tools` 同一来源）；`system/message` 只在内容变化时落盘，未变 step 沿用最近一条——正合块自述「本请求」口径。
- **chair `a89af03e`：20/20 PASS**（块 79（69 vibe）== header 79/69，逐请求恒等）。
- **member r-3/r-1/r-2**：header **58/48** 的请求块 58/48 ⇒ PASS；header **79/69** 的请求块仍 **58/48** ⇒ **FAIL，缺 21 个 `vibe_v5_*`**（`vibe_v5_assign,configure,fidelity_conclude,meeting,meeting_round,message,nudge,overview,pause,poll_close,poll_open,prioritize,report,resume,script,set,start,stop,verdict_ask,verdict_final,verified_promote`）。
- **temp `f438019a`**：header 39/29 时块 39/29 PASS；header 79/69 时块 39/29 ⇒ **FAIL，缺 40 个 `vibe_*`**。
- **root / 起跑探针**：wire 95（69 vibe + 26 host），**无块**（`host.js` 对 root 早退，设计如此）⇒ NO-BLOCK，不计。
- 计分：**36 PASS / 13 FAIL / 2 NO-BLOCK（共 51 请求，49 计分）**；13 FAIL **全部是「每个回合的第一个请求」**（wire 79/69）。
- 机制证据：每回合 **step1** 的 `developer/message`（`source.kind:"tool-registry"`）**逐条列出这 21 个 `tool-addition`**（自 t2s1 起；t1s1 的 4 个会话从会话初就带着 79），**step2** 再逐条 21 个 `tool-removal` ⇒ 这 21 个工具在首请求 wire 上确实可调，块却漏掉。本轮 **0 次**调用用到这 21 个首请求额外工具（member 首请求只调 `vibe_v5_inbox/vibe_v5_paper/vibe_vmu_turn/vibe_vmu_meeting`）⇒ **未观测到行为级阻塞，但假事实成立**。`wildcard/*` 语义已排：全部 3 706 个 wire 名与全部块名**无一个含 `*`**（显式名集，`Array.includes`）。
- 逐会话：r-3 9 请求（4 FAIL）、r-1 11（5 FAIL）、r-2 7（3 FAIL）、r-temp 2（1 FAIL）、chair 20（0 FAIL）。全表见 audit5 §3.1 / TB-2775。
- `slv-inspect` 4 RED **是真不符，不是假红**（`6f7aeca8`/`9cc291ee`/`b38c7fa2` 各 21 个、`f438019a` 40 个）；但该检查器用「块名集并集 vs 全 header 的 wire 并集」（`scripts/slv-inspect.mjs:264-283`），**粒度是并集、不可定位到请求**，且把 root 会话误标成 `member: r-1`（P2 检查器瑕疵）。

---

## 4 独立对账（本页亲验 vs 转抄）

> 【D】= 本页实际复算/解码；【A4】/【A5】= audit4/audit5；【R】= run-lane；【O】= office。

| 对账项 | 读数 | 方法/证据 | 来源 |
|---|---|---|---|
| PDF 字节 / sha256（a1） | **131 793 B** / `a1bd3f3756b04a6db6c8fea61e4262d8d9e4520abfc47ceb75ee464de74bef4a` | `sha256sum`；`%PDF-1.7`、`startxref`、`%%EOF`（【A4】） | 【D】 |
| PDF 文本 `U+FFFF`（a1） | **23**（7 页；每页 [4,7,2,2,8,0,0]；`U+FFFD=0`） | pymupdf 1.28.2 我亲跑 | 【D】 |
| `paper-p1.log` `Missing character`（a1） | **23** 行 | `grep -c`；行号 728–804【A4】 | 【D】/【A4】 |
| ledger `rec-35.body`（a1） | `pdfBytes:131793`、`pdfSha256:a1bd3f37…ef4a`、`glyphLossDetected:true`、`missingCharacterCount:23` | 直读 `state.json` 并 parse body | 【D】 |
| 驱动 done 行（a1） | `durationSec:3381`、`tokenTotal:23 698 259`、`transcriptEvents:288`、`toolCalls:47`、`tokenCapHit:false` | `run84.drive.log:90` | 【D】 |
| jsonl（a1） | **66 160 360 B / 129 184 行** | `ls` + `wc -l` | 【D】 |
| 会话 / journal 盖章（a1） | **7 个会话**、7 份 journal 各 1 条 `run-metadata` 帧（`build:"d492dc8c"`） | 目录计数 + 解码首行 | 【D】/【A4】 |
| `closureVote`（a1） | `votesCast:4/votesTotal:4/votesFor:0/votesAgainst:4/notEligible r-temp` | office journal seq139 解码 | 【D】 |
| `render.recordIds`（a1） | `{md:"rec-32",tex:"rec-33",meta:"rec-34"}`、`renderOk:true` | r-acad journal seq300 解码 | 【D】 |
| `final` 是否有 sha（a1） | **无 `pdfSha256` 键**（`Sha256` 全文件 0） | 【A4】grep；【D】未见 | 【A4】 |
| V1 两读面（a1） | records seq159 `count:22`（own 15/relayed 7/unknown 0）；board seq164 `acts:5`（`memberActs:4`+`officeRelayedActs:1`） | office journal 解码 | 【D】 |
| V2 prompt（a1） | seq74 `statusBlockChars:972`、`statusBlockIncluded:true`、`done:true`、`chars:29829`、`pages:4` | office journal 解码 | 【D】 |
| V9 首回执（a1） | seq149 `keptNow:false`、`keptWhy:"tool-visibility-unprovable"` | office journal 解码 | 【D】 |
| V5 `receiptsView`（a1） | seq69 `readFrom:"durable-fold"`、`inProcessRingCount:0` | office journal 解码 | 【D】 |
| V7 指纹（a1） | r-acad seq202 `judgedPartFingerprint:"4a5a983e…"`、`judgedPartRound:1`、`stalePart:false` | r-acad journal 解码 | 【D】 |
| V13 `state` 键（a1） | r-2 journal seq19 `hasCurrent:false`、`currentRevision:0` | 成员 journal 解码 | 【D】 |
| V12 `memberOps`（a1） | r-1 journal seq49 `memberOps:["status"]` | 成员 journal 解码 | 【D】/【A4】 |
| TB-2766 v3（a1） | `postDrive{inspect:"exit=1",stamped:"ok",cleanup:"done"}`；`journalStamped:true/count:7`；inspect 161 269 B；watchdog `RUN-ENDED`（21 轮最低 2.05 GB，闸 0.8）；clone 无、port 19811 无监听 | `run84-metadata.json`/`run84.watchdog.log`/`run-inspect-slvp264.log`/`netstat` | 【D】/【A4】|
| PDF 字节 / sha256（a2） | **113 580 B** / **`29a8c3eda71196ce1a06623205ec385358829a8c226a631539e924eed2c64f5f`** | `stat -c %s` + `sha256sum` | 【D】 |
| PDF 文本（a2） | 5 页、3 508 字符、**`U+FFFF=0`、`U+FFFD=0`、`U+FFFE=0`** | pymupdf 1.28.2 我亲跑；`pdftotext` 交叉 3 697 字符 0/0/0【A5】 | 【D】/【A5】 |
| `paper-p1.log`（a2） | 32 101 B、**`Missing character` 0 行** | `grep -c` | 【D】 |
| ledger `rec-38.body`（a2） | `pdfBytes:113580`、`pdfSha256:"29a8c3ed…4f5f"` | 直读 `state.json`（261 069 B）parse `keys.records[37]` | 【D】 |
| 驱动 done 行（a2） | `durationSec:2430`、`tokenTotal:21 726 155`、`transcriptEvents:434`、`toolCalls:76`、`tokenCapHit:false`、`followStreamWorked:true` | `run85.drive.log:90` | 【D】 |
| jsonl / 会话（a2） | **53 100 208 B / 84 941 行**；**7** 个会话目录、7 份 journal（build `293d1f34`） | `ls`+`wc -l`；目录计数 | 【D】/【A5】 |
| V14 三方（a2） | 磁盘 sha == `final.pdf.pdfSha256` == `status.pdfCompiled.diskPdfSha256`；`pdfSha256MatchesDisk:true`、`compiledAfterFinal:false`、字节 113 580 三处一致 | 【A5】§1 回执原文 + 【D】磁盘/ledger | 【A5】/【D】 |
| V16 逐请求（a2） | chair 20/20；member 27 请求中 12 FAIL；temp 2 中 1 FAIL ⇒ **13/49 FAIL** | audit5 逐请求配对表（`v16-table.md`） | 【A5】 |
| `receiptsView`（a2） | `count:10/available:15/dropped:5/readFrom:"durable-fold"/inProcessRingCount:0` | root call315→res316 | 【A5】 |
| TB-2766 v3（a2） | `postDrive{inspect:"exit=1",stamped:"ok",cleanup:"done"}`；`journalStamped:true/count:7`；inspect **114 326 B**、`SUMMARY: 6 session(s) … 4 with RED checks`；watchdog 16 轮最低 2.12 GB、`RUN-ENDED` 08:35:39；clone 无、port 19813 无监听 | `run85-metadata.json`/`run85.watchdog.log`/`run-inspect-slvp265.log`/`ls`/`netstat` | 【D】 |

---

## 5 汇总口径（按 attempt 分层；attempt-1 行数自洽 10 + 3 + 3 = 16）

### 5.1 attempt-1（历史汇总，原样保留）

- **10 完整 PASS**：**V3 / V4 / V5 / V6 / V7 / V8 / V9 / V10 / V11 / V12**
- **3 带局部 NO-EVIDENCE**：**V2**（「同值同刻」半，`RUN-DID-NOT-REACH`）、**V13**（propose 首支，`RUN-DID-NOT-REACH`）、**V14**（status 五字段，`RUN-DID-NOT-REACH`；实质链 PASS 另记）
- **3 FAIL**：**V1**（两读面互矛盾，缺换算键）、**V15**（PDF 仍 23 个 `U+FFFF`；TB-2768 半修）、**V16**（块「1 个」vs wire 79；TB-2770 半修）
- **V 表 ENV-LIMIT = 0**；环境侧仍有 `bash(MSYS)` 不可用、所办侧 token/transcript 不可读（§9，非验点）
- **与 office 自报（10 PASS / 2 FAIL / 4 NO-EVIDENCE）的差异及原因**：
  1. **V1：NO-EVIDENCE → FAIL**（两读都取到且互矛盾；「不可复现」不是可用的 NO-EVIDENCE 原因；audit4 §5.2）。
  2. **V12：NO-EVIDENCE → PASS**（r-1 自己会话的 `memberOps:["status"]` 在 journal 原文里，office 只是「所办读不到」；这是读面可达性问题，不是产品缺键）。
  3. **V14：PASS → PASS（实质）+ 5 字段 NO-EVIDENCE**（final 后未调 status；不许用「磁盘=ledger 行」替证）。
  4. V2/V13 维持 NO-EVIDENCE；V15/V16 FAIL 与 office 一致（但**理由按审计改写**：TB-2768/2770 是半修，不是「未修」/「未实现」）。
  5. office 的 V15 三路读数（23/23/23）本身正确，但它「`glyphsUnrepaired` 缺席」的表述与 V16「chair 无块」都是**读数面误读**（§2.1）。

### 5.2 attempt-2（新增；审计只覆盖子集，**不折算成 16 行汇总**）

- **audit5 独立复核到的点**：**V5 PASS**、**V14 PASS**（attempt-1 的 5 个 status 字段本轮全部取到）、**V15 PASS（实测，拒收分支未行使）**、**V6 写面 PASS / 读面 FAIL（D-6 → TB-2776）**、**V16 FAIL（TB-2775）**。
- **其余 11 个验点（V1–V4、V7–V13）本轮未获独立复核**：office 自报 `SIM-REPORT82.md` 写「14 PASS / 1 FAIL（V6）/ 1 混合（V16 member PASS + temp NE）」，但同一份报告已被证明有 **V16 假 PASS、temp 腿误 NE、build/toolCalls/会话数/时长/state.json 读数错**（§2.2）⇒ **不采信为验收结论**；本页记「未独立复核」（既不是 PASS 也不是 NE，**不参与任何计数**）。
- **为什么不做 16 行折算**：把未复核的点按 office 自报计入 PASS 就是做假；按「未取到」计入 NE 又会把「本轮审计没覆盖」说成「产品不可达」。两种都违反尺子纪律，故只对**已复核的 5 个点**给判定，其余原样留白待下一轮。
- **attempt-2 与 attempt-1 的判定变化（只记变化，不改历史）**：V14 `NE(5字段)`→**PASS**；V15 `FAIL`→**PASS（实测）**（拒收分支仍未行使）；V16 `FAIL（1 个）`→**FAIL（半修，13/49）**；V5 维持 PASS（`count:2`→`count:10`，口径一致）；V6 写面维持 PASS、读面新增缺陷（TB-2776）。
- **attempt-2 的 PASS 是否结算为「已修」**：V14 的字段断链 → **已闭环**；V15 的文本层缺字 → **已修**，但 TB-2772 的**具名拒收 + 回滚分支**仍只有单测证据（§3.3）⇒ **TB-2772 不能关**；V16 → **未修，转 TB-2775**。

---

## 6 TB-2766 v3 实测（两次真机均 PASS）

### 6.1 attempt-1

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run84-metadata.json`：`{inspect:"exit=1", stamped:"ok", cleanup:"done"}`；`postDriveAt`/`journalStampAt`/`completedAt` 三时刻齐全 | PASS |
| journal 盖章 | `journalStamped:true, journalStampedCount:7`；独立核 7 个会话目录各 1 条 `run-metadata` 帧（`build:"d492dc8c"`） | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp264.log` **161 269 B**；6 个 session 段（5 成员 + 所办）、结尾 `SUMMARY: 6 session(s) in 1 file(s), 5 with RED checks` + `[slv-inspect exit code: 1]`（`exit=1` 是判据要求，不是崩） | PASS（内容有 P3 编码缺陷，见 §2.1 备注） |
| 看门狗无 kill | `run84.watchdog.log`：v3 `minFreeGB=0.8`、21 轮最低 `free_GB=2.05`（从未触闸）、`badHits=0 consecutiveBad=0`；`run84.WATCHDOG-RUN-ENDED.json`：`verdict:"RUN-ENDED"`（无 kill/abort 字段） | PASS |
| clone / 端口 | 只有 `slvp264-ws`、无 clone 目录；driver `cleanup: clone_gone=True port_listening=False`；现网无 19811 监听 | PASS |

### 6.2 attempt-2（第二次真机复验）

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run85-metadata.json`：`{inspect:"exit=1", stamped:"ok", cleanup:"done"}`；`postDriveAt 08:33:45.876`、`journalStampAt 08:33:45.843`、`completedAt 08:33:47.647` 三时刻齐全 | PASS |
| journal 盖章 | `journalStamped:true, journalStampedCount:7`；独立核 7 个会话目录各 1 条 `run-metadata` 帧（`build:"293d1f34"`）【D】 | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp265.log` **114 326 B**；`SUMMARY: 6 session(s) in 1 file(s), 4 with RED checks` + `[slv-inspect exit code: 1]`（4 RED = V16 真不符，见 §3.3） | PASS（RED 是产品缺陷，不是收尾链故障） |
| 看门狗无 kill | `run85.watchdog.log`：16 轮最低 `free_GB=2.12`（闸 0.8 从未触）、`badHits=0 consecutiveBad=0`、`MEMORY-LOW` 无；`run85.WATCHDOG-RUN-ENDED.json`：`verdict:"RUN-ENDED"`、`at 08:35:39`、`tokens 21 726 155`、`detail:"transcript reached \"step\":\"done\" (driver finished); watchdog stops watching"` | PASS |
| clone / 端口 | `ls /d/_tmp/slv-phase5` 只有 `slvp265-ws`、无 clone 目录；`netstat` 无 19813 监听【D】 | PASS |

> attempt-1 曾出现 watchdog `MEMORY-LOW` 误杀的**那次是另一轮**（RUN 81 教训），本轮两 attempt 均无 kill。attempt-2 的 inspect 是 `4 with RED`（attempt-1 是 `5 with RED`），差异来自 V16 修复进展，不是收尾链变化。

---

## 7 RUN 81 遗留 D-1…D-9 复现情况（按 attempt 分层）

### 7.1 attempt-1（【A4】§6，原样保留）

| 条目 | 本轮证据 | 判定 |
|---|---|---|
| D-1 覆盖门绑 round | `advance`（r-acad seq290）coverage 已绑指纹（`covered:[rec-25,rec-27,rec-30,rec-17]`、`missing:[]`，rec-17 带 `countedFromEarlierRound:true`/`means:"…binds the TEXT, not the round number"`）；**但同回执 `reviewsRead` 仍按 round 判 stale** | **半修 + 复现（并入 TB-2774）** |
| D-2 两个作废名单 | `voidReviews` 按 `why` 分组 + `count` 的「唯一读面」已存在，`invalidatedByRound`/`staleReviews` 为过滤视图；本轮 14 处 `voidReviews` 全 `[]`，**无非空样本** | 形状已修；非空样本 `NO-EVIDENCE` |
| D-3 蓝图 `mdHasMarker` | 本轮 md 首行 = `# 技术路线蓝图 r1`（无 `## 共同设计补充｜<id>` 标记）；`mdHasMarker:false` 正确；`mdFingerprint` 与磁盘 md sha 逐字相等 | **未复现（`RUN-DID-NOT-REACH`：无带标记来稿）** |
| D-4 相同 sha 说「≠/被替换」 | **复现**：`advance`（seq290）`reviewsRead` rec-25/27/30 三条 `judgedPartFingerprint` 与 `currentFingerprint` **逐字相同**却 `stalePart:true`、文案「the text it judged was replaced」；同回执 coverage 又把同一批判 covered | **复现（FAIL）→ TB-2774** |
| D-5 `round` vs `updatedRound` | `advance`（seq214）`round:2/updatedRound:2/updatedRoundSameAsRound:true` + `updatedRoundMeans`；status（seq283）一致 | **已修（PASS）** |
| D-6 议程括号 | m3 单串含两分号、第二项 `（(2k−1,2k) 的界；再看配对）`：`agendaItems` 恰 3、`agendaSplitMode:"bracket-aware"`、`agendaSplitUnbalanced:null`；括号内全角「；」未切 | **已修（PASS）** |
| D-7 `create description` 无 `owner` | 本轮无 `vibe_v5_task_create` 带 `description` 的调用；note 仍写 `when owner is set` | **NO-EVIDENCE（`RUN-DID-NOT-REACH`）** |
| D-8 caller 模式 `vote_solved` 通道 | 机制已存在并文档化：`vibe_vmu_turn` 的 `mounted_tools`（唯一值 `"none"`；`kernel/turn/index.js:3809-3828,4471-4487`、`docs/03-interface-contract.md:172`）；本轮 caller 代转**没有声明** ⇒ 首回执仍 `keptNow:false/keptWhy:"tool-visibility-unprovable"`，新增 `mountedToolsDeclared:null`；结题票 4/4 未变（不伪造） | **机制已修 + 未启用（半修/NO-EVIDENCE）** |
| D-9 成员 `status` 无 `memberOps` | **已修**：r-1 自己会话 `93023c6e` seq49 `memberOps:["status"]` + `memberOpsMeans` | **PASS** |

### 7.2 attempt-2（【A5】§6，逐条实测）

| 条目 | attempt-2 证据 | 判定 |
|---|---|---|
| **D-1/D-4** `advance` 四栏一致 | 4 次 advance：seq100 `writing→reviewing`(round1) `covered:[]`/`missing:[r-1,r-2,r-3]`；seq137 `reviewing→awaiting-editor` unanimous，`reviewsRead` 三行全 deliverable；seq181 `writing→reviewing`(round2) `covered:[r-1,r-2]`/`missing:[r-3]` + `staleReviews`/`voidReviews` 同指 r-3 且两指纹**确实不同**（`55ef7a39…` vs `46fb8fe6…`）；seq211 unanimous，`reviewsRead` 中 r-1/r-2 `countedFromEarlierRound:true,rowRound:1`（文本未变故计票）+ r-3 `source:"state",rec-32`，coverage covered 3/3。**未见「指纹相同却判 replaced」或「covered 与 stale 同屏相反」** | **一致（attempt-1 的同屏矛盾本轮未复现；TB-2774 不因此关闭）** |
| **D-2** `voidReviews` 非空 + 按 `why` 分组 | chair advance call180→res181：`voidReviews:[{why:"part-text-changed", count:1, members:["r-3"], entries:[{member:"r-3",recordId:"rec-24",why:"part-text-changed",judgedPartRound:1,currentRound:2,judgedPartFingerprint:"55ef7a39…",currentFingerprint:"46fb8fe6…"}]}]` + `voidReviewsMeans:"grouped by \`why\` with a COUNT per group"` | **PASS**（attempt-1 的「全空只能 NE」本轮有真样本） |
| **D-3** temp prompt 不留存 | root call368 `vibe_vmu_turn{op:"prompt",member:"r-temp"}` ⇒ `{ok:false, code:"VMU_NO_SUCH_OBJECT", message:"no assembled member prompt is retained for seat r-temp", hint:"retained seats: r-1, r-2, r-3, r-acad"}` | **复现（P1）→ TB-2777** |
| **D-5** `updatedRoundSameAsRound` | 4 次 advance 全部 `roundMoved:false`（round 1→1、1→1、2→2、2→2）；该字段按源码 `kit/paper.js:1431` 只在 round 前进分支发、`:1644` 只在 reviewing→writing 分歧分支发；本轮 round 1→2 是 `final{decision:"revise"}`（res165 `from awaiting-editor to writing`）走的 ⇒ 全 7 份 journal **0 次** `updatedRoundSameAsRound` | **NO-EVIDENCE（`RUN-DID-NOT-REACH`：条件分支未到）**；不能判「已修」也不能判「未修」 |
| **D-6** 议程括号（写面 vs 读面） | 写面 chair convene res17：`agendaItems` **3** 项、第 2 项括号完整、`agendaSplitMode:"bracket-aware"`；读面 root call380 `vibe_vmu_meeting{action:"summary",id:"m1"}` res381：`agendaItems` **4** 项（`[…,"议题二：…（含端点与奇偶两种情形","并核对 n=1 的退化情形）",…]`），`agendaItemsMeans:"the SAME agenda string split on \`;\`, \`；\` and newlines only"` | **复现（P0）→ TB-2776** |
| **D-7** `toolchainProbe:"ran-absent"` 与已装 xelatex 相反 | `D:/texlive/2025/bin/windows/xelatex.exe` **存在**；r-3 status res176、chair `final{revise}` res165、chair status res187 均 `toolchainProbe:"ran-absent"`、`latexAvailable:null`、`toolchainAbsent:[]`；同一机器随后 chair `final` res234 `ran-present` + 113 580 B PDF | **复现（P1）→ TB-2777** |
| **D-8** caller `mounted_tools:"none"` / 幽灵票 | 7 份 journal 的 `tool/call` 参数里 **0 次** `mounted_tools`；root reply 回执 `mountedToolsDeclared:null`（`…no declaration was made: a reply vote on an UNOBSERVABLE turn stays tool-visibility-unprovable (not guessed)`）、`keptNow:false`、`keptWhy:"tool-visibility-unprovable"`、`countedLater.notCountedFields:["vote_solved"]`；终局 `closureVote.votesCast:4`（3 成员 + 主席），t-6 代传票**没有**进去 | **未声明（NO-EVIDENCE / 未启用）；幽灵票未计（正确）** |
| **D-9** 成员自读 `memberOps` | 三成员自己会话 `op:"status"` 全带：r-3（`6f7aeca8` call16→res17）、r-1（`9cc291ee` call18→res19）、r-2（`b38c7fa2` call16→res17），均 `memberOps:["status"]` + `memberOpsMeans` | **PASS** |

---

## 8 缺陷去向表

| 来源 | 摘要 | 去向 |
|---|---|---|
| **a1 P0** | 成员同源块**同一请求内**与 wire 矛盾（块「1 个」vs header 58–79；`wireSource` 不可读） | **TB-2773**（已立；本轮 attempt-2 证为**半修**） |
| **a1 P0** | PDF 缺字第二轮：检测链生效但替换表只覆盖 attempt-3 的 6 个字符，本轮丢 23 处（`∉⌊⌋①②③④⑤`） | **TB-2772**（已立；attempt-2 文本层已修，**拒收/回滚分支仍未真机行使** ⇒ 不关） |
| **a1 P1** | `advance` 回执 `reviewsRead` 判 stale 与 `perRoundReviewCoverage` 判 covered 同屏相反；两串相同指纹称「replaced」（D-4 复现 / D-1 半修） | **TB-2774**（已立；attempt-2 未复现，保持观察） |
| **a1 P1** | `final` 回执 `pdf` 块不含 `pdfSha256`（只有 recordId/pdfBytes），使「回执自证文件一致」在 final 面断链；status 五字段验收因此 `RUN-DID-NOT-REACH` | **attempt-2 已闭环**：`final.pdf` 带 `pdfSha256`，status 五字段全取到（`pdfSha256MatchesDisk:true`/`compiledAfterFinal:false`）⇒ V14 PASS；D-4「`final` 无顶层 `pdfCompiled`」仍留（P3） |
| **a1 P2** | V1 两读面无法互算（缺具名换算键）⇒ 本轮判 FAIL；office 误记 NO-EVIDENCE，且两文件引不同时刻 acts | 归入 **TB-2765 口径族**（建议 Lead 并入或另立）；attempt-2 未独立复核 V1 |
| **a2 P0（新立）** | **成员/临时工每回合第一个请求**：同源块 58/48（temp 39/29）≠ 同一请求 wire 79/69（temp 79/69），**13/49 请求**缺 21（temp 40）个 `vibe_v5_*`；块自称「名集取自本请求的 per-turn 工具表」⇒ 假事实 | **TB-2775**（第三轮；`D:\wd\vibemath开发\taskbooks\TB-2775-member-block-round3.md`） |
| **a2 P0（新立）** | 议程**读面**不 bracket-aware：同一 agenda 字符串写面 3 项、`summary` 读面 4 项并在括号处切开（D-6 复现） | **TB-2776**（`TB-2776-agenda-read-face.md`） |
| **a2 P1（新立）** | 两个读数洞：`toolchainProbe:"ran-absent"` 而 xelatex 存在（D-7 复现，且 `toolchainAbsent:[]` 自相矛盾）；`op:"prompt"` 对 r-temp `VMU_NO_SUCH_OBJECT`「no assembled member prompt retained」（D-3 复现） | **TB-2777**（`TB-2777-two-reading-holes.md`） |
| **a2 P1（新立）** | **报告可核性**：office 用「静态 allow 集」当 wire ⇒ V16 假 PASS；temp 腿误 NE；另有 build/toolCalls/会话数/时长/state.json 读数错（§2.2） | **TB-2778**（`TB-2778-report-verifiability.md`；属任务书/报告纪律缺陷，不是产品缺陷） |
| **office 另报（a1）** | FEEDBACK82 D4（`formal` 教法与面实参不一致）/ D5（`part` 在 reviewing 阶段不可补而同刻 `missing`）/ D6（`writtenFrom` 在无作者行上下结论） | 待 Lead 归并（**a1 未由审计独立复核**，按 office 自报登记）；a2 复核到的 D-2/D-3/D-4/D-7/D-8/D-9 已并入上表 |
| **已闭环** | TB-2766（看门狗 post-drive/驱动抗杀/inspect 落盘）v3 **两次真机 PASS** | 关闭 |
| **降级/保留** | TB-2767（toolchainProbe 矛盾）已降级为 V8 复核埋点；TB-2769（objective 两来源）仍观察 | 保留 |

---

## 9 未闭合与 `ENV-LIMIT` 清单

1. **V14 的 5 个验收字段**：attempt-2 已全部取到并三方对齐（§3.3）⇒ attempt-1 的该项 NE **在 attempt-2 层面闭合**；但 attempt-1 的历史判定不改（§3.1 两列分开）。
2. **TB-2772 的拒收 + 回滚分支仍未真机行使**：attempt-2 全程 0 条 `code:"VMU_PAPER_GLYPH_UNCOVERED"` 回执（只有单测证据）；「不触发」≠「已验」⇒ 下一轮必须**构造一次真缺字**（或证明替换表覆盖到真缺字仍拒）才算验过。
3. **V16 仍未修完**：attempt-2 13/49 请求 FAIL；下一轮按「每回合第一个请求」逐请求对齐（不能只抽窄请求）。TB-2775。
4. **V1–V4、V7–V13 的 attempt-2 读数未独立复核**：office 自报不可采信（TB-2778）；若下一轮仍要这 16 行全绿，审计必须覆盖全部验点，不能只覆盖差分点。
5. **D-5 条件分支未到（`RUN-DID-NOT-REACH`）**：4 次 advance 全 `roundMoved:false`；round 前进走的是 `final{revise}` ⇒ `updatedRoundSameAsRound` 没机会发。
6. **D-8 通道未启用**：0 次 `mounted_tools` 声明 ⇒ 幽灵票未计是对的，但「声明后会计/不会计」仍未真机验过。
7. **`slv-inspect` 两个口径瑕疵**（P2）：同源块比较用**并集**（`scripts/slv-inspect.mjs:264-283`，可漏报且不可定位到请求）；把 root 会话误标成 `member: r-1`。
8. **`run-inspect-slvp265.log` 中文 mojibake**（UTF-8→GBK 双重编码，包装脚本 P3）：attempt-1 已报、attempt-2 仍在；影响可读性、不影响 RED/SUMMARY。
9. **`receiptsView` 的 `count:1` 不可复现**：唯一回执 `count:10`；若后续报告再出现 `count:1`，须贴收到它的回执原文与时刻。
10. **token/transcript 两个口径**：office 侧**不可读**（写「未测量」可接受）；驱动侧 a1 `23 698 259`/`288`、a2 `21 726 155`/`434`——**不可把「所办不可读」记成「零」**，也须注明「宿主账本口径、本所不可达」。
11. **`bash(MSYS)` 不可用**（a1 记录，a2 未复测）：`NtCreateDirectoryObject(\BaseNamedObjects\…) → 0xC0000022 STATUS_ACCESS_DENIED` ⇒ `ENV-LIMIT`（PS/python 正常，产品不依赖 bash）。
12. **宿主中段 `[...]` / `(Omitted N bytes)`**：a1 的 full status（61 990 B 级）与 a2 的 `receiptsView`（64 602 B、被吞 15 497 B）都出现 ⇒ 复核须逐字段正则，不能整条 `JSON.parse`。
13. **`final` 回执仍无顶层 `pdfCompiled`**（D-4，P3）：成功时事实只在 `final.pdf`，且不发 `blockedBy:null`。

---

## 10 教训

1. **「半修」也要判 FAIL**：TB-2768 的检测链做好不等于交付合格——a1 PDF 仍有 23 个 `U+FFFF`、`final` 仍 `finalized:true/complete:true`；TB-2770 去掉「0 个」假否定后仍写「1 个」而 wire 有 79 个。**detection ✅ / coverage ❌ 的正确写法是 FAIL（半修）。** 同理 TB-2773 把 chair 修到 20/20、窄请求修对，但宽请求仍错 ⇒ 仍是 FAIL（TB-2775）。
2. **验收字段没取 = NO-EVIDENCE，不许用替代证据升格**：a1 的 V14 `status` 五字段没取，run-lane 用「磁盘 sha == ledger 行 sha」做实质替证——实质链成立（另记 PASS 理由），但验收表点名字段仍是 `NO-EVIDENCE/RUN-DID-NOT-REACH`；**a2 取到了才判 PASS**。标准不因「反正同值」而降。
3. **office 自报两轮都至少有 7–8 处读数/判定错误**（§2.1/§2.2）：build「未测」→ 实有、toolCalls 38/45 → 47/76、会话 5+1 → 7、acts 6 vs 5、chair「无块」、`glyphsUnrepaired`「缺席」、V1 误 NE、V12 偏保守、V16 假 PASS、temp 误 NE。**自报只能当被审对象**；凡「不可读」要写「本所不可达」，不能写成「产品缺该件」。
4. **抽查式 pin 与「同一请求内自洽」是两件事**：a1 V16 只抽一条 `system/message` 会以为只是「首装配快照过期」；对齐同一请求的 `request/header` 才看到每个请求都错。a2 更进一步：**只抽窄请求（58/48）会以为已修**，必须抽**每回合第一个请求**（wire 79/69）——这正是 office 假 PASS 的成因。
5. **宿主 `[...]` 是读数的一部分**：a1 full status、a2 `receiptsView` 都被吞中段；审计要按字段正则，报告要贴 `receiptMeta`/被吞位置，不能把「我 parse 失败」写成「产品没给」。
6. **「不测试」与「测试了但半修」要分开记**：a1/a2 的 V15/V16 都是**真机跑到了位**；a2 V15 是「干净 PASS」，但 TB-2772 的**拒收分支是「没触发」**——这两件事必须分开写，**不能把「没触发」记成「已验」**。
7. **PASS 分支走通 ≠ 拒收分支验过**：a2 V15 的 `glyphLossDetected:false` 证明「干净编译 + 实测读数」链成立；而「缺字即具名拒 + 回滚」只有单测。验收要按**分支**记账，不是按「功能在不在」。
8. **「同请求自洽」必须按请求粒度写判定**：a2 的 36 PASS / 13 FAIL 说明同一验点在不同请求可同时成立/不成立；汇总结论只能写「FAIL（13/49）」，不能写「基本修好」。
9. **报告读数必须带时刻与口径**：`state.json` 233 252 B（运行中快照）vs 261 069 B（终态）、`toolCalls 45`（所办侧估）vs 76（驱动/账本）、时长 44 vs 40.5/41.7——**不带时刻的读数就是不可复核的读数**。
10. **「本页没复算」不是「office 错」**：a1 V10 按 office 自报记 PASS 并标明未独立复算；a2 对未覆盖的 11 个点写「未独立复核」而不是 PASS/NE——**留白比编造诚实**。

---

## 11 证据路径总表

- **独立复核（a1）**：`D:/_tmp/audit4-lane/AUDIT4-REPORT.md`；自写解码器 `decode.cjs` 与 7 份解码 journal（`3d692508…`/`93023c6e…`/`7115dee5…`/`53da2580…`/`5f66db34…`/office/probe）。
- **独立复核（a2）**：`D:/_tmp/audit5-lane/AUDIT5-REPORT.md`（230 行）；自写 zstd 多帧解析器 `zframes.mjs`/`dez3.mjs`；解码 journal 7 份 1 255 行（`D:/_tmp/audit5-lane/journal/*.jsonl`）；逐请求表 `v16.json`/`v16-table.md`；PDF 读数 `v15.json`/`v15-pdftotext.txt`；`inspect-decoded.log`；`paper-receipts.jsonl`/`advance-receipts.jsonl`。
- **run-lane 第一手（a1）**：`D:/_tmp/run-lane/RUN82-V15-GLYPHS.md`、`RUN82-V16-BLOCK.md`、`run84-evidence/MANIFEST.md`（含 sha256）；中间件 `run84-pdf-uffff-rows.json`、`run84-glyph-receipt.json`、`run84-missing-character-full.json`、`run84-v16-exact-blocks.json`、`run84-wire-r-*.json`。
- **驱动/收尾（a1）**：`D:/_tmp/slv-phase5/run84.drive.log`、`run84-metadata.json`、`run84-preflight.json`、`run84.gate.acceptance.json`、`run84.monitor.log`、`run84.watchdog.log`、`run84.WATCHDOG-RUN-ENDED.json`、`run84.driver.exitcode.txt`、`run-inspect-slvp264.log`（161 269 B）。
- **驱动/收尾（a2）**：`D:/_tmp/slv-phase5/run85.drive.log`（done 行 :90）、`run85-metadata.json`、`run85-preflight.json`（8/8）、`run85.gate.acceptance.json`、`run85.monitor.log`（`08:33:54 RESULT exited exit=0`）、`run85.watchdog.log`（16 轮）、`run85.WATCHDOG-RUN-ENDED.json`、`run85.driver.exitcode.txt`、`run-inspect-slvp265.log`（114 326 B）。
- **jsonl / journal（a1）**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-050929.jsonl`（66 160 360 B / 129 184 行）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp264-ws--/`（7 个，各含 `run-metadata` 帧 build `d492dc8c`）。
- **jsonl / journal（a2）**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-074757.jsonl`（53 100 208 B / **84 941 行**）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp265-ws--/`（7 个：`a89af03e` r-acad、`9cc291ee` r-1、`b38c7fa2` r-2、`6f7aeca8` r-3、`f438019a` r-temp、`session-2390d125` root、`session-dd412f56` probe；build `293d1f34`）。
- **workspace（a1）**：`D:/_tmp/slv-phase5/slvp264-ws/`：`SIM-REPORT82.md`/`FEEDBACK82.md`/`PROGRESS82.md`、`Paper/paper-p1/{paper-p1.pdf,paper-p1.tex,paper-p1.log}`（log 23 条 `Missing character`）、`VibeMath/vmu/state.json`（`rec-35.body` = PDF sha/字节）。
- **workspace（a2）**：`D:/_tmp/slv-phase5/slvp265-ws/`：`SIM-REPORT82.md`（29 450 B / `cba5fa05…`）、`FEEDBACK82.md`（10 853 B / `e0491126…`）、`PROGRESS82.md`（8 755 B / `39811fda…`）、`Paper/paper-p1/{paper-p1.pdf 113 580 B / 29a8c3ed…, paper-p1.tex, paper-p1.log 32 101 B / 0 缺字}`、`VibeMath/vmu/state.json`（261 069 B；`keys.records[37]` = `rec-38`）。
- **任务书**：`D:/wd/vibemath开发/taskbooks/TB-2771-run82-brief.md`（第 82 次任务书，sha256 `29dfa0e3…`；合成件 `task-sim82.txt` sha256 `064eedf0…`）；本轮修复书 **TB-2772/2773/2774**（a1）+ **TB-2775/2776/2777/2778**（a2）。
- **本页复核脚本**：`D:/_tmp/doc-lane/extract82*.mjs`、`office.jsonl`/`probe.jsonl`（解码缓存）；a2 亲验命令见 §4（`stat`/`sha256sum`/`wc -l`/pymupdf/`json.load`）。

---

## 12 结论一句话

**RUN 82 两 attempt 均可结算为「build 在真机上跑通收尾链」（TB-2766 v3 两次 PASS：无内存闸杀、7/7 journal 盖章、inspect 完整、clone 已清）。attempt-1（`d492dc8c`）两条 P0 只半修：TB-2768 检测链生效而字形覆盖不足 ⇒ V15 FAIL（23 个 `U+FFFF`）、TB-2770 去掉「0 个」却仍写「1 个」而 wire 有 79 个 ⇒ V16 FAIL；V14 实质成立但 status 五字段未取。attempt-2（`293d1f34`）修好了 V14（五字段三方对齐：磁盘 = `final.pdf` = `status.pdfCompiled`，PDF 113 580 B / sha `29a8c3ed…4f5f`，票 4/4 + r-temp `notEligible`）与 V15 文本层（`U+FFFF=0`、`Missing character`=0、`glyphsUnrepaired:[]`），V5 亦 PASS（`count:10`，`count:1` 不可复现）；但 **V16 仍 FAIL**——TB-2773 只修到「窄请求」，每回合**第一个请求** 13/49 块 58/48 ≠ wire 79/69（TB-2775），office 的「V16 member PASS」是用静态 allow 集当 wire 的假 PASS（TB-2778）；另复现三条真机缺陷：议程读面括号切裂（D-6/P0，TB-2776）、`ran-absent` 假缺引擎 + temp prompt 不留存（D-7/D-3/P1，TB-2777）；且 TB-2772 的**拒收/回滚分支两轮都未真机行使**，只有单测证据，不能记「已验」。**
