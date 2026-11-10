# 提示词内容审计（RUN 241-B · task-52）

只读审计：**真装配**出来的 12 份提示词逐节通读，针对「不合理 / 矛盾 / 无关冗长 / 不清晰 / 重复 / 时机或位置不对 / 该推荐什么机制与内容」给条目。每条给出**可直接替换的文本**，不是「建议精简」。

结构层面的去重（合并同类节、调整装配顺序）属 task-51 lane，本文件只做**内容**层面的判定与改写稿。

---

## 0. 方法与口径

- 装配命令：`node scripts/sim/audit/prompt-sections.mjs` → `D:/_tmp/sim/prompt-sections.json`（848 条实例，72 个非空唯一节），覆盖 `chair|member|temp × normal|meeting|checkpoint|verify`。
- 字数（字符）。「审计时」= 2026-11-06 00:14 生成、逐节通读所用的快照（848 条实例）；「复查时」= 01:00 重装配的快照（701 条实例，task-51 结构去重已落一版）。25 条逐字引文在复查快照里**仍全部存在**，条目本身不因去重失效：

| 席位 | 快照 | normal | meeting | checkpoint | verify |
|---|---|---|---|---|---|
| chair | 审计时 | 32 442（70 节） | 35 607（71） | 32 593（70） | 36 279（73） |
| chair | 复查时 | 30 860 | 35 524 | 31 011 | 34 413 |
| member | 审计时 | 26 315（69） | 28 212（70） | 26 466（69） | 30 152（72） |
| member | 复查时 | 25 932 | 28 135 | 26 083 | 29 777 |
| temp | 审计时 | 23 433（70） | 25 182（71） | 23 584（70） | 27 268（73） |
| temp | 复查时 | 23 194 | 25 105 | 23 345 | 27 088 |

- 真机证据：`D:/_tmp/sim/real-stats.md`（20 441 条回执的拒绝码分布）、`D:/_tmp/sim/real-fieldset.json`（69 个工具的真实顶层字段并集）、`D:/_tmp/slv-phase5/slvp193-ws/FEEDBACK63.md`、`SIM-REPORT63.md`；工具形参以 `vibe-math-vmu/packs/v5r/tools.js` 声明为准。
- 规则依据：逐条对照 `D:\wd\vibemath开发\宏观层面v5r运行规则.md`（74 行；L1–L63 规则句，其中 63 行 = 18 空行/分隔 + 13 小节标签 + 32 要求行）与实现台账 `docs/acceptance/rules-ledger.json`（93 条全 DONE，两本账见 `docs/acceptance/sim-audit-rules.md`；`linecheck3.mjs` 锚点 86/86、要求行 32/32，见 `docs/acceptance/phase12-v5r-rules-conformance.md` §337）。每条与规则冲突的条目在 §7 给出 L 行号。
- **局限（先说清楚）**：本夹具没有 paper/lean/resume/founding 上下文，这几类模板节 `chars=1`（未注入），所以 paper 面只能靠真机拒绝证据与源文件旁证（见 E3）；`v5r-turn-meeting-chamber`（chair 1 795 字）只抽读、未逐行审。

## 1. 类别分布

| 类别 | 条数 |
|---|---|
| A 会诱发错调用（教错工具/错形参/渲染出 0 造成直接误导） | 8 |
| B 矛盾（同一回合内两段互相打架） | 2 |
| C 时机或位置不对 | 5 |
| D 无关冗长 / 重复 | 8 |
| E 缺失（真机高频拒绝码没有对应指引） | 5 |
| 合计 | 28 |

## 2. TOP 5（先改这五条）

1. **A1 `v5r-turn-resources` 工具预算渲染成 `0 次`**（12/12 全席位）× `v5r-fixture-tools`「本轮**可以且应该**调用工具」——同一回合两句话方向相反。
2. **A2/A3 `v5r-verify-core`**：「表决票走 `vibe_v5_poll_vote`」与 `v5r-turn-polls`「辩论不用投票板」、`v5r-charter-voting`「用 `vibe_v5_verdict`」三方打架；且「对象：(unspecified)」占位符原样进提示词。
3. **B1 leaderless 四段 12/12 全组合注入**：院士已就座时仍写「本所当前**没有在册院士**」——与 `v5r-charter-opening`「你是…**院士**」直接矛盾。
4. **A5 `v5r-fix-formal` 把 `kind` 当流程旋钮**：`kind` 只是台账标签（sync/division/verify-request/solve-vote），流程由 `type`（ordinary/academic/debate/closure/paper/planning）决定。
5. **A4 `v5r-verify-formal-addendum`**：教了 `target`（合法但已废弃的 `statement` 别名）、漏掉必填 `name`；「不要用 JSON 回复块表达形式化结论」又与 `v5r-fix-formal` 的 `formal:{decision,file,note}` 冲突。

## 3. 建议批次

- **第一批（诱发错调用 + 矛盾，改 6 节 ≈ 省 0 字但纠错）**：A1、A2、A3、A4、A5、B1。这 6 节都是「模型照着做就错」的类型，且都是**独立小段**，改动不牵动装配顺序。
- **第二批（时机/残句 + 缺失）**：A6、A7、C1、C2、E1、E4——meeting/verify 相位的文字质量。
- **第三批（瘦身，等 task-51 的结构去重定稿后再动）**：D1–D8、C3–C5、B2、E2/E3/E5。

---

# A. 会诱发错调用

## A1 · 资源段把模板变量渲染成字面 0，与"应该调用工具"正面冲突

> **状态（task-54，2026-11-06）：已修。** `v5r-turn-resources` 改为「工具预算：本回合工具调用上限 = {{ setting:vmu.turn.toolCallsPerTurnCap }} 次（0 表示不额外限制）」与「自监测：内存阈值 = {{ setting:vmu.turn.memoryCeilingMb }} MB（0 表示不监测）」——仍由设置渲染（T81 契约不变），但 0 不再是「禁用」的暗示。

- **位置**：`v5r-turn-resources`（12/12：chair/member/temp × normal/meeting/checkpoint/verify，324 字）
- **原文（逐字）**：
  > `· 工具预算：**本回合工具调用不超过 0 次**。`
  > `· 自监测：内存接近 0 MB 时**先让出**：停新子代理、走轻量路径、把任务切小，并在回执里写明"因资源让出、剩余工作是什么"。`
- **为什么错**：`{{toolBudget}}`、`{{memMB}}` 没有值时被渲染成 `0`。而 `v5r-fixture-tools` 同回合说「本轮**可以且应该**调用你自己的工具：边做边记」。一条说 0 次、一条说应该调用——模型要么不敢调工具，要么把「内存 0 MB」读成"立刻停机"。
- **证据**：同节 12/12 出现；`v5r-fixture-tools` 12/12 出现；真机 `vibe_vmu_turn` 的 `TURN_DELIVERY_TIMEOUT`×23 与工具使用率无关，但本轮 sim 装配里两句话的位置相隔不到 10 节。
- **替换文本（整节替换）**：

```text
【资源】本机可能资源紧张，请自觉控本回合开销：
  · 并发：框架每轮最多同时唤醒 3 名成员（`vmu.turn.maxParallel`，是**唤醒人数**不是算力并发）；引擎/计算侧并发上限是 `vmu.math.maxParallel`（默认 1，**所办可设**），超限具名拒。**不要**为了提速一次性铺开大量子代理。
  · 工具：本回合**没有**工具次数上限——工具调用花的是你自己的时间，只在需要时调用，不要为凑数调用。
  · 取舍：**正确性优先于产出量**；若发现本机内存紧张，先走轻量路径（少开子代理、把任务切小），并在回执里写明"因资源让出、剩余工作是什么"。
```

> 机制建议：模板变量缺失时**不要渲染数字**（渲染层问题），或渲染为「未设置」。见 §5。

## A2 · verify 段把「求真裁决」和「选项投票板」混成一件事

> **状态（task-54，2026-11-06）：已修。** `v5r-verify-core` 收尾改为：`vibe_v5_verdict` 的 `target` = 本轮验证对象 id、`verdict` = 概率值、`reason`、`member` =；「这张 verdict 就是表决票」；`vibe_v5_poll_vote` 只用于院士另开的选项投票板（辩论本身不用投票板）。

- **位置**：`v5r-verify-core`（verify ×3，chair/member 574、temp 572 字）
- **原文（逐字）**：
  > `结束时请用 `vibe_v5_verdict` 给出你的独立复核（一个概率值 + 理由），其中的对象是`
  > `(unspecified)`；表决票走 `vibe_v5_poll_vote`（票权按席位判，临时工没有表决权）；回执里的 `verdict` 没有可用形状、投递前就被具名跳过——所以投票只有一个入口：工具。`
- **为什么错**：同一句先指 `vibe_v5_verdict`、再接 `vibe_v5_poll_vote`；而 `v5r-turn-polls`（12/12）明说「**辩论不用投票板**：辩论是各自发言 + `vibe_v5_verdict_final` 裁决，不靠选项投票」，`v5r-charter-voting` 也说判断用 `vibe_v5_verdict`。模型最容易学到的动作是"去 `poll_vote` 投一票"——`poll_vote` 的 `ballot_id` 来自 `poll_open`，验证轮里根本没有投票板，于是只能瞎填。
- **证据**：`v5r-turn-polls` chair 425 字原文；`v5r-charter-voting` 1661 字原文；真机 `vibe_v5_poll_vote` 不在高频调用里，而 `VMU_RULING_ALREADY_FILED`×14 / `VMU_RULING_CHAIR_SIGNS`×10 说明裁决入口被用混。
- **替换文本（替换该节最后一段）**：

```text
结束时请用 `vibe_v5_verdict` 给出你的独立复核（一个 [0,1] 的概率 + 理由）。**求真裁决只有这一个入口**：`vibe_v5_verdict`（最终由主席用 `vibe_v5_verdict_final` 汇总）；回执里的 `verdict` 不是回执字段，写进回执会被具名跳过。投票板 `vibe_v5_poll_open`/`vibe_v5_poll_vote` 只用于会议里的**选项表决**（议题办不办、方案选哪个），不用于"这个命题是否为真"。
```

## A3 · 验证段的「对象 / 类型」占位符原样输出 `(unspecified)`

> **状态（task-54，2026-11-06）：已修。** 标题改为「【求真表决 —— 角色 成员】」，对象行改为「对象 id 与类型以本轮帧或状态块为准（投票时把它填进 `target`）」，两处 `{{ setting:vmu.turn.verifyTarget }}` / `verifyKindLabel` 不再渲染；重装配后 `(unspecified)` 计数 = 0。

- **位置**：`v5r-verify-core`（verify ×3，574/572 字）
- **原文（逐字）**：
  > `【求真表决 —— 院士 r-acad 就对象 (unspecified) 投票】`
  > `  对象：(unspecified)（类型：(unspecified)）`
- **为什么错**：连标题带正文共 3 处 `(unspecified)`。模型读到"要对 unspecified 投票"，只能自己编一个对象，或干脆弃权。这不是"渲染不好看"，是**任务对象缺失**。
- **证据**：该节在 verify 相位无条件注入；`prompt-sections.json` 里 3 个席位共 3 条实例全部带此串。
- **替换文本**：
  - 装配层：**没有绑定验证对象时整节不注入**（验证轮没有对象就没有这轮的意义）；
  - 若必须注入占位，正文首句改为：

```text
【求真表决 —— {{role}} {{member}} 就本轮验证对象投票】本轮的验证对象与类型见上面的【状态板】与会议帧；**不要自己编对象名**：状态板里没有对象就是本轮无对象，直接在回执里写明"本轮没有可验证对象"。
```

## A4 · 形式化归档段的形参教错，且与回执 `formal` 字段互相否定

> **状态（task-54，2026-11-06）：已修。** `v5r-verify-formal-addendum` 改教真实形参：`kind` 取 `def|lemma|proof|blocked`（定理用 `proof`）、`name` 必填、`file` 路径、`statement` 写命题原文（`target` 只是旧别名）；难度与结论写进回合字段 `formal:{decision,file,note}`（used|blocked|defect），不再说「不要用 JSON 回复块」。

- **位置**：`v5r-verify-formal-addendum`（verify ×3，183 字）
- **原文（逐字）**：
  > ``若你本轮做了形式化或给出难度判断，请用 `vibe_v5_lean_archive` 归档：参数 target、kind、``
  > ``file、note 表达同一件事（used = 归档通过的形式化；blocked = `kind:"assumption"` 并把难点``
  > `写进 note；defect = 在 note 里写明具体偏差）。不要用 JSON 回复块表达形式化结论。`
- **为什么错**：
  1. `vibe_v5_lean_archive` 的声明是 `{ kind(required), name(required), statement, target(legacy alias for statement), content, from, file, note, run }`——**必填的 `name` 没教**，`target` 是 `statement` 的旧别名（教旧名）；
  2. `used/blocked/defect` 不是 `kind` 的枚举（枚举是 `def|lemma|proof|blocked`），`kind:"assumption"` 也不存在；`defect` 应该走回执 `formal.decision`；
  3. 「不要用 JSON 回复块表达形式化结论」与 `v5r-fix-formal`（12/12）「正式结论写进回合字段 `formal:{decision,file,note}`」、`v5r-reply-formal`（12/12，209 字，给 formal 字段样例）正面冲突。
- **证据**：`vibe-math-vmu/packs/v5r/tools.js:6614-6617`（lean_archive 的 parameters）；`v5r-fix-formal` 全文见 A5；真机 `VMU_INVALID_ARGUMENT` 在 lean 面同样高发（`vibe_v5_lean_job` 730 次调用）。
- **替换文本（整节替换）**：

```text
若你本轮做了形式化或给出难度判断，请归档到可复用库：`vibe_v5_lean_archive { name, kind, file, statement, note }`——`name` 与 `kind` 必填，`kind` 取 `def|lemma|proof|blocked`（`proof` 即定理），`file` 指向已存在的 .lean（与 `from` 同义，二选一），`statement` 写这份文件形式化的命题原文（`target` 是它的旧别名，不要再用）；`blocked` 时把难点写进 `note`。**归档与回执是同一件事的两面**：形式化结论同时写进本回合回执字段 `formal:{decision:"deliverable|revise|blocked", file, note}`；只归档不回执、或只回执不归档，都只完成了一半。
```

## A5 · `v5r-fix-formal` 把 `kind` 说成能选出「集体裁决」的流程

> **状态（task-54，2026-11-06）：已修。** 改为「需要集体裁决就开一场会议：`vibe_v5_meeting` 流程由 `type` 定（ordinary/academic/debate/closure/paper/planning；辩论要 `subject`），`kind` 只是台账标签（如 verify-request），不选流程」。

- **位置**：`v5r-fix-formal`（12/12，308 字）
- **原文（逐字）**：
  > `【更正·形式化】旧说法 end_verify 与 formal_proof 在框架里不存在（旧措辞作废）。…需要集体裁决就开一场会议（vibe_v5_meeting，kind 可取 verify-request）。旧说法里「登记即直接落进 Verified/」也不对…`
- **为什么错**：`vibe_v5_meeting` 的 `kind` 确实接受 `sync|division|verify-request|solve-vote`，但它只是**台账标签**；决定流程骨架的是 `type`（`ordinary|academic|debate|closure|paper|planning`）。回执的 `typeMeans` 原话：「`type` decides the PROCEDURE … `kind` is the meeting BOARD label」。而 `verify-request` 是 debate 的派生标签（`KIND_BY_TYPE = { debate: 'verify-request', … }`）。照这句做：传 `kind:"verify-request"` 但不给 `type`，会议按 `ordinary` 走，**没有任何验证流程**；debate 又强制 `subject`，于是漏参 → `VMU_INVALID_ARGUMENT`（真机 118 次，meeting 面第一）。
- **证据**：`tools.js:3985-3987`、`:4280`（typeMeans）；`tools.js:6462`（meeting description：type 六种，debate 必须 subject 且 subject 需已完成证明）。
- **替换文本（替换该句）**：

```text
需要集体裁决就开一场 `type:"debate"` 的会议：`vibe_v5_meeting { type:"debate", subject:"<命题卡 id>", agenda:"<一句话>", member:"<你的 id>" }`；`kind` 只是台账标签（sync/division/verify-request/solve-vote），**不决定流程**——流程由 `type` 决定，`debate` 会自动记成 `kind:"verify-request"`。
```

## A6 · meeting 相位的 `v5r-turn-ask` 自相矛盾（同一段先说议程由会议帧给出，再说"没有绑定会议"）

> **状态（task-55，2026-11-06）：已修。** `v5r-turn-ask` 的 meeting 变体保留原句，追加判据句：「判据：帧里**给了会 id** 才是绑定会议。绑定时回执的 `say` 不进会议楼层——发言填回执的 `input` 字段，对全所说话或私信一律用 `vibe_v5_say`；帧里没有会 id 就是未绑定，`say` 只留在回执 notes 里不投递。」

- **位置**：`v5r-turn-ask`（meeting ×3，97 字）
- **原文（逐字）**：
  > `议程与类型由本轮会议帧给出；请按议程发言，需要发言时举手。`
  > `本回合没有绑定会议：回执里的 say 不会投递（句子只留在回执 notes 里），要对全所说话或私信请用工具 vibe_v5_say。`
- **为什么错**：同一条消息里两句互相否定。会议相位里 `v5r-meeting-ask`（meeting ×3，1 197 字）正说「会议轮请把你的发言填进 JSON 的 "input" 字段」「想发言就举手」，而这一段说"没有绑定会议、say 不投递"。模型只能二选一，选错就白发言（或去用 `vibe_v5_say` 绕开会议纪要）。
- **证据**：两节在同一组合（chair/meeting 等）同时非空；`v5r-meeting-ask` 原文见 `prompt-sections.json`。
- **替换文本（整节替换）**：

```text
议程与类型由本轮会议帧给出：请按议程发言，想发言就举手（`vibe_vmu_meeting { action:"hand", id:"<会议 id>", member:"<你的 id>" }`）。**绑定会议的回合**，回执里的 `say` 不进会议楼层——发言填回执的 `input` 字段，对全所说话用 `vibe_v5_say`。**只有没有绑定会议的心跳/推进轮**，`say` 才不投递，那时一律用 `vibe_v5_say`。
```

## A7 · 会议议程段在无会议帧时输出空占位句子

> **状态（task-55，2026-11-06）：已修（保留占位词，补空帧出口）。** 四个 `{{ setting:vmu.turn.* }}` 被 `tests/vmu-run239-prompts.test.mjs` §0g/§2c/§2f/§2g/§2h 逐字 pin（要求打印真议程/类型/主席/会 id），不能删；改为在其后追加：「上面议程/类型/主席若为「未提供」、id 为空，就是本回合没有绑定会议：先 `vibe_v5_meeting_round { meeting: "<会 id>" }` 绑下一回合，不要猜 id。」「无会议帧时整节不注入」仍属渲染层（见 §5）。

- **位置**：`v5r-turn-meeting-agenda`（meeting ×3，36 字）
- **原文（逐字）**：
  > `议程：（类型：，主席：）。本轮绑定该会议：回复第一句请写明会 id（）。`
- **为什么错**：`(类型：，主席：)` 与 `（）` 都是空值拼接；这不是"格式丑"，是**命令**（"回复第一句请写明会 id（）"）在让模型填写一个空字符串。meeting 相位里若会议帧缺失，模型会去猜会议 id（真机 `VMU_NO_SUCH_OBJECT`×72 在 `vibe_vmu_meeting` 面、×40 在 `say` 面）。
- **证据**：该节 3/3 实例均为空占位；`v5r-meeting-ask` 提供了有会议时的正确说法，二者应互斥。
- **替换文本**：
  - 有会议帧时：`议程：{{type}}（主席：{{chair}}）。本轮绑定会议 `{{meetingId}}`：回复第一句写明这个 id，**不要自己编 id**。`
  - 无会议帧时：**整节不注入**（不要输出半句）。

## A8 · 会议动作的「面」归属不清：`v5r-turn-meeting-schedule` 讲 close/attend 却不点名工具

> **状态（task-55，2026-11-06）：已修。** `v5r-turn-meeting-schedule` chair 版新增 ⑧：「面别记错：`vibe_v5_meeting` 只**召集/预约**；`close`/`attend`/`hand`/`admit`/`status`/`summary` 走 `vibe_vmu_meeting { action, id, member?, actor? }`，拿错面会被具名拒 `VMU_INVALID_ARGUMENT`。」② 原句按 pin 保留。

- **位置**：`v5r-turn-meeting-schedule`（meeting ×3，chair 1 853 字）
- **原文（逐字）**：
  > `  · ② 召集即发邀请：`vibe_v5_meeting` 的召集只对 chair 席开放（`vmu.meetings.conveneRequiresChair`）；关闭也只有 chair 能调（`closeRequiresChair`，其他席位会被具名拒 `VMU_NOT_PERMITTED` 并指出该由谁做）。`
- **为什么错**：`vibe_v5_meeting` **只召集**（外加 `rulings`/`types` 两个读）；`close`、`attend`、`hand`、`admit`、`status`、`summary` 都在 `vibe_vmu_meeting { action, id }`。这一段把 `close` 和召集写在同一句里、只点名 `vibe_v5_meeting`，模型自然照抄 → `vibe_v5_meeting { action:"close" }` 被 `validateMeetingArgs` 拒成 `VMU_INVALID_ARGUMENT`（真机 meeting 面第一，118 次）。
- **证据**：`tools.js:3701-3721`（`validateMeetingArgs`：非 `rulings/types/convene` 的 action 一律 `VMU_INVALID_ARGUMENT`，且提示语正是「this face only CONVENES」）；`tools.js:6462`（"status/summary/close/flow live on vibe_vmu_meeting"）。
- **替换文本（替换该句）**：

```text
  · ② 召集即发邀请：召集用 `vibe_v5_meeting { agenda, member, type?, subject?, at?, sequence?, lateAdmission? }`（只对 chair 席开放，`vmu.meetings.conveneRequiresChair`）。**关闭、签到、举手、放行迟到、看状态都不在这个面**：一律走 `vibe_vmu_meeting { action:"close"|"attend"|"hand"|"admit"|"status"|"summary", id:"<会议 id>", … }`（close 只有 chair 能调，其他席位具名拒 `VMU_NOT_PERMITTED`）。
```

---

# B. 矛盾

## B1 · 院士已就座时仍注入四段"本所没有院士"

> **状态（task-54，2026-11-06）：已修（两条根文本）。** `v5r-charter-division/leaderless` 改为「本所当前**没有可识别的领头人**（`vmu.turn.leaderId` 未设置或不在名册）」；`v5r-charter-roster-temp/leaderless` 改为「领头人未配置（`vmu.turn.leaderId` 未设置或不在名册）：除雇主外，组织协调由全体有表决权者商议，你不必向某个院士汇报」。`v5r-fix-leader-id` 的更正段按测试 pin 保留旧句作反例。

- **位置**：`v5r-charter-division-leaderless`(119)、`v5r-charter-rule-7-leaderless`(79)、`v5r-charter-truth-note-leaderless`(109)、`v5r-charter-taskboard-leader-leaderless`(138)——**12/12 全组合**（chair/member/temp × 四相位）
- **原文（逐字）**：
  > `本所没有**外部**派活：做什么、往哪走，由所内自己决定。本所当前**没有在册院士**，组织与协调由**全体有表决权者共同商议**（所办代表外部）；…`
  > `  7. **主动在群聊里汇报**：本所没有院士替你统筹，你不说别人就无从与你协作；…`
  > `  · 任务是**协调工具**而非派活指令：本所没有院士，认领与否、做什么，靠你们自己协商决定；…`
- **为什么错**：同回合 `v5r-charter-opening`（chair，87 字）：「你是「institute」的**院士**，本所的领头人与组织协调中心」；`v5r-charter-roster`（chair，460 字）：「**院士 r-acad（你）** —— 本所领头人」；`v5r-turn-acad-leads` 还在教院士统筹全所。四段 leaderless 文字**只应在 `hasLeader=false` 时出现**，现在无条件注入（`v5r-fix-leader-id` 甚至还在括注里承认这句旧说法）。
- **证据**：`prompt-sections.json` 里四节各 12 条实例、每组合都有；`v5r-fix-leader-id` 末句：「（旧说法「本所当前没有在册院士」现由 `leadership.code` 点名，读到就去补数据。）」——说明作者知道它与数据冲突，但用"旧说法"标签放过了。
- **替换文本**：
  - 装配层：四节统一由 `hasLeader` 门控，`hasLeader=true` 时**整节不注入**；
  - 若确需保留提示，四节合并为一段（并明确条件）：

```text
【领头人缺位时】若 `vibe_v5_overview.leadership.code` 非空（如 `chair-seated-but-leaderId-empty`），说明院士席有人但 `vmu.turn.leaderId` 没写：先 `vibe_v5_set { key:"vmu.turn.leaderId", value:"<同一代号>", why:"安置院士" }` 修数据。只有**确实没有在册院士**时，才由全体有表决权者共同商议组织工作；组织归集体，判断仍属于每个人自己。
```

## B2 · 库的写法：一段说"直接用 fs 写"，另一段说"最稳是写进回执由所办登记"

> **状态（task-55，2026-11-06）：已修。** `v5r-charter-libraries` ③ 改为：「落盘两条路：`vibe_v5_record_*` 直接登记（回执给 `recordId`，进记录本，别人与所办看得见）；或 fs 写 `Members/<你>/…`（只是**草稿区**，不进记录本）。要立项/被引用/进会议材料**必须**走 `vibe_v5_record_*`，并以回执的 `recordId` 为证。」

- **位置**：`v5r-charter-libraries`（12/12，chair 1 301 / member 1 298 字） vs `v5r-fixture-tools`（12/12，2 447 字）
- **原文（逐字）**：
  > `  三条硬要求：① 凡入库必须写明 **价值程度 / 动机用途计划 / 你对该对象为真的概率估计**（缺一不可）；② **只写自己的库**（读别人的库允许且鼓励）；③ 推荐**直接用 fs 写你自己的文件**（路径必须带成员库根：Members/<你>/…）；vibe_v5_record_* 只是便捷记录器，不是必需。`
  > （fixture-tools）`要把结论正式立项，最稳仍是把卡片素材写进**回执**，由**所办**核对后记进研究所记录本——两种情况都以回执的 `libraryRoot` / `recordId` 为证，不要凭「我写过了」或「大概是私有的」下判断。`
- **为什么错**：两句本身都能自圆其说（fs 写的是工作稿、记录本要登记），但**没有一句话把关系说穿**：模型读到「不是必需」就不再调 `vibe_v5_record_*`，而任务板/引用/所办看到的是记录本——结果就是"我写了但研究所不知道"。真机 FEEDBACK63 第 9 条正是"成员回合自己写卡/改共享草案，所办只能从 records/文件反推"。
- **证据**：`v5r-fixture-tools` 的"记录本契约"整段（★ 段）；`v5r-charter-libraries` ③；FEEDBACK63 ①.9。
- **替换文本（替换 charter-libraries 的 ③ 句）**：

```text
③ 落盘两条路：`vibe_v5_record_*` 直接登记（会拿到 `recordId`，进研究所记录本，别人与所办看得到）；或直接 fs 写 `Members/<你>/…`（那是**你自己的草稿区**，不进记录本）。要立项/被引用/进会议材料，必须走 `vibe_v5_record_*`；以回执的 `libraryRoot`/`recordId` 为证，不要凭「我写过了」下判断。
```

---

# C. 时机或位置不对

## C1 · 验证轮的标题仍写「第 1 轮」，会议标题多一个空格

> **状态（task-56，2026-11-06）：已修。** 给 `v5r-turn-heading` 补了 `verify` 变体（`【验证轮 —— {{ roleLabel }} {{ member }}】`，此前 verify 轮渲染的是 normal 的「第 N 轮」）；会议标题改为 `【研究所会议{{ setting:vmu.turn.meetingId }} · 进行中 —— …】`，用 ` · ` 消掉 id 为空时的双空格。**未按建议删 `{{ setting:vmu.turn.meetingId }}`**：`tests/vmu-turn.test.mjs` T108–T110 要求该 per-turn 事实可注入覆盖，删了会三红。verify 轮净增约 14 字（三个席位各一次），normal/meeting 不变。
- **位置**：`v5r-turn-heading`（12/12；verify 复用 normal 文本）
- **原文（逐字）**：
  > `【第 1 轮 —— 院士 r-acad】`（verify 相位同此）
  > `【研究所会议  进行中 —— 院士 r-acad】`（两个空格）
  - 对照：checkpoint 是 `【心跳检查 —— 院士 r-acad】`。
- **为什么错**：`verify` 是验证轮（`v5r-verify-core` 同时注入），标题却告诉模型"第 1 轮"——模型会把验证轮当普通首轮推进；双空格是拼装残留（`研究所会议` 与 `进行中` 之间）。
- **证据**：heading 的 6 个唯一变体（normal 20 / meeting 25 / checkpoint 19 各按席位微差）；verify 无独立变体。
- **替换文本**：

```text
normal：     【第 {{round}} 轮 —— {{role}} {{member}}】
meeting：    【研究所会议 进行中 —— {{role}} {{member}}】
checkpoint： 【心跳检查 —— {{role}} {{member}}】
verify：     【验证轮 —— {{role}} {{member}}】
```

## C2 · `v5r-verify-reconsider` 是拼接残句，且"弃权以保证不出结论"是危险指令

> **状态（task-56，2026-11-06）：已修。** 整节重写为「新规则 + 旧句逐字保留并前置『勿照做』」：旧的两句被 `tests/vmu-prompt-type-coverage.test.mjs` 的 `isCorrectedTeachingLedger`（测试内硬编码 13 条正则）逐字认领，删了会报 `unexplained`；现在它们作为「作废措辞」留在更正语义里，新规则给出「弃权必须给出独立理由，不得以弃权代替判断」的出口。137→364 字（仅 verify 轮）。
- **位置**：`v5r-verify-reconsider`（verify ×3，137 字）
- **原文（逐字）**：
  > `你可以维持、修改或反驳任何人的看法。`
  > `审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。`
  > `「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）。本档没有门禁：请务必给一个严格介于 0 与 1 之间的弃权值，以保证本轮无法得出一致结论；`
- **为什么错**：第 2、3 行是从别的段落剪下来的残句（缺主语、缺条件），读者拼不出因果。更严重的是最后一句在**教模型用弃权来阻止结论**——与 `v5r-verify-core`「本所宁可留下未定论，也不要一个骗人的结论」是两回事：这里是在说"为了保证不出一致结论，务必给弃权值"，等于教它操纵计票。
- **证据**：文本断句明显（第二句无主语）；`v5r-verify-core` 同相位并置。
- **替换文本（整节替换）**：

```text
你可以维持、修改或反驳任何人的看法。本轮是**验证轮**：审查对象从"推导是否正确"变成"Lean 代码是否忠实于命题"。若你认为某条"已通过"的结论其实不成立（或代码与命题不符），**不要用弃权来卡住流程**——给 `vibe_v5_verdict` 一个你相信的概率并写清理由，框架会把它记为 pending、撤回该条证明并写入形式化待办。只有**你确实无法判断**时，才给一个严格介于 0 与 1 之间的值。
```

## C3 · 形式化的操作细节在 12/12 全相位都讲，验证轮反而讲两遍

> **状态（task-56，2026-11-06）：部分已修（降级）。** `v5r-formal-work` 659→427（删掉与 `v5r-formal-plan`/`verify-formal-addendum` 重复的 import 路径、后台队列、审核次序细节，保留判断标准与两条诚实规则）。**`v5r-formal-work-rendered`（469 字，仅 verify）未删**：它的正文含字面 `<VIBEMATH>` 且被 `tests/vmu-prompt-type-coverage.test.mjs` 的语料行正则认领，删行即红；要根治须把它并进 `v5r-verify-formal-addendum` 的渲染层（机制，非本写域）。
- **位置**：`v5r-formal-work`（12/12，659 字） vs `v5r-formal-plan`（verify ×3，830） vs `v5r-formal-work-rendered`（verify ×3，469）
- **原文（逐字）**：
  > （formal-work）`新定义用 Lean 形式化定义并归档到全局可复用库（vibe_v5_lean_archive kind='def'），已成立的引理归到 Proved/`
  > （formal-plan）`  · 工具：vibe_v5_lean_run（执行）· vibe_v5_lean_archive（归档）· vibe_v5_lean_lib（查已有可复用库）`
  > （formal-work-rendered）`可复用定义放 <VIBEMATH>/Formal/Lib/，已证引理放 <VIBEMATH>/Formal/Proved/；写之前先 vibe_v5_lean_lib 查重。`
- **为什么错**：normal/meeting/checkpoint 的回合也读 659 字 Lean 归档流程——这些回合根本不该开 Lean；而 verify 轮同时读 659+830+469=1 958 字讲同一件事，且 `<VIBEMATH>` 占位符没被替换（formal-plan 说"库根＝仓库里的 `VibeMath/`"，两边写法不一致）。
- **证据**：三节的出现相位（12/12、verify、verify）；`v5r-formal-work-rendered` 的字面 `<VIBEMATH>`。
- **替换文本**：
  - `v5r-formal-work` 在非 verify 相位缩成两句（12/12 恒定省 ≈ 450 字/回合）：

```text
要长期复用的定义/引理才形式化：先 `vibe_v5_lean_lib` 查重，再 `vibe_v5_lean_run` 跑通，最后 `vibe_v5_lean_archive` 归档（`name/kind/file/statement` 必填）。非验证轮不必每次都开 Lean——先把数学做对。
```

  - verify 相位只保留 `v5r-formal-plan` 一份，`v5r-formal-work-rendered` 删除（其内容已被 plan 覆盖；若保留，`<VIBEMATH>` 必须替换为库根实际值）。

## C4 · temp 读 887 字"院士的七条组织职责"

> **状态（task-56，2026-11-06）：已修。** `v5r-charter-org` 的 temp 变体 887→345：删掉七条院士组织职责与四条主席边界，改成「你没有组织职责；被邀请就赴会、被指派就做事、有异议走回执留痕」，保留 `tests/vmu-turn.test.mjs` `KNOWN_UNBASELINED` 认领的首行措辞。chair 变体 808、member 变体 820 未动（它们本来就该读这些职责）。
- **位置**：`v5r-charter-org`（temp 887 / member 820 / chair 808，12/12）
- **原文（逐字，temp 版与 member 版几乎相同）**：
  > `    ② **规划与分派**：把原问题拆成值得做的工作，作为**任务**分派给合适的成员（含临时工）。分派是它的职责，不是越权；`
  > （temp）随后是「对**你**（非院士）的要求：· 主动汇报…· 接受分派，但不要盲从…」
- **为什么错**：temp 没有管理权、也不能参会/投票，却先读 7 条"领头人该做什么"，再读"接受分派"——其中"②规划与分派""④协调资源""⑤主持会议"对 temp 都是别人的动作。temp 的 normal 回合总长 23 433，这一节占 3.8%。
- **证据**：`v5r-charter-voting` temp 版只有 132 字（同类节做到了按席位裁剪）；`v5r-charter-org` temp 却最长。
- **替换文本（temp 变体整节替换）**：

```text
【四、所内的组织与协调】**你没有组织职责**：任务由院士/所办分派，你只负责把自己那份做完并如实汇报。
  · 接到任务先读验收标准；不清楚就向雇主问清，不要自己改方向；
  · 卡住就在 progress 里写清阻塞与下一步（这比硬撑有用）；
  · 不要替别人分派、不要动任务板、不要改别人的进度/状态板；发现重复劳动，告诉雇主。
```

## C5 · 「更正·领头人」历史说明常驻 12/12

> **状态（task-56，2026-11-06）：部分已修（降级）。** `v5r-fix-leader-id` 节内压缩，但**不能删**：`tests/vmu-prompt-corrections.test.mjs:63-69` 要求五节都在、`oldNeedles` 逐字含「没有在册院士」「vmu.turn.leaderId」「vibe_v5_configure」「leadership.code」，且每节 ≤400 字。本批五段更正合计 1 485→1 232（各节都保住 marker + needles）。要真正按相位裁剪得改更正段的装配策略（`v5r-corrections.js` 的 phase 门控 + 测试契约），属机制层。
- **位置**：`v5r-fix-leader-id`（12/12，389 字）
- **原文（逐字）**：
  > `【更正·领头人】「领头人」＝`vmu.turn.leaderId`（默认空）。`vibe_v5_start` 坐好院士席时会**自动**写入；手动 `hire` 到 chair 席位**不会**——那就自己 `vibe_v5_set { key:"vmu.turn.leaderId", value:"<同一代号>", why:"安置院士" }`…`
  > `（旧说法「本所当前没有在册院士」现由 `leadership.code` 点名，读到就去补数据。）`
- **为什么错**：这是给"旧措辞作废"做解释的段落，属于历史包袱；且末句正是 B1 的免责条款（用"旧说法"把矛盾合法化）。每个席位每回合都读 389 字讲一个**配置项**。
- **证据**：12/12；与 B1 四段的冲突点直接相关。
- **替换文本**：

```text
【领头人】`vibe_v5_overview.leadership.code` 非空即说明领头人数据有问题（如 `chair-seated-but-leaderId-empty`）：用 `vibe_v5_set { key:"vmu.turn.leaderId", value:"<院士代号>", why:"安置院士" }` 修数据，不要改章程措辞。
```

> 更彻底的做法：这条只在 `leadership.code` 非空时由宿主注入一句话（机制），常驻提示词里删掉。

---

# D. 无关冗长 / 重复

## D1 · `v5r-reply-compact` 含"上面这句是捕获原文"的元话语，且与另外四节重复讲回执

> **状态（task-56，2026-11-06）：部分已修（降级）。** 删掉「上面这句是捕获原文」「下面是 v5r-reply-channel.js 渲染的清单」两条元话语与重复的回执复述，3 208→3 096。**被 `tests/vmu-run144-reply-routes.test.mjs:168` 逐字 pin 的两段捕获原文未动**；`replyChannelLines()`/`replyCatalogueLines()` 的渲染体也在渲染层，未改。
- **位置**：`v5r-reply-compact`（12/12，3 208 字——全提示词最长单节）
- **原文（逐字）**：
  > `（上面这句是捕获原文；字段形状以上面 v5r-reply-channel.js 渲染的清单为准：record 是研究日志**一行** {track,text} → Members/<你>/Progress/<track>.md；成果卡不是回执字段…）`
  > `（上面这句也是捕获原文；这三件事都**不是回执字段**：完成/改任务用 `vibe_v5_task_update`，异议用 `vibe_v5_record_progress`（track "obstacles"）记账…）`
- **为什么错**：提示词里出现"捕获原文""v5r-reply-channel.js 渲染的清单"这种**构建期元话语**，把读者当成读测试夹具的人。同一批规则还在 `v5r-fixture-tools`(2 447)、`v5r-fix-json-reply`(293)、`v5r-turn-tool-receipt`(181)、`v5r-charter-context`(205) 里各讲一遍——五处相加 ≈ 6 300 字，其中至少 1 200 字是重复。
- **证据**：五节出现次数均 12/12；`v5r-reply-compact` 与 `v5r-fixture-tools` 都含"回执就是本次回复正文"的等价句。
- **替换文本（删两段元话语，换成一段结论；其余四节见 D3/D8 合并）**：

```text
（回执字段以上面的字段表为准；表外键会被具名拒 `VMU_TURN_FIELD_NOT_APPLICABLE`。`record` 是研究日志一行 `{track,text}`（落在 `Members/<你>/Progress/<track>.md`）；成果卡、任务完成、异议都不是回执字段——分别用 `vibe_v5_record_proposition` 等、`vibe_v5_task_update`、`vibe_v5_record_progress`（track "obstacles"）。`say` 只在绑定会议的轮次进会议楼层，其余情况用 `vibe_v5_say`。）
```

> 目标：3 208 → ≤2 000 字，删掉"捕获原文"两段后即可达成。

## D2 · `v5r-fixture-tools` 与 D1 重复，且"记录本契约"段落带测试语境

> **状态（task-56，2026-11-06）：已修。** 2 447→2 267：「SLV 夹具约束」的验收语境词与「记录本契约」重复解释压掉，保留 `libraryRoot`/`recordId` 判据、三句 pin（`上表是职责说明`、`回执样例（可直接照抄）`、`以【本轮你实际能调用的工具】为准`）与回执样例。
- **位置**：`v5r-fixture-tools`（12/12，2 447 字）
- **原文（逐字）**：
  > `【SLV 夹具约束｜本轮调用工具】`
  > `本轮**可以且应该**调用你自己的工具：边做边记，不要把动作攒到回合末尾。`
  > `★ 记录本契约（机制边界，不是建议）：**先确认你的记录本落在哪个库根…**`
- **为什么错**："SLV 夹具约束"是研究与验收语境的词，对操作者是噪音；"记录本契约"与 B2/D1 重复。真正不可删的是「本轮可以且应该调用工具」这一句（与 A1 对冲），其余可压缩。
- **证据**：与 `v5r-charter-libraries` ③、`v5r-reply-compact` 字段表重叠。
- **替换文本（首句 + 记录本契约压缩）**：

```text
【本轮工具】本轮可以且应该调用你自己的工具：边做边记。写进记录本还是写进回执，以回执的 `libraryRoot`/`recordId` 为证：同一个库根 ⇒ 研究所已登记；另一个根 ⇒ 只是你的草稿。
```

## D3 · 五段「更正·」共 1 485 字，讲的是"旧措辞作废"

> **状态（task-56，2026-11-06）：部分已修（降级）。** 合计 1 485→1 232（`v5r-fix-formal` 399、`v5r-fix-leader-id`、`v5r-fix-m-vote`、`v5r-fix-json-reply`、`v5r-fix-tool-help` 各自缩一到两档）。**不能按建议「合一/删节」**：`tests/vmu-prompt-corrections.test.mjs:63-69` 要求五节五 marker 全在、needles 逐字、每节 ≤400 字、order 890-894，`SUPERSEDES` 还要求四段所属 marker 在真实装配里。
- **位置（12/12 全部）**：`v5r-fix-leader-id`(389)、`v5r-fix-m-vote`(309)、`v5r-fix-formal`(308)、`v5r-fix-json-reply`(293)、`v5r-fix-tool-help`(186)
- **原文（示例，逐字）**：
  > `【更正·m 票】旧说法「按 m 票布尔一致决定 / 凑够 m …`
  > `【更正·回复形状】旧措辞「每轮手写一段 json 代码围栏只适用于子代理交付」说反了：…`
- **为什么错**：这些都是"以前的提示词错了，现在改成…"的说明，对**新模型**没有信息价值——正确规则已在正文（charter-voting、reply-compact、fix 指向的章节）。留着只会让模型读到两种说法并试图调和。
- **证据**：五节 12/12 合计 1 485 字；`v5r-fix-formal` 本身还教错了 `kind`（A5）。
- **替换文本**（删五节，保留一条总表，进 docs 供人读）：

```text
【旧措辞】以下旧名/旧说法已作废，见到按右边处理：end_verify、formal_proof → 用回执字段 `formal:{decision,file,note}`；"按 m 票布尔一致" → 用 `vibe_v5_verdict` 给概率、`vibe_v5_verdict_final` 汇总；"围栏只适用于子代理" → 围栏就是成员回执正文；手写工具清单 → 以本回合工具表为准。
```

## D4 · Lean 归档讲三遍（同 C3），此处只记篇幅账

> **状态（task-56，2026-11-06）：随 C3 一并处理（部分）。** `v5r-formal-work` 已瘦身；`v5r-formal-work-rendered` 按 C3 的理由保留。
- **位置**：`v5r-formal-work` 659（12/12）+ `v5r-formal-plan` 830（verify）+ `v5r-formal-work-rendered` 469（verify）
- **原文**：见 C3。
- **建议**：按 C3 的替换文本执行——非 verify 只留两句，verify 只留 `formal-plan` 一份。预计每回合省 450（12/12 部分）+ verify 轮再省 469。

## D5 · `v5r-math-rules` 与 `v5r-turn-compute` 都介绍 mathtools

> **状态（task-56，2026-11-06）：已修。** `v5r-math-rules` 467→123，只留「mathtools 是沙箱里的计算工具、重跑要一致、结果归档进记录本」三句，讲解细节归 `v5r-turn-compute`（后者未加字）。
- **位置**：`v5r-math-rules`（12/12，467 字） vs `v5r-turn-compute`（12/12，483 字）
- **原文（逐字）**：
  > （math-rules）`- 需要精确数值、符号化简、反例搜索、统计或线性代数时用 `vibe_vmu_mathtools`：先 action: plan 看计划与沙箱上限，再 action: run 执行，并把回执路径写进报告；…`
  > （turn-compute）`【计算与引擎】`vibe_vmu_mathtools`（plan/run/…）与 `vibe_vmu_mathjobs`；**引擎由宿主注入**（无代码默认值），状态报 `engines`/`available`，接缝缺失时具名拒 `VMU_ENGINE_UNAVAILABLE`，不假装算过；shell 兜底不算归档。…`
- **为什么错**：同一回合两节讲同一对工具；`math-rules` 的第二条（plan/run/receiptsView/status、缓存、归档）与 turn-compute 的"引擎由宿主注入/回执同形/valueMissing"信息不重叠但顺序割裂——读者要自己合并。
- **证据**：两节均 12/12；`turn-compute` 覆盖更全（含 `mode:"expr"` 的坑）。
- **替换文本**：删 `v5r-math-rules`，把其独有的一句并进 `turn-compute` 开头：

```text
【计算与引擎】`vibe_vmu_mathtools`（action: plan|run|receiptsView|cacheView|status）与 `vibe_vmu_mathjobs`（后台数学作业）：先 `plan` 看计划与沙箱上限，再 `run` 执行，把回执路径写进报告；复核他人数值结论用同一脚本（`cacheKey` 相同）重跑。引擎由宿主注入…（后接原文）
```

## D6 · `v5r-turn-tracks` 与 `v5r-turn-board` 重复讲状态板

> **状态（task-56，2026-11-06）：已修。** `v5r-turn-board` 679→538：删掉设置解析、「什么时候刷新」与席位差异三条（这些在 `v5r-turn-tracks` 讲），保留 `tests/vmu-run33-p2-teaching.test.mjs` pin 的四行名、「该来源未提供」「唯一来源」「不要自己另立一套」。
- **位置**：`v5r-turn-tracks`（12/12，881 字） vs `v5r-turn-board`（12/12，679 字）
- **原文（逐字）**：
  > （tracks）`  · `[状态板]` 四行是**派生读数**：要么带内容时间（`（读于 …）`），要么具名说「时间未提供：为什么」。state 面板自己写：**成员席位只能改自己的**，**所办/人类代笔**可代写这几行**读数**并回执 `panelOwner`（仅读数，不含学术动作）；…`
  > （board）`【状态板】每轮提示里有一段 `[状态板]`，四个字段各有**唯一来源**，请直接引用它，不要自己另立一套：…`
- **为什么错**：两节都在解释"状态板四行从哪来、缺了怎么写"，措辞不同、规则交叠。合计 1 560 字 ≈ chair normal 的 4.8%。
- **证据**：两节 12/12。
- **替换文本（保留 tracks 的字段清单与写入规则，board 只留一句指针）**：

```text
【状态板】每轮提示里的 `[状态板]` 四行各有唯一来源，直接引用、不要另立一套；某行写「该来源未提供：<原因>」时先补来源（写 progress/建任务/请所办说明），下一轮再引用新读数。写入规则与 `track:"state"` 的四项必填见【轨迹与状态板】。
```

## D7 · 三份工具长清单（审计时 5 248 / 2 651 / 1 349 字，复查时 5 466 / 2 844 / 1 542），模型读的是"目录"不是"用法"

> **状态（task-56，2026-11-06）：未做（降级，出写域）。** 三份工具清单的 `·` 行由 `vibe-math-vmu/packs/v5r/middleware/seat-faces.js` 的 `seatBulletLines()` 渲染，`tests/vmu-v5r-tools.test.mjs:1929-1932` 要求它们逐字等于渲染结果（`tests/vmu-run31-seat-faces.test.mjs` 双向比对），`prompt-sections.mjs:80-91` 的 13 条 PINNED_MARKERS 也钉住其中若干句。要瘦身必须同时改 `seat-faces.js` 与两侧测试，属 kernel/tools 写域，本批按规则未碰。
- **位置**：`v5r-tools-academician`（chair 4/4 相位，审计时 5 248 / 复查时 5 466 字）、`v5r-tools-researcher`（member，2 651 / 2 844）、`v5r-tools-temp`（temp，1 349 / 1 542）
- **原文（示例，逐字）**：
  > （tools-academician）`vibe_v5_meeting —— 召会（agenda 必填…）`
  > （tools-researcher）`vibe_v5_verdict_ask —— …`
- **为什么错**：清单把每个工具名 + 一句用途铺开，占了 chair 提示词 16%、member 10%。而工具**形参**仍要去 `vibe_v5_tool_help` 或回执里学；真机拒绝码第一的 `VMU_INVALID_ARGUMENT` 恰恰是形参错。清单越长，模型越容易"照名字猜形参"。
- **证据**：字数见上；真机 `VMU_INVALID_ARGUMENT` 在 meeting/paper/task_update/blueprint 四个面共 200+ 次。
- **替换文本（三节替换为同一段 + 按席位的"你不能做什么"）**：

```text
【工具】本回合可用工具以宿主注入的工具表为准（名字、说明、形参都在里面）；拿不准形参就调 `vibe_v5_tool_help { tool:"<名字>" }`，不要照名字猜。你的席位：{{seatCapabilities}}。
```

> 机制建议：这份清单位于工具声明之上是**双源**，应由声明自动生成或干脆删掉，见 §5。

## D8 · 记录本/库根的解释在三节里各写一遍

> **状态（task-56，2026-11-06）：已修。** 按「库根/记录本只在 `fixture-tools` 讲一次」执行：`v5r-fixture-tools` 保有完整判据（2 267），`v5r-charter-libraries` 只留三条硬要求 + 指针（1 356→1 280/1 277），`v5r-reply-compact` 的回执字段表不再复述库根。
- **位置**：`v5r-charter-libraries`(1 301)、`v5r-fixture-tools`(2 447)、`v5r-reply-compact`(3 208)
- **原文**：见 B2、D1、D2。
- **建议**：与 B2 一起改——库根/记录本只在 `fixture-tools` 讲一次（D2 的替换文本），`charter-libraries` 只讲"三条硬要求"，`reply-compact` 只讲回执字段表。合计可省 ≈ 600 字。

---

# E. 缺失（真机高频拒绝码没有对应指引）

> 判据：`D:/_tmp/sim/real-stats.md` 里出现 ≥10 次、且当前 12 份装配中没有任何一节能解释"怎么避免"的拒绝码。

## E1 · `VMU_CHAIR_ACT_NOT_DELEGATED`（真机 59 次）：没人告诉"以主席名义动作前要先给主席派回合"

> **状态（task-55，2026-11-06）：已修。** `v5r-turn-meeting-schedule` chair 版 ⑨ 首句：「以**主席名义**的动作（召集、裁决、放行迟到）不能代做：先 `vibe_vmu_turn { op:"drive", member: "<院士 id>" }` 给院士派一回合，否则具名拒 `VMU_CHAIR_ACT_NOT_DELEGATED`。」（`assistant.json` 的所办身份段已有同义句，未改。）

- **证据**：meeting 面第三高拒绝码；`v5r-turn-meeting-schedule`、`v5r-turn-meeting-chamber` 都没有这句话。
- **建议插入**（`v5r-turn-meeting-schedule` ② 末句）：

```text
以**主席名义**的动作（召集、裁决、放行迟到）不能由别人代做：若操作者不是你，必须先用 `vibe_vmu_turn { op:"drive", member:"<院士 id>" }` 给院士派一回合，由他自己做完；否则具名拒 `VMU_CHAIR_ACT_NOT_DELEGATED`。
```

## E2 · `VMU_NO_SUCH_OBJECT`（say 40 次 + vmu_meeting 72 次）：没有"先读状态块取真 id"的规矩

> **状态（task-55，2026-11-06）：已修。** `v5r-turn-tool-receipt`（12/12，181→270 字）追加：「id 照读面抄（`vibe_vmu_meeting`/`vibe_vmu_turn` 的 `status`），自造 id 拒 `VMU_NO_SUCH_OBJECT`。」没有新开 `v5r-turn-channels` 节（装配顺序不在本批写域）。

- **证据**：两个面合计 112 次；`v5r-turn-ask`/`v5r-meeting-ask` 只教"用 say/attend"，没教 id 从哪来。
- **建议插入**（`v5r-turn-channels`，230 字，12/12）：

```text
成员、会议、任务、轮次的 id 一律从本回合状态块/回执里**照抄**，不要自己编；拿不到 id 就先读状态（`vibe_v5_overview`、`vibe_vmu_meeting { action:"status" }`），再动作——自造 id 会被具名拒 `VMU_NO_SUCH_OBJECT`。
```

## E3 · `VMU_OFFICE_CONSULT_REQUIRED`（paper 58 次）：提示词里没有 consult 流程

> **状态（task-55，2026-11-06）：已修。** `v5r-paper-final` 新增「★ 所办问询门」条：被 `VMU_OFFICE_CONSULT_REQUIRED` 拦时按拒里的 `requestId`/`target`，由所办用 `vibe_v5_paper { action:"consult", target, member:"<所办 id>", request_id, answer }` 答复后重试 `final`；普通成员答复被 `VMU_NOT_PERMITTED` 拒。原末句「其他席位与所办调用都会被具名拒绝」改为「其他席位调用会被具名拒」（所办现在可走 consult 答复）。

- **证据**：`v5r-tools-academician` 只列 `vibe_v5_paper` 的名字；`v5r-paper-*` 在本夹具未注入（chars=1），无法逐字审。真机 paper 面 `VMU_PACK_V5R_CORE_PAPER_STATE`×99 与 consult×58 说明流程/问询两块都在教。
- **建议**：paper 相位装配后补一节（或并入 `v5r-paper-final`）：

```text
定稿被 `VMU_OFFICE_CONSULT_REQUIRED` 拦时，回执会给 `requestId`：把它交给所办（`vibe_v5_paper { action:"consult", request_id, member:"<所办 id>", answer:"<核对结论>" }`），答完重试 `action:"final"`。普通成员答会被 `VMU_NOT_PERMITTED` 拒。
```

> 需在下一轮**带上 paper 上下文**重装配一次再定稿这段（本夹具无法验证 paper 节内容）。

## E4 · `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（43 次）：只说了"辩论必须给 subject"，没说 subject 必须证明完成

> **状态（task-55，2026-11-06）：已修。** 并入 `v5r-turn-meeting-schedule` chair 版 ⑨ 后半：「辩论的 `subject` 必须是**证明已完成**的命题卡（`proofRef`+`proofState:"complete"`、已进 verified，或跑通的 Lean 结果）或 `subject_evidence.file`；否则具名拒 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`。」① 的分句式替换未做（① 有 pin），改在 ⑨ 集中讲条件。

- **位置**：`v5r-turn-meeting-schedule` ①（chair，1 853 字）
- **原文（逐字）**：
  > `会议类型六种：`ordinary`｜`academic`｜`debate`（**必须**给 `subject`）｜`closure`｜`paper`｜`planning`；…辩论须先给 `subject`，…`
- **为什么错**：工具声明的条件更严：「a debate REQUIRES subject — a card id whose written proof is finished (proofRef + proofState:"complete", or a verified row / a passed Lean run) or a file reference…because a one-line proposition has no addressable proof carrier」。提示词漏掉"证明已完成"这半句，模型就会拿一张刚写的、只有 statement 的卡去开辩论。
- **证据**：`tools.js:6462`；真机 `DEBATE_SUBJECT_NO_PROOF`×43。
- **替换文本（替换该分句）**：

```text
`debate`（**必须**给 `subject`：一张**证明已完成**的命题卡 id——`proofRef`+`proofState:"complete"`，或已进 verified 的行，或跑通的 Lean 结果；一句话命题没有可寻址的证明载体，会被具名拒 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`）
```

## E5 · `VMU_RULING_ALREADY_FILED`×14 / `VMU_RULING_CHAIR_SIGNS`×10：裁决的"一次一人一票、主席只签 final"没说

> **状态（task-55，2026-11-06）：已修。** `v5r-charter-voting` chair 版与 researcher 版各加一条：「同一场会议、同一个对象每人只投一次（重复投具名拒 `VMU_RULING_ALREADY_FILED`）；要改裁决只能给主席……」并把「主席只签 `vibe_v5_verdict_final`、代写成员数字被 `VMU_RULING_CHAIR_SIGNS` 拒」写进同一段。

- **证据**：verdict 面两个码合计 24 次；`v5r-charter-voting` 讲了门槛，没有讲重复投票与主席署名边界。
- **建议插入**（`v5r-charter-voting`，chair 版，末条前）：

```text
同一场会议、同一个对象，每人只投一次（重复投票会被具名拒 `VMU_RULING_ALREADY_FILED`）；主席不投普通票，只签 `vibe_v5_verdict_final`（以主席名义代替成员交裁决会被 `VMU_RULING_CHAIR_SIGNS` 拒）。要成员交裁决，先 `vibe_v5_verdict_ask`。
```

---

## E6 · 回合循环卡住（`turnLoop.inFlight` 常驻、重试只换来 `VMU_TURN_REENTRANT`）：没有一节教怎么读循环状态、怎么按名关轮

> **状态（task-55，2026-11-06）：已修（新增一节）。**
- **证据**：真机 RUN 64 出现 `turnLoop.inFlight:true` 而持久账本 pending:0 的长期抱锁，模型反复重试只拿到 `VMU_TURN_REENTRANT`；`v5r-turn-tracks` 只讲回执，没有讲循环本身。
- **落点**：新增 `v5r-turn-loop-stuck`（order 838，kind `phase`，`scope:{phase:['normal']}`，**531 字**，只进 normal 3 个组合；首版漏写 scope 曾 12/12 全注入，实测后修正）。
- **正文（逐字，`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:1071-1092`）**：

```text
【回合循环卡住了怎么办】读 `vibe_vmu_turn { op:"status" }.turnLoop`：`inFlight` 是本内核的**单轮锁**、不是账本承诺（`turnInFlightMeans`：`human.recover` 读耐久账，可与锁并存）；`inFlightTurn`/`inFlightMember`/`inFlightOpenedBy`/`inFlightForMs`＝哪轮/谁开/锁时，`abandonAfterMs`＝上限，`wakeQueue`/`recentAbandonments`＝排队/最近关的轮。
  · 连续两次 `VMU_TURN_REENTRANT` 就**不要第三次重试**：`vibe_vmu_turn { op:"abandon", turn:"<inFlightTurn>", why }` 按名关掉：该行变 `status:"abandoned"` + `VMU_TURN_ABANDONED`、释放锁、报告**不应用**；给错 id 读 `status:"open"` 的行或 `inFlightTurn`。
  · 只关抱锁那一轮；关完读 status 确认 `inFlight:false`。
```

# 4. 换算成预算

| 改动 | 影响的组合 | 预计省字（每回合） |
|---|---|---|
| A1 资源段（不渲染 0） | 12/12 | ≈ −20 |
| C3/D4 Lean 三段合并 | 12/12 −450；verify −469 | −450 ~ −919 |
| D1 reply-compact 删元话语 | 12/12 | ≈ −1 100 |
| D2 fixture-tools 压缩 | 12/12 | ≈ −900 |
| D3 五段更正合一 | 12/12 | ≈ −1 300 |
| D5 math-rules 合并 | 12/12 | ≈ −450 |
| D6 board 并入 tracks | 12/12 | ≈ −550 |
| D7 工具清单 | chair −5 200；member −2 600；temp −1 300 | 大 |
| C5 fix-leader-id | 12/12 | ≈ −300 |
| C4 temp charter-org | temp 4/4 | ≈ −600（temp） |

只做 D1–D6 + C3 + C5（不动工具清单）⇒ 每回合约 −4 800。以审计快照为基线：chair normal 32 442 → ≈ 27 600，chair verify 36 279 → ≈ 31 400；以 01:00 复查快照为基线：chair normal 30 860 → ≈ 26 000，chair verify 34 413 → ≈ 29 500。这也是把 chair 压进 30 000 的唯一现实路径（D7 若交给机制生成，可再 −5 000；复查快照里 D7 三份已增到 5 466 / 2 844 / 1 542 字）。

# 5. 应由机制保证、不是文案能修的

1. **模板变量渲染**：`{{toolBudget}}→0`、`{{memMB}}→0`、`{{subject}}→(unspecified)`、`{{meetingId}}→空`、`<VIBEMATH>` 未替换。缺值时应当**不渲染该句/该节**，而不是渲染成 0 或 unspecified。渲染层需要"变量缺失即省略 + 构建期断言"。
2. **按数据选择变体**：leaderless 四段（B1）应由 `hasLeader` 门控；`v5r-turn-ask` 的 meeting 变体（A6）应由"本轮是否绑定会议"选择；paper 段应由 paper 上下文选择。现在都按"相位"硬选。
3. **工具清单/字段表单源生成**：`v5r-tools-*`（D7）、`v5r-reply-compact` 的字段表、`v5r-turn-tool-receipt` 的说明都是工具声明的**第二份拷贝**——应由 `V5R_PACK_TOOLS` 的 parameters/description 生成，避免口径漂移（A4 的 `target` 旧别名就是漂移实例）。
4. **弃用表在构建期过滤**：五段"更正·"（D3）应作为「旧措辞 → 新措辞」表存在 docs/构建脚本里，而不是每回合注入。
5. **回执口径的机制化**：A2/A3 那类"对象/类型/票"其实都能由回执 schema 渲染（对象、类型、当前票数），不必在提示词里写死，也不会与真实状态脱节。

# 6. 未覆盖 / 需要下一轮补的

- **paper 相位**（paper-write/paper-review/paper-final）本夹具为空，E3 的替换文本需带 paper 上下文重装配验证；同理 lean/resume/founding 的模板节没被读到。
- `v5r-turn-meeting-chamber`（chair 1 795 / member 527 / temp 379）只抽读：④发言序 ⑤时长 ⑥推进回合 的具体措辞未逐行审，其中 `wait`/`wake` 的用法可能与 `vibe_vmu_meeting` 的实参有出入，建议下一轮单审。
- `v5r-charter-hard-rules`(395)、`v5r-charter-rhythm`(359)、`v5r-proof-admission`(325)、`v5r-turn-mainline`/`v5r-turn-blueprint` 只读了首行，未逐条核。
- 真机 `VMU_PACK_V5R_CORE_PAPER_STATE`×99 与 `PAPER_EVIDENCE_MISSING`×43：状态机细节属于 paper 节，待装配后再判。

# 7. 与 93 条规则台账的对照（L 行号）

规则原文 `D:\wd\vibemath开发\宏观层面v5r运行规则.md`；台账 `docs/acceptance/rules-ledger.json`（93 条全 DONE）；要求行口径见 `docs/acceptance/phase12-v5r-rules-conformance.md` §337（63 行 = 18 空行/分隔 + 13 小节标签 + 32 要求行，锚点 86/86、要求行 32/32）。下表只列「与规则冲突或该由规则兜底」的条目；未列的条目属于工具 schema 层（`tools.js`）而非规则行。

| 条目 | 规则行 | 冲突点（一句话） |
|---|---|---|
| A1 | L70、L73 | L70 说的是「所办通过参数设并发限制」，是**限制**不是「0 次」；L73 要求功能走工具实现，渲染成 0 次与规则方向相反。 |
| A2 | L53、L64 | L53 明确「投票不一定是用于辩论，辩论是那个各自发言而非通过投票来辩论」；L64 的裁决口径（全体一致为 1/0，否则取平均）由 `verdict` 家族执行，不是 `poll_vote` 的选项票。 |
| A3 | L64 | 裁决「对象 / 类型」由会议帧与裁定对象给出；缺值时整句应省略，不应把 `(unspecified)` 交给模型。 |
| A4 | L16、L60、L74 | L16 的鼓励开关对应 Lean 归档；L60 规定 lean 已通过的命题辩论只审「代码是否符合原意」；交付通道是回合字段 `formal`，与「不要用 JSON 回复块」相反。 |
| A5 | L43、L47–L53 | L43 说会议**类型**由院士设置，会议流程由院士自组织；`kind` 只是台账标签，不能选流程。 |
| A6 | L43、L50 | 会议中各成员的命令/工具「按会议类型和成员身份」不同；同一回合既说议程由会议帧给出、又说没有绑定会议，与 L43 的会议帧相悖。 |
| A7 | L43 | 会议帧必带类型/主席/议程；空占位句是渲染缺失，不是规则要求的形态。 |
| A8 | L50 | L50 明确「常见命令包括举手发言、邀请发言、批量指定顺序发言、单次发言版群聊…有些只有主持人具有」——按面点名工具才能对上权限。 |
| B1 | L3、L43 | L3 定义院士/常驻/临时工的角色；L43 说院士主持。院士已就座时仍写「没有在册院士」直接违反 L3/L43。 |
| B2 | L14、L73 | L14 要求命题库的正式证明写完后才能进辩论、verified 要标记；落账通道是内核记录，不是「直接用 fs 写文件」。 |
| C1 | L39、L74 | L39 规定状态板四字段含时间信息；标题把验证轮写成「第 1 轮」，违反 L74 的「提示词与规则相符」。 |
| C2 | L60、L62、L64 | L60/L62 规定 lean 已通过后的辩论只审代码忠实性与轮数由院士定；L64 规定裁决要落在概率与改卡通知上。「给弃权值以保证本轮无法得出一致结论」是在教规避 L64 的裁决。 |
| C3 | L16、L60 | L16 的 Lean 鼓励是**参数开关**（可关）；C3 把它写成 12/12 常驻，等于把可选机制当默认义务。 |
| C4 | L3 | L3 说临时工无表决权、默认不参会；C4 让 temp 读院士七条组织职责，与角色定义不符。 |
| C5 | L74 | 提示词应自洽；「更正·旧说法」常驻属于把变更记录当规则读，违反 L74 的可读性要求。 |
| D1–D8 | L73、L74 | L73 说绝大多数功能走工具而非每轮输出 json，D1/D2 却把回执围栏讲五遍；L74 要求自洽，重复段之间已有措辞漂移（D1 的「捕获原文」就是漂移遗迹）。D6 另涉 L39（状态板字段）。 |
| E1 | L43 | 「会议只能由院士预约/召开/关闭」意味着以主席名义开会前必须让院士自己在回合里做；提示词没写这条前置。 |
| E2 | L38、L43 | L38 说交流走邮箱/私信/群聊；对象名必须是真实的席名/会 id，提示词没要求先从状态块取真 id（真机 say `VMU_NO_SUCH_OBJECT`×40、vmu_meeting×72）。 |
| E3 | L72 | L72 说特殊权限或请求「通过报告主代理（所办）向用户询问」；paper 的 `VMU_OFFICE_CONSULT_REQUIRED`×58 正缺这条指引。 |
| E4 | L14、L56 | L56 要求辩论会议用额外字段设置辩论对象（或文件引用）；L14 要求只有正式证明写完的命题才能辩论——提示词只说了「须给 subject」。 |
| E5 | L58、L64 | L58 规定辩论/结题表决人数至少 min(用户设置, 院士+常驻)；L64 规定裁决后通知命题卡持有者改卡。提示词没写「一次一人一票、主席只在 final 签」与改卡通知。 |

**结论**：28 条里 13 条与规则行存在**直接措辞冲突**（A1/A2/A4/A5/A6/A8/B1/B2/C2/C3/C4/E1/E5），不是风格问题；其余属于工具 schema 漂移（A3/A7/E2/E4）、渲染缺失（A3/A7）、或纯篇幅账（D 类）。L74「确保所有代理接收到的提示词完全与上述规则相符、自洽」把这一类冲突都算违规，应作为下一轮门禁的判据。

## §8 task-54 修复记录（2026-11-06，第一批 6 条）

写域：`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js`、`v5r-blocks-b.js`、`v5r-corrections.js`（只改文本，不动节清单/装配顺序）。验收（`node scripts/sim/audit/prompt-sections.mjs` 重装配，12 组合）：

| 判据 | 修前 | 修后 |
| --- | --- | --- |
| `(unspecified)` 出现次数 | 9 | **0** |
| `不超过 0 次` | 12 | **0** |
| `没有在册院士`（leaderless 根文本） | 24 | **0**（仅 `v5r-fix-leader-id` 更正段按 pin 保留旧句 12 次） |
| `kind 可取 verify-request` | 12 | **0** |
| `参数 target、kind`（lean_archive 错误形参） | 3 | **0** |
| `vibe_v5_poll_vote` 与「辩论不用投票板」同篇冲突 | 3 | **0**（两者仍在同节，但语义已分离：poll_vote 只用于院士另开的选项板） |

字数（normal/meeting/checkpoint/verify，chars，同一脚本；before 为 task-54 开工前 01:00 快照）：

| 席位 | before | after | Δ |
| --- | --- | --- | --- |
| chair | 30 860 / 35 524 / 31 011 / 34 413 | 31 065 / 35 729 / 31 216 / 34 829 | +205 / +205 / +205 / +416 |
| member | 25 932 / 28 135 / 26 083 / 29 777 | 26 137 / 28 340 / 26 288 / 30 193 | +205 / +205 / +205 / +416 |
| temp | 23 194 / 25 105 / 23 345 / 27 088 | 23 436 / 25 347 / 23 587 / 27 541 | +242 / +242 / +242 / +453 |

净增字都在信息密度上：A1 把「0」从禁用改成显式语义说明（+约 60 字/回合），A2 给出 verdict 的真实形参与「表决票」结论（+约 120 字/verify），A4 改教真实形参（+约 60 字/verify），B1 用可证明的措辞替换绝对断言（+约 37 字/回合）。没有为省字删除任何机制说明；「0 次」的误导成本远高于这些字。

## §9 task-55 修复记录（2026-11-06，第二批 10 条）

写域：`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js`、`v5r-blocks-b.js`（只改/加文本，不动节清单与装配顺序；本批 0 处测试改动）。验收：

| 判据 | 结果 |
| --- | --- |
| `node scripts/sim/audit/prompt-budget.mjs` | **PASS**（chair/normal 31 865，baseline 32 442，Δ −577） |
| `node tests/vmu-run241-prompt-budget.test.mjs` | 24 passed / 0 failed |
| `node tests/vmu-prompt-corrections.test.mjs` | 83 passed / 0 failed |
| `node tests/vmu-turn.test.mjs` | 272 passed / 0 failed |
| `tests/*prompt*.test.mjs` 全批 | 0 failed（含 `vmu-run239-prompts` 47/0、`type-coverage` 15/0、`no-holes` 28/0、`g7` 66/0、`retired-mechanisms` 68/0、`live-facts` 29/0、`policy-live` 25/0、`vmu-prompt` 70/0） |
| 12 组合空节 | **0** |
| `(unspecified)` / `不超过 0 次` | 0 / 0 |
| `没有在册院士` | 仅 `v5r-fix-leader-id` 更正段 12 次（pin 要求保留旧句） |

字数（normal/meeting/checkpoint/verify；before = task-54 收口值）：

| 席位 | before | after | Δ |
| --- | --- | --- | --- |
| chair | 31 065 / 35 729 / 31 216 / 34 829 | 31 865 / 36 683 / 31 461 / 35 074 | +800 / +954 / +245 / +245 |
| member | 26 137 / 28 340 / 26 288 / 30 193 | 26 907 / 28 788 / 26 503 / 30 408 | +770 / +448 / +215 / +215 |
| temp | 23 436 / 25 347 / 23 587 / 27 541 | 24 129 / 25 718 / 23 725 / 27 679 | +693 / +371 / +138 / +138 |

逐条增量（`[...str].length`）：E2 `v5r-turn-tool-receipt` 181→270（+89）；A7 `v5r-turn-meeting-agenda` 36→275（+239，仅 meeting）；A8+E1+E4 `v5r-turn-meeting-schedule` chair 1 853→2 329（+476，仅 meeting）；E3 `v5r-paper-final` 1 293→1 523（+230，仅 paper-final）；E6 新节 **531**（仅 normal）；A6 `v5r-turn-ask` meeting 97→199（+102，仅 meeting）；E5 `v5r-charter-voting` chair 1 661→1 768（+107）；B2 `v5r-charter-libraries` 1 301→1 356（+55）。normal 净增 = E6 531 + E2 89 + E5 107 + B2 55 + 上批遗留差异 18 = **800**，chair 恰好用满上限（为腾字曾把 E6 从 613 压到 531、E2/E5/B2 各收一档；`v5r-charter-voting` 的 researcher 版未动字数）。

**本批仍属机制层、未由文案修掉**：A7 的「无会议帧时整节不注入」、A6 的「按是否绑定选变体」、E3 的 consult 流程可读性（`requestId` 形状）、E2 的「id 面表」都仍是渲染/工具声明的事；文案只是给了判据与出口。**E1 的根治**在工具层（`kernel/meetings.js:4010` 可以允许所办代派并自动 drive，或把 `chair` 角色动作路由到「先派回合」的回执），提示词只能教顺序。

## §10 task-56 修复记录（RUN 244，第三批）

本批目标是**净字数下降**，不是补缺失。三席 normal 与 meeting 都不得变大。

### 10.1 装配字数（`scripts/sim/audit/prompt-budget.mjs --check` 口径）

| 席位 / 相位 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| chair normal | 31 818 | 30 546 | −1 272 |
| member normal | 26 838 | 25 566 | −1 272 |
| temp normal | 24 082 | 22 268 | −1 814 |
| chair meeting | 36 683 | 33 375 | −3 308 |
| member meeting | 28 788 | 26 726 | −2 062 |
| temp meeting | 25 718 | 23 284 | −2 434 |

12 组合终值：chair 30 546 / 33 375 / 30 142 / 33 980，member 25 566 / 26 726 / 25 162 / 29 292，temp 22 268 / 23 284 / 21 864 / 26 043（normal / meeting / checkpoint / verify）。空节：0。

### 10.2 逐节字数（改前→改后）

| 节 | 改前 | 改后 | 说明 |
| --- | --- | --- | --- |
| `v5r-fixture-tools` | 2 447 | 2 267 | D2/D8：删验收语境词与重复的记录本解释，留判据与三句 pin |
| `v5r-turn-board` | 679 | 538 | D6：删设置解析/刷新时机/席位差异，留四行名与三条 pin |
| `v5r-math-rules` | 467 | 123 | D5：只留沙箱/重跑/归档三句，细节归 `v5r-turn-compute` |
| `v5r-charter-libraries` | 1 356 | 1 280（member/temp 1 277） | D8：只留三条硬要求 + 指针 |
| `v5r-formal-work` | 659 | 427 | C3/D4：删重复的操作细节，留判断标准与两条诚实规则 |
| `v5r-reply-compact` | 3 208 | 3 096 | D1：删两条元话语与重复复述，捕获原文两段 verbatim 保留 |
| 五段「更正·」合计 | 1 485 | 1 232 | D3/C5：各节缩一到两档，marker + needles 全保留 |
| `v5r-charter-org` temp 变体 | 887 | 345 | C4：删七条院士职责与主席边界 |
| `v5r-verify-reconsider` | 137 | 364 | C2：旧句保留 + 前置『勿照做』+ 新规则（仅 verify 轮） |
| `v5r-turn-heading` verify 变体 | 无（渲染 normal 文本） | 约 14 | C1：新增验证轮标题 |

### 10.3 验收尾行（本批结束实跑）

- `node scripts/generate-pack-prompts.mjs` → `pack prompts: up to date (67 prompts, 79138 chars, sha d889776b36ff)`
- `node scripts/sim/audit/prompt-budget.mjs --check` → `prompt-budget: PASS`（metrics chair/normal 30 546、member/normal 25 566、temp/normal 22 268、assemblyUnexplained 0、assemblyPinned 12、exactDups 26、nearDups 21、timing 5）
- `node scripts/sim/audit/prompt-budget.mjs --mutants` → `prompt-budget mutants: PASS (both injected failures were caught)`
- `node tests/vmu-run241-prompt-budget.test.mjs` → 24 passed, 0 failed
- `node tests/vmu-run239-prompts.test.mjs` → 47 passed, 0 failed
- `node tests/vmu-prompt-corrections.test.mjs` → 83 passed, 0 failed
- `node tests/vmu-run242-feedback65.test.mjs` → 62 passed, 0 failed
- `node tests/vmu-turn.test.mjs` → 272 passed, 0 failed
- `node tests/sim-assembly-parity.test.mjs` → 20 passed, 0 failed
- `node tests/vmu-prompt-closure-channel.test.mjs` → 24 passed, 0 failed
- `node scripts/check-docs.mjs` → `DOC LINT: PASS`（note D16 为既有提示，非本批引入）

### 10.4 为什么没丢信息（出口与判据的位置）

- **D1** 删的是元话语（「上面这句是捕获原文」），不是捕获原文本身；两段原文逐字保留（`tests/vmu-run144-reply-routes.test.mjs:168` 仍绿）。
- **D3/C5** 删的是「同一作废措辞的多种解释」，五节的 marker、oldNeedles、newNeedles 全在；被作废句仍出现在更正段内（`SUPERSEDES` 的 oldLine-after-marker 判据仍绿）。
- **D5/D6/D8** 删的是跨节重复的同一解释；每一处都留了指针（tracks / turn-compute / fixture-tools），读者仍能找到完整版本。
- **C2** 的危险句没有被删掉、而是被标注为「作废措辞 + 勿照做」，并给出新出口（弃权须带独立理由），既满足语料认领也修掉误导。
- **C1** 的会议标题仍保留 `{{ setting:vmu.turn.meetingId }}`（T108–T110 要求 per-turn 事实可注入），只改分隔符消双空格。

### 10.5 未做或降级的条目

- **D7（工具长清单瘦身）**：工具行由 `vibe-math-vmu/packs/v5r/middleware/seat-faces.js` 的 `seatBulletLines()` 渲染，`tests/vmu-v5r-tools.test.mjs:1929-1932`、`tests/vmu-run31-seat-faces.test.mjs` 双向比对，且 `prompt-sections.mjs:80-91` 的 13 条 PINNED_MARKERS 钉住若干句。要动必须同时改 `seat-faces.js` 与两侧测试，越出本批写域，故未做。
- **C3 的 `v5r-formal-work-rendered`（469 字，仅 verify）**：正文含字面 `<VIBEMATH>` 且被 `tests/vmu-prompt-type-coverage.test.mjs` 的语料行正则认领，删行即红；根治方式是把该段并进 `v5r-verify-formal-addendum` 的渲染层，属机制层。
- **D3 的「合一」**：五节更正受 `tests/vmu-prompt-corrections.test.mjs` 的节数/marker/needles/≤400 字契约约束，只能逐节瘦身，不能合并成一段。

### 10.6 教训

- 相位节若只写 `texts.normal` 而不加 `scope:{phase:['normal']}`，会在 12/12 全组合渲染；`kind:'phase'` 本身不门控。
- 语料行（`derivedFrom: corpus` 的段）不能随手删：`isCorrectedTeachingLedger` / `type-coverage` 在测试里硬编码认领它们，删了报 `unexplained`；改成「旧句保留 + 勿照做前缀」才是本仓库的更正语法。
- 会议标题里的 `{{ setting:vmu.turn.meetingId }}` 是 T108–T110 的注入事实载体，动它前先看那三条测试。

## §11 task-96（TB-2611-P）提示词去歧义：从「所办可以代写」到「成员本回合自己写，所办只代转」

### 11.1 口径与机制真相

用户第 2 问指出：真机上成员名义的写动作多数是所办代调用（回执 `memberActed:false`），而提示词/任务书让人以为这些活该由所办干。本轮把提示词口径统一为：

- **成员的写动作归成员**：卡、发言、投票、签到、论文、表——**只能由该席位在自己那一回合里写**；没写就是没做。
- **所办只代转、不代写**：所办可以派回合、召集、转达、汇报；代转只在成员回合**不可用时**发生，且回执会具名（`memberActed:false`、`relayedBy: office`），并说明「成员本轮未运行」——那不是进度。
- **默认用 fs**：自管文件（卡片/进度/方法/子问题 md）**默认自己用 fs 写**，内核按文件建索引；`vibe_v5_record_*` 只在需要内核记账/记录 id 时才用。
- **D2 制度不变**：所办仍是所内唯一对外传信人（台账 D2 保持 DONE 的理由未变）。

机制核对（只读，**未改机制**）：`proxy:true`/`deliveryUnavailable` 在全仓**不存在**（TB-2611 的机制半 task-90 尚未落地），因此本轮提示词**没有教这两个字段**，改用具名事实 `memberActed:false`（`vibe-math-vmu/kit/handlers.js:650-653` 的 `relayedBy: 'office'` 与 `memberActedMeans`）。若机制侧将来给出 `proxy:true`+`reason`，只需把 §11.2 第 10 条的后半句换成新字段名——已有负断言不会误伤。

### 11.2 旧句 → 新句对照表（10 条）

| # | 旧句原文（改前） | file:line | 为什么会被读成「所办该干」 | 新句（改后） |
| ---: | --- | --- | --- | --- |
| 1 | `★★ 写卡片请直接用工具（`vibe_v5_record_*`），**不要**把卡片塞进回执的 record 字段。` | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js:572` | 「请直接用工具」把工具设成**唯一默认**写路径，与 persona 的「推荐直接用 fs」相左；读者得出「写卡是调工具的动作，谁调都行」。 | `★★ 写卡片**默认用 fs**（自己写 md）；`vibe_v5_record_*` 只在要内核记账时用，**不要**塞进回执 record 字段。` |
| 2 | `③ 落盘两条路：`vibe_v5_record_*` 直接登记（回执给 `recordId`，进记录本）；或 fs 写 `Members/<你>/…`（草稿区，不进记录本）。要立项/被引用/进会议材料**必须**走 `vibe_v5_record_*`。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:228` | 工具排在 fs **前面**，fs 被降级为「草稿区、不进记录本」⇒ 理性读法是「正式产出走工具，工具 = 所办常用面」。 | `③ **默认用 fs**：自己写 `Members/<你>/…` 的 md（内核 reindex 按文件建索引）；只有要内核记账（`recordId`、进记录本、被立项/引用/进会议材料）时才用 `vibe_v5_record_*`。` |
| 3 | `…没有 `vibe_v5_record_*` 卡片面（具名拒，产出归指派者归档），过程记录写回执的 `progress` 字段。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:89`（academician 变体）、`:103`（researcher 变体，逐字同文） | 「产出归指派者归档」→ 临时工的产出由**指派者**（常是所办/院士）落库 ⇒ 指派者代写被读成制度义务。 | `…没有 `vibe_v5_record_*` 卡片面（具名拒）；产出由自己写进回执（指派者只核对、不代写）` |
| 4 | `…（或自己的工作目录/工作日志），产出由指派者归档。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:220` | 同 3，且出现在「临时工例外」段，读者会把「归档」理解成指派者的常规动作。 | `…（或自己的工作目录/工作日志）；产出由自己写进回执（指派者只核对、不代写）。` |
| 5 | `**临时工不进成果库**：卡片面对临时工**具名拒**，产出由指派者归档；过程记录写在回执的 `progress` 字段。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:1057` | 同 3：把「临时工没有卡片面」与「产出归指派者」并列，代写成了缺口的自然补偿。 | `**临时工不进成果库**：卡片面对临时工**具名拒**；产出由临时工自己写进回执（指派者只核对、不代写）；过程记录写在回执的 `progress` 字段。` |
| 6 | `…无表决权、默认不参会，产出由指派者归档。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:1100` | 同 3/5，且在「雇佣临时工」的操作段：所办雇完工顺势“归档产出”最自然。 | `…无表决权、默认不参会，产出由临时工在回执里交回（指派者只核对、不代写）。` |
| 7 | `**你没有组织职责**：任务由院士/所办分派，你只负责把自己那份做完并如实汇报：` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:294` | 「分派」只说明任务来源，没说「分派≠代做」；成员读到的是“活是别人派的”，与「所办会做我的活」互补成幻觉。 | `**你没有组织职责**：任务由院士/所办分派（**派活≠代做**）；你那份的卡、发言、表**由你本回合自己写**并如实汇报：` |
| 8 | `**优先级由集体协商决定**；所办可以协助调整。` | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:455` | 「协助调整」没有边界，可被读成所办能改任务内容/替承办席位改动。 | `**优先级由集体协商决定**；所办可转达建议或直接分派，谈完的活仍由承办席位自己写。` |
| 9 | `…所办与领头人靠这些统筹与对外——` | `vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js:30` | 「靠这些统筹」把汇报的目的写成所办的统筹动作，读者顺势认为统筹含“把活并进来做”。 | `…所办据此派回合、领头人据此决策（统筹是安排谁做，不是替谁做）——` |
| 10 | `你的活是**编排**：…给成员派回合、**汇总所内实况**、把外部的要求原样转达出去。（原文此后无代转边界）` | `vibe-math-vmu/packs/v5r/prompts/assistant.json:12` | 「汇总」与「编排」并置却只说「不代席行动」，没给**代转**的判据（何时可以代、回执长什么样）；办公室提示不计入三席预算，正适合放这条硬边界。 | 追加：`**汇总≠产出**：读实况再转述，别把成员的活汇总成你的产出；代转只在成员回合不可用时发生，回执会写 `relayedBy: office` 与 `memberActed:false` 并说明「成员本轮未运行」——那不是进度。` |

已达标、作为「方向正确」参照的既有句（未改）：`vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js:60`（「写卡、发言、投票、签到、写论文、下结论只能由**你自己在本回合**做完，别请所办代办」）、`vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js:130`（「所办只做归档与流程…**不代签**」）。

### 11.3 旧句 0 命中（判据）

改后全 `vibe-math-vmu/packs/v5r/prompts/` 逐句 grep（`grep -rn -F`）以下旧串命中数全为 **0**，并已写进 `tests/vmu-run239-prompts.test.mjs` §11 的否定断言（`denies(...)`，措辞回归即红）：

`写卡片请直接用工具`、`落盘两条路`、`产出归指派者归档`、`产出由指派者归档`、`任务由院士/所办分派，你只负责`、`所办可以协助调整`、`所办与领头人靠这些统筹与对外`。

正向断言（源码级）：`默认用 fs`、`派活≠代做`、`不代写`、`汇总≠产出`、`统筹是安排谁做`；装配级：chair/member normal 含 `默认用 fs` 与 `派活≠代做`（member），temp normal 含 `不代写`。

### 11.4 装配与预算（三份 normal 不升）

- 真装配（`scripts/sim/audit/prompt-sections.mjs` 的 `collect()`，与 `tests/vmu-run247-prompt-dedup.test.mjs` 同一口径）：对 HEAD `67fb601a`（`D:/_tmp/base255` worktree）**75 350 → 75 218（−132 字符）**；逐席 chair 28 614→28 567（−47）/ member 25 008→24 961（−47）/ temp 21 728→21 690（−38）。
- `node scripts/audit-prompt-budget.mjs --check` → **PASS**（1 条既有 `SEAT_PROMPT_OVER_T99` warning），cap **未上调**（chair/meeting 36 500、seat 30 100）。
- `node tests/vmu-run247-prompt-dedup.test.mjs` → **74/0**（本轮是**净减**，不需要新增 teaching 预算；`§1c` 的签名行仍是 8 行，字符数因把一句散文从中签名行拆到下一行而下降——不是把参数表藏起来）。
- `node tests/vmu-run239-prompts.test.mjs` → **114/0**（新增 §11a–l：7 组旧串 `denies`、5 组新句 `says`、chair/member/temp 三段真装配断言）。
- `node tests/vmu-turn.test.mjs` → **272/0**。其中 T71 的源书逐字一致性：`:455` 那句在捕获原文里是 `所办可以协助调整`，本轮改成「所办可转达建议或直接分派，谈完的活仍由承办席位自己写」，按本仓既有机制在 `DECLARED_DIVERGENCES` 里**具名声明**（`v5r-charter-taskboard-leader`；T71c 要求声明必须真有分歧）。
- `node tests/vmu-ledger-teaching-pins.test.mjs` → **59/0**。L10 的 pin 从「指派者归档临时工的产出」改成「临时工自己在回执里交回、指派者只核对不代写」并加旧句缺席断言。
- 生成件：`v5r-persona.js` 是 `scripts/generate-pack-persona.mjs` 的生成物（**本轮未手改**），所以 persona 里的「推荐直接用 fs」本轮保持原样。~~它与「默认用 fs」同向，无需改。~~ **RUN 256 / task-107 已把它改掉**（改的是语料 `prompt-corpus-v5/persona-corpus-v5.json`，再重新生成；见 §11.5）——「同向」不等于「同一句」：原句把 fs 写成**推荐项**，正是「fs 只是可选」的读法来源。

### 11.5 RUN 256 / task-107（TB-2626）：persona 捕获句「推荐用 fs」→「默认用 fs」

**任务**：task-96 把 live charter 的写路径改成「默认 fs、`record_*` 只做内核记账」之后，`prompt-corpus-v5/persona-corpus-v5.json` 里的**捕获语料**仍写着 `推荐**直接用 fs 写你自己的文件** … vibe_v5_record_* 只是便捷记录器`。捕获语料是 `v5r-persona.js` 的来源（生成件不许手改），也是 `tests/vmu-turn.test.mjs` T71 的基线原文之一 ⇒ 不一起改，capture 与 shipped charter 就长期不同向，且下次有人按 capture 复述时会重新教出「fs 是推荐项」。本轮**只改语料 + 重新生成**，不改生成件、不改 live 章程（live 侧的对应改动属 task-96）。

**旧句 → 新句（同一键路径，四个 role 各一处）**

| 位置 | 旧句（被读成什么） | 新句 |
| --- | --- | --- |
| `roles.<id>.blocks[key=s三].text` 第 ① 段 | 「若只想记录成果，直接用 `vibe_v5_record_progress` / …，框架会写到正确位置」——**先工具、后 fs**，读者只记住「记录成果用工具」 | 「只记录成果用 fs 写自己的 md；要进内核记录本（被引用/进会议材料）才用 `vibe_v5_record_progress` 等四个 `record_*` 工具，框架会写到正确位置」 |
| 同上 第 ③ 条 | 「**推荐**直接用 fs 写你自己的文件……`vibe_v5_record_*` 只是便捷记录器，不是必需」——「推荐」= 两个方案里的偏好项，不是默认 | 「**默认用 fs 写你自己的文件**……`vibe_v5_record_*` 只在需要内核记账时才用，不是必需」 |
| 同上（新增 第 ④ 条） | 无（「工具写与 fs 写谁覆盖谁」从未说过） | 「工具与 fs 写的是同一个文件，后写的覆盖先写的；蓝图草案缺 mdPath 即 `draftMdMissing`；md 与索引不一致时读面给 `mdChangedSinceIndex:true`，`reindex` 按 md 重建索引」 |

**为什么原句会被读成「fs 只是可选」**：三处叠加——(a) 动词是「推荐」，语义上等价于「还有别的推荐方案」；(b) 紧接着的「若只想记录成果，**直接**用 record_*」把工具放在句首、fs 降级为「另一种做法」；(c) 谁覆盖谁从未写，读者没有「两条路写的是同一个文件」这个事实，只能把 fs 与工具当成两套存储。task-96 已把 live 章程改成「默认用 fs」，本轮把 capture 追平，使「复述 capture 也不会退回旧读法」。

**机制真相（新第 ④ 条句句有落点，pin 会验）**

- `vibe-math-vmu/packs/v5r/blueprint.js`：`proposeBlueprint({…, materialize = false, …})`（:1425）——默认**不代写**；回执 `draftMdMissing: true` +「the draft document belongs to the member, not to the kernel」（:1655/:1673）；显式 `materialize:true` 才由内核物化（`mdWrittenBy:'kernel-materialized'`，:1631/:1637）。⇒「蓝图草案缺 mdPath 即 draftMdMissing」是真话。
- `vibe-math-vmu/kernel/records.js`：`mdChangedSinceIndex:true` 的语义是「md 被工具外改过，修复是 `vibe_vmu_records { action:"reindex" }`——本次读不换行内正文」（:1722-1736）。⇒「md 与索引不一致时读面给 mdChangedSinceIndex:true，reindex 按 md 重建索引」是真话。
- 「后写的覆盖先写的」是**同一物理文件**的直接后果（工具与 fs 都落到 `Members/<id>/…` 的同一路径），不是额外机制。

**语料与生成件的形状（为什么不能只改一份）**

- 语料顶层 `{note,total:4,roles}`，`roles` 是对象 `{acad,r-1,r-2,r-3}`；旧句在**每个 role 的 `s三` 块**各一处（共 4 处）。`s三` 内嵌成员库根 `Members/<id>/`（同一段出现两次，示例恒为 `Members/acad/`）⇒ 它**本来就是 per-role 文本**，四份除库根外必须逐字一致；若只改一份，生成器会输出四份互相矛盾的章程。
- 生成器 `scripts/generate-pack-persona.mjs` 默认即 check 模式（`--write` 才写）；`identical(key)` 判 shared/per-role。本轮输出仍 `blocks=11 shared=6 per-role=5 bindings=20`（`v5r-persona-formats` 仍是 per-role：1 default + 4 bindings，**没有**因改动退化成 shared，也没有多出变体）。
- 改后 `SOURCE_SHA256=2303ad3e78bd94a9a62da2d344893d8c24bf7729b09641bafecd44bf86aa3e78`、`COUNTS.chars` 25 066 → 25 394（四个 role 各 +82，共 +328）；`--write` 后再跑 `--check` 输出 `pack persona: matches the capture (sha 2303ad3e78bd)` ⇒ 幂等。

**pin（`tests/vmu-run239-prompts.test.mjs` §12a–l，127/0）**

- 语料与生成件里旧句 `推荐**直接用 fs`、`若只想记录成果` 各 0 命中（HEAD 上分别是 4 处与 5 处 ⇒ 断言非空洞，改动前会红）。
- 新两句在生成件里各 5 处（1 default + 4 bindings）；`SOURCE_SHA256 === sha256(语料字节)`（手改生成件或生成过期都会红）；四份 body 用 `Members/<id>/` 归一后唯一。
- **实现落点断言**（lead 硬要求「提示词承诺的每件事都有实现落点」）：`blueprint.js` 必须真有 `materialize = false`、`draftMdMissing`、`mdPath`；`records.js` 必须真有 `mdChangedSinceIndex`、`reindex`；并且新 ④ 句里确实印着这四个词——实现搬走或措辞漂移都会红。

**实测与预算**

- persona **不在 live 席位装配里**（`v5r-core.js:423-425`：运行期声明是手写章程；`tests/vmu-turn.test.mjs` T63 断言 `personaSections.length === 0`）⇒ 三份 normal 装配字数**逐字未变**：chair 28 567 / member 24 961 / temp 21 690（HEAD `67fb601a` 基线 28 614 / 25 008 / 21 728 = 75 350，task-96 口径 −132 与本轮无关）。
- `node scripts/audit-prompt-budget.mjs --check` → **PASS**，cap **未上调**（chair/meeting 36 500、seat 30 100；唯一 warning `SEAT_PROMPT_OVER_T99` 35 014 < 36 500）。
- `tests/vmu-run247-prompt-dedup.test.mjs` **74/0**：本轮**不动座位装配**，故不新增 `RUN256_TEACHING`；只加注释说明 tackle 的是 capture，不是 live 教学量。

**遗留（转任务书 / 报告）**

1. `prompt-corpus-v5/baseline-context.json` 仍有（10 处，:85–:166 的 charter 串里）「推荐直接用 fs」与旧记录器句——那是**另一份冻结 capture**（T71 拿它给其他 kind 做基线），不在本任务写域；若要全仓同步，需单独任务并同步 T71 的 baseline。
2. 本轮没有改 `docs/acceptance/phase12-v5r-rules-conformance.md` 与 `rules-ledger.json` 里把旧 persona 句当作证据的条目（不在写域）；那些引用描述的是 RUN 247 时点的事实，历史条目不需要改写，但新增条目不要再引用该句。

### 11.6 遗留（转任务书 / 机制）

1. **`proxy:true` + `reason`**：TB-2611 机制半（task-90）尚未落地；落地后把 §11.2 第 10 条改成两个新字段，并加一条正向 pin。
2. **「四席各出一张表」不是提示词的事**：仓库里没有这句（只存在于任务书/run brief），应落到 TB-2612 模板第 2 节（每席一段：本轮测哪些规则条号、产出什么表）+ 第 3 节验点表；已转 task-91。
3. **任务书「你是所办」单视角**：真机任务书通篇只给所办视角，成员没有自己的任务段——这是 task-90/91 的交接点，不在提示词层可修。

## §12 task-94（TB-2615）轮 A：提示词断言的事实表（2026-11-09）

**为什么有这一节**：提示词里大量句子是**关于代码的断言**——「回复正文默认 2000 字符」「`ack` 是唯一结算」「`truncated`/`excerptLen` 是截断的权威键」「`lateAdmission` 缺省 …」「verdicts 元素带 `p` 不是 `verdict`」。这些句子没有一条能靠读提示词验证：它们要么在代码里为真，要么就是**教成员等一个不会发生的结果**。已经付过三次学费：RUN 251（`waitingFor` 两个取值）、RUN 252（`p` vs `verdict`）、RUN 255（fs-first 默认什么都不写，而提示词还教「内核帮你物化」）。轮 A 的交付就是把这批断言变成一张**代码对账表**，让漂移在提交前变红。

**交付物**

1. `scripts/audit-prompt-facts.mjs`（新，约 520 行）：16 条事实，每条两个读者——
   - `claim`：在**装配后的提示词**（chair/member/temp × normal/meeting，走 `createTurnOrchestrator` 与真实 section policy，不是读源码字符串）里用正则取出提示词断言的值；
   - `truth`：在 `vibe-math-vmu/` 的真实文件里用正则取出代码事实，并带 `file:line`；
   - 输出逐条打印 `promptFile:line` ↔ `claim` ↔ `truthFile:line` ↔ `value` ↔ 判定，`不一致 N 条` 时 exit 1。`--json` 给机器读数。
2. 三个 **truth-side mutant**（`--mutants`）：schema `def 2000→1`、mailbox `settledBy 'ack'→'read'`、席位表 `3→4`。每个 mutant 都**重新装配提示词并断言装配文本 sha256 不变**，只让事实读者看到改后的真相——提示词一字未动也必须变红。这正是它区别于「提示词自己量自己」的地方。
3. `tests/vmu-run256-prompts-facts.test.mjs`（107 passed / 0 failed）：§A 装配非空；§B 16 条全绿；§C 逐条值等于代码值（防「空表也 PASS」）；§D 每条都有真实 `file:line`；§E **prompt-side** 注入（2000→3000、`缺省 chair`→`缺省 open`）各自只红自己那条；§F truth-side 三个 mutant 各自只红自己那条且装配 sha 不变；§G CLI 的三种模式（人类表/`--mutants`/`--json`）都验证。

**16 条事实清单（prompt 位置 → 代码真相）**

| # | 事实 | 提示词 | 代码真相 |
|---|---|---|---|
| 1 | 回复截断上限 2000 | `v5r-blocks-b.js:1032` | `settings/schema.js:225`（`def: 2000`） |
| 2 | 通知块最多 8 行 | `v5r-blocks-b.js:1032` | `kernel/mailbox.js:57`（`MAILBOX_NOTICE_LINES_MAX = 8`） |
| 3 | 主席全体发言摘要 ≤800 字符 | `v5r-blocks-b.js:972` | `kernel/meetings.js:467`（`excerptOf(…, 800)`） |
| 4 | 群聊行只有主席的发言推送 | `v5r-blocks-b.js:972` | `kernel/meetings.js:2945`（`member === m.chair` 闸门） |
| 5 | `ack` 是唯一结算（open 只标已读） | `v5r-blocks-b.js:1032` | `kernel/mailbox.js:1125`（`settledBy: 'ack'` + means） |
| 6 | 截断权威键 `truncated`/`excerptLen` | `v5r-blocks-b.js:1032` | `kernel/turn/index.js:4071` |
| 7 | `emptyReply` 只描述文本、0 字符才 true | `v5r-blocks-b.js:1032` | `kernel/turn/index.js:1724`（`EMPTY_REPLY_MEANS`） |
| 8 | 三席 id→中文标签（chair/member/temp） | `v5r-blocks-b.js:87` | `v5r-core.js:251`（roles 表） |
| 9 | 提示词点名的回复拒因码在核心里可抛 | `v5r-core.js:517` | `kernel/turn/index.js:52` 起（`VMU_TURN_*` 全集，子集判定） |
| 10 | verdicts 元素必填 `member` + `p` | `v5r-blocks-a.js:341` | `packs/v5r/tools.js:7345`（`required: ['member', 'p']`） |
| 11 | 任务合法转移表 | `v5r-blocks-b.js:291` | `kernel/tasks.js:32`（`TRANSITIONS`；提示词省略 `cancelled` 出口＝子集判定，输出会注明省略项） |
| 12 | `lateAdmission` 缺省 `chair`（**TB-2610 决策翻转**：open → chair，Lead 2026-11-07 裁定；旧文档写 open 是历史事实，不得再当现状引用） | `v5r-blocks-b.js:941` | `kernel/meetings.js:649`（`lateAdmissionOf`） |
| 13 | 墙钟硬界默认 1800000、钳制 300000–7200000 | `v5r-blocks-b.js:970` | `kernel/meetings.js:822` |
| 14 | `waitingFor` 两个取值 `quorum`/`chair-proceed` | `v5r-blocks-b.js:941` | `kernel/meetings.js:1915`（`waitingForOf`） |
| 15 | 蓝图草案缺文件/漂移两个具名码 | `v5r-blocks-b.js:885` | `packs/v5r/blueprint.js:169` |
| 16 | md 与索引不一致的读面键 `mdChangedSinceIndex` | `v5r-blocks-b.js:886` | `kernel/records.js:1729` |

**第一次运行抓到的真实不一致（已修）**

`lateAdmissionDefault`：提示词 `v5r-blocks-b.js:941` 写「（`open|chair|refuse`，缺省 **open**）」，而 TB-2610 已把内核缺省翻成 **`chair`**（`kernel/meetings.js:649` 的 `lateAdmissionOf`，`:653` `… : 'chair'`；`:4400`/`:4669` 的旧 fallback 同步改过）。差 1 个字符，但语义是「门自己开」vs「主席放行」——成员照旧句预期会被 `VMU_LATE_ADMISSION_*` 挡在门口。修法：`缺省 open`→`缺省 chair`（+1 字符，仅 chair 的 meeting 装配），旧串 0 命中；`tests/vmu-run239-prompts.test.mjs` 加 §14a–c（新句在 + 旧句 0 命中）。**这是轮 A 的第一笔实收：一张表，一个字符，一个真 bug。**

**实测**

- `node scripts/audit-prompt-facts.mjs` → `prompt facts: 16 checked`，`PROMPT FACTS: PASS`，exit 0。
- `node scripts/audit-prompt-facts.mjs --mutants` → `CAUGHT` ×3，`MUTANTS: PASS — all 3 truth-side mutations were caught with the prompt text unchanged`，exit 0。
- `node tests/vmu-run256-prompts-facts.test.mjs` → **107 passed, 0 failed**；`node tests/vmu-run239-prompts.test.mjs` → **145 passed, 0 failed**（§14 新 pin）；`node tests/vmu-run247-prompt-dedup.test.mjs` → **74/0**（本轮只动 meeting 装配 1 字符，normal 三份未变）。
- `node scripts/audit-prompt-budget.mjs --check` → **PASS**，cap 未上调（chair/meeting 35 061 < 36 500；seat 27 797 / 25 156 < 30 100）。
- `node scripts/check-docs.mjs` → **DOC LINT: PASS**。

**这张表的边界（不夸大）**

1. 16 条是**高频断言**，不是全部：回执 key 形状（`replyBytes` vs `replyFullBytes`）、终态名、12 个高频拒因的 `REACHABLE INSTEAD` 指向属轮 D。
2. 比较是**词法级**：提示词换一种说法（同义改写）而值不变时，claim 正则取不到会报 **UNREADABLE（红）**，不会静默放过——宁可红，不假装表是全域的。
3. truth 读者是正则读源码：常量/枚举一旦改结构（例如把 `def: 2000` 拆行），同样报红并指出「找不到」；修读者是维护这张表的一部分，不是「调宽断言」。
4. 事实 11 是**子集**关系（提示词只教快乐路径，省略 `cancelled` 出口），输出会注明省略项——「省略」被记录，不当作谎言；若提示词哪天教了一个代码禁止的转移，子集判定会红。

**遗留（转任务书）**

1. **轮 B 已完成（2026-11-09）**：`docs/acceptance/prompt-timing-map.md`（12 行事件点 × 块 × 出现条件，66 行）＋ `tests/vmu-run256-prompt-timing.test.mjs`（**24 passed, 0 failed**）——每行声明探针键名与 `出现/不出现` 期望，测试用真内核装配（或 `decideSections` 决策层）逐键测量并与文档比对；一个错位单元格（把 T1 的 `heading.round1` 改成 `heading.meeting`）实测 **19 passed, 5 failed**，`§B1` 具名报 `T1/heading.meeting`，还原后 24/0（`D:/_tmp/red-timing.txt`）。
2. 轮 D 的 12 个拒因交互句需要回执 `REACHABLE INSTEAD` 与提示词**同源**（不是复制），可与本表的 truth 读者复用同一常量源。
3. 生成件收口（`update-doc-counts`/`generate-wiring-index`/`generate-coverage-debt`）需 Lead 统一 `--write`：本轮新增 1 个脚本 + 1 个套件，派生计数（suites 717→718、TOTAL 797→798）与 `package.json` `files` 新增两行已就位，但生成块仍待刷新。

## §13 task-94（TB-2615）轮 C：可删重复见底，8% 目标未达（实测 1.91%）

**任务与判据**：Lead 要求三份 normal 合计再降 **≥8%**（基线 75 373 → ≤69 343），**cap 不动**（chair/meeting 36 500、seat 30 100）；每删一块必须有「删了会少什么」的书面判定，并留「旧句不在」的否定断言。轮 C 实测 **73 931**（chair 28 060 / member 24 557 / temp 21 314，−1 442 = **−1.91%**）。

### 13.1 四刀（内容、代价、为什么不算少）

| # | 位置 | 删了什么 | 删了会少什么 | 为什么不算少 | 实测影响 |
|---|---|---|---|---|---|
| C1 | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` 的 `v5rFixtureTools.text`（三席共享） | 夹具段里对通用「回执围栏/最小合法回执/未知字段」的**复述**压缩成指路；记录本契约与 blueprint 段落合并 | 夹具段不再原样重念通用回执规则 | 同一份装配的「回执字段」段已逐字给出同样规则；夹具段只留夹具特有约束 | 1 741 → **1 286**（−455×3） |
| C2 | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js` 的 `v5r-turn-channels` | 压缩投递/回执说明的句式（`是…的名单`⇒`是…`、`私信是`⇒`私信`等） | 语气与少量强调 | 每个字段名、每个读数含义、`ack` 语义都保留 | 1 172 → **1 201**（+29×3：恢复原句后比压缩前还长，见 13.3/13.4） |
| C3 | `vibe-math-vmu/packs/v5r/seat-faces.js` 的 `SEAT_TEACHING` 说明文字（8 行） | 合并与 fixture/channels 复述的行为解释；删 `这是人类的决定权：` 这类框架句 | 强调略减 | 判据是「这句话是否告诉智能体何时该选/不该选」；被删句只重复规则编号已含语义 | 净 −90 |
| C4 | `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js` 的 `v5r-charter-voting`（chair+member） | 5 处对同一门槛/记录的复述（`它与理由一并进入辩论录`、`——与上面的求真门槛不同`、`（闸把这条引用当证据，引用栏不能空）`、`两者不是同一个门槛`） | 少一遍「这不是那个门槛」的提醒 | 同段上一句刚给出该门槛与裁决录字段；复述不产生新可执行信息 | chair 2 062 → **2 008**（−54） |

### 13.2 旧句 0 命中（否定断言的 grep 证据）

`node D:/_tmp/grep-old-cuts.mjs` 在 `vibe-math-vmu/packs/v5r/prompts/*.js` 上实测：`不要把动作攒到回合末尾`、`它与理由一并进入辩论录`、`——与上面的求真门槛不同`、`（闸把这条引用当证据，引用栏不能空）`、`两者不是同一个门槛`、`这是人类的决定权：`、`仍具名拒 \`VMU_REGISTRY_BOUNDARY\`` —— **全部 0**。机器侧由 `tests/vmu-run256-prompts-compress.test.mjs`（§1f/§2c/§3d/§3e/§4d–g）逐条 `denies()` 钉住，并断言 §1h/§2d 的压缩后长度，防止「改回去」静默发生。

### 13.3 差点删掉「唯一来源」：ack 结算教学与选路判据（Lead 要求的判定书）

C2 重写时把整段改成**双引号 JS 字符串**，内层 `"ack"` 被转义成 `\"ack\"`；`tests/vmu-run256-mail-tool-facts.test.mjs` 的 pin 直接读源码行、要求出现 `` `settledBy:"ack"` `` 与 `**唯一**结算`，于是 **33/1**。这次红字的价值不在「多一个失败」，而在它证明：**「`ack` 是唯一结算」不是对上一句的复述，而是 ack/read 语义的唯一来源**——`open` 只标已读、行不因被读消失、`acked/ackRequired/unackedRowsAllBoxes/perBox` 这些读数**什么时候动**，全由这一句支撑。同理，C2 删掉的 `（全所合计）`/`（本人箱）` 被 `vmu-run239-prompts` §10k 钉住（该套件正是在教「读数各自管哪个箱」），删了会让读数语义变成猜测。处置：恢复原句与原始引号形态、恢复两处箱域注解，并保留 pin；**不改 pin 去迁就措辞**。教训：判定「重复」时不能只看句子表面——**要问这句话是不是某个读数的唯一解释**；`pincheck` 只能覆盖被 pin 的句子，未被 pin 的教学句没有保护网（轮 D 输入：为教学句补「判据」网）。

**同族两例（Lead m05008 要求记档）**：

1. **「唯一来源」不只在回执里，也在选择规则里**：C2 删掉的「判据：要对方**这一轮就看到**→私信；只留记录→邮箱；全所该知道→群聊」没有任何 pin 覆盖——删了不会有任何套件变红，但它是「何时选哪个通道」的唯一判据。已回补（+37×3）。所以「必须保留」的判据不是「被 pin 的句子」，而是**删掉后模型就失去可执行选择依据的句子**；`pincheck` 抓不到这类，只能逐句问「这句删了，它还知道怎么选吗」。
2. **对源码做字面量的 pin，会被「等价重排」判红**：C2 把单引号 JS 字符串改成双引号，措辞一字未改，但 `settledBy:"ack"` 因内层转义变成 `settledBy:\"ack\"`，而 `tests/vmu-run256-mail-tool-facts.test.mjs` 的 pin 直接读源码行，于是 33/1。这与「被散文判红」同族：**判据读的是形状（字面/行形态），不是意图**；处置同样是恢复原形态，而不是放宽 pin。

### 13.4 自纠：其余 6 处「信息」被误当「重复」后回补

复核 `git diff` 时发现 C1/C2/C3 里夹带信息而非重复，已回补：`归档头约 0.3–0.6 KB 不在其中`、`仅存在于回合回执，台账行不复制这两个键`、`哪怕这段散文没解析出任何字段`、`只有回执显示另一个根时才是本地草稿`、`（或下一次工具调用的参数里）`、seat-faces 的 `本所默认 acad`；另有 3 处措辞被 facts 套件与 pin 反向校正（`没有围栏或对象 ⇒ …围栏里的 JSON 不合法 ⇒`、`true＝这一回合的回复文本 0 字符`、`权威键是 \`truncated\``）。**最终水位 73 931（−1.91%）**，而不是中途的 73 393；转出口径以本文件为准。

### 13.5 门禁读数

`vmu-run239-prompts` 145/0；`vmu-run247-prompt-dedup` 74/0；`vmu-run256-prompts-facts` 107/0；`vmu-run256-prompt-timing` 24/0；`vmu-run256-prompts-compress` 5/0；`vmu-run256-mail-tool-facts` **34/0**；`vmu-run31-seat-faces` 86/0；`vmu-run251-tool-readings` 10/0；`vmu-run249-resume-and-attribution` 92/0；`vmu-v5r-tools` 362/0；`vmu-prompt-type-coverage` 15/0；`vmu-run144-reply-routes` 64/0；`audit-prompt-budget --check` **PASS**（chair meeting 34 465 < 36 500，cap 未动）；`check-docs` PASS；`pincheck` OK。

### 13.6 结论

**按门禁保留全部字面 pin 时，可自由删除的重复已见底（实测 1.91%；上一版口径 2.63%）——再往下的每 1% 都需改规则原文，需 Lead/用户授权。** 这是给下一轮的判据：若 Lead 授权改规则原文，须另立任务并同步 pin 与台账；若不许，则轮 C 到此为止，剩下的 8% 目标不再以「删重复」方式追。

### 13.7 边界

- `seat-faces.js` 只动说明文字：`names`/framework/face/`Object.freeze` 结构/行顺序未动，`seatAllowNames`/`seatDenyNames` 仍 48/27/8（`vmu-run31-seat-faces` 86/0）。
- `tests/vmu-run256-prompts-compress.test.mjs` 不动 `run239` helper（state-lane 负责）；`check-rules-coverage` 的 E2 红归 notice-lane 的锚句波动，不属本轮。

### 13.8 判断为风格、显式不立网的句子（不是漏看）

C1 删掉的两句被判为**风格/语气**，不是判据：`调用工具后结果立即可见；**回执可以很薄**：动作已由工具完成，只说做了什么、下一步是什么。` 与 `★★ 一次工具调用只做一件事。`。判定：删掉后模型仍知道回执要薄、工具会完成动作（同段与「回执字段」段保留了可执行规则），因此**不补 pin、不保留原句**；`tests/vmu-run256-prompts-compress.test.mjs` 里以 `denies()` 钉住二者不再出现（§2c）。这里显式记一笔，让后来人知道是「看过并判定为风格」，而不是「漏了却没人发现」。

### 13.9 RUN 257 后水位复核（口径刷新，不是放宽 §13 的结论）

轮 D D-2 落地时重测：三份 normal 合计 **73 969**（chair 28 088 / member 24 562 / temp 21 319）。与轮 C 的 73 931 差 **+38**，而本轮**只删不增**（回执字段清单副本删除：fixture-tools 段在三个席位各 −6 字符，合计 −18）；差额全部来自轮 C 之后**落进共享工作树的其它车道提示词教学**（同一 `git diff` 里可见 mailbox 两读键、蓝图 fs-first 等他人写入）。

处置：`tests/vmu-run256-prompts-compress.test.mjs` §5c 的手写上限按**实测**从 73 940 刷新为 **73 969**，并在源码注释里写明「这是防意外增长的绊线，不是预算 cap；`audit-prompt-budget` 的 cap（36 500 / 30 100）未动，实测 34 536 PASS」。§13 的 73 931 仍作为**轮 C 时点事实**保留。

教训：共享工作树里「水位」类 pin 会被别人的合法写入推动——**先量、再看 diff、最后改数**；把差额归因写进注释，否则下一次没人知道是泄漏还是别人教的。

## §14 task-94 轮 D D-1：12 个稳定拒因的「可达替代」红清单

口径（Lead m05385）：**唯一源是真内核拒因回执的 `hint`**，不是任何副本；判据 (a) 回执 hint 必须含 `REACHABLE INSTEAD:`；(b) 提示词里教该场景的句子必须点名 hint 里同一个**工具面真名与形参**。D-1 是**红清单交付物**：不改产品代码（hint 文本在 kernel/turn＝state-lane、meetings+mailbox＝notice-lane、packs/v5r＝md-lane 三个别的写域），只把「缺哪条、缺在哪」量出来，交 Lead 按写域分派 D-2；D-3 才收绿。

机读判据：`tests/vmu-run257-refusal-hints.test.mjs`——12 个码各**驱动真内核**产出一次拒因（drift 走 chair 提案+r-1 继续同一草案改文件后 adopt；office-consult 走 start→part×2→advance→review×2→advance→final 全流水线；unknown-field 走 `{op:"reply"}` 文本通道；orphan reply 走「暂存无主回复→step」），D-1 时 **19 passed / 10 failed**（§2 打印的红行原文即下表来源，无任何字面从源码抄进断言）；**D-2 于 2026-11-09 落地后为 41 passed / 0 failed**，§2 已从「冻结 10 条红单」改成**具名空单** `assert.deepEqual(missing, [])` + `CODES.length === 12`——某码回退时 `missing` 会重新非空并变红，修 hint，不许把码从清单里删掉来关灯。

| code | hint 源（refusal site） | (a) REACHABLE INSTEAD | 提示词教学句 | 判定 |
| --- | --- | --- | --- | --- |
| `VMU_TURN_REENTRANT` | `kernel/turn/index.js:4891` | 有 | —（装配文本未教「同一回合不能并发 run」；`v5r-reply-channel.js:8` 只在源码注释里） | (a) OK；(b) GAP |
| `VMU_MEETING_NOT_STARTED` | `kernel/meetings.js:1537` | 无 | v5r-blocks-b.js:941（「到点不会自己开会」） | (a) MISSING；(b) 一致 |
| `VMU_MEMBER_SESSION_NEVER_OPENED` | `packs/v5r/tools.js:625` | 无 | v5r-blocks-b.js:297（tool_help 读数） | (a) MISSING；(b) 未教「never opened ⇒ 先开 session」 |
| `VMU_TURN_ALREADY_PARKED` | `kernel/turn/index.js:2062` | 无 | —（装配文本无 parked 教学） | (a) MISSING；(b) GAP |
| `VMU_TURN_PARKED_NEEDS_OWNER` | `kernel/turn/index.js:2078` | 有 | —（同上） | (a) OK；(b) GAP |
| `VMU_PACK_V5R_BLUEPRINT_MD_MISSING` | `packs/v5r/blueprint.js:1714（另 :1923/:2198）` | 无 | v5r-blocks-b.js:885（fs-first 草案落盘句） | (a) MISSING；(b) 一致（点名 fs 与 `Shared/Drafts/`） |
| `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` | `packs/v5r/blueprint.js:2203` | 无 | v5r-blocks-b.js:886（`reindex` 收编句） | (a) MISSING；(b) 一致 |
| `VMU_OFFICE_CONSULT_REQUIRED` | `kernel/paper.js:337` | 无（中文「所办答复后重试」） | —（12 份装配 0 命中） | (a) MISSING；(b) D-CLASS：hint 写 `consult({paperId…})`，工具面是 `vibe_v5_paper {action:"consult",target…}` |
| `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` | `packs/v5r/tools.js:6991` | 无（中文「可达替代（不用重试 compile）」） | —（0 命中） | (a) MISSING（语义有、标记语言不同 ⇒ D-CLASS 同义标记两种语言） |
| `VMU_TURN_UNKNOWN_FIELD` | `kernel/turn/index.js:2929（另 :3121/:5747）` | 无 | v5r-core.js:563（手抄 29 字段清单） | (a) MISSING；(b) D-CLASS：同一事实两名读者（提示词里的清单副本） |
| `VMU_MAILBOX_ACK_UNKNOWN` | `kernel/mailbox.js:1047` | 无 | v5r-blocks-b.js:921（ack 教学，未点名该码） | (a) MISSING；(b) 未点码 |
| `VMU_TURN_DELIVERY_SHAPE` | `kernel/turn/index.js:2696` | 无 | —（装配文本 0 命中 adapter 契约） | (a) MISSING；(b) GAP |

### 14.1 结论（红清单 → D-2 已落地）

D-1 测到：12 码中只有 **2** 个回执 hint 带 `REACHABLE INSTEAD:`（`VMU_TURN_REENTRANT`、`VMU_TURN_PARKED_NEEDS_OWNER`，都是 turn 锁/停靠门），**10 个缺**（`MEETING_NOT_STARTED`、`MEMBER_SESSION_NEVER_OPENED`、`TURN_ALREADY_PARKED`、`BLUEPRINT_MD_MISSING`、`BLUEPRINT_MD_DRIFT`、`OFFICE_CONSULT_REQUIRED`、`PAPER_EXECUTOR_MISSING`、`TURN_UNKNOWN_FIELD`、`MAILBOX_ACK_UNKNOWN`、`TURN_DELIVERY_SHAPE`）——这就是 D-2 的工作清单。

**D-2 落地（2026-11-09）：12/12 全部带标记**（state-lane 3 码、notice-lane 2 码、md-lane 5 码），每条都是「标记 + 具体替代动作」而不是光贴英文标签；套件 §1 因此加了一条防交差的断言：**标记之后必须有 ≥12 个非空白字符，且含 `(` 或真工具名**（`vibe_*`）——只贴标签的 hint 会被这条抓住。

**标记语言约定（Lead m05579 ①）**：`REACHABLE INSTEAD:` 是**契约标记**，产品侧必须逐字使用这个 ASCII 串（它是机器可读的对外承诺，同义中文无法被一条判据守住，先例是 `VMU_TURN_REENTRANT` / `VMU_TURN_PARKED_NEEDS_OWNER`）；**标记之后的替代动作描述按产品语言书写（中文可以）**。判据 (a) 保持 `hint.includes('REACHABLE INSTEAD:')`，**不放宽成「中文也算」**。

上表的 (a) 列是 **D-1 时点快照**（历史证据，保留不删）；「判定」列里标 MISSING/D-CLASS 的就是 D-2 已修掉的项。

### 14.2 D 类发现（同一事实两名/两形，D-2 一并处理）

1. **同义标记两种语言**：`PAPER_EXECUTOR_MISSING` 的 hint 已有「可达替代（不用重试 compile）」、`OFFICE_CONSULT_REQUIRED` 已有「所办答复后重试」——语义上正是 (a) 要的东西，但不用 `REACHABLE INSTEAD:` 这个英文标记。**Lead m05579 裁定：统一用 ASCII 标记**（判据 (a) 的字面就够，不把中文对应算进去），其后动作可中文——见 14.1 的语言约定。
2. **hint 与工具面两名**：`OFFICE_CONSULT_REQUIRED` 的 hint 写 `consult({ paperId… })`，而工具面/装配文本是 `vibe_v5_paper { action:"consult", target… }`——照 hint 抄调用会打错；属产品侧（md-lane 写域），D-1 只记红。
3. **字段清单副本**：`UNKNOWN_FIELD` 的提示词（`v5r-core.js:563`）手抄了 29 字段清单，内核按 `known fields:` 动态拼装——同一事实两个读者；D-2 应删提示词里的手抄副本、改为「回执会列出 known fields」，并留「提示词不再有清单副本」否定断言。

### 14.3 边界

- 不含 `VMU_QUOTA_EXCEEDED`（Lead 裁定：其 hint 由 `kernel/meetings.js:4621` + `capacity.js:216` 两处拼装，是唯一「源分裂」的码，另立专项）。
- `abandon` 码位是**结构豁免**：套件 §E 只断言 hint 里出现 `abandon` 这个词，不钉措辞——TB-2639 / task-120 收口后删豁免、转成 (a) 的硬断言。
- D-1 不把任何 boot 面/产品面计数记成已知红；`VMU_TURN_DELIVERY_SHAPE` 的 hint 源在 adapter 边界（`kernel/turn/index.js:2696`），该码属 state-lane。

## §15 RUN 258 / AUDIT-14 —— 判据「能过假话」与 hint 照做实测

### 15.1 触发：`markerTailIsConcrete` 会放行一句假话

D-2 的判据是「`REACHABLE INSTEAD:` 之后 ≥12 个非空白字符，且含 `(` 或工具名」。它能挡住「只贴标签」，但挡不住**点名的东西不存在**：`VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` 的 hint 教 `vibe_vmu_env { action:"probe", need:"latex" }`，而合法 need 表（`vibe-math-vmu/settings/env-needs.js:6` `ENV_NEEDS_DEFAULTS`）只有 `xelatex/latexmk/pdflatex/lualatex/tectonic`，**没有 `latex`** ⇒ 照做得到 `VMU_ENV_UNKNOWN_NEED`。这不是文案问题，是**回执对外承诺的工具/枚举值不存在**。

### 15.2 新判据（`tests/vmu-run257-refusal-hints.test.mjs` §3/§4）

- **§3 引用必须存在**：从每条真 hint 里解析出 `vibe_*(人读工具名)`、`action:"…"`、`op:"…"`、`need:"…"`；工具名必须在已发布工具面（boot 时捕获的 `specs`）里，`need` 必须在 `ENV_NEEDS_DEFAULTS` 的键里，枚举值必须在该工具 `parameters.properties.<key>.enum` 里。红单直接打印违规项，而不是只说「有错」。
- **§3c 回执数据也要查**：`reachableInstead` 不是 hint 字符串，§3 解析不到；扫描 `packs/v5r/tools.js`/`blueprint.js` 里每个字面 `need:"…"` 对 `ENV_NEEDS_DEFAULTS` 校验，并断言 `ENGINE_NEEDS` 是从注册表派生的、且至少两处 splice 使用（否则「没有坏字面量」可以靠「一个 need 都不写」满足）。
- **§4 照做必须换码**：对可脚本化的 6 个码字面照 hint 再调一次，断言「第二次不是同一个码」且「hint 教的动作本身不是 malformed/unknown」。不能脚本化的 6 个码在 `followSkipped` 里**逐条写理由**（可修性/结构豁免/外部 seam），一条也不静默漏掉。
- **集合 pin**：`EXPECTED_CODES` 与 `CODES` 做集合相等（`deepEqual([...new Set(...)].sort(), ...)`），删一码加一码不再是绿。
- 顺带修 O-4：文件头改成它真正断言的三件事（§1 产码、§3 引用存在、§4 照做有效），不再自称「检查装配提示词」。

### 15.3 实测：先红后绿（同一套件，2026-11-09 工作树）

修前 `node tests/vmu-run257-refusal-hints.test.mjs` == **72 passed / 5 failed**（红单见表）；A/B/C 落地后 == **79 passed / 0 failed**。红→绿逐条：

| # | 码 | 修前第二次调用 | 修后第二次调用 | 改动落点 |
|---|---|---|---|---|
| 1 | `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` | `VMU_ENV_UNKNOWN_NEED`（hint 的 `need:"latex"` 不在声明表） | 照 hint 的 `need` 再探针，行为可解释 | `packs/v5r/tools.js` hint 改由 `ENV_NEEDS_DEFAULTS` 派生 |
| 2 | `VMU_MEMBER_SESSION_NEVER_OPENED` | `VMU_INVALID_ARGUMENT`（`hire {slot:"member"}` 缺 `member`） | 两步：`roster` 取真 id → `hire {member_id, institution}` 不拒 | `packs/v5r/tools.js` hint 重写 |
| 3 | `VMU_MEETING_NOT_STARTED` | 同一个码（冻结钟下 `beat` 不推进 `startsInMs`） | **迁入 `notActable`**：hint 明说没有任何动作能让它开始，理由点名 `startsInMs`/`waitingFor` | `kernel/meetings.js` hint 改诚实 prose |
| 4 | 汇总 | 三条使「点名的动作都可执行」为空 | 空（`follows(5)+followSkipped(6)+notActable(1) === 12`） | — |

**A（need 从注册表派生）**：`packs/v5r/tools.js` 新增 `import { ENV_NEEDS_DEFAULTS } from '../../settings/env-needs.js'` 与 `ENGINE_NEEDS`/`ENGINE_NEED` 两个派生常量（按 `probe.command` 匹配 `latex|tectonic`，实测得到 `xelatex / latexmk / pdflatex / lualatex / tectonic` 五个真值，优先 `xelatex`）。hint 里写 `need: "<ENGINE_NEED>"` 并把五个真值全部点名（换引擎就换词；注册表外的字符串会被判 `VMU_ENV_UNKNOWN_NEED`）。

**B（hire 教两步，而不是硬编码成员）**：hint 第一步 `vibe_vmu_control {action:"roster"}` 读 `roster[i].id`（用真 id，别编），第二步 `vibe_vmu_control {action:"hire", slot:"member", member_id:"<roster 里那个 id>", institution:"<本部署机构名>"}`（三者必填；内核没有缺省机构）。判据按同两步脚本化：`roster` → 取 `ids`（优先 `r-2`）→ `hire` → 断言第二次不是拒码。§3 的校验器对 `member_id:"<…>"` 这类自由字符串形参不做枚举校验（它本来就不是 enum），但**不跳过**工具名与动作的存在性校验。

**C（会议：诚实 prose，不编动作）**：`kernel/meetings.js` 的 `VMU_MEETING_NOT_STARTED` hint 删掉 `beat() is the clock`，改为「框架不持钟、也不推进钟：`beat()` 只是碰一下，调用方持钟且钟不走时 `startsInMs` 不变」；`REACHABLE INSTEAD:` 之后写「现在没有」，并逐条点名为什么每个候选不成立（`beat` 不动钟、`proceed` 在 `scheduled` 态回 `VMU_STATE`、`attend` 只登记出席），最后给出读者能自己核对的证据键（`startsInMs` / `waitingFor` / `state`）。这一条在 §4 里记入 `notActable`（理由 ≥40 字），**不是** `followSkipped`——它表示「我们确认没有可达动作」，不是「外部依赖、我们没修」。

### 15.4 归属与改动清单（含跨写域）

- **`packs/v5r/tools.js`**（md-lane 写域；lead 给窄口独占）：只改三个 hint 字符串本体 + 一个注册表 import 与两个派生常量；同文件其它行（回执字段、`ret.awaiting`/`blocks`/`readerCard`）未动。
- **`kernel/meetings.js`**（notice-lane 写域；同上窄口）：只改 `VMU_MEETING_NOT_STARTED` 的 hint 字符串，未碰会议状态机。
- **`packs/v5r/prompts/v5r-blocks-b.js:602`、`v5r-core.js:608/647`**（我的写域）：`need:"latex"` → `need:"xelatex"`（+6 字符，水位见 `tests/vmu-run256-prompts-compress.test.mjs` §5c）。
- **跨写域测试 pin**：`tests/vmu-run254e-attendance-notice.test.mjs` §2c 原来 pin 了 `hint.includes('beat() is the clock')`；C 把该句删掉后这条会红，改为「hint 说 beat 只是碰一下（`beat() is only a touch`）且不再声称 beat 移动钟」——把假话从 pin 里拿掉，而不是放松断言。
- **第 4 处也修了（lead 批准后补的窄口）**：`packs/v5r/tools.js` 的 `final` 回执 `reachableInstead` 里同样拼了假 `need:"latex"`；现在两个站点都从 `ENGINE_NEED` 拼，且 §3c 扫 pack 源里每个字面 `need:"…"`（对 `ENGINE_NEED` 的派生加『至少 2 处使用』非空洞守卫）。这一处 §3 抓不到（它不是 hint，是回执数据），所以单独立 §3c。

### 15.5 连带收口（AUDIT-14 O-3 / O-4 / T9）

- **O-3**：`tests/vmu-run257-prompt-receipt-parity.test.mjs` 的语料路径改为**参数**（`argv[2]` 或 `VMU_PROMPT_RECEIPT_CORPUS`），仓库根由 `import.meta.url` 推出；语料缺失时**直接 FAIL 并 exit 1**（拒绝 skip、拒绝零检查假绿），并新增 `S0b`「pairs>0 且 receipts>0」。实跑 **97/0**。
- **O-4**：文件头已按实际断言重写（见 15.2）。
- **T9**：仓库根三个 0 字节 untracked 文件（`三张表分别是「sim`、`不在此重复（避免两处真相）。`、`本文件是**唯一出处**；`，mtime 2026-11-09 15:12:12）确认为 `docs/acceptance/sim-gate-scope.md` 写入时的 shell 重定向事故残留，不属任何车道产物，已删除（证据 `D:/_tmp/audit14-t9.txt`）。

### 15.6 教训

1. **判据允许「有标签」就等于允许假话**：只要不校验被点名对象的**存在性**，文案越顺口越危险。
2. **「照做一次」是唯一能证伪 hint 的断言**：静态检查管存在性，行为检查管有效性；两者缺一，hint 仍可把人送进死循环（DRIFT 的 reindex 空操作就是同一类）。
3. 冻结钟下的一切「等一下就会好」都是假话——时钟契约（TB-2623）必须在 hint 里具名，而不是留给成员猜。
4. **不是每个 hint 都必须有「可达动作」**：没有出口时，诚实的 `notActable` 比编一个动作好；判据要能表达「已确认无出口」，否则写测试的人会为了变绿而编。

### 15.7 机制缺口（报 lead，非本车道修）

冻结钟探针（`clock: () => Date.UTC(2026,0,1)`，`convene at: +3600s`）：

- `vibe_vmu_control {action:"beat"}` → `{ok:true, beats:1, meetings:{sweep:{swept:0, transitions:[]}}}`；`vibe_vmu_meeting {action:"status"}` 的 `startsInMs` 仍 3600000（钟未推进）。
- `vibe_vmu_meeting {action:"proceed"}` → `VMU_STATE`「proceed() only applies to a meeting WAITING for its scheduled start: m9 is scheduled」。
- `vibe_vmu_meeting {action:"attend"}` → `{ok:true, late:false}`，会议仍 `scheduled`；`speak` 仍 `VMU_MEETING_NOT_STARTED`。
- 工具面：`vibe_v5_meeting` 只有 convene（`status`/`proceed` 是 `vibe_vmu_meeting` 的动作）；`vibe_vmu_meeting` 的 action 枚举里有 `schedule/extend/wait/unwait/proceed`，**没有 `reschedule`/`advance`**，也没有「推进注入钟」的动作。

结论：**「会议到点不自开」目前没有任何成员可达的出口**，只能由持钟方推进时钟。建议内核加 `reschedule`（或让 `beat` 接受显式 `advanceMs`）；落地后把 `notActable` 里的这条移回 `follows`，hint 换成真工具。**我不改 `kernel/meetings.js` 的状态机。**

### 15.8 待办（与本轮遗留）

- ~~`packs/v5r/tools.js:6827` 的第二个 `need:"latex"`~~：已修并由 §3c 守住（见 15.4）。
- ~~`tests/vmu-run257-refusal-hints.test.mjs` 的 `CLOCK`~~：已闭环（TB-2655 落地后实测）。该套件的钟已回到 `const CLOCK = 1000`，**83/0 通过**——说明 `packs/v5r/blueprint.js` 的 kernel-seam 调用点现在都带 `kernelClock:true`，注入 1000 不再被区间闸拒成 `VMU_V5R_CLOCK_VALUE_INVALID`。教训：判据被迫迁就实现（改用真实年份）时，要把它记成「临时仪器」，实现补齐后必须验证能回到仪器的原值，否则豁免会沉淀成永久放宽。

## §16 task-144（TB-2664）A2 剩余 6 对：判定与提案

### 16.1 触发

TB-2638 消掉 `consult` 两条后，A2 由 8 对降到 6 对（RUN 258 校准语料 `D:/_tmp/sim/corpus-end-to-end`，parity 套件 §S4d 实测 `8,22,23,31,33,47`）。lead m06848 要求逐条判死，并留了「若 ≥3 对实质不必教 ⇒ 写判据过严 + 提案」的退路；判据本身由 lead 裁定，我不改。

### 16.2 判定（6/6「不必教」）

- **records 4 对（P8/P31/P33/P47）→ `SELF-EVIDENT`**：回执自带 `identity.means` 记账恒等式与各筛选维度的 `*Means`（15 个读数里 9 个有同名伴读，其余由恒等式/`limitMeans`/`timeFilterMeans` 覆盖或本身为 null）；且 `vibe_vmu_records` 在 12 份提示词里 0 次——这是 §S4a `genericToolGap` 已单独记录的「工具面未教」，A2 再按 pair 数一遍是同一缺陷记两次。
- **verdict_ask 2 对（P22/P23）→ `NOT-FOR-THIS-SEAT`**：该动作 chair-only（非主席 ⇒ `VMU_NOT_PERMITTED`，`packs/v5r/tools.js:3960-3963`；spec 描述 `tools.js:7463` 写 `the CHAIR asks`），场景以 `as: roster[0]` 由主席发起、却抓了成员回合作 `nextPrompt`（`scripts/sim/scenarios/end-to-end.mjs:602-610`）；5 份 chair 提示词各教 3–4 次。
- 6 对的 `caller` 全为 `null`：records 4 次是场景桥接读（`end-to-end.mjs:466-481/715-724/884-890`），根本没席位在做这个调用。A2 的隐含假设「回执读者＝发起者」在这 6 对上不成立。

完整表、证据原文、提案与预期数字见 `prompt-vs-receipts.md` §14（本轮新增）。

### 16.3 提案（交 lead 裁定，未实施）

P1 席位错配不计（只计 `caller != null` 且席位等于 `nextPrompt.seat`）⇒ A2 变空、6 对进 `seatMismatch`；P2 已属 §S4a `genericToolGap` 的工具不重复逐对计 ⇒ 剩 `[22,23]`；P1+P2 ⇒ `A2=[]`，`S4a` 仍照报工具面缺口。建议 P1+P2；不单独建议 P3（自述即算教过——那会把判据改成另一个问题，宜另立 S4e）。**本轮未实施任何一条。**

### 16.4 数字与门禁（本轮实测）

| 项 | 本轮 |
| --- | --- |
| A2（快照口径） | 8 对：`8,22,23,31,33,41,42,47`（RUN 255 快照，`S4d` 期望串未动） |
| A2（当前语料实测） | 6 对：`8,22,23,31,33,47` |
| 判定 | TAUGHT 0 / SELF-EVIDENT 4 / NOT-FOR-THIS-SEAT 2 / DROP 0 |
| 提示词改动 | **0 字符**（本轮不改提示词） |
| `vmu-run257-prompt-receipt-parity.test.mjs` | 97 / 0 |
| `check-docs` | PASS（0 CR） |
| `audit-prompt-budget --check` | PASS（chair/meeting 34 671 < 36 500，cap 未动） |

### 16.5 教训

1. **判据要问对主语**：「回执里的读数，下一份提示词教没教」只有在「下一份提示词属于发起该动作的席位」时才成立；语料不记 caller 时，这个前提是隐形的。
2. **同一缺陷不要在两条判据里各记一次**：工具整体缺席（S4a）与逐对读数未教（A2）是两个层次；A2 对 `genericToolGap` 里的工具逐对计数，会把「要不要加工具目录」这种已被 RUN 247 否决的方案重新当成解法。
3. **「不必教」也要有证据**：SELF-EVIDENT 的判据是「回执自带恒等式/伴读」，不是「我觉得够清楚」——所以本轮把 `identity.means` 原文、伴读键的数量与清单都写进了 §14.3。

### 16.6 遗留

- 提案等 lead 裁定；裁定后若实施，需同步 `S4d` 期望串与 §13 快照口径（两个数并列保留）。
- 无 TAUGHT 判定 ⇒ 无「删句变红」实测；若某对改判 TAUGHT，实施时补。
- `prompt-vs-receipts.md` §13 的历史数字未动。

### 16.7 裁定落地（RUN 260，lead 接受 P1+P2）

- 口径写死：A2 只计「caller 存在且 caller 席位 === `nextPrompt.seat`」的 pair；同时必须输出 `noCaller`（快照 8 条，逐条 `why:"bridge-read"`）与 `seatMismatch`（快照 0 条）两个具名计数器，`toolLevelGaps` 保留 records/vote 的工具面读数。
- 正控制：套件内合成 caller-matched pair（records，含未教读数）**必须**进 A2（S4f1）；两条负控制（教过即掉出、席位不符即掉出）同段实测。套件 **107 passed / 0 failed**。
- 数字三行并列（见 `prompt-vs-receipts.md` §14.8）：快照 8 / 当前旧口径 6 / 新口径 **0**；**0 是口径变更，不是缺口被修好**。
- 死分支 `vibe_vpu_records` 已并入 `vibe_vmu_records` 计数分支（保留 `return false` 会让快照 8→4，与已知 6 对冲突）；**数字变化 0**。
- **回升预告**：pair 生成侧席位错配的修正并入 TB-2648（sim-lane），修正后 caller 被记录，A2 可能回升；回升部分才是真缺口，不许拿 0 当长期基线。task-144 在 sim-lane 修完、我复跑给出回升数字后才算 complete。

### 16.8 二审裁定落地（m07103：两个问题各有一个数 + 守恒等式）

- **四桶拆分**（`tests/vmu-run257-prompt-receipt-parity.test.mjs` §S4e）：`a2`（pair 级）/ `toolGapPairs`（因工具整体未教被排除，逐条 id+tool）/ `noCaller`（快照语料无 caller 的余项，逐条 `why:"bridge-read"`）/ `seatMismatch`；`toolLevelGaps` 去重到每个工具一条。快照实测：`a2=[]`、`toolGapPairs=8,31,33,47`、`noCaller=22,23,41,42`、`seatMismatch=[]`、`toolLevelGaps=vibe_vmu_records,vibe_vmu_vote`。
- **守恒等式**：`S4e8`/`S4e9` 断言四桶之和 === `wouldBeGap` 总数（8）、并集逐字等于 `S4d` 集合；`S4e10` 保留 m07103 的两项式（余项具名）。**红一次实测**：临时 `counted.pop()` ⇒ 110/2，红字 `got 7 expected 8` 与 `got "8,22,23,31,33,41,47" expected "8,22,23,31,33,41,42,47"`；恢复后 **112/0**。
- **控制五项**（§S4f）：未教工具的 pair 归 `tool`；caller/席位相符 + 未教 ⇒ 必进 `a2`；教过 ⇒ 掉出；席位不符 ⇒ `seat-mismatch`；把工具从 `toolLevelGaps` 去掉后其 pair 由谓词重算回到 `a2`（**工具级缺口的关闭可观察**）。
- **读数规则**：`a2=[]` + 非空 `toolLevelGaps` ⇒ 「**pair 级干净、工具级有病**」；`toolLevelGaps` 非空时套件紧跟打印「工具面整体未被教：… 这不是 pair 级缺口，也不会因为教了一句就消失」。
- **教训**：① 「工具级缺口的最小关闭单位是工具，不是 pair」；② 判据里的死名字（`vibe_vpu_records`）不会让任何东西变红——判据里的标识符必须能被注册表校验；③ 守恒等式必须实测会红，否则只是注释。
- 数字：`prompt-vs-receipts.md` §14.8 表格**新增第四行**（旧三行不改）；口径变更不是缺口修复，回升部分才是真缺口（依赖 TB-2648 的 caller 生成侧修正）。

## §16.9 TB-2661 后：`proceed` 从不可行动移回可跟进（RUN 262）

**触发**：lead m07205。TB-2661（notice-lane，RUN 262）给 `scheduled` 态补上了真出口：主席 `proceed()` 在考勤规则满足时立即开会（记 `startsEarly`/`earlyByMs`），未满足时回执具名 `attendance.missing`；`beat()` 仍只 touch、不推进钟。此前本轮的判据把 `VMU_MEETING_NOT_STARTED` 归在 `notActable`（「此处没有任何可达动作」），这一归类现在**过时了**：它不再是一个「没有路口」的缺口，而是一个「有路口、只是要走两步」的常态拒绝。

**改了什么**（只改一处语义，不重排）：

1. 判据桶：`VMU_MEETING_NOT_STARTED` 从 `notActable` 移入 `follows`；等式由 `5 + 6 + 1 === 12` 变为 **`6 + 6 + 0 === 12`**（改数字不改口径）。`notActable` 桶保留为空并带注释：它仍然被测量，将来若出现真的「无路口」码，必须具名放进来，而不是悄悄消失——覆盖率等式会抓。
2. 驱动（照 hint 字面走两步）：先给 `m9` 的两名成员 `vibe_vmu_meeting {action:"attend", id:"m9", member}` 签到，再由主席 `vibe_vmu_meeting {action:"proceed", id:"m9", member:"r-acad"}`；实测回 `ok:true, state:"open", startsEarly:true` ⇒ 第二次调用既不是同码、也不是 `MALFORMED`（`VMU_STATE` 只会在考勤不满足时出现，而 hint 说清了先 attend）。另加一条断言：§1 的回执 hint 本身必须点名 `proceed`——迁移只有在回执确实指向这个动作时才成立。
3. 提示词（`packs/v5r/prompts/v5r-blocks-b.js`，我的写域）：`at` 预约段两处把「开始前一切治理动作都被拒」改成带例外的真话——
   - chair 变体：「开始前的治理动作都被具名拒；例外：`attend` 可提前签到（不开会）、主席可 `proceed` 提前开（记 `startedLate`）。」
   - 另一席变体：「`at` 预约会开始前拒**治理动作**（例外：`attend` 可提前签到、主席可 `proceed` 提前开），到点不会自己开」。
   净字符：新增句 +21，同段删冗余 **−16**（「**立刻**可读」的「立刻」、「回执记」的「回执」、「两个具名出口」的「具名」、「其余只有你 `proceed`」的「你」、「迟到入席由每会参数」的「由参数」、「回执的 `nextActions` 直接列出」的「的/直接」、「命令随类型与身份不同」的「与」）⇒ 净 **+5**；`audit-prompt-budget --check` **PASS**（chair/meeting **34 670** < 36 500，cap 未动）。预约/会中段不进 normal 三份装配，故 `vmu-run256-prompts-compress` 的绊线 74 214 未变（30/0）。
4. pack 回执散文（`packs/v5r/tools.js` 的 `scheduleNote`）：「开始前所有治理动作都被拒」后补「；例外是主席的 proceed()（可提前开会，回执记 startsEarly/earlyByMs）」，并把 ① 的「唯一被豁免的动作」改成「被豁免的动作之一（另一个是主席的 proceed()）」。回执文本不进提示词预算。

**实测**：`tests/vmu-run257-refusal-hints.test.mjs` **87 passed / 0 failed**；`vmu-run239-prompts` 158/0、`vmu-run247-prompt-dedup` 74/0、`vmu-run256-prompts-compress` 30/0、`vmu-run257-prompt-receipt-parity` 112/0、`check-docs` PASS（0 CR）。

**两类「做不了」的边界（教训）**：`followSkipped` 记的是「外部依赖/结构豁免」（比如要外部 seam 的 delivery shape），`notActable` 记的是「机制缺口：此处真的没有动作」。TB-2661 把后者的一条补成了前者之外的可跟进动作——所以桶该挪，而不是把 hint 改成「没有动作」硬留。**判据跟着机制的事实走，不跟着上一轮的结论走。**

**遗留**：等 TB-2648 的 caller 生成侧修正落地后复跑四桶（§16.8），届时 `noCaller` 归零、`toolGapPairs`/`seatMismatch` 按实测改数字，不改断言。
## §16.10 task-154 / TB-2672：G8/G14 从「关键词 pin」升级为「装配后整句」

**16.10.1 问题。** rules-recheck 在 TB-2660 矩阵里把 G8/G14 判成 `PROMPT-TEXT`（有判据、不是纯散文），但拆开看，两条判据都只是**关键词级**：`tests/vmu-turn-mainline.test.mjs` §1b 只 grep `类似问题`（G14），§1c 只 grep `蓝图`（G8）。这类 pin 对两种最该抓的变异是全盲的——**删掉条件半句**（`；不是零散任务清单，每一步都要能说清在蓝图上推进了什么`／`——先查蓝图与归档，能迁移复用就复用，别重复探索`）和**语义反转**（`不是`→`可以是`、`别重复探索`→`可以重复探索`）——因为那个词还在。判据和规则不是一回事：词在，不等于这句要求还在。

**16.10.2 判据：装配后整句。** 两条整句常量写进套件头部，在 `loop.assemble` 的**真装配文本**上逐席断言（三席 × normal）：

- G8：`一条主线＝**原问题的实现蓝图的策划、细化、调整，以及由粗到细的构建、扩张、推进与实现**；不是零散任务清单，每一步都要能说清在蓝图上推进了什么。`
- G14：`③**以前是否处理过类似问题**——先查蓝图与归档，能迁移复用就复用，别重复探索。`

判据选「整句」而不是「主干」的理由：G8 的**否定面**（不是零散任务清单）和**逐步检验面**（每一步都要能说清推进了什么）就在后半句；G14 的**次序**（先查）和**复用例外**（能迁移复用就复用）就在破折号后。删掉这两半，规则就从「要求」退化成「口号」，而关键词 pin 一点都不会红。
新增 8 条 `ok()`：三席 × 2 条整句（§1c2/§1b2）＋ 2 条非空洞守卫（§1j/§1k：常量本身必须还带着条件半句；若有人把常量裁成关键词，守卫先红，整句 pin 不会「量自己被裁短的副本」而假绿）。

**16.10.3 两条都留。** 关键词 pin 不删，注释降级为 SMOKE，整句 pin 才是 CRITERION。理由：整句 pin 更脆弱（去重/压缩改一个措辞就红），关键词 pin 更便宜（词消失就红）；两个 pin 两个职责，删掉哪个都留一个盲区。

**16.10.4 弄假红实测**（副本内变异 + 立刻 restore；`sha256 before = after = d3c69ed12d0866bdda510e2c2adf5cc624a63b1e2fd7994733c0ee4da50a6f29`，`restored=true`；变异脚本 `D:/_tmp/pin2672/mutate.mjs`，红字存 `D:/_tmp/pin2672/red-{a,b,c,d,e}.txt`）：

| 变异 | 结果 | 红字（摘） |
| --- | --- | --- |
| A 删 G8 条件半句 | exit 1 | `§1c2 academician: G8 — the whole sentence is in the assembled prompt … missing: 一条主线＝…；不是零散任务清单，每一步都要能说清在蓝图上推进了什么。` |
| B G8 语义反转（`不是`→`可以是`） | exit 1 | 同上 §1c2 |
| D 删 G14 后半（`——先查…别重复探索。`） | exit 1 | `§1b2 academician: G14 — … missing: ③**以前是否处理过类似问题**——先查蓝图与归档，能迁移复用就复用，别重复探索。` |
| E G14 反转（`别重复探索`→`可以重复探索`） | exit 1 | 同上 §1b2 |
| C 只改措辞（`推进与实现`→`推进和实现`） | exit 1 | 同上 §1c2 |

每次变异后脚本都打印 `keywordsStillThere=true` —— 即：**只靠 §1b/§1c 的旧 pin，上面 A/B/D/E 全绿**。这就是升级的理由，也是「关键词 pin 保留但降级」的实证。

**16.10.5 三类弄假的判定边界。** A/B/D/E 是**真回归**（读者能做的事变了：条件没了、次序反了、允许了本来禁止的行为），必须红。C 是**措辞变更、语义不变**：整句 pin 会红，这是字面判据的**已知代价**，不是误报要求修判据——处置是「同一次提交里更新 pin，并在提交说明写『措辞变更，非行为回归；整句 pin 随文更新』」。反过来，如果把 C 判成「pin 太脆该放宽」，那就又回到关键词 pin 的老路：只保留主干，A/B/D/E 就全溜过去。

**16.10.6 门禁与水位。** 本任务**不改提示词**（0 字符），`audit-prompt-budget --check` 不变（chair/meeting 34 663 < cap 36 500）；`node tests/vmu-turn-mainline.test.mjs` **2 tests / 0 fail**；`node scripts/check-docs.mjs` PASS。

**16.10.8 通则：判据里的「期望值」本身必须有守卫。** 这是「判据量错了东西」的二阶版本：如果期望值以**副本**形式活在套件里（两条整句常量就是副本），那么把副本裁短、或把副本改成别的句子，判据就会静默变绿——它量的不再是规则，而是「副本还等于它自己」。本任务的两道防线：① `§1j/§1k` 非空洞守卫断言常量**仍然带着让规则成立的那半句**（条件半句/复用例外），常量被裁成关键词时先红；② 常量旁边留注释，写明「这条变红必须由人确认是措辞变更而非行为回归，不许直接改常量静默关灯」。推广规则：**凡是把外部事实抄进判据当期望值的地方，都要给这个期望值再加一条「它没有退化成空壳」的守卫**，否则改期望值就是合法的关灯方式。

**同一病在本轮的四处实例**（这是判据工程通则，不只适用于提示词）：

| 实例 | 期望值是什么 | 守卫状态 | 判定 |
| --- | --- | --- | --- |
| ① 提示词整句常量（`tests/vmu-turn-mainline.test.mjs` 的 `G8_SENTENCE` / `G14_SENTENCE`，§1c2/§1b2） | G8/G14 整句的副本 | **有守卫**：`§1j`/`§1k` 断言常量仍带条件半句与复用例外，常量被裁成关键词时先红；常量旁的人工确认注释挡住「改常量关灯」 | 本轮正面例子 |
| ② `docs/acceptance/fidelity-branch-baseline.json` 的 7 条 stale 声明 | 把「某分支已就绪/某事实成立」抄进 JSON | **无守卫**：事实变了它不会自己红，只靠外部 stale 检查兜住（检查缺席时就静默通过） | 反面；建议给每条声明加 `date` + `source`，过期即红 |
| ③ `tests/vmu-run257-refusal-hints.test.mjs` 曾经的 `CODES.length === 12` | 码集合只锁了**数量** | **只有数量守卫**：换掉一个码再补一个，12 仍是 12 | 反例；RUN 260 已改成 `EXPECTED_CODES` 集合相等 |
| ④ `tests/vmu-run257-prompt-receipt-parity.test.mjs` 的 S10 报告行解析器（原 `doc.split('\n').filter((l) => /^\| \d+ \|/.test(l))`） | 「Q2 报告里那 47 行」抄成全文正则 | **只有形状守卫、没有位置守卫**：同一份文档里任何 `\| 数字 \|` 开头的行都会计入 | 反例已修；RUN 262 改成 `reportRowsOf`（锚定 `## §2` 到下一个 `## §`、表头 `\| # \|`、固定 9 格、区外返回 0 行） |

第 ④ 例的实测对照（不是推测）：把 §15.6 表首格改回旧形态 1/2/3 后，旧正则在**同一份文档**上数出 **50 行**（比 47 多 3 行，全部来自 §15 的表格，与 Q2 报告无关）——而它当时是绿的，也就是说「文档里加一张数字表格」就足以让这条计数判据量错东西。换成 `reportRowsOf` 后同一文档仍数出 47，且 S10k0–S10k3 四条反关灯分别钉住「§2 区外数字表不进」「表头前数字行不进」「无 §2 段=0 行（不许退回全文扫）」「有表头无行=0 行」。教训：**形状能锁住「像不像」，锁不住「是不是」**；正则里的位置约束（section 边界、表头、列数）才是判据的边界，找不到目标段时必须返回 0 行而不是退化成全文扫描。

判据工程三句话：期望值应当是**可判真假的引用**而不是副本；只能是副本时，副本必须带非空洞守卫；数量守恒必须升级成集合守恒。


**16.10.7 遗留。** ① A（TB-2648 caller 面）仍未落地（`scripts/sim/run.mjs:235` 还是 `r.as.agent.id` 形状），四桶复跑待 sim-lane；② 台账 `mainline-G8-definition`/`mainline-G14-similar-first` 的 `ruleText` 未改（本任务禁碰台账 JSON），矩阵里 G8/G14 的 `1/1/1/1` 读数含义现在应读成「关键词 + 整句两层」。


## RUN 76 / TB-2711 — prompt-side fixes (peer-review empty template, status board, notices, one ballot name)

- `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js` `v5r-paper-review` (was: `{{ setting:vmu.paper.reviewedMember }}` defaulting to literal `(unspecified)` + two dashed rules with 0 chars between; machine hits r-1 rec-20 / r-2 rec-23): the section no longer prints an unresolved author or an empty body. It names the reachable hops — `vibe_v5_paper {action:"status"}` → `parts`/`reviewOf` recordIds → `vibe_vmu_records {action:"expand", id:"rec-N"}` (truncated bodies carry `truncated:true`/`excerptLen` and are re-pulled by rec id) — and states what the assembler must inject (`审阅对象：<作者 id>`, `正文：<part recordId> <partText>`, 1600-char cap), so an unfilled section reads as "not injected", not "no content". Why: assembly cannot inline-fill here (kernel/prompt/index.js VARIABLE_WHITELIST has no paper rows; a section text is static; an appendPrompt producer would need middleware/host outside the TB-2711 write domain), so the taskbook §6 fallback is the honest fix. Corpus prose the coverage gate counts is preserved verbatim.
- `v5r-blocks-b.js` `v5r-turn-tracks` (status board teaching): the `[状态板]` rows are fixed three columns 「读数｜来源｜取值时刻」, a missing timestamp is named (`时间未提供：…`) instead of left blank, and `[蓝图]` is always rendered — `[蓝图] 无现行版（rev 0，md 未落盘）` when there is no live revision. Why: SIM-REPORT76 §④ 3/4 — the board showed readings without source/time, and the blueprint line disappeared entirely for a rev-0 paper.
- `v5r-blocks-b.js` `v5r-turn-channels` (notices): an empty notice block is named `[新到的消息] （无未结算行）`; the old "无未读则不出现块头" rule is gone. Why: §④ 8 — a member read the missing block as lost mail.
- `v5r-core.js` (paper flow, both seat prose + chair consult escape): `start→part→advance→review→final→render`; `final` (chair-only) compiles and writes the pdf row, `pdfBytes` only from compile/final, `render` never compiles. Why: §④ 5 — the flow stopped at render and a member believed render produced the pdf.
- `v5r-reply-channel.js` (closure ballot): `vote_solved` is the one registered entry (counted at closure); `set_solved` is not a registered field and writing it is refused as unknown. Why: FEEDBACK76 #8 — three names for one act.
- `v5r-core.js` receipt contract: `VMU_TURN_NO_FENCE` (no fenced JSON envelope) / `VMU_TURN_BAD_JSON` / `VMU_TURN_DELIVERY_SHAPE` (adapter boundary shape) / `VMU_TURN_DELIVERY_NO_PAYLOAD` (declared, no payload) are named as shape problems with the same repair — fix the reply, do not probe the engine. Code names unchanged by TB-2710 (it renamed only the parked pair, not these).
