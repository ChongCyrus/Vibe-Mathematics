# Round 25 · `vmu-verify2`（`task-140`）交付报告 —— core2 四项＋`ready()` 落定 独立复核 ＋ 矩阵 v17

> 纪律：只读复核（**本轮仓内未写任何文件**；副本变异只发生在 `D:\_tmp`）；未跑全量／`regen-all`／git；临时文件 `D:\_tmp\v25`。
> **读的是哪一版**（★ 本轮复核**横跨 core2 的三轮在飞落地**，一律并列、逐条绑哈希）：
> **P1** entry `05EC689D4AFE3BC2`（1043 行）／host.js `8A9EC072DBFD6CF7`
> **P2** entry `158295C05917AFC0`（1106 行）／host.js `C9F597A24CB8C933`
> **P3** 同 P2 的 entry／host ＋ core2 断言文件 `tests/vmu-packs-active-switch.test.mjs` sha `5FBBF979E8DB814E`（更早一次读到 `1F9F31FCC5A2C932`）
> 交付：`_handoff/vmu/04-parity-matrix.md` **§9.31 v17（1252 → 1346 行；sha256[0:16] `51C06A54E90EF98B`）**

## 0. 五项复核结论（一眼版）

| # | 项 | 判定 | 关键读数（原样命令见 §1） |
|---|---|---|---|
| 1 | 回执可见性 | ✅ **已落（真状态面可见）** | `host.js:453 out.packReport = packReport()`；真面 `st.packReport={"requested":[{"id":"v5r","via":"vmu.packs.active"}],"applied":["v5r-core"],"errors":[],"loading":false,"ok":true}`；`st.packs=["v5r-core"]`（内核真值）。★ **口径更正**：不是"透到 `out.packs`"，而是**新增 `out.packReport`**（设计具名于 `host.js:443-449`） |
| 2 | 状态一致性 | ✅ **已落** | 真面（被拒臂）：`settingsMerge.applied=false`、`settingsMerge.errors=[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"…no library root"}]`、`packReport.ok=false`、`applied=[]`，**同框**仍列 `settingsMerge.packs=["v5r"]` ⇒ R23 误导形态**有解药** |
| 3 | 常驻断言 C①–C④ 能红 | ✅ **已落且我实测能红** | 文件 `5FBBF979E8DB814E`；**真树 24/0 exit=0**；**副本对照 24/0 且 sha ≡ 真树**；**M1（清空设置路线项）⇒ 9/15 红**（FAIL `A3` 非空前置／`B1` 来源）；**M2（不记拒）⇒ 20/4 红**（FAIL `D1`，回执反成 `ok:true`） |
| 4 | 文档 | ⚠ **主体已落，留两行假话** | ✅ `docs/10:436` 重写为"两条路，能力不同／① 部署期声明"；`docs/29:280` 改"★ R25 起：**真装载** ✓"＋`:291` 更正块；✅ `config.root` 必需性在配方（`docs/29:259/:284`）。❌ **`docs/29:263`／`:306` 仍写"不装载 pack"**，与实测相反 |
| 5 | `ready()` 落定 | ✅ **已落** | `:1091 Promise.all([…, packsInstall])`；`:1057 packsLoading: () => packsLoading`（handle 暴露）。★ **实测**：**被拒臂在 `ready()` 返回时 `packErrors=1`**（P1 时是 0，须再等 250 ms）⇒ **竞态关闭**；成功臂 `ready()` 时已有 **7 条**总线条目；ready 时 `packsLoading=false` |

## 1. 原样命令与退出码（全部 exit=0，除红/未运行处注明）

```
node D:\_tmp\v25\readings-140.mjs        # P1 四臂 + 各访问器      exit=0
node D:\_tmp\v25\pin-receipt.mjs         # P1 回执位置与形状        exit=0
node D:\_tmp\v25\readings-140b.mjs       # P2 四臂（ready 后立即／300ms）  exit=0
node D:\_tmp\v25\receipt-reading.mjs     # P2 按 host.js:431/441/453 合成回执  exit=0
node D:\_tmp\v25\readings-p3.mjs         # P3 三臂 + settingsMerge 全键    exit=0
node D:\_tmp\v25\real-status-face.mjs    # ★ 走注册工具的真状态面        exit=0
node D:\_tmp\v25\mutation-demo.mjs       # 我自己的四臂可证伪（M1/M2）   exit=0
node D:\_tmp\v25\mutate-their-test.mjs   # ★ core2 断言在副本上变异    exit=0（其内部各次：control 0／M1 1／M2 1）
node tests/vmu-packs-active-switch.test.mjs            # 真树 24 passed / 0 failed  exit=0
node tests/vmu-assistant-host-slice.test.mjs           # 10 passed / 0 failed / 5 not-run  exit=0
```
**既有套件逐条具名（P2 上复跑，全部 exit=0）**：`vmu-metrics-counter 26/0`（★ 它用 `vmu.packs.active`，**未因开关生效而改变行为**）、`vmu-round1-seams 40/0`、`vmu-motion-box 23/0`、`vmu-entry 150/0`、`vmu-kernel 175/0`、`vmu-pack 53/0`、`audit-enforced-consistency 358/0`、`vmu-pack-plan-rule-validate 35/0`。

## 2. 五件「测量环境的同一性」升为**可引用编号节**（矩阵 §9.31.1）

**M-1** payload 哈希（＋**已机械化**：`tests/vmu-assistant-host-slice.test.mjs` 的 `payloadsAgree()`／`findHostPayload()`＋4 条两向自探针；**10/0/5 exit 0**、`RULE E 67=67`、`audit-vmu-docs 99/0`）／**M-2** 解码帧完整性／**M-3** `await` 指纹／**M-4** 装载 settle／**M-5** 同刻同源／**M-6** 因式分解。

## 3. ★ 我本轮的两条新发现（不在 core2 清单里）

1. **设置路线的 pack 摸不到"设置面"**（P3 仍如此）：A 臂 `settingsMerge.defaults = 0`，config 路线 `43`（且后者的 `sources` 里成片 `pack:v5r`）⇒ **middleware 装了、`settings/defaults.json` 未折入**。⇒ 要么让 DATA 折入也按 `packsWanted`，要么**具名**"设置路线的 pack 不折设置面"。**未测**真机可观察性。
2. **`docs/29` 的两行内联注释仍与事实相反**（`:263`／`:306`）—— 路线表已改正，但**配方里被抄的那两行**没改。

## 4. ★ 我本轮的自我更正（逐条具名，第五次量具自错）

1. **对象混读**：我先前把 **`kernel.status().settingsMerge`**（内核窄对象）当成回执的 `settingsMerge` ⇒ 得出"没有 `packs` 键"的错论。正解：**回执的 `settingsMerge`＝入口 `packMerge()`**（`host.js:441`），它有 `packs/packSources/appliedPacks/errors/loading`；且 **`applied` 标记只在收到回执那一层存在**（入口单读是 `undefined`，**真状态面带 `true/false`**）。
2. **第 5 次量具自错**：`real-status-face.mjs` 的 **D 臂**把 `packs:['v5r']` **展开进了 `vmu`**（`vmu: { …, ...settings }`）⇒ 那一栏实际"什么都没声明"（读数正确但**答错了问题**）。config 路线的正确读数用 pass-2/pass-3 探针（`via:"config.packs"`、entries=7）。
3. **版本漂移带来的过时判定**：我 P1 的"`host.js` 命中 0 ⇒ `:820` 是假声明"与 P2 后的"第 3 项未落"**都只对当时那一版成立**，已在矩阵 §9.31.7 逐条改判（**不删旧文**）。

## 5. 具名未闭合（交 Lead）

1. **设置路线的 pack 不折设置面**（§3-1）—— 待裁决。
2. **`docs/29:263`／`:306`** 两行（§3-2）—— 属 core2 写范围。
3. **"设置只能加不能减"**在代码里成立（`:827-832` 去重、来源保持 `config.packs`），但**文档与断言**两端都还没有（其断言文件覆盖的是"来源/被拒/两条路一致"，**未覆盖"不能减"**）⇒ 建议补一条：`config.packs:['v5r']` ＋ `vmu.packs.active:[]` ⇒ 仍装 v5r；而"设置里去掉一个部署 pack"不改变结果。
4. **`systemPrompt` 仍不可达**（具名降级，不影响装载与阈值开火）—— 单独记。
