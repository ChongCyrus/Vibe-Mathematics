# Round 12 · `task-90` 交账（两个独立内核进程真对话 ＋ gap ④⑤⑥⑦）

**负责人**：`v5r-reader-b`。**主交付**：`_handoff/vmu/16-two-process-e2e.md`（剧本＋逐步读数＋证明了什么/没证明什么）。
**红线**：`math-computation.js`／`math-engines.js` 一字未动；**未改 `kernel/meetings.js`／`meetingmarker.js`**（本轮归 reader-a，我只在 e2e 脚本里断言 gap ⑦）；未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（脚本与 `r12-root` 已删）；**未新增随包文件 ⇒ 双登记不触发**（新增的只有 `_handoff/` 文档）。

---

## 0. 一句话
**两个独立内核进程真的对话了**：三个进程（pid `12072`／`3140`／`8280`）经**共享 store**（`'mailbox'`／`'chat'` 是已声明耐久键）完成「A 发命题 → **B 在另一个进程读到** → B 回复并 ack → **A2 在第三个进程读到回复**」，两成员各自跑了**真机作业**（Lean 实例 `r12-prover` settled/passed；numpy 反例搜索 `r12-skeptic` `counterexamples:[]`），成果落进**同一个 library root**（卡片 id 带 pid）。**gap ④⑦ 完全具备**、**⑤ 具名但不强制（面自陈 advisory）**、**⑥ 部分（member reopen 走通，但那个键未改变结果 ⇒ 负面结论）**。

## 1. A · 两个进程的对话（均 EXIT=0）
| 进程 | pid | 关键回执 |
|---|---|---|
| A | **12072** | `mailbox.send+persist{ok:true,to:"skeptic",persisted:true,durable:true,storeKey:"mailbox"}`；`chat.send+store.patch(chat){hostWired:true}`；**`lean.submit{jobId:"r12-prover",state:"settled",passed:true,exitCode:0}`**；`library.append{id:"prover-pid-12072-08038558"}` |
| B | **3140** | `mailbox.restore{ok:true,durable:true}`；**`mailbox.pending{count:1,unread:1,first:{id:"ml-1",from:"prover",text:"命题：…"}}`**；`mailbox.reply+persist{replyTo:"ml-1"}`；`mailbox.ack+persist{ids:["ml-1"]}`；`chat via store{count:1,fromStore:true}`；**`mathjobs.submit{jobId:"r12-skeptic",exitCode:0,value:{nMax:20000,counterexamples:[],holds:true}}`**；`library.append{id:"skeptic-pid-3140-b8ede75c"}` |
| A2 | **8280** | **`mailbox.pending{count:1,from:"skeptic",replyTo:"ml-1",text:"收到。我独立跑了 n=1..20000 …"}`**；`chat.list{count:1,fromStore:true}`；`boxes:{prover:{pending:1,acked:0},skeptic:{pending:0,acked:1}}` |

**耐久事实**（在进程之外）：`D:\_tmp\r12-root\store\…`（store fold）＋ `Math/Jobs\r12-prover.json`／`r12-skeptic.json` ＋ library 两张卡片。
**两条被抓到的真实语义**：① **耐久要显式** `await mailbox.persist()`（`chat` 没有 `persist()`，剧本里由我**扮演宿主**把 `snapshot()` 写进已声明的 `'chat'` 键，回执标了 `hostWired:true`）；② **`replyTo` 只能锚在未 ack 的邮件**上——先 ack 再 reply 被具名拒 `VMU_MAILBOX_ANCHOR_DANGLING :: ml-1 was delivered and acknowledged: its body is no longer retained` ⇒ 正确次序 **reply → ack**。

## 2. B–E · gap 逐条（`node D:\_tmp\r12-gaps.mjs` EXIT=0）
- **④ TTL/`spend`（具备）**：`check` 到期前 `allowed:true,source:"delegation"`；60 ms 后 **`VMU_DELEGATION_EXPIRED`**（带 `d-1 at …ms`）；长命 `d-2`（budget 5 tokens）`spend 3` ⇒ `tokensRemaining:2`，再 `spend 3` ⇒ **`VMU_DELEGATION_BUDGET`**（带 `requested/remaining` 数字）。
- **⑤ 写域重叠（具名但不强制）**：`status().writeScopes` 自陈 `"advisory only: … never enforced; overlaps are listed below"`；`status().writeScopeConflicts` ⇒ `[{a:"t-1",b:"t-2",scopeA:"Math/Jobs/shared",scopeB:"Math/Jobs/shared/inner"}]`；并发 `assign` 两任务 ⇒ 都 ok、`history()` 4 行（**不静默覆盖**）。**附带**：模块级 `writeScopeConflicts()` 未导出（`tasks.js` 只导出 `scopesOverlap`/`normalizeWriteScope`/`ENFORCED_SCOPE`），可读的那份在 `status()` 里。
- **⑥ member reopen ＋ `fileAppeal`（部分）**：`ballot.reopen({by:"skeptic"})` 在默认与 `vmu.ballot.reopenInitiatorScope="chair"` 下**都成功** ⇒ **该键在我的场景里未改变结果**（**负面结论，未作"键决定结果"的声称**）；`meetings.fileAppeal` ⇒ `{ok:true,appeal:"ap1"}`（只到受理，未走裁定链）。
- **⑦ `vmu.meetings.leaveApprover`（具备，且键真的决定结果）**：`=chair` ⇒ chair 准、office 抛 `VMU_NOT_PERMITTED :: only the CHAIR may decide a leave request: office`；`=office` ⇒ chair 抛 `VMU_NOT_PERMITTED :: vmu.meetings.leaveApprover=office: only the office ("office") may decide: chair`、office 准；汇总 `{chairAllowedChairOnly:true,officeRefusedWhenChair:true,officeAllowedOfficeOnly:true,chairRefusedWhenOffice:true}`。**未改那两个文件**，全部只经注入设置断言。

## 3. 未做项（具名，与 `16-two-process-e2e.md` §F 同一套）
| # | 没证明 | 说明 |
|---|---|---|
| 1 | 两个成员各自是 **LLM 智能体** | 两进程里的主张/异议仍是我写的文本；框架给的是**通道与耐久** |
| 2 | **`records` 跨进程** | `createRecords` 无耐久端口（无 fs/store 形参）⇒ 只在进程内存；跨进程成果走 **library**＋**store** |
| 3 | **`panel` 跨进程** | 本轮未走 `panel`（其 `set` 为 in-memory＋snapshot，未接 store） |
| 4 | `vmu.ballot.reopenInitiatorScope` 决定谁可复议 | 两值下成员 reopen 都成功 ⇒ **未改变结果**（负面） |
| 5 | `fileAppeal` 的裁定链 | 只到受理回执 `ap1` |
| 6 | 写域冲突的**强制** | 设计上 advisory（面自陈 never enforced）；只证并发 assign 都留痕 |
| 7 | 跨机 | 三进程同机同 fs，store 是本地文件 fold |
| 8 | 会议↔票箱联动 | 本轮未再走（R11/R12增量③结论不变；"失败静默"已转 reader-a） |

## 4. 原样命令 ＋ 退出码
```
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-a.json    → A  (pid 12072)   EXIT=0
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-b.json    → B  (pid 3140)    EXIT=0
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-a2.json   → A2 (pid 8280)    EXIT=0
node D:\_tmp\r12-gaps.mjs                              → gap ④⑤⑥⑦      EXIT=0
```
`check-docs` PASS（issues=0）。**本轮未改任何 kernel/docs 文件**；临时脚本与 `D:\_tmp\r12-root` 已清理。结论发 vmu-verify。
