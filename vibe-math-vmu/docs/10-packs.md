# vmu 10 · 整合包手册（Packs）

> 状态：**草案 v0.1**（"v5r 机制清单"待 B′ 侦察 §2/§5 合并后补全并逐条映射）
> 上位：`01-philosophy.md`（R15 可迁移 / D4 v5r 降为整合包 / D8 行为包含对照）、`02-architecture.md`（L4）
> 定义：**pack ＝ 一份完整"运行机制"的声明组合**（settings 默认 ＋ 中间件 ＋ 提示词包 ＋ 可选脚本 ＋ 迁移），**不是**目录约定或代码分支。

---

## 1. pack 是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 一套机制的**声明式装配**（可读、可审、可 diff） | ❌ 不是 fork 一份内核代码 |
| 可**同时并存/切换**（受冲突策略约束） | ❌ 不是"只能有一个预设" |
| 可**复用**（pack 可 require 另一个 pack） | ❌ 不是把机制写进 settings 的"大对象" |
| 有**版本与迁移** | ❌ 不是一堆散装中间件文件 |

---

## 2. 目录与清单规范（**按实际实现重写，2026-10-09 ✓**）

**一个 pack ＝ 一个 JS 模块**（**没有** YAML 清单、**没有**目录约定 ✗ —— 运行时不读任何 YAML ✓）：

```
vibe-math-vmu/packs/<id>.js        # 随包整合包：export const PACK = { … }
                                   # 或：在 profile 行的 config.packs 里给**内联 manifest**（同一个对象 ✓）
```

**清单字段（`kernel/pack.js` 的 `validatePack` 真正认的集合 ✓）**

| 字段 | 形状 | 校验／行为 |
|---|---|---|
| `id` | kebab-case ✓ | **必填**；非法 ⇒ `id must be a kebab-case identifier` ✓ |
| `version` | semver 样 ✓ | 可选（`1.0.0…` ✓） |
| `packContractVersion` | 整数 ✓ | 可选；交给 `registry.checkPack` 比对公开契约版本 ✓ |
| `requires` | **`[{service, minVersion}]`**（**不是** map ✗） | 与**已发布服务**比对（`vmu.library`／`vmu.members`／`vmu.tasks`／`vmu.prompt`／`vmu.middleware`／`vmu.store`／`vmu.work`／`math_computation` ✓）；缺失/过旧 ⇒ 计划里**具名列出** ✓ |
| `codes` | `string[]` | 每个必须形如 **`VMU_PACK_<ID>_<REASON>`** ✓（R-d ✓） |
| `slots` | `[{id, capacity?}]` ✓ | kebab id＋整数容量 ✓ |
| `tracks` | `string[]` ✓ | 归档分轨名 ✓ |
| `rules` | `[{id, on, when, then, …}]` ✓ | **M1 规则体内联** ✓（`on` 必填 ✓） |
| `middleware` | `[{id, …}]` ✓ | **追加到总线的条目** ✓（注意：`kind:'rules'` 的条目**不会**被编译 ⇒ 规则要放 `rules:` ✗✓） |
| `aliases` | `[{from, to}]` ✓ | 旧名 → 新名映射 ✓（D6 ✓） |
| `settings` | **键→值映射** ✓（如 `{'vmu.meetings.quorumCap': 3}` ✓） | 作为**一层**在装载期施加 ✓（与现有值冲突且未声明 `vmu.packs.allowOverride` ⇒ **具名拒** O4 ✓） |

> **未知字段会被静默忽略** ✗✓（`validatePack` 不校验额外键 ✓）⇒ 写错字段名**不会报错**，只会"什么都没发生" ✗ —— 因此**以本表为准**，并在计划里核对 `actions` 是否出现你期望的条目 ✓。

---

## 3. 清单规范（**真实 JS 形态；照抄 `packs/institute-min.js` ✓**）

```js
// vibe-math-vmu/packs/my-institute.js
export const PACK = {
  id: 'my-institute',
  version: '1.0.0',
  packContractVersion: 1,
  requires: [{ service: 'vmu.tasks', minVersion: 1 }],      // ← 必须是数组，不是 map ✗
  codes: ['VMU_PACK_<ID>_<REASON>'],                          // ← 必须是 VMU_PACK_<ID>_<REASON> ✓（此处为占位形态）
  settings: { 'vmu.meetings.quorumCap': 3 },                // ← 键→值映射（一层）✓
  slots: [{ id: 'chair', capacity: 1 }, { id: 'member', capacity: 8 }],
  tracks: ['progress', 'rejected'],
  rules: [{                                                 // ← M1 规则（内联 when/then ✓）
    id: 'my-institute-no-vote-without-proof',
    kind: 'rules',
    on: ['tools/pre-execute'],
    when: { all: [{ tool: ['vibe_vmu_records'] }] },
    then: [{ deny: { code: 'VMU_PACK_<ID>_<REASON>', message: '示例规则' } }],
  }],
  middleware: [],                                           // ← 追加条目（不含 rules 体 ✗）
  aliases: [{ from: 'my_old_tool', to: 'vibe_vmu_records' }],
}
```

**装载规则（真实现 ✓）**
- **`requires` 不满足** ⇒ 计划里具名列出（`missing`／`tooOld`／契约版本 ✓）并**拒绝 apply** ✓；
- **冲突** ⇒ 三类：**已应用**、**设置重叠**（需 `vmu.packs.allowOverride` ✓）、**总线 id 重复** ⇒ 一律**具名拒** `VMU_PACK_CONFLICT` ✓（O4：**不静默覆盖** ✓）；文档草案里的 `conflicts:` 字段**不被读取** ✗；
- **`plan` 是纯报告** ✓（报告"会改什么"，连续两次不改变任何状态 ✓）⇒ 工具面 `vibe_vmu_pack {action:'plan'}` ✓；
- **`apply` 原子** ✓：中途失败 ⇒ 回滚已施加的动作 ✓（`unload` 用**禁用**而非删除总线条目 ⇒ "加过再禁用"在审计里可见 ✓）；
- **`unload`** ⇒ 逐项回滚设置/条目/别名，并报告**残留**（`residueFree` ✓）；**迁移**（`migrations`）**未被读取** ✗ ⇒ 不承诺回退迁移 ✓。

---

## 4. 优先级与冲突（与 04-§4 一致）

```
pack 默认  <  预设 Config  <  会话 settings  <  运行时 set
```
- **中间件顺序**：`order` 升序 → 同 `order` 按 `id`；**pack 之间不隐式覆盖** ✗；
- **提示词**：作用域优先级（角色<阶段<成员<任务）＋ 后装载者可覆盖前者，但**必须声明**（不声明即冲突报错）；
- **冲突策略（自裁 O4）**：**默认"检测即报错，不静默覆盖"**；若确需覆盖 ⇒ pack 显式声明 `overrides: [<pack>:<id>]`（可审计、可 diff）。

---

## 5. v5r-pack：行为包含对照方案（D8）

> **现状（2026-10-09 ✓✗）**：**`packs/v5r-core.js` 已存在并可装载** ✓✓ —— 它携带 v5r 的机构语义：席位（`chair`／`member`／`temp` ✓）、`m-unanimous` 等机制默认（作为**设置层** ✓，冲突即拒 O4 ✓）、`Progress` 五轨 ✓、**一条打在真实工具上的 M1 规则** ✓（`vibe_vmu_script` ⇒ 拒绝临时脚本 ✓）、**一个随包携带的 M2 代码模块** ✓（`vibe_vmu_records append` ⇒ 要求已定稿 ✓）、以及旧工具名到**已发布服务**的别名 ✓。
> **它不是什么（诚实 ✗）**：**不是**行为等价证明 ✓ —— 行为级 A/B（同场景两侧跑、逐条分类）**仍未做** ✗，需要场景夹具（§5.1 的方法 ✓）。`institute-min` 仍保留为**形状示例**（它的规则指向 v5 时代工具名 ⇒ **不会触发** ✗）。
> **给 pack 作者的两条硬知识**（本轮用真包换来的 ✓✗）：① **`vmu.members` 只在你声明席位后才发布** ⇒ 带来席位的包**不得**把它列进 `requires`（鸡生蛋 ✓）；② **别名目标必须是"已发布服务"**（`vmu.tasks` ✓），**不能是工具名**（`vibe_vmu_records` ✗ ⇒ `VMU_NO_SUCH_OBJECT`）。

> **现状补充（2026-10-10 ✓）：`packs/v3-core.js` 也已落地并可装载** ✓✓ —— 它表达 **v3 的机构**：三槽位 `planner:1／solver:8／verifier:3` ✓、v3 的机制默认（`vmu.limits.maxLiveMembers:4` ↔ v3 `maxParallelThreshold` ✓；`verdictMaxRounds:5` ↔ `debateMaxRounds` ✓）＋**包自有键** `vmu.v3.*`（`verifierCount`／`solverMaxRounds`／`planningHorizon`／`promoteValueThreshold`／`mode` ✓）、v3 的五条产物轨 ✓，以及**两个随包 M2 模块** ✓✓：`ballot/tally` 上强制 **verifier 法定数**（不足即具名拒 ✓）、`mode=manual` 时**拒绝派发**（具名拒 ✓；auto 下保持沉默 ✓）。场景见 `tests/vmu-entry.test.mjs` 第 14 组 ✓。
> **为什么 v3-core 不带 M1 规则（诚实 ✗✓）**：v3 的两条定规矩是**量化/有状态**的（"至少 N 名验证者表态"、"manual 下未经放行不得跑"）——M1 的谓词 DSL **数不了票** ✓；为凑形态而写一条装饰性规则，正是本仓拒绝的那种撒谎 ✗。**这本身也是结论** ✓：**pack 是 JS ⇒ 它可以携带行为**，而 M1 的形态已由 v5r-core 演示 ✓。

**目标**：用 vmu 的 settings＋中间件＋提示词包**复现 v5r 的可观测行为**；**差异逐条报用户裁定**（不自行抹平）。

### 5.1 对照方法（可执行）
1. **同一套场景**：复用本仓 `tests/selfdrive-v5.mjs` 的场景集（v5r 为权威）；
2. **两边各跑一次**：`v5r 本体`（现 `vibe-math-v5r.js`）vs `vmu + v5r-pack`；
3. **比对"可观测行为"**（不看内部实现）：
   - 工具回执（`ok/code/message` 关键字段）；
   - `status()` 的关键字段（阶段/成员/会议/表决/预算/待续）；
   - 归档产物（文件路径 + 关键行 + 指纹）；
   - 提示词**关键段**存在性与顺序（逐字快照可 diff）；
4. **产出差异报告**：`{场景, 观测项, v5r 值, vmu 值, 分类: 等价|有意改进|缺陷|未覆盖}`；
5. **处置**：`等价` ⇒ 通过；`有意改进`/`缺陷` ⇒ **逐条报用户裁定**（D8）；`未覆盖` ⇒ 记录为已知缺口。

### 5.2 v5r 机制 → vmu 能力/中间件 映射（**初版，待 B′ 合并补全**）

| v5r 机制 | vmu 承载方式 | 备注 |
|---|---|---|
| 学术院编制与角色（院士/研究员/临时工） | **角色槽位**（内核）＋ v5r-pack 定义实例与权限 | D5：内核零策略 |
| 会议（议程/轮次/举手/纪要/收束） | 会议原语（08）＋ `meeting.*` 判定点中间件 | 完成判据必须外置 |
| 求真表决（票型/法定数/未定论/复议） | 表决原语（08）＋ `ballot.*` 判定点 | 含"过程票不构成裁定" |
| 表决期禁言（R3/K12/B9） | `ballot.frozen` 判定点 ＋ `meeting.round-complete` 判定点 | **v5r 的真回归点**：冻结期不得推进轮次 |
| 正式证明准入（issue #13 #1） | `ballot.can-open` ＋ `ballot.who-may-open` 中间件（M1） | 需 vmu 提供"具名状态谓词"`has_locked_formal_proof` |
| 记录分轨＋截断计数（#2） | 归档原语（07-§4）＋ `track` 参数 | 直接复用 |
| 待续标记（#5） | 在途工作台账（07-§3） | 直接复用 |
| 资源预算（#4） | `vmu.limits.*` ＋ `budget/exceeded` 中间件 | 机器强制部分进内核能力 |
| 论文阶段与收束 | 阶段机（08-§4.2）＋ `settle/*` 中间件 | pack 定义阶段列表 |
| 归档头部列表＋内容指纹（PR#16/S21） | 归档原语（07-§4.2/4.3）＋ `vmu.prompts` 绑定 | 直接复用 |
| Lean 面与内容身份 | 形式化面（09） | 复用既有 `sha256` |
| 静态门/变异族/语料门禁 | 与仓库现有测试体系对接（见 11） | 复用 runner 与 mock 宿主 |

### 5.3 v5r-pack 的"代价与取舍"（README 必写）
- 复现 v5r 需要**多少**中间件条目、各自负责什么；
- **哪些 v5r 行为被有意放弃**（例如历史包袱、性能取舍）——**必须逐条列出并报裁**；
- 该 pack 对**资源**的影响（唤醒并发、预算默认值）。

---

### 5.3 v5r 文档资产的**承接清单**（方法继承，内容重写）

B′ 判决：v5r 的文档层是**本仓质量最高、与数学无关度最高**的资产；**可迁移的是方法而非内容** ✓：

| 承接物 | 内容 | 在 vmu 的落点 |
|---|---|---|
| **五层文档流水线** | 底稿 → 定稿 → 手册 → 守卫 → **可追溯**（`11-appendix-drafts` 定义分层、`00-README §3` 定义权威顺序、`12-traceability` 做**机器可核映射**） | 本套 00–14 ＋ 本文件 §… ；**"权威顺序"与"编号与引用约定"直接借用** |
| **"必须逐条记账"纪律** | 覆盖边界/已知并发脆弱/未核项**如实登记，不掩盖** | 11-§6 纪律 ＋ 每篇的"未核项"节 ＋ 14-§1/§2 |
| **机器可核的映射表形式** | `12-traceability` 60 行却 17 KB ⇒ **一行一表**便于正则守卫 | 11-§2 的 R↔门禁映射表（同样按"一行一条"写，便于 linter/正则守卫） |
| **R10 跨域不变量** | **过程判定 vs 结束裁定必须分离** | 08 号（表决原语）＋ 11 号（门禁）作为一等约束 |
| **"使能而非驱动"** | 类型/字段**只使能，不驱动**流程 | 04（设置）＋ 08（原语）：任何字段不得隐式改变流程 |
| **"两类时间不得混用"** | 框架级时间 vs 业务时间严格分离 | 01-R12（可复现）＋ 04（设置不接受用户传时间） |

**文档裁决**（B′ §4.2）：11 份 `MEETING-PLATFORM-*.md`（≈290 KB）= **底稿层**（承接"底稿↔定稿分层"做法，**内容丢弃**）／`LEGACY-v5-实现方案（仅供参考）.md`（166 KB）= **丢弃**（v5 已被 v5r 取代）／`架构图.md`（46 KB）与 `设计总览.md` = **改造**（未核内容）／`preset.yml`＋`agent.cordis.yml` = **必须重写**（含 5 处 `!!js` 组合与完整插件行清单）。

### 5.4 v5r 产品侧复用判据（决定性事实）

- **单闭包单体** ✗：11.6k 行**全部在 `export function apply(ctx)` 一个函数体内**（`:413` 起）；除少量纯函数（`resolveKnownTool :93` 等）**没有第二个模块边界**；"子系统"只是同一闭包内的**注释分区**，靠共享闭包变量耦合 ⇒ **"原样复用"只可能发生在已抽出的少数纯件上**（`math-computation.js`/`math-engines.js`、纯算法 `applyV5Event :589`／`judgeVerdict :6593`／`aggregateOpinion :6557`、提示词 builder 群）；
- **对外接线极窄** ✓：`export const inject = ['subagents','agents','fs','tools','commands','timer']`（` :181`）＋ 懒解析 `ctx.get('sandboxPolicy'|'subprocess'|'compaction')`（`:432-434`）＋ **56 个 `registerTool`** ＋ 命令注册 ＋ `subagent/start|end` 监听 ⇒ **vmu 的"能力面"可以照这个接线宽度设计**（依赖面窄＝可替换性强）✓。

---

### 5.5 v5r 复用判决（B′ 终版：**9 原样复用 / 13 抽出重构 / 3 重写 / 0 丢弃**）与**三条硬约束**

**判决分布**（子系统层，共 25 个 S1–S25 ✓）：
- **原样复用（9）**：S2 状态折叠/事件溯源（`applyV5Event :589`）／S6 章程＋提示词 builder 群／**S9 共识验证（`aggregateOpinion :6557`／`judgeVerdict :6593` —— 全仓库最可移植的算法核心）**／**S10 任务板 CAS DAG（自述 ported from DSH agent-teams ⇒ 优先取上游）**／S13／**S14 `math-computation.js`(1481 行)＋`math-engines.js`(197 行) —— 本仓唯一已完成的抽取范例**／S16 三索引／S20 反馈库／S24 测试接缝；
- **抽出重构（13）**：S1/S3/S4/S5/S7/S8/S11/S12/S15/S17/S18/S19/S23 ⇒ **独立模块第一优先＝S12 Lean 通道，第二＝S19 最终论文**（对宿主只依赖 `subprocess`＋`fs`）；
- **重写（3）**：**S21 宿主容量反推**（数 `subagents.list()` 的 live children ＋ 解析 `ACTIVATION_LIMIT_REACHED`）／**S22 沙箱与路径契约**（`sandboxPolicy` 语义）／**S25 工具名过滤回退（从宿主报错文本正则反解已注册工具名 —— 极脆）**；
- **成本集中三处（均"大"）**：S4 会话/子代理绑定、S8 会议平台、S11 治理工具族；其余 22 项合计不超过这三项之一 ✓。

**三条硬约束（会改变做法）** ✗✓：
1. **"原样复用"的最大障碍不是代码而是守卫的匹配方式**：`tests/audit-v5-integrity.mjs:1452` 用 `readRaw()`＋**正则断言源码文本** ⇒ 凡"原样复用"者**必须保留函数名与关键代码形态**，否则门禁全红、复用退化为重写 ✗；
2. **优先依赖上游而非搬第三份副本**：S10（任务板 CAS DAG）／S17（调度）／TeamActivity 片段都**自述 ported from DSH agent-teams / v4 §25** ⇒ 若上游 DSH 仍提供这些能力，vmu 应**直接依赖上游**（**是否仍提供未核** ⇒ 14-§2）✓；
3. **起手式**：**不要先切 11.6k 行的 `apply()`** ✗ —— 先把 **9 个"原样复用"项按现状搬走当基线**，再逐块替换 **S4/S21/S22/S25 四个宿主适配层** ✓（这是 P1 的推荐顺序）。

---

## 6. vmu 自身的"预设接线手册"（把 vmu 装进本仓，逐步骤）

> 依据 B′ 侦察 §1（逐条带行号）；**顺序很重要**。

1. **目录**：新建 `vibe-math-vmu/`（含 `package.json`/`cordis.patch.yml`/`preset-declaration.js`/`index.js`/`kernel/`/`settings/`/`middleware/`/`packs/`/`prompts/`/`docs/`/`tests/`）＋ **`vibe-math-vmu/preset.yml`**（`name`/`description`，生成器取此处）；
2. **预设组合**：写 `vibe-math-vmu/agent.cordis.yml`（**整份作为 `config.plugins`**）⇒ 由 `scripts/build-preset-rows.mjs` 生成 patch 行；
3. **生成器**：在 `build-preset-rows.mjs` 的 `VERSIONS` 与 `ORDER` 各加一项 ⇒ 运行 `node scripts/build-preset-rows.mjs` **重生成** `cordis.patch.yml`（**该文件是生成物，禁止手改**）；
4. **包清单**：`package.json` 增 `exports."./vibe-math-vmu/vibe-math-vmu.js"` ＋ `files[]` 逐项（含 `docs/*`）＋ `dsh.compatNote/testedVersion` ＋ 与 `engines.dsh`/`peerDependencies` 的**三处区间同步**；
5. **版本**：**递增 `package.json#version`**（否则老用户永远拿不到新预设——installer 的强制替换判据）；
6. **安装器**：`installer.js` 的 `PRESETS` 增一条（`src`/`dst`/`files[]`），与第 4 步的 `files[]` **保持一致**；
7. **测试接线**（不修即门禁红）：`tests/audit-preset-rows.test.mjs`（`VERSIONS`/`IDS`）、`tests/audit-math-computation-parity.mjs`（若含数学模块，**副本须字节一致**）、`tests/audit-math-computation-contract.mjs`、`tests/audit-persona-sensitivity.mjs`、`tests/audit-fuzz-helpers.mjs`（预设 JS 表）；
8. **文档与计数**：`README.md`/`README.en.md`（**当前连 v5r 都没写进去** ✗ ⇒ vmu 必须写：预设数量、安装、选 pack）＋ 跑 `node scripts/update-doc-counts.mjs`（它整行重写 4 处计数行）＋ `tests/audit-readme-counts.mjs` 守卫；
9. **语料**：若 vmu 需要**自己的提示词语料** ⇒ 新增 `prompt-corpus-vmu/` 并进 `package.json#files`；若复用语料 ⇒ 在测试里显式声明（照 v5r 复用 `V5_CORPUS_DIR` 的做法）；
10. **验收**：`node tests/run-tests.mjs --counts`（作业/套件/探针计数）＋ `GATE_RELEASE=1 node tests/run-tests.mjs`（全量）＋ `node scripts/update-doc-counts.mjs --check`（文档一致）。

**易漏项清单**（来自实测缺口）：README 未同步 ✗／`docs/test-timing.md` 与 `docs/AUDIT-CHECKLIST.md` 的计数行 ✗／installer 与 package.json 的 `files[]` 不一致 ✗／忘记 bump `version` ⇒ 老用户无新预设 ✗。

---

## 7. pack 作者指南（最短路径）

1. 复制 `packs/institute-min.js` 作为起点（**唯一随包的真实示例** ✓；`packs/_template/` 是 **⛔ 未实现**的规划路径 ✗ —— §9 的骨架属目标形态，当前没有该文件）；
2. 写 `pack.yml`（id/version/apiVersion/requires/conflicts/capabilities）；
3. 写 `settings.yml`（**只放"量"**，流程进中间件）；
4. 写中间件（**优先 M1**；复杂逻辑才 M2；长流程才 M3）；
5. 写提示词包（段模板 + 绑定；**不要改状态块**）；
6. **装载**：在 profile 行的 `config.packs: ['<id>']`（或内联 manifest）里声明 ⇒ 插件装载期 `plan → apply` ✓；`vibe_vmu_pack` 是 **⛔ 未实现**的工具 ✗（库面是 `createPackLoader().plan/apply/unload` ✓）；
7. 跑对照（若有历史参照）⇒ 写 README（机制、代价、取舍、已知差异）。

---

## 8. 门禁（本篇验收判据）

1. **pack 可装载/卸载/回退**，且卸载后行为回到基线；
2. **能力缺失/冲突 ⇒ 具名拒**（两场景）；
3. **dry-run 无副作用**（前后状态哈希一致）；
4. **优先级可证**：四层覆盖各有一条断言；
5. **v5r-pack 对照**：差异报告生成且分类完整（`等价/有意改进/缺陷/未覆盖`）；
6. **接线手册可复跑**：按 §6 步骤能在干净检出上装出 vmu 预设并通过 `--counts` 与文档计数门禁；
7. **无静默覆盖**：pack 间覆盖未声明 ⇒ 报错（§4）。

---

## 9. pack 模板

> **⚠️ 校正（2026-10-09 ✗✓）**：本节的 YAML/目录骨架是**目标形态**，**当前没有对应文件** ✗ —— `packs/_template/` **不存在**，`kernel/pack.js` **也不读 YAML** ✗。**唯一随包的真实模板是 `vibe-math-vmu/packs/institute-min.js`**（85 行、内联 JS manifest ✓，可直接复制改名 ✓）；清单字段的**权威列表**见 §2 的表 ✓。下列骨架仅作**未来形态**参考 ✓。

```
packs/_template/
├── pack.yml
├── settings.yml
├── middleware/rules/example.yml
├── middleware/modules/example.js
├── prompts/bindings.yml
└── README.md
```

**`pack.yml`**
```yaml
id: _template
name: 示例整合包（请改名）
version: 0.1.0
apiVersion: 1                     # 需要的 vmu 公开接口版本（03-§7 / D13-O3）
requires: { vmu: '>=1.0 <2' }
conflicts: []
description: |
  一句话说明这套"运行机制"想达到什么、代价是什么。
capabilities: []                  # 依赖的内核能力；缺失 ⇒ 装载即 VMU_PACK_MISSING
settings: settings.yml
middleware: []
prompts: prompts/bindings.yml
scripts: []
migrations: []
```

**`settings.yml`**（**只放"量"，流程进中间件**）
```yaml
vmu.limits.toolCallsPerTurnCap: 12
vmu.meetings.quorumRule: m-unanimous
```

**`middleware/rules/example.yml`**（M1：可静态校验、可干跑、无副作用能力）
```yaml
id: _template.example
on: [tools/pre-execute]
when:
  all:
    - tool: [vibe_vmu_ballot]
    - not: { subject: has_locked_formal_proof }
then:
  - deny:
      code: VMU_INVALID_ARGUMENT
      message: "只有已被正式证明或证伪、且已定稿的对象才能进入表决"
      hint: "先由有权限者登记 formal_proof"
```

**`middleware/modules/example.js`**（M2：**必须**声明 `meta.apiVersion` 与 `capabilities`，且**每个分支都要 return**）
```js
export const meta = { id: '_template.example', apiVersion: 1 }
export const capabilities = ['read-state', 'deny', 'appendPrompt']
export default ({ log }) => ({
  hooks: {
    'meeting/round-start': async (ev) => {
      if (ev.roster.length >= 2) return                        // ← 必须 return（放行）
      return { deny: { code: 'VMU_MEETING_TOO_SMALL', message: '本轮参与人数不足' } }
    },
  },
})
```

**`prompts/bindings.yml`**（提示词包：**不得改状态块**）
```yaml
- { section: charter, role: reviewer, file: ../../prompts/reviewer-charter.md }
- { section: task-brief, task: ['t-1'], owner: 'm-2', file: task-1-brief.md }
```

**`README.md` 必须回答**：① 这套机制在做什么；② **依赖哪些内核能力**；③ **代价**（并发/预算/提示词长度）；④ **已知差异与有意放弃**（D8：逐条列出，禁静默）。

**装载（两条路，均已可用 ✓）**：① **随包整合包** ⇒ profile 行的 `config.packs: ['<id>']`（或内联 manifest）⇒ 装载期 `plan → apply`（冲突即具名拒 ✓）；② **运行期检查/装载内联 manifest** ⇒ 工具 `vibe_vmu_pack`：`{action:'plan', manifest:'<json>'}`（**纯报告** ✓）⇒ `{action:'apply', …}` ⇒ `{action:'list'}` / `{action:'unload', id}` ✓（该工具**只在声明了整合包时出现** ✓）。

---

## 10. 未核项

- **v5r-pack 的差异清单未生成**（待 P3 对照跑；D8 要求逐条报裁）；
- **OL4 冲突策略已自裁**（检测即报错），但**未实测**多 pack 同时装载的最坏情形；
- **上游是否仍提供 S10/S17 能力未核**（若提供 ⇒ 直接依赖，不搬第三份副本）⇒ 见 14-§2（U9）；
- **`cordis.patch.yml` 生成器的 TRANSFORM 机制**（"恰好命中 1 次"的断言）在 vmu 新增预设定稿前的适配方式未定；
- **pack 的版本升级与回退**（`version` + `migrations`）语义未定。
