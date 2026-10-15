# Round 10 组织草案（Lead · Round 9 收尾后）

> **Round 9 结果（已 commit `8fc3128` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **305/305**；44 文件、+2254/−121。
> **先补断言**：`parity §21`（16 条）＋ `commitStore` e2e **19/0**（含"不保留显式 ticket ⇒ 意图永远 pending"的**可观测反例**）＋ F52 确认已被既有族覆盖（**未重复造**）。
> **★ 本轮最大发现**：`methodsOf` 只包裹 `tasks`/`work` ⇒ **`members/meetings/ballotbox/budget/chat/panel/minutes` 被声明为投影却从未被写过**（"声明了但没写"）。已改为**反转默认**（除显式只读集外全包）⇒ 探针 14/0：两个会真的进 `meetings` 键、**同 root 新内核恢复后同 id 回来**。⇒ **多实例不需要新注册表：集合面就是注册表，缺的只是方法列表。**
> **另 6 个真缺陷**：`store.js` 白名单缺两面 ⇒ 声明即 **崩** `recover()`；Lean 崩溃续算**实际是坏的**（先写镜像后读哈希）；覆写 last-writer-wins ⇒ **恢复租约**（同一崩溃作业从"跑 2 次"变"恰好 1 次"）；`fired ⊄ enforced`；`lean.js` 轮询绕过注入时钟（现**零全局定时器站点**）；E-17 的**观测量不再有差异**（当年靠域外值撑绿）。
> 8 名队友全部空闲。

## Round 10 首项：**F（B② 请假批准人）** —— 落点已实测，接手无需调研

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **F B② 请假批准人**（5 处编辑已勘定：K 配置块 → `WIRED_KEYS`＋`keysSnapshot()` → `requestLeave`/`approveLeave`（批准人＝`K.leaveApprover`；chair 比对 `m.chair`／office 身份字面；两侧必须 `why`；写纪要＋`pushReceipt`；`enforced[]` 点名；决定幂等）→ 工具面 `leaverequest`/`leaveapprove` → `parity §22` ≥6 条带非空前置） | reader-c | core 已声明 `vmu.meetings.leaveApprover`（`enum ['chair','office']`，def `chair`）⇒ **无阻塞**；`vmu-meetings` 的断言**长度无关**、partition 现算 ⇒ 从 PLANNED 移入 WIRED **不会**造成硬编码计数冲突 |
| 2 | **C B③ 发言序覆盖须留痕**（`orderMode` 增 `random`＋`overrideOrder`：仅 chair／必须 why／审计行／`enforced[]`／未声明即拒，≈70 行） | reader-c | 形状在 `docs/08 §25.14 B-3` |
| 3 | **D B④ flow mode**（合并后 4 种，`flow({mode})` 收敛 ≈80 行） | reader-c | 形状在 `§25.14 B-4`；`round_robin`/`call_on` 已接线 |
| 4 | **E F51 `meetingOpen` 耐久域标记** | reader-c | **裁决已下**：落**会议域**、**不新增键**；`open|lapsed|closed`，与 F28 对齐（lapsed 可 `revokeLapse` 回 open） |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 5 | **C B1–B4 八键＋真读者**（`vmu.prompt.compactThreshold/compactAfterRounds`、`vmu.paper.finalPaper/format/language/compilePdf`、`vmu.members.maxTempPerMember`、`vmu.tasks.memberMayRejectAssign`） | core | **落点已勘定**：`metrics.js\|prompt/**`、`publication.js`、`members.js\|recruit.js`、`tasks.js`；**只落键＝8 个孤儿** ⇒ 必须连读者 |
| 6 | **D `control/idle` 钩子** | core | ★ **关键事实**：`control.js` 的 `idleState()` **全树零调用者** ⇒ 只加 emit 会得到**无生产者的钩子**，**必须同时定轮询点**（否则是"声明了没人调"的另一面） |
| 7 | **pack 声明 B1–B4 的 v5r 值**（66/8、true/'both'/'zh'/true、3、true） | pack | **等 #5 落键＋读者**；值附 v5r 出处 |
| 8 | **`stallAutoMeetingMs` 的 M2 实现**（core 落 `control/idle` 后，pack 用 M2 中间件实现"静止⇒开会"） | pack | 不违反 R1 又能复现 v5r 的**唯一形状** |
| 9 | **`meetingOpen` 落地后**补"重启后哪个会还开着"一条断言 | reader-a | 它已具名等 reader-c |
| 10 | **falsify 继续**：`records`/`store` 接缝真 `try/finally` 解锁、`activity` 的 clamp/dispose/通知环丢弃、`storepolicy` 的 remote 四组合、`docs/03:1412` 后半句可达性 | activity | 11 族 / 34 缺陷；文档不变式范式已成熟 |
| 11 | **门禁形状**：`audit-dependency-cycles` **把注释里的 import 形状当成了真 import**（本轮我改了一句注释才过）⇒ 按既有纪律给它**语句位置/去注释**判据＋**自探针**（"注释里的 import 形状不得被当成 import"） | verify | 与"清单值被当成读取""dump≠运行时"同族 |
| 12 | **目标 3 的 5 处具名残余**：F15 无句柄 sleep（具名豁免）／F51（本表 #4）／F44（**已闭合 6/6**）／F31 跨进程（**G6 已落**，核侧共享队列已绑）／F53（门禁已落） | 按面 | 逐条收口 |

## 纪律（沿用，本轮新增一条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **★ 新增：结构性编辑必须原子 ＋ 每步跑一个"加载内核"的套件** —— 本轮**两次**中间态让整棵树无法加载（`ballotbox` 的 `cast` 抽取、`resume` 的 `readClock` 先插后删）；`node --check` **查不出**加载期冲突（它只查语法），**必须**跑一个 `createKernel` 的套件。
- **★ 新增：新文件要"双登记"＋矩阵要裁定行** —— 本轮新文件漏了 `package.json files[]`／installer 管理清单／zero-mechanism 矩阵的 `EXPECT_NA` 行，**四处**在轮末才被发现（由我补）。下一轮**建新文件时当场登记**。
- **门禁必须证明有牙**（`docs/11 §4.2` 六条硬要求）；**判据必须与环境一致**；**观测量必须在两档间真的不同**；**计数断言写成集合/性质**；**生成物不许手改**。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删。
