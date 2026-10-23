# 车道 · R16 只读设计单：F1「引擎声明不物化」/ D7「会议类型 ⇒ 工具面」

- 作者：`vmu-verify`（验证/门禁车道）
- 性质：**只读取证 + 施工单**。本轮**未改** `vibe-math-vmu/packs/**`、`kernel/**`、`settings/**`、`tools/**`；只写本文件。
- 取证方式：静态 grep（`file:line` 全部实测）+ 两次真实启动探针（`D:\_tmp\f1-engines-probe2.mjs`，boot 序列 `entry.apply(ctx,{clock:()=>1000, root, packs:['v5r']})` → `handle.ready()`）。
- 阅读顺序：§0 结论 → 对应小节的证据表 → 施工单（§A5 / §B4）→ 未判定（§A6 / §B5）。

---

## 0 结论先行

### A（F1）

- **现象成立，但归因不是「谁写入了 `[]`」，而是「没有人写入」**：`vmu.math.engines` 在 schema 里声明为 `stringList` + 8 个默认值（`settings/schema.js:244`、`math-computation.js:34-40`、`math-engines.js:14`），但插件入口只把 `config.vmu` 当 settings（`vibe-math-vmu.js:79-128`、`:138-139`），**schema 默认值从不物化**；`resolveSettings()` 虽会先铺默认（`settings/schema.js:1794-1800`），其运行时唯一调用点只用于 pack 层筛选（`kernel/index.js:2727`），且只应用 `screened.accepted[0]`（`:2734` 起），默认值不进活对象。
  - 实测：活 settings **74 键**，`settingsView().get('vmu.math.engines')` = `undefined`、属性 = `undefined`、`settingSource` = `null`；对照 `vmu.turn.selfCheck`=`false` source `pack:v5r`、`vmu.math.maxParallel`=`1` source `pack:v5r`。
  - 同一棵树的另一探针：`status().settings.resolved['vmu.math.engines']` = `{ value:[8 个引擎], source:'default', hot:'H2', who:'office', overridden:[] }` ⇒ **声明面报默认 8 个、运行面没有这个键**，这就是「声明了却不物化」的准确形状（不是「被谁覆盖成 `[]`」）。
- **「默认可用」与「引擎需探活/需宿主机路径」不根本冲突**：可用性＝描述符数据（`math-engines.js:20+`）+ PATH/安装目录发现（`math-computation.js:428 mathInstallRoots`、`:490 resolveCandidate`）+ `--version` 探活（`:566 probeVersion`），**不需要配置命令路径**；声明默认值只决定「探活哪些候选」，探不到即具名降级（`kernel/mathjobs.js:733` 拒「未声明任何引擎」/`:734` 拒「引擎未声明：X」）。真正的冲突只有一条：**探活有成本**（`probeVersion` 默认 `timeoutMs=20000`，`:569`；结果按 `PROBE_CACHE` 缓存），声明 8 个 ⇒ 首次数学调用最多串行探 8 个候选（`cli` 跳过，`:405`）。这是可接受成本，但必须在文档里写明。
- **最小修法：pack defaults 声明 8 个引擎**（复刻 v5r 原默认，`archive/legacy-presets/vibe-math-v5r/math-computation.js:34-40` 就是 `MATH_ENGINE_ORDER.slice()`）。零代码改动、零新键、零 schema 变更；文档口径改为「默认声明 8 个候选，实际可用性以探活为准」。
- **Lean 不是引擎**（纠正一个前提）：`vmu.math.engines` 从未包含 Lean；Lean 走独立形式化面 `vmu.math.leanCommand`（`kernel/formal.js:20/:66`、`kernel/lean.js:55/:211`），且代码兜底 `|| 'lean'`（`kernel/lean.js:480` 的提示语就是这个坑：成员 shell 能找到 Lean ≠ 宿主服务 PATH 能找到）。⇒ 「真机跑过 Lean ⇒ 引擎一定在某处声明过」不成立。

### B（D7）

- **「会议类型对可用工具零影响」成立，但 lane-d7.md 的「类型是死字段」说法已过时**：类型今天有真实校验（`kernel/meetings.js:1668-1673`，不在 `typeCatalog` 即 `VMU_NO_SUCH_OBJECT`）、随会议对象与读面携带（`:1756`、`:1459`、`:1484`）、并且**已有一处按类型分支**（`:1290-1294`：`vmu.meetings.committeeReportRequired=true` 且 `m.type==='committee'` 且无 report ⇒ `VMU_STATE`）。缺的是「类型 ⇒ 工具面」的**载体**与**活上下文**，不是类型本身。
- **真正的缺口是「当前会议」在核心里没有概念**：全仓只有 `setActiveTurnMember`（`kernel/index.js:2339`、`:2340 currentTurnMember`），`git grep activeMeeting|currentMeeting` 零命中；`tools/turn.js:136-171` 的 `tools` 覆盖有实现但零生产者（`packs/v5r/prompts/*.js` 里 `vibe_vmu_turn` 零命中）。⇒ 任何「按会议类型收窄」的设计，若没有活上下文生产者，就会变成第二个假声明（这正是 lane-d7.md §2.3 的警告）。
- **最小设计（不靠 `turn.step.tools`）**：pack 用 **settings 键** `vmu.toolFaces.byMeeting`（`object`，默认 `{}`＝零差异）声明「会议类型 ⇒ slot ⇒ deny 名单」；kernel 在 `resolveMemberToolDeny`（`kernel/index.js:2375-2392`）**同一处**叠加当前会议类型的 deny（source 记 `meeting`）；host 侧过滤逻辑**不需要改**（`host.js:1560-1575` 已只消费解析器输出），只在「本轮你实际能调用的工具」提示块加一行会议口径。
- **活上下文的唯一生产者**建议＝`vibe_vmu_turn` step 的可选 `meeting` 参数（会议号必须是**活会议**，类型从**已存会议**读，不是请求里声称的类型）；理由与反方选项见 §B3.1。
- **失败面：回落全量 + 回执点名**（会议未定 / 类型未声明 / slot 未声明 ⇒ 不缩窄，note 写明原因），因为禁用工具会让成员中断（Lead 倾向，与本设计一致）。

---

## A（F1）证据

### A1 声明形态与读者

| 事实 | 位置 |
| --- | --- |
| 键声明：`type:'stringList'`、`def: mathDefaults().mathEngines`、`hot: H2`、`who:'office'`、doc 写「默认取自共享模块并拷贝；空＝具名降级」 | `vibe-math-vmu/settings/schema.js:244` |
| 默认值来源：`mathDefaults()` → `MATH_DEFAULTS.mathEngines = MATH_PARAM_DEFAULTS.mathEngines.slice()` | `settings/schema.js:33-40` |
| 共享默认：`MATH_PARAM_DEFAULTS = Object.freeze({ mathComputation:'auto', mathMode:'typed+shell', mathEngines: MATH_ENGINE_ORDER.slice(), mathTimeoutMs:60000, mathPackages:[], mathInstallScope:'user' })` | `vibe-math-vmu/math-computation.js:34-40` |
| 引擎顺序（8 个）：`MATH_ENGINE_ORDER = ['python','r','octave','julia','matlab','maple','wolfram','cli']` | `vibe-math-vmu/math-engines.js:14` |
| 描述符（candidates `['python3','python','py']`、versionArgv `['--version']`、versionRe、probeCode） | `math-engines.js:20+` |
| 读者 1：status 暴露 `engines: settings['vmu.math.engines'] \|\| []` | `kernel/math.js:148` |
| 读者 2：`mathjobs` 读键清单 `:39`、`readKey`（兼容 `.get` 与裸对象）`:422`、`engines: Array.isArray(enginesRaw) ? enginesRaw.map(String) : []` `:444-451`、拒「未声明任何引擎（vmu.math.engines 为空）」`:733`、拒「引擎未声明：X」`:734` | `kernel/mathjobs.js` |
| 读者 3：`mathadapters` 同法读 engines `:129`、`:461-467`；**注释 `:466` 声称 engines 缺省＝引擎顺序，代码返回 `[]` ⇒ 注释与代码矛盾**（libs 缺省＝四个文档库，两者不对称） | `kernel/mathadapters.js` |
| 读者 4：宿主 params 映射 `'vmu.math.engines': 'mathEngines'` | `host-math.js:49` |

### A2 `[]` 是谁写进去的：没有人

- 入口只收部署/overlay 注入的 `config.vmu`：`vibe-math-vmu.js:79-128`（`readSettings`）、`:138-139`（直接作为 settings）。
- pack 默认值的折入点：`vibe-math-vmu.js:354-375`（读 `packs/<id>/settings/defaults.json` 的 `defaults`，跨 pack 冲突记 `VMU_PACK_CONFLICT`）；合并 `settingsWithPackDefaults = Object.assign({}, packDefaults, settings)` 在 `:391`，来源标签写 `pack:<id>` 在 `:395-396`。**折入不查 `who`、不做 schema 域校验** ⇒ pack 可以声明任何键的默认值。
- `packs/v5r/settings/defaults.json` **没有** `vmu.math.engines`（只有 `vmu.math.jobs.persist/recover`、`vmu.math.maxParallel`）；同文件 `:57` 声明 `vmu.meetings.typeCatalog: ['ordinary','academic','debate','closure','paper','planning']`（B 小节要用）。
- `vibe-math-vmu/agent.cordis.yml` 无 `config.vmu` settings 块；`git grep vmu.math.engines` 在 `packs/`、`scripts/`、`installer.js`、`*.yml` 中**无写者**。
- ⇒ 结论：**不是谁覆盖成 `[]`，而是这个键在活对象里根本不存在**；读者各自 `|| []` / `Array.isArray ? : []` 把它变成空 ⇒ 用户看到「声明了却不物化」。

### A3 一个引擎「可用」需要什么

- `probeMathEngines`（`math-computation.js:395`）：遍历 `params.mathEngines`，跳过 `cli`（`:405`：需调用方给命令，不自动探测），逐个 `resolveCandidate`（`:490`：PATH + `mathInstallRoots`（`:428`，每 OS 安装目录表）+ 列目录证明存在）再 `probeVersion`（`:566`：跑 `--version` 匹配 `versionRe`，默认超时 20s，`:569`）；结果缓存 `PROBE_CACHE`（WeakMap）。
- 商业引擎 installed-but-不可用 ⇒ 运行时 `LICENSE_REQUIRED`（不是探活阶段）。
- ⇒ 「可用」＝**描述符 + 发现 + 探活**三件套，全部不需要用户配置命令路径。

### A4 三选一修法比较

| 选项 | 改哪里 | 优点 | 缺点 / 结论 |
| --- | --- | --- | --- |
| **① pack defaults 声明 8 个（推荐）** | `packs/v5r/settings/defaults.json` 加 `"vmu.math.engines": ["python","r","octave","julia","matlab","maple","wolfram","cli"]` | 零代码；复刻 v5r 原默认（`archive/legacy-presets/vibe-math-v5r/math-computation.js:34-40`）；来源可追溯 `pack:v5r`；与同文件既有 `vmu.math.maxParallel` 同形 | 声明即「默认探活 8 个」⇒ 首次数学调用有探活成本；`cli` 被探活跳过，仍是「声明了但永不自动可用」的一项（需在 doc 注明） |
| ② 部署配置补一段 | `agent.cordis.yml` 的 `config.vmu` | 部署可定制 | 部署默认不带 ⇒ 出厂仍是「声明了不物化」，缺陷原样保留；且把「机构默认」写进部署层，违反 pack 管默认的边界 |
| ③ 只在部署侧探活/不声明 | 文档 | 零风险 | 等于承认 `vmu.math.engines` 是假声明：`docs/04-settings.md:364` 已写「✅ 已接线」、`docs/09:650`/`docs/15:599`/`docs/12:213` 同口径 ⇒ 文档与运行时继续矛盾 |

**选①的理由**：这是唯一「不新增键、不改代码、把既有声明变真」的选项；②③都留着「声明面与运行面不一致」这一条被本轮反复判为红的问题。

**冲突分析（Lead 点名要回答）**：

- 与 `vmu.math.maxParallel`（同 pack、`kernel/mathjobs.js` 的并发闸）**无冲突**：一个是「探活哪些候选」，一个是「同时跑几个作业」。
- 与沙箱/超时键**无冲突但有关**：探活在插件进程内 `spawn --version`，不走 `mathjobs` 的作业沙箱；探活超时由 `probeVersion` 的 `opts.timeoutMs`（默认 20s，`:569`）控制，与 `vmu.math.timeoutMs`（作业超时，`math-computation.js:194-196`）是两套。**不要**把二者混成同一个键。
- `who` 已是 `office`（`schema.js:244`），H2 热改仍可运行期收窄/清空 ⇒ 部署若想「默认无引擎」，显式设 `[]` 即可，且会走 `VMU_PACK_CONFLICT` 的具名门（需在 `vmu.packs.activeOverrides` 点名或 `allowKernelOverride`）——这正是 O4 要的「不许静默碰撞」。

**文档终态（Lead 的验收口径）**：正确终态不是「硬塞默认值就完事」，而是两句都写：①机构默认声明 8 个候选（复刻 v5r）；②实际可用性由探活决定，探不到即具名降级；③`cli` 不参与自动探活，要用需显式给命令。开会/辩论/Lean 路径不依赖 python，这一点已在实测中成立（Lean 走 `vmu.math.leanCommand`，与 engines 无关）。

### A5 施工单（F1）

1. `vibe-math-vmu/packs/v5r/settings/defaults.json`：加一个键（见 A4①）。**owner＝pack 车道**。
2. 文档三处改口径（owner＝文档/核心车道）：`docs/04-settings.md:364`（默认值 + 「来源 pack:v5r」+ 探活成本）、`docs/15-math-computation-toolbox.md:599`、`docs/12-user-guide.md:213`；`docs/09-math-formalization.md:650` 只需确认它讲的是 Lean（`leanCommand`）不是 engines。
3. `kernel/mathadapters.js:466` 注释与代码矛盾（声称 engines 缺省＝引擎顺序，实际 `[]`）：改注释或改代码，二选一（owner＝核心车道）。
4. **门禁（我）**：新建 `tests/audit-engine-materialization.test.mjs`，断言：
   - 真启动（`packs:['v5r']`）⇒ `settingsView().get('vmu.math.engines')` 是 8 个名字、`settingSource` = `pack:v5r`、`status().settings.resolved[...].source === 'pack:v5r'`；
   - **反向自证**：boot 不带 packs ⇒ 该键不存在（证明默认来自 pack 而非代码兜底），且 `mathjobs` 提交时仍具名拒 `VMU_MATH_UNSUPPORTED_OP`/「引擎未声明」（证明「空＝具名降级」没被破坏）；
   - 文档防漂移：`docs/04-settings.md` 该行默认列表 == 运行时列表（同一数组，防两边各改各的）。
   - 注册进 `package.json#files` + `installer.js`（若有清单）。
5. **回归风险**：`git grep vmu.math.engines` 命中 9 个测试文件（`vmu-math-adapters`、`vmu-mathjobs*`、`vmu-job-cancel`、`vmu-subprocess-admission`、`vmu-resume-token-contract`、`vmu-finally-falsify`、`audit-enforced-consistency`），**全部自带显式 settings**（不依赖 pack 默认）⇒ 翻转风险低，但落地后必须重跑这 9 个 + `vmu-math*` 全组。
6. 需要同时确认：`vmu.math.engines` 是否已在 `docs/04` 的设置表里被 `generate-wired-schema` 一类生成器登记（避免「pack 声明了但生成面没跟上」）。

### A6 我没判定什么

- 没判定「机构默认该不该有引擎」这个**政策**问题：本单只证明「声明与运行不一致」，并给出复刻 v5r 的最小修法；要不要默认探活、要不要只留 python，是产品决定。
- 没实测探活耗时（没有在本机跑 8 个引擎的冷探活）；只读了默认超时与缓存实现。
- 没判定 `cli` 那一项该怎么处理（它被 `probeMathEngines` 显式跳过）：文档注明即可，还是应从默认列表里去掉，需要 pack/核心定。
- 没验证「活 settings 74 键」在带其它 pack 的部署下是否仍成立（只测了 `packs:['v5r']`）。

---

## B（D7）证据与设计

### B1 今天的事实（逐条 file:line）

| 事实 | 位置 |
| --- | --- |
| 席位维度：pack 声明 `get toolFaces() { return V5R_TOOL_FACES }` | `packs/v5r/prompts/v5r-core.js:202` |
| 声明由「行首 `·` 子弹里的 `vibe_v5_*` 名」推导（ROUND 31 教训：扫全文会把散文提及当权限，实测 member 提示词 20 名 vs 请求表 22 名）；DENY 而非 ALLOW 的理由在 `:780` 注释 | `v5r-core.js:756-789` |
| 注册：`declarePackToolFaces(faces,{by})` 校验 + 存 `packToolFaces` Map | `kernel/index.js:2331-2336`（Map 建于 `:1875`） |
| **单一解析器**：读活名册取 `slot`、遍历各 pack faces 合并 deny、叠加 turn 覆盖，返回 `{ok,member,slot,all,deny,allow,source}` | `kernel/index.js:2375-2392 resolveMemberToolDeny` |
| 调用时闸门：复用同一解析器 + 纯谓词 | `kernel/index.js:2402 memberFaceGate`、`kernel/memberface.js:20-28`（`FACE_CODES.NOT_IN_FACE='VMU_TOOL_NOT_IN_FACE'`、`UNRESOLVED='VMU_TOOL_FACE_UNRESOLVED'`、`FACE_REASONS=['seat','turn']`） |
| 宿主面：按解析结果过滤 `out.tools`（`all`⇒`[]`；`allow`⇒只留；否则去 deny），写提示块「【本轮你实际能调用的工具｜slot】」，记 `narrowFaceByAgent`（窄或不变，绝不更宽）；后续步 `tools.restrict` | `host.js:1560-1575`、`:1634-1637` |
| `tools` 覆盖：三形态（`none` / `{"allow":[...]}` / 缺省）、落地 `kernel.setMemberToolOverride` + `setActiveTurnMember`、finally 清理；`:261` 参数说明 | `tools/turn.js:136-171`、`:261` |
| 生产者：`packs/v5r/prompts/*.js` 里 `vibe_vmu_turn` 零命中 ⇒ **零生产者** | 实测 grep |
| 会议类型：`typeCatalog` 读取 | `kernel/meetings.js:122` |
| 打开：`openSeq({type='ordinary',...})`；类型不在 catalog ⇒ `VMU_NO_SUCH_OBJECT`（`enforced` 记该键） | `meetings.js:1648`、`:1668-1673` |
| 携带：会议对象 `type: String(type)`；`meetingView` 读面返回 `type` | `meetings.js:1756`、`:1459`、`:1484` |
| **唯一按类型分支**：`committeeReportRequired` 且 `m.type==='committee'` 且无 report ⇒ `VMU_STATE` | `meetings.js:1290-1294` |
| 活会议集合：`const live = new Map()`；关闭时 `live.delete(m.id)` | `meetings.js:213`、`:1309` |
| 「当前会议」不存在：只有 `setActiveTurnMember` / `currentTurnMember` | `kernel/index.js:2339`、`:2340` |
| 会议服务访问：`meetingsRef` 代理 + `createMeetings` | `kernel/index.js:749-752`、`:1306` |

**对 lane-d7.md 的校正**：`lane-d7.md:5` 与 `:34`「会议类型本身是死字段」应改为「**类型有校验、有携带、有一处分支，但没有工具面差异**」；`:25`「`turn.step({tools})` 零生产者」保持成立；`:45/:69` 的「将来落点＝pack 声明 + turn 覆盖」中的「turn 覆盖」应改为「解析器叠加 + 活上下文」，因为 turn 覆盖本身也是无生产者的机制（用它当承载等于把假声明接到假机制上）。

### B2 声明面：为什么用 settings 键而不是新的 manifest 字段

- 新 manifest 字段（如 `declarePackMeetingToolFaces`）要动：`validatePack` 允许字段表、`pack.js` 的 owner 校验、新 Map、新读面、声明面登记与门禁 —— 六个面，且是**静态**声明（改策略要重载 pack）。
- settings 键 `vmu.toolFaces.byMeeting`：`type:'object'`（schema 已有 22 个 object 键，`schema.js:250/:308/:389/:441/:472` 是既有先例）、`who:'office'`、`hot: HOT.H1`；pack 在 `settings/defaults.json` 里声明默认（折入路径不查 who，见 §A2），部署/session 可覆盖（`pack 默认 < preset Config < 运行期 set`）。**零新声明面、零新读面**，且天然是「数据不是代码」。
- 形态（建议，最终由核心定）：

```json
"vmu.toolFaces.byMeeting": {
  "debate":  { "chair": { "deny": ["vibe_v5_hire"] }, "member": { "deny": ["vibe_v5_hire"] }, "temp": { "deny": [] } },
  "closure": { "member": { "deny": ["vibe_v5_hire", "vibe_v5_invite"] } }
}
```

  - **只允许 `deny`，v1 不提供 `allow`**：会议维度只能收窄，不能放宽（host 的 `narrowFaceByAgent` 不变量「窄或不变」必须保持；放宽会让会议成为绕过席位面的大门）。
  - 默认 `{}` ⇒ 未声明任何会议类型 ⇒ **与今天逐字节一致**（这是「零差异」的可测定义）。
  - slot 名必须与名册 slot 同名（`chair`/`member`/`temp`，见 `v5r-core.js:756-789` 的 roleSet）；未知 slot ⇒ 视为未声明（回落全量 + note），**不静默丢弃**。

### B3 解析面与活上下文

#### B3.1 「当前会议类型」从哪来（本设计的唯一新增生产者）

三个候选：

| 候选 | 做法 | 判定 |
| --- | --- | --- |
| **① `vibe_vmu_turn` step 的可选 `meeting` 参数（推荐）** | 生产者把会议号交给内核；内核校验它必须是**活会议**（`meetings.js:213 live`），**类型从已存会议读**（`meetingView`/`meetings.js:1756`），不是请求里声称的 `type`；与 `setActiveTurnMember` 同点设置、finally 清理 | 会议号是活上下文的最小必要输入；类型不来自请求 ⇒ 不违反 Lead「会议来自活状态」；与既有 turn 上下文机制同构 |
| ② 从「唯一活会议」推导（零新参数） | 解析时看 `status().liveMeetings`：恰好一个 ⇒ 用它的类型 | **危险**：办公室在一次辩论会进行中处理别的工具调用，会被错误收窄到辩论面（错误缩窄＝成员中断）。且多会议时立刻歧义 |
| ③ 不加生产者，只声明不生效 | 只加 settings 键 | 就是 lane-d7.md 警告的「第二个假声明」，拒绝 |

⇒ 推荐①，并写明：**若 Lead 认为「给 turn 加参数」也不可接受，则本项应判「前置条件不满足，不做」**，因为②有错误收窄风险、③是假声明。

#### B3.2 解析器改法（一处叠加，不新增第二解析器）

在 `kernel/index.js:2375-2392 resolveMemberToolDeny` 内、`packToolFaces` 合并之后、turn 覆盖之前（或之后均可，但**必须在同一个函数内**）：

1. `const meetingType = currentMeetingType()`（新读面：由 `activeMeetingId` 查活会议得 `type`；无则 `null`）；
2. 若 `meetingType` 且 `byMeeting[meetingType]` 存在且含 `slot`：把该 slot 的 `deny` 并入 `deny`，`sources.push('meeting')`；
3. 返回值新增诊断字段（不改既有字段语义）：`meeting: { id, type, applied, note }`：
   - `applied:true` ⇒ 真的并入了 deny；
   - `applied:false` + `note` ∈ {`'no active meeting'`, `'meeting type "<t>" not declared in vmu.toolFaces.byMeeting'`, `'slot "<slot>" not declared for meeting type "<t>"'`}。
4. `kernel/memberface.js:20-28` 的 `FACE_REASONS` 扩为 `['seat','turn','meeting']`；`memberFaceGate` 的拒绝信息带 face 名 + 会议类型（`VMU_TOOL_NOT_IN_FACE`，`reason:'meeting'`）。

**为什么必须在同一函数**：D7 的 20-vs-22 教训是「两处解析必然漂移」；`host.js:1560-1575` 已经只消费解析器输出，所以解析器一处改，wire 面自动跟随。

#### B3.3 失败面（Lead 点名的第四问）

| 情形 | 行为 | 回执 |
| --- | --- | --- |
| 没有活会议 / 未设上下文 | 不缩窄（今天的行为） | `meeting.applied=false, note:'no active meeting'` |
| 会议类型不在 `byMeeting` | 不缩窄 | note 点名类型 |
| 类型在、slot 不在 | 不缩窄 | note 点名 slot + 类型 |
| `meeting` 参数指向不存在/已关闭会议 | **具名拒**（生产者处，`VMU_NO_SUCH_OBJECT`），不静默回落 | 工具回执带 id |
| 会议在 turn 进行中被关闭 | 解析时读活状态 ⇒ 下一解析即回落全量；本 turn 的 wire 面是「呈现」，调用时闸门是「允许」（与既有 D7 分工一致） | note 记 `closed during turn` |

**为什么回落全量而非具名拒**：成员被禁用工具会直接中断（工具不存在 ⇒ 模型可能把调用写进正文 ⇒ `VMU_TURN_NO_FENCE`，`tests/vmu-v5r-tools.test.mjs:1330-1349` 已实测过这条链）。**禁用**是「不允许调用」，不是「不存在」，所以 wire 面不缩窄、调用时闸门拒，才是正确的两段式。

#### B3.4 宿主面（只需一行口径）

`host.js:1560-1575` 的过滤逻辑不动；在该处写提示块时，若 `meeting.applied` 为真，块头改为「【本轮你实际能调用的工具｜slot｜会议类型=t】」并在 `narrowFaceByAgent` 诊断里带 `meeting`。`host.js:1634-1637 tools.restrict` 不动。

### B4 施工单（D7）

| # | 文件 | 改动 | owner |
| --- | --- | --- | --- |
| 1 | `settings/schema.js` | 新增 `{ key:'vmu.toolFaces.byMeeting', type:'object', def:{}, hot: HOT.H1, who:'office', doc:'会议类型 ⇒ slot ⇒ deny 工具名（只收窄；默认空＝零差异）' }` | 核心 |
| 2 | `packs/v5r/settings/defaults.json` | 可选：声明一条最小策略（如 debate 禁 `vibe_v5_hire`）。**建议先只声明 `{}` 或干脆不声明**，等门禁绿后再加政策值（避免把「机制验证」和「政策决定」混在一次改动里） | pack |
| 3 | `kernel/index.js` | `activeMeetingId` 标量 + `setActiveMeeting(id)`/`currentMeetingType()`；`resolveMemberToolDeny` 叠加 meeting deny + 诊断字段（§B3.2） | 核心 |
| 4 | `kernel/memberface.js` | `FACE_REASONS` 加 `'meeting'`；拒绝信息带会议类型 | 核心 |
| 5 | `tools/turn.js` | `step` 增可选 `meeting`（必须是活会议，类型从已存会议读）；与 `setActiveTurnMember` 同点设置/清理 | 核心 |
| 6 | `host.js` | 提示块 + 诊断带会议口径（§B3.4） | 宿主 |
| 7 | `docs/04-settings.md` | 新键一行（默认 `{}`、只收窄、失败面） | 文档/核心 |
| 8 | **门禁（我）** | 新建 `tests/vmu-meeting-toolface.test.mjs`，用例见 §B4.1 | 我 |

#### B4.1 门禁用例（必须含反证，否则就是「有牙无自证」）

1. **零差异**：未声明 `byMeeting`（默认 `{}`）⇒ 解析器输出与今天逐字段相等（`deny`/`allow`/`all`/`source` 深比较，`meeting.applied===false`），三个 slot 各一遍。
2. **收窄生效**：声明 `debate.member.deny=['vibe_v5_hire']` + 活辩论会 ⇒ 解析器 `deny` 含该名、`source` 含 `'meeting'`；`memberFaceGate({member,toolName:'vibe_v5_hire'})` ⇒ `VMU_TOOL_NOT_IN_FACE` 且信息含 face 名与 `debate`。
3. **同工具在普通会可用**：同一成员、同一工具、会议类型 `ordinary` ⇒ 解析器不含该名、闸门放行（证明差异确实来自会议类型，不是席位）。
4. **未声明类型回落**：`paper` 会 ⇒ `applied:false` + note 点名 `paper`；解析器输出与用例 1 相等。
5. **只收窄不放宽**：声明里即使出现 `allow` 字段也被忽略（或 schema 拒），且最终 deny 集合 ⊇ 席位 deny（不变量断言）。
6. **活状态优先**：turn 进行中关闭会议 ⇒ 下一次解析 `applied:false`（不缓存旧类型）。
7. **生产者校验**：`meeting` 指向不存在/已关闭会议 ⇒ 具名拒 `VMU_NO_SUCH_OBJECT`，且**不设置**上下文（后续解析仍是 `no active meeting`）。
8. **反证（自证牙齿）**：临时把 `byMeeting` 的 deny 名单里那个工具名改错 ⇒ 用例 2 必须红；恢复 ⇒ 绿。门禁输出里打印这对红/绿。

### B5 我没判定什么

- 没判定「v5r 应该给哪些会议类型禁哪些工具」——这是政策，需要 pack 车道给清单；本单只保证机制真实、可测、零差异。
- 没判定 `vibe_v5_hire`/`vibe_v5_invite` 是不是正确的示例名（只从 `v5r-core.js:756-789` 的 roleSet 里取了存在性；具体名单应由 pack 声明时校验存在性）。
- 没判定「一个成员同时属于两个活会议」的语义（本设计要求**显式**上下文，正是为了避开这个问题；若将来要支持并发多会议，需要 per-turn 上下文而不是全局标量）。
- 没改 lane-d7.md 的正文（只在本文件 §B1 给出校正建议）——它属于另一条车道，改法由 Lead 分配。
- 没实测 host 面（`host.js:1560-1575`）的会议口径行——本轮不实现，只给落点。

---

## 附：本单未做的事（避免误读）

- 没有跑全量 T1（Lead 明确「先别跑」）；没有改任何 `packs/**`、`kernel/**`、`settings/**`、`tools/**`。
- 没有新建测试文件（§A5.4 / §B4.1 的用例是**施工单**，不是已落地的门禁）。
- 没有把本单的结论写进 `04-parity-matrix.md` / `05-framework-strength-evidence.md`（等 Lead 裁定后再合并，避免矩阵与事实两处各写一套）。

---

## F 落地状态（R16 执行中，2026-10-23）

Lead 批准 F1 后已落三件（`kernel/**` 只改注释、`docs/**` 只改一处、`tests/**` 新增一个门禁）：

1. **判据注释**：`vibe-math-vmu/kernel/mathadapters.js:466-472` 改为「两种缺省，故意不对称」；行为行 `:473`（libs 缺省四库）与 `:474`（engines 缺省 `[]`）原样未动。判据是**代码对、注释错**：若按旧注释「engines 缺省＝引擎顺序」，未声明时适配器会静默探 8 个引擎，与 `kernel/mathjobs.js:733` 的具名拒语义冲突。
2. **用户文档**：`vibe-math-vmu/docs/04-settings.md:223-229` 新增 §8.1，写清「默认 8 候选由 pack 层物化（source `pack:v5r`）、schema 只是声明层」「可用性＝探活（`math-computation.js:395`；`:569` 超时 20000，`:609` 首个候选 20s、其后 45s）」「不在设置里写命令路径」「具名降级点名 `kernel/mathjobs.js:733`/`:734`」「Lean 不是引擎，走 `vmu.math.leanCommand`（`kernel/lean.js`、`kernel/formal.js`）」。
3. **门禁**：`tests/audit-engine-materialization.test.mjs`（三臂 + 3 fixtures，已注册 `package.json:522`）。**红线先行读数：FAIL 6/17，EXIT=1**，六条全在 ARM 1（`defaults.json` 尚无该键 ⇒ `settingSource=null`、`settingsMerge.sources[KEY]=undefined`、file 侧 `undefined`）；ARM 2（无 pack boot ⇒ `settingSource===null` + `resolved.source==='default'` + mathjobs 具名拒 `VMU_MATH_UNSUPPORTED_OP`，booby-trap `spawn` 未触发）与 ARM 3（`docs/04` §11 `:372` 默认 cell == 运行时 `resolved.value`）已绿。

**待落一行**：`vibe-math-vmu/packs/v5r/settings/defaults.json` 的 `vmu.math.engines`（值＝原 v5r 默认 8 个）。**等 Lead 绿灯**（vmu-core 正在同一文件加 `vmu.records.tracks` 的 `scripts` 项）；未落前不把「期望 17/17」当结论。

**门禁读数**：`scripts/check-docs.mjs` PASS；`tests/audit-package-membership.mjs` 29/0（★ 文件名是 `.mjs` 不是 `.test.mjs`）；`tests/audit-vmu-docs.test.mjs` STALE（Lead 统一 `--write`）。

**未判定**：8 引擎冷探活**总耗时未实测**；真宿主机上 8 个候选的实际命中未测；部署层是否需要物化未验（Lead 已裁不做）；D7 一字未动。

> 注：上面「附：本单未做的事」第 2 条（没有新建测试文件）只描述**设计阶段**；F1 门禁是本轮批准后新增的。
