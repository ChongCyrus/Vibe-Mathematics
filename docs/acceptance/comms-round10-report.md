# task-73 报告（Round 10 · **F 已落并断言**；B③/B④/F51 未落）

## A · F（B② 请假批准人）—— **已落 ✓，5 处编辑全部完成**

| # | 落点 | 内容 |
|---|---|---|
| 1 | `kernel/meetings.js` K 配置块（`confidentialityDefault` 前） | `leaveApprover: oneOf(sget('vmu.meetings.leaveApprover'), ['chair','office'], 'chair')` |
| 2a | 同文件 `WIRED_KEYS`（`vmu.meetings.quorumCap` 后） | `'vmu.meetings.leaveApprover'` ⇒ 该键由 **PLANNED 移入 WIRED**（真读者） |
| 2b | 同文件 `keysSnapshot()`（`confidentialityDefault` 行前） | `'vmu.meetings.leaveApprover': K.leaveApprover` |
| 3 | 同文件（`recess(` 之前） | `requestLeave({meeting, member, why, at})`／`approveLeave({meeting, member, by, why, approve, at})`／`leaveRequests({meeting})` |
| 4 | `tools/meeting.js` | 动作 `leaverequest`／`leaveapprove`／`leaverequests` ＋ enum |
| 5 | `tests/vmu-meeting-parity.test.mjs` §22 | **13 条断言**（≥6 要求已超） |

**语义（实测）**
- **两侧都必须 `why`**：请求无 why ⇒ `VMU_REASON_REQUIRED`；决定无 why ⇒ `VMU_REASON_REQUIRED`。
- **批准人＝声明值**：默认 `chair` ⇒ 非主席决定被 `VMU_NOT_PERMITTED` 拒（回执点出该会主席）；**`leaveApprover='office'` 时主席被拒、`'office'` 可决定** ⇒ **该键真的决定结果，不是标签**。
- **留痕**：`m.minutes.entries` 写 `leave-request`／`leave-decided`，并写 `pushReceipt`；`enforced[]` **点名 `vmu.meetings.leaveApprover`**。
- **幂等**：重复决定 ⇒ `deduped:true`；已决定的请求**不被再次请求悄悄重开**（先前决定保持）。
- **拒绝是一等决定**：`approve:false` ⇒ `state:'refused'`（不是"继续 pending"）。
- **non-member 需要 roster 接缝**：无接缝时 `isMember` 接受任何 id（本面**不假装知道名册**）；因此该断言写在**独立实例 + `members` 接缝**上，不与主请求列表互相干扰（我已把这条写成断言名的一部分）。

## 未落（具名）
- **B B③ `overrideOrder`**（`random`＋仅 chair／必须 why／审计行／`enforced[]`／未声明即拒）：形状见 `docs/08 §25.14 B-3`。**未落**（本轮预算止于 F）。
- **C B④ `flow({mode})`**（合并后 4 种，各自可观察差异）：形状见 `§25.14 B-4`。**未落**。
- **D F51 `meetingOpen` 域标记**（裁决：会议域、不新增键、`open|lapsed|closed` 与 F28 对齐）：**未落**（形状已由裁决确定）。

## 验证（原样命令 + 退出码）
```
node tests/vmu-meeting-parity.test.mjs     → 206 passed, 0 failed   exit=0   （§22 新增 13 条）
node tests/vmu-meetings.test.mjs           → 161 passed, 0 failed   exit=0   ← 每步的"加载内核"套件
node tests/vmu-meeting.test.mjs            →  50 passed, 0 failed   exit=0
node --check kernel/meetings.js tools/meeting.js → exit=0（2/2）
```

## 纪律执行
- **每步跑"加载内核"的套件**：插入方法后立刻跑 `vmu-meetings`（161/0）；工具面改完跑 `node --check` ＋ parity；未依赖 `node --check` 判断加载期冲突。
- **无结构性改名/搬移** ⇒ 无"两步之间"的窗口（Round 8 教训）。
- 集合断言**无空过**：§22 全部为"具名拒码相等／计数相等／状态相等"，未用可能为空的 `every`。
- 未跑全量／未 `regen-all`／未 git；无临时文件残留。
