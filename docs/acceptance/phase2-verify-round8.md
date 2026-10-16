# Phase 2 · verify2 · Round 8 —— 独立复核 R7 的崩溃路径修复（含那条**审计算不出来**的主张）

> 纪律：**只读复核**（真树只新增本报告）；所有夹具/反例一律**副本制**（`D:\_tmp\p2r8`）；**"没核"与"核了"分开写**；★ **每个读数绑 blob**；★ **不把转述写成"我跑了"**；未跑全量／`regen-all`／git。
> **读的版本（全文基准，臂跑完后又复算一遍，全部 same）**：`HEAD beef759`（＝**R7 修复提交** `fix(gates): make the crash path carry a useful diagnostic…`，只动 `scripts/generate-wiring-index.mjs` ＋9/−1 与 `tests/b1prime-staleness-report.test.mjs` ＋15）；
> **修复后** `scripts/generate-wiring-index.mjs` **`2B6A04CE241EF737`（379L，含 `detailLines.find`）**；★ **修复前** ＝ `26a7eb8:scripts/generate-wiring-index.mjs` **`1D89740F0AA8A72D`（372L，`Error:` 出现 0 次）**；
> `tests/b1prime-staleness-report.test.mjs` **`570EADBAE67B0B0F`（97L，11 条断言）**；`tests/b1prime-c3-computed-guard.test.mjs` **`DF29854ED3CF6706`**；`scripts/generate-vmu-settings-table.mjs` **`403479A1EFC6B426`**；`vibe-math-vmu/settings/schema.js` **`90D9D1D492D88C53`**；`vibe-math-vmu/docs/04-settings.md` **`46C8BB040EA212A5`**；`vibe-math-vmu/host.js` **`461D7FD499F016EA`**；`tests/run-tests.mjs` **`B988AF9351E9219C`**。
> ★ **在飞写者（你提醒的）**：报告时刻 `git status` ＝ **`A docs/acceptance/phase2-pack-round8-a1-wiring.md`／`M installer.js`／`M package.json`／`A vibe-math-vmu/kernel/reportfeedback.js`**（pack2 的 A1）⇒ ★ **我逐条复算了本报告依赖的 4 个 blob（上面 4 个）在臂跑完后与臂跑时【相同】，且 pack2 的这批改动【一个都没碰】它们** ⇒ **读数没有被在飞写入混版本** ✓。

## 0. 结论速览
| 项 | 判定 | 我的读数（原样） |
|---|---|---|
| **① 两侧对照（我自己造）** | ✅ **修复在崩溃路径上确实生效** | (a) **PRE-R7**：`exit=2`，末行 `诊断: Node.js v24.21.0`；★ (b) **CURRENT**：`exit=2`，末行 `诊断: Error: ENOENT: no such file or directory, open 'D:\_tmp\p2r8\ghost-does-not-exist.md'` |
| **② 那条审计算不出来的主张** | ★★ **成立，且由我算出** | 同一个 stale doc、两侧：**`诊断:` 行逐字节相同**；**整条 stderr 逐字节相同**（sha16 `F160BA148B34D6BA` 两侧一致）、**stdout 两侧都为空**（`E3B0C44298FC1C14`）、**两侧都 exit=2** |
| **③ 新增 3 条断言** | ✅ 真钉在崩溃路径上 | 套件 **11 passed / 0 failed，exit=0**；★ **崩溃前置我直接量到**：子进程 `exit=1`、child 末行 `Node.js v24.21.0`，父进程 `exit=2` ＋ 有 `诊断:` 行 |
| **④ 副本制反例（我自己造）** | ✅ **只红崩溃那两条，STALE 断言仍绿** | 把崩溃优先改回纯末行规则（**落地证明：锚点已消失**）⇒ 副本测试 **9 passed / 2 failed，exit=1**；FAIL **恰好 2 条**＝ `USEFUL fragment`／`NOT the useless Node.js v…`；★ **STALE 的 #2（父 detail ≡ 子末行）不在 FAIL 里** |

## 1. ★★ ① 两侧对照（崩溃路径；**我自己的仪器**、绝不 `cd` 到不存在的目录）
**比较对象（写明）**：**OLD ＝ 同一棵树，只把 `scripts/generate-wiring-index.mjs` 换成 `26a7eb8` 的字节**（`git cat-file blob` **二进制**取出，臂内先核 sha16 ＝ `1D89740F0AA8A72D` 且 `Error:` 0 次）；**NEW ＝ 真树当前字节**（`2B6A04CE241EF737`）。★ **两臂同一 env**：`VMU_SETTINGS_DOC=D:\_tmp\p2r8\ghost-does-not-exist.md`（★ 我**先 `mkdir` 了父目录**、用**绝对路径**、cwd 分别设为两棵树根 ⇒ **不会**重演"`cd` 失败 ⇒ 在错 cwd 跑 ⇒ `MODULE_NOT_FOUND`，末行同样是 `Node.js v24.21.0`"那种**看起来正是预期结果**的仪器故障）。
```
(a) PRE-R7  (26a7eb8 bytes)   exit = 2
    诊断 line          = "Node.js v24.21.0"
    last stderr line   = "    诊断: Node.js v24.21.0"
(b) CURRENT (beef759 bytes)   exit = 2
    诊断 line          = "Error: ENOENT: no such file or directory, open 'D:\\_tmp\\p2r8\\ghost-does-not-exist.md'"
    last stderr line   = "    诊断: Error: ENOENT: no such file or directory, open 'D:\\_tmp\\p2r8\\ghost-does-not-exist.md'"
```
⇒ ★ **我独立复现了 R6 的缺陷**（PRE-R7 版确实报 `Node.js v24.21.0`），且**修复版取到了有用那行** ⇒ 修法有效 ✓。★ 修复形状（读码）：`scripts/generate-wiring-index.mjs:163 const detail = detailLines.find((l) => /^\s*Error:/.test(l)) || detailLines.slice(-1)[0] || ''` ⇒ **优先首个 `Error:` 行；否则逐字沿用旧规则** ✓。

## 2. ★★ ② "STALE 路径字节不动"——**审计构造不出、我算了**
**审计的困境（转述其 R7 §1.2）**：它用 `^\| \`vmu\.` 在 `vibe-math-vmu/docs/04-settings.md` 上取到 **0 命中** ⇒ 构造 stale doc 失败 ⇒ 该主张**当时仍只是写手的读数**（它自己具名为"我的量具限制，不是发现"）✓。
**我的夹具（R6 那套，能工作）**：`headerIdx`（`| 键 | 类型 |` 的行，**0-based 258**）＋**真表体首行 = headerIdx+2 = 260**（臂内断言该行确为键行 `isKeyRow=true`）⇒ 删掉该行得同一份 stale doc，**两侧各跑一次**：
```
(a) PRE-R7   exit=2  diag="  run: node scripts/generate-vmu-settings-table.mjs --write"
             stderr lines=4  sha16(stderr)=F160BA148B34D6BA   sha16(stdout)=E3B0C44298FC1C14
(b) CURRENT  exit=2  diag="  run: node scripts/generate-vmu-settings-table.mjs --write"
             stderr lines=4  sha16(stderr)=F160BA148B34D6BA   sha16(stdout)=E3B0C44298FC1C14
★★ 诊断: 行逐字节相同 = true      ★★ 整条 stderr 逐字节相同 = true      ★ stdout 也逐字节相同（两侧皆空）= true
```
⇒ ★★ **写手的主张成立**：STALE 子进程的输出里**没有** `Error:` 行 ⇒ 走**回退分支** ⇒ **STALE 路径的输出（stderr 全条、stdout、退出码、`诊断:` 行）与修复前逐字节相同** ✓ —— **这条是我本轮算出来的（审计算不出）**。★ 附带读数：`E3B0C44298FC1C14` 是**空串的 sha256** ⇒ STALE 路径 **stdout 为空**（两侧一致）。

## 3. ★ ③ 新增的 3 条断言：真钉在崩溃路径上
**套件**：`node tests/b1prime-staleness-report.test.mjs` ⇒ **`=== B1PRIME STALENESS REPORT: 11 passed, 0 failed ===`，exit=0** ✓（8 → 11，与自报一致）。新增的 3 条在 **`:82`（崩溃前置：`exit 2` ＋ 有 `诊断:` 行）／`:85`（`detail` 含 `ENOENT|该路径名`）／`:88`（**不是** `^Node\.js v`）**。
**非空前置我另量一遍（不是只看它绿）**：直接把缝指向不存在路径，**子进程** ⇒ `exit=1`、其**末行** `Node.js v24.21.0`；**父进程** ⇒ `exit=2` ＋ `诊断:` 行（内容＝子进程的 `Error: ENOENT … open '<path>'`）⇒ ★ **前置真的非空、且真的走的是崩溃路径** ✓（对照 R6：那时该路径根本没有断言）。
★ **"不是泛红"的证据**：11/0 全绿（没有恒红的断言）＋ §4 的定向反例**只**把这两条打红 ⇒ 它们钉的是**崩溃路径**，不是"到处红" ✓。

## 4. ★ ④ 副本制反例（我自己造）：回退成纯末行规则
**变异**：副本里把 `:163` 的 `detailLines.find((l) => /^\s*Error:/.test(l)) || detailLines.slice(-1)[0] || ''` 换成 **`detailLines.slice(-1)[0] || ''`**（纯末行规则）；★ **落地证明＝原锚点已消失** ✓。
```
COPIED TEST: exit=1 (red ✓)   === B1PRIME STALENESS REPORT: 9 passed, 2 failed ===
  FAIL ★★ the crash `detail` carries the USEFUL fragment (ENOENT / the path), not just the last line the child printed ["Node.js v24.21.0"]
  FAIL ★ and it is NOT the useless `Node.js v…` signature line that the plain last-line rule would have forwarded ["Node.js v24.21.0"]
★ crash assertions red = true   ★ FAIL count = 2 (expect exactly 2)
★ STALE-path assertion #2 still green (not in FAIL) = true
```
⇒ ★★ **双向证据**：①**崩溃那两条**红、且**恰好**这两条；②**同一变异下 STALE 路径的 `#2`（父 `detail` ≡ 子进程末行）仍绿** ⇒ **修法是"回退式放大"（只在有 `Error:` 行时改口径），不是顺手改掉 STALE 路径** ✓ —— 这正是你指定的"唯一"证据，**由我的副本反例给出**。

## 5. 我自己的仪器注意（具名；两次都是仪器、都不是被测物）
1. ★ 我提取 `诊断:` 行的辅助函数**没有先 trim 整条流** ⇒ (b) 臂打印出的 detail JSON 末尾带一个 **`\r`**（父进程 stderr 是 **CRLF**）。★ **同一族的第二次**（R6 我曾把 trim 过的父值比未 trim 的子行 ⇒ 误判"不忠实"）；**结论不受影响**（`last-stderr-line` 那一路经 `trim()`，干净）——★ 这正是"**比较前先确认比的是哪两份东西**"这条纪律的现场。
2. ★ **绝不 `cd` 到不存在的目录**：我**先建父目录**、用绝对路径、cwd 只能是两棵树根 ⇒ 从结构上排除了审计那次 `MODULE_NOT_FOUND` 假象。

## 6. 顺手与状态
- 真树：`generate-wiring-index.mjs --check` **exit=0**／`generate-vmu-settings-table.mjs --check` **exit=0**／`tests/b1prime-c3-computed-guard.test.mjs` **exit=0** ⇒ **R7 修复只影响失败路径的消息内容**，不改变干净路径 ✓（与写手"`--check` 未变 STALE、三档计数未动"一致）。
- `host.js` **`461D7FD499F016EA`（1167 行 ≤1200）**／`run-tests.mjs` **`B988AF9351E9219C`（未变）** ✓。

## 7. 没核 / 未做（与"核了"分开写）
1. **未核**：崩溃路径**其他**失效形态（如子进程**被杀**、或输出里**既无 `Error:` 也无 Node 尾**）⇒ 我只核了"路径不存在"这一种；`detailLines.find` 取**首个** `Error:` 行在多 `Error:` 输出下取哪一条，**我未构造**。
2. **未核**：`b1prime-staleness-report` 的"**改前从别处失败**"形态（写手按你要求**不补不猜**；我亦**未核**）。
3. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）；全量 sweep／`regen-all`＝**归 Lead**。
4. **未核**：`audit-package-membership`（R5/R6 已两次独立实跑 29/0；本轮**未再跑**）。
