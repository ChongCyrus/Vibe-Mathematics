# 全面检查（audit）必查清单

> **本文件是强制流程，不是建议。** 每次对本仓库做"全面检查 / 找 bug / 优化"时，
> **必须**逐项过一遍本清单。清单的来历是一次真实事故：v2.1.0 在实地测试中，
> 每个成员收到的提示词都写错了身份，而当时 123 条断言 + 15 个灵敏度探针**全部通过**。
> 事故的根因不是某一处代码写错，而是**审计维度本身漏了一整类**——没有人检查"成员读到的文字"。

---

## 0. 铁律

1. **成员读到的文字就是产品。** 提示词（人设 / 状态块 / 每轮问句 / 收件框头 / 回执契约）
   必须像函数返回值一样被断言。任何只检查工具返回值、投影状态、文件内容的测试，
   对提示词缺陷是**盲的**。
2. **身份一律显式传递，绝不猜测。** 禁止从"最近唤醒的成员""列表第一个"之类的全局状态推断
   "这段文字是写给谁的"。宁可显式失败（`V5_INTERNAL`），也不要生成一段身份错误的提示词。
3. **测试脚本必须完整保留交互信息。** 断言之外，还要把交互原文落盘成可人工复核的语料
   （见 §2.4）。"退出码 0"不是验收，"人能读到正确的原文"才是。
4. **探针必须真的能变红。** 一个灵敏度探针如果始终为绿，说明它守的那条不变式**其实没被测到**——
   这比没有探针更糟（它给人虚假的安全感）。

---

## 1. 第一优先：提示词分配与交互内容

**这一节是最高优先级。历史上最致命的缺陷全部出在这里。**

### 1.1 身份分配

- [ ] 每条提示词里的身份（`[状态] 你是 X`）= 这条提示词**实际发给的成员** X？
- [ ] 表头里的身份（`【… —— <职位> <代号>】`）= `[状态]` 里的身份？
- [ ] 随行人设（persona）指向的资料库路径 = 该成员自己的（`Members/<该成员>/`）？
- [ ] 人设里的代号/职位 = 实际职位？
- [ ] 有没有任何地方从**全局可变状态**推断身份（`currentMember`、`list[0]`、闭包快照）？
- [ ] 成员**创建/唤醒的时序**：构造提示词时，该成员是否**已经**被写入权威状态？
      （先落盘、再构造；顺序反了会得到"上一个成员"的身份与"加入前"的编制）
- [ ] 全文有没有 `?` / `undefined` / `NaN` / `[object Object]` 之类占位垃圾？
- [ ] 一条提示词里是否**只有一个**身份声明（不能出现两段互相矛盾的身份）？

### 1.2 编制 / 名额 / 门槛

- [ ] `[在册]` 是否包含读者**自己**？
- [ ] `[在册]` 是否与权威编制一致（不多、不少、无重复）？
- [ ] "有表决权者 N 人"是否等于 `[在册]` 里真正的表决者数（临时工不算）？
- [ ] `m = min(quorumCap, N)` 是否与状态块里报的一致？
- [ ] 未就位/失败/已除名的成员有没有被**如实**呈现（不能静默略去，也不能混进在册）？
- [ ] 轮次号在表头与状态块里是否一致？
- [ ] 编制变动（雇佣/解雇/增聘常驻）后，后续提示词是否立刻反映新编制？

### 1.3 名称与领袖叙事

- [ ] 章程/人设里出现的**每一个代号**是否都真实存在于当前编制？
- [ ] 有没有**硬编码**的代号（例如写死 `acad`），而实际编制可能不同？
- [ ] 当某种职位根本不存在时（例如 `academician:false`），章程是否仍然声称它存在、
      要求成员向它汇报、或承诺它会派活？（这是"指向一个不存在的人"）
- [ ] 章程是**入职快照**还是每次重建都改写？如果它自称"你入职时的…"，就必须冻结在入职时。

### 1.4 交互内容（消息 / 群聊 / 会议 / 辩论 / 分派 / 雇佣）

- [ ] 每条送达消息的**框头署名 = 真实发送者**？（尤其：所办 ≠ 院士；不能署"最近唤醒的成员"）
- [ ] 框头**类型**是否正确？（私信 ≠ 致全体表决者；督办 ≠ 分派；所办分派 ≠ 院士分派）
- [ ] 系统/框架自己发出的反馈，**发送者**是否是框架自己（而不是"该成员发给自己"，
      那会被自消息校验拒掉、静默失效）？
- [ ] 一次提示词里，**同一条消息是否只出现一次**？（**先构造提示词、仅在发送成功后才 ack**（`if (ok && prompt.pending.length) await ackPending(prompt.pending)`）；**同一轮内不重复 prepend** —— 去重靠 `inboxInjected`/`inboxSuppressed`，与 ack 时机无关。**这正是 G1 修好的缺陷**：在构造阶段就确认会丢消息，见 `tests/e2e-v5-round2.test.mjs` §[47]）
- [ ] 会议提示里"其他人的发言"是否只列**别人**、且用真实代号？
- [ ] 表决提示里的对象、陈述、历史票是否与该对象真正对应？
- [ ] 转述/中继的消息（提议开会、增聘、临时工意见、反对分派）是否署**真实发起人**？
- [ ] 分派/督办里"由谁分派""谁督办"是否与真实调用者一致？
- [ ] 人可读镜像（编制表、任务板、会议纪要、辩论录、结案）里的代号/职位/雇主是否正确？
- [ ] **回执契约**：框架实际处理的每个字段，是否都在 `replySpec` 里出现且按职位裁剪？
      （藏起来的字段 = 不可发现的通道）

### 1.5 时序与幂等

- [ ] 重放同一事件（`subagent/end` 重复、重复提议）会不会产生**重复**的交互内容？
- [ ] 成员被解雇/失败后，还会不会收到后续消息？
- [ ] 会话重建（resume）后的提示词，措辞是否与"新入职"区分开？

### 1.6 静态提示词面：人设 ↔ 注册表

1.1–1.5 检查的是**运行时逐条发出的**提示词；还有一层**静态**提示词面必须一起核对——
`agent.cordis.yml` 的 persona 行。它是主代理收到的**唯一**一份"有哪些工具、能调哪些参数"的清单，
而所有 e2e 套件都直接 `apply(ctx)`，**从不加载 YAML**，因此对这一层完全盲。

- [ ] 注册的**每一个工具**是否在 persona（`prefix` 与 `text` **两个**块）里出现？
      没出现 = 代理**无法发现**该能力（连准确名字都猜不到）。
- [ ] persona 里出现的**每一个** `vibe_*` 名字是否都真的注册了？
      出现但未注册 = 代理会去调用一个必然失败的工具。
- [ ] 新参数是否同时进了 persona 与工具 description 的参数表？
      （例：`formalVerify` / `leanCommand` / `leanArgs` / `leanTimeoutMs`）
      参数没写进 prompt = 用户无法开启这个能力。
- [ ] `prefix` 与 `text` 两个块是否**逐行一致**（只允许第 0 行不同）？
      旧宿主读 `text`、新宿主读 `prefix`，两者漂移 = 不同宿主看到不同的工具面。
- [ ] 工具**改名/删除**时 persona 是否同步？（"persona 提到的名字 ⊆ 注册表"这条反向检查负责抓）
- [ ] 人设里写的路径/模式名（`Formal/Lib`、`off|encourage|require`）是否与实现中的字符串**逐字**一致？

`audit-persona-surface.test.mjs` 把上述各条变成断言（"未文档化工具"用**显式快照**表示：
新增工具必须主动改快照、或在 persona 里写清）；`audit-persona-sensitivity.mjs` 用 16 条探针
证明这套断言真的会变红。**v2.3.0 修的就是这一类缺陷**：三个 `*_lean_*` 工具无条件注册，
而 v2/v3/v4 的 persona 从未列出它们（只有 v5 列了），v4 的 `vibe_v4_set` 参数表也漏了
`formalVerify`/`leanCommand`/`leanArgs`/`leanTimeoutMs`——当时**所有既有套件全绿**。

### 1.7 语义映射：把"事实"映射成"字段值"时不能张冠李戴

§1.6 查的是"名字/路径/参数有没有写对"；这一节查**语义有没有写反**。它比漏写更危险：提示词读起来
通顺、完整，而套件往往只断言"包含某句话"就能全绿。

- [ ] 每一个"发现 X 就投 Y"的映射是否**语义正确**？**真实事故**：Lean 形式化与命题原文不一致时，
      提示词要求"投 0"——而 0 的含义是"**命题为假**"。于是"形式化写错了"被记成"命题被证伪"，
      在布尔一致规则下直接被写进 `Verified/` 标注**假**：用来求真更严格的机制，反而**伪造出
      一个错误的否定结论**。现在改为独立一档 `defect`（撤回证明 + 进待办 + 不定论）。
- [ ] **反向情形**的指令是否也在？（"只有独立于该证据也能确定时才可否决"这类边界必须写出来，
      否则代理只会照字面把"证据不合格"当成"结论为假"。）
- [ ] 提示词承诺的**框架行为**是否真的实现了？**真实事故**：v2 的提示词让代理"在回执的 `formal`
      字段写明难度判断"，但回执契约里没有这个字段、框架也从不解析它——代理的判断**静默消失**，
      而套件只断言"那句话存在"，177 条断言全绿却守着一个**死通道**。
- [ ] 提示词承诺的**强度档位**是否与实现一致？（`encourage` 档没有门禁，就**不能**声称
      "框架会搁置本次裁定"；只改文字不改机制 = 骗代理。）
- [ ] 每个档位（`off` / `encourage` / `require`）的注入文本是否**各自**被人读过？只读一个档位等于没读
      ——首版 `require` 档的门禁措辞从未进入任何语料。

### 1.8 四套同构：任何语义修正必须**四套同步**

v2/v3/v4/v5 是**同构实现**（同一份契约、四份独立代码，刻意零共享）。这带来一个特有的缺陷类别：
**修正只落到一套**。真实事故（2.3.1 → 2.3.2）：

- `defect` 的"`encourage` 档不得声称框架会强制搁置"这条修正只改了 v5，另外三套仍无条件宣称
  "本次裁定**不定论**"——承诺了 `encourage` 档根本无法强制的行为；
- "撤回归档证明"在 v5 是**删除 → 校验真的没了 → 否则覆盖撤回说明**，另外三套只做尽力删除
  （两套静默吞掉失败、一套不校验）——宿主删不掉时，已撤回的证明仍留在 `Verified/Lean/<id>.lean`
  这个"大家找证明"的位置；
- `formal` 回执通道在 v2/v3 有 `formalOn()` 守卫，v4/v5 没有——`off` 档可被残留回执写入状态。
- **「随手一次动作不得撤销已成立的证明」这条规则在四套里各写了一遍，却只在一套里被断言过**（v4 的
  `formalSetRun`）：确认轮实测发现 v2 的 `used` **回执**通道无条件降级 `passed`（同一条规则的另一条
  路径），v3 只保留 `passed` 而把 `blocked` 打回 `attempted`（门禁被重新关上）。同一语义在**多条路径**
  上要逐条核对：工具路径、回执路径、归档路径各自独立。

所以：

- [ ] 任何语义/措辞修正，**逐一核对四套**（含各自的 `实现方案.md`、persona、语料与断言）；
- [ ] 参数、工具名、字段名、路径、错误码这类**表面**已有静态守卫
      （`audit-persona-surface` / `audit-spec-traceability` / `audit-prompt-invariants`）；
      但**语义**（承诺强度、失败回退、边界条件）没有静态守卫，必须靠"把四套**渲染后的提示词/行为**
      并排对照"来查——随包语料就是为这个准备的；
- [ ] 用**同一份输入**驱动四套，比较**可观测结果**（记录落库、文件是否撤回、门禁是否放行），
      而不是比较代码长得像不像。

### 1.10 id 映射不许"猜"：能从权威来源拿，就不要从名字解析

两套 id 空间（对象 id ↔ 验证 id）之间**只能有一处映射**（v2 的 `formalObjectIdOf`），但"一处"不等于"正确"：
从**名字**反推归属，一旦名字本身带有会被当成后缀的部分（对象 id `p-ineq-s1` 长得就像"`p-ineq` 的第 1 个解法"），
就会指向**另一个对象**——而且后果往往是破坏性的（把别人的归档证明撤回）。

- [ ] 该映射是否优先使用**权威来源**（框架生成 id 时就知道的归属）？
- [ ] 权威来源不在内存时（resume 早期），记录里是否**持久化**了 `objectId` 可查？
- [ ] **从用户可编辑的状态文件里读出来的"权威值"是否先做了自洽校验？** 状态文件（如
      `VibeMath_State/formal.json`）是可以被人改的：**真实事故（2.3.7）**——某条记录的 `objectId`
      被写成 r 形（`r-pX`）时，"验证 id → 对象 id"会映射到**它自己**，于是"两套 id 一起写"退化成
      只写验证侧、对象侧仍是 `passed`。修法：锚点必须自洽（不以 `r-` 开头）才可用，读与写两处都校验；
      灵敏度探针见 `_oneoff/probe-v2-anchor-guard.mjs`（去掉守卫 → 用例变红）。
- [ ] 字符串解析是否只作为**兜底**，而不是唯一手段？
- [ ] **真实事故（2.3.6）**：`formalObjectIdOf` 无条件剥离 `-sN/-pfN/-rfN`，于是命题 `pAmb-s1` 的
      验证 id `r-pAmb-s1` 被解析成对象 `pAmb`；一句 `defect` 于是降级并**撤回了 `pAmb` 的归档证明**，
      而真正有问题的 `pAmb-s1` 仍然 `passed`。修前用 6 条断言复现，修后 348/0。

### 1.9 工具参数 schema：文档写了 ≠ 工具收得下

§1.6 查的是"persona 里有没有写"，这一节查**工具的参数 schema 收不收得下**。本仓库所有工具 schema 都由
`objParams` 收口，并以 `additionalProperties:false` **关闭**。**但"关闭"的强度取决于注册路径**（v3 审计 M5
的更正，Round B 复核扩大）：只有走宿主 `defineTool` 的工具，宿主才会用该 schema 校验实参、把未列出的键
**直接拒绝**；`tools.register`（裸 `ToolDefinition`）只把 `parameters` 生成给模型的 schema，宿主**从不校验实参**，
`additionalProperties:false` 在那里只是给模型看的**文档**。**四套预设全部走裸注册**
（`grep defineTool vibe-math-v{2,3,4,5}.js` → 0 命中；`tools.register` 各 1–3 处），所以"schema 与参数层不一致
就静默成功（fail open）"对**每一套**都成立，不只是 v3。最典型的反例是 `vibe_math_setup` 公布 `mode`、而
`vibe_math_set_params` 的 schema 里一度没有它：模型看不到这个键，写给它却仍会被 `sanitizeParams` 收下
（该键已补进 schema，两条注册路径的键集现在一致）。

- [ ] 每个"可调参数"是否同时出现在：**设置工具的参数 schema**、发现面（`vibe_math_setup` 返回的
      `PARAM_SCHEMA` / v4·v5 的 status 参数表）、`<vibe root>/*setting.json` 模板、以及 persona 参数表？
      **真实事故（2.3.2 D1）**：v3 的四个 Lean 参数写进了 persona、规格与状态行，却**从未写进
      `vibe_math_set_params` 的 schema**；所有套件全绿（套件直接调 handler、绕过 schema），而用户
      **永远无法开启这个功能**。
- [ ] schema **声明的**每个键，参数层是否**真的接收**？（v2/v3 的闸门是 `DEFAULT_PARAMS` 的键集、
      v4 是 `k in params`、v5 是 `normalizeParams` 的类型列表。）声明而不接收 = 调用返回 `{ok:true}`、
      什么都不发生——最容易被读成"设置成功"的静默失效。
- [ ] 同一工具被**注册两次**（v2/v3 各有"会话 handler 表"与"真实 `tools.register`"两份定义）时，
      两份 schema 是否**逐键一致**？漂移会让其中一条路径上的功能不可达。
- [ ] 新增/修改任何参数后，跑 `node tests/audit-prompt-invariants.mjs`（I13/I14）与
      `node tests/audit-prompt-invariants.mjs --self-probe`（证明这两条不变式**真的会变红**）。

> **守卫为什么必须是"可被证伪的"**：I13/I14 用 `--self-probe` 在内存里注入真实缺陷形状
> （v3 少一个 Lean 参数 / v4 多一个参数层不接收的键 / v5 的 `normalizeParams` 少一项），
> 要求对应不变式**变红**，并要求**未变异的对照跑仍为绿**。没有对照的探针会把"脚本坏了"当成"守住了"。

### 1.11 测试与脚本的路径必须可移植（不许写死本机路径）

测试和脚本"在我机器上是绿的"不等于它们能跑。**真实事故（2.3.13 归档时发现）**：5 个测试/脚本把
本机绝对路径写死在源码里（`D:/wd/vibemath开发/...`、`C:/Users/admin/...`），其中
`audit-fuzz-helpers.mjs` 当时**是随包发布的**——对任何用户都跑不了，而仓库里从来没人发现，
因为作者机器上它恰好是对的。（那些路径后来都改成由 `import.meta.url` 推导；Round B 复核：`tests/`
下已经没有任何真实的写死盘符路径，而且 `audit-fuzz-helpers.mjs` **现在也不再随包发布**——
它不在 `package.json` 的 `files` 里，也不在 `npm pack --dry-run --json` 的清单里。）

- [ ] 每个文件路径是否都由 `import.meta.url` / `npm root -g` / 环境变量**推导**出来，
      而不是写死盘符或用户名？（推导不出时应当**报出所有试过的候选路径**，而不是静默跳过。）
- [ ] 文件被移动/改名后，**引用它的每一处**是否都跟着改？（包括：`package.json` 的 `files`、
      `run-tests.mjs` 这类 runner、守卫里按名字读套件的表、文档里的命令行、README 链接。）
- [ ] 新增/改名 `tests/` 下的脚本后，确认 **`run-tests.mjs` 真的收集了它**：runner 收集 `tests/` 下
      **所有** `.mjs`（`*.test.mjs` 是套件，其余是探针），只有登记进 `NEEDS_ARGS` 的脚本才会被跳过，
      而那个登记会在**开发检出**（存在 `.git`）里被逐项校验——条目失效就直接报错退出，所以改名不能
      悄悄把一条守卫踢出发布门禁。参数变体（同一脚本跑多次，如 `audit-registration.mjs` 四个预设）走
      `VARIANTS`。
- [ ] 命令行/相对链接是否需要**从仓库根执行才成立**？写清楚起点（如 `node tests/run-tests.mjs`），
      别留一个照抄就报"找不到文件"的用法行。
- [ ] **搬动之后必须有不依赖"跑绿了"的证据**：① 每个套件的断言条数与搬动前**逐项相同**；
      ② 建一个 `git worktree` 拿改动前的检出，同一套件在两种布局各跑一遍，归一化路径/临时目录/耗时后
      **逐行比对**（`_oneoff/layout-invariance.mjs`）；③ 相对链接扫描 0 失效（`_oneoff/scan-links.mjs`）。
- [ ] 讲"全套件 / 门禁 / 多少次全绿"时，是否区分了**随包发布面**与**仓库**？`package.json` 的 `files`
      只发 `tests/` 的 **95** 项（**文件计数**；其中 `.test.mjs` **41** 个），完整门禁（`node tests/run-tests.mjs`，
      当前 **131 项作业（job count）= 68 套件 + 63 探针/变体**，由 `node tests/run-tests.mjs --counts` 派生）只在开发检出里成立。两边的清单见
      `docs/test-timing.md` §1.1；发布物里的 runner 会把缺失/跳过项**打印出来**（不会静默少跑），
      所以"安装用户照文档跑得到全套件"这类说法必须避免。
- [ ] **runner 本身也要跑一遍**：直接跑套件通过 ≠ 并行 runner 通过（2.3.13 就出现过
      "26 个套件直接跑全绿、`run-tests.mjs` 因为按裸文件名 spawn 而全红"）。发布门禁必须包含 runner。

---

### 2.1 逐条断言，而不是抽查

对**每一条**捕获到的提示词都跑一遍通用扫描（身份一致性、编制一致性、无垃圾、无重复投递），
而不是只挑几条看。给出**精确的期望值**（例如 4 名创始成员各自的 `[在册]` / m / 表决者数），
而不是"包含某些关键词"。

### 2.2 期望值要能证伪

- 断言"此时**还没有**定论"时，**必须**同时断言"这一轮真的走完了"（例如断言阶段已推进到
  `debate`、或恰好收齐 N 张票）。否则预算不足会让"还没有"**无条件成立**，
  无论规则被破坏成什么样。
- 断言顺序：先确认前置状态已达成，再断言结果。

### 2.3 用例互相隔离

每个用例用**独立的会话根/工作区**，并在结束时暂停它。
否则一个用例遗留的心跳/会议/验证会污染下一个用例（表现为"某个用例莫名其妙收不到唤醒"）。

### 2.4 保留交互语料（**强制交付物**）

测试脚本除了断言，还必须把**框架真正发出的每一条提示词原文**落盘：

- 机器可读（JSON）+ 人可读（Markdown）；
- 覆盖全部交互类型（入职、重建、常规轮、心跳、表决初评/辩论、会议、提议、各类框头、框架提示、失败）；
- 把工作区路径归一化（如 `<WS>`），使语料**确定性、可 diff**；
- **归一化必须大小写与分隔符无关**：Windows 下 `os.tmpdir()` 可能给出与插件渲染路径**不同大小写**
  的同一目录，`split(WS)` 会漏掉全局根（如 `<VibeMath 根>/Formal/Lib`）的绝对路径——语料因此
  **每次运行都变**（临时目录名一变就 diff 一大片）并**泄露本机路径**。真实事故，已修；
- **时间戳也要归一化**：提示词表头自带 `### YYYY-MM-DD hh:mm:ss｜<成员>`，不归一化就**逐次都变**，
  diff 完全失去意义（真实事故：v5 语料里 54 处时间戳）。判据很简单——**连续跑两次，哈希必须相同**；
- **随包发布**，作为人工复核提示词正确性的入口——复核者不必去翻会话日志。

### 2.5 每个不变式都要有灵敏度探针

- [ ] 每个"提示词/交互"不变式，都有一条探针**故意打破它**，并要求对应套件**变红**。
- [ ] **探针必须真的启动被测套件**：检查工作目录/路径解析。
      曾因工作目录被百分号转义（Windows 中文路径 + `URL.pathname`）导致子进程**全部启动失败**，
      "非零退出"被当成"探测成功"——整份审计是假的。
- [ ] **探针必须被目标套件真正读取**：曾因某个 e2e 套件**不读** `V5_PLUGIN` 环境变量，
      针对它的探针跑的是**未变异**的插件，恒为绿。
- [ ] **变异必须真的改变行为**：很多守卫是互相遮蔽的，删掉其中一个其实是**语义惰性**的
      （例如同一规则在三处重复检查，只削弱一处仍会被另外两处挡住）。
      这类变异不能做探针——它会让审计误报"盲点"。
- [ ] 探针**不得引入语法错误**：语法错误导致的非零退出同样是"假红"。
      每条变异都应能被 `node --check` 通过。
- [ ] 变异必须替换锚点的**全部**出现：`String.prototype.replace` 只替换第一处。同一份契约常在
      两处发出（例如 v5 的回执契约同时出现在 `replySpec` 与表决提示词里），只改一处时套件
      **合理地保持绿色**——那是**假盲点**，比漏测更误导（会让人去"修"一个本来就是对的不变式）。
      锚点声明了几次出现，就要替换几次；脚本应对此显式断言。
- [ ] 守 **persona 静态面**的套件也要有探针，且该套件必须支持"指向副本"的环境变量
      （`audit-persona-surface.test.mjs` 的 `PERSONA_ROOT`）：探针变异的是**副本**，
      套件不读这个变量就永远在跑原始文件、恒为绿（同 §2.5 第二条）。
      探针脚本还应在开跑前先确认"**未变异**的副本是绿的"，否则它探测到的可能是覆盖机制本身。
- [ ] 对**不可达**的守卫（设计上互斥、永远不会进入的分支），**不要**留一个永远为绿的探针；
      要么写行为可观测的等价探针，要么显式删除并在脚本里注明原因。

---

## 3. 一个高效的补充手段：**把不变式写成文档/图，再拿它去对代码**

本次修复中最后找到的一个真实缺陷（会议与验证的"互斥"只做了单向）就是这么被发现的：
为 v5 画架构图时，被迫把"会议与验证互斥"写成一句**明确的不变式**，然后拿这句话去逐条对照代码 ——
发现 `startMeeting` 有守卫、`armNextVerify` 没有。单看任何一处代码都不觉得有问题，
是"写下不变式 → 双向核对"这个动作把它逼了出来。

所以：

- [ ] 画架构图/写规格时，**每一条箭头与每一个"互斥/永不/必须"的措辞都要落到代码里核对**，
      特别是**成对出现的关系**（互斥、双向、唯一、幂等）——只做一半是最常见的形态；
- [ ] 文档里凡是出现"二者互斥""永不同时""必然"这类断言，都要问一句**它在代码里由谁保证**；
      若答案只在一个方向上成立，那就是缺陷；
- [ ] 相对顺序**不可观测**的地方（因为互斥）不要写成精确的优先级列表假装精确，
      而要写明"二者互斥，故顺序无关"。

---

## 4. 第三优先：其余（沿用既有做法）

- [ ] 静态自检：调用了但未定义的函数、未声明的参数键、不存在的会话 API 方法、
      已文档化但从未抛出的错误码、遗留的开发标记。
- [ ] 需求可追溯：方案里列出的工具名、参数名、理念条目，代码里是否都存在。
- [ ] 失败路径：看门狗、幂等、崩溃恢复、降级后端、配额、越权。
- [ ] 全量回归：**所有**历史套件，且逐个检查退出码（不要用管道截断输出，
      管道会吞掉退出码或造成 EPIPE）。**用 `node tests/run-tests.mjs` 并行跑**（并发 = min(4, 核数)），
      它会打印每项耗时、wall/sum、加速比与最慢几项——**先看时间再决定策略**，基线见
      [`docs/test-timing.md`](test-timing.md)。若某个套件远慢于基线，先查它是否在等一个
      **永远不会发生的条件**（真实事故：v2 套件 186 s，主因是一次 `tick(1100)` 嵌在
      "从不提前退出"的 16 次循环里）。
- [ ] **产物是异步写出来的**：驱动循环（"安静即停"）可能在框架把卡片/状态文件落盘之前就退出，
      而 `assert(existsSync(f))` **不会抛**、紧随其后的 `readFileSync(f)` 会抛 `ENOENT` —— 一次抖动
      就变成**未捕获异常**，整个套件中止、后面所有断言全部丢失（真实事故：并行跑时
      `e2e-v4-fixes` 崩在 `Verified/命题/m-meth.md`，12 个用例只跑了 2 个）。写法：
      先 `await waitFor(()=>existsSync(f), 3000)`，再用**防御性读**（`try{…}catch{return ''}`）
      ——缺文件必须是**一条干净的断言失败**，绝不能是崩溃。参见该套件里的 `readArtifact`。
- [ ] 发布产物自证：不是"publish 退出 0"就算完成——要从 registry 取回 tarball，
      核对 shasum、逐字节比对插件、确认修复标记存在、并在**已发布包内**跑一遍套件。
- [ ] **每个"自己动手抹注释/抹字符串"的脚本都要有解析级自检**：这类扫描器一旦读错词法
      （最典型：正则字面量里的引号被当成字符串开头），它脚下**所有**静态检查都会静默失明。
      真实事故：`audit-prompt-invariants.mjs`（2.3.2 完全不认正则 → 四套源码抹完直接语法错误）与
      `audit-v5-integrity.mjs`（不认正则 → v5 有 30 行读错、抹完不能解析）。自检写法：把抹除后的
      真实源码写进临时文件跑 `node --check`，再加一个"引号在字符类里"的夹具。**并且在写结论前先量准**
      ——用"下一个引号"估算受影响区域曾让我把 30 行误报成 402 行。
- [ ] **发布元数据交给序列化器**：不要用字符串替换手写 `package.json` 的字段（`compatNote` 里一个
      ASCII 双引号就能产出非法 JSON；`\\u0000` 之类转义在单引号字符串里会变成真控制字符）。
      正确写法是 `JSON.parse` → 改属性 → `JSON.stringify(pkg, null, 2)`，写完再 `JSON.parse` 复核
      并扫描控制字符。

---

## 5. 汇报要求

- 缺陷要分**类**："这一整类此前没有审计维度"比"修了 N 个 bug"更重要。
- 假绿/假红必须单独说明：**审计本身失效**是最严重的发现。
- 每条结论都要给出**可复核的证据**（真实日志片段、语料原文、可重跑的命令与结果）。

---

## 6. 发布说明（Release Notes / GitHub Release）格式

**中英双语、先中文后英文，只写"给用户看的信息"。** 工程过程（探针结果、断言条数、事故复盘、行号与
内部编号）属于 `_oneoff/audit-findings-*.md` 台账与提交信息，**不进**发布说明。

固定骨架（只有版本号、标题与正文随版本变，**节名不变**）：

```markdown
# dsh-vibe-math <版本> — 发布说明（中文）

> 上一版：<版本>。<一句话：这一版是干什么的、是否影响行为。>

## 概览
## 变更
## 兼容性
## 升级

---

# dsh-vibe-math <版本> — Release Notes (English)

> Previous: <version>. <One sentence: what this release is and whether behaviour changes.>

## Overview
## Changes
## Compatibility
## Upgrade
```

- [ ] 两个 H1 都在；**英文那份的 H1 必须含 `English`**（人工检查：本仓库**没有任何 CI 工作流**，
      `scripts/` 只有 `build-preset-rows.mjs`，不存在所谓的"发布门禁阶段 1c"）；
- [ ] 中文部分 ≥ 150 个汉字（同样人工检查），英文部分不得残留未翻译段落；
- [ ] 每条变更都回答"**对使用者有什么影响**"——不写内部编号、探针名、断言条数；
- [ ] 「兼容性」明确回答：四套预设的字节/行为是否变化、参数与工具面是否变化；
- [ ] 「升级」给出可直接复制的命令（`npm i dsh-vibe-math@latest`；若 profile 里把版本钉死了，
      写出对应的 `dsh plugin --profile <name> add dsh-vibe-math@latest`）；
- [ ] **发布前把草稿交给用户确认**（在对话里展示全文，或用提问工具）；用户同意或给出修改意见后再发布；
- [ ] GitHub Release 的正文 = 这份文件本身（`gh release create --notes-file <该文件>`），标题中英并列。

---

## 7. 中英双语 README 与英文版架构图（2.3.16 起）

- **默认语言**：`README.md` 为中文（默认、GitHub 首屏），`README.en.md` 为英文；两文顶部各有一行切换器
  （中文版 `[English](README.en.md) | 中文`，英文版 `English | [中文](README.md)`）。不建 `README.zh.md`。
- **结构同构**：标题层级序列、表格行数、代码块数、图片数量、本地链接集合必须一一对应；
  唯一允许的差异是四张架构图各自指向 `-en` 版本（按序号配对校验）。
- **文件与产物名不翻译**：真实目录/文件名（`示例图/…`、`docs/架构图.md`、`Verified/命题/`、`Logs/报告.md`）、
  真实 JSON 键（`已解决`、`正确概率`）、真实格式锚点（`- ID/类型/状态/概率/…`、`### 解法/证明/证伪 N｜标题｜概率X｜状态Y`）、
  会话重建标记 `【会话重建 —— <role> <id>】`、v2/v3 真实 md 字段名（`可信断言`、`上级体系`、`子方法`）**保持原样**，
  首次出现处可加括注；除此以外的正文必须是英文（`tests/audit-readme-bilingual.test.mjs` 的 CJK 预算兜底）。
- **架构图**：四张英文图 `示例图/框架图-v{2,3,4,5}-en.svg` 只被 `README.en.md` 引用，中文图不受影响；
  v4/v5 用现有零依赖生成器加 `--lang=en`（`docs/generate_framework_diagram_v4.mjs`），
  v2/v3 用独立的零依赖 Node 生成器 `docs/generate_framework_diagram_v{2,3}_en.mjs`（中文 v2/v3 海报仍由 matplotlib 脚本产出）。
  英文图内只允许保留上述"真实字面量"的中文，`tests/audit-diagram-assets.test.mjs` 按图核 CJK 预算。
- **历史文档必须标注适用范围**：描述旧版本布局的文档（如 v1 时期的 `docs/架构图.md`）要在开头写明它描述的是哪一版，
  不能在被 README 当作"当前详解"引用时静默误导（`qs.csv`、`Pending_Verification/` 等 v1 名称在 v2 起已不存在）。

---

## 8. 宿主版本线适配与发布流程实测教训（2.4.0 起）

### 8.1 一条版本线一个机制：先定"形态"，再谈"版本"

DSH 的 **agent preset 交付方式**在 0.1.6 → 0.1.7 之间换过一次，且**旧机制是被彻底删除**的：

| 版本线 | preset 形态 | 本文档对应做法 |
|---|---|---|
| ≤ 0.1.6 | 目录 `<DSH_HOME>/.agent-presets/<id>/{agent.cordis.yml,preset.yml,…}` | `installer.js` 复制（`detectPresetMechanism` 判为 `directory`） |
| ≥ 0.1.7 | 组合行 `@deepseek-ai/dsh-agent-preset`（`agentPresets.register({id,plugins,…})`） | `cordis.patch.yml` 里的声明行（判为 `rows`，安装器跳过目录同步） |

**判定必须用能力，不要用版本号**：`agentPresets` 服务在两条线上都存在但语义不同（旧线是目录扫描器、没有 `register`），
所以判定改成读 **loader 入口树**里有没有 `@deepseek-ai/dsh-agent-preset`（或其 registry）——这在任何插件激活之前就可见，
而"读服务"在 bundle 被单独激活（`dsh plugin add`）时可能还没就绪。**旧线上"装了但看不见"正是本版修掉的那类缺陷。**

### 8.2 组合行声明的四条硬约束（都是实测出来的）

1. **`dsh.bundle.patch` 必须是字符串**。数组形态只有 ≥ 0.1.7 接受；0.1.5/0.1.6 会把该值直接送进 `path.join`，
   结果是整个 profile **起不来**（`ERR_INVALID_ARG_TYPE`）。要多个 patch 就合并成一个文件。
2. **声明行不要命名宿主包**（如 `@deepseek-ai/dsh-agent-preset`）：旧线上该包不存在，行会 `failed to import`，
   每次启动都报一条激活失败。改成本包自己的模块（`preset-declaration.js`），它在旧线上**什么都不注册且不报错**。
3. **声明行不能用 `disabled: !!js` 做版本门**：patch 表达式里 **`ctx.get(...)` 会抛**（实测：常量、`typeof ctx` 正常，
   任何服务查询都让入口永远不初始化，报 "N entries did not activate"）。要按宿主能力分流，就分到**代码里**（运行时读服务）。
4. **声明行里的 `name` 不会被改写成文件 URL**（app-boot 只递归 group 的 config），loader 会拿**profile 目录**去解析相对路径
   → `./vibe-math-vN.js` 必 ENOENT、整个 preset 拒绝挂载。必须用**包内子路径**（`dsh-vibe-math/vibe-math-vN/vibe-math-vN.js`）+ `exports` 放行。

### 8.3 不要在宿主的"历史事件"面上存自己的状态

会话日志是**只增不改**的，但**读它是严格的**：持久化层遇到不认识的 `type` 会**拒绝加载整个会话**，除非写入方标了
`ignorable: true`——而 `Session.append` **无法**设置该字段（只有构造种子能）。所以"把插件状态写进会话日志"这条路
会让**用户自己的会话在下次恢复时打不开**（静默：写入成功、失败发生在之后的加载）。自研状态请落在自己的文件里（v5 即如此）。

### 8.4 发布流程：`npm publish` 返回 202 不是失败

- `npm publish` 得到 **HTTP 202** + "Your package is being processed…" 时，registry 正在**异步处理**；此时 `npm view` /
  `dist-tags` / 版本 manifest / tarball 都可能是 404 或旧值，**持续数分钟**。
- 期间重发会得到 **409 `Cannot publish over previously staged version`**——这句措辞会让人误以为被扣下等 2FA 批准
  （`npm stage list` 实测为空，并非 staged）。**正确处理：等待并轮询 packument**（`dist-tags.latest` + `/<pkg>/<ver>` + tarball HEAD），
  **绝不在此时改版本号或内容**。
- `dsh plugin --profile <p> add` 在 Windows 上可能**在 pnpm 完成后才崩**（`0xC0000409`，报 "pnpm failed"）：
  **不要信退出码**，查 `package.json` 的 spec、lockfile、`node_modules` 三处是否一致，不一致就只对齐 manifest。

---

## 9. 插件目录安全基线（收录进 awesome-ai-plugins 起）

本项目被 [awesome-ai-plugins](https://github.com/hashgraph-online/awesome-ai-plugins) 收录，其 CI 对**源仓库**跑
[HOL Guard 扫描器](https://github.com/hashgraph-online/hol-guard)：**评分 ≥80 且不得有 critical/high 发现**才允许合并。
下面这些是硬门槛，改动代码时不要踩回去（首次提交实测 73 分、2 个 high，被拦下）：

| 扫描规则 | 要求 | 本仓库的做法 |
|---|---|---|
| `DANGEROUS_DYNAMIC_EXECUTION` (high) | 仓库里**不得**出现 `eval` / `new Function` —— 包括测试与脚本 | 需要"执行真实实现"的套件改为 `await import(<preset 模块>)` + 预设导出的 `__testHelpers` 测试接缝，不再把源码文本编译成函数；`node:vm` 同样属于动态执行，不要用它绕过 |
| `SECURITY_MD_MISSING` (low) | 仓库根有 `SECURITY.md`（支持版本 + 上报流程） | `SECURITY.md`（含本包攻击面说明：无网络、无凭据、无动态执行、只写工作区） |
| `DEPENDABOT_MISSING` (low) | `.github/dependabot.yml` | 本仓库**不配置**（§9.1：低危可接受，实测 94 分仍通过） |
| `DEPENDENCY_LOCKFILE_MISSING` (medium) | 有 `package.json` 就要有 lockfile | `package-lock.json`（本包零运行时依赖，lockfile 只有根条目） |
| 未固定的 Actions | 第三方 Action 必须钉到 commit SHA | 本仓库**无工作流**（§9.2）；将来若引入，必须钉 SHA 且保留版本注释，`permissions: contents: read`、`persist-credentials: false` |

另外目录要求的**包侧**条件（`CONTRIBUTING.md`）：`package.json` 里要有可安装的 `dsh.bundle`，插件要导出 `apply(ctx)`，
并且**在本仓库 README 里写明包名或 `dsh plugin add` 命令**、条目里用**准确的仓库 URL**。

自查方式（无需 Python 环境也能跑：用 DSH 自带运行时里的 Python 装一次 `plugin-scanner`）：

```powershell
& "<python>" -m pip install plugin-scanner
& "<python>\Scripts\plugin-scanner.exe" lint "D:\wd\vibemath开发\Vibe-Mathematics" --format json   # 逐条规则
& "<python>\Scripts\plugin-scanner.exe" scan "D:\wd\vibemath开发\Vibe-Mathematics"                 # 评分
```

本地 `plugin-scanner` 的评分与他们 CI 的评分**实测一致**（首次提交时两边同为 73），所以本地复现即可预判 CI；本仓库当前为 **94 分、1 个低危**（见 §9.1），达标线是 §9.2 的「≥80 且无 critical/high」。
目录侧的检查（格式、字母序、条目可解析）由他们的 `check-alphabetical.py` + `validate-contribution.py` 在 PR 上跑：
本仓库的条目必须放在 `### DeepSeek Harness Plugins` 小节里、按**显示名小写**字母序（`Vibe-Mathematics` 排在 `humanizer-ru` 之后）。

---

### 9.1 为什么本仓库**没有** Dependabot（别再顺手加回去）

扫描器有一条 `DEPENDABOT_MISSING`（低危，值 5 分），最初为凑分加过 `.github/dependabot.yml`，随后它立刻开出一批
"补课" PR（`actions/checkout` 4.2.2 → 7.0.1、扫描器 action 补丁升级）。实测各档分数后决定**移除**：

| 配置 | 分数 | 通过（阈值 80 + 无 high） |
|---|---|---|
| 全都有（含 dependabot） | 100 | ✅ |
| 去掉 `dependabot.yml` | **95** | ✅ |
| 再去掉 `SECURITY.md` | 91 | ✅ |
| 再去掉 `package-lock.json` | 86 | ✅ |

结论：**低危项不是必需的**——阈值 80，去掉它仍有 95 分。本仓库零运行时依赖，依赖面只有 `.github/workflows` 里两个 Action，
为它们维护一个每周开 PR 的机器人，**换来的是维护者每次都要做决定**，不划算。改为：

- ~~`node scripts/check-action-versions.mjs`（npm script：`npm run check:actions`）~~（当时的做法，已随工作流一并删除，见 §9.2）——它曾读出工作流里所有
  `uses: owner/repo@<sha> # vX.Y.Z`，用 GitHub API 比对上游最新 release，落后的打印**可直接替换的整行**，退出码 1；
- ~~**例行检查与每次发布时跑一次**（发布清单里带上），需要升级时由维护者显式改这一行，而不是被动接 PR。~~（同上，已删除）

顺带记住两条与它相关的既有纪律：工作流里的第三方 Action **必须钉 commit SHA**（目录扫描器与供应链原则都要求），
且钉法要**同时保留版本注释**（否则别人无法判断钉的是哪版）。

### 9.2 本仓库**不使用** GitHub Actions（2.4.0 之后又撤掉了）

办理收录时我一度加过 `.github/workflows/plugin-security-scan.yml`（在**本仓库**每次推送时跑同一个扫描器）。
事后复核目录规则才发现**这是可选的**：`CONTRIBUTING.md` 与 `SCANNER_GUIDE.md` 都写明
"Scanner CI in the source repository is optional for listing"，必需的只是**他们 CI 对我们仓库的集中扫描**——
而那个扫描是在他们的 runner 上克隆本仓库后执行的，**不运行本仓库的任何工作流**，所以本仓库有没有工作流与能否收录无关。

实测代价/收益：保留工作流 95 分，删掉 94 分（阈值 80）；它唯一的真实成本是"长期盯两个 Action 的版本"。
故**撤掉**：本仓库现在没有任何 Actions，也没有 dependabot；`.github/` 目录不再存在。

取而代之的纪律（**别再顺手加回 CI**）：

- **例行检查与每次发布前，在本地跑一次扫描器**（与目录同款，规则一致）：
  `plugin-scanner lint <repo> --format json`（逐条规则）/ `… scan <repo>`（评分）；
  要求：**分数 ≥80 且无 critical/high**。命令与安装方式见 §9 顶部。
- Action 版本核对脚本已随之删除（没有工作流就没有可核对的 pin）。**若将来有人（包括我）真要引入工作流**：
  第三方 Action 必须钉 commit SHA 并保留版本注释，同时把本节的结论一并更新，并说明这次引入解决了什么原文中非做不可的问题。


## 本周期新增守卫索引（守卫/章节 → 它钉住的不变量 → 证明它会咬的变异）

> 维护规则：只列**能在代码里指出来**的守卫；每行给出"不变量"与"变异"两列。**变异脚本多数已随包** —— 形式是 `tests/*.mutants.mjs`（单位：文件名）或套件内的 `--self-probe` / 变异段（由 runner 的 `VARIANTS` 注册为 **job**）。仍标 **dev-only** 的行指向 `_oneoff/auditR2/*`（**不在 `files[]`**），属**剩余待转换项**；转换完成时该行的 dev-only 标记必须一并删掉。

| 守卫 / 章节 | 钉住的不变量 | 证明它会咬的变异 |
|---|---|---|
| `tests/audit-path-discipline.mjs`（**probe，已随包发布**） | v4/v3 的成员可见文本不得声明 `Members/<x>/` 根；v5 必须带成员库根（两侧相反，是**有意**的） | harness = `tests/audit-path-discipline.mutants.mjs`：4 个族、`ALL FAMILIES BITE`（4/4） |
| `tests/audit-v5-sensitivity.mjs` | v5 提示词面/事件源的结构性变异必须让对应完整性守卫变红 | 该套件自身的"每变异一探针" |
| `tests/audit-v3-registration-parity.mjs` | v3 的工具注册与声明面一致 | 该套件自身（`run-tests.mjs:87-90` 以显式 args 运行它） |
| `tests/formal-verify-v4.test.mjs` §N5–§N9 | N5/N6 路径纪律；N9 行为证明：写到**文档化路径**的卡片必须被 `countArtifacts` 计入（自动会议基数） | 该套件自身的变异/行为断言（§N9 为真机行为证明） |
| `tests/audit-participant-set-parity.mjs` | 四个预设各**只有一个**参与集生产者；集合与"版本/期望"同时给出；v2/v3 的有意差异被钉住 | **随包** `node tests/audit-participant-set-parity.mjs --self-probe`（**6/6**：同一批谓词对**真实源码**为真、对**故意改坏的字符串**为假 —— 单位 = 谓词用例数，逐条打印 `green-now=… broken-goes-red=…`）；该变体已注册为 runner job。原 `_oneoff/auditR2/participant-set-proof.mjs` 已删除（其内容即此自探针） |
| **Lean 解析回退（task-6）** | 显式 `leanCommand` ⇒ 只用它；否则 PATH ⇒ **已知安装位置**（`%ELAN_HOME%\bin`/`~/.elan/bin`/…），并报 `leanFoundVia`；失败时 `next.tried` 点名探测过的路径 | `node tests/audit-engine-faces.mjs`（**18 passed / 0 failed**：直接断言导出的解析器缝 `resolveKnownTool` 四情形）+ `--self-probe`（`via: 'known-install'` 与 `tried.push(p)` 两处**单点**变异各自具名红；`t6-dbg20.mjs` 手工复现 known-install 的具名红 `17 passed / 1 failed`） | 
| **引擎面（真实二进制）** | 存在则**真跑**、缺席则**响亮 SKIP**（绝不静默通过、绝不让门禁在无引擎机器上变红）：数值（`python`/`Rscript`）、Lean（`lean`）、LaTeX（`xelatex`）三面 | **随包** `node tests/audit-engine-faces.mjs`（本机三面齐全 ⇒ **13 passed / 0 failed / 0 skipped**：`probe` 报 `configured` 且 `foundVia=known-install`、`mode:'code'` 真算出 42 且 `exit=0`；Lean 真编译 GOOD⇒exit 0 / BAD⇒exit≠0 带自身错误行；LaTeX 绝对 `paperLatexCommand` ⇒ `{"ok":true,"started":true}`，不存在路径 ⇒ 不崩溃并记录）＋ **`--self-probe` 3/3**（numeric＝模块 `runId` 改名、lean＝v4 路径守卫、latex＝v5 paper 起点各自**单点**变异 ⇒ 具名红）。**已知未行使**：Lean 经**注册处理器**的“读文件并执行”路径（预设的 `workspaceRoot()` 取根代理，最小 ctx 取不到 ⇒ 落到 `process.cwd()`）；LaTeX 的**编译**本身（在论文撰写子代理里） | 
| `tests/math-computation-shared.test.mjs` §23 / §23b | 装了但不在 PATH 的引擎可被发现；根来自**宿主注入**（不依赖本机 `ProgramFiles`）；R/Octave/Julia/MATLAB 每 OS 根齐备 | **随包** `node tests/math-computation-discovery.mutants.mjs`（**5/5**：**副本对基线绿**（未变异的模块对）＋ m3 丢掉已知安装目录查找 ⇒ **376/4**、b1 忽略宿主注入根 ⇒ **376/4**、b2 删掉 octave/julia 每 OS 根 ⇒ **378/2**、m4 假设包管理器存在 ⇒ **376/4**；每个都命中**具名** §23/§23b 断言，单位 = 具名断言标签）。原 dev-only 草稿 `round9-mutants.mjs`、`roundB-mutants.mjs` 已删除 |
| 同上 §26 | 编辑**原源文件**重跑 ⇒ 同一归档 + attempt≥2 + `scriptChanged`；指向**归档副本** ⇒ 新归档 + `fileIsArchivedScript`/`ARCHIVED_SCRIPT_RERUN` | **随包** `node tests/math-computation-archive-rerun.mutants.mjs`（**3/3**：**副本对基线绿** ＋ a1 删掉 `ARCHIVED_SCRIPT_RERUN` 告警 ⇒ **379/1**、a2 让归档源永不被识别 ⇒ **378/2**；每个都命中**具名** §26 断言，单位 = 具名断言标签）。原 `roundA-mutants.mjs`（a1/a2）与 `round9-mutants.mjs` 的引用均已转换/删除 |
| 同上 §28 | **任何** spawn 都不得带未替换的 argv 占位符（matlab 的 `run('<script>')` 内嵌形态） | **随包** `node tests/audit-math-computation-parity.mjs --self-probe`（§7 四条：STRING-level 替换、未知占位符、已知占位符必须有实现、**旧写法产物必被谓词抓住**；单位 = 谓词用例数，逐条打印 `green-now=… broken-goes-red=…`）；该变体已注册为 runner job |
| 同上 §29 | cli 策略来自**描述符**（`CLI_POLICY`），模块内不得再有硬编码比较；拒绝里带描述符值 | **随包** 同上 `--self-probe`（§8 四条：声明、被消费、无硬编码、拒绝里带描述符值）+ 敏感度探针 `cli-policy-ignored` |
| 同上 §30 | 商业模板的 `verify`/`verifyReason` **到达用户**；未声明者**不打印空槽** | **随包** `node tests/math-computation-shared.test.mjs --self-probe`（**case 3 / §30：2/2**：从被测模块里抽出**真实**的 `verifyFields(engine)` 助手，喂一个 stub 描述符表，删掉它唯一的 reason 行（或空槽守卫）后，**§30 自己的谓词** `carriesVerifyProvenance` / `hasNoVerifySlot` 必须翻假；单位 = 谓词用例数）；该变体已注册为 runner job。原 `_oneoff/auditR2/verify-provenance-proof.mjs` 已删除 |
| `tests/audit-math-computation-parity.mjs` §7 / §8 | 描述符不得用未知占位符、每个占位符都有实现；cli 策略"声明一次 + 被消费"；僵尸字段（`winPrefix`/`stdinArgv`/`defaultOn`）不得回归 | **随包** `--self-probe`（**8/8**，§7 与 §8 各四条）；两个 dev-only 草稿（`descriptor-sweep-proof.mjs`、`cli-policy-proof.mjs`）已删除 |
| `tests/audit-installer-compat.test.mjs`（版本探测块 + `%s` 断言 + **A7 结构化断言**） | 多来源不一致时出现 `disagreement`（一致时**不出现**）；日志行不得带 `%s`/`%d`；**版本与 source 断言在 `detectDshVersion` 的结构化返回值上**（不是"日志里出现过这个版本串"或"出现过 source 这个词"），日志只保留一条**行形状**检查 | **随包** `tests/audit-installer-assertions.mutants.mjs`（**5/5** 具名红：A7-version ⇒ compat 74/3、A7-source ⇒ 75/2）。早先的 `_oneoff/auditR2/installer-mutants.mjs` 已被它取代（**仅开发检出**，历史） |
| `tests/audit-installer-policy.test.mjs`（**A8 + 动作/语言约定**） | ① 措辞类断言换成**报告级**：`failedLog(logs).length === 0`（不是"日志里没有『备份失败』四个字"）；② **一个动作一行**：restore / cleanup 各**恰好一次**（`EXACTLY ONCE`）；③ **一个动作一种语言**：任何面向用户的日志**标签**（`[dsh-vibe-math] ` 之后、首个 `：`/`:` 之前）**不得是纯 ASCII**（英文领域词夹在中文标签里、如 `preset 声明方式`，是合规的）——**源码扫描 + 运行期捕获日志两侧都查**；只保留**一条**明确标注的 `[wording smoke check — the ONE allowed]` | **随包** `tests/audit-installer-assertions.mutants.mjs`（**5/5** 具名红：A8-failure ⇒ policy 86/9、DL-label ⇒ 93/2、DL-duplicate ⇒ 94/1） |
| `tests/audit-persona-surface.test.mjs`（允许清单） | 新注册的工具必须**被提及或显式入允许清单**；允许清单项必须是真实工具 | **随包** `tests/audit-persona-surface.mutants.mjs`（**3/3**：真实树基线绿 + **`PERSONA_ROOT` 副本树基线绿**（证明该缝忠实、变异才是红因）+ 注册一个未被提及的工具 ⇒ 守卫**具名红**）；另见本就随包的 `tests/audit-persona-sensitivity.mjs`（多探针，同一 `PERSONA_ROOT` 机制，含 `v2-phantom-tool-mentioned` 等） |
| `tests/audit-persona-sensitivity.mjs`（并发/原子写） | 语料写入**原子**（临时文件 + rename），并发读者不会读到撕裂文件；敏感度运行前先"预热"语料 | **随包**：① 原子写的不变量在 `tests/audit-persona-surface.test.mjs` 的 `writeAtomic`（`renameSync`）与 `tests/audit-installer-policy.test.mjs` §10「preset writes are ATOMIC」（失败写不得触碰目标）里被断言；② 敏感度守卫自己在 `:75` 记录"surface 的写入是原子的（临时文件 + rename），并发写者无法撕裂"；③ 多探针 harness = `tests/audit-persona-sensitivity.mjs` 本身（`PERSONA_ROOT` 双方向 + SETUP-FAIL ≠ detection）。原 `_oneoff/auditR2/concurrency-proof.mjs` 的撕裂演示属**机制证据**（旧写法 100 撕裂 → 原子 0），已被上述断言取代 |

| **中断语义（SLV P3，task-14）** | "**宿主拒绝中断**"这条 `catch` 分支必须保持**具名失败**与**可行动指引**：`code='VIBE_MATH_INTERRUPT_FAILED'` ＋ `next{tool='vibe_math_abort',hint}`（§19/D1 此前只覆盖"未知 child／空 childId／决策诊断"）| **随包** `node tests/v2v3-interrupt.mutants.mjs`（**2/2** 具名红：v2/v3 各把产品里的 `VIBE_MATH_INTERRUPT_FAILED` 改名 ⇒ 对应 `★ [P3/v2]`／`★ [P3/v3]` 断言按名变红，实测 `"code":"VIBE_MATH_INTERRUPT_RENAMED"`）；两套件各自 `node tests/math-computation-v2.test.mjs`／`-v3` 绿。**已知未覆盖**：P3 的"**调用方被丢弃**（中断后不再重试该调用）"属**宿主层行为**，随包套件不可观测 ⇒ 记为需真机 |
| **临时目录卫生（task-12）** | 被杀死的套件会泄漏临时目录（实测 `%TEMP%` 顶层 24 万项、其中我们 24.5 万项）⇒ 门禁启动时清扫**陈旧**目录：仅 `os.tmpdir()` **顶层** ＋ 前缀**从套件自动提取**（88 个）＋ `mtime` 早于阈值（默认 6 h）；并把临时根**优先指向 `D:\_tmp`**（`os.tmpdir()` 自动跟随 ⇒ 零产品改动）| **随包** `node scripts/clean-temp.mjs --self-test`（四条：新鲜目录绝不清理／陈旧且前缀匹配才清理／只匹配精确前缀／前缀表来自套件）＋ `node tests/temp-hygiene.mutants.mjs`（**2/2** 具名红：去掉年龄阈值 ⇒"新鲜目录不得被删"按名红、去掉前缀判断 ⇒"只匹配精确前缀"按名红）；`--dry-run` 实测"扫 160,923 项 ⇒ 计划 144,404 项" |

| **发布前检查（可执行化）** | 版本**三处一致**（`package.json`／lock 顶层／`packages[""]`）、当前版本的中英两份发布说明存在且**章节顺序符合模板**、两份都登记进 `files[]`、`compatNote` 提到当前版本、tarball **声明了但缺失 = 0**、开发专用文件（`.gitattributes`）**不随包**、包内**无 CRLF** | **随包** `node scripts/release-check.mjs`（对 2.8.0 实跑 `ALL CHECKS PASSED`，扫 179 个文本文件）＋ `--self-test`（**15** 条）＋ `node tests/release-check.mutants.mjs`（**4/4** 具名红：分别去掉版本一致性／章节数量／章节顺序／CRLF 扫描 ⇒ 对应自检**按名**变红）。发布后加 `--registry` 比对线上 `dist.shasum` 与本地 tarball |
| **v4 交付物必须说明编译结果** | 论文正文在**编译之前**组装，因此"局限与未决"里那两条依赖 `ps.compile` 的 bullet 只在**重入**时才有值 ⇒ 交付的 `paper.md`／`paper.tex` 必须**各自写明**"未检测到引擎（只产出 tex+md）"或"PDF 编译失败"，且**恰好一次**（finalize 可重入 ⇒ 幂等；`.tex` 以注释插在 `\end{document}` 之前）| **随包** `node tests/v4-final-paper.test.mjs`（`★ [deliverable/v4] … (once each; md=1 tex=1)`）＋ `node tests/v4-final-paper.mutants.mjs`（**3/3** 具名红：把中文说明置空 ⇒ 该断言按名红，实测 `md=0 tex=0`）|

| **维护方针（文档）** | `vibe-math-v4`／`vibe-math-v5` 是**主要维护方向**（新能力、新守卫、提示词强化、重构只落这两套）；`vibe-math-v2`／`vibe-math-v3` 已**成熟定型**，只接受**适配兼容**改动：宿主适配、共享模块的正确性/安全修复、行为不变的回归修复。共享模块（`vibe-math-v{2,3,4,5}/math-computation.js` 等）是**四份复制型** ⇒ 修复必须**同批传播**且四份**字节一致**，否则 v2/v3 会在宿主升级后腐坏；**明显的正确性/安全缺陷无论落在哪套都修**（"冻结"= 停止功能投资，不是放任缺陷）| **随包文档** `docs/maintenance-policy.md`（中英同页）＋ `README.md`／`README.en.md` 各一行指引；`node scripts/release-check.mjs` 核对随包清单与 `files[]` 一致（声明了但缺失 = 0）|

> **运行方式（本轮核实）**：`tests/run-tests.mjs:93-110` 收集 `tests/` 下**每一个** `.mjs`（仅跳过自身、`NEEDS_ARGS` 清单与 `replacedBare` 变体），因此 `audit-path-discipline.mjs` 是**门禁内的 probe**，不是"只能手动跑"；未随包发布的守卫（见 `package.json#files` 的 tests 子集）在安装树里不可运行。


## 什么随包发布、为什么（分割必须是**有意**的）

- **规则（已批准）**：**守卫与其证明 harness 一起发布** —— `tests/audit-*.mjs` 及其 `*.mutants.mjs` 是**可外部复核的契约证据**；**`_oneoff/**` 与 `tests/.audit-mutants/**` 永不随包发布**（开发暂存物与变异工作区，安装树里没有它们的位置）。
- **随包发布**：能在**已安装**的树里独立验证的守卫/审计 —— 全部 `tests/audit-*.mjs`（含 `audit-market-metadata`、`audit-readme-bilingual`、`audit-v3-registration-parity`、`audit-registration`、`audit-path-discipline` 及其 `audit-path-discipline.mutants.mjs`）、`math-computation-v{2,3,4}.test.mjs` 契约套件、`v2-fix-probes.test.mjs` / `v3-fix-probes.test.mjs`。
- **不随包发布**：需要**开发宿主或活的 DSH 会话**才有意义的 —— `e2e-*`、`selfdrive-*`，以及任何需要启动宿主/会话或读取 `_oneoff/` 暂存物的套件（安装树里没有这些前提，跑起来只会给假红/假绿）。
- **有意排除的例子（必须逐文件取证，不能从总数推断）**：`tests/audit-market-metadata.test.mjs` **不随包发布**——它检查的是**仓库里的图片产物**（`示例图/`），这些不在 tarball 内；随包会让**发布验证在解包后的包里失败**。该守卫**自己**就用一条断言钉住这个排除（"this repository-only guard is NOT listed in package.json files"）。
- 维护规则：新增守卫时先回答"它在**已安装**的树里有意义吗？"；有意义就同时加进 `package.json#files`，否则写一行理由。

### 附：十条"断不住"的断言特征（写新守卫前先对照）

> 这份清单从开发检出的 `开发检出里的审查台账（随包文档不含该路径）` **精简**而来（**不链接**它：随包文档不依赖 `开发检出`）。> 每条都配一个"如何证明它会咬"的要求：**先让守卫红一次**，再让它绿。

| # | 特征 | 症状 | 对策 |
|---|---|---|---|
| 1 | **空断言（vacuous）** | 两边取同一表达式/同一变量，恒真 | 让两边来自**不同来源**（代码 vs 规格/文档/常量） |
| 2 | **条件门（conditional gate）** | 前提（如 `if (x)`）不成立时整段被跳过，却仍算"通过" | 前提不存在时**显式失败**或记为 skip 并计数 |
| 3 | **匹配器过宽** | `includes("source")`、`/./`、`length > 0` 之类任何输入都能过 | 锚定**行形状**或断言**结构化字段** |
| 4 | **对象错位（wrong subject）** | 断言的是"附近的"东西而不是要保的东西（如断言了副本、断言了另一个函数） | 断言**产出该事实的那一处**，并写清主语 |
| 5 | **静默跳过** | 缺文件/缺环境时 `return`/`continue`，报告里看不出 | 跳过要**打印并计数**（本仓库 `NEEDS_ARGS` 是范例） |
| 6 | **只数数量** | 只断言"共 N 条"，不看内容 | 数量 + **至少一条内容**/集合相等 |
| 7 | **固定文案** | 断言语义却钉死措辞，改写即红、静默降级却绿 | 断言**结构化字段/报告**，最多保留一条明确标注的文案冒烟检查 |
| 8 | **重复来源** | 生产者与断言读**同一**来源，同错同绿 | 交叉来源：代码 vs 语料 vs 文档；或独立推导 |
| 9 | **缺 harness** | 守卫存在但没有任何输入能让它变红（"文档，不是守卫"） | 每条守卫配一个变异/证明脚本，并在守卫索引里登记 |
| 10 | **环境依赖** | 只在某台机器/某次顺序下成立（真实引擎、临时目录、并发） | 夹具显式隔离环境；并发敏感的加并行压力证明 |

**验收标准**：每条新守卫都要回答"我怎么让它红一次"；答不出来就不算守卫。


## 守卫索引补遗（fallout #4）

**图例（红一次的要求）**：每一行都必须回答"我怎么让它**红一次**"。标 **in-repo** 的 harness 随包发布（`tests/**.mutants.mjs` 或套件内的变异/行为段，含 `--self-probe`），**包内读者可复现**；标 **dev-only** 的只能在本仓库的开发检出里跑（不在 `files[]`），**包内读者无法复现** —— 它们应被逐步转成 in-repo 形式。**当前随包的 `tests/*.mutants.mjs` 共 21 个**（计数单位 = 文件名，可由 `Get-ChildItem tests/*.mutants.mjs` / `ls tests/*.mutants.mjs` 复核；含本轮新增的 `audit-persona-surface.mutants.mjs`、`audit-installer-assertions.mutants.mjs`、`audit-status-report-fields.mutants.mjs` 等）；仍指向 `_oneoff/auditR2/*` 的行是**剩余待转换项**。

| 守卫 / 位置 | 钉住的不变量 | 红一次（harness） |
|---|---|---|
| A1 v2/v3 skip 台账 + `mgrBranchExercised` | 跳过/未走到分支必须留痕，不能沉默 | in-repo：`tests/math-computation-a1.mutants.mjs`（**2/2** 族具名红，`skipped=[]`，`exit=0`；v2/v3 两个预设） |
| A6 name-set 快照 | 工具名集合变化必须被察觉 | in-repo：`tests/e2e-identity-a6.mutants.mjs`（**2/2** 族具名红，`skipped=[]`，`exit=0`；v2/v3 两个预设） |
| F1 v3 planner 集合相等 | planner 的两侧集合必须相等 | in-repo：`tests/v3-fix-probes.mutants.mjs`（**族数从族自报行现取**：本轮 **11/11** 具名红；族名以该文件为准，含 F2cap / F-A / F5 / F4c / F6a / F6b / F6c 等 —— **不要照抄固定数字**，跑一次即知） |
| F2 v3 id 契约 | id 形状/唯一性契约 | in-repo：`tests/v3-fix-probes.mutants.mjs`（同上：本轮 **11/11**；v2 对应族 `tests/v2-fix-probes.mutants.mjs` 本轮 **10/10**；两者都打印 `TOTAL WALL TIME` 供复核） |
| F3 v2 `list_agents` | 该工具必须存在且被提及 | **随包** `node tests/v2-list-agents-and-next-step.mutants.mjs`（**6/6**：三个**副本基线绿**（`MC_V2_PLUGIN` / `V2_PLUGIN` / `PERSONA_ROOT` 各一）＋ **存在性**：改名注册 ⇒ `math-computation-v2` 具名红 `对照：vibe_math_list_agents 可调用`（单位 = 工具名）＋ **被提及**：注册名改了而 persona 仍写旧名 ⇒ `audit-persona-surface` 具名红 `every registered tool is mentioned in the persona, or explicitly allow-listed`（单位 = 已注册工具名）） |
| F4 v2 require-gate 下一步 | 拒绝必须给出可执行的下一步 | **随包** `node tests/v2-list-agents-and-next-step.mutants.mjs` 的 **F4 用例**：删掉 `下一步：把该对象形式化到 Lean 通过` ⇒ `v2-fix-probes` 具名红 `★★ [A5] require-gate 反馈行携带下一步`（单位 = 拒绝点）。**同时修了缝**：`v2-fix-probes.test.mjs` 的三处**源码文本**断言原先直接读仓库文件（`V2_PLUGIN` 够不到），现统一走 `readPluginSrc()`（默认仍是仓库文件），因此文本断言与行为断言读**同一个** artifact |
| A5 v5 kind 多重集 + id 集 | 事件 kind 的多重集与 id 集不变 | 随包变异族（R14 实测）：`A5-ids` ⇒ **计数断言 0 红**、**ID-SET 语义断言红**，整轮 **82 红**；`A5-kinds` ⇒ **计数断言 0 红**、**KIND 语义断言红**，整轮 **21 红**。**正确措辞**：计数断言**保持绿**、新加的**语义断言必然变红**，其余红是**同一次变异的下游级联**（下游用例引用 id 前缀/kind）—— 不要写成"只有 ID-SET/KIND 变红" |
| v5 L1 `leanPathContractOk` | Lean 路径契约（文档根 = 框架根） | **随包（此前的"显式有界"裁定已被取代 —— 判别证据已经存在）**：① 断言 `tests/e2e-v5-round2.test.mjs` §[53] 的 `★★ [v5 L1] a HEALTHY composition surfaces no Lean path contract note in report() diagnostics`（`:2420`；同组还有 `:2399` 符号锚、`:2401` "调用并入队具名提示"、`:2403` "下一次提交排空"）；② 变异族条目 `tests/v5-institute-fixes.mutants.mjs` 的 `v5 L1: the Lean tools short form resolves to the WRONG file (path contract broken)` —— **单点** `const viaShort = leanAbsPath(probe)`（插件 `:1024`）⇒ `leanAbsPath(probe + 'x')`；③ **实测两条**：修复树 `passed=418 failed=0 ALL GREEN`；**独立路线**（预设复制到 **ASCII 临时路径**、同一单点变异、`V5_PLUGIN=<copy>/vibe-math-v5.js node tests/e2e-v5-round2.test.mjs`）⇒ **`passed=417 failed=1`**，**唯一**失败就是上面那条具名断言，同时 stderr 出现检查器自己的 `Lean path contract BROKEN …`；族自报 **12/12**、`hangs=[]`、`skipped=[]`、`TOTAL WALL TIME 304581 ms`（复核方同修订 306599 ms）。**机制（为何此前会误判为有界）**：该提示只**入队** `pendingLoadNotes`（`:1147-1151`，上限 5），要等**下一次提交**由 `drainLoadNotes()` 折进 `loadProblemLog`/`stateCache.diagnostics` 才可见（`:1193` 处的调用）—— 所以判别面是 **`report()`**，断言需要那一步"再提交"；初期只查 `status().persistence.loadProblem` 因而看不到它 |
| v5 L2 `defectTargetsThisReply` | `defect` 只能针对本轮对象 | **随包** `tests/audit-v5-lean-abstention.mutants.mjs` 的 **M2**（已存在，不是缺口）：它变异的正是该谓词，并让 `tests/audit-v5-lean-abstention.mjs` 的**具名**断言 `S2: the same reply cannot conclude the object it declared defective` 变红。实测控制（本机复核过）：`MUTANTS_ONLY='M2 enforcement disabled' node tests/audit-v5-lean-abstention.mutants.mjs` ⇒ `control (unmutated): exit=0 | passed=31 failed=0` ＋ `ALL MUTANTS RED AS REQUIRED`，exit 0 |
| v4 N10 compaction agent-local 守卫 | compaction 只作用于本 agent | `formal-verify-v4.test.mjs` §N10（套件内行为断言） |

**包边界核对（实测，随批次变化）**：`package.json#files` 共 **176** 条（本版新增三份方法论文档），其中 `_oneoff` 条目 **0 条**；随包 `tests/*.mutants.mjs` **24 个**（单位 = 文件名）；**开发检出**里 `tests/*.mjs` 共 95 个，而其中**随包**（published subset，`files[]` 覆盖）为 **65 个 = 17 套件 + 48 探针/脚本** —— 两个数字**范围不同**，引用时必须说明是哪一个。**这些数字必须重新派生、不要照抄**：`node -e "console.log(Object.keys(require('./package.json').files).length)"`、`(Get-ChildItem tests/*.mutants.mjs).Count`、以及 `node tests/run-tests.mjs --counts`（派生作业三元组）。**本轮之后索引里已无 live dev-only 行**：凡是提到 `_oneoff/auditR2/*` 的地方都明确标为**历史/已被取代**；如需新增证据，一律走 `tests/*.mutants.mjs` 或套件内 `--self-probe`（并在 runner 的 `VARIANTS` 里注册为 job）。

**方法论三篇（随包，指向方法与流程，不重复本索引的行）**：

- [`docs/audit-methodology.md`](./audit-methodology.md) —— 门禁组成与计数、三种守卫形态、**具名红**要求、**实测边界（measured, not proven）**、计数与声称纪律、工具链陷阱。
- [`docs/release-playbook.md`](./release-playbook.md) —— 三处版本一致性、清单与市场字段、提交前门禁与 `--check`、提交→注解标签→推送→`npm publish`→`gh release create`、发布后核对与陷阱。
- [`docs/slv-playbook.md`](./slv-playbook.md) —— 克隆 profile 隔离、`--no-open` + 自有端口 + 从 stdout 取 `token=`、模拟声明的 `seq`＋行号断言、23 个驱动开关、预算/上限与 **cap/timeout = NON-RESULT**、中止触发、产物与仅限自身的清理。


### 自检的能力边界（"自检通过" ≠ "兼容"）

- `checkHostCapabilities`（以及安装器自检）只证明**服务/API 的存在与形状**，**不证明运行时行为语义**；F-4c/F-5/F-6 一类的语义缺陷对它是**结构性不可见**的。
- 因此**通过自检不得被读成兼容性结论**。安装器把这句话印在**用户可见的自检通过行**上（`installer.js` 的 `宿主自检通过（…）`），并由 `tests/audit-installer-compat.test.mjs` 的断言钉住（该行必须同时出现"形状"与"行为"）。


### 跑测日志的可诊断性（"红必须点名断言"）

- **约定**：**红必须点名断言**。`tests/run-tests.mjs` 在失败时把该套件的**具名失败行**（从 stdout+stderr 提取，无具名行时回退到最近 40 行原始输出）打印在**每条 `FAILED: <file> [suite|probe]` 行下面**，套件自身的最后一行的摘要不再是唯一线索；TOTAL 行在失败清单之前。
- **已关闭的反向缺陷（假阳性）**：提取器按行的**自有前缀**、**行首锚定**判定（`^\s*(FAIL\b|FAILURES:|✗|✘)`、断言条目 `^\s*[-*]\s+\S`、行首中止标记 `^\s*(SyntaxError|TypeError|ReferenceError|Error):`），并**显式排除 `^\s*ok\b`** —— 因此一条**通过**行即使把字面量 `FAIL - ` 写进消息里，也不会被当成失败（v2/v3 owner 曾因此让一次全绿看起来变红）。
- **怎么让它红一次（in-repo）**：`node tests/run-tests.mjs --self-check` 三个用例 —— ①失败子进程产出**具名**行；②**通过行内含 `FAIL - ` ⇒ 提取结果为空**；③真正的 `  FAIL - …` 行与 `TypeError:` 标记仍被提取；反向证明由随包的 `tests/run-tests.mutants.mjs` 给出（**2/2**：基线通过；把具名提取改成常量 ⇒ `--self-check` 变红）。


### 补遗：v5 提示词双副本守卫 + 派生语料的规则

| 守卫 / 位置 | 钉住的不变量 | 红一次（harness） |
|---|---|---|
| `tests/audit-v5-prompt-duplication.mjs`（**已随包**） | 提示词恰好两份副本、**归一化后完全相同**，且 P1/P2/P3 六条子句在**两份**里都在 | 随包的 `tests/audit-v5-prompt-duplication.mutants.mjs`：对**一份**副本做单点编辑 ⇒ 具名红（"the two prompt copies are IDENTICAL after normalisation …"、"P1 exception present in copy 1"、"P2 disclosure present in copy 1"） |
| `tests/audit-v5-prompt-duplication.mutants.mjs`（**已随包**） | 上表的证明本身 | 它就是 harness；`node tests/run-tests.mjs` 自动发现两者（`tests/*.mjs` 枚举，非 `NEEDS_ARGS`） |

**派生语料的规则（协议级）**：`prompt-corpus-persona/*` **不是**需要被"重定向"的随包语料，而是**人格/提示词源的派生产物**；因此当人格源发生编辑时，**随后的一次门禁运行合法地重新生成它**（本轮重生成的语料里正好含新的 P2 披露文本）。规则：**把重生成与它的源编辑一起提交**；绝不把一个脏的派生语料留过提交；并且在有人正在编辑人格/提示词源时**不要跑全量门禁**。


### 派生规则与探针卫生（镜像协议 §9.6 / §9.6b / §9.7）

**两个派生件，成对重生成（§9.6 / §9.6b）**
- `cordis.patch.yml` 是 `scripts/build-preset-rows.mjs` 的**生成物**（不是手写文件）；任何一个 bundle 输入（如 `vibe-math-v*/agent.cordis.yml`）被编辑，就必须在**同一批**里重跑 `node scripts/build-preset-rows.mjs`。守卫的报错已经写明准确命令，保留这个措辞：
  `cordis.patch.yml is exactly what scripts/build-preset-rows.mjs generates — hand-edited? regenerate with: node scripts/build-preset-rows.mjs`。
- `prompt-corpus-persona/*` 是**人格/提示词源的派生语料**（不是需要被"重定向"的随包源）：人格源一改，随后一次门禁运行会**合法地重生成**它。
- **共同规则**：源编辑与它的派生件**一起提交**；绝不把脏的派生件留过提交；**不要**在有人正编辑源时跑全量门禁（改完再跑，让重生成随提交落地）。

**探针卫生两条（§9.7 ⑤ / ⑥）**
- ⑤ **重新实例化的探针必须从"seam 解析出的路径"复制**（即夹具实际解析到的那份），不能从硬编码/临时路径复制 —— 从错路径复制会让探针**空过**（vacuous），它证明的是"副本里没这东西"，而不是"代码里没有"。
- ⑥ **断言真正的契约**，不要断言"它出现在这一节里"：按小节 grep 只能证明**局部可见**，不能证明契约成立（同一条误判在本项目 5× 矩阵里被抓到过一次）。

### 补遗二：参数化提示词双副本守卫（v2/v3/v4）

| 守卫 / 位置 | 钉住的不变量 | 红一次（harness） |
|---|---|---|
| `tests/audit-prompt-duplication.mjs`（**已随包**，对 v2/v3/v4 参数化） | 每套恰好两份副本；两份共享一段**不短于较短者 60%** 的前缀（v2 0.957 / v3 0.965 / v4 0.97），且 copy 1 **多出的行只能是 YAML 脚手架/宿主后缀**，绝不是提示词正文；待落地的 V2-1/V2-3 子句必须出现在**共享前缀**里（**红先**：默认运行在 V2-1/V2-3 编辑落地前**预期为红**——当前 9 passed / 15 failed；编辑落地并重生成派生件后转绿。只看对照时用 `PROMPT_DUP_SKIP_CLAUSES=1` ⇒ 9/0。**不要**为了让门禁变绿而削弱本守卫） | 随包的 `tests/audit-prompt-duplication.mutants.mjs`：每套对**单份**副本做一次编辑 ⇒ **三条具名红**（`share a substantial common prefix (32/70=0.46)`、`(13/85=0.15)`、`(59/101=0.58)`） |
| `tests/audit-prompt-duplication.mutants.mjs`（**已随包**） | 上表的证明本身 | 它即 harness；`run-tests.mjs` 的 `tests/*.mjs` 枚举自动发现两者（非 `NEEDS_ARGS`） |

> 与 v5 版的关系：`tests/audit-v5-prompt-duplication*.mjs` 钉 v5 的两份副本；本文件把同一不变量**参数化到 v2/v3/v4**。两族的"红一次"都由随包的 `*.mutants.mjs` 给出（shipped guard + shipped harness）。


### 发布说明的可追溯性（追溯缺口是**记录**下来的，不是被改写的）

- **约定**：**发布说明应点名钉住每条修复的守卫**；历史说明若没点名，**以本守卫索引为可追溯性来源**，而不是回头改写已发布的说明。
- **判定口径（必须按这个定义，避免"过宽匹配"）**：**具体引用** `tests/*.mjs`（或套件名）才算"点名了守卫"；**散文里出现"守卫/guard"不算**。
- **已记录的缺口（由本文件按上述口径现算，不手写）**：35 个发布说明文件中有 **12** 个未点名任何守卫 —— 2.2.1、2.3.14、2.3.15、2.3.16、2.3.8、2.3.9、2.4.0、2.4.1、2.5.0、2.6.0、2.7.0.en、2.7.0。这些是**已知、有意不修**的追溯缺口（已发布说明属历史）。
- 缺口的原始记录见审查台账的 §12.0/§14（安装器脚本审查的调和记录，含 matcher 与 12 的核对）。


### 补遗三：声明语法扫描（§9.7⑨，位于 `tests/audit-prompt-duplication.mjs`）

| 守卫 / 位置 | 钉住的不变量 | 红一次（harness） |
|---|---|---|
| `tests/audit-prompt-duplication.mjs`（**已随包**）的**声明语法扫描** | 锚定声明行（`^\s*-\s+`?<name>`?\s*=\s*\S` 及列表行）：每个命中必须 **(a) 在另一份副本里也声明**，且 **(b) 在该预设的 JS 里可读为 `params.<name>`**，否则具名红；v4 的六个字段仍归 `must NOT be declared here` | **自我探针**：把 `- activityLogCap = 100` 注入**单份**副本 ⇒ v2/v3 一条具名红（"declared in copy 1 … must also be declared in copy 2"），v4 **两条**（单副本 + "the JS never reads `params.activityLogCap`"）；三条漂移变异仍红（0.33 / 0.11 / 0.50） |

- **诚实标注：这个扫描在今天的提示词上是"构造性空跑"** —— 三个预设的 `declaredParams=0`，即真实提示词里**没有**可扫的声明行；它的"会咬"完全由**自我探针**证明（注入一行即红），将来任何"只写一份副本"或"`params.<name>` 不可读"的声明都会被它抓住。
- 参考计数（默认模式）：本守卫 **66/0**；`audit-prompt-invariants` **157/0**。


### 约定：文本门必须读代码，而不是注释

- **文本型断言（"在源码里 grep 某个门"）必须先 `stripComments` 再匹配**：一条**注释**里出现 `formalOn() && p.formal` 曾让 I8 在**真实门被删除**后仍然变绿（守卫看着在，实际上没在守）。
- 反例证据是随包的：`tests/audit-prompt-invariants.mjs --self-probe` 的变异"v5: the formal gate is REMOVED but a comment still quotes it (I8 must read code, not comments)" ⇒ 具名红（`v5 I8: the reply channel is gated on formalOn()`）。
- 同类检查（I1/I2 及 X5–X8 扫描器自身的守卫）也都在**去注释后的代码流**上运行；新增文本门请照此办理。


### 约定：安装器面向用户的输出一律中文

- **规则**：`installer.js` 面向**用户**的输出（`logger.info/warn` 的每一行）一律**中文**；出现英文标签就是**缺陷**，除非在同一行注明理由（例如必须保留厂商/命令原文）。代码与约定必须一致，后来者不得重新引入英文标签。
- **依据**：R6 归因发现三条英文标签（`:764`/`:769`/`:791`）与一条信息行（`:787`）混在中文输出里；它们经 **logger 助手**（非 `console.*`）发出，所以按 `console.` grep 查不到 —— 排查时请按 `logger?.info?/warn?` 检索。
- **连带风险（已实测）**：本地化这类标签会波及**测试助手**（`audit-installer-policy` 的 `failedLog()` 之前匹配旧英文标签 ⇒ 91/1）；改名/改文案必须**连带改守卫**，并把匹配收窄到"只证明失败"的证据（过宽的 alternation 曾把 `preset files:`/`preset baseline:` 当成失败 ⇒ 89/3）。


### 跑测超时（门禁必须能终止）

- **默认 180 s/套件**（`GATE_SUITE_TIMEOUT_MS` 可覆盖）：超时会**杀死子进程**并报**具名失败** —— `FAILED: <file> [suite|probe] (TIMEOUT after 180s)`，失败行下面照常打印该子进程捕获的 stdout/stderr 尾部；**挂起绝不能被当成"还在跑"**。
- **为什么是 180 s（两个实测数字，未来读者据此区分"慢但诚实"与"卡死"）**：整门禁墙钟 **~200 s**；最慢的诚实套件 **135–144 s**（`audit-math-computation-sensitivity`）。180 s 能兜住偶发挂起，又不会误杀诚实套件。
- **命名覆盖（诚实但慢的套件，不是卡死）**：`run-tests.mjs` 的 `TIMEOUT_OVERRIDES` 给 `v2-fix-probes.mutants.mjs` 与 `v3-fix-probes.mutants.mjs` 各 **900 s**，理由是**实测**：v2 **≈43.1 s/族 × 10 族 ≈ 430 s**、v3 **≈23.5 s/族 × 11 族 ≈ 260 s**（两者内部已把**每个子进程封顶 120 s**，并报 `hangs=[]`，即"慢但诚实"）。**默认仍是 180 s**，普通挂起照旧被快速抓住；只有这两个具名套件被放宽。
- **v5 家族的覆盖（门禁亲自抓到的校准缺口）**：`v5-institute-fixes.mutants.mjs` 实测**墙钟 201.9 s**（`hangs=[]`、`skipped=[]`、`ALL MUTANTS RED AS REQUIRED`）⇒ **超过 180 s 默认**，因此在 `TIMEOUT_OVERRIDES` 里给它同样的 **900 s**。对照：`formal-verify-v4.mutants.mjs` 实测 **70.9 s**，**无需**覆盖（余量充足）。**记录一次"写入方声明为假、被门禁抓住"的事故**：曾有声明称该 v5 家族已落在其覆盖之内，实际并未；门禁以具名失败 `FAILED: v5-institute-fixes.mutants.mjs [probe] (TIMEOUT after 180s)` 抓住了它 —— 这正是具名超时机制存在的意义（挂起≠还在跑）。
- **覆盖决策只引用族自己打印的 `TOTAL WALL TIME` 行**（**5/5 个变异族**现在都有这一行；下表**以 `92c60cc` 的树为准**；族会随增量**增删**、同一机器的读数也会有 ~1.5% 差异，所以引用时请取**同一次运行**里族自报的 `TOTAL WALL TIME` **与其 `N/N`**，不要用估算、外部读数或跨运行拼接）：
  | 族 | 具名红 | `hangs`/`skipped` | `TOTAL WALL TIME`（本次实测） | 覆盖 |
  |---|---|---|---|---|
  | `tests/v2-fix-probes.mutants.mjs` | 10/10 | `[]`/`[]` | **433601 ms (434 s)** | **900 s** |
  | `tests/v3-fix-probes.mutants.mjs` | 11/11 | `[]`/`[]` | **254986 ms (255 s)** | **900 s** |
  | `tests/v5-institute-fixes.mutants.mjs` | 11/11 | `[]`/`[]` | **≈300 s**（族自报：本轮 **298959 ms**；复核方 **299649 / 295216 ms** —— 约 1.5% 机器差异） | **900 s** |
  | `tests/formal-verify-v4.mutants.mjs` | 7/7 | `[]`/`[]` | **87897 ms (88 s)** | 无（默认 180 s 足够） |
  | `tests/formal-verify-v3.mutants.mjs` | 1/1 | `[]`/`[]` | **50834 ms (51 s)** | 无 |
  **本表取自"逐族各跑一次"，且 `N/N` 与毫秒数来自**同一次运行**的族自报行**：同一机器不同时刻会变（v5 261 s ↔ 264 s、v4 84 s ↔ 88 s ↔ 123 s），族条目也会被**增删**。**已发生的实例（worked example）**：v4 家族曾因 N19 两条增量变为 **9/9 / 123 s**，随后该增量被**回退**（其前提与两条随包守卫 T13/A1 互斥 —— 记为**实测边界**，不是缺陷），于是回到 **7/7 / 88 s**。同一族的读数因此可能一小时之差就不同 —— **请以你那次运行的族自报行为准，不要跨运行拼数字。**
  **历史（外部整进程墙钟 / 估算，均已作废，仅作对照）**：v2 ≈430 s、v3 ≈260 s（**现已实测 434 s / 255 s，见上表**）、v5 208.5 s（更早 201.9 s）、v4 88.9 s / 75 s / 86 s、v3-new 45.5 s。
  **同一台机器上不同时刻读数会差**（负载/排队；例如 v4 本次 123 s，更早 86 s / 75 s、外部读数 88.9 s）—— 这正是要引用**族自己那一行**的原因：它和该次门禁同条件。

- **三种"计数"不要混为一谈**（R14 提出、R19 F-C 修正）：① **门禁 JOB 计数**（**唯一权威是 `node tests/run-tests.mjs --counts`**，`audit-readme-counts` 守着；本文件的行由派生器写入，**本节不复述数字**以免随作业数漂移，见 D1 行）；② **变异族计数**（本表的 `N/N`，各族自报）；③ **`audit-v5-integrity` 内部的 gate 计数**（本轮实测 **56**）。**三类都可以变** —— ① 变了跑 `scripts/update-doc-counts.mjs`，② 变了改本表，**③ 变了不需要改任何文档**（这一点不是"没人引用"，而是"**没有任何随包文档把它的数值当作断言**"；本节提到它只是说明区别，`audit-readme-counts` 只对 ① 做全 `docs/**` 的 `TOTAL <n>` 扫描，见该守卫的 F-C 断言）。
- **改限的规矩**：抬高**默认值或任何覆盖值**都必须**同时更新本行的全部实测数字并在提交信息里说明**；不许为了让门禁变绿而悄悄改（上面三条覆盖用例正是为了让这条规矩可验证）。
- **禁止**为了让门禁变绿而**悄悄抬高**这个值；确有套件变慢，请**同时**更新这里的两个数字与理由。
- **怎么让它红一次（in-repo，两个方向）**：① `node tests/run-tests.mjs --self-check` 有一条**真实路径**用例 —— 合成 sleep 作业、`timeoutMs=1000`、走同一个 `runSuite`/`failedLine`，断言 `timedOut=true, exit=null` 且失败行 `FAILED: (synthetic-sleeper) [probe] (TIMEOUT after 1s)`；② 随包的 `tests/run-tests.mutants.mjs` 用 `GATE_SUITE_TIMEOUT_MS=1000` 对**真实套件**做**正例**（具名 TIMEOUT + 非零退出）与**反例**（默认限制下同一套件不报 TIMEOUT、exit 0），因此该判据被双向校验（§9.7 ㉗）。


### S6：版本策略只有一句措辞（`MATH_VERSION_POLICY`）

- **实现（三层，同一字面量）**：短句 `MATH_VERSION_POLICY_CLAUSE`（grep 锚点）是**唯一**的策略字面量；长句 `MATH_VERSION_POLICY` 由它**拼接派生**；`mathVersionPolicy(pinned)` 由长句派生**策略字段**（安装计划 `versionPolicy` 与运行/缺包路径同一处）；两条**人类消息**同样由短句派生 —— `MATH_MISSING_PACKAGES` 的失败详情（`需要的包未安装：…`）与 `parsePackageSpec` 的 `unsupported version syntax` 提示。因此"一句策略"覆盖**策略字段 + 两条消息**三处表面，短句字面量全文只出现 **1** 次。
- **断言**：`tests/math-computation-shared.test.mjs` §34（**6** 条**行为**断言，从响应里读，grep 锚点 `S6: the install plan uses the SAME policy wording`）；`tests/audit-math-computation-parity.mjs` §11（**4** 条**静态**断言）。
- **怎么让它红一次**：单点变异 —— 把安装计划处的助手调用改回旧措辞 ⇒ 共享 §34 **具名红**（实测 `370 passed / 3 failed`）。harness（**随包**）：`node tests/math-computation-shared.test.mjs --self-probe`（S6 两个用例，与 §34 同一判据；`_oneoff/auditR2/s6-mutant.mjs` 只是同内容的早期 dev-only 草稿）。
- **parity §11 是"树级"断言（已标注，不冒充可变异证明）**：它读的是**仓库里的随包副本**，刻意**不接** env seam —— 否则会踩协议 ㉟(iii)"loaded-seam vs repo file"（守卫该看仓库文件却看了夹具）。因此它**不能**被 env-seam 变异变红；它的价值是"有人手改仓库副本就会红"，与 parity 的字节一致检查同属一类。
- **数字（revision `ef54f4d` + 未提交内容哈希；数字不带 revision 不复现）**：shared **373/0** → 变异后 **370/3**；parity **107/0**；contract **200/0**；`--self-probe` **2/2**（各 372/1）；`COPIES OK`。sha256 前缀：`math-computation.js` `8963ec58ba5eb547`、shared `d822d176a6adae06`、parity `440e308dbe4b07f5`。


#### S6 补充：派生必须"承重"（mutant 发现的紧度缺口）

- **缺口**：最初只断言"失败详情里**含有**该短句"，而把短句**内联复制**回消息同样满足它 ⇒ 该断言**不承重**（mutant 案例 2 实测：改回内联后仍然 `376 passed / 0 failed`）。
- **修法**：承重断言放在**能变红的地方**（共享套件读 **env 解析出的**模块源码）——见 §35：短句在模块里**只出现 1 次**、`MATH_MISSING_PACKAGES` 详情**由常量构造**、`unsupported version syntax` 提示**由常量构造**、长句**由短句派生**。改回内联后：`occurrences=2` ⇒ `378 passed / 2 failed`，两条**具名红**（"the policy clause exists as exactly ONE literal"、"the missing-package detail is built from the clause constant"）。


### README/计数一致性（D1）：数字必须**派生**，不许手打

- **权威来源**：`node tests/run-tests.mjs --counts`（门禁自己那份 job 列表）+ `package.json#files`（随包 `tests/*.mjs` 数）。文档里的数字由 **`node scripts/update-doc-counts.mjs`** 生成（`--check` 只检查不改）；新增测试文件会让守卫变红，**修法是跑一次 updater**，因此数字再也不可能被手打。
- **计数（实测）**：`TOTAL 131`（68 套件 + 63 探针/变体，**作业计数/job count**，不是文件计数）；随包 `tests/*.mjs` = 95（**文件计数**：41 个套件 + 54 个探针/脚本）。
- **怎么让它红一次（in-repo）**：`tests/audit-readme-counts.mutants.mjs` —— 基线：守卫绿；**★ 篡改 README 里被引用的派生总数**（走 `COUNTS_README` seam，指向**绝对路径**的副本）⇒ 守卫**具名红**（"README.md quotes the DERIVED totals"）。守卫本体：`tests/audit-readme-counts.mjs`（**19+** 条断言：README/EN/test-timing/checklist 的派生形状、旧读数的消失，以及 **F-C 的全 `docs/**`（live 文档）`TOTAL <n>` 扫描** —— 每个 occurrence 必须等于 `--counts` 的派生值，冻结的 `docs/release-notes/**` 按名排除并在输出里报数）。
- **touch-anchor（claim-vs-tree 用）**：`--counts`、`update-doc-counts.mjs`、`README COUNTS:`、`README.md quotes the DERIVED totals`。


### F-5 沙箱围栏根（guard row，实测于 `466a08b`+：`F-5/1c` 只从该提交起存在）

- **实现**：v4 侧 `policyRootCandidatesOf()`（把解析出的策略对象映射为**候选围栏根**，数组/字符串两种形状都收）、`fenceRootDriftNote()`（把"宿主根 vs 会话根"的差异做成**一次性具名告警**）、`warnedFenceDrift`（**one-shot** 标志，防刷屏）。行为要点：**包含关系**判定（会话根必须落在宿主根内）、**数组**策略逐个取候选、**不可解释的策略 ⇒ no-op**（不是死分支）；`resolve({})` 的**回退调用被排除**在漂移比较之外；折叠仅在 **win32** 生效。
- **断言锚点**：`tests/formal-verify-v4.test.mjs:1929` 的 `section('N17 F-5 fence-root drift: containment, no-op boundary, one-shot naming both roots')`；用例命名见 `:1936` 的 NOTE（**case (0) = 宿主根本没有 `sandboxPolicy` 服务**；**case 1b = 服务存在但解析出的根不可解释（`{allow,deny}`）**）、`:1941`（F-5/i：无服务 ⇒ 策略路径从不运行、无告警）、`:1949`（F-5/1b：不可解释 ⇒ **no-op 且无告警**，属**文档化的**边界而非死分支），以及同节的 case ii/iii/iv（漂移比较被调用、包含判定、一次性命名两个根）。
- **怎么让它红一次（in-repo，随包）**：`node tests/formal-verify-v4.mutants.mjs` —— **族数从族自报行现取**（本轮 **8/8**，新增第 8 条 `N20-3b: a failed index write is silent again`，见下面 item-6 行）按名变红：`F-5/1b: treat \`allow\` as a fence root`、`F-5/ii: the drift comparison is never called`、`F-5/iii+iv: the containment predicate is disabled (always warn)`、`F-5/ii: the one-shot is dropped`、`N15/4: the compaction-failure warning is silenced`、`F-5/1c: an unknown session cwd is warned about`、**`N18: a failed current-project marker write is silent again`**、**`N20-3b: a failed index write is silent again`**；输出 `hangs=[]`、`skipped=[]`、`ALL MUTANTS RED AS REQUIRED`。**时间以族自报的 `TOTAL WALL TIME` 行为准**（本轮 **108296 ms**；同族在更早/不同条目数下的读数为 87897 / 86103 / 122608 ms 等 —— 机器与条目数都会变，**跑一次即知**）。**注意条目会回退**：曾出现的 `N19/F4`、`N19/F10` 两条**已被回退**（其前提与 T13/A1 两条随包守卫互斥，记为**实测边界**），因此该族曾在 9/9 与 7/7 之间变动 —— 引用时请用你那次运行的 `N/N`。本仓的 `TIMEOUT_OVERRIDES` 无需为它放宽（< 180 s 默认）。
- **"保持静默"的断言必须同时给出**"离被测分支最近的一步"的**活性证据**：这里能区分"分支真的跑了但选择不告警"与"分支压根没跑"的，是 **`resolve({session})` 的调用计数**（实测 `LIVENESS: resolve calls=11`），而**不是**"策略服务被查过"（同一个服务也被 `workspaceRoot()`/`getPolicy()` 读，查过 ≠ 走到这里），也**不是**"写入成功"（cwd 未知时同一次调用会因**无关的路径原因**返回 `ok:false`）。守卫：N17 的 `F-5/1c`（`tests/formal-verify-v4.test.mjs`）；随包变异：`tests/formal-verify-v4.mutants.mjs` 的**第六条**。
- **两条文档化边界（有意行为，不是缺陷）**：① **策略里没有根字段 ⇒ no-op**（没有可比的东西，不告警）；② **会话 cwd 未知 ⇒ 构造性相等 ⇒ 静默**（把"未知"当相等，避免用猜测刷告警）——**现在是断言而非仅文档**：`tests/formal-verify-v4.test.mjs:1981`（`* F-5/1c an UNKNOWN session cwd stays SILENT`）与 `:1982`（`* F-5/1c LIVENESS: the helper really ran with an unknown cwd (resolve calls=…, policy queries=…)`）；随包家族的**第六条**即 `F-5/1c: an unknown session cwd is warned about`（**6/6** 族变红）。两者都必须在断言里保持为"**no warning**"，改动它们等于改契约。
- **历史注记**：`docs/COMPAT-AUDIT-ROUND2.md` 的 §F-5 保留了 `2649a47` 的用例命名更正（case 1 / case 1b），那里是**历史**记录；本行是**可复核的守卫索引**。

### v4 item-6 — Lean 库索引写失败的**具名一次**（guard row，实测于 `c8a1b92`）

- **不变量**：一次失败的 Lean 库索引写必须被**具名一次**，带上 `lib=` / `proved=`，并说出后果 **`STALE until the next successful rebuild`**；同时**工具仍返回扫描计数**（具名是**附加**，不是新的失败模式）。
- **具名点（唯一承担责任处）**：`vibe-math-v4/vibe-math-v4.js:1297` —— `console.error('vibe-math-v4: rebuildLeanLibIndexes: the Lean library index could NOT be written (lib=… proved=…) - the index is STALE u…')`。
- **调用点分类（六个）**：`:893` 是 `settleLeanJob` 的**包装器**（`warnedIndexRebuild` 一次性 + 自己的 `settleLeanJob: rebuildLeanLibIndexes failed` 消息）；`:1006`（`writeLeanLibIndexesSafe`）、`:1402`、`:1446`、`:1460` 是**构造上 best-effort** 的包装（`catch(e){ /* best-effort */ }`）—— 所以具名责任集中在 `rebuildLeanLibIndexes` 内部那一处。
- **断言锚点**：`tests/formal-verify-v4.test.mjs:2074` 的 `section('N20-3b rebuildLeanLibIndexes: a failed INDEX WRITE is NAMED once (covers all six callers)')`；四条断言：`:2091` **反空过**（健康重建**静默**：`a healthy index rebuild is silent (the case is not vacuous)`）、`:2097` **恰好一次**（`a failed index write is NAMED exactly once (matched=… of … stderr lines)`）、`:2098` **后果**（`/STALE until the next successful rebuild/`）、`:2099` **附加性**（`r.ok === true`，仍返回扫描计数）。
- **怎么让它红一次（随包）**：`node tests/formal-verify-v4.mutants.mjs` —— 第 **8** 条族 `N20-3b: a failed index write is silent again`（单点：`if((_idxLibOk === false || _idxProvedOk === false) && !warnedIndexRebuild){` ⇒ `if(false){`）按名变红 `* N20-3b a failed index write is NAMED exactly once (matched=0 of 1 stderr lines)`。**族自报（本次运行）**：`8/8`、`hangs=[]`、`skipped=[]`、`ALL MUTANTS RED AS REQUIRED`、`TOTAL WALL TIME 108296 ms`（同修订复核方 110016 ms、作者 115082 ms —— 机器差异约 5%；**引用你那次运行的族行**）。
- **两条文档化边界**：① **settle 路径的套内捕获**：注入的索引写失败会被"最先触发的那个 rebuild 调用者"吃掉（作者实测 `armed=3 failed=1`，更早 `armed=9 failed=1` 且无告警）⇒ 套内无法判别该调用者；两个原始数字**作者实测、未被独立复现**（R17 标 still-unsure），但 R17 复现了边界所依赖的**结构**：单行 best-effort 包装、六个调用者都已被 `rebuildLeanLibIndexes` 内部的一次性具名覆盖、且每次后续 rebuild 都重写索引 ⇒ **自愈**，边界即立在这份结构证据上。② **best-effort 包装（`:1006`/`:1402`/`:1446`/`:1460`）**：构造上不具名，这是**有意行为**而非缺口。
- **已记录的守卫候选（本轮不派活）**：机械核对每个 `console.error('vibe-math-<preset>: …')` **具名点**是否**要么**在索引里有行（不变量 + 变异）**要么**在**显式豁免清单**里 —— 实现方式同 `audit-readme-counts` 的 seam（`COUNTS_*` 那套）。**记录而不立即实现**：它很可能一次性暴露一整类**未镜像的具名点**，值得独立一轮预算。

### 补遗四：语义单元、分层的断言与"计数是线索"（v4 writer 的措辞 + R14）

- **F-3 / F-4c —— 计数是线索，判决要读在"语义单元"上**：`registerTool(` 有 **36** 个调用点（本仓实测），但**注册单元只有一个** —— 它们都经 `ctx.effect(() => tools.register({…}))`（`vibe-math-v4.js:4042-4047`），所以**没有任何调用点需要自带包装**。同理，失败的 mkdir 在 **`ensureDirs()` 内部**被一次性具名（`warnedMkdir` 声明于 `:353`，置位并告警于 `:507-508`），**覆盖所有调用方**，因此**不需要**任何调用方侧的返回值检查。判决要写成"**哪个单元**被统一/包装/检查了"，并给出 `file:line`。
- **G-6 —— 分层，不重复（字段表已交付）**：**断言级**规则在 `tests/formal-verify-v4.test.mjs` 的 **SHIPPED ASSERTION RULES (C)**；**字段级**语义归 `docs/status-report-fields.md` 的**逐预设字段作用域表**（**name / scope / which-views / meaning** 四列，由源码**按 marker 派生**：v2 **20** 行、v3 **25** 行、v5 **43** 行取自 `status()` 的顶层键（含**简写属性**，R19 F-A），v4 **明确没有** `fieldScopes` 所以**不编造行**）。两处**不重复**同一句话。**归属（与 §14.9 同口径）**：字段级对账由 `tests/audit-status-report-fields.mjs` 拥有（doc↔source **双向**，打印 `frozen / doc-rows / exceptions` 三个计数；**简写属性感知**，否则会漏 8 个真实键）；`tests/audit-v5-integrity.mjs` 只保留 frozen-key drift 检查。变异：`tests/audit-status-report-fields.mutants.mjs`（**3/3**：基线 + 删一行文档 ⇒ 具名红 + 源码加一个字段 ⇒ 具名红）。**作业计数不复述**：以本文件由派生器写入的基线条（`node tests/run-tests.mjs --counts`）为准 —— 复述即漂移（R19 F-C 实测）。
- **A2 —— 同样是分层**：**断言级**规则在同上 **SHIPPED ASSERTION RULES (D)**；**实现级**变异族在 `tests/v5-institute-fixes.mutants.mjs` 的 **G1/G2**（实测该文件含 G1×3、G2×2、G4×2 的族名）。
- **V3-G2 —— 第二条"同族门禁条件"（断言已落地并绿）**：`tests/formal-verify-v3.test.mjs` 在**模块作用域**记住第一轮槽位（`:328` `let gateSlots1 = null`，round-one 的 require 轮在块里，所以必须提到模块级；`:739` `gateSlots1 = slotsOf(batch) // measured ["0","1"]`），并断言**
  `:812` `* V3-G2 the re-eligible reviews are the SAME slots that fired in round one (before=… after=…)` **与** `:813` `* V3-G2 and they are still DISTINCT slots`**（`:807` 的注释写明"`.length >= 2` 是**计数**，语义单元是**同一批槽位**"）。修复树 ALL GREEN（该套件 41.3 s）。
- **V3-G2 的实测边界（无判别性变异 ⇒ 不发布该族，这是测量结论而非疏漏）**：本 revision 下**不存在**严格保计数的变异 —— 继承旧子任务在本树里是**惰性**的（已结论的 verify 任务早已被删除），而**完全禁用回填**会超过 300 s 子进程上限、被分类为 **`HANG`（不是具名红）**。两个候选变异都被逐一实测后**否决**，记录在 `tests/formal-verify-v3.mutants.mjs` 的 `MEASURED BOUNDARY (V3-G2)`（`:78`）、`TWO CANDIDATE MUTANTS WERE THEN MEASURED - BOTH REJECTED`（`:86`）与 `RECORDED BOUNDARY`（`:93`）。因此该族**保持 1/1**，**故意**不含 V3-G2 条目 —— 一个会挂起的族会拖垮门禁，而不是证明什么。
