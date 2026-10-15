# task-51 交付报告 · Round 7（目标 2 缺口收口 ＋ T1 阻断项事实）

- 负责人：v5r-reader-c。判据：`_handoff/vmu/08-goal2-verdict.md §6`。
- 写入范围：`kernel/chat.js`、`kernel/mailbox.js`、`tools/chat.js`、`tests/{vmu-chat,vmu-mailbox,vmu-meeting-parity}.test.mjs`、`docs/08`、`docs/17`、本文件。

## A. G1 私聊补记到公开面（**已落**）
`kernel/chat.js:424 supplement({of,by,why,publicRef})`、`:465 supplements()`、`:468 supplementOf(id)`；接缝 `privateSender`（`:96`）；工具面 `vibe_vmu_chat` 新增 `supplement｜supplements｜supplementof`。
- **正文永不搬运**（`body:'withheld'`）；公开面只记 `{of,by,at,why,publicRef}`；引用经补记簿解析（`viaSupplement:true`/`bodyWithheld:true`）。
- **只有发送者本人可补记**：有接缝时核验（不符 ⇒ `VMU_NOT_PERMITTED`；解析不到 ⇒ `VMU_CHAT_ANCHOR_DANGLING`）；**无接缝 ⇒ `authorship:'claimed-unverified'`**（自曝，不假装）。
- **`why` 必填**；append-only（重复幂等）；容量受**已声明** `vmu.chat.historyCap` 约束并计数（`dropped.supplements`）。
- 实测：`vmu-chat` **67 → 79 passed, 0 failed**（§11 新增 12 条）。

## B. G5 会议级 mute（**判为组合，写明用法，不新增原语**）
`chat.mute`（按人）× 会期成员清单 = 会议级静默；用法写入 `docs/08 §25.13 B`。实测 parity §19：组合后每个会期成员被禁言、越席发言 ⇒ **`VMU_CHAT_MUTED`**（具名拒）、主席（管理员）仍可发言、`unmute` 即恢复、**会议对象不受影响**。理由：新增"会议作用域 mute"会是同一判断的第二份实现（D5/D7 的反面）。

## C. G8 自我发信判定（**已落**，并解决 T1 阻断项）
- `kernel/mailbox.js:235` `selfAddressed = targets.filter((t) => t === who)`；`:236` 守卫；`:238` `record('send-refused', {reason:'self-message'})`；随后拒。
- **两条路都覆盖**：字面 `to === from`；**接缝返回发件人**（如 `all` 被解析成含自己）。
- `to:'all'|'voters'` **无接缝** ⇒ 早已具名拒 `VMU_ENGINE_UNAVAILABLE`（`:211-216`，"kernel never guesses a roster"）。
- 实测：`vmu-mailbox` **44 → 48 passed, 0 failed**。

### ★ T1 阻断项时间线（`VMU_MAILBOX_SELF_MESSAGE`）
1. 我在 `docs/08 §25.13 C` 写了"建议下一轮登记专用码 `VMU_MAILBOX_SELF_MESSAGE`"——**它是一个计划名**；
2. 该令牌使 `audit-vmu-docs`（判据："docs 里的 `VMU_*` 必须在 `03-§8` 登记"）与 `check-docs` 变红；
3. **处置**：从 docs 删除该令牌，改为"未新增错误码（新码须 core 先落 `03-§8`）＋改判条件"；全 docs 对它的命中数 = **0**；
4. **给 core 的事实**：码**不存在/未被使用**，G8 复用的**已注册** `VMU_INVALID_ARGUMENT` ＋ 记录 `reason:'self-message'`；若将来登记专用码，登记依据（码名/含义/出处 file:line/触发条件）与"一行改码"路径已发 core 与 Lead；
5. 结果：`audit-vmu-docs` **83/0 exit=0**、`check-docs` **PASS exit=0**。

## D. G6 host 侧分配型 store 接缝（**形状已定，接线待 host**）
`docs/08 §25.13 D` 已写明：**谁注入**（host／`kernel/index.js`）、**store 契约**（`append→{ticket}`＋`readAll`；意图记录/完成记录字段）、**语义保证**（意图先落盘→生效→结果；`recover()` 不重放已完成；`reconcile()` 幂等）、**缺席降级**（`durable:false`＋`reserve()→null`＋具名"无可恢复"，进程内闸门照常）。`docs/03` 不在本任务写范围 ⇒ 形状已发 vmu-core 落。

## E. GAP-MTG 需新原语六条（逐条：原语／代价／本轮）
| 条 | 原语 | 代价 | 本轮 |
|---|---|---|---|
| GAP-MTG-04 议程增删 | `meetings.agenda({op,item,by})`＋条目 id | ~120 行＋16 断言＋1 工具 action；须裁"已议条目能否删" | 未落（**判据待裁**） |
| GAP-MTG-06a 流程切换 | `meetings.flow({mode})` 6 值＋判定点收敛 | ~80 行；须定义 6 种 mode 的可观察差异（v5r 无实现） | 未落（design-only） |
| GAP-MTG-06b 点名/顺序 | `speak_order_set`／`speak_next` | ~70 行；须裁"随机序可否被覆盖" | 未落 |
| GAP-MTG-06c 举手管理 | `hands({op:'grant'｜'revoke'｜'clear'})` | ~40 行（`hand()` 已有） | **未落（代价最低，下轮首选）** |
| GAP-MTG-05 停步 | `stop({scope:'step'})`＋"步"概念键 | ~60 行＋1 键 | 未落（**键未声明**） |
| GAP-MTG-05 请假/离席请求 | `request({kind,by,why})`＋批准点 | ~90 行；须裁"批准人是谁" | 未落（**判据待裁**） |

## 验证（原样命令 + 退出码）
```
node tests/vmu-meeting-parity.test.mjs         → 167 passed, 0 failed   exit=0   （§19 = G5 组合 5 条）
node tests/vmu-chat.test.mjs                   →  79 passed, 0 failed   exit=0   （§11 = G1 12 条）
node tests/vmu-mailbox.test.mjs                →  48 passed, 0 failed   exit=0   （G8 4 条）
node tests/vmu-panel.test.mjs                  →  39 passed, 0 failed   exit=0
node tests/vmu-ballot.test.mjs                 →  41 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs              →  13 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs               → 161 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs                →  50 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs                →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs           →  15 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs        →  73 passed, 0 failed   exit=0
node tests/audit-vmu-docs.test.mjs             →  83 passed, 0 failed   exit=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, findings=0 exit=0
node tests/audit-enum-branches.mjs             → 0 finding              exit=0
node tests/audit-code-size.test.mjs            →   9 passed, 0 failed   exit=0
node scripts/check-docs.mjs                    → DOC LINT: PASS         exit=0
node --check kernel/{chat,mailbox}.js + tools/chat.js → exit=0（3/3）
```

## 未做（具名＋改判条件）
1. **D 的接线**（host store）：待 vmu-core 在 `kernel/index.js` 注入分配型 store（协议与恢复已完备）。
2. **专用 self-message 码**：待 core 登记 `03-§8`；登记后我一行改码。
3. **E 的六条**：两类原因——**判据待裁**（议程增删、请假请求、随机序覆盖、流程差异定义）与**键/概念未声明**（停步需 core 先声明键）；GAP-MTG-06c（举手管理）代价最低，建议下一轮首落。
