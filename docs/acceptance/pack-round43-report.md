# Round 43 · vmu-pack（`task-188`）交付报告 —— P-clean 判据**已固化成套件测试**

> 任务：`task-188`（把 R42 §6 具名的"未落一步"落下）。★ **只在 `tests/**` ＋ `package.json`（定点）** ✓；**未碰 `packs/**`**（v5r 含义一字未改）✓。
> 纪律：**当天副本制反例 ＋ target-addressed 自检** ✓；**真树只读**（md5 判据）✓；**不许自造公开码** ✓；**无半截状态** ✓。

---

## 0. 结论速览

| 项 | 结果 |
|---|---|
| **新测试** | ★ `tests/vmu-prompt-clean.test.mjs` ⇒ **`8 passed, 0 failed`** |
| **判据 ①（非空前提）** | ✅ **P-clean 臂确实注册 `vibe_vmu_report`**（否则"干净"是空的）＋ CONTROL 臂也有同一个工具 ⇒ 两臂**只在 P 上不同** |
| **判据 ②（注入层＝0）** | ✅ `sections === 0`／`text === ''`／命中 **0**；★ **读法是捕获 `systemPrompt.section(...)` 的入参并对【捕获文本】计数**（**不是** grep 源码） |
| **★ 反空过断言** | ✅ **`control.hits > 0 && clean.hits === 0`** —— ★ 同一个探测器在 CONTROL 上**会响**，所以"0"不是"两边都 0" |
| **★ clean ≠ degraded** | ✅ `promptSection={registered:false, code:null}` ⇒ **"没声明提示词" 不是 `VMU_EXTERNAL_UNAVAILABLE`** |
| **CONTROL 对照** | ✅ 记录读数：**16 工具／1 段／1453 字符／22 命中**（★ 见 §3 的 12 vs 22 说明） |
| **当天反例（副本制）** | ✅ **MUT 4/4 红（B1–B4）**；★ **target-addressed 自检全通过**（落点/哈希/唯一性）；**真树 md5 未变** |
| **登记** | ✅ `package.json` **定点**加 1 行；★ **`installer.js` 不适用**（测试不在 `PRESETS[].files`，R14 已核命中 0 次） |
| **`--check`** | ⚠️ ★ **预计 STALE（计数 +1）** ⇒ **报你 `--write`**（见 §6） |

---

## 1. 测试钉住的东西（8 条断言）

| 组 | 断言 | 非空前置 |
|---|---|---|
| **A** | A1 ★ **P-clean 臂注册了报告工具**（`clean.tools.length > 0 && includes('vibe_vmu_report')`）；A2 CONTROL 也有 ⇒ **两臂差异只在 P** | ★ A1 即全文件的前提 |
| **B** | B1 ★ **0 段／0 字符**（在**捕获文本**上量）；B2 ★★ **反空过**（`control.hits > 0 && clean.hits === 0`）；B3 没有汇报要求到达模型；B4 ★ **clean 不是 degraded**（`code:null`） | ★ B2 用 CONTROL 的 `> 0` 做前置 |
| **C** | C1 ★ CONTROL **确实注入了汇报提示词**（段数/字符/命中都 `> 0`）；C2 CONTROL 的工具面是 clean 的**超集** ⇒ 对照隔离的是**提示词**而非工具面 | ★ C1 自身即 `> 0` |

★ **数值 vs 结构**：★ **断言只钉结构**（`=== 0`、`> 0`、超集关系），**不硬编码 1453/22** —— 提示词内容变了那是**事实变了**，不该让门禁红。读数用 `[readings]` 行**打印**出来供人核（本次：clean **4 工具/0 段/0 字符/0 命中**；CONTROL **16/1/1453/22**）。

## 2. ★★ 两层分开写（照你要求，已写进**测试头注释**）

- **源码层**（`packs/*/prompts/*.js`，**8 个文件**）：同一词表命中 **≈430**；
- **注入层**（模型真正看到的、组装后的子集）：带 v5r **22**、不带 **0**。
⇒ ★ 注释里明确：**源码 grep 会【高估】模型可见量**；**源码 0 也不等于注入 0**（可能有别的注入路径）⇒ **判据取注入层**，**两层数字都报**。

## 3. ★ 一处必须说清的差异：R42 我报 12 命中，本测试报 **22**

**原因不是行为变了，是【词表】不同**：R42 探针的正则我写成 `/汇报|报告|进度|Progress/`（**注释里说有 `report`，正则里其实没有** ✗），而本测试**按你的判据把 `report` 算进去** ⇒ 多出 10 处匹配。
★ **两次都是"同一探测器、同一层（注入文本）"，只是项清单不同** ⇒ ★ **本测试因此只钉结构**（`> 0` / `=== 0`），**把确切数字当读数打印**。★ **我把自己 R42 探针的"注释与正则不一致"记下来**（与本会话"读数必须与事实同形"同一条：**注释说了不算，正则里有没有才算**）。

## 4. ★ 当天反例（副本制 ＋ target-addressed 自检）

`D:\_tmp\vmu-pack43\pclean-counterexample.mjs`：★ **变异不在产品代码里** —— 本判据讲的是**装配**，所以变异把 **v5r 塞回"clean"臂**（改的是**测试**的那一行）。

| 步 | 读数 |
|---|---|
| CONTROL（副本未变异） | **`8 passed, 0 failed`** EXIT=0 |
| **★ target-addressed 自检** | 目标行 **72**；改后该行**确实是** `const clean = await assemble({ settings: FACES, packs: ['v5r'] })` ⇒ **lands on target = true**；**flie hash changed = true**；**exactly one occurrence = true** |
| **MUTATED**（v5r 塞回 clean 臂） | ★ **`4 passed, 4 failed`**，★ **B1／B2／B3／B4 全红**；读数显示 clean 与 control **完全相同**（16 工具/1 段/1453 字符/22 命中）⇒ **不再干净** |
| CONTROL（副本复原后） | **`8 passed, 0 failed`** |
| ★ 真树判据 | 测试文件 md5 **`f141d37f48e1809dbda7b6253c919047`** 变异前后**逐字节相同** ⇒ **NEVER WRITTEN=true** |

★ 自检的意义：★ **先证明"变异落在目标上"再谈"红了"** —— 否则"没红"分不清是**断言没牙**还是**变异打偏**（R27 的教训）。

## 5. ★ 残差（照你要求**明写**，已在测试头注释里）

> ★ **本文件只覆盖**：**`packs/*/prompts` 作为提示词来源** ＋ **`systemPrompt.section` 这一条注入路径**。★ **未枚举**：**其它在 pack 内的提示词来源**，以及 ★ **宿主自身可能拼接的提示词文本** —— 后者是 **宿主边界**，不在我们能观测的范围内（与 `receiptElision` 的 `hostElision` 同类）。

## 6. 登记 ／ `--check` ／ 边界

- **`package.json`**：**定点**加 `"tests/vmu-prompt-clean.test.mjs"`（只加 1 行）⇒ **计数 +1**。
- ★ **`--check` 预计 STALE**：★ 我新增了 1 个已登记文件 ⇒ 计数类门禁（`regen-all --check`）会因 **+1** 报 STALE ⇒ ★ **请你 `--write`**（我**不跑 `regen-all`**）。
- ★ **`installer.js` 不适用**（测试文件不在 `PRESETS[].files`；R14 已核 `tests/` 命中 0 次）⇒ **未碰**。
- ★ **未碰 `packs/**`**（v5r 含义一字未改）；★ 未碰 `kernel/**`／`settings/**`／`docs/**`；★ **未自造公开码**。
- ★ **`host.js` 行数未受影响**（本轮未动它）。

## 7. 交回 Lead

1. **判据已固化**：`tests/vmu-prompt-clean.test.mjs` **8/0**；★ **两臂同一次运行**里同时钉住 **① 工具确实在** 与 **② 注入层 0 段/0 字符/0 命中**，并用 **`control.hits > 0`** 做**反空过前提**。
2. **当天反例已种且 target-addressed**：**MUT 4/4 红（B1–B4）**，自检证明**落在目标行 72**、**真树只读**。
3. ★ **R42 的 12 → 本测试 22**：**词表差异**（R42 探针注释与正则不一致），**行为未变**；本测试**只钉结构**。
4. ★ **请 `--write`** 重生成计数（+1）；★ 若还有别的 STALE，**归因不是本轮**（我只有 `tests/**` ＋ `package.json` 一行）。
5. **残差已明写**（§5）；★ 下轮 `vmu-assistant2` 跑真机时，**P-clean 臂＝`vmu:{tools:{faces:['report','status']}}` 且不装载 v5r**。
