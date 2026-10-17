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

## 2. ★★★★ 两种中间件：M1 声明式 与 M2 代码模块

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

### 2.3 ★★ 钩子名必须是真的
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
