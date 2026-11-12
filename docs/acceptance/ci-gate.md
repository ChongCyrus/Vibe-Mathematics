# CI 分片门禁（RUN 79 / TB-2738 / TB-2748）

状态：**四 job 已全部接线（static + partition + suite×8 + union）；第一次真机 push（run 43084472078）已经发生，八片全红——这次红是门禁自己抓到过的，不是门禁坏了。**

判据：`tests/ci-exclusions.test.mjs`（门禁自身的承诺）与 `tests/ci-exclusions-honest.test.mjs`（每条排除项真的跑不起来）。

## 1. 这份门禁证明什么，不证明什么

> CI 绿只证明另一台干净机器也能绿；可发布仍只由本地 `release-ready.mjs` + 真机前置决定

这句话是**判据输入**，不是说明文字：`tests/ci-exclusions.test.mjs` §3 断言的正是上面这一行逐字存在。原因不是洁癖——我们踩过「文档也是判据输入」的坑：如果这句话从文档里消失，而 CI 的绿勾仍在，下一个读者会把「CI 绿」读成「可以发布」，而那两件事之间隔着真机、真模型、真实耗时和本地 `release-ready.mjs` 的前置条件。

具体的分工：

| 问题 | 谁来回答 | CI 能不能回答 |
| --- | --- | --- |
| 干净 clone 上，静态门禁与测试套件能不能绿？ | 本 workflow 的 `static` / `partition` / `suite` | **能**，这是它唯一的主张 |
| 分片拆开后，有没有作业一行都没跑？ | `union`（Σ 各片 selected == plan 的 post-exclusion 总数） | 能，且不等即红并列每片数字 |
| 这台机器是否可发布？ | 本地 `scripts/sim/audit/release-ready.mjs` + 真机前置（真模型、真耗时、真语料） | **不能** |
| 那十三条被排除的机器属性量得对不对？ | 本机（`localGuard` 列出的命令），不是托管 runner | **不能**，所以被排除 |

## 2. 四个 job 与依赖

```
static ──► partition ──► suite(1..8, matrix) ──► union
```

- `static`：五条便宜且各自抓过不同类错误的本机门禁（`preflight`、`check-docs`、`check-rules-coverage --check`、`check-rule-parity`、`audit-prompt-budget --check`）。失败即红，没有任何 `continue-on-error`。
- `partition`：`node scripts/ci/shard-plan.mjs --check`，把计划写进 `$RUNNER_TEMP/shard-plan.json`，再用 `node scripts/ci/union-verify.mjs write-meta` 把它**封到本次 run**（run_id + attempt + plan 的 sha256），然后上传 **`shard-plan-<run_id>-<attempt>`**。**计划里的作业清单只能来自 runner**（见 §4），脚本不复制第二份文件列表。`set -o pipefail`：红了却被 `tee` 吞成 0，partition job 存在的意义就归零；artifact 上传步骤因此只在 plan 绿时发生，不会留下「红计划的绿 artifact」。
- `suite`：8 片 matrix，`node tests/run-tests.mjs --shard ${{ matrix.shard }}/8 --json --no-temp-hygiene $EXCLUDES`，其中 `$EXCLUDES` **由 `ci-exclusions.json` 派生**（`require` 表再拼 `--exclude <label>`），不是第二份手写清单。`--json` 重定向成 `$RUNNER_TEMP/shard-report.json`（artifact 本体），人类日志进 `$RUNNER_TEMP/shard-log.txt`；步骤退出码就是 runner 的退出码。每片下载本次 plan，再用 `write-meta` 产出 `shard-meta.json`（同一 plan sha256），一起上传为 **`suite-<run_id>-<attempt>-<i>`**；`if: always()` 保证崩掉的片也上传「它怎么崩的」，union 不必靠 artifact 缺席来推断。
- `union`：`needs: suite` 且 `if: always()`（某片红了也要说清是哪片、差多少）。下载 pattern `*-<run_id>-<attempt>*`（上次的 artifact 名字对不上，根本不会被下载），然后 `node scripts/ci/union-verify.mjs --dir "$RUNNER_TEMP/ci-artifacts" --expected-run … --expected-attempt …`，六条断言见 §4；证明 tee 到 `$RUNNER_TEMP/union-summary.json` 存档，`pipefail` 保证 job 仍红。
- `GATE_RELEASE=1` 只在 `workflow_dispatch` 且 `full_release=true` 时设置；普通 push 不会静默跑 release sweep（更慢，且结果含义不同）。

`workflow` 的三条规矩（每条都对应一次真实的失败）：不写 `continue-on-error`（可失败即等于可忽略）；`uses` 固定主版本 tag，不用 `@latest`（静默升级会改变门禁本身）；`permissions: contents: read`（门禁没有写仓库的业务）。

### 生成物为什么全部落在 `$RUNNER_TEMP`（TB-2748）

第一次真机 run 里 `repo-hygiene.test.mjs` 红了，红的是 `H2 0 字节普通文件（untracked） "shard-report.json" 0 B`——这个文件不是产品留下的，是**我们自己 workflow 的 shell 重定向**落在 checkout 根目录、并且 `suite` 片里正好同时跑着 repo-hygiene。一个因为门禁自己乱丢垃圾而红的 CI，教所有人「红不用看」。现在 `shard-plan.json`、`meta.json`、`shard-report.json`、`shard-log.txt`、`shard-meta.json`、`union-summary.json` 与下载目录都在 runner 的临时目录里，按绝对路径上传；`suite` job 还导出一个**空的**可写 `VMU_CORPUS_ROOT`，让「需要临时根来**建**语料」的套件（如 `sim-scenario-contracts`）不再去 `mkdir <盘根>/_tmp/sim`（那正是它在 CI 上 `EACCES` 的原因）。

## 3. 排除表：CI 上跑不起来的判据（而不是「关掉坏的」）

`ci-exclusions.json` 的每一行必须同时回答四个问题：`label`（哪个作业，恰好一个）、`kind`（哪一类机器属性——`machine-budget` / `local-corpus` / `host-install` / `out-of-repo-fixture`）、`why`（≥24 字，它量的是**机器属性**而不是产品正确性）、`localGuard`（本机谁还在跑它），外加 `missing`（具体缺什么）。少任何一个，排除就是删除断言。

机器判据（`shard-plan.mjs`，`--check` 即红）：

- `kind` 是闭集（`EXCLUSION-KIND`）；`machine-budget` 必须在**人工复核过**的 `MACHINE_ALLOWLIST` 里（`MACHINE-BUDGET-UNLISTED`）——「在我机器上慢」不是套件的属性；
- 依赖类（`local-corpus` / `host-install` / `out-of-repo-fixture`）必须在**套件自己的源码**里找到对应证据（`corpus`/`VMU_CORPUS`/`real-fieldset`、`dsh`/`DSH_`、`taskbooks`），否则 `EXCLUSION-NOT-EVIDENCED`——一个纯逻辑套件穿上依赖外衣就会被拦下。

| label | kind | 缺什么（托管 runner 没有） | 本机谁还在跑它 |
| --- | --- | --- | --- |
| `sim-gate.test.mjs` | machine-budget | 本机测得的 meeting-matrix 分段成本预算（总量上限 150000 ms） | `node tests/sim-gate.test.mjs`；发布机上的 `release-ready.mjs` |
| `audit-math-computation-sensitivity.mjs` | machine-budget | 本机 CPU 上实测的浮点灵敏度阈值 | `node tests/audit-math-computation-sensitivity.mjs`；`release-ready.mjs` |
| `mutation-evidence.test.mjs` | machine-budget | 整树复制 + 数分钟真实变异 + 本机 tmpdir 布局 | `GATE_RELEASE=1 node tests/run-tests.mjs`；`release-ready.mjs` |
| `audit-prompt-names.mjs` | local-corpus | 本机真会话采集的 `D:/_tmp/sim/real-fieldset.json` | `node scripts/sim/harvest/real.mjs` 后跑它；`release-ready.mjs` 同一语料 |
| `vmu-run240-fidelity-scope.test.mjs` | local-corpus | `D:/_tmp/sim` 下的真回执语料（`real-fieldset.json`、`real-receipts.jsonl`） | 发布机（`node scripts/sim/run.mjs --scenario end-to-end --out D:/_tmp/sim`） |
| `sim-compare-strict.test.mjs` | local-corpus | `compare/real-fields.jsonl` + `real-receipts.jsonl` | `node scripts/sim/compare/run.mjs --harvest` 后跑它 |
| `sim-fidelity-baseline.test.mjs` | local-corpus | rich live 语料 `VMU_RICH_REAL`（`compare/real-fields.jsonl`） | 发布机；判据自己的话「the rich live corpus is the only ruler here」 |
| `sim-vs-real.test.mjs` | local-corpus | 同上 rich live 语料 | `node scripts/sim/compare/run.mjs --harvest` 后跑它 |
| `audit-corpus-nested-keys.test.mjs` | local-corpus | 本机采集的 fieldset 与本机 DSH 会话根 | `node scripts/sim/harvest/real.mjs` 后跑它（`VMU_SIM_ROOT`） |
| `vmu-assistant-host-slice.test.mjs` | host-install | 装在 PATH 上的 `dsh` 与随包宿主模板 | 发布机（真机装 DSH 的地方） |
| `e2e-f1-agent-detach.test.mjs` | host-install | 已安装的 DSH 宿主包（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-agent`） | 发布机（`DSH_NODE_MODULES` 指向安装处） |
| `brief-claims-match-product.test.mjs` | out-of-repo-fixture | `../taskbooks/RUN-BRIEF-TEMPLATE.md`（按工作区约定在仓库外） | 工作区检出（或 `VMU_BRIEF_TEMPLATE_PATH`） |
| `run79-brief-corrections.test.mjs` | out-of-repo-fixture | 同上模板 | 工作区检出（或 `VMU_BRIEF_TEMPLATE_PATH`） |

两条**没有**被排除的红，及其定性：

- `repo-hygiene.test.mjs`：不是机器属性，是 §2 里门禁自己的 litter 缺陷——已修 workflow，不排除（干净 clone 19/0；在克隆根放 0 字节 `shard-report.json` 复现 17/2，与 CI 逐字一致）。
- `release-ready.test.mjs`：本地干净 clone **180/0**，CI 红在 in-repo red team 的 `A16b` 被判 `masked`。根因是 `scripts/sim/redteam/run.mjs` 的 `copyCorpus()` 用 `fs.cpSync`：Windows 复制保留源 mtime，POSIX 复制把 mtime 设为现在；A16b 在 28 秒运行的后段才复制语料，于是 receipt mtime 晚于 `ctx.generatedAt`，`AUDIT_CORPUS_STALE` 与期望的 `AUDIT_CORPUS_NOT_CURRENT` 叠加。把副本 mtime 压到 now+600s 后，本地复现 `masked` + 两个码 + 逐字同一句 why。**这是夹具跨平台缺陷，不是环境依赖、不是产品缺陷，不排除；交 rec-a 修 `copyCorpus()`（复制后统一 `utimes` 到 `ctx.generatedAt` 之前的固定时刻）。**

## 4. 分片算术与 union 等式（为什么脚本可以算，却不可以抄列表）

作业清单的唯一权威是 `tests/run-tests.mjs` 的 `deriveJobs()`。任何第二个副本都会漂移：改一个 suite 名，门禁继续跑旧名字，或者一行都不跑——两种都会显示绿色。所以 `shard-plan.mjs` 只做三件事：问 runner 全量有多少作业、问每条排除标签是否仍然**选中恰好一个**作业、问排除后剩多少。然后按 TB-2737 的切点算每片大小：切点在 scope + `--only`/`--exclude` 之后、`lptOrder()` 之前，基准序为 `label` 升序，按 `k % N === i-1` 切片，因此

```
count(i) = floor((expected - i) / N) + 1      (1-based i；expected < i 时为 0)
Σ count(i) == expected
```

本轮实测（数字会随 runner 变化——本轮已从 884 长到 889，因为新判据还在加套件；这正是为什么它必须**现算**而不是写死）：`full=889`、`excluded=13`、`expected=876`，八片为四片 `110`、四片 `109`，`Σ=876`。**本文的计数是 `node tests/run-tests.mjs --counts` 的派生值，随测试增删而变，以该命令为准。**

**STALE-EXCLUSION 为什么是错误而不是警告**：`--exclude` 是子串过滤，一个匹配不到任何作业的标签「什么都没排除」，却看起来像一次深思熟虑的决定——门禁被静默放宽，或者被改名的 suite 让另一个作业顶上了它的位置。只有 runner 能回答「这个标签还选中作业吗」，所以计划必须问它。

### union 的六条断言（`scripts/ci/union-verify.mjs`）

算术本身只有一句话：Σ 各片 selected == plan.sums.shards == plan.expected。但这句话有六种撒谎方式，所以逐条钉死：

1. **artifact 属于本次**：plan 与 8 片都在，名字里的 `run_id`/`attempt` 与本次相同，每片 meta 的 `planSha256` 与 plan artifact 的 sha256 相同。旧 run 的绿色分片绝不能加进今天的门（`RUN-MISMATCH` / `PLAN-HASH-MISMATCH` / `MISSING-SHARD`）。
2. **每片数对得上自己的计划行**：`reported_selected(i) === plan.shards[i-1].count`，且 `reported_total === plan.expected`（`SHARD-SELECTED-MISMATCH` / `SHARD-TOTAL-MISMATCH`）——后者抓的是「这一片用了别的过滤条件」。
3. **三个数必须相等**：Σ selected、`plan.sums.shards`、`plan.expected`；不等时三个数一起打印（`UNION-SUM-MISMATCH`），否则「union mismatch」不告诉读者洞有多大。
4. **每片 FAIL 0**（`SHARD-RED`）：算得对的红片，是对一个坏门禁做的算术。
5. **被排除的十三条不在任何一片的作业清单里**（集合断言，`EXCLUSION-PRESENT`）：用计数会漏掉「同一条被排作业在两片里各跑一次、另一条一次没跑」。
6. **八片的作业清单互不重叠、并集恰好 `expected` 条**（`DUPLICATE-JOB` / `UNION-SET-MISMATCH`）：这才是「每个作业恰好跑一次」的证明；再配合 report 里 `runs` 条数 == `selected`（`SHARD-REPORT-TRUNCATED`），被截断的报告也不能冒充完整。

**HEAD 是三态而不是两态（TB-2748）**：`HEAD-UNSEALED` = plan artifact 没有 headSha（上游 seal 步骤没跑/没带 `HEAD_SHA`，这是上游缺口），`HEAD-UNKNOWN` = 本 union job 没有 `HEAD_SHA`（对不了树），`HEAD-MISMATCH` = 两个具名树不同（真的拿错了树）。把「没封」折进 `HEAD-MISMATCH`，会让读者去找错树，而真正原因是上游没跑。

## 5. 失败语义（每个码都指向一种「看起来绿其实没验」）

| 码 | 含义 | 为什么必须红 |
| --- | --- | --- |
| `STALE-EXCLUSION` | 排除标签在 runner 里选中 0 个作业 | 排除不存在的东西会静默放宽门禁 |
| `EXCLUSION-KIND` | 行没有四类机器属性之一 | 没写理由的排除就是被消音的断言 |
| `MACHINE-BUDGET-UNLISTED` | 新增 `machine-budget` 行不在复核名单里 | 「我这慢」不是套件的属性 |
| `EXCLUSION-NOT-EVIDENCED` | 依赖类行的套件源码从不提该依赖 | 纯逻辑套件穿着依赖外衣消失 |
| `WHY-TOO-SHORT` | `why` 不足 24 字 | 读者无法把它与「坏掉的套件被消音」区分开 |
| `GUARD-EMPTY` | `localGuard` 为空 | 没有本机读者的排除 = 删除断言 |
| `PLAN-SUM-MISMATCH` | Σ 片大小 != post-exclusion 总数 | 有作业一片都不在，静默漏跑 |
| `SHARD-EMPTY` | 某片 0 个作业 | 空片报绿，什么也没验 |
| `NO-JOBS` | 排除后 0 个作业 | 门禁靠「什么都不跑」通过 |
| `RUNNER-UNAVAILABLE` | runner 起不来/输出不是 JSON | 这是 CI 的瞬时故障，exit 2，不是产品红 |
| `MISSING-SHARD` | 8 片里有片缺席 | 少一片的和仍是数字，但不能是绿色数字 |
| `RUN-MISMATCH` | artifact 的 run_id/attempt 与本次不符 | 旧 run 的绿片不是关于这棵树的证据 |
| `PLAN-HASH-MISMATCH` | 某片 seal 的 plan sha256 与 plan artifact 不符 | 该片规划的是另一棵树/另一份计划 |
| `SHARD-SELECTED-MISMATCH` | 某片 selected != plan 给它的数 | 该片用了别的过滤条件（或分片切点变了） |
| `SHARD-TOTAL-MISMATCH` | 某片 post-exclusion total != plan.expected | 同上，且是从另一头看同一件事 |
| `SHARD-RED` | 某片 fail > 0 | 对红片做算术不是门禁 |
| `SHARD-REPORT-TRUNCATED` | report 的 runs 条数 != selected | 截断的报告不能冒充完整作业清单 |
| `UNION-SUM-MISMATCH` | Σ selected、plan.sums.shards、plan.expected 三数不等 | 有作业一片都不在（或重复计入） |
| `EXCLUSION-PRESENT` | 被排除的 label 出现在某片作业清单 | 不该跑的东西跑了两遍，排除已失效 |
| `DUPLICATE-JOB` / `UNION-SET-MISMATCH` | 作业清单重叠 / 并集 != expected | 分片不是划分，或作业被漏掉 |
| `HEAD-UNSEALED` | plan artifact 没有 headSha | 上游 seal 没跑：它证明了一个和，不是一棵树 |
| `HEAD-UNKNOWN` | 本 job 没有 `HEAD_SHA` | 连自己的树都说不出的 union 无法背书 |
| `HEAD-MISMATCH` | plan 封的 head 与本次不同 | union 覆盖的是另一棵树 |

## 6. 第一次真跑记录（诚实版本）

**run 43084472078（8 片；当轮 881 个作业，本轮派生口径 889——见 §4）八片全红，43 个不同文件。** 这次红的分类（只列与门禁相关的；产品/其它车道的红不在此文档）：

| 类 | 文件 | 处理 |
| --- | --- | --- |
| 机器属性（语料） | 6 条语料套件 + `audit-corpus-nested-keys` | 列入 `local-corpus`，由 honest 判据证明缺席即红且点名 |
| 机器属性（宿主） | `vmu-assistant-host-slice`（`dsh` 127）、`e2e-f1-agent-detach` | 列入 `host-install` |
| 仓外 fixture | `brief-claims-match-product`、`run79-brief-corrections` | 列入 `out-of-repo-fixture` |
| 门禁自身 litter | `repo-hygiene`（`shard-report.json` 0 B） | **修 workflow**，不排除 |
| 夹具跨平台缺陷 | `release-ready`（red team `A16b` masked） | **交 rec-a**，不排除 |
| 环境可修 | `sim-scenario-contracts`（`EACCES mkdir '/_tmp/sim'`） | **修 workflow**（空 `VMU_CORPUS_ROOT`），不排除 |
| 旁路 portable-path（sim-lane） | `sim-expected-refusals` audit 的 `A5 CONTRACT_UNREADABLE`（`receipts.mjs:133` 硬编码作者机路径）、`audit-corpus-nested-keys` harvest 的 `real.mjs:50` 硬编码 `D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu` | 在报告里交 sim-lane，本轮不排除（不是环境属性，是代码里写死的路径） |

> 第一次真机 push 前必须先把派生计数刷到 `--check` 无变化；CI 的第一次红必须是**产品/判据事实**，不许是收口记账号。一条因为「我们自己的派生文档过期」而红的 CI，会训练所有人忽略红。

这不是流程洁癖，而是**门禁的信噪比**：`docs/test-timing.md`、`AUDIT-CHECKLIST.md`、README 里的计数是由 `update-doc-counts` 派生出来的记账，一次 push 就变；如果 CI 第一次红是因为我们自己的生成物过期，它教的正是「红不用看」。所以：

- push 之前：`node scripts/update-doc-counts.mjs --write`，再 `--check` 必须 `files changed=0`；
- 若第一次真跑红了：红的原因必须能落在一条**产品事实或判据事实**上（例如某个 suite 真的红了、union 数真的不等），不许是「`package.json#files` 少登记一个测试」这类收口记账——后者在本地 `registry` 阶段就该修掉。

## 7. 本机怎么验这份门禁（不用等 GitHub）

```bash
node scripts/ci/shard-plan.mjs --check          # 计划内部一致（Σ==expected、无空片、无 STALE、每条排除都被源码证据支持）
node tests/ci-exclusions.test.mjs               # 门禁承诺（含组内反关灯与 union 算术本地演练，约 2 分钟）
node tests/ci-exclusions-honest.test.mjs        # 每条排除项真的跑不起来（缺席模拟 + 纯逻辑反证，约 2 分钟）
node scripts/preflight.mjs                      # static 第一条（本机约 93 s，CI job 给了 10 分钟）
node scripts/check-docs.mjs
node scripts/check-rules-coverage.mjs --check
node scripts/check-rule-parity.mjs              # 注意：没有 --check 参数，运行它就是检查
node scripts/audit-prompt-budget.mjs --check
```

union 的本地演练不需要 GitHub：判据 §6 会用**真的** `shard-plan --check` 产出 plan、用 runner 自己的 `--shard-plan` 问出每片选中的作业、合成 workflow 会上传的 8 份 artifact，然后跑 `union-verify` 一次绿、六种红（缺片 / 红片 / 被排除标签混入 / 旧 run 的 meta / 另一个 head / 参数被丢），外加 HEAD 三态（未封 / 未知 / 不符）各自的具名码。单跑这一段的读数是 `=== CI EXCLUSIONS: … ===` 末行。

也可以手工复算一次（不依赖任何 CI 产物）：

```bash
node scripts/ci/shard-plan.mjs --check | tee /tmp/plan.json
# 逐片问 runner 自己选了什么，与 plan.shards[i-1].count 对照；排除项从表里取，不要手抄：
EXCLUDES=$(node -e "const rows = require('./ci-exclusions.json'); process.stdout.write(rows.map((row) => '--exclude ' + row.label).join(' '))")
for i in 1 2 3 4 5 6 7 8; do
  node tests/run-tests.mjs --shard-plan --shard "$i/8" --no-temp-hygiene $EXCLUDES
done
```

本机实测五条静态门禁合计约 97 秒（`preflight` 93 秒是大头；CI 的 `timeout-minutes` 因此给 10 分钟）。

## 8. YAML 怎么自证

本机 **没有** Python 的 `yaml` 模块（`ModuleNotFoundError: No module named yaml`），仓库又是零依赖。所以本地自证分两层：

- 结构层：`tests/ci-exclusions.test.mjs` §4 直接读 `gate.yml` 文本断言关键契约——`permissions: contents: read` 存在、全文无 `continue-on-error`、所有 `uses:` 都落在 `@v4`、四 job 与 `needs:` 关系存在、`--shard i/8` 存在、`--exclude` **由表派生**（不再有手抄的三条）、生成物写入 `$RUNNER_TEMP`、`union-verify write-meta`、artifact 名含 `run_id`/`attempt`、无 `|| true`、`GATE_RELEASE` 只在 dispatch；
- 解析层：GitHub 自己在 push 时解析 YAML。若本地需要更硬的解析，用一次性工具（不写进依赖）：`npx --yes js-yaml .github/workflows/gate.yml > /dev/null`。

两层都不做「生成一份 YAML 再声称它是真的」：那只是把同一个错误抄了两遍。
