# 未验证债务台账 · **宣称级验证之下仍【未验证】的具体宣称**（Round 107）

> ★ **为什么还要单独一篇**：★ `audit-coverage-debt.md` 记的是**按文件**的审查级别；★ 而 **L3（宣称级验证）并不等于"这个模块的宣称都验过了"** ——
> ★ 实测每个模块**只验了它头部宣称的一部分**（★ 多的 25 条、★ 少的 5 条），★ **而剩下的那些【没验】必须具名**，
> ★ 否则"某模块 L3"会读成"某模块没问题" —— ★ **那正是本仓最拒绝的一句话**。
>
> ★ **口径**：★ 下面每一条都是**队友在交付里自己写的"未验证"**，★ **不是我的推测**。★ 每条都写清**为什么没验**（★ 缺工作接缝／★ 需要真装配／★ 需要构造审计行／★ 尚未读到签名）。

## 1. ★★★ 按模块（★ 前缀＝已验注记数；★ 后面＝未验项）

| ★ 模块 | ★ 已验 | ★ **未验证的具体宣称** |
|---|---|---|
| ★ `records.js` | ★ 10 | ★ `enforced[]`／`fired[]` 回执的**行为形**；★ 按码计数；★ **读路径不变更** |
| ★ `resume.js` | ★ 9 ＋ **1（R109）** | ★ ① 的**行为形【已验】**（R109：★ 具名拒 `VMU_RESUME_WRITE_BEFORE_READ` ✓）；★ **②③④ 仍未验，★ 且原因已查明**：★ `nextId` **只写内存 `counters`（`:465`）**，★ 而持久化读的是 **`own.counters`（`:404`）** ⇒ ★ **"计数持久"靠【flush／exit 路径】落盘，★ 不是每次 `nextId`** ⇒ ★ **要验它必须驱动 flush，★ 并要一个 fold 布局与 `kernel/store.js` 一致的 store** —— ★ **属"需要真装配"类**；★ ③ 的 `settleOutcome` **没有 `interrupted` 参数**（★ 中断状态来自面的自身记录）⇒ ★ **需先跑一次 recover／restart 循环**；★ ④ `hydrate({keys})` ★ **需先 `read()`** |
| ★ `mathjobs.js` | ★ 25 | ★ ①②③ 超时／非零／部分输出；★ ④ 回执完备性；★ ⑤ 种子要求；★ ⑥ 计数截断；★ ⑩ 镜像写点；★ ⑪ **`recover()` 四分支**；★ ⑬ `admission()` 标志 |
| ★ `ballot.js` | ★ 15 | ★ `createBallot` 的 **frozen ⇒ 拒票不入计**（s8 回归那条）；★ 资格拒；★ **重复投**；★ 决定值非 1/0 拒；★ 未知 kind 拒；★ **middleware 返回无 reason 的 undecided ⇒ `VMU_MIDDLEWARE_FAILED`**；★ `createDurableCommitLog` 的 `VMU_COMMIT_STORE_FAILED`；★ snapshot／restore 一致性 |
| ★ `meetings.js` | ★ 6 | ★★ **大头**：★ **状态机**（convene／floor／minutes）；★ **29 个 `VMU_*` 码**（含已知的 `VMU_NO_OPEN_MEETING`；★ `VMU_MEETING_CONFIDENTIAL_DENIED`／`TIER_CONFLICT`／`LIGHT_NO_TRUTH`／`SPEECH_TIMEBOUND`）；★ 两条成员寻址 journal 事件；★ receipt 词表 |
| ★ `chat.js` | ★ 6 | ★ **悬空 `replyTo` ⇒ `VMU_CHAT_ANCHOR_DANGLING`**；★ mute／quota／admin 的**具名**强制；★ **绝对时刻拒**（`...At`／`until`／`expires*`）；★ quote 上限；★ history 环形上限；★ `WIRED/PLANNED_CHAT_KEYS` 完整性 |
| ★ `workflow.js` | ★ 20 | ★ retry／补偿／escalation-due／handover-note／arbitration-on／`idempotencyScope` 的**行为面**；★ "jitter 由内容哈希导出" |
| ★ `library.js` | ★ 14 | ★ **"指纹写盘后【读回】而非重算"**；★ `headListAt`／`truncateMode`／`fingerprintPolicy` 三设置的效果；★ **revision 家族**（`commitRevision`／`revision`／`revisions`／`removeRevision`）行为 |
| ★ `funding.js` | ★ 12 | ★ `reimburse`／`settle`／`auditPack` 行为面；★ 成本分摊 `balanced`／`cap`；★ FX 陈旧拒；★ `allocate` 余数回加 |
| ★ `mathadapters.js` | ★ 18 | ★★ **该模块最重的宣称**：★ **`isRefutation` 在每次返回上硬编码 false**（★ **需要工作接缝才能跑到**）；★ 6 种 `kind` 的**各自归一化**；★ `VMU_MATH_SHAPE_UNKNOWN`；★ `VMU_MATH_LIB_UNAVAILABLE` ＋ install `next`；★ 会话级解释器绑定**每次回执自报**；★ 截断 `dropped` 计数；★ `ELEMENT_KINDS`／`RESULT_ENVELOPE`／`probeBody`；★ 三条必填拒 |
| ★ `ip.js` | ★ 6 | ★★ **只验了词表不变量**；★ **`createIp` 的全部服务行为**（★ **16 个 `VMU_IP_*`**：★ 披露／所有权／许可／转移／保密／prior-art／贡献证据／冲突）；★ `hold`／`transfer` 语义 |
| ★ `mathtools.js` | ★ 9 | ★ `WIRED_KEYS` 的**内容正确性**（★ 它**是否真读**这些键）；★ 回执／快照面；★ `spawn` seam 形状 `{op,args,seed,backend,limits}` 的完整校验；★ **19 个码的行为**；★ 资源预算／超时路径；★ **`run` 的全部 op 词表** |
| ★ `pack.js` | ★ 15 | ★★ **`apply`／`unload` 的"无残留"**（★ 原话：★ **"UNLOAD LEAVES NO RESIDUE … asserted by comparing snapshots"**）；★ **"冲突被拒、绝不合并（O4）"的三种冲突面**；★ `packedBytes`／`rawBytes` 的**不谎报节省**回退路径；★ `collectPackSections`／`composePromptPolicies` 语义；★ `prompts` 块校验；★ **`loader.status()`**（★ 内部走 `settingsNow()`／`settingSource`／`snapshotPacked` ⇒ ★ **假 kernel 撑不起来，需真装配**） |
| ★ `replay.js` | ★ 17 | ★ ② 的**具体缺口类型**（★ seq 洞／缺前件／坏行／ts 逆序／窗口截断 —— ★ 需构造 audit 行）；★ ③ `strict` 的具名拒与 `unknownKinds` **计数**；★ ④ **零副作用**（★ 用 proxied fake service 断言"从不调写方法"）；★ `apply()` 的 `initial` 克隆分支；★ `canonicalize`／`kindOf` 的逐类编码 |
| ★ `alerts.js` | ★ 18 | ★ `escalate`／`acknowledge`／`inhibit`／`flush`／`guardChange` 行为面；★ **"LAYERING … 通知指纹（watcher × event × object）"整条**（★ 本轮只测到 ALERT 侧）；★ **SLO 冻结分支**（★ "预算耗尽 ⇒ 冻结非必要变更（H2）；★ H0/H1 救火除外且必须留痕"）；★ `vmu.alerts.channels` 与处置 |

## 2. ★★★★ 从这份账里能读出的三件事

1. ★★ **"L3"粒度是【模块】，★ 而覆盖率是【宣称】** —— ★ 例如 `mathadapters` 验了 18 条，★ 而它**最重的**那条（★ `isRefutation` 每次返回硬编码 false）**恰恰没验**（★ 需要工作接缝）✓
2. ★★★ **未验证的原因可以分类，而分类决定代价**：
   - ★ **需要工作接缝**（★ `mathadapters` 的 `isRefutation`、★ `mathtools` 的 spawn 形状、★ `mathjobs` 的超时）⇒ ★ **要有可注入的假引擎** ✓
   - ★ **需要真装配**（★ `pack.loader.status()`）⇒ ★ **假 kernel 撑不起来** ✓
   - ★ **需要构造输入**（★ `replay` 的审计行、★ `alerts` 的第二条阈值）⇒ ★ **便宜，★ 下一批就能补** ✓
   - ★ **需要读到签名**（★ `resume` 的面方法）⇒ ★ **最便宜** ✓
3. ★★ **最便宜的那两类应当优先补**（★ 构造输入 ＋ 读到签名），★ **因为它们能把"未验证"变成"已验证"而不需要新接缝** ✓

## 3. ★★ 这份账【不含】的部分
★ **未列出的模块不是"无债务"** —— ★ **而是它们连 L3 都还没到**（★ 见 `audit-coverage-debt.md` §3 的 68 个 L1 文件）⇒ ★ **那些文件的债务是"整份未验"，★ 不在这里逐条列** ✓
★ **真机侧的债务**（★ 每个面只测了 1–2 个动作）★ 见 `audit-coverage-ledger.md` §11 ✓

## 4. ★★★★★ ROUND 107 补记：第六批（★ 两路）＋ ★ **一条被【证伪】的缺陷报告**

### 4.1 ★★★ 第六批：**75 条断言**
| ★ 路 | ★ 模块 | ★ 断言 |
|---|---|---|
| ★ G | ★ `meeting` 15 · `charter` 8 · `conference` 8 | ★ **31** |
| ★ H | ★ `paper` 16 · `ballotbox` 13 · `migration` 15 | ★ **44** |
★ **累计：26 个模块、312 条断言**（★ 八个探针）⇒ ★★ **L3 达 26/103 文件** ✓

### 4.2 ★★★★★★ 而 G 路报告了一条"真缺陷" —— ★ **我复现后【证伪】了它**
★ **它的报告**：★ `conference.js:75-78` 的工厂契约拒绝**没有 `enforcedScope`**，★ 与头注 `:2-3`（★ *"a refusal reports `evaluated-so-far`"*）矛盾，★ 而策略类拒绝有（★ `:140` 包装）✓
★ **我的复现（直接测）**：★ **该拒绝【确实带】** `enforcedScope:"evaluated-so-far"` 且 `enforced:[]` ✓
★ **回到源码**：★ `conference.js:76-78` **明文** `throw Object.assign(refuse('VMU_INVALID_ARGUMENT', …), { enforced: [], enforcedScope: ENFORCED_SCOPE })` ✓
★ **红在哪**：★ 探针自己的 `norm()` 助手**只序列化了 `code` 与 `message`**，★ 然后断言这段 JSON 里含 `evaluated-so-far` ⇒ ★ **红的是【探针的手工 JSON】，★ 不是模块** ✓
⇒ ★★★★ **结论**：★ **我没有去改正确的代码**；★ 断言改为**读拒绝对象的属性**（★ 改正后 **31/31**，★ 反过来证明模块本就正确）✓✓
⇒ ★★★★★ **教训（已写进探针头）**：★ **"红"是关于代码的【假设】，★ 不是【发现】 —— ★ 仪器和被测对象一样可能错**✓

### 4.3 ★★★★ 而 H 路留下一处【跨面约定不普遍】的诚实观察（★ 我实测并重构了它）
★ **它的观察**：★ paper 的 `enforced[]` 不一致 ⇒ ★ **我逐点量了**：★ `paper.js` **36 个拒绝点**中，★ **约 12 个**在源码文本上带 `enforced`，★ **而【没有一个】在调用点带 `enforcedScope`**（★ 说明有**包装器**统一补 scope，★ 与 conference 的 `deny` 同族）✓
★ **因此**：★ **paper 头部只承诺"拒绝声明其【求值作用域】" ⇒ 该承诺成立**；★ **不普遍的是 `enforced[]`，★ 而 paper 从未承诺它** ✓
★ **裁定**：★ **不是缺陷**；★ **而"为让一个约定普遍化去改写二十余个拒绝点"会为偏好改变行为** ⇒ ★ **具名记录**（★ 探针头 ＋ 本篇）★ **并与 `UNWIRED_REASONS` 那处同类处理** ✓

### 4.4 ★★★ 两路各自自报的错误（★ 合计 18 处，★ 全部是它们自己的）
★ **G 路 8 处**，★ 其中**三处是测量错**：★ 完成判定返回**对象**不是布尔／★ **`inputs`·`silent` 是【MAP】，★ 传数组等于【什么都没记上】**（★ *"差点把假通过当成验证"*）／★ **零机制下测章程必被更早的 `NOT_AUTHORIZED` 先答** ✓
★ **H 路 10 处**，★ 其中**三处是测量错**：★ **用【相等的】两个计数去证明"分开计数"**（★ *"等值时什么都证明不了"*）／★ **在从未发生拒绝的实例上读 `refusals`**／★ **把"每条拒绝都带 `enforced[]`"当成 paper 的宣称**（★ 而 paper 只承诺 **scope**）⇒ ★★ **原话**：★ *"不把【我加的标准】当成模块的承诺"* ✓✓

## 5. ★★★★★★ ROUND 108 补记：第七批 I 路 ＋ ★ 一条**自我撤回**

### 5.1 ★★★ 第七批 I 路：**29 条断言**
| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `auditchain.js` | ★ 10 | ★ **前向哈希链从 `GENESIS` 起**／★ **四类失败名**（改行／删行／乱序／插入）／★ **`hash` 是注入接缝：★ 无它则每次 append／verify 都【具名拒】且绝不产出一个看起来像哈希的东西**（`VMU_AUDIT_CHAIN_NO_HASHER`）／★ 无接缝时 `status().keyed === false` |
| ★ `bidding.js` | ★ 8 | ★ **关闭规则【事先声明】**（`lowest-cost`／`best-score`／`random`）／★ **判据公开且【可复算】**／★ **"重复投标必须可见"**（`normalizePlan` 确定性且对顺序敏感）／★ **零机制：`vmu.allocation.enabled` 默认 FALSE ⇒ 什么都发不出去，而 `list()`／`status()` 仍答，★ 每次尝试都是具名拒、绝不崩** |
| ★ `tasks.js` | ★ 11 | ★ **阶段机的【每条边】两端都是已声明状态**（★ 无悬空边）／★ **依赖在"开始"时检查**（`VMU_TASK_DEPENDENCY_CYCLE` 不是标签；★ **无环也不误报** ⇒ 双向都证）／★ `scopesOverlap` 同域重叠、异域不重叠（★ 双向）|
★ **累计：29 个模块、341 条断言**，★ **L3 达 29/103 文件** ✓

### 5.2 ★★★★★★ 而 I 路**主动撤回**了它上一轮那条缺陷
★ **它的原话**：★ 用**保留整个拒绝对象**的助手重测 ⇒ `createConference({clock:'not-a-function'})` **threw=true**，且 `refusal.enforcedScope === "evaluated-so-far"` ✓
★ **根因（它自己找的）**：★ **它的 `norm()` 把自己拼的 `{code,message}` 序列化出来当证据，★ 把抛出的 Error 上的 `hint`／`enforced`／`enforcedScope` 全丢了** ⇒ ★ **"模块是对的，我的缺陷报告是假的"** ✓
★ **它的修法**：★ `norm()` 改为**保留整个 raw 对象/错误**，★ 且**断言一律读对象自身的属性** ✓
⇒ ★★★★ **这与我在 Round 107 的独立复现【结论一致】—— ★ 两方独立确认 `conference.js` 无缺陷** ✓✓

### 5.3 ★★★★ 而 I 路一条**不肯当缺陷报**的观察（★ 这才是最该学的）
★ **观察**：★ 用 stub hasher 连续两次 `append`，★ 回执**都**是 `{prevHash:"GENESIS", hash:"h46"}` ⇒ ★ 链头**看起来没前进** ✓
★ **它没有排除的三种可能**：★ ① stub 把两行映成同一摘要而 `prevHash` 恰同；★ ② `append` 期望的**行形状/字段**与我传的不同；★ ③ 链头**内部跟踪**，★ 回执的 `prevHash` 表示别的意思 ✓
★ **它的处理**：★ *"我未读 ⇒ 归入未验证，★ **不作缺陷结论**"* ✓✓
⇒ ★★★ **"一个无法解释的红是一个【问题】，★ 不是一个【发现】"** ✓

### 5.4 ★★★★★ 我自己的 `resume` 探针：★ **1 条验证、3 条【未能验证】—— ★ 因果是我的假 store**
★ **已验**：★ **① "写（或 patch）在【读成功】之前被【具名拒】 `VMU_RESUME_WRITE_BEFORE_READ`"** ✓
★ **未验 ②③④**，★ 而**原因是同一个假 store 需要【四种形状】**：
★ `read`（★ `requireStore` 要）→ ★ `patch`（★ 也要）→ ★ **`export()`**（★ 折页其实是从 `:390` 的 `store.export()` 读的）→ ★★ **而 `patch` 是【两参·函数式】：`store.patch(String(key), () => payload)`（`:439`）** ⇒ ★ **我的单参对象合并版【什么都没存下去】** ⇒ ★ **"新面在同一 store 上从 `t-1` 重来"看起来像缺陷，★ 实为仪器** ✓
⇒ ★★★ **这已是同一个假 store 的第 4 次形状发现** —— ★ **与"验证宣称"这把尺的代价直接相关：★ 尺本身要先造对** ✓
★ **副产品（正面的）**：★ 它的拒绝 hint 极好 —— ★ *"refusing to treat an unreadable fold as an empty one"*／★ *"an unread snapshot must never be overwritten (the v5r V5_STATE_NOT_LOADED rule)"*／★ *"a recovery that cannot read a fold would be a claim, not a recovery"* ⇒ ★ **这些就是"不许静默假装"的样板措辞** ✓
★ **因此 ②③④ 仍留在未验证账上**（★ 不是"通过"）✓

## 6. ★★★★★★ ROUND 108 补记：第七批 J 路 —— **51 条断言**

| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `human.js` | ★ 19 | ★ **13 个具名码**／★ **"私有域永不展示"**（★ `dashboard({domains:['private']})` 具名拒）／★ **审批闸【抛出】具名拒且带 `detail.queued=true`**，★ **而被包的动作【确实没跑】**（★ 方法体执行 0 次）／★ **不存在的方法名被【报告】而非静默跳过**／★ **过期审批的默认是 `hold` 而非 `default-allow`** ⇒ ★ **推进一天后仍 `pending`**／★ **veto 作用域【超出申报界】** ⇒ 具名拒 |
| ★ `external.js` | ★ 15 | ★ **PIPELINE 五步顺序且冻结**／★ **缓存过期三种显式策略**／★ **27 个声明键【真的被读】**／★ **缓存命中【零网络调用】**（★ 且第一次【真的】调到了缝）／★ **`enabled` 关闭 ⇒ 具名拒且缝【从不被调用】**／★ **`allowNetwork=false` 时缓存未命中 ⇒ 拒而不是出网**／★ **超上限【逐出最旧并计数】** |
| ★ `meetingmarker.js` | ★ 17 | ★ **面标签 ⇒ 域标签派生**（★ `open\|lapsed\|closed`）／★ **"休会或暂停的会议仍是【未结束】会议"**／★ **唯一的 state 写入者**（同写三字段）／★ **接缝读到【空】＝空机构，★ 绝不是"因为什么都没读到所以还在开"**／★ **读不了的接缝是【已登记拒绝】`VMU_MEETINGS_MARKER_UNREADABLE`，★ 绝不猜**／★ **`randomOrderOf` 是确定性排列** |
★ **累计：32 个模块、392 条断言**（★ 十个探针）⇒ ★ **L3 达 32/103 文件** ✓

### 6.1 ★★★★★ 而 J 路最该学的一处：★ **宣称挂错了面**
★ 它一度要报缺陷：★ `observerView({scope:'private'})` 返回 `visible:true`，★ **而头注说私有域永不展示** ✓
★ **纠正者**：★ `grep PRIVATE_DOMAINS` ⇒ ★ **该规则实现在 `human.js:422`（`dashboard` 路径）**；★ `observerView` 答的是**另一个问题**（★ 已声明观察者作用域能看什么）✓
★ **改到该面后立即变绿** ⇒ ★★★ **"一个模块可以完全正确，★ 却仍然【没通过】一条从来就不属于它的断言"** ✓✓

### 6.2 ★★★★ 而它**删掉了自己草稿里的 `ok(true)`**
★ 那个占位符**正是本仓明令禁止**的构造 ⇒ ★ **自查时删掉并改写为真断言**（★ "超时后仍 pending"）✓
★ **另有两处编辑事故**（★ 删掉一个声明／两行并成一行）★ **由 `node --check` 与运行读数当场抓出**，★ **无半截状态** ✓
⇒ ★★★ **"仪器自检"在实践中就该长这样** ✓

### 6.3 ★★★ 四处测量错（★ 与前三批同族）
★ **常量时钟看不见审批窗口过期**／★ **async 的 `fetchOne` 被同步 attempt 包住 ⇒ 把 rejection 读成"没有 code"**／★ **`vmu.external.enabled` 未声明时整面禁用 ⇒ 三条断言被 `VMU_EXTERNAL_DISABLED` 遮住**／★ **`seamCalls === after1` 两侧都可能为 0 ⇒ 对"缓存命中"什么都没证明**（★ 已补 `> 0` 守卫）✓


## 7. ★★★★★ ROUND 109：把 `resume` 那 3 条**查清到底**（★ 而结论是【仍需真装配】）

★ **我按契约重建了假 store**（★ 这已是同一个 store 的第 4–6 次形状发现）：
★ `requireStore` 要 **`read` ＋ `patch`**（`:379`）→ ★ 折页其实从 **`export()`** 读（`:390`）→ ★★ **而 `patch` 是【两参·函数式】：`store.patch(String(key), () => payload)`（`:439`）** ⇒ ★ **我原先的单参合并版【什么都没存下去】**，★ **这才是"新面从 `t-1` 重来"看起来像缺陷的原因** ✓
★ **并纠正了调用形**：★ `settleOutcome({id,outcome,explicit,reason})` —— ★ **没有 `interrupted` 参数**；★ `hydrate({keys})` —— ★ **不是 `{key,mode}`**，★ **且它要求先 `read()`** ✓

### 7.1 ★★★★★ 而最后一查给出了【定论】
★ `nextId` **只写内存 `counters` Map**（`:465`：`counters.set(k, n)`），★ **并不落盘**；★ 而持久化侧的读点是 **`own.counters`（`:404`）** ⇒ ★★ **"计数持久（`resume.counters`）"是靠【flush／exit 路径】写下去的，★ 不是每次 `nextId`** ✓
⇒ ★★★★ **因此 **② 的期望本身错了**：★ 一个【没有 flush 过】的新面当然从 `t-1` 起** —— ★ **这不是缺陷，★ 是设计要求** ✓
⇒ ★★★★ **要真正验 ②③④，必须：** ★（a）驱动 **flush／exit** 路径；★（b）用一个 **fold 布局与 `kernel/store.js` 一致**的 store；★（c）跑一次 **recover／restart** 循环来产生一个中断的 id ✓
⇒ ★★★ **这三样都不是"便宜"** ⇒ ★ **它们归入债务台账既有的"需要真装配"类**，★ **并【保持未验证】—— ★ 不计作通过** ✓✓

### 7.2 ★★★ 副产品（★ 正面的，值得留）
★ 它的拒绝措辞是**本仓"不许静默假装"的样板**：★ *"refusing to treat an unreadable fold as an empty one"*／★ *"an unread snapshot must never be overwritten (the v5r V5_STATE_NOT_LOADED rule)"*／★ *"a recovery that cannot read a fold would be a claim, not a recovery"* ✓
★ **且它的三条不变式在【测试这个动作本身上】成立**：★ **读之前不许写**（★ ①已验）、★ **读之前不许分配 id**（★ `nextId` 也走 `requireRead`）、★ **读不了的折页不当作空的**（★ 我三次撞到这条具名拒）✓
