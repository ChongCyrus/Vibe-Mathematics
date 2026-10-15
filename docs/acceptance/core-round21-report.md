# Round 21 · task-129 · **未完成（具名）** —— A（复现/定位）未跑完 ⇒ B/C 不做；D 未到；已落 1 件相关小修（S1）

**一句话**：我**没有**修 R21b，也**没有**伪造一个"已定位"的结论。原因是一条纪律：**裁决要求"★ 先复现（隔离 home／干净 profile），再改"**，而本轮我**无法**在预算内跑完那条真机复现；同时 R21b 的根因**很可能不在我们的代码里，而在 DSH 预设行的键空间**（见 §2，**明确未验证**）⇒ **盲改会正好造出我这一整轮在避免的那种缺陷**。所以我交付：**我自己核实的事实 ＋ 现成复现配方 ＋ 一个会改变裁决前提的分叉 ＋ 我唯一确定能做对的那件小修**。

---

## 0. 核验行

| 项 | 值 |
|---|---|
| HEAD | `d2e4510`（Lead 已提交，T1 315/315） |
| 我本轮**改了**的 | `tests/vmu-pack-tool-actions.test.mjs`（**S1 一行补丁**，见 §4）—— 在 task-129 写范围内 |
| 我**没碰**的 | `vibe-math-vmu.js`、`kernel/loader.js`、`kernel/pack.js`、`host.js`（前两者与 `vmu-pack2` 的 task-130 已对齐：**它不动这两处，我不动 `pack.js`／`host.js`**） |
| 只读核验来源（**我自己跑/读的**） | `D:\_tmp\r21b-overlay.yml`、`D:\_tmp\r21b-session.log`、`vibe-math-vmu/vibe-math-vmu.js`、`C:\Users\admin\.dsh\profiles\desktop\node_modules\`（grep） |

---

## 1. 我自己核实的事实（不是转述别人）

**(1) R21b 的原样错误载荷**（`D:\_tmp\r21b-session.log`，逐字）：
```
{"step":"rpc","endpoint":"session/create","ok":false,
 "error":{"code":"agent-preset/invalid",
   "message":"vibe-math-vmu (dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js): cannot get property \"systemPrompt\" without inject",
   "details":{"agentPreset":"vibe-math-vmu","reason":"…same…"}},"http":200}
```
⇒ 错在 **`session/create`**（**会话根本没建起来**），错误**归属到我们的插件 id**，`exit 1`。

**(2) 那条 overlay 的形状**（`r21b-overlay.yml:12-17`）—— 关键在于它是**同层**三个键：
```yaml
rows:
  vibe-math-vmu:
    packs: ['v5r']        # ← 顶层，与 deliver / vmu 同层
    deliver: !!js '(report) => …'
    vmu: { tools:…, packs:{active:['v5r']}, metrics:…, report:… }
```
★ 对照：**R18/R21 的 overlay 在同一层只有 `deliver` ＋ `vmu`，会话正常**（exit 0）⇒ 唯一新增的同层键是 **`packs`**。

**(3) 抛错代码的位置**（我 grep 出来的，不在我们仓里）：
`C:\Users\admin\.dsh\profiles\desktop\node_modules\@deepseek-ai\cordis\lib\index.js:676`
```js
const error = new Error(`cannot get property "${prop}" without inject`);
```
⇒ 这是 **cordis 的服务代理**：某处读了 `ctx.systemPrompt` 而**没有声明 `inject`**。
★ **【已更正，见 §1bis】我原来在这里写"我们的插件 `inject = ['tools']`，从不读 `systemPrompt`"——这句话是【错的】**：**我们自己就在读**（`vibe-math-vmu.js:706` 的 `ctx && ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function'`，`:708`/`:711` 又各读一次），而 DSH 的报错文案把失败归到**我们的模块名下**，这与"**抛点就在我们仓里**"完全相容。该更正由 `vmu-verify2` 复核提出，我按**本机实验**确认（§1bis）。

---

## 1bis. ★★ 决定性实验：**H2 已确认（本机，无需真机）** —— 根因在**我们仓里**

**抛点**：`vibe-math-vmu.js:706` —— `ctx.systemPrompt` 是**未注入服务的属性访问**，而 cordis 的代理**在访问本身上就抛**（`cordis/lib/index.js:676`）⇒ **前面的 `ctx &&` 真值判断挡不住一个会抛的 getter**（`inject = ['tools']`，见 `:51`）。
**为什么偏偏"加了 `packs:` 之后"才抛**：`:217` `effectivePrompts = promptSections.map(…)`，而 **`:230-243` 会把 pack 的提示词数据（`packs/<id>/prompts/*.json`）`push` 进 `effectivePrompts`** ⇒ **只有真的装载了 pack，`effectivePrompts.length > 0` 才成立，`:706` 才会执行到那个访问。**

**本机复现**（`node D:\_tmp\r21b-h2-probe.mjs`；用**访问计数 ＋ 会抛的 getter** 模拟 cordis 代理；**无 DSH、无会话**）：
```
— control: packs: []       systemPrompt getter touched = 0   threw = no   effectivePrompts=[]   activePacks=[]
— suspect: packs: ['v5r']  systemPrompt getter touched = 1   threw = cannot get property "systemPrompt" without inject
```
⇒ **control 完全干净（0 次触碰）；一装载出货 pack 就触碰一次、并抛出与 R21b 逐字同类的错误。** 这已是 R21b 的**充分解释**，且**不需要**任何 DSH 保留键假设。

**★ 因此 §2 那条假设（H1：`packs` 是 DSH 保留键）不但未验证，而且：**
- **不是解释 R21b 所必需的**（H2 已足够）；
- **它对应的那个实验（把 `packs:` 改名成 `packList:`）是【被混淆的】**：改名会**同时**去掉 H1 的触发因子**和** H2 的触发因子（没有 pack ⇒ `effectivePrompts` 为空 ⇒ `:706` 不执行）⇒ "会话起来了"**两种假设都能解释**。`vmu-verify2` 在我提出该实验时就警告过这一点 —— **它是对的**；`task-131` 应按此**改判或取消**（见 §3）。

**(4) 装载开关的位置**（`vibe-math-vmu.js`，逐行核过）：
`config.packs`（`:451` `wantedPackIds`）→ `packsDeclared`（`:515-516`）→ `packLoader`（`:530`）→ `packs:` 上报（`:543`／`:945`）→ 真装载循环 `:732-738`（`import('./packs/<id>/index.js')` 或内联 manifest ⇒ `packLoader.apply`）。
而设置键 `vmu.packs.active`（`settings/schema.js:220`）**只进 `packsDeclared`**（让工具可达）＋状态/冲突文案 ⇒ **它不是装载开关**（与 Lead 的转述一致）。

**(5) 我读不到 DSH 的 preset/overlay 实现**：`overlayFor` 与 `agent-preset/invalid` 在 profile 的 `node_modules` 里 **grep 零命中** ⇒ 那部分代码在 **`app.asar` 里**，而 `app.asar` 是**归档文件**（`...\resources\app.asar` 不是目录；`Test-Path ...\app.asar\dsh` = **False**），普通工具读不进去 ⇒ **我无法读到 DSH 预设行的键 schema**。★ 这是下面那条假设**无法验证**的原因，也是我停手的直接理由。

---

## 2. 我的假设（★ **明确未验证**；★ **已被 §1bis 取代**，保留作为过程记录：它当时就标着未验证，且现在连"必要性"都不成立）

**假设**：`packs` 是 **DSH 预设行的保留键**（DSH 自己用它来挂"随行插件/包"），所以：
- 同层的 `deliver`（DSH 不认识）⇒ 原样传给我们 ⇒ 正常；
- 同层的 `packs:['v5r']`（DSH **认识**）⇒ DSH 拿它去解析一个**名为 `v5r` 的包/插件** ⇒ 解析失败/装配图残缺 ⇒ 某个依赖 `systemPrompt` 的服务在**未注入**的语境下被读 ⇒ `agent-preset/invalid`，**且会话建不起来**。

**支持证据**：① 唯一变量是同层新增的 `packs`；② 报错归属我们的**行**，但读 `systemPrompt` 的不是我们的代码；③ 该错发生在 `session/create`（装配期），不在装包/运行期。
**反证/限制**：**我读不到 asar 里的行 schema ⇒ 这条无法证实**；也不能排除"我们的 `config` 形状让 DSH 把本行当成另一种行"这类变体。

---

## 3. 分叉 → **★ 已由 §1bis 收敛**：根因在仓内，修法在 `vibe-math-vmu.js:706`（原"请 Lead 裁"的内容保留在下方作为过程记录）

**★ 收敛后的结论（取代下面的分叉）**：
- **根因**：`vibe-math-vmu.js:706` 在 `systemPrompt` **未被注入**时**直接读属性**，而 cordis 代理**访问即抛**；**`config.packs` 一旦真的装载 pack，提示词数据就把 `effectivePrompts` 顶成非空，从而让这一行第一次被执行** ⇒ **"文档化的装载点"不是坏在装载链，而是坏在装载成功之后紧接着的那一行**（这正是 task-129 要修的"文档化的那条路必须能用"）。
- **修法候选（都在我们手里，都在 task-129 写范围内）**：
  1. **把这次访问变成"不抛的探测"**（`try { sp = ctx.systemPrompt } catch { sp = null }`）——★ **注意**：`typeof ctx.systemPrompt?.section === 'function'` 这类**可选链也会抛**（它同样触发 getter），**不能**用；
  2. 或让 `systemPrompt` 进 `inject` —— ★ **不推荐**：那会把这个插件变成**强依赖** `systemPrompt` 的插件，在最小宿主上直接装配失败，违背零机制；
  3. 无论哪种，**都不能静默**：宿主声明了提示词文本但 `systemPrompt` 不可达时，应在**自曝面**具名（例如 `status()` 里记 `promptSection: { registered:false, reason:'systemPrompt not injected/reachable' }`），而不是悄悄不注册。
- **`task-131` 的处置建议**：**改判**为"先用候选 1 修掉 `:706`，再按 R21b 原配方（**保留同层 `packs:['v5r']`**）跑真机" ⇒ 会话若能建起来 **且** `settingsMerge.packs` 非空 ＋ 有 `source:"pack"`，则 **H2 确证、H1 无必要**；`packList:` 那个实验**不必跑**（已被 §1bis 证明是混淆的）。

---

## 3-bis. 原分叉（**过程记录**，已被上面取代）

- **若假设成立**：`docs/10-packs.md:436` 写的"**profile 行的 `config.packs`**"这条装载点，在**预设行**这一层**不可能**可用（键被 DSH 占用）⇒ 裁决的前提（"文档化的那条路必须能用"）需要**改写为**："文档写错了装载点 ⇒ 换一个 DSH 不保留的命名空间"。可行方向（都需要**真机**验证，我不猜）：
  (i) 把装载开关搬到**我们自己的命名空间**，例如 `config.vmu.packs.load: ['v5r']`（`vmu:{}` 这一层在 R18/R21 已被证明**能穿过装配**），并**让 `vmu.packs.active` 成为真开关**（现在它只喂 `packsDeclared`）⇒ 同时**顺带修掉 R21**（设置键写了却不装载）；
  (ii) 或保留 `config.packs` 但规定它只能出现在**非预设行**的位置（若存在这样的位置）。
- **若假设不成立**：根因在**装载链**（`vibe-math-vmu.js`→`kernel/loader`→`kernel/pack`）⇒ 修法完全不同，且**必须先拿到带栈的复现**（现在拿到的只是 `session/create` 的数据载荷，没有栈）。
⇒ **两条路都必须先有 A**。**没有 A 我不动手**（这是裁决明写的顺序，也是我这一整轮反复守的那条）。

---

## 4. 我本轮**唯一**落的一件（同轮缓办件，与本任务相邻、在写范围内）

`tests/vmu-pack-tool-actions.test.mjs` 的 **S1 一行补丁**（`vmu-pack2` 复核发现、我上一轮已认领）：
```js
ok(plannedNoWhen.ok === false && plannedNoWhen.code === 'VMU_PACK_MISSING' && plannedProblems.some((p) => /when is required/.test(p)), …)
```
**为什么必须改**：原 S1 只钉 `problems` ⇒ 在"**报而不拒**"回归下，S1/S2/S3 **三条会同时通过**（S2 因 `problems.length!==0`，S3 因两边 `code` 相同）⇒ **`plan.ok` 一次都没钉**。
**读数**：`node tests/vmu-pack-tool-actions.test.mjs` ⇒ **17 passed / 0 failed，exit=0**（补丁前后同读数，因为**当前** `plan` 确实回 `ok:false, code:'VMU_PACK_MISSING'` —— 我实测过，不是推断）；`audit-declaration-criterion` 的 **RULE E shape A = 67**（基线 67）**未动**。

---

## 5. 现成的复现配方（给**有环境**的人；我没有跑）

| 件 | 路径 |
|---|---|
| 触发 R21b 的 overlay | `D:\_tmp\r21b-overlay.yml`（§1(2) 的形状） |
| 失败读数（原样错误载荷＋exit 1＋驱动栈） | `D:\_tmp\r21b-session.log` |
| 对照（能起来的那次） | `D:\_tmp\r21-overlay.yml` ＋ `r21-overlay.yml` 的会话日志 |
| 驱动器 | `scripts/dsh-drive.mjs`（attach 模式；隔离 home 用 R18/R21 那套，`D:\_tmp\r18-home` 仍在） |

**最小复现步骤**（照 R21b）：① 用隔离 home/干净 profile 起 `dsh web`（带 `r21b-overlay.yml`）；② `node scripts/dsh-drive.mjs --port … --token … --preset vibe-math-vmu --cwd … --dsh-home …`；③ 观察 `session/create` 是否报 `agent-preset/invalid … systemPrompt without inject`（**应当复现**）；④ **对照实验（决定性）**：把同层的 `packs:` 换成 **DSH 不认识的键名**（例如 `packList:`）再跑一次 —— **若会话能建起来**，则 §2 的假设**成立**（`packs` 是保留键）；**若同样崩**，则根因在我们的 `config` 形状/装载链。★ 这个对照实验是**下一步最省的一刀**，但它**必须真机**。

---

## 6. 未做项（**具名**，无半成品）

1. **A：R21b 的复现与定位** —— **未完成**。我拿到并核了**原样错误载荷**与**抛错代码位置**，但**没跑**那条真机复现，也**读不到** DSH 的行 schema（§1(5)）⇒ **假设未验证**。
2. **B：修好（`settingsMerge.packs` 非空＋`source:"pack"`＋不打断装配）** —— **未做**（依裁决顺序，A 未成不动手）。
3. **C：三条能红的断言（装了/不装/坏形状具名拒）** —— **未做**（同上；且"坏形状应当**具名拒**而不是 `agent-preset/invalid` 裸崩"这一条，若根因在 DSH 侧，**可能不由我们决定** ⇒ 需 A 之后重新裁）。
4. **D：第三次真机会话** —— **未到**；且**真机结论我不许自己声称**（这条我遵守，没有替你或 assistant2 声称任何装载已成功）。
5. `docs/**` 未动（按裁决归 `vmu-assistant2`／`vmu-pack2`）；`pack.js`／`host.js`／`loader.js`／`vibe-math-vmu.js` **一行未动**。

## 6bis. 本轮最终落地 ＋ 门禁状态（含一处**被门禁抓到的自我更正**）

**已落**：① `vibe-math-vmu.js` 的 **H2 修复**（`:706` 受保护探测；失败打 **stderr＋`err.stack`** 并在 `status().promptSection` 具名）；② 新常驻守卫 `tests/vmu-prompt-section-guard.test.mjs`（**6/0**，含"无 pack ⇒ 触碰 0 次"的反向判据）；③ `package.json` 双登记（`688/688 distinct`）。
**门禁（我跑的原样读数）**：`audit-vmu-docs` **99/0**、`vmu-entry` **150/0**、`vmu-prompt` **70/0**、`vmu-host` **107/0**、`vmu-kernel` **175/0**、`audit-package-membership` **29/0**。

**★ 一处自我更正（门禁真的抓到了我）**：我最初为这两个失败发明了**新码** `VMU_PROMPT_SECTION_UNREACHABLE` / `VMU_PROMPT_SECTION_UNAVAILABLE` ⇒ **`audit-vmu-docs` 立刻 98/1**，判据逐字是"**every framework VMU_* code the CODE can throw is registered in 03-§8**" ⇒ **发明一个未登记的公开码是被禁止的**；而 `docs/**` **不在我写范围** ⇒ 我没有去登记，改为**复用已登记的 `VMU_EXTERNAL_UNAVAILABLE`**（其语义正是"宿主未注入的接缝/能力"，见 `@mathjobs` 对 `spawn` 缝的同类用法）＋ 用 `what: 'systemPrompt' | 'systemPrompt.section'` 与 `reason` 保留具体含义 ⇒ 门禁回绿 **99/0**。
★ **这条经验值得写进矩阵**：**"一个模块不能自己发明公开码"**是**有牙的**（`audit-vmu-docs` 会在**代码侧**发现它），而正确出路是**复用语义相符的已登记码 ＋ 用 `what`/`reason` 承载细节**，或**由 docs 属主登记新码**（跨范围，需派单）。

**`regen-all --check` = 13/15（2 FAIL）—— 归 Lead 轮末，我未动**：
- `planned-code registry (docs/03-§8)`：我**单跑** `node scripts/generate-planned-codes.mjs --check` ⇒ **`up to date (277 planned codes)`** ⇒ 至少不是我的码复用造成的（`regen-all` 的判定与单跑不同，或受并发写者影响）；
- `documented counts (README / checklist)`：**本轮新增了测试文件**（我的 `vmu-prompt-section-guard` ＋ `vmu-pack2` 的若干个）⇒ 计数过期 ⇒ 正是"双登记"的另一半（`package.json` ＋ 计数），**修法＝`update-doc-counts`（属 `regen-all` 领地，我不跑；`README`/`docs` 不在我写范围）**。

---

## 6ter. ★★ ARM A 修复（本轮最终）：抛点具名到 `:735`，栈原样在案

**四臂真机（`vmu-assistant2`）把触发条件夹死**：**A**（`packs:['v5r']`，真 pack **装载成功**）⇒ `session/create` 被拒、**exit 1、宿主 stderr 0 B**；**B**（`packList:['v5r']`，我们的 loader **不被触发**）⇒ 会话正常；**D**（`packs:['no-such-pack']`，loader 触发但**具名降级**）⇒ 会话正常、stderr 200 B（**我们 entry 自己的措辞**）⇒ **H1（DSH 保留键）被推翻**，触发条件＝**"我们成功装载了一个真 pack"**。

**我的本机复现（`node D:\_tmp\r21-armA-probe.mjs`，**修复前**读数）**：
```
★ ARM A: real pack, systemPrompt reachable but section() THROWS
    threw = cannot get property "systemPrompt" without inject     ← 逃出 apply()
    section() called = 1                                          ← 已到达 :735
    promptSection = null   activePacks = null                     ← 还没设上就崩了
```
⇒ **我的第一版防护只护住了"访问"（`:724`），没护住"调用"（`:735`）**；宿主**可达但调用即抛**时，异常**直接逃出 `apply()`**、**我们的 catch 一个字都没写** ⇒ 与 arm A **stderr 0 B** 的现场**逐项吻合**。

**★ 原样栈（Lead 要求入册；修复后由 `status().promptSection.stack` 取到）**：
```
Error: cannot get property "systemPrompt" without inject
    at Object.section (…\D:\_tmp\r21-armA-probe.mjs:29:53)
    at file:///D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/vibe-math-vmu.js:744:40      ← systemPrompt.section({…}) 调用点
    at Object.effect (…\r21-armA-probe.mjs:19:21)
    at effect (file:///…/vibe-math-vmu.js:598:61)
    at Module.apply (file:///…/vibe-math-vmu.js:740:9)                                        ← 从 apply() 里逃出的那一跳
    at run (…\r21-armA-probe.mjs:38:20)
```
（另一条控制臂的栈指向访问点 `…/vibe-math-vmu.js:724:33`，与它同型。）

**修法（已落，`vibe-math-vmu.js`）**：把**注册动作本身**（`effect(() => … systemPrompt.section({…}) …)`）纳入同一处 `try/catch`，**不吞错**：失败 ⇒ `promptSection = { registered:false, code:'VMU_EXTERNAL_UNAVAILABLE', what:'systemPrompt.section', reason, stack }` ＋ **stderr 打 `err.stack`**。★ **不自造新码**（复用已登记者）／**不用可选链**（`?.` 同样触发 getter）／**不加 `inject`**／**不吞错**。
**修复后读数**：arm-A 探针 ⇒ **`threw = no`**、`section() called = 1`、`promptSection` 具名带 stack；`packs:[]` 控制臂 ⇒ `section() called = 0`（分支不跑）。
**守卫**：`tests/vmu-prompt-section-guard.test.mjs` **10/0**（新增 **P6** 非空前置"确实到达该调用"／**P7** `threw = no`（逃逸即红）／**P8** 具名带 stack／**P9** stderr 有那行——**它的缺席正是 arm A 的特征**；**P5** 保留"无 pack ⇒ 调用 0 次"）。
**门禁**：`audit-vmu-docs` **99/0**、`vmu-entry` **150/0**、`vmu-prompt` **70/0**、`vmu-kernel` **175/0**、`audit-package-membership` **29/0**；本轮**无新增文件** ⇒ `package.json` 未再改。
★ **真机判据（交 `vmu-assistant2`）**：**"成功装载一个真 pack 不再打断预设组装"**，且第三次会话应能看到**那条具名降级**（`the host systemPrompt service refused this section`）而**不是** `agent-preset/invalid`。**真机结论只有它能声称，我不声称。**

---

## 7. 建议

把 **A 交给 `vmu-assistant2`**（它已有隔离环境＋R21/R21b/R21c 三条配方，§5 的对照实验它跑最省），或**下轮给我并给我足够预算**；B/C 随 A 的结论走（若假设成立，B 会变成"换装载命名空间＋让设置键成为真开关"，并**同时修掉 R21**）。**我建议先做 §5 的那一刀对照实验再裁 B**。
