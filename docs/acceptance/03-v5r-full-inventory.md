# v5r 全量功能与运行机制盘点（合并本 · 目标 3 的交付物）

> 来源：`vibe-math-v5r/` 代码原文深度通读（无跳读），非文档转述。
> 方法：`vibe-math-v5r.js`（**read 口径 11597 行**）按 1–3730 / 3730–7359 / 7359–11597 三段连续读完，另全文读 `math-computation.js`(1481)、`math-engines.js`(197)、`agent.cordis.yml`(460)、11 份 `MEETING-PLATFORM-*.md`、`架构图.md`(693) 与 `vibe-math-v5r/docs/*`。
> 结构：三个分片各自独立成篇（逐条机制 + 参数与上下界 + 持久化/恢复 + `file:line`），本文件是其合并本；分片原文同样保留，便于按需精读。

## 结论速览（给目标 1/2/3/4/5/6 的判据）

| 主题 | 实测结论 |
|---|---|
| 断点续跑 | 唯一载体＝`State/<institute>.v5state.json` 整快照；"投影进宿主会话日志"的后端**已删除**；恢复＝读文件＋同一个纯函数 fold；写安全＝"从未成功读过就绝不写"（`loadOk` 闩）；`resume()` 十步语义见 A §4.6 |
| 人工干预 | v5r 的可见面只有 `pause`/`stop`/`message` + `status().officeRequests`；**office 是伪 id、永不被唤醒**；审批/否决/超时**没有**框架原语 |
| 代理通信 | 成员间消息**全部由框架中继、每收件人一份**；字段 `{id,from,to,kind,text,at,quote?,quotes?,supplementOf?}`；**ack 在发送成功后**、ack 后正文不再保留；群聊/私信/表决者信道由 `kind` 区分 |
| 群聊管理 | **无**管理员/发言次数/禁言字段（仅设计文档 `SPEC #18/#19/#20/#21`、`K10 open_chat_quota/mute_list` 有）；用户点名的这些＝**基线 B，需在 vmu 实现** |
| 状态面板 | ＝`Members/<id>/SelfReport.json`（overall/subgoal/plan[]/status ＋ 各自 …At ＋ history ＋ deviation）＋ `vibe_v5_overview`；"正在执行的子任务"**无独立字段** |
| 会议系统 | 设计 42 条命令，**实际落地 ≈14 条 + 7 条变形，21 条未实现**（逐条判定见 C §⑦-A）；唯一兜底＝`meetingHardLimitMs`（默认 1800000，钳 [300000,7200000]），**沉默不触发任何截止** |
| 表决/共识 | m-vote 全量口径见 B §3；沉默阻塞结题、显式弃权计入已投不计选项、任何反向票阻断定论；进入 Verified 有两道 S25-C 硬门 |
| 数学面 | **无 numpy/scipy/pandas/sympy 专用适配**（仅通用包存在性探测）；**`math_computation` 完全没有作业持久化/断点续算**（op:'run' 同步 await），而 Lean **有** `Formal/Jobs/<jobId>.json` 镜像＋四态＋`recoverLeanJobs` 四分支恢复 |
| 主代理 | **两层**：office(root)＝助手/外部接口（不研究不投票）、academician＝所内领头人（charter 入职冻结）；参数只能 office 改；**无自动汇报机制**（只有人设文字 + Progress/ + 主动 overview） |
| 框架能力需求 | A 31 条 + B 53 条 + C 专章 = 复刻 v5r 所需原语清单（供目标 3 判断"vmu 是否足够强大"） |

## 分片索引

| 分片 | 文件 | 覆盖 | 规模 |
|---|---|---|---|
| A | `v5r-inventory-a.md` | `vibe-math-v5r.js` 1–3730（fold/持久化/恢复 · 名册 · 章程 · 信箱） | 47 机制 + 9 跨边界点，544 行 |
| B | `v5r-inventory-b.md` | 3730–7359（提示词 · 形式化 · 数学面 · 任务板 · 共识验证 · 成果库） | 20 机制 + 专章，913 行 |
| C | `v5r-inventory-c.md` | 7359–11597（会议全清单 · 群聊与状态面板 · 主代理 · 控制面） | 57 机制 + 专章，809 行 |

## 已知更正（引用分片时以此为准）

1. **`meetingKeepEvery` 有消费者**：`vibe-math-v5r.js:5842-5851`（每 N 件成果自动同步会议），分片 C 的 U-C3「无读取点」**不成立**。
2. **数学默认值**（分片 C 的 U-C4，Lead 实测 `math-computation.js:34-40`）：`mathTimeoutMs: 60000`、`mathEngines: MATH_ENGINE_ORDER.slice()`、`mathPackages: []`、`mathComputation/mathMode` 见 `MATH_PARAM_DEFAULTS`。
3. **行数**：`vibe-math-v5r.js` 以 read/Select-String 口径 **11597 行**为准（`Get-Content -Raw` 的 CJK/换行口径会少报）。

---

> **合并本说明（2026-10-14 重生成）**：本文件曾因 PowerShell 文本管道合并而**双重编码**（自第 37 行起乱码），
> 已用 Node 以 UTF-8 重新拼接；分片原文 `v5r-inventory-{a,b,c}.md` 为权威来源。
> 机制级的逐条判定（v5r 机制 → vmu 内核原语 → pack 声明）见 `04-parity-matrix.md`（vmu-verify 产出，124 条）。

---

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
- `memberMayRejectAssign`（默认 true）是"人工干预"的对偶：被分派者默认执行但**有权先说明理由**（`docs/01-philosophy.md:206`、`vibe-math-v5r.js:3288–3092` 章程文本）。

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


---

# v5r 深度盘点 · 分片 B

**任务**：`task-8`（Round1 · 目标3-B）。**唯一写入文件**：本文件。
**作者**：`v5r-reader-b`。**只读来源**：`Vibe-Mathematics`（分支 `main`，HEAD `6d0164e`），未做任何写入 / git 操作 / 依赖安装；未跑全量门禁与 `scripts/regen-all.mjs`。

**本分片范围（逐段读完整，未跳读、未抽样）**
- `vibe-math-v5r/vibe-math-v5r.js` 第 **3730–7359** 行（read 工具行号；本文件所有行号均为 **read 工具口径**）。
  - 覆盖：成员诞生五步 3734 / prompts 3973 / heartbeat-watchdog 4244 / 任务板原语 4278 / Lean 形式化 4308 / 异步 Lean 编译队列 4587 / `math_computation` 接缝 5027 / 经验反馈库 5243 / 三个索引 5493 / context·compact 5802 / 成员成果库 5829 / 任务板 CAS DAG 6062 / 共识验证 m-vote 6452；为把机制讲清，另**顺藤摸瓜**读了范围外的**定义侧**（行号单独标注为「范围外」）。
- `vibe-math-v5r/math-computation.js`（1481 行）**全文**。
- `vibe-math-v5r/math-engines.js`（197 行）**全文**。
- 指定文档：`docs/09-implementation-manual.md`（按需检索）、`vibe-math-v5r/docs/05-voting.md`（全文）、`vibe-math-v5r/docs/10-guards-and-acceptance.md`（全文）；另读了代码注释直接引为契约的 `docs/math-computation.md`、`docs/formal-verification.md`（全文），因为它们是本分片机制的一手契约。

**行号口径说明**：`read` 工具报 `vibe-math-v5r.js` 共 **11597** 行；`Get-Content` 报 11269 行（CR/LF 计数差异）。本文件只用 read 口径；引用外部文件时用其自身 read 口径。

**本分片的用途**：目标 2（表决/共识对照）、目标 3（框架是否足够强）、目标 4（pack 是否完整复现）、**目标 5（数学引擎深度 + 作业持久化/断点续算）** 的**唯一事实来源**。因此标注原则：宁详勿漏；每条机制都给「入口 / 逻辑 / 字段 / 参数与上下界 / 持久化-恢复 / 宿主接触面 / file:line」；结论凡可验证必附行号。

---

## 0. 预备知识：本分片所有机制共用的底座

不讲这层，后面每条机制的「持久化与恢复」都无从谈起。

| 底座 | 说明 | file:line |
|---|---|---|
| 事件类型表 `EV` | 12 个耐久事件：`vibe5/institute`、`member`、`task`、`message`、`delivered`、`meeting`、`debate`、`verdict`、`queue`、`solve`、`progress`、`formal` | 207–220（范围外） |
| 唯一 fold `applyV5Event` | 所有事件经**同一个纯函数**折叠成内存状态；非 `vibe5/` 前缀直接返回；异常**绝不抛出**（写 diagnostics，保留 `v`/`institutes`，最多留 50 条） | 589–900（范围外） |
| 投影版本 `PROJECTION_VERSION = 1` | 状态文件版本号 | 206（范围外） |
| institute 级耐久键**白名单**（fold 里逐项 `if (patch.X !== undefined)`） | `project`、`institute`、`phase`、`problem{id,statement}`、`params`、`runId`、`lastProgressAt`、`artifactCount`、`meetingOpen`、`officeRequestsDropped`、`paper`、`feedback`、`chair`、`stallNotice`、`grants`、`ballots`、`chatSupplements`、`formalProofs`、`secretaries`、`resolutions`、`minutesConfirmations`、`motions`。**凡不在此列表的 `patchInstitute` 键会被静默丢弃**（注释里 S4–S18 反复以此为据） | 597–692（范围外） |
| 函数式变更（fold 内 mutation） | `paper`/`feedback`/`grants`/`ballots`/`chatSupplements`/`formalProofs`/`secretaries`/`resolutions`/`minutesConfirmations`/`motions`/`queue`/`formal.record`/`formal.todo` 都接受**函数**，在 fold 内应用 ⇒ 同 tick 两个写入不互相覆盖 | 616–690、831–870（范围外） |
| `emptyInstitute` 的耐久字段 | `key/project/institute/createdAt/phase/problem/params/members/tasks/messages/delivered/meetings/debates/verdicts/formal/todo/queue/solve/counters/runId/lastProgressAt/artifactCount/diagnostics/meetingOpen/officeRequestsDropped/paper/feedback`；`counters` 初值 `{academician,researcher,temp,task,meeting,message,verify}` | 485–527（范围外） |
| 数值上限（LRU） | `DELIVERED_CAP = 500`（送达台账）、会议/辩论索引各 **200** 条上限、办公室请求 `OFFICE_REQUEST_CAP = 10` | 484、809、819、570（范围外） |
| 写入 API | `commit(type,data)`（await 后端 load；写失败**拒绝覆写**并记 note；成功后**回灌 params/phase/autoDone**）、`patchInstitute`、`putMember`、`putTask`、`putMessageMake`、`putSolve`、`ackDelivered`、`putDebate`、`putVerdict`（收口处 `sealRecord` 盖少数意见章）、`markProgress` | 1474–1537（范围外） |
| id 分配器 | `makeIdAllocator(inst)` 在 **fold 内**运行：`academician→'acad'`；其余 `ID_PREFIX = {message:'msg-',task:'t-',meeting:'mt-',researcher:'r-',temp:'t-'}` + 序号；新建对象必须用 `d.make` | 563–588、696–697、716–717、804–805（范围外） |
| **内存态（不持久、重启即重建）** | `busy:Set`、`wakeKind:Map`、`rounds:Map`、`roundsSinceCompact:Map`、`contextPct:Map`、`needReanchor:Set`、`inboxInjected:Map`、`inboxSuppressed:Set`、`seeds:Map`、`lastActiveAt:Map`、`currentMember`、`finalizeLock`、`verifiedRecently:Map`、`liveAgents:Map(childId→WeakRef)`、`inflight:Map(childId→{token,kind})`、`meeting`、`pendingMeeting`、`lastMeetingId`、`digestTimer`、`heartbeatDisposer`、`lastProgressAt`、`dbg` | 1185–1230（范围外） |
| 参数体系 | `DEFAULT_PARAMS`（1062–1183）；`normalizeParams`（9762+，含 ints/bools/strs/arrs 白名单，新增 int 必须插在末两项**之前**否则自探针失效）；`clamp01` 11508、`clPct` 11510、`posMs` 11512（**非正数一律回落默认**）、`idSafe` 11518、`coerceBool` 11531 | 范围外 |
| 回复解析 | `parseReply`：优先最后一个 ```json 围栏，其次整段 JSON，最后最外层 `{...}`；失败返回 `{}` | 11556–11578（范围外） |
| 派生集合 | `activeMembers() = members.filter(phase==='active')`；`voters() = activeMembers().filter(kind ∈ {academician,researcher})`；`memberById(id)` | 2899–2902（范围外） |
| 容错时间常量 | `recoverStallMs() = posMs(activityTimeoutMs,120000) * 2` ⇒ 默认 **240 000 ms**（既是"死锁放弃"阈值，也是"刚刚定论"去重窗口） | 4249（范围内） |

**参数默认值速查（本分片相关）**：`researcherCount=3`、`quorumCap=3`、`quorumMode='m-unanimous'`、`reconsiderFloor=0`、`verdictMaxRounds=3`、`compactThreshold=66`、`compactAfterRounds=8`、`maxParallel=3`、`activityTimeoutMs=120000`、`chatDigestMs=45000`、`meetingKeepEvery=5`、`formalVerify='off'`、`leanCommand='lean'`、`leanArgs=[]`、`leanTimeoutMs=120000`、`leanAsync=true`、`leanInitiative='normal'`、`leanSearchPaths=[]`、`leanJobsMaxParallel=1`、`resourceSelfCheck=false`、`toolCallsPerTurnCap=0`、`memoryCeilingMb=0`、`maxLiveChildren=0`、`pointerPropagation=true`、`feedback='on'`、`mathComputation='auto'`、`mathMode='typed+shell'`、`mathTimeoutMs=60000`、`mathPackages=[]`、`mathInstallScope='user'`（1062–1183；math 六项默认来自共享模块 `MATH_PARAM_DEFAULTS`，1147–1152）。
**模块级常量**：`LEAN_SEARCH_PATH_FLAG = '-R'`、`LEAN_READ_MAX_BYTES = 64*1024`、`LEAN_QUEUE_CONCURRENCY = 1`（**定义于 255，但实测无读取点 —— 见 §7 未决问题 U1**）260–261。

---

## 1. 机制逐条清单

格式：**名称** / 触发入口 / 具体逻辑（状态机·算法·边界·钳制·拒绝码·时序）/ 数据结构字段 / 可调参数（键·默认·上下界）/ 持久化与恢复 / 宿主接触面 / `file:line`。

### 1.1 `[SPAWN]` 成员诞生五步 `spawnMember(member, initialTask, mode)`

- **入口**：内部函数；被 `start`/`hire`/`addResearcher`/`resume` 路径调用（`mode='founding'` 新成员，`'resume'` 重建子会话）。3732–3746（顺序注释）／3747。
- **逻辑（顺序承载语义，注释明说「ORDER IS LOAD-BEARING」）**：
  1. **三道资源硬门（先于任何宿主调用）**：① 已知宿主子代理上限 `hostChildLimit` 且 `liveChildCount() >= 该值` ⇒ `noteSpawnLimitOnce` + `throw v5err('ACTIVATION_LIMIT_REACHED', activationLimitText(hostChildLimit))`（3752–3755）；② **本所自设** `maxLiveChildren()>0` 且在活数已达 ⇒ `throw v5err('V5_RESOURCE_BUDGET', …)`（3758–3763，S25-E）；③ **真实内存** `memoryCeilingMb()>0 && rssMb() >= 该值` ⇒ 同上 `V5_RESOURCE_BUDGET`（3766–3771，S25-D）。三种都只**每轮一行**提示（`noteSpawnLimitOnce`），且错误里点名参数名 + 当前读数 + 用 `vibe_v5_resume` 续。
  2. 解析 `provider = member.provider || pickProvider()`、`ao = memberAgentOptions()`、`tf = memberToolFilter(member)`；`kind = mode==='resume' ? 'resume' : 'initial'`（3772–3775）。
  3. **先把成员 commit 成 `phase:'active'`、`childId:''`**（3776–3778）—— 这一步先于派生（`activeMembers()`、`[状态]`/`[在册]` 块、法定数 m、票数、章程花名册），修的正是"每个 brief 都在描述错的人"的 bug。随后 `busy.add`、`wakeKind.set`、`currentMember`、`lastActiveAt.set`（3779–3782）。
  4. **计数器先算后用**：`startRound = rounds+1`、`startRoundsSinceCompact = rsc+1`（3786–3787），**只在 `startContinuable` 成功后**才 `rounds.set`/`roundsSinceCompact.set`（3836–3837），失败路径**不碰**（旧的 `rounds.delete` 会把 resume 的编号抹掉，3816–3818）。
  5. `persona = member.persona || memberPersona(member)`（**章程在入职时冻结**，resume 不重建，3788–3793）；`prompt = initialPrompt(member, initialTask, mode, startRound)`；`putMember`；`mkdirs()`；`writeRosterMirror()`（3794–3797）。
  6. 启动：`startWithToolFilter(tf, spec)`，spec 含 `provider`、`label='vibe5 <id> (<kindLabel>)'`、`request:{prompt:[textBlock(prompt)], parent:rootAgent, persona, agentOptions?, toolFilter?}`、`signal: makeSignal(params.activityTimeoutMs)`（3799–3811）。
  7. **失败回滚**：`busy.delete`/`wakeKind.delete`；`isActivationLimitReached(e)` ⇒ `noteChildLimit(e)` + `noteSpawnLimitOnce(member)`；成员记为 `phase:'failed'`、`error`、`failReason:'activation-limit'|'other'`；命中上限抛 **typed** `ACTIVATION_LIMIT_REACHED`（不再回放宿主原文）（3812–3831）。
  8. **成功后**：`member.childId = started.childId`、`childOwner.set(childId, sessionId)`、两侧计数器落定、**注册"入职这一轮"为在飞** `inflight.set(childId,{token:shortId(),kind})`（否则首次 `subagent/end` 无 token 可匹配，入职轮永不处理、会被心跳当普通轮重唤醒）（3832–3842）。
  9. **回合开始即落"待续"耐久标记** `member.pendingWork = {childId, objective:'入职/继续首轮（kind=…）', interruptedAt, reason:'host-ended'}`；`turnToolCalls.set(id,0)`（工具预算从 0 起算）⇒ `putMember`（3843–3849）。
- **字段**：`member{id,kind,provider,persona,phase,childId,pendingWork,direction,hiredBy,dismissedAt,dismissReason,failReason,error,activeMeetingId…}`。
- **参数**：`activityTimeoutMs`(120000，作用于启动信号)、`maxLiveChildren`(0=不设，spawn 前硬拒)、`memoryCeilingMb`(0=不设)、宿主 `hostChildLimit`（宿主侧上限，运行时探测）。
- **持久化/恢复**：成员记录、`pendingWork` 耐久；`rounds/contextPct/busy` **不持久**。重启后靠 `pendingWork` 判断"它还有活没干完" ⇒ 由所办用 `vibe_v5_resume` 续（3867–3873 注释）。
- **宿主接触面**：`subagents.startContinuable`、`ctx.fs`（putMember）、`mkdirs/writeRosterMirror`、`rssMb()`（宿主 `process` 读数）。
- **file:line**：3732–3851。

### 1.2 `[SPAWN]` 投递一轮 `wakeMember(member, promptText, kind)`

- **入口**：内部；`askVoters`、`continueVerifyRound`、`wakeIfIdle`、会议/心跳调度、`assign` 后 `wakeIfIdle` 等。
- **逻辑**：
  - 前置守卫：`!member || !member.childId || member.phase!=='active'` ⇒ `return false`（3860）。
  - `clearHeartbeat()`；`token=shortId()`；**kind 随这一轮走** `inflight.set(childId,{token,kind:kind||'normal'})`（387–3866 —— 注释：`wakeKind` 是**成员级槽位**，后一次唤醒会覆盖，回执归因必须靠 in-flight token）。
  - **"待续"耐久标记**：`pendingWork={childId,objective:promptText.slice(0,300),interruptedAt,reason:'host-ended'}`（回合开始即落盘 ⇒ 主代理被杀、子代理 end 不回也能看到"还有活没干完"）（3870–3873）；`turnToolCalls` 归零；`busy.add`；`wakeKind.set`；`currentMember`；`lastActiveAt`。
  - 计数器 `nextRound`/`nextRoundsSinceCompact` 先算，**发送成功后**才落（3 879–3883、3920–3924）。
  - **两类 context 指令严格区分**（v4 §24.1-③ 的修复）：(a) **软压缩指令**只在 `wake ∈ {'normal','checkpoint'}` 且（`contextPct >= compactThreshold` 或 `nextRoundsSinceCompact >= compactAfterRounds`）时注入；注入文本 = `coreRules()` + `[CONTEXT COMPACT …]`，要求回执填 `contextPct:15` 与 `compacted:true`；置 `softInjected=true`（3894–3912）。(b) `needReanchor.has(id)` ⇒ 前置 `coreRules()` 一次并**清除**标记（3913–3916）。
  - 发送：**必须** `subagents.sendMessage(rootAgent, member.childId, [textBlock(prompt)], {signal})`；服务缺此方法直接抛 `no subagents.sendMessage continuation API`（3918–3919；注释：v4 用不存在的 `followup` 导致全组静默停摆）。
  - **成功**：`rounds.set(nextRound)`；`roundsSinceCompact.set(softInjected ? 0 : nextRoundsSinceCompact)`（软压缩指令**真的送达**才清触发器）（3923–3924）。
  - **失败**：`console.error`；`inflight.delete(childId)`、`busy.delete(id)`；`return false`（不消耗轮次、不清触发器）（3926–3931）。
- **参数**：`compactThreshold`(66)、`compactAfterRounds`(8)、`activityTimeoutMs`。
- **持久化/恢复**：`pendingWork` 耐久；`rounds/roundsSinceCompact/contextPct` 内存；`postmark`（§1.16）在回执侧统一记账。
- **宿主接触面**：`subagents.sendMessage`。
- **file:line**：3859–3932。

### 1.3 `[OTHER]` 调用者身份推导（三函数）

- `memberIdOfAgent(agent)`：有 session id ⇒ `byChild(id)` 命中返回成员 id；**是 session 根** ⇒ `'office'`；否则 `''`；**完全没有 session id** 才允许回落到 `currentMember`（且要求该成员仍存在）（3939–3955）。注释记录 v4 缺陷：所办调 `assign` 被误判为研究员 ⇒ `V5_NOT_ACADEMICIAN`，且分派/督办签错名。
- `isProvablyOffice(agent)`：仅当该 agent **就是** session 根（`rootOf(agent)===agent` 且有 session id）（3961–3963）。
- `officeCaller(agent)`：成员 id / `'office'` / `''`；**office-only 工具必须在 `''` 上具名拒（`V5_MEMBER_NOT_FOUND`）**，不得冒充所办（3967–3971）。
- `isOffice(id) = (id === 'office')`（**空串不是所办**，第二道防线，5837）。
- **file:line**：3933–3971、5837。

### 1.4 `[PROMPT/PERSONA]` 回执字段目录 `replySpec(kind)`

- **入口**：所有轮次提示词的尾部（`initialPrompt`/`normalPrompt`/`checkpointPrompt`/`meetingPrompt`）；`verifyPrompt` 用**自己的**收尾契约（4232–4238）。
- **逻辑**：先声明"只输出一个 JSON 对象（```json 围栏内）"，再**显式说明**下面的字段目录是"目录"而非合法 JSON（F2 修复），末尾给**最小合法样例** `{"say":"…","progress":"…","solved":false,"contextPct":40}`（3978–4046）。
- **字段清单（按 kind 分支）**：`say`（字符串=群聊；`{to,text}`；`to:'voters'`=只对表决者）／`progress`（追加 `Progress/progress.md`）／`record:[{kind:'proposition|method|subproblem',id,title,statement,content,value,motive,p}]`；
  - `kind !== 'temp'` 追加 `propose_verify{target,kind,reason}`、`verdict{target,verdict,reason}`（**只有 1 或 0 算表决**，中间=弃权/存疑）（3992–3995）；`temp` 分支明确"**你可以提议，但没有表决权**，`verdict` 填了也会记为无表决权"（3996–3999）。
  - 所有人：`propose_meeting{agenda,kind,target}`（4000）、`task_create{subject,description,blocked_by,write_scopes}`（4007）、`task_claim`（4008）、`task_done`（4009）、`task_update{task_id,expected_revision,action}`（4010）、`input`（会议发言正文）（4011）、`reject_assign{task_id,why}`（4018–4019）、`vote_solved`（**一致同意才结题**，4031–4033）、`meeting_hand`（4034；**已发言者可再举手**，false 撤回）、`meeting_invite{member,why}`（4035，只记纪要**不计票**）、`solved`（4036）、`contextPct`（4037）、`compacted`（4038）。
  - `kind === 'academician'` 追加 `convene_meeting`（**无需附议**）、`assign{subject,description,to,why,acceptance,priority}`（**必须写 why 与 acceptance**）、`prioritize{order,why}`、`nudge{to,why,next_step}`（4001–4006）。
  - `formalOn()` 时追加 `formal{target,decision:'used|blocked|defect',file,note}`，并按 `formalMode()` 写"强制/鼓励"语义（4012–4017）。
- **参数**：`formalVerify`（决定是否出现 `formal` 字段与措辞）。
- **file:line**：3978–4047。

### 1.5 `[PROMPT/PERSONA]` 五个提示词构造器

| 构造器 | 结构（自上而下） | 关键点 | file:line |
|---|---|---|---|
| `initialPrompt(member, initialTask, mode, roundNo)` | 标题（入职首轮／会话重建）→ 首轮独白要求／"先读回你自己的 Progress/ 与成果库，不要从头再来" → 初始任务/恢复说明 → `member.direction`（仅非 resume）→ `resourceBlock` → `mathPushLine` → `paperPushLine` → `feedbackPushLine` → `------------` → `pointerContractBlock` → `stateBlock` → `------------` → `replySpec(kind)` | resume 与 founding 的**文案与语义不同**（resume 不得说"刚加入"、不展示入职简介） | 4054–4083 |
| `normalPrompt(member)` | 第 N 轮标题 → 推进研究指令 → 若 `kind==='academician' && params.academicianLeads` 追加统筹指令（overview/assign/nudge）→ 若 `leanDailyOn()` 追加 `formalWorkLine()` → 资源/数学/论文/反馈 → 指针契约 → 状态块 → `replySpec` | 轮次号取 `rounds.get(id)` | 4084–4107 |
| `checkpointPrompt(member)` | 心跳标题 → "所内一段时间没有新进展，请**继续推进**而不是停在原地" → 可选 `formalWorkLine()` → 同尾块 | 心跳轮**也**注入数学/论文/反馈行 | 4108–4127 |
| `meetingPrompt(member, mn, opts)` | 会议头（id/议程/类型）→ 受邀临时工声明（**不计票、不阻塞**）→ 其他成员已发表意见列表（`mn.inputs`）或"你是第一位发言者 + 发言模型说明" → 发言/举手/沉默语义 → `proofStatusBlock()` → 资源/数学/论文/反馈 → 指针契约 → 状态块 → `replySpec` | 发言模型逐字写实：**轮流发言（不强制）→ 举手发言（可多轮）→ 无人举手即收束；沉默不触发任何截止**；并声明"框架每轮最多同时唤醒 `maxParallel`（默认 3）" | 4128–4176 |
| `verifyPrompt(member, vs)` | 求真表决头（对象+类型）→ 陈述（>800 字**可见截断**并指向源卡片）→ `proofStatusBlock()` → verdict 五态说明 → **计票规则**（只有投票通道产生票；表决期内发言不改票；**沉默不是同意也不是反对**，未表态阻塞结题）→ `formalOn()` 时 `formalPromptBlock(target)` + 阻塞/未通过时的定向说明（"若你跑通形式化，后续审查对象从'推导是否正确'变成'Lean 代码是否忠实于命题'"）→ `stage==='debate'` 时公开上一轮各人 `history`（verdict=prob｜reason）→ 反从众声明 → 数学/论文/反馈 → 指针契约 → 状态块 → **独立收尾契约** `{"verdict":{...},"contextPct":40}`（+ formal 字段） | 陈述截断**必须可见**（task-24）；`'abstain'`/`'unable'` 的字面量用 `String.fromCharCode(39)` 拼引号避免转义问题 | 4177–4241 |

- `stateBlock(member, roundNo)` 只是 `briefBlock` 的别名（**刻意没有"最后一个碰过的成员"回落**，4051–4053）。
- **file:line**：4051–4053、4054–4242。

### 1.6 `[PROMPT/PERSONA]` 每轮状态块 `briefBlock(member, roundNo)`

- **逻辑/字段（逐行）**：身份无效直接 `throw v5err('V5_INTERNAL', …)`（状态块**绝不**为未知身份构造）(3377–3379)；
  `[状态] 你是 <id>（职位）｜轮次 <n>｜法定票数 m=<quorumM() 或 '未启动'>｜有表决权者 <voterCount()> 人`（3382–3383）；
  `[在册]` 全部 active 成员 id（3384）；`[未就位]` 非 active 且非 dismissed 者（**静默省略会让 provisioning 失败隐形**，3385–3388）；
  `[形式化]`（仅 `formalOn()`）模式 + 已通过数 + 已阻塞数 + 待办数（3391–3397）；
  **`takeLeanNoticesFor(member.id)` 的一次性公告行**（3398–3400，§1.11）；
  `[任务板]` 进行中/可认领/我负责 计数（3401–3407）+ 我的任务明细（含验收与分派者，3408–3414）；
  `[新到的消息/通知]`（`inboxSuppressed` 时不重复注入，3415–3419）。
- **宿主接触面**：无（纯读耐久状态 + 内存表）。
- **file:line**：3376–3421（范围外）。

### 1.7 `[SCHED]` 心跳 / 看门狗时序

- `heartbeatDisposer`、`digestTimer`（1220、1227）、`clearHeartbeat()`：两个 disposer 都清（4250–4253）。
- `armHeartbeat(ms)`：`!running || autoDone` 直接返回；已存在 disposer 先清；`delay = posMs(ms, posMs(params.activityTimeoutMs,120000))`；定时回调里**先** `runLeanQueue()`（独立于调度，必须跑）**再** `scheduleNext()`（4257–4268）。
- `armDigest()`：去重（已有 timer 或未运行则不装）；`posMs(params.chatDigestMs,45000)` 后仅调 `scheduleNext()`（"话多的所不该每条消息都唤醒所有人"）（4270–4276）。
- `recoverStallMs() = 2 × activityTimeoutMs`（默认 240 000ms）：会议/验证的"死锁放弃"阈值**同时**被当作"刚刚定论"去重窗口（4244–4249、6688、6755、6952）。
- **持久化/恢复**：定时器**不持久**；重启后由 `scheduleNext`/`armHeartbeat` 重建。
- **file:line**：4244–4276。

### 1.8 `[TASK]` 任务板 CAS DAG（分派 / 依赖 / compare-and-set / 阶段机）

**8.1 原语（4279–4306）**
- `taskReady(task)`：`status==='pending'` 且所有 `blockedBy` 都存在且 `status==='completed'`（找不到的 blocker 视为未完成）（4279–4287）。
- `writeScopeWarnings(task)`：与所有 `status==='in_progress'` 的其它任务做 `scopesOverlap(a,b)`（**前缀重叠**判定，471–476），返回去重后的可读告警串（4288–4299）。
- `taskView(task)`：浅拷贝 + `ready` + `ownerName = ownerId` + `writeScopeWarnings`（4300–4306）。

**8.2 依赖校验 `validateDeps(candidateId, blockedBy)`（6069–6098）**
- 自依赖 ⇒ `V5_TASK_DEPENDENCY_CYCLE`；重复 blocker ⇒ `V5_INVALID_ARGUMENT`；bloker 不存在或已删除 ⇒ `V5_TASK_NOT_FOUND`；随后在**整个候选图**上做 DFS 三色环检测（`graph` 含候选自身、忽略 `deleted`），命中 ⇒ `V5_TASK_DEPENDENCY_CYCLE`。

**8.3 建档 `taskCreate(memberId, o)`（6099–6143）**
- **时间键一律拒**：任何键名匹配 `/(At|Ms)$/i`（含 `due_at`）⇒ `V5_INVALID_ARGUMENT`（期限只收相对表达 `due_in`，如 `next-meeting`）（6101–6103，S15/K4）。
- `subject` 必填且 ≤200；`description` ≤16384；`write_scopes` 逐个 `normalizeScope`（拒空/绝对/盘符/`.`/`..` 段，464–470），非法 ⇒ `V5_INVALID_WRITE_SCOPE`，去重（6104–6114）。
- `priority` 非有限数 ⇒ 0。
- **id 与 counters 在 fold 内分配**：`commit(EV.task, { make:(alloc)=>{ task.id = alloc.next('task'); validateDeps(task.id, blockedBy)（失败返回 null ⇒ fold 不写任何东西）; return task } })`（6128–6138）。校验错误在 fold 里 catch 住、fold 外重抛（6132–6138）。
- 成功后 `writeTaskboardMirror()`、`markProgress()`、`notifyActivity()`（6139–6141）。
- **持久字段**：`{id, revision:1, subject, description, status:'pending', ownerId:'', blockedBy[], writeScopes[], priority, createdBy:'office'|memberId, assignedBy:'', why:'', acceptance:'', origin, due_in, state:'open', createdAt, updatedAt}`（6116–6127）；`reassign` 可另写入 `resolution_id`（6283）。

**8.4 读面（6144–6157）**
- `listTasks(filter)`：过滤 `status`、`owner`（`'unowned'` ⇒ 无 owner）、`ready===true`；排序 `priority` 降序，其次 `createdAt` 升序；返回全部 `taskView`（**含 writeScopeWarnings**）(6144–6152)。
- `getTask(id)`：不存在抛 `V5_TASK_NOT_FOUND`（6153–6157）。

**8.5 CAS 状态机 `taskUpdate(memberId, o, meta)`（6161–6292）**
- 守卫链：空 `memberId` ⇒ `memberDiagnosis`（**防止空串被当成"每个无主任务的 owner"**，6162–6165）；任务不存在/已删除 ⇒ `V5_TASK_NOT_FOUND`/`V5_TASK_DELETED`；`expected_revision` 非有限 ⇒ `V5_INVALID_ARGUMENT`；`expected !== task.revision` ⇒ **`V5_TASK_STALE_REVISION`**（消息为中文并提示先 `vibe_v5_task_get`，6171–6178）。
- 权限：`lead = (meta.authorized===true) || canDo(memberId,'board').ok || canDo(memberId,'assign').ok`；`owner = task.ownerId === memberId`；`requireOwnerOrLead()` 否则 `V5_TASK_UNAUTHORIZED`（6184–6188）。
- **动作表**（每步失败都返回 `{ok:false, code, message}`，`e.code||'V5_INVALID_ARGUMENT'`）：
  | action | 前置 | 迁移 | 备注 | file:line |
  |---|---|---|---|---|
  | `claim` | owner 为空或就是自己；`status==='pending'`；`taskReady` | → `in_progress`，`ownerId = office ? (原owner||'') : memberId` | 失败码 `V5_TASK_ALREADY_CLAIMED`/`V5_TASK_INVALID_TRANSITION`/`V5_TASK_BLOCKED` | 6191–6196 |
  | `release` | owner/lead；`in_progress` | → `pending`，`ownerId=''` | | 6197–6200 |
  | `edit` | owner/lead；至少给 `subject`/`description`/`write_scopes` 之一 | 字段截断 200/16384、scopes 归一 | 无字段 ⇒ `V5_INVALID_ARGUMENT` | 6201–6216 |
  | `set_dependencies` | owner/lead；`blocked_by` 必须给出（可为 `[]`） | `validateDeps` 后替换 | | 6217–6223 |
  | `complete` | owner/lead；`in_progress` | `status='completed'` **且 `state='done'`** | S15：**显式状态机，绝不自动关闭** | 6224–6229 |
  | `handover` | **仅 lead**；非 deleted | `state='handover'`；若给 `owner`（须 active 成员）⇒ `ownerId=target,status='in_progress',state='open'`；不给 ⇒ `ownerId='',status='pending'` | G3：责任人缺席 ⇒ **待接手，不自动关闭、不静默丢弃**；非 active ⇒ `V5_MEMBER_NOT_FOUND` | 6230–6246 |
  | `reopen` | owner/lead；`completed` | → `pending`，`ownerId=''`，`state='open'` | | 6247–6251 |
  | `reassign` | **仅 lead**；`pending`/`in_progress` | 有 `owner`（须 active + `taskReady`）⇒ `in_progress`+owner；无 ⇒ `pending`+ownerId '' | 失败码含 `V5_TASK_BLOCKED` | 6252–6262 |
  | `delete` | owner/lead；**有依赖者则拒** | `status='deleted'` | 依赖者列表进消息；`V5_TASK_HAS_DEPENDENTS` | 6263–6267 |
  | 其它 | — | — | `V5_INVALID_ARGUMENT: unknown action` | 6268–6270 |
- **G4（单一 CAS 写）**：分派元数据**在同一次 CAS 写里**落（仅 `action==='reassign'` 时可携带 `meta.assignedBy/why/acceptance/resolution_id`），旧的"写第二次 putTask"会吞掉并发 `task_update` 且不升 revision（6274–6284）。随后 `next.revision = task.revision + 1`、`updatedAt`、`putTask`、镜像、markProgress、notifyActivity（6285–6291）。
- `listTasks` 的过滤/排序 + `writeTaskboardMirror` 只写**人读镜像** `Shared/TaskBoard.md`（权威在 `State/<所>.v5state.json`）（6405–6418）。

**8.6 分派 `taskAssign(memberId, o)`（6297–6373）**
- 权限 `gateDo(memberId,'assign', 'only the academician (or the office) can assign tasks')`（6299–6300）；时间键拒（6302–6304）。
- `from_resolution`（`resolution_id`）必须指向既存 `res-<n>` 且**未被取代**（`supersededBy` 非空 ⇒ 拒"已被取代的决议不得派活"）（6305–6313，S20/B-3(甲)）。
- `to` 必须是 active 成员；`why` 必填；`acceptance` 必填（6315–6321）。
- 无 `task_id` 时：若给了 `origin`，按 `origin + subject` 查重——**同 origin+subject+同 owner 且已在执行 ⇒ 幂等返回 `{deduped:true}`（不重复建、不重复派）**；否则复用该任务 id；仍无则 `taskCreate`（优先 `priority/write_scopes/origin/due_in`）（6324–6350）。
- 有 blocker 且未 ready ⇒ `V5_TASK_BLOCKED`（6352–6354）。
- 落到 `taskUpdate(..., action:'reassign', owner:to, meta:{assignedBy, why, acceptance, authorized:true, resolution_id})` —— **`authorized` 是内部位置参数**，不在工具 args 面上（6355–6360）。
- 分派后：`say(to, kind:'assign', …'默认应当执行；若认为方向有误请说明理由（会被广播）'…)` + `wakeIfIdle(target)`（6365–6372）。

**8.7 优先级 `taskPrioritize`（6374–6394）**：`gateDo('prioritize')`；`order` 非空数组；逐项 upsert `priority` 且 `revision+1`；写镜像 + 通知。

**8.8 除名回收 `releaseTasksOf(memberId, reason)`（6397–6404）**：把该成员名下所有 `in_progress` 任务释放为 `pending`+`ownerId=''`+`revision+1`+`releaseReason`（**DSH 原版明确不自动释放 owner，这是 v5 补的缺口**）；有则写镜像、返回 id 列表。

**8.9 编制表镜像 `writeRosterMirror()`（6422–6449）**：写 `Institutes.md`；含求真门槛行（`m = quorumM()` 或"未启动"）、`phaseFactLine()`、在册表格（代号/职位/状态/雇主/方向/轮次/上下文%），dismissed 单列"已除名（代号永不复用）"。**只写不读**。

- **触发入口（工具面）**：`vibe_v5_task_create`（`subject` 必填）、`vibe_v5_task_list`（`status/owner/ready`）、`vibe_v5_task_get`（`task_id`）、`vibe_v5_task_update`（`task_id/expected_revision/action/…` 必填前三）、`vibe_v5_assign`、`vibe_v5_task_prioritize`（注册见 11176–11179、11056 段）。
- **持久化/恢复**：任务在 `EV.task` fold 里 upsert（714–732），**全程耐久**；`revision` 是 CAS 令牌；`writeTaskboardMirror` 只是快照。恢复后 `listTasks` 直接可用。
- **宿主接触面**：`ctx.fs`（镜像）、`commit`；分派会 `sendMessage`（wakeIfIdle）。
- **file:line**：4278–4306、6062–6449。

### 1.9 `[FEEDBACK]` 经验反馈库（Shared/Feedback/）

- **入口**：`vibe_v5_feedback {op: add|update|list|summary, …}`（注册 11154）。
- **常量**：类别 `['cooperation','management','process','obstacle','conflict']`（74–76）；路由 `['self','team','interpersonal']`（84）；状态 `['open','adjusted','closed','dropped']`，未闭环=`['open','adjusted']`；目录 `Shared/Feedback`；关闭消息常量（74–92）。
- **`feedbackOn()`**：`String(params.feedback || 'on') !== 'off'`（5247）；参数 `feedback ∈ {'on','off'}`（11071）。
- **逻辑**：
  - `add`：`off` 时**具名拒** `V5_FEEDBACK_DISABLED` + 复原指引（**绝不静默写入**，5301–5304）；`category` 非白名单 ⇒ `V5_FEEDBACK_BAD_CATEGORY`；`route` 非白名单 ⇒ `V5_FEEDBACK_BAD_ROUTE`；`phenomenon/impact/action` 任一为空 ⇒ `V5_FEEDBACK_INCOMPLETE`；**仅 `interpersonal`** 要求 `assessment` 非空，否则 `V5_FEEDBACK_NEEDS_ASSESSMENT`（**self/team 是自我调节，无审批步骤**）（5305–5329）。
  - 条目在 fold 内 push：`patchInstitute({ feedback: (cur)=>{ entry = {id:'fb-'+(list.length+1), …}; list.push(entry); return list } })`（5330–5339）；随后写人读镜像并返回 `{entry, mirror, counts, routeHint}`（5340–5344）。
  - `update`：`id` 必填（`V5_FEEDBACK_NO_ID`）、存在性（`V5_FEEDBACK_NOT_FOUND`）、**权限 = 发起人或所办**（否则 `V5_FEEDBACK_FORBIDDEN`）；`status` 白名单（`V5_FEEDBACK_BAD_STATUS`）；**interpersonal + `status='closed'` 必须回填 `outcome`**（`V5_FEEDBACK_NEEDS_OUTCOME`）；`status='dropped'` 必须有 `outcome` 或 `note`（`V5_FEEDBACK_NEEDS_REASON`）；写入 `updatedAt/updatedBy` 及可选字段（5346–5383）。
  - `list`：按 `category`/`route` 过滤，默认**只列未闭环**，`all:true` 列全部（5385–5395）。
  - `summary`：只回计数（5396）。
  - 未知 op ⇒ `V5_FEEDBACK_BAD_OP`（5397–5398）。
- **`feedbackCounts()`**：`{total, open, closed, byCategory, byRoute}`（5249–5261）；`feedbackView(e)` 固定字段投影（5262–5267）。
- **镜像 `feedbackMirror()`**：每个类别一个 `Shared/Feedback/<category>.md`（人读，含"这是方法论／协作层，不是研究结论"声明）+ `Shared/Feedback/index.json`（`{counts, entries}`）；失败**只报 `mirror:false`**，不抛不记（5268–5297）。
- **提示词行 `feedbackPushLine`**：`off` 时零注入；否则一段"为什么记/记什么/三条路由/记了之后"的短说明（5403–5411）。
- **持久化/恢复**：条目在 **耐久 `inst().feedback` 数组**（emptyInstitute 525），fold 白名单 625–630；镜像**只写**。
- **宿主接触面**：`ctx.fs`（镜像）、`commit`。
- **file:line**：74–92、5243–5411（+11071、11154）。

### 1.10 `[COMPACT]` 上下文核算 `coreRules` / `postmark`

- `coreRules()` 是**函数而非冻结串**（成员可见库路径必须反映**当下**项目/研究所，DEFECT A）：`[核心规则]` 一句话说明"只有 Verified/ 算已确立；进 Verified/ 必须 ≥m 名有表决权者投出**恰好 1/恰好 0** 且**没有任何反向票**，否则留库附平均概率；你只写自己的库；组织与分派由院士负责但判断属于你自己；退出时只输出一个 JSON 对象"（5809–5812）。
- `postmark(member, parsed)` 是**唯一**上下文记账点，**所有回执类型**（normal/meeting/verify/checkpoint）都走：`contextPct` 经 `clPct` 钳到 0–100；`compacted===true` ⇒ `roundsSinceCompact=0`、`contextPct=15`、`seeds = (progress||summary).slice(0,4000)`；最后 `needReanchor.delete(id)`（5814–5827）。
- 相关参数：`compactThreshold=66`、`compactAfterRounds=8`；真压缩路径 `maybeRealCompact`（9728–9749，优先 `compactNow`，回退 `compactIfNeeded`，成功则 `roundsSinceCompact=0` + `needReanchor.add`）。
- **file:line**：5802–5827（+9728–9749）。

### 1.11 `[LIBRARY]` 成员成果库（四轨 Progress + 三类卡片 + 头部列表契约）

- **`bumpArtifacts()`（5844–5856）**：`artifactCount+1` 经 `commit(EV.progress)`；**必须 await**（否则同一回执里两张卡读到同一计数、`meetingKeepEvery` 同步会触发两次，5840–5843、M6）；当 `n % meetingKeepEvery === 0` 且 `!meeting && !pendingMeeting && !hasVerifyInFlight()` ⇒ `startMeeting('office',{agenda:'定期同步：分工 / 进展 / 是否需要验证', kind:'sync'})`（框架**只召集，不派活**，5852–5854）。
- **`publishProgress(memberId, text, track)`（5862–5881）**：空文本 ⇒ `V5_INVALID_ARGUMENT`；`PROGRESS_TRACKS = {route:'routes', obstacle:'obstacles', rejected:'rejected', state:'state'}`；缺省（`narrative`）逐字追加 `Members/<id>/Progress/progress.md`，给 track ⇒ 落 `Progress/<routes|obstacles|rejected|state>.md`，并在 progress.md 里**首次**补一行索引 `- 分轨：routes/obstacles/rejected/state`；写入格式 `\n### <时间>｜<成员>\n<text>\n`；失败 ⇒ `V5_WRITE_FAILED`；成功 `markProgress()`。
- **`recordCard(memberId, kind, o)`（5885–5931）**：
  - **三必填**：`value`（价值程度）、`motive`、`p`；缺失**具名列出**并拒 `V5_INVALID_ARGUMENT`（**绝不静默默认**，5888–5892）。
  - id：`idSafe(args.id) || prefix + '-' + shortId()`，`prefix = p|m|s`；目录 `Propos|Methods|Subproblems`；缺省状态 `未定论|经验|求解中`。
  - body 模板：命题 = `## 陈述 / ## 证明尝试 / ## 证伪尝试`；方法 = `## 核心内容 / ## 定义与记号 / ## 应用记录 / ## 改进历史`；子问题 = `## 陈述 / ## 进度`。
  - **内容指纹** `contentFingerprint(kind, body)`（模块级 362–365）：`sha256(kind + '\n' + parts.map(leanHashText).join('\n---\n'))`——**只覆盖陈述原文与证明正文，不含标题/ID/时间**（重贴标签不算内容变更；S21/D1）。
  - 卡片头字段（写盘）：`# <类型>｜<标题>`、`- 标题`、`- ID`、`- 类型`、`- 状态`、`- 概率: clamp01(p).toFixed(2)`、`- 价值程度: clamp01(value).toFixed(2)`、`- 动机用途计划`、`- 记录者`、`- 记录时间`、`- 依赖: []`、**`- 内容指纹: <sha>`**；随后 `bumpArtifacts()`、`notifyActivity()`；返回 `{id,file,kind,fingerprint,status,title,owner}`。
- **`readLibrary(query)`（5932–6060）**：
  - **两种模式**：`list:true` ⇒ 头部列表（**只有** `id/kind/title/fingerprint/status/owner/updatedAt`，**绝无正文**；`updatedAt` 优先文件 `stat.mtimeMs`、回退卡片 `- 记录时间:`、`0`=未知；支持 `limit`；**在此 return，不落体**——落到展开分支会让每个条目带上整篇正文，R100 门禁正是抓这个）（5947–6000）。
  - 展开模式：`wantId` 给定时直读 `Members/<m>/<dir>/<id>.md`（命中才收）；不给 id 时枚举全部卡片（正文 **slice(0,4000)**）+ `Progress/progress.md` **尾 6000** + 四条分轨**各尾 2000 并带 `droppedChars`**（截断**必须计数**，6028–6042）。
  - **悬空 id 必须具名拒**：`wantId && out.length===0` ⇒ `{ok:false, code:'V5_INVALID_ARGUMENT', message:'读不到对象 <id>…不得改用记忆/猜测/近似对象', next:{kind:'expand-by-id', tool:'vibe_v5_read_library', …}}`（6044–6058，S21/D5/G3）。
  - 成员集合：给 `member` 用 `memberById`，否则 `activeMembers()`；`kind` 过滤 `proposition|method|subproblem`。
- **指针传播契约 `headerListContractBlock()`（范围外 372–383）**：8 条规则（跨对象只持头部列表；要正文用 id 展开；指纹与头部不一致必须重新拉取；引用他人结论必须带 id；上下文无正文不得凭记忆叙述；论文阶段按 id+指纹重建正文，不一致 ⇒ **具名阻塞并上报**；禁止猜/改写/拼写 id；Lean 归档正文不在头部列表，用 `vibe_v5_lean_lib`/`vibe_v5_lean_read`）。开关 `pointerPropagation`（默认 true）通过 `pointerContractBlock()`（2065–2068）**一处**生效：关 ⇒ 8 个注入点全部零注入。
- **提示词注入点（8 个 builder）**：`initialPrompt`/`normalPrompt`/`checkpointPrompt`/`meetingPrompt`/`verifyPrompt` + 三个会议/验证变体（4078、4102、4122、4171、4229 等），顺序固定在**状态块之前**。
- **宿主接触面**：`ctx.fs`（`resolve/stat/listDir/readText/writeText`）。
- **file:line**：362–383、2065–2068、5829–6060。

### 1.12 `[FORMAL]` Lean 形式化验证 —— 模式、路径与状态机

- **入口**：`formalVerify`（`'off'|'encourage'|'require'`，默认 `off`）+ `leanInitiative`（`'off'|'normal'|'eager'`，默认 `normal`）。`FORMAL_MODES` 4323；`formalMode()` 非法值回落 `'off'`（**笔误绝不能静默升级为强制**，4324）；`formalOn()`（4325）；`leanInitiative()` 4330；**`leanDailyOn() = leanInitiative!=='off' && (formalOn() || leanInitiative==='eager')`** —— 两个轴独立：`formalVerify=off + leanInitiative=eager` 仍注入日线（4331）。
- **路径**：`formalRoot()=instRoot()+'/Formal'`；`formalRootRel()=instRootRel()+'/Formal'`（**对成员文件工具可用的 CWD 相对完整路径**，提示词广告的是这个）；`formalLibRoot()=vibeRoot()+'/Formal/Lib'`；`formalProvedRoot()=vibeRoot()+'/Formal/Proved'`；`verifiedLeanRoot()=instRoot()+'/Verified/Lean'`（4332–4340）。
- **记录**：`formalRecords()=inst().formal||{}`；`formalTodo()=inst().todo||[]`；`formalOf(target)` 返回记录或 `{status:'none'}`（4341–4346）。
- **写 API `putFormal(target, record, todo)`**（4347–4349）：`commit(EV.formal, {target:idSafe(target), record, todo})`；`record`/`todo` **可以是函数**（fold 内应用 ⇒ 并发写不同 target 不丢条目，fold 见 831–853）。
- **门禁谓词 `formalGateOk(rec)`**：`status ∈ {'passed','blocked'}`（**`passed` 必须有绿色运行，光有归档文件不算**，4350–4352）。
- **状态行 `formalStatusLine(target)`**：passed ⇒ `Lean 通过（proof||file）`；blocked ⇒ `阻塞（note||未说明）`；attempted ⇒ `已尝试未通过`；否则 `未尝试`（4353–4359）。
- **`tail(s,n)`** 工具（4360）。
- **状态机（唯一权威 = docs/formal-verification.md §4 表 + 实现）**：
  | 事件 | 迁移 | 实现 |
  |---|---|---|
  | `lean_run` 成功/失败 | `none/attempted → attempted`；**已是 passed/blocked 保持原状**（一次随手运行不得撤销已成立的证明） | `formalSetRun` 4503–4512 |
  | `lean_archive kind='proof'` + 异步作业 `settled(ok)` | `→ passed`，写 `Verified/Lean/<id>.lean`，`proof` 指针，`decision:'used'`，`decisionSource:'job-settle'`，`sha256` 沿用作业 `contentSha256` | `leanApplySettle` 4793–4824 |
  | 同上但未 settled | `→ attempted`，`proof:''`，`note` 追加"文件内容已改变，本次结果不用于判定"等 | 4796–4820 |
  | 同步路径失败重归档 | `→ attempted`，**清空 `proof`**（旧证明指向的代码刚被覆盖） | 5758–5780 |
  | `kind='blocked'`（工具或回执 `decision:'blocked'`） | `→ blocked`（`note` 必填，空则 `V5_INVALID_ARGUMENT`） | `leanArchive` 5786–5797 / `handleReply` 9468–9471 |
  | 回执 `decision:'used'` | `→ attempted`（记录 `file`），**passed/blocked 保持** | `handleReply` 9472–9479 |
  | 回执 `decision:'defect'` | `→ attempted`、`proof:''`、`sha256:''`、撤回归档证明、写 TODO、公告 | `recordFidelityDefect` 4544–4585 |
- **`recordFidelityDefect(memberId, rawTarget, note)`（4544–4585）**：`target`/`note` 必填（缺 ⇒ `V5_INVALID_ARGUMENT`）；**两半都在 fold 内**（record 与 todo 都是函数，MEDIUM 6）；`fidelity` 对象**合并**而非替换（`fidelity` 保留历史 marker，F1/S3）；`sha256:''` 丢掉内容身份（S21/D3）；`removeArchivedProof(proofRel)`（默认 `Verified/Lean/<t>.lean`）后写 `Formal/TODO.md`+`Formal/Index.md`+群聊；撤回失败时**显式告警**"归档证明未能撤回，记录已降级，请勿当证明"（4576–4584）。
- **`removeArchivedProof(rel)`（4520–4541）三条路**：① 优先走**带 policy 的 fs 服务**覆写为撤回声明并**读回校验**含"已撤回"；② 回退平台 shell 真删除（`Remove-Item -LiteralPath` / `rm -f`）并读回确认；③ 再覆写一次兜底。返回 `true` 表示"归档不再读起来像证明"（删除或覆写皆可）——消息里刻意不写"已删除"。
- **L2 强制弃权（跨文件，但属本机制）**：同一回执里声明了某对象的 `defect` ⇒ 框架把**该成员对该对象**的 `verdict` 记为**弃权 0.5**（`defectTargetsThisReply`，9366–9369、9501–9532），并把 `voteAbstainedByFramework[]`+`abstainedCount` 记入 formal 记录的 `fidelity`（**数组**，两人同轮互不覆盖），且**只影响声明者与当轮**（无跨轮状态、其他票不动）。`encourage` 档没有门禁 ⇒ 靠这条弃权保证"本轮无法得出一致布尔结论"（5428–5438）。
- **持久化/恢复**：`formal{target→record}`、`todo[]` 在 `EV.formal` fold（831–853），耐久；`Verified/Lean/<id>.lean`、`Formal/<id>.lean`、`Formal/Index.md`、`Formal/TODO.md` 是文件面；**`off` 档回执里的 `formal` 字段被 `formalOn()` 守卫挡住**（9420–9435：off 是真 no-op，残留/幻觉回执不得创建形式化状态；工具仍可用，因为"工具调用是刻意行为"）。
- **宿主接触面**：`ctx.fs`、`subprocess`（经 `leanRunFile`）、群聊/通知。
- **file:line**：4323–4599、9418–9535（回执侧，范围外）。

### 1.13 `[FORMAL]` 路径守卫与单文件执行 `leanAbsPath` / `leanRunFile`

- **`normalizeAbsPath(p)`（4366–4376）**：纯词法归一（折叠 `.`/`..`/重复斜杠，不碰文件系统）。注释点名：仅 `startsWith(root)` 不够，`…/Projects/../../../../etc/evil.lean` 字符串上仍以 root 开头却能越界。
- **`leanAbsPath(rel)`（4379–4394）**：接受两种拼写——**文档化的 CWD 相对完整路径**（`instRootRel()+'/Formal/…'`，成员自己的文件工具产出的就是这种）与短的 `Formal/x.lean`；先剥离文档前缀，再无前缀则拼 `instRoot()`；归一后必须 **等于 `vibeRoot()` 或在其下**（否则 `null`）；空串 ⇒ `null`。
- **`leanRunFile(relPath, timeoutMs, hooks)`（4401–4491）**：**绝不把异常抛进调度器**，每个失败都变可读结果：
  - `!rel` ⇒ `V5_INVALID_ARGUMENT`；`leanAbsPath===null` ⇒ `V5_INVALID_ARGUMENT`（消息点名必须位于 `<VibeMath 根>/` 下）；非 `.lean` ⇒ `V5_INVALID_ARGUMENT`；文件读不到 ⇒ `V5_NOT_FOUND`；`subprocessOf()` 无 `spawn` ⇒ `NO_SUBPROCESS`（4402–4416）。
  - `cap = max(1000, timeoutMs || params.leanTimeoutMs || 120000)`（4417）；引擎解析 `resolveKnownTool(sub,{name:'lean', explicit: leanCommand!=='lean'?leanCommand:'', kind:'lean'})`，失败 ⇒ `LEAN_NOT_FOUND` + `next.tried`（4409–4424）。
  - `argv = [exe, ...prefix.slice(1), abs]`（`prefix` 由 `leanRunPrefix()` 给：`[engine, ...leanArgs, ...searchArgs]`，4425–4426、4664–4671）；`spawn({argv, cwd: instRoot(), stdio:{stdin:'ignore', stdout:{maxBytes:64KB}, stderr:{maxBytes:64KB}}, graceMs:cap})`（4429–4434）。
  - `hooks.onHandle(handle)` 把活进程交给异步队列（dispose 时 terminate）；`hooks.onBuildPrefix(pfx.prefix)` 把**归一化构建前缀**交给 settle 校验（**作业只能落地它入队时的构建上下文**，4436–4439）。
  - **超时必须真的终止**：`Promise.race([guarded done, ctx.timeout(cap)→timedOut=true; handle.terminate(); resolve(SIGTERM)])`；disposer 在 finally 里两条路都清；`done` 晚到不得变成 unhandled rejection（4451–4477）。
  - 取输出：`handle.collected.stdout.readFrom(0).text`（best effort）（4478–4480）。
  - 返回 `{ok:exitCode===0, exitCode, signal, ms, command, file, leanFoundVia, stdout:tail(4000), stderr:tail(4000), timedOut: timedOut||ms>=cap, code: ok?undefined:(timedOut||ms>=cap?'LEAN_TIMEOUT':'LEAN_FAILED')}`（4484–4490）。
- **`formalSetRun(target, run)`（4492–4513）**：`record` 以**函数**形式传 fold（并发写同 target 不覆盖，MEDIUM 6）；`keep = passed|blocked ? 原值 : 'attempted'`；写 `file`、`run:{at,ok,exitCode,ms,stdoutTail:800,stderrTail:800}`、`updatedAt`。
- **`leanRunTool(memberId, o)`（5581–5619）**：`leanAsync !== false` 时走 `leanPrecheck` + 读文本 + `leanRunPrefix` ⇒ `enqueueLeanJob({jobId: leanJobId(target||rel, leanBuildDigest(text,prefix)), kind:'run', rel, file:rel, target, member, contentSha256: sha256Hex(leanHashText(text)), buildHash: leanBuildHash(prefix), buildPrefix, timeoutMs: args.timeout_ms})`；返回 `{ok:true, async:{jobId,state:'queued'}, jobId, file, target, message}`，message 明确"公告只投给发起者、**重启后不再补发**，长期查询用 `vibe_v5_lean_job {jobId}` / `Formal/Jobs/<jobId>.json` / `lean_lib.jobs`"（5596–5602）。同步档：`leanRunFile`，有 `target` 则 `formalSetRun` + `writeFormalIndex`，成功写群聊，返回体带 `hint`（通过 ⇒ 用 `kind='proof'` 归档；失败 ⇒ 修复重跑或 `kind='blocked'`）（5603–5618）。
- **file:line**：4360–4513、5581–5619。

### 1.14 `[FORMAL]` 异步 Lean 编译队列（本分片最关键的「作业持久化/断点续算」实现）

- **入口**：`lean_run`（默认 async）、`lean_archive{run:true}`（默认）、`kind='lemma'` 隐式编译；`lean_job` 查询。
- **内存结构（4594–4601）**：`leanJobs:Map(jobId→job)`（**权威**）、`leanActive:Map(jobId→{job,handle})`、`leanActiveJob/leanActiveHandle`（最近启动者，供提示/卸载报告）、`leanDrainTimer`、`leanRecoveryDone`、`leanDisposed`、`leanNotices[]`（**上限 20**，4852–4853）。
- **`leanJobsMax()` = `max(1, floor(params.leanJobsMaxParallel || 1))`**（4602，默认 1 = 严格串行）。
- **耐久镜像**：`leanJobRel(jobId) = 'Formal/Jobs/' + jobId + '.json'`；`leanWriteJob`（best-effort，**从不抛**）；`leanReadJobMirror`；`leanJobMirrorSettled(rec) = rec.state==='settled' && Number(rec.exitCode)===0`（4603–4610）。
- **内容去重 `leanLibArchivedOk(name, sha)`**：先查内存队列，再遍历 `Formal/Jobs/*.json`（`fs.resolve`+`fs.stat`+`fs.listDir`），命中"kind='lib' && name && contentSha256===sha && 镜像 settled"⇒ true；没有镜像 ⇒ 不去重（4614–4629）。
- **`leanNextQueued()`**：`state==='queued'` 里 `enqueuedAt` 最小者（**FIFO**）（4635–4639）。
- **搜索根**：`leanSearchRootView()` = `vibeRoot()` 正斜杠化；`leanSearchRoot()` 绝对路径直接用，相对路径经 `fs.resolve` 取 `targetKey||displayPath`（4641–4650）。
- **构建摘要（jobId 的键）**：
  - `leanRunPrefix()` = `{engine, userArgs, searchList, searchArgs, prefix:[engine,...userArgs,...searchArgs]}`——**归一化构建前缀，不含文件名**（4662–4671）。
  - `leanInjectedSearchList(userArgs)`：`leanArgs` 已含 `-R`/`--root`/`--search-path`（`leanHasSearchFlag` 263–272）⇒ **返回 `[]`（显式覆盖优先）**；否则 `leanSearchPaths`（用户顺序）+ 自动 `vibeRoot()` 去重（4674–4680）。
  - `leanBuildDigest(contentText, prefix) = sha256(leanHashText(content) + '|' + JSON.stringify(prefix))`；`leanBuildHash(prefix) = sha256(JSON.stringify(prefix))`（4681–4684）。
  - `leanJobId(key, sha) = String(key) + '-' + sha.slice(0,12)`（**同一文本在不同 flags 下是不同的作业**，4657–4661）。
  - `leanHashText`（274–276）：`\r\n?→\n` + 去尾部空白；`sha256Hex`（292+）是**手写 SHA-256**（文件零 import，测试对 published vectors 与 `node:crypto` 双向核对）。
- **装填/驱动**：
  - `armLeanDrain(ms)`（4685–4694）：已 dispose 或已有 timer 则不装；**`delay = (typeof ms==='number' && ms>0) ? floor(ms) : 0`** —— 注释点名 `posMs(0,…)` 会把 0 当默认 120s 从而**卡死队列**，所以这里不用 `posMs`。
  - `enqueueLeanJob(spec)`（4715–4725）：`Object.assign({}, spec, {state:'queued', attempts:0, enqueuedAt:now(), startedAt:0, settledAt:0, exitCode:null, ok:false, timedOut:false, interrupted:false})` ⇒ `leanJobs.set` ⇒ **先写镜像** ⇒ `armLeanDrain()`（**工具必须在下一次 tick 之前返回**）。
  - `runLeanQueue()`（4726–4745）：`while (leanActive.size < leanJobsMax())` 取队首 ⇒ `runLeanJob(job,slot)` 后台跑；`.finally` 里 `leanActive.delete`、清 active 指针、**若有下一个 queued 再 `armLeanDrain()`**。
  - 心跳接线：`armHeartbeat` 回调**先** `runLeanQueue()` **再** `scheduleNext()`（4263–4266）；即"暂停/已结题的研究所也会把已接受的作业跑完"（注释 4590）。
- **`runLeanJob(job, slot)`（4746–4783）**：`state='running'`、`startedAt`、`attempts+1` ⇒ 写镜像 ⇒ `leanRunFile(job.rel, job.timeoutMs, {onHandle, onBuildPrefix})`（异常包成 `LEAN_RUN_FAILED`）⇒ 重新 `leanHashFile(job.rel)`；**`settledOk = run.ok && hashMatched && buildMatched`**（三条件），其中 `buildMatched = buildHash(actualPrefix) === job.buildHash`，不匹配时 stderr tail 记"构建上下文已改变（leanArgs/搜索路径在入队后被修改），本次结果不用于判定"；终态 `settled | interrupted | timeout | failed`；`job.run` 记录；`leanApplySettle`；写镜像；`leanQueueNotice`。
- **`leanApplySettle(job, run, settledOk, hashMatched)`（4786–4844）**：**唯一**让对象因编译变 `passed` 的地方，按 kind 三分支：
  - `proof`：`status = settledOk ? 'passed' : 'attempted'`；`proof = settledOk ? 'Verified/Lean/<t>.lean' : ''`；`decision='used'`、`decisionSource='job-settle'`；**`sha256` 沿用 `job.contentSha256`**（S21/D1/D3：settle 写入会替换整条记录，不带上就会把归档身份清掉）；`note` 追加 stale 说明；`settledOk` 时写 `Verified/Lean/<target>.lean`（内容 = `job.content`）⇒ `putFormal` ⇒ `rebuildLeanLibIndexes()` ⇒ 群聊。
  - `lib`：有 target 则更新记录的 `file/run/async`；`rebuildLeanLibIndexes()`；群聊。
  - 其它（普通 run）：`formalSetRun(target,run)` + 附加 `async` 记录 + `writeFormalIndex()`；群聊。
- **公告一次性 `leanQueueNotice` / `takeLeanNoticesFor(memberId)`（4845–4871）**：行文本按 `settled/timeout/interrupted/failed` 四态；`leanNotices` 上限 20；`takeLeanNoticesFor` 先**剪掉已非 active 成员的通知**（L8：否则永远投不出去却占槽），再只取该成员自己的并移除 ⇒ **"结算结果恰好在成员的下一轮提示里出现一次"**。
- **崩溃恢复 `recoverLeanJobs()`（4915–4966）**：幂等（`leanRecoveryDone`）；扫 `Formal/Jobs/*.json`（`fs.resolve/stat/listDir`）：
  - `queued` ⇒ 重新放入内存队列 + 群聊"从未开始，已重新入队"；
  - `running`/`interrupted` ⇒ `interrupted=true`；`leanMarkAttempted(rec, matched ? '崩溃恢复：上一次运行的结果不可知' : '…文件已被改写')`；**哈希仍匹配 ⇒ `state='queued'`、`startedAt=0`、重新入队（attempts 由后续 run 再 +1）**；不匹配 ⇒ `state='failed'`、写镜像、群聊"**不自动重驱**，请手动重跑（对象保持 attempted）"；
  - `settled && exitCode===0 && matched` ⇒ `leanApplyRecovered(rec)`（**补写 `Verified/Lean/<t>.lean` + `passed`**，写 `sha256`）+ 群聊"按作业记录补齐归档与 passed"；
  - 否则 ⇒ `leanMarkAttempted(rec, '崩溃恢复：作业未通过或内容已变')`；
  - 末尾若有 queued 再 `armLeanDrain()`；返回 `{scanned, requeued, attempted}`。
  - **调用点**：`ready()`/启动路径 1393（"状态文件装好之后"）、10294（另一处启动/resume 路径）；两处都 try/catch，注释说"已在 ready() 路径报过"。
- **`leanMarkAttempted(rec, why)`（4875–4891）**：`target` 空则返回；**`!sameJob && prev.status==='passed'` ⇒ 不降级**（"绝不降级更新的通过"）；`!sameJob && rec.kind!=='proof'` ⇒ 不写；否则 `status = prev.status==='blocked' ? 'blocked' : 'attempted'`，`proof = kind==='proof' ? '' : prev.proof`，写 `async:{jobId,state:'interrupted',attempts,enqueuedAt,startedAt,settledAt,exitCode}`，`note` 追加 why（去重），`updatedAt`；`writeFormalIndex()`。
- **`leanApplyRecovered(rec)`（4892–4914）**：`proof` 作业 ⇒ 写 `Verified/Lean/<t>.lean`（内容 = `rec.content`）⇒ `status:'passed'`、`proof`、`decision:'used'`、`sha256: rec.contentSha256||prev.sha256`、`run` 覆盖为 `{ok:true,exitCode:0}`、`async` ⇒ `rebuildLeanLibIndexes()`。其它 kind ⇒ 只更新 run/async 后重建索引。
- **`leanJobView(job)`（4967–4980）**：投影 `{jobId,state,kind,file,rel,target,attempts,exitCode,ok,timedOut,interrupted,buildMatched: job.buildMatched!==false,enqueuedAt,startedAt,settledAt,jobFile,proof,stderrTail}`。
- **`leanJobTool(o)`（4984–5003）**：`waitMs = max(0, min(600000, floor(...)))`；无 `jobId` ⇒ `{ok:true, jobs:leanJobsView(), count, running, maxParallel}`；有 ⇒ 先内存再镜像；**自轮询**（每轮 `runLeanQueue()` + 最多 25ms 睡眠）直到非 queued/running 或超时；超时返回**当前状态**而非抛错；`{ok:true, job, waitedMs, timedOut}`。
- **`disposeLeanJobs()`（5005–5024）**：`leanDisposed=true`、清 drain timer、把 `leanActive` 里每个作业标 `interrupted`+`settledAt`、`handle.terminate()`、再 terminate 最近的 handle；对每个作业**best-effort 写镜像** + `leanQueueNotice(job, …, true)`；返回 `{terminated}`。注册进 `leanDisposers`（5025）。⇒ **进程消失时进行中的编译必定不是 passed**。
- **`leanArchive(memberId, o)`（5654–5799）**：三分支细节见 §1.12 表；关键实现点：
  - `def`/`lemma`：`name` 必填（`V5_INVALID_ARGUMENT`）；`content` 或 `from`（`from` 必须是工作区内 `.lean`）二者其一否则拒；`rel = Formal/{Lib|Proved}/<name>.lean`；`sha = sha256(leanHashText(body))`；**去重 = 文件哈希相同 && `leanLibArchivedOk(name,sha)`** ⇒ `{deduped:true}` 不重写不重编译（5671–5676）；异步档走 `leanPrecheck(instRootless(rel))`（**hint 用绝对路径**，因为全局库在所根之外）+ 入队 `kind:'lib'` + `rebuildLeanLibIndexes()`；没有工具链则**回落到同步路径**以保留诚实的 NO_SUBPROCESS/LEAN_NOT_FOUND（5692–5696）；同步路径也会**补写一份 job 镜像**（`state: ok?'settled':timedOut?'timeout':'failed'`），供后续同内容去重与恢复扫描使用（5697–5705）。
  - `proof`：`target` 必填；`workRel = Formal/<target>.lean`；去重 = `prev.status==='passed' && 当前工作文件哈希 === sha`（5724–5728）；写工作文件后异步档把对象置 `attempted`（`blocked` 保持 `blocked`）、`proof:''`、`decision:'used'`、`async:{jobId,state:'queued',…}`；**"落地为通过之前不会写 Verified/Lean/、也不会转忠实性审查"**（5738–5752）。
  - `blocked`：`note` 必填（5790）。
  - 返回值都带 `sha256`、`fidelity`、`abstainedCount`（`(rec.fidelity||prev.fidelity).abstainedCount`），供 `lean_lib` / 报告做可读面（5727、5752、5784）。
- **`leanRead(o)`（5622–5653）**：`name` 必填且**拒路径形状**（含 `/`、`\`、`..`、盘符 ⇒ `V5_INVALID_ARGUMENT`）；`idSafe(raw)` 必须等于 `raw`（否则拒）；`kind ∈ auto|lib|proved`；依次查 `Formal/{Lib,Proved}/<name>.lean`（经 `leanAbsPath(instRootless(rel))`）；返回 `{ok,name,file,kind,sha256(sha256Hex(leanHashText(full))),bytes,text,truncated}`，正文上限 `LEAN_READ_MAX_BYTES`=64KB。
- **`leanLibArchivedOk` 的语义边界**：它**只看作业记录**，不重编译；`rebuildLeanLibIndexes` 也**刻意不执行工具链**（"每次问'有什么可复用'就跑 lean 会很慢也很意外"，5524–5528）。
- **持久化/恢复总结（目标 5 的关键对照）**：
  - **有**：作业镜像 `Formal/Jobs/<jobId>.json`（每次状态变化都写）、四态终态、`recoverLeanJobs` 的四分支恢复、`settled+hash 匹配` 可补写归档、`interrupted` 可重入队（attempts+1）、dispose 必中断。
  - **没有**：**没有后台守护进程**（docs/formal-verification.md §11："异步队列不是持久任务系统 —— 队列是内存态 + 镜像"）；**公告不补发**（只有"发起者下一轮"一次性；重启后必须查 `lean_job`/镜像）；`leanJobs` 是**会话内**的 Map，第二个会话看不见第一个会话的队列（只能看镜像）。
- **file:line**：4587–5025、5649–5705、5581–5619。

### 1.15 `[FORMAL]` 三个索引 + 形式化提示词块

- **`writeFormalIndex()`（5494–5513）**：写 `Formal/Index.md`；表头 `对象|状态|形式化文件|归档证明|最近运行|难度判断/阻塞原因`；run 列格式 `ok（exit 0，1.2s）`/`fail（exit N，…s）`/`—`；note 去 `|` 并截断 120；有 TODO 时追加 `## 形式化待办（require 模式：定论被搁置）`。
- **`writeFormalTodo()`（5514–5523）**：写 `Formal/TODO.md`，逐条 `- <id>|<why>|<时间>`；空则"（暂无）"。
- **`rebuildLeanLibIndexes()`（5524–5571）**：`scan(dirAbs, dirRel, kindLabel)` 扫 `.lean`：抽**第一条非注释非 import 代码行**作摘要（截断 110）、抽所有 `import ` 行作依赖列；产出 `rows`（md 表）与 `cards`（`{name,file,kind,summary,sha256}`，sha 用 `sha256Hex(leanHashText(txt))`）；分别写 `vibeRoot()+'/Formal/Lib/Index.md'` 与 `.../Proved/Index.md`；再 `writeFormalIndex()`+`writeFormalTodo()`；返回 `{lib,proved,objects,libCards,provedCards}`。**不执行工具链**。
- **`instRootless(rel)`（5574）**：vibe-root 相对 → 绝对（全局库在项目树旁边）。
- **`formalPromptBlock(target)`（5413–5472）**：`off` 返回空串；`passed` ⇒ **忠实性审查**措辞（"不需要重新检查推导"；发现偏差**不要投 0**，给严格介于 0 与 1 的值 + `formal:{decision:'defect',note}`；框架撤回"已通过"；`require` 档明说本次不定论，`encourage` 档**不得承诺它无法强制的搁置**，要靠弃权；只有独立于 Lean 也能确定命题为假才投 0）（5419–5440）；`blocked` ⇒ 复核阻塞判断（5441–5443）；否则给难度判断流程、工具名、工作目录（`formalRootRel()/` 与短形两种写法都接受）、复用路径（Lib/Proved）、`require` 档的门禁说明、**"宿主无 Lean 工具链（LEAN_NOT_FOUND / NO_SUBPROCESS）也算显式阻塞原因，门禁可放行"**（5444–5470）。
- **`formalWorkLine()`（5473–5492）**：日常"顺手形式化"段；`off` 时返回空；`eager` 追加"主动"句；写明查重优先、`import Formal.Lib.<name>`/`vibe_v5_lean_read` 复用、**默认后台队列（leanAsync=true）且"作业落地为'通过'之前不得把该对象当成已通过"**、`require` 档句子。
- **file:line**：5493–5574、5413–5492。

### 1.16 `[MATH]` `math_computation` 接缝（宿主侧，5027–5222）

- **路径守卫（纵深防御，模块自己也有一层）**：
  - `mathRelPath(rel)`（5032–5042）：反斜杠归一；空/绝对/盘符 ⇒ `null`；`..` 弹栈，**越出则 `null`**；返回归一化 institute 相对路径。
  - `mathWriteRel/mathReadRel/mathExistsRel/mathListDirRel`（5043–5071）：`''`/`'.'` 在 `listDir` 表示**项目根本身**；其余非法路径 ⇒ `false`/`undefined`/`[]`。
- **`mathResolveExecutable(cmd)`（5072–5078）**：无 subprocess 服务 ⇒ `throw new Error('NO_SUBPROCESS: the host exposes no subprocess service')`；解析不到 ⇒ throw。
- **`mathSpawn(opts)`（5084–5151）**（模块调用契约 `{argv,cwd,timeoutMs,stdoutCap,stderrCap,stdin}`，期望**完整捕获输出**）：
  - 无 subprocess 服务 / 空 argv ⇒ **返回 `null`**（模块把它映射为 `MATH_NO_SUBPROCESS`，5087–5089、5109–5111）。
  - `cap = max(1000, floor(timeoutMs || params.mathTimeoutMs || 60000))`；`outCap = max(MATH_CAPS.stdout, floor(stdoutCap || MATH_CAPS.file))`；`errCap` 同（**stdio 上限必须 ≥ 模块的 64KB 返回上限、以 `MATH_CAPS.file`=4MB 为默认**，5081–5083、5091–5093）。
  - `spawn({argv, cwd: o.cwd||instRoot(), stdio:{stdin: o.stdin===undefined?'ignore':'pipe', stdout:{maxBytes:outCap}, stderr:{maxBytes:errCap}}, graceMs:cap})`；spawn 抛异常 ⇒ 返回 `{exit:null,timedOut:false,killed:false,ms,stdout:'',stderr:err}`（5096–5108）。
  - `stdin` 提供时写入并 `end()`（best effort）（5112–5114）。
  - **超时真 kill**：与 `leanRunFile` 同构的 race + `handle.terminate()` + finally 清 disposer（5115–5138）。
  - 返回 `{exit, timedOut, killed: timedOut||!!signal, ms, stdout, stderr}`（**完整文本**，不截断）（5139–5150）。
- **`mathLog(kind,msg)`**：`saveChatLine('【计算】'+msg)`，异常吞掉（"日志行绝不能弄坏一次运行"）（5152–5154）。
- **`mathSessionHost`（5157–5177）**——模块与本所之间的**唯一耦合面**：
  `register:()=>{}`；`params:()=>Object.assign({},params)`；`projectRoot:()=>instRoot()`；`designator:'vibe-math-v5r'`；`writeText/readText/exists/resolveExecutable/spawn`（上面几个）；`hasSubprocess`（让模块在引擎探测前就报 `MATH_NO_SUBPROCESS`）；`listDir`（P2a 保留上限用）；`runtimeRoots`（**`process.env.DSH_HOME` 有则**用它，否则 `HOME|USERPROFILE`+'/.dsh'**，注释明说"显式设置即隔离发现"）；`listDirAbs`（`fs.resolve`+`fs.stat`+`fs.listDir`，异常返回 `[]`）；`log`。
  注释强调：这个 host **同时**被"可用性行探针"使用，而探针在**工具调用之外**运行，所以不能依赖"当前会话"环境（5155–5156）。
- **`refreshMathLine()`（5183–5206）**：`mathComputation==='off'` ⇒ 两语言行为空串（**零提及纪律**）；否则 `probeMathEngines(mathSessionHost)` ⇒ `mathAvailabilityLine(probe,lang,mathMode)`；然后 **4 条漂移守卫**：中文/英文各自必须仍含 `MATH_RULE_LINES[0]`/`MATH_RULE_LINES_EN[0]`、`MATH_ARCHIVE_WORKFLOW_LINE(_EN)`、`MATH_SUBSTITUTION_RULE_LINE(_EN)`，缺失只 `console.error`（5191–5200）；探针异常 ⇒ 保留旧值，**绝不让提示词构造失败**（5202–5205）。
- **`mathPromptBlock(lang)`（5209–5219）**：有动态行则用它；否则退回 `MATH_PERSONA_TOOL_LINE` + 归档工作流 + 替代声明规则（`off` ⇒ 空串）。**`mathPushLine(L)`（5222）** 把中文块 push 进提示词（一行，`off` 时 no-op）。
- **工具注册（范围外 10986–11024）**：
  - 模块的 `MATH_TOOL_NAME = 'math_computation'`（**刻意无 `vibe_` 前缀**：四套预设同一原语）；`projectRoot()` 是**研究所根** ⇒ 回执落在 `<研究所>/Computation/<runId>/`（10986–10988）。
  - 先用 `mathMetaHost`（假 host，回调永不触发）调 `registerMathComputation` **只为拿冻结的工具面**；**漂移守卫**：`mathToolMeta.description !== MATH_TOOL_DESCRIPTION` ⇒ `console.error`（10989–11010）。
  - 每个 session 一个模块实例：`mathSessionHandlers: WeakMap(session API → handler)`，`mathHandlerFor(s)` 用 `s.mathSessionHost()` 注册，无 handler 时给安全兜底 `MATH_INVALID_ARGUMENT`（11011–11020）。
  - `registerTool(mathToolMeta.name, mathToolMeta.description, mathToolMeta.parameters, (s,args)=>mathHandlerFor(s)(args))`（11021–11024）。⇒ **工具名/描述/参数 schema 不是 v5r 手写的，而是共享模块冻结面**。
  - 参数 `vibe_v5_set` 接受：`mathComputation`/`mathMode`/`mathInstallScope` 在 `strs`，`mathTimeoutMs` 在 `ints`，`mathEngines`/`mathPackages` 在 `arrs`（9778–9782、11070）。
- **file:line**：5027–5222、10986–11024、（+5762–5782）。

### 1.17 `[MATH]` 论文（LaTeX）提示块 `paperHintBlock` / `paperPushLine`

- `paperHintBlock(lang)`（5228–5232）：LaTeX 缺失时的**四步有界指引 + 三条硬边界**——① 只在文档化的常见 TeX 根与 PATH 上**有界**核查（`where xelatex`、`latexmk --version`），**不要全盘扫描**；点名"最常见的情形是引擎装了但不在 PATH"并给出 Windows 盘根 `texlive\<年>\bin\windows`、Unix `/usr/local/texlive/<年>/bin/*` 与 `/opt/texlive/...`、macOS `/Library/TeX/texbin`；② 找到绝对路径写进 `paperLatexCommand` 后重检；③ 仍找不到 ⇒ **如实上报所办/群聊**，由所办向用户确认（装 TeX 需用户明确同意）；④ 无回应则照旧降级（只交付 `paper.tex`+`paper.md`）。**硬边界：绝不自动安装；绝不写工作区之外；绝不把"未检测到"当失败。**（task-9 四步三边界；task-28 补"装了但不在 PATH"与 TeX Live 文档位置。）
- `paperPushLine(L)`（5233–5241）：每次唤醒都 push，但**前置一句"以下这段仅在你参与论文写作或编译时适用"**（P4 铁律修复：这段原本在入职/验证/会议提示里像无解释的噪声）。
- **file:line**：5224–5241。

### 1.18 `[OTHER]` 成员自查＋自述（G6）

- **入口**：`vibe_v5_self_report {overall?,subgoal?,plan?,status?,reason?,source?}`（无字段 = **只读查看**并留痕）；另可经 `member|memberId|for|target` 指向他人（**仅院士可为他人的 `overall`**）。
- **逻辑（7131–7223）**：
  - 只有 `academician|researcher` 可写（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`）；只读查看不受限（7134–7137）。
  - **时间由框架设置**：工具层与函数层**各查一次** `/(At|Ms)$/i`（大小写不敏感，堵 `subgoal_at`/`expires_at` 这类全小写），命中 ⇒ `V5_INVALID_ARGUMENT`（7139–7145、7213–7218）。
  - `source ∈ {self,negotiated,academician}`，其余归 `self`（7146–7147）。
  - 字段差异 → `changes[]`；**无变化 ⇒ `{ok:true,deduped:true}` 且不追加历史**（幂等）（7165–7170）。
  - 有变化：逐字段写值 + `SELF_TIME_OF={overall:'overallAt',subgoal:'subgoalAt',plan:'planAt'}` 打时间戳 + `history.push({at,by,field,old,next,reason,source})`（7171–7177）；`overall` 的**作者不是自己**时记 `deviation:{at,by,keptAcademicianValue,keptValue,keptAt,keptBy}`（**保留原值与旧时间、可取回**），否则 `overallBy = (source==='academician'?'academician':m.id)`（7178–7186）；写盘 + 群聊（含"已偏离院士设定"提示）（7187–7194）。
  - 他人自述：`actor.kind==='academician'` 且**只有 `overall` 一个字段**才放行，否则 `V5_INVALID_ARGUMENT`（7204–7212）。
- **文件承载（不碰 fold/EV 表）**：`Members/<id>/SelfReport.json`，写入是 **tmp + rename 原子**（`fs.mkdirSync(recursive)`、`writeFileSync(tmp)`、`renameSync`）（7075–7092）。
- **查看留痕**：`Shared/SelfReportViewAudit.json`，append `{at,by,saw}` 并 **cap 200**（`SELF_VIEW_AUDIT_CAP`）；**留痕失败不得让查看失败**（7093–7103）。
- **查看面**：`selfReportView(viewerId)` 分两组——在册（academician/researcher）与 `nonVoting`（列席/受邀/临时工**单列并标注**）；每行只含工作状态字段（`overall/subgoal/plan/status` + 各自 `…At` + `deviation/deviationLabel`）；返回 `viewAuditTail`（最近 20）；**私聊内容永不进入**（7104–7130）。
- **宿主接触面**：`node:fs`（**直接 import，不经 ctx.fs**）——这是本分片唯一直接使用 Node 文件系统的地方（7076、7094）。
- **file:line**：7069–7223。

### 1.19 `[OTHER]` S4 主持代行 / 程序异议 / 结束辩论（含 `formal_proof` 登记）

- **`chairProxyTool`（`vibe_v5_chair_proxy`）（7235–7277）**：仅院士（否则 `V5_NOT_ACADEMICIAN`）；时间键 + `until` 一律拒；**必须有进行中会议**（否则 `V5_NO_OPEN_MEETING`）；`scope` 只能 `'close'`（唯一取值，`CHAIR_SCOPE_CLOSE`=7228）；`why` 必填；代行者必须是**在册 active** 成员；同值重复 ⇒ `{ok:true,deduped:true}`（**不追加历史、不刷新 `since`**）；入档 = `patchInstitute({chair:rec})` **耐久副本** + 当次会议内存对象 `meeting.chair`；**明确不产生新票权**（不碰名册与 `voters()`）；群聊公告"代行不产生新票权、主持不额外加权"。
- **`proceduralObjectionTool`（`vibe_v5_procedural_objection`）（7280–7306）**：只有**在册成员**可提（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`）；必须会议在飞（`V5_NO_OPEN_MEETING`）；`why` 必填；按 `(by,why)` 幂等；入档 = `meeting.objections[]` + 纪要尾部（`appendMeetingTail`）；**`chairReplyPending:true` 必须保持可见**（不得假装已回填）；**只记录不驱动**（不改票面、不改阶段、不延后收束）。
- **`endVerify(memberId, target, reason, op, status)`（7309–7358）**：
  - 权限 `gateDo(member.id,'end_verify', '只有院士可以显式结束辩论（R10-2a）…')`。
  - **`op==='formal_proof'`（S25-C / issue #13 #1）**：`target` 经 `idSafe`；`status` 必须 `'proved'|'disproved'`；`patchInstitute({formalProofs: (cur)=>Object.assign({},cur||{},{[t]:{status,by:memberId,at:now(),ref:reason,locked:true}})})`（**函数式变更，并发登记不互相覆盖**）；群聊并 `notifyActivity()`；返回 `{ok,target,formalProof}`。**只登记、不推进辩论**；自此该命题才有资格进入验证/辩论（见 §3）。
  - 否则：必须有在飞验证（`V5_INVALID_ARGUMENT`）；`target` 不一致 ⇒ 拒；`judgeVerdict(vs,'academician')`；`ended = {...vs, endedBy:'academician', endedByMember, endedAt, endReason}`；`true/false` ⇒ 过 `require` 门禁后 `closeVerify` 或 `deferForFormal`；否则 `finalizeUndecided(ended, j, {endedBy:'academician', bound:null})`；返回体**同时**给 `outcome/reason` 与 `process:{m,Peff,P,bTrue,bFalse,abstain,estimates,votedCount,answered,silent,unable,mean,provisional:true}` + `provisional:false`。
- **持久化**：`chair`/`formalProofs` 都在 fold 白名单（634、662–667）；`meeting.objections` 只活在当次会议 + 纪要尾部（耐久文件）。
- **file:line**：7224–7358。

### 1.20 `[OTHER]` 边界说明（相邻机制归属）

- `saveChatLine(text)`（7365–7376）：群聊**人读镜像** `Shared/Chat/<YYYY-MM-DD>.md`，append 经**单条 promise 链**串行化（权威记录是 `inst().messages`）；空行直接 `false`。
- `wakeIfIdle(member, kind)`（7379–7384）：`!running || autoDone` ⇒ false；非 active ⇒ false；`busy` ⇒ false；否则 `wakeMember(member, normalPrompt(member), kind||'normal')`。
- **`// ---- meetings ----`（7385 起）属于分片 C**：`startMeeting` 的 park 规则、发言模型（机会位/发言位/票位）、`meetingHardLimitMs`（默认 1800000，钳制 `[300000,7200000]`）、`meetingWakeRetries`（默认 5，钳制 `[0,10]`）等，本文件只在需要交叉引用时点名（例如 `taskAssign` 的 `origin:'meeting:<mt>'`、`bumpArtifacts` 的 `meetingKeepEvery` 自动同步、`startMeeting` 与 `verify` 互斥）。

---

## 2. 标签索引（机制 → 标签 → file:line）

| 标签 | 机制（file:line） |
|---|---|
| `[SPAWN]` | 成员诞生五步 `spawnMember` 3747–3851；投递一轮 `wakeMember` 3859–3932；`startWithToolFilter` 重试 9711–9726（范围外） |
| `[PROMPT/PERSONA]` | `replySpec` 3978–4047；`initialPrompt` 4054–4083；`normalPrompt` 4084–4107；`checkpointPrompt` 4108–4127；`meetingPrompt` 4128–4176；`verifyPrompt` 4177–4241；`stateBlock/briefBlock` 4051–4053、3376–3421；`pointerContractBlock` 2065–2068；`resourceBlock` 2069–2085；`proofStatusBlock` 2087–2097；`formalPromptBlock` 5413–5472；`formalWorkLine` 5473–5492；`mathPromptBlock/mathPushLine` 5209–5222；`paperHintBlock/paperPushLine` 5228–5241；`feedbackPushLine` 5403–5411；`coreRules` 5809–5812；`headerListContractBlock` 372–383（范围外） |
| `[SCHED]` | `recoverStallMs` 4249；`clearHeartbeat` 4250–4253；`armHeartbeat` 4257–4268；`armDigest` 4270–4276；`armLeanDrain` 4685–4694；`notifyActivity/waitForActivity` 3429–3435 |
| `[TASK]` | 原语 4279–4306；`validateDeps` 6069–6098；`taskCreate` 6099–6143；`listTasks` 6144–6152；`getTask` 6153–6157；`taskUpdate` 6161–6292；`taskAssign` 6297–6373；`taskPrioritize` 6374–6394；`releaseTasksOf` 6397–6404；`writeTaskboardMirror` 6405–6418；`writeRosterMirror` 6422–6449 |
| `[FORMAL]` | 模式/路径 4323–4359；`leanAbsPath` 4366–4394；`leanRunFile` 4401–4491；`formalSetRun` 4492–4513；`removeArchivedProof` 4520–4541；`recordFidelityDefect` 4544–4585；队列 4594–5025；`formalPromptBlock` 5413–5472；`formalWorkLine` 5473–5492；三索引 5493–5574；`leanRunTool` 5581–5619；`leanRead` 5622–5653；`leanArchive` 5654–5799；回执侧 9418–9535（范围外） |
| `[MATH]` | 接缝 5027–5222；注册 10986–11024；`math-computation.js` 全文；`math-engines.js` 全文 |
| `[FEEDBACK]` | 常量 74–92；5243–5411；注册 11154 |
| `[LIBRARY]` | `bumpArtifacts` 5844–5856；`publishProgress` 5862–5881；`recordCard` 5885–5931；`readLibrary` 5932–6060；`contentFingerprint` 362–365（范围外） |
| `[COMPACT]` | `coreRules` 5809–5812；`postmark` 5818–5827；`maybeRealCompact` 9728–9749（范围外） |
| `[VOTE]` | §3 专章；主区 6452–7067；阈值/少数意见 2701–2734（范围外）；复议 2742–2864（范围外）；选民/法定数 2899–2953（范围外） |
| `[OTHER]` | 身份推导 3933–3971；`isOffice/isAcademician` 5837–5838；自述 G6 7069–7223；主持代行/程序异议/结束辩论 7224–7358；`saveChatLine/wakeIfIdle` 7365–7384 |

---

## 3. 专章：共识验证（m-vote 布尔）完整逻辑

> 目标 2（会议/表决对照）的**主要事实来源**。代码主区 6452–7067；选民与阈值定义 2899–2953；少数意见与复议 2701–2864（范围外）；收束门禁 6801–6813、7345–7351。

### 3.1 参与者与分母（三条名单口径）

| 记号 | 定义 | 实现 |
|---|---|---|
| `E0` / `P` | **在册可表决者全名单**：`activeMembers()` 里 `kind ∈ {academician, researcher}`（列席/受邀/临时工**无表决权**且不入名单） | `voters()` 2901；`aggregateOpinion` 的 `votersAll` 6585 |
| `E` / `Peff` | **有效分母**：`E0` 去掉已声明 `unable`（"明确无法判断/不能应答"）者 | 6559–6562 |
| `silent` | `E` 中"未表态"者（**阻塞结题、不算反对、绝不折算成同意**） | 6571、6605–6610 |
| `m` | 法定布尔票数 = `max(1, min(max(1, floor(quorumCap \|\| 3)), Peff))`，`quorumCap` 默认 3 | `quorumMFrom` 2903–2906；`quorumCap` 1068 |
| `m_eff` | **复议只升不降**：`max(m, vs.threshold.m)` | `raisedThresholdOf` 2734 + `judgeVerdict` 6595–6597 |
| `rosterVersion` | `'r<成员总数>:<id:phase 排序逗号串>'`，供各视图证明"读到的是同一快照" | 2913–2916；`quorumView` 2934–2953 |

**否决/边界**：`Peff === 0` ⇒ **直接 `undecided`**（"no voters: the institute has no voting members yet"）——不会用 `m=1` 硬凑（6604）；`quorumView()` 在未启动时把 `m` 报成 **0** 且给 `next:{kind:'start'}`，而内部 `quorumM()` 仍 ≥1 以保持算术不变（2929–2952）。

### 3.2 票型全表（`castVerdict` 7014–7067 + `handleReply` 9493–9535）

| 输入 | 语义 | 记账 | 拒绝码 |
|---|---|---|---|
| 数值 `p` | `p==1` ⇒ **断言真**；`p==0` ⇒ **断言假**；`0<p<1` ⇒ **中间概率估计**（计入已投与平均，**不计入布尔选项**） | `votes[id]={prob:p,reason,at}` | 非有限或越界 ⇒ `V5_INVALID_VERDICT`（`verdict must be a number in [0,1], or the word abstain (弃权) / unable (无法判断)`） |
| `'abstain'` / `'弃权'` | **显式弃权**：计入"已投"，**不计选项**（既非赞成也非反对） | `votes[id]={abstain:true,reason,at}` | — |
| `'unable'` / `'无法判断'` | **退出本次分母**：`unable[id]={why,by,at}`；**仍列在名单中**（`unable[]` 可追溯） | 不改票、不算反对 | — |
| 临时工（`kind==='temp'`） | 无表决权；其意见**转达给表决者**（`say(to:'voters')`）而非静默丢弃 | 不写 `votes` | `V5_NOT_VOTER`（`临时工没有表决权；你的意见已转达给表决者`） |
| 没有在飞验证 | — | — | `V5_INVALID_ARGUMENT: no verification in progress` |
| `target` 与当前对象不一致 | — | — | `V5_INVALID_ARGUMENT: the object under verification is <t>` |
| 漏填 `verdict` 字段 | 不投票（`silent`） | — | 框架 `notice` 告知"本轮的票未被记录" |

- 解析层的宽松：`normVerdictNumber`（9348–9359）额外接受字符串 `'TRUE'→1`/`'FALSE'→0`，其余 `Number()` 并钳到 `[0,1]`（**引用数字 `"0.9"` 不再掉成 0.5**）。
- **L2 强制弃权（形式化缺陷联动）**：同一回执里对该对象声明了 `formal:{decision:'defect'}` ⇒ 若该成员是**真表决者**且声明了恰好 `0/1`，框架把这一票记为 **0.5 弃权**，并在 formal 记录的 `fidelity.voteAbstainedByFramework[]` 追加 `{at,by,declared}` + `abstainedCount`（**数组**，两人同轮不互相覆盖），群聊/成员通知明说"你对该对象的 verdict 已按弃权计入"；只影响声明者与当轮（9501–9532）。
- 每次投票都更新 `vs.lastVoteAt`（看门狗计时基准），并**尝试立即收束**：`allVoted = 每个 E0 成员都有 votes[id] 或 unable[id]` ⇒ `continueVerifyRound(next)`，否则只 `scheduleNext()`（7038–7042、7049–7053、7060–7063）。
- 回执含 **`pendingVoters`**（具名列出还没表态的人）——task-25 的真机修复：此前只有一个 `allVoted:false`，成员只能反复试探（7064–7066）。

### 3.3 计量 vs 裁定（R10：过程票数永不产出结论）

- `aggregateOpinion(vs)`（6557–6587）**只描述当时票数**，返回对象**永远带 `provisional: true`**，字段：`{m,P,Peff,bTrue,bFalse,abstain,estimates,mean,votedCount,answered,silent,unable,voters,votersAll,provisional}`。
  - `mean = all.length ? Σp/|all| : 0.5`（**无人投票时默认 0.5**，6581）。
  - `abstain` 与 `estimates` **同名不同义**（L4 术语纪律）：前者是显式弃权（不计选项），后者是 `0<p<1` 的中间估计（**计入平均**）。
- `judgeVerdict(vs, endedBy)`（6593–6625）是**唯一能产出 `true/false` 的路径**，且**必须**显式给出 `endedBy`：
  - `!endedBy` ⇒ `undecided`，reason `R10: 辩论尚未结束（过程票数不构成裁定）`（**fail-safe：忘记传就绝不隐式收束**，6598）。
  - 之后依次：`Peff===0` ⇒ undecided（6604）；`silent.length` ⇒ undecided 并**列出未表态名单**（"D3 参与门：未表态阻塞结题"，6605–6610）。
  - `quorumMode === 'all-unanimous'`（v4 兼容档）：`bTrue===E.length && bFalse===0` ⇒ true；`bFalse===E.length && bTrue===0` ⇒ false；否则 `undecided: not unanimous`（6611–6615）。
  - 默认 `'m-unanimous'`（`quorumMode` 默认值，1069）：
    1. `bTrue + bFalse < m` ⇒ `undecided`（"only N boolean vote(s); m=M required（显式弃权 A 计入已投但不计选项）"）（6616–6618）；
    2. `bTrue>0 && bFalse>0` ⇒ `undecided: conflicting assertions`（**任何反向断言都阻断定论**，少数派不可能被弃权票淹掉）（6619–6621）；
    3. `bTrue>=m && bFalse===0` ⇒ **`true`**（6622）；`bFalse>=m && bTrue===0` ⇒ **`false`**（6623）；
    4. 末行 `undecided: quorum not met`（6624）在数学上被前面分支覆盖（只单边时 `bTrue+bFalse>=m` 已由 1 挡住）⇒ 属**不可达的兜底**（可作为死分支记录）。
  - **`endedBy` 的三个合法来源**（R10 §7.2）：`'round-complete'`（每位有效表决者都已表态）、`'academician'`（院士显式结束，R10-2a）、`'bound:idle'`／`'bound:round-cap'`（**具名且可撤销**的有界触界）。
  - `boundOf(name,why)`（6548）产出 `{name,why,at,revocable:true}`；`R10_PROVISIONAL_NOTE = '（过程票数：尚未生效·仅供参考）'`（6549）。

### 3.4 一轮的生命周期 `continueVerifyRound`（6752–6837）

1. **有界兜底**：`now - lastVoteAt >= recoverStallMs()`（默认 240s）⇒ 具名触界 `bound:idle`：`closed:true`、`outcome:'undecided'`、`endedBy:'bound:idle'`、`bound`、`closedAt`、`mean` 落库；群聊公告明确"**具名且可撤销/续期**（任意成员或院士可重新提议验证）"并列出过程票数（真/假/弃权/平均/m/P）；随后 `armNextVerify()`+`scheduleNext()`（6754–6772）。
2. **轮次只由"全员已答"推进**：`need = voters()`；`missing` 非空 ⇒ 对每个 active 且非 busy 的缺票者 `wakeMember(..., verifyPrompt, 'verify')`；若一个都没唤醒成功 → `armHeartbeat()`；**直接 return（不推进轮次）**（6774–6790）。注释点名这条是承重的：`continueVerifyRound` 在每次调度 pass 都跑，没有它，无关成员的一轮会把辩论轮次烧完并"没人投票就静默结题"。
3. **同一时刻只允许一个收束**：`finalizeLock`（值 `'verify'`）挡住两个并发 `subagent/end` 同时观察"全员已答"并重复收束（重复 Verified 卡 + 重复辩论记录）；锁在**尾部调度之前**释放，链式验证不会被吞掉（6791–6797、6833–6836）。
4. `j = judgeVerdict(vs, 'round-complete')`：
   - `true|false` ⇒ **`require` 门禁**（§3.5）：`formalMode()==='require' && !formalGateOk(formalOf(target))` ⇒ `deferForFormal(vs,j,isTrue)`；否则 `closeVerify(vs, isTrue, j)`（6799–6813）。
   - 未定论且 `vs.round >= max(1, floor(verdictMaxRounds||3))` ⇒ `finalizeUndecided(..., {endedBy:'bound:round-cap', bound: boundOf('round-cap','已达最大辩论轮数 N')})`（6814–6815，`verdictMaxRounds` 默认 3）。
   - 否则**进入真正的辩论轮**：`history = {...vs.votes}`、`votes = {}`、`stage='debate'`、`round+1`、`lastVoteAt=now`，并以 `provisional:true` 落库（**不写 outcome**）；群聊公布每人 prob + `R10_PROVISIONAL_NOTE`；再 `askVoters(next)`（6816–6832）。注释点名"**不清空 `votes` 会让'全员已答'恒真、辩论轮空转（没人被重新征询）**"。
5. 尾：`finally finalizeLock=null` ⇒ `scheduleNext()`（6833–6836）。
- `askVoters(vs)`（6742–6751）：对**还没有票**的每个 voter 发 `verifyPrompt`（kind `'verify'`）；一个都没发出去 ⇒ `armHeartbeat()`。

### 3.5 进入 `Verified/` 的条件（收束三分支）

**共同前置（两道 S25-C 硬门，issue #13 #1）** —— 提议侧与开启侧**各查一遍**（防御纵深）：
1. **只有院士能开启辩论与选择辩论对象**：`maybeQueueVerify`（6681–6683）与 `beginVerify`（6709–6711）都对 `proposer` 做 `isAcademician` 检查，否则 `V5_INVALID_ARGUMENT`（"请由院士发起 propose_verify"）。
2. **只有"已被正式证明或证伪、且已定稿（locked）"的对象才有资格**：`formalProofReady(t)` = `inst().formalProofs[t]` 存在且 `locked===true` 且 `status ∈ {'proved','disproved'}`（`formalProofOf` 先判空再 `idSafe`，避免 `undefined` 抛 TypeError 让整个调度 pass 失败；真源是所级 `formalProofs`，`verdicts[t].formalProof` 仅前向兼容回退）（6660–6674）。登记入口 = `vibe_v5_end_verify {op:'formal_proof', status:'proved'|'disproved'}`（§1.19）。

**分支 A：`closeVerify(vs, isTrue, j)`（6896–6916）——唯一写 `Verified/` 的路径**
- `writeDebateDoc(vs, true, isTrue?1:0)` ⇒ `Shared/Debates/<target>.md`（含结论、提出者、类型、m、P、轮次、阶段、对象陈述、本轮票面、`## 上一轮（辩论前）意见`）。
- `writeVerifiedCard(vs, isTrue, j)` ⇒ `Verified/{问题|方法|命题}/<target>.md`（目录按 `vs.kind`），字段：`# 已验证｜<id>`、`- ID`、`- 类型`、`- 结论: 真|假`、`- 概率: 1|0`、`- 来源: N 名有表决权者一致判真（m=M）`、`- 表决者: <j.voters 逗号串>`、`- 显式弃权: A｜中间估计: E｜全组平均概率: mean.toFixed(2)`、`- 形式化: <formalStatusLine>`（仅 `formalOn()`；附证明路径）、`- 时间`、`## 陈述`、`## 辩论记录`（指向 Debates 文件）（6987–7012）。
- **改源卡**：`rewriteSource(target, proposer, {状态:'已验证·真'|'已验证·假', 概率:'1'|'0'})`（`rewriteCardField` 支持"一行一字段"与"分号串"两种卡片写法，6522–6536）。
- `verifiedRecently.set(target, now())` ⇒ 形成 `recoverStallMs` 的**"刚刚定论"去重窗口**（6901；消费点 6687–6690、6951–6952）。
- `putVerdict`（closed、outcome、mean=1|0、m/P/bTrue/bFalse/abstain/closedAt/voters）—— 收口处 `sealRecord` 自动盖 `minority[]/minorityCount/sealed/threshold{m,floor}/effectiveAt/reconsiderations[]`（1529、2721–2732）。
- `putDebate({target,at,file,outcome})`；群聊"经 N 名有表决权者一致判真（m=M），已写入 Verified/，来源卡已标注"；`markProgress`；`armNextVerify`；`scheduleNext`。
- **少数意见定义**（`minorityOf` 2701–2718）：与最终 outcome 不一致者（outcome=true ⇒ `p<1`；false ⇒ `p>0`）；无胜方时 = 与多数侧不一致者（`mean>=0.5 ? p<mean : p>mean`）；**弃权/无法判断/未表态都不算少数意见**（单列，R2/D3）。

**分支 B：`deferForFormal(vs, j, isTrue)`（6842–6872）——`require` 档门禁**
- 触发条件：`judgeVerdict` 已给出 `true|false`，但 `formalMode()==='require'` 且 `!formalGateOk(formalOf(target))`（即 `status` 不是 `passed`/`blocked`）。
- 记录：`closed:true, outcome:'undecided', reason:'formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 X）', mean:j.mean, formalDeferred:true, m/P/bTrue/bFalse/abstain, closedAt, voters:j.voters`；`putFormal`（record 函数：非 `'none'` 的原样保留；todo 函数：按 id 去重后 push `{id,at,why,verdict: isTrue?1:0}`）；写 `Formal/TODO.md`+`Formal/Index.md`；群聊（"本轮不定论，已记入 Formal/TODO.md"）；`markProgress`+`armNextVerify`+`scheduleNext`。**注意：不写 `Verified/`、不改源卡、不改变对象既有概率字段**（6842–6872、docs/formal-verification.md §8）。
- 门禁的**兜底属性**：`require` 档下验证提示词会**先**告知表决者"定论前需要 passed 或 blocked"，所以正常路径不会触发；且门禁"从不把 run 卡死"——记 `undecided`+待办让研究所能继续。

**分支 C：`finalizeUndecided(vs, j, opts)`（6873–6895）——未达门槛 / 触界 / 院士结束**
- `writeDebateDoc(vs,false,j)`（过程记录：平均概率、reason、m、布尔真/假/显式弃权/中间估计）；`rewriteSource(target, proposer, {状态:'未定论', 概率: mean.toFixed(2)})`（**留库附平均概率**，缺源卡则跳过而不是造垃圾文件）；`putVerdict`（closed、outcome `'undecided'`、reason、mean、m/P/bTrue/bFalse/abstain、closedAt、`endedBy`、`bound`、voters）；`putDebate(outcome:'undecided')`；群聊（若是触界则带 `【求真触界｜<name>】`）；`markProgress`+`armNextVerify`+`scheduleNext`。

**触发 `armNextVerify()` 的时机与互斥**（6917–6960）：
- **会议与验证永不并发**：`if (meeting) return`（提议留在队列里，会议结束后由 `schedulePass` 再到达）（6928）。
- `beginLock` 保证**只有一个 begin 在飞**（两个调用者都通过 `currentVerify()` 检查会重复启动同一对象）（6932–6934）。
- 循环里：队列空 ⇒ return；**再查一次** `meeting || currentVerify()`（`await putQueue` 期间可能开了会议）；`takeQueueHead()` **原子**取头（append 落在中间不会丢，删除后也不会被 append 复活）；命中"刚刚定论"窗口 ⇒ `continue`（丢弃该提议）；否则 `beginVerify(p)` + `askVoters(vs)` + return（6936–6956）。
- 队列的**原子性**：`appendToQueue(entry)`（按 `target` 去重 + append 都在 fold 内，6631–6641）；`takeQueueHead()`（取出与删除在同一个 fold 内，6645–6654）。这修的是"同一 tick 两个 `propose_verify` 只留下第二个、两个调用都报 ok"的丢提议竞态（6626–6630）。

**`beginVerify(proposal)`（6706–6741）**：两道门 ⇒ `resolveTargetStatement(target, proposer)`（`findSourceRel` 按 `owner→其余在册成员`×`Propos/Methods/Subproblems` 顺序找源卡，找不到再全目录扫"卡片自报 ID"`- ID:` 匹配；**返回 null 而不是猜路径**，避免造 0 字节野文件并漏写真卡，6473–6501）⇒ 陈述抽取 `## 陈述` 段，**上限 20000 字符且截断可见**（6512–6517）⇒ 造 `vs`：
```
{ target, kind: proposal.kind || guessTargetKind(target), proposer, reason, statement,
  sourceRel, stage:'initial', round:1, votes:{}, history:null, lastVoteAt:now(),
  closed:false, outcome:'', mean:0, m:quorumM(), P:voterCount(), createdAt:now() }
```
⇒ `putVerdict`；群聊"对 X（类型）发起验证；法定票数 m=…，有表决权者 P 人。**先独立初评（彼此不可见），未定论再公开辩论**"；`notifyActivity`（6716–6740）。`guessTargetKind` 由 id 前缀猜：`m_`/`m-` ⇒ method，`s_`/`s-` ⇒ subproblem，否则 proposition（6459–6464）。

### 3.6 复议（R9/U3/D5/D5a）——门槛只升不降

- **记录级入口** `vibe_v5_reconsider {target|target_id|ballot_id, why, evidence?}`（注册 11167；实现 2742–2864+）。
  - 时间键一律拒（2746–2749）；`why` 必填；`target` 必填。
  - **投票板分支**（`target` 以 `ballot:` 开头或给 `ballot_id`）：板必须 `phase==='closed'`（G2：只针对**已生效**结论）；**只有该板的参与者**可提（该板里没有你的票 ⇒ `V5_NOT_VOTER`）；同 `why` ⇒ 幂等 `deduped`；**每板只受理一次**；门槛 `bBefore = max(1, rules.minVotes || cap)`，`bAfter = max(bBefore, reconsiderFloor(), quorumCap)`；写入 `reconsiderations[]`、`supersededBy/supersededAt`、`threshold{m,floor}`、`reopenedAt`、`reopening:true`、**`priorResult` 留档**、`phase:'open'`、`closedAt:0`、`result:null`；**不记名板**（`rules.secret`）的复议**只给聚合面**（票数/门槛/是否成立），**逐人选择永不解密**（2754–2795）。
  - **判定对象分支**：对象必须存在且 `closed`（否则"尚未收束：复议只针对**已生效**的结论"）；资格**由记录派生而非角色**：参与者 = 有 `votes[id]` 或 `unable[id]`，否则 `V5_NOT_VOTER`；**有胜方（outcome true/false）时只有"当初胜方之一"可提**（`myP` 必须等于 1/0），**无胜方时任一参与者可提且不得以"没有胜方"拒收**（D5a 硬约束）；同 `(round,why)` 幂等；**每轮只受理一次**；`round >= verdictMaxRounds` ⇒ 拒（不得无限复算）；`after = max(before, reconsiderFloor, quorumCap)`（**只升不降**，U3）。写入：
    `reconsiderations[].{id:'rc-<target>-<round+1>',by,at,round,nextRound,why,evidence,eligibility:'winner'|'any-participant',thresholdBefore,thresholdAfter,raisedBy,onlyUp,secretSource}`、`previousRounds[]`（**旧票面/旧 unable/旧 minority/旧 outcome/旧 reason/旧 mean/旧 m/旧 endedBy 整块追加留档**）、`previousOutcome`、`supersededBy/supersededAt`、`threshold{m:after,floor}`、`round+1`、**`votes={}`、`unable={}`、`minority=[]`**、`sealed:false, closed:false, reopenedAt, lastVoteAt`，并 `delete` 掉 `outcome/reason/closedAt`（2796–2864+）。
  - **生效路径**：`judgeVerdict` 起始处 `raisedM = raisedThresholdOf(vs)`（读 `vs.threshold.m`），`raisedM > base.m` 时抬高 `base.m`（6595–6597）⇒ 复议后的门槛在下一轮判定里**真的生效**。
  - **不变量**：不产生新票权、不改分母、不改阶段、无定时器；旧结论仍可引用但带"已被复议"标记（2862–2863）。

### 3.7 这一套"不做什么"（实现层面的诚实边界）

- **投票不裁定真假**：结果只决定"是否写入 `Verified/`"，卡片明确写来源是"N 名有表决权者一致判真"（6996）；`verifyPrompt` 末尾写"本所宁可留下未定论，也不要一个骗人的结论"（4222–4223）。
- **框架不判忠实性**：`defect` 只是"表决者认定不忠实"的一档落库语义（降级+待办+不定论），不是框架判断（docs/formal-verification.md §11）。
- **过程票数不得驱动流程**：`aggregateOpinion` 永远 `provisional:true`；展示必须带"尚未生效·仅供参考"（6549、6830）。
- **`speechFrozen`（表决期禁止发言）** 属会议平台侧（2886–2896，范围外），本分片只登记其存在。

### 3.8 `[VOTE]` 相关的可调参数一览

| 参数 | 默认 | 上下界/语义 | file:line |
|---|---|---|---|
| `quorumCap` | 3 | `>=1`（`normalizeParams` 强制 9858）；`m = min(cap, Peff)` 且 ≥1 | 1068、2903–2906 |
| `quorumMode` | `'m-unanimous'` | 白名单 `m-unanimous`/`all-unanimous`，非法回落前者 | 1069、9794 |
| `verdictMaxRounds` | 3 | `Math.max(1, floor(...))` | 1073、6814、6824 |
| `reconsiderFloor` | 0 | `>=0`；生效门槛 `= max(before, floor, quorumCap)` | 1070、2719、2830–2832 |
| `activityTimeoutMs` | 120000 | 经 `posMs`（非正回落默认）；`recoverStallMs = 2×` ⇒ 兼作"刚刚定论"去重窗口 | 1082、4249 |
| `formalVerify` | `'off'` | `off|encourage|require`，非法回落 `off`；`require` = 定论门禁 | 1100、4324、6809 |
| `memberMayRejectAssign` | true | 允许对分派提异议（理由广播） | 1066、4018–4019 |

---

## 4. 专章：任务板 CAS DAG 与 成员成果库 / 三索引 的数据形状

### 4.1 任务（`inst().tasks[]`，fold `EV.task` 714–732 upsert by id）

```jsonc
{
  "id": "t-3",                 // fold 内 alloc.next('task') 铸号；ID_PREFIX.task='t-'
  "revision": 4,               // CAS 令牌；每次成功变更 +1（唯一例外见下）
  "subject": "…",              // ≤200
  "description": "…",          // ≤16384
  "status": "pending",         // pending | in_progress | completed | deleted
  "ownerId": "r-2",            // '' = 无主
  "blockedBy": ["t-1"],        // DAG 依赖（全 completed 才 ready）
  "writeScopes": ["Members/r-1/Propos"],  // 归一化（拒绝对/盘符/`.`/`..` 段）
  "priority": 0,               // 非有限数 ⇒ 0；排序主键（降序）
  "createdBy": "office" | "r-1",
  "assignedBy": "academician" | "office" | "r-1",   // 仅 reassign（经 meta）可写
  "why": "…",                  // assign 必填
  "acceptance": "…",           // assign 必填
  "origin": "meeting:mt-5",    // 行动项来源标记（/^meeting:/ 用于 report/overview）
  "due_in": "next-meeting",    // 只能用相对表达；任何 …At/…Ms 键被拒
  "state": "open",             // open | done | handover（显式状态机，绝不自动关闭）
  "resolution_id": "res-2",    // 可选：来源决议（S20；未被取代才可派活）
  "releaseReason": "…",        // 仅 releaseTasksOf（成员除名回收）写
  "createdAt": 0, "updatedAt": 0
}
```

- **阶段机（两张正交的"状态"字段）**：
  - `status`：`pending --claim--> in_progress --complete--> completed`；`in_progress --release--> pending`；`completed --reopen--> pending`；`delete`（有依赖者 ⇒ `V5_TASK_HAS_DEPENDENTS`）⇒ `deleted`（不可再操作，`V5_TASK_DELETED`）。
  - `state`（S15/K4 行动项）：`open --complete--> done`；`--handover--> handover`（无接手人则同时回 `pending`+`ownerId:''`；给接手人则回 `open`+`in_progress`）；`--reopen--> open`。**完成才置 `done`，绝不自动关闭、绝不静默丢弃（G3）**。
  - `reassign`（仅 lead）可在 `pending`/`in_progress` 上换人；`owner` 必须 active 且 `taskReady`。
- **CAS 语义**：`expected_revision` 必填；不等 ⇒ `V5_TASK_STALE_REVISION`（**不写入、不返回新对象**）；相等 ⇒ 写 `revision+1`。**唯一"不升 revision"的写**：`releaseTasksOf`（除名回收）也显式 `revision: t.revision + 1`，所以其实**所有变更都升号**；`taskPrioritize` 同样逐项 `revision+1`（6386）。
- **权限**：`lead = meta.authorized===true || canDo(id,'board').ok || canDo(id,'assign').ok`；`claim` 只需"无主或本人 + pending + ready"；`release/edit/set_dependencies/complete/reopen/delete` 需 owner 或 lead；`handover/reassign` 需 lead。拒绝码：`V5_TASK_UNAUTHORIZED`、`V5_TASK_ALREADY_CLAIMED`、`V5_TASK_INVALID_TRANSITION`、`V5_TASK_BLOCKED`、`V5_TASK_NOT_FOUND`、`V5_TASK_DELETED`、`V5_TASK_DEPENDENCY_CYCLE`、`V5_TASK_HAS_DEPENDENTS`、`V5_INVALID_WRITE_SCOPE`、`V5_INVALID_ARGUMENT`。
- **写域冲突只是"建议"**：`writeScopeWarnings` 用**前缀包含**判定重叠（`scopesOverlap` 471–476）⇒ `Members/r-1` 与 `Members/r-1/Propos` 算重叠；告警进 `taskView` 并写进 `Shared/TaskBoard.md`，**不阻断**任何操作。
- **分派幂等**：同 `origin` + 同 `subject` + 同 owner + 已 `in_progress` ⇒ 直接 `{ok:true,deduped:true}`（不重复建、不重复派）（6330–6334）。
- **人读镜像 `Shared/TaskBoard.md`**（6405–6418）：`- [status] id｜subject｜owner=…｜rev=…｜优先级=…｜可认领`，分派者/理由/验收、依赖、写域告警各占缩进行。**只写不读**，权威在状态文件。

### 4.2 成员成果库（文件面，状态文件里**不存正文**）

```
Members/<成员id>/
├─ Progress/progress.md          # narrative 轨（逐字追加；首次出现分轨索引行）
├─ Progress/{routes,obstacles,rejected,state}.md   # S25-B 分轨（route/obstacle/rejected/state）
├─ Propos/<id>.md                # 命题卡
├─ Methods/<id>.md               # 方法卡
├─ Subproblems/<id>.md           # 子问题卡
└─ SelfReport.json               # G6 自述（node:fs 原子写；不在 fold 里）
```

**卡片头的固定字段（`recordCard` 5911–5925 写盘，`readLibrary` 5949–5960 读回）**：

```
# <命题|方法|子问题>｜<标题>
- 标题: …            - ID: <id>          - 类型: …
- 状态: 未定论|经验|求解中（或 已验证·真/真假、未定论）
- 概率: <clamp01(p).toFixed(2)>          - 价值程度: <clamp01(value).toFixed(2)>
- 动机用途计划: <motive>                 - 记录者: <成员id>
- 记录时间: <ISO>                        - 依赖: []
- 内容指纹: <sha256(kind\n陈述原文\n---\n证明正文)>
## 陈述 / ## 证明尝试 / ## 证伪尝试     （或方法/子问题各自的段落）
```

- **id 约定**：`p-*` / `m-*` / `s-*`（缺省 `prefix + '-' + shortId()`）；`idSafe` 把 `\ / : * ? " < > |` 与控制字符换成 `-`、折叠连续 `-`、去掉首尾 `.`/`-`（11518–11521）⇒ id 变成文件名也**不可能穿越目录**。
- **头部列表（S21 指针面）**：`readLibrary({list:true})` 每张卡只回 `{id, kind, title, fingerprint, status, owner, updatedAt}`，**绝不含正文**；`updatedAt` = 文件 mtime，缺失回退卡片"记录时间"，`0` 表示未知（**未知就说未知，不猜**）。
- **正文只在 `{id:'…'}` 展开时回**；**查不到 ⇒ 具名拒绝**（`ok:false` + 指名 id + `next.kind='expand-by-id'`）。
- **截断一律计数**：`progress.md` 尾 6000（无计数）；四条分轨各尾 2000 且带 `droppedChars`；卡片正文 slice(0,4000)（无 `droppedChars` 字段但固定 4000 上限）。
- **Progress 分轨**：`PROGRESS_TRACKS = {route:'routes', obstacle:'obstacles', rejected:'rejected', state:'state'}`；`track` 非法 ⇒ `V5_INVALID_ARGUMENT`（列出可用值）；写入格式 `### <时间>｜<成员id>\n<正文>`。

### 4.3 "三索引"的两层含义（都已核实）

**(a) 框架维护的形式化三索引**（`rebuildLeanLibIndexes` 5524–5571 + `writeFormalIndex`/`writeFormalTodo`）：

| 文件 | 必需列 | 数据来源 | file:line |
|---|---|---|---|
| `<所根>/Formal/Index.md` | `对象\|状态\|形式化文件\|归档证明\|最近运行\|难度判断/阻塞原因` | `inst().formal` 记录；有 TODO 时追加"形式化待办"节 | 5494–5513 |
| `<vibe根>/Formal/Lib/Index.md` | `名称\|文件\|类别\|摘要\|依赖` | 列目录扫 `Formal/Lib/*.lean`：第一条非注释非 import 代码行（截 110）+ 所有 `import` 行 | 5556–5562 |
| `<vibe根>/Formal/Proved/Index.md` | `名称\|文件\|类别\|陈述\|依赖` | 同上，扫 `Formal/Proved/*.lean` | 5563–5567 |
| 附带：`<所根>/Formal/TODO.md` | `- <对象id>\|<why>\|<时间>` | `inst().todo` | 5514–5523 |

`rebuildLeanLibIndexes()` 额外返回**指针面 cards**：`{name, file, kind, summary, sha256}`，`sha256 = sha256Hex(leanHashText(文件原文))` —— **与 `lean_read` 返回、`lean_archive` 去重用的是同一个内容身份**；Lean 代码正文**永不**进这个面（S21/D1/D3）。全部索引都是**人/代理可读摘要，不是权威状态**（权威在状态文件的 `formal`）。

**(b) 成员成果库的三类卡片目录**：`Propos` / `Methods` / `Subproblems`（kind = `proposition` / `method` / `subproblem`）。这是"成果库"的物理三索引——`readLibrary` 的 `dirs` 数组逐字写死 `[['proposition','Propos'],['method','Methods'],['subproblem','Subproblems']]`（5948），三处读路径（list 模式、按 id 展开、全量枚举）共用它。

### 4.4 反馈库的数据形状（与成果库并列的一套"文件 + 耐久数组"）

```jsonc
// inst().feedback[]（耐久；fold 白名单 625–630）
{ "id":"fb-3", "at":0, "by":"r-1", "category":"process", "route":"interpersonal",
  "status":"open",              // open | adjusted | closed | dropped（未闭环 = open|adjusted）
  "context":"", "phenomenon":"", "impact":"", "action":"",
  "assessment":"",              // route=interpersonal 必填
  "outcome":"",                 // route=interpersonal 且 status=closed 必填
  "note":"", "updatedAt":"", "updatedBy":"" }
// 人读镜像：Shared/Feedback/<category>.md（每类一份） + Shared/Feedback/index.json = {counts, entries}
```

---

## 5. 专章：数学面（引擎探测 / 调用契约 / 结果形状 / 失败语义 / 5027 接缝 / 作业持久化现状）

> 目标 5 的**直接依据**。代码：`math-computation.js`（1481 行，全文读完）+ `math-engines.js`（197 行，全文读完）+ `vibe-math-v5r.js:5027–5222`（接缝）+ `10986–11024`（注册）。契约文档：`docs/math-computation.md`。

### 5.1 能力清单：引擎描述符表（`math-engines.js`）

- `MATH_ENGINE_ORDER = ['python','r','octave','julia','matlab','maple','wolfram','cli']`（12）。
- **P1 注册表 `MATH_ENGINES`**（19–171），每个引擎的字段：
  `{name, phase:'P1', candidates[], versionArgv[], versionRe, scriptArgv[], evalArgv[]|null, ext, probeCode, packageProbe{argv,parse}, license:'free'|'commercial'|'user', argErrorHints[], install{manager,userArgv,systemArgv?,uninstallArgv,managers?,systemUnsupportedReason?}|null, vendor?, verify?, verifyReason?, licenseProbe?, policy?, userInstall{windows,macos,linux}}`。
  | 引擎 | 候选可执行名 | 脚本/表达式模板要点 | 包探测 | 许可 | 安装 |
  |---|---|---|---|---|---|
  | `python` | `python3`→`python`→`py` | `['<script>']` / `-c <expr>`；`.py` | `-c <probeCode> <pkgs...>`（**每包一个 argv**，`importlib.util.find_spec`，每行 `name ok\|missing`） | free | pip/**conda/mamba/uv 分派** + `--user` |
  | `r` | `Rscript`→`R` | `<script>` / `-e <expr>`；`.R` | `-e <probeCode>`（`__PKGS__` 逗号串插进代码） | free | R 用户库 `R_LIBS_USER`；**无 system** |
  | `octave` | `octave`→`octave-cli` | `--no-gui --quiet <script>` / `--eval`；`.m` | `--eval <probeCode>`（`pkg('list')`） | free | `pkg install -forge`；**无 system** |
  | `julia` | `julia` | `<script>` / `-e`；`.jl` | `-e <probeCode>`（`Base.find_package`） | free | `Pkg.add`；**无 system** |
  | `matlab` | `matlab` | `-batch "run('<script>')"` / `-batch <expr>`；`.m` | `-batch <probeCode>`（`license('test',…)`） | **commercial** | `install:null` + 厂商 URL |
  | `maple` | `maple` | `-q <script>` / `-q -c <expr>`；`.mpl` | `-q -c <probeCode>` | **commercial** | `null` + 厂商 URL；**`verify:true`**（CLI 拼写随版本变） |
  | `wolfram` | `wolframscript`→`WolframKernel`→`math` | `-file <script>` / `-code <expr>`；`.wl` | `-code <probeCode>` | **commercial** | `null` + 厂商 URL |
  | `cli` | `[]` + `resolveFrom:'cli.command'` | 由调用方给 argv；`.txt` | —— | `'user'` | `null`；`policy:{requiresMathMode:'typed+shell', requiresEngineInList:true}` |
- **P2 表 `MATH_P2_ENGINES = {sage}`**（174–182）：**P1 不注册 sage**（探测表里只有 P1 会被 `mathEngineCandidates` 用于发现，但 `isKnownMathEngine` 认它）。
- 三个导出函数：`mathEngineCandidates(name)`（`cli` 返回 `null`）、`mathEngineArgErrorHints(name)`、`isKnownMathEngine(name)`（184–197）。
- **`ARG_ERROR_HINTS`**（17）：`unknown option`/`invalid option`/`unrecognized option`/`unrecognized argument`/`usage:`/`Usage:`/`illegal option` —— 引擎以这些字样非零退出 ⇒ 归为 `MATH_ENGINE_BAD_ARGV`（而不是裸 `MATH_NONZERO_EXIT`），并指向 `mathEngineOverride`。
- **占位符纪律**：`<script> <expr> <pkgs> <probeCode> <exe> <pkg>` **每个只替换进一个 argv 元素**；替换是**字符串级**（`String(a).split('<script>').join(abs)`），所以 matlab 的 `run('<script>')` 这类**内嵌**写法也能展开（math-computation.js:783–793）；`<pkgs...>` 展开成**多个 argv 项**（python 探针读 `sys.argv[1:]`），`<pkgs>` 是逗号串（R/Julia/Octave 插进代码）（693–707）。
- **shell 元字符禁令**：探针 argv **不得含 `|`/`%`**（真实宿主会以"空 spawn"拒绝），所以探测代码都改成"每行 `name ok`/`name missing`"，解析器两种形态都吃（math-computation.js:736–755；docs/math-computation.md §5.4）。

### 5.2 引擎探测（发现顺序 + 版本 + 许可）

- **发现顺序（PATH 永远优先）** `resolveCandidate(H,d)`（490–509）：
  1. 宿主 `resolveExecutable(候选名)`（PATH）；
  2. **DSH 自带运行时** `dshRuntimeCandidates`（515–549）：`<root>/dsh-runtimes/<tree>/dependencies/<engine>/<候选名>{,.exe,.cmd}`，树名**通配**、只接受描述符自己的候选名；`<root>` 来自宿主 `runtimeRoots()`（v5r 给的是 `DSH_HOME` 或 `~/.dsh`，**显式设置即隔离发现**）；
  3. **各 OS 已知安装目录** `knownInstallCandidates`（451–488）+ `mathInstallRoots(engine,env,win)`（428–449）：Windows `%ProgramFiles%`/`%LOCALAPPDATA%\Programs`/…、Unix `/usr/local`/`/opt/...`、`~/.juliaup/bin`；**存在性一律靠列目录证明**；宿主可选 `installRoots(engine)` **优先于**内置表（`[]` 视为未提供，回退内置表 —— "JS 空数组是 truthy"的坑，464–466）。支持扁平 / `/bin` / 版本化 `<root>/<ver>` / `<root>/<ver>/bin` / 嵌套 `…/mingw64/bin` 五种布局（477–484）。
- **版本探测** `probeVersion`（566–583）：`argv=[exe,...versionArgv]`，`cwd = probeCwd(H)`（**优先宿主 `probeCwd`，否则 OS 临时目录，最后项目根** —— 全新会话里项目根还不存在，宿主对"cwd 不存在"的 spawn 会返回 `spawned:true, exit:null` 且重试无用，551–564）；超时 20s；从 stdout+stderr 里匹配 `versionRe`；`ok = exit===0 && 匹配成功`；诊断 `{argv[:3], exit, timedOut, ms, spawned, stderrTail[:300]}`。
- **带重试的版本探测** `probeVersionWithRetry`（605–629）：最多 3 次（20s / 45s / 45s + 退避 250/650ms）；**只在看起来像冷启动/空返回**（`timedOut`、`exit===null`、`spawned===false`）时重试，确定性失败（非零退出/无法解析）不重试；诊断经 `jsonSafeDiag`（593–603）投影为**纯字段**（防自引用导致 `JSON.stringify` 抛"circular structure"——那会让调用方什么都看不到）；`attempts`/`retried`/`retryDiag` 一并带上。
- **探测缓存** `probeMathEngines(host, opts)`（395–418）：`PROBE_CACHE = new WeakMap()`，key 是 adapt 后的 host；`opts.refresh` 强制刷新；`params.mathEngines` 之外的引擎不探测；`cli` **不自动探测**（需要调用方给命令）；商业引擎版本探测失败 ⇒ 直接跳过（由 `run` 报 `LICENSE_REQUIRED`）；返回 `{ok:true, engines:[{name,version,path,foundVia,license,…verifyFields}], available}`。
- **许可检查** `checkLicence`（631–639）：非商业 ⇒ `{ok:true}`；商业无 `licenseProbe` ⇒ `{ok:false}`；matlab `okWhen:'trim-1'`（stdout 必须恰为 `1`）、wolfram `'not-unlicensed'`（stdout 不含 `Unlicensed`）、maple `'exit-0'`。
- **`resolveEngine(H, requested, params, args)`（641–690）**：`'auto'` 按 `params.mathEngines` 顺序逐个试；`applyOverride`（813–825）**必须同时作用于版本探测与许可探测**（不只是 script/eval argv —— AUDIT-B HIGH）；不在 `mathEngines` 白名单 ⇒ `MATH_REFUSED` + `next.reason='engine-not-allowed'`；`cli` 分支：策略检查（`mathMode` 必须 `typed+shell`、`cli` 必须在 `mathEngines`）、`cli.command` 必须可解析（否则 `MATH_ENGINE_NOT_FOUND` + 用户安装指引）、**按可执行文件 basename 推断族**（`engineFamilyForExe` 800–807）以复用该族的版本探测与包预检；找不到任何引擎 ⇒ `MATH_ENGINE_NOT_FOUND`，消息列出试过的名字，`next` = 逐 OS 安装指引（**按"请求的那个引擎"给指引**，299–301 的修复）。
- **`opProbe`（927–987）**：`refresh` 走 `packages:['refresh']`；**"probe 指定了某个引擎就必须描述那个引擎"**（不再回显 python，931–938）；包预检走 `familyProbeDet`（cli ⇒ 用家族的描述符；族不可识别 ⇒ 跳过预检并给 `precheckSkipped`）；返回 `{ok,op:'probe',engine,engineInfo,engines,available,packages,configured,absent[],message}`，`absent[]` 每项带 `why`（`not-found-on-this-machine` / `needs-a-caller-supplied-command`）。

### 5.3 调用契约（工具面）

- **工具名**：`math_computation`（`MATH_TOOL_NAME`，13）——**刻意无 `vibe_` 前缀**，四套预设同一原语。
- **参数（15 个，`MATH_TOOL_SCHEMA` 132–160 + `ALLOWED_ARGS` 213）**：`op`（必填：`probe|run|receipt|install`）、`engine`、`mode`（`code|file|expr`）、`code`、`file`、`expr`、`packages[]`、`timeoutMs`、`captureFiles[]`、`record`、`cli{command,argv?,stdin?}`、`scope`（`user|system`）、`dryRun`、`confirm`、`mathEngineOverride{<engine>:{versionArgv?,scriptArgv?,evalArgv?,packageProbe?}}`；`additionalProperties:false` ⇒ 未知键 `MATH_INVALID_ARGUMENT`。
- **`validateMathArgs`（232–294）**：闭合校验 + 交叉校验 —— `timeoutMs` 必须 `>=1000`；`packages` 每项过 `parsePackageSpec`（拒绝空格/`;`/`|`/`&`/`$`/反引号/`@`/括号等 ⇒ `unsupported-version-syntax`）；`cli` 只允许 `command/argv/stdin` 且 `command` 必填；`op='run'`：`mode` 必填、`engine='cli'` 的三条策略（`mathMode`、在列表、必须有 `cli{}`、**不支持 `mode='expr'`**）、`mode='file'` 的路径必须项目内、`mode='code'`/`'expr'` 必须有对应字段；`op='receipt'` 必须给 `file`；`op='install'` 必须有非空 `packages`。
- **`op='run'`（1000–1226）**：解析引擎（含 override）⇒ 包按 **base name** 存在性预检（`probePackages` 709–757，最多 3 次重试；**预检跑不起来不判缺包、不阻塞**，给 `PACKAGE_PRECHECK_UNKNOWN`）⇒ 缺包 ⇒ `MATH_MISSING_PACKAGES`（**不产生回执目录**，带 `missing/next(agent-install)/packages/versionPolicy/constraintsNotEnforced`）⇒ 组装 argv（`assembleArgv` 760–794；`cli` 会**自动把归档脚本绝对路径追加到 argv 末尾**，但调用方 argv 自带 `-c/-m/-e/--eval/--command` 时**不追加**并在回执里给 `scriptSkipped` 理由）⇒ **在 `withArchiveLock(baseDir)` 内**分配 attempt、写脚本、run、重新哈希源文件、写 stdout/stderr、captureFiles 副本、算 warnings、写 `receipt.json`+`receipt.md`、写群聊日志。
- **结果形状（成功 `shell`，1161–1184）**：`{ok:true, op:'run', engine:'<name>'|'cli:<cmd>', mode, runId, attempt, versionPolicy, constraintsNotEnforced[], engineInfo{name,path,version,source,foundVia}, argv[], scriptPath, scriptHash, scriptAbs, cwd, attemptDir, baseRunDir, scriptChanged, scriptChangedDuringRun, sourceFile, fileIsArchivedScript, partialStdout(尾2000), partialStderr(尾2000), previousReceipt{runId,attempt,scriptHash}, cliScriptAppended, packages{found}, exit, timedOut, ms, stdout(≤64KB), stderr(≤64KB), truncated{stdout,stderr}, artifacts[{path,sha256,bytes}], receipt{dir,json,md,sha256}, warnings[]}`。
- **`receipt.json` 字段**（1119–1154）：`schema:'vibe-math/math-computation-receipt@1'`、`runId/preset/project/op/mode/attempt/attemptDir/baseRunDir`、`engine{name,path,version,source,foundVia}`、`script{path,sha256,bytes}`+`scriptPath`+`scriptHash`+`scriptAbs`+`cwd`、`sourceFile`、`fileIsArchivedScript`、`partialStdout/partialStderr`、`sourceHashBefore/After`、`scriptChanged/scriptChangedDuringRun`、`previousReceipt`、`argv`、`packages{requested,found}`、`versionPolicy`、`constraintsNotEnforced`、`exit/timedOut/ms`、`truncated`、`artifacts`、`captured[]`、`network:'not-enforced-by-plugin'`、`warnings[]`、`determinism{inputSha256,packagesSorted:true,noWallClockInId:true}`、可选 `cli{command,argv,stdinUsed,scriptAppended,scriptSkipped}`。
- **`op='receipt'`（1232–1287）**：`file` 是 `Computation/<id>[/attempts/<n>]` 或 `<id>`；目录/receipt 不存在 ⇒ `MATH_REFUSED` + `next.reason='archive-missing'`；JSON 不可解析 ⇒ `MATH_INVALID_ARGUMENT` + `'receipt-unparsable'`；**重新哈希归档脚本**并与记录比对 ⇒ `scriptChanged`（**归档脚本丢失也算 changed**，fail-closed：`currentHash:null`）；只补写**缺失**的 `receipt.md`，**从不改写既有数据**。
- **`op='install'`（1294–1369）**：商业引擎/无 install 模板 ⇒ `MATH_REFUSED` + 厂商指引；`scope` 只对当次生效；先用 `mathEngineCandidates` 解析真实解释器路径；python 走 `detectPythonManager`（1392–1410：路径含 `/envs/|/conda|/miniconda|/anaconda|/mambaforge|/miniforge` 且 conda/mamba 可解析 ⇒ conda/mamba；`uv` 与解释器**同目录** ⇒ uv；否则 pip 且 `assumed:true`）；无 system 模板 ⇒ `MATH_REFUSED` + `systemUnsupportedReason`；**两步确认**：无 `confirm` ⇒ 返回 `plan`+`planToken = sha256({engine,packages,scope,commands}+'|planVersion=1').slice(0,32)`；`confirm !== planToken` ⇒ `MATH_REFUSED` + `'plan-token-mismatch'`；执行后写审计 `Computation/installs/<planToken>.json`（含 `rollback.commands` 卸载模板，`supported:'partial'`、**不做自动回滚**）；失败**不新增失败码**而是 `op:'install'` + `installedSoFar` + `timedOut`。

### 5.4 结果形状：回执目录（归档是**追加式**的）

```
<研究所根>/Computation/<runId>/
├─ script.<ext>            # 唯一权威源码（先落盘再执行）；cli ⇒ script.txt
├─ stdout.txt / stderr.txt # 完整输出（返回体只给 ≤64KB 截断版）
├─ receipt.json/receipt.md # 机器可读 + 人读
├─ captured/<项目内相对路径>  # captureFiles 的副本
└─ attempts/<n>/…          # n≥2：同一 runId 的后续 attempt（首次绝不覆盖）
```

- `runId = <designator>-<projectSlug>-<sha256(engine|mode|key|pkgs.sorted)[0:12]>`，`designator='vibe-math-v5r'`，`projectSlug = slug(instRoot())`。
  **key 的规则（P2a N1）**：`mode==='file'` ⇒ `'file:'+fileRel`（**按源路径**）；`mode==='code'/'expr'` ⇒ `canonical(scriptText)`（按内容）。⇒ 编辑**同一个源文件**重跑落在**同一个 runId 的 attempt≥2**（带 `scriptChanged:true` + `previousReceipt`），指向**归档副本本身**则是**新 runId、attempt 1、无历史**（`fileIsArchivedScript:true` + `ARCHIVED_SCRIPT_RERUN` 警告说清"这不是同一归档的新 attempt"）（828–835、1037–1050、1110–1111）。
- `canonical(s)`：CRLF→LF、去行尾空白、去尾部空行、补一个 `\n`（165）；`noWallClockInId:true`（回执里显式声明 id 不含墙钟）。
- **保留上限（只告警，永不自动删除）**：`MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN=20`（每 id）、`MATH_ARCHIVE_MAX_RUNS=200`（每项目，仅当宿主提供可选 `listDir` 时检查）；超限 ⇒ warning `ARCHIVE_RETENTION_EXCEEDED`（63–65、881–894）。
- **并发**：同一 runId 的"分配 + 占用（写 receipt.json）"由 `withArchiveLock(key)` 的**进程内 promise 链**串行化（847–855）⇒ 两个并发同 id 分别拿到 attempt 1/2；**跨进程并发仍需宿主独占创建原语（当前 fs 接口没暴露）—— 已知限制**（注释 840–846）。

### 5.5 失败语义（11 个冻结失败码 + 7 个 `next.kind` + 13 个 `next.reason`）

- **`MATH_FAILURE_CODES`（43–55，冻结）**：`MATH_NOT_AVAILABLE`（`mathComputation:'off'`）、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、`MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、`MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS`。
- **`fail(code,engine,message,extra)`（311–329）** 只搬运白名单字段：`next/argv/receipt/missing/engines/available/configured/absent/packages/probe(经 jsonSafeDiag)/versionPolicy/constraintsNotEnforced`。
- **`next.kind` 7 种**：`user-install`、`agent-install`、`vendor`、`enable`、`engine-override`、`reason`、`note`。
- **"没有 subprocess 服务"与"没有引擎"是两件事**：宿主可选 `hasSubprocess()===false` ⇒ 一律 `MATH_NO_SUBPROCESS`（1428–1432）；否则解析不到 ⇒ `ENGINE_NOT_FOUND`+安装指引，解析到但 `spawn` 返回 `null` ⇒ `NO_SUBPROCESS`（math-computation.js:1093；v5r 侧 `mathSpawn` 返回 `null` 同理 5109–5111）。
- **超时**：`MATH_TIMEOUT` 携带与 `NONZERO_EXIT` **同样**的证据字段（`argv`/`receipt`/`exit:null`/`stdout`/`stderr`）+ `timedOut:true`；部分输出**进持久回执**（`partialStdout/partialStderr` 各取最后 2000 字符）（1185–1193、1131–1134）。
- **引擎用法错**：命中 `argErrorHints` ⇒ `MATH_ENGINE_BAD_ARGV` + 回显 argv + `next.kind='engine-override'`（指 `mathEngineOverride`）（1194–1208）。
- **JSON 可序列化是横切不变量**：所有响应必须能 `JSON.stringify`（round-7 回归：自引用诊断曾让调用方什么都看不到）（593–603）。

### 5.6 `vibe-math-v5r.js:5027` 接缝（宿主侧）

已在 §1.16 逐条列出。这里给**接缝能力的因果表**（哪些模块行为由哪个宿主字段决定）：

| 模块需要 | v5r 提供的字段 | 缺省/失败行为 |
|---|---|---|
| 项目根（回执落点、cwd） | `projectRoot:()=>instRoot()` | 必需（`adaptHost` 缺者 throw，366–367） |
| 参数（六项） | `params:()=>Object.assign({},params)` | 必需 |
| 文件读写/存在性/列目录 | `writeText/readText/exists/listDir` | `listDir` 可选 ⇒ 缺少时**只跳过项目级保留上限**，per-run 上限仍生效 |
| 可执行解析 | `resolveExecutable` | 必需（缺失 ⇒ 模块 throw，被 `registerMathComputation` 的 try/catch 变 `MATH_INVALID_ARGUMENT`） |
| 子进程 | `spawn` | 必需；返回 `null` ⇒ 模块视为 `MATH_NO_SUBPROCESS` |
| 是否根本无子进程 | `hasSubprocess` | 可选；提供 `false` ⇒ 探测前就报 `MATH_NO_SUBPROCESS` |
| DSH 自带运行时发现 | `runtimeRoots` + `listDirAbs` | 可选；缺失 ⇒ `[]`，行为回落到"已知安装目录"阶段 |
| 每 OS 已知安装根 | `installRoots`（**可选**） | 未提供 ⇒ 模块用**自己进程**的 `ProgramFiles/LOCALAPPDATA`（v5r **不提供**该字段 ⇒ 本机环境参与发现） |
| 探测 cwd | `probeCwd`（**v5r 不提供**） | 回退 OS 临时目录，再回退项目根 |
| 日志 | `log:'mathLog'` | v5r 把每次 run 写进群聊 `【计算】…` |

**关键接缝事实**：`mathSpawn` 的 stdio 上限**刻意放大**到 `max(MATH_CAPS.stdout, stdoutCap || MATH_CAPS.file)`（`MATH_CAPS = {stdout:64KB, stderr:64KB, file:4MB}`），因为**模块要把完整输出落盘、只有返回壳才截到 64KB**（5081–5083）；路径在接缝**再守一遍**（`mathRelPath`，防模块守卫回归）。

### 5.7 特别标注：**作业持久化 / 断点续算**的现状（目标 5 的核心结论）

**结论：`math_computation` 完全没有作业持久化，也没有断点续算；有的只是"追加式归档 + 失败关闭"的**证据**持久化。**逐条举证：

| 维度 | `math_computation`（数学计算） | `Lean`（形式化，同仓对照） |
|---|---|---|
| 是否有作业队列 | **无**。`op='run'` 在**一次工具调用内同步** await 子进程（1000–1226），调用方被阻塞到进程结束或超时 | **有**。`leanJobs` 内存队列 + `Formal/Jobs/<jobId>.json` 镜像 + `leanJobsMaxParallel` 并发（4587–5025） |
| 是否有持久作业记录 | **无**。只有**回执**（终态产物）：`Computation/<runId>/attempts/<n>/receipt.json` | **有**。每次状态变化写镜像，四态 `settled/failed/timeout/interrupted` |
| 崩溃/重启后能否续算 | **不能**。没有"未完成作业"的概念：进程死了，这次 run 的 `receipt.json` 根本没写出来（脚本/stdout 可能已写），`op='receipt'` 读不到就报 `archive-missing` | **能**（受限于镜像）。`recoverLeanJobs()`：`queued` 重入队；`running/interrupted` + 哈希匹配 ⇒ 重入队（attempts+1）；`settled+hash 匹配` ⇒ 补写归档与 `passed`；不匹配 ⇒ `failed` + "不自动重驱"（4915–4966） |
| 中间态持久化（断点） | **无**。没有任何 checkpoint/partial-state 写盘；长计算中途被杀 ⇒ 无任何进度记录 | **部分有**：作业 `state/attempts/startedAt/settledAt/exitCode/run.stderrTail` 都是耐久断点信息；`partialStdout`/`partialStderr` 只在 math 侧有 |
| 超时后的证据 | **有**：`partialStdout/partialStderr`（各尾 2000）+ stdout/stderr 全文落盘 + `timedOut:true`（1131–1134、1185–1192） | 有：`run.stderrTail`（800）+ 群聊行 |
| 重跑语义 | 靠**同 runId 的新 attempt**：编辑源文件再 `mode:'file'` ⇒ attempt≥2，`scriptChanged:true`、`previousReceipt` 指向上一次；**永不覆盖旧 attempt**（1056–1075） | 靠 `deduped`（内容+构建上下文一致则跳过）与 `attempts+1` |
| 并发保护 | **进程内** `withArchiveLock`（同 runId 串行）+ 明确的**跨进程缺口**（需宿主独占创建原语，840–846） | 队列天然串行/按 `leanJobsMaxParallel`；镜像写入 best-effort |
| 去重 | **无作业级去重**（同一计算重复跑就是新 attempt，这是**有意**的：每次运行都要独立回执） | **有**：`leanLibArchivedOk(name,sha)` + 构建摘要（4614–4629） |

**"缺什么"清单（可直接作为目标 5 的差距项）**
1. **没有异步/后台计算作业**：一次 `op:'run'` 就把成员的一轮工具调用占满到 `mathTimeoutMs`（默认 60s）；没有 `math_job{jobId}` 之类的查询面，也没有"入队即返回"。
2. **没有作业镜像与恢复扫描**：即没有 `Computation/Jobs/*.json` 这类文件，也没有 `recoverMathJobs()` 的对应逻辑。
3. **没有断点/续算原语**：长任务（大规模数值/符号计算）既不能保存中间状态，也不能从上一 attempt 继续；只有"重跑整段脚本"。
4. **没有抢占/取消语义**：没有 `jobId` 级的 terminate；只有超时（`cap` 到点 `handle.terminate()`）；会话 dispose 不终止在跑的 math 子进程（`disposeLeanJobs` 只覆盖 Lean，5005–5025；math 侧 `mathSpawn` 的 handle 只活在那次调用内）。
5. **没有跨进程归档独占**：并发写同一 runId 的 attempt 分配依赖宿主提供独占创建原语（当前 fs 接口未暴露）。
6. **清理/保留只有告警**：20 attempt / 200 run 只是 warning，永不删除，长期运行会无界增长（对"作业持久化"的运维面是缺口）。

### 5.8 numpy / scipy / pandas / sympy 适配的现状（逐字核实）

- **代码里没有任何针对 `numpy`/`scipy`/`pandas`/`sympy`（或 `matplotlib`/`sklearn`）的分支或特判**。全仓 grep 这四个名字，代码侧**唯一命中**是 `math-engines.js:30` 的一句注释（说明 python 探针必须"每包一个 argv"，否则会把 `numpy,pandas` 当成一个包名）——即：**它们被当作普通包**。
- 因此"适配"实际由**三条通用机制**承担：
  1. **包存在性探测**：`packages[]`（调用级）或 `mathPackages`（所级）⇒ `buildProbeArgv` + 引擎自带 `probeCode`；python 用 `importlib.util.find_spec`（**能发现已安装但未 import 的包**），R 用 `requireNamespace`，Julia 用 `Base.find_package`，Octave 用 `pkg('list')`，MATLAB 用 `license('test',…)`。
  2. **版本策略：只查存在，不校验版本**（`MATH_VERSION_POLICY`：`version-constraints-are-existence-only: 只按 base name 检查是否存在，约束本身从不校验；只检查是否存在；版本求解交给包管理器`）——`numpy>=1` 这类规格**只按 base name 探测**，规格原样透传给安装命令；响应与回执都带 `versionPolicy` 与 `constraintsNotEnforced[]`（**绝不静默丢弃约束**）（305–309、1012–1014、1141–1143）。
  3. **安装只出计划/指引**：缺包 ⇒ `MATH_MISSING_PACKAGES`（**不产生回执目录**），`next.kind='agent-install'` 带 `{engine,packages,specs,dryRun:true}`；真正执行要 `op='install'` 两步确认（plan→planToken→confirm）；python 还会按 conda/mamba/uv/pip 分派（§5.3）。
- **真实引擎验证记录（文档侧，非本分片实测）**：`docs/math-computation.md` §6 记："python 3.12.10（用户级安装）+ R 4.6.1（机器级、不在 PATH）已在真机验证；`numpy/pandas/sympy/scipy/matplotlib/mpmath` 经 TUNA PyPI 安装"；Octave/Julia/商业模板未验证。**读者须注意：这是文档声明，不是本分片复跑的结论。**
- **结论（供目标 5）**：现状是"**通用包探测 + 存在性策略 + 计划式安装**"，**不是**"针对科学计算栈的深度适配"（没有 import 注入、没有 dtype/精度协商、没有符号→数值降级路径、没有结果结构化解析、没有内存/大矩阵策略、没有 `sys.executable` 与 venv 绑定校验）。要让 numpy/scipy/pandas/sympy 真正"好用"，需要补的是**结果形状契约**（结构化返回）与**会话级解释器/环境绑定**，而不是再加一个包名列表。

---

## 6. 专章：框架能力需求清单（若要在一个通用框架里复现 v5r）

逐条列"机制 → 需要框架提供什么原语"。**粗体**是 v5r 里靠宿主（DSH）提供、框架自身无法模拟的能力；其余都可以在框架内实现，但**必须显式提供**，否则对应机制会退化成提示词纪律（不可强制）。

### 6.1 耐久层（一切其他能力的地基）

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F1 | **事件折叠（event-sourced fold）**：`commit(type,data) → 新状态`，同一 type 的所有写入串行；非法/异常事件**不得中断后续读** | 全部：成员/任务/消息/会议/辩论/verdict/formal/queue/solve/progress | 纯函数；返回**新顶层引用**（按 `Object.is` 比较）；异常写 diagnostics 后继续 |
| F2 | **键白名单 + 函数式变更**：每类事件只接受一份显式字段白名单；白名单项可传函数以在 fold 内做 read-modify-write | institute 的 22 个键（597–692）；`formal.record/todo`、`queue`、`paper`、`feedback`、`grants`、`ballots`、`formalProofs`、`resolutions`… | **漏写白名单 = 静默丢弃**（v5r 已三次踩坑并留注释）；函数式变更是"同 tick 两写不互吞"的唯一手段 |
| F3 | **fold 内 id 分配器**：`alloc.next(kind)` 与对象创建在同一 commit 内 | `t-N`、`mt-N`、`msg-N`、`r-N` | 读侧**不得**提供 id 预览（旧形状导致两个同 tick 创建铸出同一个 `t-N`，6128–6132） |
| F4 | **CAS 令牌（revision）**：对象带 `revision`，变更必须带 `expected_revision`，不匹配返回**专属错误码**且不写 | 任务板（6161–6178） | 必须有"具名 stale"错误码 + 中文可读消息 + "先读后写"的 next 提示 |
| F5 | **快照式持久化 + 载入失败拒写**：整状态写文件；**载入失败的文件绝不被覆写**；写失败要计数并在表面可见 | 状态文件 `State/<所>.v5state.json`（902–916、1474–1511） | 写失败无法回滚 ⇒ 必须可观测（v5r 用 diagnostics + `stateWriteFailures`） |
| F6 | **耐久标记表**：用于跨重启"只做一次"的承诺 | `meetingOpen`、`stallNotice`、`officeRequestsDropped`、`verifiedRecently`（内存，故非此列） | v5r 明确区分：能持久的承诺必须持久（如"静止最多提示一次"），不能持久的**不得**对外承诺 |
| F7 | **有界台账（LRU/cap）**：整快照每写一次都很贵，历史数组必须封顶并**计数丢弃量** | `delivered`(500)、`meetings`/`debates`(200)、`officeRequests`(10 + 计数)、成员录制的分轨截断 | **截断必须可观测**（"显示最新 N / 累计丢弃 K"），否则被读成完整 |

### 6.2 子代理生命周期（本分片最依赖宿主的层）

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F8 | **可续会话的子代理**：`startContinuable({prompt,parent,persona,agentOptions,toolFilter,signal}) → {childId}` | `spawnMember` | 能在一个"成员"名下多轮续跑；`agentOptions`（provider/model 覆盖）与 `persona` 分槽 |
| F9 | **向子代理投递**：`sendMessage(rootAgent, childId, blocks, {signal})` | `wakeMember`、会议/验证/心跳唤醒 | **服务级**方法（不是 Agent 方法）；缺它必须能**显式检测并报错**（v5r 用 `typeof !== 'function'` 硬挡，3918） |
| F10 | **回合结束事件带 `childId` + `stopReason`** | `onMemberEnd`：回执归因、`pendingWork` 清理、compaction | 回执必须能匹配到**发起这一轮的 token/kind**（v5r 用 `inflight` Map 修"kind 被后一次唤醒覆盖"，1213–1218） |
| F11 | **在活子代理上限可探测**：宿主拒绝时能识别出"这是上限"而非普通错误 | `spawnMember` 的 `ACTIVATION_LIMIT_REACHED` 归一化 | 必须把宿主的不透明字符串**翻译成具名参数 + 读数**（3821–3829） |
| F12 | **工具过滤与未注册名容错**：`tools.restrict` 对未注册名会 throw，需能从错误里解析"宿主已注册的工具名"并只保留它们重试 | `startWithToolFilter`（9711–9726） | 不得降级为"不带过滤启动"（那会扩大成员权限） |
| F13 | **卸载/dispose 钩子集合**：会话销毁时逐个调用 | `disposeLeanJobs` 注册 5025 | 卸载必须能终止在跑的**外部进程**（见 F17） |
| F14 | **真实资源读数**：RSS、在活子代理数 | `memoryCeilingMb` / `maxLiveChildren` 硬门（3766–3771） | 读数要进可观测面（`status().debug`），否则"为什么不再新建成员"不可解释 |

### 6.3 定时与并发控制

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F15 | **可注销的定时器**（`ctx.timeout(cb,ms) → disposer`） | 心跳、digest、Lean drain、Lean/math 超时 race | 每个定时器都必须有 disposer 并在**所有分支**清理（v5r 反复强调"disposer 在两种结果里都跑"） |
| F16 | **调度 trampoline**：单一 `scheduleNext()` 入口 + 去重标志，避免递归/并发重入 | 心跳、digest、proposal 触发 | 一次调度 pass 里"错过的触发"必须能被下一次补上（v5r：`maybeQueueVerify` 里"不能只靠一个已在飞的 pass"，6698–6703） |
| F17 | **子进程服务**：`resolveExecutable` + `spawn({argv,cwd,stdio:{maxBytes},graceMs,stdin}) → handle{done,collected.*.readFrom,terminate,stdin}` | Lean 编译队列、math 计算 | **超时必须真的 terminate**（`graceMs` 只是请求）；stdout/stderr 用 `maxBytes` 上限；`spawn` 可能返回 `null`（会话早期）⇒ 调用方必须把它当"无子进程"处理 |
| F18 | **锁/互斥骨架**：同一资源只允许一个收束在飞 | `finalizeLock`（验证/会议）、`beginLock`（开启验证）、`withArchiveLock`（同 runId 归档）、`chatChain`（群聊镜像串行） | 锁必须在 `finally` 释放，且**不得**把链式后续吞掉（6793–6796） |
| F19 | **跨进程独占创建**（**v5r 缺失**） | math 归档 attempt 分配 | 当前 fs 接口没有暴露 ⇒ 只能进程内串行；框架若要做"作业级"持久化必须补这个原语 |

### 6.4 提示词管线

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F20 | **运行时可变的 persona / 每轮提示词分离**：章程（persona）入职冻结；**所有随参数变化的文本必须在构造提示词那一刻现算** | `formalVerify`/`leanInitiative`/`pointerPropagation`/`resourceSelfCheck`/数学可用性行 | 写进 persona 就等于"切档后成员还读旧指令"（docs/formal-verification.md §1） |
| F21 | **共享文本块的单一来源 + 漂移守卫**：跨预设/跨模块共用的规则文本必须由同一常量给出，并在运行时校验它仍出现在最终文本里 | `MATH_RULE_LINES`/`MATH_ARCHIVE_WORKFLOW_LINE`/`MATH_SUBSTITUTION_RULE_LINE` 的四条守卫（5191–5200）；`MATH_TOOL_DESCRIPTION` 漂移守卫（11008–11010） | 守卫失败只能 `console.error`（不能中断提示词构造） |
| F22 | **回执契约必须是"行为断言"而不是措辞**：提示词里承诺的字段必须真的被解析入库 | `formal` 字段（9420–9483）；`vote_solved`（9564）；`reject_assign`；`record`；`task_*` | v5r 的教训原文：v2 首版只在提示词写了 `formal` 字段，框架从不解析，"177 条断言全绿却守着一个死通道" |
| F23 | **结构化回执解析的容错**：JSON 围栏/整段/最外层 `{}` 三级回落；非法票值不得静默变 0.5 | `parseReply`（11556–11578）、`normVerdictNumber`（9348–9359） | "引用数字/`TRUE` 字符串"这类常见形态要显式支持，否则成员以为投了票而实际没有 |
| F24 | **身份推导必须"派生而非猜测"**：调用者身份（成员 id / 所办 / 不可识别）必须由会话谱系导出；无身份时**具名拒绝**，绝不冒充 | `memberIdOfAgent`/`isProvablyOffice`/`officeCaller`（3933–3971）、`memberDiagnosis`（2959–2975） | 空串必须 fail-closed（v5r 的 L6 修复：空串曾被当成"每个无主任务的 owner"、"每个 office-only 工具的所办"） |

### 6.5 共识/表决引擎

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F25 | **门槛单一来源函数**：`m = f(有效分母, 上限参数)`，所有视图（状态/报告/花名册）**读同一个快照** | `quorumMFrom`/`rosterSnapshot`/`quorumView`（2903–2953） | 门槛**不得**硬编码在消息里；非法参数一律钳制（`quorumCap>=1`） |
| F26 | **票型枚举与语义分离**：赞成/反对/显式弃权/无法判断/未表态**五种分开记账**，且"沉默绝不折算" | `aggregateOpinion`（6557–6587）、`castVerdict`（7014–7067） | `abstain`（计入已投、不计选项）与 `estimates`（0<p<1，计入平均）**不得同名同义** |
| F27 | **计量与裁定分离**：过程票数只能产出 `provisional:true` 的描述；产出结论必须显式传"辩论为何结束" | `aggregateOpinion` vs `judgeVerdict(vs, endedBy)`（6557–6625） | **忘记传 `endedBy` ⇒ 一律 undecided**（fail-safe）；过程展示必须带"尚未生效"警示 |
| F28 | **有界兜底必须具名且可撤销**：任何"自动结束"都要带 `{name, why, at, revocable}` 并广播 | `bound:idle`（6755–6772）、`bound:round-cap`（6814–6815）、`boundOf`（6548） | 不得有"隐式收束"；收到该触界的对象不进"刚刚定论"去重窗口，任何成员可重新提议续期 |
| F29 | **收束的单一盖章点**：少数意见/门槛/生效时点在一个写入口自动盖，四条收束路径全覆盖 | `putVerdict → sealRecord`（1529、2721–2732） | 盖章要**幂等**（`sealed` 标志）；少数意见定义要写死（弃权/无法判断/未表态**不算**少数意见） |
| F30 | **复议（只能升门槛）**：资格**由记录派生**（有胜方 ⇒ 胜方之一；无胜方 ⇒ 任一参与者）；每轮一次；旧结论/旧票面 **append-only** 留档并标 `supersededBy` | `reconsiderTool`（2742–2864）、`raisedThresholdOf`（2734、6595–6597） | **不得以"没有胜方"拒收复议**（D5a）；不得无限复算（受 `verdictMaxRounds` 限） |
| F31 | **原子队列（append/take 都在 fold 内）**：proposal 的查重与入队、取头与删除必须是一个原子步 | `appendToQueue`/`takeQueueHead`（6631–6654） | 修的是"同 tick 两个提议只留一个、两边都报 ok"的丢提议竞态 |
| F32 | **"刚刚定论"去重窗口 + 单一收束锁** | `verifiedRecently` + `recoverStallMs`（6687–6690、6951–6952）、`finalizeLock`/`beginLock`（6796、6917–6934） | 双收束会产出重复的 Verified 卡与重复辩论记录 |
| F33 | **门禁只能加在"唯一收口点"** | `require` 门禁加在 `continueVerifyRound` 的 `closeVerify` 之前（6801–6813）与 `endVerify`（7345–7351）；`finalizeUndecided` 不受影响 | 门禁必须**记 undecided + 待办**而不是卡死（docs/formal-verification.md §8） |
| F34 | **"谁有资格开启辩论"的可配置身份判据** | S25-C：仅院士可 `propose_verify`；对象必须已 `formalProofs[t].locked && status∈{proved,disproved}` | 同一判据在**提议侧与开启侧各查一遍**（防御纵深，6681–6686、6709–6714） |

### 6.6 任务板 / 成果库

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F35 | **DAG 校验（自环/重复/缺失/整图环检测）** | `validateDeps`（6069–6098） | 校验必须在 **fold 内、用最终 id** 执行，失败返回 null 让 fold 不写 |
| F36 | **显式状态机 + 拒绝非法迁移**：`pending/in_progress/completed/deleted` 与 `open/done/handover` 正交 | `taskUpdate`（6161–6292） | **绝不自动关闭**；责任人缺失 ⇒ `handover` 不静默丢弃 |
| F37 | **行动项幂等键**：同一来源 + 同一 subject + 同一 owner ⇒ 不重复建/不重复派 | `taskAssign`（6324–6337） | 幂等要返回 `deduped:true`，让调用方可区分"新派"与"复用" |
| F38 | **内容指纹（id 之外的稳定身份）**：跨对象引用只持 `id + 一行标题 + 指纹 + 状态`；正文按需拉取；读数**回读**而非重算 | `contentFingerprint`（362–365）、`readLibrary({list:true})`（5932–6059） | 指纹只覆盖内容（不含标题/时间）；**悬空 id 必须具名拒绝** |
| F39 | **写域建议（advisory，不阻断）**：前缀重叠判定 + 告警面 | `writeScopeWarnings`/`scopesOverlap`（4288–4299、471–476） | 必须明确"advisory"，否则会被误当锁 |
| F40 | **人读镜像与权威状态分离**：镜像只写不读、勿手改、头部写明权威位置 | TaskBoard.md / Institutes.md / Formal 索引 / Shared/Feedback / Shared/Chat / Debates | 镜像丢失或手改**不得**影响语义 |

### 6.7 形式化 / 外部工具链

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F41 | **路径守卫（词法归一 + root 包含）**：任何"执行/读取用户给的路径"都必须先归一化并证明在根内 | `leanAbsPath`（4379–4394）、`mathRelPath`（5032–5042）、`projectRel` | **`startsWith` 不够**（`..` 能绕过）；显式拒绝绝对路径/盘符/越界 |
| F42 | **后台作业队列 + 耐久镜像 + 恢复扫描** | Lean：`enqueueLeanJob`/`runLeanJob`/`leanWriteJob`/`recoverLeanJobs`（4715–4966） | 镜像必须**每次状态变化**都写；恢复必须四分支（queued/running/settled/其它）且**绝不静默把对象验证掉** |
| F43 | **settle 判据三元组**：`exit 0` + **内容哈希未变** + **构建上下文未变** | `runLeanJob`（4763–4774）；`leanApplySettle` | 只有三元组全真才允许置 `passed`/写归档；否则 `attempted` + 明确 note |
| F44 | **一键式公告（one-shot notice）**：结算结果只在"发起者下一轮提示"出现一次；非 active 成员的待发通知要剪掉 | `leanQueueNotice`/`takeLeanNoticesFor`（4845–4871） | 公告**不补发**是承诺 ⇒ 必须同时给**长期查询路径**（镜像 + `lean_job`） |
| F45 | **去重（内容 + 构建上下文）** | `leanLibArchivedOk`（4614–4629）、`leanArchive` 的 dedupe（5671–5676、5724–5728） | 去重判据必须与 settle 判据同源；不重编译 |
| F46 | **外部工具解析顺序 + 可观测**：显式 → PATH → 已知安装位置；失败时 `next.tried` 点名探测过的路径 | `resolveKnownTool`（93+） | "装了但不在 PATH"是**最常见**的真实情形；不得只说 "not found on PATH" |
| F47 | **能力探测 + 两步安装（plan/token/confirm）+ 审计** | `math_computation op='probe'/'install'`、`detectPythonManager`、`Computation/installs/<planToken>.json` | 商业引擎**永不代装**；system 作用域**永不记忆**；无通用回滚要如实声明 |
| F48 | **"作业持久化"的显式等级**：框架必须能表达"这不是持久任务系统" | Lean 队列（docs/formal-verification.md §11）；math **完全没有** | 若要支持断点续算，需要 F42 + **F19（跨进程独占创建）** + **作业级取消/抢占**（v5r 两者都缺） |

### 6.8 可观测性与可恢复性

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F49 | **诊断面**：载入/写入问题、被丢弃的未知参数键、`prematureReads`、`stateWriteFailures` 都能在 `status()/report()` 里读到 | `noteLoadProblem`/`drainLoadNotes`（1442–1472）、`reportDroppedStateKeys` | 被丢弃的东西必须**具名可见**（v5r §2.5 的 `state-dropped-keys`） |
| F50 | **"未知就说未知"**：`updatedAt:0`、`droppedChars`、截断标记、`timings` | 头部列表（5961–5972）、分轨截断（6031–6041）、`tail()`/`truncated` | 不得把缺失值猜成一个数 |
| F51 | **重启后可继续的标记**：`pendingWork`（成员有活没干完）、`meetingOpen`（会议开了没收束）、作业镜像 | `wakeMember`/`spawnMember` 3843–3848；`beginMeeting` 7485；`recoverLeanJobs` | 这些标记是"人/所办决定是否续跑"的**唯一依据** |
| F52 | **等待/活动通知**：`waitForActivity` 的一次性 waiter + `notifyActivity` | `vibe_v5_wait`（3424–3435） | 必须是"未来一次性"语义（不能把历史活动当新活动） |
| F53 | **直接 fs 与策略 fs 的边界要讲清**：G6 自述用 `node:fs`（原子 tmp+rename），而 Lean/math 走 `ctx.fs`（带 policy） | 7075–7092 vs 4520–4541 | 直接 fs 的写入**在宿主 fs 策略之外**，框架应显式记录这一例外（v5r 只在注释里说明） |

---

## 7. 未决问题 / 与其它分片的边界

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **U1** | `LEAN_QUEUE_CONCURRENCY = 1`（255）**全仓无读取点**；实际并发读的是 `params.leanJobsMaxParallel`（4602）。二者语义重复且常量成了死代码 | grep `LEAN_QUEUE_CONCURRENCY` 仅命中定义 255 | 目标 3/4 的"参数面单一来源"叙事里有一个反例；复现 pack 时**不要**照抄这个常量当作并发上限 |
| **U2** | **v5r 的验证/会议不冻结参与集**：`aggregateOpinion` 与 `continueVerifyRound` 每次都读活的 `voters()`（6558、6778），而 v4 文档描述了 `rosterSnapshot`/`frozenParticipants`（docs/math-computation.md §123–124）。v5r **有** `rosterVersion`/`rosterSnapshot`（2913–2928），但 `judgeVerdict` **不读**它们 | 6557–6587 vs 2913–2928 | 验证进行中若发生 hire/fire，有效分母与 `m` 会**当场变化**；"冻结"承诺在 v5r 未实现（A/C 分片若发现会议侧有另一套冻结，请交叉核对） |
| **U3** | `judgeVerdict` 末行 `undecided: quorum not met`（6624）在前置分支下**不可达**（单边且总数≥m 已判 true/false） | 6616–6624 | 死分支；做覆盖率/变异测试时不要把它当有效路径 |
| **U4** | `math_computation` **无作业持久化/断点续算**（§5.7）；`docs/formal-verification.md §11` 也明说 Lean 队列"不是持久任务系统" | §5.7 全表 | 目标 5 的核心差距；若用户要求"断点续算"，必须新增框架原语（F19/F42/F48） |
| **U5** | `math_computation` 的 **跨进程归档并发**依赖宿主独占创建原语，当前 fs 接口未暴露 | 840–846 | 多进程/多会话同时跑同一计算时 attempt 分配不保证唯一 |
| **U6** | numpy/scipy/pandas/sympy **没有专门适配**（只有通用包探测 + 存在性策略） | 全仓 grep：仅 `math-engines.js:30` 注释 | 目标 5 的需求应表述为"结果形状契约 + 会话级环境绑定"，而非"再加包名" |
| **U7** | `docs/math-computation.md` §6 的"真机已验证"（python 3.12.10 / R 4.6.1 / numpy 等）是**文档声明**，本分片**未复跑**（受"不跑全量门禁/不装依赖"约束） | 文档 §6 171–177 | 目标 5 的验收若需真机证据，须由 `vmu-verify` 另开真机任务 |
| **U8** | `selfReportRead/Write` 与 `selfViewAudit` 直接用 `node:fs`（7076、7094），**不经 `ctx.fs` policy** | 7075–7103 | 在受限宿主上这条写入路径与其它耐久写入的策略面不一致；A 分片若盘点持久化层次需含此例外 |
| **U9** | 卡片正文 `readLibrary` 全量枚举时 `slice(0,4000)` **没有** `droppedChars`（分轨有），progress 的尾 6000 也**没有**丢弃计数 | 6024、6030 vs 6031–6041 | "截断必须计数"的范式未覆盖这两处；S21 门禁只盯头部列表，未盯这里 |
| **U10** | `LEAN_SEARCH_PATH_FLAG='-R'` 与 `leanHasSearchFlag` 的 `ALSO_ACCEPTED=['--search-path','--root']`：用户若在 `leanArgs` 里写 Lean 3 的 `--search-path`，v5r 会**尊重它不注入**，而该拼写在 Lean 4 上会导致编译失败 | 256–272 注释（task-27 实测） | 复现时需决定"尊重用户"还是"纠正用户"；当前实现选尊重并留下文档说明 |
| **U11** | `verifiedRecently` 是**内存** Map，重启即空 ⇒ "刚刚定论"去重窗口不跨会话 | 1212、6901 | 重启后同一对象可被立刻重新提议验证（只要 `formalProofs` 仍 locked）；若需跨会话去重须改为耐久 |
| **U12** | 任务板 `writeScopes` 只是建议，`taskReady` 只认 `blockedBy`；**没有任何机制阻止两个成员同时写同一文件** | 4288–4299、6069–6098 | 与 DSH agent-teams 的"advisory scope"一致；框架若要提供硬锁必须新增原语 |

**与分片 A / C 的交界（避免重复与遗漏）**
- **分片 A**（状态 fold / 持久化 / 恢复 / 名册 / 章程 / 信箱）：本文件 §0 与 §1.11/§1.12 只写"本分片机制**消费**到的耐久键与 fold 行为"，fold 本体（589–900）、后端（917+）、`start/resume/configure`、名册生命周期、章程/persona 全文、信箱与投递台账归 A。
- **分片 C**（会议系统 / 群聊与状态面板 / 主代理 / 控制面）：`7385` 起的 `startMeeting`/发言模型/纪要/决议、`handleReply` 的会议相关分支、`status()/report()`、`vibe_v5_set/configure/*`、paper 阶段归 C。本文件只登记与 B 强耦合的三处：`meetingKeepEvery` 自动同步（5852–5854）、`assign` 的 `say` 与 `wakeIfIdle`（6365–6372）、`endVerify` 的收束分支（7340–7351）。



---

# v5r 深度盘点 · 分片 C —— 会议系统 · 群聊与状态面板 · 主代理 · 控制面

- 仓库：`Vibe-Mathematics`（git，`main`，HEAD `6d0164e`）；**本分片全程只读**（未改任何文件、未 git、未跑门禁）。
- 主文件：`vibe-math-v5r/vibe-math-v5r.js`。`read` 工具口径 **11597 行**（任务书写的 11166 是 `Get-Content | Measure-Object -Line` 口径的行数差；任务书段落标记与实际一致，测试 seam 在 11476）。
- 本分片实际通读：**7290–11597 全量逐段读**（覆盖任务书 7359–11166 的每一段，含 11166–11597 的注册面与 test seam）；另**按需回读**分片 A/B 范围内、但本分片专章必需的**定义点**，全部标注 `file:line`。
- 配套：`vibe-math-v5r/agent.cordis.yml`（**实际 460 行**，非 390）、`preset.yml`（762B）、全部 `MEETING-PLATFORM-*.md`（11 份）、`架构图.md`、`docs/02-rulings.md`、`docs/06-expansion-mechanisms.md`、`docs/08-landing-plan.md`（见 §⑦–§⑩）。
- 行号引用一律为 `vibe-math-v5r.js:<line>`，其它文件写文件名。

---

## §0 速览：本分片最关键的事实（供 lead 先看）

1. **会议要求"开会"这件事本身没有任何计时器**：收束判据只看「机会位」（`asked`/`silent`/`unreached`）＋「是否还在举手/在飞」；**沉默不触发任何截止**，唯一兜底是**参数化墙钟硬界** `meetingHardLimitMs`（默认 1800000ms，钳制 [300000, 7200000]，`:7441-7444`、`:7624-7635`）。
2. **"票"与"发言"在数据结构上完全分离**：`meeting.inputs/speeches` 只记发言；结题票只由 `recordSolveVote`→`putSolve` 写进**耐久** `inst().solve`（`:7878-7890`、`:9571-9649`）。**沉默绝不等于同意**，未表态者**阻止结题**（`:7853-7876`）。
3. **会议等级（formal/light）是 D7 的硬闸**：`light` 会期内**任何"实体定论"写入统一具名拒**（`truthWriteRefusal`，`:2233-2238`），牵涉 `vibe_v5_result_record`（`:2128`）、`minutes` 的 `entry_kind:'decision'`（`:2454`）、`motion kind:'resolution'`（`:2362`）。
4. **表决期禁言（S8/R3/K12/B9）由"是否存在 open 投票板"派生**（`speechFrozen()`，`:2878-2896`）：成员发言入口被拦（`vibe_v5_say` 与会议唤醒的发言交付），**举手保留**、票照记、院士/所办豁免、程序异议不受限；被拒的发言交付会记 `silent-after-refusal` 以免被推成 `unreached` 提前收束（`:9597-9609`）。
5. **群聊没有"管理员 / 发言次数上限 / 禁言（除表决期冻结外）"这类字段**：全代码 grep `禁言|发言次数|管理员|admin|mute` 只命中 `:9596` 一处注释。消息字段只有 `{id, from, to, kind, text, at, quote?, quotes?, supplementOf?}`（`:3557-3561`）；"谁算管理员"在 v5r 里不存在，只有**权限表**（office / academician / secretary 等，`:1621-1642`）。
6. **状态面板不是"板"，是"成员自述 JSON + 审计台账"**：`Members/<id>/SelfReport.json`（`overall/subgoal/plan/status` ＋ 各自 `…At` ＋ `history` ＋ `deviation`）与 `Shared/SelfReportViewAudit.json`（查看留痕，cap 200）（`:7069-7223`）。框架**不生成**"总目标/正在执行的子任务"面板，只有**院士可替他人设定 `overall`**（`:7204-7211`）。
7. **主代理（academician）不是"助手"而是"所内领头人"**：人设是**入职时冻结的 charter**（`charterFor`，`:3131-3361`）＋ `staffPersona` 前缀（`:3676-3679`）；提示词按轮装配（状态块＋在途邮件＋本轮 ask），**charter 不逐轮重注入**（`:3973-3977`）。**自动汇报**在人设层（【二·7】主动向院士汇报 / 无院士时主动群聊汇报，`:3219-3225`）＋ 各自的 `Progress/progress.md`；"自动汇报"没有独立的机器机制（无定时汇报任务）。
8. **office（所办）＝会话 root，是外部接口**：`agent.cordis.yml:74-86` 明确写「YOUR ROLE — HANDS-OFF … you do NOT research, do NOT vote」。**office 不能是任何成员**，`vibe_v5_message` 只能由**可证明的 root** 调用（`:11077-11088`）。

---

## ① 机制逐条清单（分片 C：chat / meeting / paper / hire-fire / sched / reply / toolFilter / control / register）

> 标签：`[MEETING]` `[VOTE]` `[CHAT]` `[STATUS-PANEL]` `[PAPER]` `[HIRE-FIRE]` `[SCHED]` `[CONTROL]` `[REPLY]` `[TOOLFILTER]` `[REGISTER]` `[OTHER]`

### A. 群聊 / 信箱 / 引用

**C-01 `[CHAT]` 群聊落盘镜像 `saveChatLine(text)`** `:7365-7376`
- 入口：内部函数；会议召开/收束、雇佣/解雇、决议、授撤、动议、自述、结题、论文、硬界放弃、静止提示等**所有事件**都写一行。
- 逻辑：日期取 `fmtTime().slice(0,10)`；路径 `Shared/Chat/<YYYY-MM-DD>.md`；追加 `- HH:MM:SS｜<text>\n`；**串行化**：`chatChain = chatChain.then(run, run)`（修复"同一 tick 两次读-改-写丢行"）。**权威记录是 `inst().messages`（事件 fold），此文件只是人读镜像**。
- 字段/路径：`Shared/Chat/<day>.md`；首行为 `# 研究所群聊记录｜<institute>｜<day>`。
- 参数：无。持久化：文件 + 事件流。宿主接触面：`readTextRel`/`writeTextRel`（injected `fs`）。

**C-02 `[CHAT]` 消息投递 `say(from, opts)`** `:3531-3574`
- 入口：`vibe_v5_say`（成员）/`vibe_v5_message`（仅 office）/`notice()`（框架）/reply 的 `say` 字段。
- 逻辑：`to` 解析四态 —— `all`→除自己外全部 active；`voters`→除自己外表决者；`OFFICE_INBOX`→仅 `[{id:OFFICE_INBOX}]`；其它→须存在且 active 且非自己（否则 `V5_MEMBER_NOT_FOUND`/`V5_SELF_MESSAGE`）。**id 在 fold 内一次 commit 分配**（`alloc.next('message')`→`msg-N`），多收件人一次提交（修复同 tick 撞 id 后被 dedupe 丢消息）。`from==='office'` ⇒ `notePaperConsult('message')`。发送后 `notifyActivity()` + `scheduleNext()`。
- 字段：`{id:'msg-N', from, to, kind, text, at, quote?, quotes?, supplementOf?}`；`kind ∈ {chat,dm,voters,office,meeting,verify,assign,nudge,notice}`（`:3599-3613` 的 frameLine 逐 kind 前缀）。
- 参数：无。持久化：`EV.message` fold（`inst().messages`）+ 封顶账本 `delivered`（`DELIVERED_CAP=500`，`:484`）。

**C-03 `[CHAT]` 框架通知 `notice(memberId, text)`** `:3580-3585`
- `say('framework', {to:memberId, kind:'notice'})`；目标必须 active。用于"票未被记录""claim 失败""formal 条目缺 target"等**具名回执**（不再用自聊，`say` 会拒 `V5_SELF_MESSAGE`）。

**C-04 `[CHAT]` 待投递队列 `pendingFor` / 帧 `frameLine`** `:3588-3613`
- pending = `inst().messages` 中 `to===memberId` 且**未被 ack** 的；按 `at` 升序；每项 `{id,kind,from,at,line}`。
- 帧前缀逐 kind 固定：群聊/私信/致表决者/所办通知/会议/表决/分派（**office 分派必须显示「所办分派」而非「院士分派」**）/督办/提示。

**C-05 `[CHAT][SCHED]` 摘要节流 `deliveryDecision`＋`armDigest`** `:3617-3627`、`:4270-4276`
- 逻辑：有非 `chat` 类 pending ⇒ `{deliver:true,urgent:true}` 立即投；纯 chat ⇒ 仅当 `pending.length >= chatDigestMax` 或 `now-oldest >= chatDigestMs` 才投（`urgent:false`）。
- 参数：`chatDigestMax` 默认 **12**（下限 1，`:9870`）；`chatDigestMs` 默认 **45000**（必须 >0 否则被丢弃，`:9846-9848`）。
- 调度：`armDigest()` 用 `ctx.timeout` 在 digest 窗口后再开一轮 `scheduleNext()`。

**C-06 `[CHAT][REPLY]` 收件箱感知唤醒 `promptFor` / `wakeWithInbox`** `:9078-9110`
- 逻辑：**先取 pending（baseFn 作为 thunk 延迟构建）**→ 只把**新** pending（`inboxInjected` 已注入集合之外的）前置成 `[新到的消息…]` 块 → 期间 `inboxSuppressed` 让 `briefBlock` **不再嵌同一批邮件**（修复"一条消息读两遍"）→ `wakeMember` → **发送成功后**才 `ackPending` → 无论成败清 `inboxInjected`（失败的下次重投）。不变量："未 ack ⇒ 仍可重投"。
- 参数：无（受 `chatDigestMs/Max` 间接控制）。持久化：ack 写 `EV.delivered`。

**C-07 `[CHAT]` 私聊补记（G5/D6）`supplement_of`** `:2629-2638`、`:2683-2691`
- 入口：`vibe_v5_say {supplement_of, why}`。逻辑：仅**该私聊的发送者本人**可补记（否则拒），`why` 必填；写入 `inst().chatSupplements[] = {of, by, at, publicRef, why}`；公开面出现的是**补记本**，**原私聊正文永不进公开面**。被引时 `viaSupplement` 指回补记本。

**C-08 `[CHAT]` 引用边界与锚解析 `resolveQuoteAnchor` / `sayQuote`（S10/D6）** `:2476-2693`
- 入口：`vibe_v5_say {quote_ref|quote_refs, quote_excerpt}`。
- 锚三类：① 会议内发言 `mt-<id>#speech-<who>-<n>`（**读 `Shared/Meetings/<id>.md` 的 `### <who>` 小节，耐久 ⇒ 悬空可判**）；② 会议外群聊 `msg-<N>`（**写入时快照**；已投递 ⇒ 正文不再保留 ⇒ 悬空具名拒；`dm` 必须先补记）；③ 聚合 `ballot:<id>`（逐人锚 `ballot:<id>#vote-<who>` 在 `secret` 板**具名拒**）；④ 决议锚 `res:<n>`/`res:latest`（跨会议唯一放行；`res:latest` 全部被取代 ⇒ 悬空拒，**绝不回落**；带 `supersededBy` 仍可引但须标"已被复议"）。
- 参数：`quotesPerMessageMax` 默认 **2**（下限 1，`:9862`）；`quoteDepthMax` 默认 **3**（下限 1，`:9863`）；摘句 `QUOTE_EXCERPT_MAX=200`（确定性截断 + `truncated`）；条数超限 ⇒ **具名拒**；深度超限 ⇒ **折叠为锚**（`collapsed:true`，不拒）；成环 ⇒ **只标注**（`cycle:true`）；引用域必须与当前会议一致（跨会议/跨域拒）。
- 持久化：`quote/quotes` 随消息进 fold；折叠/成环写群聊行。

**C-09 `[CHAT][CONTROL]` 所办信箱 `OFFICE_INBOX`** `:3539-3542`、`:10422-10428`、`:570`
- 逻辑：`to:OFFICE_INBOX` 的消息**不唤醒任何人**（office 无 member id），作为耐久待办由 `status().officeRequests`/`report()` 呈现；`OFFICE_REQUEST_CAP=10`，超出丢最旧并累计 `officeRequestsDropped`，`officeRequestsTruncated` 明示截断。
- 消费点：不能直接开会/增聘的成员发起"提议"时同时投 voters 与 OFFICE_INBOX（`:7410-7416`、`:10845-10850`）。

### B. 会议系统（核心，全部见 §③）

**C-10 `[MEETING]` 召开入口 `vibe_v5_meeting` → `startMeeting(callerId, opts)`** `:7396-7429`、`:11089-11095`
- 参数（工具面）：`agenda`（**必填**，空 ⇒ `V5_INVALID_ARGUMENT`）、`kind ∈ {sync(默认), division, verify-request, solve-vote}`、`target`、`formal_agenda:boolean`。**不给任何 `…At/…Ms`**（时间由框架写）。
- 权限：`canDo(callerId,'convene')` = office 全权；academician 且 `academicianLeads=true`；或持 `convene` 授权（`:1640`）。**非召集人 ⇒ 只提议**：`say(callerId,{to:'voters',kind:'voters'})` + `say(callerId,{to:OFFICE_INBOX,kind:'office-request'})`，返回 `{ok:true,proposed:true}`（`:7404-7416`）。
- 通过后：`consumeGrant`（一次性授权**此刻**消费）→ 拒 autoDone(`V5_INSTITUTE_STATE`)/`!running`(`V5_INSTITUTE_STATE`) → **创始期守卫**（有 `!direction` 的非临时成员 `rounds===0`）→ 若 `meeting || hasVerifyInFlight() || inFounding` 则 **parked**（首胜，后者不覆盖，`:7422-7427`）。
- 会议**已开**且只给 `formal_agenda` ⇒ 走 `setMeetingLevel`（改等级，`:11093`）。

**C-11 `[MEETING]` 会议实体与开场 `beginMeeting(opts)`** `:7453-7535`
- 名单：`order=voters()`（只征询**常驻表决者**；临时工须 `meeting_invite`），**Fisher-Yates 洗牌**决定首位发言者（`:7458`）。
- id：`commit(EV.meeting,{make:alloc=>alloc.next('meeting')})` → `mt-N`；文件 `Shared/Meetings/mt-N.md`；`lastMeetingId=id`（会后迟到发言据此补记）。
- `meeting` 字段全表：`id, agenda, kind, target, formalAgenda, by, order[], roster[], phase('round-robin'|'open-floor'), inputs{}, speeches{}, extras{}, asked{}, silent{}, unreached{}, hands{}, spokeCount{}, invited{}, retries{}, history[], hardLimitMs, lastInputAt, startedAt, secretary, secretaryAt, secretaryBy, recordEntries[]`（`:7472-7481`）。
- 耐久 OPEN 标记 `patchInstitute({meetingOpen:{id,at,agenda}})`；`putSolve({clear:true})`（**新问题清空耐久结题票**）；群聊行 `【会议 mt-N】召开…`。
- **开场提示**（S15-K4/S16-G3，**只可见不驱动**）：① 程序性点名（未完成行动项 `origin:'meeting:*'`，含 owner/「待接手」/逾期 `due_in==='next-meeting' && createdAt<startedAt`）② 上次纪要确认（未确认则提示 `vibe_v5_minutes{op:'confirm'}`）（`:7493-7513`）。
- office 亲自召开且 `auto!==true` ⇒ `notePaperConsult('meeting')`（论文 office 定稿的两条件之一）。
- 纪要文件头写入：议程/类型/目标/召集人/开始时间/发言顺序/硬界分钟数。
- 最后 `askMeetingRound()`；返回 `{ok:true, meeting, agenda, order}`。

**C-12 `[MEETING]` 轮次征询 `askMeetingRound()`** `:7536-7615`
- **活名册对账**：以 `voters()` 覆盖 `roster`；`order` 过滤已离场者并补齐新入场者；被删者清全部位（asked/silent/unreached/hands/inputs/extras/spokeCount/retries）。
- 并发预算 `budget = max(1, floor(params.maxParallel||3))`；`maxTries = meetingWakeRetries()`。
- **N+1 语义**：`meetingWakeRetries=N` ⇒ 先试 1 次、失败再重试 N 次 = 共 N+1 次；N=0 ⇒ 恰好 1 次。`tries > maxTries && !hands[id]` ⇒ 记 `unreached` 并 `history.push({what:'unreached'})`。
- 阶段一（`round-robin`）逐 `order`：跳 `silent`/`unreached`；已 asked 且已交付 ⇒ 跳；busy ⇒ 等；未 asked 且已非阶段一 ⇒ 不再补发；`attemptOne` 成功才写 `asked[id]=now()`（**受邀临时工永不进机会位**）。
- 阶段二（`open-floor`）：① 举手者（含已发言者，可多轮）→ `history what:'hand-asked'`；② `meeting.invited` 中 `askedOnce=false` 者各问一次 → `what:'invited-asked'`。
- **阶段切换**：`roster.every(id => asked|silent|unreached 有值)` ⇒ `phase='open-floor'` + 群聊广播（**无计时器**）。
- `asked===0` ⇒ `armHeartbeat()`。

**C-13 `[MEETING]` 收束推进 `continueMeetingRound()`** `:7616-7667`
- 重入锁 `finalizeLock`（防两个 end 事件双收束；bail 时**重新 arm**）。
- **唯一兜底**：`elapsed >= meeting.hardLimitMs` ⇒ 放弃：`appendMeetingTail(...,{abandoned:true})`（写全明细）＋群聊「超过硬界被放弃」＋`scheduleNext()`，**不判定**任何结论。
- 表决冻结期（`speechFrozen().frozen`）⇒ 只 arm，不推进轮次（否则被拒成员会被重试到 `unreached` 提前收束）。
- 收束判据（四类全空才算）：(a) `notYetAsked`（还没轮到）(b) `inFlight`（已 asked、未落定、busy）(c) `unanswered`（已 asked、未落定、空闲、重试未耗尽）(d) `handsUp`。任一非空 ⇒ 再 `askMeetingRound()`。
- 收束前**诚实化**：已 asked、未交付、非 silent/unreached ⇒ 记 `unreached`（reason `no answer after retries`）。然后 `finalizeLock='meeting'` → `finalizeMeeting`。

**C-14 `[MEETING]` 举手 / 发言 / 沉默 / 邀请（reply 侧）** `:9575-9634`
- 三个位置互不继承：**发言位** `inputs`/`speeches`/`spokeCount`；**机会位** `asked`/`silent`/`unreached`；**票位** `solve`。
- 举手：`meeting_hand:true` ⇒ `hands[id]=now()` + `history what:'hand'`；`false` 且在手 ⇒ 删除 + `what:'hand-withdrawn'`。`pendingHand`＝本轮之前就举着手；"交付发言"只在**在还上一次举手**时清手（否则"发言后再举手"被自己清掉）。
- 发言正文优先级：`input` > `say`(字符串) > `summary`。
- 冻结期：非院士/非所办且 `text` 非空 ⇒ **拒**：`history what:'speech-refused-frozen'` + 幂等记 `silent[id]` + `what:'silent-after-refusal'` + 群聊行；**举手保留**；票照记。
- 交付：`speeches[id].push(text)`；`spokeCount+1`；`inputs[id]=text`；`extras[id]=回复对象`；`lastInputAt=now()`；**追加**写 `### <id>（第 n 次发言）`（绝不覆盖）。
- 未发言但已获机会、未 silent/unreached、未举手 ⇒ 记 `silent[id]`（**与阶段无关**）。
- 邀请：`meeting_invite:{member,why}`（见 C-15）。
- 会后迟到发言：无 live meeting 但有 `lastMeetingId` 且 reply 带 `input` ⇒ 作为 `### <id>（会后补记…）` 追加，**按文本去重**，不再静默丢弃（`:9635-9649`）。

**C-15 `[MEETING]` 邀请临时工 `meetingInvite(callerId, inv)`** `:7676-7696`
- 权限：表决者（院士/常驻研究员）或所办。拒绝码：`V5_NO_OPEN_MEETING`、`V5_NOT_VOTER`、`V5_INVITE_NOT_TEMP`（未在册 / 非临时工两种文案）、`V5_INVALID_ARGUMENT`（无 why）、`V5_ALREADY_INVITED`。
- `invited[id]={by,why,at,askedOnce:false}`；`history what:'invited'`；难度：受邀发言**只进纪要＋广播**，不计票、不进机会位、**永不延后收束**。

**C-16 `[MEETING]` 纪要收束 `finalizeMeeting(mn)`** `:7747-7852`
- 先 `meeting=null`；把该会议 `grantScope='meeting'` 的授权在台账标 `expiredAt`（失败不影响收束）；`patchInstitute({meetingOpen:null})`。
- 结构：`## 发言区`（逐人 `### <id>`，受邀者标注；多次发言按「第 n 次发言」）＋ 结构化 `speechZone[{by,speeches[],count,invited}]`；`## 投票区`（本场每张板：问题/选项/规则/`minVotes`/`m`/已投/有效/弃权/计票/**未投票名单**/是否不记名）＋ `voteZone[]`；`## 记录人补充`（**本场等级**、纪要责任人（未指定 ⇒ `NO_SECRETARY_NOTE`）、逐条 `decision/note`）+ `meetingMinutesTail`（发言机会/举手记录/受邀/表决块）。
- 结构化写回 `commit(EV.meeting,{index:{id}, minutes:{at,speechZone,voteZone,secretary,entries,level}})`（失败不影响纪要）。
- 收尾：群聊「结束。已解决票 x/y」→ `markProgress()` → `checkSolved()` → 若有 parked 会议且无验证在飞则立即 `beginMeeting`（**parked 首胜**）→ 否则 `scheduleNext()`。

**C-17 `[MEETING][VOTE]` 纪要尾三块 `meetingMinutesTail` / 表决块 `meetingVoteBlock`** `:7700-7746`
- 发言机会块：常驻名单、已获机会 x/y 具名、**选择不发言**具名、**未能送达/未落定**具名（**与"选择不发言"严格区分**）、"沉默不等于投票"声明。
- 举手记录：`history` 中 `what` 以 `hand` 开头者。
- 受邀临时工块：邀请人/理由/是否已发言/「未发言（不阻塞收束）」。
- 表决块：逐人三态（投 true / 投 false / **未表态**）＋ 临时工无表决权（值仅显示 true/false）＋ 结论（全体一致才写「全体有表决权者一致认为原问题已解决」）。票只来自 `extras[*].voteSolved`。
- 硬界放弃路径共用同一函数（`opts.abandoned` 加警示行）。

**C-18 `[MEETING]` 会议等级（S12/D7）`meetingLevelOf` / `setMeetingLevel` / `truthWriteRefusal`** `:2217-2265`
- 派生：`formalAgenda===true` ⇒ `formal`；否则 `kind ∈ {verify-request(→formal), solve-vote(→formal), sync(→light), division(→light)}`。
- 改等级：仅院士（`canDo(...,'meeting_level')`，**不可授**）；必须已有 open meeting（`V5_NO_OPEN_MEETING`）；同值 ⇒ `deduped:true` **不写事件**；真改 ⇒ 写 `formalAgenda/levelAt/levelBy` + 群聊广播；**设置等级本身不驱动会议**（不自动升降级、不自动拒开会、无定时器）。
- 硬闸：`truthWriteRefusal(what)` 返回 `V5_INVALID_ARGUMENT` + 引导语（"请设为正式或另开决议类会议"）。
- 参数：无独立参数（由 `kind`/`formal_agenda` 决定）。

**C-19 `[MEETING]` 记录人/秘书（S11/GAPS 29）`secretaryTool`** `:2267-2327`
- 入口：`vibe_v5_meeting{formal_agenda:true}` 之外独立工具 `vibe_v5_secretary{who|member,why?,revoke?,op:'revoke'}`。
- 规则：仅院士；**院士/所办不得自任**（"主持人不得兼任唯一记录者"）；必须 active 且在册（**临时工 `V5_NOT_VOTER`**）；必须已有 open meeting；`role` **当次会议绑定**，收束即失效；台账 `inst().secretaries[]` append-only（同值 `deduped`，换人记 `revokedAt`）；**只拿记录权**（不获票权、不改阶段/分母）。
- 字段：`meeting.secretary/secretaryAt/secretaryBy`；台账 `{who,by,at,meetingId,revokedAt}`。
- 参数：`SECRETARY_ENTRY_MAX=1000`（条目长度上限，`:2274`）。

**C-20 `[MEETING]` 纪要条目 / 确认上次纪要 `minutesTool`** `:2404-2467`
- 权限：`canDo(...,'minutes')` = 院士 ∪ **当次会议记录人**（`:1639`）。
- `op:'confirm'`：`of` 缺省=时间上最近一场**已收束**会议（无历史 ⇒ `V5_INVALID_ARGUMENT`；非已收束 ⇒ 拒）；`fact_fix` ≤1000；台账 `inst().minutesConfirmations[]={of,by,at,factFix}`；**事实更正只追加到当次会议纪要的 `## 上次纪要确认` 小节，旧纪要一字不改**；同值 `deduped`。
- 无 `entry` ⇒ **只报缺口**：记录人补充/议程/发言区/投票区四类，`note:'只报缺口，不自动补全（R7）'`。
- 有 `entry` ⇒ 追加 `{by,at,text,agenda_item,entry_kind}`；`entry_kind==='decision'` 在 light 会期 ⇒ `truthWriteRefusal`；同文本 `deduped`；**只经 `appendMeetingTail`**（绝不重写 `### <who>` 与两区、不删异议）。

**C-21 `[MEETING]` 程序异议（#46/D2）`proceduralObjectionTool`** `:7290-7305`
- 入档 `meeting.objections[] = {by,at,why,chairReply:null,chairReplyPending:true}` + 纪要尾 + 群聊行；**同 (by,why) 幂等**（`deduped:true`，不追加历史、`chairReply` 仍 null）；**只记录不驱动**（不改票面/阶段、不延后收束）；`chairReplyPending` **必须可见**（不得假装已回填）。

**C-22 `[VOTE]` 投票板六项（S7/D3/D4/R9/K13）`pollOpenTool` / `pollVoteTool` / `pollCloseTool`** `:1755-1997`
- `vibe_v5_poll_open`（**仅院士/所办**，`canDo('poll_open')`，**不可授**）：必须挂在 open meeting（`V5_NO_OPEN_MEETING`）；`question` 必填；`options` ≥2 且非空不重复；`mode ∈ {single(默认),multi}`；`min_votes` **必填正整数、无默认值**、`>voterCount()` ⇒ 拒（"该板永远无法成立"）；single 不接受 `max/min`；multi 需 `1 ≤ min ≤ max ≤ 选项数`；`secret` 默认 false；`allow_abstain/allow_revote` 默认 true；**同时只允许一张 open 板**（同值 ⇒ `deduped`，不同值 ⇒ 拒）；任何 `…At/…Ms`（含小写 `expires_at`）**拒**（`rejectStampKeys`，`:1818-1822`）。
- 板字段：`{id:'b-N', by, question, options:[{id:'o-i',text}], rules:{mode,max,min,minVotes,secret,allowAbstain,allowRevote}, at, meetingId, phase:'open'|'closed', votes:[{by,choices[],abstain,note,at,revotedAt}], closedAt, closedBy, result}`（`:1881-1886`）。
- `vibe_v5_poll_vote`（有票者）：非表决者 ⇒ `V5_NOT_VOTER`（临时工会把 `note/reason` 作为**参考意见**转达 voters）；板已截止 ⇒ 拒（"只能走复议"）；`allowRevote=false` 且已投 ⇒ 拒；`abstain:true` 需 `allowAbstain`；选项须命中 id 或原文、不得重复、数量须在 `[min,max]`；同值 ⇒ `deduped`；改票写 `revotedAt`。
- `vibe_v5_poll_close`（仅院士/所办，不可授）：`settled = cast >= minVotes`（**只读两者**）；`result={cast,valid,abstained,invalid:0,minVotes,satisfied,settled,outcome:'recorded'|'unsettled',m,quorum_reached,pending,secret,tally}`；**两个门槛并列**（min_votes vs 法定人数 m）；重复关闭 ⇒ `deduped`；**不存在"到点自动结算"**。
- 冻结派生：`openBallot()` 有值 ⇒ `speechFrozen()`（见 C-23）。`speechFrozenView()` 供 status。

**C-23 `[MEETING][VOTE]` 表态期禁言 `speechFrozen` / `speechGate`** `:2870-2896`
- 判据：存在一张 `phase==='open'` 的板即冻结；返回 `{frozen,ballotId,since,question}`。
- 门：仅**成员发言入口**（`vibe_v5_say` + 会议唤醒的发言交付）；院士/所办豁免；程序异议走另一入口不受限；系统消息不过此门。拒码 `V5_INVALID_ARGUMENT` + 引导（先 `poll_close` 或结束会议；举手保留）。
- **不改阶段、不自动解除、无定时器、不折算**（发言不产票、票不产发言）。

**C-24 `[MEETING]` 会议分级与"实体定论"写入闸** 见 C-18；相关写入点：`:2128`（决议）、`:2454`（纪要 decision）、`:2362`（resolution 动议）。**唯一判定点** = `truthWriteRefusal`。

**C-25 `[MEETING][OTHER]` 会后/放弃纪要尾巴 `appendMeetingTail`** `:7668-7672`
- `readTextRel('Shared/Meetings/<id>.md')` 不存在则用 `# 会议纪要｜<id>` 兜底，追加 `\n<text>\n`。被硬界放弃、记录人条目、fact_fix、程序异议共用。

### C. 结题判定 / 论文阶段（与本分片交接面）

**C-26 `[CONTROL]` 结题唯一判据 `checkSolved()`** `:7855-7877`
- 条件：`voters()` 非空 **且** `inst().solve` 对**每个**表决者都是 `true` ⇒ 才结题（**没有强制/平票/近似一致收束**）。
- **先跑论文阶段**：`params.finalPaper !== false` 时，无 paper ⇒ `startPaper('run-complete',{})` 并 return true；paper 未 finalized ⇒ 标 `completesRun=true` 并 return true；finalized 才 `finishRun(...)`。⇒ **论文阶段在结题标志之前**，因为 `phase='solved'` 后 `wakeIfIdle`/`startMeeting`/调度全部拒绝。

**C-27 `[VOTE]` 结题票写入 `recordSolveVote(memberId,val)`** `:7878-7890`
- 临时工 ⇒ 直接 return（无票）。**耐久** `putSolve({member,value:val===true})`；**每一票都重新判结题**（迟到票/普通轮带 `vote_solved` 也读）。

**C-28 `[CONTROL]` 结题落盘 `finishRun(reason)`** `:7891-7912`
- `clearHeartbeat()`、`autoDone=true`、`running=false`、`phase='solved'`、`patchInstitute({phase:'solved',lastProgressAt})`；写 `Problems/conclusion.md`（时间/依据/表决者/已确立 Verified/未定论留库附概率）；群聊 `【结题】`；`notifyActivity()`。

**C-29 `[PAPER]` 论文状态机（常量与字段）** `:222-248`、`:7914-8888`、`:11056`、`:11121-11130`
- 常量：`PAPER_MAX_ROUNDS=3`（`:229`）；`PAPER_ENGINE_ORDER.zh=[xelatex,latexmk,pdflatex,lualatex,tectonic]`、`.en=[pdflatex,latexmk,lualatex,tectonic,xelatex]`（`:231-234`）；`PAPER_REPAIR_CORE=[amsmath,amssymb,amsthm,geometry,ctex]`（`:237`）；`PAPER_SECTIONS`＝9 节标题（`:238-248`）。
- `paper` 字段：`id,status('writing'|'reviewing'|'awaiting-editor'|'finalized'),stage,round,trigger,createdAt,updatedAt,participants[],parts{},reviews{},reviewOf{},final,editor,editorNote,completesRun,lang,format,pdf,consult{messages,meetings},lastAskAt{},warnings[],disagreement[],skipped[],artifacts[],forced,forceReason,compile,engine,finalizedAt,forcedAfterCap`（`:8253-8262`、`:8734-8762`）。
- 阶段推进 `paperStep/paperAdvance/paperAwaitEditor/paperPass`（`:8093-8227`）：写作（按 `maxParallel` 预算唤醒、`lastAskAt` 限速 `paperAskEvery()=posMs(activityTimeoutMs,120000)`）→ 互审（环形 `reviewOf[active[i]]=active[(i+1)%n]`，全 `deliverable===true` 才进定稿）→ 未达成：`round<PAPER_MAX_ROUNDS` 则 `round+1` 并记 `disagreement`；到顶 ⇒ `forcedAfterCap` + `warnings` + 转交定稿代表 → `awaiting-editor`（academician 由 `paperAwaitEditor` 唤醒；不在册 ⇒ `editor='office'` + `editorFallback` + warning）→ 定稿代表 `deliverable` ⇒ `finalizePaper`；`revise` ⇒ 若轮次未到顶回到 writing，否则记警告后仍 `finalizePaper('academician-revise-at-cap')`。
- 看门狗：`now - (updatedAt||createdAt) >= recoverStallMs()`（=2×activityTimeoutMs）⇒ 把未交稿者写 `skipped` + `warnings` + `paperLog('看门狗',…)`（按"未参与"处理）。
- 工具：`vibe_v5_paper`（**仅 office**；`lang/format/editor` 仅本次论文一次性覆盖，**不写回参数**；`force` 重写已定稿；自动（run-complete）触发**强制 academician**，因为所办是根会话、无唤醒路径 —— `:8246-8250`、`:11122-11129`）；`vibe_v5_finalize_paper`（仅 office；见 C-30）。
- 免疫/幂等：`refillPaperArtifacts`（只补缺失产物，`:8764-8795`）；`finalizePaper` 可重入、要求产物失败**具名进 warnings**（F6，`:8807-8881`）；编译失败/无引擎时在交付 md/tex 里**幂等**插入说明句（`:8830-8850`）。

**C-30 `[PAPER][CONTROL]` office 定稿咨询门 `finalizePaperByOffice` / `notePaperConsult`** `:8349-8429`
- 前置：paper 存在、`status==='awaiting-editor'`、`editor==='office'`、`decision ∈ {deliverable,revise}`；`deliverable` 时 **`note` 必填**。
- **双计数门**：`consult.messages>0 && consult.meetings>0` 否则 `V5_PAPER_CONSULT_REQUIRED`（消息由 `say` 中 `from==='office'` 计；会议由 `beginMeeting` 中 `by==='office' && auto!==true` 计；**意图不算**）；`force` 重启会把 consult 重置为 `{0,0}`，拒答文案必须点明重置（`:8373-8388`）。
- `revise`：`round<PAPER_MAX_ROUNDS` ⇒ 回 writing 并记 `disagreement`；到顶 ⇒ 记警告后仍定稿（`office-revise-at-cap`）。

**C-31 `[PAPER]` 交付物与编译 `latexEngines/runLatexAttempt/compilePaperTex/finalizePaper`** `:8637-8895`
- 引擎探测：`paperLatexCommand` 显式值**单独使用**（不回落、不拼接 known root，`:8637-8643`、`:8657-8661`）；无 subprocess 服务 ⇒ `not-detected` + 明确 reason；known-root 探测有界（`TEX_CANDIDATE_CAP=40`、`TEX_YEAR_LOOKBACK=4`，`:65-69`）。
- 编译计划 4 步：`full` → `nonstopmode-rerun` → `engine-swap+stripped` → `minimal-template`；每步**两次** subprocess 调用（第二遍解引用/TOC）；`graceMs/超时 = 120000`，超时真 `terminate()`；**已存在 paper.pdf 则不覆盖**（`kept-existing`）。
- 产物：`paper.md` / `paper.tex` / `paper.pdf` / `paper.meta.json`（含 `params` 快照、`consultation`、`parts/reviews/disagreement/warnings/skipped`）/ `paper.log.md`；**交付的 tex 永远是最终生成版**（修复尝试不回写交付）。
- 论文证据源 `paperEvidence/paperSources`：只有**已存在的证据**（verdicts/tasks/formal/members 库/进度）；摘要/引言/结局节由成员原文与耐久状态派生，未决/被否证必显式标注。

### D. 雇佣 / 解雇 / 编制

**C-32 `[HIRE-FIRE]` 雇佣 `hire(callerId,o)`** `:8907-8943`
- 权限：office 全权；在册 active 成员（院士/常驻研究员）；**临时工不能雇人**（`V5_NOT_VOTER`）。`!running||autoDone` ⇒ `V5_INSTITUTE_STATE`。
- 必填 `purpose`（或 `direction`）与 `initial_task`（各缺 ⇒ `V5_INVALID_ARGUMENT`）。
- 上限：`maxTempPerMember` 默认 **3**（下限 1）按 `hiredBy` 计；`maxTempTotal` 默认 **12**（下限 1）按在册临时工计；超 ⇒ `V5_MEMBER_LIMIT`（`scope:'per-member'|'institute'`）。
- 创建：`newMember('temp',{direction:purpose,hiredBy,term,provider:pickProvider()})` → `spawnMember`；失败记 `phase:'failed'` + `failReason:'activation-limit'|'other'`；容量类 ⇒ `ACTIVATION_LIMIT_REACHED` + "已登记为待补建"；其它 ⇒ `V5_PROVISIONING_CONFLICT`。

**C-33 `[HIRE-FIRE]` 解雇 `fire(callerId,o)`** `:8960-9048`
- 权限矩阵：`office || (academician && academicianLeads && target.kind==='temp') || (target.kind==='temp' && target.hiredBy===callerId)`；否则 `V5_MEMBER_NOT_FOUND`（文案给出真实矩阵）。**常驻研究员只能所办解聘**（成员只能提议，`:8985-8987`）。
- 已 dismissed ⇒ 幂等返回（office 会**补做级联**）。
- 真实动作：`releaseTasksOf(id,'dismissed: '+reason)` 收回任务 → **先级联**解雇其临时工（`dismissTempsOf`，一层深，因临时工不能雇人）→ `subagents.interrupt(childId)` + `drainContinuableChildren` → 清 childOwner/inflight/liveAgents/busy → **撤回耐久结题票** `putSolve({member:id,value:null})` → 清 rounds/contextPct/seeds → **从所有 OPEN verdict 的票面删票**（已关闭不动）→ 从 live meeting 全字段删该 id（含撤销 `invited`）→ **丢弃其排队邮件**（ackDelivered）→ `phase:'dismissed', dismissedAt, dismissReason, childId:''` → 写名册镜像 → 群聊 → `markProgress/notifyActivity/scheduleNext`。
- **id 永不复用**；`dismissTempsOf` 对历史状态幂等补做（`:8951-8959`）。

**C-34 `[HIRE-FIRE]` 编制变更 `addResearcher` / `removeResearcher`** `:10844-10872`、`:11107-11120`
- 非 office ⇒ 只提议（同时投 voters 与 OFFICE_INBOX）。office ⇒ `newMember('researcher')` + spawn；容量类/其它错误同 C-32。`vibe_v5_remove_researcher` 工具面**强制** office（此前只写在描述里，任何成员都能解聘常驻 ⇒ 已修，`:11112-11120`）。

**C-35 `[HIRE-FIRE]` 督办 `nudge(callerId,o)`** `:9049-9069`
- 权限：`gateDo(callerId,'nudge')`（office / `academicianLeads` 下的院士 / `nudge` 授权）。目标须 active。`why` 可空（文案 `(未说明)`），`next_step` 可选。
- **署名必须真实**：office ⇒ 「所办督办」，院士 ⇒ 「院士督办」（修复"所办督办被标成院士"）；随后 `wakeIfIdle(target)`。

### E. 调度 / 唤醒 / 延迟补建

**C-36 `[SCHED]` 调度 trampoline `scheduleNext` / `schedulePass`** `:9136-9158`、`:9221-9344`
- `scheduleNext`：`!running||autoDone` 直接返回；已在跑 ⇒ `reschedule=true`（最外层 while 排空，**保证单飞**，使 busy 预算有意义）。
- `schedulePass` 顺序（**注释即契约**，`:9113-9116`）：`loadSettled` 未定 ⇒ `ready()` → `retryPendingSpawns()`（**先花掉释放的容量**）→ `clearHeartbeat()` → `syncParamsFromState()` → ①进行中验证 `continueVerifyRound` ②进行中会议 `continueMeetingRound` ③`armNextVerify`（若在飞则返回）④`pendingMeeting` 立即开 ⑤`paperActive()` ⇒ `paperPass()`（除非在等 office 定稿）⑥(a) 有 in_progress 任务的 owner（**按 idleMs 限速**，`:9272-9281`）(b) 紧急邮件（非 chat）(c) 到期 chat digest（受 budget）(d) **静止提示**（每片段一次，**不 return**，`:9305-9319`）(e) heartbeat：最久空闲成员 —— 有在办任务 ⇒ normalPrompt，否则 checkpointPrompt；**总是 re-arm**。
- 参数：`maxParallel` 默认 **3**；`activityTimeoutMs` 默认 **120000**（>0 否则丢）；`stallAutoMeetingMs` 默认 **360000**（**负值＝关闭静止提示**；唯一允许负值的时长，`:9849-9852`）。
- 宿主接触面：`ctx.timeout`（timer 注入）、`subagents.sendMessage`。

**C-37 `[SCHED]` 心跳/摘要计时器 `armHeartbeat` / `armDigest` / `clearHeartbeat`** `:4250-4276`
- heartbeat 延迟 `posMs(ms, activityTimeoutMs)`；触发时**先 `runLeanQueue()`** 再 `scheduleNext()`；**每次唤醒后必 re-arm**（含失败），否则研究所永久冻结。
- digest 窗口 `posMs(chatDigestMs,45000)`。

**C-38 `[SCHED]` 静止提示（S5/R1/D10）`stallNoticeMs` / `stallWaitingList` / `emitStallNotice`** `:1538-1587`
- 阈值语义 = `stallAutoMeetingMs`（默认 360000，**负值关闭**）；**幂等键 = `sinceAt`(=lastProgressAt)** ⇒ 每片段最多一次且**耐久**（重启不重发）。
- 「谁在等谁」最多 3 条，三类可达：被挡任务、无人认领任务、最久无动作的在册非临时成员（含闲置秒数）。
- **只提示不驱动**：不召集会议、不散会/收束、不推进阶段、不代成员表态；且发送后**必须继续走到 tail**（否则无定时器 ⇒ 冻结，实测教训）。

**C-39 `[SCHED]` G-6 延迟补建 `pendingSpawnMembers` / `retryPendingSpawns` / `isCapRefusedMember`** `:9160-9220`
- 队列**由耐久状态派生**（`phase:'failed'` + `failReason:'activation-limit'`，或 text 兜底 `/active child limit|maxActiveSubagents/`），不是第二份真相；只有尝试计数是会话内存。
- **停止规则**：仅容量类失败自动重试（`spawnMember` 用已记录的 ceiling 直接回答 ⇒ 免费）；**非容量类失败立即停试**并 `notice('office', …)`。
- Test seam（非产品面）：`V5_SPAWN_RETRY=manual` 关闭自动重试；`V5_SPAWN_RETRY_STRICT=1` 只认耐久 `failReason`（`:9182-9187`、`:9193-9196`）。

**C-40 `[SCHED][CONTROL]` 参数同步 `syncParamsFromState`** `:9117-9135`
- 每次 sync 都用 `DEFAULT_PARAMS + normalizeParams(持久化值)` 重建（外来形状不得直通），丢弃键记 diagnostics；同步 `project/institute/phase`，并由持久化 `phase` 反推 `autoDone = (phase==='solved')`（S1：任何视图不得把已结题显示为进行中）。

### F. 回复解析与派发（全部控制通道的唯一入口）

**C-41 `[REPLY]` 回复解析 `parseReply(text)`** `:11556-11578`
- 三级兜底：所有 ```json 围栏（**取最后一个合法对象**）→ 整段 trim 后 JSON → 最外层 `{…}` 跨度。返回 `{}` 表示无。

**C-42 `[REPLY]` 概率归一 `normVerdictNumber`** `:9347-9359`
- 字符串 `'TRUE'/'FALSE'`（大小写无关）⇒ 1/0；否则 `Number` 并 clamp [0,1]；非有限 ⇒ `undefined`（由调用方置 `V5_INVALID_ARGUMENT` notice）。

**C-43 `[REPLY]` 一轮结束唯一驱动 `onMemberEnd(childId, info)`** `:9661-9706`
- 幂等：`inflight.get(childId)` 不存在 ⇒ 直接 return（重放/迟到 end 不重复副作用）；任务类型取**本轮开始时登记**的 `rec.kind`（`wakeKind` 会被后续唤醒覆盖，仅兜底）。
- 流程：`inflight.delete` → `ready()` → `byChild` → `busy.delete` → `blocksToText(lastAssistantMessage)` → `stopReason!=='completed'` ⇒ 群聊 `【异常】` → `parseReply` → `handleReply(member,parsed,turnKind)`（异常只记 console，不打断）→ 完成则清 `pendingWork`，异常则保留并标 `reason:'host-ended',interruptedAt`（S25-B）→ `maybeRealCompact`（尽力）→ 清 wakeKind / `activeMeetingId` → **`paperPass()`（先于调度，因为 paper 由成员回合驱动）**→ `scheduleNext()`。

**C-44 `[REPLY]` 派发 `handleReply(member, parsed, kind)`** `:9364-9660`（**全部通道**，顺序即执行顺序）
1. `say`：字符串 ⇒ 群聊；对象 ⇒ `{to,text}`（`to==='all'` ⇒ chat；`'voters'` ⇒ voters；其它 ⇒ dm）（`:9371-9380`）。
2. `progress` ⇒ `publishProgress`。
3. `record[]` ⇒ `recordCard`（只接受 `proposition|method|subproblem`）。
4. `task_create` / `task_claim`（失败**notice 回执**，任务不存在也 notice）/ `task_update`（失败 notice）/ `task_done`。
5. **Lean 形式化信号**（`formalOn() && p.formal`，支持**数组**逐条）：缺 target / 非对象 ⇒ notice 并跳过；`decision==='blocked'` 需 note（否则 notice）；`'defect'` ⇒ `recordFidelityDefect` + **本回复内该对象布尔票改记弃权**（见 C-45）；`'used'` ⇒ `putFormal(status 保留 passed/blocked 否则 attempted, file 默认 `Formal/<target>.lean`, decision/decisionSource:'member-reply')` + `writeFormalIndex`；其它 decision ⇒ notice 枚举（`:9435-9485`）。
6. `propose_verify` ⇒ `maybeQueueVerify`（失败 notice）。
7. `verdict`：支持 `abstain/弃权/unable/无法判断` 词；数值 clamp；非法 ⇒ notice「本轮的票未被记录」；**L2 option A**：同回复记了该对象 defect 且该成员是**实际表决者** ⇒ `n=0.5`，并写 `formal.fidelity.voteAbstainedByFramework[]`（数组，含 `abstainedCount`）＋ note（`:9493-9535`）。
8. `propose_meeting` ⇒ `startMeeting`（失败 notice）；`convene_meeting` ⇒ **仅院士且 academicianLeads** 时 `startMeeting`（`:9537-9546`）。
9. `assign` / `prioritize` / `nudge` ⇒ 组织工具。
10. `hire` / `fire`。
11. `reject_assign`（需 `memberMayRejectAssign`）⇒ **广播**给 voters（含"任务仍会执行"）（`:9554-9562`）。
12. `vote_solved` ⇒ `recordSolveVote`。
13. `paper_part` / `paper_review` / `paper_final` ⇒ 各自 record（只在对的阶段生效，别的阶段具名拒）。
14. **会议输入**（`kind==='meeting' && meeting`）：见 C-14；`meeting_invite` ⇒ C-15。
15. 会后迟到 `input` ⇒ 补记（C-14 末）。
16. `solved` ⇒ 写 `Shared/State-of-institute.md` 快照（时间/记录者/该成员判断/有表决权的解决票）（`:9650-9659`）。

**C-45 `[REPLY][VOTE]` 忠实性缺陷强制弃权（L2 option A / Adv-verify F1）** `:9456-9531`
- 一条回复内**记录 defect** ⇒ **同一回复内该对象布尔票按弃权(0.5)计**；只影响**声明者本人 + 本轮**（无跨轮状态、不动别的票、不改门）；耐久标记 `formal.<target>.fidelity.voteAbstainedByFramework[]` + `abstainedCount`（旧对象形状折叠兼容）；非表决者（临时工）**不加弃权标记**（其意见本就不计票）。

### G. 工具过滤 / 注册面 / 控制面

**C-46 `[TOOLFILTER]` 工具过滤降级 `startWithToolFilter` / `sanitizeToolFilter` / `registeredToolsFromError`** `:9707-9726`、`:11580-11597`
- `subagents.startContinuable` 抛"未注册工具名"（宿主 `tools.restrict` 会抛）⇒ 从宿主错误文本提取已注册集合（`/known global tools:\s*([^]*)$/`）∩ 原过滤 ⇒ **用全新 spec 重试一次**；若过滤被清空到 `undefined` ⇒ **拒绝在无过滤下启动**并抛原错。防"某成员因 stale 配置永久生不出来"。

**C-47 `[TOOLFILTER]` 成员工具过滤与 persona 冻结 `memberToolFilter` / `memberPersona` / `newMember` / `memberAgentOptions` / `pickProvider`** `:3680-3706`、`:3646-3679`
- 过滤源：临时工用 `tempToolAllow/tempToolDeny`，常驻/院士用 `toolAllow/toolDeny`；**空 allow 不发射**（防 deny-all 陷阱）；`allow`/`deny` 只有至少一侧非空才生成。
- `memberPersona = (staffPersona + '\n\n')? + charterFor(member)`；**charter 在 fold 内 id 分配后立刻冻结**（快照口径，`resume` 重建时不会漂移）。
- `memberAgentOptions`：`provider/model` 非空则透传（空 = 继承 office 路由）。`pickProvider()`：宿主 subagents.list 含 `spawn` → spawn，否则 `fork`，再否则 `spawn`。

**C-48 `[CONTROL]` 参数白名单与归一 `normalizeParams`** `:9762-9880`
- int 键（逐个 `Math.floor(Number)`，有限才收）：`leanJobsMaxParallel, mathTimeoutMs, researcherCount, quorumCap, reconsiderFloor, quotesPerMessageMax, quoteDepthMax, verdictMaxRounds, maxTempPerMember, maxTempTotal, compactThreshold, compactAfterRounds, maxParallel, activityTimeoutMs, stallAutoMeetingMs, meetingHardLimitMs, meetingWakeRetries, chatDigestMs, chatDigestMax, meetingKeepEvery, leanTimeoutMs, motionSecondsRequired, toolCallsPerTurnCap, memoryCeilingMb, maxLiveChildren`。
- bool 键（`coerceBool`，无法识别的拼写 ⇒ **拒绝并取默认**）：`academician, academicianLeads, memberMayRejectAssign, finalPaper, paperCompilePdf, leanAsync, resourceSelfCheck, pointerPropagation`。
- str 键：`feedback, quorumMode, provider, model, staffPersona, formalVerify, leanCommand, paperFormat, paperLanguage, paperEditor, paperLatexCommand, leanInitiative, mathComputation, mathMode, mathInstallScope`。
- arr 键（数组或逗号串）：`toolAllow, toolDeny, tempToolAllow, tempToolDeny, leanArgs, leanSearchPaths, mathEngines, mathPackages`。
- 钳制/降级（**逐条上界**）：`quorumMode` 非法 ⇒ `m-unanimous`；`formalVerify` 非法 ⇒ `off`；`leanCommand` 空 ⇒ `lean`；`leanInitiative` 非法 ⇒ `normal`；`feedback` 非法 ⇒ `on`；`leanJobsMaxParallel<1`⇒1；`activityTimeoutMs/chatDigestMs/leanTimeoutMs ≤0` ⇒ **丢弃**；`stallAutoMeetingMs` 非有限 ⇒ 丢弃（负值保留）；**`meetingHardLimitMs` clamp [300000, 7200000]**；**`meetingWakeRetries` clamp [0,10]**；`leanTimeoutMs ≥1000`；`researcherCount ≥0`；`quorumCap ≥1`；`reconsiderFloor ≥0`；`quotesPerMessageMax ≥1`；`quoteDepthMax ≥1`；`compactThreshold ≤0` ⇒ 丢弃；`chatDigestMax ≥1`；`verdictMaxRounds ≥1`；paper 三个 enum 用 `coercePaperEnum`（别名见 `:11542-11552`）；math 六键交给共享模块 `normalizeMathParams`（`:9826-9837`）。
- **未知键不静默丢失**：补集交 `dropped` 收集器 ⇒ `reportDroppedStateKeys` 写 `diagnostics`（`slice(-50)` 保留）＋ `console.warn`（`:9872-9907`）。
- 注意（注释契约）：新增 int 键必须插在 `leanTimeoutMs` **之前**（`:9764-9767`，prompt-invariants 自检会改动数组尾部）。

**C-49 `[CONTROL]` 参数写入 `setParams` / `visibleParams`** `:9908-10003`
- **域校验（越界具名拒，不靠夹取）**：`toolCallsPerTurnCap/memoryCeilingMb/maxLiveChildren` 必须 **≥0 整数**；`motionSecondsRequired` 必须 **≥1 整数**；否则 `V5_INVALID_ARGUMENT`。
- `adjusted`（逐键 `{from,to}` 报告真实生效变化）＋ `dropped`（未知键）**加性返回**（task-26：否则无法区分"改了"与"被忽略"）；`patchInstitute({params:merged})` 持久化；`params = DEFAULT_PARAMS + merged`。
- 立即生效：数学参数 ⇒ `refreshMathLine()`；运行中 ⇒ `scheduleNext()`（已 arm 的心跳不会自动采用新值）。
- `visibleParams()` 是**显式白名单**（新键不加进去，`/v5 status` 就看不到，`:9989-9991`），含 `m`/`voterCount`/`started` 派生位与 `meetingHardLimitMs/meetingWakeRetries`。

**C-50 `[CONTROL]` 配置 `configure` / `doStart` / `resume` / `setPause` / `initStop`** `:10004-10343`
- `configure`：先 `ready()`（**先读本会话已指向的状态文件**，防整快照 commit 摧毁既有研究所）；运行中拒（`V5_INSTITUTE_STATE`）；`project/institute/problem/params` 可增量；**无参 configure 是真 no-op**（不 commit、不改 phase）；切名到已有成员的另一个所 ⇒ 采纳该文件；已持有研究所且要换名 ⇒ 拒；`phase='idle'` **只在真正 (重)建所时**写（防把已结题写成 idle）；写 `Problems/<id>.md` 与 `State/README.md`。
- `doStart`：`!running&&!autoDone`；已结题（内存或**持久化** `phase==='solved'`）⇒ 具名拒并给两条出路；`phase='founding'`、`runId='run-'+shortId()`；院士**先建**（使其出现在后续每个成员的入职 brief 里）；研究员按 `seedDirections` 或 5 条 `DEFAULT_DIRS`（`:10152-10158`）循环；成员创建前先进 active 名册；**一个都没建成** ⇒ 回到 idle 并给 `ACTIVATION_LIMIT_REACHED`（容量）或 `V5_PROVISIONING_CONFLICT`；成功 ⇒ `running/phase='active'` + 群聊「建所」+ `scheduleNext()`。
- `resume`：`reconcileProvisioning()`（`provisioning` 无 live child ⇒ failed；active 但 child 不在 ⇒ 清 childId）→ 重建缺失成员（seed = `Members/<id>/Progress/progress.md` 末 4000 字符，**计截断**，`mode='resume'` 使其语义为"恢复说明"而非任务）→ 刷新会议/验证看门狗时钟 → `writeRosterMirror/writeTaskboardMirror` → `scheduleNext()` → `paperPass()`（中断的论文续跑）→ `recoverLeanJobs()`。
- `setPause`：清计时器、`running=false`；给每个在役成员写耐久 `pendingWork={childId,objective,interruptedAt,reason:'institute-paused'}`（S25-B 段二：重启后主代理知道"谁还有活没干完"，不退回单干）。
- `initStop`：中断所有成员、清 childId、`meeting=null`/`pendingMeeting=null`、`putSolve({clear:true})`、清 busy/wakeKind/finalizeLock、**所有未关闭 verdict 判 `undecided`（reason `stopped by the office`）**、`phase='idle'`。

**C-51 `[CONTROL]` 状态视图 `status()`** `:10344-10545`
- 返回：`institute/project/key/phase/running/autoDone/runId`、`leanNotices(+Scope 会话内存)`、**`fieldScopes{session[],durable[]}`**（把哪些字段是会话态、哪些耐久**明写**）、`backend`、`diagnostics`、`debug{scheduling,reschedule,rssMb,memoryCeilingMb,toolCallsPerTurnCap}+dbg`、`quorum`、`members[]`（含 `failReason`、`pendingWork`）、`tasks`、`failedMembers(+Note)`、`pendingSpawns(+Note,attempts)`、`chat{pending,delivered,quotes_per_message_max,quote_depth_max}(+chatScope)`、`resolutions{count,latest_id,latest_effective_at,kinds}`、`officeRequests(+Shown/Cap/Dropped/Truncated)`、`persistence{writeFailures,prematureReads,loadSettled,loadProblem,scope,sandboxPolicyMismatch}`、`meeting{…}`（**见 §④**）、`parkedMeeting`、`verify{…minority_count,reconsiderable,last_reconsideration_at,threshold_m}`、`poll{open,question,options,cast,quorum_reached,rules,min_votes_reached,settled,pending,ballot_id,secret}`、`verifyQueue`、`verified/verifiedTrue/concludedFalse/undecided(+Note)`、`solveVotes`、`formal{mode,objects[],passed,blocked,todo}`、`paper`、`lastProgressAt`、`params`。

**C-52 `[CONTROL]` 人类报告 `report()`** `:10546-10840`
- 节：研究所汇报头（项目/阶段/研究对象/求真门槛 m + `rosterVersion`）→ 编制 → 任务板 → 共识（含少数意见/复议记录/不记名只给聚合）→ 群聊/会议（待办所办裁定/进行中会议/暂存会议/决议/上次纪要/行动项/动议）→ 历史会议 + 未收束会议警示 + 待补建成员 → 解决票 → **静止提示节** → **临时授权台账**（可授四命令；不可授清单）→ **投票板节**（六项规则快照 + 两门槛并列 + 未投票者点名 + secret 只给聚合）→ 状态诊断（被跳过事件/状态文件问题/忽略的键）→ Lean → **最终论文** → 文件位置（含沙箱根不一致警示）→ **反馈库**（条目/未闭环/类别/路由；off 时明写）。

**C-53 `[CONTROL]` 工具注册面 `registerTool` / `withOffice` / `withCaller`** `:10928-10976`、`:11036-11046`
- 所有注册包在 `ctx.effect(() => tools.register(...))` 内（preset 卸载即释放；v4 曾漏 disposer ⇒ 二次挂载撞名）。
- 每次执行：`getSession(exec.agent)` → 无 ⇒ `{"ok":false,error:'no session'}` → `await s.ready()` → **S25-D 机器强制单回合工具预算**：`cap>0` 且调用者是成员 ⇒ 计数 `+1`，`used>cap` ⇒ 直接返回 `V5_RESOURCE_BUDGET` 拒绝（**不执行**）；office/root 不受限；异常 ⇒ `{"ok":false,error":…}`（不抛）。
- `withOffice`：只允许**可证明的 session root**（`officeCaller(x)==='office'`），否则 `V5_NOT_OFFICE`（防成员/僵尸子代理以 office 身份 stop/改参）。
- `withCaller`：解析不到调用者 ⇒ `V5_MEMBER_NOT_FOUND` + `next` 提示（不得默认当 office）。

**C-54 `[REGISTER]` 全部工具与命令名（本分片区间）** 见 §③-B 完整清单（含每个工具的参数与拒绝码）。

**C-55 `[OTHER]` 每轮状态块/提示词装配（本分片专章 §⑤ 详述）** `briefBlock` `:3376-3421`、`stateBlock` `:4051-4053`、`initialPrompt` `:4054-4083`、`normalPrompt` `:4084-4106`、`checkpointPrompt` `:4108-4126`、`meetingPrompt` `:4128-4176`、`replySpec` `:3978-4046`、`resourceBlock` `:2069-2085`、`proofStatusBlock` `:2087-2097`、`pointerContractBlock` `:2065-2068`、charter `:3131-3361`。

**C-56 `[OTHER]` 等待原语 `vibe_v5_wait` / `waitForActivity` / `notifyActivity`** `:3424-3466`、`:11142-11151`
- `timeout_ms` 必须整数 [10000, 3600000]（否则 `V5_INVALID_TIMEOUT`）；**一次性、只看未来**的 waiter，由**第一次 committed 状态变化**唤醒（`notifyActivity` 唤醒并清空全部 waiter）；无活跃同伴 ⇒ 立即 `noProgress:{reason:'no-active-peer'}`；abort signal ⇒ `V5_WAIT_ABORTED`。

**C-57 `[OTHER]` 测试 seam `__testHelpers` 与宿主事件接线** `:11443-11597`
- `ctx.on('subagent/start')` 捕获 live child Agent（`WeakRef` 存 `liveAgents`；因为 `subagent/end` 触发时 child 已从 registry 移除，end 时再 get 永远拿不到 ⇒ v4 的真实 compact 曾死代码）。
- `ctx.on('subagent/end')` → `s.onMemberEnd(...)`，catch 时 `s.kick()`（最后防线），finally `forgetAgent`。
- 导出 `__testHelpers = {clamp01, clPct, posMs, blocksToText, fmtTime, idSafe, slugify, tryJson, parseReply, sanitizeToolFilter, registeredToolsFromError, sha256Hex, leanHashText, leanHasSearchFlag, contentFingerprint, headerListContractBlock}`（`:11489-11506`），契约：纯/无状态、不得触 `ctx`/session 状态。
- 宿主注入声明：`export const inject = ['subagents','agents','fs','tools','commands','timer']`（`:181`）。
- 状态载体纪律（`:11437-11441` + `:448-459` 注释）：**权威状态只在 `State/<institute>.v5state.json`**；宿主会话日志**一字不写**（写了会让会话因未知事件类型无法 resume）。

---

## ③ 专章：会议系统全清单（目标 2 的直接判据）

### ③-A 生命周期与状态机（逐阶段）

| 阶段 | 触发/入口 | 具体逻辑 | file:line |
|---|---|---|---|
| 提议 | `vibe_v5_meeting`（非召集人） | `say(caller,{to:'voters',kind:'voters',text:'提议开会：「agenda」（kind）'})` + `say(caller,{to:OFFICE_INBOX,kind:'office-request',…})`；返回 `{ok:true,proposed:true}` | `:7402-7416` |
| 暂存（parked） | `startMeeting` | 条件 `meeting || hasVerifyInFlight() || inFounding`（创始期＝有非临时成员 `rounds===0` 且无 direction）；`pendingMeeting={agenda,kind,target,by,at}` **首胜不覆盖**；返回 `{ok:true,parked:true}`；消费点：`schedulePass` ④ 与 `finalizeMeeting` 尾（`!autoDone && pendingMeeting && !hasVerifyInFlight()`） | `:7421-7427`、`:9245-9250`、`:7844-7850` |
| 召开 | `beginMeeting` | 洗牌发言顺序 → fold 内分配 `mt-N` → 建 `meeting` 对象（18 个状态位）→ 耐久 `meetingOpen` → `putSolve({clear:true})` → 群聊行 → 开场提示（程序性点名→上次纪要确认）→ office 召开计 `notePaperConsult('meeting')` → `mkdirs` → 写纪要头 → `askMeetingRound()` | `:7453-7535` |
| 阶段一 round-robin | `askMeetingRound` | 每位常驻表决者获得**一次**"要不要发言"的机会；`retries` 记尝试数；`asked/silent/unreached` 三态填机会位 | `:7553-7589` |
| 阶段切换 | `askMeetingRound` | `roster` 全员都有机会（发言/沉默/未送达任一）⇒ `phase='open-floor'` + 广播；**无计时器** | `:7604-7612` |
| 阶段二 open-floor | `askMeetingRound` | ① 举手者（含已发言者，多轮）② 受邀临时工（各一次，`askedOnce`） | `:7590-7603` |
| 冻结（表决期） | `speechFrozen()` | 存在 open 投票板 ⇒ 不推进发言轮、成员发言入口被拦（举手保留、票照记、chair 豁免） | `:2878-2896`、`:7636-7638` |
| 收束 | `continueMeetingRound` | 四类判据（未轮到 / 在飞 / 空闲未答且重试未尽 / 有人举手）全空 ⇒ 诚实化 `unreached` ⇒ `finalizeMeeting` | `:7639-7666` |
| 硬界放弃 | `continueMeetingRound` | `elapsed >= hardLimitMs` ⇒ 写全明细 + 群聊 + `scheduleNext`；**不判结论** | `:7624-7635` |
| 汇编纪要 | `finalizeMeeting` | 发言区（+`speechZone`）→ 投票区（+`voteZone`）→ 记录人补充（等级/责任人/条目）→ `meetingMinutesTail`（机会/举手/受邀/表决块）→ 结构化 `commit(EV.meeting,{minutes})` → 清 `meetingOpen` → 失效 `grantScope='meeting'` 的授权 | `:7747-7838` |
| 收束后 | `finalizeMeeting` | 群聊「结束。已解决票 x/y」→ `markProgress` → `checkSolved` → parked 会议续开 → `scheduleNext` | `:7839-7851` |
| 会后补记 | `handleReply` | 无 live meeting 但有 `lastMeetingId` 且 reply 带 `input` ⇒ `### <id>（会后补记…）`，按文本去重 | `:9635-9649` |
| 复议（对象/板） | `vibe_v5_reconsider` | 已收束结论的救济；门槛**只升不降** | `:2742-2868` |

### ③-B 全部命令与工具名（工具面逐条：参数 · 权限 · 关键拒绝码 · file:line）

`σ` = `vibe_v5_` 前缀。**注册面**（`:10928-11179`、`:11280-11327`）；**斜杠命令**（`:11330-11435`）。

**生命周期/参数（office=可证明 session root）**
1. `σconfigure {project?,institute?,problem?,params?}` office；`:11049`
2. `σstart {problem?,researcherCount?,academician?,params?,seedDirections?}` office；`:11050`
3. `σresume {}` office；`:11051`
4. `σpause {}` office；`:11052`
5. `σstop {}` office；`:11053`
6. `σstatus {}` 任何；`:11054`
7. `σreport {}` 任何；`:11055`
8. `σset {…白名单键}` office；`:11056`+`:11057-11076`（描述里含完整参数语义；enum 显式列出）
9. `σmessage {to,content}`（两者必填）**仅 office**；`:11077-11088`
10. `σmembers {}`；`:11096`

**会议（§③-C/D 为逐项规则）**
11. `σmeeting {agenda(必填),kind∈{sync,division,verify-request,solve-vote},target?,formal_agenda?}`；office/院士可直接开，其它成员只提议；已开会期只给 `formal_agenda` ⇒ 改等级；`:11089-11095`
12. `σsay {text(必填),to?,quote_ref?,quote_refs?,quote_excerpt?,supplement_of?,why?}` 成员；表决期过 `speechGate`；`:11133-11141`
13. `σverdict {target?,verdict(必填),reason?}` 成员；接受 `[0,1]`／`abstain|弃权`／`unable|无法判断`；`:11174`
14. `σpropose_verify {target(必填),kind?,reason?}`（**S25-C：仅院士可发起**，`withCaller`）；`:11158`
15. `σend_verify {target?,reason?,op?,status?}` 仅院士；`op='formal_proof'`+`status∈{proved,disproved}` ⇒ 登记并 `locked`；`:11175`
16. `σpoll_open {question(必填),options(必填,≥2),mode∈{single,multi},max?,min?,min_votes(必填),minVotes?,secret?,allow_abstain?,allow_revote?}` 仅院士/所办，不可授；`:11164`
17. `σpoll_vote {ballot_id?,ballotId?,choices?,abstain?,note?,reason?}` 有票者；`:11165`
18. `σpoll_close {ballot_id?,ballotId?,reason?}` 仅院士/所办，不可授；`:11166`
19. `σminutes {op?,of?,fact_fix?,entry?,text?,detail?,agenda_item?}` 院士/当次记录人；`:11171`
20. `σresult_record {text(必填),actions?[{who,due_in?}],target?,kind∈{resolution,solve,org,procedure},retroactive?,op?,of?,by?,why?}` 院士/当次记录人；**仅正式会议**；`:11172`
21. `σresolutions {id?,target?,meetingId?,kind?,limit?}` 任何（只读，limit 1-50 默认 10）；`:11173`
22. `σmotion {op?,motion_id?,kind∈{topic,procedural,resolution},text?,reason?}` 成员（会议内）；`:11169`
23. `σsecond {motion_id(必填)}` 成员（非提出者）；`:11170`
24. `σreconsider {target?,target_id?,why(必填),evidence?}` 参与者；`:11167`
25. `σsecretary {who(必填),member?,why?,revoke?,op?}` 仅院士；`:11168`
26. `σprocedural_objection {why(必填)}` 成员（会议内）；`:11161`
27. `σchair_proxy {member,scope('close'),why}` 仅院士；`:11160`
28. `σgrant {to,command∈{assign,prioritize,nudge,convene},grant_scope|grantScope∈{meeting,verify,once},why}` 仅院士；`:11162`
29. `σrevoke {grant_id?,to?,command?,why(必填)}` 仅院士；`:11163`
30. `σself_report {overall?,subgoal?,plan?,status?,reason?,source?}` 在册成员（只读调用 = 查看并留痕）；`:11159`+`:7196-7223`
31. `σwait {timeout_ms?,reason?}` 成员；`:11142-11151`
32. `σoverview {}`（描述写 academician；注册面无权限门，成员调用只会得到全所视图文本）；`:11182-11279`
33. `σassign {to(必填),why(必填),acceptance(必填),task_id?,subject?,description?,priority?,write_scopes?,due_in?,origin?}`（office / `academicianLeads` 下院士 / `assign` 授权）；`:11280`
34. `σprioritize {order[],why?}`（同上权限）；`:11281`
35. `σnudge {to(必填),why(必填),next_step?}`；`:11282`
36. `σhire {purpose(必填),initial_task(必填),direction?,term?,to?}`；`:11097-11101`
37. `σfire {id(必填),reason?}`；`:11102-11106`
38. `σadd_researcher {direction?}` office；`:11107-11111`
39. `σremove_researcher {id(必填)}` **仅 office（机器强制）**；`:11116-11120`
40. `σpaper {lang?,format?,editor?,force?,reason?}` **仅 office**；`:11122-11129`
41. `σfinalize_paper {decision(必填),note?,conclusion?,force?}` **仅 office**；`:11130`
42. `σtask_create / σtask_list / σtask_get / σtask_update`（CAS：`task_id+expected_revision+action∈{claim,release,edit,set_dependencies,complete,reopen,reassign,delete}`）；`:11176-11179`
43. `σrecord_progress {content(必填),track?}`（track ∈ narrative(默认)/route/obstacle/rejected/state）；`:11152`
44. `σrecord_proposition {statement,value,motive,p 全必填,id?,title?}`；`:11153`
45. `σrecord_method {content,value,motive,p 必填,id?,title?,type?,notation?}`；`:11155`
46. `σrecord_subproblem {statement,value,motive,p 必填}`；`:11156`
47. `σread_library {member?,kind?,id?,list?,limit?}`（`list:true` 只给头部行＋指纹；`id` 不存在**具名拒**）；`:11157`
48. `σfeedback {op(必填),id?,category?,route?,context?,phenomenon?,impact?,action?,assessment?,outcome?,status?,note?,all?}`；`:11154`
49. `σlean_run {file(必填),target?,timeout_ms?}`；`:11289`
50. `σlean_archive {kind∈{def,lemma,proof,blocked}(必填),name?,target?,content?,from?,note?,run?}`；`:11290`
51. `σlean_lib {refresh?}`；`:11291-11319`
52. `σlean_read {name(必填),kind∈{auto,lib,proved}}`；`:11323`
53. `σlean_job {jobId?,waitMs?}`；`:11327`
54. `math_computation {…}`（共享模块面：`op∈{probe,run,receipt,install}`、`engine`、`mode∈{code,file,expr}`…）；`:11021-11024`、`:10978-11020`

**斜杠命令 `/v5`** `:11330-11435`（**仅可证明 office**，否则 `V5_NOT_OFFICE`；业务失败返回 `kind:'error'`）
- 子命令：`configure <研究所名> <问题…>` / `start` / `resume` / `pause` / `stop` / `status` / `report` / `members` / `message <收件人|all> <正文…>` / `meeting <议程…>`（**固定 `kind:'sync'`，`:11363`**）/ `hire <用途> <初始任务…>`（**两者必填**，缺 ⇒ `V5_INVALID_ARGUMENT`，`:11367-11376`）/ `fire <id> [理由…]` / `add [方向…]` / `remove <id>` / `set <键>=<值> …`（无 `=` 的 token ⇒ 具名拒；空 ⇒ 具名拒；`:11402-11427`）/ `paper [lang=zh|en] [format=both|md|tex] [editor=office|academician] [force]`（未知选项/非法值 ⇒ `V5_INVALID_ARGUMENT`；`:11381-11401`）。

### ③-C 逐项规则与**可调参数＋上下界**（会议系统）

**（1）召集（convoke）**
- 直接召开：office（`isOffice`，即 session root）或 `academician && academicianLeads`，或持 `convene` 授权（`:1640`、`:7402`）。
- 提议：其余成员 → voters + OFFICE_INBOX 双投（`:7410-7416`）。
- 拒绝码：`V5_INVALID_ARGUMENT`(无 agenda)、`V5_INSTITUTE_STATE`(已结题/未运行)、`V5_MEMBER_NOT_FOUND`/`V5_NOT_OFFICE`（工具面解析不到调用者）。
- 参数：`academicianLeads`（bool，默认 **true**，`:1065`）；`GRANTABLE_COMMANDS=['assign','prioritize','nudge','convene']`，`GRANT_SCOPES=['meeting','verify','once']`（`:1595-1596`）。

**（2）议程（agenda）**
- 自由文本，**必填非空**；写入纪要头 `- 议程:` 与 `meeting.agenda`。
- `kind` 决定等级（见（8））；`target` 用于 verify-request/solve-vote。

**（3）轮次（round）**
- 阶段一每位常驻表决者一次机会；阶段二举手可多轮（`spokeCount` 计次，纪要「第 n 次发言」）。
- 并发预算 `budget = max(1, floor(params.maxParallel || 3))`（`:7553`）——`maxParallel` 默认 **3**（下限 1，`:9819-9820` 仅对 lean 有显式下限；`maxParallel` 无下限保护但用 `max(1,…)`）。
- **`meetingWakeRetries` 默认 5，钳制 [0,10]（整数）**；语义 N ⇒ 共 N+1 次尝试；耗尽 ⇒ `unreached`（`:7445-7448`、`:7554-7583`、`:9855`）。

**（4）举手（raise hand）**
- `meeting_hand:true` 登记 `hands[id]`（可含已发言者，撤回用 `false`）；举手不被"交付发言"清除当且仅当本轮**之前**已举手（`pendingHand` 语义）。
- **举手是收束判据之一**（`handsUp.length` 非空 ⇒ 继续问），`:7647-7648`。

**（5）发言情境（三种位 + 两种拒绝）**
- 发言位：`inputs`(最近一次)/`speeches[]`(全部)/`spokeCount`；机会位：`asked`/`silent`/`unreached`；票位：`solve`（**互不继承**）。
- 邀请临时工：只记纪要＋广播、不计票、不进机会位、不阻塞收束（`:7673-7696`）。
- 表决期冻结：见 §③-D。
- 会后补记：见（11）。

**（6）纪要（minutes）**
- 结构（渲染）：`# 会议纪要｜mt-N｜<所名>` + 头部 6 行 + `## 发言区`（逐人 `### <id>`）＋`## 投票区`（逐板一行）＋`## 记录人补充`（等级/责任人/条目）＋`## 发言机会（征询）`＋`## 举手记录`＋`## 受邀临时工（只记纪要，不计票）`＋`## 表决`（真/假/未表态三态 + 结论）＋（放弃时）⚠ 行；
- 结构化双份：`commit(EV.meeting,{index:{id},minutes:{at,speechZone,voteZone,secretary,entries,level}})`。
- 参数：`SECRETARY_ENTRY_MAX=1000`（条目/事实更正上限）；`RESOLUTION_TEXT_MAX=1000`（决议文本上限）；motion `text ≤2000`；`RESOLUTION_KINDS=['resolution','solve','org','procedure']`。
- 只增不改的硬约束：绝不重写 `### <who>`/两区/异议；不自动补全缺口（R7）。

**（7）收束（closing）与法定数、门槛**
- 会议收束条件**与票无关**：只看机会位＋举手/在飞（`:7639-7652`）。
- **会议没有法定人数门槛**；法定数 m 只用于**验证/结题**：`m = max(1, min(quorumCap, voterCount()))`（`quorumMFrom`，`:2903-2907`）；`quorumCap` 默认 **3**（下限 1，`:9858`）；`quorumMode ∈ {m-unanimous(默认), all-unanimous}`（非法 ⇒ `m-unanimous`，`:9794`）。
- 投票板有**两个并列门槛**（K13）：`minVotes`（本板是否成立）与 `m`（结题门）；`minVotes` **必填、无默认**，且 `minVotes ≤ voterCount()`（`:1845-1852`）。

**（8）会议分级（S12/D7）**
- 派生 `formal`：`verify-request`/`solve-vote`；`light`：`sync`/`division`；院士 `formal_agenda:true` 显式覆盖（建会或会期内）。
- `light` 硬闸：`truthWriteRefusal` 具名拒（决议 / 纪要 `decision` 条目 / resolution 动议 / 任何"实体定论"）。**等级当次会议绑定**。**无自动升降级、无定时器**。

**（9）复议（reconsideration，S9/D5/D5a/U3）**
- 对象：已 `closed` 的 verdict（否则 `V5_INVALID_ARGUMENT`）或已 `closed` 的投票板（`ballot:<id>`/`ballot_id`；未截止 ⇒ 拒）。
- 资格**由记录派生**：有胜方 ⇒ 仅**当初胜方之一**（prob 必须 === 目标布尔值）；无胜方 ⇒ **任一参与者**，不得以"无胜方"拒收；板复议 ⇒ 仅该板参与者。非参与者 ⇒ `V5_NOT_VOTER`。
- 门槛**只升不降**：`after = max(before, reconsiderFloor, quorumCap)`；`reconsiderFloor` 默认 **0**（下限 0，`:9860`）。
- 频次：**每轮只受理一次**（同轮再提 ⇒ 拒）；`round >= verdictMaxRounds`（默认 **3**，下限 1，`:9871`）⇒ 拒"不得无限复算"；板**每板只受理一次**。
- 效果：旧结论/旧票面/旧少数意见**全部 append 留档**（`previousRounds[]`、板 `priorResult`），旧结论标 `supersededBy`；新轮 `votes={}`、`sealed:false`、`closed:false`、`threshold={m:after,floor}`；板重新 `phase:'open'`。**不产生新票权、不改分母、不改阶段、无定时器**。

**（10）硬界钳制（clamp）与超时（timeout）**
- `meetingHardLimitMs`：默认 **1800000ms（30min）**，**钳制 [300000, 7200000]（5min–2h）**，`Math.floor`；`normalizeParams`（`:9854`）与读取点（`:7441-7444`）**双处钳制**；会议开始时快照进 `meeting.hardLimitMs`；**不提供无界**（0/∞ 无特殊语义）。
- `meetingWakeRetries`：默认 **5**，**钳制 [0,10]**（`:7445-7448`、`:9855`）。
- `verdictMaxRounds`：默认 **3**，下限 **1**（`:9871`）。
- 看门狗（会议以外）：`recoverStallMs()=2×activityTimeoutMs`（论文阶段用）；`activityTimeoutMs` 默认 **120000**，必须 >0（否则被丢弃）。
- 静止提示 `stallAutoMeetingMs`：默认 **360000**，**负值＝关闭**（0 会落回默认，故不能用 0 关闭）。
- 摘要窗口 `chatDigestMs` 默认 **45000**（>0）；`chatDigestMax` 默认 **12**（≥1）。
- **会议内所有"时间"字段均由框架写**：任何 `…At/…Ms`（大小写不敏感，含 `expires_at`/`subgoal_at`/`due_at`）在 `poll_open/poll_vote/poll_close/result_record/minutes/secretary/motion/second/reconsider/grant/revoke/say/self_report` 中**一律具名拒**；期限只用**相对** `due_in`（如 `next-meeting`）。

### ③-D 表决期禁言（时序分离，S8/R3/K12/B9）
- 派生：`openBallot()` 存在 ⇒ `{frozen:true,ballotId,since,question}`（`:2878-2883`）。
- 门在**成员发言入口**（`vibe_v5_say` → `speechGate`；会议唤醒的 `input/say/summary` 交付）⇒ 非院士/非所办且 `text` 非空 ⇒ 拒（`:9597-9609`、`:11136-11140`）。
- 被拒发言处理：`history what:'speech-refused-frozen'` + 幂等 `silent[id]` + `what:'silent-after-refusal'` + 群聊行；**不写 inputs/speeches/spokeCount**；**举手保留**（解冻后按原顺序放行）；**票照记**。
- 解除**只能**院士显式 `σpoll_close` 或结束会议；无定时器、不自动解除、不折算。

### ③-E 会议相关的持久化与恢复
- 耐久：`Shared/Meetings/<id>.md`（纪要，追加式）；`inst().meetings[]`（索引 + `minutes{}` 结构化）；`inst().meetingOpen`（未收束标记，`beginMeeting` 置、`finalizeMeeting` 清 —— 崩溃/重启后 `report()` 明示"有 1 场会议未收束…纪要可能缺失"，`:10676-10681`）；`inst().solve`（结题票）；`inst().ballots[]`；`inst().resolutions[]`；`inst().motions[]`；`inst().minutesConfirmations[]`；`inst().secretaries[]`；`inst().grants[]`；`inst().chatSupplements[]`。
- 进程内（重启即失）：`meeting` 对象本体、`pendingMeeting`、`finalizeLock`、`hands/asked/...` 都在对象里随 `meeting` 存亡；`resume()` 只把 `meeting.lastInputAt` 刷新（`:10273-10275`）——**不重建已失的会议发言态**（`report()` 会明示纪要可能缺失）。
- `initStop()`：`meeting=null; pendingMeeting=null; putSolve({clear:true})`；所有未关闭 verdict 判 `undecided`（`:10313-10343`）。

---

## ④ 专章：群聊与状态面板（目标 2 的直接判据）

### ④-A 群聊消息字段（**代码权威口径**）
- **消息对象**（`say` 写入，`:3557-3561`）：`{ id:'msg-N', from, to, kind, text, at, quote?, quotes?, supplementOf? }`。
  - `id`：fold 内分配、全局单调 `msg-N`（`:3551-3563`）。
  - `from`：成员 id、`'office'`、或框架 `'framework'`（notice）。
  - `to`：成员 id / `'all'`（落库时展开为**每收件人一条**，故 `inst().messages` 里看不到 `'all'`）/ `'voters'` / `OFFICE_INBOX`。
  - `kind ∈ {chat,dm,voters,office,meeting,verify,assign,nudge,notice}`（`:3599-3613`）。
  - `at`：框架时间戳（毫秒）；**没有回复目标/回复链字段** —— 回复关系只用引用（`quote.ref`）表达；**没有"发言次数限制"字段**。
  - `quote/quotes`：`{ref,from,at,kind,domain,excerpt,truncated,depth,collapsed,cycle,rootRef,secretAggregateOnly,viaSupplement,supersededBy}`（`:2662-2671`）。
- **"管理员 / 禁言 / 发言次数限制"在 v5r 代码中不存在**：全文件 grep `禁言|发言次数|管理员|admin|mute` 仅命中 `:9596` 注释；唯一的"禁言"是**表决期冻结**（§③-D），唯一的"发言计数"是会议内 `spokeCount`（纪要展示用，**不设上限**）。职务权限由**权限表**（office / academician / secretary / `canDo`）承担，不是"群管理员"角色。
- **封顶账本**：`inst().delivered` 只保留最近 `DELIVERED_CAP=500` 条 ack；`pending = messages`（未 ack），`delivered = 封顶账本`（`:484`、`:1152-1155`、`:10404-10410`）。**已投递消息正文不再保留** ⇒ `msg-<N>` 引用悬空（具名拒）。
- **群聊镜像**：`Shared/Chat/<YYYY-MM-DD>.md`（人读；`- HH:MM:SS｜text`；`saveChatLine` 串行写）。

### ④-B 消息的读写路径
| 动作 | 路径/函数 | file:line |
|---|---|---|
| 生产 | `say()` → `putMessageMake(alloc)` → `EV.message` fold | `:3531-3574` |
| 待投递读取 | `pendingFor(memberId)`（`inst().messages` 中 `to===id`） | `:3588-3598` |
| 何时投 | `deliveryDecision`（非 chat 立即；纯 chat 按 `chatDigestMax`/`chatDigestMs`） | `:3617-3627` |
| 注入提示 | `promptFor` 前置 `[新到的消息…]` + 期间 `inboxSuppressed` 抑制 `briefBlock` 重复 | `:3415-3419`、`:9078-9110` |
| ack | `wakeWithInbox` 在**发送成功后** `ackPending` → `ackDelivered`（清 `messages`、进 `delivered`） | `:9099-9110`、`:3628-3631` |
| 所办读取 | `status().officeRequests`（cap 10 + Dropped/Truncated）、`report()` 节 | `:10419-10428`、`:10607-10615` |

### ④-C 状态面板（成员总目标 / 计划 / 正在执行的子任务）
**面板实体 = `SelfReport.json`（每成员一个文件，非集中式"板"）** `:7069-7223`
- 读写路径：`Members/<id>/SelfReport.json`（**原子写**：写 `<file>.<pid>.tmp` 后 `renameSync`，`:7086-7092`）；查看审计 `Shared/SelfReportViewAudit.json`（**cap 200**，`SELF_VIEW_AUDIT_CAP=200`）。
- 数据形状（`selfReportRow`，`:7104-7116`）：
  `{ member, kind, voting, overall, overallAt, subgoal, subgoalAt, plan[], planAt, status, updatedAt, updatedBy, deviation, deviationLabel }`
  文件内另有 `history[]`（逐字段 `{at,by,field,old,next,reason,source}`）、`overallBy`、`deviation{keptValue/keptAt/keptBy}`。
- 字段语义：`overall`＝**总目标**（只有院士可替他人设定）；`subgoal`＝当前子目标；`plan`（**字符串数组**）＝计划；`status`＝状态文本 —— **"正在执行的子任务"没有独立字段**，由 `plan[]`＋`status`＋任务板（`σtask_list` 中 `in_progress` 且 `ownerId` 命中）共同表达。
- 写入规则（`selfReportTool`，`:7196-7223`）：**在册成员**（院士/常驻研究员）只能改自己；**列席/受邀/临时工不可写**（`V5_NOT_VOTER`），但**可读**（工作状态全所可读）；**他人自述仅院士可设 `overall` 一项**（否则 `V5_INVALID_ARGUMENT`）；**任何 `…At/…Ms`（大小写不敏感）具名拒**（时间由框架写）；同值 ⇒ `deduped:true` 且**不追加历史**；改 `overall` 时若原作者≠调用者 ⇒ 记 `deviation`（**保留院士原值与旧时间，可取回**）+ 群聊警示。
- 查看面（`selfReportView`，`:7118-7130`）：`roster[]`（在册全列）+ `nonVoting[]`（列席/受邀/临时工**单列并标注**）+ `viewAuditTail`（最近 20）；**私聊内容永不进入**。
- `status()` 里**没有** self-report 节；`report()` 也**没有**；只有 `σself_report`（无参＝读取）与 `σoverview`（不含自述）暴露它。⇒ **若目标 2 要"状态面板"，v5r 的等价物是这两条路径 + `Members/<id>/Progress/progress.md`**。

### ④-D `status()` 的 `meeting` 子对象（只读面，逐字段）`:10437-10488`
`{ id, agenda, kind, phase, hardLimitMs, elapsedMs, roster[], order[], asked[], silent[], unreached[], hands[], attempts{}(=retries), invited[], spoke[], spokeCount{}, secretary, record_entry_count, level, speech_frozen, frozen_by, minutes_confirmation{of,confirmed,at,by,fact_fix}, action_items{total,open,handover,overdue}, motions{count,latest_id,pending,carried,needed} }`
- 另有顶层 `parkedMeeting{agenda,kind}`、`poll{…}`、`verify{…}`、`verifyQueue[]`、`solveVotes[]`。
- 口诀（代码注释即口径）：**机会位/举手决定能否收束；发言位只描述谁说了话；票位在 `solve`（互不继承）**（`:10435-10436`）。

---

## ⑤ 专章：主代理（academician）角色（目标 6 的直接判据）

### ⑤-A 人设（charter，入职冻结）
- **装配式**：`memberPersona(member) = (params.staffPersona ? staffPersona+'\n\n' : '') + charterFor(member)`（`:3676-3679`），并在 `newMember` 的 fold 内（id 分配后**立刻**）写入 `member.persona`（`:3669-3673`）——**冻结快照**，`staffPersona` 事后修改不影响老成员；`resume` 重建会话时用的还是这份 persona。
- **charter 结构**（`charterFor`，`:3131-3361`）：开头（身份：院士/常驻研究员/临时工；写入原问题陈述；临时工写任务期）→ 分工声明 → `【一、所内编制与你的同事】`（含**入职时名册快照** `rosterLine`）→ `【二、通用规章（全员必读）】`（1–10 条，含 **7. 主动向院士汇报**；**8/9/10 三条 S25-C 硬规章**：辩论对象由院士定、只有"已正式证明/证伪且 locked"的命题才可入辩、"正式证明或证伪"只可在确信时登记且登记即定稿）→ `【三、资料库/progress/卡片格式】`（`LIB_SPEC`）→ `【四、组织与协调】`（**院士＝`ACAD_ORG`**，`：3106-3129`；其它成员＝`orgCommon()`）→ `【重要】分派不改变求真规则` → `【五、表决与定论（求真门槛）】`（m 票布尔一致；两段式：独立初评→公开辩论；诚实条款"永远不要为了让流程往前走而投出你不相信的 1 或 0"）→ `【六、每轮做什么】`→ `【七、雇佣与解雇】`→ `【八、任务板】`→ `【九、上下文与纪律】`→ `【十、停止】`（当且仅当全体表决者一致认为原问题已解决才停止）。
- **`ACAD_ORG`（院士专章）七项职责**：① 全所视图（`σoverview`）② 拆解+分派（`σassign`，含理由与验收标准）③ 优先级（`σprioritize`）④ 主持会议 ⑤ 督导（`σnudge`，要给具体下一步/配对建议）⑥ 资源调配（临时工、向所办建议增删常驻）⑦ 对外代表。**四条边界**：一票等重（无加权/无否决）、分派的是工作不是结论、成员有权据理反对（理据优先于职位）、不能自我扩张编制。
- **主代理不是"助手"的机器证据**：office 在 `agent.cordis.yml:74-86` 被定义为**外部接口（HANDS-OFF）**：不研究、不投票、无库；`vibe_v5_message` 强制 `caller==='office'`（`:11083-11085`）；自动汇报/统筹职责全部落在院士人设与 `σoverview/σassign/σprioritize/σnudge` 工具上。

### ⑤-B 提示词装配（逐轮）
- **每轮只带 volatile 内容，charter 不重注入**（`:3973-3977`）。
- `briefBlock(member, roundNo)`（＝`stateBlock`，`:3376-3421`）：`[状态]`（身份/轮次/`m`/表决者数）→ `[在册]`（active id 列表）→ `[未就位]`（非 active 非 dismissed，**让 provisioning 失败可见**）→ `[形式化]`（运行时读取，非冻结）→ 已结算 Lean 公告（**恰好一次**，`takeLeanNoticesFor`）→ `[任务板]`（进行中/可认领/我负责）→ `▸ 我的任务`（含验收/分派人/描述首行）→ `[新到的消息/通知]`（若 `inboxSuppressed` 则省略，避免重复）。
- 各提示词：`initialPrompt(入职/重建, mode='resume')`、`normalPrompt`（普通研究轮；院士额外段"统筹全所"）、`checkpointPrompt`（心跳：继续推进、别停在原地）、`meetingPrompt`（议程/受邀说明/他人已发意见/发言模型说明/举手与投票规则/`proofStatusBlock`）、`verifyPrompt`。
- 注入片段（按开关）：`pointerContractBlock()`（S21，`pointerPropagation` 默认 true；false ⇒ **零注入**）、`resourceBlock()`（S25-A，`resourceSelfCheck` 默认 false；含 `maxParallel`/`toolCallsPerTurnCap`/`memoryCeilingMb`）、`proofStatusBlock()`、`mathPushLine/paperPushLine/feedbackPushLine`。
- 回复契约 `replySpec(kind)`（`:3978-4046`）：逐 kind 差异（`kind==='temp'` 不给 `verdict`/`hire`/`fire`；`kind==='academician'` 给 `convene_meeting/assign/prioritize/nudge`）；`formalOn()` 时才出现 `formal` 字段；末尾给**最小合法 JSON 样例**（修复"只许输出 JSON"与"字段目录不是 JSON"的矛盾）。
- **压缩指令**：`compactThreshold`（默认 **66**，≤0 丢弃）或 `compactAfterRounds`（默认 **8**）触发软压缩提示 `[CONTEXT COMPACT …]`；真实压缩走 `maybeRealCompact`（优先 `compactNow`，否则 `compactIfNeeded(agent,'pressure')`）（`:3896-3931`、`:9728-9749`）。

### ⑤-C 自动汇报
- **人设层**：`【二·7】主动向院士汇报` / 无院士时 `主动在群聊里汇报`；`【六·③④】`每轮决定是否发言；`agent.cordis.yml` 的 office persona 要求"用户问进度就 `vibe_v5_report` 并平实总结"（`agent.cordis.yml:294-295`）。
- **机器层（等价物）**：`σrecord_progress` → `Members/<id>/Progress/{progress,routes,obstacles,rejected,state}.md`；`σoverview` 给院士**全所 Progress 尾 1200 字符/人 + 任务板 + 行动项 + 停滞提示**；`σself_report` 给结构化"总目标/子目标/计划/状态"；`status()/report()` 给计数与视图。
- **没有**独立的"定时自动汇报"任务/心跳汇报消息（汇报依赖成员回合里的 `progress/say` 与院士主动 `σoverview`）。

### ⑤-D 参数配置入口（谁能改、改什么、落到哪）
- 人：**office（session root）** —— `σconfigure`（`project/institute/problem/params`）、`σset`、`/v5 set <k>=<v>`、`/v5 configure`；成员**不能**改参数（`withOffice` 拒 `V5_NOT_OFFICE`）。
- 落盘：`State/<institute>.v5state.json` 的 `params`（`patchInstitute({params:merged})`），重启后 `syncParamsFromState` 重建。
- 运行时立即生效：`setParams` 末尾 `scheduleNext()`（数学参数额外 `refreshMathLine()`）。
- 可见性：`/v5 status` 的 `params` = `visibleParams()` **显式白名单**；`σset` 返回 `adjusted`（真实变化）与 `dropped`（被忽略的未知键）。
- 院士**可调**的只有工具面内的组织动作与会议分级/记录人/授权等；**不能**改参数、不能改票权。

---

## ⑥ 专章：框架能力需求清单（若要在一个通用框架里实现同样的所，需要什么原语）

| # | v5r 用到的能力 | 需要框架提供的原语 |
|---|---|---|
| 1 | 成员=**常驻子代理**（可被反复唤醒、可被中断、可被释放） | `subagents.startContinuable(spec)` / `sendMessage(root, childId, blocks, {signal})` / `interrupt(childId,{kind,agent})` / `drainContinuableChildren(root,[childId])` / 子代理注册表 `agents.get(childId)` + `subagent/start|end` 事件（end 需带 `lastAssistantMessage`+`stopReason`） |
| 2 | 成员↔成员不能直连，一切经框架代转 | 以 root 为 transport 的邮箱 + **按收件人一条** 的耐久消息队列 + ack（未 ack 可重投） |
| 3 | 每收件人的投递节流 | 定时器（`ctx.timeout`）＋ 可调窗口/条数 |
| 4 | 只读/写入类工具注册 + 卸载 | `tools.register()` 返回 disposer，且必须在 `ctx.effect()` 内注册；`tools.restrict` 抛错时能从错误文本取已注册名单 |
| 5 | 斜杠命令 | `commands.register({name,input.hint,handler})`，handler 返回 `{kind:'success'|'error',text}` |
| 6 | 参数与状态持久化 | 插件自管的**加固 JSON 状态文件**（不写宿主会话日志：DSH 拒载未知事件类型）＋ 原子写 + 事件 fold + id 分配器 |
| 7 | 定时/看门狗 | `ctx.timeout`（一次性）＋ 每轮 re-arm；**不能依赖"到点自动结算"** |
| 8 | 文件系统 | injected `fs`（read/write/stat/mkdir）+ 工作目录语义 + 路径基准（成员文件工具按 **session cwd** 解析，故成员面路径要给完整/绝对路径） |
| 9 | 子进程 | `subprocess.spawn({argv,cwd,stdio,graceMs})` + `handle.done` + `handle.terminate` + `resolveExecutable`（Lean / LaTeX / math 引擎） |
| 10 | 上下文管理 | 上下文占用回读（成员自报 `contextPct`）+ `compaction.compactNow/compactIfNeeded(agent,signal)` + 工具结果裁剪 |
| 11 | 模型路由 | 每个子代理可单独指定 `provider/model`（空 = 继承 root 路由） |
| 12 | 并发上限感知 | 宿主 live-child 上限（`maxActiveSubagents`）的**可命名错误**（不能只给不透明字符串），以便区分"宿主顶满"与"provider 坏了" |
| 13 | **票与权限** | 框架必须能表达"票权不可代授"：权限表 + 事件型授权（meeting/verify/once）+ 撤回写事件并广播；阶段门与冻结（由"存在 open 板"派生） |
| 14 | **只增不改的审计** | append-only 台账（决议/动议/纪要确认/记录人/授权/自述历史）＋ "旧结论标记被取代"而非删除 |
| 15 | **人机接口** | 人类只通过 root 会话（office）读写；人类消息必须签名 `office`，成员消息不能冒充 |
| 16 | 非阻塞等待 | 一次性 future-only 的 activity waiter（`vibe_v5_wait`）＋ 首个状态变化唤醒全部 waiter |
| 17 | 时间戳纪律 | 框架写所有 `…At/…Ms`，并**具名拒绝**客户端自带时间（防伪造/漂移） |
| 18 | 机器级资源闸 | 单回合工具调用计数（超限**不执行**）+ 自设 live-child 上限（调宿主前先拒，可预判） |
| 19 | 恢复 | 重启后：成员对账（找不到 live child ⇒ failed/清 childId）、从成员自己的 Progress 末 4000 字符重建会话、看门狗时钟刷新、论文阶段续跑、Lean 队列重驱 |
| 20 | 交付物 | PDF/TeX 编译（有界探测 + 4 步修复 + 超时终止）＋ 幂等补写产物 ＋ 失败具名进 warnings |

---

## ⑦ 专章：设计文档 ↔ 实现落差（目标 2 的**判据核心**）

> 文档层共 4 套口径：`MEETING-PLATFORM-SPEC.md`（merged，**42 条命令**＋K1–K14 裁决＋P1–P15 待拍板）、`A-model.md`（30 院士 + 12 成员）、`B-protocol.md`（六种发言机制＋权限矩阵＋10 参数）、`RULINGS.md`/`docs/02-rulings.md`（R1–R10/D1–D10/D5a/G1–G5/U3–U5）。**实现层只有 `vibe-math-v5r.js` 的工具面**（§③-B）。
> 结论一句话：**v5r 实现的是设计的一个"子集 + 变形"**：以 `asked/silent/unreached` 机会位、`hands` 举手、`spending冻结`、`投票板/决议/记录人/动议/授权` 为核心；**设计里的会期状态机（recess/extend/stop/adjourn）、命令目录（42 条）、群管参数（配额/禁言/并行）、发言机制切换、点名/顺序、材料、质询、补票窗口等均未实现**。

### ⑦-A 42 条设计命令 → v5r 实现对照（逐条判定）

图例：`✅已实现`（同名或同语义工具）／`≈变形`（存在等价但语义/粒度不同）／`✗未实现`（无对应入口，须由框架隐式行为或缺失）。

| # | 设计命令（SPEC §2.2） | v5r 对应 | 判定 | 证据 |
|---|---|---|---|---|
| 1 | `meeting_open` 召集 | `vibe_v5_meeting{agenda,kind,target}` + `beginMeeting` | ✅ | `:11089`、`:7453` |
| 2 | `meeting_start` 开场 | 无独立命令（`beginMeeting` 自动开场＋开场提示写群聊） | ≈ | `:7490-7514` |
| 3 | `meeting_type_set` 设定类型 | 只有 `kind` 四值＋`formal_agenda` 覆盖（改类型字段后**不换机制**，只改等级闸） | ≈（**落差：无类型注册表/机制切换**） | `:2225-2231`、`:11089` |
| 4 | `meeting_agenda_set` 议程增删改 | **无**（agenda 开会时固定，纪要只追加） | ✗ | `:7473`（`agenda` 单串） |
| 5 | `meeting_flow_set` 流程采用/重排 | **无**（无流程概念） | ✗ | — |
| 6 | `meeting_roll_call` 点名/出席 | **无 attendance 模型**（只有开场"程序性点名"行动项，非出席） | ✗/≈ | `:7499-7507` |
| 7 | `meeting_time_set` 设定时长 | **无**（只有全局 `meetingHardLimitMs` 硬界，会议开始时快照） | ✗/≈ | `:7441-7444`、`:7478` |
| 8 | `meeting_stop` 停当前步 | **无** | ✗ | — |
| 9 | `meeting_recess` 休会 | **无** | ✗ | — |
| 10 | `meeting_resume` 复会 | **无** | ✗ | — |
| 11 | `meeting_extend` 延长 | **无**（硬界参数可全局调，但会内不能延长；`status.meeting.hardLimitMs` 只读） | ✗ | `:10440` |
| 12 | `meeting_adjourn` 散会 | `finalizeMeeting`（**由收束判据自动触发**，无显式散会工具） | ≈（**落差：无显式散会命令，院士不能"手动散会"**） | `:7747`、`:7648-7663` |
| 13 | `meeting_grant` 临时授权 | `vibe_v5_grant`（**只 4 命令、只事件型 scope、不收时间**） | ✅（口径收紧） | `:1664-1728`、`:11162` |
| 14 | `meeting_revoke` | `vibe_v5_revoke` | ✅ | `:1730-1753`、`:11163` |
| 15 | `meeting_invite` 邀请发言（**带正文**） | reply 字段 `meeting_invite:{member,why}`（**只有理由，没有"邀请正文"字段**） | ≈（**落差：正文/expect/timebox 缺失**） | `:7676-7696`、`:9633-9634` |
| 16 | `meeting_speak_order_set` 设顺序 | **无**（`beginMeeting` 用 **Fisher-Yates 随机序**固定） | ✗ | `:7456-7458` |
| 17 | `meeting_speak_next` 点名发言 | **无**（框架按顺序自动问） | ✗ | `:7573-7589` |
| 18 | `meeting_chat_mode_set` 发言机制＋**群管参数** | **无**（无 mode、无配额、无禁言、无并行开关） | ✗（**目标 2 关键缺口**） | grep 无命中 |
| 19 | `meeting_hands_set` 举手管理 | **无**（只能成员自己 `meeting_hand`） | ✗ | `:9583-9592` |
| 20 | `meeting_mute` 静默 | **无**（唯一"禁言"＝表决期冻结，非按人） | ✗ | `:2878-2896` |
| 21 | `meeting_unmute` | **无** | ✗ | — |
| 22 | `meeting_settle` 沉淀等待 | **无显式命令**；语义上等价于"在飞成员未落定 ⇒ 等"（收束判据 b/c） | ≈ | `:7641-7648` |
| 23 | `meeting_motion` 动议 | `vibe_v5_motion`（＋`vibe_v5_second`） | ✅ | `:2330-2402`、`:11169-11170` |
| 24 | `meeting_poll_open` | `vibe_v5_poll_open`（六项齐；**无 boolean 模式**） | ✅/≈ | `:1823-1897`、`:11164` |
| 25 | `meeting_poll_close` | `vibe_v5_poll_close` | ✅ | `:1962-1996`、`:11166` |
| 26 | `meeting_result_record` | `vibe_v5_result_record` | ✅ | `:2119-2193`、`:11172` |
| 27 | `meeting_minutes` | `vibe_v5_minutes`（confirm/gaps/entry） | ✅ | `:2404-2467`、`:11171` |
| 28 | `meeting_secretary_appoint` | `vibe_v5_secretary` | ✅ | `:2279-2327`、`:11168` |
| 29 | `meeting_taskboard_open` | **无**（用全局任务板 `vibe_v5_task_create`；`origin:'meeting:<id>'` 由**调用方**自填） | ✗/≈ | `:11280`（`origin` 参数）、`:7497` |
| 30 | `meeting_task_assign` | `vibe_v5_assign` | ✅ | `:11280` |
| 31 | `meeting_raise_hand` | reply 字段 `meeting_hand` | ✅/≈ | `:9583-9592` |
| 32 | `meeting_say`（含引用） | `vibe_v5_say`（`quote_ref/quote_refs`） | ✅ | `:11133`、`:2621-2693` |
| 33 | `meeting_challenge` 定向质询 | **无** | ✗ | — |
| 34 | `meeting_answer` 回答质询 | **无** | ✗ | — |
| 35 | `meeting_poll_vote` | `vibe_v5_poll_vote` | ✅ | `:1899-1961`、`:11165` |
| 36 | `meeting_boolean_vote` 布尔概率＋理由 | `vibe_v5_verdict`（verify 面）＋ `vote_solved`（结题面） | ✅/≈ | `:11174`、`:9564` |
| 37 | `meeting_abstain` | `verdict:'abstain'/'弃权'`；板上 `abstain:true` | ✅ | `:9493-9498`、`:1919-1922` |
| 38 | `meeting_second` | `vibe_v5_second` | ✅ | `:2380-2402`、`:11170` |
| 39 | `meeting_material_submit` | **无** | ✗ | — |
| 40 | `meeting_task_claim`（请求→批准） | `vibe_v5_task_update{action:'claim'}`（**直接认领，无批准点**） | ≈（**落差：无 claim_pending/批准**） | `:11179` |
| 41 | `meeting_request`（休会/延长请求） | **无**（程序异议 #46 是另一件事） | ✗ | `:7290-7305` |
| 42 | `meeting_leave` 请假/离席 | **无** | ✗ | — |

**统计（本表 42 行）**：`✅已实现/近似等价` **14**（#1,13,14,23,24,25,26,27,28,30,31,32,35,36,37,38 中的同名者，按"✅"计 14）；`≈变形` **7**（#2,3,12,15,22,29,40）；`✗未实现` **21**。⇒ **目标 2 的直接答案：v5r 不覆盖设计命令目录；设计层"全部命令与功能"明显大于实现层。**

### ⑦-B 设计参数 ↔ 实现参数（10 条设计参数，K10）
| 设计参数（SPEC K10 / B §5） | 建议默认 | v5r 是否有 | 说明 |
|---|---|---|---|
| `step_duration` 单步时长 | 无（仅提示） | **✗** | 无单步概念 |
| `mechanism_duration` 单机制时长 | 无 | **✗** | — |
| `speak_time_per_member` 每人单次 | 无 | **✗** | — |
| `settle_timeout` 沉淀上限 | 有（兜底） | **≈** `recoverStallMs()=2×activityTimeoutMs`（**仅用于论文阶段**；会议用 `meetingHardLimitMs`，**已不再用 recoverStallMs**，见 `:1090-1091` 注释） | `:4249` |
| `vote_window` 表决窗口 | 无（院士关闭） | **✗**（无窗口；`poll_open` 后只能显式 `poll_close`） | `:1962` |
| `quote_depth_max` | 3 | **✅** `quoteDepthMax`（默认 3，下限 1） | `:1072`、`:2480` |
| `quotes_per_message_max` | 2 | **✅** `quotesPerMessageMax`（默认 2，下限 1） | `:1071`、`:2479` |
| `open_chat_quota` 群聊每人次数 | 不限 | **✗** | — |
| `mute_list` 禁言名单 | 空 | **✗** | — |
| `allow_revote` 允许改票 | 是 | **✅ 但按板**（`rules.allowRevote`，默认 true，**不是全局参数**） | `:1866`、`:1918` |
| （设计未列）`meetingHardLimitMs` | 30min | **✅** 1800000，钳 [300000,7200000] | `:1094` |
| （设计未列）`meetingWakeRetries` | — | **✅** 5，钳 [0,10] | `:1095` |

### ⑦-C 设计裁定 ↔ 实现证据（R1–R10 / D1–D10 / G1–G5）
| 裁定 | 实现证据（v5r） | 覆盖度 |
|---|---|---|
| **R1 框架只推荐不驱动** | 静止提示 `emitStallNotice` 只写群聊、**不召集/不收束/不推进阶段**；`schedulePass` 注释明写"framework only RECOMMENDS"；无自动散会 | ✅ |
| **R2 沉默≠同意** | 票只由 `recordSolveVote` 写；`silent` 与 `voteSolved` 分属两个位；`meetingVoteBlock` 三态、"沉默不等于投票"；`checkSolved` 只读 `solve` | ✅ |
| **R3 票与发言分离** | `inputs/speeches` vs `solve` vs `extras[*].voteSolved` 三处；冻结期"票照记、发言拒" | ✅ |
| **R4 chair-first** | 只有 `canDo('convene')` 能开；收束由判据（无院士指令）；**注意：无显式"结束会议"命令** ⇒ "收束权在院士"只能是**完成征询后自动收束**，与 D2/R4 有张力（见 §⑩ 未决 U-C1） | ≈ |
| **R5 主持不额外加权** | `voters()` 只按 kind；`judgeVerdict` 不读 chair；`chair_proxy` 明写"NEVER adds a vote" | ✅ |
| **R6 真值不越界** | 决议 `result_record` 不写 `verdicts/solve`；论文/辩论只引用已有证据 | ✅ |
| **R7 可审计** | 决议 `res-<n>` 稳定 id、`effectiveAt`、动议/台账 append-only、`minutesConfirmations`、`secretaries[]`、`grants[]` | ✅ |
| **R9 程序性表决未达门槛=未决** | 投票板 `settled=false ⇒ outcome:'unsettled'`；`min_votes_reached` 与 `quorum_reached` **两门槛并列** | ✅ |
| **R10 过程判定≠结束裁定** | 文档要求"过程票数不得驱动流程"；实现里 `checkSolved` 会在**每一张 solve 票**后判结题（这是"结题门"而非"辩论过程"），投票板也不过过程计票，**未发现过程票数驱动阶段** | ✅ |
| **D1 仅院士主持/代行须显式** | `chair_proxy`（scope 只能 `close`、`why` 必填、不设票权） | ✅ |
| **D2 不设"推翻主持"，程序异议留痕** | `procedural_objection`（`chairReplyPending:true` 保持可见） | ✅ |
| **D3 到场/分母：未答不计分母、不算反对、名单必列** | `judgeVerdict` 只读实际票；`unable` 出分母；投票板 `pending[]` 公开点名；`meetingVoteBlock` 未表态单列 | ✅ |
| **D4 门槛未达=未决、延长有界** | 未达 ⇒ `unsettled`；**延长机制不存在**（硬界固定）⇒ 只有"有界"没有"可延长" | ≈ |
| **D5/D5a 少数意见入档＋复议** | `minorityOf`＋`sealRecord` 强制盖章；`reconsiderTool` 资格记录派生、无胜方任一参与者、门槛只升不降、每轮一次 | ✅ |
| **D6 引用边界** | `resolveQuoteAnchor`：同会议、悬空拒、私聊须补记、决议跨会议、不记名只聚合、条数上限、深度折叠、成环标注 | ✅ |
| **D7 简流程不得产出实体定论** | `truthWriteRefusal` 单一判定点（决议/纪要 decision/resolution 动议） | ✅ |
| **D8 列席/受邀/临时工永不表决** | 临时工票被 `recordSolveVote` 丢弃、板投票 `V5_NOT_VOTER`、自述不可写、授权不可给 | ✅ |
| **D9 辩论只收敛意见＋广播三要素** | `vote_solved`（结题意见）与 verify 分离；**广播模板（"根据研究所规则，由于…"）在 v5r 里没有对应措辞**（群聊只写"结束。已解决票 x/y"） | ≈（**缺口**） |
| **D10 静止最多提示一次＋谁在等谁** | `stallNotice` 幂等键 `sinceAt`、`stallWaitingList` 三类来源、耐久 | ✅ |
| **G2 决议公告即生效/稳定标识** | `result_record`：`effectiveAt=at`、`retroactive` 只加 `declaredAt`、`res-<n>` 框架分配 | ✅ |
| **G3 行动项"待接手"永不静默消失** | `origin:'meeting:<id>'` 任务＋`state:'handover'` 视为"待接手"、逾期按 `createdAt<meeting.startedAt` 判定；`actionItemsView`（**但"转待接手"没有自动机制，靠派任务时传 state/origin**） | ≈ |
| **G4 同一议题两场会议互斥** | **无实现**（无议题级互斥；只有"同一时刻一场会议"） | ✗ |
| **G5 成员最小必要知情/私聊不转发** | 投递按收件人；未 ack 可重投；私聊不进公开面（补记才可引） | ✅/≈ |

### ⑦-D 设计文档中**目标 2 明确点名**的字段/机制在实现中的状态
| 用户词 | 文档出处 | v5r 实现 |
|---|---|---|
| 群聊**管理员** | B §2：「院士是**管理员**：可设"每人可发信息次数""禁言名单""是否允许引用"」；A §1.1 `speech_policy`；PHILOSOPHY §3.8 | **✗ 无此角色/字段**（只有权限表 `canDo`） |
| **发言次数限制** | B §5 `open_chat_quota`；SPEC K10；PHILOSOPHY §3.8"发言次数上限" | **✗**（会议内 `spokeCount` 只计数展示，不设上限） |
| **禁言** | SPEC #20/#21 `meeting_mute/unmute`；B §2 `mute[]`；K10 `mute_list` | **✗**（唯一"禁言"＝表决期全局冻结，`:2878`；且只拦成员发言入口） |
| 消息 **id/发言人/时间/回复目标** | SPEC §7.2「纪要结构」「广播对象」；B §3 引用语义 | **✅** `{id,from,to,kind,text,at,quote/quotes}`；**"回复目标"只用 `quote.ref`**，无独立 reply-to 字段 |
| 状态面板（**总目标/计划/正在执行的子任务**） | OVERSIGHT-TIME §2「院士查看各代理情况」8 项 + §2.3 7 条机制（`roster_overview`/`member_profile`/`inflight_queue`/`context_cost`/`task_topic_link`/`resolution_status`/`handover_pending`） | **部分**：`vibe_v5_overview`（≈roster_overview）＋`vibe_v5_status/report`（≈resolution_status/在飞）＋`vibe_v5_self_report`（**总目标/子目标/计划/状态**，**唯一可写面板**）＋`Progress/*.md`（≈member_profile）＋`task_list`（≈task_topic_link）。**`context_cost` 无独立入口**（`debug.rssMb/memoryCeilingMb/toolCallsPerTurnCap` 在 status.debug）；**`handover_pending` 只在 report/overview 的"行动项"行**；**查看留痕只对 self-report 有**（`Shared/SelfReportViewAudit.json`），overview/status **无审计** |
| **当前时间查询**（OVERSIGHT-TIME §3.1 P1） | 人人可查当前时间 | **✗ 无工具**；成员只能从消息/纪要的时间戳间接看到时间；`fmtTime` 只在框架侧使用 |
| **墙钟 vs 单调时长分离**（§3.3 P3） | 两者都要 | **≈ 全用墙钟**：`now()=Date.now()`；`elapsedMs`、`ms` 都是墙钟差值；唯一的"时长"来自 `ctx.timeout`；**没有单调时钟读数** |
| 类型字段"只使能不驱动" | OVERSIGHT-TIME §1.3（判据句） | **✅ 行为上成立**：`kind` 只决定等级与提示文本，**不自动进阶段**；但**没有"类型注册表/可执行命令集/权限集"三件事的机制层**（`:2225-2231`） |

---

## ⑧ 专章：裁定与待拍板编号索引（跨文档，供目标 2 引用）

- **红线 R1–R10**（`RULINGS.md:74-87`、`docs/02-rulings.md:78-91`）：R1 只推荐不驱动；R2 沉默≠同意；R3 票/发言分离；R4 chair-first；R5 主持不加权；R6 真值不越界；R7 可审计；R8 贴合现实优先；R9 程序性表决未达门槛一律未决；R10 过程判定与结束裁定分离（`RULINGS.md:162-178` 七条正文）。
- **裁定 D1–D10 ＋ D5a**（`RULINGS.md:13-25`）：D1 仅院士主持/代行显式；D2 不设推翻主持＋程序异议留痕；D3 到场与分母；D4 未达=未决＋延长有界；D5 少数意见入档＋复议限胜方；D5a 无胜方可由任一参与者复议；D6 引用边界；D7 分级＋简流程不得产定论；D8 列席/受邀/临时工永不表决；D9 辩论只收敛意见；D10 框架只建议。
- **残余漏洞 G1–G5**（`RULINGS.md:104-111`）：G1 到场退化；G2 决议生效时点（**公告即生效**）；G3 行动项待接手（**永不静默消失**）；G4 同议题会议互斥（**决议类互斥、讨论类可并行**）；G5 代理知情权（**最小必要推送、全文可索取、私聊永不默认转发**）。
- **U3/U4/U5**（`RULINGS.md:113-117`）：U3 不记名后复议门槛**只升不降**；U4 降级出口由院士动议、无人动议默认"取平均并标未定论"；U5 **统一用"同一会议"**（废止"会期"）。
- **GAPS 关键 5 条 K1–K5**（`RULINGS.md:33-41`）：K1 法定人数/缺席语义；K2 少数意见＋复议；K3 动议附议＋议程通过；K4 上次纪要确认＋行动项；K5 程序性动议。
- **矛盾 C1–C7**（`RULINGS.md:93-102`）：C1 沉默语义（**禁止任何折算**）；C2 到场定义；C3 取平均分层；C4 延长有界；C5 主持不额外加权；C6 重复条目 11 处合并；C7 查漏稿元层面三点。
- **SPEC 冲突裁决 K1–K14**（`SPEC.md:117-132`）：K1 命名前缀 `meeting_*`；K2 开会两步（允许 `auto_start` 折叠）；K3 `settling` 阶段＋`meeting_settle` 命令并存；K4 表决入口合并为 3 条；K5 引用是 `meeting_say` 字段；K6 布尔概率轮**由院士发起**（框架只能建议）；K7 `settle` 默认院士；K8 `meeting_stop{scope}` 保留、`scope:'meeting'` 收敛到散会；K9 类型取 B 的 7 类＋可选 `standup/ad_hoc`；K10 采纳 B 的 10 参数（毫秒）；K11 举手＝B 名＋A 语义（队列可见、院士点人、可再次举手）；**K12 表决期间禁止发言**；**K13 两个门槛分层不得混用**；K14 一张任务板＋`origin:meeting:<id>`。
- **SPEC 待拍板 P1–P15**（`SPEC.md:198-257`，前 5 条一次拍板）：P1 命名与别名；P2 类型目录；P3 主持代行（**推荐不允许自动代行**）；P4 会议任务板边界（同板＋origin）；P5 会议决议 vs 真值裁定（平台只收集/计票/广播）；P6 授权默认范围/过期（默认本次会议结束失效＋撤回必广播）；P7 v4 `all-unanimous` legacy（保持 v4 不动）；P8 时长默认（单次 5min/整场 60min/投票 10min/settle 10min；整场沿用 `meetingHardLimitMs`=30min）；P9 兜底边界（只建议＋必须广播）；P10 硬界对院士生效（可显式延长、写事件）；P11 矛盾处置＋纯算术平均；**P12 未投票者公开点名**；P13 引用上限 2/深度 3；P14 兼容与发布口径（只落 v5、旧 state 可选字段、纪要新分区进发布说明）；P15 广播模板固定＋规则 id 可引用。
- **其它文档的待拍板**：A-model 13 条（`A-model.md:316-330`：主持唯一性、默认记名、弃权是否计入、动议附议人数、任务板是否同板、辩论/表决是否两次会、真值边界确认、引用能否跨会议、时长默认、未达门槛处理、静默成员是否计入在册/法定、散会后追加材料、兜底上限）；B-protocol 12 条（`B-protocol.md:291-303`）；C-landing 10 条 ＋ docs/08 同名 10 条（`C-landing.md:154-165`）；VOTING 8 条（`VOTING.md:187-196`）；OVERSIGHT-TIME 8 条（`OVERSIGHT-TIME.md:170-179`）；EXPANSION 8 条（`EXPANSION.md:226-235`）；PHILOSOPHY 11 条（`PHILOSOPHY.md:288-300`）；docs/06 8 条（`docs/06-expansion-mechanisms.md:232-241`）。

---

## ⑨ 专章：可调参数总表（实现层权威：代码默认值＋上下界；文档层建议并列）

**会议专用**
| 键 | 默认 | 界 | 语义/读取点 | 文档对应 |
|---|---|---|---|---|
| `meetingHardLimitMs` | 1800000（30min） | **[300000, 7200000]**（双处钳制） | 会议墙钟硬界、唯一兜底；会议开始时快照 | P8/P10；C-landing 记为 `L980` |
| `meetingWakeRetries` | 5 | **[0, 10]**（整数） | N ⇒ 共 N+1 次尝试；耗尽记 `unreached` | 新机制（K11 相关） |
| `maxParallel` | 3 | `max(1, floor(v))` | 每轮同时唤醒上限（会议/论文/调度共用） | B §6 并发 |
| `activityTimeoutMs` | 120000 | **>0**（≤0 丢弃） | 心跳/idle 窗口；论文看门狗＝2×此值 | `settle_timeout` 近似 |
| `stallAutoMeetingMs` | 360000 | **负值＝关闭**；0 落默认；非有限丢弃 | 静止提示阈值（**旧名，语义已改为"提示"**） | D10 |
| `chatDigestMs` / `chatDigestMax` | 45000 / 12 | >0 / ≥1 | 纯 chat 的批量投递窗口与条数 | — |
| `meetingKeepEvery` | 5 | — | 周期性落盘（当前实现里**没有读取点**，仅参数面保留） | C-landing 记为 `L977` |
| `quorumCap` | 3 | ≥1 | `m = max(1, min(quorumCap, voterCount()))` | K13/门槛单点 |
| `quorumMode` | `m-unanimous` | 枚举 {m-unanimous, all-unanimous}，非法⇒m-unanimous | 结题口径 | P7 |
| `verdictMaxRounds` | 3 | ≥1 | 辩论/复议总轮数上限 | R10/D4 |
| `reconsiderFloor` | 0 | ≥0 | 复议门槛下限（只升不降） | U3 |
| `motionSecondsRequired` | 1 | **≥1 整数（域校验拒）** | 动议附议门槛（读取口径 `motionSecondsRequired()`） | A-model 待拍板 4 |
| `quotesPerMessageMax` / `quoteDepthMax` | 2 / 3 | ≥1 / ≥1 | 引用条数（超限**拒**）/ 深度（超深**折叠**） | P13 |
| `researcherCount` | 3 | ≥0 | 建所研究员数 | — |
| `maxTempPerMember` / `maxTempTotal` | 3 / 12 | ≥1 / ≥1 | 临时工配额 | — |
| `compactThreshold` / `compactAfterRounds` | 66 / 8 | >0 / — | 压缩触发 | — |
| `toolCallsPerTurnCap` / `memoryCeilingMb` / `maxLiveChildren` | 0 / 0 / 0 | **≥0 整数（域校验拒）** | 单回合工具预算（**机器强制**）/ 提示词阈值 / 本所活成员上限（0＝不设） | S25-A/E |
| `resourceSelfCheck` | false | bool | 仅控制是否注入【资源】段 | S25-A |
| `pointerPropagation` | true | bool | 是否注入 S21 头部列表契约段 | S21 |
| `feedback` | `on` | 枚举 {on,off} | 反馈库开关（off ⇒ 注入关闭＋写入具名拒） | — |
| `academician` / `academicianLeads` / `memberMayRejectAssign` | true/true/true | bool | 见 §③、§⑤ | — |
| `staffPersona` | '' | 字符串 | 追加到每个成员 charter 之前的全局人设前缀 | — |
| `provider` / `model` | '' | 字符串 | 空＝继承 office 路由 | — |
| `toolAllow/toolDeny/tempToolAllow/tempToolDeny` | [] | 数组或逗号串 | 成员工具过滤（空 allow 不发射，防 deny-all） | C-46/C-47 |
| `formalVerify` | `off` | 枚举 {off,encourage,require}，非法⇒off | Lean 门禁 | — |
| `lean*`（command/args/timeoutMs/async/initiative/searchPaths/jobsMaxParallel） | lean / [] / 120000 / true / normal / [] / 1 | `leanTimeoutMs ≥1000`；`jobsMaxParallel ≥1`；`initiative ∈ {off,normal,eager}` | 形式化工具链 | — |
| `finalPaper` / `paperFormat` / `paperLanguage` / `paperCompilePdf` / `paperEditor` / `paperLatexCommand` | true / both / zh / true / academician / '' | {both,md,tex} / {zh,en} / {office,academician}（**非法⇒默认**，别名见 `:11542-11552`） | 论文 | — |
| `mathComputation/mathMode/mathEngines/mathTimeoutMs/mathPackages/mathInstallScope` | 来自共享模块 `MATH_PARAM_DEFAULTS`（`mathComputation:'auto'`、`mathMode:'typed+shell'`、超时 ≥1000） | 由 `normalizeMathParams` 归一 | `:1147-1152`、`:9826-9837` | — |

**文档层"建议但实现没有"的参数**：`step_duration`、`mechanism_duration`、`speak_time_per_member`、`vote_window`、`open_chat_quota`、`mute_list`、`settle_timeout`（只被 `recoverStallMs` 近似且**不用于会议**）。

---

## ⑩ 未决问题 / GAPS / 与实现的偏差（逐条）

**A. 目标 2 相关的硬缺口（实现缺，文档有）**
1. `[GAP]` 群管理面全缺：无 `meeting_chat_mode_set`（mode/quota/parallel）、无 `mute/unmute`、无 `hands_set`、无 `speak_order_set/speak_next`、无 `material_submit`、无 `challenge/answer`、无 `taskboard_open`（无 claim_pending 批准点）、无 `request`（休会/延长请求）、无 `leave_of_absence`。
2. `[GAP]` 会期状态机全缺：无 `recess/resume/extend/stop/adjourn`、无 `attendance/roll_call`、无 `agenda_set`、无显式散会命令；会议只有 `round-robin → open-floor → 收束/硬界放弃`。
3. `[GAP]` 类型机制层缺：`kind` 仅 4 值（sync/division/verify-request/solve-vote），文档 7 类（sync/discuss/plan/org/debate/conclusion/paper_design）＋`standup/ad_hoc`；**无类型→机制/命令/权限注册表，无 `recommendFlow`**。
4. `[GAP]` 广播模板缺：D9/`RULINGS §7.2(6)` 要求"根据研究所规则，由于…，故…"＋规则 id 可引用；v5r 的会议收束只写「结束。已解决票 x/y」，投票板收束写细节但**无规则引用格式**。
5. `[GAP]` G4 同议题会议互斥未实现（只有"同一时刻一场会议"）。
6. `[GAP]` 时间标准字段未实现：无"当前时间"查询工具；全用墙钟（无单调时长）；与时区无关（`fmtTime` 用 ISO 去 Z，**未带时区**；文档要求"记录必须带时区"）。
7. `[GAP]` 管理查看面部分缺：`context_cost`、`handover_pending` 无独立入口；overview/status **无查看留痕**（只有 self-report 有）；`member_profile` 只有 `Progress` 末 1200 字符。
8. `[GAP]` 邀请发言语义弱：`meeting_invite` 只有 `why`（理由），文档要求"邀请内容＋邀请是一个整体"（`content/expect/timebox`）。
9. `[GAP]` 行为差异：`meeting_speak_order` 是**随机洗牌固定**（文档允许院士自设/默认自然序）；`meeting_adjourn` 是**框架按判据收束**（文档要求院士显式散会）⇒ 与 R4/D2 存在张力（见 A.10）。
10. `[未决 U-C1]` **"院士显式结束会议"在 v5r 缺失**：`endVerify` 有（R10-2a），但会议**没有**对应的 `end_meeting`；院士只能等"全员获机会＋无人举手/在飞"后由 `continueMeetingRound` 自动收束，或靠硬界放弃。文档 D2/R4/K8 假定存在显式散会/结束辩论动作 ⇒ **需要向 lead 汇报是实现缺口还是"v5r 的有意简化"**（代码注释 `:7604-7612`、`:7639-7666` 表明是有意的两阶段模型；`:7391-7393` v4 §26/§27 沿革）。
11. `[未决 U-C2]` **表决期冻结的解除**只有 `poll_close`/结束会议；成员无法"请求休会/讨论步"（文档 B §5/§6.3 要求"先休会/进入讨论步再开放表决"）⇒ 冻结可能长时间卡住举手队列（举手**保留**但不放行）。
12. `[未决 U-C3]` `meetingKeepEvery` 参数**无读取点**（参数面保留但实现未用）——需与 reader-a（参数/持久化分片）交叉确认是否在别处消费。
13. `[未决 U-C4]` `MATH_PARAM_DEFAULTS` 具体值在 `math-computation.js`（不在本分片范围），`mathTimeoutMs/mathEngines/mathPackages` 的确切默认值需 reader-b/lead 从共享模块补齐。

**B. 文档自身写明的未决/GAPS（供目标 2 引用，按文档）**
- `SPEC.md:373-375`：① #11 发言机会/举手状态机并入期二是否认可；② K9 类型目录是否接受"7 类＋2 可选"；③ 15 条待拍板额度已满。
- `RULINGS.md:27-29`：D2 补齐"程序异议须由主持给出理由"属**新增要求**需确认；D5 收紧"复议限胜方之一"已确认。
- `docs/02-rulings.md:131-134`：留给日后 3 条**已清账**——档案检索（S13 `vibe_v5_resolutions` 部分覆盖）、复议流程细化（S9 主干落地，"窗口/频次"**故意不做**以守 R1/D10）、术语与纪要模板统一（**留待后续切片**）。
- `C-landing.md:40/46/67` 与 `docs/08-landing-plan.md:46/73`：核对 v5（**非 v5r**）源码时 `hands/spokeCount/phase/open-floor` **未找到**（`asked` 计数器是心跳用途，勿误引）⇒ 这些标识符是设计名；**在 v5r 中它们已全部实现**（`:7477`、`:7449`、`:7608`）⇒ 说明 v5r 是这些设计的落地版（时间戳：本分片读到的 v5r 已含 S8–S25 全部切片注释）。
- `OVERSIGHT-TIME.md:6`：该稿写时 `EXPANSION.md` **不存在**（后补）；`架构图.md:3-7` 声明自身是**设计期文档**，与最新功能（math/leanAsync/paperEditor/paper.lock.json）**已不同步**，参数以 `docs/` 为准。
- `GAPS.md` §2 第 2 条提出的"沉默即视为无异议"**被 RULINGS C1 明确禁止**（`RULINGS.md:140`）——这是文档内部已被裁决的冲突，实现侧**正确**（无任何沉默折算路径）。

**C. 与目标 6（主代理是否真是助手）相关的偏差**
- **v5r 的主代理有两层含义**，必须区分：
  1. **office（会话 root）＝助手/外部接口**：`agent.cordis.yml:74-86` 明写不研究、不投票、无库；**但它不是"自动汇报者"**——人格层要求"用户问进度就 `vibe_v5_report` 并平实总结"（`agent.cordis.yml:294-295`），**没有**定时/自动上报机制。
  2. **academician＝所内主代理（领头人）**：人设＝charter（`vibe-math-v5r.js:3131-3361`）＋`staffPersona` 前缀；**有**组织权（overview/assign/prioritize/nudge）与会议主持权，但**一票等重**、**不能自我扩张编制**、**不能改参数**（参数仅 office）。
- **参数配置入口**：只有 office 的 `vibe_v5_configure/set`＋`/v5 set`；academician **无**任何改参入口（`withOffice` 拒 `V5_NOT_OFFICE`，`:11036-11046`）。文档 `OVERSIGHT-TIME §2` 想要的"院士管理模式"在实现里**只读**（overview/status/self_report 读；self_report 可写自己的四项，院士可替他人设 `overall`）。
- **自动汇报的实现现状**：只有 ① 人设层的"主动汇报"文字＋② `progress` 字段落 `Progress/*.md`＋③ 院士 `overview` 主动查看（**由院士自己发起**）＋④ office 的 `report()`。**没有任何定时器/心跳驱动的"自动汇报"消息**（`schedulePass` 的 heartbeat 是"推一把让成员推进"，不是汇报）。

**D. 架构图.md（设计期，需与实现区分）**
- §1 三层（所办/研究所/框架）＋§7 唯一权威状态（加固 JSON，不写宿主会话日志）＋§8 提示词三层（persona 冻结 / 状态块 / 本轮回执契约）＋§10 职权矩阵＋§11 目录树 —— 与 v5r 实现一致（本分片已在 §③–§⑤ 给出逐条行号）。
- **架构图有 3 处与 v5r 不一致**（阅读时勿当现状）：① §5 会议流程写"看门狗：2×activityTimeoutMs 无新发言 → 放弃"，但 v5r **已改为 `meetingHardLimitMs`**（`:1090-1091` 注释明写"旧的 recoverStallMs **不再用于会议**"）；② §6 调度写"停滞 → **自动召集一次同步会议**"，v5r 已改为**只发一次静止提示、绝不自动开会**（`:9305-9319`、`:1576-1587`）；③ §4 共识状态机写"轮次用尽或票不足 m 或 1/0 分歧 ⇒ undecided"，v5r 还多了**形式化门（formalVerify=require ⇒ deferForFormal）**与**sesh 冻结/复议轮**（`:7347`、`:2742-2868`）。架构图 §13 的 README 原文同此。

---

## ⑪ 方法与自检（本分片的可复核性）

- JS 通读区间与读法：`read` 每次 300–510 行，**7290→11597 连续无跳读**（含 11166–11597 的注册面与 test seam）；对分片 A/B 范围内但本专章必需的定义点（`DEFAULT_PARAMS`、权限表、投票板、charter、提示词、selfReport、say/pendingFor、常量）做了**定点回读**，全部给出 `file:line`。
- `agent.cordis.yml` 460 行**全文读完**（1–460）；`preset.yml`（762B）已读。
- 11 份 `MEETING-PLATFORM-*.md` **全部逐行读完**：PHILOSOPHY(304)、A-model(330)、B-protocol(304)、C-landing(165)、DECISIONS(164)、EXPANSION(252)、GAPS(230)、OVERSIGHT-TIME(205)、RULINGS(178)、SPEC(375)、VOTING(220)（括号内为 `read` 口径总行数）。
- `架构图.md` **693 行全文读完**；`docs/02-rulings.md`(201)、`docs/06-expansion-mechanisms.md`(272)、`docs/08-landing-plan.md`(183) 全文读完（注：任务书给的路径是 `docs/02-rulings.md` 等，实际文件在 `vibe-math-v5r/docs/` 下）。
- 工具口径警告：`Get-Content | Measure-Object -Line` 在 CJK 文件上会给出**不同行数**（任务书的 11166 vs `read` 的 11597；`RULINGS.md:147` 与 `docs/02-rulings.md:153` 都专门记录过这个假警报）。本文件一律用 **`read` 工具的行号**。
- 未做/不可做：未运行任何脚本/门禁/`scripts/regen-all.mjs`；未在 `Vibe-Mathematics` 下写入任何文件；临时文件未产生（无需清理）。

<!-- END-C-JS -->

