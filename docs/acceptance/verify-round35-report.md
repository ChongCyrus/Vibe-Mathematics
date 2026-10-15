# Round 35 · `vmu-verify2`（`task-169`）交付报告 —— A1–A4 独立复核 ＋ 矩阵 v21

> 纪律：只读复核（**本轮仓内一行未写**；探针只在 `D:\_tmp\v35`）；未跑全量／`regen-all`／git；**反例器一律副本制**。
> **读的版本**：`HEAD 8431f6d`（工作树 clean）；真机臂跑在 **`8b680cb`**；真机会话 `session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`（2026-10-15 **23:25**）；**spill** `…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`（182,374 B）。
> 交付：**矩阵 §9.37 v21（1807 → 1862 行，sha256[0:16] `7E0BCA08FB48AB56`）**。

## 0. 结论速览

| 项 | 判定 | 关键读数 |
|---|---|---|
| **A1 R34 真机臂** | ✅ 主体核实（**一处未核，具名**） | blob `8b680cb` entry **`71E288B9AD711E2E`（85130 B）**／`receiptbounds.js` **`56285AC856E75DE4`** ＝ 其报告逐字相同；spill **`JSON.parse` OK**；**`truncated:true`**；`elided[0]{2000,14000,12000}`、`bytes===to−from` ✓、`to===14000` ✓、`originalBytes=193684` ✓；保留值 **length 2009**、head `ABCDEFGHIJ`、tail `…[elided]` ✓；**`pwsh` 面带同一 `elided` 数组** ✓；反向臂 **`truncated:false`** ✓ ★ **"保留值＝原文前缀"未复算**（输入件不可得） |
| **A2 `appliesAt===appliesFrom`** | ✅ 工具面成立＋反例红在被测行 | 两键都在、**同名同值**；副本变异 ⇒ **6/7 红**（`FAIL B1/B2/B3`，B3＝同一事实同值），`syntaxError=false`；CONTROL **13/0** ★ 我的 kernel 路径探针未取到（**我的仪器**） |
| **A3 §11 三档** | ✅ 三档 live、`3/115` 确认、门绿 | `--check`＝**`up to date (1108 wired, 3 undetermined, 115 declared-but-not-wired)`**（**1108+3+115=1226** ✓）；`audit-vmu-docs` **103/0**；`run-tests.mjs` blob **未变**、仍含 180000／180 s ★ **"只中和 STALE"未直接核**（脚本未找到），但**复现了该手法要解决的形状** |
| **A4 性能** | ⚠ 两读数并列 | `settings-table --check` **4.76s**（基线 4.84）✓；`wiring-index --check` **7.35／7.20s** vs 其 **6.65**（脚本字节**未变** ⇒ **环境漂移**，不归因于代码） |

## 1. 原样命令与退出码

```
node D:\_tmp\v35\verify-spill.mjs          # spill 解析 + 会话留（多帧）   exit=0
node D:\_tmp\v35\verify-spill2.mjs         # 保留值形状 + pwsh 面 + 反向臂  exit=0
node D:\_tmp\v35\verify-applies.mjs        # 真入口两名字 + 副本变异        exit=0（内部 CONTROL 0／变异 1）
node D:\_tmp\v35\verify-stale-technique.mjs# STALE 手法两臂                 exit=0（arm1 0／arm2 1）
node D:\_tmp\v35\verify-prefix-and-neutraliser.mjs                          exit=0
node scripts/generate-vmu-settings-table.mjs --check        exit=0  (4.76s)
node scripts/generate-wiring-index.mjs --check              exit=0  (7.35s／7.20s)
node tests/audit-vmu-docs.test.mjs                          exit=0  (103 passed / 0 failed)
node tests/vmu-applies-name-unified.test.mjs                exit=0  (13 passed / 0 failed)
```

## 2. 逐项

### A1（真机臂，spill 为准 —— 按 spill 纪律）
- **payload 逐字节**（`git cat-file blob 8b680cb:` 二进制）：`vibe-math-vmu.js 71E288B9AD711E2E (85130 B)`／`kernel/receiptbounds.js 56285AC856E75DE4 (8082 B)` ＝ 其报告**逐字相同** ✓；HEAD 的 `receiptbounds.js` 已变为 `402436FD37154030`（8888 B）⇒ `note` 修正**在其后**。
- **spill 182,374 B ⇒ `JSON.parse` OK（182,159 chars）**；`receiptMeta.truncated === true`；`elided[0] = {path:"settings.resolved.vmu.turn.instituteName.value", from:2000, to:14000, bytes:12000}`；`bytes===to−from` ✓；`to===14000` ✓；`originalBytes===193684` ✓；`hostElision==="possible"` ✓；**`note` 逐字仍是 `… BY US to reach MAX_TOOL_RESULT_BYTES (12000)…`** ⇒ **改前措辞**，与"修正在 `8b680cb` 之后"一致 ✓（可证伪的预测成立）。
- **保留值**：`length 2009`（2000＋`…[elided]` 9）、head `ABCDEFGHIJ`、tail `…[elided]` ✓。
- ★ **未核（具名）**：**"保留值＝原文前缀"** —— 原始 14,000 字符串的**输入件不可得**（扫 `D:\_tmp` 只找到 `r163-B-overlay.yml`／`r163B-B-overlay.yml`，其中 `ABCDEFGHIJ` 只有 **10 字符**）⇒ 该子项**仍属其读数**。★ 建议：**留输入件**，或让回执带**原文哈希**（现仅 `from/to/bytes`）。
- **`pwsh` 面**：会话留（多帧解码 32 行）里 `name=pwsh` 的结果带 **与 status 完全相同的 `elided` 数组** ✓。
- **反向臂**：`{"truncated":false,"elided":[],"hostElision":"possible","originalBytes":965,"note":null}` ✓。
- ★ **spill vs 转录实证**：同一次运行，**spill 182,159 字符** vs **转录里该结果 50,319 字符**（省略版）⇒ 见 §3-(i)。

### A2（`appliesAt === appliesFrom`）
- **真入口工具面**（`vibe_vmu_set` 真调用）：`vmu.turn.instituteName` ⇒ 两键都在、**同名同值**（内核**实测活读者**细化披露）✓；`vmu.a11y.checkScope`（planned）⇒ 两键＝`"never yet (planned key: no runtime consumer)"` ⇒ **planned 披露存活** ✓（其"planned 判断优先"的修法成立）。
- ★ **我的 kernel 路径探针未取到**：`kernel.appliesTable()` 返回 4 条、两键 `undefined` ⇒ **我的仪器问题（具名）**，kernel 侧由其套件＋工具面读数承担。
- **副本制反例**：`host.js` 的 `appliesFrom: appliesAt` **锚点 1 处**；改坏 ⇒ **6 passed / 7 failed，exit=1**，`FAIL B1`／`B2`／★`B3`（`appliesAt === appliesFrom`），**`syntaxError=false`** ⇒ **红在被测行** ✓；CONTROL **13/0** ✓。

### A3（§11 三档 ＋ 归属闭环）
- `--check` ⇒ **`up to date (1226 keys (1108 wired, 3 undetermined, 115 declared-but-not-wired))`** ⇒ **1108＋3＋115 ＝ 1226** ✓；**`3/115` 与 R33 一致** ⇒ **R34 的 `4/114` 作废**。
- `audit-vmu-docs` ⇒ **103/0 exit=0** ✓。
- **未抬预算** ✓：`run-tests.mjs` blob 在 `8b680cb` 与现在**同为 `B988AF9351E9219C`**、仍含 `180000`／`180 s`。
- ★ **"只中和 STALE、未放宽断言"我未直接核**（其脚本在 `D:\_tmp` 未找到 ⇒ 属其自报）。**但我复现了它要解决的形状**：副本里清空一个档位格 ⇒ `audit-vmu-docs` **exit=1，输出只有 `vmu settings table: STALE …`、无 `FAIL`/摘要**（`hasSTALE=true`）⇒ R33 的"半个证据"**今天仍可复现**。★ 且**当前树里该子检查已在审计内部**（`tests/audit-vmu-docs.test.mjs:17` **import** `verdictOf/WIRED/UNDETERMINED/NOT_WIRED`；`:746` 为审计自己的 `process.exit`）⇒ 其"中和一个 spawn"的描述**与现形状不符**，技术需重述；**建议替代法：变异 `verdictOf`**（不碰 docs 格）⇒ 红只可能来自审计断言（**我未跑，属建议**）。

### A4（性能）
- `generate-vmu-settings-table.mjs --check` ⇒ **4.76 s**（基线 4.84）✓。
- `generate-wiring-index.mjs --check` ⇒ **7.35 s／7.20 s** vs 其 **6.65 s**（基线 ≈6.4）⇒ 慢 **~0.6–1.0 s**；★ **脚本字节两版相同（`CB433A9EDAC803C0`）⇒ 不归因于代码**；同机**非同时**、期间多人在跑 node ⇒ **环境漂移**；**两读数并列**。

## 3. 两条纪律（本轮入册，均带现场）
**(i)「我看见的那份不是全量」**：同一次真机运行，**spill 182,159 字符（全量、可解析）** vs **转录 50,319 字符（省略版）**，而 `pwsh` 面（14,468）反而完整 ⇒ 合并总纪律：**读数必须说清"哪一份（spill／转录／会话留）＋哪一版（blob 哈希）＋哪一时刻"**。
**(ii)「旧数字是旧方法的产物」【双向】**：R34 的 `4/114` 是**新方法**的产物（`],` 结尾列表**永不终止 ⇒ 越界配对**），**R33 的 `3/115` 才对**（**我本轮 `--check` 独立得到 `3/115`**）⇒ 纪律：**凡"数字变了"，采纳前必须给机制层解释**（既防旧数字被新方法改掉，也防新数字没解释就推翻旧结论；Lead 自陈 R33 未要机制即裁 (a) ⇒ 裁错）。

## 4. 具名未闭合
1. **"保留值＝原文前缀"** 未复算（输入件不可得）⇒ 建议留输入件／回执带原文哈希。
2. **"只中和 STALE"** 未直接核（脚本未找到），且技术需按现形状（内部 import，非 spawn）重述。
3. **我的 kernel 路径探针**（`appliesTable()` 两键 `undefined`）＝我的仪器问题。
4. **`wiring-index` 性能**：机制未定（脚本未变 ⇒ 环境漂移），两读数并列。
