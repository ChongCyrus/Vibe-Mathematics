# lane C2 / C3 / B10 / B11（＋ B8 复核）— 五件落地报告

作者：vmu-core（teammate）；基线 HEAD `1963b940`（Lead 提交的删 grant 那一版）。
写域：`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/kit/handlers.js`、
`vibe-math-vmu/packs/v5r/settings/defaults.json`（只加 `vmu.records.tracks` 一项）、`tests/**`、本文件。
**没有**改：`kernel/**`、`settings/schema.js`、`packs/v5r/prompts/**`。

## 1. 五件结论（一句话：五件全部落地并跑绿，其中 B8 是“复核已接线”，不改代码）

| # | 规则行 | 结论 | 主要落点 | 具名拒 |
|---|---|---|---|---|
| 1 | B11 反馈台账 | ✅ 承诺变真：`report` / `overview` / `feedback op=list` 现在都有**同一分类器**算出的 `{open,closed,total,declared}` | `packs/v5r/tools.js:222-300`（`FEEDBACK_CLOSED_LINE` / `classifyFeedback` / `feedbackCounts`），`counts.feedback` 在 `tools.js:292`、`tools.js:528` | 无（读面；`declared:false` 时如实缺席，不编 0） |
| 2 | C2 紧急私信 | ✅ 成员可达：`vibe_v5_say` 的私信分支接受 `urgent:true`（并写进 `kernel.mailbox.send` 的 `urgent` 语义），收件箱行可被唤醒 | `kit/handlers.js:283-306`（`urgentFlag`、拒绝非私信形态）、`packs/v5r/tools.js:96-153`（`urgencyById` join、`inboxRow.urgent`、`open` 的 `urgent`） | `VMU_INVALID_ARGUMENT`（会议发言/群聊带 `urgent` 时点名拒，说明“没有收件人可唤醒”） |
| 3 | C3 状态板四要素 | ✅ 四要素成闸：写 `state` 轨缺任一要素 ⇒ 具名拒并列出缺哪几个；未知要素不再被静默丢弃；`read_library` 改为**读声明的全部轨**（不再硬编码四轨），`state`/`obstacles`/`rejected`/`feedback` 都读得到 | `kit/handlers.js:115-190`（`STATE_FIELDS`/`STATE_HINT`/闸/正文分段/`stateStamp`）、`packs/v5r/tools.js:1786-1788`（`read_library` 描述与 `track`/`tracks` 参数） | `VMU_INVALID_ARGUMENT`（`missing:[…]`、`required:[…]`；`kit/handlers.js:150-166`） |
| 4 | B10 脚本归档 | ✅ 归档面存在且可复算：新工具 `vibe_v5_script`（`op=archive|read|list`），落 `scripts` 轨、`kind:'dataset'`、指纹由内核算、正文**逐字**返回 | `packs/v5r/tools.js:556-660`（实现）＋`:1726-1733`（工具声明）＋`settings/defaults.json:19`（`tracks` 加 `"scripts"`） | `VMU_INVALID_ARGUMENT`（未声明 scripts 轨 / `op` 非法 / 缺 `name`/`text`）、`VMU_NO_SUCH_OBJECT`（按 id/name 找不到） |
| 5 | B8 四条谓词接线 | ✅（复核，不改代码）：四条闸已在**生产路径**上被调用，且被拒时是**具名回执**不是裸抛 | `packs/v5r/tools.js:885-905`（`p1Intent`+`singleWriter`）、`:923-935`（`singleWriter`）、`:992-1019`（`fidelityAsked`）、`:1075-1141`（`debateSubjectGate`） | 闸自己的码：`VMU_PACK_V5R_P1_NEEDS_DEBATE` 等（`packs/v5r/verification-gates.js:39-44`） |

## 2. C2 的细节，以及一个**内核侧**的真缺口（不在本轮写域，需另一 lane 或 Lead 派单）

- 改前实测：`vibe_v5_say` 的私信分支没有 `urgent`；能带紧急的只有 `vibe_vmu_mailbox`，而提示词从没教过成员用它 ⇒ 规则里“紧急私信”对成员**不可达**。
- 改后：`kit/handlers.js:285` 收 `urgent:true|'true'|1|'1'`，`:305` 原样交给 `kernel.mailbox.send(...)`（不自己重算 `kind`），`:306` 回执带 `urgent`；会议发言（`:287-290`）与群聊（`:308-311`）带 `urgent` 被点名拒。
- ★ **内核缺口（本轮发现，未修）**：`kernel/mailbox.js` 把 `urgent` 存在**条目**上，但两个分诊读面都不带它 —— `listRow` 只给八个字段、`openView` 只给六个，都没有 `urgent`。所以 **pack 侧用 `mailbox.pending(member)` 做 id→urgent 的 join**（`packs/v5r/tools.js:96-127`），join 不到就如实给 **`urgent:null`**（“这个读面分不清”，绝不等于“不紧急”，提示里写明）。
  - ★ **已修（ROUND 52，Lead 裁决“补”）**：`kernel/mailbox.js` 的 `listRow`（八字段 → 九字段）与 `openView`（六字段 → 七字段）都补 `urgent`，取值口径与写入侧同义：布尔原样透传，只有条目**确实没有**该字段时才给 `null`（绝不发明 `false`）。同步改了 `tests/vmu-mailbox.test.mjs:97` 的字段数断言并新增三条正例（list 行、open 视图、真实 `urgent:true` 私信）。pack 侧原来的 join 现在退化成“直读优先、join 兜底”，行为不变、可后续删除。
- 我方对**既有测试**的必要调整：`tests/vmu-v5r-tools.test.mjs:1496,1514` 原来断言“行**恰八个**字段”，现改为“恰九个（八字段＋紧急标）”——规则要求行内可见紧急，八字段契约让位。

## 3. C3 的细节

- 四要素：`progress`（当前进度）/ `obstacles`（遇到的障碍）/ `next`（下一步计划）/ `help`（需要的帮助）。
- 接受两种写法：嵌套 `state:{progress,…}` 或平铺；`content` 仍可作自由文本，但**不能替代**四要素（`kit/handlers.js:168-171`）。
- 缺要素 ⇒ 具名拒，`e.missing` 列缺的键、`e.required` 列全集，`hint` 带四要素的中文释义（`:150-155`）；未知要素不静默丢，写进正文并回执 `state.fields`（`:158-162`）。
- 时间信息由内核盖（`createdAt`/`updatedAt`），回执的 `at` 是**读回记录**得到的，不是自己拿时钟编（`:119-130`、`:177-183`）。
- 看他人：`vibe_v5_read_library` 的 `tracks` 从 `vmu.records.tracks` **派生**（`kit/handlers.js:52`、`packs/v5r/tools.js:1786`），因此 `state`/`obstacles`/`rejected`/`feedback` 现在都读得到（改前硬编码四轨，正是台账那条“读不到 state”的由来）。

## 4. B10 的细节

- 规则原文的 hint 说“请走归档/复算流程”，改前**没有任何落点**（乙类缺陷：公开要求没有机制）。
- 归档：`op=archive` 收 `name`＋`text`（`purpose`/`parent`/`edition` 可选）⇒ 落 `scripts` 轨、`kind:'dataset'`（内核自己的 artifact 词表，`vmu.records.allowedKinds` 没有新增）、`settled:true`、指纹由 `records.put` 按 `vmu.records.fingerprintPolicy` 算；正文**逐字**存（`tools.js:594-620`）。
- 复算：回执里的 `recompute` 明写“把归档正文再跑一遍（`math_computation op=run mode=file`）并比较指纹”，因为指纹是内核的，才能证明“漂移”。
- 读回：`op=read` 按 `id` 或 `name`（同名取最新 edition），返回 `script.text` 与归档字节一致；`op=list` 只给头行（`tags` 不在头字段里，故不回，注释写明）。
- 轨未声明 ⇒ **不假成功**：`VMU_INVALID_ARGUMENT`（`declared`/`missingTrack` 两个事实键）。
- 声明只加一处：`packs/v5r/settings/defaults.json:19` 的 `vmu.records.tracks` 加 `"scripts"`（`verified` 已由另一 lane 加过）；`settings/schema.js` 未动（`vmu.records.tracks` 是既有数组键，值层在 pack）。
- 没有碰提示词：`v5r-core-no-adhoc-scripts` 那条规则仍拒 `vibe_vmu_script`，替代路径从“无落点”变成“归档面”（`packs/v5r/prompts/v5r-core.js` 未改）。

## 5. B11 的细节（含一个“自信而假”的修正）

- 规则要求 `report` / `overview` 有反馈统计；改前 `vibe_v5_report` 只报任务与会议，**没有**反馈数。
- 语义：一张反馈卡“已关闭”＝**正文裁决行** `status：closed`（`vibe_v5_feedback op=update` 写的就是它）。
- ★ 我先写的版本是 `closed = r.status === 'closed'`：records 头行的 `status` 是**生命周期态**（`live|trashed`，`kernel/records.js:331`），永远不是 `closed` ⇒ 那个计数会永远 0 —— 一个“自信的假数”。改成读正文第一行（`FEEDBACK_CLOSED_LINE`，`packs/v5r/tools.js:228`），并在代码注释里留下这次测量。
- 三个面共用**一个**分类器 `classifyFeedback`（`tools.js:235`），所以 `report.counts.feedback`、`overview.feedback`、`feedback op=list` 的数字不会互相打架（测试里断言三处一致）。
- 读不到正文 ⇒ 进 `unreadable`，**不**算 closed（不吞异常、不猜）。

## 6. 一个系统性发现：**内核抛出的拒绝会被宿主丢掉“归属”字段**

- 实测：包侧把闸的拒绝**抛**出去，宿主 `host.js` 的 `toHostSpec` 只留 `{ok:false,code,message,hint}`，`enforced`/`enforcedScope`/`settingValues` 全丢 ⇒ docs/03 承诺的“拒绝可追溯读了哪些键”在任何 pack 工具上都不可观测。
- 本轮的做法：`packs/v5r/tools.js:766-790` 的 `gateRefuse(gate)` 把拒绝变成**返回的回执**（`{ok:false, code, message, hint, enforced, enforcedScope, gate:{…}}`），保留归属；`kit/handlers.js:35-50` 的 `refusalReceipt` 同理用于状态板四要素拒。
- 这不只是观感问题：D15 的 `lane-verdict.md` 里也记了同一个宿主行为。
- ★ **已修（ROUND 52，Lead 裁决“补”）**：`host.js` 的 `toHostSpec` 错误分支现在用 `refusalAttribution(e)` 保留 `enforced`（数组，元素转字符串、空串剔除）/`enforcedScope`（非空字符串）/`settingValues`（对象浅拷贝），**只在抛出方真的设置了这些字段时才透传**——不读设置的拒绝不会凭空长出 `enforced: []`（那是“我查过了”的假声明），非数组的 `enforced` 也不透传。
- 陪跑的测试（先红后绿）：`tests/vmu-host-refusal-attribution.test.mjs`（10 条，改前 **6 passed / 4 failed**，改后 10/0）。
- 关于 `packs/v5r/tools.js:766-790` 的“退回执”写法：**保留，但理由已改写**。旧注释说“宿主会丢掉归属”，现在这句话不再成立；新注释明确写：宿主已补齐（由上面那条测试证明），两种写法**等价**，保留回执是因为 v5r 的调用方把它当数据读、且回执能直接带闸自己的事实。同一处还清掉了上一轮改写法时残留的两行死代码（`e.enforcedScope = …` / `throw e`，在 `return` 之后永远不可达，且引用了不存在的 `e`）。

## 7. 门禁实数（全部真实退出码，本回合实测）

| 命令 | 结果 |
|---|---|
| `node tests/vmu-phase12-closures.test.mjs`（新） | **49 passed, 0 failed**，exit 0 |
| `node tests/vmu-v5r-tools.test.mjs` | **339 passed, 0 failed**，exit 0（含我改的九字段断言） |
| `node tests/vmu-kernel.test.mjs` | **260 passed, 0 failed**，exit 0 |
| `node tests/vmu-mailbox.test.mjs` | **73 passed, 0 failed**，exit 0（九字段 + urgent 三条正例） |
| `node tests/vmu-mailbox-falsify.test.mjs` | 10/0，exit 0 |
| `node tests/v4-mailbox-stall.test.mjs` | 4/0，exit 0 |
| `node tests/vmu-host.test.mjs` | **196 passed, 0 failed**，exit 0 |
| `node tests/vmu-host-refusal-attribution.test.mjs`（新） | **10 passed, 0 failed**，exit 0（改前 6/4 = 先红） |
| `node tests/audit-vmu-services.test.mjs` | 49/0（83 registered），exit 0 |
| `node tests/vmu-resume-e2e.test.mjs` | **108 passed, 0 failed**，exit 0 |
| `node scripts/regen-all.mjs --check` | ROUND 52 复跑 **14/16**，exit 1 —— 两份红都是**派生面要重算**、不是逻辑红：`coverage debt (docs/acceptance/audit-coverage-debt.md)` OUT OF DATE、`documented counts (README / checklist)`（新测试文件计入 JOBS/FILES）。按纪律**没有**跑 `--write`，等 Lead 统一重生成 |
| `node scripts/check-docs.mjs` | DOC LINT: PASS，exit 0 |
| `node tests/audit-code-size.test.mjs` | 9/0，exit 0（最大 3296 行 index.js） |
| `node tests/vmu-verified-gates.test.mjs` | 95/0，exit 0（B8 复核用） |
| `node tests/audit-enforced-consistency.test.mjs` | 344/0，exit 0（25 个拒绝场景，findings=0） |
| `node tests/audit-vmu-docs.test.mjs` | 103/0，exit 0 |
| `node tests/vmu-doc-claims-vs-code.test.mjs`（另一 lane 的新门禁） | 12/0，exit 0 —— 其中 `script-archive-recompute-flow` 由 `vibe_v5_script` 兑现 |
| `node tests/vmu-pack-defaults-named.test.mjs` | 36/0，exit 0 |
| `node tests/audit-pack-json.test.mjs` | 9/0，exit 0 |
| `node tests/vmu-settings.test.mjs` | 46/1（当时唯一红 `vmu.meetings.sequenceMax`）——**Lead 已于 ROUND 52 撤掉该临时键**，本轮不再复现 |

## 8. 新测试覆盖（`tests/vmu-phase12-closures.test.mjs`，49 条）

① B11：空台账 ⇒ `declared:true,total:0`；两张反馈（一开一关）⇒ `open:1,closed:1,total:2`；`report`/`overview`/`list` 三处数字一致；关闭一张后 `open:0,closed:1`（正文裁决行）。
② C2：`urgent:true` 私信 ⇒ 收件箱行 `urgent:true`；默认私信 ⇒ `urgent:false`；群聊/会议带 `urgent` ⇒ 具名拒（含“没有收件人可唤醒”）；收件箱 list 提示里写明 `urgent:null` 的含义。
③ C3：四要素齐 ⇒ 写卡并回执 `state.fields`；缺一个 ⇒ `ok:false` + `code` + `missing`；平铺写法同样通过；`read_library` 能读到 `state` 轨（他人状态板可见）；未知要素不被静默丢。
④ B10：`scripts` 未声明 ⇒ 具名拒；archive ⇒ 回执带指纹；read 按 id/name ⇒ 正文逐字一致；list ⇒ 头行不含 `tags`（注释说明理由）。
⑤ B8：四条闸的**生产调用点**被触达（p=1 无定论 ⇒ 被 `VMU_PACK_V5R_P1_NEEDS_DEBATE` 拒；单写者；辩论对象无证明；`fidelity` 追问），且拒绝回执带 `enforced`（空数组＋`enforcedScope`，因为谓词本身不读设置——非空才是虚报）。

## 9. 未做项

1. ~~`kernel/mailbox.js` 的 `listRow`/`openView` 不带 `urgent`~~ → **ROUND 52 已修**（见 §2、§10.1）。
2. ~~`host.js` 丢弃拒绝的 `enforced`/`enforcedScope`~~ → **ROUND 52 已修**（见 §6、§10.2）。
3. ~~`tests/vmu-settings.test.mjs` 的 `vmu.meetings.sequenceMax` 红~~ → **Lead 已撤键**，不归我。
4. `vibe_v5_script` 的脚本轨已进 `defaults.json`；如果机构要另给“脚本目录/命名规范”，那是 pack 政策，本轮没有编。

## 10. 两条内核/宿主缺口：现状 → 期望 → 判据（供台账 §13 逐条登记）

### 10.1 邮件读面丢 `urgent`（读面删事实）

- **现状（改前）**：`kernel/mailbox.js` 的 `listRow` 只给 8 个字段、`openView` 只给 6 个，**都没有 `urgent`**；而写入侧（`sendBody`）在条目上写了 `urgent`，`send()` 的回执也回了它。结果是：一条紧急私信在收件人的分诊行里与普通邮件**完全一致**，唯一补救是调用方自己 `pending()` 做 id→urgent join——而 `pending` 只含未 ack 的条目，ack 之后 join 不到，拿到的只能是 `null`，即“分不清”退化成了“没有”。
- **改后**：`listRow` 9 字段、`openView` 7 字段，都有 `urgent`；取值口径与写入侧同义（布尔透传；仅当该条目确实没有这个字段时给 `null`，不发明 `false`）。改动点：`vibe-math-vmu/kernel/mailbox.js` 的 `urgentOfEntry` + 两个投影函数。
- **判据（可复核）**：① `tests/vmu-mailbox.test.mjs` 断言 list 行**恰九字段**且初始 `urgent:false`、open 视图带 `urgent`、真实 `urgent:true` 私信在两个读面都为 `true`（73/0）；② `tests/vmu-mailbox-falsify.test.mjs` 10/0（正文不泄漏那条反证仍在）；③ `tests/vmu-v5r-tools.test.mjs` 339/0（收件箱行九字段）；④ 判据的反面：若有人把 `urgent` 又删掉，①的三条正例立刻红。

### 10.2 宿主丢弃被抛拒绝的归属字段（两种拒绝写法不等价）

- **现状（改前）**：`host.js` 的 `toHostSpec` 错误分支只返回 `{ok:false, code, message, hint}`，`enforced`/`enforcedScope`/`settingValues` 全丢；而成功分支经 `boundedToolResult`（带 `receiptMeta`）。于是“抛具名拒”与“返回 `{ok:false,…}`”两种写法在宿主处**不等价**：抛的人拿不到“这次拒读取了哪些键”，docs/03 承诺的可观测性对 pack 工具整体失效。v5r 的闸拒绝被迫改成返回回执，正是被这个缺陷逼出来的代码形状。
- **改后**：`host.js` 新增 `refusalAttribution(e)`，错误分支 `Object.assign({ok:false,code,message,hint}, refusalAttribution(e))` 后再过 `boundedToolResult`。保留规则：`enforced` 仅当是数组（元素转字符串、去空串）、`enforcedScope` 仅当是非空字符串、`settingValues` 仅当是普通对象（浅拷贝）；**抛出方没设置就不出现**，非数组的 `enforced` 不透传。
- **判据（可复核）**：① 新测试 `tests/vmu-host-refusal-attribution.test.mjs`：改前 **6 passed / 4 failed**（正是“归属字段不在”那三条 + 空数组那条），改后 **10/0**；② 反例也在同一文件里：不读设置的拒绝**不带** `enforced`（防“我查过了”的假声明）、非数组 `enforced` 不透传；③ `tests/vmu-host.test.mjs` 196/0（宿主其它行为未被影响）；④ `tests/audit-enforced-consistency.test.mjs` 344/0（模块层 25 个拒绝场景仍是 `enforced[]` 或具名值，findings=0）。
