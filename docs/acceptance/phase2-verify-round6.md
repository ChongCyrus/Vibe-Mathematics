# Phase 2 · verify2 · Round 6 —— 独立复核 R4/R5 的两条常驻断言 ＋ B1′ 配对秒数

> 纪律：**只读复核**（真树只写本报告；所有夹具/反例一律**副本制**、临时文件 `D:\_tmp\p2r6`）；**"没核"与"核了"分开写**；★ **引用前先落一行核验**、**读数绑版本**；★ 未跑全量／`regen-all`／git。
> **读的版本（本条为全文基准）**：`HEAD c93c122`，**开跑时 `git status` 空**。
> `tests/b1prime-staleness-report.test.mjs` **`BCA9515BEA179A9C`（82L）**；`tests/b1prime-c3-computed-guard.test.mjs` **`DF29854ED3CF6706`（67L）**；`scripts/generate-wiring-index.mjs` **`1D89740F0AA8A72D`（372L）**；`scripts/generate-vmu-settings-table.mjs` **`403479A1EFC6B426`**；`vibe-math-vmu/settings/schema.js` **`90D9D1D492D88C53`（1747L）**；`vibe-math-vmu/docs/04-settings.md` **`46C8BB040EA212A5`**；`vibe-math-vmu/host.js` **`461D7FD499F016EA`（1167L）**；`tests/run-tests.mjs` **`B988AF9351E9219C`**；`package.json` **`B385EE527FFFEB7C`（files[] 701 distinct）**。
> ★ **在飞写者（按 Lead 的 ④ 要求核过）**：本轮开跑时树干净；**中途出现 pack2 的【未跟踪】报告** `?? docs/acceptance/phase2-pack-round6-a1-impl.md`；★ **`settings/schema.js` 与 `kernel/**` 的 blob 在开跑前后【逐字节相同】**（`90D9D1D492D88C53`／`81D7CDD40962C773`／`E4873BFBC9AAC0AB`）⇒ **我的读数没有被 A1 的在飞写入混版本**；★ 并在**当前时刻复跑两条套件**：**8/0**、**5/0**、`--check exit=0`（同读数）。

## 0. 结论速览
| 项 | 判定 | 我的读数 |
|---|---|---|
| **① B1′ 常驻断言** | ★ **成立（非自报）** | 我跑 **8 passed / 0 failed，exit=0**；**非空前置我独立复现**：坐标 `headerIdx=258`／`bodyFirst=260`（该行确为键行）／CONTROL（未改 doc 走同一条缝）**exit=0**／broken **exit=2 ＋ 恰 1 行 `诊断:`** |
| **① #2 断言"钉住什么"** | ★ **是"内容一致性"，不是"来源/凭证"** | 我实测 `parentDetail === childLast.slice(0,200)` **true**（两边均 **59** 字符）；★ 能抓住**父侧改写**（其 kind 对调反例即红），★ **不能**抓"父子同向缺陷"；★ 200 字符上限**两侧都有**且**当前不起作用** |
| **① 新发现（具名）** | ★ **崩溃路径未守，且 detail 无用** | 缝指向**不存在**的路径 ⇒ 子进程 `ENOENT … :401` **exit=1**，但其**最后一行**是 `Node.js v24.21.0` ⇒ 父进程报 **`诊断: Node.js v24.21.0`**（exit=2）⇒ **忠于规则、不是有用诊断** |
| **① 自陈核实** | ✅ 属实 | 其 §4 逐字："**新旧 hard 路径逐字对比未做**（替代＝上述直接断言）；**我不把替代说成'做了新旧对比'**" |
| **② C3 常驻断言** | ★ **成立（非自报）** | 我跑 **5 passed / 0 failed，exit=0**；**CONTROL 臂真静默**（我自己建的副本：exit=0、守卫标记不出现） |
| **② target-addressed** | ✅ **用我自己的行号证明** | 我自造探针把 `NS[key]` 放在**第 7 行** ⇒ 守卫打印 **`zzv6-probe.js:7`** |
| **② 当天副本制反例（我造）** | ✅ **有牙且钉在夹具上** | 把计算属性扫描改成 **no-op**（锚点消失＝落地证明）⇒ **副本里的测试 exit=1，恰好 3 条 FIXTURE 断言红，CONTROL 不受影响** |
| **② 真树守卫** | ✅ 静默 | `--json`＝`{wired:1108, undetermined:5, notWired:113, stale:false}` ⇒ **无需 `--write`**；`--check exit=0` |
| **③ B1′ 秒数（我配对）** | ★ **方向稳、幅度随负载** | 交错同会话：**旧 7.60／7.64s** vs **新 6.66／5.76s**；★ 对照 `settings-table --check` **4.70／4.75s（未变）** ⇒ **不写任何数为最终值** |
| **④ 顺手** | ✅ | `host.js` **1167 ≤1200**；`run-tests.mjs` blob **未变**；★ **两条新套件未登记【非欠账】**：我实跑 `audit-package-membership` ＝ **29 passed / 0 failed，exit=0** |

## 1. ★ ① B1′ 常驻断言：`tests/b1prime-staleness-report.test.mjs`
**我跑一遍**（`node tests/b1prime-staleness-report.test.mjs`）⇒ `=== B1PRIME STALENESS REPORT: 8 passed, 0 failed ===`，**exit=0** ✓（与其自报 8/0 一致）。★ 断言条数我按源码数过：**8 条**（`:37/:39/:49/:54/:61/:67/:68/:73`）。

**非空前置（我独立复现，不只信它的数）**：自建夹具 = 拷 `docs/04-settings.md` → 删表体第一条键行 → 用 `VMU_SETTINGS_DOC=<副本>` 跑 `generate-wiring-index.mjs --check`：
```
headerIdx=258 (0-based)  bodyFirst=260  isKeyRow=true        ← 与夹具假设一致
CONTROL  unmodified doc via the seam : exit=0                ← 缝是活的
HARD-STALE broken doc via the seam   : exit=2  诊断 lines=1  ← ★ 前置成立（真的 hard-stale）
```
★ **缝在哪一端**（我读码核过，不是转述）：**`VMU_SETTINGS_DOC` 只被 `scripts/generate-vmu-settings-table.mjs:33`（`const DOC = process.env.VMU_SETTINGS_DOC ? resolve(...)`）读取**；`generate-wiring-index.mjs` **无该引用**（`NO REFERENCE`）⇒ 缝是**子进程**读的 ⇒ CONTROL 臂的 `exit=0` 确实是"同一条缝、未改 doc"的有效对照 ✓。★ **更强的一证（我加的）**：`VMU_SETTINGS_DOC` 指向**不存在**的路径 ⇒ 子进程当场炸 ⇒ **`exit=2`**（见下"新发现"）⇒ 该环境变量**真的被消费**。

### ★★ #2 断言到底钉住了什么（Lead 指定判断）
源码事实：父侧 `generate-wiring-index.mjs:156-157` `detail = String(r.stderr||r.stdout||'').trim().split('\n').filter(Boolean).slice(-1)[0] … .slice(0,200)`；测试 `:57` 跑 `generate-vmu-settings-table.mjs` 取它**自己**的最后一行，再与父进程 `诊断:` 里那条**逐字比**。我的读数：
```
child last stderr line (len=59) = "  run: node scripts/generate-vmu-settings-table.mjs --write"
parent 诊断 detail              = "  run: node scripts/generate-vmu-settings-table.mjs --write"
★ equality parentDetail === childLast.slice(0,200): true   parentDetail.length=59  childLast.length=59
```
**判断**：它钉住的是 **"父进程转发的那条 detail ＝ 同一个生成器在【同一输入】下的最后一行"** ⇒ ①**能**抓住**父侧改写/换桶**（其 R4 §3 的 kind 对调反例正是把它打红 ✓）；② **不是"来源/凭证"**（不证明那段文字来自**那一次**子进程调用 —— 测试是**另起一次**子进程比的）；③ **抓不到"父子同向缺陷"**（若两边同样丢信息，等式照样成立 —— 见下"新发现"即是此例）；④ ★ **200 字符上限在两边都有**（父侧 `:157` 截，测试子侧也截）且 **当前不起作用**（真消息 **59** 字符）⇒ 若将来子进程消息 >200，"父侧截 200"这种同向截断**看不出来**。⇒ 故其"**强于`新旧碰巧一致`**"的说法**在"约束内容/能抓父侧改写"这个方向上成立**，但**不能升格为"证明消息来源"**。

### ★ 新发现（我造，具名）：**崩溃路径未守，且 detail 是 Node 崩溃尾行**
`VMU_SETTINGS_DOC=<不存在>`（隔离复跑，原样）：
```
CHILD  (generate-vmu-settings-table.mjs) exit = 1   stderr 14 行，最后一行 = "Node.js v24.21.0"
PARENT (generate-wiring-index.mjs --check) exit = 2
   [1] vmu wiring index: 设置表过期 (settings table STALE) — docs/04 §11 is not what settings/schema.js yields,
   [2]   so the WIRED column would be wrong for every row; refusing to run:
   [3]   · docs/04 §11 (settings table)  →  先跑 node scripts/generate-vmu-settings-table.mjs --write
   [4]     诊断: Node.js v24.21.0
```
⇒ ★ **规则被忠实执行**（`detail` 确实是子进程最后一行），但**作为诊断它无用**：人需要的是 `Error: ENOENT … open 'D:\_tmp\p2r6\definitely-does-not-exist.md'`（子进程 stderr 的第 3 行），而转发的是 **Node 版本横幅**。★ **该路径未被 #2 覆盖**（其测试只走 STALE 路径）。**建议（不代改）**：崩溃类（子进程非 0 且末行匹配 `^Node\.js v`）时取**首个 `Error:` 行**或附**退出码**；或把崩溃路径也写成一条断言。
★ **我自己的仪器失误（具名）**：我第一版把"忠实"判成 `false` —— 因为我拿**已被 `trim()` 的**父值去比**未 trim 的**子行（子行尾部有 `\r`）。这是**我比较对象选错**（本轮 Lead 特意提醒的那一类）；测试自己两边都先 `trim()` 整个流，故**它没有这个毛病**。

## 2. ★ ② C3 常驻断言：`tests/b1prime-c3-computed-guard.test.mjs`
**我跑一遍** ⇒ `=== B1PRIME C3 COMPUTED GUARD: 5 passed, 0 failed ===`，**exit=0** ✓（5 条：`:33/:51/:55/:58/:60`）。其输出里可见守卫的具名行：`· kernel/zzcomputed-probe.js:3  NS[ … ]  return NS[key]`。
- ★ **CONTROL 臂真静默（唯一"不是恒响"的证据）**：我自建副本（只拷 `scripts` ＋ `vibe-math-vmu`，**不加探针**）⇒ `exit=0`、守卫标记 `计算属性访问` **不出现** ✓。
- ★★ **target-addressed（我自己造探针，不用它的 3）**：探针把 `NS[key]` 放在**第 7 行**（前面塞 3 行填充）⇒ 守卫打印 **`· kernel/zzv6-probe.js:7  NS[ … ]  return NS[key]`** ⇒ **行号 ＝ 探针里那一行的真实行号** ✓（`:272` 的行号算法：按匹配点之前的换行数计数）。
- ★ **当天副本制反例（我造）**：把生成器里的计算属性扫描**改成 no-op**（锚点 `const cre = new RegExp('\\b' + nsName + '\\s*\\[', 'g')` → 永不匹配；**落地证明：原锚点已消失**）⇒ **副本里的该测试 exit=1**，红在**恰好这 3 条 FIXTURE 断言**上，且 **CONTROL 不受影响** ✓：
```
FAIL ★ FIXTURE: the guard FIRES (named line + non-zero exit) when a computed access exists [exit=0 named=0]
FAIL ★ target-addressed: the reported line number equals the probe's real `NS[key]` line [expected :3 got ""]
FAIL and the report names the BINDING, so a reader knows what to inspect []
```
⇒ **这 3 条确实钉在夹具上**（不是泛红）。(b) 真树守卫**静默**、`--json` ＝ `{1108,5,113,stale:false}` ⇒ **不需要 `--write`**；`--check` **exit=0** ✓。

## 3. ★ ③ B1′ 秒数（**我自己的配对读数**）
**量法（写清）**：旧副本 ＝ **同一棵树**，**只有 `scripts/generate-wiring-index.mjs` 取 `514540f^`（＝`1960c8d`）的字节**（`git cat-file blob` **二进制**取出；`OLD` 含 `spawnSync`、**不含** `Promise.all`，351L；`NEW` 372L）⇒ **比较被隔离到 B1′ 那一处改动**；适配性 sanity：旧副本 `--check exit=0` ✓；两臂**交错**跑（OLD→NEW→OLD→NEW），同机同会话，`[Diagnostics.Stopwatch]` 包住整条命令。
```
round 1  OLD : 7.60s  exit=0        round 1  NEW : 6.66s  exit=0
round 2  OLD : 7.64s  exit=0        round 2  NEW : 5.76s  exit=0
★ 对照（B1′ 未触及的脚本）：settings-table --check   OLD 4.70s  /  NEW 4.75s   → 未变
```
⇒ ★ **方向稳定**（两轮 NEW 都更快：−0.94s／−1.88s）⇒ **B1′ 确实减少了 ~1–1.9s**；★ **幅度随负载**（我 7.60–7.64 → 5.76–6.66；其 R2 副本 8.74/8.87 → 6.50/6.42；Lead 7.29／6.37；审计 7.55/7.84 → 6.20/6.20）⇒ ★ **按 Lead 要求：我给配对读数，不把任何一个数写成最终值**。★ `settings-table` 两树几乎相同 ⇒ 差异**特定于 B1′ 改的那条路径** ✓。

## 4. ④ 顺手项
- `vibe-math-vmu/host.js` ＝ **1167 行 ≤ 1200** ✓（余量 33）。
- `tests/run-tests.mjs` blob **`B988AF9351E9219C` 未变** ✓（`GATE_SUITE_TIMEOUT_MS` 随之未变）。
- `package.json` `files[]` **701 distinct**；★ **两条新套件都未登记** —— ★ 我**独立实跑** `node tests/audit-package-membership.mjs` ⇒ **`PACKAGE MEMBERSHIP: 29 passed, 0 failed`，exit=0** ⇒ **普通 `tests/*.test.mjs` 无登记义务** ⇒ ★ **"未登记"不是欠账**（这正是 comms2 R5 §1 **自陈"未独立复跑"** 的那条 ⇒ **本轮由我补上独立读数**，其撤销**成立**）。

## 5. 没核 / 未做（与"核了"分开写）
1. **未核**：`detail` 的**旧实现**（`spawnSync` 串行版）在 hard 路径上的逐字对比 —— ★ 我**没有**做（作者也明说未做）；我只独立复现了**新实现**的行为。
2. **未核**：`NS[K]` 字面量常量键的常量表解析（作者明记不猜）——我**未核**，属其具名残差。
3. **未做**：崩溃路径取"首个 `Error:` 行"的**修法**（我只给读数与建议，**没改任何代码/测试**）。
4. **未量**：全量 sweep／整套门禁（归 Lead）；本轮我只跑了两条套件 ＋ `audit-package-membership` ＋ 生成器 `--check`／`--json`。
5. **不改**：我**未改** `tests/**`、`scripts/**`、`kernel/**`、`settings/**`、`package.json` —— 本轮真树只新增**本报告**一个文件。

## 6. 传给 Lead 的两条可复用教训（本轮现场）
1. ★ **"响了 ≠ 有用"**：一条**忠实**的消息路径（子进程最后一行）在**崩溃路径**上会转发 `Node.js v24.21.0` ⇒ **"消息来自子进程"与"消息对人有诊断价值"是两件事**（与"打印 ≠ 断言"同族，但这一层是**语义可用性**）。
2. ★ **比较前先确认比的是哪两份东西**（我本轮在"忠实"上错了半格：拿 trim 过的父值比未 trim 的子行）——★ 与 R39 那处失误（拿 `after` 与已 splice 的 `lines` 比）**同一族**；**两次都是我的仪器、都不是被测物的缺陷**。
