# Round 6 · task-44 报告：目标 1 终判（执行记录）

> 主交付＝`_handoff/vmu/06-goal1-verdict.md`（v5r 逐条对照 + vmu 判定 + 缺口/改判条件）。本文件只记**执行与证据**。

## 1. 做了什么

| 步骤 | 结果 |
|---|---|
| 基线复核 | `03-v5r-full-inventory.md` §四（断点续跑 8 小节）＋§4.8（人工干预边界）逐条取出；v5r 行号沿用分片 A 的逐段全读结果。⚠ lead 给的发布路径 `C:\Users\admin\.dsh\profiles\web\node_modules\dsh-vibe-math\vibe-math-v5r\` **不存在**（`Test-Path`=False）⇒ 用仓库副本 `Vibe-Mathematics/vibe-math-v5r/vibe-math-v5r.js`（True） |
| vmu 侧侦察 | `kernel/index.js`（`createResume` 实参、`childrenSeam` 晚绑定）、`vibe-math-vmu.js:424-435`（children 端口真的接了 `subagents.listChildren`）、`host.js`（TOOL_NAMES：human/chat/mailbox/panel 都在）、`kernel/mailbox.js`（`pending(member)`/`boxes()`/自持久）、`kernel/identity.js:216`（`list()` **不带 childId**）、`kernel/human.js`、`kernel/control.js`；`grep lastInputAt|lastVoteAt|pendingWork|meetingOpen` 零命中 |
| 本轮补 | ① `status().inflight`（v5r `pendingWork` 等价视图）② `status().ports`（端口是否真接）③ `roster` 端口（子代对账才有 `childId` 可对）④ 端口支持函数形（`mailbox: () => entries`、`children: (p)=>ids`）⑤ **`inject`**（人工中途注入，`tools/human.js`，14→15 action） |
| 修 bug | `recoverUnlocked` 的局部 `roster` **遮蔽**了 `roster` 端口（子代对账永远 `checked:0`）——与 Round 4 的 `snapshot` 遮蔽**同类**；两处均已修 + 加断言 |
| 文档 | `docs/07 §15`（Round 6 行）、`docs/17 §19`（15 action + 耐久队列 + inject） |
| 结论 | 已发 **vmu-verify**（矩阵增量：断点续跑＝具备/3 处具名小缺口；人工干预＝具备/1 处上行缺口） |

## 2. 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-recovery.test.mjs` | 73 / 0 | 0 |
| `node tests/vmu-resume-lock-and-marks.test.mjs` | **54 / 0** | 0 |
| `node tests/vmu-human-gate.test.mjs` | **75 / 0**（含 inject 5 条） | 0 |
| `node tests/vmu-scheduler.test.mjs` | 111 / 0 | 0 |
| `node tests/vmu-tasks-dag-and-scopes.test.mjs` | 41 / 0 | 0 |
| `node tests/vmu-kernel.test.mjs`／`vmu-entry.test.mjs`／`vmu-work.test.mjs`／`audit-hook-coverage.test.mjs` | 全绿 | 0 |
| `node --check` × `kernel/resume.js`／`kernel/human.js`／`tools/human.js`／`kernel/tasks.js` | 全过 | 0 |

未跑：全量 sweep／`regen-all`／`update-doc-counts --write`／git；临时文件 `D:\_tmp`（本轮无遗留）。

## 3. 未做项（与 verdict §5 同源）

1. `mailbox` 端口（未 ack 计数）＝`kernel/mailbox.js` 一行 `pendingAll()`（或 core 传函数端口）。
2. 人工收件箱聚合（v5r `officeRequests`）＝`mailbox` 面只读聚合；当前由**审批队列**承担主干。
3. 重启自动重派缺失成员＝**装配策略**（引擎只对账具名）。
4. 看门狗刷新＝**N/A 有理由**（vmu 无持久在飞时钟；端口保留）。
5. `meeting`/`ballot` 多实例注册表＝未做（单例化已明确拒绝）。

## 4. 给 lead 的一句话

**目标 1 判"够"**：断点续跑核心机制全在（5 条超集），剩 3 处具名小缺口（2 个一行接线 + 1 个 N/A 有理由）；人工干预**完善且是 v5r 的超集**（本轮补上 `inject` 与跨重启队列）。不再需要"实现一个新机制"，只需按 §5 接线。
