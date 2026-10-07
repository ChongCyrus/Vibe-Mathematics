# 09 · v5r 实现手册（内部结构与做法）

> **本章地位**：**唯一实现权威**——描述 **v5r 现在的代码是怎么工作的**，以及**要达到设计基线还需要改什么**。
> **与 03 章（接口）的分工**：**`docs/03-interface-contract.md` 管对外契约**（命令名、参数、回执、错误码、状态字段的对外承诺）；**本章（09）管内部结构与做法**（模块边界、数据结构、并发、时间、提示词生成、守卫与迁移）。**定稿 C6 明确把「时间字段两类」的定义交给第 09 章** ⇒ 本章第 7.0 节 即该定义的权威出处；同系列另有 `00-README`／`01-philosophy`／`02-rulings`／`04-flows-and-protocols`／`05-voting`／`06-expansion-mechanisms`／`07-oversight-and-time`／`08-landing-plan`／`10-guards-and-acceptance`／`11-appendix-drafts`／`12-traceability`。两章冲突时：**对外承诺以 03 为准，内部实现以本章为准**；若某条既对外又与内部相关，**两章必须给出同一结论**（不一致即为缺陷，须改文档或改代码，不得默默放过）。
> **行号基准**：本章所有行号来自 `vibe-math-v5r/vibe-math-v5r.js`（**8,943 行**，sha256-16 `22409c0dc54543c7`）与其同目录 `math-computation.js`（`def90af767a64fcc`）、`math-engines.js`（`a4891a0359a4ee2f`）、`agent.cordis.yml`（`78ed1e8e94156a67`）、`preset.yml`（`a7d7249de997a1db`）。**行号漂移即失准**：改动后必须同步更新本章。
> **权威设计基线**：`docs/../MEETING-PLATFORM-RULINGS.md`（设计定稿，下称「**定稿**」）＋`MEETING-PLATFORM-PHILOSOPHY.md`（章程）。**`LEGACY-v5-实现方案（仅供参考）.md` 只是 v5 的旧实现方案，仅供参考、不是 v5r 的规格**；与之冲突时**以 v5r 设计基线为准**。
> **本章的写法**：每节都区分「**现状**」（有行号、可核对）与「**待改造**」（相对设计基线的差距）；**不确定的写「待确认」**，不把计划写成现状。

---

## 1. 本章地位与阅读法

- **一句话**：v5r 现状＝**v5 的实现**（逐字节同源，仅预设身份不同）＋**尚未落地**的会议平台改造（定稿 D1–D10／红线 R1–R10）。
- **读法**：要动代码 → 第 2 节 边界、第 3 节 状态、第 4 节 目录与 ID、第 5 节 参数、第 6 节 错误码；要改并发/时间 → 第 7 节、第 8 节；要改文案 → 第 9 节；要加守卫 → 第 10 节；要迁移 → 第 11 节；**要排期 → 第 12 节**。
- **术语**：`inst()`＝当前研究所的投影状态；`commit(EV.x, data)`＝把一次变更作为事件折进耐久状态；`roster`＝成员册；`voters`＝**有表决权者**（院士＋常驻研究员）；`m`＝法定票数。
- **本章不做**：不改代码、不跑门禁、不产生发布物；**它是给人读的实现说明**。

---

## 2. 模块边界与依赖

### 1.1 文件职责（现状）

| 文件 | 职责 | 关键导出/行号 |
|---|---|---|
| `vibe-math-v5r.js`（8,943 行） | 预设的全部运行时：状态投影、会议、任务板、Lean 形式化、论文定稿、参数、工具注册 | 42 处 `registerTool(`（自 `:8367` 起）；`preset.local plugin` 行在 `agent.cordis.yml:459-460` |
| `math-computation.js` | **共享数学计算模块**：`math_computation` 工具面、引擎发现与回执、`MATH_*` 冻结错误码 | `MATH_TOOL_NAME`（`:13`）、冻结码表（`:44`–`:54`） |
| `math-engines.js` | 引擎描述符（候选命令、安装路径、许可与包语义） | 由 `math-computation.js` 相对导入 |
| `agent.cordis.yml` | **预设组合声明**：persona（`:53` `@deepseek-ai/dsh-persona`）、agent-instructions（`:162`）、工具行、以及**本预设插件行**（`:459` `id: vibe-math-v5r`、`:460` `name: './vibe-math-v5r.js'`） | 冻结组合的唯一来源 |
| `preset.yml` | 预设显示名 `Vibe Math V5r` 与一句话描述 | 人类可见的预设目录信息 |

### 1.2 依赖方向（硬约束）

```
agent.cordis.yml ──(插件行 ./vibe-math-v5r.js)──▶ vibe-math-v5r.js
                                                   │
                                                   ├─(相对导入)─▶ math-computation.js ──▶ math-engines.js
                                                   └─(宿主服务)─▶ subagents / fs / tools / commands / timer
```

- **禁止反向依赖**：共享件（`math-computation.js`／`math-engines.js`）**不得**知道任何预设（现状：它们只通过**注入的 host 形状**反向调用宿主，行号见 `math-computation.js:372` `designator`、`:1121` 回执 `preset: H.designator`）。
- **禁止跨预设导入**：`vibe-math-v5r.js` **不得**导入 `vibe-math-v5/*`（现状：无此导入）。
- **共享件与 v5 的关系**：v5r 的两份共享件与 v2/v3/v4/v5 **逐字节相同**（守卫：`tests/audit-math-computation-parity.mjs`，现为「**five copies** are byte-identical」）。⇒ **要改其中一份就必须五份同步**，否则 parity 立刻红；**禁止**只改 v5r 一份。

### 1.3 待改造（相对定稿）

- 会议平台的新能力（投票板、发言机制、引用、临时授权）应落在 `vibe-math-v5r.js` 内部，**不要**扩张共享件（共享件是跨预设冻结面）；若确需共享，**必须**走「五份同步 + parity」流程。
- 新增顶层文件（如拆分模块）会改变 `installer.js` 的 `files[]` 与 `package.json#files`（登记面），**不属于**本章范围，须单独立项。

---

## 3. 数据结构与状态 schema

### 2.1 耐久状态文件（现状）

- **路径**：`<研究所根>/State/<研究所名>.v5state.json`（`vibe-math-v5r.js:1225`；等价拼装在 `:1305`）。研究所根＝`VibeMath/Projects/<project>/Institutes/<institute>`（`:1154`）。
- **顶层**：`{ v: PROJECTION_VERSION, institutes: { "<project>::<institute>": <institute 投影> } }`（`initState()` `:496`；`PROJECTION_VERSION = 1` `:206`）。
- **单研究所投影字段**（写入路径全在 `applyV5Event()` 的 fold 里，`:561-596`）：

| 字段 | 语义 | fold 行号 |
|---|---|---|
| `project` / `institute` | 归属标识（用作状态键的一部分） | `:565-566` |
| `phase` | 运行阶段（`idle`/…/`solved`） | `:567` |
| `problem` | `{id, statement, …}` 研究问题 | `:568` |
| `params` | 参数快照（**整表替换**：`Object.assign({}, patch.params)`） | `:569` |
| `runId` | 本次运行标识（前缀＝`designator`；见 第 4.3 节） | `:570` |
| `lastProgressAt` / `artifactCount` | 观测面用的进度时间戳与产物数 | `:571-572` |
| `members[]` | 成员（含 `id/kind/phase/counters`） | `:455`、`:598+` |
| `tasks[]` | 任务板（含 `revision/status/ownerId/dependsOn`） | `:456`、`:620+` |
| `verdicts{}` | 求真判定记录（键＝目标） | `:461`、`:716-722` |
| `queue[]` | 求真队列（耐久、原子追加） | `:466`、`:4828` |
| `meetingOpen` | **durable 会议标记**（未结束会议；`null` 表示无） | `:480`、`:574` |
| `officeRequestsDropped` | 计数：被丢弃的所办请求 | `:575` |
| `paper` | 论文定稿状态（**函数即 fold 内变更**，防丢更新） | `:580-585` |
| `feedback[]` | 方法与协作反馈（同样支持函数式 fold） | `:589-593` |
| `counters{}` | ID 计数器（由 `makeIdAllocator` 折进状态，见 第 4.3 节） | `:536`、`:1400` |

### 2.2 内存结构（现状）

- 状态**不是**全局可变对象，而是「**事件 fold → 投影**」：`commit(EV.x, data)`（`commit` 调用点极多，例：`putVerdict` `:1397`、`appendToQueue` `:4828`、`putTask` `:4640`）把 patch 折进耐久状态并刷新缓存（`stateCache` `:1351`）。
- `makeIdAllocator(inst)`（`:535`）是**唯一**的 ID 分配器；它同时产出「下一个 ID」与「新的 counters」，**两者在同一次提交里落地**（`:1387` 注释），因此不会出现「ID 已给但状态没记」。
- 观测面（`status/report/overview`）读的是**投影快照**，不是内存副本；同一时刻的所有法定数字都带 `rosterVersion`（`:1422-1424`）以便发现陈旧读者。

### 2.3 不变量（现状，必须恒等/互斥）

1. **`v` 必须等于 `PROJECTION_VERSION`**：读到不同版本即判为**加载失败**（`schema version mismatch`，`:837`），`loadOk=false` ⇒ **拒绝提交**，避免用空状态覆盖真实文件（`:820`、`:1358`）。
2. **未加载不得读**：`V5_STATE_NOT_LOADED`（`:897`）——任何读路径先过 `ensureLoaded()`（`:1278`）。
3. **会议标记互斥**：`meetingOpen === null` ⇔ 没有进行中的会议；`finalizeMeeting` 关闭时清除（`:5553`）。
4. **票权集合唯一**：`voters()`（`:1410`）＝`phase==='active'` 且 `kind ∈ {academician, researcher}`；**临时工永不在内**（`V5_NOT_VOTER` `:5176`）。
5. **`Verified/` 只由判定结果写入**：`judgeVerdict` 仅在 `outcome==='true'|'false'` 时允许写（`:4819-4820`）；`undecided` **绝不**写 `Verified/`。
6. **ID 唯一且单调**：`counters` 只增不减，分配与提交同一步（`:545-548`、`:1387`）。
7. **任务 `revision` 单调**：每次变更 `revision+1`（`:4557`、`:4626`、`:4640`）；CAS 失败者不得写状态（`:4469-4473`）。

### 2.4 持久化时机与原子性（现状）

- **时机**：每次 `commit()` 一次写；此外 `writeStateReadme()`（`:7735`）与周期摘要（`:4270` `meetingKeepEvery`）会写旁路文件。
- **原子性**：宿主提供 `fs.writeText`（`:1211` 注释）＋ `writeFileAtomic`（`:1988` 注释）＝**临时文件 + 原子改名**，并在需要时 `mkdir(dirname,{recursive:true})`。插件不自己做「读-改-写」循环：**同一 tick 的并发变更靠 fold 串行化**（`:4823-4836` 的原子追加即范例）。
- **写失败**：`V5_WRITE_FAILED`（`:4103`）；索引类写失败另有具名警告（v4/v5 已有的「具名一次」纪律）。

### 2.5 待改造（相对定稿）

- 定稿 **D3** 要求「到场＝**在可表决集合内且能应答**」，而现状只有 `active` 一个口径（第 7.2 节）；**新增**"可应答"状态字段（以及与 `unreached` 的关系）属于状态 schema 变更 ⇒ 走 第 11 节 迁移。
- 定稿 **D5** 的「少数意见强制入档＋复议触发」需要**新增耐久字段**（现状只有 memory/回执与纪要行：`bTrue/bFalse/abstain/mean` `:4802`）。**〔已改造·S9〕** 已落地：收束记录**盖章** `minority[]`／`minorityCount`／`sealed`／`threshold{m,floor}`／`effectiveAt`（**唯一盖章点**＝收束写记录处，四条收束路径全覆盖）；**新增耐久字段**带默认值，旧 `v5state.json` 缺键不崩（本章第 11 节口径照旧）。
- 定稿第 7.1 节的投票板（选项、单选/多选、上下限、最少收集票、记名/弃名、改票）需要**新增投票板对象**（现状无）；新增字段必须**可选且缺省有默认**才能读旧文件（本章第 11 节）。

---

## 4. 目录、产物与命名

### 3.1 工作区目录树（现状）

```
<VibeMath>/Projects/<project>/Institutes/<institute>/        ← instRoot()（:1154 的相对形式）
├── Shared/Chat            群聊过程记录（:1992 目录清单）
├── Shared/Meetings/<会议id>.md   会议纪要（:5304、:5330、:5475、:5571）
├── Shared/Debates         辩论过程（:1992）
├── Shared/Feedback        方法与协作反馈（FEEDBACK_DIR :91）
├── State/<institute>.v5state.json   权威状态（:1225）
├── Problems               命题库（:1992）
├── Formal/                形式化工作区（:1992）
├── Formal/Jobs/<jobId>.json   Lean 异步任务（:3048）
├── Verified/Lean/<target>.lean   已验证证明（:3003、:3245）
└── Computation/           数学计算归档（共享模块负责命名）
<VibeMath>/Formal/Lib | Formal/Proved     ← 全所级（globalDirs :1996）
```

### 3.2 产物命名（现状）

- 会议纪要：`Shared/Meetings/<会议id>.md`（id 形如 `mt-<n>`；`meetingKeepEvery` 控制周期落盘 `:977`、`:4270`）。
- 论文：`Paper/<id>/…`（`paperDirRel` `:5681`），伴随 `paper.meta.json`／`paper.log.md`（旧方案 §14 的产物名以代码为准）。
- Lean：任务 `Formal/Jobs/<jobId>.json`；证明 `Verified/Lean/<target>.lean`；库在 `Formal/Lib`／`Formal/Proved`（全所级）。
- 计算：`Computation/` 下的运行目录由共享模块按 `runId` 命名（`math-computation.js:834`）。

### 3.3 ID 生成规则（现状）

- 分配器：`makeIdAllocator()`（`:535`）；前缀表 `ID_PREFIX`（`:527`）：

| kind | 前缀 | 例 |
|---|---|---|
| `message` | `msg-` | `msg-7` |
| `task` | `t-` | `t-3` |
| `meeting` | `mt-` | `mt-2` |
| `researcher` | `r-` | `r-4` |
| `temp` | `t-` | `t-9`（与 task 同前缀、不同命名空间） |
| `academician` | 固定 `acad` | `acad`（唯一） |

- **runId 前缀＝预设标识**：共享模块 `runIdOf(designator, projectSlug, engine, mode, scriptText, packages, fileRel)`（`math-computation.js:828-834`）产出 `designator + '-' + <projectSlug> + '-' + <input 前 12 位>`；`designator` 由插件注入（`:3595`、`:8418`）⇒ v5r 的归档名为 `vibe-math-v5r-…`，**与 v5 的归档天然隔离**（A/B 对照的硬前提）。
- 回执 `receipt.preset = H.designator`（`math-computation.js:1121`）⇒ **回执里会写 `vibe-math-v5r`**，这是身份，不是文案。

### 3.4 归档与备份（现状）

- 状态文件**不做轮转备份**（宿主写入为原子改名）；被替换的用户编辑由**安装器**在预设目录层做备份（`installer.js` 的 `BACKUP_DIR='.vibe-math-backup'`）。
- 会议纪要**追加式**：同一会议多轮续写同一文件（`:5475`）；散会后迟到发言**追加到最近一次纪要**（v5 已修的历史缺陷）。

### 3.5 待改造

- 定稿 **D6/G2** 要求「决议有**稳定标识与生效时点**」并可检索：现状只有 `Shared/Meetings/<id>.md` 与 `verdicts{}`，**无决议实体**；需新增决议对象与生效时点字段（迁移见 第 11 节）。
- 定稿要求「散会后追加材料须标注」：现状追加无标注字段 ⇒ 待新增。

---

## 5. 参数与默认值总表

> **来源＝实现**：`DEFAULT_PARAMS`（`:956-1057`，**47 个键**）。钳制规则逐条给行号；「进提示词」指该参数的值会被插进任何面向代理的文本。

| 参数 | 类型 | 默认 | 钳制/取值（行号） | 语义 | 进提示词 | 观测面 |
|---|---|---|---|---|---|---|
| `academician` | bool | `true` | — （`:958`） | 是否设院士 | 否 | `status`（`:7618`） |
| `academicianLeads` | bool | `true` | —（`:959`） | 院士是否领头（召集/分派） | 否 | `:7619` |
| `memberMayRejectAssign` | bool | `true` | —（`:960`） | 成员可否拒绝分派 | 否 | `:7619` |
| `researcherCount` | int | `3` | 非负（`:7830`） | 常驻研究员数 | 否 | `:7620` |
| `quorumCap` | int | `3` | `max(1, floor)`（`:1413`） | `m = min(cap, 有表决权者数)`（`:1412-1416`） | 否 | `:7621` |
| `quorumMode` | enum | `'m-unanimous'` | `'m-unanimous'｜'all-unanimous'`（`:963`） | 聚合模式（v4 legacy＝all） | 否 | `:7621` |
| `verdictMaxRounds` | int | `3` | `max(1, floor)`（`:4972`） | 求真表决最大轮数 | 否 | `:7623` |
| `maxTempPerMember` | int | `3` | `max(1, floor)`（`:6652`） | 每人名下临时工上限 | 否 | `:7624` |
| `maxTempTotal` | int | `12` | `max(1, floor)`（`:6653`） | 全所临时工上限 | 否 | `:7624` |
| `compactThreshold` | int(0–100) | `66` | `posMs`?（`:7625` 透出） | 上下文压缩阈值 | 否 | `:7625` |
| `compactAfterRounds` | int | `8` | —（`:7625`） | 多少轮后压缩 | 否 | `:7625` |
| `maxParallel` | int | `3` | `max(1, floor)`（`:5362/5838/6994`） | 并发唤醒预算 | 否 | `:7626` |
| `activityTimeoutMs` | ms | `120000` | `posMs`（`:7536`） | 活动超时 | 否 | `:7627` |
| `stallAutoMeetingMs` | ms | `360000` | `posMs`（v5 `:7041`；**v5r S5 起：负值＝关闭**，见 第 8.4 节 风险） | **静止提示阈值**：静止时框架**最多提示一次**（列出「谁在等谁」；**不**自动召集/散会/收束/代表态）；`0`／空＝默认，**负值＝关闭** | 否 | `:7627` |
| `chatDigestMs` | ms | `45000` | `posMs`（`:7536`） | 群聊摘要周期 | 否 | `:7627` |
| `chatDigestMax` | int | `12` | `max(1, floor)`（`:2119`） | 摘要条数上限 | 否 | `:7630` |
| `meetingKeepEvery` | int | `5` | `max(0, floor)`（`:4270`） | 纪要周期落盘（0＝关） | 否 | `:7630` |
| `meetingHardLimitMs` | ms | `1800000` | `[300000, 7200000]`（`:5279-5282`） | **会议唯一墙钟硬界** | 否 | `:7629` |
| `meetingWakeRetries` | int | `5` | `[0, 10]`（`:5283-5284`） | 同阶段唤醒重试上限；耗尽记 `unreached` | 否 | `:7629` |
| `formalVerify` | enum | `'off'` | `off｜encourage｜require`（`:988-991`） | 判定时的形式化要求 | **是**（`:3847`） | `:7631` |
| `leanCommand` | str | `'lean'` | —（`:2871`） | Lean 可执行名 | 否 | `:7632` |
| `leanArgs` | str[] | `[]` | 去重（`:3110-3121`） | 额外参数 | 否 | `:7632` |
| `leanTimeoutMs` | ms | `120000` | `max(1000, …)`（`:2867`） | 单次编译上限 | 否 | `:7632` |
| `leanAsync` | bool | `true` | —（`:999`） | 后台编译队列 | 否 | `:7633` |
| `leanInitiative` | enum | `'normal'` | `off｜normal｜eager`（`:1005`） | 日常形式化倾向 | **是**（`:2780`） | `:7633` |
| `leanSearchPaths` | str[] | `[]` | 去重、显式 `-R` 优先（`:3121`） | 额外搜索根 | 否 | `:7634` |
| `leanJobsMaxParallel` | int | `1` | `max(1, floor)`（`:3047`） | 后台编译并发 | 否 | `:7634` |
| `mathComputation` | enum | 共享件默认 | `off｜auto｜on`（`:1012`、`:1372`） | 工具可用性 | **是**（`:3649`） | `:7637` |
| `mathMode` | enum | 共享件默认 | `typed+shell｜typed`（`:1013`、`:3621`） | 是否允许 shell 兜底 | **是**（`:3621-3622`） | `:7637` |
| `mathEngines` | str[] | 共享件默认 | 数组拷贝（`:1023`） | 允许引擎 | **是**（`:3649`） | `:7638` |
| `mathTimeoutMs` | ms | 共享件默认 | `max(1000, …)`（`:3525`） | 单次运行预算 | 否 | `:7638` |
| `mathPackages` | str[] | 共享件默认 | 数组拷贝（`:1025`） | 需装包 | **是**（`math-computation.js` 提示行） | `:7639` |
| `mathInstallScope` | enum | 共享件默认 | `user｜system`（`:1018`） | 安装范围 | 否 | `:7639` |
| `finalPaper` | bool | `true` | —（`:1037`） | 收口时写论文 | 否 | `:7641` |
| `paperFormat` | enum | `'both'` | `both｜md｜tex`（`:1030`、`:5984`） | 论文格式 | **是**（`:5984`） | `:7643` |
| `paperLanguage` | enum | `'zh'` | `zh｜en`（`:1031`、`:5983`） | 论文语言 | **是**（`:5983`） | `:7644` |
| `paperCompilePdf` | bool | `true` | —（`:5990`） | 是否编译 PDF | **是**（`:5990`） | `:7644` |
| `paperEditor` | enum | `'academician'` | `academician｜office`（`:1033`、`:5670`） | 定稿人（office 需先咨询） | **是**（`:5990`） | `:7645` |
| `paperLatexCommand` | str | `''` | `''`＝自动探测（`:1036`、`:6371`） | 强制单一引擎 | **是**（`:6371`） | `:7645` |
| `feedback` | enum | `'on'` | `on｜off`（`:1044`、`:3681`） | 反馈工具与提示开关 | **是**（`:3681`） | `:7641` |
| `provider` | str | `''` | —（`:2192`） | 覆盖成员的 provider | 否 | `:7646` |
| `model` | str | `''` | —（`:2193`） | 覆盖成员的 model | 否 | `:7646` |
| `toolAllow` | str[] | `[]` | —（`:2178`） | 成员工具白名单 | **是**（`:2178`） | `:7647` |
| `toolDeny` | str[] | `[]` | —（`:2179`） | 成员工具黑名单 | **是**（`:2179`） | `:7647` |
| `staffPersona` | str | `''` | —（`:1054`、`:2174`） | 追加人设 | **是**（`:2174`） | — |
| `tempToolAllow` | str[] | `[]` | —（`:1055`） | 临时工工具白名单 | **是** | — |
| `tempToolDeny` | str[] | `[]` | —（`:1056`） | 临时工工具黑名单 | **是** | — |

**参数纪律**：① 新参数必须**同时**进 `DEFAULT_PARAMS`、`vibe_v5_set`（`:8477` 工具描述里的校验）、`status`（`:7618-7647` 的观测面）；② 参数**整表替换**（`:569`），因此**读取端必须给出缺省**（`Number(x) || default`）；③ 有钳制的参数**只在读取处钳**（现状：钳制点见上表），**不要**在写入处偷偷改用户输入。


---

## 6. 错误码总表

### 5.1 错误对象的形状（现状）

```js
// vibe-math-v5r.js:343-347
function v5err(code, message) { const e = new Error(message || code); e.code = code; return e }
```

- **两种呈现**：① **抛出型**——`throw v5err('CODE', msg)`（工具处理器会把 `e.code` 变成结构化回执，如 `:1474` 的 `V5_MEMBER_NOT_FOUND`）；② **返回型**——`{ ok: false, code, message, next? }`（多数处理器直接用这种形状，例：`:2033`、`:4467-4473`）。
- **`next` 提示**：返回型可带 `next: {kind, tool, hint}`（`:1456-1459` 是范例），用于告诉调用者**下一步做什么**；新增错误码**应**带 `next`（现状并非全部都有）。
- **共享件**：`math-computation.js:230` 的 `bad(reason, code, nextHint)` 产出 `{ok:false, code, reason, next?}`；缺省码为 `MATH_INVALID_ARGUMENT`。
- **第三种抛出路径（易漏检）**：会议邀请族用局部 `refuse(code, msg)` 助手（`:5483`）抛码——`V5_ALREADY_INVITED`（`:5497`）、`V5_NO_OPEN_MEETING`（`:5487`）、`V5_INVITE_NOT_TEMP`（`:5493`）。**这三个码没有 `code:`/`v5err(` 形态**：只按那两种形态检索会漏掉它们（本章码表按**全字符串扫描**得到：插件 **50** 个）。

### 5.2 插件错误码（**50 个**，逐条；行号＝首个出现点；表内另含 1 条共享码 `MATH_INVALID_ARGUMENT` 的交叉引用行）

| code | 首个站点 | 触发点（函数/语境） | 可重试 | 对外文案要点 |
|---|---|---|---|---|
| `V5_INVALID_ARGUMENT` | `:2033` | 参数非法（**54 处**，最大一族） | 否（改参数后重试） | 指名非法项与期望形状 |
| `V5_MEMBER_NOT_FOUND` | `:1474` | 找不到成员/非成员调用成员工具（22 处） | 否 | 应给 `next` 指向 `vibe_v5_start`（`:1456-1459` 已实现） |
| `V5_NOT_ACADEMICIAN` | `:4572` | 非院士调院士专属动作（5 处） | 否 | 指明需要院士或所办 |
| `V5_NOT_OFFICE` | `:6096` | `paperEditor='office'` 但调用者非所办（5 处） | 否 | 说明所办须先咨询研究所 |
| `V5_NOT_VOTER` | `:5176` | 临时工投票（2 处） | 否 | 「临时工没有表决权；意见已转达」（与定稿 D8 一致） |
| `V5_NO_OPEN_MEETING` | `:5487` | 邀请发言时**没有进行中的会议**（`refuse` 路径 `:5483`） | 否 | 先开会 |
| `V5_ALREADY_INVITED` | `:5497` | **同一会议**重复邀请同一人（幂等；只记第一次） | 否 | 已邀请（幂等提示） |
| `V5_INVITE_NOT_TEMP` | `:5493` | 邀请对象不是本所在册成员 | 否 | 邀请对象受限 |
| `V5_MEMBER_LIMIT` | `:6655` | 名下/全所临时工超限（2 处） | 否 | 指名上限与当前值 |
| `V5_PROVISIONING_CONFLICT` | `:6669` | 临时工创建冲突（3 处） | 可能（并发冲突，可重试一次） | 附底层原因 |
| `V5_STATE_NOT_LOADED` | `:897` | 读状态前未加载 | 是（加载后重试） | 指名状态文件与加载失败原因 |
| `V5_INSTITUTE_STATE` | `:5257` | 状态不允许该操作（**10 处**：已收口、未启动等） | 否 | 指明当前 `phase` 与下一步 |
| `V5_INVALID_VERDICT` | `:5184` | 概率不在 `[0,1]` | 否 | 说明取值范围 |
| `V5_INVALID_TIMEOUT` | `:1938` | `timeout_ms` 不在 `[10000,3600000]` | 否 | 给合法区间 |
| `V5_INVALID_WRITE_SCOPE` | `:4411` | 写入范围越界（2 处） | 否 | 指明允许范围 |
| `V5_WRITE_FAILED` | `:4103` | 写盘失败（4 处） | 可能（宿主瞬时故障） | 指名相对路径；**不得**静默 |
| `V5_NOT_FOUND` | `:2862` | 目标文件不存在（4 处） | 否 | 指名路径 |
| `V5_SELF_MESSAGE` | `:2046` | 给自己发消息 | 否 | 说明收件人须是他人 |
| `ACTIVATION_LIMIT_REACHED` | `:2251` | 宿主并发子代理上限（5 处） | 是（等子代理结束） | 附上限来源与等待建议（`:349-357` 注释即依据） |
| `NO_SUBPROCESS` | `:2865` | 宿主无 subprocess 服务（2 处） | 否 | 说明 Lean 无法执行 |
| `LEAN_NOT_FOUND` | `:2871` | 解析不到 `lean`（4 处） | 否 | 逐字含「was not found on PATH」类信息 |
| `LEAN_SPAWN_FAILED` | `:2891` | 起进程失败 | 可能 | 附底层 `message` |
| `LEAN_RUN_FAILED` | `:2922` | 编译运行失败（2 处） | 可能 | 附 `ms` 与文件 |
| `LEAN_TIMEOUT` | `:2939` | Lean 运行**超时**（三元赋码，非字面量 `code:`） | 可能（重试/加时限） | 附 `ms` 与文件；**不得**记为通过 |
| `LEAN_FAILED` | `:2939` | Lean 运行失败（三元赋码的兜底分支） | 可能 | 附 `ms` 与文件 |
| `V5_TASK_NOT_FOUND` | `:4380` | 任务不存在/已删（3 处） | 否 | 指名任务 id |
| `V5_TASK_STALE_REVISION` | `:4473` | **CAS 失败**：`expected_revision` 落后 | **是**（重读后重试） | 打印当前 `revision` 并要求重读（`:4473` 文案已实现） |
| `V5_TASK_ALREADY_CLAIMED` | `:4486` | 已被他人认领 | 否 | 指名 owner |
| `V5_TASK_BLOCKED` | `:4488` | 前置依赖未完成（3 处） | 是（依赖完成后） | 指名阻塞项 |
| `V5_TASK_DELETED` | `:4466` | 操作已删任务 | 否 | 说明已删除 |
| `V5_TASK_UNAUTHORIZED` | `:4481` | 非 owner/非院士/非所办（2 处） | 否 | 指明有权者 |
| `V5_TASK_INVALID_TRANSITION` | `:4487` | 状态机非法迁移（5 处） | 否 | 指明当前状态与允许动作 |
| `V5_TASK_DEPENDENCY_CYCLE` | `:4376` | 依赖成环（2 处） | 否 | 指名环 |
| `V5_TASK_HAS_DEPENDENTS` | `:4540` | 有下游仍要删 | 否 | 列出下游 |
| `V5_WAIT_ABORTED` | `:1951` | 等待被中止（取消/超时） | 是 | 说明中止原因 |
| `V5_INTERNAL` | `:1878` | 断言式内部错误 | 否（缺陷） | 应视为 bug（含上下文） |
| `V5_PAPER_STATE` | `:6011` | 论文阶段不允许该动作（6 处） | 否 | 指明论文状态机位置 |
| `V5_PAPER_CONSULT_REQUIRED` | `:6112` | 「先咨询研究所」的门 | 是（咨询后） | 说明需消息＋至少一次会议 |
| `V5_FEEDBACK_DISABLED` | `:3736` | `feedback:'off'` | 否 | **具名拒绝**，不静默丢弃（`:1044-1047` 的设计） |
| `V5_FEEDBACK_BAD_OP` | `:3831` | `op` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_CATEGORY` | `:3743` | `category` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_ROUTE` | `:3747` | `route` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_STATUS` | `:3793` | `status` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_INCOMPLETE` | `:3754` | 缺三要素 | 否（补齐后） | 要求现象/影响/调整 |
| `V5_FEEDBACK_NEEDS_ASSESSMENT` | `:3761` | interpersonal 路由缺 assessment | 否 | 说明先想清楚影响谁 |
| `V5_FEEDBACK_NEEDS_OUTCOME` | `:3801` | 闭环缺 outcome | 否 | 要求回填结果 |
| `V5_FEEDBACK_NEEDS_REASON` | `:3805` | `dropped` 无说明 | 否 | 要求「为什么不改」 |
| `V5_FEEDBACK_NO_ID` | `:3782` | `update` 缺 id | 否 | 指名需要 id |
| `V5_FEEDBACK_NOT_FOUND` | `:3784` | 条目不存在 | 否 | 附 `next` 提示 |
| `V5_FEEDBACK_FORBIDDEN` | `:3788` | 非发起人/非所办 | 否 | 指名有权者 |
| `MATH_INVALID_ARGUMENT` | `:8437`（插件兜底）＋共享件多处 | `math_computation` 参数非法 | 否 | 与 03 章同文 |

### 5.3 共享件冻结码（**11 个**，`math-computation.js:44-54`；与插件并集后**共 56 个**）

| code | 站点 | 语义 |
|---|---|---|
| `MATH_NOT_AVAILABLE` | `:44`、`:1422` | 模块/工具不可用 |
| `MATH_ENGINE_NOT_FOUND` | `:45`、`:654`、`:689`、`:962` | 本机没有可用引擎（附试过的名单与安装建议） |
| `MATH_ENGINE_LICENSE_REQUIRED` | `:46`、`:673`、`:685` | 已安装但许可不可用（仅厂商可激活） |
| `MATH_ENGINE_UNUSABLE` | `:47`、`:679` | 存在但版本探针失败/超时 |
| `MATH_MISSING_PACKAGES` | `:48`、`:1025` | 缺少所需包（附版本策略条款） |
| `MATH_TIMEOUT` | `:49`、`:1188` | 运行超时（部分输出另行归档） |
| `MATH_NONZERO_EXIT` | `:50`、`:1209` | 非零退出 |
| `MATH_ENGINE_BAD_ARGV` | `:51`、`:1199` | argv 形态非法 |
| `MATH_REFUSED` | `:52`、`:276-284`、`:649-651`、`:1046-1049` | 策略/路径/文件拒绝 |
| `MATH_INVALID_ARGUMENT` | `:53`、`:230`、`:247` | 参数非法（**与插件同名，重复计 1**） |
| `MATH_NO_SUBPROCESS` | `:54`、`:1093` | 宿主无 subprocess |

- **与 03 章的双向一致**：本章的每个码都必须能在 03 的对外错误码表里找到；**03 里出现的码必须真的会被抛出/返回**（否则就是"文档承诺了不存在的码"）。守卫：`tests/audit-math-computation-parity.mjs` 断言**冻结 11 码集合**（「the emitted failure-code set is the frozen 11」）。
- **新增码的纪律**：① 必须进 03 的对外表；② 必须有**具名断言**（源代码级或行为级）证明它真的会出现；③ **不得**改名已有码（改名=破坏契约，须走发布说明与迁移）。

### 5.4 与 03 章的双向一致（现状核对）

- **S15（K4）**：**0 新错误码／0 新工具**（`#54` 只**扩展参数** `op`／`of`／`fact_fix`；`vibe_v5_assign` 只**补参数字段** `due_in`／`origin`）⇒ **§5.4 命令表不加行**；对外承诺变化全部落在 `03` 的 **#27／#30★ 行 ＋ §4.3（只读子键）＋ §5.3（幂等与状态机）＋ 第 6 节 H20**。

**统一口径**：**03 是对外契约**（"这个码对外承诺存在"），**本章是实现全集**（"实现里真的会抛/返回哪些码"）。判定标准是 03 第 7 节 的判据 **A2「每个错误码都可达且都登记」**（双向：表里每个码都能被 raise；实现 raise 的码都在表里）。

| 方向 | 现状 | 结论 |
|---|---|---|
| **03 → 实现**（03 声明的码是否真的可达） | 03 第 5.2 节 的 **25 个"现有"码**：**25/25 可达**（`code:`／`v5err`／`refuse` 三条路径）；其中 3 个只走 `refuse`（见 第 6.1 节 第三条） | ✅ **无"承诺了不存在的码"** |
| **03 登记的计划码** | 4 个 `MEETING_*`（`MEETING_PHASE_NOT_ALLOWED`／`MEETING_TYPE_NOT_ENABLED`／`MEETING_QUORUM_NOT_MET`／`MEETING_PROVISIONAL`）在实现中 **0 命中** | ⏳ 属**计划**（随会议平台落地，见 第 12 节 的 S3/S7/S8），**不是**缺陷 |
| **实现 → 03**（实现抛的码是否都登记） | 实现共 **61 个码**（插件 50 ＋共享 11）；其中 **36 个未出现在 03 第 5.2 节** | ⚠ **需 03 的负责人补登记**（或明确声明为"内部码，不对外"）。36 个＝`V5_FEEDBACK_*` **12** ＋`LEAN_*` **5** ＋`MATH_*` **11** ＋`NO_SUBPROCESS`＋`ACTIVATION_LIMIT_REACHED`＋`V5_INTERNAL`＋`V5_INVALID_WRITE_SCOPE`＋`V5_NOT_FOUND`＋`V5_PROVISIONING_CONFLICT`＋`V5_SELF_MESSAGE`＋`V5_WAIT_ABORTED` |
| **新增运行时命令** | `vibe_v5_end_verify`（R10-2a，仅院士；复用 `V5_NOT_ACADEMICIAN`／`V5_INVALID_ARGUMENT`，**不新增错误码**） | ✅ 已在 03 第 3 节命令表登记为 **#43**，并在 03 的幂等节写明"同一 `target` 重复结束 ⇒ `deduped:true`"（同时注明 #43 是 **v5r 运行时工具**、42 条平台命令不变） |
| **新增运行时命令（G6）** | `vibe_v5_self_report`（成员自述：`overall/subgoal/plan/status`；**仅本人**；时间由框架自动写入；同值幂等 ⇒ `deduped:true`） | ✅ **已落地**（03 第 3 节 #44／幂等节、07 的 G6 节、本章第 12 节 G6）：静态门 **R17–R22** ＋ 各一唯一点变异（`--self-probe` 覆盖）；行为场景 **6/6 双路径绿**（v5 路径显式 skip ＋ `failed=0`）；mutants **6/6 定向按名红**（G6 全量 **57/57**） |
| **新增运行时命令（S4）** | `vibe_v5_chair_proxy`（D1/R4/R5：仅院士指定代行；`scope` 唯一 `'close'`；`why` 必填；时键拒绝；同值幂等 ⇒ `deduped:true`）＋ `vibe_v5_procedural_objection`（D2：在册成员提异议；`why` 必填；`chairReplyPending:true` 可见；同值幂等 ⇒ `deduped:true`）；**不新增错误码**（复用 `V5_NOT_ACADEMICIAN`／`V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #45／#46、03 第 5.3 节 幂等与时间、07 的 S4 节、本章第 12 节 S4）：静态门 **R23–R28** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **30/30**；行为场景 **6/6 双路径绿**（v5 路径显式 skip ＋ `failed=0`）；mutants **全量 63/63 按名红**（双门禁内的**全量**跑：`PASS v5-institute-fixes.mutants.mjs`、`TOTAL 106 PASS 106 FAIL 0`；族总数 **57→63**）＋ 定向 **6/6**（14 s） |
| **新增运行时命令（S6）** | `vibe_v5_grant`／`vibe_v5_revoke`（D1/D2/D6/D8：临时授权；**仅院士**授/撤；被授权者**仅在册成员**；`grant_scope` 事件型三档；**不收任何 `…At`/`…Ms`（含 `expires_at`）**；同值幂等 ⇒ `deduped:true`；**不新增错误码**：复用 `V5_NOT_ACADEMICIAN`／`V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_MEMBER_NOT_FOUND`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #47★／#48、03 第 5.3 节 幂等与时间、**03 第 6 节 H12**、07 的 S6 节、本章第 12 节 S6）：静态门 **R34–R38** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **40/40**；行为场景 **6/6 双路径绿**（v5 路径显式 skip ＋ `failed=0`）；mutants **全量 78/78 按名红** ＋ `skipped=[]`／`hangs=[]`（族总数 **70→78**） |
| **新增运行时命令（S7）** | `vibe_v5_poll_open`／`vibe_v5_poll_vote`／`vibe_v5_poll_close`（定稿 §7.1 六项：选项内容／单选多选／最多／最少／**最少收集票**／记名不记名＋弃权＋改票；**仅院士**开/关板；**票权只认 `voters()`**；`min_votes` **必填无默认**；**两个门槛各算各的**（`settled` 只读 `minVotes`＋`cast`；结题门＝未投票者清空／`m = min(quorumCap, |voters|)`）；**不写 `verdicts`/`solve`/`selfReport`**；**无"到点自动结算"**；时间键一律拒且**大小写不敏感**；**不新增错误码**：复用 `V5_NOT_ACADEMICIAN`／`V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_MEMBER_NOT_FOUND`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #49★／#50★／#51、03 第 5.3 节 幂等、**03 第 6 节 H13**、07 的 S7 节、本章第 12 节 S7）：静态门 **R39–R43** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **45/45**；行为场景 **6/6 双路径绿**（v5 路径显式 skip ＋ `failed=0`）；mutants **全量 84/84 按名红** ＋ `skipped=[]`／`hangs=[]`（族总数 **78→84**） |
| **新增运行时命令（S9）** | `vibe_v5_reconsider`（D5/D5a/U3：**少数意见入档＋复议**；`target`＝判定对象或 `ballot:<id>`；`why` 必填；`evidence?` 限同一对象/会议（D6）；**资格＝记录派生**（有胜方⇒胜方之一；**无胜方⇒任一参与者，不得拒收**）；**门槛只升不降** `after = max(before, reconsiderFloor, quorumCap)`（`reconsiderFloor` 缺省 0）；**同一轮只一次**＋`verdictMaxRounds` 上限；**append-only**＋`supersededBy`；**不记名只回显事实、逐人永不解密**；**不收任何 `…At`/`…Ms`**；**不新增错误码**：复用 `V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_MEMBER_NOT_FOUND`） | ✅ **已落地**（03 第 3 节 #52、03 第 5.3 节 幂等、**03 第 6 节 H15**、07 的 S9 节、本章第 12 节 S9）：静态门 **R49–R54** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **56/56**；行为场景 **6/6 双路径绿**（v5 路径显式 skip ＋ `failed=0`）；mutants **全量 96/96 按名红** ＋ `skipped=[]`／`hangs=[]`（族总数 **90→96**） |
| **新增运行时命令（S11-a）** | `vibe_v5_secretary`（GAPS 29：**指定/撤销记录人**；`who` 必填＝**在册成员**（**临时工不可**）；`why?`；`revoke?`（撤销不需要 `who`）；**仅院士**；**不得自任**（院士/所办 ⇒ 具名拒）；**当次会议绑定**；同值幂等；撤销/换人 append-only（`revokedAt`）；台账 `secretaries[]`（**fold 白名单**）；**不收任何 `…At`/`…Ms`**；**不新增错误码**：复用 `V5_INVALID_ARGUMENT`／`V5_NOT_ACADEMICIAN`／`V5_MEMBER_NOT_FOUND`／`V5_NOT_VOTER`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #28／#53、03 第 5.3 节 幂等、**03 第 6 节 H17**、07 的 S11 节、本章第 12 节 S11）：静态门 **R61–R63／R66** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **68/68**；场景 **6/6 双路径绿**（v5 显式 skip ＋ `failed=0`）；mutants **全量 108/108 按名红** ＋ `skipped=[]`／`hangs=[]`（族 **102→108**） |
| **新增运行时命令（S11-b）** | `vibe_v5_minutes`（GAPS 29：**记录人写纪要**；`entry?`／`text`／`detail?`／`agenda_item?`；**院士 ∪ 当次会议记录人**（其他成员 ⇒ 具名拒）；**只增不改**（`appendMeetingTail`；**绝不重写** `### <who>` 小节与两区 ⇒ S10 锚／S8 门不受影响）；**不自动补全**（无 `entry` ⇒ 只报 `gaps[]`）；同条目幂等；收束渲染**独立小节 `## 记录人补充`（两区之后）**＋结构化 `minutes{secretary,entries}`；**不收任何 `…At`/`…Ms`**；**不新增错误码**：复用 `V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #27／#54、03 第 5.3 节 幂等、**03 第 6 节 H17**、07 的 S11 节、本章第 12 节 S11）：静态门 **R63–R66** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **68/68**；场景 **6/6 双路径绿**；mutants **全量 108/108 按名红** ＋ `skipped=[]`／`hangs=[]` |
| **新增运行时命令（S13-a）** | `vibe_v5_result_record`（G2/D6：**记录决议**；`text` 必填；`actions?[{who,due_in?}]`（**在册成员**；**临时工 ⇒ 拒**；**相对期限**，任何 `…At`/`…Ms` 含 `due_at` **一律拒**）；`target?`；`kind?`＝`resolution`／`solve`／`org`／`procedure`；`retroactive?`（**只声明留档，不改 `effectiveAt`**）；**院士 ∪ 当次会议记录人**；**不可授**；**仅正式会议内**（`light` ⇒ **复用 S12 `truthWriteRefusal`**）；**标识 `res-<n>` 由框架分配**；**公告即生效**；同值幂等；**append-only**；**不写 `verdicts`/`solve`**；**不新增错误码**：复用 `V5_INVALID_ARGUMENT`／`V5_NOT_VOTER`／`V5_MEMBER_NOT_FOUND`／`V5_NO_OPEN_MEETING`） | ✅ **已落地**（03 第 3 节 #26／#55、03 第 5.3 节 幂等、**03 第 6 节 H19**、07 的 S13 节、本章第 12 节 S13）：静态门 **R71–R74** ＋ 每门一个**唯一点变异** ⇒ `--self-probe` **77/77**；场景 **7/7 双路径绿**（v5 显式 skip ＋ `failed=0`）；mutants **全量 120/120 按名红** ＋ `skipped=[]`／`hangs=[]`（族 **114→120**） |
| **新增运行时命令（S13-b）** | `vibe_v5_resolutions`（G2：**只读检索**；`id?`（`res-<n>`／`res:<n>`／`<n>`）／`target?`／`meetingId?`／`kind?`／`limit?`（1–50，缺省 10）；**任何时间过滤键一律拒**（时间只作排序/展示）；返回 `{count,resolutions[{id,kind,text,effectiveAt,meetingId,target,supersededBy,actions_count}]}`；**不驱动**；**不新增错误码**：复用 `V5_INVALID_ARGUMENT`） | ✅ **已落地**（03 第 3 节 #56、**03 第 6 节 H19**、07 的 S13 节、本章第 12 节 S13）：静态门 **R75** ＋ 唯一点变异 ⇒ `--self-probe` **77/77**；场景 **7/7 双路径绿**；mutants **全量 120/120 按名红** |

- **实现码总数＝61**（插件 **50** ＋共享 **11**）；其中 3 个只经 `refuse()`（`:5483`）、2 个经**三元表达式**赋码（`:2939`）⇒ **任何"只扫 `code:` 字面量"的统计都会漏 5 个**（本章码表按全字符串扫描得到，并已补入这 5 行）。
- **本章的处置**：**不在本章改 03**（章节归属不同）；**只记录差异**并把判据指向 03 第 7 节-A2。落地任一新码时，**同一提交**里必须同时更新 03 与本章（否则 A2 必然红）。
- **注意一处"看似码、实为环境变量"**：`V5_TEX_ROOTS_SANDBOX`（`:113`）是**环境变量名**，**不是**错误码；全字符串扫描会把它扫进来，登记时须排除。

---

## 7. 并发、锁、幂等与重试

### 6.1 CAS 与修订号（现状）

- **任务 CAS**：调用方必须给 `expected_revision`（`args.expected_revision ?? args.expectedRevision`，`:4467`），缺失即 `V5_INVALID_ARGUMENT`（`:4468`）；不等即 `V5_TASK_STALE_REVISION`（`:4469-4473`，**不写状态**）。
- **修订号单调**：任何任务变更 `revision + 1`（`:4557`、`:4626`、`:4640`）；`task_update` 的动作集合见工具描述（`:2474`：`complete|release|reopen|edit|set_dependencies|delete`）。
- **会议/状态**没有 CAS：状态靠**事件 fold 串行化**（本章第 2.4 节），因此同一 tick 的并发变更**不会互相覆盖**（`:4823-4836` 是原子追加的范例；这份注释同时记录了历史缺陷"lost-proposal race"）。

### 6.2 并发写与冲突处理（现状）

- **同一进程内**：所有写都经 `commit()`；**没有**跨进程锁（DSH 会话是单进程内多代理，写路径由宿主 `fs.writeText` 原子改名兜底）。
- **冲突**：并发"读-改-写"若绕过 fold 就会丢更新 ⇒ **规则**：任何"数组/对象级"更新都必须写成 **fold 内函数**（例：`patch.paper` `:580-585`、`patch.feedback` `:589-593`、`queue` `:4830-4836`）。
- **反例（已修）**：历史上有过「两个 `propose_verify` 并发 ⇒ 只留后一个且两者都报 `ok`」的缺陷，修法即上面的原子 fold（`:4824-4827` 注释）。

### 6.3 幂等键（现状）

- **求真队列**：以 `target` 为幂等键（`:4832` `list.some(p => p.target === entry.target)`）⇒ 同一目标重复提案**不会**重复入队。
- **Lean 队列**：以**内容身份**去重（CRLF 归一 + 去尾部空行，`:273` 注释；`sha256` 见 `:4152`）。
- **消息/会议**：没有显式幂等键；重复调用会生成新 id（调用方需自行避免重复；**待改造**：定稿的"动议/附议/引用"都需要幂等语义）。**〔部分改造·S10〕** 引用面已落地：**引用锚的解析是只读的**（不改状态、不驱动）；**引用投递与补记仍以"新消息"留痕**（`msg-N` append-only）⇒ **已定（清账）：append-only 为正确语义，不实现同值 `deduped`**（公开消息面的重复陈述**应当留痕**）——见 第 12 节 S10。**〔部分改造·S11〕** 记录人面已落地并**自带幂等**：**同值指定记录人** / **未指定时撤销** / **同一条目**均 ⇒ `deduped`（**不追加台账／不重复写纪要**）；但**消息面本身仍无 id 级幂等键**（`msg-N` append-only）——记录人**当次会议绑定**，未指定 ⇒ 纪要**明写"无成员责任人"**（03 第 6 节 H17）。

### 6.4 重试、退避与**有界**要求（现状）

| 机制 | 参数/行号 | 上限 | 耗尽后的行为 |
|---|---|---|---|
| 会议唤醒重试 | `meetingWakeRetries` `:983-986`，钳制 `:5283-5284` | `[0,10]`，默认 5 | 记 **`unreached`**，**当作"已获得机会"**（不阻塞收束，且与"选择不发言"严格区分） |
| 会议墙钟硬界 | `meetingHardLimitMs` `:980-982`，钳制 `:5279-5282` | `[300000,7200000]`，默认 30 min | 触界即按兜底收束（**唯一兜底**，注释 `:980`） |
| Lean 异步任务 | `attempts` + 等待 deadline `:3425-3427` | 由调用方 `waitMs` 决定 | 记 `interrupted`／`settled`（`:3323`、`:3331`） |
| 心跳/看门狗 | 心跳装配 `:2694-2698`，disposer `:1089` | 周期性 | 静止判定；**不得**让看门狗瞬发或空闲窗不过期（`:416`、`:2698` 的反缺陷注释） |
| 求真表决轮数 | `verdictMaxRounds` `:964`，判定 `:4972` | 默认 3 | 达轮数即按 `judgeVerdict` 处置（**见 第 7.5 节 与定稿 R10 的冲突**） |

- **纪律**：任何重试/等待**必须有界**；**禁止**无界循环（`while (true)`）；**禁止**用"时间到"隐式推进流程（见 第 8.4 节 与定稿 R10）。

### 6.5 待改造（相对定稿）

1. **`judgeVerdict`（`:4782-4822`）现状**：`E` = 全部在册表决者（`voters()` `:1410`）；未投票者被 `continue`（`:4794`，不计反对 ✓），但 **`m = quorumM()` 计入全部在册者**（`:4788`）⇒ 未答者会**抬高门槛**。定稿 **D3** 要求「到场＝**在可表决集合内且能应答**；**未答不计分母**」⇒ **现状与定稿不一致**（详见"判定留痕"）。
2. **过程票与结束裁定的分离（定稿 R10）**：现状 `judgeVerdict` 的 `outcome/mean` 会被**轮次路径**直接消费（`:4927` 超时放弃并记未定论、`:4987` 轮次未定论、`:5035/5045` 留库未定论、`:5120/5153` 纪要展示），且 `verdictMaxRounds` 到顶即处置 ⇒ **存在过程性/时间驱动的处置路径**，且过程数字**没有**统一的「尚未生效／仅供参考」标注 ⇒ 与 R10 第 1、3、4 条不一致。
3. **票/发言分离（定稿 R3）**：现状**没有**"表决期间禁止发言"的机制（工具面分离 ≠ 时序分离）⇒ 待新增。
4. **临时授权（D1/D2/D6/D8 的救济面）**：现状权限是**静态角色判断**（`V5_NOT_ACADEMICIAN` `:4572`、`V5_NOT_OFFICE` `:6096`、`V5_NOT_VOTER` `:5176`），**没有**授权对象、范围与过期 ⇒ 待新增（含 `meeting_grant/revoke` 类语义；见 第 12 节）。**〔已改造·S6〕** 已落地：权限判定收敛为**单一谓词** `canDo ＝ 默认表 ∩ 阶段允许 ∩ 生效授权 − 撤回`（六处权限点统一走它，未授权者行为不变）；**仅院士**可授/撤（`vibe_v5_grant`／`vibe_v5_revoke`，#47★／#48）；被授权者**仅在册成员**（D8，校验先于写台账）；**可授集合＝4**（`assign`／`prioritize`／`nudge`／`convene`，判据＝"凡由裁定级身份保证把守的命令不可授"）；**事件型自动失效**三档＋**显式撤回（写事件并广播）**；**不产生票权**；**不可转授**（GAPS 22）。见 第 12 节 S6。
5. **少数意见入档（D5）**：现状 `bTrue/bFalse/abstain/mean` 只在判定对象与纪要行里（`:4802`、`:5120`、`:5153`），**没有**独立的少数意见记录与复议触发 ⇒ 待新增。**〔已改造·S9〕** 已落地：`minority[]` 一等入档＋`report()`「少数意见」节；**复议入口**＝ `vibe_v5_reconsider`（#52，资格**记录派生**：胜方之一／无胜方⇒任一参与者；**门槛只升不降**；**append-only**；`status.verify` 只加只读子键）。见 第 12 节 S9。

---

## 8. 时间（v5r 的规范）

### 7.0 规范（本章为权威定义，定稿 C6 指向本章）

1. **墙钟字段**：命名以 **`…At`** 结尾，值是 **epoch 毫秒**（无本地时区字符串，渲染端本地化）；用于**记录与计划**（事件时刻、截止、日志）。**不得**用它推导"经过了多久"的硬结论。
2. **单调时长字段**：命名以 **`…Ms`** 结尾，值是**单调时钟差值**（单调源，非墙钟）；用于**成本与超时**（耗时、预算、看门狗）。**不得**把它当作时刻使用。
3. **两类不得混用**；**缺失必须是显式的"未知"**（不得用 `0` 冒充真实零而不加说明）。
4. **不得以时间做隐式驱动**：到点只**提示**或走**具名触界广播**（可由院士撤销/续期），**不得**自动改变流程或判定结论。
5. **每个对象各自带时间**（G6）：`overall`／`subgoal`／`plan` 各带 `overallAt`／`subgoalAt`／`planAt`，**由框架自动写入**（用户自带时间一律拒绝）；每次更新刷新该字段时间并**保留旧值与旧时间**。
6. **主持代行的时间也由框架设置**（S4）：`vibe_v5_chair_proxy` 拒绝请求里的任何 `…At`／`…Ms`（**含 `until`**）；代行**不自设时限**，记录里的 `chair.since` 由框架写入（与第 5 条 G6 同源：时间字段只由框架产出）。

### 7.1 两类时间与现状字段

| 类别 | 用途 | 现状字段 | 来源 | 备注 |
|---|---|---|---|---|
| **墙钟** | 事件时刻、日志、截止 | `now()`＝`Date.now()`（`:8821`）；`createdAt`（`:452`）、`updatedAt`（`:4626`）、`enqueuedAt/startedAt/settledAt`（`:3162`）、`lastProgressAt`（`:571`） | 系统时钟（毫秒） | **可跳变**（NTP/手动改表），**不得**用来算"经过了多久"的硬结论 |
| **时长（现状：由墙钟差值得到）** | 耗时统计 | `ms: now() - st`（`:2922`）、`now() - (job.startedAt || now())`（`:3455`）、`:3234` 的 `settledAt - startedAt` 类推导 | **墙钟差值** | ⚠ 现状**没有**单调时钟源（全库无 `performance.now()`）⇒ 时钟跳变会污染时长 |

- **缺失时间必须显式"未知"**：现状用 **`0`** 表示未知/未开始（`enqueuedAt: now(), startedAt: 0, settledAt: 0`，`:3162`；读取端 `job.startedAt || 0`，`:3234/3409`）。**规则**：`0` 只表示"未知"，**不得**参与"距今多久"的算术（否则会把未知算成 1970 年）。
- **时区**：状态与回执里的时间一律是**毫秒时间戳**（无本地时区字符串）；人读文本由渲染端本地化。⇒ 跨机/跨时区**不产生歧义**。

### 7.2 「不得以时间做隐式驱动」（现状的落点）

- **会议发言**：注释 `:979` 明说「沉默**不触发任何截止**，只看'机会是否给完'与'是否还在举手/在飞'」⇒ **会议不因"没人说话"而自动收束** ✓（与定稿 R2/D10 同向）。
- **会议硬界**：`meetingHardLimitMs` 是**唯一兜底**（`:980`）⇒ 触界属"有界兜底"，但**触界必须具名广播**（定稿 R10 第 2 条）——**现状的触界广播口径待核**（`finalizeMeeting` `:5553` 会写纪要，是否具名广播"因触界"**待确认**）。

### 7.3 期限与"到期出口"（现状）

- Lean 等待：`deadline = now() + waitMs`，到期退出循环（`:3425-3427`）。
- 求真表决：**长时间无新票**⇒ 放弃并记未定论（`:4927`），**不**自动下真值结论。
- 会议：硬界到期按兜底路径（第 7.4 节）。

### 7.4 待改造（时间相关）

1. **单调时长**：定稿要求"墙钟与**单调时长**不得混用"。现状**全部时长都是墙钟差值**（本章第 8.1 节）⇒ 应引入单调源（或至少在回执里标注"时长由墙钟差值得到，可能受时钟跳变影响"），**并**把墙钟字段与时长字段在命名上分开。
2. **过程性/时间驱动的处置必须消灭或显式化**：`:4927`（超时放弃表决）与 `stallAutoMeetingMs`（`:974`、`:7041` **框架自动召集会议**）都是**时间驱动的流程动作**；定稿 R10 第 2 条只允许"院士显式操作"或"具名广播的有界触界"⇒ 二者需改造为**触界广播 + 可撤销**（或移出自动路径）。**〔已改造·S5〕** "静止自动召集会议"已**移出自动路径**：静止只发**一次性提示**（每片段最多一次，列出「谁在等谁」），不召集/不散会/不收束/不代表态；`stallAutoMeetingMs` 语义改为**静止提示阈值**（**负值＝关闭**，须移出"非正即删"守卫）；超时放弃表决那一条仍按 S3 的具名触界口径（`bound:idle`／`bound:round-cap`）。
3. **"未知"语义显式化**：把 `0`（未知）与 `0`（真实零）在字段命名或类型上区分（现状靠注释约定，易错）。

---

## 9. 提示词与面向代理文本的生成规范

### 8.1 谁负责生成（现状）

| 生成器 | 行号 | 产出 |
|---|---|---|
| `briefBlock(member, roundNo)` | `:1876` | 成员状态短块（**不得**为未知成员构造，`:1878` 有断言） |
| `memberPersona(member)` | `:2173` | 成员人设（拼接 `staffPersona` `:2174`、工具白/黑名单 `:2178-2179`、`provider/model` `:2192-2193`） |
| `initialPrompt(member, initialTask, mode, roundNo)` | `:2518` | 首次唤醒提示词 |
| `normalPrompt(member)` | `:2546` | 常规轮提示词 |
| `meetingPrompt(member, mn, opts)` | `:2587` | 会议轮提示词（纪要落点也在其中说明：`:2612`） |
| `mathPromptBlock(lang)` | `:3643` | 数学计算可用性块（含冻结规则行，`:3625-3630` 自检） |
| `paperHintBlock(lang)`／`paperPushLine(L)` | `:3662`／`:3667` | 论文提示 |
| `formalPromptBlock(target)` | `:3847` | Lean 形式化要求块（`formalVerify` 三档） |
| 论文定稿三件套 | `:5741`／`:5769`／`:5792` | 写作/评审/定稿提示 |
| 预设人设（出厂） | `agent.cordis.yml:53`（`@deepseek-ai/dsh-persona`） | 主代理人设正文（**冻结组合的一部分**） |

### 8.2 铁律（面向代理的文本）

1. **自足干净**：任何进入提示词的字符串必须**只凭自身可读**——**不得**出现内部工作目录路径、代理句柄、任务号、审查轮次、提交哈希、会话措辞。
2. **不承诺做不到的事**：不得提示"用本机没有的引擎编译"之类（共享件的 `absent[]/why` 与 `next` 提示就是为此，见 `math-computation.js` 的 `userInstallNext`）。
3. **措辞即契约**：hint/usage/实际分支三处必须一致（守卫：`tests/audit-persona-surface.test.mjs`，276 断言；灵敏度：`tests/audit-persona-sensitivity.mjs`）。
4. **规则行冻结**：数学可用性块的规则行有逐字自检（`:3625-3630`）⇒ **不得**局部改字。

### 8.3 语料（现状与归属）

- `prompt-corpus-v5/`（`prompt-corpus-v5.md/.json`）是**v5 的人工复核语料**；插件里只在一处注释提到它（`:26`）。**v5r 目前没有自己的语料**（有意留白）：提示词与 v5 逐字节相同 ⇒ 语料本可字节复用。
- **有意留白（未纳入 v5r 的枚举点，不要误当成"已覆盖"）**：① `tests/audit-prompt-invariants.mjs`（写死 4 行预设清单）；② `tests/audit-prompt-duplication*.mjs`（**有意只覆盖 v2–v4**）；③ `tests/audit-artifact-docs.mjs`（预设映射表）；④ `tests/audit-participant-set-parity.mjs`（按预设语义写死）。
- **语料生成的归属**：语料是**派生件**（随人格/提示词源变化而重生成）；规则是「**把重生成与源编辑一起提交**，绝不把脏的派生语料留过提交」。**v5r** 若将来加入语料枚举，**只允许新增 v5r 段落**，**v2–v5 段落必须字节不变**。

---

## 10. 测试与守卫规范

### 9.1 三层守卫（放在哪一层）

| 层 | 何时用 | 现状范例 | 代价 |
|---|---|---|---|
| **源码级**（静态断言） | 断言"某结构/某行必须存在或其位置关系"（表存在、调用先于入口、常量同源） | `tests/audit-preset-rows.test.mjs`（声明行＝生成器输出）、`tests/audit-persona-surface.test.mjs`（persona↔注册表↔hint 三处一致） | 毫秒级；**不会**发现运行时行为缺陷 |
| **行为级**（直接 `apply(ctx)`） | 断言"给定输入必须得到/拒绝某结果"（配额、权限、CAS、错误码） | `tests/math-computation-*.test.mjs`、`tests/prompt-v5-integrity.test.mjs` | 秒级；**要**覆盖失败分支 |
| **端到端**（真实宿主/suite 驱动） | 断言"整条链路在真实宿主里真的这么跑" | `tests/e2e-v5-round2.test.mjs`、`tests/selfdrive-v4.mjs`、`tests/e2e-v4-fixes.test.mjs` | 慢；**脆弱**（见 9.3） |

**选择规则**：能在源码级断言的**不要**放到端到端；能用行为级**不要**启真实宿主；只有"必须证明真的接通了宿主服务"时才用端到端。

> **与 10 章的衔接**：守卫的**验收判据与具名变异清单**在同系列 `docs/10-guards-and-acceptance.md`；**接口层的判据**在 `docs/03-interface-contract.md` 第 7 节（例：**A2 每个错误码都可达且都登记** ⇒ 第 6.4 节 的差异正是它要守的对象）。本章只规定"守卫放在哪一层、变异怎么叫红、覆盖怎么记账"。

### 9.2 具名变异（新守卫的硬要求）

1. **单点**：一次变异只改**一处**语义（多改点无法归因）。
2. **按名红**：变异后必须有一条**具名断言**变红（断言文本要能被人读懂）；只看退出码不算证据。
3. **静态优先**：能静态断言的就静态断言；行为级次之；端到端最后。
4. **先绿后红**：未变异副本必须**先绿**（否则红不是变异造成的）；`--self-probe` 模式即"对变异副本跑并要求具名红"。
5. **有界**：变异运行必须有超时；**超时记 HANG，不得记 PASS**。

现状约定：变异族放 `tests/*.mutants.mjs`（构建**临时副本**、单点编辑、要求具名红、打印 `hangs=[]`／`skipped=[]`／`ALL MUTANTS RED AS REQUIRED`）；`--self-probe` 由套件自身提供（如 `audit-math-computation-parity.mjs --self-probe` ＝ 8/8、`audit-participant-set-parity.mjs --self-probe` ＝ 6/6、`audit-v5-integrity.mjs --self-probe` ＝ 8/8）。

### 9.3 已知并发脆弱与处置（**如实记账**）

| 位置 | 现象 | 处置 |
|---|---|---|
| `tests/e2e-v4-fixes.test.mjs:10-18` | 每个循环有**墙钟上限**＋固定迭代上限；**在高负载门禁下会偶发失败**（高负载下曾观测到偶发失败；单跑通过） | 保留墙钟地板；**偶发红先单跑复现**，复现不了记 flake，**不得**据此改产品代码 |
| `tests/selfdrive-v4.mjs:132-140` | 早期"固定 deadline 一过就判负"是唯一失败源 | 已改为**有界轮询**（`waitFor(pred, ms)` `:17`，到达上限即失败） |
| `tests/run-tests.mutants.mjs:43-53` | 运行器对超时的**具名**能力需被守 | 变异体把限制压到 1 s，要求运行器**具名**列出 TIMEOUT；默认限制下**不得**出现 TIMEOUT 标记 |
| 会议唤醒/看门狗 | 看门狗"瞬发"或空闲窗"永不过期"是历史缺陷 | 反缺陷注释：`:416`、`:2698`；新增定时器必须**同源读取**参数 |

### 9.4 覆盖边界（现状，逐条记账）

- **已覆盖 v5r 的枚举点（5 处）**：`audit-math-computation-parity.mjs`（五份共享件逐字节相同）、`audit-math-computation-contract.mjs`（每预设接缝一致）、`audit-persona-sensitivity.mjs`（每个预设的人设副本）、`audit-formal-sensitivity.mjs`（`PLUGINS` 表）、`audit-fuzz-helpers.mjs`。另加 `installer.js PRESETS`＋`package.json#files`＋`audit-preset-rows.test.mjs`（声明行）。
- **有意**未覆盖 v5r 的四处**见 第 9.3 节**（prompt-invariants／prompt-duplication／artifact-docs／participant-set-parity）。**不得**把"v5r 全绿"理解为"v5r 全被覆盖"。
- **一处覆盖薄弱（现状）**：`audit-formal-sensitivity.mjs` 的探针写死 `preset:'v5'|'v4'…`，加 v5r 表项只增加环境簿记、**不产生 v5r 探针** ⇒ 若要让 v5r 的 formal 面被探，需**新增** `preset:'v5r'` 的探针（属"新增断言"，不是放宽）。
- **一处预存异常（非 v5r 引入）**：`audit-persona-sensitivity.mjs` 退出 0，但会打印 `FAIL vibe-math-v2/v3/v4: the persona's /vN list omits subcommand(s)…`；其汇总是 `16 probes detected the break, 0 problems / ALL PERSONA PROBES RED AS REQUIRED`。**在 v5r 出现前后完全相同** ⇒ 需单独立项（本章只记账）。

### 9.5 作业计数纪律

- **权威**：`node tests/run-tests.mjs --counts`（**作业计数**：`suites + probes`）。**文件计数**（`package.json#files` 里的 `tests/*.mjs`）是另一个口径，**两者不得混用**。
- 现状（本手册写作时）：`{"total":106,"suites":44,"probes":62}`；`--check` 的派生计数必须为 0 漂移（`scripts/update-doc-counts.mjs --check` ⇒ `files changed=0`）。
- **新增预设目录不改变作业数**（`run-tests.mjs` 只枚举 `tests/*.mjs`）；**新增测试文件**才会改变，必须同步文档里的 `TOTAL` 断言。

---

## 11. 迁移与兼容

### 11.1 状态文件迁移（现状机制）

| 机制 | 行号 | 规则 |
|---|---|---|
| 版本门 | `:837`（`schema version mismatch`） | `v` 不匹配 ⇒ **判为加载失败**（不猜、不半读） |
| 加载失败语义 | `:820`、`:1358` | `loadOk=false` ⇒ **拒绝任何提交**（绝不用空状态覆盖真实文件）；失败**必须**在 `status` 里可见（"绝不静默"，`:1252` 注释） |
| 未加载不得读 | `:897` | `V5_STATE_NOT_LOADED` |
| 新字段 | `:561-596`（fold 分支） | **可选 + 缺省有默认**；旧文件读进来后缺字段按默认处理（`meetingOpen` 的补丁合并 `:574` 是范例） |
| 迁移步骤 | — | 「**读旧 → 写新 → 保留旧备份**」；**必须**有守卫与具名红；**不得**原地改写用户文件而不备份 |
| 回滚 | — | 保留旧文件即可回滚（回滚＝把旧文件放回并让 `v` 匹配旧版本；**不要**做不可逆的原地迁移） |

### 11.2 目录/产物变更

- 新增目录：加入 `dirs` 列表（`:1992`）／`globalDirs`（`:1996`）；创建必须幂等（`mkdir(..., {recursive:true})`，`:1988`）。
- 新增产物：**不得**改变既有产物路径与格式（会议纪要 `Shared/Meetings/<id>.md` 追加式，向后兼容）；新分区（如"投票区"）**只增不改**，旧读者按"缺字段=旧版本"读（本章第 11.1 节）。
- 命名：一律走 `makeIdAllocator`（`:535`）或既有 `ID_PREFIX`（`:527`）；**禁止**自造 ID 规则（并发放号会重号）。

### 11.3 参数变更

1. 新参数进 `DEFAULT_PARAMS`（`:956-1057`）＋ `vibe_v5_set` 的校验（工具面 `:8477`）＋ `status` 观测面（`:7618-7647`）。
2. **参数是整表替换**（`:569`）：读取端必须给缺省；新增参数**不得**依赖"旧文件里没有就崩"。
3. 有钳制的参数：**只在读取处钳**（第 5 节 表）；**不得**静默改写用户写入的值（写入即所见）。
4. 参数文档（`docs/parameter-schema.md`，随包）与冻结键集守卫必须同步；`scripts/update-doc-counts.mjs --check` 必须 0。

### 11.4 兼容（现状已成立、必须保持）

- **`quorumMode` 双值**：`m-unanimous`（v5 默认）与 `all-unanimous`（v4 legacy，`:963`）；两条路径都在 `judgeVerdict` 里（`:4806-4811`）。**不得**静默改默认值，也不得删 legacy 分支（旧 institute 状态会读到它）。
- **DSH 支撑窗口不变**：以随包 `package.json` 的 `engines.dsh` 与 `dsh.testedVersion` 为准（本手册不复制其值，避免漂移）；**v5r 的改造不得抬高该窗口**。
- **v2/v3/v4/v5 不受影响**：v5r 的改造只发生在 `vibe-math-v5r/` 与其登记面；**共享件五份同步**才允许改共享件（第 2.2 节）。

### 11.5 迁移矩阵（逐键：可选性／缺省／旧文件缺键行为）

**总口径**：**读旧不迁移／不写回**（加载是**纯读**：缺键按缺省、**绝不**为兼容而回写或"补键"）；**回滚＝保留旧文件**（放回旧文件并让 `v` 匹配旧版本；**不做不可逆的原地迁移**）；新字段一律**可选且缺省**。**旧文件缺键时的行为**如下表（"旧文件"＝该键不存在的历史 `v5state.json`）：

| 耐久键 | 引入 | 可选性 | 缺省（读出端） | 旧文件（无此键）行为 |
|---|---|---|---|---|
| `chair` | S4 | 可选 | `null` | 读为"无代行"；代行记录缺失**不崩**，判定面**不读**代行（R5 不变） |
| `stallNotice` | S5 | 可选 | `null` | 视为"本静止片段**尚未提示过**" ⇒ "每片段最多一次"仍成立 |
| `grants` | S6 | 可选 | `[]` | **空台账 ⇒ 权限回落默认表**（未授权者行为**与改造前一致**） |
| `ballots` | S7 | 可选 | `[]` | 无板 ⇒ 无结题门、无待办；**不产生**支持性确认 |
| `chatSupplements` | S10 | 可选 | `[]` | 无私聊补记 ⇒ **私聊仍不可被引**（具名拒） |
| `secretaries` | S11 | 可选 | `[]` | 无记录人 ⇒ 纪要**明写"未指定：由框架自动落盘，无成员责任人"** |
| `resolutions` | S13 | 可选 | `[]` | 无决议 ⇒ `res:` 锚**悬空具名拒**（未落库不得被引） |
| `verdicts` | 既有（S2/S3/S9 扩展） | 可选 | `{}` | **整条替换**（`d.record`）⇒ 新字段（`minority[]`／`threshold`／`reconsiderations[]`／`previousRounds[]`／`sealed`）**随记录自带**，**无需迁移** |
| `solve` | 既有 | 可选 | `{}` | 同上（`d.clear` 的清空路径不变） |
| `meetingOpen` | 既有（F6） | 可选 | `null` | 旧文件无此键 ⇒ "未收束会议"不可见＝**旧行为**（新文件才有该标记） |
| `params` | 基座 | 可选 | `DEFAULT_PARAMS` 合并 | **参数是整表替换** ⇒ 读取端给缺省；新参数**不得**依赖"旧文件里没有就崩" |
| `paper`／`feedback` | 基座 | 可选 | `null`／`[]` | 函数式 fold ⇒ 缺键即"无该阶段/无反馈" |
| `project`／`institute`／`phase`／`problem`／`runId`／`lastProgressAt`／`artifactCount`／`officeRequestsDropped` | 基座 | 可选 | 逐键默认（见 第 3 节 状态表） | 缺键取默认；**未加载不得读**（`V5_STATE_NOT_LOADED`） |

**旧状态可读、会议可续跑**：`v` 匹配 ⇒ 直接加载（缺键按上表）；**加载失败**（`v` 不匹配／JSON 损坏／不可读）⇒ `loadOk=false` ⇒ **拒绝任何提交**（**绝不用空状态覆盖真实文件**）且 `status.persistence` 里**可见**；纪要文件**追加式** ⇒ 旧纪要可读且**不被重写**。
**可验证入口（实测）**：`vibe_v5_stop` → `vibe_v5_configure {institute:"<既有所>"}` 会走**"收养既有研究所"**路径（`instituteAt` **从盘上读**该所的状态文件）⇒ 这正是**从磁盘加载"旧形状"文件的入口**；加载**不补键**（文件里仍无 S4–S13 的新键）。**注意**：`stop` 会释放成员会话（收养后用**所办/院士**面调用）。

---

## 12. 动手清单（可执行 · 有序小步）

> **排序依据**：定稿 第 6 节「建议实现优先级」（1 沉默语义 → 2 到场与门槛未达 → 3 主持与救济 → 4 框架角色 → 5 少数意见与引用），叠加 SPEC 的五期与 C 的差距表。
> **格式**：改动点 ／ 守卫（新断言，须具名）／ 验收判据 ／ 风险。
> **⚠ 必须先做（不可与后续步骤并行）**：**S1 沉默与未表态语义**、**S2 到场与分母**、**S3 过程判定 vs 结束裁定**——三者互为前提，先做会把后面的守卫建立在错误计量上。

| # | 步骤 | 改动点 | 守卫（具名） | 验收判据 | 风险 |
|---|---|---|---|---|---|
| **S1** | **钉死"未表态／无异议"两个词**（R2/C1） | 面向代理文本与判定文案：禁止任何「沉默＝无异议/同意」表述；统一用"未表态" | 源码级：提示词与纪要模板**不得**含"沉默…无异议"字样；行为级：未表态**不提升**结论强度 | **已落地**（v5r）：静态门 R15（提示词不得把沉默折成同意、不得出现"沉默…无异议"）；行为场景 `r3-speech`（表决期发言不产生票；结束后仍只得未定论）＋ 全仓文本扫描 0 命中；判定对象里 `unreached/silent` 与 `votedCount` 严格分离 | 旧文案散落多处；**只改词不改语义**会更糟（须同改判定） |
| **S2** | **到场与分母语义**（D3） | `voters()`（`:1410`）与新"可应答"口径；`quorumMFrom`（`:1412`）；`judgeVerdict` 的 `P/m`（`:4786-4814`） | 行为级：未答者**不计分母**且**不算反对**；清点**必列**未答名单 | **已落地**（v5r）：静态门 R11（参与门：未表态阻塞结题）／R13（`unable` 退出分母且仍在册列出）；行为场景 `d3-silence`／`d3-unable`（同一票型在"全部应答"与"部分未答"下 m 正确；名单可见） | 会改变既有 m 值 ⇒ 旧 run 的结论强度会变；**必须**写入迁移与发布说明 |
| **S3** | **过程判定 vs 结束裁定分离**（R10） | `judgeVerdict` 的调用点（`:4927/4987/5035/5045`）、`verdictMaxRounds`（`:4972`）、会议收束路径（`finalizeMeeting` `:5553`） | 行为级：过程票**不得**触发停止/切换阶段；过程展示必须带「尚未生效」；停止仅来自**院士显式结束（R10-2a，`vibe_v5_end_verify`）**或**具名可撤销触界广播** | **已落地**：`aggregateOpinion()`（`provisional:true`）＋`judgeVerdict(vs, endedBy)` fail-safe（`round-complete`｜`academician`｜`bound:idle`｜`bound:round-cap`）；静态门 R10[1–7]＋R11–R16 **18/18**；行为场景 4 正例（`V5_SCENARIO`，各自独立工作区）＋4 反例**按名红**；mutants：G6 后全量 **57/57**；S4 加 6 族（各一个 `s4-*` 场景）⇒ **族总数 63** | 现存超时/轮数处置已改为**具名可撤销触界**；改动会触及纪要文案（须同步语料） |
| **S4** | **主持与救济**（D1/D2/R4/R5） | `vibe_v5_chair_proxy`（#45：仅院士；`scope` 唯一 `'close'`；`why` 必填；`…At`/`…Ms`/`until` 一律拒；同值幂等；代行不入 `voters()`）＋`vibe_v5_procedural_objection`（#46：在册成员；`why` 必填；`chairReplyPending:true` 可见；同值幂等）；`meeting.chair`／`meeting.objections[]` 入档（`EV.institute` fold 白名单新增 `chair`，缺键按 `undefined` 读） | 静态门 **R23–R28**（登记／仅院士＋`scope` 唯一＋入档／异议 pending 标记／主持不加权／代行不产生票权／幂等分支）**每门一个唯一点变异**；mutants **6 族**（院士门／scope／时键／pending／权重／幂等）各跑一个 `s4-*` 场景（各自独立工作区） | **已落地**：`--self-probe` **30/30**（六条 S4 按名红）；行为场景 **6/6 双路径绿**（`s4-proxy-acad`／`s4-proxy-denied`／`s4-proxy-time`／`s4-objection`／`s4-no-weight`／`s4-idempotent`；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 63/63 按名红**（双门禁内的**全量**跑：`PASS v5-institute-fixes.mutants.mjs`、`TOTAL 106 PASS 106 FAIL 0`；族总数 **57→63**）＋ 定向 **6/6**（14 s）；双门禁绿（`quick 23/23/0`、`e2e-v5-round2`(v5r) **534/0**、`selfdrive-v5`(v5r) **110/1**） | 权限收紧会拒绝既有 run（用兼容期）；`chair` 是**新增、可选**的耐久键（旧 `v5state.json` 缺该键不崩） |
| **S5** | **框架角色：只推荐不驱动**（R1/D10） | `schedulePass` 静止分支（v5r `:7445`）：删除 `startMeeting('office',{auto:true})`；新增一次性提示 `emitStallNotice()`／`stallWaitingList()`／`stallNoticeMs()`；耐久 `stallNotice={at,sinceAt,waiting[]}`（走 fold 白名单）；`stallAutoMeetingMs` 语义改「静止提示阈值」（**负值＝关闭**，须移出"非正即删"守卫） | 静态门 **R29–R33**（只提示不召集＋关闭开关可达／一次性键＋fold 白名单／三类可达等待来源＋cap 3／不得收束散会推进／不得代表态），**每条一个唯一点变异**；行为场景 **4 个 `s5-*`**（各自独立工作区）：`s5-stall-notice`（会议仍 `null`＋恰一条＋`report()` 有节＋负值关闭）／`s5-notice-once`（多轮不重发＋真实进展后第 2 条）／`s5-no-auto-close`（9 项快照不变）／`s5-waiting-graph`（被挡者/阻挡者 id） | **已落地**：`--self-probe` **35/35**（五条 S5 按名红）；场景 **4/4 双路径绿**（v5r **72/0**、**71/0**、**74/0**、**69/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **定向 7/7** ＋ **全量 70/70 按名红**（`TOTAL 106 PASS 106 FAIL 0`；族总数 **63→70**）；双门禁绿（`quick 23/23/0`、`e2e-v5-round2`(v5r) **534/0**、`selfdrive-v5`(v5r) **110/1**） | 去掉自动召集会让"卡住的 run"更依赖院士（与 S3 的触界口径配套）；`stallNotice` 是**新增、可选**耐久键（旧 `v5state.json` 缺键不崩） |
| **S6** | **临时授权（对象/范围/过期/回收）**（D1/D2/D6/D8） | `grants` 耐久台账（`EV.institute` fold 白名单；append-only）＋**单一谓词** `canDo` ＋ 六处权限点收敛（`assign`/`prioritize`/`nudge`/`end_verify`/`convene`/`board`）＋ **#47★ `vibe_v5_grant`／#48 `vibe_v5_revoke`**；`grant_scope` 事件型三档（`meeting`／`verify`／`once`）；`grantScope` 与 S4 的 `scope='close'` **不同域** | 静态门 **R34–R38**（台账＋fold 白名单＋两工具／单一谓词＋六处权限点＋可授四命令／票权不可授／D8 主体限制且**校验先于写台账**／**事件派生失效**），每条一个**唯一点变异**；行为场景 **6 个 `s6-*`**（各自独立工作区）：`s6-grant-ok`／`s6-not-granted`（基线不变）／`s6-scope-expire`（`once` 用一次失效、会议收束自动失效＋`expiredAt`）／`s6-revoke`（立即失效＋**广播**＋重复幂等）／`s6-no-vote-power`（`voters()`／`quorum`／票面全不变；临时工 ⇒ `V5_NOT_VOTER`）／`s6-d6-boundary`（`end_verify` 不可授＋裁定级判据文案；私密/引用面不在集合；三档；自带 `expires_at` ⇒ 拒＋「时间由框架设置」；**不可转授**） | **已落地**：`--self-probe` **40/40**（五条 S6 按名红）；场景 **6/6 双路径绿**（v5r **73/0**、**70/0**、**75/0**、**73/0**、**70/0**、**71/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 78/78 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1055067ms`；族总数 **70→78**）；双门禁绿（`quick 23/23/0`、`e2e-v5-round2`(v5r) **534/0**、`selfdrive-v5`(v5r) **110/1**） | 卡住的 run 更依赖院士显式动作（与 S4/S3 配套）；`grants` 是**新增、可选**耐久键（旧 `v5state.json` 缺键不崩）；**授权只改默认表这一层**，票权永不可授 |
| **S7** | **投票板「支持性确认」六项**（定稿 §7.1；D3/D4/R9/K13） | `ballots` 耐久台账（`EV.institute` fold 白名单；append-only）＋ **#49★ `vibe_v5_poll_open`／#50★ `vibe_v5_poll_vote`／#51 `vibe_v5_poll_close`**；规则快照六项；`status.poll` **只加子键**（`rules`/`min_votes_reached`/`settled`/`pending`/`ballot_id`/`secret`） | 静态门 **R39–R43**（板对象＋fold 白名单＋三工具＋六项快照／**两门槛双向分层**（`settled` 只读 `minVotes`＋`cast`；结题门不读 `minVotes`）／未达门槛⇒`unsettled` 且**不写**真值／**票权只认 `voters()`**＋`poll_vote` 不在可授集合＋投票路径不查授权／**无自动结算**＋`secret` 默认 `false`＋secret 板只给聚合），每条一个**唯一点变异**；行为场景 **6 个 `s7-*`**（各自独立工作区）：`s7-open-six`／`s7-single-multi`／`s7-min-votes`／`s7-two-thresholds`／`s7-abstain-revote`／`s7-secret-nonvoter` | **已落地**：`--self-probe` **45/45**（五条 S7 按名红）；`gates=96 failed=0`；场景 **6/6 双路径绿**（v5r **77/0**、**74/0**、**71/0**、**70/0**、**72/0**、**75/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 84/84 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1079371ms`；族总数 **78→84**）；双门禁绿（`quick 23/23/0`、`e2e-v5-round2`(v5r) **534/0**、`selfdrive-v5`(v5r) **110/1**） | 板是**新增、可选**耐久键（旧 `v5state.json` 缺键不崩）；`m` 受 `quorumCap` 封顶 ⇒ 引用时必须与 `min_votes` **分开**写；**不含 #26 落决议**；**不引入投票窗口** |
| **S8** | **票与发言时序分离**（R3/K12/B9） | **派生冻结**（存在 `open` 投票板即冻结；**不改会议阶段**）＋ 成员发言**两个入口**的门禁（`vibe_v5_say` ＋ 会议唤醒回执，均**具名拒绝**）＋ **举手保留不放行** ＋ `finalizeMeeting` 纪要**两区**（`## 发言区`／`## 投票区`，渲染 ＋ 结构化 `minutes{}`）＋ `status.meeting.speech_frozen`／`frozen_by`（**只读子键**） | 静态门 **R44–R48**（双入口具名拒绝＋**不删举手**／**被动**：不改阶段/不收束/无定时器／**不碰票**／纪要**两区双份**／门在**工具入口**且 `say()` 体干净），每门一个**唯一点变异**；行为场景 **6 个 `s8-*`**（各自独立工作区）：`s8-freeze-say`／`s8-system-not-blocked`／`s8-no-phase-change`／`s8-ballot-unaffected`／`s8-minutes-zones`／`s8-exception-path` | **已落地**：`--self-probe` **50/50**（五条 S8 按名红）；`gates=101 failed=0`；场景 **6/6 双路径绿**（v5r **78/0**、**71/0**、**72/0**、**70/0**、**73/0**、**72/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 90/90 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1115096ms`；族总数 **84→90**）；双门禁绿 | 冻结是**派生**的（S7 板**不改阶段**；S8 也不引入阶段/定时器）；"举手保留"由 **R44 静态**＋文案＋三点行为对照保证（直接咬 `hands[]` 属 harness 竞态 ⇒ backlog）；**"到点自动解除"**由 **R45 静态门**守；**不新增错误码**（复用 `V5_INVALID_ARGUMENT`） |
| **S9** | **少数意见入档＋复议触发**（D5/D5a/U3/B10） | 收束记录**盖章**（`minority[]`／`minorityCount`／`sealed`／`threshold{m,floor}`／`effectiveAt`；**唯一盖章点＝`putVerdict`**，四条收束路径＋"所办停止"全覆盖）＋ **#52 `vibe_v5_reconsider`**（判定对象＋板双目标；资格记录派生；门槛只升不降；append-only＋`supersededBy`）＋ `status.verify` **只读子键**（`minority_count`/`reconsiderable`/`last_reconsideration_at`/`threshold_m`）＋ `report()`「少数意见／复议记录」节 | 静态门 **R49–R54**（一等入档＋弃权/无法判断/未表态**不入**少数意见／资格记录派生＋**无胜方不得拒**／门槛**单调只升**＋`judgeVerdict` 收口／**不新增错误码**／不改阶段不收束无定时器／**不记名只给聚合**），每门一个**唯一点变异**；行为场景 **6 个 `s9-*`**（各自独立工作区）：`s9-minority-archive`／`s9-reconsider-winner-only`／`s9-reconsider-undecided`／`s9-threshold-only-up`／`s9-secret-no-identity`／`s9-audit-append-only` | **已落地**：`--self-probe` **56/56**（六条 S9 按名红）；`gates=107 failed=0`；场景 **6/6 双路径绿**（v5r **74/0**、**69/0**、**69/0**、**71/0**、**72/0**、**70/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 96/96 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1125825ms`；族总数 **90→96**）；双门禁绿 | 复议**不自动生效**（无窗口/无定时器；D10）；"无胜方"必须受理（D5a 硬约束）是**行为**断言；`reconsiderFloor` 缺省 `0` ⇒ 门槛下限＝`max(before, quorumCap)`；**不新增错误码/文件** |
| **S10** | **引用边界**（D6/G5） | `vibe_v5_say` 参数面扩展（`quote_ref`／`quote_refs`／`quote_excerpt`／`supplement_of`＋`why`）＋ **四类锚**（会议纪要文件锚（**耐久**）／未投递 `msg-N`（**写入时快照**）／`ballot:` 聚合／`res:` 跨会议）＋ **同域判定** ＋ **摘要＋指针（≤200＋`truncated`）** ＋ **条数上限 2／深度上限 3**（超条数拒、超深度**折叠**、环形**只标注**）＋ **私聊补记**（**本人**发起、只记事实 `chatSupplements`、**原私聊不进公开面**）＋ `status.chat` **只读子键** | 静态门 **R55–R60**（摘要＋指针不搬原文／同域＋`res:` 具名拒／私聊未补记拒＋**本人发起**＋只记事实／条数上限具名拒＋深度**折叠**／**每条锚分支都悬空拒**＋不记名只引聚合／**不新增错误码＋不驱动**），每条一个**唯一点变异**；行为场景 **6 个 `s10-*`**（各自独立工作区）：`s10-quote-same-meeting`／`s10-cross-meeting-refused`／`s10-dm-not-quotable`／`s10-quote-limits`／`s10-dangling-refused`／`s10-no-drive` | **已落地**：`--self-probe` **62/62**（六条 S10 按名红）；`gates=113 failed=0`；场景 **6/6 双路径绿**（v5r **72/0**、**70/0**、**72/0**、**74/0**、**72/0**、**74/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 102/102 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1155039ms`；族总数 **96→102**）；双门禁绿 | **已投递**的群聊消息**正文不再保留**（`EV.delivered` 封顶账本）⇒ 对其引用**悬空具名拒**（会议内锚不受影响）；**"同值引用投递／同值补记 ⇒ `deduped`" 已定不实现（清账）**：**append-only 留痕为正确语义** ✓；**入口亦接受 `quote_refs` 复数**（`#32★` 字段表仍写单数）；**不新增错误码/命令/文件**。**顺带加固 S8**：R44／R48 的 `registerTool('vibe_v5_say'…speechGate(` 窗口 `{0,400}` → `{0,2000}`＋**新增"门先于 `sayQuote`"的顺序断言**（因 S10 的长工具描述撑爆原窗口）⇒ **加固，不是放宽** |
| **S11** | **记录人/秘书角色**（GAPS 29：记录与主持分离） | 当次会议 `secretary` ＋ 耐久台账 `secretaries[]`（**fold 白名单**；append-only）＋ **#53 `vibe_v5_secretary`／#54 `vibe_v5_minutes`** ＋ 记录人条目 `meeting.recordEntries[]` ＋ **独立小节 `## 记录人补充`（两区之后）**＋结构化 `minutes{secretary,entries}` ＋ `status.meeting.secretary`／`record_entry_count`（**只读子键**） | 静态门 **R61–R66**（**不得自任**／台账 **fold 白名单＋append-only**／指定**仅院士**＋条目**院士∪记录人**且**不可授**／**独立小节在两区之后**＋条目**只追加**／**只报缺口不自动补全**／**不新增错误码＋不碰票权/阶段/定时器**），每条一个**唯一点变异**；行为场景 **6 个 `s11-*`**（各自独立工作区）：`s11-appoint`／`s11-self-refused`／`s11-only-academician`／`s11-record-entries`／`s11-zones-and-anchors`／`s11-revoke-idempotent` | **已落地**：`--self-probe` **68/68**（六条 S11 按名红）；`gates=119 failed=0`；场景 **6/6 双路径绿**（v5r **72/0**、**70/0**、**71/0**、**73/0**、**72/0**、**71/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 108/108 按名红** ＋ `skipped=[]`／`hangs=[]`（族总数 **102→108**）；双门禁绿（全量 **1694.0 s**／增量 **457.1 s**） | 记录人**当次会议绑定**（收束即失效）；**未指定 ⇒ `secretary=''`＋明写"无成员责任人"**（**绝不**把框架/院士写成责任人）；**不新增错误码/文件**。**顺带等价加固**：S8 的 **R47** 结构化写回断言改为**多行/前缀匹配**（`minutes{}` 因 S11 扩字段而换行；**"两区仍必须被写"这一事实不变**），并修复 **2 处断言消息**对 `undefined` 直接 `.slice` 的脆弱写法（`|| null`）——**加固非放宽**（S8 定向族仍 **6/6**） |
| **S12** | **会议分级**（D7/GAPS 22） | `meetingLevelOf`（`kind` **派生** ＋ `formalAgenda` **显式覆盖**）＋ **`truthWriteRefusal`（D7 唯一判定点）** ＋ `vibe_v5_meeting` 的 **`formal_agenda?:bool`**（会期内 ⇒ 改等级）＋ `status.meeting.level`（**只读子键**）＋ 纪要／`report()` 写明等级 | 静态门 **R67–R70**（等级**派生＋覆盖**／**简流程不得产出实体定论**（`entry_kind:'decision'` ⇒ 具名拒；拒绝与记录路径**不写 verdict/solve**）／**仅院士设定＋不可授**／**被动（不改阶段/票/收束）＋无定时器＋同值幂等＋不新增错误码**），每条一个**唯一点变异**；行为场景 **6 个 `s12-*`**（各自独立工作区）：`s12-level-derived`／`s12-light-no-truth`／`s12-acad-only`／`s12-idempotent`／`s12-report-visible`／`s12-no-drive` | **已落地**：`--self-probe` **72/72**（四条 S12 按名红）；`gates=123 failed=0`；场景 **6/6 双路径绿**（v5r **69/0**、**70/0**、**71/0**、**71/0**、**68/0**、**72/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 114/114 按名红** ＋ `skipped=[]`／`hangs=[]`（族总数 **108→114**）；双门禁绿（全量 **1687.7 s**／增量 **458.8 s**） | **不自动升降级**（等级由院士显式设定）；**简流程不落决议**（边界见 03 第 6 节 H18）；**不新增错误码/工具/文件**。**D-2（共享承载行）**：S12 改了 `finalizeMeeting` 的收束写回 ⇒ **同步等价更新**了 **S8 族⑤**（`minutes{}` 加 `level` 后 from 失配 ⇒ 否则 SKIP）、**S11 族④** 与 **S11 的 self-probe 变异锚**（记录人小节里插入了等级行）——**等价更新、非放宽**（S8／S11 定向族仍各 **6/6**） |
| **S13** | **决议实体与生效时点/检索**（G30/G2/D6） | 耐久 `resolutions[]`（**fold 白名单**；append-only）＋ **#55 `vibe_v5_result_record`／#56 `vibe_v5_resolutions`** ＋ 稳定标识 `res-<n>`（**框架分配**）＋ `effectiveAt`（**公告即生效**）＋ `retroactive`/`declaredAt`（**只声明留档**）＋ `status.resolutions`（**只读**）＋ `report()` 决议节 ＋ `res:` 锚**放开**（`res:<n>`／`res:latest`，**未落库⇒悬空拒**，`supersededBy` 携带） | 静态门 **R71–R75**（**标识由框架分配＋生效时点＝写入时刻＋追溯不改生效**／**简流程复用 S12 唯一判定点＋不写 verdicts/solve＋未落库不得引**／**权限＝院士∪记录人＋不可授＋幂等＋append-only**／**fold 白名单＋只读面＋不驱动＋不新增错误码**／**检索维度且拒绝时间过滤**），每条一个**唯一点变异**；行为场景 **6 个 `s13-*`** ＋ **`s10-last-resolution-quotable`**（各自独立工作区） | **已落地**：`--self-probe` **77/77**（五条 S13 按名红）；`gates=128 failed=0`；场景 **7/7 双路径绿**（v5r **72/0**、**69/0**、**67/0**、**69/0**、**68/0**、**72/0** ＋ **70/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 120/120 按名红** ＋ `skipped=[]`／`hangs=[]`（`TOTAL WALL TIME 1240988ms`；族总数 **114→120**）；双门禁绿（全量 **1711.2 s**／增量 **460.5 s**） | **`res:` 放开后**跨会议**只引上次决议**（纪要/发言仍拒）；**B-3**：决议 `supersededBy` **无写入面**（不得写成"取代已可用"）；`actions[]` **本片不写任务板**（K4 落）；**G3 未标已落地**。**D-2 等价更新**：**R56（S10 门）按新语义替换口径**（原"`res:` 一律拒＋引 #26 未实现" ⇒ 现"`res:latest`／`res:<n>`／台账查找／未落库悬空拒／`supersededBy`"）＝**非放宽**；**`s10-cross-meeting-refused` 的 `res:` 断言同步**；另修 **`sayQuote` 摘要取值**（`want‖got.excerpt‖got.text`） |
| **S14** | **迁移与守卫收尾** | 本章**第 11 节**的迁移/回滚路径（**11.5 迁移矩阵**）；文档计数与守卫索引 | 源码级：新字段**可选且缺省**；旧 `v5state.json` 可读且会议可续跑 | 旧状态读入成功；`--check` 0 漂移 | **已落地**：**产品 0 改动**（本片是**证据＋守卫＋文档**）；静态门 **R76–R78**（迁移矩阵↔代码／旧状态可读＋失败拒提交／守卫索引与文档计数）＋每门一个**唯一点变异** ⇒ `--self-probe` **80/80**；`gates=131 failed=0`；行为场景 **6 个 `s14-*`**（各自独立工作区，**全绿**：**73/0**、**69/0**、**71/0**、**69/0**、**69/0**、**69/0**；v5 路径显式 skip ＋ `failed=0`）；mutants **全量 126/126 按名红 ＋ 正控 70/70 ＋ `skipped=[]`／`hangs=[]`**（族 **120→126**）；双门禁绿（全量 **1729.7 s**／增量 **458.5 s**）。**风险**：新字段一律**可选且缺省** ✓；**机器模式（`--self-check`／`--counts`）不删除任何东西** ✓；**不做不可逆迁移／回滚＝保留旧文件** ✓；**已知缺口 B-3**（决议 `supersededBy` 无写入面）登记在 `_oneoff/review/V5R-DISCIPLINES.md`，`S14` 后清账 |
| **G6** | **成员自查＋自述**（查看开放全体在册成员；`vibe_v5_self_report` 仅本人可写） | 查看面权限、新增自述字段与历史（`members[me].selfReport`）、偏离标注 | 静态门：命令登记／权限（仅本人、非成员不可写）／留痕字段／**私聊不进入**／**时间由框架设置**；行为场景（独立工作区）：自己可改、他人不可改、总目的偏离标注、幂等 `deduped:true` | **已落地（6 场景双路径绿 ＋ 6 族全量 57/57 ＋ 双门禁绿）** | 不得据此自动推进流程（R1／D10）；查看面不得泄露私聊 |
| **S15** | **上次纪要确认＋行动项跟踪**（K4/GAPS 11–12） | `02` 第 2 节 K4；根 `DECISIONS` L32；根 `GAPS` L64–70；`03` #27／#30★／#40★；`03` 第 4.3 节（只读子键）／第 5.3 节（幂等与状态机）／**第 6 节 H20**；`07` 的 S15 节 | 源码级：确认**只改事实不改结论**（不写 `verdicts`/`solve`/`resolutions`）且**只追加**（绝不改写旧纪要）；行动项带 `origin`＋`due_in`＋**显式状态机**（`open`/`done`/`handover`）；只读面只加子键；**不驱动、无定时器** | **已落地**：`--self-probe` **84/84**（**R79–R82** 每门一个唯一点变异）；`gates=135 failed=0`；行为场景 **6 个 `s15-*`** 全绿（**70/0**、**72/0**、**70/0**、**72/0**、**70/0**、**70/0**；v5 路径显式 skip ＋ `passed=49 failed=0`）；mutants **全量 132/132 按名红 ＋ 正控 76/76 ＋ `skipped=[]`／`hangs=[]`**（族 **126→132**）；**0 新工具**（只扩展参数 `op`/`of`/`fact_fix`/`due_in`）⇒ 计数不变 | 把"确认"做成**改写旧纪要** ⇒ **S8 两区／S10 会议内锚回归**；确认**顺手落决议** ⇒ 事实被当结论（R6）；行动项**无稳定标识/期限** ⇒ 跨会话不可追踪（G2）；责任人离开时**自动关闭或静默丢弃** ⇒ **责任消失**（G3）；把"下次会议先检查"做成**程序动作** ⇒ 触 **R1/D10**；**已知不可达项**：**已被复议（`supersededBy`）的决议不得派活** —— `vibe_v5_assign` 拿不到决议 id 且**决议取代面无写入 API**（**B-3 诚实边界**）⇒ **本片未实现**（不得写成"已可用"）；日后若做 B-3(甲) ⇒ 同时加 `from_resolution?` 并在 `origin` 上校验 |

---

## 判定留痕（与定稿冲突之处一律**以定稿为准**）

> 本节记录"**现状 vs 定稿**"的实质不一致；**本章不改代码**，只记录并给出改造方向（对应 第 12 节 的步骤）。**凡有冲突 ⇒ 以定稿为准**。

| # | 冲突点 | 现状（行号） | 定稿 | 处置方向 |
|---|---|---|---|---|
| L1 | **分母语义** | `voters()` `:1410`＝全部 `active` 院士/研究员；`quorumMFrom` `:1412-1415` 用它算 m；`judgeVerdict` `:4788` 用 `P=|E|` | **D3**：到场＝在可表决集合内**且能应答**；**未答不计分母**、不算反对、名单必列 | 以定稿为准（**S2**） |
| L2 | **聚合分层** | 单一 `judgeVerdict` `:4782-4822` 同时服务"意见收敛"与"程序性表决"；`undecided` 携带 `mean` 并落纪要 `:5045/5120/5153` | **R9/C3**：意见收敛可用平均；**程序性表决未达门槛一律「未决」**，不得用平均替代 | **已改造（S3/S7）**：过程展示＝`provisional:true` 且**不驱动流程**（S3）；**选项式投票板是独立对象**（S7）：**只记录**本次支持性确认、**不写 `verdicts`/`solve`**、**不得**与 `judgeVerdict` 的"意见收敛"互相折算（R9 分层）——见 第 12 节 S7／`03` 第 6 节 H13 |
| L3 | **过程判定驱动流程** | 轮数到顶即处置 `:4972`；超时放弃表决 `:4927`；过程票与 `mean` 展示 `:5120/5153` | **R10**：过程票数**只是描述**，不得停止/收束/切换阶段；过程展示**必须**标「尚未生效」；停止只来自院士或**具名触界** | 以定稿为准（**S3**） |
| L4 | **"弃权"语义** | `abstain` 实为**中间概率估计**（`p∉{0,1}`）计数 `:4790/4799/4802`；**没有**显式弃权通道 | **D3**：弃权是**明确表态**，计入已投但不计选项；与缺席分开记录 | **已改造（S2/S7）**：显式**弃权**已落地（`vibe_v5_verdict` 的 `abstain`；S2）；投票板的弃权**复用同一语义**（由 **#50** 的 `abstain` 承载：计入已投、**不计选项**；S7）——见 第 12 节 S7 |
| L5 | **框架自动驱动** | `stallAutoMeetingMs`（`:974`）→ 静止**自动召集会议**（`:7041`） | **R1/D10**：框架**只建议**，绝不自动推进/自动散会 | **已改造（S5）**：自动召集移出自动路径，改为**每片段最多一次**的静止提示（列「谁在等谁」）；`stallAutoMeetingMs` 语义改「静止提示阈值」（**负值＝关闭**）——见 第 12 节 S5／`07` 的 S5 节／`03` 第 6 节 H11 |
| L6 | **时间两类混用** | 全部时长＝墙钟差值（`:2922`、`:3234`、`:3455`）；无单调源 | 定稿要求**墙钟与单调时长不得混用** | 以定稿为准（**第 8.4 节 第 1 条**） |
| L7 | **临时授权缺位** | 权限＝静态角色判断（`:4572`/`:6096`/`:5176`），无授权对象/范围/过期 | **D1/D2/D6/D8**：权限分场合且**可临时授予**，可回收 | **已改造（S6）**：权限判定收敛为单一谓词＋耐久台账；**仅院士**可授/撤、被授权者**仅在册成员**、可授集合有界四命令、**事件型自动失效**、**撤销须写事件并广播**、**不产生票权**、**不可转授** —— 见 第 12 节 S6／`07` 的 S6 节／`03` 第 3 节 #47★／#48 与 第 6 节 H12 |
| L8 | **少数意见与复议缺位** | 只有 `bTrue/bFalse/abstain/mean`（`:4802`） | **D5**：少数意见**强制入档**并作复议触发（当初胜方之一＋同一会议） | **已改造（S9）**：收束记录**盖章** `minority[]`（**弃权/无法判断/未表态不入**；`report()` 逐人渲染）；**#52 复议**（资格记录派生：胜方之一／**无胜方⇒任一参与者**；**门槛只升不降**；同轮一次；**append-only＋`supersededBy`**）；**不记名只回显事实** —— 见 第 12 节 S9／`03` 第 6 节 **H15**／`07` 的 S9 节 |
| L9 | **票/发言未做时序分离** | 无表决期禁言机制 | **R3**：票与发言分离 | **已改造（S8）**：**派生冻结**（存在 `open` 板 ⇒ 成员发言两个入口**具名拒绝**；举手保留不放行；系统消息不受影响；例外＝D2 异议＋院士）；纪要**两区**（发言区/投票区，渲染 ＋ `minutes{}`）；**不改阶段、不收束、无定时器** —— 见 第 12 节 S8／`03` 第 6 节 **H14**／`07` 的 S8 节 |
| L10 | **无决议实体/生效/检索** | 只有纪要与 `verdicts{}` | **G30/G2/D7**：决议须有稳定标识与生效时点、可检索 | **已改造（S13）**：`resolutions[]`（fold 白名单＋append-only）＋ **#55/#56**；**公告即生效**（`effectiveAt === at`）＋ **`res-<n>` 框架分配** ＋ **追溯只声明不改生效** ＋ **未落库不得引** ＋ **`res:` 跨会议只引上次决议** ＋ **简流程复用 S12 唯一判定点** —— 见 第 12 节 S13／`03` 第 6 节 **H19**／`07` 的 S13 节。**已知缺口 B-3**：`supersededBy` 无写入面（`S14` 后清账） |

**已一致（无需改造，但需守卫防回流）**：① **临时工永无表决权**（`voters()` `:1410`、`V5_NOT_VOTER` `:5176`）＝D8；② **主持不加权**（判定按人头，无权重字段）＝R5；③ **会议不因沉默而截止**（`:979` 注释）＝R2 的一半；④ **`Verified/` 只由判定结果写入**（`:4819-4820`）＝R6/D9；⑤ **v5r 与 v5 提示词逐字节相同**（仅身份串不同）＝改造前的基线。

---

## 附录 · 本章的来源与"待确认"清单

**来源（只读）**：`vibe-math-v5r/` 的实际代码与预设声明（「§」 顶部已列哈希）；`MEETING-PLATFORM-RULINGS.md`（设计定稿）、`MEETING-PLATFORM-PHILOSOPHY.md`（章程）、`MEETING-PLATFORM-SPEC.md`（统一命名/差距/分期）、`MEETING-PLATFORM-C-landing.md`（现状盘点/差距表/守卫/迁移）、`MEETING-PLATFORM-DECISIONS.md`、`MEETING-PLATFORM-GAPS.md`（裁决与查漏）——以上均与本手册**同目录随包发布**（`vibe-math-v5r/`）。**`LEGACY-v5-实现方案（仅供参考）.md` 仅作参考**（不是 v5r 规格；冲突以定稿为准）。

**同系列章节**：`00-README`（导读）、`01-philosophy`（章程）、`02-rulings`（设计定稿）、`03-interface-contract`（对外契约）、`04-flows-and-protocols`、`05-voting`、`06-expansion-mechanisms`、`07-oversight-and-time`、`08-landing-plan`、`10-guards-and-acceptance`、`11-appendix-drafts`、`12-traceability`。本章（**09**）是**实现侧**的权威；与 03 的差异按 第 6.4 节 处理。

**待确认（本章不猜）**：
1. 会议**触界**是否已有"具名广播"（`finalizeMeeting` `:5553` 会写纪要，但是否**具名说明因触界**未逐字核对）。
2. `abstain` 字段在**回执/观测面**的对外名称（本章按实现称"中间概率估计"，定稿称"弃权"——**术语统一**属定稿 第 6 节 "留给日后"第 3 条）。
3. v5 是否有 **`.current` 当前项目标记**（v4 有；v5r 全库检索无命中 ⇒ 视为**不适用**，但未与 v5 逐字比对）。
4. 共享件 `MATH_*` 的**逐条触发细节**（本章给出首站点行号；完整分支语义以 `math-computation.js` 为准，**03 章**应与之一致）。
5. 新增会议能力落地后，**语料**是否要为 v5r 生成（现状：无 v5r 语料，**有意留白**）。
