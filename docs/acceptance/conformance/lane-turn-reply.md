# LANE turn-reply —成员回合改为「工具汇报」，围栏 JSON 降为兼容通道

> 任务：把「成员回合必须用一段围栏 JSON 汇报」改成「用工具汇报」，JSON 字节兼容地留在原地。**只动机制与测试，不动任何提示词文本。**
> 完成日期：2026-10-23 ／ 车道：turn-reply ／ 写域外文件一律未动。

## 0. 一句话

成员今天可以在**自己的回合里直接调** `vibe_vmu_turn { op:"reply", report:{ … } }`，内核把这份结构化汇报记进**当前那个打开的回合**，`op:"step"` 回合结束时就把它当回合结果派发、并把 `source:"tool"` 写进回执；围栏 JSON 仍是**逐字节兼容**的回退通道，两边都给同一字段且**值不同**时**具名拒**（`VMU_TURN_REPLY_CONFLICT`），绝不让一个字段有两个真相。

## 1. 改了什么（`file:line`）

### 1.1 内核 `vibe-math-vmu/kernel/turn/index.js`

| 位置 | 改动 |
| --- | --- |
| `:198` | **08号决策**的代码注释：两条通道的四种情形 + `source` 的取值表（下面 §2 是它的散文版） |
| `:208` | `export const REPLY_FIELDS = Object.freeze(FIELDS.concat(RECORDED_FIELDS))` —— 汇报字段表**从 `FIELD_OWNERS` 派生**，不手抄 |
| `:228` | `export function mergeReplyChannels(toolReply = {}, textReply = {})`：值相同 ⇒ 合一；值不同 ⇒ 抛 `VMU_TURN_REPLY_CONFLICT` 并**逐一点名**冲突字段 |
| `:242` | 该抛点本体：`throw refuse('VMU_TURN_REPLY_CONFLICT', …)`，hint 说「同一字段只走一个通道：从工具汇报里删掉它，或从围栏 JSON 里删掉它」 |
| `:663` | `deliverByReturning()` 新增 `seam.consumePending`：工具汇报**回答了** `pendingPrompt` 时把挂起的提示词消费掉，不让它悬空／在下一轮复现 |
| `:785` `:791` | 两个闭包槽：`structuredReport`（**单槽**：一个回合只收一份结构化汇报）、`inFlightTurn`（`assemble()` 之后到交付结束之间那个回合，供 subagent 缝定位） |
| `:961` `:973` `:990` | `openTurnForReport()` ／ `pendingStructuredReport()`（读回）／ `takeStructuredReport()`（消费一次），定位顺序：`inFlightTurn` → `deliver.pending()` |
| `:1005` | `supplyStructuredReply(fields, {forMember})`：字段闸（未知字段模式沿用 `vmu.turn.unknownReplyFieldMode`）、`forMember` 不符即拒、回执含 `accepted:true` + `source:"tool"` + 收下的字段 + `readback` + `rule` |
| `:1013` | 无打开回合 ⇒ `VMU_TURN_NO_PENDING_MEMBER`（hint 同时给 `op:"reply"` 与 `op:"step"` 的 JSON 兼容写法） |
| `:1046` | 同一回合第二次汇报 ⇒ `VMU_TURN_REPLY_CONFLICT`（不静默覆盖） |
| `:1073` | `awaitingStructuredReport()`：只有「有挂起提示词 + 有与之匹配的汇报」才为真；`deliver.awaiting() === false`（文本已由调用方 supply 过）时为假，避免抢跑 |
| `:1162` | `parse()` 的**无通道**判定重写：`VMU_TURN_NO_FENCE` 的 message 改为「本回合既没有工具汇报、也没有可解析的围栏 JSON」，hint **同时**给出 `vibe_vmu_turn { op:"reply", report:{…} }` 与围栏 JSON 的兼容写法 |
| `:1410` | `dispatchReply({turn, parsed, attributedTo, rawText})`：原 `runFrom` 的派发后半段整体搬出，`bus.emit('turn/reply-parsed', {…, source})` 带上通道来源 |
| `:1488` | `replyFromChannels(raw, member)`：**入口判定**——先取结构化汇报；没有 ⇒ 原 `parse()` 路径（`source:"text"`，行为与原实现完全一致）；有 ⇒ 再试 `parse(raw)`，成功则 `mergeReplyChannels`（`source:"tool+text"`），`VMU_TURN_BAD_JSON` 照抛，其余解析失败视为「没有文本汇报」 |
| `:1551` | `completeStructuredReport()`：调用方扮演成员时（`op:"step"` 返回 `awaiting:true` 之后），把已到的工具汇报补成一个**完整回合并派发**；`:1557` 无汇报可补 ⇒ `VMU_TURN_NO_PENDING_MEMBER` |
| `:1712` | `drive` 前置：有待补的汇报 ⇒ 先补这一回合，作为 `completed` 返回（**不计入 `roundsRun`**） |
| `:1767` | `stepFailure(e)` 抽成 helper（栈裁剪 + `hint` + 回复诊断，与改前一致） |
| `:1789` | `step` 前置守卫：有待补的汇报 ⇒ 补完即返回 `receipt:{…, source:"tool", completed:true}`，**不再新开一轮** |
| `:1874-1876` | 对外动词：`supplyStructuredReply` ／ `completeStructuredReply` ／ `structuredReply`（读回） |
| step / drive 回执 | 收据带 `source`（`step` 成功回执与 `drive` 的每条 `receipts.push`）——**否则「用了哪条通道」在回执里读不到** |

### 1.2 工具面 `vibe-math-vmu/tools/turn.js`

- `:9` `import { FIELD_OWNERS, REPLY_FIELDS } from '../kernel/turn/index.js'`（内核 `kernel/turn/index.js` **零 import**，不成环）；
- `:11` `REPORT_FIELDS_DOC`：参数描述里的字段清单**由 `REPLY_FIELDS` + `FIELD_OWNERS` 派生**（`say→meetings.speak；…`，书账字段标「书账」），不手写；
- `:87` `op === 'reply'` 分支：没有该动词 ⇒ `VMU_ENGINE_UNAVAILABLE`；**一次调用里同时给 `report` 与非空 `reply`** ⇒ `VMU_INVALID_ARGUMENT`（一次调用只许一个通道）；`report` 允许 JSON 字符串；空／非对象即拒；内核抛的拒绝**原码原话**转成 `refused(code,message,hint)`；
- `:221` 成员调用者白名单从 `op === 'status'` 扩为 `op === 'status' || op === 'reply'`（成员**可以**汇报，但仍不能跑 `step`/`drive`）。成员这条**不走串行队列**（直接在成员会话里同步执行）——注释记录了理由：串行化会让成员调用在等自己回合时死锁（实测 175.7s）并绕过角色裁窄；
- `:257` 发布参数 `report`（`type:'object'`，单对象容器）。**逐字段的 JSON `type` 故意不声明**：字段值形状各异，硬编一个 `type` 就是**凭空发明声明**，而宿主侧 `toHostParameters` 的 `additionalProperties:false` + 供应商对非法 schema 的整单拒绝（`type: null` ⇒ 静默零 token 回合）意味着猜错比不猜更贵；字段闸留给内核（权威表在 `FIELD_OWNERS`）。

### 1.3 文档 `vibe-math-vmu/docs/03-interface-contract.md` §8（成对登记）

| 位置 | 行 |
| --- | --- |
| `:590` | `VMU_TURN_NO_FENCE` 行**改写**：触发条件变成「既没有工具汇报、也没有可解析的 json 围栏」，并写明首选工具汇报、围栏 JSON 是兼容通道、**字节不变** |
| `:591` | `VMU_TURN_REPLY_CONFLICT`（语义 + 走法） |
| `:592` | `VMU_TURN_NO_PENDING_MEMBER`（语义 + 走法） |
| `:1557` | `VMU_TURN_NO_PENDING_MEMBER` 实现状态行（位置**只写** `kernel/turn/index.js`：`tools/turn.js` 只**转发**该码，字符串不在那里；`audit-code-status` 的 `LOCATION-DOES-NOT-CONTAIN-THE-CODE` 先把这个假位置抓住了，备注里如实写明） |
| `:1559` | `VMU_TURN_REPLY_CONFLICT` 实现状态行 |

### 1.4 测试

- **新增** `tests/vmu-turn-reply-tool.test.mjs`（32 条断言，见 §3）；
- `tests/vmu-turn.test.mjs` **未改**（191/0 保持；它断言 `VMU_TURN_NO_FENCE` 只看码、不看文案，所以文案改写不需要补登记）。

### 1.5 登记：本次**不需要** `package.json#files` / `installer.js` PRESETS

本次没有新增**运行文件**（改的是既有的 `kernel/turn/index.js`、`tools/turn.js`），所以两处清单都没有改动；新增的只有测试文件（不进安装清单）。`git status` 里 `package.json` / `installer.js` 的 `M` 是**别的车道**的改动，与本车道无关。

## 2. 08号决策：为什么是「合并不冲突、冲突具名拒」

规则（代码 `:198`，实现在 `:228` / `:1488`）：

| 情形 | 结果 | `source` |
| --- | --- | --- |
| 只有工具汇报 | 用它 | `"tool"` |
| 只有围栏 JSON | 用它（**与原实现同一条代码路径**） | `"text"` |
| 两边都有、无同名字段或值相同 | 合并（相同值不产生冲突） | `"tool+text"` |
| 两边都有、同一字段**值不同** | **派发前**抛 `VMU_TURN_REPLY_CONFLICT`，点名每个冲突字段 | — |
| 都没有 | `VMU_TURN_NO_FENCE`（message/hint 两条通道都写） | — |
| 同一回合第二次 `op:"reply"` | `VMU_TURN_REPLY_CONFLICT` | — |

为什么不是「工具静默覆盖文本」：那等于**悄悄丢掉成员说过的话**，而回执还会是绿的——正是本仓「假绿比红更危险」要防的形状。为什么不是「两边都有就一律拒」：同一值合并是真实且常见的（成员先用工具说 `say`，又在文本里补一句 `input`），一律拒会把合法汇报变成噪声。为什么 `source` 必须出现在回执／`step` 收据／`bus` 事件里：诚实纪律要求「设了值 ≠ 生效了」，读回必须能回答**这份汇总是从哪条通道来的**——否则合并之后没人分得清是工具收的还是文本收的。为什么「一次调用只能一个通道」：同一次调用里既给 `report` 又给 `reply`，两个真相在**调用内部**就已经产生了，那时再判冲突不如当场拒。

## 3. 读数（真实输出）

```
$ node --check vibe-math-vmu/kernel/turn/index.js && node --check vibe-math-vmu/tools/turn.js && node --check tests/vmu-turn-reply-tool.test.mjs
check OK: vibe-math-vmu/kernel/turn/index.js
check OK: vibe-math-vmu/tools/turn.js
check OK: tests/vmu-turn-reply-tool.test.mjs

$ node tests/vmu-turn.test.mjs
=== VMU TURN: 191 passed, 0 failed ===

$ node tests/vmu-turn-reply-tool.test.mjs
=== VMU TURN REPLY TOOL: 32 passed, 0 failed ===

$ node tests/audit-vmu-docs.test.mjs
=== VMU DOCS AUDIT: 103 passed, 0 failed ===
```

顺带跑过的相邻门禁（都为绿）：

```
node tests/audit-code-status.test.mjs   ⇒ === VMU CODE STATUS: 23 passed, 0 failed ===
node tests/vmu-v3-planner.test.mjs      ⇒ === VMU V3 PLANNER: 288 passed, 0 failed ===
node tests/vmu-v5r-tools.test.mjs       ⇒ === VMU V5R TOOLS: 339 passed, 0 failed ===
node tests/audit-kernel-claims.mjs      ⇒ === KERNEL CLAIMS: 39 passed, 0 failed ===
node scripts/check-docs.mjs             ⇒ DOC LINT: PASS
```

### 3.1 新套件 32 条断言覆盖了什么

| 要求 | 断言（真实行为，不是看回执） |
| --- | --- |
| ① 只用工具汇报 | `accepted:true` + `source:"tool"`；**读回** `structuredReply()` 的 member/turn；`op:"step"` 收 `completed:true`；`say` **真的**落到了 `meetings.speak`（fake face 收到 payload）；`input` 同时落到 `records.put`；收据 `fields` 两个字段都在；单槽被消费（第二次读回为 `null`）；`status().solvedThisRound.m1 === true`（书账字段也真的生效了） |
| ② 只用 JSON（回归） | `source:"text"`；字段落到 face；收据**没有** `completed` 键（与旧形状一致） |
| ③ 两者不冲突 | `source:"tool+text"`、`textOnlyFields:['input']`；**两条效果都在 face 上**（顺序不断言：派发按合并后对象的键序，不按通道序）；`mergeReplyChannels({say:'a'},{say:'a'})` 相同值合并不拒 |
| ④ 冲突 | 抛 `VMU_TURN_REPLY_CONFLICT`、message 点名 `say`、`spoken.length === 0`（派发前拒，半个回合都没落地） |
| ⑤ 都没有 | `VMU_TURN_NO_FENCE`；message 同时含「工具汇报」「围栏 JSON」；hint 同时含 `op:"reply"` 与 json |
| ⑥ 非成员回合 | 内核层与工具层都 `VMU_TURN_NO_PENDING_MEMBER`；工具回执的 hint 仍是内核原话（`awaiting:true` + `fenced-json`）；成员**可以** `op:"reply"`，但成员 `op:"step"` 仍是 `VMU_NOT_PERMITTED`（不能借机跑引擎） |
| ⑦ 有牙自证 | 同一组四个行为探针（accepts / completes / merges / faceAccepts）在真内核 vs 用 `Proxy` 摘掉三个动词的「拔牙内核」上各跑一遍 ⇒ **4 条翻红**（断言要求 ≥3）。**拔牙方法写在测试文件顶部注释**：① `tools/turn.js` 删掉 `op === 'reply'` 分支与 `memberAllowed` 里的 `|| op === 'reply'`；② `kernel/turn/index.js` 删掉 `replyFromChannels` 里的 `takeStructuredReport` 分支与 `supplyStructuredReply`/`completeStructuredReply` 两个暴露动词。**仓库里不存在拔牙后的状态**（探针只在内存里用 Proxy 拔，文件未改）。 |

## 4. 残余风险（点名，不在本车道修）

1. **提示词仍教围栏 JSON**（`vibe-math-vmu/packs/**` 本车道不许改）。机制在位，但成员的自发行为由提示词决定 ⇒ 在提示词换代之前，工具通道的实际使用率是 0，JSON 仍是事实上的主通道。这是**下一步**的事：提示词里要把 `op:"reply"` 写成首选、围栏 JSON 写成兼容。
2. **`docs/03` 的工具表 `:168` 仍写 `op=step|drive|status`，参数表里没有 `report`**。该行不在本车道的写域（本车道只登记 §8 两行）⇒ 需要一行补丁：`op` 里加 `reply`、参数里加 `report`。不加的话，读文档的人看不到这条通道。
3. **「一次调用一通道」**：想同时用两条通道的成员必须分两次调用（第二次调用发生在同一回合内、且要等 `step` 尚未结束——调用方扮演模式下这在 `awaiting` 之后）。这是刻意的（见 §2），但**对调用方的编排是个新约束**。
4. **单槽**：一个回合只收一份工具汇报；成员若先报 `say` 再报 `input`，第二次会被 `VMU_TURN_REPLY_CONFLICT` 拒。当前判定是对的（一份汇报 = 一个真相），但**成员的直觉可能是「多次追加」**——提示词换代时要写明「一次报完」。
5. **调用方扮演模式的补完依赖接缝**：`step` 补完汇报需要 `deliver.pending()`；`deliverByReturning()` 已补 `consumePending`，但**只有带这两个方法的接缝**才能走完这条路。没有 `pending` 的接缝（例如某些宿主实现）只能走「交付过程中」那条（`inFlightTurn`），也就是说**工具汇报必须在回合进行中到达**。
6. **无真机 SLV**：以上全部读数来自本地夹具（fake faces / fake deliver），一次真机跑都没有（本车道不在真机轮次里）。接缝形状差异（真 subagent 的交付路径、真宿主对 `report` 参数的接受度）**没有被验证过**——这是本条改动最该被下一轮真机盯住的地方。
7. **`node scripts/regen-all.mjs --check` 红 1 项（14/16）**：`FAIL planned-code registry (docs/03-§8) :: run: node scripts/generate-planned-codes.mjs --write`。已核实**不是本车道单独造成**：HEAD 上同一检查是绿的（`hand-registered=432`），工作区因多个车道都往 §8 手写表加了行而变成 `441`，生成器拥有的 §8.1 状态块因此整体过期。按硬约束**没有**执行 `--write`（Lead 统一做）。临时副本上模拟 `--write` 只改生成器拥有的块／状态区，不动手写行。

## 5. 一句话回答

**去掉 JSON 后，成员汇报的完整路径**：成员在自己的回合里（或在调用方扮演模式下 `op:"step"` 返回 `awaiting:true` 之后）调 `vibe_vmu_turn { op:"reply", report:{ say, input, … } }` → 工具面 `tools/turn.js:87` 把 `report` 交给内核 `supplyStructuredReply`（`:1005`）→ 内核按「`inFlightTurn` → `deliver.pending()`」定位**当前那个打开的成员回合**，把汇报记进**单槽**并把 `accepted:true` + 收下的字段 + `rule` 作为回执**立刻返回给调用方（成员自己／扮演成员的调用会话）**→ 回合结束时 `replyFromChannels`（`:1488`）取这份汇报（若同时有文本 JSON 就合并、冲突就点名拒）→ `dispatchReply`（`:1410`）派发到各面（`meetings.speak`、`records.put`…）→ `op:"step"` 的收据回到**根会话**，带 `fields`、`executed`、`source:"tool"`（调用方扮演模式下则是 `completed:true` 的收据）；围栏 JSON 仍然可用，且与原实现逐字节同一条代码路径。
