# Phase 2 · comms · Round 11 · 崩溃路径谓词：两类新具名缺口（A 字段集合 / B `FATAL ERROR:`）＋ 分支 2/3

> ★ 两个缺口都已修，且**每一条都有常驻断言＋当天副本制反例（target-addressed）**：M1 撤掉修复 ⇒ **GAP A 那一对断言红**；M2 收窄谓词 ⇒ **GAP B 那一对断言红**、并**复现出复核者那条裸地址帧 `诊断: 15: 00000243800D9F9A`**；★ **两个变异下 STALE 断言都保持绿**（证明我没动 STALE 语义）。
> 测试：`tests/b1prime-staleness-report.test.mjs` **16 passed / 0 failed**（R7 时 11 条 → 现 16 条）；`b1prime-c3-computed-guard` **5/0**。真树只读（hash 前后一致 ✓）；**无半截状态**。

## 1. ★ 缺口 A（字段集合随失败形态变化）—— 修法与形状

**病**：子进程**非零退出但零输出** ⇒ 旧码 `if (c.detail) console.error('诊断: …')` ⇒ **整条 `诊断:` 消失** ⇒ ★ **报告的字段集合随失败形态变化**（＝ `receiptMeta` 明确拒绝的形状：**状态必须用【值】表达，不能靠"键在不在"**）。
**修**（两处，形状与字节兼顾）：
```js
// stalenessReport(): detail / status / signal 一律存在（沉默也一样）
out[r.c.kind].push(Object.assign({}, r.c, { detail: detail.slice(0, 200), status: r.status, signal: r.signal || null }))
// main(): 诊断行【恒在】；有文本时逐字沿用旧行（⇒ STALE 字节不变），沉默时用具名状态
if (c.detail) console.error('    诊断: ' + c.detail)
else console.error('    诊断: （子进程无输出）status=' + c.status + ' signal=' + String(c.signal))
```
★ **两态同形**：无论有无输出，**硬失败路径的字段集合都是 `{name, fix, detail, status, signal}` ＋ 一行恒在的 `诊断:`**；差别只体现在 `detail` 的**值**（文本 vs `（子进程无输出）`）与 `status`/`signal`。
★ **为什么不把 `status` 拼到所有 `诊断:` 行**：那会**改动 STALE 路径的字节**（第 5 项明令不许）⇒ 只在沉默分支追加具名状态。

## 2. ★ 缺口 B（`FATAL ERROR:` 类）—— 谓词扩展

```js
const fatal = detailLines.find((l) => /^\s*(FATAL ERROR|Assertion)/.test(l))
const errors = detailLines.filter((l) => /^\s*Error:/.test(l))
const detail = fatal || errors.slice(-1)[0] || detailLines.slice(-1)[0] || ''
```
★ 覆盖 `FATAL ERROR:`（OOM）与 `Assertion`（Node 断言）⇒ 复核者那条 OOM 现在报 **`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`**（而不是裸地址帧）。

## 3. ★ 分支 2（多条 `Error:`）：**我选定「取最后一条」**，理由

- **权衡**：对**包裹/链式**错误（本仓真会遇到的形态：外层 `Error: upstream connection refused` 包住内层 `Error: ENOENT …`），**根因在最后**；而 Node 的**致命轨迹**（`FATAL ERROR:`）**本身就是最外层且唯一**，后续多是地址帧 ⇒ 两种形态要**分开处理**：
  1. 有 **`FATAL ERROR:`/`Assertion`** ⇒ 取**首个**该类行（它是最有诊断力的一行，后面是地址）；
  2. 否则多条 `Error:` ⇒ 取**最后一条**（链式错误的根因）；
  3. 否则 ⇒ 末条非空行（旧规则）。
- ★ **不采用"两条都报"**：会让 `detail` 变成多行，破坏"一行诊断"的既有形状（且 `main()` 的单行打印格式会变 ⇒ STALE 字节与既有断言都要动）。
- ★ **不采用"取第一条 `Error:`"（＝R7 的形态）**：复核者的最小反例正说明它会**报外层包装、丢掉根因**。

## 4. ★ 分支 3（信号杀死）—— 我按复核者的机制说明**如实记录，未额外改码**

- Windows 下 `process.kill` 是**终止语义**：`error.code=1`、**`signal=null`** ⇒ 映射 status=1 ⇒ 计入 stale；`process.abort()` ⇒ `诊断: 2: run (node:internal/…:561:25)`。
- ★ 与"崩溃 ⇒ 父 exit 2"**不冲突**：父退出码只由 `stale.hard.length` 决定（1／134／134 三种非零**都 ⇒ exit 2`）。
- ★ **信号面我未新增专门断言**（**没核**）：我能确证的是"沉默路径现在会**具名 `status`＋`signal`**"，而 `signal` 在 Windows 终止语义下恒为 `null` ⇒ **用值表达**已到位；★ **不假装覆盖了 POSIX 信号语义**（本机测不到）。

## 5. ★ 常驻断言（＋5 条；★ 覆盖既有断言覆盖不到的两支）

| 断言 | 非空前置 |
|---|---|
| **GAP A**：沉默子进程 ⇒ **恰好一行** `诊断:`（字段集合不变） | 副本里把**子进程脚本替换为 `process.exit(1)`** ⇒ 真的"非零＋零输出" |
| **GAP A**：该行**具名** `status=1`（值，不是键的缺失） | 同上 |
| **GAP B**：`FATAL ERROR:` 被取到 | 副本里的子进程**真的**打 `FATAL ERROR: Reached heap limit …` 并 **exit 134** |
| **GAP B**：**不是**裸地址帧（`![0-9A-F]{12,}`） | 同上 |
| **分支 2**：多条 `Error:` ⇒ 报**最后一条**（`ENOENT`，不是 `upstream connection refused`） | 副本里的子进程**真的**打两行并 exit 1 |

★ 全部**副本制**（子进程脚本只在副本里被替换，真树零污染）；★ 我上一轮那条真实缺陷断言（ENOENT）保持，**未削弱**。

## 6. ★ 当天副本制反例（target-addressed，两个变异各自独立副本）

```
M1 (gap A) MUTATION LANDED=✓   exit=1 (red ✓) === 14 passed, 2 failed ===
  FAIL ★★ GAP A: … still yields exactly ONE 诊断 line …
  FAIL ★ and the silent case names its state as VALUES (status=… signal=…) []
  ★ 目标断言红=YES ✓   ★ STALE 断言仍绿=YES ✓
M2 (gap B) MUTATION LANDED=✓   exit=1 (red ✓) === 14 passed, 2 failed ===
  FAIL ★★ GAP B: a `FATAL ERROR:` fatal signature is picked up …
  FAIL ★ and the reported diagnostic is NOT a bare native address frame ["诊断: 15: 00000243800D9F9A"]
  ★ 目标断言红=YES ✓   ★ STALE 断言仍绿=YES ✓
REAL TREE UNTOUCHED: 13e4d7ba90dcc454 -> 13e4d7ba90dcc454 OK (read-only ✓)
```
★ **M2 的 FAIL 详情里逐字复现了复核者的裸地址帧**（`诊断: 15: 00000243800D9F9A`）⇒ 反例**打在了真实缺陷的形态上**；★ **两个变异下 STALE 断言都保持绿** ⇒ 修复是**扩大覆盖**而非改判据。

## 7. ★ STALE 路径为何仍逐字节不变（第 5 项）

1. **谓词回退等价**：STALE 子进程输出里**没有** `FATAL ERROR:`／`Assertion`／`^\s*Error:` 行 ⇒ 三个分支全部落空 ⇒ 走 **`detailLines.slice(-1)[0]`**（＝旧规则）。
2. ★ **不许 `.trim()`**：我 R11 第一版在选中行上加了 `.trim()` ⇒ **剥掉末行的前导空格** ⇒ STALE 断言立刻红（**我自己踩的**，已修）⇒ 现在**逐字保留该行**。
3. **`诊断:` 行只在有 `detail` 时打印**，且打印格式与旧版**完全一致**（沉默分支才多出 `status/signal`）。
⇒ **实测**：`b1prime-staleness-report` **16/0**（STALE 断言 #2 在列）；★ **未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。

## 8. 状态 / 没核

- **跑了/核了**：16/0（含两组新臂）；两个变异各自 14/2 且红在目标断言、STALE 断言仍绿；真树 hash 前后一致；C3 5/0。
- ★ **没核**：**POSIX 信号语义**（本机 Windows 测不到；`signal` 恒 null ⇒ 只有"值表达"到位，未覆盖真信号）；`b1prime-staleness-report` 的"改前从别处失败"形态（按你要求不补不猜）；`audit-package-membership` 仍未独立复跑。
- ★ **纪律 33**（新增模块/载体 ⇒ 跑完整派生检查）：本轮**未新增模块/载体**（只改一个已有脚本＋一个已有测试）⇒ 不触发；★ **我未跑门禁**（本轮不跑；若下一轮跑，会先提醒你 `git add`）。
- **仓内改动**：`scripts/generate-wiring-index.mjs`（谓词＋形状）＋ `tests/b1prime-staleness-report.test.mjs`（＋5 断言）＋本报告；**无半截状态**。
