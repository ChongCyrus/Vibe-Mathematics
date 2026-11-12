# RUN 81 真机核对记录（三次 attempt：attempt-1 setup 阻断 / attempt-2 VOID / attempt-3 成功到 §7 被看门狗误杀）

> **这是记录，不是证据。** 证据在第 81 次那批会话 journal、`run8*.drive.log`、run-lane 报告与 `slvp263-ws/` 的原始产物里；本页把读数、验点判定、缺陷去向与未闭合事项留档，方便后来人对照。
>
> 一句话结论：**attempt-3 的 drive 部分成功**（`DRIVE exit=0`，67.2 min，驱动侧 `tokenTotal 42 321 382`/cap 80 M 未触顶，论文第一次走到 `finalized`+`render`+磁盘 PDF 114 442 B）；按 **audit3 定稿 = 11 完整 PASS / 3 局部 NO-EVIDENCE / 0 FAIL / 0 ENV-LIMIT**（§4）。**头号缺陷是 office 完全没报、audit3 独立抓到的 P0：PDF 静默丢字 16 处而回执报成功（TB-2768，§5）**。收尾被看门狗 `MEMORY-LOW` 误杀（§6，TB-2766 已修）；attempt-1/2 不是有效轮次（§0）。

---

## 0 三次 attempt 总记录

| attempt | 起止（北京） | 产物前缀 | build | 结果 | 关键读数 | 证据 |
|---|---|---|---|---|---|---|
| **1** | 00:22:37 → 00:28:08（5.5 min） | `run81.*` / clone `slvp261` / port 19805 | `015dc001` | **setup 阻断，exit 6**（驱动 fail-fast，未进 drive） | **0 token**（monitor `tokens=-1`）、**无 jsonl**、0 回合 | `run81.drive.log:80-81`（`PREFLIGHT exit=2` + `ABORT: the model route does not answer`）、`run81.monitor.log`、`run81-metadata.json`、`D:/_tmp/run-lane/RUN81-FAILED-SETUP.md` |
| **2** | 01:37:24 → 01:43:16（5.9 min；drive 段仅 34 s） | `run82.*` / clone `slvp262` / port 19807 | `4467bc05` | **VOID**：驱动 `exit 0` 但只跑 1 回合、只做了起跑探针，未立所/无会议/无论文 | `tokenTotal 155 356`/cap 80 M（**0.19%**）、`transcriptEvents 32`、`toolCalls 2`、`durationSec 34`、jsonl 452 020 B / 631 行 | `run82.drive.log:89-90`（`DRIVE exit=0` + done 行）、`run82-metadata.json`（`journalStamped:2`）、`full-1113-013725.jsonl`、`D:/_tmp/run-lane/RUN81-ATTEMPT2-VOID.md` |
| **3** | 01:55:17 → 03:07:46（watchdog 起始 01:55:40；drive 段 67.2 min） | `run83.*` / clone `slvp263` / port 19809 | `4467bc05`（= 当前 HEAD，dirty=false） | **drive exit=0**；§7 `slv-inspect` 期间被看门狗 `MEMORY-LOW` 杀（工具问题，**不是产品缺陷**，§6）；7b/8 未跑 | `tokenTotal 42 321 382`/cap 80 M（`tokenCapHit:false`）、`transcriptEvents 399`、`toolCalls 61`（root 会话口径）、`durationSec 4033`（= 67.2 min）、jsonl **90 735 678 B / 157 693 行**；PDF 114 442 B | `run83.drive.log:86,89,90,94,99`、`run83-metadata.json`、`run83.WATCHDOG-ABORT.txt`、`run83.watchdog.log`、`run83-preflight.json`、`D:/_tmp/run-lane/attempt3-evidence/` |

### 0.1 attempt-1 根因（转抄 run-lane 已取证结论，附其证据路径）
`@deepseek-ai/dsh-tool-subagent-control` 的独立 `list-agents` 子入口在 **DSH 0.2.2-rc.1** 被并进主入口；产品 preset 仍声明旧子路径 `@deepseek-ai/dsh-tool-subagent-control/list-agents`（`vibe-math-vmu/agent.cordis.yml:148-149`、`cordis.patch.yml:193-194`）⇒ `session/create` 回 `agent-preset/invalid … never started` ⇒ 驱动进 drive 前按设计 exit 6（**0 token**，比 RUN 80 跑满 68 分钟才发现问题好）。修复提交 **`4467bc05`**「preset: dsh 0.2.x merged list-agents into the control entry, so the shipped composition drops the dead subpath」（attempt-2/3 均用此 build）。

### 0.2 attempt-2 VOID 根因（转抄 run-lane 已取证结论）
驱动按「session 空闲即完成」正常 exit 0，但 **preamble 设计错误**把「bash 探针 marker 缺失」也当停止条件，且探针与任务书放在同一 prompt：office 严格执行「缺 marker 即停」→ 回报探针并结束回合 → drive 判完成。**不是产品缺陷、不是 DSH/preset 缺陷**。环境发现：服务端 `bash(MSYS)` 在受限沙箱下 `NtCreateDirectoryObject(\BaseNamedObjects\…)` → `0xC0000022 STATUS_ACCESS_DENIED`（**ENV-LIMIT**，产品不依赖 bash）；`powershell.exe` 子进程 `exit code: 0` + `PROBE-PS-OK` 正常。attempt-2 的看门狗 v1 曾**误报** `PROBE-PASS`（扫到了 prompt/args 里的 marker 与失败签名字面量）——已作废，见 `run82.WATCHDOG-PROBE-PASS.json`（**误报证据**，不得用于验收）。

---

## 1 attempt-3 运行元数据

| 项 | 值（来源） |
|---|---|
| build / gitHead | `4467bc05` / `4467bc058c539a1f2ccada5f510ea5a22d10077f`，`buildFrom:"HEAD"`、`dirty:false`、tarball 8 479 583 B（`run83-metadata.json`、`run83.drive.log` `BUILD REV`/`TARBALL build=4467bc05`） |
| release gate | `RELEASE GATE READY`（audit `D:\_tmp\sim\run-2026-11-12T17-23-19-247Z-11860\AUDIT.md`）；起跑前 `run83-preflight.json` **8/8 PASS**（memory 2.69 GB、port/residual 0、task-file sha `01e0384f…`、tree-frozen HEAD `4467bc05` dirty=0、gate receipt tree head == HEAD、dsh `0.2.2-rc.1`、lanes quiet、shell-probe exit 0） |
| provider / model | `dsh-opencode-go` / `deepseek-v4.1-flash`（`run83.drive.log` `MODEL SET`、`run83-metadata.json`） |
| dsh | `0.2.2-rc.1`（`run83.drive.log` 侧 `dsh=0.2.2-rc.1`；`run83-preflight.json` check6） |
| workspace | `D:\_tmp\slv-phase5\slvp263-ws`（文件系统根；库根 `VibeMath/`） |
| 时长 | drive `durationSec 4033` ≈ **67.2 min**（`run83.drive.log:90` done 行）；jsonl 事件跨度 18:00:09.706Z → 19:07:22.519Z = 67.2 min（我按 event time 复算）；启动到 kill 01:55:17 → 03:07:46 ≈ 72.5 min |
| token / cap | **驱动读数 `tokenTotal 42 321 382` / cap 80 000 000（`tokenCapHit:false`）**；**所办侧报告 `tokenTotal 不可读`**（宿主未向所办暴露记账）——两边口径不同，**不可把「所办不可读」记成「零」** |
| transcriptEvents / toolCalls | 驱动 `transcriptEvents 399` / `toolCalls 61`（root 会话口径；我复算 root 会话 event=392、`tool/call`=61，差 7 为驱动额外计数）；全 6 会话合计 `tool/call`=321（我复算） |
| jsonl | `D:\wd\vibemath开发\_oneoff\vm-slv\full-1113-015517.jsonl`：**90 735 678 B / 157 693 行**（`ls`+流式计数，亲验） |
| §6 机器读数（drive.log 原文，**原始计数不是判定**） | `jsonl bytes=90735678 lines=157693`；`NO_FENCE=193` / `UNKNOWN_FIELD=272` / `FIELD_NOT_APPLICABLE=249` / `BAD_JSON=289`（`run83.drive.log:94-98`） |
| 会话 / 席位 | 6 会话（root `session-d9502ede…` + 5 成员子会话）；5 席 `r-acad`+`r-1`/`r-2`/`r-3`+`r-temp`；`vibe_v5_start{researcherCount:3}` ⇒ `hiredNow:["r-acad","r-1","r-2","r-3"]`、`rosterBefore:[]` |
| 产物 | `SIM-REPORT81.md` 31 535 B / `FEEDBACK81.md` 11 422 B / `PROGRESS.md` 6 945 B；PDF `slvp263-ws/Paper/paper-p1/paper-p1.pdf` **114 442 B**；`Paper/paper-p1/paper-p1.log` 34 199 B，**16 条 `Missing character`**（P0/TB-2768，§5）（副本 `attempt3-evidence/paper-p1.pdf`）；三份文件与 PDF 副本已在 `D:\_tmp\run-lane\attempt3-evidence\` |
| 收尾状态 | 7b（journal stamp）/§8（cleanup）**未跑**（§7 被杀）；`run83-metadata.json` 无 `journalStamped`；`profiles/slvp263` 与 `slvp263-ws` 仍在；port 19809 已无监听（§7 未闭合） |

---

## 2 V1–V14 判定表（判定口径按 Lead 裁定：NO-EVIDENCE 不得记 PASS；一半有证据一半没测必须拆写；ENV-LIMIT 单列）

> 「实测」列 = **回执字段 = 原值**（标 `§seq` 的是我从 jsonl 亲验的回执事件序号；标「office 转抄」的是 office 报告原文，我未逐字复核；可在 `full-1113-015517.jsonl` 里按事件 `seq` 检索）。

| 验点 | 实测（回执字段=原值） | 判定 | 备注/建议 |
|---|---|---|---|
| V1 投递路径与归因同源 | **两套口径并列（PASS 但不可按行重算）**：①回执 board `memberWorkShare` = `{memberActs:5, officeRelayedActs:0, unknownActs:0, acts:5, provenActs:5, memberTurns:5, memberShare:1}`（§227，亲验）；②durable `state.json.keys.records` = **58 行**，按行 `writtenFrom` = **own-turn 35 / relayed 23 / unknown 0**（我亲验；office 的 38 行/26/12 是 turn 15 的**中间快照**）。**限制：行宇宙不同（`acts` 计 settled turn 内 reply 字段写，不是行数），「同一行集按行重算」不可复现** | **PASS**（audit3 逐字核 `memberWorkShare`；**带限制**） | ⚠ 只能把「`memberWorkShare` 值本身」判 PASS；「汇总=按行重算」这条**不可复现**（FEEDBACK81 A-1，TB-2765）。不得把 5 与 58/35/23 相减 |
| V2 状态板/蓝图进正文 | **两半都有全文证据（audit3 找到 office 漏掉的全文）**：①`op:"prompt",member:"r-1",limit:9000` ⇒ `chars:30010`、`pages:4`、`done:false`、`statusBlockIncluded:true`、**`statusBlockChars:1442`**（audit3 从 `[状态] 你是 常驻研究员…` 到 `[结题]` 行末 = **恰 1442 字符**精确复现）、`promptFor:{member:"r-1",turnId:"t-20",turnMember:"r-1"}`；②**蓝图半**：r-1 t-20 的完整 30,010 字符 prompt（子会话 `753fc04d` **seq=267** 用户消息，我亲验长度 30,010）含 `[蓝图] id rec-11｜状态 draft｜修订 1｜草案 md 在位（…）（读于 2026-11-12T18:20:44.415Z）`，与 board `liveReadings.blueprint.value`+`at` **同值同刻** | **PASS**（两半） | office 记 `[蓝图]` 半 NE 是**取证不足**（只拉 4 页中的第 1 页），不是证据不存在；`[状态板]` 的「页内教学段」陷阱仍提醒：判块要用全文/自报字段 |
| V3 `op:"prompt"` 认 `member` | `promptFor.member:"r-1"`、`promptFor.turnId:"t-20"`、`promptFor.turnMember:"r-1"`、`promptFor.means`「the seat you named selected its OWN most recent retained prompt」（§324，亲验） | `PASS`（正例半）/ `NO-EVIDENCE` / `RUN-DID-NOT-REACH`（`turn` 与 `member` 不一致须具名拒 —— 本轮**未测**） | 省时跳过；不用别人的拒收充数 |
| V4 `op:"step"` 三支合法结果 | ①**24 条** `turnDelivered:true` step 回执，`turn` 连续 `t-1…t-24`（亲验）；②成员 `op:"step"` ⇒ `ok:false`、`code:"VMU_NOT_PERMITTED"`、message「a member turn cannot run the institute turn engine (op: step)」、hint 含 `REACHABLE INSTEAD:` 点名 `op:"status"`（§，亲验，2 条）；③caller park `t-25` → reply → 裸 `step` ⇒ `{ok:true, source:"tool", completed:true, instructionDelivered:false, turn:"t-25", receipt:{round:null, …}}`（§319，亲验） | **PASS** | 「`turns` 比调用前 +1」的**配对读数未取**：唯一 `status.turns` 读数为 **15**（§227；另 0/1/2/3 是早期读面），回执里**没有** `turns:24`；+1 由连续 `t-1…t-24` 与 24 条 `turnDelivered` 佐证。**office 报告的「turns 15→24」在回执中找不到 24，勿引用** |
| V5 `receiptsView` 跨内核 | 回执：`count:10`、**`available:23`**、`dropped:13`、`ringDropped:0`、**`readFrom:"durable-fold"`**、**`inProcessRingCount:0`**、`sourceDivergenceMeans`「23 durable / 0 in-process」（§329，亲验）；**磁盘对账（audit3 做，我复核成立）**：`slvp263-ws/VibeMath/vmu/state.json` 的 `keys.meetings.value.data.receipts` 解析 = **23 行**（`open 6 / attend 10 / speak 6 / close 1`）= `available:23`；`archive` 里有 `m4`（closed、type closure、typeMatchedBy alias） | **PASS**（回执 + 磁盘；**ENV-LIMIT 解除**） | `inProcessRingCount:0` 不是空账（账在 durable fold，23 行对上） |
| V6 议程字符串路径（F80-2 修后） | ②**两参同传成立**：主席回执 `ok:false`、**`code:"VMU_MEETING_AGENDA_CONFLICT"`**、`agendaInputShape:"string"`、**`materialsSupplied:true`**、`reachableInstead`「`vibe_v5_meeting { agenda: "…" }` — 或 … `{ materials: "…" }` — never both」（§181，亲验）；①单源 `agendaSource:"argument"`、`agendaInputShape:"string"`（§84/§179，亲验）；但**任务书指定的三项串从未被使用**（主席三次自拟），且实测 `agendaItems` 为 4 项、括号内全角「；」被切出「（」「）」空壳（§179/§285 两次可复现） | `PASS`（修后形状半）/ `NO-EVIDENCE` / `RUN-DID-NOT-REACH`（「3 项且第二项不裂」半——指定串没被使用） | 新缺陷 **D-6**：成对括号内全角「；」也被当分隔符；实测切分事实已带原文 |
| V7 互审票绑正文（F80-3） | r-1 审 r-2 `rec-17` ⇒ `rec-26`、`judgedPartFingerprint:"cb611f8ff2dfec40b9a20db6c22965534c768431efdc8ebd5c034730b3753925"`、`stalePart:false`（§100 前部，亲验）；r-2 **替换** §2 ⇒ `rec-31`、`fingerprint:"630b4ee6945ef0f5fda7d21cc8be854e8a70c983b80fac6d19b31fde199ed723"`、`replaced:{recordId:"rec-29",…}`（§197，亲验）；r-1 重投 ⇒ `rec-33`、`judgedPartFingerprint:"630b4ee6…"`、`judgedPartRound:2`（office 转抄）；round-3 三票 `dc1b06f7…`/`41bf3afb…`/`249f5566…`、`stalePart:false`（§454/§520，亲验）；`invalidatedByRound` 非空（`why:"previous-round"`，我复算 19 条回执含该值）与 `staleReviews:[]`+means 并存（office 转抄） | **PASS** | 两个作废名单语义不同且都能为空（D-2）；r-2 的 round-2 票 `rec-35` 被判 `stalePart:true`/`why:"round-changed"`（office 转抄） |
| V8 未测≠没有 | **精确统计（run-lane 最终版，我复核方向一致）**：全部 **32 条** `"toolchainProbe":"not-run"` **都在 `final` 之前**（同一时刻 `pdfCompiled.produced:false`/`blockedBy:"not-finalized"`）；`final` 回执（**§508**）⇒ **`toolchainProbe:"ran-present"`**、`latexAvailable:true`、`pdf:{produced:true, engine:"D:/texlive/2025/bin/windows/xelatex.EXE", pdfBytes:114442, recordId:"rec-56"}`（亲验）；`final` 之后的 `paper status`（**§520**）仍 `ran-present`；**`not-run` + `produced:true` 组合 = 0 条**；无 `liveReadings.toolchainProbe`。**`toolchainProbeSource` 具体值本轮未见**（按实际字段记，不按期望改写；该键只在 ledger-升级分支产生） | **PASS** | **F80-5 修复生效**。早前「5 处 `not-run` + PDF 已产出」是**取样错误**（前 5 个命中全在 `final` 之前）——run-lane 已自我纠正；**TB-2767 已降级为「下一次真机 V8 复核埋点」，不再算缺陷**（不是 FAIL） |
| V9 `vote_solved` 不单独计票（F80-10） | 首回执（`op:"reply"`, `reply_for:"r-temp"`, `report.vote_solved:true`）⇒ `accepted:true`、**`keptNow:false`**、**`keptWhy:"tool-visibility-unprovable"`**、`fieldsKeeping:[{field:"vote_solved", keptNow:false, keptWhy:"tool-visibility-unprovable", reason:"…VMU_MEMBER_SESSION_NOT_LIVE… a reply vote is NOT counted"}]`、`countedLater.notCountedFields:["vote_solved"]`（§319 区域，亲验）；`closureVote.votesCast` 前后均 **4**（§319 终值亲验） | **PASS** | caller 模式结构性读不到成员挂载表 ⇒ `tool-not-mounted` 分支本轮不可达（D-8） |
| V10 通知块四键回归 | audit3 独立复核（**比 office 自报强**）：run seq=227 的 full status 里 **两个 15 行数组共 30 处 `notices` 四键齐全**、`namedEmpty===(lines===0)` **30/30 成立**；`receiptMeta:{originalBytes:61990, truncated:true}`（elided 仅 `status.turnReceiptsMeans`/`turnsUnavailableMeans`）。**注意**：该回执中段被宿主插入 `[...]`（位置 ~24850），**不能整条 `JSON.parse`**，audit3 用逐字段正则取；本页 Node 解析只覆盖其中一个 15 行数组（0 违反），方向一致 | **PASS** | 四键判定有效；复核要按「逐字段正则取」，不能对 full status 整条 `JSON.parse`（§7 host-elision 项） |
| V11 board 面有界 | board `{detail:"board"}` ⇒ `receiptMeta:{truncated:false, originalBytes:9285}`（§222，亲验）；full ⇒ `{truncated:true, originalBytes:61990}`（§227，亲验）；**比值 6.67×** | **PASS** | 与 RUN 79 的 9009/39984 同向：board 更小、full 更大 |
| V12 成员面动作边界 | **拒收侧 PASS**：成员 `op:"step"` ⇒ `ok:false`、`code:"VMU_NOT_PERMITTED"`、message「a member turn cannot run the institute turn engine (op: step)」、hint 含 `REACHABLE INSTEAD:` 点名 `op:"status"`（亲验）。**`memberOps` 侧 = `NO-EVIDENCE / RULE-UNREACHABLE`（不是缺键）**：`memberOps`/`memberOpsMeans` 在 321 条 tool/result 中 0 次出现，但源码 `vibe-math-vmu/tools/turn.js:405` 显示该键**只在 `memberRead` 为真时展开**，而 `memberRead = callerAgentId!=='' && !callerAgentId.startsWith('session-')`（`:387`）；本 run 的 **31 次** `vibe_vmu_turn` 只有 **1 次**来自成员子会话（`753fc04d#93`，`op:"step"`，被拒），**没有任何成员在自己会话里调 `op:"status"`** | `PASS`（拒收侧）/ **`NO-EVIDENCE` / `RULE-UNREACHABLE`**（`memberOps`） | **改判理由**：office 记 `PRODUCT-MISSING` 过重，且它说「r-1 照抄后改走 `op:"status"`」与证据相反（r-1 子会话内无 `op:"status"` 调用）；读面可达性说明并入 TB-2764 降级项 |
| V13 蓝图草案口径 | ①`propose` 不传 `mdPath` ⇒ `filed:false`、**`draftMdMissing:true`**、`mdWritten:false`（§92，亲验）；写 md 后再 propose ⇒ `filed:true`、行 `rec-11`、`codesign.missing:["chair"]`（office 转抄）；②`vibe_v5_blueprint{action:"state"}` 回执 ⇒ **`hasCurrent:false`**、**`currentRevision:0`**、**`mdMissing:true`**（**`753fc04d#39`**，audit3 与本页都核到；亲验） | **PASS** | office 说三键「本轮未出现」是**把两个面混了**：`draftMdMissing`/`revision` 是 `propose` 面的键，`hasCurrent`/`currentRevision`/`mdMissing` 是 `state` 面的键，**两者都在**（§4 引用错误清单） |
| V14 结题链与 PDF sha | 票：`closureVote:{cast:true, confirmed:true, votesCast:4, votesFor:4, votesAgainst:0, votesTotal:4, missing:[], notEligible:[{member:"r-temp", solved:false, why:"no-closure-vote-permission"}]}`（§319，亲验）；`final` 先撞 `VMU_OFFICE_CONSULT_REQUIRED`（`requestId:"consult-0001-de5c"`，`onTimeout:"hold"`）→ consult 后 `cleared:true`（office 转抄）；`final` ⇒ `ok:true`/`complete:true`/`pdf.produced:true`/`recordId:"rec-56"`；`render` ⇒ `renderOk:true`、`recordIds:{md:"rec-53",tex:"rec-54",meta:"rec-55"}`、`qualityGate:{checked:true,ok:true}`（§515，亲验）；`status` ⇒ `stage:"finalized"`、**`finalPdfRecordId:"rec-56"`**、**`finalPdfBytes:114442`**、**`finalPdfSha256:"6465c09cd0ba2990a083c0e456a2e35ff1805f432c987a4aa5a1b0fe22e7839a"`**、`pdfCompiled.diskPdfSha256` 同值、`pdfSha256MatchesDisk:true`、`archiveArtifacts.present{md,tex,pdf,meta}` 全 true（§520，亲验） | **PASS** | 三处 sha256（磁盘 / `pdf` / `finalPdf`）一致、字节数两处一致（§3） |

---

## 3 独立对账段（**我亲验** vs **转抄**）

> 方法：`sha256sum`/`stat` 查磁盘；Node 流式解析 `full-1113-015517.jsonl`（6 会话、去重后 321 条 `tool/result`）提取回执原文；只有回执原文才算「亲验」。

| 对账项 | 读数（亲验） | 方法 / 回执证据 | 类别 |
|---|---|---|---|
| PDF 字节 / sha256 | **114 442 B** / `6465c09cd0ba2990a083c0e456a2e35ff1805f432c987a4aa5a1b0fe22e7839a` | `sha256sum slvp263-ws/Paper/paper-p1/paper-p1.pdf` | **我亲验（磁盘）** |
| `finalPdfRecordId` / `finalPdfBytes` / `finalPdfSha256` | `rec-56` / `114442` / `6465c09c…7839a` | jsonl §520 `status` 回执；与磁盘 sha、字节逐字相等 | **我亲验（回执）** |
| `pdfCompiled.diskPdfSha256` / `pdfSha256MatchesDisk` | `6465c09c…7839a` / `true`（`diskPdfBytes:114442`、`diskFileFromRecord:"rec-56"`） | jsonl §520 | **我亲验（回执）** |
| `closureVote` 4/4 + `notEligible` | `votesCast:4/votesFor:4/votesAgainst:0/votesTotal:4/missing:[]`；`notEligible:[{member:"r-temp", solved:false, why:"no-closure-vote-permission"}]`；`voters` = r-1/r-2/r-3/r-acad | jsonl §319 | **我亲验（回执）** |
| `memberWorkShare` 五计数 | `{memberActs:5, officeRelayedActs:0, unknownActs:0, acts:5, provenActs:5, memberTurns:5, memberShare:1}` | jsonl §227 面 | **我亲验（回执）** |
| `records list` 行数与归因（office 取数时点） | **38 行**：`own-turn 26` / `relayed 12` / `unknown 0`（§215；取数在 turn 15，**中间快照**） | jsonl §215 `vibe_vmu_records{action:"list"}` 回执 | **我亲验（回执）** |
| **durable records 终值（V1 对账）** | **58 行 = own-turn 35 / relayed 23 / unknown 0** | `slvp263-ws/VibeMath/vmu/state.json` 的 `keys.records`（58 条）逐行 `writtenFrom` 重算 | **我亲验（durable store）** |
| **V8 矛盾（最终更正）** | **0 条**：32 条 `not-run` 全部在 `final` 之前（`produced:false`）；`final`（§508）与 final 后 status（§520）均 `ran-present`；早前「5 处」为取样错误（前 5 个命中都在 final 前） | 本页 Node 解析 321 条 `tool/result` 逐条核对（与 run-lane 最终统计一致）；`RUN81-ATTEMPT3-RECONCILIATION.md` 已自我纠正 | **我亲验（回执）+ 第一手已更正** |
| **V2 全文证据（audit3）** | r-1 t-20 prompt（子会话 `753fc04d#267` 用户消息）**30,010 字符**，含 `[蓝图] id rec-11｜状态 draft｜修订 1｜草案 md 在位（…）（读于 2026-11-12T18:20:44.415Z）`；`statusBlockChars` 从 `[状态] 你是 常驻研究员…` 到 `[结题]` 行末 = **恰 1442** | 本页亲验 prompt 长度 30,010 与 `[蓝图]` 片段；audit3 提供精确 1442 复现 | **亲验（长度/片段）+ 转抄 audit3（1442 口径）** |
| **V5 磁盘对账（audit3）** | `state.json` `keys.meetings.value.data.receipts` = **23 行**（open 6 / attend 10 / speak 6 / close 1）= 回执 `available:23` | 本页解析该 JSON 字符串计数；audit3 另核 m4 archived/closure_votes | **我亲验（磁盘）+ 转抄 audit3（m4 归档）** |
| **V10 全量核验（audit3）** | two 15-row arrays = **30 处** `notices` 四键齐全、`namedEmpty===(lines===0)` **30/30** | audit3 逐字段正则（full status 中段被宿主 `[...]` 吃，不能整条 JSON.parse） | **转抄 audit3** |
| **PDF 静默丢字（audit3 新发现，P0）** | `Paper/paper-p1/paper-p1.log` = **16 条 `Missing character`**：ℤ×4 / ∀×2 / ∣×6 / ∩×2 / ∪×1 / ⋯×1，16 行指 `lmroman10-regular`；`.tex` 里字符在正文；`final` 仍 `ok:true, stderrTail:""`。audit3 另用 `pymupdf` 抽 PDF 见 `m\uffffk` 等缺字 | 本页 `grep -c "Missing character"` = 16、`grep -c lmroman10-regular` = 16；audit3 `pdf-full.txt` | **我亲验（log 计数）+ 转抄 audit3（PDF 抽取/tex 对照）** |
| **宿主 `[...]` 副作用** | full status（~24850）与 receiptsView 中段被宿主插入 `[...]`；3 条回执尾部 `(Omitted N bytes)`（11082 / 2854 / 60481）⇒ 整条 JSON 不可解析 | audit3 §6F；本页 Node 解析 full status 也失败（与之一致） | **转抄 audit3 + 本页复核** |
| `receiptsView` | `count:10`、`available:23`、`dropped:13`、`ringDropped:0`、`readFrom:"durable-fold"`、`inProcessRingCount:0` | jsonl §329 | **我亲验（回执）** |
| board vs full `originalBytes` | **9 285 vs 61 990 = 6.67×**（board `truncated:false`；full `truncated:true`） | jsonl §222 / §227 | **我亲验（回执）** |
| full status `turnReceipts` 行数 / notices 四键 | **15 行**；`namedEmpty===(lines===0)` **0 违反** | jsonl §227（逐行解析） | **我亲验（回执）** |
| `op:"prompt"` 自报字段 | `chars:30010`、`pages:4`、`done:false`、`statusBlockIncluded:true`、`statusBlockChars:1442`、`promptFor.member:"r-1"`/`turnId:"t-20"` | jsonl §324 | **我亲验（回执）** |
| F80-10 首回执 | `keptNow:false`、`keptWhy:"tool-visibility-unprovable"`、`fieldsKeeping`、`countedLater.notCountedFields:["vote_solved"]` | jsonl §319 区域 | **我亲验（回执）** |
| `render` `recordIds` | `{md:"rec-53", tex:"rec-54", meta:"rec-55"}`、`renderOk:true`、`qualityGate:{checked:true, ok:true}` | jsonl §515 | **我亲验（回执）** |
| V13 `state` 三键 | `hasCurrent:false`、`currentRevision:0`、`mdMissing:true` | jsonl §39（r-1 回合内 `vibe_v5_blueprint` 回执） | **我亲验（回执，纠正 office）** |
| V6 同传拒收 | `code:"VMU_MEETING_AGENDA_CONFLICT"`、`agendaInputShape:"string"`、`materialsSupplied:true`、`reachableInstead` 原文 | jsonl §181 | **我亲验（回执）** |
| V4 三支 | 24 条 `turnDelivered:true`（t-1…t-24）；2 条成员拒收；第三支 `instructionDelivered:false`/`t-25`/`completed:true` | jsonl（逐条计数） | **我亲验（回执）** |
| V7 指纹与替换 | `cb611f8f…b3753925`（rec-17/rec-26）；`630b4ee6…ed723`（rec-31，`replaced.recordId:"rec-29"`） | jsonl §100/§197 | **我亲验（回执）** |
| attempt-3 jsonl | 90 735 678 B / 157 693 行；事件跨度 67.2 min；6 会话 | `ls` + 流式行计数 + event time 复算 | **我亲验（文件）** |
| attempt-2 读数 | `tokenTotal 155356`、`durationSec 34`、`transcriptEvents 32`、`toolCalls 2`；jsonl 452 020 B / 631 行 | `run82.drive.log:90`、`ls`/`wc -l` | **我亲读日志文件** |
| attempt-1 读数 | `DRIVER EXIT=6 after 5.5 min`、`tokens=-1`、无 jsonl | `run81.monitor.log`、`run81.drive.log:80-81` | **我亲读日志文件** |
| 看门狗 MEMORY-LOW | `FreePhysicalMemory=1.04 GB < -MinFreeGB=1.2 GB`，abort `03:07:46`，`last bad shell lines` 空 | `run83.WATCHDOG-ABORT.txt`、`run83.watchdog.log` cycle 25 | **我亲读文件** |
| attempt-1 根因（preset 子入口合并） | `agent-preset/invalid … list-agents … never started`；修复 `4467bc05` | `RUN81-FAILED-SETUP.md` + `run81.drive.log` ABORT 原文 | **转抄 run-lane（已附原文）** |
| attempt-2 VOID 因果（preamble 早退） | 1 回合 / 34 s / 2 tool calls；bash `0xC0000022` ENV-LIMIT、PS 正常 | `RUN81-ATTEMPT2-VOID.md` | **转抄 run-lane（已附原文）** |
| V2 正文块半 / `[蓝图]` 半 | 只读第 1 页；`[状态板]` 命中处是教学段 | office 报告 + 我读 §324 文本 | **转抄 + 我复核文本性质** |
| V7 `rec-33`/`rec-35` 细节、`invalidatedByRound` 明细 | `judgedPartRound:2`、`stalePart:true`、`why:"round-changed"`、`previous-round` 两条 | office 报告 | **转抄 office** |
| V13 `propose` 两半细节（`rec-11`/`codesign`） | `filed:true`、`rec-11`、`codesign.missing:["chair"]` | office 报告（我另核了 §92 `draftMdMissing:true`） | **转抄 office（部分亲验）** |

---

## 4 汇总口径（**audit3 定稿**；行数自洽 11 + 3 = 14；V 表 ENV-LIMIT = 0）

- **11 完整 PASS**：**V1 / V2 / V4 / V5 / V7 / V8 / V9 / V10 / V11 / V13 / V14**
  - **V1 带限制**：`memberWorkShare` 值本身逐字核对（audit3 同判），但「同一行集按行重算」不可复现（行宇宙不同：`acts:5` vs durable 58 行 35/23）——PASS 只覆盖前者（§2/§3）
- **3 局部 NO-EVIDENCE（不计入完整 PASS）**：**V3**（`turn`/`member` 不一致拒未测 = `RUN-DID-NOT-REACH`）、**V6**（指定串 3 项计数未测 = `RUN-DID-NOT-REACH`）、**V12**（`memberOps` = **`RULE-UNREACHABLE`**：键只在 `memberRead` 下展开，本 run 无成员在自己会话里调 `op:"status"`）
- **0 FAIL**
- **V 表 ENV-LIMIT = 0**（V5 磁盘对账已由 audit3 完成、我复核成立）；**环境侧**仍记 `bash(MSYS)` 不可用、所办侧 token/transcript 不可读（§7，非验点）
- **与 office 自报「13 PASS」的差异及原因**：
  1. **V2 由「状态板半 PASS + 蓝图半 NE」升为 PASS**：office 只读了 4 页中的第 1 页；全文在 r-1 t-20 的 30,010 字符 prompt（子会话 `753fc04d#267`）里，含 `[蓝图]` 且与 board `liveReadings.blueprint` 同值同刻（audit3 抓到；我复核了 prompt 长度与片段）。
  2. **V5 由 PASS+ENV-LIMIT 升为纯 PASS**：audit3 做了磁盘对账——`state.json` `keys.meetings.value.data.receipts` = **23 行** = 回执 `available:23`（我复核 23 行 = open 6/attend 10/speak 6/close 1）。
  3. **V10 升为 PASS**：audit3 用逐字段正则核 full status 的两个 15 行数组 **30/30** 四键 + `namedEmpty` 一致（注意该回执中段被宿主 `[...]` 吃过，不能整条 JSON.parse）。
  4. **V12 的 `memberOps` 由 `PRODUCT-MISSING` 改为 `RULE-UNREACHABLE`**：不是产品缺键，是该读面只在 `memberRead` 为真时展开（`tools/turn.js:405`/`:387`），本 run 无成员在自己的会话里调 `op:"status"`。
  5. **V1 仍计 PASS 但带限制**：不得把 `memberWorkShare.acts:5` 与 durable 58 行/35/23 相减或互证。
  6. **office 的引用错误（不影响其 PASS 判定）**：V13 三键其实在 `753fc04d#39`；A-4「三次」实为 **4 次**（seq 99/114/120/128）；D-1 的 `covered` 实为 `[{r-1,rec-33,round:2}]`（非空）；D-3 的 `headingDropped` 实为 `0` 不是 null、`mdOwner.sha256` 是磁盘文件 2242 B 的 sha 而不是行内正文 1451 B；D-7 的 note 原文已写「when owner is set」；V12 的「r-1 照抄后改走 status」与证据相反（详见 audit3 §6E）。

---

## 5 缺陷去向表（audit3 复核后定稿；`FEEDBACK81.md` 逐条 → 任务书）

> **命名注意**：本表的 `D-1…D-9` 是 FEEDBACK81 的缺陷编号，**与 `run80-verification.md` 的 D-1/D-2（F80-6/F80-7 勘误）不是同一套**。
> **头号缺陷（office 完全没报、audit3 独立抓到）**：**PDF 静默丢字 16 处而 `final` 回执报成功** ⇒ **TB-2768（P0）**，见下表第一行。

| 来源 | 摘要（audit3 复核结论） | 类别 / 判定 | 去向 |
|---|---|---|---|
| **新 P0 · TB-2768** | **xelatex `Missing character` 16 处（ℤ×4 / ∀×2 / ∣×6 / ∩×2 / ∪×1 / ⋯×1，全指 `lmroman10-regular`）**；`.tex` 里字符就在正文、`math.glyphsRepaired:58` 替换表未覆盖这 6 个字形；`final` 仍 `ok:true, complete:true, stderrTail:""`，回执无法让读者知道 PDF 缺字。三路互证：`.tex` / `paper-p1.log` / PDF 文本抽取（`pymupdf` 见 `m\uffffk` 等）。**office 没报；我另验 `Paper/paper-p1/paper-p1.log` 16 条、16 行 `lmroman10-regular`** | **真产品缺陷（P0，内容丢失且回执不报）** | **`TB-2768`（已立）** |
| FEEDBACK81-D-1 | 论文覆盖门要求「被审节 round == 论文 round」，退回写作 bump round ⇒ 每轮三节重交 | **CONFIRMED（机制）** + **两处证据瑕疵**：office 把 `round:1→2`（`fc937ddd#180`）与 `roundMeans「2→3」`（`9abb1cd6#381`）拼成一条；`covered` 实为 `[{r-1,rec-33,round:2}]` 非空。「多花 7 个成员回合」= **NO-EVIDENCE**（归因不可判） | `TB-2761` |
| FEEDBACK81-D-2 | 同一读面两个作废名单（`invalidatedByRound` vs `staleReviews`）语义不同且都能为空 | **CONFIRMED（同屏逐字）** | `TB-2761` |
| FEEDBACK81-D-3 | 蓝图 `mdHasMarker:false` 与 md 首行 `## 共同设计补充｜r-1` 矛盾 | **NOT-REPRODUCED（作为产品缺陷不成立）**：`mdHasMarker` 指 `- vmuMd：` 文档头标记（`turn/index.js:1994-1996`），纯 markdown 草案设计上没有该头 ⇒ `false` 正确；office 另有两处引错（`headingDropped:0` 非 null；`mdOwner` 是磁盘文件 sha）。**残留口径小坑**：`mdPath` 路径上 `headingDropped/headingDroppedMeans` 是对被丢弃的 `text` 参数算的，与落库 md 正文混在一句话里 | `TB-2762`（**降级**：语义说明 + 读面文案） |
| FEEDBACK81-D-4 | 作废原因打印两个逐字相同的 sha256 却说「≠」（真实原因是轮次） | **CONFIRMED（最硬）**：`9abb1cd6#520.paper.disagreement[1].detail` 与 `#381.reviewsRead[1].means` | `TB-2761` |
| FEEDBACK81-D-5 | `round:3` 与 `updatedRound:2` 同屏不同步 | **CONFIRMED**（`9abb1cd6#388`；`updatedRoundMeans` 0 次出现） | `TB-2761` |
| FEEDBACK81-D-6 | 括号内全角「；」被当分隔符，切出「（」「）」空壳 | **CONFIRMED（两次逐字复现：m3 `#179`、m6 `#285`；磁盘行原文完整 ⇒ 缺陷在派生切分）** | `TB-2763` |
| FEEDBACK81-D-7 | `task_create` 带 `description` 不带 `owner` | **EVIDENCE-MISQUOTED（缺陷定名不成立）**：note 原文已写 `when owner is set`，前提自驳；行为观察成立。仅「note 是否够清楚」并入 `TB-2765` 小项 | `TB-2764`（**降级**）/ `TB-2765` |
| FEEDBACK81-D-8 | caller 模式 `vote_solved` 永走「不计票」 | **CONFIRMED（逐字段）**：`keptNow:false`/`keptWhy:"tool-visibility-unprovable"`/`mounted-why:provider-threw:VMU_MEMBER_SESSION_NOT_LIVE` | `TB-2764` |
| FEEDBACK81-D-9 | 成员 `status` 读不到 `memberOps` | **NOT-REPRODUCED / RULE-UNREACHABLE**：键按调用者身份展开（`tools/turn.js:405`+`:387`），本 run 无成员在自会话调 `op:"status"`（31 次调用只有 1 次来自成员会话，还是被拒的 `op:"step"`） | 并入 V12 的 `RULE-UNREACHABLE`；`TB-2764` 的 D-9 部分**降级为「读面可达性说明」** |
| FEEDBACK81-A-1…A-5 | `memberWorkShare` 分母、`meetings` 旧键、公式 `$…$`、`next_step` 未被执行（audit3 更正：**4 次**，seq 99/114/120/128）、fixture 快照文案 | 口径建议（不按缺陷计，但按项目标准要修） | `TB-2765`（A-1…A-5 同书） |
| 收尾事故 | 看门狗 post-drive 内存闸误杀、驱动收尾抗杀、`slv-inspect` 落盘 | 工具/流程 | `TB-2766`（**已完成**） |
| TB-2767 | `toolchainProbe` 与 `pdfCompiled` 矛盾 | **已降级：取样错误（5 个命中全在 `final` 前；32 条 `not-run` 全在 final 前；final 与 final 后 status 均 `ran-present`；`not-run+produced:true`=0）⇒ 不是缺陷** | `TB-2767` 保留为「下一次真机 V8 复核埋点」 |
| **新观察 · TB-2769** | 论文 §1 引「本所目标」= v5r pack 默认（前 n 个奇数之和 n²），而状态板 `[总任务]` 与论文标题是互质题；`vmu.turn.objective` 是 **per-kernel**（`kernel/index.js:752`）⇒ 两个来源 | **观察，未定性**（是否机制缺陷需定点实验） | **`TB-2769`（已立，先定性后修）** |

---

## 6 看门狗 `MEMORY-LOW` 误杀：**不是产品缺陷**（工具问题）与教训

- **事实**：attempt-3 的 drive 段在 `run83.monitor.log` 03:07:25 已打印最终进度 `tokens=42321382`，`run83.drive.log` 记录 **`DRIVE exit=0`** 与 done 行（`durationSec:4033`）；随后 driver 进入 **§7 `slv-inspect`**（纯本地 node 后处理）。**03:07:46** 看门狗第 25 个周期判定 `FreePhysicalMemory=1.04 GB < -MinFreeGB=1.2 GB` ⇒ 写 `run83.WATCHDOG-ABORT.txt` 并杀整棵进程树（KILL pid 12 个）。abort 文件里 **`last bad shell lines` 为空**（没有任何 shell 故障签名）。
- **定性**：**工具/阈值问题，不是产品缺陷、不是环境故障**。drive 已成功；被杀的是收尾后处理。看门狗前 24 个周期看到的 `free_GB` 在 **2.03–2.35**，只有第 25 周期瞬降到 1.04（同一时刻 `slv-inspect` 在读 90 MB jsonl）——阈值 `1.2` 正好贴在波动带下沿。
- **后果**：§7 在 driver 内未完成（drive.log 停在 §7 标题）；**7b（journal 打 run-metadata 戳）与 §8（cleanup）未跑**（`run83-metadata.json` 无 `journalStamped`、drive.log 无 `STAMP OK`、`profiles/slvp263` 与 `slvp263-ws` 仍在）。run-lane 事后手工补跑 `slv-inspect`：**`SUMMARY: 6 session(s) in 1 file(s), 5 with RED checks`、exit=1**（不是 0 RED；RED 内容见 §6.1；audit3 报告未直接裁定该项，待 Lead 另问 audit3）。
- **旁证/连带影响（run-lane 第一手）**：看门狗 kill 列表含 12 个 pid，其中 **1 个是更早启动的 `DeepSeek Harness.exe`（pid 13276）**——连带影响需 Lead/sim-lane 知悉（当前 DSH 主 GUI pid 4896 等仍存活；run 树已无残留）。
- **已修复**：**TB-2766**（`taskbooks/TB-2766-driver-watchdog-postdrive.md`）已落看门狗 v3（post-drive 只记录不杀、阈值降 0.8、`-DriveLog` 阶段判定）＋驱动 7/7b/8 抗杀 ＋ `postDrive` 先写后 cleanup ＋ `run-inspect-<clone>.log`；证据 `D:/_tmp/run-lane/TB-2766-WATCHDOG-V3.md`（本轮不代替验证）。

### 6.1 `slv-inspect` 的 5 条 RED：**已裁定 = `DEFECT-IN-PRODUCT`（真阳性）→ TB-2770（P0）**

> **audit3-lane 2026-11-13 03:47 裁定**（`D:/_tmp/audit3-lane/SLV-INSPECT-VERDICT.md`）：成员/临时工会话 prompt 里的「同源块」**确实存在**，但被渲染成「`0 个`（本回合没有可用工具）」，而同会话同回合 wire 有 **79** 个工具（69 个 pack + 10 个组合），模型在**同一回合真的成功调用** 39/39、35/35、30/30、25/25、13/13 次 ⇒ **块在说假事实**。根因 `vibe-math-vmu/host.js:2478-2501`（`out.tools` 不可观测时静默 `[]` + `0` 分支写成「没有可用工具」+ `:2483-2489` 把空表写进 `narrowFaceByAgent` 自锁）；产品自己的契约测试 `tests/vmu-host.test.mjs:711-720` 已钉「块 == wire」，本轮直接违约。**修产品（TB-2770），不许改检查器去消红**。以下为裁定前的原始观测，保留作证据。

run-lane 手工补跑 `slv-inspect`（`D:/_tmp/run-lane/slv-inspect-attempt3.log`，1024 行）得到 **`SUMMARY: 6 session(s) in 1 file(s), 5 with RED checks`、exit=1**：

- RED 覆盖 **5 个成员会话**（`r-acad`/`r-1`/`r-2`/`r-3`/`r-temp`；root 会话无 RED），每个会话 2 条同族 RED（总计 10 行）：
  1. `RED 同源块与 wire 不一致（只看 pack 侧）: blockOnly=[] wireOnly=[vibe_v5_* 与 vibe_vmu_* 共 **69 个** pack 工具]`
  2. `RED wire 上有同源块未声明的 pack 工具: <同一 69 个 pack 工具列表>`
- 同日志佐证 INFO：`wire 上还有组合自带的 10 个工具（同源块只管自己的 slot）`、`wire snapshots [79,79,58,58,…]`（每请求变化）。
- **解读（只描述，不代替裁定）**：成员/临时工会话的「同源块」没有声明 wire 上实际携带的 pack 工具（`blockOnly=[]`、`wireOnly`=全部 pack 工具）；root 正常。**是预期（成员面被收窄）还是缺陷，等 audit3 对照 TB-2733/成员面设计裁定**；本页不把它记成产品 FAIL，也**不记 0 RED**。
- **教训（记入 LESSONS 候选）**：
  1. **看门狗阈值不要贴在波动带边缘**：本轮自由内存在 1.04–2.35 之间波动，`-MinFreeGB 1.2` 只在收尾瞬时被踩；要么抬高阈值+更长的连续周期确认，要么只在 **drive 阶段**生效。
  2. **drive 已 `exit=0` 后不应再被运行期看门狗杀**：收尾（§7/7b/8）是取证与清理阶段，优先级应是「先保证据」，而不是按运行期内存策略杀进程。
  3. **attempt-2 的 v1 误报已修**：v1 扫 prompt/args 里的 marker 与失败签名字面量 ⇒ 假 PASS；v2 只认 `tool/result.message.content[].text` + `job/settled.detail`，attempt-3 的 `PROBE-PASS`（02:00:59）是真 PASS（PS marker + `exit code: 0`，无坏签名）。
  4. 收尾被杀会留下**未打戳的 journal 与未清理的 clone**：下一轮必须由 run-lane 手工补跑 7b/8（或把 7b/8 设计成独立、可重入的步骤）。
  5. **不要用「drive exit=0」掩盖收尾缺口**：本页把 7b/8 未跑列进 §7 未闭合。

---

## 7 未闭合与 `ENV-LIMIT` 清单

1. **7b/§8 未跑**：journal 未打 run-metadata 戳（`run83-metadata.json` 无 `journalStamped`；`run83.drive.log` 无 `STAMP OK`）；`profiles/slvp263` 与 `slvp263-ws` 未清理（§8 未执行）；port 19809 已无监听（进程已被杀，非泄漏）。
2. **§7 判据未在运行内完成**：driver 内 §7 被杀；手工补跑 `slv-inspect` 为 `6 sessions / 5 with RED checks`、**exit=1**（RED = 同源块 vs wire 的 69 个 pack 工具差集，见 §6.1）⇒ **不能写「0 RED」**；audit3 报告未直接裁定该项，**待 Lead 另问 audit3**。
3. **V 表 ENV-LIMIT = 0**（V5 磁盘对账已做：23 行）；**环境侧仍有**：`bash(MSYS)` 不可用（`0xC0000022`）、所办侧 token/transcript 不可读（驱动侧 `42 321 382` / `399`）——**不得把「所办不可读」记成「零」**。
4. **attempt-1/2 不是有效轮次**：attempt-1 = setup exit 6（0 token、无 jsonl）；attempt-2 = VOID（155 356 token、0.19% cap、1 回合）。它们不产出 V 验点读数。
5. **未验/不可复现的半**：V3 后半（turn/member 不一致拒 = `RUN-DID-NOT-REACH`）、V6①（指定串 3 项计数 = `RUN-DID-NOT-REACH`）、V12 `memberOps`（`RULE-UNREACHABLE`：本 run 从未有成员在自己会话里调 `op:"status"`）。
6. **新 P0 未修**：**PDF 静默丢字 16 处而回执报成功**（`ℤ/∀/∣/∩/∪/⋯`，`lmroman10-regular`；`math.glyphsRepaired:58` 未覆盖；`final` 仍 `ok:true, stderrTail:""`）⇒ **TB-2768**；history：office 完全没报，audit3 独立抓到。
7. **未定性观察**：论文 §1「本所目标」= pack 默认奇数之和 n²、状态板/标题是互质题；`vmu.turn.objective` per-kernel ⇒ 两个来源 ⇒ **TB-2769**（先定性后修）。
8. **缺陷已归并**：`TB-2761`（D-1/D-2/D-4/D-5）、`TB-2762`（D-3 降级）、`TB-2763`（D-6）、`TB-2764`（D-7/D-8/D-9，其中 D-7/D-9 降级）、`TB-2765`（A-1…A-5）、`TB-2766`（收尾，已完成）、`TB-2767`（降级埋点）、`TB-2768`（P0 PDF 丢字）、`TB-2769`（观察）。
9. **取证约束（宿主副作用）**：full status / receiptsView 的中段被宿主插入 `[...]`（~24850），另有 3 条回执尾部 `(Omitted N bytes)` ⇒ **不能整条 `JSON.parse`**，审计须逐字段正则取（audit3 §6F）。

---

## 8 证据路径总表

- attempt-3 主证据：`D:/_tmp/slv-phase5/run83.drive.log`（PREFLIGHT/gate/BUILD/DRIVE done/§6 jsonl 读数/§7 标题）、`run83-metadata.json`、`run83-preflight.json`（8/8）、`run83.monitor.log`、`run83.drive.err`（空）、`run83.WATCHDOG-ABORT.txt`、`run83.watchdog.log`、`run83.WATCHDOG-PROBE-PASS.json`、`run83.driver.exitcode.txt`（`1`，被看门狗杀后由 cmd 包装写入的**外层退出码**；drive 段自身 `DRIVE exit=0`）。
- journal：`D:/wd/vibemath开发/_oneoff/vm-slv/full-1113-015517.jsonl`（90 735 678 B / 157 693 行）；driver 原始流镜像 `full-1113-015517.run.log`（169 416 760 B）。
- **audit3 独立复核**：`D:/_tmp/audit3-lane/AUDIT3-REPORT.md`（31 552 B）、`pdf-full.txt`（PDF 文本抽取）、`disk1.py`/`disk2.py`（磁盘对账）、`journal/`。
- 产物与三份报告：`D:/_tmp/slv-phase5/slvp263-ws/{SIM-REPORT81.md,FEEDBACK81.md,PROGRESS.md}`、`Paper/paper-p1/{paper-p1.pdf, paper-p1.tex, paper-p1.log}`（log 34 199 B，16 条 `Missing character`）；副本在 `D:/_tmp/run-lane/attempt3-evidence/`（含 `paper-p1.pdf` 114 442 B）。
- §7 手工补跑：`D:/_tmp/run-lane/slv-inspect-attempt3.log`（1024 行；尾行 `SUMMARY: 6 session(s) …, 5 with RED checks`）。
- attempt-1：`D:/_tmp/slv-phase5/run81.*`、`D:/_tmp/run-lane/RUN81-FAILED-SETUP.md`。
- attempt-2：`D:/_tmp/slv-phase5/run82.*`、`full-1113-013725.jsonl`（452 020 B / 631 行）、`D:/_tmp/run-lane/RUN81-ATTEMPT2-VOID.md`。
- 第一手对账与任务书：`D:/_tmp/run-lane/RUN81-ATTEMPT3-RECONCILIATION.md`；`D:/wd/vibemath开发/taskbooks/{TB-2761…TB-2769}*.md`；`D:/_tmp/run-lane/TB-2766-WATCHDOG-V3.md`。
- durable store（V1 的 58 行 / V5 的 23 行回执）：`D:/_tmp/slv-phase5/slvp263-ws/VibeMath/vmu/state.json`（`keys.records` 58 条；`keys.meetings.value.data.receipts` JSON 字符串解析 = 23 行）。
- 就绪/计划：`D:/_tmp/run-lane/RUN81-ATTEMPT3-READINESS.md`、`D:/_tmp/slv-phase5/RUN81-LAUNCH-PLAN.md`、`D:/_tmp/slv-phase5/task-sim81.txt`（28 453 B / sha256 `01e0384f…` = preamble v3 2 233 B + TB-2754 v2 26 219 B，`BODY IDENTICAL`）。
- 本轮我复算/复读脚本：`D:/_tmp/doc-lane/verify-run81*.mjs`、`run81-verify*.json`、`patch*.mjs`（可复跑）。

---

## 9 结论一句话

**按 audit3 定稿：11 完整 PASS / 3 局部 NO-EVIDENCE / 0 FAIL / 0 ENV-LIMIT**（§4）。F80-1 / F80-2（同传半）/ F80-3 / F80-5（V8）/ F80-10 的修复在真机回执上成立；论文链第一次跑到 `finalized` + `render` + 磁盘 PDF（114 442 B，三处 sha 一致），结题票 4/4 且 `r-temp` 具名 `notEligible`。**但头号缺陷是 office 完全没报、audit3 独立抓到的 P0：PDF 静默丢字 16 处而 `final` 回执报成功（TB-2768）**。其余未闭合：看门狗 `MEMORY-LOW` 误杀（7b/8 未跑，TB-2766 已修）、3 个局部证据缺口（V3/V6/V12）、以及 `slv-inspect` 5 条 RED 待 audit3 裁定。**V1 只能按 `memberWorkShare` 值本身记 PASS，不可按行重算。**
