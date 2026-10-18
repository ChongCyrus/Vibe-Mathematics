# 目标 1 收口记录：★ DSH 0.2.0-rc.2 → 0.2.1-rc.2 的**适配**与**可采纳能力**

> ★ **目标 1 的两半**（★ 原文）：★ ① **"全面检查当前 vmu 是否需要做出修改来适配当前 DSH。如果需要，则进行适配。"** ② **"最新版 DSH 有没有新增一些我们的 vmu 可吸取可采纳的东西、功能、接口或机制，如果有则可考虑吸取采纳。"**
> ★ 本卷**逐条结清**这两半 —— ★ 每一条都给**结论 + 证据**（★ 代码位置或测试数字），★ **未做的明确写"不采纳 + 理由"**，★ 而不是留白 ✓

---

## A. 适配（★ 第一半）

### A.1 ★★★ 唯一的**硬断点**：`subagents` 的启动动词换了
★ **实测（两路独立确认）**：★ 0.2.1-rc.2 的 `subagents` 服务提供 `startActivation`／`waitForChildren`／`drainDescendants`／`drainChildren`／`sendMessage`／`interrupt`／`listChildren`／`listDescendants`／`prompt`／`interruptByParent`／`registerProvider`／`getProvider`／`list`／`resolveMaxDepth`，★ **而 `start` 与 `startContinuable`【都不在】** ✓
★ **为什么这是硬断点**：★ vmu 的**默认**交付模式是 `deliverMode:'subagents'`，★ 它的整条桥都走那两个被移除的动词 ⇒ ★ **在 0.2.1 上每个成员回合都会被拒**，★ 而且拒绝会把原因指向**一个其实存在的服务** ✓
★ **适配**：★ 加**第三条路径 `activation`**（★ 顺序 `one-shot → activation → continuable`），★ `delivery:'caller'`（★ 结果留在本调用方，★ 不同时通知父模型），★ 从 `result.output` 的 **text 块**取词（★ `SubagentResult` 没有 `reply` 字段），★ 携带 `stopReason`／`childId`／`structured`，★ **成功与失败两条路都 `dispose()`** ✓
★ **旧动词保留**：★ vmu 仍声明支持 **0.1.2+**，★ 且 48 个 fake-host 套件靠它们 ✓
★ **证据**：★ `tests/vmu-turn-activation.test.mjs` —— **33/0**（★ 原 27，★ 本轮又 +6，★ 见 B.1）✓

### A.2 ★★ 三处"假阴性/假阳性"的适配
| ★ 位置 | ★ 原来的问题 | ★ 现在 |
|---|---|---|
| ★ `installer.js` | ★ **要求 `startContinuable`** ⇒ ★ 自检把**更新的宿主**报成"版本可能过旧"（★ 假阴性） | ★ 改成"`start`／`startActivation`／`startContinuable` **至少其一**" ✓ |
| ★ `host-deliver.js` | ★ 只在 `start` 存在时发现 provider ⇒ ★ 0.2.1 上**永远发现不到** | ★ 加 `startActivation` ✓ |
| ★ 同文件的拒绝措辞 | ★ 说"宿主没有 subagents 服务"（★ **假话** —— 服务在，★ 缺的是动词） | ★ 区分"没有服务"与"有服务但没有启动动词"，★ **并列出宿主实际提供的动词** ✓ |

### A.3 ★★★ `engines.dsh` 的一条**真缺口**（★ 门禁找到的）
★★ **semver 规定：预发布版本只有范围里含【同 major.minor.patch 且带预发布】的比较符才算满足** ⇒ ★ **`0.2.1-rc.2` 不满足 `>=0.2.0-alpha.1 <0.3.0-0`** ✓
★ **修法**：★ 加一段 **`>=0.2.1-alpha.1 <0.3.0-0`**（★ **不是放宽上界** —— ★ 那会连未验证版本一起放进来），★ **三处必须逐字相等**：★ 顶层 `engines.dsh`（★ dsh-market 读它）／★ `dsh.engines.dsh`／★ 门禁的 `EXPECTED` ✓

### A.4 ★★ 卫生四项
★ ① **删掉 4 个宿主【不存在】的钩子名**（★ `prompt/assemble`／`prompt/section`／`agent/inbox`／`settings/changed`）—— ★ 它们**两版都不 emit**，★ 列在登记表里会让 pack 声明后**注册成功但永不触发**（★ 静默 no-op）；★ 注释里写明宿主真名 ✓
★ ② `ctx.get('session')` → ★ **死代码**（★ 键是 `sessions`，★ 且它是 SessionStore）⇒ ★ 改成**真能工作的回退**（★ 只在**唯一一个**会话时取）✓
★ ③ `reportfeedback.js` 的 `CONTEXT_ORDERS` 注释数字过时 ⇒ ★ 更正 ✓
★ ④ `backgroundMode: continuable` ⇒ ★ **记档不改**（★ 0.2.1 的 Schemastery **静默忽略**、★ 行为不变；★ 而动 6 个冻结预设会危及 parity 故事）✓

### A.5 ★ 结论
★★ **适配这一半【已完成】** ✓ ★ 证据：★ 上面四节 ＋ `vmu-turn-activation.test.mjs` **33/0** ＋ `installer-compat` **77/0** ＋ `market-metadata` **30/0** ＋ **T1 386/386** ✓

---

## B. 可采纳的新能力（★ 第二半）

★★ **原则**：★ 按 `docs/01 §1.4.1`，★ **"有没有用户可能的需求"** 才是判据；★ 而按 §1.4.4，★ **声明了却接不上也没用** ⇒ ★ **每一项要么【真接上】，★ 要么【明确不采纳 + 理由】** ✓

### B.1 ★★★★ 已采纳：**0.2.1 的 per-child 字段**（★ 本轮落地）
★ **能力**：★ `SubagentActivationSpec` 接受 **`cwd`／`agentPreset`／`outputSchema`／`persona`／`toolFilter`／`depthLimit`** ✓
★ **采纳前的问题**：★ vmu 构造 activation spec 时**一个都不带** ⇒ ★ **pack 无法让 solver 与 verifier 用不同的工具面/预设/工作目录** —— ★ 而这**正是多角色研究包需要的**（★ v3 的角色分工就表达了这个）✓
★ **实现**：★ `kernel/turn/index.js` 的 **`childFieldsOf()`** —— ★ **只拷贝调用方【真给了】的键** ⇒ ★ 不传时 **spec 逐字节不变**（★ 不注入 `undefined`），★ 旧宿主忽略这些字段 ✓
★ **调用方式**：★ 在交给交付接缝的 **spec 上加 `child`**（★ 或直接放在 `turn` 上）—— ★ **不需要新设置键** ✓
★ **证据**：★ `tests/vmu-turn-activation.test.mjs` 第 7 组 **6 条**：★ 六个字段逐个**到达 spec** ＋ ★ **"什么都不给 ⇒ 一个都不注入"**（★ 默认不变的反向断言）✓

### B.2 ★★ 已采纳（★ 更早已落）：**结构化子代理回执**
★ `SubagentResult.structured` ⇒ ★ activation 路径**已透传**（★ `{ reply, childId, stopReason, structured, attribution, deliveryPath }`）✓
★ **意义**：★ 与 vmu"回执＝一次调用的 JSON 结果"的文化一致；★ `outputSchema`（★ 见 B.1）让它**可要求** ✓

### B.3 ★★ 已采纳（★ 更早已落）：**`turn/reply-parsed` 的可改写回执**
★ 不是新能力，★ 但 **0.2.1 的 `SubagentResult.output` 内容块形状**让"取词→归一化→改写"这条链成形 ⇒ ★ **K10 落地**（★ `bus.rewriteOf`）；★ 而**本轮又修好它更深的一层**：★ `rewriteOf` 返回**字符串**，★ 原代码交给 `apply()` 会**清空整份回执** ⇒ ★ 现在**解码成 reply 对象**再派发 ✓

### B.4 ★★★ 明确的**不采纳**（★ 逐条给理由，★ 不是留白）
| ★ 能力 | ★ 是什么 | ★ 为什么不采纳 |
|---|---|---|
| ★ `appendPluginRecord` | ★ 实验性的**会话记录**通道（★ 随 fork/resume 走，★ 可 `ignorable`） | ★ **实验 API**（★ DSH 自己的注释就这么写）⇒ ★ 用它当**权威**会把 vmu 绑在会变的东西上；★ 而 vmu 的 `records` 已是权威 ⇒ **采纳它只作镜像会得到两份事实**。★ **更好的时机**：★ 等它稳定、★ 且我们真需要"随会话走"的记录时再评 ✓ |
| ★ `workingDirectory` 服务 | ★ 宿主的工作目录服务 | ★ vmu 的 `root` 已由装配注入；★ **多一个来源会让"库在哪个目录"出现两个答案** ⇒ ★ 除非出现"一个部署要多个工作区"的真实需求（★ 目前没有），★ **不采纳** ✓ |
| ★ `presentationMeta` / `meta` | ★ 回执的展示元数据 | ★ 面向**宿主 UI**，★ vmu 的回执已在 `vibe_vmu_status` 里自报；★ **采纳它要先有消费者**（★ 目前没有）⇒ ★ **不采纳** ✓ |
| ★ `required?` / `interpolate:false`（提示词段） | ★ 段的可选性与插值控制 | ★ `interpolate:false` **已等价可用**（★ v3 的根 persona 就是**不渲染 `{{ }}`** 的通道）；★ `required?` 的语义在 vmu 的**缺值策略**里已有对应 ⇒ ★ **不另采**，★ 但**已在 `docs/02` 记录**其对应关系 ✓ |

★ **为什么"不采纳"也算完成**：★ 目标原文是 ★ **"如果有则可考虑吸取采纳"** —— ★ **"考虑"的产物就是这个逐条裁定**；★ **把每一项都塞进来反而是"任何东西都要收"**，★ 与 §1.4.1 的"宽义 ≠ 什么都收"相悖 ✓

---

## C. ★ 目标 1 的状态
★★ **A（适配）＝ 完成** ✓
★★ **B（可采纳）＝ 完成**（★ 1 项本轮落地、★ 2 项更早已落、★ 4 项明确不采纳并给理由）✓
★ **判据**：★ 本节每条都有**代码位置**或**测试数字**；★ **没有一条留白** ✓
