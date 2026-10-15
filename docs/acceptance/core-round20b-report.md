# Round 20b · task-127 · `host.js` 两条已修（①②）＋ ③**具名**（在 `pack.js`，不在我写范围）＋ ④ R19 探针形状已修并复跑

**一句话**：①（`unload` 白要一个它不用的 `manifest`）与 ②（`:677` 说明与实现相反）**已修并各有双向断言**（新套件 14/0）；③（pack 的 `plan` 路径**完全不跑校验器**）我按 `vmu-verify2` 的要求在**两条路径**上把 `apply` 侧读实了，**但修点 `kernel/pack.js` 不在我写范围**（且 `pack2` 有它在飞改动）⇒ **具名转出**；④ 我 R19 探针的 3 处形状错误已修，**修正后与 `pack2` 的修正版都为 7/0**，那条链不再"红着躺在证据里"。

- 纪律：结构性编辑**一次替换内原子完成**（unload 分支上移＝同一处替换里的删＋插）＋编辑后立刻核内容；每步跑**加载内核**的套件；`kernel/meetings.js` 未碰；未跑全量（T0/T1 归 Lead）／未 `regen-all`／未 git；临时文件仅 `D:\_tmp`；新文件已双登记。

---

## 0. 核验行：我读的是哪一版 / 哪一次运行

| 项 | 值 |
|---|---|
| HEAD | `df207bd`（未 commit／未 push） |
| 我改动的文件 | `vibe-math-vmu/host.js`（`8A9EC072DBFD6CF7`，**+11/−5**，共 1007 行）、`package.json`（**我加 1 行**）、**新增** `tests/vmu-pack-tool-actions.test.mjs`（`39C42750AA95019D`，99 行） |
| 复现／取证脚本（`D:\_tmp`） | `vmu-r20b-host-pack-probe.mjs`（修前修后各跑一次）、`vmu-r20b-apply-side.mjs`（③ 两路径读数）、`vmu-r19-policy-path.mjs`（④ 已修）、`vmu-r20-inline-chain2.mjs`（`pack2` 的修正版） |
| 同轮他人在写（**不是我**） | `kernel/pack.js`、`vibe-math-vmu.js`、`kernel/lean.js`＋`kernel/mathjobs.js`（我 R20 的，已复核）、`vibe-math-vmu/docs/{02,05,18,21}`、`tests/vmu-pack-inline-manifest.test.mjs`、`tests/vmu-resume-token-contract.test.mjs` |

---

## 1. ① `unload` 白要一个多余的 `manifest` —— 已修（顺序问题，非判断问题）

**修前复现**（`node D:\_tmp\vmu-r20b-host-pack-probe.mjs`，真 adapter ＋ 真 loader）：
```
{action:unload, id:"ghost"}   → {"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"plan/apply need an inline manifest …"}
same + a valid manifest       → {"ok":false,"code":"VMU_NO_SUCH_OBJECT","message":"pack ghost is not applied"}
loader.unload("ghost") directly → {threw:true, code:"VMU_NO_SUCH_OBJECT"}     ← 直连本就正常
```
⇒ **缺 manifest 即拒的守卫（旧 `:693-696`）排在 unload 分支（旧 `:699-702`）之前**，而那条拒绝的**文案还只提 plan/apply** —— 判断本身是对的，**顺序是缺陷**。

**修法（`host.js:685-694`，一处替换内原子完成上移）**：把 `unload` 分支移到 manifest 解析与守卫**之前**，其余一字不动（`plan`/`apply` 仍必须先有内联 manifest）。`loader.unload` 的具名拒（坏 id）经原有 catch 原样透出。
**修后**：`:677` 的说明同步改成事实（见 §2）；`host.js` 净增 6 行（含 8 行注释）。

**双向断言**（`tests/vmu-pack-tool-actions.test.mjs`，采纳 Lead 给的三条）：
- **U1**：`apply` 一个良构 manifest ⇒ 再 `{action:'unload', id}` **不带 manifest** ⇒ **`ok:true` 且 `residueFree:true`**；
- **U3/U4**：坏 id ⇒ **具名拒 `VMU_NO_SUCH_OBJECT`**，且**不再是**旧缺陷的签名 `VMU_INVALID_ARGUMENT: plan/apply need an inline manifest`（★ 这条就是"顺序回退即红"的那条）；
- **U5**：`{action:'unload'}` 无 id ⇒ `VMU_INVALID_ARGUMENT: unload needs id`（它自己真正的**必须**条件仍在）；
- **U6/U7**：**反方向**——`{action:'plan'}`／`{action:'apply'}` 无 manifest **仍被具名拒** ⇒ 上移的是分支，**没有把守卫删掉**。

---

## 2. ② `:677` 的说明与实现相反 —— 已改成事实（二选一，选了"改说明"）

**修前**：说明写"`id` …（plan/apply 时按 `./packs/<id>.js` 解析）"，而实测 `{action:'plan', id:'v5r'}` ⇒ `VMU_INVALID_ARGUMENT: plan/apply need an inline manifest`（`id` 对 plan/apply 无效）。同一份 schema 的 hint（旧 `:695`）其实**已经写着事实**——schema 自相矛盾。

**为什么选"改说明"而不是"让 `id` 生效"**：让 `host.js` 按 `./packs/<id>.js` 解析，等于在**第二条路径**上重造 `vibe-math-vmu.js` 的装载语义（D-02 明令"一个动词不许两套语义"），而 `config.packs` 已经是随包装载的**唯一**路径。⇒ 说明改成事实，与 `docs/18-§2.6` 的口径一致。

**改后文本**：`unload 必填（unload 不需要 manifest）；plan/apply 用 manifest（内联 JSON 文本）——随包整合包（./packs/<id>/index.js）由 profile 行的 config.packs 装载，本工具不按 id 解析`
**双向断言**：**D1** 声明文本不再含"plan/apply 时按"；**D2** 声明含 `unload`＋`manifest`；**D3** 行为与之一致（`{action:'plan', id:'v5r'}` 具名拒且点名内联 manifest）。★ 三条都用**序列化后的声明**做判据（不挑属性路径，避免读到 `undefined` 让断言空转）。

---

## 3. ③ pack 的 `plan` 路径**完全不跑校验器**（两半都漏）—— **不在我写范围 ⇒ 具名转出**

**取证（两方各自独立）**
- `vmu-verify2`（直连 loader，两个 manifest，各带 `kernel.rules.validate` 对照）：**缺 `when`** 与 **`when.subject` 点名不存在的具名谓词**，`kernel.rules.validate(rule)` 都报问题，而 **`loader.plan(manifest).problems` 都是 `[]`**；
- 我补的**两路径对照**（★ **修前读数**：task-127 当时、③ 尚未修；`node D:\_tmp\vmu-r20b-apply-side.mjs`，用**合法** `then` 动作以排除混淆）：
```
§1 DIRECT loader        A 缺 when ：validate=["when is required …"]  plan.problems=[]  apply→threw VMU_MIDDLEWARE_FAILED
                        B 未知谓词：validate=["when.subject: unknown named predicate: no-such-predicate …"] plan.problems=[] apply→threw VMU_MIDDLEWARE_FAILED
§2 REAL ENTRY (config.packs)  A/B：entry.apply 不抛，appliedPacks=[]，宿主 stderr：
                        vmu: pack r20b-a was not applied: VMU_MIDDLEWARE_FAILED invalid M1 rule r-a: when is required …
                        vmu: pack r20b-b was not applied: VMU_MIDDLEWARE_FAILED invalid M1 rule r-b: when.subject: unknown named predicate …
```
⇒ **`apply` 侧在两路径都拒**（直连**抛**、真入口**吞成 stderr 行＋`appliedPacks:[]`**），**`plan` 侧两路径都报"没问题"**。★ 这回答了 verify2 的问：他们说"直连 apply 成功了"，差异来自**他们那次探针的形状**（两个 manifest 共用 middleware id ⇒ 撞 `duplicate middleware id`），**不是**他们证伪了 apply 侧 —— 我换了合法 `then` 动作、每个 manifest 独立 id 后，两路径一致。

**★★ 版本限定：上面那一格**修后**已变（`vmu-pack2`／task-128 已按本报告 §3.1 落地）——**我独立复跑**（同一脚本、同一树）得：
```
§1 DIRECT loader   A 缺 when ：kernel.rules.validate=["when is required …"]
                              loader.plan(manifest).problems=["rule r-a: when is required …"]     ← 不再是 []
                              loader.apply → THREW {"code":"VMU_PACK_MISSING","message":"pack r20b-a cannot be applied: rule r-a: when is required …"}
                   B 未知谓词：loader.plan.problems=["rule r-b: when.subject: unknown named predicate: no-such-predicate …"]
                              loader.apply → THREW VMU_PACK_MISSING（同类消息）
§2 REAL ENTRY      A/B：entry.apply 不抛、appliedPacks=[]，宿主 stderr：
                   vmu: pack r20b-a was not applied: VMU_PACK_MISSING pack r20b-a cannot be applied: rule r-a: when is required …
                   vmu: pack r20b-b was not applied: VMU_PACK_MISSING pack r20b-b cannot be applied: rule r-b: when.subject: unknown named predicate …
```
⇒ **`apply` 的码从 `VMU_MIDDLEWARE_FAILED` 变成 `VMU_PACK_MISSING`**（`apply()` 先问 `buildPlan`，缺 `when` 的规则包**在到达 `kernel/loader` 之前**就被拒）；**`plan` 也从 `problems=[]` 变成具名** —— 即 **plan 与 apply 现在连码都一致**（`vmu-pack2` 把这条做成显式断言 `F3b`）。★ **引用时必须连路径与码一起引**：本报告 `§3` 的 `VMU_MIDDLEWARE_FAILED` 是**修前**读数，**不宜当作现状**（与 §4 对 `ERR_INVALID_ARG_TYPE` 的同一条纪律）。

**★ 仍未覆盖的一半（`vmu-pack2` 具名，我复核读数并转出，留给 Lead 裁）**：`plan` **仍看不见 middleware MODULE 的问题** ——
```
plan(module whose hook is not a function) → ok:true, problems=[]      （看不见）
apply(same)                               → VMU_MIDDLEWARE_FAILED: invalid M2 module m1: hook tools/result must be a function
```
⇒ **"它报出每一个问题"在可预期范围内做不到**，这就是 `vmu-pack2` 把 `pack.js:388` 的 hint **改成事实**（现在写 "the manifest problems it can **SEE**"）而不是"报全"的实测理由，我**同意该取舍**：要把这半也提前到 plan，就得让 `buildPlan` 去跑 `kernel/loader` 的模块校验 ⇒ **plan 会因此依赖 loader**，那是**另一个设计问题**，不该塞进 task-128。⇒ 我把它记为**具名边界**（不是遗漏），**未擅自扩范围**。

**★ Lead 裁决（R20 收尾，已按此把两行写进 `docs/18 §2.6` 与本报告）**：**接受现状，不把 `loader` 拉进 `buildPlan`**。理由三条：① hint 已与事实一致 ⇒"声明比实现宽"这个**真缺陷**已修掉（task-128 要的正是这个）；② 为把一个**在 apply 时本来就会具名拒**的问题提前几百毫秒，而让"预览"依赖"装载器"＝**引入新耦合、收益极小**，且 loader 的校验若**实例化/装载**就会打破"`plan` 无副作用"；③ 三方（我／`vmu-pack2`／`vmu-verify2`）读码结论一致：**校验器本身是对的，缺的是 pack 没调它** —— 那一半已修。
- **具名**：`plan` 覆盖 **manifest 结构 ＋ M1 规则（结构 ＋ 具名谓词）**；**不覆盖 M2 模块体**（`hook … must be a function` 这类仍**只在 `apply` 具名拒**，码 `VMU_MIDDLEWARE_FAILED`）。
- **改判条件**：若将来 `kernel/loader` 暴露出一个**不实例化的纯 `validateModule(manifest)`**（只做形状/函数性检查、**无副作用**），`plan` 才可以调它 —— **那时**才把这半提前。`pack2` 的 `pack.js:388` hint 保持"能看见的"。（`docs/18` 不在 task-127 的写范围清单内，**此行按 Lead 的明确指令写入**，并已当场核内容。）

**修点（verify2 已背书，`pack.js` 属主请据此改）**：★ 结构性证据（verify2 全文扫过 + 我复核）：**`kernel/pack.js` 全文没有任何一处调用 `rules.validate` / `validateRule`** ⇒ `plan()` 的 `problems` 是**结构性**缺这两半，不是漏了一个字段检查；而 `kernel/rules.js:245-250` 的注释原文说这同一不对称**"曾经只活在 `toBusEntries` 里，于是 `validate()` 说 fine"** ⇒ **它在 rules 层已修过一次，pack 层仍绕开它**。★ 我的"**`pack.js` 一个字没碰**"已由 verify2 用 diff 钉死归属：`pack.js` 与 HEAD 差 8 行，**新增 9 行全是 `vmu-pack2`/task-125 的注释**（含 `// ROUND 20 (task-125): \`kind\` IS OPTIONAL AND DEFAULTS TO \`module\`…`），**HEAD 侧只少 1 行**（`const entries = await kernel.loader.toBusEntries([m])`，被它的 `kind` 归一化取代）⇒ **该文件的改动 100% 属 task-125**。
1. **在 `plan`／`buildPlan`**（那里 `kernel` 在手）对每条 `manifest.rules` 调 **`kernel.rules.validate(rule)`** —— 它已经把"结构校验 ＋ 具名谓词扫描"合成一次调用（`kernel/rules.js:245-250` 的注释显示**同一个不对称在 rules 层修过一次**："used to live only inside `toBusEntries`, so `validate()` said fine"，**pack 层仍绕开它**）。⇒ `plan.problems` 才会与 `apply` 对称。
2. ★ **别塞进 `validatePack(manifest)`**：它是**纯函数、拿不到 kernel**（我读码确认：`pack.js:102` 的签名只有 `manifest`）。
3. **同源的代码内声明**：`kernel/pack.js:388` 的 hint 写着 "run plan() first: it reports **every** problem without changing anything" ⇒ **它现在承诺了 `plan()` 做不到的事**（与 `host.js:677` 同类，第十三条）⇒ **hint 改成事实，或让它真的报全（二选一）**。

**为什么我不在 `host.js` 里代做**：那样会造出**第二个判定点**（工具面自己再编一次 regel 校验），而 `apply` 拒的理由可能还有该面不知道的其他项 —— D-02/rules 层那次修复的教训正是"同一判据的第二个消费者没跟上"。**我留了一份可直接贴的守卫**（等 `pack.js` 修好后放进本套件即可）：
★ **`vmu-pack2` 复核后一处更正（已采纳，谢谢）**：我原来那段里写的是 `on: ['tool/result']`（**单数**），而**注册的钩子是 `tools/result`** —— 用单数会多出一条"未注册钩子"的 problem，`/when is required/` **仍能匹配** ⇒ ★ **断言会通过，但通过的理由不纯**（这正是本仓最怕的形状）。片段已改用 `tools/result`：
```js
// ROUND 20b / task-127 §3 — the guard for ③, now LANDED by task-128 (vmu-pack2). Hook name matters: the
// registered hook is `tools/result` (plural); a singular `tool/result` would add an "unregistered hook" problem
// and let this assertion pass FOR THE WRONG REASON.
const noWhen = { id: 'r20b-plan-sym', rules: [{ id: 'r-p', on: ['tools/result'], then: [{ record: { track: 'progress' } }] }] }
const planned = await call({ action: 'plan', manifest: J(noWhen) })
const plannedProblems = (Array.isArray(planned.problems) ? planned.problems : []).map(String)
ok(plannedProblems.some((p) => /when is required/.test(p)),
  'P1. ★ the TOOL\'s plan() NAMES the missing `when` ITSELF — asserted on `problems`, not on `ok`', planned)
ok(!(planned.ok === true && plannedProblems.length === 0),
  'P2. and it is not the old hollow shape: `ok:true` with ZERO problems while apply() would refuse', planned)
const appliedNoWhen = await call({ action: 'apply', manifest: J(noWhen) })
ok(appliedNoWhen.ok === false && appliedNoWhen.code === planned.code,
  'P3. plan and apply agree on the CODE (the same judgement, reached before the loader compiles the rule)', { plan: planned.code, apply: appliedNoWhen.code })
```
（这三条已并入 `tests/vmu-pack-tool-actions.test.mjs`，见该文件 `S1–S3`。）
★ **caveat（`vmu-pack2` 复核后补，R25 落）**：**一个只在 `problems` 上成立的判据，抓不到"报而不拒"** —— 我最初那版 S1 只钉 `problems.some(/when is required/)`，于是在"`plan` 一边列出问题、一边仍回 `ok:true`"这个回归下，**S1／S2／S3 会同时通过**（S2 `!(ok && problems.length===0)` 因 `problems` 非空而真；S3 因 `plan.code === apply.code` 而真）⇒ **`plan.ok` 一次都没被钉**（`vmu-pack2` 抓出，我复算确认）。**已修**：S1 现**同时**钉 `ok === false` ＋ `code === 'VMU_PACK_MISSING'` ＋ `problems` 含该名目（`tests/vmu-pack-tool-actions.test.mjs`，**17/0**）。⇒ 教训：**判据要钉在"该名目 ＋ 该否认"两处**，只钉其一会留下一条**空过**形状。
★ **这条守卫的口径来自 `vmu-verify2` 的复核（⑥），必须照办，否则修复本身会是一条空过**：
1. **判据钉在 `plan().problems` 上**（以及真入口那条 **stderr 具名行**），**不要只看 `ok`** —— 现在 `plan` 的返回是 `Object.assign({ok:true,action}, loader.plan(...))`，问题的通道是 `problems`；`ok` 是否翻转取决于 `loader.plan` 自己回什么，**不能当作"有没有问题"的判据**。
2. **不许只断言"没抛"**：`§2` 已实测 **真入口根本不抛** —— pack 失败只以**宿主 stderr 一行 ＋ `appliedPacks:[]`** 露出 ⇒ **只查异常的回调方会把"没装上"读成"成功"**。所以验收要**两条都钉**：`plan().problems` 内含该名目 **且** 真入口路径下 `appliedPacks` 不含该 id（或 stderr 打出 `was not applied: …` 行）。

---

## 4. ④ R19 探针自身的形状错误 —— 已修；两条探针现在同读数

**我的探针确实错了三处**（框架当时是**具名拒**，不是它坏）：
| # | 旧值 | 规则出处 |
|---|---|---|
| 1 | `meta.id: 'r19.counter'` ≠ 条目 id `'r19-counter'` | `kernel/loader.js:72-74` |
| 2 | 模块**没有** `capabilities` | `kernel/loader.js:80-81` |
| 3 | 条目缺 `trigger-workflow`（要够到服务缝） | `kernel/loader.js:131-134` |

**修后复跑（原样）**：
```
node D:\_tmp\vmu-r19-policy-path.mjs   → === VMU R19 FULL CHAIN: 7 passed, 0 failed ===  exit=0   （我的，已修）
node D:\_tmp\vmu-r20-inline-chain2.mjs → === VMU R19 FULL CHAIN: 7 passed, 0 failed ===  exit=0   （pack2 的修正版）
   ⇒ metricValues() = {"artifacts":5} ; delivered = ["artifacts-met","turn-end-duty"] ; met text = "ABOVE: artifacts=5 gte 5"
```
⇒ **两条探针独立同读数**，这条链**不再"红着躺在证据里"**。
★ **版本限定（必须保留）**：修复**前**那条 `vibe-math-vmu.js … was not applied: ERR_INVALID_ARG_TYPE …` 是**修复前**的历史读数（task-125 引用它时须连带"修复前"限定）；修复**后**同一形状已换成 `VMU_MIDDLEWARE_FAILED … meta.id (r19.counter) does not match the entry id (r19-counter)` —— 那正说明对象**真的走到了 `apply()`**（即 `pack2` 的修复有效），随后才轮到**探针自己的**形状错误。

---

## 5. 回归读数 ＋ 双登记

```
node tests/vmu-pack-tool-actions.test.mjs   → === VMU PACK TOOL ACTIONS: 14 passed, 0 failed ===  exit=0   （新，双向）
node tests/vmu-host.test.mjs                → === VMU HOST: 107 passed, 0 failed ===                  exit=0
node tests/vmu-pack.test.mjs                → === VMU PACK: 53 passed, 0 failed ===                   exit=0
node tests/audit-tool-table.test.mjs        → === TOOL TABLE: 7 passed, 0 failed ===                  exit=0   （只比名字，② 的文本改动安全）
node tests/audit-package-membership.mjs     → === PACKAGE MEMBERSHIP: 29 passed, 0 failed ===         exit=0
node D:\_tmp\vmu-r20b-host-pack-probe.mjs   → （修前/修后各一次，读数见 §1）
node D:\_tmp\vmu-r20b-apply-side.mjs        → exit=0（读数见 §3）
```
**双登记**：`node D:\_tmp\r20b-register-test.mjs` ⇒ `inserted; JSON valid; files[] count=686; IN=true; distinct=686`；`git diff --numstat package.json` ⇒ **5 行**（**我只加 1 行**，其余是 `comms2`／`pack2` 同轮各自的那一行）。
★ **一条并发中间态（如实记）**：第一次跑 `audit-package-membership` 夹在别人写 `package.json` 的中间，读到 **exit=1**；**立刻复跑 ⇒ 29/0 exit=0**。⇒ 那是**并发瞬时态**，不是缺陷（与 verify2 观察到的 `regen-all --check` 12/15 vs 13/15 同类现象）。

---

## 6. 未做项（**具名**，无半成品）

1. **③ 的两半修复（`plan` 调 `kernel.rules.validate` ＋ `pack.js:388` 的 hint）** —— **未做**：`kernel/pack.js` **不在 task-127 写范围**（范围：`host.js`／`tests/**`／`package.json`／本报告），且 `pack2` 有它在飞改动（task-125）⇒ 我不与它同文件各改一处。**修法与守卫代码在 §3，随时可用**。
2. **`docs/18-§2.6`（`:141-143`）现在有一段对我 ① 修复而言过期的话** —— 它写着"★ 轮 20 实测（两条与实现不符）… ① `unload` 也必须带一个 `manifest` …"；① 修好后**只有 ② 那一半**仍是历史事实，① 应改为"**已在 task-127 修复**（unload 分支先于 manifest 守卫）"。`docs/**` **不在我写范围**，且 `docs/18` 同轮有他人在写 ⇒ **只具名，未动**。
3. **真 DSH 会话**：与本任务无关（①② 都在工具面，断言用的是真 adapter＋真 loader）；**未跑**。
4. **`/tmp` 清理**：脚本留在 `D:\_tmp`（本仓惯例：探针是仓库外证据）；未删（若 Lead 要求清理请说）。
