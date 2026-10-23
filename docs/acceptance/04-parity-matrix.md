# vmu 目标 4 · 一致性覆盖矩阵（v11 · Round 12 实测版）

> **v11 与 v10 的差别（Round 12 · task-94）**：① **`docs/04` 的 declared-but-not-wired 排期普查**（§9.18：**机械分层** ⇒ **25 键/13 面＝接线候选**、**89 键/29 面＝具名"永不接"（内核无该面）**；长尾**按规则闭合**而不逐个发现）；② **双登记口径的结论与代价**（§9.18 §C：**先做流程一步**，门禁扩口径待三方对齐，判据四条）；③ R11 全部闭合项并入（多智能体 27/27／投票镜像**静默失败**／F51／三步探针进仓 18/0／普查门禁 10/0／形状门禁 7/0／hook 签名 `fn(flat)`／`docs/03 §6.1-6.2`／falsify **13 族 52 缺陷**／**`docs/11 §4.2` 第八条**）。

> **v10 与 v9 的差别（Round 11 · task-83）**：① **"声明了没生效"从"逐个发现"升级为"一次普查＋常驻门禁"**（§9.14：真装配三表 `attached`／`viaAlias`／`notAttached(code+reason)`＋自探针＋执行点）；② R10 的**全部闭合项**入册（能力门控服务缝／静止⇒开会三步探针／异议广播／`ballots` 静默不挂／`budget` 空对象种子／`meetingleave.js` 未登记／八键＋真读者／`control/idle` 真生产者／依赖环门禁双向修／`pack.js` 模块形状路由）；③ 新红一条：`vmu-resume-e2e A:seedRows`（RULE E 纯新增，已路由 reader-a）。

> **v9 与 v8 的差别（Round 10 · task-75）**：① **R9 的 7 个真缺陷入册**（§9.8.1）；② **退出冲刷＋G7 共享队列**（§9.8.2）；③ **`resume.js` 拆分**（1179 ＋ `resumeflush.js` 150，§9.8.3）；④ **R10 修的门禁形状**：依赖环门禁"**注释当 import**"⇒ 语句位置＋去注释＋**双向自探针**（§9.8.4；并补回旧判据漏掉的**多行 import** 真边 245→**246**）；⑤ `docs/11 §4.2` 已到**七条硬要求**。

> **v8 与 v7 的差别（Round 9 · task-67）**：① **`commitStore` e2e 落盘**（14 条原样搬进 `tests/vmu-commit-store-e2e.test.mjs` ＋ 3 条负向 ＋ 2 条契约反例 ⇒ **19/0**，§9.7.11）；② **F52 语义＝已有族覆盖，未重复造**（§9.7.12）；③ **值域门禁常态化**（`scripts/audit-pack-value-domain.mjs` 5/0、`--selftest` 3/0；上岗首日抓到**第二个真实例**并修，§9.7.13）；④ **RULE A 执行点补齐**（新脚本的 `--selftest` 已由 criterion 真跑）；⑤ R8 两次端到端演练／目标 6 投递／finalizer 修复沿用 §9.7.3／§9.7.9／§9.7.10。

> **v7 与 v6 的差别（Round 8 · task-59）**：① **F44 正路闭合**（R7 只证到 3/6；R8 补上**正路**——公告真的进入投递文本，§9.7.1）；② **`vibe_vmu_set` 归属闭合**（§9.7.2）；③ **一处真缺陷入册**（`vmu.paper.finalizer` 域外值**静默回落**，owner＝core；**R8 内已修**，§9.7.3）；④ pack 保真 **B1–B5** 具名（§9.7.4）；⑤ activity 新族与 RULE E 复核（§9.7.5）。

> **v6 与 v5 的差别（Round 7 · task-50）**：① **A 项 4 组键名转述更正**（§9.4；**转述错误不是缺口**，判定影响为零）；② **四份终判并入**（§9.5：目标 1／2／4／5 各一条终判行）；③ **F53 从"只有文档规则"变成自动门禁**（`tests/audit-fs-purpose.test.mjs`：窄规则＋两处自探针＋**集合相等**的牙；并用"种一个违规文件 ⇒ 红、删掉 ⇒ 绿"证明有牙）；④ assistant 的**第 6 次会话**读数到达后，§9.1 的"阈值开火／参数面／两通道"三条改为**实测具备**（计数口径差异**如实并列**）。

> **v5 与 v4 的差别（Round 6 · task-42）**：v4 收口了 8 条 F 项（6 条改判具备）。v5 并入三件事：① **多面点亮的终态**（U14 机制＋入口修复已落地；`tests/audit-declaration-publishes-face.test.mjs` **28/0** ＋其变异族 **GREEN** 证明"声明⇒面真的发布"可被证伪；真机读数见 §9.1）；② **F31 再升一档**（R6 跨进程耐久原子，§9）；③ **C-45 的"唯一强制点"由变异族证明"移除即被抓住"**（§9.2）＋目标 2 终判摘要。空缺仍具名可追溯。

> **v3 与 v2 的差别（Round 4 · task-31）**：v2 时仅 C-52 闭合、**C-30／C-45 仍空缺**。本轮二者**都已落地并被实测**：**C-30**＝`kernel/paper.js` 的 office 定稿咨询门（实测拒绝带 `VMU_OFFICE_CONSULT_REQUIRED` ＋ `enforced[5]`，并已进 `audit-enforced-consistency` 的拒绝场景表）；**C-45**＝`kernel/fidelity.js` ＋ `kernel/ballot.js` 的唯一强制点（决定性票被改写成弃权，我在该门里**直接断言**了改写与"弃权不定论"）。⇒ **C 家族空缺归零**；剩余空缺＝A 家族 1 条子项 ＋ B 家族 1 条"非机制"。同时把 F9／F10／F17／F18／F28 的实测改判并入 §8（它们增强的是 A 家族"子代理生命周期／定时并发／共识兜底"这几行）。

> **v2 与 v1 的差别（Round 3 · task-23）**：v1 是**实现前**快照。v2 只做三件事，每条都有 `file:line` 或探针：① **C-52（人类报告的自动汇报面）改判为【等价承载 · 已闭合】**（实测 `kernel/report.js` 的零机制默认门控）；② **C-30／C-45 复核后仍维持【空缺】**（本轮重新 grep，代码里仍无承载者）；③ 空缺清单**具名可追溯**。v2 **不**重写 A/B/C 三张主表（把逐行 `映射` 改成 `核` 属下一轮）；本轮的实测长尾证据在 `05-framework-strength-evidence.md`。
>
> 任务：`task-16`（Round 2）／`task-23`（Round 3 · v2 改判）· 主交付 A
> 唯一输入：`_handoff/vmu/03-v5r-full-inventory.md`（合并本）—— **但该合并本自"分片 A"起是 UTF-8 二次编码损坏的**，见 §0.2；本矩阵以**三份未损坏的分片原文**（`v5r-inventory-{a,b,c}.md`，合并本自称"分片原文同样保留"）为**同一来源**。
> v1 口径（Lead 明示）：**不依赖实现完成** —— 第 2/3 列对"本轮在建"的原语标 `R2:<owner>`，判定列区分【等价承载】【具名拒绝】【空缺】；凡**未在代码里核过**的一律标 `映射`（v2 逐条改 `核` 并附 file:line）。
> 日期：2026-10-14

---

## §0 读法

### §0.1 三列与判定

| 列 | 含义 | v1 的证据级别 |
|---|---|---|
| **v5r 机制** | 分片里的机制条目（id ＋ 一句话），id 沿用原文（A: `M-A01..47`；C: `C-01..57`；B 原文无 id，本矩阵派生 `M-B01..20` ＝ 其 `§1.1..1.20`，映射见 §0.3） | 原文 |
| **vmu 内核原语** | 承载该机制的 vmu 落点：`vmu.*` 服务（现 **70** 个注册服务）与/或 `kernel/*.js` 模块（现 **82** 个顶层模块 ＋ `kernel/prompt|turn`） | `核`＝本轮已核；`映射`＝按服务/模块名与职责判定；`R2:<owner>`＝Round 2 在建 |
| **v5r pack 声明** | 该机制的**策略**由哪一层声明（v5r pack 的 settings/middleware/prompts，或"内核级、无需声明"） | 同上；pack 现状：`packs/v5r/{index.js,notices.js,settings/{defaults.js,defaults.json},middleware/prompt-switches.js,prompts/*}` |

**判定**（三选一，必须具名）：
- **等价承载**：内核原语能表达同一机制（能力进内核；策略由 pack/settings 声明）。
- **具名拒绝**：框架**有意不提供**该机制，且**以具名错误码 + 理由**拒绝 —— 必须写**理由**与**改判条件**。
- **空缺**：目前没有任何原语承载，且**未**具名拒绝 ⇒ 可追溯到机制 id，并写明"由哪一层补"。

### §0.2 ⚠️ 输入完整性（本矩阵的第一个发现）

**`03-v5r-full-inventory.md` 自第 37 行（"分片 A"标题）起是损坏文本**：UTF-8 字节被按 GBK 解码后又存成 UTF-8（`read` 与 ripgrep 均显示 `v5r 娣卞害鐩樼偣 路 鍒嗙墖 A…`），因此**该合并本的正文不可引用**。第 1–35 行（结论速览／分片索引／已知更正）是完好的。
**三份分片原文完好**（我用 UTF-8 读数检查：`v5r-inventory-a/b/c.md` 的 mojibake 标记命中数均为 **0**；A 标题正常显示 `# v5r 深度盘点 · 分片 A`）。⇒ 本矩阵**改用分片原文**（与合并本同一内容来源），并**建议 Lead 用一个显式 UTF-8 的合并器重生成合并本**（现有合并器对分片 A 之后的内容做了错误的编码往返）。这是"唯一输入"的一个真缺陷，记此以免下一位读者把它读成"v5r 原文就是乱码"。

### §0.3 id 体系与映射

| 分片 | 原文 id | 数量 | 本矩阵 id |
|---|---|---|---|
| A（`vibe-math-v5r.js` 1–3730） | `M-A01..M-A47` ＋ 跨边界 `X-1..X-9` | 47 ＋ 9 | 原样 |
| B（3730–7359） | 无 id，按 `§1.1..§1.20` 分节 | 20 | 派生 `M-B01..M-B20` ＝ `§1.1..§1.20` |
| C（7359–11597） | `C-01..C-57` | 57 | 原样（＝任务的 `M-C*` 家族） |

### §0.4 判定统计（v1）

| 判定 | A | B | C | 合计 |
|---|---|---|---|---|
| 等价承载 | 44 | 19 | 51 | **114** |
| 具名拒绝 | 2（M-A13、M-A07） | 0 | 3（C-09、C-53、C-57） | **5** |
| 空缺 | 1（M-A04 的"论文轮次上限可调"子项） | 1（M-B20"边界说明"非机制） | 3（C-30 的 office 定稿咨询门、C-45 忠实性弃权、C-52 人类报告的汇报面） | **5** |
| 说明/非机制 | 0 | 1（M-B20） | 0 | **1** |

> 上表的"具名拒绝/空缺"是 v1 的**保守判定**：凡我未能在代码里核到承载者的，宁可写"空缺"而不写"等价"。v2 的目标是把 `映射` 全部变成 `核`（附 file:line），并据此收敛/改判。

---

## §1 分片 A · 状态 fold／持久化／名册／章程／信箱／控制面（47 条 ＋ 9 跨边界点）

| id | v5r 机制 | vmu 内核原语 | v5r pack 声明 | 判定 | v1 状态/依据 |
|---|---|---|---|---|---|
| M-A01 | TeX/Lean 已知安装位置解析（有界探测 + `tried[]`） | `kernel/lean.js`、`kernel/math.js`；引擎三面门 `tests/audit-engine-faces.mjs`；沙箱缝 `V*_TEX_ROOTS_SANDBOX` | 内核级（无需声明） | 等价承载 | 映射（Round 0 实测：`audit-engine-faces` 三面 13/0/0） |
| M-A02 | 反馈库常量与三条路由（self/team/interpersonal） | `kernel/memory.js`、`vmu.memory`；`vmu.records` | pack：`v5r/settings/defaults.js` 声明策略键 | 等价承载 | 映射 |
| M-A03 | 注入声明 `inject` ＋ 投影版本 ＋ 12 种事件类型 | `kernel/stateversion.js`、`kernel/store.js`（schema 版本 ＋ 拒绝不迁移）、`kernel/migration.js` | 内核级 | 等价承载 | 映射 |
| M-A04 | 最终论文常量（`PAPER_MAX_ROUNDS=3`、引擎顺序、九节骨架） | `kernel/paper.js`、`vmu.paper`、`kernel/publication.js` | `packs/v5r/settings/defaults.js` 可覆盖轮次/引擎 | 等价承载（**子项空缺**：轮次上限的可调性需 v2 核 `vmu.paper.*` 是否有该键） | 映射 |
| M-A05 | Lean 队列常量 ＋ 纯助手（自实现 SHA-256、`-R` 单一出口） | `kernel/lean.js`、`kernel/formal.js`、`kernel/crypto.js` | 内核级 | 等价承载 | 映射 |
| M-A06 | S21 内容指纹 ＋ 指针传播注入契约（含"头部列表只给 7 字段"） | `kernel/library.js`、`kernel/library-policy.js`、`vmu.library` | pack：`v5r/settings/defaults.js`（`params.pointerPropagation` 类开关） | 等价承载 | 映射 |
| M-A07 | 宿主"在活子代理"上限侦测与**命名**（错误码即特性探测） | `host-spawn.js`、`host.js`、`kernel/capacity.js`、`kernel/resource.js` | 内核级（宿主接触面） | 具名拒绝（**宿主上限本身不是 vmu 能力**：vmu 只做"可预判的具名拒绝 + 自设上限"；理由＝宿主行为不可由框架改写。**改判条件**：若 DSH 提供正式的能力查询服务，则改为"等价承载"并读它） | 映射 |
| M-A08 | 插件装载/卸载的宿主接触面（`ctx.effect` ＋ 惰性 `ctx.get`） | `vibe-math-vmu.js`（入口 `apply`）、`kernel/loader.js`、`host.js` | 内核级 | 等价承载 | 核（Round 1 真机：`dsh plugin add` ⇒ 注册面可见） |
| M-A09 | 通用工具函数（id／信号／写范围） | `kernel/registry.js`、`kernel/delegation.js`、`kernel/guard.js` | 内核级 | 等价承载 | 映射 |
| M-A10 | `emptyInstitute` 骨架与**耐久字段全集** | `kernel/store.js`、`vmu.store`、`kernel/storepolicy.js` | 内核级 | 等价承载 | 映射 |
| M-A11 | `withInstitute` 的**引用同一性**与未知键保留 | `kernel/store.js`（不可变补丁）、`kernel/transaction.js` | 内核级 | 等价承载 | 映射 |
| M-A12 | fold 内**原子 id 分配**（对象与计数器同一步提交） | `kernel/store.js`、`kernel/idempotency.js` | 内核级 | 等价承载 | 映射 |
| M-A13 | **所办收件箱伪 id** `OFFICE_INBOX` ＋ 请求上限（截断计数） | `kernel/human.js`、`vmu.human`（人机接口）；`kernel/mailbox.js`（R2:v5r-reader-c） | pack 无 | **具名拒绝**（vmu 不允许"伪 id 成员"：收件人必须是真实注册成员，否则 `VMU_MEMBER_NOT_FOUND`；office 的语义由 `vmu.human` 承担。**理由**＝伪 id 会让名册/法定人数口径分裂。**改判条件**：若 settings 显式声明"office 通道"为一个一等收件人类别，则改判等价） | 映射 |
| M-A14 | 事件信封准入 ＋ "永不抛出"（畸形事件只记诊断） | `kernel/store.js`、`kernel/guard.js` | 内核级 | 等价承载 | 映射 |
| M-A15 | 机构级补丁**白名单**（`EV.institute`）＋函数式变更 | `kernel/store.js`、`kernel/guard.js` | 内核级 | 等价承载 | 映射 |
| M-A16 | 成员/任务事件 upsert 语义 | `vmu.members`、`vmu.tasks`、`kernel/tasks.js` | 内核级 | 等价承载 | 映射 |
| M-A17 | 消息事件：追加／去重／所办截断 | `kernel/mailbox.js`（R2:v5r-reader-c）、`kernel/notify.js`、`vmu.records` | pack：`v5r/settings/defaults.js`（digest 窗口等） | 等价承载 | R2:v5r-reader-c |
| M-A18 | 投递确认账本 `delivered`（LRU 窗口 ＋ 队列压实） | `kernel/mailbox.js`（R2）、`kernel/idempotency.js` | pack：窗口/上限可声明 | 等价承载 | R2:v5r-reader-c |
| M-A19 | 会议事件：插入路径 vs 纪要写回路径（S8）＋ 200 条上限 | `kernel/meetings.js`、`kernel/minutes.js`、`vmu.meetings` | pack：`v5r/settings/defaults.js` | 等价承载 | 映射 |
| M-A20 | 辩论/判定/形式化/队列/解决票/进展 事件 | `kernel/formal.js`、`kernel/ballot.js`、`kernel/workflow.js`、`kernel/tasks.js` | 内核级 | 等价承载 | 映射 |
| M-A21 | 唯一后端：加固 JSON 文件（`loadOk` 闩 ＋ 串行写） | `kernel/store.js`、`kernel/storepolicy.js`、`kernel/transaction.js` | pack：`v5r/settings/defaults.js`（`storageDomain` 可选） | 等价承载 | 映射（Round 0 有 `vmu-store` 四场景套件） |
| M-A22 | 会话注册表与"根代理"解析 | `vibe-math-vmu.js`、`kernel/identity.js`、`vmu.identity` | 内核级 | 等价承载 | 映射 |
| M-A23 | 会话参数默认表（`DEFAULT_PARAMS` 全量） | `settings/schema.js`（单一源）、`settings/planned.js` | pack：`packs/v5r/settings/defaults.{js,json}` | 等价承载 | 核（Round 1 已核 `--counts`/schema 生成链） |
| M-A24 | 会话内存态（ephemeral）全集与"恢复时重建"清单 | `kernel/resume.js`（R2:v5r-reader-a）、`kernel/turn/index.js` | 内核级 | 等价承载 | R2:v5r-reader-a |
| M-A25 | 路径组合、沙箱根核对与两条"类守卫" | `kernel/guard.js`、`kernel/storepolicy.js`、`host-math.js` | 内核级 | 等价承载 | 映射 |
| M-A26 | `fs` 接触面与**写结果语义**（`FsWriteOutcome`） | `kernel/store.js`、`kernel/audit.js`、`vmu.audit` | 内核级 | 等价承载 | 映射 |
| M-A27 | `ready()/state()/inst()` 与 `prematureReads` 诊断 | `vmu.store`、`kernel/metrics.js` | 内核级 | 等价承载 | 映射 |
| M-A28 | 载入/写失败诊断缓冲 ＋ `commit()` 的恢复语义 | `kernel/store.js`、`kernel/alerts.js`、`kernel/audit.js` | pack：阈值可声明 | 等价承载 | 映射 |
| M-A29 | S5 静止提示（**只推荐、不驱动**，幂等键 `sinceAt`） | `kernel/scheduler.js`、`kernel/control.js`、`vmu.scheduler` | pack：`v5r/settings/defaults.js`（`stallAutoMeetingMs` 语义保留） | 等价承载 | 映射 |
| M-A30 | S6 临时授权与撤回（事件型失效、无定时器） | **框架不提供**（`kernel/grant.js` 已于 goal round 3 删除：零活构造者、4 个 `vmu.grant.*` 键一并删除、`KNOWN_UNMOUNTED` 条目撤销；`kernel/delegation.js` 仍在，但那是**实例级委托**，不是「命令级 + 事件作用域」的临时授权） | pack 无 | **框架不提供（规则集不要求）**——理由：v5r 规则集不要求 grants，本模块无任何活路径构造，留着只会让读者以为「临时授权」存在。**改判条件**：出现一个真实的、需要「枚举命令 + 事件作用域 + 到期」授权的消费者时，模块**带着该消费者一起**回来（而不是先留壳） | 映射 |
| M-A31 | S7 投票板（开板/投票/截止；两个门槛各算各的） | `kernel/ballot.js`、`kernel/ballotbox.js`、`vmu.ballotbox` | pack：`v5r/settings/defaults.js`（`vmu.ballot.minVotes` **无默认值**等） | 等价承载 | 映射 |
| M-A32 | S13 决议台账与检索（append-only ＋ `latestResolution()`） | `kernel/records.js`、`vmu.records` | pack：检索上限/维度 | 等价承载 | 映射 |
| M-A33 | S9 少数意见入档 ＋ 复议（门槛只升不降） | `kernel/ballot.js`、`kernel/records.js` | pack：`v5r/settings/defaults.js`（`reconsiderFloor`） | 等价承载 | 映射 |
| M-A34 | S8 票与发言时序分离（存在 open 板 ⇒ 冻结发言） | `kernel/meeting.js`、`kernel/meetings.js`、`kernel/control.js` | 内核级谓词（门不是阶段） | 等价承载 | 映射 |
| M-A35 | S10 引用边界与私聊补记（`quote/supplement`） | `kernel/mailbox.js`（R2）、`kernel/records.js` | 内核级 | 等价承载 | R2:v5r-reader-c |
| M-A36 | S12 会议分级（formal/light）与"简流程不得产出实体定论" | `kernel/meeting.js`、`kernel/minutes.js` | pack：等级策略可声明 | 等价承载 | 映射 |
| M-A37 | S11 记录人（`vibe_v5_secretary`）与纪要条目（`vibe_v5_minutes`） | `kernel/minutes.js`、`vmu.minutes` | pack：`vmu.minutes.verbatimCapBytes` 类上限 | 等价承载 | 映射 |
| M-A38 | S18 动议与附议（`motion`/`second`，达到门槛即 carried） | `kernel/governance.js`、`kernel/meetings.js` | pack：`vmu.motions.secondThreshold` 策略键 | 等价承载 | 映射 |
| M-A39 | 名册助手与**法定人数快照**（`rosterVersion` 防漂移） | `vmu.members`、`kernel/members.js`、`kernel/control.js` | 内核级 | 等价承载 | 映射 |
| M-A40 | 研究所章程（**入职即冻结**的 persona 文本） | `kernel/charter.js`、`vmu.charter`、`kernel/prompt/index.js` | pack：`packs/v5r/prompts/v5r-charter.js` | 等价承载 | 映射 |
| M-A41 | 每轮状态块 `briefBlock`（身份必填、消息块可抑制） | `kernel/prompt/index.js`、`vmu.prompt` | pack：`packs/v5r/prompts/v5r-blocks-{a,b}.js` | 等价承载 | 映射 |
| M-A42 | 活动等待器（**一次性、只对未来生效**） | `kernel/scheduler.js`、`kernel/turn/index.js`、`vmu.tasks`（CAS 等待） | 内核级 | 等价承载 | 映射 |
| M-A43 | 项目目录树创建（`fs` 优先、shell 兜底并回报 `via`） | `kernel/work.js`、`host-spawn.js`、`vmu.work` | 内核级 | 等价承载 | 映射 |
| M-A44 | 通信：耐久**每收件人**信箱（`say/notice/pendingFor/frameLine`） | `kernel/mailbox.js`（R2:v5r-reader-c）、`kernel/notify.js` | pack：帧前缀/节流策略 | 等价承载 | R2:v5r-reader-c |
| M-A45 | 投递分级、批量确认与收件箱块（`deliveryDecision/ackPending/composeInbox`） | `kernel/mailbox.js`（R2）、`kernel/prompt/index.js` | pack：`vmu.mailbox.digestMax/digestWindowMs` 类键 | 等价承载 | R2:v5r-reader-c |
| M-A46 | 名册生命周期：`newMember`／persona／工具过滤／agent 选项 | `kernel/members.js`、`kernel/skills.js`、`host.js`（工具面过滤）、`vmu.members` | pack：成员工具过滤策略 | 等价承载 | 映射 |
| M-A47 | 宿主在活上限的**会话侧**处理（预检、一次性告警、活子计数） | `kernel/capacity.js`、`kernel/resource.js`、`kernel/alerts.js` | pack：`maxLiveChildren` 等自设上限 | 等价承载 | 映射 |
| X-1..X-9 | 9 条**跨边界消费点**（A 分片 §二：被 B/C 区间消费的机制） | 由被消费机制各自的行承载（A 侧定义、B/C 侧消费）；落点＝`kernel/prompt/index.js`、`kernel/turn/index.js`、`kernel/library.js`、`kernel/lean.js`、`host-spawn.js` | 同各自行 | 等价承载 | 映射（v2 逐条列 file:line） |

---

## §2 分片 B · 提示词／形式化／数学面／任务板／共识验证／成果库（20 条，id 派生自 `§1.1..1.20`）

| id | v5r 机制 | vmu 内核原语 | v5r pack 声明 | 判定 | v1 状态/依据 |
|---|---|---|---|---|---|
| M-B01 | `[SPAWN]` 成员诞生五步 `spawnMember` | `kernel/turn/index.js`、`kernel/members.js`、`host-spawn.js`、`vmu.members` | pack：`v5r/prompts/{v5r-persona,v5r-core}.js` ＋ `settings/defaults.js` | 等价承载 | 映射 |
| M-B02 | `[SPAWN]` 投递一轮 `wakeMember` | `kernel/scheduler.js`、`host-spawn.js`、`kernel/turn/index.js` | pack：唤醒/节流策略键 | 等价承载 | 映射 |
| M-B03 | `[OTHER]` 调用者身份推导（三函数） | `kernel/identity.js`、`kernel/control.js`、`vmu.identity` | 内核级 | 等价承载 | 映射 |
| M-B04 | `[PROMPT]` 回执字段目录 `replySpec(kind)` | `kernel/prompt/index.js`、`vmu.prompt` | pack：`packs/v5r/prompts/v5r-core.js` | 等价承载 | 映射 |
| M-B05 | `[PROMPT]` 五个提示词构造器 | `kernel/prompt/index.js`（段注册/装配） | pack：`packs/v5r/prompts/v5r-prompts.js`（**策略在 pack**，符合分层铁律） | 等价承载 | 映射 |
| M-B06 | `[PROMPT]` 每轮状态块 `briefBlock` | `kernel/prompt/index.js` ＋ D-13 活读 | pack：`v5r-blocks-{a,b}.js` | 等价承载 | 核（D-13 本轮落：活读 6 键；`vmu-round2-seams` 待加） |
| M-B07 | `[SCHED]` 心跳/看门狗时序 | `kernel/scheduler.js`、`kernel/clockguard.js`、`vmu.scheduler` | pack：时序参数可声明 | 等价承载 | 映射 |
| M-B08 | `[TASK]` 任务板 CAS DAG（分派/依赖/CAS/阶段机） | `kernel/tasks.js`、`kernel/board.js`、`vmu.tasks` | pack：阶段/上限策略 | 等价承载 | 映射 |
| M-B09 | `[FEEDBACK]` 经验反馈库 | `kernel/memory.js`、`vmu.memory` | pack：分类/路由策略 | 等价承载 | 映射 |
| M-B10 | `[COMPACT]` 上下文核算 `coreRules`/`postmark` | `kernel/prompt/index.js`、`kernel/metrics.js` | pack：上限策略 | 等价承载 | 映射 |
| M-B11 | `[LIBRARY]` 成员成果库（四轨 Progress ＋ 三类卡片 ＋ 头部列表契约） | `kernel/library.js`、`kernel/library-policy.js`、`vmu.library` | pack：`pointerPropagation` 等开关 | 等价承载 | 映射 |
| M-B12 | `[FORMAL]` Lean 形式化验证（模式/路径/状态机） | `kernel/lean.js`、`kernel/formal.js`、`vmu.formal` | pack：`vmu.math.*` 策略键（`vmu.lean.*` 不存在） | 等价承载 | 映射 |
| M-B13 | `[FORMAL]` 路径守卫与单文件执行 | `kernel/lean.js`、`kernel/guard.js` | 内核级 | 等价承载 | 映射 |
| M-B14 | `[FORMAL]` 异步编译队列 ＋ **作业持久化/断点续算** | `kernel/formal.js`、`kernel/mathjobs.js`（R2 扩展: v5r-reader-b）、`vmu.mathjobs` | pack：并发/重试策略 | 等价承载 | R2:v5r-reader-b |
| M-B15 | `[FORMAL]` 三个索引 ＋ 形式化提示词块 | `kernel/library.js`、`kernel/prompt/index.js` | pack：提示词块文本 | 等价承载 | 映射 |
| M-B16 | `[MATH]` `math_computation` 接缝（宿主侧 5027 一带） | `host-math.js`、`kernel/math.js`、内核服务 `math_computation` | pack：`v5r/settings/defaults.js`（六参数默认） | 等价承载 | 核（Round 1 已核 6 副本字节一致 + 语义门） |
| M-B17 | `[MATH]` 论文（LaTeX）提示块 | `kernel/paper.js`、`kernel/prompt/index.js` | pack：提示词块 | 等价承载 | 映射 |
| M-B18 | `[OTHER]` 成员自查＋自述（G6） | `kernel/members.js`（self-report）、`kernel/panel.js`（R2:v5r-reader-c）、`vmu.members` | pack：面板字段策略 | 等价承载 | R2:v5r-reader-c |
| M-B19 | `[OTHER]` S4 主持代行／程序异议／结束辩论（含 `formal_proof` 登记） | `kernel/governance.js`、`kernel/meeting.js`、`kernel/minutes.js` | pack：代行策略 | 等价承载 | 映射 |
| M-B20 | `[OTHER]` 边界说明（相邻机制归属） | —（不是机制，是分片的**归属说明**） | — | 说明 | 非机制（不参与覆盖判定；保留以免误读为"少了一条"） |

---

## §3 分片 C · 群聊／会议／论文／雇佣／调度／回复／工具过滤／控制面（57 条）

| id | v5r 机制 | vmu 内核原语 | v5r pack 声明 | 判定 | v1 状态/依据 |
|---|---|---|---|---|---|
| C-01 | 群聊落盘镜像 `saveChatLine`（串行化写） | `kernel/chat.js`（R2:v5r-reader-c）、`kernel/records.js` | pack：镜像开关 | 等价承载 | R2:v5r-reader-c |
| C-02 | 消息投递 `say(from,opts)`（fold 内一次分配 id、多收件人一次提交） | `kernel/mailbox.js`（R2）、`kernel/chat.js`（R2）、`vmu.records` | pack：帧前缀/目标解析策略 | 等价承载 | R2:v5r-reader-c |
| C-03 | 框架通知 `notice(memberId,text)` | `kernel/notify.js`、`kernel/mailbox.js`（R2） | pack：通知策略 | 等价承载 | 映射 |
| C-04 | 待投递队列 `pendingFor` / 帧 `frameLine` | `kernel/mailbox.js`（R2） | pack：按 kind 的前缀 | 等价承载 | R2:v5r-reader-c |
| C-05 | 摘要节流 `deliveryDecision` ＋ `armDigest` | `kernel/mailbox.js`（R2）、`kernel/scheduler.js` | pack：`vmu.mailbox.digestMax`(12)/`vmu.mailbox.digestWindowMs`(45 s) | 等价承载 | R2:v5r-reader-c |
| C-06 | 收件箱感知唤醒 `promptFor`/`wakeWithInbox` | `kernel/prompt/index.js`、`kernel/mailbox.js`（R2）、`kernel/turn/index.js` | pack：注入策略 | 等价承载 | R2:v5r-reader-c |
| C-07 | 私聊补记 `supplement_of`（G5/D6） | `kernel/mailbox.js`（R2） | 内核级 | 等价承载 | R2:v5r-reader-c |
| C-08 | 引用边界与锚解析 `resolveQuoteAnchor`/`sayQuote`（S10/D6） | `kernel/mailbox.js`（R2）、`kernel/records.js` | pack：引用深度策略 | 等价承载 | R2:v5r-reader-c |
| C-09 | 所办信箱 `OFFICE_INBOX`（伪 id） | `kernel/human.js`、`vmu.human` | pack 无 | **具名拒绝**（同 M-A13：收件人必须是真实成员，否则 `VMU_MEMBER_NOT_FOUND`；理由＝伪 id 会分裂名册/法定人数口径。**改判条件**：settings 显式声明"office 通道"为一等收件人类别） | 映射 |
| C-10 | 召开入口 `vibe_v5_meeting` → `startMeeting` | `kernel/meetings.js`、`tools/meeting.js`、`vmu.meetings` | pack：默认议程/等级 | 等价承载 | 映射 |
| C-11 | 会议实体与开场 `beginMeeting` | `kernel/meetings.js` | pack：开场提示文本 | 等价承载 | 映射 |
| C-12 | 轮次征询 `askMeetingRound` | `kernel/meetings.js`、`kernel/turn/index.js` | pack：轮次节奏 | 等价承载 | 映射 |
| C-13 | 收束推进 `continueMeetingRound` | `kernel/meetings.js` | pack：收束条件 | 等价承载 | 映射 |
| C-14 | 举手/发言/沉默/邀请（reply 侧） | `kernel/turn/index.js`、`kernel/meetings.js` | pack：reply 词表 | 等价承载 | 映射 |
| C-15 | 邀请临时工 `meetingInvite` | `kernel/members.js`、`kernel/meetings.js` | pack：邀请策略 | 等价承载 | 映射 |
| C-16 | 纪要收束 `finalizeMeeting` | `kernel/minutes.js`、`kernel/meetings.js` | pack：收束模板 | 等价承载 | 映射 |
| C-17 | 纪要尾三块 `meetingMinutesTail`/`meetingVoteBlock` | `kernel/minutes.js`、`kernel/ballot.js` | pack：块顺序/文本 | 等价承载 | 映射 |
| C-18 | 会议等级 `meetingLevelOf`/`setMeetingLevel`/`truthWriteRefusal` | `kernel/meeting.js`、`kernel/guard.js` | pack：等级默认 | 等价承载 | 映射 |
| C-19 | 记录人/秘书 `secretaryTool`（S11/GAPS 29） | `kernel/minutes.js`、`vmu.minutes` | pack：记录人策略 | 等价承载 | 映射 |
| C-20 | 纪要条目/确认上次纪要 `minutesTool` | `kernel/minutes.js` | pack：条目上限 | 等价承载 | 映射 |
| C-21 | 程序异议 `proceduralObjectionTool`（#46/D2） | `kernel/governance.js`、`kernel/meetings.js` | pack：异议策略 | 等价承载 | 映射 |
| C-22 | 投票板六项 `pollOpen/pollVote/pollClose…`（S7/D3/D4/R9/K13） | `kernel/ballot.js`、`kernel/ballotbox.js`、`vmu.ballotbox` | pack：门槛默认（`vmu.ballot.minVotes` **无默认**） | 等价承载 | 映射 |
| C-23 | 表态期禁言 `speechFrozen`/`speechGate` | `kernel/meeting.js`、`kernel/control.js` | 内核级谓词 | 等价承载 | 映射 |
| C-24 | 会议分级与"实体定论"写入闸 | `kernel/meeting.js`、`kernel/minutes.js` | pack：分级策略 | 等价承载 | 映射 |
| C-25 | 会后/放弃纪要尾巴 `appendMeetingTail` | `kernel/minutes.js` | pack：模板 | 等价承载 | 映射 |
| C-26 | 结题唯一判据 `checkSolved()` | `kernel/workflow.js`、`kernel/control.js` | pack：结题策略 | 等价承载 | 映射 |
| C-27 | 结题票写入 `recordSolveVote` | `kernel/ballot.js`、`kernel/records.js` | pack：结题票门槛 | 等价承载 | 映射 |
| C-28 | 结题落盘 `finishRun(reason)` | `kernel/lifecycle.js`、`vmu.lifecycle` | pack：收口动作 | 等价承载 | 映射 |
| C-29 | 论文状态机（常量与字段） | `kernel/paper.js`、`vmu.paper` | pack：`v5r/settings/defaults.js` | 等价承载 | 映射 |
| C-30 | **office 定稿咨询门** `finalizePaperByOffice`/`notePaperConsult` | `kernel/human.js`（人机接口）＋ `kernel/paper.js` | pack 无 | **空缺**（vmu 有 office 的**人机接口**与论文状态机，但**没有**"office 定稿咨询门"这一语义；未具名拒绝）**由 `vmu-core`＋`vmu-pack` 补**：或加一个 `vmu.paper.officeConsult` 声明 + 具名拒 `VMU_OFFICE_CONSULT_REQUIRED`，或具名登记为扩展点。**判据**：声明后 ⇒ 未咨询即定稿必须具名红 | 映射 |
| C-31 | 交付物与编译 `latexEngines/runLatexAttempt/compilePaperTex/finalizePaper` | `kernel/paper.js`、`kernel/publication.js`、引擎缝（`audit-engine-faces`） | pack：引擎顺序 | 等价承载 | 映射 |
| C-32 | 雇佣 `hire` | `kernel/recruit.js`、`vmu.recruit` | pack：编制策略 | 等价承载 | 映射 |
| C-33 | 解雇 `fire` | `kernel/recruit.js`、`kernel/tenure.js` | pack：解雇策略 | 等价承载 | 映射 |
| C-34 | 编制变更 `addResearcher`/`removeResearcher` | `kernel/capacity.js`、`kernel/recruit.js` | pack：编制上限 | 等价承载 | 映射 |
| C-35 | 督办 `nudge` | `kernel/delegation.js`、`kernel/scheduler.js` | pack：督办策略 | 等价承载 | 映射 |
| C-36 | 调度 trampoline `scheduleNext`/`schedulePass` | `kernel/scheduler.js` | 内核级 | 等价承载 | 映射 |
| C-37 | 心跳/摘要计时器 `armHeartbeat`/`armDigest`/`clearHeartbeat` | `kernel/scheduler.js`、`kernel/clockguard.js` | pack：间隔可声明 | 等价承载 | 映射 |
| C-38 | 静止提示（S5/R1/D10） | `kernel/scheduler.js`、`kernel/control.js` | pack：`stall*` 阈值 | 等价承载 | 映射 |
| C-39 | G-6 延迟补建 `pendingSpawnMembers`/`retryPendingSpawns` | `kernel/resume.js`（R2:v5r-reader-a）、`kernel/scheduler.js` | pack：重试策略 | 等价承载 | R2:v5r-reader-a |
| C-40 | 参数同步 `syncParamsFromState` | `kernel/control.js`（D-13 活读接缝） | pack：无 | 等价承载 | 核（D-13 本轮落） |
| C-41 | 回复解析 `parseReply(text)` | `kernel/turn/index.js` | pack：reply 词表/解析策略 | 等价承载 | 映射 |
| C-42 | 概率归一 `normVerdictNumber` | `kernel/ballot.js`、`kernel/formal.js` | pack：精度策略 | 等价承载 | 映射 |
| C-43 | 一轮结束唯一驱动 `onMemberEnd` | `kernel/turn/index.js` | 内核级 | 等价承载 | 映射 |
| C-44 | 派发 `handleReply(member,parsed,kind)` | `kernel/turn/index.js`、`tools/*` | pack：派发表 | 等价承载 | 映射 |
| C-45 | **忠实性缺陷强制弃权**（L2 option A / Adv-verify F1） | 候选：`kernel/formal.js`、`kernel/ballot.js` | pack 无 | **空缺**（v1 未在代码里找到"因忠实性缺陷而强制弃权"的路径）**由 `v5r-reader-b`（数学/形式化面）或 `v5r-reader-c`（表决面）核并补**；**判据**：造一个不忠实回执 ⇒ 必须具名弃权并留痕，或具名登记为扩展点 | 映射 |
| C-46 | 工具过滤降级 `startWithToolFilter`/`sanitizeToolFilter` | `host.js`（工具面/过滤）、`kernel/skills.js` | pack：过滤策略 | 等价承载 | 映射 |
| C-47 | 成员工具过滤与 persona 冻结 `memberToolFilter`/`memberPersona` | `kernel/members.js`、`kernel/skills.js`、`kernel/prompt/index.js` | pack：per-member 策略 | 等价承载 | 映射 |
| C-48 | 参数白名单与归一 `normalizeParams` | `settings/schema.js`、`kernel/control.js` | pack：`settings/defaults.json` | 等价承载 | 核（settings 单一源已有门禁） |
| C-49 | 参数写入 `setParams`/`visibleParams` | `kernel/control.js`、`vmu.control` | pack：可见面策略 | 等价承载 | 映射 |
| C-50 | 配置 `configure`/`doStart`/`resume`/`setPause`/`initStop` | `vibe-math-vmu.js`、`kernel/control.js`、`kernel/resume.js`（R2） | pack：启动默认 | 等价承载 | R2:v5r-reader-a |
| C-51 | 状态视图 `status()` | `kernel/control.js`、`kernel/metrics.js`（稳定键承诺） | 内核级 | 等价承载 | 映射 |
| C-52 | 人类报告 `report()` | `kernel/metrics.js`（报告面）＋ `kernel/report.js`（R2:vmu-assistant：自动汇报） | pack：汇报模板/周期 | **空缺**（v1：`report()` 的**自动汇报**部分是目标 6，本轮在建；未接线前不得声称等价）**由 `vmu-assistant` 补**；**判据**：可声明的汇报触发 ⇒ 真机装配证据（D-09） | R2:vmu-assistant |
| C-53 | 工具注册面 `registerTool`/`withOffice`/`withCaller` | `kernel/registry.js`、`kernel/delegation.js`、`kernel/guard.js` | 内核级 | **具名拒绝**（vmu **不提供** `withOffice` 式的"所办特权包装"：权限一律走 `canDo`/delegation 且**拒绝具名**；理由＝特权包装会把"谁能做什么"藏进闭包，违反可审计。**改判条件**：若"office 特权"需要成为可声明能力，则改为 settings 声明 + 具名拒） | 映射 |
| C-54 | 全部工具与命令名（本分片区间） | `tools/**`、`host.js`（`TOOL_FACES`/45 面映射） | pack：面声明（D-01 的声明式意图） | 等价承载 | 核（Round 1：45 面映射 + 零机制红线） |
| C-55 | 每轮状态块/提示词装配（§⑤ 详述） | `kernel/prompt/index.js` | pack：`v5r/prompts/*` ＋ `v5r/persona` | 等价承载 | 核（D-13） |
| C-56 | 等待原语 `vibe_v5_wait`/`waitForActivity`/`notifyActivity` | `kernel/scheduler.js`、`kernel/tasks.js`（CAS 等待） | 内核级 | 等价承载 | 映射 |
| C-57 | 测试 seam `__testHelpers` 与宿主事件接线 | 产品面**不导出**测试后门；测试用**可注入接缝**（`settings`/`scripts`/`packLoader`/假宿主：`tests/vmu-round1-seams.test.mjs` 已 37 条） | 内核级 | **具名拒绝**（理由＝产品后门会让"测试专用路径"进入运行时；vmu 的可测性由**注入**而非**导出**提供。**改判条件**：若某能力无法经注入接缝观察到，则加**显式 seam** 而不是通配后门） | 核（`tests/vmu-round1-seams.test.mjs` 37/0；Round 1 实测） |

---

## §4 框架能力需求清单（A §六 31 条 ＋ C §⑥ 20 条）

### §4.1 A §六（31 条框架原语需求 → vmu 落点）

A §六 逐条给出"需求原语 → v5r 落点 → 缺了会怎样"。**31 条全部有 vmu 承载者**，按落点归并如下（同族合并；括注为 A §六 的条目号）：

| vmu 落点 | 覆盖 A §六 条目 | 判定 |
|---|---|---|
| `kernel/store.js` ＋ `storepolicy.js` ＋ `transaction.js` ＋ `stateversion.js` ＋ `migration.js` | 纯函数折叠器/模式版本(1)、原子 id(2)、快照串行写+"读过才可写"(3)、加载失败可见(4)、写失败可见(5)、每路径载入记忆(6)、ephemeral/durable 清单(24) | 等价承载 |
| `vibe-math-vmu.js` ＋ `kernel/loader.js` ＋ `host*.js` | 会话/根代理注册(7)、可续子代理抽象(8)、宿主服务惰性解析(28)、卸载清理(29) | 等价承载 |
| `kernel/mailbox.js`(R2) ＋ `kernel/notify.js` ＋ `kernel/turn/index.js` | 每收件人信箱+ack(9)、批量投递一次提交(10)、投递分级/唤醒预算(11) | 等价承载（R2:v5r-reader-c） |
| `kernel/scheduler.js` ＋ `kernel/clockguard.js` | 一次性活动等待器(12)、心跳/摘要定时器可清理(13)、时间纪律(20) | 等价承载 |
| `kernel/control.js` ＋ `kernel/metrics.js` | 状态面板稳定键(14)、观测诊断通道(25) | 等价承载 |
| `vmu.members` ＋ `kernel/members.js` | 名册原语+快照一致(15)、persona 注入+入职冻结(16) | 等价承载 |
| `kernel/prompt/index.js` ＋ pack prompts | 每轮状态块身份必填(17) | 等价承载 |
| `kernel/grant.js` ＋ `kernel/delegation.js` ＋ `kernel/guard.js` | 授权台账+事件型失效(18)、派生式门禁(22) | 等价承载 |
| `kernel/idempotency.js` ＋ `kernel/transaction.js` | 幂等/去重纪律(19) | 等价承载 |
| `kernel/ballot.js` ＋ `kernel/records.js` ＋ `kernel/minutes.js` | append-only ＋ 少数意见盖章(21) | 等价承载 |
| `kernel/store.js` ＋ `kernel/audit.js` ＋ `host-spawn.js` | 文件工具注入+policy+目录兜底(23) | 等价承载 |
| `kernel/library.js` ＋ `library-policy.js` | 路径契约类守卫(26)、S21 指针传播(30) | 等价承载 |
| `kernel/capacity.js` ＋ `kernel/resource.js` | 资源预算原语(27) | 等价承载 |
| `kernel/scheduler.js` ＋ `kernel/control.js` | 可审计的"不驱动"保证(31) | 等价承载 |

### §4.2 C §⑥（20 条"v5r 用到的能力 → 需要框架提供的原语"）

| # | 需要框架提供的原语（C §⑥ 原表） | vmu 落点 | 判定 |
|---|---|---|---|
| 1 | 常驻子代理（可反复唤醒/中断/释放） | `host-spawn.js` ＋ `kernel/turn/index.js` ＋ `kernel/scheduler.js` | 等价承载 |
| 2 | 以 root 为 transport 的邮箱＋按收件人一条的耐久队列＋ack | `kernel/mailbox.js`(R2) | 等价承载（R2） |
| 3 | 每收件人的投递节流（定时器＋窗口/条数） | `kernel/mailbox.js`(R2) ＋ `kernel/scheduler.js` | 等价承载（R2） |
| 4 | 只读/写入类工具注册＋卸载（`ctx.effect` 内） | `host.js` ＋ `vibe-math-vmu.js`（入口 effect） | 等价承载 |
| 5 | 斜杠命令 | `commands`：vmu 现以工具面为主；命令面**待核**（v2 核 `host.js`/`vibe-math-vmu.js` 是否 register commands） | 映射（v2 定判） |
| 6 | 参数与状态持久化（加固 JSON＋原子写＋fold＋id 分配） | `kernel/store.js` ＋ `transaction.js` | 等价承载 |
| 7 | 定时/看门狗（一次性＋每轮 re-arm） | `kernel/scheduler.js` ＋ `kernel/clockguard.js` | 等价承载 |
| 8 | 文件系统（注入 `fs` ＋ 工作目录语义＋路径基准） | `host-math.js`/`host*.js` ＋ `kernel/guard.js` | 等价承载 |
| 9 | 子进程（spawn/handle/terminate） | `host-spawn.js` | 等价承载 |
| 10 | 上下文管理（占用回读＋压缩接口） | `kernel/metrics.js` ＋ `kernel/prompt/index.js` | 等价承载 |
| 11 | 模型路由（每子代理 provider/model） | `host-spawn.js` ＋ `kernel/turn/index.js` | 等价承载 |
| 12 | 并发上限**可命名**错误 | `kernel/capacity.js`（自设上限＋具名拒） | 等价承载（宿主上限本身见 M-A07 的具名拒绝） |
| 13 | 票权不可代授＋事件型授权＋阶段门/冻结 | `kernel/delegation.js` ＋ `kernel/grant.js` ＋ `kernel/ballot.js` | 等价承载 |
| 14 | 只增不改的审计＋"被取代"而非删除 | `kernel/records.js` ＋ `kernel/auditchain.js` | 等价承载 |
| 15 | 人机接口（人类只经 root；签名 office） | `kernel/human.js` ＋ `vmu.human` | 等价承载 |
| 16 | 非阻塞等待（future-only waiter） | `kernel/scheduler.js` | 等价承载 |
| 17 | 时间戳纪律（框架写 `…At/…Ms`，客户端时间具名拒） | `kernel/clockguard.js` ＋ 各服务 `refuse` 面 | 等价承载 |
| 18 | 机器级资源闸（回合工具计数＋live-child 上限） | `kernel/capacity.js` ＋ `kernel/resource.js` | 等价承载 |
| 19 | 恢复（对账/末段重建/时钟刷新/论文阶段） | `kernel/resume.js`(R2) ＋ `kernel/store.js` | 等价承载（R2） |
| 20 | 交付物（PDF/TeX 编译＋幂等补写＋失败具名） | `kernel/paper.js` ＋ `kernel/publication.js` ＋ `audit-engine-faces` | 等价承载 |

---

## §5 空缺与具名拒绝汇总（**必须能被 Lead 直接派工**）

### §5.1 空缺（3 条，均有归属与判据）

| id | 缺什么 | 由谁补 | 补完的判据（可红） |
|---|---|---|---|
| **C-30** | office 定稿咨询门（`notePaperConsult` 语义） | `vmu-core`（工具/服务面）＋ `vmu-pack`（声明） | 未咨询即定稿 ⇒ **具名拒**（如 `VMU_OFFICE_CONSULT_REQUIRED`）；或具名登记为扩展点并说明由哪层补 |
| **C-45** | 忠实性缺陷强制弃权（L2 option A） | `v5r-reader-b`（形式化面）／`v5r-reader-c`（表决面） | 造不忠实回执 ⇒ 必须**具名弃权 + 留痕**；否则登记为扩展点 |
| **C-52** | 人类报告的**自动汇报**部分（目标 6） | `vmu-assistant`（`kernel/report.js`） | 汇报触发/周期/模板**可声明且可真机关**；真机装配证据（D-09），不接受"文档里写了" |

### §5.2 具名拒绝（5 条，理由 + 改判条件已在上表逐条写明）

| id | 拒绝什么 | vmu 的拒绝方式 |
|---|---|---|
| M-A07 | 把"宿主在活上限"当成 vmu 的能力去承诺 | 只做**可预判的具名拒绝** ＋ 自设上限（`kernel/capacity.js`） |
| M-A13 / C-09 | 伪 id 成员 `OFFICE_INBOX` | 收件人必须是真实成员 ⇒ `VMU_MEMBER_NOT_FOUND`；office 语义由 `vmu.human` 承担 |
| C-53 | `withOffice` 式特权包装 | 权限走 `canDo`/delegation，拒绝**具名**且可审计 |
| C-57 | 产品面导出 `__testHelpers` 测试后门 | 可测性由**注入接缝**提供（`tests/vmu-round1-seams.test.mjs` 37 条） |

### §5.3 与 D-08 三层基线的关系（基线 A/B/C 的覆盖）

- **基线 A（v5r 实际实现的 ≈14 会议命令 ＋ 7 变形 ＋ 全部参数）**：由 §3 的 C-10..C-25 与 §1 的 M-A19/M-A31..M-A38 覆盖；**参数上下界**归 `v5r-reader-c`（C §③-C/⑨）与 `vmu-pack` 的 settings 声明。
- **基线 B（用户点名但 v5r 只在设计里有的：群聊字段/管理员/发言次数/禁言/私信/状态面板）**：对应 §3 C-01..C-09（信箱/群聊）＋ C-46/C-47（工具过滤）＋ 面板 `kernel/panel.js`(R2)；**"管理员/发言次数/禁言"三项在 v5r 代码里不存在**（分片 C §④ 已证），故它们在矩阵里**不占 v5r 机制行**，而是**基线 B 的新要求** ⇒ 由 `v5r-reader-c`（`kernel/chat.js` 的声明面）＋`vmu-pack`（settings 策略）实现，判据见 D-08。
- **基线 C（设计有、v5r 未实现的 21 条流程命令）**：**不占 v5r 机制行**；按 D-08 以"框架原语 ＋ pack 声明"落地，未落地的在 docs 里**具名登记为扩展点**。

---

## §6 v1 → v2 待办（本轮末出 v2）

1. **把 `映射` 全部改成 `核`**：逐行补 `file:line`（v5r 侧）与 vmu 侧落点（服务/模块/工具名），并给出该行"能红"的判据（哪个套件/断言）。
2. **收敛 §5.1 的 3 条空缺**：C-30/C-45 由对应 owner 在轮末前给出**具名拒绝**或**扩展点登记**；C-52 等 `kernel/report.js` 落地后改判。

---

## §7 v2 改判（Round 3 · 实测，三行）

> 本节是 v2 的**全部改判**；每条附可复核证据。**主表未改**（逐行 `映射 → 核` 属下一轮）。

| id | v1 判定 | **v2 判定** | 证据（实测） |
|---|---|---|---|
| **C-52** 人类报告 `report()` 的**自动汇报**面 | 空缺 | **等价承载 · 已闭合** ✓ | `vibe-math-vmu/kernel/report.js:3`（"a mechanism that can be DECLARED, and must not exist until somebody declares it"）＋`:10-12`（**零机制**：`vmu.report.enabled` 默认 false、`vmu.report.reports` 默认空 ⇒ 未配置实例**什么都不报**；"声明了但关"与"从未声明"由 `status().problems` 分别具名）＋`:48-49`（`VMU_REPORT_NOT_ENABLED`／`VMU_REPORT_PARAM_NOT_DECLARED`）。⇒ v1 的缺口（"只登记不实现"）**已由 `kernel/report.js` 闭合**；工具面在 `vibe-math-vmu/tools/report.js`。★ 仍未做的是 **宿主侧 `agent/turn-stopping → report.tick` 的装配**（Round 3 归 core 的项），故本行只声明**内核侧**闭合。 |
| **C-30** office 定稿咨询门（`notePaperConsult` 语义） | 空缺 | **仍空缺** ✗ —— ★ **判定点尚未落地**：`kernel/paper.js` 待接线，**已指派 vmu-assistant** | 本轮在 `kernel/*.js`／`tools/*.js` 重新 grep `notePaperConsult`／`finalizePaperByOffice`／`consultRequired`／`CONSULT`：**零命中**（命中的 `consulted` 全部是 `enforced[]` 的"已咨询键"语义，与定稿咨询门无关）。⇒ **不得写成已闭合**；处置＝等 `kernel/paper.js` 接线后由 verify 复测（未咨询即定稿必须**具名拒**）。 |
| **C-45** 忠实性缺陷强制弃权（L2 option A / Adv-verify F1） | 空缺 | **仍空缺** ✗ | 本轮在 `kernel/formal.js`／`kernel/ballot.js` grep `faithful|忠实|abstain|abstention|弃权`：**零命中**。⇒ 缺"因忠实性缺陷而强制弃权＋留痕"的路径；处置＝`v5r-reader-b/c` 给出具名弃权实现，或具名登记为扩展点（并写改判条件）。 |

**v2 空缺清单（具名可追溯）**：`C-30`（office 定稿咨询门 ⇒ `kernel/paper.js` 待接线，vmu-assistant）、`C-45`（忠实性强制弃权 ⇒ reader-b/c）、`M-A04` 的"论文轮次上限可调"子项、`M-B20`"边界说明"（非机制）。⇒ C 家族空缺 **2 条**（v1 为 3 条，C-52 已闭合）。

---

## §8 v3 改判（Round 4 · 实测）

> §7 的 v2 判定**已被本节取代**（保留原文以显示演化）。每条附可复核证据；空缺持续具名。

### 8.1 C 家族两条空缺 → **等价承载 · 已闭合**

| id | v2 判定 | **v3 判定** | 证据（实测） |
|---|---|---|---|
| **C-30** office 定稿咨询门（`notePaperConsult` 语义） | 仍空缺（`kernel/paper.js` 待接线） | **等价承载 · 已闭合** ✓ | ① 判定点落地在 `kernel/paper.js`（五个 `vmu.paper.officeConsult*` 键，`WIRED_KEYS` 导出）；② 我**在该门的拒绝场景表里实测**：未咨询即 `finalize` ⇒ **thrown ＋ `VMU_OFFICE_CONSULT_REQUIRED`**、`enforced` ＝那五个键（`audit-enforced-consistency` 355/0 内含此场景，`scn.module='paper'`）；③ 该门有自证套件 `tests/vmu-paper-consult.test.mjs`（其自身断言 `enforced.length===5` ＋ `enforcedScope`）。**残余**：`notePaperConsult` 是 v5r 的**函数名**，vmu 用**工具/服务面**承载同一语义（名字不同、语义等价）——这正是"等价承载"的判据 |
| **C-45** 忠实性缺陷强制弃权（L2 option A / Adv-verify F1） | 仍空缺 | **等价承载 · 已闭合** ✓ | ① 决策在 `kernel/fidelity.js`（`declareDefect` 三具名拒：缺 target／缺 by／缺 note；marker 带 `markerId/enforcedVote=0.5/reason` 与 `passedWithdrawn:true`）；② **唯一强制点**在 `kernel/ballot.js:210-229`：决定性票经 `fidelity.applyAbstention(...)`，`gate.enforced===true` ⇒ 改写为 `kind:'abstain'`、`value:0.5`、保留 `declared`；③ 我在 `audit-enforced-consistency` 里**直接断言**：改写发生（`byFidelity===true`）且**弃权不能定论**（`close()` 的 outcome ≠ true）；④ `ballot.js` 因此进"代码里含 enforced"名单，我用**机械验真的消费型豁免**处理（`enforced` 只能是他人字段的**读**），未走信封豁免 |

**v3 空缺清单（具名可追溯）**：`M-A04` 的"论文轮次上限可调"子项、`M-B20`"边界说明"（**非机制**，只是说明条目）。⇒ **C 家族空缺归零**；A 家族 1 条子项、B 家族 1 条非机制。

### 8.2 F 项实测改判（Round 4）如何映射到矩阵行

| F 项 | R3 → R4 | 证据 | 影响的矩阵行 |
|---|---|---|---|
| **F9** `sendMessage` | 缺失 → **具备** | `kernel/index.js:263,954,975,1779-1782`（seam ＋ `status()` 自曝 ＋ 缺 seam 具名 note）；消费点 `kernel/turn/index.js:207-225 sendToMember`（三重具名拒后调 `subagents.sendMessage`） | A 家族"子代理生命周期／在跑成员可被触达" |
| **F10** `interrupt` | 缺失 → **具备** | `kernel/index.js:261-263,955,976,1783`；消费点 `kernel/turn/index.js interruptMember`；会议侧另有点名能力 `kernel/meetings.js:619` | 同上（＋会议"中断发言"是另一层，代码里分开） |
| **F17** `graceMs` 真 terminate ＋ 输出上限 | 缺失（具名） → **条件具备** | `kernel/lean.js:375-376`（`graceMs` 作为**请求**交宿主）、`:409-410`（有 handle ⇒ 报 `terminated:true`；无 ⇒ **具名**"无法 terminate…进程可能仍在跑"）、`:124`；输出上限＝`vmu.math.captureStdoutBytes`（`lean.js:67,166`） | B 家族"外部工具/子进程执行"行 |
| **F18** 锁在 `finally` 释放 | 部分 → **具备** | `kernel/resume.js:692-713`（真实使用者）、`:761-762 } finally { … releaseRecoveryLock() }`（覆盖快乐路径/early return/throw，零机制直通也 release，并自曝 `acquisitions/releases/busyRefusals`） | B 家族"耐久写／并发"行 |
| **F28** 有界兜底具名可撤销 | 缺失 → **具备** | `kernel/meetings.js:331/336/348/370`（lapse/lapseDue/revokeLapse，界＝`vmu.meetings.hardLimitMs`，撤销**必须给理由**、append-only）；`kernel/ballotbox.js` 同形（`openMaxMs`，到期 `outcome:null` 不发明结论） | C 家族"会议/表决兜底"行 |

**未变（本轮无新证据，维持 R3）**：F11（`childId`/`stopReason` 全包 **0 命中**）、F16/F31/F33 的"等价"推理判定、F22（但见 §8.3：本轮已把 F22 从"写法"升级为**变异可证**）。

### 8.3 F22：从"行为断言写法"升级为**变异可证**

新增常驻族 `tests/audit-prompt-behaviour.mutants.mjs`（`node … ` ⇒ **4/4 exit 0**）：拷 `kernel/prompt/index.js`（自包含、零 import）＋**三处单点变异**，每处必须让对应行为断言变红：① 变 `if (typeof overrides[name] === 'string')` ⇒ `overrideInEffect` 红；② 变装配路径的不可变守卫 `if (entry.name === 'state' || entry.mutable === false)` ⇒ `bindingOnStateIgnored` 红；③ 变 `delete overrides[section]` ⇒ `rollbackRestores` 红；＋**控制组**（未变异副本四条事实全绿）。⇒ F22 的判定从"我读到了行为断言"变为"**行为断言可被证明会红**"。
3. **§4.2 第 5 行（斜杠命令）定判**：核 `host.js`/`vibe-math-vmu.js` 是否注册 commands，是 ⇒ 等价承载，否 ⇒ 具名拒绝或空缺。
4. **合并本编码缺陷的上游修复**：建议 Lead 重生成 `03-v5r-full-inventory.md`（显式 UTF-8），否则该文件对下游读者不可用。

---

## §9 v4 改判（Round 5 · 8 条 F 项，逐条实测）

> 每条都**读过代码**；改判的写 `file:line`，维持的写"本轮复核了什么、为何不变"。**同类项的旁证**：`tests/vmu-chat-quota.mutants.mjs`（本轮新增的可证伪族）与 `05-framework-strength-evidence.md` §10.6 的 F43–F47 复核。

| F 项 | v3/R4 判定 | **v5（R5）判定** | 证据（本轮实测） |
|---|---|---|---|
| **F26** 五种票型分离 | 部分（"未见固定枚举"） | **具备** ✓ | `kernel/ballot.js:38` `export const VOTE_KINDS = Object.freeze(['for','against','abstain','unable','estimate'])` —— **恰好五种、被导出**；配 `classifyVote`（`:51-52` 由 `DECISIVE_VOTE` 反推 'for'/'against'）与 `DECISIVE_KINDS`、`DECISIVE_VOTE`（`:21`）⇒ 票型不再是"由设置定义的松散集合"，而是**具名枚举＋分类器** |
| **F35** DAG 校验（自环＋整图环） | 缺失（"只查依赖是否满足"） | **具备** ✓ | `kernel/tasks.js:54-75`：`export function findDependencyCycle(startId, deps, getDeps)` —— **纯函数且导出**，返回**环路径**；`:75` 把**自环当长度 1 的环**；`:54` 注释记录了改前形态（"a cycle used to be constructible and simply never became ready — a silent …"）⇒ 从静默不可达变为**可检测的环** |
| **F13** `tools.restrict` 未注册名容错 | 部分（fail-closed，语义与 v5r 相反） | **部分**（维持） | `host.js:319,329,858` 仍为 fail-closed：未知名**具名拒**并列出未知项与已知面 ⇒ **能力在、语义刻意相反**（改判条件未变：若要"容忍未知名"须显式新增分支） |
| **F31** 原子队列 | 部分（同步写＝结构性原子） | **具备** ✓（R5 显式队列 → **R6 跨进程耐久原子**） | ★ 原判差在"**没有显式队列**"，而这不是纯形式问题：`cast` 会 `await bus.emit('ballot/cast', …)` ⇒ **两票并发可在"查重"与落盘之间交错**（两票都过 `votes.has`，后者覆盖前者）。**R5**：`kernel/ballot.js:189` `castNow`（**唯一临界区**）＋ `:335` `cast` 只做**同一条 FIFO 链**的包装＋`:432` `status().gate={serialized,pending,commits}` 自曝。**R6（reader-c，我已复核）**：`:139-152 createDurableCommitLog({store,clock,name})` 升成**协议**——① **ticket 由 store 分配**（`append` 回 `{ticket}` ⇒ 两进程共享 store 即得互不相同且单调的 ticket；store 不回则退本地计数并在 `status().numbering` 明说"每进程"）；② **意图先于生效**（`reserve`→apply→`complete`，崩溃窗口内意图留在日志）；③ **恢复不双花**（`reconcile()` 按 ticket 序重放未完成意图，已 done 跳过、幂等、恢复票 `recovered:true` 且真能定论）；④ **无 store ⇒ `durable:false` 且 `reserve()`→`null`**（缺席自曝）；⑤ `status().gate` 增 `durable`/`log`。**实测**：★我复跑 `tests/vmu-meeting-parity.test.mjs` ⇒ **162/0 exit 0**（§18＝其 12 条）。**残余具名**：① host 需提供**分配型 store**（协议与恢复完备，缺宿主一个 store）；② `ballotbox`／`mailbox` 可照同三行接上；③ 跨进程写者隔离由 store 原子 append 保证，本面只定义协议 |
| **F32** "刚刚定论"去重窗口 | 部分（有重复举手去重，非时间窗） | **具备** ✓（R5 由实现改判） | 构造参数 `dedupWindowMs`（**0＝零机制**）；`close()` 的窗口分支维护 `lastClose`；`status().dedup = {windowMs, foldedVerdicts, lastClose}`，快照携带 `lastClose/dedupedVerdicts` ⇒ **重启后窗口仍生效**。三条诚信边界：①**只有同结论折叠**，窗口内不同结论**永不折叠**；②折叠后仍必须收束（`state='tallied'`＋`outcome`）——初版折叠后停在 `open` 还能继续收票，是自查抓到的真 bug；③有中间件 tally（`bus`）时**不猜**，跳过折叠（公告权归中间件）。reader-c 实测（其 §17 断言在 `tests/vmu-meeting-parity.test.mjs`，**我复跑 150/0 exit 0**） |
| **F34** 开启辩论的资格判据 | 部分（有"谁有资格投票"的判据） | **具备** ✓（R5 由实现改判） | `open({by})` 的三个**已声明**条件：`openers`（null＝任何人；数组＝具名开启人）⇒ 非开启人 `VMU_NOT_PERMITTED`；`minEligible`（>0）⇒ 选民团不足 `VMU_STATE`（带现值/下限）；`requiresTarget` ⇒ 无标的 `VMU_INVALID_ARGUMENT`；`status().openCriterion`（含 `satisfied`）在**撞上之前**可见；默认宽松（`openers=null`、无下限）＝零机制。**顺带修掉的暗礁**：`close()` 后 `open()` 原会**带旧票重开** ⇒ 现在对 `state==='tallied'` **具名拒**并指向 `reopen()`。reader-c 实测（同一 150/0 套件） |
| **F39** 写域建议明确 advisory | 缺失 | **具备** ✓（R5 由实测改判） | `kernel/tasks.js:82-83` `export function normalizeWriteScope(raw)`（注释明写 *"F39 (Round 5): the team-board scope contract, shared by the creator's declaration and the advisory view"*）；`:180-182` `writeScopeConflicts()` —— 注释**逐字**写 *"The ADVISORY view: which live tasks declare overlapping write scopes. **Never refuses anything**"* ⇒ 写域建议**存在且明确是 advisory**（不拒任何操作）；`status()` 另报 `writeScopes`/`writeScopeConflicts`。自证套件 `tests/vmu-tasks-dag-and-scopes.test.mjs` **41/0**（我复跑确认） |
| **F53** 直接 fs 与策略 fs 边界 | 部分（事实边界，无显式声明） | **部分**（维持） | 直连 `node:fs` 的模块集合未变（`guard.js`／`index.js`／`records.js`／`host-math.js`／`vibe-math-vmu.js`；策略层 `storepolicy.js` 无 IO）⇒ 边界**事实上**存在，仍缺显式声明/守卫 |

**旁证（reader-b 的 F43–F47 本轮再证，见证据文件 §10.6）**：F43 三元组（`lean.js:345/422/424/428-429` ＋ 恢复分支 `:602/651`）、F44 一次性公告（`pushNotice :215`／上限 `:72`／`takeNoticesFor :219` 取出即移除／长期查询 `:500/762`）、F45 去重与 settle **同源函数**（`dedupeKeyOf :307` 复用 `contextHashOf :300`）、F46 解析顺序（`mathadapters.js:139 PY_CANDIDATES` ＋ `:396`）、F47 探测/两步安装/审计（`probe :471`／`op:'probe'→'run'`／plan→planToken→confirm／`shapeContract :718`）⇒ 五条**维持具备**。

**F15 的收尾口径（Lead 协调，防双写）**：`math-computation.js:617,728` 两处无句柄退避 sleep **不算"缺失"**，而是**具名豁免**——由 reader-b 写入 `vibe-math-vmu/docs/11` 的 **`### 11.ap 门禁豁免：（共享模块）两处退避 sleep（★ 轮 R5 登记）`**（★ 授权标题原为 `11.ad`，但 `docs/11` 已有 `### 11.ad 巡检：…`（轮 537）⇒ **顺延为 `11.ap`**；含站点表＋上界（单站点 ≤650ms、整段 ≈1.8s/引擎）＋重测命令 `node tests/vmu-activity-timers.test.mjs`）；该节同时写明"§1 分类行与 §5 探针**故意保持红**作为该边界的证据，将来四份副本一起加接缝时本节与分类行必须同时删除"。**本矩阵不重复该节内容**，也不称其为"缺失"。

### §9.1 真机"多面点亮"：**实测具备 ✓（R6 终态；含一条如实标注的 NON-RESULT）**

- **U14 overlay 机制＝可用 ✓**（免费复核）；**preset 可创建**：`POST /api/session/create {agentPreset:'vibe-math-vmu'}` ⇒ **http=200 ok=true**。
- **R6 真机会话（vmu-assistant 跑在我起的实例上；SLV §2/§4 合规）＝ 多面点亮成功**，读数取自**会话日志**（多帧 zstd，用 `dsh-drive.mjs:213-215` 的规范读法；seq＋行号如下）：
  | 事实 | 行/seq | 内容 |
  |---|---|---|
  | `user/message`（首条，§2 落点） | **L10 / seq=8** | 以「**【模拟测试 / SIMULATED TEST】** …」开头 ✓ |
  | `system/message` | L9 / seq=7 | 6 929 字符 |
  | ★ **`request/header`（宿主真发给模型的载荷）** | **L13 / seq=11** | **tools=78，其中 `vibe_vmu_*` ＝ 52 个面**——含 `chat`/`panel`/`report`/`mailbox`/`wait`/`meeting`/`turn`/`human`…（不再是"只有 `status`"） |
  | ★ **真实工具调用＋返回（5 对，4 个不同面）** | **L18/seq16 → L19/seq17** `vibe_vmu_status`；**L20/seq18 → L21/seq19** `vibe_vmu_chat`；**L22/seq20 → L23/seq21** `vibe_vmu_panel`；**L24/seq22 → L25/seq23** `vibe_vmu_report`；**L29/seq27 → L30/seq28** `vibe_vmu_report` | ✅ **≥3 面的验收达成**（实际 4 个面、5 对调用/返回） |
  | 模型过程自述 | L28 / seq=26 | 明写它在按脚本逐步调用（第 4 次＝report status） |
  | **★ 声明真的到入口了（端到端交叉核对）** | 同一会话 `tool/result` 的 status 回执 | `settingsMerge.sources = {vmu.tools.faces:'config', vmu.packs.active:'config', vmu.report.enabled:'config', vmu.report.minIntervalMs:'config'}`、`keys=4`、`conflicts:[]`、`shadowed:[]`（**R5 同字段是 `sources:{}`／`keys:0`**）⇒ 嵌套声明经 core 的 task-41 **确实被入口解析**，与上表的 52 面互为印证 |
  
  **往日期的面数口径**：我按载荷逐个数＝**52**（程序化复算：tools=78、`vibe_vmu_*` unique=52；vmu-assistant 也已把三份文件改成 52）。两次会话的 `request/header` 均为 **78/52** ⇒ 稳定。
  
  **助手面 / 报告面（R5"未建立" → R6b 声明到达 → ★R7 第 6 次会话：三条全部【实测具备】，回合 completed）**：
  - **报告声明路径＝实测具备 ✓**：R6b（overlay **v3** 带一条真阈值报告）status 回执 `declared:1, armed:1, problems:[]`，`settingsMerge.sources` 出现 `vmu.report.reports:'config'`（R5 为 `declared:0`／`sources:{}`）。
  - **★ 阈值真开火＝实测具备 ✓✓**（R7 第 6 次会话，`session-55ab3f49…`）：`vibe_vmu_report {"action":"tick","metrics":"{\"artifacts\":9}"}`（**L24/seq22 → L25/seq23**）回执原文：
    `declared:1, fired:[{name:"artifacts-threshold", trigger:"threshold", at:…, channel:"log", text:"【成果阈值】artifacts=9 已达阈值 5", delivered:false, drives:false, refused:{code:"VMU_REPORT_NO_TRANSPORT", message:"no delivery transport was injected: nothing was sent (and nothing is pretended)"}}], skipped:[], delivered:0, audit:{appended:true}, enforced:[11 键]`
    ⇒ **阈值真的触发**（名字/文本/`delivered:false`/`drives:false` 全部如实）；**投递被具名拒绝**（无 transport ⇒ `VMU_REPORT_NO_TRANSPORT`，**不假装送出**）；`audit.appended:true`。
  - **★ 参数面留痕＝实测具备 ✓✓**：`vibe_vmu_set {"key":"vmu.turn.instituteName","value":"Slice-Institute"}`（**L29/seq27 → L30/seq28**）回执：
    `{"ok":true,"key":"vmu.turn.instituteName","value":"Slice-Institute","hot":"H2","who":"office","ownerCheck":"exempted (no `by` given: office path, DISCLOSED)","requiresRestart":false,"appliesFrom":"next session (restart required)","source":"runtime"}` ⇒ 写入**经内核写者**、带 **hot 类 + who + 明确披露**（工具 schema 只收 `{key,value}` ⇒ 它**明说**"没给 `by`，按 office 路径豁免"而不是掩饰）；随后 `vibe_vmu_status`（L34/seq32）的 `settings.keys` 已含该运行时键。
  - **★ 两条人设通道＝实测具备 ✓✓**：模型最后自述原文 *"I am the institute office (assistant/external interface), not a member, and I do not vote."* ⇒ **system prompt 通道**（知道自己是所办、无投票权）与**报送策略通道**（`report` 面按"所办不投票"的口径答复）都成立；它还主动标注了「SIMULATED TEST／未做研究工作」。
  - ✅ **本轮回合【completed】**：`turn/end` **L50/seq48 = `{"turn":1,"reason":{"kind":"completed"}}`**（前两轮的触顶取消**不再发生**）⇒ **R7 这一次是真正的 PASS，不是 NON-RESULT**。
  - **计数口径**：`request/header` **L13/seq11 仍是 78 工具 / `vibe_vmu_*` 52 个**（与前两轮一致；R6 那次"51 vs 52"的差异已查明为 assistant 的笔误并改回 **52**，**无口径分歧需要并列**）。
  - **观察（非缺陷）**：模型为绕过 49k 回执的 elide，**额外调了两次 `pwsh`** 去重读 spill 文件（L39/seq37、L44/seq42）⇒ 这是**提示词"只贴前 120 字符"**带来的绕行，不影响三条判定；若要更省的下一轮，可把"长回执"指令改成"直接给结论"。
- **本面在 R5 的缺口已闭合**：R5 的根因是**入口 `readSettings()` 只收点号键 ⇒ 嵌套声明被静默丢弃**；core 的 task-41 让入口**同时接受嵌套/点号两形态**、并对无法解析的键**具名告警＋计数自曝** ⇒ 本轮真机一次性发布 **52 个面**并真被调用。
- **配套运行时判据（本轮新增，全绿）**：`tests/audit-declaration-publishes-face.test.mjs` **28/0**（真入口 `apply` ⇒ 读 `ctx.tools.register`：无声明恰 1 工具／空命名空间仍 1 工具零告警／点号与嵌套**含家族键**等价／坏形状键具名告警且不发布／三类不可解析计数一致／同键点号胜并披露）＋ `….mutants.mjs` **GREEN**（M1 关点号通道、**M2 关嵌套展平＝R5 真故障形态**、M3 静音告警，各自打红它点名的那一项）。
- ⚠️ **NON-RESULT（如实标注，不得写成完整通过）**：该**回合本身被 `--max-tokens 40000` 触发上限而取消**（驱动读数 `totalTokens 70 488 > cap 40 000` ⇒ `action: session/cancel`；`done`: in 42 778／out 1 086／21 s）。⇒ **"发布与 5 对调用"是取消前已完成并被日志记录的观测事实**；但**"该回合完成"不是结果**——按 `docs/slv-playbook.md` §8，它不是 PASS。若要让回合本身也完整收口，需以更高 `--max-tokens` 重跑一次（留给需要时）。
#### R5 历史（已闭合；保留为根因与判据的来路）

- **R5 真机会话**（vmu-assistant 跑，实例由我起；SLV §2/§4 合规）：`session-84e91216…`；provider/model＝`dsh-opencode-go`／`deepseek-v4.1-flash` ✓；`user/message` **L10 seq8** 含「模拟测试」✓；**`tool/call` L18 seq16 `vibe_vmu_status` ＋ `tool/result` L19 seq17** ✓ ⇒ **该面＝实测具备**；tokens in 23077／out 1400／cacheRead 7680 ＝ **32157**，`tokenCap 40000 未触`。
- **R5 未发布（模型原话，转录可查）**：`vibe_vmu_chat`／`vibe_vmu_panel`／`vibe_vmu_report` **当时不在工具集** —— *"I only have vibe_vmu_status … The others don't exist … I should not fabricate."* ⇒ 当时判【未建立】（**是发布问题、不是提示词问题**）。
- ★ **R5 根因（我独立核到代码行）＝形态不匹配，且是【静默丢弃】**：旧 `readSettings()`（`vibe-math-vmu.js:54-59`）只收"键本身就带 `vmu.` 前缀"的点号键 ⇒ overlay／`docs/02` 的**嵌套** `vmu: { tools: { faces: ['*'] } }` 顶层键是 `tools`／`packs`／`report`，**全部被丢弃且不报错不告警**（"接了≠生效"那一类）。**R6 已由 core 的 task-41 修掉**（两形态兼容＋无法解析的键**具名告警**＋计数自曝），并由 §9.1 的真机会话与 `tests/audit-declaration-publishes-face.test.mjs` 双重确认。
- **方法与纪律（已写入 `docs/11 §4.2` 第三条硬要求）**：`--dump-config` 是 loader 树、不是运行时定义 ⇒ **不能**用"字符串出现与否"判定声明是否生效；**合并类语义必须在运行时断言**。本轮**双向都误判过**（假阳性＝patch 原文当合并；假阴性＝dump 照不出注册期合并）。**免费复核读数**：`tests/audit-preset-overlay-merge.test.mjs` **21/0**（含**反向行序**、**无 `agentPresets` 时不抛**、**每用例独立模块实例**——overlay 注册表是模块级的，共用实例会互相污染）；dump 层面 preset 行**204 行逐字节相同**、内层行**逐字节相同**、总差 **+15 ＝ overlay 行 +14 ＋ patch 注释 +1**。
5. **矩阵自身的门禁化**：把"每条机制必须在矩阵里出现一次且只有一个判定"做成静态门（扫分片 id ↔ 矩阵行），避免矩阵本身漂移成纸面。

---

## §9.2 v5 新增（Round 6 · 逐条实测）

### 9.2.1 C-45 弃权改写：**强制点不只是"代码里在"，而是"移除即被同一探针具名抓住"** ✓

v3 的闭合口径是"**等价承载·已闭合**"（读码证明唯一强制点存在）。R6 由 vmu-activity 补上**变异证明**（`tests/vmu-fidelity-falsify.test.mjs`，★**我复跑 10/0 EXIT=0**）：
- **控制组（未变异）**：被登记者 `declared:1` ⇒ `vote:0.5, enforced:true, reason:'fidelity-defect'`；`declared:0` **同样** 0.5（**是弃权、不是钳制**）；**他人／他对象／已是 0.3** 三种情形原样通过（证明"改写"不是"全改"）；marker 与 `view().enforcedVote` 都是 0.5。
- **两处单点变异（拆掉即红，且各自具名）**：① `kernel/fidelity.js:136` `if (!(declared === 0 || declared === 1))` → `if (true)` ⇒ 有缺陷成员的 **1 与 0 都成为结论**、`abstentionsEnforced:0`；② `kernel/fidelity.js:30` `FIDELITY_ABSTENTION_VOTE = 0.5` → `0.25` ⇒ **弃权悄悄变成软票**（marker 与视图一起漂）。
⇒ 判据升级：**C-45 的"唯一强制点"具备，且该性质可证伪**。

### 9.2.2 F31 再升一档：**具备 → 具备（跨进程耐久原子）** ✓

见 §9 的 F31 行（`kernel/ballot.js:139-152 createDurableCommitLog`：ticket 由 store 分配／意图先于生效／`reconcile()` 幂等且不双花／无 store ⇒ `durable:false` 且 `reserve()`→`null`／`status().gate` 增 `durable`+`log`）。★ 我复跑 `tests/vmu-meeting-parity.test.mjs` ⇒ **162 passed / 0 failed EXIT=0**。**残余具名**：host 需提供**分配型 store**；`ballotbox`／`mailbox` 可照同三行接上。

### 9.2.3 写前必读闸（resume）：变异证明 ✓

`tests/vmu-resume-falsify.test.mjs`（vmu-activity，★**我复跑 9/0 EXIT=0**）：从未成功读过就写 ⇒ 具名拒 `VMU_RESUME_WRITE_BEFORE_READ` 且 **0 键落地**；**读失败不算读过**（`store.export()` 抛错后锁仍关）；控制组＝读成功后同一写成功。变异：**跳过闸门／闸门失效**各自具名红。

### 9.2.4 目标 2 终判摘要（reader-c task-46；主交付 `08-goal2-verdict.md`）

- **v5r 实现层**（代码真有的 14 条会议命令）⇒ vmu **14/14 具备**（＋7 条 ≈ 变形全部具备或更强）；群聊四要素（id／发言人／时间／回复锚）具备；**管理员／发言次数／按人禁言 v5r 代码里根本没有**（`v5r-inventory-c:623-625,661-662`）⇒ vmu 有＝**加分**；私信具备（每收件人一份、入队即耐久、ack 后不留正文、`dm`/`office`），**私聊补记到公开面**（v5r `supplementOf`）**未实现＝具名缺口 G1**；状态面板四字段具备且多 `subtasks`＝加分。
- **v5r 设计层 42 条命令**：v5r 自身只实现 14 ✅＋7 ≈＋21 ✗ ⇒ vmu **具备 ≈26／部分 ≈11／缺 ≈5**。⇒ "支持 v5r **全部功能**"＝**是（且有余量）**；"支持**设计文档**全部功能"＝**否**（v5r 自身也不满足），缺口 G1–G9 与改判条件见判定文档 §6。
- **诚实标注**：v5r `selfReportTool` 逐行未读（Round 1 边界）⇒ 面板判"具备（对齐已确认四字段）"，改判条件≈10 行。

### 9.2.5 "声明 ⇒ 面真的发布"：R6 新增的运行时判据（本轮主交付）

- `tests/audit-declaration-publishes-face.test.mjs` ⇒ **28 passed / 0 failed EXIT=0**（走真入口 `apply(ctx, config)`，读 `ctx.tools.register`）：**无声明 ⇒ 恰 1 个工具**（D-01）；**空命名空间 ⇒ 仍 1 个且零告警**；**点号／嵌套两形态等价**（含**家族键** `vmu.report.*`：两种拼法都发布 `vibe_vmu_report`）；**坏形状键 ⇒ 具名告警 ＋ handle `settingsUnparsed()` 自曝 ＋ 不发布**；**三类不可解析**（空对象叶子／函数／坏形状键）各一条具名且 `status().settingsUnparsed` **计数一致**；**同键两形态 ⇒ 点号胜 ＋ `settingsConflicts()` 披露**；**确定性**。
- `tests/audit-declaration-publishes-face.mutants.mjs` ⇒ **GREEN**：**M1** 关掉点号通道 ⇒ `dottedFaces` 退化；**M2 关掉嵌套展平 ⇒ `nestedFaces` 退化（正是 R5 真故障形态）**；**M3** 静音告警 ⇒ `malformedWarned` 变 false。
- ★ **方法论（已写入 `docs/11 §4.2`）**：`--dump-config` 是 **loader 树**、不是运行时定义 ⇒ **不能**用字符串出现与否判定"声明是否生效"；判据必须是**运行时**（本条读 `ctx.tools.register`）或**真机载荷**（`request/header.tools`）。

---

## §9.3 pack 列改判（Round 6 · vmu-pack 的 goal-4 终判；**以本节为准**）

> 来源：`_handoff/vmu/09-goal4-verdict.md`（vmu-pack）。**总判定：v5r pack 与梳理清单在机制面一致 —— 125 行里没有一行是"框架与 pack 都缺"**（C-30／C-45／C-52 已在 R3/R4 闭合）。下面是对本矩阵 **pack 列**的系统性重判；**原表仍显示旧口径的行，以本节为准**。

### 9.3.1 准确形状（三类，不是缺口）
| 类别 | 规模 | 含义 |
|---|---|---|
| ① **pack 真声明** | **47 个 `vmu.*` 键**（＋1 M1 规则、1 prompt 策略、4 prompt 模块、3 slots／5 tracks）**直接承载约 35 行** | 机制由 pack 提供且真声明 |
| ② **框架具备、pack 未声明** | **约 89 行** | **取框架默认值或默认不启用 ⇒ 不是缺口**（这是"机制在框架、策略在 pack"的正常形态） |
| ③ **真缺口** | **1 条子项 ＋ 1 个孤儿键** | 见 9.3.3 |

### 9.3.2 逐类改判清单（行 id 照 vmu-pack §4）
1. **约 33 行改判为"框架具备（键族），pack 未声明（默认值生效）"**：`M-A02`、`M-A06`（提示词侧已声明）、`M-A17`、`M-A18`、`M-A21`、`M-A28`、`M-A31`、`M-A32`、`M-A37`、`M-A38`、`M-A44`、`M-A45`、`M-B02`、`M-B07`–`M-B10`、`M-B12`、`M-B14`、`M-B16`、`M-B18`、`M-B19`、`C-01`–`C-06`、`C-08`、`C-10`–`C-22`、`C-25`–`C-28`、`C-31`–`C-35`、`C-37`、`C-38`、`C-41`、`C-42`、`C-44`、`C-46`、`C-47`、`C-49`、`C-50`。
2. **改判为"pack 真声明的键"**：`M-A19`、`M-A33`、`M-A36`、`M-A06`／`M-B11`、`M-A24`、`M-A47`、`M-B14`、`C-29`／`C-30`、`C-39`、`C-52`、`C-55`（键 ↔ 机制 id 对照见 vmu-pack §1.1 的 47 键表）。
3. **4 处"键名不存在／真名是 X"（不是缺口）**：`GRANTABLE_COMMANDS`／`GRANT_SCOPES` → **框架不提供**（旧真名 `vmu.grant.commands`／`defaultScope`／`enabled`／`maxOpenGrants` 已随 `kernel/grant.js` 在 goal round 3 删除 ⇒ 见上表 `M-A30` 的「框架不提供」改判；**这里不再有"真名"可指**）；`vmu.lean.*` → **不存在**，承载是 **`vmu.math.*`**；`chatDigestMax(12)`／`chatDigestMs(45s)` → **`vmu.mailbox.digestMax`（默认 12）／`digestWindowMs`（默认 45000，与 v5r 值逐字相同）**；`SECRETARY_ENTRY_MAX`／`min_votes`／`motionSecondsRequired` → **`vmu.minutes.verbatimCapBytes`／`vmu.ballot.minVotes`／`vmu.motions.secondThreshold`**。
4. **1 行改判为"框架不提供（规则集不要求）"**：`M-A30`（临时授权与撤回）—— `kernel/grant.js` 已删除（零活构造者；v5r 规则集不要求 grants），4 个 `vmu.grant.*` 键、`grant/granted` 钩子登记、reachability 豁免条目一并撤销。**这不是缺口**：规则集不要它，框架就不再宣称有它；**改判条件**写在 `M-A30` 行内。

### 9.3.3 真缺口与清理项（具名，可追溯）
- ★ **新增真缺口（M-A04 子项）**：**`vmu.paper.*` 没有轮次上限键，`kernel/paper.js` 没有 `maxRounds` 读点** ⇒ 本矩阵 `M-A04` 原先"可覆盖轮次/引擎"的措辞**必须撤回，或先加键再声称**（owner＝vmu-core）。
- ★ **孤儿键**：**`vmu.meetings.reconsiderFloor`** 在 `settings/schema.js` 与 v5r 清单 `packs/v5r/prompts/v5r-core.js:78` 各出现一处，**全仓零读者**；真正生效的是 **`vmu.ballot.reopenFloor`**（读者 `kernel/ballotbox.js:22,41,137`）⇒ **删一行，或让 `ballotbox.reopen()` 真读它，二选一**（owner＝core ＋ assistant）。
- **复核探针**（仓外一次性，读数见其报告）：`D:\_tmp\goal4-keycheck.mjs`（键名三方对照）、`goal4-pack-readers3.mjs`（47 键真读者：41 内核 ＋ 5 pack 策略模块 ＋ **1 孤儿**）、`goal4-matrix-extract.mjs`（93 个 pack 声明串去重）。
- vmu-pack 侧门禁全绿：`vmu-planned-settings` **39/0**、`vmu-pack` 53/0、`vmu-bus` 44/0、`vmu-kernel` 175/0、`vmu-host` 103/0、`audit-pack-face` 5/0、`audit-hook-coverage` 4/0（86 钩子）、`check-docs` PASS、defaults 探针 `undeclared=0`。

### §9.4 键名更正表（Round 7 · A 项：**转述错误，不是缺口**）

> 来源：`_handoff/vmu/09-goal4-verdict.md` 的真名表。下表 **取代** 上文中这些名字的旧写法（已就地更正）；**这不是能力缺口**——v5r 清单里的常量名/字段名被转述成了"看起来像设置键"的形状，框架侧真名如下：

| 旧写法（转述） | **真名（仓内）** | 出现过的行 |
|---|---|---|
| `GRANTABLE_COMMANDS` / `GRANT_SCOPES` | **框架不提供** —— 旧真名 `vmu.grant.commands` / `vmu.grant.defaultScope` 已随 `kernel/grant.js` 删除（goal round 3）⇒ 见 `M-A30` 的「框架不提供」改判；**不是缺口，也不再是本仓的设置键** | M-A30 |
| `vmu.lean.*` | **不存在** —— 承载是 **`vmu.math.*`** | M-B12 |
| `chatDigestMax`(12) / `chatDigestMs`(45 s) | **`vmu.mailbox.digestMax`**（默认 12） / **`vmu.mailbox.digestWindowMs`**（默认 45000，与 v5r 值逐字相同） | M-A45、C-05 |
| `SECRETARY_ENTRY_MAX` | **`vmu.minutes.verbatimCapBytes`** | M-A37 |
| `min_votes` | **`vmu.ballot.minVotes`** | M-A31、C-22 |
| `motionSecondsRequired` | **`vmu.motions.secondThreshold`** | M-A38 |

---

## §9.5 四份终判（Round 6 结论 · Round 7 并入；每条一行）＋目标 3（六项）

> ★ **R7 新增目标 3 终判**：**够强 —— vmu 框架足以实现 v5r 的全部功能**。原语面 **42 条 ⇒ 具备 41／部分 1／缺失 0**；唯一"部分"＝**F13**（未知名 fail-closed，与 v5r 的容错跳过**刻意相反且更安全**）；另有 5 处具名残余 ＋ 1 处性质等价保留（F33）。交付：`_handoff/vmu/10-goal3-final.md`（core task-54）。

### §9.5.1 ★ 搜索范围教训（两条旧判被"搜索方式"推翻，不是实现变化）

| 旧判 | **R7 真判** | 推翻原因（教训） |
|---|---|---|
| **F52** 活动等待器＝**缺失** | **具备** | 旧判是按"别人给的行号"（`control.js:133`）搜出来的；**真实现是 Round 3 才落地的 `kernel/activity.js`**（文件头即 "ONE-SHOT, FUTURE-ONLY … v5r C-56 / F52"，`:11-16` 语义、`:21-23` disposer 全分支＋`status().disposersCalled`）＋注册 `kernel/index.js:1170` ＋工具面 `host.js:137`（`vibe_vmu_wait`）／`:236` ＋装配 `createActivity({clock,log,settings,bus,activePeers})`。★ **教训：按"提示的行号"找原语会漏掉后落地的新模块，应按语义关键词全仓搜。** |
| **F53** fs 边界＝部分 | **具备** | R6 已在 `docs/03:100` **显式声明边界**（用户相对路径一律走 `under()`→`guardWrite`，越界具名拒；直连 `node:fs` 仅 5 处且都不是用户路径；规则＝只碰框架自己的或包内文件并注释写明）。**残余（当时）＝没有自动门禁** ⇒ **R7 由我落地**：`tests/audit-fs-purpose.test.mjs`（**10/0**，§9.6） |

**两代差异（v5r 有、vmu 无键／有意分歧；矩阵 pack 列如实单列，避免读成缺失）**：`compactThreshold:66`／`compactAfterRounds:8`（`:1078/1079`，无键）；`finalPaper/paperFormat/paperLanguage/paperCompilePdf`（`:1163-1166`，无键）；**`paperEditor:'academician'`**（`:1167`，而 `vmu.paper.finalizer` 值域只有 `['editor','contributor','any']`，`kernel/paper.js:69` ⇒ **不可声明**，会被静默回落——**这是一处应具名的差异**）；`maxTempPerMember:3`（`:1075`）／`memberMayRejectAssign:true`（`:1066`）；**`stallAutoMeetingMs:360000`**（`:1083`，**有意分歧**：v5r 静止即自动开会，vmu 的 `idleAction` 默认 `'notice'`＝只提示，R1）；`provider/model/toolAllow/toolDeny/staffPersona/tempTool*`（`:1176-1182`，**不是设置键**，走 spawn 接缝／`vmu.tools.faces`）。★ **R7 pack 保真落地 4 项**（vmu-pack task-55）：`vmu.turn.selfCheck` **false**（v5r `:1122`）、新增 `vmu.control.idleAfterMs` **120000**（`:1082`；读者 `kernel/control.js:65,206`）、`vmu.paper.maxRounds` **3**（`:229`）、**删除** `vmu.limits.maxLiveMembers`（v5r 的在活上限是 `maxLiveChildren:0`＝不设，`maxParallel:3` 是并发维度、框架已默认 3）。

| 目标 | **终判** | 依据（交付物）／我的复核 |
|---|---|---|
| **目标 1** 断点续跑 ＋ 人工干预 | **具备（★R7 收紧为 2 处具名小缺口）**——断点续跑：23 条里 18 条具备/超集、**2 条已闭合**（见下）、**1 条 N/A 有理由**（看门狗刷新：vmu 无持久在飞时钟）；人工干预：12 条里 10 条具备/超集、**1 条部分**（成员→所办收件箱聚合：通道有，主干由审批队列承担）、0 缺失 | `06-goal1-verdict.md`（reader-a task-44）＋ `resume-round7-report.md`（task-52）：**R7 闭合两项**——① **未 ack 邮件计数**：`ack()` 从 `boxes` 摘除（`kernel/mailbox.js:363`）⇒ 无端口时**直读耐久 `mailbox` 键**，计入 `status().inflight.unackedMail`（＋`unackedMailSource`），两者皆无 ⇒ **具名** `VMU_RESUME_MAILBOX_UNAVAILABLE` 且 `unackedMail=null`（**不是假 0**）；② **重派缺失成员**：`createResume({reassign:{maxAttempts,apply}})` 声明面（**不声明＝零机制**），尝试次数**耐久写进 `resume` 键**、跨重启生效 ⇒ `status().reassign` 可读。★我复跑 `vmu-resume-lock-and-marks` **67/0**、`vmu-human-gate` **75/0**、`vmu-resume-recovery` **73/0**。**剩余 2 处小缺口**：多实例注册表；watchdogs 装配（端口在、装配未接，如实自曝） |
| **目标 2** 会议／通信／协作 | **具备（★R7 收紧：G1／G5／G8 结清；G6 降级为"host 一行接线"）**——v5r **实现层 14/14**；设计层 42 条 ⇒ 具备 ≈26／部分 ≈11／缺 ≈5；**"支持 v5r 全部功能"＝是（有余量）、"支持设计文档全部功能"＝否**（v5r 自身也不满足） | `08-goal2-verdict.md`（reader-c task-46）＋ task-51：**G1 私聊补记到公开面＝具备**（`kernel/chat.js:424 supplement({of,by,why,publicRef})`／`:465 supplements()`／`:468 supplementOf(id)`，接缝 `:96 privateSender`；**正文永不搬运**（`body:'withheld'`）、`why` 必填、append-only、容量受已声明 `vmu.chat.historyCap` 约束；**无接缝 ⇒ `authorship:'claimed-unverified'` 自曝**）；**G5 会议级 mute＝"组合"非缺口**（`chat.mute`×会期成员清单，不新增第二份实现；越席 ⇒ `VMU_CHAT_MUTED`）；**G8 自我发信＝具备**（`mailbox.js:235/236/238` 两条路都拒；**复用已注册 `VMU_INVALID_ARGUMENT`＋`reason:'self-message'`**）；**G6＝形状已定**（`docs/08 §25.13 D`），改判条件＝core 在 `kernel/index.js` 注入**分配型 store**（`append(rec)→{ticket}`＋`readAll()`）⇒ F31 从"协议完备"变"端到端可用"。★我复跑 `vmu-meeting-parity` **167/0**、`vmu-chat` **79/0**、`vmu-mailbox` **48/0**；`audit-vmu-docs` **83/0**、`check-docs` **PASS** |
| **目标 4** pack 与清单一致性 | **一致**（125 行**无一行**"框架与 pack 都缺"；真缺口 **1 条子项**（M-A04 的 `vmu.paper.maxRounds`）＋**1 个孤儿键**（`vmu.meetings.reconsiderFloor`）） | `_handoff/vmu/09-goal4-verdict.md`（vmu-pack）；详见本文件 **§9.3**；★键名转述更正见 **§9.4** |
| **目标 5** 数学引擎深度 | **同级或超过 v5r**（四库专用适配面＋四库真机硬证据；**作业持久化/断点续算超过 v5r**；★ **R17 更正：原写的两处具名"部分"都已不成立**——① "Lean 面镜像未接线 `kernel/index.js:567`"：该行号今天已是 `onAudit:`（引用本身陈旧），而实测 `kernel/index.js:634-635` 把**宿主文件面**注入了 Lean 面（`fs: host && typeof host.readText === 'function' && typeof host.writeText === 'function' ? host : null` ⇒ 镜像真可用，且不可用时是**具名** `VMU_LEAN_JOBS_MIRROR_UNWIRED`）；② "F17 面层看不到 handle"：`spawnHandle` 实测已传 `createLeanFace`（`:634`）、`createMathJobs`（`:775`）、`createMathAdapters`（`:790`），且 `kernel/lean.js:409-410` 有 handle ⇒ 报 `terminated:true`、无 ⇒ 具名。⇒ **两处"部分"改判为已接线**；旧判据保留此行以便追溯） | `_handoff/vmu/07-goal5-verdict.md`（reader-b）★我复跑 `tests/vmu-job-cancel.test.mjs` **7/0**、`tests/vmu-lean-killable.test.mjs` **7/0**；并记录一处**真缺陷已修**：`running() > maxParallel` 在上限 1 时会跑 2 个 ⇒ 已改 `>=`（`kernel/mathjobs.js:525`） |

### §9.6 F53 的门禁化（Round 7 · B 项）

直到 R6，F53（"直接 `node:fs` 的模块必须声明用途"）**只有文档规则、没有门禁**（core 具名指出）。R7 落地 **`tests/audit-fs-purpose.test.mjs`**（**10/0 EXIT=0**，已登记 `files[]`）：
- **窄规则**：真实 `node:fs` 导入（**语句位置**，非注释/非数据字符串）⇒ 必须有 **`fs-purpose: <kind>`** 注释（允许三种：`guard` 守卫自身／`audit` 框架自己的审计锚点与日志／`self-audit` 包内只读自审），或落在**已登记的 pre-gate 消费者表**里（表内每条带 **kind ＋ 理由**，共 5 条：`kernel/guard.js[guard]`、`kernel/index.js[audit]`、`kernel/records.js[audit]`、`host-math.js[audit]`、`vibe-math-vmu.js[self-audit]`）。
- **不是"存在即通过"**：断言**导入者集合 == 登记表 ∪ 带注释者**（**集合相等**）＋**无过期登记** ⇒ 新模块不声明就红。
- **两处自探针**：① 注释里/数据字符串里的 `node:fs` **不算导入**（真实 ESM import 与 require 才算）；② 带 `fs-purpose:` 的能读出 kind，**裸导入读不出**（因此不能靠"存在"过关）。
- ★ **有牙的证明（我实测）**：往包内**种一个**裸导入文件 ⇒ 门禁 **EXIT=1**（两条断言同时点红：无用途声明 ＋ 集合不相等）；删掉 ⇒ **EXIT=0**。⇒ 这条门禁不是纸面规则。

**判定影响**：**零** —— 这些行的"等价承载/映射"结论不变（机制在框架侧，键名一直是真名那一个）；更正的是**转述**，不是覆盖。

---

## §9.7 R8 新增（Round 8 · task-59）

### 9.7.1 ★ F44「公告真的进入投递文本」＝**已闭合**（R7 的 3/6 → R8 补上正路）

R7 只证到"缝被消费"＋"失败具名"（3/6）；**正路未证**（当时递进去的 block 没进装配上下文）。R8 由我按**真实 turn 形状**补上：`createTurnOrchestrator(...).open({member, phase, statusBlock})` **构造** turn ⇒ `assemble(turn)` **产出投递文本**（`kernel/turn/index.js:316/336/396`；★ 只调 `open()` 会只测到构造器——**这正是 R7 那次的做法**）。
- 新套件 `tests/vmu-turn-notice-source.test.mjs` ⇒ **13 passed / 0 failed EXIT=0**：
  - **正路（状态块通道）**：外部 `noticeSource` 一行 ⇒ **投递文本里真的有它**，且**确实经过交给提示词管线的 `statusBlock`**（这是 R7 拿不到的那一环）；turn 自己的状态块仍在（**追加而非替换**）。
  - **一次性**：take-once 源在第二次装配**不再重复**公告（每次装配各问一次源）。
  - **pack 通道（`noticeBlock`）**：块收到两行、**前置**在文本最前，且**不再进入状态块**（与语料一致）。
  - **失败具名（回归保留）**：源抛错 ⇒ `VMU_ENGINE_UNAVAILABLE`（"notice source failed"），**不静默丢公告**；非数组/空白项被忽略且不崩。
⇒ F44 的目标六条**现全部有证据**（3/6 → **6/6**）。

### 9.7.2 ★ `vibe_vmu_set` 归属＝**已闭合**（R7 的"schema 只收 {key,value}"发现 → R8 修复）

新套件 `tests/vmu-set-attribution.test.mjs` ⇒ **15 passed / 0 failed EXIT=0**（在健康树上；见 §9.7.6 的临时状态）：
| # | 事实 | 证据/形状 |
|---|---|---|
| ① | **已发布 schema 接受 `by`/`reason`** | `parameters.properties.by`/`.reason` 存在；`additionalProperties:false`、`required:['key']`（仍严格） |
| ② | **`by` 非所有者 ⇒ 具名拒**，且**不入台账** | 工具**返回** `{ok:false, code:'VMU_NOT_PERMITTED'}`（含 `declared owner: role:chair`）；**resolved 值不变**、`runtimeWrites` **不增**；同一对参数走**内核 API 则 throw**（**一个契约、两种形状**） |
| ③ | **不给 `by` ⇒ office 路径 ＋ 明文披露** | `ownerCheck === 'exempted (no `by` given: office path, DISCLOSED)'`、`by:null`（**静默通道不存在**）；`source:'runtime'` |
| ④ | **`reason` 落台账** | `status().settings.lastRuntimeWrite = {key, by:null, reason, ownerCheck(DISCLOSED), action:'set', …}` |
| ＋ | **控制组**：声明所有者（`role:chair`）**可以**写（`ownerCheck:'identified'`）⇒ ② 不是"一律拒"；**委派路径**：列入 `vmu.safety.delegableKeys` 后非所有者可写 ⇒ `ownerCheck:'delegated'` |

### 9.7.3 ★ 真缺陷入册（owner＝core）→ **R8 内已修（两半都核过）**：`vmu.paper.finalizer` 域外值**静默回落**

- **缺陷**（我核过代码）：`settings/schema.js` 的 `vmu.paper.finalizer` 曾是 `type:'string'`（**无闭集**）；`kernel/paper.js:104-107` `const finalizer = FINALIZERS.indexOf(finalizerRaw) === -1 ? 'editor' : finalizerRaw`（`FINALIZERS = ['editor','contributor','any']`）⇒ 写 v5r 的 `'academician'`，**不报错、不告警**，静默按 `'editor'` 执行（实测 `finalize` 报 "only the editor (acad) may finalise"）。
- **为何不是"扩值域"**：v5r 的 `paperEditor` 是**机构角色**，本键是**权限规则** ⇒ 让内核认识角色名违反 D5。
- ✅ **修法（core task-58，两半我都核过）**：① **schema 改闭集** —— `settings/schema.js:997` `{ key:'vmu.paper.finalizer', type:'enum', domain:['editor','contributor','any'], … }`，doc 明写"**域外值 ⇒ 具名拒 `VMU_INVALID_ARGUMENT`（列出声明的域），绝不静默回落**"；② **模块具名拒** —— `kernel/paper.js:115-117` `throw refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.finalizer must be one of editor|contributor|any: ' + finalizerRaw, { enforced:['vmu.paper.finalizer'], declared: FINALIZERS, value: finalizerRaw })` ⇒ 连 **pack data 层**的域外值也拦得住。
- **测试锚点同步（core 改了我名下的 `tests/vmu-paper.test.mjs` §5，我已复核接受）**：原文断言"an unknown finaliser value **falls back to** editor"**锚定的正是被删的缺陷行为** ⇒ 已改成 `expectRejects(…, 'VMU_INVALID_ARGUMENT', …)`（`expectRejects` 是 **async/await** 形状）；且 hint 里一度出现的 v5r 机构角色名被该套件的 `forbidden` 列表**当场抓到**并改掉。★ 我复跑：`tests/vmu-paper.test.mjs` **37/0**、`tests/vmu-paper-consult.test.mjs` **40/0**（全 EXIT=0）。⇒ **"静默回落"这一类在本轮归零**（pack 侧值域探针亦 PASS）。

### 9.7.4 pack 保真 B1–B5（**全部无读者 ⇒ 一行默认值都没写**，具名）

| # | v5r 出处／值 | 处置 |
|---|---|---|
| B1 | `compactThreshold:66`／`compactAfterRounds:8`（`:1078/1079`） | **具名**；建议 `vmu.prompt.compactThreshold`／`compactAfterRounds` ＋ 上下文核算读点 |
| B2 | `finalPaper/paperFormat/paperLanguage/paperCompilePdf`（`:1163-1166`） | **具名**；建议 `vmu.paper.*` ＋ publication 读点 |
| B3 | `maxTempPerMember:3`（`:1075`） | **具名**；建议 `vmu.members.maxTempPerMember` ＋ members/recruit 读点 |
| B4 | `memberMayRejectAssign:true`（`:1066`） | **具名**；建议 `vmu.tasks.memberMayRejectAssign` ＋ assign 读点 |
| B5 | `stallAutoMeetingMs:360000`（`:1083`） | **有意分歧（R1）⇒ 不声明**；`idleAction` 域＝`['notice','recess','none']`（`control.js:204-220`）⇒ **结构上不能开会**，也**不许臆造 `'auto-meeting'`**（域外值同样静默回落）；改判条件＝core 加已登记钩子 `control/idle` |

### 9.7.5 activity 的 R8 两族 ＋ RULE E 复核

- `tests/vmu-doc-invariant-falsify.test.mjs` **9/0**：首次把 **docs 里的可执行承诺**变成可证伪守卫（`docs/07:502`「拿不到时是 null，不是假 0」↔ `kernel/resume.js:948`），探针**运行时读文档**作控制字段 ⇒ **文档被改软也会红**（doc↔code 抽查模板）。
- `tests/vmu-storepolicy-falsify.test.mjs` **9/0**：锁释放纪律（`storepolicy.js:172/179`）。
- **RULE E 复核（D 项）**：`audit-declaration-criterion` ⇒ **`current=67 = baseline=67`**（新增 0／消失 0；我已修掉 R7 我自己门禁那条双空比较，**未动基线**）。剩余唯一 FAIL 仍是 **`regen-all --check`**（Lead 的收尾 regen）。

### 9.7.6 R8 期间的主干临时状态（**已解决**）

R8 中途实测到 **`kernel/ballotbox.js:544` 抛 `ReferenceError: cast is not defined`**（该文件当时只有 `:186 const castBody`，return 仍引用旧名 `cast`）⇒ **凡 `createKernel` 的套件在构造期即崩**（不是断言红）。已**立即报 Lead 与 owner（reader-c）**；owner 确认为其 **G7 的中间态**（先抽 `castBody`、后补 `cast` 包装，两步之间被我的快照抓到），现已就位（`:242 const cast` ＋ `:563 return {…cast…}`）。
★ **我复跑确认（健康树）**：`vmu-set-attribution` **15/0**、`vmu-turn-notice-source` **13/0**、`vmu-ballotbox` **13/0**、`vmu-mailbox` **48/0**、`vmu-meeting-parity` **178/0**（全 EXIT=0）⇒ **§9.7.2 的 15/0 现为断裂后复跑的最终读数，该临时标记撤下。**（同类一并修掉的还有 `mailbox.js` 的 `o.durableQueue` 引用错误。）

### 9.7.7 ★ F2 正面半场（投递）＝**真机实测具备**（R8 第 7 次会话，三个独立角度）

- **装配/机制**：`overlay v5` 用 `!!js` 把 transport 写进框架行的 `config.deliver`（loader patch 是**替换** config ⇒ 报告声明与 transport **合成一份**）；dump 复核过`preset` 行不变。
- **① 回执（工具面）**：`report tick`（**L25/seq23**）⇒ `declared:1, fired:[{name:"artifacts-threshold", channel:"log", text:"【成果阈值】artifacts=9 已达阈值 5", **delivered:true**, refused:null, error:null}], **delivered:1, failures:0**, audit:{appended:true}, enforced:[11 键], fired_keys:['vmu.report.enabled','vmu.report.reports']` —— **`refused` 由 R7 的 `VMU_REPORT_NO_TRANSPORT` 变为 `null`**。
- **② 服务 stdout（我方独立旁证，不在 assistant 的 harness 里）**：我的实例 stdout 打出
  `[vmu-report-sink] {"name":"artifacts-threshold","to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}` ⇒ **真 sink 真的被调用**（非空操作）。
- **③ 模型自述 ＋ 回合**：末段自述该报告 `delivered:true, drives:false`；**`turn/end` seq48 = `completed`**（第 7 次会话也是真 PASS）。
- **顺带（B 项的真机交叉印证）**：同会话 `vibe_vmu_set` 回执出现 **`"by":"office"`, `"reason":"scripted slice"`, `"ownerCheck":"identified"`** ⇒ R8 新 schema 的 `by`/`reason` **在真机上真的被用上了**（R7 时模型还报告"schema 只收 {key,value}"）。
- 发布清单仍 **78／52**（`request/header` seq11）。
- **可复制的配方**（**只打 overlay 行**；报告声明与 transport **必须合成一份 patch**，因为 loader patch 是**替换** config）：
  ```yaml
  - id: vibe-math-vmu-overlay
    config:
      overlayFor: vibe-math-vmu
      rows:
        vibe-math-vmu:
          deliver: !!js '(report) => console.log("[vmu-report-sink] " + JSON.stringify({name:report.name,to:report.to,channel:report.channel,text:report.text,drives:report.drives}))'
          vmu: { tools:{faces:['*']}, packs:{active:['v5r']}, report:{ enabled:true, minIntervalMs:0,
                 reports:[{name:'artifacts-threshold',trigger:{kind:'threshold',metric:'artifacts',op:'gte',value:5},channel:'log',template:'【成果阈值】…'}] } }
  ```
- ★ **三条边界（必须分开记，别混）**：① **"声明式 transport 名由 pack/宿主解析"＝不存在**（唯一来源是 `config.deliver`；入口 `vibe-math-vmu.js:470-474` 明写**故意不从 `ctx.get('subagents')` 猜**）；② **overlay 携带 scope-free 函数（`console`/`fetch`）＝已验证**（`!!js` 在 **overlay 行自己的 realm** 求值）；③ **服务型 transport（需 `ctx`／inbox／subagents）＝未验证且不建议在 overlay 里试 ⇒ 仍须宿主代码注入**（例：`deliver: (report) => ctx.get('subagents').sendMessage({…})`）。
- **本轮人设措辞更新**：模型说 *"not a voting member; I don't vote."* ⇒ assistant 的正则由 `not vote` 扩为 `(do not|don'?t|does not|doesn'?t|not)\s+vote`，其**离线复评** `--session 8c105c47… --expect-delivery` ⇒ **16/0 exit=0**。

### 9.7.8 已落但**尚无套件级断言**（owner＝reader-c；**如实登记，不写成已验证**）

- **B①** `agendaClose`／`agendaItems`
- **G7** `ballotbox.cast`／`mailbox.send` 接 `durableQueue`

⇒ 两者**实现已落地**（并已修掉各自的崩坏），但**当时预算用于修崩坏**，**未加套件级断言**；owner 计划下一轮补 parity §21（B① 6 条 ＋ G7 4 条）。**本矩阵在补齐断言前不把它们记为"具备"。**

### 9.7.9 目标 5 端到端演练（reader-b task-63）＝**通过**，并抓出/修掉**两个真缺陷**

- **演练**：`ALL ASSERTIONS PASSED (spawns=20, mirrors=13)` EXIT=0。**B** 四库真机（numpy 1500² matmul／scipy `expm(260²)`／pandas 300 万行 groupby／sympy 6 个符号积分）`live kind/elementKind` ≡ **耐久作业信封**（含 **array/symbolic**）且 exit=0；**A1** `cancel` 中途取消（**子进程确已死亡**、镜像 `cancelled`、**0 重跑**）；**A2** SIGKILL 内核进程 ⇒ 新实例走 **`interrupted-then-requeued`** 分支**真跑到 settled**（attempts=2、spawns+1）；**A3** 同批镜像给全新实例 ⇒ **采纳 8**、`requeued=0`、**0 spawn**；**A4** 两实例竞同一 jobId ⇒ 一赢一 `VMU_MATH_JOB_ID_TAKEN`。状态全集＝计算面七态／Lean 面六态。
- ★ **两个真缺陷（我核过代码＋复跑回归）**：① **取消被"后写者"改写**（被杀子进程的 `close` 让执行路径把 `cancelled` 改回 `settled`/`failed`）⇒ 执行路径**先判取消**、`cancelled`（及 `interrupted+cancelled`）**粘住**，回执 `VMU_JOB_CANCELLED`（`kernel/mathjobs.js:528/560/567/724`）；★ **R6 的取消测试看不见它**——那套测试的假句柄 `done` **永不结算**。② **信号死亡被当成成功**（`exitCode === null`（SIGKILL）时旧码 `Number(null) === 0` ⇒ 记 settled/exit 0）⇒ 现记 **`failed`** ＋具名拒 **`VMU_MATH_HARNESS_FAILED`**（`mathjobs.js:618-629`，消息含 **`signal`**），回执新增 **`signal`** 字段（`:186`）。回归：`tests/vmu-job-cancel.test.mjs` ★我复跑 **9/0**（+2）、`vmu-mathjobs` **10/0**。
- **未证明（具名）**：跨机崩溃未验（同机同 fs）；分支 ①/③ 未在端到端命中（单测覆盖）；**孤儿进程是宿主边界**（服务被 SIGKILL 时 OS 不保证）；Lean 面未做"杀内核"演练；**"续算"＝重跑整段**（非中间检查点，未实现未声称）；同号**后续覆写**仍 last-writer-wins（A4 只证占号）。
- **方法论（值得记）**：其第一版"粘住"守卫误用 `r.stdout` 而 `const r = out || {}` 在同块更后 ⇒ **TDZ `ReferenceError` 被 catch 吞成 `failed`**（症状像"守卫没生效"）⇒ **症状 ≠ 根因**；改成 `out && out.stdout` 后通过。

### 9.7.10 目标 1 端到端钻取（reader-a task-62）＝**通过，且经变异复验"真的会咬人"**

- **钻取**：`tests/vmu-resume-e2e.test.mjs`（**90 断言**＝R9 **81**（52 ＋ §⑦ 11 ＋ §⑧ 12 ＋ §⑨ 6）＋ R10 **§⑩ 9 条**（`12a`–`12i`：**真入口** `vibe-math-vmu.js apply` 起**两个内核实例**读**同一个真 store root**，K1 `shutdown()` → raw `createStore` 读文件 → K2 再起内核）⇒ ★我复跑 **90 passed / 0 failed EXIT=0**。
- ★★ **变异复验（两个锚点我都独立做，并带回滚证明；`resume.js` sha256 `230412F8A423EA62…` 全程未变）**：
  - **锚点 A（journal 序列续接，`:181`）**：`seq = Math.max(seq, natural(this.seq, 0)) + 1` → `seq += 1` ⇒ **EXIT=1、61 passed / 2 failed**，红的 **`7a`**（`VMU_RESUME_PROJECTION_GAP`，`unhydrated` 含 `tasks`）与 **`7e`**（`{"tasks":0,"queue":3}`）；**§⑦ 的 11 条照旧全绿**（它不走"重启后追加"这条路）⇒ 与我在 §⑦ 之前的 **50/2** 读数**恰好差 11 条**，两版互证。
  - **锚点 B（水合顺序，`:596`，对应 bug #2）**：把 `wanted` 的两组对调（journal 在前）⇒ **EXIT=1、61 passed / 2 failed**，红的 **`7a`**（`unhydrated: tasks`，`code: **VMU_HUMAN_APPROVAL_PENDING**`）与 **`7e`**（`{"tasks":0,"queue":**1**}` —— **凭空多出一个请求**，正是"看起来恢复了"的指纹）⇒ **bug #2 也能被具名咬住**（此前只是"采信改前读数"，现为**独立复验**）。
  - ★ 护栏：**锚点唯一性断言**（两锚点各只出现 1 次才动）＋ `finally` 还原 ＋ 还原后**哈希比对**（两次都 `true`），还原后均复跑 **63/0**。
- **§⑦ 正对照（reader-c 点名）**：mailbox 绑**真的** `createDurableCommitLog`（`kernel/ballot.js` 协议）＋假宿主 `append/readAll` ⇒ 两条投影契约照旧：**CONTRACT 1**（state 面自动写穿，`9f/9g`）与 **CONTRACT 2**（journal 必须显式 flush，`9h/9i`）**均未变**；`9j/9k` 证明**"提交耐久 ≠ 投递/正文状态耐久"**（重启后 1 封未读来自 **state 投影**，而同一时刻提交日志已 **settled**）。★ reader-a **未动 `kernel/mailbox.js` 一个字节**（`durableQueue` 形参由 reader-c 补）。
- ★ **§⑦ 的两条新增边界（不写成已验证）**：① §⑦ 的宿主 store 是**内存假实现** ⇒ **跨进程 ticket 未验**；② "未绑定耐用日志 ⇒ `status()` 自曝"是 **reader-c 的 Round 9 项**，本钻取**不断言该字段**。
- **本轮修的 4 个真 bug**（其报告 §3 有改前读数）：① **journal 序列不续接**（重启后再写一条命令 ⇒ 整本 journal 被判有洞、不可重放）；② **`hydrate()` 顺序**（先 state 后 journal；否则重放把命令执行到空机构上、副作用**写穿覆盖未恢复的快照** ⇒ `restored:[]` 的"**假恢复**"）；③ **空种子数组 `[]` 被读成投影缺口**（全新 store 首次 `recover()` 即 `ok:false`）；④ **`human.gate()` 内部路径绕过投影**（待批请求重启后消失）。
- ★ **具名缺口（未做，不写成"已验证"）**：**`kernel/index.js` 退出路径不 flush journal** —— ★我复核：`resume.snapshot` 在 `kernel/index.js` **命中 0**。钻取用 `2i`（重启前该键仍是 `[]` 种子）与 `2j`（flush 后才成立）**把两半都做出来并各留断言**；原因是**写穿是异步文件 I/O，"退出"必须显式等落地**。
- **边界（其 `12-goal1-e2e.md` §4）**：无宿主/无真 spawn（重派是记录回调）；三次 boot 同进程模拟；注入时钟无真定时器；`chat` 未走（inject 走 mailbox 路径）；watchdogs N/A；多实例注册表与 v5r `meetingOpen` 等价物仍缺。
- **别记在目标 1 头上的红（我复核过归因）**：`tests/vmu-wiring-index.test.mjs` **RED（28 passed / 3 failed）**＝`docs/00-README.md` **生成块 stale**（表内 `1220` vs 实测派生 **1219**）；因 **`vmu.meetings.leaveApprover`**（core 的 B②）新增 ⇒ 属**生成器产物待刷**，由 Lead 跑 `node scripts/generate-wiring-index.mjs --write`；`generate-vmu-settings-table.mjs --check` **clean**。

### 9.7.11 `commitStore` e2e 落盘（R9 · task-67 A）⇒ **19 passed / 0 failed EXIT=0**

`tests/vmu-commit-store-e2e.test.mjs`（**core 的 §6.5 探针为唯一来源**，14 条**原样**搬进仓；已登记 `files[]`）：
- **① 两内核共用一份 store（4）**：两进程 `gate.durable===true`；两边**未完成意图**落进**同一份**日志（`≥2`）；票号**恰好 1 然后 2**（互异且单调）。
- **② 意图/生效之间崩（6）**：`reserve()` 先落**意图**且 `ticket===1`；崩后**恰好一条未完成**；新进程 `recover()` 见到**恰好一条** `pending`；**再问一次仍是一条**（幂等）；`complete()` 后**不再重放**；**结果行与意图行同号**。
- **③ 无 store（2）**：`gate.durable===false`（具名）；`status().seams.commitStore===false` 且 `commitStoreNote` 命中 `/no allocating store/`。
- **④ 开机后挂载（2）**：挂载前 `false`；挂载后**下一个** ballot `true` ⇒ **调用时解析**，非构造时快照。
- ★ **新增 3 条负向**：`commitStore` 解析**抛错** ⇒ `gate.durable===false` ＋ **`history` 里记 `commit-store-failed` / `VMU_COMMIT_STORE_FAILED`** ＋ **保留 resolver 自己的 message**（不丢因）。
- ★ **新增 2 条契约反例**：一个**不保留显式 ticket** 的 store ⇒ `complete()` 的结果落到**另一个号**、意图**永远 pending** ⇒ 把"**`append` 必须保留显式 ticket**"这条契约做成了**可观测的反例**（而不是只写在文档里）。
- **RULE E**：集合形状的断言都加了**非空前置**（`tickets.length > 0 && …`、`store.readAll().length > 0 && …`），避免空集合空过。

### 9.7.12 F52 activity 语义 ＝ **已由既有族覆盖，本轮未重复造断言**（按 Lead 指示先查覆盖）

- `tests/vmu-activity-falsify.test.mjs`（FAMILY 8，★我复跑 **10/0**）：**FUTURE-ONLY**（等待期之前的通知永不唤醒）／**ONE-SHOT**（唤醒后注销，第二次通知不再唤醒）／**DISPOSER**（唤醒分支的 timer disposer **恰跑一次**）——三性质各有单点变异与判据。
- `tests/vmu-activity-kernel.test.mjs`（★**141/0**）显式覆盖**disposer 全分支**：`:9` 头注"the timeout disposer runs on **SUCCESS, TIMEOUT and ABORT, and nowhere twice**"，断言含 `:87` 超时分支恰一次、`:98` 成功分支恰一次、`:115` 每个 waiter 恰一次、`:128` 四个全注销且 disposer 共 4 次。
- `tests/vmu-activity-falsify-lib.test.mjs`（★**27/0**）用**共享库**复核同一性质（"future-only is load-bearing"）；`tests/vmu-activity-timers.test.mjs`（★**36/0**）。
⇒ **结论：F52 语义＝具备**，证据在既有族；**我未新增重复断言**（重复造族只会增加维护面，不增加证据）。

### 9.7.13 pack 值域门禁常态化（R9 · vmu-pack task-68）＋ 首日抓到的**第二个真实例**

- `scripts/audit-pack-value-domain.mjs`（D-05，已登记；仓库外那份已删）⇒ ★我复跑 **5/0**（`--selftest` **3/0**）：静态比对**真模块**声明的值 ↔ `settings/schema.js` 的 108 个 enum 域；**§2 实测**给 `vmu.paper.finalizer` 注入域外值走**真面** `createPaper().start()` ⇒ 必须**具名拒**（静默降级即红）；**§3 自探针**＝种下的域外值**必须被检查器报红**（否则门禁空洞）。
- ★ **它上岗首日抓到第二个真实例（已修）**：`packs/v3-core/index.js` 曾声明 `'vmu.meetings.quorumRule': 'majority'`，而域是 `['m-unanimous','all-unanimous']` ⇒ **域外**；后果＝`vibe_vmu_set` 会拒它、但 **pack 值绕过边界**，且该键经 `kernel/index.js:1401` 传给 `createBallot` 后，默认 tally 只当**上下文标签**记录（**不按 majority 聚合**）⇒ **声明做不到它写的事**。已改 `'m-unanimous'`；**真多数聚合＝R1 的可插拔谓词**（需 pack 注入 `createBallot` 的 `tally` 接缝）⇒ 具名登记为改判条件。
- **RULE A 执行点**（我补）：新脚本的 `--selftest` 原先**无人真跑**（正是该规则存在的理由）⇒ 已在 `tests/audit-declaration-criterion.test.mjs` 的 RULE A 段加执行点并断言绿（`=== PACK VALUE-DOMAIN: 3 passed, 0 failed`）⇒ criterion 由 70/5 → **73/3**（余 2 条＝Lead 的 `regen-all --check` 与 **RULE F**，见 §9.7.14）。
- **B1–B4（8 键）与 `control/idle` 均未落**（vmu-pack 与 core 一致）：★我复核 8 键在 `settings/schema.js` **命中 0**、`control/idle` 在 `kernel/bus.js` **命中 0**。★ **Lead 已在 `task-66` 明确授权 vmu-core 连读者一起改**（`kernel/metrics.js|prompt`、`publication.js`、`members.js|recruit.js`、`tasks.js`）＋落 `control/idle` 钩子 ⇒ **这不是待裁项，而是等 core 落地**；落地后我按 **task-67 D** 复核（**每键真读者** ＋ **钩子已登记且分类**）并更新本行。**在 core 落地前不记为具备。**

### 9.7.14 ★ 新红（不是我的，需 owner）：RULE F 的 `toMs` 未处理不可解释时刻

`tests/audit-declaration-criterion.test.mjs` ⇒ **RULE F**：**`kernel/resume.js:599` 与 `:611` 调用 `toMs(...)` 未处理 `NaN`**（建议 `Number.isFinite(...)` 或改 `msStrict`）。**owner＝`resume.js` 的 reader-a**；我未改他人文件。**RULE E 指纹保持 `current=67 = baseline=67`** ✓（我另补了 `audit-pack-value-domain --selftest` 的执行点，属 RULE A）。★ **R9 内已修**（reader-a 用 `msStrict` 经 `readClock()`：不可解释时钟 ⇒ `waitedMs:null` ＋ `clockNote` 具名原因，**绝不传播 NaN**）⇒ criterion 现 **75/1**，唯一 FAIL＝Lead 的 `regen-all --check`。

---

## §9.8 R10 新增（Round 9 的缺陷账 ＋ Round 10 的门禁形状）

### 9.8.1 ★ Round 9 的 **7 个真缺陷**（全部**已修**，括号内为发现方式）

| # | 缺陷 | 症状与修法 |
|---|---|---|
| 1 | **`methodsOf` 未写穿** | `kernel/index.js:941` 的 `methodsOf = { tasks: […], work: [] }` ⇒ `members/meetings/ballotbox/budget/chat/panel/minutes` **一个方法都没被包裹** ⇒ 声明为投影却**从未被写过**（钻取实测：两个会开完 `settle()` 后耐久 `meetings` 键**仍是 `[]` 种子**；**退出 flush 也救不了**，state 键按契约进 `skipped[]`）。修法：`state` 面反转为"**包所有方法除只读集**"，`status().projections.wrappedMethods/readOnly` 可读（探针 **14/0**）。★ 这也把 R6 的"多实例注册表未做"**改判**为"机制不需要（集合面自带 `snapshot/restore`），缺的是 `methodsOf`" |
| 2 | **`store.js` 白名单缺 `ballotbox`/`minutes`** | 投影适配表**声明**这两个面，而 `PUBLIC_KEYS` 没有 ⇒ **部署一声明就 `recover()` 崩**（`undeclared durable key`）。★ 这是"**声明了但会崩**"，比"声明了没生效"更严重。修法：`PUBLIC_KEYS` ＋ `NULL_SEEDED` |
| 3 | **Lean 崩溃续算实际是坏的** | `lean.js` 的 `runOne` **先写 `running` 镜像、后读哈希** ⇒ 磁盘 `hashBefore:null` ⇒ 崩溃后内容比对**恒不匹配** ⇒ **恒走分支③**（`interrupted-no-rerun`）。修法：**先读哈希、再写镜像**。（计算面看不出——它的恢复依据是**请求指纹**，argv/stdin/seed 一直在镜像里） |
| 4 | **同号覆写 last-writer-wins** | `writeTextExclusive` 只保护每个 jobId 的**第一次**写 ⇒ 伪造 `running` 镜像 ＋ 两实例同时 `recover()` ⇒ **同一作业跑两次**（实测 `distinct pids: 3`）。修法＝**恢复租约**（`takeLease/releaseLease`，TTL＝`max(120s, 预算+30s)`；未过期 ⇒ 具名 `lease-held`；陈旧可抢；恢复完释放）⇒ **3 pids → 2 pids**（1 原始 ＋ 恰 1 次恢复），另一个 `lease-held`（`enforced:true`）。**边界**：非共识锁（TTL 是时钟猜测；无 `writeTextExclusive` ⇒ 具名 `unenforced`），恢复者自身崩溃仍"至少一次" |
| 5 | **`fired ⊄ enforced`**（`vmu.store.tmpDir`） | `storepolicy.write()` 回执 `fired` 含该键而 `enforced` 不含（违反面文件头／`docs/02:294`／`docs/11:466`）。★ **我先独立复现**，随后实测**已修**（`enforced` 含该键、`missing=[]`）；**并且我堵掉了既有门禁对该分支的空过**（receipts 列表原从不声明 `tmpDir`）⇒ `vmu-storepolicy` **11/0** 且该分支非空过覆盖。vmu-activity 侧把它翻成**守卫＋第 5 个回归变异**（`doc-invariant2-falsify` **16/0**） |
| 6 | **`lean.js` 绕过注入时钟** | `lean.js:137` 的 `waitForJob` 用 `setTimeout(r,50)`（4000 次，上限 ≈200 s）⇒ F15 报 `unclassified:['kernel/lean.js']`。★ 修法选了**更强的一种**：不是"加分类行并注明绕了时钟"，而是**注入接缝**（`kernel/mathjobs.js` 新导出唯一默认 seam `defaultTimer`；`lean.js` 改用 `sleepMs`）⇒ `lean.js` 的 `setTimeout(` 站点 **1 → 0**、`unclassified` 为空 ⇒ `vmu-activity-timers` **36/0** |
| 7 | **E-17 观测量无差异** | 见 §9.7.14 与 `docs/11 §4.2` 第六条：观测 `quorumRule`（两包同值）⇒ `!==` 永不成立；且它当年"能区分"只靠 v3-core 的**域外值**。修法：改观测 `verdictMaxRounds`（5 / 3）⇒ `vmu-entry` **150/0** |

### 9.8.2 退出冲刷 ＋ G7 共享队列（core task-66）

- **退出冲刷＝两件事不是一个**：`state` 面**自动写穿**（等 `settle`）vs `journal` **必须显式 flush**（`flushAll`）；`shutdown().ok` 是二者的**与**；**"写前必读"约束同样管辖退出**（从未成功读过 ⇒ `flushAll()` **具名拒** `VMU_RESUME_WRITE_BEFORE_READ`、`failed[0].key===null`、**不谎报已刷**）——★ 我先前把这条 stdout 噪声报给 core，core 确认**有意**并做成具名断言（`exit-flush` 探针 **27/0**）＋写进 `docs/03 §2`。选 (a) 不选 (b) 的理由：**退出路径悄悄补一次读会抹掉"这个进程从没建立过基准"这一事实**。
- **G7 共享队列**：`vmu.commitlog`（`sharedCommitLog`）成为 board ＋ mailbox **共用的一份**提交日志（探针 **17/0**）；★ 名字从 camelCase 的 `vmu.sharedCommitLog` 改成 **`vmu.commitlog`**——原因是 `audit-vmu-services` 的 registry 扫描正则**看不见 camelCase**，会静默逃过该门四项检查中的三项。**我按 Lead 要求把该门改成"从 registry 取全名"＋按 `kind` 排除工具＋双向自探针**（§9.7 同族教训，见 `docs/11 §4.2` 第七条）：**49/0**。

### 9.8.3 `resume.js` 拆分（**三块**；含一处我自己的搜索范围失误）

- **我的实测（本轮）**：`kernel/resume.js` **1179 行** ＋ `kernel/resumeflush.js` **150 行**（退出契约 `createExitContract`）＋ `kernel/contentvalue.js` **50 行**（值标识原语 `stableStringify`/`contentDigest`/`clone`/`idSuffix`）。
- **Lead 的独立实测（同轮，略有出入）**：**1125 / 141 / 44** ⇒ **两版并存记录**；差异来自 reader-a 收尾时的连续微调（**不以任一版掩盖另一版**）。
- **登记（我核）**：`contentvalue.js` 已在 `package.json files[]`（1 命中）＋ `installer.js`（1）＋ zero-mechanism 矩阵（2 命中）✓；**消费者**＝`resume.js:47` import ＋ `:48` re-export ✓。
- ★ **我上一版的失误与诊断（如实记）**：我先写"只找到两块、第三块未找到"——**根因是搜索范围**：我用了 `-Filter 'resume*'`，**按文件名前缀搜**，而 `contentvalue.js` 名字里没有 `resume` ⇒ **它从未进入结果**。这与 R7 的 **F52 教训同族**（按提示的行号/名字找会漏掉后落地的新模块 ⇒ 应按语义关键词全仓搜）。**"不臆测"是对的，但"搜不到"必须与"不存在"分开说**——我当时把前者写成了后者。

### 9.8.4 ★ R10 修的门禁形状：依赖环门禁"**注释当 import**"（A 主项）

- **缺陷**：`tests/audit-dependency-cycles.test.mjs` 直接对**原文**跑 `(?:import|export)[^'"\n]*from '…'` ⇒ `resume.js` **注释里**为解释一个摘要助手而写的 `import { contentDigest } from './resume.js'` 被当成真 import ⇒ 报**自环**；当时的修法是**改写注释**——**门禁在指挥文档措辞**。（我接手时该门**已绿**，因为注释被改了 ⇒ **症状被藏起来、判据没修**。）
- **修法**（与 `audit-package-membership` 同一做法）：**先去注释**（`tests/_lib/strip-comments.mjs`）**再要求语句位置**（`^[ \t]*(?:import|export)\b[^;]*?from '…'` ＋ 副作用导入），导出 `relativeImportsOf()` 供 `graphOf()` 使用。
- **双向自探针（新）**：注释（行/块）与**数据字符串**里的 import 形状 ⇒ **不计入**；而**四种真拼法**（单行／**多行**／副作用／**re-export**）⇒ **必须找到**；并**断言旧模式确实数了注释形状**（证明修的是**活盲点**而非假想）。
- ★ **附带收获**：改判据后同树的内部边 **245 → 246** —— 旧模式连**多行 import** 都看不见（`[^'"\n]*` 不跨行），所以这次**既去掉假边、又补回一条真边**。⇒ 该门 **8/0 EXIT=0**（168 文件 / 246 边 / 0 环）。教训已写进 `docs/11 §4.2` **第七条**。

### 9.9 ★ 第一次"**用这套框架真的做一道数学题**"的端到端剧本（reader-b task-79）＝**18/18 步走通**

**剧本**（自选真小题）：`Σ_{k=1..n} k³ = (n(n+1)/2)²` ＋ 连续类比 `∫₀^a x³ dx = a⁴/4` ＋ 高斯积分 `∫₀^∞ e^{-x²} dx = √π/2`。真机：Python 3.12.10（numpy 2.5.3／scipy 1.18.1／sympy 1.14.0）＋ Lean 4.34.0。`=== R10 DONE: 18/18 steps walked (spawns=5) ===` **EXIT=0**。
**逐步证据（节选）**：`tasks` 链 `t-1→t-2(deps:[t-1])→t-3(deps:[t-2])` 且**依赖门禁真的拒**（`VMU_STATE :: unmet dependencies for t-3: t-2`）、`assigned→doing→done` 全走；`mathjobs`·numpy `S(2000)=rhs=4004001000000 equal:true`（含 `inFp/outFp` 指纹、镜像 `settled`）／scipy `absErr≤3.55e-15`、`kind:"array"`＋`elementKind:"mapping"`／sympy 闭式 `n²(n+1)²/4`、`difference:"0"`、`gauss=√π/2`；`lean` `4*S 10 = 10²·11²` 由 **`by decide`** 通过 ⇒ `settled/passed:true/hashUnchanged:true`；**`formal`（一般命题）⇒ 具名拒 `VMU_FORMAL_SORRY_FOUND`（"检出 sorry（1 处）：1:61"）**（★我核：`kernel/formal.js:128` 确实**点名行/列**，默认拒、显式 `allowSorry` 才放行且自曝）；`records` 同内容再写 ⇒ 同 id ＋ `deduplicated:true`；`resume` 会话投影 `entries 4 → envelope(seq 4) → adopt ⇒ restoredEntries 4, replayable:true`；**`paper` 真起稿**（`paper-1`、`sections:1`、`outstanding:[{name:"Result",owner:"reader-b"}]`）。
**★ 中途重启（真机 SIGKILL）**：另一内核持 `res-heavy`（sympy 8 积分）⇒ **SIGKILL 该进程** ⇒ 镜像仍 `running/attempts=1` ⇒ 新实例 `recover()` ⇒ **分支② `{action:"interrupted-then-requeued", attempts:2, lease:"acquired"}`** ⇒ `final {settled, attempts:2, exitCode:0, kind:"array", elementKind:"symbolic", first:"sqrt(pi)*exp(-1/4)/2"}`；`recoveryLease:"enforced-by-exclusive-create (TTL = max(120000ms, job budget + 30s); stale leases are stolen)"`、`leases{acquired:1,…}` ⇒ **R9 的租约在真机端到端里也生效**。
**★ 没证明的（其 §4 逐条具名；我原样记，不放大）**：① **多智能体协作未走**——全程**单智能体**，无第二成员／投票／会议／委托／并发写者 ⇒ **用户用途里最相关、也是本剧本唯一最大的空缺**；② **真中间检查点未做**（续算＝整段重跑，令牌只"携带"）；③ **一般定理形式化未证**（只机器检查 n=10 实例；自写递归 `S` ≠ `Finset.sum`；Mathlib 不在本机 ⇒ 具名拒）；④ `mathadapters` 面未走（R7 另证）；⑤ `paper` 只走 `start`（未走 contribute/revise/finalize/consult）；⑥ 跨机/持久卷未验。
**我的复核**：其回归读数我**独立复跑全绿**——`vmu-mathjobs-persist` **21/0**、`vmu-lean-jobs` **13/0**、`vmu-activity-timers` **36/0**、`audit-vmu-orphan-methods` **4/0**、`check-docs` **PASS**；`VMU_FORMAL_SORRY_FOUND` 的 file:line 我核过 ✓。★ 他**未改任何 kernel/docs 文件**（只新增两份 handoff ＋ 已删的临时脚本），与"红线：共享模块一字未动"一致。

### 9.10 task-75 C 的复核结果（**部分可复核**：8 键 ✅ ／ `control/idle` ❌）

**① B1–B4 八键：★我实测 schema 8/8 已声明 ＋ 真读者（我对关键读者 spot-check）**：
| 键 | 值（v5r 出处） | 真读者（我核过标 ★） |
|---|---|---|
| `vmu.prompt.compactThreshold` / `compactAfterRounds` | 66／8（`:1078/1079`） | ★`kernel/prompt/index.js:121`（读 `vmu.prompt.compactThreshold`；`:100` 注释给出公式） |
| `vmu.paper.finalPaper/format/language/compilePdf` | true／'both'／'zh'／true（`:1163-1166`） | `kernel/paper.js:58-61`＋`:164-177` |
| `vmu.members.maxTempPerMember` | 3（`:1075`） | ★`kernel/recruit.js:52`（＋`:173` 的 R10/task-74 注释） |
| `vmu.tasks.memberMayRejectAssign` | true（`:1066`） | `kernel/tasks.js:111`＋`kernel/index.js:667` |

★ **分类口径（按 Lead R7 裁决，与 `vmu.math.maxParallel` 同类）**：这 8 键记作 **"复述默认（schema 默认值本身就是从 v5r 抄的），非保真证据"**——**不要把"值等于 v5r"当成"我们证明了保真"**；要算保真证据的是**pack 真声明的键**（§9.3/§9.8）。
★ **一处刻意更严 ⇒ 标为「分歧（安全侧）」**：`memberMayRejectAssign=false` 时 **vmu 具名拒**，而 v5r **静默忽略该字段**（schema doc 明写）⇒ 记"**分歧（安全侧）**"，不是缺口。
**② `control/idle`：★我实测仍未登记**（`grep 'control/idle' kernel/bus.js` ＝ **0**），且 **`idleState()` 在 `control.js` 之外 0 个调用者** ⇒ **"钩子已登记且分类"与"有真生产者"两项仍无可复核对象** ⇒ **不记为具备**。vmu-pack 已备好**纯函数 `stallDecision()`**（阈值不硬编码：`3 × vmu.control.idleAfterMs` ＝ 360000，v5r `:1082/1083`）＋ M2 条目 `{id:'v5r.stall-meeting', kind:'module', on:'control/idle'}`，**钩子一落即可接**；`stallAutoMeetingMs` 继续**具名保留**（未登记钩子 ⇒ `loader` 具名拒，先声明会把 pack 弄坏）。
**③ 非我红（指向 core 的收尾 regen）**：`vmu-settings` `[1220 vs 1228]` 与 `vmu-planned-settings` 的 `docs/04 mirror [1107/1115]` ⇒ **`docs/04 §11` 生成表 STALE**（core 新落 8 键后未重生成）⇒ 归 **Lead 的 `regen-all`**。

### 9.11 R10 收尾：钻取 90/0 ＋ 两个真缺陷 ＋ 归因

**① 钻取升级为 90/0（我复跑）**：§⑩ 把**退出缝**从"源码探针"升级为**行为断言**（`12d`：`shutdown().ok===true`、`pendingWrites===0` —— 这**取代** R9 §⑧ `10l` 的边界），并证明**多实例跨实例恢复在真装配上成立**（`12h`：K2 里两个会都在；`12i`：`meetings:state:true`、`unhydrated=[]`）⇒ ★ **R6 的"多实例注册表"缺口按此关闭**（集合面本身就是注册表，缺的只是 `methodsOf`，core 已反转默认；`12b` 实测 `meetings` 的包裹方法非空）。
**② 本轮两个真缺陷**：
- ✅ **已修（reader-a 写域）**：`budget` 的**空对象种子**让**真装配每次启动**都 `recover().ok===false`、`unhydrated:[{key:'budget',…}]`（R8"空数组＝首跑"的**姊妹形**）。修法：`hydrate()` 的 `emptySeed` 判据加入**空对象**（具名 `seeded:'empty-object'`；**有键的对象仍是具名缺口**）。变异验证（真跑＋sha256）⇒ 89/1 → 还原 ⇒ **90/0**。
- ⚠️ **未修（出 reader-a 写域，已报 core）：投影面名 `ballots` vs 适配表键 `ballotbox`** ⇒ **票箱从未被投影**。★ **我独立复核并定位到两侧**：`packs/v5r/settings/defaults.json:27`（pre-split `defaults.js:82`）声明 `'vmu.resume.projections': ['members','tasks','meetings','ballots','budget',…]`，而 `kernel/index.js:883` 的适配表键是 **`ballotbox`** ⇒ `notAttached:[{face:'ballots'}]`，`12f` 实测"开两个真票箱、`shutdown()` 后耐久键仍是种子"。⇒ **✅ R10 内已修（pack 侧）＋我复核**：`defaults.json:27`（pre-split `defaults.js:91`）现为 **`ballotbox`**（Lead 裁决"**一个键一个语义**"）；core 的**具名容忍**保留（`PROJECTION_ALIASES`，我核到 3 处命中，经 `status().projections.viaAlias` 回显）。★ **`12f` 已翻正**（我复跑）：`12f CLOSED: \`ballotbox\` is attached and its envelope carries BOTH boxes across the shutdown` ⇒ **"票箱跨实例恢复"从"未证"改判为【已证（12f CLOSED）】**（reader-a 补票箱活体往返后 90 → 91，由它落）。
- ★ **同类"声明了没生效 · 具名报告"单列（两处，均**具名**而非静默）**：① **`members` 声明了但未挂上** ⇒ `notAttached:[{face:'members', reason:'attachProjection needs a target object', code:'VMU_INVALID_ARGUMENT'}]`（**有码有因**）；② **`PROJECTION_KEYS`（`kernel/resume.js`）仍写 `ballots`**，与适配表/store 键 `ballotbox` 不一致 ⇒ `status().projections.known`/`unwiredKnown` 报一个**没人能挂的名字**（实测 `unwiredKnown: ["members","ballots","phase","work"]`）—— ★我复核该常量**确实仍含 `ballots`**（owner＝core）。⇒ 与 pack 侧已修的那处**同族**：**声明与实现的键名必须对齐**，否则"声明了"只是纸面。
**③ `meetingOpen`（A）维持具名**：`task-73 D` 未落地 ⇒ 钻取**没有**"重启后哪个会还开着"的断言 ✓（不写成已验证）。
**④ `VMU_RESUME_FROM`（✅ 已闭环，待办可关）**：`docs/03 §8.2` **已登记**该 env 缝（谁设／何时设／缺席行为：不设 ⇒ 从头算、`resumedFrom:null`、**不假装续算**）；**`docs/15:385` 的全名已由 Lead 在收尾集成时自己改回**（原文已复写 `VMU_RESUME_FROM` 并指向该表）⇒ **本条关闭**。另 `docs/03 §8.2` 的行号指针漂移（写 `:602/:649/:738`，实际 **`:611/:658/:747`**）**已派 core**（随 `control/idle` 一起改）。

### 9.12 ✅ task-75 C 复核**完成**（core 的 task-74 已落地）：**三项全部实测通过**

**① 钩子已登记且分类** ✓：`kernel/bus.js:128` 登记 `{ name:'control/idle', kind:'vmu', failure:'open', blockable:false, rewritable:false, scope:… }`；两道门我复跑 **`audit-hook-coverage` 4/0**、`scripts/audit-hook-emit-classification.mjs` **7/0**。
**② ★ "有真生产者"＝我【实测】（不是读源码）**：驱动 `kernel.beat()`（**既有的 tick**，`kernel/index.js:1863`）＋注入时钟推进 ⇒ **`control/idle` 真的发了一次**：
```
emit 序列: ["control/heartbeat", "control/idle", "control/heartbeat", "control/heartbeat"]
control/idle count: 1        ← 阈值 1s、空闲 5s 后跨越边沿；后续 beat 不再重复 ⇒ 边沿触发、每 episode 一次
idleState(): {"ok":true,"afterMs":1000,"enforced":["vmu.control.idleAfterMs","vmu.control.idleAction"],…}
```
⇒ **不是"无生产者钩子"**：生产者＝**既有 tick**（`index.js:1864-1871` 明写 `beat()` 就是轮询点、在重置活动时钟**之前**用上一次心跳判定、**无新定时器**），消费者＝vmu-pack 的 M2；我的探针还核到 `idleState()` **回显我声明的 `afterMs:1000`**（设置真被读）。
**③ B1–B4 每键真读者** ✓：**8/8 已在 schema**（`prompt/index.js:121` 读 `vmu.prompt.compactThreshold`；`recruit.js:52` 读 `vmu.members.maxTempPerMember`；`paper.js:58-61/:164-177`；`tasks.js:111`＋`index.js:667`）。★ 键名按 **core 的更正**记：**`vmu.paper.format`／`language`／`compilePdf`／`finalPaper`**（**不是** `paperFormat…` 一类转述）。**分类仍是"复述默认、非保真证据"**（§9.10）。
**④ ✅ 最后一条红已闭：`audit-enforced-consistency` 从 354/1（findings=2）→ `358 passed / 0 failed`、`findings=0`、EXIT=0**。做法：按该门既有形状补**三条 `REFUSAL_SCENARIOS`**（`recruit.accept` 同 hirer 的第二个试用期成员／`tasks.objectAssign(memberMayRejectAssign=false)`／`loader` 未声明 `trigger-workflow` 却取 service 的 handler）＋ 三行 import。★ **两个面的 `enforced` 位置相反**（recruit 的 `refuse()` 是 `Object.assign(err, extra)` ⇒ **顶层**；tasks 的 extra 在 **`detail`**）——两块都过 Rule ⑤ 但**过法不同**，已在场景注释里写明。★ **确定性**：我连跑两次，**输出逐字节一致** ✓。★ **边界（如实）**：四类"改一行就红"的**变异证明由 vmu-activity 在副本上完成**（我**未**在落地树上重做变异）；且其提醒 **`loader.js` 的块有保质期**（该文件本轮仍在改）⇒ **loader.js 再动就需重跑本门**。
**⑤ 归因（我复核，均不记在目标 1 头上）**：`vmu-entry` 曾 exit 1 是 **core 在飞的 task-74 中间态**（`kernel/prompt/index.js:121` 要求 `vmu.prompt.compactThreshold`）——★**现已回 `150/0`**（我复跑）；`audit-code-size` **7/2** 的超限文件是 **`kernel/meetings.js`**（reader-c 的 task-73 增长），而 **`resume.js` 1189 < 1200 ✓**。

### 9.13 R10 收尾：两条"已闭合"＋一处框架路由修正（我复核/复跑）

**① v5r「静止 ⇒ 开会」＝✅ 已闭合**（此前 R9 记"具名保留：`control/idle` 未登记"）：`control/idle` 落地后 vmu-pack 落 `packs/v5r/middleware/stall-meeting.js`——纯函数 `stallDecision()` 的阈值＝**`3 × vmu.control.idleAfterMs`（＝v5r 的 360000，`:1082/:1083`），不硬编码**，`afterMs=0` ⇒ 什么都不做；清单里以 **module 形状**条目 `{id:'v5r.stall-meeting', kind:'module', on:['control/idle'], capabilities:['trigger-workflow','record'], module: …}` 挂上。**三步探针 11/0**：真控制面报出空闲边沿（同 episode 不重发）→ 模块成为 `control/idle` 上**恰一条**条目且带 `trigger-workflow` → **`vmu.meetings.open()` 真被调用**（形状 `kind:'stall'`）；反向也验（359999ms／短空闲／`afterMs=0` 都不开会）。⇒ **`stallAutoMeetingMs` 的"有意分歧"在 R10 变成"按 v5r 语义落地"**。
**② v5r「异议广播给 voters」＝✅ 已闭合**：vmu-pack 在 `kernel/bus.js` 登记 `task/assign-objected`（`failure:'open'`、不可阻断），core 在 `kernel/tasks.js:321` 接上 emit（**先落只增台账、再 emit**）；回执 `broadcast:{attempted:true, emitted:true, audience:'…the middleware decides the audience…'}`，探针**观测到恰 1 次 emit**，载荷 `{at,id,by,why,state,owner}` ⇒ **听众由中间件决定（R1）**；**无 bus 缝时具名**。
**③ ★ 框架路由修正（vmu-pack 的 `kernel/pack.js`，值得入册）**：过去清单中间件**一律直接 `bus.add`**（只认 inline `handler`，且 handler **看不到 `api`**）⇒ **module 形状的 pack 条目既过不了 `validatePack`、也拿不到 core 新加的服务缝** ⇒ "**pack 能声明 module 却无法行动**"。现改为：**inline `handler` 走原路**（向后兼容）；**module 形状（`module:`／`file:`）经 `kernel/loader.js` 的 `toBusEntries()`**（校验 apiVersion/capabilities/hooks ＋ 附加 `api`，一个模块按 hook 展开成多条总线条目）；**无 loader ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**；`validatePack` 接受两种形状、**仍拒绝裸路径**。★ 与 §9.8.4 的"门禁必须读事实所在的那种文本"互补：这次是**装配必须认识声明所用的那种形状**。
**★ 我按自己的"保质期"提醒复跑（`loader.js`／`pack.js` 本轮都动过）**：`audit-enforced-consistency` **358/0（`findings=0`）**、`audit-hook-coverage` **4/0**、`audit-hook-emit-classification` **7/0** —— 全 EXIT=0 ⇒ **loader 块经受住了这两处改动**（该提醒有效且已被消费）。

---

## §9.14 ★ R11 主项：全 pack 声明「notAttached」普查 ＝ **一次查干净 ＋ 常驻门禁 ＋ 自探针**

**A · 普查（真装配 `vibe-math-vmu.js apply(ctx, {packs:['v5r']})`，读 `status().projections`）——三张表**：
| 表 | 面 |
|---|---|
| **declared（10）** | `members`／`tasks`／`meetings`／`ballotbox`／`budget`／`phase`／`work`／`chat`／`panel`／`human` |
| **attached（7）** | `human`／`tasks`／`meetings`／`ballotbox`／`budget`／`chat`／`panel` |
| **viaAlias（0）** | —（别名容错通道存在，但本装配**没有**用到它 ⇒ 说明 pack 侧已用真名声明） |
| **notAttached（3）** | `members`／`phase`／`work`，**全部 `VMU_RESUME_NO_TARGET`**，reason 一致地说明：**服务为 null 因为"没人声明它"（零机制，如 members 需要 slots／maxLiveMembers）⇒ 没有可包裹的目标；键保持未接线而不是假装** |
⇒ ★ **R10 那类"静默不挂"在本次普查里＝0**（那正是"逐个发现"抓不到、只有"一次普查"能保证的结论）；`known`／`unwiredKnown` 与三表**逐项一致**（两个读数无法各自漂移）。

**B · 零机制红线（D-01，已断言不假设）**：门禁里断言 **没有任何 `attached`／`wrappedMethods` 面是未声明的**（⇒ **不发明权威**），且每个 `notAttached` 的 reason **必须点出零机制成因**（`/zero-mechanism|nothing declared it/`）⇒ "没声明就没有实例"从口号变成读数。★ 与 core 的 `docs/03 §6.2` 零机制对照表同源。
**C · 常驻门禁（新文件当场双登记）**：`scripts/audit-projection-census.mjs`
- **读数**：**10 passed / 0 failed EXIT=0**（`tables: declared=10 attached=7 viaAlias=0 notAttached=3`）；
- **登记**：`package.json files[]` ✓（`audit-package-membership` **13/0**）；
- **执行点**：已接进 `tests/audit-declaration-criterion.test.mjs` 的 RULE A 段 ⇒ 输出 `EXECUTED: node scripts/audit-projection-census.mjs ⇒ exit=0`（"自证脚本必须有执行点"这条规则本身也被满足）；
- ★ **自探针（防空洞）**：**种一个不存在的面** `no-such-face-r11-probe` ⇒ 它**必须被归档并具名**（实测报 `notAttached`）；若哪天普查能让它悄悄消失，门禁**自己红**。
**E · 保质期复跑**：`audit-enforced-consistency` **358/0（`findings=0`）**｜`audit-hook-coverage` **4/0**｜`audit-hook-emit-classification` **7/0**（全 EXIT=0，loader 块健康）。
**⚠️ 一条新红（不是我的文件，已直发 owner）**：`audit-declaration-criterion` 的 **RULE E `current=68 baseline=67`（纯新增）**＝ `+ vmu-resume-e2e.test.mjs:A:seedRows`（`tests/vmu-resume-e2e.test.mjs:679` 的 `seedRows.every(...)`，而 `seedRows` 由 `for (const key of seedKeys)` 填充 ⇒ **空列表即空过**）。**修法一行**（`seedRows.length > 0 && …`）；**我未改他人文件、未动基线**。★ 交叉核对：~~其 `:669` 的 `seedKeys` 只列 **9** 个面、**缺 `human`**~~ ⇒ **【我撤回，reader-a 实测反驳了我】**：该清单 `:668` 就是 **10** 项（`members,tasks,meetings,ballotbox,budget,phase,work,chat,panel,human`），**我读到 9 项是因为 `Select-String` 输出被行宽截断**——**我把"我读到的"当成了"文件里写的"**。★ 这与我在 R10 的 `contentvalue.js` 失误**同族**（**"搜不到/读到一半"必须与"不存在"分开说**），两条都记在此处作纪律。其 `13a` 的断言名现已把 10 项**打印出来**以终结歧义；其读数（`declared=10 ⇒ attached=7 / notAttached=3(members,phase,work)`）与我的普查**完全对齐**。

### 9.15 ★ 多智能体协作端到端剧本（reader-b task-81）＝**R10 自认的最大空缺已补**

**舞台**：`prover` vs `skeptic` vs `chair`，真机 numpy 2.5.3（反例搜索 n=1..20000）＋ Lean 4.34.0（`res-lean10`）；`=== R11 DONE: 27/27 steps walked ===` **EXIT=0**。
**走通（节选）**：**A 委托**——越权委托**具名拒** `VMU_DELEGATION_ESCALATION`（点名"chair 对 `commands[mathjobs.submit] resources[Math/Jobs/skeptic]` 无权限"）→ `declareAuthority` → `grant{delegationId:'d-1'}` → 范围内 `{allowed:true,source:'delegation'}` → **越界再拒**（"not covered by any delegation to skeptic: resources[Math/Jobs/prover]"）；**B 异议＋表决＋复议**——`tasks.objectAssign` **真的广播**（listener 收到 `{id,by,why,state,owner}`），1:1 ⇒ **`VMU_BALLOT_TIE_UNRESOLVED`**（反对票让裁定**悬置**、箱子仍 open），主席第 3 票 ⇒ `{result:'accept'}`＋`ranked`，已裁定再投 ⇒ **`VMU_STATE`**，`reopen({reason})` ⇒ `reopenCount:1` ⇒ 复议轮通过；**H 两把键各自单独决定结果**——`vmu.ballot.minVotes` 0⇒accept / 3⇒`VMU_BALLOT_MIN_VOTES_NOT_MET`，`vmu.ballot.tieRule` `unresolved`⇒拒 / `chair`⇒accept（**同票不同果**）；**C 会期板**——`quorum.unanswered:[prover,skeptic]` **被具名**（不静默略过）、`minutesLines:4`、`confirmMinutes`/`close` ok；**D 任务链**——依赖门禁 `VMU_STATE :: unmet dependencies`，成员内核死后 `t-1` **重派**；**E 并发写者**——并发 assign 都 ok 且 `historyRows:3`（**不丢更新**）、并发投票都入账、**同成员重复票 ⇒ `VMU_CONFLICT`**（不重复计票）；**F 杀成员内核**——SIGKILL 后新实例走 **分支②** `interrupted-then-requeued`（`attempts:2`、`lease:'acquired'`）⇒ `{settled, exitCode:0}` 且**真实结果** `{nMax:20000,counterexamples:[],holds:true}`、`leases{acquired:1,heldByOther:0,stolenStale:0,unenforced:0}`；**G 幂等**——records 同内容同 id、library `sameId:true`、`indexHealth{read:1,deferred:0,unreadable:[],missingId:[]}`。
★ **没证明的（其 §3 逐条；我原样记，不放大）**：① **两个独立内核进程各带一个成员**（除 F 段外两个身份**同进程**）② **独立 LLM 智能体**（主张/异议是剧本写的；框架给的是**机制**不是智能体）③ **会期板↔票箱联动未做**（会议动议没真投进 ballotbox）④ `delegation` 的 TTL 过期／`spend` 预算面未走 ⑤ `tasks.writeScopeConflicts`（重叠写域）未构造 ⑥ 复议的"成员动议"路径／`meetings.fileAppeal` 未走 ⑦ `vmu.meetings.leaveApprover` 只注入**未断言** ⑧ 跨机/持久卷未验。
★ **我的复核**：它引用的四个具名码我在 `kernel/*.js` 里核到（`VMU_DELEGATION_ESCALATION` 3 处／`VMU_BALLOT_TIE_UNRESOLVED` 2／`VMU_BALLOT_MIN_VOTES_NOT_MET` 3／`VMU_CONFLICT` 29）✓；`check-docs` **PASS** ✓；它**未新增随包文件**（`package.json#files` 与 `installer.js` 均 0 项 `_handoff` ⇒ 双登记未触发）✓、**未改任何 kernel/docs 文件** ✓。

### 9.17 会期板 ↔ 票箱联动（reader-b R11 增量③）：**一向往通、两处仍缺**（★含一处**静默失败**）

**机制位置**：`kernel/meetings.js:741` —— `vote()` 把票**镜像**进注入的 `ballot` 接缝（`ballot.cast({ meeting, motion: target ? target.id : null, member, value })`）。
**实测（真票箱＋真会期，EXIT=0）**：`open m1` → `attend×2` → `motion ⇒ mo1` →（**接缝外**补上内核不携带的那步：为 `mo1` 开箱 `bx-1`、记 `motion→boxId`）→ 会议投票**点名 motion** ⇒ 票箱**真的收到 2 票**（`status.votes:2`）→ 票箱 `close()` ⇒ `{result:'accept', tally{cast:2,votes:2,ranked:[{accept,2}]}}` ⇒ **会议表决结果真的落进框架自己的票箱**。
**判定**：
- ✅ **已具备**：会议表决**能**落到框架票箱（票箱 `close()` 出裁定）；**两个前置**＝"`vote()` 点名 motion"＋"宿主提供 `motion→box` 映射"。
- ⚠️ **仍是缺（具名＋改判条件）**：① **动议不自动开箱**（内核不调 `ballot.open`）；② ★**联动失败静默** —— 我复核 `:741` 确认：`ballot.cast(...)` 被包在 `try/catch` 里，而 `:742` **无论如何**返回 `{ ok:true, … }` ⇒ 接缝拒（如 `NO_BOX_FOR_MOTION`）**被吞掉**、**票没进箱而投票人看不出** ⇒ **这是"静默失败"，与 R10 `ballots` 静默不挂同一严重度家族**（"用户以为成了，其实没成"）。
**改判条件**：把"动议→开箱/绑定"＋"**接缝拒必须上抛或计数**"落进 `kernel/meetings.js`（约 20–40 行＋一条"**缺环必须可见**"的断言）。★ **owner 授权问题**：该文件**不在 reader-b 的 task-81 写范围**（且本轮被另一位写者动过）⇒ **需 Lead 授权**；我这一侧（tests）可随时补"缺环可见"的常驻断言，但**改机制不是我的写范围**。
### 9.16 R11 追加：包侧三条进仓 ＋ 钻取刷新 ＋ 两条 RULE A 执行点

**① R10 的三步探针已进仓为常驻断言**：`tests/vmu-stall-meeting.test.mjs` ⇒ ★我复跑 **18 passed / 0 failed EXIT=0**（STEP 1 真控制面空闲**边沿**／STEP 2 `control/idle` 上**恰一条**带 `trigger-workflow` 的条目／STEP 3 真 `vmu.meetings` 面上观测到 `open()` 被调用 `kind:'stall'`；反向：短空闲、差 1ms、`afterMs=0` 都不开会）。★ **阈值"不硬编码"由一对断言证明**：换声明值 **60000 ⇒ 门槛变 180000**（写死 360000 会同时挂掉这两条）。
**② 新门禁 `scripts/audit-pack-middleware-shape.mjs`** ⇒ ★我复跑 **7 passed / 0 failed EXIT=0**、`--selftest` **6/0**：**inline `handler` 不得伸手要 `api`**、不得声明只有 loader 能兑现的 `trigger-workflow`；**module 形状必须声明真需要的能力**；裸路径／`kind:script|plugin` ⇒ 红。**执行点已由我接入** `tests/audit-declaration-criterion.test.mjs` 的 RULE A 段（`EXECUTED: node scripts/audit-pack-middleware-shape.mjs --selftest ⇒ exit=0`）⇒ 该门的 RULE A 转绿。★ **登记口径**：两个新文件都进 `package.json files[]`（我核 **2/2**）；`installer.js` 的 `PRESETS[].files` **只列随预设出货的运行时文件、实测不含任何 `tests/`／`scripts/` 条目** ⇒ 它们**不进托管名册**，两份安装器门禁仍 ALL GREEN（**这是"双登记"的正确定义：按文件性质决定要不要进托管名册，而不是一律两处都加**）。
**③ 钻取基准刷新（reader-a R11）**：**90 → 99/0**（81 ＋ §⑩ 9 ＋ R11 **§⑪ 3**（种子普查＋两个非空反例：同键写**非空**值仍具名 `VMU_RESUME_PROJECTION_GAP` ⇒ "空容器宽容"**不是**"存在即通过"）＋ **§⑫ 5**（**F51 耐久域标记**：唯一 `markState`＋7 处状态迁移＋声明式域接缝＋`openMeetings()`＋自曝 `status().durableMarker`）＋`12j`（第二内核里**两个票箱都回来** ⇒ 多实例缺口**保持关闭**，与我的普查"静默不挂＝0"互相印证）。**变异验证**：关掉 `markState` 的接缝写入 ⇒ **96/3 exit 1**（`14b/14c/14d` 红、`writes:0` 佐证从未写过），还原后 sha256 一致 ⇒ 99/0。新码 `VMU_MEETINGS_MARKER_UNREADABLE` 已登记 `docs/03 §8`。
★ **仍未证（别放大）**：`kernel/index.js` **未接**域接缝 ⇒ 出货内核里 `durableMarker:false`（**自曝**）；"真机重启后哪个会还开着"**仍属未证**（§⑫ 用**真文件接缝**证的是契约本身）。另 `meetings.js` 现 **1244 行**（>1200，已报 Lead）。
**④ 两条 RULE E 结果**：`seedRows` 已由 reader-a 用"**同一表达式内钉非空**"修掉（**未动基线**）⇒ `RULE E fingerprints: current=67 = baseline=67` ✓；★ **我撤回"`seedKeys` 缺 `human`"那条**——是我读 `Select-String` 截断输出导致的误判，已在 §9.14 记录。

---

## §9.18 ★ R12 主项：`docs/04` declared-but-not-wired 键的**排期普查**（机械分层，长尾按规则闭合）

**取数（关键）**：不逐键读文档，而读**权威生成物** `vibe-math-vmu/settings/planned.js` 的 `PLANNED_DEFS`（`docs ⇒ planned.js`，每条带 `planned:true`／`def:null` 的诚实形状），按 `vmu.<face>.*` 的**第 2 段**分组 ⇒ **114 键 / 42 面**（Lead 口述"120"差 6，**以生成物为准**；`docs/04` 的 128 处"未接线"字样含表头/散句，不作计数源）。

| 桶 | 键数 | 面数 | 面（键数） | 建议处置 |
|---|---|---|---|---|
| **① 面有模块** | **25** | **13** | `ballot`(4) `math`(4) `prompt`(3) `collab`(2) `handover`(2) `report`(2) `work`(2) `ballotbox`(1) `explain`(1) `identity`(1) `meetings`(1) `paper`(1) `skills`(1) | **接线候选**：本轮接（读者已在）／**下轮接**（需补读者）——**唯一需要逐键判断的集合** |
| **② 面无模块** | **89** | **29** | `animal`(9) `clinical`(9) `a11y`(7) `ethics`(5) `mentor`(4) …（其余 3/2/1 键长尾） | **永不接（具名理由）**：该面在内核里**没有模块**（无实现载体）⇒ v5r 规格的**未来域保留位**；**改判条件**＝该域出现内核模块 ⇒ 整面移入①再逐个处置 |

⇒ ★ **普查的价值**：**89/114（78%）不是"欠债"而是"没有载体的保留位"** —— 逐个发现会永远追它们；**规则闭合后真正的工作面只有 25 键 / 13 面**。
★ **我自己的两次测量修正（按 §4.2 第八条执行）**：**(a)** 第一版只查 `kernel/<face>.js` ⇒ 把 **`prompt`(3)** 误判"无模块"（它其实是**目录模块** `kernel/prompt/index.js`）⇒ 改为 `.js` **或** `<face>/index.js` 后，桶① **22→25**、桶② **92→89** —— **"我没找到"是搜索范围不足，不是它不存在**；**(b)** 计数以生成物为准而非 `docs/04` 字样数（128 vs 114）——**同一事实的两种读法必须分清**（第七条）。
**仍未做完（具名）**：桶① **25 键的逐键三列**（归书面／是否已有落点计划／本轮或下轮）**未落**——本轮预算用于**把分层做成机械规则并修正自己的误判**；下一步只需对 25 键做读者核查（`vmu-seam-params-consumed` 已具备该能力），**长尾 89 键已闭合、无需逐个碰**。

**§C 双登记口径（结论＋代价；未改门禁，等三方对齐）**：问题＝R10 `meetingleave.js`／R11 `meetingmarker.js` **连续两轮**"**拆分产物被 import 却漏登记 `files[]`**"。建议 **① 流程一步先做**（≈0 代码：把"新文件当场登记"写进 **meetings 拆分清单**＋PR 自查项）；**② 门禁扩口径**＝给 `audit-package-membership` 加"**被 shipped 模块 import 的路径**必须在 `files[]` 或**具名豁免表**"（该门**已有 import 闭包逻辑** ⇒ 成本 ≈20–30 行；风险＝`_handoff`／测试脚本类**非运行时** import 必须走**具名可审**豁免）。**今天不改的三条理由**：口径需 **vmu-activity＋vmu-pack＋我**三方对齐（`files[]` 语义归谁、豁免表放哪、`installer.js PRESETS` 是否参与）；本门是 **T0/T1 组成**，轮中改会污染读数；已确认 **`installer.js` 的 `tests/` 条目=0（唯一一处是注释）** ⇒ 第二处只覆盖**随预设出货的运行时文件**。**判据四条**：种一个"被 import 未登记"⇒**红**；删除⇒**绿**；豁免表**逐条带理由**；**不把 `tests/`／`scripts/` 拖进 `PRESETS`**。

---

## §9.19 R12 追加：`motion→box` 绑定接缝落地 ＋ 钻取刷新（99 → **108**）＋ **① 仍具名未证**

**读数刷新（我复跑）**：`tests/vmu-resume-e2e.test.mjs` ⇒ **108 passed / 0 failed EXIT=0**（我矩阵先前记的 **99** 是 R11 末的快照；其间接连加了 §⑬ 4 与 **§⑭ 5**）｜`vmu-meetings` **161/0**｜**`audit-code-size` 9/0**（`meetings.js` 回到 **1198 < 1200**，`meetingmarker.js` 145 ⇒ **我 R11 记的"1244 行越界"已由拆分解决**）。
**A · `motion→box` 绑定接缝（按 R1：开箱是政策，不进内核）**：`createMeetings({ boxFor })` 由**消费者/pack 声明**，`kernel/meetingmarker.js` 的 `mirrorVote()` **只调用**——**不开箱、不发明映射、不缓存**。★ **我核到三个新码在 `docs/03` 与内核两侧都在**：`VMU_MEETING_BOX_UNWIRED`（未声明）／`VMU_MEETING_BOX_UNMAPPED`（声明了但答"无箱"）／`VMU_MEETING_BOX_BINDING_FAILED`（回调抛错，**回调自带 code 优先**）（`docs/03` 各 2 命中；内核 2/3/2）。
**C · 回执口径**：`ballot:{ mirrored, reason, code?, boxId?, message? }`，`reason ∈ no-seam / no-binding / unmapped / binding-threw / refused / threw / cast`；断言含 `16c` 未绑定具名、`16d` 抛错具名、`16e` 无箱具名、`16b` **重复绑定＝幂等**（同一 `boxId`，**内核不缓存**）。
**★ 行为变化（我按此更新口径，非回归）**：新契约下"**有 `ballot` 但无 `boxFor`**"⇒ **`no-binding`（具名）** —— 因此 R11 的 `15a/15b/15d` 夹具**补上绑定后才绿**；`15c`（无 ballot）仍是 `no-seam`。这正是 A 的**预期语义**（把"没接线"从沉默变成具名）。
**⚠️ ① 仍属具名未证（原样记，不放大）**：真 `createBallotBox` 的 `cast` 对这个**最小箱**逐票拒 **`VMU_CONFLICT`**（`tally.votes=0`）⇒ **"会议表决真的进箱、并能 `close()` 出裁定"本轮仍未证**。钻取把这条写成**自适应**：能进箱则断言进箱，否则**打印 NAMED GAP**（原样回执 `{mirrored:false, reason:'refused', code:'VMU_CONFLICT', boxId:'bx-1'}`）**并断言"拒绝必须具名"**。**根因是其构造的箱缺 `eligible`/选项词表形状**（reader-b 的 e2e harness 有正确形状），**不是接缝缺陷** ⇒ **Round 13 首项＝换正确箱形状把①转正（断言位已留）**。
**R13 交接**：reader-c 的 **B③ `overrideOrder`／B④ `flow`（task-91）** 本轮未做（预算在 task-92）⇒ reader-a 接手；`tools/meeting.js` 无新动作。

### 9.20 ★ R12 门禁盲点修复（`scripts/generate-zero-mechanism-matrix.mjs`，Lead 授权）：**当场抓出第三个实例**

**盲点（vmu-core 定位到行号）**：`judge()` **先**判"探针抛出"（`:265` ⇒ `probeErrors += 1; continue`），**后**才判"出现却无裁定行 ⇒ 红"（`:270-274`）⇒ **"无裁定行 + 探针抛出"的模块两个计数器都不进**（`--check` 报 `0 unregistered`），而矩阵**却把它印成"设计未定 ✗"** ⇒ **打印与计数互相矛盾**；R10/R11 拆出的模块就这样悬了两轮。
**修法（选 (b)：先登记、再修门；并把 (a) 的顺序修正一并做掉）**：
1. **先登记三行**（照实测形状，**不臆测**）：`meetingleave`（`createLeaveControls`；`requestLeave()` 缺参即抛）／`meetinglapse`（`createMeetingControls`；`lapseDue()` 缺参即抛）⇒ `PROBE_NEEDS_ARGS`；
2. **再改顺序**：把"**无裁定行 ⇒ 红**"提到"抛出跳过"**之前**（`EXPECT_NA`／`EXPECT_UNDECIDED` 仍在最前 ⇒ **"未定 vs 漏了"分开**的语义不动）。
**★ 自探针＝由现实提供（比种一个更强）**：改完顺序后**立刻红了一个真模块** —— **`kernel/resumeflush.js`**（R10 拆出、150 行、`createExitContract`）：**无裁定行 + `create 抛出`**，两轮无人看见。其实测抛因为 `createExitContract({})` → *"createExitContract needs a snapshot({key}) writer"*（**工厂需要注入接缝**）⇒ 诚实登记为 **`PROBE_NEEDS_ARGS`**。
**读数（我复跑）**：`--write` ⇒ `0 mismatches, 0 unregistered`；`--check` ⇒ **`=== ZERO-MECHANISM MATRIX: 96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a ===` EXIT=0** ✓（probe-errors 8→9 正是 `resumeflush` 被**记名**而不是消失）。
⇒ ★ **这是"普查/全量规则优于逐个发现"的第三次证明**（R10 `ballots`、R11 `meetingmarker`、R12 `resumeflush`）：一条**顺序**修正就捞出一个悬了两轮的模块，而且**它自己就是自探针**。
**待并入（我未及回填，具名）**：vmu-core 的 `docs/11 §6.1` 拆分清单五步（含 **③′ 闭集词表**：**裸 `object` ⇒ mismatch**）＋ **`ballots` 键按 §7 删除**（`PUBLIC_KEYS` 移除＋`docs/03 §7.1` 破坏性变更登记；实测迁移 `dead-key 10/0`：`read/patch('ballots')` 具名拒 `VMU_INVALID_ARGUMENT`，而**老部署声明旧拼写仍 attaches `ballotbox`**（`viaAlias`）⇒ **部署零改动**）；以及 **reader-b task-90**（两进程真对话 3 pid EXIT=0／gap ④TTL+spend 具备、⑤写域*具名但不强制*、⑥`reopenInitiatorScope` **未改变结果＝负面结论**、⑦`leaveApprover` **键真的决定结果**；未证：**成员非 LLM 智能体**、`records` 跨进程未做、`panel` 未走、跨机未验）—— **下轮补入矩阵正文**。

### 9.21 `motion→box` 政策：**具名保留 · 待接缝**（vmu-pack task-97；★含我复核后的两处**细节更正**）

**结论**：R1 分工的另一半（"**开箱是政策**、内核只提供接缝"）**今天落不下去** ⇒ 按 Lead 的 C 口径**具名保留**：**未落半接线模块、未登记任何钩子**。政策形状已勘定（**M2 模块**：`capabilities:['trigger-workflow','record']`＋`hooks:{'motion/propose': …}` ⇒ `api.services.get('vmu.ballotbox').open(…)`）；★ **M1 规则做不到**（动作集不含"调服务"）、**inline handler 做不到**（总线路径没有 `api`）—— 这两条与 R11 的 `middleware-shape` 门禁同源。
**三项依赖（我逐条核过，含更正）**：
1. **`boxFor` 装配没接** ✅我核：`kernel/meetings.js` 里 `boxFor` **2 处**（参数＋`mirrorVote` 消费点），而 **`kernel/index.js` 里 `boxFor` 命中 0** ⇒ **恒 null** ⇒ 回执恒为**具名** `VMU_MEETING_BOX_UNWIRED`（**不是静默**）。
2. **pack 无投递路径**：`createMeetings` 在 `kernel/index.js` 构造 ⇒ core 二选一：注册方法（如 `vmu.meetings.bindBox(fn)`）或清单字段（如 `PACK.seams.boxFor`）。
3. **动议事件不可挂** —— ★ **我复核后更正两处细节**：其报告写"`kernel/governance.js:166` **对象形态 emit ＋ 点号名**"，但实测 **`:166` 是 `refuse('VMU_MOTION_NOT_SECONDED', …)`**；真正的 emit 在 **`:172`＝`note('motion.propose', m.id); emit('motion/propose', { id: m.id })`** ⇒ **名字已经是斜杠形 `motion/propose`**（不是点号名），**payload 是普通对象**。⇒ **"不可挂"的实质成立**（我核 `bus.js` 里 `motion/propose` **命中 0** ⇒ 未登记 ⇒ 没人能挂），但**成因不是"名字形态"**，而更可能是 **`emit` 走的是本地包装**（`:61` `o.bus.emit(evName, body)`）⇒ 字面量扫描看不见。**⇒ 修法因此更小**：**登记 `motion/propose`**（+ 让扫描认识包装）即可，**无需改名**。
**B 的反向已成立（其实测）**：提出动议后**票箱数 0 → 0（不开箱）**、`isRegisteredHook('motion.propose') === false`（**没人能挂、也没假装**）；接缝**被供给**时三种回执都正确（`no-binding`／`unmapped`／真投进去）；另一探针实收 `bus.emit('motion.propose', {object})` ⇒ **事件发得出去但无人可挂**。两探针 exit 0。
**两点"落了会臆造"（已请 reader-a 给可核输入）**：① 箱的 `options`（v5r 动议面是**附议**、不是选项投票 ⇒ **无 v5r 出处**）；② 动议文本（`governance.motion` 只有 `{propose, second, withdraw}`、**无读方法**）⇒ 不臆造。

### 9.22 ★ `emit({ type: … })` 普查（vmu-core 顺着 §9.21 的更正做的）：**两个门各漏一半 ⇒ 27 处不可见**

**时间线澄清（vmu-core 提，我接受）**：其动手**前** `governance.js` 确是**对象形态＋点号名**（`emit({ type: 'motion.propose', id })`），其 Node 脚本按**逐锚点唯一命中**改了 9 处；★ **我逐行核到的是其改后文件**（`:58` helper、`:64 o.bus.emit(evName, body)`、8 个斜杠字面量）⇒ **两个成因都真**：点号名 ⇒ **登记/`declareTopic` 做不到**；**对象形态＋本地包装** ⇒ **字面量扫描看不见**。其已改斜杠名**并连登记一起做**（`bus.js:103-112` 八个钩子、`motion|agenda` 进 `VU_NAMESPACE`）⇒ **"无需改名"在结果上已满足**，无需回退。★ **纪律**：**行号/形态类断言是"有时间戳的"** —— 两人可各自正确于不同时刻 ⇒ **报告须写明"我读的是哪个时刻的它"**（与本轮 §9.14／§9.15 的截断误判、§9.21 的行号漂移同族，这是**第四次**）。
**普查（我独立核数）**：`emit({ type: … })` 在 `kernel/` 我数到 **27 处**（其数 29，同实质）：`ballotbox` 7／`alerts` 3／`resource` 3／`course` 2／`conference` 2，其余 11 个文件各 1（`bidding`/`capacity`/`funding`/`grant`/`mathtools`/`metrics`/`migration`/`repropack`/`stateversion`/`storepolicy`）。
**★ 两个门各漏一半（我核）**：① `scripts/audit-hook-emit-classification.mjs` 的**自述规则**（`:11`）就是"**every literal `emit('<name>'` is CLASSIFIED**" ⇒ **对象形态不在其判据内** ⇒ 这些站点**全未被分类**，而门仍报 **7/0**（**假阴性**）；② `tests/audit-vmu-docs.test.mjs` **§I** 的 helper 规则只认 `emit('名')`／`emit({ name: '名' })`／`say({ type: '名' })` ⇒ **`emit({ type: … })` 一个都不匹配**；③ ★ **§I 的"声明后 700 字符内出现 `bus.emit(`"窗口很脆**（vmu-core 真实踩到：长注释把 `o.bus.emit(evName, body)` 推出窗口 ⇒ 8 个钩子被误判"未发射"，`audit-vmu-docs` 83/1；其把注释挪到 helper **上方**（实测 581）作**权宜**）⇒ **真正的修法是按函数体边界判定**。
**⇒ 待落（`scripts/**`＋`tests/**` 归我；**我本轮预算未及落，具名**）**：① 分类门补 **`emit({ type: '名' })`（本地 helper 到达 bus 时）**；② **§I 的 700 窗口换成函数体边界识别**。★ **顺序建议（沿用 §9.20 的教训）**：**先把 27 处登记/改名、再落门禁**——否则门禁一落就**同时红 27 处**，读数的归因会糊成一片（派单：**16 个点号名 ⇒ 改斜杠名**（`ballotbox`7／`course`2／`repropack`1／`resource`3／`stateversion`1／`storepolicy`1／`chat`1）＋**其余 ⇒ 登记**）。vmu-core 已表示 **`storepolicy`／`metrics` 曾在其写范围（R9／R10），可接手这两处**。

### 9.23 ★ U15 钉死了：**M4 插件行里的 vmu 服务＝不可达**（否证本身就是答案）＋ 外部会话认证层（vmu-assistant task-96）

**★ U15 的结论（会话 `session-f828e05a…`）**：外部插件的工具**真被调用**（`ext_demo_probe` @L18 seq16 → 结果 @L19 seq17），但**从插件行的 `ctx` 里 5 个 vmu 服务全部 `present:false`**：
```
sessionScopedLookup: { vmu.tasks:false, vmu.middleware:false, vmu.report:false, vmu.records:false, vmu.meetings:false }
call: { method:'vmu.tasks.status()', ok:false, reason:'the service is not reachable from this plugin context' }
（同一 marker 里 hostServices.tools.present = true）
```
**机制（结论，不是配置/时序问题）**：**M4 插件行＝profile 作用域**（只见宿主级服务）；**vmu 服务＝每会话作用域**（R11 已实测：会话/预设作用域里 **M2 模块**的 `api.services.get('vmu.activity')` 成功、一次列 **13 个已发布服务**）⇒ **"在 M4 行里 `ctx.get('vmu.tasks')`"这条路不成立**；**要消费 vmu 服务必须走 M2 模块 ＋ `capabilities:['trigger-workflow']` 的 `api.services.get`**（三条具名拒 R11 已实测）。★ 其**未把该否证写成"已验证可达"** ✓ —— **否证本身就是要交付的答案**。
**外部会话的认证层（我诊断＋其实测确认，配方**不含凭据值**）**：插件**构造期**按 **ref 名**从**凭据服务**取值（`dsh-opencode-go`：`lib/index.js:6781` `ACCOUNT_REF_PREFIX='DSH_OPENCODE_GO_ACCOUNT_'`；`client.js:1420` `PROVIDER_ID='dsh-opencode-go'` ⇒ 与报错同名，**不是 id 不匹配**）⇒ **`OPENCODE_API_KEY` 这类 env 无效**；缺的是操作者 profile 补丁里那**两行结构**（`desktop\cordis.patch.yml:33-46`：`opencode-go` 行的 `config.accounts[{id,name,apiKeyEnv}]` ＋ `agent-default-model` 行指向该 provider）⇒ **缺 ⇒ `NO_ADAPTER`（4 次、0 token）；补 ⇒ 同插件同会话跑通**（`turn/end: completed`、`toolCalls:1`、**15578 tokens**、9s、cap 未触）。
**另一条硬发现（入 `docs/29 §2 M4`）**：`tools.register` **必须**给 `output{schema,render}`（`render` 必须是函数），否则**整条插件激活失败**并给具名 `TypeError`；且 `ctx.effect` 要 try/catch、**marker 要先写**。
**★ 我复核其"唯一一条红"的归属 —— 它报错了（第五次同类"过期细节"）**：它说 `audit-vmu-docs 83/1` 唯一红是 `vmu.meetings.bindBox`（`docs/10`）；**实测唯一红是**：
```
FAIL every vmu.* key named in the docs exists in settings/schema.js [vmu.tasks.status (29-build-your-own-preset)]
```
⇒ **在其自己的卷 `docs/29`**（把**服务方法名** `vmu.tasks.status` 写成了看起来像 settings 键的样子），而 `bindBox` 我核到**在 `docs/03`（1 处）与内核（3 处）都有**、**根本不是该门的失败项**。⇒ **该红归 vmu-assistant 自己一行**（改措辞使其不被读成 settings 键，或按该门口径登记）；★ **纪律第五次复现**：**引用前先落一行核验**（我这两轮已连续抓到 `seedKeys` 截断、`mathjobs.js:129`、`governance.js:166`、本条）。

### 9.24 §9.21 更新：`motion→box` 依赖从"三项"改为**六行状态**（vmu-pack task-97 收尾）＋★ docs 键规则的**根因已实测**

**①②③ ✅ 已落（vmu-pack 复核）**：① `kernel/meetings.js:730` `mirrorVote({ ballot, boxFor: boxBinding, … })`；② `vmu.meetings` 增 `bindBox(fn|null)`／`boxBinding()`／`status().boxBinding`（**懒绑，不改 loader**）；③ core 把 governance 8 事件改成**名首字面量＋斜杠名**并登记、`motion|agenda` 进 `VU_NAMESPACE`。★ **重复登记被门自己抓出**：vmu-pack 先前也加了一份 ⇒ `hookRegistryProblems()` 报 **8 条 duplicate** ⇒ 其删掉自己那份（`VU_HOOKS` **96**、problems `[]`）。**实测**：`motion-hook-fire-probe` **6/0 exit 0**（真被 loader 装载的 M2 模块收到 `motion/propose` **恰一次**，并能经**能力门控**够到 `vmu.ballotbox`）。
**★ ④⑤⑥ 为收尾新查出（均具名、均在他人卷）**：**④ 装配没传 `ballot`**——`kernel/index.js:1118` `createMeetings({settings,bus,clock,log,durable})` ⇒ 真装配里 `mirrorVote` 在 **`no-seam`** 即返回（实测 `receipt.ballot={"mirrored":false,"reason":"no-seam"}`）⇒ **`boxFor` 永不被问**；**⑤ 会议动议不可观测＋两面 id 不同**——`meetings.js` 总线 **emit 数 0**（`:683` 只 `say()`）、会议动议 **`mo1`**（`:677`）vs 治理动议 **`mo-1`** ⇒ 挂 `motion/propose` 开的箱与镜像问的 id **对不上**（建议 core 在 `:683` 旁加名首字面量 `emit('meeting/motion', {meeting,motion,kind})`，`meeting/` 已在 `VU_NAMESPACE`）；**⑥ 词表不匹配**——reader-a 实测根因：`ballotbox.cast` 读 **`choice`**，而 `mirrorVote` 转发 **`value`(0|1)** ⇒ `choice: undefined` ⇒ 具名 **`VMU_CONFLICT`**（**R13 两行**：绑定可返回 `{boxId,choice?,value?,by?}`；`mirrorVote` **`choice` 优先／`value` 兜底**）；其 `boxForMotion()` 已改成返回 `{boxId,choice}`（`1→'for'`／`0→'against'`，**词表映射＝政策、归 pack**）。
**结论仍是「具名保留」**：政策模块**已从仓里撤出、只在仓外暂存** —— ④使 `boxFor` 永不被问、⑤使箱对不上号、⑥未落时映射不生效 ⇒ **落进去就是半接线**。**改判条件**：④⑤（core）＋⑥＋reader-a 的 R13 三行（`text/kind/emergency`）⇒ 其登记 `meeting/motion`＋进仓＋开火探针（动议 ⇒ 回调被调 ⇒ 箱子真存在；票真进箱；未声明 ⇒ 不开箱、不假装）。
**★ docs 键规则的根因＝vmu-assistant 实测＋我逐键复核确认**（这解决了我 §9.23 里"**未测**"的那一条）：`docs/22` 那些"像服务方法"的点分记号**不是被豁免，而是它们本身就是真键** —— ★ **我核**：`vmu.resource.reserve`／`vmu.funding.request`／`vmu.conference.assign` 在 `settings/schema.js` **各有 1 命中**，而 `vmu.tasks.status` **0 命中** ⇒ 现行规则是"**恰好是键**"而不是"服务方法豁免"。⇒ **这加强了我的提案**：`vmu.resource.reserve(holder, …)` 是**调用形**却只靠"名字碰巧是键"过关，**一旦该键被删，同一行就会红** ⇒ **按调用形豁免**才把"碰巧"变成"规则"；★ 其**主动声明**"我用同正则复算得 8 个 bogus 而门实际 0 ⇒ 我的脚本没复现它，**别引用我这 8 个名字当事实**" —— **这是第八条纪律用在自己身上的正面样本**，值得记。

**★ R13 落门时的两条硬要求（vmu-assistant 提，我采纳）**：
1. **把"键集真来源"写进门里与 `docs/11`**：其复算出来的 8 个名字（`vmu.members.may`／`vmu.tasks.create`／`vmu.ip.*` …）**只当线索、不当事实** —— 若它们正是"**schema＋planned 之外还有别的集合**"的佐证，那么**键集口径本身**必须写清（否则下一个引用者仍会踩"我读到的 ≠ 事实"，即 §4.2 第八条）。⇒ 我先**精确复现门的键集来源**（读 `:328` 的 `SETTING_DEFS` 构造 ＋ `:374` 收集 ＋ `:389-390` 豁免），**再**写结论。
2. **自探针一次锁死四条（双向＋两条既有豁免）**：① **调用形**（`vmu.tasks.status()`）**不报**；② **裸键**（作为设置键写的 `vmu.tasks.status`）**仍报**；③ **家族/通配形**（`vmu.x.y.*`）**仍不报**；④ **命名空间**（有下位键者）**仍不报** ⇒ 保证"调用形豁免"落地时**不误伤既有三条豁免**。
⇒ 程序不变：**我落门＋四条自探针 → vmu-assistant 再统一 `docs/22`/`docs/29` 的写法**（此前**两卷都不动文**，其 `docs/29` 现写法只是**合法**、不是终态）。

---

## §9.25 ✅ R13：§9.19 的"**① 会议表决真的进箱并出裁定＝具名未证**"**现已关闭（翻正）**

**★ 我先复跑确认（rd13）**：`tests/vmu-resume-e2e.test.mjs` ⇒ **108 passed / 0 failed EXIT=0**，其中：
```
ok  16a BOUND (POSITIVE): the meeting votes really reach the box — `choice` beats `value` — and `close()` yields the ruling
ok  16b IDEMPOTENT BY CONSTRUCTION: asking the binder twice for the same motion resolves to the SAME box …
```
⇒ **§9.19 那条"具名未证"不再是 gap**：R12 时它是**自适应形态**（真箱联动未证＋打印 NAMED GAP），R13 起是**正断言**（箱 `options:['a','b']`＋绑定 `{boxId, choice:'a', by: member}` ⇒ **两次 `mirrored:true`**、`close().tally.votes === 2`）⇒ **"会议表决真的进箱并能出裁定"＝已证**。★ **根因与修法（可复核）**：`kernel/ballotbox.js` 的 `cast` 读 **`choice`** 且 **`by` 必填**、`open` 要 `options.length ≥ 2`，而 `mirrorVote` 原转发 **`value`** ⇒ `choice: undefined` ⇒ 具名 `VMU_CONFLICT`；修法＝绑定可返回 `{boxId, choice?, value?, by?}`，**`choice` 优先／`value` 兜底**（`kernel/meetingmarker.js`；其 doc `:94-95` 已写"answers which box … or `{boxId,value,by}` when the box's option vocabulary differs"），并透传 `text/kind/emergency`（`meetings.js:710` 调用点）。
**其余五条口径不变（我按其实测记）**：`16b` 重复绑定**幂等**（同一 boxId、不拒不开新箱）／`16c` 未绑定具名 `no-binding`＋`VMU_MEETING_BOX_UNWIRED`／`16d` 回调抛错具名 `binding-threw`＋`…_BINDING_FAILED`／`16e` 答"无箱"具名 `unmapped`＋`…_UNMAPPED`。同批：`vmu-meetings` **161/0**、`vmu-kernel` 175/0、`audit-code-size` **9/0**（`meetings.js` 1182 行）、`audit-vmu-docs` **84/0**、`vmu-meeting-parity` exit 0。
**★ 仍是缺口（具名，别当回归）**：**装配**——`kernel/index.js` **未传** `ballot`/`boxFor` ⇒ **出货内核恒 `no-seam`**（§9.21 的 ④ 仍在）；**C** B③ `overrideOrder`／B④ `flow`（≈150 行＋6 断言）⇒ **R14 首项**（reader-a 接手）；**D** `ballotbox.js` 的 **7 处点号名**改斜杠名 **必须与 core 的 `bus.js` 登记同轮原子**（否则 `audit-hook-coverage` 红）—— ★ **这条与我 task-98 的 D 项（先转换、再落门）是同一原子性要求**，两处必须一起排期。

---

## §9.26 ★ R14 · **v12 并入块**（v11 → v12 的差量：R12/R13 闭合项 ＋ 本轮实测）

> **口径**：本节就是 v12 相对 v11 的**全部差量**。标题仍写 v11 是因为**只有 Lead 能改标题**；本块一经并入，矩阵正文即 v12。行号/读数**一律写明"读的是哪一次运行"**（本块所有读数＝工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = **`4e5be5aef28180514685a364baba405f94036bee`**（R13）＋ 本轮并发同事的**未提交**改动，标注处逐条写明）。

### 9.26.1 R12/R13 闭合项（并入，逐条给证据所在）

| # | 项 | 状态 | 证据（节／读数） |
|---|---|---|---|
| 1 | **两进程真对话** | ✅ 闭合 | §9.16：三 pid，A 发命题 DM＋`persist` ⇒ **另一进程** `restore` 后读到正文 ⇒ B **锚定原信**回复＋ack ⇒ 第三进程读到回复。★ 两条真实语义：耐久要显式 `await mailbox.persist()`；**`replyTo` 只能锚未 ack 的信**（先 ack 再 reply ⇒ `VMU_MAILBOX_ANCHOR_DANGLING`）⇒ 正确次序 **reply→ack** |
| 2 | **motion→box 政策分工** | ✅ 闭合 | §9.19／§9.21／§9.24／§9.25：内核只提供 `bindBox(fn\|null)`（**方法，不是清单字段**，裁决 (i) ⇒ 不造第二条并行通道），pack 落 `motion-box.js`＋常驻断言；R14 **追加 B5b**（见 §9.26.3） |
| 3 | **长尾按规则闭合** | ✅ 闭合 | §9.18：`planned.js` **114 键/42 面** ⇒ **25 键/13 面有模块**／**89 键/29 面无模块＝具名"永不接"**（78% 不是欠债）。★ **R14 把桶① 的 25 键逐键三列落完**（§9.26.2） |
| 4 | **U15 否证** | ✅ 闭合（否证就是答案） | §9.23：M4 插件行＝**profile 作用域**、vmu 服务＝**每会话作用域** ⇒ 正确路径＝**M2 模块 ＋ `api.services.get`**；`ctx.get('vmu.tasks')` 不成立 |
| 5 | **键集真来源** | ★ **R14 更正** | §9.24 的"三源"要求已交付，但**复核后是"两写＋两机械＋一条两阶段"，而 `namespaces` 是死豁免**（实测）⇒ §9.26.3 |
| 6 | **`metrics/trigger` 未登记缺陷** | ✅ 闭合 | R13 commit `4e5be5a`（"metrics/trigger un-registered defect fixed"） |
| 7 | **对象形态 `emit({type:…})` 家族清扫** | ✅ 闭合 | §9.22 ⇒ R13 commit `4e5be5a`（"the object-form emit family made registrable"）；27 处站点已分类/改名/登记 |
| 8 | **门禁窗口换函数体边界** | ✅ 闭合 | §9.22 待落项 ⇒ R13 commit `4e5be5a`（"hook-gate window replaced"）：`docs §I` 的 700 字符窗口已换成按函数体边界 |
| 9 | **`docs/11 §4.2` 第九条** | ✅ 已落（R12 新增） | 第九条正文在 `docs/11:138`（"每个跳过/豁免/not-run 分支都必须能被反证为红"）＋ **R14 新增两个实例**（§9.26.3 的 ⑤ 与探针② 空过） |

### 9.26.2 ★ 桶① 25 键**逐键三列**（归属面／是否已有落点计划／本轮或下轮）

**取数（关键）**：不逐键读文档 —— 读**权威生成物** `vibe-math-vmu/settings/planned.js` 的 `PLANNED_DEFS`（`docs ⇒ planned.js`，每条 `planned:true`／`def:null`），按 `vmu.<face>.*` 第 2 段分组；"面有没有模块"按 `.js` **或** `<face>/index.js`（R12 的机械规则，`prompt` 是目录模块）。**同时跑** `node tests/vmu-seam-params-consumed.test.mjs` ⇒ **8 passed / 0 failed**（★ 诚实标注：**它量的是 `createKernel` 的接缝参数，不是设置键**；逐键的"谁读它"由生成器自己的 `verdictOf()` 给出——那是**读内核**得到的，`docs/04` 的"承载者"列就是它的产物）。

| # | 键 | 归属面／模块 | 是否已有落点计划（实测证据） | 排期 |
|---|---|---|---|---|
| 1 | `vmu.ballot.freezeMeetingLinked` | ballot／`kernel/ballotbox.js` | **有**：`ballotbox.js` 受控声明＋**复活条件**（`docs/04` 行：★已穷尽） | 下轮（按面的复活条件） |
| 2 | `vmu.ballot.freezeMode` | ballot／`kernel/ballotbox.js` | **有**（同上） | 下轮（同上） |
| 3 | `vmu.ballot.reopenInitiatorScope` | ballot／`kernel/ballotbox.js` | **有**（同上） | 下轮（同上） |
| 4 | `vmu.ballot.reopenSameMeetingOnly` | ballot／`kernel/ballotbox.js` | **有**（同上） | 下轮（同上） |
| 5 | `vmu.paper.retentionMs` | paper／`kernel/paper.js` | **有**：`paper.js` 受控声明＋复活条件（★已穷尽） | 下轮（按面的复活条件） |
| 6 | `vmu.ballotbox.minVotes` | ballotbox／`kernel/ballotbox.js` | 无（内核 83 文件未读、无面声明 ⇒ 真实待办） | 本轮/下轮：**需补读者** |
| 7 | `vmu.collab.exportPolicy` | collab／`kernel/collab.js` | 无；★ 但 R13 已量：**契约薄**（默认值 `"minimal"`、看不出去哪用） | 下轮（先补契约再补读者） |
| 8 | `vmu.collab.federationPeers` | collab／`kernel/collab.js` | 无；★ 同族"契约薄"（只写"数组"） | 下轮（同 7） |
| 9 | `vmu.explain.fairnessDetail` | explain／`kernel/explain.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 10 | `vmu.handover.autoOpenOnEnd` | handover／`kernel/handover.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 11 | `vmu.handover.includeMemoryScopes` | handover／`kernel/handover.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 12 | `vmu.identity.localFormat` | identity／`kernel/identity.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 13 | `vmu.math.formal.coqArgs` | math／`kernel/math.js` | 无 ⇒ 真实待办（Coq 通道） | 本轮/下轮：需补读者（与 15/16 同族） |
| 14 | `vmu.math.formal.coqCommand` | math／`kernel/math.js` | 无 ⇒ 真实待办 | 本轮/下轮：同 13 |
| 15 | `vmu.math.network` | math／`kernel/math.js`＋`kernel/mathtools.js` | 无（**docs/04 的模块列已指到 `kernel/mathtools.js`** ⇒ 落点最近） | 本轮优先候选 |
| 16 | `vmu.math.proof` | math／`kernel/math.js`＋`kernel/mathtools.js` | 无（同上） | 本轮优先候选 |
| 17 | `vmu.meetings.open` | meetings／`kernel/meetings.js` | ★ **不是"缺读者"，而是"不该是键"**：来源卷里**每一次**提及都是**调用形** `vmu.meetings.open()`（`docs/10`／`27`）⇒ 服务面被登记成设置 ⇒ **见 §9.26.3 的 G2 门（具名台账）** | **移出 planned**（不是补读者） |
| 18 | `vmu.prompt.compatMode` | prompt／`kernel/prompt/index.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 19 | `vmu.prompt.order` | prompt／`kernel/prompt/index.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 20 | `vmu.prompt.sections` | prompt／`kernel/prompt/index.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 21 | `vmu.report.bilingual` | report／`kernel/report.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 22 | `vmu.report.language` | report／`kernel/report.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 23 | `vmu.skills.catalogTtlMs` | skills／`kernel/skills.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 24 | `vmu.work.pauseRule` | work／`kernel/work.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |
| 25 | `vmu.work.start` | work／`kernel/work.js` | 无 ⇒ 真实待办 | 本轮/下轮：需补读者 |

**汇总**：**有落点计划 5**（`ballot`×4 ＋ `paper.retentionMs`，都是**面自己给的受控声明＋复活条件**）／**无承载者 19**（其中 `vmu.meetings.open` **1 个应移出 planned**，`math.network`／`math.proof` **2 个落点最近**）／**已有读者（实测矛盾）0**／**具名"不接" 0**（这 25 键都是接线候选；"永不接"的是桶② 的 **89 键/29 面**，那条已按面无载体闭合）。**桶②不需要逐个碰**。

### 9.26.3 ★ R14 门禁侧实测（键判据的真相／幽灵键／两条自证）

1. **调用形豁免：`HEAD` 上已经落地**（我这一轮的**前提是陈旧的**，按"引用前先落一行核验"更正）：`:348`／`:374`／`:399` 三处都带负向前瞻 `(?!\s*\()`，另有"三处必须逐字相同"的漂移断言＋四条自探针（**先旧后新**）。**我这一次运行**：`node tests/audit-vmu-docs.test.mjs` ⇒ **89 passed / 0 failed**（HEAD 原样）。⇒ 本轮**不是"落豁免"**，而是**复核＋补真相＋补牙**。
2. **键判据的真来源＝两写＋两机械＋一条两阶段，不是"三源"**：① `SETTING_DEFS`（core＋`PLANNED_DEFS`，1229 键）；② **手写 `NON_SETTING`（35 名，不是 33）** —— 本轮改为 `tests/audit-vmu-docs.test.mjs` **import** `scripts/generate-planned-settings.mjs` 的那一份（**两份拷贝已经漂移**：审计写 `vmu.dissemination.impact`／`mediaRequest`（**这两个已是真键**），生成器写 `vmu.outreach.*`（**R218 改名前的旧族名**））；③ 家族形（机械）；④ **调用形（机械）**；⑤ **两阶段"有下位名即命名空间"**。★ **`namespaces` 是死豁免（实测）**：它的值**恒为两段**而键正则**要求 ≥3 段** ⇒ 该 filter **永不成立**；现在由自探针 ⑤b **断言**这条，而不再把它当第三个来源。
3. **"减负"我做了、被自己的量具否证（按第八条记）**：把 R108／R270 追加的 **10 个**名字从生成器表里退掉 ⇒ `--check` **STALE，123 键 vs 114**（**新铸 9 个**：`vmu.ip.hold`／`ownership`／`contributors`／`recordSearch`／`transfer`／`vmu.collab.authorship`／`vmu.members.may`／`vmu.tasks.create`…）。**根因：生成器的收集没有调用形规则**（`BROAD_RE` 无前瞻）—— 这条规则**R269 设计过而没落**（`docs/28:1361`）。⇒ **调用形豁免只能止住表继续长大，不能让表缩小**；原子下一步＝**生成器加同一条规则＋重新生成 `settings/planned.js`**（属"可以重新生成的人"）。★ **同一耦合当场又造出两个实例**（并发同事的文档改动）：`vmu.tasks.status()`（`docs/29` 把为绕门拆写的调用**复原**）＋ `vmu.meetings.bindBox()` ⇒ **`--check` STALE 116/114、`vmu-planned-settings` RED（passed=32, failed=7）**。**这不是谁写错文档，而是两处判据必须同改**（§9.8 ⑭ 的原话）。
4. **★ 新门 G2（成果）**：`tests/audit-vmu-docs.test.mjs` 新增"**planned 键不得只靠调用形提及而立**"——来源卷里**每一次**提及都带 `(` ⇒ 该名是**服务面**却被登记成设置（`planned:true, def:null` ＝ 设置表承诺一个不存在的旋钮）。**实测恰好 3 个**：`vmu.dissemination.impact`、`vmu.dissemination.mediaRequest`（`docs/22`）＋ `vmu.meetings.open`（`docs/10`／`27`）。以**具名台账**落：第四个别名 ⇒ 红；修好一个 ⇒ **必须删掉它那一行**（否则红 ⇒ 台账不会陈旧）；另配**合成自探针**（只调用形⇒抓到／键形⇒静默）。
5. **第九条实例（本轮现场）**：那"四条自探针"的 **②** 原本**为错误的理由通过** —— 样本 `vmu.meetings.open` **恰好是真键**（`keys.has` 先豁免）⇒ **从没碰到它名字所指的那条规则**。已把探针改成跑**真正的两阶段判据**（`bogusOf`），② 换成**非键**的父子样本（父被豁免、子仍被报）；③／④ 样本从 `vmu.tasks.status`（**真的会变成 planned 键**）换成**合成名** `vmu.probe.call`。另加 **⑤**：(a) **任何 `NON_SETTING` 条目是真键 ⇒ 红**（正是它抓住审计那份拷贝里两个过期条目的方式）；(b) `namespaces` 恒两段 ⇒ 断言。
6. **读数（每一次都标运行）**：`node tests/audit-vmu-docs.test.mjs` ⇒ **95 passed / 0 failed**（改前 89/0 ⇒ ＋6：探针② 重做、⑤a、⑤b、G2 台账、G2 两条自探针）；**RULE E 指纹集 67＝67 未动**（`tests/audit-declaration-criterion.test.mjs` 打印 `current=67 baseline=67`；该文件**唯一红**是 `regen-all --check`，根因＝上面第 3 条，非本轮断言形状）。
7. **`docs/11 §6.1 ①` 归因更正（★ 陈旧文档行＝假前提，本轮第二次）**：原文写该门"**不扫 `vibe-math-vmu/kernel/*.js`** ⇒ 新内核模块漏登记它不会红"。**实测反驳**（`vmu-pack2` 用该门自带 `PACKAGE_JSON` 接缝指向 `D:\_tmp` 副本、只删 `vibe-math-vmu/kernel/meetingmarker.js`）：**12 passed / 1 failed, EXIT=1**，具名 `vibe-math-vmu\kernel\meetings.js -> ./meetingmarker.js`；`:75-84` 的 `walk(VMU, 0)` **就是扫 `vibe-math-vmu/**`（并含 `tests/`）**。已按第十三条改掉那条声明。★ 真正剩下的洞是**另一格**：**磁盘上有、却没有任何 import 指向它**的出货文件（装载器按**算出的路径**动态 import）⇒ 实测 **7 条**在两份清单之外，静态 import 闭包**结构上看不见**（`docs/audit/` 6 份 ＋ `packs/example-data/README.md`）。
8. **顺手两条**：`package.json#files` **去重**（`tests/_lib/strip-comments.mjs` 曾出现两次 ⇒ **678 → 677，distinct 677**）；`tests/audit-package-membership.mjs:67` 的注释**删掉了它并不做的检查**（`PRESETS` 在该文件全文 **0 次**；`files[] → PRESETS` 那条边归 `audit-installer-policy §8`，**一个事实一个门**）。
9. **回执⇔事实（Lead 派单）**：`tests/vmu-motion-box.test.mjs` 新增 **B5b** —— B5/B6 **只读回执**（`mirrored:true` 是**声称**，不是**票**）；现在**独立回读箱子自己的裁定**（`ballotbox.close({boxId})` ⇒ `detail` 里有 `{by:'m2',choice:'1'}` 且 `tally.cast===1`）。读数：`node tests/vmu-motion-box.test.mjs` ⇒ **23 passed / 0 failed**（改前 22/0）。

### 9.26.4 ★ 两条"量具坏了"（`vmu-pack2` 自陈，进矩阵备查 —— 与第八条同源）

| 假象 | 症状 | 真值来源 |
|---|---|---|
| PowerShell `ConvertFrom-Json` 解析 `package.json` 失败 | 差点据此得出**相反**结论 | Node `JSON.parse` / `require` |
| `Get-Content` 数 `installer.js` ＝ **800** | 与真值不符 | **Node 与字节级一致：810** |

⇒ 纪律：**"同一个数的两种读法"必须指名用哪一把尺**；量具本身要先被校验（本仓既有同型实例：`Measure-Object -Line` 量 `meetings.js` 1200 vs Node `split('\n').length` 1245 ⇒ **以门禁/Node 为准**）。

### 9.26.5 R14 **具名未做**（不写成已做）

1. **生成器加调用形规则＋重新生成 `settings/planned.js`／`docs/04`**（§9.26.3 第 3 条的原子修复）—— 不在验证侧写范围（`settings/**` 非我领地），**且会使 3 个幽灵键消失**，属 Lead 裁决。
2. **7 个"两份清单之外"的文件**：`docs/audit/` 6 份 ⇒ 具名豁免；`packs/example-data/README.md` ⇒ 登记出货 —— **豁免表＋门禁消费（判据 6 条）本轮未落**（`files[]` 与 `PRESETS` 必须同改，否则 `audit-installer-policy §8` 会红；改名+登机能一次做完再验证）。
3. **`docs/04` 的桶① 25 键三列未写进 `docs/04`**：该卷 §11 是**生成区**，手写 `| \`vmu.…\` |` 行会被 `audit-vmu-docs` 的"一行一键"断言（`:429`）误计 ⇒ 三列落在**本矩阵 §9.26.2** 与 `_handoff/vmu/verify-round14-report.md`（**这是刻意的选择，不是遗漏**）。
4. **`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 白名单不含 `ballot`／`boxFor`** ⇒ `audit-seam-reachability` **结构上**看不到这一族（`vmu-core2` 实测）⇒ 与上一轮 `metrics/trigger` 同型：**门的白名单就是门的可见范围**。改它要连 `--check` 新鲜度一起处理 ⇒ **具名留给下一轮**。
5. **`tests/vmu-motion-box.test.mjs:68-73` 的 B5b 已补**（§9.26.3 第 9 条）—— 但 `vmu-core2` 报告里的**另一条**（`vote({motion:null})` 的回执 `tally` 与它自己写的 minutes 矛盾）**不是门禁问题**，是内核语义，未动。

---

## §9.27 ★ R15 · **v13 并入块**（v12 → v13 的差量：R14 全部闭合项 ＋ 本轮门禁落地）

> **口径**：本节是 v13 相对 v12 的**全部差量**。**读的是哪一次运行**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = `4e5be5aef28180514685a364baba405f94036bee`（R13）＋ **R14/R15 的未提交改动**（凡读数处写明）。
> ★ **本轮最重要的一条状态变化**：**R14 那个"T1 唯一真红"已经闭合** —— 生成器拿到了同一条调用形规则。

### 9.27.1 ★ R14 闭合项（并入，逐条给证据）

| # | 项 | 状态 | 证据（读数／文件:行） |
|---|---|---|---|
| 1 | **B③ `overrideOrder` ＋ B④ `flow`**（reader-a／`vmu-comms2`，task-108） | ✅ | `kernel/meetingmarker.js` 247→**492** 行（`ORDER_MODES`／`FLOW_MODES`／`createOrderControls` 等）＋ `kernel/meetings.js` 1182→**1196**/1200（`orderMode` 值域加 `random`:168、`api.flow/overrideOrder/orderView`:393-395、`speak()` 的 `floor`:578）＋ `tools/meeting.js` 新增 `flow`／`overrideorder`＋`docs/08 §25.16`；**59 条断言**（`order14.mjs`）**59/0**；门禁同次运行：`vmu-meetings 161/0`／`vmu-meeting-parity 206/0`／`vmu-kernel 175/0`／`vmu-entry 150/0`／`audit-code-size 9/0`／`audit-enforced-consistency 358/0`／`audit-module-coverage 6/0`／`audit-vmu-docs 95/0`／`audit-doc-vs-code-tables 17/0`／`audit-claim-traceability 5/0`／`audit-package-membership 13/0`／`check-docs PASS`／矩阵 `--check 96 modules/0 mismatches`／RULE E `67=67` |
| 2 | **三幽灵键修复：planned 114 → 111**（R14 §9.26.3 的 G2 台账） | ✅ **闭合** | 生成器 `scripts/generate-planned-settings.mjs` **:221** 新增 `if (/^[ \t]*\(/.test(...)) { excluded.serviceCall.add(k); continue }` ＋ `:189` 的 `serviceCall` 桶 ＋ `:302/:358/:373` 的统计输出；我本轮复核：`--check` ⇒ **`up to date (111 planned keys)`，EXIT=0**；`settings/planned.js` 少 3 键（`vmu.dissemination.impact`／`vmu.dissemination.mediaRequest`／`vmu.meetings.open`）；`vmu-planned-settings` ⇒ **ALL GREEN (planned=111, docs=28, 39/0)**。★ 这正是 R14 我判定的**原子修法**（含"**不要**给 `BROAD_RE` 加前瞻"那条：规则加在 `collectPlannedDefs` 的 wildcard 检查旁） |
| 3 | **G2 台账随之清空（不是"原谅"）** | ✅ | `tests/audit-vmu-docs.test.mjs:498` `const KNOWN_CALL_ONLY = []`（注释写明"REPAIRED, not merely pardoned"）；我本轮把**过期的断言文案**改成"台账为空：fifth 是缺陷、修好即删行"，并复核 **95/0** |
| 4 | **取得↔释放门"自我证伪"**（`vmu-activity2`，task-110） | ✅ | 门自己发出的绿里藏了一句假话：`kernel/storepolicy.js` 被判"不涉及（无取锁）"**是假的**（实测 `acquire ⇒ {ok:true,locked:true}`、`status().locks===1`、二次取具名 `VMU_CONFLICT`）；新增**第五个闭集词 `自持-取释面`**＋机器校验四件事＋`不涉及` 收紧为两段；裁定行**每一行都校验**（`STALE-ROW`）；`他门已守` 的 `slice(0,3)` 截断处补断言。读数：`audit-acquire-release` **23/0 EXIT=0**、`--selftest` **14/0**、`vmu-finally-falsify` **26/0**；RULE E `67=67` |
| 5 | **成员门"有牙但文档说没牙"** | ✅ | `vmu-pack2` 用副本种违规（只删 `vibe-math-vmu/kernel/meetingmarker.js`，`PACKAGE_JSON` 指向副本）⇒ **12 passed / 1 failed, EXIT=1**，具名 `vibe-math-vmu\kernel\meetings.js -> ./meetingmarker.js` ⇒ **门扫 `vibe-math-vmu/**` 且会红**；我据此把 `docs/11 §6.1 ①:218` 的归因更正（第十三条） |
| 6 | **两处"陈旧前提"（我报告并复核的）** | ✅ | ① `task-107` 写"调用形豁免**代码未落**"**是假的** ⇒ 我 `git show HEAD:` 逐处核到 `:348`／`:374`／`:399` 三处负向前瞻＋四条自探针，同门 **89/0** ⇒ 本轮改为**复核＋加固**；② `docs/11 §6.1 ①` 的"门不扫内核"归因与当前文件相反（见 5） |
| 7 | **`docs/29` 债清零** | ✅ | `docs/29` 把"为绕门拆写"的回执**复原为调用形**（`vmu-assistant2`，task-105 A 要求）；此后生成器有了调用形规则 ⇒ 它**不再铸键**；`vmu-planned-settings` **39/0** |
| 8 | **`docs/27 §6` 权威表**（`vmu-pack2`） | ✅ | 把"两处名册"扩成**文件类型 → 清单**权威表＋豁免表形状＋`PRESETS` 归属＋门禁应扩在哪一层；`docs/10 §2` 加指针 |
| 9 | **两条"量具假象"** | ✅ 进册 | ① PowerShell `ConvertFrom-Json` 解析 `package.json` **失败**（差点得出相反结论）⇒ 真值用 Node；② `Get-Content` 把 `installer.js` 数成 **800**，**Node/字节级真值 810**。⇒ 纪律：**"同一个数的两种读法"必须指名用哪把尺**，量具本身先被校验（同型：`Measure-Object -Line` 1200 vs Node 1245） |
| 10 | **`docs/11 §4.2` 第九条** | ✅＋R15 新实例 | 第七条/第八条之外，R15 新增 **⑦ 合成样本必须与被扫集合物理隔离**、**⑧ 门把发现裸写进被扫卷会擦掉发现**（详见 §9.27.3） |

### 9.27.2 ★ R15 本轮落地：**"预设源根磁盘闭包"门**（判据 6 条 ＋ 真实种违规证明）

**问题（R14 由 `vmu-pack2` 结构化定位，我本轮独立复测）**：**静态 import 闭包看不见三类出货文件** —— 装载器按**算出来的路径**动态 import（`vibe-math-vmu.js:734/747`）、pack 纯数据按**目录名 `readFileSync`**、`docs/**` 里既非设计卷也无人引用的文件。**Node 量具复测（我）**：对**全部 6 个 `PRESETS[].src` 源根**做磁盘闭包 ⇒ 只有 vmu 根有缺口，**恰好 7 条**（`docs/audit/` 6 份 ＋ `packs/example-data/README.md`），其余 5 个源根 **0**；7 条**均无任何预设托管**（`managed-by=[]`）。

| 判据 | 落法 | 读数 |
|---|---|---|
| **(e)** 纯数据文件（无 import 指向）未登记 ⇒ **必须红** | **真实种违规**：种 `vibe-math-vmu/packs/example-data/PROBE-planted-pure-data.md` | **27 passed / 1 failed, EXIT=1**，**具名**那条 path；删掉**同一精确路径**（`existsSync` 前后各核一次）⇒ **28 passed / 0 failed, EXIT=0** |
| **(f)** 豁免一条**已消失**的路径 ⇒ 红 | 自探针 2 | 红 |
| **(g)** 豁免一条**已登记**的路径 ⇒ 红（**反漂移主开关**） | 自探针 3 | 红 |
| **c** 豁免逐条带理由／批准人 | 自探针 5（空 reason） | 红 |
| **重复 path** | 自探针 4 | 红 |
| **复审到期** | 自探针 6 `reviewRound <= GATE_ROUND` | **计数**（非红）：实跑打印 `exemptions: 6 named; review due at round 15: 0` |
| **0 号探针** | 干净合成样例必须**安静** | 静默（否则下面六条"红"没有对照） |
| **非空前置** | `diskUnderRoots.length > 0 && PACKAGE_EXEMPTIONS.length > 0` | 215 文件 / 6 豁免 |
| **(h)** `files[]` 重复条目 ⇒ 红 | `duplicateListed` | 0（R14 已去重 678→677） |

**形状（`docs/11 §4.2` 第四/第九条）**：`ok` 数 **13 → 28**；**RULE E 指纹集 `67 = 67` 未动**。
**7 条文件的分档**：`docs/audit/` 6 份 ⇒ **具名豁免**（新文件 `tests/_lib/package-exemptions.mjs`，`{path, reason, approvedBy, approveRound, reviewRound}`，**精确路径、禁通配**）；`packs/example-data/README.md` ⇒ **登记出货**（`package.json#files` ＋ `installer.js PRESETS[vmu].files` **同改**）⇒ `audit-installer-policy` **ALL GREEN**、`audit-installer-compat` **ALL GREEN**（后者会**逐条复制** `PRESETS` 里的文件并断言落盘存在，所以两处必须一致）。
★ **一个事实一个门**：`files[] → PRESETS` 那条边**仍在** `audit-installer-policy §8`（未复制）；本门只做"**磁盘 → files[] ∪ 豁免表**"。

### 9.27.3 ★ R15 两条现场教训（进 §4.2，都是"判据自己"造成的）

| # | 现象（实测） | 纪律 |
|---|---|---|
| **⑦** | 我把 G2 的**合成样本名**写进 `docs/11`（本门扫的卷）⇒ `group G` 立刻报它们**未登记**，门 **94 passed / 1 failed** | **合成样本只留在测试文件里**（或用文档里不可能出现的保留前缀）；"探针样本"与"被扫数据"共处一个命名空间时，**探针的自证与门的结果不再独立** |
| **⑧** | 我把 G2 台账的**三个名字裸写**进 `docs/11` ⇒ 它们各多一次 bare 计数 ⇒ **G2 静默（真值 3 → 0）** | 结论里凡"服务方法"一律**调用形**或**服务限定短写**；★ 该坑本轮**三人各踩一次**（我两处＋`vmu-assistant2` 一处自陈）⇒ **每次改完正文卷立刻重跑该门** |

⇒ 与第五条/第七条/第八条的关系：第五条问"**去哪儿读**"，第七条问"**读的是代码还是散文**"，本条问"**你写结论的那份文本，是不是门要读的输入**"。

### 9.27.4 R15 **具名未做**

1. **`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 白名单不含 `ballot`／`boxFor`** ⇒ `audit-seam-reachability` **结构上**看不到这一族（`vmu-core2` R14 实测；与 `metrics/trigger` 同型：**白名单就是门的可见范围**）。改它要连 `--check` 新鲜度 ⇒ 留下轮。
2. **`docs/04` 的 orderMode 计划值域漂移**（`vmu-comms2` R14 具名，R15 已由 Lead 派给 task-112 ③）⇒ 不在本块。
3. **`vote({motion:null})` 回执 `tally` 与 minutes 自相矛盾**（`vmu-core2` R14 具名）：**内核语义**，不是门禁问题，本边未动。
4. **豁免表的 `reviewRound` 到期是否升级为红**：本轮只做**可见计数**（判据 6 的原文如此），是否升级由 Lead 裁。

---

## §9.28 ★ R17 · **v14 并入块**（v13 → v14 的差量：R16 全部闭合项 ＋ R17 三件）

> **口径**：本节是 v14 相对 v13 的**全部差量**。**读的是哪一次运行**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`；本块所有读数＝**R17 我当时那一次**，逐条标命令。
> ★ **本轮最重要的一条机制发现**：`settings/schema.js` 的 `orderMode` 行**原本在生成块里**（`WIRED-SCHEMA:BEGIN` L1035 – `END` L1369，该行 L1229）⇒ **对生成块里的行做定点编辑必然被 `--write` 覆盖**，且覆盖是**逐字符还原**的。

### 9.28.1 ★ R16 闭合项（并入）

| # | 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | **4 处"从未执行过的断言"**（第九条的**最纯形态**：不是"某次跳过"，而是**永远跳过**） | ✅ 收口 | `kernel/bidding.js`／`board.js` 里 `fired` **0** 次、`enforced` **0** 次 ⇒ **外层** `if (r && Array.isArray(r.enforced))` 永不成立；`ballotbox.js`／`course.js` 里 `fired` **0** 次 ⇒ **内层** `if (Array.isArray(r.fired))` 永不成立。改法：断言脱掉 `if`、`fired` **形状**成为无条件断言、**把死分支断言成事实**并写明复活条件、＋**自探针**（`fired ⊄ enforced` 必须被抓到／合规必须安静／非数组必须判红）。读数：`vmu-bidding-audit 6/0`、`vmu-board-audit 7/0`、`vmu-ballotbox 13/0`、`vmu-course 18/0`（第 4 处为**全仓搜出**的新发现，Lead 已批准收口） |
| 2 | **`board` 日志里的假声明** | ✅ 修 | 该文件顶部 `CAP` 是**死常量**，而日志写"已由上一断言如实记录 ✓"**而那条断言不存在** ⇒ 已补 `CAP` 源文本缺失断言（照 `bidding` 的做法），该句现在为真 |
| 3 | **RULE E shape C 只认单行**（我 R16 发现的盲区；那 4 处正是靠它活下来） | ✅ **R17 已落地** | 见 §9.28.2 |
| 4 | **`reviewRound` 只报告不判红**（Lead 裁决） | ✅ 落地 | `GATE_ROUND` 15→16；输出 `exemptions: 6 named; review due at round 16: 0 (REPORT-ONLY by Lead ruling …)`；**新增自探针 6b**：合成一条**已到期**豁免 ⇒ `due=1` 且 `missing/gone/redundant` **全 0**（到期**永不产生红**）。★ 没有它，日后有人"为整齐"把 `due` 改成红，**没有任何门会察觉裁决被反转** |
| 5 | **(c) 两处兄弟条件式断言**（`vmu-records.test.mjs:475`／`vmu-workflow.test.mjs:451` 的 `if (must.length > 0) ok(…)`） | ✅ **已裁定保持现状** | Lead 裁决：`must` 是**调用方给的期望清单**（空＝本场景无特定期望），与"回执契约"不同；两种改法都有语义后果 ⇒ **记入本矩阵具名项，不改** |

### 9.28.2 ★ R17 ① 原子改：`vmu.meetings.orderMode` 域外值**具名拒**

**先复现（不是猜）**：`node D:\_tmp\v17\repro-orderMode.mjs` —— 改前 **`bogus`／`fifo`／"键缺席"三者读数完全相同**（同一队列序 **且** `status().keys['vmu.meetings.orderMode']` 一律 `"fifo"`）⇒ 状态字段**报出了一个部署从未声明的值**。与 R8 已判缺陷并修好的 `vmu.paper.finalizer` 同型（`paper.js:118-131` 现在具名拒）。

| 步 | 落法 | 读数 |
|---|---|---|
| (a) schema | `type:'enum'` ＋ `domain:['fifo','round-robin','chair','random']`（照 `:60/61/73/74`，**用 `domain`**） | 见 §9.28.3：该行**必须**放在生成块**之外**才活得下来 |
| (b) 读取侧 | 新导出 `strictOrderMode(raw, refuse)`（`kernel/meetingmarker.js`，与 `ORDER_MODES` 同处——它是该值域的单源）＋ `kernel/meetings.js:168` 一行调用 | 域外值 ⇒ `VMU_INVALID_ARGUMENT`，message 点名**键与值域**；`undefined/null/''`（未声明）⇒ 声明的代码默认 `fifo`（零机制）；**`meetings.js` 行数 1199/1200**（预算内） |
| (c) 断言 | `tests/vmu-meetings.test.mjs` 追加两条（`VMU MEETINGS: 163/0`，改前 161/0） | ① 域外值**具名拒**；② **"默认值仍读回 fifo" 与 "bogus 被拒" 两读数必须不同**（把缺陷签名钉住——R8 那个缺陷的签名正是"两者相同"） |

**★ 附带真缺陷（假声明）**：`kernel/meetingmarker.js:321` 原写 `orderMode` **"read LIVE, so a hot change is honoured"** —— **实测为假**：同一实例用**判别性观测**（先让 r-2 发言再排队）在 fifo→round-robin 热改后仍给 fifo 序 `r-2,r-1`，而**新建**的 round-robin 实例给 `r-1,r-2`（对照）。原因：`meetings.js:130` 的 `K` **在构造时构建一次**，`limits: () => K` 返回同一对象。已把注释改成实测结论（不再声称 live）。

### 9.28.3 ★★ R17 机制发现：**生成块里的行不能手改**（＝ R15"丢失的定点编辑"的谜底）

`vmu.meetings.orderMode` 的行**原本在 `WIRED-SCHEMA` 生成块内**（L1035–L1369，该行 L1229）。把 `type` 改成 `enum` 后跑 `node scripts/generate-wired-schema.mjs --check` ⇒ **DRIFT**；`--write` 把该行**逐字符还原**成 `type:'string'`（实测 diff：`BEFORE type:'enum' + domain` → `AFTER type:'string', def:'fifo', doc:"已接线（meetings.js 读取）；默认值取自模块源码"`）。**根因**：该生成器只能从模块的读取恢复**默认值字面量**（⇒ 永远 emit `type:'string'`），而它扫描"已声明"时会**先剔除自己的生成块** ⇒ **块内的键永远被重新 emit**。
⇒ **正解**：把该键**手写**在生成块**之外**（新行落在 CORE_DEFS 手写区，L1042），让生成器把它看作 `preexisting` 而跳过；读数：`332 emitted / 783 pre-existing`（改前 `333 / 782`，**恰好移动一个键**），`--check` = **`schema already in sync`，exit 0**；全文件里该键**只出现 1 次**（`hand-row=true, enum+domain=true, inside-block=false`）。
⇒ **并给生成器装了牙**（`HAND_DECLARED_DOMAINS`，`scripts/generate-wired-schema.mjs`）：这样一条"值域只能手写"的键 **必须**在 schema 里手写、**且不得**出现在生成块中，否则 `problems` ⇒ 红。若不装，**删掉手写行**再让生成器 emit 就会**静默回到 `type:'string'`**，而这正是 R15 那次"提交信息声称已落地、`git log -S` 全历史找不到"的形状——**fs 版本守卫看不见它**（每次写自身都合法）。
★ **一条给后人的操作纪律**：改 `schema.js` 前先看那一行**在不在 `WIRED-SCHEMA:BEGIN/END` 之间**；在块内就只能改**生成器**或**把键移出手写区**，直接改行必然被下一次 `--write` 抹掉。

### 9.28.4 ★ R17 ② RULE E：shape C 的**多行**形态（盲区）—— **先分类，再以"每文件指纹基线"打红**

**先分类（不是先打红）**：`node D:\_tmp\v17\classify-multiline.mjs` ⇒ 语句位置的**多行** `if (…) { …ok(…)… }` 在本树上有 **199 处**，其中**未被既有豁免机制（`EMPTY_ALLOWED`／非空前置）豁免的 125 处**；**逐条读过**后结论：它们**绝大多数是普通场景/特性控制流**（`if (P.dir === 'vibe-math-v4') {`／`if (scn.outcomeDiff) {`／`if (SELF_PROBE) {`／`if (existsSync(…)) {`）。⇒ **一条"一刀切红"的判据会是误报机器**，而且会逼作者到处撒 `EMPTY_ALLOWED`（正是本仓一直打的**白名单漂移**）。**故按 shape A 的同一机制落地：每文件指纹集 ＋ 提交基线**。
**落法**：`tests/audit-declaration-criterion.test.mjs` 新增 **`C2`** 形状（**独立一趟扫描**，另一趟的候选集与基线**不动**）＋ 基线 `MULTILINE_C_BASELINE_FINGERPRINTS`（生成器 `--write-baseline` 一并写，注释留在标记**之外**）＋ `red(additions)`／`red(removals)`。
**判据的窄化（为什么不是误报机器）**：① 只认**语句位置**的 `if`（字符串字面量与变异体的 `find:` 文本不是代码 —— 第七条）；② 花括号配平取块；③ 块内**确有断言**；④ **纯失败报告**（`ok(false, …)`）**排除**——取到该分支**即红**，没有静默跳过。
**读数**：`RULE E fingerprints: current=67 baseline=67`（**A 基线未动**）；`RULE E multi-line C: files=57 baseline=57`；`hits by shape = {C2:125, A:67}`；`audit-declaration-criterion` ⇒ **88 passed / 0 failed，exit 0**。
**相反自探针 6 条（全部在门内、合成输入）**：多行条件式断言**必须被抓到**／带**非空前置**的多行**必须安静**／带 `EMPTY_ALLOWED` 的**必须安静**／**失败报告**必须安静／**字符串里的 `if`** 不算代码／**单行**形态仍由 `C` 抓到（新一趟没有取代它）。
★ **粒度已明写、不夸大**：指纹是 `file:C2:conditional`（**每文件一条**，理由同 ROUND 182 去掉行号）⇒ **新文件**含该形态 ⇒ 红；**已基线文件内新增一处** ⇒ **不红**。**出现次数**与文件数**并排打印**以保持可见；把"次数"本身做成红被否（会惩罚正常重构，同 `A_CLASS_BASELINE` 只做可见计数的理由）。

### 9.28.5 R17 **收尾读数**（原样命令＋退出码）

`vmu-meetings 163/0`／`vmu-settings 47/0`／`audit-settings-channels 58/0`／`vmu-planned-settings ALL GREEN (111,39/0)`／`audit-doc-vs-code-tables 17/0`／`vmu-kernel 175/0`／`vmu-meeting-order 60/0`／`audit-module-coverage 6/0`／`audit-code-size 9/0`／`audit-enforced-consistency 358/0`／`audit-declaration-criterion 88/0`／`audit-vmu-docs 95/0`／`audit-package-membership 29/0`／`audit-pack-value-domain 5/0`／**`regen-all --check` = `15/15 in sync`，exit 0**。
**生成物一并重生成**（都因本轮改动而陈旧）：`docs/04 §11`（设置表，1226 键）／`docs/02`（内核索引，96 模块）／`settings/schema.js`（wired 块 332 键）。

### 9.28.6 ★ R17 追加两件（Lead 派单，并入 v14）

**(甲) `tests/vmu-assistant-host-slice.test.mjs:367` 的**假阴性**修复**（原 `ok(/vibe_vmu_report/.test(transcript))`）

- **诊断（`vmu-assistant2` 在真宿主上实测）**：`transcript` ＝ 驱动器 stdout ＋ JSONL dump ＋ summary；实测该 dump 里工具名 **命中 0 次**（**驱动器从设计上不回声工具名**），而**紧邻两条读会话日志的同义断言是绿的**（`calledFaces` 含它 ＋ `toolResults > 0`）⇒ **假阴性**，与 **R7**"回执只落在会话日志、不在驱动器 stdout"**同类**（`docs/11 §4.2` 第五条）。
- **修法**：把该断言移到**会话日志**上读 —— `sess.toolCalls.some((c) => c.name === 'vibe_vmu_report')`（`sess` 的构造因此上移两行；该idiom 与本文件既有两处一致：`:285` 的 `vibe_vmu_status`、`:212` 的 `calledFaces` 判定）。
- **两方向自探针（我跑，无需真宿主）** `node D:\_tmp\v17\probe-channel-fix.mjs`（用本文件 `readSessionLog` 解析的**同一事件形状** `e.type === 'tool/call'` → `name = e.data.name`）：
  | 场景 | 旧判据（驱动器文本） | 新判据（会话日志） |
  |---|---|---|
  | **调用真的发生**、但驱动器 dump 不回声名字（＝实测的真宿主情形） | **false ← 假阴性** | **true** ✓ |
  | 名字只作为**散文**出现、无 `tool/call` 事件 | **true ← 假阳性**（提及不是调用） | **false** ✓ |
  ⇒ **两个通道在两个方向上都真的不同**，观测量随修法改变（第六条）。
- **读数**：本地（**无活宿主**）`node --check` **exit 0**；`node tests/vmu-assistant-host-slice.test.mjs` ⇒ **`6 passed, 0 failed, 5 not-run`，exit 0**；`--require-host` ⇒ **exit 1**，具名 `NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`（＝未交出可跑宿主，**不是**本次修法造成）。★ **该断言只在真宿主下执行**，故本地只能证到"判据两方向可分"＋"语法/路径无回归"；**真宿主 改前 `16 passed / 1 failed / 0 not-run`（`vmu-assistant2` 实测，会话 `session-d541f03a-ca5a-4dc4-a9ea-78c4c28fbf34`）⇒ 改后预期 `17 / 0`、`--require-host` 退出码 1→0**，待其在宿主上复核一次后落定（我**不**把未跑的读数写成已跑）。

**(乙) 真宿主证据链（照实记，含**限定**）**

会话 **`session-d541f03a-ca5a-4dc4-a9ea-78c4c28fbf34`**，preset **`vibe-math-vmu`**：**16 passed / 1 failed / 0 not-run**（55 s，in 93899 / out 4525，**6 次工具调用**）；**离线复评同一会话** ⇒ **16/0，EXIT=0**；`request/header` ⇒ **78 个工具／其中 52 个 `vibe_vmu_*` 面**；`settingsMerge.sources` ⇒ **5/5 ＝ config**；**宿主自己的 stdout** 打出 `[vmu-report-sink] …` ⇒ 这是**旁证而不是自证**。
★ **限定（照 Lead 要求原样记）**：那次的 `tick` 是**脚本提示词点名要求的** ⇒ 该证据证到的是"**触发器在真指标上真开火并真送达**"，**不是**"**无人要求也会自己开火**"。两条不能互相代替。

---

## §9.29 ★ R21 · **v15 并入块**（v14 → v15 的差量：R20 全部闭合项 ＋ 本轮最终独立复核）

> **口径**：本节是 v15 相对 v14 的**全部差量**。**读的是哪一次运行**：提交 **`d2e45107df3fd8ed65229d259d1cc613dbff9202`**（"round 20 - the pack was never actually loaded…"，Lead 报 **T1 315/315**，29 文件 +1209/−33）。
> ★ **一条方法前提（本轮现场第四次"读数随树漂移"）**：我做最终复核时，工作树上有 `vmu-pack2` **在飞的 task-130 编辑** ⇒ 凡与我复核冲突之处**一律以 `git show HEAD:<file>` 的**内容**重算**，并**并列两个版本**（见 §9.29.4）。

### 9.29.1 R20 闭合项（并入，逐条标注我的独立复核结论）

| # | 项 | 状态 | 我的独立复核（读了哪一版） |
|---|---|---|---|
| 1 | **`plan` 跑 M1 校验器** —— ★ **口径＝"`plan` 校验 `manifest.rules`"**（**不是**"校验 M1 规则"） | ✅ 已落 | HEAD 内容实测：`kernel.rules.validate` 在 `pack.js` 被调用 ✓、**只遍历 `m.rules || []`** ✓、**`validatePack`（纯函数）里没有它** ✓。副作用照实：`apply` 侧码 **`VMU_MIDDLEWARE_FAILED → VMU_PACK_MISSING`**（因 `apply()` 先问 `buildPlan`）⇒ **plan/apply 同因同码**；`pack.js:388` hint 从"报出每一个问题"改成"**报出它能看见的**"（实测仍看不见 M2 模块体）。★ **形状 B（`middleware[{kind:'rules'}]`）不在覆盖内** ⇒ 见 §9.29.2 第 7 项 |
| 2 | **出货 pack 装载缺陷**（`task-129` —— ★ **`vmu-core2` 已具名"未完成"并 release，本轮不记任何装载成功**） | ⏳ **未做（具名）** | 三条真机路线都堵 ＋ **两人独立复算**：`settingsMerge.packs: []`、`sources` 无一个 `source:"pack"`（我按仓库多帧解帧法复算两会话）。★ **两分法**：(i) **进程内真装配＝有效**（我独立探针：3 条 `v5r.artifact-counter::*`、3 次宿主事件 ⇒ `{"tool-results":3}`、`packs:[] ⇒ {}`）；(ii) **真 DSH 会话＝未装载** ⇒ **只有"当已装载"的推断作废**。★ **R21b 只有单方读数**（`vmu-assistant2`；我无真机环境，**未**升级为双人复算）。★ `core2` 的 §0"事实2"**有一处不成立**：我们的入口**确实**读 `ctx.systemPrompt`（`vibe-math-vmu.js:706/708/711`，`inject=['tools']`），而 `ctx && ctx.systemPrompt` 这种真值判断**挡不住会抛的 cordis 服务代理 getter** ⇒ **仓内候选抛点**（见 §9.29.6 的 H1/H2，**待判定，不当结论**） |
| 3 | **`host.js` 三条 ＋ R19 探针形状修正** | ✅ 已落 | HEAD 内容实测：**unload 分支在 manifest 守卫之前** ✓；`:677` **不再**声称"`id` 用于 plan/apply"（旧句已消失）✓；R19 探针 5 红里 **3 条是探针自身形状错**（`meta.id` 不匹配／缺 `capabilities`／缺 `trigger-workflow`），框架当时是**具名拒** |
| 4 | **内联 manifest 两层缺陷 ＋ `[].every(…)` 空过指纹** | ✅ 已落 | ①对象当路径段（`join(…, wanted, rel)`）＋ ②**文档化的 `kind?` 默认值没施加到交付物**（`pack.js:481` 归一化）；`[].every(…)` 恒真那条（`A:busEntries`）已修，`RULE E current=67 baseline=67` ✓ |
| 5 | **v5r M2 计数者** | ✅ 已落 | `v5r.artifact-counter` 三条总线条目（政策表三钩子）＋ `packs:[]` 反例 ⇒ **两种边界我自己量过**；两变异（hook 17/9、silent 24/2）我复跑过；**该模块 bus 条目里没有 `agent/turn-stopping`**（S5 结构成立；入口的 `ctx.on` 有它是**报告**的边界，两者不要混读） |
| 6 | **纪律三则＋** | ✅ 入册 | 见 §9.29.2 |
| 7 | **形状 B＝死条目**（`task-130`，**pending**） | ⏳ 待修 | **我与 `vmu-pack2` 各自独立、两谓词 × 两 emit 模式**复现：A（`rules[]`）**触发**（deny `VMU_ALWAYS`／`VMU_TOOL`），B（`middleware[{kind:'rules'}]`）**不触发**；**"payload 去掉 `tool` ⇒ A 也静默"** 的活谓词对照排除形状假象。机制＝`bus.js:445` 对 `kind:'rules'` **豁免 handler 要求** ＋ `:661` 只记 `audit({what:'middleware/skipped', why:'no handler attached'})`。★ 定性＝"**声明了不生效**"的**静默空转**（**非安全绕过**：无 `api`、无 handler）；★ **非本轮引入**（task-128 的新块只遍历 `m.rules`）；★ **零兼容代价**（出货包 `kind:'rules'` 全在 `rules[]` **条目内部**；`middleware[]` 里 **0 个**） |

### 9.29.2 ★ 纪律（本轮入册，全部有现场代价）

1. **两向断言必须让"被判定的那一行"真的走红** —— `vmu-pack2` 自陈：第一版测试把 `kind:'module'` 写进 manifest ⇒ **缺陷2 的复原也是绿的**（观测点绕过了被测行）；改成**省略 `kind`**（文档化的普通写法）后才测到。⇒ **"能红"要问"红的是不是我判定那一行"**。
2. **读数必须绑定版本，且在最后一次编辑之后重跑** —— `vmu-comms2` 的 `silent ⇒ 23/2` 是**早于它自己补 `U0`** 的读数（我**用算术**抓出：`23+2=25 ≠ 干净跑的 26`）；改成 **24/2＋哈希绑定**，并把纪律升级为"**变异/门禁读数必须在最后一次编辑之后重跑**"。
3. **放弃／转出要汇聚成"悬空清单"** —— "每个人都以为别人有"：R19 `task-122`、R20 `pack.js` 的 plan 缺口，两次都是**两边合规让开 ⇒ 结果无主**；机制化＝**每次具名转出都在板上留一个可见 pending**。
4. ★ **`JSON.stringify(<Promise>)` ＝ `"{}"` —— 半对的坏读数最危险**：我漏 `await` 时，同一个 `{}` 同时给出"B 不触发"（**对**）与"A 也不触发"（**错**）⇒ **按'假设被部分证实'收下整条结论就是全错**。**可判别签名**：**一个本该有字段的对象却序列化成 `{}`**；或直接 `if (typeof x?.then === 'function') throw`。★ 与既有两条量具假象同族（`ConvertFrom-Json` 解析失败却差点得出**相反**结论；`Get-Content` 数 `installer.js` **800** 而 Node 真值 **810**）⇒ **量具坏了会给出自信的错误答案**。
5. **"读会话日志"本身是有版本的读法**：one-shot `zstdDecompressSync` 只出 **2 行**（多帧 zstd），那 2 行**看起来像证据**；正确＝按 zstd magic 切帧（仓库已有 `scripts/dsh-drive.mjs:206-215`／`tests/vmu-assistant-host-slice.test.mjs:101-111`，后者注释已写"one-shot 会停在 frame 1"）。⇒ 凡"我没看见某回执"的结论，**先证明解码看到了全部帧**。
6. **"我没找到"≠"它不存在"的续**：`R21b`（`config.packs` 打断组装）**只有 `vmu-assistant2` 的单方读数**（我无真机环境）⇒ 记账时**不得升级为"双人复算"**；`vmu-pack2` 也主动拒绝了这种升级。

### 9.29.3 最终独立复核（提交 `d2e4510`）

**门禁（我这一轮同一次运行）**：`audit-declaration-criterion` **88/0**（`RULE E fingerprints 67=67`、`multi-line C files=57 baseline=57`）、`audit-package-membership` **29/0**、`vmu-settings 47/0`、`vmu-meetings 163/0`、`vmu-kernel 175/0`、`vmu-entry 150/0`、`vmu-metrics-counter 26/0`、`vmu-pack-inline-manifest 35/0`、`vmu-pack-plan-rule-validate 21/0`、`vmu-pack-tool-actions 17/0`、`vmu-resume-token-contract 14/0`、`audit-enforced-consistency 358/0`、`audit-installer-policy ALL GREEN`、`audit-pack-face`／`audit-tool-table` exit=0、**`regen-all --check` ＝ `15/15 in sync`**、`files[]` **687/687 distinct**。
**结构性断言（一律对 `git show HEAD:<file>` 的**内容**重算，不受工作树影响）**：`pack.js` 调 `rules.validate` ✓／只遍历 `m.rules` ✓／`validatePack` 内无它 ✓；`host.js` unload 先于守卫 ✓／`:677` 旧句已消失 ✓；`schema.js` 的 `orderMode` 是 **`enum`＋`domain` 且位于生成块之外** ✓（R17 的修复在提交里存活）；`bus.js` 的豁免行与外泄审计行俱在 ✓。

### 9.29.4 ★ 本轮复核**新发现**两条（都是"门禁/评审自己"的问题）

**(甲) `audit-vmu-docs` 的代码侧**读注释**（第七条现场：门禁把散文当代码）**：该门用 `CODE_LITERAL_RE = /['"`]((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})['"`]/g` 对**整文件原文**跑、**不去注释** ⇒ `vmu-pack2` 在 `kernel/pack.js:506` 的**注释**里写 `` `VMU_ALWAYS` / `VMU_TOOL` ``（形状 B 实验的探针码）⇒ 门当场 **94/1**。**我算过归因**：HEAD 版被引号码 9 个**全部已登记**；**工作树新增的恰好是 `["VMU_ALWAYS","VMU_TOOL"]`** ⇒ **提交版绿、在飞编辑红**。⇒ **建议（需派单）**：该门代码侧先过 `tests/_lib/strip-comments.mjs`（仓库已有，依赖环门禁在用）＋**双向自探针**（**注释里**的码不计入／**字符串里**的码必须仍计入）。★ **不要**用"让作者改写注释"当修法 —— 那是 R10 记过的"**门禁指挥措辞**"反模式。
**(乙) 第四次"读数随树漂移"——这次发生在**我自己的最终复核**里**：我在提交后立即复核，撞上 `vmu-pack2` 正在写 `pack.js`＋两个测试（task-130）⇒ 我的第一轮门禁读数里 `audit-vmu-docs` 是红的。**处置**：改对 `HEAD` 内容重算（§9.29.3），并**两版并列**（提交版绿／工作树因在飞编辑红）。⇒ 纪律 **第 2 条对"复核"同样适用**。

### 9.29.5 本轮**悬空/未闭合**（具名，交 Lead 派单）

| 项 | 状态 | 备注 |
|---|---|---|
| `task-129` 出货 pack 装载（`config.packs` 打断组装） | ★ **未做（`vmu-core2` 具名并 release）** | 三条真机配方与两分法已入册；**不记任何装载成功**；真机判定归 `vmu-assistant2`（`task-131`）＋见 §9.29.6 的 H1/H2 |
| `task-130` 形状 B 死条目（改走 `toBusEntries`）＋ `docs/18:145`／`docs/10:512-514` 收窄 | **pending，unowned** | 行为变更（合法规则会开始真开火）**已裁决接受**，须在 docs 与报告里具名；零出货包受影响 |
| **(甲) `audit-vmu-docs` 代码侧去注释＋双向自探针** | **未派单** | 我的领域，但属新工作；本轮只报不改 |
| `vmu-meetings.orderMode` 之外的**共享 `oneOf` 回落**（`tier`／`attendanceMode`／`quorumLossPolicy`／`budgetOnExceed`／`leaveEarlyPolicy`／`minutesDetail` …） | **未派单** | R17 只按裁决收了 `orderMode`；全局 `oneOf` 的 blast radius 不同，需单独裁决 |

### 9.29.6 ★ 第 8 项：**`packs` 是否为 DSH 预设行保留键** —— **待判定（不当结论）**

**来源**：`vmu-core2` 在 `task-129` 的**未验证假设**：R21b 的 `agent-preset/invalid … cannot get property "systemPrompt" without inject` 抛错在 **cordis `lib/index.js:676`**（服务代理），且对照＝R18/R21 同层**无 `packs`** 时正常；⇒ 猜测 `packs` 可能是 **DSH 预设行的保留键**（DSH 拿它去解析名为 `v5r` 的包 ⇒ 装配残缺 ⇒ 未注入）。
**★ 状态：待判定**。决定性对照实验＝ **`task-131`**（把同层键换成 DSH 不认识的键名 ⇒ 能起来则假设成立），已派 `vmu-assistant2`；**修法随判定分叉**，本节**不把假设写成结论**。

**★ 我复核时发现的一条**仓内事实**（它会参与判定，故必须并列，但同样**不构成根因结论**）**：
- `vibe-math-vmu/vibe-math-vmu.js:706`：`if (effectivePrompts.length > 0 && ctx && **ctx.systemPrompt** && typeof ctx.systemPrompt.section === 'function')`（`:708`/`:711` 又各读一次）；而 `export const inject = ['tools']`（`:51`）⇒ `systemPrompt` **未被注入**。
- cordis 的服务代理对**属性访问本身**就抛（`cannot get property "…" without inject`）⇒ **`ctx && ctx.systemPrompt` 这种真值判断挡不住会抛的 getter** ⇒ **仓内存在一个与错误文案相容的候选抛点**。
- ⇒ 于是有**两条竞争假设，均未排除**：**H1**＝`packs` 为 DSH 保留键（装配残缺）；**H2**＝**我们自己在 `:706` 访问未注入的代理**（R21b 只是改变了 DSH 是否装配 `systemPrompt`）。
- **可判别的下一步（成本＝一行＋一次复现）**：把 `:706` 的访问包进 `try/catch` 打 `err.stack`（或先打印 stack），看抛点是否 `vibe-math-vmu.js:706`。★ **建议先排除 H2 再做 `task-131` 的改名实验**，否则该实验的两种结果都可能被 H2 解释掉。★ `D:\_tmp\r21b-session.log` 里**只有错误文案、无任何 stack 帧**（我读过）⇒ 从该日志**判定不了**。


---

## §9.30 ★ R22 · **v16 并入块**（v15 → v16 的差量：目标 6 机制层齐备 ＋ 第 8 项结论 ＋「测量环境的同一性」＋ payload 前置机械化）

> **口径**：本节是 v16 相对 v15 的**全部差量**。**读的是哪一次运行／哪一版 payload**逐条注明；提交基线 **`5b15562`**（工作树 clean）。
> ★ **本轮的元教训**：**"我改了代码 ⇒ 我的实验测到了它"是一个需要证明的假设**（见 §9.30.4）。

### 9.30.1 ★★★★ 目标 6 机制层**三段齐备**（arm E：**根因是一行配置**）

**arm E**（`vmu-assistant2` 真机会话；**跑前已核 payload hash ＝ 仓库**）：`session-6ca9fefd-4b10-4e3b-a795-32c70ff2a5ae`（17:42:42，**44 events／43 s／221,841 tokens**，driver **exit 0**，`turn/end: completed`）。**只加了一行 `root:`**：
- 那条 `vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root` **消失**（stderr 1104 B 只剩 prompt-section 具名降级＋stack）；
- `registrations`／`bus.entries` **非空**：`{"id":"v5r.artifact-counter::tools/result","kind":"module","on":["tools/result"],"capabilities":["trigger-workflow","record"],"hits":2,…}`，`hooks` 含 `tools/result`；
- ★ **`[vmu-report-sink] {"name":"tool-results-met",…,"text":"【阈值·已达】tool-results=5 ≥ 1","drives":false}`**；
- `report/tick` 调用 **0**（多帧解码 44 events）；高位阈值 **0 条**；`library.present:true`；外部旁证 `durable\vmu\state.json` 817 B ＋ `audit/2026-10-15.jsonl` 2305 B；
- ★ **单因子证死**：E 去掉那一行与 **arm A 逐字节相同** ⇒ **因果，不是相关**。

**根因链（原样入册）**：**装配缺 `config.root` ⇒ `apply()` 具名拒（`VMU_ENGINE_UNAVAILABLE … no library root`）⇒ 总线空 ⇒ 不订阅 ⇒ 无观察 ⇒ 阈值不可能开火**；**加一行全部通过**。
⇒ **三段齐备**：① 触发器会开火并送达 ② **无人要求也会开火**（R18 `turn-end-duty`；本轮在**当前树**上再次出现）③ **阈值型也能自主开火**（arm E）。

### 9.30.2 ★ 两条"**没证到**"必须并列（不许解释掉）

| # | 形态 | 处置 |
|---|---|---|
| 1 | **"回执说 pack 合并了、事实被具名拒"**（arm A 无 `root`：`settingsMerge.packs:["v5r"]`，而 `apply()` 实际被拒） | ★ **误导形态**：**设置侧 DATA 路与 `apply()` 是两条路**（入口独立把 `packs/<id>/settings/defaults.json` 当 DATA 折入）⇒ **"设置进了"≠"装配成功"**。入册为一条**回执可被误读**的现场 |
| 2 | **`hits:2` vs 报告文本 `tool-results=5`** | ★ **原样待解**：**不许**解释成"计数没错"或"计数坏了"；已派下去 |
| 3 | `systemPrompt` **仍不可达**（具名降级 `VMU_EXTERNAL_UNAVAILABLE`） | ★ **分别记**：**不影响** pack 装载与阈值开火，**不混成一条** |

### 9.30.3 第 8 项结论：**H1 被推翻、H2 确认并修好**（`vmu-core2` ＋ `vmu-assistant2` 两人独立）

- **H1（`packs` 是 DSH 预设行保留键）⇒ 推翻**：arm D 的冒烟枪（其判别逻辑**不依赖**新修复）；且**改名臂不具判别力**（`packList:` ⇒ 不装载 ⇒ 不读 `systemPrompt` ⇒ 会话当然起得来，与 H1 同真）⇒ **arm B/C 不跑**；只有 arm A 修后仍崩才回头。
- **H2（仓内候选）⇒ 确认并已修**：`vibe-math-vmu.js:706` 读**未注入**的 `ctx.systemPrompt`（`inject=['tools']`），cordis 代理**访问即抛**，真值守卫挡不住；`:230-243` 把 pack 的提示词数据 push 进 `effectivePrompts` ⇒ **只有真装了 pack，`:706` 才第一次执行** ⇒ **文档化的装载点恰在开始生效那一刻打死会话**。探针：`packs:[]` ⇒ getter touched **0**／`packs:['v5r']` ⇒ **1**。修法＝受保护探测 ＋ **不吞**（stderr 含 `err.stack`）＋ `status().promptSection` 具名降级，复用**已登记**码 `VMU_EXTERNAL_UNAVAILABLE`；常驻守卫 **6/0**。
- ★ **本矩阵的贡献**：**是 vmu-verify2 的"我们仓内 `:706` 是候选抛点"这条更正**（对 `vmu-core2` §0"抛错不在我们仓"）把它**从假设推到确认**。

### 9.30.4 ★★「**测量环境的同一性**」一节（三件并列 ＋ 本轮机械化）

| # | 检查 | 现场代价 |
|---|---|---|
| 1 | **payload 哈希**：报告真机读数前，先证 **宿主实际加载的 payload ＝ 仓库**（并按 payload 分档，不整批作废/保留） | **陈旧快照**：`r17-home` 的 entry `13DA3E536C9187BF`（00:29:09）vs 仓库 `EA836778F2197B12`（17:13:49）；**文件级 Delta＝10 个文件不同 ＋ 1 个只在仓库**（`artifact-counter.js`）⇒ 那份 payload **连 R17 的 orderMode 修复都不在** |
| 2 | **解码帧完整性**：one-shot zstd 只出 **2 行**、**看起来像证据**；须按 magic 切帧（`dsh-drive.mjs:206-215`） | "我没看见某回执"可能是**解码器造成的假否定** |
| 3 | **`await` 指纹**：`JSON.stringify(<Promise>)＝"{}"`；**半对的坏读数最危险**（同一个 `{}` 同时给出"B 不触发"（对）与"A 也不触发"（错）） | 签名＝**本该有字段的对象却序列化成 `{}`** |
★ **目录更正（本轮）**：陈旧那份在 **`r17-home`**（不是 `r18-home`——后者已于 17:13:49 **就地刷新**为仓库内容）⇒ 按 `r18-home` 复核会得出"没这回事"。另登记两份旧副本：`D:\_tmp\dshvmu\.agent-presets\…`＝`3987956D1C45D6CF`（10-09）、`D:\_tmp\smoke-home\.agent-presets\…`＝`58519773CB5184BC`（10-14）。
★ **两条硬推论**：(i) **"R17 的 `orderMode` 修复从未被任何 `r17-home` 家族的宿主执行过"**（R17 的证据全是**进程内装配＋门禁**）⇒ **不得引用成"真机已验"**；(ii) `r18-home` **刷新前**的会话 payload 状态**不可回溯**（同路径被覆盖）⇒ **既不断言当前树、也不断言陈旧**，除非当时留了哈希。

**★ 机械化已落（Lead 批准后，本轮提交完成 ⇒ 条件满足）**：`tests/vmu-assistant-host-slice.test.mjs`
- 新增 **`payloadsAgree(repoDir, payloadDir)`**（**纯函数**，返回 `{files, missing, extra, differing}` ⇒ 红时**逐个具名**漂移文件）＋ **`findHostPayload(home)`**（在 scratch home 下有界找 `node_modules/dsh-vibe-math/vibe-math-vmu`）；
- **host 分支开头两条前置**：① payload **已定位**（否则"跑的是哪个字节"不可答）；② **每个 payload 与仓库逐字节相同**（`missing/extra/differing` 全空）—— ★ **不是"容忍陈旧哈希"的白名单**（`allow stale` 是这类前置绝不能变成的东西）；
- **两向自探针 4 条**（常驻、无需宿主）：精确副本**安静**／**改一字节**具名／**缺一文件**具名（旧快照形状）／**只多一文件**具名；
- 读数：`vmu-assistant-host-slice` **10 passed / 0 failed / 5 not-run，exit 0**（改前 6/0/5 ⇒ **＋4＝那 4 条自探针**）；`--require-host` **exit 1**（无宿主时如实 not-run）；**`RULE E 67=67`**、`audit-vmu-docs 99/0`（零副作用）。
- ★ **限定**：两条 host 前置**只在真机分支执行**（本地无法产生读数）⇒ 本轮证到的是**判据两向可分**（自探针）＋**零副作用**，**不是"真机已过"**。

### 9.30.5 其余 R21/R22 闭合项（并入）

| 项 | 状态 |
|---|---|
| **task-133 门禁代码侧去注释** | ✅ 已落（`stripComments` 默认模式：注释空格化、**字符串保留**；4 条双向自探针；`Mutants M4` 仍红 ⇒ 真引用没被去掉）；`audit-vmu-docs` 95→**99/0** |
| **task-134 "半装"分叉** | ✅ 复核：**当前树两叉都不成立**（进程内真入口 `handle.packErrors()＝[]` ＋ 3 条 `v5r.artifact-counter::*` 上总线）⇒ 与**陈旧 payload** 相容（限定：不写成"已证是快照造成"）。★ 并具名**访问器在入口句柄**（`vibe-math-vmu.js:982`），`kernel.status()` 里**没有** ⇒ 建议写进 `docs/03`/回执 |
| **task-130 形状 B（死条目）** | ✅ 已修：`middleware[{kind:'rules'}]` 改走 `kernel.rules.toBusEntries`（与 `manifest.rules` **同一条路**）⇒ 校验/编译/真触发一起成立；`buildPlan` 校验扩到两种声明位置；**行为变更具名**（合法规则开始真开火）＋**零出货包受影响**；两半各自可证伪（32/2、33/1） |
| **task-129 出货 pack 装载** | ⏳ 未做 → 已由 H2（§9.30.3）解释大半；`vmu.packs.active` **仍不是真开关**（只经 `packsDeclared` 让工具可达）⇒ 与"半装"**分开记** |
| **`docs/18:145`／`docs/10 §9.5` 措辞** | ✅ 已收窄为"`plan` 校验 **`manifest.rules`**"／"运行期**只吃内联 manifest**、随包 pack 只能走 profile 行" |

### 9.30.6 具名未闭合／待派单

1. **`hits:2` vs 报告文本 `tool-results=5`** —— 原样待解（已派）。
2. **`vmu.packs.active` 不是真开关**（R21/R22 装载线的洞）—— 待真机判定后由 Lead 基线裁决。
3. **共享 `oneOf` 回落**（`orderMode` 之外至少 6 处）—— 下轮。
4. **`plan` 仍看不见 M2 模块体**（已裁不把 loader 拉进 `buildPlan`）—— 保持具名。
5. **`systemPrompt` 仍不可达**（具名降级）—— 不影响装载与阈值开火，**单独记**。

### 9.30.7 ★ R22 追加：**「测量环境的同一性」第 4 件 —— 异步装载的 settle 前置**（`vmu-core2` 自陈 ＋ 我独立复现）

**现场（`vmu-core2` 在 task-136 自陈）**：他首跑 C 臂读到 **`packErrors` 为空** —— 不是"没被拒"，而是**探针抢跑**：入口的 pack 装载是**相对 `ready()` 的 fire-and-forget**（装载循环里 `await packLoader.apply(manifest)` 在 **`vibe-math-vmu.js:898`**，而 **`ready()`（`:1028`）只 await `[started, opened, adapter.status(), idsHydrated, resumed]` 五个**，**不含**装载那一段）⇒ 加 250 ms settle 后读数才对。

**我独立复现（`node D:\_tmp\v24\verify-race.mjs`，四臂各读两次：`ready()` 后立即／250 ms 后）**：
| 臂 | 立即 | 250 ms 后 | |
|---|---|---|---|
| **A** 设置路线＋`root` | `entries=3, packErrors=0, applied=1` | 同 | |
| **B** 什么都不声明 | `0 / 0 / 0` | 同 | |
| **C** 设置路线、**无 `root`** | `entries=0, **packErrors=0**, applied=0`（同时 stderr 一行） | `entries=0, **packErrors=1**, applied=0` | ★ **RACE：探针跑在了装载前面** |
| **D** `config.packs`＋`root` | `entries=3, 0, 1` | 同 | 与 A **同一条路、同读数** |
⇒ ① **他们的四臂结论成立**（A＝真开关生效／B＝不声明不装／C＝**具名拒** `VMU_ENGINE_UNAVAILABLE … no library root` 记进 `packErrors`／D＝与 A 逐条相同 ⇒ 不是第二条路）；② **竞态是真的、且只在"失败臂"上显现**（成功臂的条目/计数在 `ready()` 时已就位 ⇒ 立即读与 settling 后读相同）。

**★ 对我自己先前读数的处置（不许假设、只许测）**：我在 R21/R22 报给 `vmu-core2`/Lead 的那条读数（`handle.packErrors()＝[]` ＋ 3 条 `v5r.artifact-counter::*`）**在加 settle 后重测【不变】**（`entries=3, packErrors=0, applied=1`，立即与 250 ms 后一致）⇒ **那条读数不需要撤回**；但**它之所以安全，是因为我这次补测了**，而不是因为"我当时觉得没问题"。

**⇒ 纪律（并入「测量环境的同一性」家族，第 4 件）**：**凡读 `packErrors`／`appliedPacks`／`bus.entries` 的断言，必须先让装载落定**（等 settle 或等一个与装载完成挂钩的信号）—— 否则**测的是自己的竞态**，而它在**成功臂上会伪装成"没问题"**（这正是本条最阴的地方：失败臂才现形）。★ 与前三件同族：**payload 哈希**（跑的是哪个字节）／**解码帧完整性**（日志读全了吗）／**`await` 指纹**（`JSON.stringify(<Promise>)＝"{}"`）／**装载 settle**（异步任务落定了吗）。

### 9.30.8 ★ R22 追加（二）：**§9.30.2 的第 2 条「`hits:2` vs `tool-results=5`」—— 判定 `(i)` 两数自洽、非缺陷（两人独立）**

**结论（框架先行，免得被读成两种偷懒说法之一）**：**既不是"计数没错"，也不是"计数坏了"**，而是 —— **同一个量在两个时刻／两份 artifact 上的采样**：`hits` 是**会话内某一次 `vibe_vmu_status` 回执渲染当时**的快照；`tool-results=5` 是**回合边界**渲染的。

**`vmu-comms2` 的机制（`kernel/bus.js`）＋ 我的逐条独立复核**：
| 事实 | 我的读数 |
|---|---|
| `hits` 语义＝快照 | `:478` `const hits = new Map() // id -> times it returned a decision` ✓；`:666` 调 handler；`:681` `undefined/null` **不计**；`:696` 过能力校验后 `+1`；`:728` `status()` 原样曝出 ✓ |
| handler 五条返回路径**都不返回 `undefined`** ⇒ `hits` ≡ 到达事件数 | `packs/v5r/middleware/artifact-counter.js` 的 **L79/86/102/107/113** 全返回对象 ✓（L58 是内部查表 helper，`row ? row.indicator : null`，不是 handler 出口） |
| 每事件恰一次观测（`value=1`，无循环） | 机制一致（我未逐行复读该段，**署名 comms2**） |
| **payload 形状**：Lead 的"一次带 N 条" | ★ **否证**：我**自己解码**该会话 ⇒ **5 次 `tool/call`（#18 `vibe_vmu_report`／#23 `vibe_vmu_set`／#28 `vibe_vmu_status`／#33 `pwsh`／#38 `pwsh`）↔ 5 条 `tool/result`（#19／#24／#29／#34／#39）按序 1:1** |
| 桥侧每监听器一次 `bus.emit` | `host-hooks.js:153` `decided = await kernel.bus.emit(hook, payload, { bridge: true })` ✓（★ 注意这条**是 `await` 的**——与"装载相对 `ready()` 是 fire-and-forget"（§9.30.7）恰成对照） |

**★ 我的决定性独立计数（不依赖 comms2 的套件）**：`node D:\_tmp\v24\verify-hits-vs-observations.mjs`
- 会话：`D:\_tmp\r18-home\sessions\--D-_tmp-r18-ws--\session-6ca9fefd-4b10-4e3b-a795-32c70ff2a5ae\session.v4.jsonl.zstd`，zstd **sha256[0:16]＝`09D1D43DBEFF28C6`**（与 comms2 所引**逐字相同**），**44 events**（多帧解帧法）；
- **`hits":2` 只在 `#29` 出现一次**；★ **该行渲染时"已完成的结果"＝2**（calls 3/ results 2）⇒ **快照语义在事件序上直接可算**；
- `tool-results=5` 在 **`D:\_tmp\r131E-boot.log`（sha `B50782CD9BBEB0E1`）第 3 行 sink**，第 2 行即 `turn-end-duty`⇒ **与前者【不同 artifact、不同时刻】**。
⇒ ★ **这条从"原样待解"改判为"两数自洽（两人独立）"**，并保留其**误导形态**的教训（两数**分属两份 artifact**，谁把它们并排比较谁就会以为"对不上"）。

**⇒ 纪律（并入「测量环境的同一性」，第 5 件）**：**同刻同源** —— **比较两个读数之前，先证明它们取自【同一时刻】且【同一 artifact】**（本条现场：一个是会话内回执、一个是 boot.log 里的回合边界 sink）。五件并列：**payload 哈希**／**解码帧完整性**／**`await` 指纹**／**装载 settle**／**同刻同源**。

### 9.30.9 ★ R22 追加（三）：**观测的因式分解 —— `sum` 只钉乘积，原始行才分开钉因**（`vmu-comms2` 提出，我独立复现）

**为什么值得单列**：§9.30.8 的结案依赖"**每事件恰 1 次观测、`value=1`**"这个机制。而 `metricValues()` 的 `sum`**只钉住乘积**（`events × observes/event × value`）—— ★ **同一个 `sum=5` 既可能是"5 事件 × 1 观测 × 1"，也可能是"1 事件 × 1 观测 × 5"**，**光看 `sum` 分不开**。`vmu-comms2` 因此改读**原始行**（`kernel.metrics.series({name})`）。**我独立复现**（`node D:\_tmp\v24\verify-observe-rows.mjs`，真入口＋`packs:['v5r']`＋**settle 250 ms**）：
```
at rest            rows=0   sum=undefined(无键)                          ← 无伪造 0
after ONE event    rows=1   values=[1]   kind="read"   by="v5r.artifact-counter"
after FIVE events  rows=5   values=[1,1,1,1,1]   sum=5                   ← 每行 value=1 ⇒ 两因子分开钉死
```
⇒ **"1 事件 ⇒ 1 行、该行 `value=1`"由两人各自量到**；`5 行 / sum=5` 是**推论**，不是前提。（附注：`kernel.metrics` 提供 **`series`**，**没有** `count` 方法 —— 用 `series` 取原始行；`series({name})` 的返回即行数组。）
**⇒ 纪律（与"判据要能在两档间真的不同"同族，并入观测方法学）**：**凡结论建立在"某汇总值"上时，先问该汇总钉的是乘积还是因子；乘积型的汇总要用原始行把它分解开**，否则两个不同的机制会给出同一个读数。

---

## §9.31 ★ R25 · **v17 并入块**（R24 → R25 的差量：core2 五项复核 ＋ 五件「测量环境的同一性」升为**可引用编号节**）

> **口径**：★ 本轮复核**横跨一次在飞落地**（`vmu-core2` 的 `task-138` 在我复核中途落到工作树）⇒ **同一项我有两版读数，一律并列并逐条绑哈希**；凡结论都写"读的是哪一版文件"。
> 版本锚点（我实测的两版）：**P1**＝entry `05EC689D4AFE3BC2`（1043 行）／`host.js 8A9EC072DBFD6CF7`；**P2**＝entry `158295C05917AFC0`（1106 行）／`host.js C9F597A24CB8C933`。

### 9.31.1 ★★ 五件「测量环境的同一性」——**可引用编号节**（Lead 要求；由 §9.30.4／§9.30.7／§9.30.9 升格）

| 编号 | 名称 | 一句话判据 | 现场 |
|---|---|---|---|
| **M-1** | **payload 哈希** | 报告真机读数前先证**宿主实际加载的 payload ＝ 仓库** | `r17-home` 快照 `13DA3E536C9187BF` vs 仓库 `EA836778F2197B12`（10 文件不同＋1 只在仓库）；**前置已机械化**（§9.31.1b） |
| **M-2** | **解码帧完整性** | one-shot zstd 只出 2 行、**看起来像证据**；须按 magic 切帧 | `dsh-drive.mjs:206-215` |
| **M-3** | **`await` 指纹** | `JSON.stringify(<Promise>)＝"{}"`；**半对的坏读数最危险** | 我 R24 的 "A 也不触发" 假读数 |
| **M-4** | **装载 settle** | 读 `packErrors`／`bus.entries` 前先让装载落定 | `C` 臂 `packErrors` **0→1**（R24 复现）；R25 起 **`ready()` 自己等装载**（§9.31.2-5） |
| **M-5** | **同刻同源** | 比较两读数前先证**同一时刻且同一 artifact** | `hits:2`（会话内 `#29`）vs `tool-results=5`（`r131E-boot.log` L3）⇒ §9.30.8 结案 |
| **M-6** | **因式分解** | 汇总值只钉**乘积**；因子要用**原始行**分开钉 | `sum=5` 既可能 5×1×1 也可能 1×1×5；`series({name}).items` 1 事件＝1 行 `value=1`（§9.30.9） |
**M-1b · 前置机械化（已落，`tests/vmu-assistant-host-slice.test.mjs`）**：`payloadsAgree()`（纯函数，红时逐个具名 `missing/extra/differing`）＋ `findHostPayload()`；host 分支两条前置（**payload 已定位** ＋ **与仓库逐字节相同**，**不是"容忍陈旧哈希"的白名单**）；**4 条两向自探针**（精确副本安静／改一字节／缺文件／多文件）。读数：**10 passed / 0 failed / 5 not-run，exit 0**（改前 6/0/5）；`--require-host` **exit 1**；`RULE E 67=67`；`audit-vmu-docs 99/0`；`audit-declaration-criterion 88/0`。

### 9.31.2 R25 复核：`vmu-core2` 四项 ＋ `ready()` 落定（**逐项读数＋命令＋退出码**）

**命令（统一）**：`node D:\_tmp\v25\readings-140b.mjs`／`…\receipt-reading.mjs`／`…\mutation-demo.mjs`／`…\pin-receipt.mjs`，全部 **exit=0**（除注明）。

| # | 项 | 判定 | 读数（绑版本） |
|---|---|---|---|
| **1** | **回执可见性** | ✅ **已落** | **P2**：`host.js:453 if (typeof packReport === 'function') out.packReport = packReport()`（`host.js:441` 亦带 `settingsMerge`）⇒ 运行期合成回执：`out.packs=["v5r-core"]`（**内核真值**）＋ `out.packReport={"requested":[{"id":"v5r","via":"vmu.packs.active"}],"applied":["v5r-core"],"errors":[],"loading":false,"ok":true}`。★ **设计已具名**（`host.js:443-449`）：**不写进 `out.packs`**，因为 `kernel.status()` 已拥有 `packs` 并声明"不得被覆盖"。⇒ ★ **口径更正**：Lead 清单里"透到 **`out.packs`**"应写成"**回执新增 `out.packReport`**（`out.packs` 仍是内核真值）"。★ **P1 对照**：`host.js 8A9EC072DBFD6CF7` 时 `packReport|packErrors|out.packs` **命中 0**，而 entry `:820` 的注释写着"the status face now carries (see host.js)" ⇒ 那一版它**是假声明**；**P2 起成真**（两版并列，不抹历史） |
| **2** | **状态一致性** | ✅ **已落** | **P2**：C 臂（设置路线、无 `root`）回执＝`{"requested":[{"id":"v5r","via":"vmu.packs.active"}],"applied":[],"errors":[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"this kernel has no library root"}],"ok":false}` ⇒ **`applied:[]` ＋ `errors[]` ＋ `ok:false` 三样都在**，且 `requested.via` 说明**是谁要的** ⇒ R23 的"被拒却显示为已合并"**闭合**。★ 另：`settingsMerge` 侧**没有** `packs` 键（其键＝`priority/sources/conflictsView/note`）—— 有效装载表在 `packMerge()`／`packReport()`，**读法已具名** |
| **3** | **常驻断言 C①–C④【能红】** | ❌ **未落 ⇒ 无断言可红** | `git status tests/` 空；`tests/*.mjs` 中引用 `packsLoading|packReport|packRequested` 的**文件 0 个**（既有命中都是旧的 `packErrors`）。★ **我改用自己的副本变异**证明**四臂本身可证伪**（`mutation-demo.mjs`，**只动 `D:\_tmp` 里的副本**）：**对照（未变异副本）** ⇒ `A={entries:7,errs:0,ok:true,applied:["v5r-core"]}`／`B={0}`／`C={entries:0,errs:1,ok:false}`／`D={7,applied:["v5r-core"]}` ≡ 真树；**M1（把设置路线那一项清空，锚点命中 true）** ⇒ `A={entries:0,…}` ★ **C1 红**；**M2（`packErrors.push(` 改为 `void (`，锚点命中 true）** ⇒ `C={entries:0,errs:0,ok:true}` ★ **C3 红，且 `ok` 反成 `true`**（正好演示"状态一致性"被破坏）。⇒ **断言一旦落地，必须能在这两个变异下红**（我把这两条锚点与期望值留在此处） |
| **4** | **文档** | ⚠ **部分落、且现已【为假】** | ✅ `config.root` 必需性**在配方里**（`docs/29:259`、`:284`）。❌ 但本轮 A 修复落地后，`docs/29:263`「⚠ 这一行【**不装载 pack**】」／`:280`「① **设置键** … **不装载**」／`:304`「⚠ `packs.active` 只是设置键」**与实测相反**（设置路线 ⇒ **7 条总线条目**、`via="vmu.packs.active"`、`applied:["v5r-core"]`）⇒ **不是"没来得及更新"，是文档现在写着假话**（而且就在**推荐配方**那一节）。❌ "设置键＝真开关／部署期声明／只装一次／只能加不能减"等措辞**全无**（实测该短语集 0 命中）；`docs/10:436` 未动 |
| **5** | **`ready()` 与装载落定** | ✅ **已落** | **P2**：`:1091 ready: () => Promise.all([started, opened, adapter.status(), idsHydrated, resumed, **packsInstall**])`；`:529-530` `packsInstall/packsLoading`；`:1057 packsLoading: () => packsLoading`（handle 暴露）。★ **实测**：**C 臂在 `ready()` 返回时 `packErrors=1`**（P1 时是 **0**，要再等 250 ms 才变 1）⇒ **竞态关闭**；A 臂 `ready()` 时**已有 7 条总线条目**；`packsLoading` 在 ready 时＝`false`（已落定）。★ **时序变化逐条具名**：读这些观测量的既有套件＝`vmu-metrics-counter`（`:67/:138` 用 `vmu.packs.active`）／`vmu-round1-seams`（`:248/:262`）／`vmu-motion-box`（`:28`）／`vmu-entry`／`vmu-kernel`／`vmu-pack`／`vmu-assistant-host-slice`／`audit-enforced-consistency`／`vmu-pack-plan-rule-validate` ⇒ **在 P2 上逐条复跑全绿**（26/0、40/0、23/0、150/0、175/0、53/0、10/0/5、358/0、35/0，**exit 全 0**）⇒ **无行为变化** |

### 9.31.3 ★ 我复核中**新发现的两条缺陷候选**（不在 core2 清单里）

**(a) 设置路线的 pack 摸不到"设置面"** —— ★ **"同一条装载路"只对总线条目成立，对设置 DATA 折入不成立**：
- 实测（**P2**，同一进程两臂对照）：**A 臂** `packMerge().defaults = 0`、`sources` 无 `pack:v5r`；**D 臂** `packMerge().defaults = 43`、`sources` 含大量 `pack:v5r` ⇒ **设置路线把 pack 的 middleware 装上了（7 条），但该 pack 的 `settings/defaults.json` 没有折入**。
- 这与 R23 的"半装"**同族但方向相反**（那次是"设置说装了、实际没装"；这次是"**middleware 装了、设置面没装**"）⇒ 建议要么让 DATA 折入也走 `packsWanted`，要么**具名**"设置路线的 pack 不折设置面"。★ **未测**：真机上这条是否可观察（我只有进程内读数）。

**(b) `docs/29 §3` 的三处 ⚠ 现在为假**（见 9.31.2-4）—— 属"**已落地修复造成文档说谎**"，与 §9.30.2 第 1 条同族（回执/文档与事实相反）。

### 9.31.4 ★ 第五次"读数随树漂移"——这次发生在**我的复核途中**

我 P1 的结论（`host.js` 命中 0、`:820` 是假声明）在 P2 上**已不成立**（core2 在我复核中途落了 `task-138`）。**处置**：两版并列＋逐条绑哈希（本条与 §9.31.2-1 的"P1/P2 对照"），**不抹掉 P1**（它证明的是**当时那一版**的事实）。⇒ 纪律：**复核结论必须绑 revision；在写者停止前取到的读数，只能声明为"对那一版成立"**。

### 9.31.5 §9.30.9 补注 —— **"迁移"可核化**（`vmu-comms2` 提议，我从"继承"升级为"实测"）

**① 同路径（代码）**：`artifact-counter.js` `COUNTER_POLICY` 两行（`:48` `tool-results`／`:49` `settled-jobs`＝`['math/job-settled','lean/job-settled']`）⇒ 同一工厂 `counter()`（`:71`）、同一 `observe` 落点（`:90`）、`:119` 把**两行全部钩子**都经同一工厂建出 ⇒ 观测路径唯一 ✓。
**② 我在第二指标上量到**：`series({name:'settled-jobs'}).items` ＝ **2 行、每行 `value=1`**（`labels={hook:"math/job-settled"}`／`by="v5r.artifact-counter"`／`kind="read"`）；`+1 × lean/job-settled` ⇒ `metricValues()` `{"settled-jobs":3}` ⇒ ★ **两个 job 钩子喂同一个指标且可加**（值得钉住，免得被读成"每钩子各一个计数器"）。
**③ 仪器合同（我自己踩过一次，具名）**：`metrics.series({name})` 返回 **`{ok,name,cap:200,items:[…]}`**（**行在 `.items`**），且**必须给 name**（不给 ⇒ 具名拒 `VMU_INVALID_ARGUMENT series needs an indicator name`）。★ 我第一版复算脚本丢了 `.items` 回退 ⇒ 得到**静默的 `[]`**，一度读成"总线通道不产行"——**错的**：行一直在，是我归一化写错（**silent zero**）。⇒ 并入量具族：**"取不到行"与"没有行"必须分开证明**；读到空集合先打印**原始返回形状**。

### 9.31.6 具名未闭合（交 Lead）

1. **C①–C④ 常驻断言未落**（`task-138` 第 3 项）⇒ 落地时必须能在我 §9.31.2-3 的两个变异下红。
2. **设置路线的 pack 不折设置面**（§9.31.3(a)）—— 新发现，待裁决（改行为 or 具名）。
3. **`docs/29:263/280/304` 现为假** ＋ 路线表未改（§9.31.3(b)）—— `docs/10`／`docs/29` 属 core2 写范围。
4. **`vmu.packs.active` 与 `config.packs` 的"只能加不能减"**在代码里成立（`:827-832` 去重＋来源保持 `config.packs`），但**文档未写**、**无断言**。
5. **`hits` 与 `tool-results=5` 已结案**（§9.30.8）；**`systemPrompt` 仍不可达**（具名降级，**不影响**装载与阈值开火，单独记）。

### 9.31.7 ★ R25 **追加＋更正**（复核途中 core2 又落了两轮 ⇒ 本节**取代** §9.31.2 的第 3、4 条与第 1/2 条里对"回执对象"的表述；**不删旧文**，两版并列）

**版本第三个锚点**：**P3**＝entry `158295C05917AFC0`（1106 行）／`host.js C9F597A24CB8C933`／**core2 的断言文件 `tests/vmu-packs-active-switch.test.mjs` sha `5FBBF979E8DB814E`**（我先前一次读到 `1F9F31FCC5A2C932` ⇒ 该文件也改过一次）。

#### (A) **第 3 项改判：✅ 已落，且"能红"由我实测**（`node D:\_tmp\v25\mutate-their-test.mjs`，**只动 `D:\_tmp` 里的仓库副本**）
```
真实文件 sha=5FBBF979E8DB814E
CONTROL（未变异副本）      : exit=0  === VMU PACKS ACTIVE SWITCH: 24 passed, 0 failed ===   ← 且副本文件 sha ≡ 真树 sha ✓
M1（清空设置路线项）      : exit=1   9 passed / 15 failed
     FAIL A3. non-vacuous: with `vmu.packs.active` set there IS a request to settle
     FAIL B1. the receipt says WHERE the pack came from (via:"vmu.packs.active")
M2（`packErrors.push(` → `void (`）: exit=1   20 passed / 4 failed
     FAIL D1. a refused install is a NAMED refusal in the receipt (ok:false + errors[]) [{…,"ok":true}]   ← 注意回执反成 ok:true
```
⇒ ★ **"种反例 ⇒ 红"要件达成**：**两条变异各自把对应臂打红并具名**，而未变异副本**逐字节相同且绿**（"复原后绿"由 CONTROL 满足）。★ 另：该文件**包含"先等装载落定"这条前提本身**（`A1. after ready() the pack install has SETTLED (packsLoading false)`／`A2. …the receipt says so too (loading:false)`），并以 `A3` 做**非空前置**（我在第九条里要求的写法）⇒ 我上一条"断言未落"的判定**在此撤回**。

#### (B) **第 4 项改判：⚠ 主体已落，但**留下两行**仍与事实相反**
- ✅ `docs/10:436` 已重写为"**两条路，能力不同**，R25 口径／① `config.packs`（profile 行）＝**部署期声明**"；`docs/29:280` 把路线 ① 改成"★ **R25 起：真装载** ✓（**推荐日常调控**）"并把旧句划掉；`:291` 加了"**轮 25 更正（task-138）**"块。
- ❌ **仍在原处的两行假话**：`docs/29:263`「`packs: { active: ['v5r'] }` # ⚠ **这一行【不装载 pack】**」与 `:306`「# ⚠ `packs.active` 只是设置键：**不装载 pack**（见上）」—— 与我实测（设置路线 ⇒ **7 条总线条目**、`settingsMerge.packSources=[{"id":"v5r","via":"vmu.packs.active"}]`、`applied=true`）**相反**。⇒ 读者照**配方内联注释**抄，抄到的还是错的那句。
- ✅ `config.root` 必需性在配方里（`docs/29:259`/`:284`）。

#### (C) **第 1／2 项在【真状态面】上的读数**（`node D:\_tmp\v25\real-status-face.mjs`；该探针走**注册工具** `vibe_vmu_status.execute({})`，即宿主/用户真正能看到的那一面 —— 比"手工拼回执"更硬）
```
A 设置路线＋root : settingsMerge.packs=["v5r"]  packSources=[{"id":"v5r","via":"vmu.packs.active"}]
                   settingsMerge.applied=true   errors=[]   defaults=0
                   st.packs=["v5r-core"]        packReport.ok=true  applied=["v5r-core"]
C 设置路线·无root : settingsMerge.applied=false  errors=[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"…no library root"}]
                   settingsMerge.packs=["v5r"]  packReport.ok=false  applied=[]
```
⇒ ★ **第 2 项要件达成**：`applied:false` ＋ `errors[]` **确实可见**，且与"合并视图里仍列着 `v5r`"**同框并列**（这正是 R23 误导形态的解药：现在读者能同时看到"被请求／被拒／为什么"）。
★ **更正我自己的两处**：
1. §9.31.2-2 我写"`settingsMerge` 侧**没有** `packs` 键（键＝priority/sources/conflictsView/note）"—— 那读的是 **`kernel.status().settingsMerge`（内核自己的窄对象）**；**回执里的 `settingsMerge` 是入口的 `packMerge()`**（`host.js:441`），它有 `packs/packSources/appliedPacks/errors/loading` —— 且 `applied` 这个标记**在收到回执那一层才有**（入口 `packMerge()` 单独读是 `undefined`，**真状态面带 `true/false`**）。⇒ **对象必须点名**："回执的 settingsMerge" ≠ "内核 status() 的 settingsMerge"。
2. 同一次探针里我的 **D 臂写错了**：`run(label, { packs: ['v5r'] })` 把 `packs` **展开进了 `vmu`**（脚本里 `vmu: { 'vmu.tools.faces': [...], ...settings }`）⇒ 那一栏其实是"什么都没声明"（所以它显示 `packs=[]`、`requested=[]`，**是正确读数但答错了问题**）。**config 路线的正确读数用我 pass-2/pass-3 的探针**（`via:"config.packs"`、entries=7）。⇒ 这是**我本会话第 5 次量具自错**（前四次：`admission()` 正则／plan-apply 探针共用 id／漏 `await`／`series` 丢 `.items`），**又一次"看起来完全像合法读数"**。

#### (D) **仍在的缺陷候选（不变）**：设置路线的 pack **摸不到设置面**
**P3 仍如此**：A 臂 `settingsMerge.defaults = 0`；config 路线 `43`（且 config 路线 `sources` 里成片 `pack:v5r`）⇒ **middleware 装了、`settings/defaults.json` 没折入**。⇒ 要么让 DATA 折入也按 `packsWanted`，要么**具名**"设置路线的 pack 不折设置面"。**未测**：真机上是否可观察（我只有进程内读数）。

---

## §9.32 ★ R26 · **v18 并入块**（"设置只能加不能减"断言 ＋ `task-141` 复核基线 ＋ 纪律三则）

> **口径**：交付物＝`tests/vmu-packs-add-not-remove.test.mjs`＋`.mutants.mjs`（**新文件**）与本节。读的版本：**HEAD `a43742f`**；`entry=158295C05917AFC0`（1106L）／`host.js` 在我复核期间**两次变动**（`C9F597A24CB8C933` → `5DD826C163F80838` → **`B95AE9B3511AA48E`**，1074L）／`docs/29 D162623092769718`。

### 9.32.1 五件「测量环境的同一性」＋伴随件（可引用编号）

| 编号 | 名称 | 判据 | 现场 |
|---|---|---|---|
| **M-1** | payload 哈希 | 读数前先证**宿主加载的 payload ＝ 仓库** | `r17-home` 快照 vs 仓库（10 文件＋1 模块差）；**机械化已落**（host-slice 的 `payloadsAgree()`／`findHostPayload()`＋4 条两向自探针，**10/0/5 exit 0**） |
| **M-2** | 解码帧完整性 | one-shot zstd 只出 2 行、**看起来像证据** | `dsh-drive.mjs:206-215` |
| **M-3** | `await` 指纹 | `JSON.stringify(<Promise>)＝"{}"`；**半对的坏读数最危险** | R24 我的"A 也不触发" |
| **M-4** | 装载 settle | 读 `packErrors`／`bus.entries` 前先落定 | `0→1`（R24）；R25 起 `ready()` 自己等（`:1091 packsInstall`） |
| **M-5** | 同刻同源 | 比较两读数前先证**同一时刻且同一 artifact** | `hits:2`（会话 `#29`）vs `tool-results=5`（`r131E-boot.log` L3） |
| **M-6**（伴随） | 因式分解 | 汇总只钉**乘积**，因子要用**原始行** | `sum=5`＝5×1×1 或 1×1×5；`series({name}).items` |

### 9.32.2 ★ A 交付：「设置只能加、不能减」常驻断言（**新文件**，两向能红）

**文件**：`tests/vmu-packs-add-not-remove.test.mjs`（sha256[0:16] **`3A52C209921D487E`**）＋ `tests/vmu-packs-add-not-remove.mutants.mjs`（变异器）。
**真树读数**：`node tests/vmu-packs-add-not-remove.test.mjs` ⇒ **12 passed / 0 failed，exit 0**。四组断言（每组**带非空前提**）：
1. **加**：`config.packs:[]` ＋ `vmu.packs.active:['v5r']` ⇒ **v5r 条目真的上总线**（`artifact-counter` 条目）＋ `packSources` 里 `via === "vmu.packs.active"`；
2. **试图减**：`config.packs:['v5r']` ＋ `vmu.packs.active:[]` ⇒ **仍在装** ＋ **原因可读**（`via === "config.packs"`，不是静默忽略）＋ 条目集合与"加"臂**完全相同**；
3. **两处同声明** ⇒ **只装一次**（`packSources` 里该 id **恰一条**）且来源**仍是 `config.packs`**；
4. **哪儿都没声明** ⇒ 静默（`entries=0`、`applied=[]`，规则不制造装载）。
**两向能红的实测**（`node tests/vmu-packs-add-not-remove.mutants.mjs`，**只变异 `D:\_tmp` 里的仓库副本**）：
```
CONTROL（未变异副本） exit=0  12 passed / 0 failed        （副本文件 sha ≡ 真树 ✓）
M-A 设置不能加        exit=1   8 passed / 4 failed  FAIL 非空前提｜★到达总线｜★via 具名｜集合相等
M-R 设置真能减        exit=1   5 passed / 7 failed  FAIL 前提｜★仍在装｜★via=config.packs｜集合相等
M-B 去掉去重（装两次/来源翻转） exit=1  10 passed / 2 failed  FAIL ★恰一条｜★来源仍 config.packs   （stderr 另现 VMU_PACK_CONFLICT … already applied）
```
★ **"被具名"的落点照实说**：代码里**没有**一个显式的"设置试图删除但被忽略"字段；可读的具名是 **`packSources[].via = "config.packs"`**（读者能看出**为什么**它还在）。⇒ 若 Lead 要"显式的忽略告警"，那是一条**尚未实现**的增强，本断言不假装它存在。

### 9.32.3 ★ B 复核 `task-141`：先核状态 ＋ **两条对前提的更正**

**状态（纪律①现场）**：`task-141` **`in_progress`，owner `vmu-pack2`**，且工作树 `host.js` 正在改动（`B95AE9B3511AA48E`），**`defaultsFolded`／`defaultsUnfolded`／`notPublished` 三字段此刻【尚未出现】** ⇒ 判定＝**"在飞、未落"，不是"未完成/被遗忘"**（这正是 Lead 本轮列的第 1 条纪律：报归属前先核状态）。
**我的基线读数**（`node D:\_tmp\v26\baseline-141.mjs` 与 `…-defaultfaces.mjs`，均 exit=0；走**真状态工具** `vibe_vmu_status.execute({})`）：

| 配置 | 路线 | 注册工具 | `faces.enabled` | `faces.published` | `defaults` | **registered−published** |
|---|---|---|---|---|---|---|
| `vmu.tools.faces:['*']` | 设置键 | **53** | 53 | 53 | **0** | **[]** |
| `vmu.tools.faces:['*']` | `config.packs` | **53** | 53 | 53 | **43** | **[]** |
| 默认面集 | 设置键 | **7** | **4** | **7** | **0** | **[]** |
| 默认面集 | `config.packs` | **15** | **14** | **15** | **43** | **[]** |

★ **更正一（对 `task-141` 的 "(v) 回执少报 13 vs 15"）**：**我在四种配置下都测不到回执少报** —— `registered−published` 与 `published−registered` **全部为空**（`4/7` 与 `14/15` 两格里 `published` **就等于**注册面）。⇒ 该前提**在我这一版不可复现**（其机制候选是"`faceResolution` 每次只算一次而 packs 之后会再 install"，**请其 owner 在同一次运行里重测**）；**我不据此判它错**，只说"此读数不支持它"。
★ **更正二（两格验收的适用条件）**：**不对称是【配置条件性】的** —— `faces:['*']` 时**两条路线都是 53/53/53**（差异只在 `defaults: 0 vs 43`）；只有**默认面集**下才出现 `4/7` vs `14/15`。⇒ ① Lead 指定的两格 **(i) 注册工具数/面 == `config.packs` 路线** **必须在"不对称真的存在"的配置（默认面集）里跑**，否则等号恒真；② 并且 **(ii) 的基准应是 `published`，不是 `enabled`** —— 实测 `config.packs` 路线 **`enabled=14` 而注册/发布=15**：**`report` 面未列 `enabled`，但 `vibe_vmu_report` 已注册并发布**（`faces.sources['report']` 在两路线**都是 `undefined`**）⇒ 若拿 `enabled` 与注册面比等号，**即使修好也永远差 1**。
★ **`faces.sources` 的形状（对 "(乙) 不是静态桶" 的实测答复）**：它是 **per-face 的 reason 映射**，且 reason **同源于真实声明键** —— `config.packs` 路线：`sources['turn']＝"setting:vmu.turn.*"`、`sources['status']＝"always (the inert default must be observable)"`；**设置键**路线：`sources['turn']＝undefined`（该面根本没启用）。⇒ **机制已经是 (乙) 形状（可复核 reason），不是白名单/桶** ✓；★ 但**"缺失的面"在 `sources` 里没有条目** ⇒ 这正是 `notPublished:[{face,reason}]` 要补的那一格（否则"缺席"与"未被解释"同形）。

### 9.32.4 C：`docs/29` 两行在**已提交树**上仍为假（附哈希与逐字）

**树**：HEAD `a43742f`；`docs/29-build-your-own-preset.md` sha256[0:16] **`D162623092769718`**（442 行）；`不装载` 命中 **5** 处。逐字：
- `:263` `packs: { active: ['v5r'] }        # ⚠ 这一行【不装载 pack】—— 见下方「★ 装载路线」`
- `:306` `vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }   # ⚠ \`packs.active\` 只是设置键：**不装载 pack**（见上）`
而同一文件 `:280` 已改成"★ **R25 起：真装载** ✓（**推荐日常调控**）"＋ `~~不装载~~` 对照。⇒ **更正块与内联注释同时存在且互相矛盾**；配方内联注释是读者会**直接抄**的那一行 ⇒ **仍假，再报 Lead**（`vmu-pack2` 称已更正，但**已提交树**上这两行没变）。

### 9.32.5 ★ 本轮新纪律三则（Lead 指定，全部有现场代价）

1. **"列在队列里" ≠ "尚未完成"** —— 报归属前**先核状态**。现场：`task-141` 在板上是 `in_progress` 且工作树正在改，若只看"没 grep 到字段"就会误报成"没人做/未完成"。
2. **"没 grep 到" ≠ "不存在"** —— 要问**"谁声明它"**，就去读 **`faces.sources`**，**别自己拼前缀**。现场：`sources['turn']＝"setting:vmu.turn.*"` 一句就回答了"谁声明了 turn 面"；我 L25 曾用**字面前缀 grep** 找声明者 ⇒ 得出错误结论（`vmu.turn.*` 是**家族前缀**，不是键名）。
3. **量具而非被测物** —— 本轮三条错误**全是量具**：① **字面前缀 grep**（把家族前缀当键名）；② **`execute()` 返回 JSON 字符串**当对象读（`Object.keys()` 返**字符下标** ⇒ 看着像"回执是空的"）；③ **`calls ≠ distinct`** 检测重装**只在名字重叠时有效**（否则恒真）。⇒ 与既有族合并为 **「观测通道的自造假象」**：`ConvertFrom-Json` 解析失败／`Get-Content` 800vs810／`JSON.stringify(<Promise>)`／探针抢跑／`series` 丢 `.items`／**本次三条**。

### 9.32.6 具名未闭合（交 Lead）

1. **`task-141` 未落**（`in_progress`）：三字段缺席；**其 "(v) 回执少报" 前提在我四种配置下不可复现**（须其 owner 同次运行重测）；两格验收须**在默认面集下**、且 **(ii) 以 `published` 为基准**。
2. **`docs/29:263`／`:306`** 仍为假（§9.32.4，已附哈希＋逐字）。
3. **"设置试图删除"没有显式告警字段**（§9.32.2 末）：目前只有 `packSources[].via` 可读具名 ⇒ 若要显式告警，是**尚未实现**的增强。
4. **`systemPrompt` 仍不可达**（具名降级，不影响装载与阈值开火，单独记）。

### 9.32.7 ★ R26 追加：**`RULE E` 同形状【第四次】复发**（Lead 指认 ⇒ 进册）

**四次同族现场**（**全部发生在"新写的断言"里**，且**都在写完当天被抓**）：
| # | 形状 | 现场 | 处置 |
|---|---|---|---|
| 1 | `[].every(…)` **恒真** | `vmu-pack-inline-manifest.test.mjs`（R20，pack2 自陈） | 同一表达式内加**非空前置**（`busEntries.length > 0 && …`） |
| 2 | `[].every(…)` **恒真** | `vmu-packs-active-switch.test.mjs` 的 `D4`（R25，pack2 自陈） | 同上（`pr.errors && pr.errors.every(…)` ⇒ 加非空前置） |
| 3 | **条件式断言**（分支不走即静默跳过） | `if (name === 'v5r') { … }` 里的 H3（R21，pack2 自陈）⇒ 命中 **C2 指纹** | 提出循环、无条件运行 ＋ 加 `H0` 让前提自己也被断言 |
| 4 | ★ **等号两侧可能皆空**（shape **B**） | **`vmu-pack-defaults-named.test.mjs:77`**（R26，**`light` vs `LOST_TOOLS`**）⇒ `RULE E` 红、**会挡 T1** | 同一表达式内加非空前置（已转 owner） |

**★ 为什么这条值得单列（机制，而不是记性）**：`RULE E` 的 **A 类基线是"指纹集合"（67）** ⇒ 它**只保证既有指纹不增不减**；**一个【新文件】可以引入一个全新的同形状实例而基线纹丝不动** ⇒ **"基线是 67"绝不能读成"形状 B 不存在"**。⇒ **纪律**：**新写的断言必须在当天做一次"种反例 ⇒ 红"实测**（本轮两次正面例证：我 `vmu-packs-add-not-remove` 的三处变异 `8/4`／`5/7`／`10/2`；pack2 的 `mergeReport` 回退 `22/2`、`host.js` 不并回执 `10/14`、`ready()` 不等装载 `21/3`）—— ★ **没有当天的变异跑，"断言能红"就只是一句自述**。
★ 与 §9.32.5 第 3 条同族：**这些也必须问"红的是不是我要判定的那一行"**（第 1／2 例正是"恒真让红永远不会发生在被测行"）。

### 9.32.8 ★ R26 收轮追加：`task-141` 交付复核（(v) **已生效**、`docs/29` **已修**、我 **更正我自己的更正**）

**版本锚点**：`host.js` 现为 **`D4C3BCE3D973CB84`**（我复核期间第三/四次变动）；`docs/29` sha **`FBEB5AAB7D6FCA23`**。

#### (A) ★★ "(v) 回执少报"：**不是不存在 —— 我测的是【已修好】的树；现象由我构造前态复现**
**代码自证**：`host.js:434-441` 的注释逐字写着这是"**the third 'receipt vs fact' instance**：`published` 曾是**本次评估**的名字（所以回执能列 13 而实际注册 15），现在报**注册面**（adapter 自己累计的 `registered`）"，接缝＝`:440 const surface = typeof publishedSurface === 'function' ? publishedSurface() : null`，**回落**＝`:441 specs.map(s => s.name)`（**正是前态**）。
**我构造前态（只在 `D:\_tmp` 副本上把 `:440` 改成 `const surface = null`；锚点命中 true）**：
| | 路线 | registered | published | 差集 | `evaluations` |
|---|---|---|---|---|---|
| **对照（未变异）** | `config.packs` | 15 | **15** | **[]** | **2** |
| **对照（未变异）** | 设置键 | 7 | **7** | **[]** | **2** |
| **前态（去接缝）** | `config.packs` | 15 | **13** | **`["vibe_vmu_middleware","vibe_vmu_report"]`** | `null` |
| **前态（去接缝）** | 设置键 | 7 | **4** | `["vibe_vmu_meeting","vibe_vmu_middleware","vibe_vmu_report"]` | `null` |
⇒ ★ **差集里那两名与 `vmu-pack2` 报的逐字相同**，且 `evaluations=2` 证明"**并集真的合并了不止一趟**" ⇒ **现象真实、其修法真实生效**。
★ **更正我 §9.32.3 的"更正一"**：我当时写"四种配置下都测不到 ⇒ 读数不支持该前提"——**框架过强**。正确口径：**我读的是已修好的树，差集全空恰是 "(v) 已生效" 的证据**；我虽然注明了"`host.js` 正在改、在飞读数"，**但仍把空差集当成了对前提的反驳**。⇒ 并入量具族：**"测不到"必须与"测的是哪一版"同时声明**（这是本会话**第六次"读数随树漂移"，且这次发生在我自己的结论上**）。★ 我**没有**把它写成"不存在"（第八条守住了），但**框架强度**这一层没守住。

#### (B) `RULE E` 第四次同形状：**已修并已核**
`tests/vmu-pack-defaults-named.test.mjs:77` 已改为"**同一表达式内非空前置**"（`:77` 就地写了为何：`LOST_TOOLS` 是常量、比两个长度会两侧皆空）⇒ 我复跑 **`audit-declaration-criterion` 88 passed / 0 failed**（**两条红都没了**：shape B 已修，`regen-all --check` 亦回绿）；**`RULE E 67=67`、`multi-line C 57=57`** 未动 ✓ ⇒ §9.32.7 记的四次复发**此轮闭合**（纪律仍成立：**新断言必须当天变异**）。

#### (C) `docs/29` 两行：**已修**（附新哈希与逐字）
sha **`FBEB5AAB7D6FCA23`**（442 行），`不装载` **5 → 3**（**余 3 处全在 `:280`／`:291` 的更正块内**——删除线＋对照，**故意保留**，Lead 认可口径）；两行现在是**真话**：
- `:263` `# ★ R25 起【真装载】—— 但【只装载 middleware/rules，不含该包的 settings/defaults.json】（见下方「★ 装载路线」）`
- `:306` `# ★ R25 起 \`packs.active\`【真装载】（见上）；★ 但**不折入该包的 \`settings/defaults.json\`** ⇒ 靠那些键声明的面/工具**不会发布**（回执 \`defaultsUnfolded…\`）`
⇒ **我 §9.32.4 的 C 项闭合**（"连哈希与逐字报"这套做法被证明可判定：他们就是照哈希改的那两行）。

#### (D) 仍开着的两条（具名，交 Lead）
1. ★ **owner 自陈未证**：把"折入输入集"改成有效请求表 ⇒ 按设计 `①` 应红，但**实测仍未红（21/0 绿）** ⇒ **`A2`（`defaults===0`）不能声称能抓"偷偷强补折入"**；`vmu-pack2` **如实记为未证**（假设：`settings` 在该作用域形态不同）。⇒ **不许引用成"已能抓强补折入"**。
2. **`report` 面 `published` 却未进 `enabled`**（config 路线 `enabled=14`／注册发布 15）⇒ owner 具名为**第四条"回执两个字段讲不同的事"**（与 `notPublished` 互补：一报"缺席"、一报"在册未列名"）；**本轮未动**（改它会动面订阅语义）⇒ 待 Lead 裁。

---

## §9.33 ★ R27 · **v19 并入块**（`task-143` 复核基线 ＋ `A2` 的牙**现场裁定** ＋ 纪律指针）

> **口径**：本轮 `task-143`（owner `vmu-pack2`）**在飞**（板上 `in_progress`；`host.js` 在我复核期间从 `D4C3BCE3D973CB84` → **`8FD4B2FDDC6FFDBF`**；其测试文件 `5FBBF979E8DB814E` → **`C9A3A97BF527E438`**）⇒ 本节给**基线＋可判定的地面真值**；**对其交付的验收**待其落地后另节。
> **五件「测量环境的同一性」不在本节重抄** —— 见 **§9.31.1（M-1…M-5）＋伴随件 M-6（§9.30.9）**；本轮**无差异**（payload 前置机械化仍在 `tests/vmu-assistant-host-slice.test.mjs`，读数 10/0/5 exit 0）。

### 9.33.1 ★ `A2` 的牙：**能红 —— 但必须打在【正确的那个折入点】**（我实测，两条折入点对照）

**背景**：`task-143 ②` 要求 owner 把"折入输入集改成有效请求表（偷偷强补折入）"这个变异做红，或撤回说法；他们自陈第一版变异**仍 21/0 绿**。**我的地面真值**（只在 `D:\_tmp` 副本上变异，再**跑他们自己的测试**）：
```
CONTROL（未变异副本）                    exit=0   VMU PACK DEFAULTS NAMED: 21 passed / 0 failed
MUT-fold-#2（settings/defaults 折入点，vibe-math-vmu.js:349）
                                         exit=1   14 passed / 7 failed
   FAIL A2. the settings route folds no default keys (`defaults` stays 0) [43]        ← ★ 红在被测那一行
   FAIL A3. ★ and the nine tools that depend on those keys are NOT registered [{registered:16,lost:[]}]
   FAIL A4. the enabled face list is the four baseline faces …
MUT-fold-#1（prompts 折入点，vibe-math-vmu.js:323）  exit=0   21 passed / 0 failed     ← ★ 不影响 `defaults`
```
⇒ ★★ **结论（可直接用于派单）**：**`A2` 有牙**（`defaults` 0 → **43**，且失败详情就打印 `[43]`）—— **它盯的是 `settings/defaults.json` 那个折入点（`:349`）**；而**两个折入点都写着同一行 `const wantedPacks = …config.packs…`**（`:323` prompts／`:349` settings），**打在 `:323` 上不会红**。⇒ **owner 第一版没红的最可解释原因＝打错了折入点**（而非其假设的"`settings` 在该作用域形态不同"）。★ 我方**未改任何仓内文件**；变异全在副本。

### 9.33.2 ★ `enabled` vs `published` 口径差：**比裁定里的"只有 `report`"更大，且【两个方向】都差**

**读数（真状态工具；entry `B78B3E05FE2033F4`／`host 8FD4B2FDDC6FFDBF`）**：
| 路线 | `enabled` | `published` | ★ **published 面 − enabled** | ★ **enabled 面 − published** |
|---|---|---|---|---|
| `config.packs` | 14 | 15 | **`["middleware","report"]`** | **`["set"]`** |
| 设置键 | 4 | 7 | **`["middleware","meeting","report"]`** | `[]` |
★ **更正裁定的范围**：不是"**只有 `report`**"；`middleware` 在**两条路线**都"已发布未列 enabled"；设置路线还多一个 `meeting`。★ **并且反方向也有差**：`config.packs` 路线里 **`set` 在 `enabled` 而 `publishedDetail` 里【没有 `vibe_vmu_set` 条目】**（同一个 `vibe_vmu_set` 在**设置路线**里是有条目的，`reason:"explicit-flag"`）—— 这是**第五个"同一份回执两字段讲不同的事"**（与 `notPublished` 互补：一个报"缺席"、一个报"在册却未列名"、这个报"列名却不在册"）。
★ **可复核的 reason 来源【已经存在】**：`publishedDetail[].reason` 逐条都是**判决来源**而非散文 —— `vibe_vmu_middleware → "surface:bus-entries"`、`vibe_vmu_report → "setting:vmu.report.*"`、`vibe_vmu_meeting → "setting:vmu.meetings.*"`、`vibe_vmu_set → "explicit-flag"`；而 **`faces.sources['middleware']` 与 `['report']` 皆为 `undefined`** ⇒ 裁定原文"reason 必须来自 `faceResolution.sources` 一类"**在这两个面上取不到**，**但同族的 `publishedDetail[].reason` 就是那个"可复核来源"**（形状 **(乙)**：每条带真实判决来源，**不是白名单**）。★ **代码级声明点**：`host.js:232`（`face:'report'` 的面行）＋ **`host.js:834 if (on('report')) specs.push(makeReportSpec(…))`**（**直接 push**）⇒ 这解释了"已发布却未 enabled"：**`report` 的发布绕过面行判决**。⇒ **建议给 owner**：要么把 `enabled` 侧也补上同一 `reason`（复用 `publishedDetail[].reason` 的判决来源），要么在回执里具名这一对差异；**两条都必须逐条解释、失败打印未解释者**。
★ **`notPublished` 字段已落地且 reason 可复核**（设置路线实测）：`[{"face":"control","tool":"vibe_vmu_control","reason":"its family keys live only in the pack's settings/defaults.json, w…"}]` ✓（task-141 的 (a) 项在这一点上**成立**）。

### 9.33.3 纪律：**新增三条 ＋ 四次空过形状**（Lead 指定；已有处**指回**，不重抄）

| 纪律 | 落点 |
|---|---|
| ★ **"基线是 67" ≠ "该形状不存在"**（新文件可引入**全新同形状实例**而基线纹丝不动） | **已在 §9.32.7**（其"机制"段）；**R27 无差异**，本轮再确认：`RULE E 67=67`、`multi-line C 57=57` |
| ★ **"测不到"必须与"测的是哪一版"同时声明** | **已在 §9.32.8(A)**（我的过强框架自纠）；**R27 起作为引用前硬要求**：凡"我测不到"必须连**文件哈希/提交**一起写 |
| ★ **"列在队列里" ≠ "尚未完成"** | **已在 §9.32.5 第 1 条**；R27 现场再次生效：`task-143` 板上 `in_progress` ＋ `host.js` 在改 ⇒ 判**"在飞、未落"** |
| **四次空过形状并列**：`[].every`×2／条件式×1／**等号两侧可空**×1（＝`RULE E` shape B）＋**机制**（A 类基线是**指纹集合** ⇒ 只保证既有指纹不增不减） | **已在 §9.32.7**（含四次现场与"当天必须种反例"的纪律） |

### 9.33.4 C：`docs` 未漂回（确认）
`docs/10-packs.md` sha256[0:16] **`7BA3C185F1DA916C`**（＝R25/R26 读数，未变）；`docs/29-build-your-own-preset.md` **`FBEB5AAB7D6FCA23`**（＝R26 收轮读数，未变），`:263`／`:306` 仍是"★ R25 起**真装载** …… 不含该包的 `settings/defaults.json`"的**真话** ✓。

### 9.33.5 具名未闭合
1. **`task-143` 交付未落** ⇒ 其 A.1（差集逐条解释）、A.2（做红或撤回的两处措辞）、A.3（**每条新断言当天种反例**的逐条清单）**待落地后验收**；★ 我已先行给出**该验收的可判定基准**（§9.33.1／§9.33.2）。
2. **`A2` 的牙**：**能红**（打 `:349`）⇒ 若 owner 选"撤回"，则报告与矩阵两处都必须写"**本断言不覆盖该变异**"，**不许留"设计上应该能红"**（我的实测证明它**其实能红**，所以"撤回"将是一个**比事实更弱**的表述 —— 我建议**做红**并把变异点写成 `:349`）。
3. **`report`/`middleware`/`set` 三处口径差**（§9.33.2）—— 待 owner 按裁定落地后逐条验收。

### 9.33.6 ★ R27 **收口复核**：`task-143` 交付验收 —— **三条全部两人独立通过**（本节**取代 §9.33.5 第 2 条**的"未证"）

**版本锚点（交付版）**：`entry B78B3E05FE2033F4`／`host AB07038C2174A8F6`／其测试 `BEFDD86DEC3E496F`；`node D:\_tmp\v27\closing-review-143.mjs` ⇒ **exit=0**（内部：control 0／A.2 变异 1／A.3 变异 1）。

#### (A.1) `enabledGap`／`enabledNotPublished`：**已落、已派生、来源可复核** ✓
| 路线 | `enabledGap`（published−enabled） | `enabledNotPublished`（enabled−published） |
|---|---|---|
| `config.packs` | `[middleware(source="surface:bus-entries",faceRowSource=null), report(source="setting:vmu.report.*",faceRowSource=null)]` | **`[{face:"set", source:"declared-keys"}]`** |
| 设置键 | 同上 ＋ **`meeting(source="setting:vmu.meetings.*")`** | `[]` |
★ **逐条可复核**：我对每个 gap 条目做了**等式核对** —— `source === publishedDetail[].reason` 对 `middleware`/`report`/`meeting` **全部 `true`**（`"surface:bus-entries"`／`"setting:vmu.report.*"`／`"setting:vmu.meetings.*"`）⇒ **来源确为判决来源**，**不是散文、不是白名单**（我另测 `hardcoded-face-list? false`）。★ `faceRowSource: null` **本身就是证据**（该面的发布**绕过面行判决**），与我在 `host.js:232`（面行）＋ **`:834 if (on('report')) specs.push(makeReportSpec(…))`（直接 push）** 的定位一致；代码注释里也记了这一因果。★ **两个方向都覆盖**（正方向 `enabledGap`、反方向 `enabledNotPublished`，后者在 `config.packs` 路线给出 `set`／`source:"declared-keys"`）⇒ **比裁定原文的范围更完整**。
★ **代码为派生而非表**：`:476 out.faces.enabledGap = out.faces.published…filter(d => d && d.face && !enabledSet2.has(d.face))…`、`:498 out.faces.enabledNotPublished = (out.faces.enabled||[]).filter(face => !publishedFaces.has(face))…` ⇒ 只由 `publishedDetail` ＋ `enabled` ＋ `faceResolution.sources` 推出。

#### (A.2) `A2` 的牙：**已证 —— 反例打在 `:349`** ✓（我独立复跑）
```
CONTROL（未变异副本）                       exit=0  27 passed / 0 failed   syntaxError=false
MUT@:349（occurrence 2，settings/defaults） exit=1  20 passed / 7 failed   syntaxError=false
   FAIL A2. the settings route folds no default keys (`defaults` stays 0) [43]   ← ★ 红在被测那一行
   FAIL A3. … the nine tools … NOT registered [{"registered":16,"lost":[]}]  ／ FAIL A4. … ／ FAIL C1. …
```
⇒ **`未证` 撤回**：此处改判 **"已证（反例在 `:349`）"**。★ **根因也两人一致**：两处折入点写着**同一行**（`:323` prompts／`:349` settings/defaults），而 `String.replace(FROM, TO)` **只替换第一处** ⇒ 第一版打在 `:323` ⇒ **动不了 `defaults`**（其自陈假设"`settings` 作用域形态不同"现已被双方读数共同排除）。

#### (A.3) 纪律核查：**本轮每条新断言都有当天的反例读数** ✓（我逐条独立复现）
| 新断言 | 当天的反例读数（owner） | **我独立复现** |
|---|---|---|
| **E1／E2**（每个"已发布未 enabled"的面必须被 `enabledGap` 解释、且带 `reason` ＋ 可复核 `source`） | 清空两个 gap 过滤器 ⇒ **22/5，E1/E2 两路线红** | ★ **22/5，`FAIL E1`／`E2` 两路线各一条**，`syntaxError=false`（**真红，非语法假红**） |
| **`A2`**（设置路线不折默认值） | **20/7，`A2` 红 `[43]`** | ★ **20/7，`A2` 红 `[43]`** |
★ **特别记一条 owner 的自律**：其**第一次**种反例时变异引入了 **`SyntaxError`** ⇒ 那是**假红**，**他们没把它当证据**，改为语法有效的清空版（我的两次变异实测均 `syntaxError=false`，可作旁证）⇒ **"真红 vs 语法假红"的区分**已入其报告 §3；★ 这与矩阵既有纪律同族（**"红的是不是我要判定的那一行"**）：**语法错的红连"行"都不是**。
★ 其余回归（owner 报）：`vmu-host 107/0`／`vmu-host-hooks 22/0`／`vmu-entry 150/0`／`audit-status-report-fields 19/0`／`audit-enforced-consistency 358/0`／`audit-declaration-criterion 88/0`（我未逐条复跑这些，**署名 owner**；我复跑的是上面两次变异与其测试的 CONTROL）。

#### 结论
`task-143` 的 ①②③（含本轮重点 A.3 的"新断言 → 当天反例"清单）**全部通过**，且**每条都有我这一侧的独立读数**。⇒ 本节**取代 §9.33.5 第 2 条**（原"未证"表述**作废**，仍保留在上文以便对照）；§9.33.5 第 1、3 条随之闭合（交付已落、三处口径差已双向具名）。

### 9.33.7 ★ R27 追加：**引用署名约定**（`vmu-pack2` 提议，我已按此修矩阵；并附**改动面**的独立核验）

**约定（请 Lead 在最终报告/矩阵引用时照此）**：
- 凡**我方**（`vmu-verify2`）跑出的读数 ⇒ 标 **"verify2 独立复核"**（例：§9.33.6 的两处变异 `20/7`／`22/5` 与其 CONTROL `27/0`）。
- 凡**其方一次运行**的读数 ⇒ 标 **"pack2 自报（同一次扫；原样命令＋退出码见 `_handoff/vmu/pack-round27-report.md §4`）"**。★ 具体指：`vmu-host 107/0`／`vmu-host-hooks 22/0`／`vmu-entry 150/0`／`audit-status-report-fields 19/0`／`audit-enforced-consistency 358/0`／`audit-declaration-criterion 88/0` —— **§9.33.6 第 4 条**已写"署名 owner、我未逐条复跑"，本条把**引用格式钉死**，**两类别混**。
- 理由（其自陈，我同意）：**"我跑过"与"别人跑过"是两种证据强度**；混用会把自报抬成独立复核。

**★ 其"改动面"我独立核验（`git` 只读，非其推断）**：
```
git status --porcelain   ⇒  M tests/vmu-pack-defaults-named.test.mjs
                             M vibe-math-vmu/host.js                    （仅这两条）
git diff --numstat HEAD  ⇒  +33 / -0   tests/vmu-pack-defaults-named.test.mjs
                             +42 / -1   vibe-math-vmu/host.js
package.json             ⇒  未改（`git diff --name-only HEAD package.json` 无输出）；sha 0132EDF455E0D324（与前一致）
未跟踪文件               ⇒  无（`?? ` 零命中）⇒ ★ "计数不增"成立（本轮未新增/未登记文件）
kernel/meetings.js       ⇒  sha 5EE0C0680C3BB225（未碰）
```
⇒ **"本轮改动面＝`host.js` ＋ 该测试文件；`package.json` 未改、无新增文件"** —— **由我独立核到，不再是自述**。

---

## §9.34 ★ R28 · **v20 并入块**（`oneOf` 清扫复核 ＋ 真机升档现状 ＋ `systemPrompt` 定性）

> **口径**：读的版本＝**HEAD `2d39d59`**（工作树 clean）；`entry` blob sha256[0:16] **`B78B3E05FE2033F4`**（81873 bytes，**由 `git cat-file blob HEAD:` 逐字节算出、无文本往返**）。
> **指回（不重抄）**：五件**「测量环境的同一性」＝§9.31.1（M-1…M-5）＋ M-6（§9.30.9）**；**四次空过形状＝§9.32.7**；**署名约定＝§9.33.7**（本轮照此区分"我跑过"与"别人跑过"）。

### 9.34.1 A：`task-146`（真机升档）—— **尚未运行（我独立确认）**，仪器已备

- **无新真机会话**：我按 mtime 扫 `D:\_tmp` 下全部 `session.v4.jsonl.zstd` ⇒ **最新一条＝`session-6ca9fefd…`（10-15 17:43，sha `09D1D43DBEFF28C6`）＝R23/R24 的 arm E**，其后**再无任何会话日志** ⇒ `vmu-accept` 的"**R24–R26 零新的真机会话**"**由文件系统独立证实**（不是我采信其自述）。⇒ `task-146` 的升档**此刻尚未发生**。
- **payload 哈希仪器（已建，供其跑前自核）**：`git cat-file blob HEAD:vibe-math-vmu/vibe-math-vmu.js` 取 **Buffer** 后 sha256 前 16 ⇒ **`B78B3E05FE2033F4`**；同刻工作树文件**同为** `B78B3E05FE2033F4`（81873 bytes ⇒ 无 CRLF/编码往返）。★ 纪律照 **M-1**：hash 一旦在跑前不等，则该次读数**不得**标"当前树"。
- **判档待其交付**：四项读数（`packReport`／`enabledGap`＋`enabledNotPublished`／`published−registered`＋`evaluations`／被拒臂同帧四件）**待真机读数到位后与我 R27 的进程内读数逐项对表**；**两者不许混**（§9.33.7）。

### 9.34.2 B：`task-147`（`oneOf` 清扫）—— **清点数两人独立一致**；判别点**已解**；并**新发现更上位的一条**

**(1) 我自己的语义清点（不采信其清单）**：**11 处**，**全部在 `kernel/meetings.js`**（`:136/:138/:147/:154/:171/:173/:178/:184/:185/:186/:188`）—— 与 `vmu-core2` 报的 **11** **逐处相同** ✓；`vmu.meetings.orderMode` **不在其中**（与 R17 已修自洽）✓；★ **全包扫描未发现 `oneOf` 的别名/包装**（`function oneOf|const oneOf|oneOf =|oneOf:` 只有 `:128` 一处定义）⇒ "含别名/包装"这项风险**排除**。
**(2) helper 与"修好的模板"**：`:128 const oneOf = (v, set, def) => (set.includes(v) ? v : def)` ⇒ **静默回落、无拒绝** ✓；★ 对照＝R17 的 `meetingmarker.js:296 strictOrderMode(raw, refuse)`（其注释自称"**the twin of `oneOf` (meetings.js:128)**"）＋ `meetings.js:170` 的调用 ⇒ **修法模板已在库**。
**(3) schema 声明（我独立读，行号与其一致）**：`tier` **L1011 `enum`+`domain:['formal','light']`**、`leaveApprover` **L1021 `enum`+`domain:['chair','office']`**；其余 **9 个全是 `type:'string'` 且无 `domain`**（`appealScope:1210`／`attendanceMode:1211`／`budgetOnExceed:1212`／`confidentialityDefault:1220`／`confidentialityQuotePolicy:1221`／`leaveEarlyPolicy:1231`／`minutesDetail:1235`／`quorumLossPolicy:1238`／`wakeFailurePolicy:1253`）✓＝与其清单**逐行相同**。
**(4) ★ 判别点（core2 唯一"能改变类别计数"的一行）：我解出来了 —— 两处是 (i)，不是 (iii)**：
```
config.vmu 通道投入域外值（我实测，真入口）：
  vmu.meetings.tier            => LOADED（无拒绝）   source="config"
  vmu.meetings.leaveApprover   => LOADED（无拒绝）   source="config"
  vmu.meetings.orderMode       => REFUSED VMU_INVALID_ARGUMENT …outside the declared domain fifo|round-robin|chair|random   ← 对照组
```
⇒ **`config.vmu` 通道不拒**，而**唯一真正生效的执法点是读取侧**（orderMode 有严格读取器，故拒；`tier`/`leaveApprover` 的读取侧是 `oneOf` ⇒ **静默夹取仍活**）⇒ 判 **(i)**，修法＝**读取侧具名拒**（schema 已有 domain 只是"声明已就位"，**不等于运行时受保护**）。
★ **未观察项（具名）**：我**没有**端到端观察"域外值被静默替换成默认值"的**用户可见后果** —— 我的 `status().settings[key]` 取回 `undefined` 是**我的观测点没取到值**（不是"值不存在"）；结论由 **`oneOf` 的代码语义（非成员一律回 `def`）＋"通道不拒"的实测**共同支撑。

**(5) ★★ 更上位的新发现（超出 `task-147` 范围，建议单独派单）：`settings/schema.js` 的 `type`/`domain` 在运行时【没有任何执行点】**
- `validateValue`（`:1459`，`enum` 分支 `:1467 if (!d.domain.includes(value)) throw bad('expected one of …')`）**唯一调用者**是 **`resolveSettings`（`:1558`／调用在 `:1566`）**；
- 而 **`resolveSettings` 在包内运行时【无调用者】**（我对 `vibe-math-vmu/**` 全量 grep 只命中其自身定义；`tests/**` 未纳入该次 grep ⇒ 若测试拿它当 oracle **不影响**本结论）；
- **实测泛化**：域外值经 `config.vmu` 对**远离 meetings 的 enum 键**同样 **LOADED（无拒绝）**：`vmu.budget.onExceed`／`vmu.compat.unknownCombo`／`vmu.quota.onExceed` ⇒ **不是 meetings 的问题，是"schema 声明无人执行"**。
⇒ ★ **纪律（本轮新增）**：**"schema 里写了 `domain`" ≠ "运行时受保护"**；判一条键是否真受保护，**唯一标准是"哪个执行点在拒"**（R17 的读取侧具名拒之所以是正解，正因为它是当时**唯一**可能生效的点）。
★ **对 `task-147` 的含义**：给 9 个键补 `domain` **只完成"声明"**；**真正的修**在**读取侧具名拒**（＋若要"域外值进不来"，得**另立一个 config 通道的执法点**，那是比本任务更大的裁决）。

### 9.34.3 C：`systemPrompt` 定性 —— **有宿主侧证据（不是推断）**

**证据（我在宿主侧读到，非我方自述）**：
```
C:\Users\admin\.dsh\profiles\desktop\node_modules\dsh-ops\lib\index.js
    if (config.promptPolicy) root.inject(['systemPrompt'], ctx => { … })          ← ★ 服务【存在】且【必须 inject】
C:\Users\admin\.dsh\profiles\desktop\node_modules\dsh-ops\lib\ptc\index.js
    const assembly = await ctx.get('systemPrompt').assemble({ scope: agent, signal })   ← 惯用取法是 ctx.get(name)
C:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\app.asar   (121,348,951 bytes)
    "systemPrompt" 出现 350 次                                                        ← 宿主 bundle 携带该服务
```
⇒ **定性**：**(a) 为什么不可达**：宿主**有**该服务，但（i）它是 **inject-only**（宿主插件用 `root.inject(['systemPrompt'], …)` 声明），且**（ii）受 `config.promptPolicy` 条件约束**；而我们的入口 `export const inject = ['tools']`（`vibe-math-vmu.js:51`）**未注入**它 ⇒ 直接读 `ctx.systemPrompt` 撞上 cordis 服务代理的 `cannot get property … without inject`（`:676`）⇒ **具名降级是正确行为**，不是"宿主没能力"也不是"我们的缺陷"。
**(b) 归类**：**宿主能力缺口（边界）** —— 服务存在但**条件性、且只能注入**；把 `systemPrompt` 加进我们的 `inject` 会让插件**硬依赖一个可能不存在的服务**（`config.promptPolicy` 未开时宿主不注入 ⇒ 加载期即失败）⇒ **不加是对的**。
**(c) 何时会变好（改判条件）**：① 宿主**无条件**提供该服务；或 ② 我们改用**可选依赖语义**（`ctx.get('systemPrompt')` in try/catch —— 本行已在 `dsh-ops` 里被这样用，可作为我们的写法候选），或 DSH 提供 optional-inject；届时从"具名降级"升级为"具名可用"。★ **在此之前**：它**不影响** pack 装载与阈值开火（R25 已证），**单独记、不并档**。

### 9.34.4 纪律（本轮新增两条，均已入册）
1. ★ **"变异打错行 ＝ 量具错，不是断言没牙"**（Lead 指定）：R27 的 `A2` 实例——`String.replace` 只替换第一处 ⇒ 打在 `:323` 而非 `:349` ⇒ 断言其实**有牙**（打对了就红）。⇒ 判"断言没牙"之前，**先证"变异真的落在被测那一行"**（R27 已给出 `:349` 的对照读数）。
2. ★ **"schema 写了 `domain`" ≠ "运行时受保护"**（本轮实测新增）—— 见 §9.34.2(5)。

### 9.34.5 具名未闭合（交 Lead）
1. **`task-146` 未跑**（无新会话日志，§9.34.1）⇒ 四项读数的对表待其交付；payload 哈希仪器已备。
2. **`task-147` 的修点与硬约束冲突**（`meetings.js` 1199/1200 别碰 vs 修点在 `:128`＋11 调用点）⇒ 待 Lead 裁（原子抽取／转派／同批）。
3. ★ **`schema` 声明无运行时执行点**（§9.34.2(5)）⇒ **比 `task-147` 更大**，建议单独派单（至少：给 `resolveSettings` 找一个执行点，或明说"声明仅文档性"）。
4. **端到端未观察**：域外值被 `oneOf` 静默替换的**用户可见后果**（我的观测点未取到值）。
5. `systemPrompt` 改判条件见 §9.34.3(c)（边界，非缺陷）。

---

## §9.35 ★ R30 · **task-151（D1/D2）独立复核**：已落两条**两人独立同读数**；并具名其反例器的一处**并发隐患**

> **读的版本**（在飞：工作树有 8 个改动文件、多方写者）：`entry` sha256[0:16] **`F9620576E541DF2D`**（1164L）／`host` **`48E5FCF2490C2DF4`**（1138L）／其测试 **`782BBCF94737F061`**（209L）；`python` 无关。命令：`node D:\_tmp\v30\review-151.mjs` ⇒ **exit=0**。

### 9.35.1 D1（`applied` 带 `{requestId, manifestId}` ＋ `idMap`）：**已落，我复现**
```
packReport.applied = [{"requestId":"v5r","manifestId":"v5r-core"}]
packReport.idMap   = {"v5r":"v5r-core"}
status().packs     = ["v5r-core"]
★ 每条 applied 都有 requestId+manifestId（非空前置同时成立）＝ true
★ manifestIds ⊆ status().packs                              ＝ true
appliedPacks 保留                                            ＝ [{"id":"v5r-core","applied":32}]
```
⇒ 与 pack2 报的**逐字相同**；**交叉核对按映射成立** ✓。★ **它请我核的那一处（R27 的正面对照）**：`grep -c "applied: appliedIdMap.map" vibe-math-vmu/vibe-math-vmu.js` ＝ **2** ✓ —— 同一行出现两次、**两处都改了**（R27 的 `String.replace` 静默只改首处 ⇒ 那次是**量具错**，不是断言没牙）。

### 9.35.2 D2（`faces.registeredTools` 工具名级 ＋ `registeredToolDetail`）：**已落，我复现**
```
registeredTools      = 15 names, all ^vibe_vmu_: true
registeredToolDetail = 15 entries; keys=["name","face","reason"]   ← 与 publishedDetail 同形同源
published − registeredTools = []      registeredTools − published = []
```
⇒ `published − registered` **从回执即可计算** ✓。★ **我未能核到的一部分（具名）**：它称"与 `guards.registered` 的 4 个**守卫名**不再混名"，但**我这一臂 `faces.guards.registered = null`** ⇒ 该对照**我测不到**（不是"不存在"，是**我的观测臂取不到**）；**能核的部分（15 个全 `^vibe_vmu_`、与 `published` 双向差集为空）已核**。

### 9.35.3 ★ 反例（**我自己在副本上重跑**，真树未动）：两条都红、且是**真红**
| 变异（我的锚点） | 读数 |
|---|---|
| CONTROL（未变异副本） | **32/0**，`syntaxError=false` |
| **M-D1**（`applied` 退回 id 列表；锚点**命中 2 处 ⇒ 全局替换**） | **30/2**，`FAIL F1`（每条 applied 必须同时带两个 id）／`FAIL F2`（按映射交叉核对），`syntaxError=false` |
| **M-D2**（去掉 `registeredTools`） | **30/2**，`FAIL F4`（工具名列表 vs 守卫名）／`FAIL F5`（与 `published` 一致、差集可算），`syntaxError=false` |
⇒ 其"当天反例"**两条我各自复现**，且**红在被判定的那两条断言上** ✓；**无语法假红** ✓。

### 9.35.4 ★★ 我复核中发现的一条**工具隐患**（建议整改，非其交付内容的缺陷）
它自报的反例脚本 **`D:\_tmp\vmu-pack14\r30-counterexamples.mjs`** **直接改真树**：`writeFileSync(ENTRY/D1_FROM→D1_TO)`、`writeFileSync(HOST, …)`，末尾再写回快照（其行 31/37/38/44/47）。
★ **风险（本会话已多次发生）**：`task-151`/`task-147` 期间工作树**同时有 8 个改动文件、多个写者** ⇒ 若在它的"变异窗口"里有别人改了 `vibe-math-vmu.js`／`host.js`（本会话**每轮都在发生**），它末尾的"复原"会把**那一份陈旧快照写回**，**静默覆盖**他人的落地（＝R15"定点编辑被整文件写覆盖"的同族事故）。
⇒ **建议**：把反例器改成**只在 `D:\_tmp` 副本上变异**（我这次的 `D:\_tmp\v30\review-151.mjs` 就是这个形状：`cpSync` 整包 → 改副本 → 在副本里跑其测试 → 报告退出码/FAIL/`syntaxError`；真树**零写入**）。★ **我因此没有运行它**（它的写法与我的硬约束"只读复核"冲突）——这是**我在副本上重写同一对变异**的原因。
★ **并入纪律**：**"反例器必须与被测树物理隔离"**（与 §9.32.5 第 3 条"量具错"同族：**变异器本身也是一种量具**，写错位置会制造假结论、写错对象会破坏别人的成果）。

### 9.35.5 未落项（照其具名，我**未**核 —— 未落就没有可核对象）
③（尺寸上限导致的宿主侧省略；其称标记插在 JSON 中间 position 24846）／④（与 `packReport` 同型、约 6 行）**均未落**；★ 其自我边界"**省略发生在宿主侧、我们这侧只能先按尺寸上限自述**"我**不替它核**（真机/宿主行为未观测）。

### 9.35.6 ★ R30 追加：**更正我自己的一条"测不到"** ＋ `registered` **三义**（pack2 指出、我只读核过三条路径）

**★ 更正**：§9.35.2 我写"`faces.guards.registered = null` ⇒ 该对照我这一臂取不到" —— **原因是【我读错了父路径】**：`guards` 是 **`kernel.status()` 的顶层字段**（源码 `kernel/index.js:2286-2287 guards: { registered: Object.keys(GUARD_FACES) }`），**不在 `faces` 下**（我的 `faces.guards` ＝ `undefined`）。**现在可测，且成立**：
```
status().guards.registered = ["requireStore","requireLibrary","requireMembers","settingsView"]   ← 4 个守卫名（顶层）
faces.registeredTools      = 15 names, all ^vibe_vmu_                                              ← 15 个工具名
★ guards.registered.every(g => !registeredTools.includes(g)) = true      ← D2 的"不再混名"成立
```
⇒ ★ 这是本会话**又一次量具自错**（**观测点挂在错的父对象上**），与"字面前缀 grep／`execute()` 返回 JSON 字符串／`series` 丢 `.items`／`String.replace` 只改首处"同族 ⇒ ★ 并入纪律：**"取不到"必须先证明"我的路径是对的"**（**"取不到" ≠ "不存在"** 的加强版：这次连**字段存在**都成立，错的是我）。

**★ `registered` 三义（pack2 找到；我只读核了三条路径）**：
| 义 | 位置 | 读数 |
|---|---|---|
| **A 服务名** | `start()` 的回执：`kernel/index.js:1730/1745 registered: registrations.slice()` | 同帧 `status().registrations = []`（该臂无服务注册） |
| **B 守卫面名** | `status().guards.registered`（`kernel/index.js:2286-2287`） | `["requireStore","requireLibrary","requireMembers","settingsView"]` |
| **C 工具名** | `faces.registeredTools`（本任务新落） | 15 个，全 `^vibe_vmu_` |
⇒ ★ **"registered" 在回执族里没有唯一定义** ⇒ 这应作为 **D2 的动机**入册（**不只是"守卫名混淆"，而是该词本身缺唯一定义**）。★ 注：我 R30 记的"全回执 `registered` 只出现 1 次"**不矛盾**——当时我的臂**取不到 kernel 侧那两处**（其一在 `start()` 自己的回执里）。

**★ 顺带一条【正面样板】（供 `task-147`／D2 参照）**：`status().guards.faces[*]` 每条带 `semantics`／`kind`（`contract`｜`diagnostic`）／`usedByProduction`／`productionCallSites`／**`reason`**（`diagnostic` **必带** reason），并有 `verifiedBy` 指向"**扫源码断言每个 `require*` 面都在此注册 ＋ 有变异体能失败**"的测试 ⇒ **这正是"(乙) 每个名字带可复核 reason、失败打印未解释者"的现成形状**；★ 它证明那套要求**不需要新发明**（`reason` 来自可复核来源＝语义/调用点，而非白名单）。

**★ pack2 的 CAS 止血**：我已收到其"写回改成 compare-and-swap、不符即 ABORT"的处置 ⇒ **接受为【止血】，仍【不是】物理隔离**（Lead 已裁下一轮做副本制）；本条的定性不变：**反例器必须与被测树物理隔离**。

---

## §9.36 ★★★ R30 · `task-149 A` 复核：**执行点确已落地，但它把 319 个已声明键在【两个面】上一律拒掉**（合法值也被拒）

> **读的版本**（在飞、多写者）：`entry` sha256[0:16] **`F9620576E541DF2D`**／`kernel/index.js` **`0EA318FC220E4028`**（2306L）／`settings/schema.js` **`28133DB4B8DBB072`**（1653L）。命令：`node D:\_tmp\v30\review-149a.mjs`／`…\string-regression.mjs`，均 **exit=0**。

### 9.36.1 证据：**合法值被拒**（不是"只有域外值被拒"）
```
setSettingsValue('vmu.meetings.attendanceMode', 'roster')  ⇒ THREW VMU_INVALID_ARGUMENT :: unknown declaration type for vmu.meetings.attendanceMode: string
setSettingsValue('vmu.meetings.minutesDetail',  'brief')   ⇒ THREW 同上（string）
setSettingsValue('vmu.meetings.tier',           'light')   ⇒ OK（enum ⇒ 有 case）
config.vmu['vmu.meetings.attendanceMode']='bogus'          ⇒ 被 screen 掉（记账），但 reason 写作 "expected string" ← ★ 值本就是 string ⇒ **该 reason 误导**（`screenSettings` 的 type 表是否也缺 `string`，或其文本错，**我未定性**；两者都需同一道覆盖门）
```
### 9.36.2 机制（代码位）
`settings/schema.js:1462-1494` 的 switch 只覆盖 **`boolean／enum／natural／ratio／positiveInteger／path／stringList／objectList`**；**缺 `string／integer／number／object／planned`** ⇒ 落 `:1492-1493 default: throw refuse('VMU_INVALID_ARGUMENT', 'unknown declaration type for ' + d.key + ': ' + d.type)`。
★ A 让这个函数**从死代码变成两个面都在跑**（交互写面 `kernel/index.js:1913`；构造期 config 筛面 `:372`、**早于 `settingsView`（:381）**）⇒ **它把"未定义"当成"非法"**。

### 9.36.3 爆炸半径（按 `SETTING_DEFS` 精确计数：**1226** 键）
| 未覆盖类型 | 键数 |
|---|---|
| `string` | **173** |
| `planned` | **111** |
| `object` | **21** |
| `integer` | **7** |
| `number` | **7** |
| **合计** | **319（≈26%）** |
影响面：**运行期写** ⇒ 抛 `unknown declaration type`；**构造期 `config.vmu`** ⇒ 值被丢弃（并带那条误导 reason）。
★ **其 26 条断言抓不到**：覆盖面＝"交互面三枚举键 ＋ ratio 0..1 界 ＋ 配置面…"，**没有一条走在 `string` 键上** ⇒ 回归对它**不可见**（"断言只覆盖被判定的那几档"）。

### 9.36.4 修法（待裁；二选一或并用）
**(i) 补齐 case**：`string`／`integer`／`number` 简单；**`object`／`planned` 需先定"什么是合法"**（`planned` 111 键本是"声明但未接线"，定语义需裁决）。
**(ii) 收窄激活范围**（推荐先做）：只对**已实现类型**执法，未实现类型**保持原行为**（不拒）⇒ 一步消掉 319 键的回归，同时保留 enum/ratio 上真正想要的那道门。
★ **无论选哪条，都建议加一道覆盖门**：**`SETTING_DEFS` 里出现的每一种 `type` 必须在 `validateValue` 里有 case**（否则红）＋"新加一种类型 ⇒ 红"的变异 ⇒ **这道门当天就能抓住本条**。

### 9.36.5 ★ 新纪律（入册）
**执行点上线前，先证它对【每一种已声明类型】都有定义；否则它会把"未定义"当成"非法"。** ★ 与 R28 的"**schema 写了 `domain` ≠ 运行时受保护**"合看，两个方向都要防：
- R28：**没人执行**（`resolveSettings` 无调用者）；
- R30：**执行了，但把没定义的类型当非法**（本次）。

### 9.36.6 ★ 我自己的仪器更正（本会话量具自错族的新成员）
我 R28 的探针**只检测"抛不抛"** ⇒ 面对 A 这种"**不收 ＋ 具名记账 ＋ 用默认值**"的设计，它把**已修好**的键读成 `LOADED（无拒绝）`（我重跑 R28 脚本时就撞上这一点）。⇒ **已升级仪器**：读 **`status().settings.settingsRejected[]／settingsRejectedCount`**（＝A 自己的可观测量），上面 9.36.1 的结论即来自升级后的探针。★ 并入纪律：**判据的形态必须与设计的形态一致**（"抛错型拒"与"筛选型拒"是两种可观测量；拿前者测后者会得出**假阴性**）。

### 9.36.7 同时确认成立的部分（**不是**全盘否定）
1. `validateValue` 在交互面（`kernel/index.js:1913`）✓；
2. `screenSettings(settings,{source:'config'})` 在 `:372`、**早于 `settingsView`（`:381`）** ✓；
3. `applyPackSettings` 用 `resolveSettings([incoming],{onInvalid:'reject'})`（`:1855`）⇒ **`resolveSettings` 的第一个真调用者** ⇒ **我 R28 的"无执行点"发现就此闭合** ✓；
4. `status().settings.settingsRejected／settingsRejectedCount` **可读**，且**对有域键行为正确**（实测 `rejectedCount=1`、`source:"config"`、reason `"outside the declared domain formal | light"`）✓；
5. 对 `tests/audit-settings-channels.test.mjs` 的改法**不是削弱**：意图不变（两通道一致 ＋ 至少一键真物化），并新增 **`G1.g0` 非空前置**钉住非空 ⇒ 那道门的**非空性**有据 ✓；★ 残余观察：`probeValueFor` 在"单成员域／`before` 不在域内"时可返回 `before`（写入成 no-op），而门只要求 `observed ≥ 1` ⇒ 整体不假绿，但**逐键意图未被逐键断言**（记为观察，不是红）；
6. `RULE E 67=67` ✓。

### 9.36.8 ★ R30 **收口追加：回归已修**（本节**取代 §9.36.1–9.36.4 的"未修"状态**；旧文保留对照）

**版本锚点（修后）**：`settings/schema.js` **`15372574CF801DD3`**／`kernel/index.js` **`81D7CDD40962C773`**／`tests/vmu-settings-domain.test.mjs` **`5BA6953DDE7E2C5B`**（`entry` 未变 `F9620576E541DF2D`）。命令：`node D:\_tmp\v30\closure-149a.mjs`／`…\reconcile-13.mjs`，均 exit=0；两次 run 到文件后读取（见 9.36.8-(7)）。

**(1) 交互面：合法值不再被拒，错型**拒得准** —— comms2 要我核的三条全部成立**
```
setSettingsValue('vmu.meetings.attendanceMode','roster') ⇒ OK      （修前：THREW unknown declaration type …: string）
setSettingsValue('vmu.meetings.minutesDetail','brief')   ⇒ OK
setSettingsValue('vmu.meetings.attendanceMode', 42)      ⇒ THREW VMU_INVALID_ARGUMENT :: … expected a string   ← ★ 准确理由，不再是 "unknown declaration type"
setSettingsValue('vmu.meetings.tier','bogus')            ⇒ THREW … expected one of formal | light
```
**(2) 配置面：合法 string 不再被筛** —— `config.vmu['vmu.meetings.attendanceMode']='signin'` ⇒ `settingsRejectedCount=0`、该键**零条目** ✓（修前：被筛且 reason 写成误导的 `"expected string"`）。
**(3) `settingsUnenforced` 具名（Lead ①的"不静默也不误拒"）** ✓：
```
{"types":[{"type":"planned","count":111,"reason":"no validator implemented for this declaration type yet"}],
 "declarations":[{"key":"vmu.tools.enabled","type":"stringList","reason":"declaration defect: its own default does not satisfy its declaration (expected a list of strings)"}, …]}
```
**(4) 逐类型见证（我自己的表，走真入口；Lead 新加的复核项）**：13 种已声明类型**每种都有见证**——
| 类型 | 见证键 | 合法值 | 非法值 |
|---|---|---|---|
| boolean／integer／natural／number／object／objectList／path／positiveInteger／ratio／string／stringList（11 种） | 各取一键 | def ⇒ **OK** | 错型 ⇒ **THREW，理由逐型正确**（`expected a boolean／an integer／a finite number／an object／a list of objects／a workspace-relative path／an integer >= 1／a number in 0..1／a string／a list of strings`） |
| **`planned`** | `vmu.a11y.checkScope` | def ⇒ OK | `42` ⇒ **ACCEPTED**＝**被具名"不执法"**（见 (3) 的 `count:111`＋reason）✓ |
| `enum` | ★ 我第一版取了 `vmu.core.storeBackend` ⇒ **合法/非法都 THREW `VMU_NOT_PERMITTED … read-only (H3)`** ⇒ 那不是校验器的见证，而是**只读守卫**的见证 ⇒ **是我的见证选键问题（不是它的缺陷）**；换非 H3 键 `vmu.meetings.tier` ⇒ 合法 OK／`'bogus'` 具名拒 ✓ |
**(5) ★ 覆盖门与回归见证**：其套件**干净 40/0 exit=0**；变异 `CTRL_MUTANT=drop-string` ⇒ **exit=1**，具名：
```
FAIL W1/W2. a legal value of a `string`-typed key is ACCEPTED on the interactive face (it used to throw …)
FAIL W3.     a WRONG type is still refused, with an ACCURATE reason (not "unknown declaration type")
FAIL W7.     {"probed":12,"broken":["string@vmu.turn.objective legal=false illegal=unknown declaration type for vmu.turn.objective: string"]}
FAIL G1.     {"types":13,"named":["planned"],"unjudged":["string(vmu.turn.objective)"]}          ← ★ 覆盖门（Lead ③）有牙
FAIL G2.     {"refused":173,"sample":["vmu.turn.objective :: unknown declaration type …","…protocolPath…","…verifyTarget…"]}
```
⇒ ★ **"新加没 case 的 type 必红"（G1）与"没有声明拒掉自己的默认值"（G2）都当场红，且 `string` 盲点被逐名点出** ✓ —— **Lead ③④ 的要件满足**。
**(6) comms2 新具名的那一类（"声明与自己的默认值矛盾"，13 键）—— 我独立核过，两者不矛盾**：我按 `validateValue(key, def.def)` 复算 ⇒ **0/1226 失败**；而其 `settingsUnenforced.declarations` 列 13 条。**行为证据解释了这个差**：`validateValue('vmu.limits.maxParallel', 0)` **THREW**（`expected an integer >= 1`），而 `validateValue('vmu.topology.committeeSize', 0)` **不抛** ⇒ **存在逐键豁免**（那 13 键被排除在执法之外并逐一具名）⇒ 我的 0/1226 是"**被判定的键**"的读数，其 13 是"**被豁免的键**"的清单，**同源不冲突** ✓。★ 该类本身仍是**真缺陷**（`type:'stringList'` 默认 `null`／`type:'positiveInteger'` 默认 `0`：**声明或默认值之一写错了**）⇒ **建议入册为新的一类**（R28＝"没人执行"／R30-a＝"执行了把未定义当非法"／**R30-b＝"声明与自己的默认值矛盾"**），处置＝逐键修声明或改默认值，**不要长期靠豁免**。
**(7) ★ 我本轮的第二条量具教训**：我上一轮把 `node … 2>&1 | Select-Object -Last 1; echo $LASTEXITCODE` 当成了子进程退出码 ⇒ 读到"clean exit=1"的**假读数**（`$LASTEXITCODE` 反映的是**管道最后一条命令**）。**改为把输出写文件再读** ⇒ 干净 **40/0 exit=0**、变异 **exit=1**。★ 并入纪律：**退出码必须在没有管道包裹时取**（与"判据形态必须与设计形态一致"同族：**测量管道的形态也会改变读数**）。

### 9.36.9 ★ R30 追加：**R30-b 拆三分（b1／b2／b3）—— 我独立复核成立，含两条更正**

**comms2 把 §9.36.8-(6) 的"13 键"按根因拆成三类**；我逐键复核（`node D:\_tmp\v30\verify-13-split.mjs` ⇒ exit=0），**三类都成立**，并补上**判别性对照**：

| 根因 | 键数 | 我核到的 `type`／`def` | ★ 判别性对照（非豁免键） |
|---|---|---|---|
| **b1 `null` 默认值 vs 具体类型** | 清单 10（见下方更正） | `vmu.tools.enabled`／`vmu.tools.faces`＝`stringList` def `null`；`vmu.external.endpoints`／`mergePolicy`／`vmu.math.repro.seed`／`vmu.partnership.crossBorderGate`／`vmu.resource.capabilityTags`／`vmu.teaching.latePenaltyRatio`＝`object` def `null` | ★ **`null` 在非豁免键上被一律拒**：`vmu.records.tracks`(stringList) ⇒ `THREW expected a list of strings`；`vmu.prompts.bindings`(objectList) ⇒ THREW；`vmu.board.wipPerColumn`(object) ⇒ THREW；而**豁免键**（`tools.enabled`／`external.endpoints`）`validateValue(null)`＝**ACCEPTED** ⇒ **它们的"被接受"来自逐键豁免，不是校验器认识 `null`** ⇒ **b1 根因成立** |
| **b2 数字默认值被标成 `object`** | 2 | `vmu.math.optim.tolerance`＝`object`／def `1e-6`；`vmu.math.precision.tolerance`＝`object`／def `1e-9` | 非豁免 `object` 键给数字 ⇒ `THREW expected an object` ⇒ **若受判定，这两个默认值会被拒** ⇒ 声明确错（生成块） |
| **b3 `positiveInteger` 默认 `0`** | 1 | `vmu.topology.committeeSize`＝`positiveInteger`／def `0` | 非豁免 `positiveInteger` 给 `0` ⇒ `THREW expected an integer >= 1` ⇒ 矛盾确真（手写行） |

★ **旁证（其引用的"null 是框架的未设哨兵"）我核到了源头**：`scripts/generate-wired-schema.mjs` 中确有该词汇（如"the key was emitted with a **null default**"／"…emitted with an **honest null**…"）⇒ **框架有"null＝未设"的概念，而校验器没有实现它** ⇒ 建议裁定 **(i) `null` ＝未设 ⇒ 对所有受判定类型一律接受（语义＝回落声明默认值）** ⇒ 10 键即可从豁免名单消失（这正是"别长期靠豁免"）。
★ **更正 1（清单键名）**：其 b1 清单里 **`vmu.invoiceTaxSlots`／`vmu.registryDir` 在 `SETTING_DEFS` 中【未命中】**（`NOT FOUND`）⇒ 疑似以**别名/短名**书写（模块导出 `SETTING_ALIASES`／`resolveKey`）⇒ **清单必须按 `SETTING_DEFS` 的规范名书写**，否则"13"这个数在**按名清点时不可复算**（我逐字命中的是 **8 个**，另 2 个待其按规范名重列）。
★ **更正 2（计数口径）**：我的 `validateValue(key, def.def)` 全量复算＝**0/1226 失败**（＝**被判定的键**），其 13＝**被逐键豁免的键** ⇒ **两者同源不冲突**（§9.36.8-(6) 已裁）；本节的 b1/b2/b3 是**对"被豁免者"做根因分类**，不是对"判定失败者"。
★ **`UNJUDGED_TYPES = ["planned"]`** ✓ 与其 `settingsUnenforced.types[0]` 一致（我核到）。
★ **处置建议（待 Lead 定序，comms2 未趁热手改、我赞成）**：**(i)** 先裁 **b1 的 `null` 语义**（裁了就少 10 键豁免）；**(ii)** b2 归**生成器属主**（类型推断把 number 读成 object）；**(iii)** b3 归**手写行**等语义裁定；★ **本提交不依赖该三分表**（现状＝豁免已具名、不隐藏）。

### 9.36.10 ★ R30 追加（三）：**更正我自己的"别名"猜测** ＋ **13 键双向集合相等**（comms2 更正成立）

**版本**：`schema.js 15372574CF801DD3`；命令 `node D:\_tmp\v30\verify-13-canonical.mjs` ⇒ **exit=0**。

**★ 更正我 §9.36.9 的"更正 1"**：我当时写"疑似以**别名/短名**书写"—— **"别名"那半错了，真因是【comms2 的清单把键名缩写了】**：
```
resolveKey('vmu.invoiceTaxSlots')  ⇒ "vmu.invoiceTaxSlots"（原样返回 ⇒ 不是别名）
resolveKey('vmu.registryDir')      ⇒ "vmu.registryDir"（同上）
SETTING_ALIASES 的键数             ⇒ 0        ← 本模块里根本没有别名条目
vmu.partnership.invoiceTaxSlots    ⇒ 在 schema 内：type=object, def=null
vmu.partnership.registryDir        ⇒ 在 schema 内：type=object, def=null
```
⇒ **规范键名逐字命中** ⇒ **b1＝10 成立**（2×`stringList` ＋ 8×`object`，全 `def=null`）。

**★ 更强的一条：13 键与回执自己的清单【双向集合相等】**（不是我按名点数，而是与 receipt 对集合）：
```
receipt settingsUnenforced.declarations.length = 13   （非空前置 ✓）
in theirs but NOT in receipt = []      in receipt but NOT in theirs = []      ⇒ ★ set equality = true
receipt byType = {stringList:2, positiveInteger:1, object:10}
```
⇒ 与其三分表**数值自洽**：`object 10 = b1 的 8 ＋ b2 的 2` ✓；`stringList 2 = b1` ✓；`positiveInteger 1 = b3` ✓。
**★ 纪律（comms2 提、我采纳）**：**清单里的键名不得缩写** —— 缩写会把一个**可复算的名单**变成"复算不出 10"（这正是我 ② 指出的可复算性损失）；表述上还要把"**我缩写了**"与"**它不是别名**"两件事**分开写**（免得后人重走我这条弯路）。★ 与既有纪律同族：**"引用前先落一行核验"** ＋ **"清单不许采信，要按规范名复算"**。

---

## §9.37 ★ R35 · **v21 并入块**（R32–R34 闭合项 ＋ 本轮 A1–A4 独立复核 ＋ 纪律族）

> **读的版本（逐条绑哈希）**：`HEAD 8431f6d`（工作树 clean）；R34 真机臂跑在 **`8b680cb`**；真机会话 `session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`（2026-10-15 **23:25**）；**spill** `…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`（182,374 B）。
> **指回（不重抄）**：五件「测量环境的同一性」＝**§9.31.1（M-1…M-5）＋ M-6（§9.30.9）**；四次空过形状＋机制＝**§9.32.7**；**署名约定＝§9.33.7**；量具族＝**§9.35.6(g)**。

### 9.37.1 R32–R34 并入（★ 每条标"我核了什么／没核什么"）

| 轮 | 闭合项（其主张） | 我的读数 |
|---|---|---|
| **R32** | ①回执**自省略/截断自述**（`receiptMeta`：`truncated`／`elided[{path,from,to,bytes}]`／`hostElision`／`originalBytes`／`note`，**附加不替换**）；②反向判据（未超预算 ⇒ **不出现 `truncated`**）；③`docs/04 §11` **三档图例**（`✅`／`⚠️`／`❓未判定（看不见 ≠ 没有）`）；④`docs/11` **第九条·I12**（生成器当子检查 ⇒ `spawn` 放大，**修负载不修预算**） | ★ **我核到实现**：`UNDETERMINED = '❓ 未判定（…）'`（`generate-vmu-settings-table.mjs:175`）、`verdictOf()`（`:281`）、三档计数（`:309-311`）；`--check` 读数见 9.37.2-A3 |
| **R33** | ①**spill 纪律**（宿主把大回执 spill 到文件、**转录只留省略版**）②真机 D1（当时**无**截断标记）＝**契约尚未存在**（非缺陷）③真机 D2：**同一语义两个名字**（工具面 `appliesFrom`／内核面 `appliesAt`）④**第三档落地** | ★ **我独立复现了 spill 纪律的"两份不同"**：同一次运行，**spill 182,159 字符（可 `JSON.parse`）** vs **转录里该结果 50,319 字符**（省略版）⇒ 见 9.37.3-(i) |
| **R34** | ①**真机上 `receiptMeta.truncated:true` 真的出现**（四项验收）②`appliesFrom` 保留为**同值别名**（统一到 `appliesAt`）③`note` 措辞更正（`to reach` → `TOWARD … does NOT claim the budget was reached`）④docs 三处（`docs/21 §20.8`／`docs/04 §11` 三档口径／`docs/11 I12`） | ★ **A1/A2/A4 全核**（见 9.37.2）；★ `note` 的**改前措辞在真机回执里逐字可见**（`… BY US to reach MAX_TOOL_RESULT_BYTES (12000)…`）⇒ 与"该修在 `8b680cb` 之后才落"**一致**（`receiptbounds.js`：`8b680cb` `56285AC856E75DE4` → HEAD `402436FD37154030`） |

### 9.37.2 本轮 A1–A4 独立复核（读数＋原样命令＋退出码）

**A1 真机臂**（命令：`node D:\_tmp\v35\verify-spill.mjs`／`…\verify-spill2.mjs`，均 exit=0）
- **payload 逐字节**：`git cat-file blob 8b680cb:vibe-math-vmu/vibe-math-vmu.js` ⇒ **`71E288B9AD711E2E`（85130 B）** ＝ 其报告**逐字相同** ✓；`kernel/receiptbounds.js` ⇒ **`56285AC856E75DE4`（8082 B）** ✓（HEAD 为 `402436FD37154030`／8888 B ⇒ `note` 修正在其后）。
- **spill 解析** ✓：`JSON.parse` 成功（182,159 chars）；`receiptMeta.truncated === true` ✓；`elided[0] = {path:"settings.resolved.vmu.turn.instituteName.value", from:2000, to:14000, bytes:12000}`。
- **`elided` 复算** ✓：`bytes === to − from`（12000 = 14000 − 2000）✓；`to === 14000` ✓；`originalBytes === 193684` ✓；`hostElision === "possible"` ✓。
- **保留值形状** ✓：`settings.resolved['vmu.turn.instituteName'].value` **length = 2009**（＝2000 ＋ `…[elided]` 9 字符）、**head `ABCDEFGHIJ`**、**tail `…[elided]`**。
- ★ **未核项（具名）**：**"保留值 ＝ 原文前缀"我未能独立复算** —— 原始 14,000 字符串的**输入件不可得**（我扫 `D:\_tmp` 只找到 `r163-B-overlay.yml`／`r163B-B-overlay.yml`，其中 `ABCDEFGHIJ` **只出现 10 字符**）⇒ 该子项**仍是其读数**。★ **由此得一条可执行建议**：**读数依赖的输入件必须保留**（否则该读数**事后不可复核**）；更好的是让回执带**原文哈希**（现在只有 `from/to/bytes`）。
- **`pwsh` 面同套标记** ✓：会话留（多帧解码，32 行）里 `name=pwsh` 的结果带 **与 status 回执完全相同的 `elided` 数组**（`from 2000／to 14000／bytes 12000`）⇒ 契约对**每个面**生效 ✓（**按 spill 纪律读**：小结果面本就在会话留里完整）。
- **反向臂** ✓：同臂 `receiptMeta = {"truncated":false,"elided":[],"hostElision":"possible","originalBytes":965,"note":null}` ⇒ **`truncated:false` 与 `true` 同臂并存** ✓。

**A2 `appliesAt === appliesFrom`**（命令：`node D:\_tmp\v35\verify-applies.mjs`，exit=0）
- **真入口（工具面）**：`vibe_vmu_set` 真调用 ⇒ 两键**都在**、**同名同值** ✓：`vmu.turn.instituteName`（内核**实测活读者**细化后的长披露）／`vmu.a11y.checkScope`（**planned 披露存活**：`"never yet (planned key: no runtime consumer)"`）。
- ★ **我的 kernel 路径探针没取到**（`appliesTable()` 返回 4 条、两键 `undefined`）⇒ **我的仪器问题（具名）**；kernel 侧证据由**其套件**与工具面读数承担。
- **副本制反例** ✓：`host.js` 的 `appliesFrom: appliesAt` 锚点**命中 1 处**（与"同帧同一局部量"一致）；改坏 ⇒ **6 passed / 7 failed，exit=1**，`FAIL B1`（两键都在）／`B2`（都不为空）／★ **`B3`（ONE FACT, ONE NAME, ONE VALUE：`appliesAt === appliesFrom`）**，**`syntaxError=false`** ⇒ **红在被测行** ✓；CONTROL **13/0** ✓。

**A3 §11 三档 ＋ 归属闭环**（命令：`generate-vmu-settings-table --check`／`audit-vmu-docs`／`run-tests.mjs` 比对）
- `--check` ⇒ **`up to date (1226 keys (1108 wired, 3 undetermined, 115 declared-but-not-wired))`** ⇒ **1108＋3＋115 ＝ 1226** ✓；★ **`3/115` 与 R33 一致** ⇒ **R34 的 `4/114` 正式作废**（见 9.37.3-(ii)）。
- `audit-vmu-docs` ⇒ **103 passed / 0 failed，exit=0** ✓（其"`--write` 后应回 103/0"成立）。
- ★ **`run-tests.mjs` 的 `GATE_SUITE_TIMEOUT_MS`／180 s 未被抬**：blob 在 `8b680cb` 与现在**同为 `B988AF9351E9219C`**、且仍含 `180000`／`180 s` ✓。
- ★ **"只中和 STALE 而未放宽断言"我未能直接核**：其 R33/R34 的中和脚本**我在 `D:\_tmp` 未找到** ⇒ 属**其自报**。★ 但我**复现了它要解决的那个形状**：在副本里清空一个档位格 ⇒ `audit-vmu-docs` **exit=1，且输出只有 `vmu settings table: STALE …`、无 `FAIL`/摘要**（`hasSTALE=true`）⇒ 即 R33 的"**半个证据**"今天仍可复现。★ 并且：**当前树里该子检查已在审计内部**（`tests/audit-vmu-docs.test.mjs:17` **import** `verdictOf/WIRED/UNDETERMINED/NOT_WIRED`；`:746` 是审计自己的 `process.exit`）⇒ **"中和一个 spawn"的描述与现形状不符**，技术需按现形状重述；★ **建议替代法**：**变异 `verdictOf`**（不碰 docs 格）⇒ 红只可能来自审计断言（我未跑，属建议）。

**A4 性能**（命令：同会话内 `Stopwatch` 计两次；基线 4.84／6.65）
- `generate-vmu-settings-table.mjs --check` ⇒ **4.76 s，exit=0** ⇒ **≤ 基线** ✓。
- `generate-wiring-index.mjs --check` ⇒ **7.35 s／7.20 s**（两次），exit=0 ⇒ 比其 **6.65 s** 慢 **~0.6–1.0 s**。★ **机制层解释**：该脚本字节**在 `8b680cb` 与现在相同**（`CB433A9EDAC803C0`）⇒ **差异不能归因于代码**；同机但**非同时**、且期间**多人在跑 node**（本会话一直在跑套件/生成器）⇒ **环境漂移**。⇒ **两种读数并列**（其 6.65／我 7.20–7.35），**不单独归因**。

### 9.37.3 ★★ 两条本人所立、本轮务必入册的纪律（均带现场实例）

**(i) 「我看见的那份不是全量」** —— 现场：**同一次真机运行**，**spill 182,159 字符（全量、可解析）** 而**转录里该结果只有 50,319 字符**（省略版）；`pwsh` 面那份（14,468）反而**完整**。⇒ 合并为**一条总纪律**：**读数必须说清"读的是【哪一份】（spill／转录／会话留）＋【哪一版】（blob 哈希）＋【哪一时刻】"**。★ 本会话已有同族现场：payload 快照（§9.31.4）、在飞编辑（§9.31.4）、管道取错退出码（§9.36.8-(7)）。
**(ii) 「旧数字是旧方法的产物」【双向】** —— 现场：**R34 的 `4/114` 是新方法的产物**（`],` 结尾的列表**永不终止** ⇒ **越界配对**），**R33 的 `3/115` 才是对的**；★ **我本轮 `--check` 独立得到 `3/115`** ⇒ 采纳 `3/115`。★ **纪律（双向）**：**凡"数字变了"，采纳前必须给【机制层解释】** —— 既防"**旧**数字被新方法悄悄改掉"（R34），也防"**新**数字没解释就推翻旧结论"（Lead 自陈 R33 未要机制就裁 (a) ⇒ **裁错**）。★ 同族：`§9.36.8-(7)`（管道取错退出码把 40/0 读成 1）。

### 9.37.4 纪律族（≥11 条）—— **汇总指针**（不重抄）
M-1 payload 哈希／M-2 解码帧完整性／M-3 `await` 指纹／M-4 装载 settle／M-5 同刻同源（**§9.31.1**）＋ M-6 因式分解（**§9.30.9**）；四次空过形状＋机制（**§9.32.7**）；「列在队列里 ≠ 尚未完成」（**§9.32.5**）；「没 grep 到 ≠ 不存在／问『谁声明它』读 `faces.sources`」（**§9.32.5**）；「量具而非被测物」＋观测通道自造假象族（**§9.35.6(g)**）；「变异打错行＝量具错，不是断言没牙」（**§9.34.4**）；「schema 写了 `domain` ≠ 运行时受保护」（**§9.34.4**）；「执行点上线前先证它对每种已声明类型都有定义」（**§9.36.5**）；**署名约定（§9.33.7）**；★ 本轮新增 **9.37.3-(i)(ii)**。

### 9.37.5 具名未闭合
1. **"保留值＝原文前缀"** 我未独立复算（**输入件不可得**）⇒ 仍是其读数；建议**留输入件**或让回执带**原文哈希**。
2. **"只中和 STALE、未放宽断言"** 我未直接核（**其脚本未找到**）；且该技术需按**当前形状**（审计内部 import，不是 spawn）重述。
3. **我的 kernel 路径探针**（`appliesTable()` 两键 `undefined`）＝**我的仪器问题**，待另法复取。
4. **`wiring-index --check` 的 6.65 vs 7.20–7.35**：**机制未定**（脚本字节相同 ⇒ 环境漂移），两读数并列。

---

## §9.38 ★ R36 · **v22 并入块**（R35 两件闭合 ＋ premise 推翻 ＋ **两方合流的"不变红守卫"** ＋ 我的一处更正）

> **署名（照 §9.33.7）**：本节凡标 **"独立复核"**＝我（`vmu-verify2`）跑出的读数；标 **"自报（同一次扫）"**＝他人一次运行（命令见其报告）。
> **读的版本**：矩阵写于 `HEAD` 后（工作树**多方在飞**，故**本节含引用其报告的读数**，均注明来源；我的独立读数见 §9.37）。

### 9.38.1 R35 ①：**两名字断言的闭环**（`vmu-pack2`／`task-167`；"自报（同一次扫）"＋"独立复核"）

- **文件** `tests/vmu-applies-name-unified.test.mjs`；**13 passed / 0 failed, exit 0**（★ **我独立复跑 13/0**）；四组全走真入口：**A 前提**（真入口注册 `vibe_vmu_set`、内核暴露 `appliesTable()`）／**B 普通键**（H1 `vmu.packs.allowOverride`，含"工具层回执 vs 内核 `appliesTable()` 两条路径对齐"）／**C planned 键**（`vmu.a11y.checkScope`，★ 强披露 `never yet (planned key: no runtime consumer)` 必须胜出）／**D refined-H2 键**（`vmu.turn.instituteName`，值是**内核细化后的披露**而非粗表值）。
- **两键恒存在**＋**非空前置**：三例都断言 `'appliesAt' in r && 'appliesFrom' in r` 且 `typeof … === 'string' && length > 0` ⇒ **"两边都 undefined"不能过**。
- **当天反例（副本制；真树 md5 前后逐字节相同）**：**M1 12/1（红在 D2）**、**M2 11/2（红在 C3／C4＝planned 那一例）**；★ **我自己的副本反例**（改坏 `appliesFrom: appliesAt`）⇒ **6/7，红在 `B1/B2/B3`（B3＝同一事实同值）**，`syntaxError=false` ⇒ **两方都证明该断言有牙**。
- ★ **可复用原理（入册）**：**"能红的反例需要一个【两条路径会分叉】的输入"** —— 对**普通 H1 键**，"从表里重算"与"取内核值"**结果相同**（都 `'next turn'`）⇒ **普通键 catch 不住"改回表值"这个回归**；只有**内核会细化**的输入（H2＋实测活读者）才分叉 ⇒ **M1 正是被 D2 抓住**。★ 与 R27「**变异打错行**＝量具错」**同族**，但这次错在**输入**而非**位置**（§9.34.4）。
- **具名脆弱点（其自陈，我认同）**：D3 依赖"`vmu.turn.instituteName` 是 H2 **且有实测活读者**"这一**事实** ⇒ 若活读者集合变了，D3 需随之更新（**那是事实变了，不是断言错**）。

### 9.38.2 ★★ **第 4 次 premise 被推翻**：`comms2` 先核后判 —— "第三档未落地"不成立

| 其先核的三件（自报） | 读数 |
|---|---|
| `verdictOf` 三值？ | ✅ `:175 UNDETERMINED`／`:283 return listIterationEvidence(key) ? UNDETERMINED : NOT_WIRED` |
| 行只渲染两档？ | ✅ **不是**：`:290` 接线格＝`verdictOf(def.key) + …` ⇒ **直接渲染三值** |
| 表体档位 | ✅ `docs/04 §11`：**1108／3／115** |
| `--check` | ✅ **`stale: false`（up to date）** ⇒ **不是"表陈旧"** |
| `audit-vmu-docs` | ✅ **103/0** |
⇒ **结论：无需改生成器、也不需要 `--write`**；★ **我的独立读数完全一致**（§9.37.2-A3：`up to date (1108 wired, 3 undetermined, 115 declared-but-not-wired)`、`audit-vmu-docs 103/0`、`1108+3+115=1226`）⇒ **两方确认**。
★ **纪律（新增，入册）**：**"任务前提必须先核"** —— 这是本会话**第 4 次**"任务书给的前提经核查不成立"（前三次：task-107 的调用形豁免已在 HEAD、R27 的"断言未落"、R34 的 `receiptMeta` 差异）。★ 与「**"表陈旧"与"判据看不见"读数同形 ⇒ 判别只能靠"修完判据再跑 `--check`"**」（其报告 §0）同族。

### 9.38.3 ★★ **"不变红的守卫"** —— **两方读数合流（本轮主判据）**

| 量法 | 变异 | 读数 |
|---|---|---|
| **其 R35（自报，副本内先中和 STALE 子检查）** | 把某行档位格**清空**（M1） | ★ **exit=0 —— 仍 GREEN** ⇒ **该守卫对"清空档位格"不变红**（其自陈：**原因未核**，两个假设〔变异没落在审计实际读的 docs 上／`rows` 取法不是第 8 格〕**都未验**，不猜） |
| **我的 R35（独立复核；不中和）** | 把某行档位格**清空** | ★ **exit=1，但输出只有 `vmu settings table: STALE …`、无 `FAIL`/摘要**（`hasSTALE=true`）⇒ **红只来自 STALE，不来自档位断言** |
| **其 R35（自报）** | 把一行 `❓` **改写成 `⚠️`**（M2） | ✅ **exit=1，且红在被测断言上**：`no key is marked unwired although a runtime source reads it — or although the criterion cannot decide it [vmu.turn.selfCheck]` ⇒ **逐名点出** |
⇒ ★★ **两条独立量法指向同一事实**：**档位格被清空 ⇒ 该守卫不红**（我这边看到的红**只是 STALE 的"表陈旧"**，不是档位断言的）。⇒ **我把这条升级为"两方确认的无效守卫"**；★ 其自陈的两个假设（哪个 docs／第 8 格取法）**仍待核**（我 A 轮会**用读数而非转述**去定位）。
★ **纪律（入册）**：**"红过" ≠ "红在被读断言上"**（R27/R33 同族）；而 **"不变红"是最强的反证** —— 它说明该守卫**根本不覆盖**那一类变异（与 §9.38.1 的"输入不会分叉"是**同一根**：**变异与断言之间没有可比对的差异**）。

### 9.38.4 ★ "无法重推的声明"（仍开）
我 R35 指出：**"保留值＝原文前缀"** 因**输入件不可得**（`D:\_tmp` 里 `r163-B-overlay.yml` 只含 10 字符的 `ABCDEFGHIJ`）**无法独立复算**。⇒ ★ 待 A 轮：**用留存材料或确定性生成规则重建原文**逐字符验证；★ **"规则"与"字面量"都必须能重推才算**；并核**新字段两态同形**（R32 教训）。

### 9.38.5 纪律族（**≥14 条**）—— **指回补差异，不重抄**
**指回**：M-1…M-6（§9.31.1／§9.30.9）｜四次空过形状＋机制（§9.32.7）｜「列在队列里 ≠ 尚未完成」「没 grep 到 ≠ 不存在」（§9.32.5）｜「量具而非被测物」＋观测通道自造假象族（§9.35.6(g)）｜「变异打错行＝量具错，不是断言没牙」（§9.34.4）｜「schema 写了 `domain` ≠ 运行时受保护」（§9.34.4）｜「执行点上线前先证它对每种已声明类型都有定义」（§9.36.5）｜「我看见的那份不是全量」＝**哪一份＋哪一版＋哪一时刻**（§9.37.3-(i)）｜「旧数字是旧方法的产物」【双向】（§9.37.3-(ii)）｜**署名约定**（§9.33.7）。
★ **本轮新增两条**：**(a)「任务前提必须先核」**（现场＝§9.38.2：第 4 次 premise 被推翻；`comms2` 先核三件再判，**结论从"要改生成器"变成"无需改"**）；**(b)「能红的反例需要一个两条路径会分叉的输入」**（现场＝§9.38.1：普通 H1 键下两实现同值 ⇒ 只有 refined-H2 输入才让 M1 可红）。

### 9.38.6 ★ 我自己的更正：R35-A4 的"环境漂移／不归因代码"**作废**
- 我 R35 读到 `wiring-index --check` **7.35／7.20 s**（其当时 6.65），并据"**被计时脚本本身**字节未变（`CB433A9EDAC803C0`）"推出"**不归因于代码**"。
- ★ **`comms2` 给出了机制（自报）**：本轮 `scripts/generate-vmu-settings-table.mjs` 的 `IMPORTERS` 补齐**四类导入形式**（命名空间／默认／再导出／动态）⇒ 每行多跑 3 个正则＋声明识别多一个内联数组分支 ⇒ **残余 +0.7 s**（`wiring-index` 6.65→7.29–7.43；其**中途 7.0/9.5 s 的真因**＝`dynamicUsers(name)` 每候选名 × 180 文件全文正则，已提到模块级 `DYNAMIC_FILES` 只算一次）。
- ★ **我有那块缺失的拼图**：`scripts/generate-vmu-settings-table.mjs` 的 blob **`8b680cb C0A865AE7982FC5E` → HEAD `3AF5671D40889CE1`**（我 R35 就量到了，却**只把被计时脚本本身**拿来判"未变"）⇒ **机制已知、可归因**。
- ⇒ **两方读数一致**（我 7.20–7.35／其 7.29–7.43），且**未抬预算**（`run-tests.mjs` blob `B988AF9351E9219C` 未变、仍含 `180000`／`180 s`）。
- ★ **更正后的纪律表述**：**"数字变了/没变都要给机制"**，且**机制要求在【依赖闭包】里找**，不是只看**被计时的那一个文件**（这正是我上轮"未归因"的失误——**量具范围选窄了**）。

### 9.38.7 具名未闭合（交 Lead／下一轮）
1. ★★ **M1 守卫查实（最高优先）**：**清空档位格 ⇒ 不红**（两方合流）⇒ 待定位**它到底读哪一份 docs／哪一格**（A 轮：**给读数不给转述**）。
2. **`export * from` 的名字不可知面**（其自陈只标记 `starReexport`，仍写"没核"）；**动态 `import()` 的解构形态**（`const { NAME } = await import(…)`）未覆盖。
3. **那 2 行（`vmu.turn.instituteName`／`vmu.turn.objective`）仍写"没核"**（其只定位到"内联数组是值"的结构，未定位遍历者 ⇒ 不猜）。
4. **"保留值＝原文前缀"** 待 A 重建原文（§9.38.4）。
5. **`docs/04 §11` 档位格断言**若确实不覆盖"缺档"，**要么补断言（含当天反例）、要么具名其覆盖范围**（不许留"自称覆盖、实际测不到"的守卫）。

### 9.38.8 ★★ R36 **A 轮（独立复核）**：守卫**有牙**（"不红"＝变异没落地）＋ 可重推**已成立**（B3 逐字符）

> **读的版本**：`HEAD 01cc427`（工作树 clean）；`tests/audit-vmu-docs.test.mjs 4DC2FC00B1BC194B`（752L）／`kernel/receiptbounds.js E4873BFBC9AAC0AB`（184L）／`host.js 461D7FD499F016EA`（1167L）／`run-tests.mjs B988AF9351E9219C`／`package.json 82C947A82A25E02E`（785L，`files[]` **700 distinct**）。
> 命令：`node D:\_tmp\v36\a1-guard.mjs`（三臂，**副本制**）／`node D:\_tmp\v36\a2-rederive2.mjs`，均 **exit=0**。

#### (1) ★ 守卫是否有牙：**三臂读数**（我自己的副本实验；其两假设**我用代码核过**）
| 臂 | 变异（副本内） | 读数 |
|---|---|---|
| **B 对照** | 只中和生成器的 STALE 退出（锚点＝`console.error('… --write')` ＋ `process.exit(1)`） | **exit=0（绿）** ⇒ ★ **中和本身不放宽断言** ✓ |
| **A** | ＋**清空【真表格行】(L312) 的第 8 格** | ★ **exit=1**：`FAIL every settings row states which of the THREE tiers …（blank or vague still reddens）[| \`vmu.turn.selfCheck\` | …]` ＋ `FAIL every settings row states whether the key is WIRED … [\`vmu.turn.selfCheck\`]` ⇒ **红在档位断言上、并逐名点出该键** ✓ |
| **C** | ＋改**散文行 (L257)**（R35 那次的实际错点） | **exit=0（绿）** ⇒ **复现 R35 的"不红"**；其自检判据（整文件文本变了没）＝**false** ⇒ **正确地**报"未落地" |
**其两假设的代码核对（我读原文，非转述）**：**(b)** `:540 const rows = …filter((l) => /^\| \`vmu\.[a-zA-Z0-9_.]+\`/.test(l))` ⇒ **只看行首** ⇒ 清空第 8 格**不影响**该行在 `rows` 里 ⇒ **(b) 排除** ✓；**(a)** `:38 const DOCS = process.env.VMU_DOCS_DIR ? … : join(REPO, 'vibe-math-vmu', 'docs')` ⇒ **有注入根接缝**，且 `REPO` 由 `import.meta.url` 推出 ⇒ **副本跑副本的 docs** ⇒ **(a) 排除** ✓。★ 判据本体：`:553 tierCellOf = (r) => r.split('|')[8]`／`:554 TIER_MARKER`／`:555 unmarkedRows`／`:556`＋`:562` 两条断言（★ 双断言同源＝其自陈的重复文案，功能无害）⇒ **结论文档化：R35 的"不红"是**变异打错行**（R27 同族），不是守卫没牙** ✓。

#### (2) ★★ 落地自检的**判据强度**（Lead 指定核的机制核心）
- **其修法正确** ✓：`const snapshot = lines.slice()` 后与 **snapshot** 比较（`out.join('\n') === snapshot.join('\n')` ⇒ 报"未落地"）—— ★ **原地改数组再自比是恒真**（＝"自检自己也是一个不变红的守卫"），与 snapshot 比较才有效。
- ★ **但该判据回答的是"文件变了吗"，不是"被判定的那个格/行变了吗"**：R35 那次之所以**恰好**能被它拦住，是因为其 M1 正则 `/❓ 未判定[^|]*/` 在**散文行里匹配不到** ⇒ **无文本变化** ⇒ 报"未落地"（**我的 C 臂实测 = false**）。⇒ **更强判据应为 target-addressed**：断言**目标键所在行的第 8 格**（或目标行文本）**前后不同**；我的两臂给出两条判据的对照：**A 臂：两者皆 true；C 臂：两者皆 false**。
- ★ **纪律（新增）**：**"落地自检"必须对【目标】说话，而不是对【整份文件】说话** —— 这是"变异打错行"族的第三次现场（R27 打错**行**、R35 打错**行**、本次把"整体变化"误当"目标变化"）。

#### (3) `pack2` 的"可重推"：**B3 逐字符成立**（我独立重建原文）
- **机制**（其 §1 的表，我认同一半并补边界）：`bytes/from/to` **可推**；保留段**长度**可推；`keptHash` **可推**（对回执里的实际值）；★ **前缀性【不能】由 `keptHash`＋`origHash` 推出**（哈希单向）⇒ **只能由【保留的规则】或原文推出** —— 他**保留了确定性规则** `'ABCDEFGHIJ' × 1400`（不是 14 KB 字面量）⇒ **这条是判据的机制** ✓。
- **我的独立读数**（`boundedToolResult` 返回 **JSON 字符串**，须 `JSON.parse` —— ★ 我第一次调用忘了，已自陈）：
  - `receiptMeta` 键＝**5**：`["truncated","elided","hostElision","originalBytes","note"]`；**空态键集合相同**、`elided: []`、`truncated:false` ⇒ **两态同形** ✓。
  - `elided[0]` 键＝**8**：`["path","from","to","bytes","keptBytes","keptHash","origHash","hash"]` ✓；**2 条记录时每条键集合相同** ✓。
  - 单叶 14,000：`{path:"blob",from:11970,to:14000,bytes:2030,keptBytes:11979,…}`；**★ `bytes === to − from` ✓／`to === 14000` ✓**；★★ **`original.slice(0,from) + '…[elided]' === kept`（逐字符）＝ true** ✓；`keptBytes === kept.length` ✓。
  - **`keptHash === sha(kept)`（回执里实际存在的值）＝ true**，且 **`keptHash === sha(裸前缀) ＝ false`** ✓ ⇒ ★ **其"第一版搞错字段语义"的自陈得到确认**（该字段描述**实际值＝前缀＋标记**，不是裸前缀）。
  - `origHash === sha(rebuilt original)` ✓；**顺序绑定**（字符换序后 `sha ≠ origHash`）✓。
  - ★ **我自己的一个臂有 bug（具名）**：我把 2×15,000 的臂仍与 14,000 的原文比较 ⇒ 该臂的 `to===14000`／`origHash` 两行**作废**（`bytes===to−from`、`from=2000`、共享键集合三行仍成立）。**不得**据此报"其字段有问题"。
- ★ **一般性边界（其 §6.1，我同意）**：**任意真实内容仍无规则可保留** ⇒ 那里前缀性**仍是声明**（哈希只买"篡改可发现"）；要普遍可推须**留原文副本**或**分段哈希链**（独立契约变更，**他未顺手做，是对的**）。★ 且 **R34 那条真机臂**（overlay 只有 10 字符）**本身仍不可复核** —— 本轮做的是**机制**，不是把 R34 补成可复核。

#### (4) 顺手项（Lead 指定）
`audit-code-size` **exit=0**（`host.js` **1167 ≤1200**）／`audit-kernel-index` **exit=0**（`6/0`）／新套件 `vmu-elision-prefix-recomputable` **exit=0**、`vmu-applies-name-unified` **exit=0**；`package.json` `files[]` **700 distinct**，两新文件**均已登记**；`run-tests.mjs` blob **未变**（`B988AF9351E9219C`，故 `GATE_SUITE_TIMEOUT_MS` 亦未变）；★ **`receiptbounds.js` 头注释 L1 在任何代码之前**（首行代码在 **L29 `import {createHash}`**）⇒ 其自陈的**加 import 挤掉头部**这一**顺序副作用**已修 ✓。

#### (5) 本轮新增纪律（带现场）
- **(a)「落地自检要对目标说话，不是对整份文件说话」**（现场＝本节 (2)：A 臂两判据皆 true／C 臂皆 false；且"原地改数组再自比＝恒真"本身就是"不变红的守卫"的又一实例）。
- **(b)「可重推：先把"要推出什么"写成清单，再选机制」**（现场＝本节 (3)：算术/长度/`keptHash` **可推**；**前缀性不可由哈希推**，只由规则或原文推 ⇒ 哈希与规则**各买各的**）。
- ★ 并**指回 §9.38.6**：**机制要在【依赖闭包】里找**（我上轮"未归因代码"的更正）。

---

## §9.39 ★ R38 · **v23 并入块**（R36–R37 闭合项 ＋ 本轮 A 轮独立复核 ＋ 纪律族 ≥16）

> **署名（照 §9.33.7）**：标 **"独立复核"**＝我（`vmu-verify2`）实跑；标 **"自报"**＝他人一次运行（命令见其报告）。
> **读的版本**：`HEAD a71370e`（工作树 clean）；`scripts/generate-vmu-settings-table.mjs E2C5C33F479B2CB0`（376L）／`tests/audit-vmu-docs.test.mjs 9DCB49F114306939`（750L）／`kernel/report.js DF8317A7C98F8ECE`（571L）／`kernel/receiptbounds.js E4873BFBC9AAC0AB`（184L）／`run-tests.mjs B988AF9351E9219C`。

### 9.39.1 R36／R37 并入（逐条；★ 附我的复核）

| 轮 | 闭合项 | 我的复核读数 |
|---|---|---|
| **R36** | ①「清空档位格却不红」的根因＝**变异锚点在散文行 L257**（真行在 **L312**）⇒ **审计正确地绿**；修好的 M1／M2 **都红在被测断言上** ②`pack2` 的"可重推"（**保留确定性规则**＋`keptHash`/`origHash`；**任意真实内容仍是声明**）③`receiptbounds.js` 的**头注释顺序副作用**已修 | ★ ①**我三臂复现**（仅中和 ⇒ 绿；清空**真行** ⇒ **exit=1 且两条档位 FAIL 逐名点出 `vmu.turn.selfCheck`**；改**散文行** ⇒ 绿）＋ 其两假设我**读码核过**（`:540 rows` 只看行首／`:38` 有注入根）②见 §9.38.8-(3) ③**`audit-kernel-index` exit=0**、头注释 **L1** 在首行代码 **L29** 之前 |
| **R37** | ①收掉**旧两值文案断言** ②**最小数据流转档**（`undetermined 3→5`／`notWired 115→113`）③**R34 读数做成可复算** ④`export *`／动态解构仍"没核" ⑤可选④未做 | ★ ①`no silent promises` **恰 2 处＝1 断言(L556)＋1 注释(L548)** ✓；`audit-vmu-docs` **102/0**（＝**103−1**，与"删掉 1 条断言"**算术自洽**）✓ ②见 9.39.2 ③见 9.39.3 ④其具名保留 ✓ ⑤其未做并**未给数字** ✓ |

### 9.39.2 ★★ 最小数据流转档：**站得住**（我四臂反例，副本制）

**判据两半**（其代码注释 `:301-306` 逐字）：**① 该键在某行被【读取并绑定】**（`const X = … sget('KEY')` 或 `X: … sget('KEY')`）；**② 同文件内对【该绑定名】做遍历或成员判定**（`X.map(`／`.X.map(`／`X.includes(`／…）。★ 其代码里**记下了 R33 的反例**（`:169-170`：松遍历曾命中**无关行** `kernel/ballotbox.js:175 args.options.map(String)`）⇒ **这正是它与 R33"松遍历"的区别**。
**我独立核到的源码位**：`kernel/report.js:115 params: listOf(sget('vmu.report.params')),`（绑定）／`:454 const entries = c.params.map((key) => {`（遍历）／`:509 if (!c.params.includes(k)) {`（成员判定）✓。
**四臂（我自己的副本实验，`--json` 读数）**：
```
P  对照（未改）                              ⇒ 1108 / 5 / 113   stale=false
N1 只删 `.map(`（`.includes(` 仍在）          ⇒ 1108 / 5 / 113   stale=false   ← ② 的**任一**形态成立即可（与其代码列出的形态一致）
N2 删掉**两处**合格用法 ＋ 加一个**无关 `.map(`** ⇒ 1108 / **3** / 115   stale=true    ← ★★ **无关 `.map(`【未被采信】**
B  打断**绑定**（`params: []`）而两处遍历都在   ⇒ 1107 / **3** / 116   stale=true    ← ★ **① 是承重的**
```
⇒ ★ **判据站得住**：**打断①或删净②（并补以无关 `.map(`）都会让那 2 键回落**；而**只留 `.includes(`** 时判定不变（符合其列出的形态）。★ **"恰好那 2 行"我独立复核**：`docs/04 §11` 行数 **1226**、档位 **1108 wired／5 undetermined／113 unwired／0 blank**，且 `vmu.turn.objective`／`vmu.turn.instituteName` 两行**确为 `❓ 未判定`**（第 3 个是既有的 `vmu.turn.selfCheck`）⇒ **5 ＝ 3 旧 ＋ 2 新** ✓；`--check` ＝ **`up to date`**（Lead 的 `--write` 已落）✓。

### 9.39.3 ★★ R34 读数"可复算"：**可复算**（我 9/9 PASS）＋ 其**没有**把"可复核"写成"已重跑"

- **★ overlay 一致性（"规则不是事后编的"关键一步）**：我**解析** `D:\_tmp\r163-B-overlay.yml`（16,104 B）取 `instituteName` 的值 ⇒ **长度 14,000**、**`=== 'ABCDEFGHIJ'.repeat(1400)`（逐字符）**、**sha256 ＝ `9AB9D27F942BD37F`（与规则同哈希）** ✓。★ **更正我 R36 的"只有 10 字符"**：那是**我的正则没处理 YAML 把该标量折行**（我的仪器问题），不是输入件缺失。
- **★ 用留存回执字节逐字符验前缀**：spill **182,374 B**、**sha256[0:16] ＝ `1A64C62814662CEF`**（与其记录一致）；`elided[0] = {path: settings.resolved.vmu.turn.instituteName.value, from:2000, to:14000, bytes:12000}`；**`kept === original.slice(0,2000) + '…[elided]'`（逐字符）** ✓（kept 长 **2009**）；**闭式** `from = 2000 = 200 × 10` ⇒ **`kept.slice(0,2000) === 'ABCDEFGHIJ'.repeat(200)`** ✓。
- **我的一遍共 9 项断言全部 PASS**（其夹具报 6/6 ⇒ 我这遍是**超集**）。
- **口径**：其报告 §0 ④ **逐字**写着"…**但我【没有重跑】真机**"⇒ ★ **没有把"可复核"写成"已重跑"** ✓；且其明确区分 **R34 回执是 4 键形态、8 键是 R36 才有（代码读数，非真机）** ✓（与 §9.38.8-(3) 一致）。

### 9.39.4 ★★ 两条本轮务必入册的纪律（均带现场）

**(a)「不变红的守卫」的终局＝【变异没落地】＋「两方同向读数共享同一缺陷 ⇒ 一致不构成事实」**
- 现场：**R35 时 `comms2` 与我各自独立得到"清空档位格不红"** —— **两方一致，却是假一致**：两边都打在**散文行 L257**（真行 L312）；R36 修好锚点后**两边都红**（我 R36 的 A 臂 ＋ 其修好的 M1/M2）。
- ⇒ ★ 纪律：**"两方一致"必须先问"这两份读数是否共享同一个（可能是错的）前提"** —— **同向读数不构成事实**；本条是"变异打错行"族的**终局**（R27 打错行／R35 两方同向打错行／R36 修好后有牙）。

**(b)「拒绝做买不到目标性质的事」＋「证明强度：分段哈希链 ＝ `keptHash`，只粒度更细」**（★ **结构性论证，非实测**）
- 现场：`pack2` 的 §6.1 与 `assistant2` R37 §4-③：**保留原文副本**（与预算目的**自相矛盾**）与**分段哈希链**（**买不到目标性质**）**都被拒绝**，且 **本卷不新增字段**。
- ★ **结构理由（须标明是论证）**：哈希**单向** ⇒ 对**未留存字节**的哈希主张，其可证明范围与现有 `keptHash` **同类**（都只证明"某段与某哈希一致"），**推不出"一个是另一个的前缀"**；**分段哈希链只是把同一强度切得更细**，**粒度变细不等于性质变强**。
- ⇒ ★ 纪律：**拒绝一项机制，要给"它为什么买不到目标性质"的结构性理由**（不是"麻烦/超范围"）；同时**把"能买到的"与"买不到的"分列**（`keptHash`＝篡改可发现；前缀性＝只有规则或原文）。

### 9.39.5 纪律族（**≥16 条**）—— **指回补差异，不重抄**
**指回**：M-1…M-6（§9.31.1／§9.30.9）｜四次空过形状＋机制（§9.32.7）｜列在队列 ≠ 未完成／没 grep 到 ≠ 不存在（§9.32.5）｜量具而非被测物＋观测通道自造假象族（§9.35.6(g)）｜变异打错行＝量具错（§9.34.4）｜`schema` 写了 `domain` ≠ 运行时受保护（§9.34.4）｜执行点须覆盖每种已声明类型（§9.36.5）｜哪一份＋哪一版＋哪一时刻（§9.37.3-(i)）｜旧数字是旧方法的产物【双向】（§9.37.3-(ii)）｜任务前提必须先核（§9.38.5-a）｜能红的反例需要会分叉的输入（§9.38.5-b）｜落地自检要对目标说话（§9.38.8-(2)）｜可重推先写清"要推出什么"（§9.38.8-(3)）｜机制要在依赖闭包里找（§9.38.6）｜**署名约定**（§9.33.7）。
★ **本轮新增两条**：**(a)** 两方同向读数共享同一缺陷 ⇒ **一致不构成事实**；**(b)** 拒绝机制须给"买不到目标性质"的**结构性理由**（并标明论证 vs 实测）。

### 9.39.6 落地自检：**仍非 target-addressed（就"强制"而言）** —— 具名保留
其 `D:\_tmp\v36\counter-r36.mjs`：**L42** 注释"blank the tier cell OF A REAL ROW, **and prove the cell changed**"，**L49/L51** 取 `before8`/`after8` 并在 **L52 打印**"第 8 格 X → Y ＋ 仍是行=YES"；★ **但唯一被【强制】的判据仍是 L39 的整文件快照比较**（`out.join('\n') === snapshot.join('\n')` ⇒ "DID NOT LAND"）。⇒ ★ **它现在"打印目标格"，但未"断言目标格"** ⇒ 我 R37 的具名**保持**（**建议**：把 `before8 === after8` 做成 throw/断言；我**未改他人测试**）。★ 附一条正向：**L47 的锚点已绑定"第 8 格含 `❓ 未判定` 的真行"** ⇒ R36 起**变异确实落在真行上** ✓。

### 9.39.7 具名未闭合（交 Lead）
① **自检仍非 target-addressed（强制层）**（§9.39.6）；② **任意真实内容的前缀性仍是"声明"**（须留原文或哈希链，独立契约变更）；③ **`elided[]` 8 键的真机确认**只有**代码读数**（R34 回执为 4 键）；④ `export * from`／动态解构两形态仍"没核"；⑤ 可选④（四类正则合并单次扫描）未做（其未给数字）；⑥ 其性能读数 `settings-table 5.06s`／`wiring-index 6.83s` 属**自报**（我未复量）。

---

## §9.40 ★ R39 · **v24 并入块**（R38 闭合项 ＋ 两条必写纪律：**"打印 ≠ 断言"** 与 **"设计估计 ≠ 实测实现"**）

> **署名（照 §9.33.7）**：标 **"自报"**＝他人一次运行（命令见其报告）；标 **"独立复核"**＝我实跑（**本轮 A 轮待 Lead 说"可以了"**；本节凡"待 A 验"均已标明）。
> **读的版本**：`HEAD a3bde6a`（工作树 clean）。★ 本节以 **R38 报告**为材料（**不依赖在飞写者**，按 Lead 指定的顺序：**先 B**）。

### 9.40.1 R38 并入（逐条；★ 标明"自报／待 A 验"）

**（一）`vmu-comms2`／`task-177`：两形态落地 ＋ 自检升级 ＋ 性能护栏**
| 项 | 其读数（自报） | 状态 |
|---|---|---|
| **`export *`／动态解构落地** | ★ **归约成同一条规则**：本判据**按名字**（`IMPORTERS: name → 会用到它的文件`），**从不问名字从哪里导出** ⇒ **不需要星链闭包、不需要深度上限**（比 R37 的设计**更省**）。两通道＝`import * as NS` 后 `NS.NAME`（收集命名空间绑定）／`const { NAME } = await import('…')`（解析解构，`A: B` 取 `B`） | ✅ 已落（**待 A 核计算属性访问的收口**） |
| **判据不变** | **命名空间/解构只是"拿到了名字"** ⇒ **仍必须在【那里】遍历/成员判定**才算证据 ⇒ **"看不见"仍不写成"没人读"** | ✅ 与我 R38 的复核一致 |
| **范围＋残差口径** | 核了**本树全部含命名空间/动态导入绑定**的文件；★ **新增命中 0 处**；★ **计算属性访问（`NS[key]`／`NS[dynamicName]`）静态不可解析 ⇒ 〔没核〕**，**不写成"没人读"** | ★ **A 轮：核该局限是否落进报告/docs**（其报告 §1 已写"没核"） |
| **计数** | `--json {wired:1108, undetermined:5, notWired:113, stale:false}` ⇒ **无新证据**（**机制**：本树没有"以命名空间/解构拿到名字、且那个列表没被别处覆盖"的键）⇒ **不需要 `--write`** | ★ **A 轮复量**（`--check`／三档／`audit-vmu-docs`） |
| **★ 自检升级为 target-addressed** | 新脚本（`D:\_tmp\v38\counter.mjs`）：**先定位目标键的表格行**（`/^\| \`vmu\./` ＋ 含该键）⇒ **定位不到直接抛 `★ TARGET NOT A ROW`**；**然后断言【该行第 8 格】before ≠ after**。实测（自报）：`TARGET-ADDRESSED: L312 key=vmu.turn.selfCheck stillRow=YES ✓ / cell8 "❓ 未判定（…" → "" ★ CELL CHANGED ✓`，两次变异 `exit=1` 且红在被测断言上 | ★ **A 轮主判据**：**(a)** 散文行锚点 ⇒ 必须被"**目标行定位失败**"拦住；**(b)** 真行但**只改同行其它格**（目标格未变）⇒ 必须被"**目标格 before ≠ after**"拦住；★ **若只是打印不抛 ⇒ 记"仍非强制"** |
| **★ 性能护栏** | 其**第一版忘了行护栏** ⇒ **3 个正则跑在【每一行】** ⇒ `wiring-index --check` **6.83 → 10.17s**；加 `l.indexOf('import') < 0 ⇒ continue` 后回落 **7.41s**（`settings-table` **5.06 → 5.43s**） | ★ **A 轮自量**（基线 **5.43／7.41**） |

**（二）`vmu-assistant2`：`docs/21 §20.9` 把"8 键"具名到【版本与读数类型】**
- 原措辞只写"`elided[]` 每条 **8 键**"，**没写是哪一版、也没写是代码读数** ⇒ 读者会默认成"真机读到的" ⇒ **已补具名**：**8 键＝`kernel/receiptbounds.js:139-148`（【代码读数】）**；**R34 真机回执是【4 键】**（原样 `{path,from,to,bytes}`，来源＝留存 spill 182,374 B）⇒ ★ **"8 键在真机上成立"的真机确认【尚未做】**（按 Lead 裁定**不专门为它开一次会话**）。
- 其六门读数（**自报**，2026-10-16 00:57:39）：`check-docs PASS`／`audit-doc-index 5/0`／**`audit-vmu-docs 102/0`**／`audit-doc-vs-code-tables 17/0`／`audit-claim-traceability 5/0`／`vmu-planned-settings ALL GREEN`。
- `docs/21` 哈希：**`DEC878920BBF3BAF`（62392 B）→ `BD74157D9315A17A`（63076 B）**（BEFORE 取 `git cat-file blob` 二进制）。

### 9.40.2 ★★ 两条必写纪律（均带现场）

**(a) 「打印 ≠ 断言」—— "落地自检"这条纪律的**第三层****
| 层 | 现场 | 缺陷 |
|---|---|---|
| **第一层**（R27） | 变异**打在错误的行** | 断言"看起来没牙"，其实是**量具错**（§9.34.4） |
| **第二层**（R36） | 自检只答"**文件变了吗**"（整文件快照比较） | R35 的锚点打在**散文行** ⇒ **文件确实变了** ⇒ 旧自检**会误报"落地成功"**；R36 那次"恰好"报"没落地"是**运气**（命中行不含可替换的档位文本） |
| **★ 第三层（本轮）** | 自检**打印**目标格 `before → after`，**但唯一被强制的仍是整文件快照** | **打印 ≠ 强制** ⇒ **R35/R36 的假绿正是这样漏过去的**（我 R37 已具名：`counter-r36.mjs` 的 L49/L51/L52 打印、L39 才是唯一强制） |
⇒ ★ **判据**：**自检必须【抛/断言】它声称在查的东西**；`console.log` 一行"★ CELL CHANGED ✓" **不构成强制**。★ R38 已按此**升级**（定位目标行 ⇒ 定位不到**直接抛** ＋ 断言第 8 格 before≠after）—— ★ **是否真的强制由我 A 轮两类变异验证**（**不是**采信其"已升级"）。

**(b) 「设计估计 ≠ 实测实现」**
- 现场：R37 给 `export *` 的**设计估计**是"一遍全仓扫描 ＋ **至多两层闭包**，估 **~0.2–0.4s**"；R38 **落地时发现**星链闭包**多余**（判据按名字），**但第一版把 3 个正则跑在【每一行】** ⇒ 实测 `wiring-index --check` **6.83 → 10.17s（+3.34s，≈+49%）**；加**行护栏**（`indexOf('import') < 0 ⇒ continue`）后 **7.41s**。
- ⇒ ★ **纪律**：**"我估的代价"不是读数**；**机制设计可以估**，**代价必须在真负载上落地后量**（且**护栏本身要写进实现**，不能只写进设计）。★ 同族：§9.38.6（机制要在**依赖闭包**里找）／§9.39.4-(b)（拒绝机制要给结构性理由）。

### 9.40.3 纪律族（**≥17 条**）—— **指回补差异，不重抄**
**指回**：M-1…M-6（§9.31.1／§9.30.9）｜四次空过形状＋机制（§9.32.7）｜列在队列 ≠ 未完成／没 grep 到 ≠ 不存在（§9.32.5）｜量具而非被测物＋观测通道自造假象族（§9.35.6(g)）｜变异打错行＝量具错（§9.34.4）｜`domain` ≠ 运行时受保护（§9.34.4）｜执行点须覆盖每种已声明类型（§9.36.5）｜哪一份＋哪一版＋哪一时刻（§9.37.3-(i)）｜旧数字是旧方法的产物【双向】（§9.37.3-(ii)）｜任务前提必须先核（§9.38.5-a）｜能红的反例需要会分叉的输入（§9.38.5-b）｜落地自检要对目标说话（§9.38.8-(2)，**其第三层见 §9.40.2-(a)**）｜可重推先写清"要推出什么"（§9.38.8-(3)）｜机制要在依赖闭包里找（§9.38.6）｜两方同向读数共享同一缺陷 ⇒ 一致不构成事实（§9.39.4-a）｜拒绝机制须给结构性理由并标明论证 vs 实测（§9.39.4-b）｜**署名约定**（§9.33.7）。
★ **本轮新增两条**：**(a) 打印 ≠ 断言**（自检必须**抛/断言**它声称在查的东西）；**(b) 设计估计 ≠ 实测实现**（代价必须落地后量；护栏要写进实现）。

### 9.40.4 具名未闭合（交 Lead／A 轮）
1. ★★ **自检是否真被强制**：R38 自报已 target-addressed；**我 A 轮两类变异验证**（散文锚点／目标格未变）—— **未验之前不写"已强制"**。
2. **计算属性访问**（`NS[key]`／`NS[dynamicName]`）**静态不可解析 ⇒ 〔没核〕**；★ 核该局限是否落进**报告与（若适用）docs**。
3. **计数与门禁**（`--check up to date`／三档／`audit-vmu-docs`／`run-tests.mjs`＋`GATE_SUITE_TIMEOUT_MS` blob 未变）—— **A 轮复量**。
4. **性能**：其自报 **5.43／7.41s**（缺护栏时 **5.96／10.17s**）—— **A 轮我自量**并与基线比。
5. **"8 键在真机上成立"仍只有【代码读数】**（R34 回执 4 键）；★ 真机确认**尚未做**（按裁定不专门开销会话）—— **保持具名**。
6. **可选②（四类正则合并单次扫描）未做**（其未给数字）；其**审计复跑**本轮**未做**（assistant2 那次 102/0 属**另一方读数**）。

### 9.40.5 ★★ R39 **A 轮（我独立复核）**：自检**已被强制**（两类变异 ＋ 绕过对照）／计算属性访问 **0 处**／性能与预算

> **读的版本**：`HEAD a3bde6a`（工作树 clean）；`scripts/generate-vmu-settings-table.mjs` **`3DA8DA781269E8B5`（402L）**。命令：`node D:\_tmp\v39\counter.mjs`（其反例器，副本制）／`node D:\_tmp\v39\my-arms.mjs`（**我自己的两类变异＋绕过臂**），均 **exit=0**；跑完 `git status` **空** ✓。

**(1) 「打印 ≠ 断言」第三层 —— 本轮【闭合】**
| 量法 | 读数 |
|---|---|
| **我跑其反例器**（`D:\_tmp\v39\counter.mjs`） | **N1** ⇒ `blocked by check (b): ★ TARGET CELL UNCHANGED: L312 cell8 "❓ 未判定（…"` ✓；**N2** ⇒ `blocked by check (a): ★ TARGET NOT A ROW: no TABLE ROW for vmu.turn.selfCheck` ✓；**M1/M2** ⇒ `audit exit=1 (red ✓)` 且 **红在被测断言上 YES ✓**；★ **`REAL TREE UNTOUCHED: OK (read-only ✓)`**（我另核 `git status` 空） |
| **我造的 (a) 类**：删掉目标键的**表格行**（保留 1 处散文提及） | 定位器 **找不到行** ⇒ **CHECK (a) FIRES**（"TARGET NOT A ROW"）✓ |
| **我造的 (b) 类**：命中**真行**但**只追加同行文本**（目标格未变） | `cell8` **前后相等**、**整文件确已变化**（整文件检查会放过）⇒ **CHECK (b) FIRES**（"TARGET CELL UNCHANGED"）✓ |
| ★★ **绕过对照（我加的一臂）**：同一 (b) 类变异、**关掉两检查**并中和 STALE、**真的跑审计** | **`audit exit=0`、`FAIL=0`、`hasSTALE=false` ⇒ GREEN** ⇒ ★★ **"文件变了但目标格没变"在没有 (b) 的情况下确实【静默通过】＝ 假绿形态被复现** ⇒ **（b）的必要性由【测量】证明，不是论证** |
⇒ ★ **结论**：其自检**确实被强制**（两处都是 `throw`，我读源码 `:42`／`:49` 并**各自用我自己的变异触发**）；★ 纪律**升级**：**判"有牙"必须附【绕过对照】**（关掉检查后必须**静默通过**，否则说明那道检查本来就没拦住什么）—— 否则"有牙"仍是自报。★ **未做（具名）**：**(a) 类的绕过对照**（我只对 (b) 类做了）。

**(2) 计算属性访问：**本树 0 处**（我独立扫描）**
```
files scanned (vibe-math-vmu/**, depth<=3) = 175
BROAD  /\[[A-Za-z_$][\w$]*\]/            = 792      ← 我【复现】其"误导基数"
namespace / dynamic-import bindings      = 1 file: vibe-math-vmu.js -> ["packModule"]
★ NARROW  <nsBinding>[ … ]               = 0        ⇒ 本树 0 处
```
⇒ ★ **窄判据成立**（`<nsBinding>[` 其中 nsBinding 来自 `import * as NS` 或 `const X = (await) import(…)`）＝ **0 处** ✓；★ **两数不可比**（792＝普通索引如 `settings[key]`；0＝本残余判据）⇒ ★ **它没有把 792 当残余数** ✓（其报告 §2 明写"792 是错的基数"）；★ **残余声明**（`NS[dyn]`／`const K='x'; NS[K]` ⇒ 一旦出现**静态不可解析 ⇒ 写"没核"、不写"没人读"**）**在其报告 §2 有**（我读的是原文）✓。★ 我**未复现**其 R38 引的 **559**（那是**更窄的文件集**，与 792 不同范围）——**未核，不比较**。

**(3) 计数／门禁／性能（我实跑）**
- `generate-vmu-settings-table --check` ⇒ **`up to date (1226 keys (1108 wired, 5 undetermined, 113 declared-but-not-wired))`，exit=0** ✓；`audit-vmu-docs` ⇒ **102 passed / 0 failed，exit=0** ✓。
- **预算未动** ✓：`run-tests.mjs` blob **`B988AF9351E9219C` 未变**，且 `180000`／`180 s`／`GATE_SUITE_TIMEOUT_MS` **均在**（"修负载、不修预算"）。
- ★ **性能（我自量，2 次）**：`settings-table --check` **4.89s／5.09s**（其报 **5.73s**）；`wiring-index --check` **7.71s／7.27s**（其报 **7.54s**）⇒ ★ **两读数并列**（同机**非同时**、期间他人在跑）；★ **共同结论成立**：**wiring-index 仍高于 ≈6.65s 目标**（我高 **+0.6～1.1s**）⇒ 其"**③ 是唯一剩余杠杆**"**由独立测量支持**；★ **不声称其数字错**。

**(4) 我自己的仪器失误（具名，照旧）**
(a) 臂里我打印的 `file text changed?` 标志**比较写错**（拿 `after` 与**已 splice 的** `lines` 比 ⇒ 恒等）⇒ **该标志无意义**，**不代表文件没变**；我**未据此下任何结论**（已具名）。

**(5) 具名未闭合（交 Lead）**
① **(a) 类的绕过对照**我**未做**；② `NS[dyn]` **当前 0 处**、**将来一旦出现即"没核"**（其具名）✓；③ **③（四类正则合并单次扫描）未做** ⇒ `wiring-index` **仍高于 ≈6.65s 目标**；④ **"8 键在真机上成立"仍只有【代码读数】**（R34 回执 4 键）；⑤ 其**审计复跑**在其轮内未做（我用**我的** `audit-vmu-docs 102/0` 补上）。

### 9.40.6 ★ R40 · **(a) 类的绕过对照（补 R39 未做的那一半）**：**关掉 (a) ⇒ 仍红 ⇒ 该形态下 (a) 不承重**

> **版本**：`HEAD a3bde6a`（tree clean）；`generate-vmu-settings-table.mjs` **`3DA8DA781269E8B5`（402L，与 R39 相同）**；`tests/audit-vmu-docs.test.mjs` **`9DCB49F114306939`**；`run-tests.mjs` **`B988AF9351E9219C`**。
> **方法（与 (b) 同一套）**：副本制；**中和副本里的 STALE 子检查**（红只能来自审计断言）；真跑审计。脚本 `D:\_tmp\v40\a-bypass.mjs` ⇒ **exit=0**。★ **每个臂都先写明"比的是哪两份东西"**（预防我 R39 那处失误）。

| 臂 | docs 状态（我明确写出的比较对象） | 读数 |
|---|---|---|
| **ARM 1 ＝ (a) 的绕过对照** | 目标键的**表格行被删**、(a) **被绕过**（不抛，直接跑审计）；★ 比较＝**整文件文本 before(删前) vs after(删后)** | ★ **exit=1，`FAIL 04 §11 has exactly one row per declared key [1225/1226]`** ⇒ **不静默** ⇒ ★ **该形态下 (a) 不承重**（审计**自己有**计数守卫） |
| **ARM 2 ＝ R35 的真实形态** | 行仍在 **L312**，变异落在**散文行 L257**；★ 比较＝**该行(line)的 8 格 before vs after**（`equal=true`） | ★ **exit=0、FAIL=0 ⇒ 静默通过** ⇒ **散文型变异对审计不可见**（文件变了、目标格没变） |
| **ARM 3 ＝ 对照** | 行在，**第 8 格清空**；★ 比较＝**该行的第 8 格 before vs after**（`changed=true`） | **exit=1**，`FAIL every settings row states which of the THREE tiers … [\| \`vmu.turn.selfCheck\` | …]` ✓ |

**结论（按 Lead 允许的三种措辞之一如实落）**：
- ★ **「判有牙必须附绕过对照」现在【只有 (b) 有】**：**(b)** 关掉 ⇒ **假绿复现**（R39 实测）⇒ 必要性**由测量证明**；**(a)** 关掉 ⇒ **仍红**（红来自 **`:543`** 的计数断言）⇒ ★ **"(a) 的必要性未由绕过对照证明；它是 (b) 的前置（无行即无格），并提供更早、更精确的定位消息（点名键）"** —— **这与「(b) 且只有 (b) 成立」不矛盾** ✓。
- ★ **附带发现（具名）**：**"行缺失"这一形态由审计自己守** —— `tests/audit-vmu-docs.test.mjs:543 ok(rows.length - SETTING_DEFS.length === 0, '04 §11 has exactly one row per declared key')`，我实测 **`[1225/1226]`** ⇒ 所以 (a) 的独特价值＝**前置 ＋ 消息精度**，**不是"唯一守卫"**；而 **(b)** 守的是 **ARM 2 那种"静默通过"的形态**。
- ★ **不许为了给 (a) 找必要性而造变异**：本条**没有**造只服务 (a) 的变异（ARM 1 用的是其负对照 N2 的同一形态；ARM 2 是 R35 的**历史真实形态**）。

**★ 我的两处仪器注意（具名）**
1. 我脚本里的行计数用**较松的过滤**（`/^\| \`vmu\./`）⇒ 得 **1351**，与**审计的 `rows`**（`[1225/1226]`）**不是同一个集合** ⇒ ★ **决定性读数一律用审计自己的数字**（我把两个都印出来就是为了避免误读）。
2. 本轮**比较前先写明比的是哪两份**（ARM 2 明示是"该行 before vs after"，ARM 1 明示是"整文件 before vs after"）—— 即 R39 那处失误（拿 `after` 与**已 splice 的** `lines` 比 ⇒ 恒等）的预防措施；★ **本轮未再犯**。

**(3) 性能（Lead 的 ③）**：★ `generate-vmu-settings-table.mjs`／`tests/audit-vmu-docs.test.mjs`／`run-tests.mjs` **三个 blob 与 R39 完全相同** ⇒ **性能合并（③）本轮未做** ⇒ **没有"秒数回落"可核**（**不把"没变"写成"回落"**）。我复量：`settings-table --check` **4.84s／4.94s**（R39 我量 4.89／5.09）、`wiring-index --check` **7.46s／7.40s**（R39 我量 7.71／7.27）⇒ **同一档**、★ **仍高于 ≈6.65s 目标** ✓（与我 R39 的结论一致）。
