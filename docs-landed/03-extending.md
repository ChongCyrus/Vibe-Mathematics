# 03 · **扩展：怎样造一个你自己的机构**

> ★ **这一卷是框架的【兑现处】**。★ 前两卷说它"能换"，★ 这一卷说**怎么换**。
> ★ 目标：★ 读完你应当能写出一个 pack，★ **不改内核一行**，★ 就跑出**另一种机构**。

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

★ **这是最容易误解的一处，所以先给总表**（★ 权威：`docs/05-middleware.md`，499 行）：
| ★ 形态 | ★ 载体 | ★ 必需字段 | ★ 自由度 | ★ 干什么 |
|---|---|---|---|---|
| ★ **M1 规则（声明式）** | ★ 总线条目 `kind:'rules'` | ★ `id`／`kind`／`on`（**无需 handler**） | ★ 低 | ★ 选钩子/顺序/作用域/失败策略/能力声明 |
| ★★ **M2 代码模块（函数式）** | ★ 总线条目 `kind:'module'` | ★ ＋**必须 `handler` 函数** | ★★ **高（任意逻辑）** | ★ **同进程真代码** |
| ★★ **M3 脚本／工作流（子进程桥）** | ★★ **不在总线上** | ★ `file`／`inline`（进程协议） | ★ 中（受协议限制） | ★ **跑真脚本**：`kernel/script-bridge.js` ＋ `vibe_vmu_script`（★ `config.scripts` 声明） |
| ★★ **M4 外部插件／mod** | ★★ **不在总线上** | ★ 宿主插件清单 | ★ 组合级 | ★ **新服务、新工具、新提示词段** |
⇒ ★ **所以"能不能写程序"的答案是：★ 能，★ 而且有四层** —— ★ **M2 写同进程函数，★ M3 起子进程跑外部程序，★ M4 做完整插件** ✓
★★ **但有一处精度，写错会被拒**：★ **`kind:'script'`／`kind:'plugin'` 在【总线】上会被具名拒**（★ `VMU_MIDDLEWARE_KIND_UNSUPPORTED`，★ hint 说明该去哪）—— ★ **因为总线只跑 M1/M2，★ 脚本与插件【各有自己的载体】** ✓
★ **M3 与 M4 的完整用法**：★ **`docs/19-plugin-and-extension-development.md`**（377 行，★ "当 settings ＋ 中间件不够用时"）＋ ★ `docs/05-middleware.md §2` ✓

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
★ **完整走法**：★ `docs/19-plugin-and-extension-development.md`（★ 377 行）✓
★ **★ 先问自己**：★ **"这件事能用 M1 声明吗？"** ⇒ ★ 能就别写代码；★ **"能用 M2 写个模块吗？"** ⇒ 能就别做插件 ✓
（★ 这是本仓的红线四：★ **没有消费者就不给机制** —— ★ 反过来，★ **能用轻的形态就别上重的**）

### 2.5 ★★ 钩子名必须是真的
★ **教训（实测）**：★ 曾把 `on: 'turn.assemble'` 写成以为的钩子名 ⇒ ★ **真预设里它是【惰性】的，★ 而测试全绿** ✓
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
| ★★ **`vibe-math-vmu/settings/`** | ★★ **【声明】＝代码** | ★ `schema.js`（★ 1732 行，★ 头注自述 *"the SINGLE SOURCE of every tunable"*）＋ `planned.js` | ★★★ **绝不能删** —— ★ **它被引用约 140 处，★ 删了 vmu【起不来】**；★ **`docs/04-settings.md`（1232 键手册）就是由它生成** |
| ★★ **`packs/<id>/settings/`** | ★★ **【取值】＝数据** | ★ `defaults.json`（＋同值的 `defaults.js` 代码视图） | ★ 可以删/改 —— ★ 删了只是**回到"零机制默认"**（★ **零机制是安全的一侧**）|
★ **为什么必须分开**：★ **"能设什么"与"这个机构设成什么"如果写在一处，★ 同一个键就会有两个作者 —— ★ 而两个作者就是下一次漂移的起点** ✓
★ **读未声明的键【是缺陷，不是默认值】**：★ `assertDeclared` 抛、`readSetting` 具名拒 ✓
★ **权威**：★ `docs/04-settings.md`（1232 键逐键手册，**生成**）／★ `docs/10-packs.md`（★ pack 手册，★ `:30` 有那个目录的直接说明）✓
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
   ★ **正面样板**：★ v5r 的"停滞后开会"用 **`3 × idleAfterMs` 的比率**，★ **而不是写死原来的 360000** ✓
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
