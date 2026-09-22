# dsh-vibe-math 2.1.0 —— 新增 V5「研究所体系」

本版在原有 v2 / v3 / v4 三套预设之外，新增**第五代架构 `vibe-math-v5`：研究所体系**。
安装本包后，预设选择器里会出现**四个**预设。

---

## 一、V5 是什么

一座**自组织的研究所**，靠"说话"解决问题：

| 职位 | 代号 | 职权 |
|---|---|---|
| **院士**（领头人） | `acad` | **组织与协调中心**：建立全所视图、把问题拆解成任务并**分派**、设定优先级、召集并主持会议、督导进度与催办停滞、调配临时工、对外汇报。**一票与他人等重，不能单方面定论。** |
| **常驻研究员** | `r-<n>` | 有表决权；**可自主雇佣/解雇自己的临时工**；向院士汇报并接受其组织与分派。 |
| **临时工** | `t-<n>` | 为特定任务临时雇入；可读、可想、可发言、可写自己的成果库、可认领或被分派任务；**没有表决权**。 |
| 所办（对外接口） | —— | 就是主助手：**不参与研究、不投票**。只负责汇报、转达人的指令，并代持平台要求的创建权。 |

**框架只是媒介**：中继群聊与私信、召集会议、记成果库、统计共识、管理上下文与断点。
它**从不指派任务**——指派者是院士，一个和研究员一样受表决规则约束的成员。

## 二、求真规则（V5 的核心变更）

一个对象要进入 `Verified/`，必须**同时**满足：

1. 至少有 **m = min(`quorumCap`, 有表决权人数)** 名有表决权者（院士 + 常驻研究员）投出**布尔概率值**；
2. 这些票**全部**是 `1`（绝对为真）或**全部**是 `0`（绝对为假）。

- 票是 `[0,1]` 的数值：`1` = 断言为真，`0` = 断言为假；
- **严格介于 0 与 1 之间 = 弃权/存疑**：不计入 m，但计入"全组平均概率"；
- **任何一张反向的布尔票都会阻塞定论**——所以少数派无法靠别人弃权把结论推过去；
- 未达门槛 → 对象**留在原库**并附全组平均概率与完整辩论录，**不强行裁决**；
- 表决两段式：先【独立初评】（彼此不可见），未定论再【公开辩论】（互相可见后重新投票），
  轮次上限 `verdictMaxRounds`（默认 3）。

> 与 v4 的差别：v4 要求**全体常驻一致**；v5 改为**至少 m 名一致**（`quorumMode: "all-unanimous"`
> 可切回 v4 口径）。默认 `quorumCap = 3`。

## 三、V5 的其他能力

- **群聊 / 私信 / 会议**：成员在群聊里说话、可私信、可提议开会；院士可直接召开并设定议程。
  会议纪要落到 `Shared/Meetings/<id>.md`，辩论录落到 `Shared/Debates/<target>.md`。
- **任务板**：`task-<n>` + **revision 比较交换**（拿过期副本改会被拒绝）+ **依赖 DAG**
  （缺依赖/重复/成环都会被拒）+ 优先级 + 院士分派（须写明**理由**与**验收标准**）。
- **成果库**：每人独立目录 `Members/<id>/{Progress,Propos,Methods,Subproblems}/`，
  **只写自己、可读他人**。入库必须写明 **价值程度 / 动机用途计划 / 概率估计**（缺一不可）。
  章程里对 `Progress/` 给出了完整定义与**用途说明**（思考痕迹、压缩后恢复状态的主要依据、
  院士统筹全所的输入、失败与死路同样值得记）。
- **雇佣 / 解雇**：院士与常驻研究员**都能**雇佣临时工；解雇是**真实**的——
  中断其当前回合、`drainContinuableChildren` **释放其常驻身份**、**收回其未完成任务**、
  丢弃其邮箱、标记除名；**代号永不复用**。
- **上下文**：达阈值自动压缩（真实 `/compact`，缺失 `compaction` 服务时回退到自述浓缩）。
  章程写在成员 `persona` 里，**压缩后依然生效**——不需要 v4 那套"压缩后重申规则"的补丁。
- **断点续跑**：状态存在**会话日志的 host-only 投影单元**里（键 `vibeMathV5`），
  由 DSH 负责 checkpoint 与恢复；若宿主没有 `sessionProjections`，回退到加固 JSON 状态文件。

## 四、快速上手

```
vibe_v5_configure { project?, institute?, problem?, params? }   # 先配置，不启动
vibe_v5_start     { problem?, researcherCount?, academician?, seedDirections? }
vibe_v5_report    / vibe_v5_status                              # 汇报 / 状态
vibe_v5_message   { to|all, content }                           # 人以所办身份留言
vibe_v5_meeting   { agenda, kind }                              # 召集会议
vibe_v5_members / vibe_v5_hire / vibe_v5_fire / vibe_v5_set
```
斜杠命令：`/v5 configure|start|resume|pause|stop|status|report|members|message|meeting|hire|fire|add|remove|set`

**主助手（所办）是 hands-off 的**：`vibe_v5_start` 之后请保持被动，只在用户明确要求或
研究所明显僵死时介入，且只做"促成"，不做"决定"。

## 五、重要边界（请知悉）

- **试验性架构**：v5 是新增的第五代实现，与 v2/v3/v4 并存、互不影响；三个旧预设行为未变。
- **一所一会话**：一个会话承载一座研究所；要另建一座请开新会话（`configure` 会拒绝在运行中
  切换项目/所名，以免状态分裂到两棵树）。
- **解雇是逻辑除名 + 真实释放**：DSH 的 roster 没有"删除"，v5 用
  `drainContinuableChildren` 真实释放常驻身份并**永不再向其投递**；其档案留在所史里。
- **编制变更需所办批准**：成员（含院士）只能**提议**增聘/解聘**常驻研究员**；
  临时工的雇佣/解雇才是成员自主权。
- **m 随人数浮动**：`m = min(quorumCap, 在册有表决权者数)`。若在册人数少于 `quorumCap`，
  m 会随之下降（这是 `min{3, 人数}` 的定义所决定的）；若你希望"人少就不能定论"，
  请把 `quorumCap` 调高（例如固定为 3 并保持 ≥3 名研究员在册）。
- **不引入任何 npm 实验包**：v5 是 preset 内的单个 `.js` 文件，不依赖 DSH 的实验性
  agent-team 包，因此不需要 pnpm、不改 profile、不需要额外重启。
- **`State/` 只是人读镜像**：权威状态在会话日志投影里，请勿手改 `State/` 下的文件。

## 六、验证

- `selfdrive-v5.mjs`：**70 条断言全绿**。用 mock host + **mock 投影注册表**（忠实复现
  `register` / 事件即时折叠 / `stateOf`）驱动真实插件，覆盖建所、章程注入、群聊扇出、
  私信、临时工权限、m 票门限（m−1 不进 / 1 与 0 混合不进 / m 票全 1 才进）、弃权不计 m、
  任务板 CAS 与依赖成环、院士分派与越权拒绝、真实解雇（中断+释放+任务回收+代号不复用）、
  会议互斥与暂存、全体一致才结题等。
- `e2e-v5-round2.test.mjs`：**53 条断言全绿**，专攻第一套未覆盖的行为路径 ——
  **加固 JSON 回落后端**、**模拟进程重启**（新宿主 + 新后端读回持久状态并 resume 重建）、
  重复 `subagent/end` 幂等、雇佣配额（每人上限 / 全所上限）、`quorumMode: all-unanimous`、
  **名册缩减时 m 重算**、`vibe_v5_wait`（区间校验 / 无人在跑快捷返回 / 被真实活动唤醒）、
  `read_library`（跨读他人库）、id 消毒抗路径穿越、运行中 configure 守卫、
  **看门狗放弃卡死验证**、**会议在验证后面暂存并随后真正召开**、
  **压缩指令只在该出现时出现且不重复**、**会话日志回放复现研究所状态**。
- `audit-v5-sensitivity.mjs`：**15 个敏感性探针全部命中**（故意破坏 m 门限、弃权计数、
  冲突阻塞、临时工表决权、院士分派门禁、建所回合登记、群聊扇出、辩论轮推进条件、
  真实释放、全体一致结题、回落后端加载、解决票再评估、提议确定性启动、begin 互斥、
  会议锁重武装 —— 每一条都能让测试变红），证明测试不是空转。
- `audit-v5-integrity.mjs`：静态自检 6 类（未定义调用 / `params` 键 / 会话 API 面 /
  错误码与文档漂移 / 遗留标记 / 组合行可解析），输出 clean。
- 无回归：`selfdrive-v4` 21/21、`e2e-v4-fixes` 120/120、`e2e-v3` 100/100、
  `e2e-multisession` 25/25、`e2e-business` 18/18、`e2e-regression`、`e2e-v3-roundtrip`、
  `e2e-d9-d13` 及全部历史审计套件均通过；`e2e-installer-test` 通过并发现
  `vibe-math-v5 (broken=no, persona schema OK)`。
- 宿主契约已实测：`sessionProjections` 的 host-only 单元可注册、事件即时折叠、
  **不进模型历史**、`checkpoint()` 携带、`restore()` 重折、`hydrate()` 可装载。
- **真实挂载校验**：把 preset 装进本机 preset root 后用 `agentPresets` 实测 ——
  roster 发现 `vibe-math-v5(user)`、`broken=no`，**`standingKeyFor('vibe-math-v5')`
  返回 MOUNTED OK**（该调用会拒绝"包无法解析""配置非法""某行从未激活""服务被发布到进程全局
  realm"四类失败），且 v5 插件行 `enabled=true`。

### 第二轮审计修复的真实缺陷（9 处）

第二轮针对**第一套测试从未触及的路径**做审计，发现并修复：

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| 1 | **回落后端从不加载已持久化的状态**（`state()` 不触发 `load()`） | 无 `sessionProjections` 的宿主上，**进程重启即丢失整座研究所**，`resume` 报 "no active member to resume" | 新增 `ready()`，在所有读状态的入口（工具、命令、`subagent/end`）先 `await` 加载 |
| 2 | 回落后端把状态写到 `VibeMath/State/` 而非研究所目录下的 `State/` | 与文档/人读镜像描述不一致，多研究所会互相覆盖 | 改为按 `instRoot()/State/<institute>.v5state.json` 动态解析路径 |
| 3 | **`checkSolved()` 只在会议收尾时被调用** | 一致票落在会议收尾之后（迟到回复 / 普通轮携带 `vote_solved`）会被记录却**永不被读取**——全所一致同意却停不下来 | 每次记录解决票后立即评估停止条件 |
| 4 | **提议只"踢一下调度器"** | 若已有调度 pass 在途且已过 arm 点，提议会滞留在队列里直到下一轮 trampoline | 提议后**直接 `armNextVerify()`** 确定性启动 |
| 5 | `beginVerify` 不互斥 | 两个调用者可在任一发布裁决记录前都通过检查，**同一对象被启动两次** | 新增 `beginLock` 独占 |
| 6 | `continueMeetingRound` 在 `finalizeLock` 被占用时直接返回 | 没有任何东西重新驱动它，会议可能停住 | 退出前 `armHeartbeat()` |
| 7 | **`vibe_v5_set` 改了 `activityTimeoutMs` 但已武装的心跳仍用旧延迟** | 调参不立即生效（调小后要等旧的长延迟走完） | `setParams` 后立即驱动一次调度 |
| 8 | **软压缩指令只在 `normal` 轮注入** | 只收到心跳 CHECKPOINT 的成员即使上下文 100% 也**永不压缩** | 改为 `normal` 与 `checkpoint` 都注入（`meeting`/`verify` 仍排除） |
| 9 | 唤醒成功路径不再武装心跳 | 若宿主丢弃投递或子代理消失，**调度器会永久冻结**（v4 §25 同类故障） | 每次唤醒后都武装一次安全心跳（各分支先查 `busy`，不会重复唤醒） |

另新增 `status().debug`（调度 pass 计数、trampoline 跳过次数、arm/begin 计数），
便于今后在真实 run 上定位这类"提议未启动"的问题。

## 七、兼容性

- `dsh.testedVersion: 0.1.5-rc.2`（v5 的宿主契约均取自该版本的运行时实测）。
- v5 需要 `subagents` / `agents` / `tools` / `commands` / `fs`（必需）与
  `sessions` / `sessionProjections` / `subprocess` / `sandboxPolicy` / `compaction`（可选）；
  安装器自检会在启动时报告缺失项。可选服务缺失只会**降级**，不影响挂载。
