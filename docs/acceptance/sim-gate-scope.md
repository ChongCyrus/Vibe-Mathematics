# 零 token 模拟门禁：证明边界（TB-2605 / task-87）

> 这份文件回答一个问题：**`node tests/sim-gate.test.mjs` 变绿之后，到底哪些事情算被证明了？**
> 三张表分别是「sim 能证明」「只有真机能证明」「已用 sim-vs-real 逐字段对照过的工具」。
> 本文件是**唯一出处**；`docs/acceptance/phase12-v5r-rules-conformance.md` 由 prompt-lane 收口，
> 不在此重复（避免两处真相）。

## 0. 这道门禁跑什么（三段，实测口径）

<!-- gate-baselines: drift=1.25 floor=1500 calib-ref=5754 end-to-end=2233 meeting-matrix=9577 audit/all=40126 determinism=5170 -->
<!-- calib-ref 是固定校准子进程（scripts/sim/audit/calibration-work.mjs）的实测中位数：2026-11-11 22:0x 安静窗口连跑三次取中位；它只用于打印争用画像，不除任何成本。 -->

上面这行是**机器可读的基线**（每段的 **user CPU 毫秒**，安静窗口实测）：`tests/sim-gate.test.mjs` 直接读它做漂移判定，
所以本文与门禁不可能各说一套。改基线必须同时改这一行与下表。
2026-11-09 19:44–19:50 在**同一静默窗口**重测（三次连跑门禁，另加三次单跑交叉核对）：
`end-to-end` 2689/2712/2470 → 中位数 **2689**；`meeting-matrix` 门禁内 10642/10458/13033、单跑 10912/12624/11622
→ 六次中位数 **11267**（若只取门禁内三次中位数 10642，实测最大值 13033 只剩 2 % 余量，等于把噪声当漂移）；
`audit/all` 58719/56725/53711 → 中位数 **56725**（§5 改成嵌套叶比较后，这一段的真实成本从 ~49.8 s 涨到 ~56.7 s，
是**真的变贵**，不是抖动）；`determinism` 4947/4572/5974 → 中位数 **4947**。
原始日志：`D:/_tmp/sim/gate-baseline-{1,2,3}.log`。
### 0.0 尺子：量的是 CPU，不是墙钟（TB-2728，2026-11-11 22:40）

上面这一行的四个数字是**每段的 user CPU 毫秒**（该段整棵进程树的 user time 之和），不是墙钟；
`calib-ref=5754` 是固定校准子进程在 4 核机器上的实测中位数（2026-11-11 22:0x 安静窗口，
`node scripts/sim/audit/calibration-work.mjs` 连跑三次取中位；它同时被冻结工作量守卫钉住：
`items` 不是 160000 ⇒ `CALIBRATION-WORK-CHANGED`）。**换尺子之后，本文件下文所有墙钟读数与
旧的墙钟基线（2.7 s / 14.0 s / 56.7 s / 4.9 s 等）不可比**，它们只作历史记录保留。

为什么换：墙钟量的是「机器有多忙」，不是「代码有多贵」。TB-2728 在 4 核上起 3 个 CPU 霸占进程后实测，
`meeting-matrix` 墙钟 8.3 s → 15–22 s（2.3×），而它的 CPU 只 9.7 s → 12.2 s；`end-to-end` 墙钟 1.7 s → 5.0 s（2.9×），
而 CPU 2.2 s → 2.4 s（+8 %）。第 79 轮那两次假红就是前一种读数：当时唯一的补救是抬基线，而那正是
「把噪声买成预算」。所以判据改成 CPU：**cost = 该段整棵进程树的 user CPU**。
量法：`scripts/sim/audit/cpu-probe.mjs` 经 `NODE_OPTIONS=--import` 装进门禁启动的**每个** node 进程，
进程 exit 时把自己 `process.cpuUsage().user` 追加进 `$VMU_GATE_CPU_DIR/cpu.jsonl`；每一段跑完，
门禁把新增行求和，就是这一段真正烧掉的 CPU（不量墙钟、不量父进程、不量单线程）。

为什么不判 total CPU（user+system）：system time 随调度抖动上涨。同一段实测 user 8937/9093 → 10015/10421 ms
（+12–15 %），system 1578/1750 → 1937/2203 ms，total 9812 → 12218 ms（+25 %）——**system 涨的是「机器在忙」，
user 涨的才是「活变多」**。为什么不用校准子进程自己的 CPU 时间：它就是被拖慢的对象（静默 770 ms →
3 个霸占进程下 1607 ms），用被拖慢的读数去除被拖慢的读数等于没校正；而用「同一时刻的固定作业墙钟」做分母，
又因为不同形状的进程被拖慢比例不同（长段 2.3×、短段 2.9–3.3×、长校准 1.6–2.2×，
`D:/_tmp/tb2728/DIAGNOSIS.md`）而永远留残差。

墙钟仍然打印（`segments:` 行里的 `wall …ms` 与 `total cpu …ms`），但**不进断言**；
`SEG_MS` 仍是硬超时兜底——超时是安全阀，不是尺子。两个长校准点保留为**报告值**：一次门禁会打印
`contention=1.69x` 这样的争用画像，让人看得见「现在是忙机器」，但它不参与判定。

下面这段是换尺子前的墙钟历史（保留证据，不与上文数字比较）：

`audit/all` 的基线在 2026-11-10 03:39 重钉为 **62000**：静默树实测仍是 43–58 s，但 T1 以 **k=3 并发**跑，
而这道门禁自己就是其中一条；压线那次实测 **75031 ms**（`SIM_GATE_FAILED`，超 75000 ms 预算 31 ms）。
抬了段预算（见下表）不等于放宽漂移断言——`drift=1.25` 与 `floor=1500` 都不动，62000 × 1.25 = 77500 ms，
既容得下并发读数 75.03 s，也仍会在「真的变贵 25 %」时报红。

`meeting-matrix` 的基线在 2026-11-10 19:44–20:06 重钉为 **12558**（同一条理由，这次是给这一段的并发成本补账）。
起因是 RUN 269 的权威全量 T1（k=3）报过一次红：`meeting-matrix: 14352 ms vs baseline 11267 ms (allowed 14084 ms,
268 ms over)`——而同一轮其它三段（`end-to-end 2844/4189`、`audit/all 75130/77500`、`determinism 5918/6447`）都合规。
当时四条车道并发在跑套件，所以那 268 ms 可能是在量别人的活，也可能是并发成本真的涨了；问题在于**当时没有同条件的正常读数可以对照**
（`segments:` 行原先打在汇总行之前，而 `tests/run-tests.mjs` 只保留通过套件的最后一行 stdout ⇒ 这道门禁的耗时只在红的时候才出现）。
先把 `segments:` 挪到汇总行之后（断言零改动，见 `tests/sim-gate.test.mjs` 末尾注释），再在树静默、无车道并发的情况下连跑三次全量 T1
（`D:/_tmp/t1-k3-seg269-{1,2,3}.log`）：`meeting-matrix` 12287 / 12606 / 12558 → 中位数 **12558**（三次全 `TOTAL 850 PASS 850 FAIL 0`；
第 3 跑另有 1 条与本段无关的 flake，见下）。同一批三次静默单跑（`D:/_tmp/simgate269/run{1,2,3}.log`）读数是 9751 / 8394 / 8463 → 中位 **8463**：
k=3 让这一段贵约 48 %，这就是「跑在什么条件下，就用什么条件下的基线」。
重钉后允许量 12558 × 1.25 = **15698 ms**，既容得下那次 14352 ms 的四车道读数，也仍会在「真贵 25 %」时报红——
**单次尖峰不重钉，只有同类条件下的重复读数才重钉**（TB-2688 的「≥3 读数取中位」），这与「预算是为诚实工作量买的，超时仍然 FAIL」是同一条纪律。

`meeting-matrix` 的基线在 2026-11-11 05:00–05:30（RUN 77 缺陷批次收口）再钉一次为 **14000**。这一次的读数形状与上次不同，
所以口径也写清：同一段在**门禁内**（k=3）三次读数是 17 029 / 13 558 / 12 877 ms（`D:/_tmp/t1-run27{2,3,4}.log`，
第 1 次红、后两次 `TOTAL 864 PASS 864 FAIL 0`），而**同一棵树的静默单跑仍是 8 360 ms**——即这一段自己没变贵，
变的是它与谁同时跑：本轮给 `mutation-evidence`（155 s，内嵌真实变异副本）补了 LPT 权重，于是它和 `sim-gate` 落进同一波。
按 TB-2688 的中位口径三次读数是 13 558（中位）但最大值 17 029 已超出 15 698 的允许量，因此基线取「实测最大并发读数 / drift」
的向上取整（17 029 ÷ 1.25 = 13 623 → 14 000），允许量 17 500 ms，既容下已观测到的最大值（余 471 ms），也仍会在真贵 25 % 时报红。
**这一段现在是「贴着天花板」的段**：它量的是 CPU 争用而不是代码成本，若要它更稳，得让它别与重活同波（下一轮 TB-2728：把段预算改成对争用不敏感的量法，而不是继续抬数字）。
第 3 跑那条与本段无关的 flake 是 `vmu-run259-audit14.test.mjs` 的 §4f：它在**写盘调度尚未落地**时数文件（`actual 6 / expected 5`），
不是产品写了一个文件；修法是新增 `settleFiles()`（先 join `kernel.flushRecordsFold()`，再等计数连续三次不动），断言仍逐字节严格。

**允许量 = `max(基线 × drift, 基线 + floor)`**，两项各有分工、都不是豁免：
- `基线 × 1.25` 是**成本规则**：门禁不许悄悄贵 25% 而不被告知（这条针对所有段）。
- `基线 + 1500 ms` 是**亚 5 s 段的调度噪声规则**：共享机器上 2.7 s 的运行会抖 ~1 s，1.25× 对它就只剩 ±665 ms，
  会让一条真绿的门禁随机变红。floor 是**绝对量**，对大段永远不起作用
  （`max(1.25 × 62 s, 62 s + 1.5 s) = 77.5 s` 仍是 1.25× 项，+1.5 s 让不出来）。
- 一条段只有**超过 `max(基线×1.25, 基线+1500 ms)`** 才算漂移。推论：56.7 s 段上 **+9 s 不算漂移**
  （+16 % < 25 %，这是 1.25× 成本规则的定义，不是漏洞），+15 s 才算。门禁自带两条自证（数值由文档基线**算出来**，
  不写死绝对毫秒，避免基线一改自证就失效）：
  (i) 用 wrapper 在 end-to-end 前**真的烧掉** `ceil(允许量 − 本轮实测 CPU) + 1000 ms` 的 user CPU，
  且被拖慢的那次仍是真跑（exit 0）⇒ 必须判红；(ii) audit/all 落在「基线 + 25 % 允许量的 64 %」⇒ 必须**仍绿**，
  落在「允许量 + 1000 ms」⇒ 必须判红（证明 floor 没有把成本闸变成"一点都不能涨"的墙）；
  (v) **同一 wrapper 只 `setTimeout` 睡同样时长**（墙钟涨、CPU 不涨）⇒ 必须**仍绿**。这一条是「判的是 CPU」
  的对照面：没有它，「不量墙钟」就只是一句没人检验的话。

| 段 | 命令 | 实测耗时 / 预算 | 漂移上限（max(基线×1.25, 基线+1500 ms)） | 证明什么 |
|---|---|---|---|---|
| 1 | `node scripts/sim/run.mjs --scenario end-to-end` | **2.2 s CPU / 15 s** | 3.7 s | 全生命周期（立所 → hire → 命题 → 蓝图 fs-first → 会议 → 裁决 → 记录 → 论文 → 结题）在**真内核、真工具注册**下走得通，且**机制拒绝 = 0**（预期拒绝必须能被账本按 seq 点名，泛化赦免 `advisory > 0` 直接判红） |
| 2 | `node scripts/sim/run.mjs --scenario meeting-matrix` | **9.6 s CPU / 45 s** | 12.0 s（9577×1.25） | 会议面矩阵（预约/签到/开门/发言/动议/表决/裁决/闭会）每条路径的**回执形状** |
| 3 | `node scripts/sim/audit/all.mjs` | **40.1 s CPU / 150 s** | 50.2 s（40126×1.25） | 15 个场景的 A1–A5 回执审计 ＋ 93 条规则覆盖 ＋ 工具/动作覆盖 ＋ 与真机回执的**字段级**保真对照（嵌套叶路径） |
| 4 | 确定性重放（门禁内部，两次同一输入） | **5.2 s CPU / 15 s** | 6.7 s（max(5170×1.25, 5170+1500)） | 同一输入两次跑：`pairs.jsonl` 归一化后**逐字节相同**（TB-2634 之后 consult id 已是确定性铸出，raw id 序列本身也逐条相等；归一化只是安全网） |

总预算 **150 s 硬超时**：超时即失败，**不许 skip**（`SIM_SKIP` 之类的环境开关不存在）。
**慢要被判据抓住，不是靠抬 cap 消化**：每段实测时长还必须 ≤ 上表的允许量，超过就报「哪一段、实测多少 ms、
允许多少 ms、超出多少 ms」⇒ 门禁红。抬 cap 是让人更晚发现成本上涨；漂移闸才是真判据。
三种破坏必须让它变红（门禁里各有一条自证）：① 某场景 `expectedRefusals` 改成「全赦免」⇒ 多出的拒绝不被赦免，账本报 `advisory`/`unpredicted` 并 exit 1（同一语料在旧的谓词匹配器下会 exit 0）；② 语料副本里某条回执的 `receiptSpan` 偏 1 字节 ⇒ pairs 的逐字节比对红；③ 注入 `SIM_SELFTEST_FAILURE=<CODE>` ⇒ 头部 `scenario self-checks: 1 FAILED` 且 exit 1。

## 0.1 这道门禁**不许**做的事（自带豁免与省时捷径）

- **门禁不许自带豁免**：不设"已知红名单"，任何场景一旦红就是门禁红。特别是 `turns` 的
  `VMU_TURN_PARKED_NEEDS_OWNER`——它是 TB-2616（RUN 256）的核心语义，只会被**正面**（先 `drive` 再 `step` 配对）
  与**反面**（不先 drive 直接 reply ⇒ 具名拒、且拒后 `pending` 仍空、没有新回合被开）两条断言同时钉住，
  不会因为"内核刚改过"就被登记成预期失败。
- **不许用 `--only` / 环境变量把某一段跳过**：三段（e2e / meeting-matrix / audit-all）都必须真跑；唯一的环境变量是
  `SIM_KEEP_CORPUS=1`（保留临时语料供人工查看），它**不改变**任何断言。
- **总 150 s 是兜底，不是分配**：各段 cap 是**每段上限**（当前 15 / 45 / 150 / 15 s），三段之和另受总兜底约束；谁先超谁负责；超时文案必须**点名段名
  ＋ 实测值 ＋ 预算**，不许只写"超时"。而 cap 之外的**漂移闸**（每段 ≤ `max(基线 × 1.25, 基线 + 1500 ms)`，
  基线读本文 `gate-baselines` 行）才是防止"成本悄悄上涨"的判据：抬 cap 只会让发现变晚。
- **不许把"没有引擎"当成绿**：`toolchainAbsent` / `pdfEnvironmentMissing` 是**具名事实**，不是通过；
  它们只证明"环境缺失被记录下来了"。
- **不许手抄数字**：本文与 `AUDIT.md` 里所有计数必须来自实测命令或 `manifest.json`；改场景后重跑、不要沿用旧值。

## 0.2 为什么这道门禁里有 `turns` 的**正反两面**用例

TB-2616 给「调用方拿回复答」引入 **parked prompt 所有权**：一个成员回合必须先被 `drive` 派发（`deliver.pending()`
非空），`step` 才能交付答复；否则拒绝必须是**具名**的 `VMU_TURN_PARKED_NEEDS_OWNER`，且被暂存的答复必须被丢弃。

仿真面因此同步改成 **`drive` → `step` 配对**（`scripts/sim/scenarios/turns.mjs`：member 与回合 id 只来自上一条
`drive` 回执，不写死），并新增**反面用例**：不先 `drive` 就直接 reply ⇒ 断言具名拒绝、`parkedReason:
'no-parked-prompt'`、`parkedReplyDiscarded:true`、`pending` 仍为空、没有新回合被开。正面证明「机制能走通」，
反面证明「机制会拒绝」——只钉正面等于把一次契约变更变成"场景迁就了内核"。

## 1. sim **能**证明的事情（机制面）

| 事实 | 证据形状 | 谁在钉 |
|---|---|---|
| 工具注册/参数 schema/回执字段（69 个工具、225 个声明动作） | 每次调用留下**真回执**（内核返回对象，不是手写的） | 门禁段 1/2 ＋ `tests/sim-scenario-contracts.test.mjs` |
| 状态机与账本：立所、编制、命题、蓝图 fs-first（草案 md → propose → codesign → adopt → 规范 md）、会议三态、裁决汇总、记录两轨、论文九节/评审/定稿 | 回执链上的 id 只能来自**上一条回执**（禁止 hardcode）；跨场景 sweep 逐场景 exit 0 | 门禁段 1 ＋ `tests/sim-end-to-end.test.mjs`、`tests/sim-mainline.test.mjs` |
| 「机制拒绝」与「预期拒绝」的分界 | 账本式 `expectedRefusals`：一条声明只赦免一条拒绝、未命中单列 `declared-but-never-hit`、**泛化赦免直接 exit 1** | `scripts/sim/run.mjs` 匹配器 ＋ 门禁段 1/2 的 `mechanism/advisory` 断言 |
| 成员/主席**实际读到的提示词**（含新到消息、状态行、会议议程） | `prompts/<seq>-<seat>.txt` ＋ 与「产生它的那条回执」逐字节配对（`pairs.jsonl`：`receiptText` 来自真渲染器，`receiptSpan` 切片逐字节相等） | `tests/sim-paired-corpus.test.mjs` |
| 环境缺失必须**具名**（无 LaTeX / 无 LLM / 无子会话） | `final.toolchainAbsent:['latex']`、`pdfEnvironmentMissing:true`、`compile` 的 `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`、`VMU_ENGINE_UNAVAILABLE` | 门禁段 1 的最终定稿断言 ＋ 回执审计的环境豁免清单 |
| 文件面副作用（库内文件、sha256、记录区 md/tex/meta） | `tree.json` 逐文件 bytes/sha256 与 kept workspace 磁盘一致 | `tests/sim-end-to-end.test.mjs` |
| 适配器边界的三类拒绝（散文无围栏 / 形状错 / 无负载） | `VMU_TURN_NO_FENCE`、`VMU_TURN_DELIVERY_SHAPE`、`VMU_TURN_DELIVERY_NO_PAYLOAD` 各自的具名回执 | `tests/sim-harness-shape.test.mjs` |

## 2. **只有真机**能证明的事情（sim 结构上做不到）

| 事实 | 为什么 sim 做不到 | 真机上的判据 |
|---|---|---|
| 模型是否**按提示词行事**（会不会写围栏、会不会把状态块当真、会不会误读议程） | sim 的成员回复是脚本/夹具；它只能证明「给出这种回复时机制怎么反应」 | 真机 run 的 KPI 与回执语料（`直接验收` 阶段） |
| 子代理/宿主会话的真实交付（`deliverMode:'subagents'` 的 spawn、prompt 投递、token 计量） | harness 用模拟适配器替换了宿主 seam；`VMU_ENGINE_UNAVAILABLE` 在 sim 里是常态而非证据 | 真机 run 的 `turnEngine.turnReceipts`、token 账本 |
| 真实 LaTeX/Lean/数值引擎的**输出正确性** | 本机无引擎时 sim 只记录 `toolchainAbsent`；有引擎时也只验退出码与产物存在 | `tests/audit-engine-faces.mjs` ＋ 真机论文交付 |
| 并发/长时间挂起（会议窗口真实等待、parked 回合超时、跨会话恢复） | sim 用注入时钟推进，等待被压缩成一次 `sweepDue`/一次推进 | 真机长跑（会议 lateAdmission、abandonAfterMs 等实测） |
| 「成员看到的世界是否与 office 以为的一致」在**真实模型**下 | 提示词文本可核对，但模型是否据此行动不可模拟 | 真机语料的 P0 铁律逐条对读 |
| 跨设备/跨 OS 路径与时区 | sim 在 D:/_tmp 固定 root、注入时钟；真机才有 `ProgramFiles`、TZ、盘符差异 | 真机验收矩阵（Windows/macOS/Linux） |

## 3. 已用 sim-vs-real **逐字段**对照过的工具（不是「看起来像」）

来源：`node scripts/sim/compare/run.mjs`（TB-2604），门禁段 3 的第 5 节实测读数：
**live 侧有字段清单的工具 69 个，已对照 69 个，未解释差异 0（`gaps: 0`）**。
对照规则（四条归一化 + 归因矩阵）：ISO 日期、uuid、邮件 id、绝对路径折叠成占位符；领域 id（`r-1`、`m3`）保留；
配对按「工具 + 参数形状」而不是步号；每一处字段差异必须被**声明**归类（声明缺口 / 覆盖 / 时钟 / id / 产品缺陷），
无法归因的差异在 strict 模式下直接判红（`tests/sim-vs-real.test.mjs` 的 MUTANT 自证）。
构建戳见 `scripts/sim/README.md` 的 buildFilter 段（TB-2641）：真机行带 `build`，取自 journal 头的 `run-metadata` 密封事件，`--only-build` 据此排除旧构建行。

| 工具族 | 覆盖的代表工具 | 已对照字段的典型维度 |
|---|---|---|
| 立所/编制 | `vibe_v5_start`、`vibe_v5_hire`、`vibe_vmu_status` | `hired`、`roster`、`slot`、`capacity` |
| 命题/蓝图 | `vibe_v5_record_proposition`、`vibe_v5_blueprint`、`vibe_v5_read_library` | `recordId`、`path`、`revision`、`md`、`codesign`、`mdFingerprint` |
| 会议/公议 | `vibe_v5_meeting`、`vibe_vmu_meeting`、`vibe_v5_say`、`vibe_v5_motion`、`vibe_v5_second` | `meeting`、`state`、`quorum`、`arrival`、`speeches` |
| 裁决 | `vibe_v5_verdict`、`vibe_v5_verdict_ask`、`vibe_v5_verdict_final` | `submission`、`asked`、`p1RulingReading`、`value` |
| 记录/档案 | `vibe_vmu_records`、`vibe_v5_record_progress`、`vibe_v5_record_method` | `records`、`track`、`rev`、`fingerprint`、`rowsFrom` |
| 论文 | `vibe_v5_paper`（start/part/review/advance/final/render/compile/consult） | `started`、`part`、`advance`、`final`、`archiveArtifacts`、`pdf` |
| 回合/任务 | `vibe_vmu_turn`、`vibe_v5_task_create`、`vibe_v5_task_update`、`vibe_v5_lean_*` | `awaiting`、`memberPrompt`、`turnLoop`、`task`、`blocked_by` |

**未对照**：真机上未触发过的动作（`declared actions 225 / covered 218 / never-exercised 7`）与
本机没有引擎的工具面（Lean 编译、LaTeX 编译）——这些在门禁里不会被伪装成「已覆盖」。

## 4. 复现与读数

```bash
node tests/sim-gate.test.mjs                                  # 本门禁（150 s 硬预算 + 每段 1.25x 基线漂移闸，超过即红）
node scripts/sim/run.mjs --scenario end-to-end --out D:/_tmp/sim/e2e   # 段 1 单独跑
node scripts/sim/audit/all.mjs --out D:/_tmp/sim/gate-audit            # 段 3 单独跑（写 AUDIT.md）
node scripts/sim/audit/all.mjs --strict                                # 有 FAIL 即非零退出
```

**计数纪律**：上文所有数字都是**实测量**（括号里写了命令）。改动场景或工具面后，数字会变，
必须重新量、不要手抄；`scripts/sim/audit/all.mjs` 的 `AUDIT.md` 与各场景 `manifest.json` 是唯一出处。

## 5. 放行闸与 sim 门禁的关系（TB-2609）

起跑前的判定只有一条命令：`node scripts/sim/audit/release-ready.mjs`。它读四条事实，输出 `READY` 或
`NOT READY: N reason(s)` 加每条具名 code；**任何一条不成立就是 NOT READY**，没有默认绿。

| 事实 | 读什么 | 不成立时的 code |
|---|---|---|
| sim 门禁**本次**跑过且绿 | 进程内现跑 `tests/sim-gate.test.mjs` | `SIM_GATE_NOT_RUN`（含 `--no-gate` 跳过）/ `SIM_GATE_FAILED` |
| 审计报告是**当前**的 | 最新 `D:/_tmp/sim/**/AUDIT.md`，mtime 必须晚于 HEAD **且**晚于 `vibe-math-vmu/`、`scripts/`、`tests/` 里最新一次未提交改动 | `AUDIT_MISSING` / `AUDIT_STALE` / `AUDIT_PREDATES_WORKTREE` / `AUDIT_DRIFT_UNMEASURED` |
| 审计**干净** | `AUDIT: PASS`、五节齐全、fidelity `gaps: 0` | `AUDIT_FAILED` / `AUDIT_INCOMPLETE` / `AUDIT_FIDELITY_GAPS` / `AUDIT_FIDELITY_UNMEASURED` |
| 没有 open P0 | `docs/acceptance/sim-audit-open-items.json`（open 的 P1 必须带 owner + condition） | `OPEN_ITEMS_INVALID` / `OPEN_P0` / `OPEN_NO_OWNER` |

- 驱动 `D:/_tmp/slv-phase5/slv-p14-cc.ps1` 在打印 PATH 之后调用它：NOT READY ⇒ **exit 7**
  （2 = 参数/路径错，6 = preflight/build 断言，7 = 零 token 证据不新——三者互不掩盖）。
- `-DryRun` 只做这一步就退出（0 = READY，7 = NOT READY），用来验证放行闸本身而不建 clone、不编译、不跑驱动。
- `-OverrideReleaseGate "<理由>"` 是**唯一**绕过口：理由同时打印并写进运行日志。
  绕过必须留痕，否则它就不是例外，而是默认。
- 为什么 `--no-gate` 不是省时开关：它的输出永远是 NOT READY 且第一条 reason 就是 `SIM_GATE_NOT_RUN`
  （「信任记得的绿不是门」）。同理，审计报告**存在**不算证据，**比它要放行的代码新**才算。
- 放行闸不证明任何模型行为，也不替代 §1/§2 的表：它只回答「这份零 token 证据是不是**现在**的」。
- **耗时说明**：这一条命令整跑约 **2–3 分钟**，其中大头是 R2 的**逐条 `proof` 真跑**（台账里每个 fixed P0/P1
  都对应一条 `node tests/...`，逐条 `execFileSync`，单条超时 300 s），不是卡死；门禁段本身的读数在
  `gate-baselines` 行里（本轮三段 **user CPU** 合计 52.6 s：2.2 + 9.6 + 40.1 s，墙上仍是 ~75 s，
  因为判据量 CPU 而墙钟还包含等待；余量上限见 §0 表）。看到它在跑几百秒，先数 proof，不要先怀疑挂起。
- 多条车道同时改工作树时，`AUDIT_PREDATES_WORKTREE` 会**一直**红——这不是误报，是这条事实的定义：
  审计必须读过真机将要加载的那份代码。它转绿的时机就是「该起跑的那一刻」（车道静默、审计在最后一次
  代码改动之后重跑过），所以它不会为了让人看见绿而把「有新代码没被审」算成新鲜。`READY` 分支由
  `tests/release-ready.test.mjs` 的 48 条断言覆盖（全绿事实 ⇒ READY；任一事实单点红 ⇒ 点名 code）；
  实跑证据见 `D:/_tmp/sim/tb2609-chain-final.log`（门禁 73/0、`AUDIT: PASS`）与
  `D:/_tmp/sim/tb2609-ready.log` / `tb2609-ready2.log`（活跃树上逐条点名 red reason）。

## 6. 复现放行闸

```bash
node scripts/sim/audit/release-ready.mjs            # 人或 CI 读的文本：READY / NOT READY + 逐条 reason
node scripts/sim/audit/release-ready.mjs --json     # 机器读：同一判定 + 四条事实的读数
node tests/release-ready.test.mjs                   # 判据自证：每种 NOT READY 都由 fixture 构造出来
pwsh -NoProfile -File D:/_tmp/slv-phase5/slv-p14-cc.ps1 -DryRun   # 端到端：NOT READY 必须 exit 7
```

## 7. 覆盖债的处置：补真实路径，不许加豁免（TB-2643）

fidelity 的 live 字段集是**外部数据**，而且只有**一份**：`D:/_tmp/sim/compare/real-fields.jsonl`（带点叶路径的 rich 语料，
由真机会话刷新；`scripts/sim/audit/fidelity-branches.mjs` 读它，缺失即审计 FAIL——不降级、不回落旧的 `real-fieldset.json`）。
它一变，仿真没产出过的字段就会变成审计 §5 的 `gaps`。处置规则只有一条：

> **补真实路径 + 硬断言；不许往 `scripts/sim/audit/fidelity-declared.json` 塞一条豁免键。**

**一个判据一张尺子**：覆盖债与声明评估共用这份 rich 语料；`real-fieldset.json`（旧顶层键集）只能用于快速定位，
不得进任何判据。**不同分支不同尺子不许互相量**：按 `ok:true` / `ok:false:<code>` 分区后只比同一分支；
拒绝分支的字段集不许和成功分支的字段集相减。**未覆盖的分支具名报告，但不许进 `gaps`、也不许进声明表**——
「仿真没走过那条路」是事实，不是豁免；想让数字好看，只能真去把那一步走出来。

2026-11-09 15:00:16 的刷新（52707 B，`sha256 c6f07847d8cb40f052c3f254d384b109d413ac523f8c394c176978453e2edcb4`）
一次暴露了 4 条覆盖债，全部在 `scripts/sim/scenarios/fidelity-extra.mjs` 用真实调用消除：

| 字段（live 读过） | 真实路径（场景步） | 硬断言 |
|---|---|---|
| `vibe_v5_record_proposition.p1GateSkipped` / `…Means` | G11：先写 p=0.9 的卡，再用**同一个 p** 重写它（`packs/v5r/tools.js` 的 `pUnchanged` 分支） | 字段都在，且值必须是 `p-unchanged` |
| `vibe_vmu_meeting.approver` / `decidedAtMeans` / `requests` / `undecidedRequests` | G12：pack 开的 debate 会 → 三人 attend → `leaverequest` → `leaverequests` → **`leaveapprove`（SIM-ONLY）** → 再 `leaverequests` | 四个字段都在；批准后 `undecidedRequests===0` 且该行 `decidedAt` 有时间戳。**真机 0 张 `leaveapprove` 回执**（`real-fields.jsonl` 全量）：这一步只用来把状态推到「已批准」，让 LIST 面（真机确有）可断言；它的字段形状不算「已覆盖真机路径」 |
| `vibe_vmu_turn.at` | G13：**没有任何回合在飞时** `op:"abandon"`（不传 `turn`） | `abandoned===false`、`at` 是 ISO 实例 |
| `vibe_vmu_human.failedSteps` | G14a：`VMU_STATE` 恢复失败（旧工作区留下的裸任务行让 `ledgers` 无法 hydrate，加上已存在的漂移让 `readback` 也失败；主 handle） | `code==="VMU_STATE"`、`failedSteps` 是数组且**同时含** `ledgers` 与 `readback` |
| `vibe_vmu_human` 的**漂移拒绝**（否定断言） | G14b：G10 的 `action:"readBack"` 回执 | 该回执**不得**携带 `failedSteps`，且 `action==="readBack"` |

- **覆盖债的判定以真机回执形状为准**：字段真机有、但挂在另一条拒绝路径上的，不许合并到一条路径上凑覆盖。
  `failedSteps` 只随 `code:"VMU_STATE"` 的 `recover` 出现（`real-receipts.jsonl:17271`/`:17394`）；
  `VMU_RESUME_READBACK_DRIFT` 是 `readBack` 的拒绝（`:11161`/`:11222`/`:17273`/`:17414`），那些回执没有 `failedSteps`。
  run-lane 的独立复核证据：`D:\_tmp\slv-phase5\run75-g11-g14-verify.md`（G11/G13 通过、G12 部分 SIM-ONLY、G14 原形状被否定）。
- 这四步都用 `requireFields()` 硬判：字段缺失或路径没走 ⇒ 场景 `failures` 非空 ⇒ `run.mjs` exit 1。
  所以「删掉一步」不会变成「0 缺失，因为 0 被测到」。
- 字段必须在**主 handle** 上产出：第二个内核（`boot({root: 别的目录})`）的回执不进语料、也不进审计。
  G13/G14 因此都跑在 `h` 上（G13 在回合尚未派发时、G14 在漂移已落盘之后），而不是另起一个内核。
- 只有**结构上不可能**在本仓库产出的字段才允许写声明（部署/config 形状）：键级、点名 seam、写明为什么不能修；
  声明是最后手段，不是捷径。声明键数有上限，审计 §5 的 `declarations are key-scoped` 就是它的账。
- 报告纪律：凡是「用补场景消覆盖债」的条目，报告里必须带**真机侧证据**栏（哪张回执、什么形状）；没有真机回执的
  步骤一律标 `SIM-ONLY`，并不计入真机覆盖率。

### 7.1 七条曾「stale」的 baseline 声明：为什么曾 stale、为什么现在不再 stale

2026-11-09 18:0x 的首轮 `audit/all` 报 `stale baseline claims: 7`：
`vibe_v5_record_proposition.p1RulingReading.*.true`、`vibe_vmu_mathjobs.job.*`、
`vibe_vmu_pack.settings.resolved.vmu.*.faces` / `…*.staleAfterMs`、
`vibe_vmu_status.closureVoteRecorded.undefined`、
`vibe_vmu_status.settingsMerge.*.vmu.*.faces` / `…*.staleAfterMs`。

旧读法会以为是「字段今天已经产出了、声明过期」，其实不是：**匹配器的消费顺序**错了。
`baselineRowFor()` 原先取**第一个**匹配行，同一族里较宽的声明（如 `…vmu.*`）先被消费，更窄的叶子声明
（`…vmu.*.faces`、`…*.staleAfterMs`）永远轮不到 ⇒ 每轮都被判成「列了，但今天不缺」。修法是
**最窄优先**（`cost = 通配段个数`，最小者先消费，平价取先出现），不是删行，更不是放宽 stale 检查。

证据（`D:/_tmp/sim/stale7-evidence.mjs`，读 `base-audit11/corpus-*` 的同一批语料）：

| 动作 | `gaps` | `staleClaim` |
|---|---|---|
| 当前 126 行 baseline | 0 | 0 |
| 删掉这 7 条**窄**声明 | 0 | 0 |
| 删掉它们的 9 条**父**声明（`p1RulingReading.*`、`settings.resolved.vmu.*` 等） | 39 | 0 |

⇒ 窄声明是父声明下的**叶子例外**：它让具体形状可以被点名，删掉它计数上看不出差别，gaps 也不会变大。
正因如此**不能删**——数字不会察觉「精确度」的丢失，只会察觉「覆盖」的丢失。

## 8. 拒绝不是通过条件：闸的拒因表（TB-2653 / R1–R8）

> **「拒绝了」不是通过条件，「因为正确的原因拒绝」才是。**
>
> 红队实测的四种状态：`named`（拒了，且该条攻击要检验的判断真开火，消息里能读出事由）、
> `half`（开火但细节缺，读者没法行动）、`masked`（**拒了，但因为别的原因**——攻击从未被检验，
> 闸看起来在工作，比 `leaked` 更危险）、`leaked`（READY）。验收线是 **9/9 named，masked 0，half 0，leaked 0**。
> 「改夹具让它变绿」等于把攻击藏起来：夹具是常量、闸是变量，每次运行前由 `build-fixtures.mjs` 用
> 当前审计上下文重建（A8 伪自证块因此只能靠闸自己重算 corpusId/auditId/fidelity 来关）。

闸不只读散文：它解析报告末尾 ```json audit-report 块，并**自己重算**再比对。

**语料层只有一个写者，闸只认当前层**：`all.mjs` 每次运行写自己的层并在结束时原子更新指针
`<sim root>/current-layer.json`（内容 `{"dir","corpusId","auditId","generatedAt","pid","at"}`，`.tmp` + 同目录 `rename`）；
闸读报告点名的 `corpus.dir` 与指针的 `dir`，两者不同 ⇒ `AUDIT_CORPUS_NOT_CURRENT`，指针缺失 ⇒ `AUDIT_CORPUS_UNMEASURED`。
**可以诚实地声明旧层，但旧层不是当前层，放行闸只认当前层。**
台账里若有 proof 本身要跑 `scripts/sim/audit/all.mjs`，闸给它一个临时 `VMU_SIM_ROOT`——关掉一条台账行不能顺便把指针挪走，
否则「报告点名的层」会因为记账动作而不再是当前层。

| code | 何时出现（今天真会开火的情形） |
|---|---|
| `AUDIT_UNVERIFIABLE` | 报告里没有可解析的 audit-report 块（手打 12 行报告就是这一类） |
| `AUDIT_TREE_UNMEASURED` / `AUDIT_TREE_CHANGED` | 块里的 treeHash 算不出来 / 与当前工作树（逐文件 blob）不符 |
| `AUDIT_CORPUS_UNMEASURED` / `AUDIT_CORPUS_STALE` | 报告点名的层读不到（或 `corpusFiles` 清单缺失）／层重读后 sha 与清单不符、层里有多余语料目录，或 `generatedAt` 早于层内语料最新 mtime |
| `AUDIT_CORPUS_NOT_CURRENT` | 报告自洽地描述了一个**旧层**，而 `<sim root>/current-layer.json` 指向新层：可以诚实地声明旧层，但旧层不是当前层 |
| `AUDIT_ID_MISMATCH` | `auditId` 不等于 `deriveAuditId(corpusId, treeHash)`（伪自证块在此关掉） |
| `AUDIT_CHECKS_ABSENT` / `AUDIT_VERDICT_CONTRADICTION` | 块里没有 checks / 散文 PASS 与块内 verdict+failures 矛盾 |
| `AUDIT_FIDELITY_RECOMPUTE_UNMEASURED` / `AUDIT_FIDELITY_MISMATCH` | 闸没能重算 fidelity / 重算出的 liveToolsWithFieldList、compared、gaps 与块不符 |
| `AUDIT_FIDELITY_MEASURED_NOTHING` / `AUDIT_FIDELITY_COUNTS_INCONSISTENT` | `compared === 0`（什么都没量）/ `compared !== liveToolsWithFieldList` |
| `AUDIT_FIDELITY_GAPS` | 块声称 `gaps > 0`：消息点名前 10 条 `tool.field`；块里 `fidelity.gapList` 缺失或短于 gaps 时，消息点名**这个缺失字段**——无名 gap 无法派活 |
| `AUDIT_EVIDENCE_MISSING` / `AUDIT_EVIDENCE_FAILED` | 台账里 fixed 的 P0/P1 没有 `proof` / 真跑 `proof.cmd` 退出码与 `expect` 不符（120 s 超时也算失败） |
| `AUDIT_P0_UNLEDGERED` | 报告点名了 P0，台账里没有对应条目（台账由 lead 写，闸只负责拒） |
| `OVERRIDE_REASON_INVALID` | override 理由 <24 个非空白字符，或与上一轮逐字相同（`release-ready-last-override.json` 记账） |
| `SIM_GATE_NOT_RUN` / `SIM_GATE_FAILED` | 门禁没现跑 / 现跑非 0 |

- 红队夹具与判据在 `D:/_tmp/gate-redteam/`（TB-2662，audit-r14 所有）：`node run-all.mjs` 会重建夹具再逐条跑，
  `exit 0` 的语义是**每一行都被判过**（named 或 neutralized-with-evidence），不是某个固定行数——夹具随 corpus-layer
  模型从 A1–A13b 扩到 A1–A16b。`tests/release-ready.test.mjs` §8 直接调它，断言「行数 ≥16、named+neutralized=行数、
  masked/leaked/half/error 全 0、每条 neutralized 带 evidence」；具体 named 数以该次运行为准，不写死。
- 实测（2026-11-10 01:5x，A13b/A16 指针判据落地后）：`22 rows: 20 named, 2 neutralized (A8b, A6-blank), 0 masked, 0 half, 0 leaked`、exit 0。
- R8 的 exit 语义用真用例钉住：往 baseline 注入一条不成立的声明 ⇒ `audit/all` 正文 p0 非空 ⇒ **exit 1**
  （`tests/sim-fidelity-baseline.test.mjs` §7 同时断言 `checks.failures === p0.length`）。
