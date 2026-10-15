# Round 7 组织草案（Lead · Round 6 收尾后）

> **Round 6 结果（已 commit `51a5735` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **295/295**；49 文件、+1646/−121。
> **Round 5 的根因已修**（入口两形态）⇒ **真机多面点亮建立**：`request/header.tools` **78 工具 / 52 个 `vibe_vmu_*`**（R5 只有 1）；5 对真实 `tool/call`+`tool/result`；`settingsMerge.sources` 4→5 键含 `vmu.report.reports:'config'`；`report.declared=1 armed=1`。
> **四份目标终判**已产出：`06-goal1`（断点续跑足够＋人工干预超集）／`07-goal5`（两半均≥v5r，四库真机全绿）／`08-goal2`（v5r 14 条会议命令全具备；管理员/配额/禁言 v5r 从来没有＝vmu 加分）／`09-goal4`（pack 一致；真缺口 0 子项＋孤儿键已删）。
> 8 名队友全部空闲。

## Round 7 首项：把"未建立的三条"钉上（机制侧已齐备）

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **第 6 次会话**：同一 overlay v3 ＋ provider 补丁，**提示词去掉/缩短 `vibe_vmu_status`**（它 49,929 字符、每步从缓存重读吃满上限）＋ `--max-tokens ≥ 400000` | assistant | 目标 6 的三条（阈值真触发／`vibe_vmu_set` 参数面留痕／人设两通道）**只差这一步**；R6 两次都因触上限（70k/40k、154k/120k）被 `aborted/user` 切断，**那是预算不是机制** |
| 2 | 若成功 ⇒ 矩阵/证据回填"实测具备"；若失败 ⇒ 具名收口 | verify | 只看真的 |

## 其余待办（按目标归属）

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 3 | **目标 2 的具名缺口 G1–G9**（G1 私聊补记／G5 会议级 mute／G8 自我发信判定**代价可控**；G6 host 侧分配型 store 注入是"真跨进程"的前提） | reader-c | 按 `08-goal2-verdict.md §6` 的改判条件逐条 |
| 4 | **目标 1 的 2 部分 ＋ 1 N/A**：未 ack 邮件计数（**端口未接，一行**）、重派缺失成员（装配策略）、看门狗时钟刷新（N/A 有理由） | reader-a | 按 `06-goal1-verdict.md §5` |
| 5 | **F53 自动门禁**：现在只有文档规则，**没有门禁**检查"新模块直接 `node:fs` 的用途" | verify | 本轮 core 具名指出；按"新模块必须声明直接 fs 用途"做一条窄门禁＋自探针 |
| 6 | **矩阵 4 处键名是 v1 转述**（`GRANTABLE_COMMANDS`→`vmu.grant.*`；`vmu.lean.*`→`vmu.math.*`；`chatDigest*`→`vmu.mailbox.digest*`；`SECRETARY_ENTRY_MAX` 等三个→真名） | verify | 按 `09-goal4-verdict.md` 的真名表改矩阵 |
| 7 | **falsify 第 6–7 族**：`human` 审批闸、`tasks` 环检测 | activity | 10 行式各约 30–50 行 |
| 8 | **GAP-MTG 需新原语的那几条**（议程增删/流程/点名/请假请求/停步） | reader-c | 需新子对象；按 `docs/08 §25.4` closed-by |

## 纪律（沿用）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **`--dump-config` 是 loader 树，不是运行时定义**（`docs/11 §4.2`）；**"读到的空 ≠ 没发生"**（install 链异步、会话日志 turn 末才 flush；`docs/03 §2`）。
- **计数型断言写成集合/性质**，不写 `=== N`（本轮又修两处：preset-rows 的"恰好 6"、paper-consult 的"恰好 5"）。
- **门禁不许把"清单值/注释/历史叙述"当运行时读取**（本轮误报族，已具名 4 例）。
- **生成物不许手改**；跨写范围要具名。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删（本轮 5 次会话后已删、九端口已释放）。
