# Phase 3 · 三条"未定论项"的定论（5.2 / 5.4 / 5.5）—— 决定施工单 C-3 取 A 还是 C

> **只读**：未改任何代码、未跑 git、未跑 T1／全量。★ 唯一写入＝本文件。临时件在 `D:\_tmp\r84`（5.5 的探针 `probe.mjs`）。
> ★ 口径：**"已定论（我读到了）"与"仍需运行时观测"分开**；每条给 `file:line` ＋ 引文。

---

## 5.2 `ORDER_RANGES`／`range` 词表是否还有第三个值？

**结论（已定论）**：★ **没有"第三个"这回事 —— 一共有【5 个】range 值**，且它们是**唯一的词表**：

```js
// kernel/prompt/index.js:24-30（我逐字读到）
export const ORDER_RANGES = Object.freeze({
  facts: [0, 199],        // state, time, budget: framework-owned
  charter: [200, 399],    // charter / role
  contract: [400, 599],   // mechanism contracts that must be replayed every turn
  pack: [600, 899],
  override: [900, 9999],  // overrides and middleware appends
})
```

**证据（`range` 在本文件出现的每一处，均已读）**：
| file:line | 引文 | 作用 |
|---|---|---|
| `kernel/prompt/index.js:242-245` | `for (const [range, [lo, hi]] of Object.entries(ORDER_RANGES)) { if (order >= lo && order <= hi) return range }` … `throw refuse('VMU_INVALID_ARGUMENT', 'section ' + name + ': order ' + order + ' is outside every reserved range')` | ★ **`range` 不是输入、而是由 `order` 派生**；落在任何区间之外 ⇒ **具名拒**（不存在"第六个/隐含值"） |
| `:299` | `const range = inRange(order, name)` | 派生点 |
| `:308-319` | `const declaredRange = … section.range …`；`:312` `unknown range "…"`；`:317` `declares range "…" but order … lies in "…"`；`:318` 提示 `ORDER_RANGES[declaredRange].jo…` | ★ 调用方**可以声明** `range`，但**必须与派生的那个相等**，否则**具名拒** |
| `:321` | `if (range === 'facts' && declaredSource.startsWith('pack')) throw refuse('VMU_NOT_PERMITTED', …'framework-owned facts interval')` | `facts` 为框架专属 |
| `:333` | `if (existing.range === 'pack' && range === 'pack') throw refuse('VMU_MIDDLEWARE_FAILED', 'two pack sections claim the same name: …')` | pack↔pack 具名拒 |
| `:347` | `if (range === 'pack' && existing.range !== 'pack')`（C2 的替换守卫） | ★ 只有 **pack 段替换非 pack 段**才走"声明式替换"这条路 |
| `:360` / `:524` / `:750` | `range,`（写进 registry 条目）／`{ name: 'state', order: 0, range: 'facts', … }`／`status()` 里 `.map((e) => ({ …, range: e.range, … }))` | 五个值**只在注册与视图里流转** |

**对 C-3 的影响**：★ 无阻塞。★ 若 C-3 的措辞是"range 有三个值"，**应改为五个**（`facts/charter/contract/pack/override`）。
★ **未读**：`docs/06 §7`（`:23` 注释引用的文档）⇒ 我**没有**核"文档是否也列全了 5 个"（见 §5 覆盖率）。

---

## 5.4 `vmu.prompts.overrides` 的语义："文本覆盖"还是"面替换"？

**结论（已定论）**：★ **是【文本覆盖】，不是面替换** —— 而且**它覆盖不了 C2 所需的那一部分**。

**证据（读到函数结束，不是读一行）**：
```js
// kernel/prompt/index.js:199-209 —— 覆盖的完整实现（我读完了）
const overrideFor = (name, lang) => {
  const perLang = overridesByLangOf()[name]           // ① 按语言的覆盖（live）
  if (perLang && typeof perLang === 'object') { for (const l of langOrder(lang)) if (typeof perLang[l] === 'string') return { text: perLang[l], source: 'byLang:' + l } }
  if (typeof overrides[name] === 'string') return { text: overrides[name], source: 'plain' }            // ② 调用方的
  const declared = declaredOverrideOf(name)
  if (typeof declared === 'string') return { text: declared, source: 'plain:settings' }                 // ③ 声明的 vmu.prompts.overrides
  return { text: null, source: null }
}
```
★ 返回值是 **`{ text, source }`**（**只有文本**）⇒ 消费点也只取文本：`:437` `const ov = overrideFor(entry.name, ctx && ctx.lang)`、**:629** `const overrideText = overrideFor(entry.name, ctx && ctx.lang).text` ✓
★ 记账面（`:385`）逐字：`const overrideMerge = { declared: Object.keys(declaredOverrides).length, fromCaller: Object.keys(overrides).length }` ⇒ ★ **只是计数**（declared／fromCaller 各几个），**不含"替换了谁"** ✓；`declaredOverrides` 自己的注释也说明它**只为回执保留**（`:180-181`：*"`declaredOverrides` is kept only for the RECEIPT (`overrideMerge`); the text itself is read live by `declaredOverrideOf`"*）✓
★ 另一条独立证据：覆盖还有"必须是**已知且可变**的段"的约束 —— `override(section, text, by)` 在 `:667-680`：`pickFor(section)` 找不到 ⇒ `refuse('VMU_NO_SUCH_OBJECT', 'unknown section: …')`；`entry.mutable === false` ⇒ `refuse('VMU_NOT_PERMITTED', 'section … is immutable …')` ⇒ ★ **它只能改"已经注册好的段"的文本**，**不能**把某个面**换掉/撤下** ✓
★ 而 C2 要的"**谁能顶掉谁**"是**注册期**的事，已由 `register()` 的第三支承担：`:347`（`range === 'pack' && existing.range !== 'pack'`）＋ `replaces` 声明 ＋ `replacedSections` 记录（见 5.5）✓

**对 C-3 的影响**：★ 两个通道**职责不同、不能互相替代**：`vmu.prompts.overrides` ＝ **读取期文本替换**（值层）；`replaces` ＝ **注册期面替换声明**（结构层）。★ 因此**不能**把"面替换"记在 `overrides` 名下 ✓

---

## 5.5 C2 的"位移记录"是否已经进了【回执可见面】？

**结论（★ 运行时探针 ＋ 静态读代码，两者一致）**：★ **进了【装配回执】，但【没进内核的 status/审计面】**。

**★ 运行时读数（探针：声明 `replaces` 的 pack 段替换框架段，`D:\_tmp\r84\probe.mjs`，未改任何仓内文件）**：
```
assemble() 返回的 keys = ["ok","text","sources","truncation","compaction","variableMisses","missingVariable",
                          "locale","localeMisses","glossary","overrideMerge","replacedSections","replacedCount","enforced","at"]
★ replacedSections = [{"section":"fw-policy","displacedSource":"kernel","displacedOrder":300,
                        "replacedBy":"pack:v5r","declaredReplaces":["fw-policy"]}]
★ replacedCount    = 1
★ overrideMerge    = {"declared":0,"fromCaller":0}
⇒ ★ 具名位移字段 = ["replacedSections","replacedCount"]   （字段路径：回执顶层）
```
**★ 同一探针读 `pipeline.status()`**：`keys = ["sections","bindings","truncation","middlewareAppends"]` ⇒ ★ **没有任何位移字段**（`status().sections` 里 `fw-policy` 只剩**替换后**那一条：`{name:"fw-policy",order:700,range:"pack",source:"pack:v5r"}` ⇒ ★ **从 status 看不出它顶掉了谁**）✓

**★ 静态读数（两边都读了，按提示）**：
- 产生处：`kernel/prompt/index.js:347`（守卫）＋ `let displaced = null`（`:320` 一带）＋ `if (displaced) replacedSections.push(displaced)`（`:359` 一带）⇒ ★ 记录在 **pipeline 内部列表**；`const replacedSections = []`（`:286-288` 的注释逐字：*"this list is what the assembly receipt publishes (`replacedSections`, next to `overrideMerge`), so \"what got displaced, and by whom\" is auditable"*）✓
- 出口：`kernel/prompt/index.js` 的装配回执（`:690` 一带，紧挨 `overrideMerge`）✓
- ★★ **内核侧：`kernel/index.js` 里 `replacedSections`／`replacedCount`／`displaced` 的出现行号 = `[]`（0 处）** ⇒ ★ **内核的 status／组装视图没有把它接出去**；（唯一候选的 prompt 面在 `kernel/index.js` 9,25,187,191,279,478，见下）

**★ 最接近的可见出口（给 `file:line`）**：
1. ★ **最直接**：`kernel/prompt/index.js` 的 **assemble 回执**（`replacedSections`／`replacedCount`，`:690` 一带）⇒ **只要调用方拿的是装配回执就能看到** ✓
2. ★ **内核面**：`kernel/index.js:2303` 附近是唯一提到 `prompt` 的表面区（★ 我的机械检索给出该行；**我没有逐字读完该函数** ⇒ 见 §5）⇒ ★ 若 C-3 要求"操作者从内核 status 就能看到谁顶掉了谁"，则需在此**把它接出去**（★ 施工量：**一处透传**）

**对 C-3 的影响（★ 这是决定 A/C 的那条）**：★ 记录**已经产生且已具名**（不是"要发明字段"），但**可见性只到装配回执**；★ **内核的 status 面看不到** ⇒ ★ 若 C2 的判据是"**部署声明可见且可核**"且**以装配回执为准** ⇒ **A（已可见）**；若判据要求"**从内核 status/审计面可见**" ⇒ ★ **C（需施工，且很小：一处透传）** ✓

---

## ② C-3 该定为 A（已可见）还是 C（需施工）？

**建议：★ C（需施工），理由是 5.5 的"半可见"** —— 三条合起来看：
1. ★ **5.2 不构成阻塞**（range 是 5 个值、由 order 派生、越界具名拒；C-3 若写"三个值"需订正为五个）✓
2. ★ **5.4 不构成阻塞、但不能算数**：`vmu.prompts.overrides` 是**读取期文本覆盖**（只返回 `{text,source}`、记账只有计数），**覆盖不了**"谁顶掉了谁" ⇒ ★ C2 的那部分**本来就该记在 `replaces`／`replacedSections`** 名下 ✓
3. ★★ **5.5 是决定项**：位移记录**已具名**（`replacedSections`／`replacedCount`，含 `section`／`displacedSource`／`displacedOrder`／`replacedBy`／`declaredReplaces` 五个字段）且**已进装配回执**，但 **`status()` 与 `kernel/index.js` 都没有它**（0 处）⇒ ★ 若 C-3 的"可见"指的是**部署/运维可见面**（status／审计），则**判 C**，施工＝**把 `replacedSections` 透传到内核的 prompt/status 视图一处**（★ 不许新造字段，字段已存在）✓
★ **一句话**：**A 的成绩（记录已存在、已具名、已在装配回执里）值得保留；C 的工作量只剩"把它接到内核 status 面"这一处透传** —— 我建议**定 C，且把施工范围压到"一处透传 ＋ 一条断言"** ✓

---

## ③ 我没读的区域（诚实）
1. ★ **`docs/06 §7`**（`ORDER_RANGES` 引用的文档）⇒ ★ **未核"文档是否列全五个 range 值"**（本报告只保证**代码**里是 5 个）✓
2. ★★ **写报告时补读到了（原写"未读"，现更正）**：`kernel/index.js:2303` 逐字 = `prompt: prompt.status ? prompt.status() : null,` ⇒ ★ **内核的 status 只是把 `pipeline.status()` 原样透传**，而 `pipeline.status()` 的键是 `["sections","bindings","truncation","middlewareAppends"]`（**无位移字段**）⇒ ★★ **所以"内核面看不到位移"是【结构性】的（不是推断）**，且**施工点精确到一处**：在 `kernel/prompt/index.js` 的 `status()` 里增加 `replacedSections` 出参 ⇒ `kernel/index.js:2303` 会自动把它带出去（**透传那行不用改**）✓
3. ★ **`overridesByLangOf()` 的实现体**（它属于 settings 侧）⇒ 我读到的是**调用与优先级**（`:201-203`），★ 未读它如何取 `vmu.prompts.overridesByLang` ✓
4. ★ **未跑任何套件**：本报告的 5.5 结论来自**我自己的临时探针**（真装配），★ 不是来自仓内测试 ⇒ ★ 若要把"回执可见／status 不可见"变成**常驻断言**，需另开一条（我本轮写域只有本文件）✓