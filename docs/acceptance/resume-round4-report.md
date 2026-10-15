# Round 4 · task-28 报告：F18 锁真接线 · F51 重启标记 · 未挂面逐个结论

> 作者：v5r-reader-a。判据：`05-framework-strength-evidence.md` 的 **F18／F51**、`resume-round3-report.md` 的未挂面清单、task-28 A–D。
> 本轮写范围：`kernel/resume.js` · `kernel/human.js` · `kernel/ids.js` · `kernel/control.js` · `kernel/lifecycle.js` · `kernel/scheduler.js` · `kernel/tasks.js` · `kernel/members.js` · `kernel/budget.js` · `tools/human.js` · `docs/07` · `docs/26` · 本报告。
> 会话中断说明：模型额度中断前已落盘 `kernel/resume.js`／`kernel/budget.js`／`kernel/scheduler.js`；恢复后先做完整复核（见 §6），未发现半改。

---

## 1. F18 · 锁的真实使用者 + `finally` 全分支释放（**已实现并断言**）

**结论：不再是"API，不是纪律"** —— `recover()` 就是锁的真实使用者（恢复是不可交叠的独占段：水合＋写耐久记录）。

- 使用者：`kernel/resume.js` 的 `recover()`（包装器）→ `recoverUnlocked()`（原函数体）。
  - 取锁：`acquireRecoveryLock()` —— 经注入的 `lock.acquire({name:'recovery', by:'resume'})`（`kernel/resume.js:687-716`）；被占 ⇒ **具名拒 `VMU_RESUME_BUSY`**（`detail.lockCode/attempts/waitedMs`，message 含 holder）。
  - 释放：`releaseRecoveryLock()` 在 **`finally`**（`kernel/resume.js:734-741`）⇒ 成功、早返回、抛错三条路径都释放；释放失败不静默（`lockState.lastError` ＋ log ＋ `resume/lock-release-failed` 事件，该事件由 vmu-pack 登记）。
  - 零机制：`vmu.store.lock` 未声明 ⇒ `storepolicy.acquire` 返回 `{ok:true, locked:false}` 透传，**仍走 `finally`**，`status().lock.attached=true, held=false`。
- 锁原语来源（仓库自己的，不新造）：`kernel/storepolicy.js:138` `acquire` / `:168-171` `release`；既有键 `vmu.store.lock(.timeoutMs/.retries/.backoffMs/.serializeAll)`，**本轮 0 新 settings 键**。
- **可观测**：`status().lock = {attached, name, held, acquisitions, releases, busyRefusals, lastError}`。

**断言（`tests/vmu-resume-lock-and-marks.test.mjs`，用真 `createStorePolicy`，共 39 assertions 全绿）**：

| 分支 | 断言 |
|---|---|
| 成功路径 | `acquisitions===1 && releases===1 && held===false`；`lock.status().locks===0` |
| **抛错路径** | `store.export()` 抛 ⇒ `VMU_RESUME_UNAVAILABLE`，**仍** `releases===1 && locks===0` |
| **早返回路径** | 无 store ⇒ 返回 `ok:false` 报告（不抛），**仍** `releases===1 && locks===0` |
| 并发/被占 | 第二个恢复 ⇒ `VMU_RESUME_BUSY`（带 lockCode/waitedMs/attempts，message 含 holder）；**被拒者不释放别人的锁**（`locks===1`）；持锁者释放后恢复可跑且释放 |
| 未声明锁 | `attached===true`、`acquisitions===1`、`held===false`、服务的 `locks===0` |

**接线要求（已发 vmu-core）**：`kernel/index.js` 构造 `createResume({…})` 时加一行 `lock: storepolicy`；新错误码 `VMU_RESUME_BUSY` 需登记 `docs/03 §8`。**未接线时**：`status().lock.attached===false`（具名，不假装有过独占）。

---

## 2. F51 · 重启标记复核（**已复核并补齐可见面**）

| 标记 | 耐久位置 | 恢复后可见？ |
|---|---|---|
| **"我重启过"＋第几代＋代价** | **`resume` 键的 `recoveries[]`**（`kernel/resume.js` 每次 `recover()` 追加，含 `at/reason/interrupted/unhydrated/readBack`） | **✓ 本轮补只读视图**：`status().restart` / `resume.restart()` = `{generation, restarted, at, reason, interrupted, unhydrated, readBack, phase, durableKey}` |
| 在途工作（= v5r 的 `pendingWork`） | `work` 键（`kernel/work.js:50/57/64`） | ✓ `interrupted` 逐条具名 `interruptedReason`；`settleOutcome('passed')` 仍具名拒 |
| 未批人工动作 | `human` 键（Round 3） | ✓ `queue().pending` 跨重启、`requestId` 复用、`pendingReason` 不丢 |
| id 世代 | `ids` 键计数器 | ✓ `mint` 取 `max(已有)+1`，重启不回退 |
| 作业镜像 | Lean：`Formal/Jobs/<jobId>.json`（`kernel/lean.js:16/73/215/375`）；mathjobs：同样的镜像＋`observeJobIds` 水合（`kernel/mathjobs.js:12/335/530`） | ✓ 作业本身耐久；**作业 id 计数器**由 `observeJobIds` 水合（对应 F51 的"可继续"） |
| **v5r 的 `meetingOpen`** | **无等价物** | ✗ **具名缺口**：需要会议投影里带"已开未收束"标记（`meeting`/`meetings` 的 seam 已就绪，但要 (a) 装配适配器 (b) 一个 `open` 标记字段）；见 §3 |
| 一次性等待器 generation | `kernel/activity.js:15/245`（会话内存） | **有意不持久**：它只对未来生效（`notify()` 取走当前一代），重启后一个旧等待器无意义 |

**测试**：恢复前 `generation 0 / restarted false`；恢复后 `generation 1` ＋ `reason/interrupted/readBack` 就位；**同一 store 的第二个进程 ⇒ `generation 2`**（证明计数是**耐久**的，不是进程内计数）；一个面拒接时 `restart.unhydrated` 列出它。

---

## 3. 四个未挂面：逐个结论

| 面 | 结论 | 依据 |
|---|---|---|
| `members` | **可挂 ✓（单例，带 null 守卫）** | 装配处是单例（`kernel/index.js:579`，无 slots ⇒ 可为 null）；seam 在 `members.js:265/279`；`roster()` 可作 `list`；本轮跨"进程"断言：hire `r-1` → 写穿 → 新进程 hydrate ⇒ 名册仍有 `r-1`，且同快照重复 restore 幂等 |
| `budget` | **已补公共 seam ✓（本轮实现）** | 内部格式化器 `snapshot(s)` 改名 `viewOf(s)`，新增 `snapshot()/restore(snap,{replace})`（只投影**已花费**；声明 `totals/reserveRatio` 由 settings 重解析）；跨"进程"断言"记住 45/100 tokens 已花"；冲突（不同快照无 `replace`）⇒ 具名 `VMU_RESUME_RESTORE_CONFLICT` |
| `meeting` | **不适用单例投影（具名结论）** | 每实例工厂（`kernel/index.js:1301` 在 helper 里构造）；实测两个实例相互独立。单例行会把"最后一场"当全部 ⇒ **静默丢其它**。**替代**：挂单例 `meetings`（seam 已就绪）；多实例需**实例注册表**（`{instances:[[id,snap]…]}` + 逐实例 restore），**未做，具名** |
| `ballot` | **不适用单例投影（具名结论）** | 同上（`kernel/index.js:1287`）；实测两个 ballot 独立、活板与空板状态不同 |
| `mailbox` | **自持久，无需投影行 ✓** | 构造时拿 `store` 写自己的 `mailbox` 键（`kernel/mailbox.js:452-497`），另提供 `snapshot()`/`restore(snap)` 支持契约路径 ⇒ 投影行是多余的 |

**给 vmu-core 的接线（已发）**：① `lock: storepolicy` 一行；② `members`（null 守卫）与 `budget` 两行 state 适配器；③ **不要**给 `meeting`/`ballot` 单例行（挂 `meetings`/`ballotbox`）；④ `phase` 变化点接 `setPhase`；⑤ 登记 `VMU_RESUME_BUSY`。

---

## 4. D · 文档同步

- `docs/07 §14`：新增 **F18 独占段**、**F51 重启标记**、`budget` 缺口闭合、`mailbox` 自持久、`meeting`/`ballot` 每实例结论；§15 增 Round 4 留痕（含"中断前半成品 scheduler 已复核"）。
- `docs/26 §7`：新增 **Round 4 增补**（恢复独占＋`VMU_RESUME_BUSY`；"我重启过"是耐久事实＋`restart` 视图；未挂面结论）；验收数字更新为三套件。

---

## 5. 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-lock-and-marks.test.mjs` | `=== VMU RESUME LOCK+MARKS: 39 passed, 0 failed ===` | **0** |
| `node tests/vmu-resume-recovery.test.mjs` | `=== VMU RESUME: 73 passed, 0 failed ===` | 0 |
| `node tests/vmu-human-gate.test.mjs` | `=== VMU HUMAN GATE: 67 passed, 0 failed ===` | 0 |
| `node tests/vmu-scheduler.test.mjs` | `=== VMU SCHEDULER: 111 passed, 0 failed ===` | 0 |
| `node tests/vmu-budget-pipeline.test.mjs` | 通过 | 0 |
| `node tests/vmu-custody-budget-audit.test.mjs` | 通过 | 0 |
| `node --check` × `resume/human/ids/control/lifecycle/scheduler/tasks/members/budget/tools.human` | 全过 | 0 |

未跑：全量 sweep／`regen-all`／`update-doc-counts --write`／git。临时脚本 `D:\_tmp\r4-budget-rename.mjs`、`r4-faces-probe.mjs` 用完即删。

---

## 6. 中断遗产复核（lead 点名）

- `kernel/scheduler.js`：Round-4 的 **F15/F16**（每个定时器分支释放自己的句柄 ＋ `tick()` trampoline `finally`）已在中断前写完；本轮复核 `node --check` 0 ＋ `vmu-scheduler` **111/0 → 0**，**内容完整、未再改动**（它与 F18 同属"释放纪律"，是本轮锁的 `finally` 断言的同族证据）。
- `kernel/resume.js`／`kernel/budget.js`：中断前的改动均在（F18 锁、`restart` 标记、budget 公共 seam），本轮只做增量（C 的两块测试与文档）。

---

## 7. 未做项 / 诚实边界

1. **F18 未接线到生产装配**：`lock: storepolicy` 一行在 vmu-core 侧（**已落**，含其顺带修的 storepolicy 归一化时钟回归）；`VMU_RESUME_BUSY` **已登记** `docs/03 §8`。
2. **多实例注册表未做**：`meeting`/`ballot` 的多实例投影需要注册表（谁持有实例谁负责）；推荐先挂单例 `meetings`/`ballotbox`。
3. **`meetingOpen` 等价物缺失**：需要会议投影带"已开未收束"标记（属会议面 owner）。
4. **`phase` 装配调用已接**（start/pause/resume/stop 四点，core 落）。
5. **`mailbox` 自有持久化未纳入 `resume.status().projection`**：它自己写键，不经投影引擎 ⇒ 投影视图里看不到它（文档已说明；若要让恢复视图覆盖它，应由 mailbox 提供 adapter 或 core 传 `faces.mailbox`）。
6. **钩子纪律（pack 实测教训）**：我本轮新增了 `resume/lock-release-failed`（未登记时被总线具名拒＋helper 吞掉＝静默）；vmu-pack 已登记（`VU_HOOKS` 55→56，`audit-hook-coverage` 4/0 绿）。**今后新增事件名一律先报 pack 或先 `declareTopic`**。

---

## 8. 收尾后同轮加固（回应 vmu-core 的两问）

**① `recover()` 首跑 `ok:false` 的真因（已定位、已复现、修法已发）**：`report.ok = 每个 step 都 ok`；而装配给 **`work`** 挂了投影行，但 `kernel/work.js` 往 `work` 键写的是**裸数组**（不是投影信封）。我原先对 `adopt()` 失败**视而不见**（当作空 journal ⇒ 静默"hydrated, 0 entries"）；本轮加固为**具名 `VMU_RESUME_PROJECTION_GAP`** ⇒ `ledgers.ok=false` ⇒ `recover().ok=false`。**语义确认**：干净首跑（无信封）＝ `ok:true`；可选端口缺席（mailbox/watchdogs/children）＝ `ok:true` ＋ 具名 code；**`ok:false` 只表示某步真的失败/某面真的没水合**。修法（推荐 a，已发 core）：**删掉 `work` 投影行**（`work` 自持久，恢复经 `work` 接缝读取；投影行只带来这个假失败）。
- 断言（新套件末段）：裸数组 ⇒ `unhydrated:['work'] + PROJECTION_GAP + ledgers.ok=false + projection.degraded=true`。

**② `children` 端口（core 建议的 `listChildren`）已实现：report-only，绝不 spawn**
`createResume({ …, children: { parentId(), list(parentId) } })`；恢复新增 step **`children`**：把"名册里持 `childId` 的成员"与宿主在活子代理对账，对不上的逐个具名 `missing:[{member,childId}]`；`status().children` 与 `restart.missingChildren` 同步可见；无端口 ⇒ `attached:false` ＋ **`VMU_RESUME_CHILDREN_UNAVAILABLE`**（不使恢复失败，具名不猜）；**引擎不创建/不重派成员**（策略属装配）。新码待 core 登记 `docs/03 §8`。

**本轮最终验收**：`vmu-resume-lock-and-marks` **49/0**；其余 11 个受影响套件（recovery 73/0、human-gate 67/0、scheduler 111/0、storepolicy、entry 150/0、budget-pipeline、custody-budget-audit、tasks、identity-human-discipline、work、audit-hook-coverage）**全 exit 0**；`node --check` ×10 文件全 0。
