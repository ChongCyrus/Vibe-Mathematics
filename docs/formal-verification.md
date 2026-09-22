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

- **成员提示词**（按模式动态注入的那部分）里**不出现**任何 Lean 相关内容；验证流程、门禁、归档全部不变，
  也不写入任何形式化状态。这是真正的"无操作"，四套都有断言与探针守着。
- **回执通道在 `off` 档必须失效**：`formal` 字段本来就不在 `off` 档的回执契约里，所以一个残留/幻觉/被
  引用的 `formal` 回执**不得**创建形式化记录（否则 `off` 就不是无操作了）。四个架构都必须在这个入口
  上加 `formalOn()` 守卫。
- 三个 Lean 工具**仍然注册且可用**（注册是静态的，与既有 `ctx.effect` 纪律一致）；`off` 只是不主动
  向成员宣讲它们。代理/人主动调用时照常工作——**工具调用是刻意行为，回执字段不是**，这条区别就是
  上一条守卫的理由。
- **主代理的 persona 是静态的，不受档位影响**：它**必须始终**文档化这三个工具与四个参数
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
  "decision": "used" | "blocked" | "defect", // 代理的显式判断（defect 见 §4.1）
  "note": "…",                      // blocked / defect 时必填：难度判断 / 阻塞原因 / 具体偏差
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
| 回执里 `formal:{target, decision:'blocked', note}` | → `blocked`（`note` 必填） |
| **回执里 `formal:{target, decision:'defect', note}`** | **撤回 `passed`：→ `attempted`，清空 `proof`、删除 `Verified/Lean/<id>.lean`、把 `note` 写入记录与 `Formal/TODO.md`、公告**（`note` 必填） |
| 回执里 `formal:{target, decision:'used', file}` | → `attempted`（记录文件） |

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

> **硬要求（四套一致，逐字级别的约束）**
> 1. **工具名一律写全称**（`<prefix>lean_run` / `<prefix>lean_archive` / `<prefix>lean_lib`）。
>    注入文本里**不得**出现 `lean_run` / `lean_archive` / `lean_lib` 这类缩写——那不是注册名，
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

**必需列**：`名称 | 文件 | 类别 | 摘要`。
**可选列**：若该架构为库文件保留运行记录，可增加 `最近运行`（v3 就是这样做的，v2/v4/v5 没有）；
**没有记录就不许加这一列、更不许写假数据**——"说得出这个文件还编不编得过"是有价值的信息，
但编一个不说实话的运行状态比没有更糟。

```markdown
# 可复用 Lean 定义库（跨项目）
| 名称 | 文件 | 类别 | 摘要 | 最近运行 |      ← 最后一列可选
|---|---|---|---|---|---|
| ZMod5 | Lib/ZMod5.lean | def | 模 5 剩余类与基本引理 | ok |
```

### 9.3 `<VibeMath 根>/Formal/Proved/Index.md`

**必需列**：`名称 | 文件 | 陈述`。
**可选列**：`依赖`（仅当该架构记录依赖关系时）、`最近运行`（同上）、`类别`（v2/v4/v5 用它标注
`lemma`；v3 不加，因为整张表都是引理）。

```markdown
# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）
| 名称 | 文件 | 陈述 | 依赖 | 最近运行 |      ← 后两列可选
|---|---|---|---|---|---|
| pell_sq_odd | Proved/pell_sq_odd.lean | … | ZMod5 | ok |
```

> 三份索引都是**给人/代理看的摘要**，不是权威状态（权威状态在对象记录/会话投影里）。
> 跨架构只强制"必需列"，因为强行对齐可选列会逼某个架构去记录它并不维护的数据。

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

---

## 11. 不做什么（边界）

- **不内置 Lean**：本框架不安装工具链、不下载依赖。工具链不存在时优雅降级（记录 `LEAN_NOT_FOUND`）。
- **不判"忠实性"**：忠实性由代理/人审查并投票决定；框架只负责把审查焦点**换成**忠实性
  （因为证明正确性已由内核保证）。框架不会假装自己能判断 Lean 代码是否对应命题。
- **`defect` 也不是框架的判断**：框架不判断 Lean 代码是否忠实，只提供"表决者认定不忠实时"的
  一档落库语义（§4.1）——**降级 + 待办 + 不定论**，而不是把它记成"命题为假"。
- **不把 Lean 通过等同于"命题为真"**：`passed` 只表示"形式化代码通过内核检查"，
  该代码是否忠实于命题仍需 m 票审查。这正是 §0 表格里"审查对象变化"的含义。
