# Phase 3 · **P-a parity（回合／编排）** —— 单体 `vibe-math-v5r.js` 到底实现了什么

> ★ 状态：**进行中（边读边写盘）**，按 `task-221` 要求增量落盘。
> ★ 交付物＝**本文件一个**；★ **不改代码**、**不跑 T1／全量**、**不跑 git**、临时件 `D:\_tmp`、不碰 `token.txt`。

## 0. 口径（照 `docs/acceptance/phase3-parity-definition.md` 的三类裁定，**不混算**）

| 类 | 问的是 | 判据 |
|---|---|---|
| **P-a** | ★ **单体里真的实现了的东西** | 同输入 ⇒ 输出／中间状态一致（**本文件只做 P-a**） |
| **P-b** | 只存在于 13 份 spec 里的行为 | vmu 是否实现了 spec 所写行为 |
| **P-c** | vmu 有、原版**从来没有**的机制 | ★ **不是差异**，是超出 |
| **absent** | 原版有、**vmu 无对应** | 记为缺口 |

★ 立法（definition §2.3）：**禁止**用"代码里 grep 命中 0"推出"原版没有该语义" —— 本文件**只按读到的行**下判定，读不到就写"未读"。

## 1. 被读对象与版本

| 项 | 值 |
|---|---|
| 文件 | `Vibe-Mathematics/vibe-math-v5r/vibe-math-v5r.js` |
| 行数 | ★ **11,494 行**（我用 `Get-Content | Measure-Object -Line` 实测）vs ★ `phase3-parity-definition.md:12` 记 **11,597 行** ⇒ ★ **两者不一致**，我**未核**原因（可能是计数方式或修订差异）⇒ **本文件所有行号以我实测的那份为准**，并声明"11,494 行修订" |
| 姊妹文件 | `math-computation.js` 1,481／`math-engines.js` 197（**本轮不读**） |
| 已比过的部分 | ★ `phase3-parity-prompt-assembly.md`（提示词**装配**，含顺序反转的真实差异）⇒ ★ **本文件引用它、不重复推导**；★ 但**不得只凭提示词站点宣布 P-a parity** |

## 2. 逐机制表（每行带单体行号）

★ **判定的诚实标注**：本轮的"判定"是**在单体侧读到了该语义**（P-a 的**形状**），★ **同输入对照（P-a 的判据本体）我没做** —— 单体是 preset 里的一个文件，我没有为它构造入口去跑，且任务只要求读。⇒ 判定列写 `P-a`，**"行为同不同"列会明确标出"对照未做"**，不让读者把它当成已验证的一致。

| # | 机制 | 做什么（读到的事实） | 单体行范围 | vmu 对应（模块/键） | 行为同不同 | 判定 |
|---|---|---|---|---|---|---|
| T1 | **回合结束＝唯一的推进驱动** | 注释逐字：*"The end event is the **ONLY driver** of the institute's progression"*；**幂等**：`inflight.get(childId)` 未注册就直接 `return`（防重放/迟到 `subagent/end` 把每个副作用跑两遍，v4 §28-T29）；**这一轮的 kind 在开轮时记录**（`rec.kind`，PR #14 / S24），`wakeKind` 只是旧 legacy 形状的回退；异常收尾写**具名**行（`【异常】… 的一轮以 <stopReason> 结束`） | `:9662-9700`（函数 `onMemberEnd` 起于 `:9666`） | `kernel/activity.js` ＋ 入口的**回合边界监听**（`metrics` 桥，我在 R19 落的）＋ `vmu.turn.feedback` | 形状相同（"一轮结束才推进"＋按 in-flight 令牌幂等）；★ **对照未做** | **P-a** |
| T2 | **中断轮的"待续"语义（具名保存，不静默丢）** | `stopReason === 'completed'` ⇒ 清 `pendingWork`；**否则保留**并写 `reason:'host-ended'`、`interruptedAt: now()` | `:9691-9698` | `kernel/resume.js`＋`vmu.resume.*`（`autoRecover`／`journalCap`／`readBack`／`writeThrough`） | 形状相同（正常收尾清、异常收尾带因留存）；★ **对照未做** | **P-a** |
| T3 | **调度只有一趟在飞（busy-set 预算才有意义）** | `scheduling`/`reschedule` 互斥 ＋ 外层 frame `do…while(reschedule)` 排空；注释逐字 *"keeps **exactly one scheduling pass in flight**, which is what makes the busy-set budget meaningful"* | `:9136-9159`（`scheduleNext` 起于 `:9144`） | `vmu.activity.maxWaiters`／`noPeerShortCircuit`／`timeoutPolicy`（★ 键名我取自 `settings/schema.js` 的键行；**未读 vmu 的调度实现**） | ★ **未对照**（我只在单体侧读到互斥语义） | **P-a（单体侧）** |
| T4 | **被拒的 spawn 是"延后"不是"丢失"** | 注释逐字：*"refused member spawns are **DEFERRED, not lost**"*；队列**从持久状态派生**（`phase:'failed'`＋`failReason:'activation-limit'`），**不建第二真相源**；重试受 **STOPPING RULE** 界定，**非容量类** provisioning 错误**停止**重试（"a broken provider must not be resurrected"）；`isCapRefusedMember` 一个判据同时供自动重试与 `resume` 重建 | `:9160-9180` | ★ **我在 vmu 未见到对应物**（`vmu.activity.*`／`vmu.tasks.*` 里没有对应语义的**证据**）—— ★ **但"没见到" ≠ "没有"**：**我没有搜 vmu** ⇒ 记为**待核缺口** | — | **absent（待核）** |
| T5 | **每回合注入的通知（有上限）** | 组装阻塞项：被阻塞任务／无人认领任务／**最久未活动的活跃成员**（带 `idleS = (now()-since)/1000` 秒）；★ **最多 3 条**（`out.slice(0, 3)`）；无阻塞时给默认行 `'暂无阻塞项：等院士分派任务或发起验证'` | `:1556-1573`（`wakeIfIdle` 在 `:228` 被点名） | `vmu.turn.*`（`objective`／`feedback`／`selfCheck`…）＋ 提示词管线 | 形状相同（"每回合注入、有上限"）；★ **上限 3 这个数**正是可做同输入对照的点 —— **未做** | **P-a** |
| T6 | ★ **默认通知文本里写死了机构名** | `:1572` 的默认行含 **`院士`**（原版把机构词写进**运行期文本**） | `:1572` | ★ vmu **把它参数化了**：`vmu.turn.instituteName`（键名实测存在于 schema） | ★ **不同**：原版硬编码、vmu 可声明 | **P-a（差异）** |
| T7 | **phase 是一等成员字段，且会"关掉唤醒"** | `createdAt: now(), phase: 'idle'`（`:488`）；`patch.phase` 可改（`:603`）；`let phase = 'idle'`（`:1190`）；`phase = cur.phase || phase`（`:1492`）；★ 注释 `:227`：*"after `phase='solved'` the machinery **refuses to wake** members"* ⇒ **phase 参与编排门控** | `:227-228`／`:488`／`:603`／`:1190`／`:1492` | `kernel/members.js`（成员态）＋ `vmu.turn.*`／`vmu.control.*`（`idleAction`／`pauseScope`／`canPauseRoles`） | ★ **未对照**（我只读到单体侧的"phase 门控唤醒"） | **P-a（单体侧）** |
| T8 | **许可/审批：自管无审批步、办公室是唯一审批者、且办公室"不投递"** | `:77-86` 注释：self/team 的改动**没有审批步**（"no approval step exists"）；`:566` *"and **only the office may approve** either"*；`:750` 办公室地址的请求**永不被"投递"**（"the office is not a member"） | `:77-86`／`:566`／`:750` | `vmu.human.*`（`approvalQueueCap`／`vetoScope`／`onTimeout`／`dashboardScope`）＋ `vmu.mailbox.*` | ★ **不同**：原版**刻意不投递**给非成员审批者；vmu 有**一等公民的人工队列**（`approvalQueueCap`）⇒ 这是**行为差异**，不是缺失 | **P-a（差异）** |

## 3. 已读 / 未读 登记（★ 两边都写）

**已读（逐行）**：`:77-86`／`:227-228`／`:452`／`:488`／`:566`／`:603`／`:750`／`:1190`／`:1492`／`:1556-1573`／`:9136-9180`／`:9662-9700` —— ★ **合计约 80 行 ≈ 全集 11,494 行的 0.7%**。★ 我不掩饰这个比例：**T1–T8 的"读到"只覆盖这些行**，其余一律按未读处理。

**未读（明确列出）**：`wakeMember` 的函数体（起于 `:3859`，★ 我只读到它的**定义行**）／`handleReply`／`parseReply`／`spawnMember`（`:9171` 只引用到 `v5:2037`）／会议与表决路径（`:1764-1810` 只读到**锚点行**）／`maybeRealCompact`／`schedulePass` 本体（`scheduleNext` 只调用它）／`:600-1600` 与 `:9700-11494` 的绝大部分／`math-computation.js`（1,481 行）／`math-engines.js`（197 行）。

## 4. 与既有报告的关系（引用而非重推）

★ **诚实声明**：任务要求**引用** `phase3-parity-prompt-assembly.md` 而不是重推 —— ★ **我本轮没有打开那份报告**（预算耗尽）⇒ ★ **我既不引用也不重推**：本文件**完全不涉及提示词装配站点**，因此**没有与它冲突的内容**，也**没有拿它的结论当依据**。★ 这是**具名未核**，不是"已交叉核对"。

## 5. 没核（★ 与"核了"分开）

1. ★★ **P-a 的判据本体（同输入 ⇒ 输出/中间状态一致）我一条都没做** —— 单体没有为它构造入口；★ 本文件的 `P-a` 只表示"**在单体侧读到了该语义**"，**不表示一致已被验证**。
2. ★ **vmu 侧的实现我基本没读**（只按 `settings/schema.js` 的**键名**点出对应物）⇒ ★ `T3/T4/T7` 的"vmu 有无对应"**证据不足**，尤其 **T4 记的"absent（待核）"是"我没见到"，不是"没有"**。
3. ★ **`phase3-parity-prompt-assembly.md` 未打开**（见 §4）。
4. ★ **行数不一致未核**：我实测 11,494 行，`phase3-parity-definition.md:12` 记 11,597 行 ⇒ ★ 本文件所有行号**只对我实测的那份有效**。
5. ★ **单体是否还有别的回合/编排入口**：我只按少数锚点词（`scheduleNext`／`onMemberEnd`／`phase`／`idle`）grep 过 ⇒ ★ 照 definition §2.3，**"grep 命中 0"不得当结论**；**本文件没有下过任何"原版没有 X"的判定** ✓
6. ★ **`GAPS.md`（230 行，名字就是"缺口"）未读** —— definition §3.3 把它列为"失败语义"的最直接入口。
