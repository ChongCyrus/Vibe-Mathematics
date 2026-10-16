# Phase 2 · verify2 · Round 12 —— 独立复核【A1 Part A】＋ R11 崩溃谓词修复

> 纪律：**只读复核**（真树只新增本报告）；探针/夹具一律在 `D:\_tmp\p2r12`（**副本制**）；★ **引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` **写**／git 写。
> **★ 两个绑定（本轮在飞，必须分开说）**
> **绑定 A（我实际验证的修订）＝ `fcc84f8`**：`vibe-math-vmu/settings/schema.js` **`8303E41B9CAFE875`（1752L）**／`kernel/report.js` **`7C69F5CBC4A6597E`（621L）**／`kernel/index.js` **`E88DF2194E0ECFCC`（2327L）**／`kernel/reportfeedback.js` `2184859F24AC6BED`／`scripts/generate-wiring-index.mjs` **`13E4D7BA90DCC454`（399L）**／`tests/vmu-assistant-report.test.mjs` **`222981DC6ED31287`（401L）**／`tests/b1prime-staleness-report.test.mjs` **`FBBAEF0AD5015DC3`（135L）**。
> **绑定 B（报告时刻的在飞工作树，★ 不是裁定）**：`HEAD` 已前进到 **`7cbf4d9`**（其改动＝**`report.js` 的注释**：`git diff fcc84f8 -- report.js` ⇒ **10 行改动、其中非注释行 = 0**）＋ **已暂存** `M vibe-math-vmu/kernel/index.js`（**Part B 在飞**）＋ `M 17-objective-status.md`／`A phase2-accept-round12.md`。★ **我对 `index.js`/`report.js` 的行为读数属于绑定 A**；绑定 B 上我**重跑了两条探针**（见 §9），**只当"暂无回归"的即时读数，不作任何修订的裁定**。

## 0. 结论速览
| 项 | 判定 | 关键读数（绑定 A） |
|---|---|---|
| **1 两个键** | ✅ | diff **只 +5 行**（3 行注释＋2 行定义）：`vmu.report.feedback` `type:'boolean', def:false`；`vmu.report.audience` `type:'string', def:''`；两者 `hot:HOT.H1, who:'office'`、**`doc` 非空**；★ **没有任何 pack 翻默认**（`packs/**` 里两键 **0 命中**、也没有 `report:` 设置块） |
| **2 真读取** | ✅ **端到端证明**（不是只读源码） | `report.js:120/:121` 两处 `sget`；★ 我的真入口探针：`feedback:true` ⇒ 回执 `enabled:true`、`source:"settings:vmu.report.feedback"`、`audience:"m1"` ⇒ **值随设置变 ⇒ 真的被读** |
| **3 回执 9 键在 `status()`** | ✅ | `L573 const status = () => {` 的返回对象里有 `reportFeedback: feedbackReceipt(c)`；★ 我的探针**就是从 `kernel.report.status()` 取到它的**（不是 `declarations()`） |
| **4 注入 vs 导入** | ✅ 四项全过 | (a) `report.js` **import 行数 = 0**；(b) `tests/vmu-assistant-report.test.mjs` **93 passed / 0 failed, exit=0**；(c) 装配点 `kernel/index.js:913` 提供 provider；(d) ★ **副本反例**：把回退分支改成 `throw` ⇒ 真入口**照常返回回执**（**回退未执行**）；★ 再把注入去掉 ⇒ **回退真的执行**（它是真实的第二处形状） |
| **4+ 两处形状是否一致** | ✅ **今天 9/9 一致**（附具名残余） | **同一 entry 配置**下：provider 回执 ＝ 回退回执 **9/9 字段相同**（含 `reason` 那句）；★ 但两处是**手工镜像**（注释自己写明"若契约变，改 `reportfeedback.js` 再镜像到此处"）⇒ **我没有找到把两者钉在一起的断言**（§4 末） |
| **5 值的正确性（真入口，我自己的探针）** | ✅ | **关**：`enabled:false`／`source:"default"`／`audience:null`；**开**：`enabled:true`／`source:"settings:vmu.report.feedback"`／`audience:"m1"`；两态都 `delivered:false`／`registered:false`／`code:"VMU_EXTERNAL_UNAVAILABLE"`／`what:"systemPrompt.context"`／`stack:null`；★ `reason` ＝ **"the delivery call is not wired in this build (A1 step 1 Part A)…"** ⇒ **是那句真话**，**不是**"宿主没有该能力"（与 C1/R5 的读数一致） |
| **6 两态同形** | ✅ | 两态 **9 键、集合与顺序完全相同**；状态**用值表达**（`enabled`/`source`/`audience`） |
| **7 派生检查** | ✅ 当前读数 | `regen-all --check` **15/15 in sync, exit=0**；`audit-package-membership` **29 passed / 0 failed, exit=0**（新键**不触发**登记义务） |
| **R11 谓词修复** | ✅ 三类缺口都有读数 | 我 R10 的三条夹具重跑：**零输出** ⇒ `（子进程无输出）status=1 signal=null`（**恰好 1 行** `诊断:`）；**多 `Error:`** ⇒ 取**最后**那条（`Error: ENOENT …`，采纳了我 R10 的裁定）；**`FATAL ERROR:`** ⇒ 取到 `FATAL ERROR: Reached heap limit Allocation failed - …`；★ **STALE 路径逐字节不变**（pre/post stderr 同 sha `F160BA148B34D6BA`，**行首空格保留**）；套件 **16 passed / 0 failed, exit=0**（原 11） |

## 1. ① 两个键（schema）
```
diff fcc84f8^..fcc84f8 -- vibe-math-vmu/settings/schema.js   ⇒ 只 +5 行
+  // ★ A1 step 1 · Part A: … ★ The framework adds the switch; it does NOT flip any pack's default. …
+  { key: 'vmu.report.feedback', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '汇报反馈回路开关（A1 第一步）：默认 false＝零机制；开＝…（投递调用属 Part B —— 未接线期间回执以真话具名）' },
+  { key: 'vmu.report.audience', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '汇报的受众（谁应当收到）：默认空串；开关开而受众为空时具名失败，不静默' },
```
★ **默认值/类型/`doc` 非空** 全部核对 ✓（doc 全文见上）。
★ **"没有任何 pack 默认被翻"**：我在 `vibe-math-vmu/packs/**` 上搜 `report.feedback|report.audience`（含**嵌套** `report:` 块的搜法）⇒ **两键 0 命中**，且 packs 里**没有**任何 `report:` 设置块；唯一命中是 `v5r-blocks-b.js:89` 一行**无关**注释（"THE WORK-FEEDBACK LINE"）⇒ ✅ 成立。

## 2. ② 真读取（不是"只在表里登记"）
源码：`kernel/report.js:120 feedback: sget('vmu.report.feedback') === true`、`:121 audience: (() => { const v = sget('vmu.report.audience'); return typeof v === 'string' ? v : '' })()`（都在 `cfg()` 的字段里）。
★ **端到端证据（我自己的探针，不是源码转述）**：真入口分别用 **无覆盖** 与 **`{'vmu.report.feedback':true, 'vmu.report.audience':'m1'}`** 装配 ⇒ 回执从 `enabled:false/source:"default"/audience:null` 变为 `enabled:true/source:"settings:vmu.report.feedback"/audience:"m1"` ⇒ **读取真的发生了**（登记值本身不会让回执变）✓。

## 3. ③ 回执落在 `status()`（不是 `declarations()`）
- 源码：`L573 const status = () => {` ⇒ `return { … }`（`:582` 起）里 **`:602 reportFeedback: feedbackReceipt(c)`**；文件末 `L621 return { apiVersion, declarations, status, tick, emit, …}` ⇒ ★ **它在 `status` 对象里、不在 `declarations` 里** ✓。
- ★ 运行时复核：我的探针**只能**从 **`kernel.report.status()`** 取到它（`declarations()` 里没有）✓ ⇒ 与你自陈的"第一版放错函数、没有任何套件报红、由 real-entry 探针发现"一致：**这类错位只有真入口能抓**（我给这条现场作证）。

## 4. ④ 注入 vs 导入（本轮最重要）
| 子项 | 我的读数 |
|---|---|
| **(a) import 数** | `kernel/report.js` 里 `^\s*import\b` 的行数 ＝ **0** ✓ |
| **(b) 不变量断言** | `node tests/vmu-assistant-report.test.mjs` ⇒ **`=== VMU ASSISTANT REPORT: 93 passed, 0 failed ===`，exit=0** ✓（那条"多一个 import 就红"的不变量仍绿） |
| **(c) 装配点确实提供 provider** | `kernel/index.js:913 feedback: typeof reportFeedback === 'function' ? reportFeedback : (c) => reportFeedbackFailure({…})`（`:907-912` 的注释逐字写明"`delivered:false` 带一个**真的**理由：投递属 Part B，而'宿主不暴露它'会是**假的**——该 API 已从宿主源码读出并核实"）✓ |
| **(d) 回退分支是否被执行** | ★ **副本反例（我自己造）**：把回退的 `return Object.freeze({…})` 之前插 `throw` ⇒ **真入口照常拿到回执**（`code=VMU_EXTERNAL_UNAVAILABLE`, `enabled=true`）⇒ **回退未被执行**；**对照臂**：同时**去掉注入** ⇒ 真入口**抛出 `★ FALLBACK EXECUTED (no provider)`** ⇒ 回退**是**真实的、可达的第二处形状（只有在"没人注入"时才走）⇒ ★ **你的 (d) 主张成立**：回退是**唯一**一处把形状写两遍的地方，且**每个真实实例都走 provider** ✓ |
| **(d+) 两处形状今天是否一致** | ★ 我做了**同一 entry 配置**的 A/B 对比（A＝真树走 provider／B＝副本去掉注入走回退）⇒ **9/9 字段逐字相同**（含 `reason` 那句）✓ |

★ **具名残余（我发现的、不改变上述判定）**：这两处形状是**手工镜像**（`report.js` 的注释自己写着"若契约变，改 `kernel/reportfeedback.js` 再镜像到此处"），而我在 `tests/*.mjs` 上**没有找到**把"provider 回执 ≡ 回退回执"钉在一起的断言 ⇒ 今天一致、**将来可能静默漂移**（尤其 `reason` 那句字符串写在**两个文件**里）。★ **建议（你裁，我未改）**：加一条断言（同一 `c` ⇒ 两种构造的 9 键逐字段相等），把"镜像"从**人工义务**变成**可检查的不变量**——这与本仓"不变量要能被门禁检查"的一贯口径一致。

## 5. ⑤ 值的正确性（真入口，**我自己的探针**，两份读数逐字）
```
OFF (no override)                     ON (feedback:true, audience:m1)
  keys (9)  = enabled, source, audience, delivered, registered, code, what, reason, stack   ← 两态相同
  enabled   = false                     enabled   = true
  source    = "default"                 source    = "settings:vmu.report.feedback"
  audience  = null                      audience  = "m1"
  delivered = false                     delivered = false
  registered= false                     registered= false
  code      = "VMU_EXTERNAL_UNAVAILABLE"  code    = "VMU_EXTERNAL_UNAVAILABLE"
  what      = "systemPrompt.context"      what    = "systemPrompt.context"
  reason    = "the delivery call is not wired in this build (A1 step 1 Part A): the settings keys are read and
               reported, the systemPrompt.context() call lands in Part B"      ← 两态同一句
  stack     = null                        stack   = null
```
⇒ ★ **`reason` 是那句真话**、**没有**退化成"宿主没有该能力" ✓（与该 API **确实存在**的 C1/R5 读数一致）；★ 两态 **9 键恒在**、**状态用值表达** ✓（§0 第 6 项）。

### ⑥ 两态同形（逐条对着第 6 项答）
- **9 键集合**：两态**完全相同**（`enabled, source, audience, delivered, registered, code, what, reason, stack`，顺序也相同）—— 见 §5 的两份逐字读数。
- **状态用值表达**：两态的差别**只体现在值**上（`enabled` `false→true`、`source` `"default"→"settings:vmu.report.feedback"`、`audience` `null→"m1"`），**没有任何键在某态缺席**。
- ★ **没有"有条件的键"**：我在两态各数一遍 ⇒ **都是 9 个**（不是"关态 8 个、开态 9 个"那种形状变化）✓。

## 6. R11 崩溃谓词修复（`scripts/generate-wiring-index.mjs`）
**绑定**：`fcc84f8^` ＝ **`2B6A04CE241EF737`**（★ **正是我 R10 复核时的 blob**）⇒ `fcc84f8` ＝ **`13E4D7BA90DCC454`** ⇒ **R11 只动这一处**（+30/−5 净），我 R10 的绑定可**逐字节接上** ✓。
**新谓词（逐字）**：`const fatal = detailLines.find((l) => /^\s*(FATAL ERROR|Assertion)/.test(l))` ／ `const errors = detailLines.filter((l) => /^\s*Error:/.test(l))` ／ `const detail = fatal || errors.slice(-1)[0] || detailLines.slice(-1)[0] || ''`；★ 沉默情形在 `:347` 具名：`诊断: （子进程无输出）status=… signal=…`。
**我 R10 的三条夹具在新谓词下的读数**：
| R10 夹具 | R11 前的读数（我 R10 量） | R11 后（本轮） | 判定 |
|---|---|---|---|
| **GAP A 零输出**（stub `exit 1`，无输出） | **没有 `诊断:` 行** | **恰好 1 行**：`诊断: （子进程无输出）status=1 signal=null`，父 exit=2 | ★ **已修**（字段集合不再随失败形态变，且**具名值**） |
| **多 `Error:`**（`upstream connection refused` → `ENOENT`） | 取**第一条**（连接被拒） | 取**最后**一条：`Error: ENOENT: no such file or directory, open 'X'` | ★ **已改**（采纳我 R10 的裁定：根因在后） |
| **GAP B `FATAL ERROR:`**（stub 打 fatal 横幅＋帧，exit 134） | 取**裸地址帧** | `诊断: FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` | ★ **已修** |
| ★ **我 R10 的第二例：`process.abort()` 原生转储** | 裸帧 | ★ **仍是裸帧**：`诊断: 2: run (node:internal/modules/esm/module_job:561:25)` | ★ **未覆盖**——但**该输入是构造性的**（真生成器不走 `abort()`；OOM 才是真实路径，已修）⇒ **记为边界读数，不作为缺陷主张** |
**★ STALE 路径逐字节不变（我是 R10 那条主张的裁定者）**：同一个 stale 夹具（`headerIdx` 0-based 258／真表体首行 260）在 **pre-R11** 与 **post-R11** 上：
```
PRE  exit=2  诊断: "    诊断:   run: node scripts/generate-vmu-settings-table.mjs --write"
POST exit=2  诊断: "    诊断:   run: node scripts/generate-vmu-settings-table.mjs --write"
★ 诊断: 行逐字节相同 = true      ★ 整条 stderr 逐字节相同 = true（两侧同 sha F160BA148B34D6BA）
★ 行首空格保留（.trim() 踩坑已避开）: "    诊断:   run: …" 前两格空格在 = true
```
⇒ ★ 三点同时成立：**STALE 输出未动**、**逐字保留**、★ 且那个 sha `F160BA148B34D6BA` **与我 R8 量到的相同** ⇒ 这条路径跨 R7→R8→R11 **一直没动** ✓。
**套件**：`tests/b1prime-staleness-report.test.mjs` ⇒ **`16 passed, 0 failed`，exit=0**（R8 时 11 ⇒ R11 新增 5 条：GAP A 的两条、GAP B、及其前置）。

## 7. ⑦ 派生检查（当前读数）
`node scripts/regen-all.mjs --check` ⇒ **`vmu regen-all: 15/15 in sync`，exit=0** ✓（本项改 schema ⇒ 生成表／`docs/00` 就绪数字／载体表／矩阵都在其中，**当前不陈旧**）；`node tests/audit-package-membership.mjs` ⇒ **`29 passed, 0 failed`，exit=0** ✓（两个新键**不触发**登记义务）。

## 8. ★ 在飞说明（绑定 B 的即时读数，**不是裁定**）
报告时刻：`HEAD 7cbf4d9`（**只改 `report.js` 的注释**：`git diff fcc84f8 -- report.js` ⇒ 10 行改动、**非注释行 = 0** ⇒ 我可据此把绑定 A 的行为读数**延续**到该注释修订）＋ **已暂存 `M kernel/index.js`**（**Part B 在飞**：`E88DF2194E0ECFCC → 40291AA226AB9590`）＋ `report.js` `7C69F5CBC4A6597E → 8B242E283EF7A74F`。
★ 我在这份在飞字节上**重跑了两条探针**（**仅记"暂无回归"**）：真入口 OFF/ON 的 9 键与取值**与绑定 A 相同**（`enabled:false/"default"` vs `enabled:true/"settings:vmu.report.feedback"/"m1"`）；两处形状仍 **9/9 一致**。★ **但这不是对任何修订的裁定** —— Part B 提交后需**重跑**才算。

## 9. 我自己的三处仪器失误（具名）
1. ★ `git show fcc84f8 --unified=3 -- <path>`：我把整串当成**一个参数**传给 `execFileSync` ⇒ git 报 "ambiguous argument"；改用 `git diff <rev>^ <rev> -- <path>` 后拿到 diff ✓。
2. ★ `node -e` 的引号两次把脚本打坏（`\"` 转义、`Substring` 越界）⇒ ★ **按我自己的老规矩改用脚本文件**（`D:\_tmp\p2r12\*.mjs`）✓。
3. ★★ **一次被我作废的对比**：我第一版"两处形状是否一致"的探针，拿**没有设置**的回退回执去比**我手搓的、输入不同**的 provider 调用 ⇒ 打印出 4 处 `same=false` ⇒ ★ **那是我比较对象选错，零信息**；已重做为**同一 entry 配置**的 A/B（真树 provider vs 去掉注入的回退）⇒ **9/9 相同**。（与 R8/R9/R10 同族：**先确认比的是哪两份东西**。）

## 10. 没核 / 未做（与"核了"分开写）
1. **没核**：**Part B**（`systemPrompt.context()` 投递本体）—— 未落地，我**未核**其任何行为；绑定 B 的即时读数**不作裁定**。
2. **未做**：`regen-all` **写**／全量 sweep／任何 git 写（归 Lead）；仓内代码/测试**零改动**（本轮只新增本报告）。
3. **没核**：`process.abort()` 之外的其它原生致命路径（如段错误）—— 我只构造了 `abort()` 与 OOM 两种；★ 且 `abort()` 是**构造性输入**，真生成器不走。
4. **未核**：`vmu.report.audience` 的"开关开而受众为空 ⇒ 具名失败"那一支（Part B 才落）—— 我**没有**构造（当前回执对空受众仍只是 `audience:null`）。
5. **未核**：报告时刻在飞的 `phase2-accept-round12.md` / `M 17-objective-status.md` 的**内容**（只看到状态）。
