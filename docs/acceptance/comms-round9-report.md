# task-65 报告（Round 9 · A/B 已落；C/D/E/F 未落，具名）

## A `parity §21`（**已落 ✓：新增 16 条断言**）

`tests/vmu-meeting-parity.test.mjs` §21 —— B① **6 条** ＋ G7 **10 条**（含自曝与跨面）：
- **B①（6）**：条目化（字符串⇒1 条、稳定 id、owner 保留）／无 `why` 具名拒 `VMU_REASON_REQUIRED`／未知 id 具名拒 `VMU_NO_SUCH_OBJECT`／关闭写入 `state/closedBy/why/closedAt`／**原条目保留**（只加字段，文本与 owner 不变）／二次关闭幂等＋`status().agendaOpen/agendaItems`＋`agenda-closed` 恰好一行。
  > 裁决里"关闭后不能再对该条目动议"**无法断言**：本面**没有按条目的动议**（动议自带 `target`）。已在断言处写明这条诚实边界，不假装实现。
- **G7（10）**：绑定时板子自曝 `status().durableLog.bound===true`／板子 cast 走 `reserve→complete`（settled）／**被拒的 cast 也完成意图**（不重放拒绝）／mailbox 自曝／mailbox send 同一协议（本实例追加 **1** 条意图行且 settled）／**两面共享一个 store ⇒ ticket 单调互异**（store 分配）／**"重启"＝同一 store 上的第二个日志**且 settled（`appended` 归 0 ⇒ 以 tickets/pending 断言）／中断的意图**恰好留 1 条 pending**／未绑定两面 `bound:false`（**自曝**）／未绑定仍原样工作。
- **跨面正对照已引用**：reader-a 的 `node tests/vmu-resume-e2e.test.mjs` ⇒ **63/0 exit 0**（`9a`–`9k`：绑定后 CONTRACT 1 状态面仍写穿且**全程未调 `snapshot()`**、CONTRACT 2 journal 面仍**必须显式 flush**；`9j` 未 ack 与 `9k` settled 同时为真）。引用写在 §21 顶部注释里。

## B G7 自曝（**已落 ✓**）
- `kernel/ballotbox.js`：`status({boxId}).durableLog.bound` ＋ 聚合 `status().durableLog.bound`。
- `kernel/mailbox.js`：`status().durableLog.bound`。
- 语义：**未绑定 ⇒ `bound:false` 可读**（对齐 `ballot.status().gate.durable`）⇒ 不再存在"悄悄退回进程内"。

## 本轮第四条坑（新学到的，写进 §21 注释）
**一个日志实例的 `status().done` 包含它从 store 里"恢复"来的 done 行**（不只本实例追加的）。最初我写 `logMail.status().done === 1` 而共享 store 上已有板子的 done 行 ⇒ 应为 2。**正确断言口径**：跨实例/共享 store 时用 `status().appended`（本实例追加的意图数）＋ `recover().pending`＋相关行数，**不要**用 `done`。

## 未做（具名；形状与代价）
- **C B③ `overrideOrder`**（`orderMode` 增 `random`／仅 chair／必须 why／审计行／`enforced[]` 点名／未声明即拒）：形状见 `docs/08 §25.14 B-3`；≈70 行＋断言。**未落**。
- **D B④ `flow({mode})`**（保留 4 种：`open`／`hands`／`round_robin`／`call_on`，各自可观察差异已裁决）：形状见 `docs/08 §25.14 B-4`；≈80 行＋断言。**未落**。
- **E F51 `meetingOpen` 耐久域标记**（`state:'open'` 仅在内存 ⇒ 重启后无耐久判定）：需与 F28 lapse 对齐的**域标记**（`kernel/meeting.js` 的 `state`＋store 写穿，或 core 声明键）。**未落**（本轮预算用于 A/B）。
- **F B② 请假批准人**（core 已声明 `vmu.meetings.leaveApprover`，`enum ['chair','office']`，def `chair` ⇒ **无阻塞**）：读者＋`requestLeave`/`approveLeave` ≈50 行＋断言。**未落**（同上）。

## 验证（原样命令 + 退出码）
```
node tests/vmu-meeting-parity.test.mjs         → 194 passed, 0 failed   exit=0   （§21 新增 16 条）
node tests/vmu-ballotbox.test.mjs              →  13 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs                →  48 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs                →  50 passed, 0 failed   exit=0
node tests/vmu-set-attribution.test.mjs        →  15 passed, 0 failed   exit=0
node tests/audit-declaration-criterion.test.mjs → exit=1，但 **RULE E fingerprints: current=67 = baseline=67** ✓
     三条 FAIL 均非我名下：`regen-all --check`、`audit-pack-value-domain.mjs --selftest 未被门跑`、`vmu-mathtools.test.mjs:658 [A]`
node --check kernel/{ballotbox,mailbox}.js     → exit=0（2/2）
```

## 纪律
- **重构原子**：本轮无"抽取后再补绑定"的两步编辑（Round 8 的教训）。
- **集合断言带非空前置**：§21 全部以常量长度/明确计数断言，未用可能为空的 `every`；RULE E 基线保持 67。
- 未跑全量 sweep／未 `regen-all`／未 git；无临时文件残留。
