# Phase 2 · pack round 4 · A1 step 1 — **DESIGN + CONTRACT** (★ **未实现**, named below)

> Task: give "reporting" an **audience** and a **visible feedback loop**, with the **framework switch defaulting OFF**, and **do NOT flip v5r's default this round**.
> ★★ **STATUS: 本轮交付的是【设计与契约】，未实现。** 这是任务书明确允许的路径（"若你判断这超出本轮预算 ⇒ 先交【设计与契约】并具名'未实现'"），★ **我没有留半截**：**未改任何仓内文件**（除本报告），因此**不存在"声明了却没消费者"的半截状态**。
> ★ **我判断它超出本轮预算**：它需要 **新 settings 键（含 schema 生成块）＋ 新 `kernel/**` 模块 ＋ 消费者接线 ＋ `LIVE_READERS` 登记 ＋ 回执字段 ＋ 新测试 ＋ 当天副本反例 ＋ 双登记**，其中**至少一项依赖宿主侧能力尚未核实**（§2.3）。

---

## 0. 结论速览

| 项 | 状态 |
|---|---|
| **机制选择** | ★ **首选＝宿主【动态 context】通道**（每回合快照，`renderContextSnapshot`），因为它**模型每回合可见**且**不是策略 section** ⇒ **不增加 P**（§2） |
| **开关与来源** | ★ `vmu.report.feedback`（**boolean，默认 `false`**）＋ `vmu.report.audience`（string，默认 `''`）；★ 回执报**生效值＋来源**（§3） |
| **失败语义** | ★ `reportFeedback.delivered:false` ＋ **既有登记码** `VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason` ＋ stderr 一行 ⇒ **绝不静默**（§4） |
| **两态同形** | ★ `reportFeedback` **7 键恒存在**，状态用**值**表达（§4） |
| **消费者** | ★ 报告面读该键 ＋ ★ **`LIVE_READERS` 登记**（`kernel/index.js:183/190/2167`）＝现成的"声明⇒执法"钩子（§5） |
| **能红判据** | ★ 设计已给（开关 ON ⇒ 反馈在**下一回合**可见且 `delivered:true`）；★ 反例＋**target-addressed 自检**（§6） |
| **实现** | ❌ **未实现（具名）**；★ **本轮零仓内改动** |

---

## 1. 先把"已测"与"我未核"分开（口径）

| 事实 | 来源 |
|---|---|
| 现报告面 **`to: []`／`channel: log`** ⇒ 无人接收、模型拿不到反馈 | ★ **Lead 的实测**（我**未**在仓内读到该行：`vibe-math-vmu/tools/report.js` 里我按 `to:`/`channel:` 找**没找到** ⇒ ★ **本条按 Lead 的测量引用，不是我的读数**） |
| 三版行为实验（R41/R43/R44）**六次会话 C1＝0**，而 **6/6 产出含值得汇报的内容** | ★ Lead／`vmu-assistant2` 的实验读数 |
| `LIVE_READERS` 是"谁在调用时读这个设置键"的表，暴露在回执里 | ★ **我的读数**：`vibe-math-vmu/kernel/index.js:183`（`export const LIVE_READERS = Object.freeze({…})`）、`:190`（`liveReadersOf(key)` **按前缀匹配**）、`:2167`（`liveReaders: LIVE_READERS`） |
| 宿主有 **动态 context** 概念与 **31 槽 section** 模型 | ★ **我的读数（C1）**：`dsh-system-prompt/lib/index.js:44-48`（`CONTEXT_ORDERS`）、`:121-122`／`:146-150`（`renderContextSnapshot`／`renderContextSections`）、`:10-43`（`SECTION_ORDERS`） |
| ★ **宿主 context 的【注册方法名】与是否允许新槽** | ★★ **我未核**（C1 的 dump 里没取到；`kernel/**` 里也没有 context 注册 API）⇒ **这是本设计的第一个未决点（§2.3）** |

## 2. 机制：让"汇报"有受众与可见反馈

### 2.1 候选与取舍

| 候选 | 模型下回合可见？ | 会不会增加 P（提示词要求）？ | 判定 |
|---|---|---|---|
| **A. 反馈写进【提示词 section】** | ✅ | ★★ **会** —— 任何"你被汇报了…"的 section 都是**模型可见的策略/信息文本**，**会污染 P-clean 判据**（R42/R43 刚把 P 与 S 分开） | ❌ **否决** |
| **B. 报告工具【返回】给调用者** | 仅对**调用者**可见；主代理不调用就看不到 | 不增加 P | ⚠️ 不足（回路不闭合） |
| **C. ★ 宿主【动态 context】通道**（每回合快照） | ★ **✅ 每回合可见**（`renderContextSnapshot`） | ★ **不增加 P**（它是**运行时快照**，不是策略文本；与 `SANDBOX_POLICY` 同类） | ★★ **首选** |
| **D. 模型**主动**拉取（`vmu.report.list`）** | 需模型**主动调用** | 不增加 P | ⚠️ 只作**兜底**（今天正是"模型不主动"才缺回路） |

### 2.2 选定形态（**为什么**）

★ **主通道＝C（宿主动态 context）**，理由三条：
1. **回路闭合**：宿主**每回合**渲染一次快照 ⇒ 模型**下一回合就能看见"谁汇报了什么"**，不需要它自己主动去拉；
2. ★ **不污染 P**：它是**运行时上下文**（与 `Current runtime context. …` 那类同级，见 C1 读到的 `:135`），**不是**"要求你汇报"的策略句 ⇒ **R42/R43 建立的 P-clean 判据不受影响**（★ 这是选它而不是 A 的决定性理由）；
3. **有受众语义**：快照里带 **`audience`**（谁应当看到），使"汇报"从"写进 log"变成**有收件人的事件**。

★ **兜底＝D**：同一条反馈也通过报告面暴露为**可拉取**的只读视图（供主代理/工具读取），并在**回执**里报 `delivered`（下方 §4）—— ★ 这样**即使 C 不可用，回路也不是静默缺失**，而是**具名降级**（§4）。

### 2.3 ★ 本设计的未决点（**必须核**，否则实现会半截）

1. ★★ **宿主 context 的注册 API 名与"是否允许新增槽"**：C 通道要用宿主能力，而 **C1 我没有取到 context 的注册方法名**；若只能登记到**既有三槽**（`SANDBOX_POLICY`/`APPROVAL_POLICY`/`SUBAGENT_DELEGATION`，`:44-48`）而**不能新增**，则**需要宿主侧变更** ⇒ ★ **这必须先核，再谈实现**（一次性读码即可，属 C1 同类）。
2. ★ **反馈是否会被送入【成员回合】**（是只给主代理，还是也给 teammate）⇒ 决定 `audience` 的语义与回执字段。
3. ★ **反馈的容量/寿命**（保留几轮、是否截断）⇒ 与 R32/R36 的预算纪律同类，须**具名常量**。

## 3. ★ 开关、默认值与**来源**（"声明了却不生效"是明令禁止的）

**新增两个 settings 键（都默认关/空）**：

| 键 | 类型 | 默认 | 含义 |
|---|---|---|---|
| **`vmu.report.feedback`** | boolean | ★ **`false`** | ★ **框架层开关：汇报的反馈回路是否开启** |
| **`vmu.report.audience`** | string | `''` | 受众标识（谁应当收到）；★ 开启但为空 ⇒ **具名失败**（§4） |

★ **来源可见**：回执报 `source`，取值沿用本仓既有词表：`'default'`（未声明 → 走默认）／`'settings:<key>'`（profile 声明）／`'config:<key>'`／`'pack:<id>'`（清单折入）⇒ ★ **读者能一眼看出"有效值从哪来"**。
★ **R24/R30 纪律**：★ **该键必须有真消费者**（§5），否则**就是"声明了却不生效"** —— ★ 也正因此，**未接消费者之前不许落这个键**（这就是本轮**只交契约、不落键**的另一条理由）。

## 4. ★ 回执形状：**两态同形 ＋ 具名失败语义**

```jsonc
reportFeedback: {
  enabled:   false,            // 生效的开关值（boolean，恒存在）
  source:    "default",        // 生效值来源（字符串，恒存在）
  audience:  null,             // 生效受众（string|null，恒存在）
  delivered: false,            // 这一段反馈是否真的送达了可见通道（boolean，恒存在）
  code:      null,             // 不可用时＝既有登记码（string|null，恒存在）
  what:      null,             // 例如 "report.audience"／"host.context"（string|null，恒存在）
  reason:    null              // 人类可读原因（string|null，恒存在）
}
```
★ **两态同形（R32 教训）**：★ **无论开关开还是关，`reportFeedback` 的 7 个键【都出现】**，状态一律用**值**表达（`enabled:false`／`delivered:false`／`code:null`），**绝不靠"键在不在"表达**。
★ **具名失败语义**（照 `promptSection` 的既有形态）：当**开关开**但**送达不可用**时 ⇒ `delivered:false`、`code:'VMU_EXTERNAL_UNAVAILABLE'`（★ **既有登记码，不自造**）、`what:'host.context'`（或 `'report.audience'`）、`reason:'…'`，并**同时**在 stderr 打一行 ⇒ ★ **绝不静默**。

## 5. 消费者（"声明 ⇒ 执法"）

1. ★ **报告面**：`vibe_vmu_report` 的 spec 构造处**读** `vmu.report.feedback`／`vmu.report.audience` ⇒ 决定是否写入反馈通道、以谁为受众；
2. ★★ **`LIVE_READERS` 登记**：在 `kernel/index.js:183` 的 `LIVE_READERS` 表里为 **`vmu.report.` 前缀**登记**读者名**（如 `'report face'`）⇒ ★ **回执的 `liveReadBy` 就能证明"这个键有人在调用时读"** ＝ **"声明⇒执法"的可核证据**（`liveReadersOf` 按前缀匹配，`:190`）；
3. ★ **回执**：新增 `reportFeedback`（§4）由**报告面/宿主面**填充；★ **`host.js` 余量只有 33 行** ⇒ 载体放**新 `kernel/**` 模块**（如 `kernel/reportfeedback.js`），**不往 `host.js` 加**；
4. ★ **零机制形状**：新模块是**纯函数/小对象**（无 `create*` 工厂）⇒ 照 `receiptbounds` 先例在零机制矩阵里登记 **`EXPECT_NA`**（★ 从闭集挑词，不猜）。

## 6. ★ 判据（能红）与当天反例

**判据（开关 ON 时）**：★ 一次 `vibe_vmu_report` 之后，**下一回合**的**动态上下文快照里能看到该汇报（且带 `audience`）**，且回执 `reportFeedback = {enabled:true, delivered:true, code:null}`。
**判据（开关 OFF 时）**：★ `enabled:false`、★ **快照里【没有】**该汇报内容、★ 键集合与 ON 时**完全一致**（两态同形）。
**能红反例（副本制 ＋ target-addressed 自检，照 R39/R43）**：
- **M1**：把**反馈写入调用**打断（例如写通道的那一行改成 no-op）⇒ ON 时 `delivered` 仍为 `true`／或快照里仍出现 ⇒ ★ **断言必须红**；
- **M2**：让**开关失效**（读键处恒返回 `false`）⇒ ON 臂的断言必须红；
- ★ **自检**：打印**目标行号**＋改后该行内容＋**哈希变化**＋**唯一性**，并证明**真树未被写过**。

## 7. ★ 未实现（具名）＋ 下一步依赖

★ **本轮未实现，且未改任何仓内文件**（除本报告）。★ **没有半截状态**：**没有落键、没有落模块、没有落回执字段**。
**实现顺序（建议，供你排期）**：
1. ★ **先核 §2.3 的三点**（尤其**宿主 context 注册 API 与能否新增槽**）—— 这决定 C 通道是否**只靠我们就能闭合**；
2. 落 **schema 键**（`settings/schema.js`，★ **生成块不手写**：走生成器）＋ **`LIVE_READERS` 登记**（消费者可核）＋ **新 `kernel/reportfeedback.js`**（★ 不碰 `host.js` 的 33 行余量）；
3. 落 **回执 `reportFeedback`**（7 键两态同形）＋ **具名失败语义**；
4. 落 **新测试 ＋ 当天副本反例（含 target-addressed 自检）**；★ 新文件**当场双登记**；
5. ★ **第二步（他人）**：**显式打开**开关跑真机实验；★ **第三步（仅在实测有效且无回归后）**才谈 **v5r 默认翻不翻** —— ★ **本轮绝不翻 v5r 默认**（已遵守）。
**★ 已知会影响的门禁**：新键会动 **settings 计数/生成表**（可能 `--check` STALE ⇒ 报你 `--write`）；★ **`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` 我未碰、也不会碰**。

---

## 8. ★ 引用更正（★ 就地改掉，不留错引用）

★ **§1 里"现报告面 `to: []`／`channel: log`"我原先未标注文件（并曾按 `tools/report.js` 找而没找到）。正确位置是 `vibe-math-vmu/kernel/report.js`（571 行）**，★ **Lead 给的每一行我都逐字复核过**：

| 行 | 原文（逐字核对） |
|---|---|
| `:110` | `channels: (() => { const v = listOf(sget('vmu.report.channels')); return v.length ? v : ['inbox', 'digest', 'log'] })(),` |
| `:111` | `recipients: listOf(sget('vmu.report.recipients')),` ⇒ **默认空** |
| `:211` | `const channel = str(raw.channel) \|\| 'log'` ⇒ **默认通道 `log`** |
| `:217-219` | `if (to.length === 0 && channel !== 'log') { push(CODE.noRecipients, 'report … has no recipients on a delivery channel', 'name them in \`to\`, or use channel "log" for a report that is only recorded')` |

⇒ ★★ **机制因此更准**：**默认通道 `log` ＝"只记录、不投递"** ⇒ **没有收件人、也没有任何东西回到模型** ⇒ 这正是行为层 C1＝0 的**结构性**原因（不是模型不肯报）。
★ **注明**：★ 这是本阶段**第 3 处引用错，且是我的**（前两处见 C1 报告 §1／§5.2）。★ 已在 §1 同步改指（`kernel/report.js:110-111,211-219`），★ **错误文件 `tools/report.js` 的引用【已从本设计里删除】**。

## 9. ★★ §2.3(1) 核查结果：**C 方案在【当前宿主】上可行 —— 不需要宿主侧变更**

**方法**：用 C1 的归档读取器（★ `unpacked` 条目**无 offset**，跳过并计数）读 `/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js`（366 行）＋ 全归档普查 `.context({` 与 `getContextOrder("…")`。★ **只读**。

### 9.1 ★ 注册 API 名、签名与调用点（读数）

| 行（宿主 `dsh-system-prompt/lib/index.js`） | 内容 |
|---|---|
| **`:266-268`** | ★★ **`context(context) { … return this.layers.effect(this.ctx, (layer) => layer.contexts.insert(context.name, context), { label: "systemPrompt.context()" }); }`** ⇒ ★ **API 名＝`systemPrompt.context({ name, order, text })`**，★ **返回 Cordis effect disposer** |
| `:260-262` | 其文档：**"Register ordered dynamic context in the calling context's scope. Scoped entries shadow global entries with the same name."** |
| `:257-258` | `getContextOrder(name) { return CONTEXT_ORDERS[name] }` ⇒ **静态查表**；★ `CONTEXT_ORDERS`（`:44-48`）**只有三个**：`SANDBOX_POLICY 110`／`APPROVAL_POLICY 115`／`SUBAGENT_DELEGATION 120` |
| `:240-242` | ★ 对照 `section()`：它**强制** `Number.isFinite(section.order)`（否则 `TypeError`）；★ **`context()` 未见同类校验** ⇒ **order 由调用者给** |
| `:147`／`:121-122` | `renderContextSections(assembly)`／`renderContextSnapshot(assembly)` ⇒ 快照可渲染（C1 已录） |

### 9.2 ★★ 结论：**"能不能新增槽"是错问法 —— 槽表不是准入清单**

★ **`CONTEXT_ORDERS` 是【中心拥有】placement 的便利表，不是"允许注册的名字集合"**：真正决定位置的是**调用者传入的 `order`（一个有限数）**。★ 因此：
- ✅ **贡献者可以不带新槽，直接 `context({ name: '<自己的名字>', order: <自己的有限数字>, text })`** ⇒ ★ **C 方案【在当前宿主上可行】，无需宿主侧变更**；
- ⚠️ **但必须给【显式有限 order】**：★ `getContextOrder('<新名>')` 返回 `undefined`，**把它当 order 传会排序失据** ⇒ ★ **规则写成"用显式数字，不要靠发明槽名"**；
- ★ **旁证**：全归档里 **`.context({...})` 调用点 6 处** vs **`getContextOrder` 只引用 3 个槽** ⇒ ★ **调用点多于槽数**，与"order 由调用者给"一致。

### 9.3 ★ 残余（**未核**，具名；★ 不伪装成已核）

1. ★ **未在活宿主上验证"自定义 order 的 context 真的按该位置渲染、并在下一回合出现"** ⇒ **行为层，属 D1**（C1/本轮只到 API 层）；
2. ★ 未核：**同一 scope 内两个不同 name 的 context 是否互相遮蔽**（文档只说"**同名** scoped 遮蔽 global"）；
3. ★ 未核：context 的**容量/截断**在宿主侧是否已有上限（本仓侧我会用**具名常量**，见 §2.3(3)）。
★ **"没核"与"核了"在上面三条里是分开写的**；★ 你要 3 的话，我下轮按同一读取器加一次普查即可。

## 10. ★（第 4 项）`reportFeedback` 与既有 `promptSection` 降级形态的**形状对照**

★ 既有形态（`vmu-prompt-section-guard.test.mjs:73-75, 95-96` 断言到）：`promptSection = { registered:false, code:'VMU_EXTERNAL_UNAVAILABLE', what:'systemPrompt'｜'systemPrompt.section', reason, stack }`。

| 概念 | `promptSection`（既有） | `reportFeedback`（我的契约） | ★ 处置 |
|---|---|---|---|
| 是否生效 | `registered` | `enabled` ＋ `delivered` | ⚠️ **两个概念**（"开关开了没有" vs "真的送达没有"）⇒ ★ **两个键都要**，名字区分清楚 |
| 码 | `code` | `code` | ✅ **同名，复用既有登记码** |
| 何处失效 | `what` | `what` | ✅ **同名** |
| 原因 | `reason` | `reason` | ✅ **同名** |
| 异常现场 | `stack`（**调用抛异常**那条路径有） | ★ **缺** | ★ **补 `stack`**（同样只在调用抛异常时非空） |
| 来源 | —— | `source` | ✅ **保留**（任务第 2 条要求） |
| 受众 | —— | `audience` | ✅ **保留**（本任务核心语义） |

⇒ ★ **定型为 9 键：`{ enabled, source, audience, delivered, registered, code, what, reason, stack }`**（★ `stack` 仅在被调用抛异常时非空）⇒ **同名概念用同名键**，差异项各有一句注释说明为什么这里需要 ⇒ **同一个仓里不再有两套互不相认的降级形状**。★ **两态同形不变**：9 键**恒存在**，状态一律用**值**表达。

## 11. ★ 本轮改动与状态

- ★ **本轮零仓内改动**（只追加本报告 §8/§9/§10）；★ **未实现任何代码**，**无半截状态**；
- ★ **未翻 v5r 默认**；★ **未碰** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`；★ 无 `--check` STALE；
- ★★ **可行性已钉死：C 方案在当前宿主上【可行】**（`systemPrompt.context({name, order, text})`，**order 由调用者给**）⇒ ★ **是否排实现请你定**；★ 我建议实现前只再补 §9.3(3) 那一次普查（很便宜），**其余可直接进实现**。
