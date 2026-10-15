# vmu 交接·Lead 裁决台账（Round 1 起）

> 依据：项目哲学理念（vmu = 框架 + settings + 中间件(+代理自组织) + 特殊脚本/协议/插件 构成的**整合包文件夹**；追求自由度／可调控性／运行机制可定义性／扩展性极强；用途＝数学研究基础设施）。
> 效力：本轮（Round 1）所有队友的改动以本文件为准；冲突时以「能力进内核、策略进 settings/中间件」为准。
> 落点：本轮结束后择要并入 `Vibe-Mathematics/vibe-math-vmu/docs/28-decision-history.md`。

---

## D-01 工具面可达性：**声明式意图 → 工具面**映射（取代 4 个硬编码开关）

- **问题**：45 个工具面中 35 个真机不可达。`vibe-math-vmu.js:242-253` 只传 4 个 `*Tool`；`host.js:589` 只转这 4 个；`host.js:190` 其余默认 `false`，`host.js:492-533` 的 `if(xxxTool)` 恒假。
- **裁决**：**是**（declared-intent-gated registration）**保留**，但把"哪些意图点亮哪个面"做成**单一、数据化、可审计的映射表**，而不是散落的 `config.x !== undefined`。
  - 映射表放 `host.js`（host 是策略的归属地；`host.js:497-498` 的既有注释已确立这条边界）。
  - 每个面必须**有据可依**：其意图来源＝`docs/03 §3.1` 面表 ∩ `settings/schema.js` 的 `vmu.<family>.*` ∩ `preset.yml` 声明的 `config` 键。三处不一致时，以"文档化的意图"为准并**同时修文档**。
  - **零机制红线不变**：无任何声明时，仍然只注册 `vibe_vmu_status` 一个工具（R1）。映射表必须能在测试里证明这一点。
  - 每个面要么**可达**，要么**具名不可达**（`vmu.core.facesDisabled: ['<face>']` + 具名拒），不允许"静默不存在"。
- **验收**：① 45 个面各有至少一条可达路径；② 无声明 ⇒ 恰 1 个工具；③ 任一面的意图被声明 ⇒ 该面出现；④ 变异：删掉映射表任一行 ⇒ 具名红。

## D-02 pack 设置合并：**唯一优先级**，冲突具名报错

- 优先级（由低到高）：`pack 默认 < preset Config < 会话 settings < 运行时 set`（= docs/04 §3 既有裁决）。
- 三条现存路径（`vibe-math-vmu.js:221` 用户赢 / `kernel/pack.js:318-338` 重叠即拒 / `kernel/index.js:1017-1046` 只收 id+aliases）**必须收敛为一条**实现 + 一个 `status()` 可回显的 `resolved` 视图（逐键标来源层）。
- 重叠冲突：默认**具名报错**，仅显式 `overrides` 放行（= O4 既有裁决）。禁止静默覆盖。

## D-03 中间件四形态：**没有纸面形态**

- `kernel/bus.js:97` 接受 `kind:'script'|'plugin'` 但 `bus.js:301-304` 无消费者 ⇒ 二选一：**真接线**或**具名拒绝**（`VMU_MIDDLEWARE_KIND_UNSUPPORTED`）。不允许"校验通过、运行时静默跳过"。
- 真实载体写进文档并成为唯一说法：M1 声明式规则／M2 代码模块＝总线；**M3 脚本/工作流＝`kernel/script-bridge.js` + `vibe_vmu_script`**；**M4 外部插件/mod＝消费 vmu 公开服务的外部 DSH 插件，pack ≠ M4**（pack 是 L4，自成一档）。`docs/05:61` 与 `docs/10:6` 的矛盾按此改。

## D-04 钩子表：**单一真源 + 生成**

- 现有三份不同步：`kernel/bus.js:44-53`（VU_HOOKS 22）、`kernel/loader.js:25-31`（DSH_HOOKS 18）、`host-hooks.js:27-32`（BRIDGED_HOOKS 14）。
- 裁决：定义**一份**钩子登记（名／时机／可否阻断／可否改写／作用域／失败语义／是否桥接），其余表由它派生；新增门禁断言"桥接集 ⊆ 可订阅集，且每个桥接项有真实注册点"。

## D-05 T0 工具必须进仓

- 现状：T0 预检（`_oneoff/vmu/tools/preflight.mjs`）、17 关 doc linter、真机驱动、全部 live 证据都在**版本控制外** ⇒ 干净 clone 无法复现门禁。
- 裁决：T0 相关工具**搬进 `Vibe-Mathematics`**（`scripts/` 或 `tests/`），并**双登记**（`package.json files[]` + `installer.js PRESETS.*.files`，见 docs/11 纪律⑲）。
- 真机驱动与 live 证据：本轮至少把**驱动脚本**入库；历史证据可按"外部证据副本"保留在 `_oneoff/` 但必须在 docs 里点名其不可复现性。

## D-06 门禁作用域语义必须**可预测**

- 现状：`--only` **静默**把生效作用域降级为 `full`（`tests/run-tests.mjs:362`），表头仍印 `scope=quick` ⇒ 标签错、结论不可比。
- 裁决：`--only` 与作用域**正交且显式**：`--only` 一律与"请求的作用域"求交，表头**同时**打印请求作用域与生效作用域与最终作业数；任何"降级"必须打印具名原因。
- `VMU_EXCLUDE` 的子串匹配（`prompt-v5` ⊂ `prompt-v5r`）是缺陷 ⇒ 改锚定/精确匹配，并把被误踢的 `vmu-prompt-v5r-bridge.test.mjs` 收回 vmu 作用域。
- `tests/run-tests.mjs:326` 声称的分类守卫 `tests/audit-scope-classification.test.mjs` **必须真实存在**。

## D-08 目标 2 的验收口径：**三层基线**（reader-c 实测后定）

用户原话是"支持原 vibe-math-v5r 在这些方面的全部功能"。reader-c 实测后必须分三层，否则会把"设计文档里的"当成"已实现的"：

- **基线 A（必须，= v5r 实际实现）**：`v5r-inventory-c.md §⑦-A` 判定的 ≈14 条会议命令 + 7 条变形 + 全部会议参数（含上下界与默认值）。**这是"支持 v5r 全部功能"的字面基线。**
- **基线 B（必须，= 用户点名但 v5r 只在设计文档里有的）**：群聊消息 `{id, 发言人, 时间, 回复目标}`、**管理员**、**发言次数限制（指定次数 / 不限）**、**禁言与否**；**私发信息**；**成员状态面板**（总目标 / 计划规划 / 正在执行的子任务）。
  - 证据：v5r 群聊**没有**管理员/配额/禁言字段（reader-c §④，全文件仅 :9596 一处注释）；这些只存在于 `MEETING-PLATFORM-SPEC #18/#19/#20/#21`、`B §2`、`K10 open_chat_quota/mute_list`、`PHILOSOPHY §3.8`。
  - **裁决：实现它们**（用户点名 = 需求；且"足够完善"要求如此）。
- **基线 C（应当，= 设计有、v5r 未实现的流程命令）**：`mute/unmute`、`recess/resume/extend/adjourn`、`agenda_set`、`roll_call/attendance`、`speak_order_set/speak_next`、`challenge/answer`、`material_submit`、`taskboard_open` 批准点、显式散会等 21 条。
  - **裁决**：以**框架原语 + pack 声明**落地；本轮/次轮未落地的，必须在 docs 里**具名登记为扩展点**（不允许静默缺失），并说明由哪一层补。
- **分层铁律**：能力进内核（通用原语：消息、信箱、面板、会议状态机），策略进 settings/pack（谁可发言、几次、何时禁言）。**v5r pack 只声明策略，不复制内核实现**。
- **一处更正**：reader-c 的 U-C3「`meetingKeepEvery` 无读取点」**不成立** —— `vibe-math-v5r.js:5842-5851` 在"每 N 件成果自动同步会议"处真实消费它。引用时按此更正。

## D-09 目标 6 的验收口径：主代理＝**两层**

- v5r 实测：**office（root）＝助手/外部接口**（不研究、不投票，`agent.cordis.yml:74-86`）；**academician＝所内领头人**（charter 入职冻结 `:3131-3361` ＋ staffPersona 前缀 `:3676-3679`）；**参数只能 office 改**（`withOffice` 拒 `V5_NOT_OFFICE`）；**无定时/自动汇报机制**（只有人设文字 + Progress/ + 院士主动 overview）。
- **裁决**：目标 6 要的"真的是助手 + 自动汇报 + 可配置参数 + 人设提示词装配"要**由框架提供原语**：① 可声明的汇报触发/周期/内容模板；② 主代理可改参数的工具面（含权限与拒绝具名）；③ 人设/提示词段的装配证据（真机可验，不是文档声称）。v5r pack 负责声明其助手人设与汇报策略。
- 验收证据必须是**真机装配证据**（提示词段确实进了 system prompt / 回合注入 + 参数入口确实可改并留痕），不接受"文档里写了"。

## D-05 修订：T0 进仓的登记口径

- **仓库级工具脚本**（`scripts/**`：`preflight.mjs`、`check-docs.mjs`、`release-check.mjs`、`clean-temp.mjs`、`update-doc-counts.mjs` …）**只登记 `package.json files[]`**，**不进** `installer.js` 的 `PRESETS.*.files`。
- 依据（实测）：`tests/audit-installer-policy.test.mjs:254` 的判据是 `pkg.files.filter(f => f.startsWith(p.src + '/'))` ⇒ installer 清单**只覆盖预设 src 目录下的文件**；两条审计（`audit-package-membership` / `audit-installer-policy`）在"只登记 files[]"下均绿。
- 因此 D-05 的"双登记"**只适用于预设内的文件**（`vibe-math-vmu/**` 等），不适用于仓库级脚本。vmu-verify 的 V4 做法**追认为正确**。

## D-10 数学契约门禁：**不许空过，也不许假红**

- 现状（vmu-verify 实测）：`tests/audit-math-computation-parity.mjs` 的最强断言默认指向**仓库外**不存在的 `<repo>/_oneoff/mc-P1-ready` ⇒ 在干净检出里**长期空过**；把 seam 指向真实资产后立刻暴露两处**真差异**：
  1. `vibe-math-vmu/math-computation.js` 与 canonical 快照**哈希不符**（canonical mtime 2026-10-03 **旧于**随包副本 2026-10-05）；
  2. `tool-schema.json` 的**失败码顺序**与模块不一致（同一 11 个码，`MATH_REFUSED`/`MATH_ENGINE_BAD_ARGV` 对调）。
- 裁决：
  - **(2) 立即修**：失败码**顺序无语义**，改为**集合比较**（不多、不少、不重），同时保留"每个码可达"的断言。**不得**用"忽略顺序"掩盖真实的增删。
  - **(1) 本轮只登记、Round 2 做真**：canonical 快照在**版本控制外**是不可接受的（干净 clone 无法复现，与 D-05 同病）。Round 2 把它**vendored 进仓**（作为 fixtures），并**重定义**为"语义级对照"（因为 Round 2 目标 5 会重构 `math-computation.js`；逐字节快照在重构后必然失效）。在此之前，门禁**保持具名 SKIP**（打印原因），并在 `docs/11` 与 `docs/14` 登记为**未决项**，不得写成"已核"。
  - **禁止**为了让门禁变绿而放宽成"存在即通过"。

## D-11 收尾顺序（Lead 独占）

全员停止写入后，按此顺序，且**只由 Lead**执行：
1. `node scripts/update-doc-counts.mjs`（写模式：README.md / README.en.md / docs/AUDIT-CHECKLIST.md）；
2. `node scripts/regen-all.mjs`（生成物与文档表）；
3. `node scripts/preflight.mjs`（T0；此时才是有意义的读数）；
4. `GATE_SCOPE=vmu node tests/run-tests.mjs`（T1）；
5. 全绿 ⇒ `git add` + `commit` + `push`；不绿 ⇒ 定点修，不提交。

## D-12 钩子真源：Round 1 收"字面量＋双向断言"，Round 2 收"完全派生"

- Round 1 已落：`kernel/bus.js:102-148` 立 `HOOK_REGISTRY`（41 条：名/时机/可否阻断/可否改写/作用域/失败语义/生产者/桥接+注册点），`DSH_HOOKS`/`BRIDGED_HOOKS`/`HOOK_PREFIXES` 由它派生（`bus.js:150,153,156`），并有 `hookRegistryProblems()`（含"桥接 ⊆ 可订阅"，`bus.js:167-190`）。
- **残留**：`VU_HOOKS`/`DEFAULT_FAILURE` 仍是字面量，靠"双向断言"绑定；4 处门禁**按源码文本解析**它们（`tests/audit-hook-coverage.mjs:31`、`tests/audit-doc-vs-code-tables.mjs:59`、`tests/audit-vmu-docs.test.mjs:416`、`scripts/generate-surface-index.mjs:39-41`）。
- **裁决**：Round 1 接受（有断言绑定、行为不变、证据留档）；**Round 2 必须收口**：`bus.js` 侧把 `VU_HOOKS` 改为从 `HOOK_REGISTRY` 派生，`vmu-verify` 同步把上述 4 处门禁改为读登记（导出面或生成物），**两侧同轮改**，否则会互相打红。改完"单一真源"才算成立。

## D-13 提示词管线的**活读**（K4 的另一半）

- 现象：`kernel/index.js:452` 已改为传 `settings: settingsView`（活视图），但 `kernel/prompt/index.js:83-100` 在**构造期**把六个设置值快照进闭包 ⇒ 运行期 `vibe_vmu_set` 改了这些键，管线仍用旧值（"热改"名存实亡）。
- **裁决**：Round 2 独立项，`vmu-pack` 负责 `kernel/prompt/**` 改为经 `settings.get()` 活读（构造期只允许缓存**结构性**派生，不允许缓存**值**），`vmu-core` 提供/确认 `settingsView` 的 `get()` 接缝语义；验收＝改键后同回合装配即生效，且有断言（不是"重新构造才生效"）。

## D-14 `kernel.usePack` legacy 路径：**删**（已授权 core）

- 裁决同 D-02 的"唯一实现"：无 `packApplier` 注入 ⇒ **具名拒**（`VMU_PACK_LOADER_UNAVAILABLE`），不保留会静默生效的 legacy 装载路径。
- `tests/vmu-kernel.test.mjs:113-128` 的 6 条 legacy 断言由 **vmu-core** 改写为"无注入 ⇒ 具名拒"（我已授权其编辑该文件；本轮该文件不在 vmu-verify 写范围）。vmu-pack 无需处理。

## D-15 耐久投影与 id 不可复用（Round 2 · 目标 1/3 交叉的核心缺口）

- **实测**：`store.js:32-50` 声明 12 个白名单键，**只有 `work`/`idempotency` 有写者**；`members/tasks/meetings/ballots/budget/phase/...` 零读写 ⇒ 重启即丢。且全内核**约 30 处** `let seq = 0` 铸 id、**从不恢复** ⇒ id 跨重启复用，违反 v5r 不变量 "names are immortal"。
- **裁决（分工，避免双写）**：
  1. `v5r-reader-a` 建 **`kernel/resume.js`**（投影/恢复引擎：`attachProjection`、journal 重放、`hydrate()`、`status().projection`）＋ **`kernel/ids.js`**（`mint(kind)`/`observeIds`，计数器随投影持久化、水合取 `max+1`）＋ 未水合具名（`VMU_RESUME_NO_ADAPTER` / `VMU_RESUME_PROJECTION_GAP`）。
  2. `v5r-reader-a` 另拥有 `kernel/tasks.js`、`kernel/members.js`、`kernel/budget.js`（加 `snapshot`/`restore` seam）。
  3. `v5r-reader-c` 给 `kernel/meeting.js|meetings.js|ballot.js|ballotbox.js|minutes.js` 加 `snapshot`/`restore` seam（接口形状以 reader-a 为准）。
  4. `vmu-core` 做**装配接线**（`kernel/index.js` 一行接入）与**模块侧 id 铸造点批量替换**。
- **硬要求**：① 重启后新铸 id 与既有 id 无一相同（可测）；② 计数器从投影恢复（可测）；③ 不可恢复/不宜持久的面**具名列出理由**；④ journal 重放必须声明代价，不可重放的命令**具名拒绝**而非静默丢。

## D-07 本轮并行纪律（避免互踩）

- **本轮禁跑**：`GATE_SCOPE=full` / `GATE_RELEASE=1` 全量、`scripts/regen-all.mjs`、`update-doc-counts --write`。这些由 Lead 在**全员停止写入后**统一跑（生成器会跨人写文档）。
- 单跑套件允许（≤1–2 min/次），但**任何全量扫描进行时不得新建/改名 `tests/*.mjs`**（docs/11 纪律 11）。
- **git 只由 Lead 操作**（commit / push）。队友不 commit、不 push、不切分支。
- 临时文件放 `D:\_tmp\**`（禁 C 盘）；不复用的用完即删。
