# 第二阶段 · assistant `round19`：**闸门第三次（`9dc746e`）—— ★ 通过；并首次给出【快照进入模型上下文】的宿主侧证据**

> 负责人：`vmu-assistant2`（**真机结论只由我声称**）。
> 读数绑：**四个 payload blob** —— 入口 **`CDCBA5C9875C86BA`**（87,553 B）、`host.js` **`461D7FD499F016EA`**、`kernel/receiptbounds.js` **`E4873BFBC9AAC0AB`**、`kernel/index.js` **`40291AA226AB9590`**；★ 运行窗口 **12:23:51 – 12:36:37**，期间 **HEAD 从 `9dc746e` 前进到 `3b84a45`（提交的是测试）但四个 payload 文件哈希全程不变** ⇒ 读数按 **blob 哈希**绑定；跑前/跑后逐字节核 **ALL EQUAL**（§6）。
> 硬约束：未跑全量／未 `regen-all`／未 git 写／未改码；凭据用完即删（§6）。夹具＝D1 固化的 `_handoff/vmu/r4-fixture.mjs`。

---

## 0. 结论（★ 三件必须分开报的事）
| # | 件 | 读数 | 判定 |
|---|---|---|---|
| ① | **结构件**（闸门） | `reportFeedback` 九键：**`enabled:true` ＋ `delivered:true` ＋ `registered:true`**（`source:"settings:vmu.report.feedback"`、`audience:"所办（office）"`、`code:null`、`what:"systemPrompt.context"`、`reason:null`、`stack:null`）；stderr **0 B**；`settings.resolved` 两键为 **true** / **"所办（office）"（source `config`）** | ★★ **闸门【通过】** ⇒ 才进入第三步 ✓ |
| ② | **桥接件**（快照是否真到模型） | ★★ **A 臂 3/3** 的会话里出现 **`user/message`（内容类型 `text`，`seq=9`）**，逐字为<br>`[vmu report feedback] audience: 所办（office） · reports declared: 2 · recorded: 0 · delivered: 0 · this is a delivery notice, not an instruction.`<br>★ **B 臂 0/3** 出现该文本 | ★★ **回路把快照送进了【模型可见上下文】**（A/B 形成干净对照）⇒ ★ 这比 R15/R16 的"我们侧成功"**更进一步**（R17 我标为边界的那一步，本轮**观测到了**） |
| ③ | **行为件**（S） | **C1＝A 0/3、B 0/3**（`vibe_vmu_report` 调用 0）；**C2＝A 0/3、B 0/3**；★ 而 **A2 的 `reasoning` 块**里模型**明确读到并主动放弃**：*"**The report feedback mentions reports declared: 2.** I'll skip vmu unless useful — actually, recording the finding as a record could be in-spirit ("records"). Hmm, but the task is a simple data task; adding vmu records is noise. **Skip.**"* | ★ **判定：「仍未建立」**（★ 闸门已过、快照已被看到、模型**主动选择不用** ⇒ 这是**有效负结果**，且比"没看到"强得多） |

★ **一句话**：**"回路已就位、快照已送达并被模型读到，但模型主动决定不用这条通道"** —— 这正是 R15 里**无法**得出的那句话，本轮**可以**说了。

## 1. 第一步：核修复已在 HEAD（只读，便宜）
```
git rev-parse --short HEAD           → 9dc746e
git log --oneline -1                 → 9dc746e feat(vmu): read the prompt service without requiring it, while keeping the host form that only exposes it as a property
Select-String vibe-math-vmu.js                      -Pattern "ctx\.get"  → L809-812（★ "TWO HOST FORMS…ctx.get reads WITHOUT the inject"；L812 `if (ctx && typeof ctx.get === 'function') systemPrompt = ctx.get('systemPrompt')`）
Select-String kernel\reportfeedbackdelivery.js      -Pattern "ctx\.get"  → L100-112（★ "READ THE SERVICE WITHOUT REQUIRING IT"；L112 `if (ctx && typeof ctx.get === 'function') host = ctx.get('systemPrompt')`）
```
★ 判据"两处都出现 `ctx.get`" **成立** ⇒ 进第二步 ✓
★ 附带读到的新具名分支（第三步判据要用）：`L117` `named('systemPrompt', 'the host systemPrompt service could not be READ (not injected?)', accessFailed)`、**`L126` `named('systemPrompt', 'no host systemPrompt service was obtained: either none is provided, or one is provided but its providing fiber is not current…')`**、`L134` `named('systemPrompt.context', 'the host provided a systemPrompt service that carries no .context()…')`、`L156` `named('systemPrompt.context', 'the host refused the feedback context', e)` ⇒ ★ **四种状态各有具名文本**，本轮实测落在**成功分支**（`L154`）。

## 2. 第二步：闸门会话（1 次）
- 会话 `session-41a540ab-0a3b-4f20-95da-b97ebd96af66`｜**12:23:51**（25 s，**83,500 tokens**，driver exit 0）｜端口 7870｜配置＝P-clean ＋ `vmu.report.feedback:true` ＋ `audience:'所办（office）'`（**与 B 只差这两行**）。
- **逐字**（同一份回执；来源＝**该会话自己的 HOST SPILL**，148,080 B）：
```
# 设置侧
"vmu.report.feedback":{"value":true,"source":"config","hot":"H1","who":"office","overridden":[]}
"vmu.report.audience":{"value":"所办（office）","source":"config","hot":"H1","who":"office","overridden":[]}
# 投递侧（九键全量）
"reportFeedback":{"enabled":true,"source":"settings:vmu.report.feedback","audience":"所办（office）",
                  "delivered":true,"registered":true,"code":null,
                  "what":"systemPrompt.context","reason":null,"stack":null}
```
- **四态判定表（Lead 给的）**：`delivered:true ＋ enabled:true` ⇒ ★★ **闸门通过** ✓；另三态（"取不到服务"／"拿到但不带 `.context`"／"取用抛或调用被拒"）**本轮均未出现** ⇒ 无需处理二义性（★ 且 `stack:null` ⇒ 没有任何抛错路径被走到）。
- 其余：**stderr 0 B** ✓；**M = 1 条** sink（`turn-end-duty`）；**`prompt.sections = []`（0 段**，P-clean 成立）；`promptSection = {"registered":false,"code":null,"reason":null}` ⇒ ★ **`code:null` 是"没有声明"而非"声明了投递失败"**（本装配 `effectivePrompts` 为空，该分支根本没跑）——与 R42 的"没声明 ≠ 声明了注入失败"一致。

## 3. 第三步：A×3／B×3（★ 只有闸门通过后才跑）
| 臂 | 会话 | 时刻 | 时长 | tokens | **M** | **C1**（`vibe_vmu_report`） | **C2** | **桥接（快照在上下文里）** |
|---|---|---|---|---|---|---|---|---|
| **A** feedback ON | `session-ed1b69c3-8a65-4d2f-a4af-488ee1cb4861` | 12:25:06 | 121 s | 130,027 | 1 | **0** | 无 | ★ **有**（`user/message`/text/seq=9） |
| | `session-3a144dd9-379c-483c-962e-8941ed70fc2c` | 12:28:33 | 130 s | 173,375 | 1 | **0** | 无 | ★ **有**（同上；且模型在 `reasoning` 里复述了它） |
| | `session-c0541f25-153a-456b-bc43-e886a41d5689` | 12:32:17 | 80 s | 142,515 | 1 | **0** | 无 | ★ **有**（同上） |
| **B** feedback OFF | `session-05b099f4-6526-4c89-90cb-967292fe5fbc` | 12:27:17 | 65 s | 94,953 | 1 | **0** | 无 | **无**（0 处） |
| | `session-4649cbb8-18d9-4626-88d7-c2f27106a404` | 12:30:51 | 77 s | 98,707 | 1 | **0** | 无 | **无**（0 处） |
| | `session-3ef570e8-145a-464b-99bf-198c4c6c8df2` | 12:33:47 | 170 s | 166,373 | 1 | **0** | 无 | **无**（0 处） |
**汇总（★ 不许只报最好的一次）**：**C1 ＝ A: 0/3、B: 0/3**；**C2 ＝ A: 0/3、B: 0/3**；**M ＝ 6/6 各 1 行**；**P ＝ 6/6 `prompt.sections=[]`（0 段）**；6/6 `turn/end=completed`；★ **桥接 ＝ A: 3/3 有、B: 0/3 无**。
**★ 桥接的逐字证据（A 臂 3/3 同一形态）**：
```
event.type=user/message  seq=9  content kinds=["text"]
… Approval policy: ask. … [vmu report feedback] audience: 所办（office） · reports declared: 2 · recorded: 0 · delivered: 0 · this is a delivery notice, not an instruction.
```
★ 即 **宿主把它作为一条【用户角色的文本消息】放进了模型上下文**（不是我们自报的成功）；**B 臂同位置无此文本** ⇒ **A/B 对照成立** ✓
**★ 模型侧的处置（A2 的 `assistant/message`，内容类型含 `reasoning`，原样）**：
> *"…This task is a simple file task; not needed. But the task has a math-verification flavor. I could record the proposition via vibe_vmu_records... That might be gratuitous. **The report feedback mentions reports declared: 2.** I'll skip vmu unless useful — actually, recording the finding as a record could be in-spirit ("records"). Hmm, but the task is a simple data task; adding vmu records is noise. **Skip.**…"*
⇒ ★ ① **快照确实被读到**（模型逐字复述了 `reports declared: 2`）；② 模型**权衡过 vmu 面**（考虑 `vibe_vmu_records`）并**主动放弃**；③ **它考虑的不是报告通道**，且**没有发起任何调用** ⇒ ★ **C1 仍是 0**（我的冻结判据要求"发生调用"），但这一条是**新的、更软的数据**（"考虑后放弃"≠"从未想到"），**照实单列**，不并进 C1。

## 4. 判定、限定与"什么会改判"
**判定：★ 「仍未建立」（有效负结果）** —— 因为 **闸门已过**（结构件）、**快照已被模型读到**（桥接件）、**6 次里 0 次使用通道**（行为件）。
**限定（照旧必写）**：
- **n＝3/臂 ⇒ 提示性**；**"没观察到" ≠ "不能"**；**单模型／单版本 ⇒ 不外推**。
- ★ **任务确实有"值得说的进展"**：R44 的真实卡点夹具（重复的 `17` ＋ `n/a`，天真求和 117 ≠ expected 100）⇒ **6/6 都撞到并在最终文本里写明** ⇒ "任务太短/无事可说"这条边界**已被排除**。
- ★★ **本轮的"不用"是模型【主动选择】的结果，且它给了理由**（"a simple data task; adding vmu records is noise"）⇒ ★ **因此剩下的未知量不是样本量，而是【任务形态】**：**什么样的任务会让它认为"值得通过通道说一声"**。
**什么会改判**：A 臂任一回合出现**非任务要求**的 `vibe_vmu_report` 调用（C1）或**超出任务要求**的面向人汇总（C2）⇒ 立即升 **「已建立（附 n 与次数限定）」**。

## 5. 残差声明（三条路径 ＋ 宿主边界；★ 本轮更新第 3 条）
| # | 路径 | 形态 | 最新真机状态 |
|---|---|---|---|
| 1 | **`packs/*/prompts`** | ★ **join 进 `effectivePrompts` 后仍走同一个 `systemPrompt.section(...)`**（**非独立路** —— R18 更正，我已读码确认） | 回执里的 `prompt.sections` 是**我们自己的声明记录**；同份回执 `promptSection.registered:false` ⇒ "**记录满、注册败**" |
| 2 | **`systemPrompt.section`** | 入口段注册 | 本轮 P-clean 下**未声明**（`code:null`）；v5r 装配下多轮 **`registered:false`**（`VMU_EXTERNAL_UNAVAILABLE`） |
| 3 | **`systemPrompt.context`** | 投递 `vmu:report-feedback`（order 5000） | ★★ **本轮（R19）【已投递，且宿主把它作为 `user/message` 放进了模型上下文】**（A 3/3；B 0/3）⇒ ★ **从 R16 的"已触达且具名失败"更新为"已送达且可在模型上下文中看到"** ✓ |
**未覆盖（＝宿主边界）**：★ **宿主自身拼接的提示词未枚举** ✓（不变）。
★ 口径不变：凡声明"某段文本到了模型"必须写明走哪条路径；**不得**用路径 3 的成功当路径 2 的证据。

## 6. 证据纪律与成本
- **D1 夹具**：跑前打印 **`MISMATCH — the scratch payload is NOT HEAD; re-sync before running`**（scratch 入口 `96F52A647F3FB924` ≠ HEAD `CDCBA5C9875C86BA`）⇒ **随即同步并复核 ALL EQUAL**；跑后仍 ALL EQUAL ✓（★ 连续第三轮救场）。
- **多帧解码**：闸门 16 帧；6 臂分别 **31/31/38/30/38/42 帧**（一次性解压只出 2 行）。
- **读的哪一份**：结构读数全部取自**该会话自己的 HOST SPILL**；桥接证据取自**会话事件流**（`user/message` 原文），两者分开标注 ✓
- **凭据**：复制 **1 次**（`D:\_tmp\r18-home\.credentials.yaml`，**路径已报**）⇒ **用完即删**（现 `D:\_tmp` 全盘 `.credentials*` ⇒ **none**；操作者 profile 未动 ✓）
- **宿主/端口**：全停；`7700–7900` **无监听**（本轮 7870–7876）✓
- **成本**：★ 先估闸门 60–90k ＋ 6 臂 0.6–0.9M ≈ **0.7–1.0M** ⇒ **实际 889,450 tokens**（83,500 ＋ 130,027＋173,375＋142,515＋94,953＋98,707＋166,373）⇒ **在估算区间内** ✓
- **隔离**：我只新增**本报告**；★ 在飞文件均非我（跑前后 `git status` 1→4→0 行，含他人提交）；**未跑全量／未 `regen-all`／未 git 写／未改码**。

## 7. 交办 / 下一步（★ 只剩"任务形态"这条）
1. ★ **通道侧已闭环**（结构＋桥接＋行为三件都量到了）：**无需再修**。
2. ★ **剩下的可做实验（设计层，未执行）**：换**任务形态**看模型是否认为"值得通过通道说一声"——例如：**多轮/长任务**、**出现必须让别人知道的卡点**、**交付物面向他人**（受众≠自己）；或**给通道一个"回报"**（有人回应）。★ 这些**都要改任务/部署**，不在我写范围，需你裁。
3. ★ **不建议**单纯加大 n：本轮模型自陈的理由是**任务性质**（"simple data task…noise"），**不是随机波动** ⇒ 加 n 只会重复同一个观察。
