# Phase 11 · 收尾前的完整 SLV 真机实测 —— 判据达成，以及 root 反馈的 31 条问题分诊

> ★ **真机结论（`HEAD` = `38be56a2`，394s，115 tool calls）**：★ **主 run 内 `cast:true`**；★ **`slv-inspect` 1 session / 0 RED**；★ **`VMU_TURN_UNKNOWN_FIELD` = 0**；★ **idle 路径走通**（beat#2 `emitted:true`、`afterMs:3000`、`elapsedMs:17538` ⇒ 新增 `m2`，`reason:"idle for 17538ms >= stall threshold 9000ms"`）。
> ★ **所以用户要求的"跑到结题"这一条：达成。** ★ 而 **"所有逻辑、功能、提示词交互与内容都正常合理" 这一条：未达成** —— ★ 真机代理如实报了 31 条，★ 下面逐条分诊。
> ★★ **本文档是【分诊】，不是【已修】**。★ 每条的处置写在这里，★ 未修的一律写明"未修"。

## §1 分诊总表

| ★ 类 | ★ 条 | ★ 处置 |
|---|---|---|
| **A 工具/参数** | 1–11 | ★ 其中 **6 条为真缺陷**（3/4/6/7/8/9），★ 2 条为**文档不足**（1/2），★ 3 条**设计/环境**（5/10/11） |
| **B 提示词** | 12–20 | ★ 其中 **6 条为真缺陷**（12/13/15/16/17/20），★ 2 条为**能力缺口即文档**（14/18），★ 1 条为**诊断面**（19） |
| **C 拒绝/不可修** | 21–24 | ★ **环境/改配置**（21/22），★ **诊断不清**（23），★ **语义正确但没提示**（24） |
| **D 绕路** | 25–28 | ★ **都是 A/B 的症状**，★ 不单独处理 |
| **E 语义含糊** | 29–31 | ★ **29 与 30 是真缺陷**（同一条的两面），★ 31 是 **paper render 缺陷** |

## §2 ★★★ 真缺陷（★ 必须修；★ 按根因归类，★ 修一条覆盖多条）

| ★ 根因 | ★ 覆盖 | ★ 症状（root 原话要点） |
|---|---|---|
| ★★ **R1 v5 面能力不完整** | #1 #15 #25 #26 | `vibe_v5_task_update` 无 assign/transition；`vibe_v5_meeting` 只有 open、无 summary/close ⇒ 只能绕到 vmu 面 ⇒ **两面同名不同能力** |
| ★★ **R2 静默/错误的参数处理** | #3 #4 #6 #7 #8 | `status:'all'` 静默 0；`task_get` 无 brief 时整条拒；`lean_archive` 的 `from` 顶掉 `file`；`mathjobs jobsDir` 返回**字符拆对象**；`prioritize` 实际不改 |
| ★★ **R3 计数/落库错误** | #9 #17 #20 | `records list` 同 id 重复 9 次且 `total` 重复计；`report` 把已关闭会议算进 `openMeetings`；turn 回执 `progress` 二次落库且丢 owner |
| ★★★ **R4 提示词空槽与占位** | #12 #13 | `# v5r-effective-tools-member` **仍是占位**、与 researcher 段矛盾；`本所「」`、`你的雇主：`、`**院士 **`、`m =  名`、roster 空表 |
| ★★ **R5 诊断/提示不一致** | #16 #19 #23 | 失败 hint 指向**不存在的** `stderrTail`；`tool_help` 两轮后仍说 no live Agent；PDF 三个不同码无法判断 |
| ★★ **R6 paper render** | #31 | 全文复制进每个小节、`##`→`\section*`、`**` 原样进 tex、页眉硬写"编辑：academician" |
| ★★ **R7 会议结果不回写** | #29 | 投票板"通过"不落到 motion（`mo1` 仍 `seconded`、`tally for:0`） |
| ★★ **R8 idle 回执自相矛盾** | #30 | 顶层 `middleware:0, middlewareRan:0`，★ 嵌套 `idle.middleware:1` —— ★ **本阶段自己造成的**（见 §4） |

## §3 非缺陷（★ 设计或环境，★ 应写进文档而不是改代码）

| ★ 条 | ★ 判定 | ★ 依据 |
|---|---|---|
| #2 `in_progress` 不被接受 | ★ **状态名是 `doing`**（`TASK_STATES` 冻结五态）⇒ ★ **拒绝是对的**，★ **但 hint 应列出合法值**（★ 半个缺陷） |
| #5 Lean 相对路径 | ★ **沙箱边界** ⇒ ★ 应**具名拒并说明**，★ 不是 bug |
| #10 `bx-2` 起始 | ★ **id 计数器**（★ `bx-1` 可能已被更早一次 open 用掉）⇒ ★ 需核，★ 非静默 |
| #11 `wait` 无 peer 唤醒 | ★ **已知接缝缺口**，★ 已文档化 |
| #14 规章说可提议开会但无工具 | ★ **提示词承诺了能力缺口** ⇒ ★ **改提示词**（★ 不承诺），★ 不是加工具 |
| #18 overview 无 kind | ★ 可加字段（★ 廉价增强） |
| #21 mathtools 要 host seam | ★ **环境**：`bridge.hasSpawnSeam:true` 但 **mathtools 用的是另一个 seam** ⇒ ★ **hint 应说清"本会话无路"** |
| #22 mathjobs 引擎空 / 键是 H2 | ★ **环境 + 需重启** ⇒ ★ **hint 应说"改这个键要重启"**（★ 现在 `appliesAt` 有说，★ 但 root 没看到路） |
| #24 complete 需先 doing ＋ 重读 revision | ★ **语义正确**，★ 但**回执应给下一步**（★ 半个缺陷） |

## §4 ★★★ 一条本阶段自己造成的（#30）

★ **idle 回执**：★ 顶层 `middleware:0 / middlewareRan:0`（★ 属于 `control/heartbeat`），★ 嵌套 `idle.middleware:1`（★ 属于 `control/idle`）。
★★ **这两个数【本来就不该相等】** —— ★ 本轮加 `idle.middleware*` 就是为了区分它们。★ **但顶层两个字段没有被重命名**，★ 所以 root 读成了"自相矛盾"。
★★★ **处置**：★ **根因是命名，不是数值**。★ 应把顶层改名为 `heartbeat.middleware*`（★ 或给顶层加 `note` 说明它属于哪个钩子），★ **保留 `idle.middleware*`**。★ **这条记在这里，★ 未修**。

## §5 ★★★ 结论：★ **判据达成，但"无误"未达成** —— ★ 因此 goal **不能**标记完成

★ **达成的是**：★ 完整流程跑到 `cast:true`、★ `slv-inspect` 0 RED、★ `UNKNOWN_FIELD` 0、★ idle 路径正反都验。
★★ **未达成的是**：★ **用户要求的"所有逻辑、功能、提示词交互与内容都正常、合理"** —— ★ **真机代理报出 31 条，★ 其中 17 条被判定为真缺陷**（★ R1–R8）。
★★★ **所以下一阶段的第一件事不是"再跑一次真机"，★ 而是【修 R1–R8】** —— ★ 修完再跑，★ 才算"无误"。

★ **修复的优先顺序**（★ 按"用户最可能先撞到"排）：
1. ★★★ **R4 提示词空槽与占位**（★ 每个会话第一眼就看到）
2. ★★★ **R2 静默/错误参数处理**（★ 7 个面，★ 且都是"静默"类）
3. ★★ **R3 计数/落库错误**（★ 数据正确性）
4. ★★ **R1 v5 面能力不完整**（★ 6 处绕路）
5. ★★ **R5 诊断不一致**、★ **R7 会议回写**、★ **R8 命名**、★ **R6 render**

---

## §6 修复进展（★ 持续更新；★ 未修的一律仍标"未修"）

### §6.1 已修（3 条）

| ★ 条 | ★ 根因 | ★ 修法 | ★ 可指到的位置 |
|---|---|---|---|
| ★★ **#12** | ★ 占位段**解释**误导 | ★ 改成**说清原因**（宿主只给有席的 agent 写清单；root 无席）＋**保住标记词**（内核靠它找段） | ★ `packs/v5r/prompts/v5r-core.js` `v5rEffectiveToolsText` |
| ★★ **#13** | ★ 缺值渲染成**空槽**，★ 读者无法分辨"缺值"与"格式坏" | ★ `report` 模式改成渲染 **`〔未提供：<key>〕`** | ★ `kernel/prompt/index.js:493-505` |
| ★★ **#7** | ★ **把原始值摊进对象**：`Object.assign({ok,action}, 'M:/vm/Jobs')` ⇒ **`{0:'M',1:'/',…}`** | ★ **先判类型**：非对象 ⇒ **命名成 `result`** | ★ `tools/mathjobs.js:32` |

### §6.2 ★★★ #7 是**系统性**的，★ 而只修了一个面 —— 这是本轮最重要的发现

★ `Object.assign({ ok: true, action }, await <service>[action](...))` 这个形状在 `vibe-math-vmu/tools/` 里**约 250 处**。
★★ ⇒ ★ **任何返回【非对象】的服务方法**（★ 字符串、★ 数字、★ 布尔、★ 数组）★ **都会被摊成字符/索引对象**，★ 而回执**看起来像数据**。
★★★ **本轮只修了 `mathjobs`**（★ 因为真机报了它）。★ **剩下的面未修** —— ★ 它们**有没有实际泄漏取决于各自服务方法的返回类型**，★ **未逐一测量**。

★★★ **正确的系统性修法**（★ 下一阶段第一步）：
1. ★ **抽一个共享的 `receipt(action, result)`**（★ 放 `kernel/receiptbounds.js` 旁），★ **非对象 ⇒ 命名成 `result`**；
2. ★ **把这 250 处改成调用它**（★ 或**只改真正返回非对象的那些** —— ★ 先**量**再改）；
3. ★★ **加一条门禁**：★ **每个服务方法在测试里返回的类型**必须是对象，★ 或 ★ **扫描 faces 里"直接摊开 `await`"的形状并要求具名例外** —— ★ 否则**下一次又会有面泄漏**。

★ **不写"已修"** —— ★ 因为 **250 处里只有 1 处修了**，★ 而**假称修完正是本阶段一直在消灭的东西**。
### §6.3 已修 #3 ＋ #2 的一半（★ 同一条改动）

★ **#3 `vibe_v5_task_list {status:'all'}` 静默 0** —— ★ 根因在 `kit/extras.js`：★ `'all'` 被当成**字面状态**去比 ⇒ 一行不匹配 ⇒ **静默 0**，★ **而同一个回执里 `total:2` 还告诉你有两条**。
★ **修法**：★ `'all'`／`'*'` ⇒ **不筛**（★ 明写，不静默）；★ **未知状态 ⇒ 具名拒并列出合法值**。
★★ **这同时修了 #2 的那一半**：★ 拒的 hint 现在写着 **`valid: all, open, assigned, doing, done, cancelled — note the state is "doing" (there is no "in_progress")`** ⇒ ★ **读者不用再猜**。
★ **实测**：★ `all` ⇒ **2/2**；★ `doing` ⇒ 1；★ `bogus` ⇒ **具名拒**。

### §6.4 已修计数：**4 条**（#12 #13 #7 #3）＋ **#2 的一半**；★ **未修 13 条**
### §6.5 ★★★ #7 同族：★ **运行时探针找到了 11 个**，★ 其中 **4 个是真实面 action**

★★ **静态扫描不可靠**（★ 只出 5 个、★ 4 个是误报、★ **看不见被报的那个**，★ 因为 `jobsDir` 返回计算值）。
★★★ **正确工具是运行时探针**：★ `createKernel` 后**遍历每个服务的每个方法**，★ 用 300ms 超时调一次，★ 记返回类型。★ **结果**：

| ★ 服务方法 | ★ 返回 | ★ 是否面 action |
|---|---|---|
| ★ `mathjobs.jobsDir` | ★ string | ★ **是**（★ 真机报的，★ **已修**） |
| ★ `mathjobs.mirrorRel` | ★ string | ★ **是** —— ★ **同一个 `svc[action]` 路径，★ 已被类型守卫覆盖** ✓ |
| ★★ `bidding.fingerprintOf` | ★ string | ★ **是** —— ★ **本次修** ✓ |
| ★★ `bidding.normalizePlan` | ★ string | ★ **是** —— ★ **本次修** ✓ |
| ★ `budget.perTaskShare` | ★ number | ★ 否（★ 内部助手） |
| ★ `clockguard.now` / `clockSource` | ★ number | ★ 否 |
| ★ `meetings.tier` / `isLight` | ★ string / boolean | ★ 否 |
| ★ `chat.speakCount` | ★ number | ★ 否 |
| ★ `turn.awaitingCaller` | ★ boolean | ★ 否 |

★★ **所以真正会泄漏的面是 4 个，★ 全部已修**（★ `mathjobs` 两个靠同一守卫、★ `bidding` 两个本次修）。
★★★ **但探针是"无参调用"** —— ★ **有参方法（207 个抛拒/超时）没被覆盖** ⇒ ★ **它们的返回类型仍未测**。★ 这是**已量过的边界**，★ 不是"没问题"。

★ **下一步（★ 系统性）**：★ 给 `tools/` 抽**共享 `receipt(action, value)`** ＋ ★ **一条门禁**（★ 扫描"直接摊开 `await`"的形状，★ 要求具名例外），★ 这样**新面不会重犯**。
### §6.6 已修 #6（★ 静默遮蔽）

★ **`lean_archive` 的 `from` 顶掉 `file`** —— ★ 根因 `kit/extras.js:169`：★ `const file = has(args.from) ? str(args.from) : (has(args.file) ? …)` ⇒ ★ **两个都传时 `from` 静默胜出，★ `file` 被忽略而调用者不知道**。
★★ **修法**：★ **一个名字可以；两个名字【相同】可以；两个名字【不同】⇒ 具名拒**，★ hint 里写明"过去会优先 `from`、静默忽略 `file`，所以现在拒"。
★ **实测**：★ `from=X, file=Y` ⇒ **`VMU_INVALID_ARGUMENT`** ✓；★ 只传一个 ⇒ 正常；★ 两个相同 ⇒ 正常。
★★ **这与"静默 no-op"是同一个失败**：★ **调用者相信了一件没发生的事**。

### §6.7 已修计数：**8 条**（#12 #13 #7 #3 #6 ＋ **#2 一半**）；★ **未修 9 条**
### §6.8 已修 #4（★ 可选的部件不该让整条读失败）

★ **`task_get` 无 brief 时整条拒** —— ★ 根因不在 `toolTaskGet` 的分支（★ 那里 `brief = null` 是好的），★ 而在 **`kernel.tasks.briefOf(id)` 抛异常** ⇒ ★ **整个 handler 失败** ⇒ ★ **调用者读不到它刚被告知的那一行**。
★★ **修法**：★ **行与 brief 是两个事实** —— ★ 行在 id 命中时必然存在，★ **brief 可以合法地不存在**。★ 所以 **brief 查询失败 ⇒ 读成功、`brief: null`、★ 而 `briefNote` 记下原因**（★ `"brief lookup failed: VMU_NO_SUCH_OBJECT"`）。
★★★ **没有吞掉**：★ 失败原因留在回执里，★ 只是不再**用它的缺席去否决整条读**。
★ **实测**：★ 抛异常 ⇒ **ok=true + note**；★ 无 `briefOf` ⇒ **ok=true + 说明**；★ 有 brief ⇒ 正常带出。
### §6.9 #8（`prioritize` 实际不改优先级）—— ★ **诊断完成，改动【已回退】**，原因如实写

**诊断（★ 本轮查清，★ 这不是猜）**：
★ **`prioritize` 不是静默的** —— ★ 它的 `note` 与**工具描述**都明写"**kernel 没有改现有任务优先级的操作**"，★ 并把缺口登记在 **`V5R_NAMED_GAPS`** 里。
★★ **所以真缺陷是"能力在内核、★ 却没有到政策层"**：★ `kernel/tasks.js` 只在 `create()` 收 `priority`、★ `list()` 按它排序，★ **但没有改现有行的操作** ⇒ ★ 一个**声明了的能力缺口**。
★★★ **正确修法**（★ 本轮已实现并验证）：★ ① `kernel/tasks.js` 加 **`setPriority(id, priority, { expectedRevision })`**（★ 与其它变更同一套 compare-and-set ＋ `record('task-priority-set')`）；★ ② `prioritize` **真的应用**每个带 `priority` 的条目并回报 `from->to`；★ ③ 描述与 `V5R_NAMED_GAPS` 的陈旧条目同步删。

**为什么回退**：★ 改完后 **`vmu-v5r-tools` 有两处断言必须同步**（★ ① 旧的"**说它没被应用**"断言；★ ② **`V5R_NAMED_GAPS` 的条数被硬编码为 5**），★ **本轮预算不足以把它们改对并验证**。
★★★ **而留一棵红的树比留一条未修项更糟** ⇒ ★ **`git checkout` 回退全部改动**，★ **树回到 `3025ecfb` 的绿态**（★ v5r-tools 332/0、★ tasks 42/0、★ regen 16/16）。
★★ **下一轮照上面三步做即可** —— ★ 诊断、位置、与需要同步的两处断言都已指出。
### §6.10 已修 #8（★ 补上内核能力，★ 而不是改注释）

★ **`prioritize` 实际不改优先级** —— ★ 上轮诊断：★ 它**不静默**（★ note/描述/`V5R_NAMED_GAPS` 都写了缺口），★ **真缺陷是"能力在内核、却没有到政策层"**：★ 内核只在 `create()` 收 `priority`、`list()` 按它排序，★ **没有改现有行的操作**。
★★ **本轮完成三件套**：
1. ★ `kernel/tasks.js` 加 **`setPriority(id, priority, { expectedRevision, by })`** —— ★ 与其它变更**同一套 compare-and-set** ＋ ★ `record('task-priority-set')`
2. ★ `prioritize` **真的应用**每个带 `priority` 的条目并回报 **`from->to`**（★ 无 `priority` 的条目只是**位置声明**，★ 不改任何东西）
3. ★ **三处元数据同步**：★ 描述、★ `V5R_NAMED_GAPS` 删掉陈旧条目、★ `V5R_NAMED_GAP_CHECKS` 删掉对应检查（★ 它正是**防"缺口宣称腐烂"** 的那条 —— ★ 内核查到了它就该消失）
★★★ **四组断言随之更新**（★ 且都写明了为什么）：★ 旧的"回执说没被应用" ⇒ **"已应用且报 from->to"**；★ 缺口条数 `5→4`（★ 两处）；★ `docs/03` 的 `vmu.tasks` 契约补 `setPriority`（★ `audit-vmu-docs` **抓到**了它，★ 红了一条）。
★ **实测**：★ `applied[0].to === 1` ✓；★ **T1 = 401/401** ✓

### §6.11 已修计数：**9 条**（#12 #13 #7 #3 #6 #4 #8 ＋ **#2 一半**）；★ **未修 8 条**
### §6.12 #9（`records list` 同一 id 重复 9 次 / `total` 重复计）—— ★ **根因查清，改动【已回退】**

**根因（★ 查到行，★ 不是猜）**：★ `kernel/records.js:524` **接受调用方显式传入的 `id`**；★ `:531-533` 里
`records.set(id, rec)` **覆盖** 了 map 条目，★ 而 `order.push(id)` 与 `trackList(track).push(id)` **不做成员检查就再追加一次**。
★★ ⇒ ★ **索引数组每次写入就多一行重复**，★ 而 `list()`（`:586`）**按索引逐条投影** ⇒ ★ **同一记录被报成 9 条、`total` 也按 9 计**。
★★★ **写和读都没有说一句话** —— ★ 这既不是"数据有 9 条"，★ 也不是"写被拒了"。

**修法（★ 已实现并测过 `vmu-records` 269/0）**：
1. ★★ **显式 id 已存在 ⇒ 具名 `VMU_CONFLICT`**，★ hint 指向 `patch()`（★ 覆盖不是更新，★ 是调用方错误）
2. ★★ **push 前查重**（★ `order` 与 track 列表都是索引数组，★ 重复**从不携带信息**）
3. ★★ **读侧 `[...new Set(ids)]` 去重** ⇒ ★ **让旧代码写下的持久化重复自愈**

**为什么回退**：★ `vmu-v5r-tools` **崩了** —— ★ 有测试**依赖"同 id 覆盖"这个旧行为**（★ 它现在被具名拒绝）⇒ ★ **那处测试必须同步改**，★ 而**本轮预算不足以改完并验证**。
★★★ **留一棵红的树比留一条未修项更糟** ⇒ ★ **`git checkout` 回退**，★ **树回到 `7989ce97` 的绿态**（★ v5r-tools 332/0、★ records 269/0、★ regen 16/16）。
★★ **下一轮照上面三步做**，★ 并**先找出那个依赖覆盖行为的测试**（★ 它自己要改成"重复 id 被拒"）。
### §6.13 ★★★ #9 第二次尝试：★ **发现覆盖是【合法能力】**，★ 而仍有一处二阶交互未解 —— ★ 再次回退

**本轮最重要的发现（★ 它改变了修法）**：★ `vmu-v5r-tools:511-518` 的**指纹守卫测试**，★ **故意用同一个 record id 覆盖正文**来模拟"背后篡改"，★ 以断言渲染**必须具名阻塞**（`VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH`）。
★★ ⇒ ★★ **同 id 覆盖是【合法且被依赖的能力】，★ 不能拒。** ★ 上一轮那个 `VMU_CONFLICT` 修法是**错的**（★ 会砍掉一条真实特性）。

**所以修法收敛为两条（★ 不含拒绝）**：
1. ★ **push 前查重**（★ `order` 与 track 列表都是索引数组）；★ **覆盖照旧合法**
2. ★ **读侧 `[...new Set(ids)]`** ⇒ ★ 旧代码写下的重复**自愈**

★ 实施后：★ **`vmu-records` 269/0** ✓ —— ★ 但 **`vmu-v5r-tools` 331/1**：
★★ `★★ 正: the EXACT sample the prompts teach is ACCEPTED … - {"before":1,"after":1}` ⇒ ★ `countOf(kernel,'progress')` **在 put 前后都是 1** ⇒ ★ 而 `countOf` 走的是 `list({track, limit:500})` 的 `items.length`。

★★★ **这一步未解**：★ 一个**新 mint 的 id**不该被 `includes` 挡住，★ 所以「为什么 count 没涨」**还不清楚**。★ 可能的路：★ `list` 的 `cap`/`slice` 与我的去重叠加、★ 或该 track 的 `live` 过滤、★ 或 `progressBefore` 本身已被前序测试改变。
★★ **而我不猜** —— ★ **回退**，★ 树回到绿（★ v5r-tools 332/0、★ records 269/0、★ regen 16/16）。

★ **下一轮第一步**：★ **先回答"新 mint 的 id 为什么没让 count 涨"** —— ★ 用一个只调 `put` 再 `list` 的**最小探针**（★ 不跑整套），★ 再决定去重放在哪一层（★ `list` ／ `trackList` ／ `countOf`）。
### §6.14 ★★★★★ 已修 #9 —— **真根因是 `mint()` 与显式 id 撞车**，★ 两轮误判后找到

**真根因（★ 一句话）**：★ `kernel/ids.js` 的 `mint()` **只保证严格递增**，★ **它不知道某个号已被【显式 id 写入】占用**。
★★ 链条：★ `mint` 发出一个**已被占用**的 id（真机里是 `r-1`）⇒ ★ `records.set` **覆盖**了原记录 ⇒ ★ `order.push` 与 track push **再追加一行** ⇒ ★ **数据被毁、索引多一行、而写和读都不说话**。
★★★ **所以"同一 id 重复 9 次"是这条链的症状**，★ 不是"列表逻辑写错了"。

**修法（★ 三层，★ 由内到外）**：
1. ★★★ **`mint` 循环到取到空闲 id**（★ `do { id = mint(...) } while (records.has(id))`）—— ★ **这是根因修复**：★ 不撞车 ⇒ 不覆盖 ⇒ 不加重复行
2. ★★ **push 前查重**（★ 显式同 id 重写**仍然合法** —— ★ 见 §6.13 的发现，★ 指纹篡改测试依赖它）
3. ★★ **读侧 `[...new Set(ids)]`** ⇒ ★ 旧代码写下的重复**自愈**

**★★★ 而那个 `before:1 → after:1` 的测试，★ 原本是靠【重复行】才绿的**：
★ 它 put 一个**新 mint** 的记录，★ 期望 `count +1`；★ 而旧代码里 `mint` 撞上已有 id ⇒ **覆盖 ＋ 重复行** ⇒ `items.length` **恰好 +1** ⇒ **绿**。
★★ **我的修法把这条假绿暴露了**，★ **但它同时也让它变真**（★ 不再撞车 ⇒ **真的 +1**）⇒ ★ 现在 **`vmu-v5r-tools` 332/0** ✓
★★★★ **这是本阶段第三次"测试与代码犯同一个错"** —— ★ **假绿不只是断言写错，★ 还可以是"被测系统的一个 bug 恰好补上了断言的期望"**。

★ **GATES**：★ `vmu-records` **269/0**、★ `vmu-v5r-tools` **332/0**、★ **T1 = 401/401** ✓

### §6.15 已修计数：★ **10 条**（#12 #13 #7 #3 #6 #4 #8 #9 ＋ **#2 一半**）；★ **未修 7 条**
### §6.16 已修 #17（★ "还开着的会议"里混进了已关闭的）

★ **根因**（`kernel/meetingmarker.js:75`）：★ 函数名与文档都说 **"WHICH MEETING IS STILL OPEN"**，★ **而过滤条件只检查 `id` 是字符串** ⇒ ★ **`closed` 的会议也被报成"还开着"**。
★★ 真机里 ★ `vibe_v5_report` 说"会议：开着的 2 场"，★ 而 `m1` 已 `closed`、★ 只有 `m2` 是 `open` ⇒ ★ **代理在同一个回执里就看到了矛盾**。

★★★ **修法经过一次收窄（★ 测试纠正了我）**：★ 我第一版过滤成 **只留 `open`** ⇒ ★ **`vmu-resume-e2e:14b` 立刻红了** —— ★ 它断言 **`lapsed` 与 `open` 必须【可区分】**（★ 靠 `state` 字段）。
★★★★ **而它是对的**：★ 域状态有三种 `open|lapsed|closed`，★ **`lapsed` 是"待复会"，★ 仍然需要被看见**；★ **该排除的是【已经结束】的 `closed`**。
★ 最终：★ **排除 `closed`**，★ `lapsed`/`open` 都留着且带 `state`；★ **并报 `readBack` 与 `closedCount`** ⇒ ★ **"一个开着"与"一个开着一个已关"可区分**，★ 不是静默丢弃。

★ **实测**：★ `[{id:'m1',closed},{id:'m2',open},{id:'m3',lapsed}]` ⇒ **`meetings: [{m2,open},{m3,lapsed}]`**、★ `readBack=3`、★ `closedCount=1` ✓
★ **GATES**：★ resume-e2e **108/0**、★ meeting-domain **10/0**、★ meetings **193/0**、★ v5r-tools **332/0**、★ **T1 = 401/401** ✓

### §6.17 已修计数：★ **11 条**；★ **未修 6 条**（#1 #15 #16 #19 #20 #23 #29 #31 —— ★ 其中 #29/#31 同属 R7/R6）
### §6.18 #20（`progress` 二次落库 ＋ 丢 owner）—— ★ **只查清一半，★ 改动已回退**

**查清的（★ `owner: null`）**：★ 派发器（`kernel/turn/index.js:1078-1104`）**每字段一次调用**（★ 循环干净），★ 而它把成员的 `progress` payload **原样**传给 `records.put` ⇒ ★ payload 里**没有 `by`** ⇒ ★ **记录丢了归属**，★ 而**归属在这一层是已知的**（`turn.member`）。
★ 修法（★ 已实现）：★ 当 `face==='vmu.records' && op==='put'` 且 payload **未自带** `by` 时，★ **注入 `by: turn.member`**（★ payload 自己写了作者就**不覆盖**）。

**而 `vmu-turn` 崩了** —— ★ 有断言**固定了"传给面的 payload 形状"** ⇒ ★ 注入 `by` 让它不匹配。★ **那处断言必须同步改**，★ 而**本轮预算不足以改完并验证** ⇒ ★ **回退**，★ 树回到 `c9c688ce` 的绿态（★ vmu-turn **186/0**、★ v5r-tools **332/0**、★ regen 16/16）。

**★★ 未查清的那一半**：★ **"同一内容两条记录"** —— ★ 派发循环每字段一次，★ 所以二次落库**不在这段循环里**。★ 候选：★ ① 成员**同时**调了 `record_progress` 工具并写了回执字段（★ 那是成员行为，★ 不是缺陷）；★ ② 某个**重试路径**重放；★ ③ `dispatches` 里同一字段出现两次。
★★ **要判定得看成员那一轮的完整 transcript** —— ★ 而真机报告说"成员完整 transcript 未逐条人工读" ⇒ ★ **这是下一轮要补的证据**，★ 不是靠猜能定的。
### §6.19 已修 #16（★ hint 指向读者看不到的字段）

★ **根因**（`kit/paper.js:384`）：★ PDF 失败的 hint 写 **"把 `stderrTail` 交给人看"**。
★★ 而 `:405` **确实把 `failure.stderrTail` 挂在这条错误上** ⇒ ★ **错误对象上有它**。
★★★ **问题在【回执层】**：★ 工具回执**只转述 code/message/hint**，★ **宿主不转述自定义错误字段** ⇒ ★ **读者被指向一个已经被压平掉的字段**。
★ **修法**：★ hint 现在说**回执带什么**（★ `code/message/hint`）、★ **`stderrTail` 在哪**（★ 这条错误上，★ 宿主不转述）、★ **以及能做什么**（★ 把 message 交给人，★ 或手工重跑该 `.tex`）—— ★ **不再指向一个读者拿不到的名字**。
★ **GATES**：★ v5r-tools **332/0**、★ latex **11/0**、★ turn **186/0**、★ regen 16/16、★ check-docs PASS、★ preflight PASS ✓

### §6.20 已修计数：★ **12 条**；★ **未修 5 条**（#1 #15 #19 #20半 #23 #29 #30 #31 —— ★ 归入 R1／R5／R7／R8／R6）

★ **另**：★ 本轮查过 **#15**（★ 提示词要求 `v5_meeting summary/close`）—— ★ **静态提示词里没有这句**（★ 应来自运行期拼装）⇒ ★ **未找到廉价修法，留待下一轮**；★ 不写"已处理"。
### §6.21 #23（PDF 三种错误码无法判断）—— ★ **根因查到，改动回退**

**根因（★ 查到行）**：★ `kit/paper.js:328` 的 `PaperArtifacts` **静态断言**：★
`code: PDF_NEEDS_KERNEL` ＋ `why: 'this kernel has no xelatex/pdflatex/latexmk face (measured: kernel/ has no such spawn caller)'`。
★★★ **那是一个【关于运行期事实的静态宣称】** —— ★ 而且是**一次测量写死在字符串里**。
★★ 真机里：★ `env probe` **探到了 xelatex**、★ 代理去 render、★ 拿到一个 PDF 码 ★ **却无法判断是"引擎没接"还是"编译报错"** —— ★ **正是这个分支制造的歧义**。

**修法（★ 已实现）**：★ `PaperArtifacts` **不再声称**引擎存不存在 —— ★ 它只报 **"pdf 尚未产出"**（★ `produced:false`），★ 并**明确说**：★ **引擎是否存在由 `render()` 决定**，★ 只有**那一次尝试**才能具名 `PDF_NEEDS_KERNEL`（★ 找不到引擎）★ 与 `PDF_FAILED`（★ 引擎跑了、编译失败）。

**为什么回退**：★ `vmu-v5r-tools` **两处断言固化了那个陈旧宣称**（★ 一处是"NAMES the kernel capability"、★ 另一处经 `status` 间接触及）⇒ ★ 我改了第一处，★ **第二处仍未定位**，★ 而**本轮预算不足以继续** ⇒ ★ **`git checkout` 回退**，★ 树回到 `49e8d32f` 的绿态（★ v5r-tools **332/0**、★ latex **11/0**、★ regen 16/16）。
★★ **下一轮**：★ 按上面这条修，★ 并**先找出 `status` 那条断言**（★ 它拿 `PaperArtifacts` 的 `pdf` 与 `render` 对齐）再一起改。
### §6.22 ★★★ 已修 #23 —— **产出物清单不该带错误码**

★ **修法定稿**：★ `PaperArtifacts` **只报"归档里有什么"** —— ★ `produced: false`，★ **刻意【不带 `code`】**。
★★★ **理由**：★ **一个 code 命名的是【失败】**，★ 而 **"pdf 还没写"不是失败**。★ **只有 `render()` 能命名** `PDF_NEEDS_KERNEL`（★ 它去找过、★ 没找到引擎）★ 与 `PDF_FAILED`（★ 引擎跑了、★ 失败了）。
★ `why` 现在**说清三个事实的归属**：★ 归档里有什么（本视图）、★ 宿主上有什么（`env probe`）、★ 引擎存不存在（**只有 render 能答**）。

★★ **两处断言同步更新**（★ 都在 `vmu-v5r-tools`）：★ `artsBefore.pdf`（原断言 `code===PDF_NEEDS_KERNEL` 且 `needsKernel` 含 `LaTeX`）★ 与 `statusAfterFinal.pdf`（原断言 `code===PDF_NEEDS_KERNEL`）⇒ ★ 现在都断言 **`produced===false` 且 `code===undefined`**，★ 并在注释里写明"★ **这是随修正更新的，★ 不是为了让测试变绿**"。

★★★ **而上一轮卡住的原因也记下来**：★ 我改的是 `ok(cond, message)` 的**第二个参数**（消息），★ 而**条件在第一个** ⇒ ★ 条件仍是旧的 ⇒ ★ 必然失败。★ **这类"改错参数位"是本阶段第 N 次由自己的探针/测试纠正**。

★ **GATES**：★ **T1 = 401/401**（★ 337 套件 ＋ 64 探针）✓ ★ v5r-tools **332/0** ✓

### §6.23 已修计数：★ **13 条**；★ **未修 4 条**（#1 #15 #19 #20半 #29 #30 #31 —— ★ 归入 R1／R5／R7／R8／R6）
### §6.24 #19（`tool_help` 两轮后仍说 `no live Agent (session=(none learned yet))`）—— ★★★ **根因定位：一条【内核写了、面从不走】的路径**

**根因（★ 一句话）**：★ `packs/v5r/tools.js:239` 调用
`kernel.toolsView({ member: str(args.member) })` —— ★ **从不传 `agent`**。
★★ 而 `kernel/index.js:2497-2518` **写的就是为这种情况准备的路径**，注释原文：
> ★ *"CALLER AGENT FIRST: inside a one-shot member turn the memberSession map may not be learned yet, but the tool already runs on that Agent — its own schemas are the authoritative visible set."*

★★★ **⇒ 那条 `agent.ctx.tools.schemas(scope)` 分支是【死代码】**（★ `agent` 恒为 `null`，★ 函数签名默认 `agent = null`）⇒ ★ **永远落到 provider 分支** ⇒ ★ **provider 说 "no live Agent for member … (session=(none learned yet))"**，★ **哪怕成员已经跑了两轮**。

★★★★ **这是一个特别值得记的形状**：★ **内核为解决某个问题写了机制，★ 而唯一的使用者从不把那个参数传进去** ⇒ ★ **机制存在、★ 注释详细、★ 行为却是旧的**。★ 这**不是"没实现"**，★ 是 **"实现了但没接线"**（★ 与 AGENTS.md §7.3 "验证宣称"同源：★ **宣称写得很具体，★ 而它可以被测量**）。

**为什么本轮没改**：★ 要让 `agent` 到达面，★ 需要**跨 `host.js`（注册面）→ 面的处理器 ctx** 的管道改动 ⇒ ★ 而本轮预算不足以**改完并验证**（★ 本阶段已三次因"改了一处、★ 另两处断言随之红"而回退）。
★★ **下一轮的做法**：① ★ 先查清**面处理器的第二个参数到底由谁填充**（★ `toolHelp(args, { kernel })` 里的 `kernel` 已经被填上，★ 所以那条管道**存在**，★ 只是**没带 agent**）；② ★ 把 `agent` 加进同一处 ctx；③ ★ 面里把它转给 `toolsView`；④ ★ 断言：★ **一个跑过回合的成员，★ `tool_help` 必须返回 `source:'caller'` 而不是 provider 的拒绝**。
### §6.25 ★★★ 已修 #19 —— **同族里就有正确写法**

★ **根因**：★ `packs/v5r/tools.js` 的 `toolHelp(args, { kernel })` 调用 `kernel.toolsView({ member })` ★ **从不传 `agent`** —— ★ 而 `kernel/index.js:2497` **专门为这个场景写了 CALLER AGENT FIRST 分支**（★ 注释原文：*"the tool already runs on that Agent — its own schemas are the authoritative visible set"*）⇒ ★ **默认 `agent = null` ⇒ 该分支是死代码** ⇒ ★ 永远落到 provider ⇒ ★ 报 `no live Agent (session=(none learned yet))`，★ **哪怕成员跑了两轮**。

★★★ **而正确写法【就在同一个仓里】**：★ `tools/member-tools.js:29-31` 做的正是这件事 ——
```js
const caller = exec && exec.agent ? exec.agent : null
const agent = caller && typeof caller.id === 'string' && !caller.id.startsWith('session-') ? caller : null
return kernel.toolsView({ member, agent })
```
★ 而 `host.js:1111` 的 `spec.run(args || {}, exec)` **正是把 `exec` 交到处理器的第二参数** ⇒ ★ **`exec.agent` 早就在那里**。

★ **修法**：★ `toolHelp` 改签名为 `(args = {}, exec = {})`，★ **从 `exec.kernel` 取内核**（★ 旧调用传 `{ kernel }` 仍成立 ⇒ **向后兼容**）、★ **从 `exec.agent` 取 caller 并按同族规则排除 root session**、★ **转给 `toolsView`**。
★★ **实测三种情形**：★ 带 agent ⇒ **`source:'caller'`** ✓；★ root session ⇒ **`agent: null`** ✓；★ 无 agent（旧调用）⇒ **不崩** ✓
★ **GATES**：★ **T1 = 401/401** ✓ ★ v5r-tools **332/0** ✓

### §6.26 已修计数：★ **14 条**；★ **未修 3 条**（#1 #15 #20半 #29 #30 #31 —— ★ 归入 R1／R3／R7／R8／R6）
### §6.27 已修 #1（★ `v5_task_update` 的词汇比台账窄）

★ **根因**：★ `kit/extras.js` 的 `TASK_UPDATE_FACE_OPS` 只有 `claim|reassign|complete|reopen|set_dependencies`。
★★ **而这两个"缺失"性质【不同】**：
- ★ **`assign` 不是缺能力** —— `claim`/`reassign` **本来就走 `tasks.assign`**；★ 缺的是**名字**：★ **调用方用台账自己的词，★ 面就拒**。
- ★★ **`transition` 是真缺口** —— `tasks.transition(id, to, {reason, expectedRevision})` **内核有、★ 面一个都没有**。

★★★ **修法**：★ **两个词都加进 action 表**；★ `assign` 与 `reassign` 同体（★ `owner` 或 `member` 皆可）★ 并在回执里回报 `owner`；★ `transition` **把 `to`/`why` 交给 `tasks.transition`** —— ★ **合法与否由【内核的状态转移表】判**，★ **面不发明自己的清单**。
★ **描述同步**：★ `claim | reassign | assign | transition | complete | reopen | set_dependencies`。

★★ **这一条值得记的教训**：★ **"拒绝具名"只在【调用方的意图确实没有操作】时才是优点**。★ 当**操作存在、★ 只是词汇不同**时，★ **具名拒变成了语言障碍** —— ★ 与 #19（★ 机制存在、★ 面不传参）是**同一族**：★ **能力在、★ 接口没接上**。

★ **GATES**：★ **T1 = 401/401** ✓ ★ tasks **42/0**、★ v5r-tools **332/0** ✓

### §6.28 已修计数：★ **15 条**；★ **未修 2 条**（#15 #20半 #29 #30 #31 —— ★ 归入 R3／R7／R8／R6）
### §6.29 已修 #30（★ 两个 `middleware` 数、两个不同钩子、都没标注）

★ **先纠正我自己**：★ 我以为这是**重复键**（★ 后者覆盖前者）。★ **读了全貌后发现不是** —— `kernel/index.js:2835` 在 `idle:` **嵌套块内**、★ `:2837` 在**顶层**，★ **两个键都真的存在** ✓

★★ **所以这不是覆盖 bug，★ 是【歧义】**：★ **两个同名的 `middleware`/`middlewareRan` 落在不同深度，★ 各自数【不同的钩子】**：
- ★ 嵌套 `idle.middleware` = **`control/idle`**（★ `stall-meeting` 就在这，★ 所以 =1）
- ★ 顶层 `middleware` = **`control/heartbeat`**（★ 没有中间件挂这，★ 所以 =0）

★★★ **两个数字都是对的**，★ 而**代理读顶层那个 0 就断定"什么也没跑"** —— ★ **回执的歧义，★ 不是总线的错**。

★ **修法（★ 纯增量、零破坏）**：★ **两处各加 `middlewareHook`** —— 嵌套 `'control/idle'`、★ 顶层 `'control/heartbeat'` ⇒ ★ **每个数字自己说出它属于哪个钩子**。
★ **GATES**：★ **T1 = 401/401** ✓ ★ control **26/0**、★ v5r-tools **332/0** ✓

### §6.30 已修计数：★ **16 条**；★ **未修 2 条**（#15 #20半 #29 #31 —— ★ 归入 R1／R3／R7／R6）
### §6.31 #29（★ 票通过未达动议：★ `mo1` 仍 `seconded`、★ `tally for:0`）—— ★ **链路查清，未修**

**已确认的三段（★ 各有 `文件:行`）**：
1. ★ **动议 → 箱子** ✓ 已通：★ `packs/v5r/middleware/motion-box.js` 在 `meeting/motion` 时**为动议开一个票箱**，★ 并把会议里的票**镜像进箱子**。
2. ★ **读票路径** ✓ **存在**：★ `kernel/meetings.js:774`（`vote()` 的 tally）与 `:1160`（`summary()` 的 tally）**都从【动议自己的 `mo.votes`】算** —— ★ 所以**不是"不会算"**。
3. ★★★ **箱子 → 动议** ✗ **缺**：★ **没有任何东西把箱子里的票写回 `mo.votes`**。

**⇒ 症状因此完全解释**：★ 票进了箱子、★ **`mo.votes` 始终空** ⇒ ★ `summary()` 报 **`tally:{for:0,against:0}`**、★ 动议**停在 `seconded`**（★ 因为**没有任何一步依据票数把它推进**）。

★★ **⇒ 缺的不是"计数能力"，★ 是【两个容器之间的一条写入】** —— ★ 与 #19（★ 机制在、★ 参数不传）、★ #1（★ 能力在、★ 词汇不认）**同一族**：★ **存在的物件没有被连接起来**。

★★★ **下一轮的做法**：★ ① 查 `kernel/ballotbox.js` **有没有"箱子关闭/落定"的事件**（★ 若有，★ 它就是这条写入的天然挂点）；★ ② ★ 在那一点把结果写回 `motion.votes` ★ **并把动议状态按阈值推进**（★ 状态推进的规则应来自 pack 策略，★ 不是内核常量）；★ ③ ★ 断言：★ **一次通过的投票之后，★ `summary()` 的 `for` 必须 > 0 且 ★ 动议状态不是 `seconded`**。
★ **本轮不改**：★ 这需要**选一个挂点**并**同步动议状态机**，★ 属多站点改动，★ 预算不足以改完并验证。
### §6.32 #29 —— ★★★ **修法收敛为【改读侧】，比"写回"更好**

★ 本轮确认了两件关键事实（★ 各有行号）：
1. ★ `kernel/meetings.js:776` —— `vote()` **已经调用 `mirrorVote({ ballot, boxFor: boxBinding.resolve(), … })`** ⇒ ★ **票确实被镜像进箱子** ✓ ★ **所以"箱子→动议"不是要新增一条写入，★ 而是【读的时候没去问箱子】**。
2. ★ `:346-356` —— `boxBinding = createBoxBinding({ clock, initial: boxFor, refuse })`，★ 且 `:52` 的 `createMeetings({ …, ballot, boxFor })` **本来就收 `ballot` 与 `boxFor`** ⇒ ★ **读箱子所需的两个把手【都在这个文件里】**。

★★ **因此正确的修法是【改读侧】，★ 不是【写回】**：
- ★ 现状：★ `:774`（`vote()`）与 `:1160`（`summary()`）都从 **`mo.votes`** 算 ⇒ ★ **而 `mo.votes` 空**（★ 票在箱子里）⇒ `for:0`
- ★★ 改成：★ **若该动议有绑定的箱子 ⇒ tally 从【箱子的读法】（`ballot` 的 `{cast,votes,abstain,…}`，★ 见 `ballotbox.js:461` 的形状）取**；★ 没有箱子时才回落到 `mo.votes`
- ★★★ **为什么这样更好**：★ **一个真相源**。★ 箱子是票的容器，★ **动议的 tally 是它的【视图】**；★ 写回会造出**两份会漂移的计数** —— ★ 正是本项目一直在消灭的形状。

★ ★ **仍未改**：★ 需要**确认 `ballot` 的读方法名与其入参**（★ `ballotbox.js:461` 那个形状在哪个方法里，★ 尚未读到），★ 并把**两处 tally** 改成同一策略。★ 预算不足以**改完并验证**，★ **故不动代码**。
★★ **下一轮第一步**：★ 读 `ballotbox.js` **`:440-470` 附近**，★ 拿到那个返回 `{cast,votes,abstain,absent,floor,ranked}` 的方法名 ★ **再改 `:774`/`:1160`**，★ **断言**：★ 投票后 `summary()` 的 `for > 0`。
### §6.33 #29 —— ★ **读侧修法差最后一块：`ballot.status()` 不暴露逐项计数**

★ 本轮把最后一块读清了（★ 都有行号）：
- ★ `kernel/ballotbox.js:634` 导出的面是 **`{ open, cast, markAbsent, close, reopen, lapseDue, lapse, revokeLapse, status, keysUsed, partition, config, refusals, snap }`** ⇒ ★ **有 `status`** ✓
- ★★ 而 `status({boxId})` 返回 **`{ ok, boxId, round, sealed, state, reopenCount, votes, abstain, … }`** —— ★ 其中 **`votes` 是 `box.votes.size`（总票数）**，★ **不是逐选项计数** ✗
- ★★ 逐项计数只在 **`close()`** 里出现（`ballotbox.js:461` 的 `tally: { cast, votes, abstain, absent, floor, floorBase, ranked }`）★ —— ★ **而箱子没关时拿不到**。

★★ **⇒ 所以读侧修法差【一个字段】**：★ 给 `status({boxId})` 补 **逐选项计数**（★ 例如 `byChoice: { '1': n, '0': m }`，★ 直接由 `box.votes` 聚合），★ 然后 `meetings.js:774`/`:1160` 才能在有箱子时用它算 `for`/`against`。

★★★ **这条发现本身值得记**：★ **我上一轮以为"只差一个方法名"**，★ **实际差的是【那个方法没有暴露所需的粒度】** —— ★ **接口存在 ≠ 接口够用**。★ 这是本阶段第 N 次"以为只差一步"，★ **而每一步都要实测才敢说**。

★ **本轮不改代码**：★ 需要 ① 给 `status` 加 `byChoice`、★ ② 改两处 tally、★ ③ 同步 `vmu-ballot*` 套件的断言 ⇒ ★ **三站点，★ 预算不足**。
★★ **下一轮顺序（已定）**：★ ① `ballotbox.js` 的 `status({boxId})` 加 `byChoice`（★ 正反断言：★ 空箱全 0、★ 投两票后正确分项）；★ ② `meetings.js` 两处 tally 读它；★ ③ 断言 **投票后 `summary()` 的 `for > 0`**。
### §6.34 #29 第 1/2 步已落地：★ `ballot.status({boxId})` 现在给**逐项计数**

★ **改动**（`kernel/ballotbox.js:576` 的 `status({boxId})`）：★ 加 **`byChoice`** —— ★ **直接由 `box.votes` 聚合**，★ **不新增状态、不推断**。
★ **注释里写明两件事**：★ ① **为什么需要它**（★ 此前只有 `votes: box.votes.size` —— ★ **一个总数分不出 for/against**，★ 而逐项计数只在 `close()` 里，★ **开着的箱子拿不到**）；★ ② **为什么泄密不冲突**（★ 密封箱子**仍然计数**，★ 只是不给出"谁投了什么" —— ★ `close()` 正是 `detail:null` 而 `tally` 保留，★ **所以总数在任何状态都安全**）。

★ **实测**：★ 空箱 ⇒ **`byChoice:{}`** ✓；★ 投 2 张 `'1'` ＋ 1 张 `'0'` ⇒ **`byChoice:{"0":1,"1":2}`、★ `votes=3`** ✓

★ **GATES**：★ **T1 = 401/401** ✓ ★ ballot **44/0**、★ ballotbox **16/0**、★ meetings **193/0** ✓

### §6.35 #29 第 2/2 步（★ 未做）：把两处 tally 指向箱子

★ **下一轮**：★ ① `meetings.js:774`（`vote()`）与 `:1160`（`summary()`）**在动议有绑定箱子时数 `ballot.status({boxId}).byChoice`**，★ **没箱子才回落到 `mo.votes`**；★ ② ★ **取 boxId 用现成的 `boxBinding.resolve()`**（★ `:346-356`，★ 已在文件里）；★ ③ ★ **断言**：★ 投票后 **`summary().tally.for > 0`** 且 ★ **动议状态不再是 `seconded`**。
### §6.36 ★★★ #29 第 2/2 步已落地 —— **动议的 tally 现在去【票真正所在的地方】数**

★ **根因补齐**：★ `vote()`（`meetings.js:774`）与 `summary()`（`:1160`）**都从 `mo.votes` 数**，★ **而票在【pack 绑定的票箱】里**（★ 投票点的 `mirrorVote()` 写进去的），★ **`mo.votes` 只在【经会议面本身投票】时才填** ⇒ ★ 真机里 `for:0`。

★ **修法**：★ 新增 **`tallyOf(meetingId, mo)`**：★ **先问箱子** —— `boxBinding.resolve()`（★ `boxFor({meeting, motion})` ⇒ `boxId` 或 `{boxId,…}`）★ ⇒ `ballot.status({boxId}).byChoice` ⇒ `for = byChoice['1']`、★ `against = byChoice['0']`；★ 🚨 **没有箱子／箱子没票 ⇒ 回落 `mo.votes`**（★ 既有行为不变）。
★★ **调用点**：★ `vote()` 的 `tally`、★ `summary()` 每项动议的 `tally` —— **同一个助手，★ 不会再分叉**。
★★★ **一个真相源**：★ **箱子持有票，★ 这个 tally 是它的视图**；★ **不把箱子计数写回 `mo.votes`**（★ 那会造出两份会漂移的计数）。

★ **防御到位**：★ **无 `ballot`／无 `boxFor`／无 `status`／无 `byChoice`／箱子 0 票** ⇒ **逐级回落**，★ **不抛、★ 不吞**（★ `audit-no-silent-reads` **6/0**）。

★ **GATES**：★ **T1 = 401/401** ✓ ★ meetings **193/0**、★ meeting **50/0**、★ meeting-domain **10/0**、★ ballot **44/0**、★ v5r-tools **332/0** ✓

★★ **注意仍未验的**：★ 这是**代码级**修复，★ **真机里"投票后 `summary().for > 0`"要等下一次完整 SLV**（★ 那正是目标 5 的意义）。
### §6.37 #31（★ 论文渲染）—— ★ **三个报告点在【同一段 10 行】里，根因精确**

**根因（★ `kit/paper.js:281-290` 的 `PaperMd`）**：
```js
for (let i = 1; i < SECTIONS.length; i += 1) {          // ★ 每个顶层节
  lines.push('', '## ' + SECTIONS[i])
  for (const member of state.participants) {            // ★ 每个成员
    const part = readPartVerified(state, member)
    const chunk = [part.title, part.solution, part.methods, part.rules, part.limits]   // ★ 整份 part
    lines.push('', '### ' + member + '（第 ' + part.round + ' 轮）', '', chunk)          // ★ 塞进【每一个】顶层节
  }
}
```
★ **⇒ 每个成员的【整份 part】**（★ title ＋ solution ＋ methods ＋ rules ＋ limits）★ **被复制进【每一个】顶层节** ⇒ ★ **"整篇正文出现在每一节里"** ✓ ★ **这就是报告里最刺眼的那条。**

★★ **另外两条**：
- ★ `:286` 的 **`'**' + part.title + '**'`** ⇒ ★ **粗体标记直通**，★ 而 `PaperTex`（`:300-306`）**只转义 `&%$#_{}`，不处理 `**`** ⇒ ★ **`**` 原样漏进 tex** ✓
- ★ `:278` 的 `'编辑：' + state.editor` ⇒ ★ **不是硬编码**：★ `state.editor` 是**真实值**（★ `:115` 的 `editorDefault='academician'` 只是**默认**）⇒ ★ **所以真机上显示 "academician" 是因为它【确实】是默认编辑者** —— ★ **这一条我读代码后判断【不是缺陷】**，★ 报告可能是把"默认值"误读成"硬编码"。

★★★ **修法（★ 下一轮）**：★ **分节映射** —— 每个顶层节只放**它自己的字段**（★ 例如"方法"节只放 `part.methods`，"局限"节只放 `part.limits`），★ **而不是把整份 part 重复 N 遍**。
★ **为什么本轮没做**：★ `SECTIONS` **来自 pack 策略**（`PAPER_SECTIONS`，★ 9 节），★ 而 part 只有 ~5 个字段 ⇒ ★ **9 节 ≠ 5 字段**，★ **映射需要一个明确的分配规则**（★ 哪个字段进哪一节、★ 空节怎么办）⇒ ★ **这是设计决定，★ 不是一处笔误**。★ 预算不足以做决定 + 实现 + 验证（★ `vmu-v5r-tools` 有 3 处 `PaperMd` 断言）。
★★ **便宜且确定的那半可先做**：★ `PaperTex` 里把 `**x**` 转成 `\textbf{x}`（★ 一行），★ **能立刻止住"`**` 漏进 tex"**。
### §6.38 ★★★ 已修 #31 的两条真缺陷

**① 全文复制进每一节** —— `kit/paper.js` 的 `PaperMd` **不再嵌套**：
★★ **根因是【粒度】**：★ 一个 part 是**一组字段**（`title/solution/methods/rules/limits/evidence`），★ **而一个节至多拥有其中一个**；★ 旧代码把**整份 part** 塞进**每一个节**。
★ **修法（★ 而映射是【策略】）**：★ `createPaperFlow` 新增 **`sectionFields`**（★ 每节一项，`''` = 该节不拥有单一字段），★ **由 pack 提供**：★
`packs/v5r/paper.js` ⇒ `sectionFields: ['title','','solution','','','methods','rules','limits','evidence']`
★ 对应 `PAPER_SECTIONS`：0 标题|1 引言|**2 完整解法**|3 命题|4 子问题|**5 有价值之物**|**6 规律**|**7 局限**|**8 证据**｜★ 0 节额外收 `title`，★ 8 节额外收 `evidence` 列表。

**② `**` 漏进 tex** —— `PaperTex` 的 `esc` **先把 `**x**` 转成 `\textbf{x}`，再转义** `&%$#_{}`。

★★★ **为什么映射必须放 pack**：★ **换一个机构就换一套章节** ⇒ ★ **映射写在 kit 里就是 policy 进内核**，★ 违反红线 1。★ 所以 **kit 只接受一张表，★ pack 给表**。

★ **GATES**：★ **T1 = 401/401** ✓ ★ v5r-tools **332/0** ✓ ★ regen 16/16、★ check-docs PASS、★ preflight PASS ✓

### §6.39 ★ #31 第三条**不是缺陷**（★ 已读代码确认）

★ `state.editor` 是**真实值**；★ `editorDefault = 'academician'`（`:115`）只是**默认**。★ 真机显示 "编辑：academician" **因为它确实是**。★ **未改。**
### §6.40 ★★ 真机复验第 42 轮：★ **跑起来了，★ 而模型 0 token —— 状态全部记录**

**已打通的基础设施（★ 四个 ABORT 逐个修掉）**：
1. ★ `缺 TaskFile` ⇒ ★ 传 `-TaskFile vmu-final-task.txt`
2. ★ `clone exists` ⇒ ★ 传 `-CloneName`
3. ★ **`$DRIVE` 与 `$OUT` 都是【乱码路径】**（★ `vibemath寮€鍙` 应为 `vibemath开发`，★ 脚本被以错误编码保存）⇒ ★ 生成 `slv-r41-run.ps1` 修正 `$DRIVE`
4. ★ `port in use`（★ 19389 被上次失败的 server 占着）⇒ ★ 终止 PID 9436

**跑起来之后的状态（★ 有 jsonl 为证）**：
- ★ `session/create` OK ★ `agentPreset: vibe-math-vmu`、★ `agentAvailable: true`、★ `mux: open` ✓
- ★ `follow-item` 有 **`turn 1, step 1`** 的 `system/message` 与 `user/message` ⇒ ★ **任务确实投递了** ✓
- ★★★ **而 705 行 jsonl 里 `running:true` 出现 0 次、★ `totalTokens>0` 出现 0 次** ⇒ ★ **模型从未产出任何 token** ✗
- ★ `srv.err` **只有** `dshmarket` peer 依赖不兼容那一条（★ 与运行无关）⇒ ★ **server 侧没有 provider 错误**

★★★ **⇒ 会话建好、★ 任务送达、★ 然后静默 —— 没有报错，★ 也没有产出。**

**下一轮的第一件事（★ 按顺序）**：
1. ★ **直接查 `dsh-opencode-go` 这个 provider 在这个 clone 里是否真能出 token** —— ★ 用一个**最小会话**（★ 不投 vmu 任务）★ **单独验一次** ⇒ ★ 这能立即区分"provider 不通"与"preset 出问题"。
2. ★ 若 provider 通 ⇒ ★ 查 **delivery mode**：★ `AGENTS.md §4` 说 `caller` 模式下**成员回合由调用会话扮演** ⇒ ★ **可能整个任务在等一个永远不会来的 `reply`**。
3. ★ 检查 **`$OUT` 的乱码路径**是否让 **drive 的 log 文件全是 0 字节**（★ 实测 `*.run.log` **确实是 0 字节**）⇒ ★ **修编码**（★ 把脚本以 UTF-8 重存）。

★ **本轮没有产生任何代码改动**；★ 仓内 `HEAD = db4a8371`，★ `dirty = 0`。
### §6.41 ★★★★★ 真机跑结束：★ **`NO_ADAPTER` —— 整次跑无效，★ 而原因【不在 vmu】**

★ 跑满 **1807 秒**、★ `tokens=0`、★ 结论 **`VERDICT: NON-RESULT (no adapter registered for the provider)`**。

★★★ **决定性证据（★ 从 run.log 里抽出的 `turn/end` 事件原文）**：
```json
"turn/end","seq":17,"data":{"turn":1,"reason":{"kind":"error","error":{
  "message":"no adapter registered for provider \"dsh-opencode-go\"","code":"NO_ADAPTER"}}}
```
★ **⇒ 会话建好、★ 任务投递了、★ `request/header` 与 `request/context` 都写明了 `provider: dsh-opencode-go`，★ 然后运行时直接说"这个 provider 没有适配器"。**

★★ **所以：★ 这次跑【没有验证到 vmu 的任何东西】。** ★ **不是 vmu 的缺陷、★ 不是 preset 的缺陷、★ 不是 #29 反例。** ★ 它**什么都没测**。

**已确认的事实**：
- ★ bundle **装上了**（★ `PROVIDER PACKAGE present in the clone: True`，★ 且 `bundles now:` 列表里有 `dsh-opencode-go`）✓
- ★ 模型设置成功（★ `MODEL SET: provider=dsh-opencode-go model=deepseek-v4.1-flash`）✓
- ★★ **但适配器没注册** ⇒ ★ **`NO_ADAPTER`** ✗
- ★ `srv.err` **只有** `dshmarket` peer 依赖那条（★ 无关）

**★★★ 关键线索（★ 下一轮第一步）**：★ 上一阶段的真机跑在 `HEAD 38be56a2` **跑通了**（★ 394 秒、★ 115 次工具调用、★ 548 万 token）⇒ ★ **同一个 provider 那时是能用的** ⇒ ★ **所以是【环境/装配】变了，★ 不是 provider 本身不可用**。
★ 候选：★ ① bundle 装了但**没 `enable`/激活**；★ ② **桌面 profile 里的 `dsh-opencode-go` 版本与这次 clone 的 DSH 不兼容**（★ 就像 `dshmarket@1.66.2` 那条 peer 冲突）；★ ③ 脚本 `:52-60` 的拷贝步骤**只拷了包、★ 没写进 bundle 激活清单**。

★ **下一轮顺序**：★ ① **先只验证 provider**（★ 用一个**不含 vmu 任务的最小会话**，★ 看是否同样 `NO_ADAPTER`）⇒ ★ **一步区分"环境坏了"与"vmu 坏了"**；★ ② 若环境坏 ⇒ ★ 修装配（★ `dsh plugin` 启用 / ★ 版本对齐）；★ ③ **环境好了之后再跑一次完整 SLV** —— ★ **那一次才是目标 5 的判据**。

★ **本轮零代码改动**；★ `HEAD = c987f159`（★ 上一轮留下的文档 commit），★ `dirty = 0`。
### §6.42 `NO_ADAPTER` 的排查结果（★ 四步测量，★ 每步有输出）

1. ★ **桌面 profile 能它** ✓：★ `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` =
   `[…, dsh-opencode-go, …, @mars-sea/dsh-commandcode-provider]` ⇒ ★ **桌面 DSH 侧是启用的**。
2. ★ **bundle 的注册方式是 Cordis patch** ✓：★ `dsh-opencode-go@0.1.21` 的 `dsh.bundle.patch = ./cordis.patch.yml`，★ 内容只有一条
   `- insert: [{ id: opencode-go, name: dsh-opencode-go }]` ⇒ ★ **适配器就是这个插件行**。
3. ★ **clone 里【两者都在】** ✓：★ `~/.dsh/profiles/slvr41/package.json` 的 bundles 含 `dsh-opencode-go`，
   ★ 且 `node_modules/dsh-opencode-go` **存在** ⇒ ★ **不是"没装"、★ 不是"没登记"**。
4. ★★★ **而两边的 node_modules 规模差异很大**：★ **clone 63 个顶层项 vs desktop 99 个** ⇒ ★ **clone 的 profile 薄得多**
   （★ 缺 `@anthropic-ai`／`@aws-sdk`／`@mars-sea`／`@puppeteer`／`@univerjs-pro` 等一大批）⇒ ★ **插件行加载所需的某个东西没进去**，★ 于是 ★ **provider 注册表里没有适配器** ⇒ ★ `NO_ADAPTER`。

★★★ **⇒ 结论：★ 这是【SLV clone 的装配缺口】，★ 不是 vmu、★ 不是 provider 本身、★ 也不是 preset。**

**下一轮的两条路（★ 明确）**：
- ★ **A（推荐，最快）**：★ **不新建薄 clone，★ 而是复制桌面 profile 的 `node_modules`**（★ 或直接以 `-Profile desktop` 起 server，★ 用**另一个端口**）⇒ ★ **桌面侧已验证能用这个 provider**。
- ★ **B**：★ 逐个补 clone 缺的 84 项 —— ★ 慢且不必，★ 因为**桌面那份是现成的、已知能用的**。

★ **而无论哪条路，★ 判据不变**：★ **最小会话（不含 vmu 任务）能出 token** ⇒ ★ **才去跑完整 SLV**。
★ **本轮零代码改动**；★ `dirty = 0`。
### §6.43 ★★★ `NO_ADAPTER` 的两次排除（★ 都排除了，★ 问题还在）

**尝试 1：恢复被 prune 的包** —— ★ 发现脚本 `:44` 用 `cpSync` 克隆桌面 profile，★ 而 `:46` 的 `npm i <tarball>` **把不在依赖树里的包全部剪掉**（★ clone 63 vs 桌面 99）。★ **补丁**：★ `npm i` 之后把桌面 `node_modules` 覆盖回来 ⇒ ★ **实测 `clone packages=147`**（★ 从 63 升到 147）✓
★★ **结果：★ 仍然 `NO_ADAPTER`、★ 仍然 0 token。** ⇒ ★ **不是包缺失。**

**尝试 2：provider 名** —— ★ 从 `dsh-opencode-go/lib/index.js` 读到**适配器注册的名字是 `opencode-go`**（★ `:931 provider: "opencode-go"`、★ `:1121 var SDK_PROVIDER_ID = "opencode-go"`），★ 而脚本按**包名**设成 `provider: dsh-opencode-go`。★ **改用 `-Provider opencode-go`** ⇒ ★ **`MODEL SET: provider=opencode-go`** ✓
★★ **结果：★ 仍然 `NO_ADAPTER`、★ 仍然 0 token。** ⇒ ★ **不是名字。**

★★★ **⇒ 两个最可能的解释都被排除，★ 而适配器在 clone 里就是不注册。**

**而唯一确定的事实是**：★ **桌面 profile 侧它是好的**（★ 用户 GUI 在用、★ bundles 含它、★ 99 个包）⇒ ★ **所以差异在【clone 这个运行实例】而不是在配置。**

★ **未测的下一步（★ 下一轮，★ 按优先级）**：
1. ★★ **不再用 clone** —— ★ **直接对【桌面 profile】起一个 server（★ 独立端口、★ 独立 key）**，★ 用**最小会话**（★ 不含 vmu 任务）★ 发一句话 ⇒ ★ **若它出 token ⇒ 环境侧完全可用，★ 剩下的只是把 vmu 任务投进去**。
2. ★ 若桌面 profile 也不出 token ⇒ ★ **问题在 `dsh-opencode-go` 与当前 DSH 运行时（★ `0.2.0-rc.2`）的兼容性**，★ **那不是仓内能修的**，★ 需换 provider（★ 官方 `deepseek-official`）或换运行时版本。

★ **本轮零仓内代码改动**；★ `dirty = 0`。★ `slv-r44-run.ps1`（★ 含恢复补丁）留在 `D:\_tmp\slv-phase5\` 供复核。
### §6.44 ★★★★★ 真机跑**终于跑通** —— ★ 而 **provider 必须是 `deepseek-official`**

```
RESULT preset=vibe-math-vmu exit=0 dur=265s tokens=5626599 capHit=False timeoutOrFatal=False adapterError=False
VERDICT: candidate PASS
```

★★★ **⇒ vmu 的完整流程真机跑起来了：★ 265 秒、★ 562.7 万 token、★ 零适配器错误。**

**判据逐项（★ 有输出）**：
| ★ 判据 | ★ 结果 |
|---|---|
| ★ `adapterError` | ★ **False** ✓ |
| ★ `capHit` / `timeoutOrFatal` | ★ **False / False** ✓ |
| ★ `NO_FENCE` | ★ **0** ✓ |
| ★ `FIELD_NOT_APPLICABLE` | ★ **0** ✓ |
| ★ `BAD_JSON` | ★ **0** ✓ |
| ★ `UNKNOWN_FIELD` | ★ **1 次，★ 而它是【任务文本里】的解释**（★ "写了会被判 `VMU_TURN_UNKNOWN_FIELD`"）⇒ ★ **非运行时错误** ✓ |
| ★ **`cast:true`** | ★ **未达成 —— `cast` 出现 0 次** ✗ ★ **本轮没跑到结题** |
| ★ **#29 票→动议** | ★ **本轮没有会议投票** ⇒ ★ **未被验到** ✗ |

★★★ **而这一轮最重要的发现【不是 vmu】**：
★ **`dsh-opencode-go` 与当前 DSH 运行时（★ `0.2.0-rc.2`）不兼容** —— ★ 排除了"缺包"（★ 147 个包仍在）与"provider 名"（★ `opencode-go` 也不认）⇒ ★ **适配器根本不注册**。
★★★★ **而桌面 profile 的默认模型行是 `provider: deepseek-account`、★ `web` profile 是 `provider: deepseek-official`** ⇒ ★ **两个能工作的 profile 都【没有用】`opencode-go`** ⇒ ★ **它一直是"装了但没用过"**。
★★★★★ **⇒ 因此本次真机跑用 `deepseek-official` / `deepseek-flash`** —— ★ **这是【能工作的那个】**，★ **而 `opencode-go` 目前不可用**。★ **这一替换必须记在案，★ 因为它偏离了用户指定的 provider**。

**下一轮**：★ **同一套参数再跑一次并放长超时** ⇒ ★ **目标是 `cast:true`**；★ 若仍不收敛，★ 跑 `slv-inspect` 看 RED 项。
### §6.45 ★★★★★ 用户裁定：★ **SLV 一直跑在【旧 dsh】上** —— 这才是 `NO_ADAPTER` 的真因

★ **用户指出**：★ *"你跑 slv 用的旧版本 dsh 吗？应该用当前我们这个 dsh 的版本的 dsh 啊！！！我们现在所在的是 dsh-v0.2.1-rc.2"*。

★★★ **核实：用户完全正确。** ★ `_oneoff/vm-drive/dsh-drive.mjs:98` 的默认值：
```js
const bin = process.env.DSH_BIN || 'C:/Users/admin/scoop/apps/nodejs-lts/current/bin/node_modules/@deepseek-ai/dsh/lib/bin.js'
```
★ 那个路径的版本是 **`0.2.0-rc.2`** ⇒ ★ **SLV 从始至终跑在 scoop 装的旧 dsh 上**，★ **而 `dsh-opencode-go` 的适配器只在当前版本里** ⇒ ★ **这就是 `NO_ADAPTER`**。
★★ **⇒ 我前面那两轮排除（"缺包 147 个"、"provider 名 `opencode-go`"）都是对的排除，★ 但都在错的维度上** —— ★ **真因是【运行时版本】。**

**已做的处置（★ 按用户要求）**：
1. ★★ **旧 dsh 已移出活动路径** —— `C:\Users\admin\scoop\apps\nodejs-lts\current\bin\node_modules\@deepseek-ai\dsh`（**453 MB**）★ → ★ `D:\_tmp\dsh-0.2.0-rc.2-REMOVED`（★ 备份，★ 可复核后删）。
2. ★★★ **`dsh-drive.mjs` 的静默回退已删除** —— ★ 默认值不再指向旧版，★ 改成 **`const bin = process.env.DSH_BIN`** ⇒ ★ **没设 `DSH_BIN` 会【响亮失败】**，★ 而不是悄悄用旧版。★ **"静默回退"正是这次错误的成因**。

**当前版本的启动方式（★ 已探明，★ 供下一轮用）**：
★ 当前 dsh **在 `app.asar` 内**（★ 普通 node 读不了）⇒ ★ 必须：
```
$env:DSH_BIN = '<app>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
$env:ELECTRON_RUN_AS_NODE = '1'
& '<app>\DeepSeek Harness.exe' --expose-internals <drive.mjs> ...args
```
★ 已生成 `D:\_tmp\slv-phase5\slv-r46-run.ps1`（★ 语法 0 错误、★ 含此改动）。
★★ **第一次尝试 `dur=0s / tokens=-1 / no done line`** ⇒ ★ **server 没起来**，★ 而 `srv.err` **为空** ⇒ ★ **待查**（★ 可能 `app.asar` 内的 cli.js 需要 `--expose-internals` 之外的处理，★ 或 `DSH_BIN` 路径在 asar 内不被 `spawn` 接受）。

★ **另**：★ 本轮还修了真机代理报的**一条我自己引入的缺陷** —— ★ `vibe_v5_task_update` 的 **`transition` 分支加了但 `to` 参数没加进 schema** ⇒ ★ 已补 `to`／`why`／`blocked_by` ⇒ ★ **T1 = 401/401** ✓
### §6.46 切到当前 dsh（`0.2.1-rc.2`）的进展与**精确卡点**

**已确认可用（★ 手工实测，★ 输出为证）**：
```
& 'DeepSeek Harness.exe' --expose-internals <app.asar>\...\dsh-desktop-host\lib\cli.js --profile web --help
  ⇒ Usage: dsh --profile web [options]      ✓
& … --profile headless --help   ⇒ 正常      ✓
& … --profile desktop …         ⇒ error: profile "desktop" is managed exclusively by the Electron application
```
★★ **⇒ 当前 dsh 的 CLI 能起【非 desktop】profile（★ web／headless／clone 都行）**，★ **而 `desktop` 被 Electron 独占** —— ★ 所以 SLV 用 **clone profile** 的路线是对的。
★★★ **且输出里自报 `dsh 0.2.1-rc.2`** ✓ —— ★ **这就是用户指出的当前版本**。

**已修的三处（★ 都在 `_oneoff\vm-drive\dsh-drive.mjs`，★ 仓外）**：
1. ★ **默认 `DSH_BIN` 删除** ⇒ ★ `const bin = process.env.DSH_BIN`（★ 无回退，★ 没设就响亮失败）
2. ★ **spawn 带 `ELECTRON_RUN_AS_NODE=1`**（★ 否则 exe 以 GUI 模式起）
3. ★ **spawn 在 `app.asar` 路径下补 `--expose-internals`**（★ 且顺序在脚本之前）

**★★★ 仍卡住的精确点**：★ 三条都改了之后，★ 仍然 **`ABORT: no token`**，★ 而尾部是
```
at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
code: 'MODULE_NOT_FOUND', requireStack: []
```
★★ **栈里是 `run_main_module` ⇒ 失败发生在【drive 进程本身】，★ 而不是它 spawn 的 server。** ★ 也就是说：★ **`& $exe --expose-internals $DRIVE`** 这一步**没把 drive 当脚本跑起来**（★ exe 在 `ELECTRON_RUN_AS_NODE=1` 下可能把第一个非旗标参数当别的用途）。

**★★ 下一轮的第一步（★ 很具体）**：★ **先单独验证「exe 能否把 `dsh-drive.mjs` 当脚本执行」** —— 例如 `& $exe --expose-internals D:\wd\vibemath开发\_oneoff\vm-drive\dsh-drive.mjs --selftest`（★ drive 自带 selftest）⇒ ★ **若它也 `MODULE_NOT_FOUND` ⇒ 换一种启动 drive 的方式**（★ 例如用一个极小的 `.js` wrapper 去 `import()` 它，★ 或直接用 `node` 跑 drive 但 **`DSH_BIN` 指向 exe 而非 cli.js**）。
★★★ **注意**：★ `node` 跑 drive、★ 而 **`DSH_BIN` 指向 `DeepSeek Harness.exe`** —— ★ 这样 `spawn(exe, ['--expose-internals', cli.js, …])` 可能才是对的组合（★ 因为 **drive 自己**用普通 node 跑，★ 只有 **它 spawn 的 server** 需要 exe）。
### §6.47 当前 dsh 接线：★ **wrapper 方案已就绪，★ 而 server 侧仍差一步**

**已做（★ 都有实测输出）**：
1. ★ **新建 `_oneoff\vm-drive\dsh-current.mjs`** —— ★ 它把 `['--expose-internals', <app.asar cli.js>, ...args]` 交给 `DeepSeek Harness.exe`（★ `ELECTRON_RUN_AS_NODE=1`）。
   ★ **手工实测**：★ `node dsh-current.mjs --profile web --help` ⇒ **`Usage: dsh --profile web [options]`** ＋ ★ 自报 **`dsh 0.2.1-rc.2`** ✓
2. ★ **`slv-r48-run.ps1`**：★ `DSH_BIN` = wrapper、★ **drive 用普通 `node` 跑**（★ 各用对的解释器）。
3. ★ **drive 自证可跑**：★ `node dsh-drive.mjs --selftest` ⇒ **`{"step":"fatal","error":"attach mode needs --token"}`** ⇒ ★ **drive 没问题** ✓

**★★★ 仍卡住**：★ 跑 SLV 时 **`ABORT: no token`**，★ `srv.err` 里是 `MODULE_NOT_FOUND`（★ `run_main_module`）。
★★ **而这次 drive 已证明能跑** ⇒ ★ **`MODULE_NOT_FOUND` 来自被 spawn 的 server** ⇒ ★ **而【同一个 wrapper 命令】手工跑 `--profile web` 是成功的** ⇒ ★ **差异只在 `--profile <clone name>`**。
★ **下一轮第一步（★ 极具体）**：★ **手工用 wrapper 起一个 clone profile**（★ 例如先手工建 `slvr50` 或直接用已存在的 `slvr41`）★ 看是否也 `MODULE_NOT_FOUND` ⇒ ★ **若也失败 ⇒ 是 clone profile 本身在当前 dsh 下不可用**（★ 可能因为它是从 `desktop` 拷来的，★ 而 `desktop` 被 Electron 独占，★ 拷贝出来的 profile **仍带 Electron 标记**）。★★ **若是这个原因**：★ 应改为**从 `web` profile 拷贝**（★ `slv5n-run.ps1` 当年就是 `$SRC = profiles\web`，★ **而 `slv-final` 改成了 `desktop`**）—— ★ **这可能才是真正的分水岭**。
### §6.48 ★★★★★ `NO_ADAPTER` / `MODULE_NOT_FOUND` 的**最终真因**：★ **server 是 `.ps1` 自己起的，★ 与 drive 的 `DSH_BIN` 无关**

★ **`slv-*-run.ps1:22`**：
```powershell
$BIN  = 'C:\Users\admin\scoop\apps\nodejs-lts\current\bin\node_modules\@deepseek-ai\dsh\lib\bin.js'
```
★ **`:110/113`**：
```powershell
$srv = Start-Process node -ArgumentList @($BIN,'--profile',$CloneName,'--port',"$Port",'--no-open') …
```
★★★ **⇒ server 是【脚本自己】用 `node $BIN` 起的，★ 而 `$BIN` 就是那个旧 scoop 路径** ⇒ ★ **这才是 `MODULE_NOT_FOUND`（★ `Cannot find module …scoop…\bin.js`）的直接来源**。
★★★★ **而 `_oneoff/vm-drive/dsh-drive.mjs` 只是【客户端】** —— ★ **我在它身上改 `DSH_BIN`、★ 加 `ELECTRON_RUN_AS_NODE`、★ 加 `--expose-internals`，★ 全都与这个错误无关** ⇒ ★ **这也解释了为什么"改了没变化"**。

**已修**：★ `$BIN` → ★ `D:\wd\vibemath开发\_oneoff\vm-drive\dsh-current.mjs`（★ 那个 adapter）。★ `slv-r52-run.ps1`，★ 语法 0 错误。
★★ **实测进展**：★ **server 起来了、★ `$tok` 拿到了**（★ 越过了 `ABORT: no token`）✓
★★★ **而紧接着 drive 报 `node:internal/modules/esm/resolve:272`** ⇒ ★ 单独用同参数跑 drive 得到的是 **`fetch failed / ECONNREFUSED`**（★ server 不在那端口）⇒ ★ **所以真实跑里是【server 起来后又退出】**，★ 而 drive 的 `fetch` 因此炸。

★ **下一轮第一步**：★ **保留 `slvr52-ws`（★ 已禁用清理）★ 读 `srv.err`／`srv.out`** ⇒ ★ 看 server 为何在拿到 token 后退出。★ **这一步只需要读文件，★ 不需要再跑。**
### §6.49 ★★★★★ 当前 dsh 上：★ **server 与 prompt 都通了，★ 而 turn 从未启动**

**实测（★ 手工起 server ＋ 手工跑 drive，★ 全程可复现）**：
- ★ **server 起来了**：★ `srv.out` = `dsh web: http://127.0.0.1:19389/?token=…`、★ **`srv.err` = 0 字节** ✓
- ★ `session/create` ⇒ **`agentPreset: vibe-math-vmu`**、★ `agentAvailable: true` ✓
- ★ `session/prompt` ⇒ **`accepted: true, chars: 1901`** ✓
- ★★★ **而 `poll` 一直 `running:false`、★ `totalTokens:0`**
- ★★★★ **且会话文件 `session.v4.jsonl.zstd` 解压后【只有 1 行】—— 只有头，★ 零事件** ⇒ ★ **turn 从未开始**

★★ **⇒ 这**不再是 provider 问题**（★ 没有 `NO_ADAPTER`、★ 没有任何错误），★ 而是【提示词被接受后 agent 循环没起来】。**
★★★ **注意**：★ 这与之前 `deepseek-official` 那次**成功跑起来**的情形不同 —— ★ 那次有 265 秒、★ 5.6M token、★ 84 步。★ **所以差异在 `opencode-go` 这个 provider 上**：★ **它现在能被选、★ 但请求发不出去**（★ 没有 `turn/end`、★ 没有 error、★ 没有事件）。

**下一轮第一步（★ 很具体）**：★ **用 `deepseek-official` 在这套【当前 dsh】脚本上跑一次** ⇒
- ★ 若**成功** ⇒ ★ **`opencode-go` 在当前 dsh 上仍不可用** ⇒ ★ **用 `deepseek-official` 完成真机验，★ 并明确记录 provider 替换**
- ★ 若**也零事件** ⇒ ★ **问题在当前 dsh 的 preset 装载**（★ 与 provider 无关）⇒ ★ 查 `agentAvailable:true` 之后为何不起 turn

★ **本轮零仓内代码改动**；★ `dirty = 0`。★ `slvr52-ws`（★ server 日志）与 `slvr51-ws` 保留供复核。
### §6.50 A/B 结果 ＋ 卡点收缩到【ps1 里那一行 node 调用】

**A/B 结果（★ 关键）**：★ **`deepseek-official` 与 `opencode-go` 在当前 dsh 上【表现完全一样】** —— ★ 都是装配全绿、★ **然后同一处 `esm/resolve:272` 失败** ⇒ ★ **⇒ 这不是 provider 问题。**
★★ **而同时**：★ **手工用【同一组旗标】跑 `node dsh-drive.mjs …` 是成功的**（★ `session/create`、★ `prompt accepted`、★ poll 全出）⇒ ★ **drive 本身没问题**。

★★★ **⇒ 失败只出现在 `slv-r52-run.ps1:128` 那一行**：
```powershell
node $DRIVE --port $Port --token $tok --cwd $WS --preset $Preset --task-file $TaskFile `
  --follow-stream --follow-members --jsonl $jsonl --timeout $TimeoutSec --max-tokens $MaxTokens *> $log
```
★ 已核实：★ `$DRIVE` = **正路径**（★ `D:\wd\vibemath开发\_oneoff\vm-drive\dsh-drive.mjs`，★ 存在）、★ 脚本**语法 0 错误**。

**★ 下一轮唯一动作（★ 一行就够）**：★ **在这行前面 `Write-Host` 出【完整的命令字符串与每个变量】再跑** —— ★ 因为手工跑能成、★ 脚本跑不成，★ **差异必在那几个变量的实际值里**（★ 最可疑的是 `$jsonl`：★ 它在**乱码的 `$OUT`** 目录下，★ 即 `D:\wd\vibemath寮€鍙慭_oneoff\vm-slv`）。
★★★ **另一条要顺手验的**：★ **把 `$OUT` 的乱码路径改正确**（★ 应为 `D:\wd\vibemath开发\_oneoff\vm-slv`）—— ★ 这**同时解释了为什么 `*.run.log` 一直是 0 字节**（★ 写入畸形目录）。

★ **本轮零仓内代码改动**；★ `dirty = 0`。
### §6.51 ★★★ 变量全对、★ 越过 `verify`，★ 死在 `session/prompt` 之后

**命令回显（★ 全部正确）**：
```
DRIVE      = [D:\wd\vibemath开发\_oneoff\vm-drive\dsh-drive.mjs]  exists=True
PORT       = [19389]      TOKEN len=43      WS exists=True
PRESET     = [vibe-math-vmu]      TASKFILE exists=True
JSONL      = [D:\wd\vibemath开发\_oneoff\vm-slv\…jsonl]  dirExists=True
LOG        = [….run.log]      TIMEOUT=[1800]  MAXTOKENS=[6000000]
```
★★ **⇒ 变量这一层可以排除了。**

**★★★ 而 `$log` 里（★ 它才是 `node $DRIVE … *> $log` 的真实落点）显示**：
```
{"step":"auth","status":303,…}
{"step":"rpc","endpoint":"session/create","ok":true,"http":200}
{"step":"create","sessionId":"session-c6dbf85b-…","agentPreset":"vibe-math-vmu"}
{"step":"rpc","endpoint":"session/list","ok":true,"http":200}
{"step":"verify","projectionPreset":"vibe-math-vmu","agentAvailable":true}
```
★ **⇒ 会话建好了、★ preset 正确、★ agent 可用** —— ★ **然后 step 就断了**，★ 紧接着是 `esm/resolve:272`。

★★ **⇒ 崩溃点在 `verify` 之后的下一步（★ `session/prompt` 附近），★ 而不是启动、★ 不是 provider、★ 不是变量。**
★★★ **注意**：★ 这**与 §6.49 手工跑时"prompt accepted 但零事件"是同一次失败的另一面** —— ★ 手工那次 `prompt` 返回了 `accepted:true`，★ 而脚本这条路在 `prompt` **之前或之中**就抛了 `esm/resolve`。

★ **下一轮第一步**：★ **在 `$log` 之后紧接着 `Get-Content $log -Tail 40`**（★ 因为 `*>` 把 stderr 也吞进去了，★ 只要把 `$log` 读出来就有完整栈）—— ★ **本轮的 818 字节 log 只有 5 行**，★ **说明 stack 被 `*>` 送进了别处**，★ **需要把 `*> $log` 改成 `2>&1 | Tee-Object`** 才能同时看到 stdout 与 stderr。
### §6.52 ★★★★★ 真机链路的**最后一块**：★ `ws` 依赖 ＋ drive 终于跑通

**完整栈（★ `Start-Process` 完整重定向后才拿到，★ 之前被 PowerShell 的 `NativeCommandError` 只留一行）**：
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\admin\.dsh\profiles\node_modules\ws\index.js'
  imported from D:\wd\vibemath开发\_oneoff\vm-drive\dsh-drive.mjs
```
★★★ **⇒ drive `import`s `ws`，★ 而 `ws` 原本来自【我移走的旧 scoop `node_modules`】** ⇒ ★ **删旧版把 drive 的依赖一起删了。**
★ **修法**：★ 从备份 `D:\_tmp\dsh-0.2.0-rc.2-REMOVED\node_modules\ws` **复制到 Node 真正解析的路径** `C:\Users\admin\.dsh\profiles\node_modules\ws` ⇒ ★ **`index.js` 到位、★ `--selftest` 通过** ✓

**★★ 修好后 drive 真的跑起来了**：★ jsonl **565 行 / 140 KB**、★ `session/create`、★ `verify`、★ `agentAvailable:true` 全过。
**★★★ 而 `totalTokens` 仍为 `0`、★ `running:false`** ⇒ ★ **与 §6.49 手工跑的结论一致：★ 会话建好、★ prompt 被接受、★ 模型不出 token。**
★★★★ **而对照**：★ **`deepseek-official` 在【旧运行时】上曾跑出 5.6M token、★ 84 步**。
★★★★★ **⇒ 当前运行时（`0.2.1-rc.2`）上，"会话建好后模型不启动"是最后的未解点** —— ★ 而它**与 provider 无关**（★ 两个 provider 表现相同，★ §6.50 已验）。

**已排除的（★ 全部有测量）**：★ 旧 dsh（已删）、★ `$BIN` 旧路径（已修）、★ `$OUT` 乱码（已修）、★ `DSH_BIN`（无关）、★ provider 选择（无关）、★ 变量值（全对、已回显）、★ `ws` 依赖（已补）。
★★ **剩下的唯一问题**：★ **当前 dsh 上 `session/prompt` 被接受后 agent 循环不启动。** ★ 下一步应查 **`0.2.1-rc.2` 的 `deliveryPath`/`caller` 模式** 或 ★ **该 preset 在当前版本下的 `agentAvailable:true` 之后的实际装载**。
### §6.53 ★★★★★ 真机链路的**真正根因**：★ `dsh 0.2.1-rc.2` 的 `session/prompt` wire 契约变了

**证据（★ `Start-Process` 完整 stderr 拿到）**：
★ 把 drive 的 `mode: 'queue'` 试改成 `'send'` ⇒ ★ **被边界校验拒绝**：
```json
{"code":"gateway/input-invalid",
 "message":"typert gateway: session/prompt: wire field \"request\" failed boundary validation",
 "details":{"endpoint":"session/prompt","field":"request"}}
```
★★★ **⇒ `'send'` 不是合法 mode；★ 而 `'queue'` 是【合法但静默无效】**（★ 返回 `accepted:true`、★ 会话零事件）。

★★★★ **⇒ `0.2.1-rc.2` 的 `SessionPromptRequest` 形状与 drive 里那份（★ 来自旧版）不一致** —— ★ **`{requestId, sessionId, mode:'queue'|'steer', content:[{type:'text',text}]}` 这套在旧版成立、★ 在新版只是"能过校验但不触发"。**

**已全部排除的（★ 每项都有测量）**：★ 旧 dsh（已删）、★ `$BIN` 旧路径（已修）、★ `$OUT` 乱码（已修）、★ `DSH_BIN`（无关）、★ provider（两者相同）、★ 变量值（全对）、★ `ws` 依赖（已补）。

**★★ 下一轮唯一要做的**：★ **从【当前 app】里取出 `session/prompt` 的 typert schema**（★ 在 `app.asar` 的 `@deepseek-ai/dsh-*` 里搜 `session/prompt` 的 `SessionPromptRequest` 定义）★ **按新契约改 drive 的 payload** —— ★ **这是最后一个未知量，★ 而且它现在被精确定位到【一个 JSON 字段】。**
★ **注意**：★ 这**完全不是 vmu 的缺陷** —— ★ **是 SLV 驱动器与新运行时的契约差异**。
### §6.54 ★★★ payload 与 schema **完全一致** —— 所以"静默不启动"是真的

**从当前 app 的 `app.asar` 里取出的 `SessionPromptRequest` 精确 schema**：
```json
{ "type":"object", "properties": {
    "requestId": {"type":"string"},
    "sessionId": {"type":"string"},
    "mode": {"type":"string", "enum": ["queue","steer"]},
    "content": {"type":"array","items":{"oneOf":[{"type":"object",
        "properties":{"type":{"const":"text"},"text":{"type":"string"}},
        "required":["type","text"],"additionalProperties":true}]}} } }
```
★★ **而 drive 发的正是** `{requestId, sessionId, mode:'queue', content:[{type:'text',text}]}` ⇒ ★ **逐字段吻合** ✓
★★★ **⇒ 上一轮"契约变了"的判断【被推翻】**：★ `mode:'send'` 被拒是**因为 `send` 不在 enum 里**（★ 预期行为），★ 而 `queue` **是合法且正确的**。

**★ 所以现在的状态是**：★ `session/prompt` 返回 **`accepted: true`**、★ **server 的 `srv.err` 是 0 字节**、★ **而会话文件只有头、★ 零事件、★ `totalTokens:0`**。
★★★★ **⇒ 这在当前运行时里是一个【静默不启动】** —— ★ 没有错误、★ 没有拒绝、★ 没有事件。★ **它可复现、★ 位置明确、★ 且不是 vmu 的缺陷。**

★ **已排除（★ 全部有测量）**：★ 旧 dsh、★ `$BIN`、★ `$OUT` 乱码、★ `DSH_BIN`、★ provider、★ 变量值、★ `ws` 依赖、★ **payload 形状（★ 本轮实测与 schema 逐字段吻合）**。

★ **下一轮的方向**：★ **① 查 `session/new` 与 `session/prompt` 之间是否还需要一步**（★ 端点表里有 `session/new`、★ `session/created`、★ `session/end-seed`、★ **`session/end-seed` 很可疑**）；★ **② 或直接问用户：★ 你在当前 GUI 里发一条消息时，客户端调的是哪一串 RPC** —— ★ 这能把"静默不启动"一步定位。
### §6.55 ★★★★★ 用户两问的答案 —— ★ **① 一直用旧 dsh（但那是设计）★ ② 我确实用了旧 vmu 包**

**① 用户问"是不是一直用旧版本 dsh"** —— ★ **是的**。★ 所有 `slv*.ps1` 的 `$BIN` 都指向 scoop 的 `@deepseek-ai/dsh`（★ `0.2.0-rc.2`），★ **而那是 SLV harness 的设计**。★ 我把它当作缺陷删掉，★ **反而破坏了能跑的环境**（★ 现已恢复）。

**② 用户问"用的 vmu 是不是最新的"** —— ★★ **不是！** ★ 时间线：
| ★ 事件 | ★ 时间 |
|---|---|
| ★ 我用过的 tarball | ★ **`dsh-vibe-math-r41.tgz` @ 18:12** |
| ★ 我今天的 **代码** commit | ★ **18:12 之后**（★ #29 第 2 步、#31、schema 参数……） |
| ★ 我今天的 **文档** commit | ★ **20:00–20:40** |
★★★ **⇒ 所有真机跑（★ 包括那次 265 秒 / 5.6M token）都跑在【18:12 的旧包】上** ⇒ ★ **17 条修复里的后半批【从未在真机上被跑过】**。

**③ 而本轮又发现一个更基础的事实**：★ **所有 `slv*.ps1` 的 `$DRIVE`/`$OUT` 都是【双重编码的乱码】** —— ★ 两种形态：★ `vibemath寮€鍙慭` 与 ★ `vibemath瀵㆓偓閸欐叚` ⇒ ★ **`node $DRIVE` 必然 `Cannot find module`**。
★★★★ **⇒ 这些脚本按原样【都不可能跑通】**。★ 而 **我改过的 `slv-r41`…`slv-r56` 有正确路径**（★ 我读过它们的 `$DRIVE` 确认是 `vibemath开发`）⇒ ★ **只有它们能过这一步**。

**★★ 本轮已做的两件实事**：
1. ★ **旧 dsh 已恢复**（★ `dsh --version` ⇒ `0.2.0-rc.2`）★ 且 ★ **scoop 顶层 `node_modules\ws` 已补回**（★ drive 的依赖）。
2. ★★ **从当前 HEAD `08077ca1` 重新打包** —— ★ `D:\_tmp\slv-phase5\dsh-vibe-math-HEAD.tgz`（★ 20:48，9,641,347 字节）⇒ ★ **这个包才含全部 17 条修复**。

**★★★ 下一轮的唯一正确组合（★ 从未试过）**：★ **`slv-r56-run.ps1`（★ 正确路径 ＋ `$BIN` 已修 ＋ `$OUT` 已修 ＋ Start-Process 完整日志）＋ 远端旧 dsh（★ 已恢复）＋ `dsh-vibe-math-HEAD.tgz`（★ 含全部修复）＋ `-Provider dsh-opencode-go`** ⇒ ★ **这一组合把所有已知坏点都排除了。**
### §6.56 ★★★★★ C 盘只剩 1.44 GB 的原因：★ **我自己的 SLV clone 堆了 12.6 GB**

**原因（★ 有测量）**：★ 每次 SLV 都在 `~/.dsh/profiles/` 建一个 clone，★ **而 clone 带 `node_modules`**：
| ★ 规模 | ★ 个数 | ★ 小计 |
|---|---|---|
| ★ **1,298 MB／个** | ★ **8 个**（★ `slvr51`–`slvr57`、★ `slvfin1`） | ★ **10.4 GB** |
| ★ 148–150 MB／个 | ★ 11 个（★ `slvclean`／`slvfinal`／`slvidle`／`slvverify`／`slvr41`／`slvorg1,2`／`slvhead1,3`／`slvv3chain7`／`v5vote`） | ★ 1.7 GB |
| ★ **合计** | ★ **19 个** | ★ **≈12.6 GB** |

★★★ **处置**：★ **删除全部 19 个 SLV clone**，★ **保留** `desktop`（★ GUI 在用，★ 1,094 MB）、★ `web`、★ `headless`、★ `hubtest*`、★ `vibe-lab`、★ `p-nopnpm`。
★★★★ **实测**：★ **C 盘 `1.44 GB → 14.05 GB`（★ 释放 12.61 GB）** ✓

**★★ 教训（★ 写进纪律）**：
1. ★ **每个 SLV clone 约 1.3 GB** ⇒ ★ **跑完必须删 clone**（★ 脚本的 `Cleanup-Mine` 只在**正常结束**时跑，★ **而失败/中断时它没跑或被绕过**）。
2. ★★ **我删了旧 dsh、查了半天路径，★ 却一次也没看过【自己留下的 19 个 1.3 GB 目录】** —— ★ 这**又是一次"诊断面本身没被检查"**。
3. ★★★ **以后每次真机跑完，★ 第一件事是 `Remove-Item ~/.dsh/profiles/<CloneName>`** 并**核对 C 盘余量**。

**★ 另记（★ 用户裁定，★ 后续必须遵守）**：
- ★ **正式 SLV 必须用【当前运行的这个 dsh】（`0.2.1-rc.2`）**，★ **不得用旧 scoop dsh** ⇒ ★ 旧 dsh 已**永久移出**（★ `D:\_tmp\OLD-dsh-0.2.0-REMOVED`）。
- ★ **每次 SLV 必须用【最新代码】** ⇒ ★ **跑前必须 `git rev-parse HEAD` ＋ `npm pack` 重新打包**，★ **不得复用旧 `.tgz`**。
★ 对应脚本：★ `D:\_tmp\slv-phase5\slv-r58-run.ps1`（★ `$BIN` → `dsh-current.mjs`，★ 即当前 dsh）。
### §6.57 正式配置（★ 当前 dsh ＋ HEAD 包）跑了一次 —— ★ 仍是"prompt 被接受、★ 零事件"

★ **配置**：★ `slv-r58-run.ps1`（★ `$BIN` → `dsh-current.mjs`，★ 即当前 `0.2.1-rc.2`）＋ ★ `dsh-vibe-math-HEAD.tgz`（★ 20:57 从 HEAD `7368b5e3` 重打）＋ ★ `dsh-opencode-go`。
★★ **结果（★ 有 jsonl 为证）**：★ 装配全绿、★ `session/create` 成功、★ `verify` `agentAvailable:true`、★ **337 行 jsonl**、★ **而 `totalTokens` 全程 0、★ `running:false`**。
★★★ **⇒ 与 §6.49／§6.54 完全一致：★ `session/prompt` 被接受、★ 会话零事件、★ 模型不出 token。**

**★ 已排除（★ 累计，★ 每项有测量）**：★ 旧 dsh（★ 已永久移出）、★ `$BIN`、★ `$OUT` 乱码、★ `DSH_BIN`、★ provider（★ 两个相同）、★ 变量值（★ 全对）、★ `ws` 依赖、★ payload 形状（★ 与官方 `SessionPromptRequest` schema 逐字段吻合）、★ `session/create`（★ 当前 dsh 里 55 处引用、★ 有效）。

**★★★ 剩下的唯一差异**：★ **用户 GUI 能在当前 dsh 上正常发消息** ⇒ ★ **说明"客户端调用序列"里还有一步 drive 没做** —— ★ 端点表里的 **`session/model-experience`** 与 **`session/end-seed`** 是**最可疑的两个**（★ 前者可能就是"为这个 session 选模型"那一步）。

**★ 本轮同时完成（★ 用户要求的**）**：
1. ★ **旧 dsh 永久移出**（★ `D:\_tmp\OLD-dsh-0.2.0-REMOVED`）—— ★ 正式 SLV **只用当前 dsh**。
2. ★ **HEAD 包重打**（★ `dsh-vibe-math-HEAD.tgz`，★ 含全部 16 条修复）—— ★ **正式 SLV 只用最新代码**。
3. ★ **C 盘清理 12.61 GB**（★ 1.44 → 14.05 GB），★ **并清理了本次 clone** ⇒ ★ **跑完即删**。
### §6.58 ★★★★★ 1.3 GB clone 是**我自己造成的** —— ★ 而原本只有 150 MB

**用户的追问是关键**：★ *"为什么这个 slv 会造成 clone 或产生这么大文件？明明今天以前一直没有过"*。

★★★ **对比数字就说明一切**：
| ★ clone | ★ 大小 | ★ 时间 |
|---|---|---|
| ★ `slvclean`／`slvfinal`／`slvidle`／`slvverify`／`slvr41`／`slvorg1,2`／`slvhead1,3`／`slvv3chain7`／`v5vote` | ★ **150 MB**（★ **原本的大小**） | ★ 10:36–20:49 |
| ★ **`slvr51`–`slvr57`、`slvfin1`** | ★ **1,298 MB** | ★ **20:04–20:50** |

★★★★ **根因是我为了排查 `NO_ADAPTER` 加的那一段**：
```powershell
fs.cpSync("$DESK\node_modules", "$PROF\node_modules")   # \u628a\u684c\u9762 1.1 GB \u7684 node_modules \u6574\u4e2a\u62f7\u8fdb\u6bcf\u4e2a clone
```
★★ **⇒ clone 从 150 MB 涨到 1.3 GB（★ 约 9 倍）** ⇒ ★ **8 个 ≈ 10.4 GB** ⇒ ★ **C 盘填满**。
★★★ **而那个补丁是【为了修一个不存在的问题】**（★ `NO_ADAPTER` 的真因是旧 dsh，★ 与此无关）—— ★ **它没解决问题，★ 只制造了磁盘占用。**

**★ 处置**：★ **已生成 `slv-r59-run.ps1`**（★ 从 `slv-r58` 删掉该 cpSync 段，★ `仍含 cpSync DESK: false`、★ 语法 0 错误）⇒ ★ **clone 将回到 150 MB**。

**★★★★ 教训（★ 比磁盘更贵）**：★ **为了修一个错，★ 我加了一个改动；★ 那个改动没修好问题，★ 却引入了新的副作用（★ 磁盘），★ 而我整整几轮都没察觉** —— ★ 因为**我从不检查自己改动带来的开销**。

### §6.59 ★★★ 用户裁定的效率纪律（★ 后续必须遵守）

1. ★ **不要一遇到问题就跑完整真机**（★ 每次 10 分钟起步）⇒ ★ **先用【源码级诊断 ＋ 小测试】**（★ 几十秒），★ **有足够把握后才跑完整真机确认**。
2. ★ **真机跑【中途就能读】**（★ jsonl／session／srv 日志是增量写的）⇒ ★ **不必等它跑完**。
3. ★ **不依赖旧实测与旧经验** —— ★ **但也不要靠重复跑真机来替代读代码**。
4. ★★ **每次跑完立即删 clone**，并 ★ **核对 C 盘余量**（★ 已被填满一次）。
### §6.60 ★★★ 源码级诊断（★ 按用户效率纪律做的，★ 未跑 10 分钟真机）

**从 `app.asar` 与 drive 源码读到的硬事实**：
1. ★ **RPC 形状**：★ `POST /api/<endpoint>`，★ body `{type:'client-request', rpcId, method, payload:{args:{…}}}`；★ **auth 是 `GET /?token=<t>` 拿 cookie 后用 `cookie` 头**。
2. ★ **`session/create` 要求 `args.request`** —— ★ **实测报错原文**：★ `session/create: args fields do not match the descriptor: missing "request"`。
3. ★★ **而 drive 的 create 是对的**：★ `rpc('session/create', { args: { request: { agentPreset: PRESET, cwd: CWD } } })` ✓ —— ★ **所以 drive 的 RPC 没问题，★ 是我第一、二版小探针写错了。**
4. ★★ **`SessionPromptRequest` 的 schema**（★ 从 `app.asar` 取出）★ 与 drive 的 prompt payload **逐字段吻合** ✓
5. ★★ **drive 的 poll 逻辑**：★ `items.find(x => x.sessionId === sessionId)`；★ **`if (!now) continue`** 在 `emit` **之前** ⇒ ★ **既然 jsonl 里出现了 565 条 `poll` 行，★ 说明 `now` 找到了、★ `running:false` 是真的** ⇒ ★ **会话确实没在跑，★ 不是误读。**

★★★ **⇒ 所以"prompt 被接受但 turn 不启动"是真的，★ 而两个 RPC 的 payload 都是对的** ⇒ ★ **剩下的唯一方向是【`agentPreset: vibe-math-vmu` 在当前 dsh 下能否真正装载】**（★ `agentAvailable:true` 可能只表示"id 存在"）。

**★★★★ 下一轮（★ 严格按 40 秒小探针，★ 不再跑 10 分钟）**：
★ 用正确的 RPC 形状（★ `payload.args.request`）★ 在**一个 clone profile**（★ `web` 里没有 vmu preset）里：
1. ★ **`session/create` 带 `agentPreset:'vibe-math-vmu'`** ⇒ ★ 看返回的 `agentPreset` 与 `agentAvailable`
2. ★ **`session/prompt` 一句 `Say OK`** ⇒ ★ **poll 15 秒** ⇒ ★ **看 `running` / `outputTokens`**
3. ★★ **对照：`session/create` 不带 `agentPreset`**（★ 默认 preset）⇒ ★ **若默认能跑而 vmu 不能 ⇒ 就是 preset 装载问题，★ 与 dsh 无关**
★ **这条 A/B 只需 ~1 分钟**（★ 起 server 18 秒 ＋ 探针 20 秒），★ **不需要 10 分钟真机。**
### §6.61 ★★★ 小探针校准完成：★ 两种 wrapper（★ `request` 与 `_request`）都摸清了

**从错误消息里逐个学到的（★ 每一步都有原文）**：
| ★ 端点 | ★ 要求的 args 包装 |
|---|---|
| ★ `session/create` | ★ `args.request` |
| ★ `session/prompt` | ★ `args.request`（★ `{requestId, sessionId, mode, content}`） |
| ★ **`session/list`** | ★ **`args._request`**（★ **下划线！**） |

★★★ **而 drive 这三处【全都对】**：
- ★ `session/create` ⇒ `{args:{request:{agentPreset, cwd}}}` ✓
- ★ `session/prompt` ⇒ `{args:{request:{…}}}` ✓
- ★ `session/list` ⇒ `{args:{_request:{}}}` ✓
★★ **⇒ 我两版探针都写错了（★ 用 `/api/rpc/` 路径、★ 用 `request` 当 `_request`），★ 而 drive 一直是对的。**
★★★ **⇒ "prompt 被接受但 turn 不启动"不是 payload 问题** —— ★ **这一点现在【已被源码与实测双重确认】。**

**★★ 本轮同时验证了 clone 修复**：★ **`slvab` clone = 143 MB**（★ 之前是 1,298 MB）✓ ★ **跑完已删**，★ **C 盘 14.04 GB** ✓

**★★★★ 下一轮（★ 严格 30 秒，★ 一步到位）**：
```
session/create {args:{request:{cwd, agentPreset:'vibe-math-vmu'}}}
session/prompt {args:{request:{requestId, sessionId, mode:'queue', content:[{type:'text',text:'Reply OK'}]}}}
session/list   {args:{_request:{}}}        \u2190 \u2605 \u6ce8\u610f\u4e0b\u5212\u7ebf
```
★ **读 `items[].projections.values.tokenUsage` 与 `items[].running`** ⇒ ★ **A（带 vmu preset）vs B（不带）** ⇒ ★ **这一步就能判定"是 preset 装载问题还是 dsh 与 drive 的更深差异"。**
### §6.62 ★★★★★ 结论翻转：★ **drive、当前 dsh、vmu preset —— 三者全都没问题**

**小探针（★ 40 秒）发【真实任务文本】的结果**：
```
poll 1 (5s):  running=true total=9092   out=331
poll 5 (25s): running=true total=154701 out=5054
```
★★★ **⇒ 当前 dsh（`0.2.1-rc.2`）能跑 `vibe-math-vmu` 的完整任务、★ 出 token ✓**

**而 drive 对同一个活 server 的 A/B（★ 各 70 秒）**：
| ★ 模式 | ★ 结果 |
|---|---|
| ★ **不带** `--follow-stream/--follow-members` | ★ **`running:true`、★ total 20,448 → 63,134** ✓ |
| ★ **带** 两个 follow 旗标 | ★ **`running:true`、★ total 10,339** ✓ |
★★★ **⇒ drive 在当前 dsh 上也完全正常。**

★★★★ **⇒ 于是【不是 dsh、★ 不是 preset、★ 不是 drive、★ 不是 RPC payload】** —— ★ **问题只在 `slv-*.ps1` 那一层包装**（★ 它起的 server 与 drive 之间丢了什么）。

**★ 本轮唯一剩下的未解点，★ 非常小**：★ **ps1 起的 server 与 ps1 起的 drive 组合起来出 0 token，★ 而【手工起 server ＋ 手工跑 drive】完全正常** ⇒ ★ **差异在 ps1 的 `Start-Process` 参数或工作目录**。

### §6.63 ★★★ 回答"clone 到底是什么"

★ **clone ＝ 一个【临时的 dsh profile 目录】**，★ 位于 `~/.dsh/profiles/<CloneName>/`。
★★ **它包含**：★ `package.json`（★ `dsh.profile.bundles` 列表）、★ **`node_modules/`（★ 装好的插件：★ `dsh-vibe-math`、★ provider bundle、★ 以及它们的依赖）**、★ `cordis.yml` 等。
★★★ **为什么要它**：★ **SLV 必须把【我们自己的 vmu 包（tarball）】装进一个 profile 才能跑**，★ 而**不能污染用户的 `desktop`／`web`** ⇒ ★ **所以脚本从 `web` 复制一份到 `~/.dsh/profiles/<CloneName>`，★ 装上 tarball，★ 跑完再删。**
★★★★ **⇒ 它是【一次性的插件安装沙盒】，★ 天生就该用完即删** —— ★ **而我没删，★ 19 个堆了 12.6 GB。**
★★★★★ **★ 另外我把它从 143 MB 弄成 1.3 GB 的，★ 是我那段 `cpSync(desktop/node_modules)` 补丁**（★ 已删）。

★ **关于"以前没有 clone"**：★ **很可能以前也有**（★ 只是 143–150 MB × 少量，★ 不显眼），★ **或者早先直接对 `web` 跑**。★ **无论如何：★ 现在的正确做法是【每次跑完立即删 clone】，★ 而 clone 本身是这套 SLV 的正常设计。**
### §6.64 ★★★★★ 真正的分水岭：★ **`dsh-opencode-go` 在当前 dsh 上不出 token，★ `deepseek-official` 可以**

**两个对照（★ 同一 clone 构造、★ 同一 server、★ 同一 drive、★ 同一任务）**：
| ★ 模型行 | ★ 结果 |
|---|---|
| ★ **`provider: deepseek-official` / `model: deepseek-flash`**（★ `web` 原样） | ★ **`running:true`、★ total 20,448 → 154,701、★ out 5,054** ✓ |
| ★ **`provider: dsh-opencode-go` / `model: deepseek-v4.1-flash`**（★ runner 改的） | ★ **`running:false`、★ 0 token、★ 会话零事件** ✗ |

★★★ **⇒ 这是整条排查链的终点**：★ **不是 dsh、★ 不是 drive、★ 不是 RPC、★ 不是 clone、★ 不是 ps1 包装** —— ★ **是【`dsh-opencode-go` 这个 provider 在 `0.2.1-rc.2` 上不出 token】**。

★★★★ **而用户早就说过**：★ *"你可以试试把当前 dsh 版本的 dsh 即 dsh-v0.2.1-rc.2 的模型提供商改为 deepseek 官方试试"* —— ★ **他是对的，★ 而我在此之前又跑了七八次无效真机。**

**★ 处置**：★ **正式 SLV 用 `deepseek-official` / `deepseek-flash`**（★ 这是当前 dsh 上唯一可用的组合），★ **并在报告里明确"偏离了指定的 `dsh-opencode-go`，★ 因为它在当前运行时不出 token"**。

**★★ 另一个必须记的**：★ 我手工那次"成功"，★ **当时以为是 drive 的 A/B，★ 其实同时把 provider 换成了官方** —— ★ **两个变量一起变了，★ 我差点把它当成"drive 可用"的证据**。★ 这一条**又踩了"一次只变一个变量"的纪律**。
### §6.65 ★★★★★ **第一次在【当前 dsh】上跑通完整 SLV 流程**

**配置（★ 全部按用户裁定）**：
- ★ **运行时**：★ 当前 `dsh 0.2.1-rc.2`（★ 经 `dsh-current.mjs` adapter 启动）★ 旧 scoop dsh **已永久移出**。
- ★ **代码**：★ `dsh-vibe-math-HEAD.tgz`（★ 20:57 从 HEAD 重打）。
- ★ **provider**：★ **`deepseek-official` / `deepseek-flash`**（★ clone 继承 `web` 的模型行，★ **不再改写**）。
- ★ **clone**：★ 129 MB（★ 已修回原尺寸）★ **跑完自动删除**。

**结果（★ `done` 行原文）**：
```
{"step":"done","preset":"vibe-math-vmu","durationSec":69,
 "tokens":{"uncachedInputTokens":80259,"outputTokens":11598,"cacheReadTokens":518656},
 "tokenTotal":642428,"tokenCapHit":false,
 "transcriptEvents":87,"toolCalls":13,"followStreamWorked":true}
VERDICT: PASS
cleanup: clone_gone=True  C_free_GB=14.04
```
★★★ **⇒ 真实 token、★ 真实工具调用、★ follow-stream 正常、★ 会话跑了 87 个事件** —— **整条链路终于在【当前 dsh ＋ 最新代码】上跑通了。**

**★★ 而判据仍未全中**：
| ★ 判据 | ★ 结果 |
|---|---|
| ★ 真实 token | ★ **642,428** ✓ |
| ★ `NO_FENCE` / `UNKNOWN_FIELD` / `FIELD_NOT_APPLICABLE` / `BAD_JSON` | ★ **全 0** ✓ |
| ★ `followStreamWorked` | ★ **true** ✓ |
| ★★ **`cast:true`** | ★ **未达成** —— ★ 只跑了 **69 秒**、★ 13 次工具调用、★ **反复调 `vibe_vmu_status` 7 次** ⇒ ★ **没走完 v5r 全流程** |
| ★★ **`slv-inspect` 0 RED** | ★ **未跑** |
| ★★ **#29 票→动议** | ★ **未验**（★ 本轮无会议投票） |

★★ **⇒ 基础设施这一关【过了】；★ 剩下的是【任务深度】**：★ `deepseek-flash` 在 69 秒内只反复查状态，★ **没有真正推进机构流程**。
★★★ **下一轮**：★ **① 先跑 `slv-inspect` 看 RED**；★ ② **换一个更明确的收敛任务**（★ 或加大 timeout 让它真跑）；★ ③ **专门构造一次会议投票以验 #29**。
### §6.66 ★★★★★ 第二次（★ 收敛任务）真机跑：★ 基础设施全过，★ 而模型没走机构流程

**配置**：★ 当前 dsh `0.2.1-rc.2` ＋ **HEAD 包** ＋ **`deepseek-official`/`deepseek-flash`** ＋ **干净新任务文件**（★ 原来那些 `vmu-v5r-*.txt` **全是乱码**，★ 只有 `vmu-final-task.txt` 是好的，★ 而它的标题是"问题清点" ⇒ ★ **这就是第一次只跑 69 秒的原因**）。

**结果（★ `done` 行原文）**：
```
{"preset":"vibe-math-vmu","durationSec":1703,"tokenTotal":178180,
 "transcriptEvents":74,"toolCalls":13,"followStreamWorked":true,
 "title":"VMU 框架完整流程走查"}
VERDICT: PASS
```
★★ **⇒ 跑了 28.4 分钟、★ 178k token、★ follow-stream 正常** ✓

**★★★ 而工具序列是**：★ `vibe_vmu_status`、★ **`pwsh`**、★ `glob`、★ `working_directory`、★ `read`、★ `grep`、★ `glob`、★ `pwsh`
★★★★ **⇒ 它去【探索文件系统/跑 shell】了，★ 而【没有】调 `vibe_vmu_turn` / `hire` / `meeting`** ⇒ ★ **没有走研究所流程** ⇒ ★ **`cast:true` 未达成。**

**★ 判据最终状态**：
| ★ 判据 | ★ 结果 |
|---|---|
| ★ 完整流程跑起来 | ★ **是**（★ 1703 s、★ 178k token）✓ |
| ★ `NO_FENCE`/`UNKNOWN_FIELD`/`FIELD_NOT_APPLICABLE`/`BAD_JSON` | ★ **全 0** ✓ |
| ★ `followStreamWorked` | ★ **true** ✓ |
| ★★ **`cast:true`** | ★ **未达成** —— ★ 模型选了探索而非驱动机构 |
| ★★ **#29 会议投票** | ★ **未验** |
| ★★ **`slv-inspect`** | ★ **未跑** |

★★★ **⇒ 结论：★ 基础设施这一关【已完全通过】；★ 剩下的卡点是【模型行为】—— `deepseek-flash` 面对长任务时倾向于先探索仓库，★ 而不是调用 vmu 的机构面。** ★ 这**不是 vmu 的缺陷**，★ 而是**任务/提示词与模型能力的匹配问题**。
★ **下一轮**：★ ① **把任务缩短、并把"第一步必须调 `vibe_vmu_turn`"写死**；★ ② 或 ★ **用 `-MaxTokens` 之外的手段强制首轮即机构流程**；★ ③ ★ **同时跑 `slv-inspect` 与 #29 的投票验证**。
### §6.67 ★★★★★ 第三次跑（★ 短任务 ＋ 禁止探索）：★ 模型调 4 次 `vibe_vmu_status` 就停了

**结果**：★ `durationSec:40`、★ `tokenTotal:121377`、★ `toolCalls:4`、★ **`"tools":["vibe_vmu_status","vibe_vmu_status","vibe_vmu_status","vibe_vmu_status"]`**。

★★ **注意**：★ 那个 `tools` 数组是**调用记录**（★ 4 条对应 4 次调用），★ **不是可用工具清单** —— ★ 所以不能据此断言"只有 status 可见"。

★★★ **⇒ 真正的现象是**：★ **模型连续调了 4 次 `vibe_vmu_status`，★ 然后就结束了** —— ★ **它没有去 `hire`、★ 没有开会议、★ 没有 `vibe_vmu_turn`。**

**★★★ 这指向一个【真正的 vmu 侧问题】**：★ **`vibe_vmu_status` 的返回【没有告诉代理"下一步该做什么"】** —— ★ 一个从零开始的研究所，★ status 应该说清 `roster` 空／`eligible` 不足／没有开着的会议，★ **并指向下一步工具**。★ 如果它只报"当前状态"而不给 `next`，★ **代理就会反复查而不动**。

**★★★★ 下一轮（★ 源码级，★ 不用跑真机）**：
1. ★ **读 `kernel/*.js` 里 `status` 的实现** ⇒ ★ 看它返回什么字段（★ 有没有 `next` / `nextAction` / `hint`）
2. ★ **读 v5r 的提示词** ⇒ ★ 看它对"从零开始"有没有明确指令
3. ★★★ **如果 status 缺 `next` ⇒ 这是 `docs/03` 契约与消费者（代理）之间的真实缺口**，★ **应当补**（★ 且符合哲学：★ **能力在内核、★ 但"下一步"是政策 —— ★ 所以 `next` 应由 pack 给、★ 内核只给事实**）
### §6.68 ★★★★★ 三次"模型不动"的**真因**：★ **是我自己写的 runner 漏了 pack 注入**

**源码链（★ 每步有行号）**：
1. ★ `host.js:1051`：★ `appendPackToolSpecs(specs, kernel.packTools(), …)` ⇒ ★ **包工具来自 `kernel.packTools()`**。
2. ★ `pack.js:739`：★ **`kernel.declarePackTools`** 由**包加载器**调用 ⇒ ★ **只有 pack 被加载时才有 `vibe_v5_*` 工具**。
3. ★ **`pack.js:102-108`（★ 旧脚本）** 在插件的 `config` 里注入：
   ```yaml
   config:
     packs: ['v5r']
     root: '<WS>/VibeMath'
     vmu:
       deliverMode: 'caller'
   ```
4. ★★★ **而我为了快速迭代写的 `slv-min2-run.ps1`【没有这一步】** —— ★ 它只做了 clone 复制、`npm i`、起 server、跑 drive。

★★★★ **⇒ 于是那三次跑里 v5r 包【根本没加载】** ⇒ ★ **模型能看到的只有【内核面】**（`vibe_vmu_status` 等）⇒ ★ **它反复查 status、然后停手** —— ★ **这正是三次跑的同一表现**（★ 7 次 / 2 次 / 4 次）。
★★★★★ **⇒ 所以"模型不动"不是 vmu 的缺陷、★ 不是 `deepseek-flash` 的能力问题、★ 不是 status 缺 `next`** —— ★ **是我的 runner 少了一行配置。**

**★★★ 教训（★ 又一条）**：★ **为了"提高效率"而重写的极简 runner，★ 把原脚本里一个【关键配置步骤】静默丢了** —— ★ 而**它丢得毫无声响**：★ server 起来了、token 出了、会话跑完了、`VERDICT: PASS`，★ **只是 pack 不在。**
★★ **⇒ 极简重写必须【逐段对照原脚本】，★ 而不是凭记忆挑几步。**

**★ 下一轮**：★ **在 `slv-min2-run.ps1` 里补回 pack 注入**（★ 从 `slv-r58` 的 `:102-108` 原样搬），★ **重跑** ⇒ ★ **那才是有 v5r 包的完整流程**。
### §6.69 ★★★★★ 补上 pack 注入后：★ **v5r pack 真的加载了，★ 中间件在跑**

**配置**：★ 当前 dsh ＋ HEAD 包 ＋ `deepseek-official` ＋ ★ **补回 `packs: ['v5r']` 等 config 注入**（★ 原出处 `slv-r58:102-108`）。

**结果**：
```
{"durationSec":57,"tokenTotal":596542,"transcriptEvents":102,"toolCalls":14,
 "title":"用 vmu 工具推动研究所结题"}
VERDICT: PASS
workspaceFiles: [..., "VibeMath/vmu/audit/2026-10-22.jsonl", ...]
```

**★★★ 而 `VibeMath/vmu/` 里出现了真实产物**：
- ★ `state.json`（★ 817 B，★ `recoveries[0].reason:"kernel-start"` ⇒ ★ **内核真启动了**）
- ★ `audit/2026-10-22.jsonl`（★ 4.3 KB）⇒ ★ **里面有**：
  ```
  {"what":"middleware/decision","id":"v5r.artifact-counter::tools/result",
   "hook":"tools/result","dryRun":false,"traceId":"t63-tools…"}
  ```
  ★★★ **⇒ `v5r.artifact-counter` 中间件真的在每个 `tools/result` 上跑了决策** ✓✓✓

★★★★ **⇒ 这是本阶段【第一次】在真机上看到 v5r 的中间件链工作** —— ★ **而它之所以之前不出现，★ 就是因为我漏了那一段 pack config。**

**★★ 而 `cast` 仍未达成**：★ `state.json` 里 `members: []`、`meetings: []` ⇒ ★ **代理还是没有 `hire`、没有开场会议** ⇒ ★ **模型行为层面仍未驱动机构**。
★★★ **⇒ 现在的问题已经【完全干净】：★ 环境对（当前 dsh）、★ 代码对（HEAD）、★ pack 加载（中间件在跑）、★ 拒收零畸形 —— ★ 剩下纯粹是【模型要不要去调 `hire`/`vibe_vmu_turn`】。**
### §6.70 ★★★★★ v5r pack 在真机上**完整加载** —— 6 个中间件全部注册

**`VibeMath/vmu/audit/2026-10-22.jsonl`（★ 21 条，★ 真机产物）的头 6 条**：
```
{"what":"middleware/registered","id":"v5r-core-no-adhoc-scripts","on":"tools/pre-execute","order":1000,"failure":"closed"}
{"what":"middleware/registered","id":"v5r-core-settled-records-only","on":"tools/pre-execute","order":200,"failure":"closed"}
{"what":"middleware/registered","id":"v5r.stall-meeting::control/idle","on":"control/idle","order":300,"failure":"open"}
{"what":"middleware/registered","id":"v5r.motion-box::meeting/motion","on":"meeting/motion","order":310,"failure":"open"}
{"what":"middleware/registered","id":"v5r.artifact-counter::tools/result","on":"tools/result","order":320,"failure":"open"}
{"what":"middleware/registered","id":"v5r.artifact-counter::math/job-settled","on":"math/job-settled","order":320,"failure":"open"}
```
★★★ **⇒ 6 个中间件全部按声明的钩子／order／failure 模式注册了** ✓✓✓ ★ 后面 15 条是 `middleware/decision`（★ 真的在决策）。

**工具可见性（★ 从 run jsonl 统计）**：
| ★ 工具 | ★ 出现次数 |
|---|---|
| ★ **`vibe_vmu_turn`** | ★ **43** |
| ★ `vibe_vmu_status` | ★ 22 |
| ★ **`vibe_vmu_meeting`** | ★ 21 |
| ★ `vibe_vmu_control` | ★ 15 |
| ★ **`vibe_v5_hire` / `vibe_v5_meeting` / `vibe_v5_assign` / `vibe_v5_motion` / …** | ★ **各 1（工具声明，★ 说明 pack 工具已注册）** |
★★ **⇒ 包工具真的出现在了工具面里** ✓

**拒绝统计**：★ `VMU_NO_OPEN_MEETING` **0**、★ `VMU_INVALID_ARGUMENT` **0**、★ `VMU_ENGINE_UNAVAILABLE` **0**、★ **`ok":false` 0** ⇒ ★ **几乎零拒绝** ✓

**★ 仍未达成的**：★ `state.json` 里 `members: []`、★ `meetings: []` ⇒ ★ **代理没有 `hire`、没有开场会议** ⇒ ★ **`cast:true` 未达成**。
**★★ 但性质变了**：★ **环境 ✓／代码 ✓／pack ✓／中间件 ✓／工具 ✓／零拒绝 ✓** —— ★ **剩下纯粹是【模型是否决定去雇佣和开会】的行为问题，★ 与 vmu 机制无关。**

**★★★★ 这是本阶段真机复验的【决定性成果】**：★ **v5r 整合包在当前 dsh 上完整加载、★ 中间件链真实运行、★ 零畸形回执。** ★ 而它之所以之前完全看不到，★ **是因为我漏了 `packs: ['v5r']` 那一行 config。**
### §6.71 ★★★★★★ **`cast: true` 达成** —— 真机完整流程**跑到了结题**

**代理自己的最终报告（★ 原文摘录，★ 逐条工具调用）**：
```
1. vibe_vmu_status (detail=summary) — closureVote.cast false, eligible [], roster empty
2. vibe_vmu_control hire m1 slot member institution institute → ok:true, seated:true, occupied:1, capacity:0, unlimited:true
3. ... hire m2 → occupied:2
4. vibe_vmu_meeting open agenda + member m1 + roster [m1,m2] → id m-1, state in_session
5. vibe_vmu_turn step (no reply) → awaiting:true, memberPrompt m1 t-1, deliveryPath caller
6. ... step with reply {"vote_solved":true} → receipt round 2, member m2, turn t-2, executed 0
9. vibe_vmu_status summary → closureVoteRecorded {"m1":true}, cast false, for [m1], missing [m2]
12. vibe_vmu_status closure → cast true.
```
★★★★★ **⇒ 从空研究所 → 雇 2 人 → 开会 → 多回合 → 投票 → `cast:true`** ✓✓✓ **这是目标 5 的核心判据。**

**★ 而代理同时报了 6 个【新的真实缺陷】**（★ 全部有回执证据）：
| ★ | ★ 缺陷 |
|---|---|
| ★ **A** | ★ **回复与提示词错配／回合被吞**：★ 返回 m1 的回复后，回执是 `{"round":2,"member":"m2","turn":"t-2","executed":0}` ⇒ ★ **m2 的提示词从未交回**；★ 之后 `missing:["m2"]` 而 t-2 已 "resolved" |
| ★ **B** | ★ **`closureVote.window` 是 `"round"`，★ 而跨轮票被累加**：★ m1 在 round-2、m2 在 round-6 ⇒ ★ **若按轮窗口，round-2 应已过期** |
| ★ **C** | ★ **会议与回合循环脱耦**：★ `answered:0, pending:["m1","m2"], rounds:1`，★ **即使两人都答过、★ `cast:true`** |
| ★ **D** | ★ **两个面自相矛盾**：★ `hasDeliverSeam:false` vs 回合面 `deliveryPath:"caller"` ＋ `instructionDelivered:true` |
| ★ **E** | ★ **`【本轮你实际能调用的工具｜占位段】` 未被替换**（★ **就是 §6.1 的 #12 占位段！**）★ 且 ★ **charter 字段未解析**（`leaderId`…） |
| ★ **F** | ★ **结题票与内容无关**：★ `cast:true` 的理由是"每个有表决权者都判断问题已解决"，★ 而实际内容为空 |

★★★ **⇒ 这一条同时达成三件事**：★ ① **`cast:true`**（★ 目标 5 核心判据）；★ ② **验证了 16 条修复里的多条在真机上生效**（★ 雇人/开会/投票/结题全通）；★ ③ **产出 6 条新的、有回执证据的缺陷**（★ 目标 2 的下一批）。

**★★ 仍未做**：★ `slv-inspect`（★ 0 RED 判据）★ 与 ★ #29 的**票→动议**专验（★ 本轮 `motion` 未出现）。
### §6.72 ★★★★★★ **目标 5 的判据【全部达成】**

**`node scripts/slv-inspect.mjs full-1022-221812.jsonl` 输出**：
```
SUMMARY: 1 session(s), 0 with RED checks
OK: prompt/wire names consistent; all calls visible; counts match
```
★ 两条 `INFO`（★ 非 RED）：★ ① 旧格式无同源块 ⇒ ★ `promptTools` 取自静态清单；★ ② 默认工具（`pwsh`/`glob`/`read`…）未在提示词里被点名 —— ★ **两者都是【预期行为】**，★ 而 `slv-inspect` 自己判为 `INFO` 而非 `RED`。

**判据逐项（★ 这次是【在当前 dsh ＋ 最新代码 ＋ v5r 包已加载】的真机上）**：
| ★ 目标 5 的判据 | ★ 结果 |
|---|---|
| ★ **`cast: true`** | ★ ★**达成**（★ 代理第 12 步：`vibe_vmu_status closure → cast true`）★ |
| ★ **`slv-inspect` 0 RED** | ★ ★**达成**（`0 with RED checks`）★ |
| ★ **`NO_FENCE`** | ★ **0** |
| ★ **`UNKNOWN_FIELD`** | ★ **0** |
| ★ **`FIELD_NOT_APPLICABLE`** | ★ **0** |
| ★ **`BAD_JSON`** | ★ **0** |
| ★ `followStreamWorked` | ★ **true** |
| ★ **`calls(14) vs results(14)`** | ★ **一致** |
| ★ **`visible tools: 88`** | ★ **工具面完整** |
| ★★ **`【本轮可用的工具｜研究员】` 占位段** | ★ **已被替换成真实工具列表**（★ `· vibe_v5_record_progress` …）→ ★ **#12 的占位段在【有席的成员】上正常工作** ✓ |

**★★★ 仍未做的一件事**：★ **#29 的"票 → 动议"专验** —— ★ 本轮**没有出现 `motion`**（★ 代理没发起动议），★ 所以 `motion.votes` 仍未在真机上被验到。

★★★★ **⇒ 目标 5 到此【交账】**：★ **完整流程真机跑到结题、0 RED、四码全 0、工具面一致、占位段正常。**
### §6.73 新缺陷 **A** 的源码复核：★ **归属本来是对的，★ 是【回执歧义】**

**代理报的**：★ *"returning m1's reply for t-1 后，回执是 `{"round":2,"member":"m2","turn":"t-2","executed":0}` ⇒ m2 的提示词从未交回"*。

**★ 源码事实（`kernel/turn/index.js:535-550`，★ `deliverByReturning`）**：
```js
let answeredFor = null
const seam = async ({ turn, text }) => {
  if (supplied !== null) {
    const reply = supplied
    supplied = null
    answeredFor = pendingPrompt && pendingPrompt.member ? String(pendingPrompt.member) : null   // ★ 谁的提示词 ⇒ 谁的回复
    pendingPrompt = null
    return { reply, forMember: answeredFor, … deliveryPath: 'caller' }                         // ★ 归属正确
  }
  pendingPrompt = { member: turn.member, … }                                                    // ★ 新回合的成员
  return { reply: null, awaiting: true, memberPrompt: pendingPrompt, … }
}
```
★★★ **⇒ `forMember` 一直是【提示词所属成员】（★ m1），★ 而 `apply(parsed.reply, null, attributedTo || turn.member)`（`:1178`）用的正是它** ⇒ ★ **回复确实被算给了 m1** ✓
★★★★ **⇒ 所以 A 不是【数据被记错人】，★ 而是【回执里的 `member` 字段有歧义】**：★ 它报的是**正在驱动的新回合的成员**（★ m2），★ 而读者会把它当成"这条回复的归属"。

**★ 已做（★ 作为**安全网**，★ 不是修数据错误）**：★ `supplyMemberReply(reply, forMember)` 现在接受可选的第二个参数、★ `vibe_vmu_turn` 新增 **`reply_for`** 参数并转交 ⇒ ★ **调用者可以显式指明"这是谁的回复"**；★ **不传则完全沿用旧行为**。
**★★ 但真正的改进应当是【改回执字段名／加说明】**：★ 例如把 `member` 改为 `drivenMember`，★ 或加 `repliedFor`。★ **这属于目标 3（对但不够好）**。
**★★★ 结论**：★ **A 是【诊断面歧义】，★ 不是【投票记错人】。★ 这一点必须写清，★ 否则会误导下一轮去"修"一个没坏的归属链。**
### §6.74 新缺陷 **B** 确证并修复：★ **`closureVote.window` 曾是一个【没有实现的承诺】**

**源码事实**：★ `kernel/turn/index.js:116` 是**硬编码字面量** `window: 'round'`，★ 而 `:109-114` 的循环**从不过滤轮次** —— ★ `votes` 是 `Map<id, boolean>`，★ **根本不含轮次** ⇒ ★ **第 2 轮的票到第 6 轮仍然算**。
**★★ 这正是代理报的**：★ *"closureVote.window 是 round，★ 却把不同轮的票聚合了"* ⇒ ★ **它是对的**。
**★★★ 缺陷类别**：★ **一个回执字段承诺了它没有实现的语义** —— ★ 属于本项目明令禁止的"容易导致误解的机制"。

**★ 修复**：★ `window: 'round'` → **`window: 'meeting'`** —— ★ **这是真实语义**（★ 票的生命周期＝会议），★ 且**上一阶段的诊断文档明确允许 `'round' | 'meeting'` 两种取值**。
★★ **为什么不"实现按轮过期"**：★ 那需要**先让票记录带上轮次**（★ 数据模型变更），★ 不是改一个标签能做的；★ 而现在改标签**让回执说真话**。
**★ 测试**：★ `tests/vmu-v5r-tools.test.mjs` 新增两条断言 —— ① `window === 'meeting'`；② **旧轮票确实仍然计数**（★ 这样标签不能悄悄退回 `'round'` 而不红）。
**★ 实测**：`=== VMU V5R TOOLS: 334 passed, 0 failed ===` ✓ ★ 文档 `window: 'round'` 已全部同步为 `'meeting'`。
### §6.75 新建 `docs/acceptance/lessons.md` —— 长期经验教训清单（L1–L26）

**原因**：★ 用户要求把「长期值得记住的教训、自我优化建议」固化成文件，★ 避免遗忘。
**做法**：★ 建 **`docs/acceptance/lessons.md`**，★ **稳定编号 `L1`–`L26`**（★ 后续轮次可直接引用「本轮遵守了 L5、违反了 L11」），★ **每条都写清来源与代价**（★ 没有代价的教训记不住）。

**四段结构**：
- ★ **A. 诊断纪律（L1–L12）** —— ★ 每一条都真实浪费过数小时：读回确认、假绿最危险、诊断面属于被测系统、改对文件、一次一变量、错具名更糟、读源码代替重复实验、中途可读、**「以前是好的」是最高价值信息**、别删不懂的东西、极简重写要逐段对照、检查自己的副作用。
- ★ **B. 阅读回执的纪律（L13–L16）** —— ★ 字段名≠含义（`tools` 是调用记录、`member` 是驱动中的成员）、状态文件可能是启动快照、代理报告是线索不是清单、测了旧版本≠测了现在的。
- ★ **C. 哲学落点（L17–L20）** —— ★ 能力在内核要指到行、无消费者不给机制、**回执必须描述它实际做的事**、下一步是政策不是内核。
- ★ **D. 成本与卫生（L21–L26）** —— ★ 跑完删 clone 并看磁盘、临时文件放 D、配置文件本身可能已损坏、用户时间线优先、别把删东西当优化、**收尾判据要写死成可执行形式**。

★ **并写明与 `AGENTS.md §7` 的分工**：★ 那四条是**审计门禁本身**的纪律，★ 本文件的 A 段是**排查与验证过程**的纪律，★ **互补不重复**。
★ **使用方式**：★ 每轮开始扫 A 段、收尾扫 B/C 段、新教训**追加编号不改旧号**、★ **被推翻的条目标记 `[已推翻]` 而不删除**（★ 被推翻的判断本身也是资产）。
★ `node scripts/check-docs.mjs` ⇒ **`DOC LINT: PASS`** ✓
### §6.76 新缺陷 **C 与 D** 的源码复核：★ **不是缺陷，★ 是【两个独立循环被混读】**

**源码事实（`kernel/meeting.js:467-484`，★ `meeting.status()`）**：
```js
:469  rounds: rounds.length,                                  // \u2605 \u4f1a\u8bae\u81ea\u5df1\u7684\u8f6e
:474  answered: Object.keys(inputs).length,                    // \u2605 \u4f1a\u8bae\u81ea\u5df1\u7684 inputs
:477  pending: asked.filter((m) => !inputs[m] && !silent[m]),  // \u2605 \u4ece asked \u91cc\u7b5b
:481  hasDeliverSeam: typeof deliver === 'function',           // \u2605 \u4f1a\u8bae\u81ea\u5df1\u7684\u63a5\u7f1d
```
★★★ **⇒ 这些字段描述的是【会议对象自己的 `ask()`／回答循环】** —— ★ 而代理全程驱动的是**【`vibe_vmu_turn` 回合循环】**（★ 用 `memberPrompt`／`deliveryPath`／`awaiting`）⇒ ★ **两套循环互不写入。**

**★ 逐条结论**：
| ★ | ★ 代理报的 | ★ 源码复核 |
|---|---|---|
| ★ **C** | ★ `answered:0, pending both` 而两人都答过 | ★ **对会议对象是【真话】** —— ★ 会议从未 `ask()`，★ 回答发生在 turn 循环里 |
| ★ **D** | ★ `hasDeliverSeam:false` vs `deliveryPath:"caller"` | ★ **两个不同的接缝** —— ★ `deliver` 是**会议模块**的（★ 由 `open({deliver})` 注入），★ `deliveryPath` 是**回合循环**的 |

★★ **⇒ 所以 C／D 不是【机制坏了】，★ 而是【两个面都在描述"成员有没有回答"，★ 而没有任何地方说清它们属于不同的循环】。**

**★★ 这本身仍是一个要修的问题，★ 但性质是目标 3（对但不够好）：★ 可识别性／术语歧义** —— ★ 符合本阶段「没有容易导致误解的机制或功能」的要求。
**★ 具体改进方向（★ 下一轮）**：
1. ★ `meeting.status()` 增加一句**明确的自述**：★ 这些数字属于**会议的 ask/answer 循环**，★ **回合循环另有回执**（★ `vibe_vmu_turn` 的 `awaiting`/`memberPrompt`）。
2. ★ 或 ★ 把字段名改得更不可混：★ `answered` → `answeredInMeeting`，★ `hasDeliverSeam` → `hasMeetingDeliverSeam`。
3. ★ **`docs/` 里把两套循环的边界写清**。

**★★★ 本轮不再"修"归属或计数** —— ★ **按 L15：代理的报告是线索，★ 不是可执行缺陷清单；★ 照原话去改，★ 会改坏两套本来各自正确的循环。**
### §6.77 已落地：★ `meeting.status()` 自述所属循环（★ 加法，★ 零破坏）

**改动**：★ `kernel/meeting.js:467` 的 `status()` 新增两个**只增不改**的字段：
- ★ `loop: 'meeting-ask-answer'`
- ★ `note: '★ rounds/answered/pending/silent/refused 描述【本会议自己的 ask()+answer() 循环】。成员回答 vibe_vmu_turn 的提示词属于【另一个循环】，不会增加这些数字；那一个要看 vibe_vmu_turn 自己的回执（awaiting/memberPrompt/deliveryPath）。hasDeliverSeam 指的是 open({deliver}) 注入的【会议接缝】，不是回合循环的 deliveryPath。'`
★ **原有字段一个没动** ⇒ ★ **消费者零破坏**。
★ **实测**：`=== VMU MEETINGS: 193 passed, 0 failed ===` ✓

**★★ 而测试断言【没加上】，★ 过程本身又是一课（★ 已记入 L2）**：
1. ★ 第一次把断言**追加到文件末尾** ⇒ ★ **它在 `process.exit` 之后 ⇒ 从未执行**，★ 所以 `193 passed` **没变**。★ **差一点就把"没跑"当成"通过"。**
2. ★ 移到汇总前之后 ⇒ ★ **3 条全红** —— 原因是我用错了访问器：★ `meetings.open()` 返回的是**回执**、★ `status()` 在 **`meetings` 服务**上，★ 而服务面 `status({id})` 的返回**不含 `loop`**（★ `loop` 在**单个 meeting 对象**的 `status()` 上）。
3. ★ **处置**：★ **移除这 3 条断言、保留源码改动** —— ★ 当前 `193 passed, 0 failed` **是绿树**，★ 而"给 `loop`/`note` 加断言"**列为下一轮的待办**（★ 需要先找到 `meeting.js` 里单个 meeting 对象的导出路径）。
**★★★ 结论**：★ **源码改动是安全的（加法、193 绿），★ 但【它的断言还没写】—— 这一点必须如实记录，★ 不能因为 193 绿就说"已测"。** ★ 按 `L2`／`L16`：**没测就是没测。**
### §6.78 ★★★★★ 差点造出"没有消费者的机制" —— `meetingView()` 才是真机的读取路径

**发现**：★ 上一轮我只给 **`meeting.js` 的 `status()`** 加了 `loop`/`note`。★ 而 `tools/meeting.js` 有**两条**读取路径：
```js
:173  const primitive = kernel.liveMeeting(pid)
:174  if (primitive) return Object.assign({ ok: true, action }, primitive.status())        // \u2605 \u539f\u8bed \u21d2 \u6211\u7684\u5b57\u6bb5\u4f1a\u6d41\u51fa
:178  if (svc && typeof svc.meetingView === 'function' && serviceHas(pid)) {
:182    return Object.assign({ ok: true, action, registry: 'service', quorum }, view)      // \u2605 \u670d\u52a1\u9762 \u21d2 \u4e0d\u542b\u6211\u7684\u5b57\u6bb5
```
★★★ **而那次真机用的是 `vibe_v5_meeting` ⇒ 服务面 ⇒ `meetingView()`** ⇒ ★ **我加的字段【在唯一重要的路径上没有消费者】** —— ★ **这正是红线 4「没有消费者，就不给机制」**，★ 而我差点自己违反它。

**★ 修复**：★ **`meetings.js:1190 meetingView()` 也返回 `loop: 'meeting-ask-answer'` ＋ 同样的 `note`**。
**★ 实测**：★ `=== VMU MEETINGS: 193 passed, 0 failed ===` ✓ ★ `=== VMU V5R TOOLS: 334 passed, 0 failed ===` ✓

**★★★ 这一轮的教训（★ 对应 `L18`／`L17`）**：★ **"我加了字段"不等于"字段会被读到"** —— ★ 必须找到**那条真实调用路径**，★ 并确认**两个读取面都覆盖**。
★ **而这一条本可以在上一轮就发现**：★ 代理报的是 `vibe_vmu_meeting {action:"status"}` 的**回执**，★ 而我当时只改了内核单对象的 `status()`，★ **没有顺着 `tools/meeting.js` 走一遍** —— ★ **`L3`（诊断面就是被测系统）的又一次变体**。
★ **仍待办**：★ **给 `loop`/`note` 加断言**（★ 现在有两个面可测：★ 服务面走 `meetingView`，★ 原语面走 `status()`；★ 下一轮用工具面调用最稳）。
### §6.79 `loop`/`note` 的断言已补上（★ 195/0）★ 而这次卡了四轮，原因是一个回执字段名

**最后成功的写法**：★ `svc.open({type:'ordinary'})` ⇒ ★ **回执字段是 `meeting`、★ 不是 `id`** ⇒ ★ 用 `opened.id` 会去寻址 `meeting: "null"` ⇒ ★ 被 `VMU_NO_SUCH_OBJECT` 拒绝（★ 实测原文：★ `no such meeting: null | hint=open: m1`）。
**实测**：`=== VMU MEETINGS: 195 passed, 0 failed ===` ✓ ★（★ **新增 2 条**：★ 服务面 `meetingView()` 的 `loop` 与 `note`）。

**★★★ 四次失败的原因（★ 全部按 `L13`：回执字段名≠含义）**：
1. ★ `meetingsMod` 不存在（★ 该文件用直接导入 `createMeetings`）
2. ★ `meetings.open()` 返回的是**回执**，★ `status()` 在**服务面**上、且是**设置面状态**（★ 不含单会面字段）
3. ★ `svc.open(...).id` 是 `undefined` —— ★ **字段名是 `meeting`**
4. ★ 构造参数要照既有可跑样例（★ `settings: {}`、★ `log: () => {}`）

★★ ★**这四步每一次都是"我以为的 API"和"模块真实的 API"不一致** —— ★ 而**纠正的依据全在模块自己身上**（★ 拒绝消息里的 `hint`、★ 既有样例的写法）。★ 这一条已写进 `AGENTS.md §7.3` 的配套纪律，★ **本轮又一次印证**。

### §6.80 ★★★★★ 用户追问「消费者意味着什么」—— 而我在 §6.78 里用错了这个词

**仓内权威定义（逐条有行号）**：
- `01-philosophy.md:42` —— 「此处"消费者" ＝ 使用者可能需求，★ **不是**"仓内代码有没有引用"」
- `01-philosophy.md:44` —— §1.4.1「"消费者"到底指谁（★ 创始人 2026-10-18 明确；★ 防止这条尺子再被误读）」
- `01-philosophy.md:46` ——★★ **本仓的"消费者" ＝【使用者可能的需求】，★ 不是【仓内代码对它的引用】**
- `01-philosophy.md:63` ——★★★ **"没有消费者"的真身是：★ 一个【没有任何路径让用户用上】的机制** —— 例：声明了却没人读的设置键（用户改了没效果）／暴露了却没有任何面或中间件能调的方法
- `01-philosophy.md:65` ——★★ **词表入口（权威）**：本节 §1.4.1–§1.4.4 定义 **消费者／读点／接线／示用** 四个词
- `01-philosophy.md:67` ——★★★ §1.4.2「两个层**同词不同义**，必须分开叫（★ 这是歧义真正的根）」
- `01-philosophy.md:89` ——★ §1.4.4「**静默地"声明了却不生效"仍是缺陷**」

**★★两层（§1.4.2）**：
| ★ 层 | ★ 该问什么 | ★ 该叫什么 |
|---|---|---|
| ★ **设计／准入层**（要不要给这个机制） | 使用者**可能**需不需要它 | ★ **消费者** |
| ★ **接线／门禁层**（这个旋钮今天有没有效果） | 仓内**有没有读点** | ★ **读点／读取者（reader）** |

**★★★ 所以我在 §6.78 里说「这是红线 4」是错的**：★ 我当时问的其实是【有没有读点】（**接线层**），★ 而我用了【消费者】（**设计层**）这个词 —— ★ **正是 §1.4.1、§1.4.2 写在那里要防的那种误读**。
**★★ 但结论仍然成立、实修仍然正确**：★ 若不补 `meetingView()`，`loop`/`note` 就是 §1.4.4 说的「**静默地声明了却不生效**」—— ★ 它们会存在于内核却永远到不了服务面的回执里。★ **修法对，标签错。**
**★★★ 一个反向确认**：★ 按 §1.4.1，`loop`/`note` **有消费者**（使用者确实需要知道两套循环的区别）—— 所以它们**该存在**；★ 而它们当时**没有读点**，所以**该接线**（而不是该删）。★ §1.4.3 给的删除举证责任，我一条都没满足 —— ★ **所以删除从一开始就不在选项里**。


### §6.81 缺陷 **E**（charter 字段未解析）的**精确根因**：决策机制完整，**没有人去选那个分支**

**机制是完整的（逐条行号）**：
- `v5r-charter.js:125` `charterSections({ hasLeader = true })` —— `hasLeader:false` 时把每个 `leader-conditional` 块换成 `leaderless` 变体
- `v5r-charter.js:99` `CHARTER_LEADER_VARIANTS`；`:117` `CHARTER_LEADERLESS_OMISSIONS`（**缺变体就具名**）；`:115` 具名占位文本
- `v5r-charter.js:108-110` 自述：**「知道本所无院士的装配体要传 `{ hasLeader: false }`」**

**★★★ 而没有人传**：
- `v5r-charter.js:148` `export const CHARTER_SECTIONS = Object.freeze(charterSections({ hasLeader: true }))` —— **写死 true 的冻结常量**
- `v5r-core.js:390` 导入的就是这个常量；`:402` `const v5rCharterSectionsGlobal = () => [...CHARTER_SECTIONS, …]` —— **无参数**
- **全仓 grep `charterSections(` 只有两处命中**：定义处与那个常量 ⇒ **没有第二个调用者**

**★★ 于是**：无院士研究所也永远发「有领头人」那段，而 `{{ setting:vmu.turn.leaderId }}` 默认为空（`schema.js:226 def:''`）⇒ 渲染成 `本所的领头人是**院士 。` ⇒ **代理报「charter 字段未解析」完全属实。**

**★★★ 不半做的理由**：单把 `v5rCharterSectionsGlobal` 加上 `hasLeader` 参数、而没有任何策略传它，就是 **§1.4.4 说的「静默地声明了却不生效」** —— 刚刚在 §6.78–§6.80 踩过一次同样的坑。
**★ 下一轮的完整修法（两半必须同一次做）**：
1. `v5r-charter.js` → 保留 `CHARTER_SECTIONS`（兼容），新增 `charterSections` 的导出供策略使用；
2. `v5r-core.js:402` `v5rCharterSectionsGlobal({ hasLeader = true } = {})` → 内部用 `charterSections({ hasLeader })`；
3. **策略层（`decideSections`）从「是否有在册领头人」推出 `hasLeader` 并传入** —— 这一半是**消费者**，少了它就是白做；
4. 断言：无领头人时 `CHARTER_LEADERLESS_MISSING_TEXT` 不出现、且任何 section 里不再出现 `院士 ` 空槽。
