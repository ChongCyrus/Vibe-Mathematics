# Round 11 · `task-81` 交账（多智能体协作端到端剧本）

**负责人**：`v5r-reader-b`。**主交付**：`_handoff/vmu/15-multiagent-e2e.md`（剧本＋27 步读数＋证明了什么/没证明什么）。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**；未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（脚本已删）；**未新增随包文件 ⇒ 无需双登记**（`_handoff/` 文档 + `D:\_tmp` 临时脚本都不在 `package.json#files` / `installer.js PRESETS.*.files` 内）；**没走的面一处都没写成已走**。

---

## 0. 一句话
**27/27 步走通**（`node D:\_tmp\r11-multiagent.mjs` ⇒ `=== R11 DONE: 27/27 steps walked ===` **EXIT=0**）：`prover` vs `skeptic` 在同一道题上对抗，用框架自己的面走完 **委托（含越权拒/根授权/越界拒）→ 任务依赖门禁 → 异议广播 → 表决（反对票悬置裁定）→ 主席裁定 → 复议留痕 → 并发写者不丢不重 → 杀成员内核后续算 → 重派 → 双方成果幂等归档 → 两把键各自决定结果**。

## 1. 逐段读数（原样）
| 段 | 关键读数 |
|---|---|
| **A delegation** | 越权 `VMU_DELEGATION_ESCALATION :: chair has no authority over commands[mathjobs.submit] resources[Math/Jobs/skeptic]` → `declareAuthority{ok:true}` → `grant{ok:true,delegationId:"d-1",to:"skeptic"}` → 范围内 `{allowed:true,source:"delegation"}` → 越界 `VMU_DELEGATION_ESCALATION :: … not covered by any delegation to skeptic: resources[Math/Jobs/prover]` |
| **D tasks** | `t-1`（skeptic）/`t-2`（prover，deps=[t-1]）；门禁 `VMU_STATE :: unmet dependencies for t-2: t-1`；`assigned→doing` |
| **B 异议广播** | `tasks.objectAssign(t-1,by=skeptic)` ⇒ listener 收到 `{id:"t-1",by:"skeptic",why:"…",state:"doing",owner:"skeptic"}`（`listenerCalls:1`） |
| **B 表决** | 1:1 ⇒ **`VMU_BALLOT_TIE_UNRESOLVED`**、箱子仍 `open`；主席投第 3 票 ⇒ `{result:"accept"}`、`ranked:[{accept,2},{reject,1}]`、`closed`；已裁定再投票 ⇒ **`VMU_STATE`** |
| **B 复议** | `reopen({reason:'新证据：反例搜索 n≤20000 无矛盾'})` ⇒ `{ok:true,reopenCount:1,state:"open"}` ⇒ 复议轮 `{result:"accept",reopenCount:1}` |
| **H 键决定结果** | `vmu.ballot.minVotes`: 0 ⇒ `accept` / 3 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET`；`vmu.ballot.tieRule`: `unresolved` ⇒ 拒 / `chair` ⇒ `accept`（两把键各自单独改变结果） |
| **C meetings** | `m1` 开成；`quorum.unanswered:[prover,skeptic]` 被**具名**；`attend×2/speak/motion/vote×2` 全 true；`confirmMinutes` ok、`minutesLines:4`、`close` ok |
| **E 并发** | 并发 assign ⇒ 两次都 ok、`historyRows:3`、`finalOwner:"skeptic"`；并发投票 ⇒ `votes:2`；**同成员重复票 ⇒ `VMU_CONFLICT`** |
| **F 杀内核** | `{running,attempts:1}` ⇒ **分支②** `{action:"interrupted-then-requeued",attempts:2,lease:"acquired"}` ⇒ `{settled,attempts:2,exitCode:0}`，真实结果 `{nMax:20000,counterexamples:[],holds:true}`；`leases{acquired:1,…}` |
| **D 重派** | `{ok:true,owner:"prover",state:"doing"}` |
| **G 归档** | records：`r-1`（prover，`sameId:true`）／`r-2`（skeptic，distinct）；library：`cube-sum-identity-multi-agent-r11-95e79a5b`（`sameId:true`）、`indexHealth{read:1,…}` |

## 2. 未做项（具名，与 `15-multiagent-e2e.md` §3 同一套）
| # | 未证明 | 说明 |
|---|---|---|
| 1 | **两个独立内核进程各带一个成员** | 除 F 段（skeptic 的作业由另一进程拥有并被杀）外，两个身份在**同一个 Node 进程**里 |
| 2 | **独立 LLM 智能体** | 主张/异议是剧本里写的；框架提供**协作机制**，不是智能体本身 |
| 3 | **会期板 ↔ 票箱联动** | **R12 增量已实测**（`15-multiagent-e2e.md` §5）：`meetings.vote` 的 `ballot` 接缝**真的**能把会议表决落进票箱（2 票入账、票箱 `close()` ⇒ `accept`），条件是 **`vote()` 里点名 motion** ＋ **宿主提供 `motion→box` 映射**；**仍未做**：动议**自动开箱**、**联动失败静默**（接缝拒被 `try/catch` 吞掉，投票人仍得 `ok:true`）——改判条件＝改 `kernel/meetings.js`（**不在我写范围，需 Lead 授权**），约 20–40 行＋一条"缺环必须可见"断言 |
| 4 | `delegation` 的 TTL 过期 / `spend` 预算面 | 未走 |
| 5 | `tasks.writeScopeConflicts`（重叠写域） | 未构造冲突 |
| 6 | 复议的"成员动议"路径 / `meetings.fileAppeal` | 未走（走的是主席裁定后复议） |
| 7 | `vmu.meetings.leaveApprover` 那把键决定结果 | 只注入、未断言（H 段用的是表决面两把键） |
| 8 | 跨机/持久卷 | 未验 |

## 3. 命令 ＋ 退出码
```
node D:\_tmp\r11-multiagent.mjs   → === R11 DONE: 27/27 steps walked ===   EXIT=0
```
（脚本与 worker 已删；读数抄进 `15-multiagent-e2e.md`。）
**本轮未改任何 kernel/docs 文件**（只加两份 handoff ＋ 临时脚本）。**未新增随包文件** ⇒ 双登记要求不触发（我核过：`_handoff/` 与 `D:\_tmp` 都不在 `package.json#files` 或 `installer.js` 的 `PRESETS.*.files` 里）。
