# Round 21 · vmu-pack（`task-130`）交付报告 —— 形状 B 死条目已修（行为变更，已具名）＋ 两处措辞收窄

> 任务：`task-130`（A 把 `middleware[{kind:'rules'}]` 改走 `kernel.rules.toBusEntries`；B 五条能红断言；C 两处措辞收窄）
> 纪律：结构性编辑**原子**；`pack.js` 一动就重跑 `audit-enforced-consistency` ✓；每步跑**加载内核**的套件；未跑全量／`regen-all`／git；临时文件 `D:\_tmp`；**异步观测全部 `await`**（`JSON.stringify(<Promise>)` ＝ `"{}"` 是漏 `await` 的指纹 —— 本轮真出现过）。
> **★ 读的是哪一版**：起点 HEAD = **`d2e45107df3fd8ed65229d259d1cc613dbff9202`**（Lead 的提交，T1 315/315）；`pack.js` 起点 md5 = **`4cb44dd8b282e8fe439f244e588f17f1`**。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **A 形状 B** | ✅ `middleware[{kind:'rules'}]` 改走 `kernel.rules.toBusEntries`（与 `manifest.rules` 同一条路）⇒ **校验／编译／真触发三者一起成立**；★ **行为变更已在代码注释、`docs/18` 与本报告具名** |
| **B 断言** | ✅ `tests/vmu-pack-plan-rule-validate.test.mjs` **35/0**；★ **两半各自可证伪**（禁 middleware 分支 ⇒ **32/2 红**；`buildPlan` 退回只看 `m.rules` ⇒ **33/1 红**；两次复原 **md5 逐字节相同**） |
| **C 措辞收窄** | ✅ `docs/18:145`（`buildPlan` 的对象是 **`manifest.rules[]`** ＋ 明写形状 B 曾经的洞与已修）／`docs/10 §9.5`（**②运行期只吃内联 manifest**，**随包 pack 只能走 ①**，"运行期按 id 装载"**不存在**） |
| **★ 我自己造成的两条红（已修，具名）** | ① 我在**注释里**写了两个**探针夹具码**（反引号）⇒ `audit-vmu-docs` **94/1**；② 我把 H3 断言**放在 `if (name === 'v5r')` 里** ⇒ `RULE E multi-line C` **新增指纹**。两条都**不是逻辑错**，但都是"声明/断言比实现宽"那一类 ⇒ 见 §5 |
| **门禁** | ✅ **全绿**（含 `audit-declaration-criterion` **88/0**，此前那条 `regen-all --check` 已由 Lead 重生成解决） |

---

## 1. A · 形状 B 的修法（两处，都在 `kernel/pack.js`）

### 1.1 `apply()` 的 middleware 循环：新增 `kind:'rules'` 分支

```js
if (m && typeof m === 'object' && m.kind === 'rules') {
  if (!kernel.rules || typeof kernel.rules.toBusEntries !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack … declares an M1 rule as a middleware entry (…) but this kernel has no rules engine',
      'the rules engine compiles a rule into its bus entry; without it the entry would reach the bus with no handler and silently never fire')
  }
  const entries = kernel.rules.toBusEntries([m])
  for (const e of entries) { kernel.bus.add(e); undo.push(() => removeEntry(kernel.bus, e.id)) }
  continue
}
```
★ 与 `manifest.rules` 在**同文件**走的调用**完全同一条**（`kernel.rules.toBusEntries`）⇒ 一处修好，**校验、编译、真触发**同时成立。
★ 无 rules 引擎时**具名拒**（不是静默退化成旧行为）。

### 1.2 `buildPlan()` 的校验列表：覆盖**两种**声明位置

```js
const declaredRules = [
  ...(m.rules || []),
  ...(m.middleware || []).filter((x) => x && typeof x === 'object' && x.kind === 'rules'),
]
```
⇒ `plan` 与 `apply` 对**两种形状**都对称。

### 1.3 ★ 行为变更（**具名，不静默**）

★ **该形状的合法规则现在真的会开火**（此前是死条目）。**已裁决接受**，`pack.js` 的注释、`docs/18:145` 与本报告三处都写明了。依据：**零出货包受影响** —— 出货包的 `kind:'rules'` **全部在 `rules[]` 条目内部**，`middleware[]` 里 **0 个**（`institute-min` rules 1/mw 0；`v5r` rules 1/mw 4（其中 rules 0）；`v3-core` mw 2（其中 rules 0））。

### 1.4 修前／修后（**同一探针**，`await` 到位）

`D:\_tmp\vmu-pack14\isolate.mjs`，两谓词 × 两 emit 模式：

| 形状 | `when` | emit 模式 | 修前 | **修后** |
|---|---|---|---|---|
| **A** `rules[]` | `{}` | plain | `deny VMU_ALWAYS` | `deny VMU_ALWAYS`（不变 ✓） |
| **B** `middleware[{kind:'rules'}]` | `{}` | plain | **`null`（死）** | ★ **`deny VMU_ALWAYS`** |
| **A** | `{all:[{tool:['vibe_vmu_script']}]}` | plain | `deny VMU_TOOL` | `deny VMU_TOOL`（不变 ✓） |
| **B** | 同上 | plain | **`null`（死）** | ★ **`deny VMU_TOOL`** |
| **B** | 同上 | **`bridge:true`** | `null`（死） | ★ **`deny VMU_TOOL`** |

★ 并且 **`plan` 侧**也补齐（`D:\_tmp\vmu-pack14\r21-check.mjs`）：形状 B + 缺 `when` ⇒ `plan.ok=false, code=VMU_PACK_MISSING, problems=["rule rb: when is required …"]`；未知谓词 ⇒ 同形具名；`apply` 同码。
★ **出货包零回归**（faithful loader：带 `settingSource` ＋ `onPromptPolicy`）：`institute-min`／`v3-core`／`v5r` **plan 与 apply 全 ok**，且 ★ **v5r 自己那条 M1 规则仍然开火**（`deny VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`，按 `tool` 判别 ⇒ 不是"一律 deny"造成的假象）。

---

## 2. B · 断言（`tests/vmu-pack-plan-rule-validate.test.mjs`，**35/0**）

| 组 | 断言 |
|---|---|
| **G（两形状必须一致）** | **G1** 形状 A 触发（**基线**，有它 G2/G3 才有意义）；**G2** 形状 B 的条目**确实上总线**（`entries.length > 0 &&` 前置在同一表达式）；★ **G3 形状 B **真的触发**（`VMU_SHAPE_DENY`）；**G4a/G4b** 形状 B ＋**受限谓词**：命中即 deny／不命中即**静默**（证明是**谓词在决定**，不是一律 deny）；**G5** 形状 B ＋非法规则 ⇒ **plan 就具名拒** |
| **H（出货包零回归）** | **H0** 出货清单**真的含 v5r**（H3 的前提被自己断言）；**H1/H2** 三个出货包 plan 干净 ＋ apply 不抛；★ **H3** v5r 的 M1 规则**仍然开火**（按 `tool` 判别） |
| **A–F（既有）** | 源头（`kernel.rules.validate` 自身）／plan 具名（缺 `when`／未知谓词）／反方向静默／两路径（直连与真入口**同码同因**）—— 全部保留 |

★ **可证伪（`D:\_tmp\vmu-pack14\falsify-r21.mjs`，逐字节复原）**：

| 复原 | 读数 |
|---|---|
| **M1** 把 middleware 的 `kind:'rules'` 分支改成 `if (false)`（＝旧的原样 `bus.add`） | **`32 passed, 2 failed`，EXIT=1** —— **G3／G4a** 失败，详情 `[null]`（＝死条目） |
| **M2** 把 `buildPlan` 的 `declaredRules` 退回只看 `m.rules` | **`33 passed, 1 failed`，EXIT=1** —— **G5** 失败，详情 `{"ok":true,…}`（＝plan 静默） |
| 两次复原后 | `pack.js` **md5 与基线逐字节相同**；测试回 **35/0** |

★ **我自己当场修掉的一条自己的错断言**：G4 第一版我用的是 `when:{}`（**恒匹配**）规则，却断言"不匹配时静默" ⇒ **G4 红**。★ 那不是代码错，是**我的断言与所选规则不自洽**（恒匹配规则当然对任何 payload 都 deny）；改成**受限谓词**后 G4a/G4b 才有判别力。

---

## 3. C · 两处措辞收窄（一次落笔）

### 3.1 `docs/18:145`（core2 加的 bullet）
- **收窄**：`plan` 覆盖 **`manifest.rules[]` 的 M1 规则**（原文写"**M1 规则**"，会被读成"**所有** M1 规则"）；★ 补上"轮 21 起同一处**也覆盖 `middleware` 里 `kind:'rules'` 的条目**"。
- **明写**：`middleware:[{kind:'rules',…}]` **曾经既不被校验也不触发**（旧版原样 `bus.add` ＋ `bus.js` 对 `kind:'rules'` **豁免** handler ⇒ emit 只记 `middleware/skipped`，**合法规则也永不触发**）⇒ ★ **轮 21 已修**，且**这是一次行为变更**（已接受，零出货包受影响）。
- ★ **与"不把 loader 拉进 `buildPlan`"是两件不同的事**：本条讲 **`plan` 的覆盖面**（哪些声明能在预览期被具名拒），那条讲 **`plan` 要不要引入 `loader` 依赖** —— 已就地写明**互不顶替**。

### 3.2 `docs/10 §9.5`（comms2 具名的同卷自相矛盾）
- 标题从"装载（两条路，**均已可用** ✓）"改成"（**两条路，但【能力不同**]✓）"。
- 正文补：**②运行期只吃【内联 manifest**]（`host.js` 的参数是**一个 JSON 文本**）⇒ ★ **它不能按 id 装载随包 pack**，也**载不动 M2 模块**（`hooks` 是函数，活不过 `JSON.stringify`）；**随包 pack 只能走 ①**（profile 行的 `config.packs`）⇒ ★ **"运行期按 id 装载随包 pack"这个能力不存在**（`{action:'plan', id:'v5r'}` 实测被拒 `VMU_INVALID_ARGUMENT`）。
- ★ 与本卷 `:436`（**自己早就写对**的那一处）对齐 ⇒ **同卷不再自相矛盾**。
- ★ **未改** `docs/10:436`（它本来是对的）—— 收窄只针对 `:512/:514` 这两处读起来像"两条路等价"的措辞。

---

## 4. 分工记录（Lead 要求"只落自己那一处并具名告知"）

| 件 | 归属 | 状态 |
|---|---|---|
| `pack.js` 形状 B 两处 | **我** | ✅ 已落（§1） |
| `docs/18:145` 收窄 | **我** | ✅ 已落（§3.1）；★ 已告知 core2：**它那条"过渡口径"（我的 bullet 仍过宽）本轮结束** |
| `docs/10 §9.5` 口径对齐 | **我** | ✅ 已落（§3.2） |
| `tests/vmu-pack-tool-actions.test.mjs` 的 **S1 一行补丁** | **core2** | ⏳ 它的文件、它落（我**未碰**；本轮它 17/0 仍绿） |
| `_handoff/vmu/core-round20b-report.md §3` 的 caveat | **core2** | ⏳ **它自己的报告**（本仓惯例：报告由作者改；我未碰） |
| `vibe-math-vmu.js`／`kernel/loader.js`（task-129） | **core2** | ★ 我**本轮未动**（已与它书面确认：我不会动这两处，必要时先发它） |

---

## 5. ★ 我自己造成的两条红（都记下来，因为它们正是本任务的主题）

| # | 我做了什么 | 门禁怎么抓的 | 我怎么修的 |
|---|---|---|---|
| **1** | 在 `pack.js` 的**注释里**用反引号写了两个**探针夹具码**（`VMU_ALWAYS`／`VMU_TOOL`）。★ 这是我 task-125 实验里的**合成码**，**`pack.js` 根本不会抛它们** | `audit-vmu-docs` 的代码侧用 `CODE_LITERAL_RE`（引号/反引号里的码）**对整文件原文跑、不去注释** ⇒ 要求它们在 `docs/03 §8` 登记 ⇒ **94/1 EXIT=1**（`vmu-verify2` 在复核提交版时也独立撞到并告知我） | ★ 把那两个夹具码**从注释里去掉**（改成"the same rule in `rules[]` denies by name"）⇒ **95/0 回绿**。★ **这不是"门禁在指挥措辞"**：那两个码**本来就不该以字面量出现在这里**（会让人以为本文件能抛出它们）⇒ 去掉是**正确性改进**；但门禁"把注释当代码"这个**判据问题依然存在**，见 §5.1 |
| **2** | 把 H3 断言放在 **`if (name === 'v5r') { … }`** 里 | `RULE E multi-line C`（C2）**新增指纹** ⇒ 红。C2 的判据：语句位 `if (...)` 的块里出现断言 ⇒ **分支不走则该断言被静默跳过，且无其它东西报告它** | ★ **把 H3 提出循环、改为无条件运行**，并加 **H0** 断言"清单真的含 v5r"（让前提自己也被断言）⇒ **C2 指纹清零**（`files=57 baseline=57`）＋ 顺带**断言更强**（不可被跳过） |

★★ **两条合起来是一个自证**：本任务修的是"**声明了不生效**"，而我这两处**恰好也是"声明/断言比实现宽"**（注释像在说"本文件会抛这两个码"；断言看起来守着 v5r 其实可以被跳过）。**门禁与同行各自抓到一条。**

### 5.1 ★ 具名的**门禁缺陷**（不是我的，需 Lead 派单，我未改）
`tests/audit-vmu-docs.test.mjs` 的**代码侧**扫的是**整文件原文**、**不过 `tests/_lib/strip-comments.mjs`** ⇒ ★ **注释被当成代码**（与 `docs/11` 第七条"门禁必须读事实所在的那种文本"相反）。建议的**正解**：代码侧先过 `strip-comments`，并配**双向自探针**：**注释里**的码**不得**计入、**字符串里**的码（真能抛的）**必须仍计入**。★ 该门属 `vmu-verify2` 领域、且属**新工作** ⇒ 它已建议派单，我**未擅自动门**。★ 我只做了止血（§5 第 1 条），并在 `pack.js` 注释里留了一行指路，免得下一个人再踩。

---

## 6. 原样命令 ＋ 退出码（同一次最终扫，**全绿**）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-plan-rule-validate.test.mjs` | `35 passed, 0 failed` | **0** |
| `node tests/vmu-pack-inline-manifest.test.mjs` | `35 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed`（★ `pack.js` 动过 ⇒ 必跑） | **0** |
| `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` | **0** |
| `node tests/audit-declaration-criterion.test.mjs` | **`88 passed, 0 failed`**（★ 此前那条 `regen-all --check` 已由 Lead 重生成解决） | **0** |
| `node tests/audit-vmu-docs.test.mjs` | `95 passed, 0 failed` | **0** |
| `node tests/audit-doc-index.test.mjs` | `5 passed, 0 failed` | **0** |
| `node tests/audit-verbatim-claims.test.mjs` | `3 passed, 0 failed` | **0** |
| `node tests/audit-pack-face.test.mjs` | `5 passed, 0 failed` | **0** |
| `node tests/vmu-pack-tool-actions.test.mjs` | `17 passed, 0 failed`（core2 的） | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node scripts/audit-pack-middleware-shape.mjs --selftest` | `6 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-pack14\isolate.mjs` | 修前/修后对照（§1.4） | 0 |
| `node D:\_tmp\vmu-pack14\r21-check.mjs` | plan 具名 ＋ 出货包零回归（§1.4） | 0 |
| `node D:\_tmp\vmu-pack14\falsify-r21.mjs` | M1 ⇒ 32/2 红；M2 ⇒ 33/1 红；复原 md5 相同 ⇒ 35/0 | 0 |

★ **临时文件全部在 `D:\_tmp`**，未进仓；**未跑全量 T0/T1、未 `regen-all`、未 git 写**。

---

## 7. 交回 Lead／`vmu-verify2`

1. **A/B/C 全部完成**：形状 B 死条目已修（**行为变更已具名**），断言 **35/0** 且**两半各自可证伪**，两处措辞已收窄并**一次落笔**。
2. **★ 请 `vmu-verify2` 派单的那条门禁缺陷**（§5.1）：`audit-vmu-docs` 的**代码侧不过 `strip-comments` ⇒ 注释被当成代码**；正解＝过 `strip-comments` ＋ **双向自探针**（注释里的码不计、字符串里的真码仍计）。我**未动门**（它的领域 ＋ 新工作）。
3. **告知 `vmu-core2`（已发）**：`docs/18:145` 已按约定收窄 ⇒ ★ **它先前那条"我的 bullet 仍过宽"的过渡口径本轮结束**；S1 补丁与 R20b 报告 §3 的 caveat 仍是**它的文件、它落**；我本轮**未动** `vibe-math-vmu.js`／`kernel/loader.js`。
4. **边界／未做**：① `plan` 仍**看不见 M2 模块体**（Lead 已裁：不把 `loader` 拉进 `buildPlan`）——**未修，保持具名**；② `audit-vmu-docs` 的注释判据**未修**（§5.1，等派单）；③ 我**未**给 `docs/10` 之外的卷改口径（comms2 报的同卷矛盾只落在 `:512/:514`）。
