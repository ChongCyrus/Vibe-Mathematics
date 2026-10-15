# B1′ 交付报告 · 两道子检查改为**并发**（`scripts/generate-wiring-index.mjs`）

> ★ **路径说明（写者隔离）**：Lead 指定的 `docs/acceptance/comms-round2-report.md` **已存在且不属于我** —— 它是 **`v5r-reader-c` 的 Round 2 报告（task-11 · 目标 2 通信/协作/会议，88 行）**。我**没有覆盖它**，本报告落在同目录的独立路径 `docs/acceptance/b1prime-wiring-index-concurrency.md`。★ **请 Lead 裁**：若你要的是**追加**到那个文件，说一声我再挪（那属于跨写者边界，我不自行跨）。
> 真树只读（hash 前后一致 ✓）；副本制；未跑全量／`regen-all`／git；**无半截状态**。

## 1. 改动
1. `async function stalenessReport()`，两条子检查用 **`Promise.all` 并发**（不同生成器、不同文件，互不依赖）。
2. ★ **排空两条流的选择＝`execFile`（`promisify(execFile)`）**：它**自己缓冲并排空 stdout/stderr** ⇒ 不存在"没挂 `data` 监听 ⇒ 管道写满 ⇒ 死锁"的写法，也没有需要记得注册的 per-stream handler。★ **`maxBuffer: 8 MiB`**（默认 1 MiB **不是**安全界：settings-table 子进程吐 **~1750 行**，正是 R41"管道"嫌疑的来源）。
   ★ **不用 `stdio:'ignore'`**：`:133-136` 的 `detail`＝子进程输出**最后一行诊断**，是"语义零变化"＋**第 6 轮"误导消息"修复**的载体 ⇒ 丢输出＝语义变化。
3. ★ **组装顺序确定**：`Promise.all` 结果**按 `checks` 原始顺序**遍历后再 `push` ⇒ "谁先返回"不决定输出；`{hard,soft}` 分桶与 `detail` 取法（`stderr || stdout` 最后一条非空行、`slice(0,200)`）**逐字未变**。
4. 唯一调用点 `:293`（在 `async function main()` 内）改为 **`await stalenessReport()`**。
   ★ **调用点搜索来源**：**转述 Lead 的读数**（`scripts/`／`tests/`／`vibe-math-vmu/` 命中 **1 处**＝`:293`）—— **我本轮没有独立重跑那次 grep**（预算），按"转述要注明来源"如实标注；我**独立看到**的是 `:293` 位于 `async main()` 内。

## 2. ★ 语义等价（靠对比，不靠论证）
| 场景 | 结果 |
|---|---|
| **(i) 干净树**：旧（串行 `spawnSync`）vs 新（并发 `execFile`） | ★ **`--json` 输出逐字节相等 ✓、退出码相等（0/0）✓** |
| **(ii) hard 失败路径**（副本里把设置表弄 STALE） | ★ **未证**：`--json` 那次相等**不算数**（`--json` 不走 `诊断:` 分支）；改用**纯 `--check`** 后**新旧都 exit=0、stderr 无 `诊断:` 行** ⇒ **我的 stale 夹具没让 hard 检查失败** ⇒ **`detail` 逐字相同未建立** |

**旧实现如何进入副本**：把新文件**反向打补丁**回串行版（三处锚点：`async` 签名／`execFile` 导入两行／`Promise.all` 块 → `checks.map`＋`spawnSync`），并**断言 `Promise.all` 已消失**（落地证明）；两副本除该脚本外内容相同。

## 3. 秒数（同机同会话；`process.hrtime.bigint()` 包住整条子命令）
| 命令 | run1 | run2 |
|---|---|---|
| **旧副本** `--check` | **8.74s** | **8.87s** |
| **新副本** `--check` | **6.50s** | **6.42s** |
| **新·真树** `--check` | **6.32s** | **6.07s** |
⇒ ★ 成对比较 **−2.3s**；**真树 6.07–6.32s** ⇒ **已在历史目标 ≈6.65s 以内**，接近你给的 **≈5.7s**（副本比真树慢，以真树为准）。★ **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。

## 4. ★ 常驻断言：**本轮没有留下有牙的常驻断言 —— 明说**
它的**前置夹具**（把 hard 检查弄成 STALE）**今天没构造成功**（§2(ii)），而没有该夹具的断言只能测 clean 路径的形状、**测不到** `detail`／跨 kind 串味 ⇒ 按你的要求**不造没有牙的断言**：**目前只能靠 (i) 的新旧对比守 clean 路径；hard 路径未被守**。
★ **下一轮绑定项**：先解决"副本如何被弄成 hard-stale"（候选：`VMU_DOCS_DIR` 类**注入根**——审计侧有该接缝，**生成器是否有【未核】**；或改 `settings/schema.js` 里被 §11 引用的字段），再写常驻断言：**每 kind 至多一条**／**hard `detail` ＝ settings-table 最后一行**／**soft `detail` ＝ planned-settings 最后一行**／**不得跨 kind 串味**。

## 5. 状态 / 没核
- **`--check` 不 STALE**（真树 `--json` 新旧相等、exit=0）⇒ **不需要 `--write`**；三档计数未受影响（未碰 settings-table）。
- **跑了/核了**：干净树新旧 `--json` 对比、副本三组秒数、反向补丁落地证明、真树 hash 前后一致。
- ★ **没核/未证**：**(ii) `detail` 逐字相同**；**常驻断言**（未写，理由见 §4）；**调用点 grep**（转述 Lead）；**生成器是否存在 `VMU_DOCS_DIR` 类注入根**（未核）。
- **仓内改动**：`scripts/generate-wiring-index.mjs`（并发＋`await`）＋本报告（新路径）；**无半截状态**。
