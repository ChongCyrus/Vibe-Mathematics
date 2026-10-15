# Lead 侧目标 3 独立核查 · Round 4 增补

> 方法：**直接问运行时**（Host Inspect provider `Service.listService`），而不是读源码或猜。这条方法值得固化：**"宿主到底给不给这个能力"应当问运行时，而不是在仓库里 grep 不到就判"缺失"**。

## F9/F10/F11：宿主**全都提供** ⇒ 判定从"缺失"改为"**可接线但未接线**"

`subagents` 服务（`ctx.get('subagents')`，需 undefined 检查）实测签名：

| 原语 | 宿主契约（逐字） | 对判定的影响 |
|---|---|---|
| **F9** | `async sendMessage(sender: Agent, targetId: SessionId, content: ContentBlock[], options: {signal}): Promise<MessageId>` —— 转向**直接父或直接可续子**；在跑目标**最近 step 边界**接收；空闲目标**起回合**；缺席直接子**从持久化冷恢复**；**从确切活 sender 派生耐久发送者归属** | 能力存在；vmu 只需在入口接出并让内核可见 |
| **F10** | `interrupt(targetSessionId, authority: {kind:'user',parentSessionId} \| {kind:'ancestor',agent}): void` —— **fire-and-return**；未认领待收件/Activation/后代**保留**；缺席＝**接受的 no-op**；无权限 ⇒ `UNAUTHORIZED` | 同上 |
| **F11** | 两条来源：`SubagentRun.result: Promise<SubagentResult>` 的 **`stopReason: completed\|aborted\|error\|max-tokens\|refusal`**；会话事件 `turn/end` 的 **`reason: completed\|aborted{reason}\|blocked\|error\|max-tokens\|interrupted\|forked`** | `childId`+`stopReason` 都拿得到 |
| 附 | `listChildren(parentSessionId, signal?)`（耐久直接子目录，**不加载/不恢复 Agent**，每行带 `mode` 与 `activity:'running'\|'inactive'`）；`listDescendants(rootSessionId, signal?)`（前序＋`parentId`/`depth`＋诊断） | 正是 v5r `reconcileProvisioning` 的正规入口 |

**结论**：`05-framework-strength-evidence.md` 把 F9/F10/F11 判"缺失"是**对仓库的**准确判定（vmu 里确实没有），但**不等于宿主不给**。⇒ 正确表述是 **"宿主已提供、vmu 未接线"**，处置＝接线（task-25），**不是**"具名登记为宿主能力缺口"。

## 一条方法论（与 Round 3 的两条并列）

1. **"缺失"必须给搜索范围与模式**（Round 3 F52）。
2. **"具备"必须指出失败可见性**（Round 3 F22）。
3. **★ 新增："宿主能力"要问运行时，不要在仓库里 grep 不到就判缺**（本轮 F9/F10/F11）——`Host Inspect` 的 `Service.listService` 给出**逐字签名**，比读 `app.asar` 可靠（asar 本 agent 读不了，见 docs/14 R-5）。
