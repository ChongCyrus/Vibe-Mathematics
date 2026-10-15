# Round 3 组织草案（Lead · Round 2 收尾后）

> **Round 2 结果（已 commit `65e8eba` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **272/272**；139 文件、+14025/−550。
> 目标 1（断点续跑+人工干预）、目标 2（通信/协作/会议）、目标 5（数学引擎深度）、目标 6（主代理＝助手）**均已实现并留证**；目标 3 出了判定 v1（`04-vmu-framework-strength.md`）＋盘点合并本（`03-v5r-full-inventory.md`）；目标 4 出了覆盖矩阵 v1（`04-parity-matrix.md`，124 条机制）。
> 全部 7 名队友空闲，写范围与角色沿用 Round 2 映射。

## Round 2 遗留 → Round 3 必办

| # | 项 | 归谁 | 判据/说明 |
|---|---|---|---|
| 1 | **GAP-MTG-02**：`vmu.meetings.tier`（`formal\|light`）+ **派生谓词**"简流程不得产出实体定论"，唯一判定点 | reader-c | 已授权；键名一维一个键；pack 只声明默认 |
| 2 | **chat/panel 投影缝**（现具名"不可跨重启"） | reader-c | 接 `attachProjection`；`policy` 不入快照 |
| 3 | **GAP-MTG 其余 11 条** | reader-c | 按 `docs/08 §25.4` 的 closed-by 逐条推进（建议先 GAP-MTG-03 决议实体、GAP-MTG-10 投票板 reopen） |
| 4 | **审批队列跨重启台账**（现为会话内存） | reader-a | 接 `store` 投影；重启后未批动作仍排队 |
| 5 | **`vmu.math.maxParallel` vs `vmu.math.jobs.maxParallel` 真收敛** | core | 留一个或写明边界；两者都必须有真读取者 |
| 6 | **`agent/turn-stopping → report.tick` 的声明门控**（现"内核启用即挂"） | core | 严格惰性：无 `vmu.report.*` 声明则不挂监听器 |
| 7 | **目标 3 的长尾判定**：`F8–F14`（子代理生命周期）`F15–F18`（定时/并发）`F20–F24`（提示词）`F25–F34`（共识）`F35–F40`（任务板/成果库）`F43–F47`（工具链）`F49–F53`（可观测）**逐条**给出"具备/部分/缺失 + file:line" | Lead（可派 verify 取证据） | 目前只有地基 10 条是**实测**判定；其余明确标"未核"，不许含糊 |
| 8 | **目标 4 矩阵 v2**：Round 2 实现落地后重出覆盖矩阵 | verify | v1 是**实现前**快照；v2 应显示 C-52（自动汇报）已闭合，并重判 C-30/C-45 |
| 9 | **C-30（office 定稿咨询门）/ C-45（忠实性强制弃权）** | core+pack / reader-b+c | v1 矩阵里仅剩的两条空缺 |
| 10 | **canonical 常驻变异族 + `MATH_SEMANTIC_SURFACE`** | verify | 把"语义级对照"从一次性断言变成可证伪族 |
| 11 | **真机 smoke（Round 2 新面）**：`resume` 重启恢复 / `chat` 配额与禁言 / `mailbox` ack / `panel` 子任务 / `report` 触发 | verify（驱动 `scripts/dsh-drive.mjs`） | 现在只有单元级证据；真机是"够不够强"的最强证据 |
| 12 | **math 面 N3/N5**：`mathtools.js` 未改、跨进程独占创建未做 | reader-b | 按需或具名登记 |

## 纪律（沿用）

- 每面自带测试；轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- 全量 T3（≈25–35 min）只在"发布前/每 2–3 个阶段"跑；本轮仍不需要。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**（PowerShell 文本管道本轮两次损坏中文，已两次靠 `git show` 恢复）。
