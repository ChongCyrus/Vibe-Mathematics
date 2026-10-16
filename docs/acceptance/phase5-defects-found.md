# Phase 5 · **真机发现的缺陷清单**（Round 29 —— ★ 每一条都由真机运行产生，★ 带证据）

> ★ 作者＝Lead。★ 依据：8 次真机运行的 `run.log` / `jsonl` / **保留下来的 `srv.err`**（★ 仓外 `_oneoff/vm-slv/`）。

---

## ★★★ 缺陷 D1（★ **致命**）：`mathtools run` 让服务器崩溃

★ **stack trace 逐字**（★ 来自保留下来的 `srv.err`）：
```
dsh: fatal load failure: TypeError: object is not iterable (cannot read property Symbol(Symbol.iterator))
    at spawnSeam (…/vibe-math-vmu/host-spawn.js:104:29)
    at Object.run (…/vibe-math-vmu/kernel/mathtools.js:630:19)
    at Object.run (…/vibe-math-vmu/tools/mathtools.js:20:92)
    at Object.execute (…/vibe-math-vmu/host.js:966:45)
```
★ **表现**：★ 调用 `math_computation`（★ `mathtools` 的 `run`）⇒ ★ **`spawnSeam` 抛 `TypeError: object is not iterable`** ⇒ ★ **成为 `fatal load failure`，★ 服务器进程死亡** ✓
★★★ **这解释了此前两次运行的 `ECONNREFUSED`**：★ **服务器是被【这个崩溃】杀死的**，★ 而**不是**我先前猜的"残留清理误杀" ✓✓ —— ★ **我那个假设是错的** ✓
★ **修法方向**：★ `host-spawn.js:104` 的 `spawnSeam` —— ★ **某个应为可迭代（数组）的东西收到了对象**（★ 很可能是 `args`／`argv` 使用了 `...` 展开但传进来的是对象 ⇒ ★ **应显式归一化或具名拒绝，★ 绝不能让它冒泡成进程级致命错误**）✓
★ **原则**：★ **一个工具的参数错误【绝不该杀死服务器】** —— ★ 应当**具名拒绝**（★ 本仓其它面正是这么做的 ✓）

---

## ★★★ 缺陷 D2（★ **致命于流程**）：配置里声明的 pack **永远折不动**

★ **代理自己的诊断链**（★ 逐字）：
1. ★ `vmu.packs.active=["v5r"]` 来自 config，★ 但 loader 报 **`VMU_ENGINE_UNAVAILABLE: this kernel has no library root`** ⇒ ★ `appliedPacks:[]`、★ `defaultsFolded:0`、★ **49 个 v5r 键未折叠** ✓
2. ★★ **loader 自己给了机制解释**：★ *"**a pack added at runtime cannot fold its settings/defaults.json: the fold-in runs BEFORE createKernel and reads `config.packs` only, and the settings face is already built**"* ✓
3. ★ ⇒ v5r 的 `declareSlots()` 没跑 ⇒ ★ **`kernel.members = null`** ⇒ ★ **`vibe_vmu_turn` 永远 `stopped:"no-members"`** ✓
4. ★ ⇒ **没有成员能被唤醒 ⇒ 没人自主投票 ⇒ 论文阶段与 `finalize` 不可达** ✓
5. ★ 独立第二缺口：★ **`store`／`library` 均 `null`** ⇒ ★ **记录／成果库／审计零落盘** ✓
★ **代理给出的最优修法（★ 我认同）**：★ *"让 loader 对'配置声明的 pack'在 `createKernel` 之前就完成折叠（或把 `vmu.packs.active` 走 `config.packs` 同一路径）"* ✓
★★ **本轮的验证进展**：★ 已把配置从**设置键 `vmu.packs.active`** 换成**宿主键 `config.packs`**（★ 并把 `root` 也补上）⇒ ★ **但那次运行被 D1 的崩溃打断，★ 所以"宿主键是否折得动"【仍未核】** ✓

---

## ★★ 缺陷 D3：`vibe_vmu_chat` 的参数名与实现不符

★ **代理发现**：★ *"`vibe_vmu_chat` 面暴露 `from`，★ 服务要 `by`"* ⇒ ★ **面声明的参数名与服务读取的不一致** ⇒ ★ **调用方按面声明传参会失败** ✓
★ **性质**：★ **接口契约与实现漂移** —— ★ 正是本阶段一直在消的那一类 ✓

---

## ★★ 缺陷 D4：`status` 回执超过宿主上限却**拒绝裁剪**

★ **代理发现**：★ `status` 回执 **162 KB**，★ **超过 12 KB 上限**，★ 但它**拒绝裁剪**（★ 自陈 *"would require dropping content, which would change its shape"*）⇒ ★ **被宿主截断** ⇒ ★★ **而用户最需要的四段（`phase`／`quorum`／`formal`／`paper`）恰恰落在被截断的部分** ✓
★ **性质**：★ **一个"宁可完整也不肯裁剪"的诚实选择**，★ **但代价是【关键信息对使用者不可见**】 ⇒ ★★ **应提供"摘要视图"或按段请求**（★ 而不是让使用者只能去解析 spill 文件 ✓）

---

## ★ 缺陷 D5（★ 我的量具，非产品）：分类器两次误判

1. ★ **零 token 打满超时** ⇒ ★ 旧分类器报 `done` ✗（★ 已修 ✓）
2. ★★ **完全没有 `done` 行**（★ 服务器中途死掉）⇒ ★ 旧分类器报 `candidate PASS` ✗（★ 已修 ✓）
⇒ ★★ **两条都已修**：★ **缺 `done` 行、`ECONNREFUSED`、零 token、触顶、超时 —— 一律 NON-RESULT** ✓
★ **且本轮加上了【保留 `srv.err`／`srv.out`】** ⇒ ★★ **立刻换来了 D1 的完整 stack trace** ✓✓ —— ★ **"失败时保留现场"是这一轮最有价值的工具改进** ✓

---

## ★★ 一条方法论教训（★ 我自己）

★★ **我此前把两次 `ECONNREFUSED` 归因为"`job_kill` 的异步 `Cleanup-Mine` 误杀了服务器"** ⇒ ★ **错了**：★ 真正原因是 **D1 的崩溃** ✓
★ **而它能被纠正，只是因为这一轮【保留了 `srv.err`】** ⇒ ★★ **推论：★ 在断言"某现象的原因"之前，先保留能证明它的现场** ✓
