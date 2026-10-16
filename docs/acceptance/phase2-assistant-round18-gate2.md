# 第二阶段 · assistant `round18`：**第二步闸门的前置检查（修复是否已落）—— 未落 ⇒ 停**

> 负责人：`vmu-assistant2`。★ **本轮不跑真机**：Lead 规定的**第一步判据未过**，按纪律**停**。
> HEAD：**`c056433`**（`git status` 1 行，见 §4）。**本轮 0 会话／0 token**，未复制凭据。
> 报告只做四件：① 第一步判据的逐字结果；② **给 owner 的精确待改点**（含一处**行号不一致**提醒）；③ **残差声明第 1 条的更正（我已读码确认）**；④ **修复落定后的两种可能读数的预写判据**。

---

## 0. 结论
# ★ **修复尚未落**（两处 `ctx.get` 各 **0 命中**）⇒ **按纪律停在第一步，不跑闸门、不跑行为臂。**
★ **并与 `vmu-pack2` 自己的 R18 报告互相印证**：`docs/acceptance/phase2-pack-round18-context-get.md` **§0 明写"第 (1)(2) 项【未开工】"**（它本轮完成的是第 (3) 项：`strict` 语义）⇒ **两个独立来源一致** ✓
★ **本轮省下**：闸门 1 次（≈60–85k）＋ 其后 6 次行为臂（≈0.6–0.9M）⇒ **≈0.7–1.0M tokens**（这就是"先查 HEAD"这条纪律的实际价值）。

## 1. ★ 第一步：三个只读命令与逐字结果
```powershell
git rev-parse --short HEAD
#   → c056433
Select-String -Path vibe-math-vmu\vibe-math-vmu.js -Pattern "ctx\.get\('systemPrompt'\)|ctx\.get\(\"systemPrompt\"\)"
#   → （0 行命中）
Select-String -Path vibe-math-vmu\kernel\reportfeedbackdelivery.js -Pattern "ctx\.get"
#   → （0 行命中）
```
**判据（Lead 给的）**：两处**都**出现 `ctx.get` ⇒ 修复已落 ⇒ 进第二步；**没出现** ⇒ **停**。
**结论**：★ **两处皆 0 命中 ⇒ 判据未过 ⇒ 停** ✓
★ 补充（工作树，非仅 HEAD）：`kernel/reportfeedbackdelivery.js` 当前仍是
`L100: try { host = ctx && ctx.systemPrompt ? ctx.systemPrompt : null } catch (e) { accessFailed = e }`
⇒ **属性访问仍在**（会抛的那一处）✓

## 2. ★ 给 owner 的**精确待改点**（本轮读码；含一处**行号不一致**提醒）
| # | 位置（现树） | 现状（逐字） | 建议改法（照 pack2 R18 §2 的口径，**保留具名降级**） |
|---|---|---|---|
| **A** | `vibe-math-vmu.js:809` | `systemPrompt = ctx && ctx.systemPrompt ? ctx.systemPrompt : null`（在 `try/catch` 内，`:806` 起 `if (effectivePrompts.length > 0)`） | `const systemPrompt = ctx && typeof ctx.get === 'function' ? ctx.get('systemPrompt') : null`（★ **保留** `try/catch`：别的宿主的 `get` 可能抛） |
| **B** | `kernel/reportfeedbackdelivery.js:**100**` | `try { host = ctx && ctx.systemPrompt ? ctx.systemPrompt : null } catch (e) { accessFailed = e }` | 同上：`ctx.get('systemPrompt')` ⇒ `undefined` 时**走具名降级**（`named('systemPrompt.context', …)`）**而不是**靠 catch |
★ **行号提醒**：pack2 R18 §2 把 B 写成 `reportfeedbackdelivery.js:**60**`；本轮现树里**属性访问实际在 `:100`**（`:60` 一带是 `deliverReportFeedbackFrom` 的定义）⇒ ★ **落编辑时请以 `ctx && ctx.systemPrompt` 的【出现处】为准**，不要按行号跳（本仓已多次遇到行号漂移）。
★ 并提醒 Lead 的判据：**两处都要出现 `ctx.get`**（只改一处仍过不了第一步判据）。

## 3. ★★ 残差声明：**第 1 条更正**（复核者 R17 的更正，我已**读码确认成立**）
**更正**：★★ **`packs/*/prompts` 不是"绕过 `ctx.systemPrompt` 的独立路"** ——
- 证据（本轮读码，逐条）：`vibe-math-vmu.js:220` `const effectivePrompts = promptSections.map((s) => {…})`；★ **`:246` `effectivePrompts.push({ name: s.name, order: …, text: s.text, source: 'pack:' + name })`**（**pack 段被 join 进** `effectivePrompts`）；`:789` 注释 *"The host section carries the EFFECTIVE text of every declared/overridden section (**joined into the one** …"*；`:806` `if (effectivePrompts.length > 0) {`；★ **`:815` `if (!promptSectionState.code && systemPrompt && typeof systemPrompt.section === 'function') {`**（**仍走 `systemPrompt.section(...)`** —— 同一个未注入的服务）。
- ⇒ ★ **回执里的 `prompt.sections`（如 R43/R44 的 59 段）是【我们自己的声明记录】**，**不是**"已投递到宿主"的证明；★ 同一份回执里 `promptSection.registered:false` 恰恰说明**记录是满的、而宿主的注册失败了** ✓
- ⇒ ★★ **我 R16 把"59 段"当作"已证明能到达模型、且绕过 inject 的对照证据"的建议【撤回】**（照录，不再引用）。
**更新后的残差声明（三条路径 ＋ 宿主边界）**：
| # | 路径 | 形态 | 真机状态（来源轮次） |
|---|---|---|---|
| 1 | **`packs/*/prompts`** | ★ **join 进 `effectivePrompts` 后仍经 `systemPrompt.section(...)` 注册**（**非独立路**，已更正） | ★ 回执里 **59 段只是我们自己的登记记录**（R43/R44）；**投递状态**与路径 2 同源：`registered:false` |
| 2 | **`systemPrompt.section`** | 入口 `systemPrompt.section({name:'vmu',…})` | ★ **具名失败**（多轮）：`registered:false`／`VMU_EXTERNAL_UNAVAILABLE`／`…without inject` |
| 3 | **`systemPrompt.context`** | 投递 `systemPrompt.context({name:'vmu:report-feedback',order:5000,…})` | ★ **R16 已触达且具名失败**（`delivered:false`／`what:"systemPrompt.context"`／stack 到 `reportfeedbackdelivery.js:94`） |
**未覆盖（＝宿主边界）**：★ **宿主自身拼接的提示词未枚举** ✓（不变）。

## 4. ★ 修复落定后的**两种可能读数**（预写判据，免得下一轮歧义）
判据：闸门仍以 **`enabled:true` 且 `delivered:true`** 同时成立为准。若**仍 `delivered:false`**，按**九键**里的 `reason` 与 `stack` **指向哪里**分两种：
| # | 九键特征 | 含义 | 与另一种的区别 |
|---|---|---|---|
| **(α)** | `reason` 仍是 *"the host systemPrompt service is NOT reachable (not injected?)"*，**但 `stack` 不再指向"属性访问"那处**（即不再是 `ctx.systemPrompt` 的 getter 抛错那一帧） | ★ **`ctx.get` 返回了 `undefined`** ⇒ **该服务在本部署里确实未被 provide** | ★★ **"取不到服务"** —— 阻塞在**宿主是否 provide**（部署/作用域问题） |
| **(β)** | `stack` 指向 **`.context(` 调用点**（`reportfeedbackdelivery.js:131` 一带有具名降级的那个 catch） | ★ **取到了服务，但调用被拒** | ★★ **"取到但调用被拒"** —— 阻塞在**调用期**（与 R21 ARM A 的"`.section()` 拒绝未注入调用者"同类） |
★ 两种都**不是**"模型不用通道"（那是闸门过后的行为问题）；★ 我会把九键**逐字**给出并对号入座（**不许**把 (α) 写成"仍未建立"）。

## 5. 纪律与成本
- ★ **本轮不跑真机** ⇒ **未复制凭据**；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主无残留、`7700–7900` 无监听** ✓（本轮未启动任何宿主）
- **未跑全量／未 `regen-all`／未 git 写／未改码**；★ 我只新增本报告 ⇒ 与在飞者**无交集**：`git status` 显示 `M vibe-math-vmu/kernel/reportfeedbackdelivery.js`（**pack2 的在飞/staged**）＋ `?? docs/acceptance/phase2-pack-round18-context-get.md`（**pack2 的报告**）—— **两者均非我**。
- **成本**：**0 会话／0 token**（纯只读检查）；★ 收益＝**未在修复落地前烧掉闸门 1 次＋行为 6 次（≈0.7–1.0M）**。
