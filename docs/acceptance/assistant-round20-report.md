# Round 20 · `task-124`：真机 DSH 会话（阈值自主开火判定）＋ `docs/21 §20`／`docs/05` 落地

> 负责人：`vmu-assistant2`｜交付：本报告 ＋ **`docs/21-observability-and-operations.md` 新增 §20** ＋ **`docs/05-middleware.md` 一句话**。
> 硬约束遵守：**不跑全量**（T0/T1 归 Lead）／**不 `regen-all`**／**不 git**／临时文件全在 **`D:\_tmp`**／宿主**已停＋端口已核无残留**／**未改 `tests/**`／`scripts/**`**／凭据**只留了短暂副本并已立刻删除**（§5）。
> ★ **两处命名更正**（照任务书执行会走空）：① 任务书写 `docs/21-math-engine.md` —— **该文件不存在**；真实文件名是 **`21-observability-and-operations.md`**（Lead 已在消息里更正，我按真实名落地）；② 任务书交付物写 `assistant-round19-report.md`，Lead 消息写 **`assistant-round20-report.md`** ⇒ 本报告用**后者**。

---

## 0. 结论（★ 诚实二分：**一半实测成立，一半具名未建立**）

| 命题 | 判定 | 依据 |
|---|---|---|
| **回合边界会自主推进报告面**（`event` 型在无人调用 `tick` 时开火并送达） | ✅ **真 DSH 会话实测成立** | 本次会话 **`report/tick` 调用数 ＝ 0**，而**宿主自己的 stdout** 打出恰一条 `turn-end-duty` 的 sink 行 |
| **`threshold` 报告在真会话的回合边界自主开火** | ❌ **未建立（不是缺陷，是"计数者缺席"）** | 同一份 stdout 里 `artifacts-met`（`gte 5`）与 `artifacts-unreached`（`gte 50`）的 sink 行**都是 0 条** ⇒ `metricValues()` ＝ `{}` ⇒ `thresholdMet()` 如实 `false` |

★ **它与 `vmu-core2` R19 的结论不矛盾，而是互补**：core2 证的是"**给定真观测**，边界会把 `["artifacts-met","turn-end-duty"]` 投递出去"；我证的是"**在出货部署的真会话里，根本没有任何 `vmu.metrics` 观测**" ⇒ 两半合起来＝ **机制已就位、计数者缺席**（收口条件见 §3）。
★ **诚实限定（照 R18 写法）**：本轮证的是**机制层**（框架的回合边界推进报告，**不需要模型调用**）；**不**证"模型会自发地*想*去汇报"。

---

## 1. 本次运行（时间／会话／读数／退出码）

| 项 | 值 |
|---|---|
| 配方 | R18 那套：隔离 home **`D:\_tmp\r18-home`**（仓库外，实测用）／workspace `D:\_tmp\r18-ws`／provider 层 `D:\_tmp\r17-provider.yml`（`commandcode`）／**overlay `D:\_tmp\r20-overlay.yml`（只打 overlay 行）** |
| 宿主 | `dsh --profile ext --patch <provider> --patch <overlay> --port 7822 --no-open` ⇒ stdout 给出 launch token |
| 剧本 | `D:\_tmp\r20-task-autonomy.txt`：`vibe_vmu_report{status}` → `vibe_vmu_set` → `vibe_vmu_status` → 一句人设回答 —— ★ **没有 `report/tick`** |
| 驱动 | `node scripts/dsh-drive.mjs --port 7822 --token <T> --cwd D:\_tmp\r18-ws --preset vibe-math-vmu --task-file … --out D:\_tmp\r20-dump --jsonl … --max-tokens 400000 --timeout 400` ⇒ **exit=0** |
| 会话 | **`session-f423c35d-d016-4244-b1c8-de7df83a931b`**，**2026-10-15 16:07:33** |
| 读数 | 39 events；`durationSec:49`；tokens in 46178／out 3581／cacheRead 126464（cap 400k **未触**）；`turn/end reason:"completed"`；**退出码 0** |
| 工具调用 | 4 条：`vibe_vmu_report{action:"status"}`(seq16)／`vibe_vmu_set`(seq21)／`vibe_vmu_status`(seq26)／`pwsh`(seq31) ⇒ ★ **`report/tick` 调用数 ＝ 0**（逐条解析会话日志，非词频） |

### 1.1 ★ 第三方证据：宿主 stdout 的 sink 行（同一份日志的**正／负两侧**）
```
count=1
[vmu-report-sink] {"name":"turn-end-duty","to":[],"channel":"log","text":"【所办汇报】turn-end-duty 在 turn-end 自动开火","drives":false}
```
- **阳性**：`turn-end-duty`（`kind:'event', event:'turn-end'`）在**无人调用 `tick`** 的情况下开火并送达 ✓
- **阴性（同一份 stdout 里"没有"什么，也是实测）**：`artifacts-met` **0 条**、`artifacts-unreached` **0 条** ✓

### 1.2 overlay 的三份声明（可复跑）
`turn-end-duty`（`event: turn-end`，**阳性对照**）＋ `artifacts-met`（`threshold artifacts gte 5`，**被测项**）＋ `artifacts-unreached`（`threshold artifacts gte 50`，**否定对照**）＋ **`vmu.metrics.indicators: ['artifacts']`**（**部署侧那一半已就位**）。
另：会话里的 `vibe_vmu_report{status}` 回执（经模型 `pwsh` 转述）显示 **`"declared":3`** ⇒ 三份声明真的到达入口 ✓。

---

## 2. 机制（读码，三个落点）

1. **`kernel.metricValues({window,agg})`**（`kernel/index.js:715`）：**只读** `vmu.metrics` 快照并拍平成 `{名 → 一个数}`；★ 源码注释逐字写明 *"**NO OBSERVATION ⇒ NO KEY** … deliberately dropped here"* ⇒ **绝不伪造 `0`**；`agg` 默认 `sum`。
2. **`agent/turn-stopping` 桥**（`vibe-math-vmu.js:656-657`）：`kernel.report.tick({ at: Date.now(), event: 'turn-end', metrics: kernel.metricValues() })`；监听器**只在报告面已发布时**才挂（`:642`，零机制红线）。
3. **`thresholdMet()` 未放宽**（`kernel/report.js`）：`if (!metrics || typeof metrics !== 'object') return false` **原样保留** —— **"没有数据"绝不允许变成"开火"**（假警报）。**修的是交递，不是判据。**

---

## 3. ★ 缺的那一环，与为什么"部署侧补不了"（收口条件）

**缺的是"计数者"**：
- `'vmu.metrics'` 字面量在**全仓源码里只出现在 `kernel/index.js`**（R19 把它加进**能力门控的服务目录**，其注释逐字：*"the capability-gated catalog did not list it, so a **pack/policy had no way to record an observation** … WHICH indicators exist and WHEN they are observed **stays the pack's**"*）；
- `.observe(` 的调用点只有 `ids.js`／`lean.js`／`mathjobs.js` 的 **ID 面**与 `clockguard` 的同名动作 —— **都不是指标面**；
- **没有指标工具**：`tools/` 下无 metrics 文件 ⇒ 模型**无法**用工具记观测。

**为什么部署侧补不了**：`vmu.middleware.entries` **是**设置键（`settings/schema.js:210`）且内核**确实**读（`kernel/index.js:1708`），但每个非 `rules` 条目走 **`bus.add(entry)`**，而总线契约是 *"a non-rules bus entry needs a handler function（**the bus does not load files**: load a module file with `kernel/loader.js`, which attaches the api）"*（**`kernel/bus.js:446`**）⇒ **只有 pack 的 `module:`／`file:` 形状才会被 loader 附加 `api`**。

**⇒ 收口条件（唯一）**：**在某个 pack 里加一个 M2 模块**（`capabilities` 至少含 `trigger-workflow`，服务目录由它解锁，`kernel/loader.js:131`），在某钩子上 `api.services.get('vmu.metrics').observe({name:'artifacts', value:…, by:…, kind:…})` ⇒ 随后**同一个真机会话**里 `artifacts-met`（`gte 5`）应在回合边界自主开火、`artifacts-unreached`（`gte 50`）保持沉默。**该模块本轮不存在，且 `packs/**` 不在本任务写范围** ⇒ **我只记录，不越线**，也不写成"阈值自主开火已证" ✗✓。

---

## 4. 文档落地（②）

### 4.1 `docs/21-observability-and-operations.md`：新增 **§20 回合边界的指标交递**
- **§20.1 机制**：三个落点（`metricValues` 只读快照＋无观测即无键／`turn-stopping` 桥交递／`thresholdMet()` 未放宽）。
- **§20.2 "自动汇报"必须分三层说**：① 触发器会开火并送达 ② 无人要求也会开火 ③ **哪些触发器类型**能自主开火（`event`／`period` ✅；`threshold` 需"边界拿到非空 `metrics`"）。
- **§20.3 本次实测**：会话／时刻／读数／退出码 ＋ "宿主 stdout 恰 1 条阳性、两条阈值 0 条"的正负两侧。
- **§20.4 缺的那一环 ＋ 为什么部署侧补不了 ＋ 唯一收口条件**（§3 的正文版）。
- **§20.5 部署侧可复制配方**（一旦有计数者）：overlay 的 `threshold` 声明 ＋ **M2 计数者**的 `meta/capabilities/hooks` 骨架（调用形按纪律写成 `api.services.get('vmu.metrics').observe(…)`）。
- 另**顺手更新 §18 的 `N3`**：把"计划 `vibe_vmu_metrics`（未实现）"补成"**服务面已进能力目录且聚合已接到回合边界，但没有工具面、也没有计数者 ⇒ 仍**未建立**"，并**指向 §20.4**（避免 N3 与 §20 各说一半）。

### 4.2 `docs/05-middleware.md`：生成块**之外**追加一句
> 中间件模块（**形状②**，经 loader 拿到 `api`）可 `api.services.get('vmu.metrics').observe({name,value,by,kind})` **计数**；`kind ∈ {read, change, refusal, settlement, decision, mutation}`，其中**变更/拒绝/结算永不采样**。★ **两条"不静默"**（`kernel/metrics.js:202-220`，逐字）：① 白名单**已配置**而名字不在表 ⇒ **具名拒** `UNAVAILABLE_CODE`：`indicator not in vmu.metrics.indicators: <名>`（hint 列已声明清单）；② 白名单**为空＝零机制** ⇒ **不记录、但这次跳过被计数**。★ **为什么"只能是 pack"**：`vmu.middleware.entries` 走 `bus.add`，而**总线不加载文件**（`kernel/bus.js:446`）⇒ 只有 pack 会给模块附加 `api`。★ 意义见 `docs/21 §20`。
★ 该段落**写在 `<!-- END GENERATED: capability-list -->` 之外**（那一段是生成物，不能手改）。

---

## 5. 凭据与收尾（逐条可核）

- **凭据**：本轮**需要一次**（provider key 从 `DSH_HOME` 凭据库按 ref 名取）。做法＝复制到 **`D:\_tmp\r18-home\.credentials.yaml`**（**仓库外，实测用**），跑完**立刻删除**：
  `Test-Path` ＝ **False**；`Get-ChildItem D:\_tmp -Recurse -Filter '.credentials*'` ⇒ **none**（全盘无副本残留）；**操作者自己的 `~/.dsh/.credentials.yaml` 未动** ✓。
- **宿主已停＋端口无残留**：**7822 已无监听**；`7700–7900` 段**无任何监听** ✓。
- **未跑全量**／**未 `regen-all`**／**未 git**／**未改 `tests/**`／`scripts/**`** ✓。
- **临时物（D 盘，留作证据可复跑）**：`D:\_tmp\r20-overlay.yml`／`r20-task-autonomy.txt`／`r20-boot.log`／`r20-session.log`／`r20-dump\**`／`r18-home\sessions\…session-f423c35d…\**`。

---

## 6. 门禁读数（★ 写明是哪一次运行）

**我改完两卷 docs 后（2026-10-15 16:10:36，同一次运行，绑定到字节）**：
`docs/21` sha256 **`83BF6A048ABBBB40`**（45288 B）、`docs/05` sha256 **`C6E360BA8297CC90`**（58069 B）。

| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS**（★ 追加 `## 20.` 未触碰索引类判据） |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **95 / 0** |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-doc-api-coverage.test.mjs` | **2 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |

★ **调用形纪律**：新增文字里服务方法一律 `` `vmu.X.method()` ``（如 `api.services.get('vmu.metrics')`／`observe({…})`），**未裸写三段点号名**。

---

## 7. 诚实清单

1. **`threshold` 的自主开火在真 DSH 会话里＝未建立**（我实测到否定侧并给出唯一收口条件，**没有**拿 core2 的"真装配"读数冒充"真会话"读数）。
2. **没证"模型会自发地想汇报"**（Agent 行为层）。
3. **没碰 `packs/**`**，因此**没有**替部署补计数者；`tests/**`／`scripts/**` 亦未动。
4. **`docs/29` 未动**（本轮证据不属那卷）。

---

# 8. ★ R21 追测（`vmu-comms2` 的计数者落地后的第二次真机）—— 结论**更底一层**，仍判未建立

> 触发：Lead 的 ② 裁决（建 `task-126` 派 `vmu-comms2` 落 M2 计数模块）＋ comms2 的具名通知。**判定归我，我不借他人读数。**
> 本轮我一共跑了 **3 次真机**（R21／R21b／R21c），**全部读数如下**，然后我停在这里（不再烧会话）。

## 8.1 先核验 comms2 的三件事实与它的自证（**我自己复跑**，2026-10-15 16:27:29）
| 项 | 我自己的读数 |
|---|---|
| 模块本体 | `packs/v5r/middleware/artifact-counter.js` **存在**（8794 B，16:18）；policy 原文＝`tools/result → tool-results`（+1/次完成调用）＋`math|lean/job-settled → settled-jobs`；`capabilities:['trigger-workflow','record']` |
| 清单条目 | `packs/v5r/prompts/v5r-core.js` 里 **`v5r.artifact-counter`**（`kind:'module'` 显式、`on:['tools/result','math/job-settled','lean/job-settled']`、`failure:'open'`）⇒ 随 `packs.active:['v5r']` 装载 |
| 钩子桥 | ★ **`tools/result` 确在 `BRIDGED_HOOKS`**（我 import 后打印：`[…,"tools/execute","tools/result","prompt/assemble",…]`）⇒ 只要装载，回合内真能收到 |
| 它的测试 | `node tests/vmu-metrics-counter.test.mjs` ⇒ **26 passed / 0 failed exit=0**（我复跑）；`vmu-middleware-hooks-declared` **8/0**；`audit-pack-face` **5/0** |
**⇒ (a) 计数者存在且 in-process 绿；(b) 钩子桥没问题。** ★ comms2 另有一条**数字更正**（已收）：其"silent 变异 ⇒ 23/2"**作废**，当前是 **24/2 exit=1**（红的两条仍 U2/U5），CLEAN **26/0**，hook **17/9**；该更正**不影响**我下面任何真机读数。

## 8.2 三次真机（★ 全部记会话 id／时刻／读数／退出码）
| # | overlay 差异 | 时刻 | 会话 id | 退出码 | 宿主 stdout 的 sink | 判定 |
|---|---|---|---|---|---|---|
| **R21** | 设置键 `vmu.packs.active:['v5r']`（**R20／R21／`docs/29 §3` 配方里那一条**）＋`indicators:['tool-results']`＋三条报告（`turn-end-duty`／`tool-results gte 1`／`gte 1000`） | **16:28:11** | `session-da4942a1-fb67-4b32-a8b7-b4d02ba9abd0` | **0** | **count=1**：仅 `turn-end-duty`；★ `tool-results-met` **0 条**、`unreached` **0 条** | 阈值**未开火**；★ 会话日志 **`report/tick` 调用数＝0**、`report{status}` 回执 `declared:3/armed:3`（声明确实到达） |
| **R21b** | 在**预设内那行插件**的 config 上加**真正的装载键** `packs:['v5r']`（与 `vmu:` 同级） | **16:31:34** | —（`session/create` 被拒） | **1** | count=0（会话没建起来） | ★ **打断预设组装**：`agent-preset/invalid: vibe-math-vmu (dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js): cannot get property "systemPrompt" without inject`（＝host-slice 测试头部记载过的同一形态） |
| **R21c** | 回到可用 overlay，改用**运行时工具** `vibe_vmu_pack {action:'apply', id:'v5r'}`（该工具**已发布**：78 工具含它） | **16:33:21** | `session-d2f0e7d5-9446-46d3-828f-6fc63e307caf` | **0** | **count=1**：仅 `turn-end-duty` | ★ 工具**按设计拒绝出货 pack**：回执 `{"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"plan/apply need an inline manifest (manifest: \"<json>\")","hint":"a pack SHIPPED as ./packs/<id>.js is loaded by the profile row via config.packs; this tool inspects and loads inline manifests"}` |
（R21c 的 5 个调用＝`vibe_vmu_pack`(被拒)／`report status`／`set`／`status`／`pwsh`；R21 的 4 个调用＝`report status`／`set`／`status`／`pwsh`。）

## 8.3 ⇒ 正确根因（**R20 那句"计数者缺席"只对了半天**）
**装载开关是 `config.packs`，不是设置键 `vmu.packs.active`**（`vibe-math-vmu.js:451` 读 `config.packs`；设置键只喂 `packsDeclared`（`:516`）与状态/冲突文案（`:200`））。而**两条能设 `config.packs` 的路线都堵**：① 预设内那行插件上设 ⇒ **打断预设组装**（R21b）；② `vibe_vmu_pack` ⇒ **只吃内联 manifest，拒绝出货 pack**（R21c）。
**旁证（互相印证）**：这些真会话的 `vibe_vmu_status` 回执**全是** `settingsMerge.packs: []`，且 `settingsMerge.sources` 里**没有一个键带 `source:"pack"`** ⇒ **v5r pack 在我的真会话里从未被装载过**（这同时解释了 R17/R18/R20 的所有 `declared/armed` 读数为何都只来自 `config` 层）。
**⇒ 所以"阈值报告在回合边界自主开火"我仍判 **未建立**，但缺的不是计数者、也不是钩子桥，而是 **"在预设会话里装载出货 pack 的可用路线"**（收口条件：修 ① 的 inject 失败，或让 ② 接受 `id`／证实 `docs/10:436` 说的"profile 行"装载点）。

## 8.4 ★ 顺带查实的一处**文档缺陷**（我的两卷之外 ⇒ 只报不改）
`docs/29 §3`（`:261`／`:282`）与 `docs/22 §19`（`:1145`）的 overlay 配方写着 `packs: { active: ['v5r'] }` —— 这一条**关于"装载 pack"是误导的**（正确说法在 `docs/10-packs.md:436`：**profile 行的 `config.packs: ['<id>']`**）。两处对"报告声明＋transport"仍然正确，**但读者照抄会以为 pack 生效**。**本轮写范围只有 `docs/21`／`docs/05` ⇒ 我未改那两卷**，已在 `docs/21 §20.4` 末尾具名登记并报 Lead。

## 8.5 本轮追加改动与读数
- `docs/21` §20 改写：标题／§20.4（换成"三条装载路线逐条实测"）／§20.5（指标名换成 **`tool-results`／`settled-jobs`**、阳性 `gte 1`、阴性 `gte 1000`，并写明**先决条件＝装载路线**）。
- **门禁（2026-10-15 16:36:51 同一次运行，绑定到字节）**：`docs/21` sha256 **`E930F7870AEB1947`**（49098 B，运行前后哈希相同）／`check-docs` **PASS**／`audit-doc-index` **5/0**／`audit-vmu-docs` **95/0**／`audit-doc-vs-code-tables` **17/0**。
- **合规**：**未跑全量／未 regen-all／未 git**；**未改 `tests/**`／`scripts/**`**；凭据**一次短暂副本** `D:\_tmp\r18-home\.credentials.yaml`（三次真机共用）⇒ **跑完立刻删除并核验**（`Test-Path`＝False；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；操作者 profile 未动）；宿主**已停**（7819–7825 全无监听，7700–7900 段全无）。
- **诚实限定（照旧）**：证的是**机制层**；**不证**"模型会自发地想汇报"。

## 8.6 ★ Lead 裁决 ② 已执行：两卷误导配方按三条读数改写（**写范围已扩到 `docs/29`／`docs/22`**）

**改了三处**（都保留"报告声明＋transport 仍然正确"的部分，只更正"装载 pack"这一点）：
| 卷·位置 | 改动 |
|---|---|
| `docs/29 §3`（配方 YAML 那一行 ＋ 复核输出那一行） | 在 `packs: { active: ['v5r'] }` 两处**就地加警示注释**，并在配方后新增「**★ R21 更正**」块：`config.packs`（`vibe-math-vmu.js:451`；`docs/10-packs.md:436`）才是装载开关；`vmu.packs.active` 做三件事（`packsDeclared` `:515-516` ⇒ 决定 **`vibe_vmu_pack` 工具是否暴露** `:530`／状态与冲突文案 `:200-201`／`activeOverrides` 优先级 `:352`）；★ **只给设置键 ⇒ 工具被暴露而 pack 没装载**（R21c 的形状）；点号形态 `config.vmu={'vmu.packs.active':[…]} `（`:64` taken as-is）同属设置侧。**并附"装载三条路线的现状"表**（R21 不装载／R21b 打断组装／R21c 按设计拒），**如实写"截至 2026-10-15 三条都堵"** |
| `docs/22 §19`（`:1174` 的 R8 配方） | 同一更正，**就地加在配方那一行之后**，并回指 `29-§3` 与 `21-§20.4` |
| `docs/21 §20.4` | 新增 **(e) 推论必须分两层**（下条），并把 §20.4 的措辞从"计数者缺席"改为"装载路线不通" |

**★ 采纳 `vmu-verify2` 的独立复核（一条会误伤的推论被收窄）**：**分两层** ——
- **(i) 真装配（进程内）＝有效**：探针直接传 `config.packs` 时 pack **真装载**；verify2 用它**自己写的**独立探针实测 **3 条 `v5r.artifact-counter::*` 总线条目**、`tools/result` 真桥接、3 次宿主 `tools/result` ⇒ **`metricValues() === {"tool-results":3}`**，`packs:[]` 时条目 0、`metricValues() === {}` ⇒ **comms2 的计数器证据与 core2 的边界证据都属这一层，成立**。
- **(ii) 真 DSH 会话＝未装载** ⇒ **只有"把它当已装载"的推断作废**；`declared/armed`／`published faces` 来自 `config`/`default` 层、**与 pack 无关 ⇒ 不受影响**。
★ 我已把这条分层写进 `docs/21 §20.4(e)`，并在 `docs/21` 的旁证段前加"不要读成'凡 pack 生效一律作废'"的明确限定。
（verify2 另补：`:515-516` 的 `packsDeclared = config.packs 非空 **||** settings['vmu.packs.active'] 非空` 正是"工具被暴露而 pack 未装载"的机制来源 —— 与 R21c 读数一致；它**未复现** R21b 的宿主侧拒绝（无真机环境），**采信我的读数**，已照实记录。）

**门禁（2026-10-15 16:39:32 同一次运行，绑定到字节）**：`docs/21` sha256 **`9FF1B48E9182373E`**（50215 B）／`docs/22` **`F54470338BE91B16`**（182009 B）／`docs/29` **`4EF0019B2DE36372`**（44540 B）；`check-docs` **PASS**／`audit-doc-index` **5/0**／`audit-vmu-docs` **95/0**／`audit-doc-vs-code-tables` **17/0**／`audit-claim-traceability` **5/0**／`vmu-planned-settings` **ALL GREEN（planned=111, docs=28, 39/0）**。
★ **随后一次追加（2026-10-15 16:41:07，同四门同读数）**：按 `vmu-comms2` 主动交出的读码结论，在 `docs/21 §20.4(c′)` 登记**第四条路线** `config.modules`（`:876` 与 `config.packs` `:732` 读同一个顶层 `config` ⇒ **很可能同样不可达**，★ **本轮未测** ⇒ **既不写可用、也不写不可用**），并把 `docs/10:514`"运行期装载 ⇒ `vibe_vmu_pack`"**只对内联 manifest 成立**这一口径矛盾具名转 `docs/10` 属主 ⇒ `docs/21` 变为 sha256 **`A66E4571D0E6FC9A`**（51070 B，运行前后哈希相同）；`check-docs` **PASS**／`audit-doc-index` **5/0**／`audit-vmu-docs` **95/0**／`audit-doc-vs-code-tables` **17/0**（`docs/22`／`docs/29` 自 16:39:32 起未再改，哈希同上）。
★ **调用形纪律**：三处新增文字里服务方法一律 `` `vmu.X.method()` ``／字段名按原样，**未裸写三段点号名**；**未把任何没跑通的路线写成可用**（三条都如实标"堵"或"未装载"）。

## 8.7 第三次真机（待 `task-129` 修好后的判定预案，**本轮未跑、不预先声称**）
`task-129`（`vmu-core2`，修 R21b 那条文档化路线）落地后，只需把 **`docs/21 §20.5` 的配方**套进 R21 的可用 overlay（指标 `['tool-results','settled-jobs']`＋`threshold metric:'tool-results' gte 1`／`gte 1000`），一条会话即可判定，**三条判据**：① 宿主 stdout 出现 `tool-results-met` 的 sink 行；② 会话日志 `report/tick` 调用数 ＝ 0；③ 同一份 stdout 里 `tool-results-unreached` **0 条**。**另外必须新增一条装载证据**（本轮教训）：`vibe_vmu_status` 的 `settingsMerge.packs` **非空** 且 `sources` 里**至少一键带 `source:"pack"`** —— 否则"阈值开火"仍可能来自我们没搞清的路径。

## 8.8 ★★ `vmu-verify2` 已把我的结论从"采信"升级为**独立复算**（附一条方法论纪律）

**它用自己的探针 `D:\_tmp\v20\verify-session-log2.mjs`（只读）复算了我的落盘会话，原样读数**：
```
R21  session-da4942a1… ：settingsMerge 行=2 ；"packs":[] ；sources=["default","config","runtime"] ；ANY source:"pack" = false
R21c session-d2f0e7d5… ：settingsMerge 行=5 ；"packs":[] （×2） ；sources=["default","config","runtime"] / ["runtime"] ；ANY source:"pack" = false
                        （并含 VMU_INVALID_ARGUMENT ⇒ 与我的 R21c 具名拒一致）
```
⇒ **"这批真会话里 v5r pack 从未装载"现在是两个人独立算出来的**（`packs: []` ＋ **无任何 `source:"pack"`**），不再只是我的单方读数。★ **R21b 它仍未复现**（宿主侧行为，无真机环境）⇒ 那一条**仍是我的单方读数**，已在报告与本报告 §8.2 里如实标注。

**★ 一条必须记下的方法论纪律（verify2 先踩、后自查出来的）**：**"读会话日志"本身是一个有版本的读法** —— `zlib.zstdDecompressSync` 直接读整文件**只出 2 行**（会话日志是**多帧** zstd），那 2 行**看起来像证据**却把 35／44 行的事件截掉了。正确读法＝**按 zstd magic 切帧逐帧解**（仓库已有两处：`scripts/dsh-drive.mjs:206-215` 与 `tests/vmu-assistant-host-slice.test.mjs:101-111`，后者注释就写着 *"one-shot 会停在 frame 1"*）。⇒ **凡"我没看见某个 tool/call／回执"的结论，都要先证明"我的解码方式看到了全部帧"**，否则可能是解码器造成的假否定。★ 这条对第三次真机直接有用（§8.7 的三条判据都建立在"会话日志读全"之上）。

**★ 与 `docs/10` 的关系（不需我做动作）**：`vmu-comms2` 明确**不越权**给我"代笔 `docs/10`"的授权（该卷不在它也不在我的写范围），并已把**可直接粘贴的改法**（`docs/10:514` 的建议文本 ＋ `:512` 小标题的建议）**上交 Lead 派人落**。⇒ **我未动 `docs/10`**，第三次真机前若该卷仍未改，我在引用时会注明"该卷此处的口径与 `host.js:704-705` 不一致"。
