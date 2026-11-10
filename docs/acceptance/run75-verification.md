# RUN 75 / RUN 76 真机核对记录（机械核对器）

> **这是记录，不是证据。** 证据是 `scripts/audit/verify-run.mjs` 能在同一批 journal 上重跑出同一张表；
> 本页只是把 2026-11-09 那次 run 75、2026-11-10 那次 run 76 的输出留档，方便后来人对照。
>
> **判据从 run 76 起有两处扩展（TB-2714）**：①每条 `NO-EVIDENCE` 必须带原因分类
> `RUN-DID-NOT-REACH` / `PRODUCT-MISSING` / `RULE-UNREACHABLE`（未分类会被单独计数成 `UNCLASSIFIED`，
> 不许默认归到任何一类）；②V1 的构建自证改成「run-metadata.json / driver TARBALL / git HEAD」三处互证，
> journal 首帧只作加分——旧判据要求的 journal 帧由驱动在 `taskkill` 之后才 prepend，**运行期永远拿不到**。

- run：session-75fe7e75-af03-4d1b-b927-555bb9658bad；build `92bc6d94`
- 窗口：首事件 >= `2026-11-09T21:00:00Z`；7 个会话 / 223 条回执 / 75 条提示词
- 结果：**PASS 5 / NO-EVIDENCE 7 / FAIL 0**（V5、V6、V9、V10、V11 为 PASS）
- 采集命令原文：

```
node scripts/audit/verify-run.mjs \
  --sessions-root D:/_tmp/slv-phase5/sessions \
  --since 2026-11-09T21:00:00Z \
  --build 92bc6d94 \
  --driver-log D:/_tmp/slv-phase5/run75c.drive.log \
  --out D:/_tmp/tb2696b
```

`--out` 目录里是 `verify-run.json`（机器读）与 `verify-run.md`（下面这张表）；不给 `--out` 时 JSON 走 stdout，人读摘要走 stderr。

## 验点表

表格 12 个验点（V1–V12，加上表头与分隔线正好 14 行）；**每一行都能用 `--checks <id>` 单独复跑**，见文末命令。

| 验点 | 期望 | 实测（回执字段=值） | 判定 | 缺什么 |
|---|---|---|---|---|
| V1 构建自证（TARBALL / git HEAD / journal 首帧三处一致） | TARBALL build = git short HEAD = journal 首帧 run-metadata build；buildSource git HEAD (git archive)；dirty:false | TARBALL build=92bc6d94<br>BUILD REV=92bc6d943bc7302d28b3f0924c0fcd6bfdb8250c<br>rev-parse --short HEAD=92bc6d94<br>rev-parse HEAD=92bc6d943bc7302d28b3f0924c0fcd6bfdb8250c | **NO-EVIDENCE** | journal 首帧 run-metadata.build（本部署 session 事件无 build/buildSource/dirty；driver 里 STAMP exit=0 但 stamp 工具回执 sessions:0/stamped:0 "no session folder for this workspace"，build 帧没有落盘） |
| V2 成员/所办工作量占比（memberWorkShare） | 回执带 memberActs>0、officeRelayedActs>0、unknownActs、acts、memberShare(4 位小数)、means；手算 memberShare == memberActs/(memberActs+officeRelayedActs) | status.memberWorkShare.memberActs=1<br>status.memberWorkShare.officeRelayedActs=0<br>status.memberWorkShare.unknownActs=0<br>status.memberWorkShare.acts=1 | **NO-EVIDENCE** | officeRelayedActs > 0 的读数（本轮 memberActs=1、officeRelayedActs=0；两侧都 >0 才能核对比率） |
| V3 所办代跑 vs 成员自跑（回执 + 回合行 + 重建行三处可区分） | 所办代跑回执 memberActed:false、actedForMember、ranInOwnTurn:false；回合行 deliveryPath:"caller"；重建行行来源键 writtenFrom∈{own-turn,relayed,unknown}（run 75 当时的回执叫 writerSource∈{field-argument,meta.writer,meta.owner,member}）+ means | memberActed=false<br>actedForMember=r-1<br>ranInOwnTurn=false<br>turnReceipts[t-2].deliveryPath=activation | **NO-EVIDENCE** | turnReceipts 行的 deliveryPath:"caller"（所办代跑的回合行）；重建行的行来源键（writtenFrom；run 75 当时的回执叫 writerSource）+ means |
| V4 论文三态推进 + 每态下一回合装配文本 sha 互异 + 状态板三组读数 | paper start 后经 part/review 推进 draft→reviewing→finalized；每态主席席取一次装配文本并算 sha256（三份互异）；状态板 paper/blueprint/closure 带 source+atSource；turn.status() 的 liveReadings 同值 | action/ok=start/true<br>paper.status=writing<br>paper.status=reviewing<br>paper.status=awaiting-editor | **NO-EVIDENCE** | liveReadings.paper.value 非空（实测 null，该 status 早于该轨）；liveReadings.paper.atSource 非空（实测 null）；liveReadings.blueprint.value 非空（实测 null，该 status 早于该轨）；liveReadings.blueprint.atSource 非空（实测 null）；liveReadings.closure.value 非空（实测 null，该 status 早于该轨）；liveReadings.closure.atSource 非空（实测 null） |
| V5 论文渲染/定稿回执（ok/complete/means + renderOk/renderOkMeans） | final 回执 ok/complete/means；render 回执 renderOk+renderOkMeans；无 LaTeX 时应具名拒并给 reachable hint 或 toolchainAbsent；ok:true 不得同时带 code | renderOk=true<br>renderOkMeans=renderOk:true — the ARCHIVE ROW SET (md/tex/meta/pdf) is complete after this render; `ok:true` was only the request bein…<br>ok/complete=true/true<br>latexAvailable=true | **PASS** | — |
| V6 具名拒 + 可达替代（hint 真能走通） | code+hint 含 REACHABLE INSTEAD:+真工具+真参数；逐字第二次不得同码拒 | code=VMU_OFFICE_CONSULT_REQUIRED<br>hint=REACHABLE INSTEAD: 让所办用 vibe_v5_paper { action: "consult", target: "RUN255 机制验收纪要（占位题 a^2+b^2>=2ab，不真解）", member: "offic…<br>ok（hint 点名的工具被真调用）=true | **PASS** | — |
| V7 投递形状具名拒（不是引擎不可用） | code:"VMU_TURN_DELIVERY_SHAPE" 或 "VMU_TURN_DELIVERY_NO_PAYLOAD"；不得是 VMU_ENGINE_UNAVAILABLE；starts≤1 | — | **NO-EVIDENCE** | code 为 VMU_TURN_DELIVERY_SHAPE 或 VMU_TURN_DELIVERY_NO_PAYLOAD 的投递形状拒回执（本轮 0 条） |
| V8 parked 停放：具名 code + 原因 + 处置建议 | code:"VMU_TURN_PARKED_NEEDS_OWNER"；parkedReason 非空；parkedFacts 给处置建议 | — | **NO-EVIDENCE** | code:"VMU_TURN_PARKED_NEEDS_OWNER" 的回执 |
| V9 孤儿 abandon 收尾（行状态 + 之后不再 reentrant） | ok:true、settledBy:"abandoned-orphan"、orphan:true、turnRow.status:"abandoned"；之后 step 无 VMU_TURN_REENTRANT | ok/settledBy=true/abandoned-orphan<br>orphan=true<br>turnRow.status=abandoned<br>code（abandon 之后的 turn 调用）=ok | **PASS** | — |
| V10 构造后申报 pack 键：具名 TOO_LATE + 可达替代 | code:"VMU_PACK_DECLARATION_TOO_LATE"；hint 有 REACHABLE INSTEAD:+config.packManifests；facts.declaredAt 存在 | code=VMU_PACK_DECLARATION_TOO_LATE<br>hint=REACHABLE INSTEAD: declare these keys in `config.packManifests` (a list the entry folds BEFORE createKernel - see kernel…<br>facts.declaredAt=2026-11-09T21:44:46.066Z<br>facts.key=["phases"] | **PASS** | — |
| V11 回合通知字面头 + 未读计数恒等 + ack 减一 | " [新到的消息]" 字面出现在下一回合提示词；unackedRowsAllBoxes==sum(perBox)；ack 一次后总数减 1 | prompt 首行=[新到的消息]<br>notice 行数=6<br>notice.unackedRowsAllBoxes=27<br>sum(notice.perBox)=27 (r-1:0, r-2:5, r-3:8, r-acad:9, r-temp:5) | **PASS** | — |
| V12 结题票 + 终稿 + 归档回指 + 字节/sha 恒等 | closureVote.votesCast == 本轮 solved=true 的成员数；论文 final 回执 produced:true + pdfPath + pdfBytes>0；renderOk:true；归档行 recordId 回指；pdfBytes == 磁盘字节数；sha256(pdfPath) == 归档行 sha | closureVote.votesCast=4<br>closureVote.votesFor=4<br>closureVote.eligible=["r-acad","r-1","r-2","r-3"]<br>count=4 (r-1,r-2,r-acad,r-3) | **NO-EVIDENCE** | 归档行上的 PDF 文件 sha256 |

## 自报 vs 机械

SIM-REPORT75 的自报是 PASS 8 / FAIL 1 / ENV-LIMIT 3，同一批回执的机械核对是 PASS 5 / NO-EVIDENCE 7 / FAIL 0。
差不在机制而在证据口径：

- 自报把「论文三态推进过」「归档行存在」当成 PASS；机械核对要求**状态板同值**（V4 的 `liveReadings` 三组全是 null）
  与**文件 sha 同源**（V12 的归档行只有行正文 fingerprint，没有 PDF 文件 sha256），缺一个就只能是 NO-EVIDENCE。
- 自报把「没见到失败回执」记成 ENV-LIMIT；机械核对的 ENV-LIMIT 只留给环境根本不允许（如无 PDF 工具链），
  「回执里根本没有这个读数」是 NO-EVIDENCE 并点名缺哪个字段。
- 自报的 1 条 FAIL 在回执里找不到对应的失败形状（机械侧 FAIL 0）——自报数的是判断，机械数的是回执。

一句话：**自报不是不诚实，是不可反驳；机械核对把「凭什么说通过」变成可复查的字段。**

## 三个典型（为什么它们不是 PASS）

1. **V4（状态板同值）**：paper 状态从 writing 推到 finalized，但唯一带 `status.liveReadings` 的 status 回执在 21:28Z，
   早于论文轨；其中 paper/blueprint/closure 的 `value` 与 `atSource` 全是 null。空壳不是读数，缺「同值」这一腿。
2. **V12（字节/sha 恒等）**：终稿 PDF 在磁盘上 100 587 B、sha256 `591d23a6…`；归档行 `rec-36` 的
   `fingerprint=633e7c7a…` 是**行正文的指纹**（body 里只有 pdfPath/pdfBytes/engine/argv/elapsedMs/timeoutMs），
   不是文件 sha ⇒ 文件↔行的等式算不出来（`ARITHMETIC-BLOCKED`），只能 NO-EVIDENCE。
3. **V1（构建三处自证）**：driver 的 TARBALL、git short HEAD 两处相等，但 journal 首帧没有 run-metadata build 帧；
   driver 里 `STAMP exit=0` 而 stamp 工具回执是 `{"sessions":0,"stamped":0,...,"note":"no session folder for this workspace"}`
   ——「成功」只是没写东西。第三处不是被核对通过，而是没写成。

## 逐点复跑

```
node scripts/audit/verify-run.mjs --sessions-root D:/_tmp/slv-phase5/sessions \
  --since 2026-11-09T21:00:00Z --build 92bc6d94 \
  --driver-log D:/_tmp/slv-phase5/run75c.drive.log --checks V4
```

把 `--checks V4` 换成 V1…V12 的任一 id 即得该行的同一结论；不带 `--checks` 是全部 12 个。
缺 `--since` 会以退出码 2 拒跑：没有时间窗的核对器等于核对全部历史。

## 判定口径

- **PASS** 必须有「工具@会话:时间 + 回执字段=值」原文；数量类当场算，算式写进 `arithmetic`。
- 缺回执字段 ⇒ **NO-EVIDENCE**，并在 `missing` 里点名缺哪个字段（不静默跳过、不判 FAIL）。
- 环境不具备 ⇒ **ENV-LIMIT**（并给证据说明环境缺什么）。
- **FAIL** 只用于「期望明确不成立」，必须给两边数字或两处原文。
- 退出码：0 = 无 FAIL；1 = 有 FAIL；2 = 用法错。

## 口径对账（文档以 runner 为准）

2026-11-10 用当前 `scripts/audit/verify-run.mjs` 对同一批 run 75 真会话重跑（`--out D:/_tmp/tb2696-final`），
把机器输出与本文逐行对账：**12/12 判定一致、验点表逐字节相同（4538 B，diff 为空）、未改任何一行判定**。
即：表里每行的四态名来自 runner（PASS / NO-EVIDENCE / FAIL / ENV-LIMIT），PASS 行都带回执字段=值原文（见附录 A），
V11 的数量恒等带 `arithmetic`（27/27 与 26/26 两次 status 读数当场相加），NO-EVIDENCE 行都在 `missing` 里点名缺哪个字段。
本次对账无差异，故没有「以 runner 为准」的改写记录；下次 runner 行为变化时，先改本表再留一行改写记录与时间。

对账命令（与文首采集命令同一批 journal，仅输出目录不同）：

```
node scripts/audit/verify-run.mjs \
  --sessions-root D:/_tmp/slv-phase5/sessions \
  --since 2026-11-09T21:00:00Z \
  --build 92bc6d94 \
  --driver-log D:/_tmp/slv-phase5/run75c.drive.log \
  --out D:/_tmp/tb2696-final
```

复跑读数：`sessions=7 receipts=223 messages=75 driver=true git=92bc6d94`，`summary {"NO-EVIDENCE":7,"PASS":5}`，exit 0；
`verify-run.json` 里 5 个 PASS 的 evidence 条数为 V5=8、V6=3、V9=5、V10=4、V11=8，每条都带 `{call, receiptField, value}`。
注意 V11 的两条提示词证据 `call` 前缀是 `journal:`（来源是 journal 事件，不是工具调用），这是本批回执里唯一不是「工具@会话:时间」形状的证据，已在附录 A 标注。

## 附录 A：PASS 行的证据位置（工具@会话:时间 + 回执字段=值）

`D:/_tmp/tb2696-final/verify-run.json` 原样摘出（2026-11-10T10:06+08:00 复跑，与文首采集命令同一批 journal）。
每个 PASS 行的 `call` 形如 `工具@会话:时间`，`receiptField=value` 是回执原文；V11 的两条提示词证据来源是 journal 事件（前缀 `journal:`），不是工具调用。

### V5 — 论文渲染/定稿回执（ok/complete/means + renderOk/renderOkMeans）

| call（工具@会话:时间） | 回执字段=值 |
|---|---|
| `vibe_v5_paper@session-6aac:22:08:32.575 {"action":"render","target":"paper-p1"}` | `renderOk=true` |
| `vibe_v5_paper@session-6aac:22:08:32.575 {"action":"render","target":"paper-p1"}` | `` renderOkMeans=renderOk:true — the ARCHIVE ROW SET (md/tex/meta/pdf) is complete after this render; `ok:true` was only the request bein… `` |
| `vibe_v5_paper@session-6aac:22:08:32.575 {"action":"render","target":"paper-p1"}` | `ok/complete=true/true` |
| `vibe_v5_paper@session-6aac:21:44:37.185 {"action":"compile","target":"paper-p1"}` | `latexAvailable=true` |
| `vibe_v5_paper@a7c85919-b5f:22:01:11.881 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要，记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `ok/complete=true/true` |
| `vibe_v5_paper@a7c85919-b5f:22:01:11.881 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要，记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `final.complete=true` |
| `vibe_v5_paper@a7c85919-b5f:22:01:11.881 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要，记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `final.pdf.pdfBytes=100587` |
| `vibe_v5_paper@a7c85919-b5f:22:01:11.881 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要，记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `final.toolchainAbsent=[]` |

### V6 — 具名拒 + 可达替代（hint 真能走通）

| call（工具@会话:时间） | 回执字段=值 |
|---|---|
| `vibe_v5_paper@a7c85919-b5f:21:59:37.685 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要：记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `code=VMU_OFFICE_CONSULT_REQUIRED` |
| `vibe_v5_paper@a7c85919-b5f:21:59:37.685 {"action":"final","conclusion":"本文为 RUN255 机制验收纪要：记录本所在「前 n 个奇数之和 = n²」上的四步归纳证明、边界核查、Lean 形式化与裁决流程证据；本纪要不把占位题 …` | `hint=REACHABLE INSTEAD: 让所办用 vibe_v5_paper { action: "consult", target: "RUN255 机制验收纪要（占位题 a^2+b^2>=2ab，不真解）", member: "office", answer: "…" } 答复（先用 action: "consult_state" 读 awaiting.id），答完重试 action: "final"；**不要**用「把 vmu.pa…` |
| `vibe_v5_paper@a7c85919-b5f:21:59:48.797 {"action":"consult_state","target":"paper-p1"}` | `ok（hint 点名的工具被真调用）=true` |

### V9 — 孤儿 abandon 收尾（行状态 + 之后不再 reentrant）

| call（工具@会话:时间） | 回执字段=值 |
|---|---|
| `vibe_vmu_turn@session-6aac:21:53:36.762 {"op":"abandon","turn":"t-7"}` | `ok/settledBy=true/abandoned-orphan` |
| `vibe_vmu_turn@session-6aac:21:53:36.762 {"op":"abandon","turn":"t-7"}` | `orphan=true` |
| `vibe_vmu_turn@session-6aac:21:53:36.762 {"op":"abandon","turn":"t-7"}` | `turnRow.status=abandoned` |
| `vibe_vmu_turn@session-6aac:22:12:10.219 {"member":"r-1","next_step":"你是成员 r-1。本轮**只做两件写文件的事**（不做数学、不提 Lean/python、不投票、不开会）：\n1) 用 fs **写**（write，不是 ap…` | `code（abandon 之后的 turn 调用）=ok` |
| `vibe_vmu_turn@session-6aac:22:14:52.222 {"member":"r-temp","next_step":"你是临时工 r-temp（无表决权、默认不参会）。本轮**只做两件写文件的事**，做完即结束、不要续任务（不做数学、不提 Lean/python、不投票）：…` | `code（abandon 之后的 turn 调用）=ok` |

### V10 — 构造后申报 pack 键：具名 TOO_LATE + 可达替代

| call（工具@会话:时间） | 回执字段=值 |
|---|---|
| `vibe_vmu_pack@session-6aac:21:44:46.072 {"action":"apply","manifest":"{\"id\":\"probe75\",\"version\":\"1.0.0\",\"name\":\"RUN255 V10 probe\",\"phases…` | `code=VMU_PACK_DECLARATION_TOO_LATE` |
| `vibe_vmu_pack@session-6aac:21:44:46.072 {"action":"apply","manifest":"{\"id\":\"probe75\",\"version\":\"1.0.0\",\"name\":\"RUN255 V10 probe\",\"phases…` | `` hint=REACHABLE INSTEAD: declare these keys in `config.packManifests` (a list the entry folds BEFORE createKernel - see kernel/pack.js foldPackDeclarations), or drop them; `vibe_vmu_pack` cannot change a construction-time snap… `` |
| `vibe_vmu_pack@session-6aac:21:44:46.072 {"action":"apply","manifest":"{\"id\":\"probe75\",\"version\":\"1.0.0\",\"name\":\"RUN255 V10 probe\",\"phases…` | `facts.declaredAt=2026-11-09T21:44:46.066Z` |
| `vibe_vmu_pack@session-6aac:21:44:46.072 {"action":"apply","manifest":"{\"id\":\"probe75\",\"version\":\"1.0.0\",\"name\":\"RUN255 V10 probe\",\"phases…` | `facts.key=["phases"]` |

### V11 — 回合通知字面头 + 未读计数恒等 + ack 减一

| call（工具@会话:时间） | 回执字段=值 |
|---|---|
| `journal:75ec431a-bf2:2026-11-09T22:12:17.593Z` | `prompt 首行=[新到的消息]` |
| `journal:75ec431a-bf2:2026-11-09T22:12:17.593Z` | `notice 行数=6` |
| `vibe_vmu_mailbox@session-6aac:21:53:44.392 {"action":"status"}` | `notice.unackedRowsAllBoxes=27` |
| `vibe_vmu_mailbox@session-6aac:21:53:44.392 {"action":"status"}` | `sum(notice.perBox)=27 (r-1:0, r-2:5, r-3:8, r-acad:9, r-temp:5)` |
| `vibe_vmu_mailbox@session-6aac:21:53:57.135 {"action":"status"}` | `notice.unackedRowsAllBoxes=26` |
| `vibe_vmu_mailbox@session-6aac:21:53:57.135 {"action":"status"}` | `sum(notice.perBox)=26 (r-1:0, r-2:5, r-3:8, r-acad:9, r-temp:4)` |
| `vibe_vmu_mailbox@session-6aac:21:53:44.392 {"action":"status"}` | `vibe_vmu_mailbox status.unackedRowsAllBoxes before=27` |
| `vibe_vmu_mailbox@session-6aac:21:53:57.135 {"action":"status"}` | `vibe_vmu_mailbox status.unackedRowsAllBoxes after=26（ack 1 条）` |

### V11 的数量恒等（`arithmetic` 原文，27 与 26 两数都在场）

```json
{"status":"vibe_vmu_mailbox@session-6aac:21:53:57.135 {\"action\":\"status\"}","unackedRowsAllBoxes":26,"perBox":{"r-1":0,"r-2":5,"r-3":8,"r-acad":9,"r-temp":4},"perBoxSum":26,"equal":true,"readings":[{"status":"vibe_vmu_mailbox@session-6aac:21:50:44.099 {\"action\":\"status\"}","unackedRowsAllBoxes":27,"perBox":{"r-1":2,"r-2":5,"r-3":8,"r-acad":7,"r-temp":5},"perBoxSum":27,"equal":true},{"status":"vibe_vmu_mailbox@session-6aac:21:53:44.392 {\"action\":\"status\"}","unackedRowsAllBoxes":27,"perBox":{"r-1":0,"r-2":5,"r-3":8,"r-acad":9,"r-temp":5},"perBoxSum":27,"equal":true},{"status":"vibe_vmu_mailbox@session-6aac:21:53:57.135 {\"action\":\"status\"}","unackedRowsAllBoxes":26,"perBox":{"r-1":0,"r-2":5,"r-3":8,"r-acad":9,"r-temp":4},"perBoxSum":26,"equal":true}]}
```

三次 status 读数逐条相加都相等（27==27、27==27、26==26）；ack 1 条之后总数 27→26。判据不允许「只看最后一条」，因为前一条矛盾读数会被最后一条正确读数盖住。

## 附录 B：三条反关灯的红原文（证明自测不是摆设）

每条都把判据本身弄坏（临时改 `scripts/audit/verify-run.mjs`，副本只放 `D:/_tmp`，绝不落仓库），跑 `node tests/verify-run.test.mjs`，
必须变红并命中对应反关灯；随后逐字节还原。CLI sha256 前后相等：
`559ab285eeee86b734d6e431bf8c2a857a1386c16f1959bfbae2609307ec4e73`（BEFORE） == 
`559ab285eeee86b734d6e431bf8c2a857a1386c16f1959bfbae2609307ec4e73`（AFTER）。
红原文（stdout 原样）如下：

```
=== M1 缺字段点名被拿掉 ===
exit=1 restored=true expected-red-hit=true
  FAIL ★ 反关灯①：证据字段 unackedRowsAllBoxes 缺失 ⇒ NO-EVIDENCE 并点名该字段 :: {"verdict":"NO-EVIDENCE","missing":["notice 字段缺失","同一成员在 ack 前后的两次 inbox list count（或 mailbox status 总数）"]}

=== M2 perBox 只看最后一条且不写两个数 ===
exit=1 restored=true expected-red-hit=true
  FAIL ★ 反关灯②：perBox 求和与总数不等 ⇒ FAIL（不是静默 PASS） :: "PASS"
  FAIL ★ 反关灯②：arithmetic 同时给出两个数（27 与 26），算式可当场复核 :: {"status":"vibe_vmu_mailbox@session-mail:00:00:04.000 {\"action\":\"status\",\"member\":\"r-1\"}","unackedRowsAllBoxes":26,"perBox":{"r-1":2,"r-2":24},"perBoxSum":26,"equal":true,"readings":[{"status":"vibe_vmu_mailbox@session-mail:00:00:02.000 {\"action\":\"status\",\"member\":\"r-1\"}","unackedRowsAllBoxes":27,"perBox":{"r-1":2,"r-2":24},"perBoxSum":26,"equal":false},{"status":"vibe_vmu_mailbox@session-mail:00:00:04.000 {\"action\":\"status\",\"member\":\"r-1\"}","unackedRowsAllBoxes":26,"perBox":{"r-1":2,"r-2":24},"perBoxSum":26,"equal":true}]}

=== M3 --since 缺省成固定值 ===
exit=1 restored=true expected-red-hit=true
  FAIL ★★ 反关灯③：不给 --since ⇒ 退出码 2，stderr 点名 --since :: {"status":0,"stderr":"[verify] sessions=0 receipts=0 messages=0 driver=false git=92bc6d94"}

SUMMARY: PASS — 三条反关灯都变红，CLI 字节恢复一致
```

三处假改动分别是：①把缺字段点名降级成一句泛称（`missing` 不再点 `unackedRowsAllBoxes`）；②perBox 只取最后一条读数、判定从此不会 FAIL 且不写两数；③`--since` 缺省成固定时间（不再以退出码 2 拒绝）。
对应的红线理由：缺字段必须点名（否则人不知道补什么）；数量不等必须 FAIL 并给出两个数（否则人只能信结论）；没有时间窗的核对器等于核对全部历史，必须具名拒。

## RUN 76（2026-11-10，build `3fed0ba8`）：四条尺子缺陷修好后的复跑

> 本轮 12 验点里 4 条是**核对器自己写错了层/写错了键**（不是产品问题），TB-2714 修的就是尺子。
> 下面是修完的复跑记录；run 75 的章节一字未改，作为「旧尺子长什么样」的对照。

- 窗口：首事件 >= `2026-11-10T21:20:00+08:00`；5 个会话 / 152 条回执 / 60 条提示词
- 结果：**PASS 10 / NO-EVIDENCE 2 / FAIL 0 / ENV-LIMIT 0**
- `NO-EVIDENCE` 分类：`RUN-DID-NOT-REACH` 1（V2）、`PRODUCT-MISSING` 1（V4）、`RULE-UNREACHABLE` 0、`UNCLASSIFIED` 0
- 采集命令原文：

```
node scripts/audit/verify-run.mjs \
  --sessions-root D:/_tmp/slv-phase5/sessions \
  --since 2026-11-10T21:20:00+08:00 \
  --build 3fed0ba8 \
  --driver-log D:/_tmp/slv-phase5/run76.drive.log \
  --out D:/_tmp/verify76e
```

### 验点表（run 76）

| 验点 | 判定 | 依据（回执字段=值） |
|---|---|---|
| V1 构建自证 | **PASS** | `run-metadata.build=3fed0ba8`、`tarballBuild=3fed0ba8`、`gitHead=3fed0ba8339c…`、`buildFrom=HEAD`、`dirty=false`；driver `TARBALL build=3fed0ba8`；`git rev-parse --short HEAD=3fed0ba8`（journal 帧没有落盘，只作加分） |
| V2 成员/所办占比 | **NO-EVIDENCE**（RUN-DID-NOT-REACH） | `memberActs=3`、`officeRelayedActs=0`：本轮没有 caller 代跑，两侧未都 >0 ⇒ 比率核不了 |
| V3 代跑 vs 自跑 | **PASS** | 成员投递回合 16 个：`memberToolCalls`/`memberSession`/`childSessionId`/`deliveryPath` 互证；同时记录 `status.memberWorkShare.memberActs=3` 与顶层 `memberActed:false` 并存的事实（A1 两把尺子，V3 只记事实） |
| V4 论文三态 | **NO-EVIDENCE**（PRODUCT-MISSING） | 读数最全的 status 里 `liveReadings.blueprint.value=null`、`atSource=null`、`liveReadings.closure.atSource=null`（产品 A3：`records.mdParse 没有注入`） |
| V5 渲染/定稿 | **PASS** | `final ok:true`、`complete:true`、`pdfBytes=110920`、`renderOk:true` |
| V6 具名拒 + 可达替代 | **PASS** | `code=VMU_OFFICE_CONSULT_REQUIRED` + `hint=REACHABLE INSTEAD: …`，随后 `vibe_v5_paper` 真被调用且 `ok:true` |
| V7 投递形状 | **PASS** | 信封层 1 条 `VMU_TURN_NO_FENCE`，带 `replyLength=39`、`hadBrace=false`、`hint`；全文无 `VMU_ENGINE_UNAVAILABLE` |
| V8 parked | **PASS** | 1 条 `VMU_TURN_ALREADY_PARKED`，带 `parkedFacts`（`turnId=t-7`、`releaseBy=…`）、`parkedMeans`、`hint` |
| V9 孤儿 abandon | **PASS** | `settledBy:"abandoned-orphan"`、`orphan:true`、`turnRow.status:"abandoned"`，之后 12 次 turn 调用无 `VMU_TURN_REENTRANT` |
| V10 构造后申报 | **PASS** | `VMU_PACK_DECLARATION_TOO_LATE` + hint 含 `REACHABLE INSTEAD:` 与 `config.packManifests` + `facts.declaredAt` |
| V11 未读计数 | **PASS** | 提示词含字面 `[新到的消息]`；`notice.unackedRowsAllBoxes=32 == sum(perBox)=32`（`r-1:3, r-2:0, r-acad:24, r-temp:5`）；`perBox[r-2]` 在 ack 1 条前后 `1→0` 净减 1 |
| V12 结题票 + 终稿 | **PASS** | `votesCast=3 == solved 3`；`final.pdfBytes=110920 == 磁盘 110920`；`renderOk:true`；归档行回指且 sha 相符 |

### 尺子改了什么（改前 ⇒ 改后）

| 验点 | 改前（旧判据） | 改后（run 76 起的判据） | run 76 结果 |
|---|---|---|---|
| V1 | 必须 journal 首帧 = run-metadata；该帧由驱动在 `taskkill` 后 prepend ⇒ **运行期恒 NO-EVIDENCE** | `run-metadata.json` + driver `TARBALL build=` + `git rev-parse` 三处互证；journal 帧只作加分；三处不等 ⇒ FAIL，缺一处 ⇒ NO-EVIDENCE 并点名 | NO-EVIDENCE ⇒ **PASS** |
| V3 | 用顶层 `memberActed:false` 当「归因反了」的反例 | 改判「该回合有没有成员投递」（`memberToolCalls`/`memberSession`/`deliveryPath`）；`memberActed` 与 `memberWorkShare` 的两把尺子只记事实、不互相裁决 | NO-EVIDENCE ⇒ **PASS** |
| V7 | 只认适配器层 `VMU_TURN_DELIVERY_SHAPE`/`NO_PAYLOAD` | 认两层：信封层 `VMU_TURN_NO_FENCE`（`replyLength`/`hadBrace`/`hint`）与适配器层（`shape`/`keys`/`means`），码对了但缺解释字段 ⇒ FAIL | NO-EVIDENCE ⇒ **PASS** |
| V8 | 只认 `VMU_TURN_PARKED_NEEDS_OWNER` + `parkedReason` | 两个具名码都认：`ALREADY_PARKED`（`parkedFacts`+`parkedMeans`，无 `parkedReason`）、`NEEDS_OWNER`（`parkedReason`+`parkedFacts`） | NO-EVIDENCE ⇒ **PASS** |
| V11 | 读 `vibe_vmu_mailbox` 的 `action:"status"` 的 `notice.*`；该工具只有 `ack` ⇒ **恒 NO-EVIDENCE** | 读 `vibe_v5_inbox action:"list"` 的 `notice.{unackedRowsAllBoxes,perBox}`；ack 减一按「被 ack 成员自己的 perBox 净减」判，不拿全局总数减 | NO-EVIDENCE ⇒ **PASS** |

### 反关灯（把新判据逐条弄坏，证明它们不是摆设）

副本只放 `D:/_tmp/tb2714-mutants/`，仓库文件不动。做的是「控制组 vs 变异组」的 CLI 对照：
每条 mutation 只改一处，控制组必须 PASS，变异组必须降级或错分。实测 **5/5 proven**（`proofs.json`）：

```
ok M1 V1 退回「必须有 journal 首帧」⇒ PASS 降级为 NO-EVIDENCE         control=PASS mutant=NO-EVIDENCE/RUN-DID-NOT-REACH
ok M2 V7 只认适配器层 ⇒ 信封层 NO_FENCE 变 NO-EVIDENCE               control=PASS mutant=NO-EVIDENCE/RUN-DID-NOT-REACH
ok M3 V8 只认 PARKED_NEEDS_OWNER ⇒ ALREADY_PARKED 变 NO-EVIDENCE     control=PASS mutant=NO-EVIDENCE/RUN-DID-NOT-REACH
ok M4 V11 读回 mailbox status ⇒ 真实 list 形状变 NO-EVIDENCE（run 76 的原缺陷）
ok M5 缺元数据被标成 PRODUCT-MISSING ⇒ 尺子坏被读成产品坏             control=NO-EVIDENCE/RUN-DID-NOT-REACH mutant=NO-EVIDENCE/PRODUCT-MISSING
```

（同一批判据在 `tests/verify-run.test.mjs` 里有 28 条正向断言 + 7 条反关灯断言，跑 `node tests/verify-run.test.mjs` 得 `28 passed / 0 failed`。）

### 只判断不改：ack 之后全局 `unackedRowsAllBoxes` 从 12 涨到 17

这是**设计**，不是缺陷：`unackedRowsAllBoxes` 是「全库未读总数」，期间别的席位新收消息自然会让它涨；
被 ack 的那个成员自己的 `perBox` 才是该用来判「ack 生效」的数。run 76 里 `r-2` 的 `perBox` 在 ack 前后 `1→0`，
而全局从 28 涨到 32（`r-acad` 8→24、`r-temp` 3→5 的新消息）——所以 V11 的判据必须是「同一成员的 perBox 净减」，
不能拿全局总数直接减 1，否则会把别人的新消息算成这次 ack 的功劳。
