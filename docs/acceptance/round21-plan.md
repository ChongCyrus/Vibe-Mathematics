# Round 21 组织草案（Lead · Round 20 收尾后）

> **Round 20 结果（已 commit `d2e4510` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **315/315**（+6）、`regen-all --check` **15/15 in sync**；**29 文件、+1209/−33**。
> **★★ 最深的一条：v5r pack 在【所有真会话】里从未被装载** —— 三次真机会话（各带 id／时刻／退出码）：
> ① `vmu.packs.active:['v5r']`（`docs/29 §3` 的配方）⇒ 只有 `turn-end-duty` sink、**两条阈值 0 条**、`report/tick` 调用 **0**，而 `declared:3/armed:3` 照样到达；
> ② **真装载键** `packs:['v5r']` 打在**预设内插件行** ⇒ **会话起不来**（`agent-preset/invalid … "systemPrompt" without inject`）＝**打断预设组装**；
> ③ 工具 `vibe_vmu_pack {action:'apply', id:'v5r'}` ⇒ **按设计拒**（只吃内联 manifest，hint 逐字指向 profile 行的 `config.packs`）。
> **旁证（两人各自独立复算）**：这些会话 **全是** `settingsMerge.packs: []`、**无一键带 `source:"pack"`**。开关是 `config.packs`（`vibe-math-vmu.js`），**设置键只让工具"可达"**。
> ⇒ **缺的不是计数者、也不是钩子桥，而是"在预设会话里装载出货 pack 的可用路线"**（三条都堵）。**两分法收窄**（避免把过去证据一起作废）：**(i) 进程内真装配＝有效**（pack 真装载、3 条总线条目、`tools/result` 真桥接、3 次事件 ⇒ `metricValues()==={"tool-results":3}`；`packs:[]` ⇒ 0 条目、`{}`）；**(ii) 真 DSH 会话＝未装载** ⇒ **只有"当它已装载"的推断作废**。
> **★ `pack.plan` 从"看不见"修成"看得见"，并暴露形状 B**：`buildPlan` 里对 **`manifest.rules[]`** 调 `kernel.rules.validate` ⇒ 缺 `when`／未知谓词 **plan 就具名拒**；**没塞进 `validatePack`**（纯函数）；副作用照实记：`apply` 的码 `VMU_MIDDLEWARE_FAILED → VMU_PACK_MISSING` ⇒ **plan/apply 同因同码**；`pack.js:388` 的 hint 从"报出每一个问题"改成"**报出它能看见的**"（实测 plan 仍看不见 M2 模块体）。
> **★★ 形状 B（`middleware:[{kind:'rules'}]`）＝"声明了不生效"的死条目**：**两人独立**、**两谓词 × 两 emit 模式**实测 —— 形状 A 触发（`deny VMU_ALWAYS`／`deny VMU_TOOL`），**形状 B 连合法规则也永不触发**（条目上总线、无 handler；`bus.js:445` 豁免 + `:661` 记 `middleware/skipped`）。★ **不是安全绕过**（无 handler／无 `api`），但**比"plan 静默"重一格**。**非本轮引入**；**零兼容代价**（出货包 `kind:'rules'` 全在 `rules[]` 内、`middleware` 里 0 个）。
> **★ `host.js` 三处 ＋ 内联 manifest 两层 ＋ 一条"永远为真"的断言**：unload 白要 manifest（守卫排在分支前）／`:677` 说明与实现相反／`validatePack` 查 `on` 不查 `when`；内联 manifest＝对象当路径段（`ERR_INVALID_ARG_TYPE`）＋**文档化的 `kind?` 默认从未施加**；`[].every(…)` **恒真 ⇒ 那条守卫什么都没守**（作者靠"复原被测行"实验才发现）。
> **★ v5r M2 计数者**（`artifact-counter.js`）：政策＝数据表；**不挂 `agent/turn-stopping`**（与报告边界同刻会被误判）；两种"没记上"都**不静默**；三边界断言 ＋ 两个变异能红。
> **★ R9 裁决被尊重而非推翻**：`vmu-core2` **先读 `docs/15 §14.4`、先报冲突再动手** ⇒ **内核侧"解释令牌"一行未写**；落的是**诚实那半**（Lean 面 `admission()` 此前**没有** `resume` 字段 ⇒ 补具名披露）＋**给裁决装牙**（env 不得出现 `VMU_RESUME_SEGMENT`；改盘上令牌 ⇒ `recover()` 回 `interrupted-no-rerun` 且**恢复期间 0 次引擎调用**）。
> **★ 本轮纪律（全部来自真实自错）**：① **两向断言必须让被判定的那一行真的走红**；② **读数必须绑版本且在最后一次编辑之后重跑**（同一门 `68/67→67/67`；同一变异 `23/2→24/2`，**23+2≠26 的算术抓到的**）；③ **"每个人都以为别人有"要有机制**：具名转出必须汇聚成**可见的悬空清单**（同形状出现两次：R19 检查点、R20 `pack.js`）；④ **`JSON.stringify(<Promise>)`＝`"{}"`**，而 `{}` 看起来像合法读数 ⇒ **半对的坏读数**最容易被当成"部分证实"收下（签名：本该有字段的对象序列化成 `{}`）；⑤ **"读会话日志"本身是有版本的读法**（one-shot `zstdDecompressSync` 只出 2 行、**看起来像证据**）；⑥ **量具坏了会给自信的错误答案**（`ConvertFrom-Json` 解析失败、`Get-Content` 800 vs 真值 810）。

## ★ Round 21 已派（两条，文件不重叠）

| # | 任务 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **`task-129`** 修 **"出货 pack 在预设会话装载不了"** | `vmu-core2` | 修 **R21b 的 `inject` 失败**（文档化的装载点必须能用）⇒ `settingsMerge.packs` 非空＋**有 `source:"pack"`**；**能红断言**（装了／不装／坏形状具名拒）；**真机收口交 `vmu-assistant2` 跑第三次**（判据：sink 行出现／`report/tick`＝0／高位阈值 0 条／**装载证据**／**先按多帧解码读全会话日志**） |
| 2 | **`task-130`** **形状 B 死条目** ＋ 两处措辞收窄 | `vmu-pack2` | 形状 B 改走 **`kernel.rules.toBusEntries`**（与 `pack.js:451` 同路）⇒ **一次闭合 plan／apply／真触发**；★ **行为变更已裁决接受**（**零出货包受影响**）且**必须在 docs 与报告具名**；＋ `docs/18:145` 收窄（写清是 **`manifest.rules[]`**，并明写形状 B 不在覆盖内）＋ `docs/10:512/:514` 口径对齐（运行期**只吃内联 manifest**，"按 id 装载随包 pack"**不存在**） |

**`vmu-core2` 的缓办批次（T0/T1 结束后同一批落，已并入 `task-130` 的 C）**：① `tests/vmu-pack-tool-actions.test.mjs` S1 一行补丁（`ok===false && code==='VMU_PACK_MISSING' && problems.some(…)`）；② 报告 §3 caveat（"**只在 `problems` 上成立的判据抓不到『报而不拒』**"）；③ `docs/18:145` 收窄。

## 其余

| # | 项 | 说明 |
|---|---|---|
| 3 | **矩阵 v15**（`vmu-verify2`）：本轮 6 项 ＋ **形状 B 第 7 项** ＋ **两条方法论注记**（`await` 指纹／会话日志多帧解码） | 只读复核后再写 |
| 4 | **`docs/10:514` 与 `host.js:704-705` 的口径矛盾** | 由 `task-130` C 与装载路线裁决**同一次**落笔 |
| 5 | **目标 5 的中间检查点**保持具名（R9 改判条件未满足；升级清单已落到起始行） | 不假装 |
| 6 | **`D:\wd\vibemath开发\token.txt`**（明文 npm token，写范围外）⇒ 已上报用户**两次**，等指示 | 安全项 |

## 纪律（沿用；R20 新增六条见上）

- 既有九条：门禁必须有牙（**种违规⇒红／删⇒绿**）／判据与环境一致／观测量两档真的不同／**回执说成功必须与事真的做了分开断言**／门禁读事实所在的那种文本／"我没找到"≠"它不存在"／重构原子＋每步跑加载内核套件／清理只删显式创建路径／引用前先落一行核验并写明读的是哪一次运行。
- **⑧ 两型**：**你写下的每一个 token 都可能在门的另一侧有语义**。
- **★ 新：放弃/转出必须汇聚成"悬空清单"**（不是纪律句，是机制）。
- 轮末由 Lead 统一 `update-doc-counts → regen-all → generate-wiring-index → T0 → T1 → commit → push`；**不发布**。
