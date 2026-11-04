# 保真模拟器与多向审计台账

这份台账登记「保真模拟器 + 多向审计」这一轮的全部发现，以及每一条的处置。
它的目的不是列功，而是防止同一类问题第二次被发现时又当成新问题。

- 模拟器的定位：测**机制对不对**（回执是否自洽、规则是否有可达路径、提示词是否与回执同源），
  不测**模型行为**。它替代不了真机，只负责在真机之前把「代码里本来就能发现」的缺陷挖出来。
- 三条约束：不绕过缺陷；成员动作一律用 `{ as: { agent: { id } } }` 身份调用；提示词按**槽位**
  （`chair` / `member` / `temp`）测量，绝不按 `role` 名测量。

## 1. 怎么复现

```bash
node scripts/sim/run.mjs --scenario mainline --out <tmp>/sim/mainline
node scripts/sim/run.mjs --scenario records-blueprint --out <tmp>/sim/rb
node scripts/sim/run.mjs --scenario paper --out <tmp>/sim/paper
node scripts/sim/run.mjs --scenario comms --probes --out <tmp>/sim/comms
node scripts/sim/run.mjs --scenario turns --out <tmp>/sim/turns
node scripts/sim/run.mjs --scenario meetings --out <tmp>/sim/meetings
node scripts/sim/audit/receipts.mjs <tmp>/sim/<name>
```

`run.mjs` 退出码非零＝出现了**未声明的机制性拒绝**；`expectedRefusals` 里声明过的拒绝计入
`expected`，不计失败。`audit/receipts.mjs` 的 A1–A5 五条检查见 `scripts/sim/README.md`。

## 2. 五个场景与三份审计

| 面 | 产物 | 规模 | 结果 |
| --- | --- | --- | --- |
| 主线 | `scripts/sim/scenarios/mainline.mjs` | 21 次调用 | 1 条环境性拒绝（无 spawn 接缝时 `compile` 必然拒） |
| 记录面/蓝图 | `scenarios/records-blueprint.mjs` | 29 步 / 27 调用 | 0 拒绝，15 条硬检查 |
| 论文面 | `scenarios/paper.mjs` | 19 步 / 17 调用 | 0 拒绝，22 条检查 |
| 通信面 | `scenarios/comms.mjs` | 50 步 | 0 拒绝；`--probes` 5 条具名拒全带 hint |
| 回合面 | `scenarios/turns.mjs` | 16 步 / 21 调用 | 6 条声明拒绝；A2 泄漏 1 条 |
| 会议面 | `scenarios/meetings.mjs` | 59 步 | 3 条声明拒绝 |

三份审计报告（仓内）：`docs/acceptance/sim-audit-rules.md`（93 条规则逐条判定：
ENFORCED 75 / PROSE-ONLY 11 / UNREACHABLE 6 / CONTRADICTED 1）、
`docs/acceptance/sim-audit-architecture.md`（重复实现、死导出、超大文件、可编辑性）、
`docs/acceptance/sim-audit-decisions.md`（不可达路径的三选项决策备忘）。
逐场景的详细报告存放在临时区（`<tmp>/sim/*-report.md`），不进仓。

## 3. 发现与处置

状态口径：`已修` ＝ 代码已改且有测试钉住；`在修` ＝ 已派给具体写域；
`待决` ＝ 需要产品决策（不是代码问题）；`不修` ＝ 有明确理由的选择。

| ID | 面 | 发现 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| S1 | 审计工具自身 | A1 把声明过的拒绝也判失败，manifest 不落声明 | `run.mjs` 只写 `refusals.total` | 已修（`expectedRefusals`/`expectedMatched`，`tests/sim-expected-refusals.test.mjs` 11/0） |
| S2 | 回执自洽 | 蓝图 `adopt` 带草案时 `pathSource` 说 `setting:`，判 `draft` 的分支永不可达 | 场景硬检查 `pathSource === pathFrom` | 已修（`packs/v5r/tools.js`） |
| S3 | 回执自洽 | kernel 面（会议签到/投票/发言/关会）不披露「谁在行动」，只有 pack 面披露 | 会议回执无 `memberActed` | 已修（`host.js` 的 `toHostSpec` 统一披露） |
| S4 | 回执自洽 | 记录面 `md*` 回执缺 `enforced: []`，与模块头许诺不符 | `tests/audit-receipt-fields.mjs` 5 条 MISSING | 已修 |
| S5 | 回执自洽 | 自报形状名 `scannedPaths` 既未声明也未被门禁扫 | `audit-declaration-criterion` 87/4 | 已修（改名 `paths`，91/0） |
| F1 | 会议 | 相对时间偏移用墙钟 `Date.now()`，固定时钟下 `at:'+60s'` 落到过去，会议立刻开 | 回执 `{state:'open',scheduledFor:null}` | 已修（`kernel/meetings.js` 的 `atMs()` 用注入 clock；`tests/vmu-run229-meeting-clock.test.mjs` 72/0） |
| F2 | 会议 | 同一张 close 回执里 `closureVoteAsOf` 是墙钟、`closureVoteFrozen.frozenAt` 是注入时钟 | 两个数差一个数量级 | 已修（`kernel/index.js` 把 clock 传给 orchestrator；同一回执两钟相等，见同测试 §2） |
| F3 | 会议 | `action:"order"` 只有读路径，规则 E16「主席批量指定发言顺序」不可达 | 回执自述 no write path | 已修（service `order({members})` + 工具面写路径，回执给 `before`/`after`/`moved`；不传 `members` 仍是只读形状） |
| F4 | 回合 | 停泊回合只有一个槽位：第二次 `drive` 静默顶掉前一 prompt，迟到 reply 拒成 `VMU_INVALID_ARGUMENT` | turns 场景 | 已修（保留单槽但具名拒 `VMU_TURN_ALREADY_PARKED`；迟到答复 `VMU_TURN_STALE_REPLY` 点名两边；`tests/vmu-run229-turn-parked.test.mjs` 57/0） |
| F5 | 回合 | `progress` 传字符串时拒回消息泄漏 `undefined`（`unknown record track: undefined`），且提示词教文本形态 | audit A2 | 已修（采「接受文本」：字符串落成一条完整 progress 行并在 `receipt.coercions` 声明这次映射；缺 `track` 的对象按形状具名 skip） |
| F6 | 任务板 | `blocked_by` 不阻挡 claim，与 `FIELD_OWNERS.task_claim` 的 hint 承诺相反 | turns 场景 | 已修（唯一决策点 `kernel/tasks.js` 的 `assign()`：`VMU_TASK_BLOCKED` 列未完成 blockers，hint 只给「做到 done」与「删边」两条真路；成环报 `VMU_TASK_DEPENDENCY_CYCLE`；`tests/vmu-run229-blocked-by.test.mjs` 31/0） |
| F7 | 模拟器 | `harness.mjs` 从 schema 导入不存在的 `defaultsOf`，静默退化 `{}` ⇒ 模拟装配比门禁少 1.3K，报出不存在的余量 | chair/normal 30 302 vs 31 606 | 已修（`vibe-math-vmu/settings/schema.js` 新增具名读者 `defaultsOf()`；新 `scripts/sim/settings.mjs` 作唯一设置源，gate 与 harness 共用；`settings` 也真正传进 `createTurnOrchestrator`；`tests/sim-assembly-parity.test.mjs` 20/0 钉 12 格逐字节一致） |
| F8 | 模拟器 | 无 host 交付接缝，只能走 `deliverMode:'caller'`，委派路径测不到 | turns 报告 | 已修（`boot({deliver})`：仅在传 seam 时装 `subagents`/`agents` 服务形状；实测 `roundsRun:1`、`delivered:[{kind:'one-shot',chars:24521}]`；无 seam 仍 `VMU_ENGINE_UNAVAILABLE`） |
| F9 | 面板 | 结构化值进去、`["[object Object]"]` 出来 | `vibe_vmu_panel set` 的 `plan` | 已修（工具面按形状具名拒；`kernel/panel.js` 的 `String()` 强转改成 `textish()`，直连内核的调用也拒） |
| F10 | 论文 | 对象型 `evidence` 的拒文里含 `[object Object]` | audit A2 | 已修（`packs/v5r/paper-quality.js` 按形状描述；纯解析器报 `not-a-string`；`tests/vmu-run229-serialisation.test.mjs` 46/0） |
| F11 | 通信 | 无 privateSender 接缝时 `chat/supplement` 的 `of` 完全不校验，不存在的邮件 id 也 `ok:true` | comms 报告 | 待决（需要按锚点拒绝，还是在回执里声明未校验） |
| F12 | 通信 | `vmu.chat.admins` 的 schema 默认 `[]`，而教学说「默认院士是管理员」 | start 后实际解析为 `["chair"]` | 待决（改默认值会改变既有部署语义） |
| F13 | 回合 | 内核没有 `certification` 相位，认证臂只能用 `verify` + `verify-debate` 代 | turns 报告 | 待决（与规则文档 D 系条款一并裁） |
| F14 | 通知 | 自动汇报从不发生：`declared:4 armed:4 fires:0 neverDrives:true`；`tick` 拒 `VMU_REPORT_NO_TRANSPORT` | 规则审计 A2 | 待决（决策备忘第 1 条） |
| F15 | 会议 | `vibe_v5_meeting_round` 不可达：`VMU_ENGINE_UNAVAILABLE`（宿主无 subagents 服务） | 规则审计 E12 | 待决（决策备忘第 2 条） |
| F16 | 通信 | 成员调不到 `vibe_v5_message`（只有所办能发），temp 投票先被席面门拒，`V5_NOT_VOTER` 永不触发 | 规则审计 D2/D8 | 待决（决策备忘第 3 条） |
| F17 | 架构 | 截断语义 5 份同名异约（返回 string vs `{kept,dropped,truncated}`） | 架构审计 | 不修（本轮）：先记名，下一轮抽 `records.truncateText` |
| F18 | 架构 | 席位解析 5 份、全仓无路径 helper | 架构审计 | 不修（本轮）：同上，抽公共 helper |
| F19 | 架构 | 死导出 157 个（产品零引用）、另 451 个仅测试引用 | 架构审计 | 不修：删导出会动契约面，须与「回执字段即契约」一并裁 |
| F20 | 可编辑性 | md 唯一真相只覆盖 1/12 轨（蓝图）；论文全在 `vmu/state.json`；手改 md 不重启不生效 | 架构审计 | 部分修：`records reindex` 已提供显式对账；启动自动 reindex 待做 |
| F21 | 模拟器 | `run.mjs` 的 `process.exit()` 在会话目录留下 0 字节孤儿 | 架构审计 | 已修（根因是 `kernel/idempotency.js` fire-and-forget 的 `store.patch()` 与 `store.js:178` 的 tmp+rename 竞态；`run.mjs` 改为先 drain `handle.cleanups` 再删 workspace、`process.exitCode` 取代 `process.exit`；`--keep` 下 `.tmp` 数 0） |
| F22 | 会议 | `motion.quorumRequired` 写了但只有回执读、没有判定 | 架构审计 | 待决（法定人数按出勤已生效，这个字段是历史残留） |

## 4. 这一轮修掉的「同源谎话」

四条共性是同一个错误：**回执为真，但回答的不是读者的问题**。

1. 时钟：说出「内核会把它加到自己钟上」，却用了墙钟。
2. 工具面：说出「一个席位自己行动」，却没披露这次到底是谁在写。
3. 测量：说出「离上限还有 1.7K」，却量的是另一个席位、另一套设置。
4. 形状：把结构化值印成 JS 类型名，读者以为那是内容。

## 5. 纪律（写进流程，不靠记性）

- **模拟器不许比真机短**：装配路径必须与 `scripts/audit-prompt-budget.mjs` 同源；
  模拟出的提示词更短 ⇒ 报出不存在的余量 ⇒ 这就是 RUN 226 刚修掉的缺陷。
- **声明过的拒绝必须显式声明**（`expectedRefusals`），否则 audit 判失败；反过来，
  把未预期的拒绝塞进声明列表就是绕过，不允许。
- **每条「可达」都要有回执引用**（tool + 字段），不许凭代码推断。
- **发现即记账**：先写台账再修，修完补状态与测试名；不修的必须写理由。
