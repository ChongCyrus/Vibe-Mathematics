# Round 2 · 目标 6 交班报告：主代理＝助手（自动汇报原语 · 参数配置面 · 人设真机装配）

> 负责人：`vmu-assistant`｜任务：`task-13`｜判据：`_handoff/vmu/00-decisions.md` **D-09**｜v5r 实测：`_handoff/vmu/03-v5r-full-inventory.md` 分片 C §⑤（两层主代理、参数只能 office 改、**无自动汇报机制**）
> 仓库：`Vibe-Mathematics`（分支 `main`）｜写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16`、`docs/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未越界**（`packs/**` 其余、`host.js`、`kernel/index.js`、`settings/schema.js`、`package.json`、`installer.js` 一行未改 ✓）。

---

## 0. 一句话结论

D-09 的三项判据**全部落地并有真机证据**：① 自动汇报原语（`kernel/report.js`：事件/周期/阈值三类触发 ＋ 模板 ＋ 收件人/通道 ＋ **可关** ＋ 留痕 ＋ **绝不驱动**）；② 参数配置面（`tools/report.js` 的 `vibe_vmu_report`，**域与 owner 由声明给出**，改动**走内核设置守卫并进审计**）；③ 人设/提示词段**真的进入**两个装配面：**回合注入**（`PACK.sections` → 提示词管线，真机入口实测）与 **system prompt**（`assistant.json` → `ctx.systemPrompt.section`，真机入口实测）。三个自带套件 **147 项断言全绿**。

---

## 1. 交付物（逐项 file:line）

| # | 文件 | 关键位置 | 是什么 |
|---|---|---|---|
| 1 | `vibe-math-vmu/kernel/report.js`（新，561 行） | `:95` `createReport`；`:38` `CODE`；`:57` `TRIGGER_KINDS`；`:63` `EVENT_VOCAB`；`:67` `THRESHOLD_OPS`；`:70` `DRIVING_FIELDS`；`:73` `TEMPLATE_VARS`；`:132` `readClock`（**懒读**）；`:347` `tick`；`:396` `emit`；`:421` `preview`；`:461` `paramDomain`；`:505` `guardParam`；`:487` `noteParamChange`；`:525` `status`；`:560` 返回面 | 汇报原语（能力进内核） |
| 2 | `vibe-math-vmu/tools/report.js`（新，~110 行） | `:13` `makeReportSpec({param,refused,TOOL_NAMES,kernel})`；`:26` `action` 八值枚举；`set` 分支调 `guardParam` → `kernel.setSettingsValue` → `noteParamChange` | 工具面 `vibe_vmu_report`（**唯一写者＝内核**） |
| 3 | `vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js`（新） | `:20` `V5R_ASSISTANT_TURN_SECTION`（order 608）；`:38` `V5R_ASSISTANT_TURN_SECTIONS` | 回合面：成员的汇报义务/对外出口/参数面归属 |
| 4 | `vibe-math-vmu/packs/v5r/prompts/assistant.json`（新） | 3 节：`v5r-assistant-identity`(605)／`-reporting`(606)／`-parameters`(607)，每节 `hostPrompt:true` | system prompt 面：office＝所办/助手人设 |
| 5 | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js`（改，仅我范围内） | `:101-141` `PACK.settings` 的 `vmu.report.*` 策略（三触发＋参数域 8 键＋owner）；`:273` 导入；`:281` `v5rCharterSectionsGlobal` 并入回合段 | pack 声明（策略进 pack） |
| 6 | `vibe-math-vmu/docs/16-research-lifecycle.md`（改） | `:516` `## 9. 汇报作为生命周期的一个相位（目标 6 · D-09）` | 相位侧接口（哪个阶段该汇报） |
| 7 | `vibe-math-vmu/docs/22-academic-operations.md`（改） | `:993` `## 19. 主代理＝助手：汇报原语与参数配置面（目标 6 · D-09）` | 原语/工具/声明/证据/验收 |
| 8 | `tests/vmu-assistant-report.test.mjs`（新，10 节 93 断言） | §1 零机制／§2 三触发／§3 模板／§4 可关／§5 绝不驱动（含"无 import"结构证明）／§6 留痕／§7 参数域／§8 工具面／§9 pack 策略有效／§10 **字符串时钟崩溃回归** | |
| 9 | `tests/vmu-assistant-assembly.test.mjs`（新，6 节 39 断言） | §1 两份声明形状／§2 host 段必须无变量／§3 `PACK.sections` 真含回合段／§4 管线装配三角色＋关段零注入／**§5 真机入口：活管线里真的注册并装配**／§6 人设内容判据 | |
| 10 | `tests/vmu-assistant-systemprompt.test.mjs`（新，4 节 15 断言，`--print` 出证据） | §1 入口读 `assistant.json`（源码事实）／**§2 真机入口：`ctx.systemPrompt.section` 里逐字含三段人设**／§3 无 pack 则零注入／§4 无变量 | |

---

## 2. 判据逐项（A/B/C/D）

### A. 自动汇报原语 —— `kernel/report.js`
- **触发**：`TRIGGER_KINDS = ['event','period','threshold']`（`:57`）；事件词表**闭集**（`EVENT_VOCAB` 8 项，`:63`）——词表外的名字是**声明期具名红** `VMU_REPORT_TRIGGER_UNKNOWN`；周期受 `vmu.report.minIntervalMs` **钳制且钳制写进 `notes[]`**；阈值比较只认 `THRESHOLD_OPS` 五值（`:67`）。
- **内容模板**：`TEMPLATE_VARS`（`:73`，`at/event/name/count/value/metric:/setting:`）；白名单外变量＝声明期具名红；**装配期取不到值 ⇒ 具名拒而不留空槽**；超 `vmu.report.templateMaxChars` ⇒ 截断＋**省略字数写进正文**＋计数。
- **收件人/通道**：`to[]` ＋ `channel`，通道必须落在 `vmu.report.channels`；非 `log` 通道无收件人 ⇒ `VMU_REPORT_NO_RECIPIENTS`。
- **可关（零机制）**：schema 默认 `vmu.report.enabled=false` ＋ `vmu.report.reports=[]` **两道闸**；关掉后已声明的报告**不触发**、且 `status().problems` **具名**报出 `VMU_REPORT_NOT_ENABLED`（"已声明但停用"≠"从未声明"）；`emit()` 同码拒；单条声明可 `enabled:false`。
- **留痕**：trace 环（`vmu.report.traceCap`，**溢出计数**）＋审计行（`what:'create'`）＋`log`。
- **绝不越权驱动**：`DRIVING_FIELDS`（`:70`）出现任一即 `VMU_REPORT_ACTION_NOT_ALLOWED`；**每份回执/留痕/投递都带 `drives:false`**；**结构证明：该模块 `import` 数为 0**（套件 §5 断言源码），够不到任何决策服务。

### B. 参数配置面 —— `tools/report.js` ＋ `kernel/report.js::guardParam`
- **改什么域**：`vmu.report.params`（声明给出）；域外 ⇒ `VMU_REPORT_PARAM_NOT_DECLARED`（**空域＝任何键都拒，而不是"全放行"**）。
- **谁可改**：`vmu.report.whoMayChange`（默认 `['office']`，v5r 的边界**作为声明**而非内核写死）⇒ 名单外 `VMU_REPORT_PARAM_NOT_ALLOWED`。
- **热改等级**：由**注入的只读描述接缝** `describeSetting` 给出（缺 ⇒ `described:false` 且 hot/who 报 `UNKNOWN`，**不臆造**）；H3 由内核设置守卫具名拒；回执带 `hot/appliesAt/requiresRestart/liveApplied/pendingConsumers`。
- **具名拒**：`requireReason=true` 无理由 ⇒ `VMU_REPORT_PARAM_REASON_REQUIRED`。
- **留痕进审计**：`noteParamChange` 写 `what:'update'` ＋ `subject:'setting:<key>'` ＋ `from/to/by/reason`；无审计接缝 ⇒ **具名上报** `VMU_REPORT_AUDIT_UNAVAILABLE`（不假装写过）。
- **唯一写者**：工具面**不自己写设置**，一律走 `kernel.setSettingsValue(key,value,{by})`（套件 §8 断言调用的是内核写者；域外/错 owner 时**零写入**）。

### C. 人设与提示词装配的真机证据（**两个通道都实测**）
- **回合注入**：`PACK.sections`（`v5r-core.js:281`）含 `v5r-report-duty` ⇒ 真机 `entry.apply(ctx,{packs:['v5r']})` 后 `kernel.status().prompt.sections` **含该名字** ⇒ `kernel.prompt.assemble({role:'researcher',…})` 的文本里逐字出现且 `sources` 点名（套件 §5）。
- **system prompt**：`assistant.json` 的 `hostPrompt:true` 三段 ⇒ 真机入口把它推入 `effectivePrompts` ⇒ `ctx.systemPrompt.section({name:'vmu',…})` 的 `text` **逐字含三段**，且 `handle.prompts()` 报 `source:'pack:v5r'`（套件 §2）。
- **可关**：管线 `disable('v5r-report-duty')` ⇒ 文本＋标题**整段消失**，`enable` 后**逐字节复原**（套件 §4）——零注入而非空标题。
- **不静态硬编码**：入口**不认识 pack 名字**（套件断言源码不含 `v5r-assistant`／不 import 该模块）✓。

### D. 文档
`docs/16 §9`（相位侧：三类触发的生命周期映射、模板/截断/通道、与 `22-§19` 的分工、验收、未核项）＋`docs/22 §19`（原语导出面、工具面、三份声明三消费者、零机制与可关、绝不驱动、真机证据表、键/服务/接缝、验收、未核项）。`scripts/check-docs.mjs` ⇒ **issues=0**（详见 §4）。

---

## 3. v5r → vmu 对照（三层：v5r 机制 → 内核原语 → pack 声明）

| v5r 实测机制 | vmu 内核原语 | v5r pack 声明 |
|---|---|---|
| 人设文字「主动向院士汇报」（`charterFor` [二·7]） | 模块段 `PACK.sections` → 提示词管线（每轮注入） | `v5r-assistant.js` 的 `v5r-report-duty`（order 608，`{{ setting:vmu.turn.instituteName }}`） |
| **无任何定时/自动汇报**（分片 C §⑤：只有人设＋`Progress/`＋院士主动 `overview`＋office 手动 `report()`） | `createReport` 的 event/period/threshold 三类触发 ＋ `tick()` 纯评估（**无内部 timer**） | `PACK.settings['vmu.report.reports']` 三条（周期 15min／`meeting-closed`／`artifacts ≥ 5`），收件人 `office` |
| `report()`／`self_report`／`overview`（手动、只读视图） | `status()/declarations()/trace()/paramDomain()/preview()` | 工具面 `vibe_vmu_report` 的 `status/declarations/trace/params/preview` |
| `withOffice` 拒其他人 `V5_NOT_OFFICE`（`vibe-math-v5r.js:11036-11046`） | `guardParam()` ＋ 内核 `setSettingsValue` 的 H3/owner 守卫 | `vmu.report.params`（8 键）＋ `vmu.report.whoMayChange:['office']` |
| office 人设：不研究、不投票、无座（`agent.cordis.yml:74-86`） | `assistant.json` → `ctx.systemPrompt.section`（root 会话） | `v5r-assistant-identity`（605） |
| v5r 参数落盘 `State/<institute>.v5state.json` 的 `params`，重启 `syncParamsFromState` 重建 | 内核设置层 ＋ 热改等级（H0–H3）＋ 审计行 | 域声明即白名单（**不复制内核实现** ✓） |

---

## 4. 原样命令与退出码（全员停写前的读数）

```
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-report.test.mjs
=== VMU ASSISTANT REPORT: 93 passed, 0 failed ===            exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-assembly.test.mjs
=== VMU ASSISTANT ASSEMBLY: 39 passed, 0 failed ===           exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-systemprompt.test.mjs
=== VMU ASSISTANT SYSTEM PROMPT: 15 passed, 0 failed ===      exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-entry.test.mjs
=== VMU ENTRY: 141 passed, 0 failed ===                       exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-host.test.mjs
=== VMU HOST: 103 passed, 0 failed ===                        exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-turn.test.mjs
=== VMU TURN: 145 passed, 0 failed ===                        exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-pack-data-sections.test.mjs
=== PACK DATA SECTIONS: 14 passed, 0 failed ===               exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-corpus-is-baseline-not-template.test.mjs
=== CORPUS IS BASELINE NOT TEMPLATE: 7 passed, 0 failed ===   exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-containment.test.mjs
=== VMU CONTAINMENT: 33 passed, 0 failed ===                  exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/audit-module-coverage.test.mjs
=== MODULE COVERAGE: 5 passed, 1 failed ===                   exit=1   ← 见 §6（gaps 全是别人的模块，`report` 不在其中）
D:\wd\vibemath开发\Vibe-Mathematics> node scripts/check-docs.mjs
vmu doc-lint: docs=29  issues=0  notes=24 / DOC LINT: PASS          exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/audit-declaration-criterion.test.mjs
RULE E fingerprints: shape=file:shape:receiver current=67 baseline=67     ← 我的三个文件**不在** hits/新增指纹里
=== DECLARATION CRITERION: 67 passed, 7 failed ===             exit=1   ← 7 条全是别人的在途文件（RULE F: chat.js/mailbox.js；RULE C/D；regen-all stale）
```

### RULE E（vmu-verify / Lead 点名的那一处）——已按"非空断言"修，未用豁免、未改基线

```
tests/vmu-assistant-report.test.mjs:341
  ok(d.items.length > 0 && d.items.every((it) => it.to.includes('office')),
     'every pack report is addressed to the office, which is v5r\'s external interface', { reports: d.items.length })
```
即：**守卫与检查在同一表达式**里，并把**集合大小打进 detail**（空集 ⇒ 断言直接为假，不可能空洞通过）。复跑 `node tests/audit-declaration-criterion.test.mjs`：`RULE E fingerprints: shape=file:shape:receiver current=67 baseline=67`，且**任何 `vmu-assistant*` 文件都不出现在指纹集里** ✓（未用 `EMPTY_ALLOWED`，未 `--write-baseline`）。
另：本仓"零机制 ⇒ 恰好 0 条汇报"是**被证明的空**（`tests/vmu-assistant-report.test.mjs` §1：`declared === 0` ＋ `tick().note` 含 `zero mechanism` ＋ 文本里明写零机制理由），不是巧合的空 ✓。

### 真机证据片段（可复现：`node tests/vmu-assistant-systemprompt.test.mjs --print`）

```
----- ctx.systemPrompt.section TEXT (first 700 chars, as the host receives it) -----
【你的位置：所办（对外接口）】
你是本所的**所办**——人类与所内之间的助手与对外接口。这条界线是硬的：
  · 你**不参与研究**：不提出、不证明、不评判任何数学断言，也不替成员思考；
  · 你**不投票、无座**：你不是成员，本所的表决与定论里没有你的一票；
  · 你**不越权**：分派、优先级、会议主持属于所内的领头人（院士）；你负责的是与人沟通、把外部的要求原样转达、把所内的实况平实汇报出去。
…
【汇报：你的第一职责】
1. **用户问进度就汇报**：用 `vibe_vmu_report`（action=status/declarations/trace）读实况，然后**平实总结**…
2. **汇报由声明驱动**：… 由 `vmu.report.reports` 声明（事件／周期／阈值三类触发＋内容模板＋收件人/通道）。**没有声明就什么都不报**…
----- end excerpt · sections registered: 1 · chars: 1903 -----
```

回合注入侧的同款证据在 `node tests/vmu-assistant-assembly.test.mjs` §5：真机入口装载 v5r 后，`kernel.status().prompt.sections` 含 `v5r-report-duty`，`kernel.prompt.assemble(...)` 的文本含「主动汇报是成员义务」与标题 `v5r-report-duty`。

---

## 5. 缺陷与修复（本轮实测）

1. **字符串时钟把整个预设打崩（vmu-pack 报，我修）**：`createReport` 原来在**构造期**读 `clock()`，而内核交来的是 clockguard（对非有限读数**抛** `VMU_CLOCK_UNGUARDED`）⇒ `tests/vmu-entry.test.mjs:36` 的 ISO 字符串时钟让 `createKernel` 直接崩（**一个没被任何声明打开的汇报面能拖垮预设**）。
   **修法**：构造期**零时钟读取**；时钟只在真需要时**懒读**（`report.js:132 readClock`），不可用 ⇒ **具名条件**（`clock.ok:false` ＋ `status().problems` 里 `(clock)` 条目 ＋ `tick().clock.note`），周期触发**明说不可评估**而不猜；`emit()` 无可用时刻 ⇒ `VMU_INVALID_ARGUMENT` ＋ hint 指向显式 `at`。周期基线改为**首次评估时武装**（`status().periodBaseArmed` 可查）。
   **回归**：`tests/vmu-assistant-report.test.mjs` §10（字符串时钟＋抛异常时钟两种，含"构造不抛"与"显式 `at` 可用"）✓；`vmu-entry` 141/141 ✓。
2. **RULE E 空过指纹（vmu-verify 报、Lead 点名，我修）**：`d.items.every(...)` 在空集恒真 ⇒ 改为 `d.items.length > 0 && d.items.every(...)` **同一表达式**，并把 `{ reports: d.items.length }` 打进 detail ⇒ **空集立刻为假**。复跑扫描器：`RULE E fingerprints: current=67 baseline=67`，我的文件不在指纹集里（**未用 `EMPTY_ALLOWED` 豁免，未改基线**）✓。
3. **`VMU_PACK_CONFLICT`（我与 vmu-pack 撞车，已收敛）**：我一度把 `vmu.report.*` 写进 `PACK.settings`，而 `packs/v5r/settings/defaults.json` 也声明了 `enabled`/`whoMayChange` ⇒ 装载记名拒（D-02/O4 正常工作）。**收敛为单一 owner**：策略留在**清单**（`v5r-core.js`），vmu-pack 已在 `defaults.json` 写明"汇报策略不在此处"✓；套件 §9 现在**双向断言**（清单有策略 ＋ defaults 里没有 `vmu.report.*`），撞车会立刻红。

---

## 6. 跨人依赖（**不在我写范围**，已同步）

| # | 事项 | 归属 | 现状 |
|---|---|---|---|
| 1 | 服务 `vmu.report`、`kernel/index.js` 的 `createReport` 接线、`get report()`、`describeSetting` 只读描述接缝 | vmu-core | **已落** ✓（`kernel/index.js:133/699/964/1121`；`:347` 的 `settingDescription` 注释点名本面） |
| 2 | 工具面 `TOOL_NAMES.report`／`TOOL_FACES` 行／`on('report')`／`import makeReportSpec` | vmu-core | **已落** ✓（`host.js:46/129/222/736`） |
| 3 | `assistant.json` 的 host 段读取（插件按文件夹名读、`hostPrompt:true` 才登记） | vmu-core | **已落** ✓（`vibe-math-vmu.js:151-175`）——我的文件用 `hostPrompt:true` 与之对齐 |
| 4 | 11 个 `vmu.report.*` schema 行 | vmu-core | **已落** ✓（`settings/schema.js:941-951`，doc 原文一致） |
| 5 | 15 个 `VMU_REPORT_*` 登记 docs/03 §8 | vmu-core | **已落** ✓（`docs/03:300-314`，与 `kernel/report.js::CODE` 逐一对应） |
| 6 | **新文件双登记**（D-05：`package.json#files` ＋ `installer.js` PRESETS）：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/v5r-assistant.js`、`packs/v5r/prompts/assistant.json`、三个 `tests/vmu-assistant-*.test.mjs` | vmu-verify | **待办** ⏳（vmu-pack 也提醒过；未装包即 MODULE_NOT_FOUND） |
| 7 | `docs/03:157` 那行仍写 `vibe_vmu_report`「**零消费者、已降级为扩展**」＋`docs/23:180` 同款理由 | vmu-verify / Lead | **已过期** ⏳（该工具现已实现且有测试与 pack 声明；需改口径） |
| 8 | `tests/audit-vmu-services.test.mjs` 的"服务↔构造器"映射缺 `vmu.report` 一行 | vmu-verify | **待办** ⏳（当前该审计 46/2 失败，点名 `vmu.report`） |
| 9 | `docs/04` 生成表／`docs/00` 的 WIRING-INDEX 因新键而 stale（`vmu-settings` 45/2、`vmu-wiring-index` 预期红） | Lead（`regen-all`，D-11 收尾） | **按裁决属收尾步骤** ✓ |
| 10 | `agent/turn-stopping` → `kernel.report.tick({at,event:'turn-end'})`（周期汇报的宿主驱动） | vmu-core（host-hooks） | **未接线** ⏳（兜底已可用：`vibe_vmu_report {action:'tick'}`；已写进 `docs/22 §19.9` 未核项） |
| 11 | `kernel/lifecycle.js`、`kernel/chat.js`、`kernel/mathadapters.js` 等新模块的 docs 覆盖／RULE F／RULE E | v5r-reader-a/c/b | 别人在途（`audit-module-coverage` 的 9 个 gaps、`RULE F` 的 `chat.js/mailbox.js` 命中全是这些） |
| 12 | `tests/vmu-kernel.test.mjs:436`「Lean 面恰好读 8 键」现读 12（8 Lean ＋ 4 `vmu.math.jobs.*`，reader-b 的作业键） | vmu-verify（vmu-pack 已报） | **已实测核查：与我无关** ✓ —— 失败明细里的 12 个键**不含任何 `vmu.report.*`**；该套件 173/1。列此只为让收尾者不必回查来源 |

---

## 7. 未做项与未核项（诚实登记）

1. **周期汇报的宿主驱动未接线** ⏳：`tick()` 是纯评估（**无内部 timer**，这是设计决定 ✓）；宿主钩子那半在 vmu-core 面。今天可用路径：工具面 `action:'tick'`（已实测）。
2. **汇报没有 ack/已读闭环** ✗：只有投递＋留痕（`docs/16 §9.6-③`、`docs/22 §19.9`）。
3. **多收件人扇出上限未定** ✗（`docs/16 §9.6-④`）。
4. **"相位→该不该汇报"的默认策略未定** ✗（内核零策略 ✓，默认由 pack 给；已在 `docs/16 §9.6-①` 建议 `14-§2` 登记 T13）。
5. **参数 owner 只做字符串匹配** ✗（未接角色槽位解析；`docs/22 §19.9-④`）。
6. **汇报与人类审批正交、未联动** ✗（`docs/22 §19.9-⑤`）。
7. **未跑**：全量 sweep、`GATE_RELEASE`、`regen-all`、`update-doc-counts`（按 D-07 由 Lead 在全员停写后统一跑）✓；未 `git commit/push` ✓。
8. **未改**：`package.json`、`installer.js`、`settings/schema.js`、`kernel/index.js`、`host.js`、`vibe-math-vmu.js`、`packs/v5r/settings/**`、`packs/v5r/middleware/**`、`packs/v5r/index.js`、其它人的 `tests/**` ✓。

---

## 8. 写范围核对（可复核）

```
git status --porcelain   # 我方新增/修改（不含他人）
?? vibe-math-vmu/kernel/report.js
?? vibe-math-vmu/tools/report.js
?? vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js
?? vibe-math-vmu/packs/v5r/prompts/assistant.json
?? tests/vmu-assistant-report.test.mjs
?? tests/vmu-assistant-assembly.test.mjs
?? tests/vmu-assistant-systemprompt.test.mjs
?? _handoff/vmu/assistant-round2-report.md
 M vibe-math-vmu/packs/v5r/prompts/v5r-core.js      （PACK.settings 的 vmu.report.* ＋ 并入回合段）
 M vibe-math-vmu/docs/16-research-lifecycle.md      （新增 §9）
 M vibe-math-vmu/docs/22-academic-operations.md     （新增 §19）
```
