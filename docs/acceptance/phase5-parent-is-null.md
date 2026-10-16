# Phase 5 · **定论：`parent` 是 `null`**（Round 69）

> ★ 作者＝Lead。★ 依据：`@deepseek-ai/dsh-subagent/lib/index.js:111-115` 逐字 ＋ 真机帧 `at delegationDepthOf`。

## 1. ★★★★★★★★★ 那一帧一读就明白了

★ **宿主源码逐字（`:111-115`）**：
```js
function delegationDepthOf(agent) {
  const runtime = agent.options.subagentDepth;        // ← ★ 读的是【agent 自己的】options
  if (runtime !== void 0 && (!Number.isSafeInteger(runtime) || runtime < 0 || Object.is(runtime, -0)))
    throw new TypeError("agent subagentDepth …");
  return Math.max(agent.session.header.delegationDepth ?? 0, runtime ?? 0);
}
```

⇒ ★★★★★★ **`agent.options` 抛 `Cannot read properties of null (reading 'options')` ⇒ ★ 【`agent` 就是 `null`】** ✓✓✓
⇒ ★★★★★ **即：★ `request.parent` 是 `null`** ✓✓✓ —— ★ **与上一轮的推断【一致】** ✓

★ **而它【还需要】**：★ **`.options.subagentDepth`** 与 ★ **`.session.header.delegationDepth`** ✓✓
⇒ ★★★★ **即：★ `parent` 必须是一个【真正的 agent 对象】**（★ 带 `options` 与 `session.header` ✓），★ **而不是 `{ session }` 之类的替身** ✓✓

## 2. ★★★★ 于是修复【已确定】，★ 只差"从哪取"

★ **入口现在传的是**：★ `agents.get(sessionId || agentId)`，★ **或 `agents.list()[0]`（仅当恰好一个）**，★ **否则 `null`** ✓
⇒ ★★★ **而真机上是 `null`** ⇒ ★★ **说明【两个都没成功】**：★ **`config.sessionId`／`config.agentId` 没给**，★ **而 `agents.list()` 要么不存在、★ 要么长度不为 1** ✓✓

★★ **可取之处（按可疑度排序）**：
1. ★★★★ **工具调用自身的上下文** —— ★ `vibe_vmu_turn` 是被【某个 agent】调用的，★ 而宿主通常把这个 agent 放在工具上下文里 ✓✓
2. ★★★ **`ctx` 的其它键** —— ★ 已知宿主用 `ctx.get('agents')`（★ 它自己的代码 ✓）⇒ ★ **值得看 `agents` 上除了 `get`/`list` 还有什么** ✓
3. ★★ **`config.agentId`／`sessionId`** —— ★ 部署可以显式给 ✓（★ 但那是把宿主的内部 id 推给使用者 ✓，★ 只作兜底 ✓）

## 3. ★★★ 而代理【早就说对了】

★ 转录里逐字：★ *"This is a real bug … **This looks like the deliver seam requires a session/agent** …"* ✓✓
⇒ ★★★★ **两份独立证据（★ 代理的观察 ＋ 宿主的源码帧）指向同一结论** ✓✓ —— ★ **这正是本阶段一直用的判据：★ 一个结论要有两处独立支持** ✓

## 4. ★★★ 下一批（★ 一件，★ 明确）

1. ★★★★ **把"解析到的 parent 是什么"记进回执** —— ★ 是 agent 对象（★ 带 `options`／`session.header` ✓）、★ 还是一个 `{session}` 替身、★ 还是 `null` ✓
2. ★★★ **并打印 `agents` 服务上可用的键** —— ★ 一次即可看出正确的取法 ✓
3. ★★ **然后按【真正的 agent 对象】把 parent 接上** ⇒ ★ **`delegationDepthOf` 过了，★ 交付才可能成功** ✓

## 5. ★ 诚实边界

★ **仍未主张收敛**：★ `cast:true` 0 次 ⇒ **按铁律不主张** ✓
★★ **而本轮的实质进展是**：★ **"吞栈"修好后，失败第一次【沿宿主源码追到了确切的表达式】⇒ 结论是 `request.parent === null`，★ 修复方向【已无悬念】** ✓✓
