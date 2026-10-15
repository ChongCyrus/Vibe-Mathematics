# Round 20c · vmu-pack（`task-128`）交付报告 —— `pack.plan` 现在跑 M1 校验器 ＋ hint 改成事实 ＋ 过期文档行

> 任务：`task-128`（A `plan`/`buildPlan` 调 `kernel.rules.validate`；B `pack.js:388` hint 二选一；C 能红断言；D `docs/18` 过期行）
> 纪律：结构性编辑**原子**＋每步跑**加载内核**的套件；`pack.js` 一动就重跑 `audit-enforced-consistency` ✓；未跑全量／`regen-all`／git；临时文件 `D:\_tmp`；**定点编辑后立刻核内容**。
> **★ 读的是哪一版**：HEAD = **`df207bd3fe683ec6baf167414e4a1ec601419bb7`**（本轮未 commit）。工作树**并发写入多**，故下面的读数尽量绑定文件／次数。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **A 修 `plan` 校验缺口** | ✅ 在 **`buildPlan`**（`kernel` 在作用域内）对每条 `m.rules` 调 **`kernel.rules.validate(rule)`**；**没塞进 `validatePack`**（纯函数） |
| **B hint** | ✅ 选"**改成事实**"（不是"让它真报全"）—— ★ 因为我**实测 `plan` 仍看不见 middleware MODULE 的问题**（见 §2），"every problem" 依然做不到 |
| **★ 一处实测的行为后果** | ★ **`apply` 侧这一类拒绝的码变了**：`VMU_MIDDLEWARE_FAILED` ⇒ **`VMU_PACK_MISSING`**（`apply()` 先问 `buildPlan`）；⇒ **`plan` 与 `apply` 现在连码都一致** ✓（见 §3） |
| **C 断言** | ✅ 新文件 `tests/vmu-pack-plan-rule-validate.test.mjs` **21/0**；★ **可证伪**（禁掉新块 ⇒ **9 passed / 12 failed**，且失败详情显示 `plan` 回 `ok:true` 的前缺陷形态；复原后 md5 相同、回绿） |
| **D 过期文档** | ✅ `docs/18 §2.6` 的"① `unload` 也必须带 `manifest`"已改为"**已在 R20／task-127 修复**" |
| **本卷外的账（我自己 R20 的文件）** | ✅ `RULE E` 空过指纹 `vmu-pack-inline-manifest.test.mjs:A:busEntries` **已修**（`current=67 = baseline=67`） |
| **门禁** | ✅ `enforced-consistency` **358/0**、`vmu-pack` **53/0**、`vmu-kernel` **175/0**、`vmu-entry` **150/0**、`membership` **29/0**、`audit-vmu-docs` **95/0**、`check-docs` **PASS**、`pack-middleware-shape --selftest` **6/0**；★ `audit-declaration-criterion` **87 passed / 1 failed**，那 1 条是 **`regen-all --check`**（**Lead 的轮末项，与本任务无关**） |

---

## 1. A · `plan` 现在跑 M1 校验器（`buildPlan`，不是 `validatePack`）

**改在哪**：`kernel/pack.js` 的 `buildPlan` 里，紧跟 `const problems = validatePack(m)` 之后：

```js
if (kernel && kernel.rules && typeof kernel.rules.validate === 'function') {
  for (const r of m.rules || []) {
    if (!r || typeof r !== 'object') continue
    let found = []
    // 校验器**抛**不能被当成"没问题"：抛出文本变成 problem，失败仍然可见
    try { found = kernel.rules.validate(r) || [] } catch (e) { found = ['the rule validator threw: ' + String(e && e.message)] }
    for (const p of found) problems.push('rule ' + String(r.id === undefined ? '(no id)' : r.id) + ': ' + String(p))
  }
}
```

| 设计点 | 为什么 |
|---|---|
| 用 **`kernel.rules.validate(rule)`** | ★ 它**一个调用同时管两半**（`validateRule` 的结构校验 ＋ 具名谓词扫描）；`kernel/rules.js:245-250` 的注释自述这同一个不对称**在 rules 层修过一次**（"the predicate scan used to live only inside toBusEntries, so validate() said fine"）—— **pack 层一直绕开它** |
| 放在 **`buildPlan`** | 它是 `createPackLoader` 的闭包，**`kernel` 在作用域内**（同处已在用 `registry`）；★ **`validatePack(manifest)` 是纯函数、拿不到 kernel** ⇒ 塞进去要么改签名、要么静默失效 |
| **接缝是可选** | 无 kernel 的 loader 行为不变 ⇒ **不可能把一个能跑的装配变成被拒的** |
| 每条 problem **带 rule id** | 一个包里多条规则时，"`when is required`"不带名字几乎没用（断言 P1d 守住这一点） |
| 校验器**抛**时 | 转成一条 problem（而不是"没问题"） |

**实测（`D:\_tmp\vmu-pack14\baseline-plan.mjs`，修前／修后）**：

| manifest | 修前 `plan` | 修后 `plan` |
|---|---|---|
| 缺 `when` | `ok=true, problems=[]` | **`ok=false`**，`["rule r-p: when is required (a predicate tree; use {} to always match)"]` |
| `when.subject` 是未知谓词 | `ok=true, problems=[]` | **`ok=false`**，`["rule r-p: when.subject: unknown named predicate: no-such-predicate (known: has_locked_formal_proof, in_frozen_ballot)"]` |
| 合法规则 | `ok=true, problems=[]` | `ok=true, problems=[]` ✓（反方向静默） |
| **真·出货 v5r pack** | `ok=true, problems=[]` | **`ok=true, problems=[]`** ✓ ★ **无回归**（且带 `registry` 时 `requires.ok=true`） |

---

## 2. B · `:388` 的 hint：**选"改成事实"**

**原文**：`'run plan() first: it reports every problem without changing anything'`

**为什么不选"让它真报全"**：★ 我实测 **`plan` 仍然看不见 middleware **MODULE** 的问题** ——

```
plan(bad module).ok=true  problems=[]
apply           => VMU_MIDDLEWARE_FAILED: invalid M2 module m1: hook tools/result must be a function
```

⇒ 那半只有 `kernel/loader` 在 **apply 时**才发现 ⇒ **"every problem" 在可预见的范围内做不到**，继续留着它就是**同一类缺陷**（"代码里的声明比实现宽"）。**改成的事实版**（`pack.js:412`）明确写了 `plan` 覆盖什么、以及哪一半留到 apply：

> `run plan() first: it reports the manifest problems it can SEE without changing anything (validatePack plus the M1 rule validator, kernel.rules.validate); a middleware MODULE is validated by kernel/loader at apply time, so that half can still refuse later`

---

## 3. ★ 一处**实测的行为后果**（值得所有人知道）：这一类拒绝的**码变了**

★ 修完 A 之后，`apply()` **先问 `buildPlan`**（`pack.js`：`const plan = buildPlan(manifest); if (!plan.ok) throw refuse('VMU_PACK_MISSING', …)`）⇒ 缺 `when` 的规则包现在**在到达 loader 之前**就被拒，**码是 `VMU_PACK_MISSING`**，而**不再是** `VMU_MIDDLEWARE_FAILED`：

| 路径 | 修前（core2／verify2 的读数） | 修后（本报告实测） |
|---|---|---|
| 直连 `loader.apply` | 抛 `VMU_MIDDLEWARE_FAILED` | **抛 `VMU_PACK_MISSING`**，消息 `pack p-nowhen cannot be applied: rule r-nowhen: when is required …` |
| 真入口 `config.packs` | 宿主 stderr 一行 `VMU_MIDDLEWARE_FAILED …` ＋ `appliedPacks:[]` | 记录 **`VMU_PACK_MISSING`** ＋ `appliedPacks:[]` |
| `plan` | `problems=[]`（缺陷） | **`ok=false, code=VMU_PACK_MISSING`** |

⇒ ★★ **正面结论**：`plan` 与 `apply` 现在**连码都一致**（断言 `F3b` 直接钉住 `planned.code === applyErr.code`），这正是本任务 C④ 要的"两路径读数一致"；★ **注意事项**：**任何钉在旧码 `VMU_MIDDLEWARE_FAILED` 上的断言或叙述**（`core-round20b-report.md §3` 的读数即是）**现在会看到不同的码** —— 我自己的第一版测试就钉了旧码，**两条断言当场红**，改正后才绿（见 §5 自陈）。

---

## 4. C · 断言与可证伪（`tests/vmu-pack-plan-rule-validate.test.mjs`，**21/0**）

| 组 | 断言 |
|---|---|
| **A（源头）** | P0a/P0b/P0c：**`kernel.rules.validate` 自己**报缺 `when`／报未知谓词／对合法规则**静默** ⇒ ★ **"plan 静默"不可能靠阉掉校验器买到** |
| **B（正）** | P1/P1b/P1c/P1d：缺 `when` ⇒ `plan.ok===false`、码 `VMU_PACK_MISSING`、文本含 `when is required`、**且点出是哪条规则** |
| **C（正）** | P2/P2b/P2c：未知 `when.subject` ⇒ 同样具名，且**点名那个谓词**与所属规则 |
| **D（反）** | P3/P3b：**合法规则 plan 静默**（没有这条，"plan 拒绝"可能只是"plan 恒拒"） |
| **E（无回归）** | E0/E1：★ **真·出货 v5r pack**（带 `registry`，与入口同构）仍 **`plan.ok===true` 且 problems 为空** |
| **F（两路径）** | F1–F3b（直连：plan 具名拒／apply 同码同因／**两读数点名同一条规则／码相同**）＋ F4–F6（真入口：`appliedPacks` 为空／拒绝**被记录**且同码／**同一条规则同一个因**） |

★ **可证伪（`D:\_tmp\vmu-pack14\falsify-r20c.mjs`，逐字节复原）**：
- 基线 `pack.js` md5 = **`8973bb5f6fbd30962127d755fa28beaa`**；
- 把新块的守卫改成 `if (false) {`（＝精确的修前行为）⇒ **`9 passed, 12 failed`，EXIT=1**，失败详情里 `plan` 回的正是 **`{"ok":true,…}`** 前缺陷形态；
- 复原 ⇒ **md5 逐字节相同**，测试回 **21/0**。

★ **为什么另起新文件而不是追加进 `vmu-pack-tool-actions.test.mjs`**（core2 的文件）：① 主题不同（那是**工具动作**，这是 **pack.plan 的对称性**）；② 协调条款要求**别两边同时改同一文件** ⇒ 用新文件名，避免两个写者。

---

## 5. ★ 我自己的两次"断言描述了旧世界"（按 `docs/11 §4.2` 第八条记录）

1. **本任务的 F2/F5**：我按 core2 的读数把期望写成 `VMU_MIDDLEWARE_FAILED`，而修复后这一类改走 `VMU_PACK_MISSING` ⇒ **两条断言当场红**。★ 这不是代码错、也不是读数错，而是**我的断言钉在修复前的世界**上；改正并把"**两路径码一致**"变成显式断言（F3b）之后才绿。
2. **`RULE E` 空过指纹（我 R20 的文件）**：`vmu-comms2` 量到我 `tests/vmu-pack-inline-manifest.test.mjs` 有一个**新增空过指纹** `A:busEntries` —— 即 `A3b` 的 `busEntries.every(…)`：★ **`[].every(…)` 恒真** ⇒ 该断言**无法失败**（正是本任务 A 要修的那一类"守卫什么都没守"）。**已修**：把非空前置放进**同一表达式**（`busEntries.length > 0 && …`）并把计数写进 detail；★ 我顺手把同文件 `B2`／`B3` 的两个 `errs.every(…)` 也加了同表达式前置（它们当时未被门禁抓到，但**同样恒真**）。
   - 门禁读数：门禁在我修前量到 `current=68 / baseline=67`，**修后 `current=67 / baseline=67`** ✓；
   - ★ `comms2` 随后**自己更正**了它的通报（它 16:27 的读数 → 16:30 复跑已是 67=67），并把两版读数＋时刻＋哈希并列写进它的报告 —— **门禁读数必须绑版本**这条纪律在本轮被两个方向各证一次。

---

## 6. D · 过期文档行已更正（`docs/18 §2.6`）

`docs/18:143` 那段原写"★ 轮 20 实测（两条与实现不符）：① **`unload` 也必须带一个 `manifest`** …"。★ core2 的 `task-127` 修好后，**① 已过期** ⇒ 改为：
> ★ **轮 20 实测（两条曾与实现不符）**：① ~~**`unload` 也必须带一个 `manifest`**~~ ⇒ ★ **已在 R20／`task-127` 修复**（`host.js` 把 unload 分支移到"缺 manifest 即拒"的判断**之前**）…… 而 `{action:'plan'}`／`{action:'apply'}` 无 manifest **仍被具名拒**（上移的是分支，守卫没删）。② `id` 只对 `unload` 生效 …… 说明已同步改成事实。③ `manifest` 是 JSON 文本 ⇒ **载不动 M2 模块**。

★ 保留"曾"字与删除线是刻意的：**本仓口径是"更正一条声明就要改掉那条声明"，同时不抹历史**（与 comms2 并列两版读数同一纪律）。

---

## 7. 改了什么／没改什么

| 动作 | 文件 |
|---|---|
| ✍️ 修 A | `vibe-math-vmu/kernel/pack.js`（`buildPlan` 里接入 `kernel.rules.validate`） |
| ✍️ 改 B | `vibe-math-vmu/kernel/pack.js:412`（hint 改成事实 ＋ 就地记下"为什么不是'报全'"） |
| ✍️ 新 C | `tests/vmu-pack-plan-rule-validate.test.mjs`（21/0）＋ `package.json#files` **只加 1 行**（定点 `edit`） |
| ✍️ 更正 D | `vibe-math-vmu/docs/18-command-and-protocol-reference.md:143` |
| ✍️ 修（本卷外，我 R20 的文件） | `tests/vmu-pack-inline-manifest.test.mjs`（RULE E 空过指纹） |
| ❌ 未改 | `kernel/loader.js`、`kernel/rules.js`、`host.js`、`vibe-math-vmu.js`、`kernel/meetings.js`；**没有**追加进 `tests/vmu-pack-tool-actions.test.mjs`（core2 的文件） |

---

## 8. 原样命令 ＋ 退出码（同一次最终扫）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-plan-rule-validate.test.mjs` | `21 passed, 0 failed` | **0** |
| `node tests/vmu-pack-inline-manifest.test.mjs` | `35 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed`（★ `pack.js` 动过 ⇒ 必跑） | **0** |
| `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed`（真入口装 v5r ⇒ 无回归） | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed`（新测试已双登记） | **0** |
| `node tests/audit-declaration-criterion.test.mjs` | `87 passed, 1 failed` —— ★ **失败＝`regen-all --check`（Lead 轮末项，非本任务）**；`RULE E fingerprints: current=67 baseline=67` ✓ | 1 |
| `node tests/audit-vmu-docs.test.mjs` | `95 passed, 0 failed` | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node scripts/audit-pack-middleware-shape.mjs --selftest` | `6 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-pack14\baseline-plan.mjs` | 修前／修后对照（§1 表） | 0 |
| `node D:\_tmp\vmu-pack14\falsify-r20c.mjs` | 禁块 ⇒ `9 passed, 12 failed`；复原 ⇒ `21 passed, 0 failed`，md5 相同 | 0 |

---

## 9. 交回 Lead／`vmu-verify2`

1. **A/B/C/D 完成**：`plan` 现在跑 M1 校验器（两半），hint 改成事实，新套件 **21/0** 且**可证伪**，`docs/18` 过期行已更正。
2. **★ 请转告 `vmu-core2`（它报告 §3 的读数因此变化）**：修完 A 后，这一类在 **`apply` 侧的码从 `VMU_MIDDLEWARE_FAILED` 变成 `VMU_PACK_MISSING`**（因为 `apply()` 先问 `buildPlan`），且 **`plan` 与 `apply` 现在同码同因**。⇒ ① 它的 `core-round20b-report.md §3` 的 `apply→threw VMU_MIDDLEWARE_FAILED` 是**修前**读数，宜加"修前"限定（它自己已在 §4 对 `ERR_INVALID_ARG_TYPE` 这么做了）；② 任何以旧码为判据的断言／叙述要跟着改。
3. **★ 请把一条**具名**收进账**：`plan` **仍看不见 middleware MODULE 的问题**（`plan.ok=true` 而 `apply` 拒 `invalid M2 module … hook … must be a function`）⇒ 本任务只把这个 hint 改成事实，**没有**修那一半（它需要把 `kernel/loader` 的模块校验提前到 plan，属另一个设计问题）。★ 我**未**擅自扩大范围。
4. **边界**：本任务**未跑**真 DSH 会话（与工具面／装载面无必要）；`audit-declaration-criterion` 唯一红项是 `regen-all --check`（Lead 的轮末重生成）。★ 我**没有**改 `kernel/loader.js`／`kernel/rules.js`（校验器本身就是对的，缺的是 pack 没调它）。
