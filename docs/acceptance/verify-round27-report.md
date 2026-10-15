# Round 27 · `vmu-verify2`（`task-145`）交付报告 —— 矩阵 v19 ＋ `task-143` 复核基线／地面真值

> 纪律：只读复核（**本轮仓内一行未写**；变异全在 `D:\_tmp` 副本）；未跑全量／`regen-all`／git。
> **读的是哪一版**（本轮硬要求：凡"我测不到"必须与版本同时声明）：
> `task-143` **在飞**（板上 `in_progress`）⇒ `host.js` 在我复核期间由 `D4C3BCE3D973CB84` → **`8FD4B2FDDC6FFDBF`**；`entry` 由 `158295C05917AFC0` → **`B78B3E05FE2033F4`**；其测试文件 `5FBBF979E8DB814E` → **`C9A3A97BF527E438`**。
> 交付：**`§9.33 v19`（矩阵 1458 → 1507 行，sha256[0:16] `78691D61C347C833`）**。

## 0. 结论速览

| 项 | 判定 | 关键读数 |
|---|---|---|
| **A.2 `A2` 的牙** | ★ **能红 —— 但必须打在正确的折入点** | 打 `:349`（settings/defaults）⇒ **14/7 红，`FAIL A2 … [43]`**；打 `:323`（prompts）⇒ **21/0 绿** |
| **A.1 `enabled` vs `published`** | ★ **比裁定范围更大，且【两个方向】都差** | `config.packs`：published−enabled `["middleware","report"]`；**enabled−published `["set"]`**；设置键：`["middleware","meeting","report"]` |
| **A.1 的 reason 来源** | ✅ **已存在可复核来源** | `publishedDetail[].reason`：`"surface:bus-entries"`／`"setting:vmu.report.*"`／`"setting:vmu.meetings.*"`／`"explicit-flag"`；而 `faces.sources['middleware'\|'report']` 皆 `undefined` |
| **A.1 `notPublished`** | ✅ 已落地、reason 可复核 | 设置键：`[{"face":"control","tool":"vibe_vmu_control","reason":"its family keys live only in the pack's settings/defaults.json…"}]` |
| **A.3 当天种反例（纪律核查）** | ⏳ **待其交付**（本轮无新断言落地） | 到时逐条列"新断言 → 当天反例读数"，缺者具名 |
| **C `docs` 未漂回** | ✅ | `docs/10 7BA3C185F1DA916C`／`docs/29 FBEB5AAB7D6FCA23`（与 R25/R26 相同）；`:263`／`:306` 仍为真话 |

## 1. 原样命令与退出码

```
node D:\_tmp\v27\a1a2-readings.mjs      # A.1 基线 + A.2 两个折入点的变异对照      exit=0（内部：control 0／MUT#2 1／MUT#1 0）
node D:\_tmp\v27\face-diff-detail.mjs   # 逐条 publishedDetail 与 sources         exit=0
node tests/vmu-pack-defaults-named.test.mjs   # 其测试在真树   21 passed / 0 failed  exit=0
```

## 2. A.2 地面真值（**这一条可直接用于派单**）

```
CONTROL（未变异副本）                       exit=0  VMU PACK DEFAULTS NAMED: 21 passed / 0 failed
MUT-fold-#2（vibe-math-vmu.js:349 settings/defaults 折入点；锚点命中 2 处）
                                            exit=1  14 passed / 7 failed
   FAIL A2. the settings route folds no default keys (`defaults` stays 0) [43]     ← ★ 红在被测那一行
   FAIL A3. ★ and the nine tools that depend on those keys are NOT registered [{"registered":16,"lost":[]}]
   FAIL A4. the enabled face list is the four baseline faces …
MUT-fold-#1（:323 prompts 折入点）           exit=0  21 passed / 0 failed            ← 不影响 `defaults`
```
★ **两个折入点写着同一行** `const wantedPacks = Array.isArray(config.packs) ? … : []`（`:323` prompts／`:349` settings）⇒ **拦 `defaults` 的是 `:349`**。⇒ owner 第一版"没红"的**最可解释原因＝打错折入点**（其自陈假设"`settings` 在该作用域形态不同"**未被我这边的读数支持**）。

## 3. A.1 逐条（两路线各测一次；真状态工具）

| 路线 | `enabled` | `published` | published 面 − enabled | **enabled 面 − published** |
|---|---|---|---|---|
| `config.packs` | 14 | 15 | **`["middleware","report"]`** | **`["set"]`** |
| 设置键 | 4 | 7 | **`["middleware","meeting","report"]`** | `[]` |
- ★ **裁定范围更正**：不止 `report`；`middleware` **两路线**都在其中，设置路线另有 `meeting`。
- ★ **反方向也有差**：`config.packs` 路线的 `publishedDetail` **没有 `vibe_vmu_set` 条目**（同一工具在设置路线里**有**，`reason:"explicit-flag"`）⇒ **第五个"同一回执两字段讲不同的事"**。
- ★ **可复核 reason 已存在**：`publishedDetail[].reason` 四条样例全部是**判决来源**（`surface:bus-entries`／`setting:vmu.report.*`／`setting:vmu.meetings.*`／`explicit-flag`）＝形状 **(乙)**，**不是白名单**；而 `faces.sources` 对 `middleware`／`report` **取不到**（`undefined`）⇒ **裁定应改指 `publishedDetail[].reason`**。
- ★ **代码级声明点**：`host.js:232`（`face:'report'` 面行）＋ **`host.js:834 if (on('report')) specs.push(makeReportSpec(…))`**（**直接 push**）⇒ 解释"已发布却未 enabled"：**`report` 的发布绕过面行判决**。

## 4. 纪律（R27 新增三条 ＋ 四次空过形状）——**指回不重抄**

- 五件「测量环境的同一性」＝ **§9.31.1（M-1…M-5）＋ M-6（§9.30.9）**；**本轮无差异**。
- ★"基线是 67" ≠ "该形状不存在" ⇒ **§9.32.7**（含机制：**A 类基线是指纹集合，只保证既有指纹不增不减**）；本轮再确认 `RULE E 67=67`／`C2 57=57`。
- ★"测不到"必须与"测的是哪一版"同时声明 ⇒ **§9.32.8(A)**（我的过强框架自纠）；本轮起作**引用前硬要求**。
- ★"列在队列里" ≠ "尚未完成" ⇒ **§9.32.5 第 1 条**；本轮现场生效（`task-143` 在飞、`host.js` 在改 ⇒ 判"在飞、未落"）。
- 四次空过形状（`[].every`×2／条件式×1／**等号两侧可空**×1）＋机制 ⇒ **§9.32.7**。

## 5. C：`docs` 未漂回（确认，绑哈希）
`docs/10` **`7BA3C185F1DA916C`**、`docs/29` **`FBEB5AAB7D6FCA23`**（与 R25/R26 读数相同 ⇒ **未被后续改动漂回**）；`docs/29:263`／`:306` 仍写"★ R25 起**真装载**……不含该包的 `settings/defaults.json`" ✓。

## 6. 具名未闭合
1. **`task-143` 交付未落** ⇒ A.1（差集逐条解释）／A.2（做红或撤回）／A.3（每条新断言当天反例清单）**待落地后验收**；其基准已在本报告 §2／§3 给出。
2. ★ **建议 owner 选"做红"而不是"撤回"**：我的实测证明 **`A2` 能红**（打 `:349`）⇒ 若仍写"本断言不覆盖该变异"，那将是**比事实更弱**的表述。
3. `report`／`middleware`／`set` 三处口径差待 owner 落地后逐条验收。
4. **`systemPrompt` 仍不可达**（具名降级；不影响装载与阈值开火，单独记）。

---

## H. ★ 收口复核（`vmu-pack2` 交付 `task-143` 后；本节**取代** §6 第 1、3 条与 §1 中的"未证"表述）

**版本锚点（交付版）**：`entry B78B3E05FE2033F4`／`host AB07038C2174A8F6`／其测试 `BEFDD86DEC3E496F`。
**命令**：`node D:\_tmp\v27\closing-review-143.mjs` ⇒ **exit=0**（内部 control 0／A.2 变异 1／A.3 变异 1；两次变异的输出均 `syntaxError=false` ⇒ **真红**）。

1. **A.1（`enabledGap`／`enabledNotPublished`）✅ 已落、已派生、来源可复核**：
   - `config.packs`：`enabledGap=[middleware(source="surface:bus-entries",faceRowSource=null), report(source="setting:vmu.report.*",faceRowSource=null)]`、`enabledNotPublished=[{face:"set",source:"declared-keys"}]`；
   - 设置键：`enabledGap` 增 `meeting(source="setting:vmu.meetings.*")`、`enabledNotPublished=[]`；
   - ★ 我**逐条做等式核对**：每个 gap 的 `source === publishedDetail[].reason` **全部 true**（⇒ 来源是**判决来源**，非散文、非白名单；另测 `hardcoded-face-list? false`）；`faceRowSource=null` **本身即"绕过面行判决"的证据**，与 `host.js:232` ＋ `:834`（`if (on('report')) specs.push(makeReportSpec(…))` 直接 push）一致。
2. **A.2（`A2` 的牙）✅ 已证（反例在 `:349`）**：CONTROL **27/0**；`MUT@:349` ⇒ **20/7**，**`FAIL A2 … [43]` 红在被测那一行**（另 `A3`／`A4`／`C1`）。★ 根因两人一致：**两处折入点写着同一行**（`:323` prompts／`:349` settings/defaults），`String.replace` **只替换第一处** ⇒ 第一版打在 `:323`。⇒ **原"未证"作废**。
3. **A.3（纪律核查：新断言 → 当天反例）✅ 逐条有读数、且我独立复现**：
   | 新断言 | owner 当天读数 | 我独立复现 |
   |---|---|---|
   | **E1／E2**（每个"已发布未 enabled"的面必须被 `enabledGap` 解释、带 `reason`＋可复核 `source`） | 清空两个 gap 过滤器 ⇒ **22/5，E1/E2 两路线红** | ★ **22/5，`FAIL E1`／`E2` 两路线各一条**，`syntaxError=false` |
   | **`A2`** | **20/7，`A2` 红 `[43]`** | ★ **20/7，`A2` 红 `[43]`** |
   ★ owner 的**自律**值得记：其**第一次**种反例产生 **`SyntaxError`** ＝**假红**，**没有被当成证据**，改为语法有效版 ⇒ **"真红 vs 语法假红"**并入矩阵同族纪律（**语法错的红连"被判定那一行"都不是**）。
4. 其余回归（`vmu-host 107/0`／`vmu-host-hooks 22/0`／`vmu-entry 150/0`／`audit-status-report-fields 19/0`／`audit-enforced-consistency 358/0`／`audit-declaration-criterion 88/0`）**署名 owner**（我复跑的是上述两次变异与其测试的 CONTROL）。
5. **§6 的具名未闭合随之收敛**：① 交付已落、验收通过；③（三处口径差）已双向具名并通过；② 保留（`systemPrompt` 仍不可达，单独记）。
