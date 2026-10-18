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
