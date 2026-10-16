# Phase 2 · verify2 · Round 10 —— 把 R7 修复那条谓词的【残余分支】构造出来（附一条可核判据）

> 纪律：**只读复核**（真树只新增本报告）；构造一律**副本制**（`D:\_tmp\p2r10`）；★ **每条都有构造方式＋原样输出＋退出码**；★ **"没核"与"核了"分开写**；★ **读数绑 blob**；未跑全量／`regen-all` 写／git 写。
> **读的版本**：`HEAD 4e5b3d9`（★ 报告时刻在飞的都是 **docs**：`M docs/acceptance/17-objective-status.md`／`?? phase2-pack-round10-a1-wire.md` ⇒ **不碰被测物**）；★ **被测谓词所在文件 `scripts/generate-wiring-index.mjs` ＝ `2B6A04CE241EF737`**（**与 R8/R9 相同 ⇒ 谓词未被本轮改动**）；`vibe-math-vmu/kernel/reportfeedback.js` `2184859F24AC6BED`；`host.js` **1167 行**；`tests/run-tests.mjs` **`B988AF9351E9219C`（未变）**。
> **被测谓词（逐字，`:162-163`）**：`const detailLines = String(r.stderr || r.stdout || '').trim().split('\n').filter(Boolean)` ／ `const detail = detailLines.find((l) => /^\s*Error:/.test(l)) || detailLines.slice(-1)[0] || ''`；父进程 `:327 if (c.detail) console.error('    诊断: ' + c.detail)`、`:329 process.exit(2)`。
> **构造方法（先说清）**：副本里把**两个子脚本换成 stub**（软子检查恒 `exit 0` 静默），⇒ ★ **父进程真实代码路径**（`execFile`＋谓词＋`诊断:`＋退出码）原样执行，只让**子进程的输出/退出**可控；★ **stub 只替换子进程，不替换被测谓词**。OOM 那条**不用 stub**（真子进程，见 §4）。

## 0. 结论速览
| 分支 | 构造 | 读数 | 判定 |
|---|---|---|---|
| **1a 既无 `Error:` 也无 Node 尾，但有文本** | 硬 stub 打 2 行 note，`exit 3` | 父 **exit=2**，`诊断: retrying later` | 取**末条非空行**＝**子进程自己说的最后一句**；**是否有用完全取决于子进程** |
| **1b 子进程沉默**（stub 不打任何东西 `exit 3`） | 硬 stub 静默 `exit 3` | 父 **exit=2**，★ **完全没有 `诊断:` 行**（stderr 3 行） | ★ **新缺口（具名）**：**诊断槽会随子进程输出有无而消失** |
| **2 多条 `Error:` 行** | 硬 stub 先 `Error: upstream connection refused` 后 `Error: ENOENT …`，`exit 1` | 父 **exit=2**，`诊断: Error: upstream connection refused`（**第一条**；末行是 ENOENT） | ★ **谓词可返回【非根因】那行**——已构造出来 |
| **3 信号杀死** | 硬 stub `process.kill(pid,'SIGKILL')`；另 `process.abort()` | 父 **exit=2**（两种都是）；SIGKILL 那路**无 `诊断:` 行**；abort 那路 `诊断: 2: run (node:internal/modules/esm/module_job:561:25)` | ★ **与"崩溃=exit 2"不冲突**（见 §3）；★ 但 abort 那路是**无用诊断**（见 §4） |
| **对照（正常 STALE 文案）** | 硬 stub 打真 stale 建议行 `exit 2` | `诊断: run: node scripts/generate-vmu-settings-table.mjs --write` | ✅ 与 R8 的 STALE 字节不动一致（**有用**） |
| **★ 新发现（真子进程，无 stub）** | `NODE_OPTIONS=--max-old-space-size=16` 跑**真**生成器 ⇒ OOM abort | 父 **exit=2**，★ `诊断: 15: 00000178C0619B5A`（**裸原生地址帧**） | ★★ **R7 修复未覆盖的第二类无用诊断** |

## 1. 分支 1：**既无 `Error:`、也无 Node 尾**
- **1a（有文本）**：硬 stub `console.error('note: upstream refused')` ＋ `console.error('retrying later')`，`exit 3` ⇒ 父进程原样输出：
```
vmu wiring index: 设置表过期 (settings table STALE) — docs/04 §11 is not what settings/schema.js yields,
  so the WIRED column would be wrong for every row; refusing to run:
  · docs/04 §11 (settings table)  →  先跑 node scripts/generate-vmu-settings-table.mjs --write
    诊断: retrying later
```
⇒ ★ 谓词取了**末条非空行**（`retrying later`）——那是**子进程自己说的最后一句**，**但不是诊断**（本例里最没信息量的一句）。⇒ **判定：这一支的"有用性"不是谓词能保证的**；谓词只保证"**是子进程的原话**"（与 R7 注释的口径一致）。
- **1b（子进程沉默）**：硬 stub 什么都不打、`exit 3` ⇒ 父进程 stderr **只有 3 行**（bucket 头 2 行＋`· … → 先跑 …` 1 行），★ **没有 `诊断:` 行**：
```
PARENT exit = 2   stderr lines = 3   ★ 诊断: line present = false
```
⇒ ★ **新缺口（具名，最小反例＝"非零退出但没有任何输出"）**：`:327` 的 `if (c.detail)` 让**诊断槽在子进程沉默时整条消失** ⇒ 读者看到"STALE ＋ 该跑什么"，**看不到"为什么"**（因为确实没有"为什么"可转述）⇒ ★ **这使报告的字段集合随失败形态而变**——正是本仓在 `receiptMeta`（round 32/33）上明确拒绝过的形状（**状态用值表达，不用键的有无**）。★ **建议（你裁，我不改）**：子进程沉默时也**具名**（如 `诊断: (子进程无输出; status=<码> signal=<信号>)`），或至少把 `status` 写出来。
★ 附带：**既有常驻套件抓不到这一支** —— `tests/b1prime-staleness-report.test.mjs` 的崩溃前置用的是"**路径不存在**"那一种（子进程总会打出 `Error: ENOENT …`）⇒ 沉默子进程与 SIGKILL 那两路**没有断言覆盖**。

## 2. 分支 2：**多条 `Error:` 行 ⇒ 取第一条**
- 硬 stub 按你的例子：先 `Error: upstream connection refused`，后 `Error: ENOENT: no such file or directory, open 'X'`，`exit 1` ⇒ 父进程：
```
PARENT exit = 2   ★ 诊断 line = "    诊断: Error: upstream connection refused"
（该子进程的【末行】是那行 ENOENT —— 它才是"打开失败"的直接原因）
```
⇒ ★ **你的担心已由构造证实**：谓词**钉第一条** `Error:`，因此**可以返回非根因那行**。★ **权衡（我的读数＋判断，供你裁）**：对 **Node 致命轨迹**而言第一条通常是**最外层/最可读**的错误（所以 R7 的选择在"ENOENT 崩溃"那一类上是对的、也确实救回了 R8 的缺陷）；但对**被包裹/链式**错误（外层泛化、根因在内层或 `cause` 里），第一条会**丢掉根因**。★ 可选形态（**我不改代码**）：① 取**最后一条** `Error:`（最靠近退出）；② **两条都报**（首＋末）；③ 把谓词扩成 `^(Error|FATAL ERROR|Assertion)` —— ★ **③ 正好能补上 §4 那个真实缺口**。

## 3. 分支 3：**子进程被信号杀死**（`status` 与 `signal` 的关系）
- **构造 A（SIGKILL）**：硬 stub `process.kill(process.pid,'SIGKILL')` ⇒ 父 **exit=2**、**无 `诊断:` 行**（子进程没写过任何东西 ⇒ 同 §1b）。
- **构造 B（`process.abort()`）**：父 **exit=2**、`诊断: 2: run (node:internal/modules/esm/module_job:561:25)`（见 §4）。
- **机制读数（同一 `promisify(execFile)` 通道）**：被 SIGKILL 的子进程 ⇒ `error.code = 1`、**`error.signal = null`**；★ **本机是 Windows：`process.kill` 是"终止"语义而非 POSIX 信号** ⇒ 观测到的 `code` 是**数字** ⇒ 父进程的映射 `typeof e.code === 'number' ? e.code : 1` 得 **status=1** ⇒ **非 0 ⇒ 计入 stale ⇒ 父 exit 2** ✓。
- ★ **与"崩溃=exit 2"是否冲突：不冲突（有读数）** —— 父进程的退出**只由 `stale.hard.length` 决定**（`:322/:329`），**与子进程的具体码/信号无关**：我构造出的三种非零（`1`＝SIGKILL 模拟、`134`＝abort、`134`＝OOM）**都得到 exit 2** ✓；而既有断言只钉"**路径不存在**那一种构造 ⇒ exit 2"，因此**断言没有被这三路推翻，但也没有覆盖它们**（见 §1 末）。

## 4. ★★ 新发现（真子进程、无 stub）：**R7 修复未覆盖的第二类"无用诊断"**
| 构造 | 子进程原样读数 | 父进程 `诊断:` |
|---|---|---|
| `NODE_OPTIONS=--max-old-space-size=16 node scripts/generate-vmu-settings-table.mjs`（**真**生成器 OOM abort） | `status=134, signal=null`；**23 行**；首 3 行＝`\r`／`<--- Last few GCs --->`／`\r`；★ **有 `FATAL ERROR:` 行**；★ **没有**匹配 `^\s*Error:` 的行；**末条非空行＝`15: 000001DD3605989A`** | **exit=2**，`诊断: 15: 00000178C0619B5A`（**裸原生地址帧**） |
| 同上 heap=24MB | 同形（17 行，末行 `10: 0000025154B5D11A`） | `诊断: 10: 000001291D690F70` |
| 同上 heap=32MB（**对照**） | `status=0`、**无输出** ⇒ 没 OOM | 父 exit=0、**无 `诊断:`** ⇒ 证明差别只来自堆大小 |
| `process.abort()`（stub，但输出是**真** Node 原生 abort 转储） | `status=134`；329 B／13 行；★ **首个 `^\s*Error:` ＝ 未定义**；末条非空＝`2: run (node:internal/modules/esm/module_job:561:25)` | `诊断: 2: run (node:internal/modules/esm/module_job:561:25)` |
**★ 机制（有原样字节，不是推理）**：Node 的**致命路径**打的是 **`FATAL ERROR:`** 头 ＋ **原生栈**，末行是**裸地址帧**；而 R7 的谓词只认 `^\s*Error:` ⇒ **两条臂都落空**：`Error:` 臂不命中，末行臂取到**地址帧**。★ **可用的那一行其实就在输出里（我逐字取到）**：
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```
⇒ ★★ **最小反例（你派修复用）**：①（真子进程、无需 stub）`NODE_OPTIONS=--max-old-space-size=16` 跑真生成器 ⇒ 父报 `诊断: 15: 00000178C0619B5A`；②（stub）子进程 `process.abort()` ⇒ 父报 `诊断: 2: run (node:internal/modules/esm/module_job:561:25)`。⇒ **修法方向（我建议、未改）**：把谓词扩为 `^\s*(Error|FATAL ERROR|Assertion)`（③ 与 §2 的 ③ 同一处改动），就能把 `FATAL ERROR: Reached heap limit …` 抬到 `诊断:`；★ 并建议**同时**在沉默/信号情形下具名 `status`/`signal`（§1b）。

## 5. 顺带：把 R9 那条纪律写成**可核判据**（我正是靠临时副本才证明无损的）
**判据（三步，任何人在仓内可跑）**
1. `git log --all --oneline -- <path>` ⇒ **有没有任何一笔提交带过该文件**（本案例：**只有 `31fd3cd` 一笔**，即**转换后的形态**）。
2. ★ **决定性一步**：`git cat-file -e <转换前字节的 sha256>` ⇒ **该 blob 是否在对象库里**。
   - 本案例：`git cat-file -e AC62832C513E8744` ⇒ **`NOT FOUND (exit 128)`** ⇒ ★ **转换前的字节从未进入 git**（不是"某个分支没有"，而是**对象库里没有**）。★ 我的仓外副本**全量 sha256 ＝ `ac62832c513e87449b3acc1c3ec0277fe8f7b28f5c24542c159800a3362190db`（7367 B）**。
3. 若 1、2 都指"仓内没有" ⇒ ★ **是否有一份【带哈希记录的】仓外副本**？本案例：**有且只有两份**（`D:\_tmp\p2r8\old\…` 与 `…\mut\…`，同为 `AC62832C513E8744`、`/** */` 头）⇒ ★ 这条主张**只能在【那份副本仍在】时被复核**。
**★ 若临时副本已被清理，该主张会退化成什么**：★ **退化成"不可复核"（unverifiable）——不是"假"**：转换**可能确实无损**，但**任何人都再也不能重算那个比较**（既没有 git 里的转换前形态，也没有带哈希的副本）⇒ ★ 按本仓"读数必须能被别人重算"这条，**"不可复核"本身就是一个发现**，而且它与我 R9 的判定方向不同 —— R9 说的是"**这份转换是无损的**（我已算出）"，本条说的是"**这个结论的证据链只有一个临时目录**"。

## 6. 我自己的两处仪器注意（具名）
1. ★ 我在 §4 的独立复算里**漏掉了谓词在整条流上的 `.trim()`** ⇒ 我一度打印"predicate would choose: `"\r"`"；★ **父进程实际先 `String(...).trim()`**，所以它取的是**末条真正有内容的行**（`2: run (…)`）——与我同时在**真实父进程**里量到的 `诊断:` **一致**。⇒ 又一次"**先确认比的是哪两份东西**"（R8/R9 同族）。
2. ★ §4 的 OOM 一臂里，**子进程是真的**（无 stub），但它是在**副本**里被 `spawnSync` 拉起的**真树**生成器 ⇒ ★ 我写明：**被测的是父进程谓词 + 真子进程输出**，只有"谁来拉起子进程"被包了一层。

## 7. 没核 / 未做（与"核了"分开写）
1. **没核**：`e.signal` 在**非 Windows** 平台上的取值（本机 Windows 下 `process.kill` 是终止语义 ⇒ `signal=null`）；★ 我未跨平台验证，**不把本机结论外推**。
2. **没核**：既有常驻套件在"沉默子进程／SIGKILL"两路下的行为 —— 我只**读了它的构造**（用"路径不存在"），**没有**把那两路接进套件去跑（改测试不在我范围）。
3. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；谓词修法仅**建议**（§2/§4）。
4. **未核**：报告时刻在飞的 `phase2-pack-round10-a1-wire.md` 与 `M 17-objective-status.md`（**只读到文件名与状态，未读内容**）。
