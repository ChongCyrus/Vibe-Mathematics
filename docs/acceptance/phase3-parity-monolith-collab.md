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

## 3. ★ "没核"

1. ★ **`applyV5Event` 体 `:589–916` 未读** ⇒ 事件类型清单、边界处理、幂等性**全部没核**。
2. ★ **`makeFileBackend` 体 `:917–1034` 未读** ⇒ `onWriteFailure`／`onLoadProblem` 的**具体语义**（是否具名、是否静默）**没核**。
3. ★ **`makeSession` 体 `:1061–10928` 未读**（≈9,867 行）⇒ ★ **会议/发言/计票/表决、名册、信箱/群聊/通知、恢复——这些路径的行为【全部没核】**（★ 本节前的检索只给了**存在性线索**）。
4. ★ **工具注册区 `:10929–11473` 与解析器 `:11474–11597` 未读** ⇒ 工具面与序列化语义没核。
5. ★ **关键词 0 命中不得当结论**：`journal: 0`／`quorumRule: 0` 只作线索（§1.1）；★ 且 `quorumRule` 在 vmu 侧确实存在（本会话读过 `settings/schema.js` 与 `papers`／`meetings` 面）⇒ 该格**未核**。
6. ★ **未跑 T1／未跑全量门禁／未跑 git／未改任何代码**（本任务只读）；临时件未落仓内；**未碰 `token.txt`**。

