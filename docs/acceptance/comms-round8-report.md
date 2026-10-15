# task-57 报告（Round 8 · **部分完成，任务保持 in_progress**）

- 负责人：v5r-reader-c。**诚实结论：A 已落；B①–④ 与 C 未落**（裁决与形状已固化在 `docs/08 §25.14`，逐条带代价与依赖）。
- 写入范围：`kernel/meeting.js`、`tools/meeting.js`、`tests/vmu-meeting-parity.test.mjs`、`docs/08`、本文件。

## A 举手管理面（**已落 ✓**）
| 项 | 落点与语义 |
|---|---|
| 方法 | `kernel/meeting.js` 的 `hands({op, member, by, why, scope})`（`op ∈ grant｜revoke｜clear｜list`）；选项新增 `chair`／`isChair` |
| 谁可管理 | **仅主席**；**两者都未声明 ⇒ `VMU_ENGINE_UNAVAILABLE`**（零机制，不发明权威）；非主席 ⇒ `VMU_NOT_PERMITTED` |
| 留痕 | `history` append-only：`hands-grant`／`hands-revoke`／`hands-clear`／**`hands-refused`**（连拒绝都记） |
| 理由 | `revoke`／`clear` **必须 `why`**（`VMU_REASON_REQUIRED`）；`grant` 的 why 可选且入账 |
| clear 作用域 | `all`（默认）／`round`（只清本轮）；其他 ⇒ `VMU_INVALID_ARGUMENT`；回执带 `cleared` |
| grant 不加塞 | 追加在队尾并回报 `position`（"插队"归 B③ 的覆盖裁决） |
| 工具面 | `vibe_vmu_meeting` 新增 `hands` 动作＋`op`／`scope` 参数 |
| 断言 | parity **§20 共 11 条**（非主席拒、无 why 拒、坏 scope 拒、grant/去重/revoke/clear 计数、四类留痕行、无主席零机制、isChair 接缝） |

**验证**：`node tests/vmu-meeting-parity.test.mjs` → **178 passed, 0 failed, exit=0**（原 167）；`node tests/vmu-meeting.test.mjs` → **50 passed, 0 failed, exit=0**；`node --check kernel/meeting.js`／`tools/meeting.js` → exit=0。

## B①–④：裁决已固化，**本轮未落**（原因：A 之后预算耗尽；不拿文档冒充实现）
1. **议程只能关闭/归档**：`open()` 条目数组 ＋ `agendaClose({id, by, why})` ⇒ `closed/closedBy/why`，原条目保留；`vmu.agenda.*` **六键已在 schema**（无需 core）。代价 ≈ 90 行＋12 断言。**未落**。
2. **请假/休会批准人＝chair、office 兜底、可声明**：需 `vmu.meetings.leaveApprover`（**core 尚未声明**）⇒ 键到位后 ~50 行＋8 断言，读取须具名降级。**未落（依赖 core 键）**。
3. **发言序可被 chair 覆盖但须留痕**：`vmu.meetings.orderMode` 增 `random` ＋ `overrideOrder({by, why, mode})`（仅 chair／必须 why／审计行／`enforced[]` 点名）；**未声明 ⇒ 拒**。**未落**（~70 行）。
4. **6 flow mode 裁决（已下）**：**合并 `single`→`hands`**（不可区分：都是"一次一人、按举手先后"）、**合并 `directed`→`call_on`**（不可区分：都是"主席点名"，"是否附问题"是参数）；**保留 4 种可观察差异**：`open`（无队列）、`hands`（按举手时间）、`round_robin`（按已发言次数升序，`queue()` 已接线）、`call_on`（主席指定，`queue()` 已接线）。**裁决文本已落 `docs/08 §25.14`；`flow({mode})` 收敛（~80 行）未落**。

## C 其余：**本轮未落**（代价已列）
G2 `invite` 正文/expect/timebox（~40 行）｜G3 会期板 `origin`＋`claim_pending`（~70 行，跨面需任务板配合）｜G4 议程增删/流程/点名/停步（含 core 先声明"步"键）｜**G7 `ballotbox`＋`mailbox` 接耐用日志（各 ≈6 行：`durableQueue.reserve/complete` 包住唯一写入点；协议已在 `kernel/ballot.js`）**。

## 未做（具名＋可直接排期）
B①（90 行，无外部依赖 ⇒ **下一轮首选**）｜G7（各 6 行，无外部依赖 ⇒ **可与其他项并行**）｜B③（70 行）｜B④ 实现部分（80 行）｜G2（40 行）｜B②（**待 core 声明 `vmu.meetings.leaveApprover`**）｜G3（跨面）｜G4（待 core"步"键）。

## 纪律
未跑全量 sweep／未 `regen-all`／未 git；临时文件 `D:\_tmp`（探针用后已清）；本轮未用 PowerShell 做内容型批量改写。
