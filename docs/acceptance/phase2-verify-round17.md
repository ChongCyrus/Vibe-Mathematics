# Phase 2 · verify2 · Round 17 —— 独立复核 R16 的【闸门结果】与那条【宿主边界】判定

> 纪律：**只读复核**（真树只新增本报告；★ **gate 套件文件仍是 `A`（在飞）** ⇒ 按 blob 绑）；探针在 `D:\_tmp\p2r17`（**副本制**）；**引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写。
> **★ 先记我自己的欠账**：**R16 的报告我没有落盘**（那一轮以一条命令失败收尾）⇒ ★ 我把 R16 已核实的三组读数**补在本报告 §6**（不算在他人的读数里，也不算"没做"），并**具名这次遗漏**。
> **被测版本**：`HEAD ca531db`；`kernel/reportfeedbackdelivery.js` **`DB9D799F89FBDCBA`（130 split-lines）**；`vibe-math-vmu.js` **`96F52A647F3FB924`（1196）**；`kernel/report.js` **`8B242E283EF7A74F`**；`host.js` **`461D7FD499F016EA`**；`tests/b1prime-feedback-gate.test.mjs` **`765ED3B8725BA374`（94 split／93 行）`、`git status` 里是 **`A`（在飞）**；`run-tests.mjs` **`B988AF9351E9219C`**。
> ★ **在飞写者**：`README*`／`docs/AUDIT-CHECKLIST.md`／`docs/test-timing.md`／`17-objective-status.md`（`M`）＋ `phase2-accept-round16.md`／`phase2-assistant-round16-gate.md`／`phase2-comms-round16-feedback-gate.md`／`tests/b1prime-feedback-gate.test.mjs`（`A`）＋ 两份 R17 报告（`??`）⇒ 我只读，且**把 gate 套件按其 blob 绑定**。

## 0. 结论速览
| 项 | 判定 | 关键读数 |
|---|---|---|
| **1 修复在真机生效（两面一致）** | ✅ **我用自己的手复读了它的 spill** | spill **仍在盘上**：`…/dsh-spill-w6eDF1/session-0b031b2452b4/41c89aa82c3b-vibe_vmu_status.txt` **149,430 B**（与其报告同）sha16 **`103102455260814C`**；设置侧 `{"value":true,"source":"config",…}` ＋ `"所办（office）"`；投递侧 **`enabled:true`／`source:"settings:vmu.report.feedback"`／`audience:"所办（office）"`** ⇒ ★ **R15 的 `false/default/null` 已消失** ✓ |
| **2 剩余阻塞＝宿主边界（因果）** | ✅ **读码成立** | `inject = ['tools']`（**无** `systemPrompt`）⇒ `ctx.systemPrompt` **访问即抛**（`cannot get property "systemPrompt" without inject`）⇒ 模块 `accessFailed` 支（`:94`）⇒ `delivered:false`＋`code:VMU_EXTERNAL_UNAVAILABLE`＋`what:'systemPrompt.context'`；stack 的 `:94`＝该访问行、`vibe-math-vmu.js:853`＝投递调用 ✓ |
| **2b "本宿主上不可能 `delivered:true`"** | ★ **对【当前实现】成立；但我要给一条未验的替代路** | 两条提示词缝（`.section` L829／`.context`）都要这个未注入的服务，入口**未引用**其它宿主缝 ⇒ 当前实现确实到不了；★ **可能**的替代是既有的**宿主 waterfall 桥**（`wrapHostWaterfall`／`prompt/assemble`）—— ★ **我未验证它能到模型** |
| **3 对照证据（"pack/prompt 那条路能到模型且不过 `ctx.systemPrompt`"）** | ★★ **不成立（我的发现）** | 入口 `L828-829`：`const text = effectivePrompts.map(s=>s.text).join('\n\n')` ⇒ **一个** `systemPrompt.section({name:'vmu',…})` ⇒ **pack 段【就是】走 `.section`**；回执里的 `prompt.sections`（`L534 sections:[...packSections,...promptSections]`）是**我们自己的声明记录**，不是宿主接收读数；★ 其报告 §2 第一条**自己**写着 `.section` 在同一宿主上 `registered:false`＋同一 reason ⇒ **自相矛盾** |
| **4 闸门会话其余读数** | ✅（部分**未核**，见下） | 同一 spill：**`"sections":[]`** ⇒ P-clean 前提 ✓；`"published":[…,"vibe_vmu_report"]` ✓；★ 模型文本里逐字出现 `delivered":false` ⇒ **照实贴出** ✓；★ **未核**：C1 的"调用的工具＝3／原始计数＝1"（`session-0b031b2452b4` 的**会话日志已不在盘上** ⇒ 我数不了调用）＋ M=1／`turn/end`（那是转录读数，**spill 里没有**） |
| **5 成本说法有依据** | ✅ | 其报告 §4 **同页**给了预估（闸门 1 次 ≈60–85k；6 次 ≈0.6–0.9M）⇒ 有依据；★ **我的经验锚**：R15 那 6 次实测合计 **620,690 tokens** ⇒ 落在 0.6–0.9M 带内 ✓；闸门实花 **84,542**（在其 60–85k 预估的上沿 ✓） |
| **★ 顺带：gate 套件有没有牙** | ✅ **有牙，且覆盖原始形状** | 真树 **8 passed / 0 failed, exit=0**；★ **它那臂（provider→`{}`）我复现：5 FAIL，全部 `[null]`**；★★ **我另造"原始回归形状"（provider→完整 9 键 off 态）⇒ 6 passed / 2 failed，恰好两条判别断言 `[false]`**（`enabled:true`／`delivered:true`）⇒ **原形状也被抓** |

## 1. ① 两面一致：**我用自己的手复读了它引用的 spill**（不是转述）
```
spill = …\dsh-spill-w6eDF1\session-0b031b2452b4\41c89aa82c3b-vibe_vmu_status.txt   149,430 B   sha16=103102455260814C
settings.resolved["vmu.report.feedback"] = {"value":true,"source":"config","hot":"H1","who":"office","overridden":[]}
settings.resolved["vmu.report.audience"] = {"value":"所办（office）","source":"config","hot":"H1","who":"office","overridden":[]}
reportFeedback = {"enabled":true,"source":"settings:vmu.report.feedback","audience":"所办（office）",
                  "delivered":false,"registered":false,"code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt.context",
                  "reason":"the host systemPrompt service is NOT reachable (not injected?)",
                  "stack":"Error: cannot get property \"systemPrompt\" without inject\n … deliverReportFeedback (…reportfeedbackdelivery.js:94:27) … vibe-math-vmu.js:853:25 …"}
```
⇒ ★ **逐字与其报告一致**（我复读，不是采信）✓；★ 并注意：**"两面一致"是对 `enabled`/`source`/`audience` 而言**，`delivered` 仍为 `false`（见 ②）⇒ 其措辞**准确** ✓。

## 2. ② 宿主边界的因果：**读码成立**
- `vibe-math-vmu.js:54 export const inject = ['tools']` ⇒ ★ **没有注入 `systemPrompt`**；cordis 代理对**未注入服务**的属性访问**本身抛错**（本项目已在 `tests/vmu-prompt-section-guard.test.mjs` 把这条宿主事实钉住）⇒ 模块 `:94` 的 `ctx.systemPrompt` 访问进入 `accessFailed` ⇒ `reason:'…NOT reachable (not injected?)'` ＋ **stack 非空** ⇒ ★ **因果链完整、且 stack 的两帧我逐行核过**（`:94`＝该访问行；`vibe-math-vmu.js:853`＝`deliverReportFeedbackFrom({kernel, ctx, effect})`）✓。
- ★ **"按当前实现本宿主上不可能 `delivered:true`"**：**成立**（当前实现只有两条注入缝，且都要该服务；入口未引用任何其它宿主缝）。★ **但我补一条限定**：仓里存在**宿主 waterfall 桥**的机制（`wrapHostWaterfall`，`prompt/assemble` 属宿主词表）⇒ **理论上**有一条不经 `inject` 的路 —— ★ **我没有验证它能否把文本送到模型** ⇒ 所以准确说法是"**当前实现**做不到；**替代路存在候选，未验**"。

## 3. ③ 那条对照证据：★ **不成立**（这是本轮我最重要的一条发现）
| 其主张 | 我的读数 |
|---|---|
| "pack/prompt 那条路**不经过** `ctx.systemPrompt`"（其 §2 `:46`） | ★ **反了**：入口 `L825-831` 把**所有** pack 段合并成**一段文本**，用 **`systemPrompt.section({name:'vmu', order, text})`** 注册 ⇒ **pack 段就是走 `.section`**（=同一条需要该服务的缝） |
| "R43/R44 武装臂 `prompt.sections` = 59 段 ⇒ 那条路能到达模型" | ★ **该字段是"我们声明的段"**：`vibe-math-vmu.js:534 sections: [...packSections, ...promptSections]`（本回执的 `"sections":[]` 正是"没装 pack ⇒ 0 段"的读数）⇒ 它**不**证明宿主接收了它们；**宿主接收**与否看的是 `promptSectionState.registered`（`:832`／`:834`） |
| 同一报告 §2 **第一条** | ★ **它自己写着**：入口的 `.section` 路径在同一宿主上**一直**是 `{registered:false, code:'VMU_EXTERNAL_UNAVAILABLE', what:'systemPrompt', reason:'cannot get property "systemPrompt" without inject'}` ⇒ ★ **与 `:46` 的对照主张直接矛盾** |
⇒ ★★ **结论**：`prompt.sections=59` **不能**证明"存在一条已工作的、绕过 `inject` 的提示词路"；据此提出的建议（"让回路走那条路"）**缺乏证据**——**当前代码里没有这样一条已证可达的路**（`L828-829` 恰好就是它以为绕开的那条缝）。

## 4. ④ 闸门会话其余读数（哪一条我核了／哪一条没核）
- ✅ **`"sections":[]`**（同一 spill）⇒ **P-clean 前提成立** ✓；✅ **`"published":[…,"vibe_vmu_report"]`** ⇒ 报告面在（`registeredTools` 同名）✓；✅ ★ **模型把坏消息照实贴出**：spill 的转录区出现 `delivered":false` ⇒ 与"未掩盖"一致 ✓。
- ★ **未核（具名）**：**C1**（"调用的工具＝3／原始计数＝1 但属任务要求"）—— `session-0b031b2452b4` 的**会话日志（zstd）已不在盘上**（我在 `_tmp/r18-home/{sessions,storages}` 下按会话 id 搜到 **0 个文件**）⇒ **我数不了调用次数** ⇒ 该条**保持为其读数**；★ **M=1／`turn/end=completed`** 亦**未核**（那是**转录**读数，**spill 是状态回执**，不含这两项）。
- ★ 其"没有把那 1 算成 S"这一点：**口径上正确**（任务明写要调用一次 `vibe_vmu_status`；把它记 C1 是口径噪声）—— ★ 但**我核不了原始计数**（上一行）。

## 5. ⑤ 成本说法有依据（并附一条经验锚）
★ 其报告 §4 **同页**给出预估：**闸门 1 次 ≈60–85k**；**若通过再跑 6 次 ≈0.6–0.9M** ⇒ ★ **"省下 0.6–0.9M"有依据（预估在同一报告内）** ✓。
★ **我加的经验锚**：R15 那 **6 次行为会话的实测合计** ＝ 99,577＋112,574＋91,546＋74,792＋87,850＋154,351 ＝ **620,690 tokens** ⇒ 落在其 **0.6–0.9M** 带内 ✓（其闸门实花 **84,542**，恰在其 60–85k 预估的**上沿** ✓）。
★ 口径提示：省下的量是**机会成本**（未发生的那 6 次），**不是**账面上的节省 ⇒ 表述上宜写"**因闸门不过而未支出**"。

## 6. ★ 顺带：`tests/b1prime-feedback-gate.test.mjs` 有牙，且**覆盖原始形状**
| 臂 | 构造（副本制，锚点＝`vibe-math-vmu.js` 的 `reportFeedback: () => Object.assign({}, reportFeedbackState),`） | 读数 |
|---|---|---|
| 真树 | — | **`=== B1PRIME FEEDBACK GATE: 8 passed, 0 failed ===`，exit=0** ✓（与其自报一致） |
| **它那臂** | provider → **`() => ({})`** | **3 passed / 5 failed**，5 条 FAIL **全部 `[null]`**（"回执不见了"） ⇒ ★ **我复现其读数** ✓ ⇒ 其自陈"**逐形状重演未取得**"**属实** |
| ★★ **我另造：原始回归形状** | provider → **完整 9 键 off 态**（`enabled:false,source:'default',audience:null,delivered:false,…`） | **6 passed / 2 failed**，恰好两条**判别性值断言**：`config ON ⇒ enabled:true`（`[false]`）／`CONFIG → RECEIPT → DELIVERY: delivered:true`（`[false]`） |
**★ 对 Lead 问题的判断：两种形状【不等价】，但 gate 对【两者都红】。**
- **不等价**：`{}` ⇒ 回执**整体消失**（连"有没有回执"都红，5 条）；原始回归 ⇒ **回执形状完好、值错**（只有**值断言**能抓，2 条）⇒ 这正是它自陈"未取得"的那点，**诚实**。
- **但没被掩盖**：我的第二臂证明**原始形状确实会被抓**，且**红在应当红的值断言上**；★ 另外**当前真机的状态**（`enabled:true`／`delivered:false`）同样会被 `delivered:true` 那条打红 ⇒ **闸门对"宿主边界"这一现状也是有牙的**。
- ★ 一处口径提示：`{}` 那 5 条里有 **2 条来自 reverse arm**（它也需要回执存在）⇒ **"5 红"不等于"主链 5 条全红"**（主链 3 条）。

## 7. ★ R16 的三组读数（**补录：那一轮我没写报告**，故在此具名归档；绑定同 §0）
1. **环真的破了（我自己的计数探针，同配置只换修订）**：`ca531db^` ⇒ ON：**`context()` 0 次**、回执 `{enabled:false,source:'default',audience:null,delivered:false}`；**`ca531db`** ⇒ ON：**`context()` 恰好 1 次**、回执 `{enabled:true,source:'settings:vmu.report.feedback',audience:'m1',delivered:true,registered:true,code:null}`；**OFF** ⇒ 0 次＋`delivered:false`（零机制）；**UNSET** ⇒ 0 次＋`enabled:false`（**默认关**）；**ON＋受众为空** ⇒ 0 次＋`code:'VMU_EXTERNAL_UNAVAILABLE'`（**具名失败**）✓。
2. **派生面：工作树 14/15 是【在飞】造成的，不是提交的**：`regen-all --check` 在**工作树**＝**14/15 exit=1**（`FAIL documented counts (README / checklist) :: update-doc-counts: the scoped line for docs/11 was NOT rewritten`），而在 **`ca531db` 的干净 `git archive` 副本**与 **`ca531db^` 的干净副本**里**都是 15/15 exit=0** ⇒ ★ **陈旧来自在飞写者（新增未跟踪文件/未提交的 README·checklist 改动），不是 `ca531db` 的提交** ✓。
3. **1108 → 1110 wired 正是那两个新键，且有机制**：`fcc84f8^` 里两键**无行**；`fcc84f8` 新增**恰好 2 行**且都是 **`✅ 已接线`**、载体 **`kernel/report.js`**（生成物）；同提交把 `docs/00` 的 `键 1115→1117`／`vmu.report.* 11→13` 一并更新 ⇒ ★ **算术自洽（+2 键／+2 行／+2 wired）**，机制＝**Part A 在 `report.js` 加了两处 `sget` ⇒ 生成器的"有字面读取即 wired"把它判为已接线** ✓（不是手改表格）。
★ **附一条 R16 未及写下的观察**：修复后模块头注释**与自身新设计矛盾** —— `L18-19` 仍写"it does NOT read settings … passes the ASSEMBLED face's status"，`L27-28` 仍写"**one** exported function … (`ctx`, `effect`, `status`)"，而 `L39-44`／`L62-69` 明写"**THE SWITCH COMES FROM THE KERNEL'S RESOLVED SETTINGS**"且现在有**两个**导出 ⇒ ★ **注释该更新**（代码行为已由我的探针验证为新设计，**不是**行为缺陷）。★ 另：其 item 3(a) 担心的"孤儿 ` *`"——我读了三个 JSDoc 块（`:31`／`:34-45`／`:61-73`）**都开闭完整**，`node --check` **exit=0**；★ 但我那次**词法检查脚本自己坏了（引号）**，所以"全文件词法平衡"我**没有完成验证**（**具名**）。

## 8. 没核 / 未做（与"核了"分开写）
1. **未核**：闸门会话的 **C1 调用计数**与 **M=1／`turn/end`**（§4：会话日志已不在盘上；spill 不含这两项）。
2. **未核**：**替代路**（宿主 waterfall 桥／`prompt/assemble`）能否把文本送到模型 —— 我**只指出候选**，未构造、未验证。
3. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；`regen-all` **写**／全量 sweep／修 `README` 计数＝**归 Lead**。
4. **未核**：R17 在飞的两份报告（`phase2-assistant-round17-boundary.md`／`phase2-pack-round17-context-access.md`）**内容**（只看到文件名）。
