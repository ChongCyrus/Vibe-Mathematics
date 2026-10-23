# lane-rows-c —— 平时研究推进（C1–C3）/ 论文阶段（E1–E3）/ 额外要求（F1–F2）（phase 12 第 2 轮）

> 本文件只覆盖 Lead 分给我的 8 条：**C1、C2、C3、E1、E2、E3、F1、F2**。
> 状态词按台账 `docs/acceptance/phase12-v5r-rules-conformance.md` §0：✅ 已实现 / ⚠️ 部分 / ❌ 缺口 / 待核。
> 证明纪律（台账 §0）：**(a) 提示词里写了** ≠ **(b) 机制存在且可达** ≠ **(c) 有门禁/断言能抓住退化**；每条把三层分开写。
> 每条六项：① 规则原意 ② 机制（`path:line`）③ 消费者 ④ 门禁 ⑤ 建议状态＋理由 ⑥ 一击检查（只读命令＋输出）。
> 本轮**不改任何 vmu 代码/测试**；只写本文件。探针只写 `D:\_tmp`，路径为 `D:\_tmp\probe12-lane-members.mjs`、`D:\_tmp\probe13-rows-c.mjs`、`D:\_tmp\probe14-f1-python.mjs`、`D:\_tmp\probe14b-f1-root-probe.mjs`、`D:\_tmp\probe15-e1-sections.mjs`。
> 证据路径相对仓根 `Vibe-Mathematics/`。**没读到的不写"没问题"。**

## 0. 一句话结论（先落盘）

| ID | 规则（台账原文缩写） | 建议状态 | 一句话 |
|---|---|---|---|
| C1 | 各自推进各自总任务 | ✅ | objective 经模板变量进每个角色的提示词（有门禁），任务面有 owner/claim/update（有门禁）；"各自"体现在任务分工，不存在"每人一份总任务对象" |
| C2 | 邮箱（非紧急）／私信（希望尽早回复）／群聊（非紧急） | ⚠️ | 三通道都是真机制、通知文本真机验过；但**成员可达的"紧急私信"入口不存在**（`vibe_v5_say` 的 DM 分支没有 urgent），紧急只能走未教的 kernel 面；inbox 列表行 8 字段里也没有 urgent |
| C3 | 状态版：可看他人、可改自己；四内容＋时间 | ⚠️ | 写自己（track=state）＋看他人（`vibe_vmu_records`）＝可达，时间戳内核加；但**四个必需内容没有任何闸**，提示词里连"状态版"三个字都没有，教的读路径 `vibe_v5_read_library` 又读不到 state |
| E1 | 系统梳理原总问题与所有有价值产物、合作撰写论文 | ⚠️ | 合作撰写＋系统合并＋指纹门禁 ✅；但"所有有价值产物"不成立：九节里 3 节（引言／已检验通过的命题／已解决的子问题）字段是空串，**永远只有标题**（实测 bodyChars=0），且流程从不读记录库的 propositions/verified 轨道 |
| E2 | 合作写（分工后系统合并）、互审 | ✅（落点修正） | 机制与门禁都真实（分工写、互审环、全 true 才进定稿、最多 3 轮）；**但台账写的三条落点键里两条半没有消费者**：`vmu.paper.maxRounds` 只被未装配的 `kernel/paper.js` 读，`vmu.review.mode`/`vmu.reviewers.maxLoad` 服务的是评审人市场面、不是论文互审 |
| E3 | 面向读者：系统、正确、完整、严谨清晰 | ⚠️ | 提示词有真实的质量规则，且**门禁强于「只断言关键词」**（文本合同级：证据规则、deliverable 语义、所办前置未接线、数字来自单一源、三阶段正反隔离）；但**产出论文本身没有质量检查**，E1 的空节就是反例 |
| F1 | 支持数学计算工具（Python 等）；所办可设并发上限 | ⚠️ | 并发上限这一半 ✅（键在、office 独占、具名拒、真值进 `mathjobs.config()`）；"Python 等计算工具"这一半**在本装配上默认不可用**：schema 声明了 8 个默认引擎，运行时 `engines===[]`，`submit({engine:'python'})` ⇒ `VMU_MATH_UNSUPPORTED_OP 未声明任何引擎`；python 真跑**未判定** |
| F2 | 支持人工干预决策/运行、断点续跑 | ✅ | `vibe_vmu_human`（veto/审批队列/pause/inject/recover）已发布且活体可读，恢复面 15 个方法、`recovery.status()` 正常；human gate 六条合同＋resume e2e 有门禁；注意 v5r 默认 `gatedActions: []` ⇒ 审批默认不拦任何动作（零机制是策略默认） |

合计：**3 ✅（C1、E2、F2）· 5 ⚠️（C2、C3、E1、E3、F1）· 0 ❌ · 0 待核**；另有 2 个子项**未判定**（F1 的 python 真跑、F2 的断点续跑真机），见 §9。

---

## 1. C1 各自推进各自总任务

**① 规则原意**：每个成员在自己的方向上推进工作、各自有可追踪的任务，而不是所有人挤在同一件小事上、或互相等待。

### ② 机制

- **(a) 只在提示词/约定层**（明说，不是机制）：总任务目标通过设置键 `vmu.turn.objective` 以模板变量 `{{ setting:vmu.turn.objective }}` 注入每个角色的提示词 —— `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:26,32,40`；`vibe-math-vmu/packs/v5r/prompts/v5r-persona.js:27,106,111,116,121`；`vibe-math-vmu/packs/v5r/prompts/v5r-charter.js:10-11`（注释说明 `problem.statement -> {{ setting:vmu.turn.objective }}`）。键声明 `vibe-math-vmu/settings/schema.js:192`（string，默认「尚未设定」，H2，owner=office）。
- (b) 机制："各自"由**任务面**承载：`vibe_v5_task_create/list/get/update`（声明 `vibe-math-vmu/packs/v5r/tools.js:1459,1465,1471,1477` → `vibe-math-vmu/kit/extras.js`），成员可见（`tools.js:581` 主席有 `assign`；成员提示词 bullet `v5r-core.js:630`，临时席 `:670` 有 `task_list/update`）。任务有 owner/claim/状态/修订号，`vibe_v5_assign` 由主席分派。

### ③ 消费者

- 提示词装配：`vibe-math-vmu/kernel/index.js:1728-1735` 的 `setting: (k) => readSetting(settings, k)`（**未配置时回落到声明默认**，这就是 objective 能被模板取到的通路）；pack 的 section scope 由 prompt 管线匹配。
- 任务：`vibe-math-vmu/kernel/tasks.js`（任务板服务），pack 工具只做寻址/调用。

### ④ 门禁

- `tests/vmu-v5r-tools.test.mjs:848-877`（§3q）：`settingDef('vmu.turn.objective')` 的声明默认＝「尚未设定」且 H2；v5r 值层携带的目标非空且≠占位符；**装配后的 charter 真的带上 target（占位符已消失）**；无 pack 的装配**没有**该目标（防止隐藏第二来源）。
- `tests/vmu-v5r-tools.test.mjs:191-215`：`task_create` 真落到板上；`task_list` 里能看到；缺 subject 具名拒；缺修订号的 `task_update` 具名拒；claim 走修订号。

### ⑤ 建议状态：✅

机制与门禁都齐（不是"提示词说了"）：objective 有注入通路且有正反门禁；任务面有 owner/claim/update 且失败可被断言抓住。

**缺什么**（不是缺口，是边界）：不存在"每人一份总任务对象"——`vmu.turn.objective` 是全所共享的一个键；"各自"体现为任务板上的分工，而不是每人一个目标副本。若要更严格，需要 per-member goal 字段与其门禁；当前口径下 ✅。

### ⑥ 一击检查

`node D:\_tmp\probe13-rows-c.mjs`（exit 0）输出里 `OBJECTIVE` 是 v5r 值层带的 odd-sum n² 文本 ⇒ 运行时该键真有值；上引 §3q 断言就是"装配后提示词含目标"的机器证明。

---

## 2. C2 交流通道：邮箱（非紧急）／私信（希望尽早回复）／群聊（非紧急）

**① 规则原意**：三条通道同时存在且语义分明 —— 邮箱是"非紧急"的投递，私信是"希望对方尽早回复"的直达，群聊是非紧急的公开交流；不能三个都变成同一种东西。

### ② 机制

- (b) 群聊：`vibe_v5_say` 省略 `to` ⇒ `chat.send(member, text, {kind:'chat'})`（`vibe-math-vmu/kit/handlers.js:212-216`）。群聊**没有** urgent 字段（结构上不可能紧急）。
- (b) 私信：`vibe_v5_say` 带 `to` ⇒ `mailbox.send(member, {to, text, kind:'dm'})`（`kit/handlers.js:204-210`）——**没有 urgent 参数**（这就是本条的缺口，见 ⑤）。
- (b) 邮箱（所办口吻）：`vibe_v5_message` ⇒ 以 `'office'` 身份 `mailbox.send`，`urgentFlag` 归一化（`true/'true'/1/'1'`），`kind = urgentFlag ? 'notice' : 'note'`，可带 subject（`kit/handlers.js:227-246`）。
- (b) 收件侧：`vibe_v5_inbox`（list/open/mark → `kernel.mailbox.list/open/setState`）；列表行是 8 字段 `{id,from,at,subject,kind,read,todo,bytes}`，**不含 urgent、不含正文**（`vibe-math-vmu/kernel/mailbox.js:216`）；`open` 才回正文并置 `read:true`。唤醒预算 `vmu.mailbox.wakeBudget:1` 有消费者（`kernel/mailbox.js:121,598-613`）。

### ③ 消费者

- 内核通知渲染：`kernel/mailbox.js:319`（`isUrgent = urgent===true || urgentOf(kind)`）、`:332`（entry 带 urgent），通知以**追加的 system-prompt 消息**进入成员提示词（不是工具回执）。第 9 轮真机实测：非紧急 ⇒「【信箱】你收到 1 条新留言（来自 office）。标题：非紧急进展同步-A7…」**正文不出现**；紧急 ⇒「【信箱】【紧急｜对方希望尽快回复】1 条留言：office｜紧急确认-B2」+「紧急正文：…」。群聊/私信落 `kernel/chat.js`、`kernel/mailbox.js`。

### ④ 门禁

- `tests/vmu-v5r-tools.test.mjs:175-181`：`say`（无 to）⇒ `via:'chat'`；`say`（带 to）⇒ `via:'mailbox'`；`vibe_v5_message` 走 office 声音 —— 三条通道路径的断言。
- `tests/vmu-v5r-tools.test.mjs:1479-1535`（第 9 轮 R6 修完后的门禁）：**已部署 schema** 真有 `subject`+`urgent`；不传 urgent ⇒ `urgent===false` 且 `kind:'note'`；传字符串 `"true"` ⇒ urgent 且 `kind:'notice'`；显式 `false` ⇒ 仍是 note。
- 值层回归门禁：`tests/vmu-v5r-tools.test.mjs` §7k-bis（pack 值层**不得**再声明 `vmu.mailbox.urgentKinds`，否则遮蔽 schema 空默认——第 9 轮真机 `notice` 恒紧急就是它造成的）。

### ⑤ 建议状态：⚠️ 部分

三通道机制齐、语义在通知文本层面真机验过（非紧急不出现正文、紧急带【紧急｜…】+正文），且 R6 的两个真机 bug 已修并有门禁。**但"私信＝希望尽早回复"没有成员可达的表达路径**：`vibe_v5_say` 的 DM 分支不带 urgent；成员若想发紧急 DM 只能调 **未在角色清单里**的内核面 `vibe_vmu_mailbox`（`vibe-math-vmu/tools/mailbox.js:24,43-46` 的 `send` 有 `urgent:boolean`）——"存在但不在教给模型的清单里"，运行中模型不会想到。另外 inbox 列表行 8 字段不含 urgent，收件人在列表层面看不出哪条紧急（只能从通知文本读）。

**缺什么**：① 给 `vibe_v5_say`（或 `vibe_v5_message`）加 `urgent` 参数并在 handler 里透传（`kind:'dm'` + `urgent:true`）；② inbox 行带 `urgent`（或至少 `urgentOf` 判定结果），让"希望尽早回复"在列表里可见；③ 一条"成员 DM urgent:true ⇒ 收件人提示词出现【紧急】"的断言。

### ⑥ 一击检查

`node D:\_tmp\probe12-lane-members.mjs`（exit 0，真实入口）：
- `DM_DEFAULT {"urgent":false}`、`NOTICE_KIND_ONLY {"urgent":false}`（← R6 修复后的正确语义）
- `DM_URGENT_EXPLICIT {"urgent":true}`（← 但这是直接调 kernel 面 `mailbox.send`，**不是** `vibe_v5_say` 能做到的）
- `INBOX_R2` 行字段只有 `from/kind/subject/at` —— 无 urgent、无正文。

---

## 3. C3 状态版：可查看他人、可改自己；① 总任务 ② 规划计划 ③ 各任务完成状态 ④ 当前小任务；含时间信息

**① 规则原意**：每个成员有一块"状态版"：自己能改自己的，能看别人的；内容必须覆盖四件事（总任务／规划计划／各任务完成状态／当前小任务）；带时间信息。

### ② 机制

- (b) 写自己：`vibe_v5_record_progress` 的 `track` 可取 `state`（track 列表来自设置 `vmu.records.tracks`，v5r 值层 `packs/v5r/settings/defaults.json:19` 的 11 条里含 `state`；提示词 bullet `packs/v5r/prompts/v5r-core.js:571/625` 明确写"track 可选 progress/routes/obstacles/rejected/state"）。写入实现是**通用**的：`kit/handlers.js:96-132` 只校验 `content` 非空、track 必须在声明列表中，**不校验任何字段形状**。
- (b) 看他人：`vibe_v5_read_library` 硬编码四条读轨 `['propositions','methods','problems','progress']`（`kit/handlers.js:264`）——**不含 state**；能读 state 的是已发布的内核面 `vibe_vmu_records`（probe12：`published===true`），列表回**表头行**（无正文）、展开才回正文（`docs/18-command-and-protocol-reference.md:127-133`）。
- (b) 时间信息：记录由内核盖 `at`（probe12 `STATE_BARE` 的键里有 `at`）。

### ③ 消费者

`kernel/records.js` 的 put/list/expand；`vibe_v5_record_progress` 只做 track 路由；`vibe_vmu_records` 是 host 面（`vibe-math-vmu/host.js:92` 名字 `vibe_vmu_records`）。

### ④ 门禁

**无。** 没有任何测试写/断言 `track==='state'` 的记录形状（`tests/vmu-v5r-tools.test.mjs:405` 只是用 `vibe_v5_set` 把 `vmu.records.tracks` 整表设一遍）；没有四字段的 schema、没有"缺字段⇒具名拒"的错误码、没有"能看到他人状态版"的断言。

### ⑤ 建议状态：⚠️ 部分

三层里 (b) 可达：自己能写（track=state）、别人能读（records 列表/展开）、时间戳内核加。但 (a) 提示词里**没有"状态版"这个概念**（grep「状态版」在 prompts = 0 命中），四件必需内容没有任何约束——一句话正文也能通过（见 ⑥），(c) 门禁为空。→ 机制在、语义与完整性都不受控。

**缺什么**：① 四字段的最小 schema 或一个 `vibe_v5_state_board` 面（写=四段，读=列表），至少给"缺哪一段"具名拒；② 一条能失败的断言（例如"四段缺一 ⇒ 拒"或"读他人状态版能拿到四段+at"）；③ 教的读路径要么把 state 加进 `read_library`，要么在提示词里教 `vibe_vmu_records`。

### ⑥ 一击检查

`node D:\_tmp\probe12-lane-members.mjs`（exit 0）：
- `STATE_BARE`：`records.put({track:'state',kind:'state',title:'s1',body:'只有一句话'})` **被接受**（回执键 `ok/deduplicated/id/slug/fingerprint/bytes/tier/enforced/enforcedScope/fired/at`，没有任何"缺字段"拒）。
- `STATE_LIST {count:2, owners:['r-1','r-1'], hasBody:false}` ⇒ 跨成员可读、列表只有表头（与"看他人"一致）。

---

## 4. E1 系统梳理原总问题与所有有价值产物、合作撰写最终论文

**① 规则原意**：把原问题与**所有**有价值的产物系统梳理出来，由多方合作写成最终论文（不是各写各的散稿）。

### ② 机制

- (b) 可装配的论文机制在 **`kit/paper.js` + `packs/v5r/paper.js`**（不是 `kernel/paper.js`，后者列在 `scripts/lib/reachability.mjs:36-48` 的 `KNOWN_UNMOUNTED`：`createPaper(` 只在测试/脚本里出现，v5r 论文走 pack → kit，且 kit 不读它那些 `vmu.paper.*` 键）。
- 状态机 `vibe-math-vmu/kit/paper.js`：`start`（需 target、≥1 participants、不许重复开题）→ `recordPart`（只能 writing、只能参与成员；每人一段，重复提交是**替换**并回执 `replaced`）→ `advance`（writing→reviewing，自动成互审环 `reviewOf`）→ `recordReview` → `advance`（全 true 才 awaiting-editor）→ `recordFinal`（仅 chair）→ `render`。
- 章节：`packs/v5r/paper.js` 的九节，字段映射 `sectionFields: ['title','','solution','','','methods','rules','limits','evidence']`（`vibe-math-vmu/packs/v5r/paper.js:63` 附近，传给 `createPaperFlow`）。
- 面向模型的面：`vibe_v5_paper`（`packs/v5r/tools.js:1239` 的 `toolPaper`，11 个 action：`sections|status|start|part|review|advance|final|render|compile|consult|consult_state`）。

### ③ 消费者

`toolPaper` → `createPaperSubsystem`（`packs/v5r/paper.js:82` 附近）→ `createPaperFlow`（`kit/paper.js`）→ `kernel.records`（每次状态/片段/评审都是一条记录，标题 `v5r-paper|<target>|<artifact>`）；`PaperMd` 按记录 id + fingerprint 重建正文。

### ④ 门禁

- `tests/vmu-v5r-tools.test.mjs:444-520`：开题正例、重复开题具名拒 `VMU_PACK_V5R_CORE_PAPER_STATE`、`recordPart` 成功＋替换、**非参与成员写片段被拒**、`advance`、非布尔 deliverable 被拒、一条 false ⇒ 退 writing round 2 并带 `refusers`、两条 true ⇒ 进 awaiting-editor。
- `:517-518`：`PaperMd` 从 parts（按 id+fingerprint）**重建**正文，节标题来自原九节。
- `:538-540`：正文被背后改动 ⇒ `VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH`（**不静默用旧文本**）。
- `tests/vmu-paper-office-consult.test.mjs`：E4 咨询闸在**装配路径**上的四条证明（具名拒/问题存活/只有 off 能过/模块从入口可达）。

### ⑤ 建议状态：⚠️ 部分（与 `lane-claims-paper.md` 的 E1 判断一致，此处补了实测反例）

"合作撰写"与"系统合并"是**真机制**（见 ④）；但"**所有**有价值产物"不成立，有两层实锤：

1. **九节里 3 节结构性为空**：`sectionFields` 的第 2/4/5 项是空串（index 1 引言、index 3 已检验通过的命题、index 4 已解决的子问题）。`PaperMd` 遇到空字段直接 `continue`（`kit/paper.js` 的 PaperMd 循环），所以这三节**只输出标题**，无论成员写了多少片段。
2. **不从记录库涌现**：`kit/paper.js` 全文不读 `propositions`/`verified`/`methods` 等轨道；"有价值之物"只来自成员手写的 part 字段，不存在"扫描记录库、把已验证命题/已解决子问题自动列进去"的消费者。

**缺什么**：① 把 index 3/4 接到 `verified`/`propositions`/`problems` 轨道（或给论文提供显式"产物清单"输入面），② 一条能失败的断言："库里已有 N 条 verified ⇒ 对应节非空/含引用"。

### ⑥ 一击检查（本题的直接实证）

`node D:\_tmp\probe15-e1-sections.mjs`（exit 0；真入口 + `createPaperSubsystem`，两成员各写一段、互审全 true、advance 到 awaiting-editor 后取 `PaperMd`）：

```
"emptySections": ["1:引言与问题背景", "3:已检验通过的命题", "4:已解决的子问题 / 中间成果"],
"mdChars": 460
```

即：完整跑完一轮协作论文流程，**"已检验通过的命题""已解决的子问题"两节一个字都没有**——恰好是规则里"所有有价值产物"的落点。

---

## 5. E2 合作写（分工后系统合并）、互审

**① 规则原意**：分工写（每人负责一部分），然后系统合并；成员之间互审，审不过不进入定稿。

### ② 机制

- `recordPart` 只接受**参与成员**且只在 `writing` 状态（`kit/paper.js`；错误是具名的 `VMU_NO_SUCH_OBJECT`）。
- `advance`：writing→reviewing 时自动生成互审环 `reviewOf[participants[i]] = participants[(i+1)%n]`；reviewing→awaiting-editor **只有全部成员 `deliverable===true`** 才成立，否则记录分歧、`round++` 回到 writing；轮数上限是 **pack 常量 `PAPER_MAX_ROUNDS = 3`**（`packs/v5r/paper.js`），到达上限强制进 awaiting-editor 并带 `forcedAfterCap` + 警告。
- `recordReview`：`deliverable` 必须是真布尔（`'deliverable must be true or false (an unstated verdict is NOT deliverable)'`，提示「未表态不算可交付」）。
- 合并：`PaperMd` 按记录 id 重新读回并**校验 fingerprint**，正文被背后改动就具名拒（不用旧文本）。

### ③ 消费者

`vibe_v5_paper` 的 `part/review/advance`（`packs/v5r/tools.js:1271-1293` 的参数映射）→ flow；轮数上限来自 pack 常量，不是设置键。

### ④ 门禁

`tests/vmu-v5r-tools.test.mjs:454-483`（非参与成员写片段被拒、评审太早被拒、非布尔 deliverable 被拒、一条 false ⇒ 退 writing round 2 带 `refusers`、两条 true ⇒ awaiting-editor）；`:538-540` fingerprint 门禁；论文提示词的"互审语义"文本合同门禁见 E3 ④。

### ⑤ 建议状态：✅（**并修正台账的三条落点**）

机制与门禁都真实，满足"分工后系统合并、互审"。但台账 E2 行把落点写成 `vmu.review.mode:'single-blind'`、`vmu.reviewers.maxLoad:3`、`vmu.paper.maxRounds:3` —— **这三条在论文路径上都不是消费者**：

- `vmu.paper.maxRounds` 的读者只有 `vibe-math-vmu/kernel/paper.js:41,159,363,400-405,430-444`，而该模块**不被装配**（`scripts/lib/reachability.mjs:36-48`）；`settings/schema.js:1359` 的 doc 仍写「已接线（paper.js 读取）」，v5r `packs/v5r/settings/defaults.json:68` 还把它设成 3 —— 这是"声明说已接线、在册路径没人读"的**惰性声明**。真实上限是 pack 常量。
- `vmu.review.mode` / `vmu.reviewers.maxLoad` 的读者是 `kernel/reviewers.js:9-10,32,37,81-115`（评审人市场：`single-blind`、回避、并发上限），消费者是**已发布的内核面 `vibe_vmu_reviewers`**（probe13：`true`；`vibe-math-vmu/tools/reviewers.js` 的 action 枚举 register/assign/…/keysUsed）—— 它服务"评审人市场"，与论文互审（`kit/paper.js` 的 `reviewOf` 环）**是两套东西**。

**缺什么**：要么把 `vmu.paper.maxRounds` 真正接到 `createPaperFlow({maxRounds})`（并把 doc 改成一致），要么从 v5r 值层删掉这条惰性声明；`review.mode/maxLoad` 在台账里改成正确的消费者名（评审人面），别当成论文互审的落点。

### ⑥ 一击检查

`grep -rn "vmu.paper.maxRounds" --include=*.js vibe-math-vmu/` ⇒ 命中只有 `kernel/paper.js`（未装配）与 schema 声明；`vibe-math-vmu/packs/v5r/paper.js` 里是 `PAPER_MAX_ROUNDS = 3` 常量传给 `createPaperFlow`。probe15 的流程在同一常量下走到 awaiting-editor。

---

## 6. E3 面向读者：系统、正确、完整、严谨清晰

**① 规则原意**：最终论文是写给读者看的：结构系统、结论正确、内容完整、论证严谨清晰。

### ② 机制

- (a) 提示词层（这三段是**唯一**载体）：`vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js` 三个按阶段作用域注入的 section（order 606/607/608，`scope:{phase:'paper-write'|'paper-review'|'paper-final'}`）：九节清单；"只写有证据支撑的内容，不得编造"；"未决/被否证必须显式标注"；证据进附录；review 段定义 deliverable 语义与"全体 true 才进 awaiting-editor"；final 段写"仅院士可定稿 + 所办前置未接线"。
- (b) 装配机制：prompt 管线按 `scope.phase` 匹配，三阶段各自只带自己那段（下面 ④ 有正反门禁）。

### ③ 消费者

`kernel/prompt` 管线（section scope 匹配）→ 各阶段成员提示词；`v5r-paper-prompts.js` 从 `packs/v5r/paper.js` 导入 `PAPER_MAX_ROUNDS / PAPER_SECTIONS / PAPER_ENGINE_ORDER`（数字与引擎顺序单一来源，不手抄）。

### ④ 门禁

**比 `lane-claims-paper.md` 里"测试只断言提示词文本含关键词"更强**（这条判断我修正）：`tests/vmu-v5r-tools.test.mjs:553-597` 除了三条 marker 唯一、无 `{{ }}` 占位符、每段 >300 字，还断言了**内容合同**：
- write 段含「不得编造」＋真实工具名（不许编造不存在的工具）；
- review 段含 `deliverable: true`、`全体参与成员都投 true`、`未表态不算可交付`；
- final 段含「院士」「所办」「未接线」「咨询」（不让模型以为所办能定稿）；
- 数字/引擎顺序必须来自 `paper.js`（单一来源）；
- **一正两反**：phase=paper-write 的装配只带撰写段；paper-review 只带互审段；paper-final 只带定稿段；非论文阶段三段都不带。

### ⑤ 建议状态：⚠️ 部分

提示词规则真实、阶段隔离有正反门禁 —— 这部分**不是**空话。但"系统/正确/完整/严谨清晰"是**读者侧质量**，目前没有任何检查论文产物的机器闸：没有"节非空""证据条数 ≥1""被否证结论必须标注"的断言；而 E1 已实测出两节结构性为空（"完整"反例）。

**缺什么**：最小可失败检查（render 后读 md）：非空节数阈值、附录证据条数 ≥1、被否证结论必须带显式标注词（可用 §⑥ 的关键词集合）。

### ⑥ 一击检查

`node D:\_tmp\probe15-e1-sections.mjs` 的输出（§4 ⑥）就是反例：论文渲染完成但 "emptySections" 有 3 条 ⇒ 当前没有任何闸会因此失败。

---

## 7. F1 支持数学计算工具（Python 等）；所办可通过参数设工具并发上限（防 CPU 过载/OOM）

**① 规则原意**：研究所能做数学计算（Python 等）；所办能通过参数把工具并发上限调下来/调上去，防止 CPU 过载或 OOM。

### ② 机制

- (b) 计算面：`vibe_vmu_mathjobs`（submit/status/cancel/receipt/list/…/jobsDir，`vibe-math-vmu/tools/mathjobs.js:11-13`）、`vibe_vmu_mathtools`（适配器/包管理），两者 probe13 都**已发布**。引擎描述表 `vibe-math-vmu/math-engines.js:12`：`['python','r','octave','julia','matlab','maple','wolfram','cli']`（python 第一）；共享默认 `MATH_PARAM_DEFAULTS.mathEngines` 就是这 8 个。
- (b) 并发上限：`vmu.math.maxParallel`（`settings/schema.js:555`，positiveInteger，默认 1，H1，owner=office）＋ `vmu.math.leanJobsMaxParallel`（`:258`，默认 1，H1，office）；消费者 `kernel/mathjobs.js:442-455`（`cfg()` 读 maxParallel/engines/timeoutMs…）、`:595`（`while (running() >= c.maxParallel)` 排队闸）；Lean 侧 `kernel/lean.js:218-219,599`（`while (runningCount() < c.leanJobsMaxParallel)`）。
- (b) 设置面：主席提示词教 `vibe_v5_configure` / `vibe_v5_set`（`packs/v5r/prompts/v5r-core.js:595`「改【已声明】的设置键；回执会带该键的热级」）；`applyDeclaredSetting`（`packs/v5r/tools.js:757-775`）会拒未声明键、H3 只读键，并要求 `kernel.setSettingsValue`。

### ③ 消费者

`kernel/mathjobs.js`（engines/maxParallel/timeoutMs/requireSeedForRandom…）、`kernel/lean.js`（Lean 并发）；office 写入经 `kernel.setSettingsValue` 的**声明 owner 闸**（内核层）。

### ④ 门禁

- `tests/vmu-kernel.test.mjs:390-391,624`：「a non-owner writer is refused by name and told the declared owner」（owner 闸的机器门禁）。
- `tests/vmu-finally-falsify.test.mjs:95-141`：每个退出路径都释放并发槽（settings 注入 `{'vmu.math.engines':['fake'],'vmu.math.maxParallel':1}`）；`tests/vmu-activity-timers.test.mjs:22,232-246` 同类。
- `tests/vmu-ab-v5r-meetings.test.mjs:384-386,628`：源码扫描确认 `kernel/lean.js` 真的带 `leanJobsMaxParallel/leanAsync/leanCommand` 字面量（源码级，不是行为级）。

### ⑤ 建议状态：⚠️ 部分

**并发上限这一半是 ✅**：键在、owner=office、其他角色写被具名拒（下面 ⑥ 实测）、值真的进 `kernel.mathjobs.config()` 的并发闸。

**"Python 等计算工具"这一半在本装配上默认不可用**：schema 声明了 8 个默认引擎（`schema.js:244` → `mathDefaults().mathEngines`），但内核**不把 schema 默认物化进 settings**（`kernel/index.js:1728-1735` 的注释本身就是这个缺陷的第 15 轮修复记录：未配置键在 `setting:` 访问器里回落到声明默认），而 `kernel/mathjobs.js` 走的是 `settingsView.get`（原样读，无回落）⇒ `engines` 解析为 `[]` ⇒ submit 具名拒「未声明任何引擎（vmu.math.engines 为空）」。真机部署脚本注入的 `vmu.*` 只有少数键（`D:\_tmp\slv-v5r\run-v5r-tools.ps1:153-192`：faces/fixtureMode/leanAsync/objective/…，**没有 engines**）⇒ 真机同样为空（除非 office 显式设置）。

**未判定（诚实写法）**：python **真的跑起来**这一半未验 —— 我的探针装配没有宿主 `spawn` 接缝，`kernel.mathjobs.submit` 在准入层就被拒（引擎为空）；即使设了 engines，探针也会因 `spawn` 缺失而 `VMU_EXTERNAL_UNAVAILABLE`。真机上一轮只跑过 Lean（Lean 4.34.0、exit 0），python 作业没有跑过。⇒ "机制存在且可达（面已发布、键可设、并发闸真实）"已判定；"默认部署下 Python 能跑出结果"**未判定**。

**缺什么**：① 让默认引擎真的物化（内核 settings 物化 schema 默认，或 v5r 值层显式声明 `vmu.math.engines`），② 一条"默认部署下 `submit({engine:'python'})` ⇒ settled:true"的断言（真机或注入 fake spawn），③ 提示词缺口：角色清单里没有 `vibe_vmu_mathjobs`/`vibe_vmu_mathtools` 的教学（只有 Lean 五工具 + env probe，`v5r-core.js:600/607/642/649/676/683`）——就算默认解了，成员也不会用。

### ⑥ 一击检查

```
node D:\_tmp\probe14b-f1-root-probe.mjs   # exit 0，真入口 + packs:['v5r']
```
输出（截取）：
```
"config": { "computation": "auto", "mode": "typed", "engines": [], "maxParallel": 1, ... }
"defEngines": { "key": "vmu.math.engines", "def": ["python","r","octave",...], ... }
submit({engine:'python'}) ⇒ { "ok": false, "code": "VMU_MATH_UNSUPPORTED_OP",
                              "message": "未声明任何引擎（vmu.math.engines 为空）" }
```
⇒ **声明里有 python、运行时引擎表是空**：这是"声明 vs 消费"不一致的直接证据。`probe13-rows-c.mjs` 另证 owner 闸：`SET_WRONG_OWNER` ⇒ `VMU_NOT_PERMITTED: r-1 may not set vmu.math.maxParallel (declared owner: office)`；`SET_MAXPAR` ⇒ `{"applied":"immediate","value":2}`。

---

## 8. F2 支持人工干预决策/运行、断点续跑

**① 规则原意**：人类（所办/用户）能中途介入：否决、批准、暂停；会话能断点续跑（崩了/断了能接着跑）。

### ② 机制

- (b) 人工面：`vibe_vmu_human`（`vibe-math-vmu/tools/human.js` 的 `makeHumanSpec`），action 枚举 `status|veto|explainVeto|liftVeto|observerView|openApproval|approvalState|decide|withdraw|queue|gate|dashboard|inject|recover|recoverStatus|readBack`；描述明确"审批是真闸门：被闸动作在获批前不执行、只排队（`VMU_HUMAN_APPROVAL_PENDING` 带 requestId）；超时默认 hold，default-allow 必须显式确认"、"inject＝人工中途干预"、"recover/recoverStatus/readBack 是会话级恢复原语"。内核 `kernel/human.js`（gate/veto/approval 队列、dashboard 钳制）＋ `kernel/resume.js`（投影、恢复）。
- (b) 发布：`host.js:245` `{face:'human', families:['vmu.human.','vmu.resume.'], config:['human','resume']}`，注释 `:244`「human also lights on vmu.resume.* because the SAME tool face carries the recovery verbs」。
- (b) 控制面：`vibe_v5_pause` / `vibe_v5_resume`（主席提示词 `v5r-core.js:594`：「全部走内核自己的控制状态；resume 走控制面，不是耐久投影」）；v5r 值层声明 `vmu.resume.projections`、autoRecover/readBack/writeThrough，`vmu.human.onTimeout:'hold'`、`vetoLiftRoles:['office']`、`gatedActions:[]`（`packs/v5r/settings/defaults.json:38-52`）。
- (b) 断点续跑：`kernel/index.js:145` 导入 `createResume/createProjection/attachProjection/PROJECTION_KEYS`，`:1078` 构造 `resume`，`:1024-1027` 声明投影键；`kernel.recovery`/`resumeService` 暴露给恢复面。

### ③ 消费者

`vibe_vmu_human` 面 → `kernel.human`（gate/veto/approval）与 `kernel.recovery`/`resume`；probe13 实测 `HUMAN_STATUS` 活体（`neverAllowsBySilence:true, timeoutIsExplicit:true, readsArePure:true`），`RECOVERY_STATUS`：`storeAttached:true, read:true, lastRecoveryOk:true, interrupted:0, projections:[…]`。

### ④ 门禁

- `tests/vmu-human-gate.test.mjs`：六条合同——① 什么都不声明 ⇒ 什么都不拦（零机制）；② 被闸动作在获批前不执行、排队带 requestId；③ 拒绝立即生效；④ veto 立即且只能按名（角色+理由）解除；⑤ 到期按声明的 timeout 动作，`default-allow` 需额外确认、**沉默永不允许**；⑥ dashboard 不越界、pause 按名阻断、航中重调需角色检查+审计+写接缝。
- 断点续跑：`tests/vmu-resume-e2e.test.mjs:231`（`A.ctrl.resume({scope:'tasks',byRole:'office'})` 端到端演练）、`tests/vmu-resume-recovery.test.mjs`（恢复原语＋id 生成）、`tests/vmu-resume-falsify.test.mjs`（证明断言**能红**）、`tests/vmu-resume-lock-and-marks.test.mjs`（F18 每次退出释放锁）、`tests/vmu-resume-token-contract.test.mjs`。

### ⑤ 建议状态：✅

机制、发布、活体状态、门禁四层都在；"人工干预"在策略默认下是 veto/pause/inject + 审批队列（v5r 默认 `gatedActions: []` ⇒ 审批默认不拦任何动作，这是**零机制的策略默认**，不是机制缺失；要拦动作需 office 声明 `vmu.human.gatedActions`）。

**边界（写进 §9）**：断点续跑的"真机崩溃后恢复"本轮**未验**（单测 e2e 有；phase 12 是只读审计，不跑真机）。

### ⑥ 一击检查

`node D:\_tmp\probe13-rows-c.mjs`（exit 0）：`vibe_vmu_human === true`、`HUMAN_STATUS {ok:true, …, policy:{onTimeout:'hold',gatedActions:[],vetoLiftRoles:['office']}, neverAllowsBySilence:true, timeoutIsExplicit:true}`；`RECOVERY_FACE {present:true, methods:[…15 个…]}`；`RECOVERY_STATUS {storeAttached:true, read:true, lastRecoveryOk:true, interrupted:0}`。

---

## 9. 未判定 / 证据不足（不凑结论）

1. **F1 的"Python 真能跑"**：未判定。准入层（引擎声明/面发布/并发闸）已验；真跑需要一个有宿主 `spawn` 接缝的装配或真机，本轮都没有。探针装配下 `engines===[]` 使 submit 在准入层就拒。下一步：真机上由 office 设 `vmu.math.engines:['python']` 后 `vibe_vmu_mathjobs {action:'submit',engine:'python',argv:['-c','print(1+1)']}` 看 `settled:true`。
2. **F2 的"真机断点续跑"**：未判定（只有单测 e2e；phase 12 只读、不跑真机）。
3. **E2 的"single-blind 是否是论文互审的模式"**：已判定**不是**（`vmu.review.mode` 的消费者是 `kernel/reviewers.js` 的评审人市场，不是 `kit/paper.js` 的 `reviewOf` 互审环）；若 Lead 认为这条键应与论文互审共用，那是**缺口**而不是未判定——需要接线。

## 10. 给 Lead 的三条建议（按成本排序）

1. **E2/F1 的"声明 vs 消费"是最便宜的真缺陷**：`vmu.paper.maxRounds`（v5r 值层声明但无人读）与 `vmu.math.engines`（schema 声明默认但运行时为空）是同一类病——**声明说了、在册路径没人读/没物化**。修法：接线或删声明，并各加一条能失败的门禁。
2. **C2/C3 是同一类"可达但不可教/无闸"**：成员可达的内核面（`vibe_vmu_mailbox` 的 urgent、`vibe_vmu_records` 读他人 state）都不在角色清单里；而 pack 面缺字段/缺语义。建议先补 `say` 的 urgent 与 state 的四字段最小 schema/闸，再谈提示词。
3. **E1/E3 的"完整"要一条产出物闸**：以 `render` 后的 md 为输入，断言"已检验通过的命题／已解决的子问题两节非空（或显式写'无'）＋ 附录证据 ≥1"——这条同时把 E1 的结构性空节和 E3 的"完整性无检查"一起变成可失败项。

## 11. 本轮命令与输出（可复现）

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `node D:\_tmp\probe12-lane-members.mjs` | 0 | 60 个 host 工具；`vibe_vmu_records/chat/mailbox/report/human` true，`vibe_vmu_script` false；STATE_BARE 被接受；`STATE_LIST {own:'r-1',count:2,hasBody:false}`；inbox 行无 urgent/正文；report tick 投递到 office |
| `node D:\_tmp\probe13-rows-c.mjs` | 0 | 62 个 host 工具；`vibe_vmu_human/mathjobs/mathtools/reviewers` true；`SET_WRONG_OWNER` 具名拒、`SET_MAXPAR applied immediate`；HUMAN_STATUS/RECOVERY_STATUS 活体 |
| `node D:\_tmp\probe14-f1-python.mjs` | 0 | `submit({engine:'python'})` ⇒ `VMU_MATH_UNSUPPORTED_OP 未声明任何引擎（vmu.math.engines 为空）` |
| `node D:\_tmp\probe14b-f1-root-probe.mjs` | 0 | `config.engines=[]` 而 `defEngines.def` 有 8 个引擎 ⇒ 声明默认未物化 |
| `node D:\_tmp\probe15-e1-sections.mjs` | 0 | `emptySections: ['1:引言与问题背景','3:已检验通过的命题','4:已解决的子问题 / 中间成果']` |

（本轮没有跑 T1 全量门禁；引用的测试断言均为源码阅读所得的 `path:line`。）
