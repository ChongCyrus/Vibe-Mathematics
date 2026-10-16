# Phase 5 · **`parent` 仍是 `null`：★ 可取得性才是真问题**（Round 70）

> ★ 作者＝Lead。★ 依据：真机转录 `…043237`（167s／1,359,839 tokens）＋ 宿主 `typert.host.js` 的类型声明。

## 1. ★★★★★★★ 契约【已逐字确认】

★ **`typert.host.js:779`**（★ 类型声明 ✓）：
> ★ *"export interface **SubagentStartRequest** { readonly label?: string; readonly prompt: ContentBlock[]; **readonly parent: Agent**; …}"*

★ **`typert.host.js:335`**：★ `ContinuableCreateRequest { sessionId; **parent: Agent**; signal: AbortSignal }` ✓
★ **`typert.host.js:212`**：★ **`list(): string[]`** ⇒ ★★ **agents 服务的 `list()` 返回【字符串 id】，★ 不是 agent 对象** ✓✓

⇒ ★★★★★ **即：★ `parent` 必须是一个真正的 `Agent`**（★ 带 `options` 与 `session.header` ✓），★ **而列表只给名字** ✓✓

## 2. ★★★★★ 我据此修了【我自己的】一行 bug，★ 而 `parent` 仍是 `null`

★ **修复**：★ `agents.get(String(all[0]))` ⇒ ★ **并把"只有同时带 `options` 与 `session` 的对象才接受为 parent"写成守卫** ✓
★ **而真机读数（下一轮）**：
```
reading 'options': 23   ·   delegationDepthOf: 29   ·   caused by: 5   ·   cast:true: 0
```
⇒ ★★★★ **即：★ 守卫【没有通过】** ⇒ ★★ **`agents.get(id)` 返回的东西【不带 `options`／`session`】，★ 或它本身为空** ✓✓
⇒ ★★★ **而这与【已确认的契约】不矛盾** ⇒ ★★ **它说明：★ 从【插件】这一侧【拿不到调用者的 Agent】** ✓✓

## 3. ★★★★★ 所以真问题换了一句话：★ "插件能不能拿到调用它的 Agent？"

★★ **两条可能，★ 而它们导向完全不同的处置**：
1. ★★★★ **能拿到，★ 只是不在 `agents` 服务上** ⇒ ★ 例如工具调用的上下文、★ 或 `ctx` 的另一个键 ⇒ ★ **继续找即可** ✓
2. ★★★★★ **拿不到** —— 宿主只把 Agent 交给【它自己的委派工具】，★ **而不交给第三方插件** ⇒ ★★ **那 `start()` 这条一次性路径对 vmu 【结构性不可用】** ✓✓
   ⇒ ★★★ **而本阶段的结论就要照实写**：★ **"vmu 无法从插件侧提供 `parent`；★ 成员回合必须由别的交付方式承担"**（★ 例如根会话自己承担成员回合 ✓）✓✓

## 4. ★★★ 下一批（★ 一次观测即可分辨上面两条）

1. ★★★★ **把"parent 解析结果"记进回执**：★ `parentKind: 'agent' | 'string' | 'object-without-options' | 'null'` ✓
   ⇒ ★★ **一次读数就能分辨"能拿到"与"拿不到"** ✓✓
2. ★★★ **并把 `agents` 服务上可用键的名单记一次**（★ 一次即可 ✓）—— ★ **若其中并无"当前 agent"，★ 则结论是第 2 条** ✓
3. ★★ **若确为"拿不到"** ⇒ ★ **转而实现【根会话承担成员回合】**（★ 即把成员提示词交回调用它的会话 ✓）—— ★ **这不需要宿主的 Agent，★ 也不需要嵌套 continuable** ✓✓

## 5. ★ 诚实边界

★ **仍未主张收敛**：★ `cast:true` 0 次 ⇒ **按铁律不主张** ✓
★★ **而本轮的实质是**：★ **把"为什么 parent 是 null"从【代码形状问题】推进为【宿主接口的可取得性问题】—— ★ 而后者可能是本阶段交付路线的【结构性边界】** ✓✓
★ **可观测性投资仍在兑现**：★ `delegationDepthOf` 出现 29 次、★ `caused by` 5 次 ⇒ **失败始终自报位置** ✓✓
