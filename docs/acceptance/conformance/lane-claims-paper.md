# lane-claims —— 命题库 / Lean / 表决人数 / 辩论收尾 / 论文阶段（phase 12 第 2 轮）

> 本文件只覆盖 Lead 分给我的 9 条：**B6、B8、D12、D13、D15、E1–E4**。
> 状态词按台账 §0：✅ 已实现 / ⚠️ 部分 / ❌ 缺口 / 待核。
> 证明纪律：**(a) 提示词里写了** ≠ **(b) 机制存在且可达** ≠ **(c) 有门禁/断言能抓住退化**；每条把这三层分开写。
> 每条证据给 `path:line`（相对仓根 `Vibe-Mathematics/`）。**没读到的不写"没问题"。**
> 本轮不改 vmu 代码/测试；只写本文件。探针在 `D:\_tmp\p12-*.mjs`，结果贴在 §9。

## 0. 一句话结论（先落盘）

| ID | 规则 | 状态 | 一句话 |
|---|---|---|---|
| B6 | 命题库字段＋正式证明闸＋verified 标记 | ⚠️ 部分 | 卡（陈述/概率/动机/进度）✅；**「正式证明」字段与「只有写完正式证明才能入辩论」的闸在 v5r 都不存在**，只有提示词在说 |
| B8 | Lean 归档＋lean 通过⇒概率 1 联动＋鼓励形式化开关 | ⚠️ 部分 | 代码+编译结果归档 ✅（真机验过）；**lean 通过 ⇒ 概率=1/入 verified 没有任何机制**；开关存在但只改提示词与回显 |
| D12 | 表决人数下限 = min(用户设置, 院士+常驻) | ⚠️ 部分 | 有**可失败**的法定人数闸（`VMU_MEETING_QUORUM_LOST`）；但算法不是 `min(设置, 院士+常驻)`，且 `quorumCap` 默认 3 会把它 clamp 到"在场人数"，默认配置下闸恒通 |
| D13 | lean 已通过且概率非 1 ⇒ 辩论聚焦描述符合性 | ❌ | 提示词段**无条件常驻**（无 Lean 证明也注入）；它要求的 `formal:{decision:'defect'}` 回执**没有接收者**；"撤回已通过"只剩标记+只读谓词，**不降级 job、不删归档、不写待办** |
| D15 | 收最终裁决、一致取该值否则均值、通知持有者改概率 | ⚠️ 部分 | 裁决收集 ✅（`vibe_v5_verdict`）；**均值❌（实际是"全票或未定"）、理由❌（cast 无 reason 参数）、通知❌（`ballot/after-decided` 零实现）** |
| E1 | 梳理原总问题与所有产物、合作撰写论文 | ⚠️ 部分 | 九节骨架＋系统合并＋指纹门禁 ✅；但"**所有**产物"是静态九节，不从记录涌现，也没有"漏了产物"的检查 |
| E2 | 分工后系统合并、互审 | ✅ | 参与成员只能写自己那段、互审环自动分配、`deliverable` 必须真布尔、全 true 才进定稿、否则退稿最多 3 轮；有测试门禁 |
| E3 | 面向读者：系统、正确、完整、严谨清晰 | ⚠️ 部分 | **只有提示词**（撰写/互审段文本）；无任何机器检查；测试只断言提示词文本含关键词 |
| E4 | 最后讨论、检查无误后定稿 | ⚠️ 部分 | 定稿闸 ✅（只有院士、deliverable/revise、轮数上限）；**「检查无误」的所办前置（officeConsult）在 v5r 路径是死声明、不可达** |

---

## 1. B6 命题库：字段 ＋「含正式证明才能用于辩论」＋ verified 标记

**台账原文**：「命题库：完整定义＋布尔概率∈[0,1]＋进度；平时只写证明/证伪**尝试**字段；真会证了才写正式证明/证伪；**只有含正式证明（写完）的命题卡才能用于辩论**；概率=1 要标记 verified」。

### (a) 提示词层 —— 写了，而且写得很像机制
- `vibe-math-vmu/packs/v5r/prompts/v5r-persona.js:41` 通用规章 rule 9：**「只有已被给出『正式证明或证伪』、且相应负责人已写完并不再更改（locked）的命题/对象，才能被作为辩论命题；仅有『证明尝试/证伪尝试』的命题只是候选」**；rule 10：「正式证明或证伪只可在确信时登记（`end_verify` 的 `formal_proof`）」。
- `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js:195-196` 同义重复（辩论段）。
- 卡模板（`v5r-persona.js` §三 Propos 卡格式）只列：`- ID` / `- 状态` / `- 概率: <0-1>` / `- 价值程度` / `- 动机用途计划`，正文 `## 陈述` / `## 证明尝试` / `## 证伪尝试` —— **模板里根本没有「正式证明」这一栏**。

### (b) 机制层 —— 三段全缺
1. **没有写正式证明的面**：v5r 公开面 41 个工具（`vibe-math-vmu/packs/v5r/tools.js:964-1260`，`grep "^    name: 'vibe_v5_"`）里没有 `end_verify`、没有 `propose_verify`、没有任何 formal_proof 写入路径（探针 §9②：`!toolNames.some(n=>/end_verify|propose_verify/)`）。提示词让成员调用的 `end_verify` 在 vmu 里**不存在**。
2. **卡上没有正式证明字段，也没有 verified 标记**：`vibe-math-vmu/kit/tools.js:21` 的 `vibe_v5_record_proposition` 配置 `required:['statement','value','motive','p'], extra:['title','id']`；`vibe-math-vmu/kit/handlers.js:76-88` 只校验"必填非空"，不校验 `p∈[0,1]`；`:157-176` 唯一与"已验证"沾边的是 **`settled = (Number(args.p)===1 || Number(args.p)===0)`** —— 即 **p=1 就自动被记成 settled**，这不是"verified"，是"作者自称概率 1"。全仓 `grep verified` 在 `*.js` 只命中审计/门禁代码，没有任何 `Verified/` 目录机制。
3. **辩论准入闸确实存在，但不挂在 v5r 上，且判据错位**：谓词 `kernel/index.js:168` `has_locked_formal_proof: (ev) => !!(ev && (ev.locked === true || (ev.subject && ev.subject.settled === true)))`；消费者**只有** `packs/institute-min/index.js:66`（`when:{all:[{tool:['vibe_v5_poll_vote']},{not:{subject:'has_locked_formal_proof'}}]}`）。`packs/v5r/` 里 `has_locked_formal_proof` 命中 **0**（5 个 middleware 文件全无）⇒ **v5r 的辩论没有这道门**。即便挂上，`locked` 全仓无人写，判据会退化成"p=1 的卡算有正式证明"（探针 §9①：`has_locked_formal_proof({subject:{settled:true}})` ⇒ **true**），正好把台账要拦的"仅有证明尝试"放行。

### (c) 门禁层
无。`tests/` 里没有任何断言"没有正式证明的命题不能被开辩"；v5r 面没有对应错误码，也没有 `REFUSAL_SCENARIOS` 覆盖（`tests/audit-enforced-consistency.test.mjs` 的 v5r 场景里无此项）。

**状态：⚠️ 部分** —— 库/卡/概率/进度是机制；**"正式证明"字段、"只有写完正式证明才能入辩论"的闸、verified 标记**三项是提示词宣言。
**缺什么**：① 卡的正式证明字段（或独立证明对象）＋ 写入面；② v5r 侧挂 `has_locked_formal_proof` 类中间件，且判据改成"存在正式证明"而非 `settled`；③ 一条能失败的断言（无正式证明 ⇒ 开辩被具名拒）。

---

## 2. B8 Lean 代码/编译结果归档 ＋「lean 通过⇒概率=1」联动 ＋ 鼓励形式化开关

### (a)(b) 分三段
1. **Lean 代码＋编译结果归档 —— ✅ 真机制、真机验过**：面 `packs/v5r/tools.js:1174-1201`（`vibe_v5_lean_run/job/read/archive/lib`）；内核 `kernel/lean.js`（作业镜像 `Formal/Jobs/<jobId>.json`、`settled` 只在 **exit 0 且内容哈希未变** 时成立，见 `settings/schema.js:255` 文档串"只有退出 0 且文件内容哈希未变才可标 passed"）。第 2 轮真机证据：Lean 4.34.0 编译成功 ⇒ settled+passed+镜像；失败 ⇒ `VMU_LEAN_EXIT_NONZERO`；重启 ⇒ adopted=1；改文件再恢复 ⇒ `file-changed-since-run`、passed=false（见 `_handoff/vmu/math-round2-report.md` §6）。测试 `tests/vmu-lean-jobs.test.mjs` 13/13。
2. **「lean 通过 ⇒ 辩论只查描述符合性 ⇒ 符合即概率=1 且可入 verified」—— ❌ 全程无机制**：
   - 没有任何面把 lean 结果变成票或概率：`vibe_v5_verdict` 只往 live ballot cast 布尔（见 §5）；卡的概率只能由成员自己 `record_proposition` 写。
   - "概率=1 ⇒ 可入 verified"的落点仍回到 §1 的 `settled` 自动标记（`kit/handlers.js:157-176`），与 lean 无关。
   - **联动是不存在的**：`grep passedWithdrawn` 只在 fidelity/formal/library/v3-packs 命中；没有任何代码读 `lean job passed` 去改卡或改票。
3. **「鼓励形式化」开关 —— ⚠️ 存在、被读，但唯一效果是提示词/回显**：
   - `settings/schema.js:249` `vmu.math.formalVerify` enum `off|encourage|require`，def `'off'`，doc「P3：判定时的形式化要求；默认 off＝零策略」；`:231` `vmu.turn.formalModeLine` def「鼓励：按实现难度自行决定…」（读者 `v5r-blocks-a.js:665-675` ⇒ 提示词文本）。
   - `kernel/lean.js:210/235/247-259`：读键并进 `policy()` 返回 `{formalVerify, requireFormal, encourageFormal, initiative, initiativeEffect:'display-only'}`；`settings/schema.js:256` `vmu.math.leanInitiative` doc 明写「**本运行时只回显**」。
   - **真消费者缺口**：`grep requireFormal\|encourageFormal` 除 `policy()` 自身与 `kernel/math.js:150` 的 `requireFormalization` 状态回显外，**全树零消费者** ⇒ 没有一个判定点据此改变行为（探针 §9③）。

### (c) 门禁
归档段有（lean jobs 测试）；**联动段零门禁**；开关段只有"键存在且被读"的测试（`tests/vmu-settings*` 级），没有"打开 require 后判定行为变了"的断言。

**状态：⚠️ 部分**
**缺什么**：① lean passed 的对象与命题卡之间的引用/等价机制；② "lean 通过 ⇒ 可投概率 1 且入 verified"的判定点（谁读、读了改什么）；③ 让 `formalVerify` 从"回显"变成"有行为"的消费者，否则台账这句"参数可开开关"只是文档。

---

## 3. D12 表决人数下限 ＝ min(用户设置数, 院士+常驻研究员数)

### (a) 无提示词层（纯机制规则），(b) 机制存在但算法不同
- 读键：`kernel/meetings.js:100-110` 读 `vmu.meetings.quorumMin / quorumRatio / quorumCap`；默认值 `settings/schema.js:1330` quorumMin=0、`:1331` quorumRatio=0、`:146` quorumCap=3（doc「P3：法定数上限 m = min(cap, 参与人数)；0＝不设上限」）。
- 计算：`kernel/meetings.js:254-276` `quorumOf`：`needRatio=ceil(quorumRatio*roster.length)`、`needUncapped=max(quorumMin,needRatio)`、**`const need = quorumCap>0 ? Math.min(needUncapped, quorumCap, m.present.size) : needUncapped`**，返回 `{present, roster, required:need, met: present.size>=need}`；`:272` 注释自认「with a cap in force a meeting can never require more than the people actually present」。
- 拒绝点：`:746-800` `vote()` 先查 `eligibleSeats`（不在声明席位 ⇒ `VMU_NOT_PERMITTED`，enforced 带 `vmu.meetings.eligibleSeats`），再 `if(!q.met)` ⇒ **`VMU_MEETING_QUORUM_LOST`**（hint 带现值/需要），投票后 `m.present.add(member)`。

### 与台账规则的差异（探针实测 §9④）
1. **没有任何 `min(用户设置数, 院士+常驻研究员数)` 的计算**。`quorumMin` 是"绝对人数"，`quorumRatio` 乘的是 roster；"院士+常驻"只以 `eligibleSeats` 的形式存在于**投票资格**里（`settings/schema.js:1101` def `[]`；`packs/v5r/settings/defaults.json:56` = `["chair","member"]`），**不参与 need 计算**。
2. **默认配置下闸恒通**：`cap=3>0 ⇒ need=min(needUncapped,3,present)` ≤ present ⇒ `met` 恒 true。实测：`quorumMin=2` 且 `present=1` ⇒ `required=1, met=true`、投票不被拒；只有 `quorumCap=0` 时同配置才 `required=2, met=false` ⇒ 拒 `VMU_MEETING_QUORUM_LOST`。
3. `quorumRule`（`settings/schema.js:145` enum `['m-unanimous','all-unanimous']`）**是死标签**：实测两种取值下 `defaultTally` 结果完全一致（探针 §9①）。
4. 真正起"人数"作用的约束不在 quorum，而在计票：`defaultTally` 要求**每个 eligible 都投决定性票**，否则未定（比"全一致"更严，见 §5）。

### (c) 门禁
有：`tests/vmu-meetings.test.mjs:66-70,75,81` 断言 `quorumMin` 不足 ⇒ `VMU_MEETING_QUORUM_LOST` ＋ hint `/需要=3/`；`:32-35` 注释明写「quorumCap 默认 3 ⇒ 既有场景必须显式设 quorumCap:0 才能测法定人数」—— **这句话本身就是默认恒通的旁证**。

**状态：⚠️ 部分**（闸是真的、能失败；算法与台账写的不是一回事，默认值让它形同虚设）
**缺什么**：① 一个 `min(设置数, 院士+常驻数)` 的语义实现（或在设置文档里改名，承认 `quorumMin` 不是台账那个数）；② `quorumCap` 默认 3 的 clamp 行为要么去掉、要么明确写进规则（现在它把下限吃掉）；③ `quorumRule` 要么接线要么删（死枚举）。

---

## 4. D13 lean 已通过但概率非 1 的命题：辩论聚焦 lean 代码中命题/定义的描述符合性

### (a) 提示词层 —— 写了，而且是**无条件常驻**
- `packs/v5r/prompts/v5r-blocks-b.js:110-134` 段名 `v5r-formal-review`，order 747，**`kind:'shared'`**（一个文本给所有人，无 phase 条件、无 `when`）。文本大意：对象已有通过的形式化证明（`{{ setting:vmu.turn.formalProof }}`，最近 exit 0）⇒ 不必重查推导，只做忠实性审查 ⇒ 一致投 verdict=1；**发现偏差不要投 0**，而应 ① 投 0<v<1 ② 回执 `formal:{decision:'defect', note:'…'}`，**框架会撤回该证明的「已通过」状态（降级为 attempted、删除归档证明、写形式化待办）**；只有独立于 Lean 也能确定命题为假时才投 0。

### (b) 机制层 —— 三处断链
1. **无条件的**：段是 `kind:'shared'` 且 `PACK.sections` 条目无 `phases/when` 字段 ⇒ 每回合每成员都注入。实测（§9②）正常回合 prompt 22065 字、paper-write 回合 24238 字，**两个回合都含「忠实性审查」文本**；对照「【最终论文·撰写」只在 paper-write 出现 ⇒ 测量能看见 phase 作用域，本节确实无作用域。后果：**没有 Lean 证明时它也在说"该对象已有通过的证明"**。
2. **回执没有接收者**：`formal:{decision:'defect'}` 是**卡/回执里的一个字段**，不是工具调用；vmu 全树 `grep "decision: 'defect'"`、`decision="defect"` 命中 **0**。原版 v5r 的接收者是 `end_verify`（archive/legacy-presets/vibe-math-v5r/vibe-math-v5r.js:6691/6719 拒收文本），**vmu 里没有这个面**（§1）。
3. **"撤回已通过"只有半套**：`kernel/fidelity.js`（第 3 轮 task-20 落地）`declareDefect` 写 append-only 标记 `passedWithdrawn:true`（`kernel/fidelity.js:85-86`），`passedWithdrawnFor` 是只读谓词（`:150-157`，`kernel/index.js:660` 供 library history 用），**投票侧**由 `applyAbstention` 把该成员那一票改成 0.5 弃权（C-45）。**但不降级 lean job、不删归档、不写形式化待办**（`kernel/fidelity.js:85` 注释自认"claim travels with the marker"，v5r 那一步的三个动作只落了一个）。
4. **面默认不发布**：`host.js:259-261` 的 `fidelity` 面只有当 `vmu.math.formalVerify ∈ {encourage,require}` 才发布；默认 `off` ⇒ 41 个 v5r 工具里**没有 `vibe_vmu_fidelity`**（探针 §9②）。即使打开，提示词也从未告诉成员去调它（它让成员发的是回执字段）。

### (c) 门禁
`tests/vmu-fidelity-abstention.test.mjs` 8/8 只覆盖"注册表 + 弃权改写"；**没有**任何测试覆盖"提示词段只在有 Lean 证明时出现"或"defect 回执被框架接收"。`tests/vmu-v5r-tools.test.mjs:540-552` 只断言论文三段提示词文本，不含 formal-review 段。

**状态：❌**（提示词写了；机制三段断链；门禁只覆盖无关的一半）
**缺什么**：① 给该段加真正的触发条件（有 passed lean job 的对象才进忠实性审查阶段）；② defect 的入口面（回执字段 → 工具/中间件接收）；③ 撤回的三个动作里缺的两个（降级 job / 删除归档 / 待办留存）。

---

## 5. D15 辩论收尾：收各成员最终裁决（概率,理由）→ 全一致取值/否则均值 → 通知命题卡持有者改概率

### (a) 提示词层
辩论/投票段由 `v5r-blocks-a.js:185-196` 承担（"只有锁定命题才能开辩"等），**没有**写"收尾后取均值/通知持有者改概率"这几句（`grep 均值/平均` 在 v5r prompts 无命中）。

### (b) 机制层 —— 收集 ✅／均值 ❌／理由 ❌／通知 ❌
1. **收集**：`vibe_v5_verdict`（`packs/v5r/tools.js:1132`，handler `:655-675`）在 `kernel.liveBallot(target)` 上 `ballot.cast(member, value, {kind})` ⇒ 真机制，且要求已由院士开出的 live ballot（`tools/meeting.js:83-84`）。
2. **不是概率**：`kernel/ballot.js:210` `castValid` 默认只接受 `DECISIVE_VOTE.FOR|AGAINST`（1/0 布尔）⇒ 成员交的是**布尔裁决**，不是「概率」。
3. **无理由**：`kernel/ballot.js:430` `cast(member, value, {kind='decisive'})` **没有 reason/note 参数**；`VOTE_KINDS`（`:39-46`）里 `estimate` 的注释还写着"旧 v5r 口径计均值"，但那是注释。
4. **无均值**：`defaultTally`（`kernel/ballot.js:66-83`）：0 票 ⇒ `no decisive vote was cast`；决定性票数 < eligible ⇒ `not every eligible member has voted yet`；全 for ⇒ true；全 against ⇒ false；否则 ⇒ `votes are split`（undecided）。**没有 mean/average 字段**（探针 §9①：tally detail 无均值字段；2 for + 1 against ⇒ undecided，而不是 0.667）。
5. **无通知**：`ballot/after-decided` 全仓 **零实现**（`grep` 在 `*.js` 命中 0；`docs/08-pack-api.md:75` 自己写着「`ballot.after-decided` … 未实现 ✗（当前只有 ballot/tally 钩子可观测）」）。没有任何代码在裁定后去改命题卡的 p，也没有面向卡持有者的通知面。

### (c) 门禁
计票本身有测试（`tests/vmu-meetings.test.mjs`、v5r tools ③d 投票段），断言的是"全票/未定/分裂"；**没有**均值与通知的断言（因为不存在）。

**状态：⚠️ 部分**（收集 ✅；均值/理由/通知三项 ❌）
**缺什么**：① 裁决的理由通道（cast 的 reason 或独立回执）；② 均值口径（现实现是"全票或未定"，与台账"否则取均值"直接冲突 —— 要么改实现，要么改规则）；③ 裁定 → 卡持有者的通知/改 p 机制（现只有 `ballot/tally` 钩子可观测）。

---

## 6. E1–E4 论文阶段

流程实现：入口 `packs/v5r/tools.js:812-900`（`vibe_v5_paper` actions: sections/status/start/part/review/advance/final/render/compile；`:820` 明写本面不加策略，阶段/席位由流程判）→ `packs/v5r/paper.js:52-69` → **`kit/paper.js`（456 行，真流程）**。九节骨架 `packs/v5r/paper.js:20-30`。

### E1 系统梳理原总问题与所有有价值产物，合作撰写最终论文 —— ⚠️ 部分
- 机制 ✅：九节含「引言与问题背景 / 原问题的完整解法 / 已检验通过的命题 / 已解决子问题 / 创造或发现的有价值之物…」；正文由系统合并：`kit/paper.js:281-312` 用所有成员的 part 重建全文，逐段按指纹校验（`readPartVerified` `:265-278`，不符 ⇒ `VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH`）。
- 门禁 ✅：`tests/vmu-v5r-tools.test.mjs:436-560` ③f 正/反断言（重复 start、错阶段 review、非参与成员 recordPart ⇒ `VMU_NO_SUCH_OBJECT`、指纹被改 ⇒ MISMATCH）。
- **缺**：「**所有**有价值产物」是**静态九节**，不是从记录/库涌现的清单；没有任何检查"某个已检验命题没被纳入论文"。

### E2 合作写（分工后系统合并）、互审 —— ✅
- 参与名单 = paper 参与者；非参与成员写 part ⇒ `VMU_NO_SUCH_OBJECT`（③f 断言）。
- 互审**自动成环**：`kit/paper.js:182-186` `advance` writing→reviewing 时 `reviewOf[i]=participants[(i+1)%n]`。
- 互审必须**真布尔**：`recordReview`（`:161-175`）`deliverable` 非布尔 ⇒ `VMU_INVALID_ARGUMENT`（注释「未表态不算可交付」）；全 true ⇒ `awaiting-editor`，否则退回 writing 且 `round++`，至 `PAPER_MAX_ROUNDS=3` 后 `forcedAfterCap`（`:188-206`）。
- 门禁 ✅：③f 覆盖"一票 false ⇒ 退回 round 2 / 全 true ⇒ awaiting-editor / 刚写完就 review ⇒ 具名拒"。

### E3 面向读者：系统、正确、完整、严谨清晰 —— ⚠️ 部分
- 只有**提示词**：撰写段 `v5r-blocks-b.js:430-457`、互审段 `:465-478`（"证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚"）、定稿段 `:504-520`。
- 门禁：`tests/vmu-v5r-tools.test.mjs:540-552` ③g **只断言提示词文本含指定短语**（如"未表态不算可交付"）—— 这正是"提示词写了≠机制存在"的例子。
- **缺**：任何机器可判的质量检查（完整性/无编造/术语一致）。

### E4 最后讨论、检查无误后定稿 —— ⚠️ 部分
- 定稿闸 ✅：`kit/paper.js:223-262` `recordFinal` 要求 `state.editor===editorDefault`（'academician'/chair 席位），decision ∈ `deliverable|revise`，revise 超轮数具名拒；③f 断言"非 chair ⇒ `VMU_NOT_PERMITTED`"。
- **所办前置是死声明**：`packs/v5r/settings/defaults.json:60-64` 声明 `vmu.paper.officeConsult:'required'`、`officeConsultOn:'finalize'`、`TimeoutMs:0`、`OnTimeout:'hold'`、`ExemptRoles:[]`；读者只有 `kernel/paper.js:49-53,139-148`（`WIRED_KEYS`），而 **`kernel/paper.js` 未被任何文件 import、host.js 的 `TOOL_FACES` 里没有 paper 面 ⇒ 该机制不可达**；v5r 自己的论文路径走 `kit/paper.js`，**不读 officeConsult**。旁证：③g 断言定稿提示词里含"未接线""咨询"——**提示词自己承认这条前置没接线**（`tests/vmu-v5r-tools.test.mjs:540-552`）。
  - 复核（`grep -rn officeConsult --include=*.js`，排除 schema/defaults）：全部命中集中在 `kernel/paper.js:49-53,139-148,187,233-324,452,514`，**其它文件 0 命中**。而 `settings/schema.js:1065` 的文档串却写「读者：定稿路径（`kernel/paper.js`／**human 面**）」——**human 面并不读这些键**，这句文档本身也不准确。

**状态汇总**：E1 ⚠️ / E2 ✅ / E3 ⚠️ / E4 ⚠️
**缺什么**：E1 产物清单的"完整性"来源；E3 任何机器质量门；E4 要么接 `officeConsult`（把 kernel/paper 路径接到 v5r 的 `vibe_v5_paper` 上），要么从 v5r 默认值里撤掉这四个键（死声明）。

---

## 7. 跨条共性问题（给 Lead 排序用）

1. **同一形态重复出现：提示词写了机制、框架没接**（B6 的 `end_verify`、D13 的 `formal:{decision:'defect'}`、B8 的"开关"、E3 的质量要求、E4 的所办前置）。这五处不是"部分实现"，而是**声明与实现分叉**——台账里最该判 ❌/⚠️ 的正是它们。
2. **`has_locked_formal_proof` 判据错位**（`locked || subject.settled`）：即使挂到 v5r，也会把"作者自称 p=1"当成"有正式证明"。这是**判据缺陷**，不只是"没挂"。
3. **默认值把机制吃掉**：`quorumCap=3`（D12）、`formalVerify=off`（D13/B8 的 fidelity 面不发布）——两者都是"有机制但默认关"，与红线④一致，但台账叙述成"有法定人数/有开关"，需要在台账里区分"可开"与"开着"。
4. **死枚举/死声明**：`quorumRule: m-unanimous`（D12，零效果）、`officeConsult*`（E4，读者所在模块 `kernel/paper.js` 无人 import ⇒ 不可达；且 `settings/schema.js:1065` 说"human 面"也读它，实测不读）、`vmu.math.leanInitiative`（doc 自认 display-only）。
5. **计票语义与台账正面冲突**：台账 D15「否则取均值」，实现是"否则未定"（`kernel/ballot.js:66-83`）。二者只能留一个；若改实现，`vibe_v5_verdict` 的布尔 castValid 也要跟着改。

---

## 8. 我没做/没核的（不许当通过）

- 未跑 T0/T1 等长门禁（按任务约定）；未跑 `regen-all`/`check-docs`。
- 未逐条核 `packs/v5r/middleware/*.js` 全文（5 个文件），只核了"是否挂 `has_locked_formal_proof`"（0 命中）与 prompt policies 的接线。
- 未核 `vmu.paper.review.mode:'single-blind'`、`vmu.paper.reviewers.maxLoad:3`、`vmu.paper.maxRounds:3` 的真实读者（`kit/paper.js` 用的是常量 `PAPER_MAX_ROUNDS`，设置键是否被读**未验**）。
- 未核 `vibe_v5_paper` 的 `render/compile` 两个 action 的产物质量（只核了流程状态机）。
- 未核 institute-min 的 `has_locked_formal_proof` 分支真机行为（只读了声明）。
- 台账 42 条我只负责 9 条，其余不在此文件。

## 9. 探针（`D:\_tmp\`，均 `node` 直跑）

| # | 文件 | 结果 | 覆盖 |
|---|---|---|---|
| ① | `p12-d12-d15-probe.mjs` | **9 passed / 0 failed，EXIT=0** | `defaultTally` 语义（2for+1against⇒undecided、无 mean 字段）、`m-unanimous`==`all-unanimous`、`has_locked_formal_proof({subject:{settled:true}})`⇒**true** |
| ② | `p12-d13-delivery-probe.mjs` | **10 passed / 0 failed，EXIT=0** | 用真 `createPromptPipeline` 组装：`v5r-formal-review` 段在 normal（22065 字）与 paper-write（24238 字）**都出现**；对照「【最终论文·撰写」**只在** paper-write；41 个面里无 fidelity/end_verify/propose_verify |
| ③ | `p12-quorum-scan-probe.mjs` | **15 passed / 0 failed，EXIT=0** | 真 `createMeetings`：默认(0/0/3)⇒`required=0,met=true`；`quorumMin=2`,cap=3,present=1⇒`required=1,met=true`（不拒）；cap=0⇒`required=2,met=false`⇒`VMU_MEETING_QUORUM_LOST`；`eligibleSeats` 外投票⇒`VMU_NOT_PERMITTED` |

探针本身出过的一次错（记下来防复犯）：我第一次断言"2 for + 1 against ⇒ false"，实测是 **undecided**（`not every eligible member has voted yet` / `votes are split`）——是**断言错**，不是仓库错，已改断言；另有一次 `decideSections` 返回形状我用错（`kept=24` 而非 76），已改用"文本是否真的出现在组装结果里"这一更强判据。

## 10. 建议台账改写（Lead 直接可用）

- B6：`⚠️` → 建议拆成三行：卡/概率/进度 `✅`；正式证明字段 `❌`；辩论准入闸 `❌`（并注明判据 `locked\|\|settled` 错位）。
- B8：`⚠️`（归档 `✅`；联动 `❌`；开关 `⚠️` 仅提示词/回显）。
- D12：`⚠️`（闸可失败 `✅`；算法 `❌`；默认 cap 令闸恒通）；`quorumRule` 标"死枚举"。
- D13：`❌`（提示词无条件常驻 + 回执无接收者 + 撤回缺两动作）。
- D15：`⚠️`（收集 `✅`；均值 `❌`；理由 `❌`；通知 `❌`）。
- E1 `⚠️` / E2 `✅` / E3 `⚠️` / E4 `⚠️`。
