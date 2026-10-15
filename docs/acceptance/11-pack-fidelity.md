# vmu 目标 4 · **pack 保真度审计**（11-pack-fidelity）· Round 7 / task-55

> 问题：`09-goal4-verdict.md` 显示 125 行里 **48 键 pack 真声明**、约 **89 行"框架具备、pack 未声明"**。
> 但按项目哲学（`docs/01 R1`：**一代人的行为由它的 PACK 承载**），**"框架能表达"≠"这个 preset 会那样跑"**。
> 本文逐个核 **v5r 当年到底怎么跑**（唯一权威源＝`vibe-math-v5r/vibe-math-v5r.js` 的 `DEFAULT_PARAMS`（`:1062-1183`）与顶层常量），
> 再把每一行判成三类，并把①落成声明。**值全部附 v5r `file:line`，不臆造。**

**总判定**：v5r pack 与 v5r **在"会改变行为"的那一层已经对齐**（见 §3），但本轮**又抓出 3 处不保真**（2 处该声明未声明、1 处声明了 v5r 没有的东西），**已全部修掉**；另有 **6 类 v5r 行为在 vmu 里没有键**（§4，真缺口/有意分歧，具名）。

---

## §1 权威源：v5r 自己的参数表（`DEFAULT_PARAMS`）

`vibe-math-v5r.js:1062-1183` 是 v5r 的运行期参数表（`params = Object.assign({}, DEFAULT_PARAMS)`，`:1186`）。**它的每一项都是"v5r 当年确实那样跑"的一手证据**。本文逐项对照 `settings/schema.js` 的默认值。

## §2 三类逐项表（v5r 参数 → 框架键 → 判定）

> **判定口径**：①＝v5r 那样跑且**框架默认不同** ⇒ pack **必须声明**；②＝**框架默认已等于 v5r 值** ⇒ 不必声明（写了也只是"复述默认"）；③＝v5r 有、vmu **无键**（或有意不提供）⇒ 具名（§4）。

| v5r 参数（file:line） | v5r 值 | vmu 键 | 框架默认 | pack | 判定 |
|---|---|---|---|---|---|
| `resourceSelfCheck` **:1122** | **false** | `vmu.turn.selfCheck` | **true** | **本轮改为 false** | **①（本轮修复）** |
| `activityTimeoutMs` **:1082** | **120000** | `vmu.control.idleAfterMs` | **0** | **本轮新增 120000** | **①（本轮新增）** |
| （常量 `PAPER_MAX_ROUNDS` **:229**） | **3** | `vmu.paper.maxRounds` | **0** | 轮 6 已声明 3 | **①（R6 落地）** |
| `maxLiveChildren` **:1130** | **0** | `vmu.limits.maxLiveMembers` | 0 | **本轮删除旧值 3** | **①（本轮纠错：原先声明了 v5r 没有的上限）** |
| `maxParallel` **:1081** | 3 | `vmu.limits.maxParallel`／`vmu.turn.maxParallel` | **3／3** | 未声明 | **② 默认即 v5r**（schema doc：`P3：吸收 v5r 的 maxParallel`） |
| `leanJobsMaxParallel` **:1119** | 1 | `vmu.math.leanJobsMaxParallel` | **1** | 未声明（另声明了 `vmu.math.maxParallel:1`，见 §3.3） | **②** |
| `chatDigestMs` **:1084** | 45000 | `vmu.mailbox.digestWindowMs` | **45000** | 未声明 | **②** |
| `chatDigestMax` **:1085** | 12 | `vmu.mailbox.digestMax` | **12** | 未声明 | **②** |
| `meetingKeepEvery` **:1086** | 5 | `vmu.records.meetingKeepEvery` | **5** | 未声明 | **②** |
| `quorumCap` **:1068** | 3 | `vmu.meetings.quorumCap` | 3 | ✓ 声明 3 | ②（声明＝复述默认，但作为机构立场保留） |
| `quorumMode` **:1069** | 'm-unanimous' | `vmu.meetings.quorumRule` | 'm-unanimous' | ✓ | ② |
| `reconsiderFloor` **:1070** | 0 | `vmu.ballot.reopenFloor`（孤儿名已删） | 0 | ✓ 0 | ② |
| `quotesPerMessageMax` **:1071** | 2 | `vmu.meetings.quotesPerMessageMax` | 2 | ✓ | ② |
| `quoteDepthMax` **:1072** | 3 | `vmu.meetings.quoteDepthMax` | 3 | ✓ | ② |
| `verdictMaxRounds` **:1073** | 3 | `vmu.meetings.verdictMaxRounds` | 3 | ✓ | ② |
| `meetingHardLimitMs` **:1094** | 1800000 | `vmu.meetings.hardLimitMs` | 1800000 | ✓ | ② |
| `meetingWakeRetries` **:1095** | 5 | `vmu.meetings.wakeRetries` | 5 | ✓ | ② |
| `maxTempTotal` **:1076** | 12 | （pack 的 `slots` temp capacity） | — | ✓ slots 12 | ②（结构面） |
| `formalVerify` **:1100** | 'off' | `vmu.math.formalVerify` | 'off' | 未声明 | ② |
| `leanCommand`／`leanArgs`／`leanTimeoutMs`／`leanAsync`／`leanInitiative`／`leanSearchPaths` **:1101-1117** | 'lean'／[]／120000／true／'normal'／[] | `vmu.math.lean*` | **逐项相同** | 未声明 | ② |
| `toolCallsPerTurnCap`／`memoryCeilingMb` **:1124/1126** | 0／0 | `vmu.turn.*` | 0／0 | 未声明 | ② |
| `pointerPropagation` **:1136** | true | `vmu.records.pointerPropagation`＋`vmu.pointer.propagation` | true／true | ✓ 两个都声明 | ② |
| `feedback` **:1174** | 'on' | `vmu.turn.feedback` | true | ✓ | ② |
| `paperLatexCommand` **:1168** | ''（自动检测） | —（引擎面自动） | — | 未声明 | ② |
| `provider`／`model`／`toolAllow`／`toolDeny`／`staffPersona`／`tempToolAllow`／`tempToolDeny` **:1176-1182** | ''／[] | **不是 settings**（spawn 参数／`vmu.tools.faces`） | — | 未声明 | ③（不是设置键；见 §4） |
| `compactThreshold`／`compactAfterRounds` **:1078/1079** | 66／8 | **无键** | — | 未声明 | **③ 真缺口（§4.1）** |
| `finalPaper`／`paperFormat`／`paperLanguage`／`paperCompilePdf` **:1163-1166** | true／'both'／'zh'／true | **无键** | — | 未声明 | **③ 真缺口（§4.2）** |
| `paperEditor` **:1167** | 'academician' | `vmu.paper.finalizer`（域 `['editor','contributor','any']`，`paper.js:69`） | 'editor' | 未声明 | **③ 值域不含 'academician'（§4.3）** |
| `stallAutoMeetingMs` **:1083** | 360000（静止即**自动开会**） | `vmu.control.idleAction`（域含 'notice'，默认 'notice'＝**只提示**） | 'notice' | 未声明 | **③ 有意分歧（R1：只推荐不驱动；§4.4）** |
| `maxTempPerMember` **:1075** | 3 | **无键** | — | 未声明 | **③ 真缺口（§4.5）** |
| `memberMayRejectAssign` **:1066** | true | **无键** | — | 未声明 | **③ 真缺口（§4.5）** |
| `researcherCount`／`academician`／`academicianLeads` **:1064-1067** | 3／true／true | 结构面（pack 的 `slots`／入口 roster） | — | ✓ slots | ②（不是设置键） |
| `math*`（`MATH_PARAM_DEFAULTS`，**:1147-1152**） | 共享模块默认 | `vmu.math.mode` 等（def 也取自同一模块） | 相同 | 未声明 | ②（同源，逐字一致） |

**统计**：① **4 项**（3 项本轮/上轮已落 ＋ 1 项纠错）；② **30 余项**（框架默认＝v5r，含 16 个 pack 仍显式声明的"复述默认"）；③ **6 类**（4 真缺口 ＋ 1 值域不符 ＋ 1 有意分歧）。

## §3 本轮**落地的声明**（①，全部带 v5r 出处）

| # | 键 | 值 | v5r 出处 | 读者 | 为什么必须声明 |
|---|---|---|---|---|---|
| 1 | `vmu.turn.selfCheck` | **false** | `:1122` `resourceSelfCheck: false`（注释："false ⇒ 提示词**一字不改**，仅当 true 才注入【资源】段"） | pack 自己的策略模块 `packs/v5r/middleware/prompt-switches.js:27`（`OFF_SWITCHES` 以 `!== false` 门控 `v5r-turn-resources` 段） | **原先声明 `true`** ⇒ v5r preset 会注入一段 **v5r 从不发**的提示词段 ⇒ 这是**不保真**（框架默认也是 true，所以不改就等于改变行为） |
| 2 | `vmu.control.idleAfterMs` | **120000** | `:1082` `activityTimeoutMs: 120000` | `kernel/control.js:65`（＋ `:206` 的 `enforced[]`） | 框架默认 **0＝"不定义空闲"** ⇒ 不声明则**这家所永远不会空闲**，v5r 的静止检测根本不会发生 |
| 3 | `vmu.paper.maxRounds` | **3** | `:229` `const PAPER_MAX_ROUNDS = 3` | `kernel/paper.js:41,135`（`revise()`，超限具名拒 `VMU_PAPER_ROUNDS_EXCEEDED`） | 框架默认 **0＝无上限** ⇒ 不声明则丢掉 v5r 的界（R6 已落，本轮复核保留） |
| 4 | `vmu.limits.maxLiveMembers` | **删除**（原为 3） | `:1130` `maxLiveChildren: 0`（v5r 的**在活上限＝不设**）；v5r 的 `maxParallel: 3`（`:1081`）是**并发维度**，框架已在 `vmu.limits.maxParallel`/`vmu.turn.maxParallel` 默认为 3 | — | **原先声明 3 会让这家所拒掉第 4 名在活成员，而 v5r 不会** ⇒ 删掉后取框架默认 0 ＝ v5r |

### 3.3 一处**保留但明确非保真证据**的声明（**Lead 已裁决**）

- `vmu.math.maxParallel: 1`：**保留**，但标注为 **`＝框架默认（复述）；v5r 对应参数 leanJobsMaxParallel:1（:1119）；非保真证据`**（Lead 裁决）。
  理由：它的值**等于框架默认**（def 1），而 v5r 的对应参数是 `leanJobsMaxParallel: 1`（`:1119`），框架**已有同名键** `vmu.math.leanJobsMaxParallel`（默认就是 1）⇒ 该项属 **②**。保留一行的价值在于**整合包要可读、可调控**；但**不得**把它当作"v5r 行为已复现"的证据。
  落点：`packs/v5r/settings/defaults.js` 该键上方的注释（含裁决原话）＋ `defaults.json` 的 `_round7` 元数据（与 `_comment`/`_round2` 同层，加载器只读 `defaults` 对象，元数据不进设置）。

## §4 ③ 具名：v5r 有、vmu 没有（真缺口与有意分歧）

| # | v5r 行为（file:line） | 现状 | 归属 / 改判条件 |
|---|---|---|---|
| 4.1 | **上下文压缩阈值** `compactThreshold: 66`（%）、`compactAfterRounds: 8`（`:1078/1079`） | vmu **没有任何 compact 阈值键**（`vmu.memory.compactionEveryMs` 是记忆面周期，语义不同） | **vmu-core**：要复现 v5r 的压缩节奏需加键＋读点；否则登记为"vmu 的上下文管理走 `kernel/metrics.js`＋prompt 装配，不设该阈值" |
| 4.2 | **终稿交付** `finalPaper: true`／`paperFormat: 'both'`／`paperLanguage: 'zh'`／`paperCompilePdf: true`（`:1163-1166`） | `vmu.paper.*` **无 format／language／compile 键**；交付走 `kernel/publication.js`＋引擎三面门 | **vmu-core／math 面**：若"v5r 的终稿默认（both/zh/编 PDF）"要可声明，需键＋读点；否则具名登记为"由 publication 面与部署决定" |
| 4.3 | **终稿人＝院士** `paperEditor: 'academician'`（`:1167`） | `vmu.paper.finalizer` 的值域是 **`['editor','contributor','any']`**（`kernel/paper.js:69`），**不含 'academician'**（非法值回落 'editor'） | **vmu-core**：值域不含 ⇒ v5r 的"院士终稿"在 vmu 只能用 `editor` 角色＋C-30 咨询门近似。**不要**声明 `'academician'`（会被静默回落） |
| 4.4 | **静止即自动开会** `stallAutoMeetingMs: 360000`（`:1083`） | `vmu.control.idleAction` 默认 `'notice'`＝"**只提示，绝不自动散会**" | **有意分歧（R1：框架只推荐、不驱动）** ⇒ 不声明；已在 `docs/10 §4.3` 写明"要周期推进由部署声明 `vmu.schedule.*` 并自行 arm/tick" |
| 4.5 | **编制上限** `maxTempPerMember: 3`（`:1075`）、**成员可否拒派** `memberMayRejectAssign: true`（`:1066`） | 无对应键（`vmu.tenure.*` 有 11 键，但不是这两个语义） | **vmu-core**：要可声明需加键＋读点；否则具名登记为"vmu 未提供该策略面" |
| 4.6 | `provider`／`model`／`toolAllow`／`toolDeny`／`staffPersona`／`tempToolAllow`／`tempToolDeny`（`:1176-1182`） | **不是设置键**：per-spawn 参数走 `host-spawn.js` 的 seam，工具面走 `vmu.tools.faces`／`vmu.skills.*` | **不是缺口**：v5r 的这几个是**调用期参数**，不是机构策略；vmu 用接缝＋声明式面承载 |

## §5 未做项

1. §4.1–4.3、4.5 的键（若 Lead 要"v5r 的压缩节奏／终稿格式／院士终稿／编制上限"可声明）⇒ 归 vmu-core（加键＋读点后我补 pack 默认值）。
2. §3.3 的 `vmu.math.maxParallel: 1` 去留 ⇒ 等 Lead 一句话。
3. 矩阵 §9.3 的三类回填 ⇒ 归 vmu-verify（本文 §2 是逐项依据）。
