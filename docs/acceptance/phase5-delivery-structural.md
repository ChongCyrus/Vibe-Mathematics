# Phase 5 · **结构性结论：★ 插件拿不到调用者的 `Agent`**（Round 72）

> ★ 作者＝Lead。★ 依据：真机转录 `…044340`（195s／1,169,635 tokens）＋ 宿主 `typert.host.js` 的类型声明 ＋ 前后共 6 次针对该点的运行。

## 1. ★★★★★★★ 两处都补齐之后，★ 读数【没有变化】

★ **上一轮**：★ **一次性路径** 与 **continuable 路径** 都补上了 `parent`／`signal`／（continuable 还补了 `sessionId`）✓
★ **而本轮**：
```
reading 'options': 21   ·   delegationDepthOf: 23   ·   "on the one-shot path"
refused to start this member turn twice on the one-shot path: Cannot read properties of null (reading 'options')
cast:true: 0
```

⇒ ★★★★ **即：★ 一次性路径【仍然】拿到 `parent === null`** ✓✓
⇒ ★★★★ **而 `agents.get(id)` 没有返回一个带 `options` + `session` 的对象** ✓✓

## 2. ★★★★★ 所以这是【结构性】的，★ 而不是"还差一行"

★★ **已逐字确认的契约**：
```js
SubagentStartRequest   { label?; prompt; parent: Agent; … }        // ★ parent 必填，★ 类型是 Agent
ContinuableCreateRequest { sessionId; parent: Agent; signal }      // ★ 同样必填
list(): string[]                                                   // ★ agents 服务只给【名字】
```

⇒ ★★★★★ **合起来读**：★ **宿主要求一个 `Agent` 对象，★ 而它只向插件暴露【名字】** ⇒ ★★ **插件侧【无法构造】合法的 `parent`** ✓✓
★★ **除非**：★ **宿主在别处也把当前 Agent 交给了插件** ⇒ ★ **而本阶段用尽了已知可取之处（★ `ctx.get('agents')` 的 `get`／`list`、★ 工具上下文键）都没有** ✓✓

## 3. ★★★★★ 因此交付路线必须【换一条】—— ★ 而这条不依赖宿主的 Agent

★ **`deliverTurn({ turn, text }) => reply` 是【框架自己的接缝】** ⇒ ★★ **它并不要求走 `subagents`** ✓✓
★★ **可行的一条**：★ **把"成员回合的提示词"【交回调用它的会话】** —— ★ 即 `vibe_vmu_turn` 的**返回里带上装配好的成员提示词**，★ **由根代理去扮演/执行该成员回合**，★ **再把其回复作为下一轮的输入** ✓✓
⇒ ★★★ **它【不需要】宿主的 `Agent`、★ 【不需要】嵌套 continuable、★ 【不需要】一次性路径** ✓✓

★ **代价（★ 照实说）**：★ **一次工具调用只能推进一个成员回合**（★ 因为回复要经过根代理 ✓）⇒ ★★ **但那是【可接受】的：★ 成员回合本来就是离散的** ✓

## 4. ★★★ 另一条已在文档里的选项

★ **宿主的 `deliverViaSubagents` 走不通时，★ 部署可以【自己注入】`deliverTurn`** ✓
⇒ ★★ **即：★ 这条路的结论【不是"vmu 坏了"】，★ 而是"vmu 需要由部署提供一个不依赖宿主 Agent 的交付接缝"** ✓✓ —— ★ **而这恰好与 vmu 的哲学一致**：★ **"框架给能力与默认，★ 部署掌管装配"** ✓✓

## 5. ★ 诚实边界

★ **仍未主张收敛**：★ `cast:true` 0 次 ⇒ **按铁律不主张** ✓
★★★★ **而本阶段的交付线【到此定论】**：★ **两次独立尝试（★ 一次性与 continuable）都在【同一个宿主帧】上失败，★ 且契约文件说明了为什么** ⇒ `request.parent: Agent` 必填，而插件只能拿到 `list(): string[]` ✓✓
★★ **可观测性投资【一直在兑现】**：★ `delegationDepthOf` 出现 23 次、★ **失败始终自报路径与位置** ✓✓
