# v5r 深度盘点 · 分片 A（`vibe-math-v5r.js` 第 1–3730 行 + 配套文档）

> 任务：`task-7`（Round1 · 目标3-A）。只读侦察，唯一写入本文件。
> 产出定位：**目标 1（断点续跑/人工干预）、目标 2（通信/协作/会议）、目标 3（框架是否足够强）、目标 4（pack 是否完整复现）的唯一事实来源（分片 A 部分）**。
> 阅读方法：`vibe-math-v5r/vibe-math-v5r.js` 第 1–3730 行**逐段全读**（每次 400 行）；为确认"被谁消费/在哪调用"，另点读了 3732–3869 / 9040–9320 / 9762–9891 / 10237–10343 / 11049–11291 等**消费点**（已在文内标注）。配套文档：`vibe-math-v5r/设计总览.md`（全文 56 行）、`docs/01-philosophy.md`（全文 323 行）、`docs/03-interface-contract.md`（全文 313 行）、`docs/04-flows-and-protocols.md`（全文 355 行）、`docs/07-oversight-and-time.md`（全文 435 行）。
> 行号约定：未写文件名时一律指 `vibe-math-v5r/vibe-math-v5r.js`；文档写 `docs/xx.md:行`。
> 计数口径：本分片共登记 **47 条机制**（M-A01…M-A47）＋ **9 条跨边界消费点**（X-1…X-9）。

---

## 一、机制逐条清单

### A. 模块作用域（1–411）

#### M-A01 · TeX/Lean 已知安装位置解析（known-location fallback）
- **触发入口**：`resolveKnownTool(sub, opts)`（定义 93–177，导出 179；`opts={name,explicit,kind}`）；不注册工具。**消费点（已顺藤摸瓜）**：Lean 执行解析 `kind:'lean'`（4421，失败 ⇒ `LEAN_NOT_FOUND` 且把 `_r.tried` 放进 `next.tried`"我还找过这些"）、Lean 归档前解析（4710）、TeX 引擎探测 `kind:'tex'`（8659，把 `_vr.tried` 汇总进 `triedPaths`，`via` 直接进引擎记录）。
- **具体逻辑**：解析顺序 **① 显式命令（`leanCommand`/`paperLatexCommand`）——只用它、绝不猜 → ② 宿主 `sub.resolveExecutable(name)`（PATH）→ ③ 已知安装位置**有界探测****（93–177）。TeX 根若不含 `bin` 段则按"磁盘上实际年份目录（新→旧）＋ 最近年窗口"展开 `<root>/<year>/<bin/...>/name`，年份窗口 `TEX_YEAR_LOOKBACK=4`（65–66,155–157）；整段探测**硬上限 `TEX_CANDIDATE_CAP=40`** 条候选路径（65,151–175），**不做全盘扫描/安装/工作区外写**（59–64）。命中回传 `{exe,via:'explicit'|'path'|'known-install',tried,name}`；失败回 `{exe:null,reason,tried}`，**失败也带"我还找过这些"**（`tried[]`，176）。Windows 的 TeX 根顺序把**盘根位置**（`D:/texlive`,`C:/texlive`，67）放最前（127–132）。
- **数据结构**：`tried[]`（探测过的每个绝对路径）；`knownLean[]`/`knownTex[]`（125–133）；`texYearSubdirs`（149）。
- **可调参数**：无参数键；常量 `TEX_CANDIDATE_CAP=40`、`TEX_YEAR_LOOKBACK=4`（65–66）。环境变量测试缝 **`V5_TEX_ROOTS_SANDBOX`**：设置后把所有已知 TeX 候选**重基**到该目录（同相对尾），用于在任意宿主上钉住"本机没装 LaTeX"（112–123）；**不是产品开关**（118）。
- **持久化/恢复**：无（纯探测）。
- **宿主接触面**：`sub.resolveExecutable`（136,143）；`node:fs` 动态 import（`existsSync`/`statSync`/`readdirSync`，108,111）。
- **file:line**：65–179。**标签**：`[OTHER]`

#### M-A02 · 反馈库常量（方法论/协作层）
- **入口**：常量，被反馈工具消费（工具注册面见 `:5390+` 一带）。
- **逻辑/字段**：`FEEDBACK_CATEGORIES=['cooperation','management','process','obstacle','conflict']`（74）＋中文标签（75）；**三条路由**决定"处理"含义：`self`（自己改，无需批准）/`team`（自组织改）/`interpersonal`（唯一需要评估＋回写验证的路由）（76–84）；状态机 `open→adjusted→closed|dropped`，`FEEDBACK_OPEN_STATUSES=['open','adjusted']` 是 list 默认"未闭环"过滤（85–90）；目录 `Shared/Feedback`（91）；关闭时的具名拒文案（92）。
- **持久化**：目录 `Shared/Feedback/`（文件镜像）＋耐久 `feedback[]`（走 fold 白名单，见 M-A15）。
- **file:line**：70–92。**标签**：`[AUDIT]` `[OTHER]`

#### M-A03 · 注入声明与投影版本、事件类型枚举
- **入口**：`export const inject = ['subagents','agents','fs','tools','commands','timer']`（181）；`PROJECTION_VERSION=1`（206）；`EV`（207–220）。
- **逻辑**：Guard 拒绝未声明就读取的 ctx 服务 ⇒ 每个被读服务必须进 `inject`（38–40）。**事件类型共 12 种**：`vibe5/institute|member|task|message|delivered|meeting|debate|verdict|queue|solve|progress|formal`。`PROJECTION_VERSION` 同时写进快照 `v` 与每条事件 `data.version`（1481），载入时严格比较（942–943）。
- **持久化/恢复**：`PROJECTION_VERSION` 是**唯一模式版本闸**；版本不匹配 ⇒ 文件被判"存在但不可用"（见 M-A18）。
- **file:line**：181,206–220。**标签**：`[RESUME]` `[CONTROL]`

#### M-A04 · 最终论文常量（论文阶段）
- **逻辑**：`PAPER_MAX_ROUNDS=3`（229）；引擎顺序中文优先 `xelatex`、英文优先 `pdflatex`（231–234）；修复轮只保留 `amsmath/amssymb/amsthm/geometry/ctex`（237）；九节论文骨架（238–248）。论文阶段在**完成标志翻转之前**运行（222–228）。
- **持久化**：耐久 `paper`（fold 白名单函数式补丁，616–621；恢复后 `resume()` 会再推一次 `paperPass`，10290–10292）。
- **file:line**：222–248。**标签**：`[OTHER]`（论文细节属分片 B/C）

#### M-A05 · Lean 异步编译队列的模块级常量与纯助手（含自实现 SHA-256）
- **逻辑**：并发是**常量** `LEAN_QUEUE_CONCURRENCY=1`，不是参数（250–255）。`LEAN_SEARCH_PATH_FLAG='-R'`（Lean 4 拼写；`--search-path` 是 Lean 3，会让参数解析先失败）**只有一个出处**（256–260）。`leanHasSearchFlag(args)` 保证**绝不注入第二个搜索根**（用户显式 `-R/--root/--search-path` 优先）（263–272）。`leanHashText(s)` 是内容同一性归一（CRLF→LF、去尾部空白）（273–276）。`sha256Hex` 是**自包含 FIPS 180-4 实现**（不用 `node:crypto`；正确性由测试对官方向量与 node:crypto 双向核对）（277–340）。`v5err(code,msg)` 生成带 `code` 的稳定类型化错误（342–347）。
- **持久化**：内容身份用于队列去重与 jobId；Lean 侧另有 `Formal/Jobs/*.json`（见 M-A22 的崩溃恢复）。
- **file:line**：250–347。**标签**：`[OTHER]`

#### M-A06 · S21 内容指纹与指针传播注入契约
- **入口**：`contentFingerprint(kind, parts)`（362–365，**全仓唯一指纹计算点**）；`headerListContractBlock()`（372–383，**模块级纯规则文本**）。
- **逻辑**：指纹 = `sha256Hex(kind + '\n' + parts.map(leanHashText).join('\n---\n'))`；**只覆盖陈述原文与证明正文**，**故意排除**标题/ID/记录者/记录时间（349–358）⇒ 改标签不算内容变更、同内容幂等。契约块 7 条（含"引用他人结论必须带 id""查不到具名停下上报""Lean 归档不在头部列表"）；它是**机制说明、每轮从零重拼**，因此**天然抗压缩**，且**不携带任何对象数据**（367–371）。
- **开关**：`params.pointerPropagation`（默认 `true`；**唯一读取口径** `pointerPropagationOn() = params.pointerPropagation !== false`，**显式 false 才关**，2031–2033）；关 ⇒ `pointerContractBlock()` 返回 `[]` ⇒ 8 个注入点**零注入**（2062–2068）。
- **持久化**：指纹落在卡片文件的 `- 内容指纹:` 行（**不进 fold、0 新耐久键**；`docs/03-interface-contract.md:99,268`）。
- **file:line**：349–383,2031–2033,2062–2068。**标签**：`[OTHER]` `[AUDIT]`

#### M-A07 · 宿主"在活续聊子代理"上限的侦测与命名
- **逻辑**：宿主 `subagent` 行 `maxActiveSubagents`（默认 8）写满后，`startContinuable` 抛 `ACTIVATION_LIMIT_REACHED`（385–398）。模块级 `hostChildLimit` 由**拒绝对话中解析出的上限**记住（400–405）；`isActivationLimitReached(e)` 只认错误码 ⇒ **无版本判断、错误码本身就是特性探测**（397–400）；`hostChildLimitHint(limit)` 给出**一句可执行**的话（点名宿主参数名）（407–411）。
- **持久化**：上限是**宿主/进程属性**，不持久化（385–399）；被拒成员则成为耐久 `phase:'failed', failReason:'activation-limit'`（见 M-A47、X-2）。
- **file:line**：385–411。**标签**：`[BUDGET]` `[ROSTER]` `[CONTROL]`

#### M-A08 · 插件装载/卸载的宿主接触面（effect + 惰性服务解析）
- **逻辑**：`apply(ctx)` 一开头取 `subagents/agents/fs/tools/commands`（413–418）。`leanDisposers` 集合＋`ctx.effect(() => () => {…})`：**插件卸载不得留下孤儿编译器**（420–427）。可选服务**一律调用时惰性 `ctx.get()`**（`sandboxPolicy`/`subprocess`/`compaction`，429–434）；compaction **优先取 agent 自己的 ctx**（preset 的 compaction 在 isolate realm 里，根对象可能是另一策略）（435–444）。
- **file:line**：413–444。**标签**：`[CONTROL]`

#### M-A09 · 通用工具函数（id/信号/写范围）
- **逻辑**：`hex(n)`/`shortId()`（8 hex，447–448）；`textBlock`（453）；`makeSignal(ms)`=`AbortSignal.timeout(posMs(ms,30000))`（454）；`normalizeScope(s)`：反斜杠→`/`、去 `./`、去尾 `/`，**拒绝空/绝对路径/盘符/`.`/`..` 段**（464–470）；`scopesOverlap(a,b)` 前缀段比较（471–476）。`contextPct` 是**百分数 (0–100)**，注释明确不得钳到 0–1（449–450）。`posMs` 在 11512（非正数落默认）。
- **file:line**：446–476,11512。**标签**：`[CONTROL]`

### B. 状态 fold（478–900）

#### M-A10 · 空机构骨架与耐久字段全集（`emptyInstitute`）
- **入口**：`emptyInstitute(key,project,institute)`（485–527），被 `withInstitute` 兜底、`inst()` 兜底调用（541,1428）。
- **数据结构（机构级耐久字段）**：`key,project,institute,createdAt,phase,problem{id,statement},params,members[],tasks[],messages[],delivered[],meetings[],debates[],verdicts{},formal{},todo[],queue[],solve{},counters{academician,researcher,temp,task,meeting,message,verify},runId,lastProgressAt,artifactCount,diagnostics[],meetingOpen,officeRequestsDropped,paper,feedback[]`（485–526）＋后续 `patchInstitute` 白名单追加的 `chair,stallNotice,grants[],ballots[],chatSupplements[],formalProofs{},secretaries[],resolutions[],minutesConfirmations[],motions[]`（634–690）。
- **关键注释（恢复语义）**：`solve` 曾是内存 Map ⇒ 跨会话无法一致，现耐久（503–507）；`meetingOpen` 是"开了没收束"的耐久标记（F6，513–516）；`officeRequestsDropped` 让截断可见（F4，517–519）；`paper` 耐久让重启续同一阶段而非写第二篇（520–522）；`feedback` 耐久（523–525）。`state.order` 已删除（**写而不读的死负载**，528–531）。
- **file:line**：478–547。**标签**：`[RESUME]` `[STATUS-PANEL]` `[ROSTER]` `[CHARTER]` `[BUDGET]` `[AUDIT]`

#### M-A11 · 顶层状态与 `withInstitute` 的引用同一性/未知键保留
- **逻辑**：`initState()` = `{v:PROJECTION_VERSION, institutes:{}}`（532）。`withInstitute(state,key,mut)`：取当前（缺失则空机构）→ `mut` → **若 `mut` 返回同一引用则整体返回原 state**（`Object.is` 判等，状态存储靠它判断"是否变化"，540–547）；否则浅拷贝 `institutes` 并 `Object.assign({}, state, {institutes})` ⇒ **未知的顶层键被保留**（S3 修复：旧实现重建 `{v,institutes,diagnostics}` 会静默抹掉更新版本写入的键，534–539）。
- **file:line**：528–547。**标签**：`[RESUME]`

#### M-A12 · fold 内 id 分配器（原子分配）
- **入口**：`makeIdAllocator(inst)`（571–588），由 `applyV5Event` 在各 `d.make` 分支内构造（696,716,736,804）。
- **逻辑**：ids **不再在 fold 外铸造**（旧形状"读 counters → `msg-N` → await putMessage"会同 tick 撞 id 且静默丢对象，554–562）。`alloc.next(kind)`：`academician` 特判恒为 `'acad'`（且 counters.academician 至少 1）；其余 `n = max(0,counters[kind])+1`，返回 `ID_PREFIX[kind]+n`（`message:'msg-'`,`task:'t-'`,`meeting:'mt-'`,`researcher:'r-'`,`temp:'t-'`，563）。`alloc.counters()` **仅在有分配时**返回新 counters 对象（脏标记），否则返回原对象（586）⇒ 无变更不产生新 revision。**对象与计数器在同一个 fold step 提交**。
- **file:line**：554–588。**标签**：`[RESUME]` `[ROSTER]` `[AUDIT]`

#### M-A13 · 所办收件箱伪 id 与请求上限
- **逻辑**：所办**不是成员**，`to:'voters'` 永远到不了它；`OFFICE_INBOX='office'` 成为**一等目标**（564–570）。`OFFICE_REQUEST_CAP=10`：**只对该伪 id 的消息**按"保留最新、丢最旧"截断，并把丢弃数累加到 `officeRequestsDropped`（749–766）。所办**不会被唤醒**，只在下一轮从 `status().officeRequests`/`report()` 读到（3539–3542）。
- **file:line**：564–570,749–766,3539–3542。**标签**：`[MAILBOX]` `[AUDIT]`

#### M-A14 · 事件信封的准入与"永不抛出"保证
- **逻辑**：`applyV5Event(state,event)`：`event.type` 必须是 `'vibe5/'` 前缀的字符串，`event.data` 必须是对象且有字符串 `key`，否则**原样返回 state**（591–595）。整个 fold 包在 try/catch：任何异常 ⇒ **不抛出**，而是把 `{at,type,error}` 追加到顶层 `diagnostics`（**保留最后 50 条**）并返回（892–899）。注释明确：**可用性优先于日志纯洁**，恶意/畸形事件是必须由测试抓到的代码缺陷；并**刻意不复制** DSH 团队投影的 `state.failure` 永久闭锁（549–553）。
- **file:line**：549–553,589–599,892–899。**标签**：`[RESUME]` `[AUDIT]`

#### M-A15 · 机构级补丁白名单（`EV.institute`）+ 函数式变更
- **入口**：`commit(EV.institute,{patch})` / `patchInstitute(patch)`（1513）。
- **具体逻辑**：`patch` 的键是**显式白名单**（漏一行 ⇒ 该 patch 静默丢弃；文件内多处注释以"S4/S5 已证"提醒）：
  - 标量：`project/institute/phase/runId/lastProgressAt/artifactCount`（601–608）；
  - 对象替换/拷贝：`problem{id,statement}`、`params`（浅拷贝）、`meetingOpen`（null 或拷贝）、`officeRequestsDropped`（604–611）；
  - **函数式补丁**（在 fold 内做读改写，防同 tick 丢更新）：`paper`、`feedback`、`grants`、`ballots`、`chatSupplements`、`formalProofs`、`secretaries`、`resolutions`、`minutesConfirmations`、`motions`（612–690）——均"函数⇒ mutation，返回值 undefined 则不改"；数组型统一 `Array.isArray(next)?next:[]` 归一。
  - `chair`/`stallNotice` 为 null 或对象拷贝（631–637）。
- **语义约束（注释内）**：`formalProofs` **不得写进 `verdicts`**（否则 `currentVerify()` 会把登记当成在飞验证，`continueVerifyRound` 读 `vs.votes[id]` 直接 TypeError，656–661）；append-only 台账一律"只增不改"。
- **file:line**：597–693。**标签**：`[RESUME]` `[CHARTER]` `[CONTROL]` `[AUDIT]`

#### M-A16 · 成员/任务事件的 upsert 语义
- **逻辑**：`EV.member`：`d.make(alloc)` 或 `d.member`，数组化过滤空值；**按 id upsert**（存在则替换、不存在则 push）；**若一个都没变（changed=false）返回原 inst**（不产生新 revision）；有分配则写入新 counters（694–713）。`EV.task` 同形状（714–733）。
- **file:line**：694–733。**标签**：`[RESUME]` `[ROSTER]`

#### M-A17 · 消息事件：追加、去重、所办截断
- **逻辑**：`EV.message`：可 `d.make(alloc)`（一次 commit 可为**多个收件人**分配多条消息）或 `d.message`；**按 id 去重**（已存在则跳过，734–747）；随后对所办伪 id 施加 `OFFICE_REQUEST_CAP` 并累加 `officeRequestsDropped`（749–766）。**一条消息只有一个收件人**（`to` 单值），这是"每收件人信箱"的落地形态（3523–3530 注释）。
- **file:line**：734–770。**标签**：`[MAILBOX]` `[RESUME]`

#### M-A18 · 投递确认账本 `EV.delivered`（LRU 窗口 + 队列压实）
- **逻辑**：`d.ids[]` 去重入 `delivered` 集合；`DELIVERED_CAP=500` —— 只保留**最新 500**（老 id 丢弃，484,780–787）；同时**把已投递消息从 `messages` 中过滤掉**（`messages` 只留未投递 ⇒ 长跑不无界增长，779–789）。注释说明：账本只回答"这条投递了吗"，整快照重写所以不能让数组无限大（M7）；**丢掉一个 id 也绝不会重投**，因为 `messages` 用同一集合过滤（784–786）。**副作用**：已投递消息**正文不再保留** ⇒ `msg-N` 引用锚对已投递消息**悬空具名拒**（见 M-A35、`docs/03-interface-contract.md:261`）。
- **file/字段**：`delivered[](id)`、`messages[](未投递)`。**file:line**：478–484,771–791。**标签**：`[MAILBOX]` `[RESUME]`

#### M-A19 · 会议事件：插入路径 vs 纪要写回路径（S8）+ 200 条上限
- **逻辑**：`EV.meeting` 两条**互斥**路径：① **无 `d.make`** ⇒ 视为对**同一场会议**的 `minutes` 追加/覆盖：`mid` 取 `d.index.id` 或 `d.id`，找不到该 id 则原样返回；`minutes = {...cur.minutes, ...d.minutes}`（**浅合并**）（796–803）；② **有 `d.make`** ⇒ 新会议索引插入，**id 已存在则忽略**（幂等），并只保留**最新 200 场**（804–811）。
- **file:line**：792–813。**标签**：`[RESUME]` `[AUDIT]`

#### M-A20 · 辩论/判定/形式化/队列/解决票/进展 事件
- **逻辑**：
  - `EV.debate`：追加 `d.index`（需 `target` 字符串），**上限 200**（814–821）。
  - `EV.verdict`：`d.target` 必须；`record===null` ⇒ **删除**该 target，否则整体替换（822–830）。`sealRecord` 在写入口盖章（1529,2721–2732）。
  - `EV.formal`：`record` 可为函数（在 fold 内做读改写，MEDIUM 6 修复同 tick 丢条目，835–846）；`todo` 支持 函数/数组/缺省三态（847–851）。
  - `EV.queue`：`d.queue` 可为**函数**（append/take-head 的读改写在 fold 内原子化，855–860）；`list === inst.queue` ⇒ **不产生新 revision**（重复提案不铸新版本，865–867）。
  - `EV.solve`：`d.clear` 清空；`d.member`+`d.value`（`null/undefined` 撤回，否则 `=== true`）⇒ 耐久"原问题是否解决"计票（871–884）。
  - `EV.progress`：写 `lastProgressAt`（`Number(d.at)||now()`）与 `artifactCount`（`Number||旧值`）（885–890）。
- **file:line**：814–890。**标签**：`[RESUME]` `[AUDIT]` `[STATUS-PANEL]`

### C. 持久化后端与文件布局（902–1511）

#### M-A21 · 唯一后端：加固 JSON 文件（`makeFileBackend`）
- **入口**：`installBackend()`（1354–1359）⇒ `makeFileBackend(readTextAbs, writeTextAbs, pathOf, onWriteFailure, onLoadProblem)`；路径 = `instRoot() + '/State/' + instituteName + '.v5state.json'`（1355）。
- **具体逻辑（这就是全部恢复机制的核心）**：
  1. **每路径载入闩**：`loadedPath`（当前已折入 `mem` 的路径）、`loadOk`（那次读**真的成功**了吗）、`loadPromise`/`loadPendingPath`（并发去重）。`load()`：路径相同且（已成功或没有在飞加载）⇒ 直接返回 `mem`；**路径变了** ⇒ `mem = initState()` 重读（963–981）。
  2. **`doLoad(p)`**：`readTextAbs` 返回 `undefined/null/''` ⇒ 无文件，`ok=true`（**唯一允许后续写入的情形**）；否则 `JSON.parse` 失败 ⇒ `loadProblem='invalid JSON (truncated or corrupt)'`；`parsed.v !== PROJECTION_VERSION` ⇒ `loadProblem='schema version mismatch…'`（**明确拒绝、不迁移、不猜**，932–945）。
  3. **失败可见化（S2）**：`loadProblemText(where)` 给出**可执行**的修复建议（备份后恢复 v1 文件，或改名以新建；**当前文件保持原样**），并在**读路径**上就回调 `onLoadProblem`（953–960,974–976）。
  4. **`loadedFor()`** 暴露 `{path,ok}` 给 `commit()` 做前置判断（983）。`loadAt(path,useKey)` 专供 `configure`：**读某个具体路径**并回传该 key 的机构（987–995）。
  5. **`commit(type,data)`**：先 `if (loadedPath !== path) await backend.load()`，然后 **`if (loadedPath!==path || !loadOk) throw v5err('V5_STATE_NOT_LOADED', 'refusing to overwrite …')`** —— **"从未成功读过就绝不写"**（996–1005）。`mem = applyV5Event(mem,{type,data})` 后取 `snapshot = mem`，把 **`JSON.stringify` 推迟到串行链内执行**，链 = `chain.then(...)` ⇒ **晚到的写者一定落"全量最新"**，不可能用陈旧子集覆盖（1006–1024）。
  6. **写失败可见（MEDIUM 7）**：`writeTextAbs` 返回 `undefined` ⇒ 记 `onWriteFailure(path)`（→ `noteWriteProblem` → 计数 + 诊断）并 `console.error('…the in-memory state advanced but the file is STALE')`（1012–1022）。注释明确：**fold 无法回滚**，所以把失败做成耐久可见，而不是假装成功（1012–1017）。
- **为什么没有第二个后端**：DSH 会话持久化**拒绝加载携带未知事件类型的会话**，除非写入方标 `ignorable:true`，而 `Session.append` 无法设置该字段 ⇒ 旧的"投影进宿主会话日志"做主存储会让**用户自己的会话不可续**（48–52）。恢复因此是**一条代码路径**：读文件→fold（28–36）。
- **file:line**：902–1029。**标签**：`[RESUME]` `[AUDIT]` `[CONTROL]`

#### M-A22 · 会话注册表与"根代理"解析
- **逻辑**：`sessions: Map<rootAgentId,session>`、`childOwner: Map<childId,rootAgentId>`（1032–1033）。`rootOf(agent)` 沿 `agent.session.header.parentSession` 上溯到根（带环保护）（1036–1051）；`getSession(agent)` 按根 id 记忆化并 `makeSession(root,sid)`（1052–1059）。这保证**一个会话一根、机构状态与根绑定**，成员子代理共享同一机构。
- **file:line**：1031–1059。**标签**：`[ROSTER]` `[CONTROL]`

#### M-A23 · 会话参数默认表（`DEFAULT_PARAMS`，全量）
- **入口**：`makeSession` 内构造（1061–1183）；`vibe_v5_set` 调参；`syncParamsFromState()`/`commit()` 恢复时归一（1505,9123）。
- **默认值与注释内上下界**（`上下界`取自 `normalizeParams` 9762–9880 的实测钳制）：
  - 所办/法定人数：`academician:true`、`academicianLeads:true`、`memberMayRejectAssign:true`、`researcherCount:3`（<0⇒0）、`quorumCap:3`（<1⇒1）、`quorumMode:'m-unanimous'`（非法⇒回落 `m-unanimous`）、`reconsiderFloor:0`（<0⇒0）、`quotesPerMessageMax:2`（<1⇒1）、`quoteDepthMax:3`（<1⇒1）、`verdictMaxRounds:3`（<1⇒1）（1063–1073,9794,9858–9862,9871）。
  - 编制：`maxTempPerMember:3`、`maxTempTotal:12`（1074–1076）。
  - 上下文：`compactThreshold:66`（非正⇒删，落默认）、`compactAfterRounds:8`（1077–1079,9869）。
  - 调度：`maxParallel:3`、`activityTimeoutMs:120000`（非正⇒删）、`stallAutoMeetingMs:360000`（**负值＝关闭**，是唯一允许负的时长；0⇒默认）、`chatDigestMs:45000`、`chatDigestMax:12`（<1⇒1）、`meetingKeepEvery:5`（1080–1086,9849–9852,9870）。
  - 会议发言模型：`meetingHardLimitMs:1800000`（钳到 **[300000,7200000]**，**不提供无界**）、`meetingWakeRetries:5`（钳到 **[0,10]**，耗尽记 `unreached` 且**视为"已获得机会"**）（1087–1095,9854–9855）。
  - Lean：`formalVerify:'off'`（非法⇒`off`）、`leanCommand:'lean'`、`leanArgs:[]`、`leanTimeoutMs:120000`（≥1000）、`leanAsync:true`、`leanInitiative:'normal'`（非法⇒`normal`）、`leanSearchPaths:[]`、`leanJobsMaxParallel:1`（<1⇒1）（1096–1119,9797–9820,9856）。
  - S25 资源：`resourceSelfCheck:false`、`toolCallsPerTurnCap:0`（0＝不限）、`memoryCeilingMb:0`（0＝未知/不限）、`maxLiveChildren:0`（0＝不设，沿用宿主容量）（1120–1130,2035–2048）。
  - S21：`pointerPropagation:true`（1131–1136）。
  - 数学：六个 `math*` 键的默认值**来自共享模块**且数组被拷贝（`MATH_PARAM_DEFAULTS`，1145–1152）——归一交给 `normalizeMathParams`（9826–9837）。
  - 论文：`finalPaper:true`、`paperFormat:'both'`、`paperLanguage:'zh'`、`paperCompilePdf:true`、`paperEditor:'academician'`、`paperLatexCommand:''`（1153–1168,9840–9843）。
  - 反馈：`feedback:'on'`（非法⇒`on`）（1169–1174,9816–9818）。
  - 模型/工具：`provider:''`、`model:''`、`toolAllow:[]`、`toolDeny:[]`、`staffPersona:''`、`tempToolAllow:[]`、`tempToolDeny:[]`（1175–1182）。
  - S19：`motionSecondsRequired`（≥1 整数、默认 1；`0`/负/非整数 ⇒ `V5_INVALID_ARGUMENT`，`docs/03-interface-contract.md:80,419`；读取口径 `motionSecondsRequired()` 2024–2028）。
  - **整数键清单**（新增整数键必须加在数组**倒数第二项之前**，否则会拆掉跨预置的提示词不变量自检，9764–9776）。
- **持久化/恢复**：`params` 随 `EV.institute` 落盘；恢复时 **`Object.assign({},DEFAULT_PARAMS, normalizeParams(cur.params, dropped))`** ⇒ 手改/异形状态文件**绝不能**把非法值带进运行时（1499–1506,9117–9125）；被丢弃的未知键经 `reportDroppedStateKeys` 记诊断（9884+）。
- **file:line**：1061–1183,9762–9880。**标签**：`[BUDGET]` `[SCHED]` `[CHARTER]` `[RESUME]`

#### M-A24 · 会话内存态（ephemeral）全集与"恢复时重建"清单
- **数据（1185–1230，全部**不持久化、恢复时重建**）**：`params`（由耐久 params 归一重建）、`project`/`instituteName`（由 `data.key`/耐久字段重建）、`key`（= `project::institute`，派生）、`phase`（由耐久 phase 重建）、`running`、`autoDone`（由 `phase==='solved'` 重建，见 M-A28 S1）、`runId`（**耐久字段的镜像**）、`busy:Set`、`wakeKind:Map`、`rounds:Map`、`roundsSinceCompact:Map`、`contextPct:Map`、`needReanchor:Set`、`inboxInjected:Map`、`inboxSuppressed:Set`、`seeds:Map`、`lastActiveAt:Map`、`currentMember`、`finalizeLock`、`verifiedRecently:Map`、`liveAgents:Map<childId,WeakRef>`、`inflight:Map<childId,{token,kind}>`、`heartbeatDisposer`、`meeting`（在飞会议对象）、`lastMeetingId`、`pendingMeeting`、`digestTimer`、`lastProgressAt`、`persistedEpoch`、`dbg` 计数。
- **注释要点**：`inboxInjected` 与 `inboxSuppressed` 的用途（每提示词最多一次 inbox 段、避免同一批邮件重复出现）在 1199–1207；`inflight` 的 `kind` **必须随回合走**（`wakeKind` 会被后一次唤醒覆盖，若在 `onMemberEnd` 读它会把回复归到错误的提问，1214–1218）；`lastMeetingId` 让"会后才到的发言"仍能作为明确标注的补记落盘（1221–1225）；`pendingMeeting` 是**从不抢占验证**的停放位（1226）。
- **file:line**：1185–1230。**标签**：`[RESUME]` `[MAILBOX]` `[SCHED]`

#### M-A25 · 路径组合、沙箱根核对与两条"类守卫"
- **逻辑**：
  - `sessionCwd()` 取 `rootAgent.session.header.cwd`（1245–1248）；`workspaceRoot()` = 会话 cwd，否则 `sandboxPolicy.workspaceRoot`，否则 `'.'`（1268–1274）。
  - **G-7 沙箱根不一致告警**：一次/会话比较"策略声明的可写根"与"会话工作目录"，不一致时记 `sandboxPolicyMismatch`（含 `at/expected/policyRoot/note`）并 `console.error`；**只诊断、不拒绝写**（v5 无法加宽/收窄宿主围栏）（1236–1267）。
  - 路径：`vibeRoot='<ws>/VibeMath'`；`projectRoot=vibeRoot/Projects/<project>`；`instRoot=projectRoot/Institutes/<institute>`（1275–1277）；**成员可见面**用 CWD 相对形式 `instRootRel()`/`instRel(rel)`（DEFECT A：成员自己的文件工具以会话 cwd 为基准，写成 institute 相对会造出树外杂树，1278–1285）。
  - `memberPathContractOk()`：比较**两个组合**（提示词广告的 `instRel(probe)` vs 框架实际写读的 `instRoot()+probe` 去 workspace 前缀）——同源比较，防止"文档说写到 A、框架只读 B"这类 v4 缺陷重生（1286–1306）。
  - `leanPathContractOk()`：提示词打印的 `formalRootRel()`、文档 `instRel`、工具短形式三者经 `leanAbsPath` 必须都解析到框架用到的同一绝对路径（1307–1328）。
  - 两者在 `ready()` 里跑，坏则记 `noteLoadProblem`（1398–1402）。
- **file:line**：1236–1328。**标签**：`[CONTROL]` `[AUDIT]` `[RESUME]`

#### M-A26 · fs 接触面与写结果语义
- **逻辑**：`getPolicy()` = `sandboxPolicy.resolve({session:rootAgent.session})`（失败回 `{}`）（1330–1335）。`readTextAbs(p)`：`fs.resolve` → `fs.stat` 为 `undefined` 视作"无文件" → `fs.readText`；任何异常 ⇒ `undefined`（1336–1337）。`writeTextAbs(p,content)`：`fs.writeText(t, content, undefined, undefined, policy)`；**返回的是 `FsWriteOutcome`（`{operation,version,before,after}`）**，`undefined/null` 记作 `{operation:'unknown'}`（stub fs 的"未知但成功"），**真实失败以 reject 表达并被转成 `undefined`**（1338–1350）。`readTextRel/writeTextRel` 以 `instRoot()` 拼相对路径（1351–1352）。
- **file:line**：1330–1352。**标签**：`[CONTROL]` `[RESUME]`

#### M-A27 · `ready()` / `state()` / `inst()` / `instituteAt()` 与 `prematureReads`
- **逻辑**：
  - `awaitBackendLoad()` 是**唯一** await 后端 load 的调用点（敏感性探针依赖它唯一，1360–1366）。
  - `ready()`（**只做一次会话级动作**）：await load → `loadSettled=true` → 若 `!leanRecoveryDone` 则 `recoverLeanJobs()`（**Lean 崩溃恢复一次/会话，在状态文件折入之后**，残留 `Formal/Jobs/*.json` 要么重排、要么显式 interrupted，**永不静默变 `passed`**，1389–1394）→ `refreshMathLine()`（1396–1397）→ 两条路径契约自检（1398–1402）。
  - `state()` **同步**设计（整个 fold 通过它读）：`ensureLoaded()` **只启动**加载（不 await）；若 `!loadSettled` 则 `prematureReads += 1`（MEDIUM 8：把"读发生在首次成功加载之前"**变成可观测计数**而不是静默空读，1371–1382,1405–1425）。SAFE 消费者清单（注释）：**每个 registerTool handler、`/v5` 命令、`commit()`、`schedulePass()`**；UNSAFE 是任何其它同步消费者（1410–1418 附近的注释，1376–1382）。
  - `inst()` = `state().institutes[key] || emptyInstitute(...)`（1426–1429）。
  - `instituteAt(np,ni,nkey)`：用 `loadAt` **读另一个 (project,institute) 的状态文件**（`configure` 切身份前必须知道目标机构是否已存在——这是 audit H1 的"接管而非覆盖"），1430–1438。
- **file:line**：1360–1438。**标签**：`[RESUME]` `[AUDIT]`

#### M-A28 · 载入/写失败诊断缓冲与 `commit()` 的恢复语义
- **逻辑**：
  - `pendingLoadNotes[]`（最多 5 条）缓冲失败文本；`noteLoadProblem(text)` 去重截断 300 字（1439–1447）。
  - `stateWriteFailures` 计数（MEDIUM 7）＋ `lastLoadProblem`（S2 的"现有文件被拒"原因）＋ `loadProblemLog[]`（**会话级**日志，最多 10 条；F1 修复：旧实现只写进 `stateCache`，下一次 `state()` 就把它覆盖掉，`report()` 永远打印不到，1451–1460）。
  - `drainLoadNotes()`：把 pending 追加进 `loadProblemLog` 与 `stateCache.diagnostics`（保留最后 50），**只在有 stateCache 时消费**（1465–1473）。
  - `commit(type,data)`：`await awaitBackendLoad()` → 取 `backend.loadedFor()` → `stateCache = await backend.commit(type, {version:PROJECTION_VERSION,key, ...data})` → 失败时 `noteLoadProblem('write REFUSED …')` 并**原样抛出**（1480–1487）→ 若 `!loaded.ok` 再补一条"该文件不可读/版本不符，永不被覆盖"（1488）→ `drainLoadNotes()`（1489）。
  - **从耐久态恢复会话镜像**（1490–1511）：`phase = cur.phase`；**`autoDone = (phase==='solved')`（S1：结论标记是耐久状态，不是会话记忆；否则新会话会对已结题机构重新建所、把新成员盖在旧名册上）**；`params = DEFAULT_PARAMS + normalizeParams(cur.params)`；`reportDroppedStateKeys(cur,dropped,'restore-load')`；`project=cur.project`；`instituteName=cur.institute`。
  - **便捷写入封装**（1512–1537）：`patchInstitute`、`putMember`、`putTask`、`putMessageMake`（**只保留 fold 内分配器形态**；`putMessage/putMeeting/putCounters` 已**故意删除**，复用任何一个都会重新引入静默丢对象的竞态，1516–1521）、`putSolve`、`ackDelivered`、`putDebate`、`putVerdict`（**写入口唯一盖章点 `sealRecord`**，1527–1529）、`markProgress`（写 `lastProgressAt` + `artifactCount`，1534–1537）。
- **file:line**：1439–1537。**标签**：`[RESUME]` `[AUDIT]` `[STATUS-PANEL]`

### D. S5/S6/S7/S8/S9/S10/S11/S12/S13/S18 机制（1539–2896）

#### M-A29 · S5 静止提示（框架只推荐、不驱动）
- **入口**：`schedulePass` 分支 (d)（9305–9320）→ `emitStallNotice()`；`stallNoticeMs()`/`stallNoticeView()`/`stallWaitingList()`。
- **逻辑**：阈值语义 = **静止提示阈值**（键名 `stallAutoMeetingMs` 保留以不破坏既有配置/文档计数）；**负值 ⇒ 关闭（0 不能用：`posMs(0)` 会落回默认）**（1543–1549）。`stallWaitingList()` 只列**三类可达来源、最多 3 条**：① 被挡任务 ② 无人认领任务 ③ 最久无动作的在册成员（含方向与闲置秒数）；无则给一句兜底（1551–1574）。**幂等键 = `sinceAt`（= `lastProgressAt`）**：同一静止片段**最多一次**，且 `stallNotice` 是**耐久标记** ⇒ 重启不重发（1575–1579）。提示发出时：`patchInstitute({stallNotice:{at,sinceAt,waiting}})` ＋ 群聊公告说明"框架只提示、不驱动"（1580–1587）。注释明确：提示**不是**程序动作（不召集/不散会/不收束/不推进/不代表态），chair-first 仍归 R4/H2（1539–1542）；提示分支**不得以 `return` 结束**（否则 heartbeat/digest 不再武装，机构在提示后冻结，`docs/07:247`）。
- **字段**：`stallNotice{at,sinceAt,waiting[]}`（耐久，走 fold 白名单 637）。
- **file:line**：1539–1587,9305–9320。**标签**：`[STATUS-PANEL]` `[SCHED]` `[CONTROL]` `[RESUME]`

#### M-A30 · S6 临时授权与撤回（`vibe_v5_grant` #47 / `vibe_v5_revoke` #48）
- **入口**：`grantTool(memberId,a)`（1664–1728）、`revokeTool`（1730–1753）；工具注册 `:11162–11163`。
- **具体逻辑（拒绝码齐全）**：
  - 仅院士（`V5_NOT_ACADEMICIAN`，1668–1670）；**任何 `/(At|Ms)$/i` 键一律拒**（`V5_INVALID_ARGUMENT`，"时间由框架设置（S6）"，1671–1674）；**`expires_on` 也拒**（1675–1677）；`command ∈ GRANTABLE_COMMANDS=['assign','prioritize','nudge','convene']`（1595，1678–1681）；`grant_scope ∈ ['meeting','verify','once']`（1596,1682–1685）；`why` 必填（1686–1687）；`to` 必须是**在册成员**（`V5_MEMBER_NOT_FOUND`）且 kind ∈ {academician,researcher}（**列席/受邀/临时工 ⇒ `V5_NOT_VOTER`**，且**校验先于写台账**，1688–1694）；`meeting` 范围需进行中会议（`V5_NO_OPEN_MEETING`）并记 `meetingId`；`verify` 范围需进行中验证并记 `verifyTarget`（1695–1704）。
  - **同值幂等**：同 `{to,command,grantScope,meetingId,verifyTarget}` 且 `grantActive` ⇒ `{ok:true,deduped:true}`，**不重复入账、不刷新 `at`**（1705–1708）。
  - 入账：`grants[]` append-only，id 由台账里 `^g-\d+$` 的**最大值 +1**（`g-N`）；字段 `{id,by,to,command,grantScope,at,why,expiresOn,meetingId,verifyTarget,usedAt,revokedAt,revokedBy,expiredAt}`（1709–1722）；并广播一句（明确"不产生新票权"）（1723–1727）。
  - **生效判定是事件派生、不用定时器**（`grantActive`）：已撤回/已记账失效/`once` 已用/会议或验证"已不是当时那个"⇒ 失效（1604–1613）。`grantEffective` 扫台账取第一条生效（1614–1620）。
  - **单一谓词 `canDo = 默认表 ∩（阶段允许由各权限点自担）− 撤回`**（1643–1649）；`defaultAllowed`：office 全权；`end_verify` 仅院士；`board`/`poll_open`/`poll_close`/`meeting_level`/`secretary` 仅院士；`result_record`/`minutes` = 院士 ∪ **当次会议记录人**；`assign/prioritize/nudge/convene` = 院士 且 `academicianLeads`（1621–1642）。`once` 授权在**获批那一刻**消费 `usedAt`（1650–1654）；`gateDo` 是权限点统一入口（放行并消费，或返回具名拒）（1655–1661）。
  - 撤回：`grant_id` 或 `to+command`；`why` 必填；已撤回 ⇒ `deduped`；写 `revokedAt/revokedBy/revokeWhy` 并**广播**（1729–1753）。
- **持久化**：`grants[]` 耐久（fold 白名单 640–643）；`expiresOn` 是**字符串标签**（`once`/`meeting:<id>`/`verify:<target>`），不是时间戳。
- **file:line**：1589–1753。**标签**：`[CONTROL]` `[AUDIT]` `[CHARTER]` `[RESUME]`

#### M-A31 · S7 投票板（开板/投票/截止计票；两个门槛各算各的）
- **入口**：`pollOpenTool`（#49）/`pollVoteTool`（#50）/`pollCloseTool`（#51）；注册 `:11164–11166`。
- **具体逻辑**：
  - **开板**：仅院士或所办（`canDo('poll_open')`，1827–1828）；时间键一律拒（1817–1822,1829）；**必须挂在进行中的会议**下（`V5_NO_OPEN_MEETING`，1831）；`question` 必填；`options ≥2`、非空、**不得重复**；`mode ∈ {single,multi}`；**`min_votes` 必填正整数且不得超过 `voterCount()`**（`V5_INVALID_ARGUMENT`，含"没有默认值"的理由：默认成 m 就等于混用两门槛 K13）（1832–1852）；`single` 不接受 max/min（固定 1）；多选须 `1 ≤ min ≤ max ≤ 选项数`（1853–1863）；`secret` 默认 false（记名）、`allow_abstain`/`allow_revote` 默认 true（1864–1866）。
  - **同时只允许一张 open 板**：同值（question+options+全部规则）⇒ `deduped`；不同内容 ⇒ 具名拒（1867–1874）。入账 `ballots[]`：`{id:'b-N',by,question,options[{id:'o-k',text}],rules{mode,max,min,minVotes,secret,allowAbstain,allowRevote},at,meetingId,phase:'open',votes:[],closedAt,closedBy,result:null}`（1875–1889），广播**开票规则快照**并把两个门槛并列写明（1890–1896）。
  - **投票**：非 `voters()` ⇒ `V5_NOT_VOTER`（临时工的参考意见会**转达给表决者**后拒绝，1905–1910）；`ballot_id` 缺省只作用于当前 open 板；板非 open ⇒ 具名拒（截止后只能走复议）（1911–1914）；`allow_revote=false` 且已有票 ⇒ 拒（1917–1918）；`abstain:true` 需 `allow_abstain`（1919–1922）；选项可给 id 或**原文**，重复选项拒；`min/max` 越界拒（1923–1935）；**同值重投 ⇒ `deduped`**（1936–1941）；改票写 `revotedAt`（1942–1952）；广播只报**进度**（已投 x/y、门槛、法定人数、未投者），**不广播逐人选择**（1956–1959）。
  - **截止计票**：仅院士或所办（1966–1967）；已 close ⇒ `deduped`（不重算不重播，1973）；`ballotSettled(b) = cast >= rules.minVotes`（**只读 minVotes 与已投数**，1770）；`ballotQuorumReached = pending.length===0`（1771）；result 把**两个门槛并列**：`{cast,valid,abstained,invalid:0,minVotes,satisfied,settled,outcome:'recorded'|'unsettled',m,quorum_reached,pending[],secret,tally}`（1978–1986），`phase:'closed'`+`closedAt`+`closedBy`（1988–1989），广播点名未投票者（1990–1995）。
  - 公开视图 `ballotView`：**secret 板只给聚合**（逐人选择仅供计票，永不进公开面）；记名板才带 `ballot[]`（1781–1816）。
- **持久化**：`ballots[]` 耐久（fold 白名单 646–649）；追加式台账，`phase` 单向 `open→closed`，复议可重开（见 M-A33）。
- **file:line**：1755–1997。**标签**：`[CONTROL]` `[AUDIT]` `[RESUME]`

#### M-A32 · S13 决议台账与检索（`vibe_v5_result_record` #55 / `vibe_v5_resolutions` #56）
- **入口**：`resultRecordTool`（2119–2193）、`resolutionsTool`（2195–2215）；注册 `:11172–11173`。
- **具体逻辑**：
  - 时间键一律拒（2120–2122,2196–2198）；权限 `canDo('result_record')` = 院士 ∪ **当次会议记录人**（2123–2126）；**必须在进行中的正式会议内**（无会议 ⇒ `V5_NO_OPEN_MEETING`；`light` ⇒ **复用 `truthWriteRefusal` 唯一判定点**，2127–2128）。
  - `op:'supersede'` 分支：需要 `of` 与 `by`（**都是既存决议、互异**）、不得二次取代、`by` 自身已被取代 ⇒ 拒、同值 ⇒ `deduped`；**只改 `resolutions[]` 内字段**（`supersededBy/supersededAt/supersededByWhom`）⇒ 旧条目保留、`effectiveAt` 不变（2131–2156）。
  - 落库：`text` 必填、`≤RESOLUTION_TEXT_MAX(1000)`；`kind ∈ ['resolution','solve','org','procedure']`；`actions[].who` 必须是在册成员（**临时工不可**）、只收相对 `due_in`（2167–2177）；同值（同 meetingId+target+text）⇒ `deduped`（2179–2180）；记录 `{id:'res-N',by,at,meetingId,target,kind,text,actions[{who,due_in,state:'open'}],effectiveAt:at,retroactive,declaredAt,supersededBy:''}`（2181–2186）；广播（2187）。
  - **`latestResolution()` 是"最近一条**未被取代**"的唯一口径**（2108–2117），供 `res:latest` 引用锚、`status.resolutions.latest_*`、`report()` 三处同源；全部被取代 ⇒ `null` ⇒ 悬空拒（绝不回落）。
  - 检索：维度 `id/target/meetingId/kind`；`limit` 钳到 **[1,50]**、默认 10；取**末尾 limit 条后反转**（2199–2214）。
- **持久化**：`resolutions[]` 耐久 append-only（fold 白名单 674–678）。
- **file:line**：1999–2215。**标签**：`[AUDIT]` `[CHARTER]` `[RESUME]`

#### M-A33 · S9 少数意见入档 + 复议（`vibe_v5_reconsider` #52）
- **入口**：`reconsiderTool`（2742–2868）；`putVerdict` 写入口盖章（1529）；注册 `:11167`。
- **具体逻辑**：
  - `sealRecord(rec)`（**唯一盖章点**，幂等）：若 `closed && !sealed` ⇒ 追加 `minority[]`（逐人 `{by,prob,reason,at}`）、`minorityCount`、`sealed:true`、`threshold{m:m 或 quorumM(), floor:reconsiderFloor()}`、`effectiveAt=closedAt||now()`、`reconsiderations:[]`（2720–2732）。**少数意见定义**：与最终 `outcome` 不一致者；**无胜方**时＝与多数侧不一致者；**弃权/无法判断（非有限 prob）/未表态都不算**（2701–2718）。
  - 复议目标：`verdicts[target]`，或 `ballot:<id>`/`ballot_id`（2756）。
  - 资格**记录派生**：无票/未参与 ⇒ `V5_NOT_VOTER`；有明确胜方 ⇒ **仅当初胜方之一**；无胜方 ⇒ 任一参与者（**不得以"无胜方"拒收**，D5a）（2800–2816）。
  - **同一轮只受理一次**（同 `why` ⇒ `deduped`；不同 `why` ⇒ 拒）；总轮数受 `verdictMaxRounds`（`curRound >= maxRounds` ⇒ 拒）（2817–2827）。
  - **门槛只升不降**：`after = max(before, reconsiderFloor, quorumCap)`（2828–2832）；entry 记录 `thresholdBefore/After/raisedBy/onlyUp/eligibility/evidence`（2834–2839）。
  - **append-only**：旧结论/票面/unable/minority/closedAt/endedBy 进 `previousRounds[]`；`previousOutcome`；旧结论标 `supersededBy`；新一轮 `votes:{}`、`unable:{}`、`minority:[]`、`sealed:false`、`closed:false`、`round+1`，并删除 `outcome/reason/closedAt`（2840–2860）。广播（2862–2863）。
  - **板的复议**：只针对已 close 板；须是该板**参与者**；每板只一次；`bAfter = max(rules.minVotes||cap, reconsiderFloor, quorumCap)`；写 `reconsiderations[]`、`supersededBy`、`threshold{m,floor}`、`reopenedAt`、`reopening:true`、`priorResult`（旧计票留档）并**把板重开**（`phase:'open'`, `result:null`）（2757–2794）。不记名来源**只回聚合面**。
- **持久化**：写回 `verdicts`（耐久）或 `ballots[]`（耐久）；均 append-only。
- **file:line**：2695–2868。**标签**：`[AUDIT]` `[RESUME]` `[CONTROL]`

#### M-A34 · S8 票与发言时序分离（表决期冻结发言）
- **入口**：`speechGate(callerId)`；`speechFrozen()`/`speechFrozenView()`。
- **逻辑**：**派生判据 = 存在一张 `open` 投票板** ⇒ 冻结（2878–2883）；只拦**成员发言入口**（`vibe_v5_say` ＋ 会议唤醒里的发言交付），**系统/框架消息照常**（2874–2877）；例外：**程序异议 #46（D2 救济）与院士/所办（chair-first）不受限**（2893–2894）；拒文点名当前板并说明"举手队列保留、解冻后按原顺序放行"（2888–2896）。**不改阶段、不收束、无定时器、无"到点解冻"**（2874–2877）。
- **file:line**：2870–2896。**标签**：`[CONTROL]` `[AUDIT]`

#### M-A35 · S10 引用边界与私聊补记（`vibe_v5_say` 的 quote/supplement 面）
- **入口**：`sayQuote(callerId,args)`（2621–2693）→ `say()`；`resolveQuoteAnchor(ref)`（2490–2615）；注册 `:11133`。
- **具体逻辑**：
  - 时间键一律拒（2623–2624）；`to` 决定 kind：`voters`→`voters`、给 `to`→`dm`、否则 `chat`（2625–2626）。
  - **私聊补记（G5）**：`supplement_of` 必带 `why`；源消息必须存在且 `kind==='dm'`；**只能由该私聊的发送者本人**发起（2630–2638）；成功后耐久追加 `chatSupplements[{of,by,at,publicRef,why}]`（**只记"何时由谁补记到哪"，不搬原私聊正文**）（2684–2690）。
  - **引用**：`quote_refs[]` + `quote_ref` 合并；**总数 > `quotesPerMessageMax`（默认 2）⇒ 具名拒**（2641–2647）；逐锚 `resolveQuoteAnchor`，**悬空即拒**；**同域校验**：锚的 `meetingId` 必须等于当前会议 id（**跨会议/跨域拒**，2648–2656）；`quote_excerpt` 可覆盖，`truncateExcerpt` **确定性**（压空白＋≤200 字＋`truncated` 标记，2482–2487）；**深度 > `quoteDepthMax`（默认 3）⇒ 折叠**（`collapsed:true`，`excerpt` 清空，只标锚不搬原文，**不拒**）；**环形引用只标注**（2657–2680）。
  - **四类锚**（2489–2614）：① `res:` —— 已落库决议（`res:<n>`/`res:latest`），未落库/全被取代 ⇒ 悬空拒，带 `supersededBy` 可引但须标明"已被复议"；② `mt-<id>#speech-<who>-<n>` —— **读耐久会议纪要文件**解析（悬空可判）；③ `msg-<N>` —— 只在**未投递**消息里存在（**写入时快照**）；已投递 ⇒ 悬空拒（正文不保留）；`kind==='dm'` ⇒ **未补记即拒**，补记后解析到**补记本**并带 `viaSupplement`；④ `ballot:<id>` / `ballot:<id>#vote-<who>` —— **不记名板只可引聚合**，逐人锚拒。
- **持久化**：`chatSupplements[]`、`messages[].quote/quotes` 耐久；锚解析**只读、不改任何状态**（`docs/03-interface-contract.md:231`）。
- **file:line**：2469–2693,11133。**标签**：`[CHAT]` `[MAILBOX]` `[AUDIT]`

#### M-A36 · S12 会议分级（formal/light）与"简流程不得产出实体定论"
- **入口**：`setMeetingLevel(callerId,a)`（2240–2265，经 `vibe_v5_meeting {formal_agenda}` 与工具注册 `:11089`）；判定 `meetingLevelOf(mn)`/`isLightMeeting()`/`truthWriteRefusal(what)`。
- **逻辑**：等级**派生**自 `meeting.kind`（`verify-request`/`solve-vote` ⇒ formal；`sync`/`division` ⇒ light），可由 `formal_agenda:true` **显式覆盖**（2225–2232）；**唯一判定点 `truthWriteRefusal`** 返回具名 `V5_INVALID_ARGUMENT` 并给出"由院士设为正式或另开决议类会议"的出路（2233–2238）；设等级仅院士、`canDo('meeting_level')`、时间键拒、**同值 ⇒ `deduped`（不写事件）**、真变更写 `meeting.formalAgenda/levelAt/levelBy` 并广播（2240–2264）；**不自动升降级、不自动拒绝开会、不改阶段/收束/无定时器**（2217–2224）。
- **调用点**：`resultRecordTool`（2128）、`motionTool`（2362）、`minutesTool`（2454）。
- **file:line**：2217–2265。**标签**：`[CHARTER]` `[CONTROL]`

#### M-A37 · S11 记录人（`vibe_v5_secretary` #53）与纪要条目（`vibe_v5_minutes` #54）
- **逻辑**：
  - **指定/撤销**（2279–2327）：仅院士（`canDo('secretary')`）；时间键拒；`who` 必填（或 `revoke:true`/`op:'revoke'`）；被指定者必须是**在册成员**且**不得是院士/所办**（"主持人不得兼任唯一记录者"）、**不得是临时工**（`V5_NOT_VOTER`）；**当次会议绑定**（无会议 ⇒ `V5_NO_OPEN_MEETING`）；同值 ⇒ `deduped`（不追加台账）；撤销把 `{who:prev,revokedAt}` **追加**到 `secretaries[]`；`meeting.secretary/secretaryAt/secretaryBy` 就地更新；广播。
  - **写纪要**（2404–2467）：`canDo('minutes')` = 院士 ∪ 当次会议记录人；`op:'confirm'` ⇒ **S15 上次纪要确认**：`of` 缺省为**时间上最近一场已收束会议**，必须确实在历史会议里；`fact_fix` 限长 1000；同值 ⇒ `deduped`；写 `minutesConfirmations[]`（append-only）并把**事实更正只追加**到**当次会议纪要**的独立小节 `## 上次纪要确认`（**绝不改写旧纪要**）（2416–2436）。无 `entry` ⇒ **只报缺口** `gaps[]`（记录人补充/议程/发言区/投票区），**不自动补全**（2440–2449）；`entry_kind:'decision'` 且简流程 ⇒ `truthWriteRefusal`（2453–2454）；同 `text` ⇒ `deduped`；`meeting.recordEntries` 追加并 `appendMeetingTail` **只追加**（绝不重写 `### <who>` 小节与两区）（2455–2466）。常量 `SECRETARY_ENTRY_MAX=1000`、`NO_SECRETARY_NOTE='未指定：由框架自动落盘，无成员责任人'`（2274–2276）。
- **持久化**：`secretaries[]`、`minutesConfirmations[]` 耐久（fold 白名单 670–684）。
- **file:line**：2267–2327,2403–2467。**标签**：`[AUDIT]` `[CHARTER]` `[RESUME]`

#### M-A38 · S18 动议与附议（`vibe_v5_motion` #23 / `vibe_v5_second` #38）
- **逻辑**：`motionTool`（2330–2378）：只在**进行中的会议**内（否则 `V5_NO_OPEN_MEETING`）；时间键拒；`op:'withdraw'` ⇒ 需 `motion_id`，不存在 ⇒ 拒，已 `withdrawn` ⇒ `deduped`，已 `carried` ⇒ 拒（**单向**），撤回权 = 本人 ∪ 院士/所办 ∪ `canDo('board')`；提出需**在册 active** 成员、`kind ∈ topic|procedural|resolution`、`text` 必填 ≤2000、`resolution` 在简流程 ⇒ `truthWriteRefusal`、同值（同会议+kind+text 且仍 proposed）⇒ `deduped`；记录 `{id:'m-'+list.length+1,meetingId,kind,text,by,at,state:'proposed',secondedBy:[],needed:motionSecondsRequired(),carriedAt,withdrawnBy,withdrawnAt,reason}`。`secondTool`（2380–2402）：需在册 active、**不可附议自己**、重复附议 ⇒ `deduped`（计数不增）、`withdrawn` ⇒ 拒、`carried` ⇒ `deduped`；`secondedBy.length >= max(1,needed)` ⇒ **当刻 `carried`**（`carriedAt=now()`）。`motionSecondsRequired()`（2024–2028）读耐久 `params.motionSecondsRequired`，≥1 整数否则 1（**无第二份默认值**）。
- **持久化**：`motions[]` 耐久 append-only（fold 白名单 685–690）。
- **file:line**：2018–2028,2328–2402。**标签**：`[CHARTER]` `[CONTROL]` `[RESUME]`

### E. 名册、章程、状态块、等待、目录、通信、生命周期（2898–3730）

#### M-A39 · 名册助手与法定人数快照（含 `rosterVersion` 防漂移）
- **逻辑**：`activeMembers()`（`phase==='active'`）、`memberById`、`voters()`（active 且 kind ∈ {academician,researcher}）、`voterCount()`（2899–2902）；`quorumMFrom(vc)=max(1,min(max(1,quorumCap),vc))`、`quorumM()=quorumMFrom(voterCount())`（2903–2907）。**DEFECT B 修复**：办公室 digest 与 status 在同一窗口报出不同 m（各自在不同时刻算选民集）⇒ 引入 `rosterVersion()`（由"成员总数 + 排序后的 `id:phase`"构成）与 `rosterSnapshot()={version,m,voters[],voterCount,started}`；**每个带法定人数的视图都读同一个活快照并携带 `rosterVersion`**，可检测陈旧读者（2908–2928）。`quorumView()`：未启动时显式 `{m:0,voterCount:0,started:false,phase:'not-started',next:{…vibe_v5_start}}`（DEFECT 2："m=1 且 voters=0"会被读成"已满足门槛"）（2929–2953）。`memberDiagnosis(what,memberId)`（**错误码不变、答复点名状态与下一步**，四种形态：未启动/无在册/无法识别调用者/名册无此人）（2954–2992）。`byChild(childId)`（2993）；`academicianId()`（活名册）、`academicianIdWith(extraMember)`（把**尚未提交**的入职者算进来，用于其自己的章程；两者分离是为了让"无领头人章程"的敏感性探针保持可达）（2994–3010）。
- **file:line**：2898–3010。**标签**：`[ROSTER]` `[CHARTER]` `[STATUS-PANEL]`

#### M-A40 · 研究所章程（入职即冻结的 persona 文本）
- **逻辑**：`rosterLine(extraMember)` 输出"在册院士/常驻研究员/临时工（含雇主）"快照（3018–3032）；`LIB_SPEC` 定义四个成员库目录与卡片格式、三条硬要求（价值程度/动机用途计划/概率估计；只写自己的库；推荐直接用 fs 写、`vibe_v5_record_*` 只是便捷器）（3033–3062）。`orgCommon()` 按**活的院士 id**（可能为空）生成两种组织叙述（有院士 7 条职责 vs 无院士集体商议）（3064–3104）；`ACAD_ORG` 是院士专属的组织职责与**四条边界**（票等重、分派工作≠分派结论、成员可据理反对、不得自我扩张编制）（3106–3129）。`charterFor(member)` 生成十节章程：【一】编制与同事（含 `rosterLine` 的**入职快照**，明写"权威名单以每轮状态块为准"）【二】通用规章 10 条（含 S25-C 三条：辩论开启与对象由院士决定；只有"正式证明/证伪且 locked"的命题可作辩论命题；登记即定稿）【三】资料库与卡片格式【四】组织与协调【五】表决与定论（`m=min(上限,人数)`、布尔票一致才可 Verified、中间值记为弃权/存疑但入辩论录与平均、两段表决、轮次上限 `verdictMaxRounds`）【六】每轮默认节奏【七】雇佣与解雇【八】任务板（CAS、认领即拥有、院士可直接分派）【九】上下文与纪律（**明写"压缩后本规章依然有效，因为它在你的人设里、不在对话里"**）【十】停止（**全体有表决权者一致认为已解决**才停；外部可随时干预）（3131–3361）。
- **关键设计**：章程**写在 persona 里**（耐久 continuable descriptor 的一部分）⇒ **跨冷启动与压缩都存活**，结构性地移除了 v4 的"压缩后重申规则/每轮 [核心规则重申]+[CONTEXT COMPACT]"补丁（3012–3017）。
- **冻结时点**：`newMember` 里 `member.persona = memberPersona(member)` 在 **fold 内、id 已知之后**捕获（3658–3672）——被宿主上限拒的成员之后由 `resume` 重建时**绝不重算章程**（否则"你入职时的在册编制"会变成恢复时快照，也会静默丢 `staffPersona` 变更，3658–3662）。
- **file:line**：3012–3361,3646–3679。**标签**：`[CHARTER]` `[ROSTER]` `[RESUME]`

#### M-A41 · 每轮状态块 `briefBlock`（身份必填）
- **逻辑**：`briefBlock(member, roundNo)` **强制要求 `member.id`**，否则 `throw v5err('V5_INTERNAL', …)`（3363–3379）。内容：`[状态]` 身份+kind+轮次+法定票数 m（0 人时显示"未启动"）+选民数；`[在册]` 活名册；`[未就位]`（`phase` 非 active/dismissed —— 静默省略会让失败的 provisioning 对全所不可见）；`[形式化]`（**运行期旋钮**，逐轮算，不冻进章程；`formalOn()` 时给强制/鼓励、已通过/已阻塞数、TODO 项数）；`takeLeanNoticesFor(member.id)`（**已结算的异步编译结果只在下一轮提示里公告恰好一次**）；`[任务板]`（进行中/可认领/我负责；我负责的逐条含验收与分派者；描述取首行）；`[新到的消息/通知]`（**若 `inboxSuppressed` 则跳过** —— 由 `promptFor` 统一负责，避免同一批邮件在一个提示里出现两次）（3380–3421）。
- **身份缺陷的教训**（注释）：该块曾读可变的 `currentMember` 全局，而建所路径是在子代理启动**之后**才赋值 ⇒ 每个成员的入职简介都在说**上一个**成员（院士被告知自己是"?"），模型的自模型/库路径/票全错（3363–3375）。
- **file:line**：3363–3422。**标签**：`[STATUS-PANEL]` `[ROSTER]` `[RESUME]`

#### M-A42 · 活动等待器（一次性、只对未来生效）
- **入口**：`vibe_v5_wait` → `waitForActivity(ms,signal)`；`notifyActivity()`。
- **逻辑**：`waiters:Set`；`notifyActivity()` 取走**当前全部**等待者并 `resolve({timedOut:false})`（**一次事件只唤醒一代等待者**，3428–3434）。`waitForActivity`：`timeout_ms` 必须是 **[10000,3600000]** 的整数，否则 `V5_INVALID_TIMEOUT`（3435–3439）；注册条目、支持 abort（`V5_WAIT_ABORTED`，reason 是 Error 则原样 reject）、超时用 **`ctx.timeout`（fiber 拥有的 disposer）** ⇒ 卸载/中止时定时器被清理（3440–3465）。设计意图：**用它替代 v4 的 `activityTimeoutMs` 轮询**，真正空闲时不吃 token（3424–3427）。
- **file:line**：3424–3466。**标签**：`[SCHED]` `[CONTROL]`

#### M-A43 · 项目目录树创建（fs 优先，shell 兜底）
- **逻辑**：`mkdirs()` 目标目录：`Shared/{Chat,Meetings,Debates}`、`State`、`Problems`、`Formal`、`Formal/Jobs`、`Verified/Lean`、`Computation`，每个 active 成员的 `Members/<id>/{Progress,Propos,Methods,Subproblems}`，以及**全局**（挂 `vibeRoot`、跨项目复用）`Formal/Lib`、`Formal/Proved`（3490–3500）。**优先走注入的 `fs`**（逐目录写 `.keep` 探针；本地/沙箱后端写文件时会递归建父目录）⇒ 在策略内；**只有** fs 缺失或失败时才用平台 shell（`New-Item`/`mkdir -p`）兜底，并回报 `via:'fs'|'shell'`（3484–3521）。`runShell` 用 `subprocess.spawn({argv,cwd,stdio:{stdin:'ignore',stdout:'inherit',stderr:'inherit'},graceMs:20000})`（3472–3483）。
- **file:line**：3468–3521。**标签**：`[CONTROL]` `[MAILBOX]`（目录面）

#### M-A44 · 通信：耐久每收件人信箱（`say`/`notice`/`pendingFor`/`frameLine`）
- **入口**：`say(from,opts)`（3531–3574）；`notice(memberId,text)`（3580–3585）；消费方 `promptFor`/`wakeWithInbox`（9078–9110）、`schedulePass`（9283–9304）、`vibe_v5_message`（办公室声音，`:11077`）、`vibe_v5_say`（成员声音，`:11133`）。
- **为什么由框架中继**：DSH 自己的邻近发送**受邻接限制**（只有直接父 ↔ 直接可续子代理），成员之间无法直连；所以所内一切消息**由框架中继**，投递时以**根代理为传输身份**、在正文里记**真实发送者**；投递是**每收件人一份**（精确移植 DSH 信箱"每条消息恰好一个 targetId"）⇒ **一个人的确认永远吃不掉另一个人的副本**（3523–3530）。
- **具体逻辑**：空文本 ⇒ `V5_INVALID_ARGUMENT`；`to` 解析：`all`/空 ⇒ 除自己外的所有 active 成员；`voters` ⇒ 除自己外的选民；`office` ⇒ 单收件人伪 id；其它 ⇒ 必须在册 active 成员（否则 `V5_MEMBER_NOT_FOUND`），**发给自己 ⇒ `V5_SELF_MESSAGE`**（3532–3548）；无收件人 ⇒ `{ok:true,delivered:0,note:'no other active member'}`（3549）。**所有收件人的消息在同一个 `putMessageMake` 里、用 fold 内分配器一次性铸 id 并一次提交**（旧形状"先读 counters → 本地铸 id → 每收件人 await 一次"会同 tick 撞 id 并被 fold 去重吞掉，而调用方仍报 `ok:true`）（3550–3563）。若 `from==='office'` ⇒ `notePaperConsult('message')`（论文征询计数，"所办与全所交流"这一半）（3564–3567）。随后 `notifyActivity()`（唤醒等待者）＋ `scheduleNext()`（**只启动**一次调度：被点名的消息（dm/office/assign）会被尽快唤醒，普通群聊仍由 digest 门控批处理）（3568–3572）。返回 `{ok,delivered,to:'id,id',ids:[…]}`（3573）。
- **消息记录字段**（3558–3561）：`{id:'msg-N', from, to, kind, text, at}` ＋ 可选 `quote`（单条引用对象）、`quotes[]`（多条）、`supplementOf`。
- **`notice`**：框架是**一等发送者**（`from:'framework'`，`kind:'notice'`）；不能用"成员给自己发"来伪造，因为 `say` 会以 `V5_SELF_MESSAGE` 拒绝、而旧调用**没人检查返回值** ⇒ 成员永远收不到框架反馈（3575–3585）。
- **投递帧 `frameLine`**：按 kind 给出**真实来源**的措辞：群聊/私信/致全体表决者/所办通知/会议/表决；**分派**按 `from==='office'` 区分【所办分派】/【院士分派】（曾把所办分派标成"院士分派"、让接收者去向一个没提问过的人汇报，3606–3610）；督办 `nudge`、框架提示 `notice`，未知 kind 有兜底（3599–3613）。
- **未读查询 `pendingFor(memberId)`**：遍历**耐久 `messages`** 取 `to===memberId` 的全部（即**已投递就没了的"队列减已确认"**语义），返回 `{id,kind,from,at,line}` 并**按 at 升序**（3586–3598）。
- **file:line**：3523–3640。**标签**：`[MAILBOX]` `[CHAT]` `[RESUME]` `[AUDIT]`

#### M-A45 · 投递分级、批量确认与收件箱块（`deliveryDecision`/`ackPending`/`composeInbox`）
- **逻辑**：
  - `deliveryDecision(memberId)`：无 pending ⇒ `{deliver:false}`；**任何非 `chat` 的 kind 都算 urgent** ⇒ 立即投递（`urgent:true`）；纯群聊 ⇒ 投递条件 = `pending.length >= chatDigestMax（默认 12）` **或** `now() - oldest.at >= chatDigestMs（默认 45000，posMs 兜底）`（3614–3627）。**这防止"话痨机构"造成唤醒风暴**。
  - `ackPending(pending)` ⇒ `commit(EV.delivered,{ids})`（只写 id 账本，见 M-A18）（3628–3631）。
  - `composeInbox(pending)`：单条 `[新到的消息]`，多条 `[新到的消息（N 条）]` ＋ 逐行 `  <frameLine>`（3632–3640）。
  - **注入管线（G1，跨边界消费点 X-4）**：`promptFor(member,baseFn)` **先排空信箱**（`pendingFor`），用 `inboxInjected:Map<memberId,Set<id>>` 只把**新**pending 前置成一段；把 `inboxSuppressed.add(memberId)` 后**才**构建 `baseFn()`（使 `briefBlock` 跳过 `[新到的消息/通知]`），finally 移除抑制 ⇒ **每条消息一个提示里恰好出现一次**；**返回 `{text,pending}` 而绝不在这里 ack**（9078–9098）。`wakeWithInbox` **只在 `wakeMember` 真正发送成功后**才 `ackPending`，并**无论成败都清掉 `inboxInjected` 标记**（失败唤醒不得把消息永久压制）（9099–9110）。
- **语义结论（目标 2 直接依据）**：**"未 ack ⇒ 仍可重投"**；投递确认 = 耐久账本；唤醒 = 一次调度 pass 按优先级选人，预算 `maxParallel`。
- **file:line**：3614–3640,9071–9110。**标签**：`[MAILBOX]` `[CHAT]` `[SCHED]` `[RESUME]`

#### M-A46 · 名册生命周期：`newMember`/persona/工具过滤/agent 选项
- **逻辑**：`newMember(kind,opts)`：**id 故意留空**，由 fold 分配器在同一次 commit 里填 id **并**在 fold 内捕获 `persona`（3646–3674）；字段 `{id,kind,childId:'',phase:'provisioning',direction,hiredBy,term,provider:'spawn',persona,error,createdAt,dismissedAt:0,dismissReason}`（3647–3668）。`memberPersona` = `staffPersona`（若设）＋ `charterFor(member)`（3676–3679）。`memberToolFilter`：temp 用 `tempToolAllow/Deny`，其余用 `toolAllow/Deny`；**空 allow 会拒绝一切工具**，所以只有至少一侧有内容时才产出过滤器（"deny-all trap"修复）（3680–3692）。`memberAgentOptions`：`provider`/`model` 非空才覆盖（3680–3698）。`pickProvider`：`subagents.list()` 含 `'spawn'` ⇒ `'spawn'`，否则 `'fork'`，兜底 `'spawn'`（3699–3706）。
- **file:line**：3642–3706。**标签**：`[ROSTER]` `[CHARTER]` `[RESUME]`

#### M-A47 · 宿主在活上限的会话侧处理（预检、一次性告警、活子计数）
- **逻辑**：`childLimitLoggedThisRound` ＋ `beginSpawnRound()` ⇒ **每轮最多一条**可执行告警（不是每个被拒成员一条）（3711–3712）。`liveChildCount()` = 持 `childId` 且 `phase!=='stopped'` 的成员数（被拒成员 `childId===''`，**绝不虚增它自己被丈量的数**）（3713–3718）。`noteSpawnLimitOnce(member)` 打印一次（含本轮被拒者 id）（3719–3725）。`activationLimitText(limit)` 同时供**类型化错误**与**耐久成员记录**使用：点名宿主 `maxActiveSubagents`、给出"调大或 `vibe_v5_fire` 腾位"（3726–3730）。
- **跨边界**：`spawnMember` 是**唯一**创建成员子的地方（3707–3710）；拒绝路径把成员记为 `{phase:'failed',error,failReason:'activation-limit'}` 并抛类型化 `ACTIVATION_LIMIT_REACHED`（X-2，3825–3830）。
- **file:line**：3707–3730。**标签**：`[ROSTER]` `[BUDGET]` `[CONTROL]`

---

## 二、跨边界消费点（为"顺藤摸瓜"而读，非本分片定义）

| id | 消费点 | 作用 | file:line |
|---|---|---|---|
| X-1 | `spawnMember` 的顺序契约 | ① **先 commit 成员为 ACTIVE**，再建 brief（保证 `[状态]/[在册]/m/选民数/入职名册` 都含它自己）；② 标记 busy；③ persona 用 **`member.persona` 冻结值**，缺失才重算；④ `putMember`→`mkdirs`→`writeRosterMirror`→`startWithToolFilter`；⑤ 失败回滚 `busy/wakeKind` **但不动 counters**（旧回滚用 `rounds.delete` 会抹掉被 resume 成员的编号）；⑥ **只有 start 成功才递增 `rounds`/`roundsSinceCompact`**；⑦ 注册 `childOwner`、`inflight{token,kind}`、耐久 `pendingWork`、`turnToolCalls=0` | 3732–3851 |
| X-2 | 容量拒绝的耐久化 | 拒绝 ⇒ `putMember({phase:'failed',error,failReason:'activation-limit'})` ＋ 抛 `ACTIVATION_LIMIT_REACHED`；这是"可延迟重试队列"的**唯一真相**（派生自耐久态，不另立队列） | 3821–3830 |
| X-3 | `wakeMember` 的回合标记 | 先 `clearHeartbeat`、`inflight.set(childId,{token,kind})`（**kind 随回合走**）、落耐久 `pendingWork`、`turnToolCalls` 复位；仅 `sendMessage` 成功才算数 | 3859–3930+ |
| X-4 | 收件箱感知唤醒 | `promptFor` 去重＋`inboxSuppressed`；`wakeWithInbox` **发送成功后才 ack**、失败也清注入标记 | 9071–9110 |
| X-5 | 调度优先级与预算 | `scheduleNext` 蹦床（嵌套调用只置 `reschedule`，最外层循环排空 ⇒ 永远只有一个 pass 在飞）；`schedulePass` 顺序：**重试被容量拒的成员 → 在飞验证 → 会议 → 新验证 → 停放会议 → 论文 → (a) 在办任务（受 `activityTimeoutMs` 节奏门控，防"唤醒→回合→唤醒"无界链）→ (b) urgent 邮件 → (c) 到期群聊摘要 → (d) 静止提示一次**；预算 `maxParallel` | 9136–9320 |
| X-6 | 参数恢复归一 | `syncParamsFromState()` 每次 pass 都做 `DEFAULT_PARAMS + normalizeParams(cur.params)` 并报丢弃键（"绝不采信持久值而不归一"） | 9117–9135 |
| X-7 | `resume()` | 见第三章 | 10237–10296 |
| X-8 | `setPause()` / `initStop()` | 暂停：清心跳、`running=false`、给每个在役成员写耐久 `pendingWork{childId,objective,interruptedAt,reason:'institute-paused'}`；停止：中断所有子代理、清 `childId`、清协调态（meeting/pendingMeeting）、**`putSolve({clear:true})`（耐久清票）**、把所有未收束判定置 `closed:true,outcome:'undecided',reason:'stopped by the office'`、`phase:'idle'` | 10297–10343 |
| X-9 | 工具注册面 | 全部分片 A 机制的入口工具名与描述（`vibe_v5_say/message/members/status/report/set/grant/revoke/poll_*/reconsider/secretary/motion/second/minutes/result_record/resolutions/self_report/chair_proxy/procedural_objection/…`） | 11049–11291 |

---

## 三、标签索引（机制 × 标签）

- `[RESUME]`（断点续跑/恢复）：M-A03, M-A10, M-A11, M-A12, M-A14, M-A15, M-A16, M-A17, M-A18, M-A19, M-A20, M-A21, M-A23, M-A24, M-A27, M-A28, M-A29, M-A30, M-A31, M-A32, M-A33, M-A37, M-A38, M-A40, M-A41, M-A44, M-A45, M-A46（＋X-1…X-9）
- `[HUMAN-INTERVENE]`（人工中途干预）：**本分片没有独立机制**；人工干预的全部落点是：`vibe_v5_configure/start/resume/pause/stop`（:11049–11053）、`vibe_v5_message`（办公室声音，:11077）、`vibe_v5_set`（:11056）、`vibe_v5_finalize_paper`（:11130）、`/v5` 命令；以及 `memberMayRejectAssign`、`paperEditor:'office'` 征询门、`resume` 的重建路径。**注意**：办公室"暂停/继续"只改调度与 `pendingWork`，**不改耐久 phase 语义**（pause 不写 phase；stop 写 `phase:'idle'`）。
- `[CHAT]`（群聊）：M-A35, M-A44, M-A45（所办伪收件箱 M-A13 属信箱）
- `[MAILBOX]`（私发/信箱）：M-A13, M-A17, M-A18, M-A24, M-A35, M-A43, M-A44, M-A45
- `[STATUS-PANEL]`（总目标/计划/子任务面板）：M-A10, M-A20, M-A28, M-A29, M-A39, M-A41（面板本体 `status/report/overview` 与 `vibe_v5_self_report` 的读写属分片 C：`docs/03-interface-contract.md:105–107,129–134`）
- `[ROSTER]`：M-A07, M-A10, M-A12, M-A16, M-A22, M-A23, M-A39, M-A40, M-A41, M-A46, M-A47
- `[CHARTER]`：M-A10, M-A15, M-A23, M-A30, M-A32, M-A36, M-A37, M-A38, M-A39, M-A40, M-A46
- `[BUDGET]`：M-A07, M-A10, M-A23, M-A47
- `[SCHED]`：M-A23, M-A24, M-A29, M-A42, M-A45
- `[AUDIT]`：M-A02, M-A06, M-A10, M-A12, M-A13, M-A14, M-A15, M-A19, M-A20, M-A21, M-A25, M-A28, M-A30, M-A31, M-A32, M-A33, M-A34, M-A35, M-A37, M-A44
- `[CONTROL]`：M-A03, M-A07, M-A08, M-A09, M-A15, M-A21, M-A22, M-A25, M-A26, M-A29, M-A30, M-A31, M-A33, M-A34, M-A36, M-A38, M-A42, M-A43, M-A47
- `[OTHER]`：M-A01, M-A02, M-A04, M-A05, M-A06

---

## 四、专章：断点续跑与恢复（目标 1 的直接依据）

### 4.1 唯一持久化载体与"一条恢复路径"
- **载体**：`<ws>/VibeMath/Projects/<project>/Institutes/<institute>/State/<institute>.v5state.json`（1355）。内容 = **整份顶层状态** `{v:1, institutes:{<project::institute>: <机构快照>}, …未知顶层键保留}`（532,907–1029）。
- **不是宿主会话日志**：DSH 会话持久化**拒绝加载携带未登记事件类型的会话**，除非写入方标 `ignorable:true`，而 `Session.append` 设不了该字段 ⇒ 旧"投影进会话日志"做主存储会让**用户自己的会话不可续**，因此该后端被**删除**（28–36,48–52）。结论：**事件永不进入模型历史（0 上下文成本）；恢复 = 读文件 + fold，只有一条代码路径**，进程内重启与跨进程冷启动走同一路径（28–36）。
- **为什么整快照**：每次 commit 写**全量**快照，且 `JSON.stringify` **推迟到串行链内**执行 ⇒ 晚到的写者一定落"全量最新"，结构上消灭 v4 的 `State/*.json` 损坏/丢写/恢复陈旧这一类缺陷（28–36,1006–1024）。

### 4.2 fold 投影（状态机定义在哪、长什么样）
- **一处定义、两处使用**：`applyV5Event(state,event)` 同时被**内存态**（每次 `commit` 前）与**载入时的文件折入**使用（478–483,1006）。它是**纯函数式**的：**只要有任何变化必须返回新的顶层引用**（`withInstitute` 用 `Object.is` 判断变化，480–481,540–547）。
- **准入**：`event.type` 必须 `vibe5/` 前缀；`event.data` 必须是对象且 `data.key` 是字符串；否则返回原 state（591–595）。12 种事件类型（M-A03）。
- **关键不变量**：
  1. **ids 只在 fold 内铸造**（`makeIdAllocator`，M-A12）；对象与计数器**同一步提交** ⇒ 两个同 tick 写者不可能撞 id，也不会"两边都报成功、其中一个被静默覆盖"（554–562）。
  2. **upsert/dedupe 语义**：member/task 按 id upsert；message 按 id **去重**；meeting 插入按 id 去重；verdict 以 `record===null` 表示删除（694–830）。
  3. **append-only 台账**：grants/ballots/chatSupplements/formalProofs/secretaries/resolutions/minutesConfirmations/motions **只增不改**（S6/S7/S10/S13/S15/S18 的审计面），且**必须显式列入 `patchInstitute` 白名单**，漏一行就**静默丢弃**（文件内在 639/645/651/661/669/675/681/687 处逐个标注"S4–S17 已证"）。
  4. **函数式补丁**：`paper/feedback/grants/ballots/chatSupplements/formalProofs/secretaries/resolutions/minutesConfirmations/motions` 与 `EV.formal.record/todo`、`EV.queue` 接受**函数**，其读改写在 fold 内原子完成 ⇒ 同 tick 多写者不丢更新（612–690,831–870）。
  5. **有界数组**：`delivered` ≤ **500**、`meetings` ≤ **200**、`debates` ≤ **200**、`diagnostics` ≤ **50**、`office` 收件箱 ≤ **10**（484,787,809,819,897）；`messages` 只保留**未投递**消息（788）。
  6. **永不抛出**：任何异常 ⇒ 顶层 `diagnostics` 记一条（含 `at/type/error`）并返回（892–899）。**刻意不学** DSH 团队投影的 `state.failure` 永久闭锁（549–553）。
  7. **未知顶层键保留**（S3）：`withInstitute` 的 `Object.assign({}, state, …)` 保住更新版本写下的键（534–547,896–897）。

### 4.3 白名单（哪些写入能落地）
| 层级 | 白名单形态 | 位置 |
|---|---|---|
| 机构标量/对象 | `project, institute, phase, problem, params, runId, lastProgressAt, artifactCount, meetingOpen, officeRequestsDropped` | 601–611 |
| 机构函数式 | `paper, feedback, chair, stallNotice, grants, ballots, chatSupplements, formalProofs, secretaries, resolutions, minutesConfirmations, motions` | 612–690 |
| 事件对象 | `EV.member/task/message/meeting/debate/verdict/formal/queue/solve/progress` | 694–890 |
| 参数键 | `normalizeParams` 的三张表 `ints/bools/strs/arrs`（**未知键 ⇒ 收集进 `dropped` 并报诊断**，不静默丢） | 9762–9880 |

### 4.4 崩溃恢复（真实断点在哪）
1. **载入闸**：`load()` 按**路径**记住 `loadedPath/loadOk`；换路径 ⇒ 清空 `mem` 重读；**写前必须"该路径读过且成功"**，否则抛 `V5_STATE_NOT_LOADED` 拒绝覆盖（M-A21）。
2. **不可用文件的语义**：文件存在但 JSON 坏 / `v≠1` / 不可读 ⇒ `loadOk=false` + `loadProblem`，**读路径就报可见**（可执行修复建议）；此后**拒绝一切写**（"绝不被覆盖"），`commit` 记录 `V5_STATE_NOT_LOADED` 原因（926–960,996–1005,1485–1488）。
3. **写失败**：`writeTextAbs` 返回 `undefined` ⇒ 计数 + `noteWriteProblem` + `console.error`（"内存已前进、文件是陈旧的"）；**fold 不能回滚**，因此做成**耐久可见**而不是假装成功（1012–1024,1448–1464）。
4. **Lean 队列崩溃恢复**：`ready()` 里**每会话一次** `recoverLeanJobs()`（在状态文件折入之后）；残留 `Formal/Jobs/*.json` 要么重排、要么**显式 interrupted**，**永不静默变 `passed`**（1389–1394）；`resume()` 再驱动一次（10293–10294）。
5. **会议"开了没收束"**：耐久标记 `meetingOpen`（F6），避免重启后未收束会议看起来像普通历史、纪要却从未写出（513–516）。
6. **在途回合**：`member.pendingWork{childId,objective,interruptedAt,reason}` 在**回合开始**就落耐久（wake/spawn 均写，X-1/X-3），暂停时统一标 `reason:'institute-paused'`（10300–10310）⇒ 主代理会话被杀、子代理 end 不回来时，重启仍能看出"谁还有活没干完"。
7. **被宿主上限拒的成员**：耐久 `phase:'failed' + failReason:'activation-limit'` 就是"延迟创建队列"本身（**派生自耐久态、没有第二份真相**）；重启不丢意图，成功创建即自动清除（9160–9220，消费点 X-5）。
8. **在飞判定/会议看门狗时钟**：`resume()` 刷新 `meeting.lastInputAt` 与 `verdict.lastVoteAt`，否则第一个 pass 会拿陈旧时钟把它判死（10273–10277）。
9. **恢复期不留幻影**：`initStop()` 清 `childId` 后同时清 `meeting/pendingMeeting`（否则没有 end 事件能清那些标记，状态会永远报"在飞会议/验证"，10294–10335 注释在 10325–10328）。

### 4.5 恢复时**重建**（ephemeral，绝不持久化的清单）
`params`（从耐久 params 归一重建）· `project/instituteName`（从耐久字段重建）· `key`（派生 `project::institute`）· `phase`/`autoDone`（从耐久 `phase` 重建；`autoDone = phase==='solved'`，**S1**）· `runId` 的会话镜像 · `busy` · `wakeKind` · `rounds` · `roundsSinceCompact` · `contextPct` · `needReanchor` · `inboxInjected` · `inboxSuppressed` · `seeds` · `lastActiveAt` · `currentMember` · `finalizeLock` · `verifiedRecently` · `liveAgents`（WeakRef） · `inflight` · `heartbeatDisposer` · `meeting`（在飞会议对象） · `lastMeetingId` · `pendingMeeting` · `digestTimer` · `lastProgressAt`（会话变量，耐久副本在 `inst().lastProgressAt`） · `persistedEpoch` · `dbg` · `waiters`（M-A42） · `turnToolCalls` · `spawnRetryAttempts` · `scheduling/reschedule` · `sandboxPolicyChecked/Mismatch` · `leanDisposers` · `pendingLoadNotes/loadProblemLog` · `sessionRegistry(sessions/childOwner)`。
**换算规则**：其中**有耐久副本**的是 `phase/autoDone`、`params/project/instituteName`、`pendingWork`（成员记录）、`stallNotice`、`meetingOpen`、`chair`、以及各 append-only 台账；**没有耐久副本**的（busy/rounds/inbox 去重标记/在飞会议对象/看门狗）在恢复后由 `resume()`/`ready()` 从文件与磁盘重新建立（重读 Progress、刷新看门狗、重建 `inflight` 当成员被重新派发时）。

### 4.6 `resume()` 的逐步语义（10237–10296）
1. `reconcileProvisioning()`（把"provisioning 中却已不在"的成员收拾干净，10219）；`syncParamsFromState()`。
2. **已结题 ⇒ 拒**：`autoDone` ⇒ `V5_INSTITUTE_STATE`（"configure a new one in a new session"，10240）。
3. **"排队"的容量被拒成员也一起重建**（X-2）；既无活成员也无排队 ⇒ `V5_INSTITUTE_STATE`（"no active member to resume"，10247–10248）。
4. 对每个成员：`m.childId` 存在 ⇒ **仍在役，无需续用**，顺手清掉暂停留下的 `pendingWork`（否则"待续列表"永远报活人）；否则读 `Members/<id>/Progress/progress.md`，**取最后 4000 字符**并**计数截断**（截断才补"更早 N 字符已省略"），日志为空则给"请先补写当前状态"的占位，然后 `spawnMember(m, seedBody, 'resume')`——`mode='resume'` 让提示把它读成"恢复说明（你自己的日志）"而不是一条要执行的任务（10251–10268）。
5. 重建失败 ⇒ `putMember({…m, phase:'failed', error})`（10269–10271）。
6. 刷新 `meeting.lastInputAt` / `verdict.lastVoteAt`（10273–10277）。
7. `running=true; autoDone=false; phase='active'`＋`patchInstitute({phase:'active',lastProgressAt:now()})`（10278–10281）。
8. `writeRosterMirror()` + `writeTaskboardMirror()`（"resume 是唯一会真正改变成员 phase/轮次/雇主的路径"，镜像必须刷新，audit M9）（10282–10286）。
9. 群聊公告"【恢复】研究所继续推进（重建成员 N 名）"、`notifyActivity()`、`scheduleNext()`（10287–10289）。
10. 若论文阶段活着 ⇒ `paperPass()`（论文在完成标志之前运行，崩溃后可续）（10290–10292）；再 `recoverLeanJobs()`（10293–10294）。

### 4.7 read-back 一致性
- **指纹只读回、绝不重算**：写入口唯一（`vibe_v5_record_*`），读面只读卡片 `- 内容指纹:` 行；不一致 ⇒ **具名阻塞上报**，绝不静默用旧文（349–361,`docs/03-interface-contract.md:240,268`）。
- **id 由计数器分配、绝不重用**："names are immortal"——被解雇者的 id 永不复用（否则重新雇的临时工会继承档案与任务归属，3642–3645）。
- **法定人数一致性**：所有带 m 的视图读**同一个活快照**并携带 `rosterVersion`（`r<成员总数>:<排序后的 id:phase>`）⇒ 同一时刻各视图可证同值，陈旧读者可被**检测**（2908–2928）。
- **投递一致**：未 ack 即未读、仍可重投；已 ack 的消息**正文不再保留**（`messages` 被过滤）⇒ 引用锚对它**悬空具名拒**（M-A18/M-A35）。
- **恢复后的真实来源**：磁盘卡片/纪要文件（正文、指纹）＋耐久台账（决议/投票/授权/异议/动议）＋ `State/*.v5state.json`（索引、名册、计数、phase）；**成员 persona 与 charter 是入职时的冻结文本**，`resume` 只复用不重算（M-A40）。

### 4.8 本分片对"人工干预"的诚实边界
- `vibe_v5_pause` **只**改调度与 `pendingWork`（不写 phase）；`vibe_v5_stop` 会中断所有子代理、清 childId、**耐久清 solve 票**、把未收束判定写成"stopped by the office"，并写 `phase:'idle'`（X-8）。
- `vibe_v5_message`（办公室声音）会 `notePaperConsult('message')` 计入论文征询门（3564–3567）。
- **办公室不在名册里**（`OFFICE_INBOX='office'` 是伪 id、永不被唤醒），因此"人工干预"的可见面只有 `status().officeRequests`/`report()` 与工具回执（M-A13）。
- `memberMayRejectAssign`（默认 true）是"人工干预"的对偶：被分派者默认执行但**有权先说明理由**（`docs/01-philosophy.md:206`、`vibe-math-v5r.js:1066`（默认值）／`:4018`（提示里那句"有异议请填 reject_assign"）／`:9555`（该开关的判定处））。

---

## 五、专章：代理通信/协作基础（目标 2 的直接依据）

### 5.1 为什么必须由框架中继
DSH 自身的"邻近代理发送"**只允许直接父 ↔ 直接可续子代理**（3524–3530）。因此成员之间**无法直连**；所内一切消息中继形态：**投递时以根代理为传输身份、正文里记真实发送者**，并且**每收件人一份**（精确移植 DSH 信箱"每条消息恰好一个 targetId"）⇒ **一个人的确认吃不掉另一个人的副本**（3526–3530）。

### 5.2 消息字段（规范）
`{ id:'msg-N', from, to, kind, text, at }` ＋ 可选 `quote`（单条） / `quotes[]`（多条） / `supplementOf`（3558–3561）。`quote` 项字段（2662–2671）：`ref, from, at, kind, domain, excerpt（≤200 且压空白）, truncated, depth, collapsed, cycle, rootRef, secretAggregateOnly, viaSupplement, supersededBy`。
- **id**：fold 内分配、全所单调（`msg-N`）、**只增**（同一次 `say` 对多收件人各铸一个 id，一次提交）。
- **发言人**：`from` = 成员 id / `'framework'` / `'office'`（真实来源，不能用别名）。
- **时间**：`at` 由框架写（`now()`）；**用户自带 `…At`/`…Ms` 一律拒**。
- **回复目标**：不是独立字段，而是 `quote.ref`（稳定锚）；投递帧里 `frameLine` 给出 kind 语义（M-A44）。
- **收件人**：`to` 单值：`all`（除自己外的 active）/`voters`（除自己外的选民）/`office`（伪 id）/成员 id；**给自己 ⇒ `V5_SELF_MESSAGE`**。
- **kind 全集（实测）**：`chat, dm, voters, office, meeting, verify, assign, nudge, notice`（3599–3612）＋ `framework` 作为 `notice` 的发送者。

### 5.3 投递语义（确定性、可重放）
1. **入队即耐久**：`say` 立刻按收件人写 `EV.message`（同一 commit）——**不是**"广播内存事件，是否落盘看时机"。
2. **未读 = `to==memberId` 且 id 不在 `delivered`**（`pendingFor`，3586–3598）。**没有"已读"概念，只有 ack**。
3. **分级**：`deliveryDecision` —— 非 `chat` 的 kind 一律 **urgent（立即投递）**；纯群聊按 `chatDigestMax`（默认 12）或 `chatDigestMs`（默认 45000）**批处理**（3614–3627）。`say` 结束时 `notifyActivity()`＋`scheduleNext()`：**只启动**一次 pass，不保证即时唤醒。
4. **每提示一次去重（G1）**：`inboxInjected` 只前置**新**消息；`inboxSuppressed` 让 `briefBlock` 跳过自带的 `[新到的消息/通知]` ⇒ **一条消息在一个提示里恰好出现一次**（9078–9098）。
5. **ack 在发送成功之后**：`wakeWithInbox` 只在 `wakeMember` 返回 true（真的发出去了）时 `ackPending`；失败则保持未读、并**清掉注入标记**让下次重新前置（9099–9110）。⇒ **"未 ack ⇒ 仍可重投"**。
6. **ack 的副作用**：`EV.delivered` 把 id 记入容量 500 的账本并**从 `messages` 中移除**该消息 ⇒ 已投递消息**正文不再保留**（M-A18）。
7. **所办路径**：`to:'office'` 的消息**永不投递、永不唤醒**（所办不是成员），只作为耐久请求供 `status()/report()` 读取；**上限 10、超额丢弃最旧、丢弃数计数**（M-A13）。
8. **发送者身份的真实性**：`notice` 必须由 `'framework'` 发（成员给自己发会被 `V5_SELF_MESSAGE` 拒，而旧代码没人检查返回 ⇒ 成员永远收不到反馈）（3575–3585）；`assign`/`nudge` 的帧头按真实来源区分所办/院士（3606–3610,9058–9065）。
9. **投递的唤醒预算**：`schedulePass` 分支 (a)/(b)/(c) 都受 `maxParallel` 与 `busy` 约束（X-5）；任务在办者按 `activityTimeoutMs` **节奏门控**，防"唤醒→回合→唤醒"无界链（9264–9281）。

### 5.4 群聊 vs 私信 vs 表决者信道
- 群聊 = `kind==='chat'`（`to` 缺省）；私信 = `to` 给成员 ⇒ `dm`；`to:'voters'` ⇒ `voters`（`sayQuote` 的 kind 推导，2625–2626，注意 `say()` 自身只接受调用方给的 kind）。
- **私聊永不进公开面**：引用必须由**发送者本人** `supplement_of`＋`why` 补记到公开面；引用解析到**补记本**并带 `viaSupplement`（M-A35，`docs/04-flows-and-protocols.md:286`、`docs/07:333`）。
- **表决期冻结发言**（M-A34）：存在 open 板 ⇒ 成员两个发言入口具名拒（`V5_INVALID_ARGUMENT`），举手队列保留不放行；例外是程序异议与院士/所办。
- **回复归属（S24/PR#14）**：`inflight{childId→{token,kind}}` 让"这次回复在回答哪个提问"随回合走，**不读会被后一次唤醒覆盖的 `wakeKind` 槽**（M-A24 注释 1214–1218，定义 3866）。

### 5.5 协作原语（本分片已登记的部分）
群聊/私信/信箱（M-A44/A45）、任务板 CAS（消费面 `:11176–11179`，本分片只覆盖 fold 的 upsert 与 `write_scopes` 归一 M-A09）、分派/督办（`assign`/`nudge`，M-A30 的 `canDo` 与 X-9）、动议/附议（M-A38）、记录人/纪要（M-A37）、决议（M-A32）、投票板（M-A31）、引用与补记（M-A35）、静止提示（M-A29，只陈述"谁在等谁"不施压）、异议/代行（消费面 `:11160–11161`，属分片 C）。

---

## 六、专章：框架能力需求清单（若要在通用框架里复刻 v5r）

> 每条格式：**需求原语** → v5r 的落点（file:line）→ 缺了会怎样。

1. **纯函数事件折叠器 + 模式版本**：`applyV5Event(state,event)`，要求"变化必返新顶层引用、未知键保留、畸形事件不抛只记诊断、按事件类型分派"（478–900）。缺 ⇒ 状态机无法在内存与磁盘两处共用一份定义，恢复与运行会分叉。
2. **fold 内原子 id 分配器**：对象与计数器同一步提交（554–588）。缺 ⇒ 同 tick 写者撞 id → 对象被静默吞掉而调用方仍报成功。
3. **整快照串行写 + "读过才可写"闸**：per-path `loadedPath/loadOk`、写前校验、`JSON.stringify` 延到链内（917–1029）。缺 ⇒ 陈旧子集覆盖、失败读被清空重写。
4. **加载失败的一等可见性**：`loadProblem`＋可执行修复文案＋读路径也上报＋写拒绝（926–960）。缺 ⇒ 操作者看到"空机构"却不知道自己的状态文件存在且被拒。
5. **写失败的一等可见性**：`onWriteFailure`＋计数＋诊断环＋stderr（1012–1024,1448–1464）。缺 ⇒ 内存前进、文件陈旧、全员以为已持久化。
6. **每路径载入记忆 + "切换身份前先读目标"**：`loadAt`（987–995,1433–1438）。缺 ⇒ 第一次工具调用把后端钉在默认路径，之后改 institute 会把新 identity 的空状态盖到旧文件上（2.4.1 audit H1）。
7. **会话/根代理注册与子代理归属表**：`rootOf/getSession`＋`childOwner`（1031–1059）。缺 ⇒ 每个子代理各建一个机构。
8. **可续子代理服务抽象**：`startContinuable`/`sendMessage`/`interrupt`/`list`、`ACTIVATION_LIMIT_REACHED` 的**错误码即特性探测**、回合结束事件匹配 token（385–411,3798–3851,11451–11466）。缺 ⇒ 无法做"多成员长跑 + 容量退化"。
9. **每收件人信箱 + ack 账本 + 未读查询 + 注入去重 + 发送成功后 ack**（3523–3640,9071–9110）。缺 ⇒ 一人确认吃掉别人副本 / 重复读 / 失败唤醒静默丢信。
10. **批量投递即一次提交（幂等）**（3550–3563）。缺 ⇒ 一半收件人成功、一半消失。
11. **投递分级与唤醒预算**：urgent vs digest、`maxParallel`、`activityTimeoutMs` 节奏门、一次调度 trampoline（9136–9320）。缺 ⇒ 话痨机构唤醒风暴 / 无界唤醒链。
12. **一次性活动等待器**：future-only waiter、区间校验 `[10000,3600000]`、fiber 拥有的超时 disposer、abort（3424–3466）。缺 ⇒ 只能轮询烧 token 或永远等。
13. **心跳/摘要定时器且可清理**：`heartbeatDisposer`/`digestTimer`＋`ctx.timeout`（1185–1230,3424–3466）。缺 ⇒ 卸载留下孤儿定时器。
14. **状态面板稳定键与冻结承诺**：`status/report/overview` 顶层键一经发布不改名/不改类型，只加子键（`docs/03-interface-contract.md:33,129–134`）。缺 ⇒ 观测面漂移、下游消费者碎。
15. **名册原语 + 快照一致性**：`activeMembers/voters/quorumM/rosterSnapshot/rosterVersion`（2898–2953）。缺 ⇒ 同一时刻不同视图报不同 m（DEFECT B 实测）。
16. **persona 注入 + 入职冻结**：章程写进 persona、`newMember` 在 fold 内捕获、恢复不重算（3012–3017,3646–3679）。缺 ⇒ 压缩后失忆；resume 后"你入职时的编制"变成假话。
17. **每轮状态块的身份必填契约**：`briefBlock` 强制 member、`[未就位]` 可见、消息块可抑制（3363–3422）。缺 ⇒ 提示词命名错误身份（v5 v4 的真实缺陷类）。
18. **授权台账 + 事件型失效 + 单一谓词**：`GRANTABLE_COMMANDS/GRANT_SCOPES`、`grantActive`（事件派生、无定时器）、`canDo = 默认表 ∩ 阶段允许 − 撤回`（1589–1661）。缺 ⇒ 权限散落各处、无法证明"授权不产生票权"。
19. **幂等/去重纪律**：同值 `deduped:true` 且不写第二次副作用（授权/开板/投票/撤回/复议/动议/附议/决议/指定记录人/自述…；`docs/03-interface-contract.md:208–240`）。缺 ⇒ 重试即重复入账。
20. **时间纪律**：用户时间键 `/(At|Ms)$/i` **一律具名拒**；墙钟时刻 vs 单调时长分离；**没有定时器推进阶段/结算/解冻**（`docs/07:111–120,135,246,292`；实现散见 1671–1684,1818–1822,2121,2197,2242,2281,2332,2382,2406,2623,2746）。缺 ⇒ 伪造时间、无人主持的自动收束。
21. **append-only 台账 + 少数意见盖章 + 记录派生复议**：`sealRecord` 唯一盖章点、`minorityOf`、门槛只升不降、`previousRounds`（2695–2868）。缺 ⇒ 纠错材料丢失、复议无据。
22. **派生式门禁（不改状态的门）**：`speechGate`（存在 open 板⇒冻结）、`truthWriteRefusal`（light⇒不得实体定论）——**门是谓词不是阶段**，且**具名拒带出路**（2233–2238,2870–2896）。缺 ⇒ 门要么漏（半真）要么把正常流程也挡死。
23. **文件工具注入 + policy + 目录兜底**：所有写走 `fs`（带 policy），shell 只在 fs 失败时兜底并回报 `via`（1330–1352,3484–3521）。缺 ⇒ 沙箱围栏被绕过。
24. **ephemeral/durable 明确清单 + 恢复语义**：哪些是会话内存（M-A24）、哪些有耐久副本、恢复时如何重建（第 4.5 节）。缺 ⇒ 无从判断"重启后什么一定还在"。
25. **观测诊断通道**：`prematureReads`、`stateWriteFailures`、`loadProblemLog`、`diagnostics`、`dbg{passes,schedEnter,schedSkip,arm,begin}`（1230,1383–1384,1451–1472）。缺 ⇒ 缺陷不可观测（"read 早于 load"只能靠约定）。
26. **路径契约类守卫**：`memberPathContractOk`/`leanPathContractOk` 比较**两个组合**而不是两份手抄字符串（1286–1328）。缺 ⇒ 文档说写到 A、框架只读 B（v4 实测缺陷）。
27. **资源预算原语**：宿主在活上限侦测＋本所自设 `maxLiveChildren`＋`toolCallsPerTurnCap`＋`memoryCeilingMb`＋RSS 读数＋逐轮工具计数（385–411,2029–2053,3669–3730）。缺 ⇒ 触到宿主上限只会抛不透明字符串。
28. **宿主服务惰性解析**：可选服务一律调用时 `ctx.get()`，agent 自己的 ctx 优先（429–444）。缺 ⇒ 服务提供顺序敏感、会话内永久 undefined。
29. **卸载清理钩子**：`ctx.effect` 的 disposer 终止在飞编译（420–427）。缺 ⇒ 插件卸载留孤儿进程。
30. **S21 指针传播读面原语**：单点指纹函数＋"头部列表只给 7 字段"＋"悬空 id 具名拒＋next 指路"＋"指纹只读回"＋"注入契约每轮重拼"（349–383,`docs/03-interface-contract.md:268`）。缺 ⇒ 上下文被正文占满、重载即失忆。
31. **可审计的"不驱动"保证**：静止只提示一次且带"谁在等谁"、提示后继续武装 heartbeat/digest（M-A29，`docs/07:239–249`）。缺 ⇒ 框架越权或提示后自冻结。

---

## 七、配套文档要点与对照（本章只记与本分片相关处）

| 文档 | 与本分片相关的规定 | 与实现的对应/差异 |
|---|---|---|
| `设计总览.md`（全文 56 行） | 三条硬性要求：v5r 与 v5 并存、**LEGACY-v5 实现方案不是规格**、权威基线＝`MEETING-PLATFORM-RULINGS.md`＋`PHILOSOPHY.md`（10–16）；S21 指针传播对外契约＝`docs/03` §3 #57 ＋ §6 H23（49–56） | 与实现一致：`contentFingerprint`/`vibe_v5_read_library`（M-A06）；**注意**：本分片未读 `MEETING-PLATFORM-*.md`（属分片 B/C 或按需查阅） |
| `docs/01-philosophy.md`（323 行） | 框架**只推荐不驱动**、chair-first、**沉默≠同意**、票与发言分离、可审计、不越界、贴合现实优先、不为难代理（第 6 节 253–262）；八条判据（第 7 节）；"代理是异步/上下文有限"的替代设计（第 8 节 282–286） | 实现层一一对应：M-A29（只提示）、M-A34（票发言分离）、M-A33（少数意见）、M-A14（诊断不闭锁） |
| `docs/03-interface-contract.md`（313 行） | 命令总表 42＋15（#43–#57，其中本分片实现：#47/#48/#49/#50/#51/#52/#53/#54/#55/#56）；错误码总表 61 可达；幂等/去重 §5.3（208–240）；**硬约束 H1–H23**（242–268），与本分片直接相关：H11（静止只提示一次）、H12（授权只改默认表、不可转授）、H13（两门槛不得混用）、H14（表决期冻结）、H15（少数意见＋复议）、H16（引用边界）、H17（记录与主持分离）、H18（会议分级）、H19（决议生效/检索）、H20（上次纪要确认＋行动项）、H21（动议/异议/复议三面正交）、H22（决议取代链）、H23（指针传播） | **逐条在实现中可找到**：H11↔M-A29；H12↔M-A30；H13↔M-A31；H14↔M-A34；H15↔M-A33；H16↔M-A35；H17↔M-A37；H18↔M-A36；H19↔M-A32；H20↔M-A37（确认）＋行动项视图 `actionItemsView()` 2100–2106；H21↔M-A38；H22↔M-A32；H23↔M-A06。**#57 的行内说明点明"指纹不进 fold、0 新耐久键"**，与 362–365 一致 |
| `docs/04-flows-and-protocols.md`（355 行） | 三条硬性质：发言≠表决/沉默≠同意/未投票阻塞（30–32）；六种发言机制与切换（117–134）；引用语义（138–155）；表决聚合（159–194）；时间/停止/实时调控（198–221）；权限矩阵（225–249）；反模式（253–266） | **实现覆盖的是"机制面"，不是"会议流程面"**：v5r 已实现的会议能力＝会议实体（`vibe_v5_meeting` 四 kind）、投票板、动议/附议、记录人/纪要、决议、引用、冻结；**未实现**（文档 `03` 第 3 节也标"待实现"）：`meeting_start/roll_call/time_set/stop/recess/resume/extend/adjourn/flow_set/agenda_set/chat_mode_set/hands_set/mute/unmute/invite` 等流程命令 ⇒ **目标 3/4 的重要结论：v5r 的"会议平台"只落地了议事产物面（板/动议/纪要/决议/引用/冻结），流程操控面基本仍在文档里** |
| `docs/07-oversight-and-time.md`（435 行） | S4 主持与救济、S5 只推荐不驱动、S6 授权、S7 投票板、S8 票发言分离、S9 复议、S10 引用边界、S11 记录人、S12 分级、S13 决议、S15–S20（纪要确认/点名/行动项/动议/取代链）（220–429）；时间两类不得混用（111–120）；"静止提示后**不得 return**"的实测缺陷（247） | 与实现**逐条吻合**（见上表）。**唯一需注意**：`docs/07:246` 说 `stallAutoMeetingMs` **`0`/空＝默认 360000、负值＝关闭**，实现完全如此（1545–1549,9849–9852） |

---

## 八、未决问题 / 诚实边界（给 lead 的判断输入）

1. **`resolveKnownTool` 的消费点不在本分片**：本分片确认其定义与导出（93–179），TeX/Lean 探测的调用方在 3730 之后；如需"谁在何时调用、`leanFoundVia` 如何回报"，需分片 B 的 Lean 面对齐。
2. **`docs/04` 的流程命令（`meeting_start`/`roll_call`/`chat_mode_set`/`mute`/`invite`…）在实现里 0 命中**（`docs/03-interface-contract.md:103` 明确"现状 35 条/待实现 22 条"）。本分片能证明的是"分片 A 范围内没有它们"；完整命中数应由全仓静态检索（分片 B/C 或 verify）复核。
3. **`docs/07` 与 `docs/04` 存在编号差异**：`docs/04` 的"第 4.1/4.2 节"对应 `docs/05` 的投票聚合，而 `docs/07` 用 S 编号；同一机制在两文中位置不同，**引用时必须带文档名**（我已在文中逐个标注）。
4. **`chatSupplements` 的"不搬正文"**：实现只记 `{of,by,at,publicRef,why}`，引用时去读**补记本**的正文；若补记本自身也被投递/清理，链路会悬空（实现按"悬空即拒"处理，未做额外保留）——**这是"私聊补记后可引"的隐含脆弱点**，值得目标 1/2 评估。
5. **`inboxInjected`/`inboxSuppressed` 是会话内存**：重启后消息仍是未投递态（耐久），所以不会丢信；但"本提示已前置过"的去重标记会丢 ⇒ 重启后的第一次提示可能再次前置同一批未 ack 消息（**语义上正确、观感上可能重复**）。
6. **状态面板本体（`status()`/`report()`/`overview()` 的完整字段与渲染）属分片 C**；本分片只覆盖它们所读的 fold 字段与 `actionItemsView`（2100–2106）。目标 2 的"成员状态面板：总目标/计划/子任务"落在 `vibe_v5_self_report`（`:11159`，字段 `overall/subgoal/plan/status`＋`…At`）与 `docs/03:105–107`，**本分片未逐行读 `selfReportTool`（在 7133 附近，属分片 C）**。
7. **`recoverLeanJobs` 的具体重排/中断判定**（3730 之后）未读；本分片只确认"每会话一次、在 ready() 折入状态之后、永不静默 passed"这三条契约（1389–1394）。
8. **本分片行号基线**：`vibe-math-v5r.js` 共 11597 行（read 工具口径）；分片 A 边界 1–3730；额外点读范围已在文首标注。
