# dsh-vibe-math 2.3.0 — 四个架构新增可调控的 Lean 形式化验证

> 上一版：2.2.2。本版为 **v2 / v3 / v4 / v5 四个架构**各新增同一个**可调控参数**与配套机制。

---

## 0. 这个参数解决什么问题

多代理交叉验证的本质是**共识**：m 个代理一致认为"这是对的"，既排除不了共同误解，
也排除不了共同漏掉的情形。Lean 形式化把"我认为"换成"机器已核对"，于是

> **一旦形式化代码通过，剩下的唯一不确定项就缩小为：Lean 代码里的定义 / 对象 / 条件 / 假设 / 结论，
> 是否与命题原文完全一致？**

这个问题人（和代理）是能有效审查的，而"这个证明对不对"交给内核。所以这个参数改变的
**不是"更严格一点"，而是审查对象本身**：

| | 原验证工作 | 形式化通过后的验证工作 |
|---|---|---|
| 审查对象 | 命题本身（推导是否正确） | **忠实性**：Lean 代码 ↔ 命题原文是否一致 |
| 结论强度 | 共识（可能共同出错） | 严格（内核已检查），前提是忠实性成立 |
| 副产品 | 无 | 可复用的 Lean 定义 / 引理库 |

---

## 1. 参数：`formalVerify`（四个架构同名同语义，默认 `'off'`）

| 取值 | 含义 |
|---|---|
| **`'off'`（默认）** | **不额外进行任何要求。** 提示词里不出现任何 Lean 内容，验证流程与门禁完全不变。**这是真正的无操作**，并且有专门的测试与灵敏度探针守着这一点（`formalOn` 被改成恒真时套件必须变红） |
| `'encourage'` | **鼓励但不强制**：验证时先判断该对象的**实现难度**，能在可接受工作量内形式化就优先做；一旦 Lean 通过，投票提示词明确告诉表决者"**你不需要重新检查推导**，你的任务是**忠实性审查**"。平时工作也鼓励把常用/可能复用的对象、假设、新定义随手形式化归档。**不设门禁** |
| `'require'` | **强制**：真/假结论必须满足「**Lean 已通过**」或「**显式记录了阻塞原因**」，否则本次裁定**不生效**——记为未定论（原因 `formal-required`）、写入「形式化待办」、公告全所，对象留库待形式化后重新提议。门禁落在**写 Verified 卡片的唯一收口点** |

配套参数：`leanCommand`（默认 `'lean'`；配合 `leanArgs` 可做 `lake env lean`）、`leanArgs`（默认 `[]`）、
`leanTimeoutMs`（默认 `120000`）。

**非法值一律回退 `'off'`，绝不回退到更强的档位**——一个拼写错误若静默启用强制形式化，
会让所有结论被门禁拦下。这条也有专门的断言与探针。

### 关于「强制」的准确含义

`require` 强制的是**"必须做出并记录判断"**，不是"必须成功形式化"：

- 形式化成功 → 走忠实性审查；
- 判断不值得/做不到 → 必须用 `kind='blocked'` 写下**原因**（`note` 必填），据此放行。

也就是说：**"根据实现难度决定是否用 Lean"的决定权在代理，但决定必须显式、可审计，
不允许静默跳过。** 这正是需求里那三个调控方向的落点。

---

## 2. 归档：形式化代码放在哪里

```
<VibeMath 根>/
├─ Formal/                              # ★ 跨项目可复用库（四套共用同一份布局）
│   ├─ Lib/<name>.lean                  # 可复用定义 / 对象 / 假设
│   ├─ Lib/Index.md                     # 名称 → 文件 → 类别 → 摘要（写新定义前先查）
│   ├─ Proved/<name>.lean               # 已成立的 Lean 命题 / 引理（机器已核对）
│   └─ Proved/Index.md
└─ Projects/<项目>/                      # （v5 为 Projects/<项目>/Institutes/<所>/）
    ├─ Formal/
    │   ├─ <对象id>.lean                 # 该对象的形式化工作文件
    │   ├─ Index.md                      # 对象 → 状态 → 文件 → 归档证明 → 运行结果 → 难度判断
    │   └─ TODO.md                       # require 档下的「形式化待办」
    └─ Verified/
        ├─ <原有定论卡片>                 # 卡片上多一行 `- 形式化: <状态>`
        └─ Lean/<对象id>.lean            # ★ 归档证明：该定论对象对应的形式化代码
```

**可复用的东西放全局**（跨项目复用是这套设计的核心收益），**证明与定论卡片放在一起**
（一眼可见"这条结论的证明在哪"）。也因此 Lean 路径守卫的边界是 **VibeMath 根**而不是项目根：
爬出项目但仍在 VibeMath 内是合法的，那正是全局库所在——而爬出 VibeMath 会被拒绝
（用**词法归一化**判断，不是字符串前缀，所以 `..` 穿越拦得住；这一点也有探针）。

---

## 3. 工具（每个架构三个，前缀跟随各自命名）

| 工具 | 作用 |
|---|---|
| `…_lean_run` | 在宿主 `subprocess` 服务上执行 Lean，返回 `{ok, exitCode, ms, command, stdout, stderr}`。**绝不抛异常到调度循环**：缺 `subprocess` → `NO_SUBPROCESS`，解析不到可执行文件 → `LEAN_NOT_FOUND`，非零退出 → `LEAN_FAILED`，超时 → `LEAN_TIMEOUT`（并 `terminate()`），路径越界 → 拒绝 |
| `…_lean_archive` | `kind='def'/'lemma'` → 归档到**跨项目** `Formal/Lib` 或 `Formal/Proved`；`kind='proof'` → 写 `Formal/<target>.lean`，运行通过则同时写 **`Verified/Lean/<target>.lean`** 并把对象标为 Lean 通过；`kind='blocked'` → 记录显式难度判断/阻塞原因（**原因空则拒绝**） |
| `…_lean_lib` | 重建并返回三处索引与逐对象形式化状态——**写新定义前先查重、直接复用** |

前缀：v2/v3 → `vibe_math_lean_*`；v4 → `vibe_v4_lean_*`；v5 → `vibe_v5_lean_*`。
三个工具**无条件注册**（注册是静态的，与既有 `ctx.effect` 纪律一致）；`off` 档只是不主动告诉成员它们存在。

另有回执通道 `"formal": {"target","decision":"used|blocked","file","note"}`：
一个从不调用 Lean 工具的成员仍然可以（也必须在 `require` 档下）给出难度判断。

---

## 4. 各架构的实现落点（细节见各自 `实现方案.md`）

| | v2 | v3 | v4 | v5 |
|---|---|---|---|---|
| 状态存放 | `VibeMath_State/formal.json` | `State/formal.json` | `<项目>/State/formal.json` | **会话日志投影单元**（新事件 `vibe5/formal`） |
| 门禁收口点 | `writeVerifiedCardIfNeeded` + 问题收口（两处） | `writeVerifiedCardIfChanged`（唯一写卡点）+ 判定入口前置 | `finalizeVerify`（`closeVerify` 之前） | `continueVerifyRound`（`closeVerify` 之前） |
| 提示词注入 | `verifierReviewPrompt` / `verifierDebatePrompt` + solver 提示词 | 同上 + Method Keeper（沉淀可复用 Lean） | `verifyPrompt` + 常规/心跳/coreRules | `verifyPrompt` + 常规/心跳轮 + 状态块 `[形式化]` 行 |
| 可视化 | `status`/`report` | `status`/`report` + `Logs/报告.md` | `status`/`report` + `vibe_v4_formal_report` | `status().formal` + `report()` 的 Lean 小节 |
| 额外 | — | v3 的卡片刻意保持 **off 档字节不变**（新增锚点行只在非 off 且有记录时写） | 新增 `vibe_v4_prompts`（把"某成员会收到的确切提示词"作为可审计面） | `vibe_v5_overview` 增加形式化小节 |

**四套完全一致的语义**：默认 off 无操作、未知档位回退 off、通过后转忠实性审查、
`require` 门禁搁置而非卡死、阻塞原因必填、证明归档到 `Verified/Lean/`、
可复用定义归档到跨项目 `Formal/Lib`、路径守卫词法归一。

共用契约：[`docs/formal-verification.md`](../formal-verification.md)。

---

## 5. persona 静态提示词面：本次审计新发现的一整类缺陷（已修）

给四套加工具时暴露了一类**此前没有审计维度**的缺陷——不是运行时发出的提示词（§1.1–1.5 守的
那一层），而是 `agent.cordis.yml` 里 **persona 行本身**。persona 是主代理收到的**唯一**一份
"有哪些工具、能调哪些参数"的清单；而**所有 e2e 套件都直接 `apply(ctx)`，从不加载 YAML**，
所以这一层对既有 4000+ 条断言完全盲。发现的真实缺陷：

| # | 缺陷 | 后果 |
|---|---|---|
| 1 | **v2 / v3 / v4 的 persona 从未列出**三个 `*_lean_*` 工具（只有 v5 列了，尽管它们**无条件注册**） | 主代理**不知道这个能力存在**，连准确名字都猜不到；用户在 v2/v3/v4 上无法指挥形式化 |
| 2 | v4 的 `vibe_v4_set {…}` 参数表漏了 `formalVerify`/`leanCommand`/`leanArgs`/`leanTimeoutMs` | 开关**不可发现**（工具 schema 里有、prompt 里没有） |
| 3 | v3 的 persona 从未列出 `vibe_math_setup` / `vibe_math_save_settings` / `vibe_math_template`（v2 列了） | 三个主控工具不可发现 |
| 4 | v4 的 persona 从未列出 `vibe_v4_prompts`（"把成员会收到的确切提示词读出来"的审计工具） | 恰恰是审计提示词最需要的工具被藏起来了 |
| 5 | v5 的 persona 写了 `hire`/`fire`（临时工），却没写 `add_researcher`/`remove_researcher`（常驻），而它同时声称"所办握有增聘常驻的权力" | 权力存在但工具不可发现 |
| 6 | v5 的 `prefix` 与 `text` 两个块**漂移**：同一句在 `prefix` 里是 `... are`、在 `text` 里是 `... is` | 旧宿主读 `text`、新宿主读 `prefix`，同一版本对不同宿主呈现不同文字 |
| 7 | v4 的命令**失败提示** `usage` 长期列着 `message` 子命令，而处理器**没有** `message` 分支（`usage` 把自己再列一遍） | 用户按提示输入 `/v4 message …` 得到"未知子命令"，而错误信息本身又说它存在。**这是复发**：同一个文件的 `/v4 set` 在更早一轮修过一次，但当时没留下"三处表面必须一致"的守卫 |
| 8 | v5 的 persona `/v5` 子命令列表漏了 `add` / `remove`（处理器实现了、`hint` 也列了）；v4 的 `/v4` 列表漏了 `message` | 人读 prompt 与人读 hint 不一致 |

**新增 `audit-persona-surface.test.mjs`（197 条断言）**，把这一层变成硬约束：

- **双向**一致性：注册的每个工具必须在 persona 里出现（未文档化者必须进**显式快照**，
  新增工具会被迫做出"写进 prompt 还是明确不进"的决定）；persona 里每个 `vibe_*` 名字必须真的注册
  （反向检查抓改名/拼错/幽灵工具；`name*` 通配写法允许）；
- `prefix` 与 `text` **逐行一致，只允许第 0 行不同**（防宿主间漂移）；
- Lean 面在**两个块**里都齐全：三个工具名、四个参数名、三个档位名逐字出现、
  忠实性语义、`Formal/Lib` / `Formal/Proved` / `Verified/Lean` 路径；
- **斜杠命令四处一致**：`hint` ⊆ 实际分支、实际分支 ⊆ `hint`（`hint` 用 `...` 表示非穷举时除外）、
  失败 `usage` 串与分支集合**完全相等**、persona 的 `/vN` 列表与 `hint` 一致；
- 与共享契约 `docs/formal-verification.md` 交叉核对（契约里漏写参数/档位/路径同样变红）。

**新增 `audit-persona-sensitivity.mjs`（11 条探针）**证明上面这套断言真的会变红，
并遵守既有四条防假绿纪律：开跑前先确认**未变异**的副本经由 `PERSONA_ROOT` 是绿的
（否则探针探测到的可能是覆盖机制本身）；变异副本若损坏 persona 的 YAML 块结构判 SETUP-FAIL；
`.js` 变异副本先过 `node --check`；锚点出现次数不符判 SETUP-FAIL。

`AUDIT-CHECKLIST.md` 因此新增 **§1.6「静态提示词面：人设 ↔ 注册表」**，把这一类列为
每次全面检查的必查项——本类的教训与 v2.1.0 的"身份错乱"同源：**审计维度漏了一整类，
而不是某一行写错了**。

同时新增**随包发布**的人工复核语料 [`prompt-corpus-persona/persona-corpus.md`](../../prompt-corpus-persona/persona-corpus.md)
（+ `.json`）：四个预设的主代理实际收到的 persona 原文、注册工具数、斜杠命令 hint 一览，
由 `audit-persona-surface.test.mjs` 每次运行时确定性重写——复核者不必去翻 YAML。

---

## 6. 测试与审计

| 套件 | 断言 |
|---|---|
| `formal-verify-v2.test.mjs` | **177** |
| `formal-verify-v3.test.mjs` | **189**（另导出 `prompt-corpus-v3/` 交互语料） |
| `formal-verify-v4.test.mjs` | **144** |
| `formal-verify-v5.test.mjs` | **88** |

四套都用**注入的 `subprocess` 服务**做"假 Lean"（退出 0，除非文件里还有 `sorry` 或 `-- FAIL`），
因此**不需要真的安装 Lean** 就能把整条路径（`resolveExecutable` → `spawn` → `collected.stdout` →
退出码 → 归档 → 提示词切换 → 门禁）测到。四套都支持插件覆盖环境变量（`V2_PLUGIN` / `V3_PLUGIN` /
`V4_PLUGIN` / `V5_PLUGIN`）——这是灵敏度探针能生效的前提。

**新增 `audit-formal-sensitivity.mjs`**：33 个探针（v2 9 / v3 8 / v4 8 / v5 9 中的实际数目见运行输出），
每个都故意打破一条不变式并要求**对应架构的套件变红**。脚本本身防住了四种"假绿"：
探针自身启动失败、套件不读覆盖变量、变异语义惰性、变异引入语法错误（每个变异副本都先过 `node --check`，
语法错误直接判 SETUP-FAIL，绝不当作"探测成功"）。

`prompt-v5-integrity.test.mjs` 另加了一组用例，把 Lean 相关提示词原文写进**随包发布的语料**
（`lean-work` / `lean-verify` / `lean-fidelity`），供人工复核"忠实性审查"那段的措辞；
v5 的架构图（`示例图/框架图-v5.svg`）也新增了 Lean 形式化区块。

`audit-v5-integrity.mjs` 的理念门禁从 31 条扩到 **48 条**，其中 17 条专守这个特性。

**新增 `audit-persona-surface.test.mjs`（197 条断言）** 与 **`audit-persona-sensitivity.mjs`（11 条探针）**：
见 §5。它们守的是**静态提示词面**（persona ↔ 注册表 ↔ 斜杠命令 hint/usage），是本次审计新开的一个维度；
套件同时生成随包发布的人工复核语料 `prompt-corpus-persona/`。

---

## 7. 边界（有意为之）

- **框架不内置 Lean**：不装工具链、不下载依赖。没有工具链时三个工具如实返回 `LEAN_NOT_FOUND`，
  形式化代码仍可写下来归档，但无法执行验证（不会崩、不会假装通过）。
- **框架不判断忠实性**：那是代理/人审查并投票的对象；框架只负责把审查焦点**换成**忠实性。
- **Lean 通过 ≠ 命题为真**：它只表示"这段形式化代码通过了内核检查"。这正是 §0 表格里
  "审查对象变化"的含义。
- **`require` 是"搁置"而不是"卡死"**：缺形式化的裁定记为未定论 + 进入待办，研究所继续推进
  （与既有的"未达门槛留库附平均概率"同一取舍），不会被一个对象永久卡住。

---

## 8. 升级

```
npm i dsh-vibe-math@latest
```

无迁移：新参数默认 `off`，四套的既有行为与 `off` 完全一致（v3 的卡片刻意保持字节不变）。
已经在跑的研究所/项目不受影响；把 `formalVerify` 调到 `encourage` 或 `require` 即启用。
