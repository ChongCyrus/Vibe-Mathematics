# Lean 形式化验证（v2 / v3 / v4 / v5 共用设计）

> 本文件是四个架构**共同遵守的契约**。每个预设都在自己的单文件插件里独立实现同一套语义
> （四个预设之间零依赖、零共享模块，这是本项目的既有约定）。
> 参数、路径、工具名、提示词语义、门禁规则、索引格式都必须与本文件一致。

---

**模拟必须封堵新代码能走的每一条路**：解析顺序新增一个阶段时，任何“模拟缺失”的测试必须同时否认该阶段 —— 否则在**装了该引擎的机器**上，“PATH 不可解析”的模拟会经已知安装位置**成功**，断言随之失效（`formal-verify-v4` 就是这样变红的）。同类的沉默失败还有一个：变异用例的 `to` 侧若丢掉 `from` 侧的前导换行，变异体会把两条语句接成一行 ⇒ **语法错误** ⇒ 子进程在 import 阶段崩溃（没有子进程输出诊断时完全看不见）。

## Lean 解析顺序与来源（task-6，2.7.4 起）

`vibe_v4_lean_run` 解析 Lean 可执行文件时**不再只看宿主 PATH**（旧行为：宿主 PATH 与会话 PATH 不同时，
明明装了 Lean 却报 `LEAN_NOT_FOUND`；与数学引擎自 2.7.2 起的"已知安装目录"阶段不对称）。顺序：

1. **显式** `leanCommand`（且不等于默认 `lean`）⇒ **只用它**，解析不到就失败，**绝不猜**；
2. 宿主 `subprocess.resolveExecutable`（PATH）；
3. **已知安装位置**：`%ELAN_HOME%\bin`、`%USERPROFILE%\.elan\bin`、`%LOCALAPPDATA%\Programs\**`
   （POSIX：`~/.elan/bin`、`~/.local/bin`、`/usr/local/bin`）。

**可观测**：结果携带 `leanFoundVia: 'explicit' | 'path' | 'known-install'`（构建上下文同样携带）；
解析失败时 `LEAN_NOT_FOUND` 的 `next.tried` **点名已探测过的具体路径**，而不是只说 "not found on PATH"。

**可测试缝**：解析器以 `export { resolveKnownTool }` 暴露（与共享模块导出 `mathInstallRoots` 同理），
`tests/audit-engine-faces.mjs` 用假 `subprocess` + 临时 `ELAN_HOME` 直接断言四种情形
（`known-install` / `path` / `explicit` / 显式但不可解析 ⇒ `via:null` 且 `tried` 非空）。

## 0. 为什么要有它

多代理交叉验证的本质是**共识**，不是**证明**：m 个代理一致认为"这是对的"，
既不能排除共同误解，也不能排除共同漏掉的情形。Lean 形式化把"我认为"换成"机器已核对"：
一旦形式化代码通过，剩下的**唯一**不确定项就缩小为

> **Lean 代码里的定义、对象、条件、假设、结论，是否与命题原文完全一致？**

这个问题人（和代理）是能有效审查的，而"这个证明对不对"交给内核。于是验证工作的性质发生变化：

| | 原验证工作 | 启用形式化后的验证工作 |
|---|---|---|
| 审查对象 | 命题本身（推导是否正确） | **忠实性**：Lean 代码 ↔ 命题原文是否一致 |
| 结论强度 | 共识（可能共同出错） | 严格（内核已检查），前提是忠实性成立 |
| 副产品 | 无 | 可复用的 Lean 定义/引理库 |

---

## 1. 参数（四个架构同名同语义）

| 参数 | 取值 | 默认 | 含义 |
|---|---|---|---|
| `formalVerify` | `'off'` \| `'encourage'` \| `'require'` | `'off'` | 三档开关，见 §2（**只**表示"验证时的要求强度"） |
| `leanCommand` | 字符串 | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | 字符串数组 | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | 正整数 | `120000` | 单次 Lean 运行的超时上限（异步作业同样用它作单次预算） |
| `leanAsync` | 布尔 | `true` | `true` = 编译走**后台队列**（`lean_run` / `lean_archive{run:true}` 入队后立即返回 `{async:{jobId,state:'queued'}}`）；`false` = **完全同步 await**（旧路径逐字保留）。只有 `settled(ok)` 才可能置 `passed`，见 §7.3 |
| `leanJobsMaxParallel` | 正整数 | `1` | 后台编译并发上限（默认 1 = 串行；调大即并行，v2/v3 把合法范围夹在 1–8） |
| `leanInitiative` | `'off'` \| `'normal'` \| `'eager'` | `'normal'` | **日常流程中的形式化主动性**：`off` 不主动（只在验证提示词里按 `formalVerify` 的要求做）/ `normal` 顺手把有价值且可能复用的东西形式化 / `eager` 更主动。**与 `formalVerify` 是两件事**：它不改变定论门禁 |
| `leanSearchPaths` | 字符串数组 | `[]` | 额外编译搜索根：先注入它们、再注入自动的 `<VibeMath 根>`（去重、保持用户给的顺序）；`leanArgs` 里已显式给 `--search-path`/`-R`/`--root` 时**不注入任何东西**，见 §7.6 |

- 非法值一律**回退到默认**（`formalVerify` 非三档之一 → `'off'`；`leanInitiative` 非三档之一 → `'normal'`；
  `leanTimeoutMs` 非正 → 默认；`leanJobsMaxParallel` < 1 → 1；`leanSearchPaths` 非数组 → `[]` 并去空串/去重）。
- **`leanAsync` 必须显式布尔归一化**：字符串 `'false'` 不得被当作真值放行（它是"关掉后台队列"的开关，
  错误归一化会让用户以为已同步执行、实际仍在排队）。
- 参数必须出现在该架构既有的参数体系里：v2/v3 的 `vibe_math_set_params`、v4 的 `vibe_v4_set`、v5 的 `vibe_v5_set`，
  以及各自的控制面（v2/v3：`vibe_math_setup` / `vibe_math_template` / `vibe_math_status`；v4：`vibe_v4_configure` / `vibe_v4_status`；
  v5：`vibe_v5_configure` / `vibe_v5_status` —— **v4/v5 没有 `*_setup`/`*_template`**），外加 `status`/`report` 的可读参数表。
- **模式是动态的**，可以在运行中切换：所有与模式相关的提示词文本都必须在**构造提示词的那一刻**
  由 `params.formalVerify` 现算，**不得**写进"入职时冻结"的人格/章程快照
  （否则切换模式后成员读到的仍是旧指令）。

---

## 2. 三档语义

### `off`（默认）—— 不额外进行任何要求

- **成员提示词**里**不出现**任何 Lean 相关内容（**默认 `leanInitiative:'normal'` 时**）；验证流程、门禁、归档全部不变，
  也不写入任何形式化状态。这是真正的"无操作"，四套都有断言与探针守着。
- **两个轴必须分清（v5 统一口径）**：`formalVerify` 管**验证阶段**的要求强度，`leanInitiative` 管**日常日线**；
  `formalVerify:'off'` 只关掉前者——如果用户显式设置 `leanInitiative:'eager'`，日线**仍然注入**（"定论不额外要求，
  但日常鼓励形式化"是合法组合，见 §6.2 与 `tests/formal-verify-vN` 的 `off+eager` 探针）。`leanInitiative:'off'`
  则连日线都不注入：两种轴都关掉时，提示词里才真的一个字都不出现。
- **回执通道在 `off` 档必须失效**：`formal` 字段本来就不在 `off` 档的回执契约里，所以一个残留/幻觉/被
  引用的 `formal` 回执**不得**创建形式化记录（否则 `off` 就不是无操作了）。四个架构都必须在这个入口
  上加 `formalOn()` 守卫。
- 五个 Lean 工具（run / archive / lib / read / job）**仍然注册且可用**（注册是静态的，与既有 `ctx.effect` 纪律一致）；`off` 只是不主动
  向成员宣讲它们。代理/人主动调用时照常工作——**工具调用是刻意行为，回执字段不是**，这条区别就是
  上一条守卫的理由。
- **主代理的 persona 是静态的，不受档位影响**：它**必须始终**文档化这五个工具与八个参数
  （否则用户在 `off` 档根本发现不了这个开关，也就无法打开它）。"成员提示词里没有 Lean 文字"与
  "persona 里写着这个能力"**不矛盾**，两者都由测试守着（前者见各 `formal-verify-vN` 的 `off` 小节，
  后者见 `audit-persona-surface.test.mjs`）。

### `encourage` —— 鼓励但不强制

注入到提示词里的要求：

1. **验证时**：先判断该对象的**实现难度**；若能在可接受的工作量内形式化，优先写 Lean 代码并执行。
   一旦 Lean 通过，**你唯一需要确认的就是忠实性**（定义/对象/条件/假设/结论是否与命题原文一致），
   请把注意力放在这种逐条核对上，而不是重新做一遍推导。
2. **平时工作时**：把常用或可能复用的对象/假设/新定义随手用 Lean 形式化定义，
   归档到全局可复用库，方便后续证明直接复用。
3. 若判断不值得/无法形式化，可以不做——但**鼓励**在回执里写明难度判断（会记入索引）。

**不设门禁**：即使没有任何 Lean 产物，验证照常收口（与 `off` 相同的结论）。

### `require` —— 强制上述要求

与 `encourage` 相同的注入文本，但语气为"必须"，并且**加门禁**：

> 一个对象要被判定为 **真**（严格证明）或 **假**（严格反驳），必须满足
> `formal.status ∈ {'passed', 'blocked'}`；
> 否则本次裁定**不生效**——框架把它记为 `undecided`（原因 `formal-required`），
> 写入「形式化待办」，并在群聊公告；对象留在原库，可形式化后再次提议。

- `passed`：有 Lean 产物且最近一次运行 `exitCode === 0`；
- `blocked`：代理给出了**显式的难度判断/阻塞原因**（`note` 非空）。
  **这就是"根据实现难度决定是否通过 Lean"的落点**：决定权在代理，但决定必须显式、可审计，
  不允许静默跳过。
- 门禁是**兜底**而非唯一手段：`require` 模式下的验证提示词会先告知表决者
  "定论前需要 `passed` 或 `blocked`，请先做形式化或记录阻塞原因"，所以正常情况下不会触发门禁。

**为什么用 `undecided` 而不是"卡住不动"**：卡住会让研究所永久停在一个对象上；
记为 `undecided` + 待办既保住了"未经形式化不得称为严格结论"，又保证了系统可继续推进
（与既有"未达门槛留库附平均概率"的设计一致）。

---

## 3. 路径布局

```
<VibeMath 根>/
├─ Formal/                                  # 全局可复用 Lean 库（跨项目）
│   ├─ Lib/<name>.lean                      # 可复用定义/对象/假设（def / structure / notation）
│   ├─ Lib/Index.md                         # 名称 → 文件 → 类别 → 依赖（import）→ 摘要
│   ├─ Proved/<name>.lean                   # 已成立的 Lean 命题/引理（机器已核对）
│   └─ Proved/Index.md                      # 名称 → 文件 → 陈述 → 依赖
└─ Projects/<项目>/                          # （v5 为 Projects/<项目>/Institutes/<所>/）
    ├─ Formal/
    │   ├─ <对象id>.lean                     # 该对象的形式化工作文件
    │   ├─ Index.md                          # 对象 → 状态 → 文件 → 归档证明 → 运行结果 → 难度判断
    │   ├─ Jobs/<jobId>.json                 # 后台编译作业的镜像（崩溃恢复 + lean_lib.jobs 都读它）
    │   └─ TODO.md                           # require 模式下的「形式化待办」
    └─ Verified/
        ├─ <原有定论卡片>
        └─ Lean/<对象id>.lean                # ★ 归档证明：该定论对象对应的形式化代码
```

- **`Formal/Jobs/<jobId>.json` 是异步队列的**唯一持久镜像**：内存队列是权威，但这个文件让崩溃/重启后
  的恢复、`<prefix>lean_lib` 的 `jobs` 字段与 `<prefix>lean_job` 三处看到同一份事实。作业终态为
  `settled` / `failed` / `timeout` / `interrupted` 四者之一。

- **归档证明放在 `Verified/Lean/<id>.lean`**：它和定论卡片同处 `Verified/`，
  一眼可见"这条结论的形式化证明在哪"。
- **可复用的东西放全局 `Formal/Lib` 与 `Formal/Proved`**：跨项目复用是这套设计的核心收益。
- 文件 id 一律过**该架构既有的 id 安全化函数**（去分隔符、去 `..`），防止路径穿越。
- `lean_run` 只接受位于 `<VibeMath 根>` 之内的路径；越界一律拒绝（`V5_INVALID_ARGUMENT` 或该架构对应错误）。

---

## 4. 对象的形式化状态（`formal`）

每个可验证对象（命题/问题/子问题/方法卡）都带一个形式化记录：

```jsonc
{
  "status": "none" | "attempted" | "passed" | "blocked",
  "file": "Formal/p-1.lean",        // 工作文件（可为空）
  "proof": "Verified/Lean/p-1.lean",// 归档证明（仅 passed）
  "decision": "used" | "blocked" | "defect", // 代理的显式判断（defect 见 §4.1）
  "note": "…",                      // blocked / defect 时必填：难度判断 / 阻塞原因 / 具体偏差
  "run": { "at": 0, "ok": true, "exitCode": 0, "ms": 0, "stdoutTail": "", "stderrTail": "" },
  "updatedAt": 0
}
```

状态迁移：

| 事件 | 迁移 |
|---|---|
| `lean_run` 成功 | `none`/`attempted` → `attempted`（记录运行结果）；**已是 `passed`/`blocked` 的保持原状**——一次随手运行不得撤销已成立的证明 |
| `lean_run` 失败 | `none` → `attempted`（记录失败输出，供代理修复）；同样**不降级** `passed`/`blocked` |
| `lean_archive{kinds:'proof', target, from|content}` + 该文件最近一次运行 `ok` | → `passed`，写 `Verified/Lean/<id>.lean` |
| `lean_archive{kinds:'proof', …}` + 该文件最近一次运行**失败** | → `attempted`，`proof` 清空，并**撤回**旧的 `Verified/Lean/<id>.lean`（工作文件刚被新代码覆盖，旧证明已不对应任何代码；§4.1 的删除→复核→覆写同一条路） |
| `lean_archive{kinds:'blocked', target, note}` | → `blocked`（`note` 必填） |
| 回执里 `formal:{target, decision:'blocked', note}` | → `blocked`（`note` 必填） |
| **回执里 `formal:{target, decision:'defect', note}`** | **撤回 `passed`：→ `attempted`，清空 `proof`、删除 `Verified/Lean/<id>.lean`、把 `note` 写入记录与 `Formal/TODO.md`、公告**（`note` 必填） |
| 回执里 `formal:{target, decision:'used', file}` | → `attempted`（记录文件）；**若该对象已是 `passed`/`blocked` 则保持原状**——一次"这一轮碰了形式化"的 `used` 回执**不得**撤销已成立的证明（`proof` 指针与归档文件都不变）。撤销只有 `defect` 一条路（§4.1）。 |

> **记录与归档文件同生共死（框架侧），但外部文件操作不会自动改记录**：框架自己撤回证明时，记录降级与
> 文件撤回是**同一次操作**（§4.1 的删除 → 复核 → 覆写）。反过来，**外部**（人、别的工具、另一个项目）
> 删掉 `Verified/Lean/<id>.lean` **不会**自动改记录——`passed` 是状态文件里的权威状态，门禁查询是只读的，
> 不会在每次取记录时做文件存在性探测（那会把门禁变成 fs I/O，并在网络盘/权限异常时引入新的失败模式）。
> 因此人工动过文件后请一并修正记录，或重新 `lean_archive`；否则门禁仍按 `passed` 放行，忠实性提示词会
> 打印一个已不存在的路径。**v2 的 id 映射同样如此**：记录里持久化的 `objectId` 是权威锚点，但它必须
> **自洽**（不以 `r-` 开头），否则会被忽略并回退到后缀解析——状态文件是可编辑的，里面的"权威值"要先校验。

### 4.1 `defect`：忠实性缺陷**不是**"命题为假"

`passed` 只保证"这段 Lean 代码通过了内核检查"，**不保证它说的就是命题想说的**。当表决者逐条核对后
发现 Lean 代码与命题原文不一致（写窄了 / 写宽了 / 换了对象 / 漏了条件…），那是**形式化不合格**，
不是命题被证伪。两种混淆的后果都很严重：

- 若让表决者"发现偏差 → 投 0"，框架记下的是"**该命题为假**"；在 v5 的全 0 一致规则下，
  一个写错的形式化会直接把命题写进 `Verified/` 并标注**假**——用来求真更严格的机制，
  反而**伪造出一个错误的否定结论**。
- 若只把偏差记成 `blocked`，门禁会**放行**（`blocked` 本就允许定论），等于带着一个坏形式化去定论。

因此 `defect` 是独立的一档，语义固定为：

1. **表决者**：不得投 `1` 或 `0`；给一个严格介于 0 与 1 之间的值（记为弃权）并在 `Reason` 里写清偏差；
   同时用回执 `formal:{decision:'defect', note:'<具体偏差>'}` 记录（`note` 必填）。
2. **框架**：把该对象的形式化记录**降级为 `attempted`**（无论此前是 `passed` 还是 `blocked`——都让位于
   "形式化不合格，需重做"）、清空 `proof`、删除 `Verified/Lean/<id>.lean`
   （工作文件 `Formal/<id>.lean` 保留，代码不丢）、`note` 记入记录与 `Formal/TODO.md`、公告。
3. **`require` 档**：降级后 `formalGateOk` 为假，本次裁定**不定论**，对象进入「形式化待办」——
   修正形式化并重新跑通后再投票。这正是"形式化不合格 ⇒ 重做"，而不是"命题为假"。
   `encourage` 档没有门禁，框架**仍然**撤回证明并记入待办，但**不得在提示词里承诺一个它无法强制的
   "不定论"**；那里靠表决者自己的弃权（§6.1 第 ① 条）使表决无法得出布尔一致结论。
4. **唯一可以投 0 的情形**：表决者**独立于这份 Lean 代码**也能确定命题为假（并能给出独立理由）。
   此时 `Reason` 必须写清独立理由，不得以"Lean 与命题不一致"作为投 0 的依据。

---

## 5. 工具（每个架构五个，前缀各自不同）

前缀：v2/v3 → `vibe_math_`；v4 → `vibe_v4_`；v5 → `vibe_v5_`。

### 5.1 `<prefix>lean_run`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | string | ✅ | 相对 `<VibeMath 根>` 或项目根的 `.lean` 路径 |
| `target` | string | | 关联对象 id（给了就更新该对象的运行记录） |
| `timeout_ms` | integer | | 覆盖 `leanTimeoutMs` |

- `leanAsync=false`（同步路径）返回：`{ok, exitCode, signal, ms, command, stdout, stderr, file}`；
  找不到工具链返回 `{ok:false, code:'LEAN_NOT_FOUND', error}`；超时返回 `{ok:false, code:'LEAN_TIMEOUT'}`。
- `leanAsync=true`（默认）**不编译**：入队后立即返回 `{ok:true, file, async:{jobId,state:'queued'}, hint}`，
  结果在下一轮提示的【形式化结果】行公告，或用 §5.5 的 `lean_job` / `lean_lib` 的 `jobs` 字段查询。
- **绝不抛异常到调度循环**——任何失败都要变成可读结果并记录。

### 5.2 `<prefix>lean_archive`

一个工具覆盖三种归档（`kind` 区分）：

| `kind` | 必填 | 行为 |
|---|---|---|
| `'def'` / `'lemma'` | `name`, `content` 或 `from` | 写入全局 `Formal/Lib/<name>.lean`（def）或 `Formal/Proved/<name>.lean`（lemma），重建对应 `Index.md`；可选 `run:true` 先跑一次再归档 |
| `'proof'` | `target`, `content` 或 `from` | 写入 `Formal/<target>.lean`；**只有 `settled(ok)`**（§7.3）才同时写 `Verified/Lean/<target>.lean` 并把对象标为 `passed`，否则记 `attempted` |
| `'blocked'` | `target`, `note` | 记录显式难度判断/阻塞原因（`note` 空 → 拒绝），对象标为 `blocked` |

- **内容哈希去重**：同 `content`（规范化后哈希相同）且**构建上下文一致**的 `def`/`lemma`/`proof` 不再重写、
  不再重编译，直接返回 `{ok:true, deduped:true, …}`（对象已是 `passed` 时也返回 `passed`）。去重的判据与
  §7.3 的 `settled(ok)` 同源；内容变了就正常走新作业。
- `leanAsync=true` 时 `run:true`（或 `kind='lemma'` 的隐式编译）同样**入队即返回**；文件已写、编译未完成，
  所以返回里明确要求"落地为通过之前不得把它当作可复用定义"。

### 5.3 `<prefix>lean_lib`

无必填参数。**扫描并重建**三处索引（项目 `Formal/Index.md`、全局 `Lib/Index.md`、`Proved/Index.md`），
返回可复用库清单（供代理写新定义前先查重、直接复用）。`refresh:false` 时只读不重建。
`leanAsync=true` 时额外返回 `async` 与 `jobs`（每个作业的 state/rel/target/attempts/路径），
以及 `paths.searchPath`（框架注入的模块根）。

### 5.4 `<prefix>lean_read`

只读地取回**一个已归档** Lean 文件的原文（供"逐字复用"）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 归档文件名（可省略 `.lean`），经该架构的 id 安全化 |
| `kind` | `'auto'` \| `'lib'` \| `'proved'` | | 默认 `auto`（先 Lib 再 Proved） |

返回 `{ok, name, file, kind, sha256, bytes, text, truncated}`；**只允许** `<VibeMath 根>/Formal/{Lib,Proved}`
之内的文件（越界拒绝），正文上限 64KB（超出则 `truncated:true`）。这是"先查库再写新定义"的闭环：
`lean_lib` 告诉你有什么，`lean_read` 给你原文，然后 `import` 或逐字复制。

### 5.5 `<prefix>lean_job`

只读地查看后台编译作业：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `jobId` | string | | 省略 = 本会话作业清单；给了 = 该作业的 state/exitCode/回执路径/归档路径 |
| `waitMs` | integer | | >0 时最多等这么多毫秒（轮询队列，**不阻塞心跳**），超时返回当前 state |

`leanAsync=false`（同步档）时它仍然可用（此时清单里只会有同步运行留下的记录），返回体里带
`async:false` 与 `maxParallel`，便于成员判断当前模式。**只有 `state='settled'` 且 `exitCode=0`
（且内容哈希/构建上下文一致）才算通过**；`queued`/`running` 一律还不算，`failed`/`timeout`/`interrupted`
都不算。

---

## 6. 提示词注入（在构造提示词时现算）

> **硬要求（四套一致，逐字级别的约束）**
> 1. **工具名一律写全称**（`<prefix>lean_run` / `<prefix>lean_archive` / `<prefix>lean_lib` /
>    `<prefix>lean_read` / `<prefix>lean_job`）。
>    注入文本里**不得**出现 `lean_run` / `lean_archive` / `lean_lib` / `lean_read` / `lean_job` 这类缩写——那不是注册名，
>    代理照抄会调用一个不存在的工具（工具自己返回的 `hint` 字段同样算注入文本）。
> 2. **回执字段名必须与该架构真实契约一致**：v2/v3 的评审值字段是 `Result`，v4/v5 是 `verdict`。
>    写错字段名 = 那一票被静默丢弃。
> 3. **归档可复用定义/引理前必须先跑通**：`<prefix>lean_archive` 支持 `run:true`，
>    或先 `<prefix>lean_run`。跑不通的代码不得进入 `Formal/Lib` / `Formal/Proved`——
>    否则"可复用库"会被不编译的定义污染。
> 4. **工具链缺失时的出路必须写出来**：`LEAN_NOT_FOUND`（解析不到 `leanCommand`）与
>    `NO_SUBPROCESS`（宿主没有 subprocess 服务）**都算"这台宿主上没有 Lean"**：把代码写下来并归档，
>    在 `note` 里写明原因；这算显式阻塞原因，`require` 档可以据此放行，代理不会因为装不了 Lean 而卡死。
>    提示词里应把**两个**错误码都点出来——只写 `LEAN_NOT_FOUND` 时，遇到 `NO_SUBPROCESS` 的代理
>    会以为自己遇到了另一种失败而反复重试。
> 5. **忠实性缺陷不得用 0 表达**（§4.1 第 4 条）：只有独立于 Lean 代码也能确定命题为假时才投 0。

### 6.1 验证提示词

`encourage`：

```
【Lean 形式化验证（鼓励模式）】
  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先用 Lean 写形式化代码并执行。
  · 工具：<prefix>lean_run（执行）· <prefix>lean_archive（归档）· <prefix>lean_lib（查已有可复用库）
  · 工作目录：<项目根>/Formal/（可复用定义放 <VibeMath 根>/Formal/Lib/，已证引理放 <VibeMath 根>/Formal/Proved/）
  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：Lean 代码里的定义/对象/条件/假设/结论
    是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。
  · 若判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断。
  · 归档可复用定义/引理前先跑通（<prefix>lean_archive run=true 或先 <prefix>lean_run）；跑不通不要入库。
  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）时：把代码写下来归档，并在会诊/回执的 note 里写明
    "宿主无 Lean 工具链"——这算显式阻塞原因，定论门禁可以据此放行。
```

`require`：同样内容，但"可以不做"改为"**必须**产出 Lean 形式化，或**必须**给出显式的阻塞原因"，
并附加：

```
  · 本模式下定论门禁：对象必须先达到 形式化已通过 或 已记录阻塞原因，否则本次裁定记为未定论
    （原因 formal-required）并进入「形式化待办」。
```

**忠实性分支（两种模式都加，只要模式非 off）**：如果该对象**已经** `formal.status === 'passed'`，
验证提示词把审查对象换成忠实性，并**明确禁止**把偏差写成"假"：

```
  · 该对象已有**通过的 Lean 形式化证明**（<proof 路径>，最近运行 exit 0）。
    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的
    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。
  ▸ 一致 → 投 <真值 1>。
  ▸ **发现任何偏差，不要投 <0>**：偏差只说明**形式化不合格**，不代表命题为假。此时请：
      ① 投票给一个严格介于 0 与 1 之间的值（记为弃权），并在理由里写清偏差；
      ② 用回执 `formal:{decision:'defect', note:'<具体偏差>'}` 记录它。框架会撤回这条证明的
         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）；`require` 档下
         本次裁定**不定论**，`encourage` 档**不得**声称框架会强制搁置（那里靠你的弃权阻止定论）。
         修正形式化并重新跑通后再投票。
  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 <0>，并在理由里写清独立理由。
```

### 6.2 平时工作提示词（solver / explorer / 常驻 / method-keeper 等）

```
【顺手形式化（<模式>）】把你工作中常用或可能复用的对象、假设、新定义，
用 Lean 形式化定义并归档到全局可复用库（<prefix>lean_archive kind='def'），
已成立的引理归到 <VibeMath 根>/Formal/Proved/（kind='lemma'）；写之前先 <prefix>lean_lib 查重，避免重复定义。
归档前先跑通（<prefix>lean_run 或 lean_archive run=true）：跑不通的定义不要进可复用库。
```

- **这段文字的档位由 `leanInitiative` 决定，不是 `formalVerify`**：`off` = 完全不出现（连日线都不注入）；
  `normal` = 上面的"顺手"档；`eager` = 追加"日常就主动把有价值的小引理/命题/定义形式化"。
  `formalVerify` 只影响**验证提示词**的要求强度；两者可自由组合（例如 `formalVerify=off` +
  `leanInitiative=eager` 表示"定论不额外要求，但日常鼓励形式化"）——**注意：`eager` 在 `formalVerify=off`
  下也必须注入日线**，`off` 不许把主动性这条独立轴一起吞掉（v5 统一口径，四套都有 `off+eager` 探针）。
- 异步档（`leanAsync=true`）下这段还必须写清：归档返回的是**排队中的作业**，
  **未落地为 `settled(ok)` 之前不得声称已通过、也不得转忠实性审查**；查进度用
  `<prefix>lean_lib` 的 `jobs` 或 `<prefix>lean_job`，复用先 `<prefix>lean_read` 取原文。

### 6.3 回执契约

非 `off` 模式时，在每轮回执契约里加入（**必须真的被框架解析并落库**——只把字段写进提示词而不实现
解析，等于让代理的难度判断静默消失；每个架构都必须有"回执 → 记录"的行为断言，不能只断言措辞）：

```
  "formal": {"target":"p-x","decision":"used|blocked|defect","file":"Formal/p-x.lean","note":"难度判断/阻塞原因/具体偏差"},
```

- `decision='blocked'` 与 `decision='defect'` 时 `note` 必填，否则整条记录被拒绝（返回该架构的
  `*_INVALID_ARGUMENT`）。
- `decision='defect'` 的落库见 §4.1：**降级 + 删除归档证明 + 写入待办**。
- 这些字段必须出现在**该架构每一类会被表决者/研究者读到的回执契约**里（v2 的初评与辩论两条路径、
  v3 的初评/辩论/工作轮、v4 的验证与常规/心跳轮、v5 的回执契约与心跳轮）。

---

## 7. Run 语义（实现要点）

### 7.1 调用与超时

- **父目录不必预建（round-3 记录）**：宿主的文本写会自动创建缺失的父目录（`dsh-fs-local/lib/index.js` 的 `writeFileAtomic` 先做 `mkdir(dirname(absolutePath), { recursive: true })`），因此 `Formal/Jobs/`、`Computation/<runId>/` 及其 `attempts/<n>/` 都可以"直接写"；`ensureDirs()` 里的列举只为空项目可发现性。把"严格 fs 拒绝创建父目录"当作真实宿主行为来构造失败用例是**错误前提**。
- 用 `subprocess` 服务：`resolveExecutable(leanCommand)` → `spawn({argv, cwd, stdio:{stdin:'ignore',stdout:{maxBytes},stderr:{maxBytes}}, graceMs})`
  → `await handle.done` → `handle.collected.stdout?.readFrom(0).text`。
- **必须**给 `cwd`（项目根或 `<VibeMath 根>`），并在超时时调用 `handle.terminate()`——
  **不能只依赖 `graceMs`**：宿主不杀进程时，超时的编译会变成泄漏的孤儿进程。
- 输出截断到 ~4KB 再入库（避免把巨大的编译器输出写进状态）。
- 宿主没有 `subprocess` 服务 → 返回 `{ok:false, code:'NO_SUBPROCESS'}`，并只记录 `attempted`。

### 7.2 同步路径（`leanAsync=false`）

与旧版逐字一致：`await` 编译器返回，直接得到 exitCode/stdout/stderr，然后按 §7.3 判 `settled(ok)`。
保留它是为了"我需要一个确定的答案再继续"的场景，以及给探针一个不依赖队列的对照路径。

### 7.3 `settled(ok)`：唯一允许置 `passed` 的判据

一次编译只有在**三件事同时成立**时才算"落地为通过"：

1. **进程退出码为 0**（`exitCode === 0`，且不是 `timeout`、不是 `interrupted`）；
2. **内容哈希未变**：编译期间该 `.lean` 文件没有被改写（同一次归档的内容哈希一致）；
3. **构建上下文未变**：引擎、`leanArgs`、搜索路径这一组"编译上下文"与入队时一致。

只有 `settled(ok)` 可以：把对象标为 `passed`、写 `Verified/Lean/<id>.lean`、把引理并入可复用库。
**其它一切结果都停在 `attempted`**：`failed`（退出码非 0）、`timeout`、`interrupted`、
以及哈希/上下文不匹配（此时结果**作废**并在 `note` 里写明 "file changed while compiling" /
"build context changed while compiling"）。`require` 档的门禁据此判定——排队中或失败中的作业
**绝不能**让一条结论变成"已形式化"。

### 7.4 后台队列（`leanAsync=true`，默认）

- 入队即返回：成员继续工作；每个作业在 `<项目>/Formal/Jobs/<jobId>.json` 有镜像。
- 并发上限 = `leanJobsMaxParallel`（默认 1 = 串行，资源占用可预期）。
- 落地时**一次性公告**给成员（注入到其下一轮提示的【形式化结果】行），并在群聊/活动日志留痕；
  随后由 §7.3 决定 `passed` 还是 `attempted`。
- **成员不得抢跑**：提示词明确写"作业落地为通过之前不得声称已通过或转忠实性审查"（§6.2）。

### 7.5 卸载与中断（`dispose` / abort）

插件 fiber 卸载、会话销毁或 abort 时：**终止每一个在跑的编译器进程**（`terminate()`），
并把作业标为 `interrupted`、把对象停在 `attempted`——**绝不因为"进程已经不在"而当作通过**。
`interrupted` 的作业可以重跑（重跑会 `attempts+1`）。

### 7.6 `--search-path` 注入（四套一致）

编译器 argv 固定为：

```
[exe, ...用户 leanArgs, --search-path <VibeMath 根>, <file>]
```

- 自动根**只有一个**：`<VibeMath 根>`（`import Formal.Lib.<name>` 的模块根），插在
  **用户参数之后、文件名之前**——`lake env lean` 因此自然变成 `lake env lean --search-path <root> <file>`。
- `leanSearchPaths` 非空时，**先注入用户给的路径（按给定顺序），再注入自动根**，整体去重。
- **用户显式给出搜索根就不注入**：`leanArgs` 里已有 `--search-path` / `-R` / `--root` 时完全尊重用户配置。
- **不使用环境变量**：宿主的 `spawn` 没有 env 槽位，所以"注入"只能是参数注入；
  也不依赖 `LEAN_PATH` 之类的约定。

### 7.7 崩溃 / 重启恢复

启动或 resume 时扫描 `<项目>/Formal/Jobs/*.json`（**在状态文件装好之后**，否则会写在未加载的
`formal` 记录上）：

- `queued` → 重新入队；
- `running` + 文件哈希仍匹配 → 标 `interrupted`，并**重新入队**（`attempts+1`）；
- `running` + 哈希不匹配 → 只标 `interrupted`（结果不可用，不重跑旧内容）；
- `settled` 且**同一构建上下文** → 只补写那次已成立的结论（`resume` 路径）；
  上下文已变则标 `interrupted` 并记 `build context changed`。

**恢复绝不"静默地"把对象验证掉**：任何不确定的情形都落到 `attempted`/`interrupted` + 明确 note，
由代理决定是否重跑。

---

## 8. 门禁（`require`）的实现位置

**必须在"写 Verified 卡片/判定定论"这唯一的收口点加门禁**，而不是散落在多处：

| 架构 | 收口点 |
|---|---|
| v2 | `writeVerifiedCardIfNeeded` 及其问题收口分支（`writeVerifiedProblemCardIfNeeded`）；另有前置门禁 `formalVerdictDeferred`（在 `settleVerdict` / `processStatusUpdates` 中裁定前调用） |
| v3 | `writeVerifiedPropositionCardIfNeeded` / `writeVerifiedProblemCardIfNeeded`，以及最后一道闸门 `writeVerifiedCardIfChanged`；另有前置门禁 `formalBlocksConclusion`（在 `settleVerdict` / `processStatusUpdates` 中裁定前调用） |
| v4 | `finalizeVerify`（紧随其后的 `closeVerify` 之前） |
| v5 | `continueVerifyRound`（紧随其后的 `closeVerify` 之前；`finalizeUndecided` 不受影响） |

门禁不通过时：把结果记为 `undecided`（原因 `formal-required: …`）、写 `Formal/TODO.md`、
群聊公告、**不写** `Verified/` 卡片、不改变对象的既有权重/概率字段。

---

## 9. 索引格式（三份，框架维护）

### 9.1 `<项目>/Formal/Index.md`

```markdown
# Lean 形式化索引｜<项目>
> 本文件由框架维护（工具调用时增量更新；`<prefix>lean_lib` 会重建）。权威状态在对象记录里。

| 对象 | 状态 | 形式化文件 | 归档证明 | 最近运行 | 难度判断 / 阻塞原因 |
|---|---|---|---|---|---|
| p-1 | passed | Formal/p-1.lean | Verified/Lean/p-1.lean | ok（exit 0，1.2s） | — |
| p-2 | blocked | — | — | — | 需要外层解析数论框架，本轮工作量不可接受 |
| p-3 | attempted | Formal/p-3.lean | — | fail（exit 1，0.8s） | — |

## 形式化待办（require 模式）
- p-4 —— 尚未形式化（formal-required），定论被搁置
```

### 9.2 `<VibeMath 根>/Formal/Lib/Index.md`

**必需列**：`名称 | 文件 | 类别 | 依赖（import） | 摘要`。
**可选列**：若该架构为库文件保留运行记录，可增加 `最近运行`（v3 就是这样做的，v2/v4/v5 没有）；
**没有记录就不许加这一列、更不许写假数据**——"说得出这个文件还编不编得过"是有价值的信息，
但编一个不说实话的运行状态比没有更糟。

**依赖列由框架扫描该 `.lean` 的 `import` 行得到**（四套都写），这样索引一次回答
"有什么 / 叫什么 / 怎么导入"：一个定义 import 了谁，决定了它能不能被逐字复用。

```markdown
# 可复用 Lean 定义库（跨项目）
| 名称 | 文件 | 类别 | 依赖（import） | 摘要 | 最近运行 |      ← 最后一列可选
|---|---|---|---|---|---|---|
| ZMod5 | Lib/ZMod5.lean | def | Mathlib.Data.ZMod.Basic | 模 5 剩余类与基本引理 | ok |
```

### 9.3 `<VibeMath 根>/Formal/Proved/Index.md`

**必需列**：`名称 | 文件 | 陈述 | 依赖`（依赖同样由 `import` 行扫描得到，四套都写）。
**可选列**：`最近运行`、`类别`（v2/v4/v5 用它标注 `lemma`；v3 不加，因为整张表都是引理）。

```markdown
# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）
| 名称 | 文件 | 陈述 | 依赖 | 最近运行 |      ← 最后一列可选
|---|---|---|---|---|---|
| pell_sq_odd | Proved/pell_sq_odd.lean | … | ZMod5 | ok |
```

> 三份索引都是**给人/代理看的摘要**，不是权威状态（权威状态在对象记录/会话投影里）。
> 跨架构只强制"必需列"，因为强行对齐可选列会逼某个架构去记录它并不维护的数据。

---

## 10. 测试要求（每个架构都要有）

1. **`off` 是（验证阶段的）无操作**：`formalVerify:'off'` + 默认 `leanInitiative:'normal'` 时提示词里不出现
   Lean 字样；验证流程与门禁行为与改动前一致。**主动性是独立轴**：显式 `leanInitiative:'eager'` 时，
   `off` 档仍注入日线（且只注入日线——验证提示词里不得出现验证阶段的 Lean 文本），
   `leanInitiative:'off'` 则连日线也不注入。
2. **`encourage` 注入**：验证提示词含鼓励段落；平时工作提示词含"顺手形式化"段落；
   对象 `passed` 后，验证提示词切换为**忠实性审查**措辞。
3. **`require` 门禁**：无形式化记录时"真"结论**不写入 Verified/**，而是 `undecided` +
   `Formal/TODO.md` 记录；补上 `passed` 后重跑可正常写入，且卡片上记录形式化状态；
   `blocked`（`note` 非空）也可放行；`note` 为空则拒绝。
4. **工具**：`lean_run` 走注入的 mock subprocess 时能拿到 exitCode/输出并记录；
   `lean_run` 拒绝越界路径；工具链缺失返回 `LEAN_NOT_FOUND` 且不崩；
   `lean_archive` 三种 kind 分别落到正确路径并更新索引；`lean_lib` 能重建索引。
5. **参数**：非法值回退；可在运行中切换（切换后新提示词立刻反映新模式）。
6. **灵敏度探针**（新增，放进 `audit-formal-sensitivity.mjs`）：每条不变式都要有能让对应套件**变红**的变异，
   且探针必须真的启动套件、真的被套件读取、变异真的改变行为（见 `AUDIT-CHECKLIST.md` §2）。
7. **静态提示词面**（放进 `audit-persona-surface.test.mjs`，四个预设一起）：五个 Lean 工具名与八个参数名
   必须出现在**该预设 persona 的 `prefix` 与 `text` 两个块**里，档位名（`'off'`/`'encourage'`/`'require'`）
   逐字出现，忠实性语义与 `Formal/Lib` / `Formal/Proved` / `Verified/Lean` 路径写清；
   反向：persona 里的每个 `vibe_*` 名字必须真的注册。`audit-persona-sensitivity.mjs` 用变异副本
   证明这套断言会变红。**教训**：本特性首版在 v2/v3/v4 上"工具已注册、persona 从未列出"，
   而当时所有既有套件全绿——因为 e2e 套件直接 `apply(ctx)`，从不加载 YAML。
8. **回执通道必须是行为断言，不是措辞断言**（放进各架构的 `formal-verify-vN.test.mjs`）：
   构造一条带 `formal:{decision:'blocked'|'defect', note}` 的**代理回执**喂给框架，断言记录真的落库
   （`blocked` → `blocked`；`defect` → `attempted` + `proof` 清空 + 归档文件被删 + 待办条目出现）。
   **教训**：v2 首版只在提示词里写了"请在回执的 formal 字段写明难度判断"，框架从不解析它；
   而套件只断言"那句话存在"，于是 177 条断言全绿却守着一个**死通道**——这正是
   `AUDIT-CHECKLIST.md` §2.2 说的"只断言包含某些关键词"。
9. **忠实性语义必须有断言**（四套都要）：断言注入文本**不含**"偏离 → 0"这类把形式化缺陷等同命题为假
   的指令，且含"不要投 0 / 记为形式化不合格 / 走待办"的要求；并断言 `defect` 路径真的不得定论
   （`require` 档下对象留在未定论 + `Formal/TODO.md`）。
10. **每个架构都要有人可读的 Lean 提示词语料**（`prompt-corpus-vN/`，随包发布）：至少覆盖
    `off` 不出文本、`encourage`、**`require`**、`passed` 忠实性分支、以及平时工作轮的"顺手形式化"；
    语料必须把工作区与 VibeMath 根**归一化为 `<WS>` / `<VIBEMATH>`**（大小写与分隔符无关——
    Windows 下 `os.tmpdir()` 的大小写可能与插件渲染的不同），并把**时间戳归一化为 `<TIME>`**，
    保证逐字节确定性、可 diff、不泄露本机路径。**教训**：首版只有 v3/v5 有语料，v2/v4 的 Lean
    提示词只能翻源码；`require` 档文本不在任何语料里；v5 语料既有绝对临时路径又有时间戳，
    每跑一次都变。
11. **提示词硬要求的探针**（放进 `audit-formal-sensitivity.mjs`）：把注入文本里的工具名改成缩写
    （`lean_archive`）、删掉 `require` 档的要求段落、把忠实性分支改回"偏离 → 0"——三者都必须让
    对应套件**变红**。
12. **异步队列**（四套都要）：`leanAsync=true` 时 `lean_run` / `lean_archive{run:true}` **立即返回**
    `async.jobId` 且不阻塞成员；作业在 `Formal/Jobs/<jobId>.json` 有镜像；落地后**恰好公告一次**
    （【形式化结果】行）；`leanAsync=false` 走同步路径并给出与旧版一致的返回体。
13. **`settled(ok)` 判据**：只有 exit 0 + 内容哈希未变 + 构建上下文未变三者同时成立才置 `passed`
    并写 `Verified/Lean/<id>.lean`；编译期间文件被改写或上下文改变时，结果必须**作废**并停在
    `attempted`（断言状态与 note）。排队中/失败/超时/中断**一律不得**让对象变成已形式化。
14. **卸载与崩溃恢复**：dispose/abort 必须 `terminate()` 在跑的编译并标 `interrupted`（绝不 `passed`）；
    恢复扫描 `Formal/Jobs/*.json`——`queued` 重入队、`running` 标记中断（哈希匹配则重入队、`attempts+1`）、
    `settled` 只在**同一构建上下文**下补写结论。
15. **去重与搜索路径注入**：同内容 + 同构建上下文再归档 → `deduped:true` 且不重写不重编译；
    编译器 argv 必须是 `[exe, ...用户 leanArgs, --search-path <VibeMath 根>, <file>]`，
    用户已显式给出搜索根时**不注入**，`leanSearchPaths` 先于自动根且去重。

---

## 11. 不做什么（边界）

- **不内置 Lean**：本框架不安装工具链、不下载依赖。工具链不存在时优雅降级（记录 `LEAN_NOT_FOUND`）。
- **不判"忠实性"**：忠实性由代理/人审查并投票决定；框架只负责把审查焦点**换成**忠实性
  （因为证明正确性已由内核保证）。框架不会假装自己能判断 Lean 代码是否对应命题。
- **`defect` 也不是框架的判断**：框架不判断 Lean 代码是否忠实，只提供"表决者认定不忠实时"的
  一档落库语义（§4.1）——**降级 + 待办 + 不定论**，而不是把它记成"命题为假"。
- **不把 Lean 通过等同于"命题为真"**：`passed` 只表示"形式化代码通过内核检查"，
  该代码是否忠实于命题仍需 m 票审查。这正是 §0 表格里"审查对象变化"的含义。
- **不注入环境变量**：宿主的 `spawn` 没有 env 槽位，"搜索路径"只能靠 argv 注入（§7.6）。
  因此也不依赖 `LEAN_PATH` 之类的约定——换宿主时行为不会因为环境差异而变。
- **异步队列不是持久任务系统**：队列是内存态 + `Formal/Jobs/*.json` 镜像，没有后台守护进程；
  进程消失时进行中的编译就是 `interrupted`，由恢复逻辑重入队或标记（§7.7）。
- **不做数学引擎的 argv 模板**：本版本**没有** Maple / MATLAB / Wolfram 的命令行模板，
  也没有 `mathEngineOverride` 参数（四套插件与本文件都不包含它们）。若将来加入这类外部引擎，
  其 argv 是**版本相关**的（同一命令在不同版本上参数不同），必须逐个标注 `VERIFY` 并保留一个显式的
  覆盖入口（如 `mathEngineOverride`）作为逃生门——**不得**把一个未经验证的模板写成"可用"。
