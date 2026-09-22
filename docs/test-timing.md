# 测试与脚本耗时基线（决定每次跑什么、怎么跑）

> **为什么要写下来**：这套仓库的测试耗时极不均匀（一个套件 100 s，大多数不到 2 s；探针脚本要
> 把同一套件跑十几遍）。不看数据就会犯两种错：要么每次都全量顺序跑（浪费 30 分钟），要么为了
> 省时间去砍测例（降低覆盖）。**先看基线，再选策略**；每次跑完把实测时间跟本表对一下，偏差大
> 就更新本表。

## 1. 怎么跑（并行是默认）

```bash
node run-tests.mjs                     # 全部 *.test.mjs，并行（并发 = min(4, CPU 核数)）
node run-tests.mjs --only formal       # 只跑名字含 formal 的套件
node run-tests.mjs --concurrency=6     # 手动指定并发
node audit-formal-sensitivity.mjs      # 49 条不变式探针，并行（--concurrency=N / --only=<preset> / --list）
node audit-persona-sensitivity.mjs     # 11 条提示词面探针（串行，本身只要几秒）
```

两个并行 runner 都会打印**每项耗时 + 汇总（wall / sum / speed-up / 最慢几项）**。跑完请读这几行。

## 2. 基线（本机：4 核 / 8 GB，Windows，2026-09 实测）

| 脚本 | 串行（sum） | 并行（wall） | 实测输出 |
|---|---|---|---|
| `run-tests.mjs`（23 个套件） | 219.4 s | **114.4 s**（并发 4，speed-up x1.92） | 关键路径 = `e2e-v4-fixes` 101.1 s |
| `audit-formal-sensitivity.mjs`（49 探针） | 612.0 s | **154.6 s**（并发 4，speed-up x3.96） | 关键路径 = 12 个 v2 探针（每个 ≈32 s） |
| `audit-persona-sensitivity.mjs`（11 探针） | ≈ 5 s | — | 本身很快，不需要并行 |
| `audit-v5-integrity.mjs` | ≈ 3 s | — | 静态审计 |
| `prompt-v5-integrity.test.mjs` | ≈ 7 s | — | 生成 v5 语料 |

> 优化前：全量回归 ≈ 5.5 min（串行，`formal-verify-v2` 单独 186 s）；
> 探针脚本 ≈ **38 min**（49 条串行，其中 12 条 × `formal-verify-v2` 162 s）。
> 现在：**1.9 min / 2.6 min**。

单套件耗时（并行时的关键路径按此排序）：

| 套件 | 耗时 | 备注 |
|---|---|---|
| `e2e-v4-fixes.test.mjs` | **≈ 101 s** | 9 个用例是**轮次采样**型（如 T13 采样 400 轮、T19/T25 多轮）；时间 ≈ 轮数 × 框架自身的 40 ms 计时粒度 |
| `formal-verify-v2.test.mjs` | **≈ 32 s** | 曾为 186 s：见 §3 |
| `e2e-regression.test.mjs` | ≈ 14 s | |
| `e2e-business.test.mjs` | ≈ 13 s | |
| `e2e-d9-d13.test.mjs` | ≈ 13 s | |
| `e2e-v3.test.mjs` | ≈ 11 s | |
| 其余 17 个 | ≤ 10 s | 其中 8 个 < 1 s |

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
   全量回归 5.5 min → 1.9 min（sum 219.4 s，wall 114.4 s，x1.92）。

## 4. 并行安全（为什么可以并发）

- 每个套件/探针都自建 `mkdtempSync` 工作区，互不共享状态；
- **会写语料的套件必须给不同的语料目录**：`V2_CORPUS_DIR` / `V3_CORPUS_DIR` / `V4_CORPUS_DIR` /
  `V5_CORPUS_DIR`。探针 runner 为**每个探针**分配独立目录，否则同一套件的并发实例会互相覆盖语料；
- `audit-persona-sensitivity.mjs` 用 `PERSONA_ROOT` 指向变异副本，且在覆盖模式下**不写**语料。

## 5. 策略建议（按目的选最小代价的组合）

| 目的 | 跑什么 | 预期 |
|---|---|---|
| 改了某个架构的插件 | `node run-tests.mjs --only <vN>` + `node audit-formal-sensitivity.mjs --only=vN` | 30 s – 2 min |
| 改了提示词/人设 | `node run-tests.mjs --only persona --only prompt` + `node audit-persona-sensitivity.mjs` | ≈ 15 s |
| 改了共享契约 / 发版前 | `node run-tests.mjs` + `node audit-formal-sensitivity.mjs` + `node audit-persona-sensitivity.mjs` + `node audit-v5-integrity.mjs` | ≈ 4.5 min |
| 只想知道"快不快" | `node run-tests.mjs --json` | 读 `wallSeconds` / `slowest` |

**每次跑完都要看那几行 timing**：如果某个套件突然比基线慢很多，先怀疑新增的固定等待，
再怀疑它是否在等一个永远不会发生的条件（这正是 v2 套件 186 s 的成因）。
