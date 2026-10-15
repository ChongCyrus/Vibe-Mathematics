# task-53 Round 7 · falsify 第 6–7 族（human 审批闸 / tasks 环检测）＋ 可核的"值不值得接族"判据

> 累计：**7 个族 / 15 个单点缺陷**，全部"未变异绿 / 变异红"。
> 本轮新增：`human`（3 个变异）＋ `tasks`（2 个变异）；并把配方里两条**只能靠自觉**的规则变成**库会拒的检查**。
> 纪律：未跑全量 sweep、未 `regen-all`、未 git；变异体只写 `D:\_tmp` 且自建自删（有断言）；**未改任何他人测试**；集合断言一律同带非空前置（RULE E 指纹**零新增**）。

---

## 1. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| **第 6 族** | `human` 审批闸：未批不生效 / 批准必解除 / 沉默不等于同意 | `tests/vmu-human-falsify.test.mjs`（**12/0**；3 处单点变异） |
| **第 7 族** | `tasks` DAG 守卫：环在两个写入口都被具名拒 | `tests/vmu-tasks-falsify.test.mjs`（**9/0**；2 处单点变异） |
| C · 可核判据 | `familyEligibility()`（**值不值得接族**的机械判据）＋ `controlFields`（**控制方向**的机械检查，新码 `CONTROL-FIELD-ABSENT`） | `tests/_lib/falsify.mjs:300`（eligibility）、`:165`（`controlFields`）、`:78`（新码）；自证在 `tests/vmu-activity-falsify-lib.test.mjs §5`（5 条断言） |
| — | 本报告 | `_handoff/vmu/activity-round7-report.md` |

---

## 2. A · 第 6 族：`kernel/human.js` 的审批闸

**不变式**：*"a gated action does not run while no human has approved it"*，以及该面自己写下的 **THE ONE INVARIANT WORTH STATING**：超时默认是 `hold`，**绝不是** `default-allow`（"silence is never consent"）。

**探针读数**（全部带控制方向）：
- 未批 ⇒ `approvalDecision` 返回 `VMU_HUMAN_APPROVAL_PENDING`（`queued:true`），`gate()` **抛出同名拒**，**被包装的方法真的没跑**（`ranWhilePending:0`），同一 `(action, subject)` **只入队一次**；
- 批准后 ⇒ 同一动作 `state:'allowed'`，**被包装的方法真的跑了**（`ranAfterAllow:1`）；
- 超时 ⇒ t=1000 建请求、t=61000 再问：`expiredHeld:true` 且仍是 `VMU_HUMAN_APPROVAL_PENDING`；**即使部署把 `defaultAllowAcknowledged` 设为 true**，仍然 hold（声明的是 hold ⇒ 承认那个开关并不改变声明）；
- 控制 ⇒ 未声明进 `gatedActions` 的动作**原样放行**（零机制），所以不是"什么都拒"。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **闸门全开**（未声明分支被写死为真） | `human.js:312`（`if (c.gatedActions.indexOf(act) === -1) {`） | `pendingCode:'allowed'`、`ranWhilePending:1`（**未批动作立即生效**，什么都没入队） |
| **批准后不解除**（已批准分支被跳过） | `human.js:340`（`if (rec.decidedAt !== null && rec.decision === 'allowed') {`） | `afterAllowState:'VMU_HUMAN_APPROVAL_DENIED'`、`ranAfterAllow:0` —— 更糟：**人类批了，系统报"被拒"** |
| **超时默认漂移**（`hold` → `default-allow`） | `human.js:123`（`… : 'hold',`） | 在 `defaultAllowAcknowledged:true` 的部署里 `expiredAckState:'allowed-on-timeout'`、`expiredAckAllowed:true`（**沉默开始等于同意**） |

---

## 3. B · 第 7 族：`kernel/tasks.js` 的 DAG 守卫（F35）

**为什么值得接**：该模块头部自己记录了修好的缺陷——*"a cycle used to be constructible and simply never became ready — a silent deadlock"*。探针读四个方向：
- **create 路径**：先让 t-1 依赖**尚未存在**的 t-2（合法：deps 可点名未来任务），再用 `deps:[t-1]` 创建 t-2 ⇒ 该创建**闭合环** ⇒ 具名拒且**任务未创建**（`createdAfterCycle:1`）；
- **setDependencies 路径**：t-2 → t-1 之后给 t-1 设 `[t-2]` ⇒ 具名拒且**边集不变**（`depsAfter:''`）；
- **自环**：同样具名拒（这是"只查自环"变异的**窄控制**）；
- **控制**：一条合法 DAG 边被**接受**（`dagAccepted:true`）。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **create 路径跳过 DAG 守卫**（两行整段删除） | `tasks.js:219-220` | `createCycleCode:null`、`createdAfterCycle:2`（**环被真的创建出来** —— 头部记录的静默死锁回来了） |
| **只查自环**（传递遍历被掐掉） | `tasks.js:76`（`const sub = walk(d, new Set())`） | `setCycleCode:null`、`depsAfter:'t-2'`（2-环被接受），而 `selfLoopCode` **仍是** `VMU_TASK_DEPENDENCY_CYCLE` ⇒ 变异**窄**且控制组读得出来 |

---

## 4. C · "什么时候不值得接一个族"——从散文变成**库会拒的检查**

Round 5/6 的配方里，有两条规则只能靠作者自觉：**"探针必须有控制方向"**、**"这个面值得接族吗"**。本轮把两条都做成机械判据（纯追加，旧 API 不变）：

### 4.1 `familyEligibility({ module })`（`falsify.mjs:300`）——值不值得接
| 判据 | 机械读法 | 不合格时 |
|---|---|---|
| **有可移除的判定点** | 代码里 `throw refuse(`／`return { ok: false`／`return refuse(` 的出现次数 ≥ `minDecisionPoints`（默认 1） | `reasons: 'no removable decision point: 0 < 1 — a module with no branch to remove is not a falsify family'` |
| **有具名拒的词汇** | 至少 1 个 `VMU_*`/`MATH_*`/`ARCHIVE_*`/`SCRIPT_*` 码（否则红读数**无法具名**） | `'no named refusal code …'` |
| **有不依赖宿主的工厂** | 导出了 `create*` 工厂（否则探针造不出面） | `'no exported create* factory …'` |

自证（`vmu-activity-falsify-lib.test.mjs §5`）：`kernel/tasks.js` ⇒ `eligible:true`（`factory:'createTasks'`、`decisionPoints>0`、码含 `VMU_TASK_DEPENDENCY_CYCLE`）；`tests/_lib/strip-comments.mjs` ⇒ **`eligible:false` 且给出原因**（没有判定点、没有工厂）——这就是"**不许为凑数接垃圾族**"的可核形式。

### 4.2 `controlFields`（`falsify.mjs:165`，新码 `CONTROL-FIELD-ABSENT`）——控制方向
家族 case 可声明 `controlFields: ['goodAcked', …]`；库要求**绿读数里这些字段存在且为真**，否则报 `CONTROL-FIELD-ABSENT` 并让家族 `ok:false`。理由写在码里：*"只读'坏路径没发生'的探针，在一个根本没接线的面上也全绿"*。自证：故意声明一个不存在的字段 ⇒ 具名红；换回真实字段（`passes`/`fired`）⇒ 绿（**不是恒红**）。
本轮两个新族都声明了：human `['ungatedAllowed','afterAllowState','expiredHeld']`、tasks `['dagAccepted','selfLoopCode']`。

### 4.3 现在**八条**规则都是机器判的（不再靠自觉）
| # | 规则 | 检查者 / 拒绝码 |
|---|---|---|
| 1 | 这个面值得接族（判定点／具名码／工厂） | `familyEligibility()`（三因由具名） |
| 2 | 探针必须有控制方向 | `CONTROL-FIELD-ABSENT` |
| 3 | 锚点必须真的命中且唯一 | `MUTATION-NOT-APPLIED` |
| 4 | 变异体必须能导入 | `MUTANT-UNIMPORTABLE` |
| 5 | 真模块必须绿 | `REAL-MODULE-NOT-GREEN` |
| 6 | 读数必须有区分度（变异不能是空转） | `PROBE-DOES-NOT-DISCRIMINATE` |
| 7 | 变异体只能写 `D:\_tmp` 且必须删除 | `UNSAFE-TMP-DIR` / `TEMP-NOT-CLEANED` |
| 8 | 家族不能是空的（空 `cases`／零结果） | `MUTATION-NOT-APPLIED`（`falsifyFamily` 拒空）＋ `results.length > 0` 断言 |

**结论**：下一轮接族时，"该不该接"由 `familyEligibility()` 回答，"接得对不对"由 7 个码回答——**唯一还需要人判断的只剩"这条不变式值不值得写进文档"**。

---

## 5. 原样命令与退出码（定向单跑）

```
node tests/vmu-human-falsify.test.mjs        -> === VMU HUMAN FALSIFY: 12 passed, 0 failed ===      exit=0
node tests/vmu-tasks-falsify.test.mjs        -> === VMU TASKS FALSIFY: 9 passed, 0 failed ===      exit=0
node tests/vmu-resume-falsify.test.mjs       -> === VMU RESUME FALSIFY: 9 passed, 0 failed ===     exit=0   (R5/R6 族，未回归)
node tests/vmu-fidelity-falsify.test.mjs     -> === VMU FIDELITY FALSIFY: 10 passed, 0 failed ===  exit=0
node tests/vmu-mailbox-falsify.test.mjs      -> === VMU MAILBOX FALSIFY: 10 passed, 0 failed ===   exit=0
node tests/vmu-chat-falsify.test.mjs         -> === VMU CHAT FALSIFY: 8 passed, 0 failed ===       exit=0
node tests/vmu-panel-falsify.test.mjs        -> === VMU PANEL FALSIFY: 9 passed, 0 failed ===      exit=0
node tests/vmu-activity-falsify-lib.test.mjs -> === VMU FALSIFY LIB: 27 passed, 0 failed ===       exit=0   (+5 条 eligibility/控制方向自证)
node tests/audit-prompt-behaviour.mutants.mjs-> === VMU PROMPT BEHAVIOUR MUTANTS: GREEN ===        exit=0   (verify 的消费者，纯追加兼容)
node tests/audit-declaration-criterion.test.mjs -> 71 passed, 4 failed                             exit=1
node tests/audit-scope-classification.test.mjs  -> 38 passed, 0 failed                             exit=0
node tests/audit-code-size.test.mjs             -> 9 passed, 0 failed                              exit=0
node tests/audit-dependency-cycles.test.mjs     -> 5 passed, 0 failed                              exit=0
node tests/audit-vmu-orphan-methods.test.mjs    -> 4 passed, 0 failed                              exit=0
```

**`audit-declaration-criterion` 的 4 条红，没有一条属我**（RULE E `current=69 baseline=67`，新增的 **2** 个指纹都在别人文件里）：
1. `regen-all --check really runs green`（生成链，Lead 的 regen 步骤）；
2. RULE E shapes B/C/D：`audit-fs-purpose.test.mjs:136 [B]`（`importerFiles`/`knownFiles` 可能双空）；
3. RULE E 新增指纹：`audit-fs-purpose.test.mjs:B:importerFiles~knownFiles`（同一条）；
4. RULE E 新增指纹：`vmu-meeting-parity.test.mjs:A:roster`（`roster.every(...)` 缺非空前置）。
⇒ **请对应主人加非空前置**（`x.length > 0 && x.every(...)`）；我的文件零新增。

---

## 6. 累计覆盖（7 族 / 15 个单点缺陷）

| 族 | 面 | 不变式 | 变异数 |
|---|---|---|---|
| 1 | `kernel/mailbox.js` | ack 只在投递成功之后 | 2 |
| 2 | `kernel/chat.js` | 配额与禁言真的强制 | 2 |
| 3 | `kernel/panel.js` | 子任务字段真的写入 ＋ 状态词表真的校验 | 2 |
| 4 | `kernel/resume.js` | 未读的快照永不被覆盖（含"读失败不算读过"） | 2 |
| 5 | `kernel/fidelity.js` | C-45：布尔票被强制改写为 0.5 弃权，且值就是 0.5 | 2 |
| 6 | `kernel/human.js` | 未批不生效／批准必解除／沉默不等于同意 | 3 |
| 7 | `kernel/tasks.js` | 环在两个写入口都被具名拒（自环与整图环） | 2 |

---

## 7. 未做项 / 下一轮候选

1. **`activity` future-only 未再证伪**（R6 的 B 选项之一）：它在 `tests/vmu-activity-falsify.test.mjs` 里已由 Round 3/4 的手写形态覆盖，故本轮未重复接族；若要统一到家族形态，约 20 行（10 行式 ＋ 控制字段）。
2. **`familyEligibility` 只扫"判定点数量"**：它不判断这些判定点**是否值得证伪**（那是人的判断）。这是有意的：机械判据只回答"能不能接"，不回答"值不值得写进文档"。
3. **`controlFields` 目前是"存在且为真"**：不能表达"应当为某个具体值"；需要更细的断言时，家族文件里再加一条 `ok(...)`（本轮的 human/tasks 两族都这么做了）。
4. **未跑**：全量 sweep、`regen-all`、`git`（Lead 统一）。
5. **临时文件**：两族的变异体全部由库写进 `D:\_tmp` 并在 `finally` 删除（每文件 `leftovers.length === 0` 断言）；我的 scratch 无残留。
