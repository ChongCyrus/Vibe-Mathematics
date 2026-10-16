# 目标 3 · 源码级普查 · `kernel/**` ＋ pack 中间件（Round 83）

> **只读任务**；本文件是**唯一**写域。★ 纪律：**必须读代码下结论**、每条给 `file:line` 与**实读引文**；**不靠命名猜**；老问题（如 `VMU_NO_OPEN_MEETING` 是已知前置条件）**不重复报**。
> ★ 本仓库有**同名/近义不同层**的东西（`kernel/members.js` 名册 vs 工具面 roster；`solved` vs `vote_solved`；`may()` 返回对象而非布尔）⇒ 判定前**先读通调用链**。

## ① 普查范围（实测行数；`Get-Content | Measure-Object -Line`）

**总量**：`kernel/**/*.js` ＝ **103 个文件 / 42,636 行**；`packs/**` 中间件与顶层 ＝ **9 个文件 / 894 行**（合计 ≈ **43,530 行**）。
★ 本报告**不可能**逐行覆盖 43,530 行 ⇒ 阅读策略与**未读清单**见 §⑤；★ **诚实优先**：本报告的结论**只覆盖我实际读到的行**。

### kernel（103 个，按行数降序，供覆盖率核对）

| 行数 | 文件 | 行数 | 文件 | 行数 | 文件 |
|---|---|---|---|---|---|
| 2386 | `kernel/index.js` | 508 | `kernel/activity.js` | 499 | `kernel/tasks.js` |
| 1140 | `kernel/resume.js` | 567 | `kernel/alerts.js` | 498 | `kernel/external.js` |
| 1112 | `kernel/meetings.js` | 598 | `kernel/ballot.js` | 473 | `kernel/arbitration.js` |
| 995 | `kernel/mathjobs.js` | 551 | `kernel/ballotbox.js` | 473 | `kernel/memory.js` |
| 955 | `kernel/turn/index.js` | 512 | `kernel/bidding.js` | 434 | `kernel/capacity.js` |
| 877 | `kernel/idempotency.js` | 528 | `kernel/auditchain.js` | 411 | `kernel/course.js` |
| 857 | `kernel/lean.js` | 537 | `kernel/migration.js` | 407 | `kernel/publication.js` |
| 847 | `kernel/records.js` | 557 | `kernel/paper.js` | 406 | `kernel/minutes.js` |
| 844 | `kernel/mathtools.js` | 559 | `kernel/mailbox.js` | 393 | `kernel/transaction.js` |
| 816 | `kernel/mathadapters.js` | 569 | `kernel/conference.js` | 386 | `kernel/panel.js` |
| 727 | `kernel/prompt/index.js` | 571 | `kernel/charter.js` | 384 | `kernel/compliance.js` |
| 707 | `kernel/bus.js` | 579 | `kernel/meeting.js` | 370 | `kernel/resource.js` |
| 704 | `kernel/ip.js` | 584 | `kernel/scheduler.js` | 365 | `kernel/metrics.js` |
| 697 | `kernel/workflow.js` | 593 | `kernel/replay.js` | 365 | `kernel/rules.js` |
| 695 | `kernel/chat.js` | 594 | `kernel/report.js` | 358 | `kernel/retention.js` |
| 689 | `kernel/library.js` | 612 | `kernel/pack.js` | 336 | `kernel/recruit.js` |
| 682 | `kernel/funding.js` | 598→598 | `kernel/ballot.js` | 292 | `kernel/members.js` |
| 290 | `kernel/control.js` | 288 | `kernel/fairness.js` | 290 | `kernel/store.js` |
| 286 | `kernel/notify.js` | 268 | `kernel/storepolicy.js` | 267 | `kernel/collab.js` |
| 266 | `kernel/trust.js` | 262 | `kernel/guard.js` | 254 | `kernel/lifecycle.js` |
| 250 | `kernel/tenure.js` | 246 | `kernel/grant.js` | 240 | `kernel/governance.js` |
| 235 | `kernel/loader.js` | 234 | `kernel/skills.js` | 233 | `kernel/topology.js` |
| 229 | `kernel/formal.js` | 227 | `kernel/handover.js` | 226 | `kernel/clockguard.js` |
| 221 | `kernel/stateversion.js` | 210 | `kernel/identity.js` | 210 | `kernel/meetinglapse.js` |
| 204 | `kernel/receiptbounds.js` | 204 | `kernel/script-bridge.js` | 203 | `kernel/ids.js` |
| 202 | `kernel/audit.js` | 202 | `kernel/budget.js` | 194 | `kernel/crypto.js` |
| 188 | `kernel/custody.js` | 177 | `kernel/repropack.js` | 177 | `kernel/reviewers.js` |
| 174 | `kernel/registry.js` | 173 | `kernel/fidelity.js` | 171 | `kernel/reportfeedbackdelivery.js` |
| 170 | `kernel/board.js` | 166 | `kernel/projmigrate.js` | 160 | `kernel/discipline.js` |
| 153 | `kernel/ratelimit.js` | 153 | `kernel/work.js` | 144 | `kernel/explain.js` |
| 143 | `kernel/math.js` | 142 | `kernel/resumeflush.js` | 132 | `kernel/library-policy.js` |
| 132 | `kernel/partnership.js` | 124 | `kernel/citations.js` | 114 | `kernel/reportfeedback.js` |
| 89 | `kernel/meetingleave.js` | 66 | `kernel/meetingdomain.js` | 53 | `kernel/meetings-defaults.js` |
| 50 | `kernel/timevalue.js` | 45 | `kernel/contentvalue.js` | — | — |

### packs（9 个）
`packs/institute-min/index.js` 77｜`packs/v3-core/index.js` 134｜`packs/v5r/index.js` 111｜`packs/v5r/notices.js` 106｜`packs/v5r/middleware/artifact-counter.js` 123｜`.../motion-box.js` 75｜`.../prompt-switches.js` 121｜`.../stall-meeting.js` 52｜`.../waitsemantics.js` 95

## ② 确认缺陷（有引文）

| 编号 | file:line | 类型 | 证据引文（实读） | 影响 | 建议修法 |
|---|---|---|---|---|---|
| **K-1** | `kernel/index.js:81` | **类型 6（静默放行）＋类型 7（牵连未改）** | `.filter((id) => (typeof may === 'function' ? may(id, permission) : true))` —— ★ 而同一文件 `:2415` 自己写着：★ *"**`may()` RETURNS AN OBJECT, NOT A BOOLEAN** - `{ ok, allowed, member, slot, permission }`"*（`:2420` 的用法是 `const r = members.may(id, perm)` ⇒ **先取对象再判字段**）；`kernel/members.js:204` `may(id, permission)` | ★★ **对象恒为真值 ⇒ 这个 `filter` 中的 `may(...)` 分支【永远为真】⇒ 该过滤等于不过滤**；而 `:68` 的注释说明它算的是 *"the enfranchised members, make unanimity UNREACHABLE"* ⇒ ★ **它直接喂"全体一致/结题"的资格集合** ⇒ **一个无权限的成员会被算进"有表决权"，或反之** —— ★ 属"静默给出错误答案"，与红线（拒绝要具名）相反 | ★ 照 `:2415-2420` 的既有形态改：`const r = may(id, permission); return !!(r && r.allowed)`；★ 并加一条**结构探针**断言此处读的是 `.allowed` 而非整个对象；★ 反例：让 `may` 返回 `{ok:false,allowed:false}` ⇒ 该成员必须**不在**结果集里 |

## ③ 疑似（附"定论所需的最小观测"）

| 编号 | file:line | 类型 | 现象（实读） | ★ 定论所需的最小观测 |
|---|---|---|---|---|
| **K-2** | `kernel/activity.js:469` | 类型 6（无理由的吞异常） | `try { d() } catch (e) { /* ignore */ }` —— ★ 与**同文件**的孪生兄弟写法**不一致**：`:131`／`:141` 写 `/* a cleanup must never throw */`、`:399` 写 `/* a cleanup must never throw into a settle path */`、`:402` 写 `/* the signal may already be gone */` ⇒ 它们**给了理由**，`:469` 只写 `ignore` | ★ 读 `:460-472` 的上下文，判定 `d()` 是否属"必须绝不抛"的 cleanup 族：★ 若是 ⇒ 归 §④（应把注释补成与兄弟同形）；★ 若不是 ⇒ **确认缺陷**（真错误被吞） |
| **K-3** | 真机 `capacity.retire is not a function` | 类型 2（悬空调用） | ★ 我在 `kernel/*.js`（**注意：只扫了 `kernel/` 顶层，未含子目录**）用 `\.retire\(` **未命中** ⇒ ★ **调用点不在这层**（真机栈指向 `tools/`，而 `tools/` **不在本任务范围**）；`kernel/capacity.js` 我按方法名扫出的面里**未见 `retire`** | ★ 在 **`tools/**`＋`kernel/**`（含子目录）**全量搜 `\.retire\(`，并把命中处的接收者与 `createCapacity` 的**返回对象逐键**核对 ⇒ 才能定"是名字写错、还是方法从未实现" |
| **K-4** | `kernel/members.js:110 roster()` vs 工具面 roster | 类型 5（同名不同层） | `kernel/members.js:110 roster()`（**内核槽位名册**，由 `:118 assignRole` 写入）；而同日我读到工具面 `tools/control.js:28` 的 `roster` 走的是 **`kernel.identity.list()`** ⇒ ★ **两处都叫 roster，读的是两本账** | ★ 读 `kernel/identity.js` 的导出面 ＋ 全量 grep `\.roster(` ⇒ 逐调用点标注"读的是哪一本"，才能判是"设计如此"还是**契约不一致**（★ Lead 已口头裁定"收敛成一份"，本条是它的**证据索引**） |

## ④ 已核实非问题（附理由；**同样有价值**）

| 编号 | file:line | 结论 | 理由（实读） |
|---|---|---|---|
| N-1 | `kernel/activity.js:120`／`:131`／`:141`／`:146`／`:200`／`:399`／`:402`／`:452`／`:457` | ★ **非缺陷：有理由的吞异常** | 逐条注释即为理由：`/* a cleanup must never throw */`／`/* logging must never… */`／`/* the signal may already be gone */` ⇒ ★ **这是"清理/日志路径上的正确做法"**，不是"静默假装成功"（本仓红线针对的是**业务结论**被静默吞掉，不是 cleanup 抛进 settle 路径） |
| N-2 | `kernel/alerts.js:108`／`:118`／`:122`／`:420` | ★ **非缺陷：告警自身的失败不得再抛** | `log.append` 包在 try 里，且失败时**改走 `bus/emit-failed` 事件**（`:118`／`:122` 的 payload 就是那次失败的具名记录）⇒ ★ **是"具名降级"而不是静默 |
| N-3 | `kernel/memory.js:175`／`:188`／`:192` | ★ **非缺陷：`may()` 的两义是同名不同层，且已具名拒** | `memory.js:8` 注释逐字：*"① MEMORY NEVER AUTHORIZES — `may()`/`authorize()` ALWAYS refuse by name (`VMU_MEMORY_NOT_AUTHORITY`, S-3)"* ⇒ ★ **它拒绝而不是放行** ⇒ 与 K-1 不是同一件事（K-1 是**把返回对象当布尔**，N-3 是**故意拒**） |

## ⑤ 覆盖率说明（**诚实优先**）

★ **本报告不是全量普查**，理由与边界如下：

1. ★★ **规模**：范围内 **43,530 行**（kernel 103 文件/42,636 行 ＋ pack 9 文件/894 行），本轮**实际逐行读到的只有**：`kernel/index.js`（`:68`／`:81`／`:2415`／`:2420` 一带）、`kernel/members.js`（`:100`／`:110`／`:118`／`:138`／`:151`／`:172-177`／`:204`）、`kernel/activity.js`（`:120`／`:131`／`:141`／`:146`／`:200`／`:399`／`:402`／`:452`／`:457`／`:469`）、`kernel/alerts.js`（`:108`／`:118`／`:122`／`:420`）、`kernel/memory.js`（`:8`／`:175`／`:188`／`:192`）、`kernel/capacity.js`（`:35`‑`:192` 的方法名扫描）、`kernel/ballotbox.js`（转引，未自读）＋ 全范围**模式扫描**（`may(`／`.retire(`／空 catch）。★ 合计**约 60 行精读 ＋ 三条模式全扫** ⇒ ★ **覆盖率远低于 1%**，**我不声称"扫过全仓"**。
2. ★ **未读**：其余 ~101 个 kernel 文件（含 `index.js` 的绝大部分 2,300 行、`meetings.js` 1,112、`turn/index.js` 955、`resume.js` 1,140、`mathjobs.js` 995、`lean.js` 857、`records.js` 847、`idempotency.js` 877、`mathadapters.js` 816、`bus.js` 707、`prompt/index.js` 727 …）**全部未逐行读**；★ pack 的 9 个文件（894 行）**本轮一个都没打开** ⇒ ★ **本轮对 pack 中间件的发现为 0，不是"没问题"，是"没读"**。
3. ★ **方法说明**：我用的是**模式扫描定位嫌疑 ＋ 就地精读定论**（本任务的红线："必须读代码下结论，不许靠命名猜"）⇒ ★ 因此 §② 的每一条**都附了实读引文**；★ 而**没有引文的条目一律进 §③**，不进 §②。
4. ★ **未跑**：未跑 T1／全量；未跑 git；未改任何代码；临时件未落（本轮只用 PowerShell 读）。
5. ★ **下一步（若要提高覆盖率）**：按行数降序取前 20 个文件（约 18,000 行）做逐文件精读，优先 `index.js`／`turn/index.js`／`meetings.js`／`members.js`／`ballotbox.js`／`recruit.js`／`capacity.js` —— ★ 它们正是"资格/表决/名册/结题"这条链所在。

