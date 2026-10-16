# Phase 2 · verify2 · Round 20 —— 独立复核 A1 第二步的【决定性读数】（结构件／桥接件／行为件）

> 纪律：**只读复核**（真树只新增本报告）；探针在 `D:\_tmp\p2r20`（**副本制**）；**引用前先落一行核验**、**每个读数绑 blob／绑会话 id**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写／未跑真机。
> **★ 口径（按你的要求，三件始终分开报）**：**结构件（闸门）／桥接件（模型可见）／行为件（模型是否用）**，**M／P 不并进 S**，**"没观察到" ≠ "不能"**，**单模型单版本不外推**。
> **绑定**：★ 其窗口内 HEAD 到 **`3b84a45`**（提交的是测试）；★ **四个 payload blob 我逐个核过**（工作树 == `3b84a45` == 其声称）：入口 **`CDCBA5C9875C86BA`**／`host.js` **`461D7FD499F016EA`**／`kernel/receiptbounds.js` **`E4873BFBC9AAC0AB`**／`kernel/index.js` **`40291AA226AB9590`** ⇒ **payload 全程冻结成立** ✓。

## 0. 结论速览（★ 三件分开）
| 件 | 其主张 | **我的独立读数** | 判定 |
|---|---|---|---|
| **① 结构件（闸门）** | 九键 `enabled:true`／`delivered:true`／`registered:true`…；stderr 0 B | ★ **同一份 spill 我逐字节复读**（**148,080 B**、sha16 **`B92497892EBC67D6`**）：**九键 9/9 MATCH**（`source:"settings:vmu.report.feedback"`、`audience:"所办（office）"`、`code:null`、`what:"systemPrompt.context"`、`reason:null`、`stack:null`）＋ 设置侧 `{value:true,source:"config"}` ＋ `"sections":[]` ＋ `promptSection:{registered:false,code:null,reason:null}` | ★★ **闸门通过——成立** ✓（`stderr 0 B` 属**驱动输出**，见 §1 未核） |
| **② 桥接件（模型可见）** | A 臂 3/3 出现 `user/message`／`text`／`seq=9`，逐字为那条快照；B 0/3 | ★ **我在 6 份会话日志上自己数**：**A = 1/1/1 处（3/3）**，**载体事件类型＝`user/message`、`seq=9`、`content[].type="text"`**；**B = 0/0/0（0/3）** ⇒ ★ **对照干净** | ★★ **成立**，★ 但**机制要说得更准**（见 §2：**快照是拼进宿主的「Current runtime context」块**，该块以 `user/message` 投递） |
| **③ 行为件（S）** | C1 = A 0/3、B 0/3；C2 = 0/3、0/3；M 6/6 各 1 行；P 6/6 `sections=[]`；`turn/end` 6/6 completed ⇒ **「仍未建立（有效负结果）」** | ★ **C1：我用【事件级】计数复算 ⇒ 6 个会话里【命名 `vibe_vmu_*` 的调用事件 = 0】** ✓；★ `turn/end` 6/6 `completed` ✓；★ **P 与 M 我核不到臂级原始件**（见 §3 的限度） ⇒ ★ **"有效负结果"我判定【成立】**（理由与边界见 §3） |
| **④ 模型自陈引文** | A2 的 reasoning 逐字含那段 | ★ **5 个片段全部 FOUND**（含 "The report feedback mentions reports declared: 2."／"adding vmu records is noise"／"Skip."）⇒ ★ **引文属实** ✓，且原文**还多出一句**（见 §4） |
| **⑤ 成本与卫生** | 889,450 tokens；夹具第三次救场；凭据删除；宿主停／无监听 | ★ **成本求和＝889,450**（我复算）✓ 在其 0.7–1.0M 估算内；★ `.credentials*` under `D:\_tmp` ⇒ **none** ✓；★ 7700–7900 **无监听** ✓；★ **夹具那两个哈希我核过**（`96F52A647F3FB924` = `9dc746e` **之前**的入口；`CDCBA5C9875C86BA` = `9dc746e` 的入口）⇒ **它拦的确实是"过期载荷"** ✓ | ★ **卫生读数成立** |

## 1. ① 结构件：闸门（我复读了它引用的那份 spill）
```
spill = …\dsh-spill-znN1wd\session-edff4cbaa4b7\e3d352cb68ca-vibe_vmu_status.txt   148,080 B   sha16=B92497892EBC67D6
settings.resolved["vmu.report.feedback"] = {"value":true,"source":"config","hot":"H1","who":"office","overridden":[]}
settings.resolved["vmu.report.audience"] = {"value":"所办（office）","source":"config",…}
reportFeedback = {"enabled":true,"source":"settings:vmu.report.feedback","audience":"所办（office）",
                  "delivered":true,"registered":true,"code":null,"what":"systemPrompt.context","reason":null,"stack":null}
★ 九键 9/9 MATCH；`"sections":[]`；`promptSection={"registered":false,"code":null,"reason":null}`
```
⇒ ★★ **闸门通过：结构性成立**（`delivered:true` ＋ `registered:true` ＋ `enabled:true` 三件同时为真，且 `stack:null` ⇒ **没有任何失败路径被走到**）✓。
★ **未核（具名）**：**`stderr 0 B`** —— 它来自**驱动的 stderr**，不在那 148,080 B 的 spill 里，我**没有**读驱动日志 ⇒ 该条**保持为其读数**。★ 另：`M = 1 条 sink` 的权威来源是**宿主 stdout**（不在 spill 里；spill 里只有 **1 处** `turn-end-duty` 字样，与"1 条"一致，但**不等于**我量到了那一行）。

## 2. ② 桥接件：**成立，但机制要说得更准**（这是"P 未增加而模型可见"的正面证据）
**我的独立计数（6 份会话日志，多帧解码）**
```
A  ed1b69c3  snapshot 出现 1 处   载体={"user/message#seq=9":1}
A  3a144dd9  snapshot 出现 1 处   载体={"user/message#seq=9":1}
A  c0541f25  snapshot 出现 1 处   载体={"user/message#seq=9":1}
B  05b099f4  snapshot 出现 0 处     B  4649cbb8  0 处     B  3ef570e8  0 处      ⇒ A 3/3 有、B 0/3 无 ✓
```
**载体事件逐字（A 臂第一会话，节选）**
```json
{"type":"user/message","seq":9,…,"data":{"content":[{"type":"text","text":"Current runtime context. This snapshot
  supersedes earlier runtime-context snapshots.\n\nCurrent DSH file policy: workspace-write. …\n\nApproval policy: ask. …
  \n\n[vmu report feedback] audience: 所办（office） · reports declared: 2 · recorded: 0 · delivered: 0 · this is a
  delivery notice, not an instruction."}]}}
```
⇒ ★★ **判定：其主张成立** —— 宿主**确实**把这段文本**放进了模型可见上下文**，且**A/B 是干净对照**（同装配、同任务、同 steer，只差那两行设置；A 3/3 有、B 0/3 无）✓；★ **但准确的机制是**：**它不是一条独立消息**，而是被**拼进宿主自己的「Current runtime context」snapshot**（紧跟 file-policy／approval-policy 两段），而**该 snapshot 以 `user/message`（`content[].type="text"`）投递** ⇒ ★ 这正是**动态 context 通道**（我们调 `systemPrompt.context({name:'vmu:report-feedback', order:5000})`）的落地形态 ✓。
★ **为什么这条是决定性的**：**P ＝ `prompt.sections` 仍是 0 段**（同份回执 `"sections":[]`）而**模型上下文里出现了我们的文本** ⇒ ★ **"P 未增加 而模型可见"** 从主张变成了**观测** ✓；★ 且它在 **`seq=9`**、即**模型该回合动作之前** ⇒ "有机会看到后再决定" 这个前提也成立 ✓。

## 3. ③ 行为件：**C1 我用事件级计数复算 ⇒ 0/6；"有效负结果"我判定【成立】**
**(a) 我复算的读数**
```
★ 6 个会话里【命名 vibe_vmu_* 的调用事件】= 0（★ 事件级过滤：类型含 tool/call 且载荷含 name:vibe_vmu_*）⇒ C1 = 0/6 ✓
★ turn/end 6/6 = {"kind":"completed"} ✓（我逐份读到）
★ 任务确实"有值得说的东西"：6/6 的会话文本里都反复出现那次数据卡点的数字（"117"／"100"／"n/a" 均多次出现）✓（弱证据，方向一致）
★ 词频（我的原始计数）："汇报" 6/6 都 = 4（★ 与臂无关，是常量）；"报告" A: 0/0/0，B: 0/0/**3**
```
★ **测量法提醒（重要）**：★ 我用**子串**数 `vibe_vmu_report` 时**每个会话都得 1** ⇒ 若照子串判 C1，会得到 **1/6 的错误读数**；那 1 处是**工具清单/注册文本**，不是调用 ⇒ **必须按【调用事件】计数** ⇒ ★ 其 C1=0 **与我的事件级计数一致** ✓。
**(b) 我的判定：★「仍未建立（有效负结果）」成立** —— 四条grounds 全部由**读数**支撑：
1. **治疗已施加**（结构件：`delivered:true`＋`registered:true`，非"没接线"）；2. **治疗已进入模型可见面**（桥接件：A 3/3 `user/message` 逐字，B 0/3）；3. **模型确实读到了并权衡过**（A2 reasoning **逐字复述** `reports declared: 2` 并讨论 vmu 面后放弃）；4. **行为上 0/6 使用**（事件级调用计数），且 6/6 任务含"值得说"的内容 ⇒ ★ **因此这不是"没看到"的空过，而是"看到后主动不用"的负结果** ✓。
**(c) 我加的边界（必写）**：**n＝3/臂 ⇒ 提示性**；**单模型＋单版本 ⇒ 不外推**；**只测了一种任务形态**（其 §4 也这么定），⇒ ★ **剩下的未知量是【任务形态】而非样本量**（我同意该框法：模型给的理由是任务性质）；★ **C2 我无法机械复现**：我的词频计数**不能**区分臂（`汇报` 两边都是 4；`报告` 只有 B 的第三会话有 3）⇒ C2=0 **是其对最终文本的判读**，我只提供原始计数；★ **P=6/6 `prompt.sections=[]` 我在臂级核不到**（那 6 个会话日志里**没有**我们的 status 回执；`"sections"` 命中的是宿主自己的 `sandbox:policy`）；我只能确认**同配置的闸门会话** `"sections":[]` ✓ ⇒ 该 6/6 **保持为其读数**；★ **M=1×6** 同理（宿主 stdout）。
**(d) 关于其推论"不翻 v5m/v5r 默认就是被规格要求的行为"**：★ **前提是规格第 3 步的判据就是"模型真的使用了通道"**（其 §4"什么会改判"正是这么写的）—— ★ **我没有读规格正文** ⇒ 该前提**记为它的引用，不是我的读数**；在**该前提成立**的条件下，**"负结果有效 ⇒ 条件不满足 ⇒ 不翻默认"** 的逻辑**成立** ✓。

## 4. ④ 模型自陈引文：**属实**（且原文多出一句）
**A2 ＝ `session-3a144dd9-…`，我在其日志里逐片段验证**：
```
FOUND  "The report feedback mentions reports declared: 2."   → 上下文："…I could record the proposition via vibe_vmu_records... That might be gratuitous. The report feedback mentions reports declared: 2. I'll skip vmu unless useful — …"
FOUND  "I'll skip vmu unless useful"        ／ FOUND "adding vmu records is noise"        ／ FOUND "Skip."        ／ FOUND "in-spirit"
★ 引文属实；★ 原文在该句后【还多一句】："…Skip. Actually, hmm, vmu is in the system prompt as a framework, not an instruction. Skip."
```
⇒ ★ 其 §0 的引文是 §3 全文的**忠实子集** ✓；★ **多出的那句值得单列**：模型**自己区分的正是"框架 vs 指令"** —— 这与本项目的 **P/S 与"不是指令"** 口径同向（我们的文本自己写着 "not an instruction"）✓。

## 5. ⑤ 成本与卫生（我核到的）
- ★ **成本求和**：83,500＋130,027＋173,375＋142,515＋94,953＋98,707＋166,373 ＝ **889,450** ✓（**我复算过**）⇒ 落在其 0.7–1.0M 估算内 ✓。
- ★ **凭据**：`Get-ChildItem D:\_tmp -Recurse -Force -Filter '.credentials*'` ⇒ **none** ✓。
- ★ **宿主/端口**：`Get-NetTCPConnection -State Listen` 里 **7700–7900 = 无** ✓。
- ★ **夹具"第三次救场"**：它打印的两个哈希 **`96F52A647F3FB924`**（scratch）与 **`CDCBA5C9875C86BA`**（HEAD）⇒ ★ **正是我 R18 绑过的旧入口 blob 与 `9dc746e` 的入口 blob** ⇒ ★ **"它拦的是过期载荷"成立** ✓；★ 且四个 payload 在 `3b84a45` 与工作树**逐字节相同**（我核过）⇒ **窗口内 payload 冻结** ✓。

## 6. 我自己的测量法与仪器（具名）
1. ★★ **子串计数会误判 C1**：`vibe_vmu_report` 子串在**每个**会话都命中 **1**（工具清单文本）⇒ 我改用**调用事件计数**才得 **0** ✓ ⇒ ★ 这条记进我的量具清单：**"提到名字" ≠ "调用了"**（与 R15"报告面自己的计数器"同族）。
2. ★ **我的 spill 解析脚本又用 `node -e` 打坏了引号（本会话第 4 次）** ⇒ 改脚本文件后一次跑通 ✓（★ 我的清单项：**探针一律落文件，不用 `node -e` 夹引号**）。
3. ★ **我对 `prompt.sections` 的第一版正则命中了宿主自己的 `sandbox:policy`**（不是我们的回执）⇒ 发现臂里**根本没有我们的 status 回执** ⇒ 于是把该条降级为"**臂级未核**"，而不是把它当反证 ✓（同族纪律：先确认命中的是哪一份）。

## 7. 没核 / 未做（与"核了"分开写）
1. **未核**：**`stderr 0 B`**（驱动输出，不在 spill 里）与 **`M = 6/6 各 1 行`**（宿主 stdout）⇒ 保持为其读数；我只在闸门 spill 里看到 **1 处** `turn-end-duty` 字样。
2. **未核**：**臂级 `prompt.sections = []` 6/6**（那 6 份会话日志无我们的 status 回执）⇒ 我只确认**同配置的闸门会话** `"sections":[]`。
3. **未核**：**C2 = 0/3 与 0/3** —— 它是**对最终文本的判读**；我的词频计数**不能**区分臂（`汇报` 两边皆 4；`报告` 仅 B 第三会话 3）。
4. **未核**：**规格第 3 步的判据原文**（"条件不满足 ⇒ 不翻默认"的前提）⇒ 记为其引用。
5. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；真机会话**一次都没跑** ⇒ 本报告全部是**对他人真机产物**的独立复核（spill／会话日志／blob）。
6. **未核**：在飞的其它 R20 报告（本轮我只读了 `phase2-assistant-round19-gate3.md` 与其引用的产物）。
