# 03 · **扩展：怎样造一个你自己的机构**

> ★ **这一卷是框架的【兑现处】**。★ 前两卷说它"能换"，★ 这一卷说**怎么换**。
> ★ 目标：★ 读完你应当能写出一个 pack，★ **不改内核一行**，★ 就跑出**另一种机构**。
>
> ★★ **快照声明（G8）**：本卷是**弃用前**的 `docs-landed` 快照，不是当前权威清单；旧 `vibe-math-v2`…`v5r`
> preset **已弃用**（见 `docs/DEPRECATED-LEGACY-PRESETS.md`）。**工具面数**以 `docs/18` 的生成式索引为准、
> **设置键数**以 `docs/04` 的生成式设置表为准、**内核模块／服务数**以 `docs/02` 的 kernel index 为准 ——
> ★ 本卷不再手抄这些会漂移的计数 ✓。

## 1. ★★★ 最小可行的 pack（★ 从一个文件夹开始）

```
packs/my-institute/
  index.js          ← ★ 唯一必需的文件：清单
```
```js
export default {
  id: 'my-institute',
  version: '1.0.0',
  packContractVersion: 1,
  description: '一个最小机构：两个槽位、一个规则',

  // ★ 你【消费】别人的能力才写在这里。★ 你自己首次引入的能力【不要】写 —— 那是鸡蛋问题。
  requires: [{ service: 'vmu.tasks', minVersion: 1 }],

  // ★ 你自已命名空间的错误码（★ 让"框架拒绝"与"你的机构拒绝"可区分）
  codes: ['VMU_PACK_MY_INSTITUTE_LOCKED'],

  // ★ 你想要的【值】（★ 键必须已在 settings/schema.js 声明 —— 见 §4）
  settings: {
    'vmu.meetings.quorumRule': 'm-unanimous',
    'vmu.limit.maxLiveMembers': 4,
  },

  // ★ 你的编制：★ 内核只见【槽位＋权限】，★ 它永远不知道"研究员"是什么
  slots: [
    { id: 'chair',  label: '主持人', capacity: 1, permissions: ['convene', 'close', 'assign'] },
    { id: 'member', label: '成员',   capacity: 0, permissions: ['speak', 'vote', 'propose'] },
  ],

  // ★ 你的归档轨道（★ 负知识有自己的文件，不是脚注）
  tracks: ['progress', 'obstacles', 'rejected'],

  rules: [],        // ★ M1（声明式）—— 见 §2
  middleware: [],   // ★ M2（代码模块）—— 见 §2
  aliases: [],      // ★ 旧名字 → 已发布服务（★ 不是重命名工具）
}
```

★ **就这些，★ 一个机构已经能跑了**：★ 两名成员可以开会、发言、投票 ✓
★ **证明**：★ `packs/institute-min/` 就是这样的**一份纯数据清单** ✓

## 2. ★★★★★ 四种中间件 —— ★ 而【只有 M1/M2 在总线上】

★ **这是最容易误解的一处，所以先给总表**（★ 权威：`docs/05-middleware.md`；★ 该卷行数以文件为准，本卷不手抄）：
| ★ 形态 | ★ 载体 | ★ 必需字段 | ★ 自由度 | ★ 干什么 |
|---|---|---|---|---|
| ★ **M1 规则（声明式）** | ★ 总线条目 `kind:'rules'` | ★ `id`／`kind`／`on`（**无需 handler**） | ★ 低 | ★ 选钩子/顺序/作用域/失败策略/能力声明 |
| ★★ **M2 代码模块（函数式）** | ★ 总线条目 `kind:'module'` | ★ ＋**必须 `handler` 函数** | ★★ **高（任意逻辑）** | ★ **同进程真代码** |
| ★★ **M3 脚本／工作流（子进程桥）** | ★★ **不在总线上** | ★ `file`／`inline`（进程协议） | ★ 中（受协议限制） | ★ **跑真脚本**：`kernel/script-bridge.js` ＋ `vibe_vmu_script`（★ `config.scripts` 声明） |
| ★★ **M4 外部插件／mod** | ★★ **不在总线上** | ★ 宿主插件清单 | ★ 组合级 | ★ **新服务、新工具、新提示词段** |
⇒ ★ **所以"能不能写程序"的答案是：★ 能，★ 而且有四层** —— ★ **M2 写同进程函数，★ M3 起子进程跑外部程序，★ M4 做完整插件** ✓
★★ **但有一处精度，写错会被拒**：★ **`kind:'script'`／`kind:'plugin'` 在【总线】上会被具名拒**（★ `VMU_MIDDLEWARE_KIND_UNSUPPORTED`，★ hint 说明该去哪）—— ★ **因为总线只跑 M1/M2，★ 脚本与插件【各有自己的载体】** ✓
★ **M3 与 M4 的完整用法**：★ **`docs/19-plugin-and-extension-development.md`**（★ "当 settings ＋ 中间件不够用时"；★ 行数以该卷为准）＋ ★ `docs/05-middleware.md §2` ✓

> ★★★★ **三件最容易搞混的事**（★ **权威在 `docs/05-middleware.md §2.1`**，★ 这里只给判据）：
>
> **① 载体不同 ＝ 关系不同，不是"主路 vs 支线"。**
> ★★ 一句话判据：★ **它能拦住【别人】的行为吗？**
> ★ **能** ⇒ **介入**（M1／M2，在事件流上 `deny`／`cancel`／改参数／加提示词段）；
> ★ **不能，只是被叫过去算一件事** ⇒ **被调用**（M3 —— `vibe_vmu_script` 的结果**只回给调用方**）；
> ★ **不在这条流上，而是把 vmu 包在里面** ⇒ **包含**（M4，宿主插件）。
>
> **② 文件夹名不是类别。** ★ 一个 pack 的条目在 **`index.js` 里分两级声明**：`middleware: [...]` 交给**总线**；`promptPolicies: [...]` 交给 `createKernel` 的 `sectionPolicy`（**不是总线**）。
> ★★ **实测反例**：★ **`packs/v5r/middleware/prompt-switches.js` 住在 `middleware/` 目录里，而它不是中间件** —— 它的 `on` 是 `prompt/assemble`，★ **不是已登记的总线钩子**；按 `middleware` 声明会让 `pack.js` 把它交给总线、**总线拒绝**、**整个 pack 的 apply 抛错**（`packs/v5r/index.js:71-75` 记着这段）。
> ⇒ ★ **读 `index.js` 的字段名，不读目录名。**
>
> **③ "用脚本控制事件流"当前没有受支持的形状。** ★ **脚本桥（`script-bridge`）中间件拿不到** —— M2 模块只收到 `kernel:{read}` ＋ 能力门控的 `services`，而服务目录里没有它（`kernel/loader.js:114`；服务目录见 `kernel/index.js` 的 `services` 那一块）。★ 想在事件上判断又要跑外部程序，现在只能在 M2 里自己起进程，★ **那会丢掉 M3 的整套保证**（结构化结果、超时具名失败、声明与预算）。
> ★ **这是已知的形状缺口，不是已实现能力。**
>
> ★★ **而"禁止脚本"是另一回事**：★ **v5r 用一条【总线规则】关掉了【脚本面】** —— `v5r-core-no-adhoc-scripts`（`on:['tools/pre-execute']`，`when:{tool:['vibe_vmu_script']}` ⇒ 拒）。★ 它可被禁用，所以是**机构政策**、不是内核限制。★ **"没实现"与"明令禁止"要分开说。**

### 2.1 M1 —— 声明式规则（★ 想做"某条件下拒绝/放行"就用它）

```js
rules: [{
  id: 'my-institute-locked-vote',
  kind: 'rules',
  on: ['tools/pre-execute'],                       // ★ 必须是【宿主真的会桥接】的钩子名
  when: { tool: ['vibe_vmu_ballot'] },             // ★ 谓词树（闭集，见下）
  then: [{ deny: { code: 'VMU_PACK_MY_INSTITUTE_LOCKED', message: '…', hint: '…' } }],
}]
```
★ **★ 红线**：★ **M1 是数据，★ 不是小解释器** —— ★ 谓词与动作都来自**闭集**；★
★ **任何"表达式形状"的东西**（`js`/`eval`/`expr`/`code`/`function`/`script` 键、★ **或字符串冒充谓词对象**）★ **一律被拒** ✓
★ **需要更复杂的逻辑？** ★ **去写 M2**（★ 这是设计：★ 答案不是"加个求值器"，★ 是"写一个代码模块"）✓

### 2.2 M2 —— 代码模块（★ 想要真行为就用它）

```js
middleware: [{
  id: 'my-institute-stall',
  kind: 'module',
  order: 300,
  on: ['control/idle'],
  failure: 'open',                                  // ★ open=失败不阻断；closed=失败即拒
  capabilities: ['trigger-workflow', 'record'],     // ★ 你要触达服务【必须】在这里声明
  module: MY_STALL_MODULE,                          // ★ 模块带 api 时用 module:，不是 handler:
}]
```
★ **`kind:'module'` ＋ `module:`** ⇒ ★ 装载器**校验它并注入 `api`** —— ★ **这是中间件触达服务的唯一合法方式** ✓
★ **`handler:`**（不带 `module:`）⇒ ★ 只拿到 `{ hook, payload, ctx, dryRun, traceId, setting }`，★ **碰不到服务** ✓
★ **★ 为什么这条区别重要**：★ 它让"一个能改服务状态的中间件"**必须显式声明** —— ★ 于是能力边界**可审计** ✓

### 2.3 M3 —— 脚本（★ 想跑**外部程序**就用它；★ **不写进 `middleware:`**）

★ **载体是 `config.scripts` ＋ `vibe_vmu_script` 工具**，★ **不是总线条目** ✓
```js
// ★ 在 pack 清单或宿主 config 里声明（★ 不是 middleware 数组）
scripts: [{
  id: 'my-checker',
  file: 'scripts/check.sh',        // ★ 或 inline: '…'
  timeoutMs: 30000,
}]
```
★ **进程协议**：★ **一次运行必须返回一个【结构化结果】**（★ 至少含 `ok` 的 JSON）；★ **自由文本 stdout ⇒ 具名拒** ✓
★ **seam 结果字段是 `code`**（★ 不是 `exitCode`）—— ★ 这条实测踩过两次 ✓
★ **非零退出是【结果】，★ 不是异常**；★ **只有超时才是硬失败**（★ `VMU_JOB_TIMEOUT`）✓

### 2.4 M4 —— 插件（★ 想加**新服务/新工具/新提示词段**就用它）

★ **载体是【宿主插件清单】**（DSH 侧），★ **也不在总线上** ✓
★ **它能做的比中间件多一档**：★ **注册新服务、注册新工具面、注入新提示词段** —— ★ 因为它**消费 vmu 已发布的服务** ✓
★ **完整走法**：★ `docs/19-plugin-and-extension-development.md`（★ 行数以该卷为准）✓
★ **★ 先问自己**：★ **"这件事能用 M1 声明吗？"** ⇒ ★ 能就别写代码；★ **"能用 M2 写个模块吗？"** ⇒ 能就别做插件 ✓
（★ 这是本仓的红线四：★ **没有消费者就不给机制** —— ★ 反过来，★ **能用轻的形态就别上重的**）

### 2.5 ★★ 钩子名必须是真的
★ **教训（实测）**：★ 曾把 `on: 'turn.assemble'` 写成以为的钩子名 ⇒ ★ **旧预设（`vibe-math-v2`…`v5r`，已弃用，见 `docs/DEPRECATED-LEGACY-PRESETS.md`）里它是【惰性】的，★ 而测试全绿** ✓
★ **所以**：★ **钩子名要用宿主真的会 emit 的那些**（★ 以 `kernel/bus.js` 与各服务的 emit 点为准）✓

## 3. ★★★★ 提示词：声明【段】与【绑定】，★ 不要改内核

```js
get sections() { return MY_SECTIONS },   // ★ 用 getter：清单在此、定义在下方，避免 TDZ
get bindings() { return MY_BINDINGS },
```
★ **一个段**：★ `{ name, order, range:'pack', vars:[…], text }` ✓
★ **一个绑定**：★ `{ section:'<段名>', role:'member', text }` ／★ `phase:'verify'` ／★ `member:'r-1'` ✓
★ **优先级**：★ `role` → `phase` → `member` → `task` → `agent` ⇒ ★ **每段每次装配只出一个赢家** ✓
★ **变量**：★ 只能用白名单里的（★ `member`/`role`/`roleLabel`/`phase`/`roster`/`quorum`/`round`/`statusBlock`/… ／★ `{{ setting:某个键 }}`）⇒ ★ **不在白名单【报错】而不是渲染成空** ✓

### 3.1 ★★★★★ 两条必须知道的"抄录禁忌"（★ 都是实测教训）
1. ★★ **捕获的快照不能当运行时段** —— ★ 一次真实运行的输出里含**具体的轮次号、名册、绝对路径**；★ 把它当运行时段 ⇒ ★ **这些冻结值会进入每一次活装配** ✓
   ⇒ ★ **要写手稿（从源逻辑转写），★ 不要贴快照**；★ vmu 里有一道**具名门**（`assertRuntimeSafeSections`）**专拒这种段集**，★ **且它连【绑定】一起查** ✓
2. ★★ **人设若"按成员各一条绑定"，★ 管线会【附加每一条匹配的】** ⇒ ★ **一名成员会收到多个身份** ⇒ ★ **一个段在一个装配里只该出一个赢家** ✓

## 4. ★★★ 设置：★ 你只能设【已声明】的键

★ **`settings/schema.js` 是唯一声明处**（★ 类型/域/默认/归属/热级）⇒ ★ **pack 里的 `settings` 只能填【已声明】的键** ✓

### 4.1 ★★★★★ 两个都叫 `settings` 的目录 —— ★ **它们分工相反，别删错**
★ 这是新手最常混的一处：
| ★ 目录 | ★ 性质 | ★ 内容 | ★ 能不能删 |
|---|---|---|---|
| ★★ **`vibe-math-vmu/settings/`** | ★★ **【声明】＝代码** | ★ `schema.js`（★ 头注自述 *"the SINGLE SOURCE of every tunable"*；★ 行数以源码为准）＋ `planned.js` | ★★★ **绝不能删** —— ★ **它被多处引用，★ 删了 vmu【起不来】**；★ **逐键设置手册 `docs/04-settings.md` 就是由它生成**（★ 键数以生成卷为准） |
| ★★ **`packs/<id>/settings/`** | ★★ **【取值】＝数据** | ★ `defaults.json`（＋同值的 `defaults.js` 代码视图） | ★ 可以删/改 —— ★ 删了只是**回到"零机制默认"**（★ **零机制是安全的一侧**）|
★ **为什么必须分开**：★ **"能设什么"与"这个机构设成什么"如果写在一处，★ 同一个键就会有两个作者 —— ★ 而两个作者就是下一次漂移的起点** ✓
★ **读未声明的键【是缺陷，不是默认值】**：★ `assertDeclared` 抛、`readSetting` 具名拒 ✓
★ **权威**：★ `docs/04-settings.md`（逐键手册，**生成**；★ **键数以该生成卷为准，本卷不手抄**）／★ `docs/10-packs.md`（★ pack 手册，★ `:30` 有那个目录的直接说明）✓
★ **为什么不在 pack 里"顺手声明"**：★ 因为**声明与取值必须分开** —— ★ 否则同一个键会有两个作者，★ **而两个作者就是下一次漂移的起点** ✓
★ **你需要一个新旋钮时**：★ **在 `schema.js` 加一行**，★ 然后**让派生面重新生成**：
```bash
node scripts/generate-vmu-settings-table.mjs --write
node scripts/update-doc-counts.mjs
node scripts/regen-all.mjs --write    # 再跑 --check 确认同步
```
★ **★ 一条规矩**：★ **一个键如果没有任何代码读它，★ 就不该被声明** —— ★ 那正是"静默声明"（★ 用户能设，★ 却什么都不做）✓
★ **本仓的处置**：★ 存在**逐键裁定的惰性键台账**（★ `docs/acceptance/phase3-inert-keys-ledger.md`），★ **每键都有 WIRE/DELETE 之类的结论** ✓

## 5. ★★★ 别名：★ 让旧名字继续工作，★ 而不是重命名

```js
aliases: [{ from: 'vibe_v5_poll_vote', to: 'vmu.tasks' }]
```
★ **约束（实测）**：★ **别名目标必须是【已发布的服务】，★ 不是工具名** —— ★ 注册表会校验 ✓
★ **★ 为什么不直接改名**：★ 改名会让所有老提示词/老脚本**静默失效**；★ **别名让旧名字可解析，★ 且能让调用方【被告知】**自己在用旧名字（★ `resolve()` 里带 `viaAlias{deprecated, reason}`）✓

## 6. ★★★ 规则与纪律（★ 违反即等于改错方向）

1. ★★ **能力在内核，★ 规范/策略/装配在 pack 或宿主** —— ★ 不把 policy 写进代码。
   ★ **例（反例）**：★ 不要把"什么算活跃同伴"写成工具里的常量 —— ★ **那是可声明的** ✓
2. ★★ **不硬编码本该由声明/推导得来的值** —— ★ 该派生的（枚举、清单、计数）**不手抄**。
   ★ **正面样板**：★ **旧 v5r preset（已弃用，见 `docs/DEPRECATED-LEGACY-PRESETS.md`；其 pack 仍是当前 `packs/v5r`）的"停滞后开会"**用 **`3 × idleAfterMs` 的比率**，★ **而不是写死原来的 360000** ✓
3. ★★ **拒绝要具名，★ 不许静默假装成功** —— ★ 带 `code`/`message`/`hint`；★ **不吞异常、不拿引擎消息当拒绝**。
   ★ **样板措辞**：★ *"refusing to treat an unreadable fold as an empty one"*／★ *"an unread snapshot must never be overwritten"* ✓
4. ★★ **没有消费者，就不给机制** —— ★ 默认零注入；★ **一切动起来都来自声明** ✓

## 7. ★★★ 写完怎么验（★ 三层，由轻到重）

★ **① 装载是否成立**：
★ `vibe_vmu_pack {action:'plan'}` ⇒ ★ **`ok` ＋ `actions` 非空 ＋ `problems` 为空**（★ `plan()` 是**纯**的：★ 同一清单两次 plan **逐字相同**，★ 且**不改动传入的清单**）✓
★ **② 你的规则/中间件是否真的被调用**：★ 用**一次真机运行**看副作用（★ 计数、拒绝码、回执里的 `enforced[]`/`fired[]`）✓
★ **③ 卸载是否无残留**：★ `unload` 后**两个快照应当相等**（★ 本仓用 `snapshot()`/`packed()` 做这件事）✓

## 8. ★★★★★ 一个完整的思考顺序（★ 照着做）

1. ★ **先说清制度**：★ 谁是主持、谁能投票、什么算结题、负知识存哪 ✓
2. ★ **把制度翻成槽位与权限**（★ 内核只见这个）✓
3. ★ **把"值"放进 `settings`**（★ 只填已声明的键）✓
4. ★ **把"文本"写成段 ＋ 绑定**（★ **从源逻辑转写，★ 不贴快照**）✓
5. ★ **把"某条件就该拒绝/放行"写成 M1**；★ **需要真行为才写 M2**（★ 并**声明 capability**）✓
6. ★ **旧名字用别名**（★ 指向**服务**）✓
7. ★ **验三层**（★ plan／真机副作用／unload 无残留）✓
★ **★ 全程不改内核一行** —— ★ 如果某一步你觉得"必须改内核"，★ **先问：★ 这能不能是一条【声明】？** ★ 答案是能，★ 那就声明；★ 真的不能，★ 那才是内核的新能力（★ 而它要有**消费者**才该存在）✓

---

## M1 规则的闭集（代码核实版）

> ★ 本节**每个名字都从 `vibe-math-vmu/kernel/rules.js` 读到**（行号见每行末）。★ 上游 `docs/05` 是主张，**代码是事实**。
> ★★ 一句话：**M1 规则是【数据】，不是代码。** 引擎能**静态校验**、能 **dry-run**，正是因为它**不允许表达式**（`:1-13`）。

### 谓词白名单 —— 只有这 12 个键

| 键 | 含义（引擎读它的方式） | 出处 |
|---|---|---|
| `tool` | 工具名；★ **支持 `*` 结尾通配** | `:19` ／ `:189` |
| `member` / `role` / `phase` | 等于该维度之一（数组 ⇒ 任一命中） | `:190-192` |
| `arg` / `setting` / `count` / `subject` / `match` | 见 `:19` 的白名单；★ 求值在 `:189-200` 一带 | `:19` |
| `all` / `any` / `not` | ★ **组合子**（递归子树，不是原子谓词） | `:19` ／ `:83` |

★ **不在白名单里的键 ⇒ 编译期拒**（`:84` 收集 `unknown`；`:83` 单独算原子谓词）。
★ **比较算子**（写在谓词对象里）：`undefined`（等价 `eq`）／`eq`／`ne`／`gt`／`gte`／`lt`／`lte`／`in`／`re` —— **就这 9 个**（`:163-170`）。

### 动作白名单 —— 只有这 12 个键，且**每个都消费一项能力**

| 动作 | 需要的能力 | 出处 |
|---|---|---|
| `deny` | `deny` | `:28` |
| `cancel` | `cancel` | `:28` |
| `rewriteArgs` | `rewrite-args` | `:28` |
| `replaceResult` | `rewrite-result` | `:28` |
| `appendPrompt` | `append-prompt` | `:28` |
| `record` | `record` | `:28` |
| `notify` | `notify` | `:28` |
| `setSetting` | `set-setting` | `:29` |
| `triggerWorkflow` | `trigger-workflow` | `:29` |
| `annotate` | `annotate` | `:29` |
| `allow` | `read-args` | `:29` |
| `ask` | `read-args` | `:29` |

★ **这张表就是 `ACTION_CAPABILITY`（`:27-30`）**，且**与 `kernel/bus.js` 逐项一致**（`:25-26` 的注释 ＋ `tests/vmu-rules.test.mjs` 断言两者相同）⇒ ★ **你写 `then: [{ triggerWorkflow: … }]` 就必须先声明 `trigger-workflow` 能力**，否则总线拒。
★ 不在表里的动作名 ⇒ **编译期拒**：`then[i]: unknown action: <key>`（`:122`）✓

### 两条硬拒 —— ★ 这是 M1 的**哲学边界**，不是实现细节

1. ★★ **未知的谓词键 / 动作名 ⇒ 具名拒**（`:5-6` 注释；执行点 `:84` ／ `:122`）；
2. ★★ **任何"像表达式"的东西 ⇒ 拒**：带 `expr`／`js`／`eval`／`code`／`function`／`script` 键，**或**在本该放谓词对象的地方放了字符串（`:7-11`）。
   ★ 注释原话：**"the answer to 'I need more logic' is a code module (M2), not a small interpreter here"** ⇒ ★ **要更多逻辑就去写 M2 模块，别指望在这里塞表达式** ✓

### 其它已验证的校验形状

| 校验 | 读数 | 出处 |
|---|---|---|
| `then` 必须是**非空列表** | `'then must be a non-empty list of actions'` | `:54` |
| 未知动作 | `'then[i]: unknown action: '` | `:122` |
| `apiVersion` | ★ **1** | `:17` |

★ **未验证**（本轮**没读到 ⇒ 不写死**）：`when` 的**完整**树形语法（只读到 `:19`／`:83-84`／`:163-170` 三处）；`subject` 谓词的**命名状态从哪注入**（`:147` 注释提到由内核注入 ⇒ ★ 具体注入点未核）；`count` 谓词的**计数口径**。
⇒ ★ 要补这三条：`grep -n "subjects\|count" vibe-math-vmu/kernel/rules.js` 并读 `createRulesEngine` 的调用点。

---

## M2 模块契约（代码核实版）

> ★ 全部读自 `vibe-math-vmu/kernel/loader.js` 与 `kernel/bus.js`。★ **M2 = 代码模块**；★ **M1 = 数据规则**（见上一节）。

### ★★ `module:` 形态拿到的 `api` —— **只有这 7 个键**

★ **`kernel/loader.js:32`**：`export const API_KEYS = Object.freeze(['log', 'setting', 'kernel', 'dryRun', 'traceId', 'hook', 'services'])` ⇒ ★ **`api` 上挂的就是这 7 个，一个不多** ✓
★ 逐项来源（`makeApi`，`:120-127`）：`log` ／ `setting: (key) => services.setting ? services.setting(key) : undefined`（`:125`）／ `kernel: services.kernel || Object.freeze({})`（`:126`）／ `services`（`:127`，★ **能力门控**）／ `dryRun`／`traceId`／ `hook`。
★ **`services` 是能力门控的门**：`:111` 的注释 —— ★ **"`services` is the CAPABILITY-GATED door to the assembled services"** ⇒ ★ 没声明能力就拿不到 `services`（★ 与 `trigger-workflow` 解锁相关，见上节动作表）。

### 能力（capability）—— ★ 三处定义，含义不同，别混

| 处 | 内容 | 用途 |
|---|---|---|
| `kernel/loader.js:34` | `['read-state','read-args','deny','cancel','rewrite-args','rewrite-result', …]` | ★ **模块可声明的能力集合** |
| `kernel/bus.js:24` | `export const CAPABILITIES = Object.freeze([ … ])` | ★ **总线侧的能力表**（与上面须一致） |
| `kernel/bus.js:30` | `DECISION_CAPABILITY` | ★ **决策类动作 → 能力** 的映射 |

★ **三条硬校验（`loader.js`）**：① `:81` **`capabilities` 必须非空**；② `:82` **未知能力名 ⇒ 具名拒** `'unknown capability: ' + c`；③ ★★ `:93-95` **模块用的能力必须是【条目声明的能力】的子集** ⇒ 否则 `'the module uses capabilities the entry did not declare: ' + undeclared` ✓

### 条目（entry）形状与 `handler`

★ 条目字段（`bus.js:77-105` 的 `VU_HOOKS` 是它们的实例）：`{ name, kind, failure, blockable, rewritable, scope, timing… }`。
| 字段 | 语义（★ 读到什么写什么） | 出处 |
|---|---|---|
| `order` | ★ **排序确定性：`order` 然后 `id`**（两句原话："ordering is deterministic (order, then id) so two runs of the same configuration behave identically"） | `bus.js:12` |
| `failure` | ★ 我读到的取值：**`'open'` / `'closed'`**（如 `:77` `failure:'open'`、`:79` `failure:'closed'`）；★ **`open` 与"是否 blockable"是两件事**（`:86` 注释专门区分） | `bus.js:77-105` |
| `scope` | ★ **member / role / phase**（`bus.js:11` 原话："scope decides who a hook applies to (member / role / phase)"） | `bus.js:11` |
| `capabilities` | ★ 每个条目**必须声明**；★ **用了没声明的能力 ⇒ 具名拒**（`bus.js:7`："using one it did not declare is a named refusal, not a …"） | `bus.js:7` |

★ **未验证 ①：`order` 的缺省值** —— ★ 我只核到"排序规则"，**没核到缺省值** ⇒ 补法：`grep -n "order\b" vibe-math-vmu/kernel/bus.js` 读条目规范化处。
★ **未验证 ②：`failure` 是否有第三个值** —— ★ 我**只在 `VU_HOOKS` 实例里看到 `open`/`closed`**，★ **没有读到校验它的闭集定义** ⇒ 补法：`grep -n "failure" vibe-math-vmu/kernel/bus.js` 找取值校验点。
★ **未验证 ③**：★ **"非规则条目必须给 handler（`file` 不是替代品）"这句** —— ★ 我本轮**没在 `loader.js`/`bus.js` 的 grep 里读到它** ⇒ ★ **不写死** ⇒ 补法：`grep -n "no handler attached\|must have a handler\|kind:'rules'" vibe-math-vmu/kernel/bus.js`（★ 本仓此前有"`kind:'rules'` 豁免"与 `middleware/skipped … 'no handler attached'` 的读数，但我**没有在本次会话重新核到行号**）。

---

## M3 脚本契约（代码核实版）

> ★ 全部读自 `vibe-math-vmu/kernel/script-bridge.js` ＋ 入口/宿主三处。★ **一条 M3 脚本 = 一个可执行文件，用【结构化 JSON】回话。**

### 四条契约（`:9-10` 与具名拒的执行点）

| # | 契约 | 出处 |
|---|---|---|
| ① | ★ **接缝注入**；没有子进程接缝 ⇒ **`VMU_ENGINE_UNAVAILABLE`** `'no subprocess seam is bound'` | `:131` |
| ② | ★ **必须打印结构化 JSON，且至少带布尔 `ok`** ⇒ 三种情况**分别具名拒**：**没有输出**／**不是 JSON**／**JSON 但没有布尔 `ok`** | `:75` ／ `:78` ／ `:82` |
| ③ | ★ **非零退出是【结果】，不是异常** —— 由调用方的失败策略决定，**拒里带退出码** | `:9` |
| ④ | ★ **只有超时是硬失败 `VMU_JOB_TIMEOUT`**，★ **且消息如实说有没有被真的终止** | `:10` ／ `:137` 的 `{ timedOut, terminated, hadHandle }` |

### 形状（`spec` / 接缝返回 / 工厂）

| 对象 | 形状 | 出处 |
|---|---|---|
| **`spec`** | ★ `{ file, inline, args, cwd, env, timeoutMs, graceMs }` | `:146-147` |
| **接缝返回** | ★ `{ code, stdout, stderr, timedOut?, ms? }` | `:56` |
| **handle 形** | ★ `spawnHandle(spec, onHandle)` ⇒ ★ **本地预算才真的能杀子进程**（`:58` 原话 "then the local budget really terminates"） | `:58` |
| **工厂** | ★ `createScriptBridge({ spawn, spawnHandle, timer, defaultTimeoutMs = 60_000, … })` | `:61` |
| **`dryRun`** | ★ `{ ok:true, dryRun:true, ran:false, plan }` ⇒ ★ **真的不跑** | `:127` |
| **超时预算** | ★ `const timeoutMs = request.timeoutMs \|\| defaultTimeoutMs` | `:134` |

★ **`run()` 的返回是 shadow 摊平在【顶层】**：`{ ran, exit, policy, timedOut, ok, summary, findings, data }` —— ★ 这句是 Lead 的**实测结论**（17/17 全绿），★ **我没有在源码里逐字段核这 8 个键** ⇒ ★ 见「未验证 ①」。

### ★★ `config.scripts` → 实例的链路（我核到三段，第四段未核）

| 段 | 读数 | 出处 |
|---|---|---|
| ① 入口读配置 | ★ `scripts: Array.isArray(config.scripts) ? config.scripts : []` | `vibe-math-vmu.js:560` |
| ② 传给宿主适配层 | ★ `scripts: Array.isArray(scripts) ? …`（进入面解析的参数） | `host.js:283` |
| ③ 面/工具名映射 | ★ `script: 'vibe_vmu_script'`（`TOOL_NAMES` 一带） | `host.js:88` |
| ④ 脚本面的列出形状 | ★ `return { ok:true, action, scripts: scripts.map((s) => ({ id: s && s.id, file: s && s.file, timeoutMs: … })) }` | `host.js:750` |

★ **未验证 ④（Lead 点名要补的那条）**：★ **`createScriptBridge(...)` 的实例化点** —— ★ 我**没有核到**"谁把 `scripts[]` 变成 bridge 实例"这一段（★ 上面 ①→② 是**配置传递**，不是**建桥**）⇒ 补法：`grep -rn "createScriptBridge" vibe-math-vmu/` 并读该文件的构造参数。

### ★★ 写成「未验证」的条目（逐条 ＋ 补法）

1. ★ **`run()` 返回的那 8 个顶层键**：★ 来自 Lead 的**实测**，★ **我未在源码逐字段核** ⇒ `grep -n "ran:\|policy:\|findings:\|data:" vibe-math-vmu/kernel/script-bridge.js`。
2. ★ **`config.scripts` 数组里每一项的字段全表**：★ 我只核到 `id`／`file`／`timeoutMs`（`host.js:750` 的列出形状）⇒ ★ **是否还有 `args`／`env`／`cwd`／`graceMs`／`inline` 我没核** ⇒ 读 `:146-147` 的 `spec` 与 `:107` 的 `plan` 即可对齐。
3. ★ **`vibe_vmu_script` 工具面的参数形**：★ 我核到**名字映射**（`host.js:88`）与**列出动作**（`:750`），★ **没有核到它的 `parameters` 声明**（★ 参数名/必需性）⇒ `grep -n "vibe_vmu_script\|makeScriptSpec\|script" vibe-math-vmu/host.js | head -30` 并读该 spec 工厂。
4. ★ **`policy` 的取值**：★ 契约说"非零退出由**调用方的失败策略**决定"，★ **策略的取值闭集我没核** ⇒ `grep -n "policy" vibe-math-vmu/kernel/script-bridge.js`。

---

## ★ Round 84 更正：5 条「未验证」→ **已核实**（行号已核）

> ★ 上一轮我列的 8 条未验证，其中 **5 条已定论**。★ 下面**取代**前文对应条目（★ 前文保留以便对照，★ **以本节为准**）。

| # | 前文的未验证项 | ★ **已核实的答案** | 出处 |
|---|---|---|---|
| 1 | `createScriptBridge` 的实例化点 | ★★ **`kernel/index.js:1443`** `const bridge = createScriptBridge({ spawn, defaultTimeoutMs: settings['vmu.math.timeoutMs'] \|\| undefined, … })` ⇒ ★ **建桥在 `kernel/index.js`，且默认超时取自设置 `vmu.math.timeoutMs`** ✓ | `kernel/index.js:1443`（导入 `:41`） |
| 2 | `failure` 是否有第三个值 | ★★ **有三个**：`export const FAILURE = Object.freeze({ OPEN:'open', CLOSED:'closed', ABORT:'abort' })` ⇒ ★ 我先前**只看到两个，是因为那个实例只用了两个** ✓ | `kernel/bus.js:21` |
| 3 | "非规则条目必须给 handler" | ★★ **原话在** `problems.push('a non-rules bus entry needs a handler function (the bus does not load files: load a module…)')` ⇒ ★ **总线不装载文件** ✓ | `kernel/bus.js:446`（铺垫注释 `:444`） |
| 4 | `run()` 的 `exit`/`policy` 从哪来 | ★★ **`const failure = request.failure \|\| FAILURE.OPEN`（`:135`）**，失败时 `record({ what:'script-failed', label, exit, policy: failure })`（`:187`）⇒ ★ **`policy` 就是这次调用实际采用的失败策略** ✓ | `kernel/script-bridge.js:135`／`:187` |
| 5 | `vibe_vmu_script` 的调用形 | ★★ **`run: async ({ action = 'list', id, args } = {})`** ⇒ ★ **形＝`{action, id, args}`**；★ `action:'list'` ⇒ 列出 `{id, file, timeoutMs}`；★ `action:'run'` ＋ `id`；★ 其它 ⇒ `VMU_INVALID_ARGUMENT 'unknown action: …'` ✓ | `host.js:747`（`:752` 的 unknown action） |

★★ **顺带两条新核实（比原问题更深一层）**：
1. ★★ **`failure` 的取值有【闭集校验】**：`kernel/script-bridge.js:46` —— `if (request.failure !== undefined && !Object.values(FAILURE).includes(request.failure)) { … }` ⇒ ★ **只接受 `open`/`closed`/`abort`**（★ 这条同时回答了我原列的"`policy` 取值闭集"）✓
2. ★ **`bus.js:296` 还有 `DEFAULT_FAILURE`**（`Object.fromEntries(…)`）⇒ ★ **每个钩子的缺省失败策略是【分钩子】的，不是全局一个** ✓（★ 具体每个钩子取什么值 = `DEFAULT_FAILURE` 的映射，★ **我未逐项展开**）

---

## M4 插件：消费已发布服务 ＋ `alias` 约束（代码核实版）

> ★ 读自 `kernel/registry.js`／`kernel/index.js`／`vibe-math-vmu.js`。★ **M4 = 宿主插件**：它**不写 pack**，它**消费 vmu 已发布的服务**。

### ★ 发布面：vmu 真的把能力**登记成服务**

★ **`registry.register('vmu.…')` 在 `kernel/index.js` 里的登记点数**：★ **不手抄** —— ★ **以 `docs/02` 的 kernel index（由 `generate-kernel-index` 派生）为准**；形状是
`registry.register('<name>', <impl>, { apiVersion: 1, kind: 'service', description: … })`（签名见 `registry.js:74`）✓

### 注册表的**全部公开面**（★ 这就是插件能用的一切）

| 方法 | 签名 | 出处 |
|---|---|---|
| `register` | `register(name, impl, { apiVersion, kind = 'service', description = null })` | `registry.js:74` |
| `alias` | `alias(from, to, { deprecated = true, reason = 'legacy name', since = null })` | `registry.js:93` |
| `removeAlias` | `removeAlias(from)` | `registry.js:109` |
| `resolve` | `resolve(name)` ⇒ `{name, kind, apiVersion, viaAlias}` | `registry.js:117`（`:119`／`:126`） |
| `get` | `get(name, { minVersion = 0 })` | `registry.js:130` |
| `contract` | `contract()` | `registry.js:141` |
| `checkPack` | `checkPack(manifest = {})` | `registry.js:153` |
| `status` | `status()` | `registry.js:179` |

### ★★ `alias(from, to)` 的唯一硬约束：**目标必须【已发布】**

★ `registry.js:100`：`throw refuse('VMU_NO_SUCH_OBJECT', 'the alias target is not published: ' + String(to), …)` ⇒ ★ **你不能给一个还没登记的名字起别名** ⇒ ★ **顺序是：先 `register`，再 `alias`** ✓
★ `resolve` 命中别名时返回 **`viaAlias: { from, deprecated, reason }`**（`:126`）⇒ ★ **消费者能看出"我拿到的是别名"** ✓

### ★★ `checkPack(manifest)` —— 三桶，**缺了就报数字，绝不静默满足**

| 桶 | 形状 | 出处 |
|---|---|---|
| `missing` | `{ service, reason: 'not published' }` | `registry.js:162` |
| `tooOld` | `{ service, required, published }` | `registry.js:166` |
| `satisfied` | ★ 含 **`viaAlias`** 与 `apiVersion`（`:157` 初始化） | `registry.js:157` |

★ 设计意图（原话 `:151`）：★ **"Missing and too-old requirements are reported WITH the numbers, and nothing is silently satisfied"** ✓

### ★ `inject = ['tools']` —— 其余服务是**机会性消费**

★ `vibe-math-vmu.js:55`：★ **`export const inject = ['tools']`** ⇒ ★ **插件只【要求】`tools`**，其它服务**有就用、没有也不装不上** ⇒ ★ 注释的意思是**"最小部署仍能装载，而不是激活失败"** ✓
★ ⇒ ★ **要消费 vmu 服务，正确姿势是 `inject` 里只写你【必须】的，其余用注册表的 `get`/`resolve` 机会性取**（★ 取不到要**具名**处理，不能静默）。

### ★ 我这轮**仍未核**的（逐条＋补法）

1. ★ **`config.scripts` 每项的全字段** —— 目前只见 `id`／`file`／`timeoutMs`（`host.js:750` 的列出形状）⇒ ★ `args`／`env`／`cwd`／`inline` **有没有**未核 ⇒ 读 `script-bridge.js:146-147` 的 `spec` 与构造处；
2. ★ **`order` 的缺省值** —— 未核 ⇒ 读 `bus.js` 条目规范化处；
3. ★ **`vibe_vmu_script` 的 `parameters` 完整声明** —— 只核到 `run` 的**解构形**（`{action, id, args}`），★ **没有读它的 `parameters` 声明块** ⇒ 读 `host.js:747` 所在的 spec 工厂；
4. ★ **`DEFAULT_FAILURE` 的逐钩子映射**（`bus.js:296`）—— 未展开 ⇒ 读该 `Object.fromEntries` 的入参。
