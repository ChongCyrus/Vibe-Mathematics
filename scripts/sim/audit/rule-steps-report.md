# R240-B / R240-J：93 条规则 → 仿真步骤 映射报告

本报告由 `scripts/sim/audit/rule-steps.json` 的同一份数据生成。步骤名逐字取自**六个**可跑场景的 `steps/steps.json`（R240-J 新增第 6 个场景 `rules-extra`；第 7 个场景 `records-blueprint` 在 HEAD 上仍跑不通，见文末告警），**任何一条编造的步骤名都会在 `node scripts/sim/audit/all.mjs` 的 §3 核对时红**。

文件形状：`rules[id] = { rule, steps: [{scenario, step, side, promptProbe?}], notes }`，93 个键与台账同序；`vocabulary[scenario]` 是该场景全部逐字步骤名；`uncovered` 是 `steps` 为空的规则（现在为空数组）；`needsNewStep` 是它们各自要新增的那一步（现在为空对象）；`leanAllowSide` 记录本装配造不出的三条 Lean allow 侧。

与 `docs/acceptance/sim-audit-rules.md` 的口径区别：那份审计（ENFORCED 75 / PROSE-ONLY 11 / UNREACHABLE 6 / CONTRADICTED 1）用的是**一次性 probe**（`D:/_tmp/g7a10/probe-part*.json` 里的临时调参）；本文件只认**场景里逐字存在的步骤**。R240-B 时两者差 30 条；R240-J 把这 30 条做成了 `rules-extra` 场景里的 52 步，差额归零。

## 1. 覆盖数字

| 口径 | 条数 |
| --- | --- |
| 台账规则总数 | 93 |
| 有可执行步骤证据（allow/refuse） | 80 |
| 只有提示词证据（prose） | 13 |
| 其中能拿到具名拒（refuse）的规则 | 23 |
| **已覆盖合计** | **93** |
| 无步骤可引用 | 0 |
| 场景步骤总数 | 218（mainline 21 + meetings 59 + turns 17 + comms 50 + paper 19 + rules-extra 52） |

## 2. 新场景 `rules-extra`：30 条规则 → 52 步

`scripts/sim/scenarios/rules-extra.mjs` 用真内核跑 52 步：`node scripts/sim/run.mjs --scenario rules-extra --out D:/_tmp/sim/corpus-rules-extra` **exit 0**，其中 13 步是具名拒（全部在 `expectedRefusals` 里申报，run.mjs 记 expected）、2 步是环境拒（`VMU_ENGINE_UNAVAILABLE`，记 ENVIRONMENTAL）、37 步走通。步骤名规律：`setup-institute` / `setup-proof-file` + 规则号前缀（`a3-`/`c6-`/`e27-`…）。

| 规则 | 台账原文 | 步骤（scenario/step） | 拒绝面 |
| --- | --- | --- | --- |
| `A2` | 有进展时自动唤起所办汇报 | `rules-extra/a2-progress-report`（OK） `rules-extra/a2-office-notice`（OK） | 仅 allow |
| `A3` | 支持用户以自然语言让所办设参数、控制研究所 | `rules-extra/a3-set-declared-key`（OK） `rules-extra/a3-set-undeclared-key`（REJ） | 1 个具名拒 |
| `A7` | 临时工可被解雇 | `rules-extra/a7-fire-temp`（OK） `rules-extra/a7-fire-chair-refused`（REJ） | 1 个具名拒 |
| `A8` | 院士、常驻研究员各自的文件（范围）：这些库属院士与常驻研究员，临时工不在其列 | `rules-extra/c6-card-proof-complete`（OK） `rules-extra/a8-temp-record-refused`（REJ） | 1 个具名拒 |
| `A9` | 临时工的用途约束：被院士或常驻研究员雇佣用于特殊任务/临时任务 | `rules-extra/a9-hire-with-purpose`（OK） `rules-extra/a9-hire-no-purpose`（REJ） | 1 个具名拒 |
| `B1` | Verified 只收 p=1 的命题 | `rules-extra/b2-promote-literature`（OK） `rules-extra/b1-promote-unsettled`（REJ） | 1 个具名拒 |
| `B2` | 参考文献中的命题也可直接入 Verified | `rules-extra/b2-literature-route`（OK） `rules-extra/b2-promote-literature`（OK） | 仅 allow |
| `B3` | 只有辩论能把 p 改为 1 | `rules-extra/b3-p1-without-warrant`（REJ） | 1 个具名拒 |
| `C2` | 已尝试路线/方法及其进度 | `rules-extra/c2-route-progress`（OK） `rules-extra/c2-unknown-track-refused`（REJ） | 1 个具名拒 |
| `C3` | 遇障路线/尝试/方法及障碍与原因归档 | `rules-extra/c3-obstacle-progress`（OK） | 仅 allow |
| `C4` | 遇到的各种障碍及其原因（归档内容的一部分） | `rules-extra/c4-rejected-progress`（OK） | 仅 allow |
| `C6` | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | `rules-extra/c6-card-proof-complete`（OK） `rules-extra/c6-card-locked-rewrite`（REJ） | 1 个具名拒 |
| `C7` | 只有写完的正式证明才能用于辩论 | `rules-extra/c7-debate-with-proof`（OK） `rules-extra/c7-debate-without-proof`（REJ） | 1 个具名拒 |
| `C8` | p=1 的命题要标记 verified | `rules-extra/c8-read-verified`（OK） | 仅 allow |
| `C9` | 方法库（理论/方法/工具，抽象化产物） | `rules-extra/c9-method-record`（OK） | 仅 allow |
| `C10` | Lean 代码与编译结果归档 | `rules-extra/c10-lean-archive-refused`（REJ） | 1 个具名拒 |
| `C11` | lean 通过后辩论只查描述/定义是否符合原意 | `rules-extra/c11-fidelity-needs-lean`（REJ） | 1 个具名拒 |
| `C12` | 鼓励开关：鼓励把小结/定义 Lean 化 | `rules-extra/c12-formal-verify-setting`（OK） | 仅 allow |
| `C14` | 脚本文件等归档，不写 ad-hoc 脚本 | `rules-extra/c14-script-archive`（OK） `rules-extra/c14-script-member-refused`（REJ） | 1 个具名拒 |
| `C15` | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | `rules-extra/c15-feedback-add`（OK） | 仅 allow |
| `D6` | 可查看其他成员当前状态版 | `rules-extra/d6-panel-set`（OK） `rules-extra/d6-panel-get`（OK） | 仅 allow |
| `E9` | 院士邀请入会成员 | `rules-extra/e9-meeting-narrowed-roster`（OK） `rules-extra/e9-meeting-status`（OK） | 仅 allow |
| `E24` | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | `rules-extra/c11-fidelity-needs-lean`（REJ） | 1 个具名拒 |
| `E27` | 辩论骨架③结束前各成员最终裁决 | `rules-extra/e27-verdict-ask`（OK） `rules-extra/e27-verdict-r1`（OK） `rules-extra/e27-verdict-r2`（OK） `rules-extra/e27-verdict-chair-refused`（REJ） | 1 个具名拒 |
| `E28` | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | `rules-extra/e28-verdict-final-mean`（OK） | 仅 allow |
| `E32` | 辩论裁定的并发通知：告诉命题卡持有者最终概率并请其改值 | `rules-extra/e32-owner-notified`（OK） | 仅 allow |
| `G1` | 支持成员使用 Python 等数学计算工具 | `rules-extra/g1-mathtools-plan`（OK） `rules-extra/g1-mathtools-run-refused`（REJ） | 1 个具名拒 |
| `G2` | 所办可设工具并发数量限制防 CPU/OOM | `rules-extra/g2-set-maxparallel`（OK） | 仅 allow |
| `G3` | 支持人工干预研究所决策与运行 | `rules-extra/g3-assign-queued`（REJ） `rules-extra/g3-approval-queue`（OK） `rules-extra/g3-approval-state`（OK） `rules-extra/g3-approval-decide`（OK） `rules-extra/g3-assign-allowed`（OK） | 1 个具名拒 |
| `G4` | 支持断点续跑 | `rules-extra/g4-pause`（OK） `rules-extra/g4-resume`（OK） | 仅 allow |

## 3. 只有 prose 证据的规则（13 条）

这些规则在提示词里有逐字指令，但没有任何工具面会拒绝或记录它；因此本文件只登记 `promptProbe`（可逐字核对的片段），不声称是机制闸。

| 规则 | 席面/相位 | 逐字片段 |
| --- | --- | --- |
| `E12` | member/normal | `命令随类型与身份不同（辩论须先 `subject`、结题表决 `vote_solved`、论文交流走 `vibe_v5_paper`；临时工无表决权）` |
| `E25` | chair/normal | `表决分两段：先【独立初评】——看不到别人意见时独立给票与理由` |
| `E29` | chair/normal | `辩论轮数由院士决定（`vmu.meetings.verdictMaxRounds`）` |
| `G6` | chair/normal | `★ 回执正文里【不要】粘贴 JSON 对象或工具回执原文` |
| `G7` | chair/normal | `**在册各席逐字一致**（三类同文，可抄回比对）` |
| `E36` | chair/normal | `表决分两段：先【独立初评】——看不到别人意见时独立给票与理由` |
| `G8` | chair/normal | `一条主线＝**原问题的实现蓝图的策划、细化、调整，以及由粗到细的构建、扩张、推进与实现**` |
| `G9` | chair/normal | `持续积累与主线推进、改进、调整相关的认知与有价值反馈` |
| `G10` | chair/normal | `①这回合推进或扩张蓝图的哪个节点？②该节点的信息更新了没有（当下评价 / 初始计划与启发 / 相关计划 / 可行性及原因 / 价值性及原因 / 结论与经验 / 障碍与方案 / 过去经验）` |
| `G11` | chair/normal | `据实践反馈调整、细化蓝图并更新节点信息` |
| `G12` | chair/normal | `吸取经验持续改进，把经验一般化、迁移到新问题` |
| `G13` | chair/normal | `能迁移复用就复用，别重复探索` |
| `G14` | chair/normal | `③**以前是否处理过类似问题**——先查蓝图与归档` |

## 4. 需要新增的仿真步骤

**0 条**——R240-J 之后 93 条规则全部有场景步骤可引用。唯一还需要补的是三条规则的 **allow 侧**（不是新规则，而是同一规则的另一分支），而它依赖本机不存在的 Lean 面：

| 规则 | 缺的是什么 | 需要什么机器 |
| --- | --- | --- |
| C10 | Lean 代码/编译结果**归档成功**的阳性步骤（现在只有 `c10-lean-archive-refused`） | 注入真 spawn 接缝、能跑 `vibe_v5_lean_archive` 的宿主 |
| C11 | 「lean 通过后」辩论只查描述/定义的阳性步骤 | 同上，且能造出 lean 通过 + p≠1 的卡 |
| E24 | 同 C11 | 同上 |

## 5. 场景告警与限制（如实说明）

- **`records-blueprint` 场景在 HEAD 上跑不通**：`scripts/sim/scenarios/records-blueprint.mjs:108` 读 `draft.md.absPath`（RUN 238 之后草稿不再写 md，只有 adopt 写），`:168` 于是抛 `Error: the blueprint md was never written, so there is nothing to hand-edit`，进程 exit 1、`steps/steps.json` 不产出。该场景的 ~29 个步骤名没有进入本文件；修好之前任何依赖它的门禁都会红。工作树里已有别的 lane 的未提交修复（`mdAbs` 改取 `adopted.md.absPath`），我重跑得到 29 步 exit 0，但因为是**未提交**状态，没有把它作为证据写入。
- **`rules-extra` 的收据审计 findings = 1，且不可在本写域内消掉**：`A2 SERIALISATION_LEAK vibe_v5_verdict_final #23`，路径 `$.correction.callMeans`。原因不是串化 bug，而是 `vibe-math-vmu/packs/v5r/tools.js:2984` 的散文本身含字面 "NaN"（"…it never becomes NaN and it never silently becomes 1"），`correction` 在 `:3056` 无条件挂在回执上，所以**任何**调用 `verdict_final` 的场景都会被这条正则规则命中。要归零只能改产品散文（本任务写域外）。实测其余 51 步零 findings。
- 例外说明（沿用 R240-B）：`E16` 引 `meetings/floor/order-after-hand`，该步回执没有 before/after 对照，只证「举手后可依次发言」，证不到重排生效；`E19`/`E23` 引投票板/会议表决步骤，但**投票板的 `floor`（min_votes 门槛）不是会议法定人数 m**，两者不要混。
- 三条规则只有单侧证据，已在 §2 表的「拒绝面」列与 `rules[id].notes` 里逐条写明：`C10`/`C11`/`E24`（只有拒绝侧，Lean 面缺失＝环境事实）、`G2`（只有 allow 侧，并发上限在 boot 时读，运行时不可造超限拒）、`B3`（只有拒绝侧：机制拦的是「无凭据自封 p=1」，「只有辩论能到 p=1」比机制更窄，回执列出四条合法路）。
