# Phase 2 · verify2 · Round 21 —— 独立复核【来源层诚实化】`e04584f`（★ 两处具名发现）

> 纪律：**只读复核**（真树只新增本报告）；探针在 `D:\_tmp\p2r21`（**副本制**）；**引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写／未跑真机。
> **被测版本（我逐个核过）**：`HEAD e04584f`（`git show --stat`：**4 文件 +43/−6**）——`kernel/reportfeedbackdelivery.js` **`CE4F0B01C4F6D583`**／`kernel/index.js` **`CAB1938F6687D839`**／`kernel/report.js` **`8740D6EDA60B93C5`**／`tests/b1prime-reportfeedback-shape-pin.test.mjs` **`4A4EB61622627B35`**；★ **入口未动**（仍 `CDCBA5C9875C86BA`）。**对照版本** `e04584f^`：模块 **`B4969486C467E653`**／`report.js` **`8B242E283EF7A74F`**（＝我 R19 绑过的值 ✓）。

## 0. 结论速览
| 项 | 判定 | 关键读数 |
|---|---|---|
| **1 三情形 `source` 是否等于 `resolved.source`** | ✅ **新代码三种全等**（旧代码两种不等） | NEW：未设 ⇒ `default`==`default` ✓／开 ⇒ **`config`**==`config` ✓／**显式 false ⇒ `config`==`config`** ✓；★ OLD：开 ⇒ `"settings:vmu.report.feedback"` ≠ `config` **✗**／显式 false ⇒ `"default"` ≠ `config` **✗** |
| **2 "具名层优先于开关取值"** | ✅ 成立，且**区分有意义** | 旧代码在**两种 armed 情形**都压平（写死 settings 键／或回落 default）；★ 新代码两处都报 `config`；★ 而 `resolved.source` 对"未设"＝`default`、对"显式 false"＝`config` ⇒ ★ **"配置说了 false" 与 "schema 默认没说话" 是**两件不同的事**，回执现在区分得出来** ✓ |
| **3 两个占位：值／是否被执行** | ★ **一处与你的说法不符（具名）** | **`report.js` 内联回退**：开 ⇒ **`source:null`** ✓、关 ⇒ `default` ✓；★ **`kernel/index.js` 占位**：开 ⇒ **实际观测到 `"default"`（不是 `null`）** —— 因为它经 `reportFeedbackFailure → reportFeedbackReceipt`，而后者把**非字符串 `source` 归一为 `'default'`**（`source: typeof input.source === 'string' ? input.source : 'default'`）⇒ ★ **"开 ⇒ null" 在这一处不可观测**；★ 但**两者在真实装配下都不执行** ✓（见 §3 的 marker 臂） |
| **4 形状钉的改动** | ★ **方向上是"更新契约"，但新断言【没有它自称的牙】**（具名） | 我两个变异：**M2（真源忽略给定层）⇒ 6/1 红** ✓（`FAIL ★★ the real source carries the layer it is GIVEN…`）；★ **M1（回退又去"发明"层名 = 旧错回归）⇒ 7/0 全绿 ✗** ⇒ ★ **该断言注释自称 "this reds if that returns"，实测不成立** |
| **5 `vmu-entry` 那次失败** | ✅ **"不复现的 sweep 顺序类 flake"成立（就我能核到的范围）** | `vmu-entry` **单独跑 3× 全绿（150/0）**；★ 该错误来自 **`kernel/resume.js`／`resumeflush.js`／`index.js:1014`**（写前必读闸），而 **`e04584f` 一个都没碰**；★ 且该机制**在本轮之前就有文档**（`core-round9-report.md:32`"写前必读闸管辖退出"）⇒ **我未发现与本次改动相关的证据** |
| **v5r 默认** | ✅ **未被翻** | `packs/v5r/settings/defaults.json`（3,497 B；顶层 `_comment/_round2/_round7/defaults`）里 **`vmu.report.` 命中 0** ⇒ ★ **两个键都没被声明** ✓ |
| **派生面** | ✅ 提交是 in sync | ★ 我第一次量到 **14/15**（**当时有未跟踪文件在飞**）；★ **`git archive e04584f` 干净归档 ⇒ 15/15 in sync, exit=0**；★ 稍后工作树也回 **15/15** ⇒ ★ **14/15 是 in-flight 污染，不是提交的陈旧**（与 R16 同型，已用具名控制排除） |

## 1. ① 三情形对照（我自己的真入口探针；新/旧各跑三遍）
```
config.vmu 形态：未设 / {'vmu.report.feedback':true,'vmu.report.audience':'m1'} / {同前但 false}
                                  receipt.source        resolved.source      相等？
NEW e04584f   未设                "default"             "default"            ✓
NEW e04584f   开                  "config"              "config"             ✓
NEW e04584f   显式 false          "config"              "config"             ✓          ← ★ 本轮修的就是这一格
OLD e04584f^  未设                "default"             "default"            ✓
OLD e04584f^  开                  "settings:vmu.report.feedback"   "config"    ★ ✗（写死了设置键名，不是层名）
OLD e04584f^  显式 false          "default"             "config"             ★ ✗（"配置说了 false"被压成"默认没说话"）
```
⇒ ★★ **两条主张都成立**：**(1)** 新代码的 `receipt.source` 在三情形下**逐字等于** `resolved.source` ✓（我对 `kernel.report.status()` 与 `kernel.status().settings.resolved` **同一次运行**取的两处读数）；**(2)** 旧代码确实在**两种 armed 情形**下压平/误名，新代码修正 ✓。

## 2. ② 这条区分的意义（为什么不是"改个字符串"）
同一份 `resolved` 条目里：**未设** ⇒ `{value:false, source:"default"}`；**显式 false** ⇒ `{value:false, source:"config"}` ⇒ ★ **`value` 相同、`source` 不同** ⇒ ★ 这正是"**没人说话**"与"**有人明确说了关**"的差别；旧回执把两者都写成 `default` ⇒ **把"配置表过态"这件事丢了** ✓ ⇒ ★ **新规则 `(有具名层 ? 用它 : (开 ? null : 'default'))` 保住了它** ✓。

## 3. ③ 两个占位：一处与你的说法不符（★ 具名发现之一）
**(a) 值**
```
report.js 内联回退（无 provider 建面）：OFF ⇒ {"enabled":false,"source":"default",…}      ARMED ⇒ {"enabled":true,"source":null,…}   ✓ 与你说的"开 null／关 default"一致
index.js 占位（内核选项未传 provider）：★ 实测量到 {"enabled":true,"source":"default",…}  ✗ 你说是 null
   ↳ 机制（我逐行核）：占位是 reportFeedbackFailure({ … source: c.feedback===true ? null : 'default' … })，
     而 reportFeedbackFailure → reportFeedbackReceipt，后者有 source: typeof input.source === 'string' ? input.source : 'default'
     ⇒ 直接单位读数：reportFeedbackReceipt({source:null}) ⇒ "default"；reportFeedbackReceipt({source:'pack:v5r'}) ⇒ "pack:v5r" ✓
```
⇒ ★★ **结论**：**"开关开 ⇒ `null`"在 `kernel/index.js` 那一处【不可观测】** —— 它被真源的归一化**改写成了 `'default'`**，即**恰好变成了该提交要消灭的那种"给一个不知道的层名"**。★ **影响范围（我核过，很小）**：**只在"没人提供 provider"的裸构造下**才会走到（见 (b)）；**真实装配不受影响** ✓ ⇒ 但它与本仓"**a resolved view that misnames the layer is worse than none**"这条口径**直接冲突**，建议：占位**不要**经 `reportFeedbackReceipt` 的字符串归一（或在归一器里区分"未声称"与"default"），或让占位直接给 `'default'` 而**不要**先写 `null`（两种改法都能让**声明与观测一致**）。
**(b) 它们是否被真实装配执行** ⇒ ★ **不被执行** ✓（可核）：我在副本里把**入口提供者**换成一个返回 `source:'ENTRY-PROVIDER-MARKER'` 的 provider ⇒ **真入口回执里出现的正是那个 marker** ⇒ ★ **真实装配用的就是入口的 provider**；★ 反向臂（把入口 provider 置 `undefined`）⇒ 回执换成**内核占位**的形态（`delivered:false` ＋ `reason:"the delivery call is not wired in this build (A1 step 1 Part A)…"`）⇒ **证明占位只在裸构造下可见** ✓。

## 4. ④ 形状钉：**"更新契约"方向对，但新断言没有它自称的牙**（★ 具名发现之二）
**我读到的改动**：`SHARED.source` 由（旧的隐含武装值）改为 **`'default'`**（注释说明：这是**两边都能诚实产出**的值），并**新增**一条：给真源 `pack:v5r` ⇒ 真源**带过去**、回退**只说自己能知道的层**（`:76-79`）。
**判定（回答你的问题：是更新契约还是为了过测而放松？）**
- ★ **方向上不是"放松"**：新设计下，**武装**时的 `source` 对**回退**而言**本就不可知** ⇒ 若仍要求"两路在武装输入上相等"，就是**逼回退去发明层名**（正是本次要修的错）⇒ **共同输入必须换成两边都能产出的值**（`'default'`＝关态）⇒ 这是**契约更新** ✓。
- ★★ **但新断言没有它注释所称的牙**：我做了**两个副本变异**：
```
CONTROL（e04584f 原样）                                     ⇒ 7 passed / 0 failed
M1 回退恢复"发明层名"（report.js: source: c.feedback===true ? 'settings:vmu.report.feedback' : 'default'）
   ⇒ ★ 7 passed / 0 failed（全绿 ✗）        ← 注释自称"this reds if that returns"，实测不红
M2 真源忽略给定层（reportfeedback.js: source: 'default'）⇒ ★ 6 passed / 1 failed（红 ✓）
   FAIL ★★ the real source carries the layer it is GIVEN, while the fallback states only the layer it can know
```
- **为什么 M1 漏网（机制，我量过）**：那条断言里的**回退实例是用 `settings:{}` 建的 ⇒ 开关【关】**，而关闭时**新旧代码的回退都返回 `'default'`** ⇒ **被变异的分支（武装）从未被执行**：
```
fallback(OFF).source = "default"      fallback(ARMED).source = null      ← 只有 ARMED 这一格能区分新旧
★ 一条能抓住 M1 的断言：再建一个 settings:{'vmu.report.feedback':true} 的裸面 ⇒ 断言 source === null（我实测＝ null）
```
⇒ ★ **我的建议（你裁）**：把该断言改成**两格**（关态 `'default'`／**武装态 `null`**）—— 这才让"回退不发明层名"成为**可检查的不变量**；★ 现在这一条**只钉住了关态**，而**关态在新旧代码下同值** ⇒ 它**不能**阻止旧错回归。

## 5. ⑤ `vmu-entry` 那次失败：**我判定"不复现 flake"成立（附我的核法）**
- ★ **单独跑 3 次**：`=== VMU ENTRY: 150 passed, 0 failed ===`，exit=0 ×3 ✓。
- ★ **错误来源与我核过的改动面无关**：`VMU_RESUME_WRITE_BEFORE_READ` 出现在 `kernel/resume.js`（`:81 codes.writeBeforeRead`）、`kernel/resumeflush.js`（`:108` 具名拒）、`kernel/index.js:1014`（注释），而 **`e04584f` 只动** 那 4 个文件（delivery 模块／index.js 的**占位**／report.js 的**回退**／形状钉套件）⇒ **没有一处在这条链上** ✓。
- ★ **该机制在本轮之前就有文档**：`docs/acceptance/core-round9-report.md:32`"**写前必读闸管辖退出** —— 从未成功读过 fold 的进程，`flushAll()` 具名拒 `VMU_RESUME_WRITE_BEFORE_READ`" ⇒ ★ **它是既有的、与"退出时是否已成功读过 fold"有关的交互**，不是本轮引入 ✓。
⇒ ★ **判定：成立**（在"我未跑全量"的限度内）：**3× 单跑绿＋错误链未被改动＋机制有前史** 三条同向。★ **限度具名**：**我没有跑全量**（T0/T1 归你），因此**我无法复现"顺序类"条件**，也**不能**替你做"331/331"那一读数。

## 6. 派生面（一次 in-flight 污染的具名记录）
★ 我第一次量 `regen-all --check` ＝ **14/15 in sync, exit=1**（当时 `git status` 已出现**未跟踪**的 `docs/acceptance/phase2-comms-round21-pack-fold.md` 与 `tests/b1prime-pack-fold.probe.mjs` ⇒ **他人正在写**）⇒ ★ 随后**同一个工作树回到 15/15**，且 **`git archive e04584f` 的干净副本＝15/15 exit=0** ⇒ ★ **结论：14/15 是在飞污染，不是提交的陈旧** ✓（与我 R16 同型；这次我用**干净归档**把它钉死）。

## 7. 我自己的仪器失误（具名）
1. ★ **`node -e` 引号又打坏一次（本会话第 5 次）** ⇒ 已落脚本文件；★ 我的清单项不变：**探针一律落文件**。
2. ★ 我第一版"裸构造"臂**预期是 `null`、实测是 `default`**，我一度以为是**我的变异没生效** ⇒ 追下去才发现是**真源归一化把 `null` 写成 `'default'`**（§3 的发现）⇒ ★ 教训：**"预期不符"先按"我的量具"排查，但不要在排除量具后把差异丢掉** —— 这次它正是缺陷所在。
3. ★ 我在 `source.mjs` 里留了一个无意义的 `JOIN_SAFE` 包装（无害，但属脚手架垃圾）⇒ 已记，不入结论。

## 8. 没核 / 未做（与"核了"分开写）
1. **未核**：**全量 sweep / `331/331`**（T0/T1 归 Lead）⇒ ⑤ 的判定是**在"我未跑全量"的限度内**成立。
2. **未核**：**真机**（本轮无真机会话）⇒ 全部为**进程内真入口／单位构造**读数。
3. **未核**：`kernel/index.js` 那句引用（**`:2154-2156` "a resolved view that misnames the layer is worse than none"**）—— ★ 我在 `:1884-1886/:2158/:2169` 一带读到的是**来源阶梯与 `source` 字段的注释**，**没有**逐字取到你说的那三行原文 ⇒ ★ **该引用保持为你的引用**（要我逐字核，给个行号即可）。
4. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；上面两处**建议**（占位归一化／形状钉的武装态断言）**只是建议**。
