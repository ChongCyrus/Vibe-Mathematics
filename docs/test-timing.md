# 测试与脚本耗时基线（决定每次跑什么、怎么跑）

> **为什么要写下来**：这套仓库的测试耗时极不均匀（一个套件 100 s，大多数不到 2 s；探针脚本要
> 把同一套件跑十几遍）。不看数据就会犯两种错：要么每次都全量顺序跑（浪费 30 分钟），要么为了
> 省时间去砍测例（降低覆盖）。**先看基线，再选策略**；每次跑完把实测时间跟本表对一下，偏差大
> 就更新本表。

## 1. 怎么跑（并行是默认）

```bash
node tests/run-tests.mjs                     # 全部 *.test.mjs（在 tests/ 下），并行（并发 = min(4, CPU 核数)；命令都从**仓库根**执行）
node tests/run-tests.mjs --only formal       # 只跑名字含 formal 的套件
node tests/run-tests.mjs --concurrency=6     # 手动指定并发
node tests/audit-formal-sensitivity.mjs      # 49 条不变式探针，并行（--concurrency=N / --only=<preset> / --list）
node tests/audit-persona-sensitivity.mjs     # 11 条提示词面探针（串行，本身只要几秒）
node tests/audit-prompt-invariants.mjs       # 静态：四套的提示词/工具面不变式 + 扫描器自检（< 0.1s）
node tests/audit-prompt-invariants.mjs --self-probe   # 证明上面那 157 条不变式真的会变红（5 个自探针）
node tests/audit-spec-traceability.mjs       # 静态：规格/README ↔ 代码可追溯（< 0.1s）
node tests/audit-v5-integrity.mjs            # 静态：v5 完整性/理念门禁 + 扫描器解析级自检（≈0.5 s）
```

两个并行 runner 都会打印**每项耗时 + 汇总（wall / sum / speed-up / 最慢几项）**。跑完请读这几行。

## 2. 基线（本机：4 核 / 8 GB，Windows，实测）

| 脚本 | 串行（sum） | 并行（wall） | 实测输出 |
|---|---|---|---|
| `tests/run-tests.mjs`（26 个套件） | 225.8 s | **109.7 s**（并发 4，speed-up x2.06） | 关键路径 = `e2e-v4-fixes` 95.9 s |
| `tests/audit-installer-policy.test.mjs` | ≈ 1 s | — | 在临时 DSH_HOME 里驱动真实安装器（复制 4 套预设 × 2 个版本） |
| `audit-formal-sensitivity.mjs`（49 探针） | 612.0 s | **154.6 s**（并发 4，speed-up x3.96） | 关键路径 = 12 个 v2 探针（每个 ≈32 s） |
| `audit-persona-sensitivity.mjs`（11 探针） | ≈ 5 s | — | 本身很快，不需要并行 |
| `audit-prompt-invariants.mjs`（157 条，含 X5–X8b 扫描器自检） | 0.4 s | — | 静态 |
| `audit-prompt-invariants.mjs --self-probe`（5 探针） | 1.5 s | — | 每个探针 = 一次自我重跑（0.3 s） |
| `audit-spec-traceability.mjs`（94 条） | 0.3 s | — | 静态 |
| `audit-v5-integrity.mjs` | ≈ 0.5 s | — | 静态审计（含扫描器自检） |
| `prompt-v5-integrity.test.mjs` | 1.6 s | — | 虚拟时钟下生成 v5 语料（语料字节稳定；**stdout 里的会议成员顺序仍是运行间随机的**，只有落盘语料是逐字节确定的） |

> 优化前：全量回归 ≈ 5.5 min（串行，`formal-verify-v2` 单独 186 s）；
> 探针脚本 ≈ **38 min**（49 条串行，其中 12 条 × `formal-verify-v2` 162 s）。
> 现在：**1.9 min / 2.6 min**。

单套件耗时（并行时的关键路径按此排序）：

| 套件 | 耗时 | 备注 |
|---|---|---|
| `e2e-v4-fixes.test.mjs` | **≈ 98 s** | 9 个用例是**轮次采样**型（如 T13 采样 400 轮、T19/T25 多轮）；时间 ≈ 轮数 × 框架自身的 40 ms 计时粒度 |
| `formal-verify-v2.test.mjs` | **≈ 38 s** | 曾为 186 s：见 §3 |
| `e2e-regression.test.mjs` | ≈ 14 s | |
| `e2e-business.test.mjs` | ≈ 13 s | |
| `e2e-d9-d13.test.mjs` | ≈ 13 s | |
| `e2e-v3.test.mjs` | ≈ 12 s | |
| `formal-verify-v3.test.mjs` | ≈ 12 s | |
| 其余 19 个 | ≤ 6 s | 其中 12 个 < 1 s |

## 3. 已经做过的优化（别再重复踩）

1. **v2 套件 186 s → 32 s**（5.8×，断言数不变 261）：
   - 插件用 `setInterval(..., 1000)` 轮询调度器，套件的每次 `tick()` 都得等满 1 秒；
     套件现在**只把 `setInterval` 快进到 25 ms**（自己的 `sleep` 用 `setTimeout`，不受影响），
     插件内部"该不该 tick"仍按真实 200 ms 下限判断，**生产代码零改动**；
   - `verifyWithDebate` 的 16 次循环**从不提前退出**（判据是 `autoDone` 之类永远不会发生的条件），
     于是每次调用都烧满 16×1.3 s ≈ 21 s。现在按"连续 3 轮没有新 followup"提前退出。
2. **v4-fixes 的 12 个轮询循环加了"安静即停"**（105 s → 98 s）：原判据
   `autoDone || running===false` 对活着的 run 永远不成立，循环只是空转；
   现在连续 100 次无待答 followup 就停（`V4_IDLE_POLLS` 可调）。
   **再往下压就要砍采样深度了**——那 9 个慢用例（T13/T19/T22/T23/T25/T27/T2/T9/T20）是在
   观察"多轮之后某个指令**没有**泄漏/重复"，轮数是它们的不变式本体，不要再动。
3. **两个 runner 并行**（本轮新增）：探针 38 min → 2.6 min（sum 612 s，wall 154.6 s，x3.96）；
   全量回归 5.5 min → 1.9 min（sum 221.5 s，wall 111.5 s，x1.99）。
4. **虚拟时钟**（`prompt-v5-integrity.test.mjs`，本轮新增）：v5 研究所由 `ctx.timeout` + `Date.now()`
   驱动，真实时钟下"哪个成员被心跳/会议唤醒"取决于负载与毫秒差 → **随包语料每跑一次都变**（无法 diff，
   真实缺陷会被淹没）。套件现在把 `ctx.timeout` 接到**虚拟时钟**、`sleep(n)` 推进虚拟时间：
   套件 **7–9 s → 1.7 s**，且语料连续 6 次运行**字节一致**。语料写入端另加**全序排序**
   （kind → owner → prompt），使文件成为"记录集合"的纯函数——只按 kind 排序时，同 kind 内仍会随
   异步 drain 顺序变化（真实事故：两条会议提示词顺序互换）。
   > 想给别的套件套用同一手法前请注意：若套件的等待助手用 `Date.now()` 做**超时判据**、又用
   > `setInterval` 轮询（例如 `e2e-v4-fixes.test.mjs` 的 `waitFor`），冻结时钟会让判据永不超时；
   > 那种情况必须连**轮询定时器**一起虚拟化，不能只改 `sleep`。

## 4. 并行安全（为什么可以并发）

- 每个套件/探针都自建 `mkdtempSync` 工作区，互不共享状态；
- **会写语料的套件必须给不同的语料目录**：`V2_CORPUS_DIR` / `V3_CORPUS_DIR` / `V4_CORPUS_DIR` /
  `V5_CORPUS_DIR`。探针 runner 为**每个探针**分配独立目录，否则同一套件的并发实例会互相覆盖语料；
- `audit-persona-sensitivity.mjs` 用 `PERSONA_ROOT` 指向变异副本，且在覆盖模式下**不写**语料；
- `audit-prompt-invariants.mjs --self-probe` 用 `PROMPT_INVARIANTS_MUTATE`（JSON `[rel, from, to]`）
  在**内存里**变异一个文件并自我重跑，**不碰磁盘**，因此可与任何东西并发；
  变异串里不要用 NUL 分隔（环境变量不允许 NUL 字节）。

## 5. 策略建议（按目的选最小代价的组合）

| 目的 | 跑什么 | 预期 |
|---|---|---|
| 改了某个架构的插件 | `node tests/run-tests.mjs --only <vN>` + `node tests/audit-formal-sensitivity.mjs --only=vN` | 30 s – 2 min |
| 改了提示词/人设 | `node tests/run-tests.mjs --only persona --only prompt` + `node tests/audit-persona-sensitivity.mjs` | ≈ 15 s |
| **改了任何工具的参数 schema / 参数处理** | `node tests/audit-prompt-invariants.mjs --self-probe` + `node tests/run-tests.mjs --only formal` | ≈ 40 s（v2 套件占大头） |
| 改了共享契约 / 发版前 | `node tests/run-tests.mjs` + `node tests/audit-formal-sensitivity.mjs` + `node tests/audit-persona-sensitivity.mjs` + `node tests/audit-prompt-invariants.mjs --self-probe` + `node tests/audit-spec-traceability.mjs` + `node tests/audit-v5-integrity.mjs` | ≈ 4.5 min |
| 只想快速看提示词/文档有没有漂移 | `node tests/audit-prompt-invariants.mjs && node tests/audit-spec-traceability.mjs` | **< 0.5 s** |
| 只想知道"快不快" | `node tests/run-tests.mjs --json` | 读 `wallSeconds` / `slowest` |

**每次跑完都要看那几行 timing**：如果某个套件突然比基线慢很多，先怀疑新增的固定等待，
再怀疑它是否在等一个永远不会发生的条件（这正是 v2 套件 186 s 的成因）。
