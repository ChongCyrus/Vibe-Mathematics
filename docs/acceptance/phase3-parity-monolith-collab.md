# Phase 3 · P-a parity —— 单体 `vibe-math-v5r.js` 的**协作/状态语义**（读它，而不是猜它）

> ★ **本文件边读边写**：表头先存盘，之后**每读完一段行范围就补一批并保存**。★ 现状：骨架已落盘，**正在读**。
> ★ **硬禁令（本轮）**：★ 另一位队友的"13 份 markdown 规格 / `quorum` 文档 82 命中、代码 0"是**关键词 grep** 的结论 ⇒ ★★ **绝不允许**由"grep 命中 0"推断"原版没有该语义" —— ★ **单体 11,597 行不是空的，必须【读】它到底实现了什么**。
> 纪律：**不改代码**／**不跑 T1 或全量**／**不跑 git**；临时件 `D:\_tmp`；**不碰 `token.txt`**。写者范围：仅本文件。

## 0. 读了哪些行范围（★ 诚实边界，随读随更新）

| 行范围 | 状态 | 覆盖到的机制 |
|---|---|---|
| **文件级**：`D:\wd\vibemath开发\Vibe-Mathematics\vibe-math-v5r\vibe-math-v5r.js`（**11,597 行**） | ★ **已读：行数 ＋ 顶层声明骨架（见 §1.0）** | 全文件的**结构地图**（不是语义） |
| **行 1–60**（头部注释/规格引用） | ★ **已读（部分，见 §1.0 注释命中）** | 文件自述范围 |
| **事件/状态核心的签名行**（`:485 :532 :540 :571 :589 :917 :1035 :1052 :1061`） | ★ **已读（签名/首行）** | 事件溯源 reducer＋文件后端＋会话的**存在与边界** |
| **`:589–916`（`applyV5Event` 体）** | ★ **未读** | 事件类型的**实际语义** |
| **`:917–1034`（`makeFileBackend` 体）** | ★ **未读** | 持久化/加载失败语义 |
| **`:1061–10928`（`makeSession` 体）** | ★ **未读** | ★ **全文件主体（≈9,867 行）**：会议/表决/名册/信箱等的**真实行为** |
| **`:10929–11473`（工具注册区）** | ★ **未读** | 工具面（含 `withCaller`/`mathHandlerFor`/`withOffice`） |
| **`:11474–11597`（工具函数/解析器）** | ★ **未读** | 序列化/解析（`parseReply` 等） |

★ **声明**：本节是**唯一**的覆盖声明处 —— ★ **未列出的行范围一律视为未读**；★ 本轮的骨架读取**不能**支撑"行为相同/不同"的判定（§1.1 已按此标注）。

## 1.0 ★ 结构地图（**已读**：顶层声明行 ＋ 行号）

```
  :413   export function apply(ctx)                       ← 入口
  :485   function emptyInstitute(key, project, institute)
  :532   function initState()  { v: PROJECTION_VERSION, institutes: {} }   ← 投影版本化
  :540   function withInstitute(state, key, mut)
  :571   function makeIdAllocator(inst)
  :589   function applyV5Event(state, event)      ← ★ 事件溯源 reducer（≈328 行，体未读）
  :917   function makeFileBackend(readTextAbs, writeTextAbs, pathOf, onWriteFailure, onLoadProblem)  ← ★ 持久后端（≈118 行，体未读）
  :1052  function getSession(agent)
  :1061  function makeSession(rootAgent, sessionId)        ← ★ 主体（≈9,867 行，体未读）
  :10934 function registerTool(name, description, parameters, fn)
  :10972 function withCaller(s, x, what, fn)   :11011 mathHandlerFor(s)   :11036 withOffice(s, x, what, fn)
```
⇒ ★ **读到的结构事实**：① 该单体是**事件溯源**（`applyV5Event` ＋ 版本化投影 `initState().v` ＋ `withInstitute` 事务包装）；② 有**可注入的文件后端**（`makeFileBackend` 带 **`onWriteFailure`／`onLoadProblem` 两个失败回调** ⇒ ★ **失败语义是被显式建模的**，不是裸 `try/catch`）；③ 参数里出现 **`onWriteFailure`／`onLoadProblem`** 说明"写失败/加载出问题"各有一条**具名通道**（★ 与 vmu 的"失败必须具名"同族）。

## 1.1 ★ 关键词命中的【行号】（★★ 只用于**定界**，★ **绝不用于判定"有无该语义"**）

| 词 | 命中行数 | 首批行号 | 读到的含义（本轮只能说这些） |
|---|---|---|---|
| `meeting` | **509** | 6,11,213,228 | ★ **该单体大量出现会议语义**（不是"规格里才有"） |
| `member` | **1000** | 12,14,16,17 | 名册/成员语义贯穿全文 |
| `vote` | **303** | 6,7,9,12 | 表决语义存在 |
| `ballot` | **113** | **645,646,647,648** | ★ **`:645-648` 附近有 ballot 语义**（**在 `applyV5Event` 内** ⇒ 事件类型里就有它） |
| `roster` | **75** | 17,21,1369,1496 | 名册；`:1369/:1496` 在 session 主体内 |
| `quorum` | **79** | 17,**1063,1068,1069** | ★★ **见下方"更正"** |
| `resume` | **51** | 13,22,32,33 | 恢复语义（多在头部规格引用；★ 有无实现**未读**） |
| `persist` | **32** | 29,35,48,50 | 持久化（同上） |
| `notify` | **15** | 3429,3568,5929,6141 | 通知（`:3429/:3568/:5929/:6141` 都在 session 主体内） |
| `mailbox` | **6** | 1199,3523,3529,9072 | 信箱（少，但★**存在**；`:3523/:3529/:9072` 在主体内） |
| `journal` | **0** | — | ★ **本词为 0 只是一条【未核】线索**，★ **不得**据此说"没有持久状态"（见 §0 硬禁令；`makeFileBackend` 明确是持久层） |
| `quorumRule` | **0** | — | 同上：★ **不得**由 0 推断缺失；且 vmu 侧确有 `vmu.meetings.quorumRule`（本会话读过）⇒ 这一格**未核** |

### ★★ 更正一条既有结论（本轮实证）
★ 队友报告称 "`quorum` 文档 82 命中、**代码 0**" ⇒ ★ **与我的行级读数不符**：`quorum` 在**单体代码里命中 79 处**，**首批行号 `:1063, :1068, :1069`**（**在 `makeSession` 主体内**，紧跟 `getSession` `:1052`）。
⇒ ★ **"代码 0"这一格是 grep 口径造成的假象**（很可能只扫了某一路径/大小写/词形）⇒ ★ 结论：**不能从关键词命中推断有无**（本任务的硬禁令），并且这条**具体结论需要撤回**。

## 2. 失败语义（这些路径的具名拒/静默）

| # | 机制（做什么） | 单体行范围 | vmu 对应 | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| F-1 | ★ **持久层把"写失败"与"加载出问题"分成两条回调**（`makeFileBackend(…, onWriteFailure, onLoadProblem)`） | **`:917`（签名已读；体未读）** | vmu：`kernel/stateversion.js`／`kernel/auditchain.js`／`kernel/replay.js`／`kernel/resume.js`（★ 本会话在 `installer.js` 文件清单里读到这些模块存在） | ★ **未读 ⇒ 不能判** | ★ **P-a 候选（骨架）/ 语义未核** |
| F-2 | ★ 事件溯源把"状态推进"建模成**事件**（`applyV5Event`），并带**投影版本号**（`initState().v = PROJECTION_VERSION`） | **`:532`／`:589`** | vmu：`kernel/stateversion.js`（版本化）＋ `kernel/bus.js`（事件） | ★ 未读 ⇒ 不能判 | ★ **P-a 候选 / 语义未核** |

★ **本轮不写"P-a parity"的结论** —— 判定"行为同不同"必须读 `:589-916`／`:1061-10928` 的**体**，而这两段本轮**未读**（§0）。★ 因此上表只给**候选**，按你的三类词表记 **P-a 候选**而非 P-a。

## 4. ★★ 追加（Round 7/256 · task-222）—— 三段"体"的行级读数

> ★ 本节为**追加**（未重写前文）。★ 读法：按行号切片；**打印/匹配到的行就是读到的行**，未打印的范围**记为未读**。

### 4.0 覆盖更新

| 行范围 | 状态 | 覆盖到的机制 |
|---|---|---|
| `:589–916` `applyV5Event` | ★ **部分读**（`:591 :592 :895` ＋ 关键词定界） | 守门、事件名取出、**诊断通道**；★ **事件类型清单未读** |
| `:917–1034` `makeFileBackend` | ★ **已读**（`:917 :925-926 :940 :946 :957 :975 :976 :1003 :1012-1021`） | ★ **两条失败回调的完整语义** |
| `:1061–10928` `makeSession` | ★ **部分读（地标）** `:1063…:1605` | **区内结构**（offices/quorum、meeting speaking model、后端装载与失败通道、`commit`） |
| `:1061–10928` 其余（各实现体） | ★ **未读** | — |

### 4.1 `applyV5Event`（`:589–916`）

| # | 机制 | 单体行范围 | vmu 对应 | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| E-1 | ★ **事件守门**：`if (!event \|\| typeof event.type !== 'string') return state` ⇒ 非字符串/缺失事件名 ⇒ **原样返回、不拒（无具名）** | **`:591`** | `kernel/bus.js`＋`kernel/stateversion.js` | ★ **不同**（原版此处静默；vmu 拒名更严） | ★ **P-a**（事件层确有）；★ **"静默 vs 具名"＝差异**（是否缺陷请你裁） |
| E-2 | ★ **失败进诊断**：`:895` 把 `{at, type, error}` 追加进 `state.diagnostics` ⇒ 事件应用失败**落进可持久化的诊断表** | **`:895`** | `kernel/auditchain.js`／`kernel/report.js` | ★ 同族 | ★ **P-a** |
| E-3 | ★ **投影版本**在 `initState()` **`:532`**（**不在本段**；本段内 `version/migrat` 零命中） | `:532` | `kernel/stateversion.js` | ★ 未读全 ⇒ 不能判 | ★ **P-a 候选** |
| E-4 | ★ **事件类型清单**：按 `case '`／`.type === '`／`type: '` 扫 `:589–916` **只命中 3 行** ⇒ 派发**不是 switch/case 字面**、形式未定位 ⇒ ★ **清单未读**（不猜） | `:589–916` | — | ★ 未读 | ★ **未核** |

### 4.2 ★★ `makeFileBackend`（`:917–1034`）：**失败是具名的，且曾把"吞掉"改成"可见"**

| # | 机制 | 单体行范围 | vmu 对应 | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| F-1 | ★★ **写失败 ⇒ 具名＋持久＋可见**：`:1020 onWriteFailure(pathOf())` ＋ `:1021 console.error('vibe-math-v5r: state write FAILED for …')`；★ `:1012` 注释逐字 **"MEDIUM 7 (deep review): the write used to be wrapped in `catch { /* best effort */ }`"** ⇒ ★ **原版明确修掉了 best-effort 吞掉** | **`:1012–1021`** | `kernel/stateversion.js`／`kernel/auditchain.js` | ★ **同族（拒绝静默）**；逐字等价未核 | ★★ **P-a** |
| F-2 | ★ **加载出问题 ⇒ 具名且绝不覆盖**：`:940 'invalid JSON (truncated or corrupt)'`／`:946 'unreadable: '+e.message`；`:925-926` 注释：只有一种情况 licences a later write，**其余（throw／parse error／version mismatch）⇒ `loadOk=false` ⇒ `commit()` 拒绝覆盖** | **`:925–957`** | `kernel/resume.js`／`kernel/replay.js`／`kernel/stateversion.js` | ★ 同族 | ★★ **P-a** |
| F-3 | ★★ **具名拒码**：`:1003 throw v5err('V5_STATE_NOT_LOADED', …)` ⇒ 未装载时**按码拒绝** | **`:1003`** | vmu 错误码表（`docs/03` 的 `VMU_*`） | ★ 同族 | ★★ **P-a** |
| F-4 | ★ **诊断通道不反噬**：`:976`／`:1020` 的 `catch (e) { /* diagnostics must not … */ }` ⇒ 报告失败本身失败**不打断链路** | `:976`／`:1020` | `settingsRejected` 记账（本会话读过） | ★ 同族 | ★ **P-a** |
| F-5 | ★ **"没装载" ≠ "空状态"**：`:975` 注释逐字 *"so `/v5 status` can never silently look like \"nothing here yet\""* | **`:975`** | `status()` 的显式缺失／三态不混（本会话读过） | ★ 同族 | ★ **P-a** |

### 4.3 `makeSession`（`:1061–10928`）：**区内地标（命名行范围索引）**

| 段名 | 起始行 |
|---|---|
| ★ **offices / quorum** | **`:1063`** |
| staffing | `:1074` |
| context | `:1077` |
| scheduling | `:1080` |
| ★ **meeting speaking model（2.9.0）** | **`:1087`** |
| Lean formal verification | `:1096` |
| 指针传播开关（S21） | `:1131` |
| math_computation | `:1137` |
| final paper | `:1153` |
| methodology / collaboration feedback | `:1169` |
| model / tools | `:1175` |
| ★ **后端装载** | `:1354 installBackend`／`:1363 awaitBackendLoad`／`:1385 ready`／`:1408 ensureLoaded` |
| ★ **失败汇点** | `:1443 noteLoadProblem`／`:1461 noteWriteProblem`／`:1465 drainLoadNotes` |
| ★★ **事件提交** | `:1474 commit(type, data)`（喂 `applyV5Event`） |
| S5／S6 | `:1539`／`:1589`（`grantActive :1605`） |

| # | 机制 | 单体行范围 | vmu 对应 | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| S-1 | ★★ **失败管线三段式**：后端回调 → `noteLoadProblem/noteWriteProblem`（`:1443/:1461`）→ `drainLoadNotes`（`:1465`）进诊断 | **`:1443–1465`** | `kernel/index.js` 的 `settingsRejected`＋`status()`（本会话读过） | ★ 同族（失败必留痕且可读） | ★★ **P-a** |
| S-2 | ★ **事件提交入口** `commit(type, data)` | **`:1474`**（体部分读） | `kernel/bus.js`＋工具面 | ★ 同族；细项未核 | ★ **P-a（入口）/ 细项未核** |
| S-3 | ★ **会议发言模型段** | **`:1087`**（段注释已读，体未读） | `packs/v5r/middleware/prompt-switches.js`（`MEETING_STATES`＝invited/others/first；★ R6 我刚修过其默认分支） | ★ **未读 ⇒ 不能判** | ★ **未核（下一步优先读 `:1087–1130`）** |

### 4.4 本节新增"没核"

1. ★ **`applyV5Event` 的事件类型清单未读**（扫 `:589–916` 只命中 3 行 ⇒ 派发形式未定位 ⇒ **不猜**）。
2. ★ **`makeSession` 的实现体未读**（本轮只读段注释与函数签名）⇒ 会议/表决/名册/信箱/通知/恢复的**行为判定一律未做**。
3. ★ `ballot` 命中 `:645–648`（**落在 `applyV5Event` 内**）⇒ **事件层里有表决相关事件**（存在性）；具体事件名**未核**。
4. ★ **vmu 侧逐字对应体未读**（`kernel/resume.js`／`replay.js`／`stateversion.js` 我没读）⇒ §4.2 只到**同族**级别。
5. ★ 只读任务：未改代码／未跑 T1 或全量／未跑 git／未碰 `token.txt`。

## 5. ★★ 追加（Round 9/256 · task-230）—— 第三遍：会议发言模型／offices-quorum／**派发结构已定位**

> ★ 本节为**追加**（紧接 §4 之后即是本节的逻辑位置；因落盘锚点，它排在 `§3` 之前）。★ **只按行读**；★ **未读的行范围逐条具名**；★ 行为对照做不到的一律写 **"对照未做"**，不写成"一致性已验证"。

### 5.0 覆盖更新

| 行范围 | 状态 |
|---|---|
| **`:592–620`（逐行）** ＋ **`:592–900` 的派发链（逐条命中）** | ★ **已读** |
| **`:1063–1073`（逐行）** | ★ **已读** |
| **`:1087–1095`（逐行，会议发言模型的设置与规则注释）** | ★ **已读** |
| **`:1096–1128`** | ★ 已读（Lean/S25 设置，**非本节主题**） |
| **`:1087–1130` 的会议【实现体】** | ★ **未读**（本节读到的是**该段的设置与规则注释**；实现体在别处） |
| **vmu 侧**（`kernel/meetings.js`／`meetingdomain.js`／`settings/schema.js` 的对应段） | ★★ **本轮未读 ⇒ 行为对照一律「对照未做」** |

### 5.1 ★★ 派发结构（`:592–900`）—— **不是 switch、不是字面比较**

| # | 机制 | 单体行范围 | 事实（逐行读到） |
|---|---|---|---|
| D-1 | ★ **前缀守门**：非 `vibe5/` 前缀的事件**原样返回**（外来事件被忽略） | **`:593`** | `if (t.indexOf('vibe5/') !== 0) return state` |
| D-2 | ★ **载荷守门**：`data` 必须是对象且 `data.key` 必须是字符串，否则**原样返回** | **`:594–596`** | `if (!d \|\| typeof d !== 'object' \|\| typeof d.key !== 'string') return state` |
| D-3 | ★★ **派发方式＝`if (t === EV.<名>)` 链**（★ 字面量在 **`EV` 常量对象**里 ⇒ ★ 这正是上轮扫 `case '`／`.type === '`／`type: '` **只命中 3 行**的原因） | **`:597, :694, :714, :734, :771, :792, :814, :822, :831, :861`** | `if (t === EV.institute) { … }` 等 **10 条** |
| D-4 | ★★ **事件类型清单（读到的 10 个）**：`EV.institute`／`EV.member`／`EV.task`／`EV.message`／`EV.delivered`／`EV.meeting`／`EV.debate`／`EV.verdict`／`EV.formal`／`EV.queue` | **同上** | ★ **`EV` 各常量的【字符串值】未读**（`EV` 的定义在别处）⇒ ★ **事件名文本未核**（不猜） |
| D-5 | ★★ **每个分支都是事务**：一律 `return withInstitute(state, key, (inst) => { … })` | **`:598, :695, :715, :735, :772, :793, :815, :823, :832, :862`** | ★ 事件**逐个原子**折叠进投影 |
| D-6 | ★ **"函数即变更"技巧**（在折叠内应用变更函数，避免整对象读改写丢更新） | **`:612–619`** | 注释逐字："A FUNCTION is a MUTATION applied inside the fold … a whole-object read-modify-write outside the fold would lose updates." |
| D-7 | ★ **两枚持久标记**由事件写入：`meetingOpen`（可 `null`）、`officeRequestsDropped` | **`:610–611`** | `patch.meetingOpen`／`patch.officeRequestsDropped` |

★ **vmu 对应**：`kernel/bus.js`（事件）＋ `kernel/stateversion.js`（投影版本）＋ `kernel/auditchain.js`（留痕）；★ **行为同不同＝对照未做**（本轮未读 vmu 侧体）。判定：★ **P-a 候选**（★ **单体侧确凿**：事件层、前缀守门、逐事件事务、诊断/标记；★ **vmu 侧未读**）。

### 5.2 ★ `:1063–1073` offices / quorum —— **`quorum` 一词在这里变成行为（逐行读到）**

| # | 机制（读到的事实） | 行 | vmu 对应（点名） | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| Q-1 | ★★ **法定人数公式** `quorumCap: 3` ＋注释 **`m = min(quorumCap, \|voters\|)`** | **`:1068`** | `settings/schema.js` 的 `vmu.meetings.quorum…` 键族（★ 本会话读过 `quorumRule` 这一族存在） | ★ **对照未做**（vmu 侧未读） | ★ **P-a 候选** |
| Q-2 | ★★ **两种模式并存**：`quorumMode: 'm-unanimous'`（v5）／`'all-unanimous'`（**v4 legacy**） | **`:1069`** | vmu：`kernel/meetings.js`／`meetingdomain.js`（本会话读过其存在与行数） | ★ **对照未做**；★ ★ **但"原版保留了 legacy 模式"是可判定的事实差异候选** | ★ **P-a（原版确有）** |
| Q-3 | ★ **复议门槛**：`reconsiderFloor: 0`；★ 生效门槛 = **`max(本对象标准, reconsiderFloor, quorumCap)`** | **`:1070`** | vmu：会议/表决相关键 | 对照未做 | ★ **P-a 候选** |
| Q-4 | ★ **引用限制成对出现，且失败语义【不同】**：`quotesPerMessageMax: 2` ⇒ 超限 **具名拒**；`quoteDepthMax: 3` ⇒ 超深 **折叠标注（不拒）** | **`:1071–1072`** | vmu：`v5r-pointer-contract`（本会话改过其 order） | 对照未做 | ★ **P-a 候选** |
| Q-5 | ★ `verdictMaxRounds: 3`／`academician: true`／`academicianLeads: true`／`memberMayRejectAssign: true`／`researcherCount: 3` | **`:1064–1067, :1073`** | vmu：会议/名册相关键族 | 对照未做 | ★ **P-a 候选** |

### 5.3 ★★ `:1087–1095` 会议发言模型（2.9.0）—— **最有价值的对照面**

| # | 机制（逐行读到） | 行 | vmu 对应（点名） | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| M-1 | ★★ **两阶段**：**轮流发言 → 举手发言**；★ **沉默不触发任何截止**，只看"**机会是否给完**"与"**是否还在举手/在飞**" | **`:1088`** | vmu：`packs/v5r/middleware/prompt-switches.js` 的 `MEETING_STATES = ['invited','others','first']`（本会话读过并**刚修过其默认分支** R6） | ★ **词汇层已见差异**：单体是**两阶段＋举手**；vmu 的发言态词表是 `invited/others/first`（★ 两者是**不同的切分维度**，不是同一组名字）⇒ ★ **行为对照未做**（vmu 侧会议体未读） | ★ **P-a 候选（单体侧确凿）** |
| M-2 | ★★ **唯一兜底**：`meetingHardLimitMs` 默认 **1800000**（30 分钟），钳到 **[300000, 7200000]**，★ **不提供无界**（0/∞ 无特殊语义） | **`:1089–1090, :1094`** | vmu：会议超时/上限键族 | 对照未做 | ★ **P-a（原版确有）** |
| M-3 | ★★ **明确废除旧机制**：**旧的 `recoverStallMs()`（2× `activityTimeoutMs`）"不再用于会议收束/放弃"** | **`:1090–1091`** | vmu：`kernel/activity.js`（★ 本会话读过：`TIMEOUT_BOUNDS`、FUTURE-ONLY） | ★ **对照未做**；★ 但这是**一条可核的历史决定**（原版从"2×活动超时"改成"单一墙钟硬界"） | ★ **P-a（原版确有）** |
| M-4 | ★★ **唤醒重试与"未达"语义**：`meetingWakeRetries` 默认 **5**，钳到 **[0,10]**；耗尽后记 **`unreached`**，且**当作"已获得机会"**（**不阻塞收束**，且与"选择不发言"**严格区分**） | **`:1092–1093, :1095`** | vmu：`vmu.activity.*`（唤醒/重试键族，本会话读过 `ACTIVITY_KEYS` 七键） | ★ **对照未做** | ★ **P-a 候选**；★ **`unreached` 这一格建议列入 vmu 侧核对清单**（"没被唤醒"与"选择不说"必须可区分） |

### 5.4 本节新增"没核"

1. ★ **`EV` 常量的字符串值未读** ⇒ ★ **事件名的实际文本未核**（我只读到 `EV.<名>` 的**标识符**）。
2. ★ **`:1087–1130` 的会议实现体未读**（本节读到的是**设置项与规则注释**；收束/放弃/计票的实现行号**尚未定位**）。
3. ★ **vmu 侧对照体（`kernel/meetings.js`／`meetingdomain.js`／`settings/schema.js` 对应段）本轮未读** ⇒ ★ **§5.2／§5.3 的"行为同不同"一律为「对照未做」**，★ **不得读成"一致性已验证"**。
4. ★ **`:1130–1061` 之外的会议/表决/名册/信箱/恢复具名范围未读**（优先级 4 未动用：本轮预算用尽）。
5. ★ 只读任务：未改代码／未跑 T1 或全量／未跑 git／未碰 `token.txt`。

## 6. ★★ 追加（Round 11/256 · task-238）—— 第四遍：**EV 事件名已读**、会议收束条件已定位、`unreached` 双向对照的**边界**

> ★ 追加（逻辑位置在 §5 之后；因落盘锚点排在 `§3` 前）。★ **只按行读**；★ 未读的逐条具名；★ 做不到的对照写 **「对照未做」**。

### 6.0 覆盖更新

| 行范围 | 状态 |
|---|---|
| **`:207–220`（`const EV = { … }` 逐行）** | ★★ **已读**（★ 第三遍缺的**事件名字符串**，本轮补齐） |
| **`:792–813`（`EV.meeting` 事件体，逐行）** | ★ **已读** |
| **`:7477, :7549, :7559–7581, :7606, :7637`**（会议运行态与收束条件） | ★ **已读（定点行）** |
| `vibe-math-vmu/kernel/meetings.js` **`:56, :84, :167–169, :197, :429, :498, :502`** | ★ **已读（定点行）** |
| 会议运行态的**整段实现体**（如 `:7470–7650` 全段） | ★ **未读**（只读了上述定点行） |
| `:592–900` 之外的 `t ===` 分支 | ★ **未读** |

### 6.1 ★★ `EV` 的真实事件名（`:207–220`，逐字）

| 常量 | 字符串值 | 派发分支（§5 读到的行） |
|---|---|---|
| `EV.institute` | **`vibe5/institute`** | `:597` |
| `EV.member` | **`vibe5/member`** | `:694` |
| `EV.task` | **`vibe5/task`** | `:714` |
| `EV.message` | **`vibe5/message`** | `:734` |
| `EV.delivered` | **`vibe5/delivered`** | `:771` |
| `EV.meeting` | **`vibe5/meeting`** | `:792` |
| `EV.debate` | **`vibe5/debate`** | `:814` |
| `EV.verdict` | **`vibe5/verdict`** | `:822` |
| `EV.queue` | **`vibe5/queue`** | `:861` |
| `EV.formal` | **`vibe5/formal`** | `:831` |
| ★ `EV.solve` | **`vibe5/solve`** | ★★ **在我读过的 `:592–900` 里【没有】对应的 `t ===` 分支** |
| ★ `EV.progress` | **`vibe5/progress`** | ★★ **同上：未在我读过的范围内出现分支** |

★ **口径（严格按行，不推断）**：`EV` **定义了 12 个**事件名，而我在 `:592–900` **读到 10 条 `t ===` 分支** ⇒ ★ **`solve`／`progress` 在这个范围内【没有】派发分支**；★ **不排除**它们在该范围**之外**被处理（或由别处消费）⇒ ★ **这两格记「未核」，不写"无实现"**（★ 本项目已因关键词式推断撤回过一条结论）。★ 另：`:593` 的前缀守门用的正是 **`'vibe5/'`**，与这 12 个名字**全部相容** ✓（读到的字面一致）。

### 6.2 ★ `EV.meeting` 事件体（`:792–813`，逐行）—— 它是**数据折入**，不是发言驱动

| # | 机制（读到的事实） | 行 | vmu 对应 | 行为同不同 | 判定 |
|---|---|---|---|---|---|
| MT-1 | ★★ **两条互斥路径**（注释逐字）：`make` ＝**插入**（新会议）；`minutes` ＝**同一场会议**的追加/覆盖（发言区／投票区），"两者互斥，且都只动 `meetings[]`" | **`:794–795`** | `kernel/meetings.js`（会议面） | ★ **对照未做** | ★ **P-a 候选** |
| MT-2 | ★ **`minutes` 路径**：合并 `Object.assign({}, cur.minutes, d.minutes)`；★ **会议 id 不存在 ⇒ 原样返回 `inst`（静默无操作）** | **`:796–803`** | vmu 会议纪要路径 | 对照未做 | ★ **P-a 候选** |
| MT-3 | ★ **`make` 路径**：`alloc = makeIdAllocator(inst)` ⇒ `idx = d.make(alloc)`；★ **同 id 已存在 ⇒ 原样返回（幂等，不重复建会）** | **`:804–807`** | — | 对照未做 | ★ **P-a 候选** |
| MT-4 | ★ **容量上限**：`meetings.length > 200 ? slice(last 200)` ⇒ ★ **会议记录保留最近 200 场** | **`:809`** | vmu 的裁剪/上限（本会话读过 vmu 有裁剪概念） | 对照未做 | ★ **P-a 候选** |
| MT-5 | ★ 分配器计数随事件写回：`out.counters = alloc.counters()` | **`:810`** | — | 对照未做 | ★ **P-a 候选** |

### 6.3 ★★ 会议**收束/发言**的真正落点（优先项 2 的答案）—— 定点行

| # | 机制（读到的事实） | 行 |
|---|---|---|
| SP-1 | ★★ 会议运行态持**多张按成员索引的表**：`inputs / speeches / extras / asked / **silent** / **unreached** / hands / spokeCount` | **`:7477`** |
| SP-2 | ★ **成员退出时清理**：`delete meeting.asked[id]; delete meeting.silent[id]; delete meeting.unreached[id]` | **`:7549`** |
| SP-3 | ★★ **`unreached` 的生产**：`N = 0` ⇒ **只尝试一次**；条件是"已尝试次数 ≤ N"，**超过才记 `unreached`**；记 `unreached[m.id] = now()` ＋ `history.push({what:'unreached', tries})` | **`:7559, :7568–7569`** |
| SP-4 | ★★ **`silent` 与 `unreached` 是两张不同的表**：`if (meeting.silent[id] !== undefined \|\| meeting.unreached[id] !== undefined) continue` ⇒ ★ **两者都不再被问，但语义不同**；注释逐字 **"注意不是'不尝试'：N=0 时也先试一次"** | **`:7575, :7578–7581`** |
| SP-5 | ★★ **收束（完成）条件**：`const done = meeting.roster.every((id) => meeting.asked[id] !== undefined \|\| meeting.silent[id] !== undefined \|\| meeting.unreached[id] !== undefined …)` ⇒ ★ **"问过 / 选择不说 / 唤醒未达"三者任一即视为"已给过机会"** | **`:7606`** |
| SP-6 | ★ 注释记录一条**已修的收束陷阱**："若在此照常'再问/判完成'，被拒成员会被重试到 `unreached` 而提前收束会议" | **`:7637`** |

★ **vmu 对应**：`kernel/meetings.js`（会议面；本会话读过其存在与行数）＋ `packs/v5r/middleware/prompt-switches.js` 的 `MEETING_STATES`。★ **行为同不同＝对照未做**（见 §6.4）。

### 6.4 ★★ 优先项 4：`unreached` vs "选择不发言" —— **单体侧已确凿；vmu 侧只读到边界，不敢给结论**

- ★★ **单体侧（确凿，逐行）**：★ **`silent`（选择不说）与 `unreached`（唤醒重试用尽）是两张独立表**（`:7477`），**都不再被问**（`:7575`），而在**收束条件里被并列计为"已给过机会"**（`:7606`），且 `unreached` **带 `tries` 计数入历史**（`:7569/:7581`）⇒ ★ **原版严格区分这两态** ✓（★ 这正是第三遍读到的设置注释 `:1092–1093` 的实现落点）。
- ★ **vmu 侧（我实际读到的行）**：`kernel/meetings.js:56/:84` 声明 `vmu.meetings.speechDefaultMs/speechMaxMs/speechExtendMs/speechExtendMax/speechQuotaPerMember`；`:167–169` 读取这些键；`:429` 运行态 `queue/speechUsed/interrupts/warnings/mutes`；`:498` 注释"**Speak. Rails: `speechMaxMs` / `speechExtendMs`+`speechExtendMax` / `speechQuotaPerMember`**"；`:502` `speak({ meeting, member, ms, text, verbatim, tokens, at })`。
  ⇒ ★ 在我**读到的这些行**上，vmu 呈现的是**发言时长/配额轨**（speak 的 rails），★ **我没有读到 `silent` 与 `unreached` 那样两张独立的"未发言原因"表**。
- ★★ **但结论仍记「对照未做」**：① 我只读了**定点行**，未读会议实现体整段；② ★ **我没有核** vmu 是否存在功能等价但**命名不同**的区分（例如用状态枚举/事件类型表达）⇒ ★ **不得**由"我没读到"推断"vmu 不能区分"（★ 本轮规矩）。
- ★★ **建议的下一步（一次即可判定）**：★ 在 `kernel/meetings.js` 里检索**"某成员在本次会议中未发言"的持久表达**（不是关键词 `unreached`，而是：收束/点名条件读的是哪个字段；该字段能否区分"被问过但沉默"与"根本没被唤醒/超时"）⇒ ★ **若不能区分 ⇒ 这是关于【面向模型的提示词】的真发现**（模型会把"没被叫到"读成"我选择不说"）✓。

### 6.5 本节"没核"

1. ★ **`EV.solve`／`EV.progress` 的派发位置**（`:592–900` 内无分支；范围外未读）⇒ **未核**。
2. ★ **会议运行态整段实现体**（我只读 `:7477/:7549/:7559–7581/:7606/:7637` 定点行）。
3. ★★ **vmu 侧能否区分"被问过而沉默"与"唤醒未达"** ⇒ ★ **对照未做**（§6.4 已写明理由与一次可判定的下一步）。
4. ★ `:592–900` 之外的全部 `t ===` 分支、以及会议/表决/名册/信箱/恢复的**其余具名范围** ⇒ **未读**。
5. ★ 只读任务：未改代码／未跑 T1（本轮由 Lead 跑）／未跑全量／未跑 git／未碰 `token.txt`。

## 3. ★ "没核"

1. ★ **`applyV5Event` 体 `:589–916` 未读** ⇒ 事件类型清单、边界处理、幂等性**全部没核**。
2. ★ **`makeFileBackend` 体 `:917–1034` 未读** ⇒ `onWriteFailure`／`onLoadProblem` 的**具体语义**（是否具名、是否静默）**没核**。
3. ★ **`makeSession` 体 `:1061–10928` 未读**（≈9,867 行）⇒ ★ **会议/发言/计票/表决、名册、信箱/群聊/通知、恢复——这些路径的行为【全部没核】**（★ 本节前的检索只给了**存在性线索**）。
4. ★ **工具注册区 `:10929–11473` 与解析器 `:11474–11597` 未读** ⇒ 工具面与序列化语义没核。
5. ★ **关键词 0 命中不得当结论**：`journal: 0`／`quorumRule: 0` 只作线索（§1.1）；★ 且 `quorumRule` 在 vmu 侧确实存在（本会话读过 `settings/schema.js` 与 `papers`／`meetings` 面）⇒ 该格**未核**。
6. ★ **未跑 T1／未跑全量门禁／未跑 git／未改任何代码**（本任务只读）；临时件未落仓内；**未碰 `token.txt`**。



---

## 7. ★★ 「被问过而沉默」 vs 「根本没被唤醒」 —— ★ vmu 侧判定（Round 12，由 Lead 作为唯一写者落地）

> ★ 本节内容来自 `task-243` 的读数；★ 它的持有者**没有落盘**，因为**该文件当时有并发写者**（★ 它 `pwsh` 读到 215 行、`read` 读到 272 行 ⇒ **有人在其读取之后追加了 57 行**）⇒ ★ **它拒绝用过期锚点追加**（会插错位置或与对方段落交错）✓ —— ★ 这是本阶段**第二次**"拒绝写"保护了成果（前一次是 pack 替换的设计陷阱）。

### 7.1 ★ 判定：**CAN DISTINGUISH（限定在【唤醒面】）** ＋ 半边 **UNDETERMINED**

**★ 可分的那半 —— 正向证据（★ 唤醒【当时】就把四种结局分成不同具名结果）**：

| # | 事实 | vmu 行 |
|---|---|---|
| **V1** | ★★ **重试用尽 ⇒ 具名 `unreached`**：`{ok:true, woken:false, unreached:true, retries: attempts-1, wakeRetries, unreachedWakes}`；★ 注释逐字 *"on exhaustion records the member as `unreached` - 'treated as having had its chance'"* | `kernel/meetings.js:966-978` |
| **V2** | ★ **另一条独立分支**：策略 `skip` ⇒ `{woken:false, skipped:true, skippedWakes}` | `:965` |
| **V3** | ★ 策略 `refuse` ⇒ **具名抛错** `VMU_STATE` | `:961-963` |
| **V4** | ★ **四类结局各有【自己的计数名】**（不是同一个"失败"桶）：`unreachedWakes`／`skippedWakes` | `:197`／`:977`／`:965` |
| **V5** | ★ **"发言"在事件流里是具名事件** `say({type:'meetings/spoke', …})` | `:580` |
| **V6** | ★ **未应答者被点名而不静默略过**（注释逐字 *"unanswered members are named, never passed over silently"*）＋ 可声明键 `vmu.meetings.unansweredInDenominator` | `:308`／`:152` |

**★★ 不可分／未读的那半（★ 这就是边界本身）**：★ **该区分是否被持久化成【每成员每场次的一格】**、★ **【收束/点名条件】是否读它**、★ **它是否被注入提示词** —— ★ **未读到**：`close({…})` 的其余部分（`:995-1187`）、落盘所经路径、vmu 里是否存在 `roster.every(...)` 式收束条件 ✓
★ **`kernel/meetings.js` 共 1199/1200 行，读到的不足 5%** ⇒ ★★ **未读半边是"未读"，不是"不存在"** ✓（★ 本节**从未**做"关键词 0 命中 ⇒ 不存在"的推断）

### 7.2 ★ 与原版的 P-a 对照（★ 引用第四遍读数，不重推）

| 原版 | 行 | ★ P-a 结论 |
|---|---|---|
| `asked`／`silent`／`unreached` **三张并列的表** | `vibe-math-v5r.js:7477` | ★ **vmu 有等价三态语义（V1/V2/V3），★ 但【载体不同】**：★ vmu 在**返回值 ＋ 计数器 ＋ 事件**里，★ 原版在**会议记录的持久字段**里 ✓ |
| 三者**都不再被问** | `:7575` | ★ vmu 侧对应语义**未读到** |
| 收束 `roster.every(id => asked \|\| silent \|\| unreached)` | `:7606` | ★ **口径两侧一致**：★ vmu 的 `unreached` 注释同样说 *"treated as having had its chance"`（`:967`） |
| `unreached` 带 `tries` 入历史 | `:7569`/`:7581` | ★ vmu 有 `retries: attempts-1`，★ **但在返回值里**；★ **是否入历史未读到** |

⇒ ★★ **不是缺失，是【载体差异】** —— ★ 而正因为它**可能只活在返回值里**，★ "**模型看不看得见**"就取决于**那一格是否被持久化并注入** ⇒ ★ **那正是未读的部分，★ 所以本裁定【不】断言风险已发生** ✓

### 7.3 ★ 下一步（★ 决定性的行范围）

★ **读 `kernel/meetings.js` 的 close() 一带（**拆前坐标 `:995-1187`**；R21 抽取后该文件为 1154 行，请按符号定位） 的 `close()` 体 ＋ `store`/`journal` 写入路径 ＋ 会议提示词段** ⇒ ★ **那才是"模型会不会把『没被叫到』读成『我选择不说』"的决定性范围** ✓

### 7.4 没核（★ 与"核了"分开）

1. ★ `close()` 体（`:995-1187`）、落盘路径、会议提示词段 —— **未读**（★ 上述未读半边）。
2. ★ vmu 是否存在 `roster.every(...)` 式收束条件 —— **未读到**。
3. ★ 本节由 Lead 代为落盘，**内容逐字来自 `task-243` 的读数**；★ **未跑门禁、未跑 git**。


---

## 8. ★★★ 那条链的端到端定论（Round 14 · task-245，由 Lead 作为唯一写者落地）

> ★ 本节逐字来自 `task-245` 的读数；★ **它的持有者没有落盘**，因为**行数在两种计量方法下对不上**（★ 它 `Measure-Object -Line` 量到 244 行、R12 同法量到 215 行、而 `read` 工具当时报 272 行）⇒ ★ **按纪律停笔**，★ 并建议**改用【内容锚】而不是行号** ✓ —— ★ 这是本阶段**第三次**"拒绝写"保护了成果。

### 8.1 ★★ 判定：**DISTINGUISHED BUT NOT PERSISTED**（★ 链在【第 2 环】断）

**第 1 环 · 唤醒面：分开 ✓**（R12 已定）：`kernel/meetings.js:961-978`（重试用尽 ⇒ 具名 `unreached:true` ＋ `retries`）／`:965`（`skip` 另一具名结局）／`:961-963`（`refuse` 具名抛）／`:197`＋`:977`＋`:965`（各结局**各自计数器**）／`:308`（未应答者被点名）。

**★★ 第 2 环 · 持久化：★ 断在这里**（以下均为读到的行）：
- ★★ **`close({…})` `:995-1038` 通读**：★ 它只读**三个开关**（`confirmPreviousMinutes` `:999-1005`／`committeeReportRequired` `:1006-1012`／`minutesActionsRequired` `:1013-1019`）＋ `markState(m,'closed')`／`m.closedAt`／`m.wallMs`／归档／计数 ⇒ ★★ **它完全不读任何"每成员发言/被问/未送达"的表** ⇒ ★ **"没被唤醒"这件事【在收束条件里根本不存在】**（★ 所以**不是**"收束条件把两者混在一起"那个选项）✓
- ★ **回执与关闭事件里没有成员级字段**：`:1035` `receipt = {at, action:'close', meeting, wallMs, turns, tokens, enforced, enforcedScope}` ＋ `:1036 pushReceipt(receipt)` ＋ `:1037 say({type:'meetings/closed', …})`；★ `:1038` 的返回值同样只有 `turns/tokens` ✓
- ★★ **journal 是【以成员为准】写的，但只写"发生过的事"**：`meetings/attended`（`:461` 带 `member`）／`meetings/left`（`:493`）／`meetings/spoke`（`:580`）｜`markState`（`:435/:486/:1022`）｜聚合 `m.turns`（`:539`）／`m.tokens`（`:540`）⇒ ★★ **一个从没被唤醒的成员【不产生任何事件】** —— 而"没被送达"**正是那件没发生的事** ✓
- ⇒ ★★ **每成员结局只活在【返回值】与【聚合计数器 `counters.unreachedWakes`】里** ⇒ **链在这里断** ✓
- ★ 诚实限定：**是否另有写入路径**（`store` 的 flush／`state` 里 `turns` 附近的每成员行）**未读** ⇒ 见 §8.3 ✓

**★★ 第 3 环 · 提示词：★ 看不见**
- ★ **会议提示块** `packs/v5r/prompts/v5r-blocks-a.js:623` 逐字：`meeting: '【研究所会议 {{ setting:vmu.turn.meetingId }} 进行中 —— {{ roleLabel }} {{ member }}】'` ⇒ ★ 它只告诉成员**"哪场会在进行"＋"你是谁"**，★ **没有一处**表达"你本轮是否被送达/是否被问过" ✓
- ★ `prompt-switches.js:52`／`:85-103` 的 `meetingStates`／`turn.meetingState` **只管【显示哪一段】**（`invited`／`others`／`first` ＝ "我是不是第一个发言人"），★ **不是**"我有没有被叫到" ✓
- ⇒ ★★ **一个从没被唤醒的成员，与一个"被问了但选择沉默"的成员，看到的会议块是同一个** ⇒ ★ **模型只能自己推断** —— ★ **正是"系统支撑不了的说法"** ✓

### 8.2 ★★ 修法（★ 本轮【不修】，只按你要求给排期精度）

★★ **三处必须【同批】**（★ 只做一处会留下新的"两视图不一致"）：
1. ★ **持久化**：★ 在 `unreached`／`skipped` 分支各写一条**以成员为准**的 journal 事件（形如 `meetings/unreached {member, retries}`）—— ★ **对齐原版**：★ 原版有 `meeting.unreached[id] = now()` 且 `tries` 入历史（`vibe-math-v5r.js:7477`／`:7569`）⇒ ★★ **今天 vmu 的 journal 对"被送达者"有记录、对"没被送达者"【不对称地没有】** ✓
2. ★ **提示词**：★ 让会议块（`v5r-blocks-a.js:623`）能表达成员**自己的参与状态**，★ 至少分开"被送达而未发言"与"未被送达" ✓
3. ★ **收束条件**（可选，★ **且必须在 1 之后**）：★ 若要"人人都获得过机会"式收束（★ 原版 `roster.every(asked||silent||unreached)`，`:7606`），★ **必须在有持久字段之后才谈得上** —— ★ 今天的 `close()`（`:995-1038`）**连读都没读** ✓

### 8.3 ★ 已读／未读（★ 两边都写）

**已读**（约 120 行）：`kernel/meetings.js` 的 `:152`／`:197`／`:215`／`:273`／`:280-292`／`:308`／`:355-385`／`:435-493`／`:539-540`／`:580`／`:955-1050`（含 `close()` 全程 `:995-1038`）｜`packs/v5r/prompts/v5r-blocks-a.js:623`／`:718`｜`prompt-switches.js:52`／`:85-103` ✓
**未读**：`kernel/meetings.js` 的 **`:1050-1187`**（听证/上诉/纪律/纪要等）｜★ **`store` 的写入与 flush 路径**（★ 只读到调用点，**没读 flush 实现**）｜★ `v5r-blocks-a.js:615-625` 那个**数组形的会议块全文**（只读到键名）｜★ 其余会议提示词段与 `packs/*/middleware/*` 的注入面 ✓

### 8.4 没核（★ 与"核了"分开）

1. ★ **是否另有持久路径把每成员结局写进 `state`/`store`** —— **未读** ⇒ ★ **"只活在返回值里"是【我读到的三条写路径】的结论，不是全仓结论** ✓
2. ★ **`:718` 会议块全文是否含参与状态** —— 只读到键名 `meeting:` ⇒ ★ 第 3 环的"看不见"以 `:694` 的**单行形**为据 ✓
3. ★ 全程**没有**做"关键词 0 命中 ⇒ 不存在"的推断 ✓（★ `meetings/unreached` 事件**没在读到的行里出现**，★ 记为**未读**，不写"不存在"）✓
4. ★ **未跑 T1／全量／git**；★ **未改代码**；★ 未碰 `token.txt` ✓
