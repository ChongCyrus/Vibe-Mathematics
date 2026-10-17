# Phase 5 · **源码级普查【如实账】**（Round 91 更新）

> ★ 作者＝Lead。★ 这一篇**只做一件事**：★ 把"**哪些读了／哪些由机器保证／哪些还没读**"逐文件写清。
> ★ **不写"0 问题"这种话** —— ★ 本仓最强的纪律是**不许把"没读到"写成"没问题"**（★ 这一条现已写进根级 `AGENTS.md`）。

## 1. ★★★ 一条口径：**"生产即验证"的文件【不需要眼审】**

★ `packs/v5r/prompts/v5r-prompts.js` 与 `v5r-persona.js` 的首行是 **`GENERATED FILE, do not edit by hand`**，★ 且带 **`SOURCE_SHA256`**，★ 并由 **`tests/vmu-pack-prompts.test.mjs` 断言与语料一致** ⇒ ★★ **它们与源的不一致【本身就是 FAILURE】**（★ 仓库原话：★ *"cite, never drift"*）⇒ ★ **用眼睛再过一遍不增加任何保证** ✓
★ **所以本账把文件分成三类**：★ **① 已逐行读**／★ **② 生成＋哈希断言（免眼审）**／★ **③ 待读** —— ★ **而不是笼统地说"覆盖率多少"** ✓

## 2. ★★★★★ pack（17 个文件 / 3,239 行）

| ★ 类 | ★ 文件 | ★ 行数 |
|---|---|---|
| ✅ **已逐行读（9）** | `v5r/index.js` · `v5r/settings/defaults.js` · `v5r/middleware/prompt-switches.js` · `v5r/middleware/artifact-counter.js` · `v5r/middleware/waitsemantics.js` · `v5r/middleware/motion-box.js` · `v5r/middleware/stall-meeting.js` · `v5r/notices.js` · `institute-min/index.js` | ★ **912** |
| ★ **生成＋哈希断言（2）** | `v5r/prompts/v5r-prompts.js`（sha256 ＋ 测试断言）· `v5r/prompts/v5r-persona.js` | ★ **331** |
| ⏳ **待读（6）** | `v5r/prompts/v5r-blocks-a.js`（730）· `v5r-blocks-b.js`（702）· `v5r-core.js`（383）· `v3-core/index.js`（134）· `v5r-charter.js`（120）· `v5r-assistant.js`（37） | ★ **2,106** |

⇒ ★★ **已处理 9+2 ＝ 11/17 个文件（1,243/3,239 行 ＝ 38%）**；★ **待读 6 个（2,106 行 ＝ 65%）** ✓
★ **而剩余的大头是【提示词文本块】**（`v5r-blocks-a/b` 共 **1,432 行**，★ 是逐字转写的内容，★ 不是逻辑）⇒ ★ **它们的正确性风险主要在"内容是否与原版一致"，★ 而那有 `vmu-pack-prompts` 的语料哈希与 `audit-prompt-invariants` 在管** ✓

### 2.1 ★★★ 本轮读过的 9 个文件里【只发现 0 个缺陷】
★ 值得记的是它们**各自带着过去缺陷的教训**，★ 而且**都把哲学的划分做对了**：
- ★ `v5r/index.js`：★ 曾因把文件夹记录命名为 `PACK` 而**静默替换了真清单、名册消失**（★ 教训留在命名里）
- ★ `prompt-switches.js`：★ 曾把 `on: 'turn.assemble'`（宿主**不桥接**的名字）⇒ **真预设里惰性而测试全绿**
- ★ `artifact-counter.js`：★ 说明**为什么必须是 pack 模块**（★ 内联 bus 条目拿不到 `api.services` 接缝）
- ★ `waitsemantics.js`：★ 把官方的 policy-in-code **拆成"能力在内核＋规范文本在 pack"** —— ★ **D-1 的正确解法**
- ★ `motion-box.js`：★ 具名记录"R13 待办：motion 文本还没进钩子载荷"（★ 不假装）
- ★ `stall-meeting.js`：★ **用比率 `3 × idleAfterMs` 而非写死 360000** ⇒ ★ **硬编码红线的正面样板**
- ★ `notices.js`：★ 逐字转写语料 ＋ **缺字段具名拒**（★ 不许 `任务 undefined` 到达模型）
- ★ `institute-min/index.js`：★ **纯数据**（★ slots 而非 roles、★ M1 规则即数据、★ 别名不重命名）
- ★ `settings/defaults.js`：★ 从 `defaults.json` **派生**而非两处手写（★ 曾经的"两个作者"缺陷）

### 2.2 ★★ 本轮顺手核实的两件事（★ `institute-min`）
★ **它声明的 6 个设置键【全部】在 `settings/schema.js` 里**（★ 不存在"声明的键没人认"）✓
★ **它自己命名空间的两个错误码都带 `VMU_PACK_INSTITUTE_MIN_` 前缀**（★ 框架拒绝与机构拒绝可区分）✓

## 3. ★★★ kernel（103 文件 / 42,687 行）

★ **已逐行**：★ `kernel/index.js`（多处）· `kernel/turn/index.js`（**大量**，本阶段改了十余次）· `kernel/activity.js`（定点）· `kernel/chat.js`／`mailbox.js`（定点）· `kernel/prompt/index.js`（多处）· `kernel/members.js`（定点）
★ **机器已覆盖**：★ **`kernel.<服务>.<方法>` 悬空调用 ＝ 0**（★ `tests/audit-service-calls.mjs`，★ **87 服务 × 213 文件**，★ 带 9 条敏感性自证）✓
⏳ **待逐行**：★ **其余约 90 个文件**（★ 其中多数是本阶段未触碰的领域面：arbitration／bidding／trust／skills／paper／publication／scheduler／transaction／replay……）

## 4. ★★★ tools / host / settings / scripts

★ **已逐行**：★ `tools/control.js`（全文）· `tools/capacity.js`（**重写**）· `tools/turn.js`（定点）· `host-deliver.js`（**本阶段重写**）· `host.js`（定点）· `settings/schema.js`（多处）· `vibe-math-vmu.js`（多处）
★ **机器已覆盖**：★ 悬空调用 0／读设置的未声明键 0／**发货核对**（`package.json#files` ＋ installer managed 清单，★ 门禁 29/0）✓
⏳ **待逐行**：★ **约 70 个工具面**（★ 每个都已被"发货/枚举/拒绝不崩"这一类门禁覆盖，★ **但动作级语义未逐个读**）

## 5. ★★★★★ 所以"目标3 完成"的判据是什么（★ 现在可以量化）

| ★ 判据 | ★ 现状 |
|---|---|
| ★★ **机器可判定的四类**（悬空调用／未声明键／吞异常／占位符） | ★ **全树已扫，0 命中** ✓ |
| ★★ **pack** | ★ **9 逐行 ＋ 2 免眼审 ＝ 11/17**；★ **剩 6 个 2,106 行** ✗ |
| ★★★ **kernel** | ★ 定点＋机器；★ **剩约 90 文件未逐行** ✗ |
| ★★★ **tools／host** | ★ 关键面已读＋机器；★ **约 70 个工具面未逐动作读** ✗ |
| ★★★★ **真机** | ★ **53 面被触达、28 拒绝里 27 条设计内、结题两次达成** ✓；★ **~35 个单触面未逐动作实测** ✗ |

⇒ ★★★★ **结论：★ "目标3 完成"【尚未达到】；★ 而现在的缺口是【可数的】：★ 6 个 pack 文件 ＋ ~90 个 kernel 文件 ＋ ~70 个工具面 ＋ ~35 个单触面** ✓
★ **下一步不该是"再跑一遍全流程"，★ 而是【按这份清单逐项清】** ✓

## 6. ★★★★ ROUND 92 补记：`v5r-core.js` 读完（408 行）＋ 一处真缺陷已修

### 6.1 它为什么是**质量最高的一份**
★ **`assertRuntimeSafeSections`**：★ 在**"记录"与"运行时源"之间立了一道【具名门】** —— ★ 段集里若含**捕获的轮次数／表决权人数／绝对路径**（`SNAPSHOT_VALUE_RE`），★ **按名拒**，★ 并把**违规段名列在消息里**；★ 而**干净的段集返回 `{ok:true}`** ⇒ ★ **"什么都拒"不可能发生**（★ `PACK.sections` 能过）✓✓
★ **`v5rTurnSections` 在【行上】自标 NOT runtime-safe**，★ 并写明原因（★ 会把 **66 个轮次号和 66 个表决权人数**冻进活提示词）✓
★ **ROUND 374 的教训写在清单里**：★ 语料/人设是**一次捕获的快照**，★ 当运行时段声明会注入**冻结值**；★ 且人设**按成员各一条绑定**而管线会**附加每一条匹配绑定** ⇒ ★ **一名研究员会收到三个身份和三个法定数** ✓
★ **ROUND 393**：★ 标题用 `roleLabel`（读者看到的）而非 `role`（绑定键）—— ★ **独立审计量到的差别是"50 个标题渲染成 researcher r-1、没有一个渲染成 常驻研究员 r-1"** ✓

### 6.2 ★★★ 本轮找到并修掉的那一处（★ 注释与代码不符）
★ `v5r-core.js` 的 `vmu.records.requireSettledRecords` 旁写着 **"PACK-LAYER key (not in docs/04 §11)"** ⇒ ★ **已不成立**：★ 该键**已在 `settings/schema.js:81` 声明**（boolean／def true／owner office／HOT.H1），★ **并确实出现在生成表 `docs/04-settings.md:275`** ✓
★ **它的误导是具体的**：★ 读者会以为这个键**绕过 schema**，★ 而实际上它**可设、有文档、有归属**，★ **和别的旋钮一样** ✓
★ **修法**：★ 就地改为**准确陈述** —— ★ **pack 拥有的是它偏好的【初值】，不是【声明】**，★ 并把"这句话曾为真、何时变假"一并写下 ✓
★ **同时核实**：★ `v5r-core` 声明的 **12 个设置键【全部】在 schema 里** ✓（★ 我之前怀疑它们未声明，★ **实测否证**）
