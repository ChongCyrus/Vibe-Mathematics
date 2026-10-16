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

---

## ★★★★★ D6（★ 已修正的结论）：**具名拒的【形状】与成功回执不一致**

> ★★★ **本节先前的结论是错的，这里更正** —— ★ 我先写的是"框架的具名拒约定【假设了一个并不存在的 catch】"。
> ★★ **读码后：★ catch 存在**（★ `host.js:969-976` 的 `toHostSpec` 里就有 `try/catch` ✓），★ **而且工具 spec 自己还有一层**（★ `tools/mathtools.js:26-28` ✓）。
> ★ **更正由队友独立读码得出**（★ 它明确拒绝在错误前提上动代码，★ 并给出更可能的根因 ✓）—— ★ **这是本阶段"拒绝保护了工作"的又一次** ✓

### 6.1 ★★★★ 真正的根因：**两条分支返回【不同形状】**
★ `host.js:969-976`（★ 每个工具 spec 都经它 ✓）：
```js
execute: async (args, exec) => {
  try {
    return boundedToolResult(await spec.run(args || {}, exec))       // 成功分支
  } catch (e) {
    return JSON.stringify({ ok: false, code: …, message: …, hint: … })  // ★ 失败分支：裸 JSON.stringify
  }
}
```
★★★ **而 `kernel/receiptbounds.js:8` 逐字写着**：★ `boundedToolResult(value)` 是 **"the ONE place a tool result is serialized"** ✓
★★★ **且它【总是】附加 `receiptMeta`** —— ★ `:106-109` 逐字解释为什么**连"什么都没裁"时也要附加**：
> ★ *"`receiptMeta` is present EVEN WHEN NOTHING WAS CUT. Returning early here (as the previous version did) made **the key set depend on the payload size** - the very defect the contract removes"* ✓
⇒ ★★★★ **于是：★ 成功回执【必然】带 `receiptMeta`，★ 而【具名拒必然不带】** ⇒ ★★ **同一 `execute` 的两条分支交付【不同物种】的回执** ✓✓
⇒ ★★★ **这解释了真机现象**：★ 守卫**正确地**具名拒了（★ `code`／`message`／`hint` 俱全 ✓）、★ **而进程仍然死了** —— ★★ **因为那条拒绝【内容对、形状错】** ✓✓
★ 也解释了"改 D1 只是把一种崩溃换成另一种"：★ **任何走失败分支的具名拒都踩同一个形状问题** ✓

### 6.2 ★★★ 修法（★ 已落地）：★ 失败分支走【同一个序列化器】
★ `host.js` 的 `catch` 改为 **`return boundedToolResult({ ok: false, code, message, hint })`** ✓
★★ **内容不变**（★ 同样的 `code`／`message`／`hint` 到达调用方 ✓），★ **只是形状与成功回执一致** ✓

### 6.3 ★★★ 验证（★ 三条，★ 其中第 ③ 条是能抓住 D6 的那条）
★ 结构探针：★ **成功分支与失败分支都用 `boundedToolResult`** ✓；★ **失败分支不再用裸 `JSON.stringify`** ✓
★ 导入并**真的跑两条分支**（★ 在真适配器 `toHostSpec` 上 ✓）：
```
failure carries receiptMeta : true   ← ★ 被破坏的那条不变量，现已恢复
success carries receiptMeta : true
BOTH branches agree on the SPECIES: true
内容不变：ok:false / code:VMU_INVALID_ARGUMENT / hint 俱全
```
★★ **判据（★ 比 D1 当时强）**：★ ① `ok:false` ＋ 具名码；★ ② **进程仍活着**；★③ **回执【类型与形状】与成功路径相同** ⇒ ★ **第 ③ 条才是能抓住 D6 的那条**（★ 前两条都抓不到 ✓）
★ **套件**：★ `vmu-kernel` **183/0**／★ `vmu-turn` **148/0**／★ `vmu-recruit` **50/0**／★ `vmu-pack` **53/0**／★ `vmu-mathtools` **208/0** ✓

### 6.4 ★ 另一条**顺带发现**：★ 代理口中的"宿主 12 KB 上限"其实是**本框架自己的上限**
★ `MAX_TOOL_RESULT_BYTES = 12000` 定义在 ★ `kernel/receiptbounds.js` ⇒ ★★ **"12 KB"不是宿主的限制，★ 是本框架 `receiptbounds` 的限制** ✓ —— ★ 这**不影响 D4 的结论**（★ 摘要确实超过它 ✓），★ 但**归属要说对** ✓

## （★ 以下为本节先前的错误结论，★ 保留以示更正）

## ★★★★★ D6（★ 先前的结论 —— **已被上面的读码更正**）：**具名拒绝对工具面来说【仍然是服务器致命的】**

### 6.1 ★★★ 证据（★ 来自保留下来的 `srv.err`，Round 35）
```
at spawnSeam (…/vibe-math-vmu/host-spawn.js:118:13)
  at Object.run (…/kernel/mathtools.js:630:19)
  at Object.run (…/tools/mathtools.js:20:92)
  at Object.execute (…/host.js:971:45)
  at ToolRuntime.dispatchToolBody (…/@deepseek-ai/dsh-tools/lib/index.js:3310:32)
  hint: pass args as an array (e.g. args: ["--version"]); a malformed call is refused instead of killing the host
  code: VMU_INVALID_ARGUMENT
```
★ **运行读数**：★ `exit=1 dur=0s tokens=-1`（★ 服务器死了，★ 一轮都没跑完）✓

### 6.2 ★★★★ 结论：**D1 的修法【不够**，而真正的缺陷更深**
★ **D1 的守卫【正确地】具名拒了**（★ `VMU_INVALID_ARGUMENT` ＋ 现成的 hint ✓）—— ★★ **但进程仍然死了** ✓
⇒ ★★★★ **即：★ 在工具处理器里 `throw refuse(...)`，★ 宿主【并不会】把它变成 `{ok:false, code, message, hint}` 回执** ⇒ ★★ **它会一路冒泡成 `fatal load failure`，把服务器杀掉** ✓✓
⇒ ★★★★★ **而这意味着：★ 框架里【每一条具名拒绝对工具面来说都可能杀死服务器**】** —— ★ **框架的"具名拒"约定【假设了一个在工具边界上并不存在的 catch】** ✓✓✓
★ **这一条比 D1 深**：★ D1 是"某处忘了校验"，★ **D6 是"校验之后仍然致命"** ✓ —— ★ 所以**修 D1 只是把"崩溃"变成"另一种崩溃"** ✓

### 6.3 ★ 修法（★ 应该只有一处）
★ **在工具调度边界把 `refuse()` 转成回执**：★ 即 `tools/*.js` 的 `run` 包裹层（★ 例如 `tools/mathtools.js:20` 那一层）**或** `host.js` 的 `execute`（★ `:971`）**catch** 住"本框架自己的拒绝错误"（★ 用 `code` 以 `VMU_` 开头、或一个 `refuse` 标记判别 ✓），★ **并返回 `{ok:false, code, message, hint, …}`** ✓
★ **注意**：★ **真正的意外错误不应被静默吞掉** ⇒ ★ 只吞**本框架具名拒**，★ 其余仍要冒泡（★ 否则又是"静默吞错"那一族 ✓）
★ **判据**：★ **一个"参数非数组"的调用 ⇒ 得到 `ok:false` ＋ `VMU_INVALID_ARGUMENT`，★ 且【进程仍然活着、★ 后续调用仍可用】** ✓ —— ★ **这正是 D1 的反例测试【本该断言而没断言】的那一半**（★ 当时只断言了"得到具名拒"，★ 没断言"进程活着" ✓）✓

---

## ★★★★★ D7（★ 调用方缺陷）：**`--stdin` 被当成了【可执行文件】本身**

### 7.1 ★★★ 证据（★ 来自本轮 `srv.err`，★ 而且拒绝【信息很丰富】）
```
code:   VMU_ENGINE_UNAVAILABLE
hint:   the host resolves executables against its scrubbed PATH; an unresolvable command is a named failure
hostStack: SubprocessExecutableNotFoundError: subprocess-local: command "--stdin" was not found on PATH
shape:  { phase: "resolveExecutable", argv0: "--stdin", argvLen: 1 }
cause:  SubprocessExecutableNotFoundError: command "--stdin" was not found on PATH
```
★★★ **注意：★ 这条拒绝带的上下文【非常完整**】** —— ★ `code`／`hint`／★ **`hostStack`**／★ **`shape`**／★ **`cause`** ✓ —— ★★ **正是框架"富拒绝"机制应有的样子** ✓✓

### 7.2 ★★★ 根因：**调用方把 `--stdin` 传成了 `argv[0]`**
★ `host-spawn.js:112` **`if (typeof request.file === "string" && request.file.length > 0) argv.push(request.file)`** ⇒ ★ **`file` 成为 `argv[0]`** ✓
★ `:121` **`for (const a of argList) argv.push(String(a))`** ⇒ ★ **`args` 依次跟在后面** ✓
⇒ ★★★ **而 `argv0` 实测是 `"--stdin"`** ⇒ ★★ **即调用方给了 `args: ["--stdin", …]` 而【没有给 `file`】** ⇒ ★ **于是 `--stdin` 变成了"要执行的那个程序"** ✓✓
★ **这是【调用方】的缺陷**（★ 很可能是某个引擎/python 适配器拼 argv 时把标志放在了最前 ✓），★ **而框架的拒绝是【正确且信息充分】的** ✓

### 7.3 ★★★★ 但**服务器仍然死了** —— ★ 所以 D6 的修法【不是**全部**
★ 读数：★ **`exit=1 dur=0s tokens=-1`**（★ 又是服务器中途死掉 ✓）；★ **`srv.out` 只有 83 B**（★ 仅启动的 token 行 ⇒ 之后无输出 ✓）
⇒ ★★ **而本轮已经修了 D6**（★ 失败分支与成功分支同形状 ✓）⇒ ★★★ **说明【还有一条独立的死亡路径】** ✓✓

### 7.4 ★★ 下一步的两个候选（★ 按可能性排序）
1. ★★★ **`err.cause = e` 的可序列化性**：★ `host-spawn.js:137-139` 设了 `err.hostStack`／`err.shape`／**`err.cause = e`**（★ `e` 是宿主抛的 `SubprocessExecutableNotFoundError` ✓）⇒ ★★ **若 `boundedToolResult` 对该对象做 `JSON.stringify`，★ 而 `cause` 链里有循环或不可序列化的东西，★ 就可能【在序列化时抛】** ✓ —— ★ **那一抛发生在 `boundedToolResult` 内部，★ 也就是【catch 之外**】，★ 于是没人接** ⇒ ★★ **致命** ✓✓✓
   ★ **判据**：★ **直接对这样一条拒绝做 `boundedToolResult`，★ 看它是否抛** ✓
2. ★★ **调用方缺陷 D7 本身**：★ 修好 argv 组装（★ 让真正的可执行文件回到 `argv[0]` ✓），★ **这样这条拒绝根本不会发生** ✓
⇒ ★★★ **建议先做 1**（★ 它是**通用**的死亡路径：★ 任何富拒绝都可能踩 ✓），★ **再做 2**（★ 它是**这一条**的具体成因 ✓）✓
