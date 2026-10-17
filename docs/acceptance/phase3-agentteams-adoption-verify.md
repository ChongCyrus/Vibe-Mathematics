# Phase 3 · **A2／C2 采纳前核实**（agent-teams 官方包 · 先核后建）
> ★★★ **ROUND 89 — 本文件的 `file:line` 已【重锚定一次】**：原引用是在 `kernel/prompt/index.js` **761 行**时测的，
> 该文件现 **750 行**，★ **四处引用已漂移**（指向不再是那段代码的行）。★ 每处修正都**同时给出一个【不漂移的锚】**
> （函数名／唯一串），★ 所以下次它是 **grep**，不是重新测量。★ 原作者的文字与判定**未改动** ✓

> 作者＝`vmu-verify2`。★ **本任务不建任何东西**，只出判定。★ 只写本文件；未改任何代码；未跑 git／T1／全量门禁。
> ★ 绑版本：`vibe-math-vmu/kernel/prompt/index.js`（下文所有 `:NNN` 均指它，除注明者）；`vibe-math-vmu.js`；`kernel/pack.js`；`kernel/index.js`；`packs/v5r/prompts/v5r-charter.js`。
> ★ 待核来源：`docs/acceptance/phase3-agentteams-official.md` §① A2（`:75`）与 §③ C2（`:91`）。

---

## 一、A2 —— **per-scope 的 prompt 段注册**：vmu 今天已支持吗？

### (a) 今天有哪些 scope 维（file:line）
| 机制 | file:line | 逐字/行为 |
|---|---|---|
| **绑定（binding）的四维** | `kernel/prompt/index.js:275-278`（★ 锚：`const dims = ['role'` ＋ `exactly one dimension`） | `const dims = ['role','phase','member','task'].filter(...)`；`if (dims.length !== 1) throw refuse('VMU_INVALID_ARGUMENT', 'a binding must name exactly one dimension', 'one of: role < phase < member < task')` ⇒ ★ **恰一个**维度 |
| **匹配优先级** | `:381-391` | `if (b.task…) dim='task' else if (b.member…) dim='member' else if (b.phase…) dim='phase' else if (b.role…) dim='role'` ⇒ 优先级 **task > member > phase > role** |
| **段自身可带 scope** | `:377` ＋ `:413-421`（★ 锚：`scope: section.scope` ＋ 函数名 `scopeMatches`） | `scope: section.scope || null`；`scopeMatches(scope, ctx)`：`const want = scope[dim]` … `:377 return hit('member', ctx.member) && hit('role', ctx.role) && hit('phase', ctx.phase) && hit('task', ctx.task)` ⇒ ★ **不只是绑定，段本身也能被 scope 限定** |
| 内置段的 scope 形状 | `:496` | `{ name:'state', order:0, range:'facts', scope:null, mutable:false }` |

### (b) "只给这个 agent／成员"今天表达得了吗
★ **"只给这个【成员/角色/阶段/任务】" —— 能，今天就能**（两条路：**段级 `scope`** 与**按维度的 binding**）。
★ **"只给这个【DSH agent】"** —— **不能**：vmu 的四维里**没有 `agent`**；`member` 是**所内成员**（一个会话内的编制身份），不是宿主层的 agent 身份。

### (c) 能 ⇒ 表达它的声明（两个真实形态 ＋ 一处已落地的例子）
```js
// 形态 1：段自带 scope（只给 member 'acad' 这个段）
{ name: 'v5r-charter-division', order: 701, range: 'pack', scope: { member: 'acad' }, text: '…' }

// 形态 2：member 维的 binding（只覆盖这个成员的文本）
{ section: 'v5r-founding-direction', member: 'acad', text: '给你的起点方向：…' }
```
- ★ **已落地的例子（非我构造）**：`packs/v5r/prompts/v5r-charter.js` 的 **`CHARTER_MEMBER_BINDINGS`**（每成员一条，`{section, member, text}`）⇒ 装配入口 `createPromptPipeline({ sections, bindings })`（`tests/vmu-prompt-type-coverage.test.mjs:259` 这样调用）。
- ★ **有常驻断言证明"逐成员隔离"真的生效**：`tests/vmu-prompt-type-coverage.test.mjs:257-274` —— 为**每个**成员各装一轮，断言"**每个成员只收到自己的方向、收不到别人的**"（`if (!mine.includes(b.text)) wrong.push(…)` ＋ `for (const o of …) if (o.member !== b.member && mine.includes(o.text)) wrong.push(…)`）✓
- ★ **绑定指向不存在的段是具名缺陷、不是静默忽略**：`:359-362`（"A binding that names an unknown section is a configuration defect, not a no-op"）⇒ 这条纪律已经在位 ✓

### (d) 不能 ⇒ 缺什么、是小接缝还是设计改动
★ 只缺 **`agent` 这一个维度**，且它比看起来小：
- ★ **能力面（内核）**：把 `'agent'` 加进 `:275` 的维集合、并在 `:421` 的 `hit(...)` 链上加一项（★ 锚：`const dims`／`const hit = (dim`），即可让"段/绑定只给这个 agent"与今天四维同构 ⇒ ★ **这是【小接缝（named seam）】，不是设计改动**；
- ★ **但落地时有一个必须点明的差别**：官方的注册点是**宿主/预设层**（`tool-agent-team/lib/index.js:237-238` 在 Agent scope 里注册 `team:policy`），而 vmu 的 `createPromptPipeline` 是**每次装配时在入口里构造**的，且**入口今天把【整包提示词】并成一个 `vmu` 段**交给宿主（`vibe-math-vmu.js` 的 `systemPrompt.section({name:'vmu', …})`，见 phase-2 R17/R19 的读数）⇒ ★ **"按 agent 分别注册"在 vmu 里更自然的落点是【入口/host 适配层】，而不是 pack 的段表**；
- ⇒ ★ **若 Lead 的意图是"段只给某个所内成员" ⇒ 今天就够（无需采纳）；若意图是"段只给某个 DSH agent" ⇒ 需要那个小接缝（且落点在入口/host 层）** ✓

**★ 一行建议 — A2：`ALREADY HAVE IT`（对 member/role/phase/task 而言）**；★ 仅当要的是 **DSH-agent 维**时才升级为 `NEEDS A NAMED SEAM`（加 `agent` 维 ＋ 落点在入口/host 注册处）。

---

## 二、C2 —— **"替换既有面"是部署声明，还是隐式"后者赢"？**

### 2.1 overlay／preset 在哪应用（file:line）
| 环节 | file:line | 行为 |
|---|---|---|
| 入口读 `config.packs` 并**在 `createKernel` 之前**折叠 pack | `vibe-math-vmu.js:239`／`:284`／`:293`／`:326`／`:352`／`:480` | `config.packs` 是唯一输入；★ `:304` 具名说明"**运行时加入的 pack 无法折叠它的 settings/defaults.json**（折叠发生在 `createKernel` 之前）" |
| 一个实现：`usePack()` 走同一个 loader | `vibe-math-vmu.js:534` | "ONE pack implementation" |
| loader 的校验/应用 | `kernel/pack.js:180-184`／`:423-424` | 段名冲突与重复应用**都具名拒**（见下） |

### 2.2 pack 今天能声明什么
★ `packs/v5r/index.js:62-67` 的 `V5R_PACK`：`{ id, sectionModule, phases, policyModule, noticeModule, … }`（`kernel/pack.js` 的 `validatePack` 形状）＋ settings 默认值（`V5R_SETTING_DEFAULTS`）。
★★ **没有任何"替换/撤下"字段**：我在 `vibe-math-vmu/packs/**/*.js` 里 grep `replaces|replace:|disable|withdraw|override|removes` ⇒ **0 命中** ✓（即：pack 今天**说不了**"我替换那个面"）。

### 2.3 两个 pack 会不会**静默争抢**同一个面？—— ★★ 分两层回答
**(i) pack ↔ pack：不会**，三层都有具名拒（这就是本仓已有的"冲突必须显式声明"纪律）：
- 段层（loader）：`kernel/pack.js:183` `throw refuse('VMU_PACK_CONFLICT', 'two packs declare the same prompt section: ' + s.name, 'conflicts are declared explicitly (docs/10 …)')`；
- 段层（管线）：`kernel/prompt/index.js:350-352`（★ 锚：`two pack sections claim the same name`） `if (existing.range === 'pack' && range === 'pack') throw refuse('VMU_MIDDLEWARE_FAILED', 'two pack sections claim the same name: ' + name, 'pack conflicts are declared explicitly, never resolved silently (docs/10 §4)')`；
- 设置层：`kernel/index.js:1900` `throw refuse('VMU_PACK_CONFLICT', 'pack setting ' + key + ' would overwrite an active value', …)`；＋ 重复应用同一 pack：`kernel/pack.js:424` `'pack … is already applied'` ✓

**(ii) pack ↔ **可变的【内核/框架】段**：★ 会，而且是【静默】的 —— ★★ **这是我本轮具名的发现**：
- `register()` 的守卫只覆盖两种情况：`:345` **只挡** `state`／`existing.mutable === false`（不可变段），`:350` **只挡** pack↔pack（★ 锚：`two pack sections claim the same name`） ⇒ ★ **一个 pack 段去注册一个同名的、可变的、非 pack 段（框架段）时，两条守卫都不命中**；
- 随后 `:390` **`registry.set(keyOf(name, langOf(entry)), entry)`** ⇒ ★ **直接覆盖，后者赢**，**没有**具名拒、**没有**"我说了要替换谁"的声明、**也没有**回执点名"被顶掉的是哪一个" ⇒ ★ **替换在这里是隐式的** ✓
- ★ 附一条**已存在的半接缝**（说明缺口不大）：`disable(name)`／`enable(name)`／`isDisabled(name)` 在 `:291`／`:299` **已经存在**（★ 锚：`const disable`／`const isDisabled`）；且 `vmu.prompts.overrides` 这条**部署侧**声明路径已存在（`:401-404` 的 `overrideMerge = { declared, fromCaller }`，回执里带计数）⇒ ★ **缺的只是"把 disable/replace 变成 pack 可声明的一个具名字段，并在回执里点名被替换者"** ✓

**★ 一行建议 — C2：`NEEDS A NAMED SEAM`**（小）：在 pack manifest 增加**具名声明**（如 `replaces: ['<section-name>']`／`disables: [...]`）⇒ loader 应用时**先 `disable()` 再注册**，并在回执里**点名被替换的面**；★ **不要**改成"禁止覆盖"（会与 `vmu.prompts.overrides` 的部署覆盖语义冲突）；★ 同时**保留**现有的 pack↔pack 具名拒 ✓。

★ 附：官方那半边的证据我也读了同一形状（patch 头部注释 *"keep direct delegation and coordination on the Team tools"* ＋ 禁 4 行插入 3 行，见官方包 `cordis.patch.yml`）⇒ ★ 与 vmu 的差别**不在"要不要声明"，而在"vmu 的声明面还没有这个字段"** ✓

---

## 三、没核（★ 与"核了"分开）
1. ★ **没有追踪"某一轮真装配里 pack 段是否真的覆盖过框架段"**：我只核了**代码路径**（`:345/:350/:390`）与 **pack 里 0 个替换声明**；★ **没有**构造"pack 覆盖可变框架段"的实机副本去观测它生效（★ 那是"能不能"的问题，本任务只判口径）。
2. ★ **没有核 `ORDER_RANGES`／`range` 词表的全部分区语义**（我只读到 `:24`（`ORDER_RANGES` 常量）／`:317`／`:330`／`:350` 与 `range:'facts'|'pack'` 的用法）⇒ ★ 是否存在**第三个 range 值**会改变上述结论，**未穷举**。
3. ★ **没有核官方包 `tool-agent-team` 的"Agent scope"到底是什么宿主对象**（我只据你 §① `:75` 的行文与你给的 `lib/index.js:237-238`）⇒ ★ "agent 维是否＝我们理解的 agent" 这一层**未核**。
4. ★ **没有核 `vmu.prompts.overrides` 的完整语义**（只读到 `:401-404` 的计数与注释（★ 锚：`overrideMerge =`））⇒ ★ 它能否已覆盖 C2 的一部分（文本覆盖 vs 面替换）**未穷举**。
5. ★ 本任务**未改任何代码**；★ 未跑 git；★ 未跑 T1／全量门禁。

