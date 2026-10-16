# Phase 5 · **交付层的最后一个发现**（Round 63）

> ★ 作者＝Lead。★ 依据：真机转录 `…031450`（210 万 tokens，★ 至今最多）＋ `@deepseek-ai/dsh-subagent` 的源码逐字。

## 1. ★★★★★ 宿主自己的注释给出了答案

★ **`@deepseek-ai/dsh-subagent/lib/index.js:1650-1653`** 逐字：

> ★ *"The **continuable-subagent orchestration service** behind `ctx.subagents`. Tool schema and host adapters are
> consumers of this one contract; **foreground one-shot delegation keeps calling `ctx.subagents.start()` and never
> enters this lifecycle**."*

★ **`:3115`**：★ `async start(name, request)` ⇒ ★ **`descriptor = { mode: "one-shot", provider: name, … }`** ✓✓（★ 不碰 registry ✓）
★ **`:2879`**：★ `async startContinuable(spec)` ⇒ ★ **走 continuable registry**（★ 就是会拒的那条 ✓）

⇒ ★★★★ **所以答案是明确的**：★ **一次性委派【不进入】那个生命周期** ✓✓ —— ★ **而 vmu 的成员回合【正是一次性交付】**（★ `({turn, text}) => reply` ✓）✓

## 2. ★★★★ 我实现了它，★ 并且【单测证明它有效】

★ **`deliverViaSubagents(subagents, extract, { provider })`** ⇒ ★ **有 provider 且接缝有 `start` 时走一次性路径** ✓
★ **单测**：★ **一个 continuable 永远拒绝、而 `start` 正常的宿主** ⇒ ★ **`one-shot used: 1`，`continuable used: 0`** ✓✓
★ **回退**：★ **只有 continuable 的宿主仍走原路径** ✓
★ **并且 provider 名【先取配置】，★ 没配置就【问宿主自己的 `listProviders()`】**（★ 取第一个 ✓）
⇒ ★★ **「名字来自【必须接受它的那个服务】，★ 所以这是默认，★ 不是发明」** ✓✓

## 3. ★★★★★ 而真机上【没走到】—— ★ 读数证明得很干脆

```
listProviders: 0                                  ← ★★ 我的发现代码【一次都没执行】
"refused to start this member turn twice": 20      ← ★ 仍在走 continuable 路径
"reading 'id'": 37 · cast:true: 0 · "paper": 38
```

⇒ ★★★★ **原因**：★ **`start` 与 `startContinuable` 在宿主里属于【不同的类】**（★ `:3115` vs `:2879` ✓）
⇒ ★★★★★ **所以 `ctx.get('subagents')` 解析到的是【continuation manager】，★ 它【没有】`start`** ⇒ ★★ **于是我的判断条件为假，★ 一次性路径没被选中** ✓✓
★ **即：★ 服务面（service surface）与延续管理器（continuation manager）是两个对象，★ 而入口拿到的是后者** ✓

## 4. ★★★ 下一批（★ 一行可查）

1. ★★★★ **先【确证】`ctx.get('subagents')` 到底是什么对象**：★ 打印它的键，★ 或读宿主在何处 `registerProvider` ⇒ ★ **即可知道 `start` 在【哪个对象】上** ✓✓
2. ★★★ **若 `start` 在另一个服务上** ⇒ ★ **入口应去取那一个**（★ 例如 `ctx.get('subagents').service`，★ 或宿主另行注册的 ✓）
3. ★★ **若只有 continuation manager 可达** ⇒ ★★ **那一次性路径【无法从这里到达】** ⇒ ★ **回到「串行化」或「根会话承担成员回合」两条路** ✓

## 5. ★ 诚实边界

★ **仍未主张收敛**：★ `cast:true` 0 次 ⇒ **按铁律不主张** ✓
★★ **而本轮的价值在于**：★ **把「该走哪条路」从猜测变成了【一个可查的对象身份问题】** ✓✓
