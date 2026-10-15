# Round 9 组织草案（Lead · Round 8 收尾后）

> **Round 8 结果（已 commit `c5d9eab` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **303/303**；40 文件、+1545/−210。
> **目标 6 全闭合（含投递）**：真机 `delivered:true／refused:null／delivered:1／failures:0／audit.appended:true` ＋ **第三方旁证**（verify 的服务 stdout 打出恰好一条 `[vmu-report-sink]`）＋ `turn/end=completed`。
> **两次端到端演练抓出 6 个真缺陷**：目标 1 四个（journal 序列断、`hydrate()` 假恢复、空种子当投影缺口、`human.gate()` 闭包丢待批）／目标 5 两个（取消被"后写者"改写、`exitCode===null` 当成功）。
> **pack 保真优先项已修**：`vmu.paper.finalizer` 域外值**静默回落** ⇒ 封闭枚举＋具名拒（**拒绝"扩值域纳入角色名"**：角色名进内核违反 D5）。
> 8 名队友全部空闲。

## ★ Round 9 首项：**先补断言，再动新功能**

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **`parity §21`**：B①（`agendaClose/agendaItems` 6 条）＋ **G7**（`ballotbox.cast`／`mailbox.send` 的 `durableQueue` 4 条） | reader-c | 现在这两项是 **"已落、未断言"**（现有绿＝既有断言＋语法＋构造＋手工探针） |
| 2 | **G7 的自曝**：未绑定耐用日志 ⇒ `status()` 必须能读出（对齐 `ballot.status().gate.durable`） | reader-c | 否则就是"悄悄退回进程内"＝声明与事实不一致 |
| 3 | **`commitStore` e2e 落盘**：core 报告 §6.5 已给探针路径＋**14 条断言分组**＋`mkStore()` 桩契约（**显式 ticket 必须保留**） | verify | **下轮首项之一** |
| 4 | **F52 activity 语义**（one-shot／future-only／disposer 全分支） | verify | 若 activity 现有套件未覆盖 |

## ★ 我（Lead）对本轮转出项的裁决

| # | 项 | 归谁 | 裁决 |
|---|---|---|---|
| 5 | **G7 核侧一行绑定**：`kernel/index.js:950` 的 `createBallotBox(...)` 没传 `durableQueue`；且"ballotbox＋mailbox **同一份**日志"必须由核侧建**一个** queue 实例同时交两面 | core | **授权 core 连 `kernel/mailbox.js` 一起改**（各自发号无法合流） |
| 6 | **F51 `meetingOpen` 域标记**：全树无该符号，会议 `state:'open'` 只在内存 | reader-c | 会议面自决形状（耐久域标记）；与 F28 的 lapse 语义要对齐 |
| 7 | **B1–B4 八键**（`vmu.prompt.compact*`／`vmu.paper.finalPaper|format|language|compilePdf`／`vmu.members.maxTempPerMember`／`vmu.tasks.memberMayRejectAssign`） | core | **授权 core 连读者一起改**（读者在 `metrics|prompt`、`publication`、`members|recruit`、`tasks`）——**只落键＝8 个孤儿**，所以必须连读者 |
| 8 | **B5 `control/idle` 钩子**（pack 已指出：这是既不违反 R1 又能复现 v5r"静止⇒开会"的**唯一形状**） | core | 加已登记钩子 ＋ `control.js` 的 `idleState()` emit ＋ 登记/门禁 |
| 9 | **出货包**没有**任何退出 flush**（`resume.snapshot` 在 `index.js`/`host.js`/`*.yml` 命中 0；只有测试显式 `snapshot({key})`） | core | **state 面自动写穿 vs journal 面必须显式 flush 是两种契约**，不许用一句"已耐久"糊起来；退出前 flush ＋ 等落地 |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 10 | **B③ 发言序覆盖须留痕**（`orderMode` 增 `random`＋`overrideOrder`：仅 chair／必须 why／`enforced[]` 点名／未声明即拒，≈70 行） | reader-c | 裁决已下（Round 8） |
| 11 | **B④ flow mode 实现**（合并后保留 4 种，`flow({mode})` 收敛 ≈80 行） | reader-c | 裁决已下；`round_robin`/`call_on` 已接线 |
| 12 | **G2 `invite` 正文/expect/timebox**（~40 行）／**B② 请假批准人**（键已由 core 声明 ⇒ 读者 ~50 行） | reader-c | B② 现在无阻塞 |
| 13 | **pack 声明 v5r 值**（B1–B4 键＋读者落地后，按 v5r 出处声明 66/8/true/both/zh/true/3/true） | pack | **读者未落地不写默认值** |
| 14 | **falsify 继续**：`storepolicy` 的 `lockSerializeAll`/超时/退避与写路径真 `finally`；`activity` 的 peer 短路/`wakeOn`/`maxWaiters`；`docs/03` 工具表与 docs/08"fired ⊆ enforced"可各取 1 条做**文档不变式** | activity | 范式已到"文档承诺也能被证伪" |
| 15 | **目标 3 的 5 处具名残余**：F15 无句柄 sleep（具名豁免）／F51 `meetingOpen`（本表 #6）／F44 公告注入（**已闭合 6/6**）／F31 跨进程（G6 已落，等核侧绑定 #5）／F53 门禁（已落） | 按面 | 逐条收口 |

## 纪律（沿用，本轮新增两条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **★ 新增：重构必须原子** —— 抽取/改名要在**同一次编辑内**完成（或先留旧绑定再删）。本轮 `ballotbox.js` 的"两步之间"让**整棵树无法构造**，凡 boot 内核的套件全在**构造期**崩。
- **★ 新增："构造期异常 ≠ 断言失败"** —— 两者必须分开报（否则读数会被带偏）。
- **"能跑" ≠ "被守住"**：B①/G7 已落但**未断言**，一律按"已落、未断言"记录。
- **证据源必须与事实所在处一致**（回执在会话日志里，不在驱动 stdout）；**`--dump-config` 不是运行时定义**；**计数断言写成集合/性质**；**门禁必须证明有牙**；**生成物不许手改**。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删（本轮 1 次会话、累计 ≈940k tokens、十一端口已释放）。
