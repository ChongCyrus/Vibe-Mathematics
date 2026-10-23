# lane-verdict —— D15：辩论最终裁决的聚合与通知闭环（内核能力）

- 仓库 `D:\wd\vibemath开发\Vibe-Mathematics`，基线 HEAD `fb237c95`，Node v24.21.0。
- 本文件是 **lane-verdict 的证据表**：每条结论都必须能指到 `文件:行` 或一条命令输出；没有证据的写「未核」。
- 规则原文（phase 12，逐字）：
  > 机制：待辩论会议结束，v5r框架请刚刚各个辩论的各个成员给出最终裁决"布尔概率（[0,1]），理由，…"，若它们给出的布尔概率全部一致为1（或一致为0）则最终该命题的布尔概率为1（或0），否则取平均值。并发通知告诉该命题卡的持有者"由于…，该命题最终布尔概率裁定为…，故请把相应命题卡的布尔概率改为该概率值"。

**一句话结论**：规则的**算术**与**通知载荷**已经从「没有」变成「内核能力且有测试」（37 断言）；**投递**复用既有 mailbox 面（未造第二通道）；**服务身份**已按 Lead 裁决走 M4 `registry.register('vmu.meetingverdict')` + `SURFACES` 行 + `docs/03 §2` 一行（不是 `INTERNAL_ENGINES` 豁免）；**跨命题**的「一桶一裁定」纪律已补（见 §2.2，Lead 追问项）；**谁触发**仍归 pack（Lead 自己在 v5r 落 `vibe_v5_verdict_final`，见 §7）。

---

## 1. 交付物（全部为本回合实际落盘）

| 文件 | 变更 | 行数 |
| --- | --- | --- |
| `vibe-math-vmu/kernel/meetingverdict.js` | **新建**（含 §2.2 的跨命题纪律） | 416 |
| `vibe-math-vmu/kernel/bus.js` | 登记 1 个钩子 `meeting/verdict-ruled`（:101-106） | +5 |
| `vibe-math-vmu/kernel/index.js` | import(:94)、构造并绑 mailbox(:1321-1341)、能力目录(:1651)、**M4 注册(:1809)**、getter(:2013) | +50 |
| `tests/vmu-meeting-verdict.test.mjs` | **新建** | 491 |
| `tests/audit-vmu-services.test.mjs` | `SURFACES` 加 `'vmu.meetingverdict': 'meetingVerdict'`（+1 行，Lead 裁决 1 授权的落点） | +1 |
| `vibe-math-vmu/docs/03-interface-contract.md` | §2 服务表加 `vmu.meetingverdict` 一行（`audit-service-coverage` 的「服务必须在某卷里有名字」） | +1 |
| `docs/acceptance/conformance/lane-verdict.md` | 本文件 | — |

## 2. 规则 → 机制映射（逐子句指到代码）

| 规则子句 | 落点 | 证据 |
| --- | --- | --- |
| 「各个成员给出最终裁决：布尔概率（[0,1]），理由」 | `aggregateVerdicts({verdicts:[{member,p,reason}]})` | `kernel/meetingverdict.js:87`；行非对象（:100）、`member` 非空（:105）且不得重复（:109）；`p` 必须是 `[0,1]` 内**有限数**，字符串/NaN/Infinity 都被拒（:116）；越界（:121）；`reason` 必须非空（:126） |
| 「全部一致为 1 ⇒ 最终为 1」 | `mode:'unanimous'` 分支 | `:186` 判定（`allOne`）；`:191` `exact = 1`；测试 ① |
| 「全部一致为 0 ⇒ 最终为 0」 | 同上（0 是**值**，不是「没人投票」） | 空集被具名拒（`:92-95`），测试 ③ |
| 「否则取平均值」 | `mode:'mean'` ⇒ 算术平均 | `:191`；测试 ①（0.2/0.4/0.9 ⇒ 0.5）、② |
| 浮点纪律（不把 `0.30000000000000004` 写进命题卡） | `exact` + `rounded` + `valueSource`；写的值取 `rounded`（6 位） | `:47` `VERDICT_PRECISION=6`、`:191-205`；测试 ②（`(0.1+0.2)/2` ⇒ exact `0.15000000000000002` / value `0.15`） |
| 「并发通知告诉该命题卡的持有者」 | `rulePropositionProbability({…,owner,from})` ⇒ `notice` 载荷 | `:253`；载荷字段 `from/to/about/kind/value/mode/perMember/text`（`:290-307`）；**无 `owner`(:260) 或缺 `propositionId`(:255) 具名拒** |
| 「由于…，裁定为…，故请把相应命题卡的布尔概率改为该概率值」 | 默认模板（中文，含 `{proposition}`/`{value}`/`{n}`/`{list}`/`{reasons}`） | `:231-234`；模板可由 pack 替换（`:285`）、字段表 `TEMPLATE_FIELDS` `:237`；未知占位符**保留可见**而不是静默清空（`:239-240`）；测试 ④ |
| 「并发」的投递 | **复用既有 mailbox 面**：`kernel/index.js:1321-1341` 把 `send` 绑到 `mailbox.send(from,{to,text,kind:'dm',subject})` | 未造第二通道；`from` 为空 ⇒ 端口回 `ok:false`（具名）；测试 ④ |

### 2.2 ★ 「一桶一裁定」：票→动议的纪律用在裁决上（Lead 追问项，已落地）

Lead 问：`aggregateVerdicts` 是否只数**同一个命题**的裁决？`rulePropositionProbability` 是否拒**指向别的命题**的裁决？

答：**改之前它不拒** —— 行形状只有 `{member,p,reason}`，跨两个命题的一组裁决会被安静地取均值，那是一个「关于什么都没有的数」（每行都合法、算术也合法，答案两个命题都不对）。这是编号本该被门禁抓到的**静默错数**，所以按「绝不猜」补了纪律：

| 情形 | 行为 | 落点 / 测试 |
| --- | --- | --- |
| 行都不标命题 | 合法，纯计算，`proposition === null` | `:150-182`；测试 ⑧ 第 5 条 |
| 行都标同一命题（`propositionId`，读取别名 `proposition`） | 聚合，结果与 `perMember[].proposition` 都带该 id | `:150-182`；测试 ⑧ 第 1 条 |
| 行指向**多个**命题 | **具名拒**，消息列出「成员=命题」，并带 `err.propositions` | 测试 ⑧ 第 2 条 |
| 只标了**部分**行 | **具名拒**（半标的桶无法证明是同一个桶），带 `err.named`/`err.unnamed` | 测试 ⑧ 第 3 条 |
| 裁定目标 `propositionId` 与裁决行所指**不一致** | **具名拒**（不裁错卡），带 `err.target`/`err.verdictsAbout` | `:274` 把目标传进聚合；测试 ⑧ 第 4 条 |
| 目标与裁决行一致 | 照常裁定，`notice.about === propositionId` | 测试 ⑧ 第 5 条 |
| 行/参数的 id 是数字、空串、`{}`、`true` | **具名拒**（不做真值转换：数字 id 无法比较） | 测试 ⑧ 第 6 条 |

### 2.1 与既有面的关系（不是重复造）

- `vibe_v5_verdict`（`packs/v5r/tools.js` → `kernel/liveBallot`）：**单成员投票**，仍归 pack；本模块只吃「最终裁决集合」。
- `kernel/ballot.js` 的 `defaultTally`：**布尔进、布尔出**；本模块是 `[0,1]` 进、一个数出（规则要的正是后者）。
- `kernel/ballotbox.js` 的 `byChoice`：表决票箱的**选项**计数；与概率聚合无关。
- 一句话：本模块是「辩论已结束之后」的那一步，不接管会怎么开、谁能投。

## 3. 测试：`tests/vmu-meeting-verdict.test.mjs`

命令：`node tests/vmu-meeting-verdict.test.mjs` ⇒ **`=== VMU MEETING VERDICT: 37 passed, 0 failed ===`**（exit 0）

覆盖矩阵（Lead 点名的九项全部在，且每项断言的是机制而非措辞）：

| Lead 要求 | 测试用例 | 断言要点 |
| --- | --- | --- |
| 全一致 1 | ① | `mode='unanimous'`、`value===1`、`decided:true`、`estimate:false` |
| 全一致 0 | ① | `value===0`（不是空集） |
| 混合取均值 | ① | `exact===(0.2+0.4+0.9)/3`、`decided:false`、`estimate:true`（0.5 也不许被读成「裁定」） |
| 越界拒 | ③ | `-0.01/1.01/80/-1` ⇒ `VMU_INVALID_ARGUMENT` + 报出成员与收到的值 |
| 非数字拒 | ③ | `'0.8'/NaN/Infinity/null/undefined/{}` ⇒ 具名拒 |
| 重复成员拒 | ③ | `dup` 两次 ⇒ 具名拒 |
| 空集合拒 | ③ | 「空集不是 0」具名拒 + hint |
| 单成员（一致） | ① | `1⇒1`、`0⇒0`、`0.5⇒mean` |
| 通知载荷真的指名 owner+value+reason | ④ | `notice.to/owner/value/mode/perMember[].reason` 全部逐字段断言；`Object.isFrozen(notice)` |
| （附加）浮点 | ② | `exact ≠ value` 时 `valueSource==='rounded'`；一致分支 `valueSource==='exact'` |
| （附加）投递 | ④ | 绑端口 ⇒ 载荷真的交到端口且带 `from`；端口回 `ok:false` **也算失败**；端口抛异常 ⇒ 裁决保留 + 具名失败 + 留痕 |
| （附加）事件 | ⑤ | 绑 bus ⇒ 每次裁定 emit 一次 `meeting/verdict-ruled`；`aggregate` 与「被拒」不 emit；监听者抛异常 ⇒ 裁定仍成立、失败记数并留痕 |
| （附加）纯函数自证 | ⑥ | 同一集合问两次答案相同；`keys` 恒为 `[]`（**不读任何设置键**）；`status()` 计数与实际一致；导出面稳定 |
| （附加·Lead 追问）**一桶一裁定** | ⑧（6 条） | 同命题照常（`proposition` 与 `perMember[].proposition` 一致）；**多命题 ⇒ 具名拒**且列出「成员=命题」（`err.propositions`）；**部分标注 ⇒ 具名拒**（`err.named`/`err.unnamed`）；**目标与裁决行不一致 ⇒ 具名拒**（`err.target`/`err.verdictsAbout`，绝不裁错卡）；不标命题 ⇒ `proposition:null` 且照常算；非字符串 id（`7`/`{}`/`''`/`true`）⇒ 具名拒 |
| （附加·RULE E）**不许空洞断言** | ④ / ⑧ | 对集合「的性质」断言之前先证**非空**：`perMember` 两处都是 `Array.isArray(...)` + `length > 0` / `length === 2`，之后才 `map`/`every`。**已用 mutant 实证**：把模块里 `perMember` 改成 `[]` ⇒ ④ 与 ⑧ 双双 FAIL（`34 passed, 3 failed`，第三红是 mutant 里动态 import 的路径问题）。「空集上的 `every(...)` 恒真」是本仓反复出现的假绿家族，这条是它的反证 |

## 4. 必跑门禁（本回合实跑，含 exit code）

| 命令 | 结果 |
| --- | --- |
| `node tests/vmu-meeting-verdict.test.mjs` | **37 passed, 0 failed**，exit 0 |
| `node tests/vmu-kernel.test.mjs` | **260 passed, 0 failed**，exit 0 |
| `node tests/vmu-resume-e2e.test.mjs` | **108 passed, 0 failed**，exit 0 |
| `node tests/audit-hook-coverage.test.mjs` | **10 passed, 0 failed**，exit 0（双向：登记的钩子都有 emit 落点 / emit 都已登记） |
| `node tests/audit-vmu-services.test.mjs` | **49 passed, 0 failed（83 registered）**，exit 0 ← M4 注册 + `SURFACES` 行落地后从 48/1 转绿 |
| `node tests/audit-service-coverage.test.mjs` | **5 passed, 0 failed**，exit 0（`vmu.meetingverdict` 在 `docs/03 §2` 有名字） |
| `node scripts/audit-hook-emit-classification.mjs` | **7 passed, 0 failed**，exit 0 |
| `node tests/audit-code-size.test.mjs` | 9 passed, 0 failed，exit 0（最大仍 `kernel/index.js`，审计口径 3258 行） |
| `node scripts/check-docs.mjs` | **DOC LINT: PASS**，exit 0 |
| `node scripts/generate-wired-schema.mjs --check` | **exit 1**，`INVARIANTS ok: 330 emitted, 824 pre-existing`；不是本 lane 引入（本模块**新增 0 个设置键**），归因见 §6.2 |
| `node scripts/regen-all.mjs --check` | **exit 1，16 项中 6 项同步**；按 Lead 指示**不跑 `--write`**（他要在所有 lane 落完后统一跑一次），逐块归因见 §6.2 |

## 5. 反证：这个能力**不**做什么（避免下一位读者误解）

1. **不**把结果写进命题卡。载荷只说「请改成 X」；卡的实际写入仍归卡的主人与 records 面。
2. **不**判定「是否已证明」、**不**碰 verified 轨（那是 B1 lane 的事，`packs/v5r` 里没有 `verified` 轨是另一条缺口）。
3. **不**读任何设置键（`keys: []`，`status().note` 自述）：规则「全一致取原值否则均值」是 **pack 的规则**，内核不替它声明阈值。
4. **不**自己造通信：投递一律交给既有 mailbox 面；无 `send` 端口时载荷齐全但 `delivery.attempted === false`（不假装送达）。
5. **不**替 pack 决定措辞：`template` 可换，内核只保证四个事实（为什么/值/哪张卡/要做什么）能进文本。
6. **不**把 0.5 均值说成「裁定」：`decided/estimate` 是两个字段，通知正文也区分「全部一致」与「取平均值」。

## 6. 红项与归因（本回合实测，逐条）

### 6.1 曾红、已按 Lead 裁决 1 修好（保留过程，因为它记录了一次「假绿」的诱惑）

- 当时：`node tests/audit-vmu-services.test.mjs` ⇒ **48 passed, 1 failed**：`no constructed service is missing from the registry :: meetingVerdict`。根因：该审计规则 (4)（`tests/audit-vmu-services.test.mjs:147-151`）要求 `index.js` 里每个 `const x = createY(…)` 的结果要么在 M4 `registry` 里（并映射 `SURFACES`），要么列入 `INTERNAL_ENGINES`；我最初只挂了「能力门控服务目录」⇒ 被算 orphan。
- **Lead 裁决：走 1（正经 M4）**，理由（原话要点）：这是一个 pack 会 `requires` 的真服务；`INTERNAL_ENGINES` 是「没人用它」的桶，把 pack 本该用的东西放进去，等于对下一个读者撒谎。**「改名绕开扫描」被明确禁止**（那正是本仓禁止的假绿）。
- 实际落的四处（三处在我权限内，`SURFACES` 由 Lead 明确授权我写）：
  1. `vibe-math-vmu/kernel/index.js:1809` `registry.register('vmu.meetingverdict', { apiVersion: 1 }, { kind: 'service', description: … })`；
  2. `tests/audit-vmu-services.test.mjs` `SURFACES` 行 `'vmu.meetingverdict': 'meetingVerdict'`；
  3. `vibe-math-vmu/docs/03-interface-contract.md` §2 服务表一行（`audit-service-coverage` 的「每个可 requires 的服务必须在某卷里有名字」）；
  4. 复跑 ⇒ `49 passed, 0 failed (83 registered)`、`SERVICE COVERAGE: 5 passed, 0 failed`。

### 6.2 不是本 lane 引入的红（同期其他 lane 在工作树里改文件）

`git status --porcelain` 当时显示：`M kernel/meetings.js`、`M kernel/meetingmarker.js`、`M kernel/meetings-defaults.js`、`M settings/schema.js`、`M tools/meeting.js`、`M docs/acceptance/conformance/lane-meeting.md`、`?? lane-verified-design.md` —— 这些都不是我的写域（Lead 任务里明确「不要改 `tools/meeting.js`、`settings/schema.js`」）。因此：

| regen-all 红项 | 归因 |
| --- | --- |
| `kernel index (docs/02)` STALE | **本 lane**：新模块 ⇒ docs/02 内核表多一行。修：`node scripts/generate-kernel-index.mjs --write`（**按 Lead 指示不在此刻写**，统一落） |
| `surface indexes (docs/03/04/05/18)` STALE | **本 lane 部分**：`generate-surface-index.mjs` 从注册点 `description` 派生服务表 ⇒ 新注册行缺席；其余块是别的 lane 的 `settings/schema.js` 改动 |
| `documented counts`（README/checklist）STALE | **本 lane 部分**：+1 测试文件、+1 内核模块 |
| `settings table` / `wiring index` / `readiness figures` STALE | **其他 lane**：`settings/schema.js` 与其读者被同期改动（本 lane 新增 **0** 键、**0** 工具面） |
| `planned-code registry (docs/03-§8)` / `zero-mechanism matrix` / `coverage debt` | **其他 lane**：`kernel/meetings*.js`、`packs/v5r/**` 同期改动 |
| `generate-wired-schema --check` exit 1 | **其他 lane**：`settings/schema.js` 被改；本模块无新键（`WIRED_KEYS` 未涉及） |

⇒ Lead 已明确裁定：**我不跑任何 `regen-all --write` / `update-doc-counts --write`**，等所有 lane 落完由他跑一次合并 regen，避免把半成品树烤进派生面。

## 7. 未做项与需 Lead 决定的事项（★ 全部已裁决，此表保留裁决原样）

| # | 事项 | 现状 | Lead 裁决 |
| --- | --- | --- | --- |
| 1 | **谁调用它**（闭环触发点） | 内核只提供能力；v5r 里还没有调用者 | **→ (a) pack 工具**，不是钩子：`vibe_v5_verdict_final`（或扩展 `vibe_v5_verdict`），**由 Lead 自己在 vmu-pack 的 D9 合并后落**（避免与 vmu-pack 在 `packs/v5r/tools.js`／`tools/meeting.js` 三方撞车）。**拒绝 `meetings.close` 自动聚合**：那会拿「恰好躺在那里的裁决」造一个没有授权的机构决定；何时结束归主席 |
| 2 | **`from` 是谁** | 调用方传入（属政策） | **→ 会议主席（chair）的 member id**，由调用方显式传；**禁止**造 `'system'`/`'office'` 伪成员（`who:'office'` 是本仓的设置作用域词，不是成员 id；非成员签署的通知是错误的名字，比没名字更糟）。调用方点不出主席 ⇒ 工具具名拒，不匿名签发 —— 我的 `from` 必须是非空字符串的拒法已支撑 |
| 3 | **M4 注册 vs 目录专属** | 已按裁决 1 落地 | **→ 正经 M4**（§6.1），理由：pack 会 `requires` 它 |
| 4 | **是否要设置键** | 不需要 | **→ 同意不加**；6 位小数保持声明常量。将来需要可调时，等出现第二个消费者再说 |
| 5 | **v5r 提示词里的「m 票/JSON 回执」是否本回合动** | 不建议（lane-extra 已量化残留，但须先定 B1 承载） | 待 Lead 排顺序（与本 lane 无耦合） |
| 6 | **未核** | 真实 host 全链路（当时无 pack 侧调用者）；`meetings.close` 事件名未联调 | 随 #1 一起，由 Lead 落 pack 工具后联调 |

## 8. 命名避坑自证（本仓踩过的「静默遮蔽」）

Lead 提醒：同一工厂里的 `const xxx = …` 会遮蔽同名服务方法。本模块为此做了两件事：
1. `createMeetingVerdict` 内返回的三个名字（`aggregateVerdicts`/`rulePropositionProbability`/`status`）与局部 helper（`aggregateVerdictsThrough`/`ruleThrough`/`say`/`emitRuled`/`atOf`）**没有同名**（`:328-416`，已 grep 自证）；导出面在 `:413` 一次性给出。
2. 测试 ⑥ 直接断言导出面（`typeof mod.aggregateVerdicts === 'function'` 等），所以「被遮蔽成 undefined」会红，而不是静默。

## 9. Lead 裁决落地后的形状（给下一位读代码的人）

- **服务身份**：`registry.register('vmu.meetingverdict', …)`（`kernel/index.js:1809`）+ `SURFACES` 行 ⇒ pack 可以用 `requires: ['vmu.meetingverdict']` 声明它；内核对象上有 `get meetingverdict()`（`:2013`）。
- **`from` = 会议主席的 member id**，由调用方显式传入。所以 Lead 要落的 `vibe_v5_verdict_final` 必须做三件事：① 解析出主席（它已经解析过，别再造一个身份）；② 把主席 id 作为 `from` 传入；③ 把返回的 `notice` 交给 `vmu.mailbox` 的 `send`。**点不出主席 ⇒ 具名拒**（本模块的 `from` 非空字符串校验就是这条拒法的落点）。
- **不做自动聚合**：`meeting/verdict-ruled` 是**通知型**钩子（`failure:'open'`、不可 block），不是「会议关了就算裁定」的触发器。何时结束辩论由主席/工具显式发起 —— 否则就是「拿恰好躺在那里的裁决造一个没有授权的机构决定」。
- **设置键**：零。若将来要可调，键名 `vmu.meetings.verdictPrecision`、默认 6、消费者是本模块 —— 现在**不加**（没有第二个消费者）。
