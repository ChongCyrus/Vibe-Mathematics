# task-46 交付报告 · Round 6（目标 2 终判 ＋ 跨进程耐久原子）

- 负责人：v5r-reader-c。**主交付**：`_handoff/vmu/08-goal2-verdict.md`（总判定＋逐条表＋未做项）。
- 写入范围：`kernel/ballot.js`、`docs/08`、`docs/17`、`tests/vmu-meeting-parity.test.mjs`、两个 handoff 文件。**未改** `05-framework-strength-evidence.md`（vmu-verify）／`host.js`／`settings/schema.js`。

## A. 本轮新落：跨进程耐久原子（优先项）

| 项 | 落点 | 语义 |
|---|---|---|
| 协议 | `kernel/ballot.js` `createDurableCommitLog({store,clock,name})` | **ticket 由 store 分配**（`append(rec)→{ticket}`）⇒ 跨进程单调互异；本地计数为回退并在 `status().numbering` 明说 |
| 顺序 | `reserve` → apply → `complete` | **意图先落盘**；崩溃窗口的意图正是 `recover()` 的输入 |
| 恢复 | 选票面 `reconcile()` | 按 ticket 序重放**未完成**意图；已完成跳过；**幂等**；恢复票 `recovered:true` |
| 观测/缺席 | `status().gate`；无 store ⇒ `durable:false`＋`reserve()`→`null`＋明说"无可恢复" | 接缝缺席**自曝** |

**实测**（parity §18，12 条）：两"进程"共享 store ⇒ ticket 1,2 单调互异；崩溃窗口 ⇒ 新日志 `pending=1`、新票面 `reconcile()` **恰好重放 1 次**且该票**真能定论**、第二次 **0**；正常路径 `done=1/pending=0`；**被拒投片也完成意图**。
**自查抓到的真 bug**：`recover()` 初版只排除"自身 done 的行"，于是**每条已完成提交的意图也被算成 pending**（重启后会重放全部历史票）⇒ 改为**按 ticket 归属排除**。

## B. 判定文档要点（详见 `08-goal2-verdict.md`）

- **v5r 实现层**：14 条会议命令 **14/14 具备**；7 条 ≈ 全部具备或更强。群聊 **id/发言人/时间/回复锚**具备；**管理员／发言次数／按人禁言 v5r 代码里没有**（`v5r-inventory-c:623-625,661-662`）⇒ vmu 有＝**加分**。私信（每收件人一份、入队即耐久、ack 后不留正文、`dm`/`office` 紧急类）**具备**；**私聊补记到公开面（`supplementOf`）未实现 = G1**。面板四字段具备且多 **`subtasks`**（v5r 无独立字段）＝加分。
- **v5r 设计层 42 条**：v5r 自己 **14 ✅／7 ≈／21 ✗**（`v5r-inventory-c:649`）；vmu **≈26 具备／≈11 部分／≈5 缺**。
- **总判定（敢下）**：**"支持原 v5r 的全部功能"＝是（且有余量）；"支持 v5r 设计文档的全部功能"＝否**（v5r 本身也未满足）。缺口 G1–G9 全部具名＋改判条件。

## C. 结论已发 vmu-verify

F31 **再升一档**（进程内闸门 → 跨进程耐久原子）＋目标 2 完整性判定＋残余三条（host store／ballotbox·mailbox 接线／写者隔离由 store 保证）。

## D. 文档同步

`docs/08` 新增 **§25.12**（耐久原子协议表＋实测＋接线待 host）；`docs/17` 新增 **§33**（为什么它是"高自由度可调控"的基础设施＋边界）。

## 验证（原样命令 + 退出码）

```
node tests/vmu-meeting-parity.test.mjs         → 162 passed, 0 failed   exit=0   （§18 = 耐久 12 条）
node tests/vmu-chat.test.mjs                   →  67 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs                →  44 passed, 0 failed   exit=0
node tests/vmu-panel.test.mjs                  →  39 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs               → 161 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs                →  50 passed, 0 failed   exit=0
node tests/vmu-ballot.test.mjs                 →  41 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs              →  13 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs                →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs           →  15 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs        →  73 passed, 0 failed   exit=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, 0 failed, findings=0  exit=0
node tests/audit-enum-branches.mjs             → 0 finding              exit=0
node tests/audit-code-size.test.mjs            →   9 passed, 0 failed   exit=0
node --check kernel/ballot.js                  → exit=0
```

## 未做（具名，全部带改判条件）

G1 私聊补记到公开面；G2 `invite` 正文／expect／timebox；G3 会期任务板 `origin`／`claim_pending` 批准；G4 议程增删／流程／点名／请假请求／停步（GAP-MTG-04/05/06）；G5 会议级 `mute`；G6 **host 侧分配型 store 注入**（真正跨进程的前提，协议已完备）；G7 `ballotbox`／`mailbox` 接同一份耐用日志；G8 无名册接缝时的自我发信判定；G9 v5r `selfReportTool` 逐行未读（面板第五字段风险，≈10 行可改判）。
