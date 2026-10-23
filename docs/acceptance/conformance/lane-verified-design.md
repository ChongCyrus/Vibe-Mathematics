# B1 设计：Verified 的承载与「p＝1 只能来自辩论」的闸

> 任务：只读设计（phase 12 下一批，B1）。仓 `D:\wd\vibemath开发\Vibe-Mathematics`，HEAD `fb237c95`。
> 唯一改动文件：本文件。未改任何源码/测试/设置。
> 判据：台账 `docs/acceptance/phase12-v5r-rules-conformance.md:31`（B1 行，状态 ❌ 缺口）+ B6 `:36`、B8 `:38`、D13 `:67`、D15 `:69` 的规则原文。

---

## 0. 一句话结论

**承载：用 v3 已经做过的那一套（`verified` 轨 + 只经 `promoteVerified` 写入），不新造目录、不改内核数据结构；闸：把「p 从 <1 变成 1」的唯一入口收口到「票箱 tally 钩子 → 写 verified 卡」这一条路径上，其余路径一律具名拒。**
这三件事在 vmu 里**都有现成承接面**（records 轨/kind 声明、blockable 的 `ballot/tally` 钩子、`packs/v3/middleware/dataplane.js` 的 `promoteVerified` 全文实现），所以 B1 不是"缺能力"，而是**v5r 从来没有接这套线**。真正缺的东西只有两件，见 §6（都在 pack 层，且都不需要新内核机制）。

反例（**不要**这么做）：
- 不要把 `verified` 做成 `records` 的 `status` 值——`status` 在头部投影里是 `rec.state`（`vibe-math-vmu/kernel/records.js:331`），它是生命周期（live/trashed），参与 `remove/purge/restore/compact` 的全部判断；塞语义进去会污染回收逻辑。
- 不要新建 `VibeMath/Verified/` 目录——vmu 侧**没有 fs 写入工具面**（`vibe-math-vmu/tools/` 47 个文件里没有 fs/write 类工具），新目录要新面 + 新持久化缝，且 `records.list` 看不见它，违反红线④（无消费者不给机制）。

---

## 1. 判据原文与现状事实（全部带 file:line）

### 1.1 规则要的是什么
1. Verified 文件夹：**只有 p＝1**（或参考文献中的命题）可加入。
2. **只有辩论**能把命题卡的 p 改成 1，否则只能 ∈(0,1)。
3. 命题卡**含正式证明或证伪且写完**才能用于辩论；p＝1 的卡要标 `verified`。
4. lean 通过的命题 ⇒ 辩论只查"代码中的命题/定义是否符合原意"⇒ 符合即 p＝1 且可入 verified。
5. 参数可开"鼓励形式化"开关（低价值小结论平时就 lean 化，减少后续工作量）。

### 1.2 现状（逐条实测）

| 事实 | 证据 |
|---|---|
| v5r 包**没有** verified 轨 / kind / 字段 | `packs/v5r/settings/defaults.json:19-20`（10 条轨、19 个 kind，无 verified）；台账 `:31` 已实测「代码侧 Verified 命中全在 auditchain/crypto/records/kit-paper 或 **v3 pack**」 |
| `records.put` 只有 `settled`，**且它不落盘** | 签名 `kernel/records.js:457`；实际入档结构 `kernel/records.js:538-542` 里**没有 settled 字段**——`settled` 只被当作 `vmu.records.requireSettledRecords` 的闸输入（`kernel/records.js:467-471`），写进 rec 的是 `state:'live'`。⇒ 今天连"卡片已定稿"都不是机器事实，更别说 p |
| 命题卡的 p 只是**正文文本** | `kit/handlers.js:76-89`（`cardBody` 把 required 字段拼成 `- k：v` 行）；`:160` `isSettled = Number(args.p)===1||0` 只用于传参；**没有任何读者解析回 p** |
| 卡片"已写完的正式证明"无机器落点 | 规则把证明写在成员文件 `Members/<member>/Propos/<id>.md` 的 `## 证明尝试/## 证伪尝试`（台账 `:36`）；v5r 工具面**没有** end_verify/formal_proof（41 个 `vibe_v5_*` 工具里没有），persona 规则 9/10 只是文字 |
| 卡片可用于辩论的准入**没有闸** | `packs/v5r/tools.js:530` 只检查 `subjectRequired && subject 非空`；`subject` 是自由字符串（`packs/v5r/meeting-procedures.js:47`「卡片 id、一个文件引用、或一句话命题」） |
| `p＝1 ⇒ verified` 的联动不存在 | 台账 `:38`；`grep -rn "Verified" packs/v5r/` 只命中提示词文字 |
| 辩论的最终裁决聚合（全一致⇒该值，否则均值）**未实现**，且已具名登记 | `packs/v5r/meeting-procedures.js:79,93-97`（缺口 id `verdict-aggregation`：'没有东西把票变成结论、更没有人去通知持有者'） |
| 票箱能收概率值 | `vibe_v5_verdict`（`packs/v5r/tools.js:1132`；handler `:694-720`）在 `kernel.liveBallot(target)` 上 `cast(member, v, {kind: v∈{0,1}?'decisive':'estimate'})` |
| 但内核 tally 不算均值 | `kernel/ballot.js:66-83` `defaultTally`：decisive 票分裂 ⇒ `undecided 'votes are split'`，**没有平均值**；estimate 票不参与（同上） |
| 收口点存在且**可阻断** | `kernel/ballot.js:475-484`：close 时 `bus.emit('ballot/tally', {target, votes, eligible, quorumRule})`，deny ⇒ 票箱不落 tally、保持打开；钩子登记为 `blockable:true`（`kernel/bus.js:140`） |
| 票的 target 可以是卡片 id | `tools/meeting.js:259-275`：`action:'ballot'` 必填 `target`，`kernel.ballot({id, target})` 构造，回执回显 `target`；`kernel/ballot.js:475` 的 tally 事件原样带 `target` ⇒ **投票侧到卡片侧的 id 通道是通的** |
| **v3 已经把这套做完了（直接可参照）** | `packs/v3/middleware/dataplane.js:558-660`：`findVerified`（找不到⇒null，绝不猜）、`promoteVerified`（p 必须 1 或 0 否则具名 `VMU_STATE`；defect 撤回后拒绝再入轨；内容不变不重写 `written:false,unchanged:true`；超 bodyCap 截断并报 `bounded`）；`packs/v3/index.js:25`「裁决回写三处：命题卡＋verified 轨（**只经 promoteVerified**）＋journal 轨」；调用点唯一：`packs/v3/middleware/verify.js:392`（裁决路径内） |
| v3 的闸口同层先例 | `packs/v3/middleware/lean-gate.js:8,20-23,156`：挂在 `ballot/tally`（blockable），证据落**既有 track**（journal，不新增轨）——这正是 v5r 该照抄的形态 |

---

## 2. 承载：三个候选，逐条给代价 / 可读面 / `records.list` 可见性

> `records.list` 的头部投影事实：`CORE_HEAD_FIELDS = ['id','track','kind','status','updatedAt','fingerprint']`（`kernel/records.js:61`），核心字段**不可被 `vmu.records.headFields` 裁掉**（`kernel/records.js:592-600` 具名拒 `VMU_HEAD_FIELD_IMMUTABLE`），`status` 的值是 `rec.state`（`:331`）。轨集合在**构造期**快照（`:189-221` `const tracks = listOf(sget(K.tracks), …)`）⇒ 声明新轨要新内核/新会话才生效（`settings/schema.js:71` 标 H1 只是名义热类，实际受快照约束——这点必须写进文档，否则又是"看起来热更"）。

### 候选① `status` 值 + 一条 `verified` track
- **不可行（status 侧）**：`status` 是生命周期，不是学术状态；改它的语义要动 remove/purge/restore/compact 的既有判断（`kernel/records.js:662-728`）。
- **可行但不足（track 侧）**：新增 `"verified"` 到 `vmu.records.tracks`（pack 值层，`packs/v5r/settings/defaults.json:19`）+ `"verified"` kind 到 `allowedKinds`（`:20`，schema 默认 `[]` 见 `settings/schema.js:663`）。
  - 可见性：`records.list({track:'verified'})` 头部可见 `id/title/kind/status/fingerprint` —— **p 与结论看不见**（p 在 body）。
  - 代价：一条设置、零内核改动；但 track 只是"分区"，**不携带任何 p 不变量**（谁都能 `vibe_vmu_records` 直接写进去）。

### 候选② 独立目录 `VibeMath/Verified/<id>.md`（原版 v5r 的形态）
- 代价最高：vmu 没有 fs 写入工具面（`vibe-math-vmu/tools/` 无 fs/write 工具），要新面 + 新宿主缝 + 新持久化；`records.list` 完全看不见；与 v3 先例「证据进既有轨，不新增目录」（`lean-gate.js:20-23`）相反。
- 唯一能成立的条件：如果"人可读的**文件系统**视图"是独立需求（成员要 `ls`），那它是**宿主导出**，不是 pack 机制。**本设计不选它**。

### 候选③ 复用 tracks + `verified` 轨 + 单一写入器（**推荐**，照 v3）
- 承载形态：命题卡留在 `propositions` 轨（p 是作者声明的文本）；**机器真值是 `verified` 轨上的复制卡**（`promoteVerified` 生成，含 `结论/概率/来源/证据/时间`，见 `dataplane.js:303-330,620-655`）。读"是否 verified"只读这一处，不读 body 文本。
- 可见性：`records.list({track:'verified'})` 头部可见；p/结论的**列表化**由 pack 的读视图（index 重建，`dataplane.js:664-700`）解析 body 后给出，不新增 head 字段。
- 代价：pack 层一个 middleware 模块 + 两条 pack 设置（track/kind）+ 一份 v5r 卡形 parse/compose。**零内核改动**。
- `verified` 轨的"只含定论"不变量：`promoteVerified` 在写之前检查（非 0/1 ⇒ `VMU_STATE`），并配有读视图的坏卡点名（`dataplane.js:425`）——即"不变量可被机器验证"。

⇒ **一句话回答"承载落在哪一层"**：`verified` 是**pack 的一条 records 轨**（数据面），内核只提供 records/track/kind/hook 这四样既有能力；`p＝1` 的机器真值不是那个文本数字，而是"verified 轨上存在对应源卡的定论卡"。

---

## 3. 闸：判决函数签名 + 每个非法路径一个具名码

### 3.1 三个判决函数（都在 pack 层，纯函数，可单测）

```js
// ① 写入口闸：这次对命题卡的写入是否试图把 p 推到 1（或把已验证撤回）
//    输入只用工具 args（M2 模块能读到的东西），不读 body 文本
p1Intent({ tool, args }) -> { tries: false }
                          | { tries: true, sourceId, value, warrant: null|id }
canWriteP1({ records, sourceId, value }) -> { allow: true, warrantId }
                                          | { allow: false, code, message, hint }

// ② 入轨闸：这张卡能不能进 verified 轨（v3 的 promoteVerified 语义，v5r 卡形）
promoteVerified({ records, sourceId, at, by }) -> { written, unchanged?, 结论, 概率, bounded }
                                               | throw 具名拒

// ③ 聚合闸：一次辩论收口出的 warrant（全一致⇒该值；否则均值 <1，不得 mint）
aggregateVerdict({ votes, eligible, quorumRule, subjectId }) -> { ok:true, mode:'unanimous'|'split', value, mean, votes }
                                                             | { ok:false, code, message, hint }
```

### 3.2 具名拒清单（每条一个码，禁止复用"引擎消息"）

| 路径 | 码 | 触发条件 |
|---|---|---|
| 非辩论路径把 p 设成 1 | `VMU_PACK_V5R_P1_NEEDS_DEBATE` | `p1Intent().tries && value>=1 && 无 warrant`（工具面 `vibe_v5_record_proposition` 的 `p`，`packs/v5r/tools.js:1011`） |
| warrant 指向不存在/不匹配 | `VMU_PACK_V5R_WARRANT_INVALID` | warrant id 不存在、或 warrant.subject ≠ 卡片 id、或已被 defect 撤回 |
| 有 warrant 但不是"辩论裁决"类 | `VMU_PACK_V5R_WARRANT_KIND` | warrant.kind ∉ pack 声明接受集（默认只 `debate-unanimous`；lean 路径见 §3.4） |
| 直接往 verified 轨写 | `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER` | 任何 `vibe_vmu_records`/卡工具对 `track:'verified'` 的写入（唯一写入器是 `promoteVerified`） |
| 入轨时 p≠0/1（不变量） | `VMU_STATE`（沿用 v3 码） | `promoteVerified` 收到 p∉{0,1} |
| 辩论对象不是卡片 | `VMU_PACK_V5R_DEBATE_SUBJECT_NOT_CARD` | `vibe_v5_meeting {type:'debate'}` 的 `subject` 不是已存在的命题卡 id |
| 辩论对象没有"正式证明已写完"的登记 | `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` | 卡片缺 `proofRef`/`proofState:'complete'`，且无 lean-pass 证据（§4） |
| 票不足以裁决 | `VMU_PACK_V5R_TALLY_INSUFFICIENT` | eligible 非全投 / 无 decisive 票 / 票值不在 [0,1] |
| defect 已撤回该证明 | `VMU_PACK_V5R_DEFECT_WITHDRAWN` | 沿用 v3 的 P1-9 语义（`dataplane.js:588-598`），并与内核 fidelity 的 `passedWithdrawnFor` 对齐（`kernel/fidelity.js`，已存在） |

**谁能调**：不是"权限门"，是**路径门**。任何成员都能投 `vibe_v5_verdict`（概率 0..1）；只有票箱收口（`ballot/tally` 钩子，`kernel/ballot.js:475`）能 mint warrant；只有 warrant 能让 `p:1` 被写；只有 `promoteVerified` 能写 verified 轨。四条路各自一个名字，缺一条就是 §3.2 里对应的那个码。

### 3.3 落点（消费者逐个点名）

1. `tools/pre-execute` 上的 M2 模块（v5r 包里**已有**同形先例：`packs/v5r/prompts/v5r-core.js:245-269` 的 `v5r-core-settled-records-only`，`capabilities:['read-args','deny']`）⇒ 消费者：`p1Intent` + 具名拒。
   - ★ 待确认（缺证据）：M2 模块要读 records 须经 `api.services.get(...)`，而它要求 `capabilities:['trigger-workflow']`（`kernel/loader.js:130-145`）。v5r 现有那条只读 args/setting，所以**没有先例证明 pack 的 M2 能读 vmu.records**。两条退路：(a) 若可读 ⇒ 全 pack 层；(b) 若不可读 ⇒ 该模块只做"args 级"判决（够用：p 在 args 里），把 records 读取留给 `promoteVerified`（它在工具 handler 内调用，tally 侧也调）。**本设计两条都成立，不依赖 (a)**。
2. `ballot/tally` 上的 M2 模块（先例：`packs/v3/middleware/lean-gate.js:156` 的 `hooks: {'ballot/tally': onBallotTally}`）⇒ 消费者：`aggregateVerdict` + mint warrant + 调 `promoteVerified`（全一致且 value 1 时）。
3. `vibe_v5_meeting` 的 debate 分支（`packs/v5r/tools.js:530` 那一处 `subjectRequired` 检查旁边）⇒ 消费者：卡片/证明登记门。
4. 读面：`vibe_v5_read_library` 加 `track:'verified'` 直读（无需新工具），或 pack 的 index 读视图。

### 3.4 lean 路径（**第二条合法路径，不是绕路**）
- 规则原文（B8）："只要 lean 通过的命题那么剩下的（在辩论时）只是检查代码中的命题、定义是否描述符合所需，只要符合那么就是完全正确的、布尔概率直接赋值为 1、可以把相应命题加入 verified"。
- 事实：lean 的"通过"是**结论不是状态**，由内核 Lean 面判定（`kernel/lean.js:4,18-19,77`：退出 0 **且** 内容哈希未变才 `passed`；`settled` 才是状态）。`vibe_v5_lean_run/archive` 都接受 `target`（`packs/v5r/tools.js:1215,1239`）——**这是 lean 证据挂到卡片上的现成通道**。
- 设计判断（逐字读规则 2 "只有辩论能把 p 改成 1"）：**lean 通过本身不改 p**；它把后续辩论降级为"描述符合性辩论"，该辩论全一致 ⇒ warrant kind `lean-conformance` ⇒ 才允许 p=1 入 verified。
  - 若 Lead 采另一读法（lean 通过即 p=1），则把 `lean-conformance` 改成"由内核 lean settled+passed 直接 mint"，闸的形状不变、只是 mint 的触发点不同 —— **该读法是规则原文的歧义，标「未判定」**（我倾向本读法：它保住"只有辩论能改 p=1"的字面，且 B8 原文自己就写了"在辩论时"）。
- "鼓励形式化"开关：已存在 `vmu.math.formalVerify`（off|encourage|require，默认 off＝零策略，`settings/schema.js:249`）+ `vmu.turn.formalModeLine`（`:231`，读者 `packs/v5r/prompts/v5r-blocks-a.js:665-675`）。**这一条 B8 已经有机制**，缺的只是与 p=1 的联动（即本节）。

---

## 4. 卡片"能不能用于辩论"的可判据方案

规则要求"含正式证明或证伪内容**且已经写完**"。诚实结论：**"写完"不可机器判定**，只能判定"有登记、可追溯、且没被撤回"。所以把它拆成三层：

1. **声明层（可机器读）**：卡片带两个字段（走 §5 的 facts 或卡形文本解析，二选一）：
   - `proofRef`：证明/证伪内容的文件引用（`Members/<m>/Propos/<id>.md#正式证明` 这种）；
   - `proofState`：`complete | draft`（作者声明）。
2. **证据层（机器事实）**：至少一条成立 ⇒ 允许开辩论：
   - 该卡有 lean-pass 记录（`vibe_v5_lean_*` 的 job settled+passed，且 `target` 指向本卡）；
   - 或 `verified` 轨已有对应定论卡（说明之前辩论已裁过）。
   - 两者都没有 ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（具名，hint 指到"先登记 proofRef/proofState 或先 lean"）。
3. **追溯层**：`proofState:'complete'` 是**作者声明**，不构成证明；违规（声明 complete 但其实没写完）由 D13 的忠实性审查 + defect 撤回路径兜底（`VMU_PACK_V5R_DEFECT_WITHDRAWN`，证据落 fidelity/pack defect 记录）。

**必须写进提示词的一句话**（否则就是"看起来完整"）：`proofState` 是成员自述，框架只能记录与追溯，不能替它判定"写完"。

---

## 5. 实施顺序（F5：**先承载 → 再闸 → 最后才改提示词文字**）

> 依据：本仓已登记的 F5 顺序约束（先删/改文字会让现行机制更不自洽）；且 `vmu.meetings.quorumRule='m-unanimous'`、每轮 JSON 答复机制都还活着，文字必须最后动。

**第 1 步：承载（数据面）**
1. pack 设置：`vmu.records.tracks` += `"verified"`；`vmu.records.allowedKinds` += `"verified"`（`packs/v5r/settings/defaults.json:19-20`）。注意构造期快照（§2 的 head 约束）⇒ 生效边界是"新内核/新会话"。
2. pack 模块：v5r 卡形 `parseCard/composeCard`（照 `dataplane.js:336-360` 的"坏卡只点名、不抛"）+ `findVerified` + `promoteVerified`（v3 语义逐条搬：p∈{0,1}、defect 撤回拒、幂等 refresh、bodyCap 截断并报 bounded）。
3. 读面：`vibe_v5_read_library`/index 视图能按 `track:'verified'` 列头 + 解析出 概率/结论（列表化）。
4. 单测：p=0.7 ⇒ `VMU_STATE`；p=1 ⇒ 写出且 head 可见；内容不变再跑 ⇒ `written:false,unchanged:true`；defect 撤回 ⇒ `VMU_PACK_V5R_DEFECT_WITHDRAWN`；verified 轨被直接写 ⇒ 被单写器闸拒。

**第 2 步：闸（收口）**
5. `aggregateVerdict` + `ballot/tally` M2 模块（mint warrant kind `debate-unanimous`；全一致 value=1 ⇒ 调 `promoteVerified` 并把卡片 p 回写为 1（`records.supersede`，理由机器可读：`v5r verdict: unanimous 1`））。
6. `p1Intent`/`canWriteP1` + `tools/pre-execute` M2 模块（四个具名码）。
7. debate subject 门（卡片 + proofRef/proofState 或 lean-pass 证据）。
8. lean `target` ⇒ lean-pass 证据登记（若 `target` 当前没进 job 状态，需 pack 侧补一条登记记录；见 §6-3）。
9. 单测：非辩论路径造 p=1 ⇒ `VMU_PACK_V5R_P1_NEEDS_DEBATE`；票不足 ⇒ `VMU_PACK_V5R_TALLY_INSUFFICIENT`；票分裂 ⇒ warrant kind `split`（**不 mint p=1**，只把均值写进卡片的"平均概率"行）；direct verified write ⇒ 单写器码；free-string debate subject ⇒ NOT_CARD。

**第 3 步：提示词（最后）**
10. `packs/v5r/prompts/v5r-persona.js:41` 规则 9/10（"只有 locked 正式证明才能辩论"）→ 改成与 §4 的机器判据一致（否则提示词承诺的东西仍未实现——这正是 B6 现在 ⚠️ 的原因）。
11. `packs/v5r/prompts/v5r-blocks-a.js:195`（同一句的副本）、`packs/v5r/meeting-procedures.js:76-79`（把 ④ 从 `pendingReason` 改成 `status:'supported'`，并把 `MEETING_PROCEDURE_GAPS` 的 `verdict-aggregation` 标 closed-by 本次实现）——**这一步只能在 5/6/8 全绿之后做**。
12. D13 的忠实性块（`packs/v5r/prompts/v5r-blocks-b.js:110-134`）目前**无条件常驻**（charter 组装不带条件，见 `v5r-charter.js:33-37,150`）：它断言"该对象已有通过的 Lean 证明"，对没有证明的对象是误导。闸建成后应改为按条件注入（有 lean-pass 证据才出这段），或至少改成"若是……则……"的条件句。

---

## 6. 缺能力清单（每条指名"该在内核还是 pack"）

1. **`p` 的结构化（可选，非阻塞）**：今天 p 只在正文文本里（`kit/handlers.js:76-89`），且 `settled` 不落盘（`kernel/records.js:538-542`）。本设计**不依赖**结构化 p：机器真值 = verified 轨上的定论卡（§2 候选③）。**若**要求"`records.list` 头部直接显示 p/verified"，则必须给内核 records 增结构化字段 + head 投影（`kernel/records.js:329-338` 的 `view` 要改）——**那是内核能力**（records 是内核面），但它的消费者只有在"列表必须显示 p"这一需求被确认后才成立；当前**不推荐**为它开内核改动。
2. **M2 模块读 records 的能力面**：`api.services.get` 需要 `trigger-workflow` 能力（`kernel/loader.js:130-145`），而 vmu 的 `CAPABILITIES` 里没有"只读服务"这一档（`loader.js:34-35`）。本设计的两条退路都不依赖它（§3.3-1），**但要写清这是已知摩擦**：若后续要让 gate 完全声明化（M1 规则 + `subject:` 谓词），就需要内核给一条"records 只读"的服务能力（内核面，消费者 = M1 gate）。
3. **lean job 是否保留 `target`**：`vibe_v5_lean_run/archive` 的 `target` 参数（`packs/v5r/tools.js:1215,1239`）目前由 handler 转交给 Lean 面，**未判定**它是否进入 job 的持久状态/回执（本次未读到 `tools/mathjobs.js` 对 `target` 的处理）。若没保留 ⇒ lean-pass 证据要由 pack 在提交时另记一条登记记录（pack 面，消费者 = §4 的证据层）。
4. **"通知命题卡持有者"**（D15 的第三半）：`ballot/after-decided` 全仓**未实现**（`docs/08:75` 已写"✗"，js 内零命中）；通知要走 `vibe_v5_message`/`kernel/mailbox`（pack 面，消费者 = 持有者；首个消费者就是它自己，符合红线④）。**本设计只做聚合与入轨，"通知"另立一条**（否则又变成"看起来完整"）。
5. **`proofState` 的不可判定性**：见 §4-3。任何试图"自动判定写完"的方案都是假的，必须写成声明 + 事后撤回。

---

## 7. 未判定（缺什么证据）

- **规则 B8 的歧义**：lean 通过后是"必须再有一次描述符合性辩论"还是"直接 p=1"。已按"再辩论一次"设计（§3.4），另一读法只需改 mint 触发点。缺的证据：原版 v5r 的 `end_verify`/结算代码（`archive/legacy-presets/vibe-math-v5r/vibe-math-v5r.js` 的 verdict/settle 段）在 lean 通过后的实际写法——本次未逐行读该文件的结算段。
- **`vibe_v5_verdict` 是不是"最终裁决"面**（台账 D15 待核）：它是唯一的概率票面（`packs/v5r/tools.js:694-720`），但"最终裁决（概率＋理由）"里的**理由**没有承载（`kernel/ballot.js:430` 的 `cast(member,value,{kind})` 无 reason 参数）——若要"理由"，得走 `vibe_v5_say`/会议发言，或给 ballot cast 加 reason（内核面，需先有消费者）。
- **defect 与 verified 的共同真源**：v3 用 pack 的 defect 记录 + 内核 fidelity 双问（`dataplane.js:30,56-60`）。v5r 侧内核 fidelity（`kernel/fidelity.js`）已存在，但**没有任何 pack 消费者**（B1/D13 这一批要把"消费者"补上，否则它仍是"写了没人读"）。
- **`records.put` 的 `bySource`**：`kit/handlers.js:163` 传了 `bySource`，但 `kernel/records.js:457` 的签名里没有它（被静默忽略）。与本设计无关，但属于同一类"声明了没消费"，建议登记。

---

## 8. 消费者一览（红线④：每个新机制一句话说清谁用）

| 新机制 | 消费者 |
|---|---|
| `verified` 轨 + `promoteVerified` | 票箱收口模块（写）、`vibe_v5_read_library`/index（读）、§3.2 单写器闸（拒直接写） |
| warrant 记录（辩论裁决/lean 符合性） | `canWriteP1`（判能否 p=1）、debate subject 门（判能否开辩论）、审计（可追溯） |
| `aggregateVerdict` | `ballot/tally` 模块（mint warrant 的唯一路径）；它同时关闭台账已登记的 `verdict-aggregation` 缺口 |
| `p1Intent`/`canWriteP1` + 四个具名码 | `tools/pre-execute` M2 模块（唯一的写入口闸） |
| debate subject 门 | `vibe_v5_meeting` 的 debate 分支（`packs/v5r/tools.js:530` 处） |
| defect 撤回对齐内核 fidelity | `promoteVerified`/`findVerified`（v3 的 `passedWithdrawnFor` 双问模式，`dataplane.js:56-60`） |

---

## 9. 第 1 步「承载」已落地（实测记录，2026-10-23）

> 本节只记录**第 1 步**。第 2 步（闸）与第 3 步（提示词文字）**未开始**，台账 B1 的状态因此**不变**（仍是 ⚠️，不是 ✅）。

### 9.1 落了什么（4 处改动）

| 文件 | 改动 |
|---|---|
| `vibe-math-vmu/packs/v5r/verified.js`（新建，427 行） | 承载本体：轨/kind 声明、卡与定论卡的容错解析器、合成器、`findVerified`/`listVerified`、单一写入器 `promoteVerified` |
| `vibe-math-vmu/packs/v5r/settings/defaults.json:19-20` | `vmu.records.tracks` += `"verified"`；`vmu.records.allowedKinds` += `"verified"` |
| `package.json#files` / `installer.js:60` | 新模块与它的测试进分发清单（`audit-package-membership` 对这两个文件零告警） |
| `tests/vmu-verified-track.test.mjs`（新建） | 12 组断言，跑**真实** `kernel/records.js`（非 mock）：`72 passed, 0 failed`，EXIT=0 |

导出面（每个都有消费者，见 §9.4）：`VERIFIED_TRACK/VERIFIED_KIND/CARD_TRACK/CARD_KIND/CARD_FIELDS/VERIFIED_REQUIRED_FIELDS/VERIFIED_OPTIONAL_FIELDS/VERIFIED_TITLE_PREFIX/FIELD_SEPARATOR`、`parseBody/parseCardBody/parseVerifiedBody/composeCardBody/composeVerifiedBody/sameFact/parseCard/parseVerified/listVerified/findVerified/promoteVerified`。

### 9.2 按 §5-1 的四条单测，逐条兑现

| §5-1 要求 | 实测 |
|---|---|
| p=0.7 ⇒ 拒 | `VMU_STATE`「not settled (p=0.7)」，且 verified 轨仍 0 条（拒绝不写半行） |
| p=1 ⇒ 写出且 head 可见 | 写出 1 条；`records.list({track:'verified'})` 的头部（`CORE_HEAD_FIELDS`）看得到，标题带 `已验证｜` |
| 内容不变再跑 ⇒ `written:false,unchanged:true` | 成立（比较时忽略 `at` 行）；内容变了 ⇒ `supersede` 刷新**同一条**，不新增第二条 |
| verified 轨被直接写 ⇒ 单写器闸拒 | **未落地**（这是第 2 步的闸）。今天的行为是**具名可见**：`listVerified().bad` 把这条手写行列出来并给原因（`missing required field`），不隐藏 |

### 9.3 实施中实测到、并已写进代码/测试的四个偏差（与 §5 的差异，不是"看起来完整"）

1. **`composeVerifiedBody` 不能写 `# 标题` 行**。`parseBody` 会把非 `- key：`/`## ` 开头的行记为 `malformed`，于是"合成器吐出的体"会被"解析器"判成坏体——自测第一轮就是这么红的。结论：标题归 `records.put({title})` 的**头部**，正文只放字段与 `## 陈述`/`## 判定依据`。
2. **内核在"写"时就截断**：`vmu.records.bodyCapBytes` 不是只在读面生效。一张超过上限的卡在 `put` 时就被截断，`records.get()` 返回 `bodyTruncated:true`。于是 `promoteVerified` 对**读不完整的卡**给具名拒（`VMU_STATE`，消息里写明被截断/丢了多少字节），绝不拿半张卡判定。第 2 步的辩论门必须复用这条，否则会出现"用半张卡通过辩论"的静默错误。
3. **`by` 参与"同事实"比较**：换一个登记人去重推同一结论会**刷新**那一行（`written:true, refreshed:true`），而不是 no-op。这是刻意的：verified 行记录"谁把它送进轨"，与 `at` 不同，它不是易变字段。
4. **第 1 步不引入新错误码**。`packs/v5r/tools.js` 的既有登记集是 `VMU_INVALID_ARGUMENT`/`VMU_NO_SUCH_OBJECT`/`VMU_STATE`/`VMU_ENGINE_UNAVAILABLE`；设计 §3.2 里那四个 `VMU_PACK_V5R_*` 码**必须与 docs/03 的实现表同一批落地**（否则就是"码先于登记"，docs/03 会烂）。因此 defect 撤回今天用 `VMU_STATE` + 消息点名撤回，第 2 步再改名。

### 9.4 今天的消费者是谁（红线④，如实写）

- **今天唯一的消费者是 `tests/vmu-verified-track.test.mjs`**。这是第 1 步的诚实状态：承载先存在，闸才有东西可写、可守。
- 第 2 步补上的消费者（§8 表原样有效）：`ballot/tally` 收口（mint warrant 并回写 p=1）、`tools/pre-execute` 闸（拒非辩论路径设 p=1）、debate subject 门（要求 `proofState`/lean-pass 证据）、单写器闸（拒直接写 verified 轨）。
- 因此**不要**把本模块当成"B1 已实现"：它让第 2 步**可能**，不会让规则**成立**。

### 9.5 门禁实测（只跑与本次改动相关的，不跑全量）

| 命令 | 结果 |
|---|---|
| `node tests/vmu-verified-track.test.mjs` | `=== VMU VERIFIED TRACK: 72 passed, 0 failed ===` EXIT=0 |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` |
| `node scripts/audit-readers.mjs` | `{"A":0,"B":12,"C":0,"D":13,"unclear":0,"defects":0,"deep":false}` |
| `node tests/audit-package-membership.mjs` | 27 passed / 2 failed —— **两条都不是本改动**：都指向别人的新文件 `vibe-math-vmu/kernel/meetingverdict.js` 未进 `package.json#files`；`packs/v5r/verified.js` 与 `tests/vmu-verified-track.test.mjs` 零告警 |
| `node tests/audit-installer-policy.test.mjs` | 90 passed / 0 failed |
| `node tests/audit-pack-face.test.mjs` | 4 passed / 0 failed |
| `node tests/audit-registration.mjs` | EXIT=0 |
| `node tests/audit-v5-integrity.mjs` | EXIT=0「clean」 |
| `node tests/vmu-entry.test.mjs` | 151/151 EXIT=0 |
| `node tests/vmu-kernel.test.mjs` | 260/260 EXIT=0 |
| `node tests/vmu-containment.test.mjs` | 33/33 EXIT=0 |
| `node tests/vmu-host.test.mjs` | 194/194 EXIT=0 |
| `node tests/vmu-records.test.mjs` | 269/269 EXIT=0 |

另有两条**与本改动无关、但当前是红的**（如实登记，避免下一个人误以为是我造成的）：
- `node tests/vmu-settings.test.mjs` 45/2：`vmu.meetings.{extendCeilingMs,scheduleAllowed,waitDecisionRequiresChair,waitOnDueMs}` 四键未进文档表（1263 vs 1267）。
- `node tests/vmu-v5r-tools.test.mjs` 333/1：`G7 ④ close 回执的 enforced 是数组` 这条断言拿到 `{}`。

### 9.6 第 2 步的入口（给下一个人）

1. 先读 `vibe-math-vmu/packs/v5r/verified.js` 顶部注释的 ★★ 段：它把"本文件不是闸"写在第一屏，避免重复实现。
2. `promoteVerified` 的调用点应只有一处：票箱/裁决收口模块。裁决数据从 `kernel/ballot.js` 的 `tally` 结果来（`defaultTally` 今天是"全票或未定"，**没有均值**——§7 已点名）。
3. 四个 `VMU_PACK_V5R_*` 码与 docs/03 实现表、`packs/v5r/tools.js` 的登记集**同一批**加；`p1Intent` 闸要覆盖 lean 路径（lean 通过也要走它自己的 warrant kind，不绕过）。
4. 提示词（persona 规则 9/10、`v5r-blocks-a.js:195`、`meeting-procedures.js:76-79`）**最后**改（§5 第 3 步）。

### 9.7 装配级实测（"defaults.json 真的生效了吗"）

单测注入的是 settings 对象，所以另跑了一次**真实装配探针**（`D:\_tmp\p12-verified-assembly-probe.mjs`，只读代码、只写 temp）：
`entry.apply(ctx, {root:<temp>, packs:['v5r']})` ⇒ `handle.packErrors().length === 0`，且
`handle.kernel.records.status().caps.tracks` **含 `verified`**、`caps.allowedKinds` 含 `verified`；
在该真实 records 面上：p=0.4 卡 ⇒ `VMU_STATE`；settle 后 `promoteVerified` ⇒ `written:true`；
`listVerified` 读回 1 条、`badCount:0`、头部标题带 `已验证｜`。
**结论：装载路径确实把 verified 轨声明进去了（不是"JSON 语法正确"而已）。** `=== VERIFIED ASSEMBLY PROBE: 7 passed, 0 failed ===`

★ 该探针也暴露了一个与本次无关但值得知道的约束：`entry.apply` 的 `clock` 必须返回**有限数字**，返回 ISO 字符串会被 `kernel/clockguard.js:14` 具名拒成 `VMU_CLOCK_UNGUARDED`（`tests/vmu-entry.test.mjs:36` 传字符串能过，是因为那条路径没走到 `records.status()` 的时钟守卫）。

## §10 第 2 步：闸（实测记录，2026-10-23）

本节的定位：§3 是**设计**，第 1 步（§9）只建了承载，**承载不拦任何人**。本节记录第 2 步真实落地了什么、哪几条**没落地及为什么**、以及一句要紧的话——**这四条闸今天有 0 个调用方**。

### 10.1 落了什么（4 处改动）

1. **新文件 `vibe-math-vmu/packs/v5r/verification-gates.js`（320 行）**：四条**纯谓词**，不读设置、不读磁盘、不抛异常、不写任何东西。输入＝「这次调用想干什么」＋「调用方已查到的证据」，输出 `{ok, allowed, applicable, code?, message?, hint?, keys, ...facts}`。
   - 为什么不掺策略：设置怎么读、拒绝怎么抛、`enforced[]`/`enforcedScope` 怎么写，都是**接线层**的事（只有它知道这次判定读了哪些键）。所以谓词返回 `keys` 而不自己编归属字段——纯谓词声称"我强制执行了什么"是虚报。本文件因此**一字不写** `enforced` 那两个字面量（一致性审计会把提到它的模块记成新盲点）。
2. **新测试 `tests/vmu-verified-gates.test.mjs`**：`=== VMU VERIFIED GATES: 93 passed, 0 failed ===`（每闸都成对造"合法收 / 非法拒"，见 §10.5）。
3. **`vibe-math-vmu/docs/03-interface-contract.md` 两张表各 4 行**：§8 语义表 + §1400 附近的实现状态表，四个码**成对**登记（`grep -c` 每码 2 行）。`VMU_PACK_` 前缀的码不在 §8 C 节的"必须登记"范围内（C 节只管非 `VMU_PACK_` 前缀），但按 §9.6 的约定成对登记。
4. **分发登记**：`package.json#files` 加 `packs/v5r/verification-gates.js` ＋ `tests/vmu-verified-gates.test.mjs`；`installer.js:60` 的 PRESETS `files` 加 `'packs/v5r/verification-gates.js'`（三处插入由一个幂等 Node 脚本完成，事后 `JSON.parse` 与字符串包含双重校验）。

### 10.2 四条闸：规则原文 → 判据 → 具名拒 → 判不了什么

| # | 规则原文（台账行） | 函数签名 | 具名拒 | 它**判不了**的 |
|---|---|---|---|---|
| ① | 「只有辩论才能把命题卡的布尔概率修改为 1」（B1） | `p1Intent({tool,args,card,evidence})` | `VMU_PACK_V5R_P1_NEEDS_DEBATE`（p=1 且无三种定论证据之一）；卡读取被截断 ⇒ `VMU_INVALID_ARGUMENT`（半张卡上的否定是猜测） | 证据的真伪：`debate-unanimous`/`verified-row`/`lean-conformance` 三种形态由**调用方自报**，本层只保证"没证据就拒" |
| ② | 「只有命题卡中含有正式证明或证伪（且已写完）才能用于辩论」（B1/B8） | `debateSubjectGate({meeting,subject,evidence})` | `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（卡无 `proofRef+proofState='complete'`／文件不可读为空／卡读不到证据） | 文件形态的**内容完整性**：只判"存在且非空"，回执如实写 `proofContentChecked:false`——宁可承认判不了，也不给一个看起来严的假闸 |
| ③ | 「定论只能由单一写入器写」（B1 的承载侧） | `singleWriter({records,cardId,writer,track,kind})` | `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER`（未声明 `writer`，或 `writer !== 'promoteVerified'`） | 内核 `records.put` 的**直写**：那需要内核侧轨写白名单，本闸明确不声称能挡（§10.6） |
| ④ | 「lean 通过但概率仍非 1 ⇒ 辩论只查代码中命题/定义是否符合所需；符合即 p=1」（B8/D13） | `fidelityAsked({cardId,leanPassed,p,withdrawnFor,answered})` | `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED`（必问且未问）；已有裁定或证明已被撤回 ⇒ `resolved:true` 不追问 | 谁去问、问在哪个阶段：那是接线层的排程，本闸只给"必须问"这个判决与选项 `['conform','defect']` |

补充两条**形态判定**事实（不是闸，是它们的输入分类器）：
- `classifySubject(subject)`：`r-<...>` ⇒ `card`；含路径分隔符或 `.md/.lean/.txt/.tex/.json` ⇒ `file`；其余 ⇒ `statement`。规则原文允许的**一句话命题**因此是**合法放行**，回执记 `provenance:'none'`＋`proofChecked:false`，而不是被误拒成"不是命题卡"。这一点由测试 ⑨ 组钉住。
- 规则原文第三段（lean 通过 ⇒ 辩论只核描述符合性 ⇒ 符合即 p=1）意味着 **lean 是第二条合法路径，但不是绕路**：它同样必须先在辩论中拿到 `conformance:{decision:'conform'}` 才能命中 ① 的 `lean-conformance` 证据形态，否则 ④ 会一直要求追问。

### 10.3 与 §3 设计相比，哪几条**没落地**（这是本节最要紧的部分）

§3.2 一共列了 9 个码，第 2 步只落了 **4 个** `VMU_PACK_V5R_*`（＋ 复用 `VMU_INVALID_ARGUMENT`）。缺的 5 个与理由：

| §3.2 的码 | 状态 | 理由（缺什么才能落） |
|---|---|---|
| `..._WARRANT_INVALID` | **未落地** | 第 1 步的"warrant"载体是 `verified` 轨的一行（`cardId`/`conclusion`/`at`/`by`），**没有独立的 warrant 记录**；"warrant 是否存在/是否匹配"在闸这一层没有可判对象。等第 3 步把 tally→warrant 的载体定下来（内核还是 pack 未判定，§7 仍未判定）。 |
| `..._WARRANT_KIND` | **未落地** | 同上：没有 warrant 记录就没有 `kind` 字段可审。今天 ① 用**证据形态字符串**（`debate-unanimous`/`verified-row`/`lean-conformance`）代替 kind，形态错了就是"无证据"⇒ 落 ① 的 `P1_NEEDS_DEBATE`，不缺一个码。 |
| `..._DEBATE_SUBJECT_NOT_CARD` | **不落（设计变更）** | 规则原文允许三种对象形态（卡 id／文件引用／一句话命题），"不是卡"**本身不是非法**。折成：`statement` 合法放行（记 `provenance:'none'`），非法路径统一到 `..._DEBATE_SUBJECT_NO_PROOF`。少一个码、少一条误拒。 |
| `..._TALLY_INSUFFICIENT` | **未落地** | 它属于 §3.1 的 `aggregateVerdict`（聚合闸），消费者是 `ballot/tally` 接线。本步没写聚合函数：`kernel/ballot.js` 的 `defaultTally` 今天是"全票或未定"（**没有均值、没有 [0,1] 校验**），聚合语义要先定（D15 也还没闭环）。 |
| `..._DEFECT_WITHDRAWN` | **并入 ④** | ④ 的 `withdrawnFor` 分支已经把"证明已被忠实性缺陷撤回"判成 `resolved:true`（撤回过的证明不再追问、也不能再当辩论依据）；单独一个码只会重复。`kernel/fidelity.js` **未改**（它是内核面，§9 已定）。 |

### 10.4 今天这四条闸谁调用（红线④：一句话说清消费者）

**全部为 0。** 这就是本步的诚实时态，也是第 3 步与接线的入口：

| 闸 | 应接在哪 | 缺什么 |
|---|---|---|
| ① `p1Intent` | `vibe_v5_record_proposition` 的写路径（`vibe-math-vmu/packs/v5r/tools.js` 的卡 handler 分支；handler 在 `kit/handlers.js`） | 卡 handler 属 `kit/`（共享内核面，不在 pack 层），要接得先决定"闸放 kit 还是放 pack 的 M2 模块"。若走 M2：`tools/pre-execute` 上能读到 args 的 `p`，但**能不能读 `records` 未判定**（§3.3 ★，需要 `capabilities:['trigger-workflow']`，无先例）。 |
| ② `debateSubjectGate` | `vibe_v5_meeting` 的 debate 分支（`packs/v5r/tools.js` 里 `subjectRequired` 检查那一处） | "卡/文件证据"要由调用方查好再传：会议工具今天不读 `records`。 |
| ③ `singleWriter` | 任何写 `track:'verified'` 的入口（records 面工具 + 卡 handler） | 需要把"入口名"一路传下来；内核 `records.put` 仍是开放写口。 |
| ④ `fidelityAsked` | lean 作业 settled 之后、辩论开题之前 | 缺 **lean 面 → pack 的事件通道**：`kernel/lean.js` 的 mirror 有 `settled/passed` 事实，但 pack 侧没有订阅点（`ballot/tally` 钩子那种先例在 v3 有，在 v5r 的 lean 上还没有）。 |

**处置建议（不许两全）**：接线紧随其后；若第 3 步不做接线，本文件应**删除**，而不是留着当"看起来完整"的方案（模块头注释第 28-30 行已把这句话写进代码）。

### 10.5 测试怎么造的双向（不是形状断言）

`tests/vmu-verified-gates.test.mjs` 12 组 93 条，每闸都成对：
- ①：p=0.4 ⇒ `applicable:false` 放行；p=1 无证据 ⇒ 拒；p=1 三种证据各放行一次；截断卡 ⇒ `VMU_INVALID_ARGUMENT`（断言码，不是"报错了"）。
- ②：非 debate 会议 ⇒ 放行；卡 id 有 `proofRef+complete` ⇒ 放行；卡 id 缺证据 ⇒ 拒；文件可读非空 ⇒ 放行**且** `proofContentChecked:false`（把"松弛"写成断言）；文件 0 字节 ⇒ 拒；一句话命题 ⇒ 放行**且** `provenance:'none'`。
- ③：非 verified 轨 ⇒ 放行；空 writer ⇒ 拒；`writer:'promoteVerified'` ⇒ 放行；`writer:'records.put'` ⇒ 拒；拒绝文案里含唯一写入器名。另有 `gateCatalog()` 的四条与 `GATE_CODES` 一致（防目录与实现漂移）。
- ④：lean 未通过/p=1/已裁定/已撤回 ⇒ 各自 `resolved` 且 `required:false`；lean 通过 + p=0.6 + 未问 ⇒ `required:true` ＋ 码 ＋ `options` 恰为 `['conform','defect']`。

### 10.6 这四条闸明确**不声称**的四件事（防"假严"）

1. **文件形态的内容完整性判不了**（`proofContentChecked:false`，§10.2 ②）。
2. **内核 `records.put` 直写 verified 轨挡不住**：这需要内核层"轨写白名单"（能力在内核）。本闸挡的是"pack 里多出一条写 verified 的路径"。
3. **证据真伪不由本层核**：`ballotId`/`jobId` 与内核真实录取结果的一致性，要靠接线层把 `kernel.ballot` 的 tally、`kernel/lean.js` 的 job 状态当证据传进来；本层只保证"没证据就拒"。
4. **不读设置**：设置里的 policy（例如 `vmu.math.leanAsync`、允许哪些证据形态）不在本层；谓词返回 `keys:[]`，接线层读设置后自己填 `enforced[]`。

### 10.7 第 2 步门禁读数（只跑相关项，不跑全量）

| 命令 | 结果 |
|---|---|
| `node tests/vmu-verified-gates.test.mjs` | `93 passed, 0 failed` EXIT=0 |
| `node tests/vmu-verified-track.test.mjs` | `72 passed, 0 failed` EXIT=0 |
| `node tests/vmu-records.test.mjs` | `269 passed, 0 failed` EXIT=0 |
| `node tests/audit-pack-face.mjs` | `4 passed, 0 failed` EXIT=0 |
| `node tests/audit-registration.mjs` | `DUPLICATE tool names: none` … EXIT=0 |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` EXIT=0（Lead 已修 `meetingverdict.js` 那条） |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` EXIT=0 |
| `node tests/audit-vmu-docs.test.mjs` | **EXIT=1**，唯一原因＝`docs/04 §11` settings 表 STALE（1267 keys / 1172 wired / 95 declared-but-not-wired，`generate-vmu-settings-table.mjs --write` 由 Lead 的 regen 覆盖；**不是本次改动引入**，本次只改了 `defaults.json` 里两个已有键的**值**，不新增键） |

### 10.8 第 3 步入口（按依赖排序，不许跳）

1. 接线 ①＋③：同一处写路径（records 面 / 卡 handler），最小改动，能立刻让"p=1 必须有法官"成立。
2. 接线 ②：debate 分支；先把"卡/文件证据由谁查"定下来（会议上不读 records 的话，就得由 `vibe_v5_meeting` 的 args 收证据，或在内核会议服务里开一个只读接缝）。
3. 接线 ④：需要 lean 面事件通道，缺能力（内核应提供 `lean/job-settled` 事件或在 `lean.status()` 里暴露 passed 集合；产物在 `kernel/lean.js` 的 mirror）。
4. **最后**才改提示词文字：`packs/v5r/prompts/v5r-persona.js:41` 的 rule 9/10、`v5r-blocks-a.js:195`、`packs/v5r/meeting-procedures.js` 第 ④ 条、D13 忠实性块的**条件化**（它今天无条件常驻，台账 B8/D13 已点名）。顺序理由见 §5（F5）：机制活着而文字先删，会让"当前规则是什么"变成无人能答的问题。
5. 接线时把本文件返回的 `keys` 抄进回执/拒绝的 D3 字段（`enforced[]`/`enforcedScope`），**不要**让谓词自己写。
