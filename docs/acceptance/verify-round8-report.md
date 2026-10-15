# Round 8 · vmu-verify（task-59）交付报告

> 任务：`task-59`（A F44 正路断言；B `set` 归属常驻断言；C 矩阵 v7／证据；D falsify 与门禁复核）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；凭据副本用完即删；未动他人 profile/进程；**未改他人文件**。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 一句话 |
|---|---|---|
| **A F44 正路** | ✅ **已闭合** | R7 只证 3/6（缝被消费＋失败具名）；R8 按**真实 turn 形状**（`open` ⇒ `assemble`）补上正路 ⇒ 新套件 **13/0**，目标六条**全部有证据（6/6）** |
| **B `set` 归属** | ✅ **已闭合** | 新套件 **15/0**：schema 收 `by`/`reason`；**非所有者 ⇒ 具名拒且不入台账**；**不给 `by` ⇒ office 路径＋明文披露**；`reason` 落 `lastRuntimeWrite`；＋控制组与委派路径 |
| **C 矩阵 v7／证据** | ✅ | v7 标题＋**§9.7**（9.7.1 正路／9.7.2 归属／9.7.3 真缺陷／9.7.4 B1–B5／9.7.5 activity＋RULE E／9.7.6 主干临时状态**已解决**／9.7.7 **F2 投递真机具备**／9.7.8 **已落未断言**两条） |
| **D 指纹复核** | ✅ | `audit-declaration-criterion` ⇒ **`current=67 = baseline=67`**（我两条新测试**零新增指纹**；唯一 FAIL 仍是 Lead 的 `regen-all --check`） |
| ★ **R8 第 7 次会话** | ✅ | **F2 正面半场（投递）真机具备**：回执 `delivered:true/refused:null/failures:0` ＋ **我的服务 stdout 打出 `[vmu-report-sink]` 行**（独立旁证）＋ `turn/end=completed` |
| ⚠️ **主干临时不可构造** | ✅ **已解决** | `ballotbox.js:544` 的 `cast is not defined`（reader-c 的 G7 中间态）⇒ 已修；我复跑 5 个套件全绿 ⇒ 标记撤下 |

---

## A · F44「公告真的进入投递文本」＝已闭合（3/6 → 6/6）

**R7 的缺口**：core 只证"缝被消费"＋"失败具名"；**正路未证**（它递进去的 block 没进装配上下文）。
**R8 的做法**（按真实形状，先探清再断言）：`createTurnOrchestrator(...).open({member, phase, statusBlock})` **构造** turn ⇒ `assemble(turn)` **产出投递文本**（`kernel/turn/index.js:316/336/396`）。★ 我第一版只调 `open()`，拿到的 `{ok, turn}` 里**没有 text** ⇒ 一度以为"验不到"；查清装配在 `assemble` 后**正路立刻可证**（这恰好说明 R7 那次为何只到 3/6）。
**新套件** `tests/vmu-turn-notice-source.test.mjs` ⇒ **13 passed / 0 failed EXIT=0**：
- **正路（状态块通道）**：外部 `noticeSource` 一行 ⇒ **投递文本里真的有它**，且**确实经过交给提示词管线的 `statusBlock`**；turn 自己的状态块仍在（**追加非替换**）。
- **一次性**：take-once 源在第二次装配**不重复**公告；每次装配各问一次源。
- **pack 通道（`noticeBlock`）**：块收到两行并**前置**在文本最前，且**不进入状态块**（与语料一致）。
- **失败具名（回归）**：源抛错 ⇒ `VMU_ENGINE_UNAVAILABLE`（"notice source failed"），**不静默丢公告**；非数组/空白项被忽略且不崩。

## B · `vibe_vmu_set` 归属＝已闭合

`tests/vmu-set-attribution.test.mjs` ⇒ **15 passed / 0 failed EXIT=0**（**在健康树上复跑后的最终读数**）：

| # | 事实 | 证据 |
|---|---|---|
| ① | **已发布 schema 接受 `by`/`reason`** | `parameters.properties.by`/`.reason`；`additionalProperties:false`、`required:['key']`（仍严格）；**真机上模型也确实带上了**（§9.7.7：`by:"office"`, `reason:"scripted slice"`） |
| ② | **非所有者 ⇒ 具名拒，且不入台账** | 工具**返回** `{ok:false, code:'VMU_NOT_PERMITTED'}`（含 `declared owner: role:chair`）；`resolved` 值不变、`runtimeWrites` 不增；**内核 API 则 throw**（一个契约两种形状） |
| ③ | **不给 `by` ⇒ office 路径 ＋ 明文披露** | `ownerCheck === 'exempted (no \`by\` given: office path, DISCLOSED)'`、`by:null`、`source:'runtime'` ⇒ **静默通道不存在** |
| ④ | **`reason` 落台账** | `status().settings.lastRuntimeWrite = {key, by:null, reason, ownerCheck(DISCLOSED), action:'set', …}` |
| ＋ | **控制组**：声明所有者（`role:chair`）可写（`identified`）；**委派**：列入 `vmu.safety.delegableKeys` 后非所有者可写（`delegated`）⇒ ② 不是"一律拒" |

★ **对 Lead 提示的回应**：core 探针那 1 红是**它自己的阈值写错**（拒绝发生在入账之前＝应有行为）——我这条按**正确语义**写：**拒 ≠ 入账**，并把"不入账"**显式断言**（`runtimeWrites` 不增）。

## C · 矩阵 v7／证据

- **§9.7.1** F44 正路闭合（含"只调 open 会只测构造器"的方法论）。
- **§9.7.2** `set` 归属闭合（四事实＋控制＋委派）。
- **§9.7.3 真缺陷入册（owner＝core）**：**`vmu.paper.finalizer` 域外值静默回落**——`schema.js` 是 `type:'string'` 无 `enum`；`paper.js:104-107` `FINALIZERS.indexOf(raw)===-1 ? 'editor' : raw`（域＝`['editor','contributor','any']`）⇒ 写 v5r 的 `'academician'` **不报错不告警**、静默按 `'editor'` 执行。修法＝schema 加 `enum` ＋ `paper.js` 改**具名拒**（不扩值域，因角色名进内核违反 D5）；pack 侧值域探针 **PASS**。
- **§9.7.4** pack 保真 **B1–B5** 具名（B5 `stallAutoMeetingMs` 为**有意分歧**：`idleAction` 域结构上不能开会，且不许臆造 `'auto-meeting'`）。
- **§9.7.5** activity R8 两族（`vmu-doc-invariant-falsify` 9/0——**运行时读文档**作控制字段，文档被改软也会红；`vmu-storepolicy-falsify` 9/0）＋ **RULE E `67=67`**。
- **§9.7.6** 主干临时状态**已解决**（见下）。
- **§9.7.7** ★ **F2 投递真机具备**（三角度，见 §E）。
- **§9.7.8** **已落但未断言**两条（owner＝reader-c）：**B①** `agendaClose/agendaItems`、**G7** `ballotbox.cast`／`mailbox.send` 的 `durableQueue` ⇒ 如实登记"**已落、未断言**"，**不记为具备**。

## D · 指纹与门禁复核

`node tests/audit-declaration-criterion.test.mjs` ⇒ `RULE E fingerprints: current=67 baseline=67`（新增 0／消失 0）＝**我那两条新套件零新增指纹**；唯一 FAIL 仍是 **`regen-all --check`**（Lead 的收尾 regen）。两条新套件已登记 `files[]`，`audit-package-membership` **13/0**。

## E · R8 第 7 次会话：F2 正面半场（投递）真机具备

- **装配**：`overlay v5` 用 `!!js` 把 transport 写进框架行的 `config.deliver`（loader patch 是**替换** config ⇒ 报告声明与 transport **合成一份**）。
- **① 回执**：`report tick`（**L25/seq23**）⇒ `declared:1, fired:[{name:"artifacts-threshold", channel:"log", text:"【成果阈值】artifacts=9 已达阈值 5", **delivered:true**, refused:null, error:null}], **delivered:1, failures:0**, audit:{appended:true}, enforced:[11 键]` ⇒ `refused` 由 R7 的 `VMU_REPORT_NO_TRANSPORT` **变为 `null`**。
- **② 我的服务 stdout（独立旁证，不在 assistant 的 harness 里）**：`[vmu-report-sink] {"name":"artifacts-threshold","to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}` ⇒ **真 sink 真被调用**。
- **③ 模型自述 ＋ 回合**：自述该报告 `delivered:true, drives:false`；**`turn/end` seq48 = `completed`**。
- 发布清单仍 **78／52**。

## F · R8 期间的"主干临时不可构造"（已解决，留作方法论）

`kernel/ballotbox.js:544` 曾抛 `ReferenceError: cast is not defined`（该文件只有 `:186 const castBody`，return 仍用旧名）⇒ **凡 `createKernel` 的套件在构造期即崩**（不是断言红）⇒ 我**立即报 Lead ＋ owner**，并**未改他人文件**；owner 确认是其 **G7 中间态**（先抽 `castBody`、后补 `cast` 包装，两步之间被快照抓到），现已修。★ **我复跑确认**：`vmu-set-attribution` **15/0**、`vmu-turn-notice-source` **13/0**、`vmu-ballotbox` **13/0**、`vmu-mailbox` **48/0**、`vmu-meeting-parity` **178/0**（全 EXIT=0）。
**教训**：**"构造期异常"与"断言失败"必须分开报**——前者污染的是**整套件**，写成"某条断言红"会把读数带偏。

## G · 清理与交回

- **清理**：临时凭据副本＋含账号 id 的 provider 补丁已删；`7804` 已停；相关端口全 free；未按时间窗批量删；未动他人 profile/进程。
- **交回 Lead**：A/B/C/D 全绿；F2 投递真机具备；一条真缺陷（paper finalizer 静默回落，owner＝core）；两条"已落未断言"（owner＝reader-c）；主干断裂已解决并复跑。**报告**：本文件＋`04-parity-matrix.md`(v7)＋`05-framework-strength-evidence.md`。

## H · 追加：目标 5 端到端演练（reader-b task-63）＝通过，且抓出**两个真缺陷**

- **演练**：`ALL ASSERTIONS PASSED (spawns=20, mirrors=13)` EXIT=0 —— 四库真机 B 段（`live kind/elementKind` ≡ 耐久作业信封，含 **array/symbolic**）／`cancel` 中途取消（子进程确死、**0 重跑**）／**SIGKILL 内核进程 ⇒ 新实例走 `interrupted-then-requeued` 真重跑到 settled**（attempts=2）／镜像给全新实例**采纳 8 且 0 spawn**／两实例竞同一 jobId ⇒ 一赢一 `VMU_MATH_JOB_ID_TAKEN`。
- **两个真缺陷（我核过代码 ＋ 复跑其回归）**：① **取消被"后写者"改写**——`cancel()` 标 `cancelled` 后，被 `terminate()` 杀掉的子进程 `close` 让执行路径继续写盘，把状态改回 `settled`/`failed`；现执行路径**先判取消**、状态**粘住**（`kernel/mathjobs.js:528/560/567/724`）。★ **R6 的取消测试看不见它**（那套假句柄的 `done` **永不结算** ⇒ 测不出真实 kill 语义）。② **信号死亡被当成成功**——`exitCode === null`（SIGKILL）时旧码 `Number(null) === 0` ⇒ 记 settled/exit 0；现记 **`failed`** ＋具名拒 **`VMU_MATH_HARNESS_FAILED`**（`mathjobs.js:618-629`，消息含 **`signal`**），回执新增 **`signal`** 字段（`:186`）。
- **回归**：`tests/vmu-job-cancel.test.mjs` ★我复跑 **9/0**（+2）、`vmu-mathjobs` **10/0**。
- **具名未证**：跨机崩溃（同机同 fs）；分支 ①/③ 端到端命中；**孤儿进程是宿主边界**（服务被 SIGKILL 时 OS 不保证）；Lean 面未做"杀内核"演练；**"续算"＝重跑整段**（非中间检查点，未实现未声称）；同号**后续覆写**仍 last-writer-wins（A4 只证占号）。
- **方法论**：其第一版"粘住"守卫误用 `r.stdout`（而 `const r = out || {}` 在同块更后）⇒ **TDZ `ReferenceError` 被 catch 吞成 `failed`**（症状像"守卫没生效"）⇒ 改 `out && out.stdout` 通过。**症状 ≠ 根因。**
