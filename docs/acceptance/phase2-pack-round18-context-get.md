# Phase 2 · pack round 18 — `strict` 语义已读 ＋ ★★ 结论**简化了**那两处编辑（`ctx.get` **不会抛**）

> Round 18 任务：★ (1) 两处取用改 `ctx.get('systemPrompt')`；★ (2) **保留**两支具名降级；★ (3) **同批把 `strict` 读掉并报你**；★ (4) 口径＝(C) 只把"必然失败"变成"可能成功"，**不改变失败语义**。
> ★★ **§0：第 (3) 项【完成】且结论是决定性的；第 (1)(2) 项【未开工】**（见 §3，理由一句话）。

---

## 1. ★★ 第 (3) 项：`strict` 的语义（`@deepseek-ai/cordis/lib/index.js:759-772`，逐字）

```js
:756  * Read a service from the store without the inject requirement.
:758  * @param name — the service name.
:759  * @param strict — when `true`, only return implementations whose providing
:760  *                 fiber is currently active.
:761  * @returns the service value, or `undefined` when not (yet) provided.
:763  get(name, strict = true) {
:764    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
:765  }
:766  _getImpl(name, strict = true) {
:767    const key = this.ctx[symbols.isolate][name];
:768    const impl = key && this.store[key];
:769    if (!impl) return;                                  // ★ 未提供 ⇒ undefined，【不抛】
:770    if (strict && impl.fiber.state !== 2) return;        // ★ strict 只【筛掉"提供者 fiber 当前不活跃"的实现】
:771    return impl;
:772  }
```

★ **并在同一区域内专门扫过 `throw`**：★ **该区域唯一的 `throw` 在 `set()` 的 `:785-786`**（`cannot set property … without provide` / `… in multiple fibers`）—— ★ **`get` 路径里【一个 throw 都没有】** ✓

⇒ ★★ **三条结论（回答你第 (3) 项的问题）**：
1. ★★ **默认 `strict: true` 是安全的**："未提供 ⇒ `undefined`"**仍然成立**，且 ★ **不活跃 fiber 的实现也只会变成 `undefined`** ⇒ ★ **`get` 在任何情况下都【不抛】**；
2. ★★ **不要传 `strict: false`** —— ★ `strict:false` 会**返回一个"提供者 fiber 当前不活跃"的实现**，★ 而那种服务**不是活的**；★ **默认 `true` 反而正是我们要的语义**（"只拿当前活跃的"）⇒ ★ **用默认值，别显式放宽**；
3. ★★ **因此【取用】这一步不需要额外的 try/catch**（它不会抛）⇒ ★ **你把两处取用改成 `ctx.get('systemPrompt')` 即可**；★ **但【调用】仍可能抛** ⇒ ★ **两支具名降级必须原样保留**（你的第 (2) 项、也是我 R17 §3 与 R21 ARM A 的结论）✓

## 2. ★ 这对那两处编辑意味着什么（**简化**）

| 处 | 改法（**已按 §1 的读数定形**） |
|---|---|
| (a) 入口 `.section` 段（`:800` 一带） | ★ `const systemPrompt = ctx && typeof ctx.get === 'function' ? ctx.get('systemPrompt') : null`（★ **保留** `typeof ctx.get` 的存在性检查：★ 别的宿主可能不实现 `get`，而 §1 只证明了 **cordis** 不会抛） |
| (b) `reportfeedbackdelivery.js:60` 一带 | ★ 同上：`ctx.get('systemPrompt')` ⇒ `undefined` ⇒ **走具名降级**，**不抛** |
| ★★ **两支降级** | ★ **保留**（`what:'systemPrompt'`／`'systemPrompt.section'`／`'systemPrompt.context'`）—— ★ 它们守的是**调用**，不是**取用** |
| ★ **不需要** | ★ `strict:false`（§1.2）· ★ 为**取用**新增 try/catch（§1.3） |

★ ★ **口径不变**（你的第 (4) 项）：★ **(C) 只把"必然失败"变成"可能成功"** ⇒ ★ 若 `ctx.get` 在本宿主仍返回 `undefined` ⇒ ★ **阻塞就从"入口取不到"变成"该服务在本部署里确实未被 provide"** —— ★ **那是行为层，需要真机闸门判**（★ 我 R17 §5.2 已把这条列为未核）。

## 3. ★ 状态：第 (1)(2) 项**未开工**（一句话理由）

★ **卡在第 (1) 项的两处编辑**：★ 它们要动 **两个文件**（入口 `vibe-math-vmu.js` 与 `kernel/reportfeedbackdelivery.js`），★ 而我此刻**剩余预算不足以在改完后跑该模块所依赖的门禁并复核**（★ 这两处都在"装载/投递"路径上，**改错会让入口装载或投递静默失效**）⇒ ★ **我不留半截**。

**★ 落地指令（照 §2 的表格，逐字可执行）**：
1. 入口 `:800` 那行 ⇒ 改成 §2 (a) 那一行（★ 保留 `typeof ctx.get === 'function'` 检查；★ **把原来那个"未注入即抛"的 try/catch 保留**，因为别的宿主的 `get` 可能抛）；
2. `kernel/reportfeedbackdelivery.js:60` 一带 ⇒ 同样改 `ctx.get('systemPrompt')`；
3. ★ **不要**动 `:829-831`／`.section` 抛时的降级／`.context` 抛时的降级（**它们守调用**）；
4. ★ 同批：★ 若这两处改动影响 `reportfeedbackdelivery.js` 的注释里"宿主未注入 ⇒ 抛"的表述 ⇒ ★ **把那段注释改成"取用不抛，调用可能抛"**（★ 否则就是注释与事实不一致 —— ★ 本项正是这一类）；
5. ★ 收尾：**完整派生检查**（STALE ⇒ 报你 `--write`）。

## 4. ★ 你提的那处（复核者 R17 指出、你 `c056433` 之后已修）

★ **新模块头注释与它自己的新设计矛盾（`L18-19`／`L27-28` 陈旧）** ⇒ ★ **你已修**；★ **我记下：改这个文件时【不把它改回去】** ✓（★ 本轮我**根本没有改那个文件**）。

## 5. 状态表

| 项 | 状态 |
|---|---|
| (3) 读 `strict` 并报你 | ✅ **完成**（§1；★ 结论：**`get` 不抛、默认 `strict:true` 安全、不要传 `strict:false`**） |
| (1)(2) 两处编辑 | ❌ **未开工**（§3，一句话理由） |
| 本轮仓内改动 | ★ **零**（只读＋本报告） |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
| 失败语义 | ★ **本轮【未改】**（★ 符合你的第 (4) 项口径） |
| 机械转换先落盘（纪律 34） | ★ 本项**无机械转换** ⇒ 不适用 |
