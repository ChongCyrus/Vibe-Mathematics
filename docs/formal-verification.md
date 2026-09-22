# Lean 形式化验证（v2 / v3 / v4 / v5 共用设计）

> 本文件是四个架构**共同遵守的契约**。每个预设都在自己的单文件插件里独立实现同一套语义
> （四个预设之间零依赖、零共享模块，这是本项目的既有约定）。
> 参数、路径、工具名、提示词语义、门禁规则、索引格式都必须与本文件一致。

---

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
| `formalVerify` | `'off'` \| `'encourage'` \| `'require'` | `'off'` | 三档开关，见 §2 |
| `leanCommand` | 字符串 | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | 字符串数组 | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | 正整数 | `120000` | 单次 Lean 运行的超时上限 |

- 非法值一律**回退到默认**（`formalVerify` 非三档之一 → `'off'`；`leanTimeoutMs` 非正 → 默认）。
- 参数必须出现在该架构既有的参数体系里：`set_params` / `vibe_v4_set` / `vibe_v5_set`、
  参数 schema（`*_setup` / `*_template`）、`status`/`report` 的可读参数表。
- **模式是动态的**，可以在运行中切换：所有与模式相关的提示词文本都必须在**构造提示词的那一刻**
  由 `params.formalVerify` 现算，**不得**写进"入职时冻结"的人格/章程快照
  （否则切换模式后成员读到的仍是旧指令）。

---

## 2. 三档语义

### `off`（默认）—— 不额外进行任何要求

- 提示词里**不出现**任何 Lean 相关内容；验证流程、门禁、归档全部不变。
- 三个 Lean 工具**仍然注册**（注册是静态的，与既有 `ctx.effect` 纪律一致），
  但框架不会告诉代理它们存在；代理/人主动调用时它们照常工作。

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
│   ├─ Lib/Index.md                         # 名称 → 文件 → 类别 → 摘要
│   ├─ Proved/<name>.lean                   # 已成立的 Lean 命题/引理（机器已核对）
│   └─ Proved/Index.md                      # 名称 → 文件 → 陈述 → 依赖
└─ Projects/<项目>/                          # （v5 为 Projects/<项目>/Institutes/<所>/）
    ├─ Formal/
    │   ├─ <对象id>.lean                     # 该对象的形式化工作文件
    │   ├─ Index.md                          # 对象 → 状态 → 文件 → 归档证明 → 运行结果 → 难度判断
    │   └─ TODO.md                           # require 模式下的「形式化待办」
    └─ Verified/
        ├─ <原有定论卡片>
        └─ Lean/<对象id>.lean                # ★ 归档证明：该定论对象对应的形式化代码
```

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
  "decision": "used" | "blocked",   // 代理的显式难度判断
  "note": "…",                      // blocked 时必填：难度判断 / 阻塞原因
  "run": { "at": 0, "ok": true, "exitCode": 0, "ms": 0, "stdoutTail": "", "stderrTail": "" },
  "updatedAt": 0
}
```

状态迁移：

| 事件 | 迁移 |
|---|---|
| `lean_run` 成功 | `none`/`attempted` → `attempted`（记录运行结果） |
| `lean_run` 失败 | `none` → `attempted`（记录失败输出，供代理修复） |
| `lean_archive{kinds:'proof', target, from|content}` + 该文件最近一次运行 `ok` | → `passed`，写 `Verified/Lean/<id>.lean` |
| `lean_archive{kinds:'blocked', target, note}` | → `blocked`（`note` 必填） |
| 回执里 `formal:{target, decision:'blocked', note}` | → `blocked` |
| 回执里 `formal:{target, decision:'used', file}` | → `attempted`（记录文件） |

---

## 5. 工具（每个架构三个，前缀各自不同）

前缀：v2/v3 → `vibe_math_`；v4 → `vibe_v4_`；v5 → `vibe_v5_`。

### 5.1 `<prefix>lean_run`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | string | ✅ | 相对 `<VibeMath 根>` 或项目根的 `.lean` 路径 |
| `target` | string | | 关联对象 id（给了就更新该对象的运行记录） |
| `timeout_ms` | integer | | 覆盖 `leanTimeoutMs` |

返回：`{ok, exitCode, signal, ms, command, stdout, stderr, file}`；
找不到工具链返回 `{ok:false, code:'LEAN_NOT_FOUND', error}`；超时返回 `{ok:false, code:'LEAN_TIMEOUT'}`。
**绝不抛异常到调度循环**——任何失败都要变成可读结果并记录。

### 5.2 `<prefix>lean_archive`

一个工具覆盖三种归档（`kind` 区分）：

| `kind` | 必填 | 行为 |
|---|---|---|
| `'def'` / `'lemma'` | `name`, `content` 或 `from` | 写入全局 `Formal/Lib/<name>.lean`（def）或 `Formal/Proved/<name>.lean`（lemma），重建对应 `Index.md`；可选 `run:true` 先跑一次再归档 |
| `'proof'` | `target`, `content` 或 `from` | 写入 `Formal/<target>.lean`；若该文件最近一次运行 `ok`，同时写 `Verified/Lean/<target>.lean` 并把对象标为 `passed` |
| `'blocked'` | `target`, `note` | 记录显式难度判断/阻塞原因（`note` 空 → 拒绝），对象标为 `blocked` |

### 5.3 `<prefix>lean_lib`

无必填参数。**扫描并重建**三处索引（项目 `Formal/Index.md`、全局 `Lib/Index.md`、`Proved/Index.md`），
返回可复用库清单（供代理写新定义前先查重、直接复用）。`refresh:false` 时只读不重建。

---

## 6. 提示词注入（在构造提示词时现算）

### 6.1 验证提示词

`encourage`：

```
【Lean 形式化验证（鼓励模式）】
  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先用 Lean 写形式化代码并执行。
  · 工具：<prefix>lean_run（执行）· <prefix>lean_archive（归档）· <prefix>lean_lib（查已有可复用库）
  · 工作目录：<项目根>/Formal/（可复用定义放 <VibeMath 根>/Formal/Lib/，已证引理放 Formal/Proved/）
  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：Lean 代码里的定义/对象/条件/假设/结论
    是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。
  · 若判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断。
```

`require`：同样内容，但"可以不做"改为"**必须**产出 Lean 形式化，或**必须**给出显式的阻塞原因"，
并附加：

```
  · 本模式下定论门禁：对象必须先达到 形式化已通过 或 已记录阻塞原因，否则本次裁定记为未定论
    （原因 formal-required）并进入「形式化待办」。
```

**门禁提示（两种模式都加，只要模式非 off）**：如果该对象**已经** `formal.status === 'passed'`，
验证提示词改为强调：

```
  · 该对象已有**通过的 Lean 形式化证明**（<proof 路径>）。因此你不需要重新检查推导；
    你的任务是**忠实性审查**：逐条核对定义/对象/条件/假设/结论是否与命题原文一致，
    并据此给出 verdict。
```

### 6.2 平时工作提示词（solver / explorer / 常驻 / method-keeper 等）

```
【顺手形式化（<模式>）】把你工作中常用或可能复用的对象、假设、新定义，
用 Lean 形式化定义并归档到全局可复用库（<prefix>lean_archive kind='def'），
已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 <prefix>lean_lib 查重，避免重复定义。
```

### 6.3 回执契约

非 `off` 模式时，在每轮回执契约里加入：

```
  "formal": {"target":"p-x","decision":"used|blocked","file":"Formal/p-x.lean","note":"难度判断/阻塞原因"},
```

---

## 7. Run 语义（实现要点）

- 用 `subprocess` 服务：`resolveExecutable(leanCommand)` → `spawn({argv:[exe,...leanArgs,file], cwd, stdio:{stdin:'ignore',stdout:{maxBytes},stderr:{maxBytes}}, graceMs})`
  → `await handle.done` → `handle.collected.stdout?.readFrom(0).text`。
- **必须**给 `cwd`（项目根或 `<VibeMath 根>`），并对超时调用 `handle.terminate()`。
- 输出截断到 ~4KB 再入库（避免把巨大的编译器输出写进状态）。
- 宿主没有 `subprocess` 服务 → 返回 `{ok:false, code:'NO_SUBPROCESS'}`，并只记录 `attempted`。

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

```markdown
# 可复用 Lean 定义库（跨项目）
| 名称 | 文件 | 类别 | 摘要 | 最近运行 |
|---|---|---|---|---|
| ZMod5 | Lib/ZMod5.lean | def | 模 5 剩余类与基本引理 | ok |
```

### 9.3 `<VibeMath 根>/Formal/Proved/Index.md`

```markdown
# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）
| 名称 | 文件 | 陈述 | 依赖 | 最近运行 |
|---|---|---|---|---|
| pell_sq_odd | Proved/pell_sq_odd.lean | … | ZMod5 | ok |
```

---

## 10. 测试要求（每个架构都要有）

1. **`off` 是无操作**：提示词里不出现 Lean 字样；验证流程与门禁行为与改动前一致。
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
7. **静态提示词面**（放进 `audit-persona-surface.test.mjs`，四个预设一起）：三个 Lean 工具名与四个参数名
   必须出现在**该预设 persona 的 `prefix` 与 `text` 两个块**里，档位名（`'off'`/`'encourage'`/`'require'`）
   逐字出现，忠实性语义与 `Formal/Lib` / `Formal/Proved` / `Verified/Lean` 路径写清；
   反向：persona 里的每个 `vibe_*` 名字必须真的注册。`audit-persona-sensitivity.mjs` 用变异副本
   证明这套断言会变红。**教训**：本特性首版在 v2/v3/v4 上"工具已注册、persona 从未列出"，
   而当时所有既有套件全绿——因为 e2e 套件直接 `apply(ctx)`，从不加载 YAML。

---

## 11. 不做什么（边界）

- **不内置 Lean**：本框架不安装工具链、不下载依赖。工具链不存在时优雅降级（记录 `LEAN_NOT_FOUND`）。
- **不判"忠实性"**：忠实性由代理/人审查并投票决定；框架只负责把审查焦点**换成**忠实性
  （因为证明正确性已由内核保证）。框架不会假装自己能判断 Lean 代码是否对应命题。
- **不把 Lean 通过等同于"命题为真"**：`passed` 只表示"形式化代码通过内核检查"，
  该代码是否忠实于命题仍需 m 票审查。这正是 §0 表格里"审查对象变化"的含义。
