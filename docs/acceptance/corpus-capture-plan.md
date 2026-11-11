# 真实语料捕获计划（RUN 78 / TB-2736）

这份计划回答四件事：**语料是什么、从哪些根来、覆盖到哪一层、没覆盖到的读数怎么被识别**。
`tests/audit-prompt-names.mjs` 的 BLOCKER 判定是这个计划的**可执行形式**——计划里写的层，审计会真的去查；计划没写的层，审计不许用「同名键在别处出现过」冒充。

## 1. 语料是什么

`scripts/sim/harvest/real.mjs` 从真机会话日志里扫出每一次工具调用，产出四个文件（仓库外，默认 `D:/_tmp/sim/`）：

| 文件 | 内容 | 谁读它 |
| --- | --- | --- |
| `real-fieldset.json` | 每个 `vibe_*` 工具的**字段并集**：`{ tool: { keys: [...], paths: [...] } }` | `tests/audit-prompt-names.mjs`、保真度审计 |
| `real-receipts.jsonl` | 每条真回执一行：`{run, sessionId, tool, build, buildWhy, ok, code, keys, bytes, msgHead}` | 拒因分布、漂移定位 |
| `other-tools.jsonl` | 非 `vibe_*` 工具的同类行 | 工具面普查 |
| `real-stats.md` | 规模表、拒绝码分布、字段并集、盲区、以及第 ⑥ 节「嵌套路径并集」 | 人读 |

语料回答的唯一问题是：**「这个名字有没有被真机产出过」**。它不是契约来源——旧语料里的工具名会与现仓库不一致（本轮：语料 69 个工具、仓库注册 106 个），差集只说明「还没被真机调用过」，不说明产品缺这个工具。

## 2. 从哪些根来

真机有两个会话根，harvester 一次跑**并集**：

| 根 | 来源 | 本轮规模 |
| --- | --- | --- |
| `~/.dsh/sessions`（`os.homedir()`） | 历史真机 | 1 905 个会话日志 |
| `<WS_ROOT>/sessions`，`WS_ROOT` 默认 `D:/_tmp/slv-phase5` | 当前 `DSH_HOME` 的真机 | 69 个会话日志 |

规则：

- 候选根由 `sessionRoots()` 给出：`VMU_SESSIONS_ROOTS`（分号分隔，多根显式覆盖）或 `VMU_SESSIONS_ROOT`（单根，兼容旧调用）或默认 `[SESSIONS_ROOT, join(WS_ROOT, 'sessions')]`。
- **不猜目录名**：一个根算不算根，只看它下面（深度 ≤ 2）有没有 `session.v4.jsonl*` 日志（`hasSessionJournal`）。真机工作区目录名是 `slvp25X-ws` 这种会变的名字，写死会静默漏掉新真机。
- 会话按 `run + '\0' + sessionId` 去重：同一条会话出现在两个根里只读一次，重复计入 `duplicateSessions`（本轮 0）。
- 幂等：同一批会话重复 harvest，行数与字段并集逐字不变（新判据 §2 断言）。

## 3. 覆盖到哪一层

`real-fieldset.json` 的每个工具同时给两套集合：

- `keys`：**顶层键**（旧读者只认这个：`scripts/sim/audit/refusals.mjs`、`paper-gates.mjs`、`fidelity-extra.mjs`、`sim-vs-real` 等）。保持原样，不许因为加嵌套而变小。
- `paths`：**嵌套路径**，数组下标折叠成 `[]`，例 `status.turnReceipts[].notices.blockChars`。递归上限 `PATH_MAX_DEPTH = 6` 层（数组下标也计一层），容器与叶子都算路径（`{}` 本身也是一条「这里出现过一个对象」的事实）。

本轮重产结果（`node scripts/sim/harvest/real.mjs`，约 14 s）：

```
sessionRoots: 2      rootDirs: 178       duplicateSessions: 0
sessionFiles: 893    events: 154958      results: 30509
receipts: 22563      otherTools: 7946    parseFailed: 7751
tools: 69            pathsTotal: 8256    real-fieldset.json: 382 753 B
paths: 8 256（其中 ≥3 段 3 304，含 [] 1 698，最长 7 段），keys: 1 495
```

RUN 78 暴露的那条读数已经能被语料证明：`status.turnReceipts[].notices.blockChars` ∈ `vibe_vmu_turn.paths`，同一对象下还有 `lines / rendered / namedEmpty`（`status.turnReceipts[]`、`turnRow.notices`、`turns[]` 三处形状）。

## 4. 没覆盖到的读数怎么被识别

`tests/audit-prompt-names.mjs` 的判定从「键名集合」改成「**路径集合**」：

1. 语料能证明的路径 ⇒ 该名字 `RECEIPT_KEY` 通过（不再需要人工登记）。
2. `COVERAGE_GAP_PROVENANCE` 的 `producedBy` 里写了回执路径 ⇒ 只有该路径**真的在语料里**才通过；语料不携带 ⇒ BLOCKER（提示词 `a same-named key elsewhere is a different existence`）。
3. 名字在别处（比如顶层 `lines`）出现过，不能当作 `turnReceipts[].notices.lines` 的证据——这是本轮修掉的误判形态。
4. fieldset 里没有 `paths`（老语料 / 手写 JSON）⇒ 审计**直接 fail 并点名重产命令**，不许静默退化成「只看顶层键」。
5. `--self-check` 覆盖两向：路径携带 ⇒ pass；同名叶子但路径不携带 ⇒ blocker；coverage-gap 声明路径缺席 ⇒ blocker。

读数：

| | 旧 harvester + 旧判据 | 新 harvester + 新判据 |
| --- | --- | --- |
| `COUNTS ... fields=` | `22 (coverage-gap=22)` | `0 (coverage-gap=0 unclassified=0)` |
| `PATHS` | 不存在 | `8256 (nested=3304)` |
| `READINGS claims=25 pass=` | `25 gap=12` | `37 gap=0` |
| `READINGS-DISTINCT gap=` | `4` | `0` |
| `BLOCKERS` | `0`（本机语料；盲区表现为 coverage-gap，不是 blocker） | `0`，exit 0 |

> 口径差异：立书时 RUN 78 现场读到 `BLOCKERS 2`；本机旧语料复现出来是 22 条 coverage-gap + 12 条 reading-gap、`BLOCKERS 0`。差别来自「当时语料更小 / 更旧」，不是判据变宽——新判据的 blocker 只会在「声明了路径但语料不携带」时出现（新判据 §4 用删路径的 fieldset 实测到该 blocker）。

## 5. 怎么重产

```bash
node scripts/sim/harvest/real.mjs                 # 默认两个根，写 D:/_tmp/sim/，约 14 s
VMU_REAL_OUT=D:/_tmp/sim2 node scripts/sim/harvest/real.mjs
VMU_SESSIONS_ROOTS='<rootA>;<rootB>' node scripts/sim/harvest/real.mjs   # 指定多根（测试用）
```

纪律：**不要**把 harvest 塞进 T1（T1 只读产物）；**不要**在真机运行窗口里跑 sim-gate / 全量 T1；语料只留在 `D:/_tmp`，不许进仓库。

## 6. 判据与反关灯

新判据 `tests/audit-corpus-nested-keys.test.mjs`（30 passed / 0 failed，约 8 s；缺语料必须红，因此在 `tests/package-membership-dev-only.json` 登记）：

- §1 用真实 `vibe_vmu_turn` drive（caller 停放路径）产出带 `notices` 的回执，写进夹具语料；
- §2 两个假会话根合并 = 2 行、重复跑仍 2 行；`status.turnReceipts[].notices.blockChars` 在 paths 里、旧顶层 `keys` 仍在；
- §3 把 `notices` 换 `{}` ⇒ 该路径消失（容器仍在，证明是测量出来的）；
- §4 真语料 ⇒ `BLOCKERS 0`；把真实 fieldset 里含 `notices` 的路径删掉 ⇒ blocker 且 note 含 `does not carry that path`。

三盏反关灯（整树副本、字节级改写、还原后逐字节校验 `scripts/sim/harvest/real.mjs` sha256 = `a5b4ef60f3ddae1e9b85e14698d76e2d42745a00ee9cdef325be9a9865d9dd37`）：

| 灯 | 变异 | 结果 | 红原文（要点） |
| --- | --- | --- | --- |
| L1 深度回退 | `PATH_MAX_DEPTH = 6` → `1` | 26/4 | `§0b the cap is a constant…`、`§2e the RUN 78 nested reading is captured as a PATH - []`、`§2f`、`§3c` |
| L2 `notices` 成空对象 | `pathsOf` 前置把每条 receipt 的 `notices` 清空 | 28/2 | `§2e … - ["status.turnReceipts[].notices","turns[].notices",…]`（只剩别的形状）、`§2f` |
| L3 恒真收集 | `pathsOf` 的 `return [...out].sort()` → `return []` | 26/4 | `§2d the fieldset carries a path set - 0`、`§2e`、`§2f`、`§3c` |

## 7. 已知边界

- **深度 6 截断**：更深的形状只登记到第 6 层；若某读者读第 7–8 层，需要同时提高 `PATH_MAX_DEPTH` 并重产语料（判据 §0 钉了这个常量）。
- **只收 `vibe_*`**：`other-tools.jsonl` 另存，但不进 `paths`——审计只关心产品工具回执。
- **数组下标折叠**：不同长度的数组按同一路径登记，因此「出现过形状」比「每条实例」粗；这是刻意的（语料不该长成契约）。
- **不推断**：只记收到的形状；产品新加的嵌套读数在真机产出前不会被语料证明，此时只能用 `COVERAGE_GAP_PROVENANCE` 并写清 `producedBy` 路径，等下一次重产。
- **分文件策略未触发**：本轮 `real-fieldset.json` 382 KB（阈值 4 MB 时按 `real-fieldset.d/<tool>.json` 分文件，读取方保持一个入口）。
