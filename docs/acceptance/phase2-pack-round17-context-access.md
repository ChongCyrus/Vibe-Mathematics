# Phase 2 · pack round 17 — `ctx.get('systemPrompt')` 判定：**(C) 成立**（可选 ＋ 可达）

> 问题：★ **(A) `inject:['systemPrompt']`** 会让插件**硬依赖**一个最小宿主未必有的服务（与本文件 `:793-795` 的注释冲突）；★ **(B) 走提示词 section 那条已工作的路** 会**增加 P**（R6 已否掉）；★ **(C) `ctx.get('systemPrompt')`** 是否**既可选又可达**？
> ★★ **判定：成立（code-level）。** ★ **本轮【不改仓】**（先判可行性），**只写本报告**。

---

## 0. 一句话结论

★★ **`ctx.get(name)` 在 cordis 里被【明确文档化】为"读取服务【而不需要 inject 要求】"，并在服务缺失时返回 `undefined`** ⇒ ★ **这正是 (C)：可选 ＋ 可达** ⇒ ★ **建议把【两处取用】从属性访问 `ctx.systemPrompt` 改成 `ctx.get('systemPrompt')`**；
★ **并且**：**拿到服务之后 `.section()`／`.context()` 仍可能抛** ⇒ ★ **那两支的具名降级必须【原样保留】**（★ 它们不是多余的）。

---

## 1. ★★ 读数（`@deepseek-ai/cordis/lib/index.js`，逐字）

| 行 | 原文 | 含义 |
|---|---|---|
| ★★ `:756` | `* Read a service from the store **without the inject requirement**.` | ★★ **`get` 的文档就是"不需要 inject 要求"** |
| ★★ `:761` | `* @returns the service value, or `undefined` when not (yet) provided.` | ★★ **缺失时返回 `undefined`，【不抛】** |
| ★ `:763` | `get(name, strict = true) {` | ★ 签名（★ **`strict` 的语义我未读**，见 §5） |

★ **对照：属性访问为什么会抛**（同文件）：
| 行 | 原文 |
|---|---|
| `:676` | `const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);` |
| `:687` | `if (prop in fiber.inject) {` ⇒ ★ **属性访问被 `inject` 门控** |

⇒ ★★ **两条路的分野被逐字确认**：★ **属性访问受 `inject` 门控（未注入 ⇒ 抛，`cannot get property "systemPrompt" without inject`）**，而 ★ **`ctx.get(name)` 明确是"绕过该要求的读法"，缺失返回 `undefined`** ⇒ ★ **这解释了 R16 真机 stack（`vibe-math-vmu.js:853` 抛）与为什么 `ctx.get` 不会以同样方式抛。**

## 2. ★ 为什么这不是"猜一个 API"

★ **宿主自己的代码就在用这个形态**（C1 读数）：`dsh-app-boot` 用 **`ctx.get("systemPrompt")`** 并 **`if (systemPrompt === void 0) return void 0`** ⇒ ★ **宿主先例＋cordis 文档两处一致**，★ 所以 (C) 不是我们发明的用法。

## 3. ★ 改动面估算（你要求）

| 处 | 现在 | 改成 |
|---|---|---|
| ★ 入口 `.section` 段 | `:800` `systemPrompt = ctx && ctx.systemPrompt ? ctx.systemPrompt : null`（**try/catch 包住，因为属性访问会抛**） | ★ **`ctx.get('systemPrompt')`**（★ **没有服务时得到 `undefined` ⇒ 走既有 `:829-831` 的具名降级**，**不抛**） |
| ★ Part B 的投递块 | `ctx.systemPrompt`（**未注入 ⇒ 抛**） | ★ **`ctx.get('systemPrompt')`** ＋ 自己的 `.context` 能力检查 |
| ★★ **必须【保留】的** | — | ★ **`try { … } catch` 与两支具名降级**（`what:'systemPrompt'`／`'systemPrompt.section'`／`'systemPrompt.context'`）：★ **拿到服务后调用仍可能抛**（R21 的 ARM A 就是"服务可达但 `section()` 抛"）⇒ ★ **降级不是冗余，是那条真机的守卫** |
| ★ **不再需要** | — | ★ 属性访问那层"未注入即抛"的 try/catch **仍建议保留**（★ 兼容别的宿主实现的 `get` 可能抛） |

★ **净效果**：★ **`delivered:true` 在本宿主上【成为可能】**，★ **同时【不把 `systemPrompt` 加进 `inject`】** ⇒ ★ **A1 第二步的阻塞解除**，★ 且与本文件 `:793-795` 的注释**不冲突**（我们仍然不**要求**该服务，只是**尝试读**）。

## 4. ★ 一条必须同时说清的事（口径）

★ **(C) 成立 ≠ "本宿主一定提供该服务"**：★ `ctx.get` 只是**不抛**，它**仍可能返回 `undefined`** ⇒ ★ **判据必须写成**："★ **拿不到就具名降级（`delivered:false` ＋ `VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason`），拿到就投递**" —— ★ **两条路都要在回执里可区分**（★ 这正是既有 9 键两态同形已经做到的）。
★ 因此 ★ **本项不改变失败语义，只把"必然失败"变成"可能成功"**。

## 5. ★ 范围＋残差（"没核"与"核了"分开写）

**核了**：★ `ctx.get` 的文档语义（`:756`／`:761`）与签名（`:763`）；★ 属性访问的 `inject` 门控与那句错误（`:676`／`:687`）；★ 宿主先例（`dsh-app-boot` 的 `ctx.get("systemPrompt")` ＋ `undefined` 检查）。

**没核（具名）**：
1. ★ **`get(name, strict = true)` 的 `strict` 语义** —— 我**只读到签名**，★ **没有读它的实现**（★ 若 `strict` 影响缺失时的行为，§0 的结论需要复核这一条；★ 宿主先例传的是**默认值**，所以先例本身不覆盖 `strict:false`）；
2. ★ **没有在活宿主上实测**（★ 我的探针跑在**假 ctx** 上，无法观测真实注入）⇒ ★ **本判定是【代码层】的**（本仓接受代码层作为**机制**的证据，★ **行为层仍需真机**）；
3. ★ **范围只有 DSH 这一种宿主** ⇒ ★ **不外推到别的宿主**（★ 别的宿主可能不实现 `get`，或实现不同 ⇒ ★ 所以 §3 里"属性访问那层 try/catch 仍保留"是**故意的**）；
4. ★ **该服务在活会话里是否真的被 `provide`** —— ★ 代码层只能说"宿主包存在且宿主自己在用"，★ **是否提供仍属行为层**（★ 但 R16 的真机 stack 恰好证明**属性访问**那条路不可用，**并未**证明服务不存在）。

## 6. 状态

| 项 | 状态 |
|---|---|
| (C) 判定 | ★★ **成立（code-level）**：`ctx.get` 无 inject 要求、缺失返回 `undefined` |
| 本轮仓内改动 | ★ **零**（只读＋本报告）✓ |
| 阻塞 | ★ **A1 第二步的阻塞可解**（改两处取用为 `ctx.get`；降级保留） |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
| 建议下一步 | ★ 你裁定后，我按 §3 改**两处取用**（★ 若你要，我也可以同批把 `strict` 那条读掉，消掉 §5.1 的未核项） |
