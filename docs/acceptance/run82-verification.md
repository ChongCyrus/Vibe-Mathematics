# RUN 82 真机核对记录（attempt-1 / tag `run84`：收尾链首次真机通过 + 两条 P0 只半修）

> **这是记录，不是证据。** 证据在 7 份 session journal、`run84.drive.log`、`slvp264-ws/` 的磁盘产物与独立复核（audit4）里；本页把读数、V1–V16 判定、缺陷去向与未闭合事项留档。
> 依据可信度：**【A】** audit4 独立复核（自解 journal / 自算 PDF sha 与文本 / 直读 `state.json` 与 `paper-p1.log`）> **【R】** run-lane 第一手证据（`RUN82-V15-GLYPHS.md`/`RUN82-V16-BLOCK.md`/`run84-evidence/`）> **【D】** 本页亲验（复跑 `sha256sum`/行数/解码/抽取）> **【O】** office 自报（**被审对象**，已知有错）。
>
> 一句话结论：**`DRIVER EXIT=0`、TB-2766 v3 的收尾链首次真机 PASS**；但两条 P0 都只是半修——**V15 FAIL**（TB-2768 检测链生效、字形覆盖不足，PDF 仍有 23 个 `U+FFFF`）、**V16 FAIL**（TB-2770 去掉「0 个」假否定，却仍写「1 个」而同一请求 wire 有 79 个）；**V1 按审计应判 FAIL（不是 NO-EVIDENCE）**；**V14 实质 PASS 但验收点名的 5 个 status 字段 NO-EVIDENCE**。16 行判定 = **10 完整 PASS / 3 局部 NO-EVIDENCE / 3 FAIL / 0 ENV-LIMIT**（§5）。

---

## 0 本轮 attempt 记录

| attempt | 起止（北京） | tag / build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|
| **attempt-1（唯一有效轮次）** | 05:09:28 → 06:11:35（**62.1 min**） | `run84` / `d492dc8c`（`gitHead d492dc8c53efadca0f9e7093c160c1a2c9791ff0`，dirty=false） | **`DRIVER EXIT=0`**；drive 段 `durationSec 3381`（**56.35 min**）；收尾三键 `inspect:"exit=1"`（判据要求 5 RED）/ `stamped:"ok"` / `cleanup:"done"` | `tokenTotal 23 698 259` / cap 80 M（**29.6%**，`tokenCapHit:false`）；`transcriptEvents 288`；`toolCalls 47`；jsonl **66 160 360 B / 129 184 行**；**7 个会话**；PDF **131 793 B / sha256 `a1bd3f37…bef4a`** | `run84-metadata.json`、`run84.drive.log:90`（done 行）、`run84.monitor.log`、`run84.driver.exitcode.txt`（`0`） |

> 本轮**只记录 attempt-1**；没有 attempt-2/3 的失败轮次。tag `run84` 是 artifact 前缀，与「第 82 次真机」是两套编号。

---

## 1 运行元数据

| 项 | 值（来源） |
|---|---|
| 仓库 HEAD / 工作树 | `d492dc8c`、`git status --porcelain` 空（【A】核）；`run84-metadata.json` 的 `build/tarballBuild/gitHead` 一致、`dirty:false`、tarball 8 503 526 B |
| release gate | `RELEASE GATE READY`（audit `D:\_tmp\sim\run-2026-11-12T21-02-53-498Z-9792\AUDIT.md`）；`run84.gate.acceptance.json`：`ready:true / auditVerdict:PASS / gateExitCode:0 / head:d492dc8c…` |
| 起跑前 preflight | `run84-preflight.json` **8/8 PASS**（memory 2.72 GB、port/residual 0、task-file `27 606 B / sha256 064eedf0…e25f33`、tree-frozen `d492dc8c` dirty=0、gate receipt head==HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0） |
| provider / model / dsh | `dsh-opencode-go` / `deepseek-v4.1-flash` / dsh **`0.2.2-rc.1`**（`run84.drive.log` `MODEL SET`/镜像行） |
| workspace / clone / port | `D:\_tmp\slv-phase5\slvp264-ws`（库根 `VibeMath/`）、clone `slvp264`、port **19811** |
| drive 时长 / token | `durationSec 3381`（56.35 min）；`tokenTotal 23 698 259` / cap `80 000 000`（29.6%）；`transcriptEvents 288`；`toolCalls 47`（【A】核：office 会话 journal 47 条 `tool/call`；【O】写「≈38」是错） |
| jsonl | `D:\wd\vibemath开发\_oneoff\vm-slv\full-1113-050929.jsonl`：**66 160 360 B / 129 184 行**【D 用 `ls`+`wc -l` 复算】 |
| 会话 | **7**：5 成员（r-acad/r-1/r-2/r-3/r-temp）+ 1 所办（`session-6984a0e2…`）+ 1 起跑探针（`session-2acf870a…`）；7 份 journal 各 1 条 `run-metadata` 帧（build `d492dc8c`）【A/D】 |
| 收尾（TB-2766 v3） | `run84-metadata.json` `postDrive:{inspect:"exit=1", stamped:"ok", cleanup:"done"}`、`journalStamped:true/count:7`；`run-inspect-slvp264.log` 161 269 B；watchdog `RUN-ENDED`（21 轮最低 free 2.05 GB，闸 0.8 未触）；clone 已清、port 19811 无监听【A/D】 |
| 产物 | `SIM-REPORT82.md` 8b5357… / `FEEDBACK82.md` 030d23… / `PROGRESS82.md` d84852…；PDF `Paper/paper-p1/paper-p1.pdf` 131 793 B；`paper-p1.log` 23 条 `Missing character`；副本在 `D:/_tmp/run-lane/run84-evidence/`（MANIFEST 含 sha256） |

---

## 2 office 自报的错误清单（本页把它当被审对象；全部有第一手反证）

| # | office 写法（`SIM-REPORT82.md` / `FEEDBACK82.md`） | 独立复核的正确读数 | 证据 |
|---|---|---|---|
| 1 | **build「未测」**（写 `NO-EVIDENCE/PRODUCT-MISSING`：工作区不是 git 仓库） | **build = `d492dc8c`**：`run84-metadata.json` 与 7 份 journal 的 `run-metadata` 帧逐字一致；「所办读不到」≠「本轮无此读数」 | 【A】【D】 |
| 2 | `toolCalls ≈ 38`（含「3 次 pwsh」） | **47**（driver done 行 `toolCalls:47`；office journal 47 条 `tool/call`，其中 5 条 pwsh） | 【A】【D】 |
| 3 | 会话数 **「5 + 1」** | **7**（5 成员 + 所办 + **起跑探针会话**） | 【A】【D】 |
| 4 | 同一 board 读数 `acts:6`（SIM）vs `acts:5`（FEEDBACK D7） | 同一时刻（seq164）是 **`memberActs:4 / officeRelayedActs:1 / acts:5`**；`acts:6` 是更晚的 full status（seq204，多次写入之后）——两份文件引了**不同时刻**的同一读数 | 【D】解码 office journal 核 |
| 5 | 「chair 首条 prompt **全文不含**工具块」 | **错**：chair 会话 `3d692508` `system/message` seq8 **含** `【本轮你实际能调用的工具｜chair】1 个：working_directory`；真实情况是 `op:"prompt"` 返回的 memberPrompt 不含 system-prompt 段（**读数面缺口**），不是「chair 没有该块」 | 【A】【R】 |
| 6 | 「`glyphsUnrepaired` 数组**在可读面缺席**（只有计数）」 | **错**：`final` 回执顶层/`math`/`pdf`/`stderrFindings` 四处都有**具名 10 行数组**（合计 23）；缺席的是所办侧 drive 回执的转述 | 【A】【R】 |
| 7 | **V1 判 `NO-EVIDENCE（RULE-UNREACHABLE：不可复现）`** | **错**：两读面都取到了且**互相矛盾**（records `count:22` = own-turn 15 / relayed 7 vs board `acts:5`）⇒ **应判 FAIL（口径缺陷）**；「不可复现」也不在任务书允许的三个 NO-EVIDENCE 原因里；报告同时又在 FEEDBACK82 D7 把它当缺陷报出 ⇒ 同轮两文件自相矛盾 | 【A】【D】 |
| 8 | **V12 判 `NO-EVIDENCE（RULE-UNREACHABLE）`** | 偏保守：成员 r-1 自己会话的 `op:"status"` 回执里 **`memberOps:["status"]` 确实出现**（`93023c6e` seq49）⇒ V12 可判 **PASS**（由 audit4 独立核到） | 【A】【D】 |

> 另有报告准确性小项（P3）：`run-inspect-slvp264.log` 中文是 **mojibake**（UTF-8 文本被 GBK 解码后再以 UTF-8 落盘，如「鈹€」「鍥炴墽」；`encode('gbk')→decode('utf-8')` 可恢复），不影响 RED/SUMMARY 判定（5 个成员会话各 2 条 RED）。

---

## 3 V1–V16 判定表

> 「实测」= 回执字段=原值；【A】audit4 独立 /【R】run-lane 第一手 /【D】本页亲验 /【O】office 自报。`NO-EVIDENCE` 必带三分类；**没有用替代证据把 NO-EVIDENCE 升成 PASS**。

| 验点 | 实测（回执字段=原值 / 独立证据） | 判定 | 备注 |
|---|---|---|---|
| **V1** 归因同源 | 同回合两读：`vibe_vmu_records{list}`（office seq159）`count:22`，按行 = **own-turn 15 / relayed 7 / unknown 0**（【D】解码核）；`vibe_vmu_turn{status,detail:"board"}`（office seq164）`memberActs:4, officeRelayedActs:1, unknownActs:0, acts:5, provenActs:5, memberTurns:3, memberShare:0.8`（【D】）。**22 行无法重算成 acts:5**；`acts:6` 是更晚的 seq204（【O】误引） | **FAIL**（两读面互矛盾、缺换算键） | office 写 `NO-EVIDENCE（不可复现）` 是**错误分级**（【A】§5.2）；报告与 FEEDBACK 又各报一个时刻的 acts（6/5）⇒ 见 §10 教训 |
| **V2** 状态板/蓝图进正文 | `op:"prompt",member:"r-acad"` 4 页读到 `done:true`（`chars:29829`、`pages:4`）；`statusBlockIncluded:true`、`statusBlockChars:972`、`promptFor.turnMember:"r-acad"`（【D】解码 seq74）；正文含 `[状态板]` 四行与 `[蓝图] 无现行版（rev 0，md 未落盘）`；board 的 `liveReadings.blueprint` 是**更晚**的 `rec-13`（21:37 才有草案）（【O】+【D】片段） | `PASS`（状态板/注入半）/ **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（「同值同刻」半：t-1 装配早于 rec-13，同一瞬间的 prompt+board 未捕获） | 【O】自己标了「同刻对照未取」；不升格为完整 PASS |
| **V3** `prompt` 认 `member`（不一致拒） | 正例 `promptFor.member:"r-acad"`；**不一致调用**（`turn:"t-10", member:"r-acad"`）⇒ `ok:false`、`code:"VMU_INVALID_ARGUMENT"`、message「turn t-10 is seat r-1's prompt, not r-acad's…」、hint 给两条 `REACHABLE INSTEAD:`（【D】office journal 原文命中；【O】同） | **PASS** | RUN 81 的 V3 缺口本轮补上（构造了不一致调用） |
| **V4** `step` 三支 | ①`turns` 12（`counts.opened:12`）；②成员 `op:"step"` 具名拒（见 V12）；③park 后裸 step ⇒ `{ok:true, completed:true, turn:"t-8", instructionDelivered:false, receipt.round:null}`（【O】+【A】摘要） | **PASS** | 第三支形状与任务书逐字一致 |
| **V5** `receiptsView` 跨内核 | 回执：`readFrom:"durable-fold"`、`inProcessRingCount:0`、`available:2`（【D】解码 seq69 核到 `readFrom`/`inProcessRingCount`）；office 报 `count:2`；磁盘 `state.json keys.meetings` digest `b6857229:122991`（【O】） | **PASS** | 首读 `count` 曾是 0（run-lane 抽取 seq69），office 报后一次 2——`count` 随会议数增长，`readFrom`/`inProcessRingCount` 两源一致 |
| **V6** 议程（主席自拟 + 同传拒） | m3：`agendaInputShape:"string"`、**`agendaSplitMode:"bracket-aware"`**、`agendaSplitUnbalanced:null`、`agendaItems` **恰 3 条**（括号/引号内全角「；」未切）（【D】r-acad journal seq57 +【O】）；同传 ⇒ `VMU_MEETING_AGENDA_CONFLICT` + `reachableInstead`（【O】） | **PASS** | `agendaSource:"argument"` 原值未在主席回执出现 ⇒ 小口径缺口，不改变 3 项切分结论 |
| **V7** 互审票绑正文 | `review of:"r-2"` ⇒ rec-27、`judgedPartFingerprint:"4a5a983e…c966ab"`、`judgedPartRound:1`、`stalePart:false`（【D】r-acad journal seq202 核到）；rec-25/rec-30 同型（【O】） | **PASS**（带具名矛盾） | 同一 `advance` 的 `reviewsRead` 又把 rec-25/27/30 判 `stalePart:true` 且两串指纹相同，而 coverage 判 covered ⇒ **D-4 复现 / D-1 半修**，单列 §8 |
| **V8** 未测≠没有 | 定稿前 `toolchainProbe:"not-run"`、`toolchainAbsent:[]`、`pdfCompiled.produced:false` + **`blockedBy:"not-finalized"`**（【D】seq129 核到）；`final` 后 `toolchainProbe:"ran-present"`、`latexAvailable:true`（【O】+【A】） | **PASS** | `not-run` 未被读成「没装」 |
| **V9** `vote_solved` 不单独计票 | 首回执（office seq149）**`keptNow:false`**、`keptWhy:"tool-visibility-unprovable"`、`fieldsKeeping`、`countedLater.notCountedFields:["vote_solved"]`（【D】解码核）；`votesCast` 4→4（【O】） | **PASS** | caller 通道本轮**未声明 `mounted_tools:"none"`** ⇒ 机制在但通道仍未启用（见 §8 D-8） |
| **V10** 通知块四键（全量） | office 报 **12 行全核**（t-1…t-12，`namedEmpty===(lines===0)` 12/12 成立；宿主另吞 5 484 B 但 12 行均在回执内可读）；本页对 full status 回执的 JSON 解析被宿主中段 `[...]` 打断（【D】未能整条 parse） | **PASS**（office 自报 · 全量 12 行；本页未独立复算） | 不把「本页没复算」写成「office 错」；但**宿主 `[...]` 会拦整条 JSON.parse**，复核须逐字段正则 |
| **V11** board 面有界 | board（office seq164）`receiptMeta:{originalBytes:9321, truncated:false}`（【D】解码核）；full `originalBytes:56398`、`truncated:true`（【O】）；比值 **6.05×** | **PASS** | 与 RUN 81 的 9 285/61 990 同量级 |
| **V12** 成员面动作边界（成员自读） | 成员 r-1 在**自己会话**调 `vibe_vmu_turn{op:"status"}` ⇒ 回执含 **`memberOps:["status"]`** + `memberOpsMeans`（【A】D-9 +【D】r-1 journal `93023c6e` seq49 原文）；成员 `op:"step"` 被拒 `VMU_NOT_PERMITTED` + hint 点名 `status` | **PASS** | 【O】判 `NO-EVIDENCE` 偏保守；本判据用 audit4 第一手 journal 原文，非替代证据 |
| **V13** 蓝图草案口径 | 可证：蓝图为 `rec-13`（`status:"draft"`、`revision:1`、`mdPath:"Shared/Drafts/tech-route-r1.md"`、`draftMdMissing:false`、`mdFingerprint:"sha256:7e3c1a59…2dd1"`，【O】+【A】读盘核）；`state` 面键 `hasCurrent:false`/`currentRevision:0`（【D】r-2 journal seq19 核到）。**首支 `filed:false`/`draftMdMissing:true` 的原值未取** | `PASS`（state 半）/ **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（propose 首支） | 不把「未取首支」升为完整 PASS |
| **V14** 结题链与 PDF sha | 票（office seq139）：`votesCast:4, votesTotal:4, votesFor:0, votesAgainst:4, missing:[], notEligible:[{member:"r-temp",solved:false,why:"no-closure-vote-permission"}]`（【D】）；`render`（r-acad seq300）`recordIds:{md:"rec-32", tex:"rec-33", meta:"rec-34"}`、`renderOk:true`（【D】）；`final`（seq295）`pdf:{produced:true, recordId:"rec-35", pdfBytes:131793, engine:"xelatex"}` —— **该块没有 `pdfSha256` 键**（【A】grep `Sha256`=0）；磁盘 sha `a1bd3f37…bef4a` = `state.json` `rec-35.body.pdfSha256`（【D】`sha256sum`+读盘逐字相等）；**final→render 之后无任何 `status` 调用** | **`PASS`（实质）/ `NO-EVIDENCE` / `RUN-DID-NOT-REACH`（5 字段）** | 5 字段 = `finalPdfRecordId`/`finalPdfBytes`/`finalPdfSha256` + `pdfCompiled.diskPdfSha256`/`pdfSha256MatchesDisk`；已有 status 全是 final 前（`produced:false`/`blockedBy:"not-finalized"`）⇒ **不许用「磁盘=ledger 行」替证** |
| **V15** PDF 无缺字（TB-2768） | PDF（pymupdf 1.28.2）：7 页、6 161 字符、**`U+FFFF=23`**、`U+FFFD=0`、页分布 **[4,7,2,2,8,0,0]**（【D】我亲跑 +【A】【R】）；`pdftotext` 交叉 23；`paper-p1.log` **23 条 `Missing character`**（【D】`grep -c`）；回执 `glyphLossDetected:true`、`missingCharacterCount:23`、`glyphLossCode:"VMU_PAPER_GLYPH_UNCOVERED"`、`logRead:true`，`glyphsUnrepaired` 10 行具名（和=23）（【A】【R】）；缺的字 `∉⌊⌋①②③④⑤`（10 行/8 distinct，含 bold/regular 两字体）与 RUN 81 的 6 个 **交集为空** | **FAIL** | **检测链 ✅ / 覆盖链 ❌ = 半修**：TB-2768 不能算「已修」，但也不能算「完全没修」；TB-2772 = 替换表第二轮 |
| **V16** 成员同源块名集 == wire 名集（TB-2770） | 5 个成员/临时工首回合 `header.tools` **全 79**（`vibe_*` **69**），块却是 **「1 个：`working_directory`」**（块内 `vibe_*` 名集 = 空）；**同一请求内即矛盾**：r-1 `seq31 块=1 ↔ seq32 header=58`、`seq162=1 ↔ seq164=79`、`seq171=1 ↔ seq172=58`（【A】【R】）；源头 `agent.ctx.tools.schemas()` 装配期只返回 1 个，`out.tools` 在子会话为 null，**`wireSource` 无任何可读诊断**（`PRODUCT-MISSING`）；块里「wire 快照」句仍是假事实；每个 step 都错（不是一次性首装配过期） | **FAIL** | TB-2770 **约 1/3 生效**：假否定「0 个」没了、`wire-unknown` 兜底与「空表不写缓存」已加；但块仍非 wire。TB-2773 = 第二轮 |

---

## 4 独立对账（本页亲验 vs 转抄）

> 【D】= 本页实际复算/解码；【A】= audit4；【R】= run-lane；【O】= office。

| 对账项 | 读数 | 方法/证据 | 来源 |
|---|---|---|---|
| PDF 字节 / sha256 | **131 793 B** / `a1bd3f3756b04a6db6c8fea61e4262d8d9e4520abfc47ceb75ee464de74bef4a` | `sha256sum`；`%PDF-1.7`、`startxref`、`%%EOF`（【A】） | 【D】 |
| PDF 文本 `U+FFFF` | **23**（7 页；每页 [4,7,2,2,8,0,0]；`U+FFFD=0`） | pymupdf 1.28.2 我亲跑 | 【D】 |
| `paper-p1.log` `Missing character` | **23** 行 | `grep -c`；行号 728–804【A】 | 【D】/【A】 |
| ledger `rec-35.body` | `pdfBytes:131793`、`pdfSha256:a1bd3f37…ef4a`、`glyphLossDetected:true`、`missingCharacterCount:23` | 直读 `state.json` 并 parse body | 【D】 |
| 驱动 done 行 | `durationSec:3381`、`tokenTotal:23 698 259`、`transcriptEvents:288`、`toolCalls:47`、`tokenCapHit:false` | `run84.drive.log:90` | 【D】 |
| jsonl | **66 160 360 B / 129 184 行** | `ls` + `wc -l` | 【D】 |
| 会话 / journal 盖章 | **7 个会话**、7 份 journal 各 1 条 `run-metadata` 帧（`build:"d492dc8c"`） | 目录计数 + 解码首行 | 【D】/【A】 |
| `closureVote` | `votesCast:4/votesTotal:4/votesFor:0/votesAgainst:4/notEligible r-temp` | office journal seq139 解码 | 【D】 |
| `render.recordIds` | `{md:"rec-32",tex:"rec-33",meta:"rec-34"}`、`renderOk:true` | r-acad journal seq300 解码 | 【D】 |
| `final` 是否有 sha | **无 `pdfSha256` 键**（`Sha256` 全文件 0） | 【A】grep；【D】未见 | 【A】 |
| V1 两读面 | records seq159 `count:22`（own 15/relayed 7/unknown 0）；board seq164 `acts:5`（`memberActs:4`+`officeRelayedActs:1`） | office journal 解码 | 【D】 |
| V2 prompt | seq74 `statusBlockChars:972`、`statusBlockIncluded:true`、`done:true`、`chars:29829`、`pages:4` | office journal 解码 | 【D】 |
| V9 首回执 | seq149 `keptNow:false`、`keptWhy:"tool-visibility-unprovable"` | office journal 解码 | 【D】 |
| V5 `receiptsView` | seq69 `readFrom:"durable-fold"`、`inProcessRingCount:0` | office journal 解码 | 【D】 |
| V7 指纹 | r-acad seq202 `judgedPartFingerprint:"4a5a983e…"`、`judgedPartRound:1`、`stalePart:false` | r-acad journal 解码 | 【D】 |
| V13 `state` 键 | r-2 journal seq19 `hasCurrent:false`、`currentRevision:0` | 成员 journal 解码 | 【D】 |
| V12 `memberOps` | r-1 journal seq49 `memberOps:["status"]` | 成员 journal 解码 | 【D】/【A】 |
| TB-2766 v3 | `postDrive{inspect:"exit=1",stamped:"ok",cleanup:"done"}`；`journalStamped:true/count:7`；inspect 161 269 B；watchdog `RUN-ENDED`（21 轮最低 2.05 GB，闸 0.8）；clone 无、port 19811 无监听 | `run84-metadata.json`/`run84.watchdog.log`/`run-inspect-slvp264.log`/`netstat` | 【D】/【A】|
| 15/16 细节 | 见 §3（pymupdf/pdftotext/回执三方 23/23/23；块=1 vs wire 79、同一请求 seq31↔32 等） | audit4 解码 + run-lane 首手 | 【A】/【R】 |

---

## 5 汇总口径（行数自洽：10 + 3 + 3 = 16；V 表 ENV-LIMIT = 0）

- **10 完整 PASS**：**V3 / V4 / V5 / V6 / V7 / V8 / V9 / V10 / V11 / V12**
- **3 带局部 NO-EVIDENCE**：**V2**（「同值同刻」半，`RUN-DID-NOT-REACH`）、**V13**（propose 首支，`RUN-DID-NOT-REACH`）、**V14**（status 五字段，`RUN-DID-NOT-REACH`；实质链 PASS 另记）
- **3 FAIL**：**V1**（两读面互矛盾，缺换算键）、**V15**（PDF 仍 23 个 `U+FFFF`；TB-2768 半修）、**V16**（块「1 个」vs wire 79；TB-2770 半修）
- **V 表 ENV-LIMIT = 0**；环境侧仍有 `bash(MSYS)` 不可用、所办侧 token/transcript 不可读（§9，非验点）
- **与 office 自报（10 PASS / 2 FAIL / 4 NO-EVIDENCE）的差异及原因**：
  1. **V1：NO-EVIDENCE → FAIL**（两读都取到且互矛盾；「不可复现」不是可用的 NO-EVIDENCE 原因；audit4 §5.2）。
  2. **V12：NO-EVIDENCE → PASS**（r-1 自己会话的 `memberOps:["status"]` 在 journal 原文里，office 只是「所办读不到」；这是读面可达性问题，不是产品缺键）。
  3. **V14：PASS → PASS（实质）+ 5 字段 NO-EVIDENCE**（final 后未调 status；不许用「磁盘=ledger 行」替证）。
  4. V2/V13 维持 NO-EVIDENCE；V15/V16 FAIL 与 office 一致（但**理由按审计改写**：TB-2768/2770 是半修，不是「未修」/「未实现」）。
  5. office 的 V15 三路读数（23/23/23）本身正确，但它「`glyphsUnrepaired` 缺席」的表述与 V16「chair 无块」都是**读数面误读**（§2）。

---

## 6 TB-2766 v3 首次真机实测：**PASS**

| 检查项 | 证据 | 判定 |
|---|---|---|
| `postDrive` 三键 | `run84-metadata.json`：`{inspect:"exit=1", stamped:"ok", cleanup:"done"}`；`postDriveAt`/`journalStampAt`/`completedAt` 三时刻齐全 | PASS |
| journal 盖章 | `journalStamped:true, journalStampedCount:7`；独立核 7 个会话目录各 1 条 `run-metadata` 帧（`build:"d492dc8c"`） | PASS |
| §7 inspect 诉盘完整 | `run-inspect-slvp264.log` **161 269 B**；6 个 session 段（5 成员 + 所办）、结尾 `SUMMARY: 6 session(s) in 1 file(s), 5 with RED checks` + `[slv-inspect exit code: 1]`（`exit=1` 是判据要求，不是崩） | PASS（内容有 P3 编码缺陷，见 §2 备注） |
| 看门狗无 kill | `run84.watchdog.log`：v3 `minFreeGB=0.8`、21 轮最低 `free_GB=2.05`（从未触闸）、`badHits=0 consecutiveBad=0`；`run84.WATCHDOG-RUN-ENDED.json`：`verdict:"RUN-ENDED"`（无 kill/abort 字段） | PASS |
| clone / 端口 | 只有 `slvp264-ws`、无 clone 目录；driver `cleanup: clone_gone=True port_listening=False`；现网无 19811 监听 | PASS |

---

## 7 RUN 81 遗留 D-1…D-9 本轮复现情况（【A】§6）

| 条目 | 本轮证据 | 判定 |
|---|---|---|
| D-1 覆盖门绑 round | `advance`（r-acad seq290）coverage 已绑指纹（`covered:[rec-25,rec-27,rec-30,rec-17]`、`missing:[]`，rec-17 带 `countedFromEarlierRound:true`/`means:"…binds the TEXT, not the round number"`）；**但同回执 `reviewsRead` 仍按 round 判 stale** | **半修 + 复现（并入 TB-2774）** |
| D-2 两个作废名单 | `voidReviews` 按 `why` 分组 + `count` 的「唯一读面」已存在，`invalidatedByRound`/`staleReviews` 为过滤视图；本轮 14 处 `voidReviews` 全 `[]`，**无非空样本** | 形状已修；非空样本 `NO-EVIDENCE` |
| D-3 蓝图 `mdHasMarker` | 本轮 md 首行 = `# 技术路线蓝图 r1`（无 `## 共同设计补充｜<id>` 标记）；`mdHasMarker:false` 正确；`mdFingerprint` 与磁盘 md sha 逐字相等 | **未复现（RUN-DID-NOT-REACH：无带标记来稿）** |
| D-4 相同 sha 说「≠/被替换」 | **复现**：`advance`（seq290）`reviewsRead` rec-25/27/30 三条 `judgedPartFingerprint` 与 `currentFingerprint` **逐字相同**却 `stalePart:true`、文案「the text it judged was replaced」；同回执 coverage 又把同一批判 covered | **复现（FAIL）→ TB-2774** |
| D-5 `round` vs `updatedRound` | `advance`（seq214）`round:2/updatedRound:2/updatedRoundSameAsRound:true` + `updatedRoundMeans`；status（seq283）一致 | **已修（PASS）** |
| D-6 议程括号 | m3 单串含两分号、第二项 `（(2k−1,2k) 的界；再看配对）`：`agendaItems` 恰 3、`agendaSplitMode:"bracket-aware"`、`agendaSplitUnbalanced:null`；括号内全角「；」未切 | **已修（PASS）** |
| D-7 `create description` 无 `owner` | 本轮无 `vibe_v5_task_create` 带 `description` 的调用；note 仍写 `when owner is set` | **NO-EVIDENCE（RUN-DID-NOT-REACH）** |
| D-8 caller 模式 `vote_solved` 通道 | 机制已存在并文档化：`vibe_vmu_turn` 的 `mounted_tools`（唯一值 `"none"`；`kernel/turn/index.js:3809-3828,4471-4487`、`docs/03-interface-contract.md:172`）；本轮 caller 代转**没有声明** ⇒ 首回执仍 `keptNow:false/keptWhy:"tool-visibility-unprovable"`，新增 `mountedToolsDeclared:null`；结题票 4/4 未变（不伪造） | **机制已修 + 未启用（半修/NO-EVIDENCE）** |
| D-9 成员 `status` 无 `memberOps` | **已修**：r-1 自己会话 `93023c6e` seq49 `memberOps:["status"]` + `memberOpsMeans` | **PASS** |

---

## 8 缺陷去向表

| 来源 | 摘要 | 去向 |
|---|---|---|
| **本轮 P0** | 成员同源块**同一请求内**与 wire 矛盾（块「1 个」vs header 58–79；`wireSource` 不可读） | **TB-2773**（已立，host-lane） |
| **本轮 P0** | PDF 缺字第二轮：检测链生效但替换表只覆盖 attempt-3 的 6 个字符，本轮丢 23 处（`∉⌊⌋①②③④⑤`） | **TB-2772**（已立；TB-2768 的续） |
| **本轮 P1** | `advance` 回执 `reviewsRead` 判 stale 与 `perRoundReviewCoverage` 判 covered 同屏相反；两串相同指纹称「replaced」（D-4 复现 / D-1 半修） | **TB-2774**（已立） |
| **本轮 P1** | `final` 回执 `pdf` 块不含 `pdfSha256`（只有 recordId/pdfBytes），使「回执自证文件一致」在 final 面断链；status 五字段验收因此 RUNDID-NOT-REACH | 并入 **TB-2772** / V14 的 5 字段复验要求 |
| **本轮 P2** | V1 两读面无法互算（缺具名换算键）⇒ 本轮判 FAIL；office 误记 NO-EVIDENCE，且两文件引不同时刻 acts | 归入 **TB-2765 口径族**（建议 Lead 并入或另立） |
| **office 另报** | FEEDBACK82 D4（`formal` 教法与面实参不一致）/ D5（`part` 在 reviewing 阶段不可补而同刻 `missing`）/ D6（`writtenFrom` 在无作者行上下结论） | 待 Lead 归并（**本轮未由审计独立复核**，按 office 自报登记） |
| **已闭环** | TB-2766（看门狗 post-drive/驱动抗杀/inspect 落盘）v3 首次真机 **PASS** | 关闭 |
| **降级/保留** | TB-2767（toolchainProbe 矛盾）已降级为 V8 复核埋点；TB-2769（objective 两来源）仍观察 | 保留 |

---

## 9 未闭合与 `ENV-LIMIT` 清单

1. **V14 的 5 个验收字段未取**：`finalPdfRecordId`/`finalPdfBytes`/`finalPdfSha256` + `pdfCompiled.diskPdfSha256`/`pdfSha256MatchesDisk`（final→render 后无 `status` 调用）⇒ `NO-EVIDENCE / RUN-DID-NOT-REACH`；下一轮定稿后**必须再调一次 `status`**并把五字段贴进报告。
2. **V15 只到文本层**：`U+FFFF`/日志/回执三方 23/23/23；**未做字形级渲染核验**（缺字位置是否恰为公式、`where` 行号与 `.tex` 对应）。
3. **V2 / V13 各一「半」未取**：V2 的同刻 prompt+board；V13 的 propose 首支 `filed:false`/`draftMdMissing:true` 原值。
4. **token/transcript 两个口径**：office 侧**不可读**（「未测量」）；驱动侧 `23 698 259` / `288`——**不可把「所办不可读」记成「零」**。
5. **`bash(MSYS)` 不可用**：`NtCreateDirectoryObject(\BaseNamedObjects\…) → 0xC0000022 STATUS_ACCESS_DENIED` ⇒ `ENV-LIMIT`（PS/python 正常，产品不依赖 bash）。
6. **宿主中段 `[...]`**：full status（61 990 B 级别）与部分大回执被宿主插入 `[...]` / `(Omitted N bytes)` ⇒ 复核须逐字段正则，不能整条 `JSON.parse`；V10 的独立复算因此受限（按 office 自报 12 行计）。
7. **D-2 / D-7 / D-3 的非空样本**：本轮 `voidReviews` 全空、D-7 未触发、D-3 无带标记来稿 ⇒ 只能记 `NO-EVIDENCE`，不能写成「已验」。
8. **`run-inspect-slvp264.log` 中文 mojibake**（UTF-8→GBK 双重编码，包装脚本 P3）⇒ 影响可读性、不影响 RED/SUMMARY；需修包装脚本。

---

## 10 教训

1. **「半修」也要判 FAIL**：TB-2768 的检测链做好不等于交付合格——PDF 文本仍有 23 个 `U+FFFF`、`final` 仍 `finalized:true/complete:true`。TB-2770 去掉「0 个」假否定后仍写「1 个」而 wire 有 79 个，仍是假事实。**detection ✅ / coverage ❌ 的正确写法是 FAIL（半修），不是「已修」也不是「未修」。**
2. **验收字段没取 = NO-EVIDENCE，不许用替代证据升格**：V14 的 `status` 五字段没取，run-lane 用「磁盘 sha == ledger 行 sha」做实质替证——实质链成立（可另记 PASS 理由），但验收表点名的字段仍是 `NO-EVIDENCE/RUN-DID-NOT-REACH`；RUN 81 曾真读 `status` 判 PASS，本轮**标准不许降级**。
3. **office 自报至少有 8 处读数/判定错误**（§2）：build「未测」、toolCalls 38 vs 47、会话 5+1 vs 7、acts 6 vs 5、chair「无块」、`glyphsUnrepaired`「缺席」、V1 误记 NO-EVIDENCE、V12 偏保守误记 NE。**自报只能当被审对象**；凡「不可读」要写「本所不可达」，不能写成「产品缺该件」。
4. **抽查式 pin 与「同一请求内自洽」是两件事**：V16 的块「1 个」如果只抽一条 system/message 看，会以为只是「首装配快照过期」；把同一请求的 `request/header` 对齐后才看到 `seq31 块=1 ↔ seq32 header=58` 是**每个请求都错**。**验收的「同回合」必须落到请求/回合粒度，不能用「大致同期」代替。**
5. **宿主 `[...]` 是读数的一部分**：full status 中段被吞后 JSON 不可解析；审计要按字段正则，报告要贴 `receiptMeta`/被吞位置，不能把「我 parse 失败」写成「产品没给」。
6. **「不测试」与「测试了但半修」要分开记**：V15/V16 都是**真机跑到了位**，不是没测；它们的 FAIL 比 NO-EVIDENCE 更硬——不能因为「反正要下一轮」而软化成 NE。

---

## 11 证据路径总表

- **独立复核**：`D:/_tmp/audit4-lane/AUDIT4-REPORT.md`；自写解码器 `decode.cjs` 与 7 份解码 journal（`3d692508…`/`93023c6e…`/`7115dee5…`/`53da2580…`/`5f66db34…`/office/probe）。
- **run-lane 第一手**：`D:/_tmp/run-lane/RUN82-V15-GLYPHS.md`、`RUN82-V16-BLOCK.md`、`run84-evidence/MANIFEST.md`（含 sha256）；中间件 `run84-pdf-uffff-rows.json`、`run84-glyph-receipt.json`、`run84-missing-character-full.json`、`run84-v16-exact-blocks.json`、`run84-wire-r-*.json`。
- **驱动/收尾**：`D:/_tmp/slv-phase5/run84.drive.log`、`run84-metadata.json`、`run84-preflight.json`、`run84.gate.acceptance.json`、`run84.monitor.log`、`run84.watchdog.log`、`run84.WATCHDOG-RUN-ENDED.json`、`run84.driver.exitcode.txt`、`run-inspect-slvp264.log`（161 269 B）。
- **jsonl / journal**：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-050929.jsonl`（66 160 360 B / 129 184 行）；`D:/_tmp/slv-phase5/sessions/--D-_tmp-slv-phase5-slvp264-ws--/`（7 个，各含 `run-metadata` 帧 build `d492dc8c`）。
- **workspace**：`D:/_tmp/slv-phase5/slvp264-ws/`：`SIM-REPORT82.md`/`FEEDBACK82.md`/`PROGRESS82.md`、`Paper/paper-p1/{paper-p1.pdf,paper-p1.tex,paper-p1.log}`（log 23 条 `Missing character`）、`VibeMath/vmu/state.json`（`rec-35.body` = PDF sha/字节）。
- **任务书**：`D:/wd/vibemath开发/taskbooks/TB-2771-run82-brief.md`（第 82 次任务书，sha256 `29dfa0e3…`；合成件 `task-sim82.txt` sha256 `064eedf0…`）；本轮修复书 `TB-2772/2773/2774`。
- **本页复核脚本**：`D:/_tmp/doc-lane/extract82*.mjs`、`office.jsonl`/`probe.jsonl`（解码缓存）。

---

## 12 结论一句话

**RUN 82 attempt-1 可结算为「build `d492dc8c` 在真机上跑通收尾链（TB-2766 v3 PASS：无内存闸杀、7/7 journal 盖章、inspect 完整、clone 已清），但两条 P0 都只半修：TB-2768 检测链生效而字形覆盖不足 ⇒ V15 FAIL（PDF 仍 23 个 `U+FFFF`）；TB-2770 去掉「0 个」却仍写「1 个」而 wire 有 79 个 ⇒ V16 FAIL；V14 实质 sha/字节/票 4/4 成立但 status 五字段未取（NO-EVIDENCE）；另新发现 `advance` 的 `reviewsRead` 与 coverage 同屏矛盾（D-4 复现 / D-1 半修，TB-2774）与 `final` 回执不含 PDF sha。」**
