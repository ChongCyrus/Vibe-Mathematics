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

- **位置**：`v5r-turn-meeting-agenda`（meeting ×3，36 字）
- **原文（逐字）**：
  > `议程：（类型：，主席：）。本轮绑定该会议：回复第一句请写明会 id（）。`
- **为什么错**：`(类型：，主席：)` 与 `（）` 都是空值拼接；这不是"格式丑"，是**命令**（"回复第一句请写明会 id（）"）在让模型填写一个空字符串。meeting 相位里若会议帧缺失，模型会去猜会议 id（真机 `VMU_NO_SUCH_OBJECT`×72 在 `vibe_vmu_meeting` 面、×40 在 `say` 面）。
- **证据**：该节 3/3 实例均为空占位；`v5r-meeting-ask` 提供了有会议时的正确说法，二者应互斥。
- **替换文本**：
  - 有会议帧时：`议程：{{type}}（主席：{{chair}}）。本轮绑定会议 `{{meetingId}}`：回复第一句写明这个 id，**不要自己编 id**。`
  - 无会议帧时：**整节不注入**（不要输出半句）。

## A8 · 会议动作的「面」归属不清：`v5r-turn-meeting-schedule` 讲 close/attend 却不点名工具

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

- **位置**：`v5r-formal-work` 659（12/12）+ `v5r-formal-plan` 830（verify）+ `v5r-formal-work-rendered` 469（verify）
- **原文**：见 C3。
- **建议**：按 C3 的替换文本执行——非 verify 只留两句，verify 只留 `formal-plan` 一份。预计每回合省 450（12/12 部分）+ verify 轮再省 469。

## D5 · `v5r-math-rules` 与 `v5r-turn-compute` 都介绍 mathtools

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

- **位置**：`v5r-charter-libraries`(1 301)、`v5r-fixture-tools`(2 447)、`v5r-reply-compact`(3 208)
- **原文**：见 B2、D1、D2。
- **建议**：与 B2 一起改——库根/记录本只在 `fixture-tools` 讲一次（D2 的替换文本），`charter-libraries` 只讲"三条硬要求"，`reply-compact` 只讲回执字段表。合计可省 ≈ 600 字。

---

# E. 缺失（真机高频拒绝码没有对应指引）

> 判据：`D:/_tmp/sim/real-stats.md` 里出现 ≥10 次、且当前 12 份装配中没有任何一节能解释"怎么避免"的拒绝码。

## E1 · `VMU_CHAIR_ACT_NOT_DELEGATED`（真机 59 次）：没人告诉"以主席名义动作前要先给主席派回合"

- **证据**：meeting 面第三高拒绝码；`v5r-turn-meeting-schedule`、`v5r-turn-meeting-chamber` 都没有这句话。
- **建议插入**（`v5r-turn-meeting-schedule` ② 末句）：

```text
以**主席名义**的动作（召集、裁决、放行迟到）不能由别人代做：若操作者不是你，必须先用 `vibe_vmu_turn { op:"drive", member:"<院士 id>" }` 给院士派一回合，由他自己做完；否则具名拒 `VMU_CHAIR_ACT_NOT_DELEGATED`。
```

## E2 · `VMU_NO_SUCH_OBJECT`（say 40 次 + vmu_meeting 72 次）：没有"先读状态块取真 id"的规矩

- **证据**：两个面合计 112 次；`v5r-turn-ask`/`v5r-meeting-ask` 只教"用 say/attend"，没教 id 从哪来。
- **建议插入**（`v5r-turn-channels`，230 字，12/12）：

```text
成员、会议、任务、轮次的 id 一律从本回合状态块/回执里**照抄**，不要自己编；拿不到 id 就先读状态（`vibe_v5_overview`、`vibe_vmu_meeting { action:"status" }`），再动作——自造 id 会被具名拒 `VMU_NO_SUCH_OBJECT`。
```

## E3 · `VMU_OFFICE_CONSULT_REQUIRED`（paper 58 次）：提示词里没有 consult 流程

- **证据**：`v5r-tools-academician` 只列 `vibe_v5_paper` 的名字；`v5r-paper-*` 在本夹具未注入（chars=1），无法逐字审。真机 paper 面 `VMU_PACK_V5R_CORE_PAPER_STATE`×99 与 consult×58 说明流程/问询两块都在教。
- **建议**：paper 相位装配后补一节（或并入 `v5r-paper-final`）：

```text
定稿被 `VMU_OFFICE_CONSULT_REQUIRED` 拦时，回执会给 `requestId`：把它交给所办（`vibe_v5_paper { action:"consult", request_id, member:"<所办 id>", answer:"<核对结论>" }`），答完重试 `action:"final"`。普通成员答会被 `VMU_NOT_PERMITTED` 拒。
```

> 需在下一轮**带上 paper 上下文**重装配一次再定稿这段（本夹具无法验证 paper 节内容）。

## E4 · `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（43 次）：只说了"辩论必须给 subject"，没说 subject 必须证明完成

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

- **证据**：verdict 面两个码合计 24 次；`v5r-charter-voting` 讲了门槛，没有讲重复投票与主席署名边界。
- **建议插入**（`v5r-charter-voting`，chair 版，末条前）：

```text
同一场会议、同一个对象，每人只投一次（重复投票会被具名拒 `VMU_RULING_ALREADY_FILED`）；主席不投普通票，只签 `vibe_v5_verdict_final`（以主席名义代替成员交裁决会被 `VMU_RULING_CHAIR_SIGNS` 拒）。要成员交裁决，先 `vibe_v5_verdict_ask`。
```

---

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
