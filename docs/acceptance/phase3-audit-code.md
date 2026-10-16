# Phase 3a · 代码审计（`task-194`）—— `vibe-math-vmu/**`

> **范围与绑定**：`HEAD 60b5d42`（开跑时 `git status` 空）；**177 个 `js/mjs` 文件、57,181 行**（含 `kernel/**`、`settings/**`、`host*.js`、`tools/**`、`extensions/**`、`packs/**`）。
> **方法**：★ **机械扫描全部 177 个文件**（去注释/字符串后按大括号配对；多行感知的 import 解析；参数使用检测）＋ ★ **凡候选都读源码逐条核实**（**下面每条都给出 `file:line` 与读数/命令**）。★ **读过的**与**推断的**分开标注；★ **"没核"另列**（§3）。
> **纪律**：本轮**只写本文件**；演示脚本在 `D:\_tmp\t194`；未跑 T1／全量门禁；未碰 `token.txt`。

## 1. 按严重度排序的缺陷

| # | 严重度 | file:line | 错在哪（读过） | 证据 / 复现 | 一句修法 |
|---|---|---|---|---|---|
| **1** | ★★★ **高** | `vibe-math-vmu.js:845-848`（配合 `:812-813`／`:822`） | **入口的提示词段路径把【三种宿主状态】判成同一条读数**：`else if (!promptSectionState.code)` ⇒ `what:'systemPrompt.section'`、reason `'the host exposes no systemPrompt.section() to receive N declared section(s)'`。★ 而 **R21 的三态拆分只落到了投递模块**（`kernel/reportfeedbackdelivery.js:120-136`），入口这一处**没有跟上** ⇒ **"宿主根本没提供该服务"被写成"服务在、只是没有 `.section()`"** | 我构造四种 ctx 并读 `h.status().promptSection`：<br>A（`ctx.get`→`undefined`）＝`{"registered":false,"what":"systemPrompt.section","reason":"…exposes no systemPrompt.section()…"}`<br>B（无 `ctx.get`、且无 `systemPrompt` 属性）＝**与 A 逐字相同**<br>C（提供了服务但**无** `.section()`）＝**与 A 逐字相同**<br>S（有 `.section()`）＝`{"registered":true,"code":null,"reason":null}`<br>★ `A≡B≡C`、S 不同 ⇒ **三态塌成一** | 照 `reportfeedbackdelivery.js` 的拆分把 `!host`（未提供／未 active）与"有服务但无 `.section()`"分成两条具名 reason；★ 并且 `:820` 那句"NOT reachable (not injected?)"现在只走 `catch` 分支 ⇒ 采纳 `ctx.get` 后它**更难到达**，需一并重写 |
| **2** | ★★★ **高** | `tools/clockguard.js:15` ＋ `:17`（对 `kernel/clockguard.js:170`／`:190`） | **工具把参数名传错两处**：`:15` 传 `{ value }` 给 `observe({ at = null })`；`:17` 传 `{ value }` 给 `monotonic({ from, to })`。★ 后者使 **`monotonic` 动作永远不可能成功**（工具的 schema `:9` **只声明 `value`**，没有 `from`/`to`） | 直接调内核服务（读两侧源码后复现）：<br>`cg.observe({value:5})` ⇒ `{"guarded":true,"value":null,…}`（**输入被丢**，回执里的 `value` 其实是 `state.last`）<br>`cg.monotonic({value:5})` ⇒ `{"ok":false,"monotonic":false,"reason":"non-finite input"}`<br>`cg.monotonic({from:1,to:2})` ⇒ `{"ok":true,"monotonic":true,"from":1,"to":2,…}` | 工具补 `from`/`to` 两个参数并按其名传；`observe` 的输入要么接上（用 `at`）要么从 schema 里去掉 |
| **3** | ★★ **中** | `kernel/report.js:131-142`（尤其 **`:135-138`** 与 **`:140-141`**）、`:167`；`kernel/index.js:907-909`、`:922`；`settings/schema.js:959-961` | **"Part A/Part B 未落地"的旧文字仍在**（本仓红线：**具名但不真**）：`:136` 逐字 `"…is not wired in this build YET; it lands in Part B."`；`:167`／`index.js:922` 的 reason 逐字 `"the delivery call is not wired in this build (A1 step 1 Part A): …"`；`index.js:908` `"the delivery call is Part B"`；`schema.js:961` `"…is Part B, and until it lands…"`。★ **Part B 已落地**（真机 `delivered:true`，见 `phase2-verify-round19/20`）⇒ 这些说法现在**不真**。★ **同一个注释块还自相矛盾**：`:140-141` 说"an armed switch **names the key that armed it**"（旧规则），而紧接的 `:158-161` 实现的是**不声称层名**（新规则，R21） | 逐字读取：`L135-138`、`L140-141`、`L158-161`、`L167`、`index.js:907-912/922`、`schema.js:959-961`；★ 可达性：`report.js:149-155` 自己写着"**Every ASSEMBLED instance passes a provider … so this path is never taken in a running kernel**"，且 R16/R21 用 marker 臂证明过入口 provider 恒在场 ⇒ 这两处 reason **只在裸构造下可见** | 把 `"not wired in this build"` 改成 `"no delivery provider was handed down (bare construction)"`；删掉"until it lands/Part B 未落"的从句；`:140-141` 与 `:158-161` 取其一（**注释不要留两套规则**） |
| **4** | ★★ **中** | `kernel/human.js:298`（配合 `:83`） | **`approvalDecision({ byRole })` 收下 `byRole` 却从不读它**；而 `attachApprovalGate:83` **正在算并下发**它：`byRole: typeof byRoleOf === 'function' ? byRoleOf(name, args) : null` ⇒ `:85 gate(req)`。★ 结果是"**按角色审批**"这个信号**被静默丢弃**（调用方以为门槛按角色判定，实际不） | 参数使用扫描：`byRole` 在 `approvalDecision` 体内出现 **0 次**（我逐行读 `:298-340` 均未见）；`kernel/human.js:83` 逐字构造 `req.byRole` | 二选一：**接上**（按 `byRole` 限制谁能批）或**两侧一并删**（含 `byRoleOf` 参数与调用点），**不要保留"收下即忽略"** |
| **5** | ★ **中低** | `kernel/funding.js:196`／`:220`／`:237` | 三个面都收下 `fired = []` 而**从不使用**；回执/拒绝里用的是**硬编码数组**（如 `:216 receipt(…, ['vmu.funds.allocationRemainderPolicy'])`、`:326`／`:339` `fired: []`）⇒ ★ 与**本仓通例**不一致（别处是本地 `fired` 累积后合并），调用方若传 `fired` 会被**静默丢掉** | 参数扫描（3 处）＋读 `:196-217`／`:220-234`／`:237-245`；★ 我也扫了调用点：**当前没有调用方传 `fired`** ⇒ **影响低**（但"收下即忽略"仍是缺陷） | 用 `enf.concat(fired)`／把硬编码数组换成合并；或删掉该参数 |
| **6** | ★ **低** | `kernel/clockguard.js:169-170` | `observe({ at = null })` 的 `at` **从不使用**（注释还写"只观察、不改状态"⇒ 参数更无意义） | 逐行读 `:169-182`；★ 与 #2 同源（工具传的是 `value`） | 与 #2 一并处理：描述清楚它到底收什么 |

★ **编号 1、2 两条我都给了可复现读数**；3 是**逐字文字 vs 事实**；4、5、6 是**参数收下即忽略**（机械可得 + 已读源码确认）。

## 2. 查过且干净的（覆盖说明）
| 项 | 覆盖量 | 读数 |
|---|---|---|
| **`kernel/report.js` 零 import 不变量** | 该文件 | `^\s*import` 行数 = **0** ✓ |
| **单文件 ≤1200（门口径 `split('\n')`，严格大于才红）** | **177 个文件全扫** | 超过 1200 的只有 **3** 个：`kernel/index.js` **2339**／`settings/schema.js` **1752**／`math-computation.js` **1482** ⇒ ★ 与 `tests/audit-code-size.test.mjs` 的 **`KNOWN` 三条逐条相同** ⇒ **backlog 之外没有任何文件越界** ✓ |
| **静态相对 import 的路径与具名一致性** | **177 个文件的全部 `import ... from './...'`** | **悬空引用 = 0**（路径全部存在；每个具名导入在目标文件里都存在）✓ |
| **空 catch（吞错）** | 全部 `catch` 块（大括号配对） | **裸 `catch {}` = 0**；**注释型 catch = 140**，**每一条都带具名理由**（如 `/* a cleanup must never throw */`、`/* stderr may be gone */`、`/* 记录不改结果 */`）⇒ 与本仓"具名降级而非静默"的口径一致 ✓（★ 这不等于"没有吞错"，而是"**没有无理由的吞错**"） |
| **死分支（字面量）** | 全部文件 | 无 `if (false)`／`if (true)`；无"裸 `return` 之后同缩进语句"候选 ✓ |
| **pack 键"值层 ＋ manifest 双声明"** | 4 个 pack | `v5r`：值层 **43** 键／manifest 字面量 **0**；`institute-min`／`v3-core`：值层 **0**／manifest **6**；`example-data`：**0／0** ⇒ ★ **交集全为空** ✓（★ 方法限制见 §3-6） |
| **`i <= arr.length` 越界** | 3 处（`kernel/registry.js:42-44`） | 是 **Levenshtein DP**（`dp[0][j]`／`dp[i][0]` 表宽 +1）⇒ **正确** ✓（读源码确认） |
| **宽松 `==`** | 21 处候选 | 全部是 `x == null ? …` 空值判定或**字符串模板里的 Python 代码**（`mathadapters.js:242/261`）⇒ **未见数值类宽松比较缺陷** ✓（抽样读） |
| **`.slice(0, <变量>)`** | 多处 | 变量都是**配置上限**（`cap`／`c.runoffTopN`／`config`）⇒ 未见 off-by-one（★ 未做系统性边界测试，见 §3） |

## 3. 没核（与"核了"分开写）
1. ★ **没有通读 57,181 行**：本轮＝**全量机械扫描 + 对每条候选的定点精读**；**业务语义**（90 多个面各自的算法正确性）**未做**逐面审读。
2. ★ **动态导入（`await import('...')`）的目标存在性**与**"导出但无人导入"的死导出** —— **未扫**。
3. ★ **数值/边界**：只扫了 `parseInt` 无基数、`.slice(0, 变量)`、`i <= len` 三类模式；**没有**做属性测试/边界值枚举 ⇒ "未见缺陷"≠"不存在"。
4. ★ **状态/时序类**：我**特意**核过一处（`status()` 的 `reportFeedback` 是装配期快照、运行期 `vibe_vmu_set` 后不变）——★ 结论是**不是缺陷**（该键的 `appliesAt` 语义已写明"next turn"）；**其余**"算一次当实时读"的怀疑**未做系统排查**。
5. ★ **`vibe-math-vmu/docs/**` 的散文断言**（卷内文字与代码是否一致）**未核**（本轮按"代码审计"做；docs 另有审计门）。
6. ★ **pack 不变量的方法限制**：我只比对**带引号的 `vmu.*` 字面量**；若某个 manifest 用**计算/拼接**的键名声明 settings，本扫描**抓不到**。
7. ★ **`extensions/**` 只参与了机械扫描**（1 文件），**未精读**。
