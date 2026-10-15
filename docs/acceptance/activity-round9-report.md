# Round 9 · falsify 第 8/9 族的剩余面 ＋ 把「文档不变式」推成常态

> 任务 `task-69`（owner `vmu-activity`）。**新增 13 个单点缺陷**：家族总数 11，缺陷总数 **34**（R8 为 21）。
> 交付：本轮改动 3 个文件（2 改 1 新）＋ 本报告。**未改内核、未动他人测试、未 git、未全量 sweep、未 `regen-all`**。
> **收尾更新（F1 修复后）**：`tests/vmu-doc-invariant2-falsify.test.mjs` 的 KNOWN GAP pin 已翻成**守卫**（双向读数 ＋ 回归变异），读数 **16/0**；见 §5 F1。

## 0. 读数（原样命令 → 末行）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFY: 21 passed, 0 failed ===`（8 变异，两 case） |
| `node tests/vmu-storepolicy-falsify.test.mjs` | `=== VMU STOREPOLICY FALSIFY: 16 passed, 0 failed ===`（5 变异，两 case） |
| `node tests/vmu-doc-invariant2-falsify.test.mjs` | `=== VMU DOC-INVARIANT2 FALSIFY: 16 passed, 0 failed ===`（5 变异 ＋ 1 条引文腐烂自证；F1 修复后原 KNOWN GAP pin 转成双向守卫） |
| `node tests/vmu-activity-kernel.test.mjs` / `-tool.test.mjs` | `141 passed, 0 failed` / `58 passed, 0 failed` |
| `node tests/vmu-storepolicy.test.mjs` | `11 passed, 0 failed` |
| `node tests/vmu-activity-falsify-lib.test.mjs` | `27 passed, 0 failed` |
| 其余 7 族（mailbox/chat/panel/resume/fidelity/human/tasks） | `10/8/9/9/10/12/9 passed, 0 failed` |
| `node tests/audit-declaration-criterion.test.mjs` | `75 passed, 1 failed`（唯一红＝`regen-all --check`）＋ **RULE E current=67 = baseline=67** |
| `node tests/audit-enforced-consistency.test.mjs` | `findings=0`，`355 passed, 0 failed` |
| `node tests/audit-scope-classification / tool-table / dependency-cycles / vmu-orphan-methods / gate-snapshot / doc-vs-code-tables / verbatim-claims` | `38/7/5/4/12/17/3 passed, 0 failed` |

`D:\_tmp` 内 `vmu-falsify-*` 残留 **0**；变异体自建自删（库内断言 `TEMP-NOT-CLEANED`）。

## 1. A：`storepolicy` 的剩余面（+3）

R8 只证伪了「锁释放纪律」。本轮补上**同一面的另外两条承重线**（`tests/vmu-storepolicy-falsify.test.mjs` 第二 case）：

| 缺陷（单点） | 锚点 | 变异后的读数 |
|---|---|---|
| `serializeAll` 只被**回执**声称、从不被**应用** | `storepolicy.js:153` `c.lockSerializeAll ? '*' : String(args.name \|\| 'default')` | 两个**不同名字**同时持锁（`secondCode:'allowed'`），而第二张回执仍然写 `serialized:true` |
| 声明的 `retries` 不再约束等待 | `:161` `attempts < c.lockRetries` → `+100` | `attempts:40`、`waitedMs:1000`（真值 3 / 75）——等待只受 timeout 约束 |
| 退避不再推进注入时钟 | `:163` `waited += c.lockBackoffMs` → `+= 0` | `waitedMs:0`、`attempts:3`——拒绝文案里的"当前等待"是假的 |

**控制方向**：`serializeAll=false` 时两个名字是两条独立车道（所以是"标志改变了结果"，不是"永远冲突"）；`serialized` 只出现在**成功**回执上（冲突回执给的是 `attempts/waitedMs/timeoutMs/retries`）——第一版把它读在冲突回执上，库当场报 `CONTROL-FIELD-ABSENT`，这正是控制字段该有的作用。

**关于任务 A 里的「写路径真 `finally` 释放」**：**本面无此构造**（`grep -c finally kernel/storepolicy.js` = 0）——`storepolicy` 是纯策略层，不落字节、不持有跨调用资源，`write()` 甚至不取锁。所以这一项在 `storepolicy` 上**没有可证伪对象**，如实登记为"不适用"，而不是造一个假的 `try/finally` 来凑数。真正在写路径上"忘了解锁"的形态在别的面（records/store 接缝），留给对应家族。

**顺带抓到的真实缺陷（见 §5 F1）**：`write()` 回执 `fired ⊄ enforced`。

## 2. B：`activity` 的剩余面（+5）——每条都指向 `docs/08 §26` 的一句话

`tests/vmu-activity-falsify.test.mjs` 第二 case，5 个单点缺陷，全部是「卷里写了这句话 → 实现里有一行承重」：

| 缺陷 | 锚点 | 变异后的读数 | 卷里的承诺 |
|---|---|---|---|
| 唤醒监听器**阻断它所观察的写入** | `activity.js:279` `return undefined` → `return { deny: … }` | 真实 `bus.emit('chat/sent')` 的 `decisions` 从 0 变 1（`wakeSilent:false`），而等待者仍被唤醒 | `docs/08:1563` 该 handler 返回 `undefined`（不产生任何 decision） |
| 无法作答的同伴检查**变成无名异常** | `:365` `if (!Array.isArray(peers))` → `if (false)` | `peerSeamCode` 由 `VMU_ACTIVITY_PEER_SEAM_FAILED` 变 `TypeError`（探针取 `e.code \|\| e.name`） | `docs/08:1557` 具名拒，绝不读成"没人" |
| `maxWaiters` 声明了却不设卡 | `:344` `if (p.maxWaiters > 0 && …)` → `if (false)` | `limitCode:'NO-THROW'`、`waitersAtLimit:2`（真值 `VMU_ACTIVITY_WAITER_LIMIT` / 1） | `docs/08:1543/1572` 等待者上限 |
| **构造期**键被当成**调用期**键披露 | `:357` `keys.push('noPeerShortCircuit')` → `keys.push('wakeOn')` | `constructionKeyLeaked:true`、`seamKeyNamed:false` | `docs/08:1575①` `wakeOn` 不进任何调用回执的 `enforced[]` |
| 显式超时**冒领**默认键 | `:312` `else { ms = Number(timeoutMs) }` 补一次 `keys.push('timeoutMs')` | `explicitClaimsDefaultKey:true`（省略超时那条仍为 true，两方向都在） | `docs/08:1575②` 只在调用方省略时进入 `enforced[]` |

**探针的读法是端到端的**：`docs/08:1563` 那条不靠 stub——探针用**真 `kernel/bus.js`** 装配总线、真 `emit`、真等待被唤醒，读 `decisions.length`。`wakeSilent`（真）与 `wakeStillWoke`（真）同时为控制方向：**既不阻断写入，又真的唤醒**。
**四条引文是控制字段**：探针在运行时正则读 `docs/08`（`docRuleWakeSilent` / `docRulePeerSeamNamed` / `docRuleWakeOnConstruction` / `docRuleTimeoutOmittedOnly`），引文被删或被改软 ⇒ 控制字段消失 ⇒ 库报 `CONTROL-FIELD-ABSENT`。

## 3. C：文档不变式再取 2 条（+4）

新文件 `tests/vmu-doc-invariant2-falsify.test.mjs`（家族 11，两 case）。R8 证明了这个形态能守一条承诺；本轮的问题是**它能不能撑起普通承诺**——一张工具表行、一条 D3 纪律。

**C1 · `docs/03` 工具表（3 个缺陷）**：承诺＝`docs/03:1412` 行「`vibe_vmu_wait`（2 动作）：`status｜wait`」＋ 参数列 `` `action` ``/`` `timeoutMs` ``/`` `why` ``/`` `me` ``。
探针**不背这句话，而是解析它**：按 `|` 切行、从动作格取 `` `…｜…` ``、从参数格取全部反引号标识符，然后**构建真工具面**（`tools/activity.js` 的 `makeActivitySpec`）并要求：
① 卷里列的每个 action **真的可达**（照卷调用不得回 `unknown action`）；② 卷里列的每个参数**真的被声明**；③ 卷里没列的 action **具名拒** `VMU_INVALID_ARGUMENT`。

| 缺陷 | 锚点 | 读数 |
|---|---|---|
| 卷里的 `status` 不可达 | `tools/activity.js:36` `if (action === 'status')` → `if (false)` | `allDocActionsReachable:false`（enum 仍然声明它——**只有 handler 不再应答**） |
| 卷里的参数不再声明 | `:25` `timeoutMs: param(…)` 改名 | `missingDocParams:'timeoutMs'` |
| enum 不再提供卷里列的动作 | `:24` `enum: ['wait','status']` → `['wait']` | `declaredEnumMatchesDoc:false` |

**C2 · `fired ⊆ enforced`（2 个缺陷）**：承诺＝`docs/02:294`（storepolicy 行）＋ `docs/11:466`。探针**从两个卷里读出这条纪律**（`citationPresent` 是控制字段），再要求真回执满足它，且**同时读两张回执**：`capabilities()`（变异把其中一个 `fired` 键换成从未求值的键 ⇒ `subsetOk:false`、`rogue:'vmu.store.lock'`）与 **`write()` 的 `tmpDir` 分支**（第 5 个变异＝F1 回归：把该键从 enforcement 数组拿掉 ⇒ 只有 write 回执越界，`writeRogue:'vmu.store.tmpDir'`）。两张回执都是**双向**读数：既要真的 fire，又要在 `enforced[]` 里披露。

**引文腐烂自证（`CONTROL-FIELD-ABSENT`）**：把 `docs/08:1563` 那句承诺从**内存副本**里删掉，用同一套正则重跑 → 库当场拒绝该读数（`problems` 含 `CONTROL-FIELD-ABSENT`），而另一条引文仍匹配。⇒「引文腐烂 ⇒ 红」是**测出来的**，不是对正则的信仰。

**文档不变式的 3 个准入条件（可照做）**：
1. **引文可机读**：承诺能被一段正则/表格解析**抽出具体断言**（action 集合、参数集合、`fired ⊆ enforced`、`null 而不是 0`），而不是"某处说过要严谨"；
2. **单点承重**：这句话由**一处**实现行决定（删掉它，承诺当场假）；
3. **两条腿都在**：绿读同时给出**正面控制**（承诺成立时读到什么）与**变异后变了哪一句**，且**引文本身是控制字段**。
**什么时候不该做**：引文只是叙事（"本面纪律严格"）、承诺由 N 处共同决定（变异不唯一）、或承诺描述的是**测试文件的读数行**（那要跑子进程，见 §5 F4 的处理方式：交给文档所有者改行，而不是造一个读自己输出的测试）。同样，本轮在 `storepolicy` 上**没做**任何东西去凑"finally"这条不存在的构造。

## 4. 结论：范式现在的边界

- **家族形态**已稳定：新族＝1 个 probe（含控制方向）＋ N 个单点 `find/replace`；本轮把两族从 3/2 个缺陷扩到 8/5 个，**没有增加一行管线**。
- **文档不变式**从"一条特例"变成"常规形态"：现在 3 条文档承诺（`docs/07:502`、`docs/03:1412`、`docs/02+11 fired⊆enforced`）＋ `docs/08 §26` 的 4 条规则都有可证伪守卫。
- **库的拒绝是真在工作的**：本轮它两次拦下我自己写坏的探针/变异——`CONTROL-FIELD-ABSENT`（`serialized` 读在冲突回执上）与 `MUTANT-UNIMPORTABLE`（`// MUTANT` 注释吞掉了 `)`）。**这两次都是"探针错、不是模块错"**，正是这层 plumbing 的价值。

## 5. 发现（都不是本轮写范围内的文件，交给拥有者）

**F1 · `kernel/storepolicy.js` 写回执 `fired ⊄ enforced`（真实缺陷 → **已修（task-66）**，本文件已把它变成回归守卫）**
`settings={'vmu.store.backend':'file','vmu.store.root':'D:\\vault','vmu.store.tmpDir':'D:\\vault\\tmp'}` 时 `write()` 返回
`fired=[…,'vmu.store.tmpDir']` 而 `enforced=[backend,root,fsync,autoBackup,remote,remote.url,remote.consistency,remote.offlinePolicy]` ⇒ `vmu.store.tmpDir` 越界。违反本面**自己文件头第 8 行**、`docs/02:294` 表行与 `docs/11:466` 的 D3 口径。
**为什么现有门禁没抓到**：`tests/vmu-storepolicy.test.mjs:146-155` 确实断言了 `fired ⊆ enforced`，但它收集的 `write({id:'w'})` 用的是 `sp({'vmu.store.autoBackup':true})`（`mk()` 默认只给 `root`）——**前置条件从未走到 tmpDir 那条分支**，集合断言在"没触发"的意义上过了。`vmu-verify` 独立复现后也堵了这条空过（该文件补了一条声明 `tmpDir` 的回执，现 11/0）。
**收尾（本轮完成）**：`kernel/storepolicy.js:192` 的 `write()` enforcement 数组已含 `vmu.store.tmpDir`（修好后 `rogue=[]`）。本文件不再 pin 缺陷，而是**把它翻成两条守卫**：
① 控制组新增**双向读数** `writeFiresTmpDir`／`writeSubsetOk`——该分支必须**真的 fire**（否则"没触发"的集合断言会再次空过）**且**在 `enforced[]` 里披露；
② case 2 新增第 5 个**回归变异**（把 `'vmu.store.tmpDir'` 从 enforcement 数组里拿掉）：只有 write 回执变红、`capabilities()` 回执不受影响 ⇒ 变异窄且瞄准那条分支。读数 `16 passed, 0 failed`。

**F2 · `kernel/lean.js` 新增未分类的全局定时器 ⇒ F15 门禁红（`tests/vmu-activity-timers.test.mjs` 34/2）**
未提交的 ROUND 9 改动在 `lean.js:137` 引入 `await new Promise((r) => setTimeout(r, 50))`（`waitForJob` 轮询，最多 4000 次＝200 s）。F15 的"每个碰全局定时器的文件都必须被分类"当场报 `unclassified:['kernel/lean.js']`，另一条"五个框架文件"行也随之失配。**修法二选一**：(a) 在 `VERDICT` 表加一行分类（one-shot delay：总会 fire，没有可泄漏的 disposer——但要如实写下"这是内核面里一次 50 ms 真睡眠、且绕过了注入时钟"）；(b) 让 `waitForJob` 走注入的 `timer`/`clock`。**该文件不在本轮写范围**，且改动仍在进行中，故只报告、不动手。

**F3 · `kernel/resume.js` 越过 1200 行且未登记 ⇒ `audit-code-size` 红（7/2）**
`unrecorded:['vibe-math-vmu/kernel/resume.js']`，`known:3 measured:4`。按该门禁自己的规则：要么拆，要么带理由进 backlog。

**F4 · `docs/08:1583` 读数行已腐烂（不是我的写范围）**
现文：`` | `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFICATION: 14 passed, 0 failed ===` | ``
实数：`=== VMU ACTIVITY FALSIFY: 21 passed, 0 failed ===`（R8 改写成家族形态时横幅名与条数都变了）。
建议替换为：`` | `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFY: 21 passed, 0 failed ===` | ``
（同表 `:1582` 的 141/0 与 `:1584` 的 58/0 本轮复核**仍准确**。）

## 6. 未证伪清单（下一轮按价值排序）

1. `records`/`store` 接缝的**写路径解锁纪律**（真正有 `try/finally` 的面）；
2. `activity`：`timeoutPolicy='clamp'` 的钳制、`dispose()` 关闭未决等待、通知环的**计数丢弃**；
3. `storepolicy`：`remote=on` 的四种组合（url × consistency × offlinePolicy）与 `autoBackup` 计数；
4. 文档不变式再取：`docs/03:1412` 后半句「`activityTool` 为真（`vmu.activity.*`）」↔ `host.js TOOL_FACES` 的**出现条件**可达性（表里写的出现条件必须真的能点亮/熄灭该面）。
