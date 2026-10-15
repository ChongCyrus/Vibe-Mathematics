# Round 7 · task-52 报告：未 ack 计数 · 重派策略声明面 · 看门狗 N/A 复核

> 判据：`06-goal1-verdict.md §5` 的三条缺口。写范围＝`kernel/resume.js` 等；本轮实际改动：`kernel/resume.js` ＋ `docs/07 §15`／`docs/26 §7` ＋ 测试 `tests/vmu-resume-lock-and-marks.test.mjs`（54→**67**）。

---

## A · 未 ack 邮件计数（**已闭合，且不需要新接口**）

**发现（比"加一行 `pendingAll()`"更好）**：邮件面**自持久**——`kernel/mailbox.js:452-462` 的 `persist()` 把**面快照**写进自己的 `mailbox` 键；而 `ack()` 在 `:363` 把条目**从 `boxes` 摘除**（只留在 `acked` 账本里）⇒ **`data.boxes[*]` 就是"仍未 ack 的条目"** ⇒ 恢复时**直接读耐久键**即可得到精确计数，**不需要**给 `mailbox.js` 加方法，也**不需要**装配接线。

**实现（`kernel/resume.js` 的 ⑤ mailbox 步）**：
- 有端口 ⇒ 用端口（`source:'port'`）。
- **无端口 ⇒ 读耐久 `mailbox` 键**：两种存储形状都接受（裸面快照 `{face:'mailbox',data:{boxes…}}`／state 投影信封 `{mode:'state',value:{…}}`）⇒ `source:'durable-mailbox-key'`，`pending`＝Σ box 长度，`ids` 前 `listCap` 条。
- 两者都没有 ⇒ 仍**具名** `VMU_RESUME_MAILBOX_UNAVAILABLE`，`inflight.unackedMail=null`（**不是假 0**）。
- 计数进 **`status().inflight.unackedMail` ＋ `unackedMailSource`**（task 明确要求"接到 inflight 里"）；`status().ports.mailbox` 仍如实反映"**端口**没接"（来源与端口是两件事，都已具名）。

**断言**（`tests/vmu-resume-lock-and-marks.test.mjs`，task-52 A 块）：裸键 ⇒ `pending 3`、`inflight.unackedMail 3`、`ports.mailbox false`；信封键 ⇒ 同样 3；无端口无键 ⇒ `attached:false + VMU_RESUME_MAILBOX_UNAVAILABLE + null`。

---

## B · 重派缺失成员＝**可复制的装配策略**（已落一个声明面）

**有意的边界不变**：引擎**不 spawn**（`children` 步的 note 明写 "the engine does NOT spawn"）。本轮补的是**声明面**：`createResume({ reassign: { maxAttempts, apply } })`。

**可复制配方**（谁声明／何时触发／如何避免无限重派）：
```js
// 装配侧（kernel/index.js 或入口）：三行声明
children: { parentId: () => rootSessionId, list: (p) => subagents.listChildren(p) },  // 谁还活着（入口已接好，见 vibe-math-vmu.js:424-435）
roster:   () => members.roster(),                                                    // 谁"应该"有子代（唯一带 childId 的名册源）
reassign: {
  maxAttempts: 1,                                                                    // 上限（默认 1）；这是防崩溃循环的闸
  apply: async ({ member, childId, attempt }) => {
    // 何时触发＝recover() 的 children 步发现"名册 childId 宿主已不认"之后，逐人调用一次
    await members.wake(member, { role: 'restart-recovery', phase: 'founding' })       // 重派方式由装配决定（wake/hire/其它）
  },
}
```
- **谁声明**：装配（引擎不替任何部署决定要不要重派）。
- **何时触发**：`recover()` 的 `children` 步之后，**只对 `missing` 列表里的成员**，每人一次。
- **如何避免无限重派**：尝试次数**耐久**写进 `resume` 键（`reassignAttempts`）；达 `maxAttempts` ⇒ 该成员进 `exhausted`（带理由），**不会再调用**；**失败也消耗配额**（无"免费重试"）；跨重启同样生效（第二个"进程"实测不会再派）。
- **不声明 ⇒ 零机制**：`steps.reassign.attached=false`、`applied=[]`，`missingChildren` 仍具名可读。
- **可观测**：`status().reassign`（`{attached, policy, requested, applied, exhausted, failed, note}`）、`status().reassignAttempts`、`restart.reassigned` / `restart.reassignExhausted`。

**断言**（task-52 B 块，4 组）：不声明 ⇒ 不尝试；声明 ⇒ 恰好一次（带 `attempt/maxAttempts`）且计数器**耐久**（`store._raw.resume.reassignAttempts`）；**第二次重启 ⇒ `exhausted` 且不再调用**（反崩溃循环）；`apply` 抛错 ⇒ `failed[].code` 具名且**仍消耗**配额。

---

## C · 看门狗刷新（N/A）复核：**仍成立**，并补了证据

- `grep 'lastInputAt|lastVoteAt|watchdogAt|heartbeatAt|inFlightSince|inflightSince'` over `vibe-math-vmu/kernel/*.js` ⇒ **ZERO HITS**（v5r 那两个"持久在飞时钟"在 vmu 不存在）。
- 最接近的机制是 **`kernel/meetinglapse.js`**（F28 有界兜底）：它是**纯规则**（文件头明写 "no clock, no store, no bus"）；**状态**在 `meetings.js`（`lapse` 记录 `{name, why, at, revocable}`，`:517`；`lapsedMeetings` 只读视图 `:1021`），lapse 后**失败朝关闭方向**（`:248-250`）且可 `revokeLapse({by, reason})`（理由必填）。
- 结论：v5r 需要"把钟往后刷"是为了不让首轮把在飞对象判死；vmu 的 lapse 是**声明的有界兜底 + 具名 + 可撤销**，**停机时间真实流逝**，因此**不刷是对的**（若要"重启宽限"，用 `watchdogs.targets()/touch()` 端口在装配侧表达——端口已具备，`status().ports.watchdogs` 如实显示未接）。
- `inflight` 视图本轮**确有变化**（新增 `unackedMail/unackedMailSource`），但它描述的是"未完成工作 + 未读信"，**不引入任何时钟** ⇒ **不影响本条 N/A 判定**。

---

## D · 结论已发 vmu-verify

要点：① 未 ack 计数**不再需要新接口**（读耐久 `mailbox` 键），已进 `inflight`；② 重派**有声明面且防无限循环**（耐久计数）；③ 看门狗 N/A **仍成立**并补了 `meetinglapse` 纯规则 + lapse 记录 + 可撤销的证据；④ 套件数字更新。

---

## 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-lock-and-marks.test.mjs` | `=== VMU RESUME LOCK+MARKS: 67 passed, 0 failed ===` | **0** |
| `node tests/vmu-resume-recovery.test.mjs` | 73 / 0 | 0 |
| `node tests/vmu-human-gate.test.mjs` | 75 / 0 | 0 |
| `node --check vibe-math-vmu/kernel/resume.js` | 通过 | 0 |

未跑：全量 sweep／`regen-all`／`update-doc-counts --write`／git；临时文件 `D:\_tmp` 无遗留。

---

## 未做项 / 诚实边界

1. **多实例 face 注册表**（`meeting`/`ballot`）仍未做（单例化已明确拒绝）；改判条件＝谁持有实例谁提供注册表。
2. **`watchdogs` 端口无生产装配**（`ports.watchdogs=false`）：N/A 有理由，端口留给"未来出现耐久在飞时钟"的场景。
3. **`reassign` 的 `apply` 语义由装配定义**：引擎只保证"递名单一次 + 计数耐久"；重派是否成功由装配与成员面决定（失败具名进 `failed`）。
4. **`mailbox` 键的读取是"事实直读"**：若某部署改用投影信封包裹（core 走 `attachProjection`），本轮已兼容；两种形状都实测过。
