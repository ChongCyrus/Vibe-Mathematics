# CI 分片门禁（RUN 79 / TB-2738）

状态：**四 job 已全部接线（static + partition + suite×8 + union），等第一次真机 push**。
判据：`tests/ci-exclusions.test.mjs`（含组内反关灯与 union 算术本地演练）。

## 1. 这份门禁证明什么，不证明什么

> CI 绿只证明另一台干净机器也能绿；可发布仍只由本地 `release-ready.mjs` + 真机前置决定

这句话是**判据输入**，不是说明文字：`tests/ci-exclusions.test.mjs` §3 断言的正是上面这一行逐字存在。原因不是洁癖——我们踩过「文档也是判据输入」的坑：如果这句话从文档里消失，而 CI 的绿勾仍在，下一个读者会把「CI 绿」读成「可以发布」，而那两件事之间隔着真机、真模型、真实耗时和本地 `release-ready.mjs` 的前置条件。

具体的分工：

| 问题 | 谁来回答 | CI 能不能回答 |
| --- | --- | --- |
| 干净 clone 上，静态门禁与测试套件能不能绿？ | 本 workflow 的 `static` / `partition` / `suite` | **能**，这是它唯一的主张 |
| 分片拆开后，有没有作业一行都没跑？ | `union`（Σ 各片 selected == plan 的 post-exclusion 总数） | 能，且不等即红并列每片数字 |
| 这台机器是否可发布？ | 本地 `scripts/sim/audit/release-ready.mjs` + 真机前置（真模型、真耗时、真语料） | **不能** |
| 那三条被排除的机器属性量得对不对？ | 本机（`localGuard` 列出的命令），不是托管 runner | **不能**，所以被排除 |

## 2. 四个 job 与依赖

```
static ──► partition ──► suite(1..8, matrix) ──► union
```

- `static`：五条便宜且各自抓过不同类错误的本机门禁（`preflight`、`check-docs`、`check-rules-coverage --check`、`check-rule-parity`、`audit-prompt-budget --check`）。失败即红，没有任何 `continue-on-error`。
- `partition`：`node scripts/ci/shard-plan.mjs --check`，把计划写成 `shard-plan.json`，再用 `node scripts/ci/union-verify.mjs write-meta` 把它**封到本次 run**（run_id + attempt + plan 的 sha256），然后上传 **`shard-plan-<run_id>-<attempt>`**。**计划里的作业清单只能来自 runner**（见 §4），脚本不复制第二份文件列表。`set -o pipefail`：红了却被 `tee` 吞成 0，partition job 存在的意义就归零；artifact 上传步骤因此只在 plan 绿时发生，不会留下「红计划的绿 artifact」。
- `suite`：8 片 matrix，`node tests/run-tests.mjs --shard ${{ matrix.shard }}/8 --json --no-temp-hygiene --exclude <三条>`。`--json` 重定向成 `shard-report.json`（artifact 本体），人类日志进 `shard-log.txt`；步骤退出码就是 runner 的退出码。每片下载本次 plan，再用 `write-meta` 产出 `shard-meta.json`（同一 plan sha256），一起上传为 **`suite-<run_id>-<attempt>-<i>`**；`if: always()` 保证崩掉的片也上传「它怎么崩的」，union 不必靠 artifact 缺席来推断。
- `union`：`needs: suite` 且 `if: always()`（某片红了也要说清是哪片、差多少）。下载 pattern `*-<run_id>-<attempt>*`（上次的 artifact 名字对不上，根本不会被下载），然后 `node scripts/ci/union-verify.mjs --dir artifacts --expected-run … --expected-attempt …`，六条断言见 §4；证明 tee 到 `union-summary.json` 存档，`pipefail` 保证 job 仍红。
- `GATE_RELEASE=1` 只在 `workflow_dispatch` 且 `full_release=true` 时设置；普通 push 不会静默跑 release sweep（更慢，且结果含义不同）。

`workflow` 的三条规矩（每条都对应一次真实的失败）：不写 `continue-on-error`（可失败即等于可忽略）；`uses` 固定主版本 tag，不用 `@latest`（静默升级会改变门禁本身）；`permissions: contents: read`（门禁没有写仓库的业务）。

## 3. 排除表：为什么这三条不上 CI，而不是「关掉三条坏的」

`ci-exclusions.json` 的每一行都必须同时回答三个问题：`label`（哪个作业）、`why`（≥24 字，它量的是**机器属性**而不是产品正确性）、`localGuard`（本机谁还在跑它）。少任何一个，排除就是删除断言。

| label | 它量什么（机器属性） | 本机谁还在跑它 |
| --- | --- | --- |
| `sim-gate.test.mjs` | 含 meeting-matrix 的墙钟预算（14000 ms），量的是机器速度与负载 | `node tests/sim-gate.test.mjs`；发布机上的 `scripts/sim/audit/release-ready.mjs` |
| `audit-math-computation-sensitivity.mjs` | 阈值来自本机 CPU 上的实测浮点灵敏度，换机器数字就变 | `node tests/audit-math-computation-sensitivity.mjs`；`release-ready.mjs` 在发布机上拒绝回归 |
| `mutation-evidence.test.mjs` | 会整树复制并跑真实变异，耗时与 tmpdir 布局都是机器属性 | `GATE_RELEASE=1 node tests/run-tests.mjs`（release sweep 绕过变异缓存）；`release-ready.mjs` |

三条的必要性由判据钉死：缺少任意一条、`why` 短于 24 字、`localGuard` 为空，`tests/ci-exclusions.test.mjs` 与 `shard-plan --check` 都会红。

## 4. 分片算术与 union 等式（为什么脚本可以算，却不可以抄列表）

作业清单的唯一权威是 `tests/run-tests.mjs` 的 `deriveJobs()`。任何第二个副本都会漂移：改一个 suite 名，门禁继续跑旧名字，或者一行都不跑——两种都会显示绿色。所以 `shard-plan.mjs` 只做三件事：问 runner 全量有多少作业、问每条排除标签是否仍然**选中至少一个**作业、问排除后剩多少。然后按 TB-2737 的切点算每片大小：切点在 scope + `--only`/`--exclude` 之后、`lptOrder()` 之前，基准序为 `label` 升序，按 `k % N === i-1` 切片，因此

```
count(i) = floor((expected - i) / N) + 1      (1-based i；expected < i 时为 0)
Σ count(i) == expected
```

RUN 79 首次实测的快照（数字会随 runner 变化——当天就从 870 长到 871，因为别的车道还在加套件；这正是为什么它必须**现算**而不是写死）：`full=871`、`excluded=3`、`expected=868`，八片为 `109,109,109,109,108,108,108,108`，`Σ=868`。

**STALE-EXCLUSION 为什么是错误而不是警告**：`--exclude` 是子串过滤，一个匹配不到任何作业的标签「什么都没排除」，却看起来像一次深思熟虑的决定——门禁被静默放宽，或者被改名的 suite 让另一个作业顶上了它的位置。只有 runner 能回答「这个标签还选中作业吗」，所以计划必须问它。

### union 的六条断言（`scripts/ci/union-verify.mjs`）

算术本身只有一句话：Σ 各片 selected == plan.sums.shards == plan.expected。但这句话有六种撒谎方式，所以逐条钉死：

1. **artifact 属于本次**：plan 与 8 片都在，名字里的 `run_id`/`attempt` 与本次相同，每片 meta 的 `planSha256` 与 plan artifact 的 sha256 相同。旧 run 的绿色分片绝不能加进今天的门（`RUN-MISMATCH` / `PLAN-HASH-MISMATCH` / `MISSING-SHARD`）。
2. **每片数对得上自己的计划行**：`reported_selected(i) === plan.shards[i-1].count`，且 `reported_total === plan.expected`（`SHARD-SELECTED-MISMATCH` / `SHARD-TOTAL-MISMATCH`）——后者抓的是「这一片用了别的过滤条件」。
3. **三个数必须相等**：Σ selected、`plan.sums.shards`、`plan.expected`；不等时三个数一起打印（`UNION-SUM-MISMATCH`），否则「union mismatch」不告诉读者洞有多大。
4. **每片 FAIL 0**（`SHARD-RED`）：算得对的红片，是对一个坏门禁做的算术。
5. **被排除的三条不在任何一片的作业清单里**（集合断言，`EXCLUSION-PRESENT`）：用计数会漏掉「同一条被排作业在两片里各跑一次、另一条一次没跑」。
6. **八片的作业清单互不重叠、并集恰好 `expected` 条**（`DUPLICATE-JOB` / `UNION-SET-MISMATCH`）：这才是「每个作业恰好跑一次」的证明；再配合 report 里 `runs` 条数 == `selected`（`SHARD-REPORT-TRUNCATED`），被截断的报告也不能冒充完整。

## 5. 失败语义（每个码都指向一种「看起来绿其实没验」）

| 码 | 含义 | 为什么必须红 |
| --- | --- | --- |
| `STALE-EXCLUSION` | 排除标签在 runner 里选中 0 个作业 | 排除不存在的东西会静默放宽门禁 |
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

## 6. 第一次真跑记录（诚实版本）

**GitHub Actions 尚未真跑过。** 四 job 已全部接线，`--shard` 已由 TB-2737 落地，本地演练（真 plan + runner 真选片 + union-verify）已绿。所以第一次真正的 CI 绿勾到来时，它的证据等级是「另一台机器解析了 YAML、跑通了五条静态门禁、按计划跑完了 8 片、union 算出三个相等的数」——**仍然不是**「可以发布」。

### 第一次真机 push 之前必须满足的判据

> 第一次真机 push 前必须先把派生计数刷到 `--check` 无变化；CI 的第一次红必须是**产品/判据事实**，不许是收口记账号。一条因为「我们自己的派生文档过期」而红的 CI，会训练所有人忽略红。

这不是流程洁癖，而是**门禁的信噪比**：`docs/test-timing.md`、`AUDIT-CHECKLIST.md`、README 里的计数是由 `update-doc-counts` 派生出来的记账，一次 push 就变；如果 CI 第一次红是因为我们自己的生成物过期，它教的正是「红不用看」。所以：

- push 之前：`node scripts/update-doc-counts.mjs --write`，再 `--check` 必须 `files changed=0`；
- 若第一次真跑红了：红的原因必须能落在一条**产品事实或判据事实**上（例如某个 suite 真的红了、union 数真的不等），不许是「`package.json#files` 少登记一个测试」这类收口记账——后者在本地 `registry` 阶段就该修掉。

什么时候补这一节的「这次抓到什么」：真 push 之后。要补的不是贴绿勾，而是回答任务书 §1.5：**这次 CI 真抓到过什么**；如果第一次是纯绿，要写清为什么纯绿也可信（例如：同一 commit 上本地有已知红、或故意构造一次红验证门禁会红）。

## 7. 本机怎么验这份门禁（不用等 GitHub）

```bash
node scripts/ci/shard-plan.mjs --check          # 计划内部一致（Σ==expected、无空片、无 STALE）
node tests/ci-exclusions.test.mjs               # 判据（含组内反关灯与 union 算术本地演练）
node scripts/preflight.mjs                      # static 第一条（本机约 93 s，CI job 给了 10 分钟）
node scripts/check-docs.mjs
node scripts/check-rules-coverage.mjs --check
node scripts/check-rule-parity.mjs              # 注意：没有 --check 参数，运行它就是检查
node scripts/audit-prompt-budget.mjs --check
```

union 的本地演练不需要 GitHub：判据 §6 会用**真的** `shard-plan --check` 产出 plan、用 runner 自己的 `--shard-plan` 问出每片选中的作业、合成 workflow 会上传的 8 份 artifact，然后跑 `union-verify` 一次绿、四种红（缺片 / 红片 / 被排除标签混入 / 旧 run 的 meta）。单跑这一段的读数是 `=== CI EXCLUSIONS: … ===` 末行。

也可以手工复算一次（不依赖任何 CI 产物）：

```bash
node scripts/ci/shard-plan.mjs --check | tee /tmp/plan.json
# 逐片问 runner 自己选了什么，与 plan.shards[i-1].count 对照：
for i in 1 2 3 4 5 6 7 8; do
  node tests/run-tests.mjs --shard-plan --shard "$i/8" --no-temp-hygiene \
    --exclude sim-gate.test.mjs \
    --exclude audit-math-computation-sensitivity.mjs \
    --exclude mutation-evidence.test.mjs
done
```

本机实测五条合计约 97 秒（`preflight` 93 秒是大头，任务书里写的「<60s」偏乐观，CI 的 `timeout-minutes` 因此给 10 分钟而不是 1 分钟）。

## 8. YAML 怎么自证

本机 **没有** Python 的 `yaml` 模块（`ModuleNotFoundError: No module named yaml`），仓库又是零依赖。所以本地自证分两层：

- 结构层：`tests/ci-exclusions.test.mjs` §4 直接读 `gate.yml` 文本断言关键契约——`permissions: contents: read` 存在、全文无 `continue-on-error`、所有 `uses:` 都落在 `@v4`、四 job 与 `needs:` 关系存在、`--shard i/8` 与三条 `--exclude`、`union-verify write-meta`、artifact 名含 `run_id`/`attempt`、无 `|| true`、`GATE_RELEASE` 只在 dispatch；
- 解析层：GitHub 自己在 push 时解析 YAML。若本地需要更硬的解析，用一次性工具（不写进依赖）：`npx --yes js-yaml .github/workflows/gate.yml > /dev/null`。

两层都不做「生成一份 YAML 再声称它是真的」：那只是把同一个错误抄了两遍。
