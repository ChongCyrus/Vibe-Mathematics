# RUN 240-K · 工具面动作覆盖矩阵（声明 × 仿真 × 真机）

> 口径：**声明**=内核/宿主与 pack 在**真实注册表**里声明的每个工具的 `action`/`op` 枚举（无枚举的按分派代码/拒绝提示列的动词补齐）；
> **覆盖**=全部仿真 corpus 的 `receipts.jsonl` 里真实出现过的 `(tool, action)` 并集；**保真**=真机 `D:/_tmp/sim/real-fieldset.json`
> 记的每工具回执字段，与全部语料回执字段并集的差。
>
> 本轮（task-47）新增语料 `actions-extra`：一个场景把**声明过、此前没人调用**的动词逐个真调一次——修参过程本身也成了证据
> （见 ③），不是伪造：每个动作都经真内核真工具、真收据落盘。

## ① 数字（十一语料并集）

| 项 | 本轮 | 上一轮（六语料） |
| --- | --- | --- |
| 声明的工具（内核面 + pack 面） | 68 | 68 |
| 其中带动作参数的工具 | 27（225 动作） | 27（225 动作） |
| 仿真覆盖的动作 | **218** | 68 |
| 未覆盖的动作 | **7** | 157 |
| 一个动作都没调的工具 | **0** | 41 |
| 单功能工具（无 action 参数） | 41，**41 个都调用过** | 41（13 调用） |
| 码里没有实现的死动词 | 0 | 0 |
| 剩余未覆盖的 `why` 类别 | `blocked-by-defect` 7 | `should-add-sim-step` 171 等 |

## ② 语料

| 场景 | receipts | steps | 说明 |
| --- | --- | --- | --- |
| mainline | 21 | 21 | 机构主干 |
| meetings | 59 | 59 | 会议/动议/票箱 |
| paper | 17 | 19 | 论文面 |
| paper-gates | 42 | 42 | 论文闸拒收 |
| records-blueprint | 27 | 29 | 记录/蓝图（本轮已不再崩） |
| comms | 50 | 50 | 通讯/信箱/聊天 |
| feedback63 | 19 | 15 | 反馈/席面 |
| refusals | 50 | 50 | 具名拒收面 |
| rules-extra | 52 | 52 | 规则面补充 |
| turns | 24 | 17 | 回合/提示词 |
| **actions-extra** | **324** | **318** | 本轮新增：A–Z6 分区逐个动词真调 |

`actions-extra` 的步法：`A` 建所 → `B` 蓝图 → `C` 记录 → `D` 面板 → `E` 汇报 → `F` 任务 → `G` 方向卡 →
`H` 控制 → `I` 环境/中间件/包 → `J` 脚本 → `K` 反馈 → `L` 等待 → `M` 会议（SERVICE + PRIMITIVE 两注册表）→
`N` 人类在环 → `O` 数学面 → `P` Lean → `Q` 论文/裁决/回合 → `X` 拒收面 → `Y` 拒收形状 →
`Z2` 剩余动词（第二场会的 convene/withdraw/票箱、reviewers 十字、两条记录面、pause/resume）→
`Z3` 最后几条（mailbox flush、减员、原语 withdraw）→ `Z4` 字段补读 → `Z5` 二次字段补读 →
`Z0` 启动即读回（`human readBack`）→ `Z6` 轮次发言/票箱裁决/坏超时/文献晋升 → `Z` 收所。

## ③ 本轮补覆盖的做法（可复用的读法）

- **两个注册表**：pack 的 `vibe_v5_meeting{action:"convene"}` 开的是 **SERVICE** 会议（id `m1`）；`silent/hands/refuse/
  phase/snapshot/aggregation/complete/agendaitems/…` 是 **PRIMITIVE-ONLY**，对 service 会议具名拒 `VMU_REGISTRY_BOUNDARY`。
  仿真里要真的覆盖它们，必须再开**原语会议** `vibe_vmu_meeting{action:"open", agenda, roster, secretary}`。
- **动议 id 的取法**：`vibe_v5_motion` 的 raise 回执把 id 放在 `motion` 字段（`motionQualified:"m1/mo1"`），不是 `meeting`；
  `withdraw/second/ballot` 要的是这个 id。
- **包的票箱是第二套底座**：`boxopen{target,options}` → `boxcast{ballotId,member,value}` → `boxclose` 可完整走通；
  `boxlapse/boxrevokelapse/boxreopen` 在无时限、无裁定、未 lapsed 的状态下各自按名拒收并给 hint（`zeroMechanism` 是这套的真相）。
- **一次坏调用 = 一整个拒收形状**：每个面故意缺参一次（`X`/`Y`/`Z4`/`Z5`/`Z6` 共 80 多次），回执就带出
  `code/message/hint/required/missing/enforced/enforcedScope` 这批真机常有的字段；拒收必须 `expectedRefusals` 具名声明，
  否则 `run.mjs` 判机制拒 → exit 1。
- **拒收形状 ≠ 拒收**：`vibe_vmu_reviewers` 的 `register/assign/…` 在非法参数下回 `ok:true` + `code` + `hint`
  （面内自判），审计只把 `ok:false` 当拒收 ⇒ 这类调用既覆盖动作又不污染 A4。
- **同一条路径只读一次不够**：`vibe_v5_verified_promote` 第二次调用回 `unchanged:true` 才带出 `p1Route/p1Routes/refreshed`；
  `vibe_v5_say` 用 `round`（chat 轮）形态一次带出 18 键（`quota/replyTo/quotes/spokenBy/remaining/roundSurface`）。

## ④ 剩余 7 条未覆盖（全部 `blocked-by-defect`，有证据）

| 工具 | 动作 | 为什么调不到 |
| --- | --- | --- |
| `vibe_vmu_human` | `recover` | 启动后立刻调：`ok:true` 但**把花名册裁到只剩主席**（后续 `blueprint propose(member:"r-1")` 变 `VMU_NO_SUCH_OBJECT`）；写过键后调：`ok:false` 且**无 `code` 无 `hint`** ⇒ A4 |
| `vibe_vmu_mathjobs` | `mirrorRel` | 回执把对象塞进路径：`result:"Math/Jobs/[object Object].json"` ⇒ A2 SERIALISATION_LEAK |
| `vibe_vmu_meeting` | `leaverequest` | 原语实现无此方法：`VMU_STATE: live(...).requestLeave is not a function`，`hint:null` |
| `vibe_vmu_meeting` | `leaverequests` | 同上（`leaveRequests` 不存在） |
| `vibe_vmu_meeting` | `leaveapprove` | 需 `by`，但原语记录没有批准通道；调进来只会回无 hint 的拒收 |
| `vibe_vmu_meeting` | `lapse` | 同上（`lapse` 不存在） |
| `vibe_vmu_meeting` | `revokelapse` | 同上（`revokeLapse` 不存在） |

结论：**不是场景没写**，是产品侧「声明了却不可调用」。修 recover 的 code/hint、mirrorRel 的路径序列化、
原语请假/失效五方法，这 7 条就能覆盖；当前留 `never` + `blocked-by-defect` 是有意的，避免用污染 A4/A2 的调用冒充覆盖。

## ⑤ 保真缺口（真机字段 vs 仿真字段）

`D:/_tmp/sim/real-fieldset.json`（69 工具的真实回执字段并集）对比全部语料回执字段并集：

| 项 | 数 |
| --- | --- |
| `all.mjs` §5 报的保真缺口（工具数） | **19**（上一轮 23；最早 57） |
| 其中已由 lead 的 `fidelity-declared.json` 声明为部署不可达 | 6（全部匹配） |

本轮已压下来的（上一轮缺口清单里的）：

- `vibe_v5_say`（19 键）、`vibe_v5_verdict`（重复裁决 `existing/incoming/sameVerdict`）、`vibe_v5_motion`、`vibe_v5_second`、
  `vibe_v5_meeting_round`：真会真调 + 一次按名拒收，`quota/enforced/enforcedScope/evaluated/provenance` 这批键全到齐。
- `vibe_v5_wait`（`enforced/enforcedScope`，由坏超时拒收带出）、`vibe_v5_verdict_final`（`evaluated:[]`，对不存在会议）、
  `vibe_v5_verified_promote`（`p1Routes/rev`，文献路线二次调用）、`vibe_v5_record_proposition`（`wouldEvaluate`，p=1 无凭据拒收）、
  `vibe_v5_mailbox`（`from`）、`vibe_v5_read_library`（绝大多数字段由 `list/limit` 读回）。
- `vibe_v5_assign` / `configure` / `message` / `inbox` / `feedback` / `hire`：各补了真拒收或真调用，`code/hint/message/enforced*` 大多已出现。

剩余 19 条按**为什么补不到**分三类：

| 类 | 工具::字段 | 原因 |
| --- | --- | --- |
| 需部署接缝/执行器（不在场景能力内） | `vibe_vmu_env::exitCode,resolved,results,stderrTail,stdoutTail,version`；`vibe_vmu_mathjobs::job`；`vibe_vmu_mathtools::cached,receipt,result` | `env probe` 无 spawn 接缝回 `VMU_ENGINE_UNAVAILABLE`；`mathjobs submit` 回 `VMU_EXTERNAL_UNAVAILABLE`；`mathtools run` 需真引擎 |
| 产品缺陷/缺陷路径（调用即污染 A2/A4） | `vibe_vmu_human::hint,message,plan,recovery`；`vibe_vmu_records::doomedActiveCount,doomedActiveMeans,expandedFrom,head,path,seatFace,seatFaceMeans`；`vibe_v5_hire::enforcedScope` | `human recover` 即 ④ 的缺陷；records 这批键只在 scrub/doomed 路径出现（该路径回执缺 hint）；hire 的 `enforcedScope` 只在容量拒收时出现，而本场景的 hire 只按名拒参数错 |
| 需要罕见前置/另一条路径 | `vibe_v5_task_get::briefNote`；`vibe_v5_read_library::enforced,enforcedScope`；`vibe_v5_verdict_final::applicable,cardId,consumer,required`；`vibe_v5_verified_promote::applicable`；`vibe_v5_record_proposition::op`；`vibe_vmu_meeting::agendaOpen,asked,closedReason,completeness,endedAt,forced,hasDeliverSeam,inputs,registryMeans,rounds,seatPolicy,silent,unreached`；`vibe_vmu_panel::enforcedScope,target`；`vibe_vmu_mailbox::from` | `briefNote` 只在 brief **查询失败**且 code≠`VMU_NO_SUCH_OBJECT` 时出现；`verdict_final` 的 4 键只在**有裁决但缺消费者**时出现；meeting 的 13 键分散在 `end{force}/silent/flow/complete/status` 的罕见形态里；`panel::target` 需 `trace` 目标 |

结论：这 19 条**不是覆盖缺口**（每个工具都真调过），而是真机在某次部署里出现过、仿真环境物理上造不出的字段——
应写进部署面声明（`scripts/sim/audit/fidelity-declared.json`，由 lead 维护，本 lane 未触碰），或作为产品缺陷单独修。

## ⑦ 判据结果（`node scripts/sim/audit/all.mjs`）

- §1 十一个场景全部 `OK`（含 actions-extra：steps 318 / calls 324 / refusals 98，mechanism 0）
- §2 收据审计 A1–A5：actions-extra 0 finding（324 calls / 7 files）；唯一 finding 是 `paper-gates` 的 A5 UNREGISTERED_CODE（属 lane-c2 场景，不在本 lane 写域）
- §3 规则覆盖：93/93，dangling 0
- §4 动作覆盖：`tools: 69; declared actions: 225; covered: 218; never-exercised rows: 7`
  （JSON 侧按声明 68 工具统计；68/69 是 `all.mjs` 与 JSON 的计数口径差）
- §5 保真缺口：`gaps: 19`（FAIL 的另一来源）；`declared-unreachable: 6`，matched 6

`AUDIT: FAIL` 的两个失败项都不是本场景引入：① `paper-gates` 的 A5（lane-c2 场景）；② 保真 19（见 ⑤，需部署面声明或产品修复）。

## ⑥ 复现

```bash
# 新语料（本轮新增）
node scripts/sim/run.mjs --scenario actions-extra --out D:/_tmp/sim/corpus-actions-extra   # 期望 exit 0
node scripts/sim/audit/receipts.mjs D:/_tmp/sim/corpus-actions-extra                       # 期望 findings 0

# 覆盖矩阵（十一语料并集 → scripts/sim/audit/action-coverage.json）
node D:/_tmp/g7a10/gen-coverage-union.mjs

# 判据（整条）
node scripts/sim/audit/all.mjs
```
