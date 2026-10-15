# Round 8 组织草案（Lead · Round 7 收尾后）

> **Round 7 结果（已 commit `5f3f7bc` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **298/298**；38 文件、+1210/−113。
> **目标 6 闭合**：三条**真机实测具备**（阈值 `fired[]` 非空／`vibe_vmu_set` `source:'runtime'`／人设原话"not a member, and I do not vote"），`turn/end=completed`、`tokenCapHit:false`。
> **目标 3 终判**：42 条 ⇒ **41 具备／1 部分／0 缺失**（唯一"部分"＝F13 有意的 fail-closed；F52/F53 因**搜索范围**被推翻）。
> **目标 1 闭合**：未 ack 计数（走耐久 mailbox 键，**不需新接口**）＋重派声明面（次数耐久、跨重启生效）。
> **pack 保真度审计**：用 v5r 自己的 `DEFAULT_PARAMS` 抓出 **3 处真不保真**并修好。
> **数学面**：`elementKind` 第二轴（加法式、未声明归 `unknown`）＋补三条真缺口＋具名"无路径"。
> 8 名队友全部空闲。

## ★ Round 8 首项候选（按代价/价值）

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **GAP-MTG 举手管理面**（`hands({op:'grant'|'revoke'|'clear'})`，~40 行，`meetings.hand()` 已有） | reader-c | **代价最低、可调控性收益明确**（举手秩序是会议最常调的旋钮之一） |
| 2 | **G6 host 侧分配型 store 注入** ⇒ F31 从"协议完备"升"端到端可用" | core ＋ reader-c | 形状已定（`docs/08 §25.13 D`）；缺宿主一个 store |
| 3 | **F44 正路断言**（core 只证到"缝被消费＋失败具名"3/6，**正路未证**） | verify | 按 `run()` 的完整 turn 形状写；**不许**把 3/6 写成具备 |
| 4 | **`vibe_vmu_set` 的 `by`/`reason` 常驻断言**（core 落了实现＋探针，`tests/**` 归 verify） | verify | 含"非所有者给 `by` ⇒ 具名拒"与"`reason` 入台账" |

## ★ 我（Lead）对 reader-c 四个待裁问题的裁决（Round 8 照此实现）

1. **"已议过的议程条目能否删"** ⇒ **不能硬删；只能"归档/关闭"并给理由**（append-only 是审计底座；删除会让"议过什么"不可追）。产物＝条目状态 `closed` ＋ `closedBy/why`，原条目保留。
2. **"请假/休会请求的批准人是谁"** ⇒ **会议主席（chair）批准**，**office 为兜底**；且**必须可声明**（键如 `vmu.meetings.leaveApprover`，默认 `'chair'`，值域含 `office`），未声明即默认、不臆造。
3. **"随机发言序可否被覆盖"** ⇒ **可以，但必须留痕**：仅 chair 可覆盖，**必须给理由**，写审计行（`enforced[]` 点名该键）；未声明 ⇒ 不可覆盖（零机制）。
4. **"6 种 flow mode 各自的可观察差异"** ⇒ **每一种模式必须能说出"可观察差异"，否则它不是一个模式**（应合并或具名降级）。请把 6 种各自的差异写进 `docs/08`，**说不出差异的当场合并**并说明。

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 5 | **目标 3 的 5 处具名残余**：F15 一处无句柄 sleep（已具名豁免）／F51 `meetingOpen` 域标记／F44 公告注入／F31 跨进程／F53 门禁（**已落**） | 按面 | 逐条收口或维持具名 |
| 6 | **目标 2 其余缺口**：G2 `invite` 正文/expect/timebox／G3 会期板 `origin`/`claim_pending`／G4 议程增删/流程/点名/停步／G7 `ballotbox`+`mailbox` 接同一份耐用日志／G9 v5r `selfReportTool` 逐行未读 | reader-c | G7 是"三行"级（F31 的耐久日志已就绪） |
| 7 | **pack 保真的 6 类两代差异**：`compactThreshold/compactAfterRounds`、`paperFormat/Language/CompilePdf`、`paperEditor:'academician'`（**值域不兼容 ⇒ 会被静默回落，是真缺陷**）、`maxTempPerMember`、`memberMayRejectAssign`、`stallAutoMeetingMs`（有意分歧） | pack ＋ core | **值域不兼容那条优先**：静默回落违反"声明必须真生效" |
| 8 | **falsify 第 8 族**：`activity` future-only（把 Round 3/4 的手写形态统一到家族形态，~20 行） | activity | 配方已 10 行；`familyEligibility` 已能判"值不值得接" |

## 纪律（沿用，本轮新增一条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **★ 新增：证据源必须与事实所在处一致** —— **工具回执在会话日志里，不在驱动 stdout**（读 stdout ⇒ 假阴性）；改断言要能**离线复评已录会话**（`--session`）。
- **门禁必须证明自己有牙**（`docs/11 §4.2` 第四条）：种违规 ⇒ 红、删掉 ⇒ 绿。本轮**门禁抓到了自己作者的门禁**（双空比较恒真）——这是好事，如实记录。
- **计数型断言写成集合/性质**；**`--dump-config` 不是运行时定义**；**"读到的空 ≠ 没发生"**；**生成物不许手改**。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删（本轮 1 次会话 ≈690k 累计、十端口已释放）。
