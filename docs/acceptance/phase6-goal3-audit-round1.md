# PHASE 6 · 目标 3 首轮深度审计（只读）

> 性质：**只读**。本轮不改任何代码、不改其它文档、不跑 git；本文件是唯一新增物。
> 依据：目标 3 要求找 **① 缺省语义风险 ② 有机制无用户路径 ③ 半成品 ④ 文档与实现矛盾**，按 P0/P1/P2 排序。
> 判据：**"缺省 ≠ 某个具体值"安全**；**"缺省 ⇒ 走某个分支"是风险位**（尤其 fail-closed／静默降级）。

## §0 方法与计数口径

- 覆盖面数字与"是否对得上"均由命令派生（见 §6），不手抄。
- 每个结论给 `文件:行`；未能证实的写"未核到"，不写"没有"。
- 本轮以**读源码 ＋ 定位调用点**为主，**没有**为这些结论跑真机内核（§6 已标）。

## §1 `api.setting()` 缺省类普查

### 1.1 已修的那一处（作为判据的基准）

内核 `setting:` 访问器在未配置时回落到 schema 声明默认（`vibe-math-vmu/kernel/index.js:1475-1480`），因为内核**不把 schema 默认物化**进设置对象。要区分"操作员设过没有"仍可走 `settingDef()`／`settingSource()`（`:1474` 注释）。

### 1.2 风险位（缺省 ⇒ 被当成某个语义）

| # | 位置 | 未配置时拿到什么 | 被当成了什么 | 级别 |
|---|---|---|---|---|
| R1 | `vibe-math-vmu/kernel/index.js:1796-1797`（`quotesPerMessageMax`／`quoteDepthMax` 用 `\|\| 0`） | `undefined → 0` | **0 = 关闭上限**（`kernel/meeting.js:207`、`:216` 都以 `>0` 才执行拒绝/折叠）；而 schema 声明默认是 **2／3**（`settings/schema.js:143-144`），模块自身默认也是 2／3（`kernel/meeting.js:75-76`）⇒ 默认部署**超额引用不再被拒** | **P0**（声明为"机器强制"的能力静默消失；§5） |
| R2 | `vibe-math-vmu/kernel/library.js:104`（`storeMode` 回落 `'full'`）；同键第二处 `kernel/retention.js:85` 同样回落 `'full'` | `undefined → 'full'` | 历史存储走 **full** 分支（`library.js:623`、`retention.js:159` 的 `'diff'` 分支保护 BASE 版本）；而 schema 默认是 **`'diff'`**（`settings/schema.js:350`）⇒ 默认部署**保留完整历史、且 BASE 版本可被裁剪**（与声明的 diff 语义相反） | **P0**（retention 一旦启用＝静默改变数据保留规则；§5） |
| R3 | `vibe-math-vmu/kernel/rules.js:200`（M1 规则的 `setting:` 谓词） | `undefined`（谓词用 `ev.__settingFn`，其来自 `kernel/bus.js:675` 的 `setting:(k)=>settings[k]`；而 bus 是用**原始 settings** 构造的，`kernel/index.js:595-597`） | 与字面量比较（如 `eq`）⇒ **false ⇒ 整条规则不触发**；同一语义在 M2 的 `api.setting()` 却会回落声明默认 ⇒ 两扇门对同一设置键给出不同值 | **P0**（声明式策略静默不生效；§5） |
| R4 | `vibe-math-vmu/kernel/bus.js:534`（失败策略链 `entry.failure \|\| failureDefault \|\| DEFAULT_FAILURE[hook] \|\| 'closed'`） | `undefined → failureDefault=null`（`bus.js:482`）→ 落到**每钩子默认**（`bus.js:305-306`；观测类钩子是 `open`） | 与 schema 声明的默认 **`closed`**（`settings/schema.js:254`）不一致；schema 的 doc 字段又写明"再次按钩子的内置默认"（`docs/04-settings.md:371`）⇒ **声明默认与行为默认两个答案** | **P2**（文档/声明不自洽；缺省行为本身有据可查） |

### 1.3 已核对、判定为安全（不列风险，但记录审计过）

`tasks.stages`（回落 `[]`＝声明默认）、`turn.wakeupPolicy`（undefined 由 turn 默认 `round-robin`＝声明默认，`kernel/turn/index.js:632,646`）、`records.tracks`（library 默认即声明默认的 5 条）、`records.headListAt`／`truncateMode`／`fingerprintPolicy`、`audit.ringMax`（64）、`audit.chain.checkpointEvery`（100）、`math.timeoutMs`（bridge 默认 60000＝`math-computation.js:38`）、`limits.wallClockMs`（0）、`tasks.maxOpenTasks`（0）、`meetings.roundTimeoutMs`（0）、`limits.toolCallsPerTurnCap`（0）、`crypto.signingKeyId`／`timestampAuthority`（声明空串、实现 `null`，同义）。判定依据：回落值与声明默认**相等**，或两者语义相同。

## §2 "机制存在，没有通往用户的路径"

| # | 位置 | 机制 | 用户能不能用上 | 级别 |
|---|---|---|---|---|
| N1 | `kernel/index.js:882-887`（只在构造时读 autoArm，且只 `on:true`）；`kernel/scheduler.js:565-570`（`on:false` 只复位标志）、`:584`（`disarm()` 没有任何生产调用点） | 关掉自驱 | **不能**：运行期把该键改成 false 只写进设置，**没有消费者重新 disarm**；而回执按 H1 说"已生效"（`kernel/index.js:2066-2091`）⇒ **回执比事实多说一句** | **P1** |
| N2 | `kernel/bus.js:610-621`（声明主题）+ `:344`（`DECLARED_TOPICS` 是**进程级**、无移除 API）；`packs/v3/middleware/tick.js:34`（在 import 时就用临时 bus 声明 `v3/tick`） | 自定义主题 | **卸载后不能收回**：`pack.js` 的 undo 只清工具/设置/中间件条目（`:501-527`、`:600`），**没有主题清理**；同一进程里后建的内核仍把 `v3/tick` 当已注册钩子 | **P1**（与 §3-H1 同一事实） |
| N3 | `kernel/index.js:1944`（`capabilities` 收进冻结条目）；`host-pack-tools.js:62-89`（host 规格**不含** capabilities）；`:2408`（只被状态视图列出） | pack 工具的 capability 声明 | **用不上**：既不参与发布/调用校验，也不传给宿主；`packs/v3/tools.js` 的 10 条声明**根本没写** capabilities（`:410-468` 附近）⇒ 字段是装饰 | **P2**（诊断可见，行为无关） |
| N4 | `kernel/index.js:1497`（注册 `vmu.middleware`）＋ `docs/03-interface-contract.md:44`（文档点名 `rewriteOf`）；能力门控目录只有 16 个名字（`kernel/index.js:1440-1461`，**无** middleware） | M2 模块取总线（含 `rewriteOf`） | **不能**：`api.services.get('vmu.middleware')` 走 `kernel/loader.js:137-140` ⇒ 具名 `VMU_NO_SUCH_OBJECT`；`rewriteOf` 目前在进程内只被 `kernel/turn/index.js:1066` 使用 | **P2**（具名拒绝，非静默；但"已登记"与"模块可达"不是一回事） |

## §3 半成品／成对机制缺一半

| # | 成对机制 | 一侧 | 另一侧 | 攻守是否对称 | 级别 |
|---|---|---|---|---|---|
| H1 | `declareTopic` ↔ 撤销 | `kernel/bus.js:610` 声明；进程级集合 `:344`；`declaredTopics()` `:347` | **另一侧不存在**：全仓 grep 无 `undeclareTopic`／`retractTopic`／`removeTopic`；`pack.js` 卸载不清理 | **否**：包卸载后主题仍被本进程（含后续内核）视为已注册 | **P1** |
| H2 | `declarePackTools` ↔ `retractPackTools` | `kernel/index.js:1925-1951`；声明带 `{by}`、撞名/跨包重名**具名拒**（`:1936-1937`） | `kernel/index.js:1954-1962`；**不校验调用者/归属**，可删任意名字 | **否**：声明有所有者检查，撤销没有；pack 工具 handler 能拿到 kernel（`host-pack-tools.js:81`）⇒ **一个包可撤掉另一个包的工具** | **P1**（同一信任域内仍是攻守不对称） |
| H3 | `declarePackTools` 的原子性 | `kernel/index.js:1931-1949` 逐条校验、逐条 `set` | 中途拒绝时**无回滚**（先 `set` 的条目留在 map 里） | **否**：声明失败后内核可能持有半份声明 | **P2**（清单经 `pack.js` 预校验时可避免，但 kernel API 是公开面） |
| H4 | `declareTracks` ↔ 撤销 | `kernel/index.js:1895-1913` 重建 library | **无 retract**；`pack.js:519-522` 声明后**没有 undo**（slots 有 undo，`:516`） | **否**：卸载后新 library 留着；构造期就拿到旧 library 的服务（`kernel/index.js:775,783,795,798,803,841`）仍持旧句柄 ⇒ 可能出现两份 library | **P2**（当前无出货包声明 tracks：`packs/v3/index.js:41-45` 明写为何不用） |
| H5 | `autoArm` ↔ 关 | `kernel/scheduler.js:565-570`（on:false 存在）、`:584`（`disarm` 存在） | 生产调用点只有 `on:true`（`kernel/index.js:883`、`packs/v3/tools.js:171`）；**on:false 与 disarm 零调用** | **否**：开有消费者、关没有（与 N1 同一事实） | **P1** |
| H6 | `packTools()` ↔ declare/retract | `kernel/index.js:1965` 只读 | `host.js:927` 发布、`:2408` 状态 | **是**：读侧无副作用，卸载路径有测试（v3 工具套件断言 unload 后为空） | — |
| H7 | `rewriteOf` ↔ 生产者/消费者 | `kernel/bus.js:752-773`；生产者 `turn/index.js:1057-1058` | 消费者 `turn/index.js:1066-1076`（bus 已注入，`kernel/index.js:1316-1324`） | **是**：非 rewritable 钩子/畸形值具名拒 | — |
| H8 | 门禁（gate）生命周期 | `packs/v3/middleware/gates.js:206` `createGate`；终止态只有 released/rejected/failed（`:58`） | **没有 cancel/expire**（导出面见 `:445` 等） | **弱**：未决门只能被批准或拒绝，主体作废时只能选一个"决定" | **P2** |

## §4 文档与实现互相矛盾

| # | 同一事实 | 一侧（文档） | 另一侧（实现） | 级别 |
|---|---|---|---|---|
| C1 | 引用上限默认值 | `docs/04-settings.md:310-311` 写默认 `2`／`3`，标"已接线 `kernel/index.js`" | `kernel/index.js:1796-1797` 未配置时回落 **0**（＝关闭上限） | **P0**（与 R1 同一事实） |
| C2 | 历史存储默认 | `docs/04-settings.md:449` 写默认 `diff`、读者 `kernel/library.js` | `kernel/library.js:104`、`kernel/retention.js:85` 未配置时回落 **`full`** | **P0**（与 R2 同一事实） |
| C3 | autoArm 的"已接线/热级" | `docs/04-settings.md:642` 写 H1／会话、✅已接线（`vibe-math-vmu.js`） | 只在构造期读一次（`kernel/index.js:882`），运行期写入没有消费者（§2-N1）；回执却按 H1 报 `applied:'immediate'`（`:2066-2091`） | **P1** |
| C4 | 能力门控目录的服务数 | `docs/29-build-your-own-preset.md:428` 引 R11 实测"一次列出 **13** 个已发布服务" | 现目录为 **16** 个（`kernel/index.js:1440-1461`，命令派生 §6）⇒ 数字未随 K2 增加而更新 | **P2**（口径记旧，不是机制错误） |
| C5 | 中间件失败默认 | `settings/schema.js:254` 声明 `def:'closed'`；`docs/04-settings.md:371` 同表写"再次按钩子的内置默认" | 未配置时按每钩子默认（`kernel/bus.js:305-306,534`），观测类为 `open` ⇒ "声明默认"与"实际默认"不一致 | **P2** |

## §5 按严重度排序（含一句话修法）

### P0（会让功能静默失效；本轮未发现"崩溃级"，以下三条按"静默改变行为/数据规则"定级）

1. **storeMode 缺省落成 `full`** —— `kernel/library.js:104`、`kernel/retention.js:85`；schema 声明 `diff`（`settings/schema.js:350`）。修法：两处回落改为 `'diff'`（或读 `settingDef` 的默认），并让 kernel 显式传该键。
2. **meeting 引用上限缺省落成 0** —— `kernel/index.js:1796-1797`；声明 2／3（`settings/schema.js:143-144`）。修法：去掉 `|| 0`，缺省时不要传该选项（让模块默认 2／3 生效）或用声明默认。
3. **M1 规则的 `setting:` 谓词没有声明默认回落** —— `kernel/rules.js:200`；与 M2 的 `api.setting` 修复不同源（`kernel/index.js:1475-1480`）。修法：把 bus 的 `setting` 闭包换成同一访问器，或规则求值时回落到 `SETTING_DEFS`。

### P1

4. **autoArm 的无路径**（N1/H5）＋ C3 回执多话：运行期写该键只写设置、无消费者；回执说已生效。修法：给 `setSettingsValue` 加该键的 live 消费者（on:false 时 `disarm`），或把回执降级为"仅起手生效"。
5. **declareTopic 无撤销**（H1/N2）：包卸载后主题仍注册，且进程级集合影响后续内核。修法：`bus.retractTopic(name)` 并在 pack undo 里按包声明回滚；或让 `DECLARED_TOPICS` 随内核实例走。
6. **retractPackTools 无归属检查**（H2）：任意 kernel 持有者可删他人工具。修法：`retractPackTools(names,{by})` 校验 `packId`，不匹配即具名拒。

### P2

7. pack 工具 capabilities 无消费者（N3）：要么接入发布/调用校验，要么从声明里删掉。
8. `vmu.middleware` 不在能力门控目录（N4）：要么加进去，要么在文档里写明"M2 不可达、仅内部"。
9. declarePackTools 部分失败无回滚（H3）。
10. declareTracks 无撤销 / pack undo 缺项（H4）。
11. 门禁无 cancel/expire（H8）。
12. C4（docs/29 的 13）与 C5（onFailure 默认两个答案）、R4：口径/记账类。

## §6 覆盖面

- **派生数字**：`kernel/**/*.js` = **103**；`packs/**/*.js` = **31**；`vibe-math-vmu/docs/*.md` = **36**；`vibe-math-vmu/*.js`（根文件）= **10**；`docs/acceptance/*.md` = **348**。目录计数命令见本轮报告（node 遍历，非手抄）。
- **实际读过（整段或定位读）约 35 个文件**：`kernel/index.js`（重点段）、`kernel/bus.js`、`kernel/scheduler.js`、`kernel/rules.js`、`kernel/library.js`、`kernel/retention.js`、`kernel/meeting.js`、`kernel/turn/index.js`（rewrite 段）、`kernel/loader.js`、`kernel/pack.js`、`settings/schema.js`（按需 grep）、`host.js`（set/pack-tools 段）、`host-pack-tools.js`、`vibe-math-vmu.js`（装配段）、`packs/v3/index.js`、`packs/v3/tools.js`、`packs/v3/middleware/{tick,gates,verify,planner,methods}.js`、`docs/03/04/05/29/27`（相关行）、`docs/11`（计数行）等。
- **完全没看**：其余约 70 个 kernel 模块（audit／crypto／governance 等只在上轮看过片段）、`packs/v5r/**` 全部、`packs/v3/prompts/**`（只核了声明）、`host-*.js` 除上述外的 6 个、`docs/acceptance/**` 仅按需检索（348 份未通读）、`docs/00-02/06-28` 的绝大多数正文。
- **未做**：没有为 R1–R3 跑真机内核行为探针（结论来自代码路径＋声明对照）；没有跑全量 T1；`scripts/` 侧门禁未纳入。
- **诚实边界**：§1 的 R1–R3 是**静态可判定**的（缺省值→分支），但"默认部署实际表现"仍需一次真机确认；§2/§3 的路径结论以"调用点 grep 为空"为依据，未见调用点 ≠ 永远不存在（覆盖面即上文）。

## §7 修复记录（同阶段修复轮，非审计结论）

- **一类问题一个助手**：新增 `vibe-math-vmu/kernel/settings-defaults.js`（`readSetting(settings, key)`：配置值优先，否则取
  `SETTING_DEFS` 的 `def`；`declaredDefault`／`settingDeclaration` 同源）。四扇门全部改走它：
  `kernel/library.js`（storeMode）、`kernel/retention.js`（storeMode）、`kernel/index.js`（quotesPerMessageMax／quoteDepthMax，
  另把 `api.setting` 也统一到同一助手）、`kernel/rules.js`（M1 `setting:` 谓词；`kernel/bus.js` 的 handler `setting` 闭包同步改）。
- **行为按 schema 对齐**：storeMode 缺省 ⇒ `diff`（不再 full）；引用上限缺省 ⇒ 2／3（不再 0 关闭）；
  `tests/vmu-library-revisions.test.mjs` 的旧期望（full）随之更新为 diff。
- **防回归**：`tests/vmu-kernel.test.mjs` 新增 "P0-fallback" 段（助手语义＋四扇门行为＋M1 规则匹配＋裸读扫描与报告），
  旧基线 185 断言 → 今 **212**（作业数不变，未新增测试文件）。
- **未改**：`settings/schema.js`（schema 是声明真源）；R4（`vmu.middleware.onFailure` 的 `def:'closed'` 与"按钩子默认"的
  文档文本冲突）**留给你裁定**——把 `closed` 变成实际默认会改变四个观测钩子的失败策略，故本轮未动，只在注释里留了裁决说明。
- **派生面**：零机制矩阵新增 `settings-defaults` 的 `EXPECT_NA` 裁定行；`regen-all --check` 16/16；preflight／check-docs 通过。

## §8 修复记录（P1 ＋ 半成品四对）

- **autoArm（P1，选 b）**：声明仍是**构造期读取**，把该键热级改为 **H2**（`settings/schema.js`），回执从此如实说
  `requiresRestart:true`／`appliesAt: next session`，不再谎称即时生效；理由：装配期才注入 timer 接缝，运行期"开"在没有
  timer 的部署里只能得到 tick-only，若强行支持就要给所有部署注入平台 timer（破坏零机制与 `status().seams` 的诚实性）。
  程序化的 `scheduler.autoArm({on:false})` 与 `disarm()` 保留（库层能力，不是设置语义）。
- **declareTopic（P1）**：改为**可撤销的、带 owner 的声明**（`kernel/bus.js`：`TOPIC_OWNERS`／`retractTopic`／
  `retractTopicsOwnedBy`）；v3 的 `topics` 进入**清单字段**（`packs/v3/index.js`），`pack.js` 在 middleware 之前声明、
  卸载 undo 按本次装载 token 撤回；`tick.js` 不再在 import 时用一次性 bus 声明（那正是跨内核泄漏源）。
  反面断言：新进程内 apply→unload 后 `isRegisteredHook('v3/tick') === false`。
- **retractPackTools 归属（P1）**：撤销必须带 `by`，归属不符 ⇒ `VMU_NOT_PERMITTED` 且**工具仍在**；整批先校验后删除。
- **declarePackTools 原子性**：先全量校验、再一次性提交 ⇒ 中途非法时**一条都不留**。
- **declareTracks 反向**：新增 `retractTracks()`，`pack.js` 的 tracks undo 调用它 ⇒ 卸载后回到构造期轨集合。
- **gate 可取消**：新增 `cancelGate`（必须带理由；终态 `cancelled` 入台账、不再阻塞；已终结者不可再取消），
  并接到 `vibe_math_decide` 的 `cancel` 动作；`GATE_TERMINAL_STATUSES` 与计数视图同步；`docs/10` 清单字段表补 `topics`／`tools`。
- **测试**：`vmu-kernel`（+11：回执/原子/归属/tracks 卸载）、`vmu-bus`（+3：owner 撤回语义）、
  `vmu-v3-tools`（+2：应用期注册、隔离进程卸载后不再注册）、`vmu-v3-tick`（声明时机断言更新）、
  `vmu-v3-gates`（+8：cancel 全链路）；作业数不变（454）。

## §9 Round 2 覆盖：其余 80 个 kernel 模块（只读发现）

**范围**：`kernel/**/*.js` 共 **104** 个；首轮读过/定位读 24 个（§6），本轮扫其余 **80** 个。
**方法**（每模块只问三问，不通读）：
1. 声明的能力有没有生产调用点（自报的 `status()` 字段谁在用？——注意：`status()` 整段被 `kernel.status()`/工具面**整体消费**，
   字段名在仓内无直接引用**不等于**无消费者，故只把"能力本身无反向入口"计为发现）；
2. 读设置/状态缺省走哪个分支——用与首轮相同的 schema 默认对照扫描；
3. 成对机制缺一半——扫描 `declare/retract`、`open/close`、`enable/disable`、`register/unregister`、`attach/detach`、
   `arm/disarm`、`acquire/release`、`subscribe/unsubscribe`、`add/remove`、`table/untable` 等，逐条人工复核误报。

**汇总**：P0 **0** 条；P1 **0** 条；**P2 9 条**（全是"半成品/反向入口缺失"型）。其余 **71** 个模块：**未发现**
（按上述三问的静态判据；不等于通读）。设置缺省扫描：**80 个模块里 0 处回落值与 schema 声明默认不一致**（与首轮 4 条 P0 的
修法一致：这一类在剩余模块中没有新的门）。

| 模块 | 发现 | 文件:行 |
|---|---|---|
| `activity.js` | 未发现 | — |
| `alerts.js` | 未发现 | — |
| `arbitration.js` | 未发现 | — |
| `ballot.js` | 未发现 | — |
| `ballotbox.js` | P2：`cast` 没有对应的撤回/改票入口；重复投票的错误提示自己写着"改票需先撤回（本面未实现 ✗）" | `kernel/ballotbox.js:196` |
| `bidding.js` | 未发现 | — |
| `board.js` | P2：`addColumn` 没有 `removeColumn`（列只能加不能删） | `kernel/board.js:87` |
| `budget.js` | 未发现 | — |
| `capacity.js` | 未发现 | — |
| `charter.js` | 未发现 | — |
| `chat.js` | 未发现 | — |
| `citations.js` | 未发现 | — |
| `clockguard.js` | 未发现 | — |
| `collab.js` | P2：`addCounterparty` 没有移除/停用对口机构，登记表只增不减 | `kernel/collab.js:285` |
| `compliance.js` | 未发现 | — |
| `conference.js` | 未发现 | — |
| `contentvalue.js` | 未发现 | — |
| `control.js` | P2：`register(id)` 没有对应 `unregister`，watchdog 注册只增不减（是否有界未核） | `kernel/control.js:283,307` |
| `course.js` | 未发现 | — |
| `custody.js` | 未发现 | — |
| `delegation.js` | 未发现 | — |
| `discipline.js` | 未发现 | — |
| `explain.js` | 未发现 | — |
| `fairness.js` | 未发现 | — |
| `fidelity.js` | 未发现 | — |
| `formal.js` | 未发现 | — |
| `funding.js` | 未发现 | — |
| `governance.js` | P2：`tabled` 动议没有 un-table，附议提示"先取消搁置（本切片未实现 un-table ✗）" | `kernel/governance.js:184` |
| `grant.js` | 未发现 | — |
| `handover.js` | 未发现 | — |
| `human.js` | P2：`openApproval` 只有 `decide`（批准/拒绝），没有撤回/取消路径；与 gate 的 cancel 属同一半成品类 | `kernel/human.js:521-525` |
| `idempotency.js` | 未发现 | — |
| `identity.js` | 未发现 | — |
| `ids.js` | 未发现 | — |
| `ip.js` | 未发现 | — |
| `lean.js` | 未发现 | — |
| `lifecycle.js` | 未发现 | — |
| `mailbox.js` | 未发现 | — |
| `mathadapters.js` | 未发现 | — |
| `mathjobs.js` | 未发现 | — |
| `meetinglapse.js` | 未发现 | — |
| `meetingleave.js` | 未发现 | — |
| `meetingmarker.js` | 未发现 | — |
| `members.js` | 未发现 | — |
| `memory.js` | 未发现 | — |
| `metrics.js` | 未发现 | — |
| `migration.js` | 未发现 | — |
| `minutes.js` | 未发现 | — |
| `notify.js` | 未发现 | — |
| `panel.js` | 未发现 | — |
| `paper.js` | 未发现 | — |
| `partnership.js` | P2：`registerEntity` 没有 unregister/retire，法律实体登记只增不减 | `kernel/partnership.js:141` |
| `projmigrate.js` | 未发现 | — |
| `prompt/index.js` | 未发现 | — |
| `publication.js` | P2：`openOutreachReview` 没有 close/cancel 对应入口（对外传播评审只能开） | `kernel/publication.js:431-433` |
| `ratelimit.js` | 未发现 | — |
| `receiptbounds.js` | 未发现 | — |
| `recruit.js` | 未发现 | — |
| `registry.js` | 未发现 | — |
| `replay.js` | 未发现 | — |
| `report.js` | 未发现 | — |
| `reportfeedback.js` | 未发现 | — |
| `reportfeedbackdelivery.js` | 未发现 | — |
| `repropack.js` | 未发现 | — |
| `resource.js` | 未发现 | — |
| `resume.js` | 未发现 | — |
| `resumeflush.js` | 未发现 | — |
| `reviewers.js` | 未发现 | — |
| `script-bridge.js` | 未发现 | — |
| `skills.js` | 未发现 | — |
| `stateversion.js` | 未发现 | — |
| `storepolicy.js` | 未发现 | — |
| `tasks.js` | 未发现 | — |
| `tenure.js` | 未发现 | — |
| `timevalue.js` | 未发现 | — |
| `topology.js` | 未发现 | — |
| `transaction.js` | 未发现 | — |
| `trust.js` | 未发现 | — |
| `work.js` | 未发现 | — |
| `workflow.js` | P2：`registerCompensation` 没有 unregister，补偿处理器注册只增不减 | `kernel/workflow.js:721-723` |

**误报说明（复核过、不计发现）**：`alerts.js` 的"declare 无 retract"是误报（它有 `undeclare`，`kernel/alerts.js:279`）；
`identity.js` 有 `endMembership`、`skills.js` 有 `retire`、`recruit.js` 有 `recall/reject`，均属"反向入口换了动词"；
`activity.js`/`lean.js` 的 `arm` 是 timer 接缝名，不是成对生命周期；`budget.open` 是预算 scope 的打开语义，不是资源对。

**范围外顺手修（P1 关联，来自本轮核对）**：`cancelGate` 原本只写 v3 台账、**不镜像** `vmu.human`，撤回后人性面审批仍是
pending（一个"看起来还能批"的幽灵）；已补镜像（以 `denied`＋理由前缀 `cancelled:`，失败记 `mirrorError` 不吞），并在
`vmu-v3-gates` 加断言（cancel 后 human 面 `state==='denied'`）。

## §10 九条 P2 的逐条裁定（本轮只裁定，不改代码）

**判据**：① 注册表有没有界（无界＝泄漏；有界/随会话消亡＝可能是有意设计）；② 缺的反向入口有没有替代路径；③ 不补的具体后果。

| 模块 | 有界吗 | 替代路径 | 不补的具体后果 | 裁定 |
|---|---|---|---|---|
| `ballotbox.js`（`cast` 无撤回/改票，:196） | 有界：一票箱一 map，票箱随会议/会话（`liveBallots` 有 cap） | 无（重复投票直接拒） | 不能改票——但**"不能撤回"正是投票完整性的要求**；真实缺口是"改票（带版本/理由）"而不是撤回 | **不补；记录"只增是设计"**：已投票必须不可撤回，否则计票可被事后推翻。若需要改票，应新增"改票"动作（新值＋旧值留痕），而不是开放撤回 |
| `governance.js`（`tabled` 无 un-table，:184） | 有界：动议随会议 | 新建一条动议（丢失原 id/历史） | 搁置中的动议**永远无法恢复讨论**，只能重开新案并丢历史；状态机缺一条合法边 | **加反向入口**：补 `unTable`（具名、带理由、写台账） |
| `human.js`（`openApproval` 无撤回，:521-525） | **无界**（审批请求列表没有 cap 设置；`status()` 只报计数） | 只能由持有 `decide` 的路径拒绝（把"撤回"记成"拒绝"，语义不同） | 请求方**无法撤回**自己的申请；待批列表只增不减，且与 v3 gate 已修的 cancel 不对齐（gate 撤回后 human 面靠镜像才不挂） | **加反向入口**：补 `withdrawApproval`（请求方撤回，具名、带理由、终态可查；与 gate cancel 同一语义） |
| `collab.js`（`addCounterparty` 无移除，:285） | **无界**（`counterparties` 是 Map，无 cap） | 无 | 合作方**永久不能停用/改名**；错误登记与已终止合作都留在册，且只增不减 | **加反向入口**：补 `retireCounterparty`（标记 retired＋理由，保留历史而不是硬删） |
| `board.js`（`addColumn` 无 removeColumn，:87） | 有界：**运行期新增列是内存态**（`added`，重启回 settings 基线） | 重启后按 settings 重建基线 | 本会话内误加的列**无法纠正**，会一直参与 WIP/移动判定 | **加反向入口（低优先）**：补 `removeColumn`（拒绝仍有任务的列，或要求先转移） |
| `control.js`（`register` 无 unregister，:283） | 有界：注册表**只用来让 `stopClearsRegistry` 可观测**，`stop()` 会按声明清空（:271-279） | `stop()` 清空；同一 id 重复注册幂等（Set） | 无实际泄漏；未注册只影响"停止时清理了几个"的观测数字 | **不补；记录"只增是设计"**：它是控制面自报簿记，生命周期由 stop/会话决定（`vmu.control.stopClearsRegistry` 可配） |
| `workflow.js`（`registerCompensation` 无 unregister，:721-723） | 有界：注册名由**内核/装配代码**给出（当前无 M2 可达入口），不是任意用户输入 | 用同名重新注册覆盖旧 action（Map.set） | 旧补偿动作无法注销；但当前只有框架注册，名字数量固定 | **不补；记录"只增是设计"**：注册面不对外开放；若未来把 workflow 放进能力门控目录，必须同时补 unregister |
| `partnership.js`（`registerEntity` 无 unregister，:141） | 有界/近似：法律实体是机构级集合（实际数量有限），但代码无 cap | 无（实体退役没有状态位） | 错误登记或已解散实体**永久留在册**；只增不删 | **不补；记录"只增是设计，且注明条件"**：实体集合天然有限；真正缺的是"实体状态（active/retired）"这一特性，等机构生命周期需求出现再加，不在本轮臆造 |
| `publication.js`（`openOutreachReview` 无 close，:431-433） | 有界：评审是 outreach 记录上的**布尔策略开关**，随论文记录 | `publishOutreach` 推进"已发布"；评审开关本身可视为长期策略 | 一旦打开无法关闭（只能改值/重建记录）？——但它是"该论文允许开放评审"的策略位，不是一次评审会，没有"结束"语义 | **不补；记录"只增是设计"**：`openReview` 是文档级策略开关而非会话；发布由 `publishOutreach` 推进，二者语义不同 |

**分布**：**加反向入口 4 条**（`governance.unTable`、`human.withdrawApproval`、`collab.retireCounterparty`、`board.removeColumn`）；
**记录"只增是设计" 5 条**（`ballotbox`、`control`、`workflow`、`partnership`、`publication`）。
**最该优先补的一条**：`human.withdrawApproval` —— 它是用户可见的"幽灵待批"（申请人自己撤不回，且待批列表无界），
与刚修的 gate cancel 语义不齐，补齐后两个审批面才同一套语义。

## §11 审计最后一块：`packs/**`（31 个 js）与 `host-*.js`（6 个）

**方法**：逐字段问"manifest 声明的键谁读它"；v5r 中间件逐钩子问"是否已注册＋有发射点"；v3/v3-core 用**实测**
（同一内核依次 apply 两个 manifest）确认互斥是否机器强制；host 文件逐个导出查调用点、边界与降级是否具名。

| 文件 | 发现 | 文件:行 | 级别 |
|---|---|---|---|
| `packs/v3/index.js` ＋ `packs/v3-core/index.js` | **"互斥装载"只是描述，没有机器强制**：实测同一内核依次 apply v3、v3-core **都返回 ok**，`status().packs` 同时列出两者；v3-core 的 `tracks` 静默替换库轨、两个包的 `slots` 同名静默替换，且两套人工门/verifier 机制同时在线（v3-core 的 verifier-quorum 模块订阅 `ballot/tally`） | `packs/v3/index.js:66`（description 写"互斥"）；`packs/v3-core/index.js:41-110`（settings/slots/middleware）；`kernel/pack.js`（无 `excludes` 校验） | **P1**（双机构语义并存，静默覆盖；建议加 manifest `excludes` 并在 plan/apply 具名拒） |
| `packs/v5r/middleware/waitsemantics.js` | **随包发布但没有任何 import / 清单条目 / 测试引用**（只在自身头注释里出现）；`package.json` 与 `installer.js` 都列了它 ⇒ 装完永远不会被装载 | `packs/v5r/middleware/waitsemantics.js:1`；`package.json:486`；`installer.js:93` | **P2**（要么接入清单/测试，要么删除或降级为 `.md`） |
| `packs/v5r/index.js`（folder 记录字段 `sectionModule`/`policyModule`/`noticeModule`/`phases`/`defaults`/`contributes`） | **未发现**：这些不是装载器字段，但都有消费者——`describeV5rPack()` 逐键回显（:94-115），并有测试守"folder 记录每个键必须出现在 PACK 或描述里" | `packs/v5r/index.js:88-115` | — |
| `packs/v5r/middleware/*`（5 个文件） | **未发现（一处除外）**：`prompt-switches` 是 prompt-pipeline 策略（经 `promptPolicies` 消费，不是总线）；`stall-meeting`(`control/idle`)、`motion-box`(`meeting/motion`)、`artifact-counter`(`tools/result`/`math/job-settled`/`lean/job-settled`) 的钩子均已注册且各有发射点；`waitsemantics` 见上一行 | `packs/v5r/prompts/v5r-core.js:200-260` | — |
| `packs/v3/**`（index/tools/6 middleware/7 prompts） | **未发现**（manifest 的 `topics` 已在 §8 接上；tools/slots/sections/middleware/settings 均有消费者；21 段 prompt 经 sections 通道） | `packs/v3/index.js` | — |
| `packs/institute-min/index.js` | **未发现**：可装载（settings/slots/tracks/rules/aliases/codes 均有 pack.js 消费者），测试有装载用例 | `packs/institute-min/index.js` | — |
| `packs/example-data/`（无 index.js） | **未发现**：data-only 包由入口识别（`dataOnly:true`，读 prompts/sections.json + settings/defaults.json），有测试 | `vibe-math-vmu.js:1030-1044` | — |
| `host.js` | **未发现**：工具规格/装配边界；只 import `host-pack-tools`；无与其它 host 文件的逻辑重复 | `host.js:55` | — |
| `host-hooks.js` | **未发现**：`attachHostHooks` 由入口调用；`toPre/PostExecuteDecision` 内部使用；宿主无 `ctx.on` ⇒ 具名 `VMU_ENGINE_UNAVAILABLE` | `host-hooks.js:123` | — |
| `host-math.js` | **未发现**：`createHostMath` 由入口调用，`MATH_OUTPUT`/`MATH_PARAM_MAP` 内部使用；无 `tools.register`/无 subprocess ⇒ 具名拒 | `host-math.js:79,154` | — |
| `host-spawn.js` | **未发现**：`createHostSpawn`/`hasHostSpawn` 由入口用；无 subprocess ⇒ 具名 `VMU_ENGINE_UNAVAILABLE`（:98） | `host-spawn.js:98` | — |
| `host-deliver.js` | **未发现**：`createTurnDeliver` 由入口用；无宿主投递 ⇒ 具名 `VMU_ENGINE_UNAVAILABLE`（:108） | `host-deliver.js:108` | — |
| `host-children.js` | **未发现**：`createChildrenPort` 由入口用；无子会话 ⇒ 具名 `VMU_RESUME_CHILDREN_UNAVAILABLE`（:48） | `host-children.js:48` | — |
| `host-pack-tools.js` | **未发现**：`appendPackToolSpecs`/`packToolFailureRows` 由 host.js 用，另两个导出是内部工厂（被 append 使用）与测试面 | `host-pack-tools.js` | — |

**Packs/hosts 汇总**：packs **P1 1 条、P2 2 条**（余下均"未发现"）；host-* **0 条**（唯一观察：`host-hooks/host-math/host-spawn/host-deliver`
各有一份很小的 `refuse` 辅助函数，属 P3 重复，不影响行为）。**最高级别**：v3 与 v3-core 的"互斥"未被机器强制（P1）。

## §12 修复记录（§10／§11 裁定后的执行，本轮）

- **P1 · 互斥装载机器强制**：`kernel/pack.js` 新增 manifest `excludes`（校验：pack id／禁自指／禁重复）；`plan()` 与 `apply()`
  共用**同一** `exclusionConflicts` 双向检查（对方 manifest 的反向声明也算），冲突以 `EXCLUDES:` 前缀进 `problems`、
  返回/抛出**已登记** `VMU_PACK_CONFLICT`；成功 apply 记录该包的 `excludes`，`unload` 清理。`packs/v3/index.js` 与
  `packs/v3-core/index.js` **互相声明** `excludes`。测试（`tests/vmu-pack.test.mjs`，53→**66** 断言）：v3 先装 ⇒ `plan(v3-core)`
  也拒；apply(v3-core) 抛 `VMU_PACK_CONFLICT`；**先装包的 tracks／slots 逐项不变**（两侧都先断言非空，避免空集恒真）；
  反向同理；单独装任一 ⇒ ok；`excludes` 自指/非法 id 在计划期报。
- **§10 · `human.withdrawApproval`**：`kernel/human.js` 新增具名撤回（必须带理由；终态 `withdrawn`，`approvalState` 可查，
  `queue().pending` 减一，`status().withdrawnApprovals` 计数；二次撤回／撤回后再 decide ⇒ `VMU_STATE`；无理由 ⇒
  `VMU_INVALID_ARGUMENT`），并加进 human API。v3 `cancelGate` 的镜像改走**同一词汇**（有 `withdrawApproval` 就用它，
  老 face 回退 `decide`）；`vmu-v3-gates` 断言镜像状态为 `withdrawn`。测试：`tests/vmu-human-gate.test.mjs`（79→**83**）。
- **§11 · waitsemantics（选 b：文件删除、文本迁文档）**：该文件自称 normative text 但无消费者；已删除
  `packs/v5r/middleware/waitsemantics.js` 并从 `package.json#files`／`installer.js` managed 清单移除；规范文本迁入
  `vibe-math-vmu/docs/24-v5r-containment.md` §6（写明活跃对等体判定、future-only 等待、durable-when-reported 三件事及其代码依据）。
- **§11 · collectPackSections（选 a：入口真的用它）**：`vibe-math-vmu.js` 注册 pack sections 时改为
  `collectPackSections([manifest])`（此前是裸 `manifest.sections`）⇒ 同名/非法段名的**具名拒在生产路径上**；
  helper 不再是"只有测试用的导出"。入口/`vmu-turn`/v3 prompts 套件回归绿。
