# 目标 3 · 长尾证据：F8–F53 逐条实测判定（vmu-verify · Round 3 / task-23）

> **方法（本文件的诚实边界）**：每条判定**只来自读代码**（`grep`/`read` 本仓 `vibe-math-vmu/**`，路径相对 `Vibe-Mathematics/`）或**跑只读探针**；**不从任何文档／卷／交接件转述**。凡我读不到、或机制存在但语义与 v5r 要求**不等价**者，一律标 `部分` 并写出差异；凡我确认不存在者标 `缺失` 并给处置建议。
> **判定词**：`具备`＝机制存在且与要求同义；`部分`＝存在但语义／覆盖不等价（已写明差在哪）；`缺失`＝未找到该能力。
> **可复核性**：下表每行的 `file:line` 都可用 `grep` 复现；找不到时以"未找到"具名说明，不猜行号。
> 覆盖 §五 的七组：F8–F14／F15–F18／F20–F24／F25–F34／F35–F40／F43–F47／F49–F53，共 **42 条**。

## 0. 结论速览

| 组 | 条数 | 具备 | 部分 | 缺失 |
|---|---|---|---|---|
| F8–F14 子代理生命周期 | 7 | 3 | 1 | **3** |
| F15–F18 定时与并发 | 4 | 2 | 1 | 1 |
| F20–F24 提示词管线 | 5 | 5 | 0 | 0 |
| F25–F34 共识／表决 | 10 | 5 | 3 | **2** |
| F35–F40 任务板／成果库 | 6 | 4 | 0 | **2** |
| F43–F47 形式化／工具链 | 5 | 3 | 2 | 0 |
| F49–F53 可观测／可恢复 | 5 | 2 | 1 | **2** |
| **合计** | **42** | **24** | **8** | **10** |

**最需要 Lead 注意的六条实测意外**（都是"文档说不清、代码说得很清"的）：
1. **子代理生命周期（Round 3 的发现 → Round 4 已补齐）**：R3 时 `startContinuable` 有，而 **`sendMessage`/`interrupt`/`childId`+`stopReason` 在 vmu 侧完全不存在**（F9/F10/F11）——vmu 只"启动并读回回复"。★ **Round 4 由实现改判：F9/F10/F11 全部→具备**（seam 声明＋`status()` 自曝＋`sendToMember`/`interruptMember` 消费；返回带 `childId`/`stopReason`/`attribution` 的生命周期信封）⇒ 详见 **§10.1**。此条保留为"当时的实测"，不再代表现状。
2. **`vmu.ballot.reopenFloor` 是一个没有读取者的设置键**（F30）：代码自己写着"本面从不调用它"。
3. **`control.js:133` 的两处命中不是"活动等待器"**（F52）：那是 `tune()` 的入参校验；按 Lead 的提示去核，结论是**该原语不存在**。
4. **`tools.restrict` 的容错被有意换成 fail-closed**（F13）：未知工具名**具名拒**且什么都不注册，与 v5r 的"容错跳过"**不等价**（更安全，但改判条件不同）。
5. **锁没有仓内使用者**（F18）：`acquire`/`release` 只有测试在调，"在 finally 释放"的纪律**未被任何写路径证明**。
6. **子进程只能超时、不能 terminate**（F17）：注入的 `spawn` 是 promise 接缝、**没有 handle**，代码自己具名说明了这一点。

---

## 1. F8–F14 子代理生命周期

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F8 `startContinuable` | **具备** | `vibe-math-vmu/kernel/turn/index.js:144-160`；接线 `vibe-math-vmu/vibe-math-vmu.js:297-305` | `deliverViaSubagents` 要求 seam 具备 `startContinuable`，缺失时以 `VMU_ENGINE_UNAVAILABLE` 具名拒；spec 带 `to/why/next_step`，产出 `handle.reply`/`handle.text`（166-169） |
| F9 `sendMessage` | **缺失** | 未找到（全包 grep `sendMessage` 无命中） | vmu 无"给在跑子代理发消息"的 API；`deliverViaSubagents` 只**启动**并**读回**，没有后续通信面 |
| F10 `interrupt` | **缺失** | 未找到（`interrupt` 仅命中 `kernel/index.js:959` 的服务描述与 `kernel/lean.js` 的**作业状态**，两者都不是子代理中断） | 无子代理中断原语 |
| F11 回合结束带 `childId`+`stopReason` | **缺失**（R3） | `kernel/turn/index.js:160-169`（R3 时只读 `reply`/`text`） | R3 实测：回合结束路径从不读 `childId`/`stopReason`；`vibe-math-vmu.js:388` 的 INTERRUPTED 是**工作台账**的未结算标记，不是子代理生命周期。★ **R4 改判：具备**（`:174-186` 返回 `{reply, childId, stopReason, attribution}`）—— **见 §10.1** |
| F12 在活上限可探测 | **具备** | `kernel/members.js:161-164`（机器强制）；`settings/schema.js:65`（键）；`vibe-math-vmu.js:118`（资源读数） | `maxLiveMembers>0 && live().length>=cap` ⇒ 具名拒 `VMU_NOT_PERMITTED`＋hint；`vmu.limits.maxParallel` 作同义键（`kernel/index.js:197-202`） |
| F13 `tools.restrict` 未注册名容错 | **部分** | `host.js:832-848`（fail-closed） | 能力在（`vmu.tools.enabled` 收窄面），但**语义相反**：未知名 ⇒ `sanitizeToolFilter` 抛错 ⇒ **什么都不注册**并记录到 `failures`；v5r 的"容错跳过"**不等价**（改判条件：若要求"容忍未知名"，需显式新增"忽略并报告"分支） |
| F14 卸载清理 + 真实资源读数 | **具备** | `host.js:912-919`（`uninstall()` + disposers）；`host-hooks.js:180-194`（逐个 dispose＋failures）；`vibe-math-vmu.js:118` | 卸载时 `disposers.splice(0)` 全部调用并收集失败；资源面报告"在役成员上限"等实测值 |

**处置建议（★ R5 现状：本表 F9/F10/F11 已于 Round 4 改判【具备】——见 §10.1；F12/F14 不变）**：F9/F10/F11 ⇒ **已实现**（seam 声明＋`status()` 自曝＋`sendToMember`/`interruptMember` 消费；F11 另见 `kernel/turn/index.js:174-186` 的 `{reply,childId,stopReason,attribution}`）；**F13 ⇒ 部分（R5 复核维持）**：`host.js:319,329,858` 仍是 **fail-closed**（未知名具名拒并列出未知项/已知面），与 v5r 的"容错跳过"刻意相反，登记时须写清该选择与改判条件。

## 2. F15–F18 定时与并发

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F15 可注销定时器（每个分支都清理） | **具备** | `kernel/scheduler.js:382,429,433`；`kernel/bus.js:382-384` | 触发时 `timerClear`（382）、全清（429）、单个取消（433）；bus 的唯一 `setTimeout` 在 `finally { clearTimeout(timer) }` 里释放；`timer` 支持 4 种 seam 形态（`scheduler.js:154-176`） |
| F16 调度 trampoline | **具备**（等价形态） | `kernel/scheduler.js:291-320` | **无 trampoline 原语**，但 `tick()` 是唯一推进点：`dueList` 走 `for` 循环＋`continue`，重调度是**同循环内的数据变更**，栈深不随重调度增长；fired/reported/dropped/skipped **全部上报**（"never silent"） |
| F17 子进程 `graceMs` 真 terminate + `maxBytes` | **缺失**（具名） | `kernel/lean.js:33,393`（无法 terminate 的具名说明）；超时在 `lean.js:286-296` | 注入的 `spawn` 是 **promise 接缝、没有 handle** ⇒ 无法 terminate；单次预算经 `timeoutMs` 生效并具名拒 `VMU_LEAN_TIMEOUT`；`maxBytes` 只存在于**载荷**层（`kernel/external.js:406-416`），不是子进程输出上限 |
| F18 锁在 `finally` 释放 | **部分** | `kernel/storepolicy.js:138`（acquire）／`:168-171`（release）；使用者仅 `tests/audit-enforced-consistency.test.mjs:439,443,570` | 锁原语与释放回执都在，但**仓内没有任何写路径**取锁 ⇒ "每个分支都在 finally 释放"**未被证明**（策略层的锁目前是 API，不是被使用的纪律） |

**处置建议（★ R5 现状：F15＝具备＋**具名豁免**、F17＝条件具备、F18＝具备——见 §10.5）**：F15 仅剩 `math-computation.js:617,728` 两处无句柄退避 sleep ⇒ **具名豁免**（由 reader-b 写入 `docs/11 §11.ad`，含站点表/上界/重测命令；本文件不重复其内容，也不称其为"缺失"）；F17 ⇒ **条件具备**（宿主给 handle 时真 terminate，否则**具名**说明"无法终止"）；F18 ⇒ **已具备**（`resume.js:761-762` 的 `finally` 覆盖所有出口）。

## 3. F20–F24 提示词管线

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F20 运行时可变的 persona 与每轮文本分离 | **具备** | `kernel/prompt/index.js:115-125`（结构＝构造期注册）＋`assemble()`；`packs/v5r/prompts/v5r-persona.js` | 段落/绑定是构造期结构，**取值走 `sget()` 每轮活读**（Round 2 D-13 已由 `tests/vmu-round2-seams.test.mjs` 常驻断言）；persona 是独立包模块，与每轮调用参数分离 |
| F21 共享文本块单一来源 + 漂移守卫 | **具备** | `kernel/prompt/index.js:5`；`packs/v5r/prompts/v5r-persona.js:5`；`v5r-prompts.js:6` | 声明"byte-for-byte，任何漂移都是红门而非惊喜"；包层声明"与 capture 的差异是 CHECK FAILURE"；实际守卫在 `tests/audit-math-computation-parity.mjs`（语义面＋逐字合同行）与生成器 `--check` 族 |
| F22 回执契约必须是行为断言 | **具备** | `tests/vmu-prompt.test.mjs:74-91` | 断言的是**装配后的文本行为**：状态事实逐字存活、错配绑定"贡献为零"、覆写生效且仍渲染变量、回滚恢复引用——不是只断言回执字段 |
| F23 结构化回执三级回落 | **具备** | `kernel/prompt/index.js:127-133`（`langOrder`）＋`:588-593`（回执） | 回落链是 `asked → locale.default → fallbackChain`（实测默认 `zh-Hans,zh,en`），回执同时给 `asked/tried/default/chain/onMissing`；`overrideMerge` 记录 declared vs caller |
| F24 身份推导 fail-closed | **具备** | `kernel/identity.js:79,101,110,143,148` | 未知成员具名拒；`principalBinding=required` 而宿主未给主体 ⇒ 具名拒（不猜身份）；不可信 issuer、超成员上限均具名拒 |

**处置建议（★ R5 现状：本组 5 条**全部具备**，且 F22 的"行为断言"已升级为**可证伪**并**推广到第二个面**）**：F20–F24 无缺失；F22 ⇒ 已补**变异证明**（R4：`tests/audit-prompt-behaviour.mutants.mjs` 三处单点变异各自让指定断言变红；后按共享范式迁移到 `tests/_lib/falsify.mjs`）；R5 又把同一范式**推广到 chat 配额**（`tests/vmu-chat-quota.mutants.mjs`：配额检查从不触发／off-by-one／回执错名三个变异各改变可观测读数，且库的 `MUTATION-NOT-APPLIED` 守卫**当场抓到我自己的歧义锚点**）。

## 4. F25–F34 共识／表决

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F25 门槛单一来源 | **具备** | `kernel/ballot.js:30`；`kernel/ballotbox.js:29` | 计票只接受注入的 `quorumRule`；门槛键集中在一处声明（`vmu.ballot.minVotes`、`minVotesRatio`） |
| F26 五种票型分离 | **部分** | `kernel/ballot.js:20`（FOR/AGAINST）＋`:206`（每票带 `kind`）；`kernel/ballotbox.js:17,21-25` | 票**带 `kind` 字段**且非决定票由设置门控（`abstainAllowed`/`abstainCountsForFloor`/`recusePublic`/`vetoMode`/`tieRule`），但**未见固定的"五种票型"枚举**；差异：票型由设置而非常量表定义 |
| F27 计量与裁定分离 | **具备** | `kernel/ballot.js:7-9,29-36,235` | 计票函数**只**返回 `true/false/undecided`＋reason，不改状态；"拒绝不动计票"是显式不变式（v5r s8-freeze-say 教训）；落定在 `tally()` 处单独发生 |
| F28 有界兜底具名可撤销 | **缺失** | 仅有 `kernel/meeting.js:181-184`（轮次超时具名拒） | 未找到"有界兜底决定"（lapse/默认裁定）；现有最接近的是轮次超时＋可 `reopen`，**不等价** |
| F29 单一盖章点 | **具备** | `kernel/ballot.js:151-160`（freeze/unfreeze）＋`:235`（落定） | 冻结期投片**具名拒且不记票**；落定只有一处产出 `outcome` |
| F30 复议只升不降 | **缺失**（键无读取者） | `kernel/ballotbox.js:61-65`；`kernel/ballot.js:241-244` | `reopen()` 保留历史 ✓，但 `vmu.ballot.reopenFloor` 代码自述"**本键现在【不能接线】…本面从不调用它**" ⇒ "只升不降"**没有实现**（设置面声明了、原语不读） |
| F31 原子队列 | **部分** | `kernel/ballot.js:206`（同步 `votes.set`） | 投片是同步内存写、状态唯一，**没有显式队列/串行化**；"原子"由单线程同步写结构性保证，不是机制 |
| F32 "刚刚定论"去重窗口 | **部分** | `kernel/meeting.js:370`（`deduped: true`） | 存在**重复举手**去重；未找到"刚刚定论"的时间窗去重 |
| F33 门禁只加在唯一收口点 | **具备** | `kernel/ballotbox.js:13`（具名拒集合）；`kernel/ballot.js:151` | 冻结/保密/弃权限制都落在**投片收口点**，以具名码拒绝而非分散判断 |
| F34 开启辩论的资格判据 | **部分** | `kernel/ballot.js:35-36`（eligible 全集未投 ⇒ `undecided`） | 有"谁有资格投票"的判据并影响结论；**"开启辩论的资格判据"本身**未单独找到 |

**处置建议（★ R5 现状：本表 **F26/F28/F30/F31/F32/F34 六条已全部改判【具备】**——见 §10.2 与 §10.6）**：F26 ⇒ **具备**（`ballot.js:38` `VOTE_KINDS` 五种＋`:41 classifyVote` 唯一分类点＋`:57 DECISIVE_KINDS`；`status().byKind/voteKinds`）；F28/F30 ⇒ **具备**（R4，见 §10.2）；F31 ⇒ **具备**（`ballot.js:189 castNow` 唯一临界区＋`:335` FIFO 包装＋`:432 status().gate.serialized`；**残余＝进程内**，跨进程耐久原子仍缺）；F32 ⇒ **具备**（`dedupWindowMs`，0＝零机制；只折叠同结论、折叠后仍须收束、有中间件 tally 时不猜）；F34 ⇒ **具备**（`openers`/`minEligible`/`requiresTarget` 三条件＋`status().openCriterion`）。自证：`tests/vmu-meeting-parity.test.mjs` **150/0**（我复跑确认）。

## 5. F35–F40 任务板／成果库

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F35 DAG 校验（自环＋整图环） | **缺失** | `kernel/tasks.js:119,164,178-179` | 依赖在**开工时**校验"是否满足"（`VMU_STATE` unmet dependencies），**未找到环检测**（自环/整图环 grep 全无命中） |
| F36 显式状态机拒非法迁移 | **具备** | `kernel/tasks.js:30-31` | `TRANSITIONS` 冻结表＋"表外迁移具名拒" |
| F37 行动项幂等键 | **具备** | `kernel/idempotency.js:1-4`；`kernel/tasks.js:321-330` | K6 台账："重放/重试的请求不得二次生效"，`VMU_IDEMPOTENCY_KEY_REUSED`；看板 `restore` 对同快照幂等、异快照拒绝 |
| F38 内容指纹回读而非重算 | **具备** | `kernel/idempotency.js:4`（自述"fingerprint is read back rather than recomputed"）；`kernel/records.js:97,111` | 指纹策略含 `content-only`/`content+display`，头部字段表冻结 |
| F39 写域建议明确 advisory | **缺失** | 仅 `kernel/arbitration.js:11,136`、`kernel/alerts.js:97` | 找到的 advisory 都是**别的语义**（仲裁只读放行、告警旁路）；**"写域建议"这个概念在 vmu 侧不存在** |
| F40 人读镜像与权威状态分离 | **具备** | `kernel/records.js:129`；`kernel/lean.js`（`writeMirror`） | 权威状态在注册表，人读镜像单独写，分歧被记录而非混同 |

**处置建议（★ R5 现状：本表 **F35、F39 两条已改判【具备】**）**：F35 ⇒ **具备**（`kernel/tasks.js:54-75` `export function findDependencyCycle(startId, deps, getDeps)`：返回**环路径**，`:75` 把**自环当长度 1 的环**；`:54` 注释记录改前形态"a cycle used to be constructible and simply never became ready"）；F39 ⇒ **具备**（`kernel/tasks.js:82-83` `normalizeWriteScope`＋`:180-182` `writeScopeConflicts()`——注释逐字写 *"The ADVISORY view … **Never refuses anything**"* ⇒ 明确 advisory）。自证套件 `tests/vmu-tasks-dag-and-scopes.test.mjs` **41/0**（我复跑确认）。

## 6. F43–F47 形式化／工具链

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F43 settle 判据三元组 | **具备** | `kernel/lean.js:18-25`（退出码＋哈希未变＋构建上下文未变）；超时 `:293-296` | `passed` 不是状态、只是"exit 0 且哈希未变"的**布尔结论**；`settled` 才落定；上下文变了 ⇒ `interrupted` + `build context changed` |
| F44 一键式公告＋长期查询路径 | **部分** | `kernel/publication.js:1,74-76`；`kernel/citations.js` | 有版本链/投稿包/归档登记（`offlineFirst`、`receiptRequired`、`targets`）；**未找到"一键公告＋长期查询"这一条完整路径** |
| F45 去重与 settle 同源 | **部分** | `kernel/mathjobs.js:111`（同 id 重铸 ⇒ 具名拒） | 存在**按作业 id** 的重复拒；但"去重与 settle 同源"未被证明为**同一来源** |
| F46 外部工具解析顺序可观测 | **具备** | `kernel/mathadapters.js:19-35,138` | 两个 seam 都注入；`PY_CANDIDATES = ['python3','python','py']` **顺序显式**；"装了但不在 PATH"由宿主 `resolveExecutable` 报告（vmu 不猜） |
| F47 能力探测＋两步安装＋审计 | **具备** | `math-computation.js:74`（`op:'probe'` 预检 ⇒ `op:'run'`）；`kernel/mathadapters.js:23`（install 计划路径）；`kernel/external.js:128`（声明键可被设置审计发现） | 探测、安装、审计三段都在，且探测结果含**许可**信息 |

**处置建议（★ R5 现状：F43/F46/F47 **维持具备**；F44/F45 由 reader-b 在代码里**再证一次**后**改判具备**——见 §10.7）**：F43 ⇒ 具备（`lean.js:345/422/424/428-429` 三元组＋恢复分支 `:602/651`）；F44 ⇒ **具备（本面）**（`pushNotice :215`／队列上限 `LEAN_NOTICE_MAX=20 :72`／`takeNoticesFor :219` **取出即移除**／长期查询 `status :500`＋`mirrors :762`）；F45 ⇒ **具备（形式化面）**（`dedupeKeyOf :307` 复用 **同一个** `contextHashOf :300`，即 settle 要复核的事实 ⇒ 结构上不可能漂移；**具名差异**：计算面故意不做内容去重，同 id 才拒 `VMU_MATH_JOB_ID_TAKEN`）；F46/F47 ⇒ 维持具备（`mathadapters.js:139 PY_CANDIDATES`／`:396` 顺序解析；`probe :471`＋plan→planToken→confirm 两步安装＋`shapeContract :718` 回显可审计）。**残余（具名 closed-by）**：把公告**注入下一次提示词**＝core 的回合管线消费点（接口就是 `takeNoticesFor(member)`）——本面不实现提示词注入。

## 7. F49–F53 可观测／可恢复

| 条目 | 判定 | file:line | 证据（实测） |
|---|---|---|---|
| F49 诊断面 | **具备** | `kernel/metrics.js:359`（`status()`）；`kernel/audit.js:10`（未登记 `what` 词汇会被 status 标记） | 有状态面与审计面，且**能报自己的异常词汇** |
| F50 "未知就说未知" | **具备** | `kernel/arbitration.js:169,209,407`；`kernel/alerts.js:444` | 未知对象/未知类别/未知目标**一律具名拒**并给出已知集合，从不静默取默认 |
| F51 重启标记 | **缺失** | 仅 `kernel/budget.js:9`（"重启无法重算的花费"）与 `ids.js`（id 不从 0 重启） | **未找到重启标记/世代号**；重启后能靠 resume/投影恢复**状态**，但没有"我重启过"的标记 |
| F52 一次性 future-only 活动等待器 | **缺失**（按 Lead 提示核过） | `kernel/control.js:132-142` | Lead 指的 `control.js:133` 两处命中**不是等待器**：那是 `tune()` 里的 `cfg()`/`str()` 校验。**结论：该原语不存在**（避免了一次"看行号就以为有"的误判） |
| F53 直接 fs 与策略 fs 的边界讲清 | **部分** | 直连 `node:fs` 仅 8 个模块：`host-math.js:24`、`vibe-math-vmu.js:39`、`kernel/{guard,index,lean,library,records,store}.js`；`kernel/storepolicy.js` **无 IO**（策略层）★ 该枚举是当时的读数、**已过期**（实测还含 `kernel/latex.js` 等 `node:fs/promises` 读者）：**清单以 `tests/audit-fs-purpose.test.mjs` 的扫描为准**，散文不写数字 | 边界**事实上存在**（策略层不碰 fs，IO 由注入缝/model 承担），但**没有显式声明或守卫**把它钉住 |

**处置建议（★ R5 现状：**F49/F50 具备（本轮被加厚）**、**F51 由"缺失"改判【具备】**、**F52 维持"缺失（原语不存在）"**、**F53 维持"部分"**——见 §10.7）**：F51 ⇒ **具备**（耐久标记本体＝`resume` 键的 `recoveries[]`（`{id,at,reason,interrupted,unhydrated,readBack}`，`keepRecoveries` 裁最旧）＋只读视图 `status().restart`＝`{generation,restarted,at,reason,…}`；**跨进程断言** `generation===2` 在 `tests/vmu-resume-lock-and-marks.test.mjs`（**我复跑 49/0**））；**唯一具名缺口**＝v5r 的 **`meetingOpen`（"会议开了未收束"）域标记**在 vmu 无等价物（需会议投影带 `open` 标记；owner＝会议面），**其余维持**：F52 ⇒ 缺失（R4 已核 `control.js` 那两处是 `tune()` 校验、**不是**等待器）；F53 ⇒ 部分（直连 fs 模块集合未变、策略层无 IO，仍缺显式声明）。

---

## 8. 我**没有**验证的部分（不要当成已验证）

1. **只在 vmu 侧取证**：R3 时 F8–F11 的"缺失"是**vmu 侧**缺失（★ R4 已补齐，见 §10.1）；**DSH 宿主**是否提供 `sendMessage`/`interrupt`，本文件不下结论（属真机面）。
2. **真机面**：R3 的判定均为**代码/单元面**证据；R4 做了一次真机回合（`tool/call` `vibe_vmu_status` @seq16 L134 ＋ `tool/result` @seq17 L135）；**R5 做了第二次真机回合并补齐 SLV §2/§4**——详见 `verify-round5-report.md` §A 与 `04-parity-matrix.md` **§9.1**。**R5 最终口径（含 vmu-assistant 的第三段真机会话）**：
   - **观测**：`session-84e91216…`，provider/model＝**`dsh-opencode-go`/`deepseek-v4.1-flash`**（两补丁都带 ✓）；`user/message` **L10 seq=8** 含「模拟测试」✓；**`tool/call` L18 seq=16 `vibe_vmu_status` ＋ `tool/result` L19 seq=17** ✓（**该面＝实测具备**）；tokens **32157**／cap 40000 **未触**。
   - **不支持（R5）／已闭合（R6）**：R5 时 `chat`／`panel`／`report` **未被发布**（模型原话：*"I only have vibe_vmu_status … The others don't exist. I should not fabricate."*）⇒ 当时判【未建立】，且是**发布问题、不是提示词问题**。**R6 已闭合**：core 的 task-41 让入口**同时接受嵌套/点号两形态**并对无法解析的键**具名告警＋计数自曝**；R6 真机会话（同一路由）**一次发布 52 个 `vibe_vmu_*` 面**并被**真调用 4 个面**（见下）⇒ **多面点亮＝实测具备**（详见 `04-parity-matrix.md` §9.1）。
   - ★ **R6 真机终态（SLV：seq＋行号）**：`session-4f62c01e…`；`user/message` **L10/seq8** 以「模拟测试 / SIMULATED TEST」开头 ✓；**`request/header` L13/seq11 ⇒ tools=78，其中 `vibe_vmu_*` ＝52 个面**（宿主真发给模型的载荷）；**5 对真调用/返回、4 个不同面**：`status` L18/seq16→L19/seq17、`chat` L20/seq18→L21/seq19、`panel` L22/seq20→L23/seq21、`report` L24/seq22→L25/seq23 与 L29/seq27→L30/seq28 ⇒ **≥3 面的验收达成**。
   - ⚠️ **NON-RESULT（如实）**：该**回合本身触发 `--max-tokens 40000` 上限被取消**（`totalTokens 70 488 > cap 40 000` ⇒ `session/cancel`；in 42 778／out 1 086／21 s）⇒ 按 playbook §8 **不是 PASS**；"发布与 5 对调用"是**取消前已完成**的观测事实。
   - **（R6b 历史 · 已被下一条 R7 取代；此处保留触顶经过与修法来路）** ★ **端到端交叉核对（声明真的到入口）**：R6a 会话 status 回执的 `settingsMerge.sources`＝4 个 overlay 键且 `source:'config'`、`keys=4`（R5 为 `sources:{}`／0）；**R6b（overlay v3 带一条真阈值报告）⇒ `keys=5`，多出 `vmu.report.reports:'config'`**，且 `report` 回执 **`declared:1, armed:1, problems:[]`** ⇒ **报告声明真的到入口并被武装**（R5 是 `declared:0`）。**面数**：两次会话 `request/header` 均 **tools=78／`vibe_vmu_*`＝52**（我程序化点数；vmu-assistant 已按此改正其文件中 51 的笔误）。**助手面三条（R6b 真机）**：**报告声明路径＝实测具备**；**阈值真开火＝未建立（NON-RESULT：`report tick` 未被调用，回合被上限切断；`declared=1` 已证声明到入口，机制未被证伪）**；**参数面（`vibe_vmu_set` 留痕）＝未行使**；**两条人设通道＝未行使**。⚠️ **第二次 NON-RESULT**：R6b 回合触 `--max-tokens 120 000` 被取消（`totalTokens 154 084 > cap`；in 42 699／out 409／**cacheRead 110 976**；`turn/end`＝`aborted/user`）——**根因是预算不是机制**：`vibe_vmu_status` 回执 49 929 字符，其后每步从缓存重读 ⇒ 第 5 步触顶。下一轮若要钉死后三条：**提高上限（≥400k）／精简系统面（更少面或不带 pack）／把 `status` 挪到最后或只取短 action／拆多次短会话**。
   - ★★ **R7 第 6 次会话：三条全部【实测具备】，且回合 `completed`（真正的 PASS）**——`session-55ab3f49…`：**① 阈值真开火**：`report tick`（**L24/seq22→L25/seq23**）回执 `declared:1, fired:[{name:"artifacts-threshold", trigger:"threshold", channel:"log", text:"【成果阈值】artifacts=9 已达阈值 5", delivered:false, drives:false, refused:{code:"VMU_REPORT_NO_TRANSPORT", message:"no delivery transport was injected: nothing was sent (and nothing is pretended)"}}], skipped:[], audit:{appended:true}, enforced:[11 键]`；**② 参数面留痕**：`vibe_vmu_set`（**L29/seq27→L30/seq28**）回执 `{"ok":true,"key":"vmu.turn.instituteName","value":"Slice-Institute","hot":"H2","who":"office","ownerCheck":"exempted (no \`by\` given: office path, DISCLOSED)","requiresRestart":false,"appliesFrom":"next session (restart required)","source":"runtime"}`（工具 schema 只收 `{key,value}` ⇒ 它**披露**而非掩饰）；**③ 两通道**：模型自述 *"I am the institute office (assistant/external interface), not a member, and I do not vote."*；`turn/end` **L50/seq48＝`{"kind":"completed"}`**。★ 前两轮的触顶取消**不再发生**（修法生效：把 49k 的 `status` 从第 1 步挪到最后 ＋ `--max-tokens 400000`）。**计数口径**：三次会话 `request/header` 均 **78／52**，**无分歧需要并列**。
   - **记账**：R5 3 次会话（≈71.8k）＋ R6 1 次（70.5k，未完成回合），均在授权与手册量级内。
   - **方法纪律**：`--dump-config` 是 loader 树、**不是**运行时定义 ⇒ 不能用字符串出现与否判定声明生效（R5**双向都误判过**：假阳性＝patch 原文当合并；假阴性＝dump 照不出注册期合并）；已写入 `vibe-math-vmu/docs/11 §4.2`，R6 并补上**正例**（`tests/audit-declaration-publishes-face.test.mjs` **28/0** 读 `ctx.tools.register`；其变异族 GREEN，M2＝关闭嵌套展平正是 R5 真故障形态）。
3. **`F16`/`F31`/`F33` 的"等价"判定**是我读代码后的**推理**（机制不同、性质成立），不是探针实测；若 Lead 要求"同名原语"，这三条应改判 `部分`。
4. **`file:line` 的时效**：本文件基于 Round 3 开工时的检出；若被并行改写，行号需重核（判定本身按符号名复核即可）。

---

## §10 Round 4 改判（实测·逐条；本节**取代**上文对应行）

> 方式同上：**读代码**取证（读者可见 file:line 复核），不转述文档。凡他人实测（reader-c）我**先 spot-check 其 file:line** 再记录，并注明"复核通过"。

### 10.1 子代理生命周期（改判 4 条）

| 条目 | R3 判定 | **R4 判定** | 证据（实测） |
|---|---|---|---|
| **F9** `sendMessage`（给在跑的子代理发消息） | 缺失 | **具备** ✓ | seam 在 `kernel/index.js:263`（`sendMessage = null, interrupt = null`）声明、`:954/975` 解析并暴露、`:1779-1782` 由 `status()` 自曝 `sendMessage: !!seam` ＋ `sendMessageConsumedBy: ['kernel/turn/index.js (sendToMember)']`，缺 seam 时给**具名 note**；消费点在 `kernel/turn/index.js:207-225`（`sendToMember`：无 seam ⇒ `VMU_ENGINE_UNAVAILABLE`；缺 sender/targetId ⇒ 具名拒；再调 `subagents.sendMessage(sender, targetId, blocks, signal)`） |
| **F10** `interrupt`（中断在跑的子代理） | 缺失 | **具备** ✓ | seam 同处声明（`kernel/index.js:261-263` 注释点名 `interruptViaSubagents`）、`:955/976` 解析暴露、`:1783` 自曝 `interrupt: !!seam`；消费点 `kernel/turn/index.js`（`interruptMember`）。**另**：会议侧的"中断发言"是 `kernel/meetings.js:619 interrupt({meeting,member,target,at})`（不同层的同名能力，已在代码里分开） |
| **F17** 子进程 `graceMs` 真 terminate ＋ 输出上限 | 缺失（具名） | **部分 → 条件具备** ⚠️ | `kernel/lean.js:375-376` 把 `graceMs` 作为**请求**传给宿主；`:409-410` 宿主**给了 handle 接缝** ⇒ 报 `terminated:true`（"已 **terminate** 子进程"），没给 ⇒ **具名**写"无法 terminate，只把作业结算为 timeout，进程可能仍在跑"（不假装）；`:124` 说明预算真能 terminate 时 `terminated` 是事实而非声称。输出上限＝新键 `vmu.math.captureStdoutBytes`（`lean.js:67` WIRED ＋ `:166` 真读；见 §10.3）。**改判条件**：宿主 handle 接缝缺席时仍是"无法终止" |
| **F18** 锁在 `finally` 释放 | 部分 | **具备** ✓ | 仓内**出现真实使用者**：`kernel/resume.js:692-713 acquireRecoveryLock()`，释放点 `:761-762 } finally { if (acquired !== null) releaseRecoveryLock() }` —— 注释（`:688-690`）明确它覆盖**快乐路径／每个 early return／每次 throw**，且 `vmu.store.lock` 未声明时是**零机制直通**（`locked:false`）但**仍调用 release**，并自曝 `acquisitions/releases/busyRefusals` 让"一个形状、永不漏放"可核；独占失败 ⇒ 具名拒 `CODE.busy` |
| **F11** 回合结束带 `childId`＋`stopReason` | 缺失（R3：全包 0 命中） | **具备** ✓（**Round 4 由实现改判**，Lead 授权） | `kernel/turn/index.js:174-186`：`deliverViaSubagents` 的返回从**裸字符串**改为**生命周期信封** `{ reply, childId, stopReason, attribution }` —— `childId` 取 `childIdOf(handle)`，`stopReason` 依次尝试 `handle.stopReason` → `handle.reason` → `await handle.result`（`result` 是 thenable 时才等），并给出**可读的 `attribution`**说明这两个字段**来自哪里**；取不到时 attribution 明写"只有 childId／宿主 handle 没带 stopReason"，**不假装**。三处**具名拒**保留（无缝／extractor 无文本／handle 无 reply）⇒ 与 F9/F10 合起来是"启动＋持续指挥＋可归属"的完整生命周期。我本轮已把 `tests/vmu-round1-seams.test.mjs` 的断言改为新形状**并补上"无缝 ⇒ `VMU_ENGINE_UNAVAILABLE`"的负半**（40/0） |

### 10.2 共识／表决（reader-c 实测，我 spot-check 后记录）

| 条目 | R3 判定 | **R4 判定** | 证据（实测；我复核过标注的行） |
|---|---|---|---|
| **F28** 有界兜底具名可撤销 | 缺失 | **具备** ✓ | `kernel/meetings.js:331 LAPSE_NAME='meeting-lapse'`（**复核 ✓**）、`:336 lapseDue({meeting,at?})`（派生谓词，界＝`vmu.meetings.hardLimitMs`，`enforced:[…]`）、`:348 lapse({meeting,by?})` ⇒ `{name,why,at,revocable:true}` 写 `m.lapse`＋纪要＋`status().lapsedMeetings/lapses`，未到期**具名拒**；fail-closed 单点 `:231 requireMeeting`（动作面拒、读面 `{readOnly:true}` 放行）；**可撤销** `:370 revokeLapse`（**必须给理由** `VMU_REASON_REQUIRED`，append-only 保留原记录）。表决侧同形：`kernel/ballotbox.js` 的 `lapseDue/lapse/revokeLapse`，界＝构造参数 `openMaxMs`（0＝零机制），到期置 `lapsed` 且 `outcome:null`（不发明结论）。reader-c 实测 `vmu-meeting-parity` **130/0 exit 0** |
| **F30** 复议只升不降 | 缺失（键无读取者） | **具备（门槛维度）** ✓＋2 条残余仍 PLANNED | `kernel/ballotbox.js:123 reopenFloor: n('vmu.ballot.reopenFloor', 0)`（**复核 ✓**，该键已从 `PLANNED_BALLOT_KEYS` 移入 `WIRED_BALLOT_KEYS`）、`reopen()` 真读并决定：不达门槛 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET`（带当前/门槛、`enforced:['vmu.ballot.reopenFloor']`），旧结论先入 `reopenHistory` 再清票（只增不改）。**残余**：`reopenInitiatorScope`／`reopenSameMeetingOnly` 仍 PLANNED（需动议/会期上下文，理由已具名）。reader-c 实测 `vmu-ballotbox` **13/0 exit 0** |
| **F25** 门槛单一来源 | 具备（维持） | **具备** ✓（行号更新） | `kernel/ballot.js:30 defaultTally({votes,eligible,quorumRule})`；`:99 quorumRule='m-unanimous'` 构造注入；`kernel/ballotbox.js:114-115 minVotes/minVotesRatio` 集中；新增 `:123 reopenFloor` 属同一"已声明门槛"族 |
| **F31** 原子队列 | 部分 | **具备（R5 显式队列 → R6 跨进程耐久原子）** ✓ | **R5**：`kernel/ballot.js:189 castNow`（唯一临界区）＋`:335 cast`（同一条 **FIFO 链**包装）＋`status().gate={serialized,pending,commits}`；原判差在"没有显式串行化"，而这不是纯形式问题——`cast` 内会 `await bus.emit(...)` ⇒ 两票并发可在"查重"与落盘之间交错。**R6（reader-c 交付，我已复核）**：`kernel/ballot.js:139-152 createDurableCommitLog({store,clock,name})` 把闸门升成**协议**：① **ticket 由 store 分配**（`store.append(rec)` 须回 `{ticket}`，如 O_APPEND／SQLite／加锁日志 ⇒ 共享同一 store 的两个进程得到**互不相同且单调**的 ticket；store 不回 ticket 才退回本地计数并在 `status().numbering` 明说"每进程"）；② **意图先于生效**（`reserve(op)`→apply→`complete(rec,outcome)`，崩溃窗口内意图留在日志）；③ **恢复不双花**（`reconcile()` 按 ticket 序重放未完成意图，**已 done 的 ticket 跳过**、**幂等**、恢复票 `recovered:true` 且真能定论）；④ **缺席自曝**（无 store ⇒ `durable:false`、`reserve()`→`null`、`reconcile()` 明说无可恢复）；⑤ 可观测 `status().gate={serialized,pending,commits,durable,log}`。**实测**：★我复跑 `tests/vmu-meeting-parity.test.mjs` ⇒ **162 passed / 0 failed EXIT=0**（§18 为其 12 条断言）。**残余（具名）**：① host 需提供**分配型 store**（协议与恢复路径已完备，缺的只是宿主一个 store）；② `ballotbox`／`mailbox` 的队列可照同三行接上；③ 跨进程"写者隔离"由 store 的原子 append 保证，本面只定义协议 |

### 10.3 本轮新增的一条"键变更"（连带改判）

`vmu.math.captureStdoutBytes`：`kernel/lean.js:67`（WIRED_KEYS）＋`:166`（`Number(readKey('vmu.math.captureStdoutBytes'))`）——F17 的输出上限。⇒ Lean 面 `keysUsed()` 由 12 → **13**，`tests/vmu-kernel.test.mjs:439-449` 的期望集合已同步（改为 `LEAN_KEYS ＋ JOBS_KEYS ＋ OUTPUT_KEYS` 三条具名清单 **派生**总数，**再写死数字的教训已两次**）。vmu-pack 说明：该键是**机制旋钮**（schema 默认 65536，mathjobs/lean 共用常量），**不是** pack 机构偏好 ⇒ **不**记为"pack 默认值缺失"。

### 10.4 改判后的组内统计（仅这四组）

| 组 | R3（具备/部分/缺失） | **R4（具备/部分/缺失）** | 变化 |
|---|---|---|---|
| F8–F14 子代理生命周期 | 3/1/3 | **6/1/0** | F9、F10、**F11**：缺失→具备（Round 4 由实现改判，Lead 授权） |
| F15–F18 定时与并发 | 2/1/1 | **3/0/1** | F18：部分→具备（F17 由"缺失（具名）"改为"条件具备"，归入部分） |
| F25–F34 共识／表决 | 5/3/2 | **7/2/1** | F28、F30：缺失→具备 |
| **42 条总计** | 24/8/10 | **25/8/9**（Lead 裁决口径：计入 **F11 缺失→具备**；上表其余组内改判见各行） | **Round 4 由实现改判**；详见 `verify-round4-report.md` §B |

### 10.5 F15／F16 改判（vmu-activity 的 task-32 实测；**我逐条 spot-check 通过后记录**）

> 复核证据（我跑的）：`kernel/scheduler.js:136` `reentrantDeferred`、`:138 let ticking = false`（注释自称 *the trampoline guard*）、`:139 rerunRequested`、`:248 tickPass(when)`、`:394-396`（重入⇒**延迟收据**且计数上报）；`kernel/mathjobs.js:118`（默认 seam 直接返回 `setTimeout` 的 handle）、`:132/155 timerDisposer`、`:170` 的 `catch { already settled }`；`host-spawn.js:66/180`（预算 `delay` 无取消路径）。套件复跑：`vmu-activity-timers` **38/0**、`vmu-activity-falsify-lib` **17/0**、`vmu-scheduler` **111/0**（既有契约未变）。

| 条目 | R3 判定 | **R4 判定** | 证据（实测；★＝我复核过） |
|---|---|---|---|
| **F15** 可注销定时器（每个分支都清理） | 具备 | **具备（仅剩 1 处具名未修）** ✓ | 推导清单（`tests/vmu-activity-timers.test.mjs §1`：**代码-only 扫描 6 文件 8 站点**，`setInterval` **0**，新站点不分类即红）：★`kernel/bus.js:382-384`（hook 预算定时器在 `finally` 清，成功/超时两分支实测 armed Timeout 数不变）；★`kernel/activity.js:120,386-402`（五条路都过唯一 `cleanup()`）；★`kernel/scheduler.js:491-515`（fire 分支**本轮修好**：原先既不 `clear` 也不从 `handles` 删 ⇒ 周期性条目触发一次后再也无法 `arm()`，实测）。★**R3 的 3 处具名未修 → 其中 2 处在 Round 4 由 reader-b 修好（我逐行复核）**：①`kernel/mathjobs.js`：`:125-126` 默认 seam 现在返回**真 disposer**（`() => clearTimeout(h)`）、`:132-133` `disposeTimer` 还能清裸 `Timeout`、`:190-191` 清不掉时 `cleanupFailed` ＋ `timer-cleanup-failed` **具名上报**（vmu-activity 已把探针翻面为**回归守卫**，读数 `{timers:1,clears:2}`）；②`host-spawn.js`：`:49 DEFAULT_DELAY`、`:191-192` 预算定时器**持句柄**并 `unref()`、`:216-224` `finally` 清理且清不掉时 **`VMU_SPAWN_TIMER_CLEANUP` 具名**（读数 `{timers:2,clears:1}`）；③**仍开放 1 处**：`math-computation.js:617,728` 两处**无句柄 sleep**。**集成缺口（具名，未变）**：全仓**没有** `scheduler.arm()/tick()/disarm()` 的**生产调用者**（`tools/control.js` 无 scheduler 动作）⇒ 定时器路径目前**只由测试驱动** |
| **F16** 调度 trampoline | 具备（"等价形态"——我当时明说是**读码推理**） | **具备（真 trampoline）** ✓ | ★`kernel/scheduler.js:248 tickPass(when)` 是**唯一一趟**；`tick()` 用 `ticking/rerunRequested` 把**重入**变成**下一趟**：实测重入一次 ⇒ `passes=2, reentrantDeferred=1, firedCount=1, runs=1`（**不递归、不双触发、错过的不丢**）；一趟内 3 次重入折叠成 1 趟（`passes=2, deferred=3`）；普通 tick 仍 `passes=1`；三个计数由每份回执与 `status()` 上报。**改前实测**：无守卫时同步重入会**栈溢出** ⇒ R3 的"防重入只是没调用者的巧合"被证伪并被修复 |

**⇒ R3 §8 里"F16 是等价推理判定、若要求同名原语应改判部分"的保留意见可以撤回**：现在有**同名原语**（trampoline guard）＋实测计数。

**可复用范式（task-32 C）**：`tests/_lib/falsify.mjs`（复制模块→注入缺陷→导入副本→同一探针：真模块必绿、变异体必红、**读数必须不同**；五个防自欺守卫各带拒绝码：`MUTATION-NOT-APPLIED`／`MUTANT-UNIMPORTABLE`／`REAL-MODULE-NOT-GREEN`／`PROBE-DOES-NOT-DISCRIMINATE`／`UNSAFE-TMP-DIR`／`TEMP-NOT-CLEANED`；API＝`falsify({name,module,mutations,probe})`；可跑示例 `tests/vmu-activity-falsify-lib.test.mjs` **17/0**）。**（已执行，非建议）** `tests/audit-prompt-behaviour.mutants.mjs` 已**迁移到该库**：同一份四处行为事实的探针 ＋ 三处单点变异（`find`/`replace` 由库断言"锚点必须命中"），每处仍**点名**它必须打破的那条事实 ⇒ 实测 **GREEN**（控制组绿、三变异各自 `overrideInEffect`／`bindingOnStateIgnored`／`rollbackRestores` 变红、库自判 `ok`＝全部"已应用/可导入/有区分/已清理"）。⇒ 全仓**只有一套**变异范式，且 F22 的证明强于迁移前（多了"探针必须有区分度"与"临时目录安全/清理"两条守卫）。

### 10.6 R5 改判（Round 5 实测；逐条 `file:line`）

> 本节与 §10.2／§10.5 并列，**取代上面对应主表行**。凡队友实测（reader-a/b/c）我先**核过其关键锚点或复跑其套件**再记录。

| 条目 | R4 判定 | **R5 判定** | 证据（实测；★＝我复核/复跑过） |
|---|---|---|---|
| **F26** 五种票型分离 | 部分 | **具备** ✓ | ★`kernel/ballot.js:38` `export const VOTE_KINDS = Object.freeze(['for','against','abstain','unable','estimate'])`（**恰好五种**）；★`:41 export function classifyVote(value, kind)`（**唯一分类点**，纯函数）；★`:57 DECISIVE_KINDS = ['for','against','decisive']`（m 计票只认 for/against）；`status().byKind` 五类分开计数、`status().voteKinds` 报词汇；`kind:'process'` **不是第六种票**（过程读数另走一条通道、仍被排除在定论外）。判据语义：`{kind:'estimate'}`＋严格 0<x<1 ⇒ estimate；**未声明的 0.4 当 decisive 用仍按 m-vote 规则具名拒**（不悄悄改判） |
| **F31** 原子队列 | 部分 | **具备** ✓ | ★`ballot.js:189 const castNow = async (…)`（**唯一临界区**）＋★`:335 async cast(…)`（只做**同一条 FIFO 链**的包装）＋★`:432 status().gate = {serialized:true, pending, commits}`。**为什么原判不是纯形式问题**：`cast` 会 `await bus.emit('ballot/cast', …)` ⇒ 两票并发可在"查重"与落盘之间交错（都过 `votes.has`，后者覆盖前者）；现断言＝同成员两票并发 ⇒ **恰一票被接受**、`gate.commits===2`；不同成员 ⇒ 两票都落。**残余具名**：闸门**进程内**，跨进程/跨写者耐久原子仍不在本面（快照把在飞队列列入 `skipped: commit-gate`） |
| **F32** "刚刚定论"去重窗口 | 部分 | **具备** ✓ | 构造参数 `dedupWindowMs`（**0＝零机制**）；`close()` 窗口分支维护 `lastClose`；`status().dedup = {windowMs, foldedVerdicts, lastClose}`；快照携带 `lastClose/dedupedVerdicts` ⇒ **重启后窗口仍生效**。三条诚信边界：①**只有同结论折叠**，窗口内不同结论**永不折叠**；②折叠后**仍必须收束**（`state='tallied'`＋`outcome`）——初版折叠后停在 `open` 还能继续收票，是自查抓到的**真 bug**；③有中间件 tally（`bus`）时**不猜**、跳过折叠 |
| **F34** 开启辩论的资格判据 | 部分 | **具备** ✓ | `open({by})` 三个**已声明**条件：`openers`（null＝任何人；数组＝具名开启人）⇒ 非开启人 `VMU_NOT_PERMITTED`；`minEligible`（>0）⇒ 选民团不足 `VMU_STATE`（带现值/下限）；`requiresTarget` ⇒ 无标的 `VMU_INVALID_ARGUMENT`；`status().openCriterion`（含 `satisfied`）在**撞上之前**可见；默认宽松＝零机制。顺带修掉的暗礁：`close()` 后 `open()` 原会**带旧票重开** ⇒ 现对 `state==='tallied'` **具名拒**并指向 `reopen()` |
| **F35** DAG 环检测 | 缺失 | **具备** ✓ | ★`kernel/tasks.js:54-75 export function findDependencyCycle(startId, deps, getDeps)`：返回**环路径**，`:75` 把**自环当长度 1 的环**；`:54` 注释记录改前形态（"a cycle used to be constructible and simply never became ready — a silent …"） |
| **F39** 写域建议 advisory | 缺失 | **具备** ✓ | ★`kernel/tasks.js:82-83 export function normalizeWriteScope(raw)`（注释："F39 (Round 5): the team-board scope contract …"）；★`:180-182 function writeScopeConflicts()` —— 注释**逐字**写 *"The ADVISORY view … **Never refuses anything**"*；`status()` 报 `writeScopes`/`writeScopeConflicts` |
| **F49** 诊断面 | 具备 | **具备（R5 加厚）** ✓ | 既有 `metrics.js:359`／`audit.js:10`；R5 追加：`resume.js` 的 `status()` 报 `projection.{degraded,unhydratedKeys}`、`lock.{attached,held,acquisitions,releases,busyRefusals,lastError}`、`restart{…}`、`phase`、三端口状态、`writes/writesThrough/writeThroughFailures/writeRefusals/readBacks/readBackFailures`；`tasks.js` 报 `dag`/`writeScopes`/`writeScopeConflicts`；`human.js` 报 `queue()` 与 `gateAttempts/gateQueued/gateAllowed/gateDenied/queueDropped` |
| **F50** "未知就说未知" | 具备 | **具备（R5 补三类）** ✓ | 既有 `arbitration.js:169/209/407`、`alerts.js:444`；R5 追加三类"缺席即具名"：**可选端口缺席**＝`VMU_RESUME_MAILBOX_UNAVAILABLE`／`VMU_RESUME_CHILDREN_UNAVAILABLE`（`status()` 里 `attached:false`，**不使恢复失败、不猜**）；**未水合**＝`VMU_RESUME_NO_ADAPTER`／`VMU_RESUME_PROJECTION_GAP`；**id 计数器未绑定**＝`ids.status().durable=false`（不假装持久） |
| **F51** 重启标记 | 缺失 | **具备** ✓ | 耐久标记本体：每次 `recover()` 向 `resume` 键的 `recoveries[]` 追加 `{id,at,reason,interrupted,unhydrated,readBack}`（`keepRecoveries` 裁最旧）；只读视图 `status().restart`／`resume.restart()` ＝ `{generation,restarted,at,reason,interrupted,unhydrated,missingChildren,readBack,phase,durableKey}`；**跨进程断言** `generation===2`（**耐久计数，非进程计数**）⇒ ★我复跑 `tests/vmu-resume-lock-and-marks.test.mjs` **49/0 EXIT=0**。**唯一具名缺口**：v5r 的 **`meetingOpen`**（"会议开了未收束"）在 vmu **无等价物**（需会议投影带 `open` 标记；owner＝会议面）；`activity.js` 的 generation 是**一次性等待器**的世代，**有意不持久** |

**旁证（reader-b 的 F43–F47 再证；见 §6 主表行已同步）**：F43 三元组 `lean.js:345/422/424/428-429`（＋恢复分支 `:602/651` 的 `exitCode===0 && hashUnchanged && 回执 && ctxSame && contentMatches`）；F44 `pushNotice :215`／`LEAN_NOTICE_MAX=20 :72`／`takeNoticesFor :219` 取出即移除 ⇒ 同成员再取为 `[]`；F45 `dedupeKeyOf :307` 复用 `contextHashOf :300`（＝settle 复核的同一事实）；F46 `mathadapters.js:139 PY_CANDIDATES`／`:396` 顺序解析；F47 `probe :471`＋两步安装＋`shapeContract :718`。

**R5 新增可证伪族（D 项）**：`tests/vmu-chat-quota.mutants.mjs` ⇒ **GREEN**（控制组：真面按名拒超配额、配额内两条被接受；三变异：配额检查从不触发／off-by-one／回执错名 ⇒ 各改变可观测读数；库自判 `ok`）。★ 过程中该库的 **`MUTATION-NOT-APPLIED` 当场抓到我自己的歧义锚点**（`used >= limit` 在 `send` 与 `maySpeak` 各一处）⇒ 现声明 `occurrences: 2`（两处一起变异才是真缺陷）。

### 10.7 R6 目标终判摘要（reader-a 目标 1／reader-c 目标 2；主交付 `06-goal1-verdict.md`／`08-goal2-verdict.md`）

**目标 1（断点续跑 ＋ 人工干预）＝具备（3 处具名小缺口）**
- **断点续跑**：23 条里 **18 条具备/超集**（★ 5 条是 v5r 的**超集**：写前必读闸、read-back 一致性、恢复独占锁、耐久重启标记/世代号、子代对账）；**2 条部分**（重派缺失成员＝**策略**不在引擎；未 ack 邮件计数＝**端口未接，一行可补**）；**1 条 N/A 有理由**（v5r 看门狗时钟刷新：vmu 无持久在飞时钟，`kernel/**` 对 `lastInputAt|lastVoteAt` **零命中**）。
- **人工干预**：12 条里 **10 条具备/超集**（★ 3 条 v5r **完全没实现**：真闸门、跨重启审批/否决台账、否决解除）；**1 条部分**（成员→所办收件箱聚合：通道有＝`mailbox` 的 `office` kind ＋ `arbitration.escalate({to:'office'})`，缺 v5r 式**带上限的单一聚合面**，**主干由审批队列承担**）；0 缺失。
- **新增证据**：`tests/vmu-resume-lock-and-marks.test.mjs` ★我复跑 **54/0**（新增 `status().inflight`＝v5r `pendingWork` 等价、`status().ports`、`roster` 端口驱动子代对账）；`tests/vmu-human-gate.test.mjs` ★我复跑 **75/0**（含 `vibe_vmu_human {action:'inject'}`：经 `chat`/`mailbox` 面转发、**面级拒绝原样透传**、两面未挂 ⇒ 具名 `VMU_ENGINE_UNAVAILABLE`）。
- ★ **缺陷类（已修，值得记入方法论）**：`recoverUnlocked` 的局部变量 `roster` **遮蔽注入的 `roster` 端口** ⇒ 子代对账永远 `checked:0`；与 Round 4 的 `snapshot` 遮蔽**同型**（"局部变量遮蔽注入端口"）⇒ 建议作为一类静态检查对象。

**目标 2（会议／通信／协作）＝具备**
- **v5r 实现层**：代码真有的 **14 条会议命令 ⇒ vmu 14/14 具备**（＋7 条 ≈ 变形全部具备或更强）；群聊四要素具备；**管理员／发言次数／按人禁言 v5r 代码里根本没有**（`v5r-inventory-c:623-625,661-662`）⇒ vmu 有＝**加分**；私信具备；状态面板具备且多 `subtasks`。
- **设计层 42 条**：v5r 自身只实现 14 ✅＋7 ≈＋21 ✗ ⇒ vmu **具备 ≈26／部分 ≈11／缺 ≈5**；**"支持 v5r 全部功能"＝是（有余量）；"支持设计文档全部功能"＝否（v5r 自身也不满足）**；缺口 G1–G9 具名（**G1＝私聊补记到公开面 `supplementOf` 未实现**）。
- ★ **F31 再升一档**（R6）：`kernel/ballot.js:139-152 createDurableCommitLog` ⇒ **跨进程耐久原子**（见 §10.6 F31 行；★ 我复跑 `vmu-meeting-parity` **162/0**）。

### 10.8 R6 目标终判摘要（vmu-pack 目标 4／reader-b 目标 5）

**目标 4（pack 与清单一致性）＝一致（无"框架与 pack 都缺"的行）**
- 125 行里：**① pack 真声明 47 个 `vmu.*` 键**直接承载约 35 行；**② 其余约 89 行＝框架具备、pack 未声明（取默认值／默认不启用）⇒ 不是缺口**；**③ 真缺口 1 条子项 ＋ 1 个孤儿键**。
- **真缺口**：`M-A04` 子项 —— **`vmu.paper.*` 无轮次上限键、`kernel/paper.js` 无 `maxRounds` 读点** ⇒ 该项"可覆盖轮次/引擎"措辞**撤回或先加键**（owner＝core）。
- **孤儿键**：**`vmu.meetings.reconsiderFloor`**（schema ＋ v5r 清单 `packs/v5r/prompts/v5r-core.js:78` 各一处，**全仓零读者**）vs 真生效的 **`vmu.ballot.reopenFloor`**（读者 `kernel/ballotbox.js:22,41,137`）⇒ 删一行或让 `ballotbox.reopen()` 真读，二选一。
- 4 处"真名是 X"（不是缺口）与 34 行改判清单见矩阵 **§9.3**（以该节为准）。

**目标 5（数学引擎深度）＝同级或超过 v5r**
- **引擎适配**：共享模块与 v5r **逐字节同源**，并**新增四库专用适配面**（`kernel/mathadapters.js`：六型 `SHAPE_KINDS`、会话级环境绑定、探测/执行全注入接缝、未装 ⇒ `VMU_MATH_LIB_UNAVAILABLE`＋安装命令、未知形状 ⇒ `VMU_MATH_SHAPE_UNKNOWN`）。
- **四库真机硬证据**（四命令全 EXIT=0）：numpy 2.5.3（`det`→scalar −2.0000000000000004；reshape→array int64[2,3]）／scipy 1.18.1（`minimize`→result `success:true`；`quad`→0.8862269254527579）／pandas 3.0.6（`DataFrame`→frame `columns[a,b]`）／sympy 1.14.0（`simplify(sqrt(8))`→expr latex `2\sqrt{2}`；`solve(x²=4)`→array `["-2","2"]`）。**诚实边界**：符号解列表归 `array`（元素字符串化）⇒ `kind` **区分不了"符号解列表/数值数组"**；改判条件＝加 `kind:'exprList'` 之类（**接口变更，需 verify 同步**）。
- **作业持久化/断点续算＝超过 v5r**（v5r 计算面**完全没有**持久化）。
- **R6 落地**：`cancel({jobId})` 变**真取消**（per-call `onHandle` ⇒ 有 handle 就 `terminate()`，无则**具名**说"无法 terminate"）；Lean 新增 `cancel`（映射 `interrupted`＋`reason:'cancelled'`，**不新增状态**）；`dispose()` 由"无条件 killed:0"升级为"能杀就杀＋计数"；`queued` 可取消且**一次都不 spawn**；新增 `submit({async:true})`。
- ★ **缺陷类（已修）**：并发上限旧比较式 **`running() > maxParallel` 在上限 1 时会同时跑 2 个** ⇒ 改 **`while (running() >= c.maxParallel) await …`**（`kernel/mathjobs.js:525`，注释 `:427-428` 记录旧式）＋峰值并发实测；`tests/vmu-job-cancel.test.mjs` ★我复跑 **7/0**、`vmu-lean-killable` ★**7/0**。
- **两处"部分"（具名，需他人卷）**：① **Lean 面镜像未接线**（`kernel/index.js:567` 未传 `fs` ⇒ 生产路径 `admission().fileMirror=false`；改判条件＝core 一行）；② **F17 终止在生产路径由 host-spawn 预算＋宿主 `graceMs` 完成**（进程会被杀），但**面层看不到 handle** ⇒ `terminated:false`（改判条件＝把宿主原生 `spawn`/`spawnHandle` 传给三个面）。★ R7 已闭合：`vmu.paper.maxRounds`＋真读者 `revise()`（探针 11/0）、孤儿键 `vmu.meetings.reconsiderFloor` **已删除**、**Lean 镜像＋killable `spawnHandle` 已接生产路径**（`kernel/index.js:1027` 接 `takeNoticesFor`）。

### 10.9 R7 目标终判与保真回填（core 目标 3／reader-a 目标 1 收紧／vmu-pack 保真）

**目标 3（原语是否够强）＝够强：足以实现 v5r 的全部功能** —— 原语面 **42 条 ⇒ 具备 41／部分 1／缺失 0**（唯一"部分"＝**F13**：未知名 fail-closed，与 v5r 的容错跳过**刻意相反且更安全**）；另有 5 处具名残余 ＋ 1 处性质等价保留（F33）。交付 `_handoff/vmu/10-goal3-final.md`（core task-54）。
- ★★ **两条旧判被"搜索范围"推翻（不是实现变化）**：**F52** 旧判"缺失"是按别人给的 `control.js:133` 行号搜的；**真实现是 Round 3 落地的 `kernel/activity.js`**（头注 "ONE-SHOT, FUTURE-ONLY … v5r C-56 / F52"；`:21-23` disposer 全分支＋`status().disposersCalled`）＋注册 `kernel/index.js:1170` ＋工具面 `host.js:137`（`vibe_vmu_wait`）／`:236` ⇒ **具备**。**F53** 旧判"部分"；R6 已在 `docs/03:100` 显式声明边界、直连 `node:fs` 降到 **5** 处 ⇒ **具备**（残余＝无自动门禁 ⇒ **R7 由我落地** `tests/audit-fs-purpose.test.mjs` **10/0**）。
- ★ **教训（已写入 `docs/11`）**：**按"提示的行号"找原语会漏掉后落地的新模块 —— 应按语义关键词全仓搜**；"有规则"不算覆盖，"**能拒绝一个真实违规**"才算（F53 门禁用"种违规 ⇒ 红、删掉 ⇒ 绿"证明有牙）。

**目标 1（R7 收紧）＝具备（2 处具名小缺口）** —— reader-a task-52 把两项从缺口转为**已闭合**：① **未 ack 邮件计数**（`ack()` 从 `boxes` 摘除 `kernel/mailbox.js:363` ⇒ 无端口时直读耐久 `mailbox` 键，计入 `status().inflight.unackedMail`＋`unackedMailSource`；两者皆无 ⇒ **具名** `VMU_RESUME_MAILBOX_UNAVAILABLE` 且 `unackedMail=null`，**不是假 0**）；② **重派缺失成员**（`createResume({reassign:{maxAttempts,apply}})` 声明面，**不声明＝零机制**，尝试次数**耐久写进 `resume` 键**、跨重启生效、失败也耗配额 ⇒ `status().reassign` 可读）。★ 我复跑 `tests/vmu-resume-lock-and-marks.test.mjs` **67/0**、`vmu-human-gate` **75/0**、`vmu-resume-recovery` **73/0**。**剩余 2 处**：多实例注册表；watchdogs 装配（端口在、未接，如实自曝）。**看门狗刷新＝N/A 有理由（证据加强）**：`grep lastInputAt|lastVoteAt|watchdogAt|heartbeatAt|inflightSince` over `kernel/*.js` **零命中**；`meetinglapse.js` 是**纯规则**（头注 "no clock, no store, no bus"），lapse 状态在 `meetings.js:517/:1021` 且可 `revokeLapse({by,reason})`（理由必填）⇒ v5r 的"把钟往后刷"在 vmu 无必要。

**目标 4 保真（vmu-pack task-55；矩阵 §9.3 引用）** —— 以 v5r `DEFAULT_PARAMS`（`:1062-1183`）为一手证据逐项对照，分三类：**① v5r 那样跑且框架默认不同 ⇒ pack 必须声明：4 项**（`vmu.turn.selfCheck` **false**＝`:1122`，原 true 会注入 v5r 从不发的【资源】段；新增 `vmu.control.idleAfterMs` **120000**＝`:1082`，读者 `kernel/control.js:65,206`；`vmu.paper.maxRounds` **3**＝`:229`；**删除** `vmu.limits.maxLiveMembers`——v5r 在活上限是 `maxLiveChildren:0`＝不设）；**② 框架默认＝v5r ⇒ 不必声明：30 余项**（含 16 个 pack 显式"复述默认"）；**③ v5r 有、vmu 无键／有意分歧：6 类**（含 **`paperEditor:'academician'`**——`vmu.paper.finalizer` 值域只有 `['editor','contributor','any']`（`kernel/paper.js:69`）⇒ 曾**静默回落**；★ **R8 已修（两半都核过）**：`settings/schema.js:997` 改 `type:'enum', domain:[…]`（doc 明写"域外值 ⇒ 具名拒、绝不静默回落"）＋ `kernel/paper.js:115-117` `refuse('VMU_INVALID_ARGUMENT', …, {enforced:['vmu.paper.finalizer'], declared: FINALIZERS, value: raw})` ⇒ 两条注入路径都拦得住；core 同步改了我名下的 `tests/vmu-paper.test.mjs` §5（原文锚定的是被删的缺陷 ⇒ 改 `expectRejects`，我已复核接受），复跑 `vmu-paper` **37/0**、`vmu-paper-consult` **40/0**；**`stallAutoMeetingMs:360000` 为有意分歧**：v5r 静止即自动开会，vmu 的 `idleAction` 默认 `'notice'`＝只提示，R1）。

### 10.10 R8 目标 5 端到端演练（reader-b task-63；★ 抓出并修掉两个真缺陷）

**演练读数**（`node D:\_tmp\r8-e2e.mjs` ⇒ `ALL ASSERTIONS PASSED (spawns=20, mirrors=13)` **EXIT=0**；脚本已删，读数在 `13-goal5-e2e.md`）：**B** 四库真机（numpy 1500² matmul／scipy `expm(260²)`／pandas 300 万行 groupby／sympy 6 个符号积分）`live kind/elementKind` ≡ **耐久作业信封**（array/numeric、array/numeric、frame、**array/symbolic**）且 exit=0；**A1** 异步长作业 `cancel` 中途取消（**子进程确已死亡**、镜像 `cancelled`、新实例 `kept/cancelled`、**0 次重跑**）；**A2** SIGKILL 内核进程 ⇒ 新实例走 **`interrupted-then-requeued`** 分支**真的重跑到 settled**（attempts=2、spawns+1）；**A3** 同批镜像给全新实例 ⇒ **采纳 8**、`requeued=0`、**0 spawn**；**A4** 两实例竞同一 jobId ⇒ 一赢一 `VMU_MATH_JOB_ID_TAKEN`。状态全集＝计算面七态／Lean 面六态。

**★ 两个真缺陷（我逐条核过代码 + 复跑其回归）**：
1. **取消被"后写者"改写**：`cancel()` 标 `cancelled` 后，被 `terminate()` 杀掉的子进程 `close` 事件让执行路径继续写盘，把状态改成 `settled`/`failed`。现执行路径**先判取消**（`kernel/mathjobs.js` 的 `executeInner`／`kernel/lean.js` 的 `runOne`），`cancelled`（及 `interrupted+cancelled`）**粘住**，回执 `VMU_JOB_CANCELLED`（`:528/:560/:567/:724`）。★ **R6 的取消测试看不见它**——那套测试的假句柄 `done` 永不结算。
2. **信号死亡被当成成功**：`exitCode === null`（SIGKILL）时旧码 `Number(null) === 0` ⇒ 记成 **settled/exit 0**。现"没有退出码"⇒ **`failed`** ＋具名拒 `VMU_MATH_HARNESS_FAILED`（`mathjobs.js:618-629`，消息含 `signal`），回执新增 **`signal` 字段**（`:186`）。
⇒ 回归：`tests/vmu-job-cancel.test.mjs` ★我复跑 **9/0**（+2：STICKY 取消用**真 kill 语义**；no-exit-code ⇒ failed），`vmu-mathjobs` **10/0**。
★ **自我修正（值得记）**：其第一版"粘住"守卫误用 `r.stdout` 而 `const r = out || {}` 在同块更后 ⇒ **TDZ `ReferenceError` 被 catch 吞成 `failed`**（症状像"守卫没生效"）⇒ 改 `out && out.stdout` 后通过。**教训：症状 ≠ 根因。**
**未证明（具名，见 `13-goal5-e2e.md` §3）**：跨机崩溃未验（同机同 fs）；分支 ①/③ 未在端到端命中（单测覆盖）；**孤儿进程是宿主边界**（服务被 SIGKILL 时 OS 不保证）；Lean 面未做"杀内核"演练；"续算"＝**重跑整段**而非中间检查点（未实现、未声称）；同号**后续覆写**仍 last-writer-wins（A4 只证明占号）。

### 10.11 R8 目标 1 端到端钻取（reader-a task-62；★含我的独立**变异复验**）

- **钻取**：`tests/vmu-resume-e2e.test.mjs`（**90 断言**＝R9 的 81 ＋ R10 **§⑩ 9 条**：真入口两内核实例读同一真 store root，K1 `shutdown()` → raw store 读文件 → K2）⇒ ★我复跑 **90/0 EXIT=0**。
- ★★ **变异复验（两个锚点，我都独立做、带回滚证明；`resume.js` sha256 `230412F8A423EA62…` 全程未变）**：**A** `:181` `seq = Math.max(seq, natural(this.seq, 0)) + 1` → `seq += 1` ⇒ **EXIT=1、61 passed / 2 failed**（`7a` `VMU_RESUME_PROJECTION_GAP`；`7e` `{"tasks":0,"queue":3}`；**§⑦ 11 条照旧全绿** ⇒ 与我 §⑦ 前的 **50/2** 恰好差 11 条，两版互证）；**B** `:596` 把 `wanted` 两组对调（journal 在前）⇒ **EXIT=1、61/2**（`7a` `unhydrated: tasks`，`code: VMU_HUMAN_APPROVAL_PENDING`；`7e` `{"tasks":0,"queue":1}` ＝**凭空多一个请求**）⇒ **bug #2 从"采信改前读数"升级为独立复验**。护栏＝**锚点唯一性断言**＋`finally` 还原＋**还原后哈希比对**（两次均 true），还原后 **63/0**。
- **§⑦ 正对照**：mailbox 绑**真的** `createDurableCommitLog` ⇒ 两条投影契约**未变**（CONTRACT 1 state 自动写穿 `9f/9g`；CONTRACT 2 journal 必须显式 flush `9h/9i`）；`9j/9k` 证明**"提交耐久 ≠ 投递/正文状态耐久"**。★ 两条新边界：**宿主 store 是内存假实现（跨进程 ticket 未验）**；**"未绑定耐用日志 ⇒ `status()` 自曝"属 reader-c R9、本钻取不断言**。
- **修掉的 4 个真 bug**：① journal 序列不续接（重启后再写一条即整本被判有洞、不可重放）；② `hydrate()` 顺序（先 state 后 journal，否则重放把命令执行到空机构上并**写穿覆盖未恢复快照** ⇒ `restored:[]` 的**假恢复**）；③ 空种子 `[]` 被读成投影缺口（全新 store 首次 `recover()` 即 `ok:false`）；④ `human.gate()` 内部路径绕过投影（待批请求重启后消失）。
- ★ **具名缺口**：**`kernel/index.js` 退出路径不 flush journal**（★我复核：`resume.snapshot` 在 `kernel/index.js` **命中 0**）；钻取以 `2i`（重启前仍是 `[]` 种子）＋`2j`（flush 后才成立）**把两半都做出并各留断言**；根因＝**写穿是异步文件 I/O，退出必须显式等落地**。
- **边界**：无宿主/无真 spawn（重派＝记录回调）；同进程模拟三次 boot；注入时钟无真定时器；`chat` 未走（inject 走 mailbox）；watchdogs N/A；多实例注册表与 v5r `meetingOpen` 等价物仍缺。
- **归因（我复核）**：`tests/vmu-wiring-index.test.mjs` **RED（28/3）**＝`docs/00-README.md` 生成块 stale（`1220` vs 派生 **1219**）、由 core 新键 **`vmu.meetings.leaveApprover`** 引起 ⇒ **Lead 跑 `generate-wiring-index.mjs --write`**；`generate-vmu-settings-table.mjs --check` **clean**。

### 10.12 R9 落盘与复核（task-67）

- **A · `commitStore` e2e 落盘＝19/0 EXIT=0**（`tests/vmu-commit-store-e2e.test.mjs`，core 的 §6.5 探针为唯一来源、14 条原样搬入）：① 两内核共用一份 store（票号 1、2 互异单调）② 意图/生效间崩（意图先落、`recover()` 恰一条 pending、幂等、完成后不再重放、**结果行与意图行同号**）③ 无 store 具名降级（`durable:false` ＋ `seams.commitStore===false` ＋ `/no allocating store/`）④ **开机后挂载 ⇒ 调用时解析**。★ 新增 3 条负向（resolver 抛错 ⇒ `commit-store-failed`/`VMU_COMMIT_STORE_FAILED` ＋ 保留 message）＋ 2 条**契约反例**（不保留显式 ticket 的 store ⇒ 结果落错号、意图**永远 pending**）⇒ 把"**append 必须保留显式 ticket**"做成可观测反例。集合形状断言均加**非空前置**（RULE E）。
- **B · F52 activity 语义＝已由既有族覆盖，未重复造断言**：`vmu-activity-falsify` **10/0**（FUTURE-ONLY／ONE-SHOT／DISPOSER 恰一次，各有单点变异）＋ `vmu-activity-kernel` **141/0**（`:9` 头注"disposer runs on SUCCESS, TIMEOUT and ABORT, and nowhere twice"，`:87/:98/:115/:128` 逐分支）＋ `vmu-activity-falsify-lib` **27/0**（同性质经共享库复核）＋ `vmu-activity-timers` **36/0**。
- **C · 值域门禁常态化（vmu-pack task-68）＋首日第二例**：`scripts/audit-pack-value-domain.mjs` ★我复跑 **5/0**（`--selftest` **3/0**）；抓到 `packs/v3-core/index.js` 声明 `vmu.meetings.quorumRule:'majority'` **域外**（域＝`['m-unanimous','all-unanimous']`）⇒ pack 值**绕过 settings 边界**、且默认 tally 只当上下文标签（**声明做不到它写的事**）⇒ 已改；**真多数聚合＝R1 可插拔谓词**（需 pack 注入 `createBallot` 的 `tally`）＝具名改判条件。★ **RULE A 执行点由我补**（新脚本 `--selftest` 原无人真跑）⇒ criterion 70/5 → **73/3**。
- **D · B1–B4（8 键）与 `control/idle` 均未落**（vmu-pack 与 core 一致，★我复核：8 键 schema 命中 **0**、`control/idle` 在 `bus.js` 命中 **0**）⇒ **无可复核对象**；根因＝读者在别的模块，**只落键会造 8 个 declared-but-unwired 孤儿** ⇒ 需 Lead 指派 owner 或授权连读者一起改。
- **E · 指纹**：`RULE E fingerprints: current=67 = baseline=67` ✓；同期新红是 **RULE F**（`resume.js:599/611` 的 `toMs` 未处理 `NaN`，owner＝reader-a，已通知）与 **Lead 的 `regen-all --check`**。★ R9 内 RULE F **已修**（reader-a 用 `msStrict` 经 `readClock()`）⇒ criterion **75/1**（唯一 FAIL＝Lead 的 regen）。

### 10.13 R10（task-75）：R9 的 7 个真缺陷账 ＋ 门禁形状（详见矩阵 §9.8）

**R9 的 7 个真缺陷（全部已修）**：① **`methodsOf` 未写穿**（`index.js:941` 的方法表只覆盖 `tasks/work` ⇒ `members/meetings/ballotbox/budget/chat/panel/minutes` 声明为投影却从未被写；退出 flush 也救不了 ⇒ `state` 面反转为"包所有方法除只读集"，探针 14/0；并把 R6"多实例注册表未做"**改判**为"机制不需要，缺的是 `methodsOf`"）② **`store.js` 白名单缺 `ballotbox`/`minutes`** ⇒ **部署一声明就 `recover()` 崩**（"声明了但会崩"比"声明了没生效"更严重；`PUBLIC_KEYS`＋`NULL_SEEDED`）③ **Lean 崩溃续算实际是坏的**（`runOne` 先写 running 镜像后读哈希 ⇒ `hashBefore:null` ⇒ 恒走分支③；修法＝先读哈希）④ **同号覆写 last-writer-wins**（两实例同时 `recover()` ⇒ 同一作业跑 2 次，`pids:3`）⇒ **恢复租约**（TTL／`lease-held`／`unenforced` 具名，`pids:2`）⑤ **`fired ⊄ enforced`**（`vmu.store.tmpDir`；我先独立复现、随后已修，并**堵掉既有门禁对该分支的空过**）⑥ **`lean.js` 绕过注入时钟**（`setTimeout(r,50)`×4000 ⇒ F15 unclassified；选**注入接缝**这一更强修法 ⇒ 站点 1→0）⑦ **E-17 观测量无差异**（见 §10.12／`docs/11 §4.2` 第六条）.
**退出冲刷＋G7**：`state` 自动写穿 vs `journal` 必须显式 flush；`ok` 是二者的**与**；**"写前必读"同样管辖退出**（我先前报的那条 stdout 噪声，core 确认**有意**并做成具名断言＋写进 `docs/03 §2`）。`vmu.commitlog` 成为 board＋mailbox **共用**的一份日志（探针 17/0）；其 camelCase→小写改名暴露了"门禁按形状解析"，我已把该门改成**从 registry 取全名＋按 kind 排除工具＋双向自探针**（49/0）。
**`resume.js` 拆分（★三块；我先前只报两块，是我搜索范围的失误）**：`kernel/resume.js` **1179** ＋ `kernel/resumeflush.js` **150**（`createExitContract`）＋ `kernel/contentvalue.js` **50**（`stableStringify`/`contentDigest`/`clone`/`idSuffix`；消费者 `resume.js:47/48`；已登记 `files[]`＋`installer.js`＋zero-mechanism 矩阵 ✓）。★ **Lead 同轮独立实测为 1125/141/44** ⇒ **两版并存**（reader-a 收尾微调所致，不以任一版掩盖另一版）。★ **失误根因**：我用了 `-Filter 'resume*'` **按名字前缀搜**，`contentvalue.js` 因此从未进入结果——与 R7 **F52 教训同族**；**"搜不到"必须与"不存在"分开说**，我当时写成了后者。
**R10 门禁形状（A 主项）**：依赖环门禁把 `resume.js` **注释里**的 `import … from './resume.js'` 当成真 import ⇒ 报**自环**，当年的修法是**改写注释**（**门禁指挥文档措辞**）。修法＝**去注释＋语句位置**（`relativeImportsOf()`）＋**双向自探针**（注释/数据字符串不计入；单行/**多行**/副作用/**re-export** 四种真拼法必须找到；并断言旧模式确实数了注释形状）；★ 副作用：内部边 **245 → 246**（旧模式连**多行 import** 都看不见）⇒ 该门 **8/0**。教训写进 `docs/11 §4.2` **第七条：门禁必须读"事实所在的那种文本"**。

### 10.14 ★ 第一次"用这套框架真的做一道数学题"（reader-b task-79；18/18 步，真机）

**剧本与读数**：`Σ k³ = (n(n+1)/2)²` ＋ `∫₀^a x³ dx = a⁴/4` ＋ `∫₀^∞ e^{-x²} dx = √π/2`；真机 Python 3.12.10（numpy/scipy/sympy）＋ Lean 4.34.0；`=== R10 DONE: 18/18 steps walked (spawns=5) ===` **EXIT=0**。
**走通**：`tasks` 依赖链（`t-1→t-2→t-3`）＋**依赖门禁真拒**（`VMU_STATE :: unmet dependencies for t-3: t-2`）／`mathjobs`·numpy `S(2000)=4004001000000 equal:true`（含 in/out 指纹、镜像 settled）／scipy `absErr≤3.55e-15`／sympy 闭式 `n²(n+1)²/4` ＋ `difference:"0"` ＋ `gauss=√π/2`／Lean `4*S 10 = 10²·11²` 由 **`by decide`** 通过 ⇒ `settled/passed/hashUnchanged`／**`formal` 一般命题 ⇒ 具名拒 `VMU_FORMAL_SORRY_FOUND`（"检出 sorry（1 处）：1:61"，★我核 `kernel/formal.js:128` 确实点名行/列）**／`records` 同内容再写 ⇒ 同 id ＋ `deduplicated:true`／`resume` 会话投影 adopt（`restoredEntries 4, replayable:true`）／`paper` **真起稿**（`paper-1`、`outstanding:[{name:"Result",owner:"reader-b"}]`）／★ **SIGKILL 中途重启**：镜像仍 `running/attempts=1` ⇒ 新实例 `recover()` ⇒ **分支② `interrupted-then-requeued`（attempts=2、`lease:"acquired"`）⇒ 真跑到 `settled`**（`recoveryLease:"enforced-by-exclusive-create (TTL = max(120000ms, job budget + 30s); stale leases are stolen)"`）⇒ **R9 的恢复租约在真机端到端同样生效**。
★ **没证明的（原样具名，不放大）**：① **多智能体协作未走**——全程**单智能体**：无第二成员／投票／会议／委托／并发写者 ⇒ **用户用途里最相关、也是本剧本唯一最大的空缺**；② 真中间检查点未做（续算＝整段重跑，令牌只"携带"）；③ 一般定理形式化未证（只机器检查 n=10 实例；自写递归 `S` ≠ `Finset.sum`；Mathlib 不在本机 ⇒ 具名拒）；④ `mathadapters` 面未走（R7 另证）；⑤ `paper` 只走 `start`；⑥ 跨机/持久卷未验。
★ **我的复核**：其回归读数**我独立复跑全绿**——`vmu-mathjobs-persist` **21/0**、`vmu-lean-jobs` **13/0**、`vmu-activity-timers` **36/0**、`audit-vmu-orphan-methods` **4/0**、`check-docs` **PASS**；并核了 `VMU_FORMAL_SORRY_FOUND` 的 file:line ✓。**他未改任何 kernel/docs 文件**（只新增两份 handoff ＋ 已删的临时脚本）。


