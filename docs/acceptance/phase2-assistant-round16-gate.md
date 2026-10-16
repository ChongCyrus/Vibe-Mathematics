# 第二阶段 · assistant `round16`：**前置闸门（`delivered === true`？）**

> 负责人：`vmu-assistant2`（**真机结论只由我声称**）。
> 读数绑：**HEAD `ca531db`**（`fix(vmu): break the cycle that pinned the reporting feedback switch shut, found by two independent instruments`）；**四个 payload blob**：入口 **`96F52A647F3FB924`**（87,082 B）、`host.js` **`461D7FD499F016EA`**、`kernel/receiptbounds.js` **`E4873BFBC9AAC0AB`**、`kernel/index.js` **`40291AA226AB9590`**；跑前/跑后逐字节核 **ALL EQUAL**（§5）；运行时刻 **2026-10-16 11:44:07**（25 s，84,542 tokens，driver exit 0）。
> 硬约束：只跑**闸门 1 次**；**不通过 ⇒ 不跑行为臂**（本报告即为终点）；未跑全量／未 `regen-all`／未 git 写／未改码；凭据用完即删（§5）。

---

## 0. 判定（★ 一句话）
# ★ **闸门【不通过】⇒ 按硬性顺序【停】：不跑 A×3／B×3。一切行为结论＝【未检验】。**
| 闸门条件 | 读数 | 结论 |
|---|---|---|
| `reportFeedback.enabled === true` | **true** ✓ | 通过 |
| `reportFeedback.delivered === true` | **false** ✗（**具名**：`VMU_EXTERNAL_UNAVAILABLE` / `systemPrompt.context`） | **不通过** |
⇒ ★ **且 R15 的那处"自相矛盾"已被 `ca531db` 修好**：设置侧与投递侧**现在一致**（§1 逐字对照）—— ★ **新出现的失败是【第二处、不同性质的】缺陷：宿主边界**（不是接线/时序）。

## 1. ★★ 结构读数逐字对照（同一份回执；来源＝该会话自己的 **HOST SPILL** 149,430 B）
```
# 设置侧（settings.resolved）
"vmu.report.feedback":{"value":true,"source":"config","hot":"H1","who":"office","overridden":[]}
"vmu.report.audience":{"value":"所办（office）","source":"config","hot":"H1","who":"office","overridden":[]}

# 投递侧（reportFeedback，九键全量，原样）
"reportFeedback":{"enabled":true,
                  "source":"settings:vmu.report.feedback",
                  "audience":"所办（office）",
                  "delivered":false,
                  "registered":false,
                  "code":"VMU_EXTERNAL_UNAVAILABLE",
                  "what":"systemPrompt.context",
                  "reason":"the host systemPrompt service is NOT reachable (not injected?)",
                  "stack":"Error: cannot get property \"systemPrompt\" without inject\n    at deliverReportFeedback (file:///…/vibe-math-vmu/kernel/reportfeedbackdelivery.js:94:27)\n    at deliverReportFeedbackFrom (…/kernel/reportfeedbackdelivery.js:56:10)\n    at new apply (…/vibe-math-vmu/vibe-math-vmu.js:853:25)\n    at Fiber.execute (…cordis/lib/index.js:1068:24) …"}
```
**逐项对照**：
| 项 | R15（`2b3fefe`，未修） | **R16（`ca531db`，已修）** | 判定 |
|---|---|---|---|
| `enabled`（投递侧） | **false** | **true** | ★ **两面现已一致** ✓（R15 的矛盾消失） |
| `source` | `"default"` | **`"settings:vmu.report.feedback"`** | ★ 投递侧**真的读到了设置** ✓ |
| `audience` | `null` | **`"所办（office）"`** | ✓（与设置侧同值） |
| `delivered` | false | **false**（**具名**） | ✗ **闸门不过** |
| 失败可见性 | **完全静默**（无 stderr） | ★ **stderr 有一行**：`vmu: report feedback not delivered - the host systemPrompt service is NOT reachable (not injected?): cannot get property "systemPrompt" without inject` | ★ **从"静默"变为"具名"** ✓（这正是 R15 报的那个观测缺口被修好） |
⇒ ★★ **结论：`ca531db` 修好的是【接线/时序】（投递侧现在看得见开关）；剩下的阻塞是【宿主边界】** —— `ctx.systemPrompt` 访问即抛（`cannot get property "systemPrompt" without inject`），stack 直指 **`kernel/reportfeedbackdelivery.js:94`**。

## 2. ★ 这条边界与既有降级是**同一个**（可交叉核对的其他真机读数）
- 入口自己的 **prompt section** 路径（`systemPrompt.section`）在真机上**一直**是 `{"registered":false,"code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt","reason":"cannot get property \"systemPrompt\" without inject"}`（R34/R41/R43 多轮同值）⇒ ★ **`.section` 与 `.context` 两条路都死在同一个"未注入 `systemPrompt`"上**。
- ★ 而**同一部署里存在一条【已证明能到达模型】的提示词路径**：**pack 段注册表** —— R43/R44 的 v5r 武装臂回执里 **`prompt.sections` 有 59 段**（含具名段 **`v5r-report-duty`**，`range:"pack"`）⇒ ★ **那条路不经过 `ctx.systemPrompt`**。
⇒ ★ **据此给 owner 的具名建议（不是结论，是候选）**：**让回路走已经工作的那条路**（pack/prompt 注册表），**或**给插件 `inject: ['systemPrompt']`（★ 但本项目一贯避免对"可能不存在的可选服务"硬依赖 ⇒ 需 Lead 裁）；**当前实现（`.context`）在本宿主上不可能 `delivered:true`**。

## 3. 闸门会话其余读数（供复核）
- **多帧解码**：**16 帧 → 34 events**（★ 一次性解压只出 2 行）；`turn/end = {"kind":"completed"}`。
- **调用的工具 = 3**（`vibe_vmu_status`、`grep`、`pwsh`）；★ **C1 原始计数 = 1**，但那是**任务明确要求**的（"调用一次 `vibe_vmu_status`"）⇒ **不是 S**（夹具的 `--task` 提示即为此）。
- **M = 1 条** sink（`turn-end-duty`，`drives:false`）。
- **P-clean 前提**：`prompt.sections = **[]**`（**0 段**）✓；`faces.published = ["vibe_vmu_status","vibe_vmu_set","vibe_vmu_records","vibe_vmu_report"]`（**含报告面** ✓）。
- ★ **模型侧如实贴出**：最终文本开头 `已调用一次 vibe_vmu_status（无参数）。以下是从回执中按原始字节截取的 reportFeedback 一项，未做任何改写：` ＋ 原样 JSON ⇒ **模型把 `delivered:false` 照实贴了出来**（未美化、未掩盖），这条也可以用来说明"模型并没有回避坏消息"（★ 但**与本轮的闸门判定无关**，仅记录）。

## 4. 成本（★ 省下的正是这次闸门的意义）
- **预估**：闸门 1 次 ≈ 60–85k；**若通过**再跑 6 次 ≈ 0.6–0.9M ⇒ 合计 0.7–1.0M。
- **实际**：**只花 1 次／84,542 tokens**（25 s）；★ **因闸门不通过而【未跑】那 6 次** ⇒ **省下约 0.6–0.9M tokens**（Lead 采纳闸门的实际收益）。

## 5. 证据纪律与卫生（照 D1 夹具）
- ★ **D1 夹具再次当场拦截过期载荷**：跑前打印 **`MISMATCH — the scratch payload is NOT HEAD; re-sync before running`**（scratch 入口 `591766CAC82AE83` ≠ HEAD `96F52A647F3FB924`）⇒ runner **随即同步并复核 ALL EQUAL** 才开跑；**跑后仍 ALL EQUAL** ✓（★ 这条警告已连续两轮救场）。
- **读的哪一份**：结构读数全部取自**该会话自己的 HOST SPILL**（`…/dsh-spill-w6eDF1/session-0b031b2452b4/41c89aa82c3b-vibe_vmu_status.txt`，149,430 B，**未被宿主省略**）✓；★ 不用转录那份省略版。
- **凭据**：本轮复制 **1 次**（`D:\_tmp\r18-home\.credentials.yaml`，**路径已报**）⇒ **用完即删**：现 `D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓。
- **宿主/端口**：闸门会话跑完即停；`7700–7900` **无监听**（本轮用到 7869）✓。
- **残差声明（照 R15 保持并落实）**：注入路径共**三条** —— **`packs/*/prompts`**、**`systemPrompt.section`**、**`systemPrompt.context`**（`vmu:report-feedback`，order 5000）—— 均须具名；**宿主自身拼接的提示词未枚举 ＝ 宿主边界** ✓。★ 本轮实测：**第 3 条（`.context`）就在这条宿主边界上失败**（§1 的 stack）。

## 6. 下一步（★ 依序，未完成前不得进入行为判定）
1. ★ **owner 按 §1 的 stack 与 §2 的证据决定走哪条路**（建议：**走 pack/prompt 注册表那条已工作的路**；或经 Lead 裁定 `inject`）；
2. 修后**再跑一次同样的闸门**（1 次）⇒ **只有 `enabled:true`＋`delivered:true` 同时成立才算过**；
3. 闸门过后才跑 **A×3／B×3**（同一夹具、同一 steer、同一延迟、P-clean）⇒ **那时 A 臂的 C1/C2 才能作 S 的证据**；★ 若那时仍 0 ⇒ 才是 **「仍未建立」的负结果**（并附 n、任务是否有"值得说的进展"、单模型不外推等限定）。
★ **本轮判定仍是【未检验】**（闸门未过）—— ★ 不是"仍未建立"。
