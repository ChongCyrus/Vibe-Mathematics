# Phase 2 · verify2 · Round 15 —— 独立复核【Part B 入口块】★ 并发现一处**使该功能整体失效的回归**

> 纪律：**只读复核**（真树只新增本报告）；探针一律在 `D:\_tmp\p2r15`（**副本制**）；★ **引用前先落一行核验**、**每个读数绑 blob**、**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写。
> **被测版本（我自己核的 blob）**：`HEAD 2b3fefe`；`vibe-math-vmu/kernel/reportfeedbackdelivery.js` **`13EE919DE67428CC`（96L）**；`vibe-math-vmu/vibe-math-vmu.js` **`591766CAC82CAE83`（1197L）**；`kernel/report.js` **`8B242E283EF7A74F`（623L）**；`kernel/index.js` **`40291AA226AB9590`（2335L）**；`tests/b1prime-reportfeedback-shape-pin.test.mjs` **`F50CBDF1316ACD0C`（80L）**；`scripts/generate-zero-mechanism-matrix.mjs` **`FF232AD273B6F4DD`（456L）**；`package.json` **`0E5A272D4C6F5B8B`（788L）**；`installer.js` **`F98A1F04B2100A2D`（811L）**。
> ★ **在飞**：`vmu-assistant2` 跑真机（**不动仓**）⇒ 我的每个读数都绑上面的 blob；报告时刻 `git status` **空**。

## 0. 结论速览
| 项 | 判定 | 关键读数 |
|---|---|---|
| **★★ 主发现：Part B 使开关无法打开** | ★★ **回归（实测＋局部化到一行）** | 同一探针、同一配置、同一 packs：**`7cbf4d9`（Part B 前）⇒ `enabled:true, source:"settings:vmu.report.feedback", audience:"m1"`**；**`2b3fefe`（现在）⇒ `enabled:false, source:"default", audience:null`** ⇒ ★ **`context()` 一次都不调用 ⇒ 投递永不发生；四种结局里只有"关"那支可达** |
| 1 新模块四结局 | ✅ 模块级**全部构造出来**（§2） | 关 ⇒ `code:null`（**不编造失败**，无 stderr）／开＋空受众 ⇒ `what:'report.audience'`／宿主不可达或无 `.context` ⇒ `what:'systemPrompt.context'` ＋ **stderr**／否则 ⇒ `delivered:true, registered:true` |
| 2 "投递文本不是策略" | ✅ 成立（§3） | 文本 ＝ `[vmu report feedback] audience: m1 · reports declared: 3 · recorded: 7 · delivered: 2 · this is a delivery notice, not an instruction.` ⇒ ★ **无任何祈使/指令性语句**（把该 notice 子句排除后，匹配列表 0 命中）；★ **计数是活值**（用真面状态得 3/7/2，不是恒 0） |
| 3 入口块在 `:797` 的 `if` 之外 | ✅ **源码判定** | `if (effectivePrompts.length > 0) {` 起于 **L806**、**闭于 L842**；投递调用在 **L853-854** ⇒ **在外**；模块**自己** try/catch 取 `ctx.systemPrompt`（`:60`）、**自己**查 `.context`（`:68`），而**:815 只测 `.section`** ✓；`effect(...)` 包装 ✓（`:87`）。★ **行为验证（packs:[]）本轮无法做**：开关打不开（见主发现）⇒ 投递根本不执行 |
| 4 `report.js` 零 import 不变量 | ✅ | `^\s*import` 行数 **0**；`tests/vmu-assistant-report.test.mjs` ⇒ **93 passed / 0 failed, exit=0** |
| 5 形状钉套件 | ✅ 6/0，且**同输入** | `tests/b1prime-reportfeedback-shape-pin.test.mjs` ⇒ **6 passed / 0 failed, exit=0**；`SHARED` 显式同输入（`:55-59`）＋ 键集合与顺序（`:61`）＋ **9 字段逐字相等**（`:64-67`）；★ 其自陈"**M2 未取得**"**属实**（其报告 §4 逐字写明，且明说"不把'仍返回 9 键'当作**直接**证明"）；★ **我 R12 的 ARM B 正好补上了那个 M2** |
| 6 两个错都修好了 | ✅（但另有一处**构造性**边界） | **(a)** `kernel.report` 缺失 ⇒ **apply+ready 不抛**（我副本里 `delete kernel.report` ⇒ `threw=null`）✓；★ 但****抛异常**的访问器**仍在 **`:725` 未受保护地读** `kernel.report` ⇒ 入口当场死（**构造性输入**，见 §7）；**(b)** 入口 **1197 ≤1200** ✓ ＋ `audit-code-size` **9/0** ✓ |
| 7 派生面 | ✅ | `regen-all --check` ⇒ **15/15 in sync, exit=0**；★ **双登记齐**：`package.json files[]` 含新模块（**703 项**）＋ `installer.js` 提及 ✓；`audit-package-membership` **29/0 exit=0**；矩阵 `--check` **exit=0**（**100 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 7 n/a**），两行齐（`reportfeedback` **已更新为"Part A＋Part B 都已落／投递已接线"**、`reportfeedbackdelivery` = `EXPECT_NA`） |
| 8 顺手 | ✅ | `host.js` **1167 ≤1200**；`tests/run-tests.mjs` **`B988AF9351E9219C` 未变** |

## 1. ★★ 主发现：Part B 把开关**永久钉在"关"**（回归，已局部化到**一行**）
**现象（同一探针体、同一配置、同一 packs ⇒ 只换修订）**
```
config.vmu = { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' }      （DOTTED 形态，R12 用的同一通道）
7cbf4d9 (Part B 前)  ⇒ {"enabled":true,  "source":"settings:vmu.report.feedback", "audience":"m1",  "calls":0}
2b3fefe (现在)       ⇒ {"enabled":false, "source":"default",                      "audience":null, "calls":0}
```
**局部化（两段读数）**
```
(a) 内核解析值（两份修订都）：kernel.status().settings.resolved['vmu.report.feedback'] = {value:true, via:'config'}
    ⇒ ★ 设置**确实带上来了**；差别只在【面】看到什么：
    7cbf4d9: face_enabled=true      2b3fefe: face_enabled=false
(b) 一行变异（现在的修订、副本里删掉这一行）：
      reportFeedback: () => Object.assign({}, reportFeedbackState),        ← Part B 加在 createKernel({…}) 选项里的那行
    ⇒ face_enabled = true（★ 恢复）
```
**机制（读码＋读数合起来讲，全部可核）**
- `kernel/index.js:277-288 export function createKernel({ … reportFeedback = null, … })` —— ★ 这个形参**不是**给入口放"阶段访问器"的位置：它的注释逐字写着"**THE REPORT-FEEDBACK PROVIDER, handed down by the ENTRY**"，即 `kernel/index.js:913` 用来交给 `createReport` 的**那个 provider**（正常值是 `reportFeedbackFailure(…)`）。
- 于是入口把**投递状态访问器**塞进了这个形参 ⇒ ① **provider 被顶掉**；② `report.js` 的 `feedbackReceipt(c)` 变成"**先问 provider**"，于是**面的回执 ＝ 投递状态**，而**投递状态又是从面的回执算出来的** ⇒ ★★ **闭环**：投递时读到的面回执是 `{}`（我补丁打的 `DIAG-IN status={}`）⇒ `enabled=false` ⇒ 走"关"支 ⇒ 返回 `{enabled:false, source:'default', …}` ⇒ 这个值**又成了面的回执** ⇒ 开关**永远打不开**。
- ★ 与 R12 的对照：R12（Part A）面回执是**由设置算出来的**（配置开 ⇒ `enabled:true`）；现在面回执是**访问器的输出**（`DIAG-OUT` 与面回执**逐字相同**，`{"enabled":false,…}`）—— 这正是闭环的指纹。
**后果（决定级）**：★ **四种结局里只有"关"那支在真实装配下可达**；②③④ 全套代码正确、单元可达，但**入口这条路走不到**（`calls = 0`）⇒ ★ **A1 第一步的"投递"在实际装配里不发生**，而**所有门禁都是绿的**（形状钉只钉形状；四结局只能单元驱动）。
**最小复现**：`apply(ctx, { packs:['v5r'], vmu:{'vmu.report.feedback':true,'vmu.report.audience':'m1'} })` ⇒ `kernel.report.status().reportFeedback.enabled === false`（`7cbf4d9` 上为 `true`）。
**修法方向（你裁，我未改）**：**不要**把投递状态访问器放在 `createKernel` 的 `reportFeedback` 形参上（改名，例如 `reportFeedbackStage`／`stages.reportFeedback`）；让 `reportFeedback` **仍然**只承载 `reportFeedbackFailure(…)` 这个 provider；并**加一条常驻断言**：*配置开 ⇒ 面的回执 `enabled:true` ⇒ 投递状态 `delivered:true` 且 `context()` 被调用过一次*（今天的套件**没有**这一条，所以这个回归全绿通过）。

## 2. ① 四结局（**全部构造出来**，模块级，显式依赖）
```
1) 关（status 无该标志）      ⇒ {enabled:false, source:'default', audience:null, delivered:false, registered:false, code:null,  what:null, reason:null, stack:null}   stderr=(none)
2) 开 + 受众为空              ⇒ {enabled:true,  code:'VMU_EXTERNAL_UNAVAILABLE', what:'report.audience', reason:'feedback is on but no audience is named'}            stderr=(none)
3) 开 + 有受众 + ctx 无 systemPrompt      ⇒ what:'systemPrompt.context', reason:'the host exposes no systemPrompt.context() …', stack=null   + ★ stderr 一行
3') 开 + 有受众 + **访问器抛异常**（cordis 未注入的形态）⇒ what:'systemPrompt.context', reason:'the host systemPrompt service is NOT reachable (not injected?)', **stack 非空** + ★ stderr 一行
4) 开 + 有受众 + 宿主接得住   ⇒ {delivered:true, registered:true, code:null, what:'systemPrompt.context'}   + ★ context({name:'vmu:report-feedback', order:5000, text:…})
```
⇒ ★ **"关"那支 `code` 确实是 `null`**（零机制、**不编造失败**）✓；②③④ 各自**具名**且**没有把"关"写成失败** ✓。★ 一处**观察**（非缺陷）：②（开而受众为空）**不写 stderr**（只有回执具名），而 ③/③′ 写 stderr ⇒ 同一层失败在 stderr 上的可见性不一致（该键的 `doc` 只承诺"具名失败，不静默"，回执已满足 ✓）。

## 3. ② "投递文本不是策略"（成立）
```
text = "[vmu report feedback] audience: m1 · reports declared: 3 · recorded: 7 · delivered: 2 · this is a delivery notice, not an instruction."
★ notice 子句存在 = true      ★ 祈使/指令性标记（排除该子句）= 0 命中      ★ 计数 = 活值（declared:3 / recorded:7 / delivered:2，不是恒 0）
```
⇒ 文本是**运行时快照**（受众＋三个计数）＋**明写不是指令** ✓；★ 我也核了模块读的三个字段在**真面状态**里**存在**（`status()` 的键含 `declared`／`trace`／`delivered`，`trace={kept:0,cap:64,dropped:0}`）⇒ **不会恒 0** ✓。

## 4. ③ 入口块的位置（源码判定；行为验证因主发现而**做不了**）
`L806 if (effectivePrompts.length > 0) {` … **L842 }**（闭）… **L853-854** 投递 ⇒ ★ **在外** ✓；`:815` 只测 `systemPrompt.section` ✓ 而模块自己测 `.context`（`:68`）✓；模块内 `effect(run, 'vmu:report-feedback')`（`:87`）✓。★ **行为对照（`packs:[]` 时仍投递）本轮无法完成**：开关打不开 ⇒ `calls=0` ⇒ 该对照**等主发现修复后**才有意义（**记为未做**）。

## 5. ④⑤⑥⑦⑧（逐条见 §0 表）
- ④：`report.js` import **0** ＋ `vmu-assistant-report` **93/0** ✓。
- ⑤：形状钉 **6/0**、**同输入**、并**如实自陈 M2 未取得** ✓（我 R12 的 ARM B 补上 M2：副本里给回退插 `throw` ＋去掉注入 ⇒ **抛** ⇒ 回退确实被执行）。
- ⑥(b)：入口 **1197 ≤1200** ＋ `audit-code-size` **9/0** ✓。★ 矩阵那一行写的"入口 1205→**1148**"是**抽取当时**的数（提交后的入口是 **1197**）⇒ 两者都 ≤1200 ✓；该行并未声称 1148 是当前值，**只作提示**。
- ⑦：`regen-all --check` **15/15**；**双登记**（`files[]` 703 含新模块 ＋ `installer.js`）；`audit-package-membership` **29/0**；矩阵 **100 modules / 7 n/a / 0 mismatches**，两行齐且 `reportfeedback` 行**已更新**（不再有"尚未接线"）✓。
- ⑧：`host.js` **1167**；`run-tests.mjs` blob **未变** ✓。

## 6. 我自己的四处仪器失误（具名；结论均已用修正量法重取）
1. **门禁循环跑空**：目标目录 `D:\_tmp\p2r15` 不存在 ⇒ 我第一版 5 个门**一个都没跑到**（且文件名写错一个：`audit-package-membership.test.mjs` vs 实际 `audit-package-membership.mjs`）⇒ 建目录后重跑，读数见 §0。
2. **读错面**：我以为投递状态在句柄 `h.reportFeedback` 上（实测 `undefined`）；它其实是 `createKernel` 选项里的**晚期绑定访问器** ⇒ 改用"补丁打日志"读取（`DIAG-OUT`）。
3. **ARM A 不成立（我自己造的）**：我在副本里 `delete kernel.report` 后跑去跑**入口套件** ⇒ 失败在**测试自己**的 `tests/vmu-entry.test.mjs:827`（`declaredHandle.kernel.report.tick`）⇒ **不是产品崩** ⇒ 我改成**窄臂**（只 `apply+ready`）⇒ `threw=null` ✓。
4. **标签串味**：我把"ctx 无 systemPrompt"（`!host` 支）与"访问器抛异常"（`accessFailed` 支）在第一次单元臂里混为一谈（两者 reason 不同）⇒ 已分开各测一条（§2 的 3 与 3′）。

## 7. 具名边界（构造性，**不作缺陷主张**）
- ★ `:725 if (switchedOff || reportTickAttached || !kernel.report) return` —— 该**读**本身**未受保护**：若 `kernel.report` 是**抛异常的访问器**（我在副本里这么构造），入口会在 `attachReportTick` 当场死（`Error: arm B: no report face`）。★ 但 `kernel` 是**我们自己的对象**，"访问器抛异常"是**构造性**输入；Lead 真实遇到的是**缺失**（`undefined`）⇒ 那种情况 `!kernel.report` 正确处理 ✓（§0 第 6 项）。**记为边界读数**，与 R10 的 `process.abort()` 同类。

## 8. 没核 / 未做（与"核了"分开写）
1. **没核**：投递在 **`packs:[]`** 下的行为（§4）—— 因主发现而**不可达**。
2. **没核**：**真机**（`vmu-assistant2` 本轮在飞）—— 我一个真机会话都没跑；★ 主发现是**进程内真入口**读数，**不是真机读数**。
3. **未做**：修法（§1 建议）与任何常驻断言（改代码/测试不在我范围）；`regen-all` **写**／全量 sweep＝**归 Lead**。
4. **未核**：`docs/acceptance/phase2-*round1[3-4]*` 中与本轮相关的**其它**陈述（我只读了 `phase2-comms-round14-shape-pin.md` 以核 M2 自陈与 `:55-67` 的同输入做法）。
