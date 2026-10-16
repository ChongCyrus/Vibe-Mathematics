# Phase 2 · verify2 · Round 18 —— 复核 R17 裁定的执行 ＋ ★ **本轮【未落】** ＋ 闸门判据的区分度设计

> 纪律：**只读复核**（真树只新增本报告）；探针在 `D:\_tmp\p2r18`（**副本制**）；**引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写。
> ★★ **按你的指令先说结论：本轮改动【未落】。** `HEAD` 仍是 **`c056433`**（`test(vmu): add the assertion whose absence let a switch stay shut…` ＝ **R16 收轮提交**，`git log ca531db..HEAD` **只有这一笔**）；**两个取用点都还是 `ctx.systemPrompt`**（见 §1）⇒ ★ **我【没有】核未提交字节**；我改为**在副本里做一个明确标注的【落地前原型】**，把"落地后应当看到的读数"提前量出来（§4/§5）。

## 0. 结论速览
| 项 | 判定 | 关键读数 |
|---|---|---|
| **0 落地状态** | ★★ **未落** | `HEAD c056433`；**提交里的** `vibe-math-vmu.js` **`96F52A647F3FB924`** 仍 `L809 systemPrompt = ctx && ctx.systemPrompt ? …`；**提交里的** `kernel/reportfeedbackdelivery.js` **`DB9D799F89FBDCBA`** 仍 `L100 ctx && ctx.systemPrompt`；★ `ctx.get('systemPrompt')` 在**两处都不存在**（`entry contains ctx.get('systemPrompt') = false`） |
| **1 两处都用 `ctx.get` ＋ 两层降级仍在** | ⛔ **未落**（无法核）；★ 但**降级两层今天都在**（我已逐支量出，§2） | 今天 4 个失败态的读数：**B（取用抛）** 与 **D（调用被拒）** 各自具名、**互不相同**；★ `try/catch`＋`typeof … !== 'function'` 两支都在 |
| **2 `ctx.get` → `undefined` 不得静默** | ✅ **形状上今天就满足**（原型下也保持） | 该情形 ⇒ `code:'VMU_EXTERNAL_UNAVAILABLE'` ＋ `what:'systemPrompt.context'` ＋ `reason:'the host exposes no systemPrompt.context() …'` ＋ **stderr 一行** ⇒ **不是孤零零的 `delivered:false`** ✓ |
| **3 `strict` 语义（你要求钉住）** | ✅ **从宿主源码钉住** | `@deepseek-ai/cordis/lib/index.js` **L755-772**（我按 asar offset 读出）：`get(name, strict = true)`；文档逐字"**Read a service from the store without the inject requirement**"／"**@returns the service value, or `undefined` when not (yet) provided**"；`_getImpl: if (!impl) return; if (strict && impl.fiber.state !== 2) return;` ⇒ ★ **默认 `strict=true` 下"未提供"与"提供了但未 active"都【返回 `undefined`】、不抛** ✓（会抛的是**另一个方法 `set`**：`L785`） |
| **4 闸门区分度（你给我的改进项）** | ★★ **发现一处三态碰撞，并给出拆分方案** | 今天：**A（未提供）与 C（无 `.context`）reason 相同**；原型下再并入 **A2（provided 但未 active）** ⇒ ★ **三态共用同一句 reason** ⇒ 真机闸门**无法**区分"宿主没 provide"／"provide 了但没 active"／"provide 了但不带 `.context`"；而 **B／D 已经可分** |
| **附：附带结论（`.context` 是不增加 P 的【唯一】通道）** | ✅ **在项目的 P 口径下成立（须限定措辞）** | P＝"提示词要求的：**注入层**，用 `prompt.sections` 段数＋具名段"（`phase2-assistant-round15-a1-step2.md:20`）；两条 `.section` 路都**注册 prompt section**（`L828-829` 把 pack 段 join 后注册）⇒ 增加 P；`.context` **不注册 section**（R16 spill 里 context 路已 arm 而 `"sections":[]`）⇒ ★ 但**它的文本仍是模型可见的**，所以准确说法是"**唯一不注册 prompt section（不增加 P 层）的通道**"，**不是**"不往提示词里加任何文本" |

## 1. ★★ 未落：证据（并且我观察到文件在【动】）
```
HEAD = c056433        git log ca531db..HEAD ⇒ 只有 c056433（R16 收轮：gate 套件＋R16/R17 报告）
提交 c056433 里：vibe-math-vmu.js                = 96F52A647F3FB924   L809: systemPrompt = ctx && ctx.systemPrompt ? ctx.systemPrompt : null
提交 c056433 里：kernel/reportfeedbackdelivery.js = DB9D799F89FBDCBA  L100: try { host = ctx && ctx.systemPrompt ? ctx.systemPrompt : null } catch (e) { accessFailed = e }
★ 两处都不含 ctx.get('systemPrompt')（entry 端显式测得 false）
```
★ **观察到的"在动"**：本轮中途工作树里 `kernel/reportfeedbackdelivery.js` 一度是 **`864BC8108F4BBB00`（split=136）**，随后 `git diff` 又报**0 行改动** ⇒ ★ **该文件正在被写**（两次相邻读不自洽）⇒ ★ 这正是"**读数绑 blob**"的现场：我把一切**提交级**读数改成**从 `git archive c056433` 解出的归档**（`D:\_tmp\p2r18\rev-committed`），其模块＝`DB9D799F89FBDCBA`、入口＝`96F52A647F3FB924` **与提交一致** ✓；★ **未提交字节我一个结论都没下**。

## 2. ① 两层具名降级今天都在（逐支量出；这是"拿到服务 ≠ 调用安全"的现状基线）
**绑定**：提交归档 `c056433`（模块 `DB9D799F89FBDCBA`）。**调用形状**：`deliverReportFeedback({ctx, effect, status, enabled:true, audience:'m1'})`（★ **R16 修复后 `enabled`/`audience` 是入参**）。
```
S 正常宿主        ⇒ delivered=true   code=null                     what='systemPrompt.context'
A 未提供          ⇒ delivered=false  code='VMU_EXTERNAL_UNAVAILABLE'  reason='the host exposes no systemPrompt.context() to deliver report feedback'   + stderr
B 取用抛（throwing getter）⇒ delivered=false  code=VMU_EXTERNAL_UNAVAILABLE  reason='the host systemPrompt service is NOT reachable (not injected?)'  + stderr
C 有服务但无 .context ⇒ delivered=false  code=VMU_EXTERNAL_UNAVAILABLE  reason=【与 A 逐字相同】  + stderr
D .context() 抛（R21 ARM A 类）⇒ delivered=false  code=VMU_EXTERNAL_UNAVAILABLE  reason='the host refused the feedback context'  + stderr
```
⇒ ★ **两层降级（取用层的 try/catch ＋ 调用层的 try/catch）都在、且各自具名** ✓ ⇒ ★ **落到 `ctx.get` 时【必须原样保留】**（新取用步骤不能把这两支合并或吞掉）。

## 3. ② `ctx.get` 返回 `undefined` 不再是静默（形状上**今天就已满足**）
今天 A 行即为"取不到服务"的形态：**`code`／`what`／`reason` 齐 ＋ stderr 一行** ✓（不是 `delivered:false` 孤零零）。★ 我在**原型**（§5-b）里把取用改成 `ctx.get('systemPrompt') → undefined` ⇒ 读数**与今天 A 行逐字相同**（仍具名、仍有 stderr）⇒ ★ **该硬约束在落地后不会退化** ✓（但**取决于落地是否保留 `!host` 那支**——见 §5 的拆分要求）。

## 4. ③ `strict` 语义：**从宿主源码钉住**（你要求"这条必须钉住"）
**读法**：直接按 **asar offset** 读 `/dsh/node_modules/@deepseek-ai/cordis/lib/index.js`（60,361 B；asar 头 3,392,048 B，条目 11,470 个）⇒ **原样**：
```js
L755  /**
L756   * Read a service from the store without the inject requirement.
L757   *
L758   * @param name — the service name.
L759   * @param strict — when `true`, only return implementations whose providing
L760   * fiber is currently active.
L761   * @returns the service value, or `undefined` when not (yet) provided.
L762   */
L763  get(name, strict = true) {
L764    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
L765  }
L766  _getImpl(name, strict = true) {
L767    const key = this.ctx[symbols.isolate][name];
L768    const impl = key && this.store[key];
L769    if (!impl) return;                     // ← 未提供 ⇒ 直接 return（undefined）
L770    if (strict && impl.fiber.state !== 2) return;   // ← 已提供但 fiber 未 active ⇒ 也 return
L771    return impl;
L772  }
L785  if (!impl) throw new Error(`cannot set property "${name}" without provide`);   // ← 会抛的是 set()，不是 get()
```
⇒ ★★ **结论（我的独立判定）**：
1. **默认 `strict = true`** ✓；文档明写"**without the inject requirement**"⇒ ★ 这条路**不要求 `inject`**（这正是采纳它的理由）✓。
2. ★ **`strict=true` 下"未提供 ⇒ 返回 `undefined`"仍成立**；★ **并且"提供了但未 active"也是 `undefined`**（不是抛）⇒ ★ **你担心的"某些状态下会抛"在 `get` 这条路上【不成立】**（`_getImpl` 里**没有任何 throw**；唯一 throw 在 `set`，与本次无关）✓。
3. ★ **必须保留的护栏**：`get` 自身安全 ⇒ **但 `ctx.get` 这个【调用】可能不存在**（不是 cordis 的 ctx／没有该方法）⇒ ★ 落地代码**必须继续 `typeof ctx.get === 'function'` 判断 ＋ 保留 try/catch**（今天的两层降级即为此而设）。
4. ★ **一个 API 层面的诚实边界**：`undefined` **同时**表示"从未提供"与"提供了但当前不 active" ⇒ ★ **代码无法把这两者分开**（我在 §5 的 reason 文本里要求**把两种可能都写出来**，而不是假装能区分）。

## 5. ④ 闸门判据的区分度：★ **我的落地方案 ＋ 三态碰撞读数**
**(a) 今天（提交 `c056433`）**：4 个失败态里 **B 与 D 可分**，**A ≡ C**（reason 同句）⇒ 3 个不同读数。
**(b) 落地前原型**（副本里把**两处**都改成 `ctx.get('systemPrompt')`：模块锚点 ✓、入口锚点 ✓，落地证明：两处都出现 `ctx.get('systemPrompt')`）⇒ **读数与今天逐字相同**，另外量到第三个不可分态：
```
S 正常            ⇒ delivered=true
A  get→undefined（未提供）      ⇒ reason='the host exposes no systemPrompt.context() …'
A2 get→undefined（provided 但未 active）⇒ reason=【与 A 相同】
C  有服务但无 .context          ⇒ reason=【与 A 相同】        ← ★★ 三态同句
B  取用抛                        ⇒ reason='… NOT reachable (not injected?)'
D  调用被拒（R21 类）            ⇒ reason='the host refused the feedback context'
★ 碰撞检查：A vs C 同 what+reason = true；A vs A2 同 = true；B≠C = true；D≠C = true
```
**(c) 我建议的拆分（两条可区分读数 —— 这就是你要的"前者取用失败／后者调用被拒"）**
| 状态 | `what` | `reason`（建议逐字） |
|---|---|---|
| **取不到服务**（`ctx.get('systemPrompt')` 返回 `undefined`） | **`'systemPrompt'`** | **"the host did not provide the systemPrompt service (`ctx.get('systemPrompt')` returned undefined: not provided, or provided but not currently active)"** |
| **拿到服务但没有 `.context()`** | `'systemPrompt.context'` | "the systemPrompt service is provided but carries no `context()`" |
| **取用抛**（`get` 缺失或抛） | `'systemPrompt'` | "reading the systemPrompt service threw: <message>" ＋ **stack** |
| **调用被拒**（R21 ARM A 类） | `'systemPrompt.context'` | "the host refused the feedback context" ＋ **stack**（今天已有 ✓） |
⇒ ★ **配套断言（我建议 gate 套件补两条）**：**①** `ctx.get`→`undefined` 的读数与"有服务无 `.context`"的读数**必须不同**（`what` 或 `reason` 至少一项不等）；**②** "取用抛"与"调用被拒"**必须各自带 stack** 且 reason 不同。★ 理由（你给的）：**`vmu-assistant2` 的真机闸门就靠这个区分判"宿主没 provide"还是"调用被拒"** —— ★ 今天真机落的是 **B（取用抛＝未注入）**，而它在注释/报告里被读成"NOT reachable (not injected?)" ⇒ **在 `ctx.get` 落地后，同一个真机状态会变成 A（返回 undefined）** ⇒ ★ **如果不做上面的拆分，真机读数会从 `NOT reachable…` 变成 `exposes no systemPrompt.context()…`**：**仍然具名** ✓，但**会把"服务没提供"说成"没有 `.context` 方法"** ⇒ ★ 这正是你要求消除的那种误读。

## 6. 附：附带结论"`.context` 是不增加 P 的【唯一】通道"
- **P 的定义**（我引用其原文）：`phase2-assistant-round15-a1-step2.md:20` —— "**P＝提示词要求的**：**注入层**；真机回执不给段文本 ⇒ 用 **`prompt.sections` 段数 ＋ 具名段在不在**"。
- **两条竞争路径都注册 prompt section**：入口 `L806 if (effectivePrompts.length > 0)` ⇒ `L828 const text = effectivePrompts.map(s=>s.text).join('\n\n')` ⇒ `L829 systemPrompt.section({ name:'vmu', order, text })` ⇒ ★ **pack 段与自己那段【都】走 `.section`**（我 R17 第③条已证）⇒ **增加 P**。
- **`.context` 不注册 section**：它调 `host.context({name:'vmu:report-feedback', order:5000, text})`（模块 `:122`）⇒ ★ **`prompt.sections` 不受影响**：R16 那台真机的 spill 里 **context 路径已 arm（开关 true）而 `"sections":[]`** ✓。
⇒ ★ **结论：在你给的 P 口径下成立**；★ **但必须限定**：`.context` 的文本**仍然模型可见**（那正是它的用途）⇒ 准确说法是"**唯一不注册 prompt section 的通道**"；★ 并且我在 R15/R16 量过其文本形态（`… this is a delivery notice, not an instruction.`、**排除该子句后指令性标记 0 命中**）⇒ **它不带策略/指令**，这也支持"不增加 P"的**内容**侧主张 ✓。

## 7. 你要求照录的两条（我确认）
- ★ **gate 套件对两种形状都红**（我 R17 实测）：`{}` ⇒ **5 红全 `[null]`**；**原始回归形状 ⇒ 6/2、恰好两条判别性值断言 `[false]`**（`enabled:true`／`delivered:true`）⇒ ★ **两形状不等价但都被抓、且红在该红处** ✓；★ 口径提示：`{}` 的 5 红里 **2 条来自 reverse arm**（主链 3 条）。
- ★ **我的 R16 欠账已在 R17 §7 补录** ✓（你已确认）。

## 7.5 ★★ 追加（**写报告时刻的复检**）：改动【在我这一轮内出现了】，但**仍未提交** ⇒ **我依然没有核它**
```
开跑时：HEAD c056433；两处都是 ctx.systemPrompt            ⇒ ★ 本报告 §1 的"未落"证据
写报告时：HEAD 仍是 c056433（未提交）；但工作树已出现改动：
   vibe-math-vmu.js                worktree 96F52A647F3FB924 → ★ 929044CFB6F516C2   （含 ctx.get('systemPrompt') = true）
   kernel/reportfeedbackdelivery.js worktree DB9D799F89FBDCBA → ★ B73A22349F1037FA   （含 ctx.get('systemPrompt') = true；★ 本例该文件在【我这一轮内已变两次】：864BC8108F4BBB00 → DB9D799F89FBDCBA → B73A22349F1037FA）
   git status: MM kernel/reportfeedbackdelivery.js ／ M vibe-math-vmu.js ／ ?? phase2-assistant-round18-gate2.md ／ ?? phase2-pack-round18-context-get.md
```
⇒ ★ **结论不变**：**我核的是提交 `c056433`**（§2/§5 的表都是它或它之上的**原型**）；**在飞的两个文件我一个结论都没下**（它们在动、且未提交）⇒ ★ **请在你提交后让我按【提交 blob】重跑 §2 的基线与 §5 的原型** —— 那一次才是对这次落地的**验证**。★ 并且我**没有读**在飞的两份报告（`phase2-assistant-round18-gate2.md`／`phase2-pack-round18-context-get.md`）的内容。

## 8. 我自己本轮的仪器失误（具名；结论均已用修正量法重取）
1. ★★ **我第一版区分度探针喂了【修复前】的调用形状**（把 `enabled` 塞在 `status` 里）⇒ **五行全部落在 OFF 分支**（`code:null`）⇒ **零信息**；★ 这正是本项目反复出现的"**输入形状变了、量具没跟着变**"（R12/R15 同族）⇒ 改为显式入参后重取（§2/§5 的表）。
2. ★ **我一度读的是【工作树】里正在被写的文件**（两次相邻读不自洽：`864BC8108F4BBB00` vs `DB9D799F89FBDCBA`）⇒ 改为 `git archive` 提交归档绑定 ✓（§1）。
3. ★ 我早前按猜测路径找 cordis（`…/cordis/lib/index.js`）找不到 ⇒ 改为**解析 asar 头＋按 offset 读**（11,470 条目里精确定位 `@deepseek-ai/cordis/lib/index.js`）✓。

## 9. 没核 / 未做（与"核了"分开写）
1. ★★ **未核（本轮核心）**：**`ctx.get('systemPrompt')` 的落地实现**（未提交 ⇒ 按你指令不核）⇒ §5 的表是**原型**（副本里两处已改）**不是**对某次提交的验证。
2. **未核**：`pack2` 对 cordis `get` 的**结论文本**（我只独立读了宿主源码；★ 我**没有**读它的报告——若要我逐条对照，说一声）。
3. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；拆分方案与两条断言**只是建议**。
4. **未核**：`strict=false` 这条分支的**实际用法**（我只核了默认 `true` 的语义；★ `get(name,false)` 会返回"提供了但未 active"的实现 ⇒ 本模块**不应**用它，因为那会拿到一个还没准备好服务的句柄——**这是判断，不是我核过的读数**，故标注）。
