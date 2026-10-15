# Round 17 · `task-119` · 目标 6 收口：**真宿主跑通**（`--require-host` 的 5 条未跑断言 → **真跑且全绿**）＋ 那 1 条 failed 查清

> 负责人：`vmu-assistant2`｜交付：本报告（写范围内我**没有**改 `docs/29`／`packs/**`／`tests/**`／`scripts/**` —— 见 §7 为什么）。
> 硬约束遵守：**不跑全量**（T0/T1 归 Lead）／**不 `regen-all`**／**不 git**／临时文件全在 **`D:\_tmp`**／**凭据副本已删除并核验**（§6）／**未改 `tests/**`／`scripts/**`**。
> ★ 所有读数都写明**是哪一次运行**（本报告有 3 次运行，时间＋退出码逐一给出）。

---

## 0. 结论（一句话 + 三条）

**A 做到了**：真宿主（真 `dsh web` 实例 ＋ 真 preset ＋ 真模型）驱动的会话里，`--require-host` 那 **5 条宿主侧断言全部真跑并全绿**；**同一会话的离线复评是 `16 passed / 0 failed`，EXIT=0**。

1. **那 1 条 failed 查清了：不是环境缺件，也不是框架缺口，而是"断言读错了源"**（§3）—— 它读驱动器的 stdout/JSONL（`transcript`），而**驱动器从设计上不回声工具名**（实测该 dump 里 `vibe_vmu_report` 命中 **0 次**），紧邻两行的、读**会话日志**的同义断言**是绿的**。⇒ **构造性假阴性**，且与 R7 那条教训（"回执只在会话日志里"）**同类**。修法是 1 行且要动 `tests/**` ⇒ **按纪律先具名问 Lead**（§3.3），我**没动**。
2. **第一次真机尝试给出了一个硬读数（值得全仓知道）**：**R12 那套 provider 配方已失效** —— `dsh-opencode-go` 账号**配额耗尽**，`assistant/attempt` 收到 **HTTP 429 `GoUsageLimitError: Go usage limit exceeded`（code `QUOTA`）** ⇒ 0 token、0 工具调用（§2.2）。改用**操作者自己的当前路由 `commandcode`**（`@mars-sea/dsh-commandcode-provider`）后同一条剧本**一次跑通**。
3. **"未跑" ≠ "已验证"** 我严格遵守：本 run **证到**的是"触发器在**真指标**上真的开火、且**真的送达**"，但 **tick 是脚本提示词要求模型调的**；**"无需 tick 调用即自动开火"（自主调度）本轮未测**，已具名登记（§4.4）。

---

## 1. 三次运行（时间／命令／退出码）

| # | 时刻（+08:00） | 命令 | 结果 |
|---|---|---|---|
| 0 | **14:27:40** | `node tests/vmu-assistant-host-slice.test.mjs --require-host` | **6 passed / 1 failed / 5 not-run，EXIT=1**（复现 Lead 给的现状：那 1 failed ＝ `--require-host` 的**失败即关闭**守卫，5 条宿主断言 pending） |
| 1 | **14:31:11** | 同上 ＋ `--web-port 7819 --web-token <T1> --preset vibe-math-vmu --cwd D:\_tmp\r17-ws --dsh-home D:\_tmp\r17-home --max-tokens 400000 --timeout 400 --expect-settings … --expect-delivery --print` | **8 passed / 8 failed / 1 not-run，EXIT=1**；**0 token**；根因＝**上游 429 配额**（§2.2），**不是**发布/装配问题（见下） |
| 2 | **14:41:04** | 同上，换成 **`commandcode`** 路由（`--web-port 7820 --web-token <T2>`） | ★ **16 passed / 1 failed / 0 not-run，EXIT=1**；`durationSec:55`；tokens `in 93899 / out 4525 / cacheRead 157952`（total 256376，cap 400000 **未触**）；**6 个工具调用** |
| 2b | **14:42:39** | `node tests/vmu-assistant-host-slice.test.mjs --session session-d541f03a-ca5a-4dc4-a9ea-78c4c28fbf34 --dsh-home D:\_tmp\r17-home --expect-delivery --expect-settings …`（**离线复评**，不花会话） | ★★ **16 passed / 0 failed / 0 not-run，EXIT=0** |

**运行 2 的会话**：`session-d541f03a-ca5a-4dc4-a9ea-78c4c28fbf34`（preset `vibe-math-vmu`），会话日志
`D:\_tmp\r17-home\sessions\--D-_tmp-r17-ws--\session-d541f03a-…\session.v4.jsonl.zstd`（49 events）。

---

## 2. 怎么跑起来的（可复现的命令链）

### 2.1 剧本（与 R12 同法，但换了 provider 层）
```
① 隔离 home（**D 盘**，不碰操作者 profile）      D:\_tmp\r17-home   ← 由 R12 的 ext-home 复制，并**剔除探针插件 vmu-ext-demo**
② 装插件（复用 R12 已装好的 link）                profiles/ext：dsh-vibe-math（link 到仓库）＋ dsh-opencode-go
③ provider 层                                    D:\_tmp\r17-provider.yml（provider=commandcode）
④ 部署 overlay（声明＋transport，照 docs/29 §3）  D:\_tmp\r17-overlay.yml（5 个键）
⑤ 拷凭据（**用完即删**）                          <操作者 .credentials.yaml> → D:\_tmp\r17-home\.credentials.yaml
⑥ 起真宿主（后台）                                DSH_HOME=D:\_tmp\r17-home
                                                 dsh --profile ext --patch D:\_tmp\r17-provider.yml --patch D:\_tmp\r17-overlay.yml --port 7820 --no-open
                                                 ⇒ stdout 一行：dsh web: http://127.0.0.1:7820/?token=<T2>
⑦ 驱动器＋测试（同一条命令里由测试自己驱动）      见 §1 运行 2；`--web-token` 取自 ⑥ 那一行
⑧ 清理                                            停宿主（7819／7820 均无监听）＋**删凭据副本**（§6）
```
★ **profile 必须"干净"**：驱动器 `guardProfile()` 禁止插探针行的 profile 跑真回合（会 `REQUEST_EXTENSION`／0-token）。我因此**从复制出来的 home 里删掉了 `vmu-ext-demo`**（`dependencies` ＋ `dsh.profile.bundles` 两处），没有用 R12 那个装着探针的 home 直接跑。

### 2.2 ★ 第一次尝试为什么 0 token（**具名根因，原样回执**）
```
assistant/attempt seq=15  finish.reason = {
  kind:'error',
  failure:{ message:'dsh-opencode-go/deepseek-v4.1-flash: 429: {"type":"GoUsageLimitError",
                    "message":"Go usage limit exceeded"} [HTTP 429; response body: nonempty]',
            code:'QUOTA' } }
turn/end seq=17  reason = { kind:'error', error:{ … code:'QUOTA' } }
```
**注意这一次失败仍然产出了两条真值**（不是白跑）：
- `request/header` seq=11 记着 **`provider: dsh-opencode-go / model: deepseek-v4.1-flash`** 与 **78 个工具**（含 **52 个 `vibe_vmu_*`**）⇒ **provider 账户层确实生效、请求确实发出去了**；
- `system/message` seq=7（7243 字符）**确实带着 vmu 的框架人设**。
⇒ 失败**只**在上游配额。**这也是"R12 的 `ext12-provider.yml` 已过期"的硬证据**：操作者自己的 profile 注释就写着他们换路由的原因（"the first roster was pinned to a provider whose quota died"）。
**修法（我做的）**：照**操作者当前路由**写 `D:\_tmp\r17-provider.yml`：
```yaml
- insert:
    - id: llm-commandcode
      name: "@mars-sea/dsh-commandcode-provider"
      config: { apiKeyEnv: COMMANDCODE_API_KEY }
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config: { provider: commandcode, model: deepseek/deepseek-v4.1-flash, reasoningEffort: high }
```
并把 `@mars-sea/dsh-commandcode-provider@0.13.2`（从操作者 desktop profile 的 node_modules 复制，4.65 MB，无额外依赖）放进 scratch profile 的 `node_modules`。

### 2.3 部署声明（overlay，5 键）
`vmu.tools.faces=*`／`vmu.packs.active=['v5r']`／`vmu.report.enabled=true`／`vmu.report.minIntervalMs=0`／`vmu.report.reports=[artifacts-threshold: threshold(artifacts ≥ 5) → channel 'log']`，并注入 `deliver: (report) => console.log("[vmu-report-sink] " + …)`（**只打 overlay 行，从不打 preset 行**）。

---

## 3. 那 1 条 failed 是什么

### 3.1 现状（运行 2）
```
=== VMU ASSISTANT HOST SLICE: 16 passed, 1 failed, 0 not-run ===
FAILURES:
  - HOST: the assistant face is REACHABLE in a real session (the tool was really called)
```
对应 `tests/vmu-assistant-host-slice.test.mjs:367`：
```js
ok(/vibe_vmu_report/.test(transcript), 'HOST: the assistant face is REACHABLE in a real session (the tool was really called)')
```
`transcript = drive.stdout + drive.stderr + <out>/transcript.jsonl + summary.json`。

### 3.2 ★ 结论：**构造性假阴性（断言读错了源）**，不是环境缺件、不是框架缺口 —— 三条实测证据
1. **驱动器的 dump 里根本没有工具名**（实测）：`D:\_tmp\vmu-host-slice-1792046465049\transcript.jsonl` 里 `vibe_vmu_report` 命中 **0 次**（该文件只有 `auth/create/verify/prompt/rpc/poll/done` 这些步骤，全部 3.5 KB）。
2. **同一次会话的权威记录里它是真被调用的**（会话日志，含 seq ＋ 行号）：
   ```
   calls: [ {vibe_vmu_report, seq:16, line:18}, {vibe_vmu_report, seq:21, line:23},
            {vibe_vmu_set,    seq:26, line:28}, {vibe_vmu_status, seq:31, line:33},
            {pwsh, seq:36, line:38}, {pwsh, seq:41, line:43} ]
   results: [seq 17/22/27/32/37/42]
   ```
3. **紧邻两行、读会话日志的同义断言是绿的**：`ok(calledFaces.indexOf('vibe_vmu_report') !== -1 && sess.toolResults.length > 0, 'HOST: the report face was really CALLED and produced a tool/result')` ⇒ 即 `:367` 与它**语义重复**，只是源不同。
4. **离线复评（同一套断言、同一份日志）＝ `16 passed / 0 failed`，EXIT=0** —— 因为离线路径不执行 `:367`（它只在 live 分支里），于是**唯一的红消失了**。

⇒ 这正是 R7 那条教训的复发形态：**"回执只在会话日志里，驱动 stdout 不回声"**。当年它抓的是"三条实质断言读 stdout"，这一条是**同一面墙上剩的最后一块**。

### 3.3 修法（**1 行**）＋ 为什么我**没动**
把 `:367` 的源从 `transcript` 换成会话日志（与紧邻断言一致）：
```js
ok(sess.toolCalls.some((c) => c.name === 'vibe_vmu_report'),
  'HOST: the assistant face is REACHABLE in a real session (the tool was really called)')
```
**该文件属 `tests/**` ⇒ 我不在未经批准时改它**（task-119 写范围明确禁止）。**请 Lead 裁决**：批准我改这 1 行（改完本测试在真宿主下应为 **17 passed / 0 failed**，`--require-host` 的退出码 1→0），或指派给 `tests/**` 的属主。**我没有把这条红写成"环境不能跑"。**

---

## 4. 5 条"从未跑过"的断言 → **本次真跑，逐条给证据**

| # | 断言（原文标签） | 结果 | **本次运行的原样证据** |
|---|---|---|---|
| 1 | `HOST: at least three vmu faces were really CALLED in the session (multi-face lit)` | ✅ | `FACES CALLED: ["pwsh","vibe_vmu_report","vibe_vmu_set","vibe_vmu_status"]`（会话日志 6 个 `tool/call`，seq/行号见 §3.2） |
| 2 | `HOST: the report face was really CALLED and produced a tool/result` | ✅ | 同上 ＋ `results:[seq 17,22,27,32,37,42]` |
| 3 | `HOST: a threshold report really FIRED from a real metric (receipt shows a non-empty fired[] and drives:false)` | ✅ | `tick` 回执原文：`{"ok":true,"action":"tick",…,"declared":1,"fired":[{"name":"artifacts-threshold","trigger":"threshold","at":1792046484293,"to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","truncated":0,"delivered":true,"drives":false,"error":null,"refused":null}],"skipped":[],"delivered":1,"failures":0,"audit":{"appended":true,…},"drives":false,…}` |
| 4 | `HOST: the parameter face wrote through the kernel and disclosed its class/attribution (hot/appliesAt/ownerCheck)` | ✅ | `set` 回执原文：`{"ok":true,"key":"vmu.turn.instituteName","value":"Slice-Institute","hot":"H2","who":"office","ownerCheck":"identified","by":"office","reason":"scripted slice","requiresRestart":false,"appliesFrom":"next session (restart required)","source":"runtime",…}` |
| 5 | `HOST: the SYSTEM PROMPT channel reached the model (it answers AS the office and says it does not vote)` | ✅ | 模型自己的话：**"I am the institute office (assistant/external interface), not a member, and I don't vote."**（`assistant/message` #6；`personaOffice:true, personaNoVote:true`） |

**附带也真跑绿了（同样从未在真宿主上跑过）**：
- `HOST: the assistant face is PUBLISHED to the model` ⇒ **78 工具 / 52 个 `vibe_vmu_*` 面**（读 `request/header`，权威）；
- `HOST: the overlay DECLARATIONS reached the entry` ⇒ `settingsMerge.sources` ＝ **5 个键全部 `"config"`**、`settings.keys:6`、`settingsUnparsed:null`、`reportDeclared:"1"`；
- `HOST: EVERY key this deployment declares appears in the entry's merge self-report`；
- `HOST: the fired report was really DELIVERED through the injected transport` ⇒ `delivered:true`、`refused:null`、`delivered:1`、`failures:0`；
  ★ **独立旁证（第三方，不是驱动器）**：**宿主自己的 stdout** 打出
  `[vmu-report-sink] {"name":"artifacts-threshold","to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}`（`D:\_tmp\r17-boot2.log`）。

### 4.4 ★ 本轮**没有**建立的一条（不许写成已验证）
**"自动汇报"的自主性**：本 run 的 `tick` 是**脚本提示词点名要求模型调用**的。⇒ 本 run 证到的是
**"触发器在真指标上真的开火并真的送达"**（`fired[]` 非空 ＋ `delivered:1` ＋ 宿主 sink 一行），
**不是**"没有任何调用也会自己开火"（自主调度/时钟）。
**要证后者需要**：一次**不在提示词里点名 `report/tick`** 的会话（或在真宿主里驱动时钟跨过 `minIntervalMs`），并读回执 `fired[]`。**这一条我具名留作残项**。

---

## 5. 对齐用户原话的三条验收

| 用户原话 | 判定 | 本次运行的判据 |
|---|---|---|
| ① **自动汇报**真的发生 | **机制部分成立**（触发＋送达为真）；**自主性未证**（§4.4） | `fired[]` 非空（`artifacts=9 ≥ 5`）＋ `delivered:1/failures:0` ＋ **宿主 stdout 的 sink 行** |
| ② 主代理**真能配置参数**（`settings` 缝被主代理调用） | ✅ | `vibe_vmu_set` 回执 `ok:true / hot:"H2" / ownerCheck:"identified" / by:"office" / source:"runtime"`；且 `vibe_vmu_status` 回执里 `settingsMerge.sources` **5/5 ＝ `config`**、`keys:6`（声明真的到达入口） |
| ③ **提示词／人设真被装配**（不是"文件在仓库里"） | ✅ | `system/message` seq=7（**7252 字符**，带 vmu 框架人设）**真的进了请求**；且模型**自述所办身份且声明不投票**（§4 #5） |

---

## 6. 收尾与合规（逐条）

- **凭据副本**：`D:\_tmp\r17-home\.credentials.yaml` **已删除**（`Test-Path` = False）；**操作者自己的 `~/.dsh/.credentials.yaml` 未动**（仍在）。
- **发现并上报（未静默删除）**：`D:\_tmp\dshvmu\.credentials.yaml`（797 B，**2026-10-08**，**不是本次创建**）⇒ 已报 Lead；**Lead 已回复：由他删除并核验不存在** ✓。
- **宿主已停**：7819／7820 **均无监听**；7700–7900 段**无任何监听**残留 ✓。
- **未跑全量**（T0/T1 归 Lead）／**未 `regen-all`**／**未 git**（全程未做任何 git 写）／**未改 `tests/**`／`scripts/**`**。
- **临时物（都在 D 盘，留作证据可复跑）**：`D:\_tmp\r17-home\**`（scratch home ＋ 会话日志）、`r17-provider.yml`、`r17-overlay.yml`、`r17-boot.log`／`r17-boot2.log`、`r17-slice.log`／`r17-slice2.log`、`r17-offline.log`、`vmu-host-slice-1792045872132`（run 1 dump）／`vmu-host-slice-1792046465049`（run 2 dump）、`r17-ws`、`r17-decode.mjs`／`r17-receipts.mjs`。
- **写范围（Round 17 裁决后更新）**：本报告 ＋ **`vibe-math-vmu/docs/22-academic-operations.md`**（Lead 于 Round 17 批准，见 §8）。**未改 `docs/29`**（本卷与本轮证据无关）；**未改 `tests/**`／`scripts/**`**。

---

## 7. 给 Lead 的两个待决 —— **均已有裁决（Round 17 回复）**

1. **`…host-slice.test.mjs:367` 的那 1 行**（§3.3）⇒ **裁决：交 `tests/**` 属主 `vmu-verify2` 落（task-118），并写"改前/改后"两次读数。我不改 `tests/**`。**
2. **§4.4 的自主性残项** ⇒ **裁决：提为 Round 18 首项**（去掉剧本里的 `report/tick` 步骤、其余照旧再跑 1 次）。

---

## 8. 追加（裁决 2）：真机证据已并入 `docs/22 §19.12`（写范围获批准）

我改了 `vibe-math-vmu/docs/22-academic-operations.md`（本轮唯一的第二处写操作）——**按该块既有体例**并入：

| # | 位置 | 改动 |
|---|---|---|
| 1 | **§19.12 观测 14**（新增） | 实例（隔离 home／**干净 profile**：从 R12 scratch home 复制后剔除探针插件／两个补丁）＋ **第一次 429 QUOTA 的原样回执**（并写明它**不否定机制**：同次 `request/header` 已是 provider ＋ 78 工具／52 面、`system/message seq=7` 已带人设）＋ 修法（`commandcode`）＋ **会话 id／两次运行时刻／读数／退出码**（实跑 `16/1/0，exit=1`；离线复评 `16/0/0，exit=0`；`durationSec:55`；tokens in 93899／out 4525／cacheRead 157952；6 个 `tool/call` 的 `seq`＋行号）＋ **5 条断言逐条证据** ＋ **独立旁证（宿主 stdout 的 sink 行）** ＋ **唯一那条 red 的定性（读错源＝假阴性，交 task-118）** ＋ **明确"未建立"的自主性** |
| 2 | **"支持" #4**（`--require-host`） | 补记：Round 17 起那 5 条**已在真宿主上真跑且全绿**；现在的 `exit=1` **只**来自 `:367` 读错源，**不再**来自"未跑" |
| 3 | **"已建立" #8**（新增） | 宿主侧断言本身已被真机跑绿 ⇒ 四条维度＋投递**同时有"进程内"与"真宿主"两层证据** |
| 4 | **"不支持" #7**（新增） | ★ **自主性**：观测 12／13／14 的开火**都是脚本点名调 `tick`** ⇒ 未证"无人要求也会自己开火"；判定条件＝Round 18 那次 |
| 5 | **§0 记账纪律 ④**（更正**我自己的过期结论**） | R14 我写"生成器还没有调用形规则 ⇒ 纯方法优先写服务限定短写"。**现在生成器已落该规则**（`if (/^[ \t]*\(/.test(…)) { excluded.serviceCall.add(k); continue }`，含 `serviceCall` 桶；本轮 `--check`：`serviceCall=5`、`up to date (111 planned keys)`）⇒ **三段调用形在两个消费者下都安全**，短写**等价允许、不必为形式改写**。**声明必须与实现一致**，故更正。 |

**读数（2026-10-15 14:50:41 同一次运行，绑定到字节）**：`docs/22` sha256 **`3E1028705F429A00`**（176036 B，运行前后哈希相同）／`check-docs` **PASS**（期间抓到并修掉 doc-lint **D9**：两行含盘符绝对路径，已补"**仓库外，实测用**"标记）／`audit-vmu-docs` **95/0**／`audit-doc-index` **5/0**／`audit-verbatim-claims` **3/0**／`vmu-planned-settings` **ALL GREEN（planned=111, docs=28, 39/0）**／`generate-planned-settings --check` **up to date**／进程内三套 `assistant-report` **93/0**、`assistant-assembly` **39/0**、`assistant-systemprompt` **15/0**。

★ **调用形纪律**（Lead 要求）：本段服务方法一律写 `` `vmu.<服务>.<方法>(…)` `` 或 `vibe_vmu_*` 工具名，**未裸写三段点号名**；唯一保留的引文形态是 `docs/29` 那处回执（**逐字引文**，按 R14 结论不改写）。
