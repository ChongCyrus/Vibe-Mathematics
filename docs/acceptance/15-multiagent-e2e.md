# 多智能体协作：端到端剧本（Round 11 · `task-81`）

**舞台**：两个成员在**同一道题**上对抗 —— **`prover`（证明者）** 主张 `Σ_{k≤n} k³ = (n(n+1)/2)²` 已被证明；
**`skeptic`（反例者）** 负责**证伪**它；**`chair`（主席）** 是委派根与裁定者。
**驱动**：`node D:\_tmp\r11-multiagent.mjs` ⇒ **`=== R11 DONE: 27/27 steps walked ===`** **EXIT=0**（脚本已删；读数抄在本文）。
**真机**：Python 3.12.10（numpy 2.5.3）＋ Lean 4.34.0（`res-lean10` 沿用 R10 的回执）。**红线**：`math-computation.js`／`math-engines.js` 一字未动；**未新增随包文件 ⇒ 无需双登记**（新增的只有 `_handoff/` 下的文档与 `D:\_tmp` 的临时脚本）。

---

## 0. 剧本（27 步全走通）

| 段 | 动作 | 真实读数 |
|---|---|---|
| **A 委托** | ① 主席**越权委托** ② `declareAuthority` ③ `grant` ④ 校验在范围内 ⑤ 校验越界 | ① **具名拒** `VMU_DELEGATION_ESCALATION :: chair has no authority over commands[mathjobs.submit] resources[Math/Jobs/skeptic]`；② `{ok:true,actor:'chair'}`；③ `{ok:true,delegationId:'d-1',to:'skeptic'}`；④ `{allowed:true,source:'delegation'}`；⑤ **具名拒** `VMU_DELEGATION_ESCALATION :: the requested scope is not covered by any delegation to skeptic: resources[Math/Jobs/prover]` |
| **D 任务链** | 建 `t-1`（反例搜索，owner=skeptic）→ `t-2`（机器检查，owner=prover，deps=[t-1]）→ 依赖门禁 → doing | `t-1 {state:"assigned",writeScopes:["Math/Jobs/skeptic"]}`；门禁 **`VMU_STATE :: unmet dependencies for t-2: t-1`**；`t-1 assigned→doing` |
| **B 异议广播** | `tasks.objectAssign(t-1, by=skeptic)`（R10 新接的 `task/assign-objected`） | `listenerCalls:1`，payload `{id:"t-1",by:"skeptic",why:"反例搜索尚未完成：不接受\"恒等式已证\"的归属",state:"doing",owner:"skeptic"}` |
| **B 表决** | `open` → prover=accept、skeptic=**reject（异议票）** → `close` | **`VMU_BALLOT_TIE_UNRESOLVED`**（1:1 平票 ⇒ **不裁定**，箱子仍 `open`）：`tally{cast:2,votes:2}` |
| **B 裁定** | 主席投决定票 → `close` | `{result:"accept"}`、`tally{cast:3,votes:3,ranked:[{accept,2},{reject,1}]}`、`state:"closed"` —— **异议被记录但未否决** |
| **B 冻结** | 已裁定箱子再投票 | **具名拒** `VMU_STATE`（不重复计票） |
| **B 复议** | `reopen({reason:'新证据：反例搜索 n≤20000 无矛盾'})` → 再表决 → `close` | `{ok:true,reopenCount:1,state:"open"}` ⇒ 复议轮 `{result:"accept",reopenCount:1}` |
| **H 键真的决定结果** | 同票、不同键值 | `minVotes`: `floor0 ⇒ {ok:true,result:"accept"}` vs `floor3 ⇒ {ok:false,code:"VMU_BALLOT_MIN_VOTES_NOT_MET"}`；`tieRule`: `unresolved ⇒ 拒` vs `chair ⇒ {ok:true,result:"accept"}` |
| **C 会期板** | `open({type:'ordinary',chair:'chair',roster:[prover,skeptic]})` → `attend×2` → `speak` → `motion` → `vote×2` → `confirmMinutes` → `minutes` → `close` | 开成 `m1`；`quorum{probability…}` 里 **`unanswered:[prover,skeptic]` 被具名**（"unanswered members are named, never passed over silently"）；`attendP/attendS/speak/motion/voteP/voteS` 全 true；`confirm:true`、`minutesLines:4`、`close:true` |
| **E 并发写者** | `Promise.all([assign(t-2,prover), assign(t-2,skeptic)])` ＋ 两成员并发出票 ＋ 同成员重复出票 | `assignBothOk:true`、`finalOwner:"skeptic"`、`historyRows:3`（**无丢失更新**：两次 assign 都进历史）；`bothVotesOk:true`、`votesRecorded:2`；**重复票被拒** `VMU_CONFLICT`（**不重复计票**） |
| **F 杀成员内核** | 另起进程持有 `skeptic` 的**反例搜索**（n=1..20000 真机 numpy）→ **SIGKILL 那个进程** → 新实例 `recover()` | 崩溃时 `{state:"running",attempts:1}` ⇒ **分支②** `{action:"interrupted-then-requeued",attempts:2,lease:"acquired"}` ⇒ `final{state:"settled",attempts:2,exitCode:0}`，**真实结果 `{nMax:20000,counterexamples:[],holds:true}`**；`leases{acquired:1,heldByOther:0,stolenStale:0,unenforced:0}` |
| **D 重派** | 成员内核死后把 `t-1` 重派给 `prover` | `{ok:true,owner:"prover",state:"doing"}` |
| **G 记成果** | `records.put`（两个成员各一条）＋ 同内容再写；`library.append`（结论卡片）＋ 同内容再归档 | `r-1`（prover，`sameId:true,deduplicated:true`）、`r-2`（skeptic，**distinct**）；`cube-sum-identity-multi-agent-r11-95e79a5b`／`95e79a5b0ff8…`（`sameId:true`），`indexHealth{read:1,deferred:0,unreadable:[],missingId:[]}` |

---

## 1. 逐步证据（原样片段的补充）

- **两条越权拒都来自同一条不变量**（S-2）：*"the delegation would EXPAND authority"* —— 主席在**没有根授权**时不能把"提交作业＋写 skeptic 目录"授予别人；`declareAuthority` 之后同一份 scope 立刻可授予。**这是"权限不会凭空扩大"的可执行证据**，不是文档承诺。
- **`task/assign-objected` 真被广播**：我注册了 `bus.on({id:'r11-observer', on:['task/assign-objected']}, …)`，`listenerCalls:1` 且 payload 带 `by/why/state/owner`（`busEntries:0` 是 bus 的 entries 只记中间件声明，不含事件流 —— 如实写在这里，不夸张）。
- **平票＝不裁定**：`VMU_BALLOT_TIE_UNRESOLVED` 且 `stateAfterTie:"open"`；主席投第 3 票后 `ranked` 才出现并给出 `accept`。
- **复议有据**：`reopen` 需要 `reason`（无理由会被拒），成功后 `reopenCount:1`、箱子回到 `open` 再收票再裁定。
- **H 的两把钥匙**：`vmu.ballot.minVotes`（法定票数）与 `vmu.ballot.tieRule`（平票规则）**同票不同果** —— `accept` ↔ `VMU_BALLOT_MIN_VOTES_NOT_MET`、`accept` ↔ `VMU_BALLOT_TIE_UNRESOLVED`。
- **并发写者**：`tasks` 的两次并发 `assign` 都进 `history()`（3 行），最终 owner 是可解释的 last-writer；`ballotbox` 两份并发票都入账（`votes:2`），**同一成员重复出票被 `VMU_CONFLICT` 拒**（不重复计票）。
- **成员的内核死了，研究所继续**：镜像停在 `running`，新实例只凭镜像续算到 `settled`，且**反例搜索的真实结论**（`counterexamples:[]`）落进回执 —— 这是"多智能体基础设施"最该有的一条。

---

## 2. 这条剧本证明了什么

1. **两个成员真的在同一道题上对抗**：一个主张、一个**主动找反例**；两者都跑了**真机**任务（prover 的机器检查实例、skeptic 的 n≤20000 反例搜索），结论互相独立。
2. **异议是机制而非台词**：`tasks.objectAssign` 触发**具名广播**；表决里**反对票真的让裁定悬置**（`VMU_BALLOT_TIE_UNRESOLVED`），需要**主席裁定**或**复议**才能通过；已裁定的箱子**拒收新票**。
3. **委托不允许扩权**：越权委托被 `VMU_DELEGATION_ESCALATION` 拒（含"谁没有对什么的权限"），根授权声明后才生效；**越界校验同样被拒**，且答"哪个资源没被覆盖"。
4. **重派与计数可解释**：成员内核死后任务被**重派**（owner 从 skeptic 变 prover），`tasks.history()` 留住每一次 assign；作业侧 `attempts 1→2` 且**恢复分支②**被具名。
5. **并发不丢不重**：并发 assign 两次都留痕；并发投票都入账；**同成员重复票被拒**（`VMU_CONFLICT`）。
6. **可调控性是真的**：两把 `vmu.ballot.*` 键**各自单独**改变裁定结果（`accept` ↔ 具名拒），且它们都出现在该面的 `keysUsed()` 里。
7. **成果归档幂等**：两个成员的发现是**不同**的 record（`r-1`/`r-2`），同一成员同内容重复写**不产生第二条**；结论卡片在 library 里同样幂等。

## 3. 这条剧本**没**证明什么（具名边界）

| # | 没证明 | 说明 |
|---|---|---|
| 1 | **真正的多进程/多机协作** | 两个"成员"是**同一个 Node 进程里的两个身份**（除 F 段：skeptic 的作业由另一个进程拥有并被杀）。**没有**两个独立内核进程各自跑一个成员。 |
| 2 | **独立的 LLM 智能体** | `prover`／`skeptic` 的"主张/异议"是**我在剧本里写的**，不是两个模型各自推理出来的；框架提供的是**协作机制**（委托/表决/会议/广播/重派/归档），不是智能体本身。 |
| 3 | **会期板与表决的联动** | `meetings` 走通（议程/发言/动议/表决/纪要/主席），但**没有**把 meeting 的动议与 ballotbox 的箱子绑定（`ballot` 接缝传了但未在会议里真正投一次票）。 |
| 4 | **`delegation` 的时间/预算面** | 只用了 `grant`／`check`／`declareAuthority`；`ttlMs` 过期后的行为、`spend`（预算）**未走**。 |
| 5 | **`tasks` 的 `writeScopes` 冲突检测** | 建了两个任务但**没有**构造**重叠写域**去触发 `writeScopeConflicts`。 |
| 6 | **复议的"另一条路径"** | 走的是"主席裁定后复议"；**没有**走"成员发起复议动议并被表决"，也**没有**走 `meetings.fileAppeal`（会议申诉）那条链。 |
| 7 | **`vmu.meetings.leaveApprover` 那把键真的决定结果** | H 段的"键决定结果"用的是**表决面**两把键；会议面的那把键**只注入了没断言**。 |
| 8 | **跨机/持久卷** | 同机同 fs；镜像在本地临时目录。 |

---

## 4. 与用户用途的对接

用户要"为数学研究、**多智能体协作数学研究**提供底层框架与基础设施"。R10 证明了**单智能体主干**（任务→多引擎真算→形式化→归档→续算→起稿）；**本轮补上了协作主干**：
`委托（不许扩权）→ 任务依赖与门禁 → 异议广播 → 表决（反对票可悬置裁定）→ 主席裁定／复议留痕 → 并发写者不丢不重 → 成员内核被杀后研究所续算 → 双方成果幂等归档 → 两把键各自改变结果`。
**还没做、但最该做的下一步**：让**两个独立内核进程**各带一个成员（含各自的模型/工具），用一个**共享研究所目录**（`Math/Jobs`＋`records`）真的对话——本剧本是这条路的**机制预演**，不是它的完整实例。

---

## 5. 追加（R12 · 增量③）：**会期板 ↔ 票箱**的联动实测

上面 §3 第 3 条说"会期板↔票箱联动未做"。我按 vmu-verify 的建议做了**最小增量**并实测（`node D:\_tmp\r12-meeting-ballot.mjs` ⇒ **EXIT=0**，脚本已删）：

**机制在哪**：`kernel/meetings.js:741` —— `vote()` 会把票**镜像**进注入的 `ballot` 接缝：
`ballot.cast({ meeting, motion: target ? target.id : null, member, value })`。

**实测（真接缝、真票箱）**：
1. `open` 会期 `m1`、`attend×2`、`motion` ⇒ `mo1`；
2. **接缝外**补上内核不携带的那一步映射：为 `mo1` 开一个箱子（`bx-1`），记 `motion→boxId`；
3. 会议里投票 **带上 `motion: 'mo1'`** ⇒ `vote` ok，接缝 0 错误 ⇒ **票箱真的收到 2 票**（`status.votes:2`）；
4. 票箱 `close()` ⇒ `{result:"accept", tally{cast:2,votes:2,ranked:[{accept,2}]}}` ⇒ **会议的表决结果真的落在票箱里**；
5. **反例（联动缺环时的行为）**：`vote()` **不点名 motion**（或该 motion 没映射到箱子）⇒ 接缝收到 `motion:''`、返回 `{ok:false,code:'NO_BOX_FOR_MOTION'}`，而 **`vote()` 依然返回 `ok:true`**（`meetings.js:741` 的 `try/catch` 把它吞掉）⇒ **票没进箱，投票人却看不出**。

**判定**：
- **已具备（本轮实测）**：会议的表决**能**真的落到框架自己的票箱（一票一入账、可由票箱 `close()` 出裁定）——条件是**调用方在 `vote()` 里点名 motion**，且**宿主/消费者提供 `motion→box` 映射**。
- **仍是缺（具名 + 改判条件）**：① **动议不会自动开箱**（内核不调 `ballot.open`，映射必须由外面做）；② **联动失败是静默的**（接缝拒被 `try/catch` 吞掉，投票人拿到 `ok:true`）。改判条件：把"动议→开箱/绑定"与"接缝拒必须上抛或计数"落进 `kernel/meetings.js`（该文件**不在我 task-81 的写范围**，需先报 Lead 授权）；成本约 20–40 行 ＋ 一个"缺环必须可见"的断言。

