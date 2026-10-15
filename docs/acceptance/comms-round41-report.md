# Round 41 · task-184 · `generate-wiring-index.mjs --check` 分段计时（★ **只读，未改任何仓内代码**）

> ★ **本轮遵守 Lead 的硬约束：只测、只报**（`vmu-assistant2` 本轮跑真机，payload 需冻结）⇒ **仓内零改动**，`scripts/**`／`tests/**`／`package.json` 均未碰；`--cpu-prof` 只把 profile 写进 `D:\_tmp\v41`。**无半截状态**。

## 1. 量法（写清）

- **同机、同会话**；墙钟＝`[Diagnostics.Stopwatch]::StartNew()` 包住**整条命令**。
- **分段**用 **Node 自带 `--cpu-prof`**（★ **不需要改代码**，这正是本轮要的手段）：
  `node --cpu-prof --cpu-prof-dir=D:\_tmp\v41 --cpu-prof-name=wi.cpuprofile scripts/generate-wiring-index.mjs --check`
  再用 `D:\_tmp\v41\prof.mjs` 按**函数自耗时**聚合。
- ★ **关键事实**：子检查（settings-table）是 **`spawnSync` 的子进程**（`generate-wiring-index.mjs:131`，`checks[]` 于 `:123-125`）⇒ **它不出现在父进程 profile 里** ⇒ **这恰好把 (a) 与 (b)+(c) 分开**。

## 2. 读数

| 段 | 值 | 证据 |
|---|---|---|
| **顶层墙钟** | **7.80s**（exit=0；本轮同机另两次 7.46／7.37 ⇒ 噪声 ±0.4s） | Stopwatch 包住整条命令 |
| **(a) 子检查**：`spawnSync` settings-table（默认模式＝check） | ★ **6.84s 自耗时**（占 profile 自耗时的 **89%**）；**单独跑同一命令 = 5.09s** | profile 顶部 `spawnSync @node:internal/child_process:1145 = 6839 ms`；Standalone Stopwatch = 5.09s |
| **(b) 它自己的扫描**：`generate-wiring-index.mjs` 全部自耗时 | ★ **0.71s**（其中 `(anonymous) @:199 = 686 ms`、`collectIndex @:166 = 10 ms`、`orientationOf @:73 = 6 ms`、`main @:279 = 4 ms`） | profile 桶：`generate-wiring-index.mjs itself = 0.71s` |
| **(c) 渲染/写盘** | ★ **≈0**（`--check` 下 profile 里**没有 `writeFileSync`**） | profile 无写调用；只有 `readFileSync 22 ms` |
| profile 自耗时合计 | **7.68s** ≈ 顶层墙钟 7.80s ✓（差值 0.12s ＝ 采样/GC 尾差） | profile 头行 |

**对账**：`spawnSync 6.84s ＋ 自身 0.71s ＋ program/GC ~0.05s ≈ 7.6s ≈ 墙钟 7.80s` ✓ **可解释**。

## 3. ★ 判断：三段**解释了**总时长，但**否定了我 R40 的归因**

- ★ **R40 我推断"剩余 ~0.75s 在 wiring-index 自身的工作里" —— 本轮读数把它否掉了**：**它自身全部代码只有 0.71s**（其中真正的大头是 `:199` 的 686ms），**根本没有 ~0.75s 的自身开销可回收**。R40 那个推断是**拿两次不同运行的数相减**（7.4 − 4.91）得来的 —— ★ **这正是"数字变了要先给机制"该防的那类相减**；我在报告里把它**纠正**为：缺口来自 **子进程侧**（(a) 6.84s），不是父进程。
- **真正的时间构成**：**(a) 6.84s（89%）＞＞ (b) 0.71s（9%）＞ (c) ≈0**。
- ★ **仍未定位的那部分（如实写）**：**(a) 里 Spawn 自耗时 6.84s 与"单独跑该命令 5.09s"之间差 ≈1.75s** —— 我**没有**把它说成某个具体原因（候选：子进程 Node 启动、`encoding:'utf8'` 的**管道 IO**（子进程要吐 ~1750 行）、父进程 profile 开销；**三者我都未逐项证伪**）⇒ **记作"未定位 ≈1.75s"**。

## 4. 能不能在"不动语义"前提下回收？（结论＋代价，本轮**不改**）

| 方案 | 预期回收 | 代价/风险 |
|---|---|---|
| **(ii) 保留子进程，但不再收集输出**（`spawnSync(..., { stdio: 'ignore' })` 或传 `--json` 只取一行） | 可能拿到那 ≈1.75s 中的**管道部分** | ★ **低**：判据语义不变（只改"怎么读结果"），但**必须**仍检查 `status` 并保留 `--check` 的失败语义 |
| **(i) 改成**同进程**：`import` 生成器已导出的 `collect()/render()`（它们**已经导出**），在 wiring-index 里**自己做同一套 stale 比较** | 预期最大（去掉子进程启动＋管道） | ★ **中**：wiring-index 会**依赖生成器的内部 API**（今天只依赖"它能自己跑"），且要**逐字复刻** `--check` 的判定与提示；**语义等价的举证责任在我们** |
| (iii) 降低子进程自身 5.09s | 小 | 子检查**已回到 R37 基线**（R40 预筛 −0.81s 已拿到）⇒ 剩余空间不大 |

★ **建议**：**先 (ii) 后视情 (i)**；(ii) 便宜且不碰语义，能验证"管道 IO 是否就是那 1.75s 的大头"。
★ **本轮不做**（payload 冻结）；**等你叫**。

## 5. 没核 / 状态

- **没核**：那 **≈1.75s spawn 侧开销的逐项归因**（启动／管道／profiler 三者未分离）；(i) 方案"逐字复刻 `--check` 语义"的具体 diff 未写。
- **跑了/核了**：顶层墙钟、三段读数、对账（7.68 ≈ 7.80）、子进程与父进程的分离（profile 里 `generate-vmu-settings-table.mjs` 自耗时 = **0.00s** ⇒ 证实它在子进程里）。
- **仓内改动：无**（只读）；`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` 未动；**无半截状态**。
