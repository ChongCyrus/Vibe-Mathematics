# task-27 交付报告 · Round 4（共识/会议组：F28 ＋ F25/F30/F31 复核 ＋ GAP-MTG 余项）

- 负责人：v5r-reader-c；判据：`_handoff/vmu/05-framework-strength-evidence.md` §4（F25–F34）、`docs/08 §25.4`。
- 写入范围：`kernel/{meeting,meetings,ballot,ballotbox,minutes}.js`、`tools/{meeting,minutes}.js`、`docs/08`、`docs/17`、`tests/vmu-meeting-parity.test.mjs`、本文件。**未改** `05-framework-strength-evidence.md`（vmu-verify 名下）／`host.js`／`settings/schema.js`／`kernel/index.js`。
- **额度中断恢复后的第一件事**：`node --check` 三文件（exit=0×3）＋ `vmu-meetings`/`vmu-ballotbox`/`vmu-meeting-parity`（161/0、13/0、113/0）确认半成品完整；随后补完唯一缺口（`lapsed` fail-closed），现全绿。

## A. F28 有界兜底：**有界、具名、可撤销**（已落）

| 维度 | 落点（file:line） | 语义 |
|---|---|---|
| 派生谓词（唯一判定） | `kernel/meetings.js:336` `lapseDue({meeting, at?})` | 界＝**已声明** `vmu.meetings.hardLimitMs`（钳 [300000,7200000]，**不发明第二个上限**）；回 `{due, name:'meeting-lapse', why, at, revocable:true, elapsedMs, limitMs, enforced:['vmu.meetings.hardLimitMs']}` |
| 具名收束 | `:348` `lapse({meeting, by?})` | **未到期 ⇒ 具名拒 `VMU_STATE`（带当前/上限）**；到期 ⇒ `state='lapsed'`、`{name,why,at,revocable}` 写入 `m.lapse` ＋**纪要**、计数 `lapses`、广播 `meetings/lapse`；重复幂等（`deduped`） |
| **fail-closed（一个判定点）** | `:231` `requireMeeting(id, opts)` | `state==='lapsed'` ⇒ **动作面**（speak/motion/vote/queue/…）在**同一入口**具名拒；**读面** `minutes()`/`verbatim()`/`quorum()`（`:929/:945/:1051`）以 `{readOnly:true}` 显式放行 ⇒ 记录仍可审计 |
| 可撤销 | `:370` `revokeLapse({meeting, by?, reason})` | **必须给理由**（`VMU_REASON_REQUIRED`）；恢复 `open`，**原 lapse 记录保留**（append-only，记 `revokedAt/revokedBy/revokeReason`），计数 `lapseRevocations` |
| 可观测 | `meetings.status()` | 增 `lapsedMeetings`/`lapses`/`lapseRevocations` |
| 表决侧同形 | `kernel/ballotbox.js:423/437/453`；界 `:82` `openMaxMs` | 界由**构造参数**声明（**0＝零机制**）；到期置 `lapsed`（**票保留、`outcome:null` 不发明结论**）；`cast`/`markAbsent` 在非 `open` 态本就具名拒；`status({boxId})` 增 `openMaxMs`/`lapse` |
| GAP-MTG-05 的 extend 半 | `kernel/meetings.js:394` `extend({meeting, member, ms?, by})` | 省略 `ms` ⇒ 读**声明步长** `vmu.meetings.speechExtendMs`（**点名进 `enforced[]`**）；受 `speechExtendMax`／`speechMaxMs` 约束（越界 `VMU_MEETING_SPEECH_TIMEBOUND`）；**未声明步长 ⇒ `VMU_INVALID_ARGUMENT`（不发明时长）** |
| 工具面可达 | `tools/meeting.js` | 新增 `extend`/`lapse`/`revokelapse`/`boxlapse`/`boxrevokelapse`（**不新增面**） |

**零机制**：板未声明 `openMaxMs` ⇒ 兜底**不存在**（行为与本轮之前逐字一致）；会议侧始终有已声明的 `hardLimitMs`。

## B. F25/F28/F30/F31 复核 → 已发 vmu-verify（它改证据文件）

| 条目 | 原判 | 复判 | 依据（file:line ＋ 实测） |
|---|---|---|---|
| **F28** | 缺失 | **具备** | 见上表；parity §16（新增 17 断言）⇒ `vmu-meeting-parity` **130/0**；残余仅 `stop{scope:'step'}`（GAP-MTG-05 另一半，已具名） |
| **F30** | 缺失（键无读取者） | **具备（门槛维度）＋2 条残余仍 PLANNED** | `ballotbox.js:123` `reopenFloor` → `:437 reopen()` 真读并决定（`enforced:['vmu.ballot.reopenFloor']`，不达门槛 `VMU_BALLOT_MIN_VOTES_NOT_MET` 带当前/门槛）；键由 PLANNED **移入 WIRED**，`partition()={all:27,wired:23,planned:4,exact:true}`；残余 `reopenInitiatorScope`/`reopenSameMeetingOnly`（需动议/会期上下文） |
| **F25** | 具备 | **具备（维持，行号更新）** | `ballot.js:30/99`（注入 `quorumRule`）＋`ballotbox.js:114-115`（`minVotes/minVotesRatio` 集中声明）；`:123 reopenFloor` 属同一门槛族 |
| **F31** | 部分 | **部分（维持）** | `ballot.js:225` `votes.set`／`ballotbox.js:217` `box.votes.set` = 同步内存写、状态唯一；**无显式队列/串行化**。改判条件：若要求显式串行化/跨写者原子 ⇒ 需新原语 |

## C. GAP-MTG 余项

- **GAP-MTG-05 部分已落**：`extend` 落地（读 `speechExtendMs`＋`speechExtendMax`，见 A）；`stop{scope:'meeting'}` 由 `close()` 承担（SPEC K8）；`stop{scope:'step'}` **具名残余**（本面无"步"概念，建议键 `vmu.meetings.stepMaxMs`）——`docs/08 §25.4` 该行已改写实。
- 其余 8 条：`docs/08 §25.4` 的 closed-by 维持实写（Round 3 已逐条给出），本轮未新增落地项。

## D. 文档同步

- `docs/08`：新增 **§25.9 F28**（界/谓词/fail-closed/撤销/可观测/表决侧同形/工具面/零机制）；改写 **GAP-MTG-05** 行（extend 已落＋stop 两半的实话）。
- `docs/17`：新增 **§31 F28**（为什么属于协作层、与 §30 C-45 的关系、工具面）。

## E. `audit-code-size` 修复：按规则/状态缝拆分（**未往 KNOWN 加名字**）

- **红因**：`kernel/meetings.js` 1245 行 > `docs/02 §L174` 的 1200 行决议线（Round 3/4 的 tier／lapse／extend 自然增长；它不是"文本本身就是契约"的文件）。
- **拆法**：新建 **`kernel/meetinglapse.js`（218 行）** —— 纯规则 `lapseDueOf`／`makeLapseRecord`／`revokeLapseRecord`／`extensionPlan`（无时钟、无状态、无总线）＋ 工厂 **`createMeetingControls`**（把四个方法 `lapseDue`/`lapse`/`revokeLapse`/`extend` 与面注入的状态接缝组合）；`kernel/meetings.js` 只剩一行接线 ＋ `withScope()`，**保留 D3 回执词汇的唯一归属**。
- **一个自查抓到的隐性破坏**：块移除后 `requireMeeting` 的拒语仍引用 `LAPSE_NAME`（`node --check` 查不出未定义标识符）⇒ 已改为引用导入的 `MEETING_LAPSE_NAME`，并清掉随之无用的 4 个导入。
- **不为过门做手脚**：新模块**刻意不出现** `enforced` 词汇（回执词汇留在面里），因此**无需** vmu-verify 再补门禁场景；`KNOWN` 名单**未增名**。
- **结果**：`meetings.js` **1164 行**（余量 36）；`audit-code-size` **9/0 exit=0**；`audit-enforced-consistency` **findings=0 exit=0**。
- 文档：`docs/08` 新增 **§25.10**（规则/状态边界＋导出面逐字＋行为不变证据）。

## E 之后终批（原样命令 + 退出码）

```
node tests/audit-code-size.test.mjs            →   9 passed, 0 failed   exit=0
node tests/audit-enforced-consistency.test.mjs → findings=0             exit=0
node tests/audit-enum-branches.mjs             → 0 finding              exit=0
node tests/vmu-meeting-parity.test.mjs         → 130 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs               → 161 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs              →  13 passed, 0 failed   exit=0
node tests/vmu-ballot.test.mjs                 →  41 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs                →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs           →  15 passed, 0 failed   exit=0
node tests/vmu-chat.test.mjs                   →  67 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs                →  44 passed, 0 failed   exit=0
node tests/vmu-panel.test.mjs                  →  39 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs                →  50 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs        →  73 passed, 0 failed   exit=0
node --check kernel/{meetings,meetinglapse}.js + tools/meeting.js → exit=0（3/3）
```

## F. 两条 settings 面小项（Round 4 收尾）

**F1 `vmu-settings` 46/1 → 47/0**：红因是**我自己的注释**——`kernel/ballotbox.js` 的 F28 说明里**点了**一个设置键名（`vmu.ballot.openMaxMs`），该门读侧审计按 `vmu.*` 文本扫描，于是把一个**建议名**当成了"运行期读取的键"。（实测该键**从未进过** `settings/schema.js`／`planned.js`。）处置（按 Lead 的"删键＋具名说明"分支）：**撤回该建议**，注释改为写明"**为什么刻意不设该键**"（界属于一个箱子的一生：键要么只在构造时读、要么会把正在投票的箱子的界限热改掉，两者都更差；策略由构造箱子的 pack 拥有）。core 因此**无需移除任何键**。

**F2 `vmu-planned-settings` 的悬空名**：`docs/08` 里我写的两个**建议键名**已去掉键名形态——GAP-MTG-05 行改为"键名待定（此处不点未登记的键名，避免悬空名）"，§25.9 板界行改为"刻意不设设置键"的完整理由。**结果**：group-G 的未登记名由 3 条降到 **1 条且不是我的文件**：`vmu.ballot.openMaxMs (10-packs)`（`docs/10` 属 vmu-pack）；生成物 114 vs 已提交 113 的差额**正好是它**（我的两个名字即原先的 +2），故 pack 删掉那一行后该门应回到 clean，**无需 regen**。

**验证**：
```
node tests/vmu-settings.test.mjs          →  47 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs         →  13 passed, 0 failed   exit=0
node tests/vmu-meeting-parity.test.mjs    → 130 passed, 0 failed   exit=0
node tests/vmu-planned-settings.test.mjs  → exit=1（唯一未登记名＝docs/10 的 vmu.ballot.openMaxMs，属 vmu-pack）
node tests/audit-code-size.test.mjs       →   9 passed, 0 failed   exit=0
```

## 本轮自查抓到并修掉的三处（都由探针逼出，不是事后补记）

1. `lapseDue` 原按**内部会议记录**做参数 ⇒ 公共形状错（传 id 时 `elapsedMs:NaN`）。已改为 `{meeting, at?}` 按 id 解析（与同面其它方法一致）。
2. `extend` 使用声明步长时**没把 `speechExtendMs` 记进 `enforced[]`** ⇒ 修。
3. **`lapsed` 会议原先仍可 speak/motion/vote**（兜底形同虚设）⇒ 在**唯一入口 `requireMeeting`** 加 fail-closed，读面显式放行；探针验证：动作面三例全 `VMU_STATE`，读面三例全 `ok:true`。

## 验证（原样命令 + 退出码）

```
node tests/vmu-meeting-parity.test.mjs  → 130 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs        → 161 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs       →  13 passed, 0 failed   exit=0
node tests/vmu-ballot.test.mjs          →  41 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs         →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs    →  15 passed, 0 failed   exit=0
node tests/vmu-chat.test.mjs            →  67 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs         →  44 passed, 0 failed   exit=0
node tests/vmu-panel.test.mjs           →  39 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs         →  50 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs →  73 passed, 0 failed   exit=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, 0 failed, findings=0  exit=0
node tests/audit-enum-branches.mjs      → 0 finding              exit=0
node --check kernel/{meetings,ballotbox}.js + tools/meeting.js → exit=0（3/3）
```

**静态门现状（非我名下）**：`audit-module-coverage.test.mjs` exit=1，gaps＝`lean (3 unnamed)`、`mathjobs (1 unnamed)`（我的 `activity` 缺口 Round 3 已消除；我名下各模块均已被点名）。

## 未做 / 具名

1. **`vmu.ballot.openMaxMs` 设置键**：板界目前由**构造参数**声明（0＝零机制）。若要"设置面也能调"，需 core 加键（natural, def 0, H1, office）——**按"读者已落地才写默认值"纪律，pack 本轮不写**；已登记于 `docs/08 §25.4`。
2. **`stop{scope:'step'}`**：本面无"步"概念（需新概念＋键），维持具名。
3. `F26/F32/F34` 仍按 verify 原判 `部分`（本轮未动其机制）。
