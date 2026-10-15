# Round 5 组织草案（Lead · Round 4 收尾后）

> **Round 4 结果（已 commit `3ffd68e` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **286/286**；84 文件、+4131/−351。
> 目标 3 的子代理生命周期组**已闭环**（F8–F14：**6/1/0**）；总计判定 **25 具备 / 8 部分 / 9 缺失**（42 条实测）。
> **真机 smoke 首次成功**（SLV 手册配方）：隔离 profile → 真 installer → 真宿主 → `preset: vibe-math-vmu` → `tool/call vibe_vmu_status` @seq16 L134 ＋ `tool/result` @seq17 L135，31.8k tokens/21s，provider `dsh-opencode-go`/`deepseek-v4.1-flash`；并**在真机确认零机制成立**（零声明只发布 `status` 面）。
> 8 名队友全部空闲。

## Round 4 遗留 → Round 5 必办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **U14 多面点亮**：让**可声明的 overlay** 能打到 preset 的**内层行**（`id: vibe-math-vmu` 嵌在 `preset-vibe-math-vmu.config.plugins`） | core ＋ verify | 顶层 patch 按 id 打不到（实测 `--dump-config` 不显现）；**不能**为测试改随包默认（那会破坏零机制）。方案：① 让 DSH 支持嵌套行寻址；② 或给 preset 加"测试用 overlay 声明面"（`vmu.tools.faces:['*']`／`vmu.packs.active:['v5r']`） |
| 2 | **真机 smoke 补 playbook §2/§4**：首条 user message 声明"模拟测试"（断言 seq＋行号）＋ `--max-tokens` | verify | 两条 NON-RESULT 的收口；仍守"≤2 次会话"的开销纪律 |
| 3 | **目标 3 余下 8 部分 + 9 缺失**：逐条处置或具名 | 按面分派 | 重点：F31（无显式队列/串行化）、F35/F40（任务板/成果库）、F49–F53（可观测）、F13（fail-closed vs v5r 容错——**有意差异**，写实即可） |
| 4 | **`math-computation.js:617,728` 无句柄 sleep** | reader-b | 已具名豁免（D-10 四份逐字节副本）；要么加 seam 要么把豁免写进 docs/11 的门禁豁免表 |
| 5 | **调度器无生产调用者** | core／pack | 已按 F16 登记为"框架提供、pack 使用，内核不自动启用"；若 pack 需要心跳，由 pack 声明 |
| 6 | **GAP-MTG 余项** | reader-c | 12 条中已落多条；按 `docs/08 §25.4` 的 closed-by 收口 |
| 7 | **目标 4 矩阵 v4** | verify | 反映 Round 5；空缺持续具名可追溯 |
| 8 | **`packs/v3-core` 的 5 个包私有 `vmu.v3.*` 键**不在 schema | pack | 包能读、`vibe_vmu_set` 会具名拒（既有设计）；要么登记为"包私有"，要么进 schema |

## 纪律（沿用，且本轮新增一条）

- 每面自带测试；轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **"按文本解析"的门禁**本轮又抓到三处（注释里的键名、数据字符串里的 import、探针选错工厂）。**新写/修改门禁时必须问："这个形状还有别的写法吗？"**，并配自探针证明"数据/注释不得被当成代码"。
- **写入前先"报告状态"**：本轮中断恢复时，15 个半成品文件全部 `node --check` 通过——**中断不等于损坏**，但恢复后第一件事必须是核对自己那部分。
