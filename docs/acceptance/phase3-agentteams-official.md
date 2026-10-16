# Phase 0a · 官方 DSH agent-team 四个 alpha 包 —— vmu 可复用之处

> **状态：进行中（边查边写）**。本文按任务 `task-197` 的要求增量落盘：每查清一条就补进来并保存。
> 交付物＝**本文件一个**（不改仓内代码）。

## 来源与读法

| 项 | 值 |
|---|---|
| 对象（四个包） | `@deepseek-ai/dsh-experimental-agent-team`／`-tool-agent-team`／`-agent-team-profile`／`-client-ui-agent-team` |
| 事实来源（优先级） | ① **本地已装 DSH 实现**（只读）② npm 页面（仅当本地取不到） |
| 本地候选位置（逐个核） | ★ **已定位（实测）**：四个包都在 `C:\Users\admin\scoop\persist\nodejs-lts\bin\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`（**不是** scoop 的 `@deepseek-ai` 顶层——那一层只有 `dsh` 一个包；profile 的 `@deepseek-ai` 只有 4 个目录且不含 agent-team）。⇒ 本文件所有 `file:line` 均以**该目录**为根（下文写作 `<PKGS>/<包名>/…`） |
| 标记约定 | **【读】** ＝ 我读到实现/文件并给 `file:line`；**【推】**＝ 由已读事实推断（**不是**读到的）；**【未核】**＝ 还没拿到证据 |
| 落点判据（本项目红线） | 每条推荐必须标明：**进 vmu 内核（能力/挂点）** 还是 **留在 pack/中间件（机制决定）** |

### 四个包的清单（实测，版本一律 `0.2.0-rc.2`）

| 包 | main | 关键文件（字节） |
|---|---|---|
| `dsh-experimental-agent-team` | `lib/index.js` | `lib/index.js` 72 893／`lib/invariant.js` 18 215／`lib/types/*`（activity/journal/lifecycle/**mailbox**/projection/**roster**/**task-board**/task-graph/task-view…）／README.md 17 873 |
| `dsh-experimental-tool-agent-team` | `lib/index.js` | `lib/index.js` 18 707／README.md 10 903／`locale/{en,zh}.json` |
| `dsh-experimental-agent-team-profile` | `lib/index.js`（**11 字节，近乎空**） | 实体在 **`cordis.patch.yml`**（`exports` 里显式导出）／README.md 6 406 |
| `dsh-experimental-client-ui-agent-team` | `lib/index.js`（240 字节，近乎空） | 实体在 **`lib/client.js`** 25 390（`exports['./client']`）／README.md 7 134 |


## 逐包：它提供什么 / 公开面（每条带 `file:line`）

> 下文 `<PKGS>` ＝ `C:\Users\admin\scoop\persist\nodejs-lts\bin\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai`（只读）。凡标 **【读】** 的都是我读到的；**【推】** 是推断。

### 1. `dsh-experimental-agent-team`（0.2.0-rc.2）—— **runtime 服务**

- **提供什么【读】**：一个 cordis **服务** `agentTeams`（`lib/index.js:1704` `super(ctx, "agentTeams")`）＋ 一个 **session projection**（`:1731` `ctx.root.sessionProjections.register(teamProjectionDefinition)`）＋ 一整套 **types**：`lib/types/{activity,journal,lifecycle,mailbox,projection,roster,task-board,task-graph,task-view,persisted,session-message,error,invariant,types}.js`（`mailbox` 14 151 B、`roster` 20 965 B、`task-board` 12 036 B ⇒ **信箱／名册／任务板是这个包的第一等公民**）。
- **配置键【读，来自 patch】**：`maxMembers`／`maxTasks`／`maxPendingMessagesPerMember`／`maxMessageBytes`／`disposalTimeoutMs`（`<PKGS>/dsh-experimental-agent-team-profile/cordis.patch.yml:20-25`）。
- **没读**：`lib/index.js`（72 893 B）的其余部分、`lib/invariant.js`、`lib/types/*` 的实现语义 ⇒ 见「未核清单」。

### 2. `dsh-experimental-tool-agent-team`（0.2.0-rc.2）—— **模型面工具**

- **插件身份【读】**（`lib/index.js:10-19`）：`name = "tool-agent-team"`；`inject = ["agents","agentTeams","tools","systemPrompt"]`；`Config = z.object({ freshProvider: z.string().default("spawn"), forkProvider: z.string().default("fork") })`。
- **★ 工具名（9 个）＋ 1 个 prompt 段【读】**（都在**精确 Agent scope** 内注册，`:229-233` `const register = (disposer) => …`）：

| 行 | 名字 | 类型 |
|---|---|---|
| `:238` | `team:policy` | **systemPrompt 段**（`:237` `scoped.systemPrompt.section(…)`） |
| `:243` | `spawn_teammate` | tool |
| `:296` | `send_message` | tool |
| `:323` | `list_agents` | tool |
| `:332` | `wait_agent` | tool |
| `:354` | `interrupt_agent` | tool |
| `:367` | `team_task_create` | tool |
| `:402` | `team_task_list` | tool |
| `:446` | `team_task_get` | tool |
| `:459` | `team_task_update` | tool |

- **★ 规范语义【读，逐字】**：`POLICY`（`:20-33` 一带的模板串）里**把语义写死在一处**，例如 "**a successful send is already durable when its result says queued; do not resend it**"／"**inactive means no turn is executing; it does not describe task completion, success, failure, or waiting for other agents**"；另有 `const ACTIVE_WAIT_STATUSES = new Set(["running","provisioning"])` 与 `const NO_ACTIVE_PEER_MESSAGE = "No other Team member is running or provisioning. wait_agent cannot make progress or wake inactive teammates…"`（同一头部区）。

### 3. `dsh-experimental-agent-team-profile`（0.2.0-rc.2）—— **只有一份 profile patch**

- **提供什么【读】**：`lib/index.js` **只有 11 字节**（`export {};`）；实体是 **`cordis.patch.yml`（818 B）**，且 `package.json` 的 `exports` **显式导出** `"./cordis.patch.yml"`。
- **★ patch 全文【读，逐条】**：
  1. **禁用 4 个既有行**：`tool-subagent-control`／`tool-subagent-list-agents`／`tool-subagent`／`tool-subagent-fork` 各 `disabled: true`（`cordis.patch.yml:4-13`）；
  2. **插入 3 行**（同一文件 `:15-31`）：`agent-team`（带上面那 5 个 config 键）／`tool-agent-team`（`freshProvider`／`forkProvider`）／`ui-agent-team`；
  3. 文件头注释【读】：*"Apply after dsh-base so these replacements keep direct delegation and coordination on the Team tools."*（`:1-2`）⇒ ★ **它的语义是"替换既有面"，且声明了应用顺序（after dsh-base）**。

### 4. `dsh-experimental-client-ui-agent-team`（0.2.0-rc.2）—— **纯 UI**

- **提供什么【读】**：`lib/index.js` 240 B，只有 `function apply() {}` ＋ `export { apply }`，注释逐字 *"Pure host half for the browser-discovered Agent Teams UI plugin."* ⇒ 实体在 **`./client`**（`lib/client.js` 25 390 B）＋ 一个 **Host RPC domain**（注释原文）。

---

## ① vmu 缺的（官方有、vmu 没有）

| # | 缺什么 | 证据 | **落点（红线判据）** |
|---|---|---|---|
| A1 | **随包携带的"profile patch"作为一个可导出工件**：官方把"**禁用 4 行 ＋ 插入 3 行 ＋ 带 config**"做成一个包的 `cordis.patch.yml`，并**显式声明应用顺序**（after dsh-base） | `<PKGS>/dsh-experimental-agent-team-profile/cordis.patch.yml`（全文，818 B）；`package.json exports["./cordis.patch.yml"]` | ★ **pack/机制**（部署期装配）。**不要**进内核：内核若"会禁用别人的行"就是把机制搬进框架 |
| A2 | **per-scope 的 prompt 段注册**（不是全会话一个段）：官方在**精确 Agent scope** 里注册 `team:policy` | `tool-agent-team/lib/index.js:237-238` | ★ **能力/挂点进内核**（"在一个 scope 内挂 prompt 段"是接缝）；**段的文本＝pack/中间件** |
| A3 | **UI 作为独立包、主机侧只留薄壳**（host half `apply(){}` ＋ browser 面 ＋ Host RPC domain） | `client-ui-agent-team/lib/index.js`（240 B，全文）＋ `lib/client.js` 25 390 B | **pack/扩展（UI）**，**明确不进内核** |

## ② vmu 有但做得差的（同一件事，官方更稳/更清楚）

| # | 同一件事 | 官方怎么做（证据） | vmu 现状（我方读到的） | **落点** |
|---|---|---|---|---|
| B1 | **"等待"的规范语义** | 把 `ACTIVE_WAIT_STATUSES = {running, provisioning}` 与 `NO_ACTIVE_PEER_MESSAGE`（"wait_agent cannot make progress or wake inactive teammates… re-list then send_message"）**写在一处**，工具照此执行 | vmu 有 `activity.js`（future-only 等待器）与 `wakeFailurePolicy` 一类旋钮，但**"什么算 inactive／能不能推进"没有一句规范陈述**（我未找到等价单点） | **能力＝内核**（wait 只能观察调用之后的变化、无活跃对等体时立刻 `noProgress`）；**规则文本＝pack/中间件** ★ 官方把规则写进工具代码＝**policy-in-code**，vmu 的红线要求它住 pack |
| B2 | **"已投递即持久、不要重发"** | `POLICY` 逐字："a successful send is already durable when its result says queued; **do not resend it**" | vmu 有 `idempotency.js`／`mailbox` 的 ticket 与 `VMU_*_ID_TAKEN` 一类具名拒，但**这句话背后的"已持久"承诺**分散在多个模块 | **能力＝内核**（投递接缝＋票据）；**语义陈述＝pack**（把"不要重发"写进给模型的策略文本） |
| B3 | **上限/配额以"一处命名"给出** | patch 里 5 个键一次列全：`maxMembers`／`maxTasks`／`maxPendingMessagesPerMember`／`maxMessageBytes`／`disposalTimeoutMs` | vmu 的对应量散成**设置键**（如 `vmu.limits.maxLiveMembers`、`vmu.tasks.maxOpenTasks`…，且带 owner/hot 声明） | ★ **这一格 vmu 反而更好**（热改＋声明＋归属）⇒ **只需借"一处列全"的形状**，落点仍＝**pack/中间件（设定值）**，能力在内核 |

## ③ 值得借鉴的（形状/纪律，不必照抄成能力）

| # | 借鉴什么 | 证据 | **落点** |
|---|---|---|---|
| C1 | **"一个服务 ＋ 一个投影 ＋ N 个 scope 内工具"的三件套形状** | `agent-team/lib/index.js:1704`（服务 `agentTeams`）／`:1731`（session projection）／`tool-agent-team` 的 9 个工具 | **服务＋投影＝内核（能力）**；**工具面＝host 适配器**；**策略＝pack** ⇒ 与 vmu 现有分层同形，可作为**核对表** |
| C2 | **"替换既有面"必须由部署声明，不由框架决定** | patch 头部注释 *"keep direct delegation and coordination on the Team tools"* ＋ 禁 4 行 | **pack/机制** ★ 直接对应 vmu 的 preset/overlay：**框架只给接缝，替换谁由 pack 说** |
| C3 | **thin host half ＋ 真实现在 browser 导出**（host 侧 `apply(){}`） | `client-ui-agent-team/lib/index.js`（240 B） | **pack/扩展（UI）** |
| C4 | **配置键与默认值写在包的 `Config`（schema）里，而不是散读** | `tool-agent-team`：`z.object({freshProvider: z.string().default("spawn"), forkProvider: …})`（`:17-20`） | **pack 声明**；★ 但内核要提供"读得到声明"的接缝 ⇒ 与 vmu `settings/schema.js` 的 `type/domain` **同题**（本轮 `task-149` 正在修"声明有执行点"） |

---

## ④ README 事实（【读】，`dsh-experimental-tool-agent-team/README.md`）＋ 官方**自陈的局限**

- **工具数【读】**：README 头 `:2` 逐字 *"**Nine tools** that let the model create, message, and coordinate teammates…"* ⇒ **与我数到的 9 个工具一致**（`team:policy` 是 prompt 段，不计入）✓
- **命名冲突＋必须显式禁用【读】**：`:12` *"It **replaces legacy subagent controls with the same tool names**, so compositions that need both must **disable the legacy definitions**."* ⇒ 与 patch 里禁 4 行（`cordis.patch.yml:4-13`）**互为印证**。
- **依赖形态【读】**：`:28` *"Add this package **on top of** `@deepseek-ai/dsh-experimental-agent-team`…"*；`:36` *"…durable session storage, the team domain package, and this package"* ＋ **只有两个可选设置**（`freshProvider`／`forkProvider`，`:38-44`）。
- **固定策略＝"只有显式要求才组队"【读】**：`:32` *"The **fixed policy** creates teammates only when you explicitly ask for a team or teammates, so ordinary tasks never trigger delegation on their own."*
- **不稳定性自陈【读】**：`:12` 末句 *"published under its **experimental name** and provides **no stability guarantee**"*。

**★ 官方自陈的局限（逐条【读】，`README.md:138-149`）** —— 这才是本节最有价值的部分，因为它**替我们说了"它做得差的地方"**：

| 官方局限（逐字要点） | 行 | 对 vmu 的含义 ＋ **落点** |
|---|---|---|
| **One-shot child tool visibility**：进程内一次性子代理**在发布之后**才拿到 subagent descriptor ⇒ Team 安装可能**把它们误当 Leads** 并暴露 Team 策略与工具；descriptor 辨认后调用会被拒；**修正安装时序被 defer** | `:142` | ★ **这正是我这一整个会话在打的"视图↔事实"同类**（谁在什么时刻被算作成员／什么被算作已装载）。vmu 的教训可直接借用：**身份未定前的可见性要具名**（= 我们这几轮的 `faces.sources`／`packErrors`／`ready()` 落定）。**能力＝内核**（成员/身份接缝＋时序可观测）；**策略＝pack** |
| **Prompt policy is coordination, not confinement**：它**不能**阻止 Bash／外部进程写重叠文件 | `:146` | ★ 与 vmu"写范围是 advisory、不是锁"**同构**；vmu 已把这条写进策略文本（我自己的 system prompt 里就有）。⇒ **值得借鉴的是"把这条当具名边界写出来"**，**落点＝pack（策略文本）** |
| **No autonomous team creation**：普通任务不触发委派，除非用户显式要求 | `:147` | 与 vmu"零机制默认＋只有声明才动"**同向**；**落点＝pack（触发政策）**，能力（触发接缝）在内核 |
| **No Web controls**：浏览器端名册／任务板展示**不在本 runtime 包内**（＝在 client-ui 包） | `:148` | 与 `client-ui-agent-team` 的分包一致；**落点＝pack/扩展（UI）**，**不进内核** |
| **Experimental prototype with no stability promise**：schema 可以自由变 | `:149` | 提醒：**不要**把它的 API 名当稳定契约抄进 vmu；引用时须带版本 `0.2.0-rc.2` |

- 另：`dsh-experimental-agent-team/README.md` 的章节目录【读】＝ `Summary`(:10)／`Table of Contents`(:14)／`Use this package`(:26)／**`Understand the implementation`(:94)**／`Further Exploration`(:162)／**`Model Experience`(:181)**／`Known Limitations and Deferred Work`(:197)` ⇒ ★ **`Model Experience`(:181) 与它的局限节(:197) 是本任务最该读的两节，本轮未读**（见未核清单）。

## 未核清单（**每条写明想核什么、卡在哪**）

1. **四个包的 README（共 ≈42 KB）与 `README.i18n.yaml` 我一页都没读** ⇒ 官方自述的"提供什么／怎么用"尚未纳入；本条**优先**，因为它最便宜。
2. `agent-team/lib/index.js`（72 893 B）**只读了 `:1704/:1731` 两处**；`Config` 的完整 schema（patch 给了 5 个键，但**未读它在 schema 里的类型/默认值**）未核。
3. `lib/invariant.js`（18 215 B）未读 —— 名字暗示**不变量**，可能正对 vmu 的"断言/不变量"纪律。
4. `lib/types/*`（尤其 `mailbox`／`roster`／`task-board`／`task-graph`／`projection`）**只看了文件名与字节数**，语义未读 ⇒ "官方把什么当第一等公民"目前只有**字节数级**证据。
5. `client-ui-agent-team/lib/client.js`（25 390 B）未读 ⇒ UI 的交互面（是否提供 team 面板／任务板视图）**未核**。
6. **npm 页面未访问**（本地实现优先，故本轮未上网）⇒ 版本/发布说明（"alpha" 的确切状态）**【未核】**。
7. `agent-team` 服务的**公开方法名**未核（只知类名 `agentTeams`）⇒ "vmu 与它的服务面逐项对照"这一格**还不能下结论**。

