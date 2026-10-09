# 测试与脚本耗时基线（决定每次跑什么、怎么跑）

> **为什么要写下来**：这套仓库的测试耗时极不均匀（一个套件 100 s，大多数不到 2 s；探针脚本要
> 把同一套件跑十几遍）。不看数据就会犯两种错：要么每次都全量顺序跑（浪费 30 分钟），要么为了
> 省时间去砍测例（降低覆盖）。**先看基线，再选策略**；每次跑完把实测时间跟本表对一下，偏差大
> 就更新本表。

## 1. 怎么跑（并行是默认）

```bash
node tests/run-tests.mjs                     # 全部套件 + 全部探针（tests/ 下每个 .mjs），并行（并发 = min(4, CPU 核数)；命令都从**仓库根**执行）
node tests/run-tests.mjs --only formal       # 只跑名字含 formal 的项（套件与探针一起筛）
node tests/run-tests.mjs --concurrency=6     # 手动指定并发
node tests/run-tests.mjs --json              # 机器可读汇总（含 skippedNeedsArgs / devCheckout）
```

`run-tests.mjs` 的收集规则（Round B 起）：`tests/` 下**每个** `.mjs` 都会被跑——

- `*.test.mjs` 是**套件**；其余 `.mjs` 是**探针/审计**（灵敏度变异、注册面、自驱动守卫）；
- 只有登记在 runner 的 `NEEDS_ARGS` 里的脚本才会被跳过（当前只有 `audit-tool-exec.mjs`：它必须带
  `<preset-js> <tool-name>` 才能跑）。跳过项**每次运行都会打印出来**；在开发检出（存在 `.git`）里
  该登记失效会**直接报错退出**，所以改名不可能悄悄把一条守卫踢出发布门禁；
- 需要参数的变体登记在 `VARIANTS`：`audit-registration.mjs` 四个预设各跑一次（裸跑只查 v3）、
  `audit-prompt-invariants.mjs --self-probe`、以及 `audit-v3-registration-parity.mjs --self-probe`
  （这条**成功 = 退出码 1**：它注入真实变异并要求守卫变红，runner 用 `expectExit` 表达）。

### 1.1 随包发布 vs 仅仓库（`npm pack --dry-run --json`）

`package.json` 的 `files` 只发 `tests/` 的一个**子集**（发布物共 **119** 个文件，其中 `tests/` **23** 项），
所以安装用户跑 `node tests/run-tests.mjs` 得到的是子集的结果——runner 会把缺失的跳过项打印出来，
不会静默少跑：

- **随包（23 项）**：`run-tests.mjs`、`audit-formal-sensitivity.mjs`、`audit-persona-sensitivity.mjs`、
  `audit-prompt-invariants.mjs`、`audit-spec-traceability.mjs`、`audit-v5-integrity.mjs`、
  `audit-v5-sensitivity.mjs`、`selfdrive-v5.mjs`、`audit-math-computation-parity.mjs`、
  `audit-math-computation-contract.mjs`、`audit-math-computation-sensitivity.mjs`、
  `helpers/math-computation-fake-seam.mjs`；套件 **11** 个：`audit-installer-compat`、
  `audit-installer-policy`、`audit-persona-surface`、`audit-preset-rows`、`e2e-v5-round2`、
  `formal-verify-v2`、`formal-verify-v3`、`formal-verify-v4`、`formal-verify-v5`、`prompt-v5-integrity`、
  `math-computation-shared`。
- **仅仓库（不发）**：其余 **27** 个套件（v2/v3/v4 的 e2e、`selfdrive-v3`/`v4`、v2/v3 修复探针、
  `math-computation-v2|v3|v4|v5`、`audit-fuzz-helpers` 之外的若干 `audit-*`……）与 7 个脚本（`audit-fuzz-helpers`、
  `audit-registration`、`audit-roundtrip-idempotence`、`audit-tool-exec`、
  `audit-v3-registration-parity`、`selfdrive-v3`、`selfdrive-v4`）。
- 因此**完整门禁只能在开发检出里跑**；发布物里的子集是"用户可自查"的一部分，不是全部证据。
  （`audit-fuzz-helpers.mjs` 在 2.3.13 时曾随包发布；现在不在 `files` 里。）

## 2. 基线（本机：4 核 / Windows，实测）

> **最后一次复核：`167b52d`**。表中"串行/并行"是**该次复核**的实测值：套件行在**重测前**视为"上次复核值"，引用前请重测或写明复核点；**变异族行**一律引用族自己打印的 `TOTAL WALL TIME` 行（不估算、不跨运行拼接）。这与 §1.1/runner 计数由 `--counts` 派生的口径一致。

| 脚本 | 串行（sum） | 并行（wall） | 实测输出 |
|---|---|---|---|
| `tests/run-tests.mjs`（**130 项作业**（job count）= 67 套件 + 63 探针/变体；**由 `--counts` 派生**） | ≈ 424 s（历史基线） | **≈ 121 s**（历史基线；当前实测墙钟 ≈ 200 s，并发 4） | `TOTAL 130  PASS 130  FAIL 0  (suites 67 · probes 63)`；实测 `wall 120.7s · sum 424.2s`，关键路径 = `e2e-v4-fixes`（≈ 98 s） |
| `tests/audit-formal-sensitivity.mjs`（49 探针，自带并发 4；v2 12 / v3 12 / v4 12 / v5 13） | ≈ 1035 s | **260.7 s**（实测，x3.97） | 关键路径 = v2/v3 的 `require` 探针（各 ≈75 s）；全 49 条按预期变红、0 问题 |
| `tests/audit-v5-sensitivity.mjs`（39 探针，串行） | ≈ 101 s | — | 每条 = 一次被测套件重跑 |
| `tests/audit-persona-sensitivity.mjs`（16 探针） | ≈ 4.4 s | — | 本身很快，不需要并行 |
| `tests/audit-prompt-invariants.mjs`（157 条） | ≈ 1.9 s | — | 静态 |
| `tests/audit-prompt-invariants.mjs --self-probe`（5 探针） | ≈ 7.4 s | — | 每个探针 = 一次自我重跑 |
| `tests/audit-spec-traceability.mjs`（94 条） | ≈ 0.2 s | — | 静态 |
| `tests/audit-v5-integrity.mjs` | ≈ 0.6 s | — | 静态审计（含扫描器自检） |
| `tests/audit-registration.mjs`（4 个预设各一次） | ≈ 1.0 s | — | 裸跑只查 v3，所以 runner 跑四个变体 |
| `tests/audit-v3-registration-parity.mjs`（+ `--self-probe`） | ≈ 0.3 s | — | 自探针**成功 = exit 1**（变异后守卫必须变红） |
| `tests/prompt-v5-integrity.test.mjs` | ≈ 2.2 s | — | 虚拟时钟下生成 v5 语料（语料字节稳定；**stdout 里的会议成员顺序仍是运行间随机的**，只有落盘语料是逐字节确定的） |
| `tests/e2e-v5-round2.test.mjs` | **≈ 16.3 s**（`167b52d` 实测，ALL GREEN；**断言条数不写在这里** —— 它随轮次变化，跑一次即知） | — | v5 e2e：邮箱/唤醒、轮次计数（§[47] 失败唤醒仍 pending、§[51] 重建后仍 `轮次 2`）、预置快照不被覆盖、命名研究所、失败轮次等；**早先此处记 ≈3.2 s 是旧口径**，正文小节也已随轮次更新 |
| `tests/audit-engine-faces.mjs`（**环境感知**：存在才跑，缺席 SKIP） | — | **≈ 15 s**（本机三面齐全：Lean 真编译 + 数值真跑 + LaTeX 起点） | 引擎缺席时打印 `SKIP: no <engine> on this machine (<reason>)`，**不判红**；三面齐全时 13/0/0 |
| `tests/v5-institute-fixes.mutants.mjs`（**变异族**） | — | **族自报 `TOTAL WALL TIME` ≈300 s**（本轮 298959 ms；复核方 299649 / 295216 ms —— ~1.5% 机器差异，**不要合成单点数字**） | 11/11 族具名变红、`hangs=[]`、`skipped=[]`、`ALL MUTANTS RED AS REQUIRED`；900 s 覆盖（见 `docs/AUDIT-CHECKLIST.md` 的跑测超时行） |
| `tests/host-failure-paths.test.mjs` | ≈ 6.3 s | — | 真实宿主的失败路径（`kind:'error'`、`/v4 set` 键校验、失败轮次不算进展） |
| `tests/v4-mailbox-stall.test.mjs` | ≈ 7.1 s | — | `sendMessage` 拒绝后必须重投并唤醒（control + treatment 各一个 host） |
| `tests/v2-fix-probes.test.mjs` | ≈ 8.6 s | — | v2 的 flat 等权均值 / ≥2 名验证者 / runShell 失败分支（26 条） |
| `tests/v2-path-escape.test.mjs` | ≈ 2.2 s | — | 验证日志路径逃逸（7 条） |
| `tests/v2-tool-cap.test.mjs` | ≈ 0.4 s | — | 能力表来自真实组合、*MaxToolCalls 只是提示（10 条） |
| `tests/math-computation-v2.test.mjs` | ≈ 1.7 s | — | v2 接线：六参数/双注册层/回执/归档→编辑→重跑/跨会话隔离（含 mutant 说明在文件头） |
| `tests/math-computation-v3.test.mjs` | ≈ 1.7 s | — | v3 同上（dual-layer + `TOOL_DESC` 描述 parity） |
| `tests/math-computation-v4.test.mjs` | ≈ 2.5 s | — | v4：每会话一个模块实例 + 隔离断言 + `vibe_v4_set` 闭集 + 单点注册 |
| `tests/math-computation-v5.test.mjs` | ≈ 1.4 s | — | v5：闭集 `vibe_v5_set`、研究所根回执、会话隔离（7 个 mutant） |
| `tests/math-computation-shared.test.mjs` | ≈ 0.1 s | — | 共享模块契约（参数/失败码/argv/回执/归档/并发/override/路径守卫），走假 subprocess seam |
| `tests/audit-math-computation-parity.mjs` | ≈ 0.1 s | — | 四份副本字节一致 + canonical 一致 + 两条安装线 + 描述符不变式（44 条） |
| `tests/audit-math-computation-contract.mjs` | ≈ 0.2 s | — | 跨预设接线（含 set-schema **属性级**检查与 defaults 漂移检查） |
| `tests/audit-math-computation-sensitivity.mjs` | ≈ 25 s | — | 21 个模块级变异，每条都要求具名断言变红（控制组必须绿） |

> 上表 `run-tests` 的 `≈424 s / ≈121 s` 两列是 **当时的门禁规模**（44 个套件、21 个探针/变体） 时的实测（2026 年 math_computation
> P1/P2a + 审计修复轮之后）。`audit-formal-sensitivity`（49 探针，实测 wall 260.7 s）与 `e2e-v4-fixes`（≈ 98 s）
> 是两条最长的独立路径；两者都不在 `run-tests` 的默认集合里时，整轮 wall 由 `e2e-v4-fixes` 决定。
> 数字**形状**（`TOTAL <n> … suites <s> · probes <p>`；具体值以 runner 每次运行的输出为准，本文件**不复述**）——本文件里出现的每个 `TOTAL <n>` 都由 `tests/audit-readme-counts.mjs` 与 `--counts` 对账（历史数字只出现在冻结的 `docs/release-notes/**` 里，按名排除）。

单套件耗时（并行时的关键路径按此排序）：

| 套件 | 耗时 | 备注 |
|---|---|---|
| `e2e-v4-fixes.test.mjs` | **≈ 104 s** | 9 个用例是**轮次采样**型（如 T13 采样 400 轮、T19/T25 多轮）；时间 ≈ 轮数 × 框架自身的 40 ms 计时粒度 |
| `formal-verify-v2.test.mjs` | **≈ 43 s** | 曾为 186 s：见 §3 |
| `e2e-v3.test.mjs` | ≈ 21 s | |
| `e2e-regression.test.mjs` | ≈ 14 s | |
| `formal-verify-v3.test.mjs` | ≈ 13 s | |
| `e2e-business.test.mjs` / `e2e-d9-d13.test.mjs` | ≈ 13 s | |
| 其余套件 | ≤ 10 s | 其中绝大多数 < 2 s |

> 优化前：全量回归 ≈ 5.5 min（串行，`formal-verify-v2` 单独 186 s）；
> 探针脚本 ≈ **38 min**（49 条串行，其中 12 条 × `formal-verify-v2` 162 s）。
> 现在：**一套 `node tests/run-tests.mjs` ≈ 3.5 min 覆盖套件 + 探针**（探针单独跑仍是 ≈2.6 min）。

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
3. **两个 runner 并行**（Round A）：探针 38 min → 2.6 min（sum 612 s，wall 154.6 s，x3.96）；
   全量回归 5.5 min → 1.9 min（sum 221.5 s，wall 111.5 s，x1.99）。
4. **虚拟时钟**（`prompt-v5-integrity.test.mjs`）：v5 研究所由 `ctx.timeout` + `Date.now()`
   驱动，真实时钟下"哪个成员被心跳/会议唤醒"取决于负载与毫秒差 → **随包语料每跑一次都变**（无法 diff，
   真实缺陷会被淹没）。套件现在把 `ctx.timeout` 接到**虚拟时钟**、`sleep(n)` 推进虚拟时间：
   套件 **7–9 s → 1.7 s**，且语料连续 6 次运行**字节一致**。语料写入端另加**全序排序**
   （kind → owner → prompt），使文件成为"记录集合"的纯函数——只按 kind 排序时，同 kind 内仍会随
   异步 drain 顺序变化（真实事故：两条会议提示词顺序互换）。
   > 想给别的套件套用同一手法前请注意：若套件的等待助手用 `Date.now()` 做**超时判据**、又用
   > `setInterval` 轮询（例如 `e2e-v4-fixes.test.mjs` 的 `waitFor`），冻结时钟会让判据永不超时；
   > 那种情况必须连**轮询定时器**一起虚拟化，不能只改 `sleep`。
5. **语料里的随机 id 也要归一化**（Round B，`formal-verify-v4.test.mjs`）：v4 的
   `propose_task` 用 `Math.random` 造 `t-<8 位 hex>`，语料把 `[YOU CLAIMED TASK t-…]` 逐字写盘，
   于是**每次跑测试都会改写随包语料**（`git status` 永远有 `prompt-corpus-v4/*`，且违反
   `AUDIT-CHECKLIST` §2.4"连续两次哈希相同"）。`scrub()` 现在把它归一化成 `<TASKID>`，并断言
   "语料里既没有裸 id、也真的有 `<TASKID>`"。连续两次运行哈希相同（`d3381886…` / `e6c4e445…`）。

## 4. 并行安全（为什么可以并发）

- 每个套件/探针都自建 `mkdtempSync` 工作区，互不共享状态；
- **会写语料的套件必须给不同的语料目录**：`V2_CORPUS_DIR` / `V3_CORPUS_DIR` / `V4_CORPUS_DIR` /
  `V5_CORPUS_DIR`。探针 runner 为**每个探针**分配独立目录，否则同一套件的并发实例会互相覆盖语料；
- `audit-v5-sensitivity.mjs` 现在**自己**把 `V5_CORPUS_DIR` 指向临时目录：被变异的插件绝不能把
  自己的提示词倒进随包语料；
- `audit-persona-sensitivity.mjs` 用 `PERSONA_ROOT` 指向变异副本，且在覆盖模式下**不写**语料；
- `audit-formal-sensitivity.mjs` 同样给每个探针独立的 `V{2,3,4,5}_CORPUS_DIR`；
- `audit-prompt-invariants.mjs --self-probe` 用 `PROMPT_INVARIANTS_MUTATE`（JSON `[rel, from, to]`）
  在**内存里**变异一个文件并自我重跑，**不碰磁盘**，因此可与任何东西并发；
  变异串里不要用 NUL 分隔（环境变量不允许 NUL 字节）。

## 5. 策略建议（按目的选最小代价的组合）

| 目的 | 跑什么 | 预期 |
|---|---|---|
| 改了某个架构的插件 | `node tests/run-tests.mjs --only <vN>` + `node tests/audit-formal-sensitivity.mjs --only=vN` | 30 s – 3.5 min |
| 改了提示词/人设 | `node tests/run-tests.mjs --only persona --only prompt` + `node tests/audit-persona-sensitivity.mjs` | ≈ 20 s |
| **改了任何工具的参数 schema / 参数处理** | `node tests/run-tests.mjs --only audit-prompt-invariants --only formal` | ≈ 60 s（v2 套件占大头） |
| 改了 `tests/` 下的 runner/守卫 | `node tests/run-tests.mjs`（**必须**：它现在同时跑套件与探针，任何一条守卫变红都会让门禁失败） | **≈ 3.5 min** |
| 只想快速看提示词/文档有没有漂移 | `node tests/audit-prompt-invariants.mjs && node tests/audit-spec-traceability.mjs` | **< 3 s** |
| 只想知道"快不快" | `node tests/run-tests.mjs --json` | 读 `wallSeconds` / `slowest` |

**每次跑完都要看那几行 timing**：如果某个套件突然比基线慢很多，先怀疑新增的固定等待，
再怀疑它是否在等一个永远不会发生的条件（这正是 v2 套件 186 s 的成因）。
