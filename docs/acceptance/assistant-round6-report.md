# Round 6 · task-43：多面真机会话（1 次）＋ 目标 6 终态口径

> 负责人：`vmu-assistant`｜任务：`task-43`｜前置：vmu-core **task-41**（入口两形态＋未解析键告警）**已落地并被我这次真机读数端到端验证** ✓；vmu-verify **task-42 A**（"声明⇒面真的发布"运行时断言 16/0 ＋ mutants GREEN）**已通过** ✓。
> 写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未改任何别人文件** ✓。
> 纪律：不跑全量 sweep／不 `regen-all`／不 git；临时文件 `D:\_tmp`；**总会话数 4/4（≤4 上限，本轮用满）**；凭据副本由 verify 收尾删除（我这边未复制凭据）。

---

## 0. 结论（一段话）

**多面点亮 ✅ 建立**：真机会话里宿主**真的发给模型 52 个 `vibe_vmu_*` 面**（Round 5 只有 1 个），其中 **5 次真实 `tool/call` + `tool/result`**（`status`／`chat`／`panel`／`report status`／`report tick`，全部带 `seq`＋行号）；**助手面 `vibe_vmu_report` 已发布且被真的调用、回执完整** ✓。
**但"阈值真触发／参数面留痕／两通道到达模型"这三条本轮【未行使或未建立】，原因逐条具名**：① 阈值没触发**不是缺陷**——overlay 只声明了 `vmu.report.enabled:true`（武装）而**没有声明任何 `reports`**，回执原文写着 `declared:0` 与 **"no reports are declared: nothing is reported (zero mechanism)"** ⇒ **零机制正确**；② 参数面 `vibe_vmu_set` **已发布**但本轮提示词未点名 `set` ⇒ **未行使**；③ 人设问题本轮提示词未包含 ⇒ **未行使**（装配级双通道逐字证据仍在）。
**另**：本轮 `tokenCapHit:true`（会话被驱动按上限 `session/cancel`，`turn/end.reason=aborted/user`）⇒ 按 `docs/slv-playbook.md` §8，**触上限本身不算通过**；本报告的结论只建立在**事件级事实**（发布的工具清单＋5 对 `tool/call`/`tool/result`＋回执原文）之上。

## 1. 原样命令与读数

```
# 实例由 vmu-verify 起（唯一一个）：--port 7801，启动补丁＝provider default-model ＋ D:\_tmp\opencode-go.patch.yml ＋ D:\_tmp\vmu-overlay-v2.yml
# 免费预检（verify 侧）：POST /api/session/create {agentPreset:'vibe-math-vmu'} ⇒ http=200 ok=true ✓

set DSH_HOME=D:\_tmp\smoke-home ; set TEMP=D:\_tmp\host-slice-out
node tests/vmu-assistant-host-slice.test.mjs --web-port 7801 --web-token <token> \
     --preset vibe-math-vmu --cwd D:\_tmp\smoke-ws --max-tokens 40000 --print
   ⇒ === VMU ASSISTANT HOST SLICE: 8 passed, 7 failed, 0 not-run ===   exit=1
（8 条通过里包含「the assistant face is REACHABLE in a real session (the tool was really called)」✓；
  7 条失败中的 5 条是"未行使/零机制"性质，见 §0 与 §3；2 条是 tokenCap 触顶导致会话被取消）
```

## 2. 记账（Lead 要求的每一项）

**会话**：`session-4f62c01e-7157-4489-827f-971a0d10232a`（35 events；日志 `D:\_tmp\smoke-home\sessions\--D-_tmp-smoke-ws--\…\session.v4.jsonl.zstd`，多帧 zstd，按 `dsh-drive.mjs:213-215` 的读法解码）。
**provider/model**：`request/context`@L14 ⇒ **`dsh-opencode-go` / `deepseek-v4.1-flash`** ✓（两补丁都生效）。
**首条 user message**：**L10 seq=8**（首行即「模拟测试 / SIMULATED TEST」⇒ SLV §2 落点 ✓）。
**tokens**：in **42778** / out **1086** / cacheRead **26624** ⇒ `tokenCap 40000` **被触**（`tokenCapHit:true`；`turn/end`@L35 `reason:{kind:'aborted',reason:{kind:'user'}}`，即驱动按上限取消）。
**工具清单（宿主真发给模型的载荷 `request/header.tools`）**：**78 个工具，其中 `vibe_vmu_*` 52 个** ✓
```
vibe_vmu_admission, arbitration, audit, auditchain, bidding, board, bridge, budget, capacity, charter,
chat, citations, clockguard, collab, conference, control, custody, discipline, explain, external,
fairness, fidelity, formal, governance, handover, human, idempotency, ip, mailbox, mathadapters,
mathjobs, mathtools, meeting, middleware, minutes, notify, pack, panel, projmigrate, publication,
ratelimit, recruit, report, retention, reviewers, set, status, task, topology, transaction, turn, wait
```
（对照 Round 5：`vibe_vmu_*` **只有 `status`** ⇒ 这就是"发布问题 vs 提示词问题"的分界证据，现已翻转为"发布 ✓"。）

**5 对 `tool/call` / `tool/result`（seq＋行号）**：

| # | `tool/call` | seq | 行 | `tool/result` seq | 行 | 回执要点 |
|---|---|---|---|---|---|---|
| 1 | `vibe_vmu_status` | 16 | L18 | 17 | L19 | **49,929 字符**；`settingsMerge.sources` 见 §2.1；`settings.keys=4` |
| 2 | `vibe_vmu_chat` | 18 | L20 | 19 | L21 | `{"ok":true,"action":"list","total":0,"messages":[]}` ⇒ chat 面真活 ✓ |
| 3 | `vibe_vmu_panel` | 20 | L22 | 21 | L23 | `{"ok":true,"action":"status","apiVersion":1,"members":0,"policy":{…},"mechanism":{…}}` ✓ |
| 4 | `vibe_vmu_report`（status） | 22 | L24 | 23 | L25 | `enabled:true, declared:0, armed:0, drives:false, neverDrives:true, transportInjected:false, auditInjected:true, descriptorInjected:true, params.whoMayChange:['office'], enforced:[11 键], note:"no reports are declared: nothing is reported (zero mechanism)"` ✓ |
| 5 | `vibe_vmu_report`（tick，metrics={"artifacts":9}） | 27 | L29 | 28 | L30 | `{"ok":true,"action":"tick","enabled":true,"clock":{"ok":true},"declared":0,"fired":[],"skipped":[],"ignored":[],"drives":false,"enforced":[11 键]}` ⇒ **面活、零机制**（没有可触发的报告）✓ |

### 2.1 ★ core 的 task-41 修复：端到端验证（这是本轮第二份硬证据）
```
settingsMerge = {"priority":"pack 默认 < preset Config／会话 settings < 运行时 set","packs":[],"defaults":0,
                 "sources":{"vmu.tools.faces":"config","vmu.packs.active":"config",
                            "vmu.report.enabled":"config","vmu.report.minIntervalMs":"config"},
                 "conflicts":[],"shadowed":[]}
settings.keys = 4
resolved: vmu.tools.faces  = {value:["*"],    source:"config"}  ✓
          vmu.packs.active = {value:["v5r"],  source:"config"}  ✓
```
⇒ **嵌套 overlay 声明这次真的到达入口**（4 个点号键，`source:"config"`；Round 5 同字段是 `sources:{}`、`keys:0`）⇒ **52 面发布**。**core 的"入口两形态"修复在真机成立** ✓。

## 3. 五条断言逐条（含"未建立/未行使"的具名理由）

| 断言 | 结果 | 依据 |
|---|---|---|
| `vibe_vmu_report` **可达** | ✅ **建立** | 发布清单含它（§2）＋真调用两次（#4/#5）＋回执完整 |
| 阈值报送**真触发** | ✗ **未建立**（**原因是部署未声明报告，零机制正确**） | #5 回执 `declared:0, fired:[]`；#4 回执 note 原文 "no reports are declared: nothing is reported (zero mechanism)" |
| 参数面**留痕** | ✗ **未行使** | `vibe_vmu_set` **已发布**（§2 清单）但本轮提示词未点名 `set`；装配级 F3（`liveReadBy`＋`audit.appended`）仍绿 |
| **回合面**到达模型 | ⚠ **未直接测**（本轮提示词未含该问） | 发布层面 ✓（`v5r` pack 已装载：`vmu.packs.active:["v5r"]`）；装配级逐字证据（13056 字符、`sources.section='v5r-report-duty'`）仍绿 |
| **system prompt 面**到达模型 | ⚠ **未行使**（本轮提示词未问人设） | 装配级逐字证据（1453 字符所办三段）仍绿 |
| **多面点亮（≥3 面）** | ✅ **建立** | 52 面发布 ＋ **4 个不同面真被调用**（status/chat/panel/report）＋ 5 对 call/result |
| `tokenCapHit` | ⚠ **true（非通过）** | §8：触上限不是通过；本报告结论只取事件级事实 |

## 4. 本轮 harness 升级（`tests/vmu-assistant-host-slice.test.mjs`，我名下）
1. **`DSH_HOME` 兜底**：原来只认 `--dsh-home`/`DSH_SLICE_HOME`，导致驱动别人的实例时**读错 home ⇒ `sessionLog:null` ⇒ 记账看起来像"没有调用"**（Round 5 就是这样被误读的）。现在 `process.env.DSH_HOME` 优先 ⇒ 自动找到会话日志 ✓。
2. **发布清单抽取**：从 `request/header.tools` 取宿主**真正发给模型**的工具名 ⇒ 断言"`vibe_vmu_report` 在发布清单里"，并打印 `PUBLISHED TOOLS (n)` / `PUBLISHED vmu FACES` ✓。
3. **事件级记账**：每条 `tool/call`/`tool/result` 的 **`seq`＋行号**、首条 `user/message` 的 `seq`＋行号、`STATUS RECEIPT(settingsMerge/settingsKeys/settingsUnparsed)`、`tokenCapHit` ✓。
4. **日志重试**（turn 结束才 flush）＋**模型原话**在 `toolCalls==0` 时作为 finding 打印 ✓。
自查：`node --check` ✓；hostless 运行 **6 passed, 0 failed, 5 not-run, exit=0**；`--require-host` ⇒ exit=1 ✓。
5. **★ 声明→入口的常驻断言（vmu-verify 建议，已落）**：新增 `--expect-settings k1,k2,…` —— 断言**部署声明的每一个键**都出现在入口的 `settingsMerge` 自曝里；并用**正则**（不是 `JSON.parse`）从 status 回执原文抽 `sources`／`keys`／`settingsUnparsed`／`declared`（49,929 字符回执可能被 elide ⇒ `JSON.parse` 失败，本轮就出现过 `settingsMerge:null`）。⇒ **即使回合被上限切断，只要 status 回执发生过，就能自动判定"声明到没到入口"**（R5＝`{}`/`keys:0` ↔ R6b＝5 键含 `reports`/`keys:5`，正是这条要区分的两态）✓。

## 5. 未做项 / 下一步（都是"部署/提示词"层面，不是机制缺陷）
1. **声明一份报告**（例如 `vmu.report.reports` 里放一条阈值报告）⇒ 才能测"阈值真触发"与 note 投递；**本轮 overlay 只武装未声明**，这是我这边的配方缺口（具名）。
2. **提示词补两个动作**：`vibe_vmu_set`（参数面留痕）＋ 人设问句（两通道）⇒ 一条提示词即可覆盖，**但需要再花 1 次会话**（预算 4/4 已满，留给下一轮）。
3. `tokenCapHit` 说明本轮 40k 上限偏紧（模型多花了输入 token 在长回执上）——下轮可把上限提到 80k 或把回执要求压到"只贴前 80 字符"（已如此）＋限制工具数。

## 5b. ★ 第 5 次会话（Lead 追加授权；overlay v3 ＝带**真报告声明**）——**具名收口，不再要第 6 次**

**实例**：verify 起（`--port 7802`；补丁＝provider default-model ＋ `opencode-go.patch.yml` ＋ **`vmu-overlay-v3.yml`**＝ overlay 行 ＋ `reports:[{name:'artifacts-threshold', trigger:{kind:'threshold',metric:'artifacts',op:'gte',value:5}, channel:'log', template:'【成果阈值】…'}]`）。**免费预检**（驱动我自己 `kernel/report.js`，不起服务）：`declared=1, problems=[]`；`tick({metrics:{artifacts:9}})` ⇒ `fired[0]`、text `【成果阈值】artifacts=9 已达阈值 5`、`drives:false` ✓。

**跑了（1 次）**：`node tests/vmu-assistant-host-slice.test.mjs --web-port 7802 --web-token <token> --preset vibe-math-vmu --cwd D:\_tmp\smoke-ws --max-tokens 120000 --print`
⇒ **11 passed, 3 failed, 0 not-run, exit=1**（上一轮 8/7 ⇒ 新增通过：**发布断言** ✓、**多面 ≥3 真调用** ✓、**report 真调用＋结果** ✓）。

**记账**（会话 `session-56523152-89bc-4ec5-80a0-6af9a5bb0a33`，40 events）：
```
发布清单 : 78 工具 / vibe_vmu_* 52 个       ✓
首条 user : L10 seq8（「模拟测试」✓）
调用     : status call L19 seq17 → result L20 seq18（49,929 字符）
           chat   call L24 seq22 → result L25 seq23（94 字符；{"ok":true,"action":"list","total":0}）
           panel  call L29 seq27 → result L30 seq28（313 字符）
           report call L34 seq32 → result L35 seq33（966 字符）
tokens   : in 42699 / out 409 / cacheRead 110976 ；tokenCap 120000 ⇒ **tokenCapHit:true**
turn/end : L40 reason={"kind":"aborted","reason":{"kind":"user"}}（驱动按上限 session/cancel）
```
**★ 本轮新增的正向事实（声明到达入口、机制侧齐备）**：
```
status 回执自曝：settingsMerge.sources = {"vmu.tools.faces":"config","vmu.packs.active":"config",
  "vmu.report.enabled":"config","vmu.report.minIntervalMs":"config","vmu.report.reports":"config"}   ← 5 键、含 reports ✓
settings.keys = 5 ；settingsUnparsed = null ；report.status: declared=1 ; fires=0
```
⇒ **overlay v3 的阈值报告声明真的到达入口并被接受（`declared=1`）** —— core 的嵌套展平连"对象数组叶子"也处理对了 ✓。

**三条为何仍【未建立/未行使】（逐条具名；根因是**我这边的提示词成本**，不是机制）**：
1. **阈值真触发**：`report` 只跑了 `status`（L34 seq32）——**`tick` 未被调用**（第 6 步未执行）⇒ 无"真触发"可观测；但 `declared=1` 证明**声明已到入口**，机制侧不再缺件。
2. **参数面留痕**：`vibe_vmu_set` **同样未被调用**（第 5 步未执行）。
3. **两通道**：末条答复未产生（会话在第 4 步后取消）⇒ 人设自述无观测。
4. **根因（我自己的设计问题）**：`vibe_vmu_status` 回执 **49,929 字符**，其后每一步都从缓存重读（cacheRead **110,976**）⇒ root+child 合计口径下 **120k 上限在第 5 步触顶**。**修法很具体**：提示词**不要**把 `vibe_vmu_status` 放在最前（或只取一个短 action），省掉这 5 万字符 ⇒ 6 步预算绰绰有余。
**结论**：**多面点亮 ✅（52 面＋4 面真调用）／助手面可达 ✅（发布＋真调用＋完整回执）／声明到达入口 ✅（`declared=1`、`settings.keys=5`）**；**阈值真触发、参数面留痕、两通道三项＝【未建立/未行使】（回合被上限切断；`tokenCapHit:true` 按 §8 不算通过）** ⇒ **按 Lead 的规矩具名收口，不再要第 6 次会话** ✓。

## 6. 会话记账（≤4 纪律；第 5 次为 Lead 追加授权）
```
Round 5 : verify 1（框架面 31.4k）＋ 我 2（绕行 8.2k；最终 32.2k）
Round 6 : 我 1（本轮：in 42778 + out 1086 + cacheRead 26624）
总计    : 4 次会话 ＝ 上限 4/4（用满） ；累计 tokens ≈ 142k（≪ 手册上限）
```
`chat` 前 3 次尝试全部在模型解析前具名失败（零成本）不计入。

## 7. 写范围核对
```
 M vibe-math-vmu/docs/16-research-lifecycle.md   （§9.6-6 目标6 终态口径）
 M vibe-math-vmu/docs/22-academic-operations.md  （§19.12 观测 10＋不支持/非结果终态）
 M tests/vmu-assistant-host-slice.test.mjs       （DSH_HOME 兜底 · 发布清单 · seq/行号记账 · 日志重试）
?? _handoff/vmu/assistant-round6-report.md
（kernel/report.js、tools/report.js、packs/v5r/prompts/**、另五个 tests 本轮未改）
```
