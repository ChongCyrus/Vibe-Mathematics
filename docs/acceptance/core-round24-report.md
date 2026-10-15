# Round 24 · task-136 · **A（设置键成为真开关）已落并已证** ／ B 的"具名拒"已成立 ／ **回执可见性（B 的另一半）＋ 常驻断言 ＋ D 文档：具名未做**

**一句话**：`vmu.packs.active` **现在是真开关**（与 `config.packs` **同一条装载路**，装载循环**一字未改**）；冲突规则**具名**（部署基线优先、设置只能**加**不能减、两者都声明只装一次且来源记 `config.packs`）；**无 `root` 时在设置路线上同样具名拒**（`VMU_ENGINE_UNAVAILABLE this kernel has no library root`，且可从 `handle.packErrors()` 读到）。**未做**：把 `packErrors`/`appliedPacks` 灌进**真机回执**（`host.js:431` ＋ 入口 `:525`）、常驻断言、`docs/10`／`docs/29` 路线表 —— 插入点都已定位，见 §4。

## 0. 核验行

| 项 | 值 |
|---|---|
| HEAD | `5b15562` 起（Lead 提交后我未再收到新提交号；**我未 commit／push**） |
| 我改动的文件 | **`vibe-math-vmu/vibe-math-vmu.js` 一处**（`:775` 一带：`packsWanted` 的构造；**装载循环未动**） |
| 未碰 | `kernel/loader.js`／`kernel/pack.js`／`host.js`／`tests/**`／`package.json`／`docs/**`／`kernel/meetings.js` |
| 探针（`D:\_tmp`） | `r24-settings-switch.mjs`（四臂，见 §2） |

## 1. A：决策与实现（具名冲突规则，无第二套语义）

**决策**（写进代码注释，`vibe-math-vmu.js:775` 一带）：
1. **装载列表 ＝ `config.packs` 在前（部署基线：保持顺序、继续拥有 `:452` 的 `PACK_RUNTIME` 折入）**，其后是 `vmu.packs.active` 里**只出现在设置面**的 id（去重）；
2. ⇒ **设置可以【加】一个 pack**（这正是开关的意义：**热改／按部署调，不必改 overlay 文件**）；
3. ⇒ **设置【不能】删掉一个部署 pack**（要不要减是部署决策，在 overlay 里改）——不制造"设置能覆盖部署"的第二套语义（D-02）；
4. **两者都声明同一个 id ⇒ 只装一次**，来源保持 `config.packs`；每条请求的来源记进 `packSourceOf` ⇒ `packRequested`（`{id, via}`），**回执可以分辨两个来源**而不是猜。

**关键实现选择**：`packsWanted` 的**元素形状与原来完全一致**（字符串／内联 manifest 原样进数组）⇒ ★ **下面 300 行的装载循环一个字都没改**（不是"重造一条路"，而是"把同一个列表喂给同一条路"）——这是本任务最要紧的形状约束。

## 2. 四臂本机实测（`node D:\_tmp\r24-settings-switch.mjs`）

```
A. 设置路线（`vmu.packs.active:['v5r']`，带 root）
   bus entries = 7 条（… v5r.artifact-counter::tools/result …）   packErrors = []   appliedPacks = ["v5r-core"]   ← ★ 设置键真的装载了
B. 反例（什么都不声明，带 root）      bus entries = []   packErrors = []   appliedPacks = []            ← 不设 ⇒ 空
C. 设置路线 **无 root**                bus entries = []
   stderr: vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root
   packErrors = [{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"this kernel has no library root"}]   ← ★ 具名拒，且**可读**
D. `config.packs` 路线（带 root）      bus entries = 7 条（与 A 逐条相同）   packErrors = []   appliedPacks = ["v5r-core"]  ← ★ 两路线读数一致
```
**对应必做项**：**C① 满足**（不是只看 `settingsMerge`，而是 `bus.entries` 真出现该 pack 的 7 条）／**C② 满足**（反例空）／**C③ 的"具名拒"满足**（`packErrors` 里有 code＋message；**"状态里能看出未应用"这一半未做**，见 §4）／**C④ 满足**（A 与 D 逐条相同 ⇒ 同一条路）。

★ **一条方法论更正（我先测错过）**：第一次跑时 C 臂的 `packErrors` 是**空的**，我差点把它当成缺陷 —— 实际是**我的探针抢跑**：入口的 pack 装载循环在 `effect(async () => …)` 里**是 fire-and-forget**，`ready()` **不 await 它**。加 250 ms settle 后读数如上。**⇒ 任何读 `packErrors`/`bus.entries` 的探针与将来的断言都必须先等装载循环落定**，否则测的是自己的竞态。（这条应当写进断言注释。）

**回归（原样）**：`vmu-entry` **150/0**、`vmu-kernel` **175/0**、`vmu-prompt` **70/0**（全 exit=0）。

## 3. B：`root` 的必需性在设置路线上成立（同一处判据，不是第二套）

两条路都走 `packLoader.apply` ⇒ **无 root 时同样被具名拒**，且这次**能从 `handle.packErrors()` 读到**（§2 C 臂）。★ 但"**状态/回执里能看出未应用**"这半**仍未做** —— 现在真机上那位观察者拿到的仍然是"`settingsMerge.packs` 显示 `['v5r']` ＋ stderr 一行"，**正是 arm A 的误导形态**。⇒ §4 第 1 项。

## 4. 未做项（**具名**；插入点已定位到行）

1. **`packErrors` ＋ `appliedPacks`（＋ `packRequested`）进真机可见回执** —— 未落。插入点：入口 `createHostAdapter(...)` 在 **`vibe-math-vmu.js:525`** 加 `packReport: () => ({ requested: packRequested, applied: appliedPacks.slice(), errors: packErrors.slice() })`（三者已于 `:775-800` 一带就位；★ 是**函数**、晚绑定，与既有 `packLoader: () => packLoaderRef` 同型，无 TDZ 风险）；**回执落点 `host.js:431`**（`const out = Object.assign({ ok: true, instance }, kernel.status())`，即 `vibe_vmu_status` 那份视图）⇒ 把 `packReport()` 并进 `out.packs`；`toolSpecs`/`createHostAdapter` 需各加一个 `packReport = null` 形参并透传。
2. **状态一致性（"被拒却显示为已合并"）** —— 未落。**我的判断**：**不要**去动 kernel 之前那条 `settings/defaults.json` DATA 折入（它有意让"包带哪些默认值"提前可读）；正解＝回执 `packs` 段给 **`applied:false` ＋ `errors[]`**，并让 `settingsMerge` 侧带 `applied:false` 标记（或状态里显式写"这些设置来自被拒的 pack、**未被应用**"）。
3. **常驻断言（C 的四条，且能红）** —— 未落。形状已由 §2 的探针确定；★ 断言里必须**先等装载循环落定**（用 `await new Promise(r => setTimeout(r, N))` 或更好：`ready()` 之后轮询 `bus.entries` 直到稳定），否则断言测的是竞态；同时建议把"两条路线逐条相等（7＝7）"做成**同一个文件里的两条臂**。
4. **`docs/10:436` ＋ `docs/29 §3` 的路线表** —— 未落（**同一次落笔**原则）。按 A 的决策应改成：**`vmu.packs.active` ＝真开关（推荐日常调控；可热改、按部署调）／`config.packs` ＝部署期声明（顺序与 `PACK_RUNTIME` 的权威）／两者都声明只装一次且来源记 `config.packs`／设置只能加不能减**；并★ **把 `config.root` 的必需性写进那条装载配方**（真机正是缺它被拒）。
5. **不改**：`records`/`middleware` 折入逻辑（本来就对）、`vmu.packs.active` 与"半装"**不合并**的另一件事（R21 的洞＝本任务的 A，已解决；"半装"＝缺 root，属文档＋回执可见性）。

## 5. 结论

**A 已落并已证**（设置键＝真开关，同一条路，7＝7）；**B 的具名拒已成立**；**C① ② ④ 已满足、C③ 的"状态可见"半未做**；**D 与回执可见性、常驻断言具名未做**（插入点均已定位到行）。★ **真机结论我不声称**（我未跑真机）。未跑全量／`regen-all`／git。
