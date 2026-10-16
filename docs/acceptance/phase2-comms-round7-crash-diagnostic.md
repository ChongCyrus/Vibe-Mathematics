# Phase 2 · comms · Round 7 · 崩溃路径诊断（`vmu-verify2` 独立复核发现的**真实缺陷**）

> ★ 缺陷已修并**双向证明**：崩溃路径现在给出**有用**诊断（`Error: ENOENT … open '<path>'`），**STALE 路径逐字未动**（其断言仍绿）；当天副本制反例把修法**改回末行规则** ⇒ **只红崩溃断言、（STALE 断言仍绿）**。
> 真树只读（hash 前后一致 ✓）；副本制；未跑全量／`regen-all`／git；**无半截状态**。

## 1. 缺陷（复核者实测）

`VMU_SETTINGS_DOC` 指向**打不开的路径**时：子进程 `ENOENT`、**exit=1**，但其**最后一行**是 **`Node.js v24.21.0`**（Node 的致命轨迹以它收尾）⇒ 父进程**忠于规则**地报出 **`诊断: Node.js v24.21.0`（exit=2）** ⇒ ★★ **忠于规则，但对读者无用**：人需要的是再上一行那句 `Error: ENOENT … open '<path>'`。★ 而**既有断言只走 STALE 路径** ⇒ **崩溃路径从未被覆盖**。

## 2. 修法（我选的形态与理由）

```js
const detailLines = String(r.stderr || r.stdout || '').trim().split('\n').filter(Boolean)
const detail = detailLines.find((l) => /^\s*Error:/.test(l)) || detailLines.slice(-1)[0] || ''
```
- **取首个 `Error:` 行；没有 `Error:` 行时，逐字沿用旧规则（末条非空行）**。
- ★ **为什么选它**：① **STALE 路径的字节逐字不动**（STALE 子进程输出里没有 `Error:` 行 ⇒ 走回退分支）⇒ 满足你那条第 5 项"不许动 STALE 既有行为"，**不需要你裁**；② 崩溃路径**直取最有用那行**；③ ★ **仍然"忠于子进程的输出"**：报出的行**是子进程自己打的**，**没有自造文案**（未放宽规则、未丢 `detail`、`promptSection` 那类具名降级形态未动）。
- ★ **另一种候选（把退出码并进 `detail`）我没有采用**：它会让**STALE 路径的输出也改变**（多一个码）⇒ 触发第 5 项的"先报我"，且对崩溃路径的**信息增益**不如直接给出 `ENOENT` 那行。

## 3. 崩溃路径断言（补在 `tests/b1prime-staleness-report.test.mjs`，**＋3 条**）

- ★ **非空前置**：把缝指向**不存在**的路径 ⇒ 必须**真的构造出崩溃**（`exit=2` ＋ 有 `诊断:` 行）；
- ★ 断言 `detail` **含** `ENOENT` **或**该路径名（**不是**只断言"非空"）；
- ★ 断言它**不是** `Node.js v…` 那行。
**实测读数**：
```
CRASH+STALE test EXIT=0   === B1PRIME STALENESS REPORT: 11 passed, 0 failed ===   （原 8 条 → 11 条）
诊断: Error: ENOENT: no such file or directory, open 'C:\…\Temp\…\this-path-does-not-exist-<ts>.md'
```
★ 即：崩溃路径的诊断**从 `Node.js v24.21.0` 变成 `Error: ENOENT … open '<path>'`** ✓
★ **STALE 路径不受影响**：既有断言 #2（父 `detail` ≡ 子进程末行）**仍绿** ⇒ 复跑 `tests/b1prime-staleness-report.test.mjs` **11/0**、`tests/b1prime-c3-computed-guard.test.mjs` **5/0**。

## 4. 当天副本制反例（target-addressed）

`D:\_tmp\v50\counter.mjs`：拷 tree ⇒ **只变异副本**：把崩溃优先那行**改回纯末行规则**；★ **落地证明**＝原锚点已不存在。
```
MUTATION LANDED ✓ (crash-path preference removed; anchor gone)
COPIED TEST (mutant) exit=1 (red ✓) === B1PRIME STALENESS REPORT: 9 passed, 2 failed ===
FAIL ★★ the crash `detail` carries the USEFUL fragment (ENOENT / the path) … ["Node.js v24.21.0"]
FAIL ★ and it is NOT the useless `Node.js v…` signature line … ["Node.js v24.21.0"]
★ 崩溃路径断言红 = YES ✓
★ STALE 路径断言仍绿（#2 未出现在 FAIL 里）= YES ✓
REAL TREE UNTOUCHED: 2b6a04ce241ef737 -> 2b6a04ce241ef737 OK (read-only ✓)
```
⇒ ★ **双向**：改回旧规则 ⇒ **崩溃断言红、且红在正确的那两条**；**STALE 断言同时保持绿** ⇒ 证明我的修法是**回退式放大**而非"把 STALE 也改掉"。

## 5. 并入的两条纪律（复核者给，原样引用）

- ★ **"响了 ≠ 有用"** —— 忠于规则地转发**错的那一行**（`Node.js v24.21.0`）就是它的实例：**告警存在**，但**读者拿不到可用信息**。
- ★ **"比较前先确认比的是哪两份东西"** —— 与那两条仪器失误同族（我也在 R5 踩过一次：**落地检查写太松**，前缀匹配到另一条 `new RegExp` ⇒ 误报"没落地"）。

## 6. 状态 / 没核

- **跑了/核了**：崩溃诊断实测（`ENOENT` 那行）＋ `b1prime-staleness-report` **11/0** ＋ `b1prime-c3-computed-guard` **5/0** ＋ 副本反例（落地证明、红在正确断言、STALE 仍绿）＋ 真树 hash 前后一致。
- ★ **没核**：`tests/b1prime-staleness-report.test.mjs` 的"**改前从别处失败**"形态（按你上轮要求**不补不猜**）；`audit-package-membership` 我仍未独立复跑（撤销欠账依据＝你的实测）。
- **`--check` 状态**：真树未因本改动变 STALE（本改动只影响**失败路径的消息内容**）；三档计数未动。
- ★ **`git add` 纪律**：本轮**不跑门禁、不 git**；若下一轮要跑，会先提醒你 `git add`。
- **仓内改动**：`scripts/generate-wiring-index.mjs`（崩溃路径 detail）＋ `tests/b1prime-staleness-report.test.mjs`（＋3 断言）＋本报告；**无半截状态**。
