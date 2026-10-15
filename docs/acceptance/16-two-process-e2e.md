# 两个独立内核进程真的对话（Round 12 · `task-90`）

**目标**：把 R11 的"机制预演"推到**真机实例** —— **两个独立 Node 进程**，各带一个成员（`prover`／`skeptic`），
**共用一个研究所目录**（`store/`〔durable port〕＋ `Math/Jobs/` ＋ library root），用**既有面**（`mailbox`／`chat`／
`mathjobs`／`lean`／`library`）真的对话。**证据＝三个进程各自的回执（含各自 pid）＋共享目录里的耐久事实**。
**红线**：`math-computation.js`／`math-engines.js` 一字未动；**未改 `kernel/meetings.js`／`meetingmarker.js`**（本轮归 reader-a，我只断言不修改）；**未新增随包文件 ⇒ 双登记不触发**。

---

## A. 两个进程的对话（`node D:\_tmp\r12-worker.mjs <spec>.json`，三个进程，均 EXIT=0）

| 进程 | pid | 它做了什么（原样回执节选） |
|---|---|---|
| **A**（prover） | **12072** | `store.open{opened:"created",version:1}` → `mailbox.restore{ok:false,code:"VMU_NO_SUCH_OBJECT"}`（**首次运行空库＝具名，不是假成功**）→ `mailbox.send+persist{ok:true,to:"skeptic",persisted:true,durable:true,storeKey:"mailbox"}` → `chat.send+store.patch(chat){ok:true,id:"msg-1",hostWired:true}` → **`lean.submit{jobId:"r12-prover",state:"settled",passed:true,exitCode:0}`**（真机 Lean 4.34.0 编译）→ `library.append{id:"prover-pid-12072-08038558",fingerprint:"08038558…"}` |
| **B**（skeptic） | **3140** | `mailbox.restore{ok:true,durable:true}` → **`mailbox.pending{count:1,unread:1,first:{id:"ml-1",from:"prover",to:"skeptic",text:"命题：Σ_{k≤n} k³ = …"}}`**（**另一个进程读到了 A 的消息**）→ `mailbox.reply+persist{ok:true,replyTo:"ml-1",persisted:true,durable:true}` → `mailbox.ack+persist{ok:true,ids:["ml-1"]}` → `chat via store{readFromStore:true,restored:true,count:1}`（公开频道跨进程可见）→ **`mathjobs.submit{jobId:"r12-skeptic",exitCode:0,outFp:"fp:3c643b9e",value:{nMax:20000,counterexamples:[],holds:true}}`**（真机 numpy 反例搜索）→ `library.append{id:"skeptic-pid-3140-b8ede75c"}` |
| **A2**（prover，新进程） | **8280** | `mailbox.restore{ok:true,durable:true}` → **`mailbox.pending{count:1,from:"skeptic",replyTo:"ml-1",text:"收到。我独立跑了 n=1..20000 的整数比较：无反例…"}`** → `chat.list{count:1,fromStore:true}` → `boxes:{prover:{pending:1,acked:0},skeptic:{pending:0,acked:1}}` |

**共享目录里的耐久事实**（三个进程之外的事实，与回执相互印证）：
- `D:\_tmp\r12-root\store\…`（`kernel/store.js` 的 fold；`'mailbox'` 与 `'chat'` 都是**已声明的耐久键**）；
- `D:\_tmp\r12-root\Math\Jobs\r12-prover.json` 与 `r12-skeptic.json`（**两个进程各自写的作业镜像**，jobId 不同）；
- library root 下两张卡片：`prover-pid-12072-08038558` 与 `skeptic-pid-3140-b8ede75c`（**卡片 id 里就带着进程 pid**）。

**★ 过程中撞到的两条真实语义（都不是我剧本的旁白，是面自己拒的）**：
1. **耐久必须显式**：`mailbox.send()` 只写内存；**`await mailbox.persist()`** 才落 store（第一次跑 B 的 `restore` 得 `VMU_NO_SUCH_OBJECT` 就是这个原因）。`chat` **没有** `persist()`；它靠宿主把 `snapshot()` 写进已声明的 `'chat'` 键 —— 剧本里我**显式扮演宿主**做了这一步（回执里标了 `hostWired:true`），没有假装是面自己做的。
2. **回复要锚在"活"邮件上**：先 `ack` 再 `reply(replyTo:…)` 会被**具名拒** `VMU_MAILBOX_ANCHOR_DANGLING :: ml-1 was delivered and acknowledged: its body is no longer retained`（提示：已投递的邮件要用 durable record 引用）。⇒ 正确次序是 **reply → ack**。

---

## B. gap ④ `delegation` 的 TTL 与 `spend`（走通，`node D:\_tmp\r12-gaps.mjs` EXIT=0）
- `declareAuthority{ok:true,actor:"chair"}` → `grant{id:"d-1",ttlMs:60,budget:{tokens:5}}`；
- **到期前** `check{allowed:true,source:"delegation"}`；
- 等 90 ms 后 **`check` 抛具名拒 `VMU_DELEGATION_EXPIRED`**（"the delegation covering \"mathjobs.submit\" is no longer valid: expired (d-1 at …ms)"）；
- 另起长命委托 `d-2`（`ttlMs:600000, budget:{tokens:5}`）：`spend 3` ⇒ `{ok:true,remaining:{tokensRemaining:2}}`；**再 spend 3 ⇒ 具名拒 `VMU_DELEGATION_BUDGET`**（"requested tokens=3 … but remaining is tokensRemaining=2"）。
**判定**：gap ④ **两项都具备**（TTL 到期与额度耗尽都**具名**，且各自的拒绝信息带着具体数字）。

## C. gap ⑤ `tasks` 写域重叠（**具名但按设计不强制**）
- 建 `t-1{writeScopes:["Math/Jobs/shared"]}`、`t-2{writeScopes:["Math/Jobs/shared/inner"]}`（**重叠**）；
- **面自己声明的政策**（`status().writeScopes`）：`"advisory only: declared by the task creator, never enforced; overlaps are listed below"`；
- `status().writeScopeConflicts` ⇒ **具名列出这一对**：`[{a:"t-1",b:"t-2",scopeA:"Math/Jobs/shared",scopeB:"Math/Jobs/shared/inner"}]`；
- 并发 `assign` 两个任务 ⇒ 两次都 ok、`history()` **4 行**、两个 owner 都如实更新（**不是静默覆盖**）。
**判定**：重叠**被具名**（可读的冲突清单 ＋ 面自陈"advisory"）；**未强制**（不会拒写）——这是设计口径，不是我漏做。**附带发现**：模块级 `writeScopeConflicts()` **没有导出**（`tasks.js` 只导出 `scopesOverlap`／`normalizeWriteScope`／`ENFORCED_SCOPE`），可读的那个在 `status()` 里。

## D. gap ⑥ 复议的"成员动议"与 `meetings.fileAppeal`
- **成员发起 reopen**：`ballot.reopen({by:"skeptic",reason:…})` 在 **默认** 与 `vmu.ballot.reopenInitiatorScope="chair"` 两种设置下**都成功**（`reopenCount:1`）；`chair` 发起也成功。
  ⇒ **诚实的负面结论**：在我这个场景里，`vmu.ballot.reopenInitiatorScope` **没有改变结果**（我没有证明这把键"决定谁可复议"）。**不作"键决定结果"的声称**；要断言它，需要找到真正受该键约束的路径（例如由会议/主席身份触发的 reopen）。
- **`meetings.fileAppeal`**：`{ok:true, appeal:"ap1"}`（成员 skeptic 提交程序性申诉被受理）——**只走到受理回执**，**未走**申诉的裁定/答复链。

## E. gap ⑦ `vmu.meetings.leaveApprover` **真被断言**（两值各自决定谁能批假）
- `= "chair"`：`requestLeave{ok:true}`；**chair 批准 ⇒ ok**；**office 批准 ⇒ 抛 `VMU_NOT_PERMITTED :: only the CHAIR may decide a leave request: office`**；
- `= "office"`：**chair 批准 ⇒ 抛 `VMU_NOT_PERMITTED :: vmu.meetings.leaveApprover=office: only the office ("office") may decide: chair`**；**office 批准 ⇒ ok**；
- 汇总 `{chairAllowedChairOnly:true, officeRefusedWhenChair:true, officeAllowedOfficeOnly:true, chairRefusedWhenOffice:true}`。
**判定**：gap ⑦ **具备**，且这把键**真的决定结果**（两个值各自只放行一个批准人，拒绝信息点名"谁不许、为什么"）。

---

## F. 这条剧本证明了什么 / **没**证明什么

**证明了**
1. **两个独立内核进程真的能对话**：A 写 DM → **B（另一个 pid）从共享 store 读到**（`count:1,unread:1`，正文一字不差）→ B 回复并 ack → **A2（第三个 pid）读到回复**（`from:"skeptic",replyTo:"ml-1"`）。三个进程各自回执 ＋ 共享目录里的耐久键/镜像/卡片互证。
2. **两个成员各自跑了真机任务**：A 的 Lean 实例 `r12-prover`（settled／passed／exit 0）、B 的 numpy 反例搜索 `r12-skeptic`（`counterexamples:[]`），两份作业镜像在**同一个 `Math/Jobs`** 里。
3. **公开频道也跨进程**：`chat` 的 `snapshot()` 由宿主写进已声明的 `'chat'` 键，B 与 A2 都从 store 读回（`count:1`）。
4. **成果归到同一个 library root**：两张卡片 id 分别带 `pid 12072`／`pid 3140`（**同目录、不同进程**）。
5. **gap ④⑦ 完全具备**（TTL 到期 ⇒ `VMU_DELEGATION_EXPIRED`；额度耗尽 ⇒ `VMU_DELEGATION_BUDGET`；`leaveApprover` 两值各自决定批准人）；**gap ⑤ 具名但不强制**（政策自陈 ＋ 冲突清单）；**gap ⑥ 部分**（member reopen 与 `fileAppeal` 受理走通）。
6. **两条真实语义被抓到并具名**：耐久要显式 `persist()`；`replyTo` 只能锚在**未 ack** 的邮件上（`VMU_MAILBOX_ANCHOR_DANGLING`）。

**没证明（具名，一处不写成已走）**
| # | 没证明 | 说明 |
|---|---|---|
| 1 | **两个成员各自是 LLM 智能体** | 两进程里的"主张/异议"仍是**我写的文本**；框架给的是**通道与耐久**，不是智能体。 |
| 2 | **`records` 面跨进程** | `createRecords` 没有耐久端口（opts 只有 `clock/log/settings/bus/exists`）⇒ **records 只在进程内存里**；跨进程的成果我落在 **library**（有 root）与 **store**（已声明键）上。 |
| 3 | **`panel` 跨进程** | 我只用了 `mailbox`／`chat`／`jobs`／`library`；`panel` 这一轮**没有**走（`panel.set` 是 in-memory + snapshot，未接 store）。 |
| 4 | **`vmu.ballot.reopenInitiatorScope` 决定谁可复议** | 两值下成员 reopen 都成功 ⇒ **该键在我的场景里未改变结果**（负面结论，未作声称）。 |
| 5 | **`fileAppeal` 的裁定链** | 只到受理（`appeal:"ap1"`），未走答复/裁定/申诉后的处置。 |
| 6 | **写域冲突的强制** | 按设计**advisory**（面自陈"never enforced"）；"不静默覆盖"只证了**并发 assign 都留痕**，未证"重叠写域被机器阻断"。 |
| 7 | **跨机** | 三进程同机同 fs；store 是本地文件 fold。 |
| 8 | **会议↔票箱联动** | 本轮未再走（R11/R12 增量③的结论保持：一向往通、两处缺口具名，其中"失败静默"已转 reader-a）。 |

---

## G. 原样命令 ＋ 退出码
```
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-a.json    →  A (pid 12072) 6 步，含 lean job r12-prover     EXIT=0
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-b.json    →  B (pid 3140) 8 步，含 numpy job r12-skeptic     EXIT=0
node D:\_tmp\r12-worker.mjs D:\_tmp\r12-spec-a2.json   →  A2 (pid 8280) 读到 B 的回复                     EXIT=0
node D:\_tmp\r12-gaps.mjs                              →  gap ④⑤⑥⑦ 全读数                              EXIT=0
```
（四个临时脚本与 `D:\_tmp\r12-root` 已删除；读数抄进本文。）
