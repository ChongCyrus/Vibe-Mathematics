# Phase 6 · v3 复刻 · P0 施工清单（干净版）

> **本文件的唯一用途**：给"把 v3 复刻成 vmu 的一个 pack"提供**可施工**的 P0 清单。
> **不重述盘点**（全盘见 `D:\_tmp\v3-mechanisms-inventory.md`，只读审计产物），**不引用**被编码事故毁掉的
> `docs/acceptance/phase6-v3-replication-blueprint.md`（不可读即不依赖；本文件所有 v3 侧证据都从 `vibe-math-v3/` 源码重新取）。
> 铁律：写文件只用 write/edit 工具；读中文只用 grep/read；临时件在 `D:\_tmp`；不跑 git；不碰 `token.txt`。

## §0 现状前置核对（决定 §2 的排序；每条都回代码核过）

| 前置 | 状态 | 证据（文件:行） |
|---|---|---|
| **K10 `bus.rewriteOf`（`turn/reply-parsed` 可改写回执）** | **已落** | `vibe-math-vmu/kernel/bus.js:752-773`（`rewriteOf`；`:753` 无改写返回 null；`:755,760-764` 强制 registry 的 `rewritable`；`:766-771` 只接受 string 或 `{reply}`）；消费者 `kernel/turn/index.js:1012-1021`（`parsed.reply = rewritten` 后才 `apply`） |
| **K1 `vmu.schedule.autoArm`（周期自驱）** | **内核已落，装配仍缺 timer** | 键 `settings/schema.js:551`（def **false**）；构造期读取并 arm `kernel/index.js:878-887`；实现 `kernel/scheduler.js:547-581`（无接缝 ⇒ `mode:'tick-only'`,`armed:false`，`:571-577`）；状态自曝 `:632`。**但装配建内核时没有传 `timer`**：`vibe-math-vmu.js:469` 的 `createKernel({...})` 无 `timer` 键（全文件 grep `timer` 只有 `:679` 一句注释）⇒ 今天即使 `autoArm=true` 也只能拿到 tick-only | ★★ **已过期（轮 9 更正）**：★ 装配现在**已经**传 `timer`（`vibe-math-vmu.js` 的 K1 COMPLETION 段，★ **仅当 `vmu.schedule.autoArm === true`**）⇒ ★ **P0-1 的"装配 5 行"已完成**，★ 施工从 `settings/defaults.json` ＋ `tick.js` 起步 ✓
| **K2 `vmu.turn` 进 M2 服务目录 ＋ 重入具名拒** | **已落** | 目录项 `kernel/index.js:1443-1452`（`'vmu.turn': turn`，注释说明为何现在安全）；重入守卫 `kernel/turn/index.js:1041-1064`（`:1055` `turnInFlight`；`:1058` `VMU_TURN_REENTRANT`） |
| **K1 的触发器种子读点在建内核之前** | **必须走 `settings/defaults.json`** | 种子在建构造期编译：`kernel/scheduler.js:104`（读 `vmu.schedule.triggers`）＋`:656-669`（逐条 `every/once`，坏种子计数＋`schedule/seed-rejected`）；`autoArm` 也在构造期读：`kernel/index.js:882`。而 pack manifest 的 `settings` 是**装载后**才 apply（`kernel/pack.js:428-470`），所以只有 `packs/<id>/settings/defaults.json` 会在构造前折入（`vibe-math-vmu.js:279-391`，`:357` 按目录名读、`:391` `settingsWithPackDefaults`） |
| **K2 带来的新约束** | **不能从 turn 钩子里同步再开一个 turn** | `VMU_TURN_REENTRANT`（`kernel/turn/index.js:1058`）⇒ 规划器的"派发"必须由**调度 tick**（总线自定义主题）驱动，不能在 `turn/reply-parsed` 处理器里同步 `run()` |
| **v3 的 phase 词汇不能由 pack 新增** | 用内核既有 7 个 | `kernel/turn/index.js:156`（`PHASES`）；pack 的额外相位只来自装配的硬编码表 `vibe-math-vmu.js:464-476`（`PACK_RUNTIME`）⇒ 想加 v3 专属相位是 **⑤ 装配改动**，P0 不采用 |
| **文档自相矛盾（需另行修，不在本文件改）** | `docs/10-packs.md:320` 仍说 v3-core 声明了 `solverMaxRounds/planningHorizon/promoteValueThreshold`，而同一文件 `:148-154` 说这三个"移除声明＋具名登记为扩展点" | 复刻时以 `:148-154` 为准；`:320` 属陈旧行 |

派生命令（数字不手抄）：

```bash
node -e "const s=require('fs').readFileSync('vibe-math-vmu/packs/v3-core/index.js','utf8');console.log(s.split('\n').length)"
grep -n "vmu.schedule.autoArm\|vmu.schedule.triggers\|vmu.records.requireSettledRecords\|vmu.records.allowedKinds" vibe-math-vmu/settings/schema.js
node -e "const H=require('fs').readFileSync('vibe-math-v3/vibe-math-v3.js','utf8');console.log((H.match(/registerTool\('([a-z_]+)'/g)||[]).length)"
```

## §1 P0 十条施工卡

> 约定：落点都是 **`vibe-math-vmu/` 相对路径**（内核/装配/包）；v3 证据都是 `vibe-math-v3/vibe-math-v3.js:<行>`。
> 设置键"新增"一律需先登记进 `settings/schema.js`（见 §2 第 0 步），否则 `vibe_vmu_set` 会以"未声明键"具名拒（`docs/10-packs.md:139-146`）。

### P0-1 周期驱动（tick）——缺了它 v3 的调度器不存在

| 字段 | 内容 |
|---|---|
| 目标 | 让一个**声明的**周期触发器真的按墙钟推进调度循环（v3 的每秒扫描） |
| 落点 | ①装配注入 timer：`vibe-math-vmu.js`（`createKernel({...})` 调用处，当前 `:469`）；②`packs/v3/settings/defaults.json`（种子＋autoArm＋timeSource＋triggerVia）；③`packs/v3/middleware/tick.js`（tick 体） |
| v3 侧证据 | `vibe-math-v3.js:5565-5596`（`everyMs`＋`ctx.effect` 每 1000ms 扫会话）、`:5444`（`tickDue`）、`:2018-2042`（`tick()` 九步）、`:400`（`tickIntervalMs:2000` 默认） |
| 机制 | **输入**：注入的 timer 到期（或 `tick()` 被调用）→ **处理**：`scheduler.tick()` 把到期种子 emit 成总线主题 `v3/tick`；pack 模块在处理器里按九步顺序跑（依赖同步→收口→优先级→晋升→验证补派→执行计划队列→规划→方法整理→汇报），每步只读 records/tasks、只写 records；**输出**：`vmu.records` 的 `plans`/`journal` 轨新增记录，`vmu.schedule` 的 `status().autoRearms` 递增 |
| 设置键 | 复用：`vmu.schedule.autoArm`(false→**pack 默认 true**)、`vmu.schedule.triggers`(def `[]`→种子 `{kind:'every',intervalMs:2000,what:'v3/tick',payload:{phase:'tick'},by:'settings'}`)、`vmu.schedule.timeSource`(def `tick-only`→`host-timer`)、`vmu.schedule.triggerVia`(def `none`→`middleware`)、`vmu.schedule.minIntervalMs`(0)、`vmu.schedule.maxPending`(8)、`vmu.schedule.actionsAllowed`(默认已含 `emit-hook`)。**新增**：`vmu.v3.tickIntervalMs` def **2000**（pack 自己读，用于 `tickDue` 判定） |
| **可写断言** | `ok('K1 装配缺口已补', kernel.scheduler.status().timerShape === 'setTimeout/clearTimeout')`（公开读面：`kernel/index.js:1712` 的 `get scheduler()`；`kernel.status().seams.scheduleAutoArm/timerShape` 亦可读，`:2376-2386`）；`ok('自驱已武装', kernel.scheduler.status().autoArm === true)`；`ok('tick 主题真的到达', calls === 1)`——构造 `settings['vmu.schedule.autoArm']=true`＋`timer={setTimeout,clearTimeout}`（`scheduler.js:176` 认这种形状）＋一条 2000ms 的 `v3/tick` 种子，手工触发一次假 timer 回调，期望 tick 模块被调用 **1** 次；反向：**不注入 timer** 时 `status().timerShape === null && status().autoArm === false`（不许假装） |
| 依赖 | 无 P0 前置；但需 §2 第 0 步（键登记）与装配 5 行改动（⑤）。P0-2/3/4/5/8 全依赖它 |

### P0-2 规划-调度闭环（planner）——缺了它 v3 只是普通流水线

| 字段 | 内容 |
|---|---|
| 目标 | tick 时有可推进工作 → 组简报 → 跑一次 planner 回合 → 校验计划 → 入队执行 |
| 落点 | `packs/v3/middleware/planner.js`（简报/调用/校验/执行）＋`packs/v3/prompts/sections.json`（planner 段＋role 绑定） |
| v3 侧证据 | `:2274-2287`（`hasSchedulableWork`）、`:2288-2315`（`buildBrief`）、`:2316-2335`（`maybePlan`，含冷却与在途判断）、`:2336-2351`（`callPlanner`）、`:2395-2454`（`validatePlan`）、`:2466-2517`（`executePlanQueue/executePlanAction`）、`:2456-2465`（`applyPlanToProblemCards`）、`:1888-1904`（`plannerPrompt`） |
| 机制 | **输入**：`v3/tick` 事件 → **处理**：读 `records.list({track:'problems'})` 算"可推进工作"；无工作/冷却中/planner 在飞则返回；否则 `services.get('vmu.turn').run({member:'planner', phase:'normal'})`（K2 已开，`kernel/index.js:1452`），planner 的回执在 `turn/reply-parsed` 处理器里被**归一化**（K10：返回 `{rewriteResult:{reply:JSON.stringify(normalized)}}`）并落 `plans` 轨；下一 tick 校验（6 动作白名单／horizon 截断／去重／逐角色硬校验）→按剩余容量逐条执行（spawn→`vmu.turn.run` 或 `vmu.members.wake`；promote→records＋tasks；interrupt→`services.get('vmu.turn').interrupt({ targetSessionId, authority })`（`kernel/turn/index.js:440-449`：authority 必须是 `{kind:'ancestor',agent}` 或 `{kind:'user',parentSessionId}`）；**输出**：`plans` 轨一条 `{summary, raw, validated, outcomes}` 记录；`problems` 轨对应卡的 `- 计划:` 段被更新 |
| 设置键 | 复用：`vmu.limits.maxLiveMembers`(4, v3-core 已声明)、`vmu.records.tracks`。**新增**：`vmu.v3.planningHorizon` **3**、`vmu.v3.plannerEnabled` **true**、`vmu.v3.planMinIntervalMs` **30000**、`vmu.v3.plannerMaxFails` **3** |
| **可写断言** | `ok('无工作不规划', turns === 0)`——problems 轨为空时触发 1 次 tick；`ok('有工作则规划', turns === 1 && turns[0].member === 'planner')`——problems 轨 1 条 `状态: 求解中` 且无在飞时触发 1 次 tick；`ok('horizon 截断', plan.validated.length === 3)`——planner 回执给 5 个合法动作且 `planningHorizon=3`；`ok('非法动作被剔且计数', plan.rejected === 2)`——回执给 2 个非法动作；`ok('冷却生效', turnsAfter2Ticks === 1)`——两次 tick 间隔 < `planMinIntervalMs` |
| 依赖 | P0-1（tick）、P0-9（problems/plans 轨）；K2 已落（否则无派发动词） |

### P0-3 规划学习闭环——缺了它 planner 每轮都从零开始

| 字段 | 内容 |
|---|---|
| 目标 | 上一次计划的逐条执行结果进入下一次简报 |
| 落点 | `packs/v3/middleware/planner.js`（同一模块内的 `buildBrief` 与 `recordOutcome`） |
| v3 侧证据 | `:2375-2376`（写 `Logs/Plans/<planId>.json`）、`:2471,2474`（逐条 outcome）、`:2312`（简报带 `last_plan`）、`:1433`（`State/last_plan.json`） |
| 机制 | **输入**：每次行动执行完（成功/失败+错误）→ **处理**：把 `{action,role,target,ok,error}` 追加进该 plan 记录的 `outcomes` 数组（`records.supersede({id, reason:'outcome', ...})` 或重新 `put` 同 track 新记录）；下一次组简报时读 `records.list({track:'plans'})` 取**最近一条**的 `outcomes`；**输出**：简报 JSON 的 `last_plan.outcomes` 长度＝上次动作数 |
| 设置键 | 复用 `vmu.records.history.storeMode`（def `diff`；pack 里建议置 `full` 以便回读快照） |
| **可写断言** | `ok('学习闭环', brief2.last_plan.outcomes.length === plan1.validated.length)`——第 1 次 tick 产出并执行 3 个动作（全部成功/失败之一），第 2 次 tick 的简报里 `last_plan.outcomes.length === 3` 且每项带 `ok` 布尔 |
| 依赖 | P0-2 |

### P0-4 方法库（卡/应用/改进）——v3 的第二根支柱

| 字段 | 内容 |
|---|---|
| 目标 | 方法卡可沉淀、可记录应用、可迭代改进（v1→v2），且**应用计数只记真实使用** |
| 落点 | `packs/v3/middleware/methods.js`；轨名在 `PACK.tracks` 声明（`methods`），kind 在 `PACK.settings['vmu.records.allowedKinds']` 声明 |
| v3 侧证据 | `:1018-1051`（`composeMethodMd`：9 锚点＋应用记录＋改进历史）、`:6241-6264`（`parseMethodMd`）、`:2789-2815`（`consumeMethodFeedback`：仅 `qid/dirId` 有值才追加应用）、`:2891-2901`（improvements `v(n+1)`）、`:2838-2860`（keeper 摘要）、`:1905-1919`（keeper 提示词） |
| 机制 | **输入**：`turn/reply-parsed` 的 `reply.methods_used` / `reply.new_inventions`，或方法整理回合的回执 → **处理**：`records.put({track:'methods', kind:'method', title, body})` 建卡；应用：`records.supersede({id, reason:'应用 N', ...})` 追加 `### 应用 N｜<时间>｜问题 X 方向 d` 段（**无 qid/dirId 时不写**）；改进：`supersede` 追加 `### v(n+1)（原因）`；**输出**：`records.history({id}).versions` 长度递增，`records.get(id).body` 含新段且旧段原样 |
| 设置键 | 复用：`vmu.records.allowedKinds`（def 8 种→追加 `method`/`problem`/`proposition`/`verified`/`plan`/`invention`）、`vmu.records.tracks`、`vmu.records.requireSettledRecords`（def **true**→pack 置 **false**，否则未定稿卡被 `VMU_STATE` 拒：`kernel/records.js:467-470`）、`vmu.records.bodyCapBytes`（def 32768→建议 65536）、`vmu.records.head.maxItems`（def 200→建议 2000）。**新增**：`vmu.v3.methodKeepEvery` **5**、`vmu.v3.methodKeepIntervalMs` **0**、`vmu.v3.methodAutoPromote` **false** |
| **可写断言** | `ok('应用记录只在有上下文时追加', before === after)`——`methods_used:[{id:'m-1'}]` 且 ctx 无 qid/dirId 时 body 不变；`ok('应用记录追加', /### 应用 1｜.*问题 q-1 方向 d1/.test(body))`——ctx 有 qid/dirId 时；`ok('改进历史版本化', h.versions.length === 2 && h.storeMode === 'full')`——先 `put` 再 `supersede({reason:'v2 改进'})`；`ok('未知方法不丢', records.list({track:'inventions'}).length === 1)`——`methods_used` 引用未知 id |
| 依赖 | P0-9（数据面） |

### P0-5 发明上报闭环——缺了它"发明"只停留在回执里

| 字段 | 内容 |
|---|---|
| 目标 | solver/explorer 的新发明必被登记，且 Method Keeper 无产出时也不滞留 |
| 落点 | `packs/v3/middleware/methods.js`（与 P0-4 同模块，独立钩子函数） |
| v3 侧证据 | `:2816-2822`（`new_inventions` 入 pending）、`:470`（`methodLog`）、`:2824-2832`（`methodKeepDue`：interval 或 pending≥every）、`:2861-2927`（`handleMethodKeeper`，含 `:2908-2922` 兜底建卡与 `:2922` 清 pending） |
| 机制 | **输入**：回执 `new_inventions[]` → **处理**：`records.put({track:'inventions', kind:'invention', body})` 入队；到期/攒够 N 条 → 起 method-keeper 回合；keeper 有产出（新建/改进）或**无产出兜底**都清队；**输出**：inventions 轨为空（或每条带 `consumed:true`），methods 轨出现草稿卡 |
| 设置键 | 复用 `vmu.v3.methodKeepEvery`(5)/`methodKeepIntervalMs`(0)（P0-4 已登记） |
| **可写断言** | `ok('上报入队', records.list({track:'inventions'}).length === 1)`；`ok('无产出不滞留', records.list({track:'inventions'}).length === 0 && records.list({track:'methods'}).length === 1)`——keeper 回执为空对象时仍建 1 张草稿卡且清队 |
| 依赖 | P0-4（同模块/同轨） |

### P0-6 软规范三卡＋Verified 分裂——缺了它"绝对可信"就不成立

| 字段 | 内容 |
|---|---|
| 目标 | 只有 Verified 轨的定论卡被当事实；其余卡的自由正文在回写后**逐字保留** |
| 落点 | `packs/v3/middleware/dataplane.js`（正文段保留＋Verified 分区）；轨：`problems/propos/methods/journal/verified` |
| v3 侧证据 | `:1205-1259`（`loadKnowledgeBase` 锚点扫描）、`:1060-1080`（`composeVerifiedMd`）、`:2112-2131`（`writeVerifiedCardIfChanged`：内容不变不重写）、`:893-903`（`withExtraSections`：未接管段原样保留）、`:6159-6173`（转义/条目正则） |
| 机制 | **输入**：模块更新某卡状态（锚点/概率）→ **处理**：只改自己管理的头部锚点段＋已知段，**未识别段追加保留**；定论时把 card 复制进 `verified` 轨（body 含结论/时间/来源/全部 prob=1 全文）；**输出**：原卡 body 的自定义段仍在；`verified` 轨只含 1/0 卡 |
| 设置键 | 复用 `vmu.records.tracks`／`allowedKinds`／`requireSettledRecords`(false)／`bodyCapBytes` |
| **可写断言** | `ok('自定义段不被抹', get(id).body.includes('## 自定义小节'))`——先写含该段的卡，再让模块改它的 `- 状态:`；`ok('Verified 只收定论', records.list({track:'verified'}).every(r => /- 概率: (1|0)/.test(r.body)))`；`ok('提示词只把 Verified 当事实', /绝对可信/.test(promptText) && /经验参考|参考/.test(promptText))`（可信分层段必须同时出现"绝对可信"与"其余为经验参考"两侧，缺一侧即失败；段文本来自 `packs/v3/prompts/sections.json`） |
| 依赖 | P0-9 |

### P0-7 验证闭环（≥2 票／辩论／裁决／回写）

| 字段 | 内容 |
|---|---|
| 目标 | 单票绝不定论；多轮辩论后有具名裁决，并把结果回写到对象 |
| 落点 | `packs/v3/middleware/verify.js`；**双写**：法定人数交给 `vmu.ballotbox`（`open/cast/close`，不足即具名拒 `VMU_BALLOT_MIN_VOTES_NOT_MET`，`kernel/ballotbox.js:328-336`），连续 `Result∈[0,1]` 落 `votes` 轨由 pack 聚合（`kernel/ballot.js:38` 的 `estimate` 票种属 general ballot，未发布为独立服务，只在 meetings 内构造：`kernel/index.js:1752`） |
| v3 侧证据 | `:2204-2230`（候选）、`:2232-2256`（建任务/补派）、`:4149-4170`（票数下限）、`:4199-4229`（辩论）、`:4244-4268`（`finalVerdict`：近共识→forced 均值→flat 0.5）、`:4269-4368`（`settleVerdict` 四类回写） |
| 机制 | **输入**：tick 时发现未验候选 → **处理**：①每张票**双写**——`ballotbox.cast({boxId, member, option:'for'\|'against'\|'abstain'})` 让内核强制法定人数，同时 `records.put({track:'votes', kind:'vote', body:'- target: …\n- verifier: …\n- result: 0.9\n- reason: …'})` 存连续值与理由；②`close` 前若 `floorBase < floor`，内核**具名拒**（`VMU_BALLOT_MIN_VOTES_NOT_MET`，且明确"不是未通过，是未成立"），pack 必须把它转成"本轮不定论"而**不是**否决策；③凑齐后按 `debateMaxRounds` 决定是否再辩论一轮（新回合继续双写）；④聚合在 pack 纯函数里按 `votes` 轨算（全 1→1／全 0→0／同侧均值≥0.85 取均值／forced 等权均值夹 [0.01,0.99]／flat 0.5）；**输出**：对象卡状态/概率被改写、`verified` 轨新增卡、`journal` 轨新增裁决记录 |
| 设置键 | 复用：`vmu.ballot.minVotes`(3)、`vmu.ballot.minVotesRatio`、`vmu.ballot.abstainAllowed`、`vmu.ballot.abstainCountsForFloor`、`vmu.ballot.method`、`vmu.ballot.tieRule`、`vmu.meetings.verdictMaxRounds`(5)、`vmu.v3.verifierCount`(3, **已在 schema** `settings/schema.js:85`)、`vmu.v3.mode`(auto, `:86`)。**新增**：`vmu.v3.verdictMode` **'forced'**、`vmu.v3.debateMaxRounds` **5** |
| **可写断言** | `ok('法定数不足具名拒且不当否决', r.ok === false && r.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET')`——`minVotes=3`、只 2 票就 `close`；`ok('全票一致', outcome === 'for')`——3 票 `for`；`ok('近共识取均值', Math.abs(agg - 0.9333) < 1e-3)`——`votes` 轨 `0.9,0.9,1.0`（同侧且均值≥0.85）；`ok('forced 夹端点', agg >= 0.01 && agg <= 0.99)`——`0.9,0.8,0.7`；`ok('回写生效', get('p-1').body.includes('- 状态: 已验证·真'))` |
| 依赖 | P0-9（`votes` 轨）；派发依赖 P0-1＋K2。**注**：连续值不经 ballotbox（它只收选项票），聚合权在 pack——这是有意的分层：**法定数由内核强制，概率语义由 pack 持有** |

### P0-8 人工门（manual）——缺了它 v3 的"人说了算"不成立

| 字段 | 内容 |
|---|---|
| 目标 | manual 模式下计划/裁决/晋升**排队不执行**，approve 后才生效，切回 auto 自动放行 |
| 落点 | `packs/v3/middleware/gates.js`；复用 `vmu.human`（`openApproval`/`approvalState`，`kernel/human.js:206-266`）＋`human/gate-pending`（可阻断，`kernel/bus.js:190`） |
| v3 侧证据 | `:2385-2389`（计划门）、`:4230-4242`（裁决门）、`:2943-2950`（晋升门）、`:1940-1963`（`maybeGate/setGate`：单槽 gate＋旧决策结清）、`:4973-4992`（`autoResolvePending`） |
| 机制 | **输入**：tick/裁决/晋升要落地 → **处理**：`mode==='manual'` 时开 `openApproval({subject})` 并把对象记录写 `status:'pending'`，同时用 `human/gate-pending` 让后续同动作被阻断（具名）；人类 approve 后 `status:'queued'` 并由下一 tick 执行；切回 auto 时遍历 pending 逐条放行，**单条失败也落终态**；**输出**：`records` 里对象 `status` 字段与 approvals 一致 |
| 设置键 | 复用 `vmu.v3.mode`(auto, 已声明)、`vmu.human.approvalQueueCap`、`vmu.human.onTimeout`(def hold)、`vmu.human.gatedActions` |
| **可写断言** | `ok('manual 排队', plan.status === 'pending' && executed === 0)`；`ok('approve 后才跑', approve() && nextTick().executed === 1)`；`ok('auto 直接跑', mode('auto') && nextTick().executed === 1)`；`ok('失败也落终态', failedAction.status === 'resolved')` |
| 依赖 | P0-2（计划门）、P0-7（裁决门）；晋升门依赖 P0-4 |

### P0-9 数据面（轨/卡/索引/持久）——所有卡的落盘面

| 字段 | 内容 |
|---|---|
| 目标 | v3 的五类对象有可机读的轨与卡，且有界、可重建、截断有计数 |
| 落点 | `packs/v3/index.js`（`tracks`＋`settings` 声明）＋`packs/v3/middleware/dataplane.js`（锚点解析/回写/索引视图） |
| v3 侧证据 | `:906-1015`（compose/parse 三卡）、`:1205-1214`（`rebuildIndex`）、`:1215-1259`（启动扫描）、`:1086-1093`（路径 helper：`Problems/`、`Propos/<分类>/`、`Methods/`、`Verified/`）、`:2039`（索引 5s 节流） |
| 机制 | **输入**：模块/回合要写卡 → **处理**：`services.get('vmu.records').put({track,kind,title,body})`；读：`get({id,includeBody})`（超 `expandThreshold` 分块，`kernel/records.js:545-562`）；改：`supersede({id,reason})`（`kernel/records.js:602-627`）；列表：`list({track})`（头 9 字段，截断计数 `:594-599`）；**输出**：`records.status()` 的 `tracks/allowedKinds/headFields` 与包声明一致；body 内锚点由模块自解析（**不依赖** `vmu.records.headFields`，该键只允许裁剪可选字段，`kernel/records.js:574-585`） |
| 设置键 | 复用：`vmu.records.tracks`（v3-core 已声明 5 条，v3 需扩到含 `plans`/`inventions`）、`vmu.records.allowedKinds`、`vmu.records.requireSettledRecords`(**false**)、`vmu.records.bodyCapBytes`(65536)、`vmu.records.head.maxItems`(2000)、`vmu.records.truncateMode`、`vmu.records.naming.*` |
| **可写断言** | `ok('轨已声明', kernel.records.status().tracks.includes('plans'))`；`ok('未定稿可写', (await records.put({track:'problems',kind:'problem',body:'- 状态: 求解中'})).ok === true)`（`requireSettledRecords=false`）；`ok('列表计数', list.available === 1 && list.dropped === 0)`；`ok('超限计数', list.dropped > 0 && list.truncated === true)`（`headListAt=1` 时放 2 条）；`ok('正文超限被截断且计数', r.fired.includes('vmu.records.bodyCapBytes') && records.get({id:r.id}).body.length <= 1024)`（`bodyCapBytes=1024` 放 2KB body；**注意 records 是"截断＋计数"，不是拒写**：`kernel/records.js:346-372,486-487`） |
| 依赖 | 无（可与 P0-1 并行）；但排在 P0-2 之前 |

### P0-10 工具面兼容（只保留"模型真的要调"的那几个）

| 字段 | 内容 |
|---|---|
| 目标 | 主代理/人能控制 v3（起停、状态、决策、方法查看），其余内部动作由 pack 模块完成 |
| 落点 | `host.js`（`TOOL_NAMES`＋`toolSpecs` 的 face 表，当前 `:84-138`／`:889-921`）＋`packs/v3/index.js`（若做 ⑥ 的 pack 声明式工具面，则改内核 `kernel/pack.js`） |
| v3 侧证据 | `:5094-5167`、`:5449-5507`（两层注册，36 个名）、`:5996-6035`（`TOOL_DESC`）、`:5372-5399`（`/vibe` 30 子命令） |
| 机制 | **输入**：模型调面 → **处理**：通过 `vmu.turn`／`vmu.tasks`／`vmu.records`／`vmu.human` 执行，回执 JSON；**输出**：面列表与 v3 的高频名对齐 |
| 设置键 | 无新增（工具面不是设置键；是否发布由 pack 的 settings 家族键触发，见 `docs/10-packs.md:122-128`） |
| **可写断言** | `ok('核心面已发布', ['vibe_math_start','vibe_math_status','vibe_math_report','vibe_math_decide','vibe_math_list_agents','vibe_math_plan','vibe_math_method_list','vibe_math_claim_write','vibe_math_release_write','vibe_math_sync_meta'].every(n => names.includes(n)))`；`ok('状态面字段', (await call('vibe_math_status')).ok === true && 'project' in r && 'methods' in r && 'problems' in r)` |
| 依赖 | P0-1…P0-9（面只是薄包装）。**建议**：不逐个复刻 36 个 v3 工具名（35 个 `vibe_math_*`＋`math_computation`；`math_computation` 在 vmu 已有同名注册 `kernel/index.js:1565` 附近）——v3 里多数工具是"当时只有工具这一种 API"，在 vmu 里由模块内部完成；只保留 **10 个**（上列）＋可选 `/vibe` 命令 |

## §2 施工顺序（按现状重排）

**第 0 步（跨卡前置，先做）**：把 P0 需要的设置键登记进 `vibe-math-vmu/settings/schema.js`，并跑派生面：
`schema` 键清单（**P0 直接需要 10 把**：`vmu.v3.tickIntervalMs`(2000)/`planningHorizon`(3)/`plannerEnabled`(true)/`planMinIntervalMs`(30000)/`plannerMaxFails`(3)/`methodKeepEvery`(5)/`methodKeepIntervalMs`(0)/`methodAutoPromote`(false)/`verdictMode`('forced')/`debateMaxRounds`(5)；**P1 再加 8 把**：`solverMaxRounds`(3)/`maxExplorerRetries`(3)/`directionsPerSolver`(1)/`promoteValueThreshold`(0.7)/`priorityAdjust`('none')/`proposPriorityAdjust`('none')/`fileLockTimeoutMs`(60000)/`reportIntervalMs`(0)）→
`node scripts/generate-vmu-settings-table.mjs --write` → `node scripts/update-doc-counts.mjs` → `node scripts/regen-all.mjs --write` → 三条 `--check`（`setup` 表 `--check`、`regen-all.mjs --check`、`node scripts/check-docs.mjs`）。
**理由**：pack 私有键若不进 schema，`vibe_vmu_set` 会具名拒，而"能读不能设"是本仓已裁定不许留的缺陷（`docs/10-packs.md:139-146`）。

依赖图（`A ← B` 读作"B 依赖 A"）：

```
P0-1 (tick 驱动)
  └─ P0-2 (planner)  ← P0-9
       └─ P0-3 (学习闭环)
       └─ P0-8 (人工门)  ← P0-7
P0-9 (数据面) ─┬─ P0-6 (Verified 分裂)
               ├─ P0-4 (方法库) ─ P0-5 (发明上报)
               └─ P0-7 (验证闭环) ← K2(已落)
P0-10 (工具面) ← P0-1..P0-9
```

**建议施工顺序与"第一块"**：
1. **P0-1**（①装配 `createKernel` 加 `timer` 接缝 5 行；②`packs/v3/settings/defaults.json` 写 seeds/autoArm/timeSource/triggerVia；③`middleware/tick.js` 骨架只做"计数＋写一条 `journal` 记录"）——**这是第一块**。理由：它是唯一驱动，后面每张卡的验收都要"触发一次 tick"；且它同时把 K1 的**最后一处装配缺口**（无 timer ⇒ tick-only）补掉，否则 K1 的落地在真机上等于没生效。
2. **P0-9＋P0-6**：数据面与 Verified 分区（所有卡的落盘面，且能独立验收）。
3. **P0-2＋P0-3**：planner 与学习闭环（K2 已落，可直接 `turn.run`；注意 `VMU_TURN_REENTRANT` ⇒ 派发只从 tick 主题走）。
4. **P0-4＋P0-5**：方法库＋发明上报。
5. **P0-7**：验证闭环（与 P0-2 独立，可并行；共用 P0-9）。
6. **P0-8**：人工门（它 gates 的是 P0-2/P0-7 的产物）。
7. **P0-10**：工具面收口（薄包装，最后做）。

**可并行的两块**：P0-1 与 P0-9（互不依赖）；P0-4/5 与 P0-7（都只依赖 P0-9）。**不可跳的**：P0-1 必须在 P0-2 之前；P0-9 必须在 P0-6/4/7 之前。

## §3 pack 目录骨架与"扩 v3-core vs 新建 v3"

### 结论：**新建 `packs/v3/`，`packs/v3-core/` 原样保留、两者互斥装载（部署二选一）**

理由（三条，均可在代码/文档里核）：
1. **pack 之间没有"依赖另一个 pack"的声明面**：`requires` 只认**服务**（`kernel/registry.js:153-176` `checkPack`；`kernel/pack.js:337-344`），装载顺序只由 `config.packs` 数组顺序保证（`vibe-math-vmu.js:877-887`）。若让 v3 依赖 v3-core 提供槽位，一旦有人只装 v3，失败会推迟到"模块醒来时 `services.get('vmu.members')` 抛 `VMU_NO_SUCH_OBJECT`"（`kernel/loader.js:127-143`），而不是**装载期**就报；自包含的 v3 没有这个时序窗口。
2. **v3-core 自己写着它不是 v3，且它的值是"近似"**：`packs/v3-core/index.js:15-17`（"NOT v3 and NOT a behavioural-equivalence proof"）、`:44-52`（`quorumRule` 从 `'majority'` 改成 `'m-unanimous'` 并注明"approximated"）、`:111-133`（manual gate 只挡 `vibe_vmu_script`）。把 v3 建在它上面＝把 v3 的语义绑在一个**已声明为近似**的文件上。
3. **`docs/10-packs.md:320` 与 `:148-154` 已自相矛盾**（前者说 v3-core 声明了三个键，后者说它们被移除）。扩 v3-core 会让这份文档的"它不是 v3"结论失效，需要重写历史裁决；新建则只**追加**，不动已发布的机构示例。

替代方案（不推荐，仅记录）：v3 `requires` v3-core 提供槽位/轨，v3 只带策略。代价＝上面第 1 条的时序风险＋必须保证 `config.packs` 顺序＋v3-core 的两条近似策略要么被 v3 覆盖（同层重声明会 `VMU_PACK_CONFLICT`，`kernel/pack.js:428-458`）要么保留成"额外的粗闸"。

### `packs/v3/` 文件骨架

```
packs/v3/
  index.js                    # PACK: id 'v3'，slots/tracks/settings/codes/middleware/prompts
  README.md                   # 与 v3-core 的关系、互斥装载说明、诚实边界（≠行为等价证明）
  settings/
    defaults.json             # ★ 构造前可见：vmu.schedule.triggers/autoArm/timeSource/triggerVia、
                              #   vmu.records.requireSettledRecords/allowedKinds/tracks/bodyCapBytes/head.maxItems
    defaults.js               # 同一份值的代码视图（v5r 先例：packs/v5r/settings/defaults.{js,json}）
  middleware/
    tick.js                   # P0-1
    dataplane.js              # P0-6/P0-9
    planner.js                # P0-2/P0-3
    methods.js                # P0-4/P0-5
    verify.js                 # P0-7
    gates.js                  # P0-8
  prompts/
    sections.json             # 纯数据：planner/solver/verifier 段 + role 绑定（构造前按目录名读）
    v3-blocks.js              # 可选：段文本模块（若更愿意用 JS）
  notices.js                  # 可选：通知渲染（v5r 有 packs/v5r/notices.js 先例）
```

**关键装载约束（每条都核过）**：
- **middleware 条目必须是 module 形状且带 `module:` 对象**：`pack.js:527-546` 只有 module 形状才走 loader 拿 `api`；且 pack 调 `kernel.loader.toBusEntries([spec])` **不传 `importModule`**（`kernel/pack.js:541`），而 loader 的 `file:` 分支需要 importer（`kernel/loader.js:163-167`）⇒ **`file:` 不可用**，必须在 `index.js` 里 `import` 模块并写成 `{ kind:'module', module: tickModule, capabilities:[…] }`。
- **模块要 reach 服务必须声明 `trigger-workflow`**（`kernel/loader.js:127-143`；能力清单 `kernel/bus.js:24-27`）；tick/planner/dataplane 都需要它。
- **提示词段**：静态文本放 `prompts/sections.json`（构造前折入，`vibe-math-vmu.js:279-391`）；也可用 manifest `sections/bindings`（装载后注册，`vibe-math-vmu.js:976-994`）。段 order 必须落在 **600-899**（`kernel/prompt/index.js:24-30`）。
- **相位（phase）不新增**：用内核 `normal/verify/verify-debate`（`kernel/turn/index.js:156`）；新增相位要改装配 `PACK_RUNTIME`（`vibe-math-vmu.js:464-476`）＝⑤。
- **不要在 `defaults.json` 里重复 manifest `settings` 同键**：两处会判"同层/重叠"冲突（`docs/10-packs.md:118`；`pack.js:428-458`）。规则：**构造期要读的键 → defaults.json；调用期读的键 → manifest settings**（`docs/10-packs.md:122-128`）。P0-1 的 4 个 schedule 键 + `autoArm` 属前者；`vmu.v3.*` 属后者。

## §4 与 `packs/v3-core/` 的差集（逐条比对，不凭印象）

| 维度 | v3-core **已有**（行号） | P0 **还缺**（对应卡） |
|---|---|---|
| 槽位 | `planner:1`／`solver:8`／`verifier:3`，含 permissions（`packs/v3-core/index.js:73-77`） | 无（v3 复用同一机构） |
| 轨 | 5 条 `propos/problems/directions/journal/verified`（`:53,80`） | 扩到含 `plans`/`inventions`/`methods`（P0-9） |
| 设置 | 6 把：`vmu.limits.maxLiveMembers:4`、`vmu.meetings.verdictMaxRounds:5`、`vmu.meetings.quorumRule:'m-unanimous'`、`vmu.records.tracks`、`vmu.v3.verifierCount:3`、`vmu.v3.mode:'auto'`（`:41-70`） | **P0 需 10 把新 `vmu.v3.*`（P1 再加 8 把）**＋`vmu.records.*` 覆写（§2 第 0 步） |
| M2 模块 | 2 个：`v3-core-verifier-quorum`（`on:['ballot/tally']`，`:87-110`）、`v3-core-manual-gate`（`on:['tools/pre-execute']`，只挡 `vibe_vmu_script`，`:111-133`） | 6 个：tick／dataplane／planner／methods／verify／gates（P0-1…P0-9） |
| 别名 | 3 条，目标是**服务**不是工具（`:137-141`；`kernel/registry.js:99-104` 要求目标已发布） | 无 P0 需求；别名**不产生工具面**（全仓唯一消费者是 `registry.get`）⇒ P0-10 不能靠别名，必须 ⑤/⑥ |
| 代码码 | 2 个 `VMU_PACK_V3_CORE_*`（`:34-37`） | 新拒码命名空间 `VMU_PACK_V3_*`（tick/planner/methods/gates 各自的具名拒） |
| 提示词 | **无**（整个 pack 无 `prompts/`） | `prompts/sections.json`＋role 绑定（P0-2/P0-7/P0-8） |
| `settings/defaults.json` | **无**（v3-core 目录下只有 `index.js`） | 必须有（P0-1 的 schedule 键只能在这里生效） |
| M1 规则 | `rules: []`（`:84`，故意留空，头注 `:9-13` 解释为何用代码） | 保持 `[]`（P0 不引入 M1；计数/状态类规则 M1 表达不了） |
| 数据面模块 | **无**（5 条轨声明了但没有任何模块写/解析它们） | `dataplane.js`（P0-6/P0-9） |
| 诚实边界 | `:15-17` 明说"不是 v3、不是行为等价证明" | 新 pack README 必须继承同一句，并写明 P0 只做"机制可用"，行为等价 A/B 另立项 |

**结论**：`v3-core` 提供的是**机构外壳**（槽位/轨/2 个闸），P0 缺的是**整套运转机制**（驱动、规划、数据面、方法库、验证闭环、人工门、提示词、工具面）。这也解释了为什么 `docs/10-packs.md:152-154` 把 3 个参数登记为"扩展点"——它们是 P0 里第一次有真实读者的键。

## §5 我不能确定的（未核到＋补法）

| # | 未核到／不确定 | 影响 | 补法 |
|---|---|---|---|
| U1 | `vmu.ballotbox.cast` 的**选项词汇与缺席/弃权计入口径**（法定数拒码已核到＝`VMU_BALLOT_MIN_VOTES_NOT_MET`，`kernel/ballotbox.js:335`；但 cast 的 option 是否允许自定义字符串、`absent` 怎么记我只读到 `kernel/ballotbox.js:190-270` 的部分拒绝路径） | P0-7 的"for/against/abstain"三档是否够用 | 读 `kernel/ballotbox.js` 的 `cast` 全文与 `open` 的 `options` 约定；或先用 `open({options:['for','against','abstain']})` 的显式三选项测一遍 |
| U2 | `vmu.human` 的"批准"方法名（我核到 `openApproval`/`approvalState`，`kernel/human.js:206-248`，未核到 decide/approve 的公开名） | P0-8 的执行路径 | `grep -n "approve\|decide\|resolve" kernel/human.js` |
| U3 | 装配里注入 `timer` 的**正确形状**：平台 timer 需 `{setTimeout,clearTimeout}`（`scheduler.js:176` 认第四种形状），但装配是否应转接宿主 timer 服务（`ctx.timeout`？）未核 | P0-1 的实现细节 | 读 `kernel/index.js:352`（`timer = null` 选项）＋宿主 `ctx` 暴露的定时器；最保守：`timer = { setTimeout, clearTimeout }`（Node 全局）即可 |
| U4 | `vmu.records.allowedKinds` 是否允许 pack 在 `PACK.settings` 里**整体覆盖**默认 8 种（而非追加）——`put` 只做 `includes` 检查（`kernel/records.js:473-476`） | 会静默丢默认 kind（`dataset`/`rebuttal`） | 在 defaults.json/manifest 里**列全**（默认 8 ＋ v3 的 6），或确认 `put` 有追加语义 |
| U5 | `vmu.records.bodyCapBytes` 调到 65536 是否会撞 `head.maxItems`/retention 的其他上限（`kernel/records.js:482-493` 的拒码路径我只读了注释级） | P0-9 大卡片可能被拒 | 写一条 2KB card 的 smoke test；或读 `:457-540` 全文 |
| U6 | **方法卡修订**用 `vmu.records.supersede/history`（我核到 `:602-641`，`storeMode full/diff`）还是 `vmu.library.commitRevision`（`kernel/library.js:661-704` 的 `<id>@<rev>.md`）——两者都能表达"v1/v2"，但落盘形态不同 | P0-4 的 diff 断言形态 | 默认选 `records`（单一面、无第二索引）；若 Lead 要求 v3 原样的 `<id>@rev.md` 文件，则改用 library |
| U7 | `vmu.members.wake` 是否仍需要装配 `config.deliver`（`vibe-math-vmu.js:494` 的 `deliver:` 只在 `config.deliver` 为函数时注入；K2 后可用 `vmu.turn.run` 绕开） | P0-2 的派发动词选择 | 用 `vmu.turn.run`（K2 已开）；仅当要"发信封而不跑回合"才需要 `deliver` |
| U8 | 工具面改动的**精确落点**：`host.js` 的 face 表是"一 face 一工具名"（`:84-138`），36 个 v3 名并非 1:1 映射 | P0-10 的工作量 | 已给建议：只做 10 个；若坚持 36 个，需 ⑥（pack 声明式工具面，`kernel/pack.js` 新字段）或 ⑤（host.js 逐名） |
| U9 | `packs/v3` 与 `packs/v3-core` **同时装载**时的第一个失败点（同层 settings 冲突 ⇒ `VMU_PACK_CONFLICT`，`kernel/pack.js:428-458`） | 部署误配的可诊断性 | 写一条负向断言：两 pack 同装 ⇒ `packErrors` 含 `VMU_PACK_CONFLICT`；并在 README 注明互斥 |
| U10 | 坏文件 `phase6-v3-replication-blueprint.md` 是否还有可用段落 | 无（本文件不依赖它） | 不引；若要用其结论，重跑 §1 的 v3 证据行号即可 |

---

### 一条最容易做错的（给 Lead 的提醒）

**最容易做错的是 P0-1：把"K1 已落"当成"周期驱动已完成"。**
K1 只在**内核**加了 `autoArm` 与种子驱动（`kernel/scheduler.js:547-581`、`kernel/index.js:878-887`），但**装配建内核时没传 `timer`**（`vibe-math-vmu.js:469` 的 `createKernel({...})` 无 `timer` 键）⇒ 真机上 `autoArm=true` 只会得到 `mode:'tick-only'`（`scheduler.js:571-577`）。更隐蔽的一点：种子与 `autoArm` 都是**构造期**读取（`scheduler.js:104`、`kernel/index.js:882`），而 pack manifest 的 `settings` 是**装载后**才 apply（`pack.js:428-470`）⇒ 若把 4 个 schedule 键写进 `PACK.settings` 而不是 `settings/defaults.json`，**它们永远读不到**，且不会有任何报错（种子为空、autoArm 为 false，系统"安安静静地不跑"）。这正是本项目最忌的"声明了但没有生效"。
