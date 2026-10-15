# Round 33 · vmu-pack（`task-161`）交付报告 —— `receiptMeta` 恒存在契约 ＋ **真机"截断从未触发"的定性（判为 (i) 代码缺陷，已修）**

> 任务：`task-161`（`receiptMeta` 恒存在契约）＋ Lead 追加的**真机缺陷定性**（两者修点同一份代码）。
> 纪律：`host.js`／`receiptbounds.js` 一动即重跑消费者 ✓（**全绿**）；变异器**副本制**（真树只读＋hash 判据）；**未自造公开码**；未跑全量／`regen-all`／git。
> **★ 读的是哪一版**：R33 起点 HEAD 的 `kernel/receiptbounds.js` md5 `9df0eb95bf0ef827351f2fe2838c2104`（★ 真树在**全部**变异前后都是这个值，见 §5）。

---

## 0. 结论速览

| 项 | 结果 |
|---|---|
| **★ 真机缺陷定性** | ✅ **(i) 代码缺陷**（不是(ii)宿主版本）：**机制＝"无可截内容 ⇒ 静默返回原回执"**；已修 |
| **`receiptMeta` 恒存在契约** | ✅ **已落**：五键**两态同形**，状态用**值**表达；`hostElision` 恒 `'possible'`；★ **未把 24846 写成契约常量** |
| **消费者** | ✅ 全绿：`vmu-entry` **150/0**（`st.packs`）／**`vmu-host` 107/0**（★ R32 就是它红 106/1）／`packs-active-switch` 24/0／`defaults-named` 36/0／`host-hooks` 22/0／`audit-status-report-fields` **19/0**（★ 你判"不该红"——确实没红）／`enforced-consistency` 358/0／`audit-code-size` 9/0 |
| **新测试** | ✅ `tests/vmu-receipt-truncation.test.mjs` **19/0** |
| **当天反例（副本制）** | ✅ **M1 15/4 红（A2/A3/A4＝R32 那个缺陷本身）**／**M2 17/2（B2/D2）**／**M3 18/1（C2 反向断言）**；★ 全是**具名断言红**；真树 md5 未变 |
| **`host.js` 行数** | ✅ **本轮未动 `host.js`**（改动只在 `receiptbounds.js`）⇒ 仍 **1151/1200** |

---

## 1. ★ 真机事实：**截断在真机上从未触发**（这条必须原样记）

**真机读数（Lead/`vmu-assistant2`）**：完整回执 **179,826／182,090 字符（≫12,000）**，而 `…[elided]`／`"elided"`／`hostElision` **全无** ⇒ **自省略一次都没发生**。
★ **真机才是"有没有生效"的判据** —— 进程内绿过不算数，本轮的教训正在此。

## 2. ★ 定性实验（一次小实验，结论 (i)）

**同一次运行、同一份代码、走真 seam**（`D:\_tmp\vmu-pack33\realmachine-probe.mjs`）：

| 臂 | 读数 | 结论 |
|---|---|---|
| **(a) WIDE（多小字段）** | `39,391 → 39,391`，**三个标记全 false** | ★ **静默返回原回执** |
| **(b) 一个巨大字符串** | 加了三标记，但 `12,412 > 12,000` | ★ **"限量工作的收缩器，不是必达预算的保证"**（你这句话被实测证实） |
| **(c) 真机面（进程内）** | `len=146,146`；**string leaves=4,470，最长只有 378**；`elided/hostElision/[elided]` **全 false** | ★★ **无可截叶子 ⇒ 什么都没做、也什么都没说** |

⇒ ★★ **机制定稿**：判决在 **`kernel/receiptbounds.js:47` 的提前返回**（`before.length <= MAX` 才走 elide 分支是表象；真因是 **`elided.length === 0 ⇒ return after`**，即**"没有可截的叶子就原样返回、不加任何标记"**）。真机面 4,470 个叶子**全部 < 2,000** ⇒ **必然**走这条路 ⇒ **179 kB 回执静默通过**。
⇒ **判为 (i) 代码缺陷**（不是 (ii) 宿主记录了另一版）—— ★ **证据是同一进程、同一 spec、同一次运行**：进程内对同一份代码就没有真标记。
★ **一条量具提醒**（记进报告）：我第一版标记探测用 `s.includes('"truncated"')` ⇒ 被**报告面自己的计数器 `"truncated":0`** 骗成 `true` ⇒ **探测子串名会撞上同名既有字段**，必须按**路径**验（我改用 `receiptMeta` 下的字段）。

## 3. 修法：`receiptMeta` 恒存在（**不去砍得更狠，而是不再沉默**）

★ **为什么不加大力度**：真机面**没有一个叶子可截**；要在这种形态下**达到 12,000 预算**，只能**丢内容**（缩数组、删字段）⇒ ★ **那正是"形状随负载变"，与你的裁定相悖**。⇒ 所以修的是**沉默**，不是**力度**。

**契约（五键，两态同形，状态用值表达）**：
```
receiptMeta: { truncated:false|true, elided:[]|[…], hostElision:'possible', originalBytes:<number>, note:<string|null> }
```
- ★ **恒存在**：**未超预算**也带（空态 `truncated:false`／`elided:[]`／`note:null`）；
- ★ **`originalBytes` 我落成【恒为数字】**（★ **对你 R32 建议的 `null` 做了具名偏离**）：★ 理由＝**这正是让真机那种形态变得可见的那个数** —— 读者看到 `originalBytes:146146` ＋ `truncated:false` ＋ `elided:[]`，就**立刻知道"远超预算、无可截内容、宿主可能再截"**；写成 `null` 就把这条唯一能暴露"静默超限"的信息抹掉了。
- `hostElision` **恒为 `'possible'`**，且**与我们自己的省略分列**；★ **24846 只作证据、不进代码** ✓。

**修点**：`kernel/receiptbounds.js` —— ① 未超预算分支**也附空态**（原来 `return before` ⇒ 键集合随负载变，正是缺陷之根）；② 无可截叶子分支**不再静默**，附 `truncated:false` ＋ 真实 `originalBytes` ＋ **说明为何没截**的 `note`；③ `host.js` **本轮未动**（调用点早已是 `boundedToolResult(...)`）。

## 4. ★★ 契约设计被【当初打破它的那些消费者】验证了

| | 键的条件性 | `vmu-host` | `vmu-entry` |
|---|---|---|---|
| **R32（错）** | `truncated`/`elided` **只在超限时**出现 ⇒ 键集合随负载变 | **106/1 红** | **EXIT=1**（`st.packs` undefined） |
| **R33（本契约）** | `receiptMeta` **五键两态恒存在** | **107/0 ✓** | **150/0 ✓**（`st.packs` 可读） |

⇒ ★ **同样的键、同样的位置，只因"两态同形"就从打破变成通过** ⇒ **你与我共同定的那条加固条件（同形递归到子对象、状态用值表达）在实测上成立**。

## 5. 当天反例（副本制，真树只读）

`D:\_tmp\vmu-pack33\receiptmeta-counterexamples.mjs`：CONTROL（副本）**19/0** ⇒

| 变异 | 读数 |
|---|---|
| **M1** 未超预算时**不附 `receiptMeta`**（＝R32 那个缺陷本身） | **15 passed / 4 failed**，具名 **A2／A3／A4** |
| **M2** `truncated` 恒 `false`（永不承认截过） | **17/2**，具名 **B2／D2** |
| **M3** `truncated` 恒 `true`（未截却声称截了） | **18/1**，具名 **C2**（反向断言） |
| 复原后 CONTROL | **19/0** |
| ★ 真树判据 | `receiptbounds.js` md5 **`9df0eb95bf0ef827351f2fe2838c2104`** 变异前后**逐字节相同** ⇒ **NEVER WRITTEN = true** |

★ M1 第一版是 **TypeError 崩溃**（`receiptMeta` 缺失时解引用）⇒ 我把 A 块改成**空值安全** ⇒ 现在**三条变异全是有名有姓的断言红**（"崩溃＝红得没说出哪条契约"，与 R32 同一条纪律）。

## 6. ★ 第二步的验收口径（按你的要求**如实**写）

你说：**第二步的验收必须含"在【真机面】上触发"，或具名"真机面构造不出"**。★ **我的交付是后者，具名如下**：
> **真机面构造不出"截断触发"**：真机 `vibe_vmu_status` 的 4,470 个字符串叶子**最长 378 < 2,000** ⇒ **不存在可截叶子** ⇒ 该面上 `truncated` **必然**为 `false`、`elided` **必然**为 `[]`。★ 因此**"截断在真机面生效"这句话我给不出真机证据**，只能给：**(a)** 真机面**现在会如实自述**（`originalBytes` 远超预算 ＋ `truncated:false` ＋ 原因 `note` ＋ `hostElision:'possible'`）；**(b)** 超预算且**有**可截叶子的形态在**进程内**确实触发并带准确 `elided`（测试 B/D 块）。★ **不声称 (b) 已在真机发生**。

## 7. 消费者重跑（原样读数，全绿）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-receipt-truncation.test.mjs` | **`19 passed, 0 failed`** | **0** |
| `node tests/vmu-entry.test.mjs` | ★ **`150 passed, 0 failed`**（`st.packs`） | **0** |
| `node tests/vmu-host.test.mjs` | ★ **`107 passed, 0 failed`** | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node tests/vmu-pack-defaults-named.test.mjs` | `36 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed`（★ 你判"不该红"✓） | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/audit-code-size.test.mjs` | `9 passed, 0 failed`（`host.js` 1151/1200） | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` | **0** |

**改动面**：`vibe-math-vmu/kernel/receiptbounds.js` ＋ `tests/vmu-receipt-truncation.test.mjs`（**既有文件，未新增 ⇒ 计数不增**）。★ **未碰** `host.js`／`vibe-math-vmu.js`／`scripts/**`／`kernel/**`（除 receiptbounds）／`docs/**`；未自造公开码。

## 8. 未做／边界（具名）

1. **`appliesFrom`（工具层）vs `appliesAt`（内核层）同一语义两名字** —— ★ **本轮未做**（你标低优先）。★ 我的判断：**若要统一，应作为独立契约变更**（两处名字都可能被消费者引用）⇒ **建议单开一项**，我不顺手改。
2. **非对象结果**（`run` 返回裸字符串/数字）**拿不到 `receiptMeta`**（子对象无法附在裸值上）⇒ ★ **具名边界**，已在测试 D3 **断言**（不是假设）。
3. **预算是"限量工作"，不是保证**：有可截叶子时也可能停在预算之上（实测 `12,412`）⇒ ★ **现在由 `receiptMeta` 如实报告**，不在代码里假装必达。
