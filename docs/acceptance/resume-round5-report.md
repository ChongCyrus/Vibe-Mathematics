# Round 5 · task-35 报告：F35 任务图环检测 · F39 写域 advisory · F49–F51 复核

> 作者：v5r-reader-a。判据：`05-framework-strength-evidence.md` 的 F35／F39／F49–F51、task-35 A–D。
> 本轮写范围：`kernel/tasks.js` · `kernel/resume.js` · `kernel/lifecycle.js` · `kernel/scheduler.js` · `kernel/members.js` · `kernel/budget.js` · `docs/07` · `docs/26` · 本报告。
> 实际改动：`kernel/tasks.js`（F35＋F39）＋ `docs/07 §15`／`docs/26 §7`；`resume/lifecycle/scheduler/members/budget` 本轮**未改**（无需要）。

---

## 1. A · F35 依赖图环检测（**已实现**）

**问题**：`unmetDeps` 只回答"这个依赖完成了没有"（`kernel/tasks.js` 的开工门：`transition` 到 `doing/done` 时 `VMU_STATE` unmet dependencies），因此**环是可以构造的**，而含环的任务永远不 ready ⇒ **静默死锁**（既无拒绝，也无路径解释）。

**实现**
- `findDependencyCycle(startId, deps, getDeps)` —— **模块级、导出、纯函数**（`kernel/tasks.js:52-79`）。从 `startId` 的新边出发沿 `getDeps` 走，找回到 `startId` 的路径；返回**环路径**（例 `['t-2','t-1','t-2']`）或 `null`。自环（`deps` 含 `startId`）返回 `[start,start]`。
- **创建期**：`create()` 在铸 id **之后**（`id` 已知）跑同一守卫 ⇒ 自环（调用方点名"我将要拿到的 id"）在创建期就被拒（`kernel/tasks.js:214-218`）。
- **deps 变更处（真正的风险点）**：新增 `tasks.setDependencies(id, deps, { expectedRevision })`（`kernel/tasks.js:235-247`）—— 沿 CAS 纪律（`requireFresh` + `bump`），先跑守卫再落库。**两节点/长环只能在这里出现**（创建期新节点尚不在图里）。
- **拒绝形状**：`VMU_TASK_DEPENDENCY_CYCLE`，message `dependency cycle: t-3 -> t-1 -> t-2 -> t-3`，**hint 里给 JSON 的环路径**，`err.detail = { id, cycle }`（`refuse()` 本轮扩了第 4 参 `extra → err.detail`，向后兼容）。
- **合法 DAG 不受影响**：文档化语义"依赖可以点名尚未存在的任务（开工时才校验）"**保持**（测试断言 `deps:['t-999']` 仍可创建，`status().blocked` 具名列出）。
- **导出面**：`findDependencyCycle`、`normalizeWriteScope`、`scopesOverlap`（供其它面复用同一规则）。

**断言（`tests/vmu-tasks-dag-and-scopes.test.mjs`，41/0 exit 0）**：自环（创建期＋`setDependencies` 两处）／两节点环（回边被拒且未落库）／**三跳长环（完整路径 `t-3>t-1>t-2>t-3`）**／合法 DAG 通过＋开工门语义不变＋CAS 陈旧拒绝／未知任务拒绝。

---

## 2. B · F39 写域 advisory（**已实现，语义写实**）

**语义（三条，回答"谁建议／是否强制／如何声明"）**
1. **谁建议**：**任务创建者**（成员/所办）在 `create({ writeScopes: [...] })` 里声明"我打算动这些路径"——框架**不替任何人决定**范围，也不从别处推断。
2. **是否强制**：**永不强制**。写域**不阻断** claim/assign/transition（测试直接断言"重叠仍可 assign 并进入 doing"），也不阻断任何文件写入（framework 没有 fs 白名单式的写域闸，那是 D-53 的事）。它的唯一产物是**报告**：`status().writeScopeConflicts`（活跃任务两两比对，命中即列 `{a,b,scopeA,scopeB}`）与 `list()` 行的 `writeScopes`。
3. **如何声明**：`create({ writeScopes })`（**真读者**＝内核工具面，见 §5 接线）；规范化规则**沿用团队板契约**：反斜杠→`/`、去 `./`、去尾 `/`、**拒绝**空/绝对路径/盘符/含 `.` 或 `..` 段；重复项折叠；**被拒条目逐个具名回报** `skippedScopes:[{what,why}]`（绝不静默丢）。
- **零机制**：不声明 ⇒ `writeScopeConflicts` 为空、行里 `writeScopes: []`，行为与之前逐字相同。
- **持久化**：`writeScopes` 是任务对象的一部分 ⇒ `tasks.snapshot()/restore()` 自动携带（测试断言跨"进程"回来，且恢复后 advisory 视图自洽）。

**与既有 advisory 的区分（诚实）**：`kernel/workflow.js` 的 `advisory/softBlockedBy`（`vmu.workflow.softDepsEnforced`）是**软依赖**语义，不是写域；本轮新增的写域 advisory 与它**同名不同物**，文档已分开写。

---

## 3. C · F49–F51 复核（结论已发 vmu-verify）

| 条 | 原判据 | 复核结论 | 关键证据 |
|---|---|---|---|
| **F49 诊断面** | 具备 | **具备 ✓（本组加厚）** | 既有 `metrics.js:359`／`audit.js:10`；本组 `resume.status()`（projection/lock/restart/mailbox/watchdogs/children/计数）、`tasks.status()`（dag/writeScopes/writeScopeConflicts）、`human.status()`（queue＋gate 计数） |
| **F50 未知就说未知** | 具备 | **具备 ✓（本组补三类"缺席即具名"）** | 既有 `arbitration.js:169/209/407`／`alerts.js:444`；本组 `VMU_RESUME_MAILBOX_UNAVAILABLE`/`_CHILDREN_UNAVAILABLE`（端口缺席）、`VMU_RESUME_NO_ADAPTER`/`_PROJECTION_GAP`（未水合/键下非信封）、`ids.status().durable=false`（未绑定） |
| **F51 重启标记** | **缺失** | **改为「具备 ✓」**（Round 4 已落，本轮复核） | 耐久 `resume` 键的 `recoveries[]`＋`status().restart`/`resume.restart()`（`generation/restarted/at/reason/interrupted/unhydrated/missingChildren/readBack/phase`）；`work`（=v5r `pendingWork`）、`ids` 计数器、`human` 未批队列、`Formal/Jobs/*.json` 镜像。**唯一具名缺口：v5r 的 `meetingOpen` 无等价物**（会议面需加 `open` 标记）；`activity.js` 的 generation 有意不持久 |

---

## 4. D · 文档同步

- `docs/07 §15`：新增 **[Round 5 F35/F39 · 与恢复的关系]** —— DAG 在写入时强制 ⇒ 恢复出的板必然无环；`writeScopes` 随任务对象一起投影且**永不阻断**；`tasks.status()` 的三个新只读字段。
- `docs/26 §7`：第 4 条扩入"**键下不是投影信封**"；新增 **Round 5 增补**（DAG 写入时强制＋环路径作为出路；写域 advisory 是"去和同事对一下"的信号而不是错误；诊断面三字段）。

---

## 5. 新增/变更的对外面（供 core 登记 docs/03，lead 点名两小项）

**新错误码（docs/03 §8）**
| 码 | 含义 | 出处 |
|---|---|---|
| `VMU_TASK_DEPENDENCY_CYCLE` | 依赖边会使任务图成环（自环或整图环）；`detail.cycle` 给环路径；出路＝删掉环上任一条边 | `kernel/tasks.js:59-63`（`cycleRefusal`），抛出点 `:214`（create）／`:240`（setDependencies） |

**服务方法契约（docs/03 §2.1，`vmu.tasks`）**
| 方法 | 签名 | 用途 | **真读者** |
|---|---|---|---|
| `create` | `create({title, objective?, owner?, deps?, priority?, writeScopes?})` | 建任务；新增可选 `writeScopes`（advisory）与创建期环检测；回执新增 `deps/writeScopes/skippedScopes` | `tools/task.js:25`（core 需补 `write_scopes` 透传） |
| `setDependencies` | `setDependencies(id, deps, {expectedRevision?})` | 改依赖边（DAG 守卫）；回执 `{ok,id,deps,revision}` | **待接线**：`vibe_vmu_task_update {action:'set_dependencies'}`（v5r 提示词已声明该动作：`packs/v5r/prompts/v5r-blocks-a.js:542/579/611`）⇒ 请 core 一行映射到本方法；**未接线前它是 reader-less，本轮具名**（它是 F35 的实现主体，不是为测试而加） |
| `writeScopeConflicts` | `writeScopeConflicts()` → `[{a,b,scopeA,scopeB}]` | 写域重叠的**只读**视图 | `tasks.status().writeScopeConflicts`（同文件真读）＋`list()` 行 |

- 说明：`setWriteScopes` 曾一并成型，**已删除**（唯一读者会是尚不存在的工具动作 ⇒ 不留 reader-less API）；改 scopes 的能力保留在 `create` 的声明面。`findDependencyCycle`/`normalizeWriteScope`/`scopesOverlap` 是导出纯函数，均有**同文件真读者**（create/setDependencies/writeScopeConflicts）。

---

## 6. 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-tasks-dag-and-scopes.test.mjs` | `=== VMU TASKS DAG+SCOPES: 41 passed, 0 failed ===` | **0** |
| `node tests/vmu-tasks.test.mjs` | `=== VMU TASKS: 42 passed, 0 failed ===` | 0 |
| `node tests/vmu-resume-recovery.test.mjs` | 73/0 | 0 |
| `node tests/vmu-resume-lock-and-marks.test.mjs` | 49/0 | 0 |
| `node --check vibe-math-vmu/kernel/tasks.js` | 通过 | 0 |

未跑：全量 sweep／`regen-all`／`update-doc-counts --write`／git。

---

## 7. 未做项 / 诚实边界

1. **`setDependencies` 尚无生产读者**：需 core 把 `vibe_vmu_task_update {action:'set_dependencies'}` 映到它（一行）；否则通过**工具面**仍只能建"合法 DAG"，而**改边**的能力只在服务层可用（**不是**环可以被绕过——工具面没有改边动作）。
2. **工具面未透传 `write_scopes`**：`tools/task.js` 的 `create` 需加 `write_scopes` 参数（core，一行）；此前 v5r pack 提示词里的该字段会被丢弃。
3. **F39 不覆盖"文件写域闸"**：advisory 不是 D-53 的 fs 白名单（那是另一条）；本轮只把"建议"做成可读、可见、可审计的东西。
4. **`meetingOpen` 等价物**仍未做（会议面 owner）。
5. **npm/门禁**：未跑全量；证据只来自上述定向套件。
