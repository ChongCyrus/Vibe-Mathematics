# 提示词预算审计台账（audit-prompt-budget.mjs）

这一份是「审计 → findings → 修复 → 重跑」循环的记账本：`scripts/audit-prompt-budget.mjs` 每量出一条真账，
就在这里加一行，写清**证据**（哪个数、怎么量的）、**状态**（OPEN / FIXED）、**修法或下一步**。
台账不是抱怨清单：没有「下一步」的条目不进门。

量法以脚本为准（`node scripts/audit-prompt-budget.mjs`）：用内核真正的装配器与**名册槽位**
（`chair` / `member` / `temp`，见 `vibe-math-vmu/kernel/turn/index.js` 的 `chosenRole`）逐 phase 装配，
量字符数、完全重复行占比、散文里的参数密度、以及「散文提到但没有声明面提供」的工具名。

★ RUN 226 的量法更正（在此之前本台账里的数**全部作废**）：真机装配还差两个参数，脚本一直没传——
`bindings: PACK.bindings`（生产入口 `vibe-math-vmu/vibe-math-vmu.js:658`、`:1159-1164` 逐个 bind；不传则
chair 的 role 段整段不渲染，提示词**假短**约 4.3 K）与 `settings`（`kernel/turn/index.js:2001-2002` 用它喂
section 策略）。此外模式必须写死为 `v5r.fixtureMode:'tools'`（部署配置如此；schema 默认是 `no-tools`，
两者差约 2.2 K）。现在的量法是「七相位 × 三席 × tools 模式」，并对**最坏相位**判定。

## F1 — 院士席提示词超 T99 上限：真值 38 478（修后 33 964，FIXED-as-debt）

- 证据（2026-11-04，RUN 225 首量 → RUN 226 重测）：旧量法 chair `normal=32 057`（假短）；真装配 chair
  `normal=38 478 / meeting=39 736 / checkpoint=38 625 / verify=41 060`（tools 模式，含 bindings+settings）。
- 影响：院士回合真实成本比自定上限高 8.5 K；「关键约束被稀释」不是感觉，是 28%。
- 修法（RUN 226，已完成）：`v5r-tools-academician` 的 40 条工具 bullet 改为「名字 + 一句职责」并由
  `vibe-math-vmu/packs/v5r/seat-faces.js` 收窄；`v5r-reply-compact` / `charter-*` / `formal-*` / 会议调度段
  按相位拆分与去重；`v5r-fixture-tools` 只留本夹具独有的契约；形式化家族与会议「会上」段改成
  `kind:'phase'` 由 `packs/v5r/middleware/prompt-switches.js` 门控。
- 现状：chair `normal=31 4xx`、最坏 `verify=33 964`；member 最坏 28 114；temp 最坏 25 387。
- 状态：**FIXED-as-debt** —— 仍在 T99 的 30 000 之上，但已有**真上限**（`chairPromptChars: 36 000`）与
  WARNING（`SEAT_PROMPT_OVER_T99`），并在 conformance 记债：要压到 30 000 只能把 `seat-faces` 的 bullet
  投影由工具声明单源生成（预计再省 3–4 K），属下一轮的结构改动，不靠继续抠散文。
- 验收：member/temp 最坏相位 < 30 000（已达成：28 114 / 25 387）；chair 最坏相位 < 36 000（已达成 33 964），
  且 chair > 30 000 时门禁必须打 WARNING（已达成）。

## F2 — 预算门禁量的是真实回合里不会出现的角色（FIXED）

- 证据：`tests/vmu-turn.test.mjs` 的 T99 断言用 `role:'researcher'`（量到 27 973，通过），而内核传给装配器
  的是名册槽位；`scripts/audit-prompt-budget.mjs` 首版同样按来源词量（chair 24.5 K）。
- 影响：这就是 F1 能长期存在而不被任何门禁发现的原因——「检查的东西」和「跑的东西」不是同一个对象。
- 修法：脚本改量槽位（已在 RUN 225 落地）；RUN 226 再把两个缺失的装配参数补上（bindings / settings）、
  模式写死 tools、对**最坏相位**判定，并在表格里打印每个相位与角色。
- 验收：把 chair 的 bindings 或 settings 去掉时，脚本必须报出与真机不同的数（已人工验证：去 bindings 时
  chair 掉到 33 1xx，去 settings 时时序块不渲染）。

## F3 — pack 工具描述均值 791 字，超 700 预算（FIXED）

- 证据：48 个工具描述合计 37 990 字，均值 791，最大 3 799（`vibe_v5_record_proposition`）。
- 影响：工具描述由宿主随每步发送，是每个回合都要付的成本；长描述里混着策略（该谁在何时调用）与形状
  （参数），而形状本应由 schema 表达。
- 修法（RUN 226，已完成）：只改 `vibe-math-vmu/packs/v5r/tools.js` 里 11 条 description（最长者先动）：
  `record_proposition` 3 799→2 434、`meeting` 3 694→2 274、`verdict_ask` 2 842→1 863、`verdict_final`
  2 382→1 849、`meeting_round`、`say`、`blueprint`、`verified_promote`、`paper`、`verdict`、`lean_run`。
  保留：一句话用途、决定「是否该调用」的前置条件、以及所有被测试 pin 住的句子；删除：参数规则复述、
  回执字段枚举、`state.json`/内部函数名等实现细节、跨描述重复的 caveat。
- 现状：合计 31 652、均值 **659**、最大 2 434。零测试文件被改（没有 pin 逼着改）。
- 验收：均值 ≤ 700（已达成 659）；`audit-prompt-tool-params` / `audit-doc-actions` /
  `audit-tool-required-flags` / `vmu-v5r-tools` / `vmu-g7-concordance` 全绿（已达成）。

## F4 — `status` 默认 summary 超 8 000 字节可读上界（FIXED）

- 证据（RUN 226）：真装配（v5r pack）下 `vibe_vmu_status` 默认 summary 8 079 B，唯一红是
  `tests/vmu-host.test.mjs` 的「< 8000 字节（可读，不再被宿主截断）」。
- 根因不是某个新块太大，而是**同一句话印了七遍**：七个诊断段各带一句 62 字的
  `headline only; ask detail:"full" for the whole section`（≈430 B），再加一句 220 B 的 `diagnosticsBounded`。
- 修法：每段只留 `note: 'detail:"full" only'`，指针在 `diagnosticsBounded` 里说**一次**（并列出七个段名）；
  语义不变——每段仍是 `present` + `fields`，`detail:"full"` 仍返回整段。
- 现状：summary 8 079→约 7 8xx B，`vmu-host` 213/0 全绿。
- 教训：可读上界是**总量**约束，重复散文按次数付费；先找「同一句话说几遍」，再找「哪句最长」。

## 已量过的假问题（记录，避免重犯）

1. **宿主工具被判成不可调用（首版，7 条）**：宿主的 `TOOL_NAMES` 以短名（`status`）作键、`vibe_vmu_status` 作值；脚本读了键集合。已修（改读值）。
2. **按来源角色量字（首版）**：`academician`/`researcher` 是宪章的来源词，不是回合里传下来的槽位。已修（改量 `chair`/`member`/`temp`）。
3. **恒红的提醒线**：ratchet 先设 26 000，member/temp 每次都红。已修（改成「T99 以上才 WARNING」，不再当 problem）。
4. **「真机装配」其实少了两个参数（本台账最大的假数）**：bindings 与 settings 没传，量到的是「装配器在缺省设置下的输出」，比真机短 4.3–6.4 K。已修（见开头的量法更正）。

一条纪律：审计脚本的每个「问题」在写进本台账之前，必须**手工复核一条同类项**——首版审计的两个错都朝「看起来没问题」的方向。
