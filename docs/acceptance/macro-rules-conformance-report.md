# 「宏观层面 v5r 运行规则」逐句核对报告（TB-2795）

- **范围**：`D:/wd/vibemath开发/宏观层面v5r运行规则.md`（73 行 / 9,105 B / 2026-11-03 版）→ **N=76 句**，一行一句（矩阵：`docs/acceptance/macro-rules-conformance-matrix.md`）。
- **证据层**：sim `sim-audit-round-15`（17 场景 / 960 steps / 987 receipts / HEAD `20c2a496…`）；真机 RUN 88（13/13 PASS，HEAD 同）＋ RUN 87（失败面记录，用于反灯/对照）；**代码/测试证据 HEAD `f2972c0d`（RUN-88 triage 修复批次）**。
- **自检**：句数守恒 **76/76**；id 唯一；逐字引用 100%；sim/test 覆盖 **75/76（99%）**；纯 docs **1/76**；CONFORMS 行全部含 sim/test/real 行为证据。校验：`node scripts/audit-macro-rules.mjs --check`。

## 1. 判定总表

| 判定 | 行数 | 含义 |
| --- | --- | --- |
| CONFORMS | 64 | 有实现 + 至少一条可复核行为证据 + 无缺项 |
| GAP | 0 | 规则要求的行为在代码/机制里找不到 |
| HALF-BUILT | 11 | 机制在但半成品（有提示词无字段/有字段无校验/产物真值错/计票漂移等） |
| NOT-APPLICABLE | 1 | 比喻/愿景，且给出覆盖点 |

## 2. GAP / HALF-BUILT 清单（owner + 最小修法）

| id | 判定 | 缺什么 | owner | 最小修法 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `FSEAT.12` | HALF-BUILT（P3） | lean_archive 签名保留无效 content 参数（归档只引文件，content 不生效） | lean/impl | F-87-08：移除 content 参数或标注已废弃并在 schema/hint 说明 | RUN 88 + sim |
| `MAIN.4` | HALF-BUILT（P2） | 九个节点字段只有提示词教学：blueprint outline 只有 {id,title,depth}（BLUEPRINT_FIELDS/outline），无字段 schema、无缺字段具名拒、无读面渲染 | blueprint/record-face | 把九字段做成结构化要求：outline entry 增 fields（或新增 direction/route/node 记录型）＋ propose/update 缺字段具名拒＋读面（turn status/blueprint read）渲染；或给蓝图 md 加模板门禁 | sim |
| `MAIN.5` | HALF-BUILT（P2） | 同上：初始计划/启发/初始目标无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.6` | HALF-BUILT（P2） | 同上：相关计划无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.7` | HALF-BUILT（P2） | 同上：可行性评估及原因无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.8` | HALF-BUILT（P2） | 同上：价值性评估及原因无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.9` | HALF-BUILT（P2） | 同上：相关结论/命题/认知/反馈无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.10` | HALF-BUILT（P2） | 同上：障碍及原因无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.11` | HALF-BUILT（P2） | 同上：障碍解决方案无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.12` | HALF-BUILT（P2） | 同上：方案实施情况/效果无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |
| `MAIN.13` | HALF-BUILT（P2） | 同上：过去经验经历无结构化字段（prompt-only） | blueprint/record-face | 同上（九字段 schema） | sim |

**说明**：`MAIN.4–MAIN.13` 是同一缺口的十个字段句（“每条方向/路线/节点至少记录这些字段”），矩阵按句保留、修法共用一条；其余 P1/P2（`DEBATE.6`/`PAPER.2`/`PAPER.3`/`MEET.9`/`EXTRA.5`）已在本轮 impl 批次转 CONFORMS（§8），未转的 `MAIN.4–13`/`FSEAT.12` 见 §8.2。

**NOT-APPLICABLE**：`FSEAT.11`（（就像群论的发明那样，在解决一个实际问题中发明出封装出有价值的一般化理论体系、技…；不适用 — 覆盖点：C9 方法库机制（rules-extra/c9-*））。

## 3. 反灯抽查（≥30% CONFORMS）

- 抽查规则：CONFORMS 行按 id 排序后等距抽样；CONFORMS 共 **64** 行，抽样 **20** 行（31% ≥30%）。
- 每条的“若没实现会怎样红”判据如下；“lamp 执行状态”一列引用 `docs/acceptance/mutation-evidence.md` 的**已执行**变异记录（`PROVEN-RED`/`REHEARSED-RED`；`UNDECIDABLE` 无仓库内灯，已具名）。本轮为只读审计，未改树重跑变异；判据均可由 `node scripts/audit/mutations/run.mjs --all` 复现。

| id | 若没实现会怎样红（lamp 判据） | lamp 执行状态 |
| --- | --- | --- |
| `MEM.1` | 停用/删除实现里的判定（vibe-math-vmu/tools/human.js:102；vibe-math-vmu/packs/v5r/member-scope.js:75；tool）或删掉 sim 步 `comms/message/relay-member-voice (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `A1` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FPUB.3` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/blueprint.js:1257；vibe-math-vmu/packs/v5r/blueprint.js:1）或删掉 sim 步 `mainline/blueprint/propose (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `B4` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FSEAT.1` | 停用/删除实现里的判定（vibe-math-vmu/kernel/records.js:1240；tool vibe_v5_record_progress）或删掉 sim 步 `turns/round-progress-string (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C1` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `FSEAT.4` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/tools.js:2584；vibe-math-vmu/packs/v5r/verification-gates）或删掉 sim 步 `paper/record/proposition/r-1 (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C5` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FSEAT.7` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/tools.js:2584；vibe-math-vmu/packs/v5r/verification-gates）或删掉 sim 步 `paper/record/proposition/r-1 (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C5` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FSEAT.10` | 停用/删除实现里的判定（vibe-math-vmu/kernel/library.js:35；vibe-math-vmu/kernel/library.js:163；tool vibe）或删掉 sim 步 `rules-extra/c9-method-record (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C9` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FSEAT.15` | 停用/删除实现里的判定（vibe-math-vmu/kernel/lean.js:1122；vibe-math-vmu/kernel/lean.js:1024；tool vibe_v5）或删掉 sim 步 `rules-extra/c10-lean-archive-refused (refuse)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C10` = **UNDECIDABLE**（改坏机制 ⇒ 点名断言红的执行记录） | UNDECIDABLE |
| `FSEAT.18` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/tools.js:1515；tool vibe_v5_feedback）或删掉 sim 步 `rules-extra/c15-feedback-add (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C15` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `FSEAT.21` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/tools.js:1515；tool vibe_v5_feedback）或删掉 sim 步 `rules-extra/c15-feedback-add (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `C15` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `MAIN.3` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:25；tool vibe_v5_blueprint）或删掉 sim 步 `turns/prompt-matrix (prose)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `G10` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `MAIN.16` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:26；tool vibe_v5_blueprint）或删掉 sim 步 `turns/prompt-matrix (prose)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `G13` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `ROUT.2` | 停用/删除实现里的判定（vibe-math-vmu/kit/handlers.js:602；vibe-math-vmu/kit/handlers.js:523；tool vibe_v5）或删掉 sim 步 `comms/mailbox/send (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `D2` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `ROUT.5` | 停用/删除实现里的判定（vibe-math-vmu/kernel/turn/index.js:1598；vibe-math-vmu/kernel/turn/index.js:1600；）或删掉 sim 步 `comms/panel/set/own (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `D4` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `ROUT.8` | 停用/删除实现里的判定（vibe-math-vmu/kernel/turn/index.js:1598；vibe-math-vmu/kernel/turn/index.js:1600；）或删掉 sim 步 `comms/panel/set/own (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `D4` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `MEET.3` | 停用/删除实现里的判定（vibe-math-vmu/kernel/meetings.js:4730；vibe-math-vmu/kernel/meetings.js:1608；tool）或删掉 sim 步 `meetings/schedule/absolute-iso (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `E1` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `MEET.6` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/meeting-tool-face.js:115；tool vibe_v5_meeting_round）或删掉 sim 步 `actions-extra/M/pack-meeting/types (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `E12` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `MEET.9` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/tools.js:1153（assign 走 tasks.assign 同一 readiness 判据；无 br）或删掉 sim 步 `actions-extra/M/pack-meeting/task-assign (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `E18` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |
| `DEBATE.3` | 停用/删除实现里的判定（vibe-math-vmu/packs/v5r/verification-gates.js:491；vibe-math-vmu/packs/research-c）或删掉 sim 步 `rules-extra/c11-fidelity-needs-lean (refuse)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `E24` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `DEBATE.6` | 停用/删除实现里的判定（vibe-math-vmu/kernel/turn/index.js:256（rowsRead/rowsCounted/rowsArchivedByWindow）或删掉 sim 步 `rules-extra/e27-verdict-ask (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `E27` = **REHEARSED-RED**（改坏机制 ⇒ 点名断言红的执行记录） | REHEARSED-RED |
| `PAPER.2` | 停用/删除实现里的判定（vibe-math-vmu/packs/research-core/paper-flow.js:976（partKey = (target,member) 稳定）或删掉 sim 步 `paper/record/part (allow)` ⇒ 该步由 allow 变红；mutation-evidence 三档表 item `F1` = **PROVEN-RED**（改坏机制 ⇒ 点名断言红的执行记录） | PROVEN-RED |

## 4. 真机对照（RUN 87 / RUN 88）

| 机制类 | real 证据（RUN 88；RUN 87 仅列失败面） | 状态 |
| --- | --- | --- |
| 成员/雇佣/席位 | V23（start→hire r-temp +6.75s→drive +37.0s）；V28（r-1 跨席 advance 具名拒） | PASS |
| Verified/裁决 | V22（evidence-grade-line/bodyGradeLine）；V21（window2 4/4, afterFinalization:true）；V17（首 final 四门具名） | PASS |
| 记录/进展/障碍/命题卡 | V25（records list 6 live/1 superseded）；V21（命题卡计票）；F-87-01/02 本批修复（§8） | PASS（§8 修复） |
| 会议（预约/召开/关闭/权限/序列） | V17（final 四门）、V28（advance 仅主席）、V23（立所→hires→drive）、V27（office consult） | PASS |
| 辩论/结题计票 | V21（window2 4/4、afterFinalization:true）；F-87-03 本批修复（§8：rowsRead/rowsCounted/countWindow） | PASS（§8 修复） |
| 论文（写作/互审/定稿/PDF） | V14（final→render→PDF 146,592B sha 93d4c74d…）、V15（0 缺字）、V17（拒收/revise/二 final）、V20（compiledAfterFinal:false）、V22（节级证据等级）；F-87-02/04/06 本批修复（§8） | PASS（§8 修复） |
| 自反馈 | FEEDBACK87 8 条（F-87-01…08, 12,020 B；feedback 轨 ≥6） | PASS |
| 上报所办/人工干预/续跑 | V27（office consult）；V16（resume 22 行三条件）；V24（stateStaleMs 63,677） | PASS |
| 工具化（工具调用回执） | READINGS §0：387 tool calls / 387 results；V14 render 回执 | PASS |
| 提示词自洽 | fixture-constraint 全文 0；V16 seat 49/49；RUN87 P0 已由 RUN88 关闭；P2-2/P2-3 本批修复（§8） | PASS（§8 修复） |
| 蓝图/主线 | jsonl tool/call `vibe_v5_blueprint` ×2（seq93/step11；propose/adopt 路径）——但九字段结构化未行使（见 §2 MAIN.4–13） | PASS（工作流真实行使；字段缺口见 §2） |
| 方法库 | jsonl tool/call `vibe_v5_record_method` ×6（seq131/step17） | PASS |
| Lean 归档 | jsonl tool/call `vibe_v5_lean_job` ×12 / `lean_run` ×8 / `lean_archive` ×6 / `lean_lib` ×4（seq70/step6 起） | PASS |
| 脚本归档 | jsonl tool/call `vibe_v5_script` = 0（本轮未行使脚本归档） | **NO-EVIDENCE**（见 §5） |
| 邮箱/私信/群聊 | jsonl tool/call `vibe_vmu_mailbox` ×48 / `vibe_v5_say` ×34 / `vibe_vmu_chat` ×2（seq36/step3 起） | PASS |
| 数学计算工具 | jsonl tool/call `math_computation` ×12（seq51/step5 起） | PASS |

## 5. 盲区与残余（具名，不当 PASS）

1. **蓝图九字段（MAIN.4–MAIN.13）**：RUN 88 真实调用了 `vibe_v5_blueprint` ×2（seq93/step11），但九字段未被结构化记录/校验（outline 只有 id/title/depth）；本轮 impl 批次未改 `blueprint.js` ⇒ 仍 HALF-BUILT。补验：一次真机蓝图 propose/adopt 携带九字段，或在 sim 加“节点九字段必须结构化写入”的步骤。
2. **脚本归档（FSEAT.17）**：机制与提示词均在（`vibe_v5_script` chair-only + `v5r-blocks-b:1208` 教学），RUN 87/88 的 `tool/call` 中 `vibe_v5_script` = 0 ⇒ 合法未行使，不是提示词缺口（结论与建议见 §7）。
3. **RUN 87 的失败面**（V14/V17/V20）已在 RUN 88 闭环；RUN 87 的 P0（fixtureMode 同屏）在 RUN 88 以 `fixture-constraint` 全文 0 关闭；本轮 impl 批次把 RUN 88 的全部 P1/P2/P3 与 6 条提示词问题修掉（commit `f2972c0d`，T1 891/891/0、152 gates 绿）。
4. **切分口径的边界**：`（…）` 内标点不切（如 MEM.1 括号内句号）；冒号引言行不计句（已在矩阵 §0 说明）；若规则文档更新，N 与 id 由校验器重算，矩阵须同 commit 重生成。

## 6. 复核与门禁

- `node scripts/audit-macro-rules.mjs --check`：句数守恒、id 唯一、逐字引用、证据非空、CONFORMS 行为证据、sim/test ≥60%、docs-only ≤25%；当前 **PASS**（sim/test 75/76 = 99%，docs-only 1/76，CONFORMS 行全部含行为证据）。
- `node scripts/audit-macro-rules.mjs --check --strict-real`：**PASS**（9/9 段都有 ≥1 条 real；本批转判后 real 行 25 条，DEBATE/PAPER/MEET/EXTRA 的 real 证据保留在转判行里）。
- Lead 已批准由 **host-lane 下一批**把校验器接入 `scripts/regen-all.mjs`（regen 18→19 + 计数重生成 + 校验器进 gates）；本轮保持独立可跑，未改门禁装配。

## 7. 提示词建议（FSEAT.17 脚本归档）

**结论：机制存在 + 提示词已教，RUN 87/88 的 0 次调用是「合法未行使」，不是提示词缺口。**

- 机制：`vibe_v5_script` 的 `op:"archive"` 把脚本归档到 `scripts` 轨（C14；chair 专属，member/temp 具名拒 `VMU_NOT_PERMITTED`；ad-hoc 脚本由中间件 `v5r-core-no-adhoc-scripts` 拒）——sim `rules-extra/c14-script-archive(allow)` + `c14-script-member-refused(refuse)` 双灯通过。
- 提示词：`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:1208` 的【脚本归档】段逐字教了「归档是院士席（chair）的面 `vibe_v5_script` 的 `op:"archive"`；member/temp 具名拒 `VMU_NOT_PERMITTED`；归档是副本不是执行证据；临时脚本不能 ad-hoc」；`v5r-blocks-b.js:1144` 的「五类一等机制」也点名 `scripts` 轨。
- 真机：RUN 87（`full-1119-122740.jsonl`）与 RUN 88（`full-1119-235611.jsonl`）的 `tool/call` 事件里 `vibe_v5_script` 均 **0 次**（工具在 header 可用，只是任务未用到脚本归档）⇒ 不需要补提示词；若要消掉这唯一一个「机制有 real 无」的盲区，只需下一 RUN 的任务书写一个「把临时脚本归档到 scripts 轨」的动作（可选，非阻塞）。
- 建议（可选）：在 report/任务模板的 smoke 清单加一条 `vibe_v5_script{op:"archive"}` 的真实调用，作为 FSEAT.17 的 real 灯；提示词无需改。

## 8. impl 批次落地后的转判（commit `f2972c0d` · RUN 88 triage: every finding the institute reported was real, and the receipts could not tell the operator why they were still 'awaiting-editor'）

### 8.1 由 HALF-BUILT 转 CONFORMS（5 条）

| id | 修什么 | 新证据 |
| --- | --- | --- |
| `DEBATE.6` | 已实现 · vibe-math-vmu/kernel/turn/index.js:256（rowsRead/rowsCounted/rowsArchivedByWindow/countWindow）；vibe-math-vmu/kernel/index.js:3211（raw fold rows → rowsAll + window） | sim round-15 rules-extra/e27-verdict-ask (allow)；test: tests/vmu-closure-electorate.test.mjs W1–W5（rowsRead 4 / rowsCounted 3 / rowsArchivedByWindow 1 / countWindow 2；重复票不涨；LAMP 具名）；real: RUN 88 · V21（window2 votesCast 4/4, afterFinalization:true） |
| `PAPER.2` | 已实现 · vibe-math-vmu/packs/research-core/paper-flow.js:976（partKey = (target,member) 稳定身份）＋:1003（旧行标 superseded/supersededBy/titleChanged）＋:1371（VMU_PAPER_CROSS_REVIEW_UNMET 专用码） | sim round-15 paper/record/part (allow)；test: tests/vmu-run252-paper-artifact-truth.test.mjs F-87-02（改标题后 partKey 相同、titleChanged:true、旧行 superseded）；real: RUN 88 · V14（final→render rec-42/43/44） |
| `PAPER.3` | 已实现 · vibe-math-vmu/packs/research-core/paper-flow.js:2013（final 编译源状态投影 finalized）＋:2231（finalizedAt 落 state 与 signed final）；vibe-math-vmu/packs/v5r/tools.js:7407（status.pdfCompiled 双时刻 compiledAt/finalizedAt） | sim round-15 paper/paper/final/ok (allow)；test: tests/vmu-run252-paper-artifact-truth.test.mjs F-87-06（编译源 状态：finalized、无 awaiting-editor）＋ F-87-04（final.finalizedAt + status.pdfCompiled.compiledAt/finalizedAt）；real: RUN 88 · V20（compiledAfterFinal:false、archive 4/4） |
| `MEET.9` | 已实现 · vibe-math-vmu/packs/v5r/tools.js:1153（assign 走 tasks.assign 同一 readiness 判据；无 brief 具名拒 VMU_TASK_BRIEF_MISSING） | sim round-15 actions-extra/M/pack-meeting/task-assign (allow)；test: tests/vmu-v5r-tools.test.mjs F-87-01（assign 既有无 brief 任务：写 brief 后行 ready:true/hasBrief:true，与 readyWhy 同源）；real: RUN 88 · F-87-01（原缺陷由本批修复，两门同源） |
| `EXTRA.5` | 已实现 · vibe-math-vmu/tools/turn.js:317（op:prompt 回执带 settings resolved 快照：fixtureMode/budget 的 value/source/origin）＋:331（保留窗口/淘汰策略/overWindowHint）；vibe-math-vmu/host.js:820（P2-3：被拒设置的 resolved 读数不再被 summary 省略） | sim round-15 turns/prompt-matrix (prose)；test: tests/vmu-run79-prompt-member.test.mjs §2d/§2e（promptSources.fixtureMode value/source/origin；retention.cacheLimit/policy/retainedTurns）＋ tests/vmu-host.test.mjs（summary 上界重钉）；real: RUN 88 · §2（fixture-constraint 全文 0）+ V16 seat 49/49 |

### 8.2 本轮仍未闭环（逐条原因）

| id | 为何仍未闭环 | owner/最小修法 |
| --- | --- | --- |
| `MAIN.4–MAIN.13` | blueprint.js 仍未出现九个节点字段（只命中 0 个字段名）；outline 仍只有 {id,title,depth}，无字段 schema/缺字段具名拒/读面 ⇒ 未闭环 | owner blueprint/record-face；修法：outline entry 增 fields（或新增 direction/route/node 记录型）＋ propose/update 校验＋读面 |
| `FSEAT.12` | vibe_v5_lean_archive 的 schema 仍声明 content 参数（F-87-08 未在本批）⇒ 未闭环 | owner lean/impl；修法：移除 content 参数或标废弃并在 hint 说明 |

> 说明：MAIN.4–MAIN.13 是同一九字段缺口的 10 句，本轮 impl 批次未改 `blueprint.js`；FSEAT.12 的 F-87-08 不在本批（tools.js 的 lean_archive schema 仍含 content）。二者的修法与 owner 见 §2 表。
