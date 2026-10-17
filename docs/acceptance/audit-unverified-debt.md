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
| ★ `resume.js` | ★ 9 | ★ ① `write()`／`patch()` 在**从未读过的 store** 上抛 `VMU_RESUME_WRITE_BEFORE_READ` 的**行为形**；★ ② `nextId()` ＝ `max(stored,observed)+1`；★ ③ `settleOutcome` 的拒绝；★ ④ `hydrate()` 的 `degraded` 行为 |
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
