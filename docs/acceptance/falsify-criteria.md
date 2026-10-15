# falsify 判据总账（A1–E5 ＋ D7）

> **这份文件是什么**：R3–R11 九轮里，`tests/_lib/falsify.mjs` 这套"变异⇒证伪"范式**被真实缺陷逼出来的判据**总账。
> 每一轮都是先踩（探针空过／变异同形／引文腐烂／前缀误删），再把教训变成机械拒绝或可复算判据；这里只收**能引用、能执行**的条目。
>
> **引用约定**：编号 **A1–E5 ＋ D7 稳定不变**，按号引用即可（例：`B3`、`C3/C4`、`D5`、`D7`）。
> **出处与命名者**（R12 落盘时标注，后被引用时请保留）：
> - **B3** —— 命名者 `vmu-activity`（R9 F1：旧门禁的子集断言之所以空过，是因为它收集的 write 回执**从未声明 `tmpDir`**，前置没走到）。
> - **C3 / C4** —— 命名者 `vmu-activity`（R10：主动删掉"环无界"那条**同形变异**；把环上限改成**差分式**判据）。
> - **D5** —— **裁定与命名者 `vmu-verify`**（R11：判"**发布**"必须用 `host.js` 的 `toolSpecs()`，不拿 `TOOL_FACES`/`resolveFaces` 当发布判据——那两处是**声明侧**）。
> - **D7** —— 命名者 `vmu-activity`，样本由 `vmu-verify` 逐行复核（R12：`installer.js` 的注释与同名键）。
> - 其余条目（A1–A5、B1/B2/B4、C1/C2/C5–C7、D1–D4/D6、E1–E5）由 `vmu-activity` 在 R3–R11 归纳。

---

## A. 库的 5 条机械拒绝（`tests/_lib/falsify.mjs`；违反即红，不留情）

- **A1 `MUTATION-NOT-APPLIED`**：`find` 必须按声明的次数出现。锚点改名／漂移时，绝不能读成"探针无法失败"（用 `occurrences` 显式声明，或用更长锚点保证唯一）。
- **A2 `MUTANT-UNIMPORTABLE`**：变异体**先导入、再探测**。语法错会被误读成"红了"——红得没有意义。
- **A3 `REAL-MODULE-NOT-GREEN`**：真模块必须在**同一探针**上绿。不绿说明**探针坏了**，不是模块坏了。
- **A4 `PROBE-DOES-NOT-DISCRIMINATE`**：两份读数必须**不同**；相同＝该变异对这个探针是 no-op。
- **A5 `UNSAFE-TMP-DIR` ／ `TEMP-NOT-CLEANED`**：副本只写 `D:\_tmp`（绝对路径、叶子必须是 `_tmp`），`finally` 删除，残留即报。

## B. 探针（读数该长什么样）

- **B1 每条绿读必须带正面控制**。库检查 `controlFields` 在真模块里非空、非假、非 0、非 `''`，否则 `CONTROL-FIELD-ABSENT`。"坏路径没有发生"对一个**根本没接线的面**永远为真 ⇒ 那是空过，不是证据。
- **B2 读数要具名**。用 code、计数或布尔；而且"破了哪一句"必须能从读数里**指出来**。反例（R11）：`disabledIsNamed:false` 与 `disabledDoesNotPublish:false` 同时出现 ⇒ 一句"禁用失效 **且** 自曝说谎"。
- **B3 前置必须在读数里可见**（★ 最可复用三条之一）。R9 的 F1（`storepolicy.write()` 的 `fired ⊄ enforced`）之所以被旧门禁漏掉：那条子集断言收集的 write 回执**从未声明 `tmpDir`**，于是"没触发"与"通过了"在读数上同形。修法是把前置本身做成字段（`writeFiresTmpDir`）——**"真的发生了"与"没有坏消息"必须可区分**。
- **B4 集合断言同带非空前置**（全仓 RULE E，基线 67）。`x.length > 0 && x.every(...)` 写在**同一行**（守卫窗口＝当前行＋前 3 行）；空集合上的 `.every()` 是空过。

## C. 变异（怎样写才诚实）

- **C1 窄变异优先**。happy 路径仍绿、只让**被证伪的那条出口**红：R11 `index.js` 拆 `finally` ⇒ 只有抛出出口泄漏；R10 `storepolicy` 的 `serialized` 只在成功回执上（冲突回执给的是等待账目）。"全都坏了"证明力弱。
- **C2 单点必须落在唯一承重行**。R8 的"一次性等待器"变异曾因 `waiters.clear()` 与 `cleanup()` **双保险**成为 no-op（库正确报 `PROBE-DOES-NOT-DISCRIMINATE`）⇒ 要么 `occurrences: 2` 同时删，要么改选唯一承重路径。
- **C3 读数必须能区分你要宣称的东西**（★）。一个在**全部公开读数上同形**的变异**不能写**：R10 我主动删掉"环无界"那条——它与"修剪但不计数"读数完全同形，写上只能靠标签宣称一个**观测不到**的结论。**能红 ≠ 值得写**。
- **C4 不知道的常量不要抄进测试**（★）。`status().notificationRing` 只是 `slice(-5)`，环的真实上限不在读数面上 ⇒ 判据改成**差分式**（发 60／80 两个实例，要求 `dropped` 差恰为 20）：既不硬编码 N，又可证伪。
- **C5 防御性构造要"点名"，不要绕开**。失败出口不可达时：把"不可达"做成**实测断言**（库必须报 `PROBE-DOES-NOT-DISCRIMINATE`）＋ pin 一句"何时它会变红"，然后**转去证伪它真正调用的那一行**。R11 实例：`mathjobs.js:587` 的 `finally` 是防御性的（`executeInner` 把内部失败**转成回执**，`:718-723`；`async:true` 再兜一层）⇒ 转证 `releaseSlot`。
- **C6 不存在就写判据，不硬造**。R11 `records`/`store` 给的是一行**可复算**证据（`finally`／`.acquire(`／`.release(`／定时器／监听器 全 0）＋一条绊线，而不是"我觉得这里没有"。
- **C7 语法陷阱：别在被变异的单行语句里插 `//` 注释**。`{ …, enforced: [...] })` 这类行末尾就是 `)`，注释会把 `)` 一起吞掉 ⇒ `MUTANT-UNIMPORTABLE`（R9/R10 各踩一次）。注释写在块外。

## D. 文档不变式（R8 立、R11 收口）

- **D1 引文可机读**：承诺要能被正则／表格解析出**具体断言**（action 集合、参数集合、`fired ⊆ enforced`、"`null` 而不是假 0"、`activityTool ⇔ vmu.activity.*`）。
- **D2 引文本身是控制字段**：探针**运行时读卷**；引文腐烂或被改软 ⇒ 控制字段消失 ⇒ `CONTROL-FIELD-ABSENT`（R9 已用"内存副本删句"自证）。
- **D3 单点承重**：这句话由**一处**实现行决定（删掉它，承诺当场假）。
- **D4 两条腿都在**：绿读给出**正面控制**（承诺成立时读到什么）＋ R 变异后**指名**哪一句破了。
- **D5 判"事实"要用对侧面**（★，裁定／命名：`vmu-verify`）：判"**发布**"用 `host.js` 的 `toolSpecs({kernel, settings})`，**不拿** `TOOL_FACES`／`resolveFaces` 当发布判据——那是**声明侧**。**"声明合规" ≠ "真的发布"**（R10 `ballots` 静默不挂的教训：声明侧看着对，发布侧没有）。
- **D6 反例要显式排除别的合法来源**：R11 把"总线无条目"做成控制字段 `busFree`，否则 D-01（**总线已有条目也算一种声明**）会污染反例，把"表外条件也能发布"误判出来。
- **D7 门禁／统计必须读"事实所在的那种文本"**（★，R12 新增）。**三个实测样本**（前两个出自 `installer.js`，第三个出自 R12 的 F15 复核——由 `vmu-verify` 指出"这是一次反转"）：
  - **注释不是条目**：全文唯一的 `tests/` 出现在 **`:59` 的注释**（`// … guard: tests/audit-math-computation-parity.mjs`）⇒ preset 条目里的 `tests/` 数＝**0**；
  - **同名键出现在另一种构造里，也不是条目**：全文 `files:` 有 **7** 处，其中 **6** 处是 preset 列表（`:60/65/70/77/85/93`），第 7 处是 **`:749` 的 `writeState(stateFile, { version, files: … })`**；
  - **★ 反转样本（判据本身被检验）**：`kernel/mathjobs.js` 只读代码是 `setTimeout` **1**（`:110`）／`clearTimeout` **2**（`:111`、`:152`），而我用 PowerShell **粗数**得到 **3** —— 第 3 个在 **`:129` 的文档注释**里（`disposer (() => clearTimeout(h))`）。**门禁（`stripComments(…, {strings:true})`）是对的、我的粗数是错的**：它证明的不是"门禁抓出代码缺陷"，而是**同一条判据在两种实现之间站住了**（一个用对了文本层、一个没用）。
  ⇒ 与 `tests/audit-enforced-consistency.test.mjs` 的 `stripComments(…, {strings:true})`（注释／字符串里的 `enforced` 不算实现）**同源**：**不是"扫到这个词就算"，而是"这个事实住在哪种文本里"**。

## E. 流程与卫生

- **E1 交接也要被证明**：R10 交门禁场景时，把**消费者**（`audit-enforced-consistency`）复制到 `_tmp` 跑通（相对 import 改绝对 URL、`HERE` 重指真目录），插块后运行；再对**内核副本**做单点变异 ⇒ 逐条"改令牌就红"。**只交文本不算交付**。
- **E2 判据要可复算**：证据用**计数与命令**（"6 个 preset 列表里 `tests/`＝0"、"263 条 preset 条目里 `tests/`＝0"），不用形容词。
- **E3 临时区只删"本次显式创建的精确路径"——前缀既不证明归属、也不证明非归属**。样本：`D:\_tmp\r11-census-probe.mjs` 是 **vmu-verify** 建的（文件头 `// R11 / task-83 A: the notAttached CENSUS`）；**仅凭 `r11-` 前缀，两种判断都可能错**。R10 我恰恰是**按 `r10-*` 通配删**的，那轮**侥幸**全是自己的文件——同一个动作换一轮就会删掉别人的探针。⇒ 归属的唯一证据是**创建时记下的精确路径**，不是模式。（与 `docs/11` 第四条"门禁必须证明自己有牙"在**人工流程**上的对应物。）
- **E4 新文件两处清单**：`package.json files[]` **必做**。`docs/11:519` 把"双登记"定义为 `package.json files` ＋ `installer.js` 的 `PRESETS.*.files`；实测：**6 个 preset 列表里 `tests/`＝0，全文唯一一处 `tests/` 是注释 `:59`** ⇒ **测试文件从来不是 preset 载荷**，第二处对测试文件不适用（要不要另立第二清单，需裁定；**不要**把测试塞进 preset）。
- **E5 何时**不该加族（`familyEligibility`）：无可移除决策点（`throw refuse(`／`return {ok:false`）／无可命名拒绝码／无 `create*` 工厂 ⇒ **不加**，并把理由写下来。

---

## 附：这套判据已经抓到的真实缺陷（可当"有牙"的证据）

| 缺陷 | 由哪条判据抓出 |
|---|---|
| `storepolicy.write()` 的 `fired ⊄ enforced`（`tmpDir` 越界） | B3（旧断言的前置从未触发）＋ 文档不变式 D1/D3 |
| 唤醒监听器阻断它所观察的写入（`activity.js`） | C1（窄变异）＋ 端到端读 `bus.emit().decisions` |
| `clamp` 声明夹紧却 arm 原值／`dispose` 声称关闭却悬挂／环丢弃不计数 | C3（读数须能区分）＋ B2（具名读数） |
| `mathjobs.js:587` 的 `finally` 是防御性的 | C5（点名＋转证它调用的行） |
| `index.js:1953` 抛出的出口泄漏 single-flight 旗标 | C1（窄变异，只有 throw 出口红） |
| `meetings.js` 两次拆分各漏登记一个模块（`meetingleave.js`／`meetingmarker.js`） | E4（membership 门禁在干活） |
