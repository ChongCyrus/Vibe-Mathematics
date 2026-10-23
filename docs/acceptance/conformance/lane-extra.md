# lane-extra —— phase 12 规则一致性核查（Round 2，vmu-core 分片）

- **仓库**：`D:\wd\vibemath开发\Vibe-Mathematics`（只读审计；本轮唯一写文件＝本文件）
- **台账**：`docs/acceptance/phase12-v5r-rules-conformance.md`（用户 2026-10-23 所给《v5r pack 的运行规则》的 42 行对照表）
- **本分片负责的 9 行**：B1、B2、B9、B10、F1、F2、F3、F4、F5
- **时间**：2026-10-23（turn 46）
- **判定口径（本轮强制三分）**：
  - **(a) 提示词写了** —— 只说明活提示词里有这句话，不代表有机制；
  - **(b) 机制存在且可达** —— 从工具/宿主入口能追到消费它的代码行；
  - **(c) 有门禁** —— 有具名拒绝/断言把这条规则**拦住**。
  > 三者任一缺失都要写"缺什么"。**"声明了但无消费者"** 的键/参数单独标出。

## 0. 九条结论一览

| 条目 | 规则要点（用户原文摘要） | (a) 提示词 | (b) 机制可达 | (c) 门禁 | 判定 | 缺口一句话 |
|---|---|---|---|---|---|---|
| B1 | 公共 Verified 文件夹；只有 p=1 可入；只有辩论能把 p 改成 1 | 有（且写的是 m 票） | **无** | **无** | ❌ 缺口 | 没有 verified 轨/类/字段，没有"p=1 只能来自辩论"的写入门 |
| B2 | 公共蓝图：总目标技术路线；按时更新；院士+常驻共同设计；**最终编辑权归院士** | 仅作为"路径"被插值 | 只有路径字符串 | **无** | ❌ 缺口 | 无蓝图对象、无编辑权闸、无更新节奏 |
| B9 | 分派后各自负责部分的论文 | 有 | **有**（`vibe_v5_paper`→`kit/paper.js`） | 部分（editor 席位） | ✅ 具备 | 无"必须分派"强闸（可选） |
| B10 | 脚本文件 | 有（且**禁止**临时脚本） | 部分（`math_computation` 回执归档） | 有（core 规则拒 `vibe_vmu_script`） | ⚠️ 部分 | 无"脚本文件夹/轨"这一承载；只有可复核回执 |
| F1 | 数学计算工具；**所办可设并发上限** | 有 | **有**（call-time 读取 + 具名拒） | 有（`VMU_RESOURCE_BUDGET`） | ✅ 具备 | 写入面无席位约束（`vibe_v5_set` 可被任何能看到它的成员调用） |
| F2 | 人工干预决策/运行；断点续跑 | 有 | **有**（human 门 + pause/resume + 耐久投影） | 有（默认零机制） | ✅ 具备 | v5r 默认 `gatedActions:[]` ⇒ 默认不闸任何动作 |
| F3 | 特殊权限/请求可经报告所办向用户询问 | 有 | **部分** | **无** | ⚠️ 部分 | 成员→所办无投递通道；C-30 咨询门在活路径**不可达** |
| F4 | 功能尽量经代理可执行命令实现，而非每轮输出 JSON | 反向（默认教"不要调工具"） | 部分（37 个 pack 面 vs JSON 答复契约） | — | ⚠️ 部分 | `fixtureMode` 默认 `no-tools`；答复契约仍是 JSON 围栏 |
| F5 | 提示词与规则完全相符：删除「m 票」「每轮 JSON」 | **残留明确** | m 票机制仍活（verdict/quorum） | — | ❌ 不符 | 文字与机制**互相自洽、但与新规则相反**；只改文字会更糟 |

**覆盖率（诚实）**：本轮**只查了台账 42 行中的这 9 行（21%）**；其余 33 行（A1–A4、B3–B8、B11、C1–C3、D1–D15、E1–E4）**本轮完全没动**＝归其它分片。本文件不对它们作任何断言。

---

## 1. B1 公共 Verified 文件夹 —— ❌ 缺口

**规则**：只有布尔概率＝1 的命题（或参考文献中的命题）可加入 `Verified/`；**只有辩论**能把概率改成 1，否则只能 ∈(0,1)。

### (a) 提示词写了 —— 有，但写的是旧机制（m 票）

- `packs/v5r/prompts/v5r-persona.js:41`（规章【五】起始段，另见 `:62`、`:186`、`:191`、`:196`、`:201` 五个按 m=1/2/3 生成的变体）：
  > 「任何命题 / 论断 / 方法 / 子问题的结论，要进入 Verified/，必须满足：(a) 至少有 m = N 名有表决权者…投出**布尔概率值**；(b) 这些票**全部**是 1 或**全部**是 0…」
- `packs/v5r/prompts/v5r-blocks-a.js:270`、`:336`、`:341`、`:375`：
  > 「任何对象要进 Verified/ 仍须 m 票布尔一致」
- `packs/v5r/prompts/v5r-blocks-a.js:355–390`：【五、表决与定论（求真门槛）】整段 = 两段式表决（独立初评 → 公开辩论，辩论上限 3 轮）。

⇒ 提示词层**有** `Verified/` 这个概念，但实现方式是 **m 票**，不是"辩论把 p 改成 1"。

### (b) 机制存在且可达 —— **无**

- `packs/v5r/settings/defaults.json:19` 的 `vmu.records.tracks`（10 项）：
  `progress / routes / obstacles / rejected / state / propositions / methods / problems / feedback / paper` —— **没有 verified**。
- `kernel/records.js`：`put({ id, track, kind, title, body, tags, settled, permanent, by })`（`kernel/records.js:457`）只有 `settled` 布尔；门槛是 `vmu.records.requireSettledRecords`（`kernel/records.js:219,466-476`，v5r 在 `packs/v5r/settings/defaults.json` 里设为 `false`）。
- `kernel/records.js` 全文的 `verified` **只有外部引用校验**那一处（`:796-816`，`externalVerified` 计数）——与"命题进入 Verified/"无关。
- 队列里还有 `vmu.records.allowedKinds`（`kernel/records.js:476`），v5r 的值里**没有** `verified` 这个 kind（只有 `rebuttal` 等）。

### (c) 门禁 —— **无**；反而有一个"直接写 p=1"的正路

- `packs/v5r/tools.js:1001`（`vibe_v5_record_proposition` 的声明）：
  > 「Record a proposition/lemma card… REQUIRES statement, value, motive and p (your probability that it is true); **the card is settled when p is 1 or 0**」
  ⇒ 成员**直接写 p=1** 就让卡片"settled"，**没有任何辩论/表决闸**。
- `packs/v5r/tools.js:1162` `vibe_v5_verdict` → `toolVerdict`：把 [0,1] 投进 `kernel.liveBallot(id)` 的 live ballot（内核有真正的表决票箱），但**没有任何代码把表决结果 promote 到 verified 轨**（因为轨不存在）。

### 对照：v3 包里这件事**做过**（说明不是框架无能，是本 pack 没接）

- `packs/v3/index.js:55,82`：tracks 含 `'verified'`。
- `packs/v3/middleware/dataplane.js:619`：`promoteVerified` 对未 settled 的命题**具名拒绝**
  `VMU_STATE`："proposition … is not settled (概率=…), so it cannot enter the verified track"。

### ★ 对台账既有证据的更正（假阴性）

台账 B1 行原文写：「★ 全仓 `grep -rn "Verified" --include=*.js vibe-math-vmu/` 只命中 `kernel/auditchain.js` 的 anchorVerified（无关）」。

**实测该结论不可复现**：

```
$ grep -rn "Verified" --include=*.js vibe-math-vmu/ | wc -l
85
$ grep -rln "Verified" --include=*.js vibe-math-vmu/       # 15 个文件
kernel/auditchain.js  kernel/crypto.js  kernel/records.js  kit/paper.js
packs/v3/index.js  packs/v3/middleware/dataplane.js  packs/v3/middleware/defects.js
packs/v3/middleware/verify.js  packs/v3/prompts/paper.js
packs/v5r/prompts/{v5r-assistant,v5r-blocks-a,v5r-blocks-b,v5r-core,v5r-persona,v5r-prompts}.js
```

⇒ 结论（机制不存在）**仍然成立**，但台账给出的那条证据是错的（大概率是管道/大小写/输出截断造成的假阴性）。**结论对、证据错**在验收表里比"没有结论"更危险，故在此更正。

### 判定：❌ 缺口

缺三样：① 一条 `verified` 轨（或等价目录投影）；② 一个"p=1 只能由辩论/表决产生"的**写入门**（现在是 `vibe_v5_record_proposition` 直接落 p=1）；③ 从表决结果到 verified 轨的 **promote 路径**（v3 有 `promoteVerified`，v5r 没有）。

---

## 2. B2 公共蓝图 —— ❌ 缺口

**规则**：公共蓝图 = 实现总目标的完整技术路线设计/策划；**按时更新**；院士 + 常驻研究员**共同设计**；**最终编辑权归院士**。

### (a) 提示词 —— 只有"路径"被插值，蓝图内容本身不在提示词里

- `packs/v5r/prompts/v5r-blocks-b.js:584`、`:236`：
  > 「详细操作按需读 `{{ setting:vmu.turn.protocolPath }}`」

### (b) 机制 —— 只有一个字符串设置，无对象、无面

- `settings/schema.js:212`：`{ key: 'vmu.turn.protocolPath', type: 'string', def: 'Shared/Protocol.md', hot: HOT.H2, who: 'office', doc: 'protocol path named by the compact reply catalogue (relative to the session working directory)' }`
- `packs/v5r/settings/defaults.json:12`：`"vmu.turn.protocolPath": "Shared/Protocol.md"`
- `packs/v5r/tools.js` 的 **37 个面里没有任何 blueprint / protocol / plan-doc 面**（面清单：`record_*`、`say/message/inbox/wait`、`task_*`、`hire/fire/assign/nudge/prioritize/feedback`、`report/overview/tool_help/read_library`、`meeting/motion/second/poll_*/verdict`、`start/stop/pause/resume/configure/set`、`lean_*`、`paper`）。
- 也没有蓝图轨：`vmu.records.tracks` 里没有 blueprint/protocol 项（见 B1 的 `defaults.json:19`）。

### (c) 门禁 —— **无**

- 没有任何代码把"谁能写 `Shared/Protocol.md`"与角色绑定；`vmu.turn.protocolPath` 的写者是 `office`（H2，重启生效），与"最终编辑权归院士"**无关**。
- 没有"按时更新"的语义（无 due/reminder/checkpoint 键被这个路径消费）。

### 判定：❌ 缺口

缺：① 一个**蓝图对象**（轨记录或受管文件域）；② 编辑权闸（共同设计 + 最终批准=院士，现在是纯文本文件）；③ 更新节奏（提醒/逾期具名）。

---

## 3. B9 分派后各自负责部分的论文 —— ✅ 具备

### (b) 机制存在且可达

- `kit/paper.js:111` `start({ target, participants = [], editor = 'academician', lang = 'zh', format = 'both' })`；状态机 `:13` `['writing','reviewing','awaiting-editor','finalized']`。
- 按人分部分：`kit/paper.js:148-149`
  `const previous = state.parts[part.member] || null; state.parts[part.member] = { recordId, fingerprint, round, at, title }` ⇒ **每人一份、带指纹**。
- 分派复核：`kit/paper.js:168-169` `state.reviewOf[member]` 决定"谁复核谁的部分"。
- 定稿前必须一致：`kit/paper.js:191-206`（`unanimous` 或到达轮次上限 `capped`）。
- 入口面：`packs/v5r/tools.js:834` `toolPaper` → `vibe_v5_paper`，actions `start / part / review / advance / final / render / status / compile / sections`（`:843` 起）。
- ★ 注：`packs/v5r/middleware/paper-dispatch.js` 是**已废弃**的平行实现（文件头 `PAPER_DISPATCH_DEPRECATED`，replacement=`vibe_v5_paper`）；活路径是 `vibe_v5_paper → packs/v5r/paper.js → kit/paper.js`。

### (c) 门禁 —— 部分

- `kit/paper.js:226-232`：非 `editorDefault`（academician）定稿 ⇒ 具名拒 `VMU_NOT_PERMITTED`，并自曝
  > 「the original lets the office finalize only after consulting the institute — **that path is a named gap here**」
- 没有"每篇论文必须按人分派"的强闸（可以 start 后直接写？—— `part` 才落 parts，但不分派不拒）。

### 判定：✅ 具备（承载真实、可达、按人计），缺口=可选强闸（与本条规则无冲突）。

---

## 4. B10 脚本文件 —— ⚠️ 部分

### (b) 机制 —— 没有"脚本文件"这一承载；但有替代的"可复核回执"

- **没有**脚本面/脚本轨/脚本目录约定（37 面清单里无；`vmu.records.tracks` 里无）。
- 脚本**运行**工具 `vibe_vmu_script`（宿主侧，`kernel/script-bridge.js`）在 v5r 里被**机构规则直接拒绝**：
  `packs/v5r/prompts/v5r-core.js:228-236`（rule `v5r-core-no-adhoc-scripts`，`on:['tools/pre-execute']`，`deny.code='VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS'`，消息「v5r-core：本机构不允许临时脚本直接运行（请走归档/复算流程）」）。
- 替代路径**是**明写的：`packs/v5r/prompts/v5r-blocks-b.js:265-267,584`
  > 「math_computation {op: probe|run|receipt|install, engine, mode: code|file|expr, …} —— 先 probe 预检引擎/包/许可，再调引擎计算并把**脚本与输出归档成可复核回执**… shell 兜底不算归档」
  > 「脚本修改后用同一源文件重跑，旧回执不代表新代码」
  实现在 `kernel/mathadapters.js:64-89`（numpy/scipy/pandas/sympy 描述符＋probe＋installCommand）与 `docs/15-math-computation-toolbox.md`。

### 判定：⚠️ 部分

有"脚本可归档、可复算"的替代承载（回执），**没有**"脚本文件夹"这一独立承载（无版本/归属/检索）。若规则只要求"脚本文件有地方存"，回执路径勉强算；若要求"所为机构功法库"，则缺。

---

## 5. F1 数学计算工具 + 所办可设并发上限 —— ✅ 具备（附一处授权缺口）

### (b) 机制 —— 键存在，**且在调用时被真正消费**

- `settings/schema.js:555`：`vmu.math.maxParallel`，`positiveInteger`，`def: 1`，`hot: HOT.H1`，`who: 'office'`
  （doc 明说：只**管数学运行**并发，不管"每轮唤醒几名成员"——后者是 `vmu.limits.maxLiveMembers`）。
- `settings/schema.js:258`：`vmu.math.leanJobsMaxParallel`，`def: 1`，`HOT.H1`。
- **消费点（这是"设了值≠生效"的关键）**：
  - `kernel/mathtools.js:586-589`：`evalKey('vmu.math.maxParallel')`，`if (active >= K.maxParallel) capRefusal('VMU_RESOURCE_BUDGET', …, 'vmu.math.maxParallel', enforced)` —— **调用时读**，超限**具名拒**（不自旋）。
  - `kernel/mathjobs.js:41,451`；`:497` 注释「`running() > maxParallel` let `maxParallel + 1`」；`:585-595` 队列按 `c.maxParallel` 等槽。
  - `kernel/lean.js:599` `while (runningCount() < c.leanJobsMaxParallel)`；`:592` 注释记了一个实测缺陷：「一个作业结束后**必须再 pump**，否则 leanJobsMaxParallel=1 时队列停在第一个作业之后」。
- 数学计算工具：`kernel/mathadapters.js:64-89`（numpy/scipy/pandas/sympy；`probe` 走 stdlib、`installCommand` 只给指引）、`kernel/mathtools.js`、Lean 面 `vibe_v5_lean_run|job|lib|read|archive`（`packs/v5r/tools.js:1204-1234`）、`docs/15`。

### (c) 门禁 —— 有（`VMU_RESOURCE_BUDGET`）

### ★ 设置通道的两面性

- 正面：`packs/v5r/tools.js:811` `vibe_v5_configure`（`params:{key:value}`）与 `:833` `vibe_v5_set` 走 `applyDeclaredSetting` → `kernel.setSettingsValue`；H1 键回执 `effective:'立即生效（H1）'`，H2/H3 各自具名（`packs/v5r/tools.js:795-812`）。⇒ "所办可通过参数设上限"**成立**。
- 缺口：`applyDeclaredSetting` 里
  `packs/v5r/tools.js:803-805`：`const actor = opts.by || def.who || null`，注释「A pack tool has no human identity, so it acts AS the declared owner」
  ⇒ 内核的 owner 闸**必然通过**（`by` 就是声明的所有者）；而 `toolSet`/`toolConfigure` **本身不做席位检查**（对比同文件 `toolPollOpen`/`toolPollClose` 都调 `requireChairSeat`，`packs/v5r/tools.js:657`、`:668`）。
  ⇒ 任何**能看到这个面**的成员都能改 `vmu.math.maxParallel`。"只有所办能设"这条**没有门禁**支撑，只有"成员是否看得见该面"一层（该可见性由宿主 `turn.visibleToolsOf` 提供，本轮未逐成员核 ⇒ 留作待核）。

### 判定：✅（上限存在、被 call-time 消费、可 H1 即时改、超限具名拒）；授权面 ⚠️ 见上。

---

## 6. F2 人工干预决策/运行 + 断点续跑 —— ✅ 具备（默认零机制）

### (b) 机制

**人工干预（审批门）**
- `kernel/human.js:126`：`gatedActions: listOf(sget('vmu.human.gatedActions'))`；`:124` 注释「`gatedActions: []` 是零机制默认：什么都没声明时**没有任何动作被闸**」。
- `kernel/human.js:342-369`：动作不在 `gatedActions` ⇒ 回执 `note:'this action is not in vmu.human.gatedActions: nothing is gated (zero mechanism)'`；在则按 `approvalTimeoutMs`/`onTimeout` 三态处理，`enforced` 列出真正求值的键。
- `kernel/human.js:414`：`gate(req)` 待批队列（`queueCap` 超出**具名拒**，不静默丢）。
- 键：`settings/schema.js:1004-1008`（`gatedActions` / `approvalQueueCap` / `onTimeout` / `defaultAllowAcknowledged` / `vetoLiftRoles`）、`:815-820`（`vetoScope` / `vetoNeedsReason` / `approvalTimeoutMs` / `onTimeout` / `dashboardScope`）。
- 宿主面：`host.js:244-245` `vibe_vmu_human`（families `vmu.human.` / `vmu.resume.`）。

**断点续跑**
- 控制面：`packs/v5r/tools.js:717-751` `vibe_v5_pause` / `vibe_v5_resume`；`vibe_v5_resume` 显式走 `kernel.resume(reason)`（**控制流**），注释记了实测 bug：旧实现调 `kernel.controlService.resume()` —— 「answered ok while the kernel stayed paused (measured in the A1 probe: `controlState.state === 'paused'`, `resumes:0`)」。
- 耐久面：`settings/schema.js:999-1004,1049`（`vmu.resume.autoRecover` / `projections` / `keepRecoveries` / `readBack` / `journalCap` / `writeThrough`）＋ `kernel/resume.js`（`attachProjection` 写穿、`VMU_RESUME_PROJECTION_GAP` / `VMU_RESUME_READBACK_DRIFT` 具名）；`host.js` 亦以 `vmu.resume.` 家族点灯同一面。
- 停止是终态：`packs/v5r/tools.js:731,750` 的 hint 明说「a stopped institute cannot be resumed」（不假装能续）。

### (c) 门禁 —— 有，但**默认不闸**

- v5r 的默认值：`packs/v5r/settings/defaults.json:44-46` ⇒ `human.vetoLiftRoles:["office"]`、`onTimeout:"hold"`、`gatedActions:[]`。
  ⇒ 能力在、门在，**但默认什么都没闸**（这符合本仓"没有消费者就不给机制"的红线，但也意味着"人工干预"在本 pack 默认是**可选**而非**强制**）。

### 判定：✅ 具备；⚠️ 提示：若规则要求"关键动作必须人工批准"，则需在 pack 里声明 `gatedActions`（现在为空）。

---

## 7. F3 特殊权限/请求可经报告所办向用户询问 —— ⚠️ 部分

### (a) 提示词写了

- `packs/v5r/prompts/v5r-blocks-a.js:3`（LaTeX 缺失分支）：
  > 「③ 仍找不到就**如实上报所办（或群聊）**，由**所办**向用户确认（安装 TeX 需用户明确同意）；④ 尚无回应则照旧降级…」
- `packs/v5r/prompts/v5r-blocks-a.js:264-265`：「⑥ 协调资源…向所办建议增聘/解聘常驻研究员；⑦ **对外代表**——通过所办向外部汇报与提要求」
- `packs/v5r/prompts/v5r-persona.js:34`：「**所办（对外接口）** —— 不参与研究、不投票。代表本所与外部沟通并转达外部指令。」

### (b) 机制 —— 部分

- `vibe_v5_report`：**存在且可达**，但**只读**。
  `packs/v5r/tools.js:161-176` `toolReport`：只组装 roster/tasks/openMeetings 计数，`note:'read-only composition of the published faces; no new kernel capability and no template invention'`。
- `vibe_v5_message`：**单向**（所办→所内）。
  `packs/v5r/tools.js:995`：「Relay a message **from the office/human into** the institute: to a member id, to "all", or to "voters"」。
- **成员→所办没有专门投递**：成员侧只有 `vibe_v5_say`（群聊）与 `vibe_v5_message`（到成员 id）；所办**不是名册成员**，故 message 收不到、inbox 也不会有所办来信。⇒ "上报所办"实际只有"在群聊里说话"一条（而所办是否读群聊取决于宿主会话，不是内核机制）。
- 通用询问/批准面是 `vibe_vmu_human` 的待批队列（见 F2），但**与"报告所办"没有接线**（没有任何代码把 paper 咨询/请求转成 human gate 的待批项）。

### ★ C-30 `vmu.paper.officeConsult` —— 声明齐全，但**活路径不可达**（本轮最硬的一条证据）

- 声明：`settings/schema.js:1065-1069`（`officeConsult` / `officeConsultOn` / `officeConsultTimeoutMs` / `officeConsultOnTimeout` / `officeConsultExemptRoles`）；v5r 值：`packs/v5r/settings/defaults.json:60-64`（`required` / `finalize` / `0` / `hold` / `[]`）。
- **读者**：`kernel/paper.js`（`WIRED_KEYS` 含这 5 键；`cfg()` `:139-187`；门 `:233-272`；拒绝文案 `:322-324`「cannot finalise … the office-consultation wait expired」）。
- **但 `kernel/paper.js` 的 `createPaper` 没有生产调用者**：
  - `grep -rn "createPaper(" --include=*.js --include=*.mjs vibe-math-vmu` ⇒ **只有定义**（`kernel/paper.js:111`）。
  - 全部引用者：`tests/vmu-paper.test.mjs`、`tests/vmu-paper-consult.test.mjs`、`tests/audit-enforced-consistency.test.mjs`。
  - 内核自己就这么写：`kernel/index.js:1415`「`paper` has NO instance in this assembly (nothing constructs it here), so there is nothing to wrap.」
- 活论文面是另一条链：`packs/v5r/tools.js:834,840` `vibe_v5_paper` → `packs/v5r/paper.js:16,52` `createPaperSubsystem` → `kit/paper.js:createPaperFlow`；而 `kit/paper.js:226-232` 把"所办咨询后定稿"标成 **named gap**（原文见 B9）。
- ⇒ C-30 门在**生产路径上不存在**。它是一组"有声明、有读者、但读者模块未被装配"的键（与"死键"不同：读者代码真实存在且有测试，只是没进装配）。

### 判定：⚠️ 部分

- 能力：报告面有（只读）、对外通道是"所办＝宿主会话"本身；
- 缺：① 成员→所办的**请求投递/工单**（现在是群聊口头）；② 请求→用户→回执的**正路与记录**；③ C-30 咨询门接到**活**论文路径（现在只接在没装配的 `kernel/paper.js` 上）。

---

## 8. F4 功能尽量通过代理可执行命令实现，而非每轮结束输出 JSON —— ⚠️ 部分

### 正面：工具面确实承担了主要功能

- `packs/v5r/tools.js` 共 **37 个面**（`grep -n "name: 'vibe_v5_"` ⇒ 994–1234 行）：记录、通信、任务、雇佣、会议/动议/表决、控制、设置、Lean、论文。⇒ "能做成工具的都做成工具了"这一半**成立**。

### 反面：答复契约仍是"每轮一个 JSON 围栏"，且默认配置**教模型不要调工具**

- `kernel/turn/index.js:14`：「parsing is strict: no fence, malformed JSON and unknown fields are three DIFFERENT named refusals」；实现 `:188-204`（取最后一个可解析围栏）与 `:863-878`（三档解析）⇒ **每轮答复的解析器就是为"末尾 JSON 围栏"写的**。
- 默认档位让问题更重：`packs/v5r/settings/defaults.json:24` `"vmu.v5r.fixtureMode": "no-tools"`（`settings/schema.js:112`，enum `no-tools|tools`）→ `packs/v5r/middleware/prompt-switches.js:73-85` 在**调用时**读它，决定开哪一段：
  - `'v5r-fixture-constraint'`（`!== 'tools'` 时开）：`packs/v5r/prompts/v5r-core.js:456-472`
    > 「本轮不要调用任何工具（不要 read/grep/搜索/写文件）；只读本轮状态块推理，最后只输出一个 json 围栏回执。」…「★★ 若是结题表决回合：整个回复必须**只是一行 JSON**…`{"vote_solved": true}`」
  - `'v5r-fixture-tools'`（`=== 'tools'` 时开）。

### 判定：⚠️ 部分

缺：① 把 `vmu.v5r.fixtureMode` 默认改成 `tools`（或删除 no-tools 段）；② 把"每轮末 JSON"从**答复契约**降级为"只有结题/表决回合需要"（现在提示词多处写成通用要求，见 F5）。

---

## 9. F5 提示词与规则完全相符自洽（删除 m 票 / 每轮 JSON）—— ❌ 不符（本轮最需要结论的一条）

### 9.1 方法

- 只数**活提示词**（会被装配进 prompt 的）：`packs/v5r/prompts/v5r-persona.js`、`v5r-blocks-a.js`、`v5r-blocks-b.js`、`v5r-core.js`（`v5r-prompts.js` 是 156 KB 的**语料库**，`{{ corpus:… }}` 引用时才注入，不计入"活"）。
- 命令（可复现）：

```
$ cd vibe-math-vmu/packs/v5r/prompts
$ grep -c "m 票\|法定票数 m\|m = " v5r-persona.js v5r-blocks-a.js v5r-blocks-b.js
v5r-persona.js:15
v5r-blocks-a.js:11
v5r-blocks-b.js:1
$ grep -c "JSON" v5r-persona.js v5r-blocks-a.js v5r-blocks-b.js v5r-core.js
v5r-persona.js:1  v5r-blocks-a.js:10  v5r-blocks-b.js:4  v5r-core.js:5
```

### 9.2 m 票残留（逐条）

1. `packs/v5r/prompts/v5r-persona.js:41`（+ `:62,186,191,196,201` 五个变体，按 m=1/2/3 生成）【五、表决与定论（求真门槛）】：
   > 「(a) 至少有 m = N 名有表决权者…投出布尔概率值；(b) 这些票全部是 1 或全部是 0；(c) 若同时出现 1 和 0…不能定论」
2. `packs/v5r/prompts/v5r-persona.js:55` / `:166,171,176,181`（院士职责段）：
   > 「任何对象要进 Verified/ 仍须 **m 票布尔一致**」
3. `packs/v5r/prompts/v5r-blocks-a.js:270`、`:336`、`:341`：
   > 「任何对象要进 Verified/，仍然必须满足 m 票布尔一致」/「仍须 m 票布尔一致」
4. `packs/v5r/prompts/v5r-blocks-a.js:355-390`（【五、表决与定论】整段：m 定义、`m = min(所办设定的上限, 人数)`、两段式表决、辩论上限 3 轮、"平均概率"）
5. `packs/v5r/prompts/v5r-blocks-a.js:375`（"已定论/未定论"措辞挂 m 票）
6. `packs/v5r/prompts/v5r-blocks-b.js:226`（"所有旧字段仍有效"段落里保留 m 相关字段）
   另：每轮状态块里有"法定票数 m"的填充（persona `:34,126,131,136,141`「权威的在册名单与**法定票数 m** 以每轮提示里的状态块为准」）。

### 9.3 每轮 JSON 残留（逐条）

1. `packs/v5r/prompts/v5r-persona.js:90`：
   > 「你的一轮结束时，请给出一个 JSON 对象（格式见每轮提示末尾）」
2. `packs/v5r/prompts/v5r-blocks-a.js:509-510`：同类"每轮末尾 JSON 对象"要求（含字段表）
3. `packs/v5r/prompts/v5r-blocks-b.js:226`「只输出一个合法 JSON 对象；所有旧字段仍有效」；`:622`「结束时请**只**输出一个 JSON 对象」
4. `packs/v5r/prompts/v5r-core.js:465-472`（no-tools 段，见 F4）：「最后只输出一个 json 围栏回执」＋「整个回复必须只是一行 JSON」
5. `packs/v5r/prompts/v5r-core.js:513-516`（结题表决回执的 JSON 契约）

### 9.4 结论（关键判断）

**这不是"文字残留"，而是"文字与机制互相自洽、但两者都与新规则相反"。**

- 机制侧 m 票**仍然活着**：`packs/v5r/tools.js:1162` `vibe_v5_verdict` 把票据投进 `kernel.liveBallot(id)`；`settings/schema.js:145-146` `vmu.meetings.quorumRule`（域 `m-unanimous|all-unanimous`，默认 `m-unanimous`）与 `quorumCap`（`m = min(cap, 人数)`）——m 票是**内核机制**，不是提示词幻觉。
- 机制侧 JSON 答复**也活着**：`kernel/turn/index.js:863-878` `parseReply` 三档拒绝。

⇒ **只删提示词文字会让系统更不自洽**（文字说"辩论定真"，机制走"m 票定真"）。正确顺序是：先决定新规则的承载（辩论→p=1→verified 轨，见 B1），再改机制，最后删文字。**本轮不建议任何人先动提示词。**

### 判定：❌ 不符（文字与机制都需按新规则改，且必须一起改）。

---

## 10. "声明了但无消费者 / 读者未装配"清单（本轮实测到的新增项）

| 键/机制 | 声明处 | 读者 | 实况 |
|---|---|---|---|
| `vmu.paper.officeConsult`（+`On`/`TimeoutMs`/`OnTimeout`/`ExemptRoles`） | `settings/schema.js:1065-1069`；v5r 值 `packs/v5r/settings/defaults.json:60-64` | `kernel/paper.js:139-187,233-272` | **读者模块未被任何生产代码构造**（`createPaper` 零生产调用；`kernel/index.js:1415` 自述）⇒ 活路径上不生效 |
| `vmu.turn.protocolPath` | `settings/schema.js:212` | `packs/v5r/prompts/v5r-blocks-b.js:236,584`（仅文本插值） | 有消费者，但消费者只把它当**路径字符串**；没有对象/权限语义 |
| `vibe_v5_set` / `vibe_v5_configure` 的"所办专属" | 面声明 `packs/v5r/tools.js:1192,1198` | handler `:811,833` | handler **无席位检查**；owner 闸被 `actor = def.who` 自动满足（`:803-805`）⇒ 授权只靠工具可见性（未逐成员核） |
| `vmu.v5r.fixtureMode` | `settings/schema.js:112` | `packs/v5r/middleware/prompt-switches.js:73-85`（调用时读） | ✅ 真消费；但默认 `no-tools` 与 F4 相反 |
| m 票（`quorumRule`/`quorumCap` + `vibe_v5_verdict`/`liveBallot`） | `settings/schema.js:145-146`；`packs/v5r/tools.js:1162` | `kernel/meetings.js` / live ballot | ✅ 真消费 ⇒ F5 必须连机制一起改 |

## 11. 覆盖率与未做清单（诚实优先）

- **精读**（全部或大段读过，并用其 `file:line` 下结论）：
  `packs/v5r/tools.js`（选读约 300 行：`report`/`overview`/`paper`/`configure`/`set`/`pause`/`resume`/`message`/`verdict`/面清单）、
  `kit/paper.js`（选读 `:1-60,111-232,266-283,367`）、
  `kernel/records.js`（键表与 `put` 校验 `:57-98,219-240,397-493,796-816`）、
  `kernel/paper.js`（键表 `WIRED_KEYS` 与 `cfg`/门/拒绝）、
  `kernel/human.js`（`cfg`/门/超时 `:70-130,340-370,414-434,533`）、
  `kernel/mathtools.js`（并发闸 `:56-59,586-589`）、`kernel/mathjobs.js`（`:41,451,497,585-595`）、`kernel/lean.js`（`:61,218-219,592,599`）、
  `kernel/turn/index.js`（`parseReply` 三档 `:14,188-204,863-878`、可见工具 `:667-769`）、
  `kernel/index.js`（`paper` 未装配自述 `:1415`）、
  `settings/schema.js`（相关键行）、
  `packs/v5r/prompts/{v5r-persona,v5r-blocks-a,v5r-blocks-b,v5r-core}.js`（grep 定位后读上下文）、
  `packs/v5r/middleware/prompt-switches.js`（`:73-85`）、`packs/v5r/middleware/paper-dispatch.js`（文件头与 `:37,127`）、
  `packs/v5r/settings/defaults.json`（全文）、`packs/v3/index.js` 与 `packs/v3/middleware/dataplane.js`（verified 轨对照）。
- **只做机械扫描、未精读**：`v5r-prompts.js`（156 KB 语料库，只确认它**不在**活提示词路径）、`v5r-charter.js`、`v5r-assistant.js`、`v5r-paper-prompts.js`、`critical` 其余 kernel 模块。
- **完全没动**：台账其余 33 行（A/C/D/E 组与 B3–B8、B11）。
- **没跑**：T1 全量、`regen-all`、任何写操作（除本文件）。
- **本轮未核实（留作待核，不要当成已通过）**：
  ① 逐成员的**工具可见性**（`turn.visibleToolsOf` 的实机结果）⇒ 决定 `vibe_v5_set` 是否真的只有所办能调到；
  ② `vibe_v5_human` 在真实会话里能否把待批项呈现给用户并回填；
  ③ `vibe_v5_paper` 在实机上是否真的走 `kit/paper.js`（本轮是静态调用链证据，未跑）；
  ④ `math_computation` 的 `mode:'file'` 归档落盘位置与检索方式（B10 的关键，实机未验）。
