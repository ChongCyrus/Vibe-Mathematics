# Round 10 · task-74 · A（B1–B4 八键＋真读者）＋ B（`control/idle` 钩子＋轮询点）

- 状态：**A 完成**（8 键全部落地且**每键有真读者**，探针 `44/0`）；**B 完成**（钩子已登记＋边沿触发＋**轮询点＝既有 tick `beat()`**，两条钩子门禁绿）；**另修 3 处**（`ballots` 具名容忍、`PROJECTION_KEYS` 改名、`members` 具名原因）；**收尾追加两条均已完成**（`task/assign-objected` 广播 emit ＋ **M2 能力门控服务访问缝 `api.services.get`**，见 §6）。
- **唯一剩余红**：`audit-enforced-consistency` **354/1**（`findings=2`：`recruit.js`／`tasks.js` 被列 UNCOVERED-MODULE）——该门的**场景表在 `tests/audit-enforced-consistency.test.mjs`（vmu-verify 的文件）**，需它加两行场景（见 §5），我不动 tests/。
- 纪律：未跑全量、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r10`；结构性编辑逐条原子完成。

## 1. A · 八键＋真读者（每键：v5r 出处 → 默认 → 读者 file:line → 实测）

| 键（schema 行） | v5r 出处（值/语义） | 读者（file:line） | 实测行为 |
|---|---|---|---|
| `vmu.prompt.compactThreshold` = 66 | `:1078`；`:3902-3903` 的 `soft` 判定；`:449` 明写 **百分数 0–100 不是 0–1**；`:9869` 拒 ≤0 | `kernel/prompt/index.js` 的 `compactionOf()`（:103 一带）＋ `assemble()`（:639 一带，读 `ctx.contextPct`） | `contextPct:70 ⇒ due`，**指示被前置进 `text`**，回执 `enforced=['vmu.prompt.compactThreshold']`；域外值 ⇒ 具名拒（**未声明 ⇒ 回落 v5r 默认**，零机制下不崩） |
| `vmu.prompt.compactAfterRounds` = 8 | `:1079`；同上"或"关系 | 同上（读 `ctx.round`） | `round:8 ⇒ due`，`enforced=['vmu.prompt.compactAfterRounds']`；`wake='meeting'` ⇒ **不注入**（v5r `:3901`） |
| `vmu.paper.finalPaper` = true | `:1163`；消费点 `:7867 if (params.finalPaper !== false)` | `kernel/paper.js` 的 `cfg()`＋`finalize({auto})` | `auto:true` 且声明 false ⇒ **具名拒 `VMU_NOT_PERMITTED`**（不静默降级为手动）；手动路径仍可用 |
| `vmu.paper.format` = 'both'（enum both\|md\|tex） | `:1164`；消费点 `:8252` | 同上（进 `artifact` 与 **`register()` 请求**） | `format:'md'` ⇒ `pdf:false` ＋ v5r `:8820` 的具名 note；域外值 ⇒ 具名拒并列出域 |
| `vmu.paper.language` = 'zh'（enum zh\|en） | `:1165`；消费点 `:8251` | 同上 | `language:'en'` 被带进请求与回执 |
| `vmu.paper.compilePdf` = true | `:1166`；消费点 `:8258` | 同上 | `compilePdf:false` ⇒ `pdf:false`；与 format 的合取见上 |
| `vmu.members.maxTempPerMember` = 3 | `:1075`；消费点 `:8920-8924`（`perCap = max(1, floor(v\|\|3))`、按 `hiredBy` 分组、`V5_MEMBER_LIMIT` 给 current/limit） | `kernel/recruit.js` 的 `cfg()`＋**`accept()`** | 同一接纳人第 2 个试用期成员 ⇒ 具名拒 **`VMU_MEMBER_LIMIT`**（`current/limit/scope:'per-member'`）；不同接纳人各自预算；`0 ⇒ 3`（v5r 同形，不是 0 上限） |
| `vmu.tasks.memberMayRejectAssign` = true | `:1066`；消费点 `:9555-9562`（`reject_assign && memberMayRejectAssign` ⇒ 广播给 voters，原文"任务仍会执行"） | `kernel/tasks.js` 的 `assign()`＋新 **`objectAssign()`** | true ⇒ 异议进**只增台账**（`history()` 的 `assign-objected`，随投影耐久）且**任务仍执行**；false ⇒ **具名拒**（v5r 静默忽略该字段，vmu 刻意更严） |

**探针**：`node D:\_tmp\vmu-r10\b1b4.mjs` ⇒ **TOTAL pass=44 fail=0**，`exit=0`（分 6 组：压缩门 10 条／论文输出 8 条／临时上限 5 条／异议 6 条／`ballots` 别名 5 条／`control/idle` 9 条）。

**接线**：`kernel/index.js:658` 的 `createTasks({…, settings: settingsView})`（新缝，让 `tasks.js` 按活设置读取）；`settings/schema.js` 手写 8 行（每行 doc 带 v5r 行列号与读者）；`docs/04` 由 `generate-vmu-settings-table.mjs --write` 重生成 ⇒ **1228 键（1108 wired／120 declared-not-wired）**。

## 2. B · `control/idle`：钩子 ＋ **轮询点**（★ 无生产者钩子的解法）

1. **登记**：`kernel/bus.js` 的 `HOOK_REGISTRY` 新增 `control/idle`（`failure:'open'`，producer `kernel/control.js`）；`VU_NAMESPACE` 正则本已含 `control/` 前缀 ⇒ 无需改。
2. **发布**：`kernel/control.js` 的 `idleState()` 在**空闲越过阈值**时 `emit('control/idle', {at, elapsedMs, afterMs, action})`。★ **边沿触发**：同一空闲**episode 只发一次**（回执 `emitted:true/false` ＋ `emittedAt`），任何"非空闲"观测**清除边沿** ⇒ 下一个 episode 再发。理由：轮询谓词若每次调用都发，中间件会被反复请求"开会"。
3. **轮询点（新增，解决"零调用者"）**：`kernel/index.js` 的 **`beat()`**——它是既有 tick（"到底还有没有人在干活"），现在**在重置活动时钟之前**用**上一次心跳时间**判定空闲，于是"长时间静默后的那一次心跳"正好是 institute 复活的时刻，`control/idle` 就在那里发出。另加 `kernel.idleState({lastActivityAt,at})` 作为**文档化只读**（监视器/宿主可自行轮询，**同一边沿**，不会双发）。
4. **代价与诚实边界**（写进 `docs/03 §2`）：**一次同步谓词／每次心跳，无新定时器**；**没人心跳的停滞系统无法自己唤醒自己**——这是刻意的（本面无定时器，`watchdogIntervalMs=0` 即无定时器，定时器归调度器）。
5. **实测**：`control/idle` 边沿 6 条 ＋ `beat()` 轮询 3 条（`b1b4.mjs` §⑥，全绿）；`node scripts/audit-hook-emit-classification.mjs` ⇒ **7 passed, 0 failed**（`exit=0`）；`node tests/audit-hook-coverage.test.mjs` ⇒ **4/0**（`exit=0`）。
6. **下游**：vmu-pack 的 `stallDecision()`＋M2 条目已就绪，钩子一落即可进仓（已通知）。

## 3. 顺带修的三处（都是"声明了没生效"同类）

1. **`ballots` 具名容忍＋告警**（Lead 裁决）：`kernel/index.js` 新增 `PROJECTION_ALIASES = { ballots: 'ballotbox' }`；老部署写旧拼写**仍然挂上**，但会 **`log({type:'vmu/deprecated-projection-name', …})` 具名告警**，并在 `status().projections.aliases`／`viaAlias` 里可见；两名同声明 ⇒ **只挂一次**（不双写）。pack 已把声明改成 `ballotbox` ⇒ v5r 路径上 `viaAlias: []`，该容忍只对老部署生效。
2. **`PROJECTION_KEYS` 的 `ballots` → `ballotbox`**（`kernel/resume.js:59`，Lead 判为我的卷）：此前 `known`／`unwiredKnown` 永远报一个**没人能挂的名字**。兼容性只留在上面的别名里。
3. **`members` 的未挂原因变成"给部署看的话"**：`targets.members` 在本装配是 `null`（零机制：没声明 slots/maxLiveMembers 就没有 members 实例）⇒ 以前报内部味的 `attachProjection needs a target object`，现在报 **`VMU_RESUME_NO_TARGET`** ＋ "this assembly has no members face to project: the service is null because nothing declared it (zero-mechanism) …"（已在 §8 登记该码）。

## 4. 验证（原样命令 ＋ 退出码）

```
node D:\_tmp\vmu-r10\b1b4.mjs                      → TOTAL pass=44 fail=0          exit=0
node scripts/audit-hook-emit-classification.mjs    → 7 passed, 0 failed            exit=0
node tests/audit-hook-coverage.test.mjs            → HOOK COVERAGE: 4 passed, 0 failed   exit=0
node tests/audit-vmu-docs.test.mjs                 → 84 passed, 0 failed            exit=0
node scripts/check-docs.mjs                        → DOC LINT: PASS                 exit=0
node tests/vmu-settings.test.mjs                   → 47 passed, 0 failed            exit=0
node tests/vmu-planned-settings.test.mjs           → ALL GREEN (planned=113)        exit=0
node tests/vmu-kernel.test.mjs                     → 175 passed, 0 failed           exit=0
node tests/vmu-host.test.mjs                       → 107 passed, 0 failed           exit=0
node tests/vmu-entry.test.mjs                      → 150 passed, 0 failed           exit=0
node tests/vmu-tasks.test.mjs                      → 42 passed, 0 failed            exit=0
node tests/vmu-recruit.test.mjs                    → 44 passed, 0 failed            exit=0
node tests/vmu-prompt.test.mjs                     → 70 passed, 0 failed            exit=0
node tests/vmu-prompt-v5r-bridge.test.mjs          → 12 passed, 0 failed            exit=0
node tests/vmu-paper.test.mjs                      → 37 passed, 0 failed            exit=0
node tests/vmu-turn.test.mjs                       → 145 passed, 0 failed           exit=0
node tests/vmu-resume-e2e.test.mjs                 → 90 passed, 0 failed            exit=0
node tests/vmu-resume-recovery.test.mjs            → 73 passed, 0 failed            exit=0
node scripts/generate-wired-schema.mjs --write     → 333 emitted / 782 pre-existing exit=0
node scripts/generate-vmu-settings-table.mjs --write → 1228 keys (1108 wired)       exit=0
node scripts/generate-planned-codes.mjs --write    → 276 planned codes              exit=0
node tests/audit-enforced-consistency.test.mjs     → 354 passed, 1 failed           exit=1（见 §5）
```

## 5. 唯一剩余红 ＋ 未做项（具名）

1. **`audit-enforced-consistency` findings=2**：`recruit.js`／`tasks.js` 本轮**新增了 `enforced` 令牌**，而该门的场景表在 `tests/audit-enforced-consistency.test.mjs`（**vmu-verify 的文件**）。请它加两行场景（照既有形状）：
   - `recruit.accept(maxTempPerMember)`：键 `vmu.members.maxTempPerMember`，`limit=1`／第二个成员 ⇒ 回执 `tempCap:{limit,held,after,enforced}` 与拒绝 `VMU_MEMBER_LIMIT`（含 `enforced`）；
   - `tasks.objectAssign(memberMayRejectAssign)`：true ⇒ 记录且 `fired=enforced=[key]`；false ⇒ 具名拒且 `enforced=[key]`。
   （判据＝该门 `findings=0`。**我不改 tests/**。）
2. ~~异议的"广播"半~~ → **已完成**（§6.1）：`kernel/tasks.js` 的 `objectAssign()` 现在 **emit `task/assign-objected`**（vmu-pack 按 Lead 指示先登记的钩子：`failure:'open'`、**不可阻断**），回执 `broadcast:{attempted:true, emitted:true, middleware:N, audience:…}`；无 bus 缝时**具名**说明"只落台账、未广播"。两条钩子门禁因此回绿。
3. **`docs/03 §6` 的公开键散文清单**仍未逐一列出 `ballotbox`／`minutes` 等（门禁不管；键已在 §2.1／§8 有位置）。
4. `docs/03 §8.2` 行号已更正为 `:611/:658/:747`（Lead 报的漂移）。

## 6. 收尾追加（Lead 当场裁定的两条，均已完成）

### 6.1 `task/assign-objected` 广播 emit（生产者接线）
- `kernel/tasks.js` 的 `objectAssign()` 改为 **async**：先 `record('assign-objected', …)`，再 **`await bus.emit('task/assign-objected', { at, id, by, why, state, owner }, { member: by })`**。
- 回执：有 bus 缝 ⇒ `broadcast:{attempted:true, hook, emitted:true, middleware:<决策数>, audience:'the middleware decides the audience (v5r broadcast to voters; this face has no roster, so it invents no recipient list)'}`；**无 bus 缝 ⇒ `attempted:false` ＋具名 reason**（不假装广播过；异议本身始终耐久在 `history()`）。
- **读数**：`node scripts/audit-hook-emit-classification.mjs` → **7 passed, 0 failed**（`exit=0`，此前 6/1 的 `never:["task/assign-objected"]` 已消）；`node tests/audit-hook-coverage.test.mjs` → **4/0**（`exit=0`）；`node tests/vmu-tasks.test.mjs` → **42/0**（`exit=0`）。

### 6.2 M2 的**能力门控服务访问缝** `api.services.get(name)`（Lead 裁决方案 a）
**动机（vmu-pack 实测）**：M2 模块此前只能碰到 `api:[log,setting,kernel,dryRun,traceId,hook]`／`kernel:{read}`／`ctx:{member,role,phase}` ⇒ **够不到任何服务** ⇒ "静止⇒开会"这类**由中间件实现机构策略**的事做不到；而 (b)/(c)（把 convener 塞进控制面/M1 动作集）会把政策搬进内核，与 R1 相冲。

**实现（两半，都在缝的"发布 vs 许可"分工上）**：
- `kernel/loader.js`：`API_KEYS` 加 **`services`**；`makeApi(entry, hook, traceId, caps)` 新增冻结的 **`services.get(name)`／`services.names()`**：
  - 模块**未声明** `trigger-workflow` ⇒ **`VMU_NOT_PERMITTED`**（`enforced:['capabilities.trigger-workflow']`）；
  - 声明了但该服务**未发布** ⇒ **`VMU_NO_SUCH_OBJECT`**，`hint` **列出已发布的名字**；
  - 空名字 ⇒ **`VMU_INVALID_ARGUMENT`**（参数错误 ≠ 查不到）。
  - 调用点传入 `module.capabilities`（即"**声明即许可**"，没有第二份名单）。
- `kernel/index.js`：`createLoader({ services })` 增加 **`get(name)`／`names()`**，由**惰性目录函数** `middlewareServiceCatalog()` 提供（惰性是因为面 `const` 分布在该点前后，快照会踩 TDZ；且**只列本装配真的持有的面**：`tasks/meetings/chat/mailbox/panel/minutes/ballotbox/members/commitlog/library/records/human/budget/activity`）。这一半只回答"**发布了吗**"，"**你有没有权限**"由 loader 那半回答。

**实测**（`node D:\_tmp\vmu-r10\m2-services.mjs` ⇒ **TOTAL pass=9 fail=0**，`exit=0`）：
- ★ **能力门控正向**：声明 `trigger-workflow` 的模块在 `control/idle` 处理器里 `api.services.get('vmu.meetings')` ⇒ **真的开到会**（拿到真方法、按自己的参数调用）；
- ★ **真装配正向**：`createKernel()` 的 `k.loader.load(...)` 里同一路径 ⇒ **够到真 `vmu.tasks` 并真的建了一条任务**（`k.tasks.list().length === 1`），且 `names()` 非平凡；
- ★ **两个反向都具名**：无能力 ⇒ `VMU_NOT_PERMITTED`；未发布 ⇒ `VMU_NO_SUCH_OBJECT`（含已发布清单）；空名 ⇒ `VMU_INVALID_ARGUMENT`。

**门禁**：`vmu-loader 28/0`、`vmu-bus 44/0`、`vmu-host-hooks 22/0`、`audit-hook-coverage 4/0`、`audit-hook-emit-classification 7/0`、`audit-vmu-docs 84/0`、`vmu-kernel 175/0`（全 `exit=0`）。

**⇒ vmu-pack 现在零改动可接**：`stallDecision()`（阈值 `3 × vmu.control.idleAfterMs`＝360000，v5r `:1082/:1083`）＋ M2 条目 `{id:'v5r.stall-meeting', kind:'module', capabilities:['trigger-workflow',…], on:['control/idle']}`，在处理器里 `api.services.get('vmu.meetings').open(…)` 即可。

