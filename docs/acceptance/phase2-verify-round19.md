# Phase 2 · verify2 · Round 19 —— 按【提交 blob】复核 `9dc746e`（`ctx.get` 优先 ＋ 属性回退 ＋ 三态拆分的落地）

> 纪律：**只读复核**（真树只新增本报告）；探针在 `D:\_tmp\p2r19`（**副本制**）；**引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写。
> **被测版本（我逐个核过）**：`HEAD 9dc746e`；**开跑时 `git status` 空**；`vibe-math-vmu.js` **`CDCBA5C9875C86BA`（`split('\n')` = 1200）**；`kernel/reportfeedbackdelivery.js` **`B4969486C467E653`（161）**；`tests/b1prime-feedback-gate.test.mjs` **`765ED3B8725BA374`（94）**；`tests/vmu-assistant-systemprompt.test.mjs` **`64DC233DB53C5D73`**；`tests/vmu-assistant-e2e.test.mjs` **`8E7FAB128E33A007`**；`host.js` **`461D7FD499F016EA`（1167）**；`tests/run-tests.mjs` **`B988AF9351E9219C`（未变）**。
> ★ **绑定强度**：我用 `git archive 9dc746e` 解出归档并复算 ⇒ **归档入口 `CDCBA5C9875C86BA`／归档模块 `B4969486C467E653` 与工作树逐字节相同** ⇒ ★ **本轮读数就是这一版提交**（不是在飞状态）。

## 0. 结论速览
| 项 | 判定 | 关键读数 |
|---|---|---|
| **1 两处取用（`ctx.get` 优先＋属性回退）** | ✅ 落地形态正确，★ **且"回退是承重的"由我的定向变异证实** | 入口 `L812-813`／模块 `L112-113` **逐字**与你给的片段一致；★ **我自己把入口回退删掉**（副本）⇒ `systemprompt` **9 passed / 6 failed**（含 `the entry registered a host systemPrompt section … — 0`）、`e2e` **54/1**（`CHANNEL 1 … {"chars":0}`）⇒ ★ **与你的 9/6、chars:0 同向同值**；★ **gate 套件在变异下仍 8/0** |
| **2 三态拆分（我的 R18 方案）** | ✅ **按设计落地**（★ **但"0 碰撞"要修正为"5 态 0 碰撞、加 A2 后 1 处【刻意】碰撞"**） | S/A/A2/B/C/D 六态读数见 §3 ⇒ **排除 S 后碰撞 = 1，仅 `A↔A2`**；A vs B 靠 **stack（也靠 reason）**、A vs C 靠 **`what`（也靠 reason）**、C vs D 靠 **stack**、S vs C 靠 **`delivered`** |
| **2b `A2 ≡ A` 是否我认可** | ★ **我认可**（不是偷偷合并） | 宿主 `cordis` 的 `_getImpl` 对"未提供"与"提供了但 fiber 未 active"**都 `return`（都是 `undefined`）**⇒ ★ **API 无法区分** ⇒ reason 里**明写两种可能**才是诚实口径 ✓ |
| **3 `strict` 的用法** | ✅ **确实没传** | 全仓 `strict` 只出现在一处**无关注释**（`vibe-math-vmu.js:711` "STRICT INERTNESS"）⇒ 模块与入口**都没传**（用默认 `true`）✓ 与我的 R18 判断一致 |
| **连带：行数/门禁** | ✅ 但 ★ **入口正好 1200（贴线）** | `audit-code-size` **9 passed / 0 failed, exit=0**；`regen-all --check`（干净归档）**15/15 in sync, exit=0**；`systemprompt` **15/0**／`e2e` **55/0**／`gate` **8/0** ✓；★ 入口 `split('\n')` **= 1200** ⇒ **`> LIMIT` 为假**，故不越界，但**再多一行就会红**（`audit-code-size:52 "no framework file outside the recorded backlog exceeds 1200"`） |
| **连带：gate 套件"钉链路不钉字符串"** | ✅ 成立 | gate 套件 blob **自 R17 未变（`765ED3B8725BA374`）**，而本轮**改了 reason 文案** ⇒ 它**仍 8/0**（在 `9dc746e` 与在"删回退"的变异上都是 8/0）⇒ ★ **它钉的是"配置→回执→投递"链路，不是文案** ✓（你的解读成立） |

## 1. 落地与绑定（先落一行核验）
```
HEAD 9dc746e  feat(vmu): read the prompt service without requiring it, while keeping the host form that only exposes it as a property
git status --porcelain ⇒ 空
工作树入口 CDCBA5C9875C86BA　=　git archive 9dc746e 里的入口 CDCBA5C9875C86BA　（split 1200）
工作树模块 B4969486C467E653　=　归档里的模块 B4969486C467E653　（split 161）
```
★ **两处取用（逐字）**：入口
```js
L812  if (ctx && typeof ctx.get === 'function') systemPrompt = ctx.get('systemPrompt')
L813  if (!systemPrompt) systemPrompt = ctx && ctx.systemPrompt ? ctx.systemPrompt : null
```
模块
```js
L112  if (ctx && typeof ctx.get === 'function') host = ctx.get('systemPrompt')
L113  if (!host) host = ctx && ctx.systemPrompt ? ctx.systemPrompt : null
```
⇒ ★ **与你在任务里给的片段逐字一致**，且**属性访问那层仍带着自己的 try/catch**（入口 `:807-811`、模块 `:108-111` 的 `accessFailed` 分支都还在 ⇒ §3 的 B 行即是它）✓。

## 2. ① "回退不是装饰"：★ **我自己做了定向变异来核方向**（副本制）
**变异**：副本里**只把入口的回退行删掉**（`L813` → 注释；**模块的回退我没动** —— 那影响的是投递，不在这条通道上），其余不变：
| 套件 | CONTROL（`9dc746e` 原样） | **MUTANT（入口回退删除）** |
|---|---|---|
| `vmu-assistant-systemprompt` | **15 passed / 0 failed，exit=0** | ★ **9 passed / 6 failed，exit=1** |
| `vmu-assistant-e2e` | **55 passed / 0 failed，exit=0** | ★ **54 passed / 1 failed，exit=1** |
| `b1prime-feedback-gate` | **8 passed / 0 failed，exit=0** | **8 passed / 0 failed，exit=0** |
**变异下的原样失败行（节选）**：
```
FAIL the entry registered a host systemPrompt section (without one, this whole channel is dead) — 0
FAIL the host system prompt carries v5r-assistant-identity (byte-present, not claimed) — {"needle":"【你的位置：所办（对外接口）】…"}
FAIL the host system prompt carries v5r-assistant-reporting … ／ …-parameters …
FAIL and the assistant is told how to report and how to configure parameters, with the REAL key names
FAIL and what it is NOT: no research, no vote (v5r's two-layer split, agent.cordis.yml:74-86)
FAIL CHANNEL 1 (system prompt): the host section carries all three assistant persona sections — {"chars":0}
```
⇒ ★★ **方向核实**：**"只用 `ctx.get`" ⇒ 段注册 0、`chars:0`、两套件红**（**与你报的 9/6 与 chars:0 同向同值**）⇒ ★ **回退是承重的** ✓。★ 且 **gate 套件在两种情形下都 8/0** ⇒ **它守的是投递链路，不守提示词段通道**（两者互为独立证据面）✓。
★ **我 R18 那条"属性访问那层 try/catch 故意保留"** 与"**保留属性回退**"是两件事：**前者一直在**（今天读到的 `accessFailed` 分支即它），**后者**才是你第一版漏掉的 ⇒ ★ **你的自陈准确**。

## 3. ② 三态拆分：六态读数 ＋ ★ **一处修正**
**绑定**：提交模块 `B4969486C467E653`；调用形状 `deliverReportFeedback({ctx, effect, status, enabled:true, audience:'m1'})`。
| 态 | 构造 | `delivered` | `what` | `reason`（原样） | `stack` | stderr |
|---|---|---|---|---|---|---|
| **S** | `get→{context}` | **true** | `systemPrompt.context` | `null` | null | 无 |
| **A** | `get→undefined` | false | **`systemPrompt`** | `no host systemPrompt service was obtained: either none is provided, or one is provided but its providing fiber is not currently active (ctx.get cannot distinguish these)` | null | ✓ |
| **A2** | `get→undefined`（服务其实提供了但 fiber 不 active —— ★ API 上**与 A 不可分**） | false | `systemPrompt` | **与 A 逐字相同** | null | ✓ |
| **B** | `get` **抛** | false | **`systemPrompt`** | `the host systemPrompt service could not be READ (not injected?)` | **present** | ✓ |
| **C** | `get→{section}`（无 `.context`） | false | **`systemPrompt.context`** | `the host provided a systemPrompt service that carries no .context() to deliver report feedback` | null | ✓ |
| **D** | `get→{context: 抛}`（R21 类） | false | `systemPrompt.context` | `the host refused the feedback context` | **present** | ✓ |
**碰撞与判别（我的复算）**：
```
★ 排除 S 后的碰撞 = 1，且仅 [A,A2]
★ A vs B：stack 不同 = true（且 reason 也不同）；what 相同 = false  ← ★ 判别靠 stack（+reason），不靠 what
★ A vs C：what 不同 = true（且 reason 不同）                        ← ★ 判别靠 what（+reason）
★ C vs D：stack 不同 = true（且 reason 不同）                        ← ★ 判别靠 stack
★ S  vs C：delivered 不同 = true
```
⇒ ★★ **对你"`failure-state collisions = 0`"的修正（精确化，不是否定）**：**在你列出的 5 个【API 可区分】态（S/A/B/C/D）上，排除 S 后确实 0 碰撞** ✓；★ **但把 A2 加进来就有 1 处碰撞，且这处碰撞是【设计要求】的** —— 因为 `ctx.get` 对"未提供"与"提供了但未 active"**只能给同一个 `undefined`**（宿主源码 `_getImpl`：`if (!impl) return;` 与 `if (strict && impl.fiber.state !== 2) return;` **两条都返回 `undefined`**，见 R18 §4）⇒ ★ **代码若声称能区分二者，那才是缺陷**；现在 reason **把两种可能都写出来**（"either none is provided, or one is provided but its providing fiber is not currently active"）⇒ ★★ **这正是我认可的口径，不是偷偷合并** ✓（你在任务里问的正是这一点）。
★ 另附两条我量到的**比你列表更细**的地方：**A vs B 除 `stack` 外 `reason` 也不同**、**A vs C 除 `what` 外 `reason` 也不同** ⇒ **判别力比"各靠一项"更强** ✓。

## 4. ③ `strict` 的落地用法：**确实没传** ✓
全仓搜 `strict` 只有一处**无关注释**（`vibe-math-vmu.js:711 "ROUND 3 / task-20 B: STRICT INERTNESS"`，讲监听器惰性挂载）⇒ ★ **模块 `L112`／入口 `L812` 都调用 `ctx.get('systemPrompt')` 不传第二参** ⇒ **用默认 `strict = true`** ✓ ⇒ ★ **与我的 R18 判断（本模块不应传 `strict:false`）一致**。

## 5. 连带项（行数／派生面／gate 的守备面）
- ★ **入口 `split('\n')` = 1200（正好在界上）** ⇒ `audit-code-size` **9 passed / 0 failed，exit=0** ✓。★ **我读了那道门的判据**（`tests/audit-code-size.test.mjs`）：`LIMIT = 1200`（`:18`）；`:49 const over = framework.filter(f => lines(...) > LIMIT)` ＋ `:52 'no framework file outside the recorded backlog exceeds 1200 …'` ＋ `:56 rot check (every backlog file is still over)` ⇒ ★ **"没有别的文件被顶上界"正是 `:52` 覆盖的那条** ✓（**严格大于**才红 ⇒ **1200 不越界**）⇒ ★ **贴线风险具名**：入口**再 +1 行**就会触发 `:52`（除非进 backlog —— 而本项目**不许往 `KNOWN` 加名字**）。
- ★ **`regen-all --check`（`git archive 9dc746e` 干净副本）＝ `15/15 in sync`，exit=0** ✓ ⇒ ★ **R16 那处 14/15 确认是在飞写者造成的**（本轮提交干净时即 15/15）。
- ★ **gate 套件在改动后仍 8/0**（且其 blob 自 R17 起**未变**）⇒ ★ **它钉"配置→回执→投递"的链路，不钉文案** ⇒ **你的解读成立** ✓。

## 6. 我自己的仪器失误（具名）
1. ★★ **"临时目录不存在"导致门禁循环整段跑空**（`D:\_tmp\p2r19` 未建）—— ★ **这是我在本次会话中第三次犯同一处**（R15/R16 各一次）⇒ 记入我自己的清单：**探针脚手架必须先建临时根**（已改：本轮先 `New-Item -Directory`）。
2. ★ **本轮变异只删了【入口】的回退、没删模块的回退** ⇒ 所以变异下的 gate 8/0 是**预期**（投递链未受影响），**不能**拿它当"gate 对该变异无感"的证据；我在 §2 已把这一点写明（★ 若要测"模块回退也是承重的"，需另跑一臂 —— 见 §7 未做）。
3. ★ 我第一版门禁输出还试图用 `Substring` 打印空串而抛异常（PowerShell 侧），与 R15 同族 ⇒ 已改用"过滤空行取最后一行"的写法。

## 7. 没核 / 未做（与"核了"分开写）
1. **未核**：**模块侧**回退（`L113`）的承重性 —— 我只变异了**入口**那条（§6-2）；★ **要核它需另跑一臂**（删模块回退 ⇒ 预期 `b1prime-feedback-gate` 变红，因为投递会退回 `ctx.systemPrompt` 失败/成功取决于 fakeCtx）⇒ **未做**。
2. **未核**：`vmu-assistant2` 的**真机**闸门（本轮我一个真机会话都没跑）⇒ 本报告全部是**进程内真入口／模块级**读数。
3. **未核**：在飞报告 `phase2-assistant-round18-gate2.md`／`phase2-pack-round18-context-get.md`（R18 当时未提交时我只看到文件名）＋ 本轮的 R19 报告。
4. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；`regen-all` **写**／全量 sweep＝**归 Lead**。
