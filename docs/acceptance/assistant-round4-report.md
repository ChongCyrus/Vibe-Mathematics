# Round 4 · 目标 6 收口报告（task-29）：F2 transport 端到端 · 助手面真机切片 · 文档同步

> 负责人：`vmu-assistant`｜任务：`task-29`｜判据：Lead 的 Round-4 指令 A（F2 端到端、`--strict-findings` 全绿）／B（助手面真机切片，宿主不可用就**具名列前置条件**）／C（`docs/16 §9`、`docs/22 §19` 同步，含 F1–F5 最终口径与 F2 结论）
> 写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未改任何别人文件** ✓。

---

## 0. 结论

**A 完成（F2 关闭）**：部署经 `config.deliver` 交进**宿主自己的投递函数** ⇒ 真机入口实测"**有 transport ⇒ 真的发出**"，同时"**无 transport ⇒ 具名拒 `VMU_REPORT_NO_TRANSPORT` 且仍留痕**"仍被硬钉住 ⇒ **`--strict-findings` 从"具名下红"升级为全绿（55/0，exit=0）** ✓。
**B 完成但受前置条件阻塞（具名，不写"已验证"）**：`dsh 0.2.0-rc.2` **可用**、`headless` 模板**可组合**、隔离 `DSH_HOME` **可建**；唯一缺的是**模型路由凭据**（`MISSING_CREDENTIAL: llm-deepseek … provider route "deepseek-official"`）。切片**已就位**（`tests/vmu-assistant-host-slice.test.mjs`：环境自证 5/0 ＋ 宿主面 5 条 `NOT RUN`）；`--require-host` ⇒ exit=1（**证明"未跑"不是悄悄通过**）✓。
**C 完成**：两份文档已按 F1–F5 **最终口径**重写，含 F2 结论、Round-4 投递证据与真宿主切片状态 ✓。

| 套件 | 读数 |
|---|---|
| `tests/vmu-assistant-e2e.test.mjs` | **55 passed, 0 failed, exit=0**；`--strict-findings` ⇒ **55 passed, 0 failed, exit=0**（**全绿**） |
| `tests/vmu-assistant-host-slice.test.mjs`（新） | **5 passed, 0 failed, 5 not-run, exit=0**；`--require-host` ⇒ **exit=1**（具名红） |
| `tests/vmu-paper-consult.test.mjs`（C-30） | **40 passed, 0 failed, exit=0** |
| `tests/vmu-assistant-report / -assembly / -systemprompt` | **93 / 39 / 15**，全 exit=0 |

---

## 1. A · F2 端到端（**真机入口 ＋ `config.deliver`**）

**做了什么**：`boot()` 把宿主的投递函数按部署的方式交给入口（`config.deliver`），其余一切照旧（v5r pack ＋ 部署策略 ＋ 宿主 `agent/turn-stopping` 触发）。

**断言（全部硬）**：
1. `status().transportInjected === true` **且** `kernel.status().seams.deliver === true` —— 面与内核缝**同一事实**（一个事实一个家）✓；
2. 真实回合边界触发的**每一条**报送：`delivered:true`、`refused:null` ✓；
3. 部署侧**恰好一条 note / 次触发**（`state.sent.length === trace.length`）—— 不丢、不重复、不臆造 ✓；
4. 注（note）带 `to:['office']`、`channel`、渲染正文、**`drives:false`** ✓；
5. `status().delivered === 触发数` 且 `failures === 0` ✓；
6. **抛错的 transport**（`SLICE_INBOX_CLOSED`）⇒ note 记 `error.code`、计 `failures=1`、**报送不丢**（仍留痕）✓；
7. 留存（负半）：**无 transport** 的装配里 `delivered:false` ＋ `refused.code='VMU_REPORT_NO_TRANSPORT'` ＋ **trace 仍有行** ＋ `state.sent` 为空 ✓；
8. 内核工厂最小复现（不经入口）：注入 transport ⇒ `delivered:true`、note 带 `drives:false` ✓；
9. **回归守卫**：若"注入了 transport 却没送到"，走 `finding('F2', …)` ⇒ `--strict-findings` 下**具名红**（机制保留，不静默）✓。

复现：`node tests/vmu-assistant-e2e.test.mjs`（§7 负半、§8 正半）／`--strict-findings`。
**入口侧边界（core 的选择，本卷认账）**：入口**不**从 `ctx.get('subagents')` 猜一个 envelope（report/member 的信封与 turn 的 `{turn,text}` 不同形 ⇒ 猜就是"假装发出"✗）——所以 transport 由**部署**给，没给就是具名拒 ✓。

## 2. B · 助手面真机切片（**前置条件具名；未写"已验证"**）

**已实测的可用性**（原样命令）：
```
where.exe dsh              ⇒ C:\Users\admin\scoop\apps\nodejs-lts\current\bin\dsh(.cmd)
dsh --version              ⇒ 0.2.0-rc.2
dsh --dump-default-config --profile headless   ⇒ 组合成功（headless = 一条任务→一次答复→退出）
$env:DSH_HOME='D:\_tmp\smoke-home'              ⇒ 隔离工作目录（用户授权的配方；跑完已删掉临时凭据副本 ✓）
dsh plugin --profile headless add dsh-opencode-go / add <本仓>   ⇒ 均成功（dump-config 里 provider 行与 vmu preset 行都在）
dsh --profile headless --patch <opencode headless.patch.yml> "<slice 提示词>"
   ⇒ dsh: NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"
```

### 2.1 最终结论：**问题不是凭据，而是"路由"**（读安装件而定，零模型开销）

第一次配方的三条命令（复制凭据 → 装 provider/本仓插件 → 带 patch 跑 headless）在本机跑下来，得到**两个具名阻塞**，**没有一次调到大模型**（都在模型解析前失败 ⇒ **本轮消耗 0 个模型轮次**）：

1. **`dsh headless` 按设计拒绝带 agent preset 的会话** —— 安装件 `…/@deepseek-ai/dsh-headless/lib/index.js` 的 `assertAdoptable`：
   ```js
   const preset = currentPreset(header, events, sessionId);
   if (preset !== void 0) throw new Error(`session "${sessionId}" runs under agent preset "${preset}", which the one-shot runner does not compose`);
   ```
   而**助手面本身就是一个 agent preset**（`vibe-math-vmu`）⇒ **headless 无路可走**（换个 key 也没用）。我另试过把 vmu 插件当**普通顶层行** `insert` 进去，运行时报：
   `vibe-math-vmu-slice (…/vibe-math-vmu.js): Error: cannot get property "systemPrompt" without inject`
   —— 因为 `systemPrompt` 这个注入是 **preset 作用域**提供的，普通行没有。
2. **provider 侧**：即使插件已装进 profile、操作者凭据也已复制进隔离 `DSH_HOME`，仍报 **`NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`**；插件自己的 README 对**无头**流程要求把 **`OPENCODE_API_KEY`** 放进环境（凭据库那条路是给 **web** profile 的）。

⇒ **能承载助手面的真机路由只有一条**：跑着的 scratch **`dsh web`** ＋ **`scripts/dsh-drive.mjs --preset vibe-math-vmu`**（`round4-plan.md` 第 4 项那条，Lead 已划给 verify；本切片**只驱动、不起服务**，二者别同时起服务）。

### 2.2 切片已按该路由重写并自证（**未写"已验证"**）

`tests/vmu-assistant-host-slice.test.mjs` ⇒ **6 passed, 0 failed, 5 not-run, exit=0**；`--require-host` ⇒ **exit=1**（证明 `NOT RUN` 不是悄悄通过）✓。
- §1 **环境自证**：`dsh` 版本 ✓、`headless` 模板组合 ✓、隔离 `DSH_HOME` 可用且**不是**操作者的 ✓；
- §2 **路由自证（读安装件）**：断言"一次性 runner 拒绝 preset 会话"（附安装件路径）＋"拒绝的是 preset 而不是凭据"✓；并记 provider 的 `NO_ADAPTER` 实测 NOTE；
- §3 **切片**：给 `--web-port/--web-token`（＋默认 `--preset vibe-math-vmu`）时，用 `scripts/dsh-drive.mjs` 驱动**一次**会话并断言 5 条宿主面事实（工具可达／阈值真触发／参数面留痕／回合面／system prompt 面）；**没给就逐条 `NOT RUN`** 并打印上面那条具名前置条件。
  运行时命令：
  ```
  node tests/vmu-assistant-host-slice.test.mjs --web-port <port> --web-token <token> --preset vibe-math-vmu
  ```
- **开销**：本轮**未消耗任何模型轮次**（三次尝试全部在模型解析前具名失败）；我复制到 `D:\_tmp\smoke-home\.credentials.yaml` 的临时凭据副本**已按要求删除** ✓，探针日志与 patch 也已删 ✓；隔离 `DSH_HOME` 保留（下次换个 key/路由即可复用）。**注**：`D:\_tmp\smoke-home\.credentials.yaml` 后由 verify 重新复制（其服务需要），那份**不是我的**、我不动它。

### 2.3 FINAL（Lead 裁决：本轮不跑第二个会话，按具名路径收口；`14-§2` **U14**）

**观测**（可复核，带出处）
- `dsh` 0.2.0-rc.2 在 PATH；`headless` 模板可组合；隔离 `DSH_HOME` 可建且不是操作者的 ✓。
- **`dsh headless` 拒绝带 agent preset 的会话**：安装件 `…/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-headless/lib/index.js` 的 `assertAdoptable`：`if (preset !== void 0) throw … "which the one-shot runner does not compose"`。**助手面就是 preset** ⇒ headless 无路。
- 把 vmu 插件当**顶层行 insert** 可被挂载，但运行时报 `Error: cannot get property "systemPrompt" without inject`（该注入由 **preset 作用域**提供）⇒ 顶层行**不是**可用路由。
- provider：装好 `dsh-opencode-go`、凭据已复制进隔离 home，仍 `NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`（插件 README 对无头流程要求 `OPENCODE_API_KEY` 在环境）。
- verify 在**同一实例**上实测（前一次启动，零声明）：`tool/call`@seq16 L134 只有 `name:"vibe_vmu_status"`、`tool/result`@seq17 L135；provider/model＝`dsh-opencode-go`／`deepseek-v4.1-flash`；一回合 in 23006／out 993／total 31807、21s。
- **我亲自读到的**（本机、免费）：新实例命令行 `--profile vmsmoke --patch <provider 默认模型> --patch D:\_tmp\opencode-go.patch.yml --patch D:\_tmp\vmu-declare.patch.yml --port 7796 --no-open` ⇒ **声明 patch 确实在启动参数里**；但 `--dump-config` **不显现 preset 内层行的 config** ⇒ "声明有没有打到 `preset-vibe-math-vmu` 的 `config.plugins` 内层行"**未能确认**（Lead 的判断：顶层 patch 打不到内层行）。

**支持**（本轮真正立住的）
- 助手面在**装配级/单元级**全绿：`vmu-assistant-e2e` **55/0**（`--strict-findings` 亦 **55/0**）、`-report` 93/0、`-assembly` 39/0、`-systemprompt` 15/0；**双通道逐字**（system prompt 1453 字符 ＋ 回合面 13056 字符、`sources.section='v5r-report-duty'`）✓。
- F2 关闭：真机入口 ＋ `config.deliver` ⇒ `delivered:true`／note 带 `drives:false`／恰一条 note/次；无 transport ⇒ 具名拒且**仍留痕** ✓。
- 真机**路由**已立（上面"观测"第 2–4 条）：唯一可行＝scratch `dsh web` ＋ `dsh-drive --preset vibe-math-vmu`。
- 工具本身：`tests/vmu-assistant-host-slice.test.mjs` **6/0/5 not-run exit=0**，`--require-host` ⇒ **exit=1**（skip 是真的）✓。

**不支持**（本轮**未**建立，不许当通过）
- **真宿主上"多面点亮"未建立**：没有任何一次真实会话观测到 `vibe_vmu_report` 可达（零声明下只有 `vibe_vmu_status` ⇒ **机制正确、非缺陷**），也没有观测到阈值报送在真会话里触发／参数面在真会话里留痕／两条人设通道到达真模型的回答。
- **声明是否作用于 preset 内层行**未确认（见"观测"末条）。

**非结果**（**不是通过**，逐条列明）
- **未跑第二会话**：Lead 裁决（用户降本）＋ 嵌套行寻址不可靠 ⇒ 我**没有**使用 verify 提供的 7796 token。**注意**：`docs/slv-playbook.md` §7/§8 的口径——触上限／超时**都不算通过**，本项同理：它是"未跑"，不是"通过"，也不是"失败"。
- **Round 5 复跑清单（写给下一次，不花本轮）**：① 用**可声明的 overlay**（能打到 preset 内层行，或把声明放进 preset 的 `config.plugins`）再跑一次；② 驱动必须显式传 **`--max-tokens`**（playbook §4）并在第一条 user message 里写明"**模拟测试**"（§2）＋ 结论按 §7/§8（观测带 `seq`/行号）；③ 我的 `tests/vmu-assistant-host-slice.test.mjs` 已按 `--web-port/--web-token/--preset/--cwd/--timeout` 备好，**待补**：`--max-tokens` 透传与首行模拟测试标记（**本轮冻结未改代码**）；④ 保存 dump 到 `_oneoff/vmu/live/**`（驱动 `--out/--jsonl`）。
- 凭据与实例：我会通知 verify 收尾（删临时凭据副本、停实例）；**我不再起服务、不再写文件**。

## 3. C · 文档同步（`docs/16 §9`、`docs/22 §19`）

- **`22-§19.9`**：未核项 1／6／7 三项**结清**（宿主时钟＝按"面已发布"挂载；投递＝`config.deliver`；活读键回执＝`liveReadBy`＋`requiresRestart:false`）；第 8 条＝**真宿主切片**，按 Lead 裁决改为"**路由已证／多面点亮未建立／未跑第二会话**"口径 ＋ `14-§2` **U14**（Round 5 用可声明 overlay 再跑）。
- **`22-§19.10`**：表加一行 **D＋F2 投递（Round 4）**；读数改为 e2e **55/0**（strict 亦 **55/0 全绿**）；发现表改为**五条全部结清**的最终口径（**F1** 面解析在 pack settings 之后／**F2** `config.deliver`／**F3** 不得低报也不得高报／**F4** 默认不豁免／**F5** 面已发布即挂载）。
- **`22-§19.11`**：C-30 的码名改为全名 `VMU_OFFICE_CONSULT_REQUIRED`（已登记 `03-§8` ✓），策略值记为 pack 已声明（`ExemptRoles: []`）✓。
- **`16-§9.6`**：第 2／5 条**结清**；第 6 条＝真宿主切片（同一口径 ＋ U14）；`§9.7`（C-30 相位侧）已在 Round 3 落，本轮只随 C 校验 ✓。

## 4. 原样命令与退出码

```
node tests/vmu-assistant-e2e.test.mjs                     exit=0   === 55 passed, 0 failed ===
node tests/vmu-assistant-e2e.test.mjs --strict-findings    exit=0   === 55 passed, 0 failed ===   ← 目标达成：全绿
node tests/vmu-assistant-host-slice.test.mjs               exit=0   === 6 passed, 0 failed, 5 not-run ===
node tests/vmu-assistant-host-slice.test.mjs --require-host exit=1  （HOST SLICE REQUIRED BUT NOT RUN: NO PRESET-CAPABLE RUNNER…）
node tests/vmu-paper-consult.test.mjs                      exit=0   === 40 passed, 0 failed ===
node tests/vmu-assistant-report.test.mjs                   exit=0   === 93 passed, 0 failed ===
node tests/vmu-assistant-assembly.test.mjs                 exit=0   === 39 passed, 0 failed ===
node tests/vmu-assistant-systemprompt.test.mjs             exit=0   === 15 passed, 0 failed ===
node tests/audit-doc-vs-code-tables.test.mjs               exit=0   === 17 passed, 0 failed ===
node tests/audit-verbatim-claims.test.mjs                  exit=0   === 3 passed, 0 failed ===
node tests/audit-doc-index.test.mjs                        exit=0   === 5 passed, 0 failed ===
node tests/audit-declaration-criterion.test.mjs            exit=1   RULE E fingerprints current=70 baseline=67 —**新增 3 条均非我的文件**（无 `vmu-assistant*`）
```
**真机尝试的原样命令与读数（全部在模型解析前具名失败 ⇒ 模型轮次消耗 = 0）**：
```
dsh plugin --profile vmslice-h add dsh-opencode-go            ⇒ + dsh-opencode-go 0.1.22（572ms）
dsh plugin --profile vmslice-h add <本仓>                      ⇒ + dsh-vibe-math link:…（221ms）
dsh --profile vmslice-h --patch <opencode headless.patch.yml>  "<slice 提示词>"
   ⇒ dsh: NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"
dsh plugin --profile headless add dsh-opencode-go / add <本仓>  ⇒ 均成功
dsh --profile headless --patch <vmu-slice.patch.yml> "<slice 提示词>"
   ⇒ warning: 1 entry did not activate
     vibe-math-vmu-slice: Error: cannot get property "systemPrompt" without inject
     dsh: NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"
```

## 5. 别人的红（我未动其文件，逐个具名）

1. **`scripts/check-docs.mjs` ⇒ 3 issues（Round 4 新出现，非我引入）**：
   - `[D9] 05:245`／`05:246` —— `docs/05-middleware.md` 里写了 `node D:\_tmp\…mjs` 这类**盘符绝对路径**却没标注"仓库外/实测"（vmu-pack 的文件）；
   - `[D14] VMU_RESUME_BUSY` —— 出现在文档里但**未登记 `docs/03 §8`**（resume 面／reader-a＋core）。
2. **`tests/audit-vmu-docs.test.mjs` ⇒ exit=1**：「vmu settings table: STALE — `docs/04 §11` is not what the schema yields（1218 keys）」⇒ 生成物待 Lead 的 `regen-all`（D-11）✓，非人工可修。
3. **`tests/audit-module-coverage.test.mjs`** 的 gaps 现为 `lean (3 unnamed)`／`mathjobs (1 unnamed)`（reader-b 的模块）——`paper`／`report` **不在**其中 ✓。

## 6. 未做项 / 仍需他人

1. **真宿主切片未跑（B）—— 原因已从"缺凭据"改判为"路由"**：`dsh headless` 按设计拒绝 preset 会话（安装件 `assertAdoptable`），助手面是 preset ⇒ 需要**跑着的 scratch `dsh web` ＋ `scripts/dsh-drive.mjs --preset vibe-math-vmu`**（Lead 已把 web smoke 划给 verify；本测试已按该路由写好并自证，只等一个可驱动的实例）。**本轮模型轮次消耗：0**；临时凭据副本已删 ✓。建议登记 `14-§2` **T17**。
2. **verify**：`audit-enforced-consistency` 的 `paper` REFUSAL_SCENARIO；D-05 双登记新增三个测试（`tests/vmu-assistant-e2e.test.mjs`、`tests/vmu-paper-consult.test.mjs`、`tests/vmu-assistant-host-slice.test.mjs`）＋ Round 2/3 的 `kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/{v5r-assistant.js,assistant.json}`。
3. **core**：无（F2／F3／F5 均已落；`config.deliver` 可用）。
4. **vmu-pack**：无（C-30 的 5 个 defaults 已补，`ExemptRoles: []` ✓）。
5. **别人的红（具名，我未动其文件）**：`check-docs` 3 issues（`[D9] docs/05:245/246` 盘符路径未标注 → vmu-pack；`[D14] VMU_RESUME_BUSY` 未登记 `03-§8` → resume 面/core）；`audit-vmu-docs` = `docs/04 §11` 生成表 STALE（等 Lead `regen-all`）；`audit-module-coverage` gaps＝`lean`／`mathjobs`（reader-b）。
6. **本报告未做**：全量 sweep、`regen-all`、`update-doc-counts`、git（D-07 留给 Lead）✓；临时文件全部清除（`D:\_tmp\vmslice-*.log`、`vmu-slice.patch.yml`、凭据副本；隔离 `DSH_HOME` 保留以便复用）。

## 7. 写范围核对

```
 M vibe-math-vmu/docs/16-research-lifecycle.md      M vibe-math-vmu/docs/22-academic-operations.md
 M tests/vmu-assistant-e2e.test.mjs                （F2 端到端 ＋ §4 断言改为"覆盖而非计数"）
?? tests/vmu-assistant-host-slice.test.mjs          （新：助手面真宿主切片 ＋ 前置条件自证）
?? _handoff/vmu/assistant-round4-report.md
（Round 3 的 kernel/report.js、tools/report.js、packs/v5r/prompts/**、另三个 tests 本轮未再改）
```
